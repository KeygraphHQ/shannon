# Reconnaissance Deliverable: XBEN-002-24 Trading Platform

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

## 1. Executive Summary

The XBEN-002-24 Trading Platform is a deliberately vulnerable Python Flask web application designed for security training and CTF challenges. The application implements a stock trading order management system with a two-stage authentication flow and session-based authorization.

**Core Technology Stack:**
- **Backend:** Python 3.x with Flask 3.0.3 web framework
- **Database:** MySQL 5.7 accessed via SQLAlchemy ORM (PyMySQL driver)
- **Frontend:** Server-rendered Jinja2 templates with Bootstrap 4.x and jQuery 3.5.1
- **Infrastructure:** Apache 2.4.65 HTTP server with mod_wsgi on Debian Linux, containerized via Docker Compose

**Primary User-Facing Components:**
- Two-stage authentication (username verification → password verification)
- User dashboard displaying profile information
- Active orders management interface
- Archived orders management interface
- Order receipt viewing system
- Order archiving functionality

**Critical Security Finding:**
The application contains a **critical IDOR (Insecure Direct Object Reference) vulnerability** in the `/order/<order_id>/archive` endpoint that allows any authenticated user to archive any order, thereby gaining unauthorized access to order receipts including a CTF flag stored in order ID 300198. This vulnerability demonstrates a complete authorization bypass for sensitive financial transaction data.

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-side Jinja2 templating (Flask default)
- **CSS Framework:** Bootstrap 4.x (bootstrap.min.css)
- **JavaScript Libraries:** 
  - jQuery 3.5.1 (vulnerable to CVE-2020-11022, CVE-2020-11023 - Prototype Pollution)
  - Bootstrap Bundle 4.x (bootstrap.bundle.min.js)
- **Authentication:** Session-based with Flask signed cookies
- **Key Files:**
  - `/static/css/bootstrap.min.css`
  - `/static/js/jquery-3.5.1.min.js`
  - `/static/js/bootstrap.bundle.min.js`

### Backend
- **Language:** Python 3.x
- **Framework:** Flask 3.0.3 (lightweight WSGI web framework)
- **ORM:** Flask-SQLAlchemy 3.1.1
- **Database Driver:** PyMySQL 1.1.0 (pure Python MySQL driver)
- **Key Dependencies:** Only 3 Python packages (minimal attack surface)
- **Application Structure:**
  - `routes.py` - All HTTP route handlers and business logic
  - `models.py` - SQLAlchemy ORM models (User, Order)
  - `__init__.py` - Application initialization and configuration
  - `db.py` - Database instance

### Infrastructure
- **Web Server:** Apache 2.4.65 (Debian) with mod_wsgi for Python 3
- **Operating System:** Debian Bullseye Slim (container base image)
- **Database:** MySQL 5.7 (EOL October 2023 - no longer receives security updates)
- **Containerization:** Docker Compose orchestration with 2 services (app + database)
- **Hosting:** Local deployment (http://localhost:36493)
- **CDN:** None
- **Reverse Proxy:** None (direct Apache exposure)

### Identified Subdomains
Based on subfinder scan (pre-recon report):
- exchvm.nwcnet.localhost
- www.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.regency.localhost
- mail.regency.localhost
- server02.counterintel.localhost
- autodiscover.localhost
- sbs.allsaintsschool.localhost
- mse-ca-mail.corp.mse.localhost
- tools.sonoma.edu.localhost
- server2.hunter.localhost
- naeu2.naeuinc.localhost
- mail.localhost
- mail02.regency.localhost
- mail03.regency.localhost
- owa.regency.localhost

**Note:** These appear to be environmental noise from the scanning system, not actual application subdomains.

### Open Ports & Services
Based on nmap scan from target host (pre-recon report):
- **Port 80/tcp:** Caddy httpd (proxy to application)
- **Port 443/tcp:** SSL/HTTPS (not configured for application)
- **Port 631/tcp:** CUPS 2.3 (print service - unrelated to application)
- **Port 8080/tcp:** Apache httpd 2.4.65 (actual application server)
- **Port 49152/tcp:** Tailscale VPN service (unrelated to application)

**Primary Application Access:** HTTP on dynamically mapped port (36493 in current deployment)

## 3. Authentication & Session Management Flow

### Entry Points
- **`GET/POST /`** - Login page (username verification step)
- **`GET/POST /password/<username>`** - Password verification page (second authentication step)
- **`POST /logout`** - Session termination

### Mechanism

**Step-by-Step Authentication Process:**

1. **Username Verification (First Stage)**
   - User navigates to `GET /`
   - Enters username in login form
   - Submits `POST /` with `username` parameter
   - Application queries: `User.query.filter_by(username=username).first()`
   - If username exists: redirect to `/password/<username>`
   - If username invalid: display error "User not found"
   - **Vulnerability:** User enumeration via different responses

2. **Password Verification (Second Stage)**
   - User navigates to `GET /password/<username>` (username in URL)
   - Page displays: "Welcome, [FirstName]!" (information disclosure)
   - User enters password in form
   - Submits `POST /password/<username>` with `password` parameter
   - Application queries: `User.query.filter_by(username=username, password=password).first()`
   - **CRITICAL:** Plaintext password comparison (no hashing)
   - If valid: `session['user_id'] = user.id` (session creation)
   - Redirect to `/dashboard`
   - If invalid: redirect to login with error

3. **Session Cookie Setting**
   - Flask creates signed session cookie
   - Cookie contains: `{'user_id': <integer>}`
   - Cookie flags: HttpOnly=True (default), Secure=False (CRITICAL), SameSite=not set
   - Session signed with secret key: `'your_secret_key'` (CRITICAL: hardcoded, weak)

4. **Session Validation (All Protected Routes)**
   - Each protected endpoint checks: `user_id = session.get('user_id')`
   - If `user_id` exists: retrieve user from database
   - If `user_id` is None: redirect to `/` (login page)
   - No session timeout configured
   - No session regeneration after login (session fixation vulnerability)

5. **Logout Process**
   - User submits `POST /logout`
   - Application executes: `session.pop('user_id', None)`
   - Redirects to `/` (login page)
   - No CSRF protection on logout endpoint

### Code Pointers

**Authentication Implementation:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py`
- **Username verification:** Lines 20-33
  - Line 24: `username = request.form['username']`
  - Line 26: `user = User.query.filter_by(username=username).first()`
- **Password verification:** Lines 45-66
  - Line 53: `password = request.form['password']`
  - Line 54: `user = User.query.filter_by(username=username, password=password).first()`
  - Line 57: `session['user_id'] = user.id` (session creation)
- **Logout:** Lines 37-41
  - Line 40: `session.pop('user_id', None)`

**Session Configuration:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py`
- **Line 11:** `app.secret_key = 'your_secret_key'` (CRITICAL: hardcoded)
- **Missing configurations:**
  - No `SESSION_COOKIE_SECURE` (cookies sent over HTTP)
  - No `SESSION_COOKIE_SAMESITE` (CSRF vulnerable)
  - No `PERMANENT_SESSION_LIFETIME` (sessions never expire)

**Password Storage:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/models.py`
- **Line 8:** `password = db.Column(db.String(100), nullable=False)` (plaintext storage)

### 3.1 Role Assignment Process

**Role Determination:** NOT IMPLEMENTED
- The User model contains NO role field
- All authenticated users have identical privileges
- No admin/user/moderator distinction exists

**Default Role:** N/A (flat privilege model)

**Role Upgrade Path:** NOT APPLICABLE
- No role-based access control (RBAC) implemented
- No privilege escalation mechanisms
- Authorization based solely on object ownership

**Code Implementation:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/models.py` (Lines 5-14)
- User model contains: `id`, `username`, `password`, `first_name`, `last_name`, `email`
- No `role`, `permission`, or `privilege` fields

### 3.2 Privilege Storage & Validation

**Storage Location:** 
- **Session data:** Only `user_id` (integer) stored in Flask signed cookie
- **Database:** No privilege fields in User model
- **No JWT claims, no external authorization service**

**Validation Points:**
- **Inline checks:** Every protected route manually checks `session.get('user_id')`
- **No middleware:** No `@login_required` or similar decorators
- **No role checks:** No `if user.role == 'admin'` logic exists
- **Object ownership:** Authorization enforced via SQLAlchemy filters (e.g., `Order.creator == user`)

**Cache/Session Persistence:**
- Sessions persist until browser closure (not permanent sessions)
- Default Flask session lifetime: 31 days if `session.permanent = True` (not set in app)
- No forced re-authentication
- No session timeout

**Code Pointers:**
- **Session validation pattern (all protected routes):**
  - `/dashboard` - Line 72: `user_id = session.get('user_id')`
  - `/orders` - Line 85: `user_id = session.get('user_id')`
  - `/order/<id>/receipt` - Line 99: `user_id = session.get('user_id')`
  - `/orders_archive` - Line 117: `user_id = session.get('user_id')`
  - `/order/<id>/archive` - Line 131: `user_id = session.get('user_id')`

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NOT IMPLEMENTED
- No admin impersonation functionality
- No "view as user" feature
- No privilege delegation

**Role Switching:** NOT APPLICABLE
- No roles exist in the system
- No "sudo mode" or temporary elevation
- All users have identical capabilities

**Audit Trail:** NOT IMPLEMENTED
- No logging of authentication events
- No logging of authorization decisions
- No audit trail for order access or modifications
- Only Apache access logs capture HTTP requests

**Code Implementation:** None (feature does not exist)

## 4. API Endpoint Inventory

All endpoints are network-accessible through the target web application at `http://localhost:36493`.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|---------------------------|
| GET/POST | `/` | anon | None | None | Login page - username verification. Renders login form (GET) or validates username and redirects to password page (POST). See `routes.py` Lines 20-33. |
| GET/POST | `/password/<username>` | anon | `username` (URL path) | None (CRITICAL: exposes user info) | Password entry page. Displays user's first name (GET) or validates password and creates session (POST). **VULNERABILITY:** Exposes `user_id` in hidden form field. See `routes.py` Lines 45-66. |
| POST | `/logout` | user | None | Session-based (`user_id` cleared) | Logout handler. Clears session and redirects to login. **VULNERABILITY:** No CSRF protection. See `routes.py` Lines 37-41. |
| GET | `/dashboard` | user | None | Session check (`session.get('user_id')`) | User dashboard displaying profile information. Redirects to login if not authenticated. See `routes.py` Lines 69-78. |
| GET | `/orders` | user | None | Session check + ownership filter (`Order.creator == user`) | Lists active (non-archived) orders created by current user. Properly filters by ownership. See `routes.py` Lines 82-92. |
| GET | `/order/<order_id>/receipt` | user | `order_id` (integer) | Session check + dual ownership (`Order.creator == user OR Order.archiver == user`) | Fetches order receipt. Returns 401 if user is neither creator nor archiver. **EXPLOITABLE:** Via IDOR in archive endpoint. See `routes.py` Lines 96-109. |
| GET | `/orders_archive` | user | None | Session check + ownership filter (`Order.archiver == user`) | Lists orders archived by current user. Calls `db.session.expire_all()` before query (race condition awareness). See `routes.py` Lines 113-124. |
| GET | `/order/<order_id>/archive` | user | `order_id` (integer) | Session check ONLY - **NO OWNERSHIP CHECK** | Archives specified order and sets current user as archiver. **CRITICAL IDOR VULNERABILITY:** Any authenticated user can archive any order. See `routes.py` Lines 128-144. |
| GET | `/static/css/bootstrap.min.css` | anon | None | None | Bootstrap CSS framework (static asset). |
| GET | `/static/js/jquery-3.5.1.min.js` | anon | None | None | jQuery library (static asset). **VULNERABILITY:** jQuery 3.5.1 has known CVEs (CVE-2020-11022, CVE-2020-11023). |
| GET | `/static/js/bootstrap.bundle.min.js` | anon | None | None | Bootstrap JavaScript bundle (static asset). |

**Network Surface Confirmation:** All endpoints listed above are accessible via HTTP requests to the deployed application server. No local-only utilities, build tools, or development scripts are included.

## 5. Potential Input Vectors for Vulnerability Analysis

All input vectors listed below are accessible through the target web application's network interface.

### URL Parameters (Query Strings)
- **`?error=<string>`** (GET `/`)
  - **Source:** Query parameter on login page
  - **Usage:** Displays error messages
  - **Validation:** NONE
  - **Sink:** Rendered in Jinja2 template (`login.html` Line 26)
  - **Risk:** XSS (mitigated by Jinja2 auto-escaping)
  - **Code:** `routes.py` Line 22

### POST Body Fields (Form Data)
- **`username`** (POST `/`)
  - **Source:** Login form submission
  - **Usage:** Database query for user lookup
  - **Validation:** NONE (no length, format, or character restrictions)
  - **Sink:** `User.query.filter_by(username=username).first()`
  - **Risk:** User enumeration (different responses for valid/invalid)
  - **Code:** `routes.py` Line 24

- **`password`** (POST `/password/<username>`)
  - **Source:** Password form submission
  - **Usage:** Plaintext password comparison
  - **Validation:** NONE (no complexity requirements)
  - **Sink:** `User.query.filter_by(username=username, password=password).first()`
  - **Risk:** Plaintext storage, no rate limiting, brute force attacks
  - **Code:** `routes.py` Line 53

### URL Path Parameters
- **`<username>`** (GET/POST `/password/<username>`)
  - **Source:** URL path segment
  - **Type:** String (no converter)
  - **Usage:** Database query and template rendering
  - **Validation:** NONE
  - **Risk:** User enumeration, username disclosure in logs/history
  - **Code:** `routes.py` Line 45 (route definition)

- **`<int:order_id>`** (GET `/order/<order_id>/receipt`)
  - **Source:** URL path segment
  - **Type:** Integer (Flask type converter)
  - **Usage:** Database query with ownership validation
  - **Validation:** Type coercion to integer only
  - **Risk:** IDOR enumeration (mitigated by ownership check)
  - **Code:** `routes.py` Line 96

- **`<int:order_id>`** (GET `/order/<order_id>/archive`)
  - **Source:** URL path segment
  - **Type:** Integer (Flask type converter)
  - **Usage:** Database query WITHOUT ownership validation
  - **Validation:** Type coercion to integer only
  - **Risk:** **CRITICAL IDOR - any authenticated user can archive any order**
  - **Code:** `routes.py` Line 128

### HTTP Headers
- **`Cookie: session=<value>`**
  - **Source:** Browser-sent session cookie
  - **Usage:** Session validation and user identification
  - **Validation:** Flask signature verification
  - **Risk:** Session fixation, session forgery (weak secret key)
  - **Code:** All protected endpoints (Lines 72, 85, 99, 117, 131)

- **`User-Agent`, `X-Forwarded-For`, etc.**
  - **Usage:** NOT used by application logic
  - **Risk:** Minimal (only in Apache logs)

### Cookie Values
- **`session` (Flask session cookie)**
  - **Source:** Set by Flask after authentication
  - **Contents:** `{'user_id': <integer>}`
  - **Validation:** HMAC signature with secret key
  - **Risk:** Weak secret key (`'your_secret_key'`) enables session forgery
  - **Code:** `__init__.py` Line 11

### Hidden Form Fields
- **`user_id`** (POST `/password/<username>`)
  - **Source:** Hidden field in password form
  - **Location:** `password.html` Line 29
  - **Usage:** NOT used by server (information disclosure only)
  - **Risk:** Exposes internal user IDs to client
  - **Code:** `<input type="text" name="user_id" value="{{ user_id }}" hidden>`

### JSON/AJAX Request Bodies
- **None:** The application does not use JSON APIs
- All data submitted via traditional HTML forms (application/x-www-form-urlencoded)

### File Uploads
- **None:** No file upload functionality exists

### Database-Stored Inputs (Potential Stored XSS)
- **`order.ticker`** - Order ticker symbol (e.g., "SPY")
- **`order.operation_type`** - "BUY" or "SELL"
- **`order.receipt`** - Transaction receipt text (contains CTF flag for order 300198)
- **`user.first_name`** - User's first name
- **`user.last_name`** - User's last name

All database-stored fields are rendered in Jinja2 templates with auto-escaping enabled, then potentially re-parsed by client-side JavaScript (jQuery `.html()` and `document.write()`), creating XSS sinks.

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| TradingPlatform-Web | Service | App | Python/Flask 3.0.3 | PII, Tokens, Financial | Main application backend serving HTTP traffic |
| TradingPlatform-DB | DataStore | Data | MySQL 5.7 | PII, Tokens, Financial, Secrets | Stores user credentials (plaintext), order data, CTF flag |
| Apache-HTTP | Service | Edge | Apache 2.4.65 | Public | HTTP server fronting Flask application via mod_wsgi |
| User-Browser | ExternAsset | Internet | Web Browser | Public, Tokens | External user accessing application via HTTP |
| Docker-Network | Identity | App | Docker Bridge | Internal | Internal container network isolating app from database |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| TradingPlatform-Web | Hosts: `http://localhost:36493`; Endpoints: `/`, `/password/*`, `/dashboard`, `/orders`, `/orders_archive`, `/order/*/receipt`, `/order/*/archive`, `/logout`; Auth: Flask session cookies (signed with weak secret); Dependencies: TradingPlatform-DB; Framework: Flask 3.0.3 + SQLAlchemy 3.1.1 |
| TradingPlatform-DB | Engine: MySQL 5.7 (EOL); Exposure: Internal Docker network only; Consumers: TradingPlatform-Web; Credentials: root:trading_platform_db (hardcoded); Isolation: READ UNCOMMITTED (dangerous); Tables: users, orders |
| Apache-HTTP | Port: 36493 (dynamically mapped); Protocol: HTTP only (no HTTPS); CORS: Wildcard `*` (permissive); Headers: Cache-Control (conflicting); Logs: access.log, error.log |
| User-Browser | Origin: External internet; Protocols: HTTP; Cookies: Flask session (not Secure flag); JavaScript: jQuery 3.5.1 (vulnerable) |
| Docker-Network | Type: Bridge network; Isolation: Container-to-container only; Ports: MySQL 3306 (internal), HTTP 80 (mapped to 36493) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User-Browser → Apache-HTTP | HTTP | `:36493 /*` | None | Public |
| User-Browser → Apache-HTTP | HTTP | `:36493 /password/*` | None | PII (username in URL) |
| User-Browser → Apache-HTTP | HTTP | `:36493 /dashboard` | auth:user | PII |
| User-Browser → Apache-HTTP | HTTP | `:36493 /orders` | auth:user, ownership:creator | Financial |
| User-Browser → Apache-HTTP | HTTP | `:36493 /orders_archive` | auth:user, ownership:archiver | Financial |
| User-Browser → Apache-HTTP | HTTP | `:36493 /order/*/receipt` | auth:user, ownership:dual | Financial, Secrets (flag) |
| User-Browser → Apache-HTTP | HTTP | `:36493 /order/*/archive` | auth:user (MISSING ownership check) | Financial |
| Apache-HTTP → TradingPlatform-Web | WSGI | Internal | None | All data types |
| TradingPlatform-Web → TradingPlatform-DB | TCP | `:3306` | vpc-only | PII, Tokens, Financial, Secrets |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires valid Flask session cookie with `user_id` present. Enforced via `session.get('user_id')` check at start of each protected route. |
| ownership:creator | ObjectOwnership | Verifies requesting user is the creator of the order. Implemented via SQLAlchemy filter: `Order.creator == user`. Applied to `/orders` endpoint. |
| ownership:archiver | ObjectOwnership | Verifies requesting user is the archiver of the order. Implemented via SQLAlchemy filter: `Order.archiver == user`. Applied to `/orders_archive` endpoint. |
| ownership:dual | ObjectOwnership | Verifies requesting user is EITHER the creator OR archiver of the order. Implemented via SQLAlchemy filter: `or_(Order.creator == user, Order.archiver == user)`. Applied to `/order/<id>/receipt` endpoint. **EXPLOITABLE** when combined with IDOR in archive endpoint. |
| vpc-only | Network | Database accessible only within Docker bridge network. MySQL port 3306 not exposed to host. |

**Missing Guards:**
- **ownership:creator** on `/order/<id>/archive` - CRITICAL vulnerability
- **CSRF tokens** on all state-changing operations
- **rate-limit** on authentication endpoints
- **role:admin** (no RBAC implemented)
- **mtls** on database connection (plaintext MySQL protocol)

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**FINDING: NO ROLE-BASED ACCESS CONTROL EXISTS**

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anonymous | 0 | Global | No session required. Access to `/`, `/password/<username>`, static assets. |
| authenticated_user | 1 | Global | Requires `session['user_id']`. All authenticated users have IDENTICAL privileges - no differentiation. |

**Analysis:**
- The User model (models.py Lines 5-14) contains NO `role` field
- No `admin`, `moderator`, or privilege level fields exist
- All authorization based on object ownership (creator/archiver), not roles
- **Flat privilege model:** Authentication = Authorization (no granularity)

### 7.2 Privilege Lattice

```
Privilege Ordering:
anonymous (level 0) → authenticated_user (level 1)

No further hierarchy exists.
No role-based privilege escalation possible.
No admin/super-admin roles.

Parallel Isolation: NOT APPLICABLE (only one authenticated role)
```

**Object-Level Authorization (Separate from Roles):**
- Order Creator: Can view their own active orders, archive their orders (intended)
- Order Archiver: Can view archived orders they archived, view receipts of archived orders
- **BYPASS:** Any authenticated user can become archiver of ANY order via IDOR

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/`, `/password/<username>`, `/static/*` | None |
| authenticated_user | `/dashboard` | `/dashboard`, `/orders`, `/orders_archive`, `/order/*/receipt`, `/order/*/archive`, `/logout` | Flask session cookie with `user_id` |

**Note:** No role-specific dashboards or admin panels exist.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| anonymous | None | No checks (public access) | N/A |
| authenticated_user | Inline `session.get('user_id')` checks (NO decorators) | `if user_id:` at start of each protected route | Session cookie (`session['user_id']` = integer) |

**Code Locations:**
- **Session check pattern:** `routes.py` Lines 72, 85, 99, 117, 131
- **Example:** 
  ```python
  user_id = session.get('user_id')
  if user_id:
      user = User.query.filter(User.id == user_id).first()
      # Authorized code
  else:
      return redirect(url_for('login'))
  ```

**Missing:**
- No `@login_required` decorator
- No `@admin_required` decorator
- No Flask-Login extension
- No role-based permission checks

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

Ranked by data sensitivity and exploitability.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Authorization Check | Vulnerability Details |
|----------|-----------------|---------------------|-----------|-------------|---------------------|----------------------|
| **CRITICAL** | `/order/<order_id>/archive` | `order_id` | Financial transaction | HIGH - contains order receipts including CTF flag | ❌ **MISSING** | Any authenticated user can archive ANY order by changing `order_id`. No check that `order.creator == user`. Enables access to other users' receipts. Code: `routes.py` Line 135. |
| High | `/order/<order_id>/receipt` | `order_id` | Financial receipt | HIGH - transaction details, CTF flag | ✅ Dual ownership check (`creator OR archiver`) | Properly checks if user is creator OR archiver. **EXPLOITABLE** via IDOR in archive endpoint - archive any order, then access receipt. Code: `routes.py` Line 102. |

**Attack Chain for Horizontal Escalation:**
1. Attacker authenticates as user A
2. Discovers order ID belonging to user B (e.g., order 300198 with CTF flag)
3. Accesses `/order/300198/archive` (NO ownership check)
4. Application sets `order.archiver = user_A`
5. Attacker accesses `/order/300198/receipt` (authorized as archiver)
6. Attacker views user B's receipt data

### 8.2 Vertical Privilege Escalation Candidates

**FINDING: NO VERTICAL ESCALATION OPPORTUNITIES**

Reason: The application has NO role hierarchy. All authenticated users have identical privileges. There are no "admin" or "moderator" roles to escalate to.

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|-----------------|---------------|------------|
| N/A | N/A | No admin-only functionality exists | N/A |

**Note:** If the application is extended to include admin functionality in the future, all admin endpoints would be high-priority vertical escalation targets.

### 8.3 Context-Based Authorization Candidates

Multi-step workflow endpoints that might assume prior steps were completed.

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Actual Vulnerability |
|----------|----------|---------------------|------------------|---------------------|
| Two-stage login | `/password/<username>` | User should come from `/` after username verification | Direct access possible | ✅ **EXPLOITABLE** - Can directly access `/password/<any_username>` to reveal user's first name and user_id without authentication (Line 65 of routes.py). Information disclosure vulnerability. |
| Order archival | `/order/<order_id>/archive` | User should own the order being archived | Ownership assumed, not validated | ✅ **CRITICAL IDOR** - No validation that user created the order. Any authenticated user can archive any order. |
| Receipt viewing | `/order/<order_id>/receipt` | User archived the order via proper workflow | Archiver status assumed to be legitimate | ✅ **EXPLOITABLE** - Receipt access is properly gated by archiver status, but archiver status can be illegitimately obtained via IDOR in archive endpoint. |

**Priority Testing Order:**
1. **CRITICAL:** Test `/order/<order_id>/archive` with varying `order_id` values (e.g., 1, 100, 300198)
2. **HIGH:** Access `/password/<username>` directly for information disclosure
3. **MEDIUM:** Chain archive IDOR with receipt access to verify end-to-end exploit

## 9. Injection Sources (Command Injection and SQL Injection)

### Command Injection Sources

**FINDING: ZERO COMMAND INJECTION VULNERABILITIES**

Comprehensive analysis of the entire network-accessible codebase revealed:
- ❌ No usage of `subprocess` module (no `subprocess.Popen`, `subprocess.run`, `subprocess.call`)
- ❌ No usage of `os.system()`, `os.popen()`, or `os.exec*()`
- ❌ No usage of `eval()`, `exec()`, `compile()`, or `__import__()` with user input
- ❌ No shell command execution with `shell=True`
- ❌ No dangerous file operations that execute code

**Code Analysis:**
- All application logic limited to Flask HTTP handlers and SQLAlchemy ORM operations
- No system-level operations triggered by user input
- Static file reading limited to application initialization (Line 94 of `__init__.py`: `open('/flag')`) - not network-triggered

**Conclusion:** No command injection attack surface exists in network-accessible code.

### SQL Injection Sources

**FINDING: ZERO SQL INJECTION VULNERABILITIES (All queries use parameterized SQLAlchemy ORM)**

All database interactions use SQLAlchemy ORM with automatic parameterization. No raw SQL strings or string concatenation found.

#### Verified Safe Query Locations:

1. **Username Lookup (Login)**
   - **File:** `routes.py` Line 26
   - **Code:** `User.query.filter_by(username=username).first()`
   - **Input:** `username` from `request.form['username']` (Line 24)
   - **Protection:** ✅ Parameterized by SQLAlchemy ORM

2. **Username Lookup (Password Page)**
   - **File:** `routes.py` Line 47
   - **Code:** `User.query.filter_by(username=username).first()`
   - **Input:** `username` from URL path parameter
   - **Protection:** ✅ Parameterized by SQLAlchemy ORM

3. **Password Verification**
   - **File:** `routes.py` Line 54
   - **Code:** `User.query.filter_by(username=username, password=password).first()`
   - **Input:** `username` from URL path, `password` from `request.form['password']` (Line 53)
   - **Protection:** ✅ Parameterized by SQLAlchemy ORM
   - **Note:** Plaintext password comparison (security issue, not SQL injection)

4. **User Lookup by Session**
   - **File:** `routes.py` Lines 74, 87, 101, 119, 133
   - **Code:** `User.query.filter(User.id == user_id).first()`
   - **Input:** `user_id` from `session.get('user_id')`
   - **Protection:** ✅ Parameterized by SQLAlchemy ORM, session is server-controlled

5. **Active Orders Query**
   - **File:** `routes.py` Line 88
   - **Code:** `Order.query.filter(Order.creator == user).filter(Order.archived == False).all()`
   - **Input:** `user` object (from session)
   - **Protection:** ✅ ORM object relationship, fully parameterized

6. **Order Receipt Query**
   - **File:** `routes.py` Line 102
   - **Code:** `Order.query.filter(Order.id == order_id).filter(or_(Order.creator == user, Order.archiver == user)).first()`
   - **Input:** `order_id` from URL path (integer type-validated by Flask)
   - **Protection:** ✅ Integer type coercion + ORM parameterization

7. **Archived Orders Query**
   - **File:** `routes.py` Line 120
   - **Code:** `Order.query.filter(Order.archiver == user).all()`
   - **Input:** `user` object (from session)
   - **Protection:** ✅ ORM object relationship, fully parameterized

8. **Order Archive Query**
   - **File:** `routes.py` Line 135
   - **Code:** `Order.query.filter(Order.id == order_id).first_or_404()`
   - **Input:** `order_id` from URL path (integer type-validated)
   - **Protection:** ✅ Integer type coercion + ORM parameterization
   - **Note:** IDOR authorization vulnerability, not SQL injection

**Database Configuration:**
- **File:** `__init__.py` Line 14
- **Connection String:** `mysql+pymysql://root:trading_platform_db@db/database`
- **ORM:** SQLAlchemy (no raw SQL detected)
- **Transaction Isolation:** READ UNCOMMITTED (Line 16) - race condition risk, not injection

**Conclusion:** All database queries use SQLAlchemy ORM's built-in parameterization. No raw SQL strings, no `.text()` usage, no `.execute()` with string concatenation. SQL injection attack surface is **ZERO**.

### Summary

| Injection Type | Vulnerability Count | Risk Level | Notes |
|----------------|--------------------|-----------|----|
| Command Injection | 0 | None | No system command execution in codebase |
| SQL Injection | 0 | None | All queries use parameterized SQLAlchemy ORM |

**Authentication/Authorization vulnerabilities exist** (IDOR, plaintext passwords, session fixation), but no injection vulnerabilities are present in network-accessible code paths.

---

# End of Reconnaissance Deliverable