# Migration Guide: Multi-Provider LLM + White-Label Branding

## 1) New Configuration Files
- `config/models.yaml`: task/provider routing, provider credentials, fallback chain.
- `config/branding.yaml`: product/company/footer branding.

## 2) Environment Variables
Set provider keys as needed:
- `GROQ_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_BASE_URL`
- `OLLAMA_HOST`

## 3) Runtime Behavior
- Agent execution now routes through `LLMRouter`.
- Routing is task-aware (`recon`, `exploit`, `reporting`) and supports automatic fallback.
- Usage and latency are logged per request.

## 4) Temporal Compatibility
- Workflow/activity structure and contracts are unchanged.
- Existing `runClaudePrompt` contract is preserved while underlying provider implementation is provider-agnostic.

## 5) Branding Changes
- Splash screen and report footer now use `config/branding.yaml`.
- Update branding values without code changes.

## 6) Docker
- `docker-compose.yml` now includes provider-specific env vars and optional `ollama` sidecar profile.
- Start Ollama sidecar with: `docker compose --profile ollama up -d`.
