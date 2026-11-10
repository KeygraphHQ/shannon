# Shannon plugin

Run [Shannon](https://github.com/KeygraphHQ/shannon), Keygraph's autonomous AI
pentester, from your coding agent (Grok, Cursor). The plugin ships a single
skill that drives the Shannon CLI (`npx @keygraph/shannon`) to start, monitor,
and stop white-box pentests of web apps and APIs you are authorized to test,
with the safety rules from `docs/safety.md` built in.

## Layout

```
plugins/shannon/
├── .cursor-plugin/plugin.json   # plugin manifest
├── assets/logo.svg              # listing logo (placeholder — replace with the brand asset)
├── skills/shannon/SKILL.md      # the skill the agent loads
├── llms-full.txt, llms.txt      # full Shannon docs, bundled for offline detail
├── mcp.json, mcp/               # optional MCP server exposing Shannon as typed tools
└── scripts/
    ├── check-plugin.sh          # structure/validation check
    └── sync-docs.sh             # refresh bundled docs from the repo-root originals
```

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
