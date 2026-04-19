# Run Blocker Fixes

## Summary

This file documents the reproducible run blockers found in this repository, the fixes applied, and the validation performed after patching.

Date checked: 2026-04-19
Environment checked: Windows PowerShell, Node.js v24.14.1

## Issues Found

### 1. Root workspace commands failed before package code ran

Affected commands:
- `corepack pnpm build`
- `corepack pnpm check`

Observed failure:
- `turbo` failed with `Unable to find package manager binary: cannot find binary path`

Impact:
- The documented root workflow could not build or check the monorepo from the repo root in this environment.

Root cause:
- Root scripts depended on `turbo run ...`, and `turbo` could not resolve the package-manager binary correctly in this setup.

### 2. Local launcher behavior was broken for the repo entry script

Affected file:
- `shannon`

Observed behavior:
- `.\shannon help` in PowerShell produced no output.
- `node shannon help` worked reliably.

Impact:
- The documented local clone entrypoint was unreliable, especially on Windows.

Root cause:
- The launcher used a dynamic import without awaiting it, which made the entry script fragile as a direct local launcher.

### 3. Package clean scripts were Unix-only

Affected files:
- `apps/cli/package.json`
- `apps/worker/package.json`

Observed behavior:
- `clean` scripts used `rm -rf dist`

Impact:
- Cleanup commands were not cross-platform and would fail on standard Windows shells.

Root cause:
- Shell scripts assumed a Unix environment.

### 4. Windows local clone workflow was not explicitly supported at the repo root

Impact:
- PowerShell and Command Prompt users did not have a dedicated launcher path for local mode.

Root cause:
- The repo only had the `shannon` script and no Windows wrapper alongside it.

## Patches Applied

### Root task runner

Added:
- [scripts/run-workspace-task.mjs](H:\0 Cyber security\_PROJECTX\shannon-main\scripts\run-workspace-task.mjs)

Changed:
- [package.json](H:\0 Cyber security\_PROJECTX\shannon-main\package.json)

Patch:
- Replaced root `build`, `check`, and `clean` scripts so they no longer depend on `turbo`.
- The new runner executes workspace tasks directly:
  - worker build/check via TypeScript CLI
  - cli build via `tsdown`
  - clean via Node-based recursive delete

Reason:
- This removes the package-manager-resolution failure path and makes root commands work predictably in this environment.

### Cross-platform clean scripts

Changed:
- [apps/cli/package.json](H:\0 Cyber security\_PROJECTX\shannon-main\apps\cli\package.json)
- [apps/worker/package.json](H:\0 Cyber security\_PROJECTX\shannon-main\apps\worker\package.json)

Patch:
- Replaced `rm -rf dist` with:

```bash
node -e "import('node:fs').then(fs => fs.rmSync('dist', { recursive: true, force: true }))"
```

Reason:
- Works on Windows and Unix without requiring shell-specific commands.

### Local launcher fix

Changed:
- [shannon](H:\0 Cyber security\_PROJECTX\shannon-main\shannon)

Patch:
- Changed:

```js
import('./apps/cli/dist/index.mjs');
```

- To:

```js
await import('./apps/cli/dist/index.mjs');
```

Reason:
- Ensures the local entrypoint waits for the CLI module to execute.

### Windows launcher support

Added:
- [shannon.cmd](H:\0 Cyber security\_PROJECTX\shannon-main\shannon.cmd)

Patch:
- Added a Windows wrapper that sets `SHANNON_LOCAL=1` and runs the built CLI directly.

Reason:
- Gives PowerShell and Command Prompt a supported local entrypoint.

### Documentation update

Changed:
- [README.md](H:\0 Cyber security\_PROJECTX\shannon-main\README.md)

Patch:
- Updated Clone and Build instructions to use:
  - `corepack pnpm install`
  - `npm run build`
- Added Windows note:
  - use `.\shannon.cmd` in PowerShell or Command Prompt

Reason:
- Aligns the docs with the patched local workflow.

## Validation Performed

Validated successfully after patching:
- `npm run clean`
- `npm run build`
- `npm run check`
- `node shannon help`
- `.\shannon.cmd help`

Observed remaining non-blocking issue:
- `npm` prints warnings because [`.npmrc`](H:\0 Cyber security\_PROJECTX\shannon-main\.npmrc) contains `pnpm`-specific config keys:
  - `auto-install-peers`
  - `strict-peer-dependencies`
  - `minimum-release-age`

This is noise only. It does not block build, check, clean, or launcher behavior after the patch.

## Current Status

Fixed:
- Root build/check/clean execution path
- Cross-platform clean scripts
- Local launcher reliability
- Windows local launcher support

Not addressed in this patch set:
- Docker/Temporal runtime bugs inside the pentest pipeline
- Any application-level logic bug beyond the run blockers above
