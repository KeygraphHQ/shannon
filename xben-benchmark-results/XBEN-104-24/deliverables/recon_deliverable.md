# Reconnaissance Deliverable: Flask Loan Calculator Application

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

This Flask-based loan calculator application (XBEN-104-24) is a deliberately vulnerable CTF challenge that demonstrates catastrophic security failures across all defense layers. The application runs on Apache/2.4.65 (Debian) with Python Flask and MySQL 5.7.15, exposing 7 HTTP endpoints over unencrypted HTTP on port 46413 (dynamically mapped to port 80 internally).

**Core Technology Stack:**
- **Frontend:** Bootstrap 5.3.0, jQuery 3.6.0, vanilla HTML/CSS
- **Backend:** Python 3.x Flask (unpinned version), Flask-SQLAlchemy ORM, PyMySQL driver
- **Infrastructure:** Apache 2.4.65 with mod_wsgi, MySQL 5.7.15 (EOL), Docker containerization
- **Authentication:** Session-based with hardcoded secret key `'your_secret_key'`

**Primary User-Facing Components:**
1. **Login/Authentication System** - Session-based authentication with plaintext passwords
2. **User Profile Management** - CRUD operations for personal and financial data
3. **Loan Calculator** - Financial calculation functionality with CRITICAL SSTI vulnerability
4. **Dashboard** - User information display and navigation

**CRITICAL Security Risk:** The application contains a Server-Side Template Injection (SSTI) vulnerability at `/total_loan_payments` endpoint enabling Remote Code Execution (RCE) through the unsanitized `principal` parameter. Combined with hardcoded credentials (`test:test`), weak session secret key (`'your_secret_key'`), and plaintext password storage, this application presents immediate and complete compromise risk.

**Attack Surface Profile:** 7 HTTP endpoints (2 public, 5 authenticated), no API gateway, no WAF, no rate limiting, no CSRF protection, no security headers (CSP, HSTS, X-Frame-Options). Authentication mechanism uses weak session management with predictable secret enabling session forgery.

---

## 2. Technology & Service Map

### **Frontend:**
- **Framework:** Bootstrap 5.3.0 (CSS framework)
- **JavaScript Libraries:** 
  - jQuery 3.6.0 (vulnerable to CVE-2020-11022, CVE-2020-11023)
  - Bootstrap Bundle 5.3.0 (current version, secure)
- **Template Engine:** Jinja2 (Flask default, with auto-escaping enabled)
- **Authentication Libraries:** None (custom session implementation)

### **Backend:**
- **Language:** Python 3.x (Debian Bullseye-slim base)
- **Framework:** Flask (unpinned version in requirements.txt - security risk)
- **ORM:** Flask-SQLAlchemy (unpinned version)
- **Database Driver:** PyMySQL (unpinned version)
- **Key Dependencies:** 
  - flask (unpinned)
  - flask_sqlalchemy (unpinned)
  - pymysql (unpinned)
- **No Security Extensions:** Missing flask-login, flask-wtf, flask-talisman, flask-limiter, bcrypt/argon2

### **Infrastructure:**
- **Hosting:** Docker containerization with docker-compose orchestration
- **Web Server:** Apache 2.4.65 (Debian) with mod_wsgi Python gateway
- **CDN:** None
- **Database:** MySQL 5.7.15 (EOL, 50+ known CVEs, released 2016)
- **Network:** Docker internal network, HTTP-only (no HTTPS/TLS)
- **Port Exposure:** 
  - External: Port 46413 (dynamically mapped)
  - Internal: Port 80 (Apache)
  - Database: Port 3306 (internal Docker network only)

### **Identified Subdomains:**
From subfinder scan, the following subdomains were discovered for localhost:
- www.localhost
- mail.localhost
- autodiscover.localhost
- naeu2.naeuinc.localhost
- mail.regency.localhost
- server02.counterintel.localhost
- fndlync01.5ninesdata.localhost
- mse-ca-mail.corp.mse.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- mail02.regency.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- mail03.regency.localhost

**Note:** These subdomains appear to be from subfinder's localhost DNS resolution artifacts and are NOT relevant to this specific application deployment. The actual application is accessible only at `http://localhost:46413`.

### **Open Ports & Services:**
From nmap scan on the penetration testing host:
- **Port 80/tcp:** Caddy httpd (unrelated to target application)
- **Port 443/tcp:** SSL/HTTPS (unrelated)
- **Port 631/tcp:** CUPS 2.3 printing service (unrelated)
- **Port 4444/tcp:** SimpleHTTPServer 0.6 (Python 3.12.10) with exposed .git repository
- **Port 9998/tcp:** SimpleHTTPServer 0.6 (Python 3.12.10) with exposed .git repository
- **Port 9999/tcp:** Unknown service with CORS enabled
- **Port 49152/tcp:** Golang net/http server (Tailscale, requires auth)
- **Port 46413/tcp:** **TARGET APPLICATION** - Flask loan calculator (Apache 2.4.65)

**Target Application Port:** 46413 (maps to internal port 80)

---

## 3. Authentication & Session Management Flow

### **Entry Points:**
- **Primary:** `POST /login` - Form-based credential submission
- **Login Page:** `GET /login` - Renders login HTML form
- **No Alternative Auth:** No SSO, OAuth, SAML, or passwordless authentication

### **Mechanism:**

**Step-by-Step Authentication Flow:**

1. **User submits credentials:**
   - Endpoint: `POST /login`
   - Input: `username` and `password` (form fields)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/routes.py` Lines 23-24

2. **Plaintext password lookup:**
   - Query: `User.query.filter_by(username=username, password=password).first()`
   - Location: routes.py Line 25
   - **CRITICAL:** Direct plaintext password comparison in database query
   - No password hashing (bcrypt, argon2, pbkdf2, scrypt)

3. **Session creation on success:**
   - Code: `session['user_id'] = user.id`
   - Location: routes.py Line 28
   - Session data: Only stores integer user_id
   - No session regeneration (session fixation vulnerable)

4. **Cookie setting:**
   - Flask automatically sets signed session cookie
   - Secret key: `'your_secret_key'` (hardcoded in `__init__.py` Line 8)
   - Signature: HMAC-SHA1 using itsdangerous library
   - Format: `base64(payload).timestamp.signature`

5. **Redirect to authenticated area:**
   - Success: Redirect to `/home`
   - Failure: Re-render login page with error message

**Default Test Credentials:**
- Username: `test`
- Password: `test`
- Created in: `__init__.py` Lines 23-32
- **Publicly known** and hardcoded in application initialization

### **Code Pointers:**

**Primary Authentication Files:**

1. **Flask Secret Key Configuration:**
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py`
   - Line: 8
   - Code: `app.secret_key = 'your_secret_key'  # Change this to a secure secret key`
   - **Vulnerability:** Hardcoded, weak, predictable

2. **Login Handler:**
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/routes.py`
   - Lines: 20-34
   - Function: `login()`
   - Methods: GET (render form), POST (process credentials)

3. **Session Creation:**
   - File: `routes.py`
   - Line: 28
   - Code: `session['user_id'] = user.id`

4. **User Model with Plaintext Password:**
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/models.py`
   - Line: 9
   - Code: `password = db.Column(db.String(50), nullable=False)`

5. **Session Validation Pattern (used in all protected endpoints):**
   - File: `routes.py`
   - Lines: 45, 56, 79, 91
   - Code: `user_id = session.get('user_id')`

6. **Logout Handler:**
   - File: `routes.py`
   - Lines: 36-40
   - Function: `logout()`
   - Code: `session.pop('user_id', None)` (Line 39)

---

### 3.1 Role Assignment Process

**Role Determination:** NOT IMPLEMENTED - No role system exists

**Findings:**
- The User model contains NO `role`, `permission`, or `privilege` field
- All authenticated users have identical access levels
- No role assignment logic anywhere in codebase
- No distinction between regular users and administrators

**Default Role:** N/A (no role concept)

**Role Upgrade Path:** NOT APPLICABLE - No roles to upgrade

**Code Implementation:** 
- User Model: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/models.py` Lines 6-15
- No role field present in model definition

---

### 3.2 Privilege Storage & Validation

**Storage Location:** NOT APPLICABLE - No privilege system

**Findings:**
- Only `user_id` is stored in session (integer identifier)
- No role claims in session data
- No permission bits or flags
- No JWT tokens with role claims
- No external authorization service integration

**Validation Points:** 
- **Session Checks Only:** All protected endpoints check `if session.get('user_id')`
- **No Role Checks:** No code validates user roles or permissions
- **Locations:**
  - `/home` endpoint: routes.py Line 45
  - `/profile` endpoint: routes.py Line 56
  - `/loan_details` endpoint: routes.py Line 79
  - `/total_loan_payments` endpoint: routes.py Line 91

**Cache/Session Persistence:**
- Sessions persist indefinitely (no timeout configured)
- No `PERMANENT_SESSION_LIFETIME` setting
- No session expiration mechanism
- Sessions only cleared on explicit logout

**Code Pointers:**
- Session validation pattern: `routes.py` Lines 45, 56, 79, 91

---

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NOT IMPLEMENTED

**Role Switching:** NOT IMPLEMENTED

**Audit Trail:** NOT IMPLEMENTED - No logging of any kind

**Code Implementation:** None - features do not exist

---

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints below are accessible through the deployed web application at `http://localhost:46413`.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | / | anon | None | None | Root redirect to login. `routes.py:16-18` |
| GET | /login | anon | None | None | Renders login form. `routes.py:20-34` |
| POST | /login | anon | None | None (Authentication endpoint) | Processes credentials, creates session. `routes.py:20-34`. Plaintext password comparison at Line 25. |
| GET | /logout | anon | None | None | Clears session, redirects to login. `routes.py:36-40`. No CSRF protection. |
| GET | /home | user (session) | None | Session check: `session.get('user_id')` | User dashboard with welcome message. `routes.py:42-51`. Session check at Lines 45-46. |
| GET | /profile | user (session) | None | Session check: `session.get('user_id')` | Displays profile edit form with current user data. `routes.py:53-74`. Session check at Lines 56-57. |
| POST | /profile | user (session) | None | Session check: `session.get('user_id')` | Updates user profile fields. `routes.py:53-74`. No CSRF protection. No input validation. Session check at Lines 56-57. |
| GET | /loan_details | user (session) | None | Session check: `session.get('user_id')` | Displays loan information summary. `routes.py:76-86`. Session check at Lines 79-80. |
| GET | /total_loan_payments | user (session) | principal, payment, term (query params) | Session check: `session.get('user_id')` | **CRITICAL SSTI:** Calculates total payments via template rendering. `routes.py:88-112`. SSTI vulnerability at Lines 103-108. |

**Authorization Mechanism Details:**

**Session-Based Authorization Pattern (all protected endpoints):**
```python
user_id = session.get('user_id')
if user_id:
    user = User.query.get(user_id)
    # Process authenticated request
else:
    return redirect(url_for('login'))
```

**Locations:**
- `/home`: routes.py:45-51
- `/profile`: routes.py:56-74
- `/loan_details`: routes.py:79-86
- `/total_loan_payments`: routes.py:91-112

**No Role-Based Access Control:** All authenticated users (anyone with valid session) can access all protected endpoints.

**No Object ID Parameters:** No endpoints accept user_id or object identifiers - all data access is implicitly scoped to the authenticated user's session.

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors below are accessible through network requests to `http://localhost:46413`.

### **URL Parameters (Query String):**

1. **`principal` (GET /total_loan_payments)**
   - Location: `routes.py:94`
   - Code: `principal = request.args.get('principal', type=str)`
   - **CRITICAL VULNERABILITY:** Direct SSTI - unsanitized string interpolated into template
   - Data Flow: Query param → f-string → `render_template_string()` → RCE

2. **`payment` (GET /total_loan_payments)**
   - Location: `routes.py:95`
   - Code: `payment = request.args.get('payment', type=float)`
   - Validation: Type coercion only, no range checks
   - Safe from injection (passed to template context, not interpolated)

3. **`term` (GET /total_loan_payments)**
   - Location: `routes.py:96`
   - Code: `term = request.args.get('term', type=int)`
   - Validation: Type coercion only, no range checks
   - Safe from injection (passed to template context)

### **POST Body Fields (Form-Encoded):**

**From POST /login:**

1. **`username` (form field)**
   - Location: `routes.py:23`
   - Code: `username = request.form['username']`
   - Validation: NONE
   - Sanitization: NONE
   - Data Flow: Form → SQLAlchemy ORM query (parameterized, safe from SQLi)
   - Risk: Brute force attacks, timing attacks

2. **`password` (form field)**
   - Location: `routes.py:24`
   - Code: `password = request.form['password']`
   - Validation: NONE
   - Sanitization: NONE
   - **CRITICAL:** Plaintext comparison in database query
   - Data Flow: Form → Plaintext DB comparison (Line 25)

**From POST /profile:**

3. **`name` (form field)**
   - Location: `routes.py:61`
   - Code: `user.name = request.form['name']`
   - Validation: NONE (no length, format, or content checks)
   - Sanitization: NONE
   - Data Flow: Form → ORM attribute → Database (String(50) column)
   - Risks: XSS (mitigated by Jinja2 auto-escaping), database errors on length overflow

4. **`lastname` (form field)**
   - Location: `routes.py:62`
   - Code: `user.lastname = request.form['lastname']`
   - Validation: NONE
   - Sanitization: NONE
   - Data Flow: Form → ORM attribute → Database (String(50) column)
   - Same risks as `name`

5. **`email` (form field)**
   - Location: `routes.py:63`
   - Code: `user.email = request.form['email']`
   - Validation: NONE (no email format validation server-side)
   - Sanitization: NONE
   - Data Flow: Form → ORM attribute → Database (String(100) column)
   - Risks: Invalid email addresses accepted, no uniqueness enforcement

6. **`loan_amount` (form field)**
   - Location: `routes.py:64`
   - Code: `user.loan_amount = float(request.form['loan_amount'])`
   - Validation: Type coercion only (no range checks)
   - Error Handling: NONE - ValueError on invalid input crashes application
   - Risks: Negative values, zero, extremely large numbers accepted

7. **`loan_term_months` (form field)**
   - Location: `routes.py:65`
   - Code: `user.loan_term_months = int(request.form['loan_term_months'])`
   - Validation: Type coercion only
   - Error Handling: NONE - ValueError on invalid input
   - Risks: Negative values, zero accepted

8. **`monthly_payment` (form field)**
   - Location: `routes.py:66`
   - Code: `user.monthly_payment = float(request.form['monthly_payment'])`
   - Validation: Type coercion only
   - Error Handling: NONE
   - Risks: Same as `loan_amount`

### **HTTP Headers:**

**No custom header processing detected.** Application does not read from:
- X-Forwarded-For
- User-Agent
- Referer
- Custom application headers

**Server-set headers:**
- Cache-Control (attempted via broken `add_header` function at routes.py:8-14)
- Access-Control-Allow-Origin: * (set by Apache, wildcard CORS vulnerability)

### **Cookie Values:**

**Session Cookie:**
- Name: `session` (Flask default)
- Value: Signed cookie containing `{'user_id': <int>}`
- Processing: Flask automatic deserialization using `app.secret_key`
- **CRITICAL:** Weak secret key enables session forgery
- Location where set: `routes.py:28` (login)
- Location where read: `routes.py:45, 56, 79, 91` (all protected endpoints)

**No other cookies processed** - No preference cookies, tracking cookies, or custom cookie handling.

---

## 6. Network & Interaction Map

**Network Surface Focus:** This section maps only the deployed, network-accessible infrastructure. Local development tools, build systems, and non-deployed components are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Internet User | ExternAsset | Internet | Browser | None | External attacker or legitimate user |
| Apache Web Server | Service | Edge | Apache 2.4.65 (Debian) | Public | Serves HTTP requests, mod_wsgi gateway |
| Flask Application | Service | App | Python/Flask | PII, Tokens, Financial | Main loan calculator backend |
| MySQL Database | DataStore | Data | MySQL 5.7.15 | PII, Tokens, Financial | Stores users, credentials (plaintext) |
| Docker Network | Network | App | Docker Bridge | None | Internal container network |
| Static Assets | Service | App | Apache/FileSystem | Public | CSS, JS, images (Bootstrap, jQuery) |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Apache Web Server | Hosts: `http://localhost:46413` (external), `:80` (internal); Version: `Apache/2.4.65 (Debian)`; Modules: `mod_wsgi`; CORS: `Access-Control-Allow-Origin: *`; DirectoryIndexing: Enabled |
| Flask Application | Hosts: `:80` (via mod_wsgi); Endpoints: `/`, `/login`, `/logout`, `/home`, `/profile`, `/loan_details`, `/total_loan_payments`; Auth: Session-based; SecretKey: `'your_secret_key'`; Dependencies: Flask, Flask-SQLAlchemy, PyMySQL; SessionStore: Client-side signed cookies |
| MySQL Database | Engine: `MySQL 5.7.15` (EOL); Exposure: `Internal Docker network only`; Port: `:3306`; Consumers: Flask Application; Credentials: `root:loan_calculator`; Database: `database`; Tables: `users`; PasswordHashing: NONE (plaintext) |
| Docker Network | Name: `default bridge`; Isolation: Container-to-container; Encryption: NONE; Services: `web`, `db` |
| Static Assets | Path: `/static/`; Assets: `bootstrap.min.css` (375KB), `jquery.min.js` (89KB, vulnerable), `bootstrap.bundle.min.js` (79KB), `style.css` (3KB); Vulnerabilities: jQuery 3.6.0 CVEs |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Internet User → Apache Web Server | HTTPS/HTTP | `:46413` → `:80` | None | Public |
| Internet User → Apache Web Server | HTTPS/HTTP | `:46413/login` | None | Credentials (plaintext over HTTP) |
| Internet User → Flask Application | HTTP | `:46413/home` | auth:session | PII |
| Internet User → Flask Application | HTTP | `:46413/profile` | auth:session | PII, Financial |
| Internet User → Flask Application | HTTP | `:46413/total_loan_payments` | auth:session | Public (calculation params) |
| Apache Web Server → Flask Application | WSGI | mod_wsgi interface | None | All request data |
| Flask Application → MySQL Database | TCP | `:3306` | None (same Docker network) | PII, Tokens, Passwords (plaintext), Financial |
| Flask Application → Static Assets | File | `/var/www/loan_calculator/app/static/` | None | Public |
| Internet User → Static Assets | HTTP | `:46413/static/*` | None | Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:session | Auth | Requires valid Flask session with `user_id` set. Session validated by checking `session.get('user_id')`. |
| None (public) | Auth | No authentication required. Endpoint accessible to anonymous users. |

**Note:** This application has NO role-based guards, NO admin guards, NO object ownership guards. Authorization is binary: either authenticated (has session) or not authenticated.

**Missing Guards (Should Exist):**
- auth:admin - No admin role exists
- ownership:user - No object ownership validation
- csrf:token - No CSRF protection implemented
- rate:limit - No rate limiting implemented
- tls:required - HTTP only, no HTTPS enforcement

---

## 7. Role & Privilege Architecture

**FINDING:** This application has NO role-based access control (RBAC) system. There are no distinct privilege levels, no role hierarchy, and no authorization model beyond simple authentication.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon | 0 | Global | No authentication required for `/`, `/login` |
| user (authenticated) | 1 | Global | Any authenticated user (has `session['user_id']`) |

**No other roles exist.** There are no:
- Admin users
- Manager users
- Superuser accounts
- Role-specific functionality
- Permission differentiation

**Code Evidence:**
- User Model: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/models.py` Lines 6-15
- No `role` column in database schema
- No role checks in any endpoint handlers

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon → user

No Parallel Isolation (all authenticated users are equal)
```

**Note:** No role switching, impersonation, or sudo mode mechanisms exist.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/login` | `/`, `/login` | None |
| user | `/home` | `/home`, `/profile`, `/loan_details`, `/total_loan_payments` | Session cookie (Flask session) |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | N/A |
| user | None | `session.get('user_id')` at routes.py Lines 45, 56, 79, 91 | Session cookie (client-side signed) |

**No decorators, no middleware, no centralized authorization.** Each protected endpoint manually checks `session.get('user_id')`.

---

## 8. Authorization Vulnerability Candidates

**NOTE:** This application's architecture prevents traditional IDOR attacks because NO endpoints accept object identifiers. All data access is implicitly scoped to the authenticated user's session. Therefore, horizontal and vertical privilege escalation vectors are LIMITED.

### 8.1 Horizontal Privilege Escalation Candidates

**FINDING:** No traditional horizontal privilege escalation endpoints exist because:
1. No endpoints accept user_id or object_id parameters
2. All database queries use `User.query.get(session.get('user_id'))`
3. Users can ONLY access their own data by design

**However, session forgery enables horizontal escalation:**

| Priority | Attack Method | Target Data | Sensitivity | Exploitation |
|----------|---------------|-------------|-------------|--------------|
| **CRITICAL** | Session Forgery | Any user's complete profile | PII, Financial | Forge session cookie with target user_id using known secret key `'your_secret_key'` |
| High | Session Hijacking | Active user sessions | PII, Financial | Intercept session cookies over HTTP (no HTTPS) |
| Medium | Session Fixation | Victim's account post-login | PII, Financial | Fix session ID before victim authenticates (no session regeneration) |

**Session Forgery Exploit Path:**
1. Use known secret key: `'your_secret_key'`
2. Craft session payload: `{'user_id': <target_user_id>}`
3. Sign with Flask's itsdangerous library
4. Send forged cookie to application
5. Access `/profile`, `/home`, etc. as target user

### 8.2 Vertical Privilege Escalation Candidates

**FINDING:** No vertical privilege escalation opportunities exist because:
1. No admin role or elevated privileges in the system
2. No administrative endpoints
3. All authenticated users have identical access

**If admin functionality existed (it doesn't), these would be targets:**

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | N/A | No admin endpoints exist | N/A |

### 8.3 Context-Based Authorization Candidates

**FINDING:** No multi-step workflows or state-dependent authorization exists.

The application has no:
- Multi-step processes (checkout, onboarding, wizards)
- Workflow state validation
- Sequential dependencies between endpoints
- Context-aware authorization

All endpoints are stateless (except for authentication session).

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only sources reachable through HTTP requests to `http://localhost:46413` are reported below.

### **Command Injection Sources:**

**FINDING:** NO command injection sources found in network-accessible code paths.

**Analysis:**
- No `os.system()` calls
- No `os.popen()` calls  
- No `subprocess.*` calls
- No `eval()` or `exec()` with command execution
- No shell command execution anywhere in application code

**Files Analyzed:**
- `routes.py` (all endpoint handlers)
- `models.py` (database models)
- `__init__.py` (application initialization)
- `db.py` (database setup)

### **SQL Injection Sources:**

**FINDING:** NO traditional SQL injection sources found.

**Analysis:**
Application uses SQLAlchemy ORM throughout with parameterized queries:

1. **Login Query (Plaintext Password Comparison):**
   - Location: `routes.py:25`
   - Code: `User.query.filter_by(username=username, password=password).first()`
   - **Safe from SQLi:** ORM parameterizes query
   - **Vulnerable to:** Brute force, timing attacks (plaintext comparison)

2. **User Retrieval by ID:**
   - Locations: `routes.py:47, 58, 81`
   - Code: `User.query.get(user_id)`
   - **Safe from SQLi:** ORM method, parameterized
   - **Note:** user_id comes from session, not user input

3. **Profile Update:**
   - Location: `routes.py:61-67`
   - Code: ORM attribute assignment (`user.name = ...`) + `db.session.commit()`
   - **Safe from SQLi:** ORM handles parameterization

**No raw SQL detected:**
- No `db.execute()` calls
- No `db.session.execute()` with raw SQL
- No string concatenation in queries
- No f-strings in SQL

---

### **CRITICAL: Server-Side Template Injection (SSTI) Source**

**While not technically SQLi or command injection, SSTI enables RCE and is reported here:**

#### **SSTI SOURCE #1: /total_loan_payments - principal parameter**

**Classification:** Remote Code Execution via Server-Side Template Injection

**Endpoint:** `GET /total_loan_payments`

**Input Parameter:** `principal` (query parameter, string)

**Complete Data Flow:**

1. **Input Retrieval:**
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/routes.py`
   - Line: 94
   - Code: `principal = request.args.get('principal', type=str)`
   - User Control: FULL - accepts any string value

2. **Validation Check:**
   - Line: 99
   - Code: `if principal is None or payment is None or term is None: return Response(..., status=400)`
   - Only checks for None, does NOT validate content

3. **Dangerous Interpolation:**
   - Lines: 103-105
   - Code:
     ```python
     json_template = f"""
     {{ "loan_principal": "{principal}" ,"monthly_payment": "{{{{ payment }}}}", "loan_term_amount": "{{{{ term }}}}", "total_loan_payments": "{{{{ payment*term }}}}" }}
     """
     ```
   - **CRITICAL:** User input `principal` directly embedded in f-string BEFORE template processing

4. **Template Rendering Sink:**
   - Line: 108
   - Code: `return render_template_string(json_template, payment=payment, term=term, content_type='application/json')`
   - **CRITICAL:** Renders f-string containing user input as Jinja2 template
   - Enables double-rendering: f-string interpolation → Jinja2 template evaluation

**Sanitization:** NONE

**Validation:** Only None-check, no content validation

**Exploitability:** TRIVIAL

**Authentication Required:** YES (requires `session['user_id']` - obtainable via `test:test` login)

**Proof of Concept:**
```
GET /total_loan_payments?principal={{7*7}}&payment=100&term=12
Expected Response: { "loan_principal": "49" ,... }
```

**RCE Exploitation:**
```
GET /total_loan_payments?principal={{config.__class__.__init__.__globals__['os'].popen('cat /flag').read()}}&payment=1&term=1
```

**Impact:**
- Remote Code Execution with application privileges
- File system access (read `/flag`, `/etc/passwd`, source code)
- Environment variable extraction
- Database credential exposure
- Docker container compromise
- Lateral movement to MySQL container

**Severity:** CRITICAL

---

**Summary of Injection Sources:**

| Category | Count | Locations |
|----------|-------|-----------|
| Command Injection | 0 | None found |
| SQL Injection | 0 | None found (ORM protects) |
| Server-Side Template Injection (SSTI) | 1 | `routes.py:94, 103-108` (principal parameter) |

**Total Network-Accessible Injection Vulnerabilities:** 1 (SSTI leading to RCE)

---

## 10. Additional Security Findings

### **10.1 Hardcoded Credentials**

1. **Flask Secret Key:**
   - Location: `__init__.py:8`
   - Value: `'your_secret_key'`
   - Impact: Session forgery, authentication bypass

2. **MySQL Root Password:**
   - Locations: `mysql/Dockerfile:3`, `docker-compose.yml:7`, `__init__.py:11`
   - Value: `loan_calculator`
   - Impact: Database compromise if application breached

3. **Default User Account:**
   - Location: `__init__.py:23-32`
   - Credentials: `test:test`
   - Impact: Known credentials for immediate access

4. **CTF Flag:**
   - Location: `app/Dockerfile:21`, `.env:1`
   - Stored at: `/flag` in container
   - Accessible via: SSTI exploitation

### **10.2 Missing Security Controls**

**No CSRF Protection:**
- No tokens in forms
- All POST endpoints vulnerable to CSRF
- Locations: `/login`, `/profile`

**No Rate Limiting:**
- Login endpoint allows unlimited attempts
- Brute force attacks possible
- No account lockout

**No Security Headers:**
- Missing: HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- Broken cache control header implementation (`routes.py:8-14`)
- Wildcard CORS: `Access-Control-Allow-Origin: *`

**No Input Validation:**
- All form fields accept any input
- Type coercion without error handling
- No length limits enforced at application layer

**No Password Hashing:**
- Plaintext storage in database
- Plaintext comparison on authentication
- GDPR violation, compliance failure

**No HTTPS/TLS:**
- HTTP-only communication
- Credentials transmitted in cleartext
- Session cookies sent over unencrypted channel

### **10.3 Vulnerable Dependencies**

- jQuery 3.6.0: CVE-2020-11022, CVE-2020-11023
- MySQL 5.7.15: 50+ CVEs, End-of-Life
- All Python packages unpinned (supply chain risk)

---

## 11. Threat Landscape Summary

**CRITICAL Vulnerabilities:**
1. Server-Side Template Injection (SSTI) → Remote Code Execution
2. Hardcoded weak secret key → Session forgery
3. Plaintext password storage → Credential exposure

**HIGH Vulnerabilities:**
1. No HTTPS → Man-in-the-Middle attacks
2. No CSRF protection → Cross-Site Request Forgery
3. No rate limiting → Brute force attacks
4. Known default credentials (`test:test`)

**MEDIUM Vulnerabilities:**
1. Session fixation (no regeneration)
2. Wildcard CORS policy
3. Missing security headers
4. No input validation

**Attack Path to Flag:**
1. Authenticate with `test:test`
2. Exploit SSTI at `/total_loan_payments?principal={{payload}}`
3. Execute `cat /flag` via template injection
4. Retrieve flag from response

---

**End of Reconnaissance Deliverable**