# Security Policy

## Reporting a Vulnerability

We take the security of Shannon seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@keygraph.io**

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the following information:
- Type of vulnerability (e.g., SSRF, injection, authentication bypass)
- Full path of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Communication**: We will keep you informed of our progress towards addressing the issue
- **Disclosure**: We ask that you give us reasonable time to address the vulnerability before public disclosure

### Safe Harbor

We consider security research activities conducted in good faith to be authorized. We will not pursue civil action or initiate a complaint with law enforcement against researchers who:

- Make a good faith effort to avoid privacy violations, data destruction, or service interruption
- Only interact with accounts they own or have explicit permission to access
- Do not exploit a security issue for purposes other than verification
- Report vulnerabilities promptly and provide reasonable time for remediation

## Security Features

Shannon implements several security features to protect both the tool and its users:

### SSRF Protection
- Blocks private IP ranges (10.x, 192.168.x, 172.16-31.x, 127.x)
- Blocks cloud metadata endpoints (169.254.169.254, metadata.google.internal)
- Validates all webhook and integration URLs
- Enforces HTTPS for external communications

### Secrets Management
- Validates API keys for minimum entropy
- Rejects placeholder/example values
- Supports environment variable substitution in configs
- Never logs sensitive credentials

### Rate Limiting
- API endpoint rate limiting (60 req/min)
- Scan creation rate limiting (10 scans/5min)
- Per-client tracking with sliding window algorithm

### Audit Logging
- Complete audit trail of all actions
- Crash-safe append-only logging
- Atomic writes to prevent corruption

### Authentication
- Constant-time API key comparison (timing attack prevention)
- HMAC signature verification for webhooks
- Support for 2FA/TOTP in target authentication

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Best Practices

When using Shannon:

1. **Never test production systems** - Use staging/sandbox environments only
2. **Use environment variables for secrets** - Never commit credentials to configs
3. **Generate strong API keys** - Use `npm run generate-key` for secure keys
4. **Enable webhook signing** - Always use secrets for webhook authentication
5. **Review audit logs** - Monitor for unexpected behavior
6. **Keep Shannon updated** - Apply security updates promptly

## Contact

For security concerns, contact: **security@keygraph.io**

For general support, join our [Discord](https://discord.gg/KAqzSHHpRt) or open a GitHub issue.
