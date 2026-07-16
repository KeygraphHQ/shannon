# AI Providers

Shannon works best with Claude models. Anthropic API keys are recommended for most users, and Shannon also supports AWS Bedrock and custom Anthropic-compatible endpoints.

## Anthropic

Run the setup wizard:

```bash
npx @keygraph/shannon setup
```

Or export an API key directly:

```bash
export ANTHROPIC_API_KEY=your-api-key
```

Source-build mode can use a `.env` file:

```bash
ANTHROPIC_API_KEY=your-api-key
```

Each tier can be pointed at any Claude model via `ANTHROPIC_SMALL_MODEL` / `ANTHROPIC_MEDIUM_MODEL` / `ANTHROPIC_LARGE_MODEL` (or the setup wizard). If you set a tier to `claude-fable-5`, note that Fable's safety classifiers route cybersecurity tasks to Opus 4.8, so those phases run on Opus 4.8 regardless.

## AWS Bedrock

Run `npx @keygraph/shannon setup` and select **AWS Bedrock**. The wizard prompts for region, bearer token, and model IDs.

Or export environment variables directly:

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1
export AWS_BEARER_TOKEN_BEDROCK=your-bearer-token
export ANTHROPIC_SMALL_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
export ANTHROPIC_MEDIUM_MODEL=us.anthropic.claude-sonnet-4-6
export ANTHROPIC_LARGE_MODEL=us.anthropic.claude-opus-4-8
```

Source-build `.env` equivalent:

```bash
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AWS_BEARER_TOKEN_BEDROCK=your-bearer-token
ANTHROPIC_SMALL_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
ANTHROPIC_MEDIUM_MODEL=us.anthropic.claude-sonnet-4-6
ANTHROPIC_LARGE_MODEL=us.anthropic.claude-opus-4-8
```

Shannon uses three model tiers:

- **small** for summarization
- **medium** for security analysis
- **large** for deep reasoning

Set `ANTHROPIC_SMALL_MODEL`, `ANTHROPIC_MEDIUM_MODEL`, and `ANTHROPIC_LARGE_MODEL` to Bedrock model IDs available in your region.

## Custom Base URL

Shannon supports pointing the SDK at an Anthropic-compatible endpoint with `ANTHROPIC_BASE_URL`. For proxy-based routing, use an LLM proxy such as LiteLLM configured to expose an Anthropic-compatible endpoint.

> [!IMPORTANT]
> Only Claude models are officially supported. Shannon's evaluations, internal testing, and agent harness are optimized for Claude. Smaller or alternative models, including non-Claude models routed through a proxy, may not reliably follow Shannon's instructions or tool-use constraints. Use them at your own risk.

The experimental `claude-code-router` integration has been removed. If you previously relied on it, migrate to an Anthropic-compatible proxy such as LiteLLM.

Run `npx @keygraph/shannon setup` and select **Custom Base URL**, or export variables directly:

```bash
export ANTHROPIC_BASE_URL=https://your-proxy.example.com
export ANTHROPIC_AUTH_TOKEN=your-auth-token
export ANTHROPIC_SMALL_MODEL=claude-haiku-4-5-20251001
export ANTHROPIC_MEDIUM_MODEL=claude-sonnet-4-6
export ANTHROPIC_LARGE_MODEL=claude-opus-4-8
```

Source-build `.env` equivalent:

```bash
ANTHROPIC_BASE_URL=https://your-proxy.example.com
ANTHROPIC_AUTH_TOKEN=your-auth-token
ANTHROPIC_SMALL_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_MEDIUM_MODEL=claude-sonnet-4-6
ANTHROPIC_LARGE_MODEL=claude-opus-4-8
```
