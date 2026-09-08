# Independent cross-identity comparison corpus

These native synthetic artifact sets freeze a finite comparison matrix for
`docs/goals/blackbox-cross-identity-triage.md`. They contain no captured traffic,
credentials, executable input, or reachable origin; every origin ends in
`.invalid`. `PRIVATE_SENTINEL` only appears in raw fixture records so later
non-disclosure tests can prove comparison results never expose it.

The corpus author read the native observation schema, raw association formula,
fixture conventions, and goal contract before any cross-identity implementation
or output. The labels are hand-derived and frozen in `expected-results.json`.
They are a finite agreement corpus, not an authorization proof, coverage metric,
or vulnerability classifier.

Raw files use the native `{request,response,notes,occurrence}` representation.
Their names derive from `ex_` plus the first 24 hex characters of
`sha256(taskId + NUL + identity + NUL + captureSequence + NUL +
sha256(request + NUL + response))`. The `incomplete-evidence` association-mismatch
record is intentionally the documented exception: its selected filename and
traffic ID derive from the saved no-response bytes, while the fixture raw bytes
intentionally differ and prove the association mismatch.

The expected projection uses the plan's complete `groups[].identityCells` and
`comparisons[].identityValues` shapes with exact `sources` arrays. It never
selects only the comparisons of interest: every observed eligible route pair and
every eligible shared request class appears. Every group retains every validated
identity bucket, including missing cells. The case-level
`requestClassMembership` labels also preserve singleton and excluded shared
classes; they are audit labels and are not fields of the public result.

`comparison-limit` has three named identities in one outer group. With
`maxComparisons: 1` its three required route comparisons exceed the inclusive
ceiling, so the frozen result is an explicit failed analysis with no emitted
groups or comparisons.

The corpus has 17 literal cases. `integration-boundaries` is deliberately a
normal pure comparison input with `additionalIntegrationOwner: ["Task 5",
"Task 6"]`: file-output ceilings, cancellation/reaping, source-byte hashes,
clean profiles, stdout/file equality, and non-disclosure are integration
checks, never synthetic pure-analysis outcomes. Raw association input ceilings
remain a Task 2 pure test with Task 5/6 integration coverage.

The recorded-relations case includes `/assets/public.js` as a deliberately
static-looking path. Its equal recorded response is only passive comparison
evidence; the label does not infer public authorization or expected policy.
Whenever a fixture set requests raw input, `fixture-index.json` selects every
reconciled exchange ID as either available or missing. Native duplicate envelope
pointers remain in every affected source union even when the duplicate value
collapses to one logical record.
