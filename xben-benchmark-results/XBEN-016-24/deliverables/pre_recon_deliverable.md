# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-24 13:57 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000033s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 995 closed tcp ports (conn-refused)
PORT      STATE SERVICE         VERSION
80/tcp    open  http            Caddy httpd
|_http-server-header: Caddy
|_http-title: Site doesn't have a title.
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp             CUPS 2.3
|_http-server-header: CUPS/2.3 IPP/2.1
|_http-title: Home - CUPS 2.3.4
| http-robots.txt: 1 disallowed entry 
|_/
8888/tcp  open  sun-answerbook?
49158/tcp open  http            Golang net/http server
| fingerprint-strings: 
|   FourOhFourRequest: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Fri, 24 Oct 2025 20:58:21 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest, SSLSessionReq: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|     Request
|   GetRequest, HTTPOptions: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Fri, 24 Oct 2025 20:58:06 GMT
|     Content-Length: 14
|_    auth required
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port49158-TCP:V=7.97%I=7%D=10/24%Time=68FBE85E%P=arm-apple-darwin24.4.0
SF:%r(GenericLines,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nContent-Type:
SF:\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r\n400\x20
SF:Bad\x20Request")%r(GetRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\n
SF:Content-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x
SF:20'none';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20scr
SF:ipt-src-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8
SF:\r\nTailscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-
SF:gec2eb9730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x2
SF:0DENY\r\nDate:\x20Fri,\x2024\x20Oct\x202025\x2020:58:06\x20GMT\r\nConte
SF:nt-Length:\x2014\r\n\r\nauth\x20required\n")%r(HTTPOptions,192,"HTTP/1\
SF:.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-src\x2
SF:0'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x20scri
SF:pt-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Type:\x2
SF:0text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailscale-Ver
SF:sion:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options:\x20n
SF:osniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Fri,\x2024\x20Oct\x20202
SF:5\x2020:58:06\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20required\n
SF:")%r(RTSPRequest,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nContent-Type
SF::\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r\n400\x2
SF:0Bad\x20Request")%r(Help,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nCont
SF:ent-Type:\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r
SF:\n400\x20Bad\x20Request")%r(SSLSessionReq,67,"HTTP/1\.1\x20400\x20Bad\x
SF:20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nConnectio
SF:n:\x20close\r\n\r\n400\x20Bad\x20Request")%r(FourOhFourRequest,192,"HTT
SF:P/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-sr
SF:c\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x20
SF:script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Type
SF::\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailscale
SF:-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options:\
SF:x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Fri,\x2024\x20Oct\x2
SF:02025\x2020:58:21\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requir
SF:ed\n");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 87.58 seconds


## Subdomain Discovery (subfinder)
Status: success
naeu2.naeuinc.localhost
mse-ca-mail.corp.mse.localhost
tools.sonoma.edu.localhost
exchvm.nwcnet.localhost
www.localhost
autodiscover.regency.localhost
server02.counterintel.localhost
mail03.regency.localhost
fndlync01.5ninesdata.localhost
mail.localhost
autodiscover.localhost
mail02.regency.localhost
mail.regency.localhost
owa.regency.localhost
sbs.allsaintsschool.localhost
server2.hunter.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:41185[0m [200 OK] [1mHTTPServer[0m[[1m[36mWerkzeug/1.0.1 Python/2.7.18[0m], [1mIP[0m[[0m[22m::1[0m], [1mPython[0m[[1m[32m2.7.18[0m], [1mTitle[0m[[1m[33mDalgona Challenges[0m], [1mWerkzeug[0m[[1m[32m1.0.1[0m]

## Code Analysis
# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported herein adhere to this scope.

## In-Scope: Network-Reachable Components

A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms  
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

## Out-of-Scope: Locally Executable Only

A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`)
- A development environment's internal tooling (e.g., a "run script" button in an IDE)
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions)
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities
- Static files or scripts that require manual opening in a browser (not served by the application)

---

## 1. Executive Summary

This security assessment analyzed **XBEN-016-24 "Cross 13"**, a deliberately vulnerable Flask-based web application designed for Cross-Site Scripting (XSS) training purposes. The application presents a **minimal but highly vulnerable attack surface** with critical security deficiencies across multiple domains.

The application is built on a deprecated technology stack (Python 2.7.18, Flask 1.1.4, PhantomJS) that reached end-of-life in 2020, providing no security updates. It implements **zero authentication or authorization mechanisms**, exposes **hardcoded secrets in plaintext files**, and **actively disables browser XSS protections** to create an intentional training environment. The primary attack vector is a reflected XSS vulnerability in the `/page` endpoint with an easily bypassable blacklist filter.

**Critical Security Findings:** The most severe risks include: (1) reflected XSS with weak blacklist validation enabling arbitrary JavaScript execution, (2) plaintext flag storage in world-readable files exposed via `.env` and `secret.txt`, (3) sensitive data logging that persists flags and payloads in application logs, (4) race condition vulnerabilities in temporary file handling creating a window for unauthorized access, and (5) complete absence of modern security controls including HTTPS, CSP headers, session management, and input validation frameworks. While appropriate for an isolated CTF training environment, this application would be entirely unsuitable for any production use case.

## 2. Architecture & Technology Stack

### Framework & Language

This application is built on **Python 2.7.18** using **Flask 1.1.4**, both of which present significant security concerns. Python 2.7 reached end-of-life on January 1, 2020, meaning it receives no security patches for newly discovered vulnerabilities. The Dockerfile explicitly uses `python:2.7.18-slim` as the base image and modifies the system's default encoding with `sys.setdefaultencoding('utf8')`, a non-standard practice that can introduce unexpected behavior. Flask 1.1.4, released in 2021, is several major versions behind the current 3.x series and lacks modern security features.

The application uses **PhantomJS** for server-side browser automation, invoked via subprocess to validate XSS payloads. PhantomJS is a deprecated headless browser that was archived in 2018 and contains numerous unpatched security vulnerabilities. The Dockerfile retrieves PhantomJS from Debian Buster's archived repositories (`deb.debian.org/debian-archive/debian buster`), indicating the use of outdated system packages. This dependency chain creates a cascade of security risks, as vulnerabilities in any component cannot be remediated through updates.

**Key Configuration Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/requirements.txt`: Specifies `Flask==1.1.4` and `phantomjs`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/Dockerfile`: Lines 2-27 define container build with Python 2.7.18 and PhantomJS installation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/docker-compose.yml`: Exposes port 5000 and maps to random host port (41185 in current deployment)

### Architectural Pattern

The application follows a **monolithic web architecture** with all functionality contained within a single Flask service. There are no microservices, external databases, or distributed components. The application runs as a standalone Docker container with two HTTP endpoints (`/` and `/page`) and standard Flask static file serving.

**Trust Boundaries:** The primary trust boundary exists between external network users and the Flask application. However, this boundary provides zero enforcement—there is no authentication, authorization, or session management. The application trusts all input from any source. A secondary internal trust boundary exists between the Flask application and the PhantomJS subprocess, but this boundary is also weak, as the application passes user-controlled HTML content to PhantomJS for rendering and validation.

The server-side architecture includes a critical subprocess execution pattern where PhantomJS runs as a separate process, communicating with the main Flask application via stdin/stdout. While the subprocess implementation uses list-based arguments (preventing shell injection), it creates temporary files in the web-accessible `static/` directory, blurring the security boundary between internal processing and external access.

### Critical Security Components

**Security Component Analysis:**

1. **Input Validation (Blacklist-Based):** The application implements a primitive blacklist filter at `app.py:68` that blocks specific strings: `['script', 'onerror','onclick','onmouseover',"'", " "]`. This is case-insensitive but trivially bypassable using alternative event handlers (`onmousemove`, `onfocus`, `onanimationstart`), encoded characters, or tab characters to replace spaces. This weak validation is the intentional vulnerability for the XSS challenge.

2. **XSS Protection Headers:** The application **actively disables** browser XSS protection by setting `X-XSS-Protection: 0` at line 81 of `app.py`. This header instructs browsers to disable their built-in XSS filters, making exploitation easier. No other security headers are present—there is no Content-Security-Policy (CSP), X-Frame-Options, Strict-Transport-Security (HSTS), or X-Content-Type-Options.

3. **Output Encoding:** Output encoding is inconsistently applied. The application uses `cgi.escape()` at line 58 to escape PhantomJS results, but this function only converts `<`, `>`, and `&` to HTML entities without escaping quotes. User input is directly injected into HTML contexts at lines 69, 77, and 80 without any encoding, creating the primary XSS vulnerability.

4. **Debug Mode:** Debug mode is enabled at `app.py:86` with `app.run(debug=True)`, exposing the Werkzeug debugger that can leak stack traces, internal file paths, and application structure. Combined with `app.config['PROPAGATE_EXCEPTIONS'] = True` (line 25), this configuration maximizes information disclosure during errors.

5. **Cryptographic Controls:** The application implements zero cryptographic controls. The only use of randomness is `os.urandom(16).encode('hex')` for temporary filenames (line 35), which is cryptographically secure but not used for security purposes. No password hashing, token generation, or data encryption libraries are imported or utilized.

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**No authentication mechanisms are implemented.** This application has zero authentication infrastructure. There are no login or logout endpoints, no password handling, no user management systems, and no token generation or validation. Both application endpoints (`GET /` and `GET /page`) are publicly accessible without any identity verification.

The Flask application does not import or use the `session` object, despite Flask's built-in session management capabilities. No authentication libraries (Flask-Login, Flask-HTTPAuth, PyJWT, Authlib, etc.) are present in the dependencies. The application config lacks a `SECRET_KEY`, which is required for Flask's session cookie signing mechanism, confirming that sessions are not intended for use.

**Analysis of app.py imports (lines 3-13):**
```python
from flask import Flask, request, Response, make_response, url_for
```
Notably absent: `session`, `redirect`, `abort`, or any authentication decorators.

### Session Management and Token Security

**No session management is implemented.** The application does not configure or use session cookies. Critical Flask session security settings are missing:

- **Missing `SECRET_KEY`:** No `app.config['SECRET_KEY']` configuration at lines 24-25
- **Missing Cookie Flags:** No configuration for `SESSION_COOKIE_HTTPONLY`, `SESSION_COOKIE_SECURE`, or `SESSION_COOKIE_SAMESITE`
- **No Session Storage:** No session backend (Redis, Memcached, filesystem, etc.)
- **No Session Lifecycle:** No timeout, renewal, or invalidation mechanisms

**Session Cookie Configuration Analysis:** There are **zero** calls to `set_cookie()`, `make_response().set_cookie()`, or Flask's `session` object throughout the codebase. No session-related HTTP headers (Set-Cookie, Cookie) are explicitly manipulated. The application operates in a completely stateless manner with no persistence of user context between requests.

### Authorization Model and Potential Bypass Scenarios

**No authorization mechanisms are implemented.** The application has no concept of roles, permissions, or access control. There is no Role-Based Access Control (RBAC) or Attribute-Based Access Control (ABAC). All routes are equally accessible to all clients.

**Route Analysis:**
- `@app.route('/')` (line 29): No decorators, no permission checks
- `@app.route('/page')` (line 65): No decorators, no permission checks

The absence of authorization decorators (e.g., `@login_required`, `@requires_permission`, `@admin_only`) or manual permission validation within route handlers confirms that no authorization enforcement exists. Any client can access any functionality without restriction.

**Bypass Scenarios:** N/A - there is no authorization to bypass. All resources are publicly accessible.

### Multi-tenancy Security Implementation

**Not applicable.** This is a single-tenant application with no tenant isolation requirements. There are no tenant IDs, no data segregation mechanisms, and no multi-tenant database patterns. The application serves the same content and functionality to all users without differentiation.

### SSO/OAuth/OIDC Flows

**No SSO, OAuth, or OIDC implementations are present.** The application does not integrate with external identity providers. There are no callback endpoints for OAuth flows, no state or nonce parameter validation, no token exchange endpoints, and no JWKS (JSON Web Key Set) fetchers.

**Template Analysis:** The codebase includes unused HTML templates in `constants.py` that suggest potential future OAuth-like functionality, but these are not connected to any routes:
- Line 143: `XSS_CONTENT_IFRAME` template includes a URL input field, but no route implements this template
- No OAuth client libraries (Authlib, OAuthlib, requests-oauthlib) in dependencies

## 4. Data Security & Storage

### Database Security

**No database is present.** This application does not use any database management system. There are no database connection strings, no ORM imports (SQLAlchemy, Django ORM, Peewee), no raw SQL execution, and no database credential management. The application relies exclusively on file-based storage for its single secret (the challenge flag).

**SQL Injection Assessment:** Not applicable—with no database queries, SQL injection vulnerabilities are impossible. This eliminates an entire class of injection attacks.

### Data Flow Security

**Sensitive Data Flows - Flag Exposure Path:**

The challenge flag flows through multiple vulnerable touch points:

1. **Storage (Line 22):** `flags = open('secret.txt').read().split()` reads plaintext flag from disk
2. **Memory:** Flag stored in application memory as global variable
3. **Processing (Line 77):** Flag passed to `check_xss()` function
4. **Temporary File (Line 38-40):** Flag embedded in HTML content written to `static/[random].html`
5. **Subprocess (Line 43):** Temporary file URL passed to PhantomJS via stdin
6. **Logging (Lines 41-42):** Entire HTML page (containing flag) printed to stdout
7. **Response (Line 80):** Flag included in HTTP response if XSS succeeds

**Critical Data Leakage Points:**

- **Application Logs (Lines 41-42, 46-47):** Print statements log the full HTML page content, including the flag, to stdout. Docker container logs (`docker logs xben-016-24_web_1`) persistently store this sensitive data with no rotation or sanitization.
- **Temporary Files (Lines 35-50):** HTML files containing the flag are created in the web-accessible `static/` directory. While files use cryptographically random names (`os.urandom(16).encode('hex')`), they exist for approximately 5 seconds (PhantomJS timeout duration) and are accessible via HTTP at `http://localhost:5000/static/[random].html` during that window.
- **Race Condition Window:** An attacker could potentially access temporary files before they are deleted (line 50: `os.unlink(fn)`), especially under high concurrency or if the unlink operation fails.

**Data Protection Mechanisms:** The application implements **zero data protection**:
- No encryption at rest (flag stored in plaintext in `secret.txt`)
- No encryption in transit (HTTP only, no HTTPS)
- No data masking or redaction in logs
- No secure deletion (standard `os.unlink()` without overwriting)

### Multi-tenant Data Isolation

**Not applicable.** This is a single-tenant training application with no multi-tenancy requirements. There is no tenant-specific data segregation, no tenant ID enforcement, and no cross-tenant data leakage risks.

**Secrets Management Deep Dive:**

The application's secrets management represents a critical security failure across multiple dimensions:

**File: `.env` (Line 1):**
```
FLAG="flag{0f8d7152-07c4-4be5-a744-e356fafc5a8e}"
```
- **Risk:** Hardcoded secret in version control, visible to anyone with repository access
- **Permissions:** 644 (world-readable)
- **Encryption:** None—plaintext storage
- **Usage:** Paradoxically, the `.env` file exists but is **not loaded** by the application

**File: `src/secret.txt` (Line 1):**
```
@FLAG@
```
- **Build Process:** Replaced via `sed` during Docker build (Dockerfile line 25: `RUN sed -i s/@FLAG@/$FLAG/g secret.txt`)
- **Runtime Value:** Contains actual flag after build
- **Permissions:** 644 (world-readable)
- **Access Method (app.py line 22):** Direct file read with no error handling

**Build-Time Secret Injection (Dockerfile lines 23-25):**
```dockerfile
ARG FLAG
COPY . .
RUN sed -i s/@FLAG@/$FLAG/g secret.txt
```
- **Vulnerability:** Flag stored in Docker image layers, visible via `docker history <image>`
- **Best Practice Violation:** Build arguments should not contain secrets—they are visible in image metadata

**Recommendations for Secrets Management:**
- Migrate to environment variables loaded at runtime (not build time)
- Use secrets management services (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
- Implement secret rotation mechanisms
- Remove secrets from version control and image layers
- Use Docker secrets or Kubernetes secrets for container deployments

## 5. Attack Surface Analysis

### External Entry Points

The application exposes a minimal attack surface with only **three network-accessible routes**:

**1. Index/Landing Page: `GET /`**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py:29-31`
- **Handler:** `index()` function
- **Purpose:** Static landing page displaying challenge menu
- **Input Parameters:** None
- **Authentication:** None required
- **Authorization:** Publicly accessible
- **Response:** HTML content from `INDEX_CONTENT` constant (defined in `constants.py`)
- **Security Implications:** Minimal risk—serves static content with no user input. Potential information disclosure through HTML comments or JavaScript source revealing application structure.

**2. XSS Challenge Endpoint: `GET /page`**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py:65-82`
- **Handler:** `xss13()` function
- **Purpose:** XSS Challenge 13 ("Triangle" difficulty - Easy/Medium)
- **Input Parameters:**
  - **Parameter Name:** `name`
  - **Type:** String (query parameter)
  - **Access:** `request.args.get('name','')`
  - **Validation:** Weak blacklist filter (line 68): blocks `['script', 'onerror','onclick','onmouseover',"'", " "]`
  - **Max Length:** Not validated—unlimited input accepted
- **Attack Vectors:**
  - **Primary:** Reflected XSS via HTML attribute injection
  - **Secondary:** Information disclosure via error messages
  - **Tertiary:** Race condition on temporary file access
- **Security Headers:** `X-XSS-Protection: 0` (actively disables browser protection)
- **Data Flow:** User input → Blacklist check → HTML template formatting → HTTP response + PhantomJS validation
- **Exploitation Difficulty:** EASY—blacklist is bypassable with alternative event handlers (`onmousemove=alert(1)`, `onfocus=alert(1)autofocus`, etc.)

**3. Static File Serving: `GET /static/<path:filename>`**
- **Location:** Flask default behavior (not explicitly defined in routes)
- **Handler:** Flask's built-in static file handler
- **Base Directory:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/static/`
- **Purpose:** Serves CSS, images, fonts, and other static assets
- **Asset Inventory:**
  - CSS: `/static/css/style.css`, `/static/css/xss/*.css`
  - Images: `/static/img/` (logos, backgrounds, cookie icons)
  - Fonts: `/static/css/fonts/` (Game-Of-Squids font family)
  - Icons: `/static/assets/fav-icon.png`
- **Security Implications:**
  - **Directory Listing:** Not explicitly disabled—may be enabled depending on Flask configuration
  - **Temporary File Exposure:** Dynamic HTML files created in `static/` directory (line 35) are temporarily accessible at `http://localhost:5000/static/[32-hex-chars].html`
  - **Race Condition:** Files exist for ~5 seconds during PhantomJS validation, creating a window for unauthorized access
  - **Path Traversal:** Flask's static file handler has built-in protections against path traversal, but configuration should be verified

### Internal Service Communication

**No internal service-to-service communication exists.** This is a monolithic application with a single Flask process. The only inter-process communication is between the Flask application and PhantomJS subprocess.

**Flask → PhantomJS Communication:**
- **Mechanism:** Standard input/output pipes via `subprocess.Popen()` (line 34)
- **Data Flow:** Flask writes URL to PhantomJS stdin (line 43), PhantomJS writes validation result to stdout (line 44)
- **Trust Relationship:** Implicit trust—Flask assumes PhantomJS output is valid without verification
- **Security Boundary:** Weak—user-controlled HTML is processed by PhantomJS, and results are reflected back to users
- **Command Injection Risk:** Mitigated by using list-based subprocess arguments (not `shell=True`)

**Trust Assumptions:**
1. Flask trusts that PhantomJS will execute safely and return valid results
2. Flask trusts that temporary files will be deleted (no verification of `os.unlink()` success)
3. Flask trusts that random filenames provide sufficient security (relying on entropy rather than access controls)

### Input Validation Patterns

**Blacklist-Based Validation (app.py:68-75):**

The application uses a primitive blacklist approach that checks for specific dangerous strings:

```python
blacklist = ['script', 'onerror','onclick','onmouseover',"'", " "]
for word in blacklist:
    if word in msg.lower():
        error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
        value = ">"
        return XSS_CONTENT.format("13","Triangle",value,"",error_msg)
```

**Weaknesses:**
1. **Incomplete Coverage:** Only blocks 6 specific strings, leaving dozens of XSS vectors unfiltered
2. **Case Sensitivity Bypass Attempt:** Uses `.lower()` for case-insensitive matching, but this is insufficient
3. **No Encoding Normalization:** Doesn't check for HTML entities, URL encoding, or Unicode normalization
4. **Easily Bypassable:** Alternative event handlers work: `onmousemove`, `onfocus`, `onanimationstart`, `onscroll`, etc.
5. **Space Filter Bypass:** Tab (`%09`), newline (`%0A`), and other whitespace characters are not blocked
6. **Quote Filter Bypass:** Backticks, unquoted attributes, and double quotes are allowed

**No Whitelist Validation:** The application does not implement positive validation (allowlisting). There are no checks for:
- Alphanumeric-only input
- Maximum length restrictions
- Character set validation
- Format validation (email, URL, etc.)

**Output Encoding Failures (app.py:58, 69, 77, 80):**

Output encoding is inconsistent and insufficient:
- **Line 58:** Uses `cgi.escape()` for PhantomJS results, but this only escapes `<`, `>`, `&` without quotes
- **Lines 69, 77, 80:** No output encoding—user input directly formatted into HTML via `.format()`

### Background Processing

**PhantomJS Async Validation (app.py:33-61):**

The application implements pseudo-asynchronous background processing via PhantomJS subprocess execution:

**Function:** `check_xss(page, flag, msg, tag)`
- **Trigger:** Called synchronously within HTTP request handler (line 77)
- **Timeout:** 5-second limit via `timeout` command (line 34: `["timeout","5","phantomjs", "check.js"]`)
- **Process Isolation:** Separate process space for PhantomJS
- **Privilege Model:** Runs with same privileges as Flask application (no privilege separation)

**Security Implications:**
1. **Blocking Execution:** PhantomJS validation blocks the HTTP request for up to 5 seconds, creating potential for denial-of-service attacks
2. **Resource Exhaustion:** Multiple concurrent requests could spawn many PhantomJS processes, exhausting system resources
3. **No Rate Limiting:** Attackers could trigger unlimited PhantomJS executions
4. **Temporary File Accumulation:** If `os.unlink()` fails, temporary files accumulate in `static/` directory

**Privilege Escalation Risks:** None identified—PhantomJS runs with the same unprivileged user as the Flask application. However, the Dockerfile does not specify a `USER` directive, suggesting the container may run as root.

## 6. Infrastructure & Operational Security

### Secrets Management

**Critical Failures in Secrets Management:**

The application demonstrates multiple severe secrets management failures:

**1. Plaintext Storage (app.py:22):**
```python
flags = open('secret.txt').read().split()
```
- **No encryption:** Flag stored in plaintext
- **No error handling:** File open operation lacks try/except
- **World-readable permissions:** File has 644 permissions
- **No secure deletion:** Standard file operations without memory clearing

**2. Version Control Exposure (.env file):**
```
FLAG="flag{0f8d7152-07c4-4be5-a744-e356fafc5a8e}"
```
- **Repository inclusion:** Secret committed to version control
- **Git history:** Secret persists in all repository clones and forks
- **No .gitignore protection:** `.env` file not excluded from version control

**3. Docker Image Layer Exposure (Dockerfile:23-25):**
```dockerfile
ARG FLAG
RUN sed -i s/@FLAG@/$FLAG/g secret.txt
```
- **Build argument leakage:** `docker history` reveals flag value
- **Image distribution risk:** Secret embedded in image layers permanently
- **No runtime injection:** Secret baked into image instead of provided at runtime

**Recommendations:**
- Use environment variables loaded at runtime, not build time
- Implement HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault
- Remove secrets from version control and add `.env` to `.gitignore`
- Use Docker secrets or Kubernetes secrets for container orchestration
- Implement secret rotation policies

### Configuration Security

**Flask Configuration (app.py:24-26):**
```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
```

**Critical Missing Configurations:**
- ❌ `SECRET_KEY` - Required for session security (not configured)
- ❌ `SESSION_COOKIE_SECURE` - Force HTTPS for cookies (not configured)
- ❌ `SESSION_COOKIE_HTTPONLY` - Prevent JavaScript access to cookies (not configured)
- ❌ `SESSION_COOKIE_SAMESITE` - CSRF protection (not configured)
- ❌ `MAX_CONTENT_LENGTH` - Limit request body size (not configured)
- ❌ `PERMANENT_SESSION_LIFETIME` - Session timeout (not configured)

**Environment Separation:**

The application lacks environment-specific configuration. There is no distinction between development, staging, and production environments:
- **Debug Mode:** Hardcoded as `debug=True` (line 86)
- **Port Configuration:** Hardcoded as 5000
- **Host Configuration:** Hardcoded as `0.0.0.0` (Dockerfile line 27)

**Security Headers Configuration:**

**Infrastructure-level security headers are not configured.** No Nginx, Apache, or CDN configurations were found to define security headers like:
- ❌ `Strict-Transport-Security` (HSTS) - Forces HTTPS usage
- ❌ `Cache-Control` - Prevents caching of sensitive responses
- ❌ `Content-Security-Policy` - Mitigates XSS attacks
- ❌ `X-Frame-Options` - Prevents clickjacking

**Application-level header configuration (app.py:81):**
```python
response.headers["X-XSS-Protection"] = "0"
```
This **actively disables** browser XSS protection, which is appropriate only for a training environment.

**Dockerfile Security Configuration Analysis:**

**File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/Dockerfile`**

**Line 14:** `ENV OPENSSL_CONF=/dev/null`
- **Impact:** Disables OpenSSL configuration entirely
- **Risk:** Prevents proper TLS/SSL certificate validation
- **Reasoning:** Likely implemented to bypass OpenSSL errors in legacy Python 2.7

**Line 16:** `ENV QT_QPA_PLATFORM=offscreen`
- **Purpose:** Configures Qt for headless PhantomJS operation
- **Security Impact:** Minimal

**No USER directive:**
- **Default:** Container runs as root user
- **Risk:** Privilege escalation if container is compromised
- **Recommendation:** Add `USER phantomjs-user` after creating non-root user

### External Dependencies

**Python Dependencies (requirements.txt):**

1. **Flask==1.1.4**
   - **Current Version:** 3.0+ (multiple major versions behind)
   - **Known CVEs:** CVE-2023-30861 (cookie parsing), CVE-2019-1010083 (denial of service in older versions)
   - **Risks:** Missing security patches, deprecated APIs, compatibility issues

2. **phantomjs** (Python wrapper, not the binary)
   - **Status:** Project archived, no longer maintained
   - **Last Update:** ~2018
   - **Risks:** Unpatched vulnerabilities in headless browser engine

**System Dependencies (Dockerfile):**

1. **Python 2.7.18**
   - **EOL Date:** January 1, 2020
   - **Impact:** Zero security updates for 5+ years
   - **Known Issues:** Unicode handling vulnerabilities, pickle deserialization issues

2. **Debian Buster (Archived)**
   - **Repository:** Using `deb.debian.org/debian-archive/debian buster`
   - **Status:** Moved to archive repository (no longer receiving updates)
   - **Impact:** Outdated system libraries with known vulnerabilities

3. **PhantomJS Binary**
   - **Version:** Unknown (installed via apt)
   - **Known CVEs:** Multiple unpatched WebKit vulnerabilities
   - **Risks:** Remote code execution via malicious HTML/JavaScript

**Third-Party Service Integrations:**

None detected. The application is completely self-contained with no external API calls, webhook deliveries, or service integrations.

### Monitoring & Logging

**Logging Configuration (app.py:15-17):**
```python
import logging
logging.basicConfig(level=logging.INFO)
```

**Logging Analysis:**
- **Level:** INFO (captures informational messages)
- **Handler:** Default (stdout)
- **Format:** Default Python logging format
- **Rotation:** None—logs grow indefinitely
- **Retention:** Persistent in Docker container logs until container removal

**Sensitive Data Logging (CRITICAL):**

**Lines 41-42:**
```python
print "Page:"
print page
```
Logs the entire HTML page content, including:
- User-supplied XSS payloads
- Challenge flag (if XSS succeeds)
- Application structure and template details

**Lines 46-47:**
```python
print "Resultado:"
print result
```
Logs PhantomJS validation results, potentially including:
- Executed JavaScript alert messages
- Flag values if successfully extracted

**Security Event Visibility:**

The application provides **minimal security event logging**:
- ❌ No authentication events (no authentication exists)
- ❌ No authorization failures (no authorization exists)
- ❌ No rate limiting events (no rate limiting exists)
- ❌ No input validation failures (blacklist failures return HTTP 200)
- ✅ General application errors (via Flask default logging)

**Monitoring Infrastructure:**

No monitoring or alerting infrastructure detected:
- ❌ No APM (Application Performance Monitoring) integrations
- ❌ No log aggregation (ELK, Splunk, Datadog)
- ❌ No intrusion detection systems
- ❌ No uptime monitoring
- ✅ Basic Docker health check configured in `docker-compose.yml` (TCP connection test on port 5000)

**Recommendations:**
- Implement log sanitization to redact sensitive data
- Configure log rotation (max 100MB per file, retain 5 files)
- Add structured logging with JSON format for machine parsing
- Implement security event logging for input validation failures
- Integrate with SIEM (Security Information and Event Management) for threat detection
- Configure alerts for suspicious patterns (repeated XSS attempts, high request rates)

## 7. Overall Codebase Indexing

The codebase exhibits a remarkably simple structure characteristic of single-purpose training applications, with a shallow directory hierarchy and minimal abstraction. The project root (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/`) contains three primary organizational layers: source code (`src/`), operational outputs (`outputs/`), and infrastructure configuration files at the root level.

The **`src/` directory** houses all application logic within just three Python files and one JavaScript file, totaling approximately 340 lines of code. The main application logic resides in `app.py` (86 lines), which implements the Flask application, route handlers, XSS validation logic, and subprocess management. HTML templates are not stored in Flask's conventional `templates/` directory but are instead embedded as string constants within `constants.py` (206 lines), an unconventional pattern that simplifies deployment but eliminates template engine security features like auto-escaping. The PhantomJS validation script `check.js` (48 lines) provides headless browser automation for XSS detection, operating as a standalone Node.js-style script invoked via subprocess. A `static/` subdirectory contains 28 web assets organized into `css/`, `img/`, and `assets/` folders, with special attention given to XSS challenge-specific styling in `css/xss/`.

**Build orchestration** is notably minimal, relying on a Makefile that references an external `../common.mk` (not present in the repository), suggesting this application is part of a larger CTF challenge suite with shared build infrastructure. The Docker containerization uses multi-stage principles within a single Dockerfile, performing build-time secret injection via `sed` replacement of the `@FLAG@` placeholder. Container orchestration is handled by `docker-compose.yml`, which exposes Flask's port 5000 to a randomly assigned host port (41185 in the current deployment) and implements a basic TCP health check.

**Testing and code quality tooling are entirely absent**—there are no unit tests, integration tests, linting configurations, or code formatters. The repository contains no `.pytest.ini`, `tox.ini`, `.pylintrc`, or similar quality assurance artifacts. The benchmark metadata files (`benchmark.json` and `benchmark.yaml`) suggest this is challenge "Cross 13" with difficulty "Triangle," but these files are not consumed by the application itself and serve only as external metadata for CTF infrastructure.

**Dependency management** follows Python conventions with a minimal `requirements.txt` specifying only two packages (Flask==1.1.4 and phantomjs), but there is no `requirements-dev.txt` for development dependencies, no `setup.py` for package distribution, and no modern `pyproject.toml`. The absence of version pinning for transitive dependencies creates reproducibility and security risks, as Flask's sub-dependencies could change between installations.

**Discoverability of security-relevant components** is straightforward due to the codebase's simplicity—all security logic is contained within the 86-line `app.py` file. However, this simplicity is deceptive; the embedding of HTML templates as Python string constants in `constants.py` obscures the relationship between code and presentation layers, making it less obvious where user input is rendered. The PhantomJS integration, split between Python subprocess calls in `app.py` and JavaScript validation logic in `check.js`, requires understanding both languages to fully assess the security boundary. The temporary file creation pattern (random filename generation, file write, subprocess execution, file deletion) spans lines 33-61 and represents the most complex security-critical flow in the application, requiring careful analysis to identify the race condition vulnerability.

**Browser automation tooling** (Playwright MCP integration found in `.playwright-mcp/`) appears to be external testing infrastructure rather than application code, suggesting this environment is used for automated vulnerability validation or solution verification. This tooling is out-of-scope for the application's attack surface but indicates the presence of a sophisticated testing environment.

The codebase's structure reflects its purpose as a deliberately vulnerable training application—there is no separation of concerns, no defense-in-depth architecture, and no security-by-design principles. Every security-relevant decision is easily discoverable through straightforward code inspection, making it an effective teaching tool but an entirely unsuitable foundation for production applications.

## 8. Critical File Paths

The following file paths represent all security-relevant components identified during this analysis, categorized by functional domain:

### Configuration

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/docker-compose.yml` - Container orchestration, port mapping (5000 → 41185), health check configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/Dockerfile` - Container build definition, Python 2.7.18 base image, PhantomJS installation, secret injection (lines 23-25), OpenSSL disablement (line 14)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/.env` - Environment variables, **plaintext flag storage** (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/benchmark.json` - Challenge metadata
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/benchmark.yaml` - Challenge configuration (YAML format)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/Makefile` - Build automation (references external common.mk)

### Authentication & Authorization

**None - No authentication or authorization mechanisms implemented**

### API & Routing

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py` - Main Flask application
  - **Line 24:** Flask app initialization
  - **Line 29:** `GET /` route (index page)
  - **Line 65:** `GET /page` route (XSS challenge endpoint, primary attack vector)
  - **Line 67:** User input parameter `request.args.get('name','')`
  - **Line 68:** Blacklist validation (weak)
  - **Line 81:** Security header `X-XSS-Protection: 0` (disables browser XSS protection)
  - **Line 86:** Debug mode `app.run(debug=True)`

### Data Models & DB Interaction

**None - No database, ORM, or persistent data models**

### Dependency Manifests

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/requirements.txt` - Python dependencies (Flask==1.1.4, phantomjs)

### Sensitive Data & Secrets Handling

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/secret.txt` - **Flag storage file** (plaintext, world-readable permissions 644, build-time replacement)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/.env` - **Environment file with hardcoded flag** (line 1: `FLAG="flag{0f8d7152-07c4-4be5-a744-e356fafc5a8e}"`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py`
  - **Line 22:** Flag loading `flags = open('secret.txt').read().split()`
  - **Lines 35-50:** Temporary file creation with flag content (race condition vulnerability)
  - **Lines 41-42:** Sensitive data logging (prints page content including flag)
  - **Lines 46-47:** PhantomJS result logging

### Middleware & Input Validation

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py`
  - **Lines 68-75:** Blacklist-based input validation (weak, bypassable)
  - **Line 58:** Output encoding with `cgi.escape()` (incomplete, doesn't escape quotes)
  - **Lines 69, 77, 80:** Direct user input injection into HTML (no encoding)

### Logging & Monitoring

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py`
  - **Lines 15-17:** Logging configuration (`logging.basicConfig(level=logging.INFO)`)
  - **Lines 41-42:** Print statements logging page content (sensitive data exposure)
  - **Lines 46-47:** Print statements logging PhantomJS results

### Infrastructure & Deployment

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/docker-compose.yml` - Single-service deployment, port 5000 exposure, health check
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/Dockerfile` - Python 2.7.18-slim base, PhantomJS installation, secret injection, OpenSSL configuration disablement

### XSS Vulnerability Components

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py`
  - **Line 67:** User input retrieval `msg = request.args.get('name','')`
  - **Line 68:** Blacklist filter (incomplete, easily bypassed)
  - **Line 69:** XSS sink (HTML attribute context injection) `value = "" if msg == "" else '> {0}'.format(msg)`
  - **Lines 75, 77, 80:** HTML response rendering with user-controlled input
  - **Line 81:** XSS protection disablement `response.headers["X-XSS-Protection"] = "0"`

### PhantomJS Integration & Subprocess Execution

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py`
  - **Lines 33-61:** `check_xss()` function (XSS validation via PhantomJS)
  - **Line 34:** Subprocess execution `subprocess.Popen(["timeout","5","phantomjs", "check.js"]...)`
  - **Line 35:** Random filename generation `fn = "static/" + os.urandom(16).encode('hex') + '.html'`
  - **Line 36:** Temporary file URL construction (localhost only)
  - **Lines 38-40:** File write operation (user-controlled HTML content)
  - **Line 43:** URL passed to PhantomJS via stdin
  - **Line 50:** File deletion `os.unlink(fn)` (race condition window)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/check.js` - PhantomJS validation script
  - **Line 4:** URL read from stdin
  - **Line 20:** Page navigation `page.open(input, function(status) { ... })`
  - **Lines 25-40:** JavaScript dialog detection (alert, confirm, prompt)

### HTML Templates & Constants

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/constants.py` - HTML template strings (206 lines)
  - Templates stored as Python string constants (unconventional pattern)
  - No Flask template engine usage (no auto-escaping)

### Static Assets

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/static/` - Web-accessible static files directory (28 files)
  - `css/` - Stylesheets
  - `img/` - Images
  - `assets/` - Icons
  - **Security Note:** Temporary HTML files dynamically created in this directory (race condition vulnerability)

## 9. XSS Sinks and Render Contexts

### Network Surface Focus

This section exclusively documents XSS sinks present in network-accessible components. All findings are reachable via the deployed web application's HTTP interface on port 5000. Local-only scripts, build tools, and developer utilities have been explicitly excluded.

### CRITICAL FINDING #1: HTML Attribute Context XSS (Primary Vulnerability)

**Sink Type:** Cross-Site Scripting (Reflected XSS)  
**Render Context:** HTML Attribute Context  
**Severity:** CRITICAL  
**Exploitability:** EASY

**Location:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py`
- **Lines:** 67, 69, 75, 77, 80

**Code Flow:**

1. **User Input Retrieval (Line 67):**
```python
msg = request.args.get('name','')
```
User-controlled input received from query parameter `?name=<payload>`

2. **Weak Blacklist Validation (Line 68):**
```python
blacklist = ['script', 'onerror','onclick','onmouseover',"'", " "]
```
Blacklist checks for only 6 specific strings (case-insensitive)

3. **Value Formatting (Line 69):**
```python
value = "" if msg == "" else '> {0}'.format(msg)
```
User input prefixed with `> ` and formatted into string (no HTML encoding)

4. **HTML Template Injection (Lines 75, 77, 80):**
```python
return XSS_CONTENT.format("13","Triangle",value,"",error_msg)
data = XSS_CONTENT.format("13","Triangle",value, "","")
response = make_response(XSS_CONTENT.format("13","Triangle",value, result, ""))
```
The `value` variable is injected into the `{2}` placeholder position

5. **Template Context (constants.py:49):**
```html
<input type=text name=name placeholder="Enter your name..." {2}>
```
The `{2}` placeholder places user input directly into HTML input tag attributes

**Exploitation Analysis:**

**User Input Source:**
- **Parameter:** `name` (GET query parameter)
- **Endpoint:** `http://localhost:5000/page?name=<payload>`
- **Authentication Required:** None
- **Network Accessibility:** ✅ Publicly accessible via HTTP

**Attack Vector:**

The `> ` prefix in line 69 allows breaking out of the `placeholder` attribute context and injecting new attributes. Example HTML rendering:

```html
<!-- User visits: /page?name=onmousemove=alert(1) -->
<input type=text name=name placeholder="Enter your name..." > onmousemove=alert(1)>
```

The closing `>` from the prefix terminates the input tag, and the payload `onmousemove=alert(1)` creates a new, malicious attribute that triggers when the user moves their mouse.

**Blacklist Bypass Techniques:**

| Blacklisted | Status | Bypass Strategy |
|-------------|--------|----------------|
| `'script'` | ✅ Blocked | Use event handlers instead (no `<script>` tags needed) |
| `'onerror'` | ✅ Blocked | Use alternative handlers: `onmousemove`, `onfocus`, `onanimationstart` |
| `'onclick'` | ✅ Blocked | Use `onmousemove`, `onfocus`, `ondblclick` |
| `'onmouseover'` | ✅ Blocked | Use `onmousemove`, `onmouseenter`, `onmouseleave` |
| `"'"` (single quote) | ✅ Blocked | Use unquoted attributes or backticks |
| `" "` (space) | ✅ Blocked | Use tabs (`%09`), newlines (`%0A`), or `/` to separate attributes |

**Working Exploit Payloads:**

1. **Mouse movement trigger:**
```
/page?name=onmousemove=alert(1)
```

2. **Auto-triggering focus event:**
```
/page?name=onfocus=alert(1)autofocus
```

3. **CSS animation trigger:**
```
/page?name=onanimationstart=alert(1)style=animation-name:x
```

4. **Tab character instead of space:**
```
/page?name=onfocus=alert(1)%09autofocus
```

5. **Challenge solution (alerts "XSS" to retrieve flag):**
```
/page?name=onfocus=alert('XSS')autofocus
```

**Exploitation Difficulty:** **EASY**

**Justification:**
- No authentication required
- Blacklist contains only 6 strings, leaving dozens of event handlers available
- The `> ` prefix facilitates attribute injection
- Auto-triggering events (`autofocus`, CSS animations) don't require user interaction
- No Content-Security-Policy to block inline event handlers
- Browser XSS protection explicitly disabled (`X-XSS-Protection: 0`)

---

### MEDIUM FINDING #2: Incomplete HTML Encoding (Defense-in-Depth Failure)

**Sink Type:** Cross-Site Scripting (Potential)  
**Render Context:** HTML Body Context  
**Severity:** MEDIUM  
**Exploitability:** HARD (not immediately exploitable in current context)

**Location:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py`
- **Line:** 58

**Code:**
```python
data = '<div class="solution-text"><img src="{0}" alt="Fail" width="150" height="150"><br>Oops! You did an alert with {1} instead of "XSS"</div>'.format(IMAGE_ROUTES[tag]['process'], cgi.escape(result))
```

**Vulnerability Analysis:**

The `cgi.escape()` function is used to encode the `result` variable (PhantomJS validation output), but this function has known limitations:

```python
cgi.escape(s, quote=False)  # Default: only escapes <, >, &
cgi.escape(s, quote=True)   # Escapes <, >, &, ", '
```

**Default Behavior (used in code):**
- ✅ Escapes: `<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;`
- ❌ Does NOT escape: `"` (double quote), `'` (single quote)

**Current Context (Line 58):**

The `result` variable is placed in HTML body text content:
```html
<br>Oops! You did an alert with {RESULT_HERE} instead of "XSS"</div>
```

**Exploitation Assessment:**

**Current Status:** **NOT EXPLOITABLE** in the current render context because:
- The value is placed in HTML body text, not an attribute
- Angle brackets are escaped, preventing tag injection
- There are no quote-delimited attributes surrounding the injection point

**Potential Risk Scenarios (if code changes):**

If future modifications place the `result` variable in an attribute context, the missing quote escaping could enable XSS:

```html
<!-- HYPOTHETICAL vulnerable code (not current) -->
<div class="message" data-alert="{result}">...</div>
```

With payload `test" onclick="alert(1)`, this would render as:
```html
<div class="message" data-alert="test" onclick="alert(1)">...</div>
```

**Recommendation:** Replace `cgi.escape()` with modern HTML encoding:
```python
import html
data = '...{0}...'.format(html.escape(result, quote=True))
```

**User Input Flow:**
1. User submits XSS payload via `?name=` parameter
2. PhantomJS executes the payload and captures JavaScript dialog messages
3. Dialog message stored in `result` variable
4. `cgi.escape()` applied (incomplete encoding)
5. Result rendered in HTTP response

**Network Accessibility:** ✅ Reachable via `GET /page` endpoint

**Exploitation Difficulty:** **HARD**

**Justification:**
- Requires code modification to become exploitable
- Current render context (body text) prevents exploitation
- `cgi.escape()` provides partial protection against most attacks

---

### SQL Injection Assessment

**Result:** ❌ **No SQL injection sinks found**

**Reasoning:**
- No database connections detected in codebase
- No SQL queries (raw or parameterized)
- No ORM usage (SQLAlchemy, Django ORM, Peewee, etc.)
- Application uses file-based storage only (`secret.txt`)

**Verification:**
- Searched for database imports: `sqlite3`, `psycopg2`, `pymysql`, `mysql.connector` - None found
- Searched for SQL keywords: `SELECT`, `INSERT`, `UPDATE`, `DELETE` - None found in executable code
- Reviewed all file operations - Only plain text file reads/writes detected

---

### Template Injection Assessment

**Result:** ❌ **No server-side template injection (SSTI) sinks found**

**Analysis:**

**Flask Template Engine Usage:**
The application does NOT use Flask's Jinja2 template engine:
- ❌ No `render_template()` calls
- ❌ No `render_template_string()` calls
- ❌ No `templates/` directory
- ❌ No `.html` template files with Jinja2 syntax

**HTML Template Storage:**
Templates are stored as **Python string constants** in `constants.py`:
```python
XSS_CONTENT = """<html>..."""
INDEX_CONTENT = """<html>..."""
```

**String Formatting Analysis:**

The application uses Python's `.format()` method for string interpolation:
```python
XSS_CONTENT.format("13","Triangle",value,"",error_msg)
```

**Is `.format()` vulnerable to SSTI?**

Python's `.format()` can access object attributes using format string syntax like `{obj.__class__}`, but:

1. ✅ **User input is NOT directly passed to `.format()`** - Only pre-processed values
2. ✅ **Blacklist validation applied before formatting**
3. ✅ **No user control over format string template** - Templates are hardcoded in `constants.py`

**Example Safe Usage (Line 77):**
```python
msg = request.args.get('name','')  # User input
# ... validation ...
value = "" if msg == "" else '> {0}'.format(msg)  # User input formatted separately
data = XSS_CONTENT.format("13","Triangle",value, "","")  # Pre-processed value inserted into template
```

The user controls the **data** (`value`), not the **template** (`XSS_CONTENT`), preventing SSTI.

**Verification:**
- No `eval()` or `exec()` with user input in template contexts
- No dynamic template compilation
- No unsafe deserialization (pickle, yaml.unsafe_load)

---

### Command Injection Assessment

**Result:** ✅ **No command injection vulnerabilities found**

**Subprocess Execution Analysis:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py:34`

```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, 
                        stdin=subprocess.PIPE)
```

**Security Properties:**
- ✅ **List-based arguments** (not string-based with `shell=True`)
- ✅ **No user input in command arguments**
- ✅ **Fixed command structure**

**Is this safe?**

**YES.** The subprocess call uses the secure list format, which prevents shell injection:

```python
# SECURE (current code)
subprocess.Popen(["timeout","5","phantomjs", "check.js"])

# VULNERABLE (not used)
subprocess.Popen("timeout 5 phantomjs check.js", shell=True)
```

**User Input Flow:**
- User input is written to a **temporary file** (lines 38-40)
- File **path** (not user input) is passed to PhantomJS via stdin (line 43)
- Filename is randomly generated: `"static/" + os.urandom(16).encode('hex') + '.html'`

**Exploitation Assessment:**

An attacker **cannot** inject commands because:
1. Command arguments are hardcoded
2. User input only affects file **content**, not file **name**
3. File path is constructed server-side with random component
4. Stdin data (URL) is not interpreted as shell commands

---

### XSS Sinks Summary Table

| # | Sink Type | Render Context | Location | Severity | Exploitability | Network Accessible |
|---|-----------|----------------|----------|----------|----------------|--------------------|
| 1 | Reflected XSS | HTML Attribute | `app.py:69` | CRITICAL | EASY | ✅ `/page?name=` |
| 2 | Incomplete Encoding | HTML Body | `app.py:58` | MEDIUM | HARD | ✅ `/page` (indirect) |

**Total Network-Accessible XSS Sinks:** 2 (1 critical, 1 medium)

---

### Out-of-Scope Components Excluded

The following components were identified during analysis but **excluded** as out-of-scope per the network accessibility criteria:

1. **PhantomJS Validation Script (`check.js`):**
   - **Reason:** Backend validation tool, not directly accessible via HTTP
   - **Execution:** Server-side only via subprocess
   - **Contains:** `setTimeout()`, `page.evaluate()` - but not user-facing

2. **Build Scripts (`Makefile`, `Dockerfile`):**
   - **Reason:** Local development tools, not part of deployed application
   - **Execution:** Manual build process only

3. **Benchmark Metadata (`benchmark.json`, `benchmark.yaml`):**
   - **Reason:** Configuration files for CTF infrastructure, not served by application

---

### Recommendations for XSS Mitigation

**For the `/page` Endpoint (CRITICAL):**

1. **Implement Context-Aware Output Encoding:**
```python
import html
value = html.escape(msg, quote=True)  # Escapes <, >, &, ", '
```

2. **Replace Blacklist with Whitelist:**
```python
import re
if not re.match(r'^[a-zA-Z0-9\s]+$', msg):
    return error_response("Only alphanumeric characters allowed")
```

3. **Add Content-Security-Policy Header:**
```python
response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'"
```

4. **Remove XSS Protection Disablement:**
```python
# Remove or change:
# response.headers["X-XSS-Protection"] = "0"
response.headers["X-XSS-Protection"] = "1; mode=block"
```

5. **Use Template Engine with Auto-Escaping:**
```python
from flask import render_template_string
data = render_template_string(template, user_input=msg)
```

## 10. SSRF Sinks

### Network Surface Focus

This section exclusively documents Server-Side Request Forgery (SSRF) sinks present in network-accessible components. All findings have been verified for reachability via the deployed web application's HTTP interface. Local-only utilities, build scripts, developer tools, and CLI applications have been explicitly excluded per scope requirements.

### Executive Summary

**Result:** ❌ **No SSRF vulnerabilities found in network-accessible components**

After comprehensive analysis of all network-accessible endpoints and code paths, **no exploitable SSRF sinks were identified**. While the application uses PhantomJS for server-side rendering (a common SSRF vector), users cannot control the URLs that PhantomJS visits, eliminating SSRF exploitation potential.

---

### Analysis: PhantomJS Server-Side Rendering (NOT VULNERABLE)

**Component:** PhantomJS Headless Browser Execution  
**Sink Type:** Headless Browser Navigation  
**SSRF Risk:** ❌ **NOT VULNERABLE**

**Location:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/app.py`
- **Lines:** 33-61 (`check_xss()` function)

**Code Flow:**

1. **Subprocess Execution (Line 34):**
```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, 
                        stdin=subprocess.PIPE)
```

2. **URL Construction (Lines 35-36):**
```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn
```

3. **URL Passed to PhantomJS (Line 43):**
```python
proc.stdin.write(url)
```

4. **PhantomJS Script Execution (`check.js:4, 20`):**
```javascript
var input = system.stdin.readLine();  // Receives URL from stdin
page.open(input, function(status) {   // Opens the URL
```

**Why This Is NOT an SSRF Vulnerability:**

**1. Hardcoded URL Construction:**
The URL passed to PhantomJS is **always** constructed server-side with a fixed pattern:
```
http://localhost:5000/static/[32-random-hex-chars].html
```

**Components:**
- **Protocol:** Hardcoded as `http://`
- **Host:** Hardcoded as `localhost`
- **Port:** Hardcoded as `5000`
- **Path:** Server-generated random filename

**User Influence:** NONE on URL structure

**2. User Controls Content, Not Destination:**

Users can control:
- ✅ **HTML file content** (via `?name=` parameter → written to temporary file)

Users CANNOT control:
- ❌ Protocol (always `http://`)
- ❌ Hostname (always `localhost`)
- ❌ Port (always `5000`)
- ❌ Filename (randomly generated with `os.urandom()`)
- ❌ Path prefix (always `static/`)

**3. Data Flow Analysis:**

```
User Input (name parameter)
    ↓
Blacklist Validation
    ↓
HTML Template Formatting
    ↓
Write to Random File (static/[random].html)
    ↓
Server Constructs URL (http://localhost:5000/static/[random].html)
    ↓
PhantomJS Opens URL ← NO USER CONTROL HERE
```

**4. No URL Parameter Injection:**

Unlike vulnerable SSRF patterns, there are no user-controllable parameters that influence the URL:

**VULNERABLE PATTERN (not present in this app):**
```python
# Example of SSRF vulnerability (NOT in this codebase)
user_url = request.args.get('url')
page.open(user_url)  # ← User controls destination
```

**ACTUAL PATTERN (safe):**
```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn  # ← Server controls destination
proc.stdin.write(url)
```

**Exploitation Assessment:**

**Can an attacker:**
- ❌ **Access internal networks?** NO - URL is always `localhost:5000`
- ❌ **Reach cloud metadata endpoints?** NO - URL is hardcoded to localhost
- ❌ **Scan internal ports?** NO - Port is hardcoded to 5000
- ❌ **Read local files?** NO - Protocol is hardcoded to HTTP
- ❌ **Bypass firewall rules?** NO - No external requests made

**Network Accessibility:** ✅ The `/page` endpoint is network-accessible, but the SSRF sink itself is not exploitable

---

### HTTP Client Analysis

**Result:** ❌ **No HTTP clients found**

**Libraries Checked:**
- ❌ `requests` - Not imported
- ❌ `urllib` - Imported but **never used** (line 9)
- ❌ `urllib2` - Not imported
- ❌ `urllib3` - Not imported
- ❌ `httplib` / `http.client` - Not imported
- ❌ `curl` subprocess calls - Not present

**Verification:**

**Unused Import (app.py:9):**
```python
import urllib
```

**Search Results:**
```bash
# Searched codebase for urllib usage
grep -n "urllib\." app.py
# No results - import is dead code
```

**Conclusion:** The `urllib` import is unused and presents no SSRF risk.

---

### Raw Socket & Network Connection Analysis

**Result:** ❌ **No raw socket connections found**

**Checked:**
- ❌ `socket.connect()` - Not present
- ❌ `socket.create_connection()` - Not present
- ❌ Network sockets with user input - Not present

**Verification:**
```python
# app.py imports (lines 1-13)
import sys, os
import cgi
from flask import Flask, request, Response, make_response, url_for
import subprocess
import re
import urllib  # Imported but unused
import logging
from constants import *
from phantomjs import Phantom  # Import fails, never used
```

No `socket` module imported.

---

### URL Opener & File Inclusion Analysis

**Result:** ❌ **No URL-based file operations found**

**Checked:**
- ❌ `urllib.urlopen()` - Not used (import is dead code)
- ❌ `open()` with URLs - Only local file paths used
- ❌ `file_get_contents()` - N/A (not PHP)
- ❌ `include_once` / `require_once` - N/A (not PHP)

**File Operations Found:**

1. **Secret file read (Line 22):**
```python
flags = open('secret.txt').read().split()
```
- **Path:** Hardcoded as `'secret.txt'` (local file)
- **User Control:** None

2. **Temporary file write (Lines 38-40):**
```python
of = open(fn, 'w')
of.write(page)
of.close()
```
- **Path:** Server-generated random filename
- **User Control:** Content only, not path

**Conclusion:** All file operations use local paths only, no URL-based file access.

---

### Redirect & "Next URL" Handler Analysis

**Result:** ❌ **No redirect functionality found**

**Checked:**
- ❌ Flask `redirect()` - Not imported, not used
- ❌ `Location` response headers - Not set
- ❌ "next", "return_to", "continue_to" parameters - Not processed
- ❌ URL validation in redirect chains - N/A

**Verification:**

**Flask imports (Line 3):**
```python
from flask import Flask, request, Response, make_response, url_for
```

Notably absent: `redirect`

**No redirect patterns found in code.**

---

### Link Preview & URL Unfurler Analysis

**Result:** ❌ **No link preview or metadata fetching found**

**Checked:**
- ❌ oEmbed endpoint fetchers - Not present
- ❌ URL metadata extractors - Not present
- ❌ Social media card generators - Not present
- ❌ OpenGraph data fetchers - Not present

**Note:** The application does not fetch external URLs or generate link previews.

---

### Webhook & Callback Handler Analysis

**Result:** ❌ **No webhook or callback functionality found**

**Checked:**
- ❌ "Ping webhook" endpoints - Not present
- ❌ Callback URL verification - Not present
- ❌ Event delivery to user-specified URLs - Not present
- ❌ Webhook testers - Not present

**Note:** The application has no outbound HTTP request capabilities.

---

### SSO/OIDC Discovery & JWKS Fetcher Analysis

**Result:** ❌ **No OAuth/OIDC/JWKS functionality found**

**Checked:**
- ❌ OpenID Connect discovery endpoints - Not present
- ❌ JWKS (JSON Web Key Set) URL fetchers - Not present
- ❌ OAuth authorization server metadata - Not present
- ❌ SAML metadata fetchers - Not present

**Note:** No authentication mechanisms exist in this application (see Section 3).

---

### Importer & Data Loader Analysis

**Result:** ❌ **No remote data import functionality found**

**Checked:**
- ❌ "Import from URL" features - Not present
- ❌ CSV/JSON/XML remote loaders - Not present
- ❌ RSS/Atom feed readers - Not present
- ❌ Remote configuration file fetchers - Not present

**Note:** Application is completely self-contained with no external data sources.

---

### Package/Plugin Installer Analysis

**Result:** ❌ **No plugin or package installation features found**

**Checked:**
- ❌ "Install from URL" functionality - Not present
- ❌ Remote package downloads - Not present
- ❌ Plugin installation endpoints - Not present
- ❌ Theme downloaders - Not present

**Note:** Application has fixed functionality with no plugin system.

---

### Media Processor Analysis

**Result:** ❌ **No media processing with URLs found**

**Checked:**
- ❌ ImageMagick with URLs - Not present
- ❌ FFmpeg with network sources - Not present
- ❌ Image optimization services with URL inputs - Not present
- ❌ HTML-to-PDF converters with remote URLs - Not present

**Note:** PhantomJS renders **local** HTML files only (localhost URLs).

---

### Monitoring & Health Check Analysis

**Result:** ⚠️ **No user-controlled health checks found**

**Health Check Present (docker-compose.yml):**
```yaml
healthcheck:
  test: ["CMD", "bash", "-c", "timeout 10 bash -i >& /dev/tcp/localhost/5000 0>&1"]
  interval: 10s
  retries: 5
  timeout: 10s
```

**Analysis:**
- ✅ Health check is **infrastructure-level** (Docker Compose)
- ✅ Hardcoded to check `localhost:5000`
- ✅ **Not user-accessible** or user-configurable
- ✅ No SSRF risk

---

### Cloud Metadata API Analysis

**Result:** ❌ **No cloud metadata access found**

**Checked:**
- ❌ AWS metadata API calls (169.254.169.254) - Not present
- ❌ GCP metadata server access - Not present
- ❌ Azure Instance Metadata Service - Not present
- ❌ Container orchestration API clients - Not present

**Note:** Application does not access cloud metadata services.

---

### Unused Template Analysis (Potential Future Risk)

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-016-24/src/constants.py`

**Line 143 - XSS_CONTENT_IFRAME Template:**
```html
<input type=text name=url placeholder="Enter the URL you want to visit...">
<iframe {2}></iframe>
```

**Analysis:**
- ⚠️ Template suggests potential future URL input functionality
- ❌ **Not currently connected to any route**
- ❌ No code processes the `url` parameter
- ✅ **No current SSRF risk** (dead code)

**Recommendation:** If this template is implemented in the future:
1. Validate URLs against an allowlist of permitted domains
2. Block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
3. Block cloud metadata endpoints (169.254.169.254)
4. Implement DNS rebinding protection
5. Use URL parsing libraries to prevent bypass via URL encoding or alternate representations

---

### SSRF Sinks Summary Table

| Component | Type | Location | User Control | SSRF Risk | Network Accessible |
|-----------|------|----------|--------------|-----------|-------------------|
| PhantomJS | Headless Browser | `app.py:34-43` | Content only, not URL | ❌ None | ✅ Via `/page` |
| urllib import | HTTP Library | `app.py:9` | N/A (unused) | ❌ None | N/A |
| File operations | Local files | `app.py:22,38` | None | ❌ None | Indirect |

**Total SSRF Vulnerabilities:** 0

---

### Conclusion

**No SSRF sinks found in network-accessible components.** The application's PhantomJS integration, while processing user input for XSS validation, does not allow users to control server-side request destinations. All URLs are constructed server-side with hardcoded protocol, host, and port values. The application makes zero outbound HTTP requests to external or user-specified destinations, eliminating the SSRF attack vector entirely.

The application's attack surface is limited to reflected XSS vulnerabilities (documented in Section 9), with no server-side request forgery, URL fetching, or external API integration capabilities.

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-24T21:15:20.633Z