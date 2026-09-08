# Black-box Cross-Identity Response Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded offline comparison product that turns one saved multi-identity black-box run into traceable recorded-response relations and stronger exact-target/body triage signals without making authorization or vulnerability claims.

**Architecture:** Extend the completed passive observation boundary rather than importing the live black-box engine. A pure comparison pipeline validates the native input projection, aggregates route-level identity sets, and derives private raw request/response profiles before returning a value-only result. A fixed isolated worker reuses guarded reads and exclusive output creation for the local-file API and source-checkout CLI; raw values never cross the result/IPC boundary.

**Tech Stack:** TypeScript 5.9, Node.js 22, pnpm 10.33, `node:test`, the existing strict HTTP text parser, strict JSON reader, isolated child-process runner and Biome 2.4.

**Spec:** `docs/goals/blackbox-cross-identity-triage.md`

## Global Constraints

- Process supplied saved data only. Never make target, model, Burp or browser requests; authenticate, crawl, replay, mutate traffic, generate attack plans or execute project/input code.
- Keep comparison output disconnected from planner, scheduler, attack compiler, action worker, replay service, verifier and finding acceptance.
- Never label passive evidence as allowed, denied, bypassed, vulnerable, safe, verified or exploitable. Authorization, principals, sessions, expected policy, ownership authenticity, semantics, causality and application-wide coverage remain unknown.
- Never emit raw requests/responses, header/cookie/query/body values, excerpts, or newly computed request/body/content digests. Existing validated native full-response fingerprints are permitted only in the recorded-metadata view and remain labeled as full saved-response fingerprints.
- Preserve the `offline-blackbox-observation` schema, `blackbox-observe`, native artifact contracts, dependency sections, lockfile and unrelated user changes.
- Reuse the observation ceilings: 16 MiB/native file, 1 MiB/raw file, 64 MiB aggregate input, 512 raw files, 10,000 exchanges, 2,000 routes, 16 recorded identities, depth 64, 500,000 nodes, 50,000 records, 16 MiB/output and 60 seconds total. Add ceilings of 5,000 comparisons and 256 sources/comparison; public overrides only tighten them.
- The expected manifest contains at most 30 independently labeled cases and must be frozen before its author reads implementation output. Do not change an expectation to make implementation pass.
- Work in the current user-owned checkout because the feature depends on the completed uncommitted observation module. Do not create commits, switch branches, reset files or discard changes. Record task baselines and diffs in the SDD workspace instead.
- Follow red-green-refactor for every production behavior: write a real behavior test, run it and observe the intended failure, implement the minimum behavior, rerun it to green, then run the affected suite once.

---

## Task 1: Freeze the independent synthetic comparison corpus

**Files:**

- Create: `apps/worker/test/fixtures/blackbox-cross-identity/fixture-index.json`
- Create: `apps/worker/test/fixtures/blackbox-cross-identity/expected-results.json`
- Create: `apps/worker/test/fixtures/blackbox-cross-identity/README.md`
- Create: `apps/worker/test/fixtures/blackbox-cross-identity/label-review.md`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/recorded-relations/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/raw-comparability/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/raw-framing/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/identity-context/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/resource-context/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/incomplete-evidence/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/limits/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/outer-key-collision/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/duplicate-native-envelope/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/reordered-native-input/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/different-saved-request-body/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/saved-body-values-and-unframed/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/raw-response-states/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/findings-empty/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/findings-absent/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/framing-rejections/`
- Create native fixture files under: `apps/worker/test/fixtures/blackbox-cross-identity/sets/integration-boundaries/`

Each set contains `traffic_inventory.json`, `blackbox_blackboard.json` and, where the case needs a known count, `blackbox_authz_findings.json`. Raw cases contain `raw/ex_<24-lowercase-hex>.json`; each exact filename is derived from its fixture request, response, task, identity and counter using the native association formula.
- Create: `scripts/evaluate-blackbox-cross-identity.mjs`
- Create: `apps/worker/test/blackbox-cross-identity-evaluation.test.mjs`

**Interfaces:**

- Consumes: the native schemas documented in `docs/goals/blackbox-cross-identity-triage.md` and existing observation fixture conventions.
- Produces: `loadCrossIdentityCorpus()`, `compareExpectedCrossIdentityProjection()`, `summarizeCrossIdentityCases()`, `validateCrossIdentityReferences()` and `evaluateCrossIdentityCorpus()` from `scripts/evaluate-blackbox-cross-identity.mjs`; a frozen manifest consumed by Task 6.

- [x] **Step 1: Create hand-derived native fixtures and labels without reading comparison implementation or output.**

Use no more than 30 cases. The manifest must name every case exactly once and hand-label these dimensions with literals: outer group membership; identity membership; recorded status/fingerprint sets; evidence completeness; route-level and strong eligibility; request-class membership by opaque ordinal; set relations; signals; unknown reason codes; recorded-owner context; required source pointers; expected analysis status.

The case matrix must cover all scenarios in the spec, combining compatible scenarios in one case. Reuse an existing observation fixture only by copying native data into this new corpus and independently labeling the new meanings. Record this statement in `expected-results.json`:

```json
{
  "labeling": {
    "basis": "Native fixture records and the goal contract were read before any cross-identity implementation or output.",
    "implementationOutputRead": false
  }
}
```

Use synthetic `.invalid` origins and inert identifiers. Raw fixture values may contain `PRIVATE_SENTINEL` values specifically so Task 3/4 non-disclosure tests can prove they never appear in output.

- [x] **Step 2: Build evaluator self-checks before importing the future production API.**

`CASE_IDS` must be a literal frozen array. `summarizeCrossIdentityCases(results, CASE_IDS)` fails when a case is missing, duplicated or unexpected; separately counts expected failed analyses, unexpected failures, execution errors, mutations, missed supported relations and unexpected supported relations. `validateCrossIdentityReferences()` resolves only traffic, blackboard, findings and selected raw JSON pointers. `compareExpectedCrossIdentityProjection()` compares exact prescribed fields and required sources without accepting additional/missing array entries.

The evaluation test initially runs only evaluator self-checks through this pattern:

```js
test('omitted, repeated or invented comparison case results cannot pass', () => {
  assert.equal(summarizeCrossIdentityCases([record('a'), record('b')], ['a', 'b']).passed, true);
  assert.equal(summarizeCrossIdentityCases([record('a')], ['a', 'b']).passed, false);
  assert.equal(summarizeCrossIdentityCases([record('a'), record('a')], ['a', 'b']).passed, false);
  assert.equal(summarizeCrossIdentityCases([record('a'), record('b'), record('extra')], ['a', 'b']).passed, false);
});
```

- [x] **Step 3: Run evaluator self-checks and freeze the manifest hash.**

Run:

```powershell
node --test apps/worker/test/blackbox-cross-identity-evaluation.test.mjs
Get-FileHash -Algorithm SHA256 apps/worker/test/fixtures/blackbox-cross-identity/expected-results.json
```

Expected: evaluator self-checks pass without importing production comparison code. Record the exact SHA-256, byte count, case count and author independence statement in `label-review.md`. From this point, expectation edits require a separately documented fixture/contract reason.

- [x] **Step 4: Record Task 1 completion without committing.**

Append the frozen hash, file list and self-check output to the Task 1 report and SDD ledger.

---

## Task 2: Implement deterministic recorded-metadata comparisons

**Files:**

- Create: `apps/worker/src/blackbox-observation/access-types.ts`
- Create: `apps/worker/src/blackbox-observation/access-limits.ts`
- Create: `apps/worker/src/blackbox-observation/access-compare.ts`
- Create: `apps/worker/src/blackbox-observation/access-index.ts`
- Create: `apps/worker/test/blackbox-cross-identity-core.test.mjs`

**Interfaces:**

- Consumes: `ObservationInput`, `ObservationLimits`, `SourceRef`, `SourceManifest`, `ObservedIdentity`, `validateObservation()`, the existing safe-state projection from `associateRaw()`, and `observationLimits()`.
- Produces:

```ts
export type ValueRelation = 'same' | 'different' | 'overlapping-variable' | 'unavailable';
export type EvidenceCompleteness = 'complete' | 'partial' | 'unavailable';
export type ComparisonBasis = 'recorded-route-metadata' | 'exact-saved-target-body';
export type ComparisonEligibility = 'eligible' | 'ineligible';
export type EvidenceStrength =
  | 'recorded-route-metadata'
  | 'exact-saved-target-body-request-only'
  | 'exact-saved-target-body-with-response-evidence';
export type TriageSignal =
  | 'recorded-response-equivalence'
  | 'recorded-response-difference'
  | 'within-identity-variability'
  | 'insufficient-evidence';
export type AccessComparisonUnknown =
  | 'recorded-status-unavailable'
  | 'recorded-fingerprint-unavailable'
  | 'raw-request-not-supplied'
  | 'raw-request-unavailable'
  | 'shared-raw-source'
  | 'raw-response-unavailable'
  | 'captured-body-unavailable'
  | 'content-type-unavailable'
  | 'saved-body-framing-unknown'
  | 'recorded-owner-authenticity-unassessed';

export interface AccessComparisonLimits extends ObservationLimits {
  readonly maxComparisons: number;
  readonly maxSourcesPerComparison: number;
}

export interface AccessIdentityValues {
  readonly identityKey: string;
  readonly state: 'observed' | 'not-observed';
  readonly records: number;
  readonly usableResponses: number;
  readonly unavailableResponses: number;
  readonly associatedRawRequests: number;
  readonly usableRawResponses: number;
  readonly unavailableRawResponses: number;
  readonly statusValues: readonly number[];
  readonly fullResponseFingerprints: readonly string[];
  readonly variable: boolean;
  readonly sources: readonly SourceRef[];
}

export interface AccessComparisonGroup {
  readonly groupId: string;
  readonly routeSignature: string;
  readonly method: string;
  readonly origin: string;
  readonly path: string;
  readonly identityCells: readonly AccessIdentityValues[];
  readonly sources: readonly SourceRef[];
}

export interface RecordedOwnerContext {
  readonly resourceId: string;
  readonly recordedOwnerIdentity: string;
  readonly linkedExchangeIds: readonly string[];
  readonly sources: readonly SourceRef[];
}

export interface AccessComparison {
  readonly comparisonId: string;
  readonly groupId: string;
  readonly identityKeys: readonly [string, string];
  readonly basis: ComparisonBasis;
  readonly evidenceStrength: EvidenceStrength;
  readonly requestClass: string | null;
  readonly eligibility: ComparisonEligibility;
  readonly completeness: EvidenceCompleteness;
  readonly statusRelation: ValueRelation;
  readonly fingerprintRelation: ValueRelation;
  readonly bodyRelation: ValueRelation;
  readonly contentTypeRelation: ValueRelation;
  readonly identityValues: readonly [AccessIdentityValues, AccessIdentityValues];
  readonly signals: readonly TriageSignal[];
  readonly unknowns: readonly AccessComparisonUnknown[];
  readonly recordedOwnerContext: readonly RecordedOwnerContext[];
  readonly sources: readonly SourceRef[];
}

export interface AccessComparisonResult {
  readonly schemaVersion: 1;
  readonly kind: 'offline-blackbox-cross-identity-triage';
  readonly status: 'completed' | 'partial' | 'failed';
  readonly limits: AccessComparisonLimits;
  readonly sources: readonly SourceManifest[];
  readonly scope: {
    readonly basis: 'supplied-saved-records';
    readonly authorization: 'not-assessed';
    readonly sessionValidity: 'not-assessed';
    readonly expectedPolicy: 'unknown';
    readonly semanticEquivalence: 'not-established';
    readonly applicationCoverage: 'unknown';
  };
  readonly counts: {
    readonly groups: number;
    readonly comparisons: number;
    readonly recordedComparisons: number;
    readonly strongComparisons: number;
    readonly insufficientComparisons: number;
  };
  readonly identities: readonly ObservedIdentity[];
  readonly groups: readonly AccessComparisonGroup[];
  readonly comparisons: readonly AccessComparison[];
  readonly diagnostics: readonly ObservationDiagnostic[];
}

export function accessComparisonLimits(overrides?: Partial<AccessComparisonLimits>): AccessComparisonLimits;
export function compareAccessObservation(
  input: ObservationInput,
  overrides?: Partial<AccessComparisonLimits>,
): AccessComparisonResult;
```

Opaque IDs are local ordinals such as `group-0001`, `comparison-000001` and `request-class-0001`. Sort outer groups by `(routeSignature, method, origin, path)` before assigning group IDs. Sort private request classes by `(outer-group order, exact method, target, body)` before assigning globally unique class IDs, then discard their keys. Sort the comparison population by group order, identity-key pair, route basis before strong basis, and request-class order before assigning comparison IDs; expose comparisons in ID order. `identityCells` contains every validated identity bucket so a missing cell remains explicit; comparisons use only observed distinct named/anonymous pairs. Emit exactly one route-level record for each `(outer group, identity pair)` and exactly one strong record for each `(outer group, identity pair, shared request class)`. A pair may therefore have several strong records. Apply the 5,000-record ceiling to the combined route-level and strong population. For route records the three raw count fields cover the whole selected identity cell, including shared occurrences. For strong records they cover only the nonshared evidence selected into that request class. `associatedRawRequests` counts successfully associated usable requests within the record's selection; `usableRawResponses` counts selected usable associated responses; `unavailableRawResponses` is selected record count minus usable raw response count, including omitted/missing/invalid/unassociated evidence on route records. `identityValues` never contains raw body/content-type values. The result has no raw-value or newly computed digest field.

Derive the single analysis `status` independently of evidence completeness. Return `failed` only when input validation, inherited resource limits, the expanded-route limit, comparison/source ceilings, or another fatal comparison condition prevents emission of the complete deterministic population; fatal results expose no partial groups or comparisons. Return `partial` when comparison succeeds but retains one or more recoverable input/raw-association diagnostics. Return `completed` when comparison succeeds with no such diagnostics. Omitted optional raw input, no eligible identity pair, and `partial`/`unavailable` comparison evidence do not by themselves change a successful result from `completed`. Cover all three rows plus recoverable diagnostics, omitted raw input and incomplete evidence in Task 2 tests.

Completeness is `unavailable` when no response dimension for the basis has usable values on both sides, `partial` when at least one dimension supports a relation but any selected record or applicable dimension is unavailable, and `complete` only when every selected record yields every response dimension required by that basis. Signals are deterministic facts: emit `recorded-response-equivalence` when any applicable relation is `same`; emit `recorded-response-difference` when any is `different`; emit `within-identity-variability` when either selected identity value set has more than one value or any relation is `overlapping-variable`; emit `insufficient-evidence` when completeness is not `complete` or any applicable relation is `unavailable`. Sort and deduplicate signals and unknown codes. A strong record has `exact-saved-target-body-with-response-evidence` strength when at least one of its status, fingerprint, body or content-type relations is available on both sides; saved normalized status/fingerprint evidence satisfies this even when the associated raw response is absent or unusable. Otherwise it has request-only strength. Raw-response usability gates only body/content-type relations, never the stronger lead by itself.

For route records, only recorded status/fingerprint are applicable completeness dimensions. `raw-request-not-supplied` and `shared-raw-source` are informational uncertainties and do not downgrade otherwise complete recorded metadata. `variable` is true when any applicable selected per-identity value set has more than one member; Task 3 extends this privately to body/content-type sets. Named/anonymous comparison sources include their identity-declaration sources plus every selected exchange source needed to verify the displayed sets and eligibility.

- [x] **Step 1: Write failing recorded-comparison tests.**

The test names the production breaks it catches. Use literal expected sets and IDs. Cover:

1. Input reorder does not change the prescribed semantic comparison projection, ordering or opaque IDs; positional `SourceRef` pointers may move, but every reordered pointer must still resolve to the corresponding native record.
2. Exact duplicate envelopes collapse through native reconciliation.
3. Outer groups split on route signature, method, origin or exported path.
4. Identity pairs are combinations of distinct named/anonymous buckets; unattributed records are visible in groups but never eligible.
5. `relation(a,b)` implements: equal nonempty sets → `same`; disjoint nonempty sets → `different`; intersecting unequal sets → `overlapping-variable`; either empty → `unavailable`.
6. Status zero and invalid response metadata are excluded from usable status/fingerprint sets.
7. Partial selected evidence does not erase supported usable-subset relations.
8. Same status/different fingerprint emits both exact relation facts and the corresponding equivalence/difference signals; repeated and overlapping observations emit variability without choosing one representative response.
9. Complete, partial and unavailable evidence produce the exact fixed unknown codes above, and every supported relation cites the complete unique source set needed to recompute it.
10. An outer group may exceed 256 aggregate sources when each comparison remains within the bound; any individual comparison exceeding 256 unique required sources and any result exceeding 5,000 combined comparisons fails explicitly with no partial comparison population.
11. Raised, unknown, noninteger, NaN and infinite limits are rejected; smaller positive integers work.
12. Result ordering and opaque IDs are deterministic and raw sentinel text is absent.

Use the wished-for API before production files exist:

```js
import { compareAccessObservation } from '../dist/blackbox-observation/access-index.js';

const result = compareAccessObservation(nativeInput);
assert.equal(result.kind, 'offline-blackbox-cross-identity-triage');
assert.equal(result.comparisons[0].basis, 'recorded-route-metadata');
assert.equal(result.comparisons[0].statusRelation, 'same');
assert.equal(result.scope.authorization, 'not-assessed');
```

- [x] **Step 2: Run the focused test and observe RED.**

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-cross-identity-core.test.mjs
```

Expected initial failure: `access-index.js` cannot be imported because the production comparison API does not exist.

- [x] **Step 3: Implement limit validation, set algebra, grouping and recorded comparisons.**

Use sorted arrays and `Map` aggregation; never build an exchange Cartesian product. Generate ordinals after sorting public route metadata and identity keys. Compare only usable normalized status/fingerprint values. Call the existing raw association boundary to populate safe raw availability/association/response counts and diagnostics, but do not consume or expose request/response values in Task 2. If raw association emits `input-limit`, return the same all-empty failed `resource-limit` result used by observation before grouping or counting; cover this in the pure API test. Track within-identity variability separately from the relation. Reapply `maxRoutes` to the expanded `(routeSignature, method, origin, path)` outer-group count because native validation bounds route signatures only; exceeding this inherited ceiling returns a failed result with fixed `resource-limit`. A missing raw directory does not fail recorded comparison.

Construct and deduplicate each comparison's source set from the exact records used for its identity membership, value sets, relation, eligibility, unknowns and optional owner context. Group-level sources do not count against the per-comparison ceiling. Failure results use fixed diagnostics and empty comparison arrays. If any route-level or strong comparison would exceed its 256-source ceiling, or the combined comparison population would exceed 5,000 records, return a failed result with `comparison-limit` and no partial comparison population.

- [x] **Step 4: Run GREEN and affected observation tests.**

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-cross-identity-core.test.mjs apps/worker/test/blackbox-observation-core.test.mjs apps/worker/test/blackbox-observation-core-review.test.mjs
pnpm exec biome check apps/worker/src/blackbox-observation/access-types.ts apps/worker/src/blackbox-observation/access-limits.ts apps/worker/src/blackbox-observation/access-compare.ts apps/worker/src/blackbox-observation/access-index.ts
```

Expected: all listed tests pass and Biome emits no errors.

- [x] **Step 5: Record Task 2 completion without committing.**

Append RED/GREEN output, changed files and self-review to the Task 2 report and ledger.

---

## Task 3: Add strong raw request classes and bounded response profiles

**Files:**

- Modify: `apps/worker/src/blackbox-observation/raw.ts`
- Modify: `apps/worker/src/blackbox-observation/validate.ts`
- Create: `apps/worker/src/blackbox-observation/access-raw.ts`
- Modify: `apps/worker/src/blackbox-observation/access-compare.ts`
- Modify: `apps/worker/src/blackbox-observation/access-index.ts`
- Create: `apps/worker/test/blackbox-cross-identity-raw.test.mjs`
- Modify: `apps/worker/test/blackbox-cross-identity-core.test.mjs`

**Interfaces:**

- Consumes: Task 2 result types, strict `parseHttpRequest()`/`parseHttpResponse()`, native raw association identity formula and validated resource/exchange indexes.
- Produces this internal-only projection from `raw.ts`; it is not re-exported from a public index:

```ts
export interface AssociatedRawEvidence {
  readonly exchangeId: string;
  readonly occurrenceKey: string;
  readonly sharedOccurrence: boolean;
  readonly request: { readonly method: string; readonly target: string; readonly body: string };
  readonly response: {
    readonly status: number;
    readonly headers: readonly HttpHeader[];
    readonly body: string;
  } | null;
  readonly sources: readonly SourceRef[];
}
```

`AssociatedRawEvidence` may be exported from `raw.ts` for internal module typing, but it is never re-exported from either public barrel or package subpath. `associateRaw()` continues to return the exact existing observed-exchange behavior and diagnostics, plus an internal `evidence` array. `validateObservation()` additionally returns internal `resourceContexts` containing validated `resourceId`, `ownerIdentity`, linked valid exchange IDs and source refs; public `ObservedResource` remains unchanged.

`evidence` contains one entry only for each successfully associated usable saved request. Raw omission returns `evidence: []`; missing, invalid, mismatched and association-unavailable records remain represented only by their existing public raw state/diagnostics. A matched usable request remains in `evidence` when its response is absent, truncated, malformed or conflicting, with `response: null`. Its evidence sources are the exact native exchange sources plus `{ source: 'raw', pointer: '', exchangeId }`.

`resourceContexts` contains only nonconflicted validated resources whose non-null `ownerIdentity` resolves to a validated named identity or the canonical `anonymous` identity, and whose own explicit `evidence` array has at least one `{ kind: 'exchange', id }` reference resolving to a valid nonconflicted exchange. Do not use transitions, object references, paths or content. Conflicted, missing-owner, unattributed/unknown-owner and unlinked resources yield no context. The internal context retains the resource source and valid explicitly linked exchange sources. When attaching context to a comparison, intersect linked IDs with the comparison's selected exchanges, then rebuild its sources from the resource source plus only those intersecting exchange sources; omit the context if the intersection is empty.

- [x] **Step 1: Write failing raw-profile and strong-comparison tests.**

Cover these independent behaviors with native raw fixtures whose exchange IDs use the production association formula:

1. Exact method/target/body equality excluding all headers creates one opaque request class across distinct identities.
2. Different query values or body strings remain route-level only.
3. A shared `historyHash:occurrence` is excluded from strong leads and retains `shared-raw-source` uncertainty.
4. Missing, absent, truncated, malformed, conflicting or mismatched raw responses do not erase a valid strong request comparison; they yield unavailable raw relations and insufficient evidence.
5. Empty parsed body is a valid exact saved-body value.
6. Body comparison rejects any `Transfer-Encoding`, a non-identity or duplicate `Content-Encoding`, and invalid/duplicate/mismatched `Content-Length`.
7. Absent `Content-Length` remains a comparable saved slice with framing completeness unknown.
8. Content type: absent contributes `absent`; one valid value lowercases the media type and drops parameters; duplicate/malformed fields are unusable.
9. Equal, disjoint and overlapping raw status/body/content-type sets use Task 2 algebra and retain partial evidence.
10. A valid resource evidence reference attaches source-linked `recorded-owner-context`; missing/conflicting/unlinked or inferred object-like strings do not.
11. Output contains no raw target/body/header/cookie/sentinel values and no newly computed request/body/content digest.

- [x] **Step 2: Run the new tests and observe RED.**

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-cross-identity-raw.test.mjs apps/worker/test/blackbox-cross-identity-core.test.mjs
```

Expected failure: no strong exact-target/body comparison or raw response profile exists.

- [x] **Step 3: Implement private association evidence and raw profiles.**

Keep raw strings within the pure call/worker process. Construct the internal request-class key directly from parsed method, target and body; use it only as a `Map` key, sort it to assign an opaque local ordinal, and discard it before returning. Do not hash it for output. Mark every member of a duplicated occurrence key as `sharedOccurrence: true` after the association pass.

For a strong record, recorded status/fingerprint sources come from every selected exchange in that request class; body/content-type sources come from every selected associated raw evidence record; recorded-owner sources come from the filtered context defined above. The comparison source set is the sorted unique union of those sources and the identity declaration sources needed to verify bucket membership. Never include sources from another request class merely because it shares the outer group.

For body eligibility, parse the already-associated response and apply the exact framing rules from the spec. `Content-Length` grammar is `/^(?:0|[1-9][0-9]*)$/u`, compared with `Buffer.byteLength(body, 'utf8')`. Normalize one valid `Content-Type` by trimming, taking the substring before `;`, lowercasing it and requiring `^[!#$%&'*+.^_`|~0-9A-Za-z-]+/[!#$%&'*+.^_`|~0-9A-Za-z-]+$`; represent no header as the private value `absent`. The returned result exposes relations only.

Content-type usability is independent of body framing: a parsed response rejected for transfer/content encoding or length can still contribute one valid normalized content type. Within an otherwise eligible request class, remove every `sharedOccurrence` member before constructing the strong record's selected exchanges, response profiles, source union and owner-context intersection. Other nonshared occurrences in the same class may still support a strong comparison. Retain `shared-raw-source` only on the enclosing route-level record and diagnostic.

Retain existing observation diagnostics and results exactly. Strong request eligibility requires two distinct identity buckets, distinct nonshared occurrences and the same private request-class key from successfully associated usable raw requests. It does not require a usable raw response. For every shared request class, filter and aggregate that class's recorded metadata and raw response-profile values independently before producing its strong record. Raw response usability controls only body/content-type relations. Determine stronger-lead evidence strength after all response relations are computed, so usable saved normalized status/fingerprint evidence still qualifies when the raw response profile is unavailable. Generate signals from relation facts; never assign vulnerability severity.

- [x] **Step 4: Run GREEN and existing raw/observation regressions.**

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-cross-identity-core.test.mjs apps/worker/test/blackbox-cross-identity-raw.test.mjs apps/worker/test/blackbox-observation-raw.test.mjs apps/worker/test/blackbox-observation-workflow.test.mjs
pnpm exec biome check apps/worker/src/blackbox-observation/raw.ts apps/worker/src/blackbox-observation/validate.ts apps/worker/src/blackbox-observation/access-raw.ts apps/worker/src/blackbox-observation/access-compare.ts apps/worker/src/blackbox-observation/access-index.ts
```

Expected: all listed tests pass; existing observation result projections remain byte-for-byte stable for their fixtures.

- [x] **Step 5: Record Task 3 completion without committing.**

Append RED/GREEN output, existing-contract comparison and self-review to the Task 3 report and ledger.

---

## Task 4: Add deterministic JSON serialization and readable Markdown

**Files:**

- Create: `apps/worker/src/blackbox-observation/access-render.ts`
- Create: `apps/worker/src/blackbox-observation/access-serialize.ts`
- Modify: `apps/worker/src/blackbox-observation/access-index.ts`
- Create: `apps/worker/test/blackbox-cross-identity-render.test.mjs`

**Interfaces:**

- Consumes: `AccessComparisonResult` from Task 2/3.
- Produces:

```ts
export interface AccessComparisonReport {
  readonly result: AccessComparisonResult;
  readonly json: string;
  readonly markdown: string;
}

export class AccessComparisonOutputError extends Error {}
export function renderAccessComparisonMarkdown(result: AccessComparisonResult): string;
export function serializeAccessComparison(result: AccessComparisonResult): AccessComparisonReport;
```

- [x] **Step 1: Write failing renderer/serializer tests.**

Assert the JSON round-trips to `report.result` with a trailing newline. `result.status` is the bounded local analysis execution status defined in Task 2; do not invent a second historical execution field. The complete Markdown heading vector is exactly `# Offline black-box cross-identity triage`, then `## Input records`, `## Analysis and scope`, `## Summary counts`, `## Identities`, `## Comparison groups`, `## Identity comparisons`, `## Prioritized triage`, `## Unknown reasons`, `## Recorded-owner context`, `## Diagnostics`, `## Source references`. Emit every heading exactly once in that order even when its section is empty, and emit no other Markdown headings. It includes evidence basis, completeness, relations and signals and distinguishes route-level from strong comparisons.

Use hostile route, identity and state metadata containing pipes, backticks, line breaks, controls and bidi isolates. Assert Markdown remains inert and JSON/Markdown do not contain any private sentinel from raw request/response/header/body values. Test each artifact independently against `maxOutputBytes`; invalid or raised limits fail before serialization, while valid tightened limits enforce their smaller artifact ceiling.

- [x] **Step 2: Run the renderer test and observe RED.**

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-cross-identity-render.test.mjs
```

Expected failure: renderer/serializer exports do not exist.

- [x] **Step 3: Implement fixed-prose rendering and bounded serialization.**

Duplicate the observation renderer's private inert inline/source behavior exactly rather than exporting new observation internals: escape backticks, pipes, C0/C1 controls, U+2028–U+202E and U+2066–U+2069 as lower-case `\uXXXX`, then wrap values in spaced inline code. Map the four allowed source kinds only: `traffic` to `traffic_inventory.json`, `blackboard` to `blackbox_blackboard.json`, `findings` to `blackbox_authz_findings.json`, and `raw` with a valid `^ex_[0-9a-f]{24}$` exchange ID to `raw/<exchangeId>.json`. A forged or unknown source kind renders the fixed label `source/<unavailable>`; a missing or invalid raw exchange ID renders `raw/<unavailable>`. Never interpolate an unknown source kind, invalid exchange ID, `undefined`, or other caller text into the filename. Pass the fixed filename and source pointer through the same inert inline escaping and test both fallbacks.

Rebuild a canonical typed projection recursively; do not stringify the caller object directly. Discard undeclared enumerable properties at every depth. Use these exact key orders: root `(schemaVersion, kind, status, limits, sources, scope, counts, identities, groups, comparisons, diagnostics)`; limits `(maxNativeBytes, maxRawBytes, maxTotalBytes, maxDepth, maxNodes, maxExchanges, maxRoutes, maxIdentities, maxTransitions, maxRecords, maxRawFiles, maxOutputBytes, timeoutMs, maxComparisons, maxSourcesPerComparison)`; source manifest `(source, file, availability, sha256, bytes, exchangeId when defined)`; scope `(basis, authorization, sessionValidity, expectedPolicy, semanticEquivalence, applicationCoverage)`; counts `(groups, comparisons, recordedComparisons, strongComparisons, insufficientComparisons)`; identity `(key, kind, name, role, authenticated, sources)`; group `(groupId, routeSignature, method, origin, path, identityCells, sources)`; identity values `(identityKey, state, records, usableResponses, unavailableResponses, associatedRawRequests, usableRawResponses, unavailableRawResponses, statusValues, fullResponseFingerprints, variable, sources)`; comparison `(comparisonId, groupId, identityKeys, basis, evidenceStrength, requestClass, eligibility, completeness, statusRelation, fingerprintRelation, bodyRelation, contentTypeRelation, identityValues, signals, unknowns, recordedOwnerContext, sources)`; owner context `(resourceId, recordedOwnerIdentity, linkedExchangeIds, sources)`; diagnostic `(code, message, sources)`; source reference `(source, pointer, exchangeId when defined)`. Return this canonical projection as `report.result`, so parsing `report.json` deep-equals it. Require the pure result to have already sorted identities by key, groups by group ID, comparisons by comparison ID, source refs by `(source,pointer,exchangeId)`, owner contexts/link IDs lexically, and signals/unknowns lexically. Add exact-byte tests using semantically identical objects with reordered insertion and injected undeclared properties.

Markdown uses the same semantic order except its triage list sorts strong evidence before route metadata, then by comparison ID; this is review ordering, not vulnerability severity. Render recorded native fingerprints only when the result already contains them and label them “full saved-response fingerprint.” Fixed prose must describe only recorded equivalence/difference/variability/insufficient evidence and scope unknowns, without introducing authorization or vulnerability conclusions.

`serializeAccessComparison()` first revalidates the embedded limits through `accessComparisonLimits(result.limits)`; invalid or raised limits throw the fixed invalid-limit error. It then emits two-space JSON with one trailing newline and checks JSON and Markdown independently in that order. Either overflow throws `AccessComparisonOutputError('Comparison output exceeds the enforced limit.')`. No serializer field, exception or fixed prose may reflect private raw data.

- [x] **Step 4: Run GREEN and formatting.**

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-cross-identity-render.test.mjs apps/worker/test/blackbox-cross-identity-core.test.mjs apps/worker/test/blackbox-cross-identity-raw.test.mjs
pnpm exec biome check apps/worker/src/blackbox-observation/access-render.ts apps/worker/src/blackbox-observation/access-serialize.ts apps/worker/src/blackbox-observation/access-index.ts
```

- [x] **Step 5: Record Task 4 completion without committing.**

Append RED/GREEN output and self-review to the Task 4 report and ledger.

---

## Task 5: Add guarded local-file API and source-checkout CLI

**Files:**

- Create: `apps/worker/src/blackbox-observation/access-files.ts`
- Create: `apps/worker/src/blackbox-observation/access-worker.ts`
- Modify: `apps/worker/src/blackbox-observation/files.ts`
- Modify: `apps/worker/src/blackbox-observation/isolate.ts`
- Modify: `apps/worker/src/blackbox-observation/access-index.ts`
- Create: `scripts/blackbox-compare.mjs`
- Create: `apps/worker/test/blackbox-cross-identity-file.test.mjs`
- Create: `scripts/blackbox-compare.test.mjs`

**Interfaces:**

- Consumes: guarded native reads, source manifests, same-read directory checks, fixed worker isolation and exclusive output behavior from the observation module.
- Produces:

```ts
export interface AccessComparisonFileOptions {
  readonly rawDirectory?: string;
  readonly outputDirectory?: string;
  readonly limits?: Partial<AccessComparisonLimits>;
  readonly signal?: AbortSignal;
}

export async function compareAccessDirectory(
  directory: string,
  options?: AccessComparisonFileOptions,
): Promise<AccessComparisonReport>;
```

The CLI contract is:

```text
pnpm --silent blackbox-compare <deliverables-directory> [--raw-dir <directory>] [--output <new-directory>]
```

Exit `0` means completed processing, `1` means partial/failed/setup/output processing, and `2` means invalid usage. There is no finding-count exit gate.

- [x] **Step 1: Write failing file/API and CLI tests.**

Cover: deterministic native reads and hashes; optional raw omission; missing/linked/hardlinked/nonregular inputs; only selected fixed raw filenames; spaces/Unicode paths; dependency-free source help; missing build setup; invalid/duplicate CLI flags; stdout JSON; no stderr data leakage; exit meanings; exclusive `comparison.json`/`comparison.md`; output outside both input roots; no overwrite; input byte preservation; tightened byte/node/depth/raw/count/comparison/output limits; pre-abort/deadline worker reap; no inherited `NODE_OPTIONS` or provider credentials.

The file API test imports `compareAccessDirectory()` before it exists and the CLI test invokes `node scripts/blackbox-compare.mjs --help` before the launcher exists.

- [x] **Step 2: Run the tests and observe RED.**

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-cross-identity-file.test.mjs scripts/blackbox-compare.test.mjs
```

Expected failures: missing file API and launcher.

- [x] **Step 3: Extract one guarded input boundary and implement comparison worker/output.**

Refactor `files.ts` only enough to expose internal guarded input loading, same-read verification and generic exclusive two-file output. `observeDirectory()` and its output names/results remain unchanged. `access-worker.ts` is the only fixed comparison worker entry. `isolate.ts` may share one private spawn helper, but exported runners each select a compile-time worker URL; artifact data never selects executable code.

The comparison guarded reader reuses `selectRawExchangeIds()` because comparison consumes the same reconciled native exchange population. Keep the selector fixed in worker code; neither IPC nor artifact data supplies filenames or a selector. `access-worker.ts` is the only comparison entry, while existing `worker.ts` remains the fixed observation entry.

`compareAccessDirectory()` starts its deadline before normalization. In the parent it applies the existing `localPath()` grammar and both-direction input/output containment checks before spawning. Existence, directory-chain, symlink, hardlink, regular-file, source-hash, same-read and exclusive-output checks remain inside the fixed worker and its deadline; do not precreate the output directory or replace the guarded reader with a generic file read.

The worker includes guarded reads, pure comparison, serialization and writes inside the 60-second deadline; the parent kills and reaps it on timeout/abort and resolves only after process close. The environment remains the existing fixed allowlist and excludes `NODE_OPTIONS` and provider credentials. IPC contains only `AccessComparisonReport` or a fixed bounded failure marker—never parsed documents, raw profiles, private request keys, body/content values or caught input error text. It writes `comparison.json` and `comparison.md` only for nonfailed analysis. Existing destinations are never overwritten or recursively removed; a partially created new owned output remains for inspection under the existing output contract.

Implement CLI parsing without dependencies before dynamic import of built output. Use fixed bounded setup/failure diagnostics and never print caught input error text.

Recognized `--help`/`-h` prints static help before import and exits 0. For invalid usage, setup, processing or output failure when no report exists, stdout is one compact versioned failure JSON object with `kind: 'offline-blackbox-cross-identity-triage'`, `status: 'failed'` and exactly one fixed diagnostic: `invalid_usage` for exit 2, `setup_required`, `output-limit` or `processing_failed` for exit 1. Do not write private processing detail to stderr.

- [x] **Step 4: Run GREEN plus observation file/CLI regressions.**

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-cross-identity-file.test.mjs scripts/blackbox-compare.test.mjs apps/worker/test/blackbox-observation-file.test.mjs apps/worker/test/blackbox-observation-io-review.test.mjs scripts/blackbox-observe.test.mjs
node --check scripts/blackbox-compare.mjs
pnpm exec biome check apps/worker/src/blackbox-observation/access-files.ts apps/worker/src/blackbox-observation/access-worker.ts apps/worker/src/blackbox-observation/files.ts apps/worker/src/blackbox-observation/isolate.ts
```

- [x] **Step 5: Record Task 5 completion without committing.**

Append RED/GREEN output, preservation evidence and self-review to the Task 5 report and ledger.

---

## Task 6: Integrate the evaluator, packages, clean profiles and documentation

**Files:**

- Modify: `apps/worker/test/blackbox-cross-identity-evaluation.test.mjs`
- Modify: `scripts/evaluate-blackbox-cross-identity.mjs`
- Modify: `scripts/test-reporting-install.mjs`
- Modify: `scripts/test-reporting-runtime.mjs`
- Create: `scripts/blackbox-cross-identity-harness.test.mjs`
- Modify: `apps/worker/package.json`
- Modify: `package.json`
- Create: `docs/blackbox-cross-identity-triage.md`
- Modify: `docs/goals/blackbox-cross-identity-triage-acceptance.md`
- Modify: `docs/goals/blackbox-cross-identity-triage.md`
- Modify: `docs/coverage-roadmap.md`
- Create during actual demonstrations: `output/blackbox-cross-identity-2026-09-07/saved-run/comparison.json`
- Create during actual demonstrations: `output/blackbox-cross-identity-2026-09-07/saved-run/comparison.md`
- Create during actual demonstrations: `output/blackbox-cross-identity-2026-09-07/synthetic/comparison.json`
- Create during actual demonstrations: `output/blackbox-cross-identity-2026-09-07/synthetic/comparison.md`
- Create during actual demonstrations: `output/blackbox-cross-identity-2026-09-07/examples.json`
- Create during actual evaluation: `output/blackbox-cross-identity-2026-09-07/evaluation.json`

**Interfaces:**

- Consumes: Tasks 1–5, existing observation/review/reporting clean context harnesses, the available 473-record native run and its raw directory.
- Produces: package scripts `blackbox-compare`, `eval:blackbox-cross-identity`, `test:blackbox-cross-identity:cases`, `test:blackbox-cross-identity`, `test:blackbox-cross-identity:regressions`, `test:blackbox-cross-identity:install`, `test:blackbox-cross-identity:linux`; package subpath `@shannon/worker/blackbox-comparison` → `./dist/blackbox-observation/access-index.js`.

The clean install/runtime flag is `--cross-identity`, mutually exclusive with `--review` and `--observation`. `CROSS_IDENTITY_INPUTS` extends the exact observation allowlist only with this corpus, five comparison tests, comparison launcher/test, evaluator and `scripts/blackbox-cross-identity-harness.test.mjs`. The harness is included in `test:reporting:runner`; the comparison clean profile runs the fixed `test:blackbox-cross-identity:regressions` command.

- [x] **Step 1: Connect the frozen evaluator and observe RED mismatches before changing implementation expectations.**

Import `compareAccessObservation` only in the runner used after evaluator self-checks. Run:

```powershell
pnpm --filter @shannon/worker build
node --test apps/worker/test/blackbox-cross-identity-evaluation.test.mjs
node scripts/evaluate-blackbox-cross-identity.mjs
```

Expected initial RED: any implementation/label mismatch is reported by exact case ID, location and source requirement. Fix implementation defects or document an independent fixture/contract correction; never edit expected values merely to pass.

- [x] **Step 2: Resolve finite evaluator mismatches and run focused integration GREEN.**

Add root scripts and the additive worker export without changing dependency sections. Extend clean input allowlists only with exact comparison source, test, fixture, launcher and evaluator paths. Add a mutually exclusive comparison profile that runs the fixed comparison regression command with network disabled.

`evaluateCrossIdentityCorpus()` returns the exact current manifest SHA-256 and a versioned report. Its CLI supports dependency-free help, dynamically imports the built comparison API only for evaluation, emits deterministic JSON and exits 0 only on full agreement; mismatch/setup/execution failure exits 1 and invalid usage exits 2. Keep evaluator self-check execution independent from that production adapter.

Run:

```powershell
pnpm test:blackbox-cross-identity
pnpm eval:blackbox-cross-identity
pnpm test:blackbox-cross-identity:regressions
pnpm test:reporting:runner
```

Expected: every frozen case matches once; zero unresolved mismatches, execution errors or mutations; worker build, Biome and script syntax pass; affected observation/review/reporting tests pass.

- [x] **Step 3: Run clean Windows and Linux integration.**

The current clean Windows cache-only profile passed after the final Task 5 hardlink fix. The Linux Docker profile also passed while running nonroot with test-container networking disabled, no host mounts, provider credentials, or Temporal. Windows disclosed one POSIX-only skip; Linux disclosed one Windows-only skip.

```powershell
pnpm test:blackbox-cross-identity:install --offline --store-dir .pnpm-store
pnpm test:blackbox-cross-identity:linux
```

Expected: frozen install/build and fixed comparison plus observation/review/reporting regression commands pass in clean explicit contexts. Linux test execution runs nonroot with `network: none`, no host mounts, provider credentials or Temporal. Docker image/base/dependency preparation may use the existing build cache or registry before test execution; do not claim the build itself is network-free. Record any genuine platform/environment skip exactly rather than treating it as a pass.

- [x] **Step 4: Demonstrate actual and synthetic CLI outputs with byte preservation.**

Run the actual launcher against `workspaces/memos-blackbox-luna-r7/.shannon/blackbox-target/.shannon/deliverables` with `workspaces/memos-blackbox-luna-r7/.shannon/blackbox-target/.shannon/blackbox/raw`, then against the clearly synthetic `apps/worker/test/fixtures/blackbox-cross-identity/sets/raw-comparability` with its `raw/` directory. Use new output directories. Hash every selected fixed native file and every selected raw file immediately before and after each invocation, retaining relative filename, byte count and SHA-256; the real set must account for all 473 selected raw records. Parse stdout and confirm it is byte-for-byte equal to saved `comparison.json`; record exit/status, groups, comparison bases, relations, signals, insufficient evidence and diagnostics. Do not require a nonzero lead count. The acceptance record explicitly notes that the earlier observation example omitted raw input while this demonstration supplies the separately located 473-file directory.

Write `examples.json` containing command arguments, synthetic flag, exit/status, counts, before/after input file hashes and output hashes. Write the standalone evaluator report to `evaluation.json`.

- [x] **Step 5: Finish usage and X1–X7 acceptance documentation.**

The usage document and acceptance record include the retained-output audit, Windows/Linux, regression, dependency, lockfile, import, diff, inventory, and final review evidence.

`docs/blackbox-cross-identity-triage.md` documents setup, native/raw input contract, exact grouping/request/body/content-type meanings, relation algebra, signals, uncertainty, limits, APIs, CLI exits, private output and examples. The acceptance record maps each X1–X7 criterion to actual commands and observed results, frozen manifest hash, independent review dispositions, real/synthetic outcomes, input/output hashes, remaining limits and the finite stopping point.

Change goal/roadmap status to complete only after every recorded command passes. Do not claim overall detection accuracy, authorization coverage or product completion percentage.

- [x] **Step 6: Perform independent task and whole-change reviews, then final verification.**

The final comparison suite, affected regressions, reporting runner, clean Windows/Linux profiles, dependency/lock comparison, prohibited integration-import search, scoped diff check, and independent whole-change review all pass.

Review every task diff for spec compliance and code quality. Resolve all Critical/Important findings through the SDD fix loop. The final independent reviewer inspects the full scoped change, prohibited-import search, dependency/lock preservation, output non-disclosure and acceptance evidence.

After review fixes, rerun exactly the commands affected by those fixes, then one final:

```powershell
pnpm test:blackbox-cross-identity
pnpm test:blackbox-cross-identity:regressions
git diff --check -- package.json apps/worker/package.json docs/coverage-roadmap.md
```

Compare dependency sections with `HEAD` and verify `pnpm-lock.yaml` hash remains unchanged. Inspect all new/untracked files explicitly because ordinary `git diff` omits them.

- [x] **Step 7: Record completion without committing.**

Append final tests, review verdict, artifact hashes, X1–X7 status and any rulings to the ledger. Mark the active goal complete only when the acceptance record and current artifacts prove every criterion.
