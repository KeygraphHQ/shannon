# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an AI-powered penetration testing agent designed for defensive security analysis. The tool automates vulnerability assessment by combining external reconnaissance tools with AI-powered code analysis to identify security weaknesses in web applications and their source code.

## Commands

### Installation & Setup
```bash
npm install
```

### Running the Penetration Testing Agent
```bash
./shannon.mjs <WEB_URL> <REPO_PATH> --config <CONFIG_FILE>
```

Example:
```bash
./shannon.mjs "https://example.com" "/path/to/local/repo"
./shannon.mjs "https://juice-shop.herokuapp.com" "/home/user/juice-shop" --config juice-shop-config.yaml
```

### Alternative Execution
```bash
npm start <WEB_URL> <REPO_PATH> --config <CONFIG_FILE>
```

### Configuration Validation
```bash
# Configuration validation is built into the main script
./shannon.mjs --help  # Shows usage and validates config on execution
```

### Generate TOTP for Authentication
```bash
./login_resources/generate-totp.mjs <TOTP_SECRET>
```

### Development Commands
```bash
# No linting or testing commands available in this project
# Development is done by running the agent in pipeline-testing mode
./shannon.mjs <commands> --pipeline-testing
```

### Session Management Commands
```bash
# Setup session without running
./shannon.mjs --setup-only <WEB_URL> <REPO_PATH> --config <CONFIG_FILE>

# Check session status (shows progress, timing, costs)
./shannon.mjs --status

# List all available agents by phase
./shannon.mjs --list-agents

# Show help
./shannon.mjs --help
```

### Execution Commands
```bash
# Run all remaining agents to completion
./shannon.mjs --run-all [--pipeline-testing]

# Run a specific agent
./shannon.mjs --run-agent <agent-name> [--pipeline-testing]

# Run a range of agents
./shannon.mjs --run-agents <start-agent>:<end-agent> [--pipeline-testing]

# Run a specific phase
./shannon.mjs --run-phase <phase-name> [--pipeline-testing]

# Pipeline testing mode (minimal prompts for fast testing)
./shannon.mjs <command> --pipeline-testing
```

### Rollback & Recovery Commands
```bash
# Rollback to specific checkpoint
./shannon.mjs --rollback-to <agent-name>

# Rollback and re-execute specific agent
./shannon.mjs --rerun <agent-name> [--pipeline-testing]
```

### Session Cleanup Commands
```bash
# Delete all sessions (with confirmation)
./shannon.mjs --cleanup

# Delete specific session by ID
./shannon.mjs --cleanup <session-id>
```

## Architecture & Components

### Main Entry Point
- `shannon.mjs` - Main orchestration script that coordinates the entire penetration testing workflow

### Core Modules
- `src/config-parser.js` - Handles YAML configuration parsing, validation, and distribution to agents
- `src/error-handling.js` - Comprehensive error handling with retry logic and categorized error types
- `src/tool-checker.js` - Validates availability of external security tools before execution
- `src/session-manager.js` - Manages persistent session state and agent lifecycle
- `src/checkpoint-manager.js` - Git-based checkpointing system for rollback capabilities
- Pipeline orchestration is built into the main `shannon.mjs` script
- `src/queue-validation.js` - Validates deliverables and agent prerequisites

### Five-Phase Testing Workflow

1. **Pre-Reconnaissance** (`pre-recon`) - External tool scans (nmap, subfinder, whatweb) + source code analysis
2. **Reconnaissance** (`recon`) - Analysis of initial findings and attack surface mapping  
3. **Vulnerability Analysis** (5 agents)
   - `injection-vuln` - SQL injection, command injection
   - `xss-vuln` - Cross-site scripting 
   - `auth-vuln` - Authentication bypasses
   - `authz-vuln` - Authorization flaws
   - `ssrf-vuln` - Server-side request forgery
4. **Exploitation** (5 agents)
   - `injection-exploit` - Exploit injection vulnerabilities
   - `xss-exploit` - Exploit XSS vulnerabilities  
   - `auth-exploit` - Exploit authentication issues
   - `authz-exploit` - Exploit authorization flaws
   - `ssrf-exploit` - Exploit SSRF vulnerabilities
5. **Reporting** (`report`) - Executive-level security report generation

### Configuration System
The agent supports YAML configuration files with JSON Schema validation:
- `configs/config-schema.json` - JSON Schema for configuration validation
- `configs/example-config.yaml` - Template configuration file
- `configs/juice-shop-config.yaml` - Example configuration for OWASP Juice Shop
- `configs/keygraph-config.yaml` - Configuration for Keygraph applications
- `configs/chatwoot-config.yaml` - Configuration for Chatwoot applications
- `configs/metabase-config.yaml` - Configuration for Metabase applications
- `configs/cal-com-config.yaml` - Configuration for Cal.com applications

Configuration includes:
- Authentication settings (form, SSO, API, basic auth)
- Multi-factor authentication with TOTP support
- Custom login flow instructions
- Application-specific testing parameters

### Prompt Templates
The `prompts/` directory contains specialized prompt templates for each testing phase:
- `pre-recon-code.txt` - Initial code analysis prompts
- `recon.txt` - Reconnaissance analysis prompts  
- `vuln-*.txt` - Vulnerability assessment prompts (injection, XSS, auth, authz, SSRF)
- `exploit-*.txt` - Exploitation attempt prompts
- `report-executive.txt` - Executive report generation prompts

### Claude Code SDK Integration
The agent uses the `@anthropic-ai/claude-code` SDK with maximum autonomy configuration:
- `maxTurns: 10_000` - Allows extensive autonomous analysis
- `permissionMode: 'bypassPermissions'` - Full system access for thorough testing
- Playwright MCP integration for web browser automation
- Working directory set to target local repository
- Configuration context injection for authenticated testing

### Authentication & Login Resources
- `login_resources/generate-totp.mjs` - TOTP token generation utility
- `login_resources/login_instructions.txt` - Login flow documentation
- Support for multi-factor authentication workflows
- Configurable authentication mechanisms (form, SSO, API, basic)

### Output & Deliverables
All analysis results are saved to the `deliverables/` directory within the target local repository, including:
- Pre-reconnaissance reports with external scan results
- Vulnerability assessment findings
- Exploitation attempt results
- Executive-level security reports with business impact analysis

### External Tool Dependencies
The agent integrates with external security tools:
- `nmap` - Network port scanning
- `subfinder` - Subdomain discovery  
- `whatweb` - Web technology fingerprinting

Tools are validated for availability before execution using the tool-checker module.

### Git-Based Checkpointing System
The agent implements a sophisticated checkpoint system using git:
- Every agent creates a git checkpoint before execution
- Rollback to any previous agent state using `--rollback-to` or `--rerun`
- Failed agents don't affect completed work
- Timing and cost data cleaned up during rollbacks
- Fail-fast safety prevents accidental re-execution of completed agents

### Timing & Performance Monitoring
The agent includes comprehensive timing instrumentation that tracks:
- Total execution time
- Phase-level timing breakdown
- Individual command execution times
- Claude Code agent processing times
- Cost tracking for AI agent usage


## Development Notes

### Key Design Patterns
- **Configuration-Driven Architecture**: YAML configs with JSON Schema validation
- **Modular Error Handling**: Categorized error types with retry logic
- **Pure Functions**: Most functionality is implemented as pure functions for testability
- **SDK-First Approach**: Heavy reliance on Claude Code SDK for autonomous AI operations
- **Progressive Analysis**: Each phase builds on previous phase results
- **Local Repository Setup**: Target applications are accessed directly from user-provided local directories

### Error Handling Strategy
The application uses a comprehensive error handling system with:
- Categorized error types (PentestError, ConfigError, NetworkError, etc.)
- Automatic retry logic for transient failures
- Graceful degradation when external tools are unavailable
- Detailed error logging and user-friendly error messages

### Testing Mode
The agent includes a testing mode that skips external tool execution for faster development cycles.

### Security Focus
This is explicitly designed as a **defensive security tool** for:
- Vulnerability assessment
- Security analysis  
- Penetration testing
- Security report generation

The tool should only be used on systems you own or have explicit permission to test.

## File Structure

```
shannon.mjs              # Main orchestration script
package.json                  # Node.js dependencies
src/                         # Core modules
├── config-parser.js         # Configuration handling
├── error-handling.js        # Error management
├── tool-checker.js          # Tool validation
├── session-manager.js       # Session state management
├── checkpoint-manager.js    # Git-based checkpointing
├── queue-validation.js      # Deliverable validation
└── utils/
configs/                     # Configuration files
├── config-schema.json       # JSON Schema validation
├── example-config.yaml      # Template configuration
├── juice-shop-config.yaml   # Juice Shop example
├── keygraph-config.yaml     # Keygraph configuration
├── chatwoot-config.yaml     # Chatwoot configuration
├── metabase-config.yaml     # Metabase configuration
└── cal-com-config.yaml      # Cal.com configuration
prompts/                     # AI prompt templates
├── pre-recon-code.txt       # Code analysis
├── recon.txt               # Reconnaissance  
├── vuln-*.txt              # Vulnerability assessment
├── exploit-*.txt           # Exploitation
└── report-executive.txt    # Executive reporting
login_resources/            # Authentication utilities
├── generate-totp.mjs       # TOTP generation
└── login_instructions.txt  # Login documentation
deliverables/              # Output directory
```

## Troubleshooting

### Common Issues
- **"Agent already completed"**: Use `--rerun <agent>` for explicit re-execution
- **"Missing prerequisites"**: Check `--status` and run prerequisite agents first  
- **"No sessions found"**: Create a session with `--setup-only` first
- **"Repository not found"**: Ensure target local directory exists and is accessible
- **"Too many test sessions"**: Use `--cleanup` to remove old sessions and free disk space

### External Tool Dependencies
Missing tools can be skipped using `--pipeline-testing` mode during development:
- `nmap` - Network scanning
- `subfinder` - Subdomain discovery
- `whatweb` - Web technology detection  
