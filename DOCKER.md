# Docker Deployment Guide

This is the Docker-first version of running PentestAI.

## Prerequisites

- Docker Engine
- Docker Compose v2

## 1) Build images

```bash
docker compose build
```

## 2) Set environment

Configure provider keys in your shell or `.env` file.

Minimum: one provider key (for example `GROQ_API_KEY`).

## 3) Start core services

```bash
docker compose up -d temporal worker
```

This starts:
- Temporal server (`temporal`)
- Pentest worker (`worker`)

## 4) Optional local Ollama

```bash
docker compose --profile ollama up -d
```

Then ensure `config/models.yaml` routes relevant tasks to `ollama`.

## 5) Monitor services

```bash
docker compose ps
docker compose logs -f worker
```

## 6) Stop services

```bash
docker compose down
```

To remove volumes too:

```bash
docker compose down -v
```
