# Shannon Modifications Log

This document tracks significant modifications made to the Shannon codebase.

---

## GitHub Models Integration (2024-12-20)

### Overview
Integrated GitHub Models as an alternative LLM provider to Anthropic Claude, enabling usage with GitHub's hosted model inference API.

### Changes Made

#### New Files
- **`src/ai/github-client.js`** - Custom agent loop implementation using OpenAI SDK with GitHub Models endpoint
- **`.env.example`** - Environment variable template for token configuration
- **`local-source-generator.mjs`** - Black-box reconnaissance source generator for targets without source code access
- **`configs/blackbox-templates/`** - Configuration templates for black-box scanning

#### Modified Files
- **`src/ai/claude-executor.js`** - Updated to import from `github-client.js` instead of Anthropic SDK
- **`src/prompts/prompt-manager.js`** - Fixed Node.js 18 compatibility (`import.meta.dirname` → `fileURLToPath`)
- **`prompts/pre-recon-code.txt`** - Compressed prompt to fit within GitHub Models token limits
- **`package.json`** - Added `openai` and `@modelcontextprotocol/sdk` dependencies

### Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your GitHub Personal Access Token:
   ```bash
   # In .env file
   GITHUB_TOKEN=your_github_token_here
   ```

3. Run Shannon with the token:
   ```bash
   export GITHUB_TOKEN="your_token" && ./shannon.mjs "https://target.com" "./path/to/source"
   ```

### Technical Details

#### GitHub Models Client (`src/ai/github-client.js`)
- Uses OpenAI SDK with `baseURL: "https://models.github.ai/inference"`
- Model: `openai/gpt-4.1` (configurable)
- Implements native tools: `run_command`, `read_file`, `write_file`, `list_files`
- Implements Shannon helper tools: `save_deliverable`, `generate_totp`
- Supports external MCP servers (e.g., Playwright)

#### Token Limits
GitHub Models enforces token limits per model. The `pre-recon-code.txt` prompt was compressed to accommodate these constraints.

### Known Limitations
- GitHub Models free tier has rate limits and token restrictions
- Some models (Mistral, AI21) may return "Unknown model" errors despite being listed
- `gpt-4o` and `openai/gpt-4.1` are the most reliable options

---

## Local Source Generator (2024-12-20)

### Overview
Added black-box reconnaissance capability for targets where source code is not available.

### Features
- Generates synthetic pseudo-source from discovered endpoints
- Integrates with: `nmap`, `subfinder`, `whatweb`, `gau`, `katana`
- Creates route files, models, and configuration stubs
- Deterministic progress bar with `cli-progress`

### Usage
```bash
node local-source-generator.mjs --help
node local-source-generator.mjs --target "https://example.com" --output "./output"
```

---
