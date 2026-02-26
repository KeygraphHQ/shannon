# Shannon Pentesting Skill

Integrate Shannon (AI-powered autonomous penetration testing framework) with OpenClaw.

## What Shannon Does

Shannon is an autonomous AI pentester that:
- Performs white-box code analysis + black-box dynamic exploitation
- Finds and validates Injection, XSS, SSRF, and Auth bypass vulnerabilities
- Uses "proof-by-exploitation" — only reports what it can actually exploit
- Achieved 96.15% success rate on XBOW Benchmark
- Runs in 4 phases: Recon → Vuln Analysis → Exploitation → Reporting

## Quick Start

### Setup (one-time)

1. Clone Shannon to a location of your choice:
```bash
cd /home/opc/.openclaw/workspace
git clone https://github.com/Admuad/shannon.git
```

2. Configure your API key in Shannon's `.env`:
```bash
cd /home/opc/.openclaw/workspace/shannon
cat > .env << 'EOF'
ANTHROPIC_API_KEY=your-api-key
CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
EOF
```

3. Make sure Docker is running (Shannon uses Temporal via Docker Compose)

4. Update `~/.openclaw/workspace/TOOLS.md` with your Shannon installation path:
```markdown
### Shannon

- install_path: /home/opc/.openclaw/workspace/shannon
```

### Trigger a Pentest

```
Run a Shannon pentest on https://example.com using the repo at /path/to/repo
```

The skill will:
- Clone/copy the target repo to Shannon's `./repos/` directory if needed
- Start the pentest workflow
- Monitor progress
- Send results when complete

### Monitor Progress

```
Check the status of the current Shannon pentest
```

```
Show the logs for pentest ID example-com_shannon-1234567890
```

### View Results

```
Show the pentest report for workspace my-audit
```

```
Summarize the vulnerabilities found in the latest pentest
```

### Schedule Regular Scans

```
Schedule a Shannon pentest every Monday at 9 AM for https://myapp.com using repo my-app
```

This will create a cron job that:
- Runs pentests weekly
- Sends a summary report to your chat
- Creates a new workspace for each run

## Usage Patterns

### Basic Pentest
```
Pentest https://example.com with repo example-app
```

### With Configuration
If you have a custom config file (e.g., for authenticated testing):
```
Pentest https://example.com with repo example-app using config ./my-config.yaml
```

### Named Workspace (for resuming)
```
Pentest https://example.com with repo example-app named q1-security-audit
```

### Resume Previous Run
```
Resume the Shannon pentest for workspace q1-security-audit
```

## Output

Pentest results are saved to:
- `audit-logs/{hostname}_{sessionId}/` - Full workspace with logs and reports
- `deliverables/comprehensive_security_assessment_report.md` - Final pentest report

The skill will:
- Send a summary to your chat when complete
- Include key findings and severity levels
- Provide paths to full reports and PoCs

## Requirements

- Docker and Docker Compose (Shannon runs via Docker)
- AI Provider API key:
  - **Anthropic** (recommended) - Get from https://console.anthropic.com
  - **Or use alternative providers** via Router Mode:
    - OpenAI (GPT models)
    - OpenRouter (Gemini models)
    - **Z.AI (GLM models)** - Get from https://docs.z.ai
- Target application source code (white-box testing only)
- ~1-1.5 hours per full pentest run
- API costs vary by provider and model choice

## Important Notes

⚠️ **DO NOT run on production environments** — Shannon actively exploits vulnerabilities, which can:
- Create, modify, or delete data
- Create new users (potentially with admin privileges)
- Trigger unintended side effects from injection attacks

Always run on:
- Staging environments
- Local development instances
- Dedicated test infrastructure

You must have **explicit authorization** to test any application.

## Cron Scheduling

For scheduled pentests, the skill uses OpenClaw's cron system. Example schedules:

- **Daily at 2 AM:** `0 2 * * *`
- **Weekly Monday at 9 AM:** `0 9 * * 1`
- **First day of month:** `0 0 1 * *`

Scheduled runs will:
- Create timestamped workspaces (e.g., `myapp_2026-02-26`)
- Send a summary when complete
- Not interfere with manual runs

## Troubleshooting

### Shannon containers won't start
```bash
cd /path/to/shannon
./shannon logs
```
Check Docker logs for container issues.

### Workflow stuck
```bash
cd /path/to/shannon
./shannon logs ID=<workflow-id>
```
Or check the Temporal Web UI at `http://localhost:8233`

### Repo not found
Make sure the repo is in Shannon's `./repos/` directory:
```bash
cp -r /path/to/my-repo /path/to/shannon/repos/my-repo
# or
git clone https://github.com/org/repo.git /path/to/shannon/repos/my-repo
```

### API rate limits
If you hit Anthropic rate limits:
- Use `CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000` in `.env`
- Reduce `max_concurrent_pipelines` in your config (default: 5)
- Consider subscription retry preset for longer recovery windows

## Integration with OpenClaw

This skill provides:
1. **Chat interface** — Trigger and monitor pentests naturally
2. **Cron scheduling** — Automated security scans
3. **Results delivery** — Get summaries in your chat
4. **Workspace management** — Resume and track multiple scans

For CI/CD integration, consider using Shannon's native Docker/CLI directly in your pipeline.

## More Info

- Shannon repo: https://github.com/Admuad/shannon
- Original project: https://github.com/KeygraphHQ/shannon
- Discord: https://discord.gg/KAqzSHHpRt
