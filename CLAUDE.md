# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an AI-powered penetration testing agent designed for defensive security analysis. The tool automates vulnerability assessment by combining external reconnaissance tools with AI-powered code analysis to identify security weaknesses in web applications and their source code.

## Commands

### Prerequisites
- **Docker** - Container runtime
- **Anthropic API key** - Set in `.env` file

### Running the Penetration Testing Agent (Docker + Temporal)
```bash
# Configure credentials
cp .env.example .env
# Edit .env:
#   ANTHROPIC_API_KEY=your-key
#   CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000  # Prevents token limits during long reports

# Start a pentest workflow
./shannon start URL=<url> REPO=<path>
```

Examples:
```bash
./shannon start URL=https://example.com REPO=/path/to/repo
./shannon start URL=https://example.com REPO=/path/to/repo CONFIG=./configs/my-config.yaml
./shannon start URL=https://example.com REPO=/path/to/repo OUTPUT=./my-reports
```

### Monitoring Progress
```bash
./shannon logs                      # View real-time worker logs
./shannon query ID=<workflow-id>    # Query specific workflow progress
# Temporal Web UI available at http://localhost:8233
```

### Stopping Shannon
```bash
./shannon stop                      # Stop containers (preserves workflow data)
./shannon stop CLEAN=true           # Full cleanup including volumes
```

### Options
```bash
CONFIG=<file>          YAML configuration file for authentication and testing parameters
OUTPUT=<path>          Custom output directory for session folder (default: ./audit-logs/)
PIPELINE_TESTING=true  Use minimal prompts and fast retry intervals (10s instead of 5min)
REBUILD=true           Force Docker rebuild with --no-cache (use when code changes aren't picked up)
ROUTER=true            Route requests through claude-code-router for multi-model support
```

### Generate TOTP for Authentication
TOTP generation is handled automatically via the `generate_totp` MCP tool during authentication flows.

### Development Commands
```bash
# Build TypeScript
npm run build

# Run with pipeline testing mode (fast, minimal deliverables)
./shannon start URL=<url> REPO=<path> PIPELINE_TESTING=true
```

## Architecture & Components

### Core Modules
- `src/config-parser.ts` - Handles YAML configuration parsing, validation, and distribution to agents
- `src/error-handling.ts` - Comprehensive error handling with retry logic and categorized error types
- `src/tool-checker.ts` - Validates availability of external security tools before execution
- `src/session-manager.ts` - Agent definitions, execution order, and parallel groups
- `src/queue-validation.ts` - Validates deliverables and agent prerequisites

### Temporal Orchestration Layer
Shannon uses Temporal for durable workflow orchestration:
- `src/temporal/shared.ts` - Types, interfaces, query definitions
- `src/temporal/workflows.ts` - Main workflow (pentestPipelineWorkflow)
- `src/temporal/activities.ts` - Activity implementations with heartbeats
- `src/temporal/worker.ts` - Worker process entry point
- `src/temporal/client.ts` - CLI client for starting workflows
- `src/temporal/query.ts` - Query tool for progress inspection

Key features:
- **Crash recovery** - Workflows resume automatically after worker restart
- **Queryable progress** - Real-time status via `./shannon query` or Temporal Web UI
- **Intelligent retry** - Distinguishes transient vs permanent errors
- **Parallel execution** - 5 concurrent agents in vulnerability/exploitation phases

### Five-Phase Testing Workflow

1. **Pre-Reconnaissance** (`pre-recon`) - External tool scans (nmap, subfinder, whatweb) + source code analysis
2. **Reconnaissance** (`recon`) - Analysis of initial findings and attack surface mapping  
3. **Vulnerability Analysis** (5 agents run in parallel)
   - `injection-vuln` - SQL injection, command injection
   - `xss-vuln` - Cross-site scripting 
   - `auth-vuln` - Authentication bypasses
   - `authz-vuln` - Authorization flaws
   - `ssrf-vuln` - Server-side request forgery
4. **Exploitation** (5 agents run in parallel, only if vulnerabilities found)
   - `injection-exploit` - Exploit injection vulnerabilities
   - `xss-exploit` - Exploit XSS vulnerabilities  
   - `auth-exploit` - Exploit authentication issues
   - `authz-exploit` - Exploit authorization flaws
   - `ssrf-exploit` - Exploit SSRF vulnerabilities
5. **Reporting** (`report`) - Executive-level security report generation

### Configuration System
The agent supports YAML configuration files with JSON Schema validation:
- `configs/config-schema.json` - JSON Schema for configuration validation
- `configs/example-config.yaml` - Template configuration file
- `configs/juice-shop-config.yaml` - Example configuration for OWASP Juice Shop
- `configs/keygraph-config.yaml` - Configuration for Keygraph applications
- `configs/chatwoot-config.yaml` - Configuration for Chatwoot applications
- `configs/metabase-config.yaml` - Configuration for Metabase applications
- `configs/cal-com-config.yaml` - Configuration for Cal.com applications

Configuration includes:
- Authentication settings (form, SSO, API, basic auth)
- Multi-factor authentication with TOTP support
- Custom login flow instructions
- Application-specific testing parameters

### Prompt Templates
The `prompts/` directory contains specialized prompt templates for each testing phase:
- `pre-recon-code.txt` - Initial code analysis prompts
- `recon.txt` - Reconnaissance analysis prompts  
- `vuln-*.txt` - Vulnerability assessment prompts (injection, XSS, auth, authz, SSRF)
- `exploit-*.txt` - Exploitation attempt prompts
- `report-executive.txt` - Executive report generation prompts

### Claude Agent SDK Integration
The agent uses the `@anthropic-ai/claude-agent-sdk` with maximum autonomy configuration:
- `maxTurns: 10_000` - Allows extensive autonomous analysis
- `permissionMode: 'bypassPermissions'` - Full system access for thorough testing
- Playwright MCP integration for web browser automation
- Working directory set to target local repository
- Configuration context injection for authenticated testing

### Authentication & Login Resources
- `prompts/shared/login-instructions.txt` - Login flow template for all agents
- TOTP token generation via MCP `generate_totp` tool
- Support for multi-factor authentication workflows
- Configurable authentication mechanisms (form, SSO, API, basic)

### Output & Deliverables
All analysis results are saved to the `deliverables/` directory within the target local repository, including:
- Pre-reconnaissance reports with external scan results
- Vulnerability assessment findings
- Exploitation attempt results
- Executive-level security reports with business impact analysis

### External Tool Dependencies
The agent integrates with external security tools:
- `nmap` - Network port scanning
- `subfinder` - Subdomain discovery  
- `whatweb` - Web technology fingerprinting

Tools are validated for availability before execution using the tool-checker module.

### Audit & Metrics System
The agent implements a crash-safe audit system with the following features:

**Architecture:**
- **audit-logs/** (or custom `--output` path): Centralized metrics and forensic logs
  - `{hostname}_{sessionId}/session.json` - Comprehensive metrics with attempt-level detail
  - `{hostname}_{sessionId}/prompts/` - Exact prompts used for reproducibility
  - `{hostname}_{sessionId}/agents/` - Turn-by-turn execution logs
  - `{hostname}_{sessionId}/deliverables/` - Security reports and findings

**Crash Safety:**
- Append-only logging with immediate flush (survives kill -9)
- Atomic writes for session.json (no partial writes)
- Event-based logging (tool_start, tool_end, llm_response)

**Concurrency Safety:**
- SessionMutex prevents race conditions during parallel agent execution
- 5x faster execution with parallel vulnerability and exploitation phases

**Metrics & Reporting:**
- Phase-level and agent-level timing/cost aggregations
- Validation results integrated with metrics


## Development Notes

### Learning from Reference Implementations

A working POC exists at `/Users/arjunmalleswaran/Code/shannon-pocs` that demonstrates the ideal Temporal + Claude Agent SDK integration. When implementing Temporal features, agents can ask questions in the chat, and the user will relay them to another Claude Code session working in that POC directory.

**How to use this approach:**
1. When stuck or unsure about Temporal patterns, write a specific question in the chat
2. The user will ask an agent working on the POC to answer
3. The user relays the answer (code snippets, patterns, explanations) back
4. Apply the learned patterns to Shannon's codebase

**Example questions to ask:**
- "How does the POC structure its workflow to handle parallel activities?"
- "Show me how heartbeats are implemented in the POC's activities"
- "What retry configuration does the POC use for long-running agent activities?"
- "How does the POC integrate Claude Agent SDK calls within Temporal activities?"

**Reference implementation:**
- **Temporal + Claude Agent SDK**: `/Users/arjunmalleswaran/Code/shannon-pocs` - working implementation demonstrating workflows, activities, worker setup, and SDK integration

### Adding a New Agent
1. Define the agent in `src/session-manager.ts` (add to `AGENT_QUEUE` and appropriate parallel group)
2. Create prompt template in `prompts/` (e.g., `vuln-newtype.txt` or `exploit-newtype.txt`)
3. Add activity function in `src/temporal/activities.ts`
4. Register activity in `src/temporal/workflows.ts` within the appropriate phase

### Modifying Prompts
- Prompt templates use variable substitution: `{{TARGET_URL}}`, `{{CONFIG_CONTEXT}}`, `{{LOGIN_INSTRUCTIONS}}`
- Shared partials in `prompts/shared/` are included via `prompt-manager.ts`
- Test changes with `PIPELINE_TESTING=true` for faster iteration

### Key Design Patterns
- **Configuration-Driven Architecture**: YAML configs with JSON Schema validation
- **Modular Error Handling**: Categorized error types with retry logic
- **SDK-First Approach**: Heavy reliance on Claude Agent SDK for autonomous AI operations
- **Progressive Analysis**: Each phase builds on previous phase results

### Error Handling Strategy
The application uses a comprehensive error handling system with:
- Categorized error types (PentestError, ConfigError, NetworkError, etc.)
- Automatic retry logic for transient failures (3 attempts per agent)
- Graceful degradation when external tools are unavailable
- Detailed error logging and user-friendly error messages

### Testing Mode
The agent includes a testing mode that skips external tool execution for faster development cycles:
```bash
./shannon start URL=<url> REPO=<path> PIPELINE_TESTING=true
```

### Security Focus
This is explicitly designed as a **defensive security tool** for:
- Vulnerability assessment
- Security analysis  
- Penetration testing
- Security report generation

The tool should only be used on systems you own or have explicit permission to test.

## Key Files & Directories

**Entry Points:**
- `src/temporal/workflows.ts` - Temporal workflow definition
- `src/temporal/activities.ts` - Activity implementations with heartbeats
- `src/temporal/worker.ts` - Worker process entry point
- `src/temporal/client.ts` - CLI client for starting workflows

**Core Logic:**
- `src/session-manager.ts` - Agent definitions, execution order, parallel groups
- `src/ai/claude-executor.ts` - Claude Agent SDK integration
- `src/config-parser.ts` - YAML config parsing with JSON Schema validation
- `src/audit/` - Crash-safe logging and metrics system

**Configuration:**
- `shannon` - CLI script for running pentests
- `docker-compose.yml` - Temporal server + worker containers
- `configs/` - YAML configs with `config-schema.json` for validation
- `configs/router-config.json` - Router service configuration for multi-model support
- `prompts/` - AI prompt templates (`vuln-*.txt`, `exploit-*.txt`, etc.)

**Output:**
- `audit-logs/{hostname}_{sessionId}/` - Session metrics, agent logs, deliverables

### Router Mode (Multi-Model Support)

Shannon supports routing Claude Agent SDK requests through alternative LLM providers via [claude-code-router](https://github.com/musistudio/claude-code-router).

**Enable router mode:**
```bash
./shannon start URL=<url> REPO=<path> ROUTER=true
```

**Supported Providers:**

| Provider | Models | Use Case |
|----------|--------|----------|
| OpenAI | `gpt-5.2`, `gpt-5-mini` | Good tool use, balanced cost/performance |
| OpenRouter | `google/gemini-3-flash-preview` | Access to Gemini 3 models via single API |

**Configuration (in .env):**
```bash
# OpenAI
OPENAI_API_KEY=sk-your-key
ROUTER_DEFAULT=openai,gpt-5.2

# OpenRouter
OPENROUTER_API_KEY=sk-or-your-key
ROUTER_DEFAULT=openrouter,google/gemini-3-flash-preview
```

**Note:** Shannon is optimized for Anthropic's Claude models. Alternative providers are useful for cost savings during development but may produce varying results.

## Troubleshooting

### Common Issues
- **"Repository not found"**: Ensure target local directory exists and is accessible

### Temporal & Docker Issues
- **"Temporal not ready"**: Wait for health check or run `docker compose logs temporal`
- **Worker not processing**: Ensure worker container is running with `docker compose ps`
- **Reset workflow state**: `./shannon stop CLEAN=true` removes all Temporal data and volumes
- **Local apps unreachable**: Use `host.docker.internal` instead of `localhost` for URLs
- **Container permissions**: On Linux, may need `sudo` for docker commands

### External Tool Dependencies
Missing tools can be skipped using `PIPELINE_TESTING=true` mode during development:
- `nmap` - Network scanning
- `subfinder` - Subdomain discovery
- `whatweb` - Web technology detection

### Diagnostic & Utility Scripts
```bash
# View Temporal workflow history
open http://localhost:8233
```
