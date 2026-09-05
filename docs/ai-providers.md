# AI Providers

One model runs the entire scan — pre-recon, recon, vulnerability analysis, exploitation, and reporting. A single setting names both the provider and the model:

```bash
export SHANNON_AI_MODEL=<provider>:<model-id>
```

The provider half decides where the request goes, which credential is used, and which API dialect is spoken. You never configure those separately.

## Supported providers

| Provider | Value | Credential |
| --- | --- | --- |
| Anthropic | `anthropic` | `SHANNON_AI_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`) |
| OpenAI | `openai` | `SHANNON_AI_API_KEY` |
| xAI | `xai` | `SHANNON_AI_API_KEY` |
| AWS Bedrock | `amazon-bedrock` | `AWS_REGION` and `AWS_BEARER_TOKEN_BEDROCK` |
| Atlas Cloud | `openai` with the Atlas Cloud base URL | `SHANNON_AI_API_KEY` |

`SHANNON_AI_API_KEY` holds the key for whichever provider `SHANNON_AI_MODEL` names. Bedrock is the exception — it authenticates through its `AWS_` variables only. If `SHANNON_AI_MODEL` is unset, Shannon uses `anthropic:claude-sonnet-4-6`.

Anthropic, OpenAI, and xAI also accept their native variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`); if one of those is set, it is used instead of `SHANNON_AI_API_KEY`.

Shannon forwards only the selected provider's credential into the scan container. Keys for other providers stay on your machine.

### Any other provider

Shannon accepts any provider and model present in the Pi harness catalogue. Browse them at [pi.dev/models](https://pi.dev/models).

```bash
export SHANNON_AI_API_KEY=your-api-key                     # the provider's key — or the gateway's when a base URL is set
export SHANNON_AI_MODEL=openrouter:moonshotai/kimi-k3      # <provider>:<model-id>
export SHANNON_AI_BASE_URL=https://llm-gateway.example.com # optional: route through a proxy or LLM gateway
```

This path covers providers whose credential is a single API key. Providers that need more than that are not currently supported.

`npx @keygraph/shannon setup` exposes this as the **Other provider** option.

> [!IMPORTANT]
> Models are validated against the harness catalogue, but capability varies. A model that does not follow Shannon's instructions or tool-use constraints reliably will produce weaker pentests. Evaluate the model you choose against your own targets before depending on its results.

## Cyber safeguards (do this before your first scan)

Anthropic and OpenAI both apply real-time safeguards to cyber-security workloads. Shannon is exactly such a workload. If a safeguard engages mid-run, the model can refuse, and the scan fails partway through rather than at the start.

Review each vendor's guidance and complete the verification or enrollment they ask of legitimate security testers before running Shannon:

- Anthropic - [Real-time cyber safeguards on Claude Opus and Sonnet](https://support.claude.com/en/articles/14604842-real-time-cyber-safeguards-on-claude-opus-and-sonnet)
- OpenAI - [Cyber](https://chatgpt.com/cyber)

This applies to the Anthropic and OpenAI providers, including when either is reached through an LLM gateway. Bedrock serves Claude models and is subject to Anthropic's safeguards as well.

## Suggested models

These are the models `npx @keygraph/shannon setup` offers, best-first. They are suggestions: the wizard also takes a typed model ID, and `SHANNON_AI_MODEL` accepts any model in the provider's catalogue.

| Provider | Suggested model IDs |
| --- | --- |
| `anthropic` | `claude-sonnet-4-6`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-haiku-4-5-20251001` |
| `openai` | `gpt-5.6-sol`, `gpt-5.5`, `gpt-5.4` |
| `xai` | `grok-4.6`, `grok-4.5` |
| `amazon-bedrock` | `us.anthropic.claude-sonnet-4-6`, `us.anthropic.claude-opus-4-8`, `us.anthropic.claude-opus-4-7` |
| Atlas Cloud preset | `qwen/qwen3.8-max` |

Bedrock IDs are region-prefixed and must be enabled in your account, so the ID that works for you may differ from the one listed here.

## Switching provider

The pattern is learned once: export the provider's key, name the model. Two lines change, nothing else.

Anthropic (default):

```bash
export SHANNON_AI_API_KEY=sk-ant-...
export SHANNON_AI_MODEL=anthropic:claude-sonnet-4-6
```

OpenAI:

```bash
export SHANNON_AI_API_KEY=sk-...
export SHANNON_AI_MODEL=openai:gpt-5.6-sol
```

xAI:

```bash
export SHANNON_AI_API_KEY=xai-...
export SHANNON_AI_MODEL=xai:grok-4.5
```

Source-build mode reads the same variables from a `.env` file.

## AWS Bedrock

Run `npx @keygraph/shannon setup` and select **AWS Bedrock**, or export directly:

```bash
export AWS_REGION=us-east-1
export AWS_BEARER_TOKEN_BEDROCK=your-bearer-token
export SHANNON_AI_MODEL=amazon-bedrock:us.anthropic.claude-opus-4-8
```

Bedrock uses bearer-token authentication only. IAM access keys, session tokens, assumed roles, and instance profiles are not supported. The model must be enabled in your region.

## Atlas Cloud

Run `npx @keygraph/shannon setup` and select **Atlas Cloud**. The wizard configures the OpenAI Chat Completions dialect and `https://api.atlascloud.ai/v1`, then prompts for your Atlas Cloud API key and model.

For environment-based configuration:

```bash
export SHANNON_AI_API_KEY=your-atlas-cloud-api-key
export SHANNON_AI_MODEL=openai:qwen/qwen3.8-max
export SHANNON_AI_BASE_URL=https://api.atlascloud.ai/v1
export SHANNON_AI_OPENAI_FORMAT=chat-completions
```

## Custom base URL

`SHANNON_AI_BASE_URL` routes model traffic through a proxy or LLM gateway instead of the provider's default endpoint — an LLM gateway such as LiteLLM, a regional endpoint, or any other host you choose. It is a plain endpoint override: it changes only *where* requests go. The provider half of `SHANNON_AI_MODEL` still decides which credential is sent and which API dialect is spoken, and that is unchanged by the base URL.

This works for **any** provider, curated or not. The one rule is that a provider's dialect is fixed, so the endpoint you point at must speak that provider's dialect:

| Provider prefix | Dialect the endpoint must speak |
| --- | --- |
| `anthropic:` | Anthropic Messages |
| `openai:` | OpenAI Responses |

Anthropic Messages LLM gateway:

```bash
export SHANNON_AI_API_KEY=sk-ant-...
export SHANNON_AI_MODEL=anthropic:claude-sonnet-4-6
export SHANNON_AI_BASE_URL=https://llm-gateway.example.com
```

OpenAI Responses LLM gateway:

```bash
export SHANNON_AI_API_KEY=sk-...
export SHANNON_AI_MODEL=openai:gpt-5.6-sol
export SHANNON_AI_BASE_URL=https://llm-gateway.example.com/v1
```

`npx @keygraph/shannon setup` configures a base URL two ways: **Custom Base URL** covers the common Anthropic Messages and OpenAI Responses LLM gateways, and **Other provider** takes any provider ID plus an optional base URL of its own.

## OpenAI Codex (ChatGPT Plus/Pro subscription)

A ChatGPT Plus or Pro Codex subscription can run Shannon. Shannon reuses a login created by Pi.

Before running a pentest, review the [cyber safeguards requirements](#cyber-safeguards-do-this-before-your-first-scan).

1. Install Pi by following the instructions at [pi.dev](https://pi.dev).
2. Log in with your subscription using Pi's [subscription authentication guide](https://pi.dev/docs/latest/providers#subscriptions). This creates `~/.pi/agent/auth.json` with an `openai-codex` entry.

3. Select a Codex model and enable Pi authentication:

   ```bash
   export SHANNON_USE_PI_AUTH=1
   export SHANNON_AI_MODEL=openai-codex:gpt-5.5
   ```

4. In npx mode, run `npx @keygraph/shannon start ...` from the same shell. In source-build mode, add the two variables to `.env` and run `./shannon start ...`.

Supported Codex models are `gpt-5.6-sol`, `gpt-5.5`, and `gpt-5.4`.

## xAI (Grok subscription)

An xAI subscription can run Shannon. Shannon reuses a login created by Pi.

1. Install Pi by following the instructions at [pi.dev](https://pi.dev).
2. Log in with your subscription using Pi's [subscription authentication guide](https://pi.dev/docs/latest/providers#subscriptions). This creates `~/.pi/agent/auth.json` with an `xai` entry.

3. Select an xAI model and enable Pi authentication:

   ```bash
   export SHANNON_USE_PI_AUTH=1
   export SHANNON_AI_MODEL=xai:grok-4.6
   ```

4. In npx mode, run `npx @keygraph/shannon start ...` from the same shell. In source-build mode, add the two variables to `.env` and run `./shannon start ...`.

Suggested Grok models are `grok-4.6` and `grok-4.5`.

## Claude Code subscription

The latest version of Shannon does not support Claude Code subscriptions. The [`shannon-v1`](https://github.com/KeygraphHQ/shannon/tree/shannon-v1) branch is the final release built on the Claude Agent SDK and supports Claude Code OAuth.

Before running a pentest, review the [cyber safeguards requirements](#cyber-safeguards-do-this-before-your-first-scan).

1. Generate a Claude Code OAuth token:

   ```bash
   claude setup-token
   ```

2. Run the setup flow for the final `shannon-v1` release:

   ```bash
   npx @keygraph/shannon@1.9.0 setup
   ```

3. Select **OAuth Token** and enter the token generated by Claude Code.
4. Start the pentest with `npx @keygraph/shannon@1.9.0 start ...`.

These instructions apply only to `shannon-v1`.

## Validation

Checks run before a scan starts, so mistakes fail immediately rather than partway through a run:

- **Provider and model ID** — validated against the Pi harness catalogue. An unknown provider or model ID fails preflight with a pointer to [pi.dev/models](https://pi.dev/models). A custom base URL exempts the model ID, since an LLM gateway may serve its own names.
- **Credential presence** — validated for the selected provider, or read from Pi when `SHANNON_USE_PI_AUTH=1`.
- **Credential validity** — one minimal request against the model the scan will use, so a rejected key, an exhausted quota, or a model the account cannot reach fails before any agent runs. Bedrock included: its bearer token and region go through the same probe.

## Migrating from the three-tier configuration

Earlier versions took three model variables. They no longer do anything — replace them with `SHANNON_AI_MODEL`.

| Before | Now |
| --- | --- |
| `ANTHROPIC_SMALL_MODEL`, `ANTHROPIC_MEDIUM_MODEL`, `ANTHROPIC_LARGE_MODEL` | a single `SHANNON_AI_MODEL` |
| `CLAUDE_CODE_USE_BEDROCK=1` plus three Bedrock model IDs | `SHANNON_AI_MODEL=amazon-bedrock:<model-id>` |
| `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` selected a provider | `SHANNON_AI_BASE_URL` overrides the endpoint; `SHANNON_AI_MODEL` selects the provider |

In `~/.shannon/config.toml`, the `[models]` section and `bedrock.use` are gone, each provider has its own section, and the model lives at `core.model`:

```toml
[core]
model = "anthropic:claude-sonnet-4-6"
# base_url = "https://llm-gateway.example.com"

[anthropic]
api_key = "your-api-key"
```

Re-run `npx @keygraph/shannon setup` to regenerate the file.
