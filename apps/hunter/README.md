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
| Scope schema + deterministic validator (tiers, bounty eligibility, auth requirements, rate limit) | `src/types.ts`, `src/scope/validator.ts`, `src/scope/matching.ts` |
| HackerOne intake abstraction | `src/intake/hackerone.ts` (`ProgramIntake`; `LocalFileIntake` implemented, `HackerOneApiIntake` a disabled stub) |
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
| CLI | `src/cli.ts` |
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
  which reasoning provider selected the action, and there is no CLI flag
  for it (see "Live Shannon execution" below). `shannon/eligibility.ts`
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
- **HackerOne intake and submission are both stubs by design.**
  `HackerOneApiIntake` throws "not implemented"; `report/draft.ts` only
  ever writes a local file, banner-marked `DRAFT — NOT SUBMITTED`.
  `dedup/local-dedup.ts`'s `DisclosedReportProvider` reports one of
  `NO_PROVIDER` / `PROVIDER_DISABLED` / `PROVIDER_ERROR` — never a
  fabricated `NO_MATCH` — when live HackerOne duplicate search is not
  actually available.
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
```

Or via the `/hunt` slash command, which wraps the same CLI with a
confirmation step.

### Live/authorized execution — deliberately not a CLI flag

There is no `--live` flag: `hunter hunt` only runs `--simulate`. Wiring a
real engagement's recon sources, JS/behavioral targets, and Shannon output
capture is a programmatic `runAdaptiveHunt()` call, and live Shannon
execution additionally requires `liveShannon: { confirmed: true }` on that
call — both are deliberate integration decisions, not something a
command-line flag should make easy to trigger by accident. For running
Shannon itself for real right now, independent of Hunter, use `/shannon`,
which already has its own confirmation flow:

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
connected" requirement.

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
the current engagement's own evidence.

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

- Attack-path discovery has no dedicated live E2E test — `research-track.test.ts`
  exercises it against a synthetic combined graph; a live demonstration
  connecting a real JS discovery through a real provenance edge to a real
  state-graph transition is future work.
- Hunt memory is loaded once per research-track run (from prior engagements'
  *concluded* findings only — never from this run's own in-progress work)
  and `prioritizationMultiplier` scales each candidate experiment's
  information gain before `selectBestExperiment` ranks them — a bounded
  0.5x-1.5x nudge, never a hard include/exclude decision.
- There is no dedicated live E2E test for a Shannon-kind experiment
  discovered via the workflow/state-graph or authorization-matrix path
  (only via a real DOM-XSS provenance edge, `xss` -> `shannon`); the
  underlying wiring is identical regardless of which generator produced the
  hypothesis, since `reasoning/actions.ts:actionKindFor` is the single
  routing table all of them share.

## What's still not wired up (read before assuming more than is implemented)

- **Local, signature-based deduplication only.** `LocalSignatureDeduplicator`
  compares findings within one engagement; `dedup/local-dedup.ts`'s
  `DisabledDisclosedReportProvider` reports `PROVIDER_DISABLED` by default,
  and the API-backed provider variant reports `PROVIDER_ERROR` even with
  credentials present — no live HackerOne API call is implemented
  (deliberately, per this phase's scope).
- **`shannonOutputsByAsset` is a flat map.** A real integration needs to
  handle re-scanning the same asset across rounds, or route to
  `executeShannonAction` every time instead.

## Next phase

1. Give `HackerOneApiIntake` and a real `HackerOneApiDisclosedReportProvider`
   HTTP call once a credential/auth flow is designed, keeping the existing
   honest status enum (`NO_PROVIDER`/`PROVIDER_DISABLED`/`PROVIDER_ERROR`/
   `MATCH_FOUND`/`NO_MATCH`).
2. Extend `executeShannonAction`'s report discovery to handle multiple
   Shannon runs against the same asset across rounds.
