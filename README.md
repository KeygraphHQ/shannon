>[!NOTE]
> **[Better Steerability, Authentication Improvements, and the Migration to the Pi Harness](https://github.com/KeygraphHQ/shannon/discussions/348)**

<div align="center">

<img src="./assets/github-banner.png" alt="Shannon - AI Pentester for Web Applications and APIs" width="100%">

# Shannon - AI Pentester by Keygraph

<a href="https://trendshift.io/repositories/15604" target="_blank"><img src="https://trendshift.io/api/badge/repositories/15604" alt="KeygraphHQ%2Fshannon | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

Shannon is an autonomous, white-box AI pentester for web applications and APIs. <br />
It analyzes your source code, identifies attack paths, and executes real exploits to prove vulnerabilities before they reach production.

---

<a href="https://discord.gg/9ZqQPuhJB7"><img src="./assets/discord.png" height="40" alt="Join Discord"></a>
<a href="https://keygraph.io/"><img src="./assets/Keygraph_Button.png" height="40" alt="Visit Keygraph.io"></a>

---
</div>

> [!TIP]
> **AI agents and LLMs:** start with [llms.txt](llms.txt) for a concise map of this repository, or use [llms-full.txt](llms-full.txt) for the README and docs combined into one file.

## Table of Contents

- [What is Shannon?](#what-is-shannon)
- [Product Line](#product-line)
- [Shannon Lite in Action](#shannon-lite-in-action)
- [Quick Start](#quick-start)
- [Key Capabilities](#key-capabilities)
- [Shannon Lite and Shannon Pro](#shannon-lite-and-shannon-pro)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Safety, Scope, and Limitations](#safety-scope-and-limitations)
- [License and Enterprise Licensing](#license-and-enterprise-licensing)
- [Community and Support](#community-and-support)

## What is Shannon?

Shannon is an AI pentester developed by [Keygraph](https://keygraph.io). It performs white-box security testing of web applications and their underlying APIs by combining source-code analysis with live exploitation.

Shannon analyzes your web application's source code to identify potential attack vectors, then uses browser automation and command-line tools to execute real exploits against the running application and its APIs. Only vulnerabilities with a working proof-of-concept are included in the final report.

### Why Shannon Exists

Thanks to tools like Claude Code and Cursor, your team ships code non-stop. But your penetration test? That happens once a year. This creates a massive security gap. For the other 364 days, you could be unknowingly shipping vulnerabilities to production.

Shannon closes that gap by providing on-demand, automated penetration testing that can run against every build or release.

## Product Line

Shannon is developed by [Keygraph](https://keygraph.io) and available in two editions:

| Edition | License | Best For |
| --- | --- | --- |
| **Shannon Lite** | AGPL-3.0 | Local, strictly white-box testing of applications you own or are authorized to test. |
| **Shannon Pro** | Commercial | Organizations needing a continuous pentesting and AppSec platform with black-box and white-box pentesting, parsed-code SAST, CI/CD gating, verified remediation, SLA tracking, and enterprise deployment. |

## Shannon Lite in Action

<p align="center">
  <img src="assets/shannon-action.gif" alt="Shannon Lite running an autonomous pentest" width="100%">
</p>

Sample Shannon Lite penetration test reports from intentionally vulnerable applications:

| Target | Summary | Report |
| --- | --- | --- |
| OWASP Juice Shop | 20+ vulnerabilities, including authentication bypass, SQL injection, IDOR, and SSRF. | [View report](sample-reports/shannon-report-juice-shop.md) |
| c{api}tal API | Approximately 15 critical and high-severity API findings, including command injection, auth bypass, and mass assignment. | [View report](sample-reports/shannon-report-capital-api.md) |
| OWASP crAPI | 15+ critical and high-severity findings across JWT, injection, SSRF, and API authorization paths. | [View report](sample-reports/shannon-report-crapi.md) |

## Quick Start

### Prerequisites

- **Docker** - required for the worker container.
- **Node.js 18+** - required for the recommended `npx` workflow.
- **AI provider credentials** - Anthropic is recommended; AWS Bedrock, Google Vertex AI, and compatible proxy setups are documented separately.

### Run Shannon Lite

> [!WARNING]
> Shannon Lite actively executes exploits. Run it only against applications and environments you own or have explicit written authorization to test. Do not run Shannon Lite against production systems.

```bash
# Configure credentials with the interactive wizard.
npx @keygraph/shannon setup

# Run a pentest against a source-available target.
npx @keygraph/shannon start -u https://your-app.com -r /path/to/your-repo
```

Shannon Lite pulls the worker image from Docker Hub, starts the required local infrastructure, mounts the target repository read-only inside an ephemeral worker container, and writes results to a local workspace.

For source builds, authenticated scans, provider-specific setup, and platform notes, see [Documentation](#documentation).

## Key Capabilities

- **Proof-by-exploitation reports**: Shannon Lite reports validated findings with reproducible proof-of-concept steps instead of speculative warnings.
- **White-box attack planning**: Shannon Lite uses source-code analysis to guide dynamic testing and focus on realistic attack paths.
- **Autonomous execution**: Shannon Lite launches reconnaissance, vulnerability analysis, exploitation, and report generation from a single command.
- **Authenticated testing**: Shannon Lite configuration files can describe login flows, test credentials, TOTP, email-based login flows, focus areas, and rules of engagement.
- **OWASP-focused coverage**: Shannon Lite targets exploitable Injection, XSS, SSRF, Broken Authentication, and Broken Authorization issues.
- **Resumable workspaces**: Shannon Lite can resume interrupted runs without re-running completed agents.

## Shannon Lite and Shannon Pro

This repository contains **Shannon Lite**, the AGPL-3.0 open-source CLI for strictly white-box, proof-by-exploitation testing of web applications and APIs you own or are authorized to test. Shannon Lite requires access to the target application's source code and repository layout.

**Shannon Pro** is Keygraph's commercial continuous pentesting and AppSec platform for teams running security across many repositories, services, and environments. While Shannon Lite is a local white-box pentesting CLI, Shannon Pro is a full platform: it combines parsed-code SAST, source-to-sink analysis, black-box and white-box agentic pentesting, verified remediation, CI/CD gating, SLA tracking, and reporting for security and compliance teams.

Shannon Pro supports both **white-box and black-box agentic pentesting**: use source-aware testing when code is available, or run autonomous black-box testing against deployed applications and APIs when source access is unavailable or unnecessary.

Shannon Pro covers the full vulnerability lifecycle: finding exploitable issues, deduplicating and prioritizing them, syncing work into developer workflows, generating verified remediations, re-testing fixes, tracking SLAs, and producing dashboards for security reporting and compliance.

For enterprise deployments, Shannon Pro supports self-hosted and air-gapped environments, strict bring-your-own-key model access, and customer-controlled LLM gateway patterns. Deployments can be designed so source code, scan results, prompts, completions, and model traffic remain inside your security perimeter.

Shannon Lite is a strong fit for local and project-level white-box testing. Shannon Pro is intended for organizations that need continuous AppSec coverage, black-box and white-box pentesting, centralized triage, verified remediation workflows, compliance-ready reporting, enterprise integrations, and commercial support.

| Need | Shannon Lite | Shannon Pro |
| --- | --- | --- |
| License | AGPL-3.0 | Commercial |
| White-box pentesting | Yes; source code required | Yes; source-aware testing with platform workflows |
| Black-box pentesting | No | Yes; autonomous testing without source-code access |
| Code analysis / SAST | Prompting and source pass-through to guide pentesting | Actual code parsing, Code Property Graph analysis, source-to-sink path analysis, and agentic SAST |
| AppSec coverage | OWASP-focused agentic pentesting | Agentic pentesting, SAST, SCA, secrets, IaC, containers, and business logic testing |
| CI/CD and gating | Manual/local CLI runs | Headless commercial CLI for CI/CD gating across enterprise CI/CD platforms |
| Finding lifecycle | Local Markdown reports | Canonical findings, deduplication, ownership, status, SLA tracking, workflow sync, and reporting dashboards |
| Remediation | Manual | User-initiated remediation with verification before delivery |
| Fix verification | None; manual reruns only | Targeted verification without rerunning the entire scan, completing the remediation lifecycle |
| Enterprise deployment | Local CLI and Docker worker | Self-hosted, air-gapped, BYOK, and customer-controlled LLM gateway options |
| Support | Community | Commercial support |

Learn more on the [Keygraph website](https://keygraph.io), read the [Shannon Pro technical overview](docs/shannon-pro.md), start a free trial or book a [Shannon Pro demo](https://cal.com/team/keygraph/shannon-pro), or contact [shannon@keygraph.io](mailto:shannon@keygraph.io).

## Architecture

Shannon Lite uses a multi-agent workflow that combines source-code analysis with live exploitation:

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
- **Reporting** compiles validated findings, evidence, and remediation guidance into a final Markdown report.

Each scan runs in an ephemeral Docker container with an isolated workspace and per-invocation orchestration.

## Documentation

Use these guides for operational detail:

| Guide | Use it for |
| --- | --- |
| [Source build and CLI commands](docs/development.md) | Cloning, building, common commands, output paths, and local development. |
| [Configuration](docs/configuration.md) | Authenticated testing, login flows, rules of engagement, report filters, and rate-limit settings. |
| [AI providers](docs/ai-providers.md) | Anthropic, AWS Bedrock, Google Vertex AI, and custom Anthropic-compatible endpoints. |
| [Platforms and networking](docs/platforms.md) | Windows/WSL2, Linux, macOS, Docker networking, local apps, and custom hostnames. |
| [Workspaces and resuming](docs/workspaces.md) | Naming workspaces, resuming interrupted scans, and workspace storage. |
| [Safety and limitations](docs/safety.md) | Authorized-use requirements, non-production guidance, mutative effects, cost, and model caveats. |
| [Coverage and roadmap](docs/coverage-roadmap.md) | Current vulnerability coverage and planned work. |
| [Shannon Pro](docs/shannon-pro.md) | Commercial platform, black-box and white-box pentesting, full lifecycle workflows, and enterprise deployment. |

## Safety, Scope, and Limitations

Shannon Lite is not a passive scanner. Its exploitation agents can create users, submit forms, mutate application state, trigger outbound requests, and otherwise affect the target system. Use sandboxed, staging, or local development environments with disposable data.

You are responsible for using Shannon Lite legally and ethically. Do not point Shannon Lite at systems, repositories, or applications you do not own or do not have explicit authorization to test.

Important limitations:

- Shannon Lite focuses on actively exploitable issues such as Injection, XSS, SSRF, Broken Authentication, and Broken Authorization. Broader static-analysis findings, including vulnerable dependencies and insecure configurations, are a core focus of Shannon Pro.
- Findings still require human review. LLM-generated reports can contain weakly supported or incorrect details.
- Shannon Lite is officially supported with Claude models. Smaller, alternative, or proxied non-Claude models may be incomplete or unstable.
- A full run can take roughly 1 to 1.5 hours and may incur LLM API costs depending on model pricing and application complexity.
- Do not scan untrusted or adversarial codebases; AI-powered tools that read source code can be exposed to prompt injection.

Read the full [Safety and limitations](docs/safety.md) guide before running Shannon Lite in a new environment.

## License and Enterprise Licensing

Shannon Lite is licensed under the [GNU Affero General Public License v3.0](LICENSE).

Commercial and enterprise licensing is available for organizations that need different license terms, commercial support, private redistribution, managed-service use, or broader deployment options.

For commercial licensing, contact [shannon@keygraph.io](mailto:shannon@keygraph.io).

## Community and Support

**Community office hours** are available for hands-on help with bugs, deployments, and configuration questions.

- US/EU: Thursday, 10:00 AM PT
- Asia: Thursday, 2:00 PM IST
- [Book a slot](https://cal.com/george-flores-keygraph/shannon-community-office-hours)

[Join Discord](https://discord.gg/cmctpMBXwE) to ask questions, share feedback, and connect with other Shannon Lite users.

At this time, Keygraph is not accepting external code contributions. Issues are welcome for bug reports and feature requests:

- [Report bugs](https://github.com/KeygraphHQ/shannon/issues)
- [Suggest features](https://github.com/KeygraphHQ/shannon/discussions)

Stay connected:

- [Keygraph website](https://keygraph.io)
- [Twitter/X: @KeygraphHQ](https://twitter.com/KeygraphHQ)
- [LinkedIn: Keygraph](https://linkedin.com/company/keygraph)

<p align="center">
  <b>Built by <a href="https://keygraph.io">Keygraph</a></b>
</p>
