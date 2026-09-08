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

A model the catalogue does not yet carry, such as one released after Shannon's pinned Pi version, is reachable by describing it yourself. See [Custom model configuration](#custom-model-configuration).

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

## Custom base URL

`SHANNON_AI_BASE_URL` routes model traffic through a proxy or LLM gateway instead of the provider's default endpoint — an LLM gateway such as LiteLLM, a regional endpoint, or any other host you choose. It is a plain endpoint override: it changes only *where* requests go. The provider half of `SHANNON_AI_MODEL` still decides which credential is sent and which API dialect is spoken, and that is unchanged by the base URL.

This works for **any** provider, curated or not, subject to two rules. A provider's dialect is fixed, so the endpoint you point at must speak that provider's dialect:

| Provider prefix | Dialect the endpoint must speak |
| --- | --- |
| `anthropic:` | Anthropic Messages |
| `openai:` | OpenAI Responses |

And the model ID must still resolve in the harness catalogue. A base URL changes only the address; it grants no exemption from that check. A gateway serving a model under its own name needs that name described in a [custom model configuration](#custom-model-configuration) file.

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

## Custom model configuration

A model released after Shannon's pinned Pi version is not in the harness catalogue yet, so `SHANNON_AI_MODEL` alone cannot reach it. Rather than wait for a Shannon release, describe the model yourself and pass the file with `--models-config`:

```bash
npx @keygraph/shannon start -u https://example.com -r /path/to/repo --models-config ./models.json
```

```bash
./shannon start -u https://example.com -r ./my-repo --models-config ./models.json
```

[pi.dev/models](https://pi.dev/models) supplies the file contents. Find the model under the provider you want, since the same model has a different ID per provider, then open its page and expand **Show configuration** for a ready-to-paste snippet:

```json
{
  "providers": {
    "openrouter": {
      "apiKey": "YOUR_API_KEY",
      "models": [
        {
          "id": "z-ai/glm-5.3",
          "name": "Z.ai: GLM 5.3",
          "reasoning": true,
          "input": [
            "text"
          ],
          "thinkingLevelMap": {
            "off": null,
            "minimal": null,
            "low": "low",
            "medium": null,
            "high": "high",
            "xhigh": null,
            "max": "max"
          },
          "contextWindow": 1048576,
          "maxTokens": 943718,
          "cost": {
            "input": 1.4,
            "output": 4.4,
            "cacheRead": 0.26,
            "cacheWrite": 0
          },
          "compat": {
            "supportsDeveloperRole": false,
            "thinkingFormat": "openrouter"
          }
        }
      ],
      "api": "openai-completions",
      "baseUrl": "https://openrouter.ai/api/v1"
    }
  }
}
```

Then name the model the usual way:

```bash
export SHANNON_AI_API_KEY=your-api-key
export SHANNON_AI_MODEL=openrouter:z-ai/glm-5.3
```

Leave `YOUR_API_KEY` exactly as it is. Shannon sends the credential from your environment, and that takes precedence over anything the file declares, so the file describes the model and never has to hold a secret.

Pi's [models documentation](https://pi.dev/docs/latest/models) describes the full format, including provider routing preferences and compatibility flags.

## Local and self-hosted models

Ollama, LM Studio, vLLM, and any other OpenAI-compatible server are reached through the same mechanism. Describe the server as a provider in a model config file, then name its model with `SHANNON_AI_MODEL`.

> [!IMPORTANT]
> Use `host.docker.internal`, not `localhost`. The scan runs inside a container, so `localhost` points at the container itself rather than at your machine.

A `models.json` for Ollama:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://host.docker.internal:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "<model-id>" }
      ]
    }
  }
}
```

Then name the model and run:

```bash
export SHANNON_AI_API_KEY=ollama                  # any value, see below
export SHANNON_AI_MODEL=ollama:<model-id>
./shannon start -u https://example.com -r ./my-repo --models-config ./models.json
```

LM Studio and vLLM take the same shape on their own ports, `http://host.docker.internal:1234/v1` and `http://host.docker.internal:8000/v1` respectively. The provider name is yours to choose, and only has to match the prefix in `SHANNON_AI_MODEL`.

`SHANNON_AI_API_KEY` is still required even though a local server ignores it. Shannon checks that the selected provider has a credential before it starts, so set it to any placeholder value. It is sent to your server and discarded.

> [!IMPORTANT]
> Shannon drives every phase through multi-turn tool use. Capability varies, and a model that does not follow Shannon's instructions or tool-use constraints reliably will produce weaker pentests than a frontier model, so take this path only if you know how your chosen model behaves.

Some servers need compatibility flags. If a reasoning-capable model is rejected, turn off the roles it does not understand, at either provider or model level:

```json
"compat": { "supportsDeveloperRole": false, "supportsReasoningEffort": false }
```

Pi's [models documentation](https://pi.dev/docs/latest/models) lists the full set of compatibility flags and local-runtime options.

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

- **Provider and model ID** — validated against the Pi harness catalogue. An unknown provider or model ID fails preflight with a pointer to [pi.dev/models](https://pi.dev/models). To run a model the catalogue does not carry, describe it with [`--models-config`](#custom-model-configuration).
- **Model configuration** — when `--models-config` is passed, the file is parsed and schema-checked before the scan starts, and a fault fails preflight with the offending field named.
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
