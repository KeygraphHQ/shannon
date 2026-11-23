# Shannon plugin

Run Shannon, Keygraph's open-source AI pentester, from your coding agent. The
plugin ships one skill, `shannon`, that drives the Shannon CLI through the
agent's shell: it checks prerequisites, scopes the target, validates model
access and login, starts, monitors, and stops scans, then reads the report and
helps fix the findings. It contains no MCP server and no hooks.

One folder serves Claude Code (and the Claude desktop app's Code tab), ChatGPT
and Codex, Grok Build, and Cursor.

## Requirements

- A client that can run shell commands. Without one (for example a chat app),
  the skill gives the user commands to run in their own terminal.
- Node.js **22 or newer** with npx. Avoid Node 22.7.0, which breaks Temporal
  status reads.
- Docker installed and running.
- Model provider credentials configured by the user with
  `npx @keygraph/shannon@latest setup` in their own terminal, or exported in the
  shell that runs Shannon. The skill never asks for or handles a key.

Installing the plugin does not install these prerequisites.

## Install

### Claude Code

```sh
claude plugin marketplace add KeygraphHQ/shannon
claude plugin install shannon@keygraph-shannon
```

### ChatGPT desktop app and Codex CLI

```sh
codex plugin marketplace add KeygraphHQ/shannon
codex plugin add shannon@keygraph-shannon
```

The ChatGPT desktop app reads the same marketplace. Shannon is marked
Desktop only because it runs local programs.

### Grok Build

```sh
grok plugin install 'KeygraphHQ/shannon#plugins/shannon' --trust
```

Use this direct install instead of `grok plugin marketplace add`. Grok clones a
marketplace source with a 15-second limit, and this repository does not clone
in that time.

### Cursor

Copy `plugins/shannon/` into `~/.cursor/plugins/local/shannon/`, reload Cursor,
and confirm the skill appears in Customize.

### Skill only (Claude.ai, other agents)

`scripts/build-skill-zip.sh` packages `skills/shannon/` as a standalone zip.
Upload it in Claude under Customize > Skills, or unzip it into any agent's
skills folder (for example `~/.claude/skills/` or `.agents/skills/`). In
Claude.ai chat the skill runs in a sandbox without Docker, so it guides the user
through running the commands locally.

## Layout

```text
plugins/shannon/
  plugin.json                     portable manifest (Agent Plugins 1.0.0) with OpenAI listing metadata
  .claude-plugin/plugin.json      Claude Code and Grok manifest, with directory listing fields
  .cursor-plugin/plugin.json      Cursor manifest
  skills/shannon/SKILL.md         the skill
  skills/shannon/references/      bundled docs (llms.txt, llms-full.txt) and a config template
  assets/icon.png                 square icon (directory listings, composer)
  assets/logo.png                 square wordmark (Cursor, Grok)
  evals/                          safety eval cases for `claude plugin eval`
  scripts/sync-docs.sh            refresh the bundled docs from the repo root (--check to verify)
  scripts/build-skill-zip.sh      package the standalone skill zip
```

Marketplace indexes live at the repository root: `.claude-plugin/marketplace.json`
(Claude Code, Grok), `.agents/plugins/marketplace.json` (ChatGPT, Codex), and
`.cursor-plugin/marketplace.json` (Cursor).

## Maintenance

- The bundled `llms.txt` and `llms-full.txt` are byte-identical copies of the
  repository-root originals. Run `scripts/sync-docs.sh` after the root docs
  change, and `scripts/sync-docs.sh --check` in CI to catch drift.
- Keep `version` the same in `plugin.json`, `.claude-plugin/plugin.json`, and
  `.cursor-plugin/plugin.json`.
- Validate before release:

```sh
claude plugin validate ./plugins/shannon
claude plugin validate ./.claude-plugin/marketplace.json
claude plugin eval ./plugins/shannon --runs 3 --no-publish
```

Manifest validation does not prove client compatibility or a successful scan.
Confirm in each client that the skill is discovered and can run the CLI.

## Safety

Shannon actively exploits the target. The skill requires the user to confirm
authorization and a non-production target before the first scan, never runs
`reset` or `setup`, never handles provider keys, and uses `--exp-php2shell`
only when the user asks for it by name. These rules are instructions to the
agent, not independent enforcement. Findings need human review, and an empty
report does not prove an application is secure. The full safety guide is in
`skills/shannon/references/llms-full.txt` (from `docs/safety.md`).
