>[!NOTE]
> **[📢 New: Claude models on AWS Bedrock and Google Vertex AI now supported. →](https://github.com/KeygraphHQ/shannon/discussions/categories/announcements)**

<div align="center">

<img src="./assets/github-banner.png" alt="Shannon — AI Pentester for Web Applications and APIs" width="100%">

# Shannon — AI Pentester by Keygraph

<a href="https://trendshift.io/repositories/15604" target="_blank"><img src="https://trendshift.io/api/badge/repositories/15604" alt="KeygraphHQ%2Fshannon | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

Shannon is an autonomous, white-box AI pentester for web applications and APIs. <br />
It analyzes your source code, identifies attack vectors, and executes real exploits to prove vulnerabilities before they reach production.

---

[Keygraph Website](https://keygraph.io) • [Announcements](https://github.com/KeygraphHQ/shannon/discussions/categories/announcements) • [Discord](https://discord.gg/KAqzSHHpRt)

---
</div>

## 🎯 What is Shannon?

Shannon is an AI pentester developed by [Keygraph](https://keygraph.io). It performs white-box security testing of web applications and their underlying APIs by combining source code analysis with live exploitation.

Shannon analyzes your web application's source code to identify potential attack vectors, then uses browser automation and command-line tools to execute real exploits (injection attacks, authentication bypass, SSRF, XSS) against the running application and its APIs. Only vulnerabilities with a working proof-of-concept are included in the final report.

**Why Shannon Exists**

Thanks to tools like Claude Code and Cursor, your team ships code non-stop. But your penetration test? That happens once a year. This creates a *massive* security gap. For the other 364 days, you could be unknowingly shipping vulnerabilities to production.

Shannon closes that gap by providing on-demand, automated penetration testing that can run against every build or release.

> [!NOTE]
> **Shannon is part of the Keygraph Security and Compliance Platform**
>
> Keygraph is an integrated security and compliance platform covering IAM, MDM, compliance automation (SOC 2, HIPAA), and application security. Shannon handles the AppSec layer. The broader platform automates evidence collection, audit readiness, and continuous compliance across multiple frameworks.
>
> **[Learn more at keygraph.io](https://keygraph.io)**

## 🎬 Shannon in Action

Shannon identified 20+ vulnerabilities in OWASP Juice Shop, including authentication bypass and database exfiltration. [Full report →](sample-reports/shannon-report-juice-shop.md)

![Demo](assets/shannon-action.gif)

## ✨ Features

- **Fully Autonomous Operation**: A single command launches the full pentest. Shannon handles 2FA/TOTP logins (including SSO), browser navigation, exploitation, and report generation without manual intervention.
- **Reproducible Proof-of-Concept Exploits**: The final report contains only proven, exploitable findings with copy-and-paste PoCs. Vulnerabilities that cannot be exploited are not reported.
- **OWASP Vulnerability Coverage**: Identifies and validates Injection, XSS, SSRF, and Broken Authentication/Authorization, with additional categories in development.
- **Code-Aware Dynamic Testing**: Analyzes source code to guide attack strategy, then validates findings with live browser and CLI-based exploits against the running application.
- **Integrated Security Tooling**: Leverages Nmap, Subfinder, WhatWeb, and Schemathesis during reconnaissance and discovery phases.
- **Parallel Processing**: Vulnerability analysis and exploitation phases run concurrently across all attack categories.

## 📦 Product Line

Shannon is developed by [Keygraph](https://keygraph.io) and available in two editions:

| Edition | License | Best For |
|---------|---------|----------|
| **Shannon Lite** | AGPL-3.0 | Local testing of your own applications. |
| **Shannon Pro** | Commercial | Organizations needing a single AppSec platform (SAST, SCA, secrets, business logic testing, autonomous pentesting) with CI/CD integration and self-hosted deployment. |

> **This repository contains Shannon Lite,** the core autonomous AI pentesting framework. **Shannon Pro** is Keygraph's all-in-one AppSec platform, combining SAST, SCA, secrets scanning, business logic security testing, and autonomous AI pentesting in a single correlated workflow. Every finding is validated with a working proof-of-concept exploit.

> [!IMPORTANT]
> **White-box only.** Shannon Lite is designed for **white-box (source-available)** application security testing.  
> It expects access to your application's source code and repository layout.

### Shannon Pro: Architecture Overview

Shannon Pro is an all-in-one application security platform that replaces the need to stitch together separate SAST, SCA, secrets scanning, and pentesting tools. It operates as a two-stage pipeline: agentic static analysis of the codebase, followed by autonomous AI penetration testing. Findings from both stages are cross-referenced and correlated, so every reported vulnerability has a working proof-of-concept exploit and a precise source code location.

**Stage 1: Agentic Static Analysis**

Shannon Pro transforms the codebase into a Code Property Graph (CPG) combining the AST, control flow graph, and program dependence graph. It then runs five analysis capabilities:

- **Data Flow Analysis (SAST)**: Identifies sources (user input, API requests) and sinks (SQL queries, command execution), then traces paths between them. At each node, an LLM evaluates whether the specific sanitization applied is sufficient for the specific vulnerability in context, rather than relying on a hard-coded allowlist of safe functions.
- **Point Issue Detection (SAST)**: LLM-based detection of single-location vulnerabilities: weak cryptography, hardcoded credentials, insecure configuration, missing security headers, weak RNG, disabled certificate validation, and overly permissive CORS.
- **Business Logic Security Testing (SAST)**: LLM agents analyze the codebase to discover application-specific invariants (e.g., "document access must verify organizational ownership"), generate targeted fuzzers to violate those invariants, and synthesize full PoC exploits. This catches authorization failures and domain-specific logic errors that pattern-based scanners cannot detect.
- **SCA with Reachability Analysis**: Goes beyond flagging CVEs by tracing whether the vulnerable function is actually reachable from application entry points via the CPG. Unreachable vulnerabilities are deprioritized.
- **Secrets Detection**: Combines regex pattern matching with LLM-based detection (for dynamically constructed credentials, custom formats, obfuscated tokens) and performs liveness validation against the corresponding service using read-only API calls.

**Stage 2: Autonomous Dynamic Penetration Testing**

The same multi-agent pentest pipeline as Shannon Lite (reconnaissance, parallel vulnerability analysis, parallel exploitation, reporting), enhanced with static findings injected into the exploitation queue. Static findings are mapped to Shannon's five attack domains (Injection, XSS, SSRF, Auth, Authz), and exploit agents attempt real proof-of-concept attacks against the running application for each finding.

**Static-Dynamic Correlation**

This is the core differentiator. A data flow vulnerability identified in static analysis (e.g., unsanitized input reaching a SQL query) is not reported as a theoretical risk. It is fed to the corresponding exploit agent, which attempts to exploit it against the live application. Confirmed exploits are traced back to the exact source code location, giving developers both proof of exploitability and the line of code to fix.

**Deployment Model**

Shannon Pro supports a self-hosted runner model (similar to GitHub Actions self-hosted runners). The data plane, which handles code access and all LLM API calls, runs entirely within the customer's infrastructure using the customer's own API keys. Source code never leaves the customer's network. The Keygraph control plane handles job orchestration, scan scheduling, and the reporting UI, receiving only aggregate findings.

| Capability | Shannon Lite | Shannon Pro (All-in-One AppSec) |
| --- | --- | --- |
| **Licensing** | AGPL-3.0 | Commercial |
| **Static Analysis** | Code review prompting | Full agentic SAST, SCA, secrets, business logic testing |
| **Dynamic Testing** | Autonomous AI pentesting | Autonomous AI pentesting with static-dynamic correlation |
| **Analysis Engine** | Code review prompting | CPG-based data flow with LLM reasoning at every node |
| **Business Logic** | None | Automated invariant discovery, fuzzer generation, exploit synthesis |
| **CI/CD Integration** | Manual / CLI | Native CI/CD, GitHub PR scanning |
| **Deployment** | CLI | Managed cloud or self-hosted runner |
| **Boundary Analysis** | None | Automatic service boundary detection with team routing |

[Full technical details →](./SHANNON-PRO.md)

## 📑 Table of Contents

- [What is Shannon?](#-what-is-shannon)
- [Shannon in Action](#-shannon-in-action)
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
  - [AWS Bedrock](#aws-bedrock)
  - [Google Vertex AI](#google-vertex-ai)
  - [[EXPERIMENTAL - UNSUPPORTED] Router Mode (Alternative Providers)](#experimental---unsupported-router-mode-alternative-providers)
  - [Output and Results](#output-and-results)
- [Sample Reports](#-sample-reports)
- [Benchmark](#-benchmark)
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
  - **AWS Bedrock** - Route through Amazon Bedrock with AWS credentials (see [AWS Bedrock](#aws-bedrock))
  - **Google Vertex AI** - Route through Google Cloud Vertex AI (see [Google Vertex AI](#google-vertex-ai))
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

#### Subscription Plan Rate Limits

Anthropic subscription plans reset usage on a **rolling 5-hour window**. The default retry strategy (30-min max backoff) will exhaust retries before the window resets. Add this to your config:

```yaml
pipeline:
  retry_preset: subscription          # Extends max backoff to 6h, 100 retries
  max_concurrent_pipelines: 2         # Run 2 of 5 pipelines at a time (reduces burst API usage)
```

`max_concurrent_pipelines` controls how many vulnerability pipelines run simultaneously (1-5, default: 5). Lower values reduce the chance of hitting rate limits but increase wall-clock time.

### AWS Bedrock

Shannon also supports [Amazon Bedrock](https://aws.amazon.com/bedrock/) instead of using an Anthropic API key.

#### Quick Setup

1. Add your AWS credentials to `.env`:

```bash
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
AWS_BEARER_TOKEN_BEDROCK=your-bearer-token

# Set models with Bedrock-specific IDs for your region
ANTHROPIC_SMALL_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
ANTHROPIC_MEDIUM_MODEL=us.anthropic.claude-sonnet-4-6
ANTHROPIC_LARGE_MODEL=us.anthropic.claude-opus-4-6
```

2. Run Shannon as usual:

```bash
./shannon start URL=https://example.com REPO=repo-name
```

Shannon uses three model tiers: **small** (`claude-haiku-4-5-20251001`) for summarization, **medium** (`claude-sonnet-4-6`) for security analysis, and **large** (`claude-opus-4-6`) for deep reasoning. Set `ANTHROPIC_SMALL_MODEL`, `ANTHROPIC_MEDIUM_MODEL`, and `ANTHROPIC_LARGE_MODEL` to the Bedrock model IDs for your region.

### Google Vertex AI

Shannon also supports [Google Vertex AI](https://cloud.google.com/vertex-ai) instead of using an Anthropic API key.

#### Quick Setup

1. Create a service account with the `roles/aiplatform.user` role in the [GCP Console](https://console.cloud.google.com/iam-admin/serviceaccounts), then download a JSON key file.

2. Place the key file in the `./credentials/` directory:

```bash
mkdir -p ./credentials
cp /path/to/your-sa-key.json ./credentials/gcp-sa-key.json
```

3. Add your GCP configuration to `.env`:

```bash
CLAUDE_CODE_USE_VERTEX=1
CLOUD_ML_REGION=us-east5
ANTHROPIC_VERTEX_PROJECT_ID=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=./credentials/gcp-sa-key.json

# Set models with Vertex AI model IDs
ANTHROPIC_SMALL_MODEL=claude-haiku-4-5@20251001
ANTHROPIC_MEDIUM_MODEL=claude-sonnet-4-6
ANTHROPIC_LARGE_MODEL=claude-opus-4-6
```

4. Run Shannon as usual:

```bash
./shannon start URL=https://example.com REPO=repo-name
```

Set `CLOUD_ML_REGION=global` for global endpoints, or a specific region like `us-east5`. Some models may not be available on global endpoints — see the [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/model-garden) for region availability.

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

Sample penetration test reports from industry-standard vulnerable applications:

#### 🧃 **OWASP Juice Shop** • [GitHub](https://github.com/juice-shop/juice-shop)

*A notoriously insecure web application maintained by OWASP, designed to test a tool's ability to uncover a wide range of modern vulnerabilities.*

**Results**: Identified over 20 vulnerabilities across targeted OWASP categories in a single automated run.

**Notable findings**:

- Authentication bypass and full user database exfiltration via SQL injection
- Privilege escalation to administrator through registration workflow bypass
- IDOR vulnerabilities enabling access to other users' data and shopping carts
- SSRF enabling internal network reconnaissance

📄 **[View Complete Report →](sample-reports/shannon-report-juice-shop.md)**

---

#### 🔗 **c{api}tal API** • [GitHub](https://github.com/Checkmarx/capital)

*An intentionally vulnerable API from Checkmarx, designed to test a tool's ability to uncover the OWASP API Security Top 10.*

**Results**: Identified approximately 15 critical and high-severity vulnerabilities.

**Notable findings**:

- Root-level command injection via denylist bypass in a hidden debug endpoint
- Authentication bypass through a legacy, unpatched v1 API endpoint
- Privilege escalation via Mass Assignment in the user profile update function
- Zero false positives for XSS (correctly confirmed robust XSS defenses)

📄 **[View Complete Report →](sample-reports/shannon-report-capital-api.md)**

---

#### 🚗 **OWASP crAPI** • [GitHub](https://github.com/OWASP/crAPI)

*A modern, intentionally vulnerable API from OWASP, designed to benchmark a tool's effectiveness against the OWASP API Security Top 10.*

**Results**: Identified over 15 critical and high-severity vulnerabilities.

**Notable findings**:

- Authentication bypass via multiple JWT attacks (Algorithm Confusion, alg:none, weak key injection)
- Full PostgreSQL database compromise via injection, exfiltrating user credentials
- SSRF attack forwarding internal authentication tokens to an external service
- Zero false positives for XSS (correctly identified robust XSS defenses)

📄 **[View Complete Report →](sample-reports/shannon-report-crapi.md)**

---

## 📈 Benchmark

Shannon Lite scored **96.15% (100/104 exploits)** on a hint-free, source-aware variant of the XBOW security benchmark.

**[Full results with detailed agent logs and per-challenge pentest reports →](./xben-benchmark-results/README.md)**

---

## 🏗️ Architecture

Shannon uses a multi-agent architecture that combines white-box source code analysis with dynamic exploitation across four phases:

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

Shannon uses Anthropic's Claude Agent SDK as its reasoning engine within a multi-agent architecture. The system combines white-box source code analysis with black-box dynamic exploitation, managed by an orchestrator across four phases. The architecture is designed for minimal false positives through a "no exploit, no report" policy.

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

📅 **1:1 Office Hours** — Thursdays, two time zones
Book a free 15-min session for hands-on help with bugs, deployments, or config questions.
→ US/EU: 10:00 AM PT  |  Asia: 2:00 PM IST
→ [Book a slot](https://cal.com/george-flores-keygraph/shannon-community-office-hours)

💬 [Join our Discord](https://discord.gg/cmctpMBXwE) to ask questions, share feedback, and connect with other Shannon users.

**Contributing:** At this time, we're not accepting external code contributions (PRs).  
Issues are welcome for bug reports and feature requests.

- 🐛 **Report bugs** via [GitHub Issues](https://github.com/KeygraphHQ/shannon/issues)
- 💡 **Suggest features** in [Discussions](https://github.com/KeygraphHQ/shannon/discussions)

### Stay Connected

- 🐦 **Twitter**: [@KeygraphHQ](https://twitter.com/KeygraphHQ)
- 💼 **LinkedIn**: [Keygraph](https://linkedin.com/company/keygraph)
- 🌐 **Website**: [keygraph.io](https://keygraph.io)



## 💬 Get in Touch

### Shannon Pro

Shannon Pro is Keygraph's all-in-one AppSec platform. For organizations that need unified SAST, SCA, and autonomous pentesting with static-dynamic correlation, CI/CD integration, or self-hosted deployment, see the [Shannon Pro technical overview](./SHANNON-PRO.md).

<p align="center">
  <a href="https://docs.google.com/forms/d/e/1FAIpQLSf-cPZcWjlfBJ3TCT8AaWpf8ztsw3FaHzJE4urr55KdlQs6cQ/viewform?usp=header" target="_blank">
    <img src="https://img.shields.io/badge/📋%20Shannon%20Pro%20Inquiry-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Shannon Pro Inquiry">
  </a>
</p>

📧 **Email**: [shannon@keygraph.io](mailto:shannon@keygraph.io)

---

<p align="center">
  <b>Built by <a href="https://keygraph.io">Keygraph</a></b>
</p>
