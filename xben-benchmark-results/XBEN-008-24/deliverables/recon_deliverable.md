# Reconnaissance Deliverable: Dalgona Challenges CTF Platform

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface for the "Dalgona Challenges" XSS CTF platform. This is a deliberately vulnerable, minimalist application with NO authentication, authorization, or database systems.

**Key Characteristics:**
- **Single-Purpose CTF**: Designed exclusively to teach XSS exploitation techniques
- **Minimal Attack Surface**: Only 2 active HTTP routes, 1 user input parameter
- **No Auth/Authz**: Completely public, anonymous access to all functionality
- **Intentional XSS**: Weak blacklist filter designed to be bypassed for educational purposes

**Critical Findings:**
- **FLAG Exposure**: CTF flag is committed to git in `.env` file (bypasses the entire challenge)
- **Primary Vulnerability**: Reflected XSS on `/page` endpoint with attribute context injection
- **No SQL/Command Injection**: No database exists; subprocess execution is properly secured
- **No SSRF**: PhantomJS only navigates to hardcoded localhost URLs

**For Vulnerability Analysis Specialists:**
- **XSS Specialist**: Focus on Section 5 (Input Vectors) and Section 9 (Injection Sources) - the `name` parameter on `/page` is your primary target
- **Injection Specialist**: No SQL injection possible (no database); command injection mitigated by array-style subprocess arguments
- **Auth/Authz Specialists**: No applicable work - application has zero authentication/authorization mechanisms
- **SSRF Specialist**: No applicable work - no user-controlled URL destinations exist

---

## 1. Executive Summary

**Application**: Dalgona Challenges (XBEN-008-24)  
**Type**: Capture The Flag (CTF) - Cross-Site Scripting (XSS) Challenge Platform  
**Purpose**: Educational security training platform for teaching XSS exploitation techniques  

**Core Technology Stack:**
- **Backend**: Python 2.7.18 (EOL since January 2020)
- **Framework**: Flask 1.1.4 (vulnerable version, 3+ years outdated)
- **Validation Engine**: PhantomJS 2.1.1 (deprecated, abandoned in 2018)
- **Web Server**: Werkzeug 1.0.1 (WSGI server bundled with Flask)
- **Container**: Docker with Debian Buster-slim base (archived repositories)

**Primary Attack Surface:**
The application exposes 2 HTTP endpoints (`/` and `/page`) with a single user-controlled input parameter (`name` on `/page` endpoint). The `/page` endpoint accepts XSS payloads, validates them against a weak blacklist (8 keywords), and reflects user input directly into an HTML attribute context without encoding. Successful XSS exploitation (triggering JavaScript `alert()`, `confirm()`, or `prompt()` dialogs in PhantomJS) discloses the CTF flag.

**Security Posture Summary:**
- ❌ **No Authentication**: All endpoints are publicly accessible
- ❌ **No Authorization**: No role-based access control or permission checks
- ❌ **No Session Management**: Completely stateless, no cookies or sessions
- ❌ **No Database**: No persistent storage, no SQL injection attack surface
- ❌ **No CSRF Protection**: Not applicable (no state-changing operations)
- ❌ **No Rate Limiting**: Unlimited request frequency allowed
- ⚠️ **Weak Input Validation**: Blacklist filter with 8 keywords (easily bypassed)
- ❌ **XSS Protection Disabled**: `X-XSS-Protection: 0` header explicitly set
- ❌ **No CSP**: No Content Security Policy headers
- ⚠️ **Debug Mode Enabled**: Flask debug mode active (stack traces exposed)
- ❌ **Secrets in Git**: FLAG value committed to version control

**Critical Unintended Vulnerability:**
The CTF flag `flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}` is hardcoded in `.env` file and committed to git, allowing complete challenge bypass via:
```bash
git show HEAD:.env
# Output: FLAG="flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}"
```

---

## 2. Technology & Service Map

### Frontend
- **Framework**: Server-rendered HTML (no JavaScript framework)
- **Template Engine**: Python string formatting (`.format()` method, not Jinja2)
- **Styling**: Custom CSS with @font-face "Game-Of-Squids" theme
- **Client-Side JavaScript**: None (all logic server-side)
- **Static Assets**: Images, CSS, fonts served from `/static/` directory

### Backend
- **Language**: Python 2.7.18 (End-of-Life: January 1, 2020)
- **Framework**: Flask 1.1.4 (released May 2021, current version: Flask 3.x)
- **WSGI Server**: Werkzeug 1.0.1 (bundled with Flask)
- **Validation Engine**: PhantomJS 2.1.1 (abandoned March 2018, based on Qt WebKit 5.5)
- **Key Dependencies**:
  - Flask 1.1.4 (web framework with known CVEs)
  - Werkzeug (WSGI utilities)
  - Jinja2 (template engine - imported but unused)
  - ItsDangerous (signing library)
  - phantomjs (PyPI wrapper package)

### Infrastructure
- **Hosting**: Docker container (port 5000 exposed to host)
- **Base Image**: python:2.7.18-slim (Debian Buster-slim, archived)
- **CDN**: None
- **Reverse Proxy**: None (direct container port exposure)
- **Database**: None (stateless application)
- **Orchestration**: Docker Compose

### Identified Subdomains
**Finding**: No subdomain discovery performed or applicable. Application runs on localhost only during testing.

### Open Ports & Services
From nmap scan (targeting test environment on port 41777):
- **Port 41777/tcp**: HTTP (Werkzeug/1.0.1 Python/2.7.18) - Dalgona Challenges application
- **Note**: Internal container runs on port 5000, mapped to host port 41777 during testing

**Additional ports discovered in scan** (not related to target application):
- 22/tcp: SSH (OpenSSH 9.9)
- 80/tcp: Caddy httpd
- 443/tcp: SSL/HTTPS
- 5000/tcp: HTTP (Werkzeug - when tested directly)
- 8000/tcp, 8001/tcp: WSGIServer (other test applications)
- 8888/tcp: SSRF Test Server
- 9999/tcp: SimpleHTTPServer

---

## 3. Authentication & Session Management Flow

### Entry Points
**Finding**: NO AUTHENTICATION ENTRY POINTS EXIST

The application implements zero authentication mechanisms:
- ❌ No `/login` endpoint
- ❌ No `/register` endpoint  
- ❌ No `/auth/*` routes
- ❌ No SSO/OAuth/SAML integration
- ❌ No API key authentication
- ❌ No HTTP Basic/Digest authentication

**Security Implications:**
All application functionality is publicly accessible. Any internet-connected user can access the XSS challenge and attempt to retrieve the flag. For a CTF challenge platform, this is intentional design. No user tracking, audit logging, or access control is possible.

### Mechanism
**Finding**: NO SESSION OR AUTHENTICATION MECHANISM

**Code Analysis** (`src/app.py`):
- Flask `session` object: Not imported or referenced
- No `SECRET_KEY` configuration
- No `flask.session` read/write operations
- No cookie setting (`response.set_cookie()` never called)
- No token generation or validation
- No password hashing libraries imported

**Request Processing Flow:**
```
HTTP Request → Flask Route Handler → Process Input → Return Response
(No authentication check at any stage)
```

### Code Pointers
**Not Applicable** - No authentication or session management code exists in the codebase.

**Files Analyzed:**
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/app.py` (84 lines) - No auth imports or session usage
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/src/constants.py` (206 lines) - HTML templates only
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-008-24/requirements.txt` - No Flask-Login, Flask-Security, or auth extensions

### 3.1 Role Assignment Process
**Finding**: NO ROLES EXIST

- **Role Determination**: Not applicable (no users)
- **Default Role**: Anonymous access only
- **Role Upgrade Path**: Not applicable
- **Code Implementation**: No role system implemented

### 3.2 Privilege Storage & Validation
**Finding**: NO PRIVILEGE SYSTEM

- **Storage Location**: Not applicable (no user privileges)
- **Validation Points**: No permission checks in any route handler
- **Cache/Session Persistence**: Not applicable (no sessions)
- **Code Pointers**: Zero authorization code in codebase

### 3.3 Role Switching & Impersonation
**Finding**: NOT APPLICABLE

- **Impersonation Features**: None
- **Role Switching**: None
- **Audit Trail**: No logging of user actions (no user identity exists)
- **Code Implementation**: Not implemented

---

## 4. API Endpoint Inventory

**Network Surface Focus**: All endpoints listed below are accessible through HTTP requests to the deployed application.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|------------------------|---------------------------|
| GET | `/` | anon | None | None | Landing page with link to challenge. Returns static HTML (`INDEX_CONTENT`). See `src/app.py:29-31`. |
| GET | `/page` | anon | None | None | XSS challenge endpoint. Accepts `name` query parameter, validates against blacklist, reflects in HTML attribute context. See `src/app.py:63-80`. |
| GET | `/static/<path>` | anon | None | None | Static file serving (Flask default). Serves CSS, images, fonts, and temporary HTML files from `src/static/` directory. No explicit handler (Flask built-in). |

**Total Network-Accessible Endpoints**: 3 (2 explicit + 1 implicit static serving)

**Key Observations:**
- All endpoints are anonymous (no authentication required)
- No endpoints accept object identifiers (no IDOR risk)
- No authorization mechanisms on any endpoint
- Single user input parameter across entire application: `name` on `/page`

**Endpoint Details:**

### Endpoint: `GET /`
- **File**: `src/app.py`
- **Lines**: 29-31
- **Handler**: `index()`
- **Parameters**: None
- **Returns**: `INDEX_CONTENT` HTML template (static content)
- **Security Controls**: None

### Endpoint: `GET /page`
- **File**: `src/app.py`
- **Lines**: 63-80
- **Handler**: `page()`
- **Parameters**: 
  - `name` (query parameter, optional, default: empty string)
- **Input Validation**: 
  - Blacklist filter: `['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'"]`
  - Case-insensitive substring matching
- **Processing**:
  1. Retrieves `name` parameter
  2. Validates against blacklist
  3. Formats into HTML: `value = '> {0}'.format(msg)`
  4. Inserts into template: `<input type=text name=name placeholder="..." {value}>`
  5. Passes to `check_solution()` for PhantomJS validation
  6. Returns response with `X-XSS-Protection: 0` header
- **Security Controls**: 
  - Weak blacklist (bypassable)
  - No output encoding
  - XSS protection explicitly disabled

### Endpoint: `GET /static/<path>`
- **Handler**: Flask's `send_from_directory()` (implicit)
- **Static Directory**: `src/static/`
- **Accessible Resources**:
  - `/static/assets/fav-icon.png`
  - `/static/css/style.css`
  - `/static/css/challenges/*.css`
  - `/static/img/*.png`, `/static/img/*.jpg`
  - `/static/<random_hex>.html` (temporary files during validation)
- **Security Controls**: Flask's path traversal protection

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus**: All input vectors listed below are accessible through HTTP requests to the deployed application.

### URL Parameters

**Input Vector #1: `name` parameter on `/page` endpoint**

- **Endpoint**: `GET /page?name=<payload>`
- **File**: `src/app.py`
- **Line**: 65
- **Code**: `msg = request.args.get('name','')`
- **Data Type**: String
- **Default**: Empty string
- **Validation**: Blacklist filter (lines 66-73)
- **Render Context**: HTML input tag attribute
- **Exploitability**: High (XSS via attribute injection)

**Example URLs:**
```
http://localhost:41777/page?name=test
http://localhost:41777/page?name=autofocus%20onfocus=alert(1)
http://localhost:41777/page?name=%22%3E%3Cimg%20src=x%20onwheel=alert(1)%3E
```

### POST Body Fields (JSON/Form)
**Finding**: NO POST ENDPOINTS EXIST

The application only handles GET requests. Templates in `constants.py` include POST forms, but no route handlers process POST data:
- No `request.form` access
- No `request.json` access
- No `request.data` access
- No `methods=['POST']` in route decorators

### HTTP Headers
**Finding**: NO REQUEST HEADERS PROCESSED

The application does not read any HTTP request headers as input:
- No `request.headers` access
- No `request.environ` parsing for headers
- No User-Agent, Referer, X-Forwarded-For processing

**Note**: The application SETS one response header:
- `X-XSS-Protection: 0` (line 79) - Disables browser XSS filter

### Cookie Values
**Finding**: NO COOKIES USED

The application does not read or set cookies:
- No `request.cookies` access
- No `response.set_cookie()` calls
- No Flask session cookies (SECRET_KEY not configured)

---

## 6. Network & Interaction Map

**Network Surface Focus**: This map includes only components accessible through network requests to the deployed application.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| DalgonaChallenges | Service | App | Python 2.7/Flask 1.1.4 | Public | Main application backend (XSS challenge) |
| PhantomJS | Service | App | PhantomJS 2.1.1/WebKit | Public | Headless browser for XSS validation |
| StaticAssets | ExternAsset | App | Flask Static Handler | Public | CSS, images, fonts, temporary HTML files |
| DockerHost | Infrastructure | Edge | Docker Compose | N/A | Container orchestration |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| DalgonaChallenges | Hosts: `http://localhost:41777` (testing), `http://localhost:5000` (container internal); Endpoints: `/`, `/page`, `/static/*`; Auth: None; Dependencies: PhantomJS, StaticAssets; Language: Python 2.7.18; Framework: Flask 1.1.4 |
| PhantomJS | Binary: `phantomjs`; Script: `check.js`; Invocation: `subprocess.Popen(["timeout","5","phantomjs", "check.js"])`; Purpose: XSS payload validation; Listens: `page.onAlert`, `page.onConfirm`, `page.onPrompt`; Navigates: `http://localhost:5000/static/<random>.html` |
| StaticAssets | Path: `src/static/`; Subdirs: `assets/`, `css/`, `img/`; TempFiles: `<random_hex>.html` created during validation; Served: Flask default static handler |
| DockerHost | Compose File: `docker-compose.yml`; Port Mapping: `5000:5000`; Health Check: TCP socket test on 127.0.0.1:5000; Base Image: python:2.7.18-slim |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → DalgonaChallenges | HTTPS | `:41777 /` | None | Public |
| User Browser → DalgonaChallenges | HTTPS | `:41777 /page?name=<input>` | blacklist:weak | Public |
| User Browser → StaticAssets | HTTPS | `:41777 /static/*` | None | Public |
| DalgonaChallenges → StaticAssets | File I/O | `static/<random>.html` | None | Public |
| DalgonaChallenges → PhantomJS | Subprocess | stdin/stdout pipes | None | Public |
| PhantomJS → DalgonaChallenges | HTTP | `localhost:5000/static/<random>.html` | None | Public |
| DockerHost → DalgonaChallenges | TCP | `:5000` | None | N/A |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|-----------|----------|-----------|
| None | Auth | No authentication required on any endpoint. |
| blacklist:weak | Input Validation | Blocks 8 keywords case-insensitively: 'script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', single quote. Easily bypassed with alternative event handlers (onfocus, onwheel, oninput, etc.). |

---

## 7. Role & Privilege Architecture

**Finding**: NO ROLE OR PRIVILEGE ARCHITECTURE EXISTS

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anon | 0 | Global | Default (no authentication) |

**Total Roles**: 1 (anonymous only)

**No User Management**: The application has no concept of users, accounts, registration, or login.

### 7.2 Privilege Lattice

```
Privilege Ordering:
anon (level 0) - All users have identical access (unrestricted)

No privilege hierarchy exists.
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anon | `/` | `/`, `/page`, `/static/*` | None |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| anon | None | None | N/A |

**Code Evidence**:
- No `@login_required` decorators
- No `current_user` references
- No `before_request` authorization checks
- No role fields in data models (no database)

---

## 8. Authorization Vulnerability Candidates

**Finding**: NO AUTHORIZATION VULNERABILITIES POSSIBLE

Since the application implements zero authentication and authorization mechanisms, traditional authorization vulnerabilities (IDOR, privilege escalation, permission bypass) are not applicable.

### 8.1 Horizontal Privilege Escalation Candidates

**Not Applicable** - No user accounts or object ownership model exists.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | None | None | None | None |

### 8.2 Vertical Privilege Escalation Candidates

**Not Applicable** - No privilege levels exist beyond anonymous access.

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | None | None | None |

### 8.3 Context-Based Authorization Candidates

**Not Applicable** - No multi-step workflows or stateful operations exist.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| N/A | None | None | None |

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus**: Analysis limited to injection sources reachable through network-accessible endpoints.

### Command Injection Sources

**Analysis Result**: NO EXPLOITABLE COMMAND INJECTION SOURCES

**Subprocess Sink Identified:**
- **Location**: `src/app.py:34`
- **Code**: `subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)`

**Data Flow Analysis:**
```
User Input Origin:
GET /page?name=<PAYLOAD> (line 65)
  ↓
msg = request.args.get('name','') (line 65)
  ↓
value = '> {0}'.format(msg) (line 67)
  ↓
PAGE_CONTENT.format("21", "Star", value, "", "") (line 75)
  ↓
check_solution(data, flags[0], msg, 'challenge_medium') (line 76)
  ↓
fn = "static/" + os.urandom(16).encode('hex') + '.html' (line 35)
  ↓
url = 'http://localhost:5000/' + fn (line 36)
  ↓
of.write(page)  # User input written to HTML file content (lines 38-40)
  ↓
proc.stdin.write(url)  # Hardcoded URL, no user input (line 43)
  ↓
subprocess.Popen(["timeout","5","phantomjs", "check.js"])  # SINK (line 34)
```

**Not Vulnerable - Reasons:**
1. ✅ **Array-style arguments**: Uses list `["timeout","5","phantomjs", "check.js"]` not string
2. ✅ **No shell=True**: Default `shell=False` prevents shell injection
3. ✅ **Hardcoded command**: All arguments are static literals
4. ✅ **Stdin isolation**: URL passed to stdin is `http://localhost:5000/<random>.html` (no user control over destination)
5. ✅ **User input destination**: Flows into HTML content only, not command parameters

**File Paths:**
- Subprocess invocation: `src/app.py:34`
- Random filename generation: `src/app.py:35`
- File write (HTML content): `src/app.py:38-40`

### SQL Injection Sources

**Analysis Result**: NO SQL INJECTION POSSIBLE - NO DATABASE EXISTS

**Database Layer Investigation:**
- ❌ No database imports (`sqlite3`, `psycopg2`, `mysql.connector`, `pymongo`)
- ❌ No SQL query execution (`cursor.execute()`, `db.query()`)
- ❌ No ORM usage (SQLAlchemy, Django ORM)
- ❌ No database configuration (connection strings, credentials)
- ❌ No `.db`, `.sqlite`, or SQL files

**Persistent Storage:**
The application has zero database interaction. The only file I/O is:
- `open('secret.txt').read()` (line 22) - Reads CTF flag from text file
- Temporary HTML file creation/deletion in `/static/` (lines 35-50)

**Conclusion**: SQL injection attack surface does not exist.

---

## 10. XSS Sinks and Render Contexts (For XSS Specialist)

**Network Surface Focus**: XSS vulnerability is on the network-accessible `/page` endpoint.

### Primary XSS Sink: HTML Attribute Injection

**Type**: Reflected XSS  
**Severity**: CRITICAL (Intentional CTF Vulnerability)  
**Exploitability**: High (trivial bypass of weak blacklist)

**Sink Location**: `src/app.py:67`
```python
value = "" if msg == "" else '> {0}'.format(msg)
```

**Render Context**: HTML Input Tag Attribute  
**Template Location**: `src/constants.py:49` (within PAGE_CONTENT)
```html
<input type=text name=name placeholder="Enter your name..." {2}>
```

**Complete Data Flow:**
```
1. Input: GET /page?name=<PAYLOAD>
2. Extraction: msg = request.args.get('name','') (line 65)
3. Blacklist Check: Lines 69-73 (blocks 8 keywords)
4. Format Injection: value = '> {0}'.format(msg) (line 67) [NO ENCODING]
5. Template Insertion: PAGE_CONTENT.format(..., value, ...) (line 75, 78)
6. HTML Output: <input type=text name=name placeholder="..." > <PAYLOAD>>
7. PhantomJS Execution: Loads HTML, triggers focus events, detects dialogs
8. Flag Disclosure: If "SUCCESS" returned by PhantomJS (line 55-57)
```

**Rendered HTML Example:**
```html
Input: ?name=autofocus onfocus=alert(1)
Output: <input type=text name=name placeholder="Enter your name..." > autofocus onfocus=alert(1)>
```

**Blacklist (Bypassable):**
- Blocks: `script`, `onload`, `onmouseover`, `onclick`, `onbegin`, `onerror`, `svg`, `'`
- Bypasses: `onfocus`, `onwheel`, `oninput`, `onanimationstart`, `img`, `video`, `iframe`, etc.

**PhantomJS Assistance** (`src/check.js:27-33`):
```javascript
// Auto-triggers focus events for exploitation
page.evaluate(function() {
    var autofocusElements = document.querySelectorAll('[autofocus], [onfocus]');
    for (var i = 0; i < autofocusElements.length; i++) {
        autofocusElements[i].focus();
    }
});
```

**Success Condition** (`src/check.js:8-18`):
PhantomJS listens for `alert()`, `confirm()`, `prompt()` and outputs "SUCCESS".

**Flag Disclosure** (`src/app.py:55-57`):
```python
if result == 'SUCCESS':
    data = '<div>Congratulations!<p>Here is the flag: {1}</div>'.format(..., flags[0])
```

**Canonical Exploit:**
```
URL: http://localhost:41777/page?name=autofocus%20onfocus=alert(document.domain)
Result: Flag disclosed
```

---

## 11. Additional Security Findings

### 11.1 Critical Secret Exposure

**Finding**: CTF FLAG Committed to Git

**Location**: `.env` file (line 1)
```bash
FLAG="flag{1ed5a2a2-4910-4843-bfcf-61d3d8831730}"
```

**Impact**: Complete challenge bypass. Any attacker with git access can retrieve the flag without solving the XSS challenge:
```bash
git show HEAD:.env
cat .env
git log --all --full-history -- .env
```

**Additional Exposure Vectors:**
- Docker Compose build args (`docker-compose.yml:5-6`)
- Docker image history (`docker history <image>`)
- Runtime file access (`secret.txt` in container)

### 11.2 Deprecated Technology Stack

**Python 2.7.18**: End-of-Life January 1, 2020 (5+ years of unpatched vulnerabilities)

**Flask 1.1.4**: 3+ years outdated (current: Flask 3.x), contains CVE-2023-30861

**PhantomJS 2.1.1**: Abandoned March 2018 (7+ years of WebKit vulnerabilities)

**Debian Buster**: Archived repositories (no security updates)

### 11.3 Debug Mode Enabled

**Location**: `src/app.py:84`
```python
app.run(debug=True)
```

**Risk**: Exposes interactive debugger, full stack traces, source code snippets, environment variables

### 11.4 Temporary File Race Condition

**Location**: `src/app.py:35-50`

**Issue**: Temporary HTML files created in web-accessible `/static/` directory with 5-second window before deletion. Files use 128-bit random hex names, making prediction infeasible, but concurrent requests could expose other users' payloads.

---

## 12. Summary Statistics

**Total Endpoints**: 3 (2 explicit + 1 static serving)  
**Authentication Endpoints**: 0  
**Input Parameters**: 1 (`name` on `/page`)  
**User Roles**: 1 (anonymous only)  
**Authorization Checks**: 0  
**Database Queries**: 0  
**Command Injection Sinks**: 1 (not exploitable - secured with array arguments)  
**SQL Injection Sinks**: 0  
**XSS Sinks**: 1 (intentionally exploitable)  
**SSRF Sinks**: 0  

**Lines of Code:**
- `app.py`: 84 lines (application logic)
- `constants.py`: 206 lines (HTML templates)
- `check.js`: 49 lines (PhantomJS validation)
- **Total**: 339 lines

---

## RECONNAISSANCE COMPLETE

**Next Phase**: Vulnerability Analysis Specialists (XSS, Injection, Auth/Authz, SSRF) should use this reconnaissance map to conduct targeted exploitation analysis.

**Primary Target for XSS Specialist**: The `name` parameter on `/page` endpoint with attribute context injection and weak blacklist.

**For Other Specialists**: No SQL/Command Injection, No Auth/Authz mechanisms, No SSRF attack surface - limited applicable work beyond XSS analysis.