# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is a deliberately vulnerable XSS challenge application with **NO authentication, NO authorization, and NO user management system**.

**Key Sections:**
- **Section 1 (Executive Summary):** Application purpose and core findings
- **Section 2 (Technology Map):** Technology stack analysis
- **Section 3 (Authentication & Session Management):** Confirmed NONE exist
- **Section 4 (API Endpoint Inventory):** All 2 network-accessible endpoints documented
- **Section 5 (Input Vectors):** Single GET parameter for XSS testing
- **Section 6 (Network Map):** Simple monolithic architecture
- **Section 7 (Role & Privilege Architecture):** NONE - No authorization system
- **Section 8 (Authorization Vulnerability Candidates):** N/A - No authorization to bypass
- **Section 9 (Injection Sources):** NO command or SQL injection sources found

**Critical Finding:** This is an **XSS (Cross-Site Scripting) challenge application**, not a production system. The attack surface consists of one vulnerable endpoint (`/page`) designed for XSS exploitation training.

## 1. Executive Summary

**Application Name:** Dalgona Challenges  
**Application Type:** XSS Security Challenge/CTF (Capture The Flag)  
**Target URL:** http://localhost:37575  
**Technology Stack:** Python 2.7.18 (EOL), Flask 1.1.4, PhantomJS (discontinued)

This is a **deliberately vulnerable Flask web application** designed as an XSS training challenge. The application has a minimal attack surface with only **2 network-accessible HTTP endpoints** and serves a single purpose: testing Cross-Site Scripting exploitation skills.

**Core Architecture:**
- **Monolithic single-service design** (no microservices, no database)
- **Completely stateless** (no sessions, no user accounts)
- **Zero authentication/authorization** (all endpoints publicly accessible)
- **XSS-by-design** (intentionally vulnerable with weak blacklist filter)

**Primary Attack Surface:**
- `GET /page?name=<payload>` - XSS challenge endpoint with blacklist filter for 'alert' and 'confirm' only
- User input reflected in HTML attribute context without sanitization
- XSS protection explicitly disabled via `X-XSS-Protection: 0` header
- PhantomJS subprocess validates XSS exploitation by detecting JavaScript dialogs

**Technology Stack (All End-of-Life):**
- **Backend:** Python 2.7.18 (EOL January 2020)
- **Framework:** Flask 1.1.4 (May 2020, outdated)
- **Browser Engine:** PhantomJS (discontinued March 2018)
- **Container:** Docker with Debian Buster (archived, no security updates)
- **Web Server:** Flask development server (not production-grade)

**Critical Security Findings:**
1. **Reflected XSS (CRITICAL)** - Weak blacklist easily bypassed
2. **Secrets in Docker Images (CRITICAL)** - Flags extractable via `docker history`
3. **Debug Mode Enabled (HIGH)** - Flask debug=True exposes interactive debugger
4. **No TLS/HTTPS (HIGH)** - All traffic sent over unencrypted HTTP
5. **End-of-Life Software (CRITICAL)** - No security patches available

**Reconnaissance Scope:** This analysis focuses exclusively on the network-accessible attack surface per scope boundaries. Local-only scripts, build tools, and development utilities are excluded.

## 2. Technology & Service Map

### Frontend
- **Framework:** Vanilla JavaScript (minimal client-side logic)
- **Template Engine:** None - HTML served as Python string constants
- **CSS Framework:** Custom CSS with "Game-Of-Squids" font family
- **Authentication Libraries:** None
- **Client-Side Security:** XSS protection explicitly disabled

### Backend
- **Language:** Python 2.7.18 (EOL January 1, 2020)
- **Framework:** Flask 1.1.4 (released May 2020, 5 years outdated)
- **Web Server:** Flask development server (`flask run`)
- **Key Dependencies:** 
  - Flask==1.1.4
  - phantomjs (discontinued 2018)
  - Werkzeug 1.0.1 (bundled with Flask)
- **Subprocess Engine:** PhantomJS headless browser for XSS validation
- **File Structure:** 85 lines (app.py) + 203 lines (constants.py) = 288 total LoC

### Infrastructure
- **Hosting Provider:** Docker containerized deployment
- **Container Base:** python:2.7.18-slim (Debian Buster archived)
- **CDN:** None
- **Database Type:** None - application is entirely file-based
- **Caching:** None
- **Load Balancer:** None
- **Reverse Proxy:** None (Flask serves HTTP directly)

### Identified Subdomains
**From subfinder scan (out of scope - local development):**
- mail.localhost
- autodiscover.localhost
- www.localhost
- (Additional subdomains detected but not relevant to containerized target)

**Note:** Application runs inside Docker container on localhost:37575, subdomains are not accessible.

### Open Ports & Services
**From nmap scan:**
- **Port 80/tcp:** Caddy HTTP server (not the target application)
- **Port 443/tcp:** SSL/HTTPS (not the target application)
- **Port 37575/tcp:** **TARGET APPLICATION** - Flask/Werkzeug serving Dalgona Challenges

**Services running on target port 37575:**
- Flask 1.1.4 development server
- Werkzeug 1.0.1 WSGI server
- Python 2.7.18 runtime

**Additional ports (out of scope):**
- 631/tcp - CUPS print service
- 9999/tcp - Python SimpleHTTPServer
- 49158/tcp - Tailscale (requires auth)

## 3. Authentication & Session Management Flow

### Authentication Status: **COMPLETELY ABSENT**

**Entry Points:** None - no authentication endpoints exist

**Mechanism:** Not applicable - zero authentication infrastructure

**Evidence of No Authentication:**
1. No `/login`, `/logout`, `/register`, or `/auth/*` endpoints exist
2. No authentication decorators (`@login_required`, `@auth_required`) found
3. No Flask-Login, Flask-Security, or similar libraries imported
4. No user database or user models exist
5. No password hashing (werkzeug.security) imported
6. No session management (`flask.session` not imported)
7. All endpoints are publicly accessible without any access control

**Code Pointers:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:29-31` - Index route (no auth)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:64-81` - Page route (no auth)
- No authentication-related code exists anywhere in codebase

### Session Management: **NOT IMPLEMENTED**

**Session Cookie Configuration:** Not applicable - no sessions used

**Evidence:**
1. `flask.session` object not imported
2. No `SECRET_KEY` configured (required for Flask sessions)
3. No `session[]` usage anywhere in codebase
4. No session-based state tracking
5. Application is completely stateless

**Code Pointers:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:25` - Only config: `app.config['PROPAGATE_EXCEPTIONS'] = True`
- No `app.secret_key` or `app.config['SECRET_KEY']` found

**Actual Cookie Usage:** The application does not set any cookies. The only cookie-related code is disabling XSS protection:
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:80` - `response.headers["X-XSS-Protection"] = "0"`

### 3.1 Role Assignment Process
**Role Determination:** Not applicable - no user roles exist

**Default Role:** Not applicable - no authentication system

**Role Upgrade Path:** Not applicable - no role hierarchy

**Code Implementation:** No role assignment logic exists

### 3.2 Privilege Storage & Validation
**Storage Location:** Not applicable - no privileges exist

**Validation Points:** None - no authorization checks anywhere

**Cache/Session Persistence:** Not applicable - no sessions

**Code Pointers:** No privilege-related code exists

### 3.3 Role Switching & Impersonation
**Impersonation Features:** None

**Role Switching:** None

**Audit Trail:** None

**Code Implementation:** Not applicable

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints included per scope boundaries.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|---------------------------|
| GET | `/` | anon | None | None | Landing page with challenge selection. Returns static HTML content (INDEX_CONTENT). See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:29-31` |
| GET | `/page` | anon | None | None | **PRIMARY ATTACK SURFACE** - XSS challenge handler. Accepts `name` query parameter, validates against blacklist ['alert','confirm'], reflects input in HTML attribute context. Sets `X-XSS-Protection: 0` header. Uses PhantomJS for XSS detection. Returns flag if XSS successful. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:64-81` |
| GET | `/static/<path>` | anon | None | None | Flask built-in static file handler. Serves CSS, images, fonts from `static/` directory. Temporary XSS test files created here with random names. No authorization. |

**Total Endpoints:** 3 (2 explicit routes + 1 implicit static handler)

**Key Observations:**
- **All endpoints are publicly accessible** - No authentication required
- **No POST, PUT, DELETE, or PATCH endpoints** - Only GET methods
- **No API endpoints** - No JSON responses, all HTML
- **No object ID parameters** - No user_id, order_id, or similar identifiers
- **No IDOR risk** - No objects to reference insecurely
- **Single input parameter:** `name` in `/page` endpoint (XSS vector)

**Authentication Flow:** Not applicable - no authentication exists

**Rate Limiting:** None implemented

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only network-accessible input vectors included.

### URL Parameters
- **`/page?name=<payload>`** - PRIMARY XSS VECTOR
  - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:66`
  - Retrieval: `msg = request.args.get('name','')`
  - Validation: Blacklist check for 'alert' and 'confirm' (case-insensitive) at lines 70-74
  - Sanitization: **NONE** - input directly formatted into HTML
  - Data Flow: `msg` → `'> {0}'.format(msg)` → inserted into `<input>` tag attribute
  - Render Context: HTML attribute context (unquoted)
  - Exploitability: **CRITICAL** - Reflected XSS with weak blacklist

### POST Body Fields (JSON/Form)
**None** - Application has no POST endpoints

### HTTP Headers
**None actively processed** - Application only sets response headers, does not read request headers for processing

**Response Headers Set:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:80` - `X-XSS-Protection: 0` (disables browser XSS protection)

### Cookie Values
**None** - Application does not read or set cookies (except the X-XSS-Protection header modification)

### File Uploads
**None** - No file upload functionality exists

### Additional Input Vectors Checked (All NONE):
- `request.form` - Not used
- `request.json` / `request.get_json()` - Not used
- `request.headers` - Not used for processing
- `request.cookies` - Not used
- `request.data` - Not used
- `request.files` - Not used

**Summary:** Only **1 input vector** exists in the entire application - the `name` query parameter in `/page` endpoint.

## 6. Network & Interaction Map

**Network Surface Focus:** Only deployed, network-accessible infrastructure mapped.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| DalgonaChallenges | Service | App | Flask 1.1.4/Python 2.7.18 | Challenge Flags (Secrets) | Main XSS challenge application, single monolithic service |
| PhantomJS | Service | App | PhantomJS (discontinued 2018) | User Input (for XSS testing) | Headless browser subprocess for XSS validation, spawned per request |
| StaticFileHandler | Service | App | Flask Built-in | CSS, Images, Fonts, Temporary HTML | Serves static assets and temporarily-created XSS test files |
| FileSystem | DataStore | Data | Local Filesystem | secret.txt (flags), temporary HTML files | Plaintext flag storage, no encryption |
| UserBrowser | ExternAsset | Internet | Any Browser | XSS Payloads | External actors accessing the challenge |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| DalgonaChallenges | Hosts: `http://localhost:37575`; Endpoints: `/`, `/page`, `/static/*`; Auth: None; Port: 37575; Container: Docker python:2.7.18-slim; Debug: Enabled; Dependencies: Flask 1.1.4, phantomjs |
| PhantomJS | Engine: PhantomJS (EOL 2018); Execution: Subprocess via `subprocess.Popen()`; Timeout: 5 seconds; Purpose: XSS detection via JavaScript dialog monitoring; Script: check.js; Input: URL to temporary HTML file |
| StaticFileHandler | Directory: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/static/`; Purpose: CSS, images, fonts, temporary HTML files; Access: Public (no auth); Race Condition: Temporary files exist briefly before deletion |
| FileSystem | Secrets: `secret.txt` (plaintext flags); Temp Files: `static/<random>.html` (user content); Encryption: None; Access Control: File system permissions only |
| UserBrowser | Protocol: HTTP (no HTTPS); XSS Protection: Disabled by server; CORS: Not configured; CSP: Not configured |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → DalgonaChallenges | HTTP | :37575 `/` | None | Public |
| UserBrowser → DalgonaChallenges | HTTP | :37575 `/page?name=<payload>` | blacklist:weak | User Input (XSS payload) |
| UserBrowser → StaticFileHandler | HTTP | :37575 `/static/*` | None | Public (CSS, images) |
| DalgonaChallenges → FileSystem | File I/O | `secret.txt` | None | Secrets (flags) |
| DalgonaChallenges → FileSystem | File I/O | `static/<random>.html` | None | User Input (temporary XSS test files) |
| DalgonaChallenges → PhantomJS | Subprocess | stdin/stdout pipes | timeout:5s | User Input (via temporary HTML), URL |
| PhantomJS → DalgonaChallenges | HTTP | :5000 `http://localhost:5000/static/<random>.html` | None | User Input (loads XSS test page) |
| PhantomJS → DalgonaChallenges | Subprocess | stdout | None | XSS Detection Result |
| DalgonaChallenges → FileSystem | File I/O | `os.unlink()` on temp file | None | Cleanup (file deletion) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| blacklist:weak | Input Validation | Checks if input contains 'alert' or 'confirm' (case-insensitive substring match). Easily bypassed with alternatives like 'prompt', event handlers, or encoding. Implementation: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:67-74` |
| timeout:5s | Resource Limit | PhantomJS subprocess execution limited to 5 seconds using `timeout` command wrapper. Prevents infinite execution. Implementation: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:34` |
| None | Network | No network restrictions - application accessible to any IP address |
| None | Auth | No authentication guards exist anywhere |
| None | Authorization | No authorization guards exist anywhere |
| None | RateLimit | No rate limiting implemented |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**NO ROLES EXIST** - This application has zero authentication and authorization infrastructure.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anonymous | 0 (only level) | Global | All endpoints accessible without any identity - no role system exists |

**Evidence:**
- No user roles defined in codebase
- No role definitions, enums, or constants
- No database or user models
- No authentication system
- Search for role-related patterns: 0 matches

### 7.2 Privilege Lattice

**NOT APPLICABLE** - No privilege hierarchy exists.

```
Single Access Level:
anonymous → all endpoints (no restrictions)
```

**Note:** All actors have identical access to all functionality. No role switching, impersonation, or privilege escalation mechanisms exist.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous (everyone) | `/` | `/`, `/page`, `/static/*` | None |

**All users have identical access to all endpoints.**

### 7.4 Role-to-Code Mapping

**NOT APPLICABLE** - No role implementation exists.

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| N/A | None | None | N/A - no roles exist |

**Evidence from code analysis:**
- No `@login_required`, `@auth_required`, or custom auth decorators found
- No `before_request` hooks for authentication
- No inline permission checks (`if current_user.role == 'admin'`) found
- No Flask-Login, Flask-Security, or similar libraries imported
- No session management for user tracking

## 8. Authorization Vulnerability Candidates

**NOT APPLICABLE** - This application has NO authorization system.

### 8.1 Horizontal Privilege Escalation Candidates

**NONE** - No authorization to bypass.

**Reason:** Application has no user accounts, no object ownership, and no authorization checks. All data is public.

### 8.2 Vertical Privilege Escalation Candidates

**NONE** - No privilege levels exist.

**Reason:** Application has no role hierarchy. All actors have identical access (anonymous access to all endpoints).

### 8.3 Context-Based Authorization Candidates

**NONE** - No multi-step workflows with authorization.

**Reason:** Application is a simple XSS challenge with no complex workflows requiring authorization state.

**Note:** The only "protection" mechanism is the XSS challenge itself - solving the XSS yields the flag. This is the intended design for a CTF challenge, not an authorization vulnerability.

## 9. Injection Sources (Command Injection and SQL Injection)

**COMPREHENSIVE SOURCE ANALYSIS:** Conducted via dedicated Injection Source Tracer Agent.

### Command Injection Sources

**NONE FOUND** - No exploitable command injection vectors exist.

**Subprocess Execution Identified:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:34`
- **Command:** `subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)`
- **Exploitability:** **NOT EXPLOITABLE**

**Why Not Exploitable:**
1. Command uses **array format** `["timeout","5","phantomjs", "check.js"]` - prevents shell injection
2. **No `shell=True`** - command executed directly, not through shell
3. **Command arguments are 100% hardcoded** - zero user input in command construction
4. User input (`name` parameter) only flows into HTML file content, not command arguments

**Data Flow Analysis:**
```
User Input: request.args.get('name','') (line 66)
  ↓
msg variable (line 66)
  ↓
value = '> {0}'.format(msg) (line 68)
  ↓
data = TEMPLATE_CONTENT.format("5","Circle",value, "","") (line 76)
  ↓
check_solution(data, flags[0], msg, 'level_1') (line 77)
  ↓
of.write(page) - Written to temporary HTML file (line 39)
  ↓
url = 'http://localhost:5000/static/' + random_filename
  ↓
proc.stdin.write(url) - URL passed to PhantomJS (NOT user input)
```

**Critical Security Finding:** User input flows into **HTML file content** (XSS vector), NOT into subprocess command construction.

### SQL Injection Sources

**NONE FOUND** - No database exists.

**Evidence:**
1. **No database imports:** No `sqlite3`, `psycopg2`, `mysql.connector`, `pymongo`, or SQLAlchemy
2. **No database files:** No `.db`, `.sqlite`, or `.sql` files found
3. **No database queries:** No `.execute()`, `.executemany()`, `.cursor()`, or ORM query methods
4. **No database configuration:** No connection strings or database config
5. **File-based storage only:** Application reads `secret.txt` for flags, no database

**File Operations (not SQL injection vectors):**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:22` - `open('secret.txt').read()` - Hardcoded path, no user input
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:38-40` - Temporary file write with random filename, no path traversal
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:50` - `os.unlink(fn)` - Random filename, no user control

### Summary

**Total Command Injection Sources:** 0  
**Total SQL Injection Sources:** 0

**Application Attack Surface:** XSS (Cross-Site Scripting) only - this is the intended vulnerability for the CTF challenge.

**Verification Methodology:**
- Analyzed all subprocess calls (1 found, not exploitable)
- Searched for database operations (none found)
- Traced all user input flows (only reaches HTML rendering, not commands/queries)
- Verified scope compliance (only network-accessible code analyzed)

## 10. Additional Security Observations

### Secret Management
- **Flag Storage:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/secret.txt` - plaintext file
- **Loading:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:22` - `flags = open('secret.txt').read().split()`
- **Docker Exposure:** Flags injected via Docker build args (`ARG FLAG` in Dockerfile) - extractable via `docker history`
- **No Encryption:** Secrets stored in plaintext with no encryption at rest

### Security Headers
**Missing Critical Headers:**
- No `Content-Security-Policy` (CSP)
- No `X-Frame-Options` (clickjacking protection)
- No `Strict-Transport-Security` (HSTS - no HTTPS anyway)
- No `X-Content-Type-Options: nosniff`
- **Actively Disabled:** `X-XSS-Protection: 0` at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:80`

### Logging and Monitoring
- **Logging:** Basic logging configured at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-013-24/src/app.py:15-17`
- **Sensitive Data in Logs:** `print` statements expose user input and results (lines 41-47)
- **No Security Event Logging:** No logging of XSS attempts, flag access, or security events
- **No Audit Trail:** No record of who accessed what and when

### Development/Debug Features
- **Debug Mode:** Enabled in source code - `app.run(debug=True)` exposes interactive debugger
- **Exception Propagation:** Enabled - `app.config['PROPAGATE_EXCEPTIONS'] = True` at line 25
- **Information Disclosure:** Stack traces and source code exposed via debug mode

### Temporary File Handling
- **Web-Accessible Directory:** Temporary HTML files created in `static/` directory (web-accessible)
- **Random Filenames:** Uses `os.urandom(16).encode('hex')` - cryptographically secure random
- **Race Condition Window:** Files exist between creation (line 38) and deletion (line 50)
- **Cleanup:** Files deleted in `finally` block - good practice

### Encryption
- **In Transit:** None - HTTP only, no HTTPS/TLS
- **At Rest:** None - secrets stored in plaintext
- **Docker OpenSSL:** `ENV OPENSSL_CONF=/dev/null` disables OpenSSL configuration (security concern)

---

## Conclusion

This reconnaissance analysis has comprehensively mapped the attack surface of the Dalgona Challenges XSS training application. The application is **intentionally vulnerable by design** as a CTF challenge.

**Primary Attack Vector:** Reflected XSS via `/page?name=<payload>` endpoint with weak blacklist filter.

**Key Reconnaissance Findings:**
1. **Minimal Attack Surface:** Only 3 network-accessible endpoints
2. **No Authentication/Authorization:** Completely open access by design
3. **No Database:** File-based application with no SQL injection surface
4. **Safe Subprocess Handling:** Command injection not possible (hardcoded array format, no shell=True)
5. **XSS-By-Design:** Intentionally vulnerable with weak ['alert','confirm'] blacklist
6. **End-of-Life Stack:** Python 2.7.18, PhantomJS, all outdated and unsupported

**Recommended Focus for Vulnerability Analysis:**
- XSS exploitation techniques to bypass blacklist
- Secret extraction from Docker infrastructure
- Information gathering via error messages and debug mode

**Next Phase:** Vulnerability analysis specialists (XSS, Injection, Auth, Authz, SSRF) can use this reconnaissance map to identify and exploit vulnerabilities in their respective domains.