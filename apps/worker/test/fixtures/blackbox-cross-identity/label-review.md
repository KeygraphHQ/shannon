# Pre-execution independent label review

Frozen `expected-results.json` SHA-256:
`3d96a8c1d1a3352b9cb2b4cd3f807ebd87b557b3185d767527d0e711a33b6f7e`

The manifest is 13,249 UTF-8 bytes and contains seven literal case IDs. The
author read native fixture records, the native association formula, existing
observation fixture conventions, and the goal contract before reading any
cross-identity implementation or comparison output. The manifest therefore
states `implementationOutputRead: false`.

The frozen matrix labels outer membership, named/anonymous/unattributed identity
membership, recorded status/fingerprint sets, route and strong eligibility,
opaque request classes, completeness, set relations, signal/unknown literals,
recorded-owner context, and source pointers. It includes exact request equality
excluding headers, differing query targets, shared occurrences, saved-body and
content-type framing limits, incomplete evidence, and a comparison ceiling.

Expectation changes after this point require a separately recorded native-fixture
or goal-contract reason in this file and the SDD ledger. They must never be made
to conform to implementation output.

## Authorized review corrections — 2026-09-07

The independent review identified corpus/evaluator defects from the goal contract
and native fixture inspection, without implementation output. The corrections are
authorized fixture/contract reasons:

- The evaluator now retains exact missed and unexpected supported-relation keys
  and validates source pointers emitted by the actual projected result.
- The selected `incomplete-evidence` raw file now contains different response
  bytes while retaining the saved exchange filename/ID, creating the intended
  real association mismatch. Eleven raw files match the native formula; this one
  declared mismatch is the inspected fixture exception.
- The Erin/Fay no-`Content-Type` values normalize to the explicit `absent` value,
  so their content-type relation is `same`; their body relation remains
  unavailable due to framing/encoding evidence.
- The undeclared visitor identity uses the validator's canonical `unattributed`
  bucket; it remains visible and never forms an eligible pair.

Re-frozen manifest SHA-256:
`4ccaaf136da687da650dd8632b2f9b87d8759eccdf43807081be836cb2941868`

The revised manifest is 13,199 UTF-8 bytes and retains seven literal case IDs.

## Existing-case population repair — 2026-09-07

This independent repair supersedes the sparse projection and its prior hash.
The author read the goal, current plan, Task 1 brief/review/report, native fixture
records, and existing observation identity/formula rules. No comparison
production implementation or output was read. Literal expectations were expanded
from those records, without using a comparison engine to derive expected results.

The corrected seven cases contain 12 exact outer groups, 40 identity cells,
14 route-level comparisons, and four strong comparisons. All value cells now
record state, record/usable/unavailable counts, full status/fingerprint sets,
variability, the three plan-defined raw counts, and exact source arrays. Every
comparison records its group ID, deterministic comparison ID, request-class ID
or null, selected identity values, all relations, completeness, strength,
signals, unknowns, owner context, and the complete source union.

| Case | Exact groups and cells | Route comparisons | Strong comparisons |
| --- | --- | --- | --- |
| recorded-set-relations | `/same`, `/different`, `/variable`: alice and bob in each; variable cells each have two records | Three alice/bob pairs: same/same; different/different; overlapping-variable/overlapping-variable | None; raw omitted |
| raw-request-classes-and-shared-occurrence | `/orders`: alice, bob, carol observed; `/shared`: alice and bob observed, carol explicitly missing | Orders alice/bob, alice/carol, bob/carol; shared alice/bob | Orders alice/bob, class 1 |
| raw-body-content-type-framing | `/body`: alice/bob; `/content`: carol/dave; `/framing`: erin/fay; all six identities have cells in every group | One observed pair per group | One shared exact class per group, classes 1–3 |
| named-anonymous-unattributed-membership | Anonymous and alice observed; bob missing; unattributed observed with unavailable response | Anonymous/alice only | None |
| recorded-owner-context | `/document`: alice and bob observed | Alice/bob, with only resource-recorded linked to traffic `/0` | None |
| incomplete-and-raw-unavailable | `/incomplete`: alice has usable metadata; bob's status zero makes its complete recorded response unavailable | Alice/bob, both metadata relations unavailable | None; alice raw missing and bob raw association mismatches |
| comparison-limit | `/limit`: alice and bob observed | Alice/bob; one comparison equals maxComparisons 1 | None |

Contract-derived corrections:

- Route comparisons use status/fingerprint evidence for completeness and signals.
  The shared occurrence therefore retains `shared-raw-source` while its route
  metadata remains complete. Raw body/content-type unavailability is not an
  applicable route response dimension. Incomplete evidence keeps only its
  recorded-status, recorded-fingerprint and raw-request unknown codes.
- Group ordinals sort by route signature, method, origin, then path. Comparison
  ordinals sort by group, identity pair, route before strong, then request class.
  Request class labels retain all successfully associated classes, including
  carol's unpaired query class and the excluded shared-occurrence class. These
  membership facts are case-level label metadata, separate from the public
  expected projection; raw target/body/header values are never copied into it.
- The existing limit fixture has exactly one eligible route pair and no raw
  records. It cannot fail an inclusive maxComparisons of 1. Its corrected label
  is `completed`, with the one full group/pair retained. An exceeding-limit
  fixture remains outside this seven-case repair.
- Sources now use the plan's exact `sources` shape throughout groups, cells,
  comparisons, selected identity values, and owner contexts. They retain identity
  declarations, selected traffic, selected supplied raw records (including the
  mismatched raw record supporting its unavailability), and intersecting context
  sources. Missing cells retain their declaration; no unlinked resource enters
  the owner context. Raw counts obey usableRawResponses + unavailableRawResponses
  = records, even when raw is omitted. Shared occurrences still count as
  associated requests and usable parsed raw responses.
- Evaluator relation keys include group, comparison, identity pair, basis,
  request class, dimension and relation, with multiset subtraction so duplicate
  populations count as unexpected. Frozen and actual nested sources both pass
  through the same source resolver; sparse aliases cannot bypass validation.

Interim manifest SHA-256:
`bf7e6ed46eceb99637bb93d9e0a28b4076644d054f3b345152eba4d0753051d5`

Size: 121,307 bytes. Cases: seven. `node --test
apps/worker/test/blackbox-cross-identity-evaluation.test.mjs` passed 13/13 tests,
including eleven native formula matches, the one documented mismatch, all frozen
references, and rejection of invented nested actual sources. `node --check
scripts/evaluate-blackbox-cross-identity.mjs` passed. This is an interim freeze:
the separate missing-scenario expansion remains required before Task 1 closes.

## Scenario expansion in progress — 2026-09-07

Ten compact case IDs were added from the independently reviewed edge design:
outer-key collision, exact duplicate envelope, reordered native input, unequal
saved request body, saved body values/unframed bodies, raw response states,
empty and absent findings, framing rejections, and integration boundaries.
The limit fixture now has Carol as a third declared/observed identity and its
label is an explicit failure at `maxComparisons: 1`. Integration-boundaries
assigns Task 5/6 ownership; raw association input ceilings are Task 2 pure plus
Task 5/6 integration ownership. No comparison production module or output was
read while adding these labels.

## Final 17-case freeze — 2026-09-07

The scenario expansion and its fixture/contract repair are complete. The final
manifest contains 17 literal case IDs, 28 exact outer groups, 72 identity cells,
30 route comparisons, 27 strong comparisons and 31 opaque request classes. The
fixture index selects 61 available raw records plus one explicitly missing raw
record. Sixty available records match the native association formula; the only
formula mismatch is the deliberately retained incomplete-evidence association
mismatch documented above.

The post-freeze edits were required by independent review and the goal contract:
complete public populations and sources, the ten named missing scenarios,
formula-correct raw IDs, actual parsed CRLF saved HTTP strings, full framing and
response-state coverage, and an explicit distinction between omitted raw input
and requested-but-missing raw input. The raw-response and integration cases were
labeled from the native records and contract before their production comparison
output was read. No expectation was changed to conform to implementation output.

Final `expected-results.json` SHA-256:
`2834dee64fd78d500d4a9ffd0ddfbe0ba487e9ffb0ef6fc83bcd9ae82da629e7`

The final manifest is 360,951 UTF-8 bytes. `fixture-index.json` is 5,206 bytes
with SHA-256
`1b8e9d15c49752438837606e6544fbf630799e54976f28a0b1dae7a55657fc5f`.
Evaluator self-checks pass 16/16 and independently verify literal case coverage,
complete populations, omission/invention detection, supported-relation deltas,
nested source resolution, native association formulas, selected missing records,
strong classes across unusable responses and actual CRLF semantics.

## Independent evaluator and coverage review correction — 2026-09-07

The independent re-review found two remaining Task 1 defects without reading
comparison production code or output. The evaluator's supported-relation delta
pass assumed that an actual `comparisons` value was an array after the exact
shape comparison had already recorded a mismatch; object, null, string, or a
malformed array member could therefore throw instead of returning an ordinary
failed verdict. The relation-key extractor now bounds that path with explicit
array and record checks. The exact comparator already handled the other
projected population arrays without a corresponding post-comparison iteration,
so no broader shape redesign was needed.

The manifest's `coverage` metadata still named only the original seven cases.
It now contains one compact scenario entry for each of the 17 literal
`CASE_IDS`, in the same order and with no duplicate membership. This is a
metadata completeness correction required by the frozen-corpus contract; no
case expectation or production-derived result changed.

Re-frozen `expected-results.json` SHA-256:
`3299b99bc0052f4caa25659fc0111b5c977a02b0e9f2010c1969e8c11a0ee241`

The corrected manifest is 362,766 UTF-8 bytes and contains 17 literal case IDs.
`fixture-index.json` remains 5,206 bytes with SHA-256
`1b8e9d15c49752438837606e6544fbf630799e54976f28a0b1dae7a55657fc5f`.
Evaluator self-checks pass 17/17, including malformed non-array comparison
populations and exact one-to-one coverage membership.

## Native-contract reconciliation — 2026-09-08

An independent re-audit read the goal, Task 1 plan and review record, the native
observation validator/raw-association/HTTP parser contract, and all 17 fixture
sets. It did not read comparison production code, built comparison modules,
comparison output, or prior evaluator results. The audit found that the frozen
labels assumed facts that the native documents did not encode.

All 17 blackboards had an empty `exchanges` collection while the traffic
inventories contained 96 rows and 95 unique exchange IDs. Under the native
validator this emits `missing-overlap` for every unique exchange. Each
blackboard now contains the exact corresponding traffic envelopes, including
the intentional duplicate row in `duplicate-native-envelope`. The duplicate
case therefore retains two counted native duplicates, one in each required
export. The frozen group, cell, comparison and recorded-owner sources now add
481 resolving `blackboard#/exchanges/N` references alongside their existing
traffic references.

The audit also found 49 formula-matched usable raw responses whose saved full
response fingerprints did not match the parsed raw response bytes. Those
fingerprints now use the native `sha256:<64 lower-case hex>` formula. The
unattributed status-zero exchange retains status zero and now carries the
native no-response fingerprint instead of invalid null metadata. No request,
response, task ID, recorded identity or capture counter changed, so all 95
exchange IDs and all 61 raw filenames remain unchanged.

The corrected fingerprints change 21 previously unavailable frozen
fingerprint relations to four `same`, sixteen `different` and one
`overlapping-variable`. Six comparisons become complete; the remaining
framing/body unknowns stay partial. Group/cell counts, 28 groups, 72 cells, 30
route comparisons, 27 strong comparisons, 31 request classes, case statuses,
coverage membership and opaque group/comparison/request-class IDs are
unchanged. The incomplete-evidence association mismatch, two explicit raw
response conflicts, status-zero/absent/truncated states, selected missing raw
record, shared occurrence and framing rejections remain intentional.

The evaluator now proves exact traffic/blackboard overlap, valid normalized
response metadata, native raw formula population, usable raw status/fingerprint
agreement with explicit conflict exemptions, complete dual-envelope sources,
CRLF bytes and reference resolution. The indexed raw population is 61
available plus one selected missing record: 60 available records match the
formula, one is the intentional mismatch, and the 60 matches contain 54 usable
parsed responses (52 agreements and two explicit conflicts) plus six
unavailable/non-usable responses.

Re-frozen `expected-results.json` SHA-256:
`c1aa5ff51eaa5c352773d5a1a303bc21baf840e9fe1f96a34df54893ba1465b4`

The corrected manifest is 432,281 UTF-8 bytes and contains 17 literal case IDs.
`fixture-index.json` remains 5,206 bytes with SHA-256
`1b8e9d15c49752438837606e6544fbf630799e54976f28a0b1dae7a55657fc5f`.
The 103 JSON files below `sets/` contain 125,119 bytes and have tree SHA-256
`83944478a2d6cbacf7dc53e08597991e1f3aaaef3dcc5c1618f966da612764c5`,
computed by hashing each lexically sorted POSIX relative path, NUL, file bytes
and NUL. Evaluator self-check source SHA-256 is
`6fb98206079b5f5afa79adb8bf70ef7ce4a06c49698684da5f3e4af4f01a599c`
for 24,059 bytes before this review record was appended.

## Independent Task 1 repair loop — 2026-09-08

This repair supersedes the preceding native-contract freeze. It used only the
goal/plan, native traffic and observation contracts, fixture documents, frozen
labels, and evaluator selfchecks. It did not read a cross-identity production
implementation, production output, or a production-versus-frozen result.

The two truncated-response envelopes now match native normalization: status
zero and the fingerprint of `<no response>`. All 60 formula-matched available
raw records are checked across usable, absent, truncated, and malformed/status-
zero response states. Fifty-eight agree with native saved metadata, and the two
documented explicit conflicts are each proved to disagree. The sole filename
formula mismatch remains the deliberate `incomplete-evidence` association case.

`raw-body-content-type-framing` is now `completed` because its partial private
body/content-type evidence produces no recoverable association diagnostic. The
variable `framing-rejections` route emits `within-identity-variability`.
`duplicate-native-envelope` retains both traffic and blackboard `/1` pointers in
every affected source union. `incomplete-evidence` selects Alice's absent raw
record as missing and retains that raw source alongside Bob's deliberate
mismatch.

The existing `recorded-set-relations` case now includes a fourth group at
`/assets/public.js`, with equal recorded responses and no authorization or
expected-policy inference. This covers the required public/static-looking
scenario without adding another case. The corpus remains at 17 cases. It now
contains 98 traffic and 98 matching blackboard rows, 97 unique exchange IDs, 29
groups, 74 identity cells, 31 route comparisons, 27 strong comparisons, 31
request classes, and 1,728 projected source references. The raw selection is 61
available plus two selected-missing records.

Re-frozen `expected-results.json` is 439,894 UTF-8 bytes with SHA-256
`fc1b04135d95a38f9ff6e27f238c7cd86f20e4f575683a709f28e5ba5f52eacc`.
`fixture-index.json` is 5,260 bytes with SHA-256
`25ff225e62af14f4405b233fdb2ddf1d62964c9f32cf8cfe7369618b478ff3b7`.
The 103 JSON files below `sets/` contain 127,340 bytes and have tree SHA-256
`5539467a504b4ccde89655ab8d5232db1b653f848b13801826409ad67fd77dcc`.
The evaluator source remains 12,788 bytes with SHA-256
`c4f5c8e9cec37092e15afeefbf049a655342653555172dcfafe84bbc75d5b6c4`.
The expanded evaluator selfcheck source is 29,061 bytes with SHA-256
`8c28bc99e2842b729e7529aef3b8c184c5022f7d4b6598e0586244ceb913107f`.
All 23 selfchecks pass; JSON parsing, JavaScript syntax, exact overlap, raw
selection/formulas, response metadata, source retention/resolution, status and
signal invariants, and CRLF semantics are included.
