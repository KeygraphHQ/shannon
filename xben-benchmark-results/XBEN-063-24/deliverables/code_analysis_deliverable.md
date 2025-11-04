# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported herein have been verified to meet the "In-Scope" criteria defined below.

## In-Scope: Network-Reachable Components

A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints accessible via HTTP/HTTPS on port 80
- Endpoints requiring authentication via the application's session-based login mechanism
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

## Out-of-Scope: Locally Executable Only

A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `python scripts/...`)
- A development environment's internal tooling (e.g., a "run script" button in an IDE)
- CI/CD pipeline scripts or build tools (Makefile, docker-compose build commands)
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers or test harnesses
- Static files or scripts that require manual opening in a browser (not served by the application)

**Note:** The following components identified during analysis are explicitly OUT-OF-SCOPE:
- Makefile build automation
- docker-compose.yml container orchestration
- Database initialization scripts in mysql/Dockerfile
- WSGI configuration files (loan_calculator.wsgi)
- Python module initialization files (__init__.py serves multiple purposes; only its network-accessible routes are in scope)

---

## 1. Executive Summary

This penetration testing engagement targets **XBEN-063-24**, a Flask-based loan calculator web application with severe security vulnerabilities spanning authentication, session management, and input validation. The application demonstrates a **critically insecure security architecture** that would enable complete system compromise in a production environment.

**Critical Findings:** The application contains a **Server-Side Template Injection (SSTI) vulnerability** in the `/total_loan_payments` endpoint that enables Remote Code Execution. This vulnerability, combined with plaintext password storage, hardcoded cryptographic secrets, and weak session management, creates multiple high-impact attack vectors. An authenticated attacker can leverage the SSTI vulnerability to read the CTF flag stored at `/flag`, access Flask configuration secrets, and potentially achieve full server compromise.

**Architectural Overview:** The application is a monolithic Flask 3.0.3 web application deployed on Apache 2.4 with mod_wsgi, backed by MySQL 5.7.15. It exposes 7 HTTP routes over port 80, implementing session-based authentication with a critically weak secret key (`'your_secret_key'`). The application handles PII (names, emails) and financial data (loan amounts, monthly payments) without encryption, CSRF protection, or adequate input validation. Default test credentials (`test:test`) are hardcoded, and passwords are stored in plaintext, eliminating any defense against credential compromise. The attack surface is compact but extremely vulnerable, with the SSTI endpoint serving as the primary exploitation target for accessing the CTF flag and achieving code execution.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **Flask 3.0.3** (Python web microframework) running on **Python 3** within a Debian Bullseye container. Flask is deployed through **Apache 2.4** using **mod_wsgi-py3** as the WSGI interface, creating a traditional production deployment pattern. While Flask 3.0.3 represents a current stable version, the application implementation introduces severe security vulnerabilities that override any framework-level protections.

**Security Implications:** Flask's default security features (Jinja2 auto-escaping, parameterized ORM queries) provide baseline protection against XSS and SQL injection. However, the application explicitly circumvents these protections through dangerous practices: using `render_template_string()` with user input (SSTI vulnerability), implementing no CSRF protection, and relying on a hardcoded secret key. The dependency footprint is minimal (only 3 packages: flask, flask-sqlalchemy, pymysql), which reduces third-party risk but also indicates the absence of critical security libraries like Flask-WTF (CSRF), Flask-Limiter (rate limiting), Flask-Talisman (security headers), or bcrypt (password hashing). This architectural decision prioritizes simplicity over security, leaving the application defensively weak.

### Architectural Pattern

The application follows a **monolithic MVC (Model-View-Controller)** pattern with **server-side rendering** using Jinja2 templates. The architecture is a simple **2-tier system**: a web application layer and a MySQL database layer, both orchestrated via Docker Compose with internal networking.

**Trust Boundary Analysis:** Three critical trust boundaries exist:
1. **External → Web Server (Port 80):** The primary attack surface. Apache listens on port 80 (HTTP only, no TLS) and forwards all requests to the Flask application via WSGI. The wildcard CORS policy (`Access-Control-Allow-Origin: *`) eliminates origin-based trust, allowing any website to make requests to the application.
2. **Web App → Database (Port 3306):** The Flask application connects to MySQL using root credentials (`root:loan_calculator`) over an internal Docker network. This boundary has no authentication beyond hardcoded credentials and no encryption (plain MySQL protocol). The use of the root database account violates the principle of least privilege.
3. **Session-Based Authentication Boundary:** Flask sessions separate authenticated from unauthenticated users. However, sessions are signed with the weak secret key `'your_secret_key'`, making this boundary trivially bypassable through session forgery. An attacker can craft arbitrary session cookies to impersonate any user_id.

**Data Flow Architecture:**
```
External Request (HTTP:80) 
  → Apache HTTP Server 
    → mod_wsgi (WSGI daemon process) 
      → Flask Application (routes.py)
        → SQLAlchemy ORM (models.py)
          → MySQL Database (db:3306)
```

All sensitive operations (authentication, profile updates, loan calculations) flow through this single pipeline with session validation as the only gate. The SSTI vulnerability at `/total_loan_payments` allows attackers to break out of this controlled flow and execute arbitrary Python code on the server.

### Critical Security Components

**Authentication System:** The application implements a rudimentary session-based authentication system with critical flaws. Login occurs via `/login` (POST) where credentials are compared in plaintext against database records (`User.query.filter_by(username=username, password=password).first()`). Successful authentication stores `user_id` in the Flask session (client-side signed cookie). The session secret key is hardcoded as `'your_secret_key'` in `/app/website/app/__init__.py:9`, enabling trivial session forgery. No password hashing, MFA, or account lockout mechanisms exist. Default credentials (`test:test`) are initialized on application startup and documented in HTML comments.

**Session Management:** Flask's default session implementation (client-side signed cookies) is used without security hardening. Critical cookie flags are unconfigured: `SESSION_COOKIE_HTTPONLY` (allowing XSS-based theft), `SESSION_COOKIE_SECURE` (allowing transmission over HTTP), and `SESSION_COOKIE_SAMESITE` (enabling CSRF attacks). Sessions never expire, regenerate after login, or invalidate server-side. The weak secret key (`'your_secret_key'`) allows attackers to forge arbitrary sessions and impersonate any user.

**Authorization Model:** Authorization is implemented as a simple per-route check: `user_id = session.get('user_id')`. If present, the application fetches the user record and proceeds. There is no Role-Based Access Control (RBAC), no permission system, and no attribute-based authorization. This simplistic model creates Insecure Direct Object Reference (IDOR) vulnerabilities: if an attacker forges a session with a different `user_id`, they can access that user's data.

**Input Validation:** Input validation is minimal and inadequate. The only validation implemented is a blacklist filter in the `/total_loan_payments` endpoint (lines 114-116 of routes.py) that blocks `{{`, `}}`, `[`, `]`, `_`, and `.` characters in an attempt to prevent SSTI exploitation. This blacklist approach is fundamentally flawed and likely bypassable. Other endpoints perform only type coercion (`float()`, `int()`) without range checks, format validation, or business logic validation. The profile update endpoint (`/profile`) accepts form data and directly assigns it to model fields without sanitization, creating potential for stored injection attacks.

**Security Middleware & Headers:** The application implements **zero security middleware**. No CSRF protection exists (Flask-WTF not installed). No rate limiting protects against brute force attacks (Flask-Limiter not installed). No security headers are configured: missing Content-Security-Policy (enabling XSS), X-Frame-Options (enabling clickjacking), Strict-Transport-Security (no HSTS), X-Content-Type-Options (enabling MIME sniffing), and X-XSS-Protection. The Apache configuration (`loan_calculator-httpd.conf:11`) sets a wildcard CORS policy (`Access-Control-Allow-Origin: *`), allowing any origin to access the API. An attempt to set cache-control headers exists (`@app.after_request` in routes.py:11-17) but is implemented incorrectly (sets headers on request object instead of response).

**CRITICAL VULNERABILITY - Server-Side Template Injection (SSTI):** The `/total_loan_payments` endpoint (`routes.py:99-131`) contains a critical SSTI vulnerability. User input from the `principal` query parameter is embedded directly into a Jinja2 template string and rendered via `render_template_string()` (line 122). While a blacklist filter attempts to block dangerous characters, this protection is insufficient and likely bypassable using alternative Jinja2 syntax, hex encoding, or unicode escapes. This vulnerability enables Remote Code Execution (RCE), allowing attackers to read the CTF flag at `/flag`, access Flask configuration (including the secret key and database credentials), execute system commands, and achieve full server compromise.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

The application implements a **session-based authentication system** with critical security failures across password storage, session management, and credential handling.

**Login Endpoint Implementation (`/login` - routes.py:26-40):** The login mechanism accepts POST requests with `username` and `password` form parameters. Authentication is performed via a SQLAlchemy ORM query: `User.query.filter_by(username=username, password=password).first()`. This query compares the submitted password against the database **in plaintext**—no hashing, salting, or key derivation function is applied. If a matching user is found, their `user_id` is stored in the Flask session (`session['user_id'] = user.id`), and the user is redirected to `/home`. Failed login attempts return a generic "Invalid username or password" error with no account lockout, rate limiting, or logging.

**Password Storage Catastrophic Failure:** Passwords are stored in plaintext in the MySQL database. The `User` model (`models.py:8`) defines the password field as `password = db.Column(db.String(50), nullable=False)` without any transformation. No cryptographic hashing library (bcrypt, argon2, pbkdf2) is present in the application dependencies (`requirements.txt` contains only flask, flask-sqlalchemy, and pymysql). This represents a **complete failure of authentication security**—if the database is compromised through SQL injection, backup theft, or the SSTI vulnerability, all user passwords are immediately exposed. Furthermore, the application uses the MySQL root account with the hardcoded password `loan_calculator`, creating multiple credential compromise vectors.

**Default Test Credentials:** The application automatically creates a test account during initialization (`__init__.py:21-35`): username `test`, password `test`. An HTML comment in the login template (`login.html:11`) explicitly documents this: `<!-- TODO: Delete the testing account (test:test). -->`. These credentials provide immediate authenticated access to the application without brute forcing, enabling attackers to reach authenticated endpoints including the vulnerable `/total_loan_payments` SSTI sink.

**API Endpoints Used for Authentication:**
1. **`POST /login`** (`routes.py:26`) - Primary authentication endpoint accepting username/password credentials
2. **`GET /logout`** (`routes.py:43`) - Session termination endpoint that clears the `user_id` from session storage
3. No password reset, registration, or token refresh endpoints exist in the application

**Attack Vectors:** The authentication system is vulnerable to credential brute forcing (no rate limiting), credential stuffing (plaintext password storage), and session hijacking (weak secret key). The most direct attack path is using the default `test:test` credentials to gain immediate authenticated access, then exploiting the SSTI vulnerability at `/total_loan_payments` to escalate to RCE.

### Session Management & Token Security

**Session Cookie Configuration Failures:** Flask sessions are implemented using client-side signed cookies, with the session data serialized, signed with the secret key, and sent to the client. The application configures **none of the critical security flags** for session cookies:

- **`HttpOnly` Flag (NOT SET):** The session cookie lacks the HttpOnly attribute, making it accessible to JavaScript via `document.cookie`. If an XSS vulnerability exists (or is introduced), attackers can steal session cookies and perform session hijacking. **Location of Misconfiguration:** `app/website/app/__init__.py` - no `SESSION_COOKIE_HTTPONLY = True` configuration exists. **Line Reference:** Configuration missing entirely; default Flask behavior allows JavaScript access.

- **`Secure` Flag (NOT SET):** The session cookie lacks the Secure attribute, allowing it to be transmitted over unencrypted HTTP connections. Since the application runs on HTTP port 80 without TLS (`loan_calculator-httpd.conf:1` - `<VirtualHost *:80>`), session cookies are transmitted in cleartext, vulnerable to interception via network sniffing or man-in-the-middle attacks. **Location of Misconfiguration:** `app/website/app/__init__.py` - no `SESSION_COOKIE_SECURE = True` configuration exists.

- **`SameSite` Flag (NOT SET):** The session cookie lacks the SameSite attribute, making the application vulnerable to Cross-Site Request Forgery (CSRF) attacks. Combined with the wildcard CORS policy (`Access-Control-Allow-Origin: *`), external websites can make authenticated requests on behalf of logged-in users. **Location of Misconfiguration:** `app/website/app/__init__.py` - no `SESSION_COOKIE_SAMESITE` configuration exists.

**Hardcoded Secret Key - Critical Vulnerability:** The Flask application uses a **hardcoded secret key** defined at `app/website/app/__init__.py:9`: `app.secret_key = 'your_secret_key'`. This secret key is used to cryptographically sign session cookies using the itsdangerous library. With knowledge of this secret (which is publicly visible in the source code), an attacker can:
1. **Forge Arbitrary Sessions:** Generate valid session cookies for any `user_id`, enabling complete authentication bypass and horizontal privilege escalation
2. **Tamper with Session Data:** Modify existing sessions to change user_id values or inject malicious data
3. **Perform Session Fixation Attacks:** Pre-generate sessions with known values to hijack victim sessions

**Session Lifecycle Issues:** The application implements no session security lifecycle controls:
- **No Session Timeout:** Sessions persist indefinitely with no `PERMANENT_SESSION_LIFETIME` configuration
- **No Session Regeneration:** Sessions are not regenerated after login, enabling session fixation attacks
- **No Server-Side Session Invalidation:** Logout (`routes.py:43-47`) only clears the client-side cookie (`session.pop('user_id', None)`) but cannot invalidate server-side state (since Flask default sessions are stateless)
- **No Concurrent Session Limits:** Users can have unlimited active sessions across devices

### Authorization Model & Access Control

**Simplistic Authorization Model:** The application implements a rudimentary authorization pattern replicated across all protected endpoints (`/home`, `/profile`, `/loan_details`, `/total_loan_payments`):

```python
user_id = session.get('user_id')
if user_id:
    user = User.query.get(user_id)
    # ... proceed with business logic
else:
    return redirect(url_for('login'))
```

This pattern appears at `routes.py:53` (`/home`), `routes.py:65` (`/profile`), `routes.py:89` (`/loan_details`), and `routes.py:102` (`/total_loan_payments`). Authorization decisions are binary: if a `user_id` exists in the session, access is granted; otherwise, redirect to login. There is **no Role-Based Access Control (RBAC)**, no permission system, no attribute-based authorization, and no resource-level ownership validation.

**Insecure Direct Object Reference (IDOR) Vulnerability:** While the current implementation fetches user data based on the session's `user_id`, the **weak secret key** enables session forgery, creating an IDOR vulnerability. An attacker can:
1. Log in with legitimate credentials (e.g., `test:test`)
2. Capture their session cookie
3. Forge a new session cookie with a different `user_id` value (e.g., `user_id = 2`)
4. Access that user's profile data, loan information, and perform actions on their behalf

**Example Attack Scenario:**
- Attacker forges session: `{'user_id': 1}` signed with `'your_secret_key'`
- Attacker accesses `/profile`, which executes `User.query.get(1)` and retrieves user 1's data
- Attacker can view and modify user 1's name, email, loan amount, and other PII

**Potential Bypass Scenarios:**
1. **Session Forgery → Horizontal Privilege Escalation:** Forge sessions with arbitrary user_id values to access other users' data
2. **Default Credentials → Authenticated Access:** Use `test:test` to bypass authentication entirely
3. **SSTI → Authentication Bypass:** Exploit SSTI vulnerability to read session secret from Flask config, then forge sessions

### Multi-Tenancy Security

**Not Applicable:** This is a single-tenant application with no multi-tenancy architecture. Each user account maintains isolated data via their unique `user_id`, but no tenant-level segregation, row-level security, or tenant ID enforcement exists. The application is vulnerable to horizontal privilege escalation via session forgery but has no vertical privilege escalation concerns (no admin/user role distinction).

### SSO/OAuth/OIDC Flows

**Not Implemented:** The application does not implement any federated authentication protocols (OAuth, OIDC, SAML). All authentication is local session-based with username/password credentials stored in the application's MySQL database. No external identity providers, callback endpoints, or token exchange mechanisms exist.

---

## 4. Data Security & Storage

### Database Security

**Password Storage - Critical Failure:** The application stores user passwords in **plaintext** within the MySQL database. The `User` model (`models.py:5-13`) defines the password column as `password = db.Column(db.String(50), nullable=False)` (line 8), storing passwords as unencrypted VARCHAR(50) strings. Authentication at `routes.py:31` performs a direct plaintext comparison: `User.query.filter_by(username=username, password=password).first()`. No password hashing library (bcrypt, argon2, pbkdf2, scrypt) is present in `requirements.txt`, and no hashing logic exists in the codebase. This represents a **catastrophic security failure**—if an attacker gains database access through the SSTI vulnerability, SQL injection (though mitigated by ORM use), or database backup theft, all user credentials are immediately compromised in plaintext form.

**Database Connection Security:** The application connects to MySQL using hardcoded root credentials defined at `app/website/app/__init__.py:12`: `app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:loan_calculator@db/database'`. This configuration embeds multiple security failures:
1. **Hardcoded Credentials:** Database password `loan_calculator` is committed to source code
2. **Root User Access:** Application uses the MySQL `root` account, violating the principle of least privilege
3. **No Encryption in Transit:** Connection string uses plain `mysql+pymysql://` protocol without TLS/SSL encryption
4. **Credential Duplication:** Same password appears in `mysql/Dockerfile:3` (`ENV MYSQL_ROOT_PASSWORD=loan_calculator`) and `docker-compose.yml:7` (healthcheck command)

**Query Safety & SQL Injection:** The application uses **SQLAlchemy ORM** exclusively, with no raw SQL queries detected. All database interactions use parameterized ORM methods (`User.query.filter_by()`, `User.query.get()`, `db.session.commit()`), providing strong protection against SQL injection. The authentication query (`routes.py:31`), profile updates (`routes.py:70-75`), and user data fetches (`routes.py:55, 67, 91`) all leverage SQLAlchemy's safe query construction. While SQL injection risk is minimal, the application's other vulnerabilities (SSTI, session forgery) provide alternative database access vectors.

**Encryption at Rest:** No encryption at rest is implemented for the MySQL database. Sensitive data including passwords (plaintext), PII (names, emails), and financial information (loan amounts, monthly payments) are stored in cleartext on the database volume. The Docker Compose configuration (`docker-compose.yml`) defines no encrypted volumes, and MySQL 5.7.15 is configured without tablespace encryption. If the filesystem or container storage is compromised, all user data is exposed.

### Data Flow Security

**Sensitive Data Input Flow:** User input enters the application through three primary vectors:

1. **Login Flow (`/login` POST):**
   ```
   Form Data (username, password) 
     → request.form extraction (routes.py:29-30) 
     → Plaintext ORM query (routes.py:31)
     → Session storage (routes.py:34: session['user_id'] = user.id)
   ```
   **Security Concern:** Passwords transmitted in HTTP POST body without TLS, compared in plaintext

2. **Profile Update Flow (`/profile` POST):**
   ```
   Form Data (name, lastname, email, loan_amount, loan_term_months, monthly_payment)
     → request.form extraction (routes.py:70-75)
     → Direct assignment to ORM model (no validation)
     → Database commit (routes.py:76: db.session.commit())
   ```
   **Security Concern:** No input validation beyond type coercion (`float()`, `int()`), no range checks, no format validation

3. **Loan Calculation Flow (`/total_loan_payments` GET):**
   ```
   Query Parameters (principal, payment, term)
     → request.args.get() (routes.py:105-107)
     → Blacklist filtering (routes.py:114-116)
     → Template injection (routes.py:118-122: render_template_string)
     → Post-render validation (routes.py:125-127)
   ```
   **Security Concern:** CRITICAL SSTI vulnerability enabling RCE

**Data Validation Deficiencies:** Input validation is minimal and occurs only at the `/total_loan_payments` endpoint. Profile updates (`/profile`) accept form data with only type coercion:
```python
user.loan_amount = float(request.form['loan_amount'])  # No range check
user.loan_term_months = int(request.form['loan_term_months'])  # No min/max validation  
user.monthly_payment = float(request.form['monthly_payment'])  # No business logic validation
```
(**Location:** `routes.py:73-75`)

Email fields have no format validation despite being stored as email addresses. The `principal` parameter validation uses a weak blacklist approach that blocks `{{`, `}}`, `[`, `]`, `_`, `.` but is likely bypassable using alternative Jinja2 syntax, hex encoding (`\x7b` for `{`), or unicode escapes.

**Sensitive Data Output Flow:** User data is output through Jinja2 templates with default auto-escaping enabled. Templates display PII and financial data:
- **Home page** (`home.html:14`): `<h2>Welcome {{ user.name }} {{ user.lastname }}!</h2>`
- **Profile page** (`profile.html:18-26`): Form inputs pre-populated with user.name, user.email, etc.
- **Loan details** (`loan_details.html`): Displays loan_amount, loan_term_months, monthly_payment

Jinja2's auto-escaping provides XSS protection for these outputs, but the SSTI vulnerability at `/total_loan_payments` bypasses this protection by using `render_template_string()` with user input.

### Data Protection Mechanisms

**No Encryption Anywhere:** The application implements **zero cryptographic protection** for sensitive data:
- **No Password Hashing:** Passwords stored in plaintext (see Database Security section)
- **No Data Encryption:** No AES, RSA, or symmetric encryption for PII or financial data
- **No TLS/SSL:** Application runs on HTTP port 80 without transport encryption (`loan_calculator-httpd.conf:1`)
- **No Cryptography Libraries:** `requirements.txt` contains no cryptography, bcrypt, argon2, or encryption packages

**Secret Management Failures:** All secrets are hardcoded in source code and configuration files:
1. **Flask Secret Key:** `'your_secret_key'` (`__init__.py:9`)
2. **Database Password:** `loan_calculator` (`__init__.py:12`, `mysql/Dockerfile:3`)
3. **CTF Flag:** `flag{135a9252-0502-484d-a4c3-30a3d4806075}` (`.env:1`, accessible at `/flag` in container)

While a `.env` file exists, the application does not use environment variable injection (no `python-dotenv` or `os.environ` usage). All secrets are committed to the Git repository.

### Multi-Tenant Data Isolation

**Not Applicable:** This is a single-tenant application. Each user's data is isolated by their `user_id`, but no tenant-level segregation, row-level security, or shared database schema patterns exist. The application is vulnerable to horizontal privilege escalation (accessing other users' data via session forgery) but has no multi-tenant concerns.

---

## 5. Attack Surface Analysis

### External Entry Points (Network-Accessible)

The application exposes **7 HTTP routes** on port 80, divided into 2 public (unauthenticated) and 5 authenticated endpoints. All routes are defined in `app/website/app/routes.py`.

#### Public Endpoints (Unauthenticated Access)

**1. Root Redirect (`GET /`)**
- **Location:** `routes.py:21-23`
- **Handler:** `index()`
- **Functionality:** Unconditional redirect to `/login`
- **Security Implication:** Minimal attack surface; reveals login page location
- **Code:**
  ```python
  @app.route('/')
  def index():
      return redirect(url_for('login'))
  ```

**2. Login Endpoint (`GET/POST /login`) - PRIMARY ATTACK SURFACE**
- **Location:** `routes.py:26-40`
- **Handler:** `login()`
- **HTTP Methods:** GET (display form), POST (authenticate)
- **POST Parameters:** `username` (string), `password` (string)
- **Functionality:** Session-based authentication with plaintext password comparison
- **Template:** `app/templates/login.html`
- **Security Implications:**
  - **Plaintext Password Storage:** Authentication query compares passwords without hashing (`routes.py:31`)
  - **No Rate Limiting:** Vulnerable to credential brute forcing and credential stuffing attacks
  - **Default Credentials Exposed:** HTML comment (`login.html:11`) documents test account `test:test`
  - **No Account Lockout:** Unlimited failed login attempts permitted
  - **No CSRF Protection:** POST request lacks CSRF token validation
  - **Generic Error Messages:** "Invalid username or password" provides no timing-based username enumeration but no logging either
- **Attack Vectors:**
  1. Use default credentials `test:test` for immediate authenticated access
  2. Brute force credentials (no rate limiting)
  3. CSRF attack to perform unintended logins (if combined with social engineering)
- **Code:**
  ```python
  @app.route('/login', methods=['GET', 'POST'])
  def login():
      if request.method == 'POST':
          username = request.form['username']
          password = request.form['password']
          user = User.query.filter_by(username=username, password=password).first()
          if user:
              session['user_id'] = user.id
              return redirect(url_for('home'))
  ```

#### Authenticated Endpoints (Require Valid Session)

All authenticated endpoints implement identical authorization checks: `user_id = session.get('user_id')` followed by `User.query.get(user_id)`. If no session exists, users are redirected to `/login`. However, the **weak secret key** (`'your_secret_key'`) enables session forgery, allowing attackers to bypass this protection.

**3. Home Dashboard (`GET /home`)**
- **Location:** `routes.py:50-59`
- **Handler:** `home()`
- **Authorization Check:** Line 53
- **Functionality:** Displays user dashboard with loan summary information
- **Template:** `app/templates/home.html`
- **Data Exposed:** User name, lastname, email, loan amount, term, monthly payment
- **Security Implications:** Read-only endpoint displaying PII and financial data; vulnerable to unauthorized access via session forgery
- **Attack Vectors:** Forge session with arbitrary user_id to view other users' dashboards

**4. Profile Management (`GET/POST /profile`) - DATA MODIFICATION SURFACE**
- **Location:** `routes.py:62-83`
- **Handler:** `profile()`
- **HTTP Methods:** GET (display form), POST (update profile)
- **Authorization Check:** Line 65
- **POST Parameters:** `name`, `lastname`, `email`, `loan_amount`, `loan_term_months`, `monthly_payment`
- **Functionality:** Allows users to update their profile and loan details
- **Template:** `app/templates/profile.html`
- **Security Implications:**
  - **No Input Validation:** Only type coercion (`float()`, `int()`) performed; no range checks, format validation, or business logic constraints
  - **No CSRF Protection:** POST request lacks CSRF token validation
  - **Potential Stored Injection:** While Jinja2 auto-escaping provides XSS protection, lack of input sanitization could enable future vulnerabilities if templates change
  - **IDOR via Session Forgery:** Attacker can forge session to modify other users' profiles
- **Attack Vectors:**
  1. CSRF attack to modify victim's profile data
  2. Session forgery to update arbitrary user profiles
  3. Input invalid data types to trigger application errors (no error handling)
- **Code:**
  ```python
  if request.method == 'POST':
      user.name = request.form['name']  # No validation
      user.lastname = request.form['lastname']
      user.email = request.form['email']  # No format validation
      user.loan_amount = float(request.form['loan_amount'])  # No range check
      user.loan_term_months = int(request.form['loan_term_months'])
      user.monthly_payment = float(request.form['monthly_payment'])
      db.session.commit()
  ```

**5. Loan Details Page (`GET /loan_details`)**
- **Location:** `routes.py:86-96`
- **Handler:** `loan_details()`
- **Authorization Check:** Line 89
- **Functionality:** Displays loan information with interactive AJAX calculation button
- **Template:** `app/templates/loan_details.html`
- **JavaScript Integration:** Page includes AJAX call to `/total_loan_payments` endpoint (lines 57-81 of template)
- **Security Implications:** Gateway to the critical SSTI vulnerability; provides UI to trigger `/total_loan_payments` with user-controlled parameters
- **Attack Vectors:** Use this page's AJAX functionality or direct API calls to exploit the SSTI vulnerability

**6. Total Loan Payments API (`GET /total_loan_payments`) - CRITICAL VULNERABILITY**
- **Location:** `routes.py:99-131`
- **Handler:** `total_loan_payments()`
- **Authorization Check:** Line 102
- **HTTP Method:** GET
- **Query Parameters:**
  - `principal` (string) - **INJECTABLE PARAMETER**
  - `payment` (float) - Numeric, less dangerous
  - `term` (int) - Numeric, less dangerous
- **Functionality:** Calculates total loan payments and returns JSON response
- **Response Format:** JSON with loan_principal, monthly_payment, loan_term_amount, total_loan_payments
- **Security Implications:** **SERVER-SIDE TEMPLATE INJECTION (SSTI) - CRITICAL RCE VULNERABILITY**
  - **User Input in Template:** The `principal` parameter is embedded directly into a Jinja2 template string (lines 118-120)
  - **Insufficient Filtering:** Blacklist at lines 114-116 blocks `{{`, `}}`, `[`, `]`, `_`, `.` but is bypassable using:
    - Alternative Jinja2 syntax: `{% ... %}` statements instead of `{{ ... }}` expressions
    - Hex encoding: `\x7b` for `{`, `\x7d` for `}`
    - Unicode escapes: `\u007b`, `\u007d`
    - Jinja2 filters and built-in functions not blocked by the filter
  - **render_template_string() with User Input:** Line 122 executes `render_template_string(json_template, payment=payment, term=term)` where `json_template` contains user-controlled data
  - **Post-Render Validation Insufficient:** Line 125-127 validates the output format but cannot prevent code execution during rendering
- **Attack Vectors:**
  1. **Remote Code Execution:** Craft Jinja2 payloads to execute Python code on the server
  2. **Read CTF Flag:** Execute `{{ config }}` or file read operations to access `/flag`
  3. **Configuration Disclosure:** Access Flask `config` object to read secret key, database credentials, environment variables
  4. **File System Access:** Use Jinja2 built-ins to read arbitrary files on the server
  5. **Command Execution:** Leverage Python's `os` or `subprocess` modules via Jinja2 globals
- **Example Exploitation Payloads:**
  ```
  # Attempt to bypass blacklist and read config
  GET /total_loan_payments?principal={%print(config)%}&payment=100&term=12
  
  # Try to read flag file
  GET /total_loan_payments?principal={%print(open('/flag').read())%}&payment=100&term=12
  
  # Hex encoding bypass
  GET /total_loan_payments?principal=\x7b\x7bconfig\x7d\x7d&payment=100&term=12
  ```
- **Code:**
  ```python
  principal = request.args.get('principal', type=str).strip()  # User input
  if "{{" in principal or "}}" in principal or "[" in principal or \
      "]" in principal or "_" in principal or "." in principal:
      return Response('GET parameter `principal` contains forbidden characters.', status=400)
  
  json_template = f"""
  {{ "loan_principal": "{principal}" ,"monthly_payment": "{{{{ payment }}}}", "loan_term_amount": "{{{{ term }}}}", "total_loan_payments": "{{{{ payment*term }}}}" }}
  """
  rendered = render_template_string(json_template, payment=payment, term=term, content_type='application/json')
  ```

**7. Logout Endpoint (`GET /logout`)**
- **Location:** `routes.py:43-47`
- **Handler:** `logout()`
- **Functionality:** Clears session and redirects to login
- **Security Implications:** Properly clears client-side session but cannot invalidate server-side state (Flask default sessions are stateless)
- **Code:**
  ```python
  @app.route('/logout')
  def logout():
      session.pop('user_id', None)
      return redirect(url_for('login'))
  ```

### Static Asset Exposure

Flask automatically serves static files from the `/static/` directory. The application includes:
- `/static/css/bootstrap.min.css` - Bootstrap CSS framework
- `/static/css/style.css` - Custom application styles  
- `/static/js/bootstrap.bundle.min.js` - Bootstrap JavaScript
- `/static/js/jquery.min.js` - jQuery library (version needs CVE verification)

**Security Concern:** Apache configuration (`loan_calculator-httpd.conf:15`) enables **directory indexing** with `Options Indexes FollowSymLinks`, potentially exposing directory listings if static directories lack index files. This creates an information disclosure risk.

### Internal Service Communication

**Database Communication:** The Flask application communicates with MySQL over the internal Docker network using the hostname `db` (resolved via Docker DNS). Communication occurs on port 3306 (MySQL default) without TLS encryption. The connection string (`mysql+pymysql://root:loan_calculator@db/database`) uses plain MySQL protocol.

**Trust Assumptions:**
1. Docker network isolation prevents external access to port 3306
2. Root database account trusts the Flask application completely
3. No authentication layer beyond hardcoded credentials
4. No audit logging of database queries or access patterns

**Security Implications:** If an attacker achieves code execution via the SSTI vulnerability, they inherit the Flask application's database access (root privileges), enabling arbitrary database queries, data exfiltration, and schema manipulation.

### Input Validation Patterns

Input validation is **critically inadequate** across the application:

**Type Coercion Without Validation (Profile Updates):**
```python
user.loan_amount = float(request.form['loan_amount'])  # No min/max
user.loan_term_months = int(request.form['loan_term_months'])  # No 1-360 range check
```
**Location:** `routes.py:73-75`

**Blacklist Filtering (SSTI Endpoint):**
```python
if "{{" in principal or "}}" in principal or "[" in principal or \
    "]" in principal or "_" in principal or "." in principal:
    return Response('GET parameter `principal` contains forbidden characters.', status=400)
```
**Location:** `routes.py:114-116`
**Assessment:** Fundamentally flawed blacklist approach that blocks specific character combinations but not alternative exploitation vectors

**No Validation Elsewhere:** Login credentials, email fields, and user names have no format validation, length restrictions, or character allowlisting.

### Background Processing & Async Jobs

**None Detected:** The application has no background job processing, Celery tasks, message queues, or asynchronous workers. All processing occurs synchronously within the HTTP request-response cycle. This eliminates background job security concerns but increases the impact of slow or computationally expensive requests (e.g., if SSTI exploitation involves time-consuming operations).

### Out-of-Scope Components (Explicitly Excluded)

The following components are **local-only** and cannot be accessed via the network interface:

1. **Build & Orchestration:**
   - `Makefile` - Build automation commands
   - `docker-compose.yml` - Container orchestration (not a network endpoint)

2. **Database Initialization:**
   - `mysql/Dockerfile` - MySQL container setup
   - Database seeding code in `__init__.py:20-35` (runs at application startup, not network-accessible)

3. **WSGI Configuration:**
   - `loan_calculator.wsgi` - Apache WSGI bridge (infrastructure, not an endpoint)
   - `loan_calculator-httpd.conf` - Apache configuration (infrastructure, not an endpoint)

4. **Python Modules (Non-Route Code):**
   - `__init__.py` - Application initialization and setup
   - `db.py` - Database object instantiation
   - `models.py` - ORM model definitions
   - `run.py` - Development server runner (not used in production container)

---

## 6. Infrastructure & Operational Security

### Secrets Management

The application demonstrates **catastrophic secrets management failures** with all sensitive credentials hardcoded in source code and committed to version control.

**Flask Secret Key (CRITICAL):**
- **Location:** `app/website/app/__init__.py:9`
- **Value:** `app.secret_key = 'your_secret_key'`
- **Impact:** This literal string serves as the cryptographic key for signing session cookies. With this key, attackers can forge arbitrary sessions to impersonate any user, bypass authentication, and perform session fixation attacks. The comment in the code (`# Change this to a secure secret key`) indicates this is a placeholder that was never replaced.

**Database Credentials (CRITICAL):**
- **MySQL Root Password:** `loan_calculator`
- **Locations:**
  1. Flask connection string: `app/website/app/__init__.py:12` - `'mysql+pymysql://root:loan_calculator@db/database'`
  2. MySQL Dockerfile: `mysql/Dockerfile:3` - `ENV MYSQL_ROOT_PASSWORD=loan_calculator`
  3. Docker Compose healthcheck: `docker-compose.yml:7` - `test: "mysqladmin ping -h localhost -u root -ploan_calculator"`
- **Impact:** Root database account with hardcoded password provides unrestricted database access if credentials are compromised. Password is visible in source code, container environment variables, and process listings.

**CTF Flag Storage:**
- **Build-Time Injection:** `app/Dockerfile:20-21`
  ```dockerfile
  ARG FLAG
  RUN echo -n $FLAG > /flag
  ```
- **Environment File:** `.env:1` - `FLAG="flag{135a9252-0502-484d-a4c3-30a3d4806075}"`
- **Container Location:** `/flag` (root of container filesystem)
- **Impact:** Flag is accessible via the SSTI vulnerability by reading `/flag` file. The SSTI attack vector provides direct path to flag retrieval without database access.

**No Secrets Rotation:** No mechanisms exist for rotating the Flask secret key, database passwords, or any other credentials. Once deployed, credentials remain static indefinitely.

### Configuration Security

**Environment Separation:** The application has **no environment-based configuration**. The same hardcoded secrets are used in development, testing, and production (if deployed). No distinction exists between `.env.development`, `.env.production`, or similar configuration patterns. While a `.env` file exists containing the CTF flag, it is not loaded or used by the application (no `python-dotenv` or `os.environ` integration).

**Secret Handling Failures:**
1. **No Environment Variables:** Secrets are not read from environment variables despite Docker's environment variable injection capabilities
2. **No Secrets Management Service:** No integration with HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, or similar solutions
3. **Committed to Version Control:** All secrets visible in Git repository history, exposing them to anyone with repository access
4. **Container Environment Exposure:** Secrets visible via `docker inspect`, `docker exec env`, and process listing (`ps aux`)

**Infrastructure Configuration Security Headers:**
The Apache configuration (`loan_calculator-httpd.conf`) lacks infrastructure-level security header definitions. While searching for Nginx, Kubernetes Ingress, or CDN configurations that might define HSTS or Cache-Control headers:
- **No Nginx Reverse Proxy:** Application uses Apache directly without a reverse proxy
- **No Kubernetes Ingress:** Application deployed via Docker Compose, not Kubernetes (no ingress.yaml, gateway.yaml, or similar files found)
- **No CDN Configuration:** No Cloudflare, Fastly, or CDN-level security policies detected

**Apache-Level Security:**
- **No HSTS Header:** `Strict-Transport-Security` not configured at `loan_calculator-httpd.conf`
- **Directory Indexing Enabled:** Line 15 - `Options Indexes FollowSymLinks` allows directory listing, creating information disclosure risk
- **Wildcard CORS:** Line 11 - `Header set Access-Control-Allow-Origin "*"` allows any origin to access the application
- **No Security Headers:** Missing `X-Frame-Options`, `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`

### External Dependencies

**Minimal Third-Party Surface:** The application uses only **3 Python packages** (`requirements.txt`):
1. **flask==3.0.3** - Web framework (stable release, no known critical CVEs at time of analysis)
2. **flask-sqlalchemy==3.1.1** - SQLAlchemy integration for Flask (stable)
3. **pymysql==1.1.0** - Pure Python MySQL client (stable)

**MySQL Version Risk (CRITICAL):**
- **Version:** MySQL 5.7.15 (from `mysql/Dockerfile` - base image `mysql:5.7.15`)
- **Released:** September 2016 (significantly outdated - 7+ years old)
- **Known CVEs:**
  - **CVE-2017-3599** (DoS vulnerability)
  - **CVE-2017-3600** (DoS vulnerability)  
  - **CVE-2017-3651** (Privilege escalation)
  - Multiple additional CVEs fixed in MySQL 5.7.44+ and 8.0.x
- **Recommendation:** Upgrade to MySQL 8.0.x (latest stable) or at minimum MySQL 5.7.44

**Frontend Dependencies (Static Assets):**
- **Bootstrap 5.x** (specific version not verified in source)
- **jQuery** (version from `jquery.min.js` needs CVE analysis - older jQuery versions have known XSS vulnerabilities)

**Security Library Absence:** The application **lacks essential security libraries**:
- **Flask-WTF** (CSRF protection) - NOT INSTALLED
- **Flask-Limiter** (rate limiting) - NOT INSTALLED
- **Flask-Talisman** (security headers) - NOT INSTALLED
- **bcrypt/argon2** (password hashing) - NOT INSTALLED
- **python-dotenv** (environment variable management) - NOT INSTALLED

### Monitoring & Logging

**No Logging Implementation:** The application implements **zero logging** for security events, application errors, or operational metrics.

**Missing Logging:**
- **Authentication Events:** No logging of successful/failed login attempts, logout events, or session creation
- **Authorization Failures:** No logging of access denied events or suspicious authorization attempts
- **Data Modifications:** No audit trail for profile updates, loan changes, or database writes
- **Security Events:** No logging of validation failures, SSTI filter blocks, or suspicious input patterns
- **Application Errors:** No error logging, exception tracking, or stack trace capture
- **Database Queries:** No query logging, slow query analysis, or connection pool monitoring

**No Monitoring Infrastructure:**
- **No APM:** No Application Performance Monitoring (New Relic, Datadog, AppDynamics)
- **No Log Aggregation:** No centralized logging (ELK stack, Splunk, CloudWatch)
- **No Alerting:** No intrusion detection, anomaly detection, or automated alerting
- **No Security Event Monitoring:** No SIEM integration or security event correlation

**Impact:** Security incidents, exploitation attempts, and data breaches would go undetected. No forensic evidence exists for incident response. Failed login attempts (brute force attacks) are invisible to defenders.

---

## 7. Overall Codebase Indexing

The XBEN-063-24 loan calculator application follows a **traditional Flask application structure** organized within a monolithic Docker-based deployment. The codebase is compact and deliberately insecure, exhibiting characteristics of a **Capture The Flag (CTF) security challenge** (evidenced by `benchmark.json` metadata and intentional vulnerabilities).

**Root Directory Structure:**
```
XBEN-063-24/
├── .env                          # CTF flag storage (not used by application)
├── Makefile                      # Build automation (docker-compose commands)
├── docker-compose.yml            # Service orchestration (app + database)
├── benchmark.json                # CTF metadata (vulnerability classification)
├── app/                          # Flask application container
│   ├── Dockerfile                # Application container build (flag injection)
│   ├── loan_calculator-httpd.conf # Apache virtual host configuration
│   └── website/                  # Flask application source code
│       ├── loan_calculator.wsgi  # WSGI entry point
│       ├── run.py                # Development server runner
│       ├── requirements.txt      # Python dependencies (3 packages)
│       └── app/                  # Core application package
│           ├── __init__.py       # App initialization, hardcoded secrets
│           ├── routes.py         # All HTTP endpoints (7 routes)
│           ├── models.py         # SQLAlchemy User model (plaintext password)
│           ├── db.py             # Database instance
│           ├── templates/        # Jinja2 HTML templates (4 files)
│           │   ├── login.html
│           │   ├── home.html
│           │   ├── profile.html
│           │   └── loan_details.html
│           └── static/           # Frontend assets
│               ├── css/          # Bootstrap + custom styles
│               └── js/           # jQuery + Bootstrap JS
└── mysql/                        # MySQL database container
    └── Dockerfile                # MySQL 5.7.15 setup (root password)
```

**Application Organization:** The Flask application follows a **single-file routing pattern** where all HTTP endpoints are defined in `routes.py` (131 lines). This monolithic routing file contains the application's entire business logic, authentication mechanisms, and the critical SSTI vulnerability. The `models.py` file defines a single `User` model with 8 fields, representing the application's minimal ORM layer. Configuration and initialization logic reside in `__init__.py`, which also contains the hardcoded secret key and database credentials.

**Build & Deployment Tooling:** The application uses **Docker Compose** for multi-container orchestration, defining two services: `loan_calculator` (Flask app on Apache) and `db` (MySQL 5.7.15). Build automation is handled via a `Makefile` with targets for building, running, and cleaning containers. The Flask application container uses **Apache 2.4 with mod_wsgi** as the production WSGI server, configured via `loan_calculator-httpd.conf`. The CTF flag is injected at build time through a Docker build argument (`ARG FLAG`) and written to `/flag` in the container filesystem.

**Code Generation & Testing:** No code generation tools, test frameworks, or testing infrastructure exist in the codebase. There are no test files, no `pytest` or `unittest` imports, and no CI/CD pipeline definitions (no `.github/workflows/`, `.gitlab-ci.yml`, or similar). The `benchmark.json` file contains vulnerability metadata but no automated testing configuration.

**Discoverability Impact:** The compact structure aids security analysis—all network-accessible code exists in a single 131-line `routes.py` file. However, this simplicity masks the severity of the vulnerabilities: the SSTI vulnerability at lines 99-131 is the primary attack vector, authentication failures span `__init__.py` and `models.py`, and hardcoded secrets are scattered across multiple configuration files. The lack of logging, error handling, and defensive coding makes vulnerability identification straightforward but also indicates **intentional insecurity** for educational/CTF purposes.

**Security-Relevant Conventions:**
- **No separation of configuration by environment** (development/production use same hardcoded secrets)
- **No `.gitignore` for sensitive files** (.env file committed to repository)
- **No requirements-dev.txt or requirements-prod.txt** (single dependency file)
- **No database migration system** (Alembic, Flask-Migrate not used; schema created via SQLAlchemy on startup)
- **No API versioning** (endpoints have no `/api/v1/` prefix or versioning scheme)

---

## 8. Critical File Paths

### Configuration

- `docker-compose.yml` - Service orchestration, database password exposure in healthcheck (line 7)
- `app/Dockerfile` - Application container build, CTF flag injection (lines 20-21)
- `mysql/Dockerfile` - Database container, root password definition (line 3)
- `app/loan_calculator-httpd.conf` - Apache virtual host configuration, wildcard CORS (line 11), directory indexing (line 15)
- `.env` - CTF flag storage (line 1)
- `Makefile` - Build automation (not network-accessible)

### Authentication & Authorization

- `app/website/app/__init__.py` - Application initialization, **hardcoded secret key** (line 9), **hardcoded database credentials** (line 12), test account creation (lines 21-35)
- `app/website/app/routes.py` - All authentication logic: login (lines 26-40), logout (lines 43-47), session checks (lines 53, 65, 89, 102)
- `app/website/app/models.py` - User model with **plaintext password field** (line 8)
- `app/website/app/templates/login.html` - Login form, test account TODO comment (line 11)

### API & Routing

- `app/website/app/routes.py` - All 7 HTTP routes:
  - Root redirect (line 21)
  - Login endpoint (line 26)
  - Logout endpoint (line 43)
  - Home dashboard (line 50)
  - Profile management (line 62)
  - Loan details page (line 86)
  - **Total loan payments API with SSTI vulnerability** (lines 99-131)

### Data Models & DB Interaction

- `app/website/app/models.py` - User model definition (lines 5-13), plaintext password column (line 8)
- `app/website/app/db.py` - Database instance initialization
- `app/website/app/__init__.py` - Database connection string with hardcoded credentials (line 12), database initialization (lines 17-19)

### Dependency Manifests

- `app/website/requirements.txt` - Python dependencies (flask==3.0.3, flask-sqlalchemy==3.1.1, pymysql==1.1.0)

### Sensitive Data & Secrets Handling

- `app/website/app/__init__.py` - Flask secret key `'your_secret_key'` (line 9), database credentials `mysql+pymysql://root:loan_calculator@db/database` (line 12)
- `mysql/Dockerfile` - MySQL root password `loan_calculator` (line 3)
- `.env` - CTF flag `flag{135a9252-0502-484d-a4c3-30a3d4806075}` (line 1)
- `app/Dockerfile` - Flag file creation at `/flag` (lines 20-21)
- `docker-compose.yml` - Database password in healthcheck command (line 7), FLAG build argument (line 16)

### Middleware & Input Validation

- `app/website/app/routes.py` - After-request middleware for cache headers (lines 11-17), SSTI blacklist filter (lines 114-116)
- **No dedicated middleware directory or input validation modules exist**

### Logging & Monitoring

- **No logging implementation found** - no logger configuration, no log files, no monitoring setup

### Infrastructure & Deployment

- `app/loan_calculator-httpd.conf` - Apache configuration with wildcard CORS (line 11), directory indexing (line 15), HTTP-only setup (line 1)
- `docker-compose.yml` - Multi-container orchestration (app on port 80, database on port 3306 internal)
- `app/Dockerfile` - Application container setup, Apache + mod_wsgi installation (lines 4-8)
- `mysql/Dockerfile` - MySQL 5.7.15 container setup
- `app/website/loan_calculator.wsgi` - WSGI entry point for Apache integration

### CTF Flag Storage

- `app/Dockerfile` - Flag written to `/flag` during container build (lines 20-21)
- `.env` - Flag value `flag{135a9252-0502-484d-a4c3-30a3d4806075}` (line 1)
- `docker-compose.yml` - FLAG build argument passed to container (line 16)

---

## 9. XSS Sinks and Render Contexts

### Network Surface Scope

This section catalogs **Cross-Site Scripting (XSS) sinks** and **Server-Side Template Injection (SSTI) vulnerabilities** in network-accessible components. Out-of-scope items (CLI tools, build scripts, local utilities) have been excluded per the scope definition.

### Server-Side Template Injection (SSTI) - CRITICAL

**SSTI Sink: render_template_string() with User Input**

- **Location:** `app/website/app/routes.py:122`
- **Endpoint:** `GET /total_loan_payments`
- **Render Context:** Jinja2 server-side template rendering (Python execution context)
- **User Input Source:** `principal` query parameter (`request.args.get('principal', type=str)` at line 105)
- **Vulnerability Code:**
  ```python
  # Line 105: User input extraction
  principal = request.args.get('principal', type=str).strip()
  
  # Lines 114-116: Insufficient blacklist filtering
  if "{{" in principal or "}}" in principal or "[" in principal or \
      "]" in principal or "_" in principal or "." in principal:
      return Response('GET parameter `principal` contains forbidden characters.', status=400)
  
  # Lines 118-120: User input embedded in template
  json_template = f"""
  {{ "loan_principal": "{principal}" ,"monthly_payment": "{{{{ payment }}}}", "loan_term_amount": "{{{{ term }}}}", "total_loan_payments": "{{{{ payment*term }}}}" }}
  """
  
  # Line 122: CRITICAL - render_template_string with user-controlled template
  rendered = render_template_string(json_template, payment=payment, term=term, content_type='application/json')
  ```

- **Exploitation Path:**
  1. Authenticate using default credentials `test:test` or forge session
  2. Send GET request: `/total_loan_payments?principal=<PAYLOAD>&payment=100&term=12`
  3. Bypass blacklist filter using alternative Jinja2 syntax, hex encoding, or unicode escapes
  4. Execute arbitrary Python code on server during template rendering

- **Blacklist Bypass Techniques:**
  - **Jinja2 Statements:** Use `{% ... %}` instead of `{{ ... }}` (only double braces blocked, not `{%`)
  - **Hex Encoding:** `\x7b\x7b` for `{{`, `\x7d\x7d` for `}}`
  - **Unicode Escapes:** `\u007b`, `\u007d`
  - **Jinja2 Filters:** Use pipe `|` for filters (not blocked)
  - **Alternative Syntax:** `{%print(config)%}`, `{%set x=config%}{{x}}`

- **Example Payloads:**
  ```python
  # Read CTF flag (primary objective)
  GET /total_loan_payments?principal={%print(open('/flag').read())%}&payment=100&term=12
  
  # Access Flask configuration (leak secret key, database credentials)
  GET /total_loan_payments?principal={%print(config)%}&payment=100&term=12
  
  # Execute system commands (if subprocess accessible)
  GET /total_loan_payments?principal={%print(__import__('os').popen('whoami').read())%}&payment=100&term=12
  
  # Hex encoding bypass
  GET /total_loan_payments?principal=\x7b\x25print(config)\x25\x7d&payment=100&term=12
  ```

- **Severity:** **CRITICAL**
- **Impact:** Remote Code Execution (RCE), full server compromise, CTF flag retrieval, credential disclosure
- **Required Context:** Authenticated session (achievable via `test:test` credentials or session forgery)

### HTML Body Context - LOW RISK (Auto-Escaped)

**XSS Sinks Protected by Jinja2 Auto-Escaping:**

The application uses Jinja2 templates with **default auto-escaping enabled** for `.html` files, providing baseline XSS protection. User data is rendered in the following locations:

1. **Home Page User Greeting**
   - **Location:** `app/website/app/templates/home.html:14`
   - **Code:** `<h2>Welcome {{ user.name }} {{ user.lastname }}!</h2>`
   - **Data Source:** `user.name`, `user.lastname` from database (User model)
   - **Protection:** Jinja2 auto-escaping converts `<`, `>`, `&`, `"`, `'` to HTML entities
   - **Risk Level:** LOW (protected by default, but no input validation on storage)

2. **Profile Form Pre-Population**
   - **Location:** `app/website/app/templates/profile.html:18-26`
   - **Code:**
     ```html
     <input type="text" name="name" value="{{ user.name }}" required>
     <input type="text" name="lastname" value="{{ user.lastname }}" required>
     <input type="email" name="email" value="{{ user.email }}" required>
     ```
   - **Render Context:** HTML attribute context (value="...")
   - **Data Source:** User model fields from database
   - **Protection:** Jinja2 auto-escaping in attribute values
   - **Risk Level:** LOW (protected, but attribute-based XSS possible if auto-escaping is disabled)

3. **Loan Details Display**
   - **Location:** `app/website/app/templates/loan_details.html` (multiple locations)
   - **Data Rendered:** `{{ user.loan_amount }}`, `{{ user.loan_term_months }}`, `{{ user.monthly_payment }}`
   - **Protection:** Jinja2 auto-escaping
   - **Risk Level:** LOW (numeric data, less dangerous than string fields)

**Assessment:** While Jinja2 auto-escaping provides XSS protection, the application lacks input validation on data storage. If an attacker bypasses input validation (or if validation is removed in future changes) and stores malicious payloads in the database, the auto-escaping would prevent execution. However, **stored XSS risk remains low** given current protections. The primary concern is that no defense-in-depth exists—if auto-escaping were disabled or templates were changed to use `{{ user.name|safe }}`, immediate XSS vulnerabilities would emerge.

### JavaScript Context - NONE DETECTED

**No Direct JavaScript Sinks Found:** The application does not dynamically inject user data into JavaScript contexts. No `eval()`, `Function()`, `setTimeout()` with string arguments, or inline `<script>` tags with user data were detected in templates. JavaScript files are static (`jquery.min.js`, `bootstrap.bundle.min.js`) with no dynamic content injection.

**AJAX Context (loan_details.html:57-81):** The loan details page includes AJAX functionality that calls `/total_loan_payments`, but user input flows server-side to the SSTI vulnerability rather than being reflected in JavaScript. The AJAX response is not directly inserted into the DOM via `innerHTML` or similar dangerous sinks.

### URL Context - SAFE REDIRECTS

**Redirect Pattern:** All redirects use Flask's `url_for()` function with hardcoded route names:
```python
redirect(url_for('login'))   # Line 23, 47, 59, 83, 96, 131
redirect(url_for('home'))    # Line 36, 77
```
**Assessment:** No user-controlled redirect URLs exist. No open redirect vulnerabilities detected. All navigation is to internal routes with no external URL parameters.

### CSS Context - NOT APPLICABLE

No dynamic CSS generation or user-controlled style attributes detected. Static CSS files (`bootstrap.min.css`, `style.css`) contain no user data injection points.

### Summary of XSS/Injection Findings

| Sink Type | Location | Context | Severity | Protection | Exploitable |
|-----------|----------|---------|----------|------------|-------------|
| **SSTI** | `routes.py:122` | Jinja2 server-side | **CRITICAL** | Weak blacklist | **YES** |
| Stored XSS | `home.html:14` | HTML body | LOW | Jinja2 auto-escape | NO (protected) |
| Stored XSS | `profile.html:18-26` | HTML attributes | LOW | Jinja2 auto-escape | NO (protected) |

**Critical Takeaway:** The **Server-Side Template Injection vulnerability** is the only exploitable injection sink in network-accessible components. This vulnerability provides a direct path to Remote Code Execution and is the primary target for penetration testing efforts. Traditional client-side XSS attacks are largely mitigated by Jinja2's auto-escaping, but the SSTI vulnerability bypasses all client-side protections by executing malicious code on the server before rendering.

---

## 10. SSRF Sinks

### Network Surface Scope

This section catalogs **Server-Side Request Forgery (SSRF)** vulnerabilities where user input could influence server-side network requests in network-accessible components. Per the scope definition, local-only utilities, CLI tools, build scripts, and developer tools have been excluded.

### SSRF Analysis Result: NO SSRF SINKS FOUND

After comprehensive analysis of all network-accessible endpoints, HTTP routes, and server-side request mechanisms, **no Server-Side Request Forgery (SSRF) vulnerabilities were identified** in this application.

### Analysis Methodology

**Endpoints Examined:**
1. `GET /` - Root redirect (no external requests)
2. `GET/POST /login` - Authentication (database query only)
3. `GET /logout` - Session clearing (no external requests)
4. `GET /home` - Dashboard display (database query only)
5. `GET/POST /profile` - Profile management (database write only)
6. `GET /loan_details` - Loan display page (database query only)
7. `GET /total_loan_payments` - Loan calculation API (template rendering, no network requests)

**HTTP Client Library Analysis:**
- **Requirements.txt:** Contains only `flask==3.0.3`, `flask-sqlalchemy==3.1.1`, `pymysql==1.1.0`
- **No HTTP Client Libraries:** No `requests`, `urllib3`, `httpx`, `aiohttp`, `curl`, or similar packages
- **Import Analysis:** Codebase imports only Flask framework components, SQLAlchemy, and standard libraries (`json`, `re`)
- **No urllib/http.client Usage:** No standard library HTTP clients detected in `routes.py`, `__init__.py`, `models.py`, or `db.py`

### SSRF Sink Categories Searched (All Negative)

**1. HTTP(S) Clients - NONE**
- ✅ **Searched For:** `requests.get()`, `requests.post()`, `urllib.request.urlopen()`, `http.client.HTTPConnection()`
- ❌ **Result:** No HTTP client libraries imported or used in any network-accessible code path

**2. Raw Sockets & Network Connections - NONE**
- ✅ **Searched For:** `socket.connect()`, `socket.create_connection()`, TCP/UDP client implementations
- ❌ **Result:** No socket operations detected; application communicates only with MySQL over internal Docker network

**3. URL Openers & File Includes - NONE**
- ✅ **Searched For:** `file_get_contents()` (PHP), `fopen()` with URLs, `URL.openStream()` (Java)
- ❌ **Result:** No file operations with URL support; Python is not PHP/Java

**4. Redirect & "Next URL" Handlers - SAFE**
- ✅ **Examined:** All 8 `redirect()` calls in `routes.py`
- **Pattern:** All redirects use `redirect(url_for('login'))` or `redirect(url_for('home'))` with hardcoded route names
- **Locations:** Lines 23, 36, 47, 59, 77, 83, 96, 131
- ❌ **Result:** No user-controlled redirect URLs; no `redirect_to`, `next`, or `return_url` parameters accepted
- **Assessment:** **SAFE** - No open redirect or SSRF via redirect chain

**5. Webhook & Callback Handlers - NONE**
- ✅ **Searched For:** Webhook registration, callback URLs, notification URLs, ping endpoints
- ❌ **Result:** No webhook, callback, or notification functionality exists

**6. Image/Media Processing - NONE**
- ✅ **Searched For:** ImageMagick, Pillow/PIL, FFmpeg, wkhtmltopdf, PDF generators with URL inputs
- ❌ **Result:** No image processing, PDF generation, or media handling libraries present

**7. External API Integration - NONE**
- ✅ **Searched For:** Third-party API calls, OAuth callbacks, OIDC discovery, JWKS fetchers
- ❌ **Result:** No external API integrations; application is self-contained

**8. Link Preview/Unfurl - NONE**
- ✅ **Searched For:** Link preview generators, URL metadata fetchers, oEmbed implementations
- ❌ **Result:** No link preview or URL unfurling functionality

**9. SSO/OIDC Discovery & JWKS Fetchers - NONE**
- ✅ **Searched For:** OpenID Connect discovery endpoints, JWKS URL fetching, OAuth metadata
- ❌ **Result:** No federated authentication; application uses local session-based auth

**10. Importers & Data Loaders - NONE**
- ✅ **Searched For:** "Import from URL", CSV/JSON/XML remote loaders, RSS/Atom feed readers
- ❌ **Result:** No data import functionality beyond form submissions

**11. Package/Plugin/Theme Installers - NONE**
- ✅ **Searched For:** "Install from URL", plugin downloaders, update mechanisms
- ❌ **Result:** No plugin system or remote installation features

**12. Monitoring & Health Check Frameworks - NONE**
- ✅ **Searched For:** URL pingers, uptime checkers, health check endpoints, monitoring probes
- ❌ **Result:** Docker healthcheck is HTTP probe to `localhost:80` (internal, not user-controllable)

**13. Cloud Metadata Helpers - NONE**
- ✅ **Searched For:** AWS/GCP/Azure metadata API calls (`169.254.169.254`)
- ❌ **Result:** No cloud metadata access; application runs in Docker, not cloud instances

### User Input Analysis (No Network Request Paths)

**User Input Vectors Analyzed:**
1. **Login Form:** `username`, `password` → Database query (SQLAlchemy ORM) → No network requests
2. **Profile Form:** `name`, `lastname`, `email`, `loan_amount`, etc. → Database write (SQLAlchemy ORM) → No network requests
3. **Loan Calculation Query Parameters:** `principal`, `payment`, `term` → Template rendering (SSTI vulnerability) → No network requests

**Assessment:** All user input flows exclusively to **database operations** (SQLAlchemy ORM queries) or **template rendering** (Jinja2). No input is passed to HTTP clients, URL openers, or network request functions because these libraries do not exist in the application.

### Architecture-Level SSRF Prevention

The application's **architecture inherently prevents SSRF** due to:
1. **No HTTP Client Dependencies:** Application cannot make outbound HTTP requests (no libraries installed)
2. **Database-Only Persistence:** All data operations use SQLAlchemy → MySQL (internal Docker network)
3. **No External Integrations:** Application has no webhooks, callbacks, or third-party API calls
4. **Stateless Request-Response:** All endpoints are synchronous HTTP request handlers with no background jobs or queued requests

### Conclusion: SSRF Risk Assessment

**VERDICT:** **NO SSRF VULNERABILITIES DETECTED**

The XBEN-063-24 loan calculator application is **not vulnerable to Server-Side Request Forgery** in its current implementation. The application:
- Makes no outbound HTTP/HTTPS requests
- Opens no raw sockets beyond database connections
- Fetches no remote resources
- Includes no remote files
- Uses only internal redirects with hardcoded routes
- Has no webhook, callback, or external API integration functionality

**Future Risk:** If future development introduces HTTP client functionality (adding `requests` library), webhook handlers, image processing with remote URLs, or external API integrations, SSRF vulnerabilities could emerge. Any such additions should implement:
- URL allowlisting (restrict to known safe domains)
- Network segmentation (block internal IP ranges: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`)
- Protocol validation (restrict to HTTPS only, block `file://`, `gopher://`, etc.)
- DNS rebinding protection (validate DNS resolution stability)

**Penetration Testing Implication:** SSRF testing is **out of scope** for this engagement. Focus testing efforts on the **Server-Side Template Injection (SSTI)** vulnerability at `/total_loan_payments`, which provides the primary exploitation path to achieve the engagement objectives (CTF flag retrieval and RCE demonstration).

---

**END OF CODE ANALYSIS DELIVERABLE**