# Reconnaissance Deliverable: Dalgona Challenges XSS Training Platform

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the Dalgona Challenges application's attack surface. This is a deliberately vulnerable Flask-based XSS training CTF application with minimal attack surface consisting of only 2 network-accessible endpoints.

**Key Characteristics**:
- **No Authentication System**: All endpoints are publicly accessible
- **No Authorization Controls**: No user roles, permissions, or access restrictions
- **No Database**: Application uses only filesystem-based flag storage
- **Primary Vulnerability**: Reflected XSS in HTML attribute context
- **Secondary Vulnerability**: Server-Side Request Forgery via PhantomJS headless browser

**Application Purpose**: This is an intentionally vulnerable CTF challenge designed for XSS exploitation practice, NOT a production application.

**For Subsequent Analysis Specialists**:
- **XSS Analysis Specialist**: Focus on Section 5 (Input Vectors) and the `/page?name=` parameter with weak regex filtering
- **Injection Analysis Specialist**: Note that there are NO command injection or SQL injection sources (see Section 9 for complete analysis)
- **SSRF Analysis Specialist**: Examine the PhantomJS subprocess handling and how user input reaches the headless browser
- **Auth/Authz Specialists**: This application has ZERO authentication or authorization - document this absence as a critical finding

---

## 1. Executive Summary

The Dalgona Challenges application is a deliberately vulnerable Flask-based XSS training platform designed for CTF competitions, running on an **end-of-life technology stack** (Python 2.7.18, Flask 1.1.4, Werkzeug 1.0.1, PhantomJS 2.1.1). The application exposes a **minimal attack surface** of only **2 custom network-accessible endpoints** plus static file serving, with **ZERO authentication or authorization controls**.

**Application Architecture**: Monolithic Flask application consisting of 328 total lines across 3 Python files (app.py, constants.py, check.js), deployed via Docker with deliberate security misconfigurations including disabled TLS (`ENV OPENSSL_CONF=/dev/null`), enabled debug mode, and plaintext flag storage in version-controlled files.

**Primary Attack Surface**: The `/page?name=` endpoint exhibits a **reflected XSS vulnerability** through insufficient input filtering (only removing literal `["']XSS["']` strings) combined with direct HTML attribute injection using unsafe Python `.format()` string substitution. The weak regex filter is trivially bypassable using event handlers (`onclick`, `onerror`, `autofocus`), tag breakouts (`"><script>`), or any payload without quoted "XSS" strings.

**Critical Secondary Vulnerability**: The application implements a **server-side request forgery (SSRF)** attack vector through its PhantomJS-based XSS validation mechanism. User-controlled JavaScript embedded in temporary HTML files executes server-side within PhantomJS context, enabling attackers to make arbitrary HTTP requests to cloud metadata services (AWS 169.254.169.254, GCP metadata.google.internal, Azure metadata endpoints), internal network resources, and localhost services. This represents a **scope-changing vulnerability** that could pivot from XSS challenge exploitation to broader infrastructure compromise.

**Secrets Management Failures**: The application exhibits catastrophic secrets management with flags stored in plaintext across multiple layers: committed to Git in `.env` files, persisted in Docker image history via build ARGs, and written to unencrypted `secret.txt` files accessible to the Flask process. Any attacker with repository access, container image access, or log access can retrieve flags without solving the intended challenge.

**Technology Stack Risks**: The application runs on Python 2.7 (EOL January 2020, 300+ known CVEs), Flask 1.1.4 (outdated), and PhantomJS 2.1.1 (abandoned March 2018 with 72+ known CVEs). The Debian Buster base image uses archived repositories, indicating no active security patching. Debug mode is enabled, exposing Werkzeug's interactive debugger with arbitrary code execution capabilities if an exception is triggered.

**Security Posture**: While catastrophic for production environments, this security posture aligns with the application's stated purpose as a security training challenge. However, deployment outside isolated training environments creates substantial risks due to the SSRF pivot potential to internal infrastructure and cloud services.

---

## 2. Technology & Service Map

### Frontend
- **Framework**: Static HTML templates (no JavaScript framework)
- **Template Engine**: Python string `.format()` (NOT Jinja2 - no auto-escaping protection)
- **Key Libraries**: None (vanilla HTML/CSS)
- **Authentication Libraries**: None

### Backend
- **Language**: Python 2.7.18 (EOL January 2020)
- **Framework**: Flask 1.1.4 (outdated, current is 3.0+)
- **WSGI Server**: Werkzeug 1.0.1 development server (debug mode enabled)
- **Key Dependencies**:
  - Flask 1.1.4 (CVE-2023-30861 - Cookie security issues)
  - Werkzeug 1.0.1 (debug mode RCE risk)
  - PhantomJS 2.1.1 (72+ known CVEs, abandoned since March 2018)
- **Validation Libraries**: `re` module only (Python standard library)
- **Security Libraries**: None (no Flask-Login, Flask-Security, Flask-WTF, Bleach, etc.)

### Infrastructure
- **Hosting**: Docker container (local deployment)
- **Container Base**: Debian Buster (archived repositories, no active security updates)
- **CDN**: None
- **Database Type**: None (no database layer)
- **Storage**: Filesystem only (`secret.txt` for flags, temporary HTML files in `static/`)
- **Reverse Proxy**: None (Flask development server directly exposed)
- **Port Exposure**: 34545 (configured in docker-compose.yml, bound to 0.0.0.0)

### Identified Subdomains
Based on subfinder scan, the following subdomains were discovered but are **NOT RELEVANT** to this localhost deployment:
- owa.regency.localhost
- server2.hunter.localhost
- mail.localhost
- www.localhost
- (13 additional localhost subdomains - see pre-recon deliverable)

**Note**: These subdomains appear to be artifacts from DNS enumeration tools and are not actual subdomains of the target application at `localhost:34545`.

### Open Ports & Services
**Primary Port**: 34545 (HTTP)
- **Service**: Werkzeug/1.0.1 Python/2.7.18
- **Protocol**: HTTP only (TLS explicitly disabled)
- **Purpose**: Flask application server

**Other Ports from nmap (NOT part of target)**:
- Port 80: Caddy httpd (different service)
- Port 443: SSL/HTTPS (different service)
- Port 631: CUPS printer service (different service)
- Port 5003: Werkzeug (MedGuard application - different service)

**Target Application**: Only port 34545 is in scope for this reconnaissance.

---

## 3. Authentication & Session Management Flow

### Authentication Mechanisms
**Status**: **NOT IMPLEMENTED**

The Dalgona Challenges application has **ZERO authentication mechanisms**. There are no login endpoints, no credential validation, no user account management, and no session tracking.

### Entry Points
**Status**: All endpoints are publicly accessible without authentication requirements.

| Endpoint | Purpose | Authentication |
|----------|---------|----------------|
| `/` | Landing page with challenge instructions | None (public) |
| `/page` | XSS challenge endpoint | None (public) |
| `/static/*` | Static file serving | None (public) |

### Session Management Implementation
**Status**: **NOT IMPLEMENTED**

**Evidence**:
- **No session imports**: Flask `session` object never imported (`app.py:3`)
- **No SECRET_KEY**: Required Flask session configuration missing (`app.py:24-25`)
- **No session usage**: Zero occurrences of `session[]` or `session.get()` in codebase
- **No cookies**: Application never calls `response.set_cookie()` or `request.cookies.get()`

**Flask Configuration** (`app.py:24-25`):
```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
```

**Missing Configurations**:
- `SECRET_KEY` (required for session signing)
- `SESSION_COOKIE_SECURE` (HTTPS-only cookies)
- `SESSION_COOKIE_HTTPONLY` (JavaScript access prevention)
- `SESSION_COOKIE_SAMESITE` (CSRF protection)
- `PERMANENT_SESSION_LIFETIME` (session timeout)

### Code Pointers
**Authentication/Session Code**: **NONE EXISTS**

**Relevant File Locations**:
- Main application: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py`
- No authentication modules found
- No user management code found

---

### 3.1 Role Assignment Process

**Status**: **NOT APPLICABLE** - No user roles exist in the application.

**Role Determination**: N/A - Application treats all requests as anonymous with equal access.

**Default Role**: N/A - No concept of users or roles.

**Role Upgrade Path**: N/A - No privilege levels to upgrade between.

**Code Implementation**: No role assignment logic exists.

---

### 3.2 Privilege Storage & Validation

**Status**: **NOT IMPLEMENTED** - No privilege system exists.

**Storage Location**: N/A - No user privileges to store.

**Validation Points**: None - No authorization checks at any level:
- No middleware authorization filters
- No decorator-based permission checks (`@login_required`, `@admin_required`)
- No inline authorization logic (no `if user.role == 'admin'` statements)

**Cache/Session Persistence**: N/A - No session management.

**Code Pointers**: No privilege validation code exists in the application.

---

### 3.3 Role Switching & Impersonation

**Status**: **NOT IMPLEMENTED** - No role switching capabilities.

**Impersonation Features**: None

**Role Switching**: None

**Audit Trail**: None (no logging of authorization events)

**Code Implementation**: No role switching or impersonation features exist.

---

## 4. API Endpoint Inventory

**Network Surface Focus**: Only network-accessible endpoints reachable through the target web application at `http://localhost:34545`.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|--------------|---------------|---------------------|------------------------|---------------------------|
| GET, HEAD, OPTIONS | `/` | anon | None | None | Landing page displaying challenge instructions. Returns static HTML from `constants.INDEX`. No user input processing. **File**: `app.py:29-31` |
| GET, HEAD, OPTIONS | `/page` | anon | None | None | XSS challenge endpoint. Accepts `?name=` query parameter. Reflects user input in HTML attribute context after weak regex filter. Spawns PhantomJS subprocess for XSS validation. Returns flag if `alert('XSS')` successfully executed. **File**: `app.py:63-71`. **Vulnerabilities**: Reflected XSS (CWE-79), SSRF via PhantomJS (CWE-918) |
| GET, HEAD, OPTIONS | `/static/<path:filename>` | anon | None | None | Flask default static file handler. Serves CSS, JavaScript, images from `static/` directory. Temporary HTML files created here during XSS validation (race condition window). **File**: Flask internal routing. **Directory**: `static/` |

**Total Endpoints**: 2 custom routes + 1 default static file handler

**Endpoint Details**:

### Endpoint 1: GET /
**Handler Function**: `index()`  
**File Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:29-31`  
**Parameters**: None  
**Response Type**: HTML (200 OK)  
**Security Controls**: None  
**Attack Vectors**: Minimal (static content, no input processing)

### Endpoint 2: GET /page
**Handler Function**: `challenge_page()`  
**File Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:63-71`  
**Parameters**:
- `name` (query parameter, optional, default: empty string)
- Extracted via: `request.args.get('name','')`

**Data Flow**:
```
1. Extract parameter: msg = request.args.get('name','') [line 65]
2. Weak filter: msg = re.sub(r"""["']XSS["']""", "", msg) [line 66]
3. Attribute construction: value = 'value="{0}"'.format(msg) [line 67]
4. Template injection: PAGE_CONTENT.format(..., value, ...) [line 69, 71]
5. XSS validation: check_solution(data, flags[0], msg, 'level_2') [line 70]
6. Response: HTML with success/failure message and flag (if XSS successful)
```

**Response Type**: HTML (200 OK)  
**Security Controls**:
- Weak regex filter removing `["']XSS["']` only
- No HTML encoding/escaping
- No Content Security Policy headers
- No rate limiting

**Attack Vectors**:
- **Primary**: Reflected XSS via attribute breakout
- **Secondary**: SSRF via PhantomJS JavaScript execution
- **Race Condition**: Temporary HTML file access in `static/` directory

### Endpoint 3: GET /static/*
**Handler**: Flask default static file serving  
**File Location**: Flask internal  
**Static Directory**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/static/`  
**Parameters**: `filename` (path parameter)  
**Security Controls**: Flask built-in path traversal protections  
**Attack Vectors**: Race condition to access temporary HTML files during validation window (~5 seconds)

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus**: Only input vectors accessible through network requests to `http://localhost:34545`.

### URL Parameters (Query Strings)

#### Primary Input Vector: `name` parameter on /page endpoint
- **Location**: `/page?name=<USER_INPUT>`
- **Extraction**: `app.py:65` - `msg = request.args.get('name','')`
- **Validation**: `app.py:66` - `re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)`
- **Validation Strength**: **CRITICAL - Trivially bypassable**
  - Only removes exact strings: `"XSS"`, `'XSS'` (case-insensitive)
  - Bypasses: Any payload without quoted "XSS" text
- **Output Context**: HTML attribute (`value="{0}".format(msg)`)
- **Render Location**: `constants.py:165` - `<input type=text name=name placeholder="Enter your name..." {2}>`
- **Exploitability**: **CRITICAL** - Reflected XSS

**Attack Examples**:
```
1. /page?name=" onclick="alert('XSS')" x="
2. /page?name="><script>alert('XSS')</script>
3. /page?name=" autofocus onfocus="alert('XSS')" x="
4. /page?name="><img src=x onerror=alert('XSS')>
```

### POST Body Fields (JSON/Form)
**Status**: **NOT IMPLEMENTED**

While HTML templates exist in `constants.py` for POST forms:
- `PAGE_CONTENT_POST` (lines 56-76)
- `PAGE_CONTENT_TAG_POST` (lines 102-124)
- `PAGE_CONTENT_TEXTAREA_POST` (lines 151-176)

**No Flask routes handle POST requests**. All routes are GET-only.

### HTTP Headers
**Status**: **NOT PROCESSED**

The application does not access `request.headers` for any custom header processing.

**Standard Headers Processed by Flask**:
- `Host` (automatic routing)
- `User-Agent` (logged by Werkzeug, not app-processed)
- `Accept`, `Accept-Encoding`, etc. (Flask internal)

**Headers NOT Processed**:
- `X-Forwarded-For` (not accessed)
- `X-Real-IP` (not accessed)
- `Referer` (not accessed)
- Custom headers (none defined)

### Cookie Values
**Status**: **NOT PROCESSED**

The application does not access `request.cookies`. No cookies are set or read.

**Cookie Usage**: None

### Path Parameters
**Status**: Limited to static file serving (`/static/<path:filename>`)

**Dynamic Path Parameters**: None (no Flask route patterns like `/users/<user_id>`)

### File Uploads
**Status**: **NOT IMPLEMENTED**

No file upload handling in the application.

---

## 6. Network & Interaction Map

**Network Surface Focus**: Only components accessible through the deployed application's network interface.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| DalgonaChallenges | Service | App | Python/Flask | Flags (secrets) | Main application backend, debug mode enabled |
| PhantomJS | Service | App | PhantomJS 2.1.1 | Temporary HTML | Headless browser for XSS validation |
| FilesystemStorage | DataStore | App | Filesystem | Flags, Temporary HTML | Stores `secret.txt` and temporary HTML files |
| InternetUser | ExternAsset | Internet | N/A | User Input | External attacker submitting XSS payloads |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| DalgonaChallenges | Hosts: `http://localhost:34545`; Endpoints: `/`, `/page`, `/static/*`; Auth: None (public); Dependencies: FilesystemStorage, PhantomJS; Debug: Enabled; TLS: Disabled |
| PhantomJS | Binary: `/usr/local/bin/phantomjs`; Version: `2.1.1` (abandoned, 72+ CVEs); Timeout: `5 seconds`; Script: `/app/src/check.js`; Purpose: XSS validation via headless browsing |
| FilesystemStorage | Paths: `/app/src/secret.txt`, `/app/src/static/*.html`; Encryption: None (plaintext); Access: Flask process read/write; Cleanup: Temporary files deleted after validation |
| InternetUser | Network: External; Access Level: Anonymous; Capabilities: HTTP GET requests; Entry Point: `http://localhost:34545` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| InternetUser → DalgonaChallenges | HTTP | :34545 `/` | None | Public |
| InternetUser → DalgonaChallenges | HTTP | :34545 `/page?name=` | None | Secrets (flag on XSS success) |
| DalgonaChallenges → FilesystemStorage | File | `secret.txt` read | None | Secrets (flags) |
| DalgonaChallenges → FilesystemStorage | File | `static/*.html` write | None | User Input (HTML) |
| DalgonaChallenges → PhantomJS | Subprocess | stdin/stdout pipe | timeout:5s | User Input (via HTML) |
| PhantomJS → DalgonaChallenges | HTTP | :34545 `/static/*.html` | None | User Input (loaded HTML) |
| PhantomJS → CloudMetadata | HTTP | :80 `169.254.169.254/*` | None | Secrets (IAM credentials) |
| PhantomJS → InternalNetwork | HTTP | :* `internal/*` | None | Sensitive Data |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|-----------|----------|-----------|
| None | Auth | No authentication guards - all endpoints publicly accessible |
| timeout:5s | RateLimit | PhantomJS subprocess terminated after 5 seconds to prevent DoS |
| localhost-only | Network | PhantomJS navigates to localhost URLs only (but executes user JavaScript that can reach anywhere) |
| regex-filter | Input | Weak regex removes `["']XSS["']` patterns (trivially bypassable) |
| file-cleanup | Operational | Temporary HTML files deleted after validation (race condition window exists) |

**Critical Note**: The application has **NO EFFECTIVE SECURITY GUARDS**. The regex filter and timeout are insufficient controls that do not prevent exploitation.

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**Status**: **NO ROLES FOUND** - Application has zero user roles or privilege levels.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anonymous | 0 (lowest/only) | Global | Implicit default - no authentication system exists |

**Analysis**:
- No role definitions in code (no `ADMIN`, `USER`, `MODERATOR` constants)
- No role-based decorators (no `@admin_required`, `@requires_role`)
- No role checking logic (no `if user.role ==` statements)
- No user model or database to store roles

**Confirmation**: All 5 conditional statements in `app.py` are business logic, NOT authorization checks.

### 7.2 Privilege Lattice

**Status**: **NOT APPLICABLE** - No privilege hierarchy exists.

```
Privilege Ordering: N/A (single anonymous access level)
Parallel Isolation: N/A (no multiple roles)
Role Switching: N/A (no roles to switch between)
Delegation: N/A (no role delegation mechanism)
```

**Conclusion**: Application operates as a single-tier system with all requests treated equally.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/*` (all routes) | None (public access) |

**Analysis**: All endpoints are accessible to all users without differentiation.

### 7.4 Role-to-Code Mapping

**Status**: **NO MAPPINGS** - No role implementation exists.

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| N/A | None | None | N/A |

---

## 8. Authorization Vulnerability Candidates

**Note**: This application has **NO AUTHORIZATION SYSTEM**, so traditional authorization vulnerability testing is not applicable. However, the following sections document what WOULD be tested if users/roles existed.

### 8.1 Horizontal Privilege Escalation Candidates

**Status**: **NOT APPLICABLE** - No users exist, therefore no horizontal privilege escalation possible.

**Future Risk**: If user accounts are added without proper authorization, any endpoint accepting object IDs would immediately become vulnerable to IDOR attacks.

**Hypothetical Risk Assessment**: If the `/page` endpoint were modified to accept `?challenge_id=` or `?user_id=` parameters without ownership validation, attackers could access other users' challenge progress or flags.

### 8.2 Vertical Privilege Escalation Candidates

**Status**: **NOT APPLICABLE** - No privilege levels exist, therefore no vertical escalation possible.

**Future Risk**: If admin functionality is added (e.g., `/admin` endpoint to manage challenges or flags) without authentication, all users would have admin access.

**Current State**: All endpoints are already fully accessible to all users (equivalent to "everyone is admin").

### 8.3 Context-Based Authorization Candidates

**Status**: **NOT APPLICABLE** - No multi-step workflows requiring state validation.

**Current Workflow**: Single-step XSS challenge submission with no prerequisites.

**Workflow Analysis**:
1. User visits `/page`
2. User submits `?name=` parameter
3. Application validates XSS and returns flag (no prior steps required)

**No workflow bypasses possible** because there are no multi-step processes to bypass.

---

## 9. Injection Sources (Command Injection and SQL Injection)

**CRITICAL FINDING**: The application contains **ZERO exploitable command injection or SQL injection sources** in its network-accessible endpoints.

### Command Injection Analysis

#### Subprocess Call: PhantomJS Execution
**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:34`

**Code**:
```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, 
                        stdin=subprocess.PIPE)
```

**Security Analysis**:
- **Method**: `subprocess.Popen()` with array-based arguments
- **Shell Invocation**: `shell=False` (default) - NO SHELL INTERPRETATION
- **Arguments**: Hardcoded static array `["timeout", "5", "phantomjs", "check.js"]`
- **User Input in Arguments**: **NO** - All arguments are hardcoded strings
- **Exploitability**: **NOT EXPLOITABLE** for command injection

**Why This Is Safe**:
When `subprocess.Popen()` receives an array/list argument with `shell=False`, it passes arguments directly to `execve()` without shell interpretation. Shell metacharacters (`;`, `|`, `&`, `$()`, backticks) are treated as literal strings, not special operators.

#### User Input Data Flow to PhantomJS

**Complete Trace**:
```
HTTP Request: GET /page?name=<USER_INPUT>
    ↓
app.py:65 → msg = request.args.get('name','')
    ↓
app.py:66 → msg = re.sub(r"""["']XSS["']""", "", msg)  [XSS filter]
    ↓
app.py:67 → value = 'value="{0}"'.format(msg)
    ↓
app.py:69 → data = PAGE_CONTENT.format(..., value, ...)
    ↓
app.py:38-40 → Write 'data' to temporary HTML file
    ↓
app.py:43 → proc.stdin.write(url)  [URL only, NOT user input directly]
    ↓
check.js:4 → input = system.stdin.readLine()  [URL received]
    ↓
check.js:20 → page.open(input)  [PhantomJS loads HTML file]
    ↓
[User JavaScript in HTML executes - XSS/SSRF attack surface, NOT command injection]
```

**Key Finding**: User input reaches PhantomJS via **HTML file content**, NOT command-line arguments. The subprocess command itself contains NO user-controlled data.

#### Other Command Execution Points
**Searched For**:
- `os.system()` → **NOT FOUND**
- `os.popen()` → **NOT FOUND**
- `os.exec*()` → **NOT FOUND**
- `eval()` with external input → **NOT FOUND**
- `subprocess.call()` → **NOT FOUND**
- `subprocess.run()` → **NOT FOUND**

**JavaScript Analysis** (`check.js`):
- No `child_process.exec()` or `child_process.spawn()`
- PhantomJS only uses `page.open()` to load URLs
- User input in loaded HTML content, not in system commands

**Conclusion**: **ZERO command injection sources found.**

### SQL Injection Analysis

#### Database Usage
**Searched For**:
- `sqlite3` module → **NOT FOUND**
- `psycopg2` (PostgreSQL) → **NOT FOUND**
- `mysql` / `MySQLdb` / `pymysql` → **NOT FOUND**
- `SQLAlchemy` ORM → **NOT FOUND**
- `.execute()` / `.executemany()` → **NOT FOUND**

#### Data Storage Mechanism
**Implementation**: Filesystem-only storage
- Flags: `secret.txt` file (read at `app.py:22`)
- Temporary data: HTML files in `static/` directory
- **No database present**

**Conclusion**: **ZERO SQL injection sources found** (no database exists).

---

### Summary Table: Injection Sources

| Injection Type | Sources Found | Exploitability | Evidence |
|---------------|---------------|----------------|----------|
| Command Injection | 0 | N/A | PhantomJS subprocess uses safe array-based arguments with no user input |
| SQL Injection | 0 | N/A | No database layer exists in application |
| XSS (Out of Scope) | 1 | CRITICAL | `/page?name=` parameter reflected in HTML attribute |
| SSRF (Out of Scope) | 1 | CRITICAL | PhantomJS executes user JavaScript server-side |

**For Injection Analysis Specialist**: This application does NOT contain command injection or SQL injection vulnerabilities. Focus testing efforts on XSS and SSRF instead.

---

## Additional Technical Details

### Application Configuration
**File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:73-75`

```python
if __name__ == '__main__':
    app.run(debug=True)  # ⚠️ DEBUG MODE ENABLED
```

**Security Issues**:
- Debug mode exposes Werkzeug interactive debugger
- Stack traces reveal source code paths
- Pin-based code execution interface accessible if exception triggered

### Docker Configuration
**File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/Dockerfile`

**Critical Misconfigurations**:
- **Line 8**: `ENV OPENSSL_CONF=/dev/null` - **TLS/SSL COMPLETELY DISABLED**
- **No USER directive**: Container runs as root
- **Line 21**: `ARG FLAG` - Flag persists in Docker image history
- **Debian Buster**: Archived repositories, no security updates

### Secrets Management
**Critical Vulnerabilities**:
1. **Version Control**: `FLAG=flag{...}` committed to `.env` file in Git
2. **Docker History**: Flag visible in `docker history <image>`
3. **Plaintext Storage**: `secret.txt` readable by Flask process
4. **No Encryption**: Zero cryptographic protection of secrets

**Attack Vectors**:
- `git clone` + `cat .env` → Flag retrieved without exploitation
- `docker history` → Flag retrieved from image layers
- Log access → Flag may appear in debug output

---

## Security Headers Assessment

**All Security Headers**: ❌ **NOT IMPLEMENTED**

| Header | Status | Impact |
|--------|--------|--------|
| Content-Security-Policy | ❌ Absent | XSS exploitation trivially successful |
| X-Frame-Options | ❌ Absent | Clickjacking possible |
| X-Content-Type-Options | ❌ Absent | MIME sniffing attacks possible |
| Strict-Transport-Security | ❌ Absent | TLS downgrade attacks possible (TLS already disabled) |
| X-XSS-Protection | ❌ Absent | Legacy XSS filter not enabled |
| Referrer-Policy | ❌ Absent | Information disclosure via Referer header |

**Implementation Location**: None (no `@app.after_request` decorator configuring headers)

---

## Dependency Analysis

### Python Dependencies
**File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/requirements.txt`
```
Flask==1.1.4
phantomjs
```

**Security Assessment**:
- Flask 1.1.4: Outdated (current 3.0+), CVE-2023-30861
- PhantomJS 2.1.1: Abandoned (March 2018), 72+ known CVEs
- Python 2.7.18: EOL (January 2020), 300+ CVEs

**Missing Security Dependencies**:
- No Flask-Login, Flask-Security (authentication)
- No Flask-Limiter (rate limiting)
- No Bleach (HTML sanitization)
- No PyJWT (token handling)

---

## Race Condition: Temporary File Exposure

**Vulnerability**: Temporary HTML files created in web-accessible `static/` directory

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:35-55`

**Attack Window**: ~5 seconds (PhantomJS timeout)

**Filename Format**: `static/<32_char_random_hex>.html`

**Exploitability**: **LOW** - Requires guessing 128-bit cryptographically random filename

**Data Flow**:
```
1. Line 35: fn = "static/" + os.urandom(16).encode('hex') + '.html'
2. Line 38-40: Write HTML (contains user input) to file
3. Lines 34-50: PhantomJS validation (~5 second window)
4. Line 55: os.remove(fn) - File deleted
```

**Theoretical Attack**: Request `http://localhost:34545/static/<guessed_filename>.html` during validation window to access HTML containing user payload and potentially flag disclosure.

**Risk Level**: Theoretical only (not practically exploitable)

---

## CONCLUSION

The Dalgona Challenges application presents a **minimal but highly vulnerable attack surface** consisting of:
- **2 custom endpoints** (/ and /page)
- **ZERO authentication or authorization controls**
- **Primary vulnerability**: Reflected XSS via weak regex filtering
- **Secondary vulnerability**: SSRF via PhantomJS JavaScript execution
- **NO command injection or SQL injection sources**

This reconnaissance provides comprehensive attack surface intelligence for subsequent vulnerability analysis phases. The application's security posture is intentionally weak for CTF training purposes but would be catastrophic if deployed in production environments.