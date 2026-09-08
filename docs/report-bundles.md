# Check, archive, and share saved reports

These commands operate on saved report files locally. They do not start an assessment, replay requests, contact a target, invoke a model, or modify the source directory.

Use Node.js 22 or newer and pnpm 10.33.0 (the version pinned by this checkout). Help works before dependency installation or compilation:

```sh
node scripts/reports.mjs --help
```

Install the locked dependencies and build the worker from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @shannon/worker build
```

Then use the standalone CLI; quote paths containing spaces:

```sh
pnpm --silent reports check "path/to/deliverables"
pnpm --silent reports archive "path/to/deliverables" "path/to/new-private-archive"
pnpm --silent reports check "path/to/new-private-archive" --require-integrity
pnpm --silent reports share "path/to/deliverables" "path/to/new-share"
pnpm --silent reports check "path/to/new-share" --require-integrity
```

Rebuild after changing worker sources. For process integrations, invoke `node scripts/reports.mjs` with the same arguments. The launcher reports `build_required` if compiled output is unavailable; it does not silently install or rebuild. Each operation writes one JSON result to stdout. Exit codes are `0` for success, `1` for a failed operation or unmet integrity requirement, and `2` for invalid usage. Unexpected child exit codes are preserved. `--help` prints usage text. Diagnostics contain fixed issue codes and artifact names, never supplied paths or private record values. The lower-level compiled entry point remains `node apps/worker/dist/scripts/report-bundle.js`.

These additions are available in the source checkout; they have not been published as part of the `npx @keygraph/shannon` package. Installation/platform acceptance is tracked in [reporting readiness](reporting-readiness.md).

## Accepted inputs and integrity

A private source directory contains exactly these four existing artifacts, optionally accompanied by `bundle-manifest.json`:

- `traffic_inventory.json`
- `blackbox_blackboard.json`
- `blackbox_authz_findings.json`
- `blackbox_authz_evidence.md`

The checker validates supported record shapes, authoritative identifiers, known references, inventory/blackboard agreement, findings against their recorded verifier/candidate/action, and available run provenance. It checks basic Markdown outcome and finding references and the current summary/provenance section when supplied. Unknown private extension fields remain private. Rejected proposals may contain invalid references; ephemeral verifier action and actor task identifiers need not be persisted in the board.

The result separates three questions:

| Field | Meaning |
| --- | --- |
| `valid` | All applicable file, schema, reference, consistency, and manifest checks passed. |
| `integrity: matched` | Every artifact's exact byte length and SHA-256 agree with the supplied manifest. |
| `integrity: unavailable` | No recorded manifest exists. Legacy structural consistency can still pass. |
| `integrity: failed` | A supplied manifest cannot be validated or its content does not match. |
| `authenticity: not-established` | Bundle checks always report this: the manifest is unsigned. |

`--require-integrity` fails when hashes are unavailable, even if structural validation reports `valid: true`. A sanitized bundle always requires its manifest. Filenames, duplicate manifest entries, profile, algorithm, lengths, and digest formats are checked strictly.

**Matching hashes establish consistency with that manifest, not authenticity or a trusted creation date.** Someone who replaces both the artifacts and manifest can create another internally consistent bundle. A legacy archive records hashes of the bytes present at export time; it does not recover prior evidence. Structural checking cannot establish whether a recorded finding is true, detect every coherent substitution, or authenticate arbitrary Markdown prose. Keep an independently trusted copy or manifest when later comparison matters.

## Private archives

`archive` copies all four artifact byte sequences exactly, preserving their formatting and private evidence. Its manifest records profile `private`, schema version `1`, algorithm `sha256`, and one `{name, bytes, sha256}` entry per artifact. It excludes timestamps and supplied filesystem paths. An existing manifest is checked before export and regenerated from the copied bytes.

The archive remains sensitive: credentials, payloads, target details, narratives, and raw identifiers can appear in the original evidence. This command provides packaging and consistency checking, not redaction.

## Sanitized summaries

`share` constructs a separate profile, `sanitized`, containing only `report.json`, a canonical `report.md`, and `bundle-manifest.json`. It does not edit the original artifacts or claim to preserve their full proof.

The projection uses explicit allowlists for recorded lifecycle outcomes, counts, availability flags, and generated references. Entity aliases are consistent within a bundle. Run/attempt aliases retain available result ownership and resume lineage. No reverse mapping is exported.

Free text, original IDs, target origins, URLs, request paths, headers, bodies, proof conditions, mutation payloads, role descriptions, timestamps, configured model strings, code revisions, and private-content hashes are omitted. Unknown extension fields and their keys are omitted too. Manifest digests cover only the two sanitized output files. The checker rejects unknown sanitized fields, invalid aliases, duplicate or dangling references, inconsistent counts, and Markdown that differs from the canonical projection.

Counts, relationships, outcomes, and provenance availability remain visible by design and can support inference about a run. This is a minimized summary, not a guarantee of anonymity. Aliases are bundle-local references, not stable identifiers for comparing different runs. An empty findings list does not mean the target is secure or that coverage was complete. The summary cannot reproduce or independently verify a finding because its private evidence has been omitted.

## Filesystem behavior and limits

Use a stable local snapshot in a directory without other writers. Files must be regular, singly linked files; symlinks, junctions, hard-linked artifacts, unexpected entries, and linked directory ancestors are rejected. Artifact files are limited to 16 MiB each; the manifest is limited to 16 KiB. Text must be valid UTF-8. The destination parent must already exist.

Exports reject any existing destination, including an empty directory, and reject destinations inside, equal to, or containing the source. Output is first written into an owned sibling staging directory and checked. The exporter then exclusively creates the destination, writes its manifest last, and checks the completed output. Ordinary write or validation failures remove owned partial output. If another writer changes ownership or introduces files during cleanup, the exporter preserves those files and returns `cleanup_failed`.

The process is not a filesystem transaction. An uncatchable process/host failure can leave a staging directory or incomplete destination; inspect it and run `check --require-integrity` before treating it as an archive. Filesystem permission errors can also prevent cleanup. Inode and path checks reduce accidental races but do not provide a locked snapshot against a hostile concurrent writer. The tool does not change access permissions of the source or supply an encrypted archive.

## Verification

Run `pnpm test:reporting` for the worker build, existing reporting regressions, new bundle validation/privacy/filesystem/CLI tests, and scoped TypeScript checks. The existing **Reporting offline** CI job runs this command. Tests use synthetic local fixtures, including seeded private strings, and no live assessment artifacts.

Observed on 2026-09-07 using Windows and Node 22.16.0:

- `pnpm test:reporting` exited 0: worker compilation, existing reporting and runner regressions, bundle regressions, two selected activity integration cases, runtime-fixture syntax checks, and the 12-file Biome check passed.
- The final added regressions were also run after the full command: `node --test apps/worker/test/report-bundle-sanitized.test.mjs` passed all 45 entries, including nested mutation cases. The rich private-source export case and the unchanged-Markdown verifier-reference case passed in a focused run. Across the final three bundle test files, all 74 test entries have observed passes (14 filesystem/CLI, 15 private validation/integration, 45 sanitizer).
- Tests verify exact archive bytes and manifests, same-length and length-changing tampering, malformed manifests/UTF-8, missing and mixed artifacts, oversized inputs, hard links, ancestor junctions, source overlap, existing destinations, competing creation, partial writes at every staged/published private file, and preservation of unowned files during failed cleanup.
- Privacy tests seed identifiers, narratives, credentials, proof data, extension keys, model configuration and provenance. The rich end-to-end case validates a coherent private graph, exports through the actual filesystem API, checks its manifest, scans all three share files, and compares every source byte. Strict summary mutation tests independently exercise graph and lineage consistency, not just Markdown mismatch.
- The initial filesystem run exposed Windows path/handle stat device-ID differences. Full-precision inode comparison and the guarded Windows comparison resolved that observed failure; the normal export and every partial-write case subsequently passed.
- `pnpm --silent reports --help` returned the documented usage. Independent static review covered filesystem behavior, diagnostics, both validators, projection privacy, package integration, tests and documentation. Identified consistency defects were fixed with regressions; no unresolved in-scope defect remained. The final scoped diff and whitespace checks passed. Dependencies and lockfiles have no content changes.

The table and bullets above record the original bundle implementation acceptance. The subsequent [reporting readiness milestone](reporting-readiness.md) added the launcher and command walkthrough, verified a clean Windows installation, passed all 75 bundle/CLI entries on Linux, and reran the isolated Temporal harness successfully. GitHub CI still has not run these local changes. No production assessment ran and no saved live artifacts were exported or published during verification.
