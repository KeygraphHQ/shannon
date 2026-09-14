# @shannon/hunter

Local foundation for an autonomous HackerOne-hunting controller, with
**Claude Code as the reasoning/controller layer** and **Shannon 1.9.0 as one
execution engine** among others (recon tool adapters — see below).

This is not a checklist scanner (`subfinder → httpx → gau → nuclei → report`).
It is an adaptive loop: recon builds a correlated world model, JS
intelligence and behavioral diffing turn that model into observations,
observations become hypotheses, a reasoning provider (Claude-backed, with a
deterministic fallback) proposes the single most informative thing to
investigate next, a policy layer decides whether that proposal is actually
allowed to run, and the result can strengthen a hypothesis, weaken it, or
spawn brand-new ones — before anything is ever called a finding.

## Workflow

```
AUTHORIZED HACKERONE PROGRAM
        |
SCOPE / ROE VALIDATION          <- scope/validator.ts, scope/matching.ts (deterministic, safety gate)
        |
DISCOVER / ENUMERATE / CORRELATE <- recon/sources.ts, recon/cli-adapters.ts, recon/correlate.ts, worldmodel/graph.ts
        |
UNDERSTAND (JS + source maps)    <- recon/js-intel.ts, recon/js-live.ts, recon/http-probe.ts
        |
OBSERVE (behavioral diffing)     <- recon/behavioral.ts, recon/behavioral-live.ts
        |
HYPOTHESIZE / PRIORITIZE         <- reasoning/hypothesis.ts
        |
  .--------------------------------------------------.
  | SELECT NEXT-BEST ACTION (Claude, or heuristic)     |  <- reasoning/provider.ts, claude-provider.ts, heuristic-provider.ts, router.ts
  | POLICY GATE (real queue match + budget, or reject) |  <- reasoning/policy.ts
  | INVESTIGATE (incl. Shannon, when eligible)         |  <- pipeline/adaptive-loop.ts, shannon/*
  | LEARN / UPDATE MODEL / REPRIORITIZE                |  <- reasoning/hypothesis.ts:updateHypothesisWithObservation
  '--------------------------------------------------'
        | (repeat until the queue is empty or a budget limit is reached)
        v
VALIDATE                        <- findings/lifecycle.ts (candidate -> ... -> report_ready)
        |
EVIDENCE                        <- evidence/store.ts (structured, redacted)
        |
DEDUPLICATE                     <- dedup/local-dedup.ts
        |
HACKERONE REPORT DRAFT          <- report/draft.ts
        |
HUMAN REVIEW                    <- always manual; nothing here submits anything
```

`pipeline/adaptive-loop.ts:runAdaptiveHunt` runs this whole loop, for one
target, and is resumable — see "Resumability" below.

## Module map

| Requirement | Module |
|---|---|
| Program discovery abstraction + providers (local synthetic dataset, h1-brain snapshot) | `src/discovery/types.ts` (`ProgramDiscoveryProvider`), `src/discovery/fixture-provider.ts`, `src/discovery/h1-brain-provider.ts` |
| Program Opportunity Model (transparent, inspectable scoring/ranking/explanation) | `src/discovery/scoring.ts` |
| HackerOne-shaped discovery data -> Hunter's `ProgramScope` (never bypasses the real validator; discovery never implies authorization) | `src/discovery/normalize.ts` |
| ROE (`disallowedTechniques`) enforcement, before every recon/Shannon action actually runs | `src/discovery/roe.ts` |
| Live hunt lifecycle orchestrator (discover -> rank -> select -> authorize -> run, one entry point, no hand-written TypeScript required) | `src/orchestration/lifecycle.ts` |
| Bootstrap recon sourced from real CLI adapters, not just fixtures | `src/recon/live-bootstrap-sources.ts` |
| Scope schema + deterministic validator (tiers, bounty eligibility, auth requirements, rate limit) | `src/types.ts`, `src/scope/validator.ts`, `src/scope/matching.ts` |
| HackerOne intake abstraction (single, already-selected program) | `src/intake/hackerone.ts` (`ProgramIntake`; `LocalFileIntake` implemented, `HackerOneApiIntake` a disabled stub) |
| Engagement/state persistence | `src/state/engagement-store.ts` |
| World model (program → asset → host → application → endpoint → parameter → js-artifact → source-location → auth-state → role → resource → workflow → integration) | `src/worldmodel/graph.ts` |
| Passive/active recon source abstraction + capability detection + tool-identity verification | `src/recon/sources.ts` (`ReconSource`, `LocalFixtureReconSource`, `isToolInstalled`, `verifyToolIdentity`) |
| **Real recon CLI adapters** (subfinder, amass, chaos, certificate transparency, gau, waybackurls, httpx, katana, naabu, ffuf, nuclei) | `src/recon/cli-adapters.ts` |
| Cross-source correlation | `src/recon/correlate.ts` |
| Bulk scope tagging / the observation scope firewall | `src/recon/scope-tagging.ts` |
| JavaScript intelligence (endpoints, internal hosts, feature flags, secrets, DOM-XSS sink/source pairing) | `src/recon/js-intel.ts` |
| **Live** JS + source-map pipeline (HTML → script → source map → recovered source) | `src/recon/js-live.ts` |
| Live HTTP application understanding (status/headers/redirects/cookies-by-name) | `src/recon/http-probe.ts` |
| Behavioral recon (auth-state diffing) — fixture-driven and **live** | `src/recon/behavioral.ts`, `src/recon/behavioral-live.ts` |
| Shannon config generation + invocation adapter + eligibility check | `src/shannon/config.ts`, `src/shannon/invoke.ts`, `src/shannon/eligibility.ts` |
| **Real Shannon execution adapter** (plan, then explicitly-gated live execution with captured stdout/stderr/exit code and `report.json` discovery) | `src/shannon/execution-adapter.ts` |
| Shannon output ingestion | `src/ingestion/shannon-output.ts` |
| Normalized, redaction-safe evidence store | `src/evidence/store.ts` |
| Observation persistence | `src/state/observation-log.ts` |
| Finding lifecycle (candidate → investigated → reproduced → independently_validated → impact_demonstrated → deduplicated → report_ready → reported, every transition carrying a reason) | `src/findings/lifecycle.ts` |
| Deduplication + disclosed-report intelligence | `src/dedup/local-dedup.ts` (`LocalSignatureDeduplicator`; `DisclosedReportProvider` with an honest status enum) |
| Hypothesis/reasoning model | `src/reasoning/hypothesis.ts` |
| Next-best-action engine + investigation queue | `src/reasoning/actions.ts` |
| **ReasoningProvider abstraction** (Claude-backed + deterministic fallback) | `src/reasoning/provider.ts`, `claude-provider.ts`, `heuristic-provider.ts`, `router.ts`, `schema.ts` |
| **Deterministic policy gate** (hallucination guard + budget enforcement) | `src/reasoning/policy.ts` |
| Adaptive recon + reasoning loop (the controller) | `src/pipeline/adaptive-loop.ts` |
| Resumable checkpoint (+ reasoning decisions + event log) | `src/state/checkpoint.ts` |
| Recon-quality metrics | `src/metrics/recon-quality.ts` |
| Tool adapter/registry | `src/tools/registry.ts`, `src/tools/shannon-adapter.ts` |
| HackerOne report draft generator | `src/report/draft.ts` |
| Local test HTTP application (used only by tests) | `src/testing/local-app-server.ts` |
| Local autonomous simulation | `fixtures/simulation/**`, `src/pipeline/simulation-loader.ts` |
| CLI (incl. `discover`/`rank`/`lifecycle`) | `src/cli.ts` |
| `/hunt` slash command | `../../.claude/commands/hunt.md` |
| Tests | `src/**/*.test.ts` (Node's built-in `node:test`, no new test framework dependency) |

Zero third-party dependencies. Only Node/platform built-ins (`node:fs`,
`node:path`, `node:crypto`, `node:child_process`, `node:http`, the global
`fetch`) plus the workspace's existing `typescript` devDependency.

## Safety model

- **Scope validation is the mandatory gate.** `validateTarget` runs before
  anything else, checks `authorizationConfirmed`, rejects any URL matching
  an `out-of-scope` asset (which always wins over an in-scope match), and
  rejects a `repo` path that is itself a URL.
- **Discovery never implies authorization, and "unknown" is never actively
  tested.** Every world-model node carries a `scopeStatus`; active recon
  applies a discovery only when it resolves to `in-scope` — both
  `out-of-scope` *and* `unknown` are skipped — and
  `recon/scope-tagging.ts:filterInScopeObservations` is a hard firewall: no
  observation against an out-of-scope host can ever reach hypothesis
  generation or the action queue, no matter which recon layer produced it.
  This now holds one layer earlier too: `orchestration/lifecycle.ts` can
  *discover* and *rank* any number of candidate programs freely (always
  read-only, always offline), but the resulting selection is never itself
  treated as authorization — `runHuntLifecycle` hard-stops at
  `AWAITING_AUTHORIZATION` until the caller supplies an explicit,
  human-authored `AuthorizationRecord` (`confirmed: true` *and*
  `scopeReviewed: true`), and that record — never a raw discovery record —
  is the only thing allowed to write `authorizationConfirmed: true` into
  the normalized scope file the hunt actually runs against.
- **ROE is enforced, not just recorded.** `ProgramScope.disallowedTechniques`
  used to be validated on intake and never read again. `discovery/roe.ts:isTechniqueAllowed`
  is now checked in `pipeline/tool-bridge.ts` (before every recon adapter
  runs, both at the action-kind level and again per candidate tool name) and
  in `pipeline/shannon-action.ts` (before Shannon eligibility is even
  checked) — a disallowed technique is reported as `BLOCKED_BY_POLICY` with
  the matched rule, never silently skipped or silently allowed through.
- **A model can only propose; a deterministic layer decides.**
  `reasoning/policy.ts:evaluateProposal` accepts a `ReasoningProvider`'s
  action proposal only if it matches, field for field, a real entry already
  in the current action queue (built straight from the real world model) —
  a hallucinated target or hypothesis id is rejected outright — and only if
  the configured `HuntBudget` (max actions, max runtime, max Shannon
  executions) has not been exhausted.
- **Shannon is never executed without explicit, separate confirmation.**
  `shannon/config.ts` builds only the verified invocation (`npx
  @keygraph/shannon@1.9.0 start --url <URL> --repo <REPO> [--workspace
  <NAME>]`) — no invented flags. The adaptive loop always just *plans* a
  Shannon action unless the caller passes `liveShannon: { confirmed: true }`
  to `runAdaptiveHunt()` — nothing sets that automatically, regardless of
  which reasoning provider selected the action, and `hunter hunt` still has
  no CLI flag for it. `hunter lifecycle` does have `--live-shannon`, but it
  is inert unless `--authorize <file>` has already supplied a real,
  human-authored authorization record — the flag alone can never reach a
  live target (see "Live Shannon execution" below). `shannon/eligibility.ts`
  additionally refuses to even plan Shannon against a black-box target with
  no real local repository — it never pretends source-aware mode applies.
- **A hypothesis is never a finding, and a finding is never claimed beyond
  its actual validation stage.** `findings/lifecycle.ts` enforces the full
  chain with a mandatory, logged reason on every transition; the report
  draft generator refuses anything short of `report_ready`.
- **Tool identity is verified, never assumed from a binary's name.**
  `recon/sources.ts:verifyToolIdentity` checks a tool's own version/help
  output against an expected signature before ever reporting it available —
  this genuinely matters: on the machine this was built on, the binary
  named `httpx` on PATH is Python's HTTPX HTTP client, not ProjectDiscovery's
  recon tool, and capability detection correctly reports it unavailable
  rather than trying to drive the wrong program.
- **A live HackerOne *API* call — intake, discovery, or submission — is
  still a stub or absent by design; report submission always is.**
  `HackerOneApiIntake` throws "not implemented"; `report/draft.ts` only
  ever writes a local file, banner-marked `DRAFT — NOT SUBMITTED`, and
  nothing anywhere in this package can submit one. Program *discovery*
  (`discovery/h1-brain-provider.ts`) is real, but reads a pre-fetched local
  snapshot file rather than calling the HackerOne API itself — see that
  module's docstring for exactly why the honest integration point is a file,
  not an HTTP client. `dedup/local-dedup.ts`'s `DisclosedReportProvider`
  reports one of `NO_PROVIDER` / `PROVIDER_DISABLED` / `PROVIDER_ERROR` —
  never a fabricated `NO_MATCH` — when live HackerOne duplicate search is
  not actually available.
- **No destructive testing, no unnecessary data access.** JS-intelligence
  secret detection never retains a full matched value — only a truncated
  fingerprint (`abcd…(41 chars, redacted)`) — and evidence headers
  (Authorization, Cookie, Set-Cookie, proxy/API-key headers) are always
  redacted before being written (`evidence/store.ts:redactHeaders`).

## Real recon adapters

`recon/cli-adapters.ts` implements one class per tool, each constructing a
genuine, documented invocation and parsing that tool's real output format —
these are not stubs. What makes them safe to ship is that **`run()` is
never called against a live target anywhere in this package's own code or
tests**:

- **Passive** — `SubfinderAdapter`, `AmassAdapter`, `ChaosAdapter`,
  `CertificateTransparencyAdapter` (crt.sh, HTTP-based), `GauAdapter`,
  `WaybackurlsAdapter`.
- **Active** — `HttpxAdapter`, `KatanaAdapter`, `NaabuAdapter`,
  `FfufAdapter`, `NucleiAdapter` (nuclei findings become candidate
  observations, never auto-confirmed vulnerabilities).

Every adapter's tests exercise its **parser** (fed canned sample output —
several were corrected against a *real* local run: ffuf's `-json` output
turned out to be one JSON object per matched line, not a single summary
object with a `results` array, and OWASP Amass v5's `-version` prints only
a bare version number with no identifying text, so its identity check uses
`-h` instead) and its **`capability()`** check, which is always safe — it
inspects the tool's own version/help output, never a target. On the
development machine, `amass`, `ffuf`, and `nuclei` are genuinely installed;
`subfinder`, `chaos`, `gau`, `waybackurls`, `katana`, and `naabu` are not,
and their capability checks correctly report that. `FfufAdapter` is the one
adapter the test suite genuinely **executes** — against
`testing/local-app-server.ts` on `127.0.0.1`, never an external host.
`nuclei`'s adapter always passes `-duc` (disable-update-check), including
during its own capability check, so a mere capability probe can never
trigger an outbound template-update request.

These adapters are wired into the adaptive loop's own execution path as an
opt-in (see "The action -> tool bridge" below) — none of them run unless a
caller explicitly supplies `AdaptiveHuntInput.liveRecon`.

## Live JS/source-map and behavioral pipelines

Unlike the recon CLI adapters, `recon/js-live.ts`, `recon/http-probe.ts`,
and `recon/behavioral-live.ts` are exercised **live** in this package's own
tests — every fetch is a real HTTP request over a real socket, just always
to `testing/local-app-server.ts` on `127.0.0.1`, never an external host:

1. `analyzeLiveApplication(pageUrl, assetRef, engagementId)` fetches the
   page, extracts `<script src>` tags, fetches each script, detects
   `//# sourceMappingURL=`, fetches and parses the source map, and runs
   `js-intel.ts`'s static analysis over both the bundle and every
   recovered original source file.
2. `compareAuthStatesLive(...)` issues one real request per supplied
   auth-state header/cookie set and reuses `behavioral.ts`'s anomaly
   heuristics on the results.

`src/recon/live-pipeline.test.ts` chains both together against the local
test app (which has a deliberately vulnerable `/api/admin/users` endpoint)
and demonstrates that a new live observation can change which hypothesis
`selectNextInvestigation` picks next — the "adaptive, not a checklist"
property, proven live rather than only against static fixtures.

## ReasoningProvider (Claude-backed, with a deterministic fallback)

`reasoning/provider.ts` defines the abstraction; two real implementations
exist:

- **`HeuristicReasoningProvider`** — not a stub: it wraps the same
  real scoring logic (`reasoning/hypothesis.ts`, `reasoning/actions.ts`)
  the controller has always used. Always available, no network, no
  credentials. This is what runs whenever no model-backed provider is
  configured, or when one fails.
- **`ClaudeReasoningProvider`** — a real implementation that calls the
  Anthropic Messages API (`https://api.anthropic.com/v1/messages`) via
  `fetch`, using tool-use to force a structured JSON reply, validated
  against `reasoning/schema.ts` before being trusted. It uses
  `ANTHROPIC_API_KEY` — the credential convention this repository already
  uses everywhere else (see the root `CLAUDE.md`'s provider table) — not an
  invented mechanism.

`reasoning/router.ts:createReasoningProvider()` picks Claude when
`ANTHROPIC_API_KEY` is set, else the heuristic provider outright, and
always pairs whichever primary is chosen with the heuristic provider as
fallback. `selectNextBestActionWithFallback` tries the primary and, on
*any* error (network failure, non-2xx, schema validation failure), falls
back to the heuristic provider and records why — the hunt never stalls
because a model call failed.

**In this implementation session, `ANTHROPIC_API_KEY` was not set**, so
every test and the bundled simulation run the heuristic provider. The
Claude provider's request construction, response parsing, and error/
fallback handling are verified with an injected fake `fetch`
(`reasoning/claude-provider.test.ts`). A separate, clearly-marked
integration harness — `reasoning/claude-provider.integration.test.ts` —
makes a real call to `api.anthropic.com` over a synthetic world-model
snapshot (no security target involved) whenever `ANTHROPIC_API_KEY` *is*
set; it is skipped (not run, not faked) otherwise, and it was skipped in
this session for the same reason: no key was configured here. Do not read
"tested against a mock" as "equivalent to tested live" — a passing run of
the integration file is what "tested live" actually means for this
provider, and the two are never conflated in test output or in
`checkpoint.decisions`.

A proposal is never trusted directly regardless of source — see the policy
gate below.

## Deterministic policy gate

`reasoning/policy.ts:evaluateProposal` is the only function allowed to turn
a proposal into something that executes. It accepts a proposal only if:

1. The relevant budget (`maxActions`, `maxRuntimeMs`, and — for a `shannon`
   proposal specifically — `maxShannonExecutions`) has not been exhausted.
2. The proposal matches, field for field (`kind`, `targetRef`,
   `hypothesisId`), a real entry already in the round's action queue, built
   straight from the real world model by `reasoning/actions.ts:buildActionQueue`.
   This is the hallucination guard: a model could otherwise invent a
   plausible-looking target that was never actually discovered, and this is
   what stops that from ever reaching a tool.

A rejected proposal (hallucinated, or none at all) falls back to the plain
deterministic selection over the same real queue, so the hunt continues
rather than stalling; a proposal rejected for exhausted budget instead ends
the hunt. Every round's decision — accepted or not, and why — is recorded
in `checkpoint.decisions` (`ReasoningDecision[]`), and a corresponding
`HuntEvent` is recorded in `checkpoint.events`.
`src/pipeline/adaptive-loop.test.ts` includes an end-to-end test where a
deliberately "hallucinating" reasoning provider always proposes a
nonexistent target, and the hunt still reaches the correct validated
finding via the policy-gated fallback.

## Real Shannon execution

`shannon/execution-adapter.ts` implements the full lifecycle from section
12 of the implementation plan:

```
select shannon action -> checkShannonEligibility (real local repo?) ->
buildShannonInvocation (exact verified command) -> planShannonAction
(always safe) -> [explicit liveShannon.confirmed:true] ->
executeShannonAction (real spawn, captured stdout/stderr/exit code,
report.json discovery under the workspace) -> ingestShannonOutput ->
observations -> world-model/hypothesis update
```

`executeShannonAction` is the only function in this entire package that can
spawn the Shannon CLI, and it refuses outright without `confirmed: true`.
Nothing in `pipeline/adaptive-loop.ts` ever sets that on its own — not even
when a reasoning provider selects a `shannon` action — and **there is no
CLI flag for it**. A real engagement enables it by calling
`runAdaptiveHunt({ ..., liveShannon: { confirmed: true } })`
programmatically, which forces a deliberate integration decision rather
than a casual command-line flag. `shannon/execution-adapter.test.ts`
verifies the full lifecycle (argument construction, stdout/stderr capture,
timeout/kill handling, `report.json` discovery and ingestion, failure
handling) against an injected fake `spawn` — Shannon was never actually
executed in this session.

`ingestion/shannon-output.ts` validates against the real Shannon 1.9.0
`report.json` shape — `report_meta` (`target`/`assessment_date`/`scope`/
`executive_summary`/`exploit`/`model`/`coverage`) plus `findings`, each
matching `apps/worker/src/collectors/finding-collector.ts`'s
`AddFindingSupersetSchema` (`finding_id`, `category`, `owasp_category`,
`severity`, `vulnerable_location`, `overview`, `impact`, `remediation`, and
either exploit-mode fields — `status`, among others — or the analysis-mode
`confidence`, never both) — not a guessed shape. A finding is only ever
`verified: true` on an `Observation` when Shannon's own exploitation phase
recorded `status: "exploited"` for it; severity/confidence alone never mark
something verified. The original finding record is preserved on
`Observation.raw` for provenance.

## Commands

```bash
# One phase at a time
node apps/hunter/dist/cli.js scope-validate --program <file> --url <url> --repo <path>
node apps/hunter/dist/cli.js shannon-plan --url <url> --repo <path> [--workspace <name>]
node apps/hunter/dist/cli.js ingest --input <shannon-output.json>

# The full adaptive loop, against the bundled offline simulation
node apps/hunter/dist/cli.js hunt --simulate \
  --workspace-dir ./.hunter-workspace \
  --max-rounds 6 \
  [--max-actions 20] \
  [--engagement-id my-hunt] \
  [--resume]

# Read-only inspectors over a persisted engagement
node apps/hunter/dist/cli.js world-model --workspace-dir ./.hunter-workspace --engagement-id my-hunt
node apps/hunter/dist/cli.js hypotheses  --workspace-dir ./.hunter-workspace --engagement-id my-hunt
node apps/hunter/dist/cli.js checkpoint  --workspace-dir ./.hunter-workspace --engagement-id my-hunt

# Program discovery -> ranking -> authorized live hunt, no hand-written
# TypeScript required — see "Live/authorized execution" below
node apps/hunter/dist/cli.js discover --programs <programs.json> [--provider fixture|h1-brain]
node apps/hunter/dist/cli.js rank     --programs <programs.json> [--provider fixture|h1-brain]
node apps/hunter/dist/cli.js lifecycle \
  --programs <programs.json> [--provider fixture|h1-brain] \
  --workspace-dir ./.hunter-workspace --engagement-id my-hunt --max-rounds 6 \
  [--authorize <authorization.json>] \
  [--repo <local-repo-path>] \
  [--live-recon [--wordlist <path>] [--nuclei-severity <sev>] [--amass-output-dir <dir>]] \
  [--live-shannon]
```

Or via the `/hunt` slash command, which wraps the same CLI with a
confirmation step for either mode.

### Live/authorized execution

`hunter hunt` still has no `--live` flag: it only ever runs `--simulate`.
`hunter lifecycle` is the live entry point, and it is deliberate rather than
a casual flag in a different way than "absent entirely": every live
capability requires an explicit, separately-supplied artifact, not just a
boolean.

- **Program selection is never itself authorization.** `discover`/`rank`
  (and `lifecycle` without `--authorize`) only ever read a local dataset or
  snapshot file and stop at `AWAITING_AUTHORIZATION`, printing the selected
  program's scope/ROE/rationale.
- **`--authorize <file>`** must point at a real, human-authored
  `AuthorizationRecord` JSON file (`{confirmed:true, confirmedBy,
  confirmedAt, scopeReviewed:true}`) — see `orchestration/lifecycle.ts`'s
  docstring. Without it, `lifecycle` never writes a scope file with
  `authorizationConfirmed: true`, and `--live-recon`/`--live-shannon` are
  inert regardless of whether they were passed.
- **`--live-recon`** (only meaningful alongside `--authorize`) wires real
  recon adapters into *both* bootstrap discovery
  (`recon/live-bootstrap-sources.ts`, wrapping `recon/cli-adapters.ts`'s
  passive/active tools as bootstrap `ReconSource`s — previously only
  possible programmatically) and round-loop investigation actions (the
  existing `pipeline/tool-bridge.ts` gate chain). This makes real outbound
  requests against the selected program's real assets.
- **`--live-shannon`** (same explicit-confirmation contract as
  `liveShannon: { confirmed: true }` always had) additionally allows a
  "shannon" action to spawn the real Shannon CLI instead of only
  planning/ingesting a captured output.

For running Shannon itself for real right now, independent of Hunter, use
`/shannon`, which already has its own confirmation flow:

```bash
npx @keygraph/shannon@1.9.0 start --url <AUTHORIZED_URL> --repo <REPO_PATH>
```

## Resumability

Every engagement persists under `<workspaceDir>/engagements/<id>/`:
`state.json` (engagement identity/targets), `world-model.json`,
`checkpoint.json` (round, hypotheses, action queue, completed-action keys,
reasoning decisions, event log, status), `observations.jsonl`,
`evidence.jsonl`, `findings/*.json`, and `reports/*.md`. Calling
`hunter hunt` again with the same `--workspace-dir` and `--engagement-id`
reloads all of it and continues the round loop — recon, JS intelligence,
and behavioral diffing only ever run once, on a fresh engagement. A
checkpoint whose budget ran out (`status: "stopped"`) resumes automatically
on the next call; only a checkpoint that reached `"completed"` (queue
genuinely empty, or a budget/policy decision ended the hunt) does not.

### Corrupted-checkpoint recovery

A `checkpoint.json` that fails to parse (a truncated write, a crash
mid-save) no longer fails the entire `runAdaptiveHunt` call.
`state/checkpoint.ts:quarantineCorruptedCheckpoint` moves the damaged file
aside as `checkpoint.json.corrupted-<timestamp>` — it is never deleted, so
it stays available for forensics — and `pipeline/adaptive-loop.ts` rebuilds
a fresh checkpoint's hypotheses from `observations.jsonl` (the durable,
append-only log, loaded and validated independently of the checkpoint).
Round/action/decision history genuinely cannot be recovered from a
corrupted checkpoint alone and is honestly reported as lost — only the
hypothesis view is rebuilt — but the hunt does not have to restart from
zero, and recon/JS/behavioral bootstrap is not blindly re-run (the world
model already has data, so `isFreshHunt` still correctly evaluates to
`false`). Every recovery is logged explicitly
(`'checkpoint recovery: ...; quarantined to "..."'` /
`'checkpoint recovery: rebuilt N hypothesis/es from M durable
observation(s)'`), never silent. `pipeline/adaptive-loop.test.ts`'s
`'a corrupted checkpoint recovers instead of failing the whole hunt'` test
proves this against a real corrupted file through the real entry point.

## Concurrency — what is genuinely parallel, and what is not

Two places run genuinely concurrent work; one place is deliberately
sequential, and the distinction matters:

- **`recon/sources.ts:runReconSources`** — every passive/active source's
  `isAvailable()`/`discover()` runs together via `Promise.allSettled`, not
  a `for` loop. Sources are independent (none reads another's output), so
  a slow one can never block a fast one, and one source throwing no longer
  loses every other source's results — partial results are preserved.
  `recon/sources.test.ts`'s `'runs independent sources concurrently'` and
  `'preserves every other source's results when one source throws'` tests
  prove both properties with real timing, not just code inspection.
- **`pipeline/research-track.ts`'s experiment loop** — up to
  `ResearchTrackBudget.maxConcurrentExperiments` (default 3) experiments
  targeting distinct `(kind, target)` pairs execute together via
  `Promise.all`. Selection stays synchronous and sequential (each pick
  claims its `executedActionKeys` entry before the next pick runs, so two
  batch members can never collide), and every result is folded back into
  `researchHypotheses`/`findings` sequentially once the whole batch
  settles — no concurrent mutation of shared state. A `shannon`-kind
  member's budget check-and-increment happens synchronously before its
  first `await`, so `maxShannonExecutions` stays exactly correct even when
  multiple Shannon-kind candidates land in the same batch (`Array.map`
  invokes every callback body synchronously up to its first `await`, in
  order, before any of them actually run concurrently).
  `reasoning/policy.ts`'s `ToolRateLimiter` is itself concurrency-safe by
  construction (per-tool FIFO queues), so real recon adapters sharing a
  batch never bypass rate limiting.
  `pipeline/research-track.shannon.test.ts`'s `'two independent
  Shannon-kind experiments in the same batch genuinely overlap in
  wall-clock time'` test proves this with real timing over the injected
  spawn seam.
- **`pipeline/adaptive-loop.ts`'s primary round loop is deliberately
  sequential, not a gap.** Each round's next-best-action selection depends
  on the *previous* round's observation — that is what "adaptive" means
  here, and there is nothing independent to parallelize within it. The
  same is true of `pipeline/research-track.ts`'s own batch-*selection*
  step (picking experiment 2 requires knowing experiment 1 was already
  claimed) — only *execution* of an already-selected, non-conflicting
  batch is a concurrency opportunity, and that is exactly what is
  parallelized above.
- **Shannon's own internal concurrency (the worker's 5 parallel vuln/exploit
  agents, documented in the root `CLAUDE.md`) is a separate system.** From
  Hunter's point of view, one Shannon invocation is one `await` — whatever
  parallelism happens inside that scan is Shannon's own, not something
  Hunter's orchestration provides or needs to.

## Budget / safety controls

`HuntBudget` (merged over `DEFAULT_BUDGET` in `reasoning/policy.ts`) caps
`maxActions`, `maxRuntimeMs`, and `maxShannonExecutions`; these are enforced
by the policy gate *before* any action is selected, independent of and
unconditionally overriding whatever a reasoning provider proposes.
`perToolMinIntervalMs` is enforced separately, by `reasoning/policy.ts`'s
`ToolRateLimiter`, immediately before a real adapter actually runs (see
`pipeline/tool-bridge.ts:executeActionViaRegistry`) — concurrency-safe per
tool name, with an injectable clock/sleep so its waiting is deterministically
testable.

## Build & test

```bash
pnpm --filter @shannon/hunter run check   # tsc --noEmit
pnpm --filter @shannon/hunter run build   # tsc
pnpm --filter @shannon/hunter run test    # tsc && node --test dist/**/*.test.js
```

## The action -> tool bridge (real recon execution, opt-in)

`pipeline/tool-bridge.ts` is what closes the gap the previous section of
this README used to describe: `buildInputFromAction(toolName, action, ctx)`
translates a generic `HuntAction` into the exact typed input each named
`ToolAdapter` needs (a domain for subfinder/amass/chaos/certificate-
transparency/gau/waybackurls, a URL for httpx/katana, a host for naabu, a
URL-with-`/FUZZ`-plus-wordlist for ffuf, a URL+severity for nuclei, a
page URL for the JS/source-map collector, and per-auth-state headers for
behavioral testing — see `tools/live-adapters.ts` for the latter two, which
wrap `recon/js-live.ts`/`recon/behavioral-live.ts` as real `ToolAdapter`s).
`executeActionViaRegistry` is the full gate chain: scope ->
`program.authorizationConfirmed` -> per-adapter risk check -> `buildInputFromAction`
-> `capability()` -> `reasoning/policy.ts`'s `ToolRateLimiter` (real,
concurrency-safe `perToolMinIntervalMs` enforcement, injectable clock/sleep
for deterministic tests) -> `adapter.run()`. Every outcome is one
`ExecutionStatus` (`types.ts`): `EXECUTED_WITH_RESULTS`, `EXECUTED_NO_RESULTS`,
`MOCKED`, `UNAVAILABLE`, `BLOCKED_BY_SCOPE`, `BLOCKED_BY_POLICY`, or `FAILED`
— recorded on every `HuntCheckpoint.events` entry alongside the
pre-execution `scopeDecision` and the deterministic policy layer's
`policyDecision` reason. A tool that ran to completion and found nothing is
`EXECUTED_NO_RESULTS`, never `FAILED` — see "Execution results distinguish
'found nothing' from 'failed'" below.

This is **opt-in**, exactly like `liveShannon`: pass
`AdaptiveHuntInput.liveRecon` (a `ToolRegistry` — `tools/default-registry.ts:buildDefaultToolRegistry()`
wires every real adapter this package ships — plus optional wordlist/severity/
amass-output-dir/behavioral-auth-state config) and the loop tries a real
adapter before ever falling back to `investigationFixtures`. Omit it, and
`executeAction` behaves exactly as it always has, fixture-only — every
existing caller and test is unaffected. There is deliberately no CLI flag
for this, for the same reason `liveShannon` has none (see `cli.ts`'s module
docstring): real execution against a real target should be a deliberate
programmatic integration decision, not a casual command-line flag.

`src/pipeline/adaptive-loop.live.test.ts` proves this end to end against
`testing/local-app-server.ts` (127.0.0.1 only): live JS collection and
source-map recovery, live per-auth-state behavioral probing, a real `ffuf`
run (or `httpx`, `katana`, `naabu`, `nuclei` — whichever the host actually
has installed; `verifyToolIdentity` refuses a same-named-but-different
binary rather than trusting it), full audit-trail population, and
checkpoint/resume across two separate `runAdaptiveHunt` calls — plus a
second test in the same file proving `js-intelligence` reachability (see
below). `src/pipeline/adaptive-loop.full-loop.test.ts` goes one step
further: real discovery through real execution all the way to a validated
finding, evidence, deduplication, and a written report draft, corroborated
by two distinct real sources (live JS collection and a Shannon run — Shannon
itself exercised with an injected fake `spawnImpl`, per "Real Shannon
execution" below, never a real subprocess), with checkpoint/resume
throughout.

`src/reasoning/claude-provider.integration.test.ts` is the equivalent for
Claude-backed reasoning: skipped unless `ANTHROPIC_API_KEY` is set, and when
it runs, it makes a real call to `api.anthropic.com` over a synthetic
world-model snapshot — no security target involved either way.

## `js-intelligence` is a real, round-loop-reachable action kind

`reasoning/actions.ts`'s `ACTION_KIND_BY_VULN_CLASS` routes
`js-intel-endpoint-discovery` to `js-intelligence` (not `active-recon`,
which remains reachable via `ssrf`): an endpoint referenced only in
client-side JS is itself a page worth collecting JS from directly, and this
reuses the same `JsCollectorAdapter` the bootstrap phase already uses —
never a second implementation. `pipeline/adaptive-loop.live.test.ts`'s
`'js-intelligence becomes reachable...'` test proves the full chain live: a
bootstrap JS observation creates a hypothesis, the round loop selects and
really executes a `js-intelligence` action from it, and a genuinely new
observation (discovered only by that real run) is folded back into the same
hypothesis.

## CIDR scope matching

`scope/matching.ts` implements real IPv4 CIDR containment (`parseIPv4`,
`parseCidr`, `cidrContains`) — a `cidr`-type scope asset now matches by
actual range containment, not by omission. Fail-closed throughout: a
malformed CIDR, a malformed IP, or (deliberately) a bare hostname against a
CIDR asset all resolve to "does not match" rather than guessing (a hostname
is never DNS-resolved here to check range membership). Out-of-scope still
always wins over in-scope, exactly as for exact/wildcard-domain assets —
see `matching.test.ts` for boundary cases (`/0`, `/32`, non-byte-aligned
prefixes, a narrower out-of-scope CIDR excluding part of a broader in-scope
one).

## Execution results distinguish "found nothing" from "failed"

`ExecutionStatus` (`types.ts`) splits what used to be a single `EXECUTED`
into `EXECUTED_WITH_RESULTS` and `EXECUTED_NO_RESULTS` — a tool that ran to
completion and legitimately matched nothing is a different fact from a tool
that errored, and conflating the two made a clean zero-match scan look like
a broken tool. This fixed a real bug: `FfufAdapter.run()` used to treat
ffuf's own empty-stdout-on-zero-matches output as `ok: false`; it now
decides success purely by exit code (`interpretFfufResult`, unit-tested for
every branch in `cli-adapters.test.ts`, including a live run against a
wordlist guaranteed to match nothing). `BLOCKED_BY_SCOPE`/`BLOCKED_BY_POLICY`
remain two distinct values rather than one generic "blocked" — collapsing
them would have thrown away exactly the scope-vs-policy distinction the
audit trail (`HuntEvent.scopeDecision`/`.policyDecision`) exists to
preserve.

## The research track: from scanner to research loop

Everything above this section is the original MVP pipeline: one hypothesis
per (vulnClass, asset), one action per hypothesis, matched strictly by id.
It is a real, working, well-tested loop, and it is deliberately left alone —
see below for why. The **research track** (`pipeline/research-track.ts`,
invoked automatically by `runAdaptiveHunt` after every round budget is
spent, and exposed as `AdaptiveHuntOutput.research`) is what turns this from
"run more scanners" into an application-behavior research loop:

```
ANOMALY ENGINE            <- anomaly/engine.ts
        |
RESEARCH CASCADE           <- reasoning/cascade.ts
   (competing hypotheses, contradiction tracking, convergence)
        |
PROVENANCE GRAPH            <- worldmodel/provenance.ts
   (source -> transformation -> sink -> hypothesis)
        |
STATE / WORKFLOW GRAPH      <- worldmodel/state-graph.ts
AUTHORIZATION MATRIX        <- authz/matrix.ts
   (unexpected transitions, role/state mismatches, privilege inversions)
        |
ATTACK-PATH DISCOVERY       <- worldmodel/attack-path.ts
   (chains across the three graphs above, confidence-scored, scope-checked)
        |
EXPERIMENT DESIGNER         <- reasoning/experiment.ts
   (risk-adjusted info-gain selection; "don't test this yet" reasoning)
        |
[opt-in real execution, via the SAME pipeline/tool-bridge.ts gate chain]
        |
ADVERSARIAL VALIDATION      <- validation/adversarial.ts
   (never "passed" without a verified supporting observation)
        |
FINDING (own lifecycle) -> EVIDENCE -> DEDUP -> HUNT MEMORY
   findings/lifecycle.ts    evidence/store.ts   local-dedup.ts   memory/hunt-memory.ts
```

**Why a separate hypothesis/finding space, not a merge into `checkpoint.hypotheses`.**
The primary loop's winner-selection and its own extensive test suite
(`adaptive-loop.test.ts`/`.full-loop.test.ts`/`.live.test.ts`) depend on a
strict one-hypothesis-to-one-action mapping matched by id. Feeding
research-track hypotheses into that same list risked a second hypothesis
targeting the same (action kind, asset) pair as an existing one and
silently stealing its action slot in a given round — changing which
hypothesis a verified observation gets folded into. The research track
gets its own `Hypothesis`/`Finding` space instead, so it can never change
what the primary loop reports, while still executing through the *exact
same* primitives: `pipeline/tool-bridge.ts:executeActionViaRegistry`,
`reasoning/policy.ts`'s rate limiter, `findings/lifecycle.ts`'s state
machine, `evidence/store.ts`'s redaction. There is no second execution
implementation anywhere in this track.

**Anomaly engine** (`anomaly/engine.ts`) compares two structured
`ObservationSample`s (never full request/response — only status, header/
cookie *names*, a structural body fingerprint, content-type, redirects,
timing, auth state, authorization outcome, application/workflow/resource
state, cache header names) across 15 dimensions and reports what changed,
how significant it is, and — critically — a list of *competing*
explanations and distinguishing experiments, never a vulnerability claim.

**Research cascade** (`reasoning/cascade.ts`) turns one anomaly into
*multiple* competing hypotheses (one per plausible explanation), each
carrying its originating assumption, cross-linked to its competitors via
`competingHypothesisIds`. `resolveCompetingHypotheses` only declares a
winner once every alternative but one has actually been contradicted —
contradictions are structural (`Hypothesis.structuredContradictions`,
`worldmodel/provenance.ts`... — a `HypothesisContradiction` record with the
observation id and a note) and survive even once a hypothesis is
`discarded`, so a disproven lead remains available as negative evidence
(feeding `memory/hunt-memory.ts`). Deterministic termination: `maxDepth`,
`maxNewHypotheses`, and same-signature dedup are all enforced and reported
as `CascadeEvent`s, never silently.

**Provenance graph** (`worldmodel/provenance.ts`) is a persisted,
append-only edge list — `SOURCE -> TRANSFORMATION -> SINK`, each with its
own `Provenance`/confidence/verification state — kept separate from
`worldmodel/graph.ts`'s structural node/edge graph rather than folded into
it, so neither graph's existing persisted shape changes.
`recon/js-intel.ts` is the primary producer: a dynamic route segment, a
client-side auth/role check, or a feature flag gating a code path each
becomes an edge into a security-relevant sink kind (`cookie`,
`authorization-decision`, `redirect`, `workflow`, `dom-sink`,
`server-side-processing`), and `provenanceToHypotheses` turns a suspicious
one into a real hypothesis rather than only logging it.

**Application state/workflow graph + authorization matrix**
(`worldmodel/state-graph.ts`, `authz/matrix.ts`) record observed
`(actor, role, authState, fromState, action, resource, toState,
authorizationOutcome)` transitions and reason over them generically —
`detectUnexpectedTransitions`/`detectAuthorizationInconsistencies` need no
declared vulnerability class, and `findPrivilegeInversions` compares a
caller-declared role hierarchy against observed outcomes for the same
action/object/state (never guessing a hierarchy, and never performing
unauthorized access — only ever comparing identities the engagement
already tested).

**Attack-path discovery** (`worldmodel/attack-path.ts`) treats the
structural graph, the provenance graph, and the state graph as one combined
directed graph keyed by label, and finds cycle-safe, scope-checked,
depth-bounded paths from a JS/endpoint observation to a caller-defined
high-value target, scoring each chain as the product of its steps'
confidences — connecting a low-severity clue in one graph to a verified
signal in another, per the "a low-severity clue may become important when
connected" requirement. `pipeline/research-track.attack-path.live.test.ts`
proves this live: a real fetch of `testing/local-app-server.ts`'s search
page, real JS collection of its script, and the real DOM-XSS pattern in
that script produce a genuine provenance edge into the page asset, which
then chains into a workflow transition (seeded via
`worldmodel/state-graph.ts:saveStateGraph`, exactly as a prior round of
real behavioral testing would have recorded one) to reach a two-hop,
scope-checked, confidence-scored chain — the js-collection/provenance half
is genuinely live; the workflow-transition half is deterministically
seeded, and the test says so.

**Experiment designer** (`reasoning/experiment.ts`) turns a hypothesis into
an `Experiment` (objective, expected outcomes, information gain, cost,
risk, prerequisites, required authorization, validation criteria), priced
with the exact same `COST_BY_KIND` table `reasoning/actions.ts` already
uses, and picks the best risk-adjusted candidate — every non-selected
candidate's `deferred[].reason` literally states *why* ("do not test this
yet — X has a higher risk-adjusted information gain"). `experimentToHuntAction`
converts the winner into a plain `HuntAction`, so it flows through the
existing scope/policy/rate-limit/tool-registry pipeline unchanged; there is
no parallel execution path.

**Adversarial validation** (`validation/adversarial.ts`) runs a
researcher/skeptic/validator cycle before a hypothesis can produce a
finding: counterclaims are grounded in the hypothesis's own recorded
contradictions and unverified assumptions (never invented), and
`validationResult` can only be `'passed'` when at least one supporting
observation was independently verified — an LLM's or heuristic's
confidence number is never itself proof (see the live test below for a
demonstration that a real, unverified anomaly still correctly resolves to
`'inconclusive'`, not `'passed'`).

**Hunt memory** (`memory/hunt-memory.ts`) is a provenance-tracked
experience layer, persisted once per workspace (`hunt-memory.jsonl`, not
per engagement): `memoryFromFinding` only ever derives an entry from a
finding that has actually concluded (never a still-open "candidate"), and
`prioritizationMultiplier` is a bounded (0.5x-1.5x) nudge to future
scoring — never a hard include/exclude decision, and never a substitute for
the current engagement's own evidence. It is consulted in **both** tracks:
the research track's own experiment selection (scaling a candidate
experiment's information gain before `selectBestExperiment` ranks them —
see above) and, since it is loaded and threaded through by
`pipeline/adaptive-loop.ts` itself, the primary loop's own
`reasoning/hypothesis.ts:scoreHypothesisGroup`/`updateHypothesisWithObservation`
(each takes an optional `memory` parameter, defaulting to empty so every
pre-existing call site is unaffected). In both places the multiplier only
ever touches `priorityScore` — a vulnClass's program-wide track record can
change *which* still-open hypothesis looks worth investigating next, but
never `confidence`, which must stay an honest reflection of the current
engagement's own evidence. `reasoning/hypothesis.test.ts` and
`pipeline/adaptive-loop.test.ts`'s `'hunt memory from a prior engagement
genuinely biases hypothesis prioritization'` test prove this — the latter
seeds real memory from one engagement in a workspace and shows a
subsequent, different engagement in that same workspace prioritizes an
`authz` hypothesis differently because of it.

**Real execution stays opt-in**, exactly like `liveRecon`/`liveShannon`:
`AdaptiveHuntInput.researchTrack.live` (a `ToolRegistry` plus, for a live
`behavioral-diff` experiment, `behavioralAuthStatesByAsset`) is required
before the research track's experiment designer is allowed to actually run
a non-Shannon experiment; omitted, the track still computes real anomalies,
hypotheses, provenance, and attack chains from whatever was already
collected, and logs every deferred experiment.

**Shannon-kind experiments execute through the exact same authoritative
path the primary loop uses — never a second implementation.**
`pipeline/shannon-action.ts:executeShannonHuntAction` was extracted from
`pipeline/adaptive-loop.ts`'s own "shannon" action branch so both the
primary loop and the research track call the identical function: real
execution requires the research track's own, separate
`researchTrack.live.shannon.confirmed` (never inherited from the primary
loop's `liveShannon`, and never implied by `researchTrack.live` being
otherwise configured for non-Shannon experiments); without it, a
Shannon-kind experiment still safely plans/dry-runs and can ingest a
captured `researchTrack.shannonOutputsByAsset` fixture, exactly like the
primary loop's own default behavior. The research track enforces its own,
independent `ResearchTrackBudget.maxShannonExecutions` (default `1`)
*before* `shannon/eligibility.ts` or `shannon/execution-adapter.ts` ever
run — separate from, and never counted against, the primary loop's own
`HuntBudget.maxShannonExecutions`. A research-track finding is stored
under a `<engagementId>::research` id so it can never collide with — or be
mistaken for a duplicate of — the primary loop's own finding in
`findings/lifecycle.ts`'s shared, engagement-keyed storage (a real
regression caught and fixed while wiring this: without the distinct id, a
research-track finding written to disk before the primary loop's own
validation step could cause the primary loop's own, canonical finding to
be wrongly deduplicated against it).

`pipeline/research-track.test.ts` covers the full pipeline offline
(synthetic anomalies/provenance/transitions); `pipeline/research-track.live.test.ts`
proves the non-Shannon path end to end against `testing/local-app-server.ts`:
a real status-code anomaly on the fixture app's deliberately-buggy
`/api/admin/users` endpoint drives a real `BehavioralTestAdapter` execution
through the exact same gate chain the primary loop uses, and — because the
resulting observation is never independently verified — adversarial
validation correctly reports `'inconclusive'` and zero findings are
produced, live. `pipeline/research-track.shannon.test.ts` is the Shannon
equivalent (against an injected `spawnImpl`, never a real subprocess):
exploited/non-exploited/malformed/failed Shannon outputs, an unavailable
local repository, an unconfirmed-but-fixture-backed dry run, the
research-track's own Shannon budget, and out-of-scope blocking, plus a
static check that `pipeline/research-track.ts` never imports
`node:child_process` or calls `spawn` directly. `pipeline/adaptive-loop.test.ts`'s
`'a Shannon-kind research experiment executes live through runAdaptiveHunt'`
proves the same thing through the real top-level entry point, alongside
the primary loop's own independent, unaffected Shannon run.
`worldmodel/state-graph.test.ts`'s `'detectUnexpectedTransitions ignores
denied attempts'` test is the structural analogue for the workflow decoy
case: an access-control check that is *working correctly* must never be
reported as a finding.

### What the research track does not (yet) do

- A Shannon-kind experiment is never reachable from a state-graph or
  authorization-matrix hypothesis today, and this is a deliberate routing
  decision, not a missing test: `stateGraphAnomaliesToHypotheses` and
  `privilegeInversionsToHypotheses` only ever produce `vulnClass: 'authz'`
  or `'workflow-bypass'`, both routed to the cheap `behavioral-diff` action
  in `reasoning/actions.ts:ACTION_KIND_BY_VULN_CLASS` — a full source-aware
  Shannon re-scan is not the first thing to reach for on an authorization
  signal. `xss` (from a DOM-XSS provenance edge) remains the one class that
  routes to `shannon`. `reasoning/actions.test.ts`'s
  `'actionKindFor is generator-agnostic'` test proves the underlying claim
  directly — the same vulnClass routes through the same action kind
  regardless of which generator (provenance graph, state graph,
  authorization matrix) produced the hypothesis — without misrepresenting
  which vulnClasses those generators actually produce today.

## Program discovery, ranking, and the live hunt lifecycle

Before this section's modules existed, Hunter could only ever run against
one already-chosen program, supplied as a local scope file — there was no
concept of discovering or comparing candidates, and no path from the CLI to
a live engagement that did not require calling `runAdaptiveHunt()`
programmatically. `discovery/` and `orchestration/lifecycle.ts` close that
front half without touching the (already real, already well-tested) engine
behind it — `runHuntLifecycle` calls `runAdaptiveHunt` exactly as any other
caller would, once a program has been discovered, ranked, normalized, and
explicitly authorized.

**Program discovery** (`discovery/types.ts:ProgramDiscoveryProvider`) is a
provider interface, not a single implementation — this package ships two,
and both are offline/local, consistent with every other intake path here:

- **`discovery/fixture-provider.ts:FixtureDiscoveryProvider`** reads a local
  JSON array of `DiscoveredProgram` records —
  `fixtures/discovery/programs.json` is a synthetic 8-program dataset
  deliberately covering the review-relevant spread (high-bounty/
  high-competition, medium-bounty/low-competition/rich-app, huge-surface/
  low-bounty, a restrictive-ROE program, a no-bounty-but-interesting-API
  program, a stale/inactive program, and more) — used by every
  discovery/ranking test and by `orchestration/lifecycle.test.ts`'s
  end-to-end proof.
- **`discovery/h1-brain-provider.ts:H1BrainSnapshotProvider`** reads a
  pre-fetched HackerOne snapshot file. This package has zero third-party
  dependencies and makes no network calls of its own anywhere — `h1-brain`
  (the `mcp__h1-brain__*` MCP tools: `search_programs`,
  `fetch_program_scopes`, `hack`, `search_disclosed_reports`, …) is only
  reachable by the orchestrating Claude Code session, never by this Node
  package, so the honest integration point is a file: the operator or
  agent calls the real tools and writes what they returned into the
  documented `H1BrainSnapshot` shape, and `normalizeSnapshotProgram` derives
  a `ProgramSignal` only from a field that snapshot record actually
  contains — a program with no bounty range in its snapshot gets no
  `bountyAttractiveness` signal at all, never an invented one.

**The Program Opportunity Model** (`discovery/scoring.ts`) turns each
candidate's `signals` into one inspectable `ProgramOpportunityScore`: a
confidence- and freshness-weighted deviation from a neutral 0.5 prior, not
a black-box number. A signal a program doesn't carry is excluded from that
program's own denominator (named in `missingSignals`), never defaulted —
and a signal's trust (`confidence * freshnessFactor`) governs *how far*
its value is allowed to pull the score from neutral, so a stale or
low-confidence figure regresses toward "no strong opinion" rather than
being asserted at face value or silently cancelling out of the score
entirely (the latter was a real bug caught by
`scoring.test.ts`'s staleness test: with only one signal present, a naive
weighted-average formula lets confidence/freshness cancel out of the
ratio's numerator and denominator identically). `rankPrograms` sorts
descending by `totalScore` (ties broken by `evidenceWeight`, then
`programId`, for full determinism), and `explainSelection` turns the top
two candidates' component deltas into a plain-language
`"Program X ranked above Program Y because…"` sentence —
`fixture-provider.test.ts`'s `'the bundled dataset produces a rational,
inspectable ranking'` test proves the shipped 8-program dataset resolves to
a specific, reproducible winner, and `scoring.test.ts` proves changing the
dataset changes it.

**Normalization** (`discovery/normalize.ts:normalizeDiscoveredProgram`)
converts a selected `DiscoveredProgram` into a real `ProgramScope` by
constructing a raw object and running it through the exact same
`intake/hackerone.ts:parseProgramScope` validator every other scope path
uses — never a bespoke, less-strict conversion. An asset whose
`instruction` is `'unclear'` or whose `type` is `'unsupported'` is dropped,
never guessed into `'in-scope'`, and `authorizationConfirmed` is always
written `false` here; only `orchestration/lifecycle.ts`, acting on an
explicit human-supplied record, may ever flip it.

**ROE enforcement** (`discovery/roe.ts:isTechniqueAllowed`) is what makes
`ProgramScope.disallowedTechniques` — previously validated on intake and
never read again anywhere in the pipeline — an actual pre-execution
decision: `pipeline/tool-bridge.ts` checks it once per action kind and
again per candidate tool name (so a rule naming one specific tool blocks
only that adapter, not the whole action kind), and
`pipeline/shannon-action.ts` checks it before Shannon eligibility is even
evaluated. Matching is deliberately conservative: exact match against the
action kind/a short alias table/the tool name, or substring containment
once both sides are at least 4 characters (so a short rule can never
accidentally swallow an unrelated candidate).

**The live hunt lifecycle** (`orchestration/lifecycle.ts:runHuntLifecycle`)
sequences all of the above into one function with explicit states
(`DISCOVERY -> RANKING -> AWAITING_AUTHORIZATION -> READY -> RUNNING ->
COMPLETED`/`PAUSED`/`BLOCKED`/`FAILED`) and is what `cli.ts`'s `lifecycle`
command wraps — see "Live/authorized execution" above for the CLI contract,
and `orchestration/lifecycle.test.ts` for the full discover-rank-select-
authorize-run proof (including a live-timing-free version of the same
end-to-end assertions `pipeline/adaptive-loop.test.ts`'s "full bundled
simulation" test makes, reached this time through the lifecycle entry
point rather than a direct `runAdaptiveHunt()` call).

**Bootstrap recon can now be genuinely live, not just fixture-driven.**
`recon/live-bootstrap-sources.ts:buildLiveBootstrapSources` wraps the real
passive/active `ToolAdapter`s (`recon/cli-adapters.ts`) as bootstrap
`ReconSource`s — before this module, the only shipped `ReconSource`
implementation was `recon/sources.ts:LocalFixtureReconSource`, so a live
engagement could investigate a target once the round loop selected an
action, but could never seed its *initial* hypotheses from anything but a
fixture. Only tools whose bootstrap value is pure discovery
(certificate-transparency/subfinder/chaos/gau/waybackurls/amass for
passive; httpx/katana/naabu for active) are wrapped — ffuf/nuclei stay
investigation-only, reachable solely through the round loop's own
tool-bridge gate chain, so their `Observation`s (a bootstrap `ReconSource`
can only return `RawDiscovery[]`) are never silently dropped.

**Bootstrap recon streams into the world model, source by source.**
`recon/sources.ts:runReconSourcesStreaming` fires its callback the instant
each individual source's own promise settles, not after every source in
the batch does — `pipeline/adaptive-loop.ts`'s bootstrap phase uses this to
fold a fast source's discoveries into the world model (and so make them
eligible for correlation) while a slower sibling source is still running,
rather than waiting for the whole batch. `sources.test.ts`'s
`'runReconSourcesStreaming fires a fast source's callback while a slow
sibling source is still running'` test proves this with real timestamps,
not just code inspection — the property this closes is specifically
"Recon A completes → its result is usable → Recon B is still running,"
distinct from (and in addition to) the concurrency `runReconSources`
already had.

## What's still not wired up (read before assuming more than is implemented)

- **Local, signature-based deduplication only.** `LocalSignatureDeduplicator`
  compares findings within one engagement; `dedup/local-dedup.ts`'s
  `DisabledDisclosedReportProvider` reports `PROVIDER_DISABLED` by default,
  and the API-backed provider variant reports `PROVIDER_ERROR` even with
  credentials present — no live HackerOne API call is implemented
  (deliberately, per this phase's scope). Disclosed-report data is
  reachable for *discovery/ranking* purposes via
  `discovery/h1-brain-provider.ts`'s snapshot (`disclosedReportDensity`/
  `vulnClassHistory` signals), but that is a separate thing from live
  duplicate-report search at finding time, which remains unimplemented.
- **`shannonOutputsByAsset` is a flat map.** A real integration needs to
  handle re-scanning the same asset across rounds, or route to
  `executeShannonAction` every time instead.
- **No genuine multi-program economics data (payout history, real
  researcher-activity counts) is fetched automatically.** The Program
  Opportunity Model is real and inspectable, but every signal still has to
  be supplied by a provider — the fixture dataset supplies realistic
  illustrative values by hand, and the h1-brain snapshot provider derives
  what it can from whatever fields the snapshot file actually contains. A
  provider that computes these from a live payout/report history API is a
  natural next addition, not a redesign.

## Next phase

1. Give `HackerOneApiIntake` and a real `HackerOneApiDisclosedReportProvider`
   HTTP call once a credential/auth flow is designed, keeping the existing
   honest status enum (`NO_PROVIDER`/`PROVIDER_DISABLED`/`PROVIDER_ERROR`/
   `MATCH_FOUND`/`NO_MATCH`).
2. Extend `executeShannonAction`'s report discovery to handle multiple
   Shannon runs against the same asset across rounds.
3. A `ProgramDiscoveryProvider` backed by a live HackerOne API call
   (credentials/auth flow permitting), producing `ProgramSignal`s the same
   shape `discovery/h1-brain-provider.ts` already derives from a snapshot —
   the scoring/ranking/lifecycle layers need no changes to consume it.
