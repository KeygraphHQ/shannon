<p align="center">
  <img src="./assets/shannon-banner.png" alt="Shannon Banner" width="100%">
</p>

<h1 align="center">🛡️ Shannon</h1>

<p align="center">
  <strong>The World's First Fully Autonomous AI Penetration Tester</strong>
</p>

<p align="center">
  <em>Break your web app before anyone else does. Real exploits, not just alerts.</em>
</p>

<p align="center">
  <a href="https://github.com/KeygraphHQ/shannon/actions"><img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" alt="Build Status"></a>
  <a href="https://github.com/KeygraphHQ/shannon/blob/main/xben-benchmark-results/README.md"><img src="https://img.shields.io/badge/XBOW%20Benchmark-96.15%25-blue?style=flat-square" alt="Benchmark"></a>
  <a href="https://github.com/KeygraphHQ/shannon/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-red?style=flat-square" alt="License"></a>
  <a href="https://discord.gg/KAqzSHHpRt"><img src="https://img.shields.io/discord/1234567890?style=flat-square&logo=discord&logoColor=white&label=Discord" alt="Discord"></a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-benchmark-results">Benchmarks</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-documentation">Docs</a> •
  <a href="#-community">Community</a>
</p>

---

## 🏆 Benchmark Performance

<table align="center">
<tr>
<td align="center"><strong>96.15%</strong><br><sub>XBOW Success Rate</sub></td>
<td align="center"><strong>20+</strong><br><sub>Vulns Found in Juice Shop</sub></td>
<td align="center"><strong>15+</strong><br><sub>Vulns Found in crAPI</sub></td>
<td align="center"><strong>0</strong><br><sub>False Positives</sub></td>
</tr>
</table>

> **[📊 View Full Benchmark Results →](./xben-benchmark-results/README.md)**

---

## 🎯 What is Shannon?

Shannon is a **fully autonomous AI pentester** powered by Claude that delivers **actual exploits, not just alerts**. It doesn't just scan for vulnerabilities—it **proves they're exploitable** with real attacks.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   🎯 Give Shannon a URL + Source Code                                       │
│                          ↓                                                  │
│   🔍 AI analyzes code & hunts for attack vectors                           │
│                          ↓                                                  │
│   💥 Executes REAL exploits via browser automation                         │
│                          ↓                                                  │
│   📋 Delivers proof-of-concept exploits you can copy-paste                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Problem Shannon Solves

Your team ships code daily with Claude Code and Cursor. But your pentest? **Once a year.**

That's 364 days of shipping vulnerabilities to production. Shannon closes this gap by acting as your **on-demand whitebox pentester** that can run on every PR, every deploy, every day.

---

## 🎬 See Shannon in Action

<p align="center">
  <img src="./assets/shannon-action.gif" alt="Shannon Demo" width="100%">
</p>

**Real Results from OWASP Juice Shop:**
- ✅ Complete authentication bypass
- ✅ Full database exfiltration via SQL injection  
- ✅ Privilege escalation to admin
- ✅ IDOR vulnerabilities exposing all user data
- ✅ SSRF enabling internal network recon

📄 **[Read the Full Report →](./sample-reports/shannon-report-juice-shop.md)**

---

## ✨ Features

### 🤖 Fully Autonomous Operation
Launch with a single command. Shannon handles everything—from complex 2FA/TOTP logins to browser-based exploitation—with zero human intervention.

### 🎯 Proof-by-Exploitation Methodology
**No exploit = No report.** Shannon only reports vulnerabilities it can actually exploit, eliminating false positives entirely.

### 🔒 Enterprise-Grade Security
- **SSRF Protection**: Blocks internal/metadata endpoints
- **Rate Limiting**: Prevents API abuse
- **Secrets Validation**: Rejects weak/placeholder credentials
- **Audit Logging**: Full forensic trail of all actions

### 🔄 CI/CD Native
```yaml
# GitHub Actions
- uses: keygraph/shannon-action@v1
  with:
    target-url: ${{ env.STAGING_URL }}
    fail-on: High
```
- SARIF output for GitHub Code Scanning
- GitLab SAST format support
- Exit codes for pipeline gates

### 🔗 Integrations
- **Slack**: Real-time vulnerability alerts
- **Jira**: Automatic ticket creation
- **Webhooks**: Custom integrations with HMAC signing

### 📊 Compliance Mapping
Automatic mapping to:
- OWASP Top 10 2021
- PCI-DSS v4
- SOC 2 TSC
- HIPAA (Pro)
- NIST CSF (Pro)

---

## 🚀 Quick Start

### Prerequisites
- Docker installed
- Claude Console account with credits ([Get one here](https://console.anthropic.com))

### 1. Build the Container

```bash
docker build -t shannon:latest .
```

### 2. Prepare Your Repository

```bash
# Clone your target application
git clone https://github.com/your-org/your-app.git repos/your-app
```

### 3. Run Your First Pentest

```bash
docker run --rm -it \
  --network host \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  -e CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
  -e CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000 \
  -v "$(pwd)/repos:/app/repos" \
  -v "$(pwd)/configs:/app/configs" \
  -v "$(pwd)/audit-logs:/app/audit-logs" \
  shannon:latest \
  "https://your-app.com" \
  "/app/repos/your-app"
```

### 4. Get Your Report

Results are saved to `./audit-logs/` including:
- 📄 Executive security report
- 🔓 Proof-of-concept exploits
- 📊 Compliance mapping
- 📈 SARIF/GitLab SAST reports (with `--ci` flag)

---

## 📖 Documentation

### Configuration

Create a config file for authenticated testing:

```yaml
# configs/my-app.yaml
authentication:
  login_type: form
  login_url: "https://your-app.com/login"
  credentials:
    username: "${SHANNON_AUTH_USER}"     # Use env vars for secrets!
    password: "${SHANNON_AUTH_PASS}"
  login_flow:
    - "Type $username into #email field"
    - "Type $password into #password field"
    - "Click Login button"
  success_condition:
    type: url_contains
    value: "/dashboard"

rules:
  avoid:
    - description: "Skip production data endpoints"
      type: path
      url_path: "/api/v1/production"
  focus:
    - description: "Test authentication flows"
      type: path
      url_path: "/api/v1/auth"

ci:
  enabled: true
  fail_on: High
  platforms: ["github", "gitlab"]

integrations:
  slack:
    webhook_url: "${SHANNON_SLACK_WEBHOOK}"
    notify_on: ["run.completed", "finding.created"]

compliance:
  frameworks: ["owasp_top10_2021", "pci_dss_v4"]
```

### CLI Reference

```bash
shannon <WEB_URL> <REPO_PATH> [OPTIONS]

Arguments:
  WEB_URL              Target web application URL
  REPO_PATH            Path to application source code

Options:
  --config <file>      YAML configuration file
  --output <path>      Custom output directory (default: ./audit-logs/)
  --ci                 Enable CI/CD mode with exit codes
  --ci-platforms       Comma-separated: github,gitlab
  --ci-fail-on         Severity threshold: Critical|High|Medium|Low|Info
  --pipeline-testing   Fast mode with minimal prompts
  --disable-loader     Disable progress spinner
  --help               Show help

Server Mode:
  shannon server [OPTIONS]
  
  --host <addr>        Bind address (default: 127.0.0.1)
  --port <port>        Port number (default: 8080)
  --api-key <key>      API authentication key
```

### API Server

Run Shannon as a REST API service:

```bash
# Start the server
shannon server --config configs/my-config.yaml --port 8080

# Create a scan
curl -X POST http://localhost:8080/api/v1/runs \
  -H "X-API-Key: $SHANNON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"web_url": "https://app.example.com", "repo_path": "/path/to/code"}'

# Check status
curl http://localhost:8080/api/v1/runs/<run_id> \
  -H "X-API-Key: $SHANNON_API_KEY"
```

---

## 🏗️ Architecture

Shannon emulates a human pentester using a **multi-agent architecture** that combines white-box source analysis with black-box dynamic exploitation:

```
                        ┌──────────────────────────────┐
                        │     🔍 RECONNAISSANCE        │
                        │  Source Analysis + Tool Scans │
                        └──────────────┬───────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  💉 INJECTION    │       │  🔐 AUTH/AUTHZ   │       │  🌐 SSRF/XSS     │
│    Analysis      │       │    Analysis      │       │    Analysis      │
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │                          │                          │
         ▼                          ▼                          ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  💉 INJECTION    │       │  🔐 AUTH/AUTHZ   │       │  🌐 SSRF/XSS     │
│   Exploitation   │       │   Exploitation   │       │   Exploitation   │
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │                          │                          │
         └───────────────────────────┼───────────────────────────┘
                                     │
                        ┌────────────▼─────────────┐
                        │     📊 REPORTING         │
                        │  Executive Summary + PoCs │
                        └──────────────────────────┘
```

### Phase Breakdown

| Phase | Description | Agents |
|-------|-------------|--------|
| **1. Pre-Recon** | External scans (nmap, subfinder, whatweb) + code analysis | 1 |
| **2. Recon** | Attack surface mapping and entry point discovery | 1 |
| **3. Vuln Analysis** | Parallel vulnerability hunting by category | 5 (parallel) |
| **4. Exploitation** | Real-world exploit execution for validation | 5 (parallel) |
| **5. Reporting** | Executive report with reproducible PoCs | 1 |

---

## 📊 Benchmark Results

### XBOW Benchmark (Hint-Free, Source-Aware)

Shannon achieves **96.15% success rate** on the industry-standard XBOW benchmark:

| Metric | Score |
|--------|-------|
| Overall Success Rate | **96.15%** |
| Injection Detection | 100% |
| Auth Bypass Detection | 95% |
| SSRF Detection | 98% |
| False Positive Rate | **0%** |

> **[📊 View Full Benchmark Methodology →](./xben-benchmark-results/README.md)**

### Real-World Results

<table>
<tr>
<th>Target</th>
<th>Critical</th>
<th>High</th>
<th>Medium</th>
<th>False Positives</th>
<th>Report</th>
</tr>
<tr>
<td>🧃 OWASP Juice Shop</td>
<td>5</td>
<td>12</td>
<td>6</td>
<td>0</td>
<td><a href="./sample-reports/shannon-report-juice-shop.md">View →</a></td>
</tr>
<tr>
<td>🔗 Checkmarx c{api}tal</td>
<td>4</td>
<td>8</td>
<td>3</td>
<td>0</td>
<td><a href="./sample-reports/shannon-report-capital-api.md">View →</a></td>
</tr>
<tr>
<td>🚗 OWASP crAPI</td>
<td>6</td>
<td>7</td>
<td>4</td>
<td>0</td>
<td><a href="./sample-reports/shannon-report-crapi.md">View →</a></td>
</tr>
</table>

---

## 📦 Product Editions

| Feature | Shannon Lite (OSS) | Shannon Pro |
|---------|-------------------|-------------|
| Autonomous Pentesting | ✅ | ✅ |
| OWASP Top 10 Coverage | ✅ | ✅ |
| CI/CD Integration | ✅ | ✅ |
| Slack/Jira Integration | ✅ | ✅ |
| SARIF/GitLab Reports | ✅ | ✅ |
| Compliance Mapping | Basic | **Advanced** |
| Data Flow Analysis | - | **LLM-Powered** |
| Custom Vulnerability Rules | - | ✅ |
| Priority Support | Community | **Dedicated** |
| SLA | - | **99.9%** |

> **[📋 Express Interest in Shannon Pro →](https://docs.google.com/forms/d/e/1FAIpQLSf-cPZcWjlfBJ3TCT8AaWpf8ztsw3FaHzJE4urr55KdlQs6cQ/viewform)**

---

## ⚠️ Important Disclaimers

### ⚡ Active Exploitation Warning

> **Shannon is NOT a passive scanner.** It actively executes real attacks to validate vulnerabilities.

**DO NOT run Shannon on production environments.** Use only on:
- Sandboxed environments
- Staging/development servers
- Local test instances

Potential effects include: data modification, user creation, service disruption.

### 🔒 Legal & Ethical Use

> **You MUST have explicit written authorization** before testing any system.

Unauthorized testing is illegal under laws like the Computer Fraud and Abuse Act (CFAA). Keygraph is not responsible for misuse.

### 💰 Cost & Performance

| Metric | Value |
|--------|-------|
| Typical Runtime | 1-1.5 hours |
| Estimated Cost | ~$50 USD (Claude 4.5 Sonnet) |

---

## 🛠️ Development

### Project Structure

```
shannon/
├── src/
│   ├── shannon.ts          # Main entry point
│   ├── ai/                  # Claude SDK integration
│   ├── api/                 # REST API server
│   ├── audit/               # Forensic logging
│   ├── ci/                  # CI/CD integration
│   ├── cli/                 # Command-line interface
│   ├── compliance/          # Compliance mapping
│   ├── config-parser.ts     # YAML configuration
│   ├── cvss/                # CVSS scoring
│   ├── findings/            # Finding normalization
│   ├── integrations/        # Slack, Jira, webhooks
│   ├── phases/              # Execution phases
│   ├── prompts/             # Prompt management
│   ├── security/            # Security utilities
│   ├── session-manager.ts   # Agent orchestration
│   └── types/               # TypeScript definitions
├── configs/                 # Configuration schemas & examples
├── prompts/                 # AI prompt templates
├── sample-reports/          # Example security reports
└── xben-benchmark-results/  # Benchmark data
```

### Running Tests

```bash
npm install
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
```

### Building

```bash
npm run build              # Compile TypeScript
npm start                  # Run compiled version
```

---

## 👥 Community & Support

### Get Help

- 💬 **[Discord](https://discord.gg/KAqzSHHpRt)** - Real-time community support
- 🐛 **[GitHub Issues](https://github.com/KeygraphHQ/shannon/issues)** - Bug reports
- 💡 **[Discussions](https://github.com/KeygraphHQ/shannon/discussions)** - Feature requests

### Stay Connected

- 🐦 **Twitter**: [@KeygraphHQ](https://twitter.com/KeygraphHQ)
- 💼 **LinkedIn**: [Keygraph](https://linkedin.com/company/keygraph)
- 🌐 **Website**: [keygraph.io](https://keygraph.io)

### Contributing

We're not currently accepting external code contributions (PRs), but issues are welcome for bug reports and feature requests.

---

## 📜 License

Shannon Lite is released under the **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)**.

This license allows you to:
- ✅ Use freely for internal security testing
- ✅ Modify privately for internal use
- ⚠️ Share modifications if offering Shannon as a public service

---

## 🙏 Acknowledgments

Shannon is built on the shoulders of giants:

- [Anthropic Claude](https://anthropic.com) - AI reasoning engine
- [Playwright](https://playwright.dev) - Browser automation
- [OWASP](https://owasp.org) - Security standards & test targets
- The security research community

---

<p align="center">
  <strong>Built with ❤️ by the <a href="https://keygraph.io">Keygraph</a> team</strong>
  <br>
  <em>Making application security accessible to everyone</em>
</p>

<p align="center">
  <a href="https://keygraph.io">
    <img src="https://img.shields.io/badge/Powered%20by-Keygraph-blue?style=for-the-badge" alt="Powered by Keygraph">
  </a>
</p>
