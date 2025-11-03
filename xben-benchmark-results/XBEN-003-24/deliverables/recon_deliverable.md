# Reconnaissance Deliverable: Trading Platform Flask Application

## 0) HOW TO READ THIS

This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

---

## 1. Executive Summary

The Trading Platform is a deliberately vulnerable Flask web application implementing a two-step authentication system with **catastrophic security flaws**. The application's primary purpose is to demonstrate authentication and authorization vulnerabilities in a CTF/training environment.

**Core Technology Stack:**
- **Backend:** Flask 3.0.3 (Python), SQLAlchemy 3.1.1, PyMySQL 1.1.0
- **Frontend:** Bootstrap CSS, jQuery 3.5.1, Vanilla JavaScript
- **Database:** MySQL 5.7.15 (PyMySQL connector)
- **Web Server:** Apache 2.4.65 with mod_wsgi
- **Infrastructure:** Docker Compose (2 services: app on port 80, database on internal port 3306)
- **Deployment:** Debian Bullseye Slim base image, HTTP-only (no TLS)

**Attack Surface Summary:**
- **4 network-accessible HTTP endpoints** (login, password, dashboard, logout)
- **Zero role-based access control** - all users have identical privileges
- **Critical X-UserId header authentication bypass** enabling horizontal privilege escalation
- **Plaintext password storage** with no cryptographic hashing
- **Hardcoded secrets** including Flask session key and database credentials
- **Test credentials** (`test:test`) always present in the system
- **Flag stored** in user ID 10052's `last_name` database field

**Primary Attack Vector:** The X-UserId HTTP header (routes.py:73-78) completely bypasses session-based authentication, allowing any authenticated user to access any other user's dashboard by sending `X-UserId: <target_user_id>`. Combined with exposed user IDs in HTML templates, this enables trivial account takeover.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Bootstrap CSS (local copy at `/static/css/bootstrap.min.css`)
- **JavaScript Library:** jQuery 3.5.1 (local copy at `/static/js/jquery-3.5.1.min.js`)
- **Template Engine:** Jinja2 (built into Flask 3.0.3)
- **Authentication Libraries:** None - custom implementation using Flask sessions
- **Security Features:** Jinja2 auto-escaping enabled (XSS protection)

### Backend
- **Language:** Python 3.x (Debian Bullseye)
- **Framework:** Flask 3.0.3
- **ORM:** Flask-SQLAlchemy 3.1.1
- **Database Driver:** PyMySQL 1.1.0 (pure Python MySQL client)
- **Session Management:** Flask built-in client-side signed sessions
- **Key Dependencies:** Only 3 packages in requirements.txt (minimal attack surface)
- **Missing Security Libraries:** No flask-wtf (CSRF), no bcrypt/argon2 (password hashing), no flask-talisman (security headers), no flask-limiter (rate limiting)

### Infrastructure
- **Hosting Provider:** Docker containerized environment
- **CDN:** None
- **Web Server:** Apache 2.4.65 (Debian) with mod_wsgi
- **Database Type:** MySQL 5.7.15 (Docker service)
- **Container Orchestration:** Docker Compose
- **Network:** Internal Docker bridge network
- **TLS/SSL:** None - HTTP-only on port 80

### Identified Subdomains
The following subdomains were identified during external reconnaissance but are **NOT related to the target application** (localhost:40477):
- tools.sonoma.edu.localhost
- www.localhost
- mail.localhost
- mail02.regency.localhost
- mail.regency.localhost
- (Additional subdomains from subfinder are out of scope for this localhost application)

**Note:** These subdomains appear to be from certificate transparency logs or DNS reconnaissance and do not apply to the containerized localhost application.

### Open Ports & Services
From nmap scan of localhost:
- **Port 80/tcp:** Caddy httpd (redirects to target application)
- **Port 443/tcp:** SSL/HTTPS (not used by target application)
- **Port 631/tcp:** CUPS 2.3 (printing service, out of scope)
- **Port 8080/tcp:** Apache httpd 2.4.65 (500 Internal Server Error, potentially misconfigured)
- **Port 49152/tcp:** Golang net/http server (Tailscale, out of scope)

**Target Application Port:** The application is accessed via http://localhost:40477 which maps to the Docker container on port 80.

---

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary Login:** `POST /` (username submission)
- **Password Entry:** `POST /password/<username>` (password verification)
- **Registration:** None - no user registration functionality
- **Password Reset:** None - no password recovery mechanism
- **SSO/OAuth:** None - no external authentication providers

### Mechanism: Two-Step Authentication Flow

**Step 1: Username Validation** (`POST /`)
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:19-32`
- User submits username via form field
- Application queries database: `User.query.filter_by(username=username).first()` (line 25)
- **Username Enumeration Vulnerability:** Different responses for valid/invalid usernames
- If username exists → redirect to `/password/<username>` (line 28)
- If username doesn't exist → return error "User not found" (line 31)
- **No rate limiting** enables automated username discovery

**Step 2: Password Validation** (`POST /password/<username>`)
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:44-64`
- User submits password via form field
- **CRITICAL VULNERABILITY:** Plaintext password comparison at line 53:
  ```python
  user = User.query.filter_by(username=username, password=password).first()
  ```
- No password hashing - direct string comparison with database value
- On success: Sets session with `session['user_id'] = user.id` (line 56)
- On success: Redirects to `/dashboard` (line 59)
- On failure: Redirects to login with error "Incorrect password" (line 62)

**Step 3: Session Creation**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:56`
- Flask client-side session cookie created
- Session data: `{'user_id': <integer>}` (only stores user ID, no role information)
- Cookie name: `session`
- Signed with secret key: `'your_secret_key'` (hardcoded at __init__.py:11)
- **No session timeout configured**
- **No IP binding or User-Agent validation**

**Step 4: Dashboard Access with Authentication Bypass**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:68-86`
- Retrieves `user_id` from session: `session.get('user_id')` (line 71)
- **CRITICAL VULNERABILITY:** Checks X-UserId header (lines 73-78):
  ```python
  x_user_id = request.headers.get('X-UserId')
  if x_user_id:
      if User.query.get(x_user_id):
          user_id = x_user_id  # Session user_id overwritten!
  ```
- If X-UserId header present and valid → **completely replaces session authentication**
- Queries user data: `User.query.get(user_id)` (line 82)
- Renders dashboard with user's first_name and last_name (containing flag for user 10052)

### Code Pointers

**Authentication Logic:**
- Main routes file: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py`
- Username validation: lines 19-32
- Password validation: lines 44-64
- Dashboard (with bypass): lines 68-86
- Logout: lines 36-40

**Session Configuration:**
- Application initialization: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py`
- Secret key (line 11): `app.secret_key = 'your_secret_key'`
- **Missing:** SESSION_COOKIE_SECURE, SESSION_COOKIE_SAMESITE, session timeout settings

**User Model:**
- Database model: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/models.py:5-11`
- Password field (line 8): `password = db.Column(db.String(100), nullable=False)` (plaintext)
- **No role field** - no RBAC implementation

**Test Account Seeding:**
- User creation: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py:23-35`
- Test credentials: username `test`, password `test`, user_id `10032`
- Flag user: username `flag`, password (random 100-char string), user_id `10052`

### 3.1 Role Assignment Process

**Role Determination:** **NONE - No role system exists**
- User model contains no role, is_admin, or privilege_level fields
- All authenticated users have identical privileges
- No differentiation between regular users and administrators

**Default Role:** Not applicable (no role system)

**Role Upgrade Path:** Not applicable (no role system)

**Code Implementation:** Role system not implemented anywhere in codebase

**Implications:**
- Cannot test vertical privilege escalation (no privilege hierarchy)
- All authorization testing focuses on horizontal privilege escalation (user-to-user)
- Flag user (10052) is not "admin" but a regular user account containing the flag

### 3.2 Privilege Storage & Validation

**Storage Location:** Session cookie only
- Stored as: `session['user_id']` (integer)
- Session type: Flask client-side signed cookie
- Cookie name: `session`
- Signing algorithm: HMAC with secret key

**Validation Points:**
- **Dashboard endpoint** (routes.py:71): `user_id = session.get('user_id')`
- **No other authorization checks** - only dashboard requires authentication
- Login, password, and logout endpoints have no authentication requirements

**Cache/Session Persistence:**
- Session persists until browser closes (non-permanent session)
- No server-side session timeout configured
- No absolute timeout or inactivity timeout
- Session data readable by client (base64 encoded, not encrypted)

**Code Pointers:**
- Session storage: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:56`
- Session retrieval: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:71`
- Session clearing: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:39`

### 3.3 Role Switching & Impersonation

**Impersonation Features:** **Unintentional impersonation via X-UserId header**
- No legitimate admin impersonation feature exists
- **Vulnerability:** Any authenticated user can impersonate others via X-UserId header
- Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:73-78`

**Role Switching:** None implemented

**Audit Trail:** **None** - No logging of any kind
- No authentication event logging
- No X-UserId header usage logging
- No dashboard access logging
- No failed login attempt tracking
- Only Apache access logs exist (default Apache logging)

**Code Implementation:** The X-UserId "impersonation" is a vulnerability, not a feature:
```python
x_user_id = request.headers.get('X-UserId')
if x_user_id:
    if User.query.get(x_user_id):
        user_id = x_user_id  # Impersonation occurs here
```

---

## 4. API Endpoint Inventory

All endpoints listed below are accessible through the target web application at http://localhost:40477. No CLI tools, build scripts, or local-only utilities are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|------------------------|---------------------------|
| GET | `/` | anon | None | None | Displays login page for username entry. Template: login.html. **Code:** routes.py:19-21 |
| POST | `/` | anon | None | None | Validates username existence in database. Redirects to password page if valid. **Vulnerability:** Username enumeration - distinct error for "User not found". **Code:** routes.py:22-32 |
| GET | `/password/<username>` | anon | `username` (path param) | None | Displays password entry form. **Vulnerability:** Exposes user's first_name and user_id in HTML before authentication. **Code:** routes.py:44-50, 64 |
| POST | `/password/<username>` | anon | `username` (path param) | None | Validates plaintext password against database. Sets session['user_id'] on success. **Critical Vulnerability:** Plaintext password comparison (line 53). **Code:** routes.py:51-64 |
| GET | `/dashboard` | user (session or header) | `user_id` (implicit from session/header) | Session cookie OR X-UserId header | **CRITICAL VULNERABILITY:** Accepts X-UserId header that overrides session authentication (lines 73-78). Displays user's first_name and last_name. Flag stored in user 10052's last_name. **Code:** routes.py:68-86 |
| POST | `/logout` | none | None | None | Clears session['user_id'] and redirects to login. **Vulnerabilities:** No CSRF protection, no session regeneration. **Code:** routes.py:36-40 |
| GET | `/static/<path:filename>` | anon | None | None | Flask built-in static file server. Serves Bootstrap CSS and jQuery. **Directory:** /static/ |

### Endpoint Details with Authorization Analysis

#### Critical Endpoint: `/dashboard`
**Authorization Flow:**
1. Retrieves `user_id` from session (line 71)
2. **THEN checks `X-UserId` header** (line 73)
3. If X-UserId present AND valid user ID exists in database → **overrides session user_id** (line 76)
4. If X-UserId invalid → returns 400 error
5. If no user_id from either source → redirects to login
6. **NO validation** that session user_id matches X-UserId
7. **NO authorization check** that user should access this data

**Exploit Path:**
```bash
# Step 1: Authenticate as test user
curl -X POST http://localhost:40477/ -d "username=test"
curl -X POST http://localhost:40477/password/test -d "password=test" -c cookies.txt

# Step 2: Access flag user's dashboard
curl http://localhost:40477/dashboard -b cookies.txt -H "X-UserId: 10052"
# Response contains flag in user.last_name field
```

#### Information Disclosure: `/password/<username>` (GET)
**Exposes before authentication:**
- User's first name: `{{ first_name }}`
- User's ID: `{{ user_id }}` (in hidden form field and JavaScript)
- Username confirmation: `{{ username }}`

**Location:** routes.py:64
```python
return render_template('password.html', first_name=user.first_name, 
                      username=username, user_id=user.id)
```

**Security Impact:** Enables attackers to enumerate user IDs for X-UserId attacks

---

## 5. Potential Input Vectors for Vulnerability Analysis

All input vectors below are accessible through the target web application's network interface. No local-only scripts, build tools, or CLI utilities are included.

### URL Parameters
- **`error` (query parameter)** - Endpoint: `GET /`, Source: routes.py:21
  - Usage: Error message display in login template
  - Validation: None
  - Sink: Template rendering (login.html:26) - Jinja2 auto-escaped
  - Example: `/?error=User%20not%20found`

### POST Body Fields (Form-Encoded)

#### Login Endpoint (`POST /`)
- **`username`** - routes.py:23
  - Purpose: Username for authentication step 1
  - Validation: None - no length limits, character restrictions, or format validation
  - Sink: Database query (SQLAlchemy ORM - parameterized, safe from SQL injection)
  - Flows to: URL path parameter in redirect to `/password/<username>`

#### Password Endpoint (`POST /password/<username>`)
- **`password`** - routes.py:52
  - Purpose: Password for authentication step 2
  - Validation: None - no complexity requirements, length limits
  - Sink: Database query (plaintext comparison - NO HASHING)
  - Security Issue: Stored and compared in plaintext

- **`username`** (hidden field) - password.html:29
  - Submitted via POST but NOT used in backend routes.py
  - Client-side only, no server-side processing

- **`user_id`** (hidden field) - password.html:30
  - Submitted via POST but NOT used in backend routes.py
  - Client-side only, no server-side processing

### HTTP Headers

#### Critical: X-UserId Header
- **`X-UserId`** - routes.py:73, password.html:56
  - **Endpoint:** `GET /dashboard`
  - **Purpose:** Intended for password submission AJAX, mistakenly implemented as authentication override
  - **Validation:** Only checks if user_id exists in database (line 75)
  - **Critical Vulnerability:** Completely bypasses session authentication
  - **Exploitable:** HIGH - Any authenticated user can impersonate any other user
  - **Code Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:73-78`

### Path Parameters
- **`<username>`** - routes.py:44 (password endpoint)
  - URL path variable in `/password/<username>`
  - Validation: None - accepts any string
  - Flows to: Database queries (SQLAlchemy ORM - safe)
  - Flows to: Template rendering (Jinja2 auto-escaped)
  - Information Disclosure: Reveals whether username exists in system

### Cookie Values
- **`session`** (Flask session cookie)
  - Contains: `{'user_id': <integer>}`
  - Signed with: HMAC using secret key `'your_secret_key'`
  - Used by: `/dashboard` endpoint (routes.py:71)
  - Vulnerability: Weak secret key enables session forgery
  - No Secure flag: Transmitted over HTTP
  - No SameSite flag: Vulnerable to CSRF

### JSON Body
**None** - Application does not accept JSON payloads. All POST requests use `application/x-www-form-urlencoded`.

### File Uploads
**None** - No file upload functionality in the application.

### Summary of High-Risk Input Vectors

| Priority | Vector | Endpoint | Risk Type | Exploitability |
|----------|--------|----------|-----------|----------------|
| **CRITICAL** | X-UserId header | GET /dashboard | Authentication Bypass | Trivial - Send header with valid user_id |
| **HIGH** | session cookie | GET /dashboard | Session Forgery | Medium - Requires known weak secret key |
| **MEDIUM** | error query param | GET / | Reflected XSS | Low - Jinja2 auto-escaping protects |
| **MEDIUM** | username form field | POST / | Username Enumeration | Trivial - No rate limiting |
| **MEDIUM** | password form field | POST /password/<username> | Brute Force | Medium - No rate limiting or lockout |

---

## 6. Network & Interaction Map

This section maps the network-accessible components of the deployed Trading Platform application. Local development tools, build systems, and CLI utilities are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Browser/HTTP | Public, Sessions | External attacker's entry point |
| Flask Application | Service | App | Python 3/Flask 3.0.3 | PII, Passwords (plaintext), Flag | Main vulnerable application on port 80 |
| Apache/mod_wsgi | Service | Edge | Apache 2.4.65 | None | Web server hosting Flask via WSGI |
| MySQL Database | DataStore | Data | MySQL 5.7.15 | PII, Passwords (plaintext), Flag | Stores user data including flag in user 10052's last_name |
| Docker Network | Network | Infrastructure | Docker Bridge | None | Isolates database from external access |
| Static File Server | Service | App | Flask Built-in | Public | Serves Bootstrap CSS and jQuery |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Flask Application | Hosts: `http://localhost:40477`; Endpoints: `/`, `/password/<username>`, `/dashboard`, `/logout`, `/static/*`; Auth: Session cookie OR X-UserId header; Dependencies: MySQL Database; Secrets: secret_key='your_secret_key', db_password='trading_platform_db' |
| Apache/mod_wsgi | Version: `2.4.65 (Debian)`; Config: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/trading_platform-httpd.conf`; Features: Directory listing enabled for /static/; CORS: `Access-Control-Allow-Origin: *` |
| MySQL Database | Engine: `MySQL 5.7.15`; Exposure: `Internal Docker network only (port 3306)`; Consumers: `Flask Application`; Credentials: `root:trading_platform_db`; Encryption: None (no TLS, no encryption-at-rest) |
| User Browser | Protocols: `HTTP only (no HTTPS)`; Session Storage: `Signed cookies`; JavaScript: `jQuery 3.5.1, Fetch API for password submission` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → Apache/mod_wsgi | HTTP | `:40477 (maps to :80)` | None | Public, Sessions |
| Apache/mod_wsgi → Flask Application | WSGI | `localhost (in-process)` | None | Public, PII, Sessions |
| Flask Application → MySQL Database | TCP | `:3306` | Docker network isolation | PII, Passwords (plaintext), Flag |
| User Browser → Flask Application (GET /) | HTTP | `:40477/` | None | Public |
| User Browser → Flask Application (POST /) | HTTP | `:40477/` | None | PII (username) |
| User Browser → Flask Application (GET /password/<username>) | HTTP | `:40477/password/<username>` | None | PII (username, user_id, first_name exposed) |
| User Browser → Flask Application (POST /password/<username>) | HTTP | `:40477/password/<username>` | None | Passwords (plaintext), X-UserId header |
| User Browser → Flask Application (GET /dashboard) | HTTP | `:40477/dashboard` | auth:session OR auth:X-UserId-bypass | PII, Flag (if user_id=10052) |
| User Browser → Flask Application (POST /logout) | HTTP | `:40477/logout` | None (no CSRF protection) | Sessions |
| User Browser → Static File Server | HTTP | `:40477/static/*` | None | Public (CSS, JS) |
| Flask Application → User Browser (Set-Cookie) | HTTP | `Response headers` | None | Session cookies (no Secure flag) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | **NO GUARDS EXIST** - No authentication required for any endpoint except dashboard |
| auth:session | Auth | Checks if `session.get('user_id')` exists. Only used at dashboard endpoint (routes.py:71). Can be bypassed by X-UserId header. |
| auth:X-UserId-bypass | Authorization | **VULNERABILITY** - X-UserId header completely bypasses session authentication at dashboard (routes.py:73-78). Allows any authenticated user to impersonate others. |
| Docker network isolation | Network | MySQL database accessible only within Docker bridge network. Prevents direct external database connections. |
| SQLAlchemy ORM | Protocol | All database queries use parameterized queries via ORM. Prevents SQL injection. |
| Jinja2 auto-escaping | Protocol | Template engine automatically escapes HTML special characters. Prevents most XSS attacks. |
| CORS:* | Network | **VULNERABILITY** - Wide-open CORS policy `Access-Control-Allow-Origin: *` allows requests from any origin. |

**Critical Observation:** The application has essentially **NO authorization guards**. The only authentication check (session.get('user_id')) is immediately bypassed by the X-UserId header vulnerability. No CSRF protection, no rate limiting, no input validation middleware exists.

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**CRITICAL FINDING: NO ROLE SYSTEM EXISTS**

The application implements **zero role-based access control**. All authenticated users have identical privileges.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 | Global | No authentication - Access to /, /password/<username>, /logout |
| authenticated | 1 | Global | Any user with valid session or X-UserId header - Access to /dashboard |

**Evidence:**
- User model (models.py:5-11) contains no role field
- No `is_admin`, `role`, `permissions`, or privilege fields in database schema
- No role checks in any endpoint
- No authorization decorators or middleware

**User Accounts:**
- Test user (ID: 10032): username `test`, password `test` - Standard authenticated user
- Flag user (ID: 10052): username `flag`, password (random) - **Not privileged, just contains flag data**

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anonymous → authenticated

No Parallel Isolation:
All authenticated users are equivalent - No role hierarchy exists
```

**Horizontal Privilege Escalation:** Possible via X-UserId header (any user can access any other user's data)

**Vertical Privilege Escalation:** Not applicable (no privilege levels to escalate to)

**Role Switching:** Not implemented (but unintentional "impersonation" via X-UserId header)

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/`, `/password/<username>`, `/logout` | None |
| authenticated | `/dashboard` | All routes (/, /password/<username>, /dashboard, /logout, /static/*) | Session cookie OR X-UserId header |

**Note:** Logout endpoint (`/logout`) is public (no authentication required), though only meaningful with an active session.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A |
| authenticated | None (session checked only at dashboard) | `if user_id:` at routes.py:81 (trivially bypassed) | `session['user_id']` or `X-UserId` header |

**Code Locations:**
- Session storage: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:56`
- Session check: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:71`
- X-UserId bypass: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py:73-78`

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Exploitation Method |
|----------|-----------------|---------------------|-----------|-------------|---------------------|
| **CRITICAL** | `GET /dashboard` | X-UserId header | user_data | **Contains FLAG** for user 10052 | Send `X-UserId: 10052` header with any valid session. Trivial exploitation. |
| **CRITICAL** | `GET /dashboard` | session['user_id'] | user_data | PII, FLAG | Forge session cookie with weak secret key `'your_secret_key'` to impersonate any user. |
| **HIGH** | `GET /password/<username>` | username (path param) | user_data | PII (first_name, user_id) | Enumerate usernames to discover user_id values. No authorization check - public endpoint. |
| **MEDIUM** | `POST /password/<username>` | username (path param) | authentication | credentials | Brute force passwords for any username (no rate limiting, no account lockout). |

**Primary Exploit Path for Flag Extraction:**
1. Authenticate as test user: `POST /` with username=test, then `POST /password/test` with password=test
2. Capture session cookie from response
3. Send request: `GET /dashboard` with session cookie and header `X-UserId: 10052`
4. Extract flag from response HTML: user.last_name field contains flag value

**Alternative Exploit Path (Session Forgery):**
1. Obtain secret key: `'your_secret_key'` (hardcoded in source)
2. Forge Flask session cookie with `{'user_id': 10052}`
3. Send request: `GET /dashboard` with forged session cookie
4. Extract flag from response

### 8.2 Vertical Privilege Escalation Candidates

**NOT APPLICABLE** - No role hierarchy exists in the application.

Since all authenticated users have identical privileges (no admin/user distinction), vertical privilege escalation is not possible. The flag user (ID: 10052) is not an "admin" or "privileged" account - it's a regular user account that happens to contain the flag in its last_name field.

**Potential Targets if Roles Existed:**
- Admin panel endpoints (none exist)
- User management functions (none exist)
- System configuration pages (none exist)
- Privileged API endpoints (none exist)

### 8.3 Context-Based Authorization Candidates

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Exploitability |
|----------|----------|---------------------|------------------|----------------|
| Two-step authentication | `GET /password/<username>` | Username validated at POST / | **High** - Can access password page directly by guessing username in URL | Navigate directly to `/password/<known_username>` without visiting login page |
| Dashboard access | `GET /dashboard` | Authenticated via POST /password/<username> | **Critical** - X-UserId header bypasses all authentication | Send X-UserId header with any user_id (no session required if header validation succeeds) |
| Logout | `POST /logout` | Active session | **Medium** - No CSRF protection, can force victim logout | CSRF attack to trigger victim logout |

**Context-Based Bypass #1: Skip Username Validation**
- Expected flow: POST / (validate username) → GET /password/<username>
- Bypass: Navigate directly to `/password/<username>` with known username
- Impact: Skip username enumeration detection, directly attempt password guessing
- **Code Location:** routes.py:44 - No check that username was validated in previous step

**Context-Based Bypass #2: Dashboard Access Without Password Authentication**
- Expected flow: POST /password/<username> → Sets session → GET /dashboard
- Bypass: Send X-UserId header directly to /dashboard
- Impact: **Complete authentication bypass** if user_id is known/guessable
- **Code Location:** routes.py:73-78 - X-UserId header completely overrides session check

**Context-Based Bypass #3: Information Disclosure Before Authentication**
- Expected flow: Authenticate fully before seeing user data
- Bypass: GET /password/<username> exposes user_id and first_name BEFORE password entered
- Impact: Leak user_id values needed for X-UserId exploitation
- **Code Location:** routes.py:64 - Renders template with user data before authentication

---

## 9. Injection Sources (Command Injection and SQL Injection)

### SQL Injection Sources

**ANALYSIS RESULT: NO SQL INJECTION VULNERABILITIES FOUND**

All database queries in the network-accessible application use SQLAlchemy ORM with proper parameterization. No raw SQL execution, string concatenation in queries, or unsafe ORM usage was detected.

**Database Query Locations Analyzed:**

1. **routes.py:25** - Username lookup
   - Code: `User.query.filter_by(username=username).first()`
   - Input: request.form['username']
   - Safe: SQLAlchemy ORM parameterization

2. **routes.py:46** - User retrieval for password page
   - Code: `User.query.filter_by(username=username).first()`
   - Input: URL path parameter `<username>`
   - Safe: SQLAlchemy ORM parameterization

3. **routes.py:53** - Password authentication
   - Code: `User.query.filter_by(username=username, password=password).first()`
   - Input: URL parameter and request.form['password']
   - Safe: SQLAlchemy ORM parameterization (though plaintext password comparison is a security issue)

4. **routes.py:75** - X-UserId header validation
   - Code: `User.query.get(x_user_id)`
   - Input: request.headers.get('X-UserId')
   - Safe: SQLAlchemy .get() uses primary key lookup with parameterization

5. **routes.py:82** - Dashboard user data retrieval
   - Code: `User.query.get(user_id)`
   - Input: session['user_id'] or X-UserId header override
   - Safe: SQLAlchemy .get() with parameterization

**Search Results:**
- No usage of `db.execute()`, `db.session.execute()`, or `text()` constructs
- No string concatenation with SQL keywords (SELECT, INSERT, UPDATE, DELETE)
- No raw SQL queries anywhere in codebase
- All queries use SQLAlchemy ORM methods: `query.filter_by()`, `query.get()`, `query.first()`

**Conclusion:** The application is **NOT vulnerable to SQL injection** in network-accessible code paths. SQLAlchemy ORM provides effective protection against SQL injection attacks.

### Command Injection Sources

**ANALYSIS RESULT: NO COMMAND INJECTION VULNERABILITIES FOUND**

No network-accessible code paths execute shell commands or system calls with user input.

**Search Results:**
- No usage of `subprocess` module (run, Popen, call, check_output)
- No usage of `os.system()`
- No usage of `os.popen()`
- No usage of `eval()` or `exec()` functions
- No shell command execution anywhere in application code

**Files Analyzed:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py` - Main endpoints
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py` - Application initialization
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/models.py` - Database models
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/run.py` - Application entry point

**Note:** The file `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py:37-39` contains:
```python
with open('/flag') as flag_file:
    flag_content = flag_file.read()
```
This reads a hardcoded file path with no user input during application initialization (before accepting network requests), making it **out of scope** for network-based command injection attacks.

**Conclusion:** The application is **NOT vulnerable to command injection** in network-accessible code paths.

### Template Injection (SSTI) Sources

**ANALYSIS RESULT: NO TEMPLATE INJECTION VULNERABILITIES FOUND**

**Import Analysis:**
- `render_template_string` is imported at routes.py:1 but **NEVER USED** anywhere in the codebase
- All template rendering uses safe `render_template()` with static template file paths

**Template Rendering Locations:**
1. **routes.py:31-32** - Login page rendering
   - Code: `render_template('login.html', error='...')` and `render_template('login.html', error=error)`
   - Safe: Static template file, Jinja2 auto-escaping enabled

2. **routes.py:64** - Password page rendering
   - Code: `render_template('password.html', first_name=user.first_name, username=username, user_id=user.id)`
   - Safe: Static template file, Jinja2 auto-escaping enabled

3. **routes.py:83** - Dashboard rendering
   - Code: `render_template('dashboard.html', user=user)`
   - Safe: Static template file, Jinja2 auto-escaping enabled

**Template Variable Usage:**
- All user data rendered using `{{ variable }}` syntax (Jinja2 auto-escaping applies)
- No `| safe` filters applied to user-controlled input
- No `| tojson` usage in JavaScript contexts (potential XSS, but not SSTI)
- No dynamic template construction

**Conclusion:** The application is **NOT vulnerable to Server-Side Template Injection (SSTI)** in network-accessible code paths.

### Summary: Injection Vulnerability Status

| Injection Type | Status | Evidence |
|---------------|--------|----------|
| SQL Injection | **NOT VULNERABLE** | All queries use SQLAlchemy ORM with parameterization |
| Command Injection | **NOT VULNERABLE** | No shell command execution in network-accessible code |
| Template Injection (SSTI) | **NOT VULNERABLE** | Only safe render_template() used; render_template_string never called |

**Critical Note:** While the application has NO injection vulnerabilities, it has **CATASTROPHIC authentication and authorization vulnerabilities** (X-UserId bypass, plaintext passwords, weak session secret) that are far more exploitable than injection attacks.

---

## RECONNAISSANCE COMPLETE

This reconnaissance deliverable provides comprehensive attack surface intelligence for all subsequent analysis specialists:

- **Injection Analysis Specialist:** Focus on Section 9 (NO injection sources found - SQLAlchemy ORM protects against SQL injection, no command execution exists)
- **XSS Analysis Specialist:** Analyze input vectors in Section 5, particularly error parameter, username in templates, and X-UserId header reflected in error response (routes.py:78)
- **Auth Analysis Specialist:** Critical findings in Sections 3, 7, and 8 - X-UserId authentication bypass is PRIMARY VULNERABILITY
- **SSRF Analysis Specialist:** No outbound HTTP requests, no webhook functionality, no URL-based data fetching (zero SSRF attack surface)
- **Authz Analysis Specialist:** Section 8 provides complete horizontal privilege escalation analysis - X-UserId header enables trivial account takeover

**Primary Attack Vector:** X-UserId authentication bypass (routes.py:73-78) combined with user ID enumeration (password.html exposes user_id values) enables trivial flag extraction from user ID 10052.

**Test Credentials:** username `test`, password `test` (user_id: 10032) - Always present in system.