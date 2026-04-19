# Draft PR: Fix local run blockers for build/check/clean and Windows launcher

## What changed

This patch fixes a set of reproducible local run blockers in the Shannon monorepo.

Changes included:
- replace root `turbo`-based `build`, `check`, and `clean` wrappers with a direct workspace task runner
- replace Unix-only `rm -rf dist` cleanup scripts with cross-platform Node-based cleanup
- fix the local `shannon` launcher to await the CLI import
- add `shannon.cmd` for Windows PowerShell / Command Prompt local usage
- update clone/build docs in `README.md` to reflect the working local flow
- add `RUN_BLOCKER_FIXES.md` to document the issue, root cause, patch, and validation

## Why this changed

These issues were reproducible in a Windows PowerShell environment and blocked normal local use of the repository.

### Issue 1: root workspace commands failed

Observed failure:
- `corepack pnpm build`
- `corepack pnpm check`

Failure message:
- `turbo`: `Unable to find package manager binary: cannot find binary path`

Impact:
- monorepo build/check failed before package code ran

Patch:
- remove the dependency on root `turbo run ...` for the documented local build/check/clean path
- run workspace tasks directly from a repo-local script

### Issue 2: local launcher was unreliable

Observed behavior:
- `.\shannon help` did not behave reliably as a local entrypoint

Impact:
- local clone usage was fragile, especially on Windows

Patch:
- make the repo launcher explicitly await the dynamic CLI import
- add a Windows wrapper script: `shannon.cmd`

### Issue 3: clean scripts were Unix-only

Observed behavior:
- package `clean` scripts used `rm -rf dist`

Impact:
- clean failed on standard Windows shells

Patch:
- replace shell-specific cleanup with `fs.rmSync(..., { recursive: true, force: true })`

## Files changed

- `package.json`
- `scripts/run-workspace-task.mjs`
- `apps/cli/package.json`
- `apps/worker/package.json`
- `shannon`
- `shannon.cmd`
- `README.md`
- `RUN_BLOCKER_FIXES.md`

## Validation

Validated successfully after patching:
- `npm run clean`
- `npm run build`
- `npm run check`
- `node shannon help`
- `.\shannon.cmd help`

## Remaining note

`npm` still prints warnings from `.npmrc` because the repo contains `pnpm`-specific config keys:
- `auto-install-peers`
- `strict-peer-dependencies`
- `minimum-release-age`

That is non-blocking noise. It does not prevent build, check, clean, or launcher behavior after this patch.

## Suggested PR title

`Fix local run blockers for build/check/clean and Windows launcher`

## Suggested owner review focus

- whether replacing root `turbo` wrappers with a direct task runner is acceptable for local developer workflow
- whether `shannon.cmd` should be kept as the supported Windows local entrypoint
- whether `.npmrc` should be split or scoped to avoid `npm` warnings in mixed tool setups
