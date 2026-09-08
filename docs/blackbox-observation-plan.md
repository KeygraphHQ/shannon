# Black-box observation implementation plan

Implement the approved [goal](goals/blackbox-observation-coverage.md) as one passive saved-data workflow. The native artifacts remain data, and this module has no execution-side integration.

1. Freeze the typed input/result contract. Independently label the finite synthetic matrix from the native schema and goal before evaluating implementation output.
2. Validate native envelopes, reconcile overlapping exchanges, and build route/identity observations and evidence-backed result explanations. Preserve localized conflicts and unknowns.
3. Reconstruct separate recorded sequences for each identity and link declared transitions to their recorded trigger/resource references. Render the same observations as escaped Markdown.
4. Add bounded local reads and a fixed isolated worker, then the source-checkout CLI and exclusive new-directory output. Reuse the existing guarded JSON reader without changing its public contract.
5. Run focused tests and independent module reviews. Demonstrate the actual CLI on the existing saved run and a clearly synthetic richer workflow example, recording hashes before and after.
6. Run clean Windows and Linux integration and affected review/reporting regressions. Record B1–B7 evidence, inspect the final diff, and stop after the finite acceptance criteria pass.

Ownership: core agent owns types/limits/validation/maps/raw interpretation; workflow agent owns recorded sequences/Markdown; corpus reviewer owns independent fixtures/expectations/evaluator; root owns file API/isolation/CLI, integration harness, usage and acceptance evidence. Only root runs shared builds.

Public entry points: `analyzeObservation(input, limits?)` for trusted in-memory JSON data and `observeDirectory(directory, options?)` for bounded file processing. The latter returns `{ result, json, markdown }`; its optional `outputDirectory` creates `observation.json` and `observation.md` exclusively. CLI exits distinguish completed processing (0), partial/failed/setup (1), and usage (2). No finding gate or coverage percentage is introduced.
