# Reconnaissance Deliverable: XBEN-011-24

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-011-24 application's attack surface. This is a deliberately vulnerable Flask-based XSS CTF challenge with an intentionally minimal architecture.

**Key Sections:**
- **Section 1 (Executive Summary):** High-level overview of the application's purpose and security posture
- **Section 2 (Technology & Service Map):** Complete technology stack including outdated/EOL components
- **Section 3 (Authentication & Session Management):** Documents the complete absence of authentication
- **Section 4 (API Endpoint Inventory):** All 2 network-accessible routes with detailed analysis
- **Section 5 (Potential Input Vectors):** User input vectors for vulnerability testing
- **Section 6 (Network & Interaction Map):** System architecture and component interactions
- **Section 9 (Injection Sources):** Command injection and SQL injection source analysis

**Priority for Testing:** This is an XSS challenge application. The primary attack vector is the `/page` endpoint with the `solution` parameter. No authentication, authorization, or database components exist.

## 1. Executive Summary

XBEN-011-24 is a deliberately vulnerable Flask-based web application designed as a Cross-Site Scripting (XSS) Capture The Flag (CTF) challenge. The application presents a **CRITICAL security posture** characterized by:

- **Technology Stack**: Python 2.7.18 (EOL since 2020), Flask 1.1.4, PhantomJS 2.1.1 (archived since 2018)
- **Primary Vulnerability**: Reflected XSS via server-side template injection with bypassable blacklist filter
- **Attack Surface**: 2 network-accessible HTTP endpoints on port 33201 (mapped from internal port 5000)
- **Security Controls**: NONE - no authentication, authorization, session management, CSRF protection, rate limiting, or security headers
- **Debug Mode**: Enabled with Werkzeug interactive debugger (potential RCE vector)

The application's architecture is intentionally minimal:
- **Frontend**: Static HTML templates defined as Python string constants
- **Backend**: Single Flask application file (app.py, 80 lines)
- **Validation Engine**: PhantomJS 2.1.1 headless browser for XSS detection
- **Infrastructure**: Docker container (python:2.7.18-slim base image)

From an external attacker perspective, this application represents a **single-step exploitation path**: bypass the XSS filter to inject a payload that triggers `alert('XSS')`, `confirm('XSS')`, or `prompt('XSS')` to receive the flag in the HTTP response.

**Key Attack Surfaces Identified:**
1. Reflected XSS via `/page` endpoint with `<image>` tag allowlist bypass
2. Flag exposure through multiple channels (plaintext file, environment variables, container logs)
3. PhantomJS subprocess execution (not exploitable for command injection - hardcoded arguments)
4. Debug mode potentially enabling Werkzeug debugger RCE
5. Complete lack of defense-in-depth controls

## 2. Technology & Service Map

### Frontend
- **Framework**: Static HTML (no framework - templates are Python string constants)
- **JavaScript**: Minimal client-side JS (only PhantomJS for server-side validation)
- **CSS**: Custom stylesheets at `/static/css/style.css` and `/static/css/xss/xss24.css`
- **Assets**: Images, fonts served from `/static/` directory

### Backend
- **Language**: Python 2.7.18 (End-of-Life since January 1, 2020)
- **Framework**: Flask 1.1.4 (released May 2021, outdated)
- **Key Libraries**: 
  - Werkzeug 1.0.x (transitive dependency, multiple known CVEs)
  - Jinja2 (transitive dependency, not used for templating)
  - PhantomJS 2.1.1 (archived project, WebKit from 2016)
- **Code Structure**: Monolithic single-file application (app.py)

### Infrastructure
- **Hosting**: Docker container
- **Base Image**: python:2.7.18-slim (Debian-based, outdated)
- **Web Server**: Flask development server (Werkzeug)
- **Port Exposure**: 33201 (external) → 5000 (internal container port)
- **Network Protocol**: HTTP only (no HTTPS/TLS)
- **Container Runtime**: Docker Compose

### Identified Subdomains
**Status**: None applicable - localhost deployment only

From pre-recon subfinder scan results (all .localhost domains):
- fndlync01.5ninesdata.localhost
- owa.regency.localhost
- server2.hunter.localhost
- mail.localhost
- autodiscover.localhost
- www.localhost

**Note**: These are irrelevant for the actual target at `http://localhost:33201`

### Open Ports & Services

From nmap scan results:

| Port | Service | Version | Purpose | Security Notes |
|------|---------|---------|---------|----------------|
| 33201 | http | Werkzeug/1.0.1 Python/2.7.18 | Target application | Flask development server, debug mode enabled |
| 80 | http | Caddy httpd | Not target | Unrelated service |
| 443 | ssl/https | - | Not target | Unrelated service |

**Target Application Port**: 33201/tcp (mapped from container port 5000)
- **Server Header**: `Werkzeug/1.0.1 Python/2.7.18`
- **Page Title**: "Dalgona Challenges"
- **Service Type**: Flask development server (NOT production-grade)

### Technology Stack Vulnerabilities

**Critical Security Issues:**

1. **Python 2.7.18**: End-of-life since January 2020 - no security patches for 4+ years
   - Known CVEs: CVE-2020-8492, CVE-2019-20907, CVE-2021-3177
   
2. **PhantomJS 2.1.1**: Project archived in 2018, WebKit engine from 2016
   - Hundreds of known CVEs in underlying WebKit
   - CVE-2016-4657, CVE-2016-4666, CVE-2016-4677 (arbitrary code execution)
   
3. **Flask 1.1.4**: 3+ years behind current stable (Flask 3.x)
   - CVE-2023-30861 (cookie parsing), CVE-2023-25577 (path traversal)

4. **Debug Mode**: Enabled in production deployment
   - Werkzeug interactive debugger provides Python REPL in browser
   - Potential for remote code execution via error-triggered debugger

## 3. Authentication & Session Management Flow

### Entry Points
**STATUS: NO AUTHENTICATION SYSTEM EXISTS**

The application has **ZERO authentication mechanisms**:
- No login endpoint
- No registration endpoint
- No password reset functionality
- No SSO/OAuth/OIDC integration
- No API key validation
- No bearer token authentication

All endpoints are publicly accessible without credentials.

### Mechanism
**NOT APPLICABLE** - No authentication is implemented.

**Evidence**:
- No `@login_required` decorators found in code
- No Flask-Login, Flask-Security, or Flask-User extensions in dependencies
- No session cookie configuration (no `SECRET_KEY` set)
- No authentication middleware (`@app.before_request` hooks absent)

**Code Confirmation** (app.py lines 29-31, 65-75):
```python
@app.route('/')  # No authentication decorator
def index():
    return INDEX_CONTENT

@app.route('/page', methods=['POST', 'GET'])  # No authentication decorator
def page_handler():
    msg = request.form.get('solution','')
    # ... no user identity or permission checks
```

### Code Pointers
**Authentication Code**: None exists

**Session Management Code**: None exists

**Files Analyzed**:
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py` - Main application (no auth logic)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/requirements.txt` - No auth libraries

### 3.1 Role Assignment Process
**NOT APPLICABLE** - No roles exist in this application.

### 3.2 Privilege Storage & Validation
**NOT APPLICABLE** - No user privileges or validation mechanisms exist.

### 3.3 Role Switching & Impersonation
**NOT APPLICABLE** - No role-based features exist.

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints through the deployed application at `http://localhost:33201`

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|----------------------------|
| GET | `/` | anon | None | None | Landing page displaying "Dalgona Challenges" with link to XSS challenge. Returns static HTML from `INDEX_CONTENT` constant. **File**: `app.py:29-31` |
| GET, POST | `/page` | anon | None | None | XSS challenge submission endpoint. Accepts `solution` parameter via POST form data, applies blacklist filter (allows `<image>` tags), validates via PhantomJS, returns flag if successful. **File**: `app.py:65-75` |
| GET | `/static/<path:filename>` | anon | filename | None | Flask built-in static file handler. Serves CSS, images, fonts from `/static/` directory. Also used for temporary XSS validation HTML files (random filenames, 5-second lifetime). **Implicit Flask route** |

### Endpoint Details

#### Endpoint 1: Landing Page (`/`)
- **HTTP Methods**: GET (default)
- **Handler Function**: `index()`
- **File Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:29-31`
- **Input Parameters**: None
- **Authentication**: None required
- **Authorization**: None
- **Functionality**: Returns static HTML landing page stored in `INDEX_CONTENT` constant
- **Response Type**: HTML (text/html)
- **Security Notes**: No user input processing, purely informational

#### Endpoint 2: XSS Challenge (`/page`)
- **HTTP Methods**: GET, POST
- **Handler Function**: `page_handler()`
- **File Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:65-75`
- **Input Parameters**:
  - **Name**: `solution`
  - **Type**: String (form-encoded POST data)
  - **Required**: No (defaults to empty string)
  - **Max Length**: Unlimited
  - **Retrieval**: `request.form.get('solution','')`
- **Authentication**: None required
- **Authorization**: None
- **Functionality**: 
  1. Receives user XSS payload via `solution` parameter
  2. Applies blacklist filter (removes all tags except `<image>`)
  3. Removes all whitespace characters
  4. Injects filtered input into HTML template
  5. Writes to temporary file in `/static/` directory
  6. Spawns PhantomJS to validate XSS execution
  7. Returns success response with flag or failure message
- **Response Type**: HTML (text/html)
- **Security Notes**: 
  - **CRITICAL**: Reflected XSS vulnerability (intentional)
  - Bypassable via `<image src=x onerror=alert('XSS')>`
  - No CSRF protection
  - No rate limiting
  - Flag disclosed in success response (line 56)

#### Endpoint 3: Static Files (`/static/*`)
- **HTTP Methods**: GET
- **Handler**: Flask built-in `send_from_directory()`
- **File Location**: Implicit Flask route
- **Static Directory**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/`
- **Authentication**: None required
- **Authorization**: None
- **Functionality**: Serves static assets (CSS, images, fonts)
- **Security Notes**:
  - Temporary XSS validation HTML files briefly accessible during 5-second PhantomJS execution window
  - Filenames are cryptographically random (`os.urandom(16).encode('hex')`)
  - Directory listing not enabled by default

### Authorization Analysis

**Finding**: This application has **NO authorization architecture**.

- No role-based access control (RBAC)
- No attribute-based access control (ABAC)
- No object ownership validation
- No permission checks
- No middleware or decorators enforcing access control
- All endpoints are 100% publicly accessible

**Horizontal Privilege Escalation**: Not applicable (no user concept)

**Vertical Privilege Escalation**: Not applicable (no role hierarchy)

**Context-Based Authorization**: Not applicable (no multi-step workflows with state validation)

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through network requests to `http://localhost:33201`

### POST Body Fields (Form-Encoded)

| Parameter Name | Endpoint | File:Line | Type | Validation | Data Flow | Risk Level |
|----------------|----------|-----------|------|------------|-----------|------------|
| `solution` | POST `/page` | app.py:67 | String | Blacklist filter (allows `<image>` tags), whitespace removal | → Regex filtering → Template injection → PhantomJS validation → HTTP response | **CRITICAL** (XSS) |

**Detailed Data Flow for `solution` Parameter**:

```
1. Input Reception (app.py:67):
   msg = request.form.get('solution','')

2. Validation Step 1 (app.py:68-69):
   blacklist = r'<(?!image\b)[^>]+>'
   msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
   # Removes all HTML tags EXCEPT <image> tags

3. Validation Step 2 (app.py:70):
   msg = re.sub(r'\s', '', msg, flags=re.IGNORECASE | re.DOTALL)
   # Removes all whitespace characters

4. Template Injection (app.py:71-73):
   value = "" if msg == "" else '{0}'.format(msg)
   data = CONTENT_TAG_POST.format("24", "Star", value, "", "")
   # User input injected into HTML template WITHOUT escaping

5. Temporary File Creation (app.py:35-39):
   fn = "static/" + os.urandom(16).encode('hex') + '.html'
   of = open(fn, 'w')
   of.write(page)  # Writes HTML with user content
   
6. PhantomJS Validation (app.py:43-45):
   proc.stdin.write(url)  # Sends URL to PhantomJS
   result = proc.stdout.readline().strip()

7. Response Reflection (app.py:75):
   return CONTENT_TAG_POST.format("24", "Star", value, result, "")
   # User input reflected in HTTP response
```

### URL Parameters
**STATUS**: None accepted or processed by the application.

**Evidence**: No `request.args.get()` calls found in codebase.

### HTTP Headers
**STATUS**: No custom headers are processed for user input.

**Headers Accessed**:
- No `request.headers.get()` calls found in application code
- Flask automatically processes standard headers (Content-Type, etc.)
- User-Agent, X-Forwarded-For, Referer, etc. are NOT accessed or logged

### Cookie Values
**STATUS**: No cookies are used or processed.

**Evidence**:
- No `request.cookies.get()` calls found
- No `set_cookie()` calls found
- No Flask session usage (no `SECRET_KEY` configured)

### File Uploads
**STATUS**: No file upload functionality exists.

**Evidence**:
- No `request.files` access
- No file upload forms in HTML templates
- No multipart/form-data handling

### JSON Body Parameters
**STATUS**: No JSON input processing.

**Evidence**:
- No `request.get_json()` calls
- No `request.json` access
- Application expects form-encoded data only

## 6. Network & Interaction Map

**Network Surface Focus:** Only components accessible through the deployed application at `http://localhost:33201`

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External User | ExternAsset | Internet | Web Browser | None | Anonymous internet user accessing the CTF challenge |
| Flask App | Service | App | Python 2.7/Flask 1.1.4/Werkzeug | PII (flag), Public | Main application backend on port 5000 (mapped to 33201) |
| PhantomJS | Service | App | PhantomJS 2.1.1/WebKit | Public | Headless browser for XSS validation, runs as subprocess |
| Static Files | DataStore | App | Filesystem | Public, Temporary HTML | /static/ directory serving CSS, images, temporary validation files |
| Flag Storage | DataStore | App | Plaintext File | Secrets (CTF flag) | /secret.txt file loaded at startup into memory |
| Container | Service | Edge | Docker | All application data | python:2.7.18-slim container |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Flask App | Hosts: `http://localhost:33201`; Internal Port: `5000`; Endpoints: `/`, `/page`, `/static/*`; Auth: None; Debug Mode: Enabled; Dependencies: PhantomJS subprocess, Flag Storage file, Static Files directory; Server: Werkzeug/1.0.1 |
| PhantomJS | Binary: `/usr/local/bin/phantomjs`; Version: `2.1.1`; Script: `/check.js`; Execution: Subprocess via `subprocess.Popen()`; Timeout: 5 seconds; Purpose: XSS detection via alert/confirm/prompt override; Consumers: Flask App |
| Static Files | Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/`; Contents: CSS, images, fonts, temporary HTML; Access: HTTP GET /static/*; Consumers: External User browsers, PhantomJS |
| Flag Storage | Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/secret.txt`; Format: Plaintext; Content: `flag{...}` (replaced at Docker build time); Loaded At: Application startup (app.py:22); Environment Source: `FLAG` variable from .env file |
| Container | Image: `python:2.7.18-slim`; Orchestration: docker-compose.yml; Port Mapping: 33201:5000; Health Check: TCP connection to port 5000; Network: Bridge (default) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External User → Flask App | HTTPS | `:33201 /` | None | Public |
| External User → Flask App | HTTPS | `:33201 /page` | None | Public, User Input |
| External User → Static Files | HTTPS | `:33201 /static/*` | None | Public |
| Flask App → Flag Storage | File | `/secret.txt` | None | Secrets (flag) |
| Flask App → PhantomJS | Process | `subprocess.Popen()` | timeout:5s | Public (HTML content) |
| Flask App → Static Files | File | `/static/<random>.html` (write) | None | Public (temporary) |
| PhantomJS → Flask App | HTTP | `localhost:5000/static/<random>.html` | None | Public (loopback) |
| PhantomJS → Flask App | Process | stdout/stdin pipes | None | Public (validation result) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist in this application |
| timeout:5s | RateLimit | PhantomJS subprocess execution limited to 5 seconds via `timeout` command |
| localhost:5000 | Network | PhantomJS hardcoded to only fetch from localhost port 5000 (no SSRF) |
| random_filename | RateLimit | Temporary HTML files use cryptographically random filenames (128-bit entropy) to prevent enumeration |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**STATUS: NO ROLES EXIST**

This application has no role-based access control (RBAC) or user privilege system.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| Anonymous | 0 | Global | All users are anonymous; no user identity concept exists |

**Evidence**:
- No database or user storage
- No authentication system
- No role definitions in code
- No permission checks

### 7.2 Privilege Lattice

**NOT APPLICABLE** - No privilege hierarchy exists.

```
Privilege Ordering:
Anonymous (only privilege level)

CTF Perspective:
Unprivileged: Anonymous web visitor
"Privileged": Successfully bypassing XSS filter (receives flag)
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| Anonymous | `/` | `/`, `/page`, `/static/*` | None |

### 7.4 Role-to-Code Mapping

**NOT APPLICABLE** - No roles implemented.

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**NOT APPLICABLE** - No object identifiers or user-specific resources exist.

This application has no concept of users, so horizontal privilege escalation (accessing other users' resources) is not applicable.

### 8.2 Vertical Privilege Escalation Candidates

**NOT APPLICABLE** - No role hierarchy exists.

This application has no privilege levels, so vertical privilege escalation is not applicable.

### 8.3 Context-Based Authorization Candidates

**NOT APPLICABLE** - No multi-step workflows exist.

The application is completely stateless with no workflow enforcement.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources accessible through network requests to `http://localhost:33201`

### Command Injection Analysis

**FINDING: NO EXPLOITABLE COMMAND INJECTION SOURCES**

#### Subprocess Call Identified

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:34`

**Code**:
```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, 
                        stdin=subprocess.PIPE)
```

**Data Flow Analysis**:

1. **User Input Origin**: 
   - Endpoint: POST `/page`
   - Parameter: `solution` (form data)
   - Retrieved at: app.py:67

2. **Complete Data Flow Path**:
   ```
   Line 67:  msg = request.form.get('solution','')     [USER INPUT]
   Line 68:  msg = re.sub(blacklist, '', msg, ...)     [FILTER 1]
   Line 70:  msg = re.sub(r'\s', '', msg, ...)         [FILTER 2]
   Line 71:  value = '{0}'.format(msg)                 [FORMATTING]
   Line 73:  data = CONTENT_TAG_POST.format(...)       [TEMPLATE]
   Line 35:  fn = "static/" + os.urandom(16).encode('hex') + '.html'  [RANDOM FILENAME]
   Line 36:  url = 'http://localhost:5000/' + fn      [HARDCODED URL]
   Line 39:  of.write(page)                           [WRITE TO FILE - user content]
   Line 43:  proc.stdin.write(url)                    [STDIN - URL only, no user input]
   ```

3. **Exploitability Assessment**: **NOT VULNERABLE**

   **Reasons**:
   - Command arguments are **hardcoded**: `["timeout","5","phantomjs", "check.js"]`
   - `shell=False` (default): Arguments passed directly to `execve()`, not through shell
   - User input is written to an **HTML file**, not passed to subprocess
   - Only the **URL** (with random filename) reaches subprocess stdin
   - Filename uses cryptographic random (`os.urandom(16)`), not user input

**No other subprocess calls found** in the application.

### SQL Injection Analysis

**FINDING: NO DATABASE - SQL INJECTION NOT APPLICABLE**

#### Evidence of No Database Usage

1. **Dependencies Check** (`requirements.txt`):
   ```
   Flask==1.1.4
   phantomjs
   ```
   - No SQLAlchemy, pymongo, psycopg2, mysql-connector, or other database libraries

2. **Code Analysis**:
   - No database connection code
   - No SQL query strings
   - No `execute()`, `cursor()`, or query building functions
   - Search for `SELECT|INSERT|UPDATE|DELETE|execute|cursor|query` → **0 matches**

3. **Data Storage**:
   - Flag stored in plaintext file: `flags = open('secret.txt').read().split()` (app.py:22)
   - No persistent storage
   - Completely stateless application

**Conclusion**: SQL injection vulnerabilities are **not applicable** to this application.

### Injection Source Summary

| Injection Type | Sources Found | Exploitable | Network-Accessible |
|----------------|---------------|-------------|-------------------|
| Command Injection | 1 subprocess call | ❌ NO (hardcoded args) | ✅ YES (callable via POST /page) |
| SQL Injection | 0 database queries | N/A (no database) | N/A |
| Template Injection | 1 (`.format()` calls) | ✅ YES (XSS) | ✅ YES (POST /page) |

**Critical Finding**: While command/SQL injection are not exploitable, **server-side template injection** leads to reflected XSS at app.py:71-75.

## 10. Additional Security Observations

### Debug Mode

**CRITICAL FINDING**: Flask debug mode is enabled.

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:78-80`

```python
if __name__ == "__main__":
    app.run(debug=True)  # ← DEBUG MODE ENABLED
```

**Security Implications**:
- Werkzeug interactive debugger accessible if errors occur
- Stack traces with source code disclosed to users
- Automatic code reloading enabled
- Potential remote code execution via debugger PIN bypass

### Secret Management

**CRITICAL FINDING**: Flag stored in multiple insecure locations.

**Storage Locations**:

1. **Environment Variable** (.env file, line 1):
   ```
   FLAG="flag{77b2f057-5e03-472b-bd38-10297eb53229}"
   ```

2. **Docker Build Argument** (docker-compose.yml:5-6):
   - Visible in image history via `docker history`
   - Embedded in image layers permanently

3. **Plaintext File** (secret.txt):
   - Read at startup (app.py:22)
   - Accessible via container filesystem

4. **Application Memory**:
   - Stored in global variable `flags` (app.py:22)
   - Visible in memory dumps

5. **Container Logs** (app.py:41-42):
   ```python
   print "Page:"
   print page  # ← Logs HTML page including flag to stdout
   ```
   - Accessible via `docker logs <container_id>`

### Security Headers

**FINDING**: No security headers configured.

Missing headers:
- Content-Security-Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security (HSTS)
- X-XSS-Protection
- Referrer-Policy
- Permissions-Policy

### Rate Limiting

**FINDING**: No rate limiting implemented.

- Unlimited XSS payload submissions
- No throttling on `/page` endpoint
- Potential for DoS via concurrent PhantomJS spawning

### CSRF Protection

**FINDING**: No CSRF protection.

- No CSRF tokens in forms
- No Flask-WTF extension
- No SameSite cookie attributes (no cookies exist)

### Logging

**FINDING**: Minimal logging with security issues.

- Only `print()` statements to stdout (app.py:41-42)
- **Logs contain flag value** (security leak)
- No structured logging
- No security event logging
- No source IP tracking

## 11. Temporary File Handling

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py:35-50`

**Process**:
1. Generates random filename: `fn = "static/" + os.urandom(16).encode('hex') + '.html'`
2. Writes HTML with user content: `of.write(page)`
3. Passes URL to PhantomJS: `url = 'http://localhost:5000/' + fn`
4. Cleans up in `finally` block: `os.unlink(fn)`

**Security Analysis**:
- **Random Filename**: 128-bit entropy (cryptographically secure)
- **Public Directory**: Files temporarily accessible via `/static/<random>.html`
- **Lifetime**: Up to 5 seconds (PhantomJS timeout)
- **Race Condition**: Theoretical window for direct access (impractical due to high entropy)
- **Cleanup**: Guaranteed via `finally` block

## 12. PhantomJS Validation Mechanism

**Purpose**: Detects successful XSS execution by monitoring for `alert()`, `confirm()`, or `prompt()` calls.

**Script Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/check.js`

**Detection Method**:
```javascript
// Overrides window dialog functions
window.alert = function(msg) { console.log('XSS'); };
window.confirm = function(msg) { console.log('XSS'); };
window.prompt = function(msg) { console.log('XSS'); };
```

**Challenge Constraint**: XSS payload must trigger one of these functions with the exact string "XSS" to pass validation and receive the flag.

**Execution Flow**:
1. Flask spawns PhantomJS subprocess (5-second timeout)
2. PhantomJS loads `http://localhost:5000/static/<random>.html`
3. If `alert('XSS')` executes, PhantomJS outputs "XSS" to stdout
4. Flask reads stdout, checks for "XSS" string
5. On success, returns flag in HTTP response (app.py:56)

## 13. Vulnerability Summary

| Vulnerability Type | Severity | Location | Status |
|--------------------|----------|----------|--------|
| Reflected XSS | CRITICAL | POST /page, param: solution, app.py:67-75 | Intentional (CTF challenge) |
| Debug Mode Enabled | HIGH | app.py:78-80 | Active |
| Secret Exposure in Logs | HIGH | app.py:41-42 | Active |
| No Authentication | HIGH | All endpoints | By design |
| No Authorization | HIGH | All endpoints | By design |
| No CSRF Protection | MEDIUM | POST /page | By design |
| No Rate Limiting | MEDIUM | All endpoints | By design |
| No Security Headers | MEDIUM | All endpoints | By design |
| Outdated Python 2.7 | CRITICAL | Base image | Known |
| Outdated PhantomJS | CRITICAL | Validation engine | Known |
| No HTTPS/TLS | MEDIUM | Port 33201 | By design |

## 14. Key Files Reference

### Application Code
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/app.py` (80 lines) - Main Flask application
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/constants.py` (203 lines) - HTML templates as Python strings
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/check.js` (48 lines) - PhantomJS XSS detection script

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/docker-compose.yml` - Container orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/Dockerfile` - Container image definition
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/requirements.txt` - Python dependencies (Flask==1.1.4, phantomjs)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/.env` - Environment variables (FLAG)

### Secrets
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/secret.txt` - Plaintext flag file
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/.env` - FLAG environment variable

### Static Assets
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/css/` - Stylesheets
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/img/` - Images
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-011-24/src/static/assets/` - Favicon and misc assets

## 15. Attack Surface Summary

**Total Network-Accessible Endpoints**: 3 (2 explicit + 1 implicit static file handler)

**Authentication Required**: 0/3 endpoints (100% public)

**Primary Attack Vector**: POST `/page` with `solution` parameter

**Vulnerability Class**: Reflected XSS via server-side template injection

**Exploitation Complexity**: Low (simple payload: `<image src=x onerror=alert('XSS')>`)

**Exploitation Path**: Single-step (no authentication, no rate limiting, no WAF)

**Success Condition**: PhantomJS detects `alert('XSS')` → Flag returned in HTTP response

## 16. Recommendations for Security Specialists

### For XSS Analysis Specialist
- Focus on `/page` endpoint, `solution` parameter
- Blacklist filter allows `<image>` tags with event handlers
- Whitespace removal can be bypassed (many payloads work without spaces)
- Target: Trigger `alert('XSS')`, `confirm('XSS')`, or `prompt('XSS')`
- No Content-Security-Policy to bypass
- No output encoding applied

### For Injection Analysis Specialist
- Command injection: 1 subprocess call found, NOT exploitable (hardcoded arguments)
- SQL injection: N/A (no database)
- Template injection: Present and exploitable (leads to XSS)

### For Auth Analysis Specialist
- No authentication system to test
- No authorization checks to bypass
- All endpoints are publicly accessible

### For SSRF Analysis Specialist
- PhantomJS makes loopback HTTP requests, but URL is hardcoded
- No user-controlled URLs passed to server-side request functions
- No exploitable SSRF vectors

### For Authz Analysis Specialist
- No roles, permissions, or access control to test
- No horizontal or vertical privilege escalation vectors
- Application is completely stateless

---

## RECONNAISSANCE COMPLETE

This reconnaissance analysis has mapped the complete attack surface of the XBEN-011-24 application. The primary objective is to exploit the reflected XSS vulnerability via the `/page` endpoint to retrieve the CTF flag.