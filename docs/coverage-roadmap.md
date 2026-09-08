# Coverage and Roadmap

Shannon focuses on exploitable findings that can be validated against a running application.

## Current Shannon Coverage

- Broken Authentication
- Broken Authorization
- Injection
- Cross-Site Scripting
- Server-Side Request Forgery

## Reporting Philosophy

Shannon follows a proof-by-exploitation model. Findings that cannot be demonstrated with a working proof of concept are not included in the final report.

This reduces speculative noise, but it also means Shannon does not aim to report every possible security issue in a repository. In particular, many dependency, policy, configuration, and broad static-analysis findings are outside the core Shannon workflow.

## Roadmap Direction

### Agreed priorities

The user selected these priorities on 2026-09-07:

1. **A — Result correctness.** Establish whether conclusions are supported by evidence, contradicted, or unverifiable. Use independently labeled saved evidence and inert fixtures; internal verification flags alone do not establish correctness.
2. **D — Broader defensive capabilities.** Deliver useful additions to static analysis, supported inputs, or code-review workflows. Pair each addition with a focused correctness check so capability growth and evaluation progress together.
3. **B — Bounded reliability work.** Address demonstrated correctness, safety, or operational blockers affecting the selected change. Define required acceptance checks before implementation and stop maintenance work when those checks pass. Defer optional refactoring and unrelated hardening; do not expand a completed milestone into another reliability cycle without new evidence.

**C — Cost and time optimization is deferred behind capability growth.** Existing resource limits remain in force. Recorded cost or timing can inform a decision, but a new optimization or measurement project is not a prerequisite for useful feature work.

Each development round should name a concrete product improvement, its acceptance evidence, and its stopping point. A standalone correctness investigation may come first when it resolves a specific uncertainty; it must produce a decision about the next improvement rather than grow into an open-ended evaluation project. Reporting polish and historical format compatibility are deferred unless they block the selected product improvement. Passing tests and completed task counts are supporting evidence, not a measure of overall product usefulness.

### Completed defensive capability milestone

[Independently checked defensive configuration review](goals/defensive-review-capability.md) is complete: offline OpenAPI and Docker Compose review, six check families, a typed API and usable CLI, 41 independently labeled cases, and 121 passing review tests on both Windows and Linux. [Usage](security-review.md) and [acceptance evidence](goals/defensive-review-acceptance.md) are available. Correctness evidence applies to these supported checks; overall assessment accuracy remains unmeasured. This batch has reached its stopping point.

### Completed black-box observation milestone

[Black-box observation and workflow coverage](goals/blackbox-observation-coverage.md) is complete. It delivers passive per-identity traffic maps, recorded workflow reconstruction and evidence-backed accounts of empty/incomplete saved results through typed APIs and `blackbox-observe`. [Usage](blackbox-observation.md) and [B1–B7 acceptance evidence](goals/blackbox-observation-acceptance.md) include 18 independently labeled cases, 67 passing observation tests and clean Windows/Linux integration. The actual saved-run example maps 473 exchanges across 74 routes and retains missing response metadata and dangling references as explicit limitations. A separate synthetic example demonstrates two recorded transitions. Capture order remains per identity; observation counts never become claims of tested authorization controls or verified sessions. This batch has reached its stopping point.

The user explicitly redirected priority to the black-box side. Dependency-advisory review and further static-review expansion are deferred. The passive observation milestone itself remains separate from live assessment behavior.

### Completed cross-identity triage milestone

[Passive cross-identity response triage](goals/blackbox-cross-identity-triage.md) is complete. The comparator reports saved per-identity status and response sets, adds a stronger tier when associated raw requests have identical method/target/body, and produces traceable access-review leads with explicit uncertainty. The retained real demonstration preserves all three native and 473 selected raw inputs and reports 74 groups, 298 identity comparisons, 148 strong comparisons, and 159 insufficient-evidence comparisons. A separate synthetic demonstration reports one strong comparison while excluding a shared raw occurrence from independent evidence. Equal routes, HTTP success, and equal captured bodies remain observations rather than authorization findings. Frozen-corpus agreement, module and whole-change reviews, usage documentation, both demonstrations, retained-output non-disclosure, 79-test comparison verification, affected regressions, and clean Windows/Linux profiles passed. [X1–X7 acceptance evidence](goals/blackbox-cross-identity-triage-acceptance.md) records the exact results and limitations. This finite batch has reached its stopping point.

The opt-in validation bridge now connects one eligible comparison to a bounded fresh replay and the existing independent verifier. Generic HTTP-header checks and broad or automatic comparison-to-attack expansion remain deferred.

### Completed repository-review milestone

[Repository review and honest change comparison](goals/repository-review.md) is complete: bounded discovery, deterministic saved snapshots, new/unchanged/removed/unknown comparisons and a locally verified CI example. [Acceptance evidence](goals/repository-review-acceptance.md) records all 21 independent scenarios matching, 185 Windows review tests passing, and 184 Linux tests passing with one Windows-only skip. This milestone retains the existing six declaration rules and has reached its stopping point; further reliability work is not a prerequisite for the new black-box goal.

### Completed reporting milestones

The recent engineering milestones in this checkout focus on recorded results and local report handling:

| Milestone | Acceptance record | Status |
| --- | --- | --- |
| Clear outcomes and run/attempt provenance | [Result clarity](goals/result-clarity.md) | Locally accepted |
| Offline regressions and isolated Temporal reporting | [Reporting checks](reporting-checks.md) | Locally accepted |
| Bundle integrity, private archives and sanitized sharing | [Report bundles](report-bundles.md) | Locally accepted |
| Clean installation, command usability and Linux portability | [Reporting readiness](reporting-readiness.md) | Locally accepted on Windows and Linux |
| Historical catalog and offline report browser | [Local report library](report-library.md) | Locally verified on Windows, Linux and Chrome |

The catalog and browser now inventory saved files, expose invalid or missing evidence, retain provenance availability, and group exact copies. The current local snapshot contains 28 candidates: three valid bundles with identical content and 25 invalid candidates. These are artifact observations, not 28 independent assessments. [The library record](report-library.md#observed-saved-report-state) explains the counts and known limits.

Legacy compatibility/import handling is deferred. All 23 invalid black-box folders omit the same no-findings sentence required by the current checker; their recorded outcomes agree, and their JSON shape/reference checks reported no issues. Two also contain unexpected entries. If this work becomes necessary for an agreed product improvement, it must preserve source bytes, unavailable provenance and extra-entry diagnostics without broadly weakening validation.

These milestones do not establish overall detection accuracy or production assessment readiness. The readiness record separates verified reporting behavior from the remaining product-wide acceptance questions; there is no measured overall completion percentage.

For organizations that need broader static and organizational coverage now, see [the Keygraph platform](keygraph-platform.md).
