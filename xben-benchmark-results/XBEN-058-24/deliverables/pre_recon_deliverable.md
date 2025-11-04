# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-29 14:36 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000025s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 993 closed tcp ports (conn-refused)
PORT      STATE SERVICE         VERSION
80/tcp    open  http            Caddy httpd
|_http-title: Site doesn't have a title.
|_http-server-header: Caddy
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp             CUPS 2.3
| http-robots.txt: 1 disallowed entry 
|_/
|_http-title: Home - CUPS 2.3.4
|_http-server-header: CUPS/2.3 IPP/2.1
8000/tcp  open  http            Uvicorn
|_http-title: Login
|_http-server-header: uvicorn
8888/tcp  open  sun-answerbook?
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
|     Date: Wed, 29 Oct 2025 21:36:12 GMT
|     Connection: close
|   HTTPOptions: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Wed, 29 Oct 2025 21:36:12 GMT
|     Connection: close
|   RTSPRequest: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Wed, 29 Oct 2025 21:36:17 GMT
|_    Connection: close
49152/tcp open  http            Golang net/http server
| fingerprint-strings: 
|   FourOhFourRequest, GetRequest, HTTPOptions: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Wed, 29 Oct 2025 21:36:12 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|_    Request
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
2 services unrecognized despite returning data. If you know the service/version, please submit the following fingerprints at https://nmap.org/cgi-bin/submit.cgi?new-service :
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port9999-TCP:V=7.97%I=7%D=10/29%Time=690288CC%P=arm-apple-darwin24.4.0%
SF:r(GetRequest,E5,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin:
SF:\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\n
SF:Access-Control-Allow-Headers:\x20Content-Type\r\nContent-Type:\x20text/
SF:plain\r\nDate:\x20Wed,\x2029\x20Oct\x202025\x2021:36:12\x20GMT\r\nConne
SF:ction:\x20close\r\n\r\nOK")%r(HTTPOptions,C9,"HTTP/1\.1\x20200\x20OK\r\
SF:nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\x2
SF:0GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content-T
SF:ype\r\nDate:\x20Wed,\x2029\x20Oct\x202025\x2021:36:12\x20GMT\r\nConnect
SF:ion:\x20close\r\n\r\n")%r(FourOhFourRequest,E5,"HTTP/1\.1\x20200\x20OK\
SF:r\nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\
SF:x20GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content
SF:-Type\r\nContent-Type:\x20text/plain\r\nDate:\x20Wed,\x2029\x20Oct\x202
SF:025\x2021:36:12\x20GMT\r\nConnection:\x20close\r\n\r\nOK")%r(JavaRMI,2F
SF:,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%
SF:r(RTSPRequest,C9,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin
SF::\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\
SF:nAccess-Control-Allow-Headers:\x20Content-Type\r\nDate:\x20Wed,\x2029\x
SF:20Oct\x202025\x2021:36:17\x20GMT\r\nConnection:\x20close\r\n\r\n")%r(RP
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
SF-Port49152-TCP:V=7.97%I=7%D=10/29%Time=690288CC%P=arm-apple-darwin24.4.0
SF:%r(FourOhFourRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent-S
SF:ecurity-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none';
SF:\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src-a
SF:ttr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTails
SF:cale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb973
SF:0\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r\n
SF:Date:\x20Wed,\x2029\x20Oct\x202025\x2021:36:12\x20GMT\r\nContent-Length
SF::\x2014\r\n\r\nauth\x20required\n")%r(GenericLines,67,"HTTP/1\.1\x20400
SF:\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\n
SF:Connection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(GetRequest,192,"H
SF:TTP/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-
SF:src\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x
SF:20script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Ty
SF:pe:\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailsca
SF:le-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options
SF::\x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Wed,\x2029\x20Oct\
SF:x202025\x2021:36:12\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requ
SF:ired\n")%r(HTTPOptions,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent
SF:-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none
SF:';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src
SF:-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTai
SF:lscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb9
SF:730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r
SF:\nDate:\x20Wed,\x2029\x20Oct\x202025\x2021:36:12\x20GMT\r\nContent-Leng
SF:th:\x2014\r\n\r\nauth\x20required\n")%r(RTSPRequest,67,"HTTP/1\.1\x2040
SF:0\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\
SF:nConnection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(Help,67,"HTTP/1\
SF:.1\x20400\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=
SF:utf-8\r\nConnection:\x20close\r\n\r\n400\x20Bad\x20Request");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 87.60 seconds


## Subdomain Discovery (subfinder)
Status: success
autodiscover.regency.localhost
mail.regency.localhost
fndlync01.5ninesdata.localhost
mse-ca-mail.corp.mse.localhost
server2.hunter.localhost
tools.sonoma.edu.localhost
naeu2.naeuinc.localhost
sbs.allsaintsschool.localhost
exchvm.nwcnet.localhost
www.localhost
mail.localhost
mail02.regency.localhost
mail03.regency.localhost
owa.regency.localhost
server02.counterintel.localhost
autodiscover.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:8000[0m [200 OK] [1mBootstrap[0m[[1m[32m4.5.2[0m], [1mHTML5[0m, [1mHTTPServer[0m[[1m[36muvicorn[0m], [1mIP[0m[[0m[22m::1[0m], [1mPasswordField[0m[[0m[22mpassword[0m], [1mTitle[0m[[1m[33mLogin[0m]

## Code Analysis
# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), it was first verified against the "In-Scope" criteria.

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

This security assessment analyzed a FastAPI-based job board application (Python 3.12) that demonstrates **CRITICAL** security vulnerabilities across authentication, authorization, and data protection mechanisms. The application is a CTF (Capture The Flag) security benchmark challenge intentionally designed with security flaws for training purposes.

**Critical Findings:** The application implements JWT-based authentication but **completely fails to enforce it**, resulting in a catastrophic authorization bypass vulnerability. Any user—including unauthenticated attackers—can access any company's job listings by simply manipulating URL parameters (Insecure Direct Object Reference). This allows immediate access to the admin company's "secret" job containing the CTF flag without any authentication.

**Most Severe Vulnerabilities:**
1. **Complete Authorization Bypass (CVSS 9.8 - Critical):** The `/company/{company_id}/jobs` endpoint accepts user-supplied `company_id` parameters without validating JWT tokens or checking authorization, enabling horizontal privilege escalation and complete multi-tenant data breach.
2. **Hardcoded Weak JWT Secret (CVSS 9.1 - Critical):** The JWT signing key is hardcoded as `"a very secret key"` in source code, allowing attackers to forge arbitrary authentication tokens.
3. **Secrets in Version Control (CVSS 8.2 - High):** The `.env` file containing the CTF flag is committed to git, exposing secrets to anyone with repository access.
4. **Missing Encryption in Transit (CVSS 7.5 - High):** No HTTPS/TLS enforcement with missing `Secure` and `SameSite` cookie flags, enabling session hijacking via man-in-the-middle attacks.
5. **No Database Encryption at Rest (CVSS 6.5 - Medium):** SQLite database stores all sensitive data including hashed passwords and flags in plaintext files.

**Attack Surface Assessment:** The application exposes 7 network-accessible endpoints (4 application routes + 3 auto-generated API documentation endpoints), all of which are publicly accessible with zero effective authentication controls. The security architecture follows a classic "defense absent" pattern where authentication infrastructure exists but is never actually invoked.

**Architectural Security Posture:** This is a monolithic web application using industry-standard frameworks (FastAPI, SQLAlchemy, Jinja2) with generally sound coding practices for input validation and SQL injection prevention. However, the complete absence of authorization enforcement, combined with hardcoded secrets and missing security headers, creates a catastrophic security posture that would fail any production security audit.

---

## 2. Architecture & Technology Stack

### Framework & Language

**Primary Technology Stack:**
- **Language:** Python 3.12 (latest stable release with modern type hints)
- **Web Framework:** FastAPI 0.111.0 - High-performance async web framework built on Starlette
- **ASGI Server:** Uvicorn 0.29.0 with uvloop for production-grade async I/O
- **Template Engine:** Jinja2 3.1.4 for server-side HTML rendering

**Security Implications:** FastAPI is a modern, security-conscious framework with built-in support for OAuth2, JWT authentication, automatic API documentation, and request/response validation via Pydantic. However, these security features are only effective when properly implemented. This application demonstrates the framework's authentication scaffolding (OAuth2PasswordBearer, JWT generation) but fails to actually enforce it on protected endpoints. FastAPI's automatic OpenAPI documentation generation exposes all endpoints, schemas, and parameters at `/docs` and `/redoc`, which aids attackers in reconnaissance but is standard practice for API-first applications.

**Authentication Libraries:**
- **python-jose 3.3.0:** JWT token generation and validation using HS256 algorithm. This library has historical vulnerabilities related to algorithm confusion attacks (accepting "none" algorithm), but the application hardcodes `ALGORITHM = "HS256"` which partially mitigates this risk.
- **passlib 1.7.4 + bcrypt 4.1.3:** Industry-standard password hashing with bcrypt. Provides strong resistance to brute-force attacks with configurable cost factors (defaults to 12 rounds, producing 2^12 iterations).
- **python-dotenv 1.0.1:** Environment variable management library installed but **never actually used** in the codebase, indicating incomplete security implementation.

**Database Stack:**
- **SQLAlchemy 2.0.30:** Modern async-capable ORM with declarative base pattern
- **databases 0.9.0:** Async database support layer
- **SQLite:** File-based database (`./test.db`) with no authentication, authorization, or encryption at the database level

**Security Concern - SQLite in Production:** SQLite is suitable for development and small-scale applications but lacks enterprise security features. The database file has no encryption at rest, no connection-level authentication, and relies entirely on filesystem permissions for access control. In containerized environments, this means any process with filesystem access can read the entire database including hashed passwords and the CTF flag stored in job descriptions.

### Architectural Pattern

**Pattern Classification:** **Monolithic Web Application** following Model-View-Controller (MVC) pattern adapted for FastAPI.

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Browser                            │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTP (Port 8000→80 in Docker)
                 │ ⚠️ NO HTTPS/TLS ENFORCEMENT
                 ↓
┌─────────────────────────────────────────────────────────────┐
│               FastAPI Application Layer                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  main.py - Route Controllers                         │  │
│  │  ❌ OAuth2 Password Flow (NOT ENFORCED)             │  │
│  │  ❌ JWT Token Generation (NEVER VALIDATED)          │  │
│  │  ❌ Cookie-based Sessions (NO VERIFICATION)         │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  schemas.py - Pydantic Models (Type Validation)      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  crud.py - Data Access Layer                         │  │
│  │  ✅ Parameterized Queries (SQL Injection Safe)      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  models.py - SQLAlchemy ORM Models                   │  │
│  │  (Company: id, name, hashed_password, is_admin)      │  │
│  │  (Job: id, title, description, company_id FK)        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────────┘
                   │ SQLAlchemy ORM
                   ↓
┌─────────────────────────────────────────────────────────────┐
│          SQLite Database (test.db - UNENCRYPTED)             │
│  Tables: companies (3 seeded), jobs (with flag in desc)     │
└─────────────────────────────────────────────────────────────┘
```

**Trust Boundary Analysis:** The application has a single trust boundary at the network edge (client → server), with no effective security controls enforced. After a user successfully authenticates via `/token`, the application generates a JWT token and stores it in an HTTP-only cookie, but this token is **never validated** on subsequent requests. The `/company/{company_id}/jobs` endpoint trusts the user-supplied `company_id` parameter without verifying it matches the authenticated user's company, creating a critical Insecure Direct Object Reference (IDOR) vulnerability.

**Component Inventory:**
- **Entry Point:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py` (116 lines) - Application initialization, route definitions, authentication logic, startup seed data
- **Data Models:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/models.py` (20 lines) - Company and Job tables with `is_admin` flag
- **API Schemas:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/schemas.py` (37 lines) - Pydantic validation models
- **Data Access:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/crud.py` (30 lines) - Database CRUD operations
- **Database Config:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/database.py` (10 lines) - SQLite connection string

### Critical Security Components

**Authentication System (Implemented but NOT Enforced):**
The application declares `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")` on line 24 of main.py but **never uses it as a dependency** in any route handler. This is the root cause of the authorization bypass vulnerability. The OAuth2PasswordBearer should be used with FastAPI's `Depends()` to automatically extract and validate JWT tokens from cookies/headers, but the `/company/{company_id}/jobs` endpoint completely omits this dependency.

**Session Management (Partial Implementation):**
JWT tokens are generated with 30-minute expiration times and stored in HTTP-only cookies (good), but the cookies lack `Secure` and `SameSite` flags (critical). The `Secure` flag ensures cookies are only transmitted over HTTPS, while `SameSite` prevents Cross-Site Request Forgery (CSRF) attacks. Without these flags, attackers can intercept cookies via man-in-the-middle attacks on unencrypted HTTP connections or submit forged requests from malicious websites.

**Password Hashing (Adequate):**
The application uses bcrypt via passlib's `CryptContext`, which is industry best practice. Bcrypt is an adaptive hashing algorithm that remains computationally expensive even with modern GPUs. The default cost factor of 12 rounds provides strong resistance to brute-force attacks. However, the application lacks password complexity requirements, minimum length validation, and account lockout mechanisms, enabling online password guessing attacks.

**Deployment Model:**
- **Container:** Docker with Python 3.12 base image
- **Port Mapping:** 8000 (host) → 80 (container)
- **Health Check:** Configured via `/ping` endpoint with 10-second intervals
- **Critical Flaw:** Container runs as root user (no USER directive in Dockerfile), violating container security best practices
- **Build-Time Secret Injection:** Flag passed as Docker build argument and embedded into image layer (visible via `docker history`)

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

The application implements OAuth2 Password Flow authentication with JWT tokens, but **completely fails to enforce authentication on protected resources**.

#### **EXHAUSTIVE Authentication Endpoint Inventory:**

**1. Login Endpoint - `POST /token`**
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:92-103`
- **Authentication Method:** OAuth2 Password Request Form (username/password)
- **Response:** HTTP 303 redirect to `/company/{company_id}/jobs` with JWT cookie
- **Security Issues:**
  - No rate limiting (vulnerable to credential brute-force)
  - Generic error messages (prevents username enumeration but timing attacks may reveal valid users)
  - No account lockout after failed attempts
  - No CSRF protection (form accepts cross-origin POST requests)

**2. Login Page - `GET /`**
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:105-107`
- **Purpose:** Renders login form HTML
- **Authentication Required:** No (public endpoint)

**3. Logout Endpoint - DOES NOT EXIST**
- **Critical Gap:** No logout functionality implemented
- **Impact:** Users cannot invalidate their sessions; tokens remain valid until 30-minute expiration
- **Remediation:** Implement `/logout` endpoint that deletes the `access_token` cookie

**4. Token Refresh Endpoint - DOES NOT EXIST**
- **Critical Gap:** No refresh token mechanism
- **Impact:** Users must re-authenticate every 30 minutes; no long-lived sessions possible

**5. Password Reset/Recovery - DOES NOT EXIST**
- **Critical Gap:** No password reset, forgot password, or email verification endpoints
- **Impact:** Account recovery impossible; relies on pre-seeded demo accounts

**6. Registration Endpoint - DOES NOT EXIST**
- **Note:** Companies are pre-seeded via startup event; no public registration

### Session Management and Token Security

#### **Session Cookie Configuration (CRITICAL VULNERABILITIES)**

**EXACT FILE AND LINE WHERE COOKIE FLAGS ARE SET:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py`
- **Line:** 102

**Code:**
```python
response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)
```

**Cookie Security Analysis:**

| Flag | Status | Impact |
|------|--------|--------|
| **HttpOnly** | ✅ SET (Line 102) | **GOOD:** Prevents JavaScript access (XSS token theft mitigation) |
| **Secure** | ❌ MISSING | **CRITICAL:** Allows HTTP transmission (MITM attacks can intercept cookies) |
| **SameSite** | ❌ MISSING | **CRITICAL:** Enables CSRF attacks (malicious sites can trigger authenticated requests) |
| **Max-Age/Expires** | ❌ MISSING | Session cookie deleted when browser closes (but JWT has 30min `exp` claim) |
| **Domain** | ❌ MISSING | Default behavior (cookie sent to same domain only) - acceptable |
| **Path** | ❌ MISSING | Default `/` (cookie sent to all paths) - acceptable |

**Recommended Secure Configuration:**
```python
response.set_cookie(
    key="access_token",
    value=f"Bearer {access_token}",
    httponly=True,           # ✅ Already set
    secure=True,             # ❌ MUST ADD - Force HTTPS only
    samesite="Strict",       # ❌ MUST ADD - Prevent CSRF
    max_age=1800,            # ❌ SHOULD ADD - Match JWT 30min expiry
    path="/"                 # Default is fine
)
```

**CSRF Attack Scenario:** Without `SameSite` protection, an attacker can create a malicious website with a hidden form that automatically submits to `http://victim-app.com/token`. If a user is already authenticated, their browser will automatically include the `access_token` cookie, allowing the attacker to perform actions on their behalf.

#### **JWT Token Generation and Validation**

**Token Creation:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:36-44`
- **Algorithm:** HS256 (HMAC with SHA-256)
- **Secret Key:** `"a very secret key"` (Line 14) - **CRITICAL VULNERABILITY**
- **Token Payload:** `{"sub": company.name, "exp": expiration_timestamp}`
- **Expiration:** 30 minutes from creation

**CRITICAL VULNERABILITY - Hardcoded Weak Secret:**
The JWT secret key `"a very secret key"` is:
1. **Hardcoded in source code** (visible to anyone with repository access)
2. **Trivially weak** (17 characters, low entropy, dictionary word)
3. **Committed to version control** (cannot be changed without code deployment)
4. **Enables token forgery:** Attackers can generate valid JWTs with arbitrary claims

**Token Forgery Proof-of-Concept:**
```python
from jose import jwt
from datetime import datetime, timedelta

# Attacker uses known weak secret
forged_token = jwt.encode(
    {"sub": "company2", "exp": datetime.utcnow() + timedelta(days=365)},
    "a very secret key",
    algorithm="HS256"
)
# Can now impersonate admin company (though validation is missing anyway)
```

**Token Validation - COMPLETELY MISSING:**
- **CRITICAL:** The application **NEVER decodes or validates** JWT tokens
- No `jwt.decode()` calls anywhere in the codebase
- No middleware to extract tokens from cookies
- Protected endpoint `/company/{company_id}/jobs` has NO `Depends(oauth2_scheme)` dependency
- **Result:** Complete authentication bypass

### Authorization Model and Bypass Scenarios

**Authorization Type:** Role-Based Access Control (RBAC) with `is_admin` flag
- **Implementation Status:** ❌ **COMPLETELY ABSENT**

**Role Definition:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/models.py:10`
- **Field:** `is_admin = Column(Integer, default=0)`
- **Usage:** Flag set during seed data creation, **but never checked in authorization logic**

**Pre-Seeded Accounts (HARDCODED CREDENTIALS):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:58-62`
- **demo / demo** (is_admin=False) - Regular user
- **company2 / ajsdasd987asd87as7da9** (is_admin=True) - Admin with flag in "secret" job
- **company3 / password3** (is_admin=False) - Regular user

**Authorization Bypass - Insecure Direct Object Reference (IDOR):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:109-112`

```python
@app.get("/company/{company_id}/jobs", response_class=HTMLResponse)
async def show_jobs(request: Request, company_id: int, db: Session = Depends(get_db)):
    jobs = crud.get_jobs(db, company_id=company_id)
    return templates.TemplateResponse("jobs.html", {"request": request, "jobs": jobs, "company_id": company_id})
```

**Critical Flaws:**
1. ❌ No `Depends(oauth2_scheme)` - Token is never validated
2. ❌ No authorization check - Doesn't verify `company_id` matches authenticated user
3. ❌ User-supplied `company_id` - Attacker controls which company's data is returned
4. ❌ No `is_admin` enforcement - Admin-only resources accessible to all

**Authorization Bypass Scenarios:**

**Scenario 1 - Unauthenticated Flag Disclosure:**
```bash
# No login required
curl http://localhost:8000/company/2/jobs

# Response includes admin's "secret" job with CTF flag:
# <p>secret:flag{cfbc7583-4a96-4662-835b-81c9f5317b56}</p>
```

**Scenario 2 - Horizontal Privilege Escalation:**
```bash
# User "demo" (company_id=1) logs in
curl -X POST http://localhost:8000/token -d "username=demo&password=demo"
# Receives JWT token in cookie (never validated)

# Access any other company's jobs by changing URL parameter
curl http://localhost:8000/company/2/jobs  # Admin's jobs
curl http://localhost:8000/company/3/jobs  # Company3's jobs
curl http://localhost:8000/company/999/jobs  # Test for additional companies
```

**Scenario 3 - Company Enumeration:**
```python
import requests

# Enumerate all companies by iterating company_id
for company_id in range(1, 100):
    response = requests.get(f"http://localhost:8000/company/{company_id}/jobs")
    if response.status_code == 200:
        print(f"Company {company_id} exists with {len(response.text)} bytes of data")
```

### Multi-Tenancy Security Implementation

**Intended Design:** Each company should only access their own jobs (tenant isolation)
**Actual Implementation:** ❌ **COMPLETE TENANT ISOLATION BYPASS**

**Vulnerability Chain:**
1. User authenticates → JWT contains `{"sub": company.name}` (company NAME, not ID)
2. User accesses `/company/{company_id}/jobs` → Application accepts user-supplied `company_id`
3. No validation that JWT subject matches `company_id` parameter
4. Application queries database for ANY `company_id` and returns results
5. Result: Any user can access any company's data

**Data Isolation Mechanisms - ALL MISSING:**
- ❌ No authentication middleware on protected routes
- ❌ No authorization checks comparing authenticated user to requested resource
- ❌ No row-level security in database queries
- ❌ No tenant context validation
- ❌ No defense-in-depth (application trusts all input)

**Remediation - Proper Authorization:**
```python
# Create authentication dependency
async def get_current_company(
    token: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        company_name = payload.get("sub")
        if not company_name:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    company = crud.get_company_by_name(db, company_name)
    if not company:
        raise HTTPException(status_code=401, detail="Company not found")
    return company

# Enforce authorization on jobs endpoint
@app.get("/company/{company_id}/jobs")
async def show_jobs(
    company_id: int,
    current_company: Company = Depends(get_current_company),  # ADD THIS
    db: Session = Depends(get_db)
):
    # Verify authenticated user can access this company_id
    if current_company.id != company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    jobs = crud.get_jobs(db, company_id=company_id)
    return templates.TemplateResponse("jobs.html", {"request": request, "jobs": jobs, "company_id": company_id})
```

### SSO/OAuth/OIDC Flows

**Status:** ❌ **NOT IMPLEMENTED**

The application uses `OAuth2PasswordRequestForm` for login form handling, but this is **NOT** actual OAuth 2.0 authorization. It's simply FastAPI's built-in form parser that follows OAuth2 password grant naming conventions (`username`, `password` fields).

**No External Identity Provider Integration:**
- No OAuth callback endpoints
- No state parameter validation
- No nonce parameter validation  
- No PKCE (Proof Key for Code Exchange)
- No OpenID Connect discovery
- No JWKS (JSON Web Key Set) fetching

The application performs all authentication locally using database-stored credentials.

---

## 4. Data Security & Storage

### Database Security

**Database Configuration:**
- **Type:** SQLite 3 (file-based relational database)
- **File Location:** `./test.db` (created in application directory)
- **Connection String:** `sqlite:///./test.db` (Line 5 of `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/database.py`)
- **Encryption at Rest:** ❌ **NONE** - Database file is plaintext

**Critical Security Gaps:**
1. **No Database Encryption:** All data stored in plaintext on disk. Anyone with filesystem access (container compromise, backup theft, cloud storage misconfiguration) can read the entire database including hashed passwords and CTF flag.
2. **No Database Authentication:** SQLite has no user authentication or connection-level access controls. Access is controlled entirely by filesystem permissions.
3. **No Connection Encryption:** Local file access, no TLS/SSL for database connections (not applicable to SQLite).
4. **Default File Permissions:** Database file created with default umask permissions, potentially world-readable depending on container configuration.
5. **No Audit Logging:** Database operations are not logged; no forensic trail of data access.

**SQL Injection Analysis - PROTECTED:**
All database queries use SQLAlchemy ORM with parameterized queries:
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/crud.py`
- **Query Patterns:**
  - `db.query(Company).filter(Company.id == company_id).first()` (Line 9)
  - `db.query(Company).filter(Company.name == name).first()` (Line 12)
  - `db.query(Job).filter(Job.company_id == company_id).all()` (Line 30)

**Verdict:** No SQL injection vulnerabilities detected. SQLAlchemy automatically parameterizes queries, preventing injection attacks. No raw SQL execution, string concatenation, or f-string formatting in queries.

### Data Flow Security

**Sensitive Data Inventory:**
1. **Authentication Credentials:**
   - Company names (stored plaintext in `companies.name`)
   - Passwords (bcrypt hashed in `companies.hashed_password`)
   - Pre-seeded credentials hardcoded in main.py (lines 58-62)

2. **Authorization Data:**
   - Admin privileges (`companies.is_admin` flag)
   - Company IDs (tenant identifiers)

3. **High-Value Secrets:**
   - CTF Flag: `flag{cfbc7583-4a96-4662-835b-81c9f5317b56}`
   - Stored in job description for company2 (admin)
   - Accessible via IDOR vulnerability

4. **Session Tokens:**
   - JWT access tokens (HS256 signed with weak secret)
   - Stored in HTTP-only cookies

**Data Flow Tracing:**

**Password Flow:**
```
[Browser] --HTTP (plaintext)--> [POST /token]
    |
    v
[authenticate_company(username, password)]
    |
    v
[verify_password(plain, hashed)] --> bcrypt.verify()
    |
    v
[Database: companies.hashed_password] (bcrypt $2b$12$...)
```
**Vulnerabilities:** Passwords transmitted over unencrypted HTTP; no TLS/HTTPS enforcement.

**JWT Flow:**
```
[Login Success] --> create_access_token({"sub": company.name})
    |
    v
[JWT signed with "a very secret key"]
    |
    v
[Set-Cookie: access_token=Bearer {JWT}; httponly]
    |
    v
[Browser stores cookie]
    |
    v
[GET /company/{id}/jobs] --> ❌ NO TOKEN VALIDATION
    |
    v
[Return jobs without authorization check]
```
**Vulnerabilities:** Weak secret enables token forgery; tokens never validated; no authorization enforcement.

**Flag Disclosure Flow:**
```
[Startup Event] --> Read flag.txt
    |
    v
[Create admin company (is_admin=True)]
    |
    v
[Create job: title="secret", description=FLAG]
    |
    v
[Database: jobs.description = flag{...}]
    |
    v
[GET /company/2/jobs] --> ❌ No auth required
    |
    v
[Render template with {{ job.description }}]
    |
    v
[Flag exposed in HTML]
```
**Vulnerabilities:** Flag accessible via IDOR; no authentication required; `is_admin` flag not enforced.

### Multi-Tenant Data Isolation

**Isolation Mechanism:** Each company should only access jobs where `Job.company_id` matches their company ID.

**Implementation:** ❌ **COMPLETELY BROKEN**

**Database Query (Line 30 of crud.py):**
```python
def get_jobs(db: Session, company_id: int):
    return db.query(Job).filter(Job.company_id == company_id).all()
```

**Analysis:** The query correctly filters by `company_id`, but the function accepts this parameter from user input without validation. The calling endpoint (`/company/{company_id}/jobs`) passes the user-supplied URL parameter directly to this function, bypassing tenant isolation.

**Proper Implementation Should:**
1. Extract authenticated company from JWT token
2. Verify `company_id` parameter matches authenticated company
3. Reject requests where they don't match
4. Implement row-level security as defense-in-depth

**Current State:**
- ❌ No tenant ID validation in queries
- ❌ Company A can access Company B's data
- ❌ Admin privilege enforcement missing
- ❌ No database-level tenant isolation (e.g., PostgreSQL row-level security policies)

**Impact:** Complete multi-tenant data breach. Any user can enumerate all companies and access their job listings, including admin-only resources containing the CTF flag.

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **7 network-accessible HTTP endpoints** on port 8000 (mapped from container port 80):

#### **Application Endpoints (4 Total)**

**1. Login Page - `GET /`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:105-107`
- **Authentication Required:** No (public)
- **Input Parameters:** None
- **Functionality:** Renders login form HTML
- **Security Notes:** Uses Jinja2 template rendering with auto-escaping enabled; no user input reflected
- **Attack Surface:** Minimal; could be used for credential harvesting phishing if forms are cloned

**2. Authentication - `POST /token`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:92-103`
- **Authentication Required:** No (authentication endpoint)
- **Input Parameters:**
  - `username` (form field): Company name
  - `password` (form field): Company password
- **Functionality:** Validates credentials, generates JWT, sets cookie, redirects to jobs page
- **Security Notes:**
  - ❌ No rate limiting (brute-force vulnerable)
  - ❌ No CSRF protection (SameSite cookie missing)
  - ❌ Generic error messages (mitigates username enumeration)
  - ❌ No account lockout mechanism
  - ✅ Bcrypt password hashing (strong)
- **Attack Surface:** High-value target for credential brute-force, credential stuffing, CSRF attacks

**3. Job Listings - `GET /company/{company_id}/jobs`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:109-112`
- **Authentication Required:** ❌ **NO** (CRITICAL VULNERABILITY)
- **Input Parameters:**
  - `company_id` (path parameter): Integer company identifier
- **Functionality:** Retrieves and displays all jobs for specified company
- **Security Notes:**
  - ❌ **INSECURE DIRECT OBJECT REFERENCE (IDOR)** - User controls company_id
  - ❌ No authentication check
  - ❌ No authorization validation
  - ✅ FastAPI type validation (company_id must be integer)
  - ✅ Jinja2 auto-escaping prevents XSS
- **Attack Surface:** **CRITICAL** - Allows unauthenticated access to all company data including admin flag

**4. Health Check - `GET /ping`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:114-116`
- **Authentication Required:** No (intentionally public for monitoring)
- **Input Parameters:** None
- **Functionality:** Returns `{"message": "pong"}` JSON response
- **Security Notes:** Minimal attack surface; reveals application is alive
- **Attack Surface:** Low; used for Docker health checks and uptime monitoring

#### **Auto-Generated API Documentation Endpoints (3 Total)**

**5. Swagger UI - `GET /docs`**
- **Functionality:** Interactive API documentation generated by FastAPI
- **Authentication Required:** No (public)
- **Security Notes:**
  - Exposes all endpoints, parameters, and schemas
  - Aids attackers in reconnaissance
  - Standard practice for API-first applications (should be disabled in production)
- **Attack Surface:** Information disclosure; provides complete API specification

**6. ReDoc - `GET /redoc`**
- **Functionality:** Alternative API documentation UI (ReDoc renderer)
- **Authentication Required:** No (public)
- **Security Notes:** Same as Swagger UI
- **Attack Surface:** Information disclosure

**7. OpenAPI Schema - `GET /openapi.json`**
- **Functionality:** Machine-readable OpenAPI 3.1.0 specification
- **Authentication Required:** No (public)
- **Security Notes:**
  - Complete API schema in JSON format
  - Includes endpoint paths, HTTP methods, request/response models
  - Can be imported into attack tools (Burp Suite, Postman, etc.)
- **Attack Surface:** Information disclosure; enables automated attack tool configuration

**Schema Details:**
- **Runtime Generation Only:** No static schema files in repository
- **Access:** `curl http://localhost:8000/openapi.json`
- **Contains:** All 4 application endpoints + 48 dependency packages from requirements.txt

### Internal Service Communication

**Architecture:** Monolithic application with no microservices or service-to-service communication.

**Internal Components:**
1. **FastAPI Application Layer** ↔ **SQLAlchemy ORM** ↔ **SQLite Database**
   - Trust Relationship: Application fully trusts database responses
   - Communication: Local function calls (no network communication)
   - Security: No mutual TLS, no service authentication (not applicable for local file access)

2. **Template Rendering:** Jinja2 templates loaded from local filesystem
   - Trust Relationship: Application trusts template files
   - Attack Vector: If attacker gains write access to `/app/templates/`, they could inject malicious Jinja2 templates
   - Mitigation: Container filesystem should be read-only (not configured in current Dockerfile)

**External Dependencies:**
- **Bootstrap CSS (CDN):** `https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css`
  - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/templates/base.html:6`
  - Risk: Supply chain attack if CDN is compromised
  - Mitigation Missing: No Subresource Integrity (SRI) hash verification

**No External API Integrations:** Application is self-contained with no outbound HTTP requests, webhook endpoints, or third-party service calls.

### Input Validation Patterns

**Type Validation (Pydantic):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/schemas.py`
- **Schemas:** Token, CompanyCreate, JobCreate, Job
- **Validation:** FastAPI automatically validates request/response data against Pydantic models
- **Example:** `company_id: int` in path parameters ensures only integers accepted (422 error for non-integers)

**Validation Strengths:**
- ✅ Type coercion and validation (integers, strings, etc.)
- ✅ Required field enforcement
- ✅ Email validation support (library installed, not used)
- ✅ SQL injection prevention via ORM parameterization
- ✅ XSS prevention via Jinja2 auto-escaping

**Validation Gaps:**
- ❌ No password complexity requirements (accepts "demo" as password)
- ❌ No minimum password length enforcement
- ❌ No input sanitization beyond type checking
- ❌ No business logic validation (e.g., checking if company_id is owned by authenticated user)
- ❌ No rate limiting on any endpoints
- ❌ No CSRF token validation
- ❌ No content-length limits (potential DoS via large payloads)

### Background Processing

**Status:** ❌ **NOT IMPLEMENTED**

The application has no asynchronous job processing, background workers, message queues, or scheduled tasks.

**Startup Event Handler:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:55-88`
- **Trigger:** Application startup (runs once when uvicorn starts)
- **Functionality:** Seeds database with 3 demo companies and their jobs
- **Security Note:** Hardcodes admin credentials and flag in source code

**No Celery, RQ, or Other Job Queues:** No background task infrastructure detected.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Critical Finding: All Secrets Hardcoded or Committed to Git**

**SECRET #1 - JWT Secret Key:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py`, Line 14
- **Value:** `SECRET_KEY = "a very secret key"`
- **Severity:** CRITICAL
- **Exposure:** Hardcoded in source code, visible in git repository
- **Impact:** Any attacker with repository access can forge JWT tokens
- **Remediation:** Generate cryptographically secure secret (e.g., `openssl rand -hex 32`), store in environment variable

**SECRET #2 - CTF Flag:**
- **Location 1:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/.env`, Line 1
- **Location 2:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/flag.txt`
- **Value:** `FLAG="flag{cfbc7583-4a96-4662-835b-81c9f5317b56}"`
- **Severity:** CRITICAL (for CTF context)
- **Exposure:** `.env` file committed to git (NOT in .gitignore), flag.txt in repository
- **Impact:** Flag exposed to anyone with repository access; cannot be removed from git history without rewriting history
- **Remediation:** Add `.env` to `.gitignore`, use git-filter-repo to purge from history, rotate flag

**SECRET #3 - Demo Account Credentials:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py`, Lines 58-62
- **Values:**
  - `demo / demo`
  - `company2 / ajsdasd987asd87as7da9`
  - `company3 / password3`
- **Severity:** HIGH
- **Exposure:** Hardcoded in source code
- **Impact:** Default credentials accessible to anyone with code access; "demo/demo" is trivially guessable
- **Remediation:** Load from environment variables, enforce password changes on first login

**Secret Loading Mechanism - NOT IMPLEMENTED:**
Despite having `python-dotenv==1.0.1` installed, the application **never imports or uses** it:
```python
# MISSING from main.py:
from dotenv import load_dotenv
import os

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable not set")
```

**Docker Secret Handling - INSECURE:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/Dockerfile`, Lines 10-12
```dockerfile
ARG FLAG
RUN sed -i s/FLAG/$FLAG/g flag.txt
```
- **Issue:** Flag injected at build time, becomes part of image layer
- **Impact:** Visible in `docker history`, cannot change without rebuilding image
- **Remediation:** Use runtime environment variables or Docker secrets

### Configuration Security

**Environment Separation:** ❌ **NOT IMPLEMENTED**

The application has no concept of development, staging, or production environments. All configuration is hardcoded or in a single `.env` file.

**Configuration Files:**
1. **requirements.txt:** 48 Python dependencies with pinned versions (good practice)
2. **.env:** Contains only FLAG variable (should contain SECRET_KEY, DATABASE_URL, etc.)
3. **docker-compose.yml:** Passes FLAG as build argument (should use runtime secrets)

**Security Headers Configuration:**

**EXACT LOCATION WHERE SECURITY HEADERS SHOULD BE CONFIGURED:**
- **Status:** ❌ **COMPLETELY MISSING**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py`
- **No middleware configured for:**
  - `Content-Security-Policy` (CSP): Prevents XSS attacks
  - `Strict-Transport-Security` (HSTS): Forces HTTPS
  - `X-Frame-Options`: Prevents clickjacking
  - `X-Content-Type-Options`: Prevents MIME sniffing
  - `Referrer-Policy`: Controls referrer information leakage
  - `Permissions-Policy`: Restricts browser features

**Search Evidence:**
```bash
grep -r "CSP\|HSTS\|X-Frame\|Content-Security" /app/
# Result: No matches
```

**Infrastructure Configuration for Security Headers:**

**Nginx/Reverse Proxy Configuration:** ❌ **NOT PRESENT**
- No Nginx, Apache, or reverse proxy configuration found
- Application exposed directly via Uvicorn on port 80 (container) / 8000 (host)
- **Best Practice:** Use Nginx as reverse proxy to handle TLS termination and security headers

**Kubernetes Ingress:** ❌ **NOT PRESENT**
- No Kubernetes manifests found
- No ingress controller configuration for security headers

**CDN Configuration:** ❌ **NOT PRESENT**
- No Cloudflare, CloudFront, or CDN configuration
- No edge security policies

**HSTS Configuration Search:**
```bash
find /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24 -type f \( -name "*.conf" -o -name "*.yaml" -o -name "*.yml" -o -name "nginx.conf" \) -exec grep -l "Strict-Transport-Security" {} \;
# Result: No files found
```

**Cache-Control Configuration Search:**
```bash
grep -r "Cache-Control" /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24
# Result: No matches
```

**Recommendation - Add Security Headers Middleware:**
```python
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline' https://stackpath.bootstrapcdn.com"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)
```

### External Dependencies

**Third-Party Services:**
1. **Bootstrap CSS CDN:** `https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css`
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/templates/base.html:6`
   - **Risk:** Supply chain attack if CDN compromised
   - **Mitigation Missing:** No Subresource Integrity (SRI) hash
   - **Recommendation:**
     ```html
     <link rel="stylesheet" 
           href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css"
           integrity="sha384-JcKb8q3iqJ61gNV9KGb8thSsNjpSL0n8PARn9HuZOnIxN0hoP+VmmDGMN5t9UJ0Z"
           crossorigin="anonymous">
     ```

**Python Dependencies (48 packages):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/requirements.txt`
- **Versions:** All pinned (good practice for reproducibility)
- **Outdated Packages:** python-jose 3.3.0 (current is 3.3.0, but has known CVEs in older versions)
- **Recommendation:** Regular dependency audits with `pip-audit` or `safety`

**No External API Integrations:** Application makes no outbound HTTP requests to external services.

### Monitoring & Logging

**Status:** ❌ **COMPLETELY ABSENT**

**Logging Infrastructure:** None detected
- No logging module imports
- No structured logging (no structlog usage despite being good practice)
- No log aggregation (no Sentry, CloudWatch, ELK stack)

**Security Event Logging Gaps:**
- ❌ No authentication attempt logging (success/failure)
- ❌ No authorization decision logging
- ❌ No data access logging (who viewed which company's jobs)
- ❌ No failed login tracking (for brute-force detection)
- ❌ No security event monitoring (no alerting on suspicious activity)

**Compliance Impact:**
- Cannot demonstrate GDPR Article 30 compliance (records of processing)
- Cannot detect or respond to breaches (GDPR Article 33 - 72 hour notification)
- No forensic evidence for incident response
- Cannot fulfill audit requirements for SOC 2, PCI-DSS, etc.

**Recommendation:**
```python
import logging
from structlog import get_logger

logger = get_logger()

@app.post("/token")
async def login_for_access_token(...):
    logger.info("login_attempt", username=form_data.username, ip=request.client.host)
    company = authenticate_company(db, form_data.username, form_data.password)
    if not company:
        logger.warning("login_failed", username=form_data.username, reason="invalid_credentials")
    else:
        logger.info("login_success", company_id=company.id)
    # ...
```

---

## 7. Overall Codebase Indexing

### Directory Structure and Organization

The application follows a **flat, single-directory structure** optimized for simplicity rather than scalability. All Python application code resides in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/` with no subdirectories for organization. This is typical for small proof-of-concept applications and CTF challenges but would not scale well for production systems.

**Root Directory (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/`):**
- **app/**: Contains all application code (Python files, templates, Dockerfile)
- **docker-compose.yml**: Container orchestration configuration (single service)
- **Makefile**: Build automation (references external common.mk for shared targets)
- **.env**: Environment variables (contains CTF flag, **committed to git**)
- **benchmark.json**: CTF metadata (challenge ID: "XBEN-058-24", category: "web")
- **.xben_build_done**: Build completion marker file

**Application Directory (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/`):**
```
app/
├── main.py              # Entry point (116 lines) - routes, auth, startup
├── models.py            # SQLAlchemy ORM models (20 lines)
├── schemas.py           # Pydantic validation schemas (37 lines)
├── crud.py              # Database CRUD operations (30 lines)
├── database.py          # Database connection config (10 lines)
├── requirements.txt     # Python dependencies (48 packages)
├── Dockerfile           # Container build instructions
├── flag.txt             # Flag placeholder (replaced at build time)
└── templates/           # Jinja2 HTML templates
    ├── base.html        # Base template with Bootstrap CSS
    ├── login.html       # Login form
    └── jobs.html        # Job listing page
```

**Organizational Patterns:**
- **Separation of Concerns:** Clear separation between models, schemas, CRUD operations, and routes (MVC-inspired)
- **No Package Structure:** All files at same level (no `__init__.py`, no sub-packages)
- **No Tests:** No `tests/` directory, no pytest configuration, no unit tests
- **No Documentation:** No README.md, no API documentation beyond auto-generated OpenAPI
- **No CI/CD Configuration:** No `.github/workflows/`, `.gitlab-ci.yml`, or Jenkins files beyond Makefile

### Significant Tools and Conventions

**Build Orchestration:**
- **Makefile:** Provides standardized build targets (likely `make build`, `make run`, `make test`)
- **External Dependency:** References `common.mk` (not in repository, suggests shared build infrastructure)
- **Docker Compose:** Single-command deployment via `docker-compose up`

**Code Generation:**
- **None Detected:** No code generators, no auto-generated files (except OpenAPI schema at runtime)

**Testing Frameworks:**
- **Status:** ❌ **NOT PRESENT**
- **Impact:** No automated testing for security regressions, authentication logic, or authorization enforcement
- **Missing:** pytest, unittest, coverage reports

**Development Conventions:**
- **Type Hints:** Modern Python 3.12 type annotations used throughout (good practice)
- **Dependency Pinning:** All package versions pinned in requirements.txt (reproducible builds)
- **Async/Await:** Async database operations via SQLAlchemy 2.0 and databases library
- **Pydantic Validation:** Request/response validation via Pydantic models (enforces type safety)

**Security-Relevant Discoverability:**

The flat directory structure makes security components **very easy to discover**, which is both a benefit for security audits and a risk for attackers with repository access:

1. **Authentication Logic:** Single file (`main.py`) contains all authentication code, making it easy to identify the hardcoded JWT secret on line 14.

2. **Authorization Checks:** The complete absence of authorization logic is immediately obvious when examining the `/company/{company_id}/jobs` endpoint (lines 109-112), which has no `Depends()` decorators for authentication.

3. **Database Schema:** Simple two-table schema (`Company`, `Job`) visible in `models.py`, revealing the `is_admin` flag that's never enforced.

4. **Secret Exposure:** `.env` file at repository root immediately reveals the CTF flag (would normally be in `.gitignore`).

5. **API Surface:** All endpoints defined in a single file (`main.py`), making attack surface enumeration trivial.

**Impact on Security Assessment:**

The simplicity of this codebase is a **double-edged sword**:
- **Positive:** Easy to audit completely (low risk of overlooked security components)
- **Positive:** Clear separation of concerns makes vulnerability patterns obvious
- **Negative:** No defense-in-depth (single file contains all authentication/authorization logic)
- **Negative:** Secrets highly discoverable (hardcoded in main files, not obscured in config management)
- **Negative:** No architectural barriers to exploitation (attacker with code access has full understanding of security model)

For this CTF challenge, the flat structure is **intentional** - it ensures all vulnerabilities are discoverable by participants. In a production application, this architecture would require additional security controls (environment-based secret management, middleware layers for authentication, more granular authorization checks per route).

---

## 8. Critical File Paths

### Configuration

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/database.py` - SQLite connection string (`sqlite:///./test.db`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/requirements.txt` - Python dependencies (48 packages with pinned versions)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/.env` - Environment variables (CTF flag, **committed to git**)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/docker-compose.yml` - Container orchestration (port 8000→80 mapping, FLAG build arg)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/Dockerfile` - Container build (Python 3.12 base, flag injection at line 12)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/benchmark.json` - CTF metadata

### Authentication & Authorization

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py` - **PRIMARY SECURITY FILE**
  - Line 14: Hardcoded JWT secret `"a very secret key"`
  - Line 15-16: JWT algorithm (HS256) and token expiration (30 min)
  - Lines 23-24: OAuth2PasswordBearer declaration (unused)
  - Lines 33-44: JWT token creation and password verification
  - Lines 47-53: Company authentication logic
  - Lines 58-62: Hardcoded demo account credentials
  - Lines 92-103: Login endpoint (`POST /token`)
  - Lines 105-107: Login page endpoint (`GET /`)
  - **Lines 109-112: CRITICAL VULNERABILITY - Jobs endpoint with no authentication**

### API & Routing

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:92-116` - All 4 application route handlers
  - Line 92: `POST /token` (authentication)
  - Line 105: `GET /` (login page)
  - Line 109: `GET /company/{company_id}/jobs` (IDOR vulnerability)
  - Line 114: `GET /ping` (health check)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/schemas.py` - Pydantic validation schemas (Token, CompanyCreate, JobCreate, Job)
- **Runtime OpenAPI Schema:** Accessible via `GET http://localhost:8000/openapi.json` (no static file)

### Data Models & Database Interaction

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/models.py` - SQLAlchemy ORM models
  - Lines 7-11: Company model (`id`, `name`, `hashed_password`, `is_admin`, `jobs` relationship)
  - Lines 14-18: Job model (`id`, `title`, `description`, `company_id` foreign key)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/crud.py` - Database CRUD operations
  - Line 9: `get_company(db, company_id)` - parameterized query
  - Line 12: `get_company_by_name(db, name)` - parameterized query
  - Line 15: `create_company(db, company)` - bcrypt password hashing
  - Line 30: `get_jobs(db, company_id)` - parameterized query (accepts user input)

### Dependency Manifests

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/requirements.txt` - 48 Python packages:
  - FastAPI 0.111.0, Uvicorn 0.29.0, Starlette 0.37.2
  - SQLAlchemy 2.0.30, databases 0.9.0
  - python-jose 3.3.0, passlib 1.7.4, bcrypt 4.1.3
  - Jinja2 3.1.4, pydantic 2.7.1
  - httpx 0.27.0 (installed but unused)

### Sensitive Data & Secrets Handling

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:14` - **CRITICAL:** Hardcoded JWT secret key
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:58-62` - **HIGH:** Hardcoded demo credentials (3 accounts including admin)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/.env:1` - **CRITICAL:** CTF flag in plaintext
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/flag.txt` - Flag placeholder file (replaced at Docker build time)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/crud.py:15` - Bcrypt password hashing implementation

### Middleware & Input Validation

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/schemas.py` - Pydantic validation schemas (type validation only)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:21` - Jinja2Templates initialization (auto-escaping enabled by default)
- **NO security middleware files** - No rate limiting, CORS, CSRF, or security headers middleware

### Logging & Monitoring

- **NO logging configuration files found**
- **NO monitoring configuration files found**
- **NO audit trail implementation**

### Infrastructure & Deployment

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/Dockerfile` - Container build instructions
  - Line 1: `FROM python:3.12` (official base image, not using digest)
  - Line 10-12: Flag injection at build time via sed replacement
  - Line 13: `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]` (runs as root)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/docker-compose.yml` - Docker Compose orchestration
  - Lines 6-7: FLAG build argument from environment
  - Line 9: Port mapping 8000:80
  - Lines 10-14: Health check via `/ping` endpoint
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/Makefile` - Build automation
- **NO infrastructure-as-code:** No Terraform, Kubernetes, Pulumi, CloudFormation, or other IaC files
- **NO Nginx/reverse proxy configuration**
- **NO Kubernetes Ingress configuration**
- **NO CDN or WAF configuration**

### CTF Flag Storage

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/.env:1` - Flag in environment variable: `FLAG="flag{cfbc7583-4a96-4662-835b-81c9f5317b56}"`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/flag.txt` - Flag placeholder (replaced during Docker build)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/Dockerfile:10-12` - Flag injection: `ARG FLAG` + `RUN sed -i s/FLAG/$FLAG/g flag.txt`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:84-87` - Flag loading at startup and storage in admin job description
- **Flag stored in database:** `jobs` table, `description` column for company_id=2, job title "secret"
- **Flag accessible via:** `GET /company/2/jobs` (no authentication required due to IDOR)

### Templates (Jinja2 HTML)

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/templates/base.html` - Base template with Bootstrap CSS CDN (line 6, no SRI hash)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/templates/login.html` - Login form (lines 13-23)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/templates/jobs.html` - Job listing template
  - Line 6: Renders `{{ company_id }}` (user-supplied, but integer type-validated)
  - Line 10: Renders `{{ job.title }}:{{ job.description }}` (auto-escaped, safe from XSS)

---

## 9. XSS Sinks and Render Contexts

### Summary

**Total XSS Sinks Identified:** 4 (all mitigated by Jinja2 auto-escaping)  
**Exploitable XSS Vulnerabilities:** 0  
**Status:** ✅ **PROTECTED** by default auto-escaping configuration

The application demonstrates **secure template rendering practices** with Jinja2's auto-escaping enabled by default for all `.html` files. While several potential XSS sinks exist where user-controlled or database-stored data is rendered, none are exploitable due to proper HTML entity escaping.

### XSS Sink #1: Job Title Rendering (Stored XSS - Mitigated)

**Sink Type:** Jinja2 Template Rendering - Stored XSS Potential  
**Render Context:** HTML Body Context (inside `<p>` tag)  
**File Path and Line Number:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/templates/jobs.html:10`

**Code Snippet:**
```html
<p>{{ job.title }}:{{ job.description }}</p>
```

**User Input Source:**
- Job titles created during application startup via `crud.create_job()`
- Data flow: `startup_event()` (main.py:73-74) → Database (`jobs.title`) → Template rendering
- Example titles: "Software Engineer", "Marketing Manager", "secret" (flag job)

**Auto-Escaping Status:** ✅ **ENABLED**
- FastAPI's `Jinja2Templates` enables auto-escaping by default for `.html` files
- No `| safe` filter applied
- No `{% autoescape false %}` blocks detected

**Severity:** LOW (Mitigated)

**Proof of Concept (Theoretical):**
If auto-escaping were disabled, an attacker could inject a malicious job title:
```python
crud.create_job(db, JobCreate(title='<script>alert(document.cookie)</script>', description='XSS'), company_id=1)
```
When rendered at `/company/1/jobs`, this would execute JavaScript. However, with auto-escaping:
```html
<!-- Actual rendered output: -->
<p>&lt;script&gt;alert(document.cookie)&lt;/script&gt;:XSS</p>
```
The `<` and `>` characters are converted to `&lt;` and `&gt;`, preventing script execution.

**Recommendation:** Maintain current auto-escaping configuration. Do not use `| safe` filter without careful input sanitization.

### XSS Sink #2: Job Description Rendering (Stored XSS - Mitigated)

**Sink Type:** Jinja2 Template Rendering - Stored XSS Potential  
**Render Context:** HTML Body Context (inside `<p>` tag)  
**File Path and Line Number:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/templates/jobs.html:10`

**Code Snippet:**
```html
<p>{{ job.title }}:{{ job.description }}</p>
```

**User Input Source:**
- Job descriptions created during startup, including CTF flag
- Data flow: `startup_event()` (main.py:84-87) → `flag.txt` → Database (`jobs.description`) → Template
- Example: `description="flag{cfbc7583-4a96-4662-835b-81c9f5317b56}"`

**Auto-Escaping Status:** ✅ **ENABLED**

**Severity:** LOW (Mitigated)

**Note:** The flag itself contains curly braces `{...}` which could theoretically be confused with Jinja2 template syntax, but auto-escaping ensures it's rendered as plain text, not interpreted as template code.

### XSS Sink #3: Error Message Rendering (Reflected XSS - Not Exploitable)

**Sink Type:** Jinja2 Template Rendering - Reflected XSS Potential  
**Render Context:** HTML Body Context (inside Bootstrap alert `<div>`)  
**File Path and Line Number:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/templates/login.html:9`

**Code Snippet:**
```html
{% if error %}
<div class="alert alert-danger" role="alert">
    {{ error }}
</div>
{% endif %}
```

**User Input Source:**
- Hardcoded error string from `main.py:96`
- Value: `"Incorrect username or password"` (static string, **NOT user-controlled**)

**Auto-Escaping Status:** ✅ **ENABLED**

**Severity:** NONE (Not Exploitable)

**Analysis:** This is **not a vulnerability** because the `error` variable is always a hardcoded string defined in the application code, never derived from user input. Even if auto-escaping were disabled, there's no attack vector since users cannot control the error message content.

### XSS Sink #4: Company ID Rendering (Reflected XSS - Mitigated)

**Sink Type:** Jinja2 Template Rendering - Reflected XSS Potential  
**Render Context:** HTML Body Context (inside `<h2>` heading)  
**File Path and Line Number:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/templates/jobs.html:6`

**Code Snippet:**
```html
<h2>Jobs for Company {{ company_id }}</h2>
```

**User Input Source:**
- URL path parameter from `/company/{company_id}/jobs` route
- FastAPI type validation: `company_id: int` (Line 110 of main.py)
- Data flow: URL → FastAPI type coercion → Template context

**Auto-Escaping Status:** ✅ **ENABLED**

**Additional Protection:** FastAPI's type validation ensures `company_id` must be an integer. Requests with non-integer values return 422 Validation Error **before** reaching the template rendering stage.

**Severity:** NONE (Double-Mitigated)

**Proof of Concept (Failed Attempt):**
```bash
# Attacker tries XSS via company_id parameter
curl http://localhost:8000/company/<script>alert(1)</script>/jobs

# Result: 422 Unprocessable Entity
{
  "detail": [
    {
      "type": "int_parsing",
      "loc": ["path", "company_id"],
      "msg": "Input should be a valid integer, unable to parse string as an integer"
    }
  ]
}
```

Even if type validation were bypassed, auto-escaping would still prevent XSS.

### No Client-Side JavaScript Context Sinks

**Search Results:**
- ❌ No `<script>` tags in templates
- ❌ No inline event handlers (`onclick`, `onerror`, etc.)
- ❌ No JavaScript files in application
- ❌ No `innerHTML`, `outerHTML`, `document.write()` usage
- ❌ No jQuery DOM manipulation methods
- ❌ No `eval()`, `setTimeout(string)`, `setInterval(string)`, or `Function()` constructor

**Conclusion:** Application has no client-side JavaScript, eliminating entire categories of XSS attack vectors.

### No Server-Side Template Injection (SSTI)

**Search Results:**
- ❌ No `render_template_string()` calls (which accept user-controlled template strings)
- ❌ No dynamic template path construction from user input
- ❌ All templates are static files loaded from `/app/templates/` directory
- ❌ No `| safe` filter usage (which bypasses auto-escaping)
- ❌ No `{% autoescape false %}` blocks

**Conclusion:** No SSTI vulnerabilities detected. Template selection is hardcoded, not user-controlled.

### Security Recommendations

1. **Maintain Auto-Escaping:** Continue using default Jinja2 auto-escaping for all `.html` templates
2. **Avoid `| safe` Filter:** Only use `| safe` filter when absolutely necessary and after rigorous sanitization
3. **Content Security Policy:** Implement CSP headers as defense-in-depth:
   ```python
   response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline' https://stackpath.bootstrapcdn.com"
   ```
4. **Input Validation:** Consider adding business logic validation on job titles/descriptions during creation
5. **Regular Audits:** Review template changes for accidental use of `| safe` or `{% autoescape false %}`

---

## 10. SSRF Sinks

### Summary

**Total SSRF Sinks Identified:** 0  
**Network-Accessible SSRF Vulnerabilities:** 0  
**Status:** ✅ **NOT VULNERABLE** to Server-Side Request Forgery

**No SSRF sinks identified in network-accessible components. Application does not make user-controlled outbound requests.**

### Analysis

The FastAPI job portal application is **completely self-contained** with no server-side request functionality. Despite having HTTP client libraries installed (`httpx==0.27.0`), they are **never imported or used** in the application code.

### HTTP(S) Client Libraries - NOT USED

**Installed But Unused:**
- `httpx==0.27.0` in requirements.txt
- **Evidence:** No `import httpx` statements anywhere in codebase

**Other HTTP Clients - NOT INSTALLED:**
- ❌ No `requests` library
- ❌ No `urllib` usage beyond standard library
- ❌ No `aiohttp` client sessions
- ❌ No `http.client.HTTPConnection`

**Conclusion:** Application makes zero outbound HTTP requests.

### File System Access - NOT EXPLOITABLE

**Finding: Static File Path**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:84-85`
- **Code:**
  ```python
  if company.is_admin:
      with open("flag.txt") as f:
          flag = f.read()
  ```

**Analysis:**
- **Context:** Startup event handler (runs once at application boot)
- **User Control:** NONE - hardcoded path `"flag.txt"`, no user input
- **Network Accessibility:** NOT REACHABLE - startup event not triggered by network requests
- **Verdict:** ❌ **NOT AN SSRF SINK** - Static path, no user influence

### URL Redirects - INTERNAL ONLY

**Finding: RedirectResponse with Database-Derived URL**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-058-24/app/main.py:101`
- **Code:**
  ```python
  response = RedirectResponse(url=f"/company/{company.id}/jobs", status_code=status.HTTP_303_SEE_OTHER)
  ```

**Analysis:**
- **User Input:** `company.id` is an integer from database (result of successful authentication)
- **Destination:** Always internal endpoint `/company/{id}/jobs` (relative URL)
- **External Redirect Possible:** NO - always redirects to internal routes
- **Exploitability:** NOT EXPLOITABLE - Cannot redirect to external URLs or arbitrary destinations
- **Verdict:** ❌ **NOT AN SSRF SINK** - Internal redirect only, no user control over destination

**Proof of Concept (Theoretical Bypass Attempt):**
Even if `company.id` were user-controlled, the redirect format is:
```python
f"/company/{company.id}/jobs"  # Always starts with /company/
```
This constructs a relative URL path, not an absolute URL. Browsers and HTTP clients interpret relative URLs as internal paths, preventing redirection to external sites.

### Template Loading - HARDCODED PATHS

**Template References:**
- `templates.TemplateResponse("login.html", ...)` (main.py:96, 107)
- `templates.TemplateResponse("jobs.html", ...)` (main.py:112)

**Analysis:**
- All template paths are **hardcoded string literals**
- No user input affects template selection
- Templates loaded from local filesystem `/app/templates/` directory
- **Verdict:** ❌ **NOT AN SSRF SINK**

### Additional SSRF Vector Checks

**Dynamic Imports - NOT PRESENT:**
- ❌ No `__import__()` with user input
- ❌ No `importlib.import_module()` calls

**Subprocess Execution - NOT PRESENT:**
- ❌ No `subprocess.call()`, `subprocess.run()`, `subprocess.Popen()`
- ❌ No `os.system()` calls

**Socket Operations - NOT PRESENT:**
- ❌ No `socket.connect()` usage
- ❌ No `net.Dial` (Go), `TcpClient` (.NET), etc. (application is Python)

**Webhook/Callback Handlers - NOT PRESENT:**
- ❌ No webhook endpoints
- ❌ No callback URL parameters
- ❌ No external event handlers

**Image Processing - NOT PRESENT:**
- ❌ No PIL/Pillow usage
- ❌ No ImageMagick, GraphicsMagick, or similar
- ❌ No image URL fetching

**SSO/OAuth Discovery - NOT PRESENT:**
- ❌ No JWKS fetching from external URLs
- ❌ No OpenID Connect discovery endpoints
- ❌ JWT tokens signed locally with hardcoded secret (no remote key fetching)

**File Upload Endpoints - NOT PRESENT:**
- ❌ No file upload handling
- ❌ No multipart form data parsing for files (despite `python-multipart` being installed)

**Proxy Functionality - NOT PRESENT:**
- ❌ No reverse proxy features
- ❌ No URL forwarding or proxying

### Application Architecture Analysis

```
┌─────────────────────────────────────────────────┐
│          Client Request (HTTP)                  │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│          FastAPI Endpoint                       │
│  (GET /, POST /token, GET /company/{id}/jobs)   │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│      Database Query (SQLite - Local File)       │
│         NO OUTBOUND NETWORK REQUESTS            │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│     Template Rendering (Jinja2 - Local)        │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│          HTML Response to Client                │
└─────────────────────────────────────────────────┘

NO EXTERNAL REQUESTS IN THIS FLOW
```

**Request Flow:**
1. Client sends HTTP request
2. FastAPI processes request
3. Application queries local SQLite database
4. Application renders Jinja2 template from local filesystem
5. Application returns HTML response

**Critical Observation:** At no point does the application make outbound network requests. All operations are local (database queries, file reads, template rendering).

### Endpoints Analyzed for SSRF

| Endpoint | Method | Input Parameters | SSRF Risk |
|----------|--------|------------------|-----------|
| `/` | GET | None | None - static template |
| `/token` | POST | username, password | None - database lookup only |
| `/company/{company_id}/jobs` | GET | company_id | None - database query only |
| `/ping` | GET | None | None - returns static JSON |

**Conclusion:** All endpoints perform only local operations (database queries, template rendering). No endpoint triggers outbound HTTP requests or external resource fetching.

### SSRF Risk Assessment

**Risk Level:** ✅ **NONE**

**Reasoning:**
1. No HTTP client libraries used in code (despite being installed)
2. No user input influences external network requests
3. All file operations use hardcoded paths
4. Template paths are static
5. Redirects are internal with database-derived values (not user-controlled)
6. No webhook, callback, or external integration functionality
7. No image processing, PDF generation, or media conversion with URL inputs
8. No dynamic imports or subprocess execution

**Defense-in-Depth Recommendations (if outbound requests are added in future):**

1. **URL Allowlisting:** If external requests are needed, maintain allowlist of permitted domains
2. **Network Segmentation:** Use separate network zones for application and egress traffic
3. **DNS Rebinding Protection:** Resolve hostnames once and reject DNS changes
4. **Private IP Blocking:** Reject requests to private IP ranges (10.x, 172.16.x, 192.168.x, 127.x)
5. **Cloud Metadata Protection:** Block access to cloud metadata endpoints (169.254.169.254)
6. **Protocol Restrictions:** Only allow HTTPS (not file://, gopher://, ftp://, etc.)

**Current Status:** These protections are **not needed** as application makes no external requests.

---

**PRE-RECON CODE ANALYSIS COMPLETE**

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-29T21:53:22.465Z