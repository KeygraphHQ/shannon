# Shannon Modifications Log

This document tracks significant modifications made to the Shannon codebase.

---

## Multi-Provider LLM Infrastructure (2025-12-20)

### Overview
Complete rewrite of the LLM client to support multiple providers: GitHub Models, OpenAI, Ollama, llama.cpp, LM Studio, and custom endpoints.

### Changes Made

#### New/Renamed Files
- **`src/ai/llm-client.js`** — Multi-provider LLM client (renamed from `github-client.js`)
- **`src/ai/llm-client.test.js`** — Unit tests for provider configuration
- **`.env.example`** — Comprehensive environment variable documentation
- **`AGENTS.md`** — AI agent guidelines with provider reference table

#### Modified Files
- **`src/ai/claude-executor.js`** — Updated import to `llm-client.js`
- **`LSG-TODO.md`** — Marked Phase 1.1 complete

### Supported Providers

| Provider | Endpoint | API Key Required |
|:---------|:---------|:----------------:|
| `github` | `models.github.ai/inference` | Yes (`GITHUB_TOKEN`) |
| `openai` | `api.openai.com/v1` | Yes (`OPENAI_API_KEY`) |
| `ollama` | `localhost:11434/v1` | No |
| `llamacpp` | `localhost:8080/v1` | No |
| `lmstudio` | `localhost:1234/v1` | No |
| `custom` | `LLM_BASE_URL` | Optional |

### Configuration

```bash
# Cloud providers
GITHUB_TOKEN=ghp_...
# or
OPENAI_API_KEY=sk-...

# Local providers (no key needed)
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2

# Custom endpoint
LLM_PROVIDER=custom
LLM_BASE_URL=https://your-proxy.com/v1
```

---

## Local Source Generator (2025-12-20)

### Overview
Black-box reconnaissance capability for targets without source code access.

### Features
- Generates synthetic pseudo-source from discovered endpoints
- Integrates with: `nmap`, `subfinder`, `whatweb`, `gau`, `katana`
- Creates route files, models, and configuration stubs
- Progress bar with `cli-progress`

### Files
- **`local-source-generator.mjs`** — CLI entry point
- **`src/local-source-generator/`** — Module components
- **`configs/blackbox-templates/`** — Configuration templates

### Usage
```bash
node local-source-generator.mjs --help
node local-source-generator.mjs --target "https://example.com" --output "./output"
```

---

## Fork Renaming (2025-12-20)

### Overview
Renamed fork to "Shannon Uncontained" with new README and documentation.

### Changes
- **`README.md`** — Complete rewrite with fork philosophy, mermaid architecture diagram
- **`AGENTS.md`** — Guidelines for AI agents working on the codebase
- **`LSG-TODO.md`** — Hitchens-esque roadmap with phase structure

---
