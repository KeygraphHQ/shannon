# AI Providers

Shannon Lite works best with Claude models. Anthropic API keys are recommended for most users, and Shannon Lite also supports AWS Bedrock, Google Vertex AI, and custom Anthropic-compatible endpoints.

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
CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
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

Shannon Lite uses three model tiers:

- **small** for summarization
- **medium** for security analysis
- **large** for deep reasoning

Set `ANTHROPIC_SMALL_MODEL`, `ANTHROPIC_MEDIUM_MODEL`, and `ANTHROPIC_LARGE_MODEL` to Bedrock model IDs available in your region.

## Google Vertex AI

Create a service account with the `roles/aiplatform.user` role in the GCP Console, then download a JSON key file.

Run `npx @keygraph/shannon setup` and select **Google Vertex AI**. The wizard prompts for region, project ID, service account key file path, and model IDs. The key file is copied to `~/.shannon/google-sa-key.json`.

Or export environment variables directly:

```bash
export CLAUDE_CODE_USE_VERTEX=1
export CLOUD_ML_REGION=us-east5
export ANTHROPIC_VERTEX_PROJECT_ID=your-gcp-project-id
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-sa-key.json
export ANTHROPIC_SMALL_MODEL=claude-haiku-4-5@20251001
export ANTHROPIC_MEDIUM_MODEL=claude-sonnet-4-6
export ANTHROPIC_LARGE_MODEL=claude-opus-4-8
```

Source-build `.env` equivalent:

```bash
CLAUDE_CODE_USE_VERTEX=1
CLOUD_ML_REGION=us-east5
ANTHROPIC_VERTEX_PROJECT_ID=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=./credentials/google-sa-key.json
ANTHROPIC_SMALL_MODEL=claude-haiku-4-5@20251001
ANTHROPIC_MEDIUM_MODEL=claude-sonnet-4-6
ANTHROPIC_LARGE_MODEL=claude-opus-4-8
```

Set `CLOUD_ML_REGION=global` for global endpoints, or use a specific region like `us-east5`. Some models may not be available on global endpoints.

## Custom Base URL

Shannon Lite supports pointing the SDK at an Anthropic-compatible endpoint with `ANTHROPIC_BASE_URL`. For proxy-based routing, use an LLM proxy such as LiteLLM configured to expose an Anthropic-compatible endpoint.

> [!IMPORTANT]
> Only Claude models are officially supported. Shannon Lite's evaluations, internal testing, and agent harness are optimized for Claude. Smaller or alternative models, including non-Claude models routed through a proxy, may not reliably follow Shannon Lite's instructions or tool-use constraints. Use them at your own risk.

The experimental `claude-code-router` integration is being removed. If you rely on it, migrate to an Anthropic-compatible proxy such as LiteLLM before upgrading.

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
