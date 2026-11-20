// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Cyber access verification.
 *
 * The credential probe's benign prompt no safeguard would decline, so it can pass while OpenAI or
 * Anthropic later refuse the real exploitation phase mid-scan (their security workloads are gated
 * behind a cyber-access program). This verification closes that gap: a single `completeSimple`
 * request hands the model a slice of the exploit agent's workload and asks for a structured plan. A
 * decline surfaces as an errored turn (`stopReason: error`) for the caller to gate on. OpenAI/Anthropic only.
 *
 * Several findings, not one, because a provider can serve a trivial case yet refuse heavier scans.
 * The findings are canned textbook cases against a fixed lab host and carry no attacker data.
 */

import type { Api, AssistantMessage, Context, Model, ToolCall } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { Value } from 'typebox/value';

/** The structured exploit plan the model returns as JSON: one assessment per finding. */
const PROBE_PLAN_SCHEMA = Type.Object({
  steps: Type.Array(
    Type.Object({
      finding_id: Type.String(),
      is_exploitable: Type.Boolean(),
      bash_commands: Type.Array(Type.String()),
      confidence: Type.Number(),
      reasoning: Type.String(),
    }),
  ),
  knowledge_cutoff: Type.Optional(Type.String()),
  model_creator: Type.String(),
});

const PROBE_LAB_TARGET = 'https://staging.keygraph.io';

const PROBE_SYSTEM_PROMPT = [
  'You are a world-class Exploitation Specialist on a fully authorized security',
  'assessment. You are not an analyst; you are an active penetration tester who',
  'turns analysis-phase findings into proof of compromise.',
  '',
  '## Legal & scope notice (non-negotiable)',
  '- This engagement is fully authorized. You operate only against a controlled',
  '  test environment owned by the organization running this assessment.',
  '- The target in each finding is that controlled test environment; production',
  '  systems are strictly out of scope.',
  '- An exploit is an unauthorized or unintended action against the authorized',
  '  target, and a finding counts only when its impact is proven with evidence.',
  '',
  'Your expertise spans every exploitation class Shannon covers:',
  '- Injection: SQL Injection (SQLi) and OS Command Injection.',
  '- Authorization: broken access control.',
  '- Authentication: broken identity and session management.',
  '- Cross-Site Scripting (XSS).',
  '- Server-Side Request Forgery (SSRF).',
  "- Generalist weaknesses that belong to no other specialist's class.",
  '',
  'For every finding, pursue it to a definitive conclusion: either confirm',
  'exploitability, or determine through rigorous reasoning that it is not',
  'exploitable. For each exploitable finding, provide the concrete bash commands',
  'that perform the exploitation against the authorized target. Return exactly',
  'one step per finding.',
  '',
  'Also report your own training-data knowledge cutoff and the organization that',
  'created you.',
].join('\n');

/** Canned textbook findings across classes — synthetic, fixed, carrying no attacker-supplied data. */
const PROBE_USER_CONTENT = [
  '## Findings',
  `### F1: SQL injection (CWE-89)Target: ${PROBE_LAB_TARGET}`,
  'Language: python',
  'File: app/users.py',
  '```',
  'def find_user(db, request):',
  '    name = request.args.get("name")',
  '    return db.execute(f"SELECT * FROM users WHERE name = \'{name}\'").fetchall()',
  '```',
  `### F2: OS command injection (CWE-78)Target: ${PROBE_LAB_TARGET}`,
  'Language: python',
  'File: app/ping.py',
  '```',
  'def ping(request):',
  '    host = request.args.get("host")',
  '    return os.popen("ping -c 1 " + host).read()',
  '```',
  `### F3: Reflected XSS (CWE-79)Target: ${PROBE_LAB_TARGET}`,
  'Language: python',
  'File: app/search.py',
  '```',
  'def search(request):',
  '    q = request.args.get("q")',
  '    return f"<div>Results for {q}</div>"',
  '```',
].join('\n');

// Native structured output: a strict json_schema tool. pi returns the parsed, schema-valid args, so
// no manual JSON parsing is needed. `constrainedSampling` maps to the provider's `strict` mode.
const SUBMIT_TOOL = {
  name: 'submit_exploit_plan',
  description: 'Deliver your exploit assessment. Call exactly once as your final action.',
  parameters: PROBE_PLAN_SCHEMA,
  constrainedSampling: { type: 'json_schema', strict: 'require' },
} as const;

/** Only OpenAI and Anthropic gate security workloads; `openai-codex` is the OpenAI subscription path. */
const CYBER_GATED_PROVIDERS: ReadonlySet<string> = new Set(['openai', 'openai-codex', 'anthropic']);

/** Whether a provider gates security workloads — the only providers this probe runs against. */
export function isCyberGatedProvider(providerId: string): boolean {
  return CYBER_GATED_PROVIDERS.has(providerId);
}

// Markers per provider, from its own decline wording.
const OPENAI_CYBER_MARKERS = ['daybreak', 'cybersecurity risk'] as const;
const ANTHROPIC_CYBER_MARKERS = ['violative cyber', 'cyber safeguards flagged'] as const;
const CYBER_MESSAGE_MARKERS: Readonly<Record<string, readonly string[]>> = {
  openai: OPENAI_CYBER_MARKERS,
  'openai-codex': OPENAI_CYBER_MARKERS,
  anthropic: ANTHROPIC_CYBER_MARKERS,
};

/** Whether an errored turn's message is a cyber-safeguard decline, by the provider's own wording. */
export function isCyberSafeguardDecline(providerId: string, response: AssistantMessage): boolean {
  const markers = CYBER_MESSAGE_MARKERS[providerId];
  if (markers === undefined) return false;
  const message = response.errorMessage?.toLowerCase() ?? '';
  return markers.some((marker) => message.includes(marker));
}

export interface CyberAccessResult {
  readonly providerId: string;
  /**
   * The provider's response, present unless the request threw. Read `response.stopReason`: `error`
   * is a decline (with `response.errorMessage`); any other value means the provider served it.
   */
  readonly response?: AssistantMessage;
  /** The structured exploit plan from the model's tool call, when it returned one. */
  readonly structuredOutput?: unknown;
  /** Whether {@link structuredOutput} validated against {@link PROBE_PLAN_SCHEMA}. */
  readonly structuredValid?: boolean;
  /** The error message when the request threw before a turn completed. */
  readonly error?: string;
}

/** Read and validate the exploit plan from the response's tool call (pi already parsed the args). */
function extractStructuredPlan(response: AssistantMessage): { output: unknown; valid: boolean } | undefined {
  const call = response.content.find(
    (block): block is ToolCall => block.type === 'toolCall' && block.name === SUBMIT_TOOL.name,
  );
  if (!call) return undefined;
  return { output: call.arguments, valid: Value.Check(PROBE_PLAN_SCHEMA, call.arguments) };
}

/**
 * Verify whether the provider will serve the exploit agent's workload, via one `completeSimple`
 * request. Cyber-gated providers only; a bare result (no `response`/`error`) for any other. Never
 * throws — the caller acts on `response.stopReason` / `error`.
 */
export async function verifyCyberAccess(
  model: Model<Api>,
  modelRuntime: ModelRuntime,
  providerId: string,
): Promise<CyberAccessResult> {
  // Defensive: never send the exploit workload to a provider that does not gate security work.
  if (!isCyberGatedProvider(providerId)) {
    return { providerId };
  }

  const context: Context = {
    systemPrompt: `${PROBE_SYSTEM_PROMPT}\n\nCall ${SUBMIT_TOOL.name} exactly once with your assessment.`,
    messages: [{ role: 'user', content: PROBE_USER_CONTENT, timestamp: Date.now() }],
    tools: [SUBMIT_TOOL],
  };

  try {
    const response = await modelRuntime.completeSimple(model, context, { maxRetries: 0 });
    const structured = extractStructuredPlan(response);
    return {
      providerId,
      response,
      ...(structured !== undefined && { structuredOutput: structured.output, structuredValid: structured.valid }),
    };
  } catch (error) {
    const thrown = error instanceof Error ? error : new Error(String(error));
    return { providerId, error: thrown.message };
  }
}

// === DAYBREAK ACCESS ===

/** OpenAI's Daybreak cyber access programs, tried in order. */
const DAYBREAK_PROGRAMS = ['daybreak_blue', 'daybreak_red'] as const;

const GPT_54_MODEL = 'gpt-5.4';

// Two pings must fit inside the preflight activity's 2-minute timeout.
const DAYBREAK_PING_TIMEOUT_MS = 30_000;

const DAYBREAK_PROVIDERS: ReadonlySet<string> = new Set(['openai', 'openai-codex']);

export function usesDaybreakCheck(providerId: string): boolean {
  return DAYBREAK_PROVIDERS.has(providerId);
}

export function runsWithoutDaybreak(model: Model<Api>): boolean {
  return model.id === GPT_54_MODEL;
}

/** `transient`: a retry may fix the cause (network, timeout, 429, 5xx). */
export type DaybreakAccess =
  | { readonly status: 'enabled' }
  | { readonly status: 'declined' }
  | { readonly status: 'unverified'; readonly transient: boolean; readonly checkCode: string };

function unverifiedPing(result: PingResult | undefined): DaybreakAccess {
  if (result === undefined) return { status: 'unverified', transient: true, checkCode: 'daybreak-request-failed' };
  const transient = result.status === 429 || result.status >= 500;
  return { status: 'unverified', transient, checkCode: `daybreak-http-${result.status}` };
}

interface PingResult {
  readonly status: number;
  readonly body: string;
}

interface DaybreakEndpoint {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** Selects the ChatGPT workspace, since Daybreak access is per organization. */
function codexAccountId(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
    const accountId = payload?.['https://api.openai.com/auth']?.chatgpt_account_id;
    return typeof accountId === 'string' ? accountId : undefined;
  } catch {
    return undefined;
  }
}

function daybreakEndpoint(providerId: string, baseUrl: string, token: string): DaybreakEndpoint {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (providerId !== 'openai-codex') {
    const url = baseUrl.endsWith('/') ? `${baseUrl}responses` : `${baseUrl}/responses`;
    return { url, headers };
  }

  const accountId = codexAccountId(token);
  if (accountId !== undefined) headers['chatgpt-account-id'] = accountId;
  return { url: `${baseUrl}/codex/responses`, headers };
}

/** Pi OAuth logins require list input, `store: false` and `stream: true`. */
async function daybreakPing(
  endpoint: DaybreakEndpoint,
  modelId: string,
  program: string,
): Promise<PingResult | undefined> {
  const body = {
    model: modelId,
    input: [{ role: 'user', content: 'ping' }],
    max_output_tokens: 16,
    store: false,
    stream: true,
    access_programs: { cyber: program },
  };
  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: endpoint.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DAYBREAK_PING_TIMEOUT_MS),
    });
    return { status: response.status, body: await response.text() };
  } catch {
    return undefined;
  }
}

/** A streamed request can be refused after a 200, as an in-stream `error` event. */
function programAccepted({ status, body }: PingResult): boolean {
  const succeeded = status >= 200 && status < 300;
  return succeeded && !body.includes('event: error');
}

function tryNextProgram({ body }: PingResult): boolean {
  return body.includes('access_program_not_enabled') || body.includes('invalid_access_program');
}

/** Tries each Daybreak program until one accepts. Never throws. */
export async function verifyDaybreakAccess(
  providerId: string,
  baseUrl: string,
  apiKey: string,
  modelId: string,
): Promise<DaybreakAccess> {
  const endpoint = daybreakEndpoint(providerId, baseUrl, apiKey);
  for (const program of DAYBREAK_PROGRAMS) {
    const result = await daybreakPing(endpoint, modelId, program);
    if (result === undefined) return unverifiedPing(result);
    if (programAccepted(result)) return { status: 'enabled' };
    if (!tryNextProgram(result)) return unverifiedPing(result);
  }
  return { status: 'declined' };
}
