> [!NOTE]
> **Shannon 3.0 is live:** deeper security code analysis, a rebuilt terminal experience, native CI/CD workflows, professional PDF reports, and SARIF—still fully open source, self-hosted, and bring-your-own-model.

<div align="center">

<picture>
<source media="(prefers-color-scheme: dark)" srcset="./assets/github-banner-dark.png">
<source media="(prefers-color-scheme: light)" srcset="./assets/github-banner-light.png">
<img src="./assets/github-banner-light.png" alt="Shannon, AI Pentester for Web Apps and APIs, by Keygraph" width="100%">
</picture>

<a href="https://trendshift.io/repositories/15604" target="_blank"><img src="https://trendshift.io/api/badge/repositories/15604" alt="KeygraphHQ%2Fshannon | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

### Shannon is an autonomous, AI pentester for web applications and APIs. 

It analyzes your source code, identifies attack paths, and executes real exploits to prove vulnerabilities before they reach production. **No exploit, no report.**

**This repository is Shannon Open Source: the full agent, run locally from your command line.**

---

<a href="https://discord.gg/9ZqQPuhJB7"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/discord_button_dark.png"><source media="(prefers-color-scheme: light)" srcset="./assets/discord_button_light.png"><img src="./assets/discord_button_light.png" height="40" alt="Join Discord"></picture></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://keygraph.io/"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/keygraph_button_dark.png"><source media="(prefers-color-scheme: light)" srcset="./assets/keygraph_button_light.png"><img src="./assets/keygraph_button_light.png" height="40" alt="Visit Keygraph.io"></picture></a>

---

</div>

> [!TIP]
> **AI agents and LLMs:** start with [llms.txt](llms.txt) for a concise map of this repository, or use [llms-full.txt](llms-full.txt) for the README and docs combined into one file.

## Table of Contents

- [What is Shannon?](#what-is-shannon)
- [Shannon in Action](#shannon-in-action)
- [Quick Start](#quick-start)
- [Key Capabilities](#key-capabilities)
- [Editions](#editions)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Safety, Scope, and Limitations](#safety-scope-and-limitations)
- [License](#license)
- [About Keygraph](#about-keygraph)
- [Community and Support](#community-and-support)
- [Common Questions](#common-questions)

## What is Shannon?

Shannon is an autonomous AI pentester developed by [Keygraph](https://keygraph.io). It performs security testing of web applications and their underlying APIs by combining source-code analysis with live exploitation.

Shannon analyzes your web application's source code to identify potential attack vectors, then uses browser automation and command-line tools to execute real exploits against the running application and its APIs. Only vulnerabilities with a working proof-of-concept are included in the final report.

Shannon is the agent. This repository is Shannon Open Source, the standalone pentester you run yourself. The same Shannon also powers the [Keygraph platform](https://keygraph.io), Keygraph's commercial pentesting product. See [Editions](#editions) for how the two compare.

### Why Shannon Exists

Thanks to tools like Claude Code and Cursor, your team ships code non-stop. But your penetration test? That happens once a year. This creates a massive security gap. For the other 364 days, you could be unknowingly shipping vulnerabilities to production.

Shannon closes that gap by providing on-demand, automated penetration testing that can run against every build or release.

## Shannon in Action

<p align="center">
  <img src="assets/shannon-action.gif" alt="Shannon running an autonomous pentest" width="100%">
</p>

Sample penetration test reports from intentionally vulnerable applications, produced by Shannon Open Source:

| Target | Summary | Report |
| --- | --- | --- |
| OWASP Juice Shop | 20+ vulnerabilities, including authentication bypass, SQL injection, IDOR, and SSRF. | [View report](sample-reports/shannon-report-juice-shop.md) |
| c{api}tal API | Approximately 15 critical and high-severity API findings, including command injection, auth bypass, and mass assignment. | [View report](sample-reports/shannon-report-capital-api.md) |
| OWASP crAPI | 15+ critical and high-severity findings across JWT, injection, SSRF, and API authorization paths. | [View report](sample-reports/shannon-report-crapi.md) |

## Quick Start

### Prerequisites

- **Docker**: required for the worker container.
- **Node.js 18+**: required for the recommended `npx` workflow.
- **AI provider credentials**: Shannon runs on Anthropic, OpenAI, xAI, AWS Bedrock, [any other provider](docs/ai-providers.md#any-other-provider) in the harness catalogue, and any endpoint that speaks the Anthropic Messages API or the OpenAI Chat Completions or Responses API through a [custom base URL](docs/ai-providers.md#custom-base-url). You bring your own key, and Keygraph never proxies your model traffic. Shannon is provider-agnostic. See [AI providers](docs/ai-providers.md#suggested-models) for suggested model IDs.
- **Cyber safeguards cleared with your provider**: Anthropic and OpenAI apply real-time safeguards to cyber-security workloads, which can interrupt a scan mid-run. Complete their guidance for legitimate security testers before your first run - see [AI providers](docs/ai-providers.md#cyber-safeguards-do-this-before-your-first-scan).

### Run Shannon

> [!WARNING]
> Shannon actively executes exploits. Run it only against applications and environments you own or have explicit written authorization to test. Do not run Shannon against production systems.

```bash
# Configure credentials with the interactive wizard.
npx @keygraph/shannon setup

# Run a pentest against a source-available target.
npx @keygraph/shannon start -u https://your-app.com -r /path/to/your-repo
```

Shannon pulls the worker image from Docker Hub, starts the required local infrastructure, mounts the target repository read-only inside an ephemeral worker container, and writes results to a local workspace.

For source builds, authenticated scans, provider-specific setup, and platform notes, see [Documentation](#documentation).

> [!TIP]
> **Prefer to use a subscription instead of API credits?**
>
> - **OpenAI Codex:** The latest version of Shannon supports ChatGPT Plus and Pro subscriptions. Follow the [OpenAI Codex subscription setup guide](docs/ai-providers.md#openai-codex-chatgpt-pluspro-subscription) to get started.
> - **xAI (Grok):** The latest version of Shannon supports xAI subscriptions. Follow the [xAI subscription setup guide](docs/ai-providers.md#xai-grok-subscription) to get started.
> - **Claude Code:** The latest version of Shannon does not support Claude Code subscriptions. Follow the [Claude Code subscription setup guide](docs/ai-providers.md#claude-code-subscription) to use version `1.9.0`, which is the final release built on the Claude Agent SDK.

## Key Capabilities

- **No exploit, no report**: Shannon includes a vulnerability only after validating it with a working, reproducible proof of concept—eliminating the speculative warnings typical of scanners.
- **Advanced security code analysis**: Before sending a payload, Shannon maps API routes, traces data flows, and synthesizes the application's architecture so it can plan realistic, multi-step attacks instead of blindly fuzzing endpoints.
- **Autonomous execution**: Shannon launches reconnaissance, vulnerability analysis, exploitation, and report generation from a single command.
- **Live terminal experience**: A rebuilt CLI makes scans easy to configure and shows agent progress and clean results without requiring operators to inspect the underlying orchestration logs.
- **Authenticated testing**: configuration files can describe login flows, test credentials, TOTP, email-based login flows, focus areas, and rules of engagement.
- **OWASP-focused coverage**: Shannon targets exploitable Injection, XSS, SSRF, Broken Authentication, and Broken Authorization issues.
- **Resumable workspaces**: Shannon can resume interrupted runs without re-running completed agents.
- **Native CI/CD**: Run Shannon headlessly from GitHub Actions, GitLab CI, or another pipeline and gate releases by finding severity.
- **Professional and machine-readable reports**: Shannon generates evidence-rich PDF and Markdown reports plus structured JSON and SARIF 2.1.0. SARIF is enabled by default on exploit-mode scans and can be disabled with `report.sarif: "false"`.
- **Bring your own key, provider-agnostic**: Shannon runs on Anthropic, OpenAI, xAI, AWS Bedrock, and any endpoint speaking the Anthropic Messages API or the OpenAI Chat Completions or Responses API, including self-hosted models served through Ollama, vLLM, or LM Studio and gateways such as OpenRouter and LiteLLM. You supply the credentials and choose exactly where model traffic goes. Local and self-hosted models are technically supported but not recommended: they may not follow Shannon's instructions or tool-use constraints as reliably as frontier models, so take that path only if you know how your chosen model behaves.
- **Private by design**: Shannon runs on your infrastructure and sends no product telemetry. For a fully air-gapped deployment, route it to a local model endpoint.

## Editions

**Shannon Open Source** is the complete autonomous pentester for developers and security teams. It is optimized for fast local and CI/CD runs: understand the application, execute real attacks, and report only proven vulnerabilities.

**Keygraph Enterprise Platform** turns Shannon's proof engine into an organization-wide AppSec program, adding exhaustive analysis, centralized vulnerability management, automated remediation, enterprise governance, and continuous operation at scale.

| | Shannon Open Source | Keygraph Enterprise Platform |
| --- | --- | --- |
| Best for | Local and CI/CD pentesting | Continuous AppSec across teams and repositories |
| Security analysis | Fast, code-informed white-box pentesting | Exhaustive agentic SAST plus continuous white-box, black-box, and grey-box pentesting |
| Additional coverage | Not included | SCA with reachability, secrets scanning, and business-logic testing |
| AppSec operations | N/A — standalone CLI | Canonical findings, deduplication, SLAs, analytics, automated remediation, and targeted verification |
| Governance | N/A — local, single-operator CLI | SSO, SCIM, granular access control, APIs, and full audit logging |
| Deployment | Self-hosted, air-gapped, BYOM, AGPL-3.0 | On-premises or air-gapped, granular model routing, commercial support |

Shannon Open Source is not a trial edition. Choose Keygraph Enterprise when you need deeper analysis and a governed, closed-loop AppSec program.

[Explore the Keygraph Enterprise Platform →](docs/keygraph-platform.md)

## Architecture

Shannon uses a multi-agent workflow that combines source-code analysis with live exploitation:

```text
        ┌──────────────────────┐
        │   Pre-Reconnaissance │
        │   (source code scan) │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │   Reconnaissance     │
        │  (attack surface     │
        │   mapping)           │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────┴───────────┐
        │          │           │
        ▼          ▼           ▼
  ┌───────────┐ ┌───────────┐ ┌───────────┐
  │ Vuln      │ │ Vuln      │ │   ...     │
  │(Injection)│ │  (XSS)    │ │           │
  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
        │              │             │
        ▼              ▼             ▼
  ┌───────────┐ ┌───────────┐ ┌───────────┐
  │ Exploit   │ │ Exploit   │ │   ...     │
  │(Injection)│ │  (XSS)    │ │           │
  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
        │              │             │
        └──────┬───────┴─────────────┘
               │
               ▼
        ┌──────────────────────┐
        │      Reporting       │
        └──────────────────────┘
```

At a high level:

- **Pre-reconnaissance** identifies frameworks, entry points, data flows, and likely attack surfaces from the repository.
- **Reconnaissance** explores the live application and correlates runtime behavior with code-level context.
- **Vulnerability analysis** runs specialized agents for Injection, XSS, SSRF, Authentication, and Authorization.
- **Exploitation** attempts real proof-of-concept attacks and discards hypotheses that cannot be proven.
- **Reporting** compiles validated findings, evidence, severity, and reproduction steps into professional PDF and Markdown reports, with structured JSON and SARIF for downstream systems.

Each scan runs in an ephemeral Docker container with an isolated workspace and per-invocation orchestration.

## Documentation

Use these guides for operational detail:

| Guide | Use it for |
| --- | --- |
| [Source build and CLI commands](docs/development.md) | Cloning, building, common commands, output paths, and local development. |
| [Configuration](docs/configuration.md) | Authenticated testing, login flows, rules of engagement, and report filters. |
| [AI providers](docs/ai-providers.md) | Selecting the model, the supported providers (Anthropic, OpenAI, xAI, AWS Bedrock, and any other Pi-supported provider), and custom gateways. |
| [Platforms and networking](docs/platforms.md) | Windows/WSL2, Linux, macOS, Docker networking, local apps, and custom hostnames. |
| [Workspaces and resuming](docs/workspaces.md) | Naming workspaces, resuming interrupted scans, and workspace storage. |
| [Safety and limitations](docs/safety.md) | Authorized-use requirements, non-production guidance, mutative effects, cost, and model caveats. |
| [Coverage and roadmap](docs/coverage-roadmap.md) | Current vulnerability coverage and planned work. |
| [Keygraph Enterprise Platform](docs/keygraph-platform.md) | Exhaustive agentic SAST, continuous pentesting, full-lifecycle finding management, remediation, targeted verification, enterprise governance, and on-premises deployment. |

## Safety, Scope, and Limitations

Shannon is not a passive scanner. Its exploitation agents can create users, submit forms, mutate application state, trigger outbound requests, and otherwise affect the target system. Use sandboxed, staging, or local development environments with disposable data.

You are responsible for using Shannon legally and ethically. Do not point Shannon at systems, repositories, or applications you do not own or do not have explicit authorization to test.

Important limitations:

- Shannon Open Source is tuned for fast, code-informed pentesting in everyday development and CI/CD. Exhaustive agentic SAST, broader scanner coverage, centralized governance, and full-lifecycle vulnerability management are delivered through the Keygraph Enterprise Platform.
- Findings still require human review. LLM-generated reports can contain weakly supported or incorrect details.
- Anthropic, OpenAI, xAI, and AWS Bedrock are built-in providers, and any Anthropic Messages API or OpenAI Chat Completions or Responses API endpoint works through a custom base URL. Model capability varies, and a model that does not follow Shannon's instructions or tool-use constraints reliably will produce weaker results.
- A full run can take roughly 1 to 1.5 hours and may incur LLM API costs depending on model pricing and application complexity.
- Do not scan untrusted or adversarial codebases. AI-powered tools that read source code can be exposed to prompt injection.

Read the full [Safety and limitations](docs/safety.md) guide before running Shannon in a new environment.

## License

Shannon Open Source is licensed under the [GNU Affero General Public License v3.0](LICENSE).

Commercial and enterprise licensing is available for organizations that need different license terms, commercial support, private redistribution, managed-service use, or broader deployment options, including the Keygraph platform.

For commercial licensing, contact [shannon@keygraph.io](mailto:shannon@keygraph.io).

## About Keygraph

**Keygraph** is the company behind Shannon. It also builds the **Keygraph platform**, the commercial agentic pentesting product that closes the full AppSec lifecycle and runs an enhanced build of Shannon as its pentesting engine.

## Community and Support

**Community office hours** are available for hands-on help with bugs, deployments, and configuration questions.

- US/EU: Thursday, 10:00 AM PT
- Asia: Thursday, 2:00 PM IST
- [Book a slot](https://cal.com/george-flores-keygraph/shannon-community-office-hours)

[Join Discord](https://discord.gg/cmctpMBXwE) to ask questions, share feedback, and connect with other Shannon users.

At this time, Keygraph is not accepting external code contributions. Issues are welcome for bug reports and feature requests:

- [Report bugs](https://github.com/KeygraphHQ/shannon/issues)
- [Suggest features](https://github.com/KeygraphHQ/shannon/discussions)

Stay connected:

- [Keygraph website](https://keygraph.io)
- [Twitter/X: @KeygraphHQ](https://twitter.com/KeygraphHQ)
- [LinkedIn: Keygraph](https://linkedin.com/company/keygraph)

## Common Questions

### Can I self-host Shannon?

Yes. Shannon Open Source runs entirely on your own infrastructure in an ephemeral Docker container. Your source code is mounted read-only and never leaves your environment.

### Does Shannon support bring your own key (BYOK)?

Yes, always. You provide the LLM credentials Shannon uses to run a pentest, in every deployment, open source and commercial. Keygraph never proxies your model traffic.

### Does Shannon output SARIF?

Yes. Shannon emits SARIF 2.1.0, the OASIS standard format for static analysis results, alongside structured JSON. Any SARIF consumer reads it: code scanning services, vulnerability management platforms, security dashboards, and CI/CD pipelines. It is written by default on exploit-mode scans; set `report.sarif` to `"false"` in your configuration file to opt out.

### Which AI providers does Shannon support?

Anthropic, OpenAI, xAI, and AWS Bedrock are built in and configured directly by provider ID. Beyond those, Shannon runs on any endpoint that implements the Anthropic Messages API or the OpenAI Chat Completions or Responses API, reached through a custom base URL. The rule is the API format, not the vendor. Shannon uses a single unified model setting throughout a pentest.

### Can I run Shannon on a local or self-hosted model?

Technically yes, but it is not recommended. Shannon works with local models served through Ollama, vLLM, or LM Studio, which expose an OpenAI-compatible endpoint, as well as routers such as OpenRouter and gateways such as LiteLLM. Point Shannon at the endpoint with a custom base URL. Capability varies, and a model that does not follow Shannon's instructions or tool-use constraints reliably will produce weaker pentests than a frontier model, so take this path only if you know how your chosen model behaves. See [AI providers](docs/ai-providers.md#custom-base-url).

### Does Shannon actually exploit vulnerabilities, or just scan?

Shannon executes real exploits. It reports a finding only when it has produced a working proof-of-concept, and discards hypotheses it cannot prove. It is a pentester, not a scanner.

<p align="center">
  <b>Built by <a href="https://keygraph.io">Keygraph</a></b>
</p>
