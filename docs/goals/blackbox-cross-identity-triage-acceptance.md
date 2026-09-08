# Cross-identity response triage acceptance

Status: Complete. X1–X7 passed with independent module and whole-change review, retained-output non-disclosure, clean Windows/Linux profiles, affected regressions, demonstrations, scoped inventory, and final integrity checks.

Goal: [blackbox-cross-identity-triage.md](blackbox-cross-identity-triage.md). Usage: [blackbox-cross-identity-triage.md](../blackbox-cross-identity-triage.md).

## Specification and frozen-corpus evidence

The first independent specification review found three contract ambiguities: shared saved occurrences could qualify as independent evidence, multivalue set relations overlapped, and content-type/body framing rules were underspecified. The corrected goal excludes reused occurrences from strong leads, defines exact set algebra and evidence completeness, and fixes content-type, body extraction, framing, and encoding behavior. Re-review passed all four goal-creator safety vetoes and all 17 applicable non-safety checks.

Task 1 was repaired and independently re-reviewed without reading the production comparator or its output. The final corpus contains 17 cases, 98 traffic/blackboard rows, 97 unique exchange IDs, 29 groups, 74 identity cells, 31 route comparisons, 27 strong comparisons, 31 request classes, 1,728 projected source references, 61 available raw records, and two selected missing raw records.

| Frozen artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `expected-results.json` | 439,894 | `fc1b04135d95a38f9ff6e27f238c7cd86f20e4f575683a709f28e5ba5f52eacc` |
| `fixture-index.json` | 5,260 | `25ff225e62af14f4405b233fdb2ddf1d62964c9f32cf8cfe7369618b478ff3b7` |
| Native fixture tree | 127,340 | `5539467a504b4ccde89655ab8d5232db1b653f848b13801826409ad67fd77dcc` |
| Immutable Task 1 review package | 677,417 | `3fe12b1379763acc95289cb8619e13128752963105c39ba56d0aaa83f44f3080` |

The final Task 1 self-check run passed 23/23. The production evaluator later passed all 17 cases with one expected failed analysis and no missing, duplicate, or unexpected cases; unexpected failures, execution errors, mutations, missed supported relations, and unexpected supported relations were all zero. The retained evaluator report is versioned as `offline-blackbox-cross-identity-evaluation`, records the exact manifest hash above, and has SHA-256 `8bcb2b083162c8e7d8fc0cfc53921c954458867e34ee6ec945efc00344d4c5fa`.

## X1–X7 evidence map

| Criterion | Observed evidence | State |
| --- | --- | --- |
| X1 | The 17-case frozen population covers reordering, duplicate native envelopes, outer-key collisions, distinct request bodies, missing identity cells, and comparison ceilings. The evaluator agrees with every exact projected population and reference set. | Pass |
| X2 | Independent expectations cover status, full-response fingerprint, saved-body, and normalized content-type set relations, including partial/unavailable evidence and variability. All 17 evaluator cases agree with zero unresolved relation or source-reference mismatch. | Pass |
| X3 | Exact associated method/target/body classes, differing bodies, shared occurrences, association conflicts, and unavailable raw records are covered. Renderer/file/evaluator sentinel tests pass. A fresh retained-output audit found no high-risk value, forbidden-key, sentinel, transformed-value, or newly computed private digest disclosure; only permitted native response fingerprints and raw-file provenance hashes remain. | Pass |
| X4 | The evaluator agrees on response-equivalence, response-difference, variability, insufficient-evidence, named/anonymous/unattributed identities, and explicit source-linked owner context. Independent reviews found no remaining authorization, policy, causality, or vulnerability promotion. | Pass |
| X5 | Typed pure/file APIs, deterministic canonical JSON, fixed-structure Markdown, source-checkout CLI, Unicode/spaced paths, tightened limits, absolute deadlines, guarded source revalidation, exclusive output, output-path replacement defense, and concurrent-hardlink payload scrubbing are implemented and independently reviewed. | Pass |
| X6 | The frozen evaluator, worker build, 79/79 comparison tests, scoped Biome/syntax, affected observation/review/reporting regressions, and Task 1–6 module reviews pass. Current cache-only Windows and nonroot/network-none Linux profiles pass with one disclosed platform-specific skip each. | Pass |
| X7 | Real and synthetic CLI demonstrations, byte preservation, stdout/file equality, result counts, output hashes, usage documentation, retained artifacts, output non-disclosure, dependency/lock verification, prohibited-import search, scoped inventory/diff checks, and independent whole-change review all pass. | Pass |

## Product and review evidence

The additive public boundary exports the comparison result/report types, pure comparison and serialization functions, and guarded `compareAccessDirectory()` file API. The source launcher is:

```text
pnpm --silent blackbox-compare <deliverables-directory> [--raw-dir <directory>] [--output <new-directory>]
```

Task 4 deterministic serialization/rendering review passed. Its immutable review package is 47,103 bytes with SHA-256 `7f0551dc597c0b7de5b7315e11758cf87abd09283403621eeebb9add48065d5b`; the independent rerun passed the worker build, 36/36 focused tests, scoped Biome, and adversarial unknown-limit probes.

Task 5 guarded I/O/CLI review and fix loop passed. The immutable initial review package is 75,951 bytes with SHA-256 `12ca7ee44ce76a1be76778be3c6ed52da26224cbf8c7a2b7432d310516530267`. The final fixes reopen and rehash selected sources after serialization and immediately before writes, reject physical input/output aliases, include normalization and spawn overhead in one monotonic deadline, retain verified output handles, and scrub every retained handle when a concurrent hardlink or replacement is detected. Root verification passed the build and 35/35 comparison plus observation file/I/O/CLI tests; the independent final file-boundary rerun passed 12/12 and observed `{linked:true,rejected:true,aliasBytes:0}` for the adversarial hardlink case.

Task 6 evaluator/package/profile review passed after two Important evaluator fixes. Expected `null` is now exact rather than a wildcard, and mismatch output exposes fixed locations/type shapes instead of arbitrary production values. The evaluator self-checks passed 26/26, including an injected `PRIVATE_SENTINEL` non-disclosure case. `pnpm test:reporting:runner` passed 34/34 with the new comparison harness. The current `pnpm test:blackbox-cross-identity` run passed the worker build, all 79 comparison tests, all 17 evaluator cases, scoped Biome across 20 files, and script syntax checks.

The dependency sections match the captured baseline after normalizing absent and empty sections. `pnpm-lock.yaml` remains `6558f7e6c0e0491133c544018ff1368f20c4398d9a29a25924acbb4394a6b2aa`, equal to the recorded baseline. The prohibited integration-import search found no planner, scheduler, attack, replay, verifier, or finding-acceptance connection. `git diff --check -- package.json apps/worker/package.json docs/coverage-roadmap.md` passed. The immutable Task 1, Task 4, and Task 5 review-package hashes remain unchanged.

## Final verification evidence

| Command/profile | Observed result |
| --- | --- |
| `pnpm test:blackbox-cross-identity` | PASS: worker build; 79/79 comparison tests; evaluator 17/17; Biome 20 files; script syntax |
| `pnpm test:blackbox-cross-identity:regressions` | PASS outside the restricted sandbox: 79 comparison tests; evaluator 17/17; 67 observation tests; 185 review tests; reporting 99 passed with one POSIX-only Windows skip |
| `pnpm test:reporting:runner` | PASS: 34/34 |
| Clean Windows cache-only install/build/regressions | PASS after the hardlink fix: 79 comparison tests; evaluator 17/17; 67 observation tests; 185 review tests; reporting 99 passed with one POSIX-only skip |
| Clean Linux Docker profile | PASS: nonroot, test network disabled, no host mounts, no Temporal; 79 comparison tests; evaluator 17/17; 67 observation tests; review 184 passed with one Windows-only skip; reporting 100/100 |

The regression command needed an unrestricted temporary-path context because the managed Windows sandbox blocks the unrelated repository-review test from resolving its temporary parent at `C:\Users\zeb`. The exact suite passed outside that restriction; no product code was changed for the sandbox-only failure.

## Retained-output non-disclosure audit

The audit independently re-derived all 473 saved-run and five synthetic selected raw IDs and rehashed 484 native/raw inputs with zero mismatch. It tested 757 meaningful raw value/category pairs across literal, JSON-escaped, and Markdown-inert forms and found zero high-risk disclosure. Nine generic string collisions were confined to deliberately public origin/path metadata or fixed vocabulary.

It tested 638 private digest candidates. The only matches were 285 permitted pre-existing native `fullResponseFingerprint` values; no newly computed request, body, query, content-type, authorization, cookie, or note digest appeared. All 478 selected raw-file SHA-256 values appear only as intended source provenance. Exact forbidden-key and `PRIVATE_SENTINEL` searches found no output match even though five synthetic source files contain the sentinel. A 2,500-item common-transformation search also found zero match.

This is an exact-value and common-transformation audit of the retained artifacts. It does not claim resistance to every possible encoding or semantic derivation. The output intentionally retains allowlisted route/origin metadata, existing native full-response fingerprints, and raw-file SHA-256 provenance.

## Retained CLI demonstrations

The earlier observation milestone omitted raw input. This comparison demonstration explicitly supplied the separately located raw directory and selected every native/raw file through the production selector.

| Example | Exit / status | Inputs and preservation | Result population | Reason for partial status |
| --- | --- | --- | --- | --- |
| Available saved run | `1` / `partial` | Three native plus 473 raw files; all 476 hashes and byte counts matched before/after; stdout exactly equaled `comparison.json` | 74 groups; 298 comparisons; 150 recorded; 148 strong; 159 insufficient; three identities | Four `missing-reference` diagnostics retained from saved evidence |
| Clearly synthetic run | `1` / `partial` | Three native plus five raw files; all eight hashes and byte counts matched before/after; stdout exactly equaled `comparison.json` | Two groups; five comparisons; four recorded; one strong; zero insufficient; three identities | One shared raw occurrence was diagnosed and excluded from independent strong evidence |

The real run contains 148 exact-saved-target/body comparisons and 150 route-metadata comparisons. Its status relations are 154 `same` and 144 `unavailable`; fingerprint relations are 154 `different` and 144 `unavailable`; captured-body relations are two `different`, 59 `same`, and 237 `unavailable`; content-type relations are 74 `same` and 224 `unavailable`. It emits 159 insufficient-evidence, 154 response-difference, 154 response-equivalence, and 118 within-identity-variability signals. These are saved-evidence triage counts, not authorization conclusions.

The synthetic run contains one exact-saved-target/body comparison and four route-metadata comparisons. It records two response-difference and three response-equivalence signals. The shared occurrence remains an explicit unknown/diagnostic rather than a strong lead.

| Retained artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `saved-run/comparison.json` | 2,268,544 | `a24f8641b62407933b49e234042516c9d38a3867fe6a3c4a967210eb3e418702` |
| `saved-run/comparison.md` | 698,961 | `1e7e99733bd9a23b6f36b1661fcc011feeab57023dd63fbe542597fc6c45a46c` |
| `synthetic/comparison.json` | 30,284 | `f988cf0e53851e89da2a2598aeb7baa89e01b7bf103d87dcf26eabc42fb8cc46` |
| `synthetic/comparison.md` | 10,466 | `1e5e54486114d6fecea49d70ac099dbadd8753952098027a9a61fcd26b590ae8` |
| `examples.json` | 239,374 | `c90bcfbd4afae9fc4773cce2b61069b6abc0d893494960115c4259092881eb4b` |
| `evaluation.json` | 7,991 | `8bcb2b083162c8e7d8fc0cfc53921c954458867e34ee6ec945efc00344d4c5fa` |

## Final review and scoped inventory

The independent whole-change review returned PASS with no Critical or Important findings. It accounted for every scoped tracked and untracked file, found no prohibited integration or disclosure, and judged X1–X7 sufficient. Candidate construction remains bounded and nonblocking through absolute ceilings plus the 384 MiB/60-second worker boundary; more than 5,000 comparisons are never emitted. The same-user post-success copy/link limit remains informational.

The final scoped inventory contains 197 files totaling 6,170,566 bytes, expected extensions only, and zero links. All 119 JSON files parse.

The post-documentation check passed: edited evidence files contain no trailing whitespace; the scoped Git diff check passed; dependency sections still match the captured baseline; and the frozen manifest, lockfile, immutable review packages, and retained output hashes all match the values recorded here.

## Limits and stopping point

The feature compares supplied saved observations only. It cannot establish current principals, valid sessions, equivalent authorization context, expected access policy, resource ownership, semantic body equivalence, causality, exploitability, or application-wide coverage. Node does not expose a portable handle-relative publish primitive, so a same-user actor can still copy or link an intended successful private output after all success checks. Detected concurrent mutation is rejected and every retained output handle is scrubbed; the demonstrated external alias retained zero payload bytes.

X1–X7 are complete, so this batch stops here. Generic response-header review, live differential requests, replay, attack-plan generation, new import formats, cross-run history, and unrelated maintenance remain outside this batch.
