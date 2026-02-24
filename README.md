> [!NOTE]
> **[Shannon Lite achieves a 96.15% success rate on a hint-free, source-aware XBOW benchmark. &rarr;](https://github.com/KeygraphHQ/shannon/tree/main/xben-benchmark-results/README.md)**


<div align="center">

<a href="https://trendshift.io/repositories/15604" target="_blank"><img src="https://trendshift.io/api/badge/repositories/15604" alt="KeygraphHQ%2Fshannon | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

<img src="./assets/github-banner.png" alt="Shannon — AI Penetration Testing Framework" width="100%">

# Shannon is your fully autonomous AI pentester.

Shannon’s job is simple: break your web app before anyone else does. <br />
The Red Team to your vibe-coding Blue team. <br />
Every Claude (coder) deserves their Shannon.

---

[Website](https://keygraph.io) • [Discord](https://discord.gg/KAqzSHHpRt)

---
</div>

## 🎯 What is Shannon?

Shannon is an AI pentester that delivers actual exploits, not just alerts.

Shannon's goal is to break your web app before someone else does. It autonomously hunts for attack vectors in your code, then uses its built-in browser to execute real exploits, such as injection attacks, and auth bypass, to prove the vulnerability is actually exploitable.

**What Problem Does Shannon Solve?**

Thanks to tools like Claude Code and Cursor, your team ships code non-stop. But your penetration test? That happens once a year. This creates a *massive* security gap. For the other 364 days, you could be unknowingly shipping vulnerabilities to production.

Shannon closes this gap by acting as your on-demand whitebox pentester. It doesn't just find potential issues. It executes real exploits, providing concrete proof of vulnerabilities. This lets you ship with confidence, knowing every build can be secured.

> [!NOTE]
> **From Autonomous Pentesting to Automated Compliance**
>
> Shannon is a core component of the **Keygraph Security and Compliance Platform**.
>
> While Shannon automates the critical task of penetration testing for your application, our broader platform automates your entire compliance journey—from evidence collection to audit readiness. We're building the "Rippling for Cybersecurity," a single platform to manage your security posture and streamline compliance frameworks like SOC 2 and HIPAA.
>
> ➡️ **[Learn more about the Keygraph Platform](https://keygraph.io)**

## 🎬 See Shannon in Action

**Real Results**: Shannon discovered 20+ critical vulnerabilities in OWASP Juice Shop, including complete auth bypass and database exfiltration. [See full report →](sample-reports/shannon-report-juice-shop.md)

![Demo](assets/shannon-action.gif)

## ✨ Features

- **Fully Autonomous Operation**: Launch the pentest with a single command. The AI handles everything from advanced 2FA/TOTP logins (including sign in with Google) and browser navigation to the final report with zero intervention.
- **Pentester-Grade Reports with Reproducible Exploits**: Delivers a final report focused on proven, exploitable findings, complete with copy-and-paste Proof-of-Concepts to eliminate false positives and provide actionable results.
- **Critical OWASP Vulnerability Coverage**: Currently identifies and validates the following critical vulnerabilities: Injection, XSS, SSRF, and Broken Authentication/Authorization, with more types in development.
- **Code-Aware Dynamic Testing**: Analyzes your source code to intelligently guide its attack strategy, then performs live, browser and command line based exploits on the running application to confirm real-world risk.
- **Powered by Integrated Security Tools**: Enhances its discovery phase by leveraging leading reconnaissance and testing tools—including **Nmap, Subfinder, WhatWeb, and Schemathesis**—for deep analysis of the target environment.
- **Parallel Processing for Faster Results**: Get your report faster. The system parallelizes the most time-intensive phases, running analysis and exploitation for all vulnerability types concurrently.

## 📦 Product Line

Shannon is available in two editions:

| Edition | License | Best For |
|---------|---------|----------|
| **Shannon Lite** | AGPL-3.0 | Security teams, independent researchers, testing your own applications |
| **Shannon Pro** | Commercial | Enterprises requiring advanced features, CI/CD integration, and dedicated support |

> **This repository contains Shannon Lite,** which utilizes our core autonomous AI pentesting framework. **Shannon Pro** enhances this foundation with an advanced, LLM-powered data flow analysis engine (inspired by the [LLMDFA paper](https://arxiv.org/abs/2402.10754)) for enterprise-grade code analysis and deeper vulnerability detection.

> [!IMPORTANT]
> **White-box only.** Shannon Lite is designed for **white-box (source-available)** application security testing.  
> It expects access to your application's source code and repository layout.

[See feature comparison](./SHANNON-PRO.md)
## 📑 Table of Contents

- [What is Shannon?](#-what-is-shannon)
- [See Shannon in Action](#-see-shannon-in-action)
- [Features](#-features)
- [Product Line](#-product-line)
- [Setup & Usage Instructions](#-setup--usage-instructions)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
  - [Monitoring Progress](#monitoring-progress)
  - [Stopping Shannon](#stopping-shannon)
  - [Usage Examples](#usage-examples)
  - [Workspaces and Resuming](#workspaces-and-resuming)
  - [Configuration (Optional)](#configuration-optional)
  - [[EXPERIMENTAL - UNSUPPORTED] Router Mode (Alternative Providers)](#experimental---unsupported-router-mode-alternative-providers)
  - [Output and Results](#output-and-results)
- [Sample Reports](#-sample-reports)
- [Architecture](#️-architecture)
- [Coverage and Roadmap](#-coverage-and-roadmap)
- [Disclaimers](#️-disclaimers)
- [License](#-license)
- [Community & Support](#-community--support)
- [Get in Touch](#-get-in-touch)

---

## 🚀 Setup & Usage Instructions

### Prerequisites

- **Docker** - Container runtime ([Install Docker](https://docs.docker.com/get-docker/))
- **AI Provider Credentials** (choose one):
  - **Anthropic API key** (recommended) - Get from [Anthropic Console](https://console.anthropic.com)
  - **Claude Code OAuth token**
  - **[EXPERIMENTAL - UNSUPPORTED] Alternative providers via Router Mode** - OpenAI or Google Gemini via OpenRouter (see [Router Mode](#experimental---unsupported-router-mode-alternative-providers))

### Quick Start

```bash
# 1. Clone Shannon
git clone https://github.com/KeygraphHQ/shannon.git
cd shannon

# 2. Configure credentials (choose one method)

# Option A: Export environment variables
export ANTHROPIC_API_KEY="your-api-key"              # or CLAUDE_CODE_OAUTH_TOKEN
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000           # recommended

# Option B: Create a .env file
cat > .env << 'EOF'
ANTHROPIC_API_KEY=your-api-key
CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
EOF

# 3. Run a pentest
./shannon start URL=https://your-app.com REPO=your-repo
```

Shannon will build the containers, start the workflow, and return a workflow ID. The pentest runs in the background.

### Monitoring Progress

```bash
# View real-time worker logs
./shannon logs

# Query a specific workflow's progress
./shannon query ID=shannon-1234567890

# Open the Temporal Web UI for detailed monitoring
open http://localhost:8233
```

### Stopping Shannon

```bash
# Stop all containers (preserves workflow data)
./shannon stop

# Full cleanup (removes all data)
./shannon stop CLEAN=true
```

### Usage Examples

```bash
# Basic pentest
./shannon start URL=https://example.com REPO=repo-name

# With a configuration file
./shannon start URL=https://example.com REPO=repo-name CONFIG=./configs/my-config.yaml

# Custom output directory
./shannon start URL=https://example.com REPO=repo-name OUTPUT=./my-reports

# Named workspace
./shannon start URL=https://example.com REPO=repo-name WORKSPACE=q1-audit

# List all workspaces
./shannon workspaces
```

### Workspaces and Resuming

Shannon supports **workspaces** that allow you to resume interrupted or failed runs without re-running completed agents.

**How it works:**
- Every run creates a workspace in `audit-logs/` (auto-named by default, e.g. `example-com_shannon-1771007534808`)
- Use `WORKSPACE=<name>` to give your run a custom name for easier reference
- To resume any run, pass its workspace name via `WORKSPACE=` — Shannon detects which agents completed successfully and picks up where it left off
- Each agent's progress is checkpointed via git commits, so resumed runs start from a clean, validated state

```bash
# Start with a named workspace
./shannon start URL=https://example.com REPO=repo-name WORKSPACE=my-audit

# Resume the same workspace (skips completed agents)
./shannon start URL=https://example.com REPO=repo-name WORKSPACE=my-audit

# Resume an auto-named workspace from a previous run
./shannon start URL=https://example.com REPO=repo-name WORKSPACE=example-com_shannon-1771007534808

# List all workspaces and their status
./shannon workspaces
```

> [!NOTE]
> The `URL` must match the original workspace URL when resuming. Shannon will reject mismatched URLs to prevent cross-target contamination.

### Prepare Your Repository

Shannon expects target repositories to be placed under the `./repos/` directory at the project root. The `REPO` flag refers to a folder name inside `./repos/`. Copy the repository you want to scan into `./repos/`, or clone it directly there:

```bash
git clone https://github.com/your-org/your-repo.git ./repos/your-repo
```

**For monorepos:**

```bash
git clone https://github.com/your-org/your-monorepo.git ./repos/your-monorepo
```

**For multi-repository applications** (e.g., separate frontend/backend):

```bash
mkdir ./repos/your-app
cd ./repos/your-app
git clone https://github.com/your-org/frontend.git
git clone https://github.com/your-org/backend.git
git clone https://github.com/your-org/api.git
```

### Platform-Specific Instructions

**For Windows:**

*Native (Git Bash):*

Install [Git for Windows](https://git-scm.com/install/windows) and run Shannon from **Git Bash** with Docker Desktop installed.

*WSL2 (Recommended):*

**Step 1: Ensure WSL 2**

```powershell
wsl --install
wsl --set-default-version 2

# Check installed distros
wsl --list --verbose

# If you don't have a distro, install one (Ubuntu 24.04 recommended)
wsl --list --online
wsl --install Ubuntu-24.04

# If your distro shows VERSION 1, convert it to WSL 2:
wsl --set-version <distro-name> 2
```

See [WSL basic commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) for reference.

**Step 2: Install Docker Desktop on Windows** and enable **WSL2 backend** under *Settings > General > Use the WSL 2 based engine*.

**Step 3: Clone and run Shannon inside WSL.** Type `wsl -d <distro-name>` in PowerShell or CMD and press Enter to open a WSL terminal.

```bash
# Inside WSL terminal
git clone https://github.com/KeygraphHQ/shannon.git
cd shannon
cp .env.example .env  # Edit with your API key
./shannon start URL=https://your-app.com REPO=your-repo
```

To access the Temporal Web UI, run `ip addr` inside WSL to find your WSL IP address, then navigate to `http://<wsl-ip>:8233` in your Windows browser.

Windows Defender may flag exploit code in reports as false positives; see [Antivirus False Positives](#6-windows-antivirus-false-positives) below.

**For Linux (Native Docker):**

You may need to run commands with `sudo` depending on your Docker setup. If you encounter permission issues with output files, ensure your user has access to the Docker socket.

**For macOS:**

Works out of the box with Docker Desktop installed.

**Testing Local Applications:**

Docker containers cannot reach `localhost` on your host machine. Use `host.docker.internal` in place of `localhost`:

```bash
./shannon start URL=http://host.docker.internal:3000 REPO=repo-name
```

### Configuration (Optional)

While you can run without a config file, creating one enables authenticated testing and customized analysis. Place your configuration files inside the `./configs/` directory — this folder is mounted into the Docker container automatically.

#### Create Configuration File

Copy and modify the example configuration:

```bash
cp configs/example-config.yaml configs/my-app-config.yaml
```

#### Basic Configuration Structure

```yaml
authentication:
  login_type: form
  login_url: "https://your-app.com/login"
  credentials:
    username: "test@example.com"
    password: "yourpassword"
    totp_secret: "LB2E2RX7XFHSTGCK"  # Optional for 2FA

  login_flow:
    - "Type $username into the email field"
    - "Type $password into the password field"
    - "Click the 'Sign In' button"

  success_condition:
    type: url_contains
    value: "/dashboard"

rules:
  avoid:
    - description: "AI should avoid testing logout functionality"
      type: path
      url_path: "/logout"

  focus:
    - description: "AI should emphasize testing API endpoints"
      type: path
      url_path: "/api"
```

#### TOTP Setup for 2FA

If your application uses two-factor authentication, simply add the TOTP secret to your config file. The AI will automatically generate the required codes during testing.

### [EXPERIMENTAL - UNSUPPORTED] Router Mode (Alternative Providers)

Shannon can experimentally route requests through alternative AI providers using claude-code-router. This mode is not officially supported and is intended primarily for:

* **Model experimentation** — try Shannon with GPT-5.2 or Gemini 3–family models

#### Quick Setup

1. Add your provider API key to `.env`:

```bash
# Choose one provider:
OPENAI_API_KEY=sk-...
# OR
OPENROUTER_API_KEY=sk-or-...

# Set default model:
ROUTER_DEFAULT=openai,gpt-5.2  # provider,model format
```

2. Run with `ROUTER=true`:

```bash
./shannon start URL=https://example.com REPO=repo-name ROUTER=true
```

#### Experimental Models

| Provider | Models |
|----------|--------|
| OpenAI | gpt-5.2, gpt-5-mini |
| OpenRouter | google/gemini-3-flash-preview |

#### Disclaimer

This feature is experimental and unsupported. Output quality depends heavily on the model. Shannon is built on top of the Anthropic Agent SDK and is optimized and primarily tested with Anthropic Claude models. Alternative providers may produce inconsistent results (including failing early phases like Recon) depending on the model and routing setup.

### Output and Results

All results are saved to `./audit-logs/{hostname}_{sessionId}/` by default. Use `--output <path>` to specify a custom directory.

Output structure:
```
audit-logs/{hostname}_{sessionId}/
├── session.json          # Metrics and session data
├── agents/               # Per-agent execution logs
├── prompts/              # Prompt snapshots for reproducibility
└── deliverables/
    └── comprehensive_security_assessment_report.md   # Final comprehensive security report
```

---

## 📊 Sample Reports

> **Looking for quantitative benchmarks?** [See full benchmark methodology and results →](./xben-benchmark-results/README.md)

See Shannon's capabilities in action with penetration test results from industry-standard vulnerable applications:

#### 🧃 **OWASP Juice Shop** • [GitHub](https://github.com/juice-shop/juice-shop)

*A notoriously insecure web application maintained by OWASP, designed to test a tool's ability to uncover a wide range of modern vulnerabilities.*

**Performance**: Identified **over 20 high-impact vulnerabilities** across targeted OWASP categories in a single automated run.

**Key Accomplishments**:

- **Achieved complete authentication bypass** and exfiltrated the entire user database via Injection attack
- **Executed a full privilege escalation** by creating a new administrator account through a registration workflow bypass
- **Identified and exploited systemic authorization flaws (IDOR)** to access and modify any user's private data and shopping cart
- **Discovered a Server-Side Request Forgery (SSRF)** vulnerability, enabling internal network reconnaissance

📄 **[View Complete Report →](sample-reports/shannon-report-juice-shop.md)**

---

#### 🔗 **c{api}tal API** • [GitHub](https://github.com/Checkmarx/capital)

*An intentionally vulnerable API from Checkmarx, designed to test a tool's ability to uncover the OWASP API Security Top 10.*

**Performance**: Identified **nearly 15 critical and high-severity vulnerabilities**, leading to full application compromise.

**Key Accomplishments**:

- **Executed a root-level Injection attack** by bypassing a denylist via command chaining in a hidden debug endpoint
- **Achieved complete authentication bypass** by discovering and targeting a legacy, unpatched v1 API endpoint
- **Escalated a regular user to full administrator privileges** by exploiting a Mass Assignment vulnerability in the user profile update function
- **Demonstrated high accuracy** by correctly confirming the application's robust XSS defenses, reporting zero false positives

📄 **[View Complete Report →](sample-reports/shannon-report-capital-api.md)**

---

#### 🚗 **OWASP crAPI** • [GitHub](https://github.com/OWASP/crAPI)

*A modern, intentionally vulnerable API from OWASP, designed to benchmark a tool's effectiveness against the OWASP API Security Top 10.*

**Performance**: Identified **over 15 critical and high-severity vulnerabilities**, achieving full application compromise.

**Key Accomplishments**:

- **Bypassed authentication using multiple advanced JWT attacks**, including Algorithm Confusion, alg:none, and weak key (kid) injection
- **Achieved full database compromise via Injection attacks**, exfiltrating user credentials from the PostgreSQL database
- **Executed a critical Server-Side Request Forgery (SSRF) attack** that successfully forwarded internal authentication tokens to an external service
- **Demonstrated high accuracy** by correctly identifying the application's robust XSS defenses, reporting zero false positives

📄 **[View Complete Report →](sample-reports/shannon-report-crapi.md)**

---

*These results demonstrate Shannon's ability to move beyond simple scanning, performing deep contextual exploitation with minimal false positives and actionable proof-of-concepts.*

---

## 🏗️ Architecture

Shannon emulates a human penetration tester's methodology using a sophisticated multi-agent architecture. It combines white-box source code analysis with black-box dynamic exploitation across four distinct phases:

```
                    ┌──────────────────────┐
                    │    Reconnaissance    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────┴───────────┐
                    │          │           │
                    ▼          ▼           ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │ Vuln Analysis   │ │ Vuln Analysis   │ │      ...        │
        │  (Injection)    │ │     (XSS)       │ │                 │
        └─────────┬───────┘ └─────────┬───────┘ └─────────┬───────┘
                  │                   │                   │
                  ▼                   ▼                   ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │  Exploitation   │ │  Exploitation   │ │      ...        │
        │  (Injection)    │ │     (XSS)       │ │                 │
        └─────────┬───────┘ └─────────┬───────┘ └─────────┬───────┘
                  │                   │                   │
                  └─────────┬─────────┴───────────────────┘
                            │
                            ▼
                    ┌──────────────────────┐
                    │      Reporting       │
                    └──────────────────────┘
```

### Architectural Overview

Shannon is engineered to emulate the methodology of a human penetration tester. It leverages Anthropic's Claude Agent SDK as its core reasoning engine, but its true strength lies in the sophisticated multi-agent architecture built around it. This architecture combines the deep context of **white-box source code analysis** with the real-world validation of **black-box dynamic exploitation**, managed by an orchestrator through four distinct phases to ensure a focus on minimal false positives and intelligent context management.

---

#### **Phase 1: Reconnaissance**

The first phase builds a comprehensive map of the application's attack surface. Shannon analyzes the source code and integrates with tools like Nmap and Subfinder to understand the tech stack and infrastructure. Simultaneously, it performs live application exploration via browser automation to correlate code-level insights with real-world behavior, producing a detailed map of all entry points, API endpoints, and authentication mechanisms for the next phase.

#### **Phase 2: Vulnerability Analysis**

To maximize efficiency, this phase operates in parallel. Using the reconnaissance data, specialized agents for each OWASP category hunt for potential flaws in parallel. For vulnerabilities like Injection and SSRF, agents perform a structured data flow analysis, tracing user input to dangerous sinks. This phase produces a key deliverable: a list of **hypothesized exploitable paths** that are passed on for validation.

#### **Phase 3: Exploitation**

Continuing the parallel workflow to maintain speed, this phase is dedicated entirely to turning hypotheses into proof. Dedicated exploit agents receive the hypothesized paths and attempt to execute real-world attacks using browser automation, command-line tools, and custom scripts. This phase enforces a strict **"No Exploit, No Report"** policy: if a hypothesis cannot be successfully exploited to demonstrate impact, it is discarded as a false positive.

#### **Phase 4: Reporting**

The final phase compiles all validated findings into a professional, actionable report. An agent consolidates the reconnaissance data and the successful exploit evidence, cleaning up any noise or hallucinated artifacts. Only verified vulnerabilities are included, complete with **reproducible, copy-and-paste Proof-of-Concepts**, delivering a final pentest-grade report focused exclusively on proven risks.


## 📋 Coverage and Roadmap

For detailed information about Shannon's security testing coverage and development roadmap, see our [Coverage and Roadmap](./COVERAGE.md) documentation.

## ⚠️ Disclaimers

### Important Usage Guidelines & Disclaimers

Please review the following guidelines carefully before using Shannon (Lite). As a user, you are responsible for your actions and assume all liability.

#### **1. Potential for Mutative Effects & Environment Selection**

This is not a passive scanner. The exploitation agents are designed to **actively execute attacks** to confirm vulnerabilities. This process can have mutative effects on the target application and its data.

> [!WARNING]
> **⚠️ DO NOT run Shannon on production environments.**
>
> - It is intended exclusively for use on sandboxed, staging, or local development environments where data integrity is not a concern.
> - Potential mutative effects include, but are not limited to: creating new users, modifying or deleting data, compromising test accounts, and triggering unintended side effects from injection attacks.

#### **2. Legal & Ethical Use**

Shannon is designed for legitimate security auditing purposes only.

> [!CAUTION]
> **You must have explicit, written authorization** from the owner of the target system before running Shannon.
>
> Unauthorized scanning and exploitation of systems you do not own is illegal and can be prosecuted under laws such as the Computer Fraud and Abuse Act (CFAA). Keygraph is not responsible for any misuse of Shannon.

#### **3. LLM & Automation Caveats**

- **Verification is Required**: While significant engineering has gone into our "proof-by-exploitation" methodology to eliminate false positives, the underlying LLMs can still generate hallucinated or weakly-supported content in the final report. **Human oversight is essential** to validate the legitimacy and severity of all reported findings.
- **Comprehensiveness**: The analysis in Shannon Lite may not be exhaustive due to the inherent limitations of LLM context windows. For a more comprehensive, graph-based analysis of your entire codebase, **Shannon Pro** leverages its advanced data flow analysis engine to ensure deeper and more thorough coverage.

#### **4. Scope of Analysis**

- **Targeted Vulnerabilities**: The current version of Shannon Lite specifically targets the following classes of *exploitable* vulnerabilities:
  - Broken Authentication & Authorization
  - Injection
  - Cross-Site Scripting (XSS)
  - Server-Side Request Forgery (SSRF)
- **What Shannon Lite Does Not Cover**: This list is not exhaustive of all potential security risks. Shannon Lite's "proof-by-exploitation" model means it will not report on issues it cannot actively exploit, such as vulnerable third-party libraries or insecure configurations. These types of deep static-analysis findings are a core focus of the advanced analysis engine in **Shannon Pro**.

#### **5. Cost & Performance**

- **Time**: As of the current version, a full test run typically takes **1 to 1.5 hours** to complete.
- **Cost**: Running the full test using Anthropic's Claude 4.5 Sonnet model may incur costs of approximately **$50 USD**. Costs vary based on model pricing and application complexity.

#### **6. Windows Antivirus False Positives**

Windows Defender may flag files in `xben-benchmark-results/` or `deliverables/` as malware. These are false positives caused by exploit code in the reports. Add an exclusion for the Shannon directory in Windows Defender, or use Docker/WSL2.


## 📜 License

Shannon Lite is released under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

Shannon is open source (AGPL v3). This license allows you to:
- Use it freely for all internal security testing.
- Modify the code privately for internal use without sharing your changes.

The AGPL's sharing requirements primarily apply to organizations offering Shannon as a public or managed service (such as a SaaS platform). In those specific cases, any modifications made to the core software must be open-sourced.


## 👥 Community & Support

### Community Resources

**Contributing:** At this time, we’re not accepting external code contributions (PRs).  
Issues are welcome for bug reports and feature requests.

- 🐛 **Report bugs** via [GitHub Issues](https://github.com/KeygraphHQ/shannon/issues)
- 💡 **Suggest features** in [Discussions](https://github.com/KeygraphHQ/shannon/discussions)
- 💬 **Join our [Discord](https://discord.gg/KAqzSHHpRt)** for real-time community support

### Stay Connected

- 🐦 **Twitter**: [@KeygraphHQ](https://twitter.com/KeygraphHQ)
- 💼 **LinkedIn**: [Keygraph](https://linkedin.com/company/keygraph)
- 🌐 **Website**: [keygraph.io](https://keygraph.io)



## 💬 Get in Touch

### Interested in Shannon Pro?

Shannon Pro is designed for organizations serious about application security. It offers enterprise-grade features, dedicated support, and seamless CI/CD integration, all powered by our most advanced LLM-based analysis engine. Find and fix complex vulnerabilities deep in your codebase before they ever reach production.

For a detailed breakdown of features, technical differences, and enterprise use cases, see our [complete comparison guide](./SHANNON-PRO.md).

<p align="center">
  <a href="https://docs.google.com/forms/d/e/1FAIpQLSf-cPZcWjlfBJ3TCT8AaWpf8ztsw3FaHzJE4urr55KdlQs6cQ/viewform?usp=header" target="_blank">
    <img src="https://img.shields.io/badge/📋%20Express%20Interest%20in%20Shannon%20Pro-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Express Interest">
  </a>
</p>

**Or contact us directly:**

📧 **Email**: [shannon@keygraph.io](mailto:shannon@keygraph.io)

---

<p align="center">
  <b>Built with ❤️ by the Keygraph team</b><br>
  <i>Making application security accessible to everyone</i>
</p>
