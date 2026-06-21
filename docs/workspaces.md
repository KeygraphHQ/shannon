# Workspaces and Resuming

Shannon uses workspaces to store scan state, logs, prompts, and deliverables. Workspaces allow interrupted or failed runs to resume without re-running completed agents.

## How Workspaces Work

- Every run creates a workspace.
- Auto-named workspaces use the target hostname and a session ID, such as `example-com_shannon-1771007534808`.
- `npx` mode stores workspaces in `~/.shannon/workspaces/`.
- Source-build mode stores workspaces in `./workspaces/`.
- Use `-w <name>` to give a run a custom name.
- To resume a run, pass the same workspace name with `-w`.
- Each agent's progress is checkpointed so resumed runs can skip completed work.

> [!NOTE]
> The URL must match the original workspace URL when resuming. Shannon rejects mismatched URLs to prevent cross-target contamination.

## Examples

Start with a named workspace:

```bash
npx @keygraph/shannon start -u https://example.com -r /path/to/repo -w my-audit
```

Resume the same workspace:

```bash
npx @keygraph/shannon start -u https://example.com -r /path/to/repo -w my-audit
```

Resume an auto-named workspace:

```bash
npx @keygraph/shannon start -u https://example.com -r /path/to/repo -w example-com_shannon-1771007534808
```

List all workspaces:

```bash
npx @keygraph/shannon workspaces
```

Source-build equivalents:

```bash
./shannon start -u https://example.com -r /path/to/repo -w my-audit
./shannon start -u https://example.com -r /path/to/repo -w example-com_shannon-1771007534808
./shannon workspaces
```
