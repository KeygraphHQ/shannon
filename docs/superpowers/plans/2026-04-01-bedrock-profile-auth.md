# AWS Bedrock Profile Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `AWS_PROFILE` as an alternative to bearer token auth for Bedrock, with `~/.aws/` mounted read-only into the container for auto-refresh of short-lived credentials.

**Architecture:** The CLI setup wizard gains a "Bearer Token vs AWS Profile" sub-choice under Bedrock. Profile mode mounts `~/.aws/` into the container and passes `AWS_PROFILE` as an env var. The SDK inside the container resolves and auto-refreshes credentials natively. Bearer token mode is unchanged.

**Tech Stack:** `@aws-sdk/credential-providers` (new dependency for CLI + worker), `@clack/prompts` (existing), TypeScript, Docker bind mounts.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/cli/src/config/writer.ts` | `ShannonConfig` type — add `auth_method` and `profile` to bedrock section |
| `apps/cli/src/config/resolver.ts` | TOML→env mapping — add `AWS_PROFILE` mapping, conditional bedrock validation |
| `apps/cli/src/commands/setup.ts` | Setup wizard — auth method select, profile sub-flow with validation |
| `apps/cli/src/env.ts` | `FORWARD_VARS` — add `AWS_PROFILE`. `validateCredentials` — dual-mode bedrock check |
| `apps/cli/src/docker.ts` | `WorkerOptions` — add `awsMounts` field. `spawnWorker` — conditional `~/.aws/` bind mounts |
| `apps/cli/src/commands/start.ts` | Wire `awsMounts` into `spawnWorker` call when profile mode detected |
| `apps/worker/src/ai/claude-executor.ts` | `passthroughVars` — add `AWS_PROFILE` |
| `apps/worker/src/services/preflight.ts` | Dual-mode bedrock credential validation with SSO expiry detection |
| `.env.example` | Add Option 4b (profile) example |

---

### Task 1: Add `@aws-sdk/credential-providers` dependency

**Files:**
- Modify: `apps/cli/package.json`
- Modify: `apps/worker/package.json`

- [ ] **Step 1: Install dependency in CLI package**

```bash
cd apps/cli && pnpm add @aws-sdk/credential-providers
```

- [ ] **Step 2: Install dependency in worker package**

```bash
cd apps/worker && pnpm add @aws-sdk/credential-providers
```

- [ ] **Step 3: Verify installation**

```bash
pnpm ls @aws-sdk/credential-providers --recursive
```

Expected: Both `@keygraph/shannon` and `@shannon/worker` list the dependency.

---

### Task 2: Update `ShannonConfig` type

**Files:**
- Modify: `apps/cli/src/config/writer.ts:10-18`

- [ ] **Step 1: Update the bedrock type in `ShannonConfig`**

In `apps/cli/src/config/writer.ts`, replace the `bedrock` field in the `ShannonConfig` interface:

```typescript
export interface ShannonConfig {
  core?: { max_tokens?: number };
  anthropic?: { api_key?: string; oauth_token?: string };
  custom_base_url?: { base_url?: string; auth_token?: string };
  bedrock?: { use?: boolean; auth_method?: 'token' | 'profile'; region?: string; token?: string; profile?: string };
  vertex?: { use?: boolean; region?: string; project_id?: string; key_path?: string };
  router?: { default?: string; openai_key?: string; openrouter_key?: string };
  models?: { small?: string; medium?: string; large?: string };
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm run check
```

Expected: No errors.

---

### Task 3: Update TOML resolver — mapping and validation

**Files:**
- Modify: `apps/cli/src/config/resolver.ts:24-56` (CONFIG_MAP)
- Modify: `apps/cli/src/config/resolver.ts:149-157` (bedrock validation)

- [ ] **Step 1: Add new TOML↔env mappings to `CONFIG_MAP`**

In `apps/cli/src/config/resolver.ts`, add two new entries after the existing bedrock entries (after line 35):

```typescript
  // Bedrock
  { env: 'CLAUDE_CODE_USE_BEDROCK', toml: 'bedrock.use', type: 'boolean' },
  { env: 'AWS_REGION', toml: 'bedrock.region', type: 'string' },
  { env: 'AWS_BEARER_TOKEN_BEDROCK', toml: 'bedrock.token', type: 'string' },
  { env: 'AWS_PROFILE', toml: 'bedrock.profile', type: 'string' },
```

Note: `bedrock.auth_method` does not need an env mapping — it's only used internally by the resolver to decide which env vars to inject. We do need to register it in the schema so TOML validation doesn't reject it. Add it to the CONFIG_MAP:

```typescript
  { env: 'BEDROCK_AUTH_METHOD', toml: 'bedrock.auth_method', type: 'string' },
```

- [ ] **Step 2: Update bedrock validation in `validateProviderFields`**

Replace the `case 'bedrock'` block (lines 149-157) with conditional validation:

```typescript
    case 'bedrock': {
      const keys = Object.keys(section);
      if (!keys.includes('use') || !keys.includes('region')) {
        const missing = ['use', 'region'].filter((k) => !keys.includes(k));
        errors.push(`[bedrock] missing required keys: ${missing.join(', ')}`);
      }

      const authMethod = (section as Record<string, unknown>).auth_method;
      if (authMethod === 'profile') {
        if (!keys.includes('profile')) {
          errors.push('[bedrock] profile auth requires the "profile" key');
        }
      } else {
        // Default to 'token' for backwards compatibility
        if (!keys.includes('token')) {
          errors.push('[bedrock] token auth requires the "token" key');
        }
      }

      validateModelTiers(config, 'bedrock', errors);
      break;
    }
```

- [ ] **Step 3: Type-check**

```bash
pnpm run check
```

Expected: No errors.

---

### Task 4: Update env forwarding and credential validation

**Files:**
- Modify: `apps/cli/src/env.ts:13-32` (FORWARD_VARS)
- Modify: `apps/cli/src/env.ts:117-131` (validateCredentials bedrock block)

- [ ] **Step 1: Add `AWS_PROFILE` to `FORWARD_VARS`**

In `apps/cli/src/env.ts`, add `'AWS_PROFILE'` after `'AWS_BEARER_TOKEN_BEDROCK'` in the `FORWARD_VARS` array:

```typescript
const FORWARD_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ROUTER_DEFAULT',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'AWS_REGION',
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_PROFILE',
  'CLAUDE_CODE_USE_VERTEX',
  'CLOUD_ML_REGION',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'ANTHROPIC_SMALL_MODEL',
  'ANTHROPIC_MEDIUM_MODEL',
  'ANTHROPIC_LARGE_MODEL',
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
] as const;
```

- [ ] **Step 2: Update the bedrock block in `validateCredentials`**

Replace the existing bedrock validation block (lines 117-131) with dual-mode logic. Add imports at the top of the file first:

```typescript
import fs from 'node:fs';
import os from 'node:os';
```

Then replace the bedrock block:

```typescript
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    const isProfileMode = !!process.env.AWS_PROFILE;
    const isTokenMode = !!process.env.AWS_BEARER_TOKEN_BEDROCK;

    if (!isProfileMode && !isTokenMode) {
      return {
        valid: false,
        mode: 'bedrock',
        error: 'Bedrock mode requires either AWS_BEARER_TOKEN_BEDROCK (token auth) or AWS_PROFILE (profile auth)',
      };
    }

    const missing: string[] = [];
    if (!process.env.AWS_REGION) missing.push('AWS_REGION');
    if (!process.env.ANTHROPIC_SMALL_MODEL) missing.push('ANTHROPIC_SMALL_MODEL');
    if (!process.env.ANTHROPIC_MEDIUM_MODEL) missing.push('ANTHROPIC_MEDIUM_MODEL');
    if (!process.env.ANTHROPIC_LARGE_MODEL) missing.push('ANTHROPIC_LARGE_MODEL');

    if (isProfileMode) {
      const awsConfigPath = path.join(os.homedir(), '.aws', 'config');
      if (!fs.existsSync(awsConfigPath)) {
        missing.push('~/.aws/config (file not found)');
      }
    }

    if (missing.length > 0) {
      return {
        valid: false,
        mode: 'bedrock',
        error: `Bedrock mode requires: ${missing.join(', ')}`,
      };
    }
    return { valid: true, mode: 'bedrock' };
  }
```

NOTE: Also add `import path from 'node:path';` if not already present. Keep `validateCredentials` synchronous.

- [ ] **Step 3: Type-check**

```bash
pnpm run check
```

Expected: No errors.

---

### Task 5: Add `~/.aws/` bind mounts to Docker worker

**Files:**
- Modify: `apps/cli/src/docker.ts:185-199` (WorkerOptions interface)
- Modify: `apps/cli/src/docker.ts:204-268` (spawnWorker function)

- [ ] **Step 1: Add `awsMounts` to `WorkerOptions`**

In `apps/cli/src/docker.ts`, add a new optional field to `WorkerOptions`:

```typescript
export interface WorkerOptions {
  version: string;
  url: string;
  repo: { hostPath: string; containerPath: string };
  workspacesDir: string;
  taskQueue: string;
  containerName: string;
  envFlags: string[];
  config?: { hostPath: string; containerPath: string };
  credentials?: string;
  promptsDir?: string;
  outputDir?: string;
  workspace?: string;
  pipelineTesting?: boolean;
  awsMounts?: boolean;
}
```

- [ ] **Step 2: Add bind mounts in `spawnWorker`**

Add `import fs from 'node:fs';` at the top of `apps/cli/src/docker.ts` if not already present. (`os` and `path` are already imported.)

In `spawnWorker`, after the credentials mount block (after the `if (opts.credentials)` block), add:

```typescript
    // Mount AWS config for profile-based Bedrock auth
    if (opts.awsMounts) {
      const awsDir = path.join(os.homedir(), '.aws');
      const configFile = path.join(awsDir, 'config');
      const credentialsFile = path.join(awsDir, 'credentials');
      const ssoDir = path.join(awsDir, 'sso');

      if (fs.existsSync(configFile)) {
        args.push('-v', `${configFile}:/root/.aws/config:ro`);
      }
      if (fs.existsSync(credentialsFile)) {
        args.push('-v', `${credentialsFile}:/root/.aws/credentials:ro`);
      }
      if (fs.existsSync(ssoDir)) {
        args.push('-v', `${ssoDir}:/root/.aws/sso:ro`);
      }
    }
```

- [ ] **Step 3: Type-check**

```bash
pnpm run check
```

Expected: No errors.

---

### Task 6: Wire `awsMounts` in start command

**Files:**
- Modify: `apps/cli/src/commands/start.ts:92-106` (spawnWorker call)

- [ ] **Step 1: Detect profile mode and pass `awsMounts`**

In `apps/cli/src/commands/start.ts`, after step 9 (the credentials block, around line 77), add detection:

```typescript
  // 9b. Detect AWS profile mode for Bedrock bind mounts
  const needsAwsMounts = process.env.CLAUDE_CODE_USE_BEDROCK === '1' && !!process.env.AWS_PROFILE;
```

Then in the `spawnWorker` call, add the `awsMounts` option:

```typescript
  const proc = spawnWorker({
    version: args.version,
    url: args.url,
    repo,
    workspacesDir,
    taskQueue,
    containerName,
    envFlags: buildEnvFlags(),
    ...(config && { config }),
    ...(hasCredentials && { credentials: credentialsPath }),
    ...(promptsDir && { promptsDir }),
    ...(outputDir && { outputDir }),
    ...(workspace && { workspace }),
    ...(args.pipelineTesting && { pipelineTesting: true }),
    ...(needsAwsMounts && { awsMounts: true }),
  });
```

- [ ] **Step 2: Type-check**

```bash
pnpm run check
```

Expected: No errors.

---

### Task 7: Update setup wizard with auth method choice

**Files:**
- Modify: `apps/cli/src/commands/setup.ts:179-214` (setupBedrock function)

- [ ] **Step 1: Add import for credential resolution**

At the top of `apps/cli/src/commands/setup.ts`, add:

```typescript
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
```

- [ ] **Step 2: Replace `setupBedrock` function**

Replace the entire `setupBedrock` function (lines 179-214) with:

```typescript
async function setupBedrock(): Promise<ShannonConfig> {
  // 1. Choose auth method
  const authMethod = await p.select({
    message: 'Authentication method',
    options: [
      { value: 'token' as const, label: 'Bearer Token', hint: 'static API key from AWS' },
      { value: 'profile' as const, label: 'AWS Profile', hint: 'uses ~/.aws/ credentials (SSO, IAM, etc.)' },
    ],
  });
  if (p.isCancel(authMethod)) return cancelAndExit();

  // 2. Collect region (common to both paths)
  const region = await p.text({
    message: 'AWS Region',
    placeholder: 'us-east-1',
    validate: required('AWS Region is required'),
  });
  if (p.isCancel(region)) return cancelAndExit();

  let bedrockConfig: ShannonConfig['bedrock'];

  if (authMethod === 'profile') {
    // 3a. Profile path — collect profile name and validate
    const profile = await p.text({
      message: 'AWS Profile name',
      placeholder: 'default',
      initialValue: 'default',
      validate: required('Profile name is required'),
    });
    if (p.isCancel(profile)) return cancelAndExit();

    // Validate by attempting to resolve credentials
    const spinner = p.spinner();
    spinner.start(`Resolving credentials for profile "${profile}"...`);
    try {
      const provider = fromNodeProviderChain({ profile });
      await provider();
      spinner.stop(`Found credentials for profile "${profile}"`);
    } catch (error) {
      spinner.stop('Credential resolution failed');
      const message = error instanceof Error ? error.message : String(error);
      const isSsoExpiry = message.includes('SSO') || message.includes('sso') || message.includes('expired');
      if (isSsoExpiry) {
        p.log.error(`AWS SSO session expired. Run this first:\n  aws sso login --profile ${profile}`);
      } else {
        p.log.error(`Failed to resolve credentials for profile "${profile}": ${message}`);
      }
      return cancelAndExit();
    }

    bedrockConfig = { use: true, auth_method: 'profile', region, profile };
  } else {
    // 3b. Token path — collect bearer token
    const token = await promptSecret('Enter your AWS Bearer Token');
    bedrockConfig = { use: true, auth_method: 'token', region, token };
  }

  // 4. Model tiers (same for both paths)
  const small = await p.text({
    message: 'Small model ID',
    placeholder: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    validate: required('Small model ID is required'),
  });
  if (p.isCancel(small)) return cancelAndExit();

  const medium = await p.text({
    message: 'Medium model ID',
    placeholder: 'us.anthropic.claude-sonnet-4-6',
    validate: required('Medium model ID is required'),
  });
  if (p.isCancel(medium)) return cancelAndExit();

  const large = await p.text({
    message: 'Large model ID',
    placeholder: 'us.anthropic.claude-opus-4-6',
    validate: required('Large model ID is required'),
  });
  if (p.isCancel(large)) return cancelAndExit();

  return {
    bedrock: bedrockConfig,
    models: { small, medium, large },
  };
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm run check
```

Expected: No errors.

---

### Task 8: Add `AWS_PROFILE` to SDK passthrough vars

**Files:**
- Modify: `apps/worker/src/ai/claude-executor.ts:154-172` (passthroughVars)

- [ ] **Step 1: Add `AWS_PROFILE` to `passthroughVars`**

In `apps/worker/src/ai/claude-executor.ts`, add `'AWS_PROFILE'` after `'AWS_BEARER_TOKEN_BEDROCK'` in the `passthroughVars` array (around line 161):

```typescript
    'CLAUDE_CODE_USE_BEDROCK',
    'AWS_REGION',
    'AWS_BEARER_TOKEN_BEDROCK',
    'AWS_PROFILE',
    'CLAUDE_CODE_USE_VERTEX',
```

- [ ] **Step 2: Type-check**

```bash
pnpm run check
```

Expected: No errors.

---

### Task 9: Update worker preflight validation

**Files:**
- Modify: `apps/worker/src/services/preflight.ts:216-238` (bedrock validation block)

- [ ] **Step 1: Add import for credential resolution**

At the top of `apps/worker/src/services/preflight.ts`, add:

```typescript
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
```

- [ ] **Step 2: Replace the bedrock validation block**

Replace the bedrock block in `validateCredentials` (lines 216-238) with dual-mode validation:

```typescript
  // 2. Bedrock mode — validate required AWS credentials are present
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    const isProfileMode = !!process.env.AWS_PROFILE;
    const isTokenMode = !!process.env.AWS_BEARER_TOKEN_BEDROCK;

    if (!isProfileMode && !isTokenMode) {
      return err(
        new PentestError(
          'Bedrock mode requires either AWS_BEARER_TOKEN_BEDROCK (token auth) or AWS_PROFILE (profile auth)',
          'config',
          false,
          {},
          ErrorCode.AUTH_FAILED,
        ),
      );
    }

    const required = ['AWS_REGION', 'ANTHROPIC_SMALL_MODEL', 'ANTHROPIC_MEDIUM_MODEL', 'ANTHROPIC_LARGE_MODEL'];
    if (isTokenMode) {
      required.push('AWS_BEARER_TOKEN_BEDROCK');
    }
    const missing = required.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      return err(
        new PentestError(
          `Bedrock mode requires the following env vars: ${missing.join(', ')}`,
          'config',
          false,
          { missing },
          ErrorCode.AUTH_FAILED,
        ),
      );
    }

    // For profile mode, verify credentials can be resolved (catches expired SSO sessions)
    if (isProfileMode) {
      const profile = process.env.AWS_PROFILE;
      try {
        const provider = fromNodeProviderChain({ profile });
        await provider();
        logger.info(`Bedrock credentials OK (profile: ${profile})`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isSsoExpiry = message.includes('SSO') || message.includes('sso') || message.includes('expired');
        const hint = isSsoExpiry ? `\nRun: aws sso login --profile ${profile}` : '';
        return err(
          new PentestError(
            `Failed to resolve AWS credentials for profile "${profile}": ${message}${hint}`,
            'config',
            false,
            { profile },
            ErrorCode.AUTH_FAILED,
          ),
        );
      }
    } else {
      logger.info('Bedrock credentials OK');
    }

    return ok(undefined);
  }
```

- [ ] **Step 3: Type-check**

```bash
pnpm run check
```

Expected: No errors.

---

### Task 10: Update `.env.example` with profile option

**Files:**
- Modify: `.env.example:45-57`

- [ ] **Step 1: Add Option 4b block**

In `.env.example`, after the existing Option 4 block (after line 57), add:

```bash

# =============================================================================
# OPTION 4b: AWS Bedrock (Profile)
# =============================================================================
# Use an existing AWS CLI profile instead of a bearer token.
# The CLI mounts ~/.aws/ read-only into the container for credential auto-refresh.
# Supports SSO, IAM keys, assumed roles, and any profile type.
# Requires the model tier overrides above to be set with Bedrock-specific model IDs.

# CLAUDE_CODE_USE_BEDROCK=1
# AWS_PROFILE=default
# AWS_REGION=us-east-1
```

---

### Task 11: Build and lint

**Files:** All modified files

- [ ] **Step 1: Run Biome lint and format**

```bash
pnpm biome:fix
```

- [ ] **Step 2: Build all packages**

```bash
pnpm run build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Type-check all packages**

```bash
pnpm run check
```

Expected: No type errors.
