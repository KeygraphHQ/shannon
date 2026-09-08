# Reporting regression and runtime checks

Run these commands from the repository root after installing the locked dependencies with `pnpm install --frozen-lockfile`.

```sh
pnpm test:reporting
pnpm test:reporting:linux
pnpm test:reporting:runtime
```

`test:reporting` runs launcher/install/Docker-runner guards, syntax checks for the runtime fixtures, the worker build, metadata/summary/artifact tests, bundle integrity/privacy/filesystem/CLI regressions, catalog/library/renderer regressions, two selected activity integration tests, and scoped TypeScript formatting/lint checks. It makes no target or model calls and requires no Docker server. The activity cases are selected explicitly; this command does not run the whole assessment test suite. See [saved report bundles](report-bundles.md) and the [local report library](report-library.md) for commands and acceptance evidence.

`test:reporting:runtime` requires a responsive local Docker Linux engine. It builds a test-only package of the compiled worker modules and starts a dedicated Temporal dev server. It exits nonzero if prerequisites, scenarios, or cleanup fail; unavailable infrastructure is never counted as a skipped or passing test.

`test:reporting:linux` uses the same allowlisted build harness with `--bundles`. It runs bundle, catalog, library and renderer regressions plus a command walkthrough in a nonroot container with `--network none`; it creates no Temporal server or network. `pnpm test:reporting:install` exercises that test set after a fresh Windows or host-platform installation. Clean-install and platform acceptance is recorded in [reporting readiness](reporting-readiness.md).

## Runtime scope

The harness runs a synthetic Temporal workflow and local fixture activities using the production metadata store and artifact renderer/publisher/copier. The assessment workflow, CLI entrypoint, model agents, browser, and target actions are never started. This validates reporting modules across real Temporal activity boundaries; it does not validate the production assessment wiring or the full production Docker image.

The six runtime scenarios assert:

1. Completion publishes recorded provenance and exactly four copied artifacts.
2. An incomplete result retains its recorded reason and coverage limitations.
3. A publication activity retried by Temporal retains the first selected end timestamp.
4. A later repair attempt retains the original result owner, run ID, and provenance.
5. Withholding an observed cancellation close leaves the journal ending unknown; explicitly recording that close stores interruption and its actual timestamp.
6. A copied installation without Git records an unknown revision plus a JavaScript fingerprint; changing installed JavaScript changes the fingerprint without rewriting the earlier report.

The cancellation case renders a diagnostic fixture report to inspect the metadata. It does not imply that a cancelled production run automatically publishes a report. A synthetic terminal marker stands in for the assessment's committed state; existing offline integration cases cover the production finalization/publication boundary.

## Packaging and resource ownership

The Docker build context is constructed in a temporary directory from an explicit allowlist: package/lock/config manifests, worker TypeScript sources, reporting runtime fixtures, bundle/catalog/library tests and the report launcher/CLI walkthrough. It does not include saved workspaces, local configuration, credentials, `.git`, or host `node_modules`. Symlinks in copied inputs are rejected. Package installation uses the existing frozen lockfile and repository script policy. No dependency or lockfile change is required.

The test image uses Node 22 on Debian bookworm, matching the production worker's Node major version; Temporal uses the repository's existing `temporalio/temporal:1.7.0` dev-server image version. Base image tags can move, so this is a reproducible test procedure rather than a claim of an immutable image build. The installed worker JavaScript fingerprint remains visible in the fixture reports.

Image/dependency downloads happen during setup. Runtime containers share a new Docker `--internal` network with no published host ports, host bind mounts, or forwarded provider credentials. The worker runs as the image's nonroot user with capabilities dropped. Only the fixed `REPORTING_TEMPORAL_ADDRESS=temporal:7233` value is passed into it.

Every run has UUID-scoped container, image, and network names and an ownership label. Cleanup checks that exact label before removing even a resource whose creation response was lost. It attempts all tracked cleanup and reports failures. Temporary directory deletion verifies the resolved owned path. Downloaded base images and Docker build cache are retained; existing containers and networks are not restarted or removed.

Docker commands, readiness checks, test scenarios, and CI jobs have finite timeouts. An uncatchable host/process kill may prevent cleanup; errors identify the run's resource names. Do not use global Docker prune as a recovery step.

## CI

`.github/workflows/reporting-checks.yml` defines three jobs on pushes, pull requests, and manual dispatch:

- **Reporting offline:** runs `pnpm test:reporting` on Node 24 with the frozen lockfile.
- **Reporting runtime:** runs the Docker-backed command on an Ubuntu runner.
- **Reporting clean Linux install:** runs the bundle Docker profile directly from the source checkout, without installing host dependencies or using host compiled output.

All jobs use the repository's pinned action revisions, a read-only GitHub token, disabled persisted checkout credentials, no secrets, and bounded job timeouts. A failed check is visible as a failed job. Enforcing it as a merge requirement additionally needs repository branch protection; this local change does not alter remote settings or release workflows.

Temporal documents integration tests using workers with mocked activities in its [TypeScript testing guide](https://docs.temporal.io/develop/typescript/best-practices/testing-suite). The harness uses the repository's installed SDK 1.15.0 interfaces and does not add the separate testing package.

## Current verification record

The latest [reporting readiness evidence](reporting-readiness.md#evidence-and-review) records 156 passing Windows offline entries and one POSIX-only skip; 99 passed and one skip after a clean offline Windows installation; and all 100 bundle/catalog/library/CLI entries passing on Linux with zero skips. Worker build, three fixture syntax checks and the 16-file Biome check passed. The [library record](report-library.md#verification) also covers desktop/mobile Chrome interactions and unchanged fingerprints for 106 saved artifact files.

The library changes did not affect Temporal execution paths, so the runtime harness was not rerun for this round. Its latest six-scenario pass is recorded separately in [reporting readiness](reporting-readiness.md#earlier-command-and-portability-milestone). The records below preserve the earlier reporting-harness implementation evidence.

- Before the bundle commands were added, `pnpm test:reporting` passed 38 tests (six runner guards, 30 reporting cases, two selected integration cases), all three runtime fixture syntax checks, worker build, and the seven-file Biome check. The expanded command has since passed with the bundle regressions and a 12-file Biome check; [bundle acceptance evidence](report-bundles.md#verification) records its final results. Offline results do not imply a Temporal runtime pass.
- The runtime harness's SDK and production-module imports resolved on the host without attempting a connection. Independent static review of the harness, packaging guards, and documentation found no unresolved in-scope issue. CI YAML parsing, pinned action references, and final diff/whitespace checks passed.
- After the local Docker engine recovered, `pnpm test:reporting:runtime` passed on 2026-09-07 with exit 0. The worker compiled inside the Linux test image, the isolated Temporal server became healthy, and all six scenarios passed. Node reported seven passing test entries including the parent test, with zero failures, cancellations, or skips. The publication-retry case deliberately failed its first activity attempt and then passed on retry with the original timestamp intact.
- Cleanup was independently verified using exact-label container, network, and image listings for run `ba7572a9-cb6e-4fbf-8cee-fff370cdd69d`; all three commands exited 0 with no matching resources. The build used `node:22-bookworm-slim` resolved to `sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4` and the locked Temporal SDK 1.15.0.
- Earlier Docker preflight attempts failed with engine errors or timeouts, before any test resources were created. Those infrastructure failures are resolved for the successful run above. No implementation changes or repeat offline test run were required after Docker recovered.
- The CI workflow has been inspected locally but has not run on GitHub. Production assessment orchestration and the full production Docker image remain outside this synthetic runtime validation. No commits, remote settings changes, publication, or deployment were performed.

The reporting commands have observed passing local results. Future changes should rerun affected checks and record actual failures instead of inferring success from the harness existing.
