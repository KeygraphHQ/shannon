# CLAUDE.md

AI-powered penetration testing agent for defensive security analysis. Automates vulnerability assessment by combining reconnaissance tools with AI-powered code analysis.

## Commands

**Prerequisites:** Docker, AI provider credentials (`.env` for local, `npx @keygraph/shannon setup` or env vars for npx)

### Dual CLI

Shannon supports two CLI modes, auto-detected based on the current working directory:

| | **npx** (`npx @keygraph/shannon`) | **Local** (`./shannon`) |
|---|---|---|
| **Install** | Zero-install via npm | Clone the repo |
| **Image** | Pulled from Docker Hub (`keygraph/shannon:latest`) | Built locally (`shannon-worker`) |
| **State** | `~/.shannon/` | Project directory |
| **Credentials** | `~/.shannon/config.toml` (via `npx @keygraph/shannon setup`) or env vars | `./.env` |
| **Config** | `~/.shannon/config.toml` (via `npx @keygraph/shannon setup`) | N/A |
| **Prompts** | Bundled in Docker image | Mounted from `./apps/worker/prompts/` (live-editable) |

Mode auto-detection: local mode activates when env var `SHANNON_LOCAL=1` is set by the `./shannon` entry point (`apps/cli/src/mode.ts`). Otherwise npx mode.

### npx Quick Start

```bash
# Configure credentials (interactive wizard)
npx @keygraph/shannon setup

# Or export env vars directly (non-interactive / CI)
export ANTHROPIC_API_KEY=your-key

# Run
npx @keygraph/shannon start -u <url> -r /path/to/repo
```

### Local (Development) Quick Start

```bash
# Setup
echo "ANTHROPIC_API_KEY=your-key" > .env

# Build (auto-runs if image missing)
./shannon build

# Run
./shannon start -u <url> -r ./my-repo
./shannon start -u <url> -r ./my-repo -c ./apps/worker/configs/my-config.yaml
./shannon start -u <url> -r /any/path/to/repo
```

### Common Commands

```bash
# Setup (npx mode only — one-time credential configuration)
npx @keygraph/shannon setup

# Workspaces & Resume
./shannon start -u <url> -r ./my-repo -w my-audit    # New named workspace
./shannon start -u <url> -r ./my-repo -w my-audit    # Resume (same command)

# Monitor
./shannon scans                       # List running and completed scans, with each report's path
./shannon logs [<workspace>]          # Show a scan's live log (default: the single running scan, else the most recent)
./shannon logs [<workspace>] --agent <name>   # Tail one agent's own log (from .shannon/agents/)
./shannon logs [<workspace>] --list-agents    # List the agents that have their own log
./shannon status [<workspace>]        # Live phase/agent progress of one scan, read from Temporal (redraws, then exits; same default target)
# Dashboard: http://localhost:8233

# Stop
./shannon stop [<workspace>]          # Stop one scan (default: the single running scan; confirms first; --yes/-y to skip)
./shannon stop --all                  # Stop all running scans (Temporal stays up; confirms first)
./shannon reset                       # Stop everything and wipe all Temporal data + volumes (type 'confirm' to proceed; cannot be skipped)

# Version
./shannon version                     # npx: package version; local: git SHA

# Image management
./shannon build [--no-cache]          # Local mode: build worker image

# Build TypeScript (development)
pnpm run build                       # Build all packages via Turborepo
pnpm run check                       # Type-check all packages
pnpm biome                           # Biome lint + format + import sorting check
pnpm biome:fix                       # Auto-fix lint, format, and import sorting
```

**Monorepo tooling:** pnpm workspaces, Turborepo for task orchestration, Biome for linting/formatting. TypeScript compiler options shared via `tsconfig.base.json` at the root. All packages extend it, overriding only `rootDir` and `outDir`. Shared devDependencies (`typescript`, `@types/node`, `turbo`, `@biomejs/biome`) are hoisted to the root workspace.

**Options:** `-c <file>` (YAML config), `-o <path>` (output directory), `-w <name>` (named workspace; auto-resumes if exists), `--pipeline-testing` (minimal prompts, 10s retries), `--keep-container` (preserve worker container after exit for log inspection), `--yes`/`-y` (skip the confirmation prompt on `stop`; required for non-interactive use; `reset` requires a typed `confirm` and cannot be skipped)

## Architecture

### Monorepo Layout

```
apps/cli/        — @keygraph/shannon (published to npm, bundled with tsdown)
apps/worker/     — @shannon/worker (private, Temporal worker + pipeline logic)
```

### CLI Package (`apps/cli/`)
Published as `@keygraph/shannon` on npm. Contains Docker orchestration logic plus a read-only `@temporalio/client` reader (for `status`); no worker/pipeline business logic or prompts. Bundled with tsdown for single-file ESM output (deps stay external).

- `apps/cli/src/index.ts` — CLI dispatcher (`setup`, `start`, `stop`, `reset`, `logs`, `status`, `scans`, `build`, `version`)
- `apps/cli/src/temporal-client.ts` — `@temporalio/client` reader for `status`: connects to the frontend on `127.0.0.1:7233` (published by compose), `describeScan` (status + `pendingActivities` → running agents), `queryProgress` (live `getProgress` query → `PipelineState`), `getTerminalOutcome` (workflow `result()`). No worker of its own; scans are visible within Temporal's retention window, which `ensureInfra` (`apps/cli/src/docker.ts`) converges to `168h` (7 days) on every successful `shannon start` — override with `SHANNON_TEMPORAL_RETENTION` (a positive whole-hour value like `72h`)
- `apps/cli/src/scan/` — `status` rendering: `pipeline.ts` (static phase/agent plan + `run*Agent` activity-type→agent map + mirrored `PipelineState`/`AgentMetrics` types; keep in sync with the worker), `render.ts` (one renderer for both the live query state and the terminal result)
- `apps/cli/src/mode.ts` — Auto-detection: local mode if `SHANNON_LOCAL=1` env var is set
- `apps/cli/src/docker.ts` — Compose lifecycle, image pull/build, ephemeral `docker run` worker spawning
- `apps/cli/src/home.ts` — State directory management (`~/.shannon/` for npx, `./` for local)
- `apps/cli/src/env.ts` — `.env` loading, TOML fallback (npx only) via `apps/cli/src/config/resolver.ts`, credential validation, provider-scoped env flag building
- `apps/cli/src/model-spec.ts` — `SHANNON_AI_MODEL` (`<provider>:<model-id>`) parsing; mirrors `apps/worker/src/ai/models.ts`
- `apps/cli/src/config/resolver.ts` — Cascading config (npx only): env vars → `~/.shannon/config.toml` (parsed with `smol-toml`)
- `apps/cli/src/config/writer.ts` — TOML serialization and secure file persistence (0o600)
- `apps/cli/src/commands/setup.ts` — Interactive TUI wizard (`@clack/prompts`) for provider credential setup (npx only)
- `apps/cli/src/paths.ts` — Repo/config path resolution (any absolute or relative path)
- `apps/cli/src/version.ts` — Version reporting (npx: `package.json` version; local: `git-<sha>`)
- `apps/cli/src/tty.ts` — Terminal capability detection: `requireInteractive` guard (fails fast off-TTY instead of hanging on a prompt), `supportsColor` color gating (`NO_COLOR`/`FORCE_COLOR`), and `stdoutIsTerminal` for spinner/cursor output
- `apps/cli/src/commands/` — Command handlers
- `apps/cli/infra/compose.yml` — Bundled Temporal compose file for npx mode
- `apps/cli/tsdown.config.ts` — tsdown bundler config
- `shannon` — Node.js entry point (`#!/usr/bin/env node`) that delegates to `apps/cli/dist/index.mjs`

### Docker Architecture
Infra (Temporal) runs via `docker-compose.yml`. Workers are ephemeral `docker run --rm` containers, one per scan, each with a unique task queue and isolated volume mounts.

- `docker-compose.yml` — Infra only: `shannon-temporal` (port 7233/8233). Network: `shannon-net`
- `Dockerfile` — 2-stage build (builder + Chainguard Wolfi runtime). Uses pnpm. Entrypoint: `CMD ["node", "apps/worker/dist/temporal/worker.js"]`
- No `docker-compose.docker.yml` — host gateway handled via `--add-host` flag in CLI
- `/etc/hosts` forwarding — at worker spawn, `forwardEtcHostsFlags` in `apps/cli/src/docker.ts` reads the host's `/etc/hosts` and emits one `--add-host` flag per valid user-added entry. Loopback IPs (`127.x`, `::1`) are rewritten to `host-gateway`; IPv6 addresses are bracketed. Disable per-scan via `SHANNON_FORWARD_HOSTS=false`. No-op on Windows native (WSL2 reads its own `/etc/hosts` via the Linux path).

### Worker Package (`apps/worker/`)
- `apps/worker/src/paths.ts` — Centralized path constants (`PROMPTS_DIR`, `CONFIGS_DIR`, `WORKSPACES_DIR`)
- `apps/worker/src/session-manager.ts` — Agent definitions (`AGENTS` record). Agent types in `apps/worker/src/types/agents.ts`
- `apps/worker/src/config-parser.ts` — YAML config parsing with JSON Schema validation
- `apps/worker/src/ai/pi/pi-executor.ts` — pi harness integration (agent-level retry disabled so Temporal owns restarts; provider-level retry on, see `apps/worker/src/ai/pi/retry-settings.ts`)
- `apps/worker/src/services/` — Business logic layer (Temporal-agnostic). Activities delegate here. Key: `agent-execution.ts`, `error-handling.ts`, `container.ts`
- `apps/worker/src/types/` — Consolidated types: `Result<T,E>`, `ErrorCode`, `AgentName`, `ActivityLogger`, etc.
- `apps/worker/src/utils/` — Shared utilities (file I/O, formatting, concurrency)

### Temporal Orchestration
Durable workflow orchestration with crash recovery, queryable progress, intelligent retry, and parallel execution (5 concurrent agents in vuln/exploit phases).

- `apps/worker/src/temporal/workflows.ts` — Main workflow (`pentestPipelineWorkflow`)
- `apps/worker/src/temporal/activities.ts` — Thin wrappers — heartbeat loop, error classification, container lifecycle. Business logic delegated to `apps/worker/src/services/`
- `apps/worker/src/temporal/activity-logger.ts` — `TemporalActivityLogger` implementation of `ActivityLogger` interface
- `apps/worker/src/temporal/summary-mapper.ts` — Maps `PipelineSummary` to `WorkflowSummary`
- `apps/worker/src/temporal/worker.ts` — Combined worker + client entry point (per-invocation task queue, submits workflow, waits for result)
- `apps/worker/src/temporal/shared.ts` — Types, interfaces, query definitions
### Five-Phase Pipeline

1. **Pre-Recon** (`pre-recon`) — Source code analysis to build the architectural baseline
2. **Recon** (`recon`) — Attack surface mapping from initial findings
3. **Vulnerability Analysis** (5 parallel agents) — injection, xss, auth, authz, ssrf
4. **Exploitation** (5 parallel agents, conditional) — Exploits confirmed vulnerabilities
5. **Reporting** (`report`) — Executive-level security report

Around those phases:

- Optional agentic static analysis runs before the pentest when `agentic_sast.enabled` is `"true"`, as a child workflow.
- After each class's analysis, reconciliation groups its findings into exploitation tasks.
- Findings outside the five classes form an internal `miscellaneous` class with its own exploitation agent (`miscellaneous-exploit`).
- A scan can finish `completed`, `partial`, `failed`, or `cancelled`; `partial` carries an ordered set of reasons.

### Supporting Systems
- **Configuration** — YAML configs in `apps/worker/configs/` use the closed JSON Schema in `config-schema.json`. Every fresh scan runs the fixed five analysis classes; there is no public class selector. `agentic_sast.enabled` is the only public agentic-SAST setting. Finding reconciliation runs on every scan and has no public setting of its own. Config also supports authentication (MFA/TOTP), URL/code rule scoping (`rules.avoid`/`rules.focus`), `exploit`, free-form `rules_of_engagement`, and post-hoc `report` options (`min_severity`, `min_confidence`, `guidance`, and exploit-only `sarif` output via `apps/worker/src/services/sarif-renderer.ts`, on by default for exploit runs and opt out with `report.sarif: "false"`). `code_path` avoid rules are enforced via the `@gotgenes/pi-permission-system` extension: `apps/worker/src/temporal/activities.ts:syncCodePathDenyRules` writes a global `path` deny config once per workflow (`apps/worker/src/ai/pi/permission-system.ts:syncPermissionSystemConfig`), and the executor loads the extension when that config is present (`apps/worker/src/ai/pi/pi-executor.ts`), so denies fire across every tool and child `task` session. Credential resolution — local mode: env vars → `./.env`; npx mode: env vars → `~/.shannon/config.toml` (via `npx @keygraph/shannon setup`)
- **Prompts** — Per-phase templates in `apps/worker/prompts/` with variable substitution (`{{TARGET_URL}}`, `{{CONFIG_CONTEXT}}`). Shared partials in `apps/worker/prompts/shared/` via `apps/worker/src/services/prompt-manager.ts`, including `_code-path-rules.txt` (focus/avoid `[FILE]`/`[GLOB]` routing) and `_rules-of-engagement.txt` (free-text engagement rules). When `exploit: false`, `apps/worker/src/services/findings-renderer.ts` deterministically converts each `*_exploitation_queue.json` into a `*_findings.md` for report assembly — no LLM in the loop
- **Agent Harness (pi)** — Uses the **pi harness** (`@earendil-works/pi-coding-agent`, requires Node ≥ 22.19) via `apps/worker/src/ai/pi/pi-executor.ts` (`runPiPrompt` → `createAgentSession`). Retry is split in `apps/worker/src/ai/pi/retry-settings.ts`: pi's agent-level loop is off so Temporal owns agent restarts, while `provider.maxRetries` stays on — pi reads the `provider` block independently of the `enabled` flag — so transport faults are absorbed in-session rather than costing a full agent re-run. `maxRetryDelayMs` is left at pi's 60s default. One model runs every phase, named by `SHANNON_AI_MODEL=<provider>:<model-id>` (default `anthropic:claude-sonnet-4-6`). `apps/worker/src/ai/models.ts` parses the spec — splitting on the **first** colon only, so Bedrock IDs keep theirs — and resolves it through pi's `ModelRuntime`. pi ships the `CredentialStore` interface but no in-memory implementation (its own reads `auth.json` from disk), so `RuntimeCredentialStore` in that file supplies one: credentials arrive as env vars in an ephemeral container and must never touch disk. `createModelRuntime(providerId, apiKey)` builds the runtime; `allowModelNetwork` stays at its default `false` so a scan never blocks on a catalog refresh. `resolveModelSelection()` is **async** because `ModelRuntime.create()` is. Any pi-ai provider id is accepted — `parseModelSpec` no longer rejects against a hardcoded list, so pi's registry is the authority (an unknown provider/model surfaces as a clear "not found in pi registry" error at preflight, which points to the browsable catalogue at `pi.dev/models` — `PI_CATALOG_URL` in `apps/worker/src/ai/models.ts`, appended to the not-found errors and shown in the setup wizard's "Other provider" hint). Four providers are **curated** (`CURATED_PROVIDERS`: `anthropic`, `openai`, `xai`, `amazon-bedrock`) with their own credential variables, config sections, and setup flows; each provider's API key env var is declared once in `PROVIDER_API_KEY_ENV` — Shannon uses each vendor's own variable name (`OPENAI_API_KEY`, `XAI_API_KEY`, …), never an invented one; Bedrock's entry is `AWS_BEARER_TOKEN_BEDROCK`, paired with `AWS_REGION`, which preflight requires separately as provider config rather than a credential. Any other provider uses the **generic** credential path: `SHANNON_AI_API_KEY` (`GENERIC_API_KEY_ENV`) supplies the key for any provider whose credential is a plain API key. Curated providers' own variables take precedence over it, and it also works as a fallback for them — Bedrock is the sole exception (it authenticates through its AWS_ variables, so the generic key never stands in for it). The CLI forwards `SHANNON_AI_API_KEY` in `COMMON_FORWARD_VARS` (it is provider-neutral, binding to whatever `SHANNON_AI_MODEL` names, so the "only one provider configured" guard counts only named credentials), and stores it under a generic `[provider]` config.toml section (`provider.api_key`). `npx @keygraph/shannon setup` exposes this as the "Other provider" option: free-text provider id + model id + key (a curated provider id is rejected there, since it has its own option). `SHANNON_AI_BASE_URL` overrides the endpoint for any provider (proxies/gateways); the credential is unchanged. `pointAtGateway` (`apps/worker/src/ai/models.ts`) applies the one dialect change: behind a base URL, `openai` follows `SHANNON_AI_OPENAI_FORMAT` (`chat-completions` default, or `responses`). On `chat-completions` it switches the API to `openai-completions` and drops the catalogue's Responses-shaped `compat` block so pi's `detectCompat` derives completions settings; on `responses` the descriptor is unchanged but for the endpoint. `resolveGatewayFormat` rejects the variable when the provider is not `openai` or no base URL is set, since it cannot take effect there. All other providers keep their API. The CLI mirrors the accepted values in `apps/cli/src/model-spec.ts`, forwards the variable in `COMMON_FORWARD_VARS`, and maps it to `openai.format` in config.toml. `buildEnvFlags` forwards only the selected provider's credential into the worker container. The CLI mirrors the parse rule and the provider/credential tables in `apps/cli/src/model-spec.ts` (it cannot import from the worker package); the two must stay in sync. pi ships no JSON-schema output or `Task`/`TodoWrite` built-ins, so structured queues are captured via a `submit_exploitation_queue` custom tool (`apps/worker/src/ai/queue-schemas.ts`), and `task` (child sessions scoped to `read`, `grep`, `find`, `ls`, `write`, and `bash` — no nested `task` or collector tools; `CHILD_TOOLS` in `apps/worker/src/ai/pi/task-tool.ts`) + `todo_write` (`apps/worker/src/ai/pi/session-tools.ts`) are provided as custom tools; the per-phase collectors are pi custom tools (TypeBox `defineTool` in `apps/worker/src/collectors/`). Shannon sets no thinking configuration at all — no `thinkingLevel` is passed to any `createAgentSession` call, so pi's own default applies. There is no adaptive-thinking support and no `CLAUDE_ADAPTIVE_THINKING` / `core.adaptive_thinking` setting. Browser automation via `playwright-cli` with session isolation (`-s=<session>`). TOTP generation via `generate-totp` CLI tool. Login flow template at `apps/worker/prompts/shared/login-instructions.txt` supports form, SSO, API, and basic auth. On authenticated whitebox scans, the `validate-authentication` preflight performs the single real login and saves the browser session to `auth-state.json` in the per-session audit directory (path from `authStateFile()` in `apps/worker/src/audit/utils.ts`, derived from `generateAuditPath()`). The validation activity (`apps/worker/src/services/validate-authentication.ts`) removes any stale file from a prior run before the agent runs and verifies the file parses and contains cookies or storage before the preflight is marked complete; `logWorkflowComplete` deletes it when the workflow ends so authenticated cookies don't sit on disk between scans. Agent prompts opt in to session reuse by `@include(shared/_shared-session.txt)` before their `<login_instructions>` block — the partial restores the session and falls through to the full login flow if verification fails. `vuln-auth`/`exploit-auth` omit the include and own their own login
- **Pi Credential Reuse** — `SHANNON_USE_PI_AUTH=1` opts into reusing the host's Pi login, including an `openai-codex` ChatGPT Plus/Pro subscription selected with `SHANNON_AI_MODEL=openai-codex:<model-id>`. `apps/cli/src/env.ts` requires `~/.pi/agent/auth.json`; `start.ts` passes its path to `spawnWorker`, which mounts only that file read-write at `/tmp/.pi/agent/auth.json`. The flag itself is not forwarded: the worker detects the file with `piAuthPresent()` and passes its path to `ModelRuntime.create`. CLI and worker API-key presence checks are skipped on this path, but the normal preflight model probe still validates the credential. The image and UID-remapping entrypoint keep `/tmp/.pi/agent` owned by `pentest` so adjacent Pi/Shannon configuration remains writable. Refreshed OAuth state is persisted to the host for subsequent scans.
- **Audit System** — Crash-safe append-only logging in `workspaces/{hostname}_{sessionId}/`. The run directory's top level holds the human-facing report in both formats (`Security-Assessment-Report.pdf` and `Security-Assessment-Report.md`, `FINAL_REPORT_PDF_FILENAME`/`FINAL_REPORT_MD_FILENAME` in `apps/worker/src/paths.ts`); everything else — deliverables, per-agent logs, prompts, `session.json`, `workflow.log`, and browser artifacts — is nested under a hidden `.shannon/` internals dir (`INTERNAL_DIR`) so a customer sees only the report. Audit path helpers route through `generateInternalPath` (`apps/worker/src/audit/utils.ts`); the CLI nests the overlay backing dirs under the same `.shannon/` (`apps/cli/src/docker.ts`, `start.ts`). `session.json`/`workflow.log` reads use dual-read resolvers (`resolveSessionJsonPath`, `resolveRunFile`) that prefer `.shannon/` and fall back to the legacy run-root layout, so pre-restructure workspaces stay listable (`scans`/`logs`) without migration. A pre-restructure workspace cannot be resumed: `classifyWorkspaceLaunch` (`apps/cli/src/commands/start.ts`) requires `.shannon/launch.json`, and its absence fails the launch as "created by an earlier version of Shannon" before anything on disk is touched. There is no in-place migration — the workspace's files and report are left untouched, and the operator starts a new scan under a different `-w` name. The report agent writes structured findings to `report.json`, from which `report-renderer.ts` renders the assembled markdown and `report-json-adapter.ts` produces the Typst-shaped JSON that `pdf-renderer.ts` compiles into `comprehensive_security_assessment_report.pdf` using the bundled `apps/worker/templates/typst/report.typ` template (the `typst` binary is installed in the worker image). `copyReportToRunRoot` (`apps/worker/src/services/reporting.ts`) surfaces both the PDF and the markdown to the run root as `Security-Assessment-Report.pdf` and `Security-Assessment-Report.md`; the deliverables-dir copies remain as the git-checkpointed sources. PDF compilation is best-effort — a failure is logged and the run still completes. WorkflowLogger (`apps/worker/src/audit/workflow-logger.ts`) provides unified human-readable per-workflow logs, backed by LogStream (`apps/worker/src/audit/log-stream.ts`) shared stream primitive. Every combined-log line is also projected into a per-agent file under `.shannon/agents/<slug>.log` (one per pipeline agent, one per Capella stage; subagents fold into the parent's file, and a stage's concurrent sessions share its file with an inline session label). The projection boundary is `apps/worker/src/audit/actor-projection.ts` (`projectActor` maps a `TraceActor` to its combined prefix and owning file slug — slugs come only from closed fields); fan-out is best-effort and never blocks the canonical combined log. A lifecycle owner holds a `LogStream` lease per agent file (the pipeline agent's `logAgent` span, or a Capella stage activity's `try/finally`) so per-line writes ride the reference count; `CapellaStageTrace.drain()` flushes a stage's trace queue before its activity returns. The CLI tails one file with `shannon logs --agent <name>` (`--list-agents` to enumerate); the default `shannon logs` path is unchanged
- **Deliverables** — Saved to `.shannon/deliverables/` in the target repo via the `save-deliverable` CLI script (`apps/worker/src/scripts/save-deliverable.ts`)
- **Workspaces & Resume** — Named workspaces via `-w <name>` or auto-named from URL+timestamp. Resume detects completed agents via `session.json`. `loadResumeState()` in `apps/worker/src/temporal/activities.ts` validates deliverable existence, restores git checkpoints, and cleans up incomplete deliverables

## Development Notes

### Adding a New Agent
1. Define agent in `apps/worker/src/session-manager.ts` (add to `AGENTS` record). `ALL_AGENTS`/`AgentName` types live in `apps/worker/src/types/agents.ts`
2. Create prompt template in `apps/worker/prompts/` (e.g., `vuln-newtype.txt`)
3. Two-layer pattern: add a thin activity wrapper in `apps/worker/src/temporal/activities.ts` (heartbeat + error classification). `AgentExecutionService` in `apps/worker/src/services/agent-execution.ts` handles the agent lifecycle automatically via the `AGENTS` registry
4. Register activity in `apps/worker/src/temporal/workflows.ts` within the appropriate phase

### Modifying Prompts
- Variable substitution: `{{TARGET_URL}}`, `{{CONFIG_CONTEXT}}`, `{{LOGIN_INSTRUCTIONS}}`
- Shared partials in `apps/worker/prompts/shared/` included via `apps/worker/src/services/prompt-manager.ts`
- Test with `--pipeline-testing` for fast iteration

### Key Design Patterns
- **Configuration-Driven** — YAML configs with JSON Schema validation
- **Progressive Analysis** — Each phase builds on previous results
- **Harness-First** — the pi harness (`@earendil-works/pi-coding-agent`) handles autonomous analysis
- **Modular Error Handling** — `ErrorCode` enum, `Result<T,E>` for explicit error propagation, automatic retry (3 attempts per agent)
- **Services Boundary** — Activities are thin Temporal wrappers; `apps/worker/src/services/` owns business logic, accepts `ActivityLogger`, returns `Result<T,E>`. No Temporal imports in services
- **DI Container** — Per-workflow in `apps/worker/src/services/container.ts`. `AuditSession` excluded (parallel safety)
- **Ephemeral Workers** — Each scan runs in its own `docker run --rm` container with a per-invocation task queue. Temporal routes activities by queue name, so per-scan queues ensure activities never land on a worker with the wrong repo mounted

### Security
Defensive security tool only. Use only on systems you own or have explicit permission to test.

## Code Style Guidelines

### Formatting
Biome handles formatting and linting. Run `pnpm biome:fix` to auto-fix. Config in `biome.json`: single quotes, semicolons, trailing commas, 2-space indent, 120 char line width.

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
- `exactOptionalPropertyTypes` is enabled — use spread for optional props, not direct `undefined` assignment

### Avoid
- Combining multiple concerns into a single function to "save lines"
- Dense callback chains when sequential logic is clearer
- Sacrificing readability for DRY — some repetition is fine if clearer
- Abstractions for one-time operations
- Backwards-compatibility shims, deprecated wrappers, or re-exports for removed code — delete the old code, don't preserve it

### Comments
Comments must be **timeless** — no references to this conversation, refactoring history, or the AI.

**Patterns used in this codebase:**
- `/** JSDoc */` — file headers (after license) and exported functions/interfaces
- `// N. Description` — numbered sequential steps inside function bodies. Use when a
  function has 3+ distinct phases where at least one isn't immediately obvious from the
  code. Each step marks the start of a logical phase. Reference: `AgentExecutionService.execute`
  (steps 1-9) and `injectModelIntoReport` (steps 1-5)
- `// === Section ===` — high-level dividers between groups of functions in long files,
  or to label major branching/classification blocks (e.g., `// === SPENDING CAP SAFEGUARD ===`).
  Not for sequential steps inside function bodies — use numbered steps for that
- `// NOTE:` / `// WARNING:` / `// IMPORTANT:` — gotchas and constraints

**Never:** obvious comments, conversation references ("as discussed"), history ("moved from X")

## Key Files

**CLI:** `shannon` (entry point), `apps/cli/src/index.ts` (dispatcher), `apps/cli/src/docker.ts` (orchestration), `apps/cli/src/mode.ts` (auto-detection)

**Entry Points:** `apps/worker/src/temporal/workflows.ts`, `apps/worker/src/temporal/activities.ts`, `apps/worker/src/temporal/worker.ts`

**Core Logic:** `apps/worker/src/session-manager.ts`, `apps/worker/src/ai/pi/pi-executor.ts`, `apps/worker/src/ai/pi/permission-system.ts` (writes `code_path` deny rules to the `@gotgenes/pi-permission-system` global config), `apps/worker/src/config-parser.ts`, `apps/worker/src/services/` (incl. `preflight.ts`, `findings-renderer.ts`, `reporting.ts`), `apps/worker/src/audit/`

**Config:** `docker-compose.yml`, `apps/cli/infra/compose.yml`, `apps/worker/configs/`, `apps/worker/prompts/`, `tsconfig.base.json` (shared compiler options), `turbo.json`, `biome.json`

**CI/CD:** `.github/workflows/release.yml` (Docker Hub push + npm publish + GitHub release, manual dispatch)

## Package Installation

Package managers are configured with a minimum release age (7 days). Requires pnpm >= 10.16.0. If `pnpm install` fails due to a package being too new, **do not attempt to bypass it** — report the blocked package to the user and stop.

## Troubleshooting

- **"Repository not found"** — Pass a path to the target repo (`-r /path/to/repo` or `-r ./my-repo`)
- **"Temporal not ready"** — Wait for health check or `docker compose logs temporal`
- **Worker not processing** — Check `docker ps --filter "name=shannon-worker-"`
- **Reset state** — `./shannon reset`
- **Local apps unreachable** — Use `host.docker.internal` instead of `localhost`
- **Container permissions** — On Linux, may need `sudo` for docker commands
