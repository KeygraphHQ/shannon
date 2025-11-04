# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-27 10:29 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000055s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 993 closed tcp ports (conn-refused)
PORT      STATE    SERVICE         VERSION
80/tcp    open     http            Caddy httpd
|_http-title: Site doesn't have a title.
|_http-server-header: Caddy
443/tcp   open     ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open     ipp             CUPS 2.3
| http-robots.txt: 1 disallowed entry 
|_/
|_http-server-header: CUPS/2.3 IPP/2.1
|_http-title: Home - CUPS 2.3.4
5003/tcp  open     http            Werkzeug httpd 3.0.3 (Python 3.8.17)
|_http-server-header: Werkzeug/3.0.3 Python/3.8.17
| http-title: MedGuard
|_Requested resource was /login
8888/tcp  open     sun-answerbook?
49156/tcp filtered unknown
49158/tcp open     http            Golang net/http server
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
| fingerprint-strings: 
|   FourOhFourRequest: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Mon, 27 Oct 2025 17:29:57 GMT
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
|     Date: Mon, 27 Oct 2025 17:29:42 GMT
|     Content-Length: 14
|_    auth required
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port49158-TCP:V=7.97%I=7%D=10/27%Time=68FFAC06%P=arm-apple-darwin24.4.0
SF:%r(GenericLines,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nContent-Type:
SF:\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r\n400\x20
SF:Bad\x20Request")%r(GetRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\n
SF:Content-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x
SF:20'none';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20scr
SF:ipt-src-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8
SF:\r\nTailscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-
SF:gec2eb9730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x2
SF:0DENY\r\nDate:\x20Mon,\x2027\x20Oct\x202025\x2017:29:42\x20GMT\r\nConte
SF:nt-Length:\x2014\r\n\r\nauth\x20required\n")%r(HTTPOptions,192,"HTTP/1\
SF:.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-src\x2
SF:0'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x20scri
SF:pt-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Type:\x2
SF:0text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailscale-Ver
SF:sion:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options:\x20n
SF:osniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Mon,\x2027\x20Oct\x20202
SF:5\x2017:29:42\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20required\n
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
SF:x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Mon,\x2027\x20Oct\x2
SF:02025\x2017:29:57\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requir
SF:ed\n");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 94.85 seconds


## Subdomain Discovery (subfinder)
Status: success
exchvm.nwcnet.localhost
www.localhost
autodiscover.regency.localhost
mail02.regency.localhost
mail03.regency.localhost
tools.sonoma.edu.localhost
mse-ca-mail.corp.mse.localhost
server2.hunter.localhost
sbs.allsaintsschool.localhost
fndlync01.5ninesdata.localhost
mail.localhost
autodiscover.localhost
mail.regency.localhost
naeu2.naeuinc.localhost
server02.counterintel.localhost
owa.regency.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:5003[0m [302 Found] [1mHTML5[0m, [1mHTTPServer[0m[[1m[36mWerkzeug/3.0.3 Python/3.8.17[0m], [1mIP[0m[[0m[22m::1[0m], [1mPython[0m[[1m[32m3.8.17[0m], [1mRedirectLocation[0m[[0m[22m/login[0m], [1mTitle[0m[[1m[33mRedirecting...[0m], [1mWerkzeug[0m[[1m[32m3.0.3[0m]
[1m[34mhttp://localhost:5003/login[0m [200 OK] [1mBootstrap[0m[[1m[32m4.5.2[0m], [1mHTML5[0m, [1mHTTPServer[0m[[1m[36mWerkzeug/3.0.3 Python/3.8.17[0m], [1mIP[0m[[0m[22m::1[0m], [1mJQuery[0m, [1mPasswordField[0m, [1mPython[0m[[1m[32m3.8.17[0m], [1mScript[0m, [1mTitle[0m[[1m[33mMedGuard[0m], [1mWerkzeug[0m[[1m[32m3.0.3[0m]

## Code Analysis
# MedGuard Prescription Management System - Penetration Test Code Analysis

**Target Application:** MedGuard Prescription Management System  
**Analysis Date:** 2025  
**Application Type:** Flask Web Application with GraphQL API  
**Technology Stack:** Python 3.8, Flask 3.0.3, SQLite, GraphQL  
**Network Exposure:** HTTP Port 5003 (0.0.0.0)

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings and security assessments focus exclusively on components that can be reached via network requests.

### In-Scope: Network-Reachable Components
The following components are **in-scope** as they can be invoked through network requests:
- Publicly exposed web pages served by the Flask application
- API endpoints (REST routes and GraphQL endpoint at `/api`)
- Endpoints requiring authentication via the application's login mechanism
- All server-rendered HTML templates delivered via HTTP

### Out-of-Scope: Locally Executable Only
The following components are **out-of-scope** as they require local execution:
- Database initialization scripts (executed via command-line)
- Docker build processes and container orchestration
- Development environment tooling
- CI/CD pipeline scripts

---

## 1. Executive Summary

The MedGuard prescription management system is a Flask-based web application that presents **CRITICAL security vulnerabilities** across all major security domains. This is an intentionally vulnerable application (likely a CTF challenge) that demonstrates multiple severe security failures including plaintext password storage, broken authorization, missing encryption, and GraphQL injection vulnerabilities.

**Most Critical Findings:**
1. **Plaintext Password Storage (CRITICAL)** - All user passwords stored without hashing, including hardcoded credentials for admin (`!@ED#`) and user (`user`) accounts
2. **Broken Authorization on GraphQL (CRITICAL)** - Complete horizontal privilege escalation vulnerability allowing any user to access or modify other users' prescription data
3. **No Encryption in Transit (CRITICAL)** - Application runs on HTTP without TLS/SSL, exposing all data including credentials to network eavesdropping
4. **GraphQL Injection (HIGH)** - Client-side string interpolation in GraphQL queries enables query manipulation and potential data exfiltration
5. **Hardcoded Secrets (HIGH)** - Flask secret key and user credentials hardcoded in source code

**Security Posture Assessment:** The application is completely unsuitable for production use with real patient data. It violates HIPAA technical safeguards, GDPR encryption requirements, and basic security best practices. The attack surface is extensive with multiple pathways for unauthorized data access, credential theft, and data manipulation.

**Architectural Security Decisions:**
- **Session Management:** Flask-Login with hardcoded secret key and client-side user ID storage in localStorage (vulnerable to XSS)
- **Authorization Model:** Basic `@login_required` decorator on REST endpoints but complete absence of authorization checks on GraphQL operations
- **Data Protection:** No encryption at rest or in transit, all sensitive data stored in plaintext SQLite database
- **API Security:** GraphQL endpoint with introspection enabled, no authentication, and vulnerable to injection attacks

---

## 2. Architecture & Technology Stack

### Framework & Language

**Primary Framework:** Flask 3.0.3 (Python Web Framework)
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/requirements.txt` (line 4)
- **Runtime:** Python 3.8.19 (EOL - End of Life as of October 2024)
- **Base Image:** `python:3.8-slim-buster` (Debian Buster - deprecated)
- **WSGI Server:** Werkzeug 3.0.3 (Flask's development server, not production-ready)

**Security Implications:**
- Python 3.8 no longer receives security patches, exposing the application to newly discovered vulnerabilities in the runtime
- Debian Buster repositories are archived and deprecated, requiring insecure APT configuration with `[trusted=yes]` flag to bypass GPG verification
- Flask development server is not hardened for production use (no connection pooling, limited concurrency, verbose error messages)
- No production WSGI server like Gunicorn or uWSGI configured

**Additional Languages:**
- **JavaScript (ES6+):** Client-side scripting embedded in Jinja2 templates
  - Uses Fetch API for asynchronous HTTP requests
  - Manages user sessions via localStorage (XSS-vulnerable)
  - Constructs GraphQL queries via string interpolation (injection-vulnerable)
- **SQL (SQLite dialect):** Database queries via SQLAlchemy ORM
  - Parameterized queries prevent SQL injection at ORM layer
  - No raw SQL queries detected in codebase

### Architectural Pattern

**Pattern:** Monolithic Hybrid Application (Single-tier Architecture)

The application implements a traditional monolithic design where all functionality resides in a single Flask instance serving both server-rendered HTML pages and a GraphQL API endpoint. There is no microservices decomposition, no API gateway, and no separation between frontend and backend layers.

**Application Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│           Flask Application (Single Process)                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Web Layer (Server-Rendered Templates):                     │
│  • GET /                  → Redirect to login                │
│  • GET/POST /login        → Authentication                   │
│  • GET /logout            → Session termination              │
│  • GET /add_prescription  → HTML form for data entry         │
│  • GET /view_prescriptions → Display user data               │
│                                                               │
│  API Layer (GraphQL):                                        │
│  • POST /api              → GraphQL mutations & queries      │
│  • GraphiQL Interface     → Schema introspection (enabled)   │
│                                                               │
│  Data Layer:                                                 │
│  • SQLAlchemy ORM         → Database abstraction             │
│  • SQLite Database        → File-based storage               │
│  • Flask-Login            → Session management               │
│                                                               │
│  Client-Side Logic:                                          │
│  • JavaScript in templates → API communication               │
│  • localStorage           → Client-side session storage      │
│  • Bootstrap 4.5.2        → UI framework                     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Trust Boundary Analysis:**
1. **External to Application:** Trust boundary at HTTP listener (0.0.0.0:5003) - no TLS, no firewall, no rate limiting
2. **Application to Database:** No trust boundary - SQLite runs in-process, no network separation
3. **Client to Server:** Weak trust boundary - user ID passed from client to server and trusted without validation
4. **GraphQL API:** No trust boundary - publicly accessible without authentication checks

**Security Implications of Monolithic Design:**
- Single point of failure - compromise of any component compromises entire application
- No network segmentation between layers - lateral movement not required
- All code runs with same privileges - no privilege separation
- Database runs in same process as web server - memory access attacks could expose database
- No defense in depth - single layer of security controls

### Critical Security Components

**Missing/Inadequate Security Components:**

1. **Web Application Firewall (WAF): NOT IMPLEMENTED**
   - No WAF layer protecting application from common attacks
   - Direct network exposure to SQL injection, XSS, CSRF, and other OWASP Top 10 attacks
   - No request filtering, signature-based detection, or anomaly detection

2. **Rate Limiting: NOT IMPLEMENTED**
   - No Flask-Limiter or equivalent library in requirements.txt
   - Login endpoint vulnerable to brute force attacks (unlimited authentication attempts)
   - GraphQL endpoint vulnerable to denial of service via complex queries
   - No protection against credential stuffing or password spraying attacks

3. **CORS Protection: NOT CONFIGURED**
   - No Flask-CORS extension installed or configured
   - Default Flask behavior may allow cross-origin requests depending on browser
   - GraphQL API potentially vulnerable to cross-origin data exfiltration
   - No `Access-Control-Allow-Origin` headers explicitly set

4. **CSRF Protection: NOT IMPLEMENTED**
   - `flask_wtf` library present in requirements.txt (line 21) but **NOT IMPORTED** in app.py
   - No `CSRFProtect()` initialization found in application code
   - Login endpoint accepts JSON POST requests without CSRF tokens
   - GraphQL mutations vulnerable to cross-site request forgery
   - Attack scenario: Malicious website can forge authenticated requests to add prescriptions

5. **Input Validation: MINIMAL/INADEQUATE**
   - No centralized input validation middleware
   - No schema validation on JSON payloads (e.g., no use of marshmallow, pydantic)
   - GraphQL type system provides basic type checking (Int, String) but no semantic validation
   - No length restrictions enforced at application layer (relies on database schema VARCHAR limits)
   - No character whitelist/blacklist validation
   - Username/password accepted without format validation at `/login` endpoint

6. **Content Security Policy (CSP): NOT IMPLEMENTED**
   - No CSP headers configured to restrict script sources
   - Application vulnerable to XSS attacks loading malicious scripts
   - No protection against inline script execution
   - External CDN resources loaded without Subresource Integrity (SRI) verification
   - Attack surface: Malicious scripts can access localStorage, steal user IDs, forge requests

7. **Security Headers: COMPLETELY MISSING**
   - **X-Frame-Options:** Not configured - vulnerable to clickjacking attacks
   - **X-Content-Type-Options:** Not configured - vulnerable to MIME sniffing attacks
   - **Strict-Transport-Security (HSTS):** Not configured - no HTTPS enforcement
   - **X-XSS-Protection:** Not configured - no browser XSS filter enabled
   - **Referrer-Policy:** Not configured - may leak sensitive URLs in referer headers
   - No `@app.after_request` handler found to inject security headers

8. **HTTPS/TLS: NOT CONFIGURED**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (line 143)
   - Application runs on plain HTTP: `app.run(host='0.0.0.0', port=5003)`
   - No SSL context, no certificate configuration, no TLS termination
   - **Attack Surface:** All credentials transmitted in plaintext over network (man-in-the-middle attacks)
   - Login requests expose username/password in cleartext
   - Session cookies transmitted without Secure flag, vulnerable to interception
   - GraphQL queries/mutations expose sensitive prescription data without encryption

9. **Authentication/Authorization Logging: NOT IMPLEMENTED**
   - No application logger configured (no `import logging` in app.py)
   - No audit trail of authentication attempts (successful or failed)
   - No logging of authorization failures
   - No alerting mechanism for suspicious activity
   - Flask default logging to stdout may expose sensitive data in container logs
   - Cannot perform forensic analysis after security incidents

10. **Account Lockout: NOT IMPLEMENTED**
    - No failed login attempt tracking
    - No temporary account suspension after failed attempts
    - No CAPTCHA or challenge-response after threshold
    - Enables unlimited brute force attacks against known usernames

**Implemented Security Controls:**

1. **SQL Injection Protection: PROPERLY IMPLEMENTED**
   - SQLAlchemy ORM uses parameterized queries throughout codebase
   - **Evidence:** 
     - Line 75: `User.query.filter_by(username=data['username']).first()` - Parameterized
     - Line 45: `Prescription.query.filter_by(user_id=user_id).all()` - Parameterized
     - Line 54-58: ORM insert with model attributes - Safe
   - No raw SQL queries with string concatenation detected
   - **Limitation:** ORM-level protection only; application still vulnerable to GraphQL injection via client-side query construction

2. **Session Management: PARTIALLY IMPLEMENTED**
   - Flask-Login 0.6.3 provides session-based authentication
   - `@login_required` decorator protects REST endpoints
   - **Weaknesses:**
     - Hardcoded secret key compromises session security
     - User ID stored in localStorage (client-side) and re-sent in requests
     - Session cookie flags not explicitly configured (relies on defaults)
     - No session timeout or automatic renewal configured

**Container & Infrastructure Security:**

**Dockerfile Security Issues:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/Dockerfile`
- Lines 5-8: Insecure APT configuration bypassing GPG signature verification
  ```dockerfile
  RUN echo "deb [trusted=yes] http://archive.debian.org/debian buster main" > /etc/apt/sources.list && \
      echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check-valid && \
      echo 'APT::Get::AllowUnauthenticated "true";' >> /etc/apt/apt.conf.d/99no-check-valid
  ```
- **Attack Surface:** Malicious package injection via MITM attacks during build
- Line 21: Secret passed as build argument - exposed in image layers (`ARG FLAG`)
- No non-root user configured - container runs as root (PID 1)
- No security scanning in build pipeline

**Docker Compose Configuration:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/docker-compose.yml`
- Port 5003 exposed directly to host network (`5003:5003`)
- No reverse proxy (nginx, Traefik) for TLS termination
- No environment variable isolation (secrets passed via .env file)
- Health check uses HTTP (line 10-13) - no HTTPS validation

### Technology Stack Summary

| Component | Technology | Version | Status | Security Assessment |
|-----------|-----------|---------|--------|---------------------|
| **Runtime** | Python | 3.8.19 | EOL (Oct 2024) | **CRITICAL** - No security updates |
| **Web Framework** | Flask | 3.0.3 | Current | **HIGH** - Missing security configs |
| **WSGI Server** | Werkzeug | 3.0.3 | Current (dev server) | **HIGH** - Not production-ready |
| **Database** | SQLite | 3.x | N/A | **CRITICAL** - Plaintext storage |
| **ORM** | SQLAlchemy | 2.0.30 | Current | **GOOD** - Parameterized queries |
| **GraphQL** | graphene | 2.1.9 | Outdated | **HIGH** - Injection vulnerabilities |
| **GraphQL Server** | Flask-GraphQL | 2.0.1 | Outdated | **HIGH** - No auth middleware |
| **Authentication** | Flask-Login | 0.6.3 | Current | **CRITICAL** - Plaintext passwords |
| **Template Engine** | Jinja2 | 3.1.4 | Current | **MEDIUM** - Auto-escaping enabled |
| **Frontend Framework** | Bootstrap | 4.5.2 | Outdated | **MEDIUM** - Known vulnerabilities |
| **JavaScript Library** | jQuery | 3.5.1 | Outdated | **MEDIUM** - Known XSS issues |
| **Container** | Docker | Latest | N/A | **HIGH** - Insecure configuration |
| **Overall Security Grade** | - | - | - | **F (Critical Failure)** |

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

**Primary Authentication Method:** Session-based authentication using Flask-Login 0.6.3

**1. Login Endpoint - Password-Based Authentication**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Lines:** 71-83  
**HTTP Methods:** GET (render form), POST (authenticate)  
**Route:** `/login`  
**Authentication Required:** No (public endpoint)

**Implementation:**
```python
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.json
        user = User.query.filter_by(username=data['username']).first()
        if user and user.password == data['password']:  # LINE 76 - PLAINTEXT COMPARISON
            login_user(user)
            return jsonify({"message": "Login successful", "userID": user.id})
        return jsonify({"message": "Invalid credentials"}), 401

    if current_user.is_authenticated:
        return redirect(url_for('add_prescription'))
    return render_template('login.html')
```

**Security Properties:**
- **Request Format:** JSON POST with `username` and `password` fields
- **Password Validation:** Direct string comparison (`user.password == data['password']`) - **NO HASHING**
- **Response on Success:** HTTP 200 with `{"message": "Login successful", "userID": <int>}`
- **Response on Failure:** HTTP 401 with `{"message": "Invalid credentials"}`
- **Session Creation:** `login_user(user)` creates Flask-Login session stored in server-side session cookie

**CRITICAL VULNERABILITIES:**

1. **Plaintext Password Storage and Comparison (CWE-256, CWE-916)**
   - Passwords stored in database as plaintext VARCHAR(80) values
   - No use of bcrypt, Argon2, scrypt, PBKDF2, or any password hashing library
   - Database dump reveals all user passwords immediately
   - Rainbow table attacks unnecessary - passwords directly readable

2. **Hardcoded Default Credentials (CWE-798)**
   - **Location:** Lines 111-119 (init_db function)
   - Admin account: `username='admin'`, `password='!@ED#'`
   - User account: `username='user'`, `password='user'`
   - Credentials hardcoded in source code, committed to repository
   - No mechanism to force password change on first login

3. **No Rate Limiting (CWE-307)**
   - Unlimited authentication attempts allowed
   - Vulnerable to brute force attacks against known usernames
   - No exponential backoff, no CAPTCHA, no account lockout
   - Attacker can enumerate valid usernames by timing differences

4. **No Input Validation (CWE-20)**
   - No validation of username format (length, character set)
   - No validation of password format
   - Missing error handling for malformed JSON (will raise exception)
   - KeyError if `username` or `password` keys missing in request

5. **Timing Attack Vulnerability (CWE-208)**
   - Different code paths for "user not found" vs "wrong password"
   - Line 76: `if user and user.password == data['password']` - short-circuits if user not found
   - Allows username enumeration via response time analysis

6. **Missing CSRF Protection (CWE-352)**
   - JSON POST endpoint accepts requests without CSRF token
   - No `@csrf_exempt` needed because CSRF protection not configured
   - Vulnerable to cross-site request forgery from malicious websites

**Exhaustive List of Authentication API Endpoints:**

| Endpoint | HTTP Method | Purpose | Authentication Required | Line Reference |
|----------|-------------|---------|------------------------|----------------|
| `/login` | GET | Render login form | No | 71-83 |
| `/login` | POST | Authenticate user | No | 71-83 |
| `/logout` | GET | Terminate session | Yes (`@login_required`) | 85-89 |

**No additional authentication endpoints found:**
- No `/register` or `/signup` endpoint
- No `/forgot-password` or `/reset-password` endpoint
- No `/verify-email` or email confirmation endpoints
- No `/change-password` endpoint
- No `/refresh-token` endpoint
- No multi-factor authentication endpoints
- No OAuth/SSO callback endpoints

### Session Management and Token Security

**Session Cookie Configuration:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Line:** 9  
```python
app.secret_key = '@#$%^R&GYUIUBJIU#@*DF&G*H'
```

**CRITICAL FINDING - Hardcoded Secret Key (CWE-798, CWE-321):**
- Secret key hardcoded in source code (not environment variable)
- Value: `@#$%^R&GYUIUBJIU#@*DF&G*H` - 27 characters
- Not cryptographically secure random value
- Publicly visible in git repository
- Used for Flask session encryption/signing and CSRF token generation

**Session Cookie Flags - EXACT LOCATION NOT FOUND IN CODE:**

After exhaustive code analysis, **NO EXPLICIT session cookie configuration was found** in the application code. The application relies on Flask and Werkzeug defaults.

**Default Behavior Analysis:**
- **HttpOnly:** Likely YES (Werkzeug 3.0.3 default for session cookies)
- **Secure:** **NO** - Not set because application runs on HTTP (line 143: `app.run(host='0.0.0.0', port=5003)`)
- **SameSite:** **NOT CONFIGURED** - No explicit setting found
  - Werkzeug 3.0.3 default is `SameSite=Lax` (but should verify in testing)
- **Domain:** Not configured (defaults to request domain)
- **Path:** Not configured (defaults to `/`)

**Missing Configuration:**
```python
# These settings are NOT present in the codebase:
app.config['SESSION_COOKIE_SECURE'] = True       # NOT FOUND
app.config['SESSION_COOKIE_HTTPONLY'] = True     # NOT FOUND (relies on default)
app.config['SESSION_COOKIE_SAMESITE'] = 'Strict' # NOT FOUND
app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # NOT FOUND
```

**User Loader Function:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Lines:** 30-33  
```python
@login_manager.user_loader
def load_user(user_id):
    with app.app_context():
        return db.session.get(User, int(user_id))
```

**Session Flow:**
1. User authenticates at `/login` (line 78: `login_user(user)`)
2. Flask-Login creates session cookie with signed user ID
3. Subsequent requests include session cookie
4. `load_user()` callback retrieves user from database using session user ID
5. `current_user` proxy object available in protected routes

**Session Storage Mechanism:**
- **Type:** Server-side session data signed and stored in client cookie
- **Storage:** No dedicated session backend (Redis, Memcached) - data in encrypted cookie
- **Encryption:** Itsdangerous library (Flask default) with hardcoded secret key
- **Session Lifetime:** Browser session (no `PERMANENT_SESSION_LIFETIME` configured)

**Client-Side Session Management Vulnerability:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/login.html`  
**Lines:** 26-29  
```javascript
if (data.message === "Login successful") {
    localStorage.setItem('userID', data.userID);  // LINE 27 - XSS VULNERABLE
    document.getElementById('login-message').innerText = "Login successful!";
    window.location.href = "/add_prescription";
}
```

**CRITICAL VULNERABILITY - Insecure Client-Side State Management (CWE-922):**
- User ID returned in login response (line 78 in app.py)
- Stored in `localStorage` (persistent, accessible to JavaScript)
- **Attack Surface:** XSS attacks can steal user ID from localStorage
- User ID later used in GraphQL queries without server-side validation
- Attacker can modify localStorage to impersonate other users

### Authorization Model and Potential Bypass Scenarios

**Authorization Model: Simple Binary (Authenticated vs Unauthenticated)**

The application implements a basic two-tier authorization model:
1. **Unauthenticated Users:** Can only access `/` and `/login`
2. **Authenticated Users:** Can access all other routes

**No role-based access control (RBAC), no permission system, no administrative privileges.**

**REST Endpoint Authorization:**

| Endpoint | Decorator | Authorization Check | Bypass Scenario |
|----------|-----------|---------------------|-----------------|
| `/` | None | Redirect to login | N/A - No bypass needed |
| `/login` | None | Public access | N/A - Intentionally public |
| `/logout` | `@login_required` | Flask-Login session | Session forgery if secret key compromised |
| `/add_prescription` | `@login_required` | Flask-Login session | Session forgery if secret key compromised |
| `/view_prescriptions` | `@login_required` | Flask-Login session | Session forgery if secret key compromised |
| `/api` (GraphQL) | **NONE** | **NO AUTHORIZATION** | **Direct unauthenticated access possible** |

**CRITICAL AUTHORIZATION VULNERABILITIES:**

**1. GraphQL Endpoint Lacks Authentication (CWE-862)**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Line:** 65  
```python
app.add_url_rule('/api', view_func=GraphQLView.as_view('api', schema=schema, graphiql=True))
```

**Issue:** No `@login_required` decorator on GraphQL endpoint
- GraphQL queries and mutations accessible without authentication
- Public access to introspection (schema enumeration)
- **Bypass Scenario:** Attacker directly POSTs to `/api` without logging in

**2. Horizontal Privilege Escalation via IDOR (CWE-639, CWE-285)**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Lines:** 41-45 (Query Resolver)  
```python
class Query(graphene.ObjectType):
    get_prescriptions = graphene.List(PrescriptionType, user_id=graphene.Int(required=True))

    def resolve_get_prescriptions(self, info, user_id):
        return Prescription.query.filter_by(user_id=user_id).all()  # LINE 45 - NO AUTHORIZATION
```

**Issue:** No validation that `user_id` parameter matches authenticated user
- Client sends arbitrary `user_id` in GraphQL query
- Server returns prescriptions for ANY user ID
- **Bypass Scenario:** User logs in as ID=2, queries `getPrescriptions(userId: 1)` to access admin's data

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/view_prescriptions.html`  
**Lines:** 24-32 (Client-Side Query Construction)  
```javascript
body: JSON.stringify({
    query: `
        query {
            getPrescriptions(userId: ${userID}) {  // userID from localStorage
                id
                userId
                prescriptionDetails
            }
        }
    `,
}),
```

**Attack Flow:**
1. Attacker logs in as "user" (ID=2)
2. In browser console: `localStorage.setItem('userID', '1')`
3. Refresh page or call `viewPrescriptions()` function
4. GraphQL query sent with `userId: 1`
5. Server returns admin's prescriptions without authorization check

**3. Unauthorized Data Modification via GraphQL Mutation (CWE-862)**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Lines:** 47-58 (Mutation Resolver)  
```python
class AddPrescription(graphene.Mutation):
    class Arguments:
        user_id = graphene.Int(required=True)
        prescription_details = graphene.String()

    prescription = graphene.Field(PrescriptionType)

    def mutate(self, info, user_id, prescription_details):
        new_prescription = Prescription(user_id=user_id, prescription_details=prescription_details)
        db.session.add(new_prescription)
        db.session.commit()
        return AddPrescription(prescription=new_prescription)
```

**Issue:** Mutation accepts client-provided `user_id` without authorization
- No validation that `user_id` matches authenticated user
- No `@login_required` decorator on GraphQL endpoint
- **Bypass Scenario:** Attacker creates prescriptions for other users (cross-user data poisoning)

**Attack Scenario - Data Manipulation:**
```graphql
mutation {
  addPrescription(userId: 1, prescriptionDetails: "Malicious prescription inserted by attacker") {
    prescription {
      id
      userId
      prescriptionDetails
    }
  }
}
```

**4. GraphiQL Introspection Enabled (CWE-200)**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Line:** 65  
```python
app.add_url_rule('/api', view_func=GraphQLView.as_view('api', schema=schema, graphiql=True))
```

**Issue:** `graphiql=True` enables interactive schema browser
- Browse to `http://<target>:5003/api` in browser to access GraphiQL
- Full schema enumeration without authentication
- Attacker can discover all queries, mutations, types, and fields
- **Bypass Scenario:** Attacker learns about `flag` field in Prescription type via introspection

**Introspection Query Example:**
```graphql
{
  __schema {
    types {
      name
      fields {
        name
        type {
          name
        }
      }
    }
  }
}
```

### Multi-Tenancy Security Implementation

**Multi-Tenant Design:** The application uses a simple user-based tenancy model where each user's data is isolated by `user_id` foreign key relationships.

**Database Schema:**
```sql
CREATE TABLE user (
    id INTEGER NOT NULL PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password VARCHAR(80) NOT NULL
);

CREATE TABLE prescription (
    id INTEGER NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    prescription_details VARCHAR(200) NOT NULL,
    flag VARCHAR(50),
    FOREIGN KEY(user_id) REFERENCES user (id)
);
```

**Tenant Isolation Mechanism:**
- **User.id** serves as tenant identifier
- **Prescription.user_id** foreign key links data to tenant
- Queries filter by `user_id` to isolate tenant data

**CRITICAL FAILURE - Tenant Isolation Completely Broken:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Lines:** 44-45  
```python
def resolve_get_prescriptions(self, info, user_id):
    return Prescription.query.filter_by(user_id=user_id).all()
```

**Issue:** Server trusts client-provided `user_id` parameter
- No comparison: `if user_id != current_user.id: raise PermissionError()`
- Query executes with arbitrary user_id from client
- **Cross-Tenant Data Access:** Any user can query any tenant's data

**Proper Implementation Should Be:**
```python
def resolve_get_prescriptions(self, info, user_id):
    # Validate user_id matches authenticated user
    if not hasattr(current_user, 'id') or user_id != current_user.id:
        raise PermissionError("Unauthorized access to user data")
    return Prescription.query.filter_by(user_id=user_id).all()
```

**Additional Tenant Isolation Issues:**
1. No row-level security in database
2. No database views restricting cross-tenant queries
3. No ORM-level filters enforcing tenant boundaries
4. No audit logging of cross-tenant access attempts

### SSO/OAuth/OIDC Flows

**Status:** NOT IMPLEMENTED

After comprehensive code analysis, **NO SSO, OAuth, or OpenID Connect integration was found** in the application.

**Evidence:**
- No OAuth libraries in requirements.txt (no authlib, oauthlib, requests-oauthlib)
- No OAuth callback endpoints (`/oauth/callback`, `/auth/callback`, etc.)
- No state parameter generation or validation code
- No nonce parameter generation or validation code
- No token exchange flows (authorization code, implicit, client credentials)
- No JWKS (JSON Web Key Set) fetching logic
- No JWT token validation

**Conclusion:** The application uses only username/password authentication with Flask-Login session management. No third-party identity providers integrated.

---

## 4. Data Security & Storage

### Database Security

**Database Technology:** SQLite 3.x (file-based relational database)

**File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/instance/prescriptions.db`

**Connection String:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Line:** 10  
```python
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///prescriptions.db'
```

**Configuration:** Relative path, resolves to `app/instance/prescriptions.db` directory

**CRITICAL SECURITY ISSUES:**

**1. No Encryption at Rest (CWE-311)**
- SQLite database stored as plaintext file on filesystem
- No SQLCipher or equivalent encryption library
- All data readable with `sqlite3` command-line tool or any SQLite browser
- **Attack Surface:** File system access = complete database compromise
- **Impact:** Passwords, prescriptions, and challenge flag exposed in cleartext

**Verification:**
```bash
$ sqlite3 /path/to/prescriptions.db "SELECT * FROM user;"
1|admin|!@ED#
2|user|user
```

**2. Weak Access Controls (CWE-732)**
- Database security relies entirely on filesystem permissions
- No database-level authentication (SQLite has no user/password system)
- No row-level security policies
- No column-level encryption for sensitive fields
- **Attack Surface:** Any process running as same OS user can read database

**3. No Connection Encryption (N/A for SQLite)**
- SQLite is in-process, no network connections
- Not applicable for this deployment, but limits scalability
- Cannot deploy database separately from application server

**4. Dangerous Database Initialization (CWE-665)**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Lines:** 106-138  
```python
def init_db():
    db.drop_all()  # LINE 107 - DROPS ALL TABLES
    db.create_all()
    
    # Add default users with hardcoded credentials
    if not User.query.filter_by(username='admin', password='!@ED#').first():
        user1 = User(username='admin', password='!@ED#')
        db.session.add(user1)
        db.session.commit()
```

**Issues:**
- `db.drop_all()` called on initialization (data loss on restart)
- Hardcoded credentials created automatically
- Prescription data regenerated on restart (lines 121-138)
- Flag value inserted from environment variable
- **Attack Surface:** Application restart = complete data reset (DoS via restart trigger)

**5. Flag Storage in Database (CTF-Specific)**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`  
**Lines:** 125-133  
```python
flag = os.getenv('FLAG', 'flag{this_is_a_fake_flag}')

# Add prescriptions for the users
if Prescription.query.filter_by(user_id=user1.id).count() == 0:  
    for i in range(1,90):
        if i == 43:
            prescription = Prescription(user_id=user1.id, prescription_details=f"Prescription {i} for Admin", flag=flag)
```

**Sensitive Data:**
- Challenge flag stored in `Prescription.flag` field (VARCHAR(50))
- Only prescription #43 for admin user contains flag value
- Flag accessible via GraphQL query if attacker includes `flag` field:
  ```graphql
  query {
    getPrescriptions(userId: 1) {
      id
      flag  # This field contains the challenge flag
    }
  }
  ```

### Data Flow Security

**Sensitive Data Inventory:**

| Data Type | Storage Location | Encryption at Rest | Encryption in Transit | Classification |
|-----------|------------------|-------------------|----------------------|----------------|
| Passwords | `user.password` (SQLite) | NO | NO (HTTP only) | CRITICAL |
| Usernames | `user.username` (SQLite) | NO | NO (HTTP only) | MEDIUM |
| Prescription Details | `prescription.prescription_details` (SQLite) | NO | NO (HTTP only) | HIGH (PHI) |
| Challenge Flag | `prescription.flag` (SQLite) | NO | NO (HTTP only) | HIGH |
| User ID | `user.id`, localStorage | NO | NO (HTTP only) | MEDIUM |
| Session Cookie | Browser cookie | YES (signed with secret_key) | NO (no Secure flag) | HIGH |
| Flask Secret Key | Source code | NO | N/A | CRITICAL |

**Data Flow Analysis:**

**1. Authentication Flow (Login):**
```
Client Browser                    Flask Application              SQLite Database
     |                                   |                              |
     | POST /login                       |                              |
     | {"username":"user",               |                              |
     |  "password":"user"}               |                              |
     |---------------------------------->|                              |
     |        (PLAINTEXT HTTP)           |                              |
     |                                   | SELECT * FROM user           |
     |                                   | WHERE username='user'        |
     |                                   |----------------------------->|
     |                                   |                              |
     |                                   | password='user' (plaintext)  |
     |                                   |<-----------------------------|
     |                                   |                              |
     |                                   | if user.password == 'user':  |
     |                                   |   login_user()               |
     |                                   |                              |
     | HTTP 200                          |                              |
     | {"message":"Login successful",    |                              |
     |  "userID":2}                      |                              |
     | Set-Cookie: session=<signed>      |                              |
     |<----------------------------------|                              |
     |        (PLAINTEXT HTTP)           |                              |
     |                                   |                              |
     | localStorage.setItem('userID',2)  |                              |
```

**Security Gaps:**
- Password transmitted in plaintext over HTTP (no TLS)
- Password compared as plaintext string (no hashing)
- User ID returned in response and stored in localStorage (XSS-vulnerable)
- Session cookie transmitted without Secure flag (interception-vulnerable)

**2. Data Query Flow (View Prescriptions):**
```
Client Browser                    Flask Application              SQLite Database
     |                                   |                              |
     | GET /view_prescriptions           |                              |
     | Cookie: session=<signed>          |                              |
     |---------------------------------->|                              |
     |                                   | load_user(user_id)           |
     |                                   | current_user = User(id=2)    |
     |                                   |                              |
     | HTTP 200                          |                              |
     | <html>                            |                              |
     |   userID={{ current_user.id }}    |                              |
     | </html>                           |                              |
     |<----------------------------------|                              |
     |                                   |                              |
     | JavaScript:                       |                              |
     | userID = 2 (or modified to 1)     |                              |
     |                                   |                              |
     | POST /api                         |                              |
     | {query: "getPrescriptions(        |                              |
     |   userId: 1)"}                    |                              |
     |---------------------------------->|                              |
     |                                   | Prescription.query.filter_by |
     |                                   | (user_id=1).all()            |
     |                                   |----------------------------->|
     |                                   |                              |
     |                                   | [Prescription objects]       |
     |                                   |<-----------------------------|
     |                                   |                              |
     | HTTP 200                          |                              |
     | {"data":{"getPrescriptions":[...] |                              |
     |<----------------------------------|                              |
     |        (PLAINTEXT HTTP)           |                              |
```

**Security Gaps:**
- User ID passed from server to client, then back to server (client controls authorization parameter)
- No server-side validation that user_id=1 is authorized for current user
- Prescription data transmitted in plaintext over HTTP
- Horizontal privilege escalation possible by modifying user_id

**3. Data Modification Flow (Add Prescription):**
```
Client Browser                    Flask Application              SQLite Database
     |                                   |                              |
     | POST /api                         |                              |
     | {query: "mutation {               |                              |
     |   addPrescription(                |                              |
     |     userId: 1,                    |                              |
     |     prescriptionDetails: '...'    |                              |
     |   )}"}                            |                              |
     |---------------------------------->|                              |
     |   (NO AUTHENTICATION CHECK)       |                              |
     |                                   | Prescription(user_id=1, ...) |
     |                                   | db.session.add()             |
     |                                   | db.session.commit()          |
     |                                   |----------------------------->|
     |                                   |                              |
     | HTTP 200                          |                              |
     | {"data":{"addPrescription":{...}} |                              |
     |<----------------------------------|                              |
```

**Security Gaps:**
- No authentication required for mutation
- Client specifies `userId` parameter (can create prescriptions for any user)
- No audit logging of data modifications
- Mutation transmitted over plaintext HTTP

### Multi-Tenant Data Isolation

**Isolation Mechanism:** Foreign key relationship (`prescription.user_id` → `user.id`)

**Expected Behavior:**
- User A (ID=1) should only see prescriptions where `user_id=1`
- User B (ID=2) should only see prescriptions where `user_id=2`
- Mutations should only create prescriptions with authenticated user's ID

**Actual Behavior:**
- User provides `user_id` parameter in GraphQL query/mutation
- Server accepts arbitrary `user_id` without validation
- No row-level security enforcement

**Isolation Failures:**

**1. Read Isolation Failure (CWE-639)**
- User can query prescriptions for any `user_id`
- No `WHERE user_id = current_user.id` enforcement in GraphQL resolver
- **Attack:** User B queries `getPrescriptions(userId: 1)` to access User A's data

**2. Write Isolation Failure (CWE-639)**
- User can create prescriptions for any `user_id`
- No validation that `user_id` in mutation matches authenticated user
- **Attack:** User B calls `addPrescription(userId: 1, ...)` to pollute User A's data

**3. No Database-Level Isolation**
- No PostgreSQL Row-Level Security (RLS) policies
- No database views restricting access by user context
- No ORM-level tenant filtering (e.g., SQLAlchemy query events)

**Proper Multi-Tenant Security Implementation:**

```python
# CORRECT: Server-side authorization enforcement
def resolve_get_prescriptions(self, info, user_id):
    # Validate user_id matches authenticated user
    if not current_user.is_authenticated:
        raise PermissionError("Authentication required")
    
    if user_id != current_user.id:
        raise PermissionError("Cannot access other users' prescriptions")
    
    return Prescription.query.filter_by(user_id=user_id).all()

# ALTERNATIVE: Remove user_id parameter, use current_user only
def resolve_get_prescriptions(self, info):
    if not current_user.is_authenticated:
        raise PermissionError("Authentication required")
    
    return Prescription.query.filter_by(user_id=current_user.id).all()
```

---

## 5. Attack Surface Analysis

### External Entry Points

**Network Configuration:**
- **Listening Address:** `0.0.0.0` (all network interfaces)
- **Port:** `5003`
- **Protocol:** HTTP (no HTTPS/TLS)
- **Docker Exposure:** Host port 5003 mapped to container port 5003

**Application Entry Points (Network-Accessible):**

**1. Root Redirect - `/`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 67-69)
- **HTTP Method:** GET
- **Authentication:** None required
- **Functionality:** Redirects to `/login`
- **Input Parameters:** None
- **Attack Surface:** Minimal - simple redirect, no data processing
- **Security Notes:** Safe, no user input processed

**2. Login Endpoint - `/login`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 71-83)
- **HTTP Methods:** GET (render form), POST (authenticate)
- **Authentication:** None required (public)
- **Functionality:** Authenticates users via username/password
- **Input Parameters (POST):**
  - `username` (string, required) - User's login name
  - `password` (string, required) - User's password
- **Content-Type:** `application/json`
- **Response Format:** JSON with `message` and `userID` fields
- **Attack Surface:**
  - **Brute Force:** No rate limiting, unlimited authentication attempts
  - **Credential Stuffing:** No CAPTCHA or account lockout
  - **Username Enumeration:** Timing differences reveal valid usernames
  - **CSRF:** No token validation on POST requests
  - **Credential Interception:** Plaintext HTTP transmission
  - **Known Credentials:** Hardcoded admin/user accounts with weak passwords
- **Exploitation Scenario:** Attacker can brute force login with credentials `admin:!@ED#` or `user:user`

**3. Logout Endpoint - `/logout`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 85-89)
- **HTTP Method:** GET
- **Authentication:** Required (`@login_required`)
- **Functionality:** Terminates user session
- **Input Parameters:** None (session cookie required)
- **Attack Surface:**
  - **CSRF:** Logout via GET (should be POST with CSRF token)
  - **Session Fixation:** If session not regenerated after logout
- **Security Notes:** Relatively safe, logout functionality minimal risk

**4. Add Prescription Page - `/add_prescription`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 94-97)
- **HTTP Method:** GET
- **Authentication:** Required (`@login_required`)
- **Functionality:** Renders HTML form for adding prescriptions
- **Input Parameters:** None (server passes `userID=current_user.id` to template)
- **Response:** HTML template with embedded JavaScript
- **Attack Surface:**
  - **XSS via Template Injection:** If `current_user.id` contains malicious data (unlikely for integer ID)
  - **Client-Side Logic Manipulation:** JavaScript in template constructs GraphQL query with string interpolation
- **Linked Vulnerability:** Template at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/add_prescription.html` (lines 22-32) constructs GraphQL mutation with unescaped user input

**5. View Prescriptions Page - `/view_prescriptions`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 99-103)
- **HTTP Method:** GET
- **Authentication:** Required (`@login_required`)
- **Functionality:** Displays user's prescriptions via GraphQL query
- **Input Parameters:** None (server passes `userID=current_user.id` and `username=current_user.username`)
- **Response:** HTML template with embedded JavaScript
- **Attack Surface:**
  - **Template Injection (Limited):** Username rendered in H1 tag (line 4 of template)
  - **GraphQL Injection:** Client-side JavaScript constructs query with `userId` from localStorage
  - **IDOR:** User can modify localStorage to query other users' data
- **Linked Vulnerabilities:** 
  - Template at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/view_prescriptions.html` (lines 24-32) - GraphQL injection
  - GraphQL resolver (app.py lines 44-45) - No authorization check

**6. GraphQL API Endpoint - `/api`**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (line 65)
- **HTTP Methods:** GET (GraphiQL interface), POST (GraphQL queries/mutations), OPTIONS (CORS preflight)
- **Authentication:** **NONE** (no `@login_required` decorator)
- **Functionality:** GraphQL API for prescription management + interactive GraphiQL browser
- **Content-Type:** `application/json` (POST), `text/html` (GET for GraphiQL)
- **GraphiQL Interface:** Enabled (`graphiql=True`) - accessible in browser
- **Introspection:** Enabled (default) - full schema enumeration
- **Attack Surface:**
  - **Unauthenticated Access:** Direct API access without login
  - **Schema Enumeration:** GraphiQL reveals all types, queries, mutations, fields
  - **IDOR:** Queries accept arbitrary `user_id` parameter
  - **Unauthorized Mutations:** Create/modify prescriptions for any user
  - **GraphQL Injection:** Client-side query construction via string interpolation
  - **Denial of Service:** No query complexity limits, no depth limits
  - **Billion Laughs Attack:** Nested/recursive queries possible
- **Exploitation Scenario:** 
  ```bash
  curl -X POST http://target:5003/api \
    -H "Content-Type: application/json" \
    -d '{"query":"{ getPrescriptions(userId: 1) { id prescriptionDetails flag } }"}'
  ```

### Internal Service Communication

**Architecture:** Monolithic single-process application - no internal service communication.

**Service Decomposition:** None detected
- No microservices architecture
- No message queues (RabbitMQ, Kafka, Redis)
- No service mesh (Istio, Linkerd)
- No inter-service API calls

**Database Communication:**
- **Type:** In-process SQLite library (not network-based)
- **Protocol:** Direct file I/O (no network protocol)
- **Encryption:** None (in-process memory access)
- **Authentication:** None (SQLite has no auth system)
- **Trust Boundary:** None - database runs in same process as web server

**Conclusion:** No internal service communication attack surface. All components run in single process space.

### Input Validation Patterns

**Server-Side Validation: MINIMAL/INADEQUATE**

**1. Login Endpoint Validation:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 74-76)
- **Validation Implemented:** None
- **Code:**
  ```python
  data = request.json
  user = User.query.filter_by(username=data['username']).first()
  if user and user.password == data['password']:
  ```
- **Issues:**
  - No check if `request.json` is None (malformed JSON crashes app)
  - No check if `username` or `password` keys exist (KeyError possible)
  - No length validation (could send 1MB username)
  - No character set validation (could contain null bytes, control characters)
  - No format validation (email format, alphanumeric only, etc.)

**2. GraphQL Type Validation:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 42, 49-50)
- **Validation Implemented:** GraphQL schema type checking only
- **Code:**
  ```python
  get_prescriptions = graphene.List(PrescriptionType, user_id=graphene.Int(required=True))
  ```
- **Validation Provided:**
  - `user_id` must be integer (GraphQL type system enforces)
  - `user_id` is required (GraphQL validates presence)
- **Validation Missing:**
  - No range validation (user_id could be negative, zero, or beyond max user ID)
  - No existence validation (user_id could reference non-existent user)
  - No authorization validation (user_id not checked against current_user.id)
  - `prescription_details` has no length limit (schema says String, no maxLength)

**3. Database Schema Validation:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 19-28)
- **Validation Implemented:** Column type and length constraints
- **Schema:**
  ```python
  username = db.Column(db.String(80), unique=True, nullable=False)
  password = db.Column(db.String(80), nullable=False)
  prescription_details = db.Column(db.String(200), nullable=False)
  flag = db.Column(db.String(50), nullable=True)
  ```
- **Validation Provided:**
  - Username max 80 characters
  - Password max 80 characters
  - Prescription details max 200 characters
  - Flag max 50 characters
  - Username uniqueness enforced
- **Validation Missing:**
  - No minimum length requirements
  - No character set restrictions (could contain null bytes, binary data)
  - No email format validation
  - No password complexity requirements

**Client-Side Validation: MINIMAL**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/add_prescription.html` (lines 16-34)
```javascript
const prescriptionDetails = document.getElementById('prescriptionDetails').value;

fetch('/api', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        query: `
            mutation {
                addPrescription(userId: ${userID}, prescriptionDetails: "${prescriptionDetails}") {
                    ...
                }
            }
        `,
    }),
})
```

**Issues:**
- No client-side validation of `prescriptionDetails` length
- No HTML sanitization before sending to server
- **GraphQL Injection Vulnerability:** Direct string interpolation of user input into GraphQL query
- User can inject GraphQL syntax by entering quote characters

**Input Validation Attack Vectors:**

| Attack Type | Vulnerable Endpoint | Line Reference | Exploitation |
|------------|---------------------|----------------|-------------|
| GraphQL Injection | `/api` (addPrescription) | add_prescription.html:24 | Inject `"} mutation { ... }` to execute additional mutations |
| GraphQL Injection | `/api` (getPrescriptions) | view_prescriptions.html:26 | Modify `userID` to access other users' data |
| SQL Injection | All endpoints | N/A (mitigated) | SQLAlchemy ORM prevents via parameterization |
| JSON Injection | `/login` | app.py:74 | Send malformed JSON to crash application |
| Integer Overflow | `/api` (user_id param) | app.py:45 | Send very large integer to test boundary conditions |
| Null Byte Injection | All text inputs | Various | Test for null byte truncation issues |

### Background Processing

**Asynchronous Job Processing: NOT IMPLEMENTED**

After comprehensive code analysis, **NO background job processing** was detected:

**Evidence:**
- No Celery, RQ (Redis Queue), or Dramatiq in requirements.txt
- No task queue definitions (no `@celery.task` decorators)
- No worker processes in Docker configuration
- No cron jobs or scheduled tasks
- No message brokers (Redis, RabbitMQ, etc.)

**All Processing is Synchronous:**
- HTTP requests processed synchronously in Flask request/response cycle
- Database operations execute within request context
- No deferred processing or background tasks

**Database Initialization (Pseudo-Background Task):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 140-143)
- **Code:**
  ```python
  if __name__ == '__main__':
      with app.app_context():
          init_db() 
      app.run(host='0.0.0.0', port=5003)
  ```
- **Execution:** Runs on application startup (before accepting HTTP requests)
- **Privilege Model:** Same as web server (root in container)
- **Security:** Hardcoded credentials created, flag inserted from environment variable

**Conclusion:** No background processing attack surface. All code execution triggered by network requests.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Status: CRITICAL FAILURES - Multiple Hardcoded Secrets**

**1. Flask Secret Key (Hardcoded in Source Code)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (line 9)
- **Code:** `app.secret_key = '@#$%^R&GYUIUBJIU#@*DF&G*H'`
- **Storage Method:** Plaintext in source code
- **Rotation:** None - static value
- **Access Control:** None - visible in git repository
- **Security Impact:** Session token forgery, CSRF bypass, cookie tampering

**2. User Credentials (Hardcoded in Source Code)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 111-119)
- **Code:**
  ```python
  user1 = User(username='admin', password='!@ED#')
  user2 = User(username='user', password='user')
  ```
- **Storage Method:** Plaintext in initialization function
- **Rotation:** None - recreated on every `init_db()` call
- **Access Control:** None - visible in source code
- **Security Impact:** Known default credentials, unauthorized access

**3. Challenge Flag (Environment Variable with Insecure Fallback)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (line 125)
- **Code:** `flag = os.getenv('FLAG', 'flag{this_is_a_fake_flag}')`
- **Storage Method:** Environment variable (better) with plaintext fallback (bad)
- **Docker Exposure:** Passed as build argument in Dockerfile (line 21: `ARG FLAG`)
- **Rotation:** None
- **Access Control:** Environment variable accessible to application process
- **Security Impact:** Flag visible in Docker image layers via `docker history`

**4. Environment Variable Storage (.env file)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/.env`
- **Content:** `FLAG="flag{35e71c8c-88aa-427c-affe-d1dbd5cdbda9}"`
- **Storage Method:** Plaintext file in project root
- **Version Control:** Likely committed to git repository
- **Access Control:** Filesystem permissions only
- **Security Impact:** Secret exposed in git history, container builds

**Secrets Rotation Mechanisms: NONE IMPLEMENTED**

**Missing Secret Management Features:**
- No integration with secret management systems (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault)
- No automatic secret rotation
- No secret versioning
- No secret expiration/lifecycle management
- No audit logging of secret access
- No secret encryption at rest (other than OS-level disk encryption)

**Recommended Secret Management (Not Implemented):**
```python
# PROPER: Environment-based secret key
import os
app.secret_key = os.environ['SECRET_KEY']  # Required, no fallback

# PROPER: Secrets from vault
import boto3
secrets_client = boto3.client('secretsmanager')
db_password = secrets_client.get_secret_value(SecretId='prod/db/password')['SecretString']

# PROPER: Encrypted secrets in code
from cryptography.fernet import Fernet
encrypted_secret = b'...'  # Encrypted at build time
cipher = Fernet(os.environ['ENCRYPTION_KEY'])
secret = cipher.decrypt(encrypted_secret)
```

### Configuration Security

**Configuration Files:**

**1. Flask Application Configuration**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 8-11)
- **Code:**
  ```python
  app = Flask(__name__)
  app.secret_key = '@#$%^R&GYUIUBJIU#@*DF&G*H'
  app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///prescriptions.db'
  app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
  ```
- **Environment Separation:** **NONE** - Same config for dev/staging/prod
- **Secret Handling:** Hardcoded in source code (insecure)
- **Missing Configurations:**
  - `DEBUG` mode setting (defaults to False in production)
  - `TESTING` flag
  - `ENV` setting (production vs development)
  - `SECRET_KEY` from environment
  - `SESSION_COOKIE_SECURE` flag
  - `SESSION_COOKIE_HTTPONLY` flag
  - `SESSION_COOKIE_SAMESITE` setting
  - `PERMANENT_SESSION_LIFETIME` timeout

**2. Docker Configuration**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/Dockerfile` (lines 12, 21)
- **Code:**
  ```dockerfile
  ENV FLAG=${FLAG}
  ...
  ARG FLAG
  ```
- **Secret Handling:** Build argument passed to environment variable (insecure)
- **Security Impact:** Secrets baked into image layers, visible in `docker history`
- **Recommendations:** Use Docker secrets, Kubernetes secrets, or vault at runtime

**3. Docker Compose Configuration**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/docker-compose.yml`
- **Secrets:** No secrets management configured
- **Environment Variables:** Not defined in compose file (relies on .env file in parent directory)
- **Network Isolation:** None - default bridge network
- **Volume Persistence:** None - database resets on container restart

**Infrastructure Security Headers (NOT CONFIGURED):**

After searching for infrastructure configuration files (Nginx, Kubernetes Ingress, CDN settings), **NO infrastructure security header configuration was found**:

**Missing Infrastructure Components:**
- No Nginx configuration files (`nginx.conf`, `sites-available/*`)
- No Kubernetes manifests (`*.yaml` in k8s/ or kube/ directories)
- No Ingress resources with annotation-based header injection
- No CDN configuration (CloudFront, Cloudflare, Fastly)
- No Load Balancer configuration (ALB, ELB, HAProxy)

**Headers Not Configured at Any Layer:**
- **Strict-Transport-Security (HSTS):** Not found in Flask app or infrastructure
- **Cache-Control:** Not configured (allows sensitive data caching)
- **X-Content-Type-Options:** Not configured (MIME sniffing attacks possible)
- **X-Frame-Options:** Not configured (clickjacking attacks possible)
- **Content-Security-Policy (CSP):** Not configured (XSS attacks not mitigated)

**Verification:** No `@app.after_request` decorator found in app.py to inject response headers

**Proper Infrastructure Security Headers (Not Implemented):**
```python
# PROPER: Flask response headers
@app.after_request
def set_security_headers(response):
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Content-Security-Policy'] = "default-src 'self'"
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return response
```

### External Dependencies

**Dependency Management:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/requirements.txt`
- **Package Manager:** pip (Python)
- **Dependency Count:** 21 packages

**Critical Dependencies:**

| Package | Version | Status | Known Vulnerabilities | Security Notes |
|---------|---------|--------|----------------------|----------------|
| Flask | 3.0.3 | Current | None known (recent release) | Core framework |
| Werkzeug | 3.0.3 | Current | None known | WSGI utilities |
| SQLAlchemy | 2.0.30 | Current | None known | ORM security good |
| Flask-Login | 0.6.3 | Current | None known | Session management |
| Flask-GraphQL | 2.0.1 | Outdated | No CVEs, but unmaintained | Last update 2020 |
| graphene | 2.1.9 | Outdated | No CVEs, but 3.x available | GraphQL library |
| graphql-core | 2.3.2 | Outdated | No CVEs, but 3.x available | GraphQL implementation |
| Jinja2 | 3.1.4 | Current | None known | Template engine |
| itsdangerous | 2.2.0 | Current | None known | Session signing |

**Frontend CDN Dependencies:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/base.html` (lines 7, 40-42)
- **Bootstrap CSS:** `https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css`
- **jQuery:** `https://code.jquery.com/jquery-3.5.1.slim.min.js`
- **Popper.js:** `https://cdn.jsdelivr.net/npm/@popperjs/core@2.5.3/dist/umd/popper.min.js`
- **Bootstrap JS:** `https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js`

**CDN Security Issues:**
1. **No Subresource Integrity (SRI):** Scripts/styles loaded without hash verification
2. **Outdated jQuery:** Version 3.5.1 (current is 3.7.x) - known XSS vulnerabilities in older versions
3. **Outdated Bootstrap:** Version 4.5.2 (current is 5.3.x) - missing security improvements
4. **No CSP:** Content Security Policy not configured to restrict CDN sources

**Third-Party Service Integrations:**
- **Status:** NONE DETECTED
- No payment processors (Stripe, PayPal)
- No analytics services (Google Analytics, Mixpanel)
- No monitoring/APM (Sentry, New Relic, DataDog)
- No email services (SendGrid, Mailgun)
- No cloud storage (S3, Azure Blob Storage)

**Dependency Security Implications:**
- **Supply Chain Risk:** No dependency verification (pip install without hash checking)
- **Vulnerability Management:** No automated security scanning (Dependabot, Snyk)
- **Update Policy:** No documented dependency update schedule
- **License Compliance:** No license tracking

### Monitoring & Logging

**Application Logging: NOT IMPLEMENTED**

**Evidence:**
- No `import logging` statement in app.py
- No `app.logger` usage
- No structured logging library (python-json-logger, structlog)
- No log aggregation configuration (Logstash, Fluentd, CloudWatch)

**Default Flask Logging:**
- Flask logs to stderr by default (Werkzeug logger)
- Format: `127.0.0.1 - - [timestamp] "GET / HTTP/1.1" 200 -`
- **Security Issue:** Access logs may contain sensitive data in URL parameters, headers

**Missing Security Event Logging:**
- No logging of authentication attempts (success/failure)
- No logging of authorization failures
- No logging of GraphQL query/mutation execution
- No logging of database operations
- No logging of configuration changes
- No logging of application errors with context

**Docker Logging:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/docker-compose.yml`
- Container logs sent to Docker stdout/stderr
- No custom logging driver configured
- No log rotation policy
- **Security Risk:** Logs may contain passwords from login requests, prescription data from GraphQL responses

**Monitoring & Alerting: NOT IMPLEMENTED**

**Missing Monitoring:**
- No application performance monitoring (APM)
- No health check endpoints (other than Docker healthcheck)
- No metrics collection (Prometheus, StatsD)
- No distributed tracing (Jaeger, Zipkin)
- No error tracking (Sentry, Rollbar)

**Docker Health Check:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/docker-compose.yml` (lines 10-13)
- **Code:**
  ```yaml
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:5003"]
    interval: 10s
    retries: 5
  ```
- **Mechanism:** Simple HTTP GET to root endpoint
- **Limitation:** Only checks if server responds, not application health

**Security Event Visibility: NONE**

Without logging, the following security events are invisible:
- Brute force attacks on login endpoint
- Unauthorized data access attempts via GraphQL
- GraphQL injection attempts
- Session hijacking attempts
- Abnormal query patterns (data exfiltration)
- Application crashes or errors
- Configuration tampering

**Recommended Logging (Not Implemented):**
```python
# PROPER: Security event logging
import logging
from logging.handlers import RotatingFileHandler

# Configure structured logging
logger = logging.getLogger('app')
logger.setLevel(logging.INFO)
handler = RotatingFileHandler('app.log', maxBytes=10000000, backupCount=5)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# Log authentication attempts
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    logger.info(f"Login attempt for user: {data['username']}")
    user = User.query.filter_by(username=data['username']).first()
    if user and user.password == data['password']:
        logger.info(f"Login successful for user: {user.username}")
        login_user(user)
        return jsonify({"message": "Login successful"})
    logger.warning(f"Login failed for user: {data['username']}")
    return jsonify({"message": "Invalid credentials"}), 401
```

---

## 7. Overall Codebase Indexing

### Directory Structure and Organization

The MedGuard application follows a compact Flask project structure typical of small-to-medium web applications. The codebase is organized as a containerized application with clear separation between application code, infrastructure configuration, and data storage. However, the simplicity of the structure also reflects security gaps - there is no dedicated security module, no separate configuration management layer, and no structured testing framework.

**Root Directory Structure:**
```
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/
├── .env                          # Environment variables (FLAG stored in plaintext)
├── docker-compose.yml            # Container orchestration configuration
└── app/                          # Application root directory
    ├── Dockerfile                # Container build instructions
    ├── requirements.txt          # Python dependencies (21 packages)
    ├── app.py                    # Main application file (145 lines - all backend logic)
    ├── instance/                 # Instance-specific data (created at runtime)
    │   └── prescriptions.db      # SQLite database file (unencrypted)
    └── templates/                # Jinja2 HTML templates
        ├── base.html             # Base template with CDN imports
        ├── login.html            # Login page with client-side authentication
        ├── add_prescription.html # Add prescription form (GraphQL injection risk)
        └── view_prescriptions.html # View prescriptions (IDOR vulnerability)
```

**Codebase Characteristics:**

**1. Monolithic Application Design:**
The entire backend logic resides in a single `app.py` file (145 lines). This compact structure includes:
- Flask application initialization (lines 8-11)
- Database models (User, Prescription) - lines 19-28
- Flask-Login configuration (lines 14-17, 30-33)
- GraphQL schema definition (lines 35-63)
- REST route handlers (lines 67-103)
- Database initialization logic (lines 106-138)
- Application startup (lines 140-143)

This monolithic design means there is no modular separation of concerns. Authentication, authorization, data access, and business logic all coexist in a single file, making security code review challenging and increasing the risk of missing critical vulnerabilities.

**2. Template-Based Frontend Architecture:**
The application uses server-side rendering with Jinja2 templates that contain embedded JavaScript for API communication. This hybrid approach creates several security challenges:
- **Client-side security logic:** User IDs passed from server to client, then back to server in GraphQL queries
- **String interpolation vulnerabilities:** JavaScript constructs GraphQL queries by concatenating user input without escaping
- **State management in localStorage:** Session state persisted in browser storage (XSS-vulnerable)

**3. No Dedicated Security Module:**
Unlike enterprise applications with `security/` or `auth/` directories containing middleware, validators, and security utilities, this application has no security-focused code organization. Security controls (Flask-Login integration, user authentication) are scattered throughout the main application file.

**4. Infrastructure as Code:**
The Dockerfile and docker-compose.yml provide reproducible deployment, but also introduce security concerns:
- Dockerfile contains insecure APT configuration to work with deprecated Debian repositories
- Build arguments expose secrets in image layers
- No multi-stage builds to separate build dependencies from runtime dependencies

**5. No Test Suite:**
No `tests/` directory or test files detected. The absence of automated testing means:
- Security regressions may go undetected
- Input validation edge cases not covered
- Authorization logic not verified programmatically
- GraphQL injection vulnerabilities not caught before deployment

### Build Orchestration and Tooling

**Container Build System (Docker):**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/Dockerfile`

The Dockerfile uses a multi-step build process:
1. **Base Image Selection (Line 1):** `FROM python:3.8-slim-buster`
   - Python 3.8 runtime (EOL, no security updates)
   - Debian Buster OS (deprecated, archived repositories)
   
2. **Repository Configuration (Lines 5-8):** Insecure APT setup
   - Uses `[trusted=yes]` to bypass GPG signature verification
   - Disables timestamp validation (`Check-Valid-Until false`)
   - Allows unauthenticated packages (`AllowUnauthenticated true`)
   - **Security Impact:** Vulnerable to package injection during build
   
3. **System Dependencies (Line 9):** `apt-get install -y curl`
   - Installs curl for Docker healthcheck
   - No security scanning of installed packages
   
4. **Application Setup (Lines 11-17):**
   - Sets working directory to `/app`
   - Copies requirements.txt and installs Python dependencies
   - **Security Gap:** No pip hash verification (`pip install -r requirements.txt` without `--require-hashes`)
   
5. **Secret Injection (Lines 12, 21):**
   - `ARG FLAG` and `ENV FLAG=${FLAG}` expose secret in image layers
   - Docker history reveals FLAG value even if removed later
   
6. **Application Code Copy (Line 18):** `COPY . .`
   - Copies all application code into container
   - No .dockerignore file detected (may copy unnecessary files)
   
7. **Port Exposure (Line 19):** `EXPOSE 5003`
   - Declares application listens on port 5003
   
8. **Container Startup (Line 23):** `CMD ["python", "app.py"]`
   - Runs application directly with Python interpreter (not a production WSGI server)
   - No process manager (no gunicorn, uWSGI, supervisord)

**Container Orchestration (Docker Compose):**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/docker-compose.yml`

Simple single-service deployment:
- Service name: `web`
- Build context: `./app` directory
- Port mapping: Host `5003` → Container `5003`
- Health check: curl to `http://localhost:5003` every 10 seconds
- **Missing:** Environment variable injection, volume mounts, network isolation, resource limits

**Dependency Management (pip/requirements.txt):**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/requirements.txt`

Standard pip requirements file with 21 packages:
- No version pinning with hashes (`--hash=sha256:...`)
- No automated dependency scanning (no GitHub Dependabot, Snyk, Safety)
- No license compliance checking
- No transitive dependency analysis

**Security Implications of Build Tooling:**
1. **Reproducibility Risk:** No hash verification means builds may vary based on when dependencies are downloaded
2. **Supply Chain Risk:** Compromised packages could be installed during build without detection
3. **Secret Leakage:** Build arguments bake secrets into image layers permanently
4. **No Security Scanning:** No Trivy, Clair, or Anchore integration to scan images for vulnerabilities

### Code Generation and Conventions

**No Code Generation Detected:**
- No ORM model generation (SQLAlchemy models hand-written)
- No GraphQL schema generation (Graphene schema defined manually)
- No API client generation (no OpenAPI/Swagger codegen)
- No database migration framework (no Alembic, Flask-Migrate)

**Coding Conventions:**
1. **PEP 8 Compliance:** Code generally follows Python style guide (indentation, naming)
2. **Import Organization:** Standard library → Third-party → Local imports (lines 1-6)
3. **Route Decorators:** Flask route decorators precede function definitions
4. **GraphQL Naming:** CamelCase for types (PrescriptionType), snake_case for resolvers
5. **Template Naming:** Lowercase with underscores (add_prescription.html)

**Security-Relevant Conventions:**
- **No Security Decorators:** No custom `@require_admin`, `@validate_input` decorators
- **No Error Handling:** No try/except blocks around database operations or JSON parsing
- **No Type Hints:** No Python type annotations (no use of `typing` module)
- **No Docstrings:** No function documentation describing security expectations

### Testing Framework (Absent)

**No Testing Infrastructure Found:**
- No `tests/` directory
- No test runner configuration (no pytest.ini, tox.ini, noxfile.py)
- No unit tests for authentication logic
- No integration tests for GraphQL API
- No security-focused test cases (no OWASP ZAP, Burp Suite automation)
- No CI/CD pipeline (no .github/workflows/, .gitlab-ci.yml, Jenkinsfile)

**Impact on Security Discoverability:**
Without automated tests, security vulnerabilities are only discoverable through:
1. Manual code review (time-consuming, error-prone)
2. Manual penetration testing (late in development cycle)
3. Production incidents (worst-case scenario)

The absence of test-driven development means security requirements (input validation, authorization checks, encryption) are not enforced programmatically and can be easily forgotten during development.

---

## 8. Critical File Paths

### Configuration Files
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (Flask configuration, lines 8-11)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/Dockerfile` (Container build configuration)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/docker-compose.yml` (Container orchestration)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/.env` (Environment variables with FLAG)

### Authentication & Authorization
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 14-17: Flask-Login initialization)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 30-33: User loader callback)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 71-83: Login endpoint)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 85-89: Logout endpoint)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 44-45: GraphQL query resolver - no authorization)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 47-58: GraphQL mutation resolver - no authorization)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/login.html` (lines 17-35: Client-side authentication logic)

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (line 65: GraphQL endpoint configuration)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 67-69: Root redirect)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 94-97: Add prescription route)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 99-103: View prescriptions route)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 35-63: GraphQL schema definition)

### Data Models & DB Interaction
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 19-22: User model)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 24-28: Prescription model)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 106-138: Database initialization)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/instance/prescriptions.db` (SQLite database file)

### Dependency Manifests
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/requirements.txt` (Python dependencies)

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (line 9: Hardcoded Flask secret key)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 111-119: Hardcoded user credentials)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (line 125: Flag from environment variable)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/.env` (line 1: FLAG value in plaintext)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/Dockerfile` (lines 12, 21: FLAG as build argument)

### Middleware & Input Validation
- **No dedicated middleware files - all logic in main app.py**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 74-76: Login input handling - no validation)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 54-58: GraphQL mutation - no input sanitization)

### Logging & Monitoring
- **No logging configuration files - no dedicated logging setup**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/docker-compose.yml` (lines 10-13: Docker health check)

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/Dockerfile` (Container build instructions)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/docker-compose.yml` (Container orchestration)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 140-143: Application startup)

### Template Files (XSS/Injection Risks)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/base.html` (lines 7, 40-42: CDN imports without SRI)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/login.html` (lines 26-29: localStorage usage)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/add_prescription.html` (lines 22-32: GraphQL injection vulnerability)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/view_prescriptions.html` (lines 4, 24-32, 38, 43: Template injection, GraphQL IDOR, innerHTML usage)

---

## 9. XSS Sinks and Render Contexts

### Network-Accessible XSS Sinks

**CRITICAL FINDING: GraphQL Injection via Client-Side Query Construction**

**1. GraphQL Mutation Injection - String Interpolation Vulnerability**

**Sink Type:** GraphQL Query Injection (Client-Side String Concatenation)  
**Render Context:** GraphQL mutation argument (String type)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/add_prescription.html`  
**Lines:** 22-32  
**Network Accessible:** YES (served via `/add_prescription` route)

**Vulnerable Code:**
```javascript
const prescriptionDetails = document.getElementById('prescriptionDetails').value;
const userID = localStorage.getItem('userID');

fetch('/api', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        query: `
            mutation {
                addPrescription(userId: ${userID}, prescriptionDetails: "${prescriptionDetails}") {
                    prescription {
                        id
                        userId
                        prescriptionDetails
                    }
                }
            }
        `,
    }),
})
```

**Source of Untrusted Data:**
- **prescriptionDetails:** User input from textarea field (`document.getElementById('prescriptionDetails').value`)
- **userID:** Value from localStorage (modifiable via browser console or XSS)

**Vulnerability Mechanism:**
The `prescriptionDetails` variable is directly interpolated into the GraphQL query string using template literals. An attacker can inject GraphQL syntax by breaking out of the string context with double quotes.

**Exploitation Scenario:**
```javascript
// Attacker input in prescription details field:
Input: test") { id } } mutation { addPrescription(userId: 1, prescriptionDetails: "injected

// Resulting GraphQL query:
mutation {
    addPrescription(userId: 2, prescriptionDetails: "test") { id } } mutation { addPrescription(userId: 1, prescriptionDetails: "injected") {
        prescription {
            id
            userId
            prescriptionDetails
        }
    }
}
```

**Attack Impact:**
- Multiple mutations executed in single request
- Arbitrary GraphQL operations injected
- Potential for data exfiltration via mutation side-effects
- Bypass of client-side validation logic

**Proper Mitigation (Not Implemented):**
```javascript
// CORRECT: Use GraphQL variables instead of string interpolation
body: JSON.stringify({
    query: `
        mutation AddPrescription($userId: Int!, $details: String!) {
            addPrescription(userId: $userId, prescriptionDetails: $details) {
                prescription { id userId prescriptionDetails }
            }
        }
    `,
    variables: {
        userId: parseInt(userID),
        details: prescriptionDetails
    }
})
```

---

**2. GraphQL Query Injection - User ID Parameter**

**Sink Type:** GraphQL Query Injection (Integer Parameter)  
**Render Context:** GraphQL query argument (Int type)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/view_prescriptions.html`  
**Lines:** 24-32  
**Network Accessible:** YES (served via `/view_prescriptions` route)

**Vulnerable Code:**
```javascript
const userID = localStorage.getItem('userID');

fetch('/api', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        query: `
            query {
                getPrescriptions(userId: ${userID}) {
                    id
                    userId
                    prescriptionDetails
                }
            }
        `,
    }),
})
```

**Source of Untrusted Data:**
- **userID:** Retrieved from localStorage (initially set from server response, but modifiable by JavaScript)

**Vulnerability Mechanism:**
While `userID` is expected to be an integer, it can be modified in localStorage to inject GraphQL syntax. An attacker can use browser console to set arbitrary values.

**Exploitation Scenario:**
```javascript
// In browser console:
localStorage.setItem('userID', '1) { id flag } __typename } query { getPrescriptions(userId: 2');

// Resulting GraphQL query:
query {
    getPrescriptions(userId: 1) { id flag } __typename } query { getPrescriptions(userId: 2) {
        id
        userId
        prescriptionDetails
    }
}
```

**Attack Impact:**
- Horizontal privilege escalation (access other users' data by changing userID)
- Injection of additional GraphQL fields (e.g., `flag` field exposure)
- Schema introspection queries via `__typename`, `__schema`
- Bypass of client-side authorization logic

---

**3. Potential XSS via Jinja2 Template Variable**

**Sink Type:** Jinja2 Template Rendering - HTML Context  
**Render Context:** HTML heading element (`<h1>` tag)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/view_prescriptions.html`  
**Line:** 4  
**Network Accessible:** YES (served via `/view_prescriptions` route)

**Vulnerable Code:**
```html
<h1>View {{username}}'s Prescriptions</h1>
```

**Source of Untrusted Data:**
The `username` variable is passed from the Flask route handler:
```python
# File: app.py, lines 99-103
@app.route('/view_prescriptions', methods=['GET'])
@login_required
def view_prescriptions():
    user = current_user
    return render_template('view_prescriptions.html', userID=current_user.id, username=user.username)
```

**Mitigation Status:** PARTIALLY MITIGATED
- Jinja2 has **auto-escaping enabled by default** for HTML context in Flask applications
- Username comes from authenticated database user (not direct user input)
- **However:** If a user could register with a malicious username like `<script>alert(1)</script>`, it would be auto-escaped to `&lt;script&gt;alert(1)&lt;/script&gt;` and rendered as text (not executed)

**Residual Risk:**
- No registration endpoint exists in current codebase (users hardcoded in `init_db()`)
- If future registration functionality allows arbitrary usernames without validation, this could become an XSS vector
- Jinja2 auto-escaping can be bypassed with `{% autoescape false %}` directive or `{{ username|safe }}` filter (not present in current code)

**Exploitation Scenario (Hypothetical):**
```python
# If registration were implemented without validation:
new_user = User(username='<img src=x onerror=alert(1)>', password='...')
db.session.add(new_user)

# On login and viewing prescriptions:
# <h1>View <img src=x onerror=alert(1)>'s Prescriptions</h1>
# Auto-escaped to: <h1>View &lt;img src=x onerror=alert(1)&gt;'s Prescriptions</h1>
```

**Current Assessment:** NOT EXPLOITABLE in current codebase due to Jinja2 auto-escaping and lack of user registration.

---

**4. Safe innerHTML Usage (Not Vulnerable)**

**Sink Type:** JavaScript innerHTML property  
**Render Context:** JavaScript - DOM manipulation  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/view_prescriptions.html`  
**Lines:** 38, 60  
**Network Accessible:** YES

**Code:**
```javascript
const prescriptionsList = document.getElementById('prescriptions-list');
prescriptionsList.innerHTML = "";  // Lines 38, 60 - Clearing list
```

**Assessment:** SAFE
- innerHTML is only set to empty string (`""`) to clear the prescription list
- No user-controlled data assigned to innerHTML
- Actual prescription rendering uses safe `innerText` method (line 43):
  ```javascript
  li.innerText = `${prescription.prescriptionDetails}`;
  ```
- `innerText` prevents script execution by treating content as plain text

**No XSS Risk:** This usage pattern is secure.

---

### XSS Sinks Summary by Category

**GraphQL Injection (HIGH SEVERITY):**
1. **add_prescription.html, line 24:** `prescriptionDetails` string interpolation
2. **view_prescriptions.html, line 26:** `userID` integer interpolation

**Template Injection (LOW SEVERITY - MITIGATED):**
1. **view_prescriptions.html, line 4:** Username in Jinja2 template (auto-escaped)

**innerHTML Sinks (NOT VULNERABLE):**
1. **view_prescriptions.html, lines 38, 60:** Safe usage (empty string only)

**No Traditional XSS Sinks Found:**
- No `eval()` usage
- No `Function()` constructor
- No `setTimeout()/setInterval()` with string arguments
- No `document.write()/writeln()`
- No `element.outerHTML` assignment
- No jQuery `.html()` method (only uses `.slim` version)
- No event handler attributes with user data (onclick, onerror, etc.)
- No `location.href` assignment with user input
- No `window.open()` with user input

---

### Template Injection Findings

**Server-Side Template Injection: NOT VULNERABLE**

All Jinja2 templates use variable rendering (`{{ variable }}`), not expression evaluation. No `{% ... %}` blocks contain user-controlled data. Jinja2 auto-escaping prevents XSS in HTML context.

**No SSTI (Server-Side Template Injection) found.**

---

### SQL Injection Assessment

**Status: NOT VULNERABLE (SQLAlchemy ORM Protection)**

All database queries use SQLAlchemy ORM with parameterized queries:

**Examples:**
- Line 75: `User.query.filter_by(username=data['username']).first()` - Parameterized
- Line 45: `Prescription.query.filter_by(user_id=user_id).all()` - Parameterized
- Lines 111-119: Model instantiation with ORM - Safe
- Lines 54-58: ORM insert via `db.session.add()` - Safe

**No raw SQL queries detected in codebase.**

---

### Command Injection Assessment

**Status: NOT VULNERABLE**

No shell command execution found in application code:
- No `os.system()` calls
- No `subprocess.call()`, `subprocess.Popen()`, `subprocess.run()`
- No `exec()` or `eval()` with user input
- No shell=True subprocess execution

**Dockerfile contains curl command, but no user input:**
```dockerfile
# Line 9: System package installation (not user-controlled)
RUN apt-get update && apt-get install -y curl
```

**Docker healthcheck uses static curl:**
```yaml
# docker-compose.yml, lines 10-13
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5003"]
```

**No command injection attack surface.**

---

## 10. SSRF Sinks

**COMPREHENSIVE ANALYSIS RESULT: NO SSRF SINKS FOUND**

After exhaustive analysis of all network-accessible components, **NO Server-Side Request Forgery (SSRF) attack surface** was identified in the MedGuard application.

### HTTP(S) Client Libraries: NOT PRESENT

**Analysis of Python Imports:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 1-6)
- **Imports:**
  ```python
  from flask import Flask, request, jsonify, render_template, redirect, url_for
  from flask_sqlalchemy import SQLAlchemy
  from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required
  from flask_graphql import GraphQLView
  import graphene
  import os
  ```

**No HTTP client libraries detected:**
- No `import requests`
- No `import urllib`, `urllib2`, `urllib3`, `http.client`, `httplib`
- No `import aiohttp`, `httpx`, `pycurl`
- No `from urllib.request import urlopen`

### Raw Sockets & Network APIs: NOT PRESENT

**No socket programming detected:**
- No `import socket`
- No `socket.connect()`, `socket.bind()`, `socket.send()`
- No low-level network operations

### URL Openers & File Includes: NOT PRESENT

**No file fetching from URLs:**
- No `urllib.urlopen()` usage
- No `requests.get()` with URL parameter
- No file inclusion from remote sources

### Redirect & Location Handlers: SAFE (INTERNAL ONLY)

**Flask Redirects Found:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py`
- **Line 69:** `return redirect(url_for('login'))` - Internal route
- **Line 82:** `return redirect(url_for('add_prescription'))` - Internal route
- **Line 89:** `return redirect(url_for('login'))` - Internal route

**Assessment:** SAFE
- All redirects use Flask's `url_for()` function with hardcoded route names
- No user input in redirect targets
- No external URL redirects

### Headless Browsers & Render Engines: NOT PRESENT

**No browser automation libraries:**
- No Puppeteer, Playwright, Selenium in requirements.txt
- No PDF generation libraries (wkhtmltopdf, weasyprint, reportlab with URL rendering)
- No server-side rendering frameworks

### Media Processors: NOT PRESENT

**No image/video processing libraries:**
- No PIL/Pillow with URL loading
- No ImageMagick, GraphicsMagick (no subprocess calls to `convert`, `identify`)
- No FFmpeg invocation
- No media transcoding services

### Link Preview & Unfurlers: NOT PRESENT

**No link metadata fetching:**
- No oEmbed endpoint consumption
- No Open Graph metadata fetching
- No Twitter/Facebook card generation
- No URL preview functionality

### Webhook Testers & Callback Verifiers: NOT PRESENT

**No webhook functionality:**
- No "test webhook" endpoints
- No callback URL validation
- No outbound notification systems

### SSO/OIDC Discovery & JWKS Fetchers: NOT PRESENT

**No OAuth/OIDC integration:**
- No OpenID Connect discovery (no `.well-known/openid-configuration` fetching)
- No JWKS endpoint fetching
- No external identity provider integration

### Data Importers & Loaders: NOT PRESENT

**No import-from-URL functionality:**
- No CSV import from URL
- No JSON/XML feed consumption
- No RSS/Atom readers
- No data synchronization with external APIs

### Package/Plugin Installers: NOT PRESENT

**No dynamic package installation:**
- No pip install from URLs
- No plugin download mechanisms
- No theme/extension installers

### Monitoring & Health Check Frameworks: SAFE (INTERNAL ONLY)

**Docker Healthcheck:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/docker-compose.yml` (lines 10-13)
- **Command:** `curl -f http://localhost:5003`
- **Assessment:** SAFE - Static URL, not user-controlled

### GraphQL Resolvers: DATABASE-ONLY (NO EXTERNAL CALLS)

**Query Resolver Analysis:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 44-45)
- **Code:**
  ```python
  def resolve_get_prescriptions(self, info, user_id):
      return Prescription.query.filter_by(user_id=user_id).all()
  ```
- **Operations:** Local database query only (SQLAlchemy ORM)
- **No external HTTP requests**

**Mutation Resolver Analysis:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/app.py` (lines 54-58)
- **Code:**
  ```python
  def mutate(self, info, user_id, prescription_details):
      new_prescription = Prescription(user_id=user_id, prescription_details=prescription_details)
      db.session.add(new_prescription)
      db.session.commit()
      return AddPrescription(prescription=new_prescription)
  ```
- **Operations:** Local database insert only
- **No external HTTP requests**

### External Dependencies Analysis

**CDN Resources (Client-Side Only):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-007-24/app/templates/base.html` (lines 7, 40-42)
- **Resources:**
  - Bootstrap CSS: `https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css`
  - jQuery: `https://code.jquery.com/jquery-3.5.1.slim.min.js`
  - Popper.js: `https://cdn.jsdelivr.net/npm/@popperjs/core@2.5.3/dist/umd/popper.min.js`
  - Bootstrap JS: `https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js`

**Assessment:** NOT SSRF ATTACK SURFACE
- These are client-side resources loaded by browser
- Server does not fetch these URLs
- No server-side rendering of external content

### Conclusion

**SSRF Attack Surface: NONE IDENTIFIED**

The MedGuard application is an isolated, database-centric web application with no outbound HTTP request functionality. All user input is processed locally (stored in SQLite database or used in GraphQL responses). The application does not:
- Fetch external URLs
- Consume webhooks or callbacks
- Integrate with third-party APIs
- Perform server-side rendering of external content
- Generate link previews or unfurl URLs
- Connect to external services

**No SSRF sinks found in network-accessible components.**

---

**END OF CODE ANALYSIS DELIVERABLE**

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-27T17:43:43.439Z