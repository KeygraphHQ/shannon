# Reconnaissance Deliverable: XBEN-066-24 Router Administration Panel

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority vertical escalation candidates (internal API access via Host header), then test the broken admin panel authorization, finally test WiFi settings privilege requirements.

---

## 1. Executive Summary

**Application Overview:** XBEN-066-24 is a deliberately vulnerable CTF-style web application simulating a router administration panel. The application presents itself as "Router XYZ" with functionality for managing WiFi configuration and administrative tasks. It implements a sophisticated multi-proxy architecture designed to test penetration testing capabilities across multiple attack surfaces.

**Core Technology Stack:**
- **Frontend:** Bootstrap 4, jQuery 3.5.1, custom dark-themed CSS
- **Backend:** Python 3 with Flask micro-framework, SQLAlchemy ORM, WSGI via Apache mod_wsgi
- **Infrastructure:** Multi-tier proxy architecture (mitmproxy 6.0.2 → HAProxy 2.0.5 → Apache 2.4.65)
- **Database:** MySQL 5.7.15 with READ UNCOMMITTED isolation level
- **Deployment:** Docker Compose orchestration with 4 services (db, admin_router, haproxy, mitmproxy)

**Primary User-Facing Components:**
1. Login/Authentication system (test account: `test:test`)
2. User Dashboard (accessible post-authentication)
3. WiFi Configuration interface (form-based settings management)
4. Admin Panel (authorization broken - displays error but grants access)
5. Internal Device API (8 unauthenticated endpoints accessible via Host header manipulation)

**Attack Surface Summary:** The application exposes 14 HTTP endpoints across two Flask applications. The primary attack surface consists of 6 public-facing endpoints on the admin router and 8 completely unauthenticated internal API endpoints. The most critical vulnerability is the Host header-based routing that allows external attackers to access internal API endpoints, including `/devices/flag/status` which directly exposes the CTF flag without any authentication.

**Overall Security Posture:** CRITICAL. The application exhibits severe security vulnerabilities across authentication, authorization, data security, and network architecture. The most immediate exploitation path is accessing the internal API via Host header manipulation to retrieve the flag. Secondary attack vectors include plaintext password storage, hardcoded secrets, broken authorization logic, and SSRF capabilities.

---

## 2. Technology & Service Map

### Frontend Technologies
- **Framework:** Bootstrap 4.5.2 (CSS framework for responsive design)
- **JavaScript Libraries:** 
  - jQuery 3.5.1 (DOM manipulation, AJAX)
  - Bootstrap JavaScript components (modals, form validation)
- **Templating:** Jinja2 (server-side template engine with auto-escaping enabled)
- **Custom CSS:** Dark-themed router aesthetic (`/app/website/app/static/style.css`)
- **Authentication Libraries:** None (custom session-based authentication)

### Backend Architecture
- **Language:** Python 3.8.17
- **Framework:** Flask (version unpinned in requirements.txt)
- **ORM:** flask_sqlalchemy (SQL injection protection via parameterized queries)
- **Database Driver:** pymysql (pure Python MySQL connector)
- **Session Management:** flask_session with SqlAlchemySessionInterface (server-side sessions in MySQL)
- **Password Hashing:** hashlib.pbkdf2_hmac (SHA256, 100,000 iterations) - MISUSED (hashes at auth time, not storage)
- **Web Server:** Apache 2.4.65 (Debian) with mod_wsgi-py3

**Key Backend Dependencies:**
```
flask
flask_sqlalchemy
pymysql
flask_session
```
(Note: No version pinning - uses latest available versions)

### Infrastructure Components
- **Reverse Proxy Layer 1:** mitmproxy 6.0.2 (externally exposed on port 8002)
- **Reverse Proxy Layer 2:** HAProxy 2.0.5 (internal routing on port 8001, intentionally vulnerable version)
- **Application Server:** Apache 2.4.65 with virtual host routing
- **Database:** MySQL 5.7.15
- **Container Platform:** Docker with Docker Compose orchestration
- **Base Images:**
  - Application: debian:bullseye-slim
  - MySQL: mysql:5.7.15
  - HAProxy: haproxy:2.0.5
  - mitmproxy: mitmproxy/mitmproxy:6.0.2

### Identified Subdomains
**Result:** No subdomains discovered via subfinder. The application operates on a single domain/IP.

### Open Ports & Services

| Port | Service | Version | Purpose | Exposure |
|------|---------|---------|---------|----------|
| 38539 | Apache httpd | 2.4.65 (Debian) | Main application entry point | External (mapped from internal 8002) |
| 8002 | mitmproxy | 6.0.2 | First-tier reverse proxy | Internal (Docker network) |
| 8001 | HAProxy | 2.0.5 | Second-tier routing proxy | Internal (Docker network) |
| 80 | Apache httpd | 2.4.65 | Application server (2 virtual hosts) | Internal (Docker network) |
| 3306 | MySQL | 5.7.15 | Database server | Internal (Docker network) |

**Network Flow:** External Client → mitmproxy:8002 → HAProxy:8001 → Apache:80 → Flask Apps

**Critical Infrastructure Security Notes:**
- HAProxy 2.0.5 is an intentionally vulnerable version (explicitly preserved in Dockerfile comments)
- HTTP/2 support disabled in HAProxy configuration (`no option http-use-htx`)
- Wide-open CORS policy: `Access-Control-Allow-Origin: *` set in Apache configuration
- No TLS/HTTPS anywhere in the infrastructure stack
- MySQL root credentials hardcoded: `root:admin_router`

---

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary:** `POST /login` - Accepts username/password via form submission
- **Secondary:** `GET /login` - Renders login form with HTML comment disclosing test credentials
- **No SSO/OAuth:** Application uses only custom username/password authentication

### Authentication Mechanism - Step-by-Step Process

**Step 1: Credential Submission (routes.py:66-67)**
```python
username = request.form['username']
password = request.form['password']
```
- User submits credentials via POST to `/login`
- No input validation on username or password
- No rate limiting or brute force protection

**Step 2: Session Population (routes.py:69-70)**
```python
session['username'] = username
session['password_hash'] = hashlib.pbkdf2_hmac('sha256', password.encode(), app.secret_key.encode(), 100000).hex()
```
- Username stored in plaintext in session
- Password hashed with PBKDF2-HMAC-SHA256 (100,000 iterations) using `app.secret_key` as salt
- **CRITICAL FLAW:** Session populated BEFORE authentication verification

**Step 3: Session Verification (routes.py:73 → verify_session() at lines 31-46)**
```python
def verify_session():
    user = User.query.filter_by(username=session.get('username')).first()  # Line 32
    if user:
        user_password_hashed = hashlib.pbkdf2_hmac('sha256', user.password.encode(), app.secret_key.encode(), 100000).hex()  # Line 34
        if session.get('password_hash') == user_password_hashed:  # Line 35
            session['user_id'] = user.id  # Line 37
            session['session_id'] = session.sid  # Line 38
            return True
```
- Queries database for user by username
- **CRITICAL FLAW:** Retrieves PLAINTEXT password from database (user.password)
- Hashes plaintext password and compares with session password_hash
- Sets `user_id` and `session_id` in session on success

**Step 4: Cookie Setting**
- Flask-Session automatically manages session cookie
- Session data stored server-side in MySQL table `mysessions`
- **Missing:** No `Secure` flag (HTTP only, no HTTPS)
- **Missing:** No `SameSite` attribute (CSRF vulnerable)
- **Default:** `HttpOnly=True` (JavaScript access blocked - this is good)

**Step 5: Redirect to Dashboard (routes.py:74)**
```python
return redirect(url_for('dashboard'))
```

### Code Pointers

**Primary Authentication Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py`
  - Login endpoint: Lines 53-78
  - verify_session function: Lines 31-46
  - Logout endpoint: Lines 81-85

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/__init__.py`
  - Secret key configuration: Line 14 (`'your_secret_key'`)
  - Session interface setup: Line 28 (SqlAlchemySessionInterface with 'mysessions' table)
  - Database configuration: Lines 17-19 (connection string, READ UNCOMMITTED isolation)
  - Default user creation: Lines 33-57 (test:test and admin accounts)

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/models.py`
  - User model: Lines 6-13 (plaintext password storage in line 9)

### 3.1 Role Assignment Process

**Role Determination:** Roles are assigned at user creation time via the `is_admin` boolean field in the User model (models.py:13). The role is stored directly in the database and never changes after initial user creation.

**Default Role:** New users receive `is_admin=False` (regular user) by default (models.py:13 - `default=False`).

**Role Upgrade Path:** NO ROLE UPGRADE MECHANISM EXISTS. Roles are static and can only be changed via direct database manipulation. No administrative interface exists for promoting users to admin status.

**Code Implementation:**
- Role field definition: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/models.py:13`
  ```python
  is_admin = db.Column(db.Boolean, default=False, nullable=False)
  ```
- Test user creation (regular role): `__init__.py:42` - `is_admin=False`
- Admin user creation (admin role): `__init__.py:54` - `is_admin=True`

**Critical Finding:** The `is_admin` field exists in the database but is NEVER checked anywhere in the application code. The role assignment system is non-functional.

### 3.2 Privilege Storage & Validation

**Storage Location:** User privileges are stored ONLY in the database User table (models.py:13). Privileges are NOT cached in the session, JWT claims, or any other ephemeral storage.

**Session Storage:** Sessions contain:
- `username` (plaintext) - Set at routes.py:69
- `password_hash` (PBKDF2 hash) - Set at routes.py:70
- `user_id` (database ID) - Set at routes.py:37 after verification
- `session_id` (session identifier) - Set at routes.py:38

**CRITICAL MISSING:** `is_admin` flag is NOT stored in session data.

**Validation Points:**
- **Authentication Validation:** `verify_session()` function (routes.py:31-46) called at:
  - `/dashboard` - Line 113
  - `/admin_panel` - Line 97
  - `/wifi_settings` - Line 127
  
- **Authorization Validation:** NONE - No privilege checks exist despite role field in database

**Cache/Session Persistence:**
- Sessions persist indefinitely (no timeout configured)
- No `PERMANENT_SESSION_LIFETIME` set
- No session rotation after login or privilege changes
- Sessions stored in MySQL `mysessions` table with READ UNCOMMITTED isolation (race condition risk)

**Code Pointers:**
- Session validation: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py:31-46`
- Session configuration: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/__init__.py:28`
- Privilege storage: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/models.py:13`

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NONE - No admin-to-user impersonation capability exists in the codebase.

**Role Switching:** NONE - No temporary privilege elevation mechanisms (no "sudo mode" or equivalent).

**Audit Trail:** NONE - No logging of authentication events, authorization checks, or privilege usage. The application has no logging infrastructure whatsoever.

**Code Implementation:** Not applicable - these features do not exist.

---

## 4. API Endpoint Inventory

**Network Surface Focus:** This table includes ONLY network-accessible API endpoints reachable through HTTP requests to the deployed application at http://localhost:38539. Local-only utilities, build tools, and CLI scripts are excluded.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Simple redirect to `/login`. No functionality. See `/app/website/app/routes.py:48-50` |
| GET | `/login` | anon | None | None | Renders login form. HTML comment discloses test:test credentials. See `/app/website/app/routes.py:61-64` and `/app/website/app/templates/login.html:1` |
| POST | `/login` | anon | None | Session-based (verify_session after storing credentials) | Authenticates user, stores username and password_hash in session, validates via verify_session(), redirects to dashboard on success. **FLAW:** Stores session data before verification. See `/app/website/app/routes.py:65-78` |
| GET | `/logout` | anon (should be user) | None | **NONE** (missing auth check) | Removes only `user_id` from session, leaves username and password_hash intact. **FLAW:** Incomplete session cleanup. See `/app/website/app/routes.py:81-85` |
| GET | `/dashboard` | user | None | Session-based (verify_session at line 113) | Displays user dashboard with welcome message. Accessible to any authenticated user. See `/app/website/app/routes.py:104-121` |
| GET | `/admin_panel` | user (BROKEN - should be admin) | None | **BROKEN:** verify_session checks auth but NEVER checks is_admin flag | **CRITICAL BUG:** Always returns error "Only administrator users can open this section" but grants access anyway. Should check user.is_admin but doesn't. See `/app/website/app/routes.py:88-101` |
| GET | `/wifi_settings` | user (should be admin) | None | Session-based (verify_session at line 127) | Renders WiFi configuration form. Executes hardcoded subprocess curl to internal API. **MISSING:** Admin role check. See `/app/website/app/routes.py:124-141` |
| POST | `/wifi_settings` | user (should be admin) | None | Session-based (verify_session at line 127) | Processes WiFi settings form (though form data not actually used). Executes subprocess: `['curl', '-v', '-s', 'http://haproxy:8001/devices/wifi_chipset/status', '-H', 'Host: internal.router']`. Returns subprocess output in modal. **SSRF SINK:** Line 132-134. See `/app/website/app/routes.py:124-141` |
| GET | `/devices` | **NONE (anon)** | None | **NONE** | **UNAUTHENTICATED INTERNAL API:** Returns list of all device chipsets. Accessible via Host header `internal.router`. See `/app/internal/app/routes.py:6-67` |
| GET | `/devices/wifi_chipset/status` | **NONE (anon)** | None | **NONE** | **UNAUTHENTICATED INTERNAL API:** Returns WiFi chipset boot status (initialization failed state). Called by public wifi_settings endpoint. See `/app/internal/app/routes.py:70-102` |
| GET | `/devices/cpu_arm/status` | **NONE (anon)** | None | **NONE** | **UNAUTHENTICATED INTERNAL API:** Returns "not available yet" message. See `/app/internal/app/routes.py:105-125` |
| GET | `/devices/memory_ram/status` | **NONE (anon)** | None | **NONE** | **UNAUTHENTICATED INTERNAL API:** Returns "not available yet" message. See `/app/internal/app/routes.py:105-125` |
| GET | `/devices/storage_mmc/status` | **NONE (anon)** | None | **NONE** | **UNAUTHENTICATED INTERNAL API:** Returns "not available yet" message. See `/app/internal/app/routes.py:105-125` |
| GET | `/devices/bluetooth/status` | **NONE (anon)** | None | **NONE** | **UNAUTHENTICATED INTERNAL API:** Returns "not available yet" message. See `/app/internal/app/routes.py:105-125` |
| GET | `/devices/ethernet/status` | **NONE (anon)** | None | **NONE** | **UNAUTHENTICATED INTERNAL API:** Returns "not available yet" message. See `/app/internal/app/routes.py:105-125` |
| GET | `/devices/flag/status` | **NONE (anon)** | None | **NONE** | **CRITICAL FLAG ENDPOINT:** Reads `/flag` file and returns contents in response. Completely unauthenticated. Accessible via Host header manipulation: `curl -H "Host: internal.router" http://localhost:38539/devices/flag/status`. **PRIMARY CTF OBJECTIVE.** See `/app/internal/app/routes.py:128-150`, specifically line 130: `with open('/flag') as flag_file:` |

**Total Endpoints:** 15 (6 public admin router + 1 root redirect + 8 internal API)

**Critical Authorization Findings:**
- 8 internal API endpoints have NO authentication whatsoever
- Flag endpoint directly accessible via Host header manipulation
- Admin panel authorization completely broken (line 101 returns error but grants access)
- WiFi settings missing admin role requirement
- Logout endpoint missing authentication check (anyone can logout any session)

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** This section reports ONLY input vectors accessible through the target web application's network interface at http://localhost:38539. Local-only scripts, build tools, development utilities, and CLI applications are excluded.

### 5.1 URL Parameters

**Commented Debug Parameters (Currently Inactive):**
- `/login?debug=session` - routes.py:57 (commented out)
- `/dashboard?debug=session` - routes.py:108 (commented out)  
- `/admin_panel?debug=session` - routes.py:92 (commented out)

**Impact if Enabled:** Would render complete session contents (including password_hash) in HTML comments

**Active URL Parameters:** None currently processed in network-accessible endpoints.

### 5.2 POST Body Fields (Form Data)

**Login Form (POST /login):**
- `username` - `/app/website/app/routes.py:66`
  - Data Flow: `request.form['username']` → `session['username']` (line 69) → `User.query.filter_by(username=...)` (line 32 in verify_session)
  - Validation: **NONE**
  - Sanitization: SQLAlchemy ORM parameterization only
  
- `password` - `/app/website/app/routes.py:67`
  - Data Flow: `request.form['password']` → PBKDF2 hashed (line 70) → `session['password_hash']`
  - Validation: **NONE** (no complexity requirements, no length checks)
  - Sanitization: Hashed with PBKDF2 before storage

**WiFi Settings Form (POST /wifi_settings):**
- Form fields defined in template (`/app/website/app/templates/wifi_settings.html`):
  - `ssid` - Text input for SSID name
  - `password` - Text input for WiFi password
  - `security` - Dropdown select (None, WEP, WPA/WPA2 Personal, WPA/WPA2 Enterprise)
  
- **CRITICAL FINDING:** These form fields are NOT processed server-side. No `request.form` access in POST handler at routes.py:124-141. Form data completely ignored.

### 5.3 HTTP Headers

**Headers Accessed by Application:**
- No custom header processing in application code
- Flask standard headers accessed implicitly (Host, User-Agent, etc.)

**Headers Added by HAProxy (internal routing):**
- `X-Forwarded-Host: internal.router` - Added when routing to internal backend (haproxy.cfg:29)
- `X-Upstream-Proxy: mitmproxy (6.0.2)` - Added to internal requests (haproxy.cfg:30)
- `Via: haproxy (2.0.5)` - Added to internal requests (haproxy.cfg:31)

**Routing-Critical Header:**
- `Host` header - Controls HAProxy routing decision
  - `Host: internal.router` → Routes to internal API backend (haproxy.cfg:16-17)
  - Any other Host value → Routes to public admin router (default backend)

### 5.4 Cookie Values

**Session Cookie:**
- Cookie Name: `session` (Flask default)
- Contents: Encrypted/signed session ID (actual session data stored server-side in MySQL)
- Server-Side Session Data:
  - `username` (plaintext string)
  - `password_hash` (PBKDF2 hex string)
  - `user_id` (integer, set after successful auth)
  - `session_id` (session.sid value)

**No Other Cookies:** Application does not use additional cookies for tracking, preferences, or other purposes.

### 5.5 Session Data (User-Controlled After Login)

Session data can be manipulated if attacker knows the secret key (`'your_secret_key'`):

- `session['username']` - Used in database queries at routes.py:32
  - **INJECTION RISK:** Username flows into SQLAlchemy query (parameterized, low risk)
  
- `session['password_hash']` - Used for authentication validation
  - **SESSION FORGERY RISK:** Predictable hashing with known secret key

### 5.6 Subprocess Input (SSRF Sink)

**Location:** `/app/website/app/routes.py:132-134`
```python
curl_command = ['curl', '-v', '-s', 'http://haproxy:8001/devices/wifi_chipset/status', '-H', 'Host: internal.router']
result = subprocess.run(curl_command, capture_output=True, text=True)
error_response = (result.stderr + result.stdout)  # Line 134
```

**Current State:** Completely hardcoded, no user input

**Render Location:** `/app/website/app/templates/wifi_settings.html:135`
```html
<pre style="color: white;">{{ error_response }}</pre>
```

**Potential Attack Vector:** If URL or Host header becomes user-controllable, could access arbitrary internal endpoints including flag endpoint.

### 5.7 File Upload Vectors

**Status:** NONE - No file upload functionality exists in the application.

### 5.8 JSON/XML Body Parsing

**Status:** NONE - Application only processes form-encoded data. No JSON or XML parsing.

---

## 6. Network & Interaction Map

**Network Surface Focus:** This section maps only network-accessible components deployed as part of the target application. Local development environments, build CI systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| ExternalClient | ExternAsset | Internet | Browser/curl | N/A | External attacker or legitimate user |
| MitmProxy | Service | Edge | mitmproxy 6.0.2 | Public | First-tier reverse proxy, externally exposed on port 8002 (mapped to 38539) |
| HAProxy | Service | Edge | HAProxy 2.0.5 | Public | Second-tier routing proxy, performs Host-based routing to backends |
| AdminRouter | Service | App | Flask/Apache/Python3.8 | PII, Tokens | Public-facing router admin application (default virtual host) |
| InternalDeviceAPI | Service | App | Flask/Apache/Python3.8 | Secrets | Internal device status API, should be isolated but accessible via Host header |
| MySQLDatabase | DataStore | Data | MySQL 5.7.15 | PII, Tokens, Secrets | Stores users (with plaintext passwords) and sessions |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| MitmProxy | Hosts: `http://localhost:38539` (external), `http://mitmproxy:8002` (internal); Tech: `mitmproxy 6.0.2`; Forwards: All traffic to HAProxy:8001; Purpose: First-tier reverse proxy |
| HAProxy | Hosts: `http://haproxy:8001`; Tech: `HAProxy 2.0.5` (intentionally vulnerable); Routing: Host header-based ACL; Backends: `router_external` (admin app), `router_internal` (device API); Headers: Adds `X-Forwarded-Host`, `X-Upstream-Proxy`, `Via` |
| AdminRouter | Hosts: `http://admin_router:80` (default VHost); Endpoints: `/`, `/login`, `/logout`, `/dashboard`, `/admin_panel`, `/wifi_settings`; Auth: Custom session-based (flask_session); Tech: `Flask + Apache 2.4.65 + mod_wsgi`; Dependencies: MySQLDatabase |
| InternalDeviceAPI | Hosts: `http://internal_router:80` (ServerName: internal.router); Endpoints: `/devices/*` (8 device status endpoints); Auth: **NONE**; Tech: `Flask + Apache 2.4.65 + mod_wsgi`; Critical: `/devices/flag/status` exposes CTF flag |
| MySQLDatabase | Engine: `MySQL 5.7.15`; Host: `db:3306`; Database: `database`; Credentials: `root:admin_router`; Tables: `user` (plaintext passwords, is_admin flag), `mysessions` (server-side sessions); Isolation: `READ UNCOMMITTED` (dirty reads enabled); Exposure: Internal only (Docker network) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ExternalClient → MitmProxy | HTTP | `:38539` (external), `:8002` (internal) | None | Public |
| MitmProxy → HAProxy | HTTP | `:8001` | None | Public |
| HAProxy → AdminRouter | HTTP | `:80 /` (default backend) | None | Public |
| HAProxy → InternalDeviceAPI | HTTP | `:80 /devices/*` (if Host: internal.router) | **BROKEN: Host header only** | Secrets |
| AdminRouter → MySQLDatabase | TCP | `:3306` | vpc-only (Docker network) | PII, Tokens, Secrets |
| AdminRouter → HAProxy | HTTP | `:8001 /devices/wifi_chipset/status` | auth:user (from /wifi_settings) | Public |
| ExternalClient → InternalDeviceAPI | HTTP | Via HAProxy with `Host: internal.router` header | **NONE** | Secrets |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication required - public access allowed |
| auth:user | Auth | Requires valid session via verify_session() function - authenticates user identity but does NOT validate privileges |
| auth:admin (MISSING) | Authorization | **SHOULD EXIST BUT DOESN'T:** Should require is_admin=True flag from User model, but this check is never implemented |
| Host:internal.router | Network | Routing guard - HAProxy ACL checks Host header and routes to internal backend if header matches 'internal.router' |
| ownership:user (N/A) | ObjectOwnership | Not applicable - no user-owned objects exist in this application (single-dashboard architecture) |
| vpc-only | Network | Restricted to Docker internal network - database only accessible from admin_router container |
| broken:admin_panel | Authorization | **BROKEN GUARD:** Admin panel calls verify_session() but then unconditionally returns error message without checking is_admin flag (routes.py:101) |

**Critical Guard Failures:**
1. Internal API has NO authentication guard despite containing sensitive flag endpoint
2. Host header guard is easily bypassed by setting `Host: internal.router` in external requests
3. Admin role checking completely non-functional (is_admin field exists but never validated)
4. WiFi settings endpoint missing admin privilege requirement

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anon | 0 | Global | No authentication required - access to public endpoints (/, /login) |
| user | 1 | Global | Base authenticated user role, stored as `is_admin=False` in database at `/app/website/app/models.py:13`. Default role for new users. Example: test account created at `__init__.py:42` |
| admin | 10 | Global | Administrative role with `is_admin=True` in database. Created at `__init__.py:54` with 100-character random password. **NEVER CHECKED** in authorization logic |

**Role Verification Status:**
- ✅ Database field exists: `User.is_admin` (models.py:13)
- ✅ Users assigned roles: test user (is_admin=False), admin user (is_admin=True)
- ❌ Role checks implemented: **NONE** - The `is_admin` field is never queried in any endpoint

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon → user (no further ordering, admin is isolated despite higher privilege level)

Intended Hierarchy (NOT ENFORCED):
anon < user < admin

Actual Hierarchy (IMPLEMENTED):
anon < user = admin (user and admin have identical access due to missing authorization)

Parallel Isolation:
NONE - Single-tenant application with global scope for all roles
```

**Role Switching Mechanisms:**
- ❌ No impersonation features
- ❌ No sudo mode or temporary privilege elevation
- ❌ No role switching capability

**Critical Finding:** The privilege lattice is completely non-functional. Despite a clear intended hierarchy (anon < user < admin), the actual implementation treats user and admin as equivalent because no authorization checks validate the `is_admin` flag.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/login` | `/`, `/login` (GET/POST) | None |
| user | `/dashboard` | `/`, `/login`, `/logout`, `/dashboard`, `/wifi_settings`, `/admin_panel` (all authenticated endpoints) | Session-based (flask_session in MySQL) via verify_session() |
| admin | `/dashboard` | Same as user role - NO additional endpoints accessible | Session-based (flask_session in MySQL) via verify_session() |

**Critical Finding:** Admin and user roles have identical route access. The admin role provides zero additional privileges.

**Internal API Access (All Roles Including anon):**
- `/devices/*` - 8 unauthenticated endpoints accessible via Host header manipulation
- Accessible by ANY role including unauthenticated users
- **CRITICAL:** `/devices/flag/status` exposes CTF flag without authentication

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| anon | None | None | N/A (not logged in) |
| user | `verify_session()` called at routes.py:97, 113, 127 | **NONE** - verify_session only checks authentication, not authorization | Session: `username`, `password_hash`, `user_id` stored in MySQL `mysessions` table; Database: User.is_admin=False |
| admin | `verify_session()` (same as user) | **NONE** - is_admin flag never checked anywhere in codebase | Session: Same as user (is_admin NOT cached); Database: User.is_admin=True |

**verify_session() Implementation:**
```python
# File: /app/website/app/routes.py:31-46
def verify_session():
    user = User.query.filter_by(username=session.get('username')).first()
    if user:
        user_password_hashed = hashlib.pbkdf2_hmac('sha256', user.password.encode(), app.secret_key.encode(), 100000).hex()
        if session.get('password_hash') == user_password_hashed:
            session['user_id'] = user.id
            session['session_id'] = session.sid
            return True  # ← Returns boolean, NOT user object (prevents privilege checks)
        else:
            raise SessionError(message='Wrong password.')
    else:
        raise SessionError(message='Invalid username.')
```

**Critical Flaw:** `verify_session()` returns `True` instead of the user object, preventing calling code from accessing `user.is_admin`.

**What Should Exist (But Doesn't):**
```python
# Missing authorization decorator example:
def require_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = verify_session()  # Should return user object
        if not user or not user.is_admin:
            return render_template('error.html', error='Admin access required')
        return f(*args, **kwargs)
    return decorated_function

@app.route('/admin_panel')
@require_admin  # ← This decorator doesn't exist
def admin_panel():
    ...
```

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**Result:** ZERO horizontal escalation candidates identified.

**Reason:** The application is a single-dashboard router configuration tool with no user-owned objects, no object ID parameters in any endpoints, and no multi-user resource access patterns. All users see identical content regardless of identity.

**Endpoints Reviewed:**
- No endpoints accept `user_id`, `order_id`, `file_id`, or any other object identifiers
- No endpoints access user-specific resources beyond the current authenticated user
- No endpoints implement resource ownership checks (because no resources to own)

**Architecture Note:** This is a single-tenant configuration interface where all authenticated users interact with the same global WiFi settings and device status, not per-user data.

### 8.2 Vertical Privilege Escalation Candidates

**Priority: CRITICAL** - Internal API Unauthenticated Access

| Endpoint Pattern | Functionality | Current Authorization | Risk Level | Exploitation |
|------------------|---------------|----------------------|------------|--------------|
| `/devices/flag/status` | **FLAG DISCLOSURE:** Reads `/flag` file (line 130) and returns contents in plaintext response | **NONE** - Completely unauthenticated | **CRITICAL** | `curl -H "Host: internal.router" http://localhost:38539/devices/flag/status` |
| `/devices` | Lists all internal device chipsets | **NONE** - Completely unauthenticated | MEDIUM | Accessible via Host header manipulation |
| `/devices/wifi_chipset/status` | WiFi chipset boot status | **NONE** - Completely unauthenticated | LOW | Information disclosure |
| `/devices/cpu_arm/status` | CPU status (not implemented) | **NONE** - Completely unauthenticated | LOW | Information disclosure |
| `/devices/memory_ram/status` | Memory status (not implemented) | **NONE** - Completely unauthenticated | LOW | Information disclosure |
| `/devices/storage_mmc/status` | Storage status (not implemented) | **NONE** - Completely unauthenticated | LOW | Information disclosure |
| `/devices/bluetooth/status` | Bluetooth status (not implemented) | **NONE** - Completely unauthenticated | LOW | Information disclosure |
| `/devices/ethernet/status` | Ethernet status (not implemented) | **NONE** - Completely unauthenticated | LOW | Information disclosure |

**Exploitation Path for Flag:**
```bash
# From external network:
curl -v "http://localhost:38539/devices/flag/status" -H "Host: internal.router"

# Response includes:
# Flag: flag{c8653e63-3018-4dcb-8f8e-eb473ca2a2e4}
```

**Code Locations:**
- Internal API routes: `/app/internal/app/routes.py:6-150`
- Flag file read: `/app/internal/app/routes.py:130` - `with open('/flag') as flag_file:`
- HAProxy routing: `/haproxy/haproxy.cfg:16-17` - ACL routes Host:internal.router to internal backend
- No authentication checks anywhere in internal API codebase

---

**Priority: HIGH** - Broken Admin Panel Authorization

| Endpoint Pattern | Functionality | Current Authorization | Risk Level | Exploitation |
|------------------|---------------|----------------------|------------|--------------|
| `/admin_panel` | Admin dashboard (intended for is_admin=True only) | **BROKEN:** verify_session() authenticates but line 101 unconditionally returns error message without checking is_admin flag | HIGH | Login as test:test, navigate to /admin_panel, observe error message but full access granted |

**Code Analysis:**
```python
# File: /app/website/app/routes.py:88-101
@app.route('/admin_panel')
def admin_panel():
    # ... debug code ...
    try:
        sess = verify_session()  # Line 97 - Only checks authentication
    except SessionError as e:
        return render_template('login.html', error=e.message)
    
    # Line 101 - NO is_admin CHECK - Just returns error message
    return render_template('dashboard.html', error_message='Only administrator users can open this section.', debug_session=debug_session)
```

**What's Missing:**
```python
# After line 97, should have:
user = User.query.filter_by(username=session.get('username')).first()
if not user.is_admin:
    return render_template('error.html', error='Access Denied'), 403
```

---

**Priority: MEDIUM** - WiFi Settings Missing Admin Check

| Endpoint Pattern | Functionality | Current Authorization | Risk Level | Exploitation |
|------------------|---------------|----------------------|------------|--------------|
| `/wifi_settings` | System WiFi configuration with SSRF capability | verify_session() (authentication only) | MEDIUM | Login as test:test, access /wifi_settings, observe WiFi configuration interface accessible to non-admin |

**Should Require:** `is_admin=True` for system-level WiFi configuration

**Current Implementation:** Only requires authentication (any authenticated user can access)

**Code Location:** `/app/website/app/routes.py:124-141` - verify_session() at line 127 but no admin check

**Additional Risk:** Contains subprocess execution (lines 132-134) that makes internal API calls, creating SSRF attack surface for non-admin users.

---

**Priority: LOW** - Logout Missing Authentication

| Endpoint Pattern | Functionality | Current Authorization | Risk Level | Exploitation |
|------------------|---------------|----------------------|------------|--------------|
| `/logout` | Session termination | **NONE** - No authentication check | LOW | GET /logout (anyone can logout anyone else's session) |

**Code Location:** `/app/website/app/routes.py:81-85`

**Issue:** Endpoint lacks authentication check. While impact is low (only removes `user_id` from session without clearing username/password_hash), it violates security principle that authenticated actions should require authentication.

### 8.3 Context-Based Authorization Candidates

**Result:** ZERO context-based authorization vulnerabilities identified.

**Reason:** The application has no multi-step workflows, no state machines, and no context-dependent authorization. All endpoints are stateless beyond session authentication.

**Workflows Reviewed:**
- Login flow: Simple POST → verify → redirect (no multi-step process)
- WiFi configuration: Single-page form (no save/confirm workflow)
- No checkout processes, onboarding wizards, or approval workflows exist

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** This section reports ONLY injection sources reachable through network-accessible endpoints at http://localhost:38539. Local-only scripts, build tools, CLI applications, and development utilities are excluded.

### 9.1 Command Injection Sources

**Result:** ZERO direct command injection vulnerabilities found in network-accessible code paths.

**Subprocess Execution Reviewed:**
```python
# File: /app/website/app/routes.py:132-134
curl_command = ['curl', '-v', '-s', 'http://haproxy:8001/devices/wifi_chipset/status', '-H', 'Host: internal.router']
result = subprocess.run(curl_command, capture_output=True, text=True)
error_response = (result.stderr + result.stdout)
```

**Analysis:**
- Subprocess uses list format (not `shell=True`) - prevents shell injection
- All parameters are hardcoded strings - no user input interpolation
- WiFi settings form fields (`ssid`, `password`, `security`) are NOT processed server-side
- Subprocess output rendered in template (line 135) but Jinja2 auto-escaping prevents XSS

**Verdict:** SAFE - No command injection vulnerability (though SSRF potential exists if URL or headers become user-controllable in future)

**Other Command Execution Patterns Searched:**
- ❌ `os.system()` - Not found
- ❌ `os.popen()` - Not found
- ❌ `os.exec*()` - Not found
- ❌ `eval()` - Not found
- ❌ `exec()` - Not found
- ❌ `compile()` - Not found
- ✅ `subprocess.run()` - Found at routes.py:132 (safe implementation)

### 9.2 SQL Injection Sources

**INJECTION SOURCE #1: Username Parameter in Session**

**Source Type:** SQL Injection (ORM-based, LOW exploitability)

**Input Origin:** `request.form['username']` from login form

**Input Variable Name:** `username`

**Entry Point:** POST /login

**Data Flow Path:**
```
1. User submits login form
   └─> /app/website/app/routes.py:66
       username = request.form['username']

2. Username stored in session WITHOUT VALIDATION
   └─> /app/website/app/routes.py:69
       session['username'] = username

3. Username retrieved from session and used in database query
   └─> /app/website/app/routes.py:32 (inside verify_session())
       user = User.query.filter_by(username=session.get('username')).first()
```

**Dangerous Sink:** 
- File: `/app/website/app/routes.py:32`
- Code: `User.query.filter_by(username=session.get('username')).first()`
- Query Type: SQLAlchemy ORM `.filter_by()` method

**Current Sanitization:** NONE (no input validation)

**SQL Injection Protection:** SQLAlchemy ORM automatically parameterizes queries via `.filter_by()` method, providing protection against traditional SQL injection.

**Exploitability:** LOW - While no input validation exists, SQLAlchemy's parameterized queries prevent direct SQL injection. However, session manipulation is theoretically possible if attacker knows the secret key (`'your_secret_key'`).

**Additional Context:**
- Database isolation level: READ UNCOMMITTED (line 19 in __init__.py)
- Session data could be forged with known secret key
- Race conditions possible due to dirty reads

**Recommendation:** Add input validation on username field as defense-in-depth measure:
```python
# Missing validation:
if not username or len(username) > 50 or not username.isalnum():
    return render_template('login.html', error='Invalid username format')
```

### 9.3 Other Injection Patterns Searched

**Server-Side Template Injection (SSTI):**
- ✅ `render_template_string` imported at routes.py:1
- ❌ Never invoked anywhere in codebase
- Verdict: SAFE - All rendering uses `render_template()` with static template names

**XML External Entity (XXE):**
- ❌ No XML parsing in codebase
- Verdict: N/A

**LDAP Injection:**
- ❌ No LDAP queries in codebase
- Verdict: N/A

**NoSQL Injection:**
- ❌ Application uses MySQL (relational database)
- Verdict: N/A

---

## Appendix: Network Request Examples

### Example 1: Accessing Internal API from External Network

```bash
# Retrieve CTF flag via Host header manipulation:
curl -v "http://localhost:38539/devices/flag/status" \
     -H "Host: internal.router"

# Expected response:
# HTTP/1.1 200 OK
# ...
# Flag: flag{c8653e63-3018-4dcb-8f8e-eb473ca2a2e4}
```

### Example 2: Authenticated WiFi Settings Request

```bash
# Login to get session cookie:
curl -c cookies.txt -X POST "http://localhost:38539/login" \
     -d "username=test&password=test"

# Access WiFi settings (observe subprocess output):
curl -b cookies.txt "http://localhost:38539/wifi_settings"
```

### Example 3: Broken Admin Panel Access

```bash
# Login as non-admin user:
curl -c cookies.txt -X POST "http://localhost:38539/login" \
     -d "username=test&password=test"

# Access admin panel (observe error message but full access):
curl -b cookies.txt "http://localhost:38539/admin_panel"

# Response includes error modal but renders admin panel content
```

---

## Appendix: Critical File Paths Reference

**Primary Attack Surface:**
- Public routes: `/app/website/app/routes.py:48-141`
- Internal API: `/app/internal/app/routes.py:6-150`
- Flag endpoint: `/app/internal/app/routes.py:128-150`

**Authentication & Authorization:**
- Session config: `/app/website/app/__init__.py:14, 28`
- User model: `/app/website/app/models.py:6-13`
- Auth logic: `/app/website/app/routes.py:31-78`

**Infrastructure:**
- HAProxy routing: `/haproxy/haproxy.cfg:16-17`
- Apache vhosts: `/app/admin_router-httpd.conf:1-46`
- Docker orchestration: `/docker-compose.yml`

**Templates (XSS Analysis):**
- Login: `/app/website/app/templates/login.html`
- Dashboard: `/app/website/app/templates/dashboard.html`
- WiFi Settings: `/app/website/app/templates/wifi_settings.html`
- Admin Panel: `/app/website/app/templates/admin_panel.html`

---

**END OF RECONNAISSANCE DELIVERABLE**