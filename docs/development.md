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

Monitor progress:

```bash
npx @keygraph/shannon logs <workspace>
npx @keygraph/shannon status
npx @keygraph/shannon version
```

Source-build equivalents:

```bash
./shannon logs <workspace>
./shannon status
./shannon version
```

Open the Temporal Web UI for detailed monitoring:

```bash
open http://localhost:8233
```

Stop Shannon:

```bash
npx @keygraph/shannon stop
npx @keygraph/shannon stop --clean       # confirms first; add --yes (or -y) to skip
npx @keygraph/shannon uninstall          # confirms first; add --yes (or -y) to skip
```

Source-build equivalents:

```bash
./shannon stop
./shannon stop --clean                   # add --yes (or -y) to skip the confirmation
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

# List all workspaces.
npx @keygraph/shannon workspaces
```

Source-build examples:

```bash
./shannon start -u https://example.com -r /path/to/repo
./shannon start -u https://example.com -r /path/to/repo -c /path/to/my-config.yaml
./shannon start -u https://example.com -r /path/to/repo -o ./my-reports
./shannon start -u https://example.com -r /path/to/repo -w q1-audit
./shannon workspaces

# Rebuild the worker image.
./shannon build --no-cache
```

## Output and Results

Results are saved to the workspaces directory:

- `./workspaces/` in source-build mode
- `~/.shannon/workspaces/` in `npx` mode

Use `-o <path>` to copy deliverables to a custom output directory after a run completes.

Output structure — the run directory's top level holds only the final report; everything else is nested under a hidden `.shannon/` directory:

```text
workspaces/{hostname}_{sessionId}/
|-- Security-Assessment-Report.md   # the final report (the deliverable)
`-- .shannon/                       # internals
    |-- deliverables/               # report source, per-phase analysis, queues
    |-- agents/                     # per-agent logs
    |-- prompts/                    # rendered prompts
    |-- scratchpad/                 # screenshots, scripts
    |-- session.json                # resume state
    `-- workflow.log
```
