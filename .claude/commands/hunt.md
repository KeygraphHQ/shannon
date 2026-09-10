---
description: Run the hunter adaptive recon + reasoning controller — scope validation, multi-source discovery, hypothesis generation, next-best-action selection, Shannon integration, validation, and a HackerOne report draft — against an authorized target
---

You are operating **hunter** (`apps/hunter/`), the local controller
foundation for an autonomous HackerOne engagement with Claude Code as the
reasoning layer and Shannon 1.9.0 as one execution engine among others.

It runs the full workflow: SCOPE → DISCOVER → ENUMERATE → CORRELATE →
UNDERSTAND → OBSERVE → HYPOTHESIZE → PRIORITIZE → SELECT NEXT-BEST ACTION →
INVESTIGATE → LEARN → UPDATE MODEL → REPEAT → VALIDATE → EVIDENCE →
DEDUPLICATE → HACKERONE REPORT DRAFT → HUMAN REVIEW. Each round, a
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

- **Never invoke Shannon for real from this command.** Every "shannon"
  action only plans the invocation (`shannon/config.ts` +
  `shannon/invoke.ts:planInvocation`) and, if a captured output file is
  already available for that asset, ingests it. Nothing here ever spawns
  Shannon. If the user wants to actually launch a scan, point them at
  `/shannon` (its own explicit confirmation step) — do not improvise a
  live-execution path here.
- **Never contact HackerOne or submit a report.** Report drafts are always
  local Markdown files banner-marked "DRAFT — NOT SUBMITTED". Submission is
  manual and out of scope for this command.
- **Scope validation must pass before anything else runs**, and no
  observation whose asset resolves to an out-of-scope host may ever
  influence a hypothesis or action (`recon/scope-tagging.ts:filterInScopeObservations`).
  If scope validation fails, stop and report why.
- **Only accept a program scope from a local file.** There is no live
  HackerOne API integration (`HackerOneApiIntake` is an intentionally
  disabled stub) — never attempt to fetch scope from the network.
- **A finding is never claimed beyond its actual validation stage.** Report
  exactly what the run's `finding.status` and `finding.transitionLog` say
  (`candidate → investigated → reproduced → independently_validated →
  impact_demonstrated → deduplicated → report_ready → reported`, or
  `rejected`/`duplicate`) — never round up "investigated" to "confirmed".

## Step 1: Confirm before running

Tell the user this will run the bundled offline simulation only (no real
target, no network, nothing executed against anything) and ask for:

1. **Workspace directory** — where engagement state, world model, evidence,
   and any report draft are written (e.g. `./.hunter-workspace`).
2. **Max rounds** (optional, default 6) — an upper bound on how many
   next-best-action rounds to run.
3. **Engagement ID** (optional) — to resume a prior run in that same
   workspace directory instead of starting fresh.

## Step 2: Run it

```bash
pnpm --filter @shannon/hunter run build
node apps/hunter/dist/cli.js hunt --simulate \
  --workspace-dir <WORKSPACE_DIR> \
  --max-rounds <N> \
  [--max-actions <N>] \
  [--engagement-id <ID>] \
  [--resume]
```

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

There is no `--live` flag, deliberately — see `apps/hunter/README.md`'s
"Live/authorized execution" section. Do not improvise one.

## Step 3: Report results

Summarize, from the JSON the CLI printed:

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

Re-running the same `--workspace-dir` and `--engagement-id` resumes the
hunt (reloads the world model and hypotheses instead of re-running recon)
rather than starting over.
