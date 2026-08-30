# Black-Box Burp Authorization Hunter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a source-hidden Shannon mode that coordinates recon, analysis, action, and independent verification workers over a shared evidence blackboard to find replay-verified authorization and workflow vulnerabilities in black-box web targets.

**Architecture:** Keep the existing white-box pipeline unchanged. Select a separate deterministic Temporal workflow for `--blackbox`; perform browser, Burp, model, and filesystem work only in activities. Store typed, revisioned evidence under the current run workspace. Let a planner propose bounded tasks, run independent recon and analysis concurrently, serialize target-changing actions, and publish only findings that a fresh verifier replay proves against the attacker-impact invariant.

**Tech Stack:** TypeScript, Node.js 22, Temporal, Pi coding-agent harness, Playwright CLI, Burp Suite MCP over SSE, `@modelcontextprotocol/sdk@1.29.0`, TypeBox, AJV, pnpm, and `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-30-blackbox-burp-authz-design.md`

## Global Constraints

- Do not alter white-box workflow order, prompts, defaults, mounts, output contracts, or agent tool access.
- Do not mount a target checkout, the repository collection, or sibling workspaces in black-box mode.
- Do not place raw HTTP messages, cookies, bearer tokens, or CSRF values in Temporal payloads, model prompts, normalized artifacts, or logs. Authentication bootstrap may give one worker only its currently leased identity's existing login instructions and credentials; never persist those values in the blackboard or artifacts.
- Do not add a generic multi-agent framework, scanner portfolio, budget tracker, broad report stage, or Burp configuration API to the product.
- Do not let model output create findings directly. Only deterministic merge and validation code may update the blackboard or publish a verifier-confirmed finding.
- Use Luna during implementation and local integration by setting `SHANNON_AI_MODEL=openai-codex:gpt-5.6-luna`; do not change the repository's default model.
- Keep raw traffic and the mutable blackboard under `/target/.shannon/blackbox/`, outside `.shannon/deliverables`, so checkpoint restoration cannot erase evidence.
- Do not inject the raw corpus or unrelated identity material into agent context or expose it through custom tools. Browser-driving roles still share the worker filesystem, mounted config, and identity-state tree because Playwright CLI requires `bash`; version 1 treats those model sessions as trusted workers and does not claim hostile-model filesystem or credential isolation. Separate per-agent containers are deferred unless capability evidence justifies their cost.
- Use one worker process per run in version 1. A process-local write mutex plus revision compare-and-swap is sufficient; do not add a database or distributed lock.
- Use fixed safety bounds only to prevent runaway workflows: at most 8 planning waves, 6 tasks per wave, and 1 verifier attempt per candidate. Reaching a bound marks the run `incomplete`, not `no_findings`.
- Run the smallest relevant test after each change. Before every task commit, run both affected package builds and all black-box tests created so far.

---

## Task 1: Add the mode-specific configuration contract

**Files:**

- Modify: `apps/worker/src/types/config.ts`
- Modify: `apps/worker/configs/config-schema.json`
- Modify: `apps/worker/src/config-parser.ts`
- Create: `apps/worker/test/blackbox-config.test.mjs`

- [ ] Write failing configuration tests.

Use `node:test` and import the compiled parser from `../dist/config-parser.js`. Cover these exact cases:

1. A black-box config with two unique identities parses.
2. Two to five identities are accepted; zero, one, and six are rejected.
3. Duplicate names and names outside `^[a-z][a-z0-9_-]{0,31}$` are rejected.
4. Empty roles and missing authentication blocks are rejected.
5. Black-box mode rejects singular `authentication`, `code_path` rules, `exploit: "false"`, and any vulnerability class except `authz`.
6. Omitted `vuln_classes` and `exploit` normalize to `['authz']` and `true`.
7. White-box mode rejects `identities` and still accepts an existing white-box fixture unchanged.

The public parser seam must be explicit:

```ts
export type ConfigMode = 'whitebox' | 'blackbox';

export interface BlackboxIdentity {
  readonly name: string;
  readonly role: string;
  readonly authentication: Authentication;
}

export interface Config {
  rules?: Rules;
  authentication?: Authentication;
  identities?: BlackboxIdentity[];
  description?: string;
  vuln_classes?: VulnClass[];
  exploit?: 'true' | 'false';
  report?: ReportConfig;
  rules_of_engagement?: string;
}

export interface BlackboxConfig extends Config {
  readonly identities: BlackboxIdentity[];
  readonly authentication?: never;
  readonly vuln_classes?: ['authz'];
  readonly exploit?: 'true';
}

export interface NormalizedBlackboxConfig {
  readonly identities: readonly BlackboxIdentity[];
  readonly rules: Rules;
  readonly description: string;
  readonly vulnClasses: readonly ['authz'];
  readonly exploit: true;
  readonly rulesOfEngagement: string;
}
```

Change the parser entry points without changing their default behavior:

```ts
export const parseConfig = async (
  configPath: string,
  mode: ConfigMode = 'whitebox',
): Promise<Config>;

export const parseConfigYAML = (
  yamlContent: string,
  mode: ConfigMode = 'whitebox',
): Config;

export function normalizeBlackboxConfig(config: Config): NormalizedBlackboxConfig;
```

The JSON schema may describe both `authentication` and `identities`. Add `identities` to the schema's existing admissible-steering condition so an identities-only black-box config reaches mode validation. Enforce mutually exclusive, mode-specific semantics after AJV validation so all existing callers continue to get white-box semantics by default. Apply the existing authentication security checks independently to every identity.

- [ ] Run the focused test and observe the intended failure before implementation.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-config.test.mjs
```

Expected initial result: imports or assertions fail because `blackbox` parsing and `identities` do not exist.

- [ ] Implement the types, schema entries, mode validation, identity security validation, and normalization.

- [ ] Run the focused test and worker build until both pass.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-config.test.mjs
```

- [ ] Commit the configuration contract.

```powershell
git add apps/worker/src/types/config.ts apps/worker/configs/config-schema.json apps/worker/src/config-parser.ts apps/worker/test/blackbox-config.test.mjs
git commit -m "feat: add blackbox identity configuration"
```

---

## Task 2: Add explicit CLI mode and source-hidden Docker construction

**Files:**

- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/help.ts`
- Modify: `apps/cli/src/commands/start.ts`
- Modify: `apps/cli/src/docker.ts`
- Modify: `apps/cli/src/env.ts`
- Create: `apps/cli/test/blackbox-cli.test.mjs`

- [ ] Extract testable argument seams and write failing CLI tests.

Export `parseStartArgs()` and a pure Docker argument builder. Keep `spawnWorker()` as the only process-spawning function:

```ts
export interface StartArgs {
  url: string;
  repo?: string;
  config?: string;
  workspace?: string;
  output?: string;
  blackbox: boolean;
  pipelineTesting: boolean;
  keepContainer: boolean;
  follow: boolean;
  version: string;
}

export interface WorkerOptions {
  readonly mode: 'whitebox' | 'blackbox';
  readonly version: string;
  readonly url: string;
  readonly repo?: { hostPath: string; containerPath: string };
  readonly targetRoot?: { hostPath: string; containerPath: '/target' };
  readonly workspacePath: string;
  readonly workspacesDir: string;
  readonly taskQueue: string;
  readonly containerName: string;
  readonly envFlags: string[];
  readonly config?: { hostPath: string; containerPath: string };
  readonly promptsDir?: string;
  readonly outputDir?: string;
  readonly workspace: string;
  readonly pipelineTesting?: boolean;
  readonly keepContainer?: boolean;
  readonly piAuthHostPath?: string;
}

export function buildWorkerDockerArgs(opts: WorkerOptions): string[];
```

Because `apps/cli/dist/index.mjs` is the package's single bundled entry, guard `main()` with a direct-execution check and re-export `buildWorkerDockerArgs()` from that entry. Make `parseStartArgs()` throw the existing `ArgError` for invalid input; let `main()` retain the existing user-facing `failUsage()` handling. This lets the test import pure seams without launching the CLI or Docker and preserves direct invocation behavior.

Test the returned argument vector, not a mocked shell string. Required assertions:

- `start --blackbox -u <url> -c <config>` succeeds without `--repo`.
- Black-box mode rejects `--repo` and a missing config. Task 1 owns vulnerability-class, exploit, and `code_path` config semantics.
- White-box mode still requires `--repo`.
- Black-box Docker arguments mount exactly the current run at `/app/workspaces/<workspace>` and the synthetic root at `/target`.
- The config mount preserves `resolveConfig()`'s `/app/configs/<name>` container path.
- No black-box mount source equals or contains the repository collection, another workspace, or the target source checkout.
- The worker command contains `--blackbox` and uses `/target` as its non-null internal `repoPath`.
- White-box Docker arguments are byte-for-byte equivalent to the existing mount and command behavior.

- [ ] Run the new CLI test and observe failure.

```powershell
pnpm --filter @keygraph/shannon build
node --test apps/cli/test/blackbox-cli.test.mjs
```

- [ ] Implement argument parsing and help text.

Use this admission rule in `parseStartArgs()`:

```ts
if (parsed.blackbox) {
  if (parsed.repo) fail('--repo is not allowed with --blackbox');
  if (!parsed.config) fail('--config is required with --blackbox');
} else if (!parsed.repo) {
  fail('--repo is required unless --blackbox is set');
}
```

Do not load target configuration inside the CLI to duplicate worker semantics. The CLI rejects contradictory CLI flags; the worker parses and validates the config before starting the workflow.

- [ ] Create the synthetic root and black-box run directories in `start.ts`.

For black-box mode, create these paths beneath the selected run only:

```text
<workspace>/.shannon/blackbox-target/
<workspace>/.shannon/blackbox-target/.shannon/blackbox/raw/
<workspace>/.shannon/blackbox-target/.shannon/deliverables/
<workspace>/.shannon/blackbox-target/.playwright/
```

Do not call `resolveRepo()` or pre-create overlays inside a repository for this mode. Pass `/target` as the worker's internal `repoPath`. Update `printInfo()` to show `Mode: black-box` and omit the repository line.

- [ ] Implement the two Docker mount branches.

The black-box branch must mount:

```text
<workspacePath>:/app/workspaces/<workspace>
<targetRoot>:/target
<config>:/app/configs/<name>:ro
<pi-auth-file>:/home/pwuser/.pi/agent/auth.json
```

It may also mount local Shannon prompts and an explicit output directory. It must not mount `workspacesDir`, a repository, or any sibling run. Preserve the current white-box branch without refactoring its argument order beyond extraction into `buildWorkerDockerArgs()`.

- [ ] Forward the three Burp variables only when present, using existing environment flag construction:

```text
SHANNON_BURP_MCP_URL
SHANNON_BURP_MCP_HOST_HEADER
SHANNON_BURP_PROXY_URL
```

Do not encode a listener mutation or Burp credential in CLI code.

- [ ] Run focused and regression checks.

```powershell
pnpm --filter @keygraph/shannon build
node --test apps/cli/test/blackbox-cli.test.mjs
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-config.test.mjs
```

- [ ] Commit the CLI boundary.

```powershell
git add apps/cli/src/index.ts apps/cli/src/help.ts apps/cli/src/commands/start.ts apps/cli/src/docker.ts apps/cli/src/env.ts apps/cli/test/blackbox-cli.test.mjs
git commit -m "feat: add source-hidden blackbox launch mode"
```

---

## Task 3: Implement the typed revisioned blackboard

**Files:**

- Create: `apps/worker/src/types/blackbox.ts`
- Modify: `apps/worker/src/types/index.ts`
- Create: `apps/worker/src/blackbox/blackboard.ts`
- Create: `apps/worker/test/blackbox-blackboard.test.mjs`

- [ ] Define the smallest evidence model that supports authorization comparisons, workflow state, planning, actions, and independent proof.

Use closed unions and references rather than narrative blobs:

```ts
export type BlackboxWorkerRole =
  | 'blackbox-recon'
  | 'blackbox-analysis'
  | 'blackbox-action'
  | 'blackbox-verifier';

export type BlackboxTaskKind = 'recon' | 'analysis' | 'action';
export type HypothesisStatus =
  | 'open'
  | 'queued'
  | 'tested'
  | 'verified'
  | 'disproved'
  | 'blocked'
  | 'no_demonstrated_impact';

export interface EvidenceRef {
  readonly id: string;
  readonly kind: 'exchange' | 'resource' | 'transition' | 'action' | 'proof';
}

export interface NormalizedExchange {
  readonly exchangeId: string;
  readonly routeSignature: string;
  readonly identity: string | 'anonymous';
  readonly captureSequence: number;
  readonly method: string;
  readonly origin: string;
  readonly path: string;
  readonly queryKeys: readonly string[];
  readonly bodyShape: string;
  readonly requestContentType: string | null;
  readonly responseStatus: number;
  readonly responseContentType: string | null;
  readonly responseFingerprint: string;
  readonly candidateObjectReferences: readonly string[];
  readonly rawRecordRef: string;
  readonly provenance: EvidenceProvenance;
}

export interface BlackboxHypothesis {
  readonly hypothesisId: string;
  readonly kind: 'horizontal' | 'vertical' | 'workflow';
  readonly summary: string;
  readonly preconditions: readonly string[];
  readonly attackerCapability: string;
  readonly evidence: readonly EvidenceRef[];
  readonly priority: 'high' | 'medium' | 'low';
  readonly status: HypothesisStatus;
  readonly provenance: EvidenceProvenance;
}

export interface BlackboxResource {
  readonly resourceId: string;
  readonly resourceType: string;
  readonly objectReferences: readonly string[];
  readonly ownerIdentity: string | null;
  readonly visibility: 'private' | 'role-scoped' | 'public' | 'unknown';
  readonly evidence: readonly EvidenceRef[];
  readonly provenance: EvidenceProvenance;
}

export interface WorkflowTransition {
  readonly transitionId: string;
  readonly identity: string | 'anonymous';
  readonly fromState: string;
  readonly toState: string;
  readonly triggerExchangeId: string;
  readonly captureSequence: number;
  readonly resourceId: string | null;
  readonly provenance: EvidenceProvenance;
}

export interface DeterministicProofObservation {
  readonly condition: ProofCondition;
  readonly passed: boolean;
  readonly observedMarkerDigest: string | null;
  readonly observedTransitionId: string | null;
  readonly verificationExchangeId: string | null;
}

export interface BlackboxActionResult {
  readonly actionId: string;
  readonly hypothesisId: string;
  readonly sequence: ReplaySequence;
  readonly status: 'completed' | 'needs_fresh_actor_request' | 'delivery_unknown' | 'failed';
  readonly exchangeIds: readonly string[];
  readonly observation: DeterministicProofObservation | null;
  readonly provenance: EvidenceProvenance;
}

export interface CandidateProof {
  readonly candidateId: string;
  readonly hypothesisId: string;
  readonly victimIdentity: string;
  readonly attackerIdentity: string | 'anonymous';
  readonly victimResourceId: string;
  readonly baselineExchangeId: string;
  readonly actionId: string;
  readonly verificationSourceExchangeId: string;
  readonly demonstratedAction: string;
  readonly concreteEffect: string;
  readonly affectedParty: 'customer' | 'application' | 'users';
  readonly preconditions: readonly string[];
  readonly provenance: EvidenceProvenance;
}

export interface VerificationResult {
  readonly verificationId: string;
  readonly candidateId: string;
  readonly verdict: 'verified' | 'disproved' | 'blocked';
  readonly freshStateRefs: readonly { readonly identity: string; readonly stateRef: string }[];
  readonly replayActionIds: readonly string[];
  readonly replayExchangeIds: readonly string[];
  readonly observation: DeterministicProofObservation | null;
  readonly failureReason: string | null;
}

export interface PlannerTask {
  readonly taskId: string;
  readonly kind: BlackboxTaskKind;
  readonly objective: string;
  readonly evidence: readonly EvidenceRef[];
  readonly identityLease: string | 'anonymous' | null;
  readonly hypothesisId: string | null;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'rejected';
}

export interface EvidenceProvenance {
  readonly actor: BlackboxWorkerRole | 'orchestrator';
  readonly taskId: string;
  readonly baseRevision: number;
}
```

`BlackboxDocument` must also contain the target origin, redacted identities and state references, resources, transitions, actions, candidate proofs, verifier results, task history, run status, and `revision`. Store no authentication secret.

The only worker write shape is a typed contribution:

```ts
export interface WorkerContribution {
  readonly taskId: string;
  readonly role: BlackboxWorkerRole;
  readonly baseRevision: number;
  readonly exchanges?: readonly NormalizedExchange[];
  readonly resources?: readonly BlackboxResource[];
  readonly transitions?: readonly WorkflowTransition[];
  readonly hypotheses?: readonly BlackboxHypothesis[];
  readonly actions?: readonly BlackboxActionResult[];
  readonly candidateProofs?: readonly CandidateProof[];
}

export interface TaskRegistrationBatch {
  readonly operationKey: string;
  readonly accepted: readonly PlannerTask[];
  readonly rejected: readonly { readonly task: PlannerTask; readonly reason: string }[];
}

export interface BlackboardStore {
  initialize(input: BlackboardInitialization): Promise<BlackboxSnapshot>;
  read(): Promise<BlackboxSnapshot>;
  merge(contribution: WorkerContribution): Promise<BlackboxSnapshot>;
  registerTasks(baseRevision: number, batch: TaskRegistrationBatch): Promise<BlackboxSnapshot>;
  startTasks(baseRevision: number, operationKey: string, taskIds: readonly string[]): Promise<BlackboxSnapshot>;
  settleTasks(batch: ContributionBatch): Promise<BlackboxSnapshot>;
  recordVerification(baseRevision: number, operationKey: string, result: VerificationResult): Promise<BlackboxSnapshot>;
  setRunStatus(baseRevision: number, operationKey: string, status: BlackboxRunStatus): Promise<BlackboxSnapshot>;
}
```

- [ ] Write failing blackboard tests.

Required cases:

- Initialization writes revision `0` atomically.
- A contribution at the current revision increments it once.
- A stale contribution throws `StaleBlackboardRevisionError` without changing the file.
- Unknown task, hypothesis, exchange, resource, action, and proof references are rejected.
- A worker cannot write a role-incompatible record; recon cannot submit proofs, analysis cannot submit action results, and action cannot verify itself.
- IDs are deterministic and duplicate IDs are idempotent only when the full record matches.
- Provenance is assigned from the orchestrator's task record, not trusted from model payloads.
- Concurrent in-process writes serialize and one stale writer is rejected.
- No serialized document contains configured passwords, cookies, bearer tokens, or CSRF values from the fixture.

- [ ] Run the focused test and observe failure.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-blackboard.test.mjs
```

- [ ] Implement `FileBlackboardStore` with the existing `atomicWrite()` helper and a module-local per-path promise mutex.

Write to `<repoPath>/.shannon/blackbox/blackboard.json`. Validate references and role permissions before entering the write section, then re-read and compare the revision inside the mutex before the atomic replacement. Never silently merge a stale contribution.

- [ ] Run the focused test, the config test, and worker build.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-config.test.mjs apps/worker/test/blackbox-blackboard.test.mjs
```

- [ ] Commit the blackboard.

```powershell
git add apps/worker/src/types/blackbox.ts apps/worker/src/types/index.ts apps/worker/src/blackbox/blackboard.ts apps/worker/test/blackbox-blackboard.test.mjs
git commit -m "feat: add revisioned blackbox evidence board"
```

---

## Task 4: Connect to Burp MCP and normalize captured traffic

**Files:**

- Modify: `apps/worker/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/worker/src/blackbox/burp-client.ts`
- Create: `apps/worker/src/blackbox/http-message.ts`
- Create: `apps/worker/src/blackbox/scope-guard.ts`
- Create: `apps/worker/src/blackbox/traffic-normalizer.ts`
- Create: `apps/worker/test/blackbox-burp-traffic.test.mjs`

- [ ] Add the already-resolved MCP SDK as a direct worker dependency.

Pin the version that is already present transitively. Do not upgrade other packages:

```json
"@modelcontextprotocol/sdk": "1.29.0"
```

Run `pnpm install --lockfile-only` from the repository root and inspect the lockfile diff. It should add the worker importer reference without selecting a different SDK version.

- [ ] Write failing parser, client-adapter, and normalizer tests with an injected fake MCP transport.

Use representative `get_proxy_http_history_regex` text content: one JSON object per line with `request`, `response`, and `notes`. Do not invent a Burp entry ID, timestamp, or cursor; this MCP does not return them.

Required cases:

- Parse HTTP/1.1 request and response start lines, duplicate headers, empty bodies, CRLF, and LF fixtures.
- Parse JSON-object lines, ignore only blank lines and Burp's exact end-of-items footer, and reject any other malformed line or a history item without a request.
- Page `get_proxy_http_history_regex` with an escaped target-host regex, `count: 100`, and increasing numeric `offset` until a page returns fewer than 100 parsed records.
- Extract text blocks from MCP results and reject error or non-text results.
- Filter history by the normalized configured origin after parsing the request target and `Host` header.
- Enforce configured URL, domain, subdomain, method, header, and parameter rules; an avoid match blocks, while focus rules are ORed within one rule type and ANDed across configured rule types.
- Compare before/after history as a multiset of SHA-256 raw-record hashes so a repeated identical request is still attributable.
- Write each new raw record to `.shannon/blackbox/raw/<exchange-id>.json` and expose only an opaque store reference.
- Redact `Cookie`, `Set-Cookie`, `Authorization`, proxy authorization, password fields, tokens, CSRF names/values, and configured credentials from normalized output.
- Generate stable exchange IDs, route signatures, body shapes, object-reference candidates, and bounded response fingerprints.
- Collapse only records with matching identity, request shape, and response behavior; preserve different status, fingerprint, or workflow order.

Use these boundaries:

```ts
export interface BurpMcpSettings {
  readonly url: string;
  readonly hostHeader: string;
}

export interface BurpToolClient {
  connect(): Promise<void>;
  call<T extends Record<string, unknown>>(
    name:
      | 'get_proxy_http_history_regex'
      | 'send_http1_request'
      | 'send_http2_request',
    arguments_: T,
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface RawHistoryRecord {
  readonly request: string;
  readonly response: string;
  readonly notes: string;
  readonly occurrence: number;
}

export interface HistorySnapshot {
  readonly orderedRecords: readonly RawHistoryRecord[];
  readonly occurrenceCounts: Readonly<Record<string, number>>;
}

export interface TrafficCaptureInput {
  readonly targetOrigin: string;
  readonly rules: Rules;
  readonly identity: string | 'anonymous';
  readonly before: HistorySnapshot;
  readonly after: HistorySnapshot;
  readonly rawDirectory: string;
  readonly configuredSecrets: readonly string[];
}
```

Implement the production connection with the official SSE client:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const scopedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('Host', settings.hostHeader);
  return fetch(input, { ...init, headers });
};

const transport = new SSEClientTransport(new URL(settings.url), {
  fetch: scopedFetch,
});
const client = new Client({ name: 'shannon-blackbox', version: '1' });
await client.connect(transport);
```

The adapter must verify the required Burp tool names after connecting and fail with the missing names. Burp MCP has no exact origin-filter parameter, so request the escaped target host through the regex history tool, parse the candidates, then enforce exact normalized-origin equality before persistence or exposure. It must not call the unfiltered history tool or expose project options, interception, Intruder, Organizer, or configuration tools.

- [ ] Run the focused test and observe failure.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-burp-traffic.test.mjs
```

- [ ] Implement raw HTTP parsing, the narrow MCP client, scope enforcement, history pagination, target filtering, multiset attribution, raw persistence, and normalization.

Derive IDs exactly as follows so tests and later replay agree:

```ts
const historyHash = sha256(`${raw.request}\0${raw.response}`);
const exchangeId = `ex_${sha256(`${identity}\0${sequence}\0${historyHash}`).slice(0, 24)}`;
const routeSignature = `route_${sha256(
  `${method}\0${origin}\0${normalizedPath}\0${sortedQueryKeys.join(',')}\0${bodyShape}`,
).slice(0, 24)}`;
```

Use the capture-relative sequence only after the multiset diff is calculated. Never log raw tool results.

- [ ] Run all worker tests created so far and inspect dependency diffs.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-config.test.mjs apps/worker/test/blackbox-blackboard.test.mjs apps/worker/test/blackbox-burp-traffic.test.mjs
git diff -- apps/worker/package.json pnpm-lock.yaml
```

- [ ] Commit Burp capture support.

```powershell
git add apps/worker/package.json pnpm-lock.yaml apps/worker/src/blackbox/burp-client.ts apps/worker/src/blackbox/http-message.ts apps/worker/src/blackbox/scope-guard.ts apps/worker/src/blackbox/traffic-normalizer.ts apps/worker/test/blackbox-burp-traffic.test.mjs
git commit -m "feat: import target traffic from burp mcp"
```

---

## Task 5: Implement identity-bound replay as a controlled capability

**Files:**

- Create: `apps/worker/src/blackbox/identity-state.ts`
- Create: `apps/worker/src/blackbox/replay-service.ts`
- Create: `apps/worker/test/blackbox-replay.test.mjs`

- [ ] Write failing replay tests around an injected `BurpToolClient`, raw-record store, and identity-state resolver.

The model may select a captured exchange, actor, bounded mutation, and proof condition. It may not supply cookies, bearer tokens, CSRF tokens, `Host`, `Origin`, or a destination origin.

Use a closed mutation union:

```ts
export type RequestMutation =
  | { readonly type: 'set_path'; readonly path: string }
  | { readonly type: 'set_query'; readonly name: string; readonly value: string }
  | { readonly type: 'remove_query'; readonly name: string }
  | { readonly type: 'set_header'; readonly name: string; readonly value: string }
  | { readonly type: 'remove_header'; readonly name: string }
  | { readonly type: 'set_form_field'; readonly name: string; readonly value: string }
  | { readonly type: 'set_json_pointer'; readonly pointer: string; readonly value: unknown };

export type ProofCondition =
  | { readonly type: 'body_contains'; readonly marker: string }
  | { readonly type: 'json_pointer_equals'; readonly pointer: string; readonly value: unknown }
  | { readonly type: 'persistent_state'; readonly verificationSourceExchangeId: string; readonly marker: string };

export interface ReplayCommand {
  readonly actionId: string;
  readonly steps: readonly ReplayStep[];
  readonly proofCondition: ProofCondition;
}

export interface ReplayStep {
  readonly stepId: string;
  readonly sourceExchangeId: string;
  readonly actor: string | 'anonymous';
  readonly mutations: readonly RequestMutation[];
}

export interface ReplaySequence {
  readonly actionId: string;
  readonly steps: readonly ReplayStep[];
  readonly proofCondition: ProofCondition;
}

export type ReplayOutcome =
  | {
      readonly status: 'completed';
      readonly exchanges: readonly NormalizedExchange[];
      readonly comparison: ResponseComparison;
      readonly observation: DeterministicProofObservation;
    }
  | { readonly status: 'needs_fresh_actor_request'; readonly stepId: string; readonly routeSignature: string }
  | { readonly status: 'delivery_unknown'; readonly reason: string };
```

Required cases:

- Load the source request by known exchange reference and reject fabricated references.
- Accept one to four ordered replay steps and preserve that order in raw and normalized evidence.
- Strip the victim's `Cookie`, `Authorization`, proxy authorization, and identity-bound CSRF values before actor substitution.
- For cookie auth, select matching non-expired cookies from the actor's Playwright storage-state file.
- For bearer or request-bound token auth, copy only from the latest captured request with the same route signature and actor.
- For identity-bound CSRF material, copy the equivalent actor's current header, query, form, or JSON field by name without exposing its value to the model.
- Return `needs_fresh_actor_request` if the actor has no equivalent token-bearing request.
- Use no authentication for `anonymous`.
- Apply one to eight declared mutations in order while preserving every other method, header, query entry, and body field.
- Reject `Cookie`, `Authorization`, `Proxy-Authorization`, `Host`, and `Origin` header mutations.
- Reject absolute paths, another origin, invalid JSON pointers, malformed bodies, and cross-origin redirects.
- Re-run `scope-guard.ts` after authentication replacement and mutations; reject any request blocked by configured avoid/focus rules.
- Call only `send_http1_request` or `send_http2_request` with the original target host, port, and TLS setting.
- Persist the exact request and response under the raw directory, then return a redacted normalized record.
- Evaluate the proof condition in service code against the returned body or recorded state transition and return `DeterministicProofObservation`; do not accept a model-supplied pass result.
- Treat a missing or malformed response as failure.
- If `<raw>/actions/<action-id>.json` already records completion, return it without sending again.
- If transport fails after dispatch, persist `delivery_unknown` and do not automatically retry a potentially state-changing request.
- Resolve authentication and request-bound tokens for every step before sending the first request. If any step needs a fresh actor request, return its step ID without partially executing the sequence. After dispatch begins, stop at the first failure and never resend completed steps.

- [ ] Run the test and observe failure.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-replay.test.mjs
```

- [ ] Implement identity-state lookup and replay.

Store only opaque state paths in the blackboard:

```text
.shannon/blackbox/identities/<identity>/storage-state.json
.shannon/blackbox/identities/<identity>/capture-index.json
```

Resolve and validate both paths inside the configured black-box root before reading. Do not allow model-supplied filesystem paths.

- [ ] Run the worker build and all current black-box worker tests.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-config.test.mjs apps/worker/test/blackbox-blackboard.test.mjs apps/worker/test/blackbox-burp-traffic.test.mjs apps/worker/test/blackbox-replay.test.mjs
```

- [ ] Commit the replay capability.

```powershell
git add apps/worker/src/blackbox/identity-state.ts apps/worker/src/blackbox/replay-service.ts apps/worker/test/blackbox-replay.test.mjs
git commit -m "feat: add identity-bound blackbox replay"
```

---

## Task 6: Add bounded worker roles, structured submissions, and real tool policies

**Files:**

- Modify: `apps/worker/src/ai/pi/pi-executor.ts`
- Create: `apps/worker/src/ai/sensitive-redaction.ts`
- Create: `apps/worker/src/blackbox/agents.ts`
- Create: `apps/worker/src/blackbox/agent-runner.ts`
- Create: `apps/worker/src/blackbox/tools.ts`
- Create: `apps/worker/prompts/blackbox-planner.txt`
- Create: `apps/worker/prompts/blackbox-recon.txt`
- Create: `apps/worker/prompts/blackbox-analysis.txt`
- Create: `apps/worker/prompts/blackbox-action.txt`
- Create: `apps/worker/prompts/blackbox-verifier.txt`
- Create: `apps/worker/test/blackbox-tool-policy.test.mjs`
- Create: `apps/worker/test/blackbox-agent-contracts.test.mjs`

- [ ] Write failing tests for the tool allowlists that reach the actual Pi session configuration seam.

Add an optional policy while preserving the current default exactly:

```ts
export interface PiToolPolicy {
  readonly builtinTools?: readonly ('read' | 'bash' | 'edit' | 'write' | 'grep' | 'find' | 'ls')[];
  readonly includeTask?: boolean;
  readonly includeTodo?: boolean;
  readonly includeGlob?: boolean;
  readonly includeBrowserSkill?: boolean;
}

export const DEFAULT_PI_TOOL_POLICY: Readonly<Required<PiToolPolicy>> = {
  builtinTools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
  includeTask: true,
  includeTodo: true,
  includeGlob: true,
  includeBrowserSkill: false,
};

export function resolvePiToolNames(
  policy: PiToolPolicy | undefined,
  customToolNames: readonly string[],
): readonly string[];
```

Add a generic optional telemetry boundary to `runPiPrompt()`:

```ts
export interface SensitiveTelemetryPolicy {
  readonly sensitiveValues: readonly string[];
  readonly redactAuthenticationSyntax: true;
}
```

When supplied, recursively redact exact configured values plus cookie, authorization, password, and CSRF syntax before audit logging, console formatting, and error-log prompt snippets. `BlackboxAgentRunner` must also pass a redacted prompt to `AuditSession.startAgent()`. Keep existing white-box telemetry behavior when the policy is absent. Test that a bootstrap password appearing in the prompt, bash arguments, assistant text, tool result, and thrown error never reaches captured logger/audit/error output.

`undefined` must continue to infer browser-skill access through `isBrowserAgent()` and expose the existing white-box built-ins plus task, todo, and glob. A supplied black-box policy is authoritative.

Assert these exact role surfaces:

| Role | Built-ins | Browser skill | Custom capabilities |
|---|---|---:|---|
| planner | none | no | `submit_planner_tasks` |
| recon | `bash` | yes | `read_target_history`, `submit_worker_contribution` |
| analysis | none | no | `submit_worker_contribution` |
| action | `bash` | yes | `replay_target_request`, `submit_worker_contribution` |
| verifier | `bash` | yes | `replay_verification_request`, `submit_verification` |

No black-box role receives `task`, `todo`, `glob`, `edit`, built-in file search, Burp project settings, interception controls, or a raw arbitrary-request tool. Browser roles retain `bash` because Playwright CLI requires it; this is an execution capability, not a hard command sandbox. Source isolation remains the Docker mount invariant. White-box names must resolve to their existing tool list.

Bind replay tools to their orchestrator-approved task when constructing them. `replay_target_request` may execute only that task's ordered replay steps and proof condition; its model input is the assigned action ID. Permit a second call only after the first returns `needs_fresh_actor_request`, and require the same command. `replay_verification_request` is similarly bound to the candidate's reproduction sequence and fresh verifier states. A mismatched ID or extra call fails without sending traffic.

- [ ] Define black-box agent contracts separately from `ALL_AGENTS` and `AGENTS`.

Do not add these roles to white-box execution order or resume accounting:

```ts
export type BlackboxAgentKind = 'planner' | BlackboxWorkerRole;

export interface BlackboxAgentDefinition {
  readonly kind: BlackboxAgentKind;
  readonly promptFile: string;
  readonly policy: PiToolPolicy;
  readonly submitTool: 'planner' | 'contribution' | 'verification';
}

export const BLACKBOX_AGENTS: Readonly<Record<BlackboxAgentKind, BlackboxAgentDefinition>>;
```

Create TypeBox submit schemas with `additionalProperties: false` for:

- `PlannerBatch`: base revision, zero to six typed tasks, evidence dependencies, optional identity lease, and stop decision.
- `WorkerContribution`: the task ID, base revision, and role-permitted records.
- `VerificationResult`: candidate ID, fresh-state references for every identity used, replay exchange references, proof checks, verdict, and concrete impact fields.

The submit tools capture schema-valid data in memory. They do not write the blackboard or send HTTP themselves.

- [ ] Implement `BlackboxAgentRunner` as a narrow wrapper over `runPiPrompt()`.

Do not route black-box workers through `AgentExecutionService`; its source-backed git checkpoint and white-box queue behavior are the wrong contract. The new runner receives an already-redacted evidence slice and role tools, loads one black-box prompt, calls Pi, and returns only the captured structured submission:

```ts
export interface BlackboxAgentRunInput {
  readonly kind: BlackboxAgentKind;
  readonly targetOrigin: string;
  readonly task: PlannerTask | null;
  readonly snapshot: RedactedBlackboxSlice;
  readonly identity: RedactedIdentityContext | null;
  readonly customTools: readonly ToolDefinition[];
  readonly auditSession: AuditSession;
  readonly logger: ActivityLogger;
  readonly cancellationSignal?: AbortSignal;
}

export class BlackboxAgentRunner {
  run(input: BlackboxAgentRunInput): Promise<PlannerBatch | WorkerContribution | VerificationResult>;
}

export interface BlackboxAgentFailure {
  readonly code: 'agent_failed' | 'missing_submission' | 'invalid_submission';
  readonly message: string;
  readonly retryable: boolean;
}
```

Build slices deterministically by role. The planner receives all normalized route signatures, identity roles, resources, ownership links, transitions, hypothesis states, action outcomes, and verifier failure reasons, but no raw bodies. Recon receives its task plus prior evidence for its leased workflow and identity. Analysis receives the route/identity pairs and linked resources named by its task. Action receives only its approved source exchange summary, actor, mutations, proof condition, and linked evidence. Verifier receives reproduction inputs and proof conditions only. Cap each response fingerprint and evidence excerpt before prompt construction; never truncate IDs or ownership relationships.

The runner must use the synthetic root as `cwd`, disable child tasks, and validate that exactly one submit call occurred. Authentication bootstrap may interpolate only the currently leased identity's login instructions and credentials; never include another identity's credentials, raw traffic, session tokens, or claimant conclusions.

The runner never returns `PiPromptResult`. On success it returns only the captured schema-valid submission. On failure it discards `PiPromptResult.prompt`, redacts `error`, `errorType`, assistant text, and structured tool failures through `SensitiveTelemetryPolicy`, then throws a `BlackboxAgentError` containing only `BlackboxAgentFailure`. Activity wrappers may return or persist that safe failure, but no prompt snippet, raw tool value, bash output, or unredacted model text may cross into Temporal history.

For verification, the activity creates new `bb-verify-<candidate>-<identity>` browser sessions and authenticates from login instructions instead of loading capture or action storage state. It supplies the verifier only reproduction inputs, proof conditions, redacted evidence, and the identities needed for setup. The verifier result records new opaque state references so deterministic validation can reject reused state.

- [ ] Write the prompts around role boundaries and the impact invariant.

All prompts must state:

```text
An observation is not a finding. A candidate is useful only if its replay can prove:
As an attacker, I could <demonstrated action>, causing <concrete effect> to <customer, application, or users>.
Submit only structured records supported by the supplied evidence IDs.
```

Additional prompt requirements:

- Planner: prioritize ownership/resource comparisons and workflow transitions; close exhausted information-only hypotheses as `no_demonstrated_impact`; never claim a finding.
- Recon: exercise one assigned workflow with one leased identity; identify resources, object IDs, owners, and state changes; do not propose arbitrary targets.
- Analysis: compare identities and route signatures; turn observations into falsifiable hypotheses; do not send requests.
- Action: perform only the assigned replay and proof condition; report observed outcomes, including failures, without severity language.
- Verifier: receive no candidate title, severity, confidence, or claimant verdict; recreate state and decide `verified`, `disproved`, or `blocked` from its own replay evidence.

- [ ] Run both focused tests and observe initial failure, then implement until they pass.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-tool-policy.test.mjs apps/worker/test/blackbox-agent-contracts.test.mjs
```

- [ ] Run all current worker black-box tests and the existing recon handoff test.

```powershell
pnpm --filter @shannon/worker build
pnpm --dir apps/worker exec node --test
```

- [ ] Commit the bounded agent surface.

```powershell
git add apps/worker/src/ai/pi/pi-executor.ts apps/worker/src/ai/sensitive-redaction.ts apps/worker/src/blackbox/agents.ts apps/worker/src/blackbox/agent-runner.ts apps/worker/src/blackbox/tools.ts apps/worker/prompts/blackbox-planner.txt apps/worker/prompts/blackbox-recon.txt apps/worker/prompts/blackbox-analysis.txt apps/worker/prompts/blackbox-action.txt apps/worker/prompts/blackbox-verifier.txt apps/worker/test/blackbox-tool-policy.test.mjs apps/worker/test/blackbox-agent-contracts.test.mjs
git commit -m "feat: add bounded blackbox worker roles"
```

---

## Task 7: Add black-box preflight, proxy-aware browser setup, and identity capture activities

**Files:**

- Modify: `apps/worker/src/ai/playwright-config-writer.ts`
- Create: `apps/worker/src/blackbox/activities.ts`
- Create: `apps/worker/test/blackbox-activities.test.mjs`
- Create: `apps/worker/test/blackbox-playwright-config.test.mjs`

- [ ] Write failing tests for proxy configuration and activity failure behavior.

Extend the writer through an options object while preserving the current output when no options are supplied:

```ts
export interface PlaywrightConfigOptions {
  readonly proxyUrl?: string;
  readonly ignoreHTTPSErrors?: boolean;
  readonly overwrite?: boolean;
}

export async function writePlaywrightStealthConfig(
  sourceDir: string,
  options: PlaywrightConfigOptions = {},
): Promise<{ result: StealthConfigWriteResult; configPath: string }>;
```

For black-box mode, write `launchOptions.proxy = { server: proxyUrl }` and `contextOptions.ignoreHTTPSErrors = true`. Reject proxy URLs whose scheme is not `http:` or whose hostname is empty. Continue to skip an existing config unless `overwrite: true`; only black-box setup may request overwrite because its synthetic root is run-owned.

Activity tests must use fake agent, Burp, browser-command, and blackboard dependencies. Cover:

- Missing `SHANNON_BURP_PROXY_URL` fails before any model starts.
- MCP URL defaults to `http://host.docker.internal:9876` and host header defaults to `127.0.0.1:9876` only in black-box mode.
- Missing required MCP tools fails preflight.
- A disposable proxied navigation must add at least one target-origin history occurrence; empty history fails.
- Every identity is bootstrapped sequentially, not with `Promise.all`.
- The implicit anonymous actor is explored first in a clean browser session and its traffic is attributed separately.
- Capture reads history immediately before and after one identity's login/exploration window and attributes only the multiset difference.
- Each identity uses a unique sanitized Playwright session and storage-state path.
- The configured success condition, storage-state file, and at least one attributed target exchange are all required.
- Fewer than two successful identities fails; one failed identity among three may continue only when two remain.
- No activity result contains credentials, cookies, authorization headers, CSRF values, or raw messages.

- [ ] Define activity inputs and results that are safe for Temporal history.

```ts
export interface BlackboxActivityInput {
  readonly webUrl: string;
  readonly repoPath: '/target' | string;
  readonly configPath: string;
  readonly workspace: string;
  readonly workflowId: string;
  readonly auditDir: string;
  readonly outputPath?: string;
  readonly promptDir?: string;
}

export interface BlackboxPreflightResult {
  readonly targetOrigin: string;
  readonly targetUrl: string;
  readonly blackboardPath: string;
  readonly revision: number;
  readonly identities: readonly {
    readonly name: string;
    readonly role: string;
    readonly stateRef: string;
  }[];
}

export interface IdentityCaptureResult {
  readonly identity: string;
  readonly authenticated: boolean;
  readonly successEvidence: string | null;
  readonly failureReason: string | null;
  readonly exchangeIds: readonly string[];
  readonly revision: number;
}
```

Functions that touch Burp, Playwright, config, files, models, or the blackboard live here or in called service modules, never in workflow code:

```ts
export async function preflightBlackbox(input: BlackboxActivityInput): Promise<BlackboxPreflightResult>;
export async function captureAnonymous(input: BlackboxActivityInput): Promise<IdentityCaptureResult>;
export async function captureIdentity(input: BlackboxActivityInput, identityName: string): Promise<IdentityCaptureResult>;
export async function readPlannerSnapshot(input: BlackboxActivityInput): Promise<RedactedBlackboxSlice>;
export async function runBlackboxPlanner(input: BlackboxActivityInput, revision: number): Promise<PlannerBatch>;
export async function runBlackboxRecon(input: BlackboxWorkerActivityInput): Promise<WorkerContribution>;
export async function runBlackboxAnalysis(input: BlackboxWorkerActivityInput): Promise<WorkerContribution>;
export async function runBlackboxAction(input: BlackboxWorkerActivityInput): Promise<WorkerContribution>;
export async function runBlackboxVerifier(input: BlackboxVerifierActivityInput): Promise<VerificationResult>;
```

Expose `createBlackboxActivities(dependencies)` for tests and export production wrappers with the activity names above. Dependencies include the Burp-client factory, blackboard-store factory, browser command runner, agent runner, environment reader, and filesystem adapter. Tests call the factory with fakes; Temporal registers only the production wrappers.

- [ ] Implement preflight in this exact order.

1. Parse the config with `mode: 'blackbox'` and normalize the target origin.
2. Resolve and validate the three Burp environment settings.
3. Connect to MCP and confirm the required history and send tools.
4. Write the proxy-aware Playwright config in the synthetic root.
5. Snapshot target-origin Burp history.
6. Run `playwright-cli -s=blackbox-preflight open <target-url>` through `execFile`, then close that session in `finally`.
7. Snapshot history again and require a new target-origin occurrence.
8. Initialize or resume the blackboard after validating the run scope, including deterministic pending tasks for anonymous and configured-identity bootstrap.

Use `execFile` arguments rather than a shell string. Never infer proxy success from browser exit status alone; the Burp history delta is authoritative.

- [ ] Implement anonymous capture and sequential identity bootstrap through `blackbox-recon`.

Capture the implicit anonymous actor first with session `bb-anonymous`, no login instructions, and no inherited storage state. Import its target-origin history delta under identity `anonymous`.

For each configured identity, the activity supplies only that identity's login instructions, the deterministic session name `bb-<identity>`, its storage-state destination, and a bounded bootstrap objective. The recon worker must save state with:

```text
playwright-cli -s=bb-<identity> state-save /target/.shannon/blackbox/identities/<identity>/storage-state.json
```

Each capture activity atomically marks its pre-registered bootstrap task running before model execution. After the worker returns, verify the state file and success-condition evidence, import the Burp history delta, settle the task as completed, and merge the normalized exchanges before starting the next identity. On authentication or expected browser failure, mark that task failed, release its lease, and return `authenticated: false` with a redacted reason so another configured identity may still satisfy the two-identity threshold. The raw before/after snapshots stay inside the activity process.

- [ ] Run focused tests and then all black-box worker tests.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-playwright-config.test.mjs apps/worker/test/blackbox-activities.test.mjs
pnpm --dir apps/worker exec node --test
```

- [ ] Commit the activity boundary.

```powershell
git add apps/worker/src/ai/playwright-config-writer.ts apps/worker/src/blackbox/activities.ts apps/worker/test/blackbox-activities.test.mjs apps/worker/test/blackbox-playwright-config.test.mjs
git commit -m "feat: capture isolated blackbox identities through burp"
```

---

## Task 8: Implement the deterministic orchestrator and planner loop

**Files:**

- Create: `apps/worker/src/blackbox/scheduler.ts`
- Modify: `apps/worker/src/blackbox/activities.ts`
- Modify: `apps/worker/src/blackbox/blackboard.ts`
- Create: `apps/worker/src/temporal/blackbox-workflow.ts`
- Modify: `apps/worker/src/temporal/workflows.ts`
- Create: `apps/worker/test/blackbox-scheduler.test.mjs`
- Modify: `apps/worker/test/blackbox-blackboard.test.mjs`
- Modify: `apps/worker/test/blackbox-activities.test.mjs`

- [ ] Write failing pure scheduler tests before Temporal wiring.

Keep task validation and wave construction outside Temporal-specific calls so they can be tested without a Temporal server:

```ts
export interface ScheduledWave {
  readonly concurrent: readonly PlannerTask[];
  readonly actions: readonly PlannerTask[];
  readonly rejected: readonly { taskId: string; reason: string }[];
}

export function validateAndScheduleWave(
  batch: PlannerBatch,
  snapshot: RedactedBlackboxSlice,
): ScheduledWave;

export function decideRunCompletion(input: {
  readonly wave: number;
  readonly plannerStop: boolean;
  readonly pendingTasks: number;
  readonly openImpactHypotheses: number;
  readonly hitSafetyLimit: boolean;
}): 'continue' | 'complete' | 'incomplete';

export function operationKeyFor(
  workflowId: string,
  wave: number,
  transition: 'register' | 'start' | 'settle' | 'verify' | 'verify-failure' | 'finalize',
  recordIds: readonly string[],
): string;
```

`operationKeyFor()` sorts validated record IDs and returns `<workflow-id>:<wave>:<transition>:<comma-separated-ids>`. Every control-activity input that can write carries this key explicitly. The blackboard stores the key with its resulting revision and returns the same result when the same key is retried; reusing a key with different content is an error.

Required cases:

- Accept zero to six evidence-backed tasks at the current revision.
- Reject duplicate task IDs, unknown evidence, unknown identities, evidence or requests outside configured scope, unsupported task kinds, and action tasks without a hypothesis and proof condition.
- Permit recon and analysis together when identity leases do not conflict.
- Reject concurrent recon tasks claiming the same identity; serialized action tasks may reuse an identity after the previous lease is released.
- Place every action in the serialized list, never the concurrent list.
- Planner stop completes only when no pending task or open plausible-impact hypothesis remains.
- No tasks plus an unresolved information-only hypothesis closes that hypothesis as `no_demonstrated_impact` before completion.
- Wave 8 with remaining work returns `incomplete`.

- [ ] Run the scheduler test and observe failure.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-scheduler.test.mjs
```

- [ ] Implement CAS-backed task lifecycle, identity leases, and batch settlement.

`registerPlannedWave()` validates the planner batch and persists every accepted task as `pending` plus every rejected task and reason. `startBlackboxTasks()` atomically changes the selected tasks to `running` and acquires their identity leases. `settleBlackboxTasks()` atomically merges successful contributions, marks successes `completed`, marks supplied failures `failed`, and releases every lease. Each transition compares the expected revision and increments it once.

Recon and analysis workers in one concurrent group all read the revision returned by `startBlackboxTasks()`. Settle their results as one deterministic orchestrator operation:

```ts
export interface ContributionBatch {
  readonly operationKey: string;
  readonly baseRevision: number;
  readonly contributions: readonly WorkerContribution[];
  readonly failures: readonly { readonly taskId: string; readonly reason: string }[];
}

interface BlackboardStore {
  settleTasks(batch: ContributionBatch): Promise<BlackboxSnapshot>;
}
```

Sort contributions and failures by task ID, validate every reference and cross-contribution ID before writing, reject the entire batch on any conflict, and increment the revision once. Do not rebase a stale batch. Update the Task 3 and activity tests to cover deterministic ordering, pending/running/completed/failed transitions, lease acquisition and release, an atomic conflicting-batch rejection, a stale batch, and idempotent replay of the same operation key. A worker result cannot complete an unregistered task.

Add these activity operations in this task:

```ts
export async function registerPlannedWave(input: RegisterWaveInput): Promise<RegisteredWave>;
export async function startBlackboxTasks(input: StartTasksInput): Promise<TaskTransitionResult>;
export async function settleBlackboxTasks(input: SettleTasksInput): Promise<SettledTasksResult>;
export async function recordBlackboxVerification(input: RecordVerificationInput): Promise<number>;
export async function recordBlackboxVerificationFailure(input: RecordVerificationFailureInput): Promise<number>;
export async function evaluateBlackboxProgress(input: EvaluateProgressInput): Promise<'continue' | 'complete' | 'incomplete'>;
export async function finalizeBlackboxRun(input: FinalizeBlackboxInput): Promise<BlackboxWorkflowResult>;
```

At the Task 8 boundary, `finalizeBlackboxRun()` atomically freezes the terminal blackboard status and returns the internal result. It does not publish a finding or render final artifacts. The workflow is not selectable until Task 10. Task 9 completes finalization with deterministic finding acceptance and the four artifacts before the mode becomes reachable.

- [ ] Implement the black-box workflow with typed activity proxies.

The workflow owns only deterministic state: current wave, blackboard revision, task states, identity leases, and terminal status. It never reads files, environment variables, clocks, Burp, or model state. `RegisteredWave`, `TaskTransitionResult`, and `SettledTasksResult` return the persisted task states and leases; mirror those values into the workflow's queryable state after every transition and assert their revision matches the workflow revision.

Define `BlackboxControlActivities`, `BlackboxSafeModelActivities`, and `BlackboxEffectActivities` as `Pick<BlackboxActivityApi, ...>` types. Control contains preflight, snapshot, task transitions, settlement, verification recording, progress evaluation, and finalization. Safe-model contains planner and analysis. Effect contains anonymous capture, identity capture, recon, action, and verifier. This makes every call in the workflow compile against the Task 7 activity API.

Use this control flow:

```ts
const controlActivities = proxyActivities<BlackboxControlActivities>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 3 },
});

const safeModelActivities = proxyActivities<BlackboxSafeModelActivities>({
  startToCloseTimeout: '45 minutes',
  retry: { maximumAttempts: 2 },
});

const effectActivities = proxyActivities<BlackboxEffectActivities>({
  startToCloseTimeout: '45 minutes',
  retry: { maximumAttempts: 1 },
});

export async function blackboxAuthzWorkflow(
  input: BlackboxWorkflowInput,
): Promise<BlackboxWorkflowResult> {
  const preflight = await controlActivities.preflightBlackbox(input);
  let revision = preflight.revision;

  const anonymousCapture = await effectActivities.captureAnonymous(input);
  revision = anonymousCapture.revision;

  const identityCaptures: IdentityCaptureResult[] = [];
  for (const identity of preflight.identities) {
    const capture = await effectActivities.captureIdentity(input, identity.name);
    revision = capture.revision;
    identityCaptures.push(capture);
  }
  if (identityCaptures.filter((capture) => capture.authenticated).length < 2) {
    return controlActivities.finalizeBlackboxRun({
      ...input,
      revision,
      status: 'incomplete',
      failure: 'fewer than two identities authenticated successfully',
      operationKey: operationKeyFor(input.workflowId, 0, 'finalize', []),
    });
  }

  for (let waveNumber = 1; waveNumber <= 8; waveNumber += 1) {
    const batch = await safeModelActivities.runBlackboxPlanner(input, revision);
    const snapshot = await controlActivities.readPlannerSnapshot(input);
    const wave = validateAndScheduleWave(batch, snapshot);
    const registered = await controlActivities.registerPlannedWave({
      ...input,
      revision,
      waveNumber,
      batch,
      wave,
      operationKey: operationKeyFor(input.workflowId, waveNumber, 'register', [
        ...wave.concurrent.map((task) => task.taskId),
        ...wave.actions.map((task) => task.taskId),
      ]),
    });
    revision = registered.revision;
    updateWorkflowTaskState(registered);

    if (registered.wave.concurrent.length > 0) {
      const started = await controlActivities.startBlackboxTasks({
        ...input,
        revision,
        taskIds: registered.wave.concurrent.map((task) => task.taskId),
        operationKey: operationKeyFor(
          input.workflowId,
          waveNumber,
          'start',
          registered.wave.concurrent.map((task) => task.taskId),
        ),
      });
      revision = started.revision;
      updateWorkflowTaskState(started);
      const baseRevision = revision;
      const attempts = await Promise.allSettled(
        registered.wave.concurrent.map((task) =>
          task.kind === 'analysis'
            ? safeModelActivities.runBlackboxAnalysis({ ...input, task, revision: baseRevision })
            : effectActivities.runBlackboxRecon({ ...input, task, revision: baseRevision }),
        ),
      );
      const settled = await controlActivities.settleBlackboxTasks(
        buildSettlement(
          input,
          baseRevision,
          registered.wave.concurrent,
          attempts,
          operationKeyFor(
            input.workflowId,
            waveNumber,
            'settle',
            registered.wave.concurrent.map((task) => task.taskId),
          ),
        ),
      );
      revision = settled.revision;
      updateWorkflowTaskState(settled);
    }

    for (const task of registered.wave.actions) {
      const started = await controlActivities.startBlackboxTasks({
        ...input,
        revision,
        taskIds: [task.taskId],
        operationKey: operationKeyFor(input.workflowId, waveNumber, 'start', [task.taskId]),
      });
      revision = started.revision;
      updateWorkflowTaskState(started);
      const baseRevision = revision;
      const attempt = await effectActivities.runBlackboxAction({ ...input, task, revision: baseRevision }).then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason: String(reason) }),
      );
      const settled = await controlActivities.settleBlackboxTasks(
        buildSettlement(
          input,
          baseRevision,
          [task],
          [attempt],
          operationKeyFor(input.workflowId, waveNumber, 'settle', [task.taskId]),
        ),
      );
      revision = settled.revision;
      updateWorkflowTaskState(settled);

      for (const candidateId of settled.candidateIds) {
        try {
          const verification = await effectActivities.runBlackboxVerifier({ ...input, candidateId, revision });
          revision = await controlActivities.recordBlackboxVerification({
            ...input,
            revision,
            verification,
            operationKey: operationKeyFor(input.workflowId, waveNumber, 'verify', [candidateId]),
          });
        } catch (error) {
          revision = await controlActivities.recordBlackboxVerificationFailure({
            ...input,
            revision,
            candidateId,
            reason: String(error),
            operationKey: operationKeyFor(input.workflowId, waveNumber, 'verify-failure', [candidateId]),
          });
        }
      }
    }

    const decision = await controlActivities.evaluateBlackboxProgress({
      ...input,
      revision,
      waveNumber,
      plannerStop: batch.stop,
    });
    if (decision !== 'continue') {
      return controlActivities.finalizeBlackboxRun({
        ...input,
        revision,
        status: decision,
        operationKey: operationKeyFor(input.workflowId, waveNumber, 'finalize', []),
      });
    }
  }

  return controlActivities.finalizeBlackboxRun({
    ...input,
    revision,
    status: 'incomplete',
    operationKey: operationKeyFor(input.workflowId, 8, 'finalize', []),
  });
}
```

`buildSettlement()` is a pure helper that pairs each settled result with its registered task ID; it never reads external state. Control activities use an operation key derived from workflow ID, wave, transition, and sorted task IDs so a Temporal retry after a completed atomic write returns the recorded result instead of applying the transition twice.

Preserve this ordering if the implementation factors the body. Catch a stale-revision failure once by discarding unmerged contributions, reading the current revision, recording the failed wave, and returning to the planner. The `effectActivities` proxy is mandatory: identity capture, recon browser work, action replay, and verification have `maximumAttempts: 1`, so Temporal cannot repeat a state-changing request. A `delivery_unknown` outcome fails that action and is never retried automatically.

- [ ] Export `blackboxAuthzWorkflow` from `workflows.ts` so the existing Temporal bundle includes it.

Do not add black-box branches inside `pentestPipeline()`.

- [ ] Run scheduler, blackboard, and full worker checks.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-scheduler.test.mjs apps/worker/test/blackbox-blackboard.test.mjs
pnpm --dir apps/worker exec node --test
```

- [ ] Commit the orchestrator.

```powershell
git add apps/worker/src/blackbox/scheduler.ts apps/worker/src/blackbox/activities.ts apps/worker/src/blackbox/blackboard.ts apps/worker/src/temporal/blackbox-workflow.ts apps/worker/src/temporal/workflows.ts apps/worker/test/blackbox-scheduler.test.mjs apps/worker/test/blackbox-blackboard.test.mjs apps/worker/test/blackbox-activities.test.mjs
git commit -m "feat: orchestrate blackbox evidence workers"
```

---

## Task 9: Enforce impact acceptance and render only validated artifacts

**Files:**

- Modify: `apps/worker/src/types/blackbox.ts`
- Modify: `apps/worker/src/blackbox/activities.ts`
- Create: `apps/worker/src/blackbox/finding-validator.ts`
- Create: `apps/worker/src/blackbox/artifacts.ts`
- Create: `apps/worker/test/blackbox-findings.test.mjs`
- Create: `apps/worker/test/blackbox-artifacts.test.mjs`

- [ ] Write failing finding-acceptance tests.

The validator consumes the final blackboard, not model prose:

```ts
export interface VerifiedBlackboxFinding {
  readonly findingId: string;
  readonly hypothesisId: string;
  readonly victimIdentity: string;
  readonly attackerIdentity: string | 'anonymous';
  readonly baselineExchangeId: string;
  readonly attackExchangeIds: readonly string[];
  readonly verificationExchangeIds: readonly string[];
  readonly replaySequence: ReplaySequence;
  readonly demonstratedAction: string;
  readonly concreteEffect: string;
  readonly affectedParty: 'customer' | 'application' | 'users';
  readonly impactStatement: string;
  readonly preconditions: readonly string[];
  readonly verifierResultId: string;
}

export function collectVerifiedFindings(
  snapshot: BlackboxSnapshot,
  targetOrigin: string,
): readonly VerifiedBlackboxFinding[];
```

Accept a finding only when all of these are true:

- Every evidence ID exists and resolves to the target origin.
- The victim owns or created the affected resource or privileged state.
- The attacker differs from the victim or is anonymous.
- The exact action sequence completed without `delivery_unknown`.
- The replay service, not the action model, records a passing `DeterministicProofObservation` for an unauthorized data marker or persistent state transition; status is never a proof condition.
- A clean verification replay from fresh identity-state references independently records a passing observation with the same marker digest or transition effect.
- The verifier verdict is `verified`.
- `impactStatement` exactly follows `As an attacker, I could <demonstrated action>, causing <concrete effect> to <customer|application|users>.` with all three fields non-empty.

Reject fixtures for status-only 200/403 differences, UI-only visibility, unowned data, fabricated IDs, absent clean verification, same state reference, speculative impact, information-only exposure without a demonstrated consequence, out-of-scope origin, cross-origin redirect, or leaked secrets.

- [ ] Write failing artifact tests.

Render exactly these four files under `.shannon/deliverables`:

```text
traffic_inventory.json
blackbox_blackboard.json
blackbox_authz_findings.json
blackbox_authz_evidence.md
```

The inventory and blackboard artifacts are redacted projections, not copies of raw files. The findings JSON contains only `VerifiedBlackboxFinding` records. The Markdown evidence must list the replay sequence and referenced redacted request/response comparisons for each finding.

When there are no findings, write this exact conclusion:

```text
No replay-verified findings were produced. This run is not a clean assessment of unexercised routes or workflows.
```

When the safety limit or a required component fails, write `status: incomplete` and the observed failure. Never convert it to `no_findings`.

- [ ] Implement deterministic validation and rendering.

Sort inventory by route signature then identity, findings by finding ID, and blackboard arrays by stable ID. Redact again during rendering as defense against an incorrectly normalized record. Use `atomicWrite()` for each artifact.

Do not add Repeater export to the acceptance path. A later operator action may open a verified raw request in Repeater, but its success cannot change the finding verdict.

Complete `finalizeBlackboxRun()` in `activities.ts`: set the terminal status, call `collectVerifiedFindings()`, render all four artifacts, and return their exact names and finding count. If validation or any artifact write fails, record `incomplete` and throw; never return a partial-success result.

- [ ] Run focused and complete worker checks.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-findings.test.mjs apps/worker/test/blackbox-artifacts.test.mjs
pnpm --dir apps/worker exec node --test
```

- [ ] Commit verification and artifacts.

```powershell
git add apps/worker/src/types/blackbox.ts apps/worker/src/blackbox/activities.ts apps/worker/src/blackbox/finding-validator.ts apps/worker/src/blackbox/artifacts.ts apps/worker/test/blackbox-findings.test.mjs apps/worker/test/blackbox-artifacts.test.mjs
git commit -m "feat: publish only replay-verified blackbox findings"
```

---

## Task 10: Wire black-box mode into the worker and preserve resume semantics

**Files:**

- Modify: `apps/worker/src/temporal/worker.ts`
- Create: `apps/worker/src/temporal/worker-cli.ts`
- Modify: `apps/worker/src/temporal/pipeline.ts`
- Modify: `apps/worker/src/blackbox/activities.ts`
- Create: `apps/worker/test/blackbox-worker-entry.test.mjs`
- Modify: `apps/worker/test/blackbox-activities.test.mjs`

- [ ] Write failing worker-entry and resume-scope tests.

Put pure worker argument and selection seams in `worker-cli.ts` so importing tests never execute `worker.ts`:

```ts
export interface CliArgs {
  readonly mode: 'whitebox' | 'blackbox';
  readonly webUrl: string;
  readonly repoPath: string;
  readonly taskQueue: string;
  readonly configPath?: string;
  readonly outputPath?: string;
  readonly pipelineTestingMode: boolean;
  readonly resumeFromWorkspace?: string;
}

export function parseCliArgs(argv: readonly string[]): CliArgs;
export function workflowNameFor(mode: CliArgs['mode']): 'pentestPipelineWorkflow' | 'blackboxAuthzWorkflow';
```

Required assertions:

- `--blackbox` selects `blackboxAuthzWorkflow`; absence selects `pentestPipelineWorkflow`.
- Both modes still require URL, non-null internal `repoPath`, and a task queue.
- Black-box mode requires a config and parses it with `mode: 'blackbox'`.
- White-box orchestration config still parses with default white-box semantics.
- A new session records `mode`.
- A legacy session without mode is treated as `whitebox`.
- Resume rejects mode, normalized target origin, sorted identity-name set, MCP URL, MCP host header, or proxy URL changes.
- Resume accepts an unchanged scope regardless of identity order in the YAML file.
- Resume marks an interrupted running action `delivery_unknown` and does not dispatch it again; interrupted analysis may return to `pending`, while interrupted browser recon is failed and replanned.
- Black-box output copy reads only the four deliverables and cannot copy `.shannon/blackbox/raw` or identity state.

Use this durable scope:

```ts
export interface BlackboxRunScope {
  readonly mode: 'blackbox';
  readonly targetOrigin: string;
  readonly identities: readonly string[];
  readonly burpMcpUrl: string;
  readonly burpMcpHostHeader: string;
  readonly burpProxyUrl: string;
}
```

Persist it in the blackboard initialization record and a redacted copy in `session.json`. Do not persist credentials. Compare normalized values before any new browser or replay action.

- [ ] Run focused tests and observe failure.

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-worker-entry.test.mjs apps/worker/test/blackbox-activities.test.mjs
```

- [ ] Register and select the additive workflow.

Import activity namespaces separately and combine them once:

```ts
import * as whiteboxActivities from './activities.js';
import * as blackboxActivities from '../blackbox/activities.js';

const registeredActivities = {
  ...whiteboxActivities,
  ...blackboxActivities,
};
```

Pass `registeredActivities` to `Worker.create()`. Start the selected workflow name with a mode-specific input and result type. Keep `pentestPipelineWorkflow` inputs and execution unchanged.

- [ ] Extend session setup and output copy for the black-box result.

The black-box workflow must register a progress query compatible with the CLI's running-status display. Its terminal result is one of:

```ts
export type BlackboxTerminalStatus = 'findings' | 'no_findings' | 'incomplete';

export interface BlackboxWorkflowResult {
  readonly mode: 'blackbox';
  readonly status: BlackboxTerminalStatus;
  readonly revision: number;
  readonly findingCount: number;
  readonly artifactNames: readonly [
    'traffic_inventory.json',
    'blackbox_blackboard.json',
    'blackbox_authz_findings.json',
    'blackbox_authz_evidence.md',
  ];
  readonly failures: readonly string[];
}
```

For `--output`, copy only those four names from `/target/.shannon/deliverables`. Fail if a named artifact is missing; do not report a successful run with partial output.

- [ ] Run all automated checks.

```powershell
pnpm --filter @shannon/worker build
pnpm --filter @keygraph/shannon build
pnpm --dir apps/worker exec node --test
node --test apps/cli/test/blackbox-cli.test.mjs
pnpm check
```

- [ ] Inspect the complete diff for white-box regressions and scope creep.

```powershell
git diff --check
git diff --stat
git diff -- apps/worker/src/temporal/workflows.ts apps/worker/src/temporal/worker.ts apps/cli/src/docker.ts
```

Confirm that `pentestPipelineWorkflow`, `ALL_AGENTS`, white-box prompt files, and white-box Docker mounts retain their behavior.

- [ ] Commit worker wiring.

```powershell
git add apps/worker/src/temporal/worker.ts apps/worker/src/temporal/worker-cli.ts apps/worker/src/temporal/pipeline.ts apps/worker/src/blackbox/activities.ts apps/worker/test/blackbox-worker-entry.test.mjs apps/worker/test/blackbox-activities.test.mjs
git commit -m "feat: run the blackbox authorization workflow"
```

---

## Task 11: Prove the real Docker, Burp, browser, and Luna path locally

**Files:**

- No product files unless a reproduced integration defect requires the smallest in-scope correction and regression test.
- Do not commit credentials, Burp options, proxy history, Memos data, run workspaces, or generated artifacts.

- [ ] Establish a recoverable Burp listener change.

Use Burp MCP `output_project_options` and save the exact current `proxy.request_listeners` JSON outside the repository. Add one listener on port `18080` with these settings while preserving every existing listener:

```json
{
  "certificate_mode": "per_host",
  "custom_tls_protocols": [],
  "enable_http2": true,
  "listen_mode": "all_interfaces",
  "listener_port": 18080,
  "running": true,
  "use_custom_tls_protocols": false
}
```

Apply only the resulting `proxy.request_listeners` array through `set_project_options`. Re-read project options and confirm both the original loopback listener and the temporary listener are running. Put restoration of the exact saved array in a `finally` path for every integration attempt.

- [ ] Verify connectivity before launching Shannon.

From a disposable container on `shannon-net`, verify:

1. `http://host.docker.internal:9876` returns the Burp MCP SSE response when the `Host` header is `127.0.0.1:9876`.
2. `http://host.docker.internal:18080` accepts a proxied request to the local Memos target.
3. The proxied request appears in target-filtered `get_proxy_http_history_regex` output.

Treat an empty history delta as a failed integration, even when the HTTP client exits successfully.

- [ ] Prepare the local test without exposing source to the scan.

Use the running pinned Memos instance through its container-reachable URL. Store a black-box YAML with two disposable Memos identities outside the repository or in the ignored run workspace. Confirm both accounts can log in and own distinguishable records. Do not include a CVE, issue, advisory, source path, expected bug, or solution hint in the config or prompts.

Set only process-local environment variables:

```powershell
$env:SHANNON_AI_MODEL = 'openai-codex:gpt-5.6-luna'
$env:SHANNON_BURP_MCP_URL = 'http://host.docker.internal:9876'
$env:SHANNON_BURP_MCP_HOST_HEADER = '127.0.0.1:9876'
$env:SHANNON_BURP_PROXY_URL = 'http://host.docker.internal:18080'
```

- [ ] Build the real image and launch one black-box run.

Use the local CLI and an explicit workspace name. Resolve the uncommitted integration config into a task-specific PowerShell variable first:

```powershell
pnpm build
node apps/cli/dist/index.mjs start --blackbox -u http://host.docker.internal:5231 -c $blackboxConfigPath -w memos-blackbox-luna --follow
```

`$blackboxConfigPath` must be the absolute path to the operator's uncommitted config containing the two disposable accounts. It is a runtime input, not a repository artifact.

- [ ] Inspect the running container mount list before accepting the run.

Use `docker inspect` and confirm:

- The current `memos-blackbox-luna` run is mounted at `/app/workspaces/memos-blackbox-luna`.
- Its synthetic root is mounted at `/target`.
- No source checkout, repository collection, workspaces parent, or sibling workspace is mounted.
- The worker command contains `--blackbox`.

Stop the run and fix the mount builder before continuing if any source-bearing mount is present.

- [ ] Observe the end-to-end evidence path.

Require all of these observations:

1. Burp receives the preflight request and identity-attributed browser traffic.
2. At least two identities authenticate and have separate state files.
3. Planner output creates typed tasks at a known blackboard revision.
4. Recon or analysis contributions merge through the blackboard.
5. Every action is sent by a Burp MCP request tool and records its returned exact request/response in the run-local raw corpus. Do not require direct MCP sends to appear in Proxy history; this Burp integration does not add them there.
6. Candidate proofs, if any, invoke a fresh verifier state.
7. Exactly four final artifacts exist and contain no test credentials or session tokens.

- [ ] Independently replay every emitted finding.

For each JSON finding, start from a newly authenticated attacker state, repeat the recorded mutation through Burp, and run the listed clean verification request. Accept it only if the same unauthorized data marker or persistent state change is observed. If no proof replays, the correct result is zero findings. If the run emits no candidates, state that it found nothing; do not reinterpret hypotheses as findings.

- [ ] Restore Burp and clean only integration-owned state.

Restore the exact saved `proxy.request_listeners` array and verify port `18080` is no longer listening while the original listener remains unchanged. Stop the Shannon worker for `memos-blackbox-luna`. Preserve the run workspace as evidence until the user decides to remove it.

- [ ] Run final repository verification after any integration fix.

```powershell
pnpm build
pnpm check
pnpm --dir apps/worker exec node --test
node --test apps/cli/test/blackbox-cli.test.mjs
git diff --check
git status --short
```

If integration required a product fix, commit only that fix and its failing-then-passing regression test. If no product file changed, do not create an empty commit.

---

## Completion Check

- [ ] `shannon start --blackbox` runs without a repository and rejects one if supplied.
- [ ] Docker inspection proves that target source and sibling workspaces are absent.
- [ ] Two to five isolated identities authenticate through Burp-backed Playwright sessions.
- [ ] The orchestrator owns task state, revisions, leases, stopping, and verification dispatch.
- [ ] Planner, recon, analysis, action, and verifier have the exact bounded tool surfaces specified above.
- [ ] Raw Burp traffic stays activity-local and run-local; model-visible and final evidence is redacted.
- [ ] Identity-swapped replay preserves the request except for orchestrator-approved authentication and mutations.
- [ ] Every published finding passes the fresh-state verifier and the attacker-impact invariant.
- [ ] An empty run says `No replay-verified findings` without implying a clean assessment.
- [ ] White-box builds and existing checks remain green.
