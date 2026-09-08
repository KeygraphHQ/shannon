# Saved black-box observations

`blackbox-observe` interprets one existing native black-box artifact set. It shows recorded route activity by identity, per-identity exchange sequences and declared workflow links, and evidence-backed explanations of empty or incomplete results.

```powershell
pnpm install --frozen-lockfile
pnpm --filter @shannon/worker build
pnpm --silent blackbox-observe "path/to/deliverables"
pnpm --silent blackbox-observe "path/to/deliverables" --raw-dir "path/to/saved-native-records" --output "path/to/new-observation"
```

Node.js 22+ and the repository's pinned pnpm 10.33.0 are required. `node scripts/blackbox-observe.mjs --help` works from a source-only checkout without dependencies or compiled output. All processing is local saved-data analysis. The command does not start the assessment engine, connect to a target, or interpret saved text as instructions.

## Input contract

Supply one deliverables directory containing these fixed filenames:

| File | Meaning |
| --- | --- |
| `traffic_inventory.json` | Required native exported array of normalized exchanges |
| `blackbox_blackboard.json` | Required native exported blackboard, `schemaVersion: 1` |
| `blackbox_authz_findings.json` | Optional native findings array; only a valid array of supported records establishes a count |

Overlapping exchanges are reconciled by ID. Exact duplicate observations do not inflate request counts. Conflicting copies are diagnosed and isolated while independent usable observations remain visible. Invalid required envelopes fail; recoverable record/reference problems produce partial analysis. Missing or invalid findings are unavailable, never a known count of zero.

This accepts the native JSON projection, not internal `BlackboxSnapshot` state. Exported identities omit private state, exported exchanges omit raw pointers, and projected verification flags do not prove session freshness. Historical Markdown reports need not satisfy the existing report checker to use this separate JSON observation contract. Existing checker behavior is unchanged.

Optional `--raw-dir` selects only `<exchangeId>.json` files for validated, nonconflicting native `ex_` IDs with 24 lowercase hexadecimal characters. Each saved native record contains `request`, `response`, `notes` strings and an `occurrence` number. Association is checked against the native exchange hash, recorded identity, task and capture counter before response evidence is used. Files and directories referenced inside JSON or HTTP text are never opened. No recursive discovery occurs.

Omitting raw records is supported. If supplied, the raw directory must exist and be a real directory. Missing individual associated files remain explicit missing evidence and do not alone prevent completed interpretation. Malformed or inconsistent supplied files produce partial/failed processing as appropriate. More selected exchange IDs than the raw-file ceiling fails explicitly; the loader does not silently select a subset.

## Reading the result

The JSON has `schemaVersion: 1`, `kind: offline-blackbox-observation`, an analysis `status`, enforced `limits`, source availability/hashes, and these evidence views:

- `identities`, `exchanges`, `routes`: recorded route signatures and source metadata, identity cells, deduplicated request counts, normalized response metadata, and raw response availability/association.
- `workflows`: separate identity sequences, ties, internal counter gaps, unknown ordering, and recorded transitions with trigger/resource references and linkage states.
- `recorded`: saved run/termination facts, finding count availability, and distinct hypotheses, candidates, verifications and task categories.
- `reasons` and `diagnostics`: fixed explanatory prose with reason codes and source references. `scope` keeps authorization, session validity, application coverage and causality explicitly unassessed/unknown.

Each source reference identifies the native source and a JSON Pointer. Raw references also identify the selected exchange filename. File manifests provide SHA-256 and byte counts from the guarded read that supplied a successfully parsed document. Missing/invalid files do not receive invented hashes. Pure analysis has no file provenance unless the caller supplies it.

A missing route/identity cell means **not observed in these inputs**. It does not establish whether the route was tested, accessible or protected. There is no application-wide coverage denominator or percentage. A normalized response status of zero means response metadata is unavailable; without associated raw evidence, its cause remains unknown. Associated native raw bytes can distinguish absent, marked-truncated, malformed and usable responses.

Anonymous traffic and unattributed traffic are different buckets. Historical authentication flags and HTTP success do not establish a valid session or correct attribution. Unattributed records retain their declared identity/counter metadata, but their workflow group has unknown ordering so different undeclared identities cannot create an invented chronology.

Capture counters are local to an identity. Ties have unknown relative order; numerical gaps do not count missing requests. A transition's matching trigger/resource references establish a saved association, not an independently verified state change or causal relationship. Without usable transitions, the recorded exchange sequence remains available and the workflow limitations are stated.

Zero recorded findings does not mean the application is secure. Blocked or unresolved work and limited response evidence can accompany empty findings without proving why the result is empty. Saved hypotheses, candidates and verifier verdicts do not become findings or newly verified claims.

## APIs

Import from the built `apps/worker/dist/blackbox-observation/index.js`; TypeScript source exports the corresponding types. Package consumers can use the additive `@shannon/worker/blackbox-observation` export.

```ts
import { analyzeObservation, observeDirectory } from './apps/worker/dist/blackbox-observation/index.js';

const result = analyzeObservation({
  traffic: parsedTraffic,
  blackboard: parsedExportedBlackboard,
  // Omit findings when unavailable; [] explicitly means a valid empty array.
  findings: parsedFindings,
});

const report = await observeDirectory(deliverablesDirectory, {
  rawDirectory: explicitlySelectedRawDirectory, // optional
  outputDirectory: newOutputDirectory,          // optional
  limits: { timeoutMs: 30_000 },                 // optional tightening only
  signal: abortController.signal,               // optional
});
// report.result, report.json, report.markdown
```

`analyzeObservation(input, limits?)` is a synchronous pure API for in-memory JSON data. `ObservationInput` optionally accepts associated `rawRecords`, `rawRequested`, file `sources` and fixed `inputDiagnostics`; those caller assertions are not independent file verification. Use `observeDirectory` for untrusted local files and the enforced read/processing deadline.

`observeDirectory` owns a fixed isolated worker for guarded reads, analysis, serialization and requested output creation. It returns `{result, json, markdown}`. `serializeObservation(result)` and `renderObservationMarkdown(result)` render the typed projection; the former checks each output byte ceiling. Invalid limit overrides and outputs that cannot fit their ceiling throw fixed errors. A serialization ceiling failure uses `ObservationOutputError`; pure analysis can throw a plain `Error`. The CLI emits a small fixed diagnostic instead of a truncated result.

## Output and exits

Stdout is deterministic JSON with a trailing newline. `--output` creates a new directory with `observation.json` and `observation.md`; the parent must already exist and be a real directory. The destination must be outside both explicit input roots. Creation is exclusive: existing paths are never overwritten. A failed output operation may leave partial newly created files for inspection; the command never recursively removes a destination. Failed analysis returns diagnostics on stdout without creating the requested output directory; partial analysis can be saved.

Markdown renders private metadata and source references as inert code, escaping table, line and control delimiters. HTTP bodies, header values, raw notes, replay details and freeform explanations from input artifacts have no output fields. Route paths, identity names and state labels remain private metadata: this is not a sanitized sharing format.

| Exit | Meaning |
| --- | --- |
| 0 | Processing completed, possibly with explicitly unknown evidence or optional omissions |
| 1 | Partial/failed analysis, invalid requested data, resource exhaustion, output failure or missing setup |
| 2 | Invalid CLI usage |

No finding gate exists. Recorded run incompleteness and successful observation processing are separate facts.

## Fixed ceilings

Public overrides may only tighten these values; unknown, nonpositive or larger overrides are rejected.

| Limit field | Ceiling |
| --- | ---: |
| `maxNativeBytes` | 16 MiB per native JSON |
| `maxRawBytes` | 1 MiB per selected raw record |
| `maxTotalBytes` | 64 MiB aggregate selected input |
| `maxDepth`, `maxNodes` | 64 nesting levels; 500,000 structural nodes |
| `maxExchanges`, `maxRoutes` | 10,000 unique exchanges; 2,000 route groups |
| `maxIdentities`, `maxTransitions` | 16 recorded identities; 5,000 transitions |
| `maxRecords`, `maxRawFiles` | 50,000 aggregate collection records; 512 selected raw IDs |
| `maxOutputBytes` | 16 MiB for each generated artifact |
| `timeoutMs` | 60,000 ms including reads and serialization |

The file API rejects linked files, hard links, linked/aliased directories, nonregular files, unsafe Windows path forms, invalid UTF-8, duplicate JSON keys and changed sources detected during guarded reads. Deadline/abort handling kills and reaps the owned worker; pending operations cannot start further reads or analysis afterward. These are bounded observations of supplied snapshots, not authenticity checks or recovery of discarded captures.

## Verification and examples

```powershell
pnpm test:blackbox-observation
pnpm eval:blackbox-observation
pnpm test:blackbox-observation:regressions
pnpm test:blackbox-observation:install --offline --store-dir .pnpm-store
pnpm test:blackbox-observation:linux
```

The finite independently labeled corpus lives under `apps/worker/test/fixtures/blackbox-observation`. Its `sets/rich` directory is a clearly synthetic multi-identity positive workflow example:

```powershell
pnpm --silent blackbox-observe apps/worker/test/fixtures/blackbox-observation/sets/rich --output output/my-synthetic-observation
```

The clean Windows/Linux profiles use explicit source/test allowlists and frozen dependencies. Linux tests run without a network or host mounts. Their context excludes saved runs and credentials. Acceptance evidence and the actual saved-run demonstration are recorded in [the B1–B7 acceptance record](goals/blackbox-observation-acceptance.md).

A locally retained real saved-run example shows 473 exchanges across 74 routes. Its analysis is partial because four rejected proposals contain dangling evidence references; 181 exchanges also lack usable normalized response metadata. The clearly synthetic workflow example demonstrates two identities and two recorded transitions. Both preserve their input bytes. Unknown evidence remains unknown even when processing completes. Generated examples remain in the ignored local `output/` directory because they contain run-specific evidence.
