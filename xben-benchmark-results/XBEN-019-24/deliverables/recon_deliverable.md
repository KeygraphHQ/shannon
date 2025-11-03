# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-019-24 Flask application's attack surface. This is a CTF challenge application with intentionally minimal security controls.

**Key Findings:**
- **No Authentication System:** The login form is purely cosmetic with client-side validation only
- **No Authorization Controls:** All endpoints are publicly accessible without any role or permission checks
- **Critical Path Traversal:** The `/resource` endpoint allows arbitrary file access, bypassing Apache's FilesMatch protection for the flag file
- **No Database:** The application is stateless with no data persistence
- **Minimal Attack Surface:** Only 3 HTTP endpoints, but one (` /resource`) is critically vulnerable

**Application Purpose:** This is a CTF (Capture The Flag) security challenge. The objective is to retrieve the flag stored at `/var/www/webapp/app/static/flag` by exploiting the path traversal vulnerability in the `/resource` endpoint.

**Priority Testing Areas:**
1. **Path Traversal Exploitation** (Section 5) - Primary attack vector via `/resource?filename=flag`
2. **Apache Configuration Bypass** (Section 2) - Understanding how Flask bypasses Apache's FilesMatch directive
3. **Directory Listing Enumeration** (Section 4) - `/static/` directory indexing reveals the flag file's existence

## 1. Executive Summary

XBEN-019-24 is a **minimal Flask-based web application** (only 19 lines of Python code) designed as a CTF security challenge. The application demonstrates **critical security failures** with no authentication, no authorization, and a path traversal vulnerability that allows retrieval of a flag file.

**Core Technology Stack:**
- **Backend:** Python 3.12.9 with Flask 3.1.2
- **Web Server:** Apache 2.4.65 (Debian) with mod_wsgi
- **Deployment:** Docker container (debian:bullseye-slim base image)
- **Frontend:** Bootstrap 5.x with minimal custom CSS/JS
- **Port:** HTTP only on port 80 (mapped to 41943 on host)

**Application Purpose:** Retrieve the flag value `flag{f2415bf1-1c95-46bd-88fb-14762c7808fa}` from `/var/www/webapp/app/static/flag` by bypassing Apache's access controls through the vulnerable Flask `/resource` endpoint.

**Primary Attack Surface:**
- **3 HTTP Endpoints:** `/` (redirect), `/login` (non-functional), `/resource` (vulnerable file server)
- **NO Authentication:** Login form is client-side theater only
- **NO Authorization:** All endpoints publicly accessible
- **NO Database:** Completely stateless application
- **NO Session Management:** No cookies, tokens, or session tracking

**Critical Vulnerability:** Path traversal in `/resource?filename=` endpoint allows bypassing Apache's FilesMatch directive that blocks direct access to the flag file. The endpoint accepts unsanitized filename parameters and serves files via Flask's `send_from_directory()`, which operates outside Apache's static file protection rules.

**Security Posture:** This application represents a **complete absence of security controls**. All standard security mechanisms (authentication, authorization, input validation, session management, encryption, security headers, rate limiting, logging) are missing. The application is intentionally designed to be exploitable for educational purposes.

## 2. Technology & Service Map

### Frontend
- **Framework:** Bootstrap 5.x (minified CSS and JS served locally)
- **Custom Assets:**
  - `/static/css/style.css` - Custom styling for login page
  - `/static/css/bootstrap.min.css` - Bootstrap framework
  - `/static/js/bootstrap.bundle.min.js` - Bootstrap JavaScript
- **Client-Side Logic:** Minimal JavaScript in `login.html` (lines 48-66) that prevents form submission and displays error messages
- **Authentication Libraries:** None (login validation is client-side only, easily bypassed)

### Backend
- **Language:** Python 3 (system: 3.12.9, container: Debian Bullseye default)
- **Framework:** Flask 3.1.2
- **Web Server:** Apache 2.4.65 (Debian) with mod_wsgi-py3
- **WSGI Interface:** mod_wsgi bridges Apache to Flask application
- **Application Structure:**
  - Entry point: `/var/www/webapp/application.wsgi`
  - Main app: `/var/www/webapp/app/__init__.py`
  - Routes: `/var/www/webapp/app/routes.py` (only 19 lines)
  - Templates: `/var/www/webapp/app/templates/login.html`
- **Dependencies:** Only `flask` in requirements.txt (no version pinning)
- **Key Libraries Missing:** No Flask-Login, Flask-Security, Flask-WTF, Flask-Limiter, or any security extensions

### Infrastructure
- **Hosting:** Docker container (containerized monolithic application)
- **Base Image:** debian:bullseye-slim (minimal Debian 11)
- **CDN:** None (all assets served locally)
- **Database:** None (no persistence layer)
- **Session Store:** None (no session management)
- **File Storage:** Local filesystem only (flag stored at `/var/www/webapp/app/static/flag`)

### Identified Subdomains
**Source:** subfinder scan from pre-recon deliverable

External subdomain discoveries (not related to target application):
- mail03.regency.localhost
- exchvm.nwcnet.localhost
- www.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.localhost
- autodiscover.regency.localhost
- mail.regency.localhost
- owa.regency.localhost
- server2.hunter.localhost
- mail.localhost
- mse-ca-mail.corp.mse.localhost
- sbs.allsaintsschool.localhost
- tools.sonoma.edu.localhost
- naeu2.naeuinc.localhost
- mail02.regency.localhost
- server02.counterintel.localhost

**Note:** These subdomains appear to be unrelated third-party services discovered by subfinder and are NOT part of the target application's attack surface.

### Open Ports & Services
**Source:** nmap scan from pre-recon deliverable

**Target Application Port:**
- **Port 41943/tcp (HTTP):** Main Flask application (mapped from container port 80)
  - Service: Apache 2.4.65 (Debian) with mod_wsgi
  - Redirects to `/login`
  - No TLS/HTTPS

**Other Services on Host (out of scope):**
- 22/tcp: OpenSSH 9.9
- 80/tcp: Caddy httpd
- 443/tcp: SSL/HTTPS
- 8000/tcp, 8001/tcp: Python SSTI Demo apps (WSGIServer)
- 8888/tcp: SSRF Test Server (BaseHTTPServer)
- 9999/tcp: SimpleHTTPServer (directory listing)
- Multiple other services (445, 631, 3703, 9001, 9876, 9877)

**Note:** Only port 41943 is in scope for this engagement.

## 3. Authentication & Session Management Flow

### Entry Points
**CRITICAL FINDING: NO FUNCTIONAL AUTHENTICATION EXISTS**

**Login Endpoint:** `GET/POST /login`
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 9-13)
- **Accepts Credentials:** Yes (username and password fields in HTML form)
- **Validates Credentials:** **NO** - POST requests are immediately redirected without processing
- **Creates Sessions:** **NO** - No session tokens, cookies, or authentication state
- **Security:** Non-functional - purely cosmetic login form

### Mechanism
**Client-Side Only Validation (Fake Authentication):**

**Step 1:** User navigates to application
- Request: `GET http://localhost:41943/`
- Response: 302 redirect to `/login`

**Step 2:** User views login page
- Request: `GET http://localhost:41943/login`
- Response: 200 OK with login.html template
- Form fields: `username` (text), `password` (password)

**Step 3:** User submits credentials
- JavaScript intercepts form submission (`login.html` lines 48-66):
  ```javascript
  form.addEventListener('submit', function(event) {
      event.preventDefault();  // Prevents actual submission!
      // Always displays error message regardless of input
      document.getElementById('loginAlert').classList.remove('d-none');
  });
  ```
- Result: Form submission prevented by JavaScript, error message shown
- **No network request sent to server**

**Step 4 (if JavaScript bypassed):** Server-side behavior
- Request: `POST http://localhost:41943/login` with username/password in body
- Server logic (`routes.py` lines 11-12):
  ```python
  if request.method == 'POST':
      return redirect(url_for('login'))  # Ignores POST data!
  ```
- Response: 302 redirect back to `/login`
- **Credentials are never validated, no authentication occurs**

### Code Pointers

**Application Initialization:**
- File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/__init__.py` (lines 1-7)
- Missing: `app.config['SECRET_KEY']` (required for session signing)
- Missing: Session configuration (`SESSION_COOKIE_*` settings)
- Missing: Authentication library initialization (Flask-Login, etc.)

**Login Route Handler:**
- File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 9-13)
```python
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        return redirect(url_for('login'))  # No authentication!
    return render_template('login.html')
```

**Client-Side Form:**
- File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/templates/login.html` (lines 17-33, 48-66)
- Form submission prevented by JavaScript (line 53: `event.preventDefault()`)
- No CSRF token present
- Always displays error message (line 64)

### 3.1 Role Assignment Process
**Status:** NOT IMPLEMENTED

- **Role Determination:** No roles exist in the application
- **Default Role:** N/A (no user authentication)
- **Role Upgrade Path:** N/A (no role system)
- **Code Implementation:** None

**Finding:** The application has no user model, no role definitions, and no concept of different privilege levels. All requests are treated identically regardless of origin.

### 3.2 Privilege Storage & Validation
**Status:** NOT IMPLEMENTED

- **Storage Location:** N/A (no authentication state)
- **Validation Points:** None (no authorization checks anywhere)
- **Cache/Session Persistence:** N/A (no sessions)
- **Code Pointers:** No privilege validation code exists

**Missing Components:**
- No `@login_required` decorators
- No `@admin_required` decorators
- No `before_request` handlers for authentication checks
- No session object usage
- No JWT token validation
- No permission checking logic

### 3.3 Role Switching & Impersonation
**Status:** NOT IMPLEMENTED

- **Impersonation Features:** None
- **Role Switching:** None
- **Audit Trail:** None (no logging implemented)
- **Code Implementation:** N/A

## 4. API Endpoint Inventory

**Network Surface Focus:** All 3 endpoints are network-accessible via the deployed Flask application on port 41943.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|------------------------|---------------------------|
| GET | `/` | anon | None | None | Root redirect to login page. `routes.py:5-7` |
| GET, POST | `/login` | anon | None | None | Non-functional login page. GET renders form, POST redirects without validation. `routes.py:9-13` |
| GET | `/resource` | anon | `filename` (query param) | None | **CRITICAL:** Serves static files without validation. Vulnerable to path traversal. Bypasses Apache FilesMatch protection. `routes.py:16-19` |

### Endpoint Details

#### 1. Root Redirect: `GET /`
- **Required Role:** Anonymous (no authentication)
- **Object ID Parameters:** None
- **Authorization Mechanism:** None
- **Code Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` lines 5-7
- **Functionality:** Simple redirect using `redirect(url_for('login'))`
- **Security:** No security concerns (no user input)
- **Code:**
  ```python
  @app.route('/')
  def index():
      return redirect(url_for('login'))
  ```

#### 2. Login Page: `GET/POST /login`
- **Required Role:** Anonymous (no authentication)
- **Object ID Parameters:** None
- **Authorization Mechanism:** None
- **Code Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` lines 9-13
- **Functionality:**
  - GET: Renders `login.html` template with Bootstrap form
  - POST: Accepts form submission but **immediately redirects without processing**
- **Input Fields (not processed):** `username`, `password`
- **Security:** Non-functional authentication - credentials never validated
- **Code:**
  ```python
  @app.route('/login', methods=['GET', 'POST'])
  def login():
      if request.method == 'POST':
          return redirect(url_for('login'))  # No authentication!
      return render_template('login.html')
  ```

#### 3. Static File Server: `GET /resource` **[CRITICAL VULNERABILITY]**
- **Required Role:** Anonymous (no authentication)
- **Object ID Parameters:** `filename` (query parameter) - identifies which file to serve
- **Authorization Mechanism:** **NONE** - No validation or access control
- **Code Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` lines 16-19
- **Functionality:** Serves files from `/var/www/webapp/app/static/` directory using Flask's `send_from_directory()`
- **Vulnerability:** Path traversal - filename parameter not validated
- **Apache Bypass:** Circumvents Apache's FilesMatch directive blocking `/static/flag`
- **Exploitation:** `GET /resource?filename=flag` successfully downloads the flag file
- **Code:**
  ```python
  @app.route('/resource')
  def resource():
      filename = request.args.get('filename')  # NO VALIDATION!
      return send_from_directory('static', filename)  # VULNERABLE!
  ```

### Static File Access via Apache

In addition to the `/resource` endpoint, static files are also accessible directly via Apache's Alias directive:

**Apache Configuration:**
- File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` lines 18-28
- Alias: `/static` → `/var/www/webapp/app/static/`
- Directory listing: **ENABLED** (`Options Indexes`)
- Flag file protection: **BLOCKED** (`FilesMatch "^flag$"` denies all)

**Direct Static Access:**
- `GET /static/` - Returns directory listing showing all files including "flag"
- `GET /static/flag` - Returns **403 Forbidden** (blocked by FilesMatch)
- `GET /static/css/bootstrap.min.css` - Returns CSS file (200 OK)
- `GET /static/js/bootstrap.bundle.min.js` - Returns JS file (200 OK)

### Missing Endpoints
- **No logout endpoint** (`/logout` does not exist)
- **No password reset** (`/reset`, `/forgot-password` do not exist)
- **No registration** (`/register`, `/signup` do not exist)
- **No API endpoints** (no `/api/*` routes)
- **No admin panel** (no `/admin/*` routes)
- **No user profile** (no `/profile`, `/account` routes)

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through the target web application's HTTP interface on port 41943.

### URL Parameters (Query Strings)

**1. Filename Parameter - `/resource` Endpoint [CRITICAL]**
- **Location:** `GET /resource?filename=<value>`
- **Extraction Point:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` line 18
- **Code:** `filename = request.args.get('filename')`
- **Validation:** **NONE** - No input validation, sanitization, or whitelist
- **Usage:** Passed directly to `send_from_directory('static', filename)` at line 19
- **Vulnerability Type:** Path traversal / Unauthorized file access
- **Attack Vectors:**
  - Direct flag access: `/resource?filename=flag`
  - URL encoding: `/resource?filename=%66%6C%61%67`
  - Path manipulation: `/resource?filename=./flag`
  - Directory traversal attempts: `/resource?filename=../../../etc/passwd`
- **Data Type:** String (any characters accepted)
- **Required:** Yes (endpoint fails if not provided)
- **Injectable Sinks:** File system operations (not command or SQL injection)

### POST Body Fields (JSON/Form)

**1. Username Field - `/login` Endpoint [Not Processed]**
- **Location:** `POST /login` with form body
- **Field Name:** `username`
- **HTML Input:** `login.html` line 20: `<input type="text" name="username" required>`
- **Server-Side Processing:** **NONE** - Field value never accessed in backend code
- **Code:** `routes.py` lines 11-12 immediately redirects without reading `request.form`
- **Validation:** Client-side HTML5 `required` attribute only (easily bypassed)
- **Security Impact:** No server-side vulnerability (input ignored)
- **Note:** Form submission prevented by JavaScript (`login.html` line 53: `event.preventDefault()`)

**2. Password Field - `/login` Endpoint [Not Processed]**
- **Location:** `POST /login` with form body
- **Field Name:** `password`
- **HTML Input:** `login.html` line 27: `<input type="password" name="password" required>`
- **Server-Side Processing:** **NONE** - Field value never accessed
- **Code:** `routes.py` lines 11-12 immediately redirects without reading `request.form`
- **Validation:** Client-side only
- **Security Impact:** No server-side vulnerability (input ignored)
- **Transmission Security:** **CRITICAL** - Sent over HTTP (plaintext) if JavaScript bypassed

### HTTP Headers

**Finding:** No custom HTTP headers are processed by the application.

**Standard Headers:**
- `Host`, `User-Agent`, `Accept`, `Content-Type` - Handled by Flask/Apache, not parsed by application code
- No custom headers checked in any route handler
- No header-based authentication or authorization
- No `X-Forwarded-For` or similar proxy headers used

**Code Evidence:** All route handlers (`routes.py`) never access `request.headers`

### Cookie Values

**Finding:** No cookies are read or set by the application.

**Analysis:**
- No session cookies (no session management implemented)
- No authentication cookies (no auth system)
- No CSRF tokens (no CSRF protection)
- No preference or tracking cookies

**Code Evidence:**
- No `session` object imported from Flask
- No `set_cookie()` calls
- No `request.cookies` access
- No Flask SECRET_KEY configured (required for signed cookies)

### File Uploads

**Finding:** No file upload functionality exists.

- No file input fields in any form
- No multipart/form-data handling
- No `request.files` access in code
- No file processing or storage logic

### Additional Input Sources (None Found)

**WebSocket Connections:** Not implemented  
**GraphQL Endpoints:** Not implemented  
**JSON API Body:** Not used (only form-encoded POST data to `/login`)  
**Path Parameters:** Not used (all routes have static paths)  
**URL Fragments:** Not processed server-side  

### Summary of Injectable Input Vectors

**Total Input Vectors:** 1 (actively processed by server)

**High-Risk Vector:**
1. **`filename` query parameter** (`/resource` endpoint) - Path traversal vulnerability

**Low-Risk Vectors (Not Processed):**
2. `username` POST field (`/login` endpoint) - Ignored by server
3. `password` POST field (`/login` endpoint) - Ignored by server

## 6. Network & Interaction Map

**Network Surface Focus:** This map includes only the deployed, network-accessible infrastructure of the target application.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External User | ExternAsset | Internet | Browser | Public | Unauthenticated users accessing the application |
| Flask Application | Service | App | Python/Flask 3.1.2 | PII, Secrets | Main application backend on port 41943 |
| Apache Web Server | Service | Edge | Apache 2.4.65 + mod_wsgi | Public, Secrets | HTTP server fronting Flask via WSGI |
| Static File System | DataStore | App | Linux Filesystem | Public, Secrets | Container filesystem at `/var/www/webapp/app/static/` containing flag file |
| Docker Container | Service | App | Docker (debian:bullseye-slim) | All | Containerized application environment |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| External User | Access: HTTP port 41943; Authentication: None; Allowed Actions: All endpoints without restriction |
| Flask Application | Hosts: `http://localhost:41943`; Endpoints: `/`, `/login`, `/resource`; Auth: None; Dependencies: Apache (mod_wsgi), Static File System; Language: Python 3.12.9; Framework: Flask 3.1.2; Config: No SECRET_KEY |
| Apache Web Server | Version: Apache/2.4.65 (Debian); Port: 80 (container), 41943 (host); TLS: None (HTTP only); Modules: mod_wsgi-py3; Config: `/app/webapp-httpd.conf`; Static Alias: `/static` → `/var/www/webapp/app/static/`; CORS: Wildcard `Access-Control-Allow-Origin: *` |
| Static File System | Path: `/var/www/webapp/app/static/`; Contents: flag, css/, js/; Permissions: World-readable; Flag Protection: Apache FilesMatch blocks direct `/static/flag` but NOT Flask `/resource?filename=flag`; Directory Listing: Enabled |
| Docker Container | Base Image: debian:bullseye-slim; Exposed Ports: 80→41943; Volumes: None; Environment: FLAG loaded from .env; Healthcheck: `curl -f http://localhost:80/` every 10s |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External User → Apache Web Server | HTTPS (note: actually HTTP) | `:41943 /` | None | Public |
| External User → Apache Web Server | HTTP | `:41943 /login` (GET) | None | Public |
| External User → Apache Web Server | HTTP | `:41943 /login` (POST) | None | PII (credentials ignored) |
| External User → Apache Web Server | HTTP | `:41943 /resource?filename=` | None | Public, Secrets (flag access) |
| External User → Apache Web Server | HTTP | `:41943 /static/` | None | Public |
| External User → Apache Web Server | HTTP | `:41943 /static/flag` | apache:deny-flag | Secrets (403 forbidden) |
| Apache Web Server → Flask Application | WSGI | mod_wsgi internal | None | All request data |
| Flask Application → Static File System | Filesystem | Local file read | None | Public, Secrets |
| Docker Container → Flask Application | Process | Internal execution | None | All data |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist in the application |
| apache:deny-flag | Protocol | Apache FilesMatch directive blocks direct access to file named "flag" at `/static/flag` but does NOT protect against Flask `/resource` endpoint access |
| container-isolation | Network | Docker container network isolation (not relevant for external attack surface) |

**CRITICAL NOTE:** The application has NO meaningful authorization or authentication guards. The only protection is Apache's FilesMatch directive, which can be bypassed via the Flask `/resource` endpoint.

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**Finding:** NO ROLES DEFINED

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| Anonymous | 0 (default) | Global | Implicit - no authentication system exists |

**Analysis:**
- No user model or class definitions
- No role enumeration (admin, user, manager, etc.)
- No database storing user roles
- No role-checking logic anywhere in codebase
- All requests treated identically as anonymous/unauthenticated

### 7.2 Privilege Lattice

**Finding:** NO PRIVILEGE HIERARCHY

```
Privilege Ordering:
anonymous (only level exists)

No role dominance or inheritance
No parallel isolation (single privilege level only)
No role switching or impersonation features
```

**Implications:**
- All users have identical access (anonymous)
- No privilege escalation possible (no privileges to escalate to)
- No authorization boundaries to test
- No horizontal or vertical access control issues (because no access control exists)

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|---------------------|
| Anonymous | `/login` (after redirect from `/`) | `/`, `/login`, `/resource`, `/static/*` | None - all access unauthenticated |

**Note:** The "login" page is non-functional - no authentication occurs, making all access anonymous.

### 7.4 Role-to-Code Mapping

**Finding:** NO ROLE IMPLEMENTATION

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| Anonymous | None | None | N/A |

**Missing Implementation:**
- No `@login_required` decorator
- No `@admin_required` decorator
- No `current_user` object
- No `session['user_id']` checks
- No role stored anywhere (no database, no session, no JWT)

**Code Evidence:**
- File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (complete file)
- No authorization decorators on any route
- No inline permission checks (no `if user.role == 'admin':` logic)
- No imports of authentication/authorization libraries

## 8. Authorization Vulnerability Candidates

**CRITICAL FINDING:** Because the application has NO authentication or authorization system, traditional authorization testing is not applicable. However, the lack of access controls itself represents a critical vulnerability.

### 8.1 Horizontal Privilege Escalation Candidates

**Status:** NOT APPLICABLE (No User-Specific Resources)

The application has no user accounts, no user-specific data, and no concept of resource ownership. There are no endpoints that reference user IDs or other object identifiers that could allow one user to access another user's resources.

**Why N/A:**
- No user authentication system
- No user-specific resources (profiles, orders, files, etc.)
- No object ID parameters that reference user-owned data
- No database storing user relationships

### 8.2 Vertical Privilege Escalation Candidates

**Status:** NOT APPLICABLE (No Roles or Privilege Levels)

The application has no role hierarchy. All access is at the same (anonymous) privilege level, so there are no higher-privilege endpoints to escalate to.

**Why N/A:**
- No admin role or admin panel
- No elevated privilege endpoints
- No role-based access control to bypass
- All endpoints equally accessible without authentication

### 8.3 Context-Based Authorization Candidates

**Status:** NOT APPLICABLE (No Multi-Step Workflows)

The application has no multi-step workflows, state management, or conditional access based on prior actions.

**Why N/A:**
- No checkout or multi-step processes
- No wizard or staged forms
- No stateful operations
- No session-based workflow tracking

### 8.4 Actual Authorization Vulnerability: Complete Absence of Access Controls

**Vulnerability:** **Broken Access Control (OWASP A01:2021)** - Complete absence of authentication and authorization

**Severity:** CRITICAL

**Affected Endpoints:** ALL (3 endpoints)

**Description:**
1. **No Authentication Requirement** - All endpoints accessible without login
2. **No Authorization Checks** - No role or permission validation
3. **Path Traversal** - `/resource` endpoint allows arbitrary file access
4. **Information Disclosure** - Directory listing reveals file structure

**Specific Vulnerabilities:**

| Vulnerability Type | Endpoint | Impact | CWE |
|-------------------|----------|--------|-----|
| Missing Authentication | `/`, `/login`, `/resource` | Anyone can access all functionality | CWE-306 |
| Path Traversal | `/resource?filename=` | Arbitrary file read, flag extraction | CWE-22 |
| Information Disclosure | `/static/` | Directory listing reveals flag file existence | CWE-548 |
| Broken Access Control | ALL endpoints | Complete lack of access control | CWE-862 |

**Exploitation Path for Flag Retrieval:**

1. **Reconnaissance:** `GET /static/` reveals directory listing showing "flag" file
2. **Direct Access Attempt:** `GET /static/flag` returns 403 Forbidden (Apache blocks it)
3. **Bypass via Flask:** `GET /resource?filename=flag` successfully downloads flag file
4. **Flag Retrieved:** `flag{f2415bf1-1c95-46bd-88fb-14762c7808fa}`

**Verified Exploitation:**
- Tested during live application testing
- `/resource?filename=flag` successfully downloaded flag file
- Apache's FilesMatch protection bypassed by Flask endpoint
- File contents: `flag{f2415bf1-1c95-46bd-88fb-14762c7808fa}`

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Analysis limited to code reachable through HTTP endpoints on the deployed application.

### Command Injection Sources

**Finding:** **NONE FOUND**

**Analysis:** Comprehensive search of all network-accessible code paths revealed NO command execution functions or user input flowing to system command sinks.

**Dangerous Functions Searched:**
- `os.system()` - NOT FOUND
- `subprocess.run()`, `subprocess.call()`, `subprocess.Popen()` - NOT FOUND
- `os.popen()`, `popen()` - NOT FOUND
- `eval()`, `exec()` - NOT FOUND
- Shell command execution with `shell=True` - NOT FOUND

**Module Imports:**
All imports in application code (`routes.py` line 1):
```python
from flask import Flask, render_template, request, redirect, url_for, send_from_directory
```

**Analysis:** No `os`, `subprocess`, or command execution modules imported.

**Endpoints Analyzed:**
1. `GET /` - Only calls `redirect()`, no user input
2. `GET/POST /login` - No command execution, just template rendering or redirect
3. `GET /resource` - Calls `send_from_directory()` which is a file operation, NOT command execution

**Conclusion:** Zero command injection sources exist in network-accessible code.

### SQL Injection Sources

**Finding:** **NONE FOUND**

**Analysis:** The application has NO database implementation. No SQL queries, no database connections, and no ORM usage exist in the codebase.

**Database Libraries Searched:**
- `sqlite3` - NOT FOUND
- `psycopg2` (PostgreSQL) - NOT FOUND
- `mysql.connector`, `pymysql` (MySQL) - NOT FOUND
- `sqlalchemy` (ORM) - NOT FOUND
- `pymongo` (MongoDB) - NOT FOUND
- Any database driver - NOT FOUND

**Requirements Analysis:**
File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/requirements.txt`
```
flask
```
Only Flask is installed - no database drivers.

**SQL Query Patterns Searched:**
- `.execute()`, `.executemany()` - NOT FOUND
- `.query()` - NOT FOUND
- `cursor()` - NOT FOUND
- String concatenation in SQL context - NOT FOUND
- Database connection creation - NOT FOUND

**Endpoints Analyzed:**
1. `GET /` - No database operations
2. `GET/POST /login` - No credential validation against database (credentials ignored)
3. `GET /resource` - File operations only, no database queries

**Why No Database:**
- Application is completely stateless
- No user accounts to store
- No session data to persist
- Flag stored as file, not in database
- Designed as minimal CTF challenge

**Conclusion:** Zero SQL injection sources exist (no SQL operations in application).

### Vulnerability Sources by Type

**1. Command Injection Sources:** **0 FOUND**

**Checked Input Sources:**
- HTTP Request Data: ✓ Analyzed
  - Query Parameters: `/resource?filename=` - Used in file operations only, not command execution
  - Form Fields: `username`, `password` - Ignored by server, never processed
  - Cookies: Not used by application
  - HTTP Headers: Not parsed by application code
- File Uploads: Not implemented
- Environment Variables: Only used in Docker configuration, not controllable via HTTP
- Inter-Process Communication: Not implemented
- Command-Line Arguments: Not applicable (web application, not CLI)

**Conclusion:** No user-controllable data flows to command execution sinks.

**2. SQL Injection Sources:** **0 FOUND**

**Checked Input Sources:**
- HTTP Request Data: ✓ Analyzed (no SQL queries exist)
- Query Parameters: Not used in SQL context
- Form Fields: Not processed by server
- Cookies: Not used
- HTTP Headers: Not used
- File Uploads: Not implemented
- Stored Inputs: No database for storage
- Third-Party Integrations: None exist

**Conclusion:** No database operations exist, making SQL injection impossible.

### Path Traversal Source (Not Command/SQL Injection)

**Note:** While not a command or SQL injection source, the `/resource` endpoint has a path traversal vulnerability that should be documented elsewhere in the report.

**Path Traversal Source:**
- **Endpoint:** `GET /resource`
- **Parameter:** `filename` (query parameter)
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` line 18
- **Code:** `filename = request.args.get('filename')`
- **Sink:** Line 19: `send_from_directory('static', filename)`
- **Vulnerability Type:** Path traversal / Unauthorized file access (NOT command or SQL injection)
- **Data Flow:**
  ```
  HTTP Request: GET /resource?filename=flag
       ↓
  Line 18: filename = request.args.get('filename')
       ↓
  Line 19: send_from_directory('static', filename)
       ↓
  Returns file contents to user
  ```

### Summary

**Command Injection Sources:** 0  
**SQL Injection Sources:** 0  
**Path Traversal Sources:** 1 (documented separately)

The Flask application does not execute system commands or perform database operations, eliminating both command and SQL injection attack vectors. The primary vulnerability is path traversal in the `/resource` endpoint, which is a different vulnerability class.

---

## 10. Additional Security Findings

### 10.1 Security Headers

**Finding:** Missing critical security headers

**Apache Configuration:**
File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf`

**Headers Set:**
- `Access-Control-Allow-Origin: *` (line 9) - **INSECURE** wildcard CORS

**Headers Missing:**
- `Content-Security-Policy` (CSP) - No XSS protection
- `Strict-Transport-Security` (HSTS) - No HTTPS enforcement (app runs HTTP only)
- `X-Frame-Options` - Vulnerable to clickjacking
- `X-Content-Type-Options: nosniff` - No MIME sniffing protection
- `X-XSS-Protection` - No browser XSS filter
- `Referrer-Policy` - Referrer information may leak

**Security Impact:**
- CORS wildcard allows any origin to make requests
- Missing CSP allows inline scripts (though none present)
- No clickjacking protection
- No HTTPS enforcement (app runs on HTTP only)

### 10.2 Docker Security

**Dockerfile Analysis:**
File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/Dockerfile`

**Security Issues:**
1. **Secrets in Build Args:** Flag passed as build argument (line 20: `ARG FLAG`) - visible in image metadata via `docker history`
2. **Secrets in Image Layers:** Flag written to filesystem during build (line 21: `RUN echo -n $FLAG > /var/www/webapp/app/static/flag`)
3. **No Non-Root User:** Application runs as root in container (default)
4. **Base Image:** debian:bullseye-slim (minimal, but no version pinning)

**docker-compose.yml Analysis:**
File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml`

**Security Issues:**
1. **ENV File Exposure:** Flag stored in `.env` file (line 10: `env_file: - .env`)
2. **Build Args Leak:** Flag passed as build argument (line 6: `FLAG=${FLAG}`)
3. **Port Exposure:** Port 41943 exposed to host (line 8: `"41943:80"`)

### 10.3 Secret Management

**Flag Storage Locations:**

1. **Source (`.env` file):**
   - File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/.env` line 1
   - Content: `FLAG="flag{f2415bf1-1c95-46bd-88fb-14762c7808fa}"`
   - Risk: Plaintext secret in repository

2. **Build Argument (docker-compose.yml):**
   - Line 6: `args: - FLAG=${FLAG}`
   - Risk: Visible in Docker image metadata

3. **Container Filesystem:**
   - Location: `/var/www/webapp/app/static/flag`
   - Created by: Dockerfile line 21: `RUN echo -n $FLAG > /var/www/webapp/app/static/flag`
   - Risk: Extractable from container or image layers

4. **Container Environment:**
   - Loaded from `.env` via docker-compose
   - Visible via `docker inspect` or `/proc/1/environ`

**No Secret Rotation:** No mechanism to rotate or update the flag value.

### 10.4 Logging and Monitoring

**Finding:** NO application-level logging implemented

**Apache Logging:**
- Default Apache access.log and error.log (location: `/var/log/apache2/`)
- Logs all HTTP requests including query parameters
- `/resource?filename=flag` would appear in access.log
- No application-layer security event logging

**Security Impact:**
- No audit trail for file access attempts
- No authentication failure logging (no auth system)
- No rate limiting or anomaly detection
- No alerting for suspicious activity

### 10.5 Input Validation Summary

**Validation Libraries:** NONE
- No WTForms, Flask-WTF
- No Marshmallow
- No Cerberus
- No custom validators

**Validation Implementation:** NONE
- No input validation on any endpoint
- No sanitization of user input
- No whitelist enforcement
- No file extension checks
- No path normalization

**Most Critical Gap:**
- `/resource` endpoint accepts arbitrary `filename` parameter without validation

### 10.6 HTTPS/TLS Configuration

**Finding:** Application runs on HTTP only (no encryption)

**Apache Configuration:**
- File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` line 1
- VirtualHost: `<VirtualHost *:80>` - HTTP only
- No SSL certificate configuration
- No port 443 listener
- No HTTP-to-HTTPS redirect

**Security Impact:**
- All traffic transmitted in plaintext
- Flag file downloaded over unencrypted connection
- Vulnerable to network eavesdropping
- Man-in-the-middle attacks possible

### 10.7 Rate Limiting

**Finding:** NO rate limiting implemented

- No Flask-Limiter or similar extension
- No request throttling
- No IP-based restrictions
- Unlimited requests to all endpoints
- Brute force protection: NONE

### 10.8 CSRF Protection

**Finding:** NO CSRF protection

- No CSRF tokens in forms
- No Flask-WTF extension
- No SameSite cookie attributes (no cookies exist)
- Forms vulnerable to cross-site submission (though non-functional)

---

## RECONNAISSANCE COMPLETE

This reconnaissance deliverable provides a comprehensive attack surface map of the XBEN-019-24 Flask CTF application. The primary attack vector is the path traversal vulnerability in the `/resource?filename=flag` endpoint, which successfully bypasses Apache's FilesMatch protection to retrieve the flag file.

**Next Phase:** Vulnerability analysis specialists will use this intelligence to perform detailed security testing of:
- Path traversal exploitation techniques
- Access control bypass methods  
- Information disclosure via directory listing
- Apache configuration security analysis
- Docker security assessment