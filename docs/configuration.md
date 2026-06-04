# Configuration

Shannon Lite can run without a configuration file, but configuration enables authenticated testing, scope guidance, rules of engagement, report filtering, and rate-limit tuning.

## Credential Precedence

Source-build mode resolves credentials from:

1. Environment variables, such as `export ANTHROPIC_API_KEY=...`
2. `./.env`

`npx` mode resolves credentials from:

1. Environment variables
2. `~/.shannon/config.toml`, created by `npx @keygraph/shannon setup`

Environment variables always win, so you can override saved config for a single session without editing files.

## Create a Configuration File

Copy and modify the example configuration:

```bash
cp configs/example-config.yaml ./my-app-config.yaml
```

Run with:

```bash
npx @keygraph/shannon start -u https://example.com -r /path/to/repo -c ./my-app-config.yaml
```

Source-build equivalent:

```bash
./shannon start -u https://example.com -r /path/to/repo -c ./my-app-config.yaml
```

## Basic Configuration Structure

```yaml
# Describe your target environment.
description: "Next.js e-commerce app on PostgreSQL. Local dev environment; .env files contain local-only credentials."

# Limit which vulnerability classes run end-to-end.
# vuln_classes: [injection, xss, auth, authz, ssrf]

# Skip the exploitation phase.
# exploit: "false"

# Free-form rules of engagement.
# rules_of_engagement: |
#   - No password brute-force; cap login attempts at 5 per account.
#   - Throttle to under 5 requests per second per endpoint; back off 60s on any 429.
#   - Use placeholders like [order_id] in deliverables; no real data values.

authentication:
  login_type: form
  login_url: "https://your-app.com/login"
  credentials:
    username: "test@example.com"
    password: "yourpassword"
    totp_secret: "LB2E2RX7XFHSTGCK"

    # Optional mailbox credentials for magic-link or email-OTP flows.
    # email_login:
    #   address: "inbox@example.com"
    #   password: "mailbox-password"
    #   totp_secret: "JBSWY3DPEHPK3PXP"

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
      type: url_path
      value: "/logout"

    # code_path values are repo-relative file paths or globs.
    # - description: "Out-of-scope vendored libraries"
    #   type: code_path
    #   value: "src/vendor/**"

  focus:
    - description: "AI should emphasize testing API endpoints"
      type: url_path
      value: "/api"

# Filters applied by the report agent when assembling the final report.
# report:
#   min_severity: low
#   min_confidence: low
#   guidance: |
#     Drop findings about missing security headers and rate-limit gaps.
```

Supported rule types include `url_path`, `subdomain`, `domain`, `method`, `header`, `parameter`, and `code_path`.

## Writing Login Flow

Log in once in a fresh private browser window. Write the steps in the same order you perform them:

- When typing into a field, reference the field by its exact label or placeholder.
- When clicking a button, reference the exact button text.

Supported placeholders:

- `$username`
- `$password`
- `$totp`
- `$email_address`
- `$email_password`
- `$email_totp`

At runtime, Shannon Lite replaces these placeholders with the credentials passed in the config.

```yaml
login_flow:
  - "Type $username in <exact email field label or placeholder>"
  - "Click <exact button text>"
  - "Type $password in <exact password field label or placeholder>"
  - "Click <exact button text>"
  - "If prompted for 2FA, type $totp in <exact code field label or placeholder>"
  - "Click <exact button text>"
```

## Adaptive Thinking

Claude decides when and how deeply to reason on Opus 4.6 and 4.7. This is enabled by default whenever a tier resolves to one of these models.

- `npx` mode: `npx @keygraph/shannon setup` prompts you during the wizard.
- Source-build mode: set `CLAUDE_ADAPTIVE_THINKING=false` in `.env` or export it in your shell.

## Subscription Plan Rate Limits

Anthropic subscription plans reset usage on a rolling 5-hour window. The default retry strategy may exhaust retries before the window resets. Add this to your config:

```yaml
pipeline:
  retry_preset: subscription
  max_concurrent_pipelines: 2
```

`max_concurrent_pipelines` controls how many vulnerability pipelines run simultaneously. Supported values are 1-5, with a default of 5. Lower values reduce burst API usage but increase wall-clock time.
