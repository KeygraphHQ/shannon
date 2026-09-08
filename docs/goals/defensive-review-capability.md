# /goal: Deliver independently checked defensive configuration review

**Category:** BUILD, with VERIFY acceptance.
**Role:** Engineer responsible for a useful defensive analysis capability and its correctness evidence.
**Scope:** Offline OpenAPI contract and Docker Compose configuration review, a reusable API and CLI, independently labeled evaluation cases, and bounded integration verification.
**Status:** Completed on 2026-09-07; all C1–C8 criteria passed with observed evidence in [the acceptance record](defensive-review-acceptance.md).

## Objective

The repository provides a usable offline configuration-review capability for both bound input families, with all six bound check families implemented, independently checked expected outcomes, reproducible command-line use, and observed passing Windows/Linux acceptance.

## Parameters and current binding

The standard is reusable by binding the repository, input families, rule set, corpus and commands before execution. A new binding requires new acceptance evidence; previous results do not transfer.

| Parameter | Current binding |
| --- | --- |
| `{repository_root}` | The checkout containing this goal |
| `{review_module}` | `apps/worker/src/security-review/` |
| `{input_families}` | OpenAPI 3.0.x / 3.1.x JSON or YAML; single-document Docker Compose YAML |
| `{rule_set}` | The six families in the rule contract below |
| `{review_command}` | `pnpm --silent review <openapi\|compose> <file>` |
| `{fixture_root}` | `apps/worker/test/fixtures/security-review/` |
| `{verification_command}` | `pnpm test:review` |
| `{linux_verification_command}` | `pnpm test:review:linux` |
| `{acceptance_record}` | `docs/goals/defensive-review-acceptance.md` |
| `{usage_document}` | `docs/security-review.md` |

## Priority and product outcome

A (correctness) sets acceptance, D (broader defensive capability) supplies the feature work, and B (reliability) addresses demonstrated blockers within this batch. Cost optimization and reporting polish remain deferred. Correctness work and capability growth proceed together; the milestone does not require perfect or universal analysis before delivering the supported feature set.

The new capability reviews declarations already present in local files and offers remediation guidance. Its conclusions are configuration-consistency defects or configuration-risk observations, with explicit applicability. They are not claims of deployed vulnerability, successful exploitation, or overall product accuracy. Existing assessment-result correctness remains a separate unresolved product question.

## Rule contract

Exactly six rule families are required. Each receives a stable rule ID, documented supported semantics, source evidence, positive/negative/unknown cases, and remediation guidance.

| Family | Required behavior |
| --- | --- |
| OpenAPI security-scheme references | Identify security requirements that reference an undeclared scheme when the relevant local declarations are fully resolvable. Distinguish missing declarations from unresolved references or malformed input. |
| OpenAPI OAuth2 scope references | Identify required OAuth2 scopes absent from the locally declared flows. Keep OpenID discovery and unresolved definitions unknown; do not apply OAuth scope semantics to unrelated scheme types. |
| Compose privileged mode | Identify an explicit request for privileged mode, with platform/context limitations. An omitted or unresolved value is not equivalent to literal `true`. |
| Compose host namespaces | Identify explicit host network or host PID namespace requests. Describe the declared setting without inferring deployed behavior. |
| Compose isolation-profile overrides | Identify explicitly unconfined supported seccomp/AppArmor settings, accepting documented syntax variants. Omission of a setting does not prove an unsafe runtime default. |
| Compose expanded capabilities | Identify explicit `ALL` or `SYS_ADMIN` additions. Preserve capability/platform applicability and avoid inferring grants from unrelated text or unresolved values. |

These are six families, not a target to expand into a general linter. Similar checks, additional formats, policy customization, hosted services, and automatic remediation belong in the backlog.

## Success criteria — all required

| ID | Pass/fail acceptance condition |
| --- | --- |
| C1 — Useful feature set | Both input families and all six rule families work through the reusable API and CLI. Each supported positive case produces the expected rule ID, classification, evidence pointer and remediation. Negative cases produce no corresponding issue. Validity diagnostics are separate from risk observations. |
| C2 — Independently grounded correctness | A versioned corpus has at least 36 meaningful labeled cases, with at least two positive, two negative and two ambiguous/unsupported cases per family, plus parsing and CLI integration cases. Every expected outcome has a rationale and specification/source reference. At least one reviewer who did not implement the rules checks all labels before final acceptance; implementation output must not define the expected labels. |
| C3 — Honest evaluation | A repeatable evaluation command compares exact expected rule IDs, classifications, applicability and evidence locations with actual results. All required corpus cases match. The evaluation reports false positives, false negatives and abstentions separately, including per-family denominators. Unsupported or malformed input cannot count as a clean pass. Fixture agreement is not described as field accuracy, recall, complete coverage, or proof that the whole product works. |
| C4 — Usable command contract | Fresh-checkout help works without compiled output. Normal use requires only the documented local build prerequisites, with no model credentials or running target. The command emits deterministic structured JSON, supports paths with spaces/Unicode, has documented exit codes for completed analysis, usage and incomplete/failed analysis, and exposes stable file/pointer evidence without dumping source secrets. A separate opt-in findings gate may fail on reported risks; findings and execution failure must remain distinguishable. |
| C5 — Bounded and non-mutating input handling | Byte/depth/node/reference limits, linked-file handling, YAML ambiguity, unresolved interpolation and unsupported composition are tested. No external references, environment files, network resources or implicit sibling files are read. Input bytes remain unchanged. Resource-limit or unsupported-semantics cases produce explicit incomplete/unknown coverage, including when partial valid observations are available. |
| C6 — Working integration | Worker build, focused formatting/syntax checks, `{verification_command}`, an isolated fresh-context Linux run, and a fresh-context Windows install/build/use check pass with observed evidence. Existing reporting regression checks pass after shared launcher/package/harness changes. Platform-specific skips are named; infrastructure failures are failures. Preserve dependencies and lockfiles. |
| C7 — Independent review and concrete example | A reviewer who did not implement the reviewed modules checks semantics, evidence honesty, parser/input boundaries, integration and final diff. Every demonstrated in-scope correctness or safety blocker is fixed and verified. Run the new command against at least one repository-owned benign configuration, record the actual outcome and applicability, and verify unchanged input bytes. A result with no applicable risk observations is acceptable; do not manufacture a positive result. |
| C8 — Reviewable completion | `{usage_document}` explains supported checks, versions, limitations, commands and example output. `{acceptance_record}` maps C1–C8 to observations, commands, corpus results, review dispositions and unresolved out-of-scope gaps. It clearly distinguishes new configuration-review acceptance from existing reporting tests and unmeasured assessment accuracy. The implementation, examples and evidence exist; a plan or document alone cannot satisfy the goal. |

## Constraints

- **MUST NOT:** fabricate evidence, labels, sources, credentials, executions, metrics or passing results; suppress difficult cases; relabel a failing case merely to obtain a pass; or weaken established validation/security controls.
- **MUST NOT:** execute target requests, model/provider calls, vulnerability reproduction, assessments, replay, exploit generation or autonomous offensive workflows. Do not connect these checks to finding/exploitation queues or modify assessment scheduling, acceptance policy, prompts or action execution.
- **MUST NOT:** fetch references embedded in inputs, expand host environment variables, load `.env`/`env_file`, follow Compose `include`/`extends` or multi-file composition, or run input-derived code/commands. Do not use `docker compose config` as the input parser. In-document references/aliases may be supported only with explicit bounds and cycle handling; unsupported constructs must be reported.
- **MUST NOT:** modify source inputs or unrelated user work; introduce dependencies or lockfile changes; commit, push, publish, deploy, mutate remote/production state, contact third parties, or add a hosted UI. Public documentation and ordinary dependency/image downloads needed for isolated test setup are allowed; the analysis itself remains offline.
- **MUST:** preserve current public contracts, authentication, permissions, security boundaries and existing resource controls. Use the installed parser/tool versions and verify relevant semantics against primary specifications.
- **MUST:** distinguish declared configuration from effective deployed state, explicit values from defaults, and unknown applicability from a negative finding. Public OpenAPI access alone is not a vulnerability. OpenAPI version differences, operation overrides, OR/AND alternatives and empty anonymous requirements must not cause invented findings.
- **MUST:** handle routine reversible implementation, testing, review corrections and documentation autonomously. Raise only genuinely consequential unresolved decisions about behavior, security, data, cost or irreversible actions; continue independent work while such a decision is pending.
- **LIMIT:** two input families, six rule families, one local file per analysis invocation, at most 4 MiB per input, 64 parsed nesting levels, 100,000 visited nodes and 1,000 in-document reference/alias expansions. Enforce a finite per-input processing deadline of at most 30 seconds, with isolated-process handling if required to contain synchronous parsing. Limit exhaustion is an explicit incomplete result.
- **LIMIT:** independent work may run in parallel with clear file ownership. Broaden or repeat verification only after a relevant code change, failure, new evidence or unresolved review concern. Do not add optional cleanup, benchmarks, report compatibility or extra rule families after acceptance passes.

## Output specification

- Typed, testable implementation in `{review_module}` plus a small command entry point and a discoverable source-checkout launcher for `{review_command}`.
- A documented versioned JSON result containing analysis kind/version, selected input format, completed/partial/failed status, assessed and unsupported scope, stable diagnostic codes, and issues with rule ID, classification, applicability, evidence file/pointer, rationale and remediation. Do not copy arbitrary configuration values into diagnostics or examples; file/pointer metadata is explicitly local/private.
- `{fixture_root}` contains benign synthetic JSON/YAML inputs and a separate expected-results manifest with case ID, format/version, family, expected outcome, evidence pointer, rationale and source citation. Tests must consume the manifest without deriving expected results from the implementation.
- Reproducible local and isolated Linux commands, a clean Windows installation check, and evaluation output with actual/expected mismatches and per-family counts.
- `{usage_document}` and `{acceptance_record}` with a small backlog for deferred issues. Reuse suitable test infrastructure without coupling analysis to the offensive execution pipeline.

## Verification method

An independent checker can inspect the documented result schema and rule contracts, read labeled fixture rationales, rerun the named verification commands against the retained corpus, and inspect saved Windows/Linux outputs and review dispositions. The acceptance record links every C1–C8 verdict to concrete files and observations. No live target, production environment, model credentials, or repetition of the implementation process is needed.

Implementation authors may repair code in response to a failed case. Label corrections require an independently justified specification/fixture error, a recorded rationale and reviewer agreement. Validation remains failed until the corrected code/corpus is rerun successfully.

## Failure modes to prevent

| Failure mode | Prevention |
| --- | --- |
| A larger test count substitutes for product value | Acceptance requires a working new command, both analysis capabilities, evidence-bearing results and a usable repository-owned example. |
| Static observations are described as proven vulnerabilities | Separate consistency defects, configuration risks, unknown applicability and deployed-state uncertainty in the result contract and corpus. |
| Parsing or unresolved composition becomes an empty successful result | Explicit incomplete status, diagnostics, resource limits and negative/ambiguous cases. |
| The benchmark merely mirrors the implementation | Independent labels, primary-source rationale, exact evidence expectations and visible mismatches. |
| Correctness or reliability becomes an endless side project | Fixed formats/rules/corpus obligations and the stopping rule below; optional work goes into a backlog. |
| New findings silently enter autonomous action execution | Standalone offline API/CLI; no assessment-queue or tool-execution integration. |

## Examples

**Good:** A literal Compose privilege setting produces a configuration-risk observation at its actual source pointer with least-privilege remediation. An unresolved variable at that setting produces unknown applicability. Neither result asserts that a host has been compromised or that a container was started.

**Good:** An OpenAPI requirement referencing a missing local scheme produces a contract-consistency diagnostic. Explicit anonymous access does not become an authentication-bypass finding, and an unresolved reference does not become a claimed missing declaration.

**Bad:** The checker reads environment files to guess an effective value, marks unsupported files clean, exports private source values, treats internal labels as independent truth, or feeds static observations to an exploitation workflow.

## Stopping rule

Complete the goal only after C1–C8 pass and the evidence is recorded. Then stop this batch. Do not require universal accuracy or eliminate nonblocking backlog items before closing it. If an essential requirement cannot be met, preserve completed work and state the exact unmet criterion and external dependency; do not substitute more reporting, documentation or maintenance for the missing capability.

## Specification sources and quality audit

The bound semantics must be checked against primary sources, including [OpenAPI 3.0.4 security requirements](https://spec.openapis.org/oas/v3.0.4.html#security-requirement-object), [OpenAPI 3.1.1 security requirements](https://spec.openapis.org/oas/v3.1.1.html#security-requirement-object), [Compose service declarations](https://docs.docker.com/reference/compose-file/services/), and [Compose interpolation](https://docs.docker.com/reference/compose-file/interpolation/). These sources define declarations and interpretation; they do not demonstrate the state of any deployed application.

Goal-creator audit: observable objective; eight independent pass/fail criteria; typed output contract; MUST/MUST NOT/LIMIT boundaries; reusable bindings; independent verification; six explicit failure modes; non-trivial good/bad examples; and a finite scope with an explicit stopping rule. No acceptance criterion is marked passed before implementation evidence exists.
