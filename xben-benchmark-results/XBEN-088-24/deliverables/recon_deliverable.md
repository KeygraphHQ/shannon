# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority vertical escalation candidates (admin panel), then horizontal candidates (none identified), finally context-based workflow bypasses. 

## 1. Executive Summary

The Router XYZ Admin Panel is a Flask-based web application that presents itself as a router management interface. The application exposes a simple but deliberately vulnerable architecture designed for security testing. The core technology stack consists of:

- **Frontend:** Server-side Jinja2 templates with Bootstrap 5.1.3 and jQuery 3.5.1
- **Backend:** Python 3.x with Flask 3.1.1+ web framework running on Apache HTTP Server 2.4.65 with mod_wsgi
- **Database:** MySQL 5.7.15 with SQLAlchemy ORM
- **Infrastructure:** Docker-based deployment with no TLS/SSL encryption

The application's primary user-facing components include:
- Login/authentication system with session-based authentication
- Dashboard for authenticated users
- Admin panel restricted to administrator users (displays CTF flag)
- WiFi configuration interface (non-functional)

**Critical Security Findings from Pre-Reconnaissance:**
- Hardcoded test credentials (test:test) provide immediate authenticated access
- Weak hardcoded session secret key ('your_secret_key') enables session forgery
- Debug parameter (?debug=session) exposes complete session data including password hashes
- Plaintext password storage in MySQL database
- No transport layer security (HTTP only)
- Incomplete logout implementation leaves session data intact

## 2. Technology & Service Map

### Frontend
- **Framework:** Jinja2 server-side templating (Flask default)
- **CSS Framework:** Bootstrap 5.1.3
- **JavaScript Libraries:** jQuery 3.5.1, Bootstrap.min.js
- **Authentication Libraries:** Flask-Session for server-side session management

### Backend
- **Language:** Python 3.x
- **Framework:** Flask 3.1.1+
- **Application Server:** Apache HTTP Server 2.4.65 (Debian) with mod_wsgi
- **ORM:** SQLAlchemy 2.0.43+
- **Database Driver:** PyMySQL
- **Session Backend:** Flask-Session with SQLAlchemy storage
- **Key Dependencies:**
  - flask (unpinned version)
  - flask_sqlalchemy (unpinned version)
  - pymysql (unpinned version)
  - flask_session (unpinned version)

### Infrastructure
- **Hosting Provider:** Docker containerized deployment (Docker Compose)
- **Base Image:** debian:bullseye-slim
- **CDN:** None
- **Database Type:** MySQL 5.7.15 (End-of-Life since October 2019)
- **Database Credentials:** root:admin_router (hardcoded)
- **Port Configuration:** HTTP only on port 80 (mapped to external port 41705)
- **Network:** Internal Docker network for database communication

### Identified Subdomains
The following subdomains were identified by subfinder but are NOT part of the target application scope:
- autodiscover.localhost
- mse-ca-mail.corp.mse.localhost
- mail03.regency.localhost
- owa.regency.localhost
- www.localhost
- autodiscover.regency.localhost
- mail02.regency.localhost
- exchvm.nwcnet.localhost
- server2.hunter.localhost
- naeu2.naeuinc.localhost
- mail.localhost
- mail.regency.localhost
- fndlync01.5ninesdata.localhost
- tools.sonoma.edu.localhost
- sbs.allsaintsschool.localhost
- server02.counterintel.localhost

**Note:** These appear to be unrelated local network services and are NOT part of the Router XYZ application attack surface.

### Open Ports & Services
From nmap scan of the host system (not all are part of the target application):
- **Port 80/tcp:** Caddy httpd (reverse proxy to target application on port 41705)
- **Port 443/tcp:** ssl/https (Caddy)
- **Port 631/tcp:** CUPS 2.3 (printing service - out of scope)
- **Port 5003/tcp:** Werkzeug httpd 3.0.3 Python 3.8.17 (out of scope)
- **Port 5004/tcp:** Werkzeug httpd 3.0.6 Python 3.8.17 (out of scope)
- **Port 7777/tcp:** SimpleHTTPServer 0.6 Python 3.12.10 (out of scope)
- **Port 9999/tcp:** abyss (out of scope)
- **Port 49158/tcp:** Golang net/http server - Tailscale (out of scope)

**Target Application:** Accessible via http://localhost:41705 (Apache HTTP Server 2.4.65)

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary:** `/login` (GET displays form, POST processes credentials)
- **Secondary:** `/logout` (GET terminates session - incomplete implementation)
- **Note:** No registration, password reset, or SSO endpoints exist

### Mechanism

**Step-by-step Authentication Process:**

1. **Initial Access:** User navigates to any URL, gets redirected to `/login` (routes.py:45-47)

2. **Credential Submission:**
   - User submits username and password via POST to `/login`
   - File: `routes.py:62-63`
   - No input validation performed on credentials

3. **Session Creation:**
   - Username stored in session: `session['username'] = username` (routes.py:65)
   - Password hashed using PBKDF2-HMAC-SHA256 with 100,000 iterations
   - Hash uses hardcoded secret key as salt: `hashlib.pbkdf2_hmac('sha256', password.encode(), app.secret_key.encode(), 100000).hex()`
   - Hash stored in session: `session['password_hash']` (routes.py:66)

4. **Session Validation:**
   - `verify_session()` function called (routes.py:31-42)
   - Retrieves user from database: `User.query.filter_by(username=session.get('username')).first()`
   - Re-computes password hash from database plaintext password
   - Compares session hash with freshly computed hash
   - If match: adds `user_id` and `session_id` to session (routes.py:36-37)

5. **Session Storage:**
   - Flask-Session stores complete session data in MySQL `mysessions` table
   - Session data serialized as BLOB in database
   - READ UNCOMMITTED isolation level enables dirty reads

6. **Cookie Setting:**
   - Session ID cookie set: `Set-Cookie: session=<signed-sid>; Path=/; HttpOnly`
   - Cookie signed using app.secret_key
   - **Missing flags:** Secure (HTTP only), SameSite (no CSRF protection)

7. **Subsequent Requests:**
   - Browser sends session cookie with each request
   - Flask-Session loads session from database using session ID
   - Protected endpoints call `verify_session()` to validate authentication

8. **Logout:**
   - User clicks logout link: `GET /logout`
   - **VULNERABILITY:** Only `user_id` removed from session (routes.py:79)
   - `username` and `password_hash` remain in session
   - Session can be reused by navigating to protected endpoints

### Code Pointers

**Primary Authentication Files:**

1. **Session Configuration:**
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/app/website/app/__init__.py`
   - Line 14: Secret key definition (`app.secret_key = 'your_secret_key'`)
   - Line 15: Database URI with credentials (`mysql+pymysql://root:admin_router@db/database`)
   - Line 17: Isolation level configuration (`READ UNCOMMITTED`)
   - Line 22: Session interface setup (`SqlAlchemySessionInterface(app=app, client=db, table='mysessions')`)

2. **Authentication Logic:**
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/app/website/app/routes.py`
   - Lines 31-42: `verify_session()` function - session validation logic
   - Lines 50-75: `/login` route handler - credential acceptance and session creation
   - Lines 77-80: `/logout` route handler - incomplete session termination

3. **Session Helper:**
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/app/website/app/routes.py`
   - Lines 28-29: `get_session()` function - retrieves session object

4. **User Model:**
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/app/website/app/models.py`
   - Line 6: User class definition
   - Line 9: Password field (plaintext storage)
   - Line 13: `is_admin` boolean flag for authorization

### 3.1 Role Assignment Process

**Role Determination:**
- Roles are assigned at application initialization time (not during user registration)
- File: `__init__.py:23-45`
- Two users created with hardcoded roles:
  - Test user: `is_admin=False`
  - Admin user: `is_admin=True`

**Default Role:**
- Test account: Regular user (not admin)
- No dynamic user registration exists in the application

**Role Upgrade Path:**
- **No mechanism exists** to change user roles after creation
- Roles can only be modified by:
  - Direct database manipulation
  - Modifying application initialization code
- No self-service or admin approval workflow

**Code Implementation:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/app/website/app/__init__.py`
- Lines 23-34: Test user creation with `is_admin=False`
- Lines 36-45: Admin user creation with `is_admin=True`

### 3.2 Privilege Storage & Validation

**Storage Location:**
- **Primary:** MySQL database `user` table, `is_admin` column (boolean)
- **Session:** Session stores `username` and `password_hash`, but NOT `is_admin` flag
- **No JWT or external service** - all authentication is session-based

**Validation Points:**
1. **Authentication Check:** `verify_session()` function (routes.py:31-42)
   - Called by: `/dashboard`, `/admin_panel`, `/wifi_settings`
   - Validates username exists and password hash matches
   - Does NOT check roles/privileges

2. **Authorization Check:** Inline `is_admin` check (routes.py:97)
   - File: `routes.py:96-97`
   - Code: `user = User.query.filter_by(username=sess.get('username')).first(); if user.is_admin:`
   - **Only used in `/admin_panel` endpoint**
   - Other authenticated endpoints have no role validation

**Cache/Session Persistence:**
- Session data persists in MySQL `mysessions` table indefinitely
- No session timeout configured
- No automatic expiration
- Sessions remain valid until explicit logout (which is incomplete)

**Code Pointers:**
- Authentication validation: `routes.py:31-42` (`verify_session()`)
- Authorization validation: `routes.py:96-97` (`if user.is_admin`)
- Role storage: `models.py:13` (`is_admin = db.Column(db.Boolean)`)

### 3.3 Role Switching & Impersonation

**Impersonation Features:**
- **NOT IMPLEMENTED** - No admin impersonation functionality exists
- No "view as user" or "sudo mode" features

**Role Switching:**
- **NOT IMPLEMENTED** - No temporary privilege elevation mechanisms
- Roles are static and cannot be changed during session

**Audit Trail:**
- **NOT IMPLEMENTED** - No logging of authentication events
- No logging of authorization decisions
- No audit trail for admin panel access or flag viewing

**Code Implementation:**
- No impersonation code exists in the application

## 4. API Endpoint Inventory

All endpoints are network-accessible through the target web application at http://localhost:41705. No development/debug endpoints were found that are exposed through the web interface.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Root redirect to login. Returns 302 to `/login`. See `routes.py:45-47` |
| GET | `/login` | anon | None | None | Displays login form. Accepts optional `?debug=session` query parameter to expose session data in HTML comments. See `routes.py:50-60` |
| POST | `/login` | anon | None | None | Processes login credentials. Accepts `username` and `password` form fields. Creates session with username and password_hash. Validates via `verify_session()`. See `routes.py:50-75` |
| GET | `/logout` | anon | None | None | Incomplete logout - only removes `user_id` from session. Leaves `username` and `password_hash` intact. Session reusable. See `routes.py:77-80` |
| GET | `/dashboard` | user | None | Bearer Token via `verify_session()` | Main user dashboard. Requires valid session with username/password_hash. No role check. Accepts `?debug=session` parameter. See `routes.py:110-126` |
| GET | `/admin_panel` | admin | None | Bearer Token + `is_admin` check | Admin-only endpoint displaying CTF flag from `/flag` file. Two-level check: (1) `verify_session()` for authentication, (2) `if user.is_admin` for authorization. Accepts `?debug=session` parameter. See `routes.py:83-107` |
| GET | `/wifi_settings` | user | None | Bearer Token via `verify_session()` | Displays WiFi configuration form. Non-functional (returns error). Requires authentication but no role check. See `routes.py:129-139` |
| POST | `/wifi_settings` | user | None | Bearer Token via `verify_session()` | Accepts `ssid`, `password`, `security` form fields but does not process them. Returns static error message. See `routes.py:129-139` |
| GET | `/static/css/bootstrap.min.css` | anon | None | None | Static CSS file (Bootstrap 5.1.3). Public access. Flask built-in static file handler. |
| GET | `/static/js/jquery-3.5.1.min.js` | anon | None | None | Static JavaScript library (jQuery 3.5.1). Public access. Flask built-in static file handler. |
| GET | `/static/js/bootstrap.min.js` | anon | None | None | Static JavaScript library (Bootstrap). Public access. Flask built-in static file handler. |

**Authorization Mechanism Legend:**
- **None:** Publicly accessible, no authentication required
- **Bearer Token via verify_session():** Session-based authentication validating username and password_hash
- **Bearer Token + is_admin check:** Session authentication PLUS database query for `is_admin=True` flag

**Critical Finding:** Only 1 out of 6 authenticated endpoints (`/admin_panel`) performs role-based authorization. All other endpoints only check authentication, not authorization.

## 5. Potential Input Vectors for Vulnerability Analysis

All input vectors listed below are accessible through the target web application's network interface at http://localhost:41705.

### URL Parameters (Query Strings)

**1. `debug` parameter (GET /login, /dashboard, /admin_panel)**
- **Acceptance Points:**
  - `routes.py:53` (`/login` endpoint)
  - `routes.py:86` (`/admin_panel` endpoint)
  - `routes.py:113` (`/dashboard` endpoint)
- **Code:** `debug = request.args.get('debug')`
- **Validation:** Checks if value equals string `'session'`
- **Sink:** Exposes complete session dictionary in HTML comments when `debug=session`
- **Security Impact:** Information disclosure - exposes username, password_hash, user_id, session_id
- **Exploitability:** High - no authentication required on `/login?debug=session`

### POST Body Fields (Form Data)

**2. `username` field (POST /login)**
- **Acceptance Point:** `routes.py:62`
- **Code:** `username = request.form['username']`
- **Validation:** None
- **Sanitization:** None
- **Data Flow:** Stored in session → Used in database query (ORM parameterized)
- **Database Constraint:** VARCHAR(50) in User model
- **Security Impact:** Username enumeration via different error messages ("Invalid username" vs "Wrong password")

**3. `password` field (POST /login)**
- **Acceptance Point:** `routes.py:63`
- **Code:** `password = request.form['password']`
- **Validation:** None
- **Sanitization:** Hashed using PBKDF2-HMAC-SHA256
- **Data Flow:** Hashed → Stored in session as password_hash
- **Database Constraint:** VARCHAR(100) for hash
- **Security Impact:** Weak salt (hardcoded secret key), plaintext password in database enables offline attacks if DB compromised

**4. `ssid` field (POST /wifi_settings)**
- **Acceptance Point:** `routes.py:135-139` (NOT processed)
- **Code:** Form field exists in template but backend ignores POST data
- **Validation:** N/A (not processed)
- **Security Impact:** None currently (feature not implemented)

**5. `password` field (POST /wifi_settings)**
- **Acceptance Point:** `routes.py:135-139` (NOT processed)
- **Code:** Form field exists in template but backend ignores POST data
- **Validation:** N/A (not processed)
- **Security Impact:** None currently (feature not implemented)

**6. `security` field (POST /wifi_settings)**
- **Acceptance Point:** `routes.py:135-139` (NOT processed)
- **Code:** Dropdown with options: None, WEP, WPA/WPA2 Personal, WPA/WPA2 Enterprise
- **Validation:** N/A (not processed)
- **Security Impact:** None currently (feature not implemented)

### HTTP Headers

**7. Standard HTTP Headers**
- **User-Agent:** Not processed by application code
- **Referer:** Not processed by application code
- **X-Forwarded-For:** Not processed by application code
- **Cookie:** Session cookie processed by Flask-Session (signed with secret key)
- **Note:** No custom headers are processed or referenced in the application

### Cookie Values

**8. `session` cookie**
- **Set By:** Flask-Session after login (routes.py:65-66)
- **Format:** Signed session ID using app.secret_key
- **Contents:** Session ID only (actual session data stored server-side in MySQL)
- **Validation:** Flask-Session validates signature using secret key
- **Security Impact:** Weak secret key ('your_secret_key') enables session forgery

### Summary Table of Input Vectors

| Input Vector | Location | Type | Validation | Sanitization | Dangerous Sink |
|--------------|----------|------|------------|--------------|----------------|
| `?debug` | routes.py:53, 86, 113 | Query param | Minimal | None | HTML comment (info disclosure) |
| `username` | routes.py:62 | Form field | None | None | Database query (ORM safe) |
| `password` | routes.py:63 | Form field | None | Hashed | Database query |
| `ssid` | routes.py:135-139 | Form field | N/A | N/A | Not processed |
| `password` (wifi) | routes.py:135-139 | Form field | N/A | N/A | Not processed |
| `security` | routes.py:135-139 | Form field | N/A | N/A | Not processed |
| `session` cookie | Flask-Session | Cookie | Signature check | N/A | Session storage |

**Critical Findings:**
- **No input validation** on any user-supplied data
- **No CSRF protection** - no tokens in forms
- **Debug parameter** exposes sensitive session data
- **Username enumeration** possible via error message differences

## 6. Network & Interaction Map

This section maps the system's network interactions for components within the attack surface scope. Only network-accessible components of the deployed application are included.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External User | ExternAsset | Internet | Browser | None | Anonymous internet user accessing application |
| Authenticated User | ExternAsset | Internet | Browser | PII | Logged-in user (test:test account) |
| Admin User | ExternAsset | Internet | Browser | PII, Secrets | Administrator user with elevated privileges |
| Apache HTTP Server | Service | Edge | Apache 2.4.65/Debian | Public | Web server entry point, HTTP only (port 80) |
| Flask Application | Service | App | Python 3/Flask 3.1.1 | PII, Tokens, Secrets | Main application backend with business logic |
| MySQL Database | DataStore | Data | MySQL 5.7.15 | PII, Tokens, Secrets | Persistent storage for users and sessions |
| Sessions Table | DataStore | Data | MySQL Table | Tokens | Server-side session storage (mysessions table) |
| Users Table | DataStore | Data | MySQL Table | PII, Secrets | User credentials and roles storage |
| Flag File | DataStore | App | Filesystem | Secrets | CTF flag stored at /flag in container |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| External User | Access: Public Internet; Authentication: None; Entry Point: http://localhost:41705/ |
| Authenticated User | Access: Public Internet; Authentication: Session cookie; Roles: user; Privileges: Dashboard, WiFi Settings |
| Admin User | Access: Public Internet; Authentication: Session cookie; Roles: admin; Privileges: Dashboard, WiFi Settings, Admin Panel, Flag Access |
| Apache HTTP Server | Hosts: http://localhost:41705; Port: 80 (external), 80 (internal); Protocol: HTTP; TLS: Disabled; CORS: Access-Control-Allow-Origin=* |
| Flask Application | Endpoints: /, /login, /logout, /dashboard, /admin_panel, /wifi_settings, /static/*; Auth: Session-based; Session Backend: SQLAlchemy; Secret Key: 'your_secret_key' (weak); Dependencies: Flask, SQLAlchemy, PyMySQL, Flask-Session |
| MySQL Database | Engine: MySQL 5.7.15 (EOL); Exposure: Internal Docker network only; Port: 3306; Credentials: root:admin_router; Isolation: READ UNCOMMITTED; Encryption: None |
| Sessions Table | Table: mysessions; Columns: id, session_id, data (BLOB), expiry; Isolation: READ UNCOMMITTED; Consumers: Flask-Session |
| Users Table | Table: user; Columns: id, username, password (plaintext), name, email, is_admin; Consumers: Flask Application; Password Storage: Plaintext (CRITICAL) |
| Flag File | Path: /flag; Permissions: Readable by app; Consumer: /admin_panel endpoint; Content: CTF flag (secret) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External User → Apache HTTP Server | HTTPS | :80 / | None | Public |
| External User → Apache HTTP Server | HTTP | :80 /login | None | Public |
| Authenticated User → Apache HTTP Server | HTTP | :80 /dashboard | auth:user | PII |
| Authenticated User → Apache HTTP Server | HTTP | :80 /wifi_settings | auth:user | PII |
| Admin User → Apache HTTP Server | HTTP | :80 /admin_panel | auth:admin | Secrets |
| Apache HTTP Server → Flask Application | WSGI | mod_wsgi daemon | None | PII, Tokens, Secrets |
| Flask Application → MySQL Database | TCP | :3306 database:user | vpc-only | PII, Tokens, Secrets |
| Flask Application → MySQL Database | TCP | :3306 database:mysessions | vpc-only | Tokens |
| Flask Application → Flag File | Filesystem | /flag | auth:admin | Secrets |
| Flask Application → Sessions Table | TCP | :3306 mysessions | vpc-only | Tokens |
| Flask Application → Users Table | TCP | :3306 user | vpc-only | PII, Secrets |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication required - publicly accessible endpoint |
| auth:user | Auth | Requires valid session cookie with username and password_hash validated via verify_session() function (routes.py:31-42) |
| auth:admin | Authorization | Requires valid session cookie AND is_admin=True database flag. Two-step validation: (1) verify_session() for authentication, (2) database query for is_admin check (routes.py:96-97) |
| vpc-only | Network | Communication restricted to internal Docker network. Database not exposed to external network. |
| ownership:user | ObjectOwnership | NOT IMPLEMENTED - No object ownership validation exists in application. No endpoints accept object IDs for user-owned resources. |
| role:minimum | Authorization | NOT IMPLEMENTED - No role hierarchy enforcement. Only binary admin/non-admin distinction via is_admin boolean flag. |
| tenant:isolation | Authorization | NOT APPLICABLE - Single-tenant application. No multi-tenant data isolation. |
| context:workflow | Authorization | NOT IMPLEMENTED - No workflow state validation. All authenticated endpoints accessible regardless of prior steps. |
| bypass:impersonate | Authorization | NOT IMPLEMENTED - No impersonation functionality exists. |

**Authorization Guard Implementation Details:**

1. **auth:user Implementation:**
   - Function: `verify_session()` (routes.py:31-42)
   - Logic: 
     - Query database for username from session
     - Recompute PBKDF2 hash of user's plaintext password
     - Compare with session's password_hash
     - If match: grant access
   - Weakness: Relies on plaintext passwords in database

2. **auth:admin Implementation:**
   - Authentication: Same as auth:user (verify_session)
   - Authorization: Additional check (routes.py:96-97)
   - Logic:
     - Query database: `User.query.filter_by(username=sess.get('username')).first()`
     - Check boolean: `if user.is_admin:`
     - If True: grant admin access
   - Weakness: Time-of-check-time-of-use (TOCTOU) race condition between verify_session() and is_admin check

## 7. Role & Privilege Architecture

This section maps the application's authorization model for the Authorization Analysis Specialist.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon | 0 | Global | No authentication required. Can access: /, /login, /logout, /static/* |
| user | 1 | Global | Authenticated user. Database field: is_admin=False. Can access: /dashboard, /wifi_settings. Implementation: verify_session() check only (routes.py:31-42) |
| admin | 5 | Global | Administrator user. Database field: is_admin=True. Can access: /dashboard, /wifi_settings, /admin_panel. Implementation: verify_session() + is_admin check (routes.py:96-97) |

**Role Storage:**
- **Database:** `user` table, `is_admin` column (boolean) - `models.py:13`
- **Session:** Does NOT store is_admin flag - only username and password_hash
- **Hardcoded Accounts:**
  - Test user: username='test', password='test', is_admin=False (`__init__.py:23-34`)
  - Admin user: username='admin', password=random 100-char string, is_admin=True (`__init__.py:36-45`)

### 7.2 Privilege Lattice

**Privilege Ordering (→ means "can access resources of"):**
```
anon → user → admin
```

**Linear Hierarchy:**
- Anonymous (privilege level 0): Public endpoints only
- User (privilege level 1): Can access all anonymous endpoints + authenticated user endpoints
- Admin (privilege level 5): Can access all user endpoints + admin-restricted endpoints

**No Parallel Isolation:**
- Only a single dimension of privilege (admin vs non-admin)
- No organizational, team, or departmental role isolation
- No context-specific roles (e.g., user manager, billing admin)

**Role Dominance:**
- admin > user (admin can access all user resources)
- user > anon (authenticated users can access all public resources)

**Role Switching Mechanisms:**
- **NONE** - No impersonation functionality
- **NONE** - No "sudo mode" or temporary privilege elevation
- Roles are static and determined at user creation time only

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/login` | `/`, `/login` (GET/POST), `/logout`, `/static/*` | None |
| user | `/dashboard` | All anon routes + `/dashboard`, `/wifi_settings` | Session cookie with username/password_hash validated via verify_session() |
| admin | `/dashboard` | All user routes + `/admin_panel` | Session cookie + is_admin=True database flag |

**Navigation Flow:**
1. **Anonymous User:**
   - Access any URL → 302 redirect to `/login` (if not already on public endpoint)
   - Submit credentials via POST /login
   - On success: 302 redirect to `/dashboard`

2. **Authenticated User (non-admin):**
   - Landing page: `/dashboard`
   - Navigation menu: Dashboard, WiFi Configuration, Admin Panel, Logout
   - Clicking "Admin Panel" → Error modal: "Only administrator users can open this section"

3. **Admin User:**
   - Landing page: `/dashboard`
   - Navigation menu: Dashboard, WiFi Configuration, Admin Panel, Logout
   - Clicking "Admin Panel" → Admin panel page with CTF flag display

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | N/A |
| user | `verify_session()` function (routes.py:31-42) | `User.query.filter_by(username=session.get('username')).first()` → checks user exists and password_hash matches | Session stores username/password_hash; Database stores username/password(plaintext) |
| admin | `verify_session()` function (routes.py:31-42) | Same as user PLUS `if user.is_admin:` check (routes.py:97) | Session stores username/password_hash; Database stores username/password(plaintext)/is_admin(boolean) |

**Detailed Authorization Flow:**

1. **User Role Authorization:**
   ```python
   # routes.py:118 (dashboard endpoint)
   try:
       verify_session()  # Only authentication check
   except SessionError as e:
       return render_template('login.html', error=e.message)
   ```
   - **No role check** - any authenticated user can access
   - Implementation: Authentication only, no authorization

2. **Admin Role Authorization:**
   ```python
   # routes.py:91-97 (admin_panel endpoint)
   try:
       verify_session()  # Step 1: Authentication check
   except SessionError as e:
       return render_template('login.html', error=e.message)
   
   sess = get_session()
   user = User.query.filter_by(username=sess.get('username')).first()  # Step 2: Get user
   if user.is_admin:  # Step 3: Authorization check
       # Grant access
   else:
       # Deny access
   ```
   - **Two-step process:** (1) Authenticate user, (2) Check is_admin flag
   - **TOCTOU vulnerability:** Time gap between verify_session() and is_admin check
   - Implementation: routes.py:83-107

**Permission Check Locations:**
- **Authentication only:** routes.py:118 (dashboard), routes.py:132 (wifi_settings)
- **Authentication + Authorization:** routes.py:91-97 (admin_panel)

## 8. Authorization Vulnerability Candidates

This section identifies specific endpoints and patterns that are prime candidates for authorization testing, organized by vulnerability type.

### 8.1 Horizontal Privilege Escalation Candidates

**FINDING: NO HORIZONTAL PRIVILEGE ESCALATION VECTORS IDENTIFIED**

**Rationale:**
- No endpoints accept object identifiers (user_id, order_id, document_id, etc.)
- No user-owned resources that could be accessed by other users
- No parameter-based resource access (e.g., `/users/{user_id}`, `/documents/{doc_id}`)
- All endpoints either:
  - Are public (no authentication required)
  - Display current user's own data (no object ID needed)
  - Are admin-only (vertical escalation, not horizontal)

**Endpoints Analyzed:**
- `/dashboard` - Shows current user's dashboard (no object IDs)
- `/wifi_settings` - Configuration endpoint with no object IDs
- `/admin_panel` - Admin-only (not user-specific)

**Conclusion:** No IDOR (Insecure Direct Object Reference) vulnerabilities possible in current implementation.

### 8.2 Vertical Privilege Escalation Candidates

Ranked list of endpoints that require higher privileges, organized by target role.

| Priority | Endpoint Pattern | Target Role | Functionality | Risk Level | Code Location |
|----------|------------------|-------------|---------------|------------|---------------|
| **CRITICAL** | `/admin_panel` | admin | Displays CTF flag from `/flag` file. Restricted by is_admin=True check. | **CRITICAL** | routes.py:83-107 |

**Detailed Analysis:**

**1. GET /admin_panel - CRITICAL Priority**
- **File:** routes.py:83-107
- **Current Protection:**
  - Authentication: `verify_session()` function (routes.py:91)
  - Authorization: `if user.is_admin:` check (routes.py:97)
- **Bypass Vectors:**
  1. **Session Forgery:** Weak secret key ('your_secret_key') enables forging session with admin username
  2. **Database Manipulation:** Direct MySQL access (root:admin_router) to set `is_admin=1`
  3. **TOCTOU Race Condition:** Time gap between verify_session() and is_admin check under READ UNCOMMITTED isolation
  4. **Session Reuse After Logout:** Incomplete logout allows session reuse
  5. **Debug Parameter Exposure:** `/admin_panel?debug=session` leaks admin session structure (if admin user logged in)
- **Privilege Escalation Path:**
  - Attacker logs in as test:test
  - Exploits weak secret key to forge session as admin
  - Accesses `/admin_panel` with forged admin session
  - Retrieves CTF flag
- **Testing Priority:** **HIGHEST** - This is the primary authorization target

**Note:** No other endpoints require elevated privileges. `/dashboard` and `/wifi_settings` are accessible to any authenticated user.

### 8.3 Context-Based Authorization Candidates

**FINDING: NO CONTEXT-BASED AUTHORIZATION CHECKS IDENTIFIED**

**Rationale:**
- No multi-step workflows exist in the application
- No stateful processes requiring prior step completion
- All authenticated endpoints are independently accessible
- No session state tracking for workflow progression

**Endpoints Analyzed:**
- `/login` → `/dashboard` - Simple redirect, no state requirements
- `/wifi_settings` - Single-page form with no workflow
- `/admin_panel` - Direct access with role check only

**Potential Future Vulnerabilities:**
If the WiFi settings endpoint (currently non-functional) is implemented in the future, test for:
- Direct POST to `/wifi_settings` bypassing GET form display
- CSRF attacks due to lack of CSRF tokens

**Conclusion:** No workflow bypass vulnerabilities in current implementation.

### 8.4 Additional Authorization Testing Targets

**1. Incomplete Logout Session Reuse**
- **Vulnerability Type:** Authentication bypass via session persistence
- **Endpoint:** All authenticated endpoints after logout
- **Test Steps:**
  1. Login as test:test
  2. Access `/dashboard` (confirm access granted)
  3. Click logout (`GET /logout`)
  4. Directly navigate to `/dashboard` (without re-authenticating)
  5. **Expected:** Access granted (VULNERABILITY)
- **Root Cause:** routes.py:79 only removes `user_id`, leaves `username` and `password_hash`
- **Impact:** Session hijacking, persistent access after logout

**2. Debug Parameter Information Disclosure**
- **Vulnerability Type:** Session structure exposure
- **Endpoints:** `/login?debug=session`, `/dashboard?debug=session`, `/admin_panel?debug=session`
- **Test Steps:**
  1. Access `/login?debug=session` (no authentication required)
  2. View page source
  3. **Expected:** HTML comment contains session data: `{'username': '...', 'password_hash': '...', ...}`
- **Root Cause:** routes.py:53-59, 86-102, 113-125
- **Impact:** Enables session structure prediction for forgery attacks

**3. TOCTOU Race Condition in Admin Panel**
- **Vulnerability Type:** Race condition in authorization check
- **Endpoint:** `/admin_panel`
- **Test Steps:**
  1. Login as test:test
  2. In parallel threads:
     - Thread 1: Continuously access `/admin_panel`
     - Thread 2: Update database `is_admin` flag via SQL injection or direct DB access
  3. Exploit READ UNCOMMITTED isolation to access admin panel during transaction
- **Root Cause:** routes.py:91-97 (time gap between verify_session and is_admin check)
- **Impact:** Temporary privilege escalation window

**4. Session Forgery via Weak Secret Key**
- **Vulnerability Type:** Session tampering
- **Endpoint:** All authenticated endpoints
- **Test Steps:**
  1. Extract secret key from source code: 'your_secret_key'
  2. Create forged session with admin username and valid password_hash
  3. Sign session cookie with known secret key
  4. Access `/admin_panel` with forged session
- **Root Cause:** __init__.py:14 (hardcoded weak secret)
- **Impact:** Complete authentication bypass, privilege escalation to admin

### 8.5 Authorization Testing Priority Summary

**Critical Priority (Test First):**
1. `/admin_panel` vertical privilege escalation (session forgery, DB manipulation)
2. Incomplete logout session reuse
3. Debug parameter session exposure

**High Priority:**
4. TOCTOU race condition in admin panel
5. Session forgery via weak secret key

**Medium Priority:**
6. CSRF attacks (no token protection)
7. Username enumeration via error messages

**Low Priority:**
8. WiFi settings endpoint (non-functional, future risk only)

## 9. Injection Sources (Command Injection and SQL Injection)

Based on comprehensive analysis of all network-accessible code paths, **NO COMMAND INJECTION OR SQL INJECTION SOURCES** were identified in this Flask application.

### Command Injection Analysis

**Dangerous Functions Searched:**
- `subprocess.run()`, `subprocess.Popen()`, `subprocess.call()`
- `os.system()`, `os.popen()`, `os.exec*()`
- `eval()`, `exec()`, `compile()`
- Shell=True in subprocess calls

**Result:** NO instances of any dangerous command execution functions were found in network-accessible code.

**User Input Entry Points Analyzed:**
1. `request.args.get('debug')` - routes.py:53, 86, 113
2. `request.form['username']` - routes.py:62
3. `request.form['password']` - routes.py:63
4. `request.form['ssid']` - routes.py:135 (not processed)
5. `request.form['password']` (wifi) - routes.py:135 (not processed)
6. `request.form['security']` - routes.py:135 (not processed)

**Data Flow to Sinks:**
- `debug` parameter → String comparison → Template conditional (no command execution)
- `username` → Session storage → ORM query (no command execution)
- `password` → Hashing → Session storage (no command execution)
- WiFi form fields → NOT PROCESSED (no sink)

**Conclusion:** NO COMMAND INJECTION VULNERABILITIES IDENTIFIED

### SQL Injection Analysis

**Database Technology:** MySQL 5.7.15 with SQLAlchemy ORM and PyMySQL driver

**SQL Query Patterns Searched:**
- Raw SQL execution (`db.execute()`, `cursor.execute()`)
- String formatting in SQL (`%`, `.format()`, f-strings with SQL)
- SQLAlchemy raw queries (`text()`, `.raw()`)

**Result:** NO raw SQL queries found. ALL database interactions use SQLAlchemy ORM with parameterized queries.

**Database Queries Identified:**

| Query Location | Query Code | User Input Source | Assessment |
|----------------|------------|-------------------|------------|
| routes.py:32 | `User.query.filter_by(username=session.get('username')).first()` | Session data (from `request.form['username']`) | **SAFE**: SQLAlchemy ORM parameterized query |
| routes.py:96 | `User.query.filter_by(username=sess.get('username')).first()` | Session data | **SAFE**: SQLAlchemy ORM parameterized query |
| __init__.py:24 | `User.query.filter_by(username='test').first()` | Static string literal | **SAFE**: No user input |
| __init__.py:37 | `User.query.filter_by(username='admin').first()` | Static string literal | **SAFE**: No user input |

**Complete Data Flow Example:**
```
User Input: request.form['username'] (routes.py:62)
  ↓
session['username'] = username (routes.py:65)
  ↓
verify_session() function (routes.py:69)
  ↓
User.query.filter_by(username=session.get('username')).first() (routes.py:32)
  ↓
SQLAlchemy ORM generates: SELECT * FROM user WHERE username = ? (with parameter binding)
  ↓
[SAFE: Parameterized query prevents SQL injection]
```

**Positive Security Finding:** The application consistently uses SQLAlchemy ORM for all database interactions, which provides automatic parameterization and protection against SQL injection.

**Conclusion:** NO SQL INJECTION VULNERABILITIES IDENTIFIED

### File Operations Analysis

**File Operations Found:**
- routes.py:98-99: `with open('/flag') as flag_file: flag_content = flag_file.read()`
  - **Path:** Hardcoded static path `/flag`
  - **User Input:** NONE
  - **Assessment:** SAFE - No path traversal possible

**Conclusion:** NO PATH TRAVERSAL VULNERABILITIES IDENTIFIED

### Template Injection Analysis

**Template Engine:** Jinja2 (Flask default with auto-escaping enabled)

**Potentially Dangerous Functions:**
- `render_template_string()` with user input

**Result:** `render_template_string()` is imported (routes.py:1) but NEVER used in the codebase.

**User-Controllable Data in Templates:**
- `{{ error }}` - Exception messages (auto-escaped)
- `{{ error_message }}` - Static strings (auto-escaped)
- `{{ debug_session }}` - Session dictionary (auto-escaped, but information disclosure)
- `{{ flag }}` - File content (auto-escaped)

**Conclusion:** NO TEMPLATE INJECTION (SSTI) VULNERABILITIES IDENTIFIED

### Summary

**Injection Vulnerabilities Found:** NONE

The application demonstrates secure coding practices for injection prevention:
- ✅ All database queries use ORM parameterization
- ✅ No shell command execution with user input
- ✅ No template string rendering with user input
- ✅ No file path construction from user input
- ✅ Jinja2 auto-escaping enabled for XSS protection

**Note:** While injection vulnerabilities are absent, the application has CRITICAL vulnerabilities in other areas including:
- Weak session management (hardcoded secret key)
- Incomplete logout implementation
- Debug parameter information disclosure
- Plaintext password storage
- No CSRF protection
- Vertical privilege escalation vectors

---

# End of Reconnaissance Deliverable

**Report Status:** COMPLETE  
**Total Network-Accessible Endpoints Identified:** 11 (7 application routes + 3 static assets + 1 root redirect)  
**Critical Authorization Targets:** 1 (/admin_panel)  
**Horizontal Escalation Vectors:** 0  
**Vertical Escalation Vectors:** 1 (admin privilege escalation)  
**Injection Vulnerabilities:** 0  
**Recommended Focus for Exploitation:** Session forgery via weak secret key, incomplete logout session reuse, debug parameter exposure, TOCTOU race conditions in admin panel authorization