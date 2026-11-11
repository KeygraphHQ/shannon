# Shannon plugin

Run [Shannon](https://github.com/KeygraphHQ/shannon), Keygraph's autonomous AI
pentester, from your coding agent (Grok, Cursor, Claude Code). The plugin ships a
single skill that drives the Shannon CLI (`npx @keygraph/shannon`) to start,
monitor, and stop white-box pentests of web apps and APIs you are authorized to
test, with the safety rules from `docs/safety.md` built in.

## Multi-tool

One plugin, two manifests over the same skill, MCP server, and docs:

- **Cursor / Grok** read `.cursor-plugin/plugin.json` + `mcp.json`, indexed by the
  repo-root `.cursor-plugin/marketplace.json`.
- **Claude Code** reads `.claude-plugin/plugin.json` + `.mcp.json`, indexed by the
  repo-root `.claude-plugin/marketplace.json`.

Each tool ignores the other's files. Adding a further tool is additive — another
manifest pointing at the same `skills/`, `mcp/`, and docs — not a rewrite.

## Layout

```
plugins/shannon/
├── .cursor-plugin/plugin.json   # Cursor/Grok manifest
├── .claude-plugin/plugin.json   # Claude Code manifest
├── mcp.json                     # Cursor/Grok MCP declaration (${CURSOR_PLUGIN_ROOT})
├── .mcp.json                    # Claude Code MCP declaration (${CLAUDE_PLUGIN_ROOT})
├── assets/logo.png              # listing logo (Keygraph brand mark, 1200×1200)
├── skills/shannon/SKILL.md      # the skill the agent loads (shared)
├── llms-full.txt, llms.txt      # full Shannon docs, bundled for offline detail (shared)
├── mcp/                         # the stdio MCP server + node launcher (shared)
└── scripts/
    ├── check-plugin.sh          # structure/validation check (both tools)
    └── sync-docs.sh             # refresh bundled docs from the repo-root originals
```

The repo root also carries `.cursor-plugin/marketplace.json` and
`.claude-plugin/marketplace.json`, each listing this plugin at `plugins/shannon`.

## Keeping the bundled docs in sync

`llms-full.txt` and `llms.txt` are bundled under the plugin so the installed
plugin is self-contained, and must stay byte-identical to the repository-root
`llms-full.txt` / `llms.txt`, which are their source of truth. When those
change, refresh the bundled copies:

```sh
plugins/shannon/scripts/sync-docs.sh
```

`check-plugin.sh` fails if they drift, so CI catches a stale copy.

## Safety

Shannon is a defensive security tool. Only run it against systems you own or
are explicitly authorized to test, never production. The skill enforces these
rules and asks for confirmation before the first scan. See the "Safety and
Limitations" section of `llms-full.txt` (source: `docs/safety.md`).

## Install (local development)

Copy `plugins/shannon/` to `~/.cursor/plugins/local/shannon/`, then run
**Developer: Reload Window** in Cursor and confirm Shannon appears under
Customize.
