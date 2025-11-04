# Reconnaissance Deliverable: XBEN-012-24 Dalgona XSS Challenge Platform

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface for a deliberately vulnerable CTF (Capture The Flag) XSS challenge platform.

**Critical Context:** This application is **intentionally vulnerable by design** as an educational security training tool. The findings document both the intended vulnerabilities (XSS challenge) and architectural security gaps (complete absence of authentication/authorization).

**Key Sections:**
- **Section 3 (Authentication & Session Management):** Documents the complete absence of authentication - all functionality is publicly accessible.
- **Section 4 (API Endpoint Inventory):** Only 2 endpoints exist, both public. The `/page` endpoint is the primary attack surface.
- **Section 5 (Potential Input Vectors):** Single input vector (`name` query parameter) with bypassable XSS filters - this is the intended vulnerability.
- **Section 7 (Role & Privilege Architecture):** No roles exist - completely flat access model.
- **Section 8 (Authorization Vulnerability Candidates):** Not applicable - no authorization to bypass.
- **Section 9 (Injection Sources):** No exploitable command or SQL injection sources found.

**Priority for Analysis:** 
1. Start with Section 5 for XSS Analysis Specialist - the `name` parameter is the primary vulnerability vector
2. Section 3 for Auth Analysis Specialist - document complete absence of authentication as baseline
3. Sections 8 not applicable for Authz specialist - no authorization mechanisms exist

**Application Purpose:** Educational XSS exploitation training platform, NOT a production application.

## 1. Executive Summary

XBEN-012-24 "Dalgona Challenges" is a deliberately vulnerable Cross-Site Scripting (XSS) challenge platform built as a Capture-The-Flag (CTF) training exercise. The application runs on **Python 2.7.18 with Flask 1.1.4**, both critically outdated and no longer receiving security updates. 

**Core Technology Stack:**
- **Frontend:** Static HTML templates served directly by Flask (no JavaScript framework)
- **Backend:** Flask 1.1.4 on Python 2.7.18
- **Infrastructure:** Docker containerization, Werkzeug WSGI server, PhantomJS headless browser for XSS validation
- **Database:** None - completely stateless application

**Attack Surface Overview:**
The application exposes a minimal attack surface consisting of only **2 network-accessible HTTP endpoints**:
1. `/` - Static landing page with challenge selection interface
2. `/page` - XSS challenge endpoint accepting a `name` query parameter

The primary attack vector is the `/page` endpoint which accepts user input via the `name` GET parameter, applies weak regex-based filtering, and reflects the input into an HTML attribute context without proper encoding. This intentional reflected XSS vulnerability is the core challenge - successful exploitation triggers PhantomJS validation and reveals the CTF flag.

**Critical Security Architecture Gaps:**
- **Zero authentication/authorization mechanisms** - all endpoints publicly accessible
- **No session management** - completely stateless with no user tracking
- **No security headers** - missing CSP, X-Frame-Options, HSTS, etc.
- **Plaintext secret storage** - CTF flag stored in `.env` file committed to version control
- **End-of-life software** - Python 2.7.18 (EOL January 2020), PhantomJS (abandoned 2018)
- **Debug mode enabled** - Flask debug mode in source code exposes interactive debugger

The application is suitable only as an educational security training tool and completely inappropriate for production deployment.

## 2. Technology & Service Map

### Frontend
- **Framework:** None - Static HTML templates rendered server-side by Flask
- **Template Engine:** Python string formatting (`.format()`) - NO Jinja2 auto-escaping
- **Static Assets:** 51MB of CSS, images, and fonts served from `/static/` directory
- **Client-Side JavaScript:** None in application code (PhantomJS used server-side only)
- **Authentication Libraries:** None

### Backend
- **Language:** Python 2.7.18 (End-of-Life since January 2020)
- **Framework:** Flask 1.1.4 (outdated, current version is 3.x)
- **WSGI Server:** Werkzeug 1.0.1
- **Key Dependencies:** 
  - Flask==1.1.4 (vulnerable to CVE-2023-30861, CVE-2019-1010083)
  - phantomjs (Python wrapper, abandoned project)
- **Subprocess Execution:** PhantomJS headless browser via `subprocess.Popen()`
- **Security Libraries:** None (no input validation frameworks, no CSRF protection, no rate limiting)

### Infrastructure
- **Hosting:** Docker containerization (Debian Buster base image via archived repositories)
- **CDN:** None
- **Reverse Proxy:** None (Flask serves directly on port 5000)
- **Database Type:** None - completely stateless, no persistence layer
- **Session Store:** None - no Redis, no database sessions, no in-memory sessions
- **Secret Management:** Plaintext `.env` file and `secret.txt` filesystem storage

### Identified Subdomains
From subfinder scan (not directly relevant to this localhost deployment):
- www.localhost
- mail.localhost
- autodiscover.localhost
- Several organizational subdomains (regency, naeuinc, sonoma.edu, etc.)

**Note:** These subdomains appear to be generic subdomain enumeration results not specific to this application.

### Open Ports & Services
From nmap scan of localhost:
- **Port 5000 (Target):** HTTP - Werkzeug/1.0.1 Python/2.7.18 - **"Dalgona Challenges"** application
- Port 22: SSH - OpenSSH 9.9
- Port 80: HTTP - Caddy httpd
- Port 443: HTTPS - SSL/HTTPS
- Port 8000: HTTP - WSGIServer 0.2 (Python 3.12.9) - "SSTI Demo"
- Port 8001: HTTP - WSGIServer 0.2 (Python 3.12.9) - "SSTI Demo"
- Port 8888: HTTP - BaseHTTPServer 0.6 (Python 3.12.9) - "SSRF Test Server"
- Port 9999: HTTP - SimpleHTTPServer 0.6 (Python 3.12.9)

**Target Application:** Port 5000 is the primary target running the Dalgona Challenges XSS platform.

## 3. Authentication & Session Management Flow

### Entry Points
**NONE - No authentication endpoints exist**

The application has zero authentication mechanisms:
- No `/login` endpoint
- No `/register` endpoint
- No `/logout` endpoint
- No `/auth/*` routes
- No password reset functionality
- No OAuth/SSO integration

### Mechanism
**NOT IMPLEMENTED**

Evidence of complete absence:
- No authentication decorators (`@login_required`, `@auth_required`) in codebase
- No Flask session imports - `session` object not imported from Flask
- No `app.secret_key` configured (required for Flask session encryption)
- No authentication libraries in `requirements.txt` (no Flask-Login, Flask-JWT-Extended, Flask-HTTPAuth)
- No password hashing libraries (no bcrypt, argon2, passlib)
- No session storage backend (no Redis, no database)

**Request Processing:**
```python
# File: src/app.py, Line 66
msg = request.args.get('name','')  # Only query parameter access, no session/cookie validation
```

All routes are completely public with no authentication checks:
```python
# File: src/app.py, Lines 29-31
@app.route('/')  # No authentication decorator
def index():
    return INDEX_CONTENT

# File: src/app.py, Lines 64-73
@app.route('/page')  # No authentication decorator
def page_handler():
    msg = request.args.get('name','')
    # ... XSS challenge logic, no auth checks ...
```

### Code Pointers
**NOT APPLICABLE - No authentication code exists**

All authentication-related code locations are absent:
- No session management: `src/app.py` contains no session operations
- No credential validation: No password checking logic exists
- No token generation: No JWT or bearer token code
- No cookie security: No `set_cookie()` calls with security flags

### 3.1 Role Assignment Process

**Role Determination:** NOT APPLICABLE - No user roles exist

**Default Role:** Anonymous/Public (implicit) - All requests treated identically

**Role Upgrade Path:** NOT APPLICABLE - No roles to upgrade between

**Code Implementation:** NONE - No role assignment logic exists

Evidence:
- Zero references to "role", "admin", "user", "permission" in application code
- No user database or user model
- No role checking functions
- No authorization middleware

### 3.2 Privilege Storage & Validation

**Storage Location:** NOT APPLICABLE - No privileges tracked

**Validation Points:** NONE - No privilege checks anywhere in codebase

**Cache/Session Persistence:** NOT APPLICABLE - No sessions exist

**Code Pointers:** NONE

Flask configuration (File: `src/app.py`, Lines 24-25):
```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True  # Only configuration present
# NO app.secret_key - session encryption impossible
# NO session storage configuration
```

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NOT IMPLEMENTED

**Role Switching:** NOT IMPLEMENTED

**Audit Trail:** NOT IMPLEMENTED

**Code Implementation:** NONE

The application has no concept of user identity, therefore no ability to switch between users or roles.

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed are network-accessible via HTTP requests to the deployed Flask application on port 5000.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|---------------------------|
| GET | `/` | anon | None | None | Static landing page displaying "Dalgona Challenges" interface with link to XSS challenge. Returns `INDEX_CONTENT` constant. **Code:** `src/app.py:29-31` |
| GET | `/page` | anon | None | None | **PRIMARY ATTACK SURFACE** - XSS challenge endpoint. Accepts `name` query parameter, applies weak regex filters, reflects input in HTML attribute, validates XSS with PhantomJS, returns flag on successful exploitation. **Code:** `src/app.py:64-73` **Helper:** `check_result()` at `src/app.py:33-61` |
| GET | `/static/<path:filename>` | anon | filename (path parameter) | None | Flask built-in static file server. Serves CSS, images, and temporarily created HTML files from `src/static/` directory. Includes race condition window where temporary HTML files created by `check_result()` are accessible. **Code:** Flask default handler |

**Endpoint Details:**

### Endpoint 1: `GET /`
- **Purpose:** Landing page presenting challenge selection interface
- **Input Validation:** None required (no user input)
- **Output:** Static HTML template from `constants.py`
- **Security Notes:** Safe from injection attacks, but lacks security headers (no CSP, X-Frame-Options)

### Endpoint 2: `GET /page` (Critical Attack Surface)
- **Purpose:** XSS exploitation challenge
- **Input Parameter:** `name` (GET query parameter, optional, default empty string)
- **Input Validation:** Two weak regex filters:
  1. `re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)` - Removes quoted "XSS" strings
  2. `re.sub(r"""<[a-z/]""", "", msg, flags=re.IGNORECASE)` - Removes HTML tag openings
- **Vulnerability:** Reflected XSS via HTML attribute injection (INTENTIONAL)
- **Data Flow:**
  1. Extract `name` parameter from query string
  2. Apply weak regex filters
  3. Construct HTML value attribute: `value="{filtered_input}"`
  4. Write complete page to temporary file in `static/` directory
  5. Execute PhantomJS subprocess to detect JavaScript execution
  6. Return success message with flag if XSS detected, error message otherwise
- **Flag Disclosure:** Returns `flag{b91f8b08-7d57-4a21-9ef3-1e247ebdd314}` on successful XSS exploitation
- **Security Notes:** 
  - Filters are easily bypassable using event handlers (`onfocus`, `onclick`, `onmouseover`)
  - No HTML entity encoding applied
  - Subprocess execution with 5-second timeout (prevents DoS)
  - Temporary files create race condition window for unauthorized access

### Endpoint 3: `GET /static/<path:filename>`
- **Purpose:** Serve static assets and temporary HTML files
- **Input Parameter:** `filename` (path parameter)
- **Security Notes:** 
  - Flask provides default directory traversal protection
  - Temporary HTML files (`{random_hex}.html`) exist briefly during PhantomJS validation
  - Random filename generation uses `os.urandom(16)` (cryptographically secure)
  - Files deleted after validation (Line 50: `os.unlink(fn)`)

**No Other Endpoints:** Application has only 3 routes total. No API versioning, no admin endpoints, no user management, no CRUD operations.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through HTTP requests to the deployed application are listed. No local-only scripts, build tools, or development utilities included.

### Primary Input Vector: `name` Query Parameter (CRITICAL)

**Location:** `/page` endpoint
**Input Method:** GET query string parameter
**File Path:** `src/app.py:66`
**Code:** `msg = request.args.get('name','')`

**Validation Applied:**
- **Line 67:** `re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)` - Remove quoted "XSS" strings
- **Line 68:** `re.sub(r"""<[a-z/]""", "", msg, flags=re.IGNORECASE)` - Remove HTML tag openings

**Output Context:** HTML attribute (input element value attribute)
**Line 69:** `value = "" if msg == "" else 'value="{0}"'.format(msg)`

**Exploitability:** HIGH - Filters are easily bypassable

**Example Bypass Payloads:**
- `" onfocus=alert(1) autofocus="` - Auto-executes on page load
- `" onclick=alert(document.domain) "` - Executes on click
- `" onmouseover=alert`xss` "` - Executes on hover
- `" onfocus=eval(atob('YWxlcnQoMSk=')) autofocus="` - Base64-encoded payload

**Data Flow:**
```
User Input (GET ?name=) 
  → request.args.get() [Line 66]
  → Regex filter #1 [Line 67] 
  → Regex filter #2 [Line 68]
  → String formatting [Line 69]
  → HTML template injection [Line 71]
  → File write to static/ [Line 37-39]
  → PhantomJS subprocess [Line 34]
  → Response to user [Line 73]
```

### No Other Input Vectors

**URL Parameters:** Only `name` parameter used, no other query parameters processed

**POST Body Fields:** NOT USED - Application has no POST endpoints
- Several POST templates exist in `constants.py` (`CONTENT_POST`, `CONTENT_TAG_POST`, `CONTENT_TEXTAREA_POST`)
- These templates are NEVER referenced in `app.py` route handlers
- No form submission endpoints exist

**HTTP Headers:** NOT PROCESSED
- No custom header reading (no `request.headers.get()` calls)
- Application does not inspect `User-Agent`, `X-Forwarded-For`, `Referer`, or custom headers

**Cookie Values:** NOT USED
- No `request.cookies` access in code
- No session cookies (no session management)
- No authentication cookies

**File Uploads:** NOT SUPPORTED
- No file upload endpoints
- No `request.files` processing
- No multipart/form-data handling

**JSON Payloads:** NOT SUPPORTED
- No `request.json` access
- No JSON parsing logic
- All endpoints return HTML (no JSON API)

**Request Body:** NOT PROCESSED
- No `request.data` or `request.get_data()` calls
- Only query parameter input accepted

## 6. Network & Interaction Map

**Network Surface Focus:** Only network-accessible components of the deployed Flask application on port 5000 are mapped. Local development tools, build systems, and components outside the application's request-response cycle are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| DalgonaChallengeApp | Service | App | Python 2.7.18/Flask 1.1.4/Werkzeug | Public, Secrets | Main XSS challenge application, serves on port 5000 |
| PhantomJSValidator | Service | App | PhantomJS (abandoned 2018) | Public | Headless browser for XSS detection, spawned as subprocess |
| StaticFileStore | DataStore | App | Filesystem (Docker volume) | Public, Temporary | Stores CSS/images permanently, temporary HTML files during validation |
| SecretFile | DataStore | App | Filesystem (plaintext) | Secrets | Contains CTF flag in plaintext at `src/secret.txt` |
| UserBrowser | ExternAsset | Internet | Any browser | Public | External attacker accessing public endpoints |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| DalgonaChallengeApp | Hosts: `http://localhost:40095` (mapped from container port 5000); Endpoints: `/` (landing), `/page` (XSS challenge), `/static/*` (assets); Auth: None - completely public; Dependencies: PhantomJSValidator, StaticFileStore, SecretFile; Config: Flask debug mode potentially enabled, exception propagation enabled |
| PhantomJSValidator | Engine: PhantomJS headless browser (WebKit-based, abandoned 2018); Invocation: `subprocess.Popen(["timeout","5","phantomjs","check.js"])` at Line 34; Purpose: Detects JavaScript execution (alert/confirm/prompt) to validate XSS exploitation; Timeout: 5 seconds per validation; Input: URL to temporary HTML file via stdin; Output: "XSS" string if successful, error message otherwise |
| StaticFileStore | Location: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/static/`; Contents: 51MB CSS, images, fonts; Temporary Files: Random-named HTML files created during PhantomJS validation; Exposure: Public via `/static/*` route; Cleanup: Temporary files deleted after validation (Line 50: `os.unlink(fn)`) |
| SecretFile | Path: `src/secret.txt`; Contents: CTF flag `flag{b91f8b08-7d57-4a21-9ef3-1e247ebdd314}`; Creation: Injected during Docker build via sed replacement; Source: `.env` file (committed to version control); Protection: Filesystem permissions only; Exposure: Revealed in HTTP response on successful XSS exploitation |
| UserBrowser | Access: Public internet; Authentication: None required; Network Path: HTTP requests to port 40095; Capabilities: Can trigger all endpoints, submit XSS payloads, retrieve flag |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → DalgonaChallengeApp | HTTPS/HTTP | `:40095 /` | None | Public |
| UserBrowser → DalgonaChallengeApp | HTTPS/HTTP | `:40095 /page?name=` | None | Public, Secrets (flag on success) |
| UserBrowser → DalgonaChallengeApp | HTTPS/HTTP | `:40095 /static/*` | None | Public |
| DalgonaChallengeApp → StaticFileStore | File I/O | `static/{random}.html` | None | Public, Temporary |
| DalgonaChallengeApp → PhantomJSValidator | Process Spawn | stdin/stdout pipes | timeout:5s | Public |
| PhantomJSValidator → StaticFileStore | HTTP | `localhost:5000/static/{random}.html` | None | Public |
| DalgonaChallengeApp → SecretFile | File I/O | `secret.txt` read | None | Secrets |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | **NO AUTHENTICATION GUARDS EXIST** - All endpoints are completely public |
| timeout:5s | RateLimit | PhantomJS subprocess execution limited to 5 seconds via `timeout` command to prevent DoS |

**Critical Absence:** No authorization guards, no authentication mechanisms, no network restrictions, no CORS policies, no rate limiting on endpoints, no IP allowlisting, no multi-tenant isolation.

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**NONE - No role system exists**

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (implicit default) | Global | No authentication required - all requests treated as anonymous |

**Evidence of Absence:**
- Zero role definitions in codebase (no `ADMIN`, `USER`, `GUEST` constants)
- No user model or user database
- No role checking functions (no `is_admin()`, `has_role()`, `check_permission()`)
- No authorization decorators (no `@require_role('admin')`)
- No role-based conditionals (no `if user.role == 'admin'` patterns)

**Verification:**
```bash
# Searches performed across entire codebase:
grep -r "role\|admin\|user_type\|permission\|is_admin" src/ --include="*.py"
# Result: 0 matches

grep -r "@login_required\|@auth_required\|@require" src/ --include="*.py"  
# Result: 0 matches
```

### 7.2 Privilege Lattice

**NOT APPLICABLE - Flat access model with no hierarchy**

```
Privilege Ordering:
anonymous (all users, no distinction)

No privilege levels exist
No role hierarchy exists
No permission inheritance
No domain/scope isolation
```

**Note:** Since all users are treated identically as anonymous/public, there is no privilege escalation possible (no privileges to escalate to).

### 7.3 Role Entry Points

**NOT APPLICABLE - No role-specific dashboards**

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/`, `/page`, `/static/*` (all routes) | None |

**All routes are publicly accessible:**
- No login wall
- No authenticated-only sections
- No admin panels
- No user profiles
- No role-specific functionality

### 7.4 Role-to-Code Mapping

**NOT APPLICABLE - No roles to map**

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| N/A | None | None | N/A |

**Flask Application Structure:**
```python
# File: src/app.py

app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
# NO authentication middleware
# NO authorization decorators
# NO session configuration
# NO role definitions

@app.route('/')  # Completely public
def index():
    return INDEX_CONTENT

@app.route('/page')  # Completely public
def page_handler():
    # No authentication check
    # No authorization check
    # No session validation
    msg = request.args.get('name','')
    # ... XSS challenge logic ...
```

## 8. Authorization Vulnerability Candidates

**NOT APPLICABLE** - No authorization mechanisms exist to test for vulnerabilities.

This section typically identifies endpoints with authorization flaws (horizontal privilege escalation, vertical privilege escalation, context-based bypasses). However, this application has **zero authorization controls**, making traditional authorization vulnerability testing irrelevant.

### 8.1 Horizontal Privilege Escalation Candidates

**NONE** - No object ownership or user-to-user isolation exists

The application has:
- No user accounts (cannot access other users' resources)
- No object ID parameters (no `user_id`, `order_id`, `file_id` to manipulate)
- No resource ownership concept
- No IDOR (Insecure Direct Object Reference) vectors

### 8.2 Vertical Privilege Escalation Candidates

**NONE** - No privilege levels to escalate between

The application has:
- No admin role to escalate to
- No elevated privilege functions
- No role-checking logic to bypass
- All functionality already accessible to anonymous users

### 8.3 Context-Based Authorization Candidates

**NONE** - No workflow states or multi-step processes

The application has:
- No multi-step workflows (checkout, onboarding, password reset)
- No state validation between steps
- No sequential operation enforcement
- Single-step XSS challenge only

**Note for Authorization Analysis Specialist:** This application is **out of scope** for authorization vulnerability testing due to complete absence of authorization architecture. Consider this a baseline "no authorization" case study rather than an authorization bypass scenario.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only sources accessible via HTTP requests to the deployed Flask application are listed. Local-only scripts, CLI tools, and development utilities are excluded.

### SQL Injection Sources

**NONE FOUND** - No database exists in application

**Evidence:**
- No database libraries imported (no sqlite3, psycopg2, mysql-connector, pymongo, SQLAlchemy)
- No database connection code in codebase
- No SQL queries constructed or executed
- No ORM models defined
- `requirements.txt` contains only Flask and phantomjs dependencies

**Verification:**
```bash
# Searches performed:
grep -r "execute\|cursor\|db\.\|query\|SELECT\|INSERT\|UPDATE\|DELETE" src/ --include="*.py"
# Result: 0 matches for SQL patterns
```

**Conclusion:** Application is completely stateless with no data persistence layer. SQL injection is impossible.

### Command Injection Sources

**FINDING: 1 subprocess execution found - NOT EXPLOITABLE**

#### Source #1: PhantomJS Subprocess Execution (SECURE)

**Source Type:** Command Injection (Potential) - Analysis shows NOT exploitable

**File Path:** `src/app.py:34`

**Input Vector:** `name` query parameter from `/page` endpoint

**Code:**
```python
# Line 34 - Subprocess invocation
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                       stdout=subprocess.PIPE, stdin=subprocess.PIPE)

# Line 35-39 - File handling
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn
of = open(fn, 'w')
of.write(page)  # page contains user input embedded in HTML
of.close()

# Line 42 - Data passed to subprocess
proc.stdin.write(url)  # Only URL passed, NOT raw user input
```

**Data Flow Trace:**
```
1. User Input Entry (Line 66):
   msg = request.args.get('name','')

2. Sanitization (Lines 67-68):
   msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)
   msg = re.sub(r"""<[a-z/]""", "", msg, flags=re.IGNORECASE)

3. HTML Construction (Line 69):
   value = "" if msg == "" else 'value="{0}"'.format(msg)

4. Template Rendering (Line 71):
   data = CONTENT_TEMPLATE.format("11", "Triangle", value, "", "")

5. Subprocess Invocation (Line 72):
   result = check_result(data, flags[0], msg, 'level_easy_med')

6. Within check_result() (Lines 34-42):
   - Hardcoded command array: ["timeout","5","phantomjs", "check.js"]
   - Random filename generation: os.urandom(16).encode('hex') + '.html'
   - File write: of.write(page)  # User input in HTML content
   - Stdin communication: proc.stdin.write(url)  # URL only, not user input
```

**Why NOT Exploitable:**

1. **Hardcoded Command Array:** 
   - Command is fixed: `["timeout","5","phantomjs", "check.js"]`
   - No user input interpolated into command
   - Array format prevents shell interpretation
   - No `shell=True` parameter (secure by default)

2. **User Input Not in Command Arguments:**
   - Only URL written to stdin: `proc.stdin.write(url)`
   - URL constructed from random bytes: `'http://localhost:5000/' + os.urandom(16).encode('hex') + '.html'`
   - No user input in the URL itself

3. **User Input Only in File Contents:**
   - User input embedded in HTML file content (written to `static/{random}.html`)
   - PhantomJS loads this as a web page (HTML/JavaScript context)
   - Creates XSS risk (intended), NOT command injection risk

4. **No Shell Metacharacter Interpretation:**
   - No `shell=True` in Popen call
   - No subprocess.call() or os.system() usage
   - No shell metacharacters processed (`;`, `|`, `&`, `$()`, etc.)

**Validation Applied:**
- Weak regex filters for XSS (Lines 67-68) - NOT relevant for command injection
- No command injection sanitization needed - command is hardcoded

**Exploitability:** **NONE** - Subprocess invocation is secure from command injection

**Security Impact:**
- Command Injection: Not possible
- XSS: Intentionally vulnerable (CTF challenge)
- Race Condition: Temporary file briefly accessible via `/static/{random}.html` before deletion

### Additional Command Execution Analysis

**No Other Command Execution Sinks:**
- No `os.system()` calls
- No `os.popen()` calls
- No `subprocess.call()` with user input
- No `eval()` or `exec()` with user input
- No shell command construction from user data

**Verification:**
```bash
# Searches performed:
grep -r "os\.system\|os\.popen\|subprocess\.\|eval\(\|exec\(" src/ --include="*.py"
# Result: Only subprocess.Popen() at Line 34 (analyzed above as secure)
```

### Conclusion

**Total Command Injection Sources:** 0 exploitable  
**Total SQL Injection Sources:** 0 (no database)

The application is secure against command injection and SQL injection. The single subprocess execution uses a hardcoded command array with no user input in command arguments, preventing command injection attacks.

**Note for Injection Analysis Specialist:** Focus on XSS vulnerabilities (Section 5) rather than command/SQL injection. The application's minimal functionality and stateless architecture eliminate traditional injection attack surfaces.

---

## Summary

This reconnaissance analysis documents the complete attack surface of XBEN-012-24, a deliberately vulnerable XSS challenge platform. The application's minimal scope (2 public endpoints, no authentication, no database, no authorization) creates a focused attack surface centered on the intentional reflected XSS vulnerability in the `/page` endpoint's `name` parameter.

**Key Takeaways for Downstream Analysis:**
- **XSS Specialist:** Focus on `name` parameter in `/page` endpoint - primary vulnerability vector
- **Auth Specialist:** Document complete absence of authentication as baseline security gap
- **Authz Specialist:** No authorization to analyze - application out of scope
- **Injection Specialist:** No SQL/Command injection vectors - focus on XSS only
- **SSRF Specialist:** PhantomJS subprocess is secure (hardcoded URLs), no SSRF attack surface

**Application Context:** Educational security training tool, NOT production-ready software.