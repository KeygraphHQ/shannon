# CLAUDE.md

AI-powered penetration testing agent for defensive security analysis. Automates vulnerability assessment by combining reconnaissance tools with AI-powered code analysis.

## Commands

**Prerequisites:** Docker, Anthropic API key in `.env`

```bash
# Setup
cp .env.example .env && edit .env  # Set ANTHROPIC_API_KEY

# Prepare repo (REPO is a folder name inside ./repos/, not an absolute path)
git clone https://github.com/org/repo.git ./repos/my-repo
# or symlink: ln -s /path/to/existing/repo ./repos/my-repo

# Run
./shannon start URL=<url> REPO=my-repo
./shannon start URL=<url> REPO=my-repo CONFIG=./configs/my-config.yaml

# Monitor
./shannon logs                      # Real-time worker logs
./shannon query ID=<workflow-id>    # Query workflow progress
# Temporal Web UI: http://localhost:8233

# Stop
./shannon stop                      # Preserves workflow data
./shannon stop CLEAN=true           # Full cleanup including volumes

# Build
npm run build
```

**Options:** `CONFIG=<file>` (YAML config), `OUTPUT=<path>` (default: `./audit-logs/`), `PIPELINE_TESTING=true` (minimal prompts, 10s retries), `REBUILD=true` (force Docker rebuild), `ROUTER=true` (multi-model routing via [claude-code-router](https://github.com/musistudio/claude-code-router))

## Architecture

### Core Modules
- `src/session-manager.ts` — Agent definitions, execution order, parallel groups
- `src/ai/claude-executor.ts` — Claude Agent SDK integration with retry logic and git checkpoints
- `src/config-parser.ts` — YAML config parsing with JSON Schema validation
- `src/error-handling.ts` — Categorized error types (PentestError, ConfigError, NetworkError) with retry logic
- `src/tool-checker.ts` — Validates external security tool availability before execution
- `src/queue-validation.ts` — Deliverable validation and agent prerequisites

### Temporal Orchestration
Durable workflow orchestration with crash recovery, queryable progress, intelligent retry, and parallel execution (5 concurrent agents in vuln/exploit phases).

- `src/temporal/workflows.ts` — Main workflow (`pentestPipelineWorkflow`)
- `src/temporal/activities.ts` — Activity implementations with heartbeats
- `src/temporal/worker.ts` — Worker entry point
- `src/temporal/client.ts` — CLI client for starting workflows
- `src/temporal/shared.ts` — Types, interfaces, query definitions
- `src/temporal/query.ts` — Query tool for progress inspection

### Five-Phase Pipeline

1. **Pre-Recon** (`pre-recon`) — External scans (nmap, subfinder, whatweb) + source code analysis
2. **Recon** (`recon`) — Attack surface mapping from initial findings
3. **Vulnerability Analysis** (5 parallel agents) — injection, xss, auth, authz, ssrf
4. **Exploitation** (5 parallel agents, conditional) — Exploits confirmed vulnerabilities
5. **Reporting** (`report`) — Executive-level security report

### Supporting Systems
- **Configuration** — YAML configs in `configs/` with JSON Schema validation (`config-schema.json`). Supports auth settings, MFA/TOTP, and per-app testing parameters
- **Prompts** — Per-phase templates in `prompts/` with variable substitution (`{{TARGET_URL}}`, `{{CONFIG_CONTEXT}}`). Shared partials in `prompts/shared/` via `prompt-manager.ts`
- **SDK Integration** — Uses `@anthropic-ai/claude-agent-sdk` with `maxTurns: 10_000` and `bypassPermissions` mode. Playwright MCP for browser automation, TOTP generation via MCP tool. Login flow template at `prompts/shared/login-instructions.txt` supports form, SSO, API, and basic auth
- **Audit System** — Crash-safe append-only logging in `audit-logs/{hostname}_{sessionId}/`. Tracks session metrics, per-agent logs, prompts, and deliverables
- **Deliverables** — Saved to `deliverables/` in the target repo via the `save_deliverable` MCP tool

## Development Notes

### Adding a New Agent
1. Define agent in `src/session-manager.ts` (add to `AGENT_QUEUE` and parallel group)
2. Create prompt template in `prompts/` (e.g., `vuln-newtype.txt`)
3. Add activity function in `src/temporal/activities.ts`
4. Register activity in `src/temporal/workflows.ts` within the appropriate phase

### Modifying Prompts
- Variable substitution: `{{TARGET_URL}}`, `{{CONFIG_CONTEXT}}`, `{{LOGIN_INSTRUCTIONS}}`
- Shared partials in `prompts/shared/` included via `prompt-manager.ts`
- Test with `PIPELINE_TESTING=true` for fast iteration

### Key Design Patterns
- **Configuration-Driven** — YAML configs with JSON Schema validation
- **Progressive Analysis** — Each phase builds on previous results
- **SDK-First** — Claude Agent SDK handles autonomous analysis
- **Modular Error Handling** — Categorized errors with automatic retry (3 attempts per agent)

### Security
Defensive security tool only. Use only on systems you own or have explicit permission to test.

## Code Style Guidelines

### Clarity Over Brevity
- Optimize for readability, not line count — three clear lines beat one dense expression
- Use descriptive names that convey intent
- Prefer explicit logic over clever one-liners

### Structure
- Keep functions focused on a single responsibility
- Use early returns and guard clauses instead of deep nesting
- Never use nested ternary operators — use if/else or switch
- Extract complex conditions into well-named boolean variables

### TypeScript Conventions
- Use `function` keyword for top-level functions (not arrow functions)
- Explicit return type annotations on exported/top-level functions
- Prefer `readonly` for data that shouldn't be mutated

### Avoid
- Combining multiple concerns into a single function to "save lines"
- Dense callback chains when sequential logic is clearer
- Sacrificing readability for DRY — some repetition is fine if clearer
- Abstractions for one-time operations

## Key Files

**Entry Points:** `src/temporal/workflows.ts`, `src/temporal/activities.ts`, `src/temporal/worker.ts`, `src/temporal/client.ts`

**Core Logic:** `src/session-manager.ts`, `src/ai/claude-executor.ts`, `src/config-parser.ts`, `src/audit/`

**Config:** `shannon` (CLI), `docker-compose.yml`, `configs/`, `prompts/`

### Native OpenAI-Compatible Provider

Shannon supports a **native** OpenAI-compatible API path (no router) for local models and services like minimax, ollama, vLLM, etc. This bypasses the Claude Agent SDK entirely and uses direct API calls.

**Enable OpenAI provider:**
```bash
./shannon start URL=<url> REPO=<name> PROVIDER=openai AI_BASE_URL=http://localhost:8080/v1 AI_MODEL=minimax AI_API_KEY=optional
```

**Configuration (in .env):**
```bash
AI_PROVIDER=openai
AI_BASE_URL=http://localhost:8080/v1
AI_MODEL=minimax
AI_API_KEY=your-key-or-empty-for-local
```

**Benefits over router mode:** Direct API integration, no translation layer, works with any OpenAI-compatible endpoint. Supports built-in tools (bash, file read/write, search) and MCP (Shannon helper, Playwright).

## Troubleshooting

- **"Repository not found"** — `REPO` must be a folder name inside `./repos/`, not an absolute path. Clone or symlink your repo there first: `ln -s /path/to/repo ./repos/my-repo`
- **"Temporal not ready"** — Wait for health check or `docker compose logs temporal`
- **Worker not processing** — Check `docker compose ps`
- **Reset state** — `./shannon stop CLEAN=true`
- **Local apps unreachable** — Use `host.docker.internal` instead of `localhost`
- **Missing tools** — Use `PIPELINE_TESTING=true` to skip nmap/subfinder/whatweb (graceful degradation)
- **Container permissions** — On Linux, may need `sudo` for docker commands
