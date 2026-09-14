---
description: Run the hunter adaptive recon + reasoning controller — program discovery/ranking, scope validation, multi-source discovery, hypothesis generation, next-best-action selection, Shannon integration, validation, and a HackerOne report draft — against an authorized target
---

You are operating **hunter** (`apps/hunter/`), the local controller
foundation for an autonomous HackerOne engagement with Claude Code as the
reasoning layer and Shannon 1.9.0 as one execution engine among others.

Two entry points exist today, and this command must ask the user which one
they want before doing anything else — see "Step 0" below:

- **`hunter hunt --simulate`** — the original MVP: runs the full adaptive
  loop against the bundled offline scenario in `fixtures/simulation/`. No
  program discovery, no target selection — the target is fixed.
- **`hunter lifecycle`** — discovers candidate programs (from a local
  dataset file or an `h1-brain` snapshot file — see "Program discovery"
  below), ranks them with an inspectable opportunity score, selects the
  best one, and *stops*, printing its scope/ROE/rationale, until the
  operator supplies an explicit `--authorize <file>`. Only then does it
  write a normalized, authorized scope file and run the real adaptive loop
  against the selected program. **Discovery and ranking are always
  offline/read-only; nothing runs against a real target until an explicit
  authorization file exists.**

It runs the full workflow: DISCOVER PROGRAMS → RANK → SELECT → SCOPE →
DISCOVER → ENUMERATE → CORRELATE → UNDERSTAND → OBSERVE → HYPOTHESIZE →
PRIORITIZE → SELECT NEXT-BEST ACTION → INVESTIGATE → LEARN → UPDATE MODEL →
REPEAT → VALIDATE → EVIDENCE → DEDUPLICATE → HACKERONE REPORT DRAFT → HUMAN
REVIEW. Each round, a
reasoning provider (Claude-backed when `ANTHROPIC_API_KEY` is configured,
a deterministic heuristic provider otherwise — `reasoning/router.ts`)
*proposes* the next-best action; a deterministic policy gate
(`reasoning/policy.ts`) only allows it to run if it matches a real queued
action and fits the configured budget — a hallucinated target is rejected
and the loop falls back to deterministic selection instead of stalling.
The action then "investigates" (in this MVP, by reading a caller- or
fixture-supplied result — Shannon's own output for a `shannon` action,
never a live probe unless `liveShannon.confirmed` was explicitly set
programmatically, which this command never does), folds the result back
into the hypothesis it targeted (which can strengthen it, weaken it, or
flip it to "contradicted" and drop it from consideration), and checkpoints
before the next round. Every round's reasoning decision is recorded in
`checkpoint.decisions`.

After that round loop, every run also executes the **research track**
(`pipeline/research-track.ts`) automatically — anomaly detection, a
competing-hypothesis cascade, a provenance graph, an application state/
workflow graph, an authorization matrix, attack-path discovery, an
experiment designer, adversarial validation, and hunt memory. It is a
second, independent hypothesis/finding space (see "What the research
track found" below) that can never change the primary loop's own
`finding`/`checkpoint` — it only ever *analyzes* what the round loop above
already collected. This command never configures `researchTrack.live`, so
the research track's own experiment designer only ever plans/dry-runs —
including for a `shannon`-kind research experiment, which requires its own
separate, programmatic `researchTrack.live.shannon.confirmed` this command
never sets, exactly like `liveShannon` above.

**Only one concrete run mode exists today: `hunter hunt --simulate`**, which
runs this entire loop against the bundled offline scenario in
`apps/hunter/fixtures/simulation/` — multiple domains discovered by
overlapping passive sources, JS bundles (one with a DOM-XSS candidate, one
with a secret/internal-host/feature-flag mix), a behavioral auth-state
comparison (one lead here turns out to be a false positive and is
abandoned), and a captured Shannon output for the one finding that survives
to a validated, drafted report. **There is no live-target mode yet** — a
real engagement means wiring real recon-source adapters and a real captured
Shannon output into `runAdaptiveHunt()` directly; do not attempt to
improvise that from this command.

## Hard safety rules — do not deviate

- **"Start hunting" is never authorization to test anything.** Program
  discovery and ranking (`hunter discover`/`hunter rank`/`hunter lifecycle`
  without `--authorize`) are always read-only and offline — they only ever
  read a local dataset file (or a local h1-brain snapshot file the operator
  or a prior tool call produced; there is no live HackerOne API call
  anywhere in this package). Nothing runs against a real target until the
  operator has reviewed the printed scope/ROE and written a real
  `AuthorizationRecord` JSON file (`{confirmed:true, confirmedBy,
  confirmedAt, scopeReviewed:true}`) passed via `--authorize <file>`. Do not
  fabricate this file on the user's behalf or treat a verbal "yes" as
  equivalent to it — ask the user to confirm they reviewed the printed
  scope, then either help them write the file with the details they gave
  you, or have them provide it themselves.
- **ROE (`disallowedTechniques`) is enforced, not just recorded.** A
  program's declared disallowed techniques (e.g. "active scanning",
  "fuzzing", "denial of service") are checked before every recon/Shannon
  action actually runs (`discovery/roe.ts`, wired into
  `pipeline/tool-bridge.ts` and `pipeline/shannon-action.ts`) — a blocked
  action is reported as `BLOCKED_BY_POLICY` with the matched rule, never
  silently skipped or silently allowed.
- **Never invoke Shannon for real except via `hunter lifecycle
  --authorize <file> --live-shannon`, and never pass `--live-shannon`
  yourself without the user explicitly asking for a live Shannon run in
  this hunt.** By default, every "shannon" action only plans the invocation
  (`shannon/config.ts` + `shannon/invoke.ts:planInvocation`) and, if a
  captured output file is already available for that asset, ingests it —
  this is the *only* behavior for `hunt --simulate` and for `lifecycle`
  without `--live-shannon`. If the user wants to actually launch a scan
  outside of a hunt entirely, point them at `/shannon` (its own explicit
  confirmation step) instead.
- **Never contact HackerOne or submit a report.** Report drafts are always
  local Markdown files banner-marked "DRAFT — NOT SUBMITTED". Submission is
  manual and out of scope for this command, in both modes.
- **Scope validation must pass before anything else runs**, and no
  observation whose asset resolves to an out-of-scope host may ever
  influence a hypothesis or action (`recon/scope-tagging.ts:filterInScopeObservations`).
  If scope validation fails, stop and report why.
- **A program scope only ever comes from a local file — never a live
  network call from inside this package.** `hunter hunt`/`scope-validate`
  read an operator-exported scope file (`intake/hackerone.ts`); `hunter
  discover`/`rank`/`lifecycle` read either a local synthetic dataset file or
  a local h1-brain *snapshot* file (`discovery/h1-brain-provider.ts`) — a
  file the operator or a prior `mcp__h1-brain__*` tool call produced, not
  something this package fetches itself. `HackerOneApiIntake` remains an
  intentionally disabled stub.
- **A finding is never claimed beyond its actual validation stage.** Report
  exactly what the run's `finding.status` and `finding.transitionLog` say
  (`candidate → investigated → reproduced → independently_validated →
  impact_demonstrated → deduplicated → report_ready → reported`, or
  `rejected`/`duplicate`) — never round up "investigated" to "confirmed".

## Step 0: Which mode?

Ask the user which they want:

1. **Simulation** — the bundled offline scenario, no target selection, safe
   to run with zero setup. Go to "Simulation mode" below.
2. **A real hunt** — discover candidate programs from a dataset the user
   already has (a local JSON file — see `fixtures/discovery/programs.json`
   for the expected shape — or an h1-brain snapshot file), rank them, and
   (only after the user explicitly authorizes it) run the adaptive loop
   against the winner. Go to "Live discovery/selection mode" below.

If the user just says "start hunting" with no further detail, ask which of
these two they mean — do not assume.

## Simulation mode

### Step 1: Confirm before running

Tell the user this will run the bundled offline simulation only (no real
target, no network, nothing executed against anything) and ask for:

1. **Workspace directory** — where engagement state, world model, evidence,
   and any report draft are written (e.g. `./.hunter-workspace`).
2. **Max rounds** (optional, default 6) — an upper bound on how many
   next-best-action rounds to run.
3. **Engagement ID** (optional) — to resume a prior run in that same
   workspace directory instead of starting fresh.

### Step 2: Run it

```bash
pnpm --filter @shannon/hunter run build
node apps/hunter/dist/cli.js hunt --simulate \
  --workspace-dir <WORKSPACE_DIR> \
  --max-rounds <N> \
  [--max-actions <N>] \
  [--engagement-id <ID>] \
  [--resume]
```

## Live discovery/selection mode

### Step 1: Get a programs dataset

Ask the user for a path to a JSON file of candidate programs (an array
shaped like `fixtures/discovery/programs.json` — see
`discovery/types.ts:DiscoveredProgram`), or an h1-brain snapshot file (see
`discovery/h1-brain-provider.ts:H1BrainSnapshot`). If they want the latter
and don't already have one, you may build it yourself by calling the real
`mcp__h1-brain__search_programs`/`fetch_program_scopes`/`hack`/
`search_disclosed_reports` tools and writing what they return into that
shape — this is still entirely local once written; hunter itself never
calls those tools.

### Step 2: Discover and rank, read-only

```bash
node apps/hunter/dist/cli.js discover --programs <FILE> [--provider fixture|h1-brain]
node apps/hunter/dist/cli.js rank --programs <FILE> [--provider fixture|h1-brain]
```

Summarize the ranking and, for the winner, the `rationale` string
(`"Program X ranked above Program Y because…"`) — this is the "why this
program" the review process cares about. Do not proceed further without the
user's go-ahead.

### Step 3: Authorization — a real artifact, not a flag

If the user wants to proceed, have them confirm they reviewed the winning
program's scope/ROE, then help them write an `AuthorizationRecord` file:

```json
{
  "confirmed": true,
  "confirmedBy": "<user's name/handle>",
  "confirmedAt": "<ISO timestamp>",
  "scopeReviewed": true,
  "note": "<why this hunt/what's being authorized>"
}
```

### Step 4: Run the lifecycle

```bash
node apps/hunter/dist/cli.js lifecycle \
  --programs <FILE> [--provider fixture|h1-brain] \
  --workspace-dir <WORKSPACE_DIR> \
  --engagement-id <ID> \
  --max-rounds <N> \
  --authorize <AUTHORIZATION_FILE> \
  [--repo <LOCAL_REPO_PATH>] \
  [--live-recon [--wordlist <PATH>] [--nuclei-severity <critical,high,...>] [--amass-output-dir <DIR>]] \
  [--live-shannon]
```

Without `--live-recon`, the hunt still runs but has no recon sources to
seed hypotheses from (it will genuinely complete with zero hypotheses —
report this honestly, never as a failure). `--live-recon` wires up real
recon adapters (`recon/live-bootstrap-sources.ts` +
`tools/default-registry.ts`) for both bootstrap discovery and round-loop
investigation — **this makes real outbound network requests against the
selected program's real assets.** Only pass it when the user has explicitly
authorized active testing of that real target; never pass it against a
synthetic/fixture program. `--live-shannon` is the same deliberate,
separate confirmation `liveShannon.confirmed` always required — only pass
it when the user explicitly asks for a live Shannon run in this hunt.

Other available subcommands, for inspecting one phase at a time (still
fully offline):

```bash
hunter scope-validate --program <file> --url <url> --repo <path>
hunter shannon-plan --url <url> --repo <path> [--workspace <name>]
hunter ingest --input <shannon-output.json>
hunter world-model --workspace-dir <dir> --engagement-id <id>
hunter hypotheses  --workspace-dir <dir> --engagement-id <id>
hunter checkpoint  --workspace-dir <dir> --engagement-id <id>
```

`hunter hunt` has no `--live` flag, deliberately — see
`apps/hunter/README.md`'s "Live/authorized execution" section. `hunter
lifecycle` does have `--live-recon`/`--live-shannon`, but both require the
`--authorize <file>` artifact from Step 3 above first, and neither is ever
implied by the other or by running `lifecycle` at all — do not improvise a
shortcut past that file.

## Reporting results (both modes)

Summarize, from the JSON the CLI printed:

- (Live discovery/selection mode only) The lifecycle's `finalState` and its
  `transitions` — if it stopped at `AWAITING_AUTHORIZATION` or `BLOCKED`,
  say exactly why and what the user needs to do next; never describe a
  `BLOCKED`/`AWAITING_AUTHORIZATION` result as if the hunt ran.
- Scope validation result and which asset matched.
- Recon summary: how many discoveries per source, how many were corroborated
  by 2+ independent sources, how many were skipped as out-of-scope.
- How many hypotheses were generated, and — for the ones worth mentioning —
  their `vulnClass`, `assetRef`, `status`, and `confidence`.
- The round-by-round `log`: which action was selected each round and why
  (`rationale`), and what it produced (or why it was skipped, e.g. "no
  investigation fixture available" or "Shannon skipped: black-box target").
- Whether a finding was produced, its exact `status`, and — if a report
  draft was written — its file path plus the reminder that it requires
  human review and manual HackerOne submission.
- The recon-quality `metrics` (unique assets, cross-source correlation,
  validated-finding rate, evidence completeness, etc.) if the user wants
  them.

### What the research track found

The JSON also carries a `research` object — a second, independent
hypothesis/finding space (see the module docstring in
`pipeline/research-track.ts` for why it is kept separate from the primary
loop's own `finding`/`checkpoint` above). Summarize it distinctly, never
folded into the primary loop's own results:

- `research.hypothesisCount` and, for the ones worth mentioning, each
  hypothesis's `vulnClass`, `assetRef`, `status`, `confidence`, and — where
  present — its `assumptions` and `competingHypothesisIds` (multiple
  competing explanations for the same anomaly, not yet resolved).
- `research.anomalyCount` and `research.attackChainCount` — these came from
  anomaly detection and attack-path discovery over the same bootstrap data,
  never from a live probe in this command.
- `research.findings` — always empty when run through this command, since
  `researchTrack.live` is never configured here; if the user asks "did the
  research track find anything," the honest answer is "it generated
  hypotheses/leads for investigation, but ran no real experiment against
  them because this command never enables live execution."

Re-running the same `--workspace-dir` and `--engagement-id` resumes the
hunt (reloads the world model and hypotheses instead of re-running recon)
rather than starting over.
