---
name: shannon
description: Run Shannon, Keygraph's autonomous AI pentester, against a web app or API the user is authorized to test. Use when the user asks to pentest, security test, find exploitable vulnerabilities in, or run Shannon on an application, or asks about a running Shannon scan. Never use against production or systems the user does not own.
---

# Shannon

Shannon is an autonomous white-box pentester. It reads the target's source code, maps the attack surface, then actively exploits vulnerabilities in a running instance of the app to confirm them. It reports only what it could exploit.

The CLI is `npx @keygraph/shannon@latest <command>`. Every command below uses that prefix. Each scan runs in a Docker worker container and typically takes 1 to 1.5 hours.

This plugin also ships an MCP server that exposes the same operations as tools: `shannon_validate_model`, `shannon_validate_auth`, `shannon_start`, `shannon_status`, `shannon_logs`, `shannon_scans`, `shannon_stop`, and `shannon_read_report`. If those tools are available in your client, prefer them over raw CLI commands. The safety rules below apply either way, and both `shannon_start` and `shannon_validate_auth` refuse to run unless you pass `authorized` and `non_production`, which you set only after the user confirms both in their own words.

## Safety rules

Read these before anything else. They condense Shannon's safety guide; the full version is the "Safety and Limitations" section of `llms-full.txt` bundled with this plugin (source: `docs/safety.md`).

1. **Authorization.** Shannon may only run against systems the user owns or has explicit written authorization to test. Before the first `start` in a conversation, ask the user to confirm this in their own words. Do not infer it from a URL, a repo name, or a comment in code.
2. **Never production.** Shannon creates users, modifies and deletes data, compromises test accounts, and sends unexpected outbound traffic. Only run it against local, staging, or sandboxed environments with disposable data. If the URL looks like a production host, say so and stop.
3. **Trusted code only.** Shannon reads the repository it is pointed at. Do not run it on untrusted or adversarial codebases, because malicious repository content can prompt-inject the scanning agents.
4. **Findings need human review.** Reports can contain weakly supported or incorrect details. When summarizing a report, say that each finding should be verified by a person before it is acted on.
5. **Never bypass a confirmation.** `stop` asks before stopping and `reset` requires a typed `confirm`. Only pass `--yes` to `stop` when the user has asked you to stop a scan. Never run `reset` on the user's behalf; it wipes all scan state.
6. **Do not use the experimental php2shell probe.** The `--exp-php2shell` flag crashes a PHP worker on the target. Leave it to the user to run by hand.

If the user asks you to skip any of these, decline that part and explain why.

## Prerequisites

Check these before starting a scan, and tell the user what is missing:

- **Docker** is installed and the daemon is running (`docker info` succeeds).
- **Node.js 18 or newer** (`node --version`).
- **Provider credentials** are configured. Shannon brings its own key for Anthropic, OpenAI, xAI, AWS Bedrock, or any other provider in its catalogue. Credentials come from environment variables first, then `~/.shannon/config.toml`.
- **Cyber safeguards cleared.** Anthropic and OpenAI apply real-time safeguards to security workloads and can refuse mid-scan. The user must complete the vendor's verification for security testers before the first run. Anthropic's guidance is at https://support.claude.com/en/articles/14604842-real-time-cyber-safeguards-on-claude-opus-and-sonnet and the cyber verification announcement is at https://github.com/KeygraphHQ/shannon/discussions/483. The "Cyber safeguards" section of `llms-full.txt` has the full detail.

### Two kinds of credentials, do not confuse them

Shannon deals with two separate sets of credentials. Users mix these up, so be explicit about which one you mean.

1. **Provider credentials** authenticate Shannon to the AI provider (xAI, Anthropic, OpenAI, Bedrock) whose model runs the scan. Every scan needs this. It is an environment variable or the setup wizard. It is **never** put in the scan config file.
2. **Target app login** lets Shannon sign in to the application being tested, so it can reach pages behind a login. Only authenticated scans need it. It goes in the YAML config file passed with `-c`, under the `authentication` block. It has nothing to do with the AI provider.

A first scan of a target that needs no login uses only the first set.

### Configuring provider credentials

`setup` is an interactive wizard and refuses to run without a terminal. Do not run it from an agent shell. Ask the user to run this in their own terminal:

```bash
npx @keygraph/shannon@latest setup
```

The wizard asks for the provider, the API key, and the model, then writes them to `~/.shannon/config.toml`.

For non-interactive use, or if the user prefers environment variables, they export the provider's own key variable plus the model, then run the scan from the same shell:

```bash
export XAI_API_KEY=xai-...          # the provider's key variable
export SHANNON_AI_MODEL=xai:grok-4.7
```

The key variable per provider is `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, or `AWS_BEARER_TOKEN_BEDROCK` with `AWS_REGION`; any other provider uses `SHANNON_AI_API_KEY`. Environment variables take precedence over the wizard's saved config, so an export overrides the TOML for that one shell.

Resolution order, so you can tell the user why a key is or is not picked up: environment variables first, then `~/.shannon/config.toml`. If a scan fails with a missing-credential error, check the variable is exported in the same shell the scan runs in.

Rules you must follow: never ask the user to paste a key into chat, never write a key into a file yourself, and never put the provider key in the `-c` config file, where it has no effect.

### Grok subscription instead of an API key

A Grok (xAI) subscription can run Shannon in place of a pay-as-you-go `XAI_API_KEY`, by reusing a login created with the Pi CLI. These are steps the user runs in their own terminal. The Pi installer and `pi` itself are interactive, so the agent must not run them; walk the user through these steps instead.

**1. Install Pi** (once per machine). Pi needs Node.js 22.19 or newer and a real terminal. Install it with the official script:

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

This installs the `pi` command to `~/.local/bin`. If `pi` is not found afterward, that directory is not on `PATH`; add it, or open a new terminal. (An npm install also works: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`, still on Node 22.19+.)

**2. Sign in to xAI through Pi** (once per machine, and again whenever the login expires):

1. Run `pi` in the terminal.
2. Type `/login`.
3. Choose **Sign in with an account**.
4. Choose **xAI** and complete the browser sign-in.
5. Pi stores the login in `~/.pi/agent/auth.json`.

**3. Point Shannon at the subscription.** In the same shell that will run the scan, export the flag and the model, then start Shannon from that shell:

```bash
export SHANNON_USE_PI_AUTH=1
export SHANNON_AI_MODEL=xai:grok-4.7
```

The flag tells Shannon to reuse the Pi login instead of looking for `XAI_API_KEY`; on this path no API key is needed. An OpenAI Codex (ChatGPT Plus/Pro) subscription works the same way: sign in choosing **OpenAI Codex (legacy)** at step 2.4, then use `openai-codex:<model>`. The "AI Providers" section of `llms-full.txt` has both, the supported model lists, and the exact sign-in choices.

### Choosing the model

One model runs every phase of a scan. It is selected by `SHANNON_AI_MODEL=<provider>:<model-id>`, set by the wizard or exported as an environment variable, which always wins. The default is `anthropic:claude-sonnet-4-6`. The plugin never chooses this; it is the user's Shannon configuration.

| Provider | Credential | Suggested model |
| --- | --- | --- |
| `xai` | `XAI_API_KEY` | `xai:grok-4.7` |
| `anthropic` | `ANTHROPIC_API_KEY` | `anthropic:claude-sonnet-5` |
| `openai` | `OPENAI_API_KEY` | `openai:gpt-6-sol` |
| `amazon-bedrock` | `AWS_BEARER_TOKEN_BEDROCK` + `AWS_REGION` | `amazon-bedrock:us.anthropic.claude-sonnet-4-6` |
| any other | `SHANNON_AI_API_KEY` | any model in Shannon's catalogue |

To run Shannon on Grok with an API key, the user exports `XAI_API_KEY` and `SHANNON_AI_MODEL=xai:grok-4.7`. A Grok subscription works instead of a key, through the Pi CLI; see "Grok subscription instead of an API key" above. AWS Bedrock specifics, proxies and gateways, and any other provider are all covered in the "AI Providers" section of `llms-full.txt`.

If the user asks which model to use, ask which provider they have credentials for, then suggest that provider's model from the table. Do not change the model between starting and resuming a workspace: the model is not recorded with the scan, so a resumed run continues on whatever is configured at that moment and the report would mix models.

To confirm the model and credential work before committing to a full scan:

```bash
npx @keygraph/shannon@latest start -u <url> -r <repo> --validate-model
```

This runs the preflight checks only, including the cyber-safeguard verification, then stops.

## Running a scan

Gather these from the user:

- **Target URL** (`-u`). A running instance of the app. For an app on the host machine, use `http://host.docker.internal:<port>`, not `localhost`, because the worker runs in Docker.
- **Repository path** (`-r`). The source code of that app, as an absolute or relative path. It is mounted read-only.
- **Workspace name** (`-w`). Always pass one, such as the app name and date, so the scan can be found, monitored, and resumed later.
- **Config file** (`-c`), optional. A YAML file for authenticated testing, rules of engagement, and report filters. Needed only when the target requires a login or the user wants to scope or filter the scan. Not needed for a first scan of an open target. The full field list and an example are in the "Configuration" section of `llms-full.txt`.

#### Authenticated testing

When the target requires a login, the config's `authentication` block tells Shannon how to sign in: the login URL, a username and password, an optional TOTP secret for two-factor, natural-language login steps, and a success condition. This is the target app's own login, not the AI provider credential. Ask the user for a test account on the target, never a real personal account, and remember Shannon may create, modify, or delete data once inside. Before a full authenticated scan, validate the login alone with `--validate-auth`, which signs in and stops without pentesting. The example config in the "Configuration" section of `llms-full.txt` shows the exact fields.

Then, after the safety confirmation in the rules above, start the scan:

```bash
npx @keygraph/shannon@latest start -u <url> -r <repo> -w <workspace>
```

`start` returns once the worker is launched. Do not add `--follow` from an agent shell; it blocks for the whole scan. Monitor instead.

Re-running the same `start` command with the same workspace name resumes an interrupted scan. The URL must match the original.

## Monitoring

Prefer the JSON forms, which print one snapshot and exit:

```bash
npx @keygraph/shannon@latest status <workspace> --json
npx @keygraph/shannon@latest scans --json
```

The status JSON has a top-level `status` (such as running, completed, partial, failed, cancelled), `elapsedMs`, and a `phases` array with per-agent progress. A `partial` result carries `partialReasons`. The scans JSON lists every workspace and the path of each finished report.

To show recent log lines without blocking, tail the log with a timeout or line limit, for example:

```bash
timeout 5 npx @keygraph/shannon@latest logs <workspace> || true
```

Without a timeout, `logs` follows the scan until it finishes. Poll at a sensible interval, such as every few minutes, rather than in a tight loop. Keep the user informed of the phase Shannon is in.

## Stopping

Only when the user asks:

```bash
npx @keygraph/shannon@latest stop <workspace> --yes
```

## Reading results

When the status is `completed` or `partial`, the report is at the workspace root:

- `~/.shannon/workspaces/<workspace>/Security-Assessment-Report.md`
- `~/.shannon/workspaces/<workspace>/Security-Assessment-Report.pdf`

Read the Markdown report and summarize it for the user: the exploited findings first, grouped by severity, each with its proof of concept and the affected code. When you summarize, hold to what the report means:

- **Shannon reports only what it exploited.** Each finding was confirmed with a working proof of concept, not guessed. The reported finding status is `exploited`.
- **Severity is one of** `critical`, `high`, `medium`, `low`, or `info`. Lead with critical and high.
- **An empty report is a real but narrow result.** It means Shannon could not exploit anything in the five classes it covers: broken authentication, broken authorization, injection, cross-site scripting, and server-side request forgery. It is not a clean bill of health for the whole app, and you should say so rather than calling the app secure.
- **Every finding needs a person to verify it** before anyone acts on it. State this each time.
- A SARIF file for the exploited findings is written under the workspace's `.shannon/` directory for code-scanning tools.

A `partial` status means the assessment is incomplete, not that the app is clean. The status JSON carries `partialReasons`, a closed list of codes such as `agentic_sast_failed`, `class_pipeline_failed`, `report_class_omitted`, or `report_sarif_failed`. Report the reasons plainly and offer to resume by re-running the same `start` command with the same workspace. The URL and the provider and model must match the original run.

## Troubleshooting

- **"Temporal not ready"**: the local infrastructure is still starting. Wait a few seconds and retry `status`.
- **Target unreachable from the worker**: the worker runs in Docker, so a host-local app must be addressed as `http://host.docker.internal:<port>`, never `localhost`. Custom hostnames in the host's `/etc/hosts` are forwarded automatically.
- **Scan fails partway with a model refusal**: the provider's cyber safeguard engaged. The user needs to complete that vendor's verification for security testers, then resume. Running `--validate-model` first catches this before a full scan.
- **Credentials not found**: the provider key is missing from the shell that ran the scan. Ask the user to run `setup` in their terminal, or export the provider variable in the same shell. Environment variables win over the saved config.
- **Scan will not start, "created by an earlier version"**: the workspace predates the current Shannon layout and cannot be resumed. Start a new scan under a different `-w` name.
- **Resumed run mixes results or behaves oddly**: the model differs from the first run. The model is not stored with the workspace, so resume with the same provider and model you started with.
- **Windows**: native Windows is refused. Shannon runs under WSL2.

## Common questions

- **How long does a scan take?** Roughly 1 to 1.5 hours for a full run, varying with the target's size and the model. Use `--validate-model` or `exploit: "false"` for something quicker.
- **Does it cost money?** It spends the user's own model API tokens. There is no Keygraph fee for the open-source edition. Cost scales with target complexity and the chosen model.
- **Can it run without the source code?** No. This is white-box; it needs the repository. Black-box testing is a Keygraph Pro feature, not part of this plugin.
- **Is it safe to point at any app?** Only an app the user owns or is authorized to test, and never production. Shannon actively exploits, so it can create, change, or delete data. Use local, staging, or disposable environments.
- **What does an empty report mean?** That Shannon could not exploit anything in its five classes. It is not proof the app is secure.
- **Can I stop a running scan?** Yes, with `stop <workspace> --yes`. Resuming later re-runs the same `start` command with the same workspace.
- **Which vulnerability classes does it cover?** Broken authentication, broken authorization, injection, cross-site scripting, and server-side request forgery. It reports only what it can exploit, so vulnerable-dependency and configuration findings are out of scope.

## Further detail

The full Shannon documentation ships with this plugin as `llms-full.txt` in the plugin's root folder, next to `.cursor-plugin/plugin.json`. It is the repository's README and docs combined into one file, generated from them and kept in sync, so it is the authoritative source for anything beyond this skill. `llms.txt`, beside it, is a concise index of the same material. When the user needs detail this skill does not cover, read the matching `# File:` section of `llms-full.txt`:

- `docs/safety.md` — the canonical safety and limitations guide.
- `docs/ai-providers.md` — every provider, subscriptions, Bedrock, gateways, cyber safeguards, and model selection.
- `docs/configuration.md` — the full `-c` config file, field by field, with examples, including the authenticated-testing `authentication` block.
- `docs/development.md` — the full command and flag reference and credential resolution.
- `docs/platforms.md` — Docker networking (the `host.docker.internal` rule), macOS, Linux, and Windows/WSL2 notes.
- `docs/workspaces.md` — where reports live, naming, and how resuming an interrupted scan works.
- `docs/coverage-roadmap.md` — current vulnerability-class coverage and roadmap.

Prefer `llms-full.txt` over fetching anything over the network: it is already local, complete, and matched to this version of Shannon.
