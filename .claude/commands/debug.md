---
description: Systematically debug errors using context analysis and structured recovery
---

You are debugging an issue. Follow this structured approach to avoid spinning in circles.

## Step 1: Capture Error Context
- Read the full error message and stack trace
- Identify the layer where the error originated:
  - **CLI/Args** - Input validation, path resolution
  - **Config Parsing** - YAML parsing, JSON Schema validation
  - **Session Management** - Mutex, session.json, lock files
  - **Audit System** - Logging, metrics tracking, atomic writes
  - **Claude SDK** - Agent execution, MCP servers, turn handling
  - **Git Operations** - Checkpoints, rollback, commit
  - **Tool Execution** - nmap, subfinder, whatweb
  - **Validation** - Deliverable checks, queue validation

## Step 2: Check Relevant Logs

**Session audit logs:**
```bash
# Find most recent session
ls -lt audit-logs/ | head -5

# Check session metrics and errors
cat audit-logs/<session>/session.json | jq '.errors, .agentMetrics'

# Check agent execution logs
ls -lt audit-logs/<session>/agents/
cat audit-logs/<session>/agents/<latest>.log
```

## Step 3: Trace the Call Path

For Shannon, trace through these layers:

1. **Temporal Client** → `src/temporal/client.ts` - Workflow initiation
2. **Workflow** → `src/temporal/workflows.ts` - Pipeline orchestration
3. **Activities** → `src/temporal/activities.ts` - Agent execution with heartbeats
4. **Config** → `src/config-parser.ts` - YAML loading, schema validation
5. **Session** → `src/session-manager.ts` - Agent definitions, execution order
6. **Audit** → `src/audit/audit-session.ts` - Logging facade, metrics tracking
7. **Executor** → `src/ai/claude-executor.ts` - SDK calls, MCP setup, retry logic
8. **Validation** → `src/queue-validation.ts` - Deliverable checks

## Step 4: Identify Root Cause

**Common Shannon-specific issues:**

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Agent hangs indefinitely | MCP server crashed, Playwright timeout | Check Playwright logs in `/tmp/playwright-*` |
| "Validation failed: Missing deliverable" | Agent didn't create expected file | Check `deliverables/` dir, review prompt |
| Git checkpoint fails | Uncommitted changes, git lock | Run `git status`, remove `.git/index.lock` |
| "Session limit reached" | Claude API billing limit | Not retryable - check API usage |
| Parallel agents all fail | Shared resource contention | Check mutex usage, stagger startup timing |
| Cost/timing not tracked | Metrics not reloaded before update | Add `metricsTracker.reload()` before updates |
| session.json corrupted | Partial write during crash | Delete and restart, or restore from backup |
| YAML config rejected | Invalid schema or unsafe content | Run through AJV validator manually |
| Prompt variable not replaced | Missing `{{VARIABLE}}` in context | Check `prompt-manager.ts` interpolation |

**MCP Server Issues:**
```bash
# Check if Playwright browsers are installed
npx playwright install chromium

# Check MCP server startup (look for connection errors)
grep -i "mcp\|playwright" audit-logs/<session>/agents/*.log
```

**Git State Issues:**
```bash
# Check for uncommitted changes
git status

# Check for git locks
ls -la .git/*.lock

# View recent git operations from Shannon
git reflog | head -10
```

## Step 5: Apply Fix with Retry Limit

- **CRITICAL**: Track consecutive failed attempts
- After **3 consecutive failures** on the same issue, STOP and:
  - Summarize what was tried
  - Explain what's blocking progress
  - Ask the user for guidance or additional context
- After a successful fix, reset the failure counter

## Step 6: Validate the Fix

**For code changes:**
```bash
# Compile TypeScript
npx tsc --noEmit

# Quick validation run
shannon <URL> <REPO> --pipeline-testing
```

**For audit/session issues:**
- Verify `session.json` is valid JSON after fix
- Check that atomic writes complete without errors
- Confirm mutex release in `finally` blocks

**For agent issues:**
- Verify deliverable files are created in correct location
- Check that validation functions return expected results
- Confirm retry logic triggers on appropriate errors

## Anti-Patterns to Avoid

- Don't delete `session.json` without checking if session is active
- Don't modify git state while an agent is running
- Don't retry billing/quota errors (they're not retryable)
- Don't ignore PentestError type - it indicates the error category
- Don't make random changes hoping something works
- Don't fix symptoms without understanding root cause
- Don't bypass mutex protection for "quick fixes"

## Quick Reference: Error Types

| PentestError Type | Meaning | Retryable? |
|-------------------|---------|------------|
| `config` | Configuration file issues | No |
| `network` | Connection/timeout issues | Yes |
| `tool` | External tool (nmap, etc.) failed | Yes |
| `prompt` | Claude SDK/API issues | Sometimes |
| `filesystem` | File read/write errors | Sometimes |
| `validation` | Deliverable validation failed | Yes (via retry) |
| `billing` | API quota/billing limit | No |
| `unknown` | Unexpected error | Depends |

---

Now analyze the error and begin debugging systematically.
