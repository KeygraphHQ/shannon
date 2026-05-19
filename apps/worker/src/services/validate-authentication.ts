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

import type { JsonSchemaOutputFormat } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { runClaudePrompt } from '../ai/claude-executor.js';
import type { AuditSession } from '../audit/index.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { AgentEndResult } from '../types/audit.js';
import type { DistributedConfig, ProviderConfig } from '../types/config.js';
import { ErrorCode } from '../types/errors.js';
import { err, ok, type Result } from '../types/result.js';
import { PentestError } from './error-handling.js';
import { loadPrompt } from './prompt-manager.js';

const FAILURE_POINTS = ['username_or_password', 'totp_secret', 'out_of_band'] as const;
type AuthFailurePoint = (typeof FAILURE_POINTS)[number];

function isAuthFailurePoint(v: unknown): v is AuthFailurePoint {
  return typeof v === 'string' && (FAILURE_POINTS as readonly string[]).includes(v);
}

// NOTE: SDK's AJV validator expects draft-07; Zod defaults to draft-2020-12,
// which causes the SDK to silently skip structured output.
const AuthValidationSchema = z.object({
  login_success: z.boolean(),
  failure_point: z.enum(FAILURE_POINTS).optional(),
  failure_detail: z
    .string()
    .max(250)
    .optional()
    .describe(
      'Free-form 1-2 sentence diagnostic of what the page showed (error messages, page state) when login failed. Required when login_success is false. Mask any sensitive values.',
    ),
});

type AuthValidationVerdict = z.infer<typeof AuthValidationSchema>;

const VALIDATION_SCHEMA: JsonSchemaOutputFormat = {
  type: 'json_schema',
  schema: z.toJSONSchema(AuthValidationSchema, { target: 'draft-07' }) as Record<string, unknown>,
};

const AGENT_NAME = 'validate-authentication';

export interface ValidateAuthInput {
  readonly distributedConfig: DistributedConfig;
  readonly repoPath: string;
  readonly webUrl: string;
  readonly logger: ActivityLogger;
  readonly auditSession: AuditSession;
  readonly attemptNumber: number;
  readonly apiKey?: string;
  readonly providerConfig?: ProviderConfig;
  readonly deliverablesSubdir?: string;
  readonly promptDir?: string;
  readonly pipelineTestingMode?: boolean;
}

export async function validateAuthentication(input: ValidateAuthInput): Promise<Result<void, PentestError>> {
  const {
    distributedConfig,
    repoPath,
    webUrl,
    logger,
    auditSession,
    attemptNumber,
    apiKey,
    providerConfig,
    deliverablesSubdir,
    promptDir,
    pipelineTestingMode,
  } = input;

  const authentication = distributedConfig.authentication;
  if (!authentication) {
    return ok(undefined);
  }

  logger.info('Validating authentication credentials with live browser...', {
    loginUrl: authentication.login_url,
    loginType: authentication.login_type,
  });

  const prompt = await loadPrompt(
    AGENT_NAME,
    { webUrl, repoPath },
    distributedConfig,
    pipelineTestingMode ?? false,
    logger,
    promptDir,
  );

  await auditSession.startAgent(AGENT_NAME, prompt, attemptNumber);
  const startTime = Date.now();

  const result = await runClaudePrompt(
    prompt,
    repoPath,
    '',
    'Authentication validation',
    AGENT_NAME,
    auditSession,
    logger,
    'medium',
    VALIDATION_SCHEMA,
    apiKey,
    deliverablesSubdir,
    providerConfig,
  );

  const classification = classifyResult(result, authentication);

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

function classifyResult(
  result: import('../ai/claude-executor.js').ClaudePromptResult,
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
