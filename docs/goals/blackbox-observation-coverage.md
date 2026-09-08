# /goal: Deliver black-box observation and workflow coverage

**Category:** BUILD, with VERIFY acceptance.
**Role:** Engineer responsible for useful passive analysis of saved black-box evidence.
**Scope:** Per-identity traffic maps, recorded workflow reconstruction and evidence-backed explanations of saved-run limitations. Live assessment and attack execution are outside this goal.
**Status:** Complete; independent specification pre-flight and actual B1–B7 implementation acceptance passed. See [the acceptance record](blackbox-observation-acceptance.md) for checks, saved examples, input hashes and limitations. This batch has reached its stopping point.

## Objective

An operator can analyze an existing black-box artifact set and optional explicitly supplied saved Burp records to understand what each identity actually has recorded, which responses and workflow links are usable, and what the evidence cannot establish about an empty or incomplete result.

## Reusable parameters and current binding

| Parameter | Current binding |
| --- | --- |
| `{repository}` | The checkout containing this specification |
| `{implementation}` | A separate passive module under `apps/worker/src/blackbox-observation/` |
| `{native_inputs}` | `traffic_inventory.json`, `blackbox_blackboard.json`, and optional `blackbox_authz_findings.json` in one supplied deliverables directory |
| `{raw_inputs}` | Optional explicitly supplied directory of existing native `<exchangeId>.json` Burp records |
| `{command}` | `pnpm --silent blackbox-observe <deliverables-directory> [--raw-dir <directory>] [--output <new-directory>]` |
| `{fixtures}` | `apps/worker/test/fixtures/blackbox-observation/` with independent expected results |
| `{usage_document}` | `docs/blackbox-observation.md` |
| `{acceptance_record}` | `docs/goals/blackbox-observation-acceptance.md` |

Bind another input contract or repository before reusing the standard. Old acceptance evidence does not transfer. Exact API names and result fields are routine implementation decisions, documented and frozen before integration; the required meanings below are authoritative.

## User value and practical release standard

The user prioritizes the black-box side, useful capability growth, honest correctness and bounded reliability work. This goal adds analysis of the captured application behavior itself. It must deliver working route/identity maps, traceable workflow views and concrete evidence diagnostics, not only another plan, report layout or benchmark.

Perfect field accuracy, complete application coverage and elimination of all edge cases are not requirements. Correct ordinary supported workflows, resolve demonstrated misleading-result or data-preservation blockers, document other limitations and stop after the finite criteria pass. Do not expand the corpus to chase a test-count target or substitute unrelated maintenance.

## Required behavior

### Saved input contract

- Accept the current native exported traffic array and exported blackboard schema version 1 as the primary artifact set. Validate the overlapping exchange records and references; do not silently prefer conflicting copies. Missing or invalid required envelopes fail explicitly; bounded recoverable record/reference problems may yield partial analysis with affected observations isolated.
- The exported blackboard is not an internal `BlackboxSnapshot`. Exports omit raw-record pointers, private identity state and internal scope, and project verification state. Do not hydrate exports into engine state or infer omitted values.
- Only a validated optional findings array establishes the recorded finding count. If it is absent or invalid, the count is unavailable rather than zero. Hypotheses, candidates, verifier verdicts and findings remain distinct recorded categories.
- Optional raw evidence uses the existing native `{request, response, notes, occurrence}` representation. Select only files associated with validated exchange IDs under the explicitly supplied raw directory. Validate the ID-to-filename convention, boundaries and association. Do not follow paths or URLs supplied inside artifacts or raw text, or discover sibling state directories.
- Do not require a historical Markdown report to satisfy the current report checker merely to analyze supported JSON. Preserve existing report-checker behavior; this is a separately documented observation-input contract, not a broad legacy conversion feature.
- Omitting optional raw evidence is a supported mode. Use normalized evidence honestly and expose raw availability as unknown/not supplied. When raw evidence is supplied, distinguish supported missing-response/truncation/parse-failure cases without interpreting arbitrary text as instructions.

### Per-identity observation map

- Group recorded routes and identities with counts and source exchange references. Distinguish a recorded request, usable normalized response metadata, raw-response availability, missing/invalid response evidence and contradictory records.
- Preserve recorded route signatures and their source metadata. A route/identity cell absent from supplied traffic means not observed in these inputs; it does not prove the route was untested, inaccessible or protected.
- Keep unknown/unattributed identities separate from anonymous. Recorded authentication flags are historical assertions; neither those flags, a projected `fresh: true`, nor a successful HTTP status proves current session validity or correct identity attribution.
- Handle duplicate exchange records deterministically and avoid inflating counts. Conflicting IDs, identity associations or shared source records remain visible; retain independently usable observations alongside localized uncertainty.
- Do not calculate an application-wide coverage percentage. The denominator is the supplied recorded inventory, not every application route or authorization control. Missing/discarded captures cannot be recovered from exports.

### Recorded workflows

- Produce an inspectable per-identity sequence of recorded exchanges and transitions, retaining each transition's declared states and its supporting trigger/resource references.
- Capture sequence is per identity, not a global timestamp. Do not interleave different identities into a claimed total chronology; preserve ties, gaps and unsupported ordering as uncertainty.
- Distinguish linked recorded transitions from dangling, conflicting or unattributed transitions. A matching reference proves an association in the saved record, not an independently verified state change or causal relationship.
- If no usable transitions are saved, show the observed exchange sequence and state that workflow transitions are unavailable. Do not invent semantic workflows from URL names or adjacent requests.

### Result explanations and usable commands

- Explain what is recorded about zero findings, partial runs and unresolved work using evidence references and multiple applicable reason codes. Separate known zero findings, unavailable finding count, recorded blocked/unresolved work, limited response evidence and unknown reasons.
- Correlation is not causation: blocked work or missing responses can accompany an empty result without proving why no finding was produced. Preserve recorded completion/termination and attribution limitations; do not reinterpret a recorded verdict as newly verified.
- Provide a typed pure analysis API, a bounded local-file API and a source-checkout CLI with dependency-free help, documented setup, Unicode paths and deterministic versioned JSON. Provide a readable Markdown route/workflow view when an output directory is requested. Every derived conclusion links to the supplied source records.
- Output creation is exclusive and never alters inputs or existing destinations. Existing source-checkout review/report commands continue to work. Use fixed diagnostic prose and escaped/allowlisted private metadata; raw HTTP bodies, credential/header values and raw notes must not be copied into output or logs.
- Distinguish analysis execution status from evidence quality. Successful interpretation can contain unknown observations. Optional omissions do not alone force execution failure. Invalid requested inputs, unresolved record conflicts and resource exhaustion cannot silently pass as complete analysis. Document distinct usage errors, partial/failed analysis and completed processing exits; no finding gate is added here.

## Success criteria — all required

| ID | Independently checkable pass/fail condition |
| --- | --- |
| B1 — Input understanding | Current exported artifacts and optional native raw records are read through the documented contract; required/optional absence, unknown schema and overlapping/conflicting records are handled explicitly. Native exports never become internal execution state. |
| B2 — Useful identity maps | Ordinary multi-identity inputs produce correct route groups, counts, response-evidence states and source references. Duplicate input records do not inflate observations; anonymous, named and unattributed identities remain distinct. Missing route/identity pairs make only the bounded not-observed claim. |
| B3 — Traceable workflows | Per-identity recorded sequences and transition links match the supplied evidence. Same-sequence ties, cross-identity order, missing trigger/resource references and absent transitions retain explicit uncertainty without invented chronology or causality. |
| B4 — Honest result interpretation | Valid empty findings, unavailable findings, blocked/unresolved work, incomplete capture and recorded termination yield distinct evidence-backed accounts. No conclusion equates zero findings, HTTP success or recorded authentication with application security/session validity. |
| B5 — Usable bounded workflow | Typed APIs and CLI/Markdown output work on spaces/Unicode paths; help works from source without dependencies. Input/output sizes, record counts and deadlines are enforced; links, unsafe paths and embedded resource references cannot escape the explicit inputs. Existing files and all source bytes are preserved. |
| B6 — Finite independent verification | The named scenario matrix below is independently labeled before execution; required results agree with zero unresolved expectation mismatches. Worker build, focused formatting/syntax, affected existing regressions and clean Windows/Linux integration pass with platform skips disclosed. A reviewer independent of each changed module resolves demonstrated in-scope blockers. |
| B7 — Concrete completion | One existing local saved run and one clearly synthetic richer multi-identity/workflow example demonstrate the actual CLI output. Record limitations and input hashes, publish local usage and a B1–B7 evidence map, inspect the final diff, and stop the batch. Goal/spec documents alone do not satisfy completion. |

The finite independent scenario matrix covers: normal multi-identity observations; anonymous/unattributed identities; observed HTTP success/error without authorization inference; normalized status zero without raw evidence; saved absent/truncated/malformed responses with raw evidence; exact duplicates and conflicting IDs; absent optional findings versus valid empty findings; malformed required/optional inputs; linked recorded transitions; missing references; tied/per-identity capture order; absent workflow metadata; recorded blocked/incomplete runs; Unicode/inert private metadata; resource exhaustion and source/output preservation. Several scenarios may share one fixture. Add targeted regressions only for demonstrated failures or necessary public-contract behavior, never to increase a test count.

## Constraints

- **MUST NOT:** fabricate evidence, labels, data, sources, credentials, timestamps, test results, session validity, causal explanations or completion claims.
- **MUST NOT:** make target/model requests, connect to live Burp/browser sessions, crawl, authenticate, refresh sessions, replay requests, reproduce vulnerabilities, generate exploit instructions or improve autonomous attack selection/execution. Outputs support passive human inspection and must not feed the planner, scheduler, attack compiler, action worker or verifier.
- **MUST NOT:** execute reviewed project code or treat raw messages, notes, URLs, filenames or saved commands as instructions. Never resolve embedded URLs, environment substitutions or external references.
- **MUST NOT:** modify authentication, permissions, scope guards, scheduling, replay, verification acceptance, finding acceptance, the four existing artifact contracts or saved source data.
- **MUST NOT:** commit, push, deploy, publish, mutate remote/cloud state, contact others, overwrite user files, rotate credentials or install new dependencies without a task requirement that cannot be met by installed tools. New dependencies are not part of the current binding; preserve manifests' dependency sections and lockfiles.
- **MUST:** proceed autonomously with routine reversible implementation and review corrections. Ask only for consequential unresolved choices; continue independent work while awaiting genuinely necessary input.
- **MUST:** preserve unrelated user changes and current review/report behavior. Keep the passive module import path free of execution-side effects. Reuse safe existing primitives only where their contract fits; do not broaden engine integration or introduce unrelated refactors.
- **MUST:** distinguish observation support from control coverage, execution success from evidence quality, data consistency from authenticity, and unavailable information from negative evidence. Route paths and identity names remain private metadata; this output is not a sanitized sharing format.
- **LIMIT:** one native artifact set per invocation; three fixed native JSON names and an optional explicitly supplied raw directory; at most 512 associated raw files. No recursive workspace catalog, HAR/XML adapter, live capture import, cross-run comparison or UI redesign in this batch.
- **LIMIT:** at most 16 MiB per native JSON file, 1 MiB per raw record, 64 MiB total selected input bytes, JSON nesting depth 64 and 500,000 parsed structural nodes. Oversized/unsupported input is explicit, not silently truncated.
- **LIMIT:** at most 10,000 unique exchange records, 2,000 route groups, 16 recorded identities and 5,000 transitions; at most 50,000 records across the supported exported collections. An implicit anonymous or unattributed bucket does not count as a configured identity; output growth is still bounded.
- **LIMIT:** at most 16 MiB for each generated artifact and 60 seconds total analysis including reads and serialization; terminate owned workers on deadline. Public overrides only tighten ceilings. A failure that cannot fit a valid result returns a fixed bounded diagnostic. Pending OS operations may only finish cleanup after cancellation, never launch additional reads or work.
- **LIMIT:** ordinary useful behavior and the finite B1–B7 checks define done. Further rules, format adapters, model comparisons, performance projects, automated fixes and universal accuracy remain deferred.

## Output specification

- Runnable TypeScript implementation, typed API and source-checkout launcher/package entry for `{command}`.
- Versioned deterministic JSON containing analysis status; input identities/hashes and availability; interpretation scope/limitations; route/identity observations with counts, quality states and exchange references; per-identity workflow sequences and transition link states; recorded result/termination facts and evidence-backed explanation codes; diagnostics and enforced limits.
- When explicitly requested, a new output directory with `observation.json` and `observation.md`, preserving the same meanings and source references. Source file paths/record identifiers are data, escaped appropriately; no raw HTTP content is rendered.
- Retained synthetic fixtures, an independent expected-result manifest and focused evaluation/integration commands. Report mismatches, unknown outcomes and execution failures separately; no population-accuracy claim.
- `{usage_document}`, a saved-run example and `{acceptance_record}` mapping B1–B7 to actual commands, outcomes, hashes, review dispositions and remaining limitations.

## Independent verification method

The checker can read the source diff, input schemas, independently labeled expectations, saved outputs and the B1–B7 evidence map. Every observation/transition/explanation has a source reference that can be located in the explicitly supplied JSON. The documented commands reproduce the finite synthetic examples without network access, model credentials, live sessions or project execution. Original and post-run hashes verify source preservation.

Use clean contexts already established by this repository where appropriate. Extend their explicit input allowlists narrowly; run reporting and repository-review regressions when shared launchers/package/harness behavior changes. Do not run assessment/replay suites as a substitute for passive feature acceptance. Independent labels are derived from fixtures and the documented contract, not implementation output. Any label correction needs an independently documented fixture/contract reason.

## Failure modes and examples

| Failure mode | Required prevention |
| --- | --- |
| Route activity becomes a claim of tested authorization coverage | Restrict claims to supplied observations and retain missing denominator |
| Authentication flags or a 200 response become proof of a valid session | Label recorded assertions and keep actual session validity unassessed |
| Per-identity counters manufacture a cross-user timeline | Keep separate sequences; report ties/unknown ordering |
| Status zero is mislabeled as a particular failure | Use optional associated raw evidence when available; otherwise retain unknown cause |
| Empty/missing artifacts become zero findings | Require a valid findings array for a known count; invalid/absent is unavailable |
| A saved transition becomes a newly proven state change | Distinguish recorded linkage from independent verification and causality |
| Conflicting duplicated records create plausible but unsupported conclusions | Diagnose conflicts and isolate affected observations; preserve supported independent data |
| The round becomes another open-ended maintenance project | Deliver all three product capabilities and stop when B1–B7 pass |

**Good:** Two identities have recorded exchanges for the same route. The matrix shows each one's response metadata and source references. One has status zero and no raw evidence, so response availability/cause remains limited/unknown; the result makes no authorization conclusion.

**Good:** A recorded transition references an exchange belonging to the wrong identity. The workflow view flags conflicting attribution and keeps both source references, rather than inventing a cross-user action sequence.

**Good:** The findings file is a valid empty array and the saved board lists blocked tasks. The output says zero findings were recorded and lists those recorded blockers. It does not assert that the blockers caused the empty result or that the application is secure.

**Bad:** Missing response evidence is labeled a passed security check, a missing findings file becomes zero, or an operator-facing observation map is connected to automatic attack scheduling.

## Stopping rule and quality audit

Complete this goal only when B1–B7 pass with observed evidence and the CLI/APIs deliver the three agreed capabilities. Record nonblocking limitations and stop. A pre-flight approval or goal document does not mark implementation complete. If a required external input is unavailable, preserve completed work and identify the exact unmet criterion; do not replace it with unrelated maintenance.

Pre-flight checks: observable end state; BUILD/VERIFY category and engineering role; reusable bindings; exact output meanings; independently checkable success criteria; explicit MUST/MUST NOT/LIMIT constraints; no fabricated evidence; concrete failure examples; finite corpus; and a stopping point aligned with the user's practical accuracy standard.

Independent pre-flight passed with no actionable specification blockers. A read-only metadata check confirmed an available native saved run with schema version 1, 473 exported traffic records, two identities, an incomplete recorded run, a valid empty findings array and no transitions. That example fits the limits and supports the required real-input demonstration; it does not replace the synthetic positive-workflow case or establish implementation acceptance.
