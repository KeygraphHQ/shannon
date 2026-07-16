> [!NOTE]
> **[Shannon Now Runs on the Pi Harness (Beta) - run it today with `npx @keygraph/shannon@beta`](https://github.com/KeygraphHQ/shannon/discussions/358)**

<div align="center">

<img src="./assets/github-banner.png" alt="Shannon - AI Pentester by Keygraph" width="100%">

# Shannon - AI Pentester by Keygraph

<a href="https://trendshift.io/repositories/15604" target="_blank"><img src="https://trendshift.io/api/badge/repositories/15604" alt="KeygraphHQ%2Fshannon | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

Shannon is an autonomous, white-box AI pentester for web applications and APIs. <br />
It analyzes your source code, identifies attack paths, and executes real exploits to prove vulnerabilities before they reach production.

**This repository is Shannon Open Source: the full agent, run locally from your command line.**

---

<a href="https://discord.gg/9ZqQPuhJB7"><img src="./assets/discord.png" height="40" alt="Join Discord"></a>
<a href="https://keygraph.io/"><img src="./assets/Keygraph_Button.png" height="40" alt="Visit Keygraph.io"></a>

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
- [License and Enterprise Licensing](#license-and-enterprise-licensing)
- [About Keygraph](#about-keygraph)
- [Community and Support](#community-and-support)

## What is Shannon?

Shannon is an autonomous AI pentester developed by [Keygraph](https://keygraph.io). It performs white-box security testing of web applications and their underlying APIs by combining source-code analysis with live exploitation.

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
- **AI provider credentials**: Anthropic is recommended. AWS Bedrock and compatible proxy setups are documented separately.

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

## Key Capabilities

- **Proof-by-exploitation reports**: Shannon reports validated findings with reproducible proof-of-concept steps instead of speculative warnings.
- **White-box attack planning**: Shannon uses source-code analysis to guide dynamic testing and focus on realistic attack paths.
- **Autonomous execution**: Shannon launches reconnaissance, vulnerability analysis, exploitation, and report generation from a single command.
- **Authenticated testing**: configuration files can describe login flows, test credentials, TOTP, email-based login flows, focus areas, and rules of engagement.
- **OWASP-focused coverage**: Shannon targets exploitable Injection, XSS, SSRF, Broken Authentication, and Broken Authorization issues.
- **Resumable workspaces**: Shannon can resume interrupted runs without re-running completed agents.

## Editions

Shannon ships in two ways: **Shannon Open Source**, the pentester you run yourself, and the **Keygraph platform**, the commercial pentesting product that runs Shannon continuously and closes the full AppSec lifecycle around it.

**Shannon Open Source** (this repository) is the standalone pentester: a CLI agent for white-box, proof-by-exploitation testing of web applications and APIs you own or are authorized to test. It reads your source, plans attacks, executes real exploits, and reports only what it can prove. It runs on demand and is complete in that lane. You point it at a target, it pentests, it reports.

The **Keygraph platform** is the enterprise-ready, continuous pentesting product powered by Shannon. In the Keygraph platform, an enhanced build of Shannon runs continuously in a hardened, orchestrated environment fed by Keygraph's full code-analysis stack. Around that engine, the platform closes the entire vulnerability lifecycle, from analysis to a verified fix:

- **Analyze**: Code Property Graph SAST, SCA with reachability, secrets, IaC, and container scanning. First-class detection in their own right, and context that sharpens Shannon's attacks.
- **Prove**: autonomous black-box and source-aware white-box pentests turn candidate findings into proven, exploited vulnerabilities rather than speculative alerts.
- **Manage**: one canonical record per vulnerability per repository, deduplicated across every source, with ownership, status, SLA tracking, dashboards, and bidirectional Jira sync.
- **Remediate and verify**: patches written automatically and re-tested against the patched code before delivery, landing in your existing review workflow rather than auto-applied.
- **Deploy**: self-hosted and air-gapped environments, strict bring-your-own-key model access, and customer-controlled LLM gateway patterns, so source, results, and model traffic stay inside your perimeter.

Shannon is the proof engine at the center of the Keygraph platform. Shannon Open Source gives you that engine to run yourself. The Keygraph platform surrounds Shannon with continuous analysis, finding management, remediation, verification, and enterprise deployment.

| AppSec lifecycle stage | Shannon Open Source | Keygraph platform |
| --- | --- | --- |
| Analyze | Basic LLM pass-through of source to plan attacks | Actual code-base parsing, plus Code Property Graph, SAST, SCA with reachability, secrets, IaC, and containers |
| Pentest and prove | White-box only, proof by exploitation | Enhanced white-box, plus black-box and grey-box modes, run continuously |
| Manage findings | Local Markdown report | Canonical findings system: deduplication across sources, ownership, SLA, dashboards, Jira sync, and professional pentest-grade PDF reports |
| Remediate and verify | Fix manually from the report, then re-run the full scan to verify | Automated remediation: opens a PR with the fix, verified by point re-test without re-running the full scan |
| Deploy and operate | Local CLI and Docker worker | Self-hosted, air-gapped, BYOK, continuous, enterprise integrations |
| License and support | AGPL-3.0, community | Commercial, supported |

Learn more on the [Keygraph website](https://keygraph.io), read the [Keygraph platform technical overview](docs/keygraph-platform.md), start a free trial or book a [demo](https://cal.com/team/keygraph/shannon-pro), or contact [shannon@keygraph.io](mailto:shannon@keygraph.io).

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
- **Reporting** compiles validated findings, evidence, and remediation guidance into a final Markdown report.

Each scan runs in an ephemeral Docker container with an isolated workspace and per-invocation orchestration.

## Documentation

Use these guides for operational detail:

| Guide | Use it for |
| --- | --- |
| [Source build and CLI commands](docs/development.md) | Cloning, building, common commands, output paths, and local development. |
| [Configuration](docs/configuration.md) | Authenticated testing, login flows, rules of engagement, report filters, and rate-limit settings. |
| [AI providers](docs/ai-providers.md) | Anthropic, AWS Bedrock, and custom Anthropic-compatible endpoints. |
| [Platforms and networking](docs/platforms.md) | Windows/WSL2, Linux, macOS, Docker networking, local apps, and custom hostnames. |
| [Workspaces and resuming](docs/workspaces.md) | Naming workspaces, resuming interrupted scans, and workspace storage. |
| [Safety and limitations](docs/safety.md) | Authorized-use requirements, non-production guidance, mutative effects, cost, and model caveats. |
| [Coverage and roadmap](docs/coverage-roadmap.md) | Current vulnerability coverage and planned work. |
| [Keygraph platform](docs/keygraph-platform.md) | The continuous, agentic pentesting platform: code analysis, black-box and white-box testing, finding management, remediation, verification, and enterprise deployment. |

## Safety, Scope, and Limitations

Shannon is not a passive scanner. Its exploitation agents can create users, submit forms, mutate application state, trigger outbound requests, and otherwise affect the target system. Use sandboxed, staging, or local development environments with disposable data.

You are responsible for using Shannon legally and ethically. Do not point Shannon at systems, repositories, or applications you do not own or do not have explicit authorization to test.

Important limitations:

- Shannon Open Source focuses on actively exploitable issues such as Injection, XSS, SSRF, Broken Authentication, and Broken Authorization. Broader static-analysis coverage, including vulnerable dependencies and insecure configurations, is delivered through the Keygraph platform.
- Findings still require human review. LLM-generated reports can contain weakly supported or incorrect details.
- Shannon is officially supported with Claude models. Smaller, alternative, or proxied non-Claude models may be incomplete or unstable.
- A full run can take roughly 1 to 1.5 hours and may incur LLM API costs depending on model pricing and application complexity.
- Do not scan untrusted or adversarial codebases. AI-powered tools that read source code can be exposed to prompt injection.

Read the full [Safety and limitations](docs/safety.md) guide before running Shannon in a new environment.

## License and Enterprise Licensing

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

<p align="center">
  <b>Built by <a href="https://keygraph.io">Keygraph</a></b>
</p>
