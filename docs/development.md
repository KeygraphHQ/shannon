# Source Build and CLI Commands

This guide covers the source-build workflow, common CLI commands, repository paths, and output locations. For the fastest first run, use the `npx` workflow in the main README.

## Prerequisites

- Docker
- Node.js 18+
- pnpm
- AI provider credentials

## Clone and Build

Use the source-build workflow if you want to run Shannon from a local clone, modify the open-source CLI, or keep the worker image built locally.

```bash
# 1. Clone Shannon.
git clone https://github.com/KeygraphHQ/shannon.git
cd shannon

# 2. Configure credentials.
cp .env.example .env

# 3. Install dependencies and build.
pnpm install
pnpm build

# 4. Run a pentest.
./shannon start -u https://your-app.com -r /path/to/your-repo
```

At minimum, your `.env` file should include one supported AI provider credential, such as:

```bash
ANTHROPIC_API_KEY=your-api-key
```

Environment variables can also be exported directly:

```bash
export ANTHROPIC_API_KEY="your-api-key"
```

## Prepare Your Repository

Shannon can scan any repository on your machine. Pass an absolute or relative path with `-r`.

```bash
npx @keygraph/shannon start -u https://example.com -r /path/to/repo
./shannon start -u https://example.com -r ./relative/path
```

The target repository is mounted read-only inside the worker container.

## Common Commands

### Saved report tools

The source checkout also includes local tools for existing black-box report bundles. These commands require Node.js 22 or newer and pnpm 10.33.0, as pinned by the root package. They do not require Docker, provider credentials, or a running application.

Help is available before installing dependencies:

```sh
node scripts/reports.mjs --help
```

Install the locked dependencies, build, and check a saved bundle:

```sh
pnpm install --frozen-lockfile
pnpm --filter @shannon/worker build
pnpm --silent reports check "path/to/deliverables"
```

Use `reports archive` for an exact private copy or `reports share` for a separate sanitized summary. Both require a new destination. To inventory a saved-report tree and create an offline browser:

```sh
pnpm --silent reports catalog workspaces
pnpm --silent reports library workspaces output/report-library-2026-09-07
```

Ensure `output` exists and choose a new destination outside `workspaces`. The library contains private folder metadata and is a static snapshot, not a sanitized share. See [the local report library](report-library.md) for discovery limits, result interpretation and current evidence; [saved report tools](report-bundles.md) covers individual bundles. [Reporting readiness](reporting-readiness.md) records platform acceptance and limitations. These are source-checkout commands; the published `npx @keygraph/shannon` package does not include this local addition.

### Assessment commands

Monitor progress:

```bash
npx @keygraph/shannon logs <workspace>
npx @keygraph/shannon status <workspace>
npx @keygraph/shannon scans
npx @keygraph/shannon version
```

Source-build equivalents:

```bash
./shannon logs <workspace>
./shannon status <workspace>
./shannon scans
./shannon version
```

Open the Temporal Web UI for detailed monitoring:

```bash
open http://localhost:8233
```

Stop Shannon:

```bash
npx @keygraph/shannon stop <workspace>   # stop one scan (confirms first; add --yes/-y to skip)
npx @keygraph/shannon stop --all         # stop all scans (Temporal stays up)
npx @keygraph/shannon reset              # stop everything and wipe all Temporal data (type 'confirm' to proceed; cannot be skipped)
```

Source-build equivalents:

```bash
./shannon stop <workspace>               # stop one scan (confirms first; add --yes/-y to skip)
./shannon stop --all                     # stop all scans (Temporal stays up)
./shannon reset                          # stop everything and wipe all Temporal data (type 'confirm' to proceed; cannot be skipped)
```

Usage examples:

```bash
# Basic pentest.
npx @keygraph/shannon start -u https://example.com -r /path/to/repo

# With a configuration file.
npx @keygraph/shannon start -u https://example.com -r /path/to/repo -c /path/to/my-config.yaml

# Custom output directory.
npx @keygraph/shannon start -u https://example.com -r /path/to/repo -o ./my-reports

# Named workspace.
npx @keygraph/shannon start -u https://example.com -r /path/to/repo -w q1-audit

# Stream the log until the scan finishes, then exit on its outcome (useful in CI).
npx @keygraph/shannon start -u https://example.com -r /path/to/repo --follow

# List completed scans.
npx @keygraph/shannon scans
```

Source-build examples:

```bash
./shannon start -u https://example.com -r /path/to/repo
./shannon start -u https://example.com -r /path/to/repo -c /path/to/my-config.yaml
./shannon start -u https://example.com -r /path/to/repo -o ./my-reports
./shannon start -u https://example.com -r /path/to/repo -w q1-audit
./shannon start -u https://example.com -r /path/to/repo --follow
./shannon scans

# Rebuild the worker image.
./shannon build --no-cache
```

## Output and Results

Results are saved to the workspaces directory:

- `./workspaces/` in source-build mode
- `~/.shannon/workspaces/` in `npx` mode

Use `-o <path>` to copy deliverables to a custom output directory after a run completes.

Output structure — the run directory's top level holds the final report, in PDF and Markdown; everything else is nested under a hidden `.shannon/` directory:

```text
workspaces/{hostname}_{sessionId}/
|-- Security-Assessment-Report.pdf  # the final report (PDF)
|-- Security-Assessment-Report.md   # the final report (Markdown)
`-- .shannon/                       # internals
    |-- deliverables/               # report source, per-phase analysis, queues
    |-- agents/                     # per-agent logs
    |-- prompts/                    # rendered prompts
    |-- scratchpad/                 # screenshots, scripts
    |-- session.json                # resume state
    `-- workflow.log
```
