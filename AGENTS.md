# Agent Guidelines for Shannon Uncontained

> *For AI agents, LLM assistants, and automated contributors working on this codebase.*

---

## 🍴 Fork Context

### Repository Situation

This is **Shannon Uncontained**, a fork of the original Shannon project:

| Attribute | Value |
|:----------|:------|
| **This Fork** | `github.com/Steake/shannon` |
| **Upstream** | `github.com/KeygraphHQ/shannon` |
| **Fork Name** | Shannon Uncontained |
| **License** | AGPL-3.0 (inherited from upstream) |

### Key Differences from Upstream

1. **No Docker requirement** — Native Node.js execution is the default
2. **Black-box reconnaissance** — Local Source Generator for targets without source code
3. **Multi-provider LLM** — Claude, OpenAI, and GitHub Models support
4. **GitHub Models integration** — Uses `openai/gpt-4.1` via GitHub's inference API

### Branch Strategy

- `main` — Stable fork releases
- `feature/local-source-generator` — Active development branch for black-box features
- Upstream sync happens manually; we cherry-pick relevant updates

---

## 📋 Documentation Requirements

### When Making Changes

**Always update these files when modifying the codebase:**

#### 1. `MODS.md` — Modifications Log

Document all significant changes:
- New files created
- Modified files and what changed
- Configuration changes
- Dependency additions

Format:
```markdown
## [Feature Name] (YYYY-MM-DD)

### Overview
Brief description of what was added/changed.

### Changes Made
- **`path/to/file.js`** — What was modified
- **`path/to/new-file.js`** — [NEW] What it does

### Configuration
Any environment variables or config changes needed.
```

#### 2. `LSG-TODO.md` — Local Source Generator Roadmap

If working on black-box reconnaissance features:
- Check items off as completed (`[x]`)
- Mark items in progress (`[/]`)
- Add new items discovered during development
- Update priority table if priorities shift

#### 3. `README.md` — User-Facing Documentation

Update if:
- Adding new CLI flags or usage patterns
- Changing installation requirements
- Adding new features users should know about

---

## 🎯 Current Development Focus

### Priority Tasks (from LSG-TODO.md)

| Priority | Task | Status |
|:---------|:-----|:------:|
| **P0** | Error handling & graceful degradation | 🚧 |
| **P0** | Auto-detect black-box mode | ❌ |
| **P0** | Multi-provider LLM support | ✅ |
| **P1** | YAML config support | 🚧 |
| **P1** | Improve pseudo-source quality | ❌ |

### Implementation Guidance

Follow the phased approach in `LSG-TODO.md`:

1. **Phase 1: Core Stability** — Error handling, output quality, testing
2. **Phase 2: Pipeline Integration** — Shannon core integration, config system
3. **Phase 3: Advanced Features** — LLM analysis, API discovery, fingerprinting
4. **Phase 4: Enterprise** — CI/CD, reporting, compliance (low priority)

---

## 🔧 Technical Notes

### Environment Variables

```bash
# Required (one of these)
GITHUB_TOKEN=ghp_...           # For GitHub Models
ANTHROPIC_API_KEY=sk-ant-...   # For Claude
OPENAI_API_KEY=sk-...          # For OpenAI

# Optional
CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
```

### Key Files

| File | Purpose |
|:-----|:--------|
| `src/ai/github-client.js` | GitHub Models integration (OpenAI SDK) |
| `local-source-generator.mjs` | Black-box reconnaissance entry point |
| `src/local-source-generator/` | LSG module components |
| `src/prompts/prompt-manager.js` | Prompt loading and variable injection |
| `prompts/pre-recon-code.txt` | Pre-reconnaissance prompt (compressed for token limits) |

### GitHub Models Constraints

- Model: `openai/gpt-4.1` (recommended)
- Endpoint: `https://models.github.ai/inference`
- Tool schemas must be OpenAI-compatible JSON Schema format
- Rate limits apply based on your GitHub account tier

---

## 🚫 What NOT to Do

1. **Don't use Docker in examples** — Native execution is our identity
2. **Don't assume source code access** — Black-box is a first-class mode
3. **Don't hardcode Claude** — Multi-provider support must be maintained
4. **Don't commit test outputs** — `test-output*/` directories are gitignored
5. **Don't forget to update docs** — MODS.md and LSG-TODO.md must stay current

---

## 📝 Commit Message Format

```
type: Short description

- Detail 1
- Detail 2
```

Types:
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes nor adds
- `test:` — Adding tests
- `chore:` — Maintenance tasks

---

## 🤝 Relationship with Upstream

We are not hostile to the original Shannon project. Our modifications are:
- Documented and attributed
- Available for upstream consideration
- Compliant with AGPL-3.0

If upstream accepts any of our features, we consider that a success.

---

*Last updated: 2024-12-20*
