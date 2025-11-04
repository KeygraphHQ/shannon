# Reconnaissance Deliverable: Dalgona Challenges XSS Platform

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is a deliberately vulnerable Flask-based XSS challenge application with no authentication or authorization systems.

**Key Sections for Downstream Specialists:**
- **Section 3 (Authentication & Session Management):** Documents the COMPLETE ABSENCE of authentication - all endpoints are anonymous
- **Section 4 (API Endpoint Inventory):** Contains the two network-accessible endpoints with authorization details
- **Section 5 (Potential Input Vectors):** Critical for Injection and XSS specialists - documents the single user input vector
- **Section 7 (Role & Privilege Architecture):** Documents NO roles exist - privilege escalation testing not applicable
- **Section 8 (Authorization Vulnerability Candidates):** EMPTY - no authorization system to test
- **Section 9 (Injection Sources):** Documents NO command or SQL injection sources exist

**Application Nature:** This is an intentionally vulnerable XSS training/CTF application. It has no authentication, no database, no user accounts, and no authorization controls by design. Testing should focus on XSS vulnerabilities only.

**Priority Order for Testing:** Focus on XSS exploitation via the `/page?name=` parameter. Authorization, authentication, and injection testing are not applicable to this application.

## 1. Executive Summary
"Dalgona Challenges" is a deliberately vulnerable Flask-based XSS challenge application (XBEN-048-24 Cross 20) running Python 2.7.18 with Werkzeug 1.0.1. The application presents a minimal attack surface with only two HTTP endpoints, designed specifically for XSS exploitation training. The primary security concern is a reflected XSS vulnerability in the `/page` endpoint that uses inadequate blacklist-based filtering.

**Core Technology Stack:**
- **Backend:** Python 2.7.18 (EOL), Flask 1.1.4
- **Server:** Werkzeug 1.0.1 development server
- **Infrastructure:** Docker container, Caddy reverse proxy
- **Validation:** PhantomJS (deprecated) for server-side XSS detection

**Primary User-Facing Components:**
1. Landing page (`/`) - Static HTML with challenge menu
2. XSS challenge endpoint (`/page`) - Accepts user input for XSS exploitation
3. Static assets - CSS, images, fonts served from `/static/` directory

**Attack Surface:** The application is completely stateless with no authentication, no authorization, no session management, no database, and no user accounts. All endpoints are publicly accessible without credentials. The sole vulnerability vector is reflected XSS through the `name` query parameter on the `/page` endpoint.

**Deployment Context:** The application runs on port 34073 (external) mapped to port 5000 (internal container). During reconnaissance, the `/page` endpoint exhibited 500 internal server errors, likely due to PhantomJS runtime issues.

## 2. Technology & Service Map
### Frontend
- **Framework:** Server-side rendering using Python string formatting (no client-side JavaScript framework)
- **Template Engine:** Python `str.format()` - NO Jinja2, Mako, or traditional templating (no auto-escaping)
- **JavaScript:** None served to clients (PhantomJS validation script is server-side only)
- **CSS:** Custom stylesheets with "Game-Of-Squids" themed fonts
- **Authentication Libraries:** None

### Backend
- **Language:** Python 2.7.18 (End-of-Life since January 2020)
- **Framework:** Flask 1.1.4 (April 2021 release with known CVEs)
- **Key Dependencies:** 
  - Flask==1.1.4
  - PhantomJS (deprecated since 2018)
- **Server:** Werkzeug 1.0.1 development server (not production-ready)
- **Validation:** PhantomJS subprocess for XSS detection

### Infrastructure
- **Hosting:** Docker container (python:2.7.18-slim base image)
- **CDN:** None
- **Reverse Proxy:** Caddy HTTP server on port 80/443
- **Database:** None (stateless application)
- **Session Store:** None
- **Cache:** None

### Identified Subdomains
From subfinder scan (not directly relevant to localhost deployment):
- server2.hunter.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- mse-ca-mail.corp.mse.localhost
- autodiscover.regency.localhost
- mail.regency.localhost
- owa.regency.localhost
- naeu2.naeuinc.localhost
- mail.localhost
- mail02.regency.localhost
- mail03.regency.localhost
- www.localhost
- server02.counterintel.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.localhost
- sbs.allsaintsschool.localhost

### Open Ports & Services
From nmap scan of localhost:
- **Port 80/tcp:** Caddy httpd (reverse proxy)
- **Port 443/tcp:** SSL/HTTPS (Caddy)
- **Port 631/tcp:** CUPS 2.3 (print service - not part of application)
- **Port 8888/tcp:** SimpleHTTPServer 0.6 Python 3.12.10 (not part of application)
- **Port 49158/tcp:** Tailscale (not part of application)
- **Port 34073:** Application endpoint (mapped from container port 5000)

**Application-Specific Ports:**
- **External:** 34073 (HTTP)
- **Internal Container:** 5000 (Flask development server)

## 3. Authentication & Session Management Flow

### CRITICAL FINDING: NO AUTHENTICATION OR SESSION MANAGEMENT EXISTS

This application implements **ZERO authentication mechanisms** and **ZERO session management**. All endpoints are completely anonymous and publicly accessible.

### Entry Points
**NONE** - No authentication entry points exist:
- No `/login` endpoint
- No `/register` endpoint
- No `/auth/*` endpoints
- No SSO/OAuth integration
- No API key validation

### Mechanism
**NOT APPLICABLE** - No authentication mechanism exists. The application has:
- No credential submission forms (for authentication purposes)
- No token generation
- No cookie setting for sessions
- No session creation or validation
- No user identity tracking

### Code Pointers
**Flask Application Configuration:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/app.py`
- Line 24: `app = Flask(__name__)` - Basic Flask initialization
- Line 25: `app.config['PROPAGATE_EXCEPTIONS'] = True` - Only config set
- **MISSING:** No `SECRET_KEY` configuration (required for Flask sessions)
- **MISSING:** No session cookie flags (HttpOnly, Secure, SameSite)
- **MISSING:** No authentication decorators or middleware

**Route Definitions:**
- Line 29-31: `@app.route('/') def index()` - No authentication decorator
- Line 65-82: `@app.route('/page') def xss20()` - No authentication decorator

**Import Statement Analysis:**
- Line 3: `from flask import Flask,request, make_response` 
- **MISSING:** No import of `session` from Flask
- **MISSING:** No authentication libraries (Flask-Login, Flask-JWT, Flask-Security)

**Dependencies:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/requirements.txt`
- Only dependencies: `Flask==1.1.4` and `phantomjs`
- **MISSING:** No authentication/authorization packages

### 3.1 Role Assignment Process
**NOT APPLICABLE** - No role assignment exists because:
- No user accounts exist
- No authentication system exists
- No role definitions in codebase
- All users are anonymous with identical access

### 3.2 Privilege Storage & Validation
**NOT APPLICABLE** - No privilege storage or validation exists because:
- No user sessions
- No JWT tokens or claims
- No database to store user privileges
- No middleware to validate privileges
- No decorators for permission checks

### 3.3 Role Switching & Impersonation
**NOT APPLICABLE** - No role switching or impersonation features exist because:
- No admin accounts
- No user accounts
- No role system
- No audit logging

**Security Implications:**
This complete absence of authentication is **intentional by design** for a CTF challenge application. In a production environment, this would represent CRITICAL security vulnerabilities. However, for an XSS training platform, the anonymous access model is appropriate.

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints reachable through the deployed web application.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|----------------------------|
| GET | `/` | anon | None | None | Landing page displaying "Dalgona Challenges" title and navigation to XSS challenge. Returns static HTML from `INDEX_CONTENT` constant. See `app.py:29-31` |
| GET | `/page` | anon | None | None | XSS challenge endpoint (medium difficulty). Accepts `name` query parameter, applies blacklist validation for XSS characters (`<`, `>`, `(`, `)`, `throw`, backticks, `javascript`), reflects input in HTML attribute context, validates XSS execution via PhantomJS subprocess, returns flag on success. Sets `X-XSS-Protection: 0` header. See `app.py:65-82` |
| GET | `/static/<path>` | anon | None | None | Static file serving (Flask default). Serves CSS, images, fonts, and favicon from `static/` directory. Also temporarily hosts dynamically generated HTML files for PhantomJS validation (race condition window). Implicit Flask behavior. |

**Endpoint Details:**

**1. Index Endpoint:**
- **Purpose:** Challenge menu/landing page
- **Input:** None
- **Output:** HTML content (no user input reflection)
- **Security:** Safe - no user input processing
- **Code Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/app.py` lines 29-31

**2. XSS Challenge Endpoint:**
- **Purpose:** XSS exploitation challenge
- **Input:** Query parameter `name` (optional, default: empty string)
- **Validation:** Blacklist check for `['<', '>', '(',')','throw','`','´','javascript']` (case-insensitive)
- **Processing:** User input formatted into HTML: `'><img src="{0}"'.format(msg)` (line 69)
- **Injection Point:** HTML attribute context within `<input>` tag
- **XSS Protection:** Explicitly disabled via `X-XSS-Protection: 0` header (line 81)
- **Flag Exposure:** Returns flag value on successful XSS execution detected by PhantomJS
- **Security:** CRITICAL vulnerability - bypassable blacklist, no output encoding
- **Code Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/app.py` lines 65-82

**3. Static File Endpoint:**
- **Purpose:** Asset delivery and temporary file hosting
- **Security Concern:** Race condition - temporary HTML files with user content briefly accessible
- **File Creation:** Line 35: `fn = "static/" + os.urandom(16).encode('hex') + '.html'`
- **Cleanup:** Line 50: `os.unlink(fn)` in finally block
- **Code Location:** Implicit Flask behavior

**Total Network-Accessible Endpoints:** 3

**Authorization Summary:** All endpoints have NO authorization requirements. All endpoints are accessible to anonymous users without any credentials.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application's network interface.

### URL Parameters
**Query Parameter: `name`**
- **Endpoint:** `GET /page`
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/app.py:67`
- **Extraction Code:** `msg = request.args.get('name','')`
- **Default Value:** Empty string
- **Validation:** Blacklist check (lines 68-75) for: `<`, `>`, `(`, `)`, `throw`, `` ` ``, `´`, `javascript`
- **Validation Type:** Case-insensitive substring matching
- **Bypass Potential:** HIGH - blacklist incomplete, allows alternative event handlers
- **Data Flow:**
  1. Captured at line 67
  2. Blacklist validated at lines 70-75
  3. Formatted into HTML at line 69: `'><img src="{0}"'.format(msg)`
  4. Injected into template at line 80
  5. Written to temporary file at lines 38-40
  6. Validated by PhantomJS subprocess at line 34
- **Sink Type:** Reflected XSS in HTML attribute context
- **Exploitability:** MEDIUM (bypassable blacklist)

### POST Body Fields (JSON/Form)
**NONE** - No POST endpoints exist. Application only accepts GET requests.

### HTTP Headers
**NO USER INPUT FROM HEADERS** - The application does not read or process any HTTP headers from user requests.

**Headers Searched:**
- `request.headers` - Not accessed in code
- `X-Forwarded-For` - Not used
- `User-Agent` - Not used
- `Referer` - Not used
- Custom headers - Not processed

### Cookie Values
**NO COOKIE INPUT** - The application does not read cookies from requests.

**Evidence:**
- `request.cookies` - Not accessed in code
- No session cookies used
- No authentication cookies
- No preference/tracking cookies processed

### Additional Input Sources Analyzed
**File Uploads:** None - No file upload functionality
**WebSockets:** None - No WebSocket endpoints
**POST JSON Body:** None - No JSON API endpoints
**GraphQL:** None - No GraphQL endpoint

### Input Vector Summary Table

| Input Source | Parameter Name | Location | File:Line | Validation | Encoding | Exploitable |
|--------------|----------------|----------|-----------|------------|----------|-------------|
| Query String | `name` | `/page` | `app.py:67` | Blacklist (weak) | None | **YES (XSS)** |

**Total Input Vectors:** 1 (single query parameter)

**Critical Finding:** This application has minimal attack surface with only ONE user input vector. All downstream vulnerability analysis should focus on the `name` parameter in the `/page` endpoint.

## 6. Network & Interaction Map

**Network Surface Focus:** Only components that are part of the deployed, network-accessible infrastructure.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| ExternalUser | ExternAsset | Internet | Browser | Public | External attacker/user accessing the application |
| CaddyProxy | Service | Edge | Caddy HTTP | Public | Reverse proxy on ports 80/443 forwarding to Flask |
| FlaskApp | Service | App | Python 2.7/Flask 1.1.4 | Public, Flag | Main application on container port 5000, external port 34073 |
| PhantomJS | Service | App | PhantomJS/QtWebKit | Public | Subprocess for XSS validation, triggered by `/page` requests |
| StaticFiles | DataStore | App | Filesystem | Public | Static assets (CSS, images) and temporary HTML files |
| SecretFile | DataStore | App | Filesystem | Flag | Plaintext file `secret.txt` containing CTF flag |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| ExternalUser | Interface: HTTP Browser; Access: Anonymous; Location: Internet |
| CaddyProxy | Hosts: `http://localhost:80`, `https://localhost:443`; Forwards: `http://localhost:34073`; Type: Reverse Proxy; TLS: Enabled on 443 |
| FlaskApp | Hosts: `http://localhost:34073` (external), `http://0.0.0.0:5000` (container internal); Endpoints: `/`, `/page`, `/static/*`; Server: Werkzeug 1.0.1; Debug: Enabled; Auth: None; Sessions: None |
| PhantomJS | Command: `/usr/bin/phantomjs`; Script: `check.js`; Timeout: 5 seconds; Execution: Subprocess; Trigger: `/page` requests with user input; Purpose: XSS validation via alert() detection |
| StaticFiles | Path: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/static/`; Contents: CSS, images, fonts, temporary HTML; Web-Accessible: Yes via `/static/*`; Permissions: Container filesystem defaults |
| SecretFile | Path: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/secret.txt`; Format: Plaintext; Contents: CTF flag; Loaded: Application startup (line 22); Exposure: Returned on successful XSS |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ExternalUser → CaddyProxy | HTTPS | `:443` | None | Public |
| ExternalUser → CaddyProxy | HTTP | `:80` | None | Public |
| CaddyProxy → FlaskApp | HTTP | `:34073` (ext) / `:5000` (container) | None | Public |
| ExternalUser → FlaskApp | HTTP | `:34073 /` | None | Public |
| ExternalUser → FlaskApp | HTTP | `:34073 /page?name=` | None | Public |
| ExternalUser → FlaskApp | HTTP | `:34073 /static/*` | None | Public |
| FlaskApp → PhantomJS | Process | subprocess stdin/stdout | None | Public |
| FlaskApp → StaticFiles | File I/O | Local filesystem | None | Public |
| FlaskApp → SecretFile | File I/O | Local filesystem read | None | Flag |
| PhantomJS → FlaskApp | HTTP | `http://localhost:5000/static/[random].html` | None | Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist - all endpoints are anonymous |
| None | Authorization | No authorization guards exist - all access is unrestricted |
| None | Network | No network-level restrictions - all IPs can access |
| None | Protocol | No protocol security - HTTP plaintext within container |
| None | RateLimit | No rate limiting - unlimited requests allowed |

**Critical Finding:** This application has ZERO security guards. All flows are completely unprotected.

## 7. Role & Privilege Architecture

### CRITICAL FINDING: NO ROLE OR PRIVILEGE ARCHITECTURE EXISTS

This application has no role system, no privilege levels, no permission models, and no authorization controls of any kind.

### 7.1 Discovered Roles

**NO ROLES EXIST**

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (only level) | Global | No authentication required - all users are anonymous |

**Evidence:**
- No role definitions in codebase
- No user accounts or database
- No authentication system
- No session management
- No JWT claims or role attributes
- All endpoints accessible to all users without distinction

### 7.2 Privilege Lattice

**NOT APPLICABLE** - Cannot build a privilege lattice because no privilege levels exist.

```
Privilege Model: NONE

All users have identical access (anonymous):
anonymous (unrestricted access to all endpoints)

No privilege ordering exists.
No role hierarchy exists.
No role switching mechanisms exist.
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/`, `/page`, `/static/*` (all routes) | None - no authentication |

**Note:** Since only one role exists (anonymous), there is no differentiation in access.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A (no user data stored) |

**Code Evidence:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/app.py`
- All routes lack decorators: No `@login_required`, `@requires_auth`, `@admin_required`
- Line 29: `@app.route('/')` - No auth decorator
- Line 65: `@app.route('/page')` - No auth decorator
- No permission checking logic in route handlers

## 8. Authorization Vulnerability Candidates

### CRITICAL FINDING: NO AUTHORIZATION SYSTEM TO TEST

This section is **NOT APPLICABLE** because the application has no authorization system. Authorization vulnerability testing (IDOR, privilege escalation, permission bypasses) cannot be performed on an application with no authorization controls.

### 8.1 Horizontal Privilege Escalation Candidates

**EMPTY** - No horizontal privilege escalation candidates exist because:
- No user accounts exist
- No object ownership exists
- No endpoints with object ID parameters (no `user_id`, `order_id`, etc.)
- All users are anonymous with identical access

### 8.2 Vertical Privilege Escalation Candidates

**EMPTY** - No vertical privilege escalation candidates exist because:
- No privilege levels exist (no admin vs user distinction)
- No administrative functionality exists
- No elevated permission requirements exist
- All endpoints are equally accessible to all anonymous users

### 8.3 Context-Based Authorization Candidates

**EMPTY** - No context-based authorization candidates exist because:
- No multi-step workflows exist
- No state-dependent endpoints exist
- No session state exists
- All endpoints are stateless and independently accessible

### Testing Guidance for Authorization Analysis Specialist

**AUTHORIZATION TESTING IS NOT APPLICABLE** to this application because:
1. No authentication system exists
2. No user roles or privilege levels exist
3. No access controls exist
4. No authorization checks exist
5. No protected resources exist

**Recommendation:** Skip authorization analysis phase for this target. Focus downstream testing efforts on XSS vulnerabilities in the `/page` endpoint.

## 9. Injection Sources (Command Injection and SQL Injection)

**TASK AGENT ANALYSIS COMPLETED**

**Network Surface Focus:** Only injection sources accessible through the target web application's network interface.

### CRITICAL FINDING: NO EXPLOITABLE INJECTION SOURCES EXIST

After comprehensive analysis of all network-accessible code paths, **ZERO command injection sources** and **ZERO SQL injection sources** were identified.

### Command Injection Analysis

#### Subprocess Execution Found

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/app.py:34`

**Code:**
```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Data Flow Analysis:**
1. **User Input Origin:** Query parameter `name` from `GET /page` (line 67: `msg = request.args.get('name','')`)
2. **Input Validation:** Blacklist applied to `msg` (lines 68-75)
3. **Input Usage:** Incorporated into HTML page content (line 69: `'><img src="{0}"'.format(msg)`)
4. **File Operations:** HTML written to temporary file with random filename (line 35-40)
5. **Subprocess Call:** PhantomJS invoked with **hardcoded array of arguments** (line 34)
6. **Data Passed to Subprocess:** File URL passed via stdin (line 43), NOT as command argument

**Why This Is NOT Exploitable:**

1. **Array-based subprocess call:** Using list `["timeout","5","phantomjs", "check.js"]` prevents shell interpretation
2. **No `shell=True` parameter:** Shell is not invoked, preventing command injection
3. **User input isolation:** The `msg` parameter is NOT passed to the subprocess command
4. **User input context:** Input only affects HTML file CONTENT, not command arguments
5. **Safe stdin usage:** URL string passed via stdin is data, not executable code
6. **Random filename:** `os.urandom(16).encode('hex')` generates server-controlled filename with no user input

**Additional Safe Practices:**
- No `os.system()` calls in codebase
- No `os.popen()` calls in codebase
- No `os.exec*()` calls in codebase
- No `eval()` or `exec()` calls in codebase
- No shell command string interpolation

#### Command Injection Source Summary

**Total Command Injection Sources: 0**

No exploitable command injection vulnerabilities exist in network-accessible code.

### SQL Injection Analysis

#### Database Operations Found

**NONE** - This application has no database.

**Evidence:**
1. **No database imports:** 
   - No `sqlite3`, `MySQLdb`, `psycopg2`, `pymongo`, `SQLAlchemy` in imports
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/app.py` lines 1-17
   
2. **No database operations:**
   - No `.execute()` or `.executemany()` calls
   - No cursor objects
   - No database connection code
   - No SQL query strings

3. **No ORM usage:**
   - No SQLAlchemy models
   - No ORM imports

4. **Dependencies confirm no database:**
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/requirements.txt`
   - Only dependencies: `Flask==1.1.4` and `phantomjs`
   - No database drivers listed

5. **Storage mechanism:**
   - File-based: Line 22 reads flag from `secret.txt`
   - Code: `flags = open('secret.txt').read().split()`
   - No persistent data storage beyond static files

#### SQL Injection Source Summary

**Total SQL Injection Sources: 0**

No SQL injection vulnerabilities exist because the application has no database operations.

### Vulnerability Sources by Type (Detailed Inventory)

#### 1. Command Injection Sources: NONE

Checked all potential sources:
- ✗ HTTP Query Parameters - Not used in commands
- ✗ HTTP Form Fields - No POST endpoints exist
- ✗ HTTP Cookies - Not processed
- ✗ HTTP Headers - Not used in commands
- ✗ File Upload Names - No upload functionality
- ✗ File Upload Contents - No upload functionality
- ✗ Environment Variables - Not user-controllable
- ✗ Configuration Files - Not user-controllable

#### 2. SQL Injection Sources: NONE

Checked all potential sources:
- ✗ HTTP Query Parameters - No database queries
- ✗ HTTP Form Fields - No database queries
- ✗ HTTP Cookies - No database queries
- ✗ HTTP Headers - No database queries
- ✗ Stored User Inputs - No database storage
- ✗ Third-Party API Data - No third-party integrations

### Testing Guidance for Injection Analysis Specialist

**COMMAND INJECTION TESTING: NOT APPLICABLE** - No command injection attack surface exists.

**SQL INJECTION TESTING: NOT APPLICABLE** - No database operations exist.

**Recommendation:** Skip injection analysis phase for this target. The application has no command execution vectors beyond the safe subprocess call, and no database operations. Focus downstream testing efforts on XSS vulnerabilities in the `/page` endpoint.

### Alternative Injection Vectors Considered

**Template Injection (SSTI):**
- Uses Python `str.format()` instead of template engine
- No Jinja2, Mako, or template engine that could be exploited
- Format strings are hardcoded, not user-controllable
- Results in XSS, not SSTI

**Path Traversal:**
- Static file serving uses Flask's built-in safe_join
- Temporary filename generation uses `os.urandom()` (no user input)
- No user-controllable file paths

**Code Injection:**
- No `eval()` or `exec()` calls
- No dynamic code execution beyond template formatting (results in XSS, not code injection)

---

**FINAL VERDICT:** This application is secure against command injection and SQL injection attacks. The sole vulnerability class is reflected XSS in the `/page` endpoint.