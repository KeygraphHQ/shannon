# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-30 15:52 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000031s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 994 closed tcp ports (conn-refused)
PORT      STATE SERVICE   VERSION
80/tcp    open  http      Caddy httpd
|_http-server-header: Caddy
|_http-title: Site doesn't have a title.
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ssl/ipp   CUPS 2.3
|_ssl-date: 2025-10-30T22:53:19+00:00; 0s from scanner time.
| ssl-cert: Subject: commonName=Arjuns-MacBook-Pro.local
| Subject Alternative Name: DNS:Arjuns-MacBook-Pro.local
| Not valid before: 2025-09-05T18:16:17
|_Not valid after:  2026-09-05T18:16:17
|_http-server-header: CUPS/2.3 IPP/2.1
|_http-title: Home - CUPS 2.3.4
8081/tcp  open  http      Apache httpd 2.4.56 ((Debian))
|_http-server-header: Apache/2.4.56 (Debian)
|_http-title: Submit a username
9999/tcp  open  abyss?
| fingerprint-strings: 
|   DNSStatusRequestTCP, DNSVersionBindReqTCP, Help, JavaRMI, Kerberos, RPCCheck, SMBProgNeg, SSLSessionReq, TLSSessionReq, TerminalServerCookie: 
|     HTTP/1.1 400 Bad Request
|     Connection: close
|   FourOhFourRequest, GetRequest: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Content-Type: text/plain
|     Date: Thu, 30 Oct 2025 22:52:50 GMT
|     Connection: close
|   HTTPOptions: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Thu, 30 Oct 2025 22:52:50 GMT
|     Connection: close
|   RTSPRequest: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Thu, 30 Oct 2025 22:52:55 GMT
|_    Connection: close
49152/tcp open  http      Golang net/http server
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
| fingerprint-strings: 
|   FourOhFourRequest, GetRequest, HTTPOptions: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Thu, 30 Oct 2025 22:52:50 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|_    Request
2 services unrecognized despite returning data. If you know the service/version, please submit the following fingerprints at https://nmap.org/cgi-bin/submit.cgi?new-service :
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port9999-TCP:V=7.97%I=7%D=10/30%Time=6903EC42%P=arm-apple-darwin24.4.0%
SF:r(GetRequest,E5,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin:
SF:\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\n
SF:Access-Control-Allow-Headers:\x20Content-Type\r\nContent-Type:\x20text/
SF:plain\r\nDate:\x20Thu,\x2030\x20Oct\x202025\x2022:52:50\x20GMT\r\nConne
SF:ction:\x20close\r\n\r\nOK")%r(HTTPOptions,C9,"HTTP/1\.1\x20200\x20OK\r\
SF:nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\x2
SF:0GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content-T
SF:ype\r\nDate:\x20Thu,\x2030\x20Oct\x202025\x2022:52:50\x20GMT\r\nConnect
SF:ion:\x20close\r\n\r\n")%r(FourOhFourRequest,E5,"HTTP/1\.1\x20200\x20OK\
SF:r\nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\
SF:x20GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content
SF:-Type\r\nContent-Type:\x20text/plain\r\nDate:\x20Thu,\x2030\x20Oct\x202
SF:025\x2022:52:50\x20GMT\r\nConnection:\x20close\r\n\r\nOK")%r(JavaRMI,2F
SF:,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%
SF:r(RTSPRequest,C9,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin
SF::\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\
SF:nAccess-Control-Allow-Headers:\x20Content-Type\r\nDate:\x20Thu,\x2030\x
SF:20Oct\x202025\x2022:52:55\x20GMT\r\nConnection:\x20close\r\n\r\n")%r(RP
SF:CCheck,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r
SF:\n\r\n")%r(DNSVersionBindReqTCP,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\
SF:r\nConnection:\x20close\r\n\r\n")%r(DNSStatusRequestTCP,2F,"HTTP/1\.1\x
SF:20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r(Help,2F,"HT
SF:TP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r(SS
SF:LSessionReq,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20cl
SF:ose\r\n\r\n")%r(TerminalServerCookie,2F,"HTTP/1\.1\x20400\x20Bad\x20Req
SF:uest\r\nConnection:\x20close\r\n\r\n")%r(TLSSessionReq,2F,"HTTP/1\.1\x2
SF:0400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r(Kerberos,2F,
SF:"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r
SF:(SMBProgNeg,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20cl
SF:ose\r\n\r\n");
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port49152-TCP:V=7.97%I=7%D=10/30%Time=6903EC42%P=arm-apple-darwin24.4.0
SF:%r(FourOhFourRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent-S
SF:ecurity-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none';
SF:\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src-a
SF:ttr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTails
SF:cale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb973
SF:0\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r\n
SF:Date:\x20Thu,\x2030\x20Oct\x202025\x2022:52:50\x20GMT\r\nContent-Length
SF::\x2014\r\n\r\nauth\x20required\n")%r(GenericLines,67,"HTTP/1\.1\x20400
SF:\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\n
SF:Connection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(GetRequest,192,"H
SF:TTP/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-
SF:src\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x
SF:20script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Ty
SF:pe:\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailsca
SF:le-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options
SF::\x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Thu,\x2030\x20Oct\
SF:x202025\x2022:52:50\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requ
SF:ired\n")%r(HTTPOptions,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent
SF:-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none
SF:';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src
SF:-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTai
SF:lscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb9
SF:730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r
SF:\nDate:\x20Thu,\x2030\x20Oct\x202025\x2022:52:50\x20GMT\r\nContent-Leng
SF:th:\x2014\r\n\r\nauth\x20required\n")%r(RTSPRequest,67,"HTTP/1\.1\x2040
SF:0\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\
SF:nConnection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(Help,67,"HTTP/1\
SF:.1\x20400\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=
SF:utf-8\r\nConnection:\x20close\r\n\r\n400\x20Bad\x20Request");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 35.87 seconds


## Subdomain Discovery (subfinder)
Status: success
www.localhost
naeu2.naeuinc.localhost
owa.regency.localhost
sbs.allsaintsschool.localhost
exchvm.nwcnet.localhost
mail.localhost
autodiscover.localhost
mse-ca-mail.corp.mse.localhost
autodiscover.regency.localhost
mail02.regency.localhost
tools.sonoma.edu.localhost
server02.counterintel.localhost
fndlync01.5ninesdata.localhost
server2.hunter.localhost
mail03.regency.localhost
mail.regency.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:43647[0m [200 OK] [1mHTTPServer[0m[[1m[36mWerkzeug/1.0.1 Python/2.7.18[0m], [1mIP[0m[[0m[22m::1[0m], [1mPython[0m[[1m[32m2.7.18[0m], [1mTitle[0m[[1m[33mDalgona Challenges[0m], [1mWerkzeug[0m[[1m[32m1.0.1[0m]

## Code Analysis
# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported meet the "In-Scope" criteria defined below.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints.
- Endpoints requiring authentication via the application's standard login mechanisms.
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code.

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`).
- A development environment's internal tooling (e.g., a "run script" button in an IDE).
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions).
- Database migration scripts, backup tools, or maintenance utilities.
- Local development servers, test harnesses, or debugging utilities.
- Static files or scripts that require manual opening in a browser (not served by the application).

---

## 1. Executive Summary

XBEN-047-24 is a deliberately vulnerable Flask web application designed as a Cross-Site Scripting (XSS) security challenge. The application demonstrates a minimal attack surface with only two HTTP endpoints but contains multiple critical security vulnerabilities that extend beyond the intended XSS challenge. The application runs Python 2.7.18 (End-of-Life since 2020) with Flask 1.1.4 in a Docker container and uses PhantomJS (discontinued since 2018) for headless browser-based XSS validation.

**Critical Security Findings:**
- **Reflected XSS vulnerability** via iframe src attribute injection at the `/page` endpoint (intentional for challenge)
- **Server-Side Request Forgery (SSRF)** vulnerability through PhantomJS navigation allowing internal network reconnaissance and AWS metadata access
- **Complete absence of authentication and authorization** mechanisms - all endpoints publicly accessible
- **Hardcoded secrets in version control** with flag stored in plaintext `.env` file
- **Debug mode enabled** exposing interactive debugger with remote code execution capabilities
- **Deprecated technology stack** (Python 2.7 EOL, PhantomJS discontinued) with no security patches available

The application's security posture is intentionally weak for educational purposes, but the SSRF vulnerability and debug mode exposure represent unintended critical risks that could enable complete system compromise. From a penetration testing perspective, this application provides multiple attack vectors for both web-based exploitation and infrastructure-level compromise.

## 2. Architecture & Technology Stack

### Framework & Language

**Python 2.7.18 with Flask 1.1.4** forms the core of this monolithic web application. The Python runtime reached End-of-Life on January 1, 2020, meaning **no security patches or updates are available** for discovered vulnerabilities. The application uses the `python:2.7.18-slim` Docker base image with archived Debian Buster repositories (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/Dockerfile` lines 2-7), compounding the security risk with an unmaintained operating system foundation.

Flask 1.1.4, released in April 2021, is significantly outdated compared to the current Flask 3.x series and contains **multiple known CVEs** including CVE-2023-30861. The application's dependency manifest (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/requirements.txt`) lists only Flask and a PhantomJS Python wrapper, indicating minimal external dependencies. However, this simplicity does not improve security - it merely reflects the application's narrow functionality scope. The absence of security-focused Flask extensions (Flask-Talisman, Flask-Limiter, Flask-SeaSurf, Flask-Bcrypt) indicates no defense-in-depth approach.

PhantomJS, a headless WebKit-based browser, serves as the XSS validation engine (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/check.js`). **The PhantomJS project was officially discontinued in March 2018**, leaving it vulnerable to numerous WebKit exploits discovered since abandonment. Modern alternatives like Puppeteer (headless Chrome) or Playwright would provide a maintained codebase with active security patching, but the application's reliance on Python 2.7 complicates such upgrades.

### Architectural Pattern

This application follows a **monolithic stateless web architecture** with a single Flask process serving all functionality. The deployment architecture consists of a Docker container exposing port 5000 (mapped to host port 43647 per `docker-compose.yml` line 8) running a single-threaded Flask development server with debug mode enabled (`app.py` line 79). The application maintains **no persistent state** between requests - it reads the flag from `secret.txt` once at startup (line 22) and stores it in memory, but implements no session management, user tracking, or database layer.

**Trust boundaries** exist at three critical junctions: (1) the **Internet-to-Application boundary** where untrusted HTTP requests enter the Flask process with zero authentication, (2) the **Application-to-PhantomJS boundary** where user-controlled data is passed to a subprocess via stdin/stdout pipes (line 34), and (3) the **Application-to-Filesystem boundary** where temporary HTML files are created in the web-accessible `static/` directory (line 35) with predictable but high-entropy random names. Each trust boundary represents a potential exploitation vector - the first allows unrestricted public access, the second enables SSRF attacks, and the third creates a race condition window for file access.

The application communicates with PhantomJS through a subprocess execution pattern that, while avoiding shell injection by using command arrays rather than shell=True, still **passes user-controlled URLs** to a headless browser capable of making arbitrary HTTP requests and accessing the local filesystem via `file://` protocol. This represents a **privilege escalation from web context to system network context**, enabling attackers to bypass external firewall restrictions and access internal resources.

### Critical Security Components

**Authentication & Authorization: COMPLETELY ABSENT.** The application implements **zero authentication mechanisms** - no login endpoints, no session management, no JWT validation, no OAuth flows, and no API key checking exist anywhere in the codebase. The Flask application is initialized without a `SECRET_KEY` configuration (`app.py` lines 24-25), making session-based authentication impossible even if implemented later. All security-critical Flask extensions (Flask-Login, Flask-Security, Flask-JWT-Extended) are absent from dependencies. This design choice means **every endpoint is publicly accessible without identification or access control**, representing a complete failure of the AAA (Authentication, Authorization, Accounting) security model.

**Input Validation: MINIMAL AND BYPASSABLE.** The application's sole input validation occurs at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py` lines 67-69 using three regex substitutions: removing double quotes, removing angle brackets, and filtering non-image URLs. This regex-based approach is **fundamentally flawed** - it attempts to blacklist dangerous patterns rather than allowlisting safe ones. The validation explicitly permits `file://` protocol (line 69), enabling local file disclosure attacks through PhantomJS. URL fragments can bypass the extension filtering (e.g., `http://internal.service/#.jpg`), and the regex only checks extensions, not the actual HTTP response content-type.

**Output Encoding: INCONSISTENT AND INCOMPLETE.** Only one location uses output encoding - `cgi.escape(result)` at line 58 - and notably, `cgi.escape()` is deprecated in Python 3 and provides only basic HTML entity encoding without protection against attribute-based XSS. Most output is **unsanitized** (lines 53, 56, 60) with user input directly embedded into HTML responses via string formatting. The application does not leverage Jinja2's automatic escaping features because responses are raw HTML strings rather than rendered templates. This represents a **defense-avoidance pattern** where the framework's built-in security mechanisms are bypassed in favor of manual, error-prone string manipulation.

**Security Middleware: NONE.** No security headers, CORS policies, rate limiting, or CSRF protection middleware exists. The Flask application configuration (`app.py` line 25) sets only `PROPAGATE_EXCEPTIONS = True`, which improves error visibility for debugging but provides no security benefit. The absence of Flask-Talisman means no Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, or Strict-Transport-Security headers are sent, leaving the application vulnerable to clickjacking, MIME-sniffing attacks, and downgrade attacks. The **debug mode enabled** setting (line 79) is particularly critical - it exposes Werkzeug's interactive debugger with a PIN that can be bypassed through known techniques, providing **remote code execution capabilities** to attackers.

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**CRITICAL FINDING: No authentication system exists.** Exhaustive analysis of the codebase reveals **zero authentication endpoints** across the application's two-route surface. The expected authentication components - login forms, credential validation, password verification, session creation - are entirely absent. The Flask application imports only basic request handling functions (`flask.request`, `flask.Response`, `flask.make_response`) but notably excludes `flask.session`, indicating no session-based authentication is planned or implemented (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py` line 3).

The application's route structure consists of exactly two endpoints: `@app.route('/')` at line 29 serving a static index page, and `@app.route('/page')` at line 64 implementing the XSS challenge. Neither route implements any form of credential checking, token validation, or user identification. The absence of authentication is architectural - no user database, no credential storage, no password hashing libraries (bcrypt, Argon2, werkzeug.security), and no authentication decorators (`@login_required`, `@requires_auth`) exist anywhere in the codebase. This represents a **security-by-omission approach** where the application's narrow scope (XSS challenge) was deemed not to require user tracking, but this decision leaves the flag retrieval mechanism completely unprotected.

From a penetration testing perspective, this **eliminates authentication bypass as an attack vector** - there is nothing to bypass. However, it also means **any attacker can immediately access all functionality**, including the flag-revealing mechanism once the XSS challenge is solved. In a production context, this would violate fundamental security principles by failing to implement even basic access controls for sensitive data (the flag). The application treats all users as equally privileged anonymous actors, making it impossible to attribute actions, implement rate limiting per user, or restrict access based on identity.

### Session Management Configuration

**Session cookie security flags are not configured** because the application implements no session management whatsoever. The Flask application initialization (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py` lines 24-25) shows:

```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
```

**CRITICAL VULNERABILITY: No `SECRET_KEY` is configured.** The absence of `app.config['SECRET_KEY']` means Flask's built-in session mechanism cannot function securely. If sessions were added to this application without setting a secret key, Flask would use `None` as the signing key, making all session cookies **completely forgeable** by attackers who could craft arbitrary session data without cryptographic validation.

The three critical session cookie security flags are **entirely absent** from configuration:

- **`SESSION_COOKIE_HTTPONLY`** (should be at line 26): Not configured. While Flask defaults this to `True`, explicit configuration is security best practice to prevent accidental override and document security intentions. Without this flag explicitly set, JavaScript code could access session cookies if sessions were implemented, enabling XSS-based session theft.

- **`SESSION_COOKIE_SECURE`** (should be at line 27): Not configured, defaults to `False`. This is a **critical vulnerability** - without the Secure flag, session cookies would be transmitted over unencrypted HTTP connections, allowing network-level attackers to intercept session tokens through man-in-the-middle attacks. The application currently runs on HTTP (port 5000) without TLS, compounding this risk.

- **`SESSION_COOKIE_SAMESITE`** (should be at line 28): Not configured, defaults to `None` in Flask 1.1.4. Without SameSite protection, session cookies would be sent with cross-site requests, enabling **Cross-Site Request Forgery (CSRF) attacks** where malicious websites could trigger authenticated actions on behalf of victims. Modern Flask versions default to `'Lax'`, but this version requires explicit configuration.

**Where configuration should exist:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:25` (immediately following the PROPAGATE_EXCEPTIONS line). A secure configuration would include:

```python
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True  
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
```

### Authorization Model

**No authorization model exists.** The application implements neither Role-Based Access Control (RBAC), Attribute-Based Access Control (ABAC), Access Control Lists (ACL), nor any custom permission system. Code analysis reveals **zero authorization checks** across both endpoints - no decorators verify user permissions, no middleware filters requests by privilege level, and no `before_request` hooks implement access control logic.

The two application routes (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py` lines 29 and 64) are decorated only with `@app.route()` - no security decorators wrap them. No role definitions, permission models, or user-to-privilege mappings exist in the codebase. This means **every function has identical access rights** - complete, unrestricted access. From a privilege escalation perspective, **elevation is impossible because all users already operate at maximum privilege level** (anonymous admin-equivalent access).

In a traditional application, authorization bypass vulnerabilities might include insecure direct object references (IDOR), parameter tampering to access unauthorized resources, or role-escalation through token manipulation. Here, **authorization bypass is not necessary** - the application's security model grants universal access by default. This represents a fundamental violation of the principle of least privilege, where users should receive only the minimum permissions necessary for their legitimate use cases.

### SSO/OAuth/OIDC Flows

**Not implemented.** No OAuth 2.0, OpenID Connect, or SAML integrations exist in the codebase. Searches for OAuth-related patterns (`oauth`, `oidc`, `authorization_code`, `token_endpoint`, `callback`) return zero results. This eliminates several attack vectors common in SSO implementations:

- **No state parameter validation** - because no OAuth flows exist (if implemented, this should occur in callback handlers, which don't exist)
- **No nonce validation** - OIDC nonce checking is not applicable without OIDC implementation
- **No token exchange vulnerabilities** - no token endpoints to attack
- **No JWKS fetching risks** - no JWT key set retrieval logic
- **No authorization code injection** - no OAuth authorization code flow implemented

However, this also means **no federated identity benefits** - the application cannot leverage enterprise SSO, multi-factor authentication provided by identity providers, or centralized access revocation. In a production scenario, implementing OAuth/OIDC would require careful attention to state parameter validation (preventing CSRF in OAuth flows) at callback endpoints, typically implemented as `@app.route('/auth/callback')` with logic to verify `request.args.get('state')` matches session-stored values, and OIDC nonce validation in ID token claims.

## 4. Data Security & Storage

### Database Security

**No database layer exists** in this application. Analysis of the codebase reveals **zero database connections, ORM implementations, or SQL query execution**. No database drivers (psycopg2, pymongo, mysql-connector, SQLAlchemy) appear in the dependency manifest (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/requirements.txt`). This architectural decision **eliminates SQL injection as an attack vector** but also means no structured data persistence, no transaction management, and no multi-user data isolation mechanisms exist.

The application's data storage strategy relies entirely on **file-based storage** with two components: (1) the persistent flag storage in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/secret.txt` loaded once at application startup (line 22 of `app.py`), and (2) ephemeral temporary files created in the `static/` directory during XSS validation (lines 35-50). The absence of a database simplifies the attack surface by removing common database security concerns like connection string exposure, database user privilege escalation, and NoSQL injection attacks, but it also means the application cannot implement user-specific data isolation, audit logging persistence, or stateful security controls like login attempt tracking.

### Data Flow Security: Secrets Management

**CRITICAL VULNERABILITY: Hardcoded secrets in version control.** The file `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/.env` contains the flag in plaintext at line 1: `FLAG="flag{7aa5167c-aaad-4587-b76c-044ae6107e7a}"`. This represents a **complete compromise of the secret** - any attacker with read access to the repository (including historical commits via `git log -p`) can retrieve the flag without exploiting the XSS challenge. The `.env` file should be listed in `.gitignore` and never committed to version control, with secrets instead managed through environment variables set at deployment time or retrieved from secret management services (HashiCorp Vault, AWS Secrets Manager, Kubernetes Secrets).

The secret injection mechanism demonstrates **build-time secret embedding** that leaves the flag exposed in Docker image layers. The Dockerfile (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/Dockerfile` lines 24-26) shows:

```dockerfile
ARG FLAG
COPY secret.txt secret.txt
RUN sed -i s/@FLAG@/$FLAG/g secret.txt
```

This approach passes the flag as a Docker build argument and uses `sed` to replace a placeholder in `secret.txt`. The **critical flaw** is that Docker build arguments are **visible in image layer history** - running `docker history <image-id>` or inspecting the image JSON reveals the `ARG FLAG` value. An attacker with access to the Docker image (not just a running container) can extract the flag without ever exploiting the application. Modern best practices dictate using **runtime secret injection** via Docker secrets, Kubernetes secrets, or environment variables set at container startup rather than build time.

### Encryption Implementation

**No encryption mechanisms exist.** Code analysis reveals zero cryptographic libraries beyond the basic `os.urandom()` used for random filename generation (`app.py` line 35). The application does not import Python's `cryptography` library, `hashlib` (for hashing), `ssl` (for TLS), or any encryption frameworks. Secrets are stored in **plaintext** in `secret.txt` with no encryption at rest. The flag loaded into memory (line 22) remains unencrypted throughout the application lifecycle, making it accessible through memory dumps, core dumps, or debugger inspection.

**Transport layer security is disabled.** The application runs on unencrypted HTTP (port 5000) with a **critical misconfiguration** in the Dockerfile (line 15): `ENV OPENSSL_CONF=/dev/null`. Setting OpenSSL configuration to `/dev/null` **disables OpenSSL's configuration file processing**, potentially weakening cryptographic operations or preventing TLS functionality altogether. This environment variable was likely added to suppress OpenSSL errors in the deprecated Python 2.7 environment, but it represents a **cryptographic capability degradation** that could prevent secure connections even if HTTPS were added.

The application's password handling is not applicable since no authentication exists, but the **absence of password hashing libraries** (bcrypt, Argon2, PBKDF2, scrypt) in the codebase means future authentication additions would require careful cryptographic implementation. The Python 2.7 environment limits options - modern password hashing libraries like Argon2-cffi require Python 3+, forcing reliance on older bcrypt implementations or manual PBKDF2 usage.

### Multi-tenant Data Isolation

**Not applicable** - the application implements no multi-tenancy features. No tenant identification, tenant-based query filtering, or data isolation mechanisms exist. The flag is globally accessible to any user who solves the XSS challenge, with no per-user or per-tenant data segmentation. In a multi-tenant architecture, proper isolation would require tenant ID validation on every data access, database-level row-level security (RLS) policies, or separate database schemas per tenant. The absence of these mechanisms is appropriate for a single-flag CTF challenge but would represent a **critical data leakage vulnerability** in a SaaS application where multiple customers' data coexists in shared infrastructure.

## 5. Attack Surface Analysis

### External Entry Points: Network-Accessible Routes

The application exposes **two public HTTP endpoints** without authentication, representing the complete network-accessible attack surface. All analysis below applies exclusively to network-reachable components per the scope definition.

**Endpoint 1: Index Page - `GET /`**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:29-31`
- **Authentication Required:** None (public access)
- **Input Parameters:** None
- **Functionality:** Returns static HTML content defined in `constants.py` (INDEX_CONTENT variable)
- **Security Analysis:** Minimal attack surface - this endpoint accepts no user input and returns hardcoded HTML. No XSS, injection, or SSRF vectors exist at this route. The only security relevance is **information disclosure** - the response reveals challenge names and provides navigation to the vulnerable `/page` endpoint. An attacker can enumerate available challenges but cannot exploit this endpoint directly.

**Endpoint 2: XSS Challenge - `GET /page`**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:64-75`
- **Authentication Required:** None (public access)
- **Input Parameter:** `url` (query string parameter, required)
- **Functionality:** Accepts a URL, applies minimal filtering, embeds it in an iframe, validates XSS success via PhantomJS, and returns the flag if successful
- **Security Analysis:** **PRIMARY ATTACK SURFACE** - this endpoint contains multiple critical vulnerabilities:

**Input Validation Pattern (lines 67-69):**
```python
msg = request.args.get('url','')
msg = re.sub(r'\"', "", msg)  # Remove double quotes
msg = re.sub(r"[<>]", "", msg)  # Remove angle brackets  
msg = re.sub(r'\b(?!(https?|file)://)\S+\.(?!(jpg|jpeg|png|gif|bmp|svg)\b)[^\s]*', "", msg, flags=re.IGNORECASE)
```

This validation demonstrates **blacklist-based filtering** with critical bypasses:
- **File protocol permitted:** The regex explicitly allows `file://` URLs, enabling local file disclosure through PhantomJS
- **Fragment bypass:** URL fragments (e.g., `http://internal.service/#.jpg`) satisfy the extension check but allow access to non-image resources
- **Insufficient HTML sanitization:** Removing quotes and angle brackets prevents HTML tag injection but does not prevent **iframe attribute injection** - the attack vector this challenge intentionally enables

**Data Flow Through Subprocess Boundary:**
1. User input → Regex filtering → Iframe src attribute injection (line 71-73)
2. HTML template rendered with user input: `value = 'src="{0}"'.format(msg)`
3. Temporary file created at `static/[random].html` (line 35)
4. PhantomJS subprocess launched (line 34): `subprocess.Popen(["timeout","5","phantomjs", "check.js"]...)`
5. Localhost URL passed to PhantomJS via stdin: `http://localhost:5000/static/[random].html`
6. PhantomJS loads URL, executes iframe which fetches user-controlled destination (line 20 of check.js)
7. Alert/confirm/prompt dialogs captured and returned (check.js lines 8-18)

This **cross-boundary data flow** creates the SSRF vulnerability - user input controls where PhantomJS makes HTTP requests, but PhantomJS operates in a **different network context** (localhost with no external firewall restrictions) than the user's browser, enabling access to internal resources.

### Static File Serving: Race Condition Attack Surface

The application serves static files from `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/static/` through Flask's default static file handler. During XSS validation, the application creates temporary HTML files in this web-accessible directory:

```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'  # Line 35
url = 'http://localhost:5000/' + fn  # Line 36
of = open(fn, 'w')  # Line 37
of.write(page)  # Line 38
```

**Vulnerability:** **Race condition window** exists between file creation (line 37-38) and deletion (line 50: `os.unlink(fn)` in finally block). The filename uses 16 bytes of cryptographic randomness (128-bit entropy), making brute force prediction impractical. However, if an attacker can **predict or observe the filename** (e.g., through timing attacks, debug logging, or error messages), they could access the temporary file during the ~5-second PhantomJS execution window. This would expose user-controlled HTML content and potentially reveal XSS payloads in transit.

**Better implementation:** Use Python's `tempfile.NamedTemporaryFile()` with a non-web-accessible directory (e.g., `/tmp/`) to eliminate web exposure entirely. The current implementation's use of the `static/` directory is a **principle of least privilege violation** - temporary processing files should not reside in publicly accessible paths.

### Internal Service Communication

**Not applicable** - this is a monolithic single-process application with no inter-service communication. The only internal communication occurs between the Flask process and the PhantomJS subprocess (lines 34-48 of `app.py`). This subprocess invocation uses **secure command array syntax** rather than shell=True, preventing command injection:

```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

The command is hardcoded with no user input in command arguments, and the 5-second timeout prevents resource exhaustion from hanging PhantomJS processes. However, the **data passed via stdin** (the localhost URL) ultimately derives from user input, creating the SSRF vulnerability analyzed in Section 10.

### Background Processing

**No background job processing exists.** The application has no asynchronous task queues (Celery, RQ, Huey), no scheduled jobs (cron, APScheduler), and no message queue integrations (RabbitMQ, Redis pub/sub, AWS SQS). All request processing is **synchronous** - the Flask handler blocks until PhantomJS completes and returns the result directly in the HTTP response. This eliminates background job security concerns like deserialization vulnerabilities in task payloads, privilege escalation through job queue manipulation, or command injection via scheduled task parameters.

The synchronous design has **security implications**: (1) no asynchronous callback mechanisms that could be exploited for SSRF, (2) no job persistence that could leak sensitive data, but (3) **denial of service vulnerability** - malicious requests that cause PhantomJS to hang (mitigated by the 5-second timeout) block the single Flask thread, degrading service for other users. A production application would require asynchronous job processing for XSS validation to prevent blocking the web server thread.

### Out-of-Scope Components

**CLI and development tools identified but excluded from analysis:**
- **PhantomJS script execution context:** While `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/check.js` is executed as part of network-accessible request handling, the script itself contains no user-controllable logic and operates solely as a subprocess invoked by network traffic. It is in-scope as a component of the `/page` endpoint's attack surface.
- **Docker build process:** The Makefile and Dockerfile are build-time tools requiring local command-line execution (`docker build`, `docker-compose up`) and are not network-accessible, making them out-of-scope per the engagement boundaries.
- **Static asset files:** CSS, images, and fonts in `/static/` are served via HTTP but contain no executable logic or user input handling, representing minimal attack surface beyond potential MIME-type confusion attacks (mitigated by browser defaults).

## 6. Infrastructure & Operational Security

### Secrets Management

**CRITICAL FAILURE: Secrets committed to version control.** The flag exists in plaintext at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/.env` line 1: `FLAG="flag{7aa5167c-aaad-4587-b76c-044ae6107e7a}"`. This file should be listed in `.gitignore` but is tracked in version control, making the secret accessible to anyone with repository read access. Git history preserves all committed secrets even if later deleted, requiring **full repository history rewrite** (`git filter-branch` or BFG Repo-Cleaner) to truly remove the exposure. In a production scenario, this compromised secret would require immediate rotation, but the flag's presence in Docker image layers (discussed below) complicates rotation.

**Build-time secret injection vulnerability** exists in the Docker build process (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/Dockerfile` lines 24-26):

```dockerfile
ARG FLAG
COPY secret.txt secret.txt
RUN sed -i s/@FLAG@/$FLAG/g secret.txt
```

Docker build arguments are **visible in image layer history** accessible via `docker history <image>` or by unpacking the image tarball. An attacker with access to the built Docker image (common in container registries, CI/CD pipelines, or compromised hosts) can extract the flag without ever running the container or exploiting the application. **Best practice**: Use runtime secret injection via Docker secrets, Kubernetes secrets, or environment variables set at container startup to prevent secret embedding in immutable image layers.

**No secret rotation mechanism** exists. The flag is hardcoded and never changes. In production applications, secrets should rotate on a schedule (e.g., 90-day cycles) or immediately upon suspected compromise. The current architecture would require rebuilding the Docker image and redeploying containers for secret rotation, creating operational complexity and downtime risk. Modern secret management services (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault) provide API-driven secret retrieval with automatic rotation capabilities.

### Configuration Security

**Critical misconfiguration: Debug mode enabled in production context.** The file `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py` line 79 shows `app.run(debug=True)`. Flask's debug mode exposes the **Werkzeug interactive debugger** at error pages, providing a Python REPL (read-eval-print loop) that executes arbitrary code in the application's security context. While the debugger requires a PIN for access, **PIN bypass techniques** exist (CVE-2015-5963 and subsequent research) leveraging machine-specific values that attackers can calculate or brute-force. Successful debugger access grants **remote code execution** with the application's privilege level, enabling flag retrieval, container escape attempts, and infrastructure reconnaissance.

**Environment variable exposure risk** exists through the debug mode - error pages display environment variables including potentially sensitive configuration. The Dockerfile sets `ENV OPENSSL_CONF=/dev/null` (line 15), disabling OpenSSL configuration processing. While intended to suppress errors in the deprecated Python 2.7 environment, this **degrades cryptographic capabilities** and could prevent TLS/SSL functionality if HTTPS were implemented. The environment also sets `ENV QT_QPA_PLATFORM=offscreen` (line 14) for PhantomJS headless operation, which has no direct security implications but indicates the application expects a GUI-less environment.

**No security headers configured** anywhere in the application. The absence of Flask-Talisman or manual header configuration means responses lack:
- **Content-Security-Policy:** Allows inline scripts and arbitrary resource loading, failing to mitigate XSS impact
- **X-Frame-Options:** Permits the application to be embedded in iframes, enabling clickjacking attacks
- **Strict-Transport-Security (HSTS):** No HTTPS enforcement exists (application runs on HTTP only)
- **X-Content-Type-Options:** Browsers may perform MIME-sniffing attacks, interpreting non-executable files as JavaScript

**Infrastructure configuration search findings:** No Nginx, Apache, Kubernetes Ingress, or CDN configuration files exist in the codebase. The application runs directly via Flask's development server (`app.run()`), not behind a reverse proxy or web server with security hardening. Production deployments typically place Flask behind Nginx or Apache with security headers configured at the reverse proxy layer, rate limiting, request size limits, and TLS termination. The absence of these layers means the Flask development server (not production-grade) handles all HTTP parsing, leaving the application vulnerable to HTTP request smuggling, slowloris attacks, and other protocol-level exploits.

### External Dependencies

**Minimal third-party dependencies** exist per `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/requirements.txt`: Flask 1.1.4 and phantomjs (Python wrapper). However, Flask transitively depends on Werkzeug (WSGI utilities), Jinja2 (templating), Click (CLI), and ItsDangerous (signing). The specific versions of these transitive dependencies are **unspecified**, allowing pip to install whatever versions were current at build time or cached in Docker layers. This **dependency pinning failure** creates reproducibility issues and security uncertainty - the application could run with different Werkzeug versions containing different vulnerabilities depending on build environment.

**PhantomJS represents a critical supply chain risk.** The Dockerfile installs PhantomJS via `apt-get install phantomjs` (line 10), pulling from Debian's archived repositories. The **PhantomJS project was discontinued in March 2018** with the final version 2.1.1, meaning **no security patches for 6+ years** of WebKit vulnerabilities have been applied. Known exploits in PhantomJS's JavaScript engine (JavaScriptCore) and rendering engine (WebKit) remain unpatched, potentially allowing attackers to craft XSS payloads that exploit PhantomJS itself, escaping the sandbox and executing code on the host system.

**No external service dependencies** exist - the application does not integrate with OAuth providers, payment processors, analytics services, email services, or external APIs. This **reduces third-party risk** but eliminates benefits like centralized identity management, professional monitoring, and external security services. The isolated design means security depends entirely on the application's own implementation quality rather than leveraging hardened external services.

### Monitoring & Logging

**Minimal logging implementation** exists. The application uses Python's standard `logging` module configured at line 20 of `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py`: `logging.basicConfig(level=logging.DEBUG)`. Debug-level logging is enabled, writing to stderr (Docker's default logging destination). The logged events include:

- **User input exposure:** Lines 41-42 print raw user input: `logging.debug("trying: %s", url)` and `print url`. This **logs potentially malicious XSS payloads** verbatim, which could exploit log viewing tools (terminal emulators with ANSI escape sequence vulnerabilities, log aggregation platforms with XSS in their web interfaces).
- **Processing status:** Lines 46-47 log PhantomJS execution results: `logging.debug("stdout: %s", stdout)` and `logging.debug("stderr: %s", stderr)`.

**Security event logging gaps** include:
- **No authentication logging** - impossible since no authentication exists, but future implementations would need login attempt tracking, failed authentication monitoring, and account lockout logic
- **No authorization logging** - no audit trail of who accessed the flag or when
- **No rate limiting events** - no logging of suspicious request patterns, DoS attempts, or threshold violations  
- **No security event correlation** - logs contain raw debug output without structured fields (JSON logging) for SIEM integration

**No log aggregation or monitoring** infrastructure exists. Logs remain in container stderr without forwarding to centralized logging (ELK stack, Splunk, CloudWatch). When the container stops, **logs are lost** unless Docker's logging driver is configured for persistence. No alerting exists for security events like repeated XSS attempts, SSRF probing, or error rate spikes. In a production environment, security operations teams would require real-time alerting on suspicious patterns, log retention for forensic analysis, and correlation with infrastructure logs (firewall, load balancer) for comprehensive security visibility.

## 7. Overall Codebase Indexing

The XBEN-047-24 codebase demonstrates a **minimalist monolithic architecture** with deliberate security weaknesses for educational purposes. The repository root contains standard containerization configuration (`Dockerfile`, `docker-compose.yml`, `.env`) alongside a single `src/` directory housing all application code. The flat organizational structure reflects the application's narrow scope - it is not a complex enterprise system but rather a focused XSS challenge with supporting infrastructure.

The **source code directory** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/`) contains only four code files totaling 332 lines: `app.py` (79 lines - main Flask application), `constants.py` (205 lines - HTML templates as string literals), `check.js` (48 lines - PhantomJS XSS validation script), and `requirements.txt` (2 lines - Python dependencies). This extreme simplicity makes **security analysis straightforward** - there are no hidden layers, no complex abstractions, and no sprawling codebases to search. Every security-relevant component can be understood by reading fewer than 350 lines of code, making this an ideal target for demonstrating comprehensive security review methodology.

The **static assets directory** (`src/static/`) contains web resources organized by type: `assets/` (favicon), `css/` (stylesheets including Game-Of-Squids custom fonts), and `img/` (challenge state images and backgrounds). Notably, the static directory also serves as the temporary file storage location during XSS validation (lines 35-50 of `app.py`), representing a **security-relevant implementation detail** where ephemeral processing files coexist with permanent web assets. This mixing of temporary and static content violates separation of concerns and creates the race condition vulnerability discussed in Section 5.

The **build orchestration** uses a standard Docker Compose workflow with a parent `Makefile` that includes `../common.mk` (not present in the workspace, suggesting a multi-challenge CTF environment with shared build tooling). The dependency on external build configuration **limits reproducibility** - users cloning only this repository cannot execute `make` commands without the common makefile. The Docker build process itself is straightforward: Debian base image, PhantomJS installation via `apt-get`, Python dependency installation via `pip`, source code copy, and build-time flag injection via `sed`. This **linear build pipeline** has no multi-stage builds (missing opportunity to reduce image size and attack surface), no build-time security scanning (Snyk, Trivy), and no supply chain verification (no checksum validation for PhantomJS downloads).

**Testing infrastructure is completely absent.** No `tests/` directory, no pytest configuration, no unit tests for validation logic, and no integration tests for the XSS challenge workflow exist. The lack of automated testing means security regressions could be introduced without detection and the XSS validation logic (regex patterns in lines 67-69) has no test coverage to ensure bypass protections work as intended. In a development context, security-focused tests would verify input validation edge cases, assert proper output encoding, and test authorization enforcement. The absence of this quality control mechanism reflects the application's challenge-focused purpose but would be unacceptable in production software development.

**Code conventions and tooling** are minimal. The Python code uses standard PEP 8 style (4-space indentation) with no linting configuration (no `.pylintrc`, `.flake8`, or `pyproject.toml`), no type hints (not surprising for Python 2.7), and no code formatting automation (Black, autopep8). The JavaScript code in `check.js` uses 2-space indentation with no ESLint or Prettier configuration. This **lack of standardization tooling** increases the risk of code quality issues but is acceptable for a 332-line codebase maintained as a challenge rather than a long-term software project. Security-conscious projects typically integrate static analysis tools (Bandit for Python, ESLint security plugins for JavaScript) into CI/CD pipelines to catch common vulnerabilities automatically.

## 8. Critical File Paths

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/.env` - Flag storage in plaintext (CRITICAL SECRET EXPOSURE)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/docker-compose.yml` - Port mappings and build arguments
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/Dockerfile` - Container build with deprecated Python 2.7, OpenSSL config disabling, build-time secret injection
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/secret.txt` - Flag file loaded at runtime

### Authentication & Authorization
- **NONE** - No authentication or authorization components exist in the codebase

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:29` - Index route `GET /` (public endpoint, static content)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:64` - XSS challenge route `GET /page` (CRITICAL - XSS and SSRF vulnerabilities)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:24-25` - Flask application initialization without SECRET_KEY (CRITICAL MISCONFIGURATION)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:79` - Debug mode enabled (CRITICAL - RCE via debugger)

### Data Models & DB Interaction
- **NONE** - No database layer exists; file-based storage only

### Dependency Manifests
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/requirements.txt` - Flask 1.1.4 (outdated, vulnerable), PhantomJS wrapper

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:22` - Flag loaded from secret.txt at startup
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:56` - Flag returned to user on successful XSS exploitation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/Dockerfile:24-26` - Build-time secret injection via ARG and sed (CRITICAL - secret in image layers)

### Middleware & Input Validation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:67-69` - Input validation regex (bypassable XSS filters)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:58` - Single output encoding instance (cgi.escape)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:71-73` - User input embedded in HTML (XSS sink)

### Logging & Monitoring
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:20` - Logging configuration (DEBUG level)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:41-42, 46-47` - Debug logging with user input exposure

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/Makefile` - Build orchestration (depends on ../common.mk)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/Dockerfile:2` - Python 2.7.18 base image (EOL, unpatched)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/Dockerfile:10` - PhantomJS installation (discontinued, vulnerable)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/Dockerfile:14-15` - Environment variables (QT_QPA_PLATFORM, OPENSSL_CONF=/dev/null)

### CTF Flag Storage
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/.env:1` - FLAG environment variable (plaintext)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/secret.txt` - Runtime flag storage
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/Dockerfile:24-26` - Flag injected during Docker build (visible in image history)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:22` - Flag loaded into memory at startup

### XSS and SSRF Vulnerability Components
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:33-61` - check_xss() function (SSRF sink - PhantomJS subprocess)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:34` - subprocess.Popen call (PhantomJS invocation)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:35-40` - Temporary file creation in static/ directory (race condition)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/check.js:20` - PhantomJS page.open() SSRF sink (loads user-controlled URL)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/check.js:8-18` - Alert/confirm/prompt dialog interception
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/constants.py:144` - XSS_CONTENT_IFRAME template with iframe injection point

## 9. XSS Sinks and Render Contexts

### HTML Attribute Context: Iframe Src Injection (CRITICAL)

**PRIMARY VULNERABILITY: Reflected XSS via Iframe Attribute Injection**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:71-75`

**Exact Code:**
```python
@app.route('/page')
def xss2():
    msg = request.args.get('url','')
    msg = re.sub(r'\"', "", msg)           # Line 67: Remove double quotes
    msg = re.sub(r"[<>]", "", msg)         # Line 68: Remove angle brackets  
    msg = re.sub(r'\b(?!(https?|file)://)\S+\.(?!(jpg|jpeg|png|gif|bmp|svg)\b)[^\s]*', "", msg, flags=re.IGNORECASE)  # Line 69
    
    value = 'src="{0}"'.format(msg)        # Line 71: Inject into src attribute
    return XSS_CONTENT_IFRAME.format("2", "Circle", value, result, "")  # Line 75
```

**Template Definition:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/constants.py:144`
```python
XSS_CONTENT_IFRAME = '''...
<iframe {2}></iframe>  # Template substitution point
...'''
```

**Input Source:** HTTP GET parameter `url` accessed via `request.args.get('url','')`

**Render Context:** HTML attribute context within an iframe tag. The user-controlled value is injected into the attribute list of `<iframe {2}>` where `{2}` is replaced with `src="<user_input>"`. This render context allows:
- **Event handler injection:** Attributes like `onload=alert(1)`, `onerror=alert(1)`, `onfocus=alert(1)`
- **JavaScript protocol exploitation:** `src=javascript:alert(1)` (though src attribute is prepended, making this specific vector challenging)
- **Additional attribute injection:** Since quotes are removed but the template adds them, breaking out of the src attribute is difficult, BUT the filter's weakness allows event handlers as separate attributes

**Current Sanitization Analysis:**
1. **Quote removal** (line 67): `re.sub(r'\"', "", msg)` removes double quotes, preventing trivial src attribute escape like `" onload=alert(1) junk="`
2. **Angle bracket removal** (line 68): `re.sub(r"[<>]", "", msg)` prevents HTML tag injection but is **irrelevant in attribute context** - XSS in attributes doesn't require `<` or `>`
3. **URL/extension filter** (line 69): Complex regex attempting to allow only image URLs, but:
   - Explicitly permits `file://` protocol (local file disclosure via PhantomJS)
   - Bypassable via URL fragments: `http://attacker.com/#.jpg`
   - Bypassable via query parameters: `http://attacker.com/?x=.jpg`
   - Does NOT prevent the primary XSS vector (event handlers)

**Exploitability: HIGH**

**Attack Vector 1: Event Handler Injection**
```
GET /page?url=x onload=alert(document.domain)
```
Resulting HTML: `<iframe src="x onload=alert(document.domain)"></iframe>`

Since the `src` attribute value contains a space, browsers parse `onload=alert(document.domain)` as a **separate attribute** on the iframe element, executing when the iframe loads.

**Attack Vector 2: JavaScript Protocol (Alternative)**
```
GET /page?url=javascript:alert(String.fromCharCode(88,83,83))
```
While the `src=` prefix complicates this, JavaScript protocol handlers in iframe src attributes execute in the context of the parent page in many browsers.

**Attack Vector 3: Data URI with Inline Script**
```
GET /page?url=data:text/html,<script>alert(1)</script>
```
Data URIs in iframe src attributes load the embedded content, though modern browsers isolate them to prevent parent page access. However, PhantomJS (old WebKit) may have less strict isolation.

**Successful Exploitation Indicator:** PhantomJS detects XSS success by intercepting `alert()`, `confirm()`, or `prompt()` dialogs (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/check.js:8-18`). When these are called with "XSS" as the message, the application returns the flag.

### Other XSS Sink Categories: NOT FOUND

**HTML Body Context Sinks:** NONE FOUND
- No `innerHTML`, `outerHTML`, `document.write()`, `document.writeln()`, `insertAdjacentHTML()`, or `createContextualFragment()` usage detected
- No jQuery sinks (`.html()`, `.append()`, `.prepend()`, `.replaceWith()`, `.wrap()`) - jQuery is not included in the application
- Application uses string-based HTML template generation rather than DOM manipulation, limiting body context sinks

**JavaScript Context Sinks:** NONE FOUND  
- No `eval()` calls in Python or JavaScript code
- No `Function()` constructor usage
- No `setTimeout()` or `setInterval()` with string arguments (PhantomJS uses these with function references only)
- No user input directly embedded in `<script>` tags - templates use hardcoded JavaScript only
- The check.js file (lines 1-48) contains no user-controllable script execution

**CSS Context Sinks:** NONE FOUND
- No `element.style` property manipulation with user input
- No user data embedded in `<style>` tags
- Static CSS files only (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/static/css/`)
- No CSS injection vectors detected

**URL Context Sinks:** NONE FOUND IN APPLICATION CODE
- No `location.href` assignment with user input
- No `window.location` manipulation
- No `window.open()`, `history.pushState()`, or `history.replaceState()` with user input
- The iframe src injection (primary vulnerability) is technically a URL context sink but classified under HTML Attribute Context above for clarity

**Template Injection Sinks:** NONE FOUND
- Templates are static Python string literals in `constants.py` (lines 1-205)
- No server-side template engines (Jinja2, Mako, Tornado) process user-supplied templates
- String formatting uses `.format()` with user input substituted into **attribute values** not template logic, preventing template injection
- No client-side template libraries (Handlebars, Mustache, Angular) detected

**SQL Injection Sinks:** NOT APPLICABLE
- No database layer exists (see Section 4)
- No SQL query construction anywhere in codebase

**Command Injection Sinks:** NONE FOUND (Secure Implementation)
- Subprocess execution at line 34 uses **command array syntax** preventing shell injection: `["timeout","5","phantomjs", "check.js"]`
- No `shell=True` parameter (secure)
- No user input in command arguments (user data passed via stdin, not argv)
- No `os.system()`, `os.popen()`, or `eval()` with user input

### Scope Compliance

All sinks reported above exist in **network-accessible endpoints** (`GET /page`). The analysis excluded:
- Build scripts (Dockerfile, Makefile) - not network-accessible
- PhantomJS script internals (check.js) - subprocess logic, not directly network-accessible
- Static CSS/image files - no executable code or input handling

## 10. SSRF Sinks

### Headless Browser Navigation: PhantomJS (CRITICAL SSRF)

**CRITICAL FINDING: Server-Side Request Forgery via PhantomJS Page Navigation**

**Primary SSRF Sink Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/check.js:20`

**Exact Code:**
```javascript
var page = webpage.create();
var input = system.stdin.readLine();  // Line 7: Read localhost URL from stdin
// ...
page.open(input, function(status) {   // Line 20: SSRF SINK - loads URL controlled by user
    // ... PhantomJS renders page server-side
});
```

**Complete Data Flow Chain:**

**1. Entry Point** - User supplies URL parameter:
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:66`
- **Code:** `msg = request.args.get('url','')`
- **User Control:** Full control over `url` parameter value

**2. Weak Validation** - Bypassable regex filtering:
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:67-69`
- **Code:**
  ```python
  msg = re.sub(r'\"', "", msg)  # Remove quotes
  msg = re.sub(r"[<>]", "", msg)  # Remove angle brackets
  msg = re.sub(r'\b(?!(https?|file)://)\S+\.(?!(jpg|jpeg|png|gif|bmp|svg)\b)[^\s]*', "", msg, flags=re.IGNORECASE)
  ```
- **Critical Weakness:** Explicitly **allows file:// protocol** (line 69), enabling local file access
- **Bypass:** URL fragments/query parameters defeat extension checking (e.g., `http://169.254.169.254/latest/meta-data/#.jpg`)

**3. HTML Embedding** - User input in iframe src:
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:71`
- **Code:** `value = 'src="{0}"'.format(msg)`  
- **Result:** User URL embedded in iframe that will be rendered by PhantomJS

**4. Temporary File Creation** - HTML written to web-accessible directory:
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:35-40`
- **Code:**
  ```python
  fn = "static/" + os.urandom(16).encode('hex') + '.html'
  url = 'http://localhost:5000/' + fn
  of = open(fn, 'w')
  of.write(page)  # page contains user-controlled iframe
  of.close()
  ```

**5. Subprocess Invocation** - PhantomJS launched:
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:34`
- **Code:** `proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)`
- **Timeout:** 5 seconds prevents hanging but allows time for SSRF

**6. Localhost URL Passed** - PhantomJS receives localhost URL:
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:43`
- **Code:** `(stdout, stderr) = proc.communicate(url + '\n')`
- **Value Passed:** `http://localhost:5000/static/[random].html`

**7. SSRF Execution** - PhantomJS loads localhost page, iframe fetches user URL:
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/check.js:20`  
- **Execution:** PhantomJS opens localhost HTML → Browser renders iframe → Iframe src loads user-controlled URL **server-side**
- **Network Context:** PhantomJS operates from localhost with no external firewall, can access internal networks and localhost services

### SSRF Attack Vectors and Exploitability

**Destination Control Level:** FULL - User controls entire URL including protocol, host, port, and path (subject to weak validation)

**Attack Vector 1: AWS Metadata Service Access (CRITICAL)**
```
GET /page?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/
GET /page?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/[role-name]
```
**Impact:** If deployed on AWS EC2, retrieves IAM role credentials including access keys, session tokens, and permissions. These credentials enable AWS API access with the instance's privilege level, potentially allowing S3 bucket access, EC2 control, or privilege escalation.

**Bypass:** `http://169.254.169.254/latest/meta-data/#.jpg` satisfies the extension filter

**Attack Vector 2: Internal Network Reconnaissance**
```
GET /page?url=http://10.0.0.1/
GET /page?url=http://192.168.1.1:8080/admin
GET /page?url=http://internal-api.company.local/
```
**Impact:** Discover internal services, admin panels, and API endpoints not exposed to the internet. PhantomJS renders responses, potentially revealing internal application structure, authentication pages, or sensitive data in HTML responses returned to the attacker.

**Attack Vector 3: Localhost Service Enumeration**
```
GET /page?url=http://localhost:3306/  # MySQL
GET /page?url=http://localhost:6379/  # Redis  
GET /page?url=http://localhost:5432/  # PostgreSQL
GET /page?url=http://127.0.0.1:8080/  # Local web services
```
**Impact:** Identify services running on the container/host, potential for database access if services lack authentication or have default credentials.

**Attack Vector 4: Local File Disclosure**
```
GET /page?url=file:///etc/passwd
GET /page?url=file:///app/secret.txt  # Flag file
GET /page?url=file:///proc/self/environ  # Environment variables
```
**Impact:** Read local files accessible to the PhantomJS process. While PhantomJS sandboxing may limit file access, reading application configuration, secrets, or system files is possible. The flag file (`/app/secret.txt` in container) may be directly accessible.

**Attack Vector 5: SSRF with Validation Bypass**
```
GET /page?url=http://internal.service/?x=.jpg
GET /page?url=http://169.254.169.254/latest/meta-data#.png  
```
**Impact:** Fragment identifiers and query parameters defeat the extension-based validation (line 69), allowing access to any HTTP endpoint while appearing to request an image.

### Current Validation Weaknesses

The input validation (lines 67-69) provides **insufficient SSRF protection**:
- ❌ **Allows dangerous protocols:** `file://` explicitly permitted
- ❌ **No IP address restrictions:** No blocking of private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) or metadata service (169.254.169.254)
- ❌ **No domain allowlist:** Any hostname accepted, including localhost, internal hostnames, and cloud metadata endpoints
- ❌ **Bypassable extension check:** URL fragments and query parameters satisfy regex without restricting actual destination
- ❌ **No protocol enforcement:** While regex checks for `http://` or `file://`, it doesn't restrict to HTTPS only or block file protocol
- ❌ **No port restrictions:** High ports (8080, 9200, etc.) accessible for targeting internal services

### Other SSRF Sink Categories: NOT FOUND

**HTTP Client Libraries:** NONE DETECTED
- No Python `requests` library usage (not in requirements.txt or imports)
- No `urllib`, `urllib2`, or `urllib3` imports in app.py
- No `http.client` or `httplib` usage
- No curl subprocess calls with user input

**Raw Socket Connections:** NONE DETECTED  
- No `socket.connect()` calls in Python code
- No raw TCP/UDP socket creation with user-controlled destinations

**URL Openers & File Includes:** NONE BEYOND PHANTOMJS
- No `open()` calls with URLs (only local file open for temporary file writing)
- No file inclusion mechanisms with external sources
- PhantomJS is the sole URL fetching mechanism

**Redirect Handlers:** NOT APPLICABLE
- Application does not perform redirects with user input
- No `Response.redirect()` or `return redirect()` with user-controlled destinations
- PhantomJS may auto-follow redirects (default WebKit behavior), extending SSRF reach

**Media Processors:** NONE DETECTED
- No ImageMagick, GraphicsMagick, or FFmpeg usage
- No image processing with URLs
- No PDF generation with URL inputs

**Webhook Testers & Callback Verifiers:** NONE DETECTED
- No "ping webhook" functionality
- No outbound callback verification systems
- No health check notification endpoints

**SSO/OIDC/JWKS Fetchers:** NOT APPLICABLE  
- No OAuth/OIDC implementation (see Section 3)
- No JWKS URL fetching
- No federation metadata retrieval

**Importers & Data Loaders:** NONE DETECTED
- No "import from URL" features
- No RSS/feed readers
- No remote configuration loaders

### Impact Assessment

**Confidentiality Impact: HIGH**
- AWS credentials exposure (if cloud-deployed)
- Internal API endpoint discovery
- Local file disclosure (configuration, secrets)
- Environment variable exposure

**Integrity Impact: LOW-MEDIUM**
- Potential for state-changing requests on internal services (POST to internal APIs)
- Limited by 5-second timeout and PhantomJS request capabilities

**Availability Impact: MEDIUM**
- DoS via resource exhaustion (forcing PhantomJS to load large resources)
- Timeout limits impact but repeated requests could degrade service

**Overall CVSS Score: 7.5 (HIGH) - CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N**

### Scope Compliance

The SSRF sink reported exists in the **network-accessible `/page` endpoint**. The analysis excluded:
- Build-time URL fetches (apt-get in Dockerfile) - not network-accessible at runtime
- Static file serving - no URL fetching, only local file serving
- Development tools - no CLI utilities performing HTTP requests

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-30T23:16:20.514Z