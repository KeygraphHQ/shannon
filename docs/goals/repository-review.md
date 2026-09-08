# /goal: Deliver repository review and honest change comparison

**Category:** BUILD, with VERIFY acceptance.
**Role:** Engineer responsible for a useful offline code-review workflow and evidence of its supported behavior.
**Scope:** Repository discovery, snapshots, comparison and CLI/CI use built on the existing six OpenAPI/Compose checks.
**Status:** Complete; R1–R7 passed with observed evidence in [the acceptance record](repository-review-acceptance.md).

## Objective

A developer can review a local project, compare two saved local snapshots, and identify new, unchanged, removed and unknown configuration observations with reproducible evidence and a practical command suitable for development checks.

## Reusable parameters and current binding

| Parameter | Current binding |
| --- | --- |
| `{repository}` | The checkout containing this specification |
| `{implementation}` | `apps/worker/src/security-review/` |
| `{rule_set}` | The existing six rules exported by `RULES`; no additional rule families |
| `{review_command}` | `pnpm --silent review repo <directory>` with documented optional selectors and snapshot output |
| `{comparison_command}` | `pnpm --silent review compare <baseline.json> <candidate.json>` with an optional new-findings gate |
| `{fixture_root}` | A separate repository/comparison fixture directory under `apps/worker/test/fixtures/` |
| `{verification}` | Focused repository/comparison tests integrated into the existing review commands |
| `{usage_document}` | `docs/security-review.md` |
| `{acceptance_record}` | `docs/goals/repository-review-acceptance.md` |

Bind different paths or rule sets before reusing this standard. Old acceptance evidence does not transfer to a new binding.

## Practical release standard

The user prioritizes useful capability growth with honest correctness evidence. Perfect field accuracy, universal format coverage and elimination of every edge case are not acceptance requirements. Passing labeled examples proves those supported behaviors, not population accuracy.

Ordinary supported workflows must work. Demonstrated blockers that produce misleading changes, silently conceal incomplete analysis, lose input data or break the documented command must be corrected. Other limitations receive explicit documentation and a bounded backlog. Do not expand the corpus merely to increase its size or begin another reliability loop once acceptance passes.

## Required product behavior

### Repository review

- Discover conventional OpenAPI and Docker Compose filenames recursively under one supplied local root. Freeze and document the finite filename rules and default excluded directories. Provide an explicit way to select supported files with other names. Content sniffing of arbitrary project files is not required.
- Reuse the six existing declaration checks and preserve the current single-file API/CLI contract. Do not infer effective deployments, merge Compose files or execute project code.
- Produce a deterministic snapshot with portable root-relative evidence paths, input content fingerprints, reviewer/rule-semantics identity, discovery policy, limits, file outcomes and aggregate counts. Absolute root metadata, if retained, is private and excluded from finding identity.
- Distinguish assessed files, unsupported/rejected candidates and deliberate exclusions. Report incomplete discovery, unreadable candidates and exhausted limits. A complete empty supported-file inventory is valid but does not mean the project is secure.

### Snapshot comparison

- Compare validated snapshots, not arbitrary trusted JSON assertions. Reject invalid schema, duplicate/conflicting entries, unsafe paths and incompatible semantics, or explicitly mark the affected comparison unknown.
- Match observations using a documented bounded declaration identity. Preserve current file/pointer evidence. Harmless mapping or supported list reordering must not manufacture new or removed observations. Ambiguous matches stay unknown; arbitrary rename or refactoring inference is out of scope.
- Emit `new`, `unchanged`, `removed` and `unknown` outcomes with counts and supporting references to both snapshots where available. `new` means absent from adequately assessed baseline declarations. For a newly added candidate file, a complete, compatible baseline inventory proving that file absent within the same selection scope can establish new observations; the baseline did not need to assess a file that did not exist. A missing baseline snapshot, incomplete discovery or incompatible selectors cannot establish introduction and must remain unknown.
- `removed` means a previously observed declaration is absent from adequately assessed candidate declarations. It does not mean a deployed vulnerability was fixed. An unreadable or unsupported file, incomplete discovery, incompatible scope, deleted file or ambiguous rename must not be presented as a fixed issue. Deleted files may be reported separately as file changes; their old observations remain unknown for remediation purposes.
- Assess coverage at the relevant file/rule level. Preserve supported comparisons alongside unrelated incomplete files, while exposing aggregate incompleteness. Do not erase uncertainty merely to pass a gate.

### Commands and development integration

- Source-checkout help remains available without dependencies or compiled output. Document setup, repository selection, snapshot storage, comparison and gate usage. Paths with spaces and Unicode work.
- Use deterministic structured JSON by default, fixed diagnostic prose and private file/pointer metadata. Snapshot output must not overwrite an existing file or alter scanned inputs. Generated outputs and default excluded trees must not silently become source candidates.
- Give usage errors, execution/incomplete results and an opt-in findings gate distinct exit codes. A new-findings gate applies to supported `new` observations; incomplete analysis takes precedence over a clean exit.
- Provide a concrete documented CI workflow/example using the reviewer on two local inputs. Validate its syntax and execute the corresponding commands locally with controlled inputs. Remote GitHub execution is not required or authorized. No credentials, service startup, project scripts or write permissions are needed for analysis.

## Success criteria — all required

| ID | Pass/fail condition |
| --- | --- |
| R1 — Useful repository review | The typed API and repository command discover/select supported files, run both input formats and return deterministic snapshots with accurate assessed/rejected/excluded/incomplete inventory. A realistic mixed-file project and an empty supported-file inventory both work as documented. |
| R2 — Honest change comparison | The typed comparison API and command classify ordinary additions, unchanged observations and supported removals correctly; equivalent supported reordering does not create changes; missing coverage, deleted files and ambiguous identities remain explicit unknown outcomes. Snapshot compatibility and validation failures cannot yield a clean comparison. |
| R3 — Usable commands and CI example | Fresh-source help, documented Node/pnpm setup, Unicode paths, safe snapshot output and distinct usage/incomplete/findings exits are observed. The CI example has valid syntax and its local equivalent demonstrates unchanged, newly introduced and incomplete cases without executing reviewed project code. |
| R4 — Finite independent correctness evidence | A separate expected-results manifest, reviewed by someone who did not implement discovery/comparison, covers the named scenarios below with rationales. All required expected outcomes agree. Counts of unexpected changes, missed changes and unknown outcomes are reported separately. No field-accuracy threshold or growing test-count target is imposed. |
| R5 — Bounded and non-mutating behavior | Aggregate and per-file limits, exclusions, linked paths, malformed snapshots and output/input preservation are checked. Resource or discovery failures remain explicit. Neither snapshots nor reviewed files can select code, commands, external resources or sibling reads outside the supplied scope. |
| R6 — Observed integration and independent review | Worker build, focused formatting/syntax checks, existing single-file regressions, and repository/comparison acceptance pass on Windows and in a fresh isolated Linux context. Reuse existing clean-install checks for changed package/harness behavior. Run reporting regressions if shared reporting/package/harness files change. A reviewer independent of each reviewed module checks the final source and resolves demonstrated in-scope blockers. Record skips and failures honestly. |
| R7 — Concrete example and reviewable completion | Review this repository's ordinary configurations and demonstrate before/after comparison with clearly identified controlled local fixtures. Preserve input bytes, record actual outcomes, provide the usage/CI example and map R1–R7 to evidence in `{acceptance_record}`. Document remaining limitations and stop the batch. A plan or goal document alone does not satisfy this criterion. |

The finite labeled acceptance scenarios are: mixed-format discovery; explicit nonstandard filenames; excluded/generated content; empty inventory; new observation; unchanged observation; supported removal; equivalent reordering; deleted file/ambiguous rename; incomplete baseline; incomplete candidate; incompatible or malformed snapshot; aggregate-limit exhaustion; and output/Unicode-path handling. A scenario may exercise both formats in one fixture pair. Add targeted regressions only for demonstrated implementation failures or necessary public-contract checks.

## Constraints

- **MUST NOT:** fabricate data, labels, sources, credentials, test executions, accuracy estimates or completion evidence.
- **MUST NOT:** run assessments, target requests, provider/model calls, exploit/replay/reproduction workflows, execute reviewed repository code, resolve external references or connect observations to offensive action execution.
- **MUST NOT:** commit, push, publish, deploy, mutate remote/cloud state, contact third parties, overwrite user snapshots or alter input files. A reviewed CI example is local work; publishing or executing it remotely remains outside this goal.
- **MUST:** preserve existing user changes, public single-file contracts, authentication, permissions, dependencies and lockfiles. Use installed tools and current primary documentation for any implementation facts that need verification.
- **MUST:** distinguish local declarations, comparison evidence and unknown coverage from deployed security. Saved hashes establish content identity, not authenticity or trust in the producer.
- **MUST:** handle routine reversible design, implementation, review corrections and verification autonomously. Ask only for consequential unresolved decisions about security, data, cost, public behavior or irreversible actions; continue independent work while waiting when possible.
- **LIMIT:** retain the existing per-file limits: 4 MiB, depth 64, 100,000 parsed nodes, 1,000 shared reference/alias expansions and a 30-second processing deadline.
- **LIMIT:** one root per repository invocation; at most 10,000 discovered filesystem entries, 128 selected files, directory depth 24, 32 MiB selected input bytes, 120 seconds total repository processing and two concurrent file-review children. Include startup/reading/analysis in the applicable deadline and terminate owned children when it expires.
- **LIMIT:** each snapshot input/output is at most 16 MiB; comparisons have a 30-second deadline and bounded structural validation. Bounds may only be tightened through public overrides. Exhaustion is explicit incomplete/failed behavior, not silent truncation.
- **LIMIT:** two supported formats, six existing rule families, two local snapshots per comparison and one practical CI example. Full Git-history analysis, arbitrary rename inference, new formats/rules, hosted services, UI/report polish, automated fixes and performance optimization are deferred.
- **LIMIT:** broaden or repeat verification only after a relevant change, failure or unresolved evidence-backed concern. Do not restart completed work to pursue perfect accuracy.

## Output specification

- Typed implementation under `{implementation}` and source-checkout command integration in `scripts/review.mjs`, preserving existing commands.
- A versioned repository-snapshot JSON contract with kind/version, reviewer semantics identity, selected scope, limits, inventory, per-file fingerprints/outcomes, evidence-bearing observations and diagnostics.
- A versioned comparison JSON contract with baseline/candidate identities, compatibility/coverage state, `new`/`unchanged`/`removed`/`unknown` observations, deterministic counts, private evidence references and diagnostic reasons. Exact field names are a routine implementation decision documented before acceptance.
- Retained benign fixtures and independently reviewed expected outcomes, focused verification/evaluation commands, and local Windows/Linux results.
- `{usage_document}`, a CI workflow/example, `{acceptance_record}` and a short explicit backlog. Optional implementation plans do not replace running code or observed acceptance.

## Independent verification method

A checker can inspect the result contracts, immutable expected-result rationales, source diff, saved command outputs and the R1–R7 evidence map. Re-run the documented commands against retained fixtures to confirm behavior without recreating development history, needing credentials or starting reviewed services. Compare input fingerprints before/after. Reviewers assess only the supported scope and report material unverified areas.

Label changes require a documented contract/fixture error and independent reviewer agreement; implementation output never becomes its own expected result. Required regressions must pass, while documented limitations outside those behaviors remain acceptable.

## Failure modes and examples

| Failure mode | Prevention |
| --- | --- |
| Unknown input appears fixed | Removal requires compatible, adequate candidate file/rule coverage; deleted/unreadable/unsupported input retains unknown status |
| Unknown baseline appears to prove introduction | Newness requires adequate baseline coverage; otherwise retain an observation with unknown change status |
| Pointer or checkout-root movement manufactures changes | Use documented root-relative declaration identity; check equivalent reordering; keep ambiguous matching unknown |
| Arbitrary project files or scripts are executed/read implicitly | Finite selectors/exclusions, local boundaries and the existing passive reviewer; no project execution or external composition |
| Benchmark perfection replaces product progress | Finite scenario matrix, fix demonstrated blockers, document unsupported cases and stop at acceptance |
| CI recipe is mistaken for a deployed workflow | Record local command/syntax evidence and explicitly separate it from unperformed remote execution |

**Good:** Both snapshots fully assess the same service. An explicit privilege request disappears from its supported declaration, so comparison reports a removed configuration observation with old/new evidence and no claim about runtime remediation.

**Good:** The candidate file cannot be parsed. Its old observations are unknown, the comparison is incomplete, and the development check does not silently succeed.

**Good:** A new Compose file appears within unchanged discovery scope. The complete compatible baseline inventory proves it was absent, so supported observations in that new file can be classified as new. A missing baseline snapshot would not provide that evidence.

**Good:** Supported list reordering changes evidence pointers but retains equivalent declarations. Comparison reports unchanged observations and uses the candidate's current pointers.

**Bad:** A deleted file, excluded directory or malformed snapshot causes every old issue to be labeled fixed; a missing baseline causes every observation to be called newly introduced; more tests are added indefinitely to chase universal accuracy.

## Stopping rule and quality audit

Complete this goal when R1–R7 pass with observed evidence, required workflows are usable and all demonstrated in-scope blockers are resolved. Then stop. Do not require perfect real-world accuracy, arbitrary edge-case coverage or deferred backlog work. If an essential external prerequisite is unavailable, preserve progress and state the exact unmet criterion; do not substitute unrelated maintenance for the feature.

Goal-creator pre-flight passed: observable end state, role/category, reusable bindings, independently checkable criteria, structured outputs, MUST/MUST NOT/LIMIT constraints, no fabricated evidence, finite scope, concrete failure examples and an explicit stopping rule. Independent review identified and resolved the distinction between a missing baseline snapshot and a genuinely new file proven absent by complete baseline inventory. Implementation and finite acceptance subsequently passed; see the linked evidence record.
