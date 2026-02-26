# Nayatel PentestAI

Provider-agnostic autonomous pentesting framework for web applications you own.

This guide is written for **GitHub users** and explains how to run everything from scratch on an **Ubuntu server**, including different LLM provider options and your first pentest run.

---

## Table of Contents

- [1) What this project does](#1-what-this-project-does)
- [2) Architecture at a glance](#2-architecture-at-a-glance)
- [3) Prerequisites (Ubuntu)](#3-prerequisites-ubuntu)
- [4) Install from scratch on Ubuntu](#4-install-from-scratch-on-ubuntu)
- [5) Configure LLM providers (all supported types)](#5-configure-llm-providers-all-supported-types)
- [6) Branding / white-label settings](#6-branding--white-label-settings)
- [7) Run with Docker (recommended)](#7-run-with-docker-recommended)
- [8) Run without Docker](#8-run-without-docker)
- [9) Pentest your first application](#9-pentest-your-first-application)
- [10) Authentication config (single credential set)](#10-authentication-config-single-credential-set)
- [11) Output, logs, and report locations](#11-output-logs-and-report-locations)
- [12) Useful operational commands](#12-useful-operational-commands)
- [13) Security and legal usage](#13-security-and-legal-usage)
- [14) Troubleshooting](#14-troubleshooting)

---

## 1) What this project does

PentestAI runs a multi-stage workflow:

1. Reconnaissance and attack surface mapping
2. Vulnerability analysis (Injection, XSS, Auth, SSRF, AuthZ)
3. Exploitation validation
4. Report generation

It uses Temporal for workflow orchestration and a provider-agnostic LLM router for model selection/fallback.

---

## 2) Architecture at a glance

- **Temporal**: orchestrates deterministic workflow + retry behavior
- **Worker**: executes activities and agent pipeline stages
- **LLM Router** (`config/models.yaml`): routes `recon`, `exploit`, `reporting` tasks to configured providers
- **Providers**: Groq, Gemini, Ollama, OpenAI-compatible endpoints
- **Branding config** (`config/branding.yaml`): product/company/report footer customization

---

## 3) Prerequisites (Ubuntu)

Minimum recommended:

- Ubuntu 22.04/24.04
- 4+ vCPU, 8+ GB RAM
- 20+ GB free disk
- Outbound network access to your selected LLM provider(s)

Install required packages:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release git jq
```

Install Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Install Docker Engine + Compose plugin:

```bash
# Docker repo setup
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

---

## 4) Install from scratch on Ubuntu

Clone and install:

```bash
git clone <YOUR_FORK_OR_REPO_URL> pentestai
cd pentestai
npm install
npm run build
```

Optional quick test check:

```bash
node --test tests/*.mjs
```

---

## 5) Configure LLM providers (all supported types)

### 5.1 Environment variables

Copy and edit environment values:

```bash
cp .env.example .env
nano .env
```

Set at least one provider key:

- `GROQ_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_BASE_URL`
- `OLLAMA_HOST` (for local Ollama, default `http://localhost:11434`)

Also set queue/address if needed:

- `TEMPORAL_ADDRESS`
- `TEMPORAL_TASK_QUEUE`

### 5.2 Routing policy (`config/models.yaml`)

This file controls provider routing by task:

- `providers.default`
- `providers.recon`
- `providers.exploit`
- `providers.reporting`
- `providers.fallback` chain

Example strategy:

- recon → Ollama (cheap/local)
- exploit → Gemini (stronger reasoning)
- reporting → Groq/OpenAI-compatible
- fallback → OpenAI-compatible / OpenRouter

### 5.3 Provider-specific notes

#### Groq
- Uses OpenAI-compatible API format
- Good latency/cost profile for many workloads

#### Gemini
- Uses Gemini generation endpoint
- Supports schema-oriented output behavior via router/provider abstraction

#### Ollama (local)
- Ensure service is running and model exists:
  - `ollama pull llama3`
- Good for local/private inference and recon-heavy workloads

#### OpenAI-compatible (OpenAI/Azure/OpenRouter/custom)
- Configure base URL + model + key in `config/models.yaml`
- Useful as universal fallback

---

## 6) Branding / white-label settings

Edit `config/branding.yaml`:

```yaml
product_name: "Nayatel PentestAI"
company_name: "Nayatel"
report_footer: "Confidential Security Audit"
```

These values are consumed by runtime splash/report generation.

---

## 7) Run with Docker (recommended)

Start Temporal + worker:

```bash
docker compose up -d temporal worker
```

Optional Ollama sidecar:

```bash
docker compose --profile ollama up -d
```

Check status/logs:

```bash
docker compose ps
docker compose logs -f worker
```

Stop services:

```bash
docker compose down
# or remove volumes too
docker compose down -v
```

---

## 8) Run without Docker

Start local Temporal dev server:

```bash
npm run temporal:server
```

Start worker in another shell:

```bash
npm run temporal:worker
```

Start workflow:

```bash
npm run temporal:start -- --url <TARGET_URL> --repo <PATH_TO_TARGET_REPO>
```

---

## 9) Pentest your first application

### Step A: Prepare target repo

This framework is designed for **white-box testing** (you control/own the target).

- Put target source under your accessible path
- Ensure app URL is reachable from where worker runs

### Step B: Optional scoped config

Create `configs/my-first-pentest.yaml` from `configs/example-config.yaml`, then set:

- authentication flow
- focus/avoid rules
- pipeline settings

### Step C: Launch workflow

```bash
npm run temporal:start -- --url https://target.example.com --repo /absolute/path/to/target-repo --config ./configs/my-first-pentest.yaml --wait
```

### Step D: Observe progress

- Worker logs (docker or local)
- Audit files in `audit-logs/`

### Step E: Review report

Look for deliverables in workspace output, including final comprehensive report.

---

## 10) Authentication config (single credential set)

Current authentication schema supports one credential set per run:

- `authentication.credentials.username`
- `authentication.credentials.password`
- optional `authentication.credentials.totp_secret`

For multi-role testing (admin/user/etc), run multiple scans with different config files/credentials and compare findings.

---

## 11) Output, logs, and report locations

Primary locations:

- `audit-logs/` → session/workflow outputs
- `deliverables/` inside workspace → intermediate and final pentest artifacts
- `comprehensive_security_assessment_report.md` → final assembled report

---

## 12) Useful operational commands

Build + tests:

```bash
npm run build
node --test tests/*.mjs
```

Temporal helpers:

```bash
npm run temporal:server
npm run temporal:server:stop
npm run temporal:worker
npm run temporal:start -- --help
```

Docker helpers:

```bash
docker compose ps
docker compose logs -f worker
docker compose restart worker
```

---

## 13) Security and legal usage

- Only test applications and infrastructure you own or are explicitly authorized to test.
- Respect organizational policy and legal boundaries.
- Handle credentials and output reports as sensitive security data.

---

## 14) Troubleshooting

### "All configured LLM providers failed"

- Verify API keys in `.env`
- Verify provider blocks and fallback ordering in `config/models.yaml`
- Confirm network egress to provider endpoints

### Ollama errors / model missing

- Ensure Ollama is running
- Pull configured model (e.g., `ollama pull llama3`)
- Check `OLLAMA_HOST` matches runtime network topology

### Temporal worker not processing workflows

- Ensure client and worker use same queue (`TEMPORAL_TASK_QUEUE`)
- Verify `TEMPORAL_ADDRESS`
- Check worker logs for startup errors

### Authentication failed during testing

- Verify `authentication.login_url`
- Validate `login_flow` instructions with real selectors/steps
- Check `success_condition`
- For 2FA, confirm valid `totp_secret`

---

For extra operational detail, see:

- `RUNNING.md`
- `DOCKER.md`
- `MIGRATION_GUIDE.md`
