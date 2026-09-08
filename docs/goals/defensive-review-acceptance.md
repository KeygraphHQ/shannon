# Defensive configuration review acceptance

Status: accepted; all C1–C8 criteria passed. Date: 2026-09-07. The bound contract is [the goal specification](defensive-review-capability.md).

| Criterion | State | Evidence |
| --- | --- | --- |
| C1 — Both formats and six rule families | Pass | Seven typed modules under `apps/worker/src/security-review/`; public worker export and `scripts/review.mjs`; 41 corpus cases agree |
| C2 — Independently labeled corpus | Pass | Versioned `expected-results.json`, 36 core cases plus 5 parser cases; labels derived before rule execution and independently approved unchanged |
| C3 — Reproducible evaluation | Pass | 41/41 exact matches; 0 unexpected issues, 0 missing issues; 17 abstentions separately reported |
| C4 — CLI | Pass | Fresh-source help/missing-build tests; Unicode paths, deterministic evidence and exit codes; both Node and documented pnpm entrypoints observed |
| C5 — Input boundaries | Pass | 18 input/boundary tests; byte/depth/node/shared-reference/deadline limits; malformed input and linked paths explicit; input preservation checked |
| C6 — Windows/Linux integration | Pass | Host build, 121 tests and 7-file Biome check; clean Windows install/build and 121 tests; fresh Linux build and 121 tests; reporting regressions pass |
| C7 — Independent review/example | Pass | Cross-reviewed rules, independent parser/API and CLI/harness review; all demonstrated blockers fixed; repository Compose example completed with unchanged bytes |
| C8 — Documentation/completion audit | Pass | Independent audit checked the usage guide against implementation and retained logs, totals, hashes and examples; two wording clarifications applied; no essential acceptance gap remains |

## Ownership and implementation map

- Root: shared result types, bounded parser/file API, launcher and CLI, package commands, usage and acceptance records; all-label final review.
- OpenAPI author: OpenAPI rules and their focused unit cases.
- Compose author: Compose rules and their focused unit cases.
- Evaluation author: independently derived fixtures/labels, evaluator and clean-context harness additions; did not implement rules or input modules.

## Observations and verification

The goal-creation turn created and independently audited the contract, then activated it. Implementation subsequently added the feature and verification artifacts. Goal creation alone was not treated as completion. Prior reporting acceptance does not establish the new feature's correctness.

Generated evaluation results and logs remain in the ignored local `output/` directory because they include run-specific metadata. The table records the observed outcomes needed for review.

| Observed command | Result and retained evidence |
| --- | --- |
| `pnpm test:review` | Exit 0; worker build, 121 tests, 0 failures/skips; Biome checked 7 TypeScript files; launcher/evaluator syntax passed |
| `node scripts/evaluate-security-review.mjs` | Exit 0; complete evaluation JSON |
| `pnpm test:review:install --offline --store-dir .pnpm-store` | Exit 0; fresh Windows x64 dependency tree, 415 packages from existing cache, frozen lockfile/install scripts disabled, build, 121/121 review tests; reporting 99 pass/1 POSIX-only skip; log |
| `pnpm test:review:linux` | Exit 0; fresh allowlisted context, Node 22 image, worker build, non-root/network-disabled container, 121/121 tests and 0 skips; log |
| `pnpm test:reporting` | Exit 0 after shared package/harness changes; runner checks, worker build, metadata/summary/artifact tests, bundle/CLI tests, two targeted publication failure tests and 16-file Biome check; log |
| `pnpm --silent review compose apps/cli/infra/compose.yml` | Exit 0; completed; 0 issues/diagnostics; full pnpm output |

The only platform skip was the existing reporting test `inaccessible descendants are explicit incomplete inventory on POSIX`; this is not a review-suite skip. No infrastructure failure was counted as success. Linux run `5f15b83c-6211-4dcc-b111-84d767d05e07` exited successfully; subsequent label-filtered container, image and network queries returned no owned resources. Clean Windows temporary-directory cleanup also completed successfully.

Dependencies and `pnpm-lock.yaml` are unchanged. Lockfile SHA-256: `6558f7e6c0e0491133c544018ff1368f20c4398d9a29a25924acbb4394a6b2aa`. Existing uncommitted reporting and unrelated checkout changes were preserved. No commit, push, deployment or external application mutation was performed.

The 68-file implementation/fixture/harness hash record identifies the verified source snapshot. Final scoped diff, JavaScript syntax, source whitespace and local documentation-link checks passed. Only documentation status/wording changed after the integrated passing runs.

## Corpus and label review

The separate corpus author retained labels in `apps/worker/test/fixtures/security-review/expected-results.json` before executing the rule implementations. Each case includes a rationale, primary-source links and exact expected status/issue fields. Manifest SHA-256 after review: `367a8d0ce7bff38eb50ff0bf962537b8d675aa4c13c849b935092e6f1253e1fa`.

The preserved manifest's `labeling.reviewStatus: "independent-review-pending"` records its original labeling state. Final independent approval is recorded in this acceptance record; the labels and their original hash were intentionally left unchanged.

The Compose author independently reviewed all 12 OpenAPI labels and the OpenAPI module. The OpenAPI author independently reviewed all 24 Compose labels and the Compose module. Root, which implemented input handling but neither rule module, additionally read all 41 label records and corresponding input bytes, checked their specification rationale and approved them unchanged. Parser labels enforce strict JSON syntax and the declared single-document YAML subset. The independent label review did not replace expectations with implementation output.

| Evaluation grouping | Cases | Positive / negative / ambiguous | Matching cases | Unexpected / missing issues | Abstentions |
| --- | --- | --- | --- | --- | --- |
| Each of the six rule families | 6 | 2 / 2 / 2 | 6 | 0 / 0 | 2 |
| Parser cases | 5 | 0 / 0 / 5 | 5 | 0 / 0 | 5 |
| Total | 41 | 12 / 12 / 17 | 41 | 0 / 0 | 17 |

The evaluator observed 12 expected and 12 emitted issue labels, 24 completed cases, 12 partial cases and 5 parser failures. Zero ambiguous cases were incorrectly marked completed. Counts describe exact fixture agreement, not field precision, recall, deployment security or whole-product accuracy.

## Independent review dispositions

| Reviewer scope | Demonstrated blocker and disposition | Observed recheck |
| --- | --- | --- |
| OpenAPI, reviewed by Compose author | Malformed required envelope metadata could yield completed analysis; added focused metadata/content diagnostics while preserving supported observations | Strict isolated compile; 26 tests, including 6 unchanged independent cases; 12/12 core labels match |
| Compose, reviewed by OpenAPI author | Literal profiles and valid local service namespace references incorrectly produced partial status; fixed declaration interpretation | Included in 27 tests and 24/24 core-label recheck |
| Compose privilege context | Build/lifecycle privilege declarations could silently appear checked; explicit unsupported-context diagnostics added | Same 27-test recheck, including 6 unchanged independent cases |
| Compose security options | Mixed `:`/`=` values used incorrect separator precedence; corrected to Docker's `=`-first interpretation | Same independent recheck; labels unchanged |
| Parser/API, reviewed by corpus author | Non-string YAML keys were coerced to strings; scalar aliases bypassed counting; aliases and OpenAPI references used separate ceilings | All 9 independent boundary regressions pass; no remaining actionable blocker in reviewed scope |
| CLI, package and harness, reviewed by Compose author | No demonstrated blocker after inspection | 20 harness guards, 2 source-only CLI cases, documented help, syntax and scoped diff checks pass; complete CLI/platform paths subsequently passed in root integration |

Authors first observed the corresponding failing regressions, then reran them after fixes. The public input API initially failed all nine input tests against an empty stub; its implementation subsequently passed. CLI tests initially failed before the launcher existed, then passed through the implemented entrypoint. These observations are development checks; final acceptance relies on the integrated passing runs above.

## Repository example

`apps/cli/infra/compose.yml` was read as a repository-owned benign configuration. Both the Node and pnpm commands completed with all four Compose rule families assessed and no matching issues or diagnostics. The input SHA-256 before and after was `b1842617ade1cc98aaa938db3d63d5950e1e12d6d393c4f2a5eb37331aa6dff3`. The byte-preservation record and full result were saved. This is a local declaration result; no service was started and deployed state remains unassessed.

## Remaining product gaps and stopping point

General schema validation, external composition, runtime-policy enforcement, additional rule families, UI integration and automatic remediation are outside this goal. Full assessment-result accuracy remains unmeasured. OpenID provider scopes, unresolved declarations and non-Linux runtime effects remain explicitly unknown. The bounded reader does not provide an atomic snapshot against a concurrent privileged filesystem writer. Supported versions, status interpretation and input limitations are documented in [the usage guide](../security-review.md).

The independent documentation audit accepted C8 after checking the retained evidence and clarifying privilege-context wording and the manifest's original review state. The batch is complete and stops here. These out-of-scope gaps do not authorize a new maintenance loop or another autonomous implementation goal.
