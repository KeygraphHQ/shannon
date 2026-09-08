# Independent configuration-review corpus

`expected-results.json` contains versioned labels for 36 core cases: two positive, two negative and two ambiguous cases for each of the six bound families. Five additional inputs cover parser rejection. Every input has a separate case ID, format/version, exact expected issue labels, expected completion status, rationale and primary-source references.

Labels were written from the goal contract, public API types and cited specifications before the author read any rule implementation or result. An independent review of these labels is required before acceptance. A code failure must not be repaired by changing a label to match output. Any specification-backed label correction must retain its rationale and reviewer disposition in the acceptance record.

Positive means the declaration supports the corresponding bounded observation. Negative means that observation is absent from supported declarations. Ambiguous means the reviewer must explicitly report partial or failed analysis; an empty completed result is incorrect. Applicability is always the declaration, never a claim about a running deployment.

The evaluator compares exact rule ID, classification, applicability and RFC 6901 evidence pointer as an order-independent multiset. A wrong pointer or classification therefore contributes one missing expected label and one unexpected label. Duplicate observations count as unexpected labels. Expected status and local evidence-file identity are checked separately; incomplete results require diagnostics. Fixture bytes must remain unchanged.

Per-family reports give case and expected/emitted issue denominators, unexpected issues (false positives), missing issues (false negatives), and abstained cases separately. Abstention means analysis status is incomplete or the corresponding rule scope is partial/unknown. The parser cases have a separate denominator. These measurements describe only this retained synthetic corpus; they are not field accuracy, full coverage or deployed-vulnerability measurements.

The fixtures are data only. Synthetic `.example.invalid` references, `extends` paths and image names must never be fetched or executed. No adjacent reference file exists or is required. YAML inputs intentionally include interpolation and malformed structures; do not pass them to a runtime or a command that expands configuration.

After building the worker, run `node scripts/evaluate-security-review.mjs` from the repository root. The command prints JSON and exits 0 only when every case agrees, 1 for disagreement/execution failure, or 2 for invalid arguments. `--help` needs no compiled output.
