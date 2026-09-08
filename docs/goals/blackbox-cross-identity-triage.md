# /goal: Deliver passive cross-identity response triage

**Category:** BUILD, with VERIFY acceptance.
**Role:** Engineer responsible for turning saved multi-identity HTTP evidence into traceable access-review leads.
**Scope:** Offline comparison of identities, requests and responses already present in one native black-box artifact set and its explicitly supplied associated raw records. Live requests, replay, vulnerability confirmation and attack execution are excluded.
**Status:** Complete; X1–X7 passed with frozen-corpus agreement, independent module and whole-change reviews, usage documentation, retained real/synthetic demonstrations, output non-disclosure audit, clean Windows/Linux integration, regressions, and final integrity checks.

## Objective

An operator can identify where saved responses agree, differ or cannot be compared across recorded identities, and can prioritize evidence-backed access-review leads without mistaking passive similarity for a verified authorization vulnerability.

## Reusable parameters and current binding

| Parameter | Current binding |
| --- | --- |
| `{repository}` | The checkout containing this specification |
| `{observation_contract}` | The completed `offline-blackbox-observation` schema and guarded native input loader |
| `{native_inputs}` | `traffic_inventory.json`, `blackbox_blackboard.json`, and optional `blackbox_authz_findings.json` in one supplied deliverables directory |
| `{raw_inputs}` | One explicitly supplied directory of existing native `<exchangeId>.json` Burp records |
| `{command}` | `pnpm --silent blackbox-compare <deliverables-directory> [--raw-dir <directory>] [--output <new-directory>]` |
| `{fixtures}` | A finite independently labeled cross-identity comparison corpus under `apps/worker/test/fixtures/` |
| `{usage_document}` | `docs/blackbox-cross-identity-triage.md` |
| `{acceptance_record}` | `docs/goals/blackbox-cross-identity-triage-acceptance.md` |
| `{real_example}` | One available local native artifact set with its associated raw-record directory |

Bind another repository or native contract before reusing this goal. Prior observation acceptance establishes the input boundary and provenance behavior, but it does not establish correctness for the new comparison meanings.

Comparison APIs consume the same native input projection as the observation module, or guarded files that produce it. A caller-supplied serialized observation result is not an authoritative comparison input: that public projection intentionally omits raw request/body and resource-reference details needed here.

## User value and priority

The operator already has a passive identity/route map. This goal turns that map and the saved raw records into a focused differential view: which identity groups recorded the same request target/body, how their response value sets relate, where recorded ownership context exists, and exactly where the evidence is too weak. This is a triage capability. It does not replace Shannon's proof-by-exploitation finding gate.

Priority order is: accurate evidence relationships, useful access-review leads, bounded operation, then presentation. Perfect accuracy and application-wide authorization coverage are not required. Demonstrated misleading classifications or data-preservation failures are blockers; speculative refinements are deferred after the finite criteria pass.

## Required comparison meanings

### Grouping and eligibility

- Form deterministic outer groups using the saved route signature, method, origin and exact exported path. A route signature is shaped metadata and never proves identical requests or resources.
- Within a group, retain each identity's complete recorded status and full-response fingerprint value sets. Repeated and variable observations remain sets; capture counters do not pair identities or create a cross-identity timeline.
- A strong raw comparison requires distinct recorded identity buckets with successfully associated, usable native raw requests. Its request class is exact equality of saved method, target and body while excluding all header values. This establishes only target/body equality; authentication headers, cookies, session state, principals and request intent remain unassessed.
- Distinct exchanges that resolve to the same saved raw history occurrence do not provide independent cross-identity evidence. Retain the shared-occurrence diagnostic and exclude that occurrence from strong access leads.
- Named and anonymous identities can participate as distinct recorded buckets. Unattributed identities, association conflicts and missing identity evidence remain visible but cannot produce a cross-identity access lead.

### Response relationships

- Report status-set relations as `same`, `different`, `overlapping-variable` or `unavailable`. For two usable nonempty value sets, `same` means set equality, `different` means an empty intersection, and `overlapping-variable` means a nonempty intersection with unequal sets; `unavailable` means either identity has no usable value.
- Apply the same exact set algebra to saved full-response fingerprints and, within strong raw request classes, exact captured-body text. Recorded fingerprint sets include only usable normalized responses. Fingerprints cover recorded headers and body; unequal fingerprints do not establish different returned data.
- Report evidence completeness separately as `complete`, `partial` or `unavailable`. A relation may describe the usable subset while `partial` retains any unavailable selected records; it cannot be presented as complete population evidence.
- For strongly comparable raw request classes, also report normalized content-type relation without outputting the values. A response with no `Content-Type` contributes the explicit `absent` value. Exactly one syntactically valid header contributes its lower-case media type with optional whitespace removed and parameters excluded. Duplicate or malformed `Content-Type` headers are unusable for this relation and make the selected evidence partial/unavailable. Apply the same set algebra after normalization.
- Exact captured-body equality compares only the string returned as `body` by the repository's strict saved HTTP parser: all saved characters after the first valid header/body separator. Empty is a valid value. The supported body-comparison profile requires no `Transfer-Encoding`, no `Content-Encoding` other than one case-insensitive `identity` value, and—when present—one canonical nonnegative `Content-Length` equal to the UTF-8 byte length of the saved body slice. Duplicate, malformed or mismatched framing/encoding fields make the body relation unavailable. Absence of `Content-Length` remains comparable but message framing/completeness stays explicitly unknown. No transfer/content decoding or character-set interpretation occurs.
- Exact captured-body equality is therefore a bounded saved-string representation observation, not proof of a complete entity body, semantic equivalence, successful access or authorization.
- Missing, absent, truncated, malformed, conflicting or mismatched raw responses cannot establish raw response equality or denial. Status zero is unavailable metadata, not a network-failure diagnosis.
- Separate execution status (`completed`, `partial`, `failed`) from each comparison's eligibility and uncertainty. Optional raw omission permits recorded-metadata comparison but cannot produce a strong raw-request-equivalence lead.

### Access-review leads

- Emit a traceable triage signal only from an eligible cross-identity comparison. Signal types distinguish recorded response equivalence, response difference, within-identity variability and insufficient evidence.
- A stronger access-review lead requires exact raw target/body equality across identities plus usable response evidence. Its evidence-strength label describes the saved comparison basis, not exploitability or severity.
- When a validated saved resource has an explicit recorded owner and source references connect it to compared exchanges, attach that fact as `recorded-owner-context`. Do not infer ownership from object-like strings, paths, response bodies or identity names. Recorded ownership is not independently proven.
- Never promote a signal into a historical hypothesis, candidate proof, verified finding, report finding, planner task or attack/replay input. Existing finding acceptance and execution behavior remain unchanged.

## Success criteria — verify all before returning

| ID | Independently checkable pass/fail condition |
| --- | --- |
| X1 — Stable comparison population | Reordered inputs and exact duplicates produce the same outer groups, identity membership, value sets and counts. Method/origin/path or raw target/body differences do not become equivalent-request comparisons. Missing identity cells remain distinct from unavailable responses. |
| X2 — Accurate evidence relations | Independently labeled status, fingerprint, body and content-type relations match for ordinary, repeated and variable observations. Every relation states its basis and cites all source records needed to verify it. |
| X3 — Strong raw comparability | Only successfully associated usable raw requests with exact method/target/body equality produce strong cross-identity comparisons. Headers are excluded from request equality without implying equal sessions; no request values, raw headers, bodies or newly computed request/body/content digests appear in output. |
| X4 — Honest access triage | Signals distinguish recorded equivalence, recorded difference, variability and insufficient evidence. Anonymous, named and unattributed identities remain distinct. Optional recorded-owner context is source-linked and never becomes an authorization, session-validity, vulnerability or causality conclusion. |
| X5 — Bounded usable product | Typed pure/local-file APIs, source-checkout CLI, deterministic versioned JSON and readable Markdown work with spaces/Unicode paths. Existing observation inputs, deadlines, exclusive output behavior and byte preservation remain enforced; comparison-specific ceilings fail explicitly. |
| X6 — Finite independent verification | The named scenario matrix is labeled and frozen before implementation output is read. Required results agree with zero unresolved expectation mismatches. Focused build/format/syntax, affected observation/review/reporting regressions, clean Windows/Linux integration and independent module review pass with platform skips disclosed. |
| X7 — Concrete completion | The actual CLI is demonstrated on `{real_example}` with raw records and on a clearly synthetic multi-identity example. Input hashes, result counts, unknowns and limitations are recorded in `{acceptance_record}`; usage is documented, the final diff is inspected, and the batch stops. |

The finite scenario matrix covers: equal/disjoint/overlapping sets; empty and partially unavailable sets; `2xx` versus denial status; same status with different full-response fingerprints; repeated observations with overlap and variability; exact raw target/body equality; same route with different query/body values; identical captured bodies despite changing headers; different bodies without semantic inference; absent/parameterized/duplicate/malformed content types; public/static-looking responses without inferred policy; named/anonymous/unattributed identities; explicit recorded-owner context; missing identity cells; status zero; absent/truncated/malformed/conflicting raw evidence; association mismatch; shared raw occurrence; route-signature collision; duplicate/reordered inputs; incomplete saved runs; empty or absent findings; inert private metadata; comparison/output limits; cancellation and source preservation. Several scenarios may share one fixture; the frozen manifest contains at most 30 cases.

## Constraints

- **MUST NOT:** make live target, model, Burp or browser requests; authenticate, crawl, replay, mutate requests, reproduce vulnerabilities, generate attack plans or execute project code found in inputs.
- **MUST NOT:** label any passive relation as allowed, denied, bypassed, vulnerable, safe, verified or exploitable. Do not fabricate principals, role hierarchy, expected policy, resource ownership, chronology, causality, sources, credentials or missing evidence.
- **MUST NOT:** expose raw requests/responses, header or cookie values, body excerpts, query/body values, newly computed request/body/content digests, private failure text or saved freeform instructions. Existing validated native `responseFingerprint` values may remain in the recorded-metadata view; they are labeled as full saved-response fingerprints. Route paths, identity names and recorded state labels remain private allowlisted metadata and must be rendered inertly.
- **MUST NOT:** feed output into the planner, scheduler, attack compiler, action worker, replay service, verifier or finding acceptance. Do not alter existing observation schema behavior, native artifacts, authentication/permissions or existing public contracts.
- **MUST NOT:** commit, push, deploy, publish, contact third parties, overwrite user files, modify dependency sections or lockfiles, or discard unrelated working-tree changes.
- **MUST:** preserve explicit unknowns and distinguish recorded facts from raw-derived relations, data consistency from authenticity, equality from semantic equivalence, and triage priority from vulnerability severity.
- **MUST:** proceed autonomously through routine reversible implementation, independent review corrections and verification. Ask only when a consequential unresolved choice changes public behavior, security, data or cost.
- **LIMIT:** one native artifact set and at most one explicitly supplied raw directory per invocation. Reuse the observation ceilings of 16 MiB per native file, 1 MiB per raw file, 64 MiB aggregate input, 512 raw files, 10,000 exchanges, 2,000 route groups, 16 recorded identities, JSON depth 64, 500,000 nodes, 50,000 collection records, 16 MiB per output and 60 seconds total processing.
- **LIMIT:** at most 5,000 emitted cross-identity comparison records and 256 source references per comparison. Exceeding either bound is explicit; an affected comparison cannot silently emit a partial relation or access lead. Public overrides only tighten ceilings.
- **LIMIT:** native saved HTTP text only. No HAR/XML adapters, decompression, transfer/content decoding, DOM/JSON semantic similarity, secret discovery, cross-run comparison, policy configuration language, UI redesign or universal accuracy measurement in this batch.
- **LIMIT:** finish when X1–X7 pass. Do not expand fixtures to chase counts, add generic HTTP-header rules, repair historical evidence or begin another reliability/benchmark project without a new selected goal.

## Output specification

- An additive side-effect-free module with typed pure and guarded local-file APIs plus `{command}`. Exact API names are documented before integration; the existing `blackbox-observe` command and result schema remain compatible.
- Versioned deterministic JSON with: analysis status and scope; input manifests and enforced limits; summary counts; outer comparison groups; identity value sets; comparison eligibility; request-comparison basis; status/fingerprint/body/content-type relations; traceable signals; optional recorded-owner context; unknown reasons; diagnostics and source references.
- Optional exclusive output directory containing `comparison.json` and `comparison.md`. Markdown provides a compact identity comparison table and prioritized triage list while preserving the JSON meanings.
- A finite synthetic fixture corpus, frozen expected manifest, evaluator and focused integration commands. Evaluation reports supported comparisons, unknown outcomes, expected failed analyses, execution errors and input mutation separately.
- `{usage_document}`, a retained real saved-run output, a clearly synthetic example, and `{acceptance_record}` mapping X1–X7 to actual commands, outcomes, hashes, review dispositions and remaining limitations.

## Independent verification method

An independent checker can read the native schema, this contract, frozen labels, deterministic outputs and X1–X7 evidence map. For every emitted relation, the checker can locate the referenced records and recompute equality/set membership without replaying traffic or interpreting raw content semantically. The checker confirms raw values and newly computed request/body/content digests do not appear in JSON, Markdown, stdout or diagnostics; existing native full-response fingerprints remain separately labeled.

Run the finite evaluator, focused module tests, worker build and affected existing regressions. Use clean Windows and Linux contexts with fixed source allowlists, no provider credentials and no network during execution. Demonstration commands hash each selected input before and after analysis. Any expectation correction requires an independent fixture/contract reason and remains visible in the acceptance record.

## Failure modes and examples

| Failure mode | Required prevention |
| --- | --- |
| Same route becomes same request/resource | Require exact outer metadata and separately label exact raw method/target/body equality; retain other cases as route-level only |
| Equal `2xx` or body becomes an authorization bypass | Emit a recorded equivalence signal with authorization and session validity unknown |
| Different fingerprints become different data | Separate full-message fingerprint and captured-body relations; never infer semantics from either |
| Dynamic/repeated responses are reduced to one arbitrary pair | Compare per-identity value sets and retain overlap/within-identity variability |
| Missing response becomes a denial | Use explicit unavailable/insufficient evidence states |
| Identity names or object-looking values invent ownership | Attach only explicitly recorded, source-linked owner context and label it recorded |
| Raw evidence leaks credentials or application data | Output fixed relation classes and references only; prohibit values, excerpts and reusable body digests |
| Passive output changes live attack behavior | Keep the module additive and disconnected from planner/replay/verifier/finding paths |
| Pairwise growth exhausts resources or silently drops evidence | Enforce comparison/reference/output ceilings and return explicit bounded diagnostics |
| The round becomes open-ended evaluation work | Freeze a finite matrix and stop after X1–X7 pass |

**Good:** Two recorded identities have associated raw requests with identical method, target and body, excluding headers. Their usable responses have the same status and exact captured body. The output records strong target/body comparability and response equivalence with both source sets; authorization, sessions and exploitability remain unknown.

**Good:** Two identities share a route signature and exported path, but their raw query targets differ. Their route-level status sets remain visible, while equivalent-request eligibility is false and no strong access lead is emitted.

**Good:** One identity has usable responses and another has only truncated responses. The comparison reports insufficient evidence for the second identity instead of calling it denied or choosing a representative response.

**Bad:** “Anonymous received HTTP 200 with a matching body, therefore authentication is bypassed.” Passive saved evidence does not establish the active principal, intended policy, current state or exploitability.

## Stopping rule and pre-flight

Complete this goal only when X1–X7 pass with observed evidence and the product delivers both recorded-set comparison and strong raw target/body comparison. Record nonblocking limitations and stop. A goal document, passing unit tests alone or a nonempty candidate count does not establish completion.

Pre-flight must confirm: observable outcome; BUILD/VERIFY category; reusable bindings; exact output contract; all pass/fail criteria; explicit MUST/MUST NOT/LIMIT constraints; no fabricated or leaked evidence; independent second-agent verification; concrete failure examples; a finite scenario matrix; and a stopping point aligned with practical rather than perfect accuracy.

Independent pre-flight passed after resolving initial ambiguity in multivalue set algebra, evidence completeness, shared raw occurrences, content-type normalization and saved-body framing/encoding. The goal meets all four safety vetoes and all 17 applicable non-safety checks. An independent corpus reviewer confirmed the corrected relations can be labeled without reading implementation output.
