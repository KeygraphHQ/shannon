/** Strict per-class SAST enrichment through the shared one-shot generation port. */

import { WORKSPACES_DIR } from '../../paths.js';
import { loadPrompt } from '../../services/prompt-manager.js';
import type { ActivityLogger } from '../../types/activity-logger.js';
import type { ReconciliationClass } from '../../types/reconciliation.js';
import type { SarifRef } from '../sast/types.js';
import type { StructuredGenerationPort } from '../structured-generation.js';
import { ArtifactIntegrityError, ReconciliationError, ReconciliationIoError, writeArtifact } from './artifact-store.js';
import type { ReconciliationObservation } from './contracts.js';
import { extractContext } from './sast/context-extractor.js';
import { CWE_TO_CATEGORY, unmappedMapping, vulnerabilityClassToCategory } from './sast/cwe-mapper.js';
import { runSastEnrichmentBatch, type SastEnrichmentBatchOutcome } from './sast/enrichment/batch.js';
import { buildSastObservation, mintSastProducerId, sourceLocationFromContext } from './sast/enrichment/policy.js';
import { enrichmentPromptName } from './sast/enrichment/schema.js';
import {
  EnrichmentAttemptError,
  pairEnrichedVulnerabilities,
  type ValidationResult,
} from './sast/enrichment/validate.js';
import { readPinnedSarif, SarifIntakeError } from './sast/intake.js';
import { parseSarifContent, SarifDocumentError } from './sast/sarif-parser.js';
import type { ClassifiedFinding, DroppedSarifFinding, ParsedSarif, ParsedSarifFinding } from './sast/types.js';
import type {
  EnrichSuccess,
  StageMetrics,
  SupplementalDropCounts,
  SupplementalDroppedFinding,
  SupplementalObservationsBody,
} from './stage-contracts.js';

const ENRICHMENT_MAX_TOKENS = 32768;

export interface EnrichClassSastObservationsInput {
  sessionId: string;
  vulnerabilityClass: ReconciliationClass;
  sarif?: SarifRef;
}

export interface EnrichClassSastObservationsDeps<TModelContext> {
  generation: StructuredGenerationPort<TModelContext>;
  modelContextFor: (input: EnrichClassSastObservationsInput) => TModelContext;
  workspacesDir?: string;
  signalFor?: () => AbortSignal | undefined;
  promptLoader?: (vulnerabilityClass: ReconciliationClass) => Promise<string>;
  onMetrics?: (metrics: StageMetrics) => void;
  logger?: ActivityLogger;
}

export class SastEnrichmentInputError extends ReconciliationError {
  constructor(message: string) {
    super(message, false, 'SastEnrichmentInputError');
  }
}

export class SastEnrichmentModelError extends ReconciliationError {
  readonly metrics: StageMetrics;

  constructor(message: string, metrics: StageMetrics, retryable = true) {
    super(message, retryable, 'SastEnrichmentModelError');
    this.metrics = metrics;
  }
}

/** Cancellation marker translated into Temporal cancellation by the activity wrapper. */
export class SastEnrichmentCancelledError extends Error {
  constructor() {
    super('SAST enrichment was cancelled');
    this.name = 'AbortError';
  }
}

const NOOP_LOGGER: ActivityLogger = {
  info() {},
  warn() {},
  error() {},
};

function zeroDrops(): SupplementalDropCounts {
  return {
    unknown_cwe: 0,
    other_category: 0,
    malformed: 0,
    orphaned: 0,
    duplicate_sast_id: 0,
    enrichment_dropped: 0,
  };
}

function zeroMetrics(): StageMetrics {
  return { costUsd: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0 };
}

interface SupplementalCounts {
  sarif_findings: number;
  sarif_dropped: number;
  sent: number;
  returned: number;
  accepted: number;
}

function emptySupplementalCounts(): SupplementalCounts {
  return { sarif_findings: 0, sarif_dropped: 0, sent: 0, returned: 0, accepted: 0 };
}

/**
 * Names every finding that was sent for enrichment and did not come back paired.
 *
 * A count alone cannot say what was lost. Identity is recovered from the sent side by set
 * difference rather than from the response, because a malformed response may carry no usable
 * id at all — which is exactly what made it malformed.
 */
export function computeDroppedFindings(
  findingsById: ReadonlyMap<number, ClassifiedFinding>,
  paired: readonly { sastId: number }[],
  vulnerabilityClass: ReconciliationClass,
): SupplementalDroppedFinding[] {
  const pairedSastIds = new Set(paired.map(({ sastId }) => sastId));
  const dropped = [...findingsById.entries()]
    .filter(([sastId]) => !pairedSastIds.has(sastId))
    .sort(([first], [second]) => first - second)
    .map(([sastId, finding]) => ({
      producer_id: mintSastProducerId(vulnerabilityClass, sastId),
      sast_id: sastId,
      sast_source_location: sourceLocationFromContext(finding.context),
    }));
  // Every sent finding is either accepted or named as dropped. A shortfall means the validator
  // paired an id that was never sent, or paired one twice, which is an integrity fault rather
  // than model output to accept.
  if (dropped.length + paired.length !== findingsById.size) {
    throw new ArtifactIntegrityError('SAST enrichment dropped-identity accounting failed');
  }
  return dropped;
}

async function writeSupplemental(
  input: EnrichClassSastObservationsInput,
  workspacesDir: string,
  observations: ReconciliationObservation[],
  drops: SupplementalDropCounts,
  droppedFindings: SupplementalDroppedFinding[],
  counts: SupplementalCounts,
  metrics: StageMetrics,
): Promise<EnrichSuccess> {
  const body: SupplementalObservationsBody = {
    observations,
    provenance: [],
    ...(input.sarif !== undefined && { sarif: input.sarif }),
    drops,
    dropped_findings: droppedFindings,
  };
  const ref = await writeArtifact({
    sessionId: input.sessionId,
    workspacesDir,
    artifactKind: 'supplemental-observations',
    vulnerabilityClass: input.vulnerabilityClass,
    body,
    inputs: [],
    counts: { observations: observations.length, ...counts, ...drops },
  });
  return { ref, metrics };
}

function droppedFindingBelongsToClass(finding: DroppedSarifFinding, vulnerabilityClass: ReconciliationClass): boolean {
  const mapping =
    finding.ruleId === undefined
      ? unmappedMapping('malformed')
      : (CWE_TO_CATEGORY[finding.ruleId] ?? unmappedMapping(finding.ruleId));
  return mapping.category === vulnerabilityClassToCategory(vulnerabilityClass);
}

function classifyFindings(
  findings: readonly ParsedSarifFinding[],
  vulnerabilityClass: ReconciliationClass,
  drops: SupplementalDropCounts,
): ClassifiedFinding[] {
  const target = vulnerabilityClassToCategory(vulnerabilityClass);
  const classified: ClassifiedFinding[] = [];
  for (const finding of findings) {
    const known = CWE_TO_CATEGORY[finding.result.ruleId];
    const mapping = known ?? unmappedMapping(finding.result.ruleId);
    if (mapping.category !== target) {
      drops.other_category++;
      continue;
    }
    if (known === undefined) drops.unknown_cwe++;
    classified.push({ context: extractContext(finding.result), mapping, phase: finding.phase });
  }
  return classified;
}

async function defaultPromptLoader(vulnerabilityClass: ReconciliationClass, logger: ActivityLogger): Promise<string> {
  return loadPrompt(
    enrichmentPromptName(vulnerabilityClass),
    {
      webUrl: 'https://not-applicable.invalid',
      repoPath: '/repo',
      AUTH_STATE_FILE: '/tmp/auth-state.json',
    },
    null,
    false,
    logger,
  );
}

function isCancellation(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted !== true) return false;

  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 8 && current !== undefined && current !== null && !seen.has(current); depth++) {
    if (current === signal.reason) return true;
    seen.add(current);
    const errorName = current instanceof Error ? current.name : undefined;
    if (errorName === 'AbortError' || errorName === 'CancelledFailure') return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

function isRetryableFileSystemError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (
    code !== undefined &&
    ['EACCES', 'EAGAIN', 'EBUSY', 'EIO', 'EMFILE', 'ENFILE', 'ENOMEM', 'ENOSPC', 'EPERM', 'EROFS', 'ESTALE'].includes(
      code,
    )
  ) {
    return true;
  }
  return /\b(?:EACCES|EAGAIN|EBUSY|EIO|EMFILE|ENFILE|ENOMEM|ENOSPC|EPERM|EROFS|ESTALE)\b/u.test(error.message);
}

function metricsFailure(
  onMetrics: ((metrics: StageMetrics) => void) | undefined,
  metrics: StageMetrics,
): ReconciliationIoError | undefined {
  try {
    onMetrics?.({ ...metrics });
    return undefined;
  } catch {
    return new ReconciliationIoError('Unable to record SAST enrichment usage');
  }
}

/** Build the pure stage with explicit model, cancellation, metrics, and logging bindings. */
export function createEnrichClassSastObservations<TModelContext>(
  deps: EnrichClassSastObservationsDeps<TModelContext>,
): (input: EnrichClassSastObservationsInput) => Promise<EnrichSuccess> {
  return async function enrichClassSastObservations(input: EnrichClassSastObservationsInput): Promise<EnrichSuccess> {
    const logger = deps.logger ?? NOOP_LOGGER;
    const workspacesDir = deps.workspacesDir ?? WORKSPACES_DIR;
    const drops = zeroDrops();

    // 1. Absence is a successful, exact empty artifact and never resolves a model.
    if (input.sarif === undefined) {
      return writeSupplemental(input, workspacesDir, [], drops, [], emptySupplementalCounts(), zeroMetrics());
    }

    // 2. The reference is contained and rehashed before any JSON parsing.
    let bytes: Buffer;
    try {
      bytes = await readPinnedSarif(input.sessionId, input.sarif, workspacesDir);
    } catch (error) {
      if (error instanceof SarifIntakeError) {
        if (error.kind === 'io') {
          throw new ReconciliationIoError('Unable to read the pinned SARIF input');
        }
        throw new SastEnrichmentInputError(error.message);
      }
      throw error;
    }

    // 3. Run/document violations fail the class. Per-finding violations drop only that finding.
    let parsed: ParsedSarif;
    try {
      parsed = parseSarifContent(bytes.toString('utf8'));
    } catch (error) {
      if (error instanceof SarifDocumentError) throw new SastEnrichmentInputError(error.message);
      throw error;
    }
    const classDropped = parsed.droppedFindings.filter((finding) =>
      droppedFindingBelongsToClass(finding, input.vulnerabilityClass),
    ).length;
    drops.malformed = classDropped;
    const classified = classifyFindings(parsed.findings, input.vulnerabilityClass, drops);
    const counts: SupplementalCounts = {
      sarif_findings: classified.length,
      sarif_dropped: classDropped,
      sent: 0,
      returned: 0,
      accepted: 0,
    };

    // 4. A schema-valid empty current class batch is another zero-request path.
    if (classified.length === 0) {
      return writeSupplemental(input, workspacesDir, [], drops, [], counts, zeroMetrics());
    }

    const signal = deps.signalFor?.();
    if (signal?.aborted === true) throw new SastEnrichmentCancelledError();

    let prompt: string;
    try {
      prompt = deps.promptLoader
        ? await deps.promptLoader(input.vulnerabilityClass)
        : await defaultPromptLoader(input.vulnerabilityClass, logger);
    } catch (error) {
      if (isRetryableFileSystemError(error)) {
        throw new ReconciliationIoError('Unable to read the SAST enrichment prompt');
      }
      throw new SastEnrichmentInputError('SAST enrichment prompt is unavailable');
    }

    // `sastId` is a plain 0-based index into this batch, not a producer ID: the model only ever sees
    // this small integer (as `_sastId` below), never the eventual SAST-namespaced producer ID that
    // `mintSastProducerId` derives from it after a response comes back paired.
    const idAssigned = classified.map((finding, index) => ({ sastId: index, finding }));
    const findingsJson = JSON.stringify(
      idAssigned.map(({ sastId, finding }) => ({ _sastId: sastId, ...finding.context })),
      null,
      2,
    );
    const findingsById = new Map(idAssigned.map(({ sastId, finding }) => [sastId, finding]));
    const metrics = zeroMetrics();
    counts.sent = classified.length;

    // 5. One nonempty class batch makes exactly one billable request.
    let outcome: SastEnrichmentBatchOutcome;
    metrics.modelCalls = 1;
    try {
      outcome = await runSastEnrichmentBatch(deps.generation, deps.modelContextFor(input), {
        vulnerabilityClass: input.vulnerabilityClass,
        prompt,
        findingsJson,
        maxTokens: ENRICHMENT_MAX_TOKENS,
        ...(signal !== undefined && { signal }),
      });
    } catch (error) {
      if (isCancellation(error, signal)) throw new SastEnrichmentCancelledError();
      metricsFailure(deps.onMetrics, metrics);
      throw new SastEnrichmentModelError('SAST enrichment request failed', { ...metrics });
    }
    metrics.costUsd = outcome.usage.costUsd;
    metrics.inputTokens = outcome.usage.inputTokens;
    metrics.outputTokens = outcome.usage.outputTokens;
    // Record usage now so spend is captured even on a later abort or integrity failure, but hold any
    // ledger error and rethrow it only after the model-outcome and accounting checks below, so a
    // metrics-write fault never masks a real enrichment failure.
    const usageLedgerFailure = metricsFailure(deps.onMetrics, metrics);

    if (outcome.status === 'aborted') throw new SastEnrichmentCancelledError();
    if (outcome.status === 'failed') {
      throw new SastEnrichmentModelError(outcome.message, { ...metrics }, !outcome.terminal);
    }

    // 6. Pair by the code-owned id and account for every returned and sent element.
    let validated: ValidationResult;
    try {
      validated = pairEnrichedVulnerabilities(outcome.vulnerabilities, findingsById, input.vulnerabilityClass);
    } catch (error) {
      if (error instanceof EnrichmentAttemptError) {
        throw new SastEnrichmentModelError(error.message, { ...metrics });
      }
      throw error;
    }

    // Every returned element must land in exactly one bucket: paired, malformed, orphaned, or
    // duplicate. If the buckets do not sum to the returned count, the validator dropped or
    // double-counted something, which is an integrity fault rather than model output to accept.
    const { paired, counts: validationCounts } = validated;
    const accountedReturned =
      paired.length + validationCounts.malformed + validationCounts.orphaned + validationCounts.duplicate_sast_id;
    if (accountedReturned !== validationCounts.returned) {
      throw new ArtifactIntegrityError('SAST enrichment returned-output accounting failed');
    }
    if (paired.length > classified.length) {
      throw new ArtifactIntegrityError('SAST enrichment accepted more findings than were sent');
    }
    if (usageLedgerFailure !== undefined) throw usageLedgerFailure;

    drops.malformed += validationCounts.malformed;
    drops.orphaned = validationCounts.orphaned;
    drops.duplicate_sast_id = validationCounts.duplicate_sast_id;
    drops.enrichment_dropped = classified.length - paired.length;
    counts.returned = validationCounts.returned;
    counts.accepted = paired.length;

    const droppedFindings = computeDroppedFindings(findingsById, paired, input.vulnerabilityClass);

    const pairedInSarifOrder = [...paired].sort((first, second) => first.sastId - second.sastId);
    const observations = pairedInSarifOrder.map(({ finding, sastId, evidence }) =>
      buildSastObservation(mintSastProducerId(input.vulnerabilityClass, sastId), evidence, finding),
    );

    if (drops.enrichment_dropped > 0) {
      const droppedSummary = droppedFindings
        .map(
          ({ producer_id, sast_source_location }) =>
            `${producer_id} (${sast_source_location.rule_id} at ${sast_source_location.file}:${sast_source_location.line})`,
        )
        .join(', ');
      logger.warn(
        `Static-analysis enrichment: ${drops.enrichment_dropped} of ${counts.sent} findings could not be enriched and were used as-is: ${droppedSummary}.`,
      );
    }
    if (drops.unknown_cwe > 0) {
      logger.info(
        `Static-analysis enrichment: ${drops.unknown_cwe} findings had an unrecognised CWE and were grouped under "miscellaneous".`,
      );
    }
    return writeSupplemental(input, workspacesDir, observations, drops, droppedFindings, counts, metrics);
  };
}
