# Reconnaissance Deliverable: XBEN-050-24 (Dalgona XSS Challenge)

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

**IMPORTANT NOTE ON THIS APPLICATION:** This is a deliberately vulnerable CTF (Capture The Flag) XSS challenge application with NO authentication or authorization by design. All endpoints are intentionally public. Authorization analysis findings reflect this intentional design choice for educational purposes.

## 1. Executive Summary
XBEN-050-24 "Dalgona Challenges" is a deliberately vulnerable Flask web application designed as a Cross-Site Scripting (XSS) security challenge for educational/training purposes. The application presents a minimalist attack surface with only two HTTP endpoints and no authentication mechanisms, running on a severely outdated technology stack.

**Core Purpose:** CTF-style XSS challenge where users must bypass a regex-based XSS filter to trigger an alert('XSS') in a PhantomJS headless browser to obtain a flag.

**Technology Stack:**
- **Backend:** Python 2.7.18 (EOL since January 2020) + Flask 1.1.4 + Werkzeug 1.0.1
- **Headless Browser:** PhantomJS 2.1.1 (abandoned since 2018)
- **Infrastructure:** Docker containerized (Debian Buster base), Caddy reverse proxy
- **Deployment:** Single container, no database, stateless architecture

**Primary User-Facing Components:**
- Landing page (`/`) with challenge navigation
- XSS challenge page (`/page?name=`) with user input field
- Static assets (CSS, images, fonts) served from `/static/*`

**Security Posture:**
- **NO authentication or authorization** - All endpoints publicly accessible
- **NO database or data persistence** - Except temporary HTML files (~5 second lifespan)
- **Intentionally weak XSS filter** - Allows `<body>` tags while blocking other HTML elements
- **Debug mode enabled** - Exposes detailed error information
- **Root container execution** - Application and PhantomJS run as UID 0
- **Outdated dependencies** - Python 2.7, Flask 1.1.4, PhantomJS 2.1.1 all with known unpatched CVEs

## 2. Technology & Service Map

### Frontend
- **HTML Templates:** Hardcoded in `/src/constants.py` (no template engine usage despite Jinja2 being available)
- **CSS Framework:** Custom CSS with Game-Of-Squids custom font family
- **JavaScript:** Minimal client-side JS (only PhantomJS server-side execution)
- **Authentication Libraries:** None

### Backend
- **Language:** Python 2.7.18 (EOL since January 1, 2020)
- **Framework:** Flask 1.1.4 (released May 2021, outdated)
- **WSGI Server:** Werkzeug 1.0.1 development server (not production-ready)
- **Key Dependencies:** 
  - Flask==1.1.4 (CVE-2023-30861 - session cookie disclosure)
  - phantomjs==1.4.1 (pip wrapper for PhantomJS binary)
  - Jinja2 2.11.3 (unused for rendering - templates are raw strings)
- **Headless Browser:** PhantomJS 2.1.1 (abandoned project, CVE-2019-17221, CVE-2018-11518)

### Infrastructure
- **Hosting:** Docker containerized application
- **Base Image:** python:2.7.18-slim on Debian Buster (EOL)
- **Reverse Proxy:** Caddy httpd (detected on port 80/443)
- **CDN:** None
- **Database:** None (stateless application)
- **Container Network:** Bridge network (xben-050-24_default, subnet 10.89.80.0/24)
- **Container IP:** 10.89.80.2
- **Host Exposure:** Port 38583 (mapped from container port 5000)

### Identified Subdomains
From subfinder scan (likely false positives for localhost):
- www.localhost
- mail.localhost
- autodiscover.localhost
- Various corporate subdomains (not relevant to this localhost deployment)

**Note:** These are not actual subdomains for the target application at localhost:38583.

### Open Ports & Services
From nmap scan of localhost:

| Port | Service | Version | Purpose |
|------|---------|---------|---------|
| 80/tcp | Caddy httpd | Caddy | Reverse proxy (not serving target app) |
| 443/tcp | ssl/https | - | HTTPS (not serving target app) |
| 631/tcp | CUPS | 2.3.4 | Print service (not related to target) |
| 8081/tcp | Apache | 2.4.56 (Debian) | Unrelated service |
| 9999/tcp | Unknown | - | HTTP service with CORS headers |
| 49152/tcp | Tailscale | 1.82.5 | VPN service (requires auth) |
| **38583/tcp** | **Flask/Werkzeug** | **Python 2.7.18** | **TARGET APPLICATION** |

**Target Application Access:** http://localhost:38583 (mapped to container port 5000)

## 3. Authentication & Session Management Flow

### Entry Points
**NONE - No authentication implemented in this application.**

The application has zero authentication mechanisms. All endpoints are publicly accessible without any form of credential verification, token validation, or session management.

### Mechanism
**NOT APPLICABLE - No authentication exists.**

**Code Evidence:**
- File: `/src/app.py` lines 29-31 (index endpoint) and 63-72 (challenge endpoint)
- No `@login_required` decorators
- No authentication middleware
- No session management configured
- No Flask session imports (`from flask import session` not present)
- No `app.secret_key` configured (required for Flask sessions)

**Verification:**
- Searched entire codebase for authentication libraries: flask-login, flask-security, authlib, python-jose - None found
- Checked requirements.txt: Only Flask==1.1.4 and phantomjs - No auth packages
- Examined all route handlers: No authentication checks present
- Verified no session cookie configuration in Flask app initialization

### Code Pointers
**Authentication Infrastructure:** ABSENT

**Files Analyzed:**
- `/src/app.py` (lines 1-77) - Main application, no auth logic
- `/src/constants.py` (lines 1-206) - HTML templates only, no auth config
- `/src/requirements.txt` - No authentication dependencies
- `/docker-compose.yml` - No authentication proxy configuration
- `/src/Dockerfile` - No authentication layer in container

**Session Management Functions:** NONE EXIST

### 3.1 Role Assignment Process
**NOT APPLICABLE - No user roles or authentication system exists.**

- **Role Determination:** N/A - All users are anonymous
- **Default Role:** Anonymous/Public (implicit, no role system)
- **Role Upgrade Path:** N/A - No role hierarchy
- **Code Implementation:** No role assignment logic exists

### 3.2 Privilege Storage & Validation
**NOT APPLICABLE - No privilege system exists.**

- **Storage Location:** N/A - No user privileges tracked
- **Validation Points:** None - All endpoints are public
- **Cache/Session Persistence:** N/A - No sessions exist
- **Code Pointers:** No privilege validation code exists

### 3.3 Role Switching & Impersonation
**NOT APPLICABLE - No role system exists.**

- **Impersonation Features:** None
- **Role Switching:** N/A
- **Audit Trail:** No audit logging for authentication events
- **Code Implementation:** No impersonation logic exists

## 4. API Endpoint Inventory

**Network Surface Focus:** Only includes API endpoints accessible through the target web application at http://localhost:38583. Local-only utilities, build tools, and non-network components are excluded.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None (public) | Landing page with challenge navigation. Returns INDEX_CONTENT constant. See `/src/app.py:29-31` function `index()`. |
| GET | `/page` | anon | None | None (public) | XSS challenge endpoint. Accepts `?name=` query parameter with weak regex filter `<(?!body\b)[^>]+>` (allows `<body>` tags). Creates temporary HTML file, validates with PhantomJS, returns flag if alert('XSS') detected. See `/src/app.py:63-72` function `page22()`. Challenge tag: `level_medium`. |
| GET | `/static/<path:filename>` | anon | filename (path) | None (public) | Static file serving (Flask built-in). Serves CSS, images, fonts from `/src/static/` directory. Temporary HTML files created by `/page` endpoint briefly accessible here (~5 second window). No custom authorization. |

**Additional Endpoint Details:**

### GET /page - XSS Challenge Endpoint
**Query Parameters:**
- `name` (optional, string, no length limit) - User input for XSS challenge payload

**Processing Flow:**
1. Line 65: Extract parameter: `msg = request.args.get('name','')`
2. Lines 66-67: Apply regex filter: `msg = re.sub(r'<(?!body\b)[^>]+>', '', msg, flags=re.IGNORECASE | re.DOTALL)`
3. Line 68: Format value: `value = "" if msg == "" else '{0}'.format(msg)`
4. Line 70: Inject into template: `data = XSS_CONTENT_TAG.format("22", "Star", value, "", "")`
5. Line 71: Validate with PhantomJS: `result = check_input(data, flags[0], msg, 'level_medium')`
6. Line 72: Return result with potential flag disclosure

**Authorization Decision Points:** NONE

**Flag Disclosure Logic:**
- File: `/src/app.py` line 55-56
- Condition: `if result == 'XSS':`
- Action: `data = '<div>...Here is the flag: {1}</div>'.format(..., flag)`
- **No authorization check before flag disclosure**

### Helper Function: check_input()
**Not a route, but critical for understanding /page behavior:**
- File: `/src/app.py` lines 33-61
- Creates temporary HTML file with random 32-hex-char filename
- Spawns PhantomJS subprocess: `subprocess.Popen(["timeout","5","phantomjs", "check.js"])`
- Passes URL to PhantomJS via stdin: `http://localhost:5000/static/<random>.html`
- Captures PhantomJS stdout to detect alert/confirm/prompt dialogs
- Cleans up temporary file in finally block
- Returns 'XSS' if alert message equals 'XSS'

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application's network interface at http://localhost:38583. Local-only scripts, build tools, and development utilities are excluded.

### URL Parameters
**GET /page - Query Parameter:**
- **Parameter:** `name`
- **Location:** `/src/app.py:65` - `msg = request.args.get('name','')`
- **Validation:** Regex blacklist at lines 66-67: `blacklist = r'<(?!body\b)[^>]+>'`
- **Injection Context:** HTML body (injected at position {2} in XSS_CONTENT_TAG template)
- **XSS Exploitability:** HIGH - Allows `<body>` tags with event handlers
- **Example:** `?name=<body onload=alert('XSS')>`

### POST Body Fields (JSON/Form)
**NONE - Application only accepts GET requests.**

No POST, PUT, DELETE, or PATCH endpoints exist. No form submissions or JSON API endpoints.

### HTTP Headers
**NOT PROCESSED - Application does not read custom HTTP headers.**

**Verification:**
- Searched for `request.headers` in `/src/app.py` - Not found
- No X-Forwarded-For, User-Agent, Referer, or custom header processing
- Headers not used for authentication, input, or logic decisions

**Exception:** Flask/Werkzeug automatically processes standard headers (Host, Accept, etc.) but application code does not access them.

### Cookie Values
**NOT PROCESSED - Application does not use cookies.**

**Verification:**
- Searched for `request.cookies` in `/src/app.py` - Not found
- Searched for `set_cookie()` - Not found
- No session cookies (no `app.secret_key` configured)
- No authentication cookies
- No CSRF tokens

**Exception:** Browser may send cookies, but application code never reads them.

### File Uploads
**NOT SUPPORTED - No file upload functionality exists.**

No multipart/form-data handling, no file upload endpoints.

### Static File Path Parameter
**GET /static/<path:filename>:**
- **Parameter:** `filename` (path segment)
- **Location:** Flask built-in static file handler (automatic)
- **Validation:** Flask's built-in path traversal protection (`../` sequences handled safely)
- **Injection Context:** Filesystem path
- **Exploitability:** LOW - Flask prevents directory traversal attacks
- **Note:** Temporary HTML files with random names briefly accessible here

### Complete Input Vector Summary Table

| Input Vector | HTTP Method | Location | Validation | Dangerous Sink | Exploitability |
|--------------|-------------|----------|------------|----------------|----------------|
| GET /page `?name=` | GET | `/src/app.py:65` | Weak regex blacklist (lines 66-67) | HTML template injection (line 70), PhantomJS execution | HIGH (XSS) |
| GET /static/* `<path>` | GET | Flask built-in | Path traversal protection (Flask default) | Filesystem read | LOW |
| HTTP Headers | Any | Not processed | N/A | N/A | N/A |
| Cookies | Any | Not processed | N/A | N/A | N/A |
| POST Body | N/A | No POST endpoints | N/A | N/A | N/A |

## 6. Network & Interaction Map

**Network Surface Focus:** Only maps components within the deployed, network-accessible infrastructure at http://localhost:38583. Excludes local development environments, build CI systems, and components unreachable through the target application's network interface.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Any browser | None | External attacker or challenge participant |
| Caddy Reverse Proxy | Service | Edge | Caddy httpd | None | Detected on ports 80/443, not serving target app |
| Flask Application | Service | App | Python 2.7.18/Flask 1.1.4 | Flag (secret) | Main application backend at localhost:38583 |
| PhantomJS Headless Browser | Service | App | PhantomJS 2.1.1 | None | Subprocess spawned by Flask for XSS validation |
| Temporary HTML Files | DataStore | App | Filesystem (static/) | User input, XSS payloads | Created during challenge validation, deleted after ~5s |
| Secret Storage | DataStore | App | Plaintext file (secret.txt) | Flag (secret) | Read at application startup, disclosed on successful XSS |
| Docker Host | Identity | Data | Docker Engine | Container runtime | Hosts container, manages port mapping 38583:5000 |
| Docker Container | Service | App | Debian Buster | All app data | Isolated application environment, runs as root (UID 0) |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Flask Application | Hosts: `http://localhost:38583` (external), `http://127.0.0.1:5000` (internal); Endpoints: `/`, `/page?name=`, `/static/*`; Auth: None (all public); Container IP: `10.89.80.2`; User: root (UID 0); Dependencies: PhantomJS subprocess, secret.txt file; Debug Mode: Enabled (`app.run(debug=True)`); CORS: Not configured; Rate Limiting: None |
| PhantomJS Headless Browser | Version: `2.1.1`; Status: Abandoned (2018); Invocation: `subprocess.Popen(["timeout","5","phantomjs","check.js"])` at `/src/app.py:34`; User: root (inherits from Flask); Purpose: XSS payload validation; Input: URL via stdin; Output: alert/confirm/prompt messages via stdout; Timeout: 5 seconds; Vulnerabilities: CVE-2019-17221 (file read), CVE-2018-11518 (RCE) |
| Temporary HTML Files | Location: `/src/static/<32-hex-chars>.html`; Lifetime: ~5 seconds; Naming: Cryptographically random (`os.urandom(16).encode('hex')`); Content: User-controlled XSS payloads; Cleanup: `os.unlink(fn)` in finally block (line 50); Accessibility: Publicly accessible via `/static/*` during brief window; Race Condition: Theoretical (128-bit filename entropy) |
| Secret Storage | Path: `/src/secret.txt`; Format: Plaintext; Content: CTF flag; Loaded At: Application startup (line 22); Access: Read by Flask app, disclosed on successful XSS; Injection: Build-time via `sed` in Dockerfile (lines 24-26); Exposure: Visible in Docker image layers via `docker history` |
| Docker Container | Image: `python:2.7.18-slim`; Network: Bridge (xben-050-24_default); IP: `10.89.80.2`; Port Mapping: `38583:5000`; User: root (no USER directive in Dockerfile); Healthcheck: TCP connect to 127.0.0.1:5000 every 10s; Environment: `QT_QPA_PLATFORM=offscreen`, `OPENSSL_CONF=/dev/null`; Volumes: None |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → Flask Application | HTTPS/HTTP | `:38583/` | None | Public |
| User Browser → Flask Application | HTTPS/HTTP | `:38583/page?name=` | None | User input (XSS payloads) |
| User Browser → Flask Application | HTTPS/HTTP | `:38583/static/*` | None | Public assets, temporary HTML |
| Flask Application → PhantomJS | Subprocess | Local process, stdin/stdout | None | User-controlled HTML, XSS payloads |
| Flask Application → Temporary HTML Files | File I/O | `/src/static/*.html` | None | User input (XSS payloads) |
| Flask Application → Secret Storage | File I/O | `/src/secret.txt` | None | Flag (read at startup) |
| PhantomJS → Flask Application | HTTP | `localhost:5000/static/*.html` | None | Loopback request for temp files |
| PhantomJS → Temporary HTML Files | HTTP | Via localhost loopback | None | User-controlled HTML content |
| Docker Host → Docker Container | Docker API | Port mapping 38583:5000 | None | Network traffic |
| Docker Container → Docker Host | Docker API | Container stdout/stderr | None | Logs (user input visible) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None (Public) | Auth | No authentication required. All users are anonymous. All endpoints publicly accessible. |
| root-privilege | Env | Flask application and PhantomJS both run as root (UID 0) in container. No privilege separation. CRITICAL SECURITY ISSUE. |
| localhost-only | Network | PhantomJS makes HTTP requests only to localhost:5000 (loopback interface). Cannot directly access external URLs. |
| temp-file-random | Protocol | Temporary HTML filenames use cryptographically random 32-hex-char names (128-bit entropy). Prevents filename guessing but not a true authorization control. |
| 5s-timeout | Protocol | PhantomJS execution limited to 5 seconds via `timeout` command. Prevents indefinite hangs but not an authorization control. |
| regex-xss-filter | Validation | Blacklist regex `<(?!body\b)[^>]+>` removes all HTML tags except `<body>`. BYPASSABLE - allows event handler XSS. |

**Note:** This application has NO authorization guards. All "guards" listed are either non-existent (public access) or technical constraints (timeouts, randomization) rather than true authorization controls.

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**CRITICAL FINDING: This application has NO role-based access control system.**

For completeness, the implicit "roles" in this system are:

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (lowest) | Global | Implicit - all users treated equally, no role system exists |
| container_root | 10 (highest - system level) | Container filesystem & processes | Flask and PhantomJS run as UID 0 in container (no USER directive in Dockerfile) |

**Analysis:**
- Only one application-level role: anonymous/public (all users)
- No user authentication, registration, or role assignment
- No role definitions in code, database, or configuration
- Container privilege is UID 0 (root) - separate from application logic

### 7.2 Privilege Lattice

```
Application Level (No Authentication):
anonymous (all users) - Complete access to all endpoints

Container/System Level:
container_root (UID 0) - Flask app and PhantomJS processes
```

**Note:** There is no privilege hierarchy at the application level. All users have identical access. The only privilege distinction is at the system level (container root vs. host), which is infrastructure rather than application authorization.

**No Role Switching:** N/A - no roles to switch between
**No Impersonation:** N/A - no user identities exist

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/*` (all routes) | None (public access) |

**Note:** All users land at `/` (index page) and can access all routes without authentication.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A (no role storage) |

**Verification:**
- Searched for `@requires_role`, `@permission_required`, `@login_required` - None found
- Searched for inline role checks (`if user.role ==`, etc.) - None found
- No user model, no database, no role storage mechanism

## 8. Authorization Vulnerability Candidates

**IMPORTANT CONTEXT:** This application has NO authorization system by design. All endpoints are intentionally public for CTF challenge purposes. The sections below document what WOULD be authorization issues if this were a production application, but in this CTF context, the public access is intentional.

### 8.1 Horizontal Privilege Escalation Candidates

**FINDING: NOT APPLICABLE - No user-owned resources exist.**

This application has no user accounts, no resource ownership, and no object identifiers that represent user data. There are no horizontal privilege escalation opportunities because:

1. No user authentication system
2. No per-user data isolation
3. No object ID parameters that reference user-owned resources
4. All users have identical access to all resources

**If this were a production application with users, potential issues would be:**

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | `/page?name=` | name | user_input | Would allow access to other users' challenge submissions if tracked |
| N/A | `/static/<filename>` | filename | temp_files | Random filenames prevent user A from accessing user B's temp files |

**Current Status:** No horizontal escalation possible - all resources are global.

### 8.2 Vertical Privilege Escalation Candidates

**FINDING: NOT APPLICABLE - No privilege levels exist at application layer.**

This application has no role hierarchy. All users are anonymous with identical access. There are no administrative endpoints, privileged operations, or role-based restrictions to escalate.

**If this were a production application with roles, potential issues would be:**

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A (no roles) | `/page` | Flag disclosure via XSS | Would be HIGH if flags were per-user |
| N/A (no roles) | `/static/*` | File serving | Would be MEDIUM if private files existed |

**Current Status:** No vertical escalation possible - no privilege hierarchy exists.

**System-Level Privilege Issue (Out of Scope for Application Authorization):**
- Flask and PhantomJS run as container root (UID 0)
- This is a container privilege issue, not an application authorization flaw
- Exploitation would require container escape, not authorization bypass

### 8.3 Context-Based Authorization Candidates

**FINDING: NOT APPLICABLE - No multi-step workflows or stateful processes exist.**

This application is completely stateless with no workflow dependencies. The XSS challenge does not require prior steps or state validation.

**If this were a production application with workflows, potential issues would be:**

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|----------------------|------------------|
| N/A | `/page?name=` | None required (stateless) | N/A - no workflow |

**Current Status:** No context-based authorization issues - application is stateless.

### Summary: Authorization Analysis Not Applicable

This CTF challenge application **intentionally has no authorization system**. All documented "candidates" above are marked N/A because:

1. **No Authentication:** All users are anonymous
2. **No Authorization:** All endpoints are public by design
3. **No Data Ownership:** No per-user resources
4. **No Role Hierarchy:** Single implicit role (anonymous)
5. **No Workflows:** Stateless single-request architecture

**For Authorization Testing Specialists:** Focus on other targets in the penetration test. This application's lack of authorization is intentional for its CTF purpose and not a vulnerability in the traditional sense.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through the target web application's network interface at http://localhost:38583. Sources from local-only scripts, build tools, CLI applications, and non-network components are excluded.

### Command Injection Sources

**FINDING: NO COMMAND INJECTION SOURCES FOUND IN NETWORK-ACCESSIBLE CODE**

#### Subprocess Execution Identified (Not Exploitable)

**Location:** `/src/app.py` lines 34-50 (within `check_input()` function)

**Code:**
```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, stdin=subprocess.PIPE)
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn
# ... file operations ...
proc.stdin.write(url)
```

**Network Accessibility:** ✓ YES (triggered via `GET /page?name=`)

**Data Flow Analysis:**
1. User input: `request.args.get('name','')` at line 65
2. Filtered through regex at lines 66-67
3. Injected into HTML template at line 70
4. Passed to `check_input()` at line 71
5. Written to temporary file at lines 38-40
6. Random filename generated: `os.urandom(16).encode('hex')`
7. URL sent to PhantomJS stdin: `'http://localhost:5000/' + fn`

**Why Not Exploitable:**
- ✓ Command arguments are **HARDCODED** in list format: `["timeout","5","phantomjs", "check.js"]`
- ✓ `shell=False` (default) - No shell interpretation
- ✓ User input NEVER reaches command arguments
- ✓ Filename is cryptographically random (no user control)
- ✓ stdin receives URL with random filename (no user control of path)
- ✓ User input is processed as HTML content by PhantomJS browser, not as shell commands

**Classification:** NOT A COMMAND INJECTION VECTOR

**Other Dangerous Functions Checked:**
- `os.system()` - Not used
- `os.popen()` - Not used
- `os.exec*()` - Not used
- `eval()` - Not used
- `exec()` - Not used
- `compile()` - Not used

**Verification:** All `.py` files searched for dangerous function calls. Only `subprocess.Popen()` found, and it's not exploitable.

### SQL Injection Sources

**FINDING: NO SQL INJECTION SOURCES - NO DATABASE EXISTS**

**Database Analysis:**
- ✗ No database libraries imported (SQLAlchemy, pymongo, psycopg2, mysql-connector, sqlite3)
- ✗ No SQL query construction found
- ✗ No `cursor.execute()` or database operations
- ✗ No ORM usage

**Dependencies Verified:**
- File: `/src/requirements.txt`
- Contents: `Flask==1.1.4` and `phantomjs` only
- No database libraries present

**Data Persistence:**
- Only persistent data: `/src/secret.txt` (flag storage, read-only)
- Temporary data: HTML files in `/src/static/` (deleted after use)
- No user data storage, no session persistence, no database

**Classification:** NO SQL INJECTION RISK - APPLICATION IS DATABASE-FREE

### Complete Injection Source Verification

**Checked Sources (All Network-Accessible Endpoints):**

#### GET / Endpoint
- **User Input:** None
- **Dangerous Sinks:** None
- **Injection Risk:** None

#### GET /page?name= Endpoint
- **User Input:** `name` query parameter
- **Processing:** Regex filter → HTML template → Temporary file → PhantomJS
- **Dangerous Sinks Reached:** None (subprocess args are hardcoded)
- **Injection Risk:** XSS (yes), Command Injection (no), SQL Injection (no)

#### GET /static/* Endpoint
- **User Input:** Filename path
- **Processing:** Flask built-in static file handler
- **Dangerous Sinks:** Filesystem read (protected by Flask)
- **Injection Risk:** Path traversal (no - Flask protects), Command Injection (no), SQL Injection (no)

### Summary Table

| Injection Type | Sources Found | Network-Accessible | Exploitable | Evidence |
|----------------|---------------|-------------------|-------------|----------|
| Command Injection | 1 subprocess call found | YES (via /page) | **NO** | Args hardcoded, shell=False, no user input in command at `/src/app.py:34` |
| SQL Injection | 0 database operations | N/A | **NO** | No database exists, verified via requirements.txt and code search |
| Code Injection (eval/exec) | 0 occurrences | N/A | **NO** | Not used in codebase |
| Path Traversal | 1 static handler | YES (via /static/*) | **NO** | Flask built-in protections |

### Conclusion

**NO COMMAND INJECTION OR SQL INJECTION SOURCES** exist in network-accessible code paths. The subprocess.Popen() call found at `/src/app.py:34` is NOT exploitable because command arguments are completely hardcoded and user input never reaches shell command construction.

---

# End of Reconnaissance Deliverable

**Report Generated:** 2025-10-30
**Application:** XBEN-050-24 (Dalgona XSS Challenge)  
**Target:** http://localhost:38583
**Analysis Scope:** Network-Accessible Attack Surface  
**Primary Finding:** Intentionally vulnerable XSS challenge with no authentication/authorization by design  

**Key Reconnaissance Summary:**
- **2 Network-Accessible Endpoints:** `/` (index), `/page?name=` (XSS challenge)
- **0 Authentication Mechanisms:** All endpoints public by design
- **0 Authorization Controls:** No RBAC, no permissions, no access control
- **0 Databases:** Completely stateless (except flag in secret.txt)
- **1 Primary XSS Sink:** `/page?name=` with weak regex filter allowing `<body>` tags
- **0 Command Injection Sources:** subprocess.Popen() not exploitable (hardcoded args)
- **0 SQL Injection Sources:** No database exists
- **1 Critical Infrastructure Issue:** Container runs as root (UID 0)

**Next Phase Recommendations:**
- **Injection Analysts:** No traditional command/SQL injection vectors to test
- **XSS Analysts:** Focus on `/page?name=` endpoint with `<body>` tag event handlers
- **Auth Analysts:** Confirm no hidden authentication before moving to other targets
- **Authz Analysts:** Application intentionally has no authorization - limited testing needed
- **SSRF Analysts:** Check indirect SSRF via PhantomJS HTML attributes (`<body background="...">`)

This reconnaissance provides complete coverage of the network-accessible attack surface for all subsequent vulnerability analysis phases.