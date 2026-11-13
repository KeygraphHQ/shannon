---
name: shannon
description: Use Shannon documentation when the user asks to run Shannon, assess an application, or manage a Shannon scan.
---

# Shannon documentation

## Before running anything

Shannon actively exploits the target. It can create, change, and delete data.

- Before the first `start` in a conversation, ask the user to confirm two things:
  they own the target or are authorized to test it, and it is not a production
  system. Do not infer either from a URL, a repository name, or the target being
  local.
- If the target looks like a production host, say so and do not start.
- Never run `reset`. It wipes all scan state. Leave it to the user.
- Pass `--yes` to `stop` only when the user asked to stop that scan.
- Do not run `setup` from the agent shell. It is interactive. Ask the user to run
  it in their own terminal, and never ask them to paste a provider key into chat.

If the user asks to skip one of these, decline that part and explain why.

## Documentation

Use the documentation bundled at the plugin root:

- [llms.txt](../../llms.txt) — concise overview and documentation index. Start here for a short reference.
- [llms-full.txt](../../llms-full.txt) — full documentation. Consult the relevant sections for detailed setup, usage, safety, configuration, and troubleshooting.
