# Offline black-box cross-identity triage

`blackbox-compare` compares identities and saved HTTP responses from one native black-box artifact set. It is an offline triage tool: it reads existing records, reports exact relationships and preserves uncertainty. It does not send requests, replay traffic, authenticate, run instructions from an artifact or change Shannon's finding and attack pipelines.

Passive evidence cannot establish authorization, expected policy, session validity, the active principal, ownership authenticity, causality, exploitability, application coverage or semantic equivalence. A matching `2xx`, fingerprint or captured body is a review lead, not proof that access was permitted or bypassed.

## Setup

Use Node.js 22 or newer and pnpm 10.33.0. From the repository root:

```console
pnpm install --frozen-lockfile
pnpm --filter @shannon/worker build
pnpm --silent blackbox-compare --help
```

Help is static and works before dependencies are installed or the worker is built. Analysis requires the built worker.

## Saved input contract

Pass one deliverables directory containing these fixed native basenames:

- `traffic_inventory.json` — required native traffic inventory.
- `blackbox_blackboard.json` — required schema-version-1 blackboard export.
- `blackbox_authz_findings.json` — optional native findings export.

The comparator validates the native documents together. It derives identity declarations, exchanges, route metadata and explicitly recorded resource ownership from those documents. A serialized `offline-blackbox-observation` result is not a substitute: that public projection intentionally omits raw request/body and resource-reference details needed for comparison.

An optional raw directory supplies existing native Burp history records. For each validated, nonconflicting exchange ID selected from the native documents, the guarded loader looks only for `<exchangeId>.json`, where the ID matches `ex_` followed by 24 lowercase hexadecimal characters. Unselected files are ignored. Each available record must contain exactly:

```ts
{
  request: string;
  response: string;
  notes: string;
  occurrence: number; // positive safe integer
}
```

The exchange ID, recorded identity, capture sequence, task provenance and saved request/response bytes must pass the native association check. The native ID is `ex_` plus the first 24 hexadecimal characters of `sha256(taskId + NUL + identity + NUL + captureSequence + NUL + sha256(request + NUL + response))`. Missing, malformed, mismatched, conflicting or truncated evidence is retained through fixed diagnostics or unknown states. Supplying no raw directory is valid and still produces recorded-metadata comparisons; it cannot produce an exact-saved-target-body comparison.

The guarded file API accepts regular, singly linked files under real directories. It rejects symbolic links, hard-linked selected files, nonregular files, unsafe path forms and input changes during the read. It hashes and rechecks selected bytes without modifying them.

## Comparison model

### Groups and identity cells

An outer group is the exact tuple:

```text
(routeSignature, method, origin, exported path)
```

All four fields must match. A route signature is shaped metadata; it does not prove that requests or resources are identical. Query values are not part of the exported path and are evaluated only when usable raw requests form an exact request class.

Every group contains one cell for every validated identity, including named, anonymous and unattributed identities. A cell records:

- `state`: `observed` or `not-observed`;
- record, usable-response and unavailable-response counts;
- associated-raw-request, usable-raw-response and unavailable-raw-response counts;
- the sorted unique status and existing full saved-response fingerprint sets;
- whether those recorded sets vary; and
- source references.

`not-observed` means the identity has no exchange in that group. It is distinct from an observed identity whose responses are unavailable. Unattributed cells remain visible but do not participate in cross-identity comparisons or access-review leads.

### Evidence bases

The output uses two bases:

| Basis | Population | Meaning |
| --- | --- | --- |
| `recorded-route-metadata` | Each pair of distinct observed named or anonymous identity buckets in an outer group | Compares usable native status and existing full saved-response fingerprint sets for the whole group. Body and content-type relations are unavailable. It does not establish equal requests. |
| `exact-saved-target-body` | Distinct named or anonymous identities with associated usable raw requests in the same outer group and private request class | Requires exact saved request method, target and body equality. All header values, including authorization and cookies, are excluded. Response relations are scoped to members of that request class. |

The target includes the saved query string, so different query values do not enter the same exact request class. The private method/target/body tuple is discarded at the public boundary; the result exposes only an ordinal such as `request-class-0001`. Distinct exchanges that resolve to the same saved raw history occurrence are diagnosed and excluded from strong comparisons because they are not independent cross-identity evidence.

`evidenceStrength` describes only the saved basis:

- `recorded-route-metadata`;
- `exact-saved-target-body-request-only` when the exact request class has no usable response relation; or
- `exact-saved-target-body-with-response-evidence` when at least one response relation is usable.

It is not a severity, confidence in policy, vulnerability classification or assertion that the sessions were equivalent.

The `eligibility` field means only that the emitted identity pair met the named comparison basis. It says nothing about authorization or expected access.

### Relation algebra and completeness

Status, full-response fingerprint, captured-body and normalized content-type dimensions use the same set algebra. For sorted unique value sets `A` and `B`:

| Relation | Exact rule |
| --- | --- |
| `same` | Both sets are nonempty and `A = B`. |
| `different` | Both sets are nonempty and `A ∩ B` is empty. |
| `overlapping-variable` | The intersection is nonempty and the sets are unequal. |
| `unavailable` | Either side has no usable value. |

Repeated observations remain sets. Capture counters do not pair records between identities or establish a shared timeline. Existing `responseFingerprint` values describe the full saved response representation, including its headers and body; unequal fingerprints do not prove that the returned application data differs.

A recorded status of zero is unavailable metadata. It is not a diagnosis of a network failure or access denial.

`completeness` is separate from a relation. `complete` means all dimensions required by that basis are usable and no selected unavailable records weaken them. `partial` preserves relations over the usable subset while recording unavailable or unframed evidence. `unavailable` means none of the basis's response dimensions can be compared.

For an exact request class, captured-body equality compares the literal string returned by the strict saved HTTP parser after the first valid header/body separator. Empty is a valid body. A body is comparable only when:

- `Transfer-Encoding` is absent;
- `Content-Encoding` is absent or has one case-insensitive `identity` value; and
- `Content-Length` is absent, or has one canonical nonnegative decimal value equal to the UTF-8 byte length of the saved body string.

Absent `Content-Length` remains comparable but adds `saved-body-framing-unknown`. Duplicate, malformed or mismatched framing and encoding fields make the body unavailable. The tool performs no transfer decoding, content decoding, decompression, character-set interpretation, JSON/DOM comparison or semantic normalization.

For content type, no header contributes the explicit value `absent`. Exactly one syntactically valid header contributes its lowercase media type after surrounding whitespace and parameters are removed. Duplicate or malformed headers make that dimension unavailable. The normalized values themselves are not emitted.

### Signals, unknowns and recorded owners

A comparison may emit more than one triage signal:

- `recorded-response-equivalence` — at least one usable dimension is `same`;
- `recorded-response-difference` — at least one usable dimension is `different`;
- `within-identity-variability` — one side has multiple values or the relation overlaps without set equality;
- `insufficient-evidence` — completeness is not complete or a required relation is unavailable.

These signals prioritize manual access review. They do not say `allowed`, `denied`, `safe`, `vulnerable`, `verified` or `exploitable`.

Comparison-specific `unknowns` explain the evidence boundary:

| Unknown | Meaning |
| --- | --- |
| `recorded-status-unavailable` | At least one identity has no usable recorded status value. |
| `recorded-fingerprint-unavailable` | At least one identity has no usable existing response fingerprint. |
| `raw-request-not-supplied` | The invocation omitted a raw directory. |
| `raw-request-unavailable` | Selected raw request evidence is missing, invalid, unassociated or otherwise unusable. |
| `shared-raw-source` | Distinct exchanges reference the same saved history occurrence. |
| `raw-response-unavailable` | An associated request lacks a usable matching raw response. |
| `captured-body-unavailable` | Strict body comparison is unavailable. |
| `content-type-unavailable` | Strict content-type normalization is unavailable. |
| `saved-body-framing-unknown` | A comparable saved body had no `Content-Length`; saved framing completeness is unknown. |
| `recorded-owner-authenticity-unassessed` | Explicit source-linked owner metadata was attached but not independently authenticated. |

`recordedOwnerContext` appears only when a validated native resource explicitly records an owner and source references link that resource to a compared exchange. It includes the recorded resource ID, owner identity, linked exchange IDs and source references. The comparator never infers ownership from a path, object-like value, response body or identity name.

## APIs

The package subpath is `@shannon/worker/blackbox-comparison`:

```ts
import {
  accessComparisonLimits,
  compareAccessDirectory,
  compareAccessObservation,
  renderAccessComparisonMarkdown,
  serializeAccessComparison,
} from '@shannon/worker/blackbox-comparison';
```

`compareAccessObservation(input, limits?)` is the pure API. `input` is an `ObservationInput` containing parsed native documents plus, when requested, explicitly supplied `RawRecordInput` entries. It validates and compares values without I/O or replay. Callers that read untrusted files must use the guarded directory API instead.

```ts
function accessComparisonLimits(overrides?: Partial<AccessComparisonLimits>): AccessComparisonLimits;
function compareAccessObservation(
  input: ObservationInput,
  overrides?: Partial<AccessComparisonLimits>,
): AccessComparisonResult;
function compareAccessDirectory(
  directory: string,
  options?: AccessComparisonFileOptions,
): Promise<AccessComparisonReport>;
function serializeAccessComparison(result: AccessComparisonResult): AccessComparisonReport;
function renderAccessComparisonMarkdown(result: AccessComparisonResult): string;
```

`compareAccessDirectory(directory, options?)` is the guarded local-file API:

```ts
const report = await compareAccessDirectory(deliverablesDirectory, {
  rawDirectory,
  outputDirectory,
  limits: { maxComparisons: 1_000 },
  signal: abortController.signal,
});
```

It runs reads, validation, comparison and serialization in a fixed reaped worker with a restricted environment. It returns `AccessComparisonReport` with `result`, `json` and `markdown`. An abort or deadline produces a failed timeout report. Invalid or raised limit overrides throw `Invalid access comparison limits.`; overrides may only lower positive integer ceilings. Independent JSON or Markdown overflow throws `AccessComparisonOutputError`.

`serializeAccessComparison(result)` revalidates embedded limits, projects the public fields, emits canonical JSON and Markdown and enforces each output ceiling. `renderAccessComparisonMarkdown(result)` renders the fixed Markdown projection. `accessComparisonLimits(overrides?)` returns validated effective limits.

## CLI and output behavior

```text
pnpm --silent blackbox-compare <deliverables-directory> [--raw-dir <directory>] [--output <new-directory>]
```

Quote paths containing spaces or Unicode. Options may appear after the single deliverables directory and each may appear once. `--help` and `-h` are valid only by themselves.

Without `--output`, stdout is the deterministic versioned JSON report. With `--output`, the command creates the new leaf directory and writes `comparison.json` and `comparison.md`; stdout is byte-for-byte identical to `comparison.json`. The output parent must already be a real directory. The destination must not exist and cannot contain, equal or be contained by either input directory. Existing destinations are never overwritten. A failed analysis creates no output directory; a write failure can leave its newly created partial directory for inspection.

Exit codes are:

- `0`: analysis status `completed`;
- `1`: `partial` or `failed` analysis, setup failure, processing failure or output failure;
- `2`: invalid CLI usage.

Invalid usage, missing build output and failures without a report emit one compact versioned failure object with a fixed diagnostic. Processing details and private input text are not written to stderr. `completed` means no diagnostics were emitted; `partial` means comparisons may be usable but at least one diagnostic remains; fatal validation, resource or comparison-limit conditions produce `failed`. Inspect `diagnostics`, `unknowns` and `completeness` before using any signal.

The result has `schemaVersion: 1`, kind `offline-blackbox-cross-identity-triage`, analysis status and scope, effective limits, selected input manifests, summary counts, identities, groups, comparisons and diagnostics. Ordering, generated group/comparison/request-class ordinals, arrays, two-space JSON and its single trailing newline are deterministic for the same validated inputs. Markdown preserves the same meanings in compact tables and triage lists and escapes private metadata so it remains inert.

Both formats are private analysis artifacts. They include route signatures, methods, origins, exported paths, recorded identity names/roles/authenticated flags, existing full-response fingerprints, source pointers and whole-file SHA-256 manifests. They exclude raw requests and responses, header and cookie values, query/body values, body excerpts, raw notes, environment/provider credentials and newly computed request, body or content digests. Do not treat either format as sanitized for sharing.

## Validate one comparison with fresh requests

An opt-in black-box run can validate one eligible comparison against the current target. First create a self-contained bundle from the guarded native and raw evidence. The output directory must not exist or overlap either source directory:

```console
pnpm --silent blackbox-validation-bundle "<deliverables-directory>" --raw-dir "<raw-directory>" --comparison comparison-000001 --output "<new-bundle-directory>"
```

Bundle creation recomputes the completed comparison, copies the exact selected source corpus, writes a digest-bound selector, and reloads the copied bundle before succeeding. A selectable comparison must be a same-role, named, authenticated pair on an exact saved GET target/body class, with complete usable response evidence and one recorded owner linked to the victim evidence.

Run the existing black-box engine with the same target origin and config identity names/roles:

```console
./shannon start --blackbox -u https://example.com -c ./blackbox-config.yaml --validation-bundle "<new-bundle-directory>"
```

The CLI mounts the bundle only into a short-lived, read-only, network-disabled preprocessor. It writes one normalized selector into the target workspace and mounts no historical raw evidence in the assessment worker. An out-of-band digest binds that file to the host-validated selector. The worker checks, consumes, and deletes it before connecting to Temporal; captures only the selected victim and attacker; and schedules at most one deterministic identity-swapped GET replay from fresh route evidence. Dynamic resource paths are allowed only under the selector's bounded path prefix and with its route signature. Current 2xx and 4xx attacker controls are usable; redirects and server errors are rejected as controls.

Browser agents receive only direct `playwright-cli` shell access. The worker blocks shell composition, other executables, model-supplied `run-code` and `eval`, local or executable URL schemes, and references to authoritative `.shannon/blackbox` state. The orchestration code saves and reads raw traffic and browser state outside the model tool boundary.

The ordinary replay verifier and finding gate remain authoritative. A fresh unauthorized proof may become a finding only after independent fresh-state verification. A fresh denial closes the selected hypothesis with no finding. Missing current route evidence, delivery uncertainty, blocked verification, selector drift, or target/identity/role mismatch makes the run incomplete rather than reporting clean coverage. This mode validates one selected lead; it does not assess unselected routes.

The exported blackboard and evidence Markdown record the raw-free selector provenance: comparison and source-manifest hashes, selector digest, route, identity pair, and recorded role. To resume a selected validation, provide the same bundle again; the persisted run scope rejects a missing or different selector digest.

## Enforced limits

| Resource | Default maximum |
| --- | ---: |
| Each native file | 16 MiB |
| Each selected raw file | 1 MiB |
| Aggregate selected input | 64 MiB |
| Selected raw files | 512 |
| JSON depth / nodes | 64 / 500,000 |
| Exchanges / outer groups / identities | 10,000 / 2,000 / 16 |
| Transitions / collection records | 5,000 / 50,000 |
| Emitted comparisons | 5,000 |
| Source references per comparison | 256 |
| Each JSON or Markdown output | 16 MiB |
| Total processing time | 60 seconds |

Limit violations fail explicitly; the comparator does not truncate a relation or silently drop a lead. The file and CLI forms accept one native artifact set and at most one raw directory per invocation.

## Repository examples

The saved-run example uses the fixed native deliverables and the separately stored raw records. Ensure `output/blackbox-cross-identity-2026-09-07` exists and each output leaf below does not:

```console
pnpm --silent blackbox-compare "workspaces/memos-blackbox-luna-r7/.shannon/blackbox-target/.shannon/deliverables" --raw-dir "workspaces/memos-blackbox-luna-r7/.shannon/blackbox-target/.shannon/blackbox/raw" --output "output/blackbox-cross-identity-2026-09-07/saved-run"
```

The finite synthetic raw-comparability example uses `.invalid` origins and contains no live target:

```console
pnpm --silent blackbox-compare "apps/worker/test/fixtures/blackbox-cross-identity/sets/raw-comparability" --raw-dir "apps/worker/test/fixtures/blackbox-cross-identity/sets/raw-comparability/raw" --output "output/blackbox-cross-identity-2026-09-07/synthetic"
```

Review `status` and `diagnostics` first, then `counts`, exact-basis comparisons, `signals`, `unknowns`, `completeness` and source references. A zero strong-comparison or lead count is a valid result; do not weaken the evidence gate to obtain a nonzero count.
