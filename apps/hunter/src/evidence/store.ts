/**
 * Normalized evidence store.
 *
 * Evidence is append-only: once collected for a finding it is never
 * mutated, only read. Storage is a JSON Lines file per engagement
 * (`<workspaceDir>/engagements/<id>/evidence.jsonl`) so evidence can be
 * inspected line-by-line and never silently overwritten.
 */

import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type AuthorizationComparisonEvidence,
  type BeforeAfterEvidence,
  type EvidenceEntry,
  err,
  type ObservationSource,
  ok,
  type RedactedHttpExchange,
  type Result,
  type StateTransitionEvidence,
} from '../types.js';

export function evidenceFilePath(workspaceDir: string, engagementId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'evidence.jsonl');
}

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
]);

/** Replaces sensitive header values with a fixed marker. Never logs or persists the original value. */
export function redactHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) ? '[redacted]' : value;
  }
  return redacted;
}

/** Builds a redacted HTTP exchange for evidence, stripping credential-bearing headers before it is ever stored. */
export function buildRedactedHttpExchange(input: {
  readonly method: string;
  readonly url: string;
  readonly statusCode?: number;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly responseHeaders?: Readonly<Record<string, string>>;
  readonly bodyExcerpt?: string;
}): RedactedHttpExchange {
  return {
    method: input.method,
    url: input.url,
    statusCode: input.statusCode,
    requestHeaders: redactHeaders(input.requestHeaders ?? {}),
    responseHeaders: redactHeaders(input.responseHeaders ?? {}),
    bodyExcerpt: input.bodyExcerpt !== undefined ? input.bodyExcerpt.slice(0, 2000) : undefined,
  };
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface NewEvidenceInput {
  readonly engagementId: string;
  readonly findingId: string;
  readonly source: ObservationSource;
  readonly description: string;
  readonly httpExchange?: RedactedHttpExchange;
  readonly contentForHash?: string;
  readonly stateTransition?: StateTransitionEvidence;
  readonly beforeAfter?: BeforeAfterEvidence;
  readonly authorizationComparison?: AuthorizationComparisonEvidence;
}

export function createEvidenceEntry(input: NewEvidenceInput): EvidenceEntry {
  return {
    id: `ev-${randomUUID()}`,
    engagementId: input.engagementId,
    findingId: input.findingId,
    source: input.source,
    description: input.description,
    redacted: true,
    httpExchange: input.httpExchange,
    contentHash: input.contentForHash !== undefined ? contentHash(input.contentForHash) : undefined,
    collectedAt: new Date().toISOString(),
    ...(input.stateTransition !== undefined ? { stateTransition: input.stateTransition } : {}),
    ...(input.beforeAfter !== undefined ? { beforeAfter: input.beforeAfter } : {}),
    ...(input.authorizationComparison !== undefined ? { authorizationComparison: input.authorizationComparison } : {}),
  };
}

/** Builds before/after content evidence, hashing both sides — never storing raw content, consistent with `contentHash` above. */
export function buildBeforeAfterEvidence(input: {
  readonly beforeDescription: string;
  readonly afterDescription: string;
  readonly beforeContent?: string;
  readonly afterContent?: string;
}): BeforeAfterEvidence {
  return {
    beforeDescription: input.beforeDescription,
    afterDescription: input.afterDescription,
    beforeHash: input.beforeContent !== undefined ? contentHash(input.beforeContent) : undefined,
    afterHash: input.afterContent !== undefined ? contentHash(input.afterContent) : undefined,
  };
}

export async function appendEvidence(workspaceDir: string, entry: EvidenceEntry): Promise<void> {
  const filePath = evidenceFilePath(workspaceDir, entry.engagementId);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
}

export async function listEvidence(
  workspaceDir: string,
  engagementId: string,
): Promise<Result<readonly EvidenceEntry[], string>> {
  const filePath = evidenceFilePath(workspaceDir, engagementId);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok([]);
    }
    return err(`could not read evidence file "${filePath}": ${(error as Error).message}`);
  }

  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const entries: EvidenceEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as EvidenceEntry);
    } catch (error) {
      return err(`evidence file "${filePath}" contains an invalid line: ${(error as Error).message}`);
    }
  }
  return ok(entries);
}

export async function listEvidenceForFinding(
  workspaceDir: string,
  engagementId: string,
  findingId: string,
): Promise<Result<readonly EvidenceEntry[], string>> {
  const all = await listEvidence(workspaceDir, engagementId);
  if (!all.ok) {
    return all;
  }
  return ok(all.value.filter((entry) => entry.findingId === findingId));
}
