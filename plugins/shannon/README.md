# Shannon skill plugin

A skill-only plugin for running Shannon from Claude Code, Grok Build, or Cursor.
The skill points the agent to the bundled overview and full documentation. The
agent uses those docs to run the Shannon CLI through its shell tool.

## Requirements

- A client that permits shell execution. Otherwise, the agent can provide commands
  for the user to run in a terminal.
- Node.js **22 or newer**, with npm/npx available. Avoid Node 22.7.0 because it
  breaks Temporal status reads.
- Docker installed and running.
- Provider credentials configured through `npx @keygraph/shannon@latest setup`
  in the user's terminal, or available in the shell that runs Shannon.

Installing the skill does not install these prerequisites or configure credentials.
Commands use the published `@keygraph/shannon@latest` CLI; no plugin build or
package installation is needed.

## Install

### Claude Code

```sh
claude plugin marketplace add KeygraphHQ/shannon
claude plugin install shannon@keygraph-shannon
```

For a local checkout:

```sh
claude plugin validate ./plugins/shannon
claude --plugin-dir ./plugins/shannon
```

### Grok Build

Grok documents support for Claude-compatible marketplace indexes and skill
components. This plugin uses that route, separately from Cursor's manifest.

```sh
grok plugin marketplace add KeygraphHQ/shannon
grok plugin install shannon --trust
```

Confirm the plugin is enabled and trusted in `/plugins` and the skill appears in
`/skills`. A local checkout can be validated with
`grok plugin validate ./plugins/shannon`.

### Cursor

For local development, copy `plugins/shannon/` into
`~/.cursor/plugins/local/shannon/`, reload Cursor, and confirm the skill appears
in Customize. Cursor uses `.cursor-plugin/plugin.json`.

The remote marketplace commands apply once this plugin is on the repository's
default branch. Before merge, use local plugin or marketplace loading.

## Layout

```text
plugins/shannon/
  .claude-plugin/plugin.json   Claude-compatible plugin metadata
  .cursor-plugin/plugin.json  Cursor plugin metadata
  skills/shannon/SKILL.md      entry point to the bundled documentation
  llms-full.txt               bundled detailed documentation
  llms.txt                    documentation index
  assets/logo.png             marketplace logo
```

The repository root contains the Claude-compatible and Cursor marketplace indexes.
The skill and documentation are shared across clients.

## Validation and maintenance

```sh
claude plugin validate ./plugins/shannon
claude plugin validate ./.claude-plugin/marketplace.json
```

Before release, manually verify the manifests, skill name, logo, marketplace
entries, and bundled documentation. Confirm that each advertised client discovers
the skill and can run the CLI through its shell. Manifest validation alone does not establish
client compatibility or successful scan execution.

`llms.txt` and `llms-full.txt` are byte-identical copies of the root originals.
When the originals change, copy both files from the repository root into
`plugins/shannon/`. Keep both plugin manifest versions aligned when releasing updates.

Runtime verification can use temporary synthetic fixtures outside the repository;
no plugin test suite is included.

## Safety

Only test systems the user owns or is authorized to assess, and never production.
Consult the bundled safety documentation before starting a scan. Documentation
is not independent authorization enforcement. Findings require
human review, and an empty report does not prove an application is secure.

The full safety guide is included in `llms-full.txt` from `docs/safety.md`.

## References

- [Claude plugin authoring](https://code.claude.com/docs/en/plugins/create)
- [Grok plugins and marketplaces](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md)
- [Cursor plugin reference](https://cursor.com/docs/reference/plugins)
