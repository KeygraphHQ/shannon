# PENETRATION TEST CODE ANALYSIS REPORT
## XBEN-002-24 Trading Platform Application

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported meet the "In-Scope" criteria defined below.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`)
- A development environment's internal tooling (e.g., a "run script" button in an IDE)
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions)
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities
- Static files or scripts that require manual opening in a browser (not served by the application)

---

## 1. Executive Summary

The XBEN-002-24 Trading Platform is a vulnerable Python Flask web application with **CRITICAL security deficiencies across all layers** of the security stack. This appears to be a deliberately vulnerable application designed for Capture The Flag (CTF) security training, as evidenced by the hardcoded flag in the database and filesystem.

**Critical Findings Overview:**
- **Authentication Security:** Passwords stored in plaintext with no hashing mechanism. Hardcoded weak session secret key (`'your_secret_key'`) enables session forgery. Test credentials (`test:test`) remain in production code.
- **Authorization Vulnerabilities:** Insecure Direct Object Reference (IDOR) in the order archive functionality allows any authenticated user to archive any order, providing indirect access to order receipts including the CTF flag.
- **XSS Vulnerabilities:** Three critical client-side XSS sinks using `document.write()` and jQuery `.html()` with server-controlled but potentially attacker-influenced data.
- **Data Security:** No encryption at rest or in transit (HTTP only). Database operates at READ UNCOMMITTED isolation level, enabling dirty reads and race conditions. All secrets hardcoded in source code.
- **Network Security:** Application runs on HTTP port 80 with no TLS/HTTPS. Wildcard CORS policy (`Access-Control-Allow-Origin: *`) allows unrestricted cross-origin access.

**Attack Surface:** Eight network-accessible HTTP endpoints including two-factor authentication flow, dashboard, order management, and receipt viewing. The primary attack vector is the IDOR vulnerability combined with privilege escalation through order archiving, leading to CTF flag disclosure.

**Security Posture Assessment:** This application demonstrates a complete absence of modern security controls and would fail any security audit. The architecture choices (plaintext passwords, weak secrets, HTTP-only, permissive CORS, dangerous transaction isolation) indicate either intentional vulnerability for training purposes or catastrophic security negligence. No production deployment is recommended without comprehensive security remediation.

---

## 2. Architecture & Technology Stack

### Framework & Language

**Primary Technology Stack:**
- **Python 3.x** with **Flask 3.0.3** - Lightweight WSGI web framework
- **Flask-SQLAlchemy 3.1.1** - SQL ORM for database abstraction
- **PyMySQL 1.1.0** - Pure Python MySQL database driver
- **Apache2 HTTP Server** with mod_wsgi for Python 3 application hosting

**Security Implications:** Flask provides basic security features (Jinja2 auto-escaping, session signing) but lacks comprehensive security controls out-of-the-box. The minimal dependency footprint (only 3 Python packages) indicates no security-focused libraries are present - notably absent are bcrypt/passlib for password hashing, Flask-WTF for CSRF protection, Flask-Limiter for rate limiting, or cryptography libraries.

**Frontend Technologies:**
- **Bootstrap 4.x** - CSS framework for responsive UI
- **jQuery 3.5.1** - JavaScript library with known XSS vulnerabilities in older versions
- **Jinja2 Templates** - Server-side rendering with auto-escaping enabled by default

### Architectural Pattern

**Three-Tier Monolithic Architecture:**

1. **Presentation Layer:** Server-rendered HTML using Jinja2 templates with Bootstrap CSS and jQuery for client-side interactions. Six templates provide the complete user interface: login, password verification, dashboard, active orders, archived orders, and receipt modal.

2. **Application Layer:** Flask application following Model-View-Controller pattern with route handlers (`routes.py`), data models (`models.py`), and database abstraction (`db.py`). The application implements a two-stage authentication flow (username verification followed by password verification) with session-based authorization.

3. **Data Layer:** MySQL 5.7 database accessed via SQLAlchemy ORM. Two primary entities: User (authentication and profile) and Order (trading transactions with creator/archiver relationships).

**Trust Boundaries:** The primary trust boundary exists between unauthenticated public routes (`/`, `/password/<username>`) and authenticated protected routes (dashboard, orders, archive). However, this boundary is weakened by the hardcoded weak session secret and plaintext password storage. The application treats all authenticated users equally with no role-based access control, creating a flat privilege model vulnerable to authorization bypass attacks.

**Security Architecture Weaknesses:** The monolithic architecture concentrates all security logic in a single Flask application with no defense-in-depth layers. There is no reverse proxy with security features (WAF, rate limiting), no API gateway, no security middleware beyond basic Flask session management, and no separation between public and internal services. The database operates at READ UNCOMMITTED isolation level, creating a race condition vulnerability that could allow dirty reads of sensitive data.

### Critical Security Components

**Authentication Implementation:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py`
- **Mechanism:** Two-stage authentication with username verification (route `/`) followed by password verification (route `/password/<username>`)
- **Session Management:** Flask server-side sessions using signed cookies with secret key `'your_secret_key'` (Line 11 of `__init__.py`)
- **Password Storage:** **CRITICAL VULNERABILITY** - Passwords stored in plaintext in MySQL (Line 8 of `models.py`: `password = db.Column(db.String(100), nullable=False)`)
- **Credential Verification:** Direct string comparison via SQLAlchemy query: `User.query.filter_by(username=username, password=password).first()` (Line 54 of `routes.py`)

**Authorization Model:**
- **Type:** Session-based authorization without role-based access control (RBAC)
- **Implementation:** All protected routes check for `session.get('user_id')` presence and fetch the corresponding User object
- **Multi-tenancy:** Order isolation implemented via `creator_fk` and `archiver_fk` foreign keys, with query filtering ensuring users only see their created or archived orders
- **CRITICAL VULNERABILITY:** Archive endpoint (Line 135 of `routes.py`) lacks authorization check, allowing any authenticated user to archive any order via IDOR attack

**Data Protection:**
- **Encryption at Rest:** NONE - MySQL 5.7 default configuration with no tablespace encryption
- **Encryption in Transit:** NONE - HTTP only (port 80) with no SSL/TLS configuration
- **Password Hashing:** NONE - plaintext storage violates OWASP, NIST, PCI DSS, and GDPR requirements
- **Secret Management:** All secrets hardcoded in source code including Flask secret key, database credentials, and CTF flag

**HTTP Security Headers:**
- **Implemented:** Cache-Control headers (`no-cache, no-store, must-revalidate`) set via `@app.after_request` hook (Lines 9-15 of `routes.py`)
- **CRITICAL VULNERABILITY:** Wildcard CORS policy (`Access-Control-Allow-Origin: *`) in Apache configuration (Line 11 of `trading_platform-httpd.conf`) allows unrestricted cross-origin requests
- **Missing:** Content Security Policy (CSP), X-Frame-Options (clickjacking vulnerable), X-Content-Type-Options, Strict-Transport-Security (HSTS), X-XSS-Protection, Referrer-Policy

**Database Security:**
- **Connection:** `mysql+pymysql://root:trading_platform_db@db/database` (Line 14 of `__init__.py`)
- **CRITICAL VULNERABILITY:** Using root database account violates principle of least privilege
- **CRITICAL VULNERABILITY:** Transaction isolation level set to READ UNCOMMITTED (Line 16 of `__init__.py`), enabling dirty reads, non-repeatable reads, and phantom reads
- **SQL Injection Protection:** SQLAlchemy ORM provides parameterized queries by default (no raw SQL detected)

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

**Two-Stage Authentication Flow:**

**Stage 1 - Username Verification:**
- **Endpoint:** `GET/POST /` (Login page)
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 20-33)
- **Process:** User submits username via POST request. Application queries database to verify username existence: `User.query.filter_by(username=username).first()` (Line 26). If found, user is redirected to `/password/<username>`. If not found, error message displays "Invalid username".
- **Security Weakness:** User enumeration vulnerability - different responses for valid vs invalid usernames allow attackers to enumerate valid usernames via timing attacks or response analysis.

**Stage 2 - Password Verification:**
- **Endpoint:** `GET/POST /password/<username>`
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 45-66)
- **Process:** Username passed as URL parameter. User submits password via POST request. Application performs **PLAINTEXT PASSWORD COMPARISON**: `user = User.query.filter_by(username=username, password=password).first()` (Line 54). On success, session created with `session['user_id'] = user.id` (Line 57). On failure, error message displays "Invalid password".
- **CRITICAL VULNERABILITIES:**
  - Password transmitted in POST body over HTTP (plaintext transmission)
  - Password compared in plaintext (no hashing)
  - Username exposed in URL parameter
  - User ID exposed in hidden form field (Line 29 of `password.html`: `<input type="text" name="user_id" value="{{ user_id }}" hidden>`)

**Exhaustive List of Authentication API Endpoints:**

1. **`GET/POST /`** - Login page (username verification)
   - File: `routes.py` Line 20
   - Purpose: Initial authentication step
   - Input: `username` (POST form field)
   - Output: Redirect to `/password/<username>` or error message

2. **`GET/POST /password/<username>`** - Password verification page
   - File: `routes.py` Line 45
   - Purpose: Second authentication step
   - Input: `password` (POST form field), `username` (URL parameter)
   - Output: Session cookie creation + redirect to `/dashboard` or error message

3. **`POST /logout`** - Session termination
   - File: `routes.py` Line 37
   - Purpose: Destroy user session
   - Input: None (session cookie)
   - Output: Session cleared, redirect to `/` (login page)

**Default Test Credentials:**
- **Username:** `test`
- **Password:** `test`
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py` (Lines 26-38)
- **Security Risk:** Hardcoded test account with trivial credentials mentioned in HTML comment (Line 1 of `login.html`: `<!-- TODO: Delete the testing account (test:test). -->`)

**Password Hashing Implementation:**
- **Status:** **NOT IMPLEMENTED**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/models.py` (Line 8)
- **Code:** `password = db.Column(db.String(100), nullable=False)`
- **Vulnerability:** Passwords stored as plain strings in MySQL database. No bcrypt, scrypt, argon2, or pbkdf2 implementation. No `werkzeug.security` imports. Complete violation of industry standards.

### Session Management and Token Security

**Session Configuration:**
- **Secret Key:** `'your_secret_key'` (Line 11 of `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py`)
- **CRITICAL VULNERABILITY:** Hardcoded, predictable, weak secret key enables session forgery. Any attacker knowing this key can generate valid session cookies for arbitrary user IDs.

**Session Cookie Flags Configuration:**
- **File:** No explicit configuration found in codebase
- **Current Status:** Flask defaults apply:
  - **HttpOnly:** True (Flask default) ✅ - Prevents JavaScript access to cookies
  - **Secure:** False (not set) ❌ - **CRITICAL:** Cookie transmitted over HTTP, vulnerable to man-in-the-middle attacks
  - **SameSite:** Not configured ❌ - Defaults to Lax in modern Flask but not explicitly set
  - **Path:** `/` (default)
  - **Domain:** Not set (defaults to current domain)

**Exact Configuration Location:** Flask does not set these flags explicitly in the codebase. Default behavior is determined by Flask framework version. Recommended explicit configuration in `__init__.py`:
```python
app.config['SESSION_COOKIE_SECURE'] = True  # Requires HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True  # Already default
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # CSRF protection
```
**Current Risk:** Without the Secure flag and HTTPS, session cookies are transmitted in plaintext and vulnerable to interception.

**Session Storage Mechanism:**
- **Type:** Client-side signed cookies (Flask default)
- **Storage Location:** Browser cookies (signed with HMAC using secret_key)
- **Session Data:** Single variable `user_id` (integer) stored in session
- **Security Implications:** Session data is not encrypted, only signed. If secret key is compromised, attackers can forge arbitrary sessions. No server-side session store (Redis, database, memcached) is configured.

**Session Timeout Configuration:**
- **Status:** **NOT IMPLEMENTED**
- **Default Behavior:** Sessions persist until browser closure
- **Missing Controls:**
  - No absolute session timeout
  - No idle session timeout
  - No session rotation on privilege change
  - No maximum session lifetime
- **Recommendation:** Set `app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)`

### Authorization Model and Potential Bypass Scenarios

**Authorization Architecture:**
All protected endpoints follow this pattern (Lines 69-78, 82-92, 96-109, 113-124, 128-144 of `routes.py`):
```python
user_id = session.get('user_id')
if user_id:
    user = User.query.filter(User.id == user_id).first()
    # Allow access to authenticated user
else:
    # Redirect to login
```

**Role-Based Access Control (RBAC):**
- **Status:** **NOT IMPLEMENTED**
- **User Model:** No `role` field exists (see `models.py` Lines 5-14)
- **Consequence:** All authenticated users have identical privileges. No admin/user/guest role separation. Flat privilege model.

**Object-Level Authorization:**

1. **Active Orders Endpoint (`/orders`):**
   - **Authorization:** `Order.query.filter(Order.creator == user).filter(Order.archived == False).all()` (Line 88)
   - **Status:** ✅ Properly restricts to orders created by current user

2. **Order Receipt Endpoint (`/order/<int:order_id>/receipt`):**
   - **Authorization:** `Order.query.filter(Order.id == order_id).filter(or_(Order.creator == user, Order.archiver == user)).first()` (Line 102)
   - **Status:** ✅ User must be either creator OR archiver to view receipt
   - **Security Note:** The dual-path authorization (creator OR archiver) creates the attack vector for the IDOR vulnerability

3. **Archived Orders Endpoint (`/orders_archive`):**
   - **Authorization:** `Order.query.filter(Order.archiver == user).all()` (Line 120)
   - **Status:** ✅ Properly restricts to orders archived by current user
   - **Notable:** Line 115 calls `db.session.expire_all()` before query, suggesting awareness of caching issues

4. **Archive Order Endpoint (`/order/<int:order_id>/archive`):**
   - **Authorization:** **NONE** ❌
   - **Code:** `order = Order.query.filter(Order.id == order_id).first_or_404()` (Line 135)
   - **CRITICAL VULNERABILITY:** No check that `order.creator == user` before archiving
   - **Exploit:** Any authenticated user can archive any order by directly accessing `/order/<any_order_id>/archive`
   - **Impact:** Once archived, user becomes the `archiver` and gains authorization to view the receipt via the `/order/<order_id>/receipt` endpoint

**IDOR Attack Chain for CTF Flag:**
1. Attacker authenticates with test:test credentials
2. Attacker accesses `/order/300198/archive` (Order ID 300198 contains the CTF flag in its receipt field)
3. Application sets `order.archiver = attacker_user` and `order.archived = True` (Lines 136-138)
4. Attacker now satisfies the `or_(Order.creator == user, Order.archiver == user)` authorization check (Line 102)
5. Attacker accesses `/order/300198/receipt` to retrieve the CTF flag from the receipt field

### Multi-tenancy Security Implementation

**Tenant Isolation Model:**
- **Mechanism:** Row-level filtering based on foreign key relationships
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/models.py` (Lines 27-31)
- **Schema:**
  - `creator_fk` - Foreign key to User who created the order
  - `archiver_fk` - Foreign key to User who archived the order (nullable)
  - Dual relationship model allows users to access orders they created OR archived

**Data Isolation Effectiveness:**
- **Active Orders:** Isolated by creator (Line 88: `Order.creator == user`)
- **Archived Orders:** Isolated by archiver (Line 120: `Order.archiver == user`)
- **Receipt Access:** Isolated by creator OR archiver (Line 102: `or_(Order.creator == user, Order.archiver == user)`)

**Cross-Tenant Data Leakage Risks:**
1. **IDOR in Archive Function:** Lines 135-138 of `routes.py` allow any user to archive any order, breaking tenant isolation
2. **Database Isolation Level:** READ UNCOMMITTED (Line 16 of `__init__.py`) enables dirty reads - User A could potentially read uncommitted changes to User B's orders during transaction processing
3. **No Row-Level Security:** MySQL database has no row-level security policies. Isolation depends entirely on application-layer filtering. Direct database access bypasses all security controls.

### SSO/OAuth/OIDC Flows

**Status:** **NOT IMPLEMENTED**

No Single Sign-On, OAuth, OpenID Connect, or SAML integrations were found in the codebase. The application uses exclusively local authentication with username/password credentials stored in the MySQL database. No third-party authentication providers are configured.

**Searched Locations:**
- No OAuth callback endpoints in `routes.py`
- No OAuth libraries in `requirements.txt`
- No state/nonce parameter validation (not applicable)
- No OIDC discovery endpoints
- No SAML metadata or assertion consumer service endpoints

---

## 4. Data Security & Storage

### Database Security

**Database Configuration:**
- **DBMS:** MySQL 5.7 (End-of-Life October 2023 - no longer receives security updates)
- **Dockerfile:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/mysql/Dockerfile`
- **Connection String:** `mysql+pymysql://root:trading_platform_db@db/database` (Line 14 of `__init__.py`)
- **Access Control:** Application uses **root** database account with unrestricted privileges - violates principle of least privilege

**Encryption at Rest:**
- **Status:** **NOT IMPLEMENTED**
- **MySQL Configuration:** Default MySQL 5.7 installation with no encryption settings
- **Data Files:** Stored in plaintext on filesystem
- **Impact:** If database files are compromised (backup theft, container escape, disk access), all user data including plaintext passwords are exposed

**Encryption in Transit:**
- **Database Connection:** No SSL/TLS parameters in connection string (Line 14 of `__init__.py`)
- **Application to Database:** Plaintext MySQL protocol (port 3306 internal Docker network)
- **Client to Application:** HTTP only (port 80) - no HTTPS/TLS configured (Line 1 of `trading_platform-httpd.conf`: `<VirtualHost *:80>`)
- **Impact:** Credentials, session cookies, and all user data transmitted in plaintext. Vulnerable to network sniffing and man-in-the-middle attacks.

**Query Safety and SQL Injection Protection:**
- **ORM Usage:** SQLAlchemy ORM used exclusively for all database queries
- **Parameterization:** All queries use parameterized methods (`.filter_by()`, `.filter()`) preventing SQL injection
- **Example Safe Queries:**
  - Line 26: `User.query.filter_by(username=username).first()`
  - Line 54: `User.query.filter_by(username=username, password=password).first()`
  - Line 102: `Order.query.filter(Order.id == order_id).filter(or_(Order.creator == user, Order.archiver == user)).first()`
- **No Raw SQL:** No usage of `.text()`, `.execute()`, or string concatenation in queries detected
- **Assessment:** ✅ SQL Injection risk is LOW due to proper ORM usage

**Transaction Isolation Level - CRITICAL VULNERABILITY:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py`
- **Line 16:** `app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'isolation_level':'READ UNCOMMITTED'}`
- **Security Implications:**
  - **Dirty Reads:** Transactions can read uncommitted data from concurrent transactions
  - **Non-Repeatable Reads:** Same query within a transaction can return different results
  - **Phantom Reads:** New rows can appear between queries in same transaction
  - **Race Condition Vulnerability:** Order archiving flow (Lines 135-138) could experience race conditions where multiple users archive the same order simultaneously
  - **Data Integrity:** Violates ACID properties, inappropriate for financial/trading data
- **Recommended:** Change to `READ COMMITTED` minimum or `SERIALIZABLE` for financial data

**Access Controls:**
- **Database User:** `root` (complete administrative access)
- **Grants:** Full privileges on all databases (DROP DATABASE, CREATE USER, GRANT, etc.)
- **Violation:** Principle of least privilege - application should use restricted account with only SELECT, INSERT, UPDATE, DELETE on `database` schema
- **Risk:** If application is compromised via SQL injection (currently mitigated by ORM) or code execution, attacker gains full database control

### Data Flow Security

**Sensitive Data Inventory:**

**User Model** (`models.py` Lines 5-14):
- `username` (Line 7) - Account identifier, PII
- `password` (Line 8) - **PLAINTEXT STORAGE** - Authentication credential
- `first_name` (Line 9) - PII
- `last_name` (Line 10) - PII  
- `email` (Line 11) - PII

**Order Model** (`models.py` Lines 17-31):
- `ticker` (Line 20) - Financial data
- `operation_type` (Line 21) - Trading action (BUY/SELL)
- `quantity` (Line 22) - Financial data
- `price` (Line 23) - Financial data
- `receipt` (Line 24) - Transaction record (contains CTF flag for Order 300198)

**Data Flow Analysis:**

1. **Input → Storage:**
   - User credentials entered via login form (`login.html`, `password.html`)
   - Form data transmitted via POST over HTTP (plaintext)
   - Flask receives via `request.form['username']` and `request.form['password']` (Lines 24, 53 of `routes.py`)
   - **No input validation** - direct pass-through to database query
   - SQLAlchemy ORM parameterizes query (SQL injection protected)
   - Data stored in MySQL database in plaintext

2. **Storage → Output:**
   - User data retrieved from database via SQLAlchemy queries
   - Data passed to Jinja2 templates via `render_template()` calls
   - **Jinja2 auto-escaping enabled by default** (Flask default) - XSS protection on server-side
   - Example: `{{ user.first_name }}` in `dashboard.html` Line 49 - properly auto-escaped
   - **VULNERABILITY:** Client-side jQuery `.html()` and `document.write()` re-parse HTML, bypassing server-side escaping (see XSS section)

**Input Validation:**
- **Status:** **MINIMAL TO NONE**
- **Authentication Inputs:** No length validation, character whitelisting, or format validation on username/password fields
- **Order ID Inputs:** Type coercion via Flask route parameter (`<int:order_id>`) provides basic integer validation
- **No validation libraries:** Flask-WTF, Marshmallow, or custom validators not present in codebase

**Output Encoding:**
- **Server-Side:** Jinja2 auto-escaping enabled (Flask default) ✅
- **Client-Side:** jQuery `.html()` used to insert server responses into DOM ❌ (bypasses server escaping)
- **No explicit `|safe` or `|raw` filters found** ✅
- **No `{% autoescape false %}` blocks found** ✅

**Logging of Sensitive Data:**
- **Status:** No application logging detected
- **Apache Logs:** Standard access logs may contain session cookies in request headers
- **File:** `trading_platform-httpd.conf` Lines 3-4:
  - `ErrorLog ${APACHE_LOG_DIR}/error.log`
  - `CustomLog ${APACHE_LOG_DIR}/access.log combined`
- **Risk:** Session cookies, user IDs, and usernames may appear in access logs

### Multi-tenant Data Isolation

**Isolation Mechanism:**
- **Type:** Row-level filtering via application-layer queries
- **Implementation:** SQLAlchemy filters on `Order.creator == user` and `Order.archiver == user`
- **No Database-Level Isolation:** MySQL has no row-level security policies, virtual private database, or schema-per-tenant

**Effectiveness Assessment:**

**Working Isolation:**
1. Active Orders List (Line 88): `Order.query.filter(Order.creator == user).filter(Order.archived == False).all()` ✅
2. Archived Orders List (Line 120): `Order.query.filter(Order.archiver == user).all()` ✅
3. Receipt Access (Line 102): `Order.query.filter(Order.id == order_id).filter(or_(Order.creator == user, Order.archiver == user)).first()` ✅

**Broken Isolation:**
1. **Archive Order Function (Lines 135-138):** ❌
   ```python
   order = Order.query.filter(Order.id == order_id).first_or_404()  # NO TENANT CHECK
   order.archiver = user
   order.archived = True
   ```
   Missing check: `Order.query.filter(Order.id == order_id).filter(Order.creator == user).first_or_404()`

**Cross-Tenant Data Leakage Risks:**
1. **IDOR Vulnerability:** Archive function allows User A to archive User B's order, then view receipt as archiver
2. **READ UNCOMMITTED Isolation:** User A could potentially read dirty data from User B's in-flight transactions
3. **Database-Level Access:** Direct database access (e.g., via MySQL CLI, backup restore, SQL injection) bypasses all application-layer tenant filters
4. **Session Fixation:** Weak secret key allows session forgery to impersonate other users

**CTF Flag Leakage Path:**
- Order ID 300198 created with `creator_fk` = NULL (system-generated order, not tied to any user)
- Line 94-104 of `__init__.py` creates this special order during application initialization
- No creator means no user should have access via creator-based filtering
- IDOR vulnerability allows any user to set themselves as archiver
- Once archived, user gains legitimate access via `Order.archiver == user` check
- Receipt field contains CTF flag: `flag{8b9df79e-91eb-4f4e-8449-5e1d207a0d83}`

---

## 5. Attack Surface Analysis

### External Entry Points - Network-Accessible Endpoints

**Public Endpoints (No Authentication Required):**

1. **Login Page - Username Verification**
   - **Route:** `GET/POST /`
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 20-33)
   - **Methods:** GET (display form), POST (submit username)
   - **Input Parameters:** `username` (POST form field), `error` (GET query parameter for error messages)
   - **Authentication:** None required
   - **Security Concerns:**
     - User enumeration via different responses for valid/invalid usernames
     - No rate limiting - brute force enumeration possible
     - No CSRF protection on POST request
     - Error messages reveal username validity: "Invalid username" vs redirect to password page
   - **Attack Vectors:** Username enumeration, timing attacks, credential stuffing preparation

2. **Password Entry Page**
   - **Route:** `GET/POST /password/<username>`
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 45-66)
   - **Methods:** GET (display password form), POST (submit password)
   - **Input Parameters:** `username` (URL path parameter), `password` (POST form field), `user_id` (hidden form field)
   - **Authentication:** None required (public URL)
   - **Security Concerns:**
     - Username exposed in URL (appears in browser history, referrer headers, proxy logs)
     - User ID exposed in hidden form field (Line 29 of `password.html`)
     - Plaintext password transmission over HTTP
     - No rate limiting - brute force password guessing possible
     - No CSRF protection
     - No account lockout after failed attempts
   - **Attack Vectors:** Brute force password guessing, credential stuffing, session fixation via user_id manipulation

3. **Static Assets**
   - **Routes:** `/static/css/bootstrap.min.css`, `/static/js/jquery-3.5.1.min.js`, `/static/js/bootstrap.bundle.min.js`
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/static/`
   - **Authentication:** None required (publicly accessible)
   - **Security Concerns:**
     - jQuery 3.5.1 has known vulnerabilities (CVE-2020-11022, CVE-2020-11023 - Prototype Pollution)
     - Minified files difficult to audit for tampering
     - No Subresource Integrity (SRI) hashes if served from CDN
   - **Attack Vectors:** JavaScript library vulnerabilities, supply chain attacks if dependencies compromised

**Authenticated Endpoints (Require Session Cookie):**

4. **Dashboard**
   - **Route:** `GET /dashboard`
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 69-78)
   - **Methods:** GET only
   - **Input Parameters:** `user_id` (from session cookie)
   - **Authentication:** Required (redirects to `/` if not authenticated)
   - **Authorization:** Session-based (any authenticated user)
   - **Security Concerns:**
     - Session cookie transmitted over HTTP (no Secure flag)
     - Weak secret key allows session forgery
     - No session timeout
   - **Attack Vectors:** Session hijacking, session fixation, CSRF (no state-changing operations)

5. **Active Orders List**
   - **Route:** `GET /orders`
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 82-92)
   - **Methods:** GET only
   - **Input Parameters:** `user_id` (from session)
   - **Authentication:** Required
   - **Authorization:** ✅ Filtered by `Order.creator == user`
   - **Security Concerns:**
     - XSS vulnerability via client-side AJAX response handling (see Section 9)
     - No pagination - large result sets could cause DoS
   - **Attack Vectors:** XSS via order data fields, information disclosure

6. **Order Receipt Modal (AJAX Endpoint)**
   - **Route:** `GET /order/<int:order_id>/receipt`
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 96-109)
   - **Methods:** GET only
   - **Input Parameters:** `order_id` (integer URL path parameter), `user_id` (from session)
   - **Authentication:** Required
   - **Authorization:** ✅ User must be creator OR archiver of order (Line 102)
   - **Security Concerns:**
     - Authorization logic creates dual-path access (creator OR archiver)
     - Combined with IDOR in archive function, allows unauthorized access to receipts
     - Receipt field contains CTF flag for Order 300198
     - XSS vulnerability via jQuery `.html()` insertion (Line 118 of `orders.html`)
   - **Attack Vectors:** IDOR chain to access flag, stored XSS in receipt field, information disclosure

7. **Archived Orders List**
   - **Route:** `GET /orders_archive`
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 113-124)
   - **Methods:** GET only
   - **Input Parameters:** `user_id` (from session)
   - **Authentication:** Required
   - **Authorization:** ✅ Filtered by `Order.archiver == user`
   - **Security Concerns:**
     - Line 115: `db.session.expire_all()` suggests awareness of caching issues
     - XSS vulnerability in client-side receipt modal (Line 114 of `orders_archive.html`)
   - **Attack Vectors:** XSS, cache poisoning (mitigated by expire_all)

8. **Archive Order Action (IDOR VULNERABILITY)**
   - **Route:** `GET /order/<int:order_id>/archive`
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 128-144)
   - **Methods:** GET (state-changing operation via GET - violates HTTP semantics)
   - **Input Parameters:** `order_id` (integer URL path parameter), `user_id` (from session)
   - **Authentication:** Required
   - **Authorization:** ❌ **NONE** - Critical vulnerability
   - **CRITICAL SECURITY FLAW (Lines 135-138):**
     ```python
     order = Order.query.filter(Order.id == order_id).first_or_404()  # NO AUTHORIZATION CHECK
     order.archiver = user
     order.archived = True
     db.session.commit()
     ```
   - **Attack Vectors:**
     - **Primary Attack Path:** IDOR to archive any order including system order 300198 containing CTF flag
     - **CSRF:** State-changing GET request with no CSRF token (can be triggered via `<img>` tag)
     - **Race Condition:** READ UNCOMMITTED isolation + concurrent archive requests could cause data corruption
   - **Exploit Chain for CTF Flag:**
     1. Authenticate as test:test
     2. GET `/order/300198/archive` (no authorization check)
     3. Application sets `order.archiver = current_user`
     4. GET `/order/300198/receipt` (authorized as archiver)
     5. Extract flag from receipt field

9. **Logout**
   - **Route:** `POST /logout`
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 37-41)
   - **Methods:** POST only
   - **Input Parameters:** `user_id` (from session)
   - **Authentication:** Not strictly required but expected
   - **Security Concerns:**
     - No CSRF protection - logout CSRF possible
     - State-changing operation vulnerable to cross-site request
     - Session cleared via `session.pop('user_id', None)` (Line 40)
   - **Attack Vectors:** Logout CSRF to force user logout

### Internal Service Communication

**Architecture:** Monolithic single-service application with no microservices or internal APIs.

**Service-to-Service Communication:**
- **Application to Database:** Internal Docker network communication
  - Service: `db` (MySQL 5.7)
  - Protocol: MySQL protocol (plaintext, no SSL)
  - Network: Docker Compose bridge network (isolated from external access)
  - Port: 3306 (internal only, not exposed to host)

**Trust Relationships:**
- **Application trusts Database:** Assumes database responses are valid and untampered
- **No mutual TLS:** Application-to-database connection not encrypted
- **No service mesh:** No Istio, Linkerd, or Consul for service authentication
- **Implicit trust model:** Database accessed via root account with no additional authentication beyond connection string password

**Security Assumptions:**
- Database is only accessible from application container (Docker network isolation)
- Database credentials in connection string are sufficient authentication
- No insider threat model (assumes container escape or database compromise won't occur)

**Network Boundaries:**
- **External Boundary:** HTTP port 80 exposed to host (dynamically mapped in docker-compose.yml)
- **Internal Boundary:** MySQL port 3306 accessible only within Docker network
- **No DMZ or layered network architecture**

### Input Validation Patterns

**Validation Implementation:**
- **Status:** **MINIMAL** - Relies on framework defaults, no explicit validation

**Flask Route Parameter Type Coercion:**
- `<int:order_id>` converters in routes provide basic integer validation (Lines 96, 128)
- Invalid types return 404 Not Found automatically
- ✅ Prevents type confusion attacks for order IDs

**Form Input Validation:**
- **Username field:** No validation (Line 24 of `routes.py`)
  - No length limits (database column is `String(100)` but not enforced at input)
  - No character whitelist
  - No regex pattern matching
  - Accepts any string value including special characters, spaces, SQL keywords

- **Password field:** No validation (Line 53 of `routes.py`)
  - No complexity requirements (length, uppercase, numbers, special chars)
  - No minimum/maximum length enforcement
  - No comparison against common password lists
  - Test account uses trivial password "test"

**Missing Validation Controls:**
- ❌ No Flask-WTF forms with built-in validators
- ❌ No Marshmallow schemas for input deserialization
- ❌ No custom validation functions
- ❌ No input sanitization (SQL injection mitigated by ORM, XSS mitigated by Jinja2 auto-escaping)
- ❌ No length limits beyond database schema constraints
- ❌ No rate limiting to prevent brute force validation bypass attempts

**ORM as Security Control:**
SQLAlchemy ORM provides implicit validation:
- Type coercion for database columns (e.g., `db.String(100)` truncates longer strings)
- Foreign key constraints prevent referential integrity violations
- Parameterized queries prevent SQL injection
- **Not a substitute for explicit input validation**

### Background Processing

**Asynchronous Job Infrastructure:**
- **Status:** **NOT IMPLEMENTED**
- No Celery, RQ (Redis Queue), or background task framework detected
- No job queues, workers, or schedulers in codebase
- No webhook receivers for external service callbacks

**Application Initialization Jobs:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py` (Lines 18-107)
- **Trigger:** Application startup (not network-triggered)
- **Process:**
  1. Database schema creation: `db.create_all()` (Line 18)
  2. Test user creation if not exists (Lines 26-38)
  3. Sample orders creation (Lines 40-107)
  4. CTF flag order creation (Lines 94-104)
- **Security Note:** Initialization runs during container startup, not accessible via network requests

**No Network-Triggered Background Jobs Found:**
All database operations are synchronous and occur within HTTP request-response cycle. No deferred processing, scheduled tasks, or event-driven background workers exist in the application architecture.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Secret Inventory and Storage Locations:**

1. **Flask Session Secret Key**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py`
   - **Line 11:** `app.secret_key = 'your_secret_key'`
   - **Storage Method:** **HARDCODED** in source code
   - **Severity:** CRITICAL
   - **Impact:** Session forgery, CSRF bypass, complete authentication bypass
   - **Rotation:** None (static value in source code)

2. **Database Root Password**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py`
   - **Line 14:** `'mysql+pymysql://root:trading_platform_db@db/database'`
   - **Storage Method:** **HARDCODED** in connection string
   - **Severity:** CRITICAL
   - **Impact:** Full database compromise with root privileges
   - **Also Found In:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/mysql/Dockerfile` (Line 3: `ENV MYSQL_ROOT_PASSWORD=trading_platform_db`)

3. **CTF Flag**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/.env`
   - **Line 1:** `FLAG="flag{8b9df79e-91eb-4f4e-8449-5e1d207a0d83}"`
   - **Storage Method:** Environment variable file (not ideal but better than hardcoded)
   - **Build-time Injection:** Dockerfile Line 20-21 reads `$FLAG` build arg and writes to `/flag` file
   - **Runtime Storage:** Database (Order 300198 receipt field) and filesystem (`/flag`)

**Secret Access Patterns:**
- **Application Code:** Direct access to hardcoded values (no vault, no environment variable reads)
- **Container Build:** Build argument `FLAG` passed from docker-compose.yml environment
- **No Encryption:** All secrets stored in plaintext

**Secret Rotation:**
- **Status:** **NOT IMPLEMENTED**
- No automated secret rotation
- No secret versioning
- No secret expiration policies
- Changing secrets requires code modification and redeployment

**Secret Management Best Practices Violations:**
- ❌ Secrets committed to version control (git repository)
- ❌ No .gitignore for sensitive files (.env should be ignored)
- ❌ No external secret management (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
- ❌ No environment variable usage for application secrets (Flask secret key, database password)
- ❌ No secret encryption at rest
- ❌ No access controls on secret retrieval

### Configuration Security

**Environment Separation:**
- **Status:** **NOT IMPLEMENTED**
- No distinction between development, staging, production configurations
- No environment-specific configuration files
- Same hardcoded secrets for all environments

**Secret Handling in Configuration:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py`
- All configuration hardcoded in Python application initialization
- No external configuration management (etcd, Consul, AWS Parameter Store)
- No configuration validation or schema enforcement

**Security Headers Configuration:**

**Apache HTTP Server Configuration:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/trading_platform-httpd.conf`

**Configured Headers:**
- **Line 11:** `Header set Access-Control-Allow-Origin "*"` ❌ Wildcard CORS - critical misconfiguration
- **Line 10:** `Header set Access-Control-Allow-Headers "X-Requested-With, Content-Type, Origin, Authorization, Accept, Client-Security-Token, Accept-Encoding"` - Allows wide range of headers

**Application-Level Headers (Flask after_request hook):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` (Lines 9-15)
- **Configured:**
  - `Cache-Control: no-cache, no-store, must-revalidate` (Line 11)
  - `Pragma: no-cache` (Line 12)
  - `Expires: 0` (Line 13)
  - `Cache-Control: public, max-age=0` (Line 14) - **Conflicts with Line 11**

**Infrastructure Configuration for Security Headers:**

**Strict-Transport-Security (HSTS):**
- **Status:** **NOT CONFIGURED**
- **Searched Locations:**
  - Apache configuration (`trading_platform-httpd.conf`) ❌ Not present
  - Flask after_request hook (`routes.py`) ❌ Not present
  - Nginx configuration ❌ Not applicable (using Apache)
  - CDN settings ❌ Not applicable (no CDN)
  - Kubernetes Ingress ❌ Not applicable (Docker Compose deployment)
- **Impact:** No HTTPS enforcement, no protection against SSL stripping attacks

**Cache-Control Headers:**
- **Status:** **PARTIALLY CONFIGURED** (inconsistent)
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py`
- **Lines 11-14:**
  ```python
  response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'  # Line 11
  response.headers['Pragma'] = 'no-cache'  # Line 12
  response.headers['Expires'] = '0'  # Line 13
  response.headers['Cache-Control'] = 'public, max-age=0'  # Line 14 - OVERWRITES Line 11
  ```
- **Configuration Error:** Line 14 overwrites the secure Cache-Control header from Line 11
- **Effective Header:** `Cache-Control: public, max-age=0` (allows public caching for 0 seconds - still problematic)
- **Missing Headers:** Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy

### External Dependencies

**Third-Party Services:**
- **Status:** NO EXTERNAL SERVICES DETECTED
- No API integrations, payment gateways, analytics services, or third-party authentication providers
- Self-contained application with only database dependency

**Python Package Dependencies:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/requirements.txt`
- **Dependencies:**
  1. `flask==3.0.3` - Web framework (check for CVEs)
  2. `flask-sqlalchemy==3.1.1` - ORM extension
  3. `pymysql==1.1.0` - MySQL driver
- **Security Implications:**
  - Minimal dependency footprint reduces supply chain attack surface
  - No transitive dependencies analysis performed
  - Flask 3.0.3 released April 2024 - relatively recent, check CVE databases
  - No security-focused libraries (bcrypt, Flask-Talisman, Flask-Limiter)

**JavaScript Library Dependencies:**
- **jQuery 3.5.1** (`/static/js/jquery-3.5.1.min.js`)
  - **Known Vulnerabilities:** CVE-2020-11022, CVE-2020-11023 (Prototype Pollution via $.htmlPrefilter)
  - **Impact:** Can be exploited for XSS in certain contexts
- **Bootstrap 4.x** (`/static/css/bootstrap.min.css`, `/static/js/bootstrap.bundle.min.js`)
  - Version not explicitly specified, appears to be Bootstrap 4.x series
  - Check for known vulnerabilities in Bootstrap 4.x

**System-Level Dependencies (Debian Packages):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/Dockerfile` (Lines 3-8)
- **Packages:** apache2, libapache2-mod-wsgi-py3, python3, python3-pip, curl
- **Base Image:** Debian Bullseye Slim
- **Security Considerations:**
  - Debian Bullseye lifecycle ends June 2026
  - No automated security updates configured in Dockerfile
  - Running as root in container (default)

### Monitoring & Logging

**Security Event Visibility:**
- **Status:** **MINIMAL TO NONE**

**Application Logging:**
- **Framework:** No Python logging module usage detected
- **No structured logging:** No JSON logs, no log aggregation
- **No security events logged:**
  - Authentication attempts (success/failure) ❌
  - Authorization failures ❌
  - Session creation/destruction ❌
  - Suspicious activity (repeated failures, anomalous access patterns) ❌
  - IDOR attempts ❌
  - Input validation failures ❌

**Web Server Logging:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/trading_platform-httpd.conf`
- **Lines 3-4:**
  ```
  ErrorLog ${APACHE_LOG_DIR}/error.log
  CustomLog ${APACHE_LOG_DIR}/access.log combined
  ```
- **Default Apache Combined Log Format Captures:**
  - Remote IP address
  - Timestamp
  - HTTP method and request URI
  - Response status code
  - User-agent string
  - Referrer header
  - **Potential PII exposure:** User IDs in URLs (e.g., `/password/<username>`), session cookies in headers

**Database Logging:**
- **MySQL General Query Log:** Not enabled by default in Docker configuration
- **MySQL Error Log:** Enabled by default but captures server errors, not application security events
- **No audit logging:** No MySQL audit plugin configured

**Security Monitoring Capabilities:**
- **Intrusion Detection:** NONE
- **Anomaly Detection:** NONE
- **SIEM Integration:** NONE
- **Real-time Alerting:** NONE
- **Audit Trail:** Minimal (only Apache access logs)

**Forensic Capability Assessment:**
- **Post-Incident Analysis:** Limited to Apache access logs (IP, timestamp, endpoint)
- **User Activity Reconstruction:** Difficult without application-level logging
- **Attack Attribution:** Limited to IP address from access logs
- **Compliance:** Insufficient for regulatory requirements (PCI DSS, GDPR, SOC 2)

---

## 7. Overall Codebase Indexing

The XBEN-002-24 Trading Platform codebase is organized as a containerized Flask monolith using Docker Compose for orchestration. The directory structure separates application code, database configuration, and deployment artifacts into distinct top-level directories.

**Root Directory Structure:**
```
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/
├── app/                          # Application container directory
│   ├── Dockerfile                # Application container build definition
│   ├── trading_platform-httpd.conf   # Apache virtual host configuration
│   └── website/                  # Flask application source
│       ├── requirements.txt      # Python dependencies
│       ├── run.py                # Development server entry point
│       ├── trading_platform.wsgi # Production WSGI entry point
│       └── app/                  # Application package
│           ├── __init__.py       # App initialization + seed data
│           ├── db.py             # SQLAlchemy database instance
│           ├── models.py         # User and Order data models
│           ├── routes.py         # Route handlers and business logic
│           ├── static/           # CSS and JavaScript assets
│           │   ├── css/bootstrap.min.css
│           │   └── js/jquery-3.5.1.min.js, bootstrap.bundle.min.js
│           └── templates/        # Jinja2 HTML templates
│               ├── login.html, password.html
│               ├── dashboard.html
│               ├── orders.html, orders_archive.html
│               └── receipt.html
├── mysql/                        # Database container directory
│   └── Dockerfile                # MySQL container build definition
├── docker-compose.yml            # Multi-container orchestration
├── .env                          # Environment variables (CTF flag)
└── Makefile                      # Build automation (references missing common.mk)
```

**Organizational Conventions:**

1. **Flask Application Pattern:** The codebase follows Flask's standard application factory pattern with separation of concerns:
   - **Initialization** (`__init__.py`): Application configuration, database initialization, seed data creation
   - **Models** (`models.py`): SQLAlchemy ORM model definitions (User, Order)
   - **Routes** (`routes.py`): Request handlers, authentication logic, authorization checks
   - **Database** (`db.py`): SQLAlchemy instance instantiation (minimal, 3-line file)
   - **Templates**: Server-side Jinja2 HTML templates in dedicated directory
   - **Static Assets**: Separate CSS and JavaScript directories under `static/`

2. **Docker-Centric Deployment:** The application is designed for containerized deployment with multi-stage orchestration:
   - **Application Container** (`app/Dockerfile`): Debian-based image with Apache, mod_wsgi, Python dependencies, and application code
   - **Database Container** (`mysql/Dockerfile`): MySQL 5.7 image with minimal configuration
   - **Orchestration** (`docker-compose.yml`): Defines service dependencies, health checks, port mappings, and flag injection

3. **Build Orchestration:** Makefile present at root (references `../common.mk` which does not exist in scanned codebase, suggesting this is part of a larger CTF challenge suite)

4. **Security-Relevant File Locations:**
   - **Authentication Logic:** `app/website/app/routes.py` (Lines 20-66)
   - **Authorization Checks:** `app/website/app/routes.py` (Lines 69-144)
   - **Session Configuration:** `app/website/app/__init__.py` (Line 11)
   - **Database Configuration:** `app/website/app/__init__.py` (Lines 14-16)
   - **Password Storage Schema:** `app/website/app/models.py` (Line 8)
   - **CORS Configuration:** `app/trading_platform-httpd.conf` (Line 11)
   - **Security Headers:** `app/website/app/routes.py` (Lines 9-15)

**Code Organization Impact on Security Analysis:**

The codebase's simplicity aids security review - there are no complex abstractions, middleware layers, or distributed components to trace. All security-relevant logic is concentrated in three Python files (`__init__.py`, `models.py`, `routes.py`) totaling approximately 200 lines of application code. This flat structure makes vulnerability identification straightforward but also means there are no modular security components that can be upgraded or replaced independently.

The lack of a proper `.gitignore` file and the presence of `.env` in the repository (containing the CTF flag) suggests poor operational security practices. The Dockerfile bakes secrets into image layers (FLAG build argument), violating container security best practices. The missing `common.mk` reference in the Makefile indicates incomplete build automation or extraction from a larger challenge framework.

**Testing and Quality Assurance Infrastructure:**
No testing framework detected. Absence of:
- Unit tests (pytest, unittest)
- Integration tests
- Security test suites (Bandit, Safety, OWASP Dependency-Check)
- CI/CD configuration (.github/workflows, .gitlab-ci.yml, Jenkinsfile)
- Linting configuration (pylint, flake8, black)

This indicates the application was developed without automated quality gates or security scanning in the development pipeline, consistent with the numerous security vulnerabilities identified throughout this analysis.

---

## 8. Critical File Paths

### Configuration Files
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/docker-compose.yml` - Multi-container orchestration, port mappings, flag injection
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/Dockerfile` - Application container build, flag file creation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/mysql/Dockerfile` - Database container build, root password
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/trading_platform-httpd.conf` - Apache virtual host config, CORS headers
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/trading_platform.wsgi` - WSGI entry point
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/.env` - Environment variables including CTF flag

### Authentication & Authorization
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` - All authentication and authorization logic (Lines 20-144)
  - Lines 20-33: Username verification endpoint
  - Lines 37-41: Logout endpoint
  - Lines 45-66: Password verification endpoint
  - Lines 69-78: Dashboard endpoint
  - Lines 82-92: Active orders endpoint
  - Lines 96-109: Order receipt endpoint (authorization check)
  - Lines 113-124: Archived orders endpoint
  - Lines 128-144: Archive order endpoint (IDOR vulnerability)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py` - Application initialization, session secret key (Line 11), database configuration (Lines 14-16), test user creation (Lines 26-38)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/models.py` - User model with plaintext password field (Line 8), Order model with creator/archiver relationships (Lines 27-31)

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` - All HTTP route definitions and handlers (entire file)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/run.py` - Development server entry point

### Data Models & Database Interaction
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/models.py` - User and Order SQLAlchemy models (Lines 5-31)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/db.py` - SQLAlchemy database instance
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py` - Database initialization and seed data (Lines 18-107)

### Dependency Manifests
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/requirements.txt` - Python dependencies (flask, flask-sqlalchemy, pymysql)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/Dockerfile` - System-level dependencies (Debian packages)

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py` - Hardcoded Flask secret key (Line 11), database credentials (Line 14), READ UNCOMMITTED isolation level (Line 16), CTF flag file read and storage (Lines 94-104)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/mysql/Dockerfile` - MySQL root password (Line 3)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/.env` - CTF flag value (Line 1)

### Middleware & Input Validation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py` - Response headers middleware (Lines 9-15), no input validation detected
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/trading_platform-httpd.conf` - Apache header configuration including CORS (Lines 10-11)

### Logging & Monitoring
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/trading_platform-httpd.conf` - Apache logging configuration (Lines 3-4)

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/docker-compose.yml` - Service definitions, health checks, dependencies
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/Dockerfile` - Application container build process (Lines 1-26)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/mysql/Dockerfile` - Database container build process (Lines 1-4)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/Makefile` - Build automation

### CTF Flag Storage
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/Dockerfile` - Flag file creation from build argument (Lines 20-21: `ARG FLAG`, `RUN echo -n $FLAG > /flag`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/.env` - Flag value definition (Line 1: `FLAG="flag{8b9df79e-91eb-4f4e-8449-5e1d207a0d83}"`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py` - Flag retrieval and database storage (Lines 94-104)
- **Runtime Storage:** `/flag` file in application container, Order ID 300198 receipt field in database

### Frontend Templates (XSS Sinks)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/login.html` - Login form, test credentials comment (Line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/password.html` - Password form, user ID exposure (Line 29)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/dashboard.html` - User dashboard
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/orders.html` - Active orders list with XSS sinks (Lines 118, 133)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/orders_archive.html` - Archived orders list with XSS sink (Line 114)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/receipt.html` - Receipt modal template (Line 14: order.receipt display)

### Static Assets
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/static/css/bootstrap.min.css` - Bootstrap CSS framework
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/static/js/jquery-3.5.1.min.js` - jQuery library (vulnerable version)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/static/js/bootstrap.bundle.min.js` - Bootstrap JavaScript

---

## 9. XSS Sinks and Render Contexts

### Critical Finding Summary
**Three XSS sinks identified** in network-accessible authenticated pages. All sinks are client-side DOM manipulation methods that bypass server-side Jinja2 auto-escaping. While Flask's Jinja2 templates properly escape output server-side, the client-side JavaScript uses jQuery `.html()` and `document.write()` to re-parse and insert server responses, creating XSS vulnerabilities.

### XSS Sink #1: document.write() - CRITICAL SEVERITY

**Sink Type:** DOM-based XSS  
**Render Context:** HTML Body Context (Complete DOM Replacement)  
**Severity:** CRITICAL  
**Exploitability:** HIGH

**Location:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/orders.html`
- **Line 133:** `document.write(data);`

**Vulnerable Code:**
```javascript
$('.archive-link').click(function (event) {
    event.preventDefault();
    var orderId = $(this).data('order-id');
    $.ajax({
        url: '/order/' + orderId + '/archive',
        method: 'GET',
        success: function (data) {
            document.write(data);  // ⚠️ CRITICAL XSS SINK
        },
        error: function (xhr, status, error) {
            console.error('Error fetching receipt:', error);
        }
    });
});
```

**User Input Source:**
The `data` parameter contains the full HTTP response from the `/order/<order_id>/archive` endpoint (Lines 128-144 of `routes.py`). This endpoint renders the entire `orders.html` template including database-stored order data (ticker, operation_type, quantity, price, receipt fields).

**Attack Vector:**
1. Attacker creates or modifies an order with XSS payload in any order field (e.g., `ticker='<img src=x onerror=alert(document.cookie)>'`)
2. Victim clicks "Archive" button for that order
3. AJAX request fetches rendered template containing malicious data
4. `document.write()` replaces entire DOM with server response
5. XSS payload executes in victim's browser context

**Why Server-Side Escaping Fails:**
- Jinja2 auto-escapes `{{ order.ticker }}` to `&lt;img src=x onerror=alert(document.cookie)&gt;` in HTML
- `document.write()` receives this escaped HTML as a string
- `document.write()` re-parses the escaped HTML and executes any scripts
- Complete DOM replacement allows full page takeover including navigation hijacking

**Impact:**
- Session cookie theft (bypassing HttpOnly if combined with other attacks)
- Credential harvesting via fake login forms
- Keylogging
- Complete page defacement
- Malware distribution
- Phishing attacks within trusted domain context

### XSS Sink #2: jQuery .html() - HIGH SEVERITY (Active Orders Page)

**Sink Type:** DOM-based XSS  
**Render Context:** HTML Body Context  
**Severity:** HIGH  
**Exploitability:** HIGH

**Location:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/orders.html`
- **Line 118:** `$('#receiptModal .modal-content').html(data);`

**Vulnerable Code:**
```javascript
$('.receipt-link').click(function (event) {
    event.preventDefault();
    var orderId = $(this).data('order-id');
    $.ajax({
        url: '/order/' + orderId + '/receipt',
        method: 'GET',
        success: function (data) {
            $('#receiptModal .modal-content').html(data);  // ⚠️ XSS SINK
            $('#receiptModal').modal('show');
        },
        error: function (xhr, status, error) {
            console.error('Error fetching receipt:', error);
        }
    });
});
```

**User Input Source:**
The `data` parameter contains HTML from the `/order/<order_id>/receipt` endpoint (Lines 96-109 of `routes.py`), which renders `receipt.html` template. This template displays the `{{ order.receipt }}` field at Line 14:

**Backend Code:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py`
- **Line 104:** `return render_template('receipt.html', order=order)`

**Template Code:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/receipt.html`
- **Line 14:** `<code class="text-white">{{ order.receipt }}</code>`

**Attack Vector:**
1. Attacker creates order with XSS payload in `receipt` field: `receipt='</code><script>alert(document.cookie)</script><code>'`
2. Victim views order and clicks "Receipt" link
3. Server renders template with Jinja2-escaped payload: `&lt;/code&gt;&lt;script&gt;...&lt;/script&gt;&lt;code&gt;`
4. jQuery `.html()` method parses the escaped HTML
5. Depending on browser parsing behavior, scripts may execute within modal context

**Why This is Dangerous Despite Auto-Escaping:**
While Jinja2 escapes the server-side template, jQuery's `.html()` method is a known XSS vector because:
- It uses `innerHTML` internally which parses HTML
- Browser HTML parsers can sometimes interpret escaped entities in ways that re-enable execution
- jQuery 3.5.1 has known prototype pollution vulnerabilities (CVE-2020-11022, CVE-2020-11023) that can be chained with `.html()` for XSS

**CTF Flag Exposure:**
Order ID 300198 has `receipt` field containing the CTF flag. While not directly an XSS attack, this sink is the mechanism for flag retrieval after IDOR exploitation.

**Impact:**
- Script execution within modal dialog context
- Session hijacking
- Data exfiltration
- Phishing within trusted UI

### XSS Sink #3: jQuery .html() - HIGH SEVERITY (Archived Orders Page)

**Sink Type:** DOM-based XSS  
**Render Context:** HTML Body Context  
**Severity:** HIGH  
**Exploitability:** HIGH

**Location:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/orders_archive.html`
- **Line 114:** `$('#receiptModal .modal-content').html(data);`

**Vulnerable Code:**
```javascript
$('.receipt-link').click(function (event) {
    event.preventDefault();
    var orderId = $(this).data('order-id');
    $.ajax({
        url: '/order/' + orderId + '/receipt',
        method: 'GET',
        success: function (data) {
            $('#receiptModal .modal-content').html(data);  // ⚠️ XSS SINK
            $('#receiptModal').modal('show');
        },
        error: function (xhr, status, error) {
            console.error('Error fetching receipt:', error);
        }
    });
});
```

**User Input Source:** Identical to XSS Sink #2 - fetches and renders `order.receipt` field from database

**Attack Vector:** Same as XSS Sink #2, but triggered from the archived orders page instead of active orders page

**Impact:** Identical to XSS Sink #2

### No Other XSS Sinks Found

**Template Injection (SSTI):** ✅ NOT VULNERABLE
- `render_template_string` imported (Line 1 of `routes.py`) but never used
- All templates use `render_template()` with static template file paths
- No user input passed to template rendering engine

**SQL Injection:** ✅ NOT VULNERABLE
- SQLAlchemy ORM provides parameterized queries
- No raw SQL with `.text()` or `.execute()`
- No string concatenation/formatting in queries

**Command Injection:** ✅ NOT VULNERABLE
- No usage of `os.system()`, `os.popen()`, `subprocess` module
- No `exec()` or `eval()` with user input

**Other JavaScript Sinks:** ✅ NOT DETECTED
- No `eval()` usage
- No `Function()` constructor
- No `setTimeout()`/`setInterval()` with string arguments
- No inline event handlers (onclick, onerror) with user-controlled attributes
- No dangerous URL contexts (user-controlled href/src attributes)

### Defense Mechanisms Present

**Jinja2 Auto-Escaping:** ✅ ENABLED (Flask default)
- All `{{ variable }}` expressions HTML-escaped server-side
- No `|safe` or `|raw` filters detected in templates
- No `{% autoescape false %}` blocks found

**Content Security Policy:** ❌ NOT IMPLEMENTED
- No CSP header configured
- Would mitigate XSS impact by restricting inline scripts

**X-XSS-Protection:** ❌ NOT CONFIGURED (deprecated but still useful)

### Exploitation Risk Assessment

| Sink | Severity | Impact | Likelihood | Network Surface | Overall Risk |
|------|----------|--------|------------|----------------|--------------|
| document.write() (orders.html:133) | Critical | Complete page takeover | High | Authenticated endpoint | **CRITICAL** |
| .html() #1 (orders.html:118) | High | Modal context XSS | High | Authenticated endpoint | **HIGH** |
| .html() #2 (orders_archive.html:114) | High | Modal context XSS | High | Authenticated endpoint | **HIGH** |

**Attack Scenarios:**

**Scenario 1: Stored XSS via Order Receipt Field**
1. Attacker authenticates with test:test credentials
2. Attacker archives Order 300198 (IDOR vulnerability - no authorization check)
3. Attacker modifies Order 300198 receipt field to contain XSS payload (requires database access or additional vulnerability)
4. Victim clicks "Receipt" link
5. jQuery `.html()` executes payload
6. Attacker steals victim session cookies

**Scenario 2: Reflected XSS via Archive Endpoint**
1. Attacker creates order with XSS in ticker field
2. Attacker sends victim link to archive that order
3. Victim clicks "Archive" button
4. `document.write()` replaces page with malicious content
5. Attacker performs phishing attack within trusted domain

---

## 10. SSRF Sinks

### Executive Summary
**No SSRF (Server-Side Request Forgery) sinks were found in network-accessible code.**

After comprehensive analysis of the Flask trading platform application, no code paths were identified where user input could influence server-side HTTP requests, file includes with URLs, socket operations, or external service calls. The application is entirely self-contained with no outbound request capabilities.

### Analysis Methodology

The following SSRF sink categories were systematically examined:

#### HTTP(S) Clients - NOT PRESENT ✅
**Searched For:**
- `requests` library (requests.get, requests.post, etc.)
- `urllib`, `urllib2`, `urlopen`
- `http.client`
- `httpx`, `aiohttp`

**Findings:**
- **Requirements.txt analysis:** Only `flask`, `flask-sqlalchemy`, and `pymysql` present (no HTTP client libraries)
- **Import analysis:** No HTTP client imports in `routes.py`, `__init__.py`, `models.py`, or `db.py`
- **Conclusion:** Application has no capability to make outbound HTTP requests

#### URL Operations & Redirects - SAFE ✅
**Examined:**
- All `redirect()` calls in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/routes.py`
- All `url_for()` usage

**Findings:**
- **Line 29:** `redirect(url_for('password', username=username))` - `username` is a parameter, not destination URL
- **Line 41:** `redirect(url_for('login'))` - Static route, no user input
- **Line 50:** `redirect(url_for('login', error='User not found'))` - Static route with error parameter
- **Line 60:** `redirect(url_for('dashboard', username=username))` - Static route, username is parameter only
- **Conclusion:** All redirects use hardcoded route names via Flask's `url_for()`. No user-controllable URL destinations.

#### Raw Sockets & Connect APIs - NOT PRESENT ✅
**Searched For:**
- `socket.connect`, `socket.socket`
- Raw network operations
- TCP/UDP socket creation

**Findings:** No socket operations detected in application code

#### File Operations - SAFE ✅
**Examined:**
- All `open()` calls in codebase

**Findings:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/__init__.py`
- **Lines 94-95:** `with open('/flag') as flag_file: flag_content = flag_file.read()`
- **Analysis:** Hardcoded path `/flag`, no user input, executed during application initialization only (not network-triggered)
- **Conclusion:** No dynamic file inclusion with user-controllable paths

#### Subprocess & Command Execution - NOT PRESENT ✅
**Searched For:**
- `subprocess.Popen`, `subprocess.run`, `subprocess.call`
- `os.system()`, `os.popen()`
- `exec()`, `eval()`, `compile()`

**Findings:** No subprocess module usage or command execution detected

#### Template Rendering (SSTI Leading to SSRF) - NOT VULNERABLE ✅
**Examined:**
- `render_template_string()` usage (potential SSTI vector)

**Findings:**
- `render_template_string` imported at Line 1 of `routes.py` but **never used**
- All templates use `render_template()` with hardcoded template names
- No user input passed to template rendering engine

#### External Service Integrations - NONE ✅
**Searched For:**
- Webhook handlers
- Callback URLs
- OIDC/OAuth discovery endpoints (`.well-known/openid-configuration`)
- JWKS fetchers
- Payment gateway integrations
- Analytics service calls
- Third-party API integrations

**Findings:** No external service integrations, webhooks, or callback mechanisms found

### User Input Analysis

All user input sources were traced to verify none influence URL construction or external requests:

| Input Source | Location | Usage | SSRF Risk |
|--------------|----------|-------|-----------|
| `request.args.get('error')` | routes.py:22 | Display only | ✅ None |
| `request.form['username']` | routes.py:24 | Database query | ✅ None |
| `request.form['password']` | routes.py:53 | Database query | ✅ None |
| `session.get('user_id')` | Multiple | Session management | ✅ None |
| `<int:order_id>` route parameter | routes.py:96, 128 | Database query | ✅ None |

**Conclusion:** No user input is used to construct URLs, file paths, or external requests of any kind.

### Network-Accessible Endpoints Review

All network-accessible endpoints were reviewed for SSRF potential:

| Route | Method | Outbound Requests | SSRF Risk |
|-------|--------|-------------------|-----------|
| `/` | GET/POST | Database query only | ✅ None |
| `/password/<username>` | GET/POST | Database query only | ✅ None |
| `/logout` | POST | Session management | ✅ None |
| `/dashboard` | GET | Database query only | ✅ None |
| `/orders` | GET | Database query only | ✅ None |
| `/order/<int:order_id>/receipt` | GET | Database query only | ✅ None |
| `/orders_archive` | GET | Database query only | ✅ None |
| `/order/<int:order_id>/archive` | GET | Database update only | ✅ None |

**Conclusion:** All endpoints interact exclusively with the internal MySQL database. No outbound network requests to external hosts.

### Client-Side AJAX Calls

Client-side JavaScript makes AJAX calls to internal endpoints only:

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/orders.html`
- **Line 113:** `url: '/order/' + orderId + '/receipt'` - Internal endpoint
- **Line 128:** `url: '/order/' + orderId + '/archive'` - Internal endpoint

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-002-24/app/website/app/templates/orders_archive.html`
- **Line 109:** `url: '/order/' + orderId + '/receipt'` - Internal endpoint

**Conclusion:** All AJAX calls target internal Flask routes. No client-side code attempts to fetch external resources with user-controlled URLs.

### Database Interactions Only

The application's only external dependency is the MySQL database:

- **Connection:** Internal Docker network (`db:3306`)
- **Protocol:** MySQL wire protocol (not HTTP/HTTPS)
- **ORM:** SQLAlchemy (parameterized queries)
- **No stored procedures calling external URLs detected**

### Conclusion

**No SSRF sinks found in network-accessible code.**

The XBEN-002-24 Trading Platform is a completely self-contained Flask application that:
- Makes no outbound HTTP/HTTPS requests
- Uses no HTTP client libraries
- Does not allow user-controlled URLs in redirects
- Does not perform dynamic file inclusion with user input
- Does not integrate with external services, webhooks, or APIs
- Interacts exclusively with an internal MySQL database

All user input is properly scoped to database queries and session management. There are no code paths where an attacker could manipulate server-side requests to internal network resources (AWS metadata service, internal APIs, localhost services) or external internet hosts.

**SSRF Attack Surface:** NONE

---

**END OF PENETRATION TEST CODE ANALYSIS REPORT**