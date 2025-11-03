# Reconnaissance Deliverable: Dalgona Challenges XSS Training Platform

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is an intentionally vulnerable Flask-based XSS training platform with minimal functionality and ZERO security controls.

**Key Insights:**
- **No Authentication/Authorization:** This application has absolutely NO authentication, authorization, session management, or access controls. Every endpoint is publicly accessible.
- **Intentional XSS Vulnerability:** The `/page` endpoint has a deliberately weak regex filter designed to be bypassed for XSS challenge purposes.
- **Single Attack Vector:** The only user input is the `?name=` query parameter on `/page` endpoint.
- **Critical Secret Exposure:** The CTF flag is committed to Git version control (`.env` file), completely bypassing the intended XSS challenge.

**Attack Surface Summary:**
- 2 application endpoints: `/` (landing) and `/page` (XSS challenge)
- 1 user input vector: `?name=` query parameter
- 0 authentication mechanisms
- 0 authorization checks  
- 0 session management
- 0 database interactions (no SQL injection possible)
- 0 external API calls (no SSRF possible)

**Primary Vulnerabilities:**
1. Reflected XSS via HTML attribute injection (intentional)
2. Server-side XSS via PhantomJS rendering (intentional)
3. Flag exposed in Git history (unintentional, critical)
4. No rate limiting or access controls (by design)

## 1. Executive Summary

**Application Purpose:** "Dalgona Challenges" (XBEN-049-24) is a deliberately vulnerable Flask-based web application designed as a Cross-Site Scripting (XSS) training platform. The application challenges users to craft XSS payloads that bypass weak regex filtering and trigger an `alert('XSS')` in a PhantomJS headless browser to retrieve a CTF flag.

**Core Technology Stack:**
- **Backend:** Python 2.7.18 (EOL since January 2020) with Flask 1.1.4
- **Frontend:** Static HTML templates with inline CSS, no JavaScript frameworks
- **Validation:** PhantomJS 2.1.1 (abandoned since 2018) for server-side XSS detection
- **Container:** Docker with Debian Buster (EOL June 2022)
- **Web Server:** Flask development server on port 5000 (HTTP only, no TLS)

**Primary User-Facing Components:**
1. **Landing Page (`/`)** - Static welcome page with link to XSS challenge
2. **XSS Challenge Page (`/page?name=`)** - Interactive form that reflects user input through weak filtering
3. **Static Assets (`/static/*`)** - CSS, images, fonts, and temporary HTML files

**Security Posture:** This application has a **CRITICAL** security posture with intentional vulnerabilities for training purposes:
- **Intentional:** Reflected XSS vulnerability with bypassable regex filters
- **Unintentional:** CTF flag exposed in Git version control history (`.env` file in commit `2a45b0a`)
- **Architectural:** Complete absence of authentication, authorization, and security controls
- **Technology Stack:** Every component is end-of-life with known unpatched vulnerabilities

**Attack Surface:** The application exposes a minimal, focused attack surface:
- 2 network-accessible endpoints (excluding static files)
- 1 user input parameter (`?name=` on `/page`)
- No authentication required for any functionality
- Flag accessible via XSS exploit or Git repository access

## 2. Technology & Service Map

### Frontend
- **Framework:** None - Raw HTML templates stored as Python strings
- **Key Libraries:** None - No JavaScript frameworks or libraries
- **CSS:** Custom stylesheets with Game-Of-Squids themed design
- **Authentication Libraries:** None

### Backend
- **Language:** Python 2.7.18 (End-of-Life since January 1, 2020)
- **Framework:** Flask 1.1.4 (released March 2021, multiple known CVEs)
- **Key Dependencies:**
  - Flask 1.1.4 (web framework)
  - PhantomJS (abandoned headless browser from 2018)
  - Werkzeug (Flask dependency, vulnerable to CVE-2023-30861)
- **Validation Logic:** Regex-based blacklist filtering (intentionally weak)
- **Subprocess Execution:** PhantomJS for XSS payload validation

### Infrastructure
- **Hosting Provider:** Docker container (local deployment)
- **Container Base:** python:2.7.18-slim (Debian Buster EOL)
- **CDN:** None
- **Database Type:** None - completely stateless application
- **Web Server:** Flask development server (`app.run(host='0.0.0.0', port=5000, threaded=True)`)
- **Reverse Proxy:** None detected
- **Load Balancer:** None
- **TLS/SSL:** Disabled (`ENV OPENSSL_CONF=/dev/null` in Dockerfile)

### Identified Subdomains
**Source:** Subfinder external scan from pre-recon

The following subdomains were discovered, but are **NOT part of this application's deployment**. These appear to be noise from subfinder's database or unrelated localhost entries:

- mse-ca-mail.corp.mse.localhost
- autodiscover.regency.localhost
- mail03.regency.localhost
- mail.regency.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- tools.sonoma.edu.localhost
- www.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.localhost
- mail02.regency.localhost
- server2.hunter.localhost
- exchvm.nwcnet.localhost
- naeu2.naeuinc.localhost
- server02.counterintel.localhost
- mail.localhost

**Assessment:** These subdomains are **OUT OF SCOPE** - they do not resolve to or relate to the target application at http://localhost:42211.

### Open Ports & Services
**Source:** Nmap scan from pre-recon

**Target Port (In-Scope):**
- **Port 42211 (mapped to 5000):** HTTP service running Flask/Werkzeug 1.0.1 with Python 2.7.18
  - Service: Dalgona Challenges XSS platform
  - Title: "Dalgona Challenges"
  - Purpose: Main application endpoint

**Other Ports Detected (Out-of-Scope):**
The following ports were detected on the localhost scan but are **NOT part of the target application**:

- **Port 80:** Caddy httpd (unrelated service)
- **Port 443:** SSL/HTTPS (unrelated service)
- **Port 631:** CUPS 2.3 (printer service, out of scope)
- **Port 8081:** Apache httpd 2.4.56 "Submit a username" (different application)
- **Port 9999:** Unknown service with CORS headers (out of scope)
- **Port 49152:** Golang net/http server (Tailscale, out of scope)

**Assessment:** Only port 42211 (Flask application) is in scope for this reconnaissance.

## 3. Authentication & Session Management Flow

### Entry Points
**NONE** - This application has absolutely NO authentication system.

**Evidence:**
- No login endpoint (`/login` does not exist)
- No registration endpoint (`/register` does not exist)
- No authentication-related routes
- No authentication libraries imported (flask-login, flask-jwt-extended, etc.)
- No password hashing imports (werkzeug.security, bcrypt, argon2)
- Flask `session` object never imported or used
- No `SECRET_KEY` configured in Flask app

**Comprehensive Search Results:**
```python
# All Flask imports in application
from flask import Flask, request, Response, make_response, url_for
# Note: 'session' is NOT imported

# Complete Flask configuration
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
# Note: No SECRET_KEY, no session configuration
```

### Mechanism
**NOT APPLICABLE** - No authentication mechanism exists.

The application is completely stateless with no concept of users, sessions, or authentication. Every HTTP request is processed independently without any user context or access controls.

**Route Analysis:**
```python
@app.route('/')
def index():
    return INDEX_CONTENT
    # No @login_required decorator
    # No session checks
    # No token validation

@app.route('/page')
def page15():
    msg = request.args.get('name','')
    # No authentication required
    # No user context
    # Flag accessible to anyone who solves XSS challenge
```

### Code Pointers
**NOT APPLICABLE** - No authentication or session management code exists in the codebase.

**Files Analyzed:**
- `/src/app.py` - Main application (76 lines) - No auth code
- `/src/constants.py` - HTML templates (206 lines) - No auth code
- `/src/requirements.txt` - Dependencies (2 lines) - No auth libraries

### 3.1 Role Assignment Process

**NOT APPLICABLE** - No role system exists.

**Role Determination:** N/A - No user model, no database, no role storage
**Default Role:** All users are unauthenticated/anonymous with full access to all endpoints
**Role Upgrade Path:** N/A - No role system
**Code Implementation:** No role assignment logic exists

### 3.2 Privilege Storage & Validation

**NOT APPLICABLE** - No privilege system exists.

**Storage Location:** N/A - No user privileges stored
**Validation Points:** N/A - No authorization checks at any endpoint
**Cache/Session Persistence:** N/A - Application is stateless
**Code Pointers:** No privilege validation code exists

### 3.3 Role Switching & Impersonation

**NOT APPLICABLE** - No role system exists.

**Impersonation Features:** None
**Role Switching:** None  
**Audit Trail:** None - No logging of access or actions
**Code Implementation:** None

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are network-accessible through the deployed Flask application at http://localhost:42211.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | / | anon | None | None | Landing page with link to XSS challenge. Returns static HTML from `INDEX_CONTENT` constant. See `src/app.py:29-31` |
| GET | /page | anon | None | None | XSS challenge endpoint. Accepts `?name=` query parameter, applies weak regex filtering, reflects input in HTML attribute, validates via PhantomJS, returns flag if `alert('XSS')` detected. See `src/app.py:63-72` |
| GET | /static/&lt;path&gt; | anon | None | None | Flask built-in static file serving. Serves CSS, images, fonts from `src/static/` directory. Also temporarily serves generated HTML files during XSS validation (race condition window ~2 seconds). Flask default handler. |

**Total Endpoints:** 3 (2 application routes + 1 built-in static handler)

**Authorization Summary:**
- **All endpoints are publicly accessible** - No authentication or authorization required
- **No role-based access control** - No distinction between users
- **No object ownership validation** - No user-specific data or resources
- **No API keys or tokens** - No bearer token authentication
- **Flag disclosure path:** `/page?name=<XSS_PAYLOAD>` → PhantomJS detects `alert('XSS')` → Returns flag in response

**Critical Finding:** The flag (intended reward for solving XSS challenge) is accessible to any unauthenticated user who can craft a successful XSS payload. Additionally, the flag is exposed in Git history (`.env` file), completely bypassing the challenge.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through the target web application's network interface at http://localhost:42211.

### URL Parameters
**Location:** `GET /page`
**Parameter:** `name`
**Code:** `src/app.py:65` - `msg = request.args.get('name','')`
**Validation:** Weak regex filtering (lines 66-67):
  - Removes `"XSS"` or `'XSS'` strings (case-insensitive)
  - Removes `<script>` tags
  - **Bypasses:** HTML attribute injection, event handlers, tag injection
**Data Flow:** Query param → Regex filter → String formatting → HTML template → File write → PhantomJS rendering → Flag disclosure
**Attack Vectors:** Reflected XSS, HTML injection, attribute injection
**Risk Level:** CRITICAL

### POST Body Fields (JSON/Form)
**NOT PRESENT** - Application does not accept POST requests or JSON payloads.

**Evidence:**
- No routes with `methods=['POST']` parameter
- No `request.form.get()` usage
- No `request.json` or `request.get_json()` usage
- All endpoints use GET method only

### HTTP Headers
**NOT USED** - Application does not read or process HTTP headers as user input.

**Evidence:**
- No `request.headers.get()` usage found
- No custom header parsing
- No User-Agent, Referer, or X-Forwarded-For processing
- Headers are not logged or processed by application logic

### Cookie Values
**NOT USED** - Application does not read or set cookies.

**Evidence:**
- No `request.cookies.get()` usage
- No `response.set_cookie()` calls
- `make_response` imported but never used
- No session cookies (no session management)
- No authentication cookies
- No tracking cookies

### File Uploads
**NOT SUPPORTED** - Application does not accept file uploads.

**Evidence:**
- No `request.files` usage
- No file upload form fields in HTML
- No multipart/form-data handling
- No file validation or processing logic

### Complete Input Vector Summary
**Total Input Vectors:** 1 (one)
**Vector:** `GET /page?name=<user_input>`
**Location:** `src/app.py:65`
**Validation:** Weak regex (bypassable)
**Primary Vulnerability:** Reflected XSS via HTML attribute injection

## 6. Network & Interaction Map

**Network Surface Focus:** This section maps only network-accessible components that are part of the deployed application infrastructure. All local-only development tools, build systems, and non-deployed components are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| ExternalUser | ExternAsset | Internet | Browser | None | Anonymous external users accessing the application |
| FlaskApp | Service | App | Python 2.7/Flask 1.1.4 | Flag, HTML | Main XSS challenge application, stateless |
| PhantomJS | Service | App | PhantomJS 2.1.1 | User HTML | Headless browser for XSS validation, spawned per request |
| StaticFiles | DataStore | App | Filesystem | CSS, Images, Temp HTML | Static assets directory, also stores temporary validation files |
| FlagFile | DataStore | App | Filesystem (secret.txt) | Flag | Plaintext flag storage, loaded at startup |

**Notes:**
- No database entity (application has no persistence layer)
- No external API entities (no third-party integrations)
- No authentication service (no identity provider)
- No caching layer (stateless application)
- All entities run within single Docker container

### 6.2 Entity Metadata

| Title | Metadata Key: Value |
|-------|---------------------|
| FlaskApp | Host: `0.0.0.0:5000` (container internal); Exposed: `localhost:42211`; Endpoints: `/`, `/page`, `/static/*`; Auth: None; Session: None; Transport: HTTP (no TLS); Threading: Enabled; Dependencies: PhantomJS, StaticFiles, FlagFile; Input: Query parameter `?name=` |
| PhantomJS | Executable: `phantomjs`; Version: 2.1.1 (abandoned); Script: `check.js`; Spawned: Per-request via subprocess.Popen; Timeout: 5 seconds; Purpose: XSS payload validation; Input: HTML file URL via stdin; Output: Alert message via stdout; Privileges: Root (container) |
| StaticFiles | Path: `src/static/`; Web Path: `/static/*`; Contents: CSS, images, fonts; Writable: Yes (temp files); Temp Files: Random 32-char hex names with .html extension; Cleanup: Immediate (os.unlink in finally block); Race Window: ~2 seconds |
| FlagFile | Path: `src/secret.txt`; Content: `flag{7b37c981-e7c9-4520-a486-8bbbfe90e9a6}`; Permissions: 0644 (world-readable); Loaded: Startup; Format: Plaintext; Build Process: sed substitution from .env; Git History: Exposed in commit 2a45b0a |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ExternalUser → FlaskApp | HTTPS | `:42211 /` | None | Public |
| ExternalUser → FlaskApp | HTTPS | `:42211 /page?name=` | None | Public |
| ExternalUser → FlaskApp | HTTPS | `:42211 /static/*` | None | Public |
| FlaskApp → FlagFile | File | `secret.txt` | None | Flag |
| FlaskApp → StaticFiles | File | `static/*.html` (write) | None | User HTML |
| FlaskApp → PhantomJS | Process | subprocess.Popen stdin | None | HTML URL |
| PhantomJS → FlaskApp | HTTP | `http://localhost:5000/static/*.html` | None | User HTML |
| PhantomJS → FlaskApp | Process | stdout pipe | None | Alert messages |

**Critical Flow for XSS Challenge:**
```
ExternalUser → FlaskApp (/page?name=<payload>)
  ↓
FlaskApp filters payload (weak regex)
  ↓
FlaskApp writes HTML to StaticFiles (temp file)
  ↓
FlaskApp spawns PhantomJS subprocess
  ↓
FlaskApp → PhantomJS (via stdin: file URL)
  ↓
PhantomJS → FlaskApp (HTTP GET /static/<random>.html)
  ↓
PhantomJS executes JavaScript in HTML
  ↓
PhantomJS captures alert() message
  ↓
PhantomJS → FlaskApp (via stdout: alert message)
  ↓
FlaskApp checks if message == 'XSS'
  ↓
FlaskApp reads FlagFile
  ↓
FlaskApp → ExternalUser (flag in HTTP response)
```

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist in this application |
| None | Authorization | No authorization guards exist in this application |
| None | Network | No network-level restrictions (binds to 0.0.0.0) |
| None | RateLimit | No rate limiting implemented |

**Note:** This application has ZERO security guards. All endpoints are publicly accessible without any conditions or validations.

**Missing Guards (Should Exist in Production):**
- `auth:user` - Would require valid user session
- `rate:limit` - Would prevent brute-force attacks
- `csrf:token` - Would prevent cross-site request forgery  
- `cors:restricted` - Would limit cross-origin access
- `tls:required` - Would enforce HTTPS connections

## 7. Role & Privilege Architecture

**CRITICAL FINDING:** This application has **ZERO role and privilege architecture**. No authentication, no authorization, no user roles, and no access controls exist.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (unrestricted) | Global | Implicit default - no authentication system exists |

**Evidence:**
- No role definitions found in codebase
- No user model or database
- No role strings in code ("admin", "user", "moderator", etc.)
- No role-based decorators (@role_required, @admin_only, etc.)
- No permission checks in any route handler

**Search Results:**
```bash
# Searched for role-related code
grep -ri "role\|admin\|user\|moderator\|permission" src/
# Result: 0 matches (except in comments/strings unrelated to auth)

# Searched for authorization decorators
grep -ri "@login_required\|@role_required\|@jwt_required" src/
# Result: 0 matches
```

### 7.2 Privilege Lattice

**NOT APPLICABLE** - No role hierarchy exists.

```
All users: anonymous (unrestricted access to all functionality)
```

**Notes:**
- No role ordering or hierarchy
- No privilege escalation possible (already at maximum privilege)
- No role switching mechanisms
- No impersonation features
- No "sudo mode" or temporary elevation
- Every request has full access to all endpoints

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/`, `/page`, `/static/*` | None |

**Notes:**
- All users see identical interface
- No authenticated vs. unauthenticated distinction
- No role-specific dashboards
- No personalized content

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A |

**Evidence:**
```python
# Route handlers have NO authorization decorators
@app.route('/')
def index():
    return INDEX_CONTENT
    # No @login_required
    # No role checks

@app.route('/page')
def page15():
    msg = request.args.get('name','')
    # No user context
    # No permission validation
    # Flag accessible to anyone
```

## 8. Authorization Vulnerability Candidates

**CRITICAL NOTE:** This application has NO authorization system, so traditional authorization vulnerabilities (IDOR, privilege escalation) do not exist in the conventional sense. However, the **complete absence of authorization** is itself the primary security failure.

### 8.1 Horizontal Privilege Escalation Candidates

**NOT APPLICABLE** - No user boundaries exist.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | All endpoints publicly accessible | None | N/A | All data is globally accessible |

**Finding:** There are no endpoints with object ID parameters (`user_id`, `order_id`, etc.) because there is no concept of users or user-owned resources. The application is completely stateless with no persistence layer.

**Worse Than IDOR:** Rather than having IDOR vulnerabilities where users can access each other's data, this application has **no access controls whatsoever** - all data (including the CTF flag) is accessible to all users without any validation.

### 8.2 Vertical Privilege Escalation Candidates

**NOT APPLICABLE** - No role hierarchy exists.

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | No admin endpoints exist | N/A | N/A |

**Finding:** There are no privileged endpoints requiring elevated roles because:
- No admin role exists
- No user management functionality exists
- No system configuration endpoints exist
- No restricted business intelligence or reporting endpoints exist
- All functionality is accessible to all users equally

**Security Implication:** The flag (which should be a restricted resource) is accessible to any user who can craft a valid XSS payload. There is no authentication required before attempting the challenge or receiving the flag.

### 8.3 Context-Based Authorization Candidates

**NOT APPLICABLE** - No workflow state validation exists.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| N/A | No multi-step workflows exist | N/A | N/A |

**Finding:** The application has no multi-step workflows:
- No checkout process
- No onboarding flows
- No wizard-style forms
- No state-dependent endpoints

The XSS challenge is a single-step process:
1. User submits `?name=` parameter
2. Application validates via PhantomJS
3. Flag returned immediately if successful

No prior state is required or validated.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** All injection sources listed below are in network-accessible code paths reachable via HTTP requests to the deployed application.

### Command Injection Sources

**FINDING:** Zero exploitable command injection sources found in network-accessible paths.

**Analysis:**

**Subprocess Execution Detected:**
```python
# Location: src/app.py:34
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                       stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Assessment:** NOT exploitable for command injection because:
1. **List format used (not shell=True):** Arguments passed as list prevent shell injection
2. **Command is hardcoded:** `["timeout","5","phantomjs", "check.js"]` - no user input
3. **User input path is indirect:** User input → HTML file → File URL → stdin (URL string, not command)
4. **stdin contains URL, not command:** `proc.stdin.write(url)` where `url = 'http://localhost:5000/' + random_filename`

**User Input Flow:**
```
User input (?name=)
  ↓
Weak regex filtering
  ↓
HTML template injection  
  ↓
File write (src/app.py:38-40): of.write(page)
  ↓
URL construction (server-controlled): 'http://localhost:5000/' + random_hex
  ↓
stdin write to PhantomJS: proc.stdin.write(url)
  ↓
PhantomJS opens URL (loads HTML file)
  ↓
XSS execution (intended), NOT command injection
```

**File Write Operation:**
```python
# Location: src/app.py:35-40
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn
try:
    of = open(fn, 'w')
    of.write(page)  # page contains user input
    of.close()
```

**Assessment:** NOT exploitable for command injection because:
- Filename is randomly generated (no directory traversal)
- File extension is fixed (.html)
- File is written to static directory (web-accessible but not executable)
- No mechanism to write executable files
- File content is HTML (rendered by PhantomJS, not executed as shell commands)

**Other Subprocess Functions Searched:**
- `os.system()` - NOT FOUND
- `os.popen()` - NOT FOUND  
- `os.exec*()` - NOT FOUND
- `commands.getoutput()` - NOT FOUND
- `eval()` with user input - NOT FOUND
- `exec()` with user input - NOT FOUND
- `subprocess` with `shell=True` - NOT FOUND

**Conclusion:** No command injection sources exist in network-accessible paths.

### SQL Injection Sources

**FINDING:** Zero SQL injection sources found (no database functionality exists).

**Analysis:**

**Database Imports Searched:**
- `sqlite3` - NOT FOUND
- `MySQLdb` - NOT FOUND
- `pymysql` - NOT FOUND
- `psycopg2` - NOT FOUND  
- `SQLAlchemy` - NOT FOUND
- `pymongo` - NOT FOUND
- `redis` - NOT FOUND

**Database Operations Searched:**
- `cursor.execute()` - NOT FOUND
- `db.execute()` - NOT FOUND
- SQL query strings (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) - NOT FOUND
- ORM queries - NOT FOUND

**Data Persistence:**
- Application is completely stateless
- No database connection code
- No SQL query construction
- Flag stored in plaintext file (`secret.txt`), not database
- No user data storage

**Conclusion:** No SQL injection sources exist because no database functionality exists.

### Vulnerability Sources by Type

#### 1. Command Injection Sources
**Total Found:** 0 (zero)

#### 2. SQL Injection Sources  
**Total Found:** 0 (zero)

### Actual Vulnerabilities Present (Not Command/SQL Injection)

**Primary Vulnerability: Reflected Cross-Site Scripting (XSS)**

**Source:** Query parameter `?name=`
**Location:** `src/app.py:65-72`
**Type:** Reflected XSS via HTML attribute injection
**Exploitability:** CRITICAL

**Data Flow:**
```python
# Line 65: User input retrieved
msg = request.args.get('name','')

# Lines 66-67: Weak filtering (bypassable)
msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)
msg = re.sub(r'<script[^>]*>.*?</script>|<script[^>]*>', '', msg, flags=re.IGNORECASE | re.DOTALL)

# Line 68: HTML injection (NO ENCODING)
value = "" if msg == "" else 'value="{0}"'.format(msg)

# Lines 70-71: Template injection and return
data = XSS_CONTENT.format("15", "Triangle", value, "", "")
result = check_input(data,flags[0],msg,'level_easy_med')
return XSS_CONTENT.format("15", "Triangle", value, result, "")
```

**HTML Template Context (constants.py:49):**
```html
<input type=text name=name placeholder="Enter your name..." {2}>
                                                                ^^
                                                    User input injected here
```

**Exploitation:**
```
Payload: " autofocus onfocus=alert(String.fromCharCode(88,83,83))
Result:  <input ... value="" autofocus onfocus=alert(String.fromCharCode(88,83,83))">
Execution: Auto-triggers on page load, bypasses XSS string filter, alerts "XSS"
```

**This is the INTENDED vulnerability** for the XSS challenge.

### Summary Table

| Injection Type | Sources Found | Locations | Exploitability | Notes |
|----------------|---------------|-----------|----------------|-------|
| Command Injection | 0 | N/A | None | subprocess uses list format, no shell=True |
| SQL Injection | 0 | N/A | None | No database functionality exists |
| XSS (Reflected) | 1 | src/app.py:68 | CRITICAL | Intentional vulnerability for challenge |
| XSS (Server-Side) | 1 | PhantomJS rendering | CRITICAL | Validation mechanism, intentional |

## RECONNAISSANCE COMPLETE

This reconnaissance deliverable provides a comprehensive map of the Dalgona Challenges XSS training platform's attack surface. The application is intentionally vulnerable with minimal security controls, designed for XSS training purposes.

**Key Takeaways for Vulnerability Analysis Phase:**
1. **Primary Attack Vector:** Reflected XSS via `?name=` parameter on `/page` endpoint
2. **No Auth/Authz:** All endpoints publicly accessible, no security controls
3. **No Database:** SQL injection not possible (no database layer)
4. **No Command Injection:** subprocess.Popen uses safe list format
5. **Critical Secret Exposure:** Flag in Git history (`.env` file, commit 2a45b0a)
6. **Intentional Design:** Application is a CTF challenge with deliberate vulnerabilities

**Recommended Analysis Focus:**
- XSS exploitation techniques (Injection Analysis Specialist)
- Client-side security bypass methods (XSS Analysis Specialist)  
- Secret exposure in version control (already documented)
- Lack of security controls (already documented)
