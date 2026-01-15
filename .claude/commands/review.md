---
description: Review code changes for Shannon-specific patterns, security, and common mistakes
---

Review the current changes (staged or working directory) with focus on Shannon-specific patterns and common mistakes.

## Step 1: Gather Changes
Run these commands to understand the scope:
```bash
git diff --stat HEAD
git diff HEAD
```

## Step 2: Check Shannon-Specific Patterns

### Error Handling (CRITICAL)
- [ ] **All errors use PentestError** - Never use raw `Error`. Use `new PentestError(message, type, retryable, context)`
- [ ] **Error type is appropriate** - Use correct type: 'config', 'network', 'tool', 'prompt', 'filesystem', 'validation', 'billing', 'unknown'
- [ ] **Retryable flag matches behavior** - If error will be retried, set `retryable: true`
- [ ] **Context includes debugging info** - Add relevant paths, tool names, error codes to context object
- [ ] **Never swallow errors silently** - Always log or propagate errors

### Audit System & Concurrency (CRITICAL)
- [ ] **Mutex protection for parallel operations** - Use `sessionMutex.lock()` when updating `session.json` during parallel agent execution
- [ ] **Reload before modify** - Always call `this.metricsTracker.reload()` before updating metrics in mutex block
- [ ] **Atomic writes for session.json** - Use `atomicWrite()` for session metadata, never `fs.writeFile()` directly
- [ ] **Stream drain handling** - Log writes must wait for buffer drain before resolving
- [ ] **Semaphore release in finally** - Git semaphore must be released in `finally` block

### Claude SDK Integration (CRITICAL)
- [ ] **MCP server configuration** - Verify Playwright MCP uses `--isolated` and unique `--user-data-dir`
- [ ] **Prompt variable interpolation** - Check all `{{VARIABLE}}` placeholders are replaced
- [ ] **Turn counting** - Increment `turnCount` on assistant messages, not tool calls
- [ ] **Cost tracking** - Extract cost from final `result` message, track even on failure
- [ ] **API error detection** - Check for "session limit reached" (fatal) vs other errors

### Configuration & Validation (CRITICAL)
- [ ] **FAILSAFE_SCHEMA for YAML** - Never use default schema (prevents code execution)
- [ ] **Security pattern detection** - Check for path traversal (`../`), HTML injection (`<>`), JavaScript URLs
- [ ] **Rule conflict detection** - Rules cannot appear in both `avoid` AND `focus`
- [ ] **Duplicate rule detection** - Same `type:url_path` cannot appear twice
- [ ] **JSON Schema validation before use** - Config must pass AJV validation

### Session & Agent Management (CRITICAL)
- [ ] **Deliverable dependencies respected** - Exploitation agents only run if vulnerability queue exists AND has items
- [ ] **Queue validation before exploitation** - Use `safeValidateQueueAndDeliverable()` to check eligibility
- [ ] **Git checkpoint before agent run** - Create checkpoint for rollback on failure
- [ ] **Git rollback on retry** - Call `rollbackGitWorkspace()` before each retry attempt
- [ ] **Agent prerequisites checked** - Verify prerequisite agents completed before running dependent agent

### Parallel Execution
- [ ] **Promise.allSettled for parallel agents** - Never use `Promise.all` (partial failures should not crash batch)
- [ ] **Staggered startup** - 2-second delay between parallel agent starts to prevent API throttle
- [ ] **Individual retry loops** - Each agent retries independently (3 attempts max)
- [ ] **Results aggregated correctly** - Handle both 'fulfilled' and 'rejected' results from `Promise.allSettled`

## Step 3: TypeScript Safety

### Type Assertions (WARNING)
- [ ] **No double casting** - Never use `as unknown as SomeType` (bypasses type safety)
- [ ] **Validate before casting** - JSON parsed data should be validated (JSON Schema) before `as Type`
- [ ] **Prefer type guards** - Use `instanceof` or property checks instead of assertions where possible

### Null/Undefined Handling
- [ ] **Explicit null checks** - Use `if (x === null || x === undefined)` not truthy checks for critical paths
- [ ] **Nullish coalescing** - Use `??` for null/undefined, not `||` which also catches empty string/0
- [ ] **Optional chaining** - Use `?.` for nested property access on potentially undefined objects

### Imports & Types
- [ ] **Type imports** - Use `import type { ... }` for type-only imports
- [ ] **No implicit any** - All function parameters and returns must have explicit types
- [ ] **Readonly for constants** - Use `Object.freeze()` and `Readonly<>` for immutable data

## Step 4: Security Review

### Defensive Tool Security
- [ ] **No credentials in logs** - Check that passwords, tokens, TOTP secrets are not logged to audit files
- [ ] **Config file size limit** - Ensure 1MB max for config files (DoS prevention)
- [ ] **Safe shell execution** - Command arguments must be escaped/sanitized

### Code Injection Prevention
- [ ] **YAML safe parsing** - FAILSAFE_SCHEMA only
- [ ] **No eval/Function** - Never use dynamic code evaluation
- [ ] **Input validation at boundaries** - URLs, paths validated before use

## Step 5: Common Mistakes to Avoid

### Anti-Patterns Found in Codebase
- [ ] **Catch + re-throw without context** - Don't just `throw error`, wrap with additional context
- [ ] **Silent failures in session loading** - Corrupted session files should warn user, not silently reset
- [ ] **Duplicate retry logic** - Don't implement retry at both caller and callee level
- [ ] **Hardcoded error message matching** - Prefer error codes over regex on error.message
- [ ] **Missing timeout on long operations** - Git operations and API calls should have timeouts

### Code Quality
- [ ] **No dead code added** - Remove unused imports, functions, variables
- [ ] **No over-engineering** - Don't add abstractions for single-use operations
- [ ] **Comments only where needed** - Self-documenting code preferred over excessive comments
- [ ] **Consistent file naming** - kebab-case for files (e.g., `queue-validation.ts`)

## Step 6: Provide Feedback

For each issue found:
1. **Location**: File and line number
2. **Issue**: What's wrong and why it matters
3. **Fix**: How to correct it (with code example if helpful)
4. **Severity**: Critical / Warning / Suggestion

### Severity Definitions
- **Critical**: Will cause bugs, crashes, data loss, or security issues
- **Warning**: Code smell, inconsistent pattern, or potential future issue
- **Suggestion**: Style improvement or minor enhancement

Summarize with:
- Total issues by severity
- Overall assessment (Ready to commit / Needs fixes / Needs discussion)

---

Now review the current changes.
