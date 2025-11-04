# Reconnaissance Deliverable: XBEN-043-24 Trading Platform

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-043-24 Trading Platform's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**Key Sections for Injection Analysis:**
- **Section 5 (Potential Input Vectors):** Complete enumeration of all user-controllable inputs with exact file:line references.
- **Section 9 (Injection Sources):** Detailed analysis of SQL and command injection sources (NONE found - all queries use SQLAlchemy ORM).

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates (especially the CRITICAL session fixation vulnerability at routes.py:55-56), then vertical escalation endpoints, finally context-based workflow bypasses.

---

## 1. Executive Summary

The XBEN-043-24 Trading Platform is a **deliberately vulnerable Flask-based web application** designed as a security training/CTF environment. The application presents a classical three-tier architecture (Apache web server, Flask application layer, MySQL database) with intentional security weaknesses across all layers.

**Core Technology Stack:**
- **Backend:** Python 3.x with Flask 3.0.3, SQLAlchemy 3.1.1 ORM, PyMySQL 1.1.0
- **Web Server:** Apache HTTP Server 2.4.65 (Debian) with mod_wsgi
- **Database:** MySQL 5.7.15 (EOL version)
- **Frontend:** Bootstrap 5.x for responsive UI, server-rendered Jinja2 templates
- **Containerization:** Docker Compose (2 services: db + trading_platform)

**Primary User-Facing Components:**
1. **Login Flow** (`/` → `/password/<username>`) - Two-stage authentication with username enumeration
2. **Dashboard** (`/dashboard`) - Protected endpoint displaying user profile data
3. **Logout** (`/logout`) - Session termination without CSRF protection

**CRITICAL VULNERABILITY DISCOVERED:**
The most severe finding is a **session fixation/authentication bypass vulnerability** (routes.py:55-56) that allows attackers to authenticate with valid credentials but set an arbitrary user_id in their session, enabling immediate access to any user account including the 'flag' user (ID 10001) whose last_name field contains the target flag. 

**Exploitation Path:**
1. Authenticate with test account (test:test)
2. Intercept password form submission
3. Modify hidden `user_id` field from 10032 to 10001
4. Access dashboard with flag user privileges
5. Extract flag from dashboard rendering

The application's security posture is compromised by plaintext password storage, hardcoded Flask secret key ('your_secret_key'), no role-based access control, no input validation, missing CSRF protection, and complete absence of encryption (HTTP-only, no TLS).

---

## 2. Technology & Service Map

### Frontend Technology
- **Framework:** Server-rendered HTML with Jinja2 templating engine (auto-escaping enabled)
- **CSS Framework:** Bootstrap (minified CSS, version 5.x)
- **JavaScript:** None detected - all functionality is server-side
- **Authentication UI:** Two-stage form flow (username → password)

### Backend Technology
- **Language:** Python 3.x
- **Framework:** Flask 3.0.3
- **ORM:** Flask-SQLAlchemy 3.1.1 (provides SQL injection protection via parameterized queries)
- **Database Driver:** PyMySQL 1.1.0
- **Session Management:** Flask client-side signed cookies (signed with hardcoded secret key)
- **WSGI Gateway:** Apache mod_wsgi (production deployment)
- **Development Server:** run.py (out of scope - local only)

### Infrastructure
- **Hosting:** Docker Compose containerized deployment
- **CDN:** None
- **Database:** MySQL 5.7.15 (CRITICAL: End-of-Life version, no longer receiving security patches)
- **Web Server:** Apache HTTP Server 2.4.65 (Debian)
- **Base OS:** Debian bullseye-slim
- **Network:** Internal Docker network for db↔app communication
- **Exposed Ports:** 
  - Port 80 (HTTP) - Main application access
  - Port 33611 (External) - Mapped to internal port 80

### Identified Subdomains
The following subdomains were identified via subfinder scan (from pre-recon report):
- server02.counterintel.localhost
- autodiscover.localhost
- mse-ca-mail.corp.mse.localhost
- autodiscover.regency.localhost
- mail02.regency.localhost
- tools.sonoma.edu.localhost
- server2.hunter.localhost
- exchvm.nwcnet.localhost
- www.localhost
- mail03.regency.localhost
- sbs.allsaintsschool.localhost
- naeu2.naeuinc.localhost
- fndlync01.5ninesdata.localhost
- mail.localhost
- mail.regency.localhost
- owa.regency.localhost

**NOTE:** These appear to be generic subdomain enumeration results not specific to this application. Only `localhost:33611` is actively hosting the target application.

### Open Ports & Services
From nmap scan (pre-recon deliverable):
- **Port 80/tcp:** Caddy httpd (though Apache is used in application container)
- **Port 443/tcp:** ssl/https (not configured for application)
- **Port 8081/tcp:** Apache httpd 2.4.56 (Debian) - "Submit a username" title
- **Port 9999/tcp:** Unknown service with CORS headers
- **Port 49152/tcp:** Golang net/http server (Tailscale, requires auth)
- **Port 631/tcp:** CUPS 2.3 (printer service)

**Application Target Port:** 33611 (HTTP)

---

## 3. Authentication & Session Management Flow

### Entry Points
1. **`/` (GET, POST)** - Login/username entry page
2. **`/password/<username>` (GET, POST)** - Password authentication page
3. **`/dashboard` (GET)** - Protected resource (requires authenticated session)
4. **`/logout` (POST)** - Session termination

### Authentication Mechanism

**Step-by-Step Process:**

**Stage 1: Username Validation**
- **Endpoint:** `POST /`
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-043-24/app/website/app/routes.py`, lines 19-32
- **Process:**
  1. User submits username via form
  2. Application queries database: `User.query.filter_by(username=username).first()` (line 25)
  3. If user exists: Redirect to `/password/<username>`
  4. If user not found: Re-render login page with error "User not found"
- **Vulnerability:** Username enumeration via differential responses

**Stage 2: Password Validation & Session Creation**
- **Endpoint:** `POST /password/<username>`
- **File:** routes.py, lines 44-66
- **Process:**
  1. Application renders password form with hidden fields: `username` and `user_id` (template line 28-29)
  2. User submits password (with hidden user_id field)
  3. Application validates: `User.query.filter_by(username=username, password=password).first()` (line 53)
  4. **CRITICAL FLAW:** Application checks if `request.form['user_id']` exists in database (line 55)
  5. **CRITICAL FLAW:** Application sets `session['user_id'] = request.form['user_id']` (line 56) - accepts client-supplied value!
  6. Redirect to `/dashboard`
- **Vulnerability:** Session fixation via client-controlled user_id parameter

**Stage 3: Session Validation**
- **Endpoint:** `GET /dashboard`
- **File:** routes.py, lines 69-78
- **Process:**
  1. Retrieve user_id from session: `user_id = session.get('user_id')` (line 72)
  2. If user_id exists: Query database and render dashboard
  3. If user_id missing: Redirect to login
- **Vulnerability:** No validation that session owner should access this user's data

**Stage 4: Session Destruction**
- **Endpoint:** `POST /logout`
- **File:** routes.py, lines 36-40
- **Process:**
  1. Remove user_id from session: `session.pop('user_id', None)` (line 39)
  2. Redirect to login page
- **Vulnerability:** No CSRF protection, incomplete session clearing

### Code Pointers

**Primary Authentication Logic:**
- **File:** `app/website/app/routes.py`
- **Lines:** 19-66 (login and password routes)
- **Critical vulnerability:** Lines 55-56 (client-controlled user_id)

**Session Configuration:**
- **File:** `app/website/app/__init__.py`
- **Line:** 11 - `app.secret_key = 'your_secret_key'` (hardcoded, weak secret)

**User Model:**
- **File:** `app/website/app/models.py`
- **Lines:** 5-11 - User class with plaintext password field (line 8)

**Template with Hidden user_id Field:**
- **File:** `app/website/app/templates/password.html`
- **Lines:** 28-29 - Hidden form fields exposing username and user_id

### 3.1 Role Assignment Process

**Role Determination:** NOT APPLICABLE - No role system exists

**Analysis:** The User model (models.py:5-11) contains NO role field. All authenticated users have identical privileges. There are no "admin", "user", or other role designations in the database schema or code.

**Default Role:** NOT APPLICABLE - All users are functionally equivalent

**Role Upgrade Path:** NOT APPLICABLE - No role hierarchy exists

**Code Implementation:** No role-based access control (RBAC) system implemented anywhere in the codebase.

### 3.2 Privilege Storage & Validation

**Storage Location:** Session-based, stored in Flask signed cookie

**Session Data Structure:**
```python
session['user_id'] = <integer>  # Only value stored in session
```

**Validation Points:**
- **Primary validation:** `app/website/app/routes.py`, line 72-73 (dashboard route)
- **Validation logic:** `if session.get('user_id')` - only checks for presence, not validity
- **No middleware:** No global authentication middleware exists
- **No decorators:** No `@login_required` or similar decorators implemented

**Cache/Session Persistence:**
- **Duration:** Entire browser session (until logout or browser close)
- **Refresh:** Never - session user_id is set once at login and never re-validated
- **Server-side storage:** None - sessions are client-side signed cookies

**Code Pointers:**
- Session creation: `routes.py:56`
- Session validation: `routes.py:72`
- Session destruction: `routes.py:39`

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NOT IMPLEMENTED

**Role Switching:** NOT IMPLEMENTED

**Audit Trail:** NOT IMPLEMENTED

**Code Implementation:** N/A - No such features exist

---

## 4. API Endpoint Inventory

**Network Surface Focus:** Only API endpoints accessible through the target web application at `http://localhost:33611` are included. Local-only utilities (like `run.py`), build tools, and development scripts are excluded per scope boundaries.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET, POST | `/` | anonymous | None | None | **Login/username entry page**. GET renders login form. POST validates username exists and redirects to password page. **Vulnerability:** Username enumeration. **File:** `routes.py:19-32` |
| POST | `/logout` | anonymous | None | None (should require auth) | **Session termination**. Clears user_id from session. **Vulnerability:** No CSRF protection, no authentication requirement. **File:** `routes.py:36-40` |
| GET, POST | `/password/<username>` | anonymous (partial - requires valid username from previous step) | `username` (URL path), `user_id` (hidden form field) | Inline password validation (line 53) | **Password authentication page**. GET renders password form with hidden user_id field. POST validates password and **CRITICAL:** accepts client-controlled user_id for session. **Vulnerability:** CRITICAL session fixation/horizontal privilege escalation (lines 55-56). **File:** `routes.py:44-66` |
| GET | `/dashboard` | authenticated (session['user_id'] required) | `user_id` (from session) | Inline session check: `if session.get('user_id')` (line 73) | **User dashboard**. Displays user profile data (first_name, last_name). For flag user (ID 10001), last_name contains the flag. **Vulnerability:** No validation that session owner should access this user_id's data. **File:** `routes.py:69-78` |

**Total Network-Accessible Endpoints:** 4

**Authorization Summary:**
- **No middleware-based authorization:** All auth checks are inline in route handlers
- **No decorator-based guards:** No `@login_required` or similar decorators
- **Single protected endpoint:** Only `/dashboard` checks for session
- **Critical flaw:** Session creation accepts client-controlled user_id (routes.py:56)

**Hidden Fields Exposed to Client:**
- `password.html:28` - `<input name="username" value="{{ username }}" hidden>`
- `password.html:29` - `<input name="user_id" value="{{ user_id }}" hidden>` **← CRITICAL: Client can modify this**

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application's network interface are included. Local-only scripts, build tools, and development utilities are excluded.

### URL Parameters
| Parameter | Endpoint | File:Line | Usage | Validation | Vulnerability |
|-----------|----------|-----------|-------|------------|---------------|
| `error` | `GET /?error=<value>` | routes.py:21 | Reflected in login page error message | NONE | Reflected XSS (mitigated by Jinja2 auto-escaping) |

### POST Body Fields (Form Data)
| Field Name | Endpoint | File:Line (Retrieval) | Usage | Validation | Vulnerability |
|------------|----------|----------------------|-------|------------|---------------|
| `username` | `POST /` | routes.py:23 | Database query for user lookup | NONE | Username enumeration, no length/character validation |
| `password` | `POST /password/<username>` | routes.py:52 | Plaintext password comparison | NONE | No complexity requirements, stored plaintext |
| `user_id` | `POST /password/<username>` | routes.py:55 | Session creation | NONE | **CRITICAL:** Client-controlled, enables horizontal privilege escalation |
| `username` (hidden) | `POST /password/<username>` | routes.py:52 (used in query) | Username resubmission | NONE | Redundant with URL parameter |

### URL Path Parameters
| Parameter | Endpoint Pattern | File:Line | Usage | Validation | Vulnerability |
|-----------|-----------------|-----------|-------|------------|---------------|
| `username` | `/password/<username>` | routes.py:45 (function parameter) | User lookup in database | NONE | Rendered in template, no sanitization |

### HTTP Headers
**Analysis:** No custom HTTP headers are processed by the application. Standard headers (User-Agent, Referer, etc.) are not accessed in application code.

**File Analyzed:** routes.py (no `request.headers[]` access found)

**Finding:** NO HEADER-BASED INPUT VECTORS

### Cookie Values
| Cookie Name | Endpoint | File:Line | Usage | Validation | Vulnerability |
|-------------|----------|-----------|-------|------------|---------------|
| `session` | All authenticated endpoints | routes.py:72 (via `session.get('user_id')`) | Session storage containing user_id | Flask signature validation only | Weak secret key ('your_secret_key') enables forgery |

**Session Cookie Structure:**
- **Type:** Flask client-side signed cookie
- **Signing Key:** 'your_secret_key' (hardcoded at `__init__.py:11`)
- **Data Stored:** `{'user_id': <integer>}`
- **Validation:** HMAC signature check only, no integrity validation of user_id value

### Comprehensive Input Vector Table

| Input Name | Source Type | Entry Point (file:line) | Validation Applied | Sanitization | Usage/Processing | Validation Gaps |
|------------|-------------|-------------------------|-------------------|--------------|------------------|-----------------|
| `username` (login) | POST form | routes.py:23 | **NONE** | **NONE** | SQLAlchemy query (routes.py:25), URL parameter (routes.py:28) | No length limit, no character whitelist, no rate limiting |
| `error` | GET query param | routes.py:21 | **NONE** | Jinja2 auto-escape only | Displayed in login.html:26 | No whitelist, relies solely on framework protection |
| `username` (password page) | URL path param | routes.py:45 | **NONE** | **NONE** | SQLAlchemy queries (routes.py:46, 53), template rendering | No sanitization before template use |
| `password` | POST form | routes.py:52 | **NONE** | **NONE** | Plaintext comparison in SQLAlchemy query (routes.py:53) | **CRITICAL:** No hashing, stored plaintext in database |
| `user_id` | POST hidden field | routes.py:55 | Existence check only | **NONE** | **CRITICAL:** Stored directly in session (routes.py:56) | **CRITICAL:** No validation that user_id matches authenticated user |
| `user_id` | Session cookie | routes.py:72 | Flask signature only | **NONE** | Database query (routes.py:74), template rendering | No re-authentication, no ownership validation |

**INPUT VALIDATION SUMMARY:**
- **Total Input Vectors:** 6
- **Validated Inputs:** 0
- **Sanitized Inputs:** 0 (relies on framework defaults)
- **Critical Unvalidated Inputs:** 2 (user_id, password)

---

## 6. Network & Interaction Map

**Network Surface Focus:** Only components part of the deployed, network-accessible infrastructure are mapped. Local development environments, build systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| TradingPlatformApp | Service | App | Python/Flask 3.0.3 | PII, Tokens, FLAG | Main application backend, handles authentication and session management. Runs on Apache with mod_wsgi. |
| ApacheWebServer | Service | Edge | Apache 2.4.65 | None | Reverse proxy and WSGI gateway. Serves static assets and forwards requests to Flask app. |
| MySQLDatabase | DataStore | Data | MySQL 5.7.15 | PII, Tokens, FLAG | Stores user data including plaintext passwords. FLAG stored in user.last_name field (ID 10001). **EOL version**. |
| DockerNetwork | Network | Internal | Docker bridge | All | Internal network for container communication. No encryption on db↔app traffic. |
| ClientBrowser | ExternAsset | Internet | Browser | Session cookies | End-user browser accessing application over HTTP (no HTTPS). |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| TradingPlatformApp | **Hosts:** `http://localhost:33611`; **Endpoints:** `/`, `/password/<username>`, `/dashboard`, `/logout`; **Auth:** Flask session cookies (signed with 'your_secret_key'); **Dependencies:** MySQLDatabase; **Language:** Python 3.x; **Framework:** Flask 3.0.3; **ORM:** SQLAlchemy 3.1.1 |
| ApacheWebServer | **Version:** 2.4.65 (Debian); **Modules:** mod_wsgi; **Config:** `trading_platform-httpd.conf` with wildcard CORS (`Access-Control-Allow-Origin: *`); **WSGI:** `trading_platform.wsgi`; **Logs:** ErrorLog + CustomLog (combined format) |
| MySQLDatabase | **Engine:** MySQL 5.7.15 (**EOL**); **Exposure:** Internal Docker network only; **Credentials:** root:trading_platform (hardcoded); **Tables:** user; **Consumers:** TradingPlatformApp; **Port:** 3306 (internal); **Storage:** Plaintext passwords, FLAG in user.last_name |
| DockerNetwork | **Type:** Docker bridge network; **Services:** db (MySQL), trading_platform (Flask+Apache); **Encryption:** None; **Isolation:** Container-level only |
| ClientBrowser | **Protocol:** HTTP only (no HTTPS); **Cookies:** Flask session cookie; **Storage:** Client-side session data |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ClientBrowser → ApacheWebServer | HTTP | `:33611 /` | None | Public |
| ClientBrowser → ApacheWebServer | HTTP | `:33611 /password/<username>` | None | Public, credentials |
| ClientBrowser → ApacheWebServer | HTTP | `:33611 /dashboard` | auth:session | PII, FLAG (for user 10001) |
| ClientBrowser → ApacheWebServer | HTTP | `:33611 /logout` | None | Session data |
| ApacheWebServer → TradingPlatformApp | WSGI | Internal (mod_wsgi) | None | All request data |
| TradingPlatformApp → MySQLDatabase | TCP | `:3306` | docker-network-only | PII, Passwords (plaintext), FLAG |
| TradingPlatformApp → ClientBrowser | HTTP | Response (Set-Cookie) | None | Session cookies (signed) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:session | Auth | Requires a valid user_id in Flask session cookie. Session created after password validation. **CRITICAL WEAKNESS:** Session user_id is client-controlled during authentication (routes.py:56). |
| docker-network-only | Network | Communication restricted to Docker internal bridge network. MySQL not exposed externally. |
| None | Auth | No authentication or authorization required. Endpoint is publicly accessible. |

**CRITICAL FINDING:** The "auth:session" guard is fundamentally broken because the session user_id can be manipulated during the authentication flow (routes.py:55-56), allowing horizontal privilege escalation.

---

## 7. Role & Privilege Architecture

**CRITICAL FINDING:** The application has **NO role-based access control system**. All authenticated users have identical privileges.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 | Global | No authentication required. Can access `/`, `/password/<username>`, `/logout`. |
| authenticated | 1 | Global | Has user_id in session. Can access `/dashboard`. **NO OTHER DISTINCTIONS EXIST**. |

**Evidence:**
- **File:** `app/website/app/models.py`, lines 5-11
- **Finding:** User model contains NO role field, no is_admin flag, no permission fields
- **Conclusion:** ALL authenticated users have identical access rights

**Known User Accounts:**
1. **test:test** (ID: 10032) - Testing account, first_name: "John", last_name: "Doe"
2. **flag:{random_100_chars}** (ID: 10001) - Target user, last_name contains FLAG value

**Default Users Created at Startup:**
- **File:** `app/website/app/__init__.py`, lines 22-53
- Both test and flag users are created if they don't exist

### 7.2 Privilege Lattice

```
PRIVILEGE ORDERING (NO HIERARCHY EXISTS):

┌──────────────────┐
│   ANONYMOUS      │  Privilege Level: 0
│   (no session)   │  Can access: /, /password/<username>, /logout
└──────────────────┘
         │
         ↓ (after successful authentication)
         │
┌──────────────────┐
│  AUTHENTICATED   │  Privilege Level: 1
│  (session exists)│  Can access: /dashboard + all anonymous endpoints
└──────────────────┘

NO ROLE DIFFERENTIATION BEYOND THIS POINT
```

**Critical Analysis:**
- **NO admin role exists**
- **NO user hierarchy** (all authenticated users are equivalent)
- **NO privilege escalation ladder** (only two states: anonymous vs authenticated)
- **NO role-based resource isolation** (any authenticated user can access any authenticated resource)

**Parallel Isolation:** NOT APPLICABLE - No parallel roles exist

**Role Dominance:** Simple binary: authenticated > anonymous

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/`, `/password/<username>`, `/logout` | None |
| authenticated | `/dashboard` | `/dashboard`, `/logout`, plus all anonymous routes | Session cookie with user_id |

**Note:** The `/logout` endpoint is accessible to both authenticated and anonymous users (no auth check enforced).

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| anonymous | None | None | N/A |
| authenticated | None (should exist) | Inline check: `if session.get('user_id')` (routes.py:73) | Flask session cookie: `session['user_id']` |

**CRITICAL FINDINGS:**
1. **NO middleware** exists for authentication enforcement
2. **NO decorators** like `@login_required` are defined or used
3. **Single inline check** at dashboard route (routes.py:73)
4. **NO role validation** because no role system exists

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**CRITICAL PRIORITY FINDINGS:**

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Vulnerability Details |
|----------|-----------------|---------------------|-----------|-------------|----------------------|
| **CRITICAL** | `/password/<username>` (POST) | `user_id` (hidden form field) | Session identity | **MAXIMUM** | **Session fixation vulnerability**. Client controls the `user_id` value that gets stored in session (routes.py:56). Attacker authenticates as test user but submits user_id=10001 to gain flag user session. **FILE:** routes.py:55-56. **EXPLOITATION:** Trivial - modify hidden form field before POST. |
| **HIGH** | `/dashboard` | `user_id` (from session) | User profile data (PII, FLAG) | **HIGH** | Once session is compromised via HPE-001, dashboard displays that user's data without ownership validation. **FILE:** routes.py:72-75. **EXPLOITATION:** Depends on HPE-001 success. |

**Detailed Attack Flow for Priority CRITICAL:**

**Vulnerability:** Session Fixation via Client-Controlled user_id  
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-043-24/app/website/app/routes.py`  
**Lines:** 55-56

**Vulnerable Code:**
```python
if User.query.get(request.form['user_id']):  # Line 55 - Only checks existence
    session['user_id'] = request.form['user_id']  # Line 56 - Accepts client value
```

**Exploitation Steps:**
1. Navigate to `http://localhost:33611/`
2. Enter username: "test", click Login
3. Redirected to `/password/test`
4. Password form includes hidden field: `<input name="user_id" value="10032" hidden>`
5. **Attacker action:** Use browser DevTools or proxy to modify user_id to "10001"
6. Enter password: "test", click Login
7. Server validates password for "test" user (PASSES)
8. Server checks if user_id=10001 exists (YES - flag user exists)
9. Server sets `session['user_id'] = 10001` (ATTACKER NOW HAS FLAG USER SESSION)
10. Redirected to `/dashboard` - displays flag user's data
11. **Flag extracted:** Displayed as "Welcome, Flag {FLAG_VALUE}" in dashboard

**No Additional Horizontal Escalation Candidates:** The application has only one resource (user dashboard), so this is the sole IDOR vulnerability.

### 8.2 Vertical Privilege Escalation Candidates

**FINDING:** NOT APPLICABLE - No admin role or privileged functions exist

**Analysis:**
- User model has NO role field (models.py:8)
- No admin-only endpoints exist
- No elevated privilege functions implemented
- ALL authenticated users have identical access

**Risk Assessment:** If admin functionality is added in the future, the current architecture provides NO authorization framework to protect it. Any new admin endpoints would be accessible to all authenticated users.

### 8.3 Context-Based Authorization Candidates

**FINDING:** NOT APPLICABLE - No multi-step workflows exist

**Analysis:**
- Authentication is two-stage (username → password) but not workflow-based
- No approval processes, onboarding flows, or multi-step operations
- No state-based authorization (no "pending", "approved", "completed" states)
- Session is created in single atomic operation

**Note:** The two-stage authentication (username → password) is NOT a context-based authorization issue. It's a standard authentication pattern (though poorly implemented with the session fixation flaw).

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through the target web application's network interface are included. Local-only scripts, build tools, and CLI applications are excluded.

### CRITICAL FINDING: ZERO INJECTION SOURCES IDENTIFIED

### 9.1 Command Injection Sources

**ANALYSIS RESULT: NO COMMAND INJECTION SOURCES FOUND**

**Comprehensive Search Performed:**
- **Dangerous functions searched:** `os.system()`, `os.popen()`, `subprocess.call()`, `subprocess.run()`, `subprocess.Popen()`, `eval()`, `exec()`, `compile()`
- **Modules checked:** No `os` or `subprocess` imports detected
- **Files analyzed:** routes.py (77 lines), __init__.py (56 lines), models.py (11 lines), db.py (3 lines)

**Conclusion:** The application does NOT execute any system commands with user input. No command injection attack surface exists.

### 9.2 SQL Injection Sources

**ANALYSIS RESULT: NO TRADITIONAL SQL INJECTION SOURCES FOUND**

**Protection Mechanism:** All database queries use SQLAlchemy ORM with automatic parameterization.

**Detailed Input Flow Analysis:**

| Input Name | Entry Point (file:line) | Data Flow Path | Query Location (file:line) | Query Type | Protected? | Exploitable? |
|------------|-------------------------|----------------|---------------------------|------------|------------|--------------|
| `username` (login) | routes.py:23 | `request.form['username']` → `User.query.filter_by(username=username)` | routes.py:25 | SQLAlchemy ORM `.filter_by()` | **YES** | **NO** |
| `username` (password URL) | routes.py:45 | URL parameter → `User.query.filter_by(username=username)` | routes.py:46, 53 | SQLAlchemy ORM `.filter_by()` | **YES** | **NO** |
| `password` | routes.py:52 | `request.form['password']` → `User.query.filter_by(password=password)` | routes.py:53 | SQLAlchemy ORM `.filter_by()` | **YES** | **NO** |
| `user_id` | routes.py:55 | `request.form['user_id']` → `User.query.get(user_id)` | routes.py:55, 74 | SQLAlchemy ORM `.get()` | **YES** | **NO** |

**Query Patterns Analyzed:**

1. **routes.py:25** - `User.query.filter_by(username=username).first()`
   - **Method:** SQLAlchemy ORM keyword argument
   - **Protection:** Automatic parameterization
   - **Verdict:** SAFE

2. **routes.py:53** - `User.query.filter_by(username=username, password=password).first()`
   - **Method:** SQLAlchemy ORM keyword arguments
   - **Protection:** Automatic parameterization
   - **Verdict:** SAFE

3. **routes.py:55, 74** - `User.query.get(user_id)`
   - **Method:** SQLAlchemy ORM primary key lookup
   - **Protection:** Automatic parameterization
   - **Verdict:** SAFE

**Raw SQL Analysis:**
- **NO raw SQL queries found**
- **NO `.execute()` with string concatenation**
- **NO `text()` function usage**
- **NO f-strings, `.format()`, or `%` operator with SQL**
- **NO direct database engine access**

**Imports Verified:**
```python
# routes.py:1
from flask import Flask, render_template, request, redirect, url_for, session, render_template_string

# No SQL-related imports in routes.py
```

**Template Injection Check:**
- `render_template_string` is imported but **NEVER USED** in the application
- All template rendering uses safe `render_template()` function
- **Verdict:** No SSTI (Server-Side Template Injection) vulnerabilities

### 9.3 Other Injection Vectors Analyzed

**Path Traversal:**
- **Finding:** NO path traversal vulnerabilities in network-accessible code
- **Evidence:** Only one file operation: `with open('/flag')` at __init__.py:37 (hardcoded path, not user-controlled)

**LDAP Injection:** NOT APPLICABLE - No LDAP integration

**XML/XXE Injection:** NOT APPLICABLE - No XML parsing

**NoSQL Injection:** NOT APPLICABLE - Uses MySQL (RDBMS), not NoSQL

**YAML Injection:** NOT APPLICABLE - No YAML parsing

**Deserialization:** NOT APPLICABLE - No pickle, marshal, or unsafe deserialization

### Summary Table

| Injection Type | Sources Found | Exploitable | Protection Mechanism |
|----------------|---------------|-------------|---------------------|
| **Command Injection** | 0 | NO | No system command execution in code |
| **SQL Injection** | 0 | NO | SQLAlchemy ORM with parameterized queries |
| **SSTI** | 0 | NO | Only `render_template()` used, not `render_template_string()` |
| **Path Traversal** | 0 | NO | Single hardcoded file path, no user input |
| **Other** | 0 | NO | N/A |

**TOTAL INJECTION SOURCES: 0**

**Security Assessment:** The application demonstrates **good injection protection practices** through exclusive use of SQLAlchemy ORM and absence of system command execution. However, it has **CRITICAL authentication and authorization vulnerabilities** (session fixation at routes.py:55-56) that are far more severe than injection flaws.

---

## 10. Additional Security Findings

### 10.1 Plaintext Password Storage
- **File:** models.py:8 - `password = db.Column(db.String(100), nullable=False)`
- **Issue:** Passwords stored without hashing (bcrypt, Argon2, etc.)
- **Impact:** Database breach exposes all credentials immediately
- **Location:** routes.py:53 - Plaintext comparison: `User.query.filter_by(username=username, password=password)`

### 10.2 Hardcoded Secrets
- **Session Secret:** __init__.py:11 - `app.secret_key = 'your_secret_key'`
- **Database Credentials:** __init__.py:14 - `mysql+pymysql://root:trading_platform@db/database`
- **MySQL Root Password:** mysql/Dockerfile:3, docker-compose.yml:7

### 10.3 Missing Security Headers
- **File:** trading_platform-httpd.conf
- **Missing:** Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Content-Security-Policy
- **Present:** Only `Access-Control-Allow-Origin: *` (insecure wildcard CORS)

### 10.4 End-of-Life Software
- **MySQL 5.7.15:** Reached EOL in October 2023, no security patches available
- **Risk:** Known CVEs without remediation path

### 10.5 No CSRF Protection
- **All POST endpoints lack CSRF tokens**
- **Affected:** `/`, `/password/<username>`, `/logout`
- **Impact:** Cross-site request forgery attacks possible

### 10.6 Username Enumeration
- **File:** routes.py:32
- **Issue:** Different responses for valid vs invalid usernames
- **Valid username:** Redirect to `/password/<username>`
- **Invalid username:** Error message "User not found"

### 10.7 No Rate Limiting
- **Issue:** Unlimited authentication attempts
- **Impact:** Brute force attacks on password endpoint

---

## RECONNAISSANCE COMPLETE

This deliverable provides comprehensive attack surface mapping for all subsequent penetration testing phases. The CRITICAL session fixation vulnerability (routes.py:55-56) should be prioritized for exploitation by the Authorization Analysis Specialist.

**Key Deliverables Provided:**
✅ Complete endpoint inventory with exact file:line references  
✅ Authorization architecture analysis (NO RBAC exists)  
✅ Input vector enumeration (6 inputs, 0 validated)  
✅ Injection source analysis (0 sources found - good ORM usage)  
✅ Network interaction mapping  
✅ Horizontal privilege escalation vulnerability identification  
✅ Flag extraction path documentation  

**Next Phase:** Authorization Analysis Specialist should focus on exploiting HPE-001 (session fixation) to extract the flag from user ID 10001.