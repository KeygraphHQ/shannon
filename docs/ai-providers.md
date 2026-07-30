# AI Providers

One model runs the entire scan — pre-recon, recon, vulnerability analysis, exploitation, and reporting. A single setting names both the provider and the model:

```bash
export SHANNON_AI_MODEL=<provider>:<model-id>
```

The provider half decides where the request goes, which credential is used, and which API dialect is spoken. You never configure those separately.

## Supported providers

| Provider | Value | Credential |
| --- | --- | --- |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| xAI | `xai` | `XAI_API_KEY` |
| AWS Bedrock | `amazon-bedrock` | `AWS_REGION` and `AWS_BEARER_TOKEN_BEDROCK` |

Shannon does not invent credential names — each is the variable that provider's own tooling already uses. If `SHANNON_AI_MODEL` is unset, Shannon uses `anthropic:claude-sonnet-4-6`.

Shannon forwards only the selected provider's credential into the scan container. Keys for other providers stay on your machine.

> [!NOTE]
> Only the **first** colon separates the provider from the model ID, so Bedrock IDs that contain colons work unchanged: `amazon-bedrock:us.anthropic.claude-opus-4-5-20251101-v1:0`.

> [!IMPORTANT]
> Claude models are the best-supported option. Shannon's evaluations, internal testing, and agent harness are tuned for Claude. Other models are permitted and validated against the harness catalogue, but may not follow Shannon's instructions or tool-use constraints as reliably. Use them at your own risk.

## Switching provider

The pattern is learned once: export the provider's key, name the model. Two lines change, nothing else.

Anthropic (default):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export SHANNON_AI_MODEL=anthropic:claude-sonnet-4-6
```

OpenAI:

```bash
export OPENAI_API_KEY=sk-...
export SHANNON_AI_MODEL=openai:gpt-5.6-sol
```

xAI:

```bash
export XAI_API_KEY=xai-...
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

To route model traffic through your own infrastructure — a corporate proxy, an LLM gateway such as LiteLLM, or a regional endpoint — set a base URL alongside your normal model selection. The provider half of `SHANNON_AI_MODEL` decides which key is sent and which API Shannon speaks, so pick the one your gateway serves:

| Gateway serves | Model prefix | API key |
| --- | --- | --- |
| Anthropic Messages | `anthropic:` | `ANTHROPIC_API_KEY` |
| OpenAI Chat Completions | `openai:` | `OPENAI_API_KEY` |
| OpenAI Responses | `openai:` + `SHANNON_AI_OPENAI_FORMAT=responses` | `OPENAI_API_KEY` |

The model ID is whatever name your gateway serves it under; it does not have to exist in Shannon's catalogue.

Anthropic Messages:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export SHANNON_AI_MODEL=anthropic:claude-sonnet-4-6
export SHANNON_AI_BASE_URL=https://llm-gateway.example.com
```

OpenAI Chat Completions:

```bash
export OPENAI_API_KEY=sk-...
export SHANNON_AI_MODEL=openai:gpt-5.6-sol
export SHANNON_AI_BASE_URL=https://llm-gateway.example.com/v1
```

`SHANNON_AI_MODEL` is always `<provider>:<model-id>`, gateway or not.

OpenAI is the one provider serving two APIs, so a gateway run picks one:

```bash
export SHANNON_AI_OPENAI_FORMAT=responses          # default: chat-completions
```

Chat Completions is the default because that is what most gateway software exposes. Set `responses` for a gateway that passes the Responses API through — it preserves reasoning state between turns, which Chat Completions cannot. `openai:gpt-5` with no base URL always calls OpenAI's Responses API directly.

The variable is rejected in preflight where it cannot take effect: with a non-`openai` model, since Anthropic, xAI, and Bedrock each serve one API, and with no `SHANNON_AI_BASE_URL`, since a direct OpenAI run is always Responses.

`npx @keygraph/shannon setup` covers this under **Custom Base URL**, which asks which API your gateway serves and configures the matching provider for you.

## Validation

Checks run before a scan starts, so mistakes fail immediately rather than partway through a run:

- **Provider** — always validated against the providers Shannon's harness knows. An unrecognised provider is rejected with the valid list.
- **Model ID** — validated against the harness catalogue for that provider, so a typo is caught instantly.
- **Credential presence** — always validated for the selected provider.
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
