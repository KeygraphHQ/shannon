# Pre-execution independent label review

Frozen expected-results SHA-256:
`645a8ba7da4a0d4b1b36df6ba2ddfe5ae64bbb46d0996138ec690df32842f53a`

The corpus author froze the 18 cases and their expected fields before reading any
blackbox-observation implementation or output. Labels derive from the goal, native
exported input schemas, synthetic fixture data, and the separately frozen public
contract. The expected-results file remains unchanged after approval; its original
pending metadata records the freeze point, and this separate note records approval.

The root agent independently approved the ordinary counts, analysis/diagnostic
states, captured HTTP/raw-evidence states, exact duplicates within each native
collection versus normal overlap, per-identity transition links/ties/gaps,
unattributed unknown ordering, and empty/unavailable/findings/incomplete distinctions.
The review used the native fixture index, schemas and goal. No expectation edits
were requested. This review occurred before evaluator execution.

Scored fields are declared in the manifest. Required source pointers must appear on
the corresponding derived records; additional contextual source references are
permitted. Diagnostic code sets are exact. Explanation codes have explicit required
and forbidden sets rather than a claim to score every explanation field.

The evaluator requires each of the 18 fixed case IDs exactly once. A product result
whose expected status is failed can pass its case; an exception or evaluator failure
cannot. Unknown evidence categories overlap, so each has its own denominator.
File/CLI boundaries and clean-platform integration remain the root integration
author's responsibility and are recorded separately from pure API agreement.

## Reference-classification clarification after first execution

The first integration run reported an additional `missing-reference` diagnostic for
`anonymous-and-unattributed`, located at blackboard `/tasks/2`: that saved task names
the undeclared `visitor` identity. The corpus author independently confirmed from
the native `PlannerTask.identityLease` declaration, the fixture bytes and B1 that
this task reference must remain unresolved; it is not an implicit anonymous lease.

The integration owner clarified the public diagnostic taxonomy: unknown actor and
identity-lease references use `unattributed-identity`, consistently with unknown
exchange identities. The task's `/tasks/2` source must remain in that diagnostic,
and identity-reference validation must still fail for the unknown identity. This
does not declare `visitor`, accept the reference, or hide the task's uncertainty.
The expected code set and all observation labels therefore remain unchanged. The
manifest hash above still identifies the original independently labeled bytes.

After the corrected shared build, the standalone evaluator passed all 18 cases
with no mismatches, execution errors or mutated input objects. A separate inspection
confirmed that `/tasks/2` remains in an `unattributed-identity` diagnostic and that
the case remains partial. The exchange and task references may occupy separate
diagnostic records with the same code; the frozen manifest scores code sets.
