# Configuration

Shannon can run without a configuration file, but configuration enables authenticated testing, scope guidance, rules of engagement, and report filtering.

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

# Report options applied when assembling the final report.
# report:
#   min_severity: low
#   min_confidence: low
#   guidance: |
#     Drop findings about missing security headers and rate-limit gaps.
#   sarif: "true"
```

## Report Options

| Key | Effect |
| --- | --- |
| `min_severity` | Drops findings rated below this severity. Applies in both exploitative and analysis-only runs. |
| `min_confidence` | Drops findings rated below this confidence. Applies only when `exploit` is `"false"`. |
| `guidance` | Free-text instruction to the report agent, such as which topics to exclude. |
| `sarif` | Emits a SARIF 2.1.0 log alongside the Markdown report. Requires `exploit: "true"`. |

Every finding carries a severity, but it does not mean the same thing in each mode: an exploitative run measures severity from what the exploit demonstrated, while an analysis-only run assesses it from the class of flaw and the impact it would have. An analysis-only finding carries a confidence rating alongside its severity, since nothing was proven. Setting `min_confidence` on an exploitative run is ignored, and Shannon logs a warning naming the threshold to use instead.

### SARIF Output

Set `sarif: "true"` to write `report.sarif` next to `Security-Assessment-Report.pdf` at the workspace root, for upload to GitHub code scanning or any other SARIF consumer.

```yaml
exploit: "true"
report:
  sarif: "true"
```

Each finding becomes one SARIF result, filed under a rule per vulnerability class (`shannon/injection`, `shannon/xss`, `shannon/auth`, `shannon/authz`, `shannon/ssrf`) and tagged with its OWASP Top Ten 2025 category. Results are anchored to the code location the analysis phase recorded, falling back to the HTTP entry point when the finding names no file. Severity maps onto SARIF's three levels: `critical` and `high` become `error`, `medium` becomes `warning`, everything else becomes `note`.

The log is written only for exploitative runs. `sarif` is ignored when `exploit` is `"false"`.

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

At runtime, Shannon replaces these placeholders with the credentials passed in the config.

```yaml
login_flow:
  - "Type $username in <exact email field label or placeholder>"
  - "Click <exact button text>"
  - "Type $password in <exact password field label or placeholder>"
  - "Click <exact button text>"
  - "If prompted for 2FA, type $totp in <exact code field label or placeholder>"
  - "Click <exact button text>"
```
