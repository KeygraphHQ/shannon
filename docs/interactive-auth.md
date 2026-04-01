# Interactive Authentication

Test applications that use OAuth, Google Sign-In, or any SSO provider that requires manual login (e.g., with 2FA).

Shannon opens a real browser window on your machine. You complete the login once, and Shannon captures the session for all agents to use during the scan.

## Prerequisites

Install Playwright on your host machine (one-time setup):

```bash
npm install -g playwright
npx playwright install chromium
```

## Quick Start

### 1. Create a config file

```yaml
# my-config.yaml
authentication:
  login_type: interactive
  login_url: "https://your-app.com/login"
  success_condition:
    type: url_contains
    value: "/dashboard"
```

The `success_condition` tells Shannon how to detect that login is complete:

| type | value | Detects |
|------|-------|---------|
| `url_contains` | `/dashboard` | URL changes to include `/dashboard` |
| `url_equals_exactly` | `https://app.com/home` | URL matches exactly |
| `element_present` | `#user-menu` | A CSS selector appears on page |
| `text_contains` | `Welcome` | Page body contains the text |

### 2. Authenticate

```bash
# Local mode
./shannon auth -c my-config.yaml -w my-audit

# NPX mode
npx @keygraph/shannon auth -c my-config.yaml -w my-audit
```

A Chromium browser opens. Complete the login (Google Sign-In, 2FA, etc.). Shannon detects the success condition and captures the session automatically. The browser closes.

### 3. Run the scan

Use the **same workspace name** from step 2:

```bash
# Local mode
./shannon start -u https://your-app.com -r /path/to/repo -c my-config.yaml -w my-audit

# NPX mode
npx @keygraph/shannon start -u https://your-app.com -r /path/to/repo -c my-config.yaml -w my-audit
```

Shannon detects `auth-state.json` in the workspace and distributes the authenticated session to all agents.

## How It Works

1. **`shannon auth`** opens a headed Chromium browser and navigates to `login_url`
2. You complete the login manually (handles any auth flow — Google, Okta, SAML, etc.)
3. Shannon polls for the `success_condition` (every 2 seconds, 5 minute timeout)
4. Once met, Shannon captures `context.storageState()` — all cookies (including HttpOnly) and localStorage
5. Saves to `workspaces/<name>/auth-state.json`
6. **`shannon start`** mounts the workspace into the Docker container
7. Each agent reads `auth-state.json` and injects the session into Playwright:
   - `localStorage.setItem()` for each stored entry
   - `document.cookie` for non-HttpOnly cookies
   - `Cookie` header in `curl` commands for API testing (includes HttpOnly cookies)

## Multi-Repo Applications

Shannon takes a single repository path (`-r`). For applications with separate frontend and backend repos, combine them into one directory:

```bash
mkdir repos/my-app
cp -r /path/to/frontend repos/my-app/frontend
cp -r /path/to/backend repos/my-app/backend

# Remove nested .git directories (Shannon needs a single git root)
rm -rf repos/my-app/frontend/.git repos/my-app/backend/.git

# Initialize as a single repo
cd repos/my-app
git init && git add -A && git commit -m "combined for scan"
cd ../..

# Scan
./shannon start -u https://your-app.com -r my-app -c my-config.yaml -w my-audit
```

Shannon's code analysis agents will examine both `frontend/` and `backend/` directories.

## Full Example: Google Sign-In App

```yaml
# configs/my-app.yaml
description: "TypeScript frontend + Python backend. Google Sign-In OAuth 2.0."

authentication:
  login_type: interactive
  login_url: "https://my-app.example.com/"
  success_condition:
    type: url_contains
    value: "/dashboard"

rules:
  avoid:
    - description: "Do not test Google OAuth endpoints"
      type: domain
      url_path: "accounts.google.com"
    - description: "Do not test Google APIs"
      type: domain
      url_path: "googleapis.com"
```

```bash
# 1. Authenticate
./shannon auth -c configs/my-app.yaml -w app-audit

# 2. Scan
./shannon start -u https://my-app.example.com -r my-app -c configs/my-app.yaml -w app-audit

# 3. Monitor
./shannon logs app-audit
```

## Limitations

- **Session lifetime**: Sessions are captured once and not automatically refreshed. Most app sessions last 1–24 hours; scans typically complete in 1–3 hours. If a session expires mid-scan, the agent reports a 401 error.
- **HttpOnly cookies**: Cannot be set in the browser via JavaScript. Agents use the cookie values in `curl` headers for API testing. Browser-based testing relies on localStorage tokens and non-HttpOnly cookies.
- **Display required**: The `auth` command opens a visible browser, so it requires a display (not available on headless servers or CI). For CI environments, use `login_type: form` or `login_type: sso` with credentials instead.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Playwright is required for interactive authentication` | Run `npm install -g playwright && npx playwright install chromium` |
| Login times out after 5 minutes | Check that `success_condition` matches the post-login URL/page. Try `text_contains` if URL doesn't change. |
| Agents report 401 during scan | Session may have expired. Re-run `shannon auth` with the same workspace, then resume the scan. |
| Browser doesn't open | Ensure you're running on a machine with a display (not SSH without X11 forwarding). |
