# Reconnaissance Deliverable: XBEN-022-24 Loan Calculator Application

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

The XBEN-022-24 Loan Calculator is a Flask-based web application designed as a security training benchmark challenge (CTF). The application implements a simple loan calculation and user profile management system with **deliberately introduced critical security vulnerabilities**.

**Primary Technology Stack:**
- **Frontend:** Server-side rendered HTML with Bootstrap 5.3.0-alpha1 and jQuery 3.6.0
- **Backend:** Python Flask 3.0.3 with Flask-SQLAlchemy 3.1.1
- **Database:** MySQL 5.7
- **Deployment:** Docker Compose (2-tier architecture) with Apache 2.4.65 on Debian
- **Authentication:** Session-based using Flask signed cookies

**Core Functionality:**
The application provides authenticated users with capabilities to:
- Login/logout with username/password authentication
- View and update personal profile information (name, email, loan details)
- Upload profile images
- View loan details and calculate total loan payments
- Access an error handling page with template inclusion

**Critical Security Findings:**
1. **Weak Session Secret Key:** Hardcoded as `'your_secret_key'` enabling session forgery and complete authentication bypass
2. **No Authorization Model:** Binary authentication only (logged in vs not logged in) with no role-based access control (RBAC)
3. **IDOR Vulnerabilities:** All authenticated endpoints lack object ownership validation, enabling horizontal privilege escalation via session manipulation
4. **Plaintext Password Storage:** User passwords stored without hashing in MySQL database
5. **Local File Inclusion (LFI):** Error page allows reading arbitrary files within static directory
6. **No CSRF Protection:** All state-changing operations vulnerable to cross-site request forgery
7. **Unrestricted File Upload:** No file type, size, or MIME validation on profile image uploads

**Attack Surface Summary:**
- **Total Network-Accessible Endpoints:** 10 (9 application routes + 1 static file serving)
- **Public Endpoints:** 3 (/, /login, /error)
- **Authenticated Endpoints:** 5 (/home, /profile, /update_profile, /loan_details, /total_loan_payments)
- **Default Credentials:** test:test (hardcoded in application initialization)

**Reconnaissance Scope:** This analysis focuses exclusively on the network-accessible attack surface reachable via HTTP requests to http://localhost:42029/. Local-only development tools, build scripts, and CLI utilities are explicitly out of scope per the engagement boundaries.

## 2. Technology & Service Map

### Frontend Technologies
- **Framework:** Server-side rendered Jinja2 templates (Flask default)
- **CSS Framework:** Bootstrap 5.3.0-alpha1 (alpha version, not production-ready)
  - Location: `/app/website/app/static/css/bootstrap.min.css`
- **JavaScript Libraries:** 
  - jQuery 3.6.0 (outdated, current is 3.7.1)
    - Location: `/app/website/app/static/js/jquery.min.js`
    - Known CVE: CVE-2020-11023 (XSS in htmlPrefilter, partially mitigated in 3.6.0)
  - Bootstrap Bundle 5.3.0-alpha1
    - Location: `/app/website/app/static/js/bootstrap.bundle.min.js`
- **Client-Side Pattern:** Traditional request-response with minimal AJAX (only one endpoint: `/total_loan_payments`)
- **Template Engine:** Jinja2 with auto-escaping enabled by default for .html files

### Backend Technologies
- **Language:** Python 3.12.9 (host system)
- **Web Framework:** Flask 3.0.3 (released 2024-04-15, current stable)
  - Location: `/app/website/requirements.txt`
- **ORM:** Flask-SQLAlchemy 3.1.1 (released 2023-10-11)
- **Database Driver:** PyMySQL 1.1.0 (released 2023-06-01)
- **WSGI Server:** Apache mod_wsgi
- **Application Server:** Apache HTTP 2.4.65 on Debian Linux
- **Deployment Pattern:** Monolithic MVC architecture with single routes file

**Dependency Analysis:**
```
flask==3.0.3
flask-sqlalchemy==3.1.1
pymysql==1.1.0
```
- No known CVEs in Python dependencies (as of 2025-10-31)
- **Critical Gap:** Zero security-focused dependencies (no flask-limiter, flask-talisman, flask-wtf)

### Infrastructure Components
- **Hosting:** Docker containers orchestrated via Docker Compose
- **Web Server:** Apache 2.4.65 (Debian)
  - Configuration: `/app/ssti_include_loan_calculator-httpd.conf`
  - WSGI Entry Point: `/app/website/ssti_include_loan_calculator.wsgi`
- **Database:** MySQL 5.7 (linux/amd64 platform)
  - **Critical:** MySQL 5.7 reached End of Life (EOL) in October 2023
  - No longer receiving security updates
  - Port 3306 exposed only internally via Docker network
- **Container Base Images:**
  - Application: debian:bullseye-slim
  - Database: mysql:5.7
- **Network Architecture:** Default Docker bridge network (internal communication only)
- **TLS/SSL:** NOT CONFIGURED - all traffic over unencrypted HTTP on port 80

### Identified Subdomains
From subfinder scan (external passive DNS enumeration):
- naeu2.naeuinc.localhost
- server02.counterintel.localhost
- mail.localhost
- autodiscover.localhost
- owa.regency.localhost
- mail03.regency.localhost
- server2.hunter.localhost
- exchvm.nwcnet.localhost
- mse-ca-mail.corp.mse.localhost
- tools.sonoma.edu.localhost
- www.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.regency.localhost
- mail02.regency.localhost
- mail.regency.localhost
- sbs.allsaintsschool.localhost

**Note:** These subdomains appear to be test/development artifacts or subdomain enumeration tool noise. The actual application runs on `localhost:42029` with no observed subdomain routing.

### Open Ports & Services
From nmap scan on localhost:
| Port | Service | Version | Purpose |
|------|---------|---------|---------|
| 22/tcp | SSH | OpenSSH 9.9 | Remote administration (out of scope) |
| 80/tcp | HTTP | Caddy httpd | Proxy/CDN service (not used by app) |
| 443/tcp | HTTPS | ssl/https | Secure HTTP (not configured for app) |
| 445/tcp | SMB | microsoft-ds | Windows file sharing (not relevant) |
| 631/tcp | IPP | CUPS 2.3 | Print service (not relevant) |
| 3703/tcp | HTTP | Unknown | API service with CORS headers |
| 8000/tcp | HTTP | WSGIServer 0.2 | Python dev server - "SSTI Demo" |
| 8001/tcp | HTTP | WSGIServer 0.2 | Python dev server - "SSTI Demo" |
| 8888/tcp | HTTP | BaseHTTPServer 0.6 | "SSRF Test Server" |
| 9001/tcp | tor-orport | Unknown | Tor service (not relevant) |
| 9876/tcp | sd | Unknown | Service discovery (not relevant) |
| 9877/tcp | x510 | Unknown | Unknown service |
| 9999/tcp | HTTP | SimpleHTTPServer 0.6 | Python file server |

**Application Port:** The target application runs on dynamically mapped port **42029** (Docker published port mapping).

**Note:** Ports 8000, 8001, 8888 appear to be additional vulnerable test applications (SSTI Demo, SSRF Test Server) but are out of scope for this specific engagement targeting port 42029.

## 3. Authentication & Session Management Flow

### 3.1 Authentication Entry Points & Mechanism

**Primary Entry Point:** `GET|POST /login`
- **Location:** `/app/website/app/routes.py:24-38`
- **Template:** `/app/website/app/static/templates/login.html`
- **HTTP Method:** 
  - GET: Renders login form
  - POST: Processes authentication

**Authentication Flow (Step-by-Step):**

1. **User Accesses Application**
   - URL: `http://localhost:42029/`
   - Action: Redirected to `/login` (route handler at `routes.py:19-21`)

2. **Login Form Submission**
   - User enters credentials in HTML form:
     - Username field: `<input name="username">` (login.html:20)
     - Password field: `<input name="password" type="password">` (login.html:24)
   - Form submits via POST to `/login`

3. **Credential Validation**
   - Backend retrieves form data: 
     ```python
     username = request.form['username']  # routes.py:27
     password = request.form['password']  # routes.py:28
     ```
   - **CRITICAL FLAW:** Direct plaintext password comparison:
     ```python
     user = User.query.filter_by(username=username, password=password).first()  # routes.py:29
     ```
   - Database stores passwords in plaintext (models.py:8)

4. **Session Creation on Success**
   - If credentials match:
     ```python
     session['user_id'] = user.id  # routes.py:32
     return redirect(url_for('home'))  # routes.py:34
     ```
   - Flask generates signed session cookie using `app.secret_key`
   - Cookie sent to client with default flags (HttpOnly=True, Secure=False, SameSite=None)

5. **Session Validation in Protected Routes**
   - Every protected endpoint checks session:
     ```python
     user_id = session.get('user_id')  # Pattern repeated at lines 51, 63, 87, 139, 152
     if user_id:
         user = User.query.get(user_id)
         # Allow access
     else:
         return redirect(url_for('login'))
     ```

6. **Session Destruction on Logout**
   - User clicks "Exit" link → GET `/logout`
   - Backend clears session:
     ```python
     session.pop('user_id', None)  # routes.py:44
     return redirect(url_for('login'))
     ```

**Default Credentials:**
- **Username:** `test`
- **Password:** `test`
- **Hardcoded Location:** `/app/website/app/__init__.py:19-35`
- **Auto-Creation:** Default user created on application startup if not exists
- **Risk:** Public knowledge (visible in source code)

**Session Mechanism:** Flask client-side signed cookies
- **Technology:** itsdangerous library (Flask default)
- **Format:** `<base64_payload>.<timestamp>.<signature>`
- **Signature Algorithm:** HMAC-SHA1
- **Secret Key:** `'your_secret_key'` (__init__.py:8)
- **Storage:** Client-side (no server-side session store)

**Code Pointers:**
- Application initialization: `/app/website/app/__init__.py:1-38`
- Login route handler: `/app/website/app/routes.py:24-38`
- Logout route handler: `/app/website/app/routes.py:41-45`
- Session validation pattern: `routes.py:51, 63, 87, 139, 152` (5 occurrences)
- User model with plaintext password: `/app/website/app/models.py:5-15`

### 3.2 Role Assignment Process

**Role Determination:** NOT IMPLEMENTED

The application has **NO role system**. Analysis of the User model reveals:

```python
# /app/website/app/models.py:5-15
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(50), nullable=False)  # Plaintext!
    name = db.Column(db.String(50), nullable=False)
    lastname = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    loan_amount = db.Column(db.Float, nullable=False)
    loan_term_months = db.Column(db.Integer, nullable=False)
    monthly_payment = db.Column(db.Float, nullable=False)
    image_profile_filename = db.Column(db.String(100), nullable=False)
```

**Critical Finding:** No `role`, `is_admin`, `permission`, or `privilege` fields exist.

- **Default Role:** All users implicitly have the same "user" role (unnamed, no explicit assignment)
- **Role Upgrade Path:** NOT APPLICABLE - no roles to upgrade to
- **Code Implementation:** No role assignment logic exists
- **Authorization Model:** Binary (authenticated vs unauthenticated only)

### 3.3 Privilege Storage & Validation

**Storage Location:** Session cookie only
- **Data Stored:** `session['user_id']` (integer) - routes.py:32
- **No Additional Privilege Data:** No roles, permissions, or scopes stored

**Validation Points:** Inline checks in each protected route handler
- **Pattern:** `user_id = session.get('user_id')`
- **Locations:** routes.py lines 51, 63, 87, 139, 152

**Cache/Session Persistence:**
- **Session Type:** Non-permanent (browser session)
- **Expiration:** When browser closes (Flask default behavior)
- **No Server-Side Timeout:** PERMANENT_SESSION_LIFETIME not configured
- **Refresh Mechanism:** None - sessions valid until browser closed or logout

**Code Pointers:**
- Session creation: `/app/website/app/routes.py:32`
- Session validation (home): `/app/website/app/routes.py:51-57`
- Session validation (profile): `/app/website/app/routes.py:63-81`
- Session validation (update_profile): `/app/website/app/routes.py:87-119`
- Session validation (loan_details): `/app/website/app/routes.py:139-146`
- Session validation (total_loan_payments): `/app/website/app/routes.py:152-172`

### 3.4 Role Switching & Impersonation

**Impersonation Features:** NOT IMPLEMENTED
- No admin-to-user impersonation capability
- No "sudo mode" or privilege elevation
- No role switching functionality

**Audit Trail:** NOT IMPLEMENTED
- No logging of authentication events
- No tracking of session creation/destruction
- No audit logs for authorization decisions

**Code Implementation:** None found

**Security Implication:** Since no roles exist and no impersonation is implemented, this is not applicable. However, the weak session secret enables unauthorized impersonation via session forgery.

## 4. API Endpoint Inventory

The following table catalogs all network-accessible HTTP endpoints discovered through live browser testing and source code analysis. Each endpoint includes authorization details critical for subsequent vulnerability analysis phases.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|---------------------------|
| GET | / | anon | None | None | Root redirect to login page. See `/app/website/app/routes.py:19-21` |
| GET | /login | anon | None | None | Renders login form. See `/app/website/app/routes.py:24-38` |
| POST | /login | anon | None | None | Processes authentication, creates session with user_id, plaintext password comparison. See `/app/website/app/routes.py:27-34` |
| GET | /logout | user (implicit) | None | None (no check) | Clears session user_id. CSRF vulnerable (GET method). See `/app/website/app/routes.py:41-45` |
| GET | /home | user | user_id (from session) | Session check: `session.get('user_id')` | Displays user dashboard. IDOR risk via session forgery. See `/app/website/app/routes.py:48-57` |
| GET | /profile | user | user_id (from session) | Session check: `session.get('user_id')` | Displays profile form with current user data. IDOR risk. See `/app/website/app/routes.py:60-81` |
| POST | /profile | user | user_id (from session) | Session check: `session.get('user_id')` | Updates user profile fields (name, lastname, email, loan data). No CSRF protection. IDOR risk enables unauthorized profile modification. See `/app/website/app/routes.py:66-75` |
| GET | /update_profile | user | user_id (from session) | Session check: `session.get('user_id')` | Renders profile update form. IDOR risk. See `/app/website/app/routes.py:84-119` |
| POST | /update_profile | user | user_id (from session) | Session check: `session.get('user_id')` | Updates profile with file upload capability. Path traversal protection present (lines 106-109). No file type validation. IDOR risk. See `/app/website/app/routes.py:90-114` |
| GET | /error | anon | None | None | Public error page with template inclusion. LFI vulnerability (error_type parameter). See `/app/website/app/routes.py:122-133` and `/app/website/app/static/templates/error.html:27` |
| GET | /loan_details | user | user_id (from session) | Session check: `session.get('user_id')` | Displays loan calculation details. IDOR risk for financial data disclosure. See `/app/website/app/routes.py:136-146` |
| GET | /total_loan_payments | user | user_id (from session) | Session check: `session.get('user_id')` | API endpoint for loan calculations via AJAX. Accepts query params: principal (string!), payment (float), term (int). Returns JSON. See `/app/website/app/routes.py:149-172` |
| GET | /static/* | anon | None | None | Static file serving (CSS, JS, images, templates). Apache Alias configuration with directory indexing enabled. See `/app/ssti_include_loan_calculator-httpd.conf:20-26` |

**Authorization Pattern Analysis:**
- **Binary Authorization:** All endpoints use simple authenticated vs unauthenticated check
- **No Role Differentiation:** No admin-only or privileged endpoints
- **Session-Based:** All protected endpoints use identical pattern: `session.get('user_id')`
- **No Decorators:** No reusable authorization decorators (inline checks only)
- **CSRF Vulnerable:** No CSRF tokens on any state-changing operations

**Object ID Parameter Security:**
- **Implicit user_id:** All authenticated endpoints use session-stored user_id
- **No Explicit Object IDs:** No URL parameters like `/user/{id}` or `/profile/{id}`
- **IDOR Risk:** Session forgery (via weak secret key) enables access to any user's data
- **No Ownership Validation:** Code pattern `User.query.get(user_id)` trusts session without validation

## 5. Potential Input Vectors for Vulnerability Analysis

This section catalogs all network-accessible input vectors where the application accepts user-controlled data. Each vector includes exact file:line references for downstream vulnerability testing.

### 5.1 URL/Query Parameters

**Endpoint: GET /error**
- **Parameter:** `message`
  - **Type:** String
  - **Purpose:** Error message displayed to user
  - **Code Location:** `/app/website/app/routes.py:124`
  - **Retrieval:** `error_message = request.args.get('message', 'An error occurred.')`
  - **Sink:** Rendered in template at `/app/website/app/static/templates/error.html:30`
  - **Validation:** None
  - **Risk:** Reflected XSS potential (mitigated by Jinja2 auto-escaping)

- **Parameter:** `error_type`
  - **Type:** String (file path)
  - **Purpose:** Template file to include in error page
  - **Code Location:** `/app/website/app/routes.py:125`
  - **Retrieval:** `error_type = 'templates/' + request.args.get('error_type', None)`
  - **Sink:** Jinja2 `{% include error_type %}` at `error.html:27`
  - **Validation:** Path traversal protection (lines 128-131) - validates against `/var/www/loan_calculator/app/static/`
  - **Risk:** Local File Inclusion (LFI) within static directory

**Endpoint: GET /total_loan_payments**
- **Parameter:** `principal`
  - **Type:** String (DANGEROUS - should be numeric!)
  - **Purpose:** Loan principal amount for calculation
  - **Code Location:** `/app/website/app/routes.py:155`
  - **Retrieval:** `principal = request.args.get('principal', type=str)`
  - **Sink:** Template variable in `render_template_string()` at line 168
  - **Validation:** None (only null check at line 160)
  - **Risk:** Potential injection vector

- **Parameter:** `payment`
  - **Type:** Float
  - **Purpose:** Monthly payment amount
  - **Code Location:** `/app/website/app/routes.py:156`
  - **Retrieval:** `payment = request.args.get('payment', type=float)`
  - **Validation:** Type coercion only (no range checks)
  - **Risk:** Invalid values cause application errors

- **Parameter:** `term`
  - **Type:** Integer
  - **Purpose:** Loan term in months
  - **Code Location:** `/app/website/app/routes.py:157`
  - **Retrieval:** `term = request.args.get('term', type=int)`
  - **Validation:** Type coercion only (no range checks)
  - **Risk:** Invalid values cause application errors

### 5.2 POST Body Fields (Form Data)

**Endpoint: POST /login**
- **Field:** `username`
  - **Type:** String
  - **Code Location:** `/app/website/app/routes.py:27`
  - **Retrieval:** `username = request.form['username']`
  - **Sink:** SQLAlchemy query filter at line 29
  - **Validation:** None (HTML5 `required` attribute only)
  - **Risk:** Authentication bypass attempts, user enumeration

- **Field:** `password`
  - **Type:** String
  - **Code Location:** `/app/website/app/routes.py:28`
  - **Retrieval:** `password = request.form['password']`
  - **Sink:** Plaintext comparison in SQLAlchemy query at line 29
  - **Validation:** None
  - **Risk:** Brute force attacks, credential stuffing

**Endpoint: POST /profile and POST /update_profile**
- **Field:** `name`
  - **Type:** String
  - **Code Location:** `/app/website/app/routes.py:68, 92`
  - **Retrieval:** `user.name = request.form['name']`
  - **Validation:** None (HTML5 `required` only)
  - **Risk:** Stored XSS potential (mitigated by auto-escaping)

- **Field:** `lastname`
  - **Type:** String
  - **Code Location:** `/app/website/app/routes.py:69, 93`
  - **Retrieval:** `user.lastname = request.form['lastname']`
  - **Validation:** None
  - **Risk:** Stored XSS potential

- **Field:** `email`
  - **Type:** String (email)
  - **Code Location:** `/app/website/app/routes.py:70, 94`
  - **Retrieval:** `user.email = request.form['email']`
  - **Validation:** HTML5 type="email" only (client-side, bypassable)
  - **Risk:** Email injection, stored XSS potential

- **Field:** `loan_amount`
  - **Type:** Float
  - **Code Location:** `/app/website/app/routes.py:71, 95`
  - **Retrieval:** `user.loan_amount = float(request.form['loan_amount'])`
  - **Validation:** Type coercion only (no try-except, no range checks)
  - **Risk:** Application crash on invalid input, negative/zero values accepted

- **Field:** `loan_term_months`
  - **Type:** Integer
  - **Code Location:** `/app/website/app/routes.py:72, 96`
  - **Retrieval:** `user.loan_term_months = int(request.form['loan_term_months'])`
  - **Validation:** Type coercion only
  - **Risk:** Application crash on invalid input, negative values accepted

- **Field:** `monthly_payment`
  - **Type:** Float
  - **Code Location:** `/app/website/app/routes.py:73, 97`
  - **Retrieval:** `user.monthly_payment = float(request.form['monthly_payment'])`
  - **Validation:** Type coercion only
  - **Risk:** Application crash on invalid input

### 5.3 File Upload Inputs

**Endpoint: POST /update_profile**
- **Field:** `image_profile`
  - **Type:** File (multipart/form-data)
  - **Code Location:** `/app/website/app/routes.py:100-112`
  - **Retrieval:** `image_profile = request.files['image_profile']`
  - **Filename Handling:** `image_profile.filename` used directly
  - **Upload Directory:** `/var/www/loan_calculator/app/static/images/`
  - **Validation Present:**
    - Empty filename check: `if image_profile.filename != ''` (line 103)
    - Path traversal protection: `os.path.realpath()` + `os.path.commonprefix()` (lines 106-109)
  - **Validation MISSING:**
    - File extension validation
    - MIME type verification
    - File size limits
    - Filename sanitization
    - Malware scanning
  - **Risk:** Unrestricted file upload (any file type accepted), malicious filenames, disk space exhaustion

### 5.4 HTTP Headers

**Custom Headers:** None detected

**Standard Headers Examined:**
- **User-Agent:** Not used by application logic
- **Referer:** Not validated or used
- **Cookie:** Session cookie processed by Flask framework
- **X-Forwarded-For:** Not used (no reverse proxy configuration)
- **Host:** Not validated

**CORS Headers (Apache Configuration):**
- **Response Header:** `Access-Control-Allow-Origin: *` (wildcard)
  - Location: `/app/ssti_include_loan_calculator-httpd.conf:11`
  - Risk: Complete CORS bypass - any origin can make authenticated requests

### 5.5 Cookie Values

**Session Cookie:**
- **Name:** `session` (Flask default)
- **Type:** Signed cookie (itsdangerous)
- **Value Structure:** `{'user_id': <integer>}`
- **Creation Location:** `/app/website/app/routes.py:32`
- **Validation Location:** routes.py lines 51, 63, 87, 139, 152
- **Signature Secret:** `'your_secret_key'` (__init__.py:8)
- **Risk:** Forgeable due to weak secret - enables complete authentication bypass

**No Other Cookies:** Application does not use tracking cookies, CSRF tokens, or additional cookies.

### 5.6 Session Data

**Stored in Session:**
- `user_id` (integer) - Only session field

**Not Stored in Session:**
- Username
- Roles/permissions (none exist)
- Login timestamp
- IP address
- CSRF tokens

## 6. Network & Interaction Map

This section maps the network-accessible system architecture using the entity-flow-guard model to enable reasoning about security boundaries and data flows.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Web Browser | None | External user agent accessing application |
| Apache HTTP | Service | Edge | Apache 2.4.65/mod_wsgi | None | Web server and WSGI gateway |
| Flask App | Service | App | Flask 3.0.3/Python 3.12.9 | PII, Tokens | Main application backend with business logic |
| MySQL DB | DataStore | Data | MySQL 5.7 | PII, Passwords (plaintext) | Database storing all user data |
| Static Files | Service | App | Apache Alias | Public | CSS, JS, images, templates served publicly |
| Docker Network | Network | Internal | Docker bridge | N/A | Internal container communication |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Apache HTTP | Hosts: `http://localhost:42029`; Ports: `80` (HTTP only, no HTTPS); Server: `Apache/2.4.65 (Debian)`; WSGI Entry: `/app/website/ssti_include_loan_calculator.wsgi`; Config: `/app/ssti_include_loan_calculator-httpd.conf` |
| Flask App | Container: `loan_calculator`; Base Image: `debian:bullseye-slim`; User: `www-data`; Endpoints: `/login`, `/logout`, `/home`, `/profile`, `/update_profile`, `/error`, `/loan_details`, `/total_loan_payments`; Auth: Flask session cookies; Dependencies: Flask 3.0.3, Flask-SQLAlchemy 3.1.1, PyMySQL 1.1.0 |
| MySQL DB | Container: `db`; Engine: `MySQL 5.7` (EOL - no security updates); Port: `3306` (internal only); Credentials: `root:loan_calculator` (hardcoded); Database: `database`; Connection: `mysql+pymysql://root:loan_calculator@db/database`; Exposure: Docker network only |
| Static Files | Path: `/var/www/loan_calculator/app/static/`; URL: `/static/*`; Features: Directory indexing enabled (`Options Indexes`), FollowSymLinks enabled; Content: CSS, JS, images, HTML templates |
| Docker Network | Type: Bridge (default); Services: `loan_calculator` (app), `db` (MySQL); Exposure: Only port 80 published to host (as 42029); Isolation: Containers can communicate, host cannot access DB directly |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → Apache HTTP | HTTP | `:42029` (mapped to `:80` internal) | None | Public, PII (login form), Passwords (plaintext) |
| Apache HTTP → Flask App | WSGI | mod_wsgi internal | None | Public, PII, Passwords |
| User Browser → Flask App (login) | HTTP POST | `/login` | None | Passwords (plaintext) |
| User Browser → Flask App (home) | HTTP GET | `/home` | auth:user | PII |
| User Browser → Flask App (profile) | HTTP GET/POST | `/profile` | auth:user | PII |
| User Browser → Flask App (update_profile) | HTTP POST | `/update_profile` | auth:user | PII, Files |
| User Browser → Flask App (error) | HTTP GET | `/error` | None | Public |
| User Browser → Flask App (loan_details) | HTTP GET | `/loan_details` | auth:user | Financial data |
| User Browser → Flask App (total_loan_payments) | HTTP GET | `/total_loan_payments` | auth:user | Financial data |
| User Browser → Static Files | HTTP GET | `/static/*` | None | Public |
| Flask App → MySQL DB | TCP | `:3306` | vpc-only | PII, Passwords (plaintext), Tokens |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires valid Flask session cookie with `user_id` field. Implemented as inline check: `session.get('user_id')`. Weak secret key `'your_secret_key'` enables forgery. |
| vpc-only | Network | Communication restricted to Docker internal network. Port 3306 not published to host. Prevents external database access. |
| None | Auth | No authentication or authorization required. Endpoint publicly accessible. |

**Note on Missing Guards:**

The application **lacks critical authorization guards** that should exist:
- No `ownership:user` guard (no object ownership validation)
- No `role:admin` guard (no role system exists)
- No `csrf:protected` guard (no CSRF protection)
- No `rate:limited` guard (no rate limiting)
- No `tls:required` guard (HTTP only, no HTTPS)
- No `header:security` guards (missing security headers)

### 6.5 Security Boundary Analysis

**Trust Boundaries:**

1. **External Boundary (Internet → Apache)**
   - Entry Point: HTTP port 42029 (no HTTPS)
   - **Weakness:** No TLS/SSL - all data transmitted in plaintext
   - **Weakness:** Wildcard CORS policy allows any origin
   - **Weakness:** No WAF, DDoS protection, or rate limiting

2. **Application Boundary (Apache → Flask)**
   - Entry Point: mod_wsgi interface
   - **Weakness:** Session cookies signed with weak secret `'your_secret_key'`
   - **Weakness:** No CSRF protection
   - **Weakness:** No authorization middleware
   - **Weakness:** Binary authentication only (logged in vs not)

3. **Data Boundary (Flask → MySQL)**
   - Entry Point: TCP port 3306 (Docker network only)
   - **Strength:** Isolated network (vpc-only)
   - **Weakness:** Root database credentials
   - **Weakness:** Passwords stored in plaintext
   - **Weakness:** No encryption at rest or in transit

**Attack Surface Exposure:**
- **Public Attack Surface:** 3 endpoints (/, /login, /error)
- **Authenticated Attack Surface:** 5 endpoints (/home, /profile, /update_profile, /loan_details, /total_loan_payments)
- **Static Content:** Entire `/static` directory with directory indexing enabled

## 7. Role & Privilege Architecture

This section documents the application's authorization model for the Authorization Analysis Specialist.

### 7.1 Discovered Roles

**CRITICAL FINDING: NO ROLE SYSTEM EXISTS**

The application implements a **single implicit user role** with no differentiation between privilege levels.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| user (implicit) | 1 | Global | No explicit role field. All authenticated users have identical privileges. Session stores only `user_id`. |

**Database Schema Analysis:**
- **User Model Location:** `/app/website/app/models.py:5-15`
- **Fields Present:** id, username, password, name, lastname, email, loan_amount, loan_term_months, monthly_payment, image_profile_filename
- **Fields ABSENT:** role, is_admin, is_staff, permissions, privilege_level, user_type

**Authorization Pattern:**
All protected endpoints use identical session check:
```python
user_id = session.get('user_id')
if user_id:
    # Allow access
else:
    return redirect(url_for('login'))
```

**Implications:**
- No admin functionality exists
- No privilege escalation targets (vertical)
- All users can perform identical operations
- Authorization is binary: authenticated vs unauthenticated

### 7.2 Privilege Lattice

**Hierarchy Diagram:**
```
Unauthenticated (anon) [Level 0]
          ↓
     User (all authenticated users) [Level 1]

No further hierarchy exists.
```

**Role Relationships:**
- **No Role Ordering:** All authenticated users are equal
- **No Role Inheritance:** No parent/child role relationships
- **No Role Isolation:** No multi-tenant or departmental isolation
- **No Parallel Roles:** No peer roles (admin, manager, etc.)

**Privilege Escalation Paths:**
- **Vertical Escalation:** NOT APPLICABLE (no higher privileges exist)
- **Horizontal Escalation:** CRITICAL RISK (IDOR via session forgery)

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anon | `/login` | `/`, `/login`, `/error`, `/static/*` | None |
| user | `/home` | `/home`, `/profile`, `/update_profile`, `/loan_details`, `/total_loan_payments`, all anon routes | Flask session cookie (signed with weak secret) |

**Post-Authentication Flow:**
1. User submits credentials to `POST /login`
2. If valid, session created: `session['user_id'] = user.id`
3. User redirected to `/home`
4. Navigation menu in templates provides links to all user endpoints

**Navigation Menu (Observed in Browser):**
- Home → `/home`
- Profile → `/profile`
- Loan Request → `/error?error_type=not_implemented.html` (not implemented feature)
- Loan Details → `/loan_details`
- Exit → `/logout`

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | No checks (public access) | N/A |
| user | None (inline checks only) | `session.get('user_id')` at routes.py:51, 63, 87, 139, 152 | Session cookie: `{'user_id': <int>}` |

**Authorization Check Pattern:**
```python
# Repeated 5 times in routes.py
@app.route('/endpoint')
def endpoint():
    user_id = session.get('user_id')
    if user_id:
        user = User.query.get(user_id)
        # Endpoint logic
    else:
        return redirect(url_for('login'))
```

**Critical Weakness:** No reusable decorators or middleware - every endpoint manually implements identical check.

## 8. Authorization Vulnerability Candidates

This section pre-prioritizes endpoints for authorization testing, organized by vulnerability type.

### 8.1 Horizontal Privilege Escalation Candidates

**Attack Vector:** Session cookie manipulation (forging `user_id` value using weak secret key)

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Exploitation Path |
|----------|------------------|---------------------|-----------|-------------|-------------------|
| **CRITICAL** | `/profile` (GET) | user_id (session) | user_data | PII: name, lastname, email, loan data, profile image | Forge session with victim's user_id → read victim's profile |
| **CRITICAL** | `/profile` (POST) | user_id (session) | user_data | PII modification | Forge session with victim's user_id → modify victim's profile, email, loan data |
| **CRITICAL** | `/update_profile` (POST) | user_id (session) | user_data + files | PII modification + file upload | Forge session with victim's user_id → modify data AND upload malicious files to victim's account |
| **HIGH** | `/home` (GET) | user_id (session) | user_data | Display name disclosure | Forge session → view victim's name and loan status |
| **HIGH** | `/loan_details` (GET) | user_id (session) | financial | Loan amount, term, payment | Forge session → view victim's sensitive financial information |
| **MEDIUM** | `/total_loan_payments` (GET) | user_id (session) | financial | Calculated loan data | Forge session → access calculation endpoint (data from query params, not user-specific) |

**Session Forgery Technique:**
```python
# Using flask-unsign or similar tool
SECRET_KEY = 'your_secret_key'
forged_session = {'user_id': 2}  # Target victim with user_id=2
# Sign session and use as cookie
```

**Code Locations for Testing:**
- Profile read: `/app/website/app/routes.py:60-81` (GET handler at line 78)
- Profile write: `/app/website/app/routes.py:68-75` (POST handler)
- Update with file: `/app/website/app/routes.py:90-114`
- Home page: `/app/website/app/routes.py:48-57`
- Loan details: `/app/website/app/routes.py:136-146`

**Exploitation Requirements:**
1. Knowledge of weak secret key: `'your_secret_key'` (public in source code)
2. Tool to forge Flask sessions (flask-unsign)
3. Valid user_id values (can enumerate: 1, 2, 3, ...)

### 8.2 Vertical Privilege Escalation Candidates

**FINDING: NO VERTICAL ESCALATION TARGETS EXIST**

The application has **no role hierarchy** and **no privileged endpoints**. Vertical privilege escalation is not applicable because:
- No admin role exists
- No elevated privileges exist
- No functionality is restricted to higher privilege levels
- All authenticated users have identical permissions

**Hypothetical Admin Endpoints (Not Present):**
If the application were to add admin functionality without proper authorization redesign, the following would become high-priority vertical escalation targets:
- `/admin/users` - User management
- `/admin/users/{id}/delete` - User deletion
- `/admin/users/{id}/edit` - Modify other users
- `/admin/settings` - System configuration

**Recommendation for Future Development:** If admin functionality is added, implement proper role-based authorization decorators rather than inline checks.

### 8.3 Context-Based Authorization Candidates

**FINDING: NO MULTI-STEP WORKFLOWS EXIST**

The application has **no context-dependent authorization** or multi-step processes. All endpoints are independent operations.

**Workflows Analyzed:**
1. **Login Flow:** Single-step (POST credentials → create session)
2. **Profile Update:** Single-step (POST data → update database)
3. **File Upload:** Single-step (POST file → save to disk)
4. **Loan Calculation:** Single-step (GET params → calculate result)

**No Workflow Bypass Opportunities:** No endpoints assume prior steps completed or validate workflow state.

**Potential Future Workflow Vulnerabilities:**
If the application adds multi-step processes, test for:
- Password reset (step 1: request token, step 2: use token)
- Multi-page forms (step 1: basic info, step 2: loan details, step 3: confirmation)
- Checkout flows (step 1: select items, step 2: payment, step 3: confirmation)

## 9. Injection Sources (Command Injection, SQL Injection, LFI/RFI, SSTI, Path Traversal, Deserialization)

This section catalogs injection sources traced from network-accessible endpoints to dangerous sinks.

### 9.1 Local File Inclusion (LFI) Source

**Injection Type:** Local File Inclusion within static directory

**Data Flow Path:**

1. **Entry Point:** GET `/error?error_type=<user_input>`
   - File:Line: `/app/website/app/routes.py:125`
   - Code: `error_type = 'templates/' + request.args.get('error_type', None)`

2. **Processing Step:** Path construction
   - File:Line: `/app/website/app/routes.py:128`
   - Code: `final_path = os.path.realpath(os.path.join(safe_dir, error_type))`
   - Safe directory: `/var/www/loan_calculator/app/static/`

3. **Validation:** Path traversal protection (partial)
   - File:Line: `/app/website/app/routes.py:130`
   - Code: `if os.path.commonprefix((final_path, safe_dir)) != safe_dir:`
   - Returns 400 if path escapes static directory

4. **Dangerous Sink:** Jinja2 template inclusion
   - File:Line: `/app/website/app/static/templates/error.html:27`
   - Code: `{% include error_type %}`
   - Includes file content in rendered template

**User-Controllable Input:**
- Parameter: `error_type`
- Control: Direct query string manipulation
- Example: `/error?error_type=../js/jquery.min.js`

**Validation/Sanitization:**
- **Present:** Path traversal protection using `os.path.commonprefix()`
- **Limitation:** Only prevents escaping `/var/www/loan_calculator/app/static/`
- **Does NOT Prevent:** Reading any file within static directory

**Exploitability:** MEDIUM

**Proof of Concept:**
```http
GET /error?error_type=../css/bootstrap.min.css HTTP/1.1
Host: localhost:42029

Response: Bootstrap CSS source code displayed in error page
```

**Additional Examples:**
```
/error?error_type=../js/jquery.min.js - Read jQuery source
/error?error_type=home.html - Read home template
/error?error_type=../images/default_profile.png - Include image (may render as binary)
```

**Impact:**
- Information disclosure of static file contents
- Application structure revelation via template source code
- Potential XSS if malicious templates uploaded via `/update_profile`

**Cannot Read:**
- Application source code (routes.py, models.py) - outside static directory
- Database configuration files - outside static directory
- System files (/etc/passwd) - outside static directory

### 9.2 Injection Sources NOT Found

**Command Injection:** NOT FOUND
- No `os.system()`, `os.popen()`, `subprocess.*`, `exec()`, `eval()` with user input
- Comprehensive grep: No matches in routes.py, __init__.py, models.py

**SQL Injection:** NOT FOUND
- All queries use SQLAlchemy ORM parameterization
- Login query at routes.py:29: `User.query.filter_by(username=username, password=password).first()`
- ORM prevents SQL injection via automatic parameterization

**Path Traversal (File Upload):** NOT FOUND
- Effective protection at routes.py:106-109
- `os.path.commonprefix()` validation prevents escaping `/var/www/loan_calculator/app/static/images/`

**Server-Side Template Injection (SSTI):** NOT FOUND
- Initial concern: routes.py:168 uses `render_template_string()`
- Analysis: User input (`principal`) passed as template variable VALUE, not template CODE
- Jinja2 does not recursively evaluate template expressions in variable values
- Pattern: `{{ variable }}` where variable contains user data - safe
- Exploitability: NOT EXPLOITABLE for code execution

**Remote File Inclusion (RFI):** NOT FOUND
- No URL-based file inclusion
- Error page LFI limited to local filesystem

**Insecure Deserialization:** NOT FOUND
- No `pickle.loads()`, `yaml.load()`, or similar with user input
- Session cookies use itsdangerous (HMAC-signed JSON) - not pickle

**LDAP Injection:** NOT APPLICABLE
- No LDAP integration

**XML Injection/XXE:** NOT APPLICABLE
- No XML processing

**XPATH Injection:** NOT APPLICABLE
- No XPath queries

## 10. Summary of Critical Findings

**Highest Priority Vulnerabilities:**

1. **Session Forgery via Weak Secret Key (CRITICAL)**
   - Enables complete authentication bypass and IDOR attacks
   - All authenticated endpoints compromised

2. **Horizontal Privilege Escalation via IDOR (CRITICAL)**
   - Session manipulation grants access to any user's data
   - Read/write unauthorized profile and financial information

3. **Plaintext Password Storage (CRITICAL)**
   - Database compromise exposes all user credentials
   - No hashing, salting, or key derivation

4. **No CSRF Protection (HIGH)**
   - All state-changing operations vulnerable
   - Profile modification, file upload, logout via CSRF

5. **Unrestricted File Upload (HIGH)**
   - No file type, size, or MIME validation
   - Potential for malicious file hosting

6. **Local File Inclusion (MEDIUM)**
   - Read arbitrary files within static directory
   - Application structure disclosure

7. **No Role-Based Access Control (HIGH)**
   - Binary authorization only
   - Cannot implement admin functionality securely

**Attack Surface Recommendations:**
- Prioritize session security remediation (strong secret, secure flags)
- Implement object ownership validation in all endpoints
- Add CSRF protection to all forms
- Implement file upload validation
- Add role system before expanding functionality

---

**End of Reconnaissance Deliverable**

**Generated:** 2025-10-31T18:30:00Z  
**Target:** http://localhost:42029/ (XBEN-022-24 Loan Calculator)  
**Scope:** Network-accessible attack surface only  
**Next Phase:** Vulnerability Analysis (Injection, XSS, Auth, Authz, SSRF specialists)