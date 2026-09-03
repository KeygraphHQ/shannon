> [!NOTE]
> **[Shannon 3.0 is live](https://github.com/KeygraphHQ/shannon/discussions/439):** deeper security code analysis, more thoroughly vetted findings, a rebuilt CLI, native CI/CD, professional PDF reports, and SARIF.

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

<p><strong>Launch Shannon</strong></p>

```bash
npx @keygraph/shannon@latest
```

<sub>The interactive launcher will guide you through setup and your first pentest.</sub>

---

<a href="https://discord.gg/9ZqQPuhJB7"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/discord_button_dark.png"><source media="(prefers-color-scheme: light)" srcset="./assets/discord_button_light.png"><img src="./assets/discord_button_light.png" height="40" alt="Join Discord"></picture></a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://keygraph.io/"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/keygraph_button_dark.png"><source media="(prefers-color-scheme: light)" srcset="./assets/keygraph_button_light.png"><img src="./assets/keygraph_button_light.png" height="40" alt="Visit Keygraph.io"></picture></a>

---

</div>

> [!TIP]
> **AI agents and LLMs:** start with [llms.txt](llms.txt) for a concise map of this repository, or use [llms-full.txt](llms-full.txt) for the README and docs combined into one file.



## Table of Contents

- [Table of Contents](#table-of-contents)
- [What is Shannon?](#what-is-shannon)
  - [Why Shannon Exists](#why-shannon-exists)
  - [Why "Shannon"?](#why-shannon)
  - [Not a replacement for human pentesters](#not-a-replacement-for-human-pentesters)
- [Shannon in Action](#shannon-in-action)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Run Shannon](#run-shannon)
- [Key Capabilities](#key-capabilities)
- [CI/CD Integrations](#cicd-integrations)
  - [GitHub Actions](#github-actions)
- [Editions](#editions)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Safety, Scope, and Limitations](#safety-scope-and-limitations)
- [License](#license)
- [Acknowledgements](#acknowledgements)
- [About Keygraph](#about-keygraph)
- [Community and Support](#community-and-support)
- [Common Questions](#common-questions)
  - [Can I self-host Shannon?](#can-i-self-host-shannon)
  - [Does Shannon support bring your own key (BYOK)?](#does-shannon-support-bring-your-own-key-byok)
  - [Does Shannon output SARIF?](#does-shannon-output-sarif)
  - [Which AI providers does Shannon support?](#which-ai-providers-does-shannon-support)
  - [Can I run Shannon on a local or self-hosted model?](#can-i-run-shannon-on-a-local-or-self-hosted-model)
  - [Does Shannon actually exploit vulnerabilities, or just scan?](#does-shannon-actually-exploit-vulnerabilities-or-just-scan)



## What is Shannon?

Shannon is an autonomous AI pentester developed by [Keygraph](https://keygraph.io). It performs security testing of web applications and their underlying APIs by combining source-code analysis with live exploitation.

Shannon analyzes your web application's source code to identify potential attack vectors, then uses browser automation and command-line tools to execute real exploits against the running application and its APIs. Only vulnerabilities with a working proof-of-concept are included in the final report.

Shannon is the agent. This repository is Shannon Open Source, the standalone pentester you run yourself. The same Shannon also powers the [Keygraph platform](https://keygraph.io), Keygraph's commercial pentesting product. See [Editions](#editions) for how the two compare.

<a id="why-shannon-exists"></a>
<details>
<summary><strong>Why Shannon Exists</strong></summary>

Thanks to tools like Claude Code and Cursor, your team ships code non-stop. But your penetration test? That happens once a year. This creates a massive security gap. For the other 364 days, you could be unknowingly shipping vulnerabilities to production.

Shannon closes that gap by providing on-demand, automated penetration testing that can run against every build or release.

</details>

<a id="why-shannon"></a>
<details>
<summary><strong>Why "Shannon"?</strong></summary>

It's named after Claude Shannon, the father of information theory. At its core, pentesting is an information problem: every probe reduces uncertainty about a system's state. The best tools maximize the signal gained from every request, turning those bits of knowledge into an exploit path.

Also, we wanted you to be able to say, "Hey Claude, run Shannon" to find all the security flaws in your vibe-coded app.

</details>

<a id="not-a-replacement-for-human-pentesters"></a>
<details>
<summary><strong>Not a replacement for human pentesters</strong></summary>

Shannon is built to work alongside expert pentesters and red teamers, not replace them. Great pentesters understand the business, chain attacks in ways nobody anticipated, and bring years of judgment that current models can't match.

Shannon solves a different problem: there is far more software to test than security teams have time to cover. Critical systems get periodic expert assessments, while the long tail of internal apps, APIs, and fast-moving services rarely gets tested at all.

Shannon shifts pentesting left into the software development lifecycle (SDLC). Use it to run exploitation-backed tests against staging environments and releases at the cadence they actually ship, and save expert human time for the risks that need someone who knows the organization.

</details>

## Shannon in Action

![Shannon running an autonomous pentest](assets/Shannon3GIF.gif)

These reports are from Shannon Open Source scans of Photoview 2.4.0, one of the applications in Doyensec's comparison of Aikido and XBOW. We ran Shannon against the same application version and evaluated its results separately. Read the [Doyensec study](https://doyensec.com/resources/ComparingAIApplicationSecurityTestingPlatforms_Doyensec.pdf) and our [Shannon follow-up comparison](docs/shannon-xbow-aikido-benchmark.md) for the methodology, limitations, costs, and results.


| Model             | Report                                                                       | SARIF                                                            |
| ----------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| DeepSeek v4 Flash | [View report](benchmark/photoview-deepseek-v4-flash.pdf) | [SARIF](benchmark/photoview-deepseek-v4-flash.sarif) |
| Grok 4.6          | [View report](benchmark/photoview-grok-4-6.pdf)          | [SARIF](benchmark/photoview-grok-4-6.sarif)          |
| Claude Opus 5     | [View report](benchmark/photoview-opus-5.pdf)            | [SARIF](benchmark/photoview-opus-5.sarif)            |

## Quick Start



### Prerequisites

- **Docker**: required for the worker container.
- **Node.js 18+**: required for the recommended `npx` workflow.
- **AI provider credentials**: Shannon runs on Anthropic, OpenAI, xAI, AWS Bedrock, and [any other provider](docs/ai-providers.md#any-other-provider) in the harness catalogue — each of which you can point at a proxy or LLM gateway through a [custom base URL](docs/ai-providers.md#custom-base-url). You bring your own key, and Keygraph never proxies your model traffic. Shannon is provider-agnostic. See [AI providers](docs/ai-providers.md#suggested-models) for suggested model IDs.
- **Cyber safeguards cleared with your provider**: Anthropic and OpenAI apply real-time safeguards to cyber-security workloads, which can interrupt a scan mid-run. Complete their guidance for legitimate security testers before your first run - see [AI providers](docs/ai-providers.md#cyber-safeguards-do-this-before-your-first-scan).



### Run Shannon

> [!WARNING]
> Shannon actively executes exploits. Run it only against applications and environments you own or have explicit written authorization to test. Do not run Shannon against production systems.

```bash
# Configure credentials with the interactive wizard.
npx @keygraph/shannon@latest setup

# Run a pentest against a source-available target.
npx @keygraph/shannon@latest start \
  -u https://your-app.com \
  -r /path/to/your/repo
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

- **No exploit, no report**: Reports only vulnerabilities confirmed with a reproducible proof of concept, reducing speculative scanner noise.
- **Advanced code analysis**: Maps architecture, trust boundaries, interfaces, data flows, and critical assets before sending credible attack paths to live pentesting agents.
- **Autonomous execution**: Runs reconnaissance, analysis, exploitation, and reporting from a single command.
- **Live terminal experience**: Simplifies scan setup and shows agent progress and results without exposing orchestration logs.
- **Authenticated testing**: Supports credentials, login flows, TOTP, email authentication, focus areas, and rules of engagement through configuration.
- **OWASP-focused coverage**: Tests for exploitable injection, XSS, SSRF, broken authentication, and broken authorization.
- **Resumable workspaces**: Resumes interrupted scans without repeating completed work.
- **Native CI/CD integrations**: Runs through the official GitHub Action or GitLab CI/CD component, preserves artifacts, publishes findings, and gates releases on proven vulnerabilities.
- **Multi-format reports**: Produces evidence-rich PDF and Markdown reports plus JSON and SARIF 2.1.0. SARIF is enabled by default for exploit-mode scans.
- **Provider agnostic and BYOK**: Supports Anthropic, OpenAI, xAI, AWS Bedrock, compatible APIs and LLM gateways, and local models served through Ollama, vLLM, or LM Studio.
- **Private by design**: Runs in your infrastructure, stores results locally, and sends model requests directly to your chosen endpoint. A local endpoint keeps data inside your environment.



## CI/CD Integrations

Shannon can run continuously against deployed staging and development environments through official integrations for [GitHub Actions](https://github.com/KeygraphHQ/shannon-action) and [GitLab CI/CD](https://gitlab.com/KeygraphHQ/shannon-ci).

Both integrations:

- analyze the checked-out source repository while attacking a running target;
- preserve PDF, Markdown, and SARIF reports as pipeline artifacts;
- preserve scan and agent logs for debugging, including incomplete runs;
- support pull-request, release, and scheduled pentests;
- distinguish an incomplete assessment from a completed scan with no findings; and
- optionally fail the pipeline when Shannon exploits a vulnerability at or above a configured severity threshold.

A code-analysis hypothesis does not fail the pipeline. Severity gates count only findings with `status: exploited`.

### GitHub Actions

```yaml
name: Shannon Pentest

on:
  workflow_dispatch:

permissions:
  security-events: write

jobs:
  pentest:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run Shannon
        uses: KeygraphHQ/shannon-action@v1
        with:
          url: https://staging.example.com
          api-key: ${{ secrets.SHANNON_AI_API_KEY }}
          fail-on-severity: high
          upload-sarif: true
```

The Action defaults `repo` to the checked-out GitHub workspace. It uploads one artifact containing the security assessment reports and SARIF, plus a separate run artifact containing scan and agent logs. Enabling `upload-sarif` publishes supported findings to GitHub code scanning.

Requirements:

- a private repository;
- a runner with Docker and Docker Compose v2;
- access to the running staging or development target; and
- a model-provider credential stored as a GitHub Actions secret.

See the [Shannon GitHub Action documentation](https://github.com/KeygraphHQ/shannon-action) and [GitHub Marketplace listing](https://github.com/marketplace/actions/shannon-ai-pentester).

## Editions

**Shannon Open Source** is a complete autonomous pentester, especially well suited to individual developers and small teams running focused security tests locally or in CI/CD.

**Keygraph Enterprise Platform** is for organizations that need a shared platform for continuous agentic pentesting/AppSec across many teams, repositories, and environments. It centralizes deeper analysis, vulnerability management, remediation, verification, governance, and reporting so teams do not have to assemble and maintain those workflows themselves.

[Learn about the Keygraph Enterprise Platform and compare editions →](docs/keygraph-platform.md)

## Architecture

Shannon combines multi-stage security code analysis with live reconnaissance and exploitation:

```mermaid
flowchart TD
    S["Source code"] --> EXISTING["Recon + vulnerability analysis"]
    S --> SAST["Agentic security code analysis"]

    EXISTING -- "Pentest candidates" --> REC["Finding reconciliation<br/>(merge + deduplicate)"]
    SAST -- "SAST candidates" --> REC

    REC -- "Reconciled exploitation queue" --> EXP["Exploitation agents"]
    APP["Running application"] --> EXP

    EXP -- "Exploit demonstrated" --> REPORT["Reporting<br/>PDF · Markdown · SARIF"]
    EXP -- "No exploit demonstrated" --> DROP["Discard"]

    REPORT --> CICD["CI/CD gate"]
```



Stage by stage:

1. **Recon and vulnerability analysis** explores the running application, ties runtime behavior back to the source, and runs specialized agents across Injection, XSS, SSRF, Authentication, and Authorization.
2. **Agentic security code analysis** maps the application's architecture, trust boundaries, exposed interfaces, dependencies, data flows, and high-risk assets, then opens targeted investigations against them.
3. **Finding reconciliation** merges both streams of candidates, deduplicates the overlap, and groups what remains into an exploitation queue.
4. **Exploitation agents** attempt real proof-of-concept attacks against the running application.
5. **Validation** throws out every candidate Shannon can't demonstrate.
6. **Reporting** produces PDF and Markdown reports with the evidence attached, plus structured JSON and SARIF for downstream systems.

Only live-validated vulnerabilities become Shannon pentest findings or count toward CI/CD severity gates.

Each scan runs in an ephemeral Docker container with an isolated workspace and per-invocation orchestration.

## Documentation

Use these guides for operational detail:


| Guide                                                     | Use it for                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Source build and CLI commands](docs/development.md)      | Cloning, building, common commands, output paths, and local development.                                                                                                  |
| [Configuration](docs/configuration.md)                    | Authenticated testing, login flows, rules of engagement, and report filters.                                                                                              |
| [AI providers](docs/ai-providers.md)                      | Selecting the model, the supported providers (Anthropic, OpenAI, xAI, AWS Bedrock, and any other Pi-supported provider), and custom LLM gateways.                             |
| [Platforms and networking](docs/platforms.md)             | Windows/WSL2, Linux, macOS, Docker networking, local apps, and custom hostnames.                                                                                          |
| [Workspaces and resuming](docs/workspaces.md)             | Naming workspaces, resuming interrupted scans, and workspace storage.                                                                                                     |
| [Safety and limitations](docs/safety.md)                  | Authorized-use requirements, non-production guidance, mutative effects, cost, and model caveats.                                                                          |
| [Coverage and roadmap](docs/coverage-roadmap.md)          | Current vulnerability coverage and planned work.                                                                                                                          |
| [Keygraph Enterprise Platform](docs/keygraph-platform.md) | Exhaustive agentic SAST, continuous pentesting, full-lifecycle finding management, remediation, targeted verification, enterprise governance, and on-premises deployment. |




## Safety, Scope, and Limitations

Shannon is not a passive scanner. Its exploitation agents can create users, submit forms, mutate application state, trigger outbound requests, and otherwise affect the target system. Use sandboxed, staging, or local development environments with disposable data.

You are responsible for using Shannon legally and ethically. Do not point Shannon at systems, repositories, or applications you do not own or do not have explicit authorization to test.

Important limitations:

- Shannon Open Source is tuned for fast, code-informed pentesting in everyday development and CI/CD. Exhaustive agentic SAST, broader scanner coverage, centralized governance, and full-lifecycle vulnerability management are delivered through the Keygraph Enterprise Platform.
- Findings still require human review. LLM-generated reports can contain weakly supported or incorrect details.
- Anthropic, OpenAI, xAI, and AWS Bedrock are built-in providers, and any other provider in the harness catalogue works too — each reachable through a custom base URL that points it at a proxy or LLM gateway. Model capability varies, and a model that does not follow Shannon's instructions or tool-use constraints reliably will produce weaker results.
- A full run can take roughly 1 to 1.5 hours and may incur LLM API costs depending on model pricing and application complexity.
- Do not scan untrusted or adversarial codebases. AI-powered tools that read source code can be exposed to prompt injection.

Read the full [Safety and limitations](docs/safety.md) guide before running Shannon in a new environment.

## License

Shannon Open Source is licensed under the [GNU Affero General Public License v3.0](LICENSE).

Commercial and enterprise licensing is available for organizations that need different license terms, commercial support, private redistribution, managed-service use, or broader deployment options, including the Keygraph platform.

For commercial licensing, contact [shannon@keygraph.io](mailto:shannon@keygraph.io).

## Acknowledgements

Thanks to [Pi](https://github.com/earendil-works/pi),
[Playwright CLI](https://github.com/microsoft/playwright-cli),
and [Mantis](https://github.com/google/mantis).

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for licensing and attribution details.

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

Yes. Shannon Open Source runs inside your infrastructure in an ephemeral worker container. It mounts the repository read-only and writes results to a local workspace.

Keygraph never receives your source code and never proxies your model traffic. Your model requests go straight to the provider or endpoint you configure, and they carry source and application context with them. Point Shannon at a locally hosted endpoint and that traffic stays inside your environment too.

### Does Shannon support bring your own key (BYOK)?

Yes, always. You provide the LLM credentials Shannon uses to run a pentest, in every deployment, open source and commercial. Keygraph never proxies your model traffic.

### Does Shannon output SARIF?

Yes. Shannon emits SARIF 2.1.0, the OASIS standard format for static analysis results, alongside structured JSON. Any SARIF consumer reads it: code scanning services, vulnerability management platforms, security dashboards, and CI/CD pipelines. It is written by default on exploit-mode scans; set `report.sarif` to `"false"` in your configuration file to opt out.

### Which AI providers does Shannon support?

Anthropic, OpenAI, xAI, and AWS Bedrock are built in and configured directly by provider ID. Beyond those, Shannon runs on any provider in the Pi harness catalogue, named the same `<provider>:<model-id>` way. Any provider can be pointed at a proxy or LLM gateway through a custom base URL, which overrides only the endpoint and keeps that provider's API dialect. Shannon uses a single unified model setting throughout a pentest.

### Can I run Shannon on a local or self-hosted model?

Shannon works with local models served through Ollama, vLLM, or LM Studio, which expose an OpenAI-compatible endpoint, as well as routers such as OpenRouter and LLM gateways such as LiteLLM. Point Shannon at the endpoint with a custom base URL. Capability varies, and a model that does not follow Shannon's instructions or tool-use constraints reliably will produce weaker pentests than a frontier model, so take this path only if you know how your chosen model behaves. See [AI providers](docs/ai-providers.md#custom-base-url).

### Does Shannon actually exploit vulnerabilities, or just scan?

Shannon executes real exploits. It reports a finding only when it has produced a working proof-of-concept, and discards hypotheses it cannot prove. It is a pentester, not a passive scanner.

**Built by [Keygraph](https://keygraph.io)**
