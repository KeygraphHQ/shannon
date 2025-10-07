
<div align="center">

<img src="./assets/shannon-screen.png" alt="Shannon Screen" width="100%">

# Shannon is your fully autonomous AI pentester.

Shannon’s job is simple: break your web app before anyone else does. <br />
The Red Team to your vibe-coding Blue team. <br />
Every Claude (coder) deserves their Shannon.

---

[Website](https://keygraph.io) • [Discord](https://discord.gg/aWY8rRUCxc)

---
</div>

## 🎯 What is Shannon?

Shannon is an AI pentester that delivers actual exploits, not just alerts.

Shannon's goal is to break your web app before someone else does. It autonomously hunts for attack vectors in your code, then uses its built-in browser to execute real exploits, such as SQL injection, command execution, and auth bypass, to prove the vulnerability is actually exploitable.

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
- **Critical OWASP Vulnerability Coverage**: Currently identifies and validates the following critical vulnerabilities: SQLi, Command Injection, XSS, SSRF, and Broken Authentication/Authorization, with more types in development.
- **Code-Aware Dynamic Testing**: Analyzes your source code to intelligently guide its attack strategy, then performs live, browser and command line based exploits on the running application to confirm real-world risk.
- **Powered by Integrated Security Tools**: Enhances its discovery phase by leveraging leading reconnaissance and testing tools—including **Nmap, Subfinder, WhatWeb, and Schemathesis**—for deep analysis of the target environment.
- **Parallel Processing for Faster Results**: Get your report faster. The system parallelizes the most time-intensive phases, running analysis and exploitation for all vulnerability types concurrently.


## 📦 Product Line

Shannon is available in two editions:

| Edition | License | Best For |
|---------|---------|----------|
| **Shannon Lite** | BSL | Security teams, independent researchers, testing your own applications |
| **Shannon Pro** | Commercial | Enterprises requiring advanced features, CI/CD integration, and dedicated support |

> **This repository contains Shannon Lite,** which utilizes our core autonomous AI pentesting framework. **Shannon Pro** enhances this foundation with an advanced, LLM-powered data flow analysis engine (inspired by the [LLMDFA paper](https://arxiv.org/abs/2402.10754)) for enterprise-grade code analysis and deeper vulnerability detection.
>
[See feature comparison](./SHANNON-PRO.md)
## 📑 Table of Contents

- [What is Shannon?](#-what-is-shannon)
- [See Shannon in Action](#-see-shannon-in-action)
- [Features](#-features)
- [Product Line](#-product-line)
- [Setup & Usage Instructions](#-setup--usage-instructions)
  - [Prerequisites](#prerequisites)
  - [Authentication Setup](#authentication-setup)
  - [Quick Start with Docker](#quick-start-with-docker)
  - [Configuration (Optional)](#configuration-optional)
  - [Usage Patterns](#usage-patterns)
  - [Output and Results](#output-and-results)
- [Sample Reports & Benchmarks](#-sample-reports--benchmarks)
- [Architecture](#-architecture)
- [Coverage and Roadmap](#-coverage-and-roadmap)
- [Disclaimers](#-disclaimers)
- [License](#-license)
- [Community & Support](#-community--support)
- [Get in Touch](#-get-in-touch)

---

## 🚀 Setup & Usage Instructions

### Prerequisites

- **Claude Console account with credits** - Required for AI-powered analysis
- **Docker installed** - Primary deployment method

### Authentication Setup

#### Generate Claude Code OAuth Token

First, install Claude Code CLI on your local machine:

```bash
npm install -g @anthropic-ai/claude-code
```

Generate a long-lived OAuth token:

```bash
claude setup-token
```

This creates a token like: `sk-ant-oat01-XXXXXXXXXXXXXXXXXXXXXXXXXXX`

**Note**: This works with Claude Console accounts (with purchased credits), regardless of whether you have a Pro/Max subscription.

#### Alternative: Use Anthropic API Key

If you have an existing Anthropic API key instead of a Claude Console account:

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

#### Set Environment Variable

For Claude Console users, export the OAuth token:

```bash
export CLAUDE_CODE_OAUTH_TOKEN="sk-ant-oat01-XXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

### Quick Start with Docker

#### Build the Container

```bash
docker build -t shannon:latest .
```

#### Prepare Your Repository

Shannon is designed for **web application security testing** and expects all application code to be available in a single directory structure. This works well for:

- **Monorepos** - Single repository containing all components
- **Consolidated setups** - Multiple repositories organized in a shared folder

**For monorepos:**

```bash
git clone https://github.com/your-org/your-monorepo.git repos/your-app
```

**For multi-repository applications** (e.g., separate frontend/backend):

```bash
mkdir repos/your-app
cd repos/your-app
git clone https://github.com/your-org/frontend.git
git clone https://github.com/your-org/backend.git
git clone https://github.com/your-org/api.git
```

**For existing local repositories:**

```bash
cp -r /path/to/your-existing-repo repos/your-app
```

#### Run Your First Pentest

**With Claude Console OAuth Token:**

```bash
docker run --rm -it \
      --network host \
      --cap-add=NET_RAW \
      --cap-add=NET_ADMIN \
      -e CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
      -v "$(pwd):/app/host-data" \
      -v "$(pwd)/repos:/app/repos" \
      -v "$(pwd)/configs:/app/configs" \
      shannon:latest \
      "https://your-app.com/" \
      "/app/repos/your-app" \
      --config configs/example-config.yaml
```

**With Anthropic API Key:**

```bash
docker run --rm -it \
      --network host \
      --cap-add=NET_RAW \
      --cap-add=NET_ADMIN \
      -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
      -v "$(pwd):/app/host-data" \
      -v "$(pwd)/repos:/app/repos" \
      -v "$(pwd)/configs:/app/configs" \
      shannon:latest \
      "https://your-app.com/" \
      "/app/repos/your-app" \
      --config configs/example-config.yaml
```

**Network Capabilities:**

- `--cap-add=NET_RAW` - Enables advanced port scanning with nmap
- `--cap-add=NET_ADMIN` - Allows network administration for security tools
- `--network host` - Provides access to target network interfaces

### Configuration (Optional)

While you can run without a config file, creating one enables authenticated testing and customized analysis.

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

### Usage Patterns

#### Run Complete Pentest

**With Claude Console OAuth Token:**

```bash
docker run --rm -it \
      --network host \
      --cap-add=NET_RAW \
      --cap-add=NET_ADMIN \
      -e CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
      -v "$(pwd):/app/host-data" \
      -v "$(pwd)/repos:/app/repos" \
      -v "$(pwd)/configs:/app/configs" \
      shannon:latest \
      "https://your-app.com/" \
      "/app/repos/your-app" \
      --config configs/your-config.yaml
```

**With Anthropic API Key:**

```bash
docker run --rm -it \
      --network host \
      --cap-add=NET_RAW \
      --cap-add=NET_ADMIN \
      -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
      -v "$(pwd):/app/host-data" \
      -v "$(pwd)/repos:/app/repos" \
      -v "$(pwd)/configs:/app/configs" \
      shannon:latest \
      "https://your-app.com/" \
      "/app/repos/your-app" \
      --config configs/your-config.yaml
```

#### Check Status

View progress of previous runs:

```bash
docker run --rm -v "$(pwd):/app/host-data" shannon:latest --status
```

### Output and Results

All analysis results are saved to the `deliverables/` directory:

- **Pre-reconnaissance reports** - External scan results
- **Vulnerability assessments** - Potential vulnerabilities from thorough code analysis and network mapping
- **Exploitation results** - Proof-of-concept attempts
- **Executive reports** - Business-focused security summaries

---

## 📊 Sample Reports & Benchmarks

See Shannon's capabilities in action with real penetration test results from industry-standard vulnerable applications:

### Benchmark Results

#### 🧃 **OWASP Juice Shop** • [GitHub](https://github.com/juice-shop/juice-shop)

*A notoriously insecure web application maintained by OWASP, designed to test a tool's ability to uncover a wide range of modern vulnerabilities.*

**Performance**: Identified **over 20 high-impact vulnerabilities** across targeted OWASP categories in a single automated run.

**Key Accomplishments**:

- **Achieved complete authentication bypass** and exfiltrated the entire user database via SQL Injection
- **Executed a full privilege escalation** by creating a new administrator account through a registration workflow bypass
- **Identified and exploited systemic authorization flaws (IDOR)** to access and modify any user's private data and shopping cart
- **Discovered a Server-Side Request Forgery (SSRF)** vulnerability, enabling internal network reconnaissance

📄 **[View Complete Report →](sample-reports/shannon-report-juice-shop.md)**

---

#### 🔗 **c{api}tal API** • [GitHub](https://github.com/Checkmarx/capital)

*An intentionally vulnerable API from Checkmarx, designed to test a tool's ability to uncover the OWASP API Security Top 10.*

**Performance**: Identified **nearly 15 critical and high-severity vulnerabilities**, leading to full application compromise.

**Key Accomplishments**:

- **Executed a root-level Command Injection** by bypassing a denylist via command chaining in a hidden debug endpoint
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
- **Achieved full database compromise via both SQL and NoSQL Injection**, exfiltrating user credentials from the PostgreSQL database
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
        │    (SQLi)       │ │     (XSS)       │ │                 │
        └─────────┬───────┘ └─────────┬───────┘ └─────────┬───────┘
                  │                   │                   │
                  ▼                   ▼                   ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │  Exploitation   │ │  Exploitation   │ │      ...        │
        │    (SQLi)       │ │     (XSS)       │ │                 │
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

To maximize efficiency, this phase operates in parallel. Using the reconnaissance data, specialized agents for each OWASP category hunt for potential flaws in parallel. For vulnerabilities like SQLi and SSRF, agents perform a structured data flow analysis, tracing user input to dangerous sinks. This phase produces a key deliverable: a list of **hypothesized exploitable paths** that are passed on for validation.

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
  - SQL Injection (SQLi)
  - Command Injection
  - Cross-Site Scripting (XSS)
  - Server-Side Request Forgery (SSRF)
- **What Shannon Lite Does Not Cover**: This list is not exhaustive of all potential security risks. Shannon Lite's "proof-by-exploitation" model means it will not report on issues it cannot actively exploit, such as vulnerable third-party libraries or insecure configurations. These types of deep static-analysis findings are a core focus of the advanced analysis engine in **Shannon Pro**.

#### **5. Cost & Performance**

- **Time**: As of the current version, a full test run typically takes **1 to 1.5 hours** to complete.
- **Cost**: Running the full test using Anthropic's Claude 4.5 Sonnet model may incur costs of approximately **$50 USD**. Please note that costs are subject to change based on model pricing and the complexity of the target application.



## 📜 License

Shannon Lite is released under the [Business Source License 1.1 (BSL)](LICENSE).


## 👥 Community & Support

### Community Resources

- 🐛 **Report bugs** via [GitHub Issues](https://github.com/keygraph/shannon/issues)
- 💡 **Suggest features** in [Discussions](https://github.com/keygraph/shannon/discussions)
- 💬 **Join our [Discord](https://discord.gg/aWY8rRUCxc)** for real-time community support

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
