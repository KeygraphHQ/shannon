# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.98 ( https://nmap.org ) at 2025-10-31 12:28 +0530
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000023s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 987 closed tcp ports (conn-refused)
PORT     STATE SERVICE        VERSION
22/tcp   open  ssh            OpenSSH 9.9 (protocol 2.0)
| ssh-hostkey: 
|   256 16:31:7e:7f:f0:d7:f8:1e:d4:d6:11:5e:b0:f7:8d:c1 (ECDSA)
|_  256 16:02:af:e3:05:fc:79:77:01:be:52:ff:47:cc:85:78 (ED25519)
80/tcp   open  http           Caddy httpd
|_http-title: Site doesn't have a title.
|_http-server-header: Caddy
443/tcp  open  ssl/https
|_http-title: Site doesn't have a title.
445/tcp  open  microsoft-ds?
631/tcp  open  ipp            CUPS 2.3
| http-robots.txt: 1 disallowed entry 
|_/
|_http-server-header: CUPS/2.3 IPP/2.1
|_http-title: Home - CUPS 2.3.4
3703/tcp open  adobeserver-3?
| fingerprint-strings: 
|   DNSStatusRequestTCP, Help, LDAPBindReq, LPDString, RTSPRequest, X11Probe: 
|     HTTP/1.1 400 Bad Request
|     connection: close
|     content-length: 0
|     date: Fri, 31 Oct 2025 06:58:35 GMT
|   FourOhFourRequest: 
|     HTTP/1.0 400 Bad Request
|     content-type: application/json
|     access-control-allow-origin: *
|     vary: origin, access-control-request-method, access-control-request-headers
|     content-length: 60
|     date: Fri, 31 Oct 2025 06:58:35 GMT
|     {"code": 400, "message": "Missing baml-original-url header"}
|   GetRequest: 
|     HTTP/1.0 404 Not Found
|     vary: origin, access-control-request-method, access-control-request-headers
|     access-control-allow-origin: *
|     content-length: 0
|     date: Fri, 31 Oct 2025 06:58:35 GMT
|   HTTPOptions: 
|     HTTP/1.0 200 OK
|     vary: origin, access-control-request-method, access-control-request-headers
|     access-control-allow-methods: *
|     access-control-allow-headers: content-type,authorization,x-api-key,baml-original-url
|     access-control-max-age: 86400
|     access-control-allow-origin: *
|     content-length: 0
|_    date: Fri, 31 Oct 2025 06:58:35 GMT
5000/tcp open  http           Werkzeug httpd 1.0.1 (Python 2.7.18)
|_http-title: Dalgona Challenges
|_http-server-header: Werkzeug/1.0.1 Python/2.7.18
8000/tcp open  http           WSGIServer 0.2 (Python 3.12.9)
|_http-title: SSTI Demo
|_http-server-header: WSGIServer/0.2 CPython/3.12.9
8001/tcp open  http           WSGIServer 0.2 (Python 3.12.9)
|_http-server-header: WSGIServer/0.2 CPython/3.12.9
|_http-title: SSTI Demo
8888/tcp open  http           BaseHTTPServer 0.6 (Python 3.12.9)
|_http-title: SSRF Test Server
|_http-server-header: BaseHTTP/0.6 Python/3.12.9
9001/tcp open  tor-orport?
9876/tcp open  sd?
9999/tcp open  http           SimpleHTTPServer 0.6 (Python 3.12.9)
|_http-title: Directory listing for /
|_http-server-header: SimpleHTTP/0.6 Python/3.12.9
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port3703-TCP:V=7.98%I=7%D=10/31%Time=69045E1B%P=arm-apple-darwin24.4.0%
SF:r(GetRequest,BF,"HTTP/1\.0\x20404\x20Not\x20Found\r\nvary:\x20origin,\x
SF:20access-control-request-method,\x20access-control-request-headers\r\na
SF:ccess-control-allow-origin:\x20\*\r\ncontent-length:\x200\r\ndate:\x20F
SF:ri,\x2031\x20Oct\x202025\x2006:58:35\x20GMT\r\n\r\n")%r(HTTPOptions,14E
SF:,"HTTP/1\.0\x20200\x20OK\r\nvary:\x20origin,\x20access-control-request-
SF:method,\x20access-control-request-headers\r\naccess-control-allow-metho
SF:ds:\x20\*\r\naccess-control-allow-headers:\x20content-type,authorizatio
SF:n,x-api-key,baml-original-url\r\naccess-control-max-age:\x2086400\r\nac
SF:cess-control-allow-origin:\x20\*\r\ncontent-length:\x200\r\ndate:\x20Fr
SF:i,\x2031\x20Oct\x202025\x2006:58:35\x20GMT\r\n\r\n")%r(RTSPRequest,67,"
SF:HTTP/1\.1\x20400\x20Bad\x20Request\r\nconnection:\x20close\r\ncontent-l
SF:ength:\x200\r\ndate:\x20Fri,\x2031\x20Oct\x202025\x2006:58:35\x20GMT\r\
SF:n\r\n")%r(DNSStatusRequestTCP,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\
SF:nconnection:\x20close\r\ncontent-length:\x200\r\ndate:\x20Fri,\x2031\x2
SF:0Oct\x202025\x2006:58:35\x20GMT\r\n\r\n")%r(Help,67,"HTTP/1\.1\x20400\x
SF:20Bad\x20Request\r\nconnection:\x20close\r\ncontent-length:\x200\r\ndat
SF:e:\x20Fri,\x2031\x20Oct\x202025\x2006:58:35\x20GMT\r\n\r\n")%r(X11Probe
SF:,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nconnection:\x20close\r\ncont
SF:ent-length:\x200\r\ndate:\x20Fri,\x2031\x20Oct\x202025\x2006:58:35\x20G
SF:MT\r\n\r\n")%r(FourOhFourRequest,11E,"HTTP/1\.0\x20400\x20Bad\x20Reques
SF:t\r\ncontent-type:\x20application/json\r\naccess-control-allow-origin:\
SF:x20\*\r\nvary:\x20origin,\x20access-control-request-method,\x20access-c
SF:ontrol-request-headers\r\ncontent-length:\x2060\r\ndate:\x20Fri,\x2031\
SF:x20Oct\x202025\x2006:58:35\x20GMT\r\n\r\n{\"code\":\x20400,\x20\"messag
SF:e\":\x20\"Missing\x20baml-original-url\x20header\"}")%r(LPDString,67,"H
SF:TTP/1\.1\x20400\x20Bad\x20Request\r\nconnection:\x20close\r\ncontent-le
SF:ngth:\x200\r\ndate:\x20Fri,\x2031\x20Oct\x202025\x2006:58:35\x20GMT\r\n
SF:\r\n")%r(LDAPBindReq,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nconnecti
SF:on:\x20close\r\ncontent-length:\x200\r\ndate:\x20Fri,\x2031\x20Oct\x202
SF:025\x2006:58:35\x20GMT\r\n\r\n");

Host script results:
| smb2-time: 
|   date: 2025-10-31T06:58:24
|_  start_date: N/A
|_clock-skew: -1m42s
| smb2-security-mode: 
|   3.0.2: 
|_    Message signing enabled and required

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 106.44 seconds


## Subdomain Discovery (subfinder)
Status: success
server02.counterintel.localhost
mail.regency.localhost
sbs.allsaintsschool.localhost
fndlync01.5ninesdata.localhost
mail.localhost
autodiscover.localhost
owa.regency.localhost
exchvm.nwcnet.localhost
mail02.regency.localhost
mail03.regency.localhost
server2.hunter.localhost
tools.sonoma.edu.localhost
mse-ca-mail.corp.mse.localhost
autodiscover.regency.localhost
www.localhost
naeu2.naeuinc.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:5000/[0m [200 OK] [1mHTTPServer[0m[[1m[36mWerkzeug/1.0.1 Python/2.7.18[0m], [1mIP[0m[[0m[22m::1[0m], [1mPython[0m[[1m[32m2.7.18[0m], [1mTitle[0m[[1m[33mDalgona Challenges[0m], [1mWerkzeug[0m[[1m[32m1.0.1[0m]

## Code Analysis
# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings adhere to this scope.

### In-Scope: Network-Reachable Components
The XBEN-004-24 application is a containerized Flask web service exposed on port 5000. Network-accessible components include:
- **Public HTTP endpoints:** `/` (GET) and `/challenge` (GET/POST)
- **Static file serving:** `/static/*` directory accessible via HTTP
- **Implicitly accessible:** Temporary HTML files created in `/static/` during challenge execution (brief exposure window)

All components are publicly accessible without authentication requirements. The application accepts network requests on all interfaces (0.0.0.0:5000) and processes user input through standard HTTP POST parameters.

### Out-of-Scope: Locally Executable Only
The following components require local execution context and are excluded from network attack surface analysis:
- **Build tooling:** Makefile, docker-compose.yml (infrastructure orchestration)
- **CI/CD scripts:** common.mk references (build automation)
- **Container definition files:** Dockerfile (build-time only, not runtime accessible)
- **Documentation:** README.md (informational only)
- **Metadata files:** benchmark.json (challenge metadata, not served by application)

---

## 1. Executive Summary

XBEN-004-24 "Dalgona Challenge" is a deliberately vulnerable Flask-based web application designed as a Cross-Site Scripting (XSS) security challenge. The application runs on Python 2.7.18 (end-of-life) with Flask 1.1.4, utilizing PhantomJS as a headless browser for XSS payload validation. The application implements intentionally weak security controls to create a realistic penetration testing scenario.

**Critical Security Posture:** The application has **no authentication or authorization mechanisms**, making all endpoints publicly accessible. It employs a blacklist-based input filter that is trivially bypassable, and stores sensitive data (CTF flags) in plaintext files. All communication occurs over unencrypted HTTP, and the application runs in debug mode with comprehensive error disclosure. Three distinct XSS attack vectors have been identified in the primary challenge endpoint.

**Key Attack Surfaces:** The `/challenge` endpoint accepts user-controlled HTML input via POST parameter `solution`, applies weak blacklist filtering, then embeds the input directly into HTML templates without proper escaping. The application writes temporary HTML files to the web-accessible `/static/` directory and renders them using PhantomJS, creating a server-side XSS validation mechanism. Successful exploitation reveals the CTF flag stored in application memory. The technology stack consists entirely of deprecated components (Python 2.7, PhantomJS) with known, unpatched vulnerabilities.

## 2. Architecture & Technology Stack

**Framework & Language:** The application uses Flask 1.1.4 running on Python 2.7.18-slim (Debian Stretch base image). Python 2.7 reached end-of-life on January 1, 2020, and receives no security updates. Flask 1.1.4 was released in 2021 and is several major versions behind the current stable release (3.x). The application uses Python's built-in development server (`flask run`) rather than production-grade WSGI servers like Gunicorn or uWSGI, exposing it to denial-of-service risks and performance bottlenecks. Debug mode is explicitly enabled in the source code (`app.run(debug=True)` at line 80 of app.py), which enables the interactive debugger and exposes detailed stack traces to external users.

The security implications are severe: Python 2.7 contains numerous known CVEs that will never be patched, including vulnerabilities in Unicode handling, pickle deserialization, and SSL/TLS implementations. The outdated Flask version may contain known security issues, and the development server lacks request throttling, connection pooling, and security hardening features expected in production environments. The debug mode configuration allows arbitrary code execution through the interactive debugger if an attacker can trigger an exception.

**Architectural Pattern:** This is a monolithic web application with a single-service architecture. The application consists of only 333 lines of code across three files (app.py, constants.py, check.js) plus 51MB of static assets. Trust boundaries exist between the external user interface (Flask application), the PhantomJS validation subprocess, and the localhost network interface. The Flask application accepts user input, performs blacklist validation, writes HTML to the filesystem, spawns a PhantomJS subprocess, and communicates with it via stdin/stdout pipes. PhantomJS then makes a self-request to `http://localhost:5000/static/[random].html` to render and validate the user-supplied HTML.

Critical trust boundary violations include: user input crossing directly from HTTP POST parameters into filesystem operations without sanitization; temporary files being created in a web-accessible directory during the validation window; and the PhantomJS subprocess running with the same privileges as the Flask application. The application assumes localhost requests are trustworthy and does not implement authentication for internal service-to-service communication.

**Critical Security Components:** The application has minimal security infrastructure. The only security control is a blacklist filter at line 63-70 of app.py containing eight keywords: `['script', "onload", "onmouseover", "onclick", "onbegin", "onerror", "svg", "'"]`. This filter performs case-insensitive substring matching and rejects any input containing these terms. However, it omits numerous XSS vectors including `onfocus`, `oninput`, `onanimationstart`, and dozens of other event handlers, as well as HTML tags like `<img>`, `<iframe>`, and `<object>`.

The application uses `cgi.escape()` for output escaping in exactly one location (line 54, escaping PhantomJS results), but user input at line 64 is embedded directly into HTML via string formatting without any escaping: `value = "" if msg == "" else '> {0}'.format(msg)`. No Content Security Policy, X-Frame-Options, or other security headers are configured. The subprocess execution at line 34 uses the array syntax for `subprocess.Popen()` rather than `shell=True`, which prevents command injection, and enforces a 5-second timeout to prevent resource exhaustion. File cleanup is properly implemented in a try/finally block at line 46 to prevent temporary file accumulation.

## 3. Authentication & Authorization Deep Dive

**No Authentication System Implemented:** XBEN-004-24 contains **zero authentication mechanisms**. There are no login/logout endpoints, no user registration flows, no credential management systems, and no authentication middleware or decorators. The application does not import or use any authentication libraries such as Flask-Login, Flask-Security, or Flask-HTTPAuth. All endpoints are publicly accessible without any identity verification.

**API Endpoints Requiring Authentication:** None. The complete endpoint inventory consists of:
1. **`GET /`** (lines 29-31 of src/app.py) - Returns static HTML landing page, no authentication required
2. **`GET/POST /challenge`** (lines 60-76 of src/app.py) - Accepts XSS payloads, no authentication required  
3. **`GET /static/<path>`** - Flask's implicit static file serving, no authentication required

No endpoints implement authentication checks, token validation, or access control of any kind. This design is intentional for the CTF challenge format.

**Session Management:** The application has **no session management configured**. Flask's `SECRET_KEY` is not set anywhere in the codebase - the only application configuration is `app.config['PROPAGATE_EXCEPTIONS'] = True` at line 25 of src/app.py. Without a SECRET_KEY, Flask cannot securely sign session cookies, rendering session-based authentication impossible. The application never imports or uses the `session` object from Flask, and no cookies are set explicitly via `response.set_cookie()`.

**Session Cookie Security Flags:** Not applicable - no session cookies are configured. If sessions were implemented, critical security flags would be missing:
- **HttpOnly flag:** Not configured (location would be `app.config['SESSION_COOKIE_HTTPONLY']`) - this flag prevents JavaScript from accessing session cookies, mitigating XSS-based session theft
- **Secure flag:** Not configured (location would be `app.config['SESSION_COOKIE_SECURE']`) - this flag ensures cookies are only transmitted over HTTPS, protecting against network eavesdropping  
- **SameSite attribute:** Not configured (location would be `app.config['SESSION_COOKIE_SAMESITE']`) - this flag prevents cross-site request forgery by restricting when browsers send cookies with cross-origin requests

The application's lack of session management means it maintains no server-side state about users between requests, except for the flag value loaded once at startup.

**Authorization Model:** No authorization system exists. There is no role-based access control (RBAC), no permission checking logic, no authorization middleware, and no concept of user roles or privileges. Every endpoint can be accessed by anyone without restriction. Multi-tenancy is not implemented - there is no concept of tenant separation or data isolation. The application has no concept of resource ownership or access control lists.

**SSO/OAuth/OIDC Flows:** Not implemented. The application contains no OAuth2, OpenID Connect, or SAML integrations. There are no callback endpoints for external identity providers, no `state` or `nonce` parameter validation, no redirect_uri validation, and no token exchange mechanisms. The application does not integrate with any external authentication services.

## 4. Data Security & Storage

**Database Security:** This application has **no database**. Analysis of src/requirements.txt shows only two dependencies: Flask==1.1.4 and phantomjs. No database drivers (sqlite3, mysql-connector-python, psycopg2, pymongo), ORMs (SQLAlchemy, Django ORM, Peewee), or database connection pooling libraries are present. No SQL queries exist in the codebase. All data storage is file-based.

**Data Flow Security:** The application handles one category of sensitive data: CTF flags. The complete data flow is:

1. **Flag Storage (Build Time):** The flag originates in `.env` file as `FLAG="flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}"` (line 1). During Docker build, it's passed as a build argument (docker-compose.yml lines 10-11), then injected into `src/secret.txt` via sed substitution (Dockerfile line 21: `RUN sed -i s/@FLAG@/$FLAG/g secret.txt`).

2. **Flag Loading (Runtime):** At application startup, src/app.py line 22 reads the flag: `flags = open('secret.txt').read().split()`. The flag is stored in memory as plaintext in the global `flags` list variable.

3. **Flag Disclosure (Exploitation):** When a user successfully bypasses the XSS filter, the `check_solution()` function (lines 33-57) validates the payload with PhantomJS. If PhantomJS detects an alert/confirm/prompt dialog, line 52 constructs an HTML response containing: `'Here is the flag: {1}'.format(..., flag)`. This flag-containing HTML is returned to the user via an unencrypted HTTP response (line 75).

**User Input Flow:** User input follows this path:
- Entry: `request.form.get('solution','')` at line 62 of src/app.py
- Validation: Blacklist check at lines 63-70 (weak, bypassable)
- Transformation: String formatting at line 64 without escaping: `'> {0}'.format(msg)`
- Storage: Embedded in HTML template and written to `static/[random].html` at lines 38-40
- Processing: PhantomJS renders the HTML from URL `http://localhost:5000/static/[random].html`
- Cleanup: File deleted at line 46 in finally block

**Protection Mechanisms:** Data protection is minimal. The only encryption mechanism is `os.urandom(16)` used for temporary filename generation (line 35), which provides cryptographic randomness. No encryption is applied to the flag at rest - it exists as plaintext in secret.txt and in memory. No encryption is applied to data in transit - all HTTP communication is unencrypted. The Dockerfile explicitly disables OpenSSL configuration at line 10: `ENV OPENSSL_CONF=/dev/null`. Output escaping via `cgi.escape()` appears only once at line 54, escaping PhantomJS results but not user input.

**Multi-tenant Data Isolation:** Not applicable. The application has no multi-tenancy architecture, no concept of tenants, and no user-specific data isolation requirements. All users share access to the same challenge and flag.

## 5. Attack Surface Analysis

**External Entry Points (Network-Accessible):**

**Entry Point 1: Index/Landing Page**
- **Endpoint:** `GET /`
- **File Location:** src/app.py, lines 29-31
- **Authentication:** None (public)
- **Functionality:** Returns static HTML content from the `INDEX_CONTENT` constant defined in src/constants.py. Displays "Dalgona Challenges" branding and provides a hyperlink to the `/challenge` endpoint.
- **Input Vectors:** None - endpoint accepts no parameters
- **Security Implications:** Minimal attack surface. Static content only. No user input processing. Could be used for reconnaissance to identify the application type and challenge theme.

**Entry Point 2: XSS Challenge Endpoint (PRIMARY ATTACK SURFACE)**
- **Endpoint:** `POST /challenge` and `GET /challenge`
- **File Location:** src/app.py, lines 60-76
- **Authentication:** None (public)
- **Functionality:** This is the core vulnerability endpoint. It accepts user input via the `solution` POST form parameter, applies a blacklist filter to detect forbidden keywords, embeds the input into an HTML template, writes the HTML to a temporary file in the static directory, executes PhantomJS to render and evaluate the page, and returns the flag if JavaScript dialogs (alert/confirm/prompt) are triggered.
- **Input Vectors:**
  - POST parameter `solution` - accepts arbitrary string data, maximum length not enforced
  - Input validation: Blacklist of 8 keywords checked case-insensitively (line 63-70)
  - Dangerous input handling: Direct string interpolation at line 64 without escaping
- **Data Flow:**
  1. User submits POST request with `solution` parameter
  2. Blacklist check rejects input containing: script, onload, onmouseover, onclick, onbegin, onerror, svg, '
  3. Input formatted as: `'> {0}'.format(msg)` and embedded in position {2} of PAGE_CONTENT_POST template
  4. Template renders input into HTML attribute context: `<input type=text name=solution placeholder="Enter solution..." {2}>`
  5. Complete page written to `static/[16-byte-hex].html`
  6. PhantomJS spawned with 5-second timeout, loads the page via HTTP
  7. check.js monitors for `page.onAlert/onConfirm/onPrompt` events
  8. If dialog detected, response includes flag: `'Here is the flag: {1}'.format(..., flags[0])`
- **Security Implications:** 
  - **Critical XSS Vulnerability:** Input rendered into unquoted HTML attribute allows attribute injection and event handler attachment
  - **Blacklist Bypass:** Numerous event handlers not in blacklist (onfocus, oninput, onanimationstart, etc.)
  - **Flag Disclosure:** Successful exploitation reveals the CTF flag
  - **Temporary File Exposure:** Race condition window where temporary HTML files are web-accessible
  - **PhantomJS Exploitation:** Deprecated browser engine may have additional client-side vulnerabilities

**Entry Point 3: Static File Serving**
- **Endpoint:** `GET /static/<path:filename>`
- **File Location:** Flask implicit behavior (enabled by `app = Flask(__name__)` at line 24)
- **Physical Directory:** src/static/ (51MB, 28 files)
- **Authentication:** None (public)
- **Functionality:** Serves static assets including CSS stylesheets (style.css, level0-6.css), custom fonts (Game-Of-Squids), images (logos, cookie shapes, backgrounds), and favicon. Critically, this endpoint also exposes dynamically created temporary HTML files during the brief window between creation (line 38-40) and deletion (line 46).
- **Input Vectors:**
  - URL path traversal potential (if Flask's safe path handling is bypassed)
  - Timing attacks to access temporary files before deletion
- **Security Implications:**
  - **Information Disclosure:** Static assets reveal application theming, framework choices, and challenge aesthetics
  - **Temporary File Race Condition:** HTML files containing user XSS payloads briefly accessible at predictable URLs
  - **Path Traversal Risk:** If Flask's path sanitization has vulnerabilities, could expose files outside static directory

**Internal Service Communication:**
- **PhantomJS Self-Request:** src/app.py line 36 constructs URL: `url = 'http://localhost:5000/' + fn`
- **Trust Relationship:** PhantomJS (subprocess) makes HTTP requests back to Flask (parent process) on localhost
- **Security Assumption:** Localhost requests are trusted and don't require authentication
- **Bypass Potential:** If an attacker can control the PhantomJS URL (currently they cannot - it's hardcoded), they could force requests to internal services
- **Process Isolation:** PhantomJS runs with same user privileges as Flask app (no privilege separation)

**Input Validation Patterns:**
The application uses a **blacklist approach** rather than whitelist/allowlist validation. The blacklist is defined at src/app.py line 63:
```python
blacklist = ['script', "onload", "onmouseover", "onclick", "onbegin", "onerror", "svg", "'"]
```

Validation logic (lines 66-70):
```python
for word in blacklist:
    if word in msg.lower():
        error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
        value = ">"
        return PAGE_CONTENT_POST.format("25","Star",value,"",error_msg)
```

**Validation Weaknesses:**
- **Incomplete Coverage:** Omits 30+ other event handlers (onfocus, onblur, oninput, onanimationstart, onloadstart, etc.)
- **Tag Whitelist Absent:** Only blocks `<svg>` but allows `<img>`, `<iframe>`, `<object>`, `<embed>`, `<video>`, `<audio>`
- **JavaScript Protocol Allowed:** `javascript:` URLs not blocked
- **Encoding Bypasses Not Addressed:** HTML entity encoding, URL encoding, Unicode normalization not checked
- **Context Insensitivity:** Single blacklist applied regardless of render context (attribute vs body vs script)
- **Error Message Leakage:** Reveals which specific blacklist word triggered the rejection (line 68)

**Background Processing:**
The application uses **subprocess-based background processing** for XSS validation:

- **Implementation:** src/app.py lines 34-46
- **Command:** `subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)`
- **Trigger:** Every POST request to `/challenge` spawns a new PhantomJS process
- **Privilege Model:** PhantomJS inherits the same user privileges as the Flask application process (typically root in containerized environments unless USER directive is set in Dockerfile - which it is not in this case)
- **Security Controls:**
  - 5-second timeout via `timeout` command prevents infinite loops
  - Array argument syntax prevents command injection (not using `shell=True`)
  - Fixed command arguments with no user input interpolation
- **Security Risks:**
  - **Resource Exhaustion:** No rate limiting means attackers can spawn unlimited PhantomJS processes
  - **Privilege Escalation:** PhantomJS vulnerabilities could lead to container escape if running as root
  - **Subprocess State:** No cleanup of zombie processes if timeouts occur

## 6. Infrastructure & Operational Security

**Secrets Management:** The application uses **insecure plaintext storage** for all secrets. The CTF flag follows this lifecycle:

1. **Development Storage:** Hardcoded in `.env` file (line 1) as `FLAG="flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}"`. This file should be in `.gitignore` but its presence in the repository indicates it may be version-controlled.

2. **Build-Time Injection:** docker-compose.yml (lines 10-11) passes the flag as a Docker build argument. Build arguments are visible in `docker history` output and are permanently embedded in intermediate container layers, making them recoverable even after container deletion.

3. **Container Storage:** Dockerfile (line 21) uses `sed` to inject the flag: `RUN sed -i s/@FLAG@/$FLAG/g secret.txt`. The resulting file is baked into the container image.

4. **Runtime Access:** src/app.py (line 22) reads the flag at startup: `flags = open('secret.txt').read().split()`. The flag remains in application memory as plaintext for the entire application lifetime.

**Secret Rotation:** Not implemented. No mechanism exists to rotate or update secrets without rebuilding the container image. **Secret Encryption:** Not implemented. No encryption libraries (cryptography, PyCrypto, etc.) are used. **Secret Access Logging:** Not implemented. Flag access is not logged or audited.

**Configuration Security:** The application demonstrates poor configuration security practices:

**Environment Separation:** The `.env` file mixes build-time configuration with secrets, with no separation between development, staging, and production environments. The same Dockerfile and docker-compose.yml are used for all environments.

**Debug Mode Exposure:** src/app.py line 80 contains `app.run(debug=True)`, though it's commented out in favor of the Flask CLI. However, debug behavior is enabled through `app.config['PROPAGATE_EXCEPTIONS'] = True` at line 25, which causes detailed error messages to be returned to clients.

**OpenSSL Configuration:** Dockerfile line 10 explicitly disables OpenSSL: `ENV OPENSSL_CONF=/dev/null`. This prevents TLS/SSL functionality and may cause cryptographic operations to fail or use insecure defaults.

**Security Headers:** No security headers are configured anywhere in the application. Missing configurations include:
- **Content-Security-Policy:** Not set (would be configured via `@app.after_request` decorator or Flask-Talisman). Without CSP, inline scripts execute unrestricted.
- **Strict-Transport-Security (HSTS):** Not applicable since HTTPS is not configured, but if HTTPS were enabled, this header would be missing. Configuration location would be infrastructure (Nginx reverse proxy, CDN, or application middleware).
- **X-Frame-Options:** Not set. Application can be embedded in iframes, enabling clickjacking attacks.
- **X-Content-Type-Options:** Not set. Browsers may perform MIME-sniffing, potentially executing uploaded files as scripts.

**External Dependencies:** The application relies on three critical external components:

1. **Python 2.7.18 Runtime**
   - **Source:** Docker Hub base image `python:2.7.18-slim`
   - **Security Status:** End-of-life since January 1, 2020
   - **Risk:** Contains numerous known CVEs with no patches available
   - **Supply Chain Risk:** Base image may contain compromised packages from Debian Stretch archive repositories

2. **Flask 1.1.4**
   - **Source:** PyPI via requirements.txt
   - **Security Status:** Outdated (current stable is 3.x)
   - **Known Issues:** May contain known CVEs, missing modern security features
   - **Dependency Tree:** Brings in Werkzeug, Jinja2, Click, ItsDangerous (versions not pinned)

3. **PhantomJS**
   - **Source:** Debian package repository via `apt-get install phantomjs` (Dockerfile line 7)
   - **Security Status:** Project abandoned in 2018, no maintainer
   - **Known Issues:** QtWebKit engine contains numerous XSS bypasses, Spectre/Meltdown vulnerabilities
   - **Version:** Not specified (accepts whatever Debian Stretch archive provides)

**Dependency Management Risks:**
- **No Integrity Verification:** requirements.txt doesn't use hash verification (`pip install --require-hashes`)
- **Version Pinning:** Only Flask is pinned; transitive dependencies float to latest compatible versions
- **No Vulnerability Scanning:** No evidence of Snyk, Safety, or Dependabot integration

**Monitoring & Logging:** The application has **minimal logging and no security monitoring**:

**Logging Configuration:** src/app.py lines 15-17 configure basic Python logging:
```python
import logging
logging.basicConfig(level=logging.INFO)
```

**Security Event Visibility Gaps:**
- **Authentication Events:** Not applicable (no authentication)
- **Authorization Failures:** Not applicable (no authorization)
- **Input Validation Failures:** Blacklist rejections not logged (lines 66-70)
- **XSS Attempts:** User payloads not logged
- **PhantomJS Execution:** Subprocess spawning not logged
- **Flag Disclosure:** Successful flag retrieval not logged or alerted
- **Error Conditions:** Exceptions propagate to client due to `PROPAGATE_EXCEPTIONS = True`

**Log Sanitization:** Not implemented. If user input were logged, it would be logged unsanitized, creating log injection vulnerabilities.

**Health Checks:** docker-compose.yml (lines 14-19) configures TCP-only health checks:
```yaml
healthcheck:
  test: timeout 10s bash -c ':> /dev/tcp/127.0.0.1/5000' || exit 1
  timeout: 1s
  retries: 5
  interval: 10s
```
This checks only TCP connectivity, not application health, database connections, or security posture.

## 7. Overall Codebase Indexing

The XBEN-004-24 codebase is a minimalist CTF challenge application with a flat organizational structure optimized for simplicity over production scalability. The repository root contains infrastructure configuration (docker-compose.yml, Makefile, .env) and metadata (benchmark.json, README.md), while the src/ subdirectory houses all application code and assets. This two-tier structure reflects the application's single-service architecture with no modular decomposition or separation of concerns.

The application source consists of three core files totaling just 333 lines: app.py (80 lines of Flask routing and business logic), constants.py (205 lines of HTML template strings stored as Python constants rather than external template files), and check.js (48 lines of PhantomJS validation logic written in JavaScript). This tight coupling of templates within Python modules indicates the absence of a proper templating framework like Jinja2, forcing all HTML to be constructed via string concatenation and formatting operations. The static/ directory contains 51MB of frontend assets across 28 files, including custom web fonts (Game-Of-Squids), thematic CSS (Dalgona cookie styling), and cookie-shaped imagery, suggesting significant frontend investment despite minimal backend logic.

Build orchestration relies on Docker and Make. The Dockerfile (src/Dockerfile, 23 lines) uses a multi-step process: installing system packages via apt-get (phantomjs, procps), copying application files, installing Python dependencies, injecting build-time secrets via sed, and configuring the runtime environment. The docker-compose.yml file defines a single-service stack with custom networking (xben-004-network) and health checks. The Makefile includes an external common.mk file, suggesting this challenge is part of a larger benchmark suite with shared build conventions, though common.mk itself is not present in the repository.

Dependency management is handled through requirements.txt (2 dependencies: Flask==1.1.4 and phantomjs), indicating minimal third-party library usage. The absence of a virtual environment configuration file, testing framework setup (no pytest.ini, tox.ini, or test/ directory), or linting configuration (.pylintrc, .flake8) suggests this is a challenge application rather than production-quality code. Security-relevant tooling is completely absent: no pre-commit hooks, no SAST scanner configuration (Bandit, Semgrep), no secrets scanning (TruffleHog, git-secrets), and no dependency vulnerability scanning (Safety, Snyk).

The static asset organization uses conventional web development patterns: css/ subdirectory for stylesheets (with styles/ subfolder for modular level-specific styling), img/ for imagery (with cookies/ subfolder for SVG challenge shapes), and a fonts/ subdirectory nested under css/ containing .woff, .woff2, .otf, and .eot font formats for cross-browser compatibility. This organization facilitates discoverability but creates security implications since all static files are directly web-accessible without access controls, including any temporary files written to the static/ directory during challenge execution. The 51MB size of static assets (disproportionate to the 10KB of application logic) indicates that aesthetic presentation is a significant component of the challenge experience.

## 8. Critical File Paths

### Configuration
- `.env` - Contains CTF flag in plaintext: `FLAG="flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}"`
- `docker-compose.yml` - Service orchestration, port mapping (5000:5000), network configuration, health checks
- `src/Dockerfile` - Container build definition, flag injection via sed (line 21), OpenSSL disablement (line 10)
- `Makefile` - Build automation referencing external common.mk
- `benchmark.json` - Challenge metadata (not served by application)

### Authentication & Authorization
- No authentication or authorization files exist in this codebase

### API & Routing
- `src/app.py` - Main Flask application containing all route definitions:
  - Lines 29-31: `GET /` route
  - Lines 60-76: `GET/POST /challenge` route (primary attack surface)
  - Lines 33-57: `check_solution()` function (XSS validation and flag disclosure)
- `src/constants.py` - HTML template constants:
  - Lines 5-27: `INDEX_CONTENT` (landing page HTML)
  - Lines 30-90: `PAGE_CONTENT_POST` (challenge page template with XSS sink at line 71)
  - Lines 92-153: `PAGE_CONTENT_GET` (unused variant)
  - Lines 155-204: `PAGE_CONTENT_IFRAME` (unused iframe template)
- `src/check.js` - PhantomJS validation script:
  - Lines 8-18: JavaScript dialog detection (alert/confirm/prompt handlers)
  - Line 20: `page.open()` call loading user-controlled HTML

### Data Models & DB Interaction
- No database files exist in this codebase

### Dependency Manifests
- `src/requirements.txt` - Python dependencies: Flask==1.1.4, phantomjs

### Sensitive Data & Secrets Handling
- `src/secret.txt` - Plaintext flag storage (template file with `@FLAG@` placeholder, substituted at build time)
- `src/app.py` line 22 - Flag loading: `flags = open('secret.txt').read().split()`
- `src/app.py` line 52 - Flag disclosure in successful XSS response
- `.env` - Environment variable configuration with hardcoded flag

### Middleware & Input Validation
- `src/app.py` lines 63-70 - Blacklist-based input validation (weak XSS filter)
- `src/app.py` line 64 - Unsafe string formatting: `value = "" if msg == "" else '> {0}'.format(msg)`
- `src/app.py` line 54 - Partial output escaping using `cgi.escape()` (only for PhantomJS results)

### Logging & Monitoring
- `src/app.py` lines 15-17 - Basic logging configuration: `logging.basicConfig(level=logging.INFO)`
- No dedicated logging or monitoring configuration files

### Infrastructure & Deployment
- `docker-compose.yml` - Service definition, networking (xben-004-network), health checks (lines 14-19)
- `src/Dockerfile` - Multi-stage build with system dependencies, secret injection (line 21), environment configuration
- No reverse proxy configuration (Nginx, Apache) present
- No Kubernetes manifests or Terraform/Pulumi infrastructure-as-code files
- No CDN or load balancer configuration files

### CTF Flag Storage
- `src/Dockerfile` line 19 - Flag build argument: `ARG FLAG`
- `src/Dockerfile` line 21 - Flag injection: `RUN sed -i s/@FLAG@/$FLAG/g secret.txt`
- `.env` line 1 - Flag value: `FLAG="flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}"`
- `src/secret.txt` - Runtime flag storage (plaintext file)
- `src/app.py` line 22 - Flag loaded into memory at startup
- `src/app.py` line 52 - Flag disclosed in HTTP response upon successful XSS exploitation

## 9. XSS Sinks and Render Contexts

**Network Surface Focus Confirmation:** All XSS sinks identified below are in the network-accessible `/challenge` endpoint (src/app.py lines 60-76), which accepts POST requests from external users. No XSS sinks exist in out-of-scope components.

### XSS Sink 1: Reflected XSS in HTML Attribute Context (CRITICAL)

**File Location:** `src/app.py`
**Lines:** 62 (input acquisition), 64 (unsafe formatting), 70/72/75 (template injection)

**Sink Type:** Reflected XSS - User input reflected directly into HTML attribute context without escaping

**Render Context:** HTML Attribute (unquoted `<input>` tag attribute)

**Data Flow:**
1. User submits POST parameter `solution` to `/challenge` endpoint
2. Line 62: Input stored in `msg` variable: `msg = request.form.get('solution','')`
3. Line 64: Input formatted with prefix: `value = "" if msg == "" else '> {0}'.format(msg)`
4. Lines 70/72/75: `value` injected into position {2} of PAGE_CONTENT_POST template via `.format()`
5. Template definition in src/constants.py line 71: `<input type=text name=solution placeholder="Enter solution..." {2}>`
6. **SINK:** User input rendered directly as HTML attribute content without quotes or escaping

**Exact Code Snippet:**
```python
# src/app.py
msg = request.form.get('solution','')  # Line 62
value = "" if msg == "" else '> {0}'.format(msg)  # Line 64
return PAGE_CONTENT_POST.format("25","Star",value,"",error_msg)  # Line 70
```

**Template Context (src/constants.py line 71):**
```html
<input type=text name=solution placeholder="Enter solution..." {2}>
```

**Attack Vector:** The unquoted attribute allows trivial breakout. Example payloads:
- `autofocus onfocus=alert(1)` - Bypasses 'onload' blacklist, triggers immediately
- `tabindex=1 onfocusin=alert(1)` - Bypasses 'onfocus' blacklist variant
- `onanimationstart=alert(1) style=animation:x` - Bypasses all event handler blacklist entries

**Blacklist Bypass Analysis:** The blacklist at line 63 (`['script', "onload", "onmouseover", "onclick", "onbegin", "onerror", "svg", "'"]`) omits 30+ event handlers including: onfocus, onblur, oninput, onchange, onsubmit, onanimationstart, onanimationend, ontransitionend, onloadstart, onprogress, etc.

**Severity:** CRITICAL - Direct user input to HTML attribute, trivial exploitation, no effective filtering

---

### XSS Sink 2: Information Disclosure via Error Message (MEDIUM)

**File Location:** `src/app.py`
**Lines:** 67-68 (error message construction), 70 (rendering)

**Sink Type:** Reflected XSS - Blacklist word reflected in HTML body context

**Render Context:** HTML Body Context (inside `<div class="solution-text">`)

**Data Flow:**
1. User submits input containing blacklisted keyword
2. Line 67: Blacklist match detected: `if word in msg.lower()`
3. Line 68: Error message constructed with blacklist word: `error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word`
4. Line 70: Error message injected into position {4} of template: `return PAGE_CONTENT_POST.format("25","Star",value,"",error_msg)`
5. **SINK:** Blacklist word rendered in HTML body (though `word` comes from predefined list, not direct user input)

**Exact Code Snippet:**
```python
# src/app.py lines 67-70
if word in msg.lower():
    error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
    value = ">"
    return PAGE_CONTENT_POST.format("25","Star",value,"",error_msg)
```

**Exploitability:** LOW - The `word` variable comes from the application's blacklist array, not directly from user input, so it cannot be controlled to inject arbitrary HTML. However, this sink demonstrates unsafe HTML construction patterns (string interpolation without escaping).

**Information Disclosure Impact:** HIGH - This error message leaks the exact blacklist word that triggered rejection, allowing attackers to enumerate the complete blacklist through trial and error.

**Severity:** MEDIUM - Not directly exploitable for XSS, but reveals defensive mechanisms and uses unsafe patterns

---

### XSS Sink 3: Stored-Temporary XSS via PhantomJS Rendering (HIGH)

**File Location:** `src/app.py`
**Lines:** 35-40 (file creation), 72-73 (validation trigger)

**Sink Type:** Stored XSS (temporary) - User input written to web-accessible HTML file and executed in browser context

**Render Context:** Full HTML Document (complete page rendered by PhantomJS)

**Data Flow:**
1. User submits XSS payload in `solution` parameter
2. Line 64: Payload embedded in `value` variable
3. Line 72: Full HTML page constructed: `data = PAGE_CONTENT_POST.format("25","Star",value, "","")`
4. Line 73: Page passed to validation: `result = check_solution(data,flags[0],msg,'level_medium')`
5. Line 35: Random filename generated: `fn = "static/" + os.urandom(16).encode('hex') + '.html'`
6. Lines 38-40: User-controlled HTML written to file:
   ```python
   of = open(fn, 'w')
   of.write(page)  # 'page' parameter contains user payload
   of.close()
   ```
7. Line 36: URL constructed for PhantomJS: `url = 'http://localhost:5000/' + fn`
8. Line 41: URL sent to PhantomJS: `proc.stdin.write(url)`
9. **SINK:** PhantomJS (via check.js line 20) loads and executes the HTML: `page.open(input, function(status) {...})`
10. Lines 8-18 of check.js: JavaScript dialogs (alert/confirm/prompt) trigger success condition
11. Line 46: File deleted after processing: `os.unlink(fn)`

**Exact Code Snippet:**
```python
# src/app.py lines 35-46
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn
try:
    of = open(fn, 'w')
    of.write(page)  # User payload embedded in 'page'
    of.close()
    proc.stdin.write(url)
    proc.stdin.close()
    result = proc.stdout.readline().strip()
finally:
    os.unlink(fn)
```

**PhantomJS Validation (check.js lines 8-18):**
```javascript
page.onAlert = function(msg) {
  console.log('SUCCESS');
};
page.onConfirm = function(msg) {
  console.log('SUCCESS');
};
page.onPrompt = function(msg) {
  console.log('SUCCESS');
};
```

**Race Condition Exploitation:** Between file creation (line 40) and deletion (line 46), the temporary HTML file is accessible via GET request to `/static/[random].html`. An attacker could:
1. Submit XSS payload and observe the 200 OK response timing
2. Brute-force the random filename (2^128 space, computationally infeasible)
3. OR use timing attacks to detect file creation and access it before deletion

**Browser Context Execution:** The XSS payload executes in PhantomJS's QtWebKit rendering engine, which processes JavaScript exactly like a real browser. Successful exploitation triggers the `page.onAlert/onConfirm/onPrompt` handlers, causing check.js to output "SUCCESS", which results in flag disclosure at src/app.py line 52.

**Severity:** HIGH - Full JavaScript execution in browser context, intentional design for CTF challenge, achieves goal of flag disclosure

---

### Summary Table: XSS Sinks

| # | Sink Location | Lines | Context | Input Source | Exploitability | Severity |
|---|---------------|-------|---------|--------------|----------------|----------|
| 1 | src/app.py | 64, 70, 72, 75 | HTML Attribute (unquoted) | `request.form.get('solution')` | CRITICAL - Trivial bypass | CRITICAL |
| 2 | src/app.py | 68, 70 | HTML Body | Blacklist array (not user-controlled) | LOW - Info disclosure only | MEDIUM |
| 3 | src/app.py | 38-40 | Full HTML Document (PhantomJS) | `request.form.get('solution')` via template | HIGH - Intentional validation mechanism | HIGH |

---

### No Other Injection Sinks Found

**SQL Injection:** No SQL injection sinks found in network-accessible components. The application does not use a database.

**Command Injection:** No command injection sinks found. Subprocess execution at line 34 uses array syntax with hardcoded arguments: `subprocess.Popen(["timeout","5","phantomjs", "check.js"], ...)`. User input never flows into command arguments.

**Template Injection (SSTI):** No template injection sinks found. The application uses Python string formatting (`.format()`) rather than a template engine like Jinja2, and user input does not control template selection or template code.

## 10. SSRF Sinks

**Network Surface Focus Confirmation:** A comprehensive analysis was performed on all network-accessible components. The application uses PhantomJS as a headless browser for XSS validation, but user input does **not** control the destination URL of server-side requests.

### SSRF Analysis: PhantomJS Integration (NOT EXPLOITABLE)

**File Location:** `src/app.py`
**Lines:** 34-46 (PhantomJS subprocess), check.js line 20 (page.open call)

**Headless Browser Usage:** The application uses PhantomJS (deprecated headless browser based on QtWebKit) to render and validate user-submitted HTML for XSS payloads. This is investigated as a potential SSRF vector because headless browsers can make server-side HTTP requests.

**URL Construction Analysis (Line 36):**
```python
url = 'http://localhost:5000/' + fn
```

**Hardcoded Components:**
- **Scheme:** `http://` (hardcoded, user cannot change to `file://`, `ftp://`, etc.)
- **Host:** `localhost` (hardcoded, user cannot change to internal IPs like 169.254.169.254 or external domains)
- **Port:** `5000` (hardcoded, user cannot change to other ports)
- **Path:** `fn` variable, which is constructed at line 35: `fn = "static/" + os.urandom(16).encode('hex') + '.html'`
  - Filename uses cryptographically secure random bytes from `os.urandom(16)`
  - User input does **not** influence the filename or directory path

**User Input Flow:**
User input from `request.form.get('solution','')` (line 62) controls only the **HTML content** of the file written to `static/[random].html`, not the URL that PhantomJS loads. The input is embedded in the PAGE_CONTENT_POST template at line 72 and written to the file at lines 38-40, but the file path itself is not user-controllable.

**PhantomJS page.open() Call (check.js line 20):**
```javascript
page.open(input, function(status) {
    // PhantomJS loads the URL passed via stdin
});
```
The `input` variable receives the hardcoded localhost URL from stdin (app.py line 41: `proc.stdin.write(url)`). User input never reaches this URL parameter.

**VERDICT:** NOT EXPLOITABLE FOR SSRF - User input controls page content but not the URL destination.

---

### Additional SSRF Vector Analysis

**HTTP Clients:** The application imports `urllib` at src/app.py line 11, but searching the codebase shows **urllib is never used**. No HTTP client methods like `urllib.urlopen()`, `urllib.request.urlopen()`, or `urllib2` functions are called.

**File Operations with URLs:** No `file_get_contents`, `fopen` with URLs, `URL.openStream()`, or remote file operations detected. All file operations use local paths:
- Line 22: `open('secret.txt')` - Hardcoded local file
- Lines 38-40: `open(fn, 'w')` - Randomized local filename, no URL handling

**Redirect Handlers:** No redirect endpoints exist. The application has only two routes (`/` and `/challenge`), neither of which implements redirect functionality. No `redirect()`, `url_for()` with user input, or `Response(headers={'Location': ...})` calls detected.

**Webhooks/Callbacks:** No webhook testing or callback verification endpoints exist. The application does not accept URL parameters for callback validation.

**SSO/OIDC/JWKS Fetchers:** No authentication mechanisms exist, therefore no SSO discovery endpoints, OIDC `.well-known` fetchers, or JWKS URL loaders are present.

**Importers/Data Loaders:** No "import from URL" functionality exists. The application does not load external data sources.

**Unused Template (Potential Future Risk):** src/constants.py lines 155-204 define `PAGE_CONTENT_IFRAME`, which contains an iframe element. However, grep analysis confirms this template is **never referenced** in app.py, so it represents no current attack surface. If future code were to use this template with user-controlled iframe src attributes, it could enable SSRF or clickjacking.

---

### Phantom Object (Unused Code)

**File Location:** `src/app.py` line 27
```python
phantom = Phantom()
```

**Analysis:** A `Phantom` class is instantiated but never used anywhere in the application. Searching for `phantom.` method calls yields no results. The PhantomJS interaction occurs through direct subprocess execution (line 34) rather than through this Phantom object. This represents dead code with no security impact.

---

### Summary: No SSRF Sinks Found

**Comprehensive Finding:** No SSRF vulnerabilities exist in network-accessible components of XBEN-004-24. The PhantomJS headless browser integration is not exploitable for SSRF because user input does not control URL parameters. All file operations use local paths, and no HTTP client functionality is used to make requests to user-controlled URLs.

**Files Analyzed:**
- `src/app.py` - Main application logic
- `src/check.js` - PhantomJS validation script  
- `src/constants.py` - HTML templates
- `src/requirements.txt` - Dependencies
- `docker-compose.yml` - Infrastructure configuration

**Tested Attack Vectors (All Negative):**
- ❌ HTTP Clients (urllib imported but unused)
- ❌ URL Fetchers (no remote file operations)
- ❌ Redirect Handlers (no redirect endpoints)
- ❌ Headless Browser URL Control (URLs hardcoded)
- ❌ Iframe Injection (template exists but unused)
- ❌ Webhooks/Callbacks (no such endpoints)
- ❌ SSO/OIDC/JWKS (no authentication system)
- ❌ Import from URL (no data loading features)

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-31T07:19:03.772Z