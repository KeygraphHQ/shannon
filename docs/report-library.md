# Catalog and browse saved reports

Inventory saved reports, then generate a private local browser from the repository root:

```sh
pnpm --silent reports catalog workspaces
pnpm --silent reports library workspaces output/report-library-2026-09-07
```

Ensure `output` exists first. The destination must be new and outside the scanned root; it must not contain that root either. If the example destination already exists, choose another name. The library writes `catalog.json` and `index.html`. Open `index.html` in a browser to search folders, combine filters, inspect validation issues and provenance, and identify exact copies.

**Both outputs are private local metadata, not sanitized shares.** They include the source root, relative folder names and content fingerprints. For a separate allowlisted summary of an individual valid bundle, use [`reports share`](report-bundles.md#sanitized-summaries).

Use Node.js 22 or newer and pnpm 10.33.0. Install with `pnpm install --frozen-lockfile`, then run `pnpm --filter @shannon/worker build`. Rebuild after worker source changes. `node scripts/reports.mjs --help` works before setup. These commands are available in this source checkout; they have not been published in `npx @keygraph/shannon`.

## Reading the inventory

`catalog` prints one JSON inventory. Exit `0` means directory discovery completed, even when some discovered bundles are invalid. Exit `1` means discovery or the operation failed; invalid usage exits `2`. A partial inventory retains the discovered entries and lists traversal issues. `library` refuses partial discovery and creates no completed library from it.

The fields answer separate questions:

| Field | Meaning |
| --- | --- |
| `complete` | Directory discovery completed within the declared limits. It says nothing about assessment coverage. |
| `check.valid` | The candidate passed the existing bundle file, schema, consistency and applicable manifest checks. |
| `summary` | Validated result counts and provenance flags. Invalid candidates have `null`, so missing evidence cannot become zero findings. |
| `contentId` / `duplicateGroup` | Exact artifact-byte grouping for valid bundles. Invalid candidates have unknown grouping. |
| `traversalIssues` | Folders omitted because of links, read failures, changes during discovery or limits. |

Discovery includes hidden directories. Any directory containing a recognized artifact filename is a candidate: the four private bundle filenames, `report.json`, `report.md`, or `bundle-manifest.json`. An unrelated `report.md` can therefore appear as an invalid candidate. This makes ambiguous evidence visible; the catalog is not a count of completed assessments.

Default limits are depth **32** from the supplied root, **1,000 directories**, **10,000 directory entries** across the inventory, and **250 bundle candidates**. Linked directories and ancestors are rejected. An exceeded limit is reported as incomplete discovery. The existing [artifact size and validation limits](report-bundles.md#filesystem-behavior-and-limits) still apply. The TypeScript `buildReportCatalog` API accepts limit overrides; the CLI uses the defaults.

Duplicate grouping compares exact bytes within each profile, including artifact filenames and lengths, and excludes the manifest. Formatting changes produce different content identities; a private bundle and its sanitized projection are different profiles. Copies do not represent independent assessments, and matching hashes do not establish authenticity. Missing provenance remains unavailable or unknown rather than being inferred from filenames.

## Snapshot and filesystem behavior

The page is a standalone snapshot with embedded data, scripts and styles. It needs no server or external assets and does not refresh automatically. Generate a new destination to reflect later saved-file changes. Folder text is rendered inertly, and the page has a restrictive content policy.

Cataloging reads existing files without starting an assessment, replay, model call or target request. Library export preserves source bytes, exclusively creates its destination, and verifies both completed output files. Ordinary write failures remove owned partial output; unowned files are preserved and cleanup failures are reported. Use stable local input without other writers. A process or host crash can leave incomplete output, so an existing directory is never silently reused.

## Observed saved-report state

The local `workspaces` snapshot generated on **2026-09-07 at 14:20:46 UTC** completed discovery of **965 directories**:

| Observation | Count |
| --- | ---: |
| Candidate folders | 28 |
| Valid bundles | 3 |
| Invalid candidates, with unknown result counts | 25 |
| Exact content groups / extra copies | 1 / 2 |
| Candidates without a recorded manifest | 28 |
| Valid bundles with unavailable provenance | 3 |
| Candidates with unknown provenance | 25 |

The candidates comprise 26 black-box artifact folders and two other folders containing recognized report filenames. One of those other folders lacks `report.md`; the other lacks `report.json`. All three valid bundles share the same artifact bytes.

All 23 invalid black-box folders have the same legacy format omission: their Markdown lacks the no-findings sentence required by the current checker. Twenty-one have only `markdown_mismatch`; two also contain unexpected entries. Their JSON shape and reference checks reported no issues, all 23 recorded incomplete outcomes agree between Markdown and JSON, and all 18 recorded failure details agree. None includes the current summary table or provenance. This is a known format compatibility gap, not evidence of contradictory outcomes or counts; the current catalog still correctly leaves their result summaries unknown under its validation contract.

Legacy compatibility/import handling is deferred under the [agreed product priorities](coverage-roadmap.md#agreed-priorities). If needed for a selected product improvement, it must preserve original bytes, unavailable provenance and visible extra-entry diagnostics without broadly weakening validation. These observations describe the saved evidence, not overall detection accuracy or security coverage. No historical evidence was repaired or relabeled during discovery.

The private snapshot is in `output/report-library-2026-09-07/`. Before/after fingerprints verified that all **106 source artifact files** were byte-identical after generation.

## Verification

Observed locally on 2026-09-07; source changes remain uncommitted and GitHub CI has not executed them:

| Check | Observed result |
| --- | --- |
| `pnpm test:reporting` on Windows | Exit 0: 156 passed, one POSIX-only skip, zero failures; worker build, three fixture syntax checks and 16-file Biome check passed. |
| Clean Windows install with `--offline` and the populated package cache | 415 packages reused, zero downloads; fresh worker build; 99 passed, one POSIX-only skip, zero failures. |
| `pnpm test:reporting:linux` | Fresh isolated build; all 100 bundle/catalog/library/CLI entries passed as nonroot with networking disabled, zero skips. |
| Chrome interaction check | Search, duplicate and combined filters, no-match state, clear filters, report selection and invalid-result display passed at desktop and mobile sizes; focusing a native report button and pressing Enter selected it with `aria-pressed=true`. |
| Browser privacy and layout | Hostile folder text stayed inert; no injected global or image elements, no console messages, no external requests, and no page overflow at the checked mobile width. |
| Source preservation and review | 106 saved artifact fingerprints unchanged; independent review issue fixed with a regression; no unresolved in-scope source finding. |

The host total comprises 25 launcher/install/runner guards, 30 existing reporting entries, 100 bundle/catalog/library/CLI entries (99 passed and one skipped), and two selected activity cases. An initial run exposed a heading-matching defect in the UI test double; it was corrected and the complete command passed on rerun. The five renderer tests also cover all five filters, unknown values, hostile text and exact CSP hashes.

Chrome was checked at 1440×1000 and 390×844. The browser automation tool blocked `file://` navigation, so it opened the exact HTML through a temporary fixture-only server on `127.0.0.1`. It made one document request and no external resource requests. Direct file launch was not observed in this browser check. The owned browser session and loopback listener were closed afterward. Screenshots are saved at `output/playwright/library-desktop.png` and `output/playwright/library-mobile.png`.

Locally retained Windows and Linux logs record successful cleanup and unchanged package, workspace, and lock manifests. Linux run `95afbc77-2027-4cf2-bbca-cdd31df33346` left no exact-label container, network, or image resources. Its Node base resolved to `sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4`. Generated logs, catalogs, and screenshots remain in the ignored local `output/` directory because they include run-specific metadata.

This round changed passive report handling and its tests, with no dependency or lockfile changes. The earlier passing Temporal reporting run remains a separate record in [reporting readiness](reporting-readiness.md); the assessment and Temporal execution paths were unchanged and that harness was not rerun for this library round.
