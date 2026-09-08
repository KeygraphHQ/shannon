# Repository review acceptance — 2026-09-07

**Result: R1–R7 passed.** The bounded repository-review goal is complete. The delivered workflow reviews local projects, stores validated deterministic snapshots and compares observations with honest new/unchanged/removed/unknown outcomes. Acceptance establishes the finite supported workflows, not perfect field accuracy.

## Delivered behavior

- Existing six OpenAPI/Compose rules reused without adding rule families or changing the single-file result/CLI contract.
- Recursive conventional-name discovery, additive explicit selectors, exclusions, portable evidence paths, aggregate bounds and visible incomplete inventory.
- Fingerprints and observation identities derived from the exact bytes parsed in the isolated file worker. Installed reviewer code/parser identity prevents comparisons across incompatible semantics.
- Bounded snapshot validation, file/rule coverage-aware comparison, supported reordering, explicit uncertainty for deletion/moves/ambiguous matching and an opt-in new-findings gate.
- Exclusive snapshot output, strict isolated loading of two saved JSON snapshots, typed public APIs and source-checkout CLI help.
- An inert CI workflow example and a locally executed helper demonstrating unchanged, introduced and incomplete comparisons.

Primary files: [implementation/API](../../apps/worker/src/security-review/index.ts), [discovery](../../apps/worker/src/security-review/repository.ts), [snapshot validation](../../apps/worker/src/security-review/snapshot.ts), [comparison](../../apps/worker/src/security-review/comparison.ts), [CLI](../../scripts/review.mjs), [usage](../security-review.md), and [CI example](../examples/repository-review-ci.yml).

## Acceptance map

| Criterion | Observed evidence | Result |
| --- | --- | --- |
| R1 — Useful repository review | Mixed Compose/OpenAPI and explicit Unicode selectors; visible exclusions, failed files, empty inventory and bounded omissions; deterministic portable snapshots. Discovery tests and independent corpus pass. Actual checkout example completed with four selected files. | Pass |
| R2 — Honest comparison | Supported addition, unchanged and removal labels match; reordered lists retain current evidence; missing/deleted/partial/incompatible inputs stay unknown or fail. Strict schema/identity validation and duplicate/ambiguous matching checks pass. | Pass |
| R3 — Commands and CI | Source-only help, setup diagnostics, Unicode, exclusive output, linked-parent rejection and exits 0/1/2/3 observed. Inert workflow YAML parsed successfully. Its helper demonstrated expected outcomes on host, fresh Windows and Linux. | Pass |
| R4 — Independent finite evidence | 21 cases across 14 named scenarios, with 22 expected change records. All matched, with zero missed/unexpected known changes and 11/11 expected unknowns. Labels independently reviewed before execution. | Pass |
| R5 — Bounds and preservation | Entry/file/depth/byte/deadline/snapshot limits, two-child pool, cancellation without queued launches, filesystem links, malformed snapshots and protected outputs checked. All 24 corpus files preserved; all four actual reviewed fingerprints match source bytes afterward. | Pass |
| R6 — Integration and independent review | Worker build, all 185 host review tests, fresh Windows install/build/review, fresh isolated Linux review, formatting/syntax, 29 harness regressions and 100 reporting cases completed with only documented platform skips. Independent module, CLI, harness and documentation reviews found no remaining blocker. | Pass |
| R7 — Concrete completion | Saved actual checkout snapshot, controlled before/after snapshots and new-finding comparison, local CI outcomes, usage documentation, evidence manifest and this acceptance map. Scope limitations recorded; batch stops here. | Pass |

## Commands and retained results

Local evidence directory: `output/repository-review-2026-09-07`. Generated evidence remains ignored because it includes run-specific metadata.

| Command/check | Observed result | Local artifact |
| --- | --- | --- |
| `pnpm --filter @shannon/worker build` | Exit 0 | build.log |
| `pnpm test:review:cases` | 185 passed, 0 failed, 0 skipped; CI helper passed | host-review.log |
| `node scripts/evaluate-repository-review.mjs` | Exit 0; deterministic report, 21/21 cases | evaluation.json |
| `pnpm test:review:install --offline --store-dir .pnpm-store` | Fresh frozen install/build; 185 review tests passed; reporting 99 passed, 1 POSIX-only skip | windows-clean-install.log |
| `node scripts/test-reporting-runtime.mjs --review` | Fresh Linux build; 184 passed, 1 Windows-only skip; CI helper passed; owned resources cleaned | linux-review.log |
| `node --test scripts/test-reporting-runtime.test.mjs scripts/reports.test.mjs scripts/test-reporting-install.test.mjs` | 29 passed, 0 failed | harness-tests.log |
| `pnpm exec biome check apps/worker/src/security-review` | 16 files checked, no fixes/errors | format.log |
| Changed launcher/evaluator/CI/harness script syntax checks | All passed | syntax-and-preservation.json |
| CI YAML parsed with installed js-yaml; read-only permission and exact helper command inspected | Passed locally; no remote execution | [workflow example](../examples/repository-review-ci.yml) |

Windows used Node 22.16.0 and pnpm 10.33.0. The Linux context used the existing Node 22 Docker harness, frozen lockfile installation, a non-root test process and disabled container networking during review. Docker build dependency setup is separate from offline analysis. The Windows clean installation used the existing local package store with `--offline`.

The Linux skip is `Windows network and alternate-stream roots are rejected before discovery reads`; that test passed on Windows. The Windows reporting skip is `inaccessible descendants are explicit incomplete inventory on POSIX`. Neither skip hides a failure in a platform where the test applies.

An initial direct `node scripts/test-reporting-install.mjs ...` launch was correctly rejected by the existing harness because it requires pnpm's runtime context. Its output is retained in windows-direct-launch.log. The documented pnpm command subsequently completed successfully. No failed attempt was counted as a pass.

## Independent labels and review

The corpus author did not implement or read discovery/comparison when deriving labels. Root, who did not implement those modules, reviewed all fixture bytes, rationale, expected states, classifications and exact evidence pointers before evaluation. The manifest records that independent review. Source review occurred only after labels were frozen.

One pre-execution fixture assumption was corrected by independent agreement: exact entry-budget exhaustion cannot prove EOF without another read, so the side required complete in two incomplete-inventory comparisons uses `maxEntries: 2` for its single file. The incomplete side remains capped at 1. Expected states, counts and pointers did not change; this correction was made before API execution and is recorded in corpus metadata.

Observed change totals: **2 new, 8 unchanged, 1 removed, 11 unknown**. Missed/unexpected known changes: **0/0**. Expected/observed unknowns: **11/11**; missed/unexpected unknowns: **0/0**. Snapshot mismatches, execution errors and input mutation cases: **0**.

Independent source reviews covered discovery; snapshot validation/comparison; identity/parser/worker integration; CLI output/loading/exits; package and clean-context integration; usage and CI example. Demonstrated issues were corrected before final acceptance, including inconsistent complete explicit-selection envelopes, invalid-selector CLI usage exits and native enumeration order affecting an incomplete directory prefix. All required regressions and independent review dispositions passed afterward. No additional accuracy threshold or expanding corpus target was introduced.

## Ordinary repository and controlled examples

The observed checkout command was:

```sh
node scripts/review.mjs repo . --exclude apps/worker/test --exclude docs --output output/repository-review-2026-09-07/repository.json
```

It completed with 3,477 discovered entries and four selected files:

- `apps/cli/infra/compose.yml`
- `docker-compose.yml`
- `repos/memos-dcef4188/proto/gen/openapi.yaml`
- `repos/memos-dcef4188/scripts/compose.yaml`

This scope includes cached local project configurations under `repos`; only passive declaration reads occurred. Every file completed the supported checks with zero observations. This does not establish broader project security or deployed behavior. The snapshot retains deliberate exclusions and the exact selection policy. Example result and all four current input hashes preserve the evidence. The CLI infrastructure Compose file also has matching explicit before/after hashes.

Controlled retained inputs `projects/clean` and `projects/privileged` under the repository corpus produced before and after snapshots. Their comparison completed with exactly one new `compose/privileged` observation and opt-in gate exit 3. Equivalent list ordering and unknown cases are retained in the independent corpus and CI helper evidence.

## Practical limitations and stopping point

This release covers six local declaration checks in OpenAPI/Compose, finite filename selection and bounded comparison. It does not merge Compose inputs, resolve external references, inspect deployments, infer arbitrary renames, authenticate snapshot producers or migrate old baselines. Repeated identities, exact-content moves, incomplete coverage and incompatible reviewer builds remain conservative unknowns. Filesystem metadata checks are not an atomic snapshot against concurrent privileged modification; output failures can leave a newly created incomplete artifact, while existing files are never overwritten.

Deferred backlog: additional formats/rules chosen for user value; explicit baseline migration if operationally needed; optional file-change metadata for rename/deletion workflows. No further reliability loop or perfect-accuracy target is required for this goal.

Existing user changes were preserved. Dependencies and lockfiles were unchanged; the final shared package diff and focused source checks were inspected. No assessment, target/model request, exploit/replay/reproduction workflow, reviewed project execution, commit, push, deployment, remote CI run or external publication occurred. The finite acceptance criteria are satisfied and this batch stops.
