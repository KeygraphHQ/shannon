# Black-box observation acceptance

Status: B1–B7 passed. The passive black-box milestone is complete and has reached its finite stopping point.

Goal: [blackbox-observation-coverage.md](blackbox-observation-coverage.md). Usage and public contract: [blackbox-observation.md](../blackbox-observation.md).

## Independent specification and labels

The goal pre-flight passed independently before implementation. The finite synthetic expected manifest was frozen before its author read any observation implementation or output. Its SHA-256 remains `645a8ba7da4a0d4b1b36df6ba2ddfe5ae64bbb46d0996138ec690df32842f53a`. Root reviewed label meanings against the native schema and synthetic records before evaluation. No expected values changed after execution; [label-review.md](../../apps/worker/test/fixtures/blackbox-observation/label-review.md) records a taxonomy clarification that retains the unknown visitor identity and its `/tasks/2` reference.

The saved evaluation records **18/18 matched cases across 15 scenario groups**, with zero mismatches, execution errors, input mutations, missing cases, duplicate cases or unexpected cases. The three expected failed analyses occurred as labeled; there were no unexpected failures. These are agreement results for the fixed synthetic corpus, not population accuracy. Generated evaluation and saved-run artifacts remain in the ignored local `output/` directory.

| Separately counted unknown category | Expected | Observed | Missed / unexpected |
| --- | ---: | ---: | --- |
| Unavailable normalized responses | 4 | 4 | 0 / 0 |
| Unknown raw responses | 28 | 28 | 0 / 0 |
| Unattributed exchanges | 1 | 1 | 0 / 0 |
| Unavailable finding counts | 2 | 2 | 0 / 0 |
| Workflow uncertainties | 30 | 30 | 0 / 0 |

These categories overlap and retain separate denominators.

## B1–B7 evidence map

| Criterion | Observed evidence | State |
| --- | --- | --- |
| B1 — Input understanding | Core, raw and file tests cover native envelopes, required/optional absence, reconciliation, conflicting IDs and associated saved raw records. Independent corpus includes malformed inputs and absent/truncated/malformed response evidence. | Passed |
| B2 — Useful identity maps | Independent expected route groups, identity cells, counts, response states and source references match. Duplicate/conflict regressions pass; anonymous and unattributed buckets stay distinct. | Passed |
| B3 — Traceable workflows | Workflow tests and labeled cases cover positive links, missing references, per-identity ordering, ties, gaps and absent transitions. Unattributed ordering regression passes. The synthetic CLI example renders two transitions. | Passed |
| B4 — Honest result interpretation | Expected empty/unavailable findings, blocked/unresolved/incomplete work, termination facts and unknown causes match. Saved authentication/verification assertions remain recorded metadata. | Passed |
| B5 — Usable bounded workflow | File/API, CLI and independent I/O regressions pass, including source-only help, Unicode paths, limits, cancellation/deadline, exclusive outputs and byte preservation. Clean Windows and Linux profiles pass. | Passed |
| B6 — Finite independent verification | All 67 integrated observation tests and 18 frozen cases pass; worker build, Biome, syntax and affected review/reporting regressions pass. Independent module findings below are resolved. | Passed |
| B7 — Concrete completion | Actual CLI outputs from a local saved run and a clearly synthetic workflow example are retained with before/after input hashes and artifact hashes. Usage, scope and final change audit are recorded here. | Passed |

## Commands and observed results

Verification used Node.js 22 and pinned pnpm 10.33.0. The Windows checkout used Node.js 22.16.0, TypeScript 5.9.3 and Biome 2.4.7.

| Command | Observed result |
| --- | --- |
| `pnpm test:blackbox-observation` | Exit 0; worker build passed; 67 tests passed, no skips; Biome checked 11 source files; launcher/evaluator syntax passed. |
| `pnpm eval:blackbox-observation` | Exit 0; all 18 cases matched, independently rerun by the corpus author. |
| `pnpm test:reporting:runner` | Exit 0; 31 tests passed, no skips; existing fixture syntax checks passed. |
| `pnpm test:review:cases` | Exit 0; 185 tests passed plus three existing repository-review CI examples on Windows. |
| `pnpm test:reporting:bundles` | Exit 0; 99 passed and one POSIX-only inaccessible-directory case skipped on Windows. |
| `pnpm test:blackbox-observation:install --offline --store-dir .pnpm-store` | Exit 0; clean Windows install reused 415 cached packages with frozen lockfile and no downloads; worker build, 67 observation tests, review cases/CI examples and reporting bundles passed. Manifest preservation and owned-directory cleanup passed. |
| `pnpm test:blackbox-observation:linux` | Exit 0; clean Linux install/build and observation, review and reporting commands passed. Observation: 67 passed. Reporting: 100 passed, no skips. Review retains its Windows-only path-case skip. Owned resources were cleaned. |

The clean profiles use explicit source/test allowlists. The Linux test container runs as a nonroot user with no network, host mounts, provider credentials or Temporal service. Its Node base resolved to `node:22-bookworm-slim@sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4`. Dependency installation occurs during image preparation; the actual test container has no network.

## Review dispositions

- Workflow review found unrelated undeclared identity labels could acquire a shared ordering. They now remain in an unknown-order unattributed group while original counters stay recorded. The regression failed before correction and passed afterward.
- I/O/API review found public serialization trusted altered output ceilings. Limit validation now rejects raised, NaN and infinite ceilings before serialization. Four independent I/O review tests pass.
- Projection review removed unknown caller fields from provenance and source references through explicit allowlists.
- Bound review found aggregate input byte accounting omitted numeric/separator bytes. Exact serialized aggregate accounting now follows the structural guard.
- Reconciliation review corrected double-counting of a conflicting exchange ID mirrored across traffic and board. Native exchange ID shape and nested saved references are validated without engine hydration.
- Result review added failed tasks to unresolved-work reasons and consistently classified missing identity references while retaining failed reference validity.
- Raw review confirmed response status `000` is unusable and nullable absent metadata does not invent a contradiction.
- Evaluator review keeps malformed-result aggregation inside each case's exception boundary. Independent labels and the frozen manifest were preserved.

Each changed module received review independent of its author. No evidenced in-scope blocker remains after integrated execution.

## Actual CLI examples and source preservation

examples.json retains the actual launcher arguments, exit codes, result counts, before/after hashes, byte counts and output hashes. The launcher stdout matched its saved JSON exactly. An independent final artifact audit verified all six source files and all four output artifacts against that manifest.

| Example | Actual result |
| --- | --- |
| Saved run Markdown / JSON | CLI exit 1, partial analysis; 473 exchanges, 74 routes, two recorded identities plus anonymous traffic; 292 usable and 181 unavailable normalized responses; zero recorded findings; incomplete recorded run; no transitions. |
| Synthetic workflow Markdown / JSON | CLI exit 0, completed analysis; four exchanges, two routes, two identities and two recorded transitions; no diagnostics. Source is explicitly synthetic `sets/rich`. |

The real input is `workspaces/memos-blackbox-luna-r7/.shannon/blackbox-target/.shannon/deliverables`. No raw directory was supplied. Its partial status reflects dangling saved evidence references in rejected proposals at `/rejectedTasks/1`, `/rejectedTasks/4`, `/rejectedTasks/5` and `/rejectedTasks/6`. A read-only check confirmed the missing referenced exchange/resource records. Existing report validation permits rejected proposals; this separate observation contract conservatively exposes their unusable references. The diagnostic does not invalidate the 473 supported exchanges or imply those rejected tasks executed.

The real run records blocked/unresolved work and incomplete execution. Missing responses and those facts do not establish why the findings array is empty. The richer synthetic example supplies positive workflow evidence absent from the real run.

| Real source file | Bytes | SHA-256 before and after |
| --- | ---: | --- |
| `traffic_inventory.json` | 321775 | `8c9f5f0d9f15009155f9417f32e9a6ed04e21e3cb5c221a8b49240b252b21fb0` |
| `blackbox_blackboard.json` | 375159 | `db6bd2796ca666f9cfc29af597a81acebe910356a7e8d6991c5d5505d0f7adaf` |
| `blackbox_authz_findings.json` | 3 | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |

All six real/synthetic source hashes were unchanged. Full synthetic and output hashes are in the example manifest above.

## Final change audit and limits

This batch adds the passive module, focused tests and synthetic fixtures, launcher/evaluator, usage/goal records and local demonstrations. Shared harness changes add an explicit observation profile; package changes add commands and a worker subpath export. The existing HTTP text parser and strict local JSON reader are reused without changing them. Observation imports do not reach engine execution or model/target clients. Dependency sections and the lockfile are preserved; lockfile SHA-256 is `6558f7e6c0e0491133c544018ff1368f20c4398d9a29a25924acbb4394a6b2aa`. Unrelated preexisting working-tree changes remain in place. No commit, push or deployment was performed.

Interpretation is restricted to supplied native saved observations. It cannot assess current authentication, recover missing captures, establish application-wide coverage, or prove state-change causality. Source consistency is checked locally; authenticity and an atomic snapshot across files are not established. Output contains private allowlisted metadata. Ordinary output failures may leave new partial files for inspection while preserving existing destinations. Output ceilings that cannot fit a valid result raise a fixed bounded error.

The finite B1–B7 batch is complete. Live capture, replay, new adapters, cross-run comparison and further maintenance/benchmark expansion remain outside this milestone. No overall product accuracy or completion percentage is claimed.
