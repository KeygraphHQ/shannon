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
npx @keygraph/shannon status <workspace>
npx @keygraph/shannon scans
npx @keygraph/shannon version
```

Source-build equivalents:

```bash
./shannon logs [<workspace>]                 # the combined live log (unchanged default)
./shannon logs [<workspace>] --agent <name>  # tail one agent's own log
./shannon logs [<workspace>] --list-agents   # list the agents with their own log
./shannon status [<workspace>]
./shannon scans
./shannon version
```

Every scan writes one combined `.shannon/workflow.log` and a per-agent projection of it under
`.shannon/agents/`: one file per pipeline agent (`recon.log`, `xss-vuln.log`, …) and one per Capella
stage (`agentic-sast-research.log`, …). Delegated subagents fold into their parent's file, and a
Capella stage's concurrent sessions share its file with an inline session label. The combined log
stays canonical; the per-agent files are best-effort projections.

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
    |-- agents/                     # per-agent log projections, one file per agent/Capella stage
    |-- prompts/                    # rendered prompts
    |-- scratchpad/                 # screenshots, scripts
    |-- session.json                # resume state
    `-- workflow.log
```
