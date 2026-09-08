# /goal: Finish result clarity and run provenance

**Category:** VERIFY, with corrections confined to the reporting feature.
**Status:** Complete for offline acceptance; runtime limits are recorded below.
**Scope:** Passive report summaries, run/attempt metadata, terminal observations, offline tests, and documentation in this checkout.

## Objective

The result-reporting implementation is independently accepted against the six criteria below, with reproducible evidence and explicit limits on what was verified.

## Parameters and current binding

This goal can be reused for another checkout by setting `{repository_root}`, `{worker_package}`, `{behavior_document}`, and `{acceptance_record}` and collecting new evidence. Existing verdicts must not be carried forward to changed code without review.

| Parameter | Current value |
| --- | --- |
| `{repository_root}` | Repository containing this document; commands run from its root |
| `{worker_package}` | `@shannon/worker` |
| `{behavior_document}` | `docs/result-clarity.md` |
| `{acceptance_record}` | `docs/goals/result-clarity.md` |

## Success criteria and evidence

All six criteria must pass. Code and test locations below are relative to `apps/worker/` unless prefixed with `docs/`. References identify evidence; they do not imply an entire test suite was executed.

| ID | Pass/fail criterion | Verdict and evidence |
| --- | --- | --- |
| C1 | Reports separate execution outcome, findings, recorded activity, unresolved work, and unknown information. Neither completion nor zero findings implies security or complete coverage. | PASS. `src/blackbox/run-summary.ts:114` derives separate counts and states the limits; `src/blackbox/artifacts.ts:185` retains the empty-findings limitation for every terminal status. Assertions: `test/blackbox-run-summary.test.mjs:60`, `:76`, `:97`, `:110`; `test/blackbox-artifacts.test.mjs:177`. |
| C2 | Offline evidence verifies stable run identity, attempt lineage, recorded code/model provenance, result ownership, and preservation through retries, copies, and repair. | PASS. `src/audit/run-metadata.ts:186`, `:274`, `:294`; committed result owner at `src/blackbox/activities.ts:1147`; result-attempt display at `src/blackbox/run-summary.ts:63`. Assertions: `test/run-metadata.test.mjs:35`, `:65`, `:105`, `:122`, `:142`, `:205`, `:221`; `test/blackbox-artifacts.test.mjs:332`; publication-outage integration case at `test/blackbox-activities.test.mjs:2996`. |
| C3 | Terminal reasons and times come from recorded observations. Legacy metadata and unobserved endings remain unknown; later attempts cannot reattribute an earlier result. | PASS. `src/audit/run-metadata.ts:269`, `:294`, `:327`, `:343`; closed-execution observation at `src/temporal/worker.ts:463`; workflow timestamp at `src/temporal/blackbox-workflow.ts:239`. Assertions: `test/run-metadata.test.mjs:90`, `:180`, `:196`, `:233`, `:253`; `test/blackbox-run-summary.test.mjs:144`, `:162`. |
| C4 | Preserve four artifact filenames and the findings-array format, with no changes to scheduling, replay, verification policy, authentication, permissions, or finding acceptance. | PASS by scoped diff review and artifact assertions. Manifest/projections: `src/blackbox/artifacts.ts:22`, `:86`, `:243`; assertions: `test/blackbox-artifacts.test.mjs:114`, `:271`, `:305`, `:332`. Optional metadata input at `src/blackbox/activities.ts:100` preserves legacy workflow payload behavior. |
| C5 | Observed build, focused offline tests, relevant formatting, and diff checks pass; independent review finds no unresolved in-scope correctness issue. | PASS: worker build, 30 reporting/metadata/artifact tests, two selected activity integration tests, seven-file Biome check, and implementation diff check. Metadata and reporting source reviews by a reviewer who did not implement those sources passed. That reviewer previously authored metadata tests; review roles are disclosed below. |
| C6 | Behavior documentation matches code, and this record contains criterion verdicts, reproducible commands, observed results, review disposition, and verification limits. | PASS. Independent reporting review confirmed `docs/result-clarity.md` matches the implementation. Acceptance-record review confirmed the test counts, selected commands, execution chronology, and runtime limits. The final record distinguishes author self-review from independent implementation review. |

## Constraints

- MUST NOT fabricate data, sources, credentials, results, or runtime observations; weaken validation to obtain a pass; expand attack, exploit, scanning, or autonomous offensive capabilities; overwrite unrelated work; commit, push, publish, deploy, or contact third parties.
- MUST preserve public contracts, security boundaries, dependencies, and lockfiles. Corrections must remain within passive reporting/provenance behavior.
- LIMIT: zero live target requests, zero provider/model calls, and zero external state mutations. Use local synthetic fixtures and source inspection.
- Stop when all six criteria pass and this record is complete. Record a missing required check as incomplete, without inferring success. Do not repeat unchanged passing checks without a new change, defect, or unresolved concern.

## Output specification

- Existing reporting implementation and focused tests under `apps/worker/`, with only necessary in-scope corrections.
- `docs/result-clarity.md`: report semantics, recorded provenance, historical-data handling, and runtime limitations.
- `docs/goals/result-clarity.md`: this specification, criterion verdicts, commands/results, independent reviews, verification limits, and completion status.
- Local reviewable files only; no release or deployment is part of this goal.

## Verification method and observed results

The implementation checks below passed immediately before this goal was created, after the final metadata corrections. No implementation files have changed during goal closeout. They are retained as observed evidence, not represented as new executions. The goal closeout adds independent source review and this acceptance record.

Run from `{repository_root}` using the installed repository dependencies:

```powershell
pnpm --filter @shannon/worker build
```

Observed: exit 0; worker TypeScript compiled.

```powershell
node --test --test-reporter=dot apps/worker/test/run-metadata.test.mjs apps/worker/test/blackbox-run-summary.test.mjs apps/worker/test/blackbox-artifacts.test.mjs
```

Observed: exit 0; 30 tests passed. These exercise synthetic metadata histories, rendering, publication, and file copies.

```powershell
node --test --test-name-pattern='an incomplete publication outage|failed terminal CAS' apps/worker/test/blackbox-activities.test.mjs
```

Observed: exit 0; two selected integration tests passed. One injects a publication failure after terminal state is committed, then verifies repair retains the original result provenance and performs no external work. The other verifies a failed terminal state commit publishes nothing and leaves metadata unfinalized. This is not a claim that the full activity test file passed.

```powershell
pnpm exec biome check apps/worker/src/types/run-metadata.ts apps/worker/src/audit/run-metadata.ts apps/worker/src/blackbox/run-summary.ts apps/worker/src/blackbox/activities.ts apps/worker/src/blackbox/artifacts.ts apps/worker/src/temporal/blackbox-workflow.ts apps/worker/src/temporal/worker.ts
git diff --check
```

Observed: Biome passed for all seven changed TypeScript files without fixes; the implementation diff check passed. No all-repository test or lint pass is claimed.

An independent checker can map C1-C6 to these named cases and source references, reproduce the commands, and compare the current scoped diff. A changed implementation invalidates this acceptance until affected checks and review are updated.

## Independent review disposition

- **Metadata lifecycle reviewer (`maintenance_review`): PASS.** Read-only final audit of stable IDs, lineage, result ownership, retry/repair behavior, terminal observations, legacy handling, and unchanged execution policies. No unresolved in-scope correctness gaps under the documented serialized workspace lifecycle. This reviewer did not implement the metadata sources but previously authored `test/run-metadata.test.mjs`; its review of those tests is not author-independent.
- **Independent reporting reviewer (`maintenance_review`): PASS.** Separate source review confirms C1, C4, result attribution, and the behavior-document portion of C6. This reviewer did not author reporting implementation, reporting tests, or behavior documentation. No actionable reporting defect found.
- **Reporting author self-review (`report_quality`): PASS.** Static closeout audit of reporting semantics, unknown values, result attribution, artifact compatibility, metadata escaping, and behavior documentation. This agent previously authored reporting code, so this pass is not independent of implementation.
- **Acceptance-record audit (`report_quality`): resolved.** Test counts, selected integration cases, execution chronology, and runtime limits were confirmed. The identified wording issue about reviewer independence has been corrected, and the separate implementation-independent reporting review passed.
- Neither reviewer reran tests or edited files during these closeout audits. Their static conclusions are separate from the observed executions above.

## Verification limits

- No live assessment, provider request, Docker image build, deployment, or real Temporal runtime execution was performed. Offline acceptance does not establish runtime integration or assessment efficacy.
- Starting or resuming the same workspace concurrently remains unsupported. Acceptance assumes serialized starts.
- A hard kill, unavailable Temporal status, or ambiguous start response may leave no observed ending. The metadata journal can contain observations recorded after a report was published; that report retains its original recorded result.
- Configured model metadata does not prove a model call occurred or identify an immutable deployment behind an alias. The code digest covers installed worker JavaScript, excluding dependencies and prompts; packaged workers without Git retain unknown revision/dirty values.
- Worker and Temporal clocks may differ. Timestamps do not establish cross-clock durations.
- Existing saved reports are not rewritten, and missing historical provenance is not reconstructed. Evidence/credential payload handling is unchanged; synthetic test fixtures verify the existing contract.
- Work remains uncommitted. Unrelated working-tree changes were preserved.

## Failure modes to prevent

| Failure mode | Prevention and evidence |
| --- | --- |
| Zero findings or observed traffic is mistaken for security or total coverage. | Separate measures and explicit report limits; C1 fixtures. |
| A resume, retry, or report repair takes ownership of an earlier result. | Stable run identity, linked attempts, and committed result-owner assertions; C2-C3. |
| Missing terminal information is replaced with a plausible invented cause or timestamp. | Preserve unknowns and require recorded observations; C3. |
| Passing fixtures are described as a live-runtime or full-suite validation. | Record exact selected commands and distinguish static review, offline execution, and unverified integration. |

## Examples

**Acceptable:** Given result attempt A and a later repair attempt B, the repaired report retains A's original result provenance while listing B separately. An unobserved ending remains unknown.

**Unacceptable:** A copied report takes the current machine's model/revision as its provenance, or an empty findings list is described as a secure application.

## Completion record

All six criteria passed. Goal closeout required no implementation changes: it added source review, documented reviewer authorship accurately, and saved this acceptance record. The final scoped tracked diff check passed; this document was read back and checked for trailing whitespace and conflict markers. Build and test results remain the previously observed executions listed above. Acceptance ends at local offline verification, with the runtime limits explicitly retained.
