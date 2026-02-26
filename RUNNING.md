# PentestAI  - Run Guide

This repository runs an AI-driven pentest pipeline with Temporal workers and a provider-agnostic LLM router.

## 1) Prerequisites

- Node.js 20+
- npm
- Docker + Docker Compose (recommended)

## 2) Install dependencies

```bash
npm install
```

## 3) Configure environment

Copy `.env.example` values into your shell or environment file and set keys for at least one provider:

- `GROQ_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL`
- Optional local model server: `OLLAMA_HOST`

You can tune provider routing in:

- `config/models.yaml`
- `config/branding.yaml`

## 4) Build

```bash
npm run build
```

## 5) Run with Docker Compose (recommended)

Start Temporal + worker:

```bash
docker compose up -d temporal worker
```

Optional: start Ollama sidecar too:

```bash
docker compose --profile ollama up -d
```

## 6) Run locally (without Compose)

Start Temporal server (if not already running):

```bash
npm run temporal:server
```

Then run worker:

```bash
npm run temporal:worker
```

Start a pipeline workflow:

```bash
npm run temporal:start -- --url <TARGET_URL> --repo <PATH_TO_TARGET_REPO>
```

## 7) Output and logs

- Runtime/audit logs: `./audit-logs`
- Generated reports: workspace output under the configured output directory

## 8) Quick health checks

```bash
npm run build
node --test tests/*.mjs
```

## 9) Common troubleshooting

- **All providers failed**: verify keys and `config/models.yaml` routing/fallback order.
- **Ollama errors**: ensure Ollama is running and model is installed (`ollama pull <model>`).
- **Temporal connection errors**: confirm `TEMPORAL_ADDRESS` and Temporal container health.

