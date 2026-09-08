# Reporting readiness

This record covers the local saved-report workflow: installation, help, checking, private archives, sanitized sharing, historical catalogs, the offline report browser, and portability. It does not certify the complete assessment product or announce a published release.

**Status: locally verified on Windows and Linux, with Chrome interaction checks, 2026-09-07.** The latest milestone is the [local report library](report-library.md), including a private snapshot of the saved `workspaces` tree. All six criteria below have observed evidence. Source changes remain uncommitted and unpublished; GitHub CI has not executed them.

## Acceptance checklist

| Criterion | Required evidence | State |
| --- | --- | --- |
| Help and setup failures work in a fresh checkout | Node-only launcher tests without dependencies or compiled output; safe errors and correct exit codes | PASS: nine launcher tests, including exact argument forwarding and silent-child failure |
| A clean Windows installation can use all report commands | Allowlisted fresh tree, frozen installation, worker build, bundle/catalog/library tests, actual pnpm CLI walkthrough | PASS: offline installation from a populated cache, worker build, 99 passed and one POSIX-only skip |
| Linux supports the same bundle and command contracts | Test-only Docker build from allowlisted sources; frozen installation; tests as nonroot with networking disabled | PASS: all 100 bundle/catalog/library/CLI entries, zero skips |
| Existing reporting behavior remains accepted | Complete `pnpm test:reporting` and affected runtime checks pass | PASS: 156 passed, one POSIX-only skip, build/lint/syntax checks; earlier six-scenario Temporal pass retained separately because runtime paths were unchanged |
| Resources and source data are preserved | Exact-label Docker cleanup, owned temporary-tree cleanup, original-byte assertions and no dependency/lockfile changes | PASS: latest Docker listings empty, Windows temporary tree absent, 106 saved artifact fingerprints unchanged, manifest comparisons passed |
| Another developer can discover and reproduce the workflow | README/development links, command documentation, CI integration, independent review and browser checks | PASS: commands documented, current source reviewed, desktop/mobile Chrome interactions passed; direct file launch remains unobserved |

## Reproducible commands

Run from the repository root with Node.js 22 or newer and pnpm 10.33.0:

```sh
node scripts/reports.mjs --help
pnpm test:reporting
pnpm test:reporting:install
pnpm test:reporting:linux
pnpm test:reporting:runtime
```

`test:reporting:install` creates a temporary source tree from an explicit allowlist, installs the existing frozen lockfile, compiles the worker, and runs `test:reporting:bundles`. It copies neither the host's `node_modules` nor its compiled output. Public package downloads may occur. To reuse an existing pnpm package cache without downloads, pass `--offline --store-dir "path/to/pnpm-store"`; a missing cached package is a failure, not a skip.

`test:reporting:bundles` assumes dependencies and the worker build already exist. It runs bundle, catalog, library and renderer regressions plus a command walkthrough through `pnpm --silent reports`. Coverage includes paths with spaces and Unicode, legacy checks, private archive bytes, sanitized outputs, tampering, bounded discovery, duplicate grouping, unknown results, output ownership, inert browser text, filters and failure exits.

`test:reporting:linux` requires a local Docker Linux engine. It invokes the existing reporting harness with `--bundles`; unsupported options fail before Docker access. The test image installs pnpm 10.33.0 and the frozen worker dependencies from allowlisted source files. Build inputs exclude saved runs, credentials, host modules, compiled output and Git metadata. Package/image downloads happen during build; Docker can reuse cache layers. The nonroot test container has no published ports, host mounts, forwarded provider credentials or network connection. This mode does not create a Temporal server or Docker network.

The separate `test:reporting:runtime` command retains the isolated Temporal scenarios described in [reporting checks](reporting-checks.md). Docker test images and containers use a per-run UUID and ownership label. Cleanup verifies that label before removal. Downloaded base images and build/package caches remain. A hard process or host failure can prevent cleanup; do not use global prune to recover test resources.

## Evidence and review

### Current catalog and library milestone

Observed on 2026-09-07:

| Check | Observed result |
| --- | --- |
| `pnpm test:reporting` | Exit 0 on Windows Node 22.16.0, pnpm 10.33.0: 25 launcher/install/runner guards, 30 existing reporting entries, 100 bundle/catalog/library/CLI entries (99 passed, one POSIX-only skip), and two selected activity cases. Total: 156 passed, one skipped, zero failures; worker build, three fixture syntax checks and 16-file Biome check passed. |
| `pnpm test:reporting:install --offline --store-dir "C:\Users\zeb\Documents\workspace_for_ai\vuln-coscientist\.pnpm-store"` | Exit 0 in a fresh win32/x64 temporary tree: 415 packages reused, zero downloads, worker compiled, 99 passed and one POSIX-only skip. Package/workspace/lock manifests remained unchanged. |
| `pnpm test:reporting:linux` | Exit 0 in the isolated nonroot container with networking disabled: all 100 entries passed, zero failures or skips. |
| Chrome browser checks | Desktop 1440×1000 and mobile 390×844: search/filter/clear/selection/unknown-result states passed, including native-button keyboard selection. Hostile text stayed inert; no console messages or external requests. The exact HTML was served temporarily on loopback because the automation tool blocked `file://`; direct file launch was not observed. |
| Saved `workspaces` inventory | Complete discovery of 965 directories and 28 candidates: three valid bundles in one exact-content group and 25 invalid candidates. All 106 source artifact files retained their original fingerprints. [Snapshot interpretation](report-library.md#observed-saved-report-state). |

Generated logs and catalogs remain in the ignored local `output/` directory because they include run-specific metadata. The table records the observed results needed for review.

The initial full run found a heading-matching defect in the UI test double. After correction, the complete command passed. Independent source review found a publication gap where a later write could change an earlier output without a final recheck; the exporter now verifies both completed files and a regression covers that case. No unresolved in-scope source finding remained. Scoped source whitespace and syntax checks passed.

Cleanup for Linux run `95afbc77-2027-4cf2-bbca-cdd31df33346` was independently verified with exact-label container, network and image listings; all returned empty. The Windows temporary directory `shannon-reporting-install-8e1e450a-4ee5-46e2-a418-6cb625ae2c78-S0I6AY` was observed during installation and verified absent afterward. The Linux base resolved to the same digest recorded below. The owned Chrome session and fixture-only loopback listener were closed after browser checks.

The library round changed passive artifact handling and tests without dependency or lockfile changes. It did not change assessment or Temporal execution paths, so the earlier passing Temporal run below remains the latest runtime evidence; it was not rerun for this milestone.

### Earlier command and portability milestone

The following 132/75-entry results predate the catalog and library additions and preserve the original readiness acceptance evidence from 2026-09-07:

| Command | Observed result |
| --- | --- |
| `node scripts/reports.mjs --help` and `pnpm --silent reports --help` | Help returned successfully with Node/pnpm prerequisites and all commands. Fresh-checkout help and setup failures are also tested without any build output. |
| `pnpm test:reporting` | Exit 0 on Windows Node 22.16.0, pnpm 10.33.0. Passed 25 launcher/install/runner guards, 30 existing metadata/summary/artifact entries, 75 bundle/CLI entries, two selected activity integration cases, worker build, three fixture syntax checks and 12-file Biome check. Total: 132 test entries, including nested cases. |
| `pnpm test:reporting:install --store-dir "C:\Users\zeb\Documents\workspace_for_ai\vuln-coscientist\.pnpm-store"` | Exit 0 on win32/x64. Created a new temporary source tree, installed 415 locked packages, compiled the worker there and passed all 75 bundle/CLI entries. Package and lock manifests remained byte-identical. The explicit cache path belongs to this validation host; other developers can use the default command or their own cache path. |
| `pnpm test:reporting:linux` | Exit 0. The clean Docker context installed 415 locked packages and compiled the worker. All 75 bundle/CLI entries passed with zero failures, cancellations or skips under the nonroot network-disabled profile. |
| `pnpm test:reporting:runtime` | Exit 0 after the harness changes. All six synthetic Temporal scenarios passed; Node reported seven entries including the parent, zero failures/cancellations/skips. The deliberately failed first publication attempt recovered on retry as expected. |

The initial Windows `--offline` attempt failed with `ERR_PNPM_NO_OFFLINE_TARBALL` because the selected package cache lacked a locked dependency. That result was recorded as failure. The subsequent frozen public-registry installation downloaded the missing packages and passed; validation and install-script controls were unchanged. An empty cache cannot satisfy the optional offline mode.

The Linux build used `node:22-bookworm-slim` resolved to `sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4`, pnpm 10.33.0 and TypeScript 5.9.3. The base/pnpm layer was cached; the bundle run's dependency installation and worker compilation executed in the new context. The later Temporal rerun reused matching build layers and the existing `temporalio/temporal:1.7.0` image with locked SDK 1.15.0.

Cleanup was independently checked using read-only container, network and image listings filtered to each exact `com.shannon.reporting-test` label:

- Linux bundle run: `aff06c9d-d184-4176-8e91-24c0cb816879` — all listings empty, commands successful.
- Temporal run: `2e2bb007-5ed9-44ee-9199-2bfaf04d7129` — all three listings empty with individual exit 0 results.
- Windows clean-install directory `shannon-reporting-install-33efb668-8ac4-416e-a58f-77edbf1a6e7a-P7zkBR` — absent after successful cleanup. Package cache downloads remain intentionally available.

The independent reviewer did not implement these changes. Static review covered the launcher, clean context/environment, bounded subprocesses, Linux/Temporal profile selection, exact-label cleanup, command smoke test, package scripts, CI and documentation. Review identified a Corepack prerequisite assumption; help now explicitly requires installed pnpm, matching the guides. A silent child exit without a result was also corrected and covered by a regression. No unresolved in-scope implementation defect remained. The final source diff, whitespace checks, package formatting and CI YAML parsing passed; dependency and lockfile content is unchanged.

## Product boundary

The reporting tools operate on existing saved artifacts. Unsigned manifests prove consistency with the supplied hashes, not authenticity. Sanitized reports omit private proof and can still reveal aggregate counts and relationships. Catalogs and libraries additionally retain private folder paths and content fingerprints; they are static snapshots, not sanitized shares. See [bundle contracts](report-bundles.md) and [library contracts](report-library.md) for these limits.

The wider product has separate unanswered acceptance questions: full production image and assessment wiring, detection accuracy against independent ground truth, route/control coverage, full assessment-suite results, and published-package integration. GitHub CI execution requires these local changes to be pushed; no push, commit, publication, deployment, remote setting change, or live assessment is part of this milestone.
