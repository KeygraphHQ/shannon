# copilot-proxy

Lightweight proxy used by Shannon to enable GitHub Copilot model access.

What it does

- Exchanges a long-lived `GITHUB_TOKEN` (PAT or OAuth token) for a short-lived Copilot session token via GitHub's internal Copilot token endpoint.
- Caches and auto-refreshes the session token.
- Accepts OpenAI-compatible requests on port `8787` and forwards them to `https://api.githubcopilot.com/chat/completions` with the Copilot Bearer token injected.

Usage

1. Add `GITHUB_TOKEN` to your `.env` (see project `.env.example`).

2. Start Shannon with Copilot enabled (recommended):

```bash
# From project root
./shannon start URL=https://your-app.com REPO=your-repo COPILOT=true
```

Or start the proxy manually via Docker Compose profile `copilot`:

```bash
# Start only the copilot proxy
docker compose up -d --profile copilot copilot-proxy

# Check health
curl http://localhost:8787/health
```

Local development

You can run the proxy directly for development:

```bash
cd copilot-proxy
export GITHUB_TOKEN=ghp_xxx
node index.js
```

Security

- Keep `GITHUB_TOKEN` secret. Do not commit it to source control.
- Tokens exchanged by the proxy are short-lived; the proxy refreshes them automatically.

Notes

- This proxy is intentionally minimal and intended for local / CI use within controlled networks only.
- Copilot integration is experimental and unsupported by Keygraph.
