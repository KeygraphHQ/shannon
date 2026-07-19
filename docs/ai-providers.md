# AI Providers

Shannon supports OpenAI, Anthropic, AWS Bedrock, and custom Anthropic-compatible endpoints. Configure exactly one authentication method at a time. Pi remains Shannon's internal agent and tool harness; OpenAI requests use Pi's native `openai-responses` adapter with `store: false`.

## OpenAI

Run `npx @keygraph/shannon setup` and select **OpenAI**, or export an API key:

```bash
export OPENAI_API_KEY=your-api-key
```

Source-build mode can use the repository `.env` file:

```bash
OPENAI_API_KEY=your-api-key
```

An OpenAI API key is required. A ChatGPT or Codex subscription by itself does not provide API credentials or API billing.

The OpenAI defaults balance capability and cost:

| Shannon tier | Default model | Typical use |
| --- | --- | --- |
| small | `gpt-5.6-luna` | Provider preflight, pipeline-test stubs, bounded exploit child tasks |
| medium | `gpt-5.6-terra` | Authentication validation, live recon, most analysis and exploitation, reporting |
| large | `gpt-5.6-sol` | Pre-reconnaissance and authorization/business-logic analysis and exploitation |

Override a tier with `OPENAI_SMALL_MODEL`, `OPENAI_MEDIUM_MODEL`, or `OPENAI_LARGE_MODEL`. OpenAI provider-specific overrides take precedence over provider-neutral `SHANNON_*_MODEL` values.

### Default Phase Routing

OpenAI reasoning effort is selected for the workload independently of the price tier. Parent agents retain the judgment needed to direct a phase; bounded child tasks use the least expensive tier that can perform them reliably.

| Phase | Parent model / effort | `task` child model / effort |
| --- | --- | --- |
| Credential preflight | Luna / off | None |
| Authentication validation | Terra / low | None |
| Pre-reconnaissance | Sol / medium | Terra / medium |
| Live reconnaissance | Terra / medium | Terra / medium |
| Injection, XSS, authentication, and SSRF analysis | Terra / medium | Terra / medium |
| Authorization and business-logic analysis | Sol / medium | Terra / medium |
| Injection, XSS, authentication, and SSRF exploitation | Terra / medium | Luna / low |
| Authorization and business-logic exploitation | Sol / medium | Luna / low |
| Final report | Terra / medium | Terra / medium |
| Pipeline-testing mode | Luna / off | Luna / off |

These effort overrides apply only when OpenAI is the active provider. Anthropic, custom Anthropic-compatible endpoints, and Bedrock retain their existing thinking behavior. Model IDs remain configurable by tier, so an override changes every phase assigned to that tier.

Shannon records the effective parent and child models, reasoning efforts, turns, cost, and input, output, reasoning, cache-read, and cache-write tokens in its run metrics. Reasoning and cache token counts are informational subsets and are not added to input/output totals or billed cost a second time.

## Anthropic

Run the setup wizard and select **Claude Direct**, or export a credential:

```bash
export ANTHROPIC_API_KEY=your-api-key
# Or: export CLAUDE_CODE_OAUTH_TOKEN=your-oauth-token
```

Source-build `.env` equivalent:

```bash
ANTHROPIC_API_KEY=your-api-key
```

Override tiers with `ANTHROPIC_SMALL_MODEL`, `ANTHROPIC_MEDIUM_MODEL`, and `ANTHROPIC_LARGE_MODEL`. If a tier uses `claude-fable-5`, Fable's safety classifiers may route cybersecurity tasks to Opus 4.8.

## AWS Bedrock

Run the setup wizard and select **AWS Bedrock**, or configure the required values directly:

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1
export AWS_BEARER_TOKEN_BEDROCK=your-bearer-token
export SHANNON_SMALL_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
export SHANNON_MEDIUM_MODEL=us.anthropic.claude-sonnet-4-6
export SHANNON_LARGE_MODEL=us.anthropic.claude-opus-4-8
```

All three tiers are required and must be model IDs available in the configured region. The legacy `ANTHROPIC_*_MODEL` names remain supported for Bedrock.

## Custom Base URL

Shannon supports Anthropic-compatible proxies and gateways through `ANTHROPIC_BASE_URL`. This mode does not turn an OpenAI-compatible endpoint into an Anthropic-compatible endpoint; configure the proxy accordingly.

```bash
export ANTHROPIC_BASE_URL=https://your-proxy.example.com
export ANTHROPIC_AUTH_TOKEN=your-auth-token
export SHANNON_SMALL_MODEL=claude-haiku-4-5-20251001
export SHANNON_MEDIUM_MODEL=claude-sonnet-4-6
export SHANNON_LARGE_MODEL=claude-opus-4-8
```

## Model Override Precedence

For the active provider, Shannon resolves each tier in this order:

1. `OPENAI_*_MODEL` for OpenAI, or legacy `ANTHROPIC_*_MODEL` for Anthropic-compatible providers
2. Provider-neutral `SHANNON_*_MODEL`
3. The active provider's built-in default

The setup wizard stores shared overrides in `[models]`; at runtime those become `SHANNON_SMALL_MODEL`, `SHANNON_MEDIUM_MODEL`, and `SHANNON_LARGE_MODEL`.

## Safety and Billing

Provider safeguards can pause or refuse cybersecurity requests even during authorized defensive testing. Keep scope and authorization explicit, review outputs, and do not weaken Shannon's target-safety controls to bypass a provider response.

OpenAI quota exhaustion is treated as a billing condition; ordinary rate limiting is treated as transient throttling. Full scans can make many model calls, so use an isolated target and monitor the active provider's API usage and spend.
