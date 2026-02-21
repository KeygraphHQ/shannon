# Plan: Black-Box Pentest Mode for Shannon

## Overview

Add a dual-mode architecture to Shannon: **whitebox** (current behavior, requires `REPO`) and **blackbox** (no source code, network-only testing). The approach preserves all existing white-box functionality while adding black-box prompt variants and making `REPO` optional.

## Key Design Decisions

**`repoPath` serves four roles today:** (1) source code for analysis, (2) agent working directory (`cwd`), (3) deliverable storage (`deliverables/`), (4) git checkpointing. For black-box mode we eliminate role #1 but still need roles #2-4. Solution: when `REPO` is absent, create a workspace directory (e.g., `/repos/.shannon-blackbox-<sessionId>/`) that serves as the agent CWD and deliverable storage, initialized as a git repo for checkpointing.

**Mode detection:** Implicit — if `REPO` is provided, use whitebox prompts; if absent, use blackbox prompts. No new config field needed.

---

## Step 1: Make `REPO` Optional in CLI (`shannon`)

**File:** `shannon` (lines 139-173)

- Remove the `REPO` requirement from validation (line 139: `if [ -z "$URL" ] || [ -z "$REPO" ]`)
- Keep `URL` required, make `REPO` optional
- When `REPO` is absent:
  - Skip the `./repos/$REPO` existence check
  - Set `CONTAINER_REPO=""` (empty string signals blackbox mode downstream)
- Update the help text to show `REPO` as optional: `./shannon start URL=<url> [REPO=<name>]`

## Step 2: Make `repoPath` Optional in Pipeline Types

**Files:**
- `src/temporal/shared.ts` — Change `repoPath: string` to `repoPath?: string` in `PipelineInput`
- `src/temporal/activities.ts` — Change `repoPath: string` to `repoPath?: string` in `ActivityInput`
- `src/services/agent-execution.ts` — Change `repoPath: string` to `repoPath?: string` in `AgentExecutionInput`
- `src/services/prompt-manager.ts` — Change `repoPath: string` to `repoPath?: string` in `PromptVariables`; remove the validation that requires `repoPath` (line 140)

## Step 3: Add Workspace Directory Creation for Black-Box Mode

**File:** `src/temporal/activities.ts`

Add a new activity `ensureWorkspaceDirectory` that:
- If `repoPath` is provided, returns it as-is (whitebox mode)
- If `repoPath` is absent, creates `/repos/.shannon-blackbox-<sessionId>/` with a `deliverables/` subdirectory, initializes it as a git repo (`git init`), creates an initial commit, and returns the new path
- This activity runs at the start of the workflow, before any agent activity

**File:** `src/temporal/workflows.ts`

- Call `ensureWorkspaceDirectory` as the first step, before Phase 1
- Store the resolved `repoPath` (either the user-provided one or the auto-created workspace) and use it for all subsequent activities
- Update `activityInput` construction to use the resolved path

## Step 4: Conditional Prompt Template Selection in Agent Registry

**File:** `src/session-manager.ts`

Change the `AGENTS` record from static `promptTemplate` strings to a function or lookup that accepts a `mode` parameter. Two approaches — choose the simpler one:

**Approach: Add `blackboxPromptTemplate` field to `AgentDefinition`**

- Add optional `blackboxPromptTemplate?: string` to `AgentDefinition` type in `src/types/agents.ts`
- For agents that need different prompts in blackbox mode, populate this field:
  - `pre-recon`: `blackboxPromptTemplate: 'pre-recon-blackbox'`
  - `recon`: `blackboxPromptTemplate: 'recon-blackbox'`
  - `injection-vuln`: `blackboxPromptTemplate: 'vuln-injection-blackbox'`
  - `xss-vuln`: `blackboxPromptTemplate: 'vuln-xss-blackbox'`
  - `auth-vuln`: `blackboxPromptTemplate: 'vuln-auth-blackbox'`
  - `ssrf-vuln`: `blackboxPromptTemplate: 'vuln-ssrf-blackbox'`
  - `authz-vuln`: `blackboxPromptTemplate: 'vuln-authz-blackbox'`
- Exploit and report agents: no `blackboxPromptTemplate` needed (they already work without source code)
- Add a helper function: `getPromptTemplate(agentName: AgentName, isBlackbox: boolean): string` that returns `blackboxPromptTemplate` when available and `isBlackbox` is true, otherwise `promptTemplate`

**File:** `src/services/agent-execution.ts`

- Pass `isBlackbox` (derived from whether original `repoPath` was empty) to `loadPrompt`
- Use `getPromptTemplate(agentName, isBlackbox)` instead of `AGENTS[agentName].promptTemplate`

## Step 5: Update Prompt Manager for Black-Box Mode

**File:** `src/services/prompt-manager.ts`

- Make `repoPath` optional in `PromptVariables`
- In `interpolateVariables`: when `repoPath` is absent/empty, replace `{{REPO_PATH}}` with empty string or omit it
- Remove the hard validation requiring `repoPath` (line 140)

## Step 6: Add MCP Agent Mapping for New Prompts

**File:** `src/session-manager.ts`

Add entries to `MCP_AGENT_MAPPING` for the new blackbox prompt template names:
```
'pre-recon-blackbox': 'playwright-agent1',
'recon-blackbox': 'playwright-agent2',
'vuln-injection-blackbox': 'playwright-agent1',
'vuln-xss-blackbox': 'playwright-agent2',
'vuln-auth-blackbox': 'playwright-agent3',
'vuln-ssrf-blackbox': 'playwright-agent4',
'vuln-authz-blackbox': 'playwright-agent5',
```

## Step 7: Write Black-Box Prompt Templates

Create 7 new prompt files in `prompts/`:

### 7a. `prompts/pre-recon-blackbox.txt` (~300 lines)
**Purpose:** Replace source code analysis with active external discovery.
**Content:**
- Role: External Reconnaissance Specialist
- Run nmap, subfinder, whatweb against target (same as current)
- Crawl target with Playwright to discover pages, forms, API endpoints
- Parse robots.txt, sitemap.xml, /.well-known/
- Download and analyze client-side JavaScript bundles for API routes, tokens, hidden endpoints
- Attempt to discover OpenAPI/Swagger/GraphQL endpoints
- Fingerprint technology stack from response headers, error pages, known URL patterns
- Output: `code_analysis_deliverable.md` (same deliverable name for compatibility — contents will be discovery-based rather than code-based)

### 7b. `prompts/recon-blackbox.txt` (~250 lines)
**Purpose:** Pure browser-based reconnaissance without code correlation.
**Content:**
- Remove all "Task agent for code analysis" instructions
- Keep all Playwright-based interaction (crawling, form discovery, auth flow testing)
- Add: forced browsing / directory enumeration
- Add: parameter discovery via response diffing
- Add: API endpoint probing from pre-recon JS analysis
- Keep scope boundaries (in-scope/out-of-scope)
- Output: `recon_deliverable.md` (same format)

### 7c. `prompts/vuln-injection-blackbox.txt` (~300 lines)
**Purpose:** Replace white-box taint analysis with active injection probing.
**Content:**
- Role: Injection Testing Specialist (black-box)
- For every input field/parameter from recon deliverable:
  - Test SQL injection: error-based, time-based blind, boolean-based blind
  - Test command injection: basic, blind (sleep-based), OOB (if available)
  - Test SSTI: common template engine detection payloads
  - Test path traversal: directory traversal sequences, encoding bypasses
- Detection methods: error message analysis, timing comparison, response content diffing
- Use Playwright for browser-rendered injection (not just HTTP)
- Use `sqlmap` via Bash for confirmed SQLi candidates
- Output: same `injection_analysis_deliverable.md` + `injection_exploitation_queue.json`

### 7d. `prompts/vuln-xss-blackbox.txt` (~300 lines)
**Purpose:** Replace sink analysis with active XSS probing.
**Content:**
- Role: XSS Testing Specialist (black-box)
- For every input vector from recon deliverable:
  - Inject reflection test probe, check where/how it appears in DOM
  - Test reflected XSS: HTML context, attribute context, JS context
  - Test stored XSS: submit payloads, revisit pages, check DOM via Playwright
  - Test DOM XSS: analyze client-side JS for dangerous sinks (from pre-recon JS analysis)
- Detection: Use Playwright to check if injected scripts execute
- Output: same format

### 7e. `prompts/vuln-auth-blackbox.txt` (~250 lines)
**Purpose:** Replace auth middleware analysis with active auth testing.
**Content:**
- Role: Authentication Testing Specialist (black-box)
- Test: credential brute force, default credentials, account lockout
- Test: session management (fixation, cookie flags, expiry, concurrent sessions)
- Test: password reset flow (token leakage, token reuse, token brute force)
- Test: authentication bypass (direct page access, parameter manipulation, forced browsing)
- Test: token handling (JWT tampering, token leakage in URLs/logs)
- Output: same format

### 7f. `prompts/vuln-ssrf-blackbox.txt` (~250 lines)
**Purpose:** Replace HTTP client code analysis with active SSRF probing.
**Content:**
- Role: SSRF Testing Specialist (black-box)
- For every parameter that accepts URL-like input:
  - Test internal IP ranges (127.0.0.1, 169.254.169.254, 10.x, 172.x, 192.168.x)
  - Test cloud metadata endpoints (AWS, GCP, Azure)
  - Test protocol handlers (file://, gopher://, dict://)
  - Test DNS rebinding, URL parser differentials
- Detection: response content analysis, timing, error message differences
- Output: same format

### 7g. `prompts/vuln-authz-blackbox.txt` (~250 lines)
**Purpose:** Replace authorization guard analysis with active authz testing.
**Content:**
- Role: Authorization Testing Specialist (black-box)
- Test IDOR: increment/decrement object IDs, substitute other user's IDs
- Test horizontal privilege escalation: access other users' resources
- Test vertical privilege escalation: access admin endpoints as regular user
- Test: missing function-level access controls (forced browsing to admin pages)
- Test: parameter-based access control bypass
- Requires: config with multiple user credentials (different roles)
- Output: same format

## Step 8: Handle Git Operations Gracefully in Black-Box Mode

**File:** `src/services/git-manager.ts`

The existing `isGitRepository()` check already returns false and skips git ops for non-git directories. Since we initialize the blackbox workspace as a git repo (Step 3), this works out of the box. No changes needed here.

## Step 9: Update CLI Client for Optional REPO

**File:** `src/temporal/client.ts`

- Make `repoPath` optional in `CliArgs` and `parseCliArgs`
- When `repoPath` is absent, pass empty string `''` as `repoPath` in pipeline input
- Update validation: only `webUrl` is required
- Update `showUsage` to reflect optional REPO

## Step 10: Update Pre-Recon Validator for Black-Box Mode

**File:** `src/session-manager.ts`

The pre-recon validator checks for `code_analysis_deliverable.md`. This file is also produced in black-box mode (with discovery-based content), so no change needed. The deliverable filename stays the same — the content is what differs.

## Step 11: Update `shannon` CLI Help and Docker Setup

**File:** `shannon`
- Update help text
- Handle missing `REPO` for deliverables directory creation (lines 216-219): skip when `REPO` is empty

**File:** `docker-compose.yml` — No changes needed (repos volume mount still works, just unused in blackbox mode)

## Step 12: Build and Verify

- Run `npm run build` to verify TypeScript compiles
- Verify all existing tests still pass (whitebox mode unchanged)

---

## Files Changed Summary

| File | Change Type | Description |
|------|------------|-------------|
| `shannon` | Modify | Make REPO optional, update help text |
| `src/temporal/shared.ts` | Modify | `repoPath` optional in `PipelineInput` |
| `src/temporal/activities.ts` | Modify | `repoPath` optional in `ActivityInput`; add `ensureWorkspaceDirectory` activity |
| `src/temporal/workflows.ts` | Modify | Call workspace init; pass resolved repoPath |
| `src/temporal/client.ts` | Modify | Make repoPath optional in CLI |
| `src/types/agents.ts` | Modify | Add `blackboxPromptTemplate` to `AgentDefinition` |
| `src/session-manager.ts` | Modify | Add blackbox prompt templates; add MCP mappings; add `getPromptTemplate` helper |
| `src/services/agent-execution.ts` | Modify | Use conditional prompt template selection |
| `src/services/prompt-manager.ts` | Modify | Make repoPath optional; relax validation |
| `prompts/pre-recon-blackbox.txt` | **New** | External discovery prompt |
| `prompts/recon-blackbox.txt` | **New** | Browser-only recon prompt |
| `prompts/vuln-injection-blackbox.txt` | **New** | Active injection probing prompt |
| `prompts/vuln-xss-blackbox.txt` | **New** | Active XSS probing prompt |
| `prompts/vuln-auth-blackbox.txt` | **New** | Active auth testing prompt |
| `prompts/vuln-ssrf-blackbox.txt` | **New** | Active SSRF probing prompt |
| `prompts/vuln-authz-blackbox.txt` | **New** | Active authz testing prompt |

**Unchanged:** All exploit prompts (5), report prompt (1), Temporal workflow structure, Docker setup, audit system, deliverable format, resume/workspace system.

## Usage After Implementation

```bash
# White-box (existing behavior, unchanged)
./shannon start URL=https://example.com REPO=my-repo

# Black-box (new)
./shannon start URL=https://example.com

# Black-box with config (auth credentials, scope rules)
./shannon start URL=https://example.com CONFIG=./configs/my-config.yaml
```
