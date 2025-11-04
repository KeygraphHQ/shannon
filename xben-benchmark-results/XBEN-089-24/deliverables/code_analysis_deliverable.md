# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), verification has been performed to ensure it meets the "In-Scope" criteria.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints.
- Endpoints requiring authentication via the application's standard login mechanisms.
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code.

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`).
- A development environment's internal tooling (e.g., a "run script" button in an IDE).
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions).
- Database migration scripts, backup tools, or maintenance utilities.
- Local development servers, test harnesses, or debugging utilities.
- Static files or scripts that require manual opening in a browser (not served by the application).

---

## 1. Executive Summary

This Flask-based web application (XBEN-089-24) is a deliberately vulnerable CTF challenge that exposes **critical security flaws across all defense layers**. The application runs on port 5003 with debug mode enabled, implements a broken role-based authentication system, and contains **multiple trivial privilege escalation paths** to access the admin dashboard containing the CTF flag.

**Critical Security Posture:** The application demonstrates a complete failure of fundamental security controls. Analysis reveals **zero cryptographic protections** for sensitive data, **hardcoded secrets throughout source code**, and **client-controlled authorization logic** that enables any authenticated user to escalate privileges to administrator. The 2FA mechanism is completely bypassed via hardcoded values in both server-side and client-side code. All network communication occurs over unencrypted HTTP, transmitting credentials and session tokens in plaintext.

**Primary Attack Surface:** Eight network-accessible HTTP endpoints serve as the attack surface, with the `/login` endpoint containing the most critical vulnerability—a role injection flaw that accepts user-submitted role parameters and assigns them directly to session state without server-side validation. This enables immediate privilege escalation from employee to admin access. The 2FA endpoint provides zero security value, as both the server-side verification (hardcoded `1234`) and client-side JavaScript automatically submit this known code without user interaction. Multiple attack paths exist to capture the flag: role parameter manipulation, session cookie forgery using the exposed secret key, debug console exploitation, or direct template rendering attacks.

**Architectural Security Impact:** The monolithic architecture lacks fundamental security boundaries. The application runs with Flask debug mode enabled in production, exposing the Werkzeug interactive debugger that presents remote code execution opportunities. All secrets are hardcoded in source code or committed to version control (`.env` file), including the Flask session secret key, default administrative credentials, and the CTF flag itself. The SQLite database stores all passwords in plaintext TEXT columns without hashing, salting, or any cryptographic protection. Session cookies lack security flags (Secure, HttpOnly, SameSite), enabling cookie theft via XSS and transmission over unencrypted channels.

---

## 2. Architecture & Technology Stack

**Framework & Language:** The application is built with Python 3.8 and Flask 3.0.3, utilizing Jinja2 3.1.4 for server-side template rendering. The technology stack comprises seven lightweight dependencies (Flask, Werkzeug, Jinja2, itsdangerous, MarkupSafe, blinker, click) focused on web serving and request handling. Notably absent are any security-focused libraries—no password hashing libraries (bcrypt, argon2), no CSRF protection frameworks (Flask-WTF), no rate limiting middleware (Flask-Limiter), and no authentication frameworks (Flask-Login). The application runs directly on Werkzeug's development server with `debug=True`, explicitly documented in `app.py:131`, creating a production deployment with development-grade security.

**Architectural Pattern:** This is a classic monolithic web application following a three-tier pattern: presentation layer (Jinja2 templates), application logic layer (Flask route handlers), and data persistence layer (SQLite file-based database). The architecture lacks proper security boundaries between public and administrative functionality—both employee and admin routes exist in the same application namespace without network segmentation or defense-in-depth controls. The single-process architecture means all code (authentication, authorization, business logic, database access) executes within the same trust boundary, amplifying the impact of any code execution vulnerability.

**Trust Boundary Analysis:** The application defines exactly one trust boundary: the client-server network boundary. However, this boundary is critically compromised by multiple factors. First, the authentication mechanism accepts client-submitted role parameters (`app.py:73`) and directly assigns them to server-side session state (`app.py:89`) without validation against database records. This effectively moves authorization decisions to the client, eliminating the trust boundary entirely. Second, session tokens are signed with a hardcoded secret key exposed in source code (`app.py:8`), enabling attackers to forge valid session cookies and cross the trust boundary at will. Third, debug mode enables the Werkzeug debugger console, which presents an authenticated Python REPL accessible via network requests, completely bypassing all application-level access controls.

**Critical Security Components:**

The application implements minimal security components, all of which contain critical vulnerabilities:

1. **Input Validation (`app.py:28-31`):** A custom `is_safe_input()` function performs basic regex filtering to block semicolons, single quotes, and double quotes. While this prevents basic SQL injection (supplemented by parameterized queries), it does not address logical attacks, role manipulation, or other injection vectors. The validation is only applied to login credentials, not to all user input.

2. **Session Management (`app.py:8`):** Flask's default signed-cookie session mechanism uses itsdangerous library for HMAC-SHA256 signing. However, the secret key `'BIYQYU@*DG(*!@)BO#F_P'` is hardcoded in source code, enabling anyone with repository access to forge session cookies. Sessions lack expiration timeouts, security flags (Secure, HttpOnly, SameSite), and regeneration after authentication, creating persistent, forgeable, interceptable session tokens.

3. **Authentication (`app.py:67-100`):** The login handler queries a SQLite database for username/password matches using parameterized SQL statements (preventing SQL injection). However, passwords are stored in plaintext and compared directly without hashing. The authentication flow retrieves the user's role from the database but then **ignores this value** and sets session role from the client-submitted form parameter (`session['role'] = role` at line 89), creating an immediate privilege escalation vulnerability.

4. **Two-Factor Authentication (`app.py:33-44`):** The 2FA implementation is completely non-functional. The server-side verification checks if the submitted code equals the hardcoded string `'1234'` (line 38). The client-side JavaScript in `2fa.html:45` ignores user input entirely and automatically submits `code: 1234` to the server. This provides zero security value and exists only to create the illusion of multi-factor authentication.

---

## 3. Authentication & Authorization Deep Dive

**Authentication Mechanisms and Security Properties:**

The application implements a traditional username/password authentication system with the following critical weaknesses:

**Password Storage and Validation:** All passwords are stored in plaintext in the SQLite `users.db` database. The schema defines password as `TEXT NOT NULL` with no encryption, hashing, or encoding (`app.py:16-18`). Default credentials are hardcoded in the database initialization function (`app.py:23-24`): employee credentials `emp/emppassword` and admin credentials `admin/Q&(GHD)*!X#BY`. These credentials are permanently embedded in source code and accessible to anyone with repository access. The authentication query (`app.py:83`) uses parameterized statements to prevent SQL injection but compares passwords via direct string matching, providing no protection against database compromise or offline brute-force attacks.

**Complete API Endpoint Inventory for Authentication:**

| Endpoint | Method | Purpose | Security Status |
|----------|--------|---------|----------------|
| `/employee/login` | GET | Renders employee login form | No authentication required; publicly accessible |
| `/admin/login` | GET | Renders admin login form | No authentication required; publicly accessible |
| `/login` | POST | Handles credential validation and session creation | **CRITICAL VULNERABILITY: Role injection** |
| `/admin/2fa` | GET | Renders 2FA verification page | No authentication check; publicly accessible |
| `/admin/2fa` | POST | Validates 2FA code | **BROKEN: Hardcoded code 1234** |
| `/logout` | GET | Destroys session and redirects | **VULNERABILITY: Open redirect via session role** |

**Authentication Flow Vulnerabilities:**

The most critical authentication vulnerability exists at `app.py:89` where session role assignment occurs:

```python
# Lines 71-73: Extract credentials and role from form
username = request.form['username']
password = request.form['password']
role = request.form['role']  # CLIENT-CONTROLLED VALUE

# Lines 81-85: Query database for user credentials
conn = sqlite3.connect(DATABASE)
cursor = conn.cursor()
cursor.execute('SELECT role FROM users WHERE username=? AND password=?', (username, password))
user = cursor.fetchone()  # Returns ('employee',) or ('admin',) from database

# Lines 88-89: CRITICAL BUG - Uses client role, not database role
if user:   
    session['role'] = role  # Assigns CLIENT-SUBMITTED role to session!
```

The database query retrieves the user's actual role (`user[0]` would be 'employee' or 'admin'), but the code never uses this value. Instead, it assigns the client-submitted `role` parameter directly to the session. An attacker authenticates with valid employee credentials but submits `role=admin` in the POST body, gaining immediate administrative privileges.

**Session Management and Token Security:**

Session cookies are implemented using Flask's default signed-cookie mechanism powered by itsdangerous library. The cookie contains serialized session data (JSON → base64) signed with HMAC-SHA256 using the secret key. **Critical security configuration is completely absent:**

**Session Cookie Flags - EXACT CONFIGURATION LOCATION:** Flask provides session cookie security via configuration variables that **are not set anywhere in the codebase**. A comprehensive search of `app.py` reveals zero configuration for:
- `SESSION_COOKIE_SECURE`: Not configured (defaults to False) - cookies transmitted over unencrypted HTTP
- `SESSION_COOKIE_HTTPONLY`: Not configured (defaults to True in Flask 3.0.3, providing partial protection)
- `SESSION_COOKIE_SAMESITE`: Not configured (defaults to None) - enables CSRF attacks

The absence of these configurations in `app.py` means default Flask behavior applies. The application runs on HTTP only (`app.py:131: app.run(host='0.0.0.0', port=5003, debug=True)`), making the Secure flag ineffective even if configured. The lack of SameSite protection combined with absent CSRF tokens enables cross-site request forgery attacks against all state-changing operations.

**Authorization Model and Bypass Scenarios:**

The authorization model is role-based access control (RBAC) with two roles: `employee` and `admin`. Authorization checks occur at two dashboard endpoints:

**Employee Dashboard (`app.py:103-110`):**
```python
@app.route('/emp/dashboard')
def emp_dashboard():
    if 'role' not in session:
        return redirect('/')
    if session['role'] == 'employee':
        return render_template('emp_dashboard.html')
    return redirect('/')
```

**Admin Dashboard (`app.py:112-118`):**
```python
@app.route('/admin/dashboard')
def admin_dashboard():
    if 'role' not in session:
        return redirect('/')  
    if session['role'] == 'admin':
        flag = os.getenv('FLAG', 'flag{this_is_a_fake_flag}')
        return render_template('admin_dashboard.html', flag=flag)
    return redirect('/')
```

**Authorization Bypass Scenarios:**

1. **Role Injection Bypass:** Authenticate as employee with valid credentials (`emp/emppassword` or `emp1/password1`), include `role=admin` in POST body, receive session with `session['role'] = 'admin'`, access `/admin/dashboard` to retrieve flag.

2. **Session Forgery Bypass:** Use exposed secret key `'BIYQYU@*DG(*!@)BO#F_P'` with itsdangerous library to forge session cookie containing `{'role': 'admin'}`, set forged cookie in browser, access `/admin/dashboard` directly without authentication.

3. **2FA Bypass Chain:** After role injection, redirect leads to `/admin/2fa` which accepts hardcoded code `1234` (or JavaScript auto-submits it), granting access to admin dashboard.

4. **Debug Console Bypass:** Trigger application error to access Werkzeug debugger, execute `os.getenv('FLAG')` in Python console, retrieve flag without any authentication.

**Multi-Tenancy Security Implementation:**

Not applicable. This is a single-tenant application with no tenant isolation mechanisms. The role separation between employee and admin represents privilege levels within a single organizational context, not multi-tenant data isolation.

**SSO/OAuth/OIDC Flows:**

Not implemented. The application uses traditional form-based authentication with no external identity provider integration, OAuth flows, or OpenID Connect mechanisms. No callback endpoints, state parameter validation, or nonce verification exist.

---

## 4. Data Security & Storage

**Database Security:** The application uses SQLite 3.x with a 12KB database file located at `app/users.db`. The database is completely unencrypted at rest—no SQLCipher extension, no application-level encryption, and no column-level encryption for sensitive fields. File permissions are set to 644 (world-readable), enabling any process on the host system to read the database directly. The database schema stores passwords in plaintext TEXT columns without any hashing, salting, or key derivation. Database access occurs through direct SQLite3 Python module connections without connection pooling, access logging, or audit trails. All queries use parameterized statements (preventing SQL injection), but this represents the only database security control present. No backup encryption, replication security, or database hardening configurations exist.

The database initialization function (`app.py:12-26`) demonstrates the plaintext password storage vulnerability by inserting credentials directly as readable strings: `cursor.execute('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)', ('emp', 'emppassword', 'employee'))`. Analysis of the database file via SQLite inspection reveals three user accounts with fully exposed passwords: `emp/password1`, `emp1/password1`, and `admin/adminpassword`. These values differ from the source code defaults, indicating manual database modification without any encryption or security controls during the update process.

**Data Flow Security:** Sensitive data flows through the application without encryption at any stage. User credentials enter the system via HTML forms (`login.html:29-33`), traverse the network over unencrypted HTTP as POST request bodies (`login.html:61-76`), arrive at the Flask route handler as plaintext form data (`app.py:71-73`), undergo minimal regex validation (`app.py:75`), and participate in plaintext SQL comparisons (`app.py:83`). No hashing, encoding, or cryptographic transformation occurs at any point in this flow. 

Session tokens follow an equally vulnerable path. After authentication, session data (role) is serialized to JSON, base64-encoded, and signed with HMAC-SHA256 using the exposed secret key. The resulting session cookie is transmitted to the client over HTTP without encryption, stored in browser cookie storage accessible to JavaScript (no HttpOnly flag enforcement verification), and retransmitted with every subsequent request over unencrypted channels. An attacker performing network interception can read session contents by base64-decoding the cookie payload and forge new sessions using the known secret key.

The CTF flag demonstrates the most concerning data flow vulnerability. The flag originates in the `.env` file as plaintext (`FLAG="flag{51ffd771-8825-4455-911a-3110d0d9c63b}"`), gets committed to Git repository history (permanent exposure), passes through Docker build arguments (`Dockerfile:20-21`), persists in container environment variables (accessible via `docker inspect`), retrieves via `os.getenv()` in application code (`app.py:117`), injects into Jinja2 template context, and renders into HTML as a visible attribute (`admin_dashboard.html:21: <a href="/" flag="{{flag}}">me</a>`). This flow exposes the flag at seven distinct points: filesystem, version control, Docker image layers, runtime environment, application memory, template context, and HTML output.

**Multi-Tenant Data Isolation:** Not applicable. The application implements role-based access control within a single organizational context, not multi-tenant data segregation. The employee/admin distinction represents privilege levels rather than tenant boundaries. No tenant identifiers, row-level security policies, or data isolation mechanisms exist. All users access the same database with the same connection credentials, and authorization occurs purely at the application layer through session role checks.

---

## 5. Attack Surface Analysis

**External Entry Points:**

The application exposes eight network-accessible HTTP endpoints on port 5003, bound to all interfaces (`0.0.0.0`). Each endpoint analysis includes security implications and exploitability assessment:

**1. Root Redirect (`GET /` - app.py:46-55):** Session-based routing logic redirects users to role-appropriate dashboards or login pages based on session state. No authentication required. Security implications: Information disclosure reveals application structure; session-based routing exposes session enumeration possibilities; no rate limiting enables automated session state testing.

**2. Employee Login Page (`GET /employee/login` - app.py:58-60):** Renders login form template with `role='employee'` parameter. Publicly accessible. The template contains a reflected XSS vulnerability in JavaScript context where `var role = "{{ role }}";` (login.html:48) renders server-controlled data directly into JavaScript without proper escaping. While currently hardcoded to safe values, this dangerous pattern could enable XSS if the role parameter ever derives from user input (query parameters, headers, etc.).

**3. Admin Login Page (`GET /admin/login` - app.py:62-64):** Identical to employee login but renders `role='admin'`. Same XSS vulnerability pattern exists. The template also includes dormant flash message rendering (`login.html:21`) that would create an XSS sink if developers add `flash()` calls with user input in the future.

**4. Authentication Handler (`POST /login` - app.py:67-100):** **CRITICAL VULNERABILITY HUB.** Accepts three form parameters: username, password, and role. The role parameter is client-controlled and directly assigned to session state without validation. This endpoint is the primary attack vector for privilege escalation. Input validation applies only basic regex filtering (`is_safe_input()`) blocking `;'"` characters but allowing all logical attacks. Database query uses parameterized statements (SQL injection safe) but compares plaintext passwords. Response returns JSON with redirect URLs, including an open redirect vulnerability if the role-based redirect logic is manipulated. No rate limiting enables brute force attacks. No CSRF protection allows cross-site authentication attempts. No account lockout after failed attempts enables unlimited password guessing.

**5. 2FA Verification Page (`GET /admin/2fa` - app.py:33-44):** Renders 2FA form with no authentication check—any unauthenticated user can access this endpoint. The template contains hardcoded bypass logic in JavaScript (`2fa.html:45: code: 1234`) that automatically submits the known verification code without user interaction.

**6. 2FA Validation Handler (`POST /admin/2fa` - app.py:36-42):** Accepts code parameter and compares against hardcoded string `'1234'`. No authentication required. No rate limiting. No attempt tracking. Provides zero security value as the verification code is publicly known.

**7. Employee Dashboard (`GET /emp/dashboard` - app.py:103-110):** Requires session with `role='employee'`. Authorization check occurs at application layer only (`if session['role'] == 'employee'`). Vulnerable to session forgery via exposed secret key. No additional security controls.

**8. Admin Dashboard (`GET /admin/dashboard` - app.py:112-118):** **HIGH-VALUE TARGET.** Requires session with `role='admin'`. Retrieves CTF flag from environment variable and renders it in HTML template as a visible attribute. Multiple bypass paths exist: role injection, session forgery, debug console exploitation. The flag exposure occurs at `admin_dashboard.html:21` where `<a href="/" flag="{{flag}}">me</a>` embeds the secret directly in DOM attributes, making it trivially extractable via browser DevTools or page source inspection.

**9. Logout Handler (`GET /logout` - app.py:120-124):** Contains open redirect vulnerability. The redirect path is constructed via string concatenation: `redirect('/'.join(['', role, 'login']))` where role derives from session data. If an attacker forges a session with `role='//evil.com/'`, the redirect becomes `redirect('//evil.com//login')`, enabling open redirect to arbitrary domains.

**Internal Service Communication:**

Not applicable. This is a monolithic application with no microservices architecture, no service-to-service communication, and no internal API boundaries. All functionality executes within a single Flask process.

**Input Validation Patterns:**

Input validation is minimal and implemented through a single custom function `is_safe_input()` at `app.py:28-31`:

```python
def is_safe_input(input_string):
    if re.search(r"[;'\"]", input_string):
        return False
    return True
```

This function blocks only three characters (semicolon, single quote, double quote) and is applied exclusively to the login endpoint username, password, and role parameters (`app.py:75`). The validation does not address:
- XSS payloads without quotes (event handlers, JavaScript URIs)
- Template injection attacks
- Path traversal sequences
- Role manipulation (allows any alphanumeric role value)
- Command injection sequences
- LDAP injection
- XML/XXE injection
- Header injection

Other endpoints receive zero input validation. No validation framework (WTForms, Marshmallow) exists. No output encoding beyond Jinja2's default autoescaping. No Content Security Policy to restrict inline scripts or unsafe-eval.

**Background Processing:**

No asynchronous job processing, message queues, or background workers exist. All request handling occurs synchronously within the Flask application thread. No Celery, RQ, or similar task queue implementations. No scheduled jobs or cron tasks within the application scope (database initialization occurs synchronously on startup via `app.py:129`).

---

## 6. Infrastructure & Operational Security

**Secrets Management:** The application demonstrates catastrophic secrets management failures across all categories of sensitive data. Every secret is either hardcoded in source code or stored in plaintext configuration files committed to version control. The Flask session secret key `'BIYQYU@*DG(*!@)BO#F_P'` appears at `app.py:8`, permanently embedding it in Git history and making it accessible to anyone with repository access. Default administrative credentials are hardcoded at `app.py:23-24` with plaintext passwords visible in source. The 2FA bypass code `'1234'` is hardcoded at both `app.py:38` and `2fa.html:45`, appearing in both backend and frontend code. The CTF flag exists in three locations: committed `.env` file, Docker build arguments (visible in image history), and container environment variables (accessible via `docker inspect`).

No secrets management system exists—no HashiCorp Vault, no AWS Secrets Manager, no Azure Key Vault, no Kubernetes Secrets. No secret rotation mechanisms, no secret versioning, no audit logs for secret access. The `.gitignore` file is completely absent from the repository, allowing accidental commits of sensitive files without protection. No CI/CD secret scanning, no pre-commit hooks to prevent secret leakage. The secrets are permanently exposed in Git history (commit 887c07ac) and cannot be remediated without rewriting repository history and rotating all exposed values.

**Configuration Security:** All application configuration is embedded directly in `app.py` with no separation between environments. No `config.py`, no YAML/JSON configuration files, no environment-specific settings. The production deployment uses development-mode configuration: debug mode enabled (`app.py:131: debug=True`), hardcoded secret keys, missing security headers, and exposed error messages. The Dockerfile builds from an end-of-life base image (Debian Buster archived repositories) and installs deprecated software (PhantomJS, abandoned since 2018). Docker Compose configuration exposes port 5003 directly to all interfaces without reverse proxy, TLS termination, or network segmentation.

**Security Headers - Infrastructure Configuration:** No infrastructure-level security header configuration exists. The application runs directly on Werkzeug development server without a reverse proxy (nginx, Apache, Caddy) that could inject security headers. No CDN or WAF in front of the application. Searching for infrastructure configuration files reveals:
- No `nginx.conf` or Apache configuration
- No Kubernetes Ingress definitions with annotation-based header injection
- No CloudFront or CloudFlare configurations
- No `docker-compose.yml` header configurations (only basic port exposure at line 7)

The Docker healthcheck (`docker-compose.yml:8-11`) uses unencrypted HTTP (`curl -f http://localhost:5003`) without any security headers validation. Application-level header injection would require Flask middleware (Flask-Talisman, Flask-Security-Headers) which are absent from `requirements.txt`. As a result, responses include only default Flask headers with none of the following security controls:
- **Strict-Transport-Security (HSTS):** Absent (no HTTPS anyway)
- **Content-Security-Policy (CSP):** Absent (enables inline scripts, eval, unsafe resources)
- **X-Frame-Options:** Absent (vulnerable to clickjacking)
- **X-Content-Type-Options:** Absent (enables MIME-sniffing attacks)
- **Referrer-Policy:** Absent (leaks sensitive URLs in referrer headers)
- **Permissions-Policy:** Absent (no feature restrictions)
- **Cache-Control:** Not configured for sensitive responses (credentials may be cached)

**External Dependencies:** The application depends on seven Python packages from PyPI, all pinned to specific versions in `requirements.txt`. Flask 3.0.3 and Werkzeug 3.0.3 are recent versions (May 2024) with no known critical CVEs at time of assessment. However, the Dockerfile introduces critical system-level dependencies: Python 3.8 (approaching end-of-life October 2024), Debian Buster (archived, no longer receiving security updates), and PhantomJS (abandoned project with known vulnerabilities, installed but never used in code). The application also loads frontend dependencies from CDN without Subresource Integrity (SRI) hashes: jQuery 3.5.1, Bootstrap 4.5.2, and Popper.js 1.16.0. An attacker compromising these CDN resources or performing MITM attacks could inject malicious JavaScript without detection.

**Monitoring & Logging:** No security event logging, monitoring, or alerting exists. No structured logging framework (Python logging module unused). Debug mode may log requests to stdout but provides no security event tracking, authentication failure monitoring, or suspicious activity detection. No integration with SIEM systems, no log aggregation, no metrics collection. No audit trail for sensitive operations like authentication, authorization failures, or flag access. No rate limiting or anomaly detection. The application runs completely blind to attack attempts, successful breaches, or security incidents.

---

## 7. Overall Codebase Indexing

The codebase follows a minimalist structure with 376 total lines of code (131 Python, 245 HTML/JavaScript) organized in a traditional Flask application layout. The root directory contains build orchestration and deployment files (`Makefile`, `docker-compose.yml`, `.env`, `benchmark.json`) while the `app/` subdirectory houses all application logic. The single-file application architecture (`app/app.py`) implements all routes, authentication, authorization, database operations, and business logic without separation of concerns or modular organization. This monolithic structure means any code execution vulnerability provides immediate access to all application functionality including database credentials, session secrets, and flag retrieval logic.

The template directory (`app/templates/`) contains five Jinja2 HTML files serving different authentication states and role-specific dashboards. Template organization reveals security concerns: `login.html` serves dual purposes for both employee and admin login by accepting a `role` parameter to vary rendering, creating a reflected XSS sink in JavaScript context. The `2fa.html` template contains hardcoded bypass logic in client-side JavaScript, demonstrating the security anti-pattern of implementing authentication logic in untrusted frontend code. Template autoescaping provides baseline XSS protection but several dangerous patterns exist where server variables inject directly into JavaScript contexts.

Database initialization occurs synchronously on application startup (`app.py:129: init_db()`) using a schema-creation function that embeds default credentials in source code. This approach means credentials cannot be changed without modifying application source, and all deployments share the same default passwords unless manually updated in the database file. The SQLite database file (`users.db`, 12KB) persists in the application directory alongside source code, lacks `.gitignore` exclusion, and has been committed to version control.

Build orchestration uses a referential Makefile (`include ../common.mk`) that points to an external file not present in the repository, indicating this is one component of a larger CTF challenge suite. The Dockerfile follows a multi-stage pattern unusual for production (archived Debian repositories, deprecated PhantomJS installation, EOL Python version) but consistent with CTF environment construction. Docker Compose provides minimal orchestration with health checking but no security configurations, resource limits, or network policies.

Dependency management through `requirements.txt` reveals intentional minimalism—only seven packages all directly related to Flask web serving. The complete absence of security libraries (no bcrypt, no Flask-WTF, no Flask-Limiter, no Flask-Login) indicates security was deliberately omitted rather than poorly implemented. No testing framework, no ORM, no migration tools, no deployment utilities. The codebase contains zero test files, documentation files, or security configuration files.

Code organization impact on security discoverability: The single-file structure makes vulnerability identification trivial—all security-critical code exists in one 131-line file. The hardcoded secrets, authentication bypasses, and authorization flaws are immediately visible to anyone reading `app.py`. No obfuscation, no code splitting, no separation between security-critical and business logic. Template organization follows straightforward naming (login, 2fa, dashboard) making endpoint enumeration and attack surface mapping effortless. The lack of `.gitignore` means all sensitive files including database, environment variables, and compiled bytecode are tracked in version control and accessible in repository history.

---

## 8. Critical File Paths

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/requirements.txt` - Python dependencies (Flask 3.0.3, no security libraries)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/docker-compose.yml` - Container orchestration, port 5003 exposure
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/Dockerfile` - Container build configuration, EOL base image, PhantomJS installation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/.env` - Environment variables with exposed CTF flag
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/benchmark.json` - CTF challenge metadata

### Authentication & Authorization
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 67-100) - Login handler with role injection vulnerability
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 33-44) - Broken 2FA implementation with hardcoded code
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (line 8) - Hardcoded Flask secret key
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (line 89) - Session role assignment from client input
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 103-110) - Employee dashboard authorization check
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 112-118) - Admin dashboard with flag retrieval
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 120-124) - Logout handler with open redirect
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/2fa.html` (line 45) - Client-side 2FA bypass in JavaScript

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 46-55) - Root redirect logic
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 58-64) - Login page routes
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/login.html` - Login form template
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/admin_dashboard.html` - Admin dashboard template
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/emp_dashboard.html` - Employee dashboard template

### Data Models & DB Interaction
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/users.db` - SQLite database with plaintext passwords
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 12-26) - Database initialization with hardcoded credentials
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (line 10) - Database file path configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 81-85) - Authentication database query

### Dependency Manifests
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/requirements.txt` - Python package dependencies

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/.env` (line 1) - CTF flag in plaintext
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (line 8) - Hardcoded session secret key
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 23-24) - Hardcoded default credentials
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (line 117) - Flag environment variable retrieval
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/admin_dashboard.html` (line 21) - Flag exposure in HTML attribute

### Middleware & Input Validation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (lines 28-31) - Input validation function (is_safe_input)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (line 75) - Input validation application

### Logging & Monitoring
- No logging configuration files present
- No monitoring setup detected

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/docker-compose.yml` (lines 6-7) - Port exposure configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/docker-compose.yml` (lines 8-11) - Health check configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/Dockerfile` (lines 20-21) - Flag environment variable configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py` (line 131) - Debug mode enabled in production

### CTF Flag Storage
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/.env` (line 1) - Flag in environment file (committed to git)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/Dockerfile` (lines 20-21) - Flag as Docker build argument and environment variable
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/admin_dashboard.html` (line 21) - Flag rendered in HTML attribute

---

## 9. XSS Sinks and Render Contexts

**Network Surface Focus Applied:** All XSS sinks identified below exist in network-accessible web application pages served by Flask routes. No local-only scripts, build tools, or developer utilities are included.

### Critical Finding 1: Open Redirect (URL Context) - MEDIUM Risk

**Sink Type:** XSS - URL Context - window.location.href assignment with server-controlled data

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/login.html`  
**Line Number:** 71

**Code Snippet:**
```javascript
success: function(data) {
    if (data.success == true) {
        window.location.href = data.redirect;  // Line 71 - DANGEROUS SINK
    } else {
        alert("Invalid credentials");
    }
}
```

**Render Context:** JavaScript Context - Direct assignment to `window.location.href` property

**User Input Source:** The `data.redirect` value originates from Flask backend at `/login` endpoint (`app.py:91, 94`). The redirect URLs are currently hardcoded to `/admin/2fa` or `/emp/dashboard` based on role parameter. However, the role parameter is client-controlled, creating potential for manipulation if the redirect logic were expanded or if session data could be poisoned.

**Exploitability Assessment:** MEDIUM
- Currently mitigated by hardcoded redirect values in backend
- Dangerous pattern exists: client-side navigation based on server response without validation
- If backend logic changes to allow user-controlled redirects, enables open redirect attacks
- Potential for `javascript:` URI injection if redirect validation is bypassed
- Could facilitate phishing attacks by redirecting to attacker-controlled domains

**Attack Scenario:** If an attacker can manipulate the role parameter or session data to inject a malicious redirect value, the response might contain `{"redirect": "//evil.com/phishing"}`, causing `window.location.href = "//evil.com/phishing"` and redirecting the user to an attacker-controlled site.

### Critical Finding 2: Server-Side Open Redirect - HIGH Risk

**Sink Type:** Open Redirect - Flask redirect() with string concatenation

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/app.py`  
**Line Number:** 124

**Code Snippet:**
```python
@app.route('/logout', methods=['GET'])
def logout():
    role = session.get('role')
    session.pop('role', None)
    return redirect('/'.join(['', role, 'login']))  # Line 124 - DANGEROUS SINK
```

**Render Context:** Server-side redirect with user-controlled session data

**User Input Source:** The `role` variable comes from `session.get('role')`, which is set during login from the client-submitted form parameter (`app.py:89: session['role'] = role`). An attacker who can control session data can inject arbitrary path components.

**Exploitability Assessment:** HIGH
- Direct exploitation via session manipulation
- The `'/'.join(['', role, 'login'])` pattern creates redirect path like `/{role}/login`
- If role = `//evil.com/`, result is `redirect('//evil.com//login')` → redirects to `https://evil.com//login`
- If role = `@evil.com/`, result may redirect depending on browser parsing
- Session role is client-controlled via the role injection vulnerability (`app.py:89`)

**Attack Vector:**
```python
# Attacker submits login with role parameter:
POST /login
username=emp&password=emppassword&role=//attacker.com/

# Session becomes: session['role'] = '//attacker.com/'
# On logout:
redirect('/'.join(['', '//attacker.com/', 'login']))
# Evaluates to: redirect('//attacker.com//login')
# Browser interprets as: https://attacker.com//login
```

### Finding 3: Reflected XSS in JavaScript Context - LOW-MEDIUM Risk

**Sink Type:** XSS - JavaScript Context - Server-side template variable injection into JavaScript

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/login.html`  
**Line Number:** 48

**Code Snippet:**
```javascript
<script>
    $(document).ready(function() {
        var role = "{{ role }}";  // Line 48 - TEMPLATE VARIABLE IN JS CONTEXT
        if (role === "admin") {
            $("h4").text("Admin Login");
        } else {
            $("h4").text("EMP Login");
        }
```

**Render Context:** JavaScript String Context - Jinja2 template variable directly embedded in JavaScript string literal

**User Input Source:** The `role` variable is passed from Flask routes (`app.py:60, 64`):
```python
@app.route('/employee/login', methods=['GET'])
def emp_login():
    return render_template('login.html', role='employee')
    
@app.route('/admin/login', methods=['GET'])
def admin_login():
    return render_template('login.html', role='admin')
```

**Exploitability Assessment:** LOW-MEDIUM
- Currently hardcoded to safe values ('employee' or 'admin')
- Dangerous pattern: server variable injected directly into JavaScript without proper encoding
- If role parameter ever derived from user input (query params, headers, path segments), would enable XSS
- Jinja2 autoescaping protects against HTML context injection but may not prevent JavaScript context attacks
- Potential payload if user-controlled: `role='"; alert(document.cookie); //'` breaks out of string context

**Similar Pattern:** The same role variable appears in a hidden input field at `login.html:26`:
```html
<input type="hidden" name="role" value="{{ role }}">
```
This creates an HTML attribute context injection point, though Jinja2 autoescaping provides protection.

### Finding 4: Dormant Flash Message XSS Sink - LOW Risk

**Sink Type:** XSS - HTML Body Context - Jinja2 template variable rendering in alert div

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/login.html`  
**Line Number:** 21

**Code Snippet:**
```html
{% with messages = get_flashed_messages() %}
    {% if messages %}
    <div class="alert alert-danger" role="alert">
        {{ messages[0] }}  <!-- Line 21 - POTENTIAL XSS SINK -->
    </div>
    {% endif %}
{% endwith %}
```

**Render Context:** HTML Body Context - Flash message content rendered into div element

**User Input Source:** Flash messages set via `flash()` function in Flask. Currently, no `flash()` calls exist in `app.py`, making this sink dormant.

**Exploitability Assessment:** LOW
- Currently unexploited (no flash messages in code)
- Jinja2 autoescaping provides default protection
- If developers add flash messages with user input, could become vulnerable
- Future risk if error messages include user-supplied data

**Example Vulnerable Code (not present, but illustrative):**
```python
# If added to app.py:
flash(f"Login failed for user {username}")  # Would be escaped by Jinja2
flash(Markup(f"<b>Welcome {username}</b>"))  # Bypass autoescaping - vulnerable
```

### Finding 5: Template Variable in HTML Attribute - LOW Risk

**Sink Type:** Template Injection - Jinja2 variable rendering in HTML attribute

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/app/templates/admin_dashboard.html`  
**Line Number:** 21

**Code Snippet:**
```html
<a href="/" flag="{{flag}}">me</a>  <!-- Line 21 - JINJA2 VARIABLE IN ATTRIBUTE -->
```

**Render Context:** HTML Attribute Context - Jinja2 template variable in custom attribute

**User Input Source:** The `flag` variable is passed from backend at `app.py:118`:
```python
flag = os.getenv('FLAG', 'flag{this_is_a_fake_flag}')
return render_template('admin_dashboard.html', flag=flag)
```

**Exploitability Assessment:** LOW
- Flag comes from environment variable, not direct user input
- Jinja2 autoescaping prevents XSS by encoding special characters
- However, if flag environment variable contains malicious content (e.g., `" onload="alert(1)`), it could break out of attribute context
- Current flag value `flag{51ffd771-8825-4455-911a-3110d0d9c63b}` contains no dangerous characters
- This represents information disclosure (flag visible in HTML) rather than XSS

### Sinks NOT Found (Comprehensive Negative Analysis)

**XSS Sinks - HTML Body Context:**
- ✅ No `innerHTML` usage detected
- ✅ No `outerHTML` usage detected
- ✅ No `document.write()` or `document.writeln()` calls
- ✅ No `insertAdjacentHTML()` usage
- ✅ No `createContextualFragment()` usage
- ✅ No jQuery `.html()` manipulation with user data
- ✅ No jQuery `.append()`, `.after()`, `.before()`, `.prepend()`, `.replaceWith()`, `.wrap()` with user-controlled content

**XSS Sinks - HTML Attribute Context:**
- ✅ No inline event handlers (onclick, onerror, onload, etc.) with user data
- ✅ No dynamic href/src/action attributes with user input

**XSS Sinks - JavaScript Context:**
- ✅ No `eval()` usage
- ✅ No `Function()` constructor
- ✅ No `setTimeout()` or `setInterval()` with string arguments

**XSS Sinks - CSS Context:**
- ✅ No dynamic `element.style` property manipulation

**XSS Sinks - Additional URL Context:**
- ✅ No `window.open()` with user data
- ✅ No `history.pushState()` or `replaceState()` with user input
- ✅ No jQuery selector injection patterns (older jQuery versions)

**SQL Injection:**
- ✅ All SQL queries use parameterized statements (`app.py:23-24, 83`)
- ✅ No string concatenation in SQL queries
- ✅ No raw SQL execution with user input

**Command Injection:**
- ✅ No `os.system()` usage
- ✅ No `subprocess` module calls
- ✅ No `exec()` or `eval()` in Python code

**Template Injection:**
- ✅ No `render_template_string()` with user input
- ✅ No server-side template injection vectors
- ✅ All templates use safe `render_template()` with context variables

### Summary of XSS/Injection Findings

**Total Sinks Identified:** 5 (2 high/medium priority, 3 low priority)

**Critical Priorities:**
1. **HIGH:** Server-side open redirect in logout endpoint (`app.py:124`)
2. **MEDIUM:** Client-side open redirect via window.location.href (`login.html:71`)

**Monitoring Required:**
3. **LOW-MEDIUM:** JavaScript context template injection pattern (`login.html:48`)
4. **LOW:** Dormant flash message rendering (`login.html:21`)
5. **LOW:** Flag in HTML attribute (`admin_dashboard.html:21`)

**SQL Injection Status:** PROTECTED (parameterized queries throughout)  
**Command Injection Status:** NOT APPLICABLE (no system command execution)  
**Template Injection Status:** PROTECTED (no unsafe template rendering)

---

## 10. SSRF Sinks

**Network Surface Focus Applied:** Analysis limited to web application components accessible via HTTP endpoints. No local-only utilities, build scripts, or CLI tools included.

### SSRF Analysis Result: NO VULNERABILITIES FOUND

After comprehensive analysis of all network-accessible application code, **zero SSRF (Server-Side Request Forgery) vulnerabilities exist** in this Flask web application. The application architecture is fundamentally incompatible with SSRF attacks due to complete absence of outbound HTTP request capabilities.

### Analysis Methodology

**Comprehensive search conducted across 11 SSRF attack vector categories:**

1. **HTTP(S) Clients:** Searched for `requests`, `urllib`, `urllib2`, `urllib3`, `http.client`, `httplib`, `httplib2`, `aiohttp`, `httpx`, `pycurl` modules. Result: NONE FOUND.

2. **Raw Sockets & Network APIs:** Checked for `socket`, `asyncio`, `trio` socket operations. Result: NONE FOUND.

3. **URL Openers & File Includes:** Looked for `urllib.request.urlopen()`, `open()` with URLs, remote file operations. Result: NONE FOUND.

4. **Redirect Handlers:** Analyzed all Flask `redirect()` calls. Found 5 instances—all redirect to internal routes, none follow external URLs or fetch remote content.

5. **Headless Browsers:** PhantomJS installed in Dockerfile but **never invoked in application code**. No Puppeteer, Playwright, Selenium. Result: DEAD DEPENDENCY.

6. **Media Processors:** No ImageMagick, FFmpeg, wkhtmltopdf, Ghostscript usage. Result: NONE FOUND.

7. **Link Preview & Unfurlers:** No URL metadata fetching, oEmbed endpoints, or link preview functionality. Result: NONE FOUND.

8. **SSO/OIDC/OAuth Discovery:** No external identity provider integration, no JWKS fetchers, no OAuth metadata retrieval. Result: NONE FOUND.

9. **Importers & Data Loaders:** No "import from URL" features, no remote CSV/JSON fetching. Result: NONE FOUND.

10. **Subprocess Execution:** No `subprocess`, `os.system()`, or command execution that could invoke `curl`, `wget`, or HTTP clients. Result: NONE FOUND.

11. **XML Processing:** No XML parsing libraries that could enable XXE-based SSRF. Result: NONE FOUND.

### Code Evidence

**Complete Import Analysis (`app.py:1-6`):**
```python
from flask import Flask, request, redirect, session, url_for, render_template, flash
import sqlite3
import re
import os
```

**Only Modules:** Flask framework, SQLite3 (local file database), regex, OS environment. No network request capabilities.

**All External Operations:**
1. Database: `sqlite3.connect('users.db')` - Local file only
2. Environment: `os.getenv('FLAG')` - Local environment variable
3. Redirects: All use `redirect()` with internal paths (no URL fetching)
4. Templates: `render_template()` - Local file rendering only

**PhantomJS Investigation:**
- **Installation:** `Dockerfile:11` installs PhantomJS package
- **Usage in Code:** ZERO references to PhantomJS in `app.py` or templates
- **Assessment:** Dead dependency, security risk (deprecated software) but not exploitable for SSRF as it's never invoked

### Why SSRF is Architecturally Impossible

This application implements a closed-loop authentication system with no external integrations:
- No API calls to external services
- No webhook functionality
- No URL parameter processing for remote resources
- No image/avatar fetching from URLs
- No RSS feed parsing
- No remote configuration loading
- No OAuth callback verification requiring external requests

All functionality is self-contained: HTML form rendering, session management, SQLite database queries, and template rendering—none of which generate outbound HTTP requests.

### Client-Side Request Analysis

**AJAX Requests Found:** jQuery AJAX in `login.html:61-76` and `2fa.html:35-56`

**All AJAX targets are same-origin:**
- `POST /login` - Internal endpoint
- `POST /admin/2fa` - Internal endpoint

No client-side requests to external domains, no JSONP endpoints, no CORS-enabled external APIs.

### Conclusion

**SSRF Risk: NONE**

The application's minimalist architecture and complete absence of HTTP client libraries make SSRF attacks impossible without first achieving remote code execution through other vulnerabilities (debug mode, template injection, etc.). If an attacker gains RCE via the Werkzeug debugger or other means, they could then import request libraries and perform SSRF, but this represents a post-exploitation scenario rather than a direct SSRF vulnerability.

**Recommendation:** While no SSRF vulnerabilities exist, the presence of PhantomJS (a deprecated headless browser with known RCE vulnerabilities) in the container represents an attack surface if the application is later modified to invoke it. Remove PhantomJS from Dockerfile to eliminate this unnecessary risk.

---

**End of Code Analysis Report**