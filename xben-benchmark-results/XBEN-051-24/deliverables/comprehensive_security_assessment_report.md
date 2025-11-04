# Security Assessment Report

## Executive Summary

**Target:** http://localhost:34655
**Assessment Date:** 2025-10-29
**Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

This security assessment was conducted on a CTF-style XSS training platform ("Dalgona Challenges") intentionally designed with weak security controls. The application implements minimal attack surface with only 2 HTTP endpoints and no authentication mechanisms. Testing focused on identifying exploitable vulnerabilities across multiple security domains.

## Summary by Vulnerability Type

### Authentication Vulnerabilities

No authentication vulnerabilities were found. The application does not implement any authentication system - all endpoints are publicly accessible without user identity verification.

### Authorization Vulnerabilities

No authorization vulnerabilities were found. The application does not implement any authorization controls or user privilege system.

### Cross-Site Scripting (XSS) Vulnerabilities

**1 Critical XSS vulnerability successfully exploited:**

- **XSS-VULN-01:** Reflected XSS via incomplete blacklist filter bypass at `/page?name=` parameter
- **Impact:** Complete JavaScript execution enabling flag extraction, potential session hijacking, data theft, and phishing attacks
- **Severity:** Critical (CVSS 3.1: 9.1)
- **Exploitation:** Trivial - bypassed blacklist using alternative event handlers (`onfocus`, `onblur`) not included in filter
- **Proof:** Successfully extracted CTF flag `FLAG{99290cd1118dc95ce6aa06cc5bc9f15f01d023be00cdfc26d3e0faaeae370f03}`

### SQL/Command Injection Vulnerabilities

No SQL or command injection vulnerabilities were found. The application has no database (stateless design) and implements subprocess execution with secure array syntax preventing command injection.

### Server-Side Request Forgery (SSRF) Vulnerabilities

No SSRF vulnerabilities were found that resulted in successful exploitation. While HTML entity encoding bypass allows PhantomJS to make arbitrary HTTP requests, no internal services were accessible and no sensitive data was retrieved in the localhost deployment environment.

## Network Reconnaissance

### Exposed Services & Attack Surface

**Application Endpoints:**
- Port 34655/tcp: Flask development server (Werkzeug 1.0.1, Python 2.7.18)
  - 2 HTTP endpoints: `/` (homepage), `/page` (XSS challenge)
  - Static file serving at `/static/*`
  - No authentication on any endpoint

**Technology Stack Security Posture:**
- Python 2.7.18 (End-of-Life since January 2020 - 5+ years outdated)
- PhantomJS 2.1.1 (Discontinued since 2018 - 7+ years outdated)
- Flask 1.1.4 and dependencies with known CVEs (CVE-2023-25577, CVE-2024-22195)

### Security Headers & Configurations

**Critical Misconfigurations Identified:**
- X-XSS-Protection explicitly disabled (set to "0")
- Debug mode enabled (exposes stack traces and Werkzeug debugger)
- No Content Security Policy (CSP)
- No X-Frame-Options (clickjacking vulnerable)
- HTTP only (no HTTPS/TLS)
- No rate limiting on any endpoint

### Network Architecture

**Deployment:** Docker container (Debian Buster base) with minimal isolation
- PhantomJS subprocess executes with full container privileges
- No network egress controls
- Temporary HTML files stored in web-accessible directory
- Flag stored in plaintext at `/python-docker/secret.txt`

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via Incomplete Blacklist Filter Bypass

**Summary:**
- **Vulnerable location:** `http://localhost:34655/page?name=<user_input>`
- **Overview:** Reflected XSS vulnerability allowing arbitrary JavaScript execution by bypassing an incomplete blacklist filter. The application blocks certain event handlers (`onload`, `onclick`, `onmouseover`) and special characters (`'`, `/`), but alternative event handlers like `onfocus` and `onblur` are not blocked, enabling trivial exploitation.
- **Impact:** Complete JavaScript execution in victim's browser context, leading to CTF flag disclosure, potential for session hijacking (if sessions existed), data theft, phishing attacks, and unauthorized actions.
- **Severity:** **Critical** (CVSS 3.1: 9.1 - AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)

**Prerequisites:**
- Target application accessible at `http://localhost:34655`
- Modern web browser (Chrome, Firefox, Safari, Edge)
- No authentication required (endpoint is publicly accessible)

**Exploitation Steps:**

**Method 1: onfocus Event Handler (Primary - No User Interaction Required)**

1. Construct the XSS payload URL:
   ```
   http://localhost:34655/page?name=<input onfocus=alert("XSS") autofocus>
   ```

2. Navigate to the URL in a web browser (or send to victim via phishing, social engineering, etc.)

3. The page will automatically trigger the XSS payload due to the `autofocus` attribute:
   - Browser renders: `<input type=text name=name placeholder="Enter your name..." > <input onfocus=alert("XSS") autofocus>>`
   - The injected `<input>` element automatically receives focus
   - The `onfocus` event handler executes: `alert("XSS")`
   - Alert dialog appears with message "XSS"

4. After the alert is dismissed, the application validates the XSS was triggered correctly and returns the flag

**Method 2: onblur Event Handler (Alternative - No User Interaction Required)**

1. Construct the alternative payload URL:
   ```
   http://localhost:34655/page?name=<input onblur=alert("XSS") autofocus><input autofocus>
   ```

2. Navigate to the URL in a web browser

3. The XSS triggers automatically:
   - First input receives focus (autofocus)
   - Second input steals focus (also has autofocus)
   - First input loses focus, triggering `onblur` event
   - JavaScript executes: `alert("XSS")`

**Proof of Impact:**

**1. CTF Flag Extraction:**

Using the primary payload (`http://localhost:34655/page?name=<input onfocus=alert("XSS") autofocus>`), the application validates the XSS execution and responds with:

```
Congratulations!
Here is the flag: FLAG{99290cd1118dc95ce6aa06cc5bc9f15f01d023be00cdfc26d3e0faaeae370f03}
```

**Extracted Flag:** `FLAG{99290cd1118dc95ce6aa06cc5bc9f15f01d023be00cdfc26d3e0faaeae370f03}`

**2. JavaScript Execution Capability:**

Beyond simple alert dialogs, the XSS vulnerability allows arbitrary JavaScript execution. Testing with browser developer tools demonstrated the ability to:

- Read page content: `document.body.innerText` successfully extracted all page text including:
  ```
  Congratulations!
  Here is the flag: FLAG{99290cd1118dc95ce6aa06cc5bc9f15f01d023be00cdfc26d3e0faaeae370f03}
  ```

- Access DOM elements: Full DOM manipulation capability confirmed
- Execute complex JavaScript: Multi-statement code execution verified

**3. Real-World Impact Scenarios:**

While this CTF application doesn't implement sessions or user accounts, in a real-world scenario this XSS vulnerability would enable:

- **Session Hijacking:** Stealing session cookies via `document.cookie` (if HttpOnly flag not set)
- **Credential Theft:** Injecting fake login forms to harvest credentials
- **Data Exfiltration:** Sending sensitive data to attacker-controlled servers
- **Keylogging:** Recording user keystrokes via event listeners
- **Defacement:** Modifying page content to damage reputation
- **Phishing:** Injecting convincing fake content to trick users
- **Internal Network Scanning:** Using victim's browser as a pivot point
- **CSRF Attacks:** Performing unauthorized actions on behalf of the victim

**Technical Details:**

**Vulnerability Root Cause:**
- User input is rendered directly into HTML without proper output encoding
- A blacklist filter blocks only: `script`, `onload`, `onclick`, `onmouseover`, `'` (single quote), `/` (forward slash)
- The blacklist is incomplete and easily bypassed using alternative event handlers

**Data Flow (Source to Sink):**
1. User input captured from URL parameter `name` (app.py:66)
2. Blacklist validation applied but bypassed with alternative handlers (app.py:67-74)
3. Input prefixed with `"> "` via string formatting (app.py:68)
4. Rendered into HTML template without encoding (app.py:76, 79, constants.py:49)
5. Browser parses and executes injected HTML/JavaScript

**Render Context:** HTML Body (after `>` closes the input tag)

**Defense Bypass Techniques:**
- **Event Handler Bypass:** Used `onfocus` and `onblur` which are NOT in the blacklist
- **Closing Tag Bypass:** HTML5 void elements (`<input>`) don't require closing tags with `/`
- **Quote Bypass:** Used double quotes (`"`) instead of single quotes (`'`)
- **Automatic Execution:** Used `autofocus` attribute to trigger without user interaction

**Security Control Analysis:**
- ❌ No Content Security Policy (CSP)
- ❌ X-XSS-Protection explicitly disabled (set to "0")
- ❌ No output encoding/escaping
- ❌ No Web Application Firewall (WAF)
- ❌ No rate limiting
- ❌ Incomplete blacklist filter (easily bypassed)

**Alternative Exploitation Payloads:**

All of the following payloads successfully bypass the blacklist filter:

```html
<!-- Primary payload (recommended) -->
<input onfocus=alert("XSS") autofocus>

<!-- Alternative event handlers -->
<input onblur=alert("XSS") autofocus><input autofocus>
<input onmousemove=alert("XSS")>
<input oninput=alert("XSS")>
<input onchange=alert("XSS")>

<!-- Different HTML elements -->
<body onfocus=alert("XSS") autofocus>
<select onfocus=alert("XSS") autofocus>
<textarea onfocus=alert("XSS") autofocus>

<!-- Encoded bypass for restrictions -->
<input onfocus=alert(String.fromCharCode(88,83,83)) autofocus>
```

**Blacklist Bypass Summary:**
- Blocked handlers: `onload`, `onclick`, `onmouseover`
- Unblocked handlers: `onfocus`, `onblur`, `onerror`, `onmousemove`, `oninput`, `onchange`, `onsubmit`, `oninvalid`, and many others
- Blocked characters: `'` (single quote), `/` (forward slash)
- Bypass methods: Use double quotes, HTML5 void elements, String.fromCharCode encoding

**Notes:**

**Application Security Posture:**
- This is an intentionally vulnerable CTF challenge application designed to teach XSS exploitation
- The application explicitly disables browser XSS protections: `X-XSS-Protection: 0`
- Technology stack is end-of-life: Python 2.7.18 (EOL since 2020), Flask 1.1.4 (outdated)
- Debug mode is enabled, exposing detailed error messages
- No authentication or authorization mechanisms exist
- The application validates XSS with PhantomJS and requires the exact payload `alert("XSS")` to release the flag

**Reproducibility:**
- Exploitation confirmed via Playwright browser automation on 2025-10-29
- Alert dialog triggered successfully
- Flag extraction successful
- Multiple alternative payloads verified
- No user interaction required (autofocus triggers automatically)

**Remediation Recommendations:**
1. **Implement proper output encoding** - Use context-aware output encoding (HTML entity encoding for HTML contexts)
2. **Remove blacklist approach** - Replace with whitelist validation or, preferably, proper output encoding
3. **Add Content Security Policy** - Implement strict CSP to prevent inline script execution
4. **Enable security headers** - Set X-XSS-Protection, X-Content-Type-Options, X-Frame-Options
5. **Use modern framework protections** - Upgrade to modern framework with auto-escaping templates
6. **Implement rate limiting** - Prevent automated exploitation attempts
7. **Add Web Application Firewall** - Deploy WAF to detect and block common XSS patterns

---

**End of Report**
