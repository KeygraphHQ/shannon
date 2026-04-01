# AWS Bedrock Profile Authentication Support

Add `AWS_PROFILE` as an alternative to bearer token authentication for AWS Bedrock. Users choose their auth method during setup; the CLI mounts `~/.aws/` read-only into the Docker container and passes `AWS_PROFILE`, allowing the SDK inside the container to resolve and auto-refresh credentials.

## Context

Shannon currently supports Bedrock via a static bearer token (`AWS_BEARER_TOKEN_BEDROCK`). AWS profiles (`~/.aws/credentials` + `~/.aws/config`) support IAM keys, SSO, assumed roles, and short-lived STS tokens — much more practical for enterprise users who already have AWS CLI configured.

## Design Decisions

- **Profile as a Bedrock sub-option** — not a separate top-level provider. One Bedrock provider, two auth methods.
- **Mount `~/.aws/` read-only into the container** — for profile mode, bind-mount `~/.aws/config` and `~/.aws/sso/` (cached SSO tokens) into the container. Pass `AWS_PROFILE` as an env var. The SDK inside the container resolves and auto-refreshes credentials using the cached SSO token.
- **Auto-refresh via SSO token cache** — the SSO token cached on the host (8-24h lifetime, set by org admin) is readable inside the container. The SDK silently exchanges it for fresh short-lived IAM credentials (~1h) as needed. No browser interaction required from inside Docker.
- **Validate during setup** — attempt to resolve the profile immediately so misconfiguration is caught early.
- **No automatic `aws sso login`** — if SSO session is expired, show an actionable error message telling the user to run `aws sso login --profile <name>` themselves.
- **New dependency: `@aws-sdk/credential-providers`** — added to CLI package (for setup validation) and worker package (for credential resolution inside the container).

## TOML Schema

The `[bedrock]` section gains `auth_method` and `profile` fields. `token` becomes conditional.

```toml
# Bearer token auth (existing, backwards compatible)
[bedrock]
use = true
auth_method = "token"
region = "us-east-1"
token = "your-bearer-token"

# Profile auth (new)
[bedrock]
use = true
auth_method = "profile"
region = "us-east-1"
profile = "my-sso-profile"
```

Existing configs without `auth_method` default to `"token"` for backwards compatibility.

### TypeScript Type

```typescript
bedrock?: {
  use?: boolean;
  auth_method?: 'token' | 'profile';  // defaults to 'token'
  region?: string;
  token?: string;                       // required when auth_method = 'token'
  profile?: string;                     // required when auth_method = 'profile', defaults to 'default'
};
```

## Setup Wizard

`setupBedrock()` in `apps/cli/src/commands/setup.ts`:

1. Prompt **auth method** — `@clack/prompts` select: "Bearer Token" or "AWS Profile"
2. **Bearer Token path** — unchanged (prompt region, prompt token)
3. **AWS Profile path:**
   - Prompt for profile name (default: `"default"`)
   - Prompt for region
   - **Validate** — call `fromNodeProviderChain({ profile })` to resolve credentials
   - On success: show "Found credentials for profile 'X'"
   - On failure: if SSO expiry detected, show `aws sso login --profile <name>` guidance. Otherwise show the error and let user retry.
4. Prompt for model IDs (same for both paths, unchanged)
5. Return `ShannonConfig` with `auth_method` and appropriate fields

## Credential Resolution at Scan Time

### Token path (unchanged)

In `apps/cli/src/config/resolver.ts`:
- `bedrock.use` → `CLAUDE_CODE_USE_BEDROCK=1`
- `bedrock.region` → `AWS_REGION`
- `bedrock.token` → `AWS_BEARER_TOKEN_BEDROCK`

No file mounts. Credentials passed as env vars.

### Profile path (new)

In `apps/cli/src/config/resolver.ts`:
- `bedrock.use` → `CLAUDE_CODE_USE_BEDROCK=1`
- `bedrock.region` → `AWS_REGION`
- `bedrock.profile` → `AWS_PROFILE`

In `apps/cli/src/docker.ts` — when profile mode is detected, add bind mounts:
- `~/.aws/config:/root/.aws/config:ro`
- `~/.aws/credentials:/root/.aws/credentials:ro` (if exists — for static IAM key profiles)
- `~/.aws/sso/:/root/.aws/sso/:ro` (if exists — cached SSO tokens)

The SDK inside the container reads `AWS_PROFILE`, finds the config and cached SSO token, and resolves credentials natively. When short-lived IAM credentials expire (~1h), the SDK re-reads the SSO cache and fetches fresh ones — no browser interaction needed.

**Local mode (`.env`):** Users set `AWS_PROFILE` and `AWS_REGION` directly. The CLI detects `AWS_PROFILE` and applies the same mount strategy.

## Environment Variable Forwarding

`apps/cli/src/env.ts` — one new entry in `FORWARD_VARS`:
- `AWS_PROFILE`

`buildEnvFlags()` passes it to Docker. The actual AWS credentials are resolved inside the container via the mounted `~/.aws/` files.

## Credential Validation

### CLI-side (`apps/cli/src/env.ts` — `validateCredentials`)

When `CLAUDE_CODE_USE_BEDROCK=1`:
- If `AWS_BEARER_TOKEN_BEDROCK` is set → token mode, existing checks
- If `AWS_PROFILE` is set → profile mode, require `AWS_PROFILE` + `AWS_REGION`, verify `~/.aws/config` exists on host
- If neither → error explaining both options

Both modes require `AWS_REGION` and all three model tier vars.

### Worker-side (`apps/worker/src/services/preflight.ts`)

Dual-mode check:
- If `AWS_BEARER_TOKEN_BEDROCK` is set → token mode (existing)
- If `AWS_PROFILE` is set → profile mode, attempt `fromNodeProviderChain({ profile })` to verify credentials resolve. If SSO session expired, return error with `aws sso login --profile <name>` guidance.

Both require `AWS_REGION` and model tiers.

## Claude Agent SDK Passthrough

`apps/worker/src/ai/claude-executor.ts` — add to `passthroughVars`:
- `AWS_PROFILE`

The SDK subprocess inherits the container's environment, which includes the mounted `~/.aws/` files. It resolves credentials natively via `AWS_PROFILE` when `CLAUDE_CODE_USE_BEDROCK=1`.

## Files Modified

| File | Change |
|---|---|
| `apps/cli/package.json` | Add `@aws-sdk/credential-providers` dependency |
| `apps/worker/package.json` | Add `@aws-sdk/credential-providers` dependency (for preflight validation inside container) |
| `apps/cli/src/config/writer.ts` | Update `ShannonConfig` type |
| `apps/cli/src/config/resolver.ts` | Conditional env mapping (token vs profile) |
| `apps/cli/src/commands/setup.ts` | Auth method select, profile sub-flow with validation |
| `apps/cli/src/env.ts` | Add `AWS_PROFILE` to `FORWARD_VARS`, update `validateCredentials` |
| `apps/cli/src/docker.ts` | Add `~/.aws/` bind mounts when profile mode detected |
| `apps/worker/src/ai/claude-executor.ts` | Add `AWS_PROFILE` to `passthroughVars` |
| `apps/worker/src/services/preflight.ts` | Dual-mode credential validation with SSO expiry detection |
| `.env.example` | Add Option 4b (profile) |
| `README.md` | Document profile auth option |

## Files Untouched

`workflows.ts`, `activities.ts`, `worker.ts`, `session-manager.ts` — the change is contained in the credential and Docker layers.

## Limitations

- **SSO session must outlast the scan** — the SDK auto-refreshes short-lived IAM credentials (~1h) using the cached SSO token, but if the SSO session itself expires (typically 8-24h, configurable by org admin), credential refresh fails. Users should run `aws sso login` before long scans.
- **No automatic `aws sso login`** — the CLI does not run `aws sso login` (it's interactive/browser-based). Users must authenticate on the host before starting a scan.
- **Read-only `~/.aws/` exposure** — in profile mode, the container can read the user's AWS config and SSO cache. The mount is read-only, but the container can see all profiles and cached tokens, not just the selected one.
