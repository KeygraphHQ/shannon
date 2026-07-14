// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Authentication validation service.
 *
 * Drives a real browser via the playwright-cli skill to confirm
 * user-supplied credentials log in successfully, before the pentest
 * pipeline burns hours on broken auth.
 */

import { readFile, rm } from 'node:fs/promises';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { runPiPrompt } from '../ai/pi/pi-executor.js';
import type { CapturedSubmitTool } from '../ai/submit-tool.js';
import type { AuditSession } from '../audit/index.js';
import { authStateFile } from '../audit/utils.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { AgentEndResult } from '../types/audit.js';
import type { DistributedConfig } from '../types/config.js';
import { ErrorCode } from '../types/errors.js';
import { err, ok, type Result } from '../types/result.js';
import { PentestError } from './error-handling.js';
import { loadPrompt } from './prompt-manager.js';

const FAILURE_POINTS = ['username_or_password', 'totp_secret', 'out_of_band'] as const;
type AuthFailurePoint = (typeof FAILURE_POINTS)[number];

function isAuthFailurePoint(v: unknown): v is AuthFailurePoint {
  return typeof v === 'string' && (FAILURE_POINTS as readonly string[]).includes(v);
}

interface AuthValidationVerdict {
  login_success: boolean;
  failure_point?: AuthFailurePoint;
  failure_detail?: string;
}

/** Submit tool capturing the login verdict (pi has no JSON-schema output format). */
function createAuthSubmitTool(): CapturedSubmitTool {
  let captured: AuthValidationVerdict | undefined;
  return {
    tool: defineTool({
      name: 'submit_auth_result',
      label: 'Submit Auth Result',
      description: 'Report the login outcome. Call exactly once when the login attempt has concluded.',
      promptSnippet: 'submit_auth_result: record the authentication validation verdict',
      promptGuidelines: [
        'You MUST call submit_auth_result exactly once as your final action.',
        'Set login_success to true only after saving the authenticated browser session.',
      ],
      parameters: Type.Object({
        login_success: Type.Boolean(),
        failure_point: Type.Optional(
          Type.Union([Type.Literal('username_or_password'), Type.Literal('totp_secret'), Type.Literal('out_of_band')]),
        ),
        failure_detail: Type.Optional(
          Type.String({
            maxLength: 250,
            description:
              'Free-form 1-2 sentence diagnostic of what the page showed (error messages, page state) when login failed. Required when login_success is false. Mask any sensitive values.',
          }),
        ),
      }),
      execute: async (_toolCallId, params) => {
        captured = params as AuthValidationVerdict;
        return {
          content: [{ type: 'text' as const, text: 'Auth result recorded.' }],
          details: params,
          terminate: true,
        };
      },
    }),
    getCaptured: () => captured,
    directive:
      '\n\nYou MUST call the submit_auth_result tool exactly once as your final action ' +
      'to deliver the authentication verdict. Do not output JSON as text.',
  };
}

const AGENT_NAME = 'validate-authentication';

export interface ValidateAuthInput {
  readonly distributedConfig: DistributedConfig;
  readonly repoPath: string;
  readonly webUrl: string;
  readonly logger: ActivityLogger;
  readonly auditSession: AuditSession;
  readonly attemptNumber: number;
  readonly deliverablesSubdir?: string;
  readonly promptDir?: string;
  readonly pipelineTestingMode?: boolean;
  readonly cancellationSignal?: AbortSignal;
}

export async function validateAuthentication(input: ValidateAuthInput): Promise<Result<void, PentestError>> {
  const {
    distributedConfig,
    repoPath,
    webUrl,
    logger,
    auditSession,
    attemptNumber,
    deliverablesSubdir,
    promptDir,
    pipelineTestingMode,
    cancellationSignal,
  } = input;

  const authentication = distributedConfig.authentication;
  if (!authentication) {
    return ok(undefined);
  }

  logger.info('Validating authentication credentials with live browser...', {
    loginUrl: authentication.login_url,
    loginType: authentication.login_type,
  });

  const stateFile = authStateFile(auditSession.sessionMetadata);
  await rm(stateFile, { force: true });

  const prompt = await loadPrompt(
    AGENT_NAME,
    { webUrl, repoPath, AUTH_STATE_FILE: stateFile },
    distributedConfig,
    pipelineTestingMode ?? false,
    logger,
    promptDir,
  );

  await auditSession.startAgent(AGENT_NAME, prompt, attemptNumber);
  const startTime = Date.now();

  const submitTool = createAuthSubmitTool();
  const result = await runPiPrompt(
    prompt,
    repoPath,
    '',
    'Authentication validation',
    AGENT_NAME,
    auditSession,
    logger,
    'medium',
    undefined, // callerTools
    deliverablesSubdir,
    cancellationSignal,
    submitTool,
  );

  let classification = classifyResult(result, authentication);

  if (classification.ok) {
    const sessionCheck = await verifySavedAuthState(stateFile, logger);
    if (!sessionCheck.ok) {
      classification = sessionCheck;
    }
  }

  const endResult: AgentEndResult = {
    attemptNumber,
    duration_ms: Date.now() - startTime,
    cost_usd: result.cost || 0,
    success: classification.ok,
    ...(result.model !== undefined && { model: result.model }),
    ...(!classification.ok && { error: classification.error.message }),
  };
  await auditSession.endAgent(AGENT_NAME, endResult);

  return classification;
}

async function verifySavedAuthState(stateFile: string, logger: ActivityLogger): Promise<Result<void, PentestError>> {
  let contents: string;
  try {
    contents = await readFile(stateFile, 'utf8');
  } catch {
    return err(
      new PentestError(
        `Preflight reported login success but did not save the authenticated session to ${stateFile}.`,
        'validation',
        true,
        { stateFile },
        ErrorCode.AGENT_EXECUTION_FAILED,
      ),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (parseErr) {
    const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
    return err(
      new PentestError(
        `Preflight saved an authenticated session to ${stateFile}, but the file is not valid JSON: ${detail}`,
        'validation',
        true,
        { stateFile, parseError: detail },
        ErrorCode.AGENT_EXECUTION_FAILED,
      ),
    );
  }

  const cookieCount = countStorageEntries(parsed, 'cookies');
  const originCount = countStorageEntries(parsed, 'origins');
  if (cookieCount === 0 && originCount === 0) {
    return err(
      new PentestError(
        `Preflight saved an authenticated session to ${stateFile}, but it contains no cookies or origins — the browser was not actually logged in.`,
        'validation',
        true,
        { stateFile, cookieCount, originCount },
        ErrorCode.AGENT_EXECUTION_FAILED,
      ),
    );
  }

  logger.info('Preflight authenticated session saved', { stateFile, cookieCount, originCount });
  return ok(undefined);
}

function countStorageEntries(parsed: unknown, key: 'cookies' | 'origins'): number {
  if (typeof parsed !== 'object' || parsed === null) return 0;
  const value = (parsed as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : 0;
}

function classifyResult(
  result: import('../ai/pi/pi-executor.js').PiPromptResult,
  authentication: NonNullable<DistributedConfig['authentication']>,
): Result<void, PentestError> {
  if (!result.success) {
    const detail = result.error ?? 'Validator agent terminated unexpectedly.';
    return err(
      new PentestError(
        `Authentication validator failed to run: ${detail}`,
        'validation',
        result.retryable ?? true,
        { originalError: detail, errorType: result.errorType, cost: result.cost },
        ErrorCode.AGENT_EXECUTION_FAILED,
      ),
    );
  }

  if (!result.structuredOutput || typeof result.structuredOutput !== 'object') {
    return err(
      new PentestError(
        'Authentication validator did not return a structured verdict.',
        'validation',
        true,
        { cost: result.cost },
        ErrorCode.AGENT_EXECUTION_FAILED,
      ),
    );
  }

  const verdict = result.structuredOutput as Partial<AuthValidationVerdict>;

  if (verdict.login_success === true) {
    return ok(undefined);
  }

  const failurePoint: AuthFailurePoint = isAuthFailurePoint(verdict.failure_point)
    ? verdict.failure_point
    : 'out_of_band';
  const failureDetail =
    verdict.failure_detail?.trim() || 'Login failed without a specific diagnostic from the validator agent.';

  return err(
    new PentestError(
      `Authentication failed at "${failurePoint}": ${failureDetail}`,
      'config',
      false,
      {
        failurePoint,
        failureDetail,
        loginUrl: authentication.login_url,
        loginType: authentication.login_type,
        cost: result.cost,
      },
      ErrorCode.AUTH_LOGIN_FAILED,
    ),
  );
}
