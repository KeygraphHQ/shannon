# Independent passive black-box observation fixtures

These are synthetic native artifact sets for the finite scenarios in
`docs/goals/blackbox-observation-coverage.md`. They contain no captured user traffic,
credentials, live session state, or executable project inputs.

The fixture author derived the envelopes from the existing exporter in
`apps/worker/src/blackbox/artifacts.ts` and the data declarations in
`apps/worker/src/types/blackbox.ts`. Exported exchanges deliberately omit
`rawRecordRef`; exported identities contain only name, role, and the recorded
authentication flag. The fixtures do not reconstruct internal engine snapshots.

Raw files use the existing `{request,response,notes,occurrence}` record shape.
Exchange IDs and response fingerprints are calculated from synthetic bytes using
the documented native capture formulas in `traffic-normalizer.ts`. The mismatch
fixture deliberately changes a response while retaining the old exchange ID.
Documentation URLs and request hosts are inert data and are never contacted.

`sets/rich` is the positive workflow example: two named identities have observations
for two routes, one response reports HTTP 403, and two transitions belong to one
identity with explicit trigger/resource references. These are recorded synthetic
states, not independently verified application behavior. Other sets isolate absent,
ambiguous, conflicting, or incomplete evidence without inventing security outcomes.

`fixture-index.json` names the synthetic exchanges to make independent review
practical. It is fixture-author metadata, not a product input. Expected labels are
stored separately and must be approved from the goal, frozen public contract, and
fixture bytes before implementation execution. Labels must never be changed merely
to match implementation output.

The root integration tests separately own local-file boundaries, output creation,
source preservation, Unicode CLI paths, and clean Windows/Linux execution. The
acceptance evaluator measures agreement with this finite corpus only; it does not
measure detection accuracy, authorization-control coverage, or application security.
