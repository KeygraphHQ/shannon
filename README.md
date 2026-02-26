# Nayatel PentestAI

A provider-agnostic, autonomous web application pentesting framework.

## What it does

PentestAI runs a multi-stage security pipeline against applications you own:

1. Recon and attack-surface mapping
2. Vulnerability analysis (Injection, XSS, Auth, SSRF, AuthZ)
3. Exploitation validation
4. Final security reporting

It is built on Temporal workflows and supports multiple LLM providers via a unified router.

## Supported LLM providers

- Groq
- Google Gemini
- Ollama (local)
- OpenAI-compatible APIs (OpenAI, Azure, OpenRouter, custom)

Provider routing is configured in `config/models.yaml`.

## Quick start (easy)

### 1) Install

```bash
npm install
```

### 2) Configure env

Use `.env.example` and set at least one provider key:

- `GROQ_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL`

### 3) Build

```bash
npm run build
```

### 4) Start with Docker (recommended)

```bash
docker compose up -d temporal worker
```

Optional Ollama sidecar:

```bash
docker compose --profile ollama up -d
```

### 5) Start a workflow

```bash
npm run temporal:start -- --url <TARGET_URL> --repo <PATH_TO_TARGET_REPO>
```

## Branding

Branding is fully config-driven in `config/branding.yaml`:

- `product_name`
- `company_name`
- `report_footer`

## Docs

- `RUNNING.md` → step-by-step runtime guide
- `DOCKER.md` → Docker-focused deployment guide
- `MIGRATION_GUIDE.md` → migration notes
