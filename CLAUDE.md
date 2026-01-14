# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Shannon is a **fully autonomous AI penetration tester** that delivers real exploits, not just alerts. It combines white-box source code analysis with black-box dynamic exploitation to find and prove vulnerabilities in web applications.

### Key Capabilities
- **Autonomous Operation**: Zero human intervention from start to finish
- **Proof-by-Exploitation**: Only reports vulnerabilities it can actually exploit
- **Multi-Agent Architecture**: Specialized agents for each vulnerability class
- **Production-Grade Security**: SSRF protection, rate limiting, secrets validation
- **CI/CD Native**: SARIF output, GitLab SAST, exit codes for pipeline gates

## Commands

### Installation & Setup
```bash
npm install
npm run build
```

### Running the Penetration Testing Agent
```bash
# Basic usage
shannon <WEB_URL> <REPO_PATH>

# With configuration
shannon "https://example.com" "/path/to/repo" --config configs/my-config.yaml

# With custom output directory
shannon "https://example.com" "/path/to/repo" --output /path/to/reports

# CI/CD mode
shannon "https://example.com" "/path/to/repo" --ci --ci-fail-on High
```

### API Server Mode
```bash
# Start the API server
shannon server --config configs/my-config.yaml --host 127.0.0.1 --port 8080

# Generate a secure API key
npm run generate-key
```

### Testing
```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
```

### Development
```bash
npm run build              # Compile TypeScript
npm run lint               # Type check without emitting
npm start                  # Run compiled version

# Fast development testing
shannon <URL> <PATH> --pipeline-testing
```

### CLI Options
```bash
--config <file>          YAML configuration file
--output <path>          Custom output directory (default: ./audit-logs/)
--ci                     Enable CI/CD mode with exit codes
--ci-platforms <list>    Comma-separated: github,gitlab
--ci-fail-on <severity>  Threshold: Critical|High|Medium|Low|Info
--pipeline-testing       Use minimal prompts for fast testing
--disable-loader         Disable the animated progress loader
--help                   Show help message
```

## Architecture & Components

### Directory Structure
```
src/
├── shannon.ts              # Main entry point & orchestration
├── ai/
│   └── claude-executor.ts  # Claude Agent SDK integration
├── api/
│   └── server.ts           # REST API server with rate limiting
├── audit/
│   ├── audit-session.ts    # Forensic logging facade
│   ├── logger.ts           # Crash-safe append-only logging
│   └── metrics-tracker.ts  # Timing & cost tracking
├── ci/
│   └── index.ts            # CI/CD integration (SARIF, GitLab)
├── cli/
│   ├── ui.ts               # Help text & splash screen
│   └── input-validator.ts  # URL & path validation
├── compliance/
│   └── mappings.ts         # OWASP, PCI-DSS, SOC2 mappings
├── config-parser.ts        # YAML config with JSON Schema validation
├── cvss/
│   ├── v3_1.ts             # CVSS 3.1 scoring
│   └── v4_0.ts             # CVSS 4.0 scoring
├── findings/
│   ├── types.ts            # Finding interfaces
│   ├── parser.ts           # LLM output parsing
│   ├── enrich.ts           # CVSS & compliance enrichment
│   └── exporters.ts        # JSON, CSV, SARIF, GitLab SAST
├── integrations/
│   ├── slack.ts            # Slack notifications
│   ├── jira.ts             # Jira ticket creation
│   └── webhooks.ts         # Generic webhooks with HMAC signing
├── phases/
│   ├── pre-recon.ts        # External tool scans
│   └── reporting.ts        # Final report assembly
├── security/
│   ├── url-validator.ts    # SSRF protection
│   ├── secrets-validator.ts # Credential validation
│   ├── rate-limiter.ts     # API rate limiting
│   └── secure-fetch.ts     # Hardened HTTP client
├── session-manager.ts      # Agent definitions & parallel groups
└── types/
    ├── agents.ts           # Agent type definitions
    └── config.ts           # Configuration interfaces
```

### Five-Phase Testing Workflow

```
Phase 1: PRE-RECONNAISSANCE
├── External tool scans (nmap, subfinder, whatweb)
└── Source code analysis

Phase 2: RECONNAISSANCE
├── Attack surface mapping
└── Entry point discovery

Phase 3: VULNERABILITY ANALYSIS (5 agents in parallel)
├── injection-vuln  → SQL injection, command injection
├── xss-vuln        → Cross-site scripting
├── auth-vuln       → Authentication bypasses
├── authz-vuln      → Authorization flaws
└── ssrf-vuln       → Server-side request forgery

Phase 4: EXPLOITATION (5 agents in parallel)
├── injection-exploit  → Exploit injection vulnerabilities
├── xss-exploit        → Exploit XSS vulnerabilities
├── auth-exploit       → Exploit auth issues
├── authz-exploit      → Exploit authz flaws
└── ssrf-exploit       → Exploit SSRF vulnerabilities

Phase 5: REPORTING
├── Executive summary generation
├── Finding normalization & CVSS scoring
├── Compliance mapping
└── CI/CD artifact generation
```

### Key Modules

#### Security Module (`src/security/`)
Production-grade security utilities:
- **URL Validator**: SSRF protection, scheme blocking, private IP detection
- **Secrets Validator**: Placeholder detection, entropy analysis
- **Rate Limiter**: Sliding window algorithm with per-client tracking
- **Secure Fetch**: Timeouts, retries, SSRF protection built-in

#### CI/CD Module (`src/ci/`)
- Exit code computation based on severity threshold
- SARIF report generation for GitHub Code Scanning
- GitLab SAST format output
- CI environment auto-detection

#### Integrations Module (`src/integrations/`)
- **Slack**: Webhook & Bot API support with URL validation
- **Jira**: Automatic ticket creation with ADF formatting
- **Webhooks**: HMAC-signed events with retry logic

### Claude Agent SDK Configuration
```typescript
{
  maxTurns: 10_000,           // Extensive autonomous analysis
  permissionMode: 'bypassPermissions',  // Full system access
  // Playwright MCP for browser automation
  // Working directory set to target repository
}
```

### Configuration System

JSON Schema validated YAML configuration:
```yaml
authentication:
  login_type: form|sso|api|basic
  login_url: "https://..."
  credentials:
    username: "..."
    password: "..."
    totp_secret: "..."  # Optional 2FA
  login_flow: ["Step 1", "Step 2", ...]
  success_condition:
    type: url_contains|element_present|text_contains
    value: "..."

rules:
  avoid: [{description, type, url_path}]
  focus: [{description, type, url_path}]

ci:
  enabled: true
  platforms: [github, gitlab]
  fail_on: High

integrations:
  slack: {webhook_url, bot_token, channel, notify_on}
  jira: {base_url, email, api_token, project_key, issue_type}
  webhooks: [{url, secret, events}]

compliance:
  frameworks: [owasp_top10_2021, pci_dss_v4, soc2_tsc]
```

### Output & Deliverables

All results saved to `./audit-logs/{hostname}_{sessionId}/`:
```
├── session.json           # Comprehensive metrics
├── prompts/               # Exact prompts used
├── agents/                # Turn-by-turn execution logs
└── deliverables/
    ├── comprehensive_security_assessment_report.md
    ├── findings.json      # Structured findings
    ├── findings.csv       # Spreadsheet format
    ├── compliance_report.md
    ├── findings.sarif     # GitHub Code Scanning
    └── gl-sast-report.json # GitLab SAST
```

## Development Notes

### Key Design Patterns
- **Configuration-Driven**: YAML configs with JSON Schema validation
- **Security-First**: SSRF protection, secrets validation, rate limiting
- **Modular Architecture**: Each phase/agent is isolated
- **Crash-Safe Logging**: Append-only with atomic writes
- **Parallel Execution**: 5x faster with concurrent agent phases

### Error Handling
- Categorized error types (PentestError, ConfigError, etc.)
- Automatic retry logic (3 attempts per agent)
- Graceful degradation when tools unavailable
- Full audit trail of all errors

### Testing
```bash
# Run security module tests
npm test src/security/

# Run CI module tests
npm test src/ci/

# Run all tests with coverage
npm run test:coverage
```

### External Tool Dependencies
- `nmap` - Network port scanning
- `subfinder` - Subdomain discovery
- `whatweb` - Web technology fingerprinting

Use `--pipeline-testing` to skip external tools during development.

## Troubleshooting

### Common Issues
- **"A session is already running"**: Delete `.shannon-store.json`
- **"Repository not found"**: Verify target path exists
- **API key rejected**: Ensure minimum 32 characters, no placeholders

### Security Validation Errors
- **"URL validation failed: SSRF"**: Webhook URLs must be external HTTPS
- **"Placeholder detected"**: Replace example values with real secrets
- **"Weak entropy"**: Use `npm run generate-key` for secure keys

### Debug Mode
```bash
DEBUG=1 shannon <URL> <PATH>
```

## API Reference

### REST API Endpoints

```
GET  /health                    # Health check (no auth)
GET  /api/v1/generate-key       # Generate secure API key
GET  /api/v1/runs               # List all runs (paginated)
GET  /api/v1/runs/:id           # Get run status
POST /api/v1/runs               # Start new scan
POST /api/v1/runs/:id/cancel    # Cancel running scan
```

### Authentication
```bash
# Header options
X-API-Key: <your-key>
Authorization: Bearer <your-key>
```

### Rate Limits
- API endpoints: 60 requests/minute
- Scan creation: 10 scans/5 minutes
- Webhooks: 100 calls/minute

## File Locations

| File | Purpose |
|------|---------|
| `src/shannon.ts` | Main entry point |
| `configs/config-schema.json` | Configuration schema |
| `configs/example-config.yaml` | Example configuration |
| `.shannon-store.json` | Session lock file |
| `audit-logs/` | Output directory |
