# Reconnaissance Deliverable: Dalgona Challenges XSS CTF Application

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the Dalgona Challenges application's attack surface. This is an intentionally vulnerable CTF (Capture The Flag) platform designed for XSS exploitation training.

**Key Findings:**
- **No Authentication/Authorization**: This application has ZERO access controls. All endpoints are publicly accessible.
- **Attack Surface**: 2 HTTP endpoints (/ and /page) with minimal functionality
- **Primary Vulnerability**: Intentional XSS vulnerability via blacklist bypass allowing `<style>` tags
- **No Database**: Application is stateless with file-based flag storage
- **No Injection Risks**: Safe subprocess execution, no SQL database

**Critical Understanding for Subsequent Analysis:**
- **Section 3 (Authentication)**: There is NO authentication system - all subsequent analysis phases should note this
- **Section 4 (API Endpoints)**: Only 2 endpoints exist, both publicly accessible
- **Section 5 (Input Vectors)**: Single input vector via `name` query parameter on `/page`
- **Section 9 (Injection Sources)**: NO command or SQL injection sources exist

**Priority Order for Testing:**
1. XSS Analysis: Focus on the intentional `<style>` tag bypass in the blacklist filter
2. Other vulnerability types: Limited scope due to minimal attack surface

## 1. Executive Summary

**Application Purpose**: Dalgona Challenges is an intentionally vulnerable Capture-The-Flag (CTF) platform designed for security training, specifically focused on Cross-Site Scripting (XSS) exploitation techniques.

**Core Technology Stack**:
- **Frontend**: Static HTML templates (no JavaScript framework)
- **Backend**: Python 2.7.18 (END-OF-LIFE) with Flask 1.1.4
- **Server**: Werkzeug development server (NOT production-grade)
- **Validation Engine**: PhantomJS (abandoned project, last release 2016)
- **Deployment**: Docker containerized, running as root

**Primary User-Facing Components**:
- Landing page (/) displaying challenge selection
- XSS challenge endpoint (/page) with single input field
- Static file serving for CSS, images, and fonts

**Security Posture**: 
This application has ZERO authentication, authorization, or security controls by design. It represents an intentionally vulnerable educational platform where the lack of security is a feature, not a bug. The single challenge involves bypassing a weak blacklist filter to execute XSS and retrieve a flag.

## 2. Technology & Service Map

### Frontend
- **Framework**: None (raw HTML templates via Python string formatting)
- **Template Engine**: Python `.format()` strings (NO Jinja2 auto-escaping)
- **Client-Side JavaScript**: None in application code
- **CSS Framework**: Custom CSS with "Game of Squids" themed styling
- **Key Libraries**: None (static HTML/CSS only)

### Backend
- **Language**: Python 2.7.18 (CRITICAL: End-of-Life since January 1, 2020)
- **Framework**: Flask 1.1.4 (outdated, missing security improvements from Flask 2.x/3.x)
- **Key Dependencies**:
  - Flask==1.1.4
  - PhantomJS (abandoned, last release January 2016)
- **Server**: Werkzeug development server (debug=True enabled)
- **Runtime Environment**: Python 2.7.18-slim Docker image (Debian Buster)

### Infrastructure
- **Hosting Provider**: Local Docker container
- **CDN**: None
- **Database Type**: None (stateless application)
- **File Storage**: Local filesystem (`secret.txt` for flag, temporary HTML files in `static/`)
- **Container**: Docker (runs as root user - security risk)

### Identified Subdomains
From subfinder scan (localhost environment, not applicable to actual deployment):
- mail.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- www.localhost
- (Additional subdomains from scan - not relevant to target application)

**Note**: These subdomains are scan artifacts from a localhost environment and are NOT part of the actual Dalgona Challenges attack surface.

### Open Ports & Services
From nmap scan of localhost:
- **Port 80/tcp**: Caddy httpd
- **Port 443/tcp**: SSL/HTTPS (Caddy)
- **Port 5003/tcp**: Werkzeug httpd 3.0.3 (Python 3.8.17) - MedGuard application
- **Port 33841/tcp**: **TARGET APPLICATION** - Dalgona Challenges (Python 2.7.18, Werkzeug/1.0.1)

**Target Application Port**: 33841
**Target Application Service**: Werkzeug/1.0.1 Python/2.7.18 serving "Dalgona Challenges"

## 3. Authentication & Session Management Flow

### Entry Points
**NONE EXIST**

This application implements ZERO authentication mechanisms. There are:
- ❌ No `/login` endpoint
- ❌ No `/register` endpoint
- ❌ No `/auth/*` endpoints
- ❌ No SSO/OAuth flows
- ❌ No API authentication

### Mechanism
**NOT IMPLEMENTED**

**Evidence from source code analysis**:
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:3`
- Imports: `Flask, request, Response, make_response, url_for` only
- No authentication libraries: No Flask-Login, Flask-Security, PyJWT, or similar
- Requirements.txt: Only `Flask==1.1.4` and `phantomjs` - no auth dependencies

**Step-by-step authentication process**: N/A - does not exist

### Code Pointers
**File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py`

**Lines 24-25**: Flask configuration (NO secret key)
```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
# MISSING: app.secret_key (required for session management)
```

**Lines 29-31**: Index route (NO authentication check)
```python
@app.route('/')
def index():
    return INDEX_CONTENT
```

**Lines 63-72**: Challenge route (NO authentication check)
```python
@app.route('/page')
def page_handler():
    msg = request.args.get('name','')
    # ... processing logic ...
    # NO authentication validation
```

**Comprehensive search results**: 
- Searched for: `@login_required`, `@auth_required`, `session[`, `current_user`, `Bearer`, `X-API-Key`
- Result: **ZERO matches** in entire codebase

### 3.1 Role Assignment Process
**NOT IMPLEMENTED**

- **Role Determination**: N/A - no user system exists
- **Default Role**: All visitors are anonymous with full access to all endpoints
- **Role Upgrade Path**: N/A - no roles exist
- **Code Implementation**: No role assignment code exists anywhere in the application

### 3.2 Privilege Storage & Validation
**NOT IMPLEMENTED**

- **Storage Location**: N/A - no privileges exist
- **Validation Points**: No validation occurs at any endpoint
- **Cache/Session Persistence**: No sessions or caching of user state
- **Code Pointers**: N/A - no privilege validation code exists

### 3.3 Role Switching & Impersonation
**NOT IMPLEMENTED**

- **Impersonation Features**: None
- **Role Switching**: N/A - no roles to switch between
- **Audit Trail**: No audit logging of any kind
- **Code Implementation**: No impersonation features exist

## 4. API Endpoint Inventory

**Network Surface Focus**: Only network-accessible endpoints via the deployed Flask application at http://localhost:33841

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Serves landing page with challenge selection interface. Returns static HTML from INDEX_CONTENT constant. No user input processing. **File**: app.py:29-31 |
| GET | `/page` | anon | None | None | XSS challenge endpoint. Accepts `name` query parameter, applies blacklist filter (allows `<style>` tags), executes via PhantomJS, returns flag if XSS succeeds. **File**: app.py:63-72, Validation: app.py:66-67, Flag disclosure: app.py:70-72 |
| GET | `/static/<path>` | anon | None | None | Flask built-in static file serving. Serves CSS, images, fonts from `static/` directory. Also exposes temporary HTML files created during challenge validation (race condition window). **File**: Flask default |

**Total Endpoints**: 3 (2 explicit routes + 1 Flask default)

**Authorization Summary**:
- **All endpoints**: Publicly accessible, no authentication required
- **Sensitive endpoint**: `/page` can disclose flag without any access control
- **Object ownership**: No concept of user-owned resources exists

**Critical Security Finding**: The `/page` endpoint discloses the CTF flag (`flags[0]` from `secret.txt`) to ANY anonymous user who successfully bypasses the XSS filter. No rate limiting, no authentication, no audit logging.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus**: Only input vectors accessible through the deployed application's network interface at http://localhost:33841

### URL Parameters

**Input Vector #1: `/page` endpoint - `name` query parameter**
- **Location**: `GET /page?name=[USER_INPUT]`
- **Source Code**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:65`
- **Code**: `msg = request.args.get('name','')`
- **Type**: String (query parameter)
- **Validation**: Blacklist regex at line 66-67: `r'<(?!style\b)[^>]+>'`
- **Max Length**: No limit enforced
- **Critical Weakness**: Explicitly allows `<style>` tags via negative lookahead
- **Data Flow**: 
  1. Entry: request.args.get('name','') → msg variable (line 65)
  2. Filter: re.sub(blacklist, '', msg, ...) (line 67)
  3. Format: '{0}'.format(msg) → value (line 68)
  4. Template: TEMPLATE_CONTENT_TAG.format(..., value, ...) (line 70, 72)
  5. File: Written to static/[random].html (line 39 in check_solution)
  6. Execute: PhantomJS loads and executes (line 34-44)
  7. Response: Flag disclosed if XSS detected (line 56-58)

**No other URL parameters exist** in the application.

### POST Body Fields (JSON/Form)
**NONE FOUND**

Evidence:
- No POST routes defined (both routes use GET method by default)
- No `request.form`, `request.json`, or `request.data` usage in code
- No form submission endpoints

### HTTP Headers
**NONE USED BY APPLICATION**

Evidence:
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (complete file analyzed)
- Searched for: `request.headers`, `X-Forwarded-For`, `User-Agent`, `Authorization`, `X-API-Key`
- Result: **ZERO usage** of HTTP headers for input
- Note: Standard headers (Host, User-Agent, etc.) are processed by Flask/Werkzeug but not used by application logic

### Cookie Values
**NONE USED BY APPLICATION**

Evidence:
- No `request.cookies` usage found
- No `response.set_cookie()` calls
- No session cookies (no session management implemented)
- File: app.py:3 imports `make_response` but NEVER uses it

### Complete Input Vector Summary

**Total Network-Accessible Input Vectors**: 1

1. **Query Parameter**: `name` via `GET /page?name=<input>`
   - Entry Point: app.py:65
   - Validation: app.py:66-67 (weak blacklist)
   - Sink: app.py:72 (reflected in response)
   - Dangerous Functions: Python string `.format()` without escaping
   - Exploitability: CRITICAL (intentional XSS vulnerability)

**Out of Scope** (not network-accessible):
- Command-line arguments (none used)
- Environment variables (only read for Flask config, not user-controllable)
- File uploads (no file upload functionality)

## 6. Network & Interaction Map

**Network Surface Focus**: Only components accessible through the deployed application's network interface.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| DalgonaChallenges | Service | App | Python/Flask | PII, Secrets | Main application backend (Python 2.7.18, Flask 1.1.4), serves XSS challenge |
| PhantomJS | Service | App | PhantomJS 2.1.1 | User Content | Headless browser for XSS validation, abandoned project (last release 2016) |
| StaticFiles | DataStore | App | Filesystem | Public, Temp Files | Static directory serving CSS/images, also used for temp HTML files |
| SecretFile | DataStore | App | Filesystem | Secrets | secret.txt containing CTF flag in plaintext |
| UserBrowser | ExternAsset | Internet | Browser | XSS Payloads | External user's web browser accessing the application |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| DalgonaChallenges | Hosts: `http://localhost:33841`; Endpoints: `/`, `/page`, `/static/*`; Auth: None; Dependencies: PhantomJS, StaticFiles, SecretFile; Debug: Enabled (CRITICAL); Flag: Read from secret.txt at startup |
| PhantomJS | Engine: `PhantomJS 2.1.1 (QtWebKit)`; Exposure: Internal subprocess only; Consumers: DalgonaChallenges; Execution: 5-second timeout; XSS Detection: Hooks alert/confirm/prompt; CVEs: Multiple unpatched vulnerabilities |
| StaticFiles | Location: `static/` directory; Contents: CSS, images, fonts, temporary HTML files; Exposure: Public (web-accessible); Race Condition: Temp files exist briefly before deletion |
| SecretFile | Location: `secret.txt` in app root; Format: Plaintext; Encryption: None; Access Control: None (readable by app process); Content: `flag{fcec3afc-4b74-433f-b638-14091e51092e}` |
| UserBrowser | Access: Public internet; No Authentication Required; Capabilities: HTTP requests, XSS payload injection; Receives: HTML responses including flag on success |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → DalgonaChallenges | HTTPS | `:33841 /` | None | Public |
| UserBrowser → DalgonaChallenges | HTTPS | `:33841 /page?name=<payload>` | None (blacklist filter only) | XSS Payloads, Flag |
| UserBrowser → StaticFiles | HTTPS | `:33841 /static/*` | None | Public, Temp Files |
| DalgonaChallenges → SecretFile | File I/O | `secret.txt` | None | Secrets |
| DalgonaChallenges → StaticFiles | File I/O | `static/[random].html` | Cryptographic RNG for filename | User Content |
| DalgonaChallenges → PhantomJS | Subprocess | stdin/stdout | Hardcoded command args | User HTML Content |
| PhantomJS → DalgonaChallenges | HTTP | `localhost:33841/static/[random].html` | None (localhost trust) | User HTML Content |
| PhantomJS → StaticFiles | HTTP | `:33841 /static/[random].html` | None | User HTML Content |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist in this application. All endpoints are publicly accessible. |
| blacklist_regex | Input Validation | Regex pattern `r'<(?!style\b)[^>]+>'` removes most HTML tags except `<style>` tags. Applied at app.py:66-67. WEAK - allows XSS via style tags. |
| timeout_guard | Process | 5-second timeout on PhantomJS subprocess execution via `timeout` command. Prevents infinite execution. |
| random_filename | File Security | Uses `os.urandom(16).encode('hex')` for temporary filename generation. Cryptographically secure, prevents predictable filenames. |
| cgi_escape | Output Encoding | Applied to PhantomJS output when result is not 'XSS' (app.py:58). Prevents XSS in error messages. |

**Note on Authorization Guards**: This application has ZERO authorization guards. No middleware, decorators, or inline checks control access to any functionality.

## 7. Role & Privilege Architecture

**Critical Finding**: This application has **NO role or privilege architecture**. All analysis below documents the absence of authorization controls.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| Anonymous | 10 (Full Access) | Global | Default - no authentication system exists. All visitors have identical access to all functionality. |

**Evidence of No Roles**:
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py` (complete file)
- Searched for: `role`, `admin`, `user`, `permission`, `privilege`
- Result: **ZERO role definitions** found
- No User model, no role enumerations, no permission classes

### 7.2 Privilege Lattice

```
PRIVILEGE LATTICE: FLAT (No Hierarchy)

Anonymous User (Everyone)
    ├── Full Access to ALL endpoints
    ├── Can trigger XSS challenge
    ├── Can retrieve flag
    └── No restrictions whatsoever

NO ORDERING EXISTS - ALL USERS ARE EQUAL
```

**Critical Security Implication**: There is no privilege escalation possible because there is only one privilege level (full access). However, this means ANY anonymous user can access sensitive functionality (flag disclosure).

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| Anonymous | `/` | `/`, `/page`, `/page?name=*`, `/static/*` | None |

**Note**: Since only one role exists (anonymous), all users land on the same page and have identical access.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| Anonymous | None | None | N/A (no user tracking) |

**Code Evidence**:
- No `@before_request` handlers exist
- No authentication decorators exist
- No inline permission checks in any route handler
- Example from app.py:63-72 (page_handler function):
  ```python
  @app.route('/page')
  def page_handler():
      msg = request.args.get('name','')
      # NO authentication check
      # NO role validation
      # NO permission verification
  ```

## 8. Authorization Vulnerability Candidates

**CRITICAL CAVEAT**: This application has NO authorization system, so traditional horizontal/vertical privilege escalation vulnerabilities do not apply. However, the complete lack of access control IS itself a critical vulnerability.

### 8.1 Horizontal Privilege Escalation Candidates

**Status**: NOT APPLICABLE (No user accounts or object ownership)

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | No IDOR candidates | N/A | N/A | No user-owned resources exist |

**Analysis**: 
- The application has no concept of "users" or "ownership"
- No endpoints accept user_id, account_id, or similar object identifiers
- The flag is globally accessible (not tied to specific users)
- Traditional IDOR testing is not applicable

**Actual Security Issue**: The flag is accessible to ALL users without any access control - this is worse than IDOR.

### 8.2 Vertical Privilege Escalation Candidates

**Status**: NOT APPLICABLE (No privilege levels exist)

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | No privileged endpoints | N/A | N/A |

**Analysis**:
- No "admin" endpoints exist
- No "user" vs "guest" distinction exists
- All functionality is equally accessible to all visitors

**Actual Security Issue**: The `/page` endpoint should require authentication but doesn't.

### 8.3 Context-Based Authorization Candidates

**Status**: NO MULTI-STEP WORKFLOWS

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| None | N/A | N/A | No workflows exist |

**Analysis**:
- The XSS challenge is single-step (submit payload, get result)
- No multi-step processes require state validation
- No workflow bypass vulnerabilities exist

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus**: Analysis limited to network-accessible code paths through the deployed application.

### Command Injection Sources

**STATUS: NONE FOUND (Safe Implementation)**

**Analysis Summary**: While the application uses `subprocess.Popen()`, it does so SAFELY with no command injection vulnerabilities.

**Subprocess Execution Details**:
- **File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:34`
- **Code**: 
  ```python
  proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                          stdout=subprocess.PIPE, stdin=subprocess.PIPE)
  ```
- **Safety Factors**:
  1. Uses **list form** (not shell=True) - prevents shell injection
  2. All arguments are **hardcoded strings** - no user input in command
  3. User input flows to **file content**, not command arguments
  4. PhantomJS receives URL via stdin, not as command argument

**User Input Data Flow** (NOT to command):
```
1. User Input: request.args.get('name','') → msg variable (line 65)
2. Validation: Blacklist filter applied (line 67)
3. Template: Formatted into HTML string (line 68-70)
4. File Write: Written to static/[random].html (line 39)
5. URL Construction: url = 'http://localhost:5000/' + fn (line 36)
6. Subprocess: Command is hardcoded ["timeout","5","phantomjs","check.js"]
7. Input to Process: proc.stdin.write(url) ← URL, NOT user payload
```

**Why No Command Injection**:
- User input (the `name` parameter) ends up in HTML file CONTENT
- Only the FILENAME (randomly generated) and LOCALHOST URL are passed to subprocess
- The subprocess command itself contains ZERO user-controllable components

**Other Command Execution Functions Checked**:
- `os.system()`: Not found
- `os.popen()`: Not found
- `os.exec*()`: Not found
- `eval()`: Not found
- `exec()`: Not found
- `compile()`: Not found
- `shell=True`: Not found

**Conclusion**: **ZERO command injection sources** in network-accessible code paths.

### SQL Injection Sources

**STATUS: NONE FOUND (No Database)**

**Analysis Summary**: The application has NO database backend, therefore NO SQL injection vulnerabilities exist.

**Evidence of No Database**:

1. **No Database Libraries**:
   - **File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/requirements.txt`
   - **Contents**: Only `Flask==1.1.4` and `phantomjs`
   - **Missing**: sqlite3, MySQLdb, psycopg2, pymongo, SQLAlchemy, etc.

2. **No Database Imports**:
   - **File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-015-24/src/app.py:1-13`
   - **Imports**: Flask, subprocess, os, re, cgi, urllib, sys, constants, phantomjs, logging
   - **Missing**: Any database-related imports

3. **No SQL Queries**:
   - Searched entire codebase for: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `execute`, `.query`, `cursor`
   - Result: **ZERO SQL operations** found

4. **No Database Files**:
   - No `.db`, `.sqlite`, `.sql` files in source directory
   - Only data storage: `secret.txt` (plaintext file)

5. **Application Architecture**:
   - Stateless application design
   - Flag stored in text file (line 22): `flags = open('secret.txt').read().split()`
   - Temporary HTML files for challenge validation
   - No persistent user data storage

**Data Storage Methods Used**:
- **File-based**: secret.txt for flag storage
- **Temporary files**: static/[random].html for XSS validation
- **In-memory**: Flags loaded into memory at startup

**Conclusion**: **ZERO SQL injection sources** exist because no database backend is present.

### Summary of Injection Analysis

| Injection Type | Sources Found | Network-Accessible | Risk Level |
|----------------|---------------|-------------------|------------|
| Command Injection | 0 | N/A | None |
| SQL Injection | 0 | N/A | None |
| XSS (Cross-Site Scripting) | 1 | Yes | CRITICAL |

**Primary Security Concern**: This application's main vulnerability is **Cross-Site Scripting (XSS)**, not injection attacks. The XSS vulnerability is intentional for the CTF challenge.

**XSS Source** (for reference):
- **Location**: app.py:65-72 (`/page` endpoint)
- **Input**: `name` query parameter
- **Sink**: Reflected in HTML response without proper escaping
- **Bypass**: Blacklist filter allows `<style>` tags
- **Impact**: Flag disclosure when XSS is successfully triggered

### Additional Security Findings

**Safe Practices Observed**:
1. ✅ Subprocess execution using list form (not shell string)
2. ✅ No eval() or exec() usage
3. ✅ No dynamic code execution based on user input
4. ✅ Cryptographically secure random filename generation

**Unsafe Practices Observed**:
1. ❌ XSS vulnerability (intentional for CTF)
2. ❌ Debug mode enabled in production
3. ❌ PhantomJS (abandoned, vulnerable software)
4. ❌ Python 2.7.18 (end-of-life)
5. ❌ No rate limiting on flag disclosure endpoint

## 10. Additional Security Observations

### Secret Management
- **Flag Storage**: Plaintext in `secret.txt` file
- **Git Exposure**: Flag committed to version control in `.env` file
- **Docker Build**: Flag baked into Docker image layers via build argument
- **Code Location**: app.py:22 reads flag without encryption

### Debug Mode
- **Status**: Enabled (app.py:76: `app.run(debug=True)`)
- **Risk**: Werkzeug debugger provides interactive Python console
- **Impact**: Remote code execution if error page is accessible

### Outdated Technology
- **Python 2.7.18**: End-of-life since January 2020, no security updates
- **Flask 1.1.4**: ~4 years outdated, missing security improvements
- **PhantomJS**: Abandoned since 2018, multiple known CVEs

### No Security Controls
- ❌ No authentication
- ❌ No authorization
- ❌ No rate limiting
- ❌ No CSRF protection
- ❌ No security headers (CSP, X-Frame-Options, HSTS, etc.)
- ❌ No input length limits
- ❌ No audit logging
- ❌ No WAF or request filtering

### Application Purpose
This is a **deliberately vulnerable CTF challenge application** for XSS exploitation training. The lack of security controls is intentional for educational purposes. This application should NEVER be deployed in a production environment or exposed to untrusted networks.

---

## CONCLUSION

This reconnaissance analysis has mapped the complete attack surface of the Dalgona Challenges application, revealing:
- **2 HTTP endpoints** (/, /page) with zero authentication
- **1 primary input vector** (name query parameter)
- **Zero injection vulnerabilities** (command and SQL)
- **One intentional XSS vulnerability** via blacklist bypass
- **No authorization architecture** whatsoever
- **Stateless design** with file-based flag storage

All subsequent vulnerability analysis phases should focus on:
1. **XSS Analysis**: Bypassing the `<style>` tag allowlist in the blacklist filter
2. **Limited scope**: Only 2 endpoints exist, limiting other vulnerability classes
3. **No authentication testing**: No auth system to analyze or bypass

This application represents a minimal attack surface by design, focused entirely on teaching XSS exploitation techniques.