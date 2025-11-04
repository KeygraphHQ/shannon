# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings in this report meet the "In-Scope" criteria verified through source code analysis.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints accessible via mitmproxy (port 8002)
- Endpoints requiring authentication via the application's standard login mechanisms
- Internal API endpoints accessible through Host header manipulation
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- Command-line interface execution (e.g., `python run.py` for local development)
- Development environment's internal tooling (WSGI configuration files)
- CI/CD pipeline scripts or build tools (Makefile, Docker build commands)
- Database migration scripts, backup tools, or maintenance utilities
- Static files or scripts that require manual opening in a browser (not served by the application)

---

## 1. Executive Summary

**Application Type:** XBEN-066-24 is a deliberately vulnerable CTF-style web application simulating a router administration panel. The application employs a sophisticated multi-proxy architecture with intentional security weaknesses designed to test penetration testing capabilities.

**Overall Security Posture:** CRITICAL. The application exhibits severe security vulnerabilities across multiple domains including authentication, authorization, data security, and network architecture. The most critical finding is the exposure of a flag file (`/flag`) through an unauthenticated internal API endpoint accessible via Host header manipulation through the HAProxy reverse proxy chain.

**Key Architectural Decisions:** The application uses a multi-tier proxy architecture (mitmproxy → HAProxy → Apache) with two separate Flask applications served via virtual host routing. HAProxy 2.0.5 (an intentionally vulnerable version) routes traffic based on Host headers, creating the primary attack vector. The database uses READ UNCOMMITTED isolation level, enabling race condition attacks. Passwords are stored in plaintext in the database, representing a catastrophic data security failure.

**Most Critical Attack Surfaces:**
1. **Host Header Manipulation to Internal API** - The `/devices/flag/status` endpoint on the internal.router virtual host exposes the flag file without authentication. HAProxy routes requests with `Host: internal.router` to the internal backend, creating a trivial flag capture path for external attackers.
2. **Broken Admin Authorization** - The admin panel authorization check at `/admin_panel` always fails regardless of user privileges, preventing legitimate admin access through the intended path and suggesting alternative exploitation routes.
3. **Plaintext Password Storage** - All user passwords are stored in plaintext in the MySQL database, combined with hardcoded root credentials (`root:admin_router`) and a weak application secret key (`your_secret_key`), enabling multiple privilege escalation paths.
4. **SSRF via WiFi Settings** - The `/wifi_settings` endpoint executes subprocess curl commands to internal services, with verbose output returned to authenticated users, creating an information disclosure channel for blind SSRF exploitation.

---

## 2. Architecture & Technology Stack

**Framework & Language:** The application is built entirely in **Python 3** using the **Flask micro-framework** (version not explicitly pinned in requirements.txt). Flask serves as the web application framework for both the public-facing admin router and the internal device API. The web server infrastructure consists of **Apache 2** with **mod_wsgi-py3** for WSGI application deployment, providing virtual host routing capabilities. The template engine is **Jinja2** (Flask's default), which provides automatic HTML escaping for XSS protection. The frontend stack utilizes **Bootstrap 4** for CSS styling, **jQuery 3.5.1** for JavaScript functionality, and custom dark-themed CSS for the router administration aesthetic.

**Critical Security Dependencies:**
- **flask_sqlalchemy** - ORM for database operations, provides SQL injection protection through parameterized queries
- **pymysql** - Pure Python MySQL connector (no C dependencies), handles database communication
- **flask_session** - Server-side session management with SqlAlchemySessionInterface, stores sessions in MySQL `mysessions` table
- **hashlib** (stdlib) - Used for PBKDF2-HMAC-SHA256 password hashing during authentication (100,000 iterations), though critically misused as it hashes plaintext passwords only for session validation rather than storage

**Architectural Pattern:** The application implements a **hybrid microservices architecture with service mesh characteristics**. The deployment model uses Docker Compose to orchestrate four distinct services: a MySQL 5.7.15 database (`db`), the main application container (`admin_router`), a HAProxy 2.0.5 load balancer/reverse proxy (`haproxy`), and a mitmproxy 6.0.2 reverse proxy (`mitmproxy`). The network flow follows a strict path: External Access → mitmproxy (port 8002, externally exposed) → HAProxy (port 8001, internal) → Apache (port 80, internal with two virtual hosts).

**Virtual Host Trust Boundary:** The Apache web server configuration defines two critical virtual hosts that create a significant trust boundary. The **default virtual host** serves the public-facing admin router application (`/var/www/admin_router/`) accessible without specific hostname requirements. The **named virtual host** (`internal.router`) serves the internal device API (`/var/www/internal_router/`) which is intended to be isolated but is actually accessible through Host header manipulation. This architectural decision creates the primary attack surface, as HAProxy routes requests with `Host: internal.router` to the internal backend without authentication checks.

**Infrastructure Security Implications:** The intentional use of HAProxy 2.0.5 (with Dockerfile comments explicitly preserving the vulnerable version) and the disabling of HTTP/2 support (`no option http-use-htx`) suggests known vulnerabilities related to HTTP request smuggling (CL.TE or TE.CL desynchronization attacks). The multi-proxy chain creates opportunities for request smuggling between mitmproxy and HAProxy, or between HAProxy and Apache. The wide-open CORS policy (`Access-Control-Allow-Origin: *` set in Apache configuration) removes cross-origin protections entirely.

**Critical Security Components:**
1. **Session Management** - Server-side sessions stored in MySQL table `mysessions` using flask_session, with session interface configured at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/__init__.py:28`
2. **Authentication** - Custom PBKDF2-HMAC-SHA256 implementation (routes.py:34, 70) with hardcoded secret key `your_secret_key` serving as both Flask session signing key and password hashing salt
3. **Database Isolation** - READ UNCOMMITTED transaction isolation level (__init__.py:19) enabling dirty reads, phantom reads, and non-repeatable reads
4. **Subprocess Execution** - curl subprocess at routes.py:132-134 for internal API communication, currently hardcoded but fragile pattern
5. **Reverse Proxy Chain** - Custom headers added by HAProxy including `X-Forwarded-Host: internal.router`, `X-Upstream-Proxy: mitmproxy (6.0.2)`, and `Via: haproxy (2.0.5)`

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

The application implements a **custom session-based authentication system** with server-side session storage in MySQL. The authentication flow begins at the `/login` endpoint (routes.py:53-78), which accepts GET requests to render the login form (lines 61-64) and POST requests to process credentials (lines 65-78). User credentials are extracted from form data (`username = request.form['username']` at line 66, `password = request.form['password']` at line 67), then immediately stored in the session: username in plaintext (line 69: `session['username'] = username`) and password as a PBKDF2-HMAC-SHA256 hash (line 70: `session['password_hash'] = hashlib.pbkdf2_hmac('sha256', password.encode(), app.secret_key.encode(), 100000).hex()`). The verification is then delegated to the `verify_session()` function (line 73).

**Catastrophic Password Storage Flaw:** The most critical authentication vulnerability lies in the password storage mechanism. Passwords are stored as **plaintext** in the database (models.py:9 defines `password = db.Column(db.String(100), nullable=False)` with no hashing layer). The user creation code in __init__.py demonstrates this clearly: the test user is created with `password='test'` (line 38) and the admin user with a 100-character random string (line 50), both stored directly without hashing. The PBKDF2 hashing only occurs at **authentication time**, not storage time, where the plaintext password is retrieved from the database (routes.py:32: `user = User.query.filter_by(username=session.get('username')).first()`) and then hashed (line 34: `user_password_hashed = hashlib.pbkdf2_hmac('sha256', user.password.encode(), app.secret_key.encode(), 100000).hex()`) to compare against the session's password hash. This backwards implementation means a database breach immediately exposes all user credentials.

**API Endpoints for Authentication:**
- **`/login` (GET, POST)** - Primary authentication endpoint at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py:53-78`, accepts username/password form data, stores credentials in session, redirects to `/dashboard` on success
- **`/logout` (GET)** - Logout endpoint at routes.py:81-85, critically flawed as it only removes `user_id` from session (line 84: `session.pop('user_id', None)`) while leaving `username`, `password_hash`, and `session_id` intact, creating session fixation vulnerabilities
- **`/` (GET)** - Root endpoint at routes.py:48-50, simple redirect to `/login`

**Default Credentials Exposure:** The application includes a test account with credentials `test:test` (created at __init__.py:36-45), which is documented in an HTML comment in the login template (login.html:1: `<!-- TODO: Delete the testing account (test:test). -->`). This comment is served to all users visiting the login page, immediately exposing valid credentials. The admin account uses a 100-character random string generated with Python's `random` module (not cryptographically secure `secrets` module), but since passwords are plaintext in the database, this offers no protection against database access.

### Session Management

**Session Cookie Configuration:** The application **fails to configure critical cookie security flags**. Flask's default behavior applies: `SESSION_COOKIE_HTTPONLY = True` (protecting against JavaScript access, this is good), `SESSION_COOKIE_SECURE = False` (allowing cookie transmission over HTTP, critically insecure), and `SESSION_COOKIE_SAMESITE = None` (providing no CSRF protection). The exact file and line where session cookie flags should be configured is `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/__init__.py:14` (where only `app.secret_key` is set), but the necessary Flask configuration variables (`SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAMESITE`) are completely absent from the codebase.

**Hardcoded Secret Key Vulnerability:** The Flask secret key is hardcoded to the placeholder value `'your_secret_key'` at __init__.py:14. This secret key serves dual critical purposes: signing Flask session cookies (enabling session tampering if the key is known) and serving as the **global salt** for all PBKDF2 password hashing operations (routes.py:34, 70). Using a hardcoded, guessable secret key enables session forgery attacks where an attacker can craft valid session cookies for any username. The use of `app.secret_key` as the PBKDF2 salt (instead of unique per-user salts) means all users' passwords are hashed with the same salt, defeating the security purpose of salting and enabling rainbow table attacks against the entire password database simultaneously.

**Session Storage and Verification:** Sessions are stored server-side in the MySQL database table `mysessions` using the SqlAlchemySessionInterface (configured at __init__.py:28: `app.session_interface = SqlAlchemySessionInterface(app=app, client=db, table='mysessions')`). Session data includes `username` (set at routes.py:69), `password_hash` (routes.py:70), `user_id` (routes.py:37 in verify_session), and `session_id` (routes.py:38). The custom `verify_session()` function (routes.py:31-46) implements the validation logic: it queries the database for the username from the session (line 32), retrieves the **plaintext password** from the database, hashes it with PBKDF2 using the global secret key (line 34), compares the hash to the session's stored password_hash (line 35), and sets `user_id` and `session_id` on success (lines 37-38) or raises a `SessionError` exception on failure (lines 41-44).

**Session Lifecycle Vulnerabilities:** Session creation occurs during the login POST handler (routes.py:69-70), validation happens via `verify_session()` calls in protected endpoints, but session destruction is **incomplete**. The logout endpoint (routes.py:84) only executes `session.pop('user_id', None)`, removing only the user_id while leaving username, password_hash, and session_id in the session object. This creates a session fixation vulnerability where an attacker could preserve a session across logout operations or manipulate the incomplete session state.

**No Session Timeout or Rotation:** The application does not configure `PERMANENT_SESSION_LIFETIME`, relying on Flask's default session timeout. There is no session rotation mechanism - the same session ID persists throughout the entire user lifecycle without regeneration after login or privilege changes. The database isolation level of READ UNCOMMITTED (__init__.py:19: `{'isolation_level':'READ UNCOMMITTED'}`) exacerbates session security by allowing concurrent transactions to read uncommitted session data, enabling timing-based session hijacking attacks.

### Authorization Model

The application implements a **Role-Based Access Control (RBAC) model** using a single boolean flag `is_admin` in the User model (models.py:13: `is_admin = db.Column(db.Boolean, default=False, nullable=False)`). Users are categorized into two roles: regular users (is_admin=False, such as the test user created at __init__.py:44) and administrators (is_admin=True, such as the admin user created at line 56). However, the authorization implementation is **critically broken**.

**Broken Admin Panel Authorization:** The `/admin_panel` endpoint (routes.py:88-101) demonstrates complete authorization failure. After verifying the session (lines 96-99), the endpoint unconditionally returns an error message "Only administrator users can open this section." (line 101) without ever checking the `is_admin` flag. The code structure shows that line 101 is not part of a conditional block - there is no `if not user.is_admin:` check preceding it. This means **legitimate admin users cannot access the admin panel through the intended path**, and the is_admin flag serves no authorization purpose. The admin panel template (admin_panel.html:82-84) contains code to display the flag, suggesting this is the intended flag capture route, but it's completely inaccessible due to the authorization bug.

**Inconsistent Authorization Enforcement:** Protected endpoints implement authorization inconsistently. The `/dashboard` endpoint (routes.py:104-121) calls `verify_session()` (lines 112-117) to validate authentication but performs no role-based authorization - any authenticated user can access it. The `/wifi_settings` endpoint (routes.py:124-141) similarly only verifies session existence (lines 126-129) without checking user privileges. Only the `/admin_panel` endpoint attempts role-based authorization, but as noted, it's broken. This suggests the intended authorization model was never fully implemented.

**No Authorization Middleware:** The application lacks reusable authorization decorators or middleware. Each protected endpoint manually calls `verify_session()`, and there is no equivalent `@admin_required` decorator pattern. This creates maintenance issues and increases the likelihood of missing authorization checks (as evidenced by the wifi_settings endpoint having full access to SSRF-capable functionality without privilege restrictions).

### SSO/OAuth/OIDC Flows

**Not Applicable:** The application does not implement SSO, OAuth, OIDC, or any third-party authentication mechanisms. All authentication is handled through the custom username/password system described above.

### Authorization Bypass Scenarios

**Primary Bypass: Host Header Manipulation to Internal API** - The internal router application (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/internal/app/routes.py`) exposes **eight unauthenticated endpoints** including the critical `/devices/flag/status` endpoint (lines 128-150). This endpoint reads the flag file (line 130: `with open('/flag') as flag_file: flag_content = flag_file.read()`) and returns it in the response (line 147). The internal API has **no authentication mechanism** whatsoever - no session checks, no token validation, no IP restrictions. HAProxy routing (haproxy.cfg:16-17) directs requests with `Host: internal.router` to the internal backend, and HAProxy itself performs no authentication. An external attacker can simply send a request to `http://<target>:8002/devices/flag/status` with header `Host: internal.router` to capture the flag.

**Secondary Bypass: Session Manipulation** - The known secret key (`your_secret_key`) enables session forgery. An attacker can craft a Flask session cookie containing arbitrary `username`, `password_hash`, `user_id`, and `session_id` values, sign it with the known key, and gain authenticated access. Since the admin account password is unknown (100 random characters), direct login isn't feasible, but session forgery could bypass this if the attacker can predict or enumerate valid user_id values.

**Tertiary Bypass: Race Condition Exploitation** - The READ UNCOMMITTED isolation level enables dirty read attacks. An attacker could create concurrent transactions that manipulate session data or user privileges while another transaction is reading them, potentially escalating privileges or hijacking sessions during the verification window between session lookup (routes.py:32) and validation (line 35).

---

## 4. Data Security & Storage

### Database Security

**Database Connection Configuration:** The application connects to MySQL using SQLAlchemy with the connection URI `mysql+pymysql://root:admin_router@db/database` (configured at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/__init__.py:17`). This configuration exposes multiple critical vulnerabilities:

1. **Root Database Access** - The application uses the MySQL `root` user with full administrative privileges instead of creating a limited-privilege application user. This violates the principle of least privilege and means application compromise equals database server compromise.

2. **Hardcoded Credentials** - The database password `admin_router` is hardcoded in application source code (__init__.py:17), Docker environment variables (mysql/Dockerfile:3: `ENV MYSQL_ROOT_PASSWORD=admin_router`), and Docker Compose health checks (docker-compose.yml:7). There is no environment variable usage (`os.getenv()`) or external secret management.

3. **No Encryption in Transit** - The connection string uses plain MySQL protocol without SSL/TLS. Database traffic between the `admin_router` and `db` containers flows unencrypted within the Docker network.

4. **No Encryption at Rest** - The MySQL 5.7.15 container has no transparent data encryption (TDE) configuration. All data including plaintext passwords and PII is stored unencrypted on disk.

**Catastrophic Isolation Level:** The database engine configuration sets `'isolation_level':'READ UNCOMMITTED'` (__init__.py:19), the weakest of the four ANSI SQL isolation levels. This enables:
- **Dirty Reads** - Transactions can read uncommitted changes from other transactions, seeing data that may be rolled back
- **Non-Repeatable Reads** - Reading the same row twice in a transaction may yield different results
- **Phantom Reads** - New rows can appear in result sets during a transaction

From a security perspective, this creates race condition vulnerabilities in session management. An attacker could exploit dirty reads in the session verification flow: when `verify_session()` queries the User table (routes.py:32), it might read uncommitted changes to user privileges, passwords, or session data from concurrent transactions. This enables timing-based privilege escalation attacks.

**Query Safety:** Despite the architectural vulnerabilities, the actual query implementation is secure. All database operations use **SQLAlchemy ORM** with parameterized queries. The critical user lookup at routes.py:32 (`User.query.filter_by(username=session.get('username')).first()`) uses the `.filter_by()` method which automatically parameterizes inputs, preventing SQL injection. No raw SQL queries (`db.execute()`, string concatenation) were found in the codebase.

### Data Flow Security

**Plaintext Password Storage Flow:** The data flow for user credentials demonstrates catastrophic security failures:
1. User submits credentials via HTTP POST to `/login` (routes.py:66-67)
2. Password extracted from `request.form['password']` in plaintext
3. Password hashed with PBKDF2 and stored in session (routes.py:70)
4. **Password stored in database as plaintext** during user creation (__init__.py:38: `password='test'` or line 50: `password=''.join(random.choices(...))`)
5. During authentication, plaintext password retrieved from database (routes.py:32-34)
6. Plaintext password hashed and compared to session hash (routes.py:35)

This flow is backwards from secure password handling, which should hash at storage time and never store or retrieve plaintext passwords.

**PII Data Flows:** The User model contains Personally Identifiable Information (PII):
- `email` (models.py:12) - Email addresses stored in plaintext, no encryption
- `name` and `lastname` (models.py:10-11) - Full names stored in plaintext
- All PII transmitted over unencrypted HTTP (Apache listens on port 80 only, no HTTPS configuration in admin_router-httpd.conf)

**Session Data Flow Security:** Sessions are stored server-side in MySQL table `mysessions` (configured at __init__.py:28), which is more secure than client-side session cookies. However, session data includes `password_hash` (routes.py:70), which stores PBKDF2-derived password material in the database. While hashed, this increases the attack surface if the session table is compromised.

**Sensitive Data in Subprocess Output:** The `/wifi_settings` endpoint executes `subprocess.run(['curl', '-v', '-s', 'http://haproxy:8001/devices/wifi_chipset/status', '-H', 'Host: internal.router'], capture_output=True, text=True)` (routes.py:132-134) and concatenates stderr and stdout into `error_response` (line 134). This output, including verbose curl connection details, HTTP headers, and response bodies, is passed directly to the wifi_settings.html template (line 135: `<pre style="color: white;">{{ error_response }}</pre>`). While Jinja2 autoescaping provides XSS protection, this creates an information disclosure channel for SSRF exploitation.

### Multi-tenant Data Isolation

**Not Applicable:** The application is single-tenant with no organization/tenant ID fields in the data model and no tenant-based query filtering. All users share the same database schema with access controlled only by the (broken) is_admin flag.

### Encryption and Hashing Implementations

**PBKDF2 Misuse:** The application uses PBKDF2-HMAC-SHA256 with 100,000 iterations (routes.py:34, 70), which would be adequate for password storage. However, the implementation is fundamentally flawed:
1. **Global Salt** - Uses `app.secret_key.encode()` as the salt for all users instead of generating unique random salts per user
2. **Hashing at Wrong Time** - Hashes passwords during authentication (routes.py:34) rather than during storage
3. **Plaintext Storage** - Stores passwords as plaintext in the database, rendering the PBKDF2 hashing pointless

The correct flow should generate a unique random salt per user, hash the password with PBKDF2 at registration time, and store both the salt and hash in the database. The plaintext password should never be stored or logged.

**Insecure Random Number Generation:** The admin password generation uses Python's `random` module (__init__.py:8-9, 50: `''.join(random.choices(string.ascii_uppercase + string.digits, k=100))`). The `random` module uses a Mersenne Twister PRNG which is **not cryptographically secure** - its state can be predicted from output. Cryptographic operations should use the `secrets` module introduced in Python 3.6.

**No TLS/HTTPS:** The Apache configuration (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/admin_router-httpd.conf`) defines only HTTP virtual hosts (`<VirtualHost *:80>`) with no SSL/TLS configuration. All traffic including credentials, session cookies, and PII is transmitted in cleartext. The missing configuration location is admin_router-httpd.conf - this file should contain SSL certificate paths, SSL engine activation, and protocol configuration, but these are completely absent.

### Secret Management

**Comprehensive Hardcoded Secrets Inventory:**

1. **Flask Secret Key** - `'your_secret_key'` at __init__.py:14, used for session signing and password hashing salt
2. **Database Root Password** - `admin_router` in three locations:
   - Application code: __init__.py:17
   - Docker env: mysql/Dockerfile:3
   - Health check: docker-compose.yml:7
3. **Flag Secret** - `flag{c8653e63-3018-4dcb-8f8e-eb473ca2a2e4}` at `.env:1`, though this is the CTF objective rather than a configuration secret
4. **Test User Credentials** - `test:test` at __init__.py:38 and documented in login.html:1 HTML comment

**No Secret Rotation:** The application has no secret rotation mechanisms, no key versioning, and no procedures for updating secrets without code changes. The static secret key and database credentials persist indefinitely.

**No External Secret Management:** No integration with secret management systems (HashiCorp Vault, AWS Secrets Manager, environment variables). All secrets are committed to the codebase or configuration files.

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **14 HTTP endpoints** across two Flask applications, accessible through a multi-proxy chain starting at mitmproxy port 8002 (externally exposed). The network path for all requests is: External Attacker → mitmproxy:8002 → haproxy:8001 → Apache:80 (virtual host routing).

**Public-Facing Admin Router (Default Virtual Host):**

1. **`GET /`** (routes.py:48-50)
   - Unauthenticated redirect to `/login`
   - No direct attack surface, simple HTTP 302 redirect
   
2. **`GET/POST /login`** (routes.py:53-78)
   - **Primary authentication endpoint**, accepts form data: `username`, `password`
   - No rate limiting, no CSRF protection, no account lockout
   - Vulnerable to credential stuffing with known test:test credentials
   - HTML comment at login.html:1 discloses default credentials
   - Debug code (commented out at routes.py:57-59) could expose session data if enabled
   
3. **`GET /logout`** (routes.py:81-85)
   - Requires valid session
   - Incomplete logout (only removes user_id, leaves session data)
   - Session fixation vulnerability
   
4. **`GET /dashboard`** (routes.py:104-121)
   - Requires authentication via `verify_session()` (lines 112-117)
   - No authorization checks, accessible to all authenticated users
   - Displays user information from session
   
5. **`GET /admin_panel`** (routes.py:88-101)
   - Requires authentication via `verify_session()` (lines 96-99)
   - **Authorization bug: always returns error regardless of is_admin flag** (line 101)
   - Intended flag capture route but completely inaccessible
   
6. **`GET/POST /wifi_settings`** (routes.py:124-141)
   - **CRITICAL SSRF SINK**: Executes subprocess curl to internal API (lines 132-134)
   - Requires authentication but no privilege checks
   - Returns verbose curl output including stderr (information disclosure)
   - Current implementation has hardcoded parameters (no immediate user input)
   - Template at wifi_settings.html:135 renders subprocess output in `<pre>` tag

**Internal Device API (internal.router Virtual Host):**

Accessible by setting `Host: internal.router` header when making requests through the proxy chain. All endpoints are **completely unauthenticated**.

7. **`GET /devices`** (internal/routes.py:6-67)
   - Returns JSON list of all device chipsets
   - No authentication required
   
8. **`GET /devices/wifi_chipset/status`** (internal/routes.py:70-102)
   - Returns WiFi chipset boot status (intentionally fails with HTTP 500)
   - This is the endpoint called by the wifi_settings subprocess
   
9. **`GET /devices/cpu_arm/status`** (internal/routes.py:105-125)
10. **`GET /devices/memory_ram/status`** (internal/routes.py:106)
11. **`GET /devices/storage_mmc/status`** (internal/routes.py:107)
12. **`GET /devices/bluetooth/status`** (internal/routes.py:108)
13. **`GET /devices/ethernet/status`** (internal/routes.py:109)
   - All return "Not available yet" messages
   - No authentication required
   
14. **`GET /devices/flag/status`** (internal/routes.py:128-150)
   - **CRITICAL FLAG EXPOSURE**: Reads `/flag` file and returns contents
   - Line 130: `with open('/flag') as flag_file: flag_content = flag_file.read()`
   - Line 147: Returns flag in JSON response
   - **No authentication, no authorization, no rate limiting**
   - Accessible from external network via Host header manipulation

### Internal Service Communication

**HAProxy Routing Trust Boundary:** HAProxy (haproxy.cfg) performs Host-based routing without security validation:
- ACL at line 16: `acl internal_host hdr(host) -i internal.router`
- Line 17: `use_backend internal if internal_host`
- Lines 22-24: Default backend routes to external admin_router

This creates a **trust boundary violation**: the internal API trusts requests routed by HAProxy, but HAProxy makes routing decisions based on the untrusted Host header from external clients. There is no IP-based restriction, no client certificate validation, no shared secret validation between HAProxy and the internal application.

**Custom Headers as Security Indicators:** HAProxy adds custom headers (haproxy.cfg:38-40):
- `X-Forwarded-Host: internal.router`
- `X-Upstream-Proxy: mitmproxy (6.0.2)`
- `Via: haproxy (2.0.5)`

These headers reveal internal architecture to attackers and could be used for fingerprinting, but they provide no actual security enforcement as the internal API doesn't validate them.

**Service Dependencies:** Docker Compose (docker-compose.yml) defines service startup order:
- `db` starts first (MySQL database)
- `admin_router` depends on `db` health check
- `mitmproxy` starts after `admin_router`
- `haproxy` starts last, depends on `mitmproxy`

The dependency chain means the database is the most isolated service (no inbound connections from external network), while mitmproxy is the DMZ entry point.

### Input Validation Patterns

**Form Input Validation:** The application has **no input validation** on form fields. The login handler (routes.py:66-67) directly extracts form data without validation:
- No username length checks (database allows up to 50 characters per models.py:8)
- No password complexity requirements
- No character set restrictions
- No format validation (email addresses, names)

**SQLAlchemy Provides SQL Injection Protection:** While there's no explicit input validation, the use of SQLAlchemy ORM with `.filter_by()` (routes.py:32) automatically parameterizes queries, preventing SQL injection. This is defense in depth rather than explicit validation.

**Template Auto-Escaping:** Jinja2's automatic HTML escaping (enabled by default for .html templates) provides XSS protection for reflected content. The error_response output at wifi_settings.html:135 (`{{ error_response }}`) is auto-escaped, preventing HTML injection from subprocess output. However, if an attacker can control the internal API response to include JavaScript payloads, the auto-escaping might be bypassed depending on the content type.

**No CSRF Protection:** The application lacks CSRF tokens on forms. The login POST (routes.py:53) and wifi_settings POST (routes.py:124) accept requests without validating origin or referrer. While Flask session cookies default to `HttpOnly=True` (preventing JavaScript access), the absence of `SameSite=Lax` or `SameSite=Strict` (not configured in __init__.py) leaves all POST endpoints vulnerable to CSRF attacks from malicious websites.

### Background Processing

**No Background Workers Detected:** The application has no Celery workers, no async task queues, no cron jobs, and no scheduled tasks. All processing is synchronous within the request-response cycle.

**Subprocess Execution as Pseudo-Background Task:** The `/wifi_settings` endpoint (routes.py:132-134) uses `subprocess.run()` with `capture_output=True`, which **blocks** until the curl command completes. This is not true background processing - it's a synchronous subprocess call within the HTTP request handler. The subprocess executes with the same privileges as the Flask application, and its output is returned directly to the user.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Comprehensive Secret Exposure:** As detailed in Section 4, all secrets are hardcoded in source code or configuration files:
- Flask secret key `'your_secret_key'` at __init__.py:14 (controls session security and password hashing)
- MySQL root password `admin_router` in three locations (__init__.py:17, mysql/Dockerfile:3, docker-compose.yml:7)
- Test credentials `test:test` in code (__init__.py:38) and HTML comments (login.html:1)
- Flag value in .env:1 (CTF objective)

**No Secret Rotation Infrastructure:** The application has no mechanisms for:
- Rotating the Flask secret key without invalidating all sessions
- Updating database credentials without code changes
- Versioning secrets or managing migration between old and new secrets
- Automated secret expiration or renewal

### Configuration Security

**Environment Separation:** The application shows no evidence of environment-specific configurations (no config.py with DevConfig/ProdConfig classes, no environment variable-based configuration selection). All configuration is hardcoded in __init__.py, suggesting the same credentials and secret keys would be used in development, staging, and production environments.

**Secret Handling in Configuration:** The most critical security headers are configured at the infrastructure level rather than application level:

**HSTS (Strict-Transport-Security):** Not configured in the application (no Flask-Talisman or manual header setting in routes.py:13-19). The infrastructure layer also lacks HSTS configuration:
- Apache config (admin_router-httpd.conf) has no `Header always set Strict-Transport-Security` directive
- HAProxy config (haproxy.cfg) operates in HTTP-only mode with no HTTPS frontend
- No CDN or edge layer detected that might add HSTS headers

The specific location where HSTS should be configured is `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/admin_router-httpd.conf` within the `<VirtualHost>` blocks (lines 1-46), where a line like `Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"` should appear but is absent.

**Cache-Control Headers:** The application sets Cache-Control headers in routes.py:13-19:
```python
@app.after_request
def add_header(request):
    request.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    request.headers['Pragma'] = 'no-cache'
    request.headers['Expires'] = '0'
    request.headers['Cache-Control'] = 'public, max-age=0'  # Contradicts line 15
    return request
```
This configuration is self-contradictory (line 15 sets `no-cache, no-store` while line 18 sets `public, max-age=0`), and it's set on the response object rather than using proper Flask response.headers manipulation.

**Missing Security Headers:** The application lacks critical security headers:
- No `X-Frame-Options` (clickjacking protection)
- No `X-Content-Type-Options: nosniff` (MIME sniffing protection)
- No `Content-Security-Policy` (XSS and data injection protection)
- No `Referrer-Policy` (referrer information control)
- No `Permissions-Policy` (browser feature control)

These should be configured in admin_router-httpd.conf using Apache's `Header set` directives, but the only header configuration found is the overly permissive `Header set Access-Control-Allow-Origin "*"` at line 14.

### External Dependencies

**Third-Party Service Dependencies:** The application has no external service dependencies - no payment gateways, no email services, no cloud storage, no analytics platforms. All functionality is self-contained within the Docker Compose stack.

**Software Supply Chain Dependencies:**

Python dependencies (website/requirements.txt):
- `flask` - Web framework (no version pinned, uses latest)
- `flask_sqlalchemy` - ORM (no version pinned)
- `pymysql` - MySQL connector (no version pinned)
- `flask_session` - Session management (no version pinned)

**Supply Chain Security Risks:**
1. **No Version Pinning** - All Python dependencies lack version constraints (no `==` or `~=` operators), meaning `pip install` pulls the latest versions, creating reproducibility and security issues
2. **No Dependency Scanning** - No evidence of tools like Safety, Snyk, or Dependabot for vulnerability scanning
3. **No Integrity Verification** - No `requirements.txt` hash verification (`pip install --require-hashes`)

Infrastructure dependencies:
- **HAProxy 2.0.5** - Explicitly pinned at haproxy/Dockerfile:1 (`FROM haproxy:2.0.5`), with a comment indicating this vulnerable version is intentionally preserved
- **mitmproxy 6.0.2** - Pinned at mitmproxy/Dockerfile:1 (`FROM mitmproxy/mitmproxy:6.0.2`)
- **MySQL 5.7.15** - Pinned at mysql/Dockerfile:1 (`FROM mysql:5.7.15`), an older version from 2016
- **Debian Bullseye** - Application base image (app/Dockerfile:1: `FROM debian:bullseye-slim`)

**Known Vulnerable Components:** HAProxy 2.0.5 (released 2019) is subject to multiple CVEs fixed in later versions. The intentional preservation of this version (per Dockerfile comment) suggests it's part of the CTF challenge design.

### Monitoring & Logging

**Application-Level Logging:** No application logging detected. The codebase contains no `import logging`, no logger configuration, no log statements. Critical security events are not logged:
- Login attempts (successful or failed)
- Session creation/destruction
- Authorization failures
- Subprocess execution
- Internal API access

**Infrastructure Logging:** Docker Compose (docker-compose.yml) has no logging configuration stanzas. Container logs use default JSON-file driver with no rotation, retention, or aggregation configuration.

**Security Event Visibility:** The lack of logging means the following security events are invisible:
- Brute force login attempts
- Host header manipulation attempts to access internal API
- Subprocess injection attempts
- Privilege escalation attempts
- Session hijacking
- CSRF attacks

**No SIEM Integration:** No integration with Security Information and Event Management (SIEM) systems, no log forwarding to Elasticsearch/Splunk, no anomaly detection.

---

## 7. Overall Codebase Indexing

The XBEN-066-24 codebase follows a **Docker Compose microservices architecture** with clear separation between application code, infrastructure configuration, and orchestration definitions. The root directory `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/` contains 96 files totaling 844 KB, organized into distinct functional domains.

**Application Code Structure:** The `/app/` directory contains two separate Flask applications with parallel structure. The public-facing **website** application at `/app/website/` implements the router administration panel with a standard Flask project layout: `app/__init__.py` for application factory and configuration, `app/routes.py` for endpoint handlers, `app/models.py` for SQLAlchemy data models, `app/db.py` for database instance, `app/static/` for CSS/JavaScript assets, and `app/templates/` for Jinja2 HTML templates. The **internal** application at `/app/internal/` follows a similar but minimal structure with only routes.py containing the device API endpoints. Both applications have standalone `run.py` files for local development and `.wsgi` files (admin_router.wsgi, internal_router.wsgi) for Apache mod_wsgi deployment.

**Infrastructure as Code Organization:** The infrastructure layer uses dedicated directories for each service. The `/haproxy/` directory contains haproxy.cfg (routing configuration) and Dockerfile (version pinning). The `/mitmproxy/` directory has a Dockerfile defining the reverse proxy configuration. The `/mysql/` directory includes the MySQL Dockerfile with hardcoded environment variables. The root-level `docker-compose.yml` orchestrates all four services (db, admin_router, haproxy, mitmproxy) with health checks and dependency chains. The `app/admin_router-httpd.conf` file at the root of /app/ defines Apache virtual host routing for both Flask applications on a single Apache instance.

**Configuration and Secret Storage:** Critical configuration is scattered across multiple locations, hindering security auditing. The Flask secret key and database URI are in `/app/website/app/__init__.py`, database credentials are duplicated in `/mysql/Dockerfile` and `/docker-compose.yml`, the CTF flag is in `/.env` at the repository root, and Apache configuration including CORS headers is in `/app/admin_router-httpd.conf`. This distributed configuration model makes secret rotation and environment-specific configuration management extremely difficult.

**Build and Deployment Tooling:** The root-level `Makefile` includes a reference to `../common.mk` (external to the repository), suggesting this is part of a larger CTF framework with shared build logic. The `.xben_build_done` marker file indicates completed builds. The multi-stage Dockerfile at `/app/Dockerfile` installs Debian packages (apache2, libapache2-mod-wsgi-py3, python3, python3-pip, curl), copies application code, installs Python dependencies from requirements.txt files, enables Apache modules (headers, wsgi), writes the flag to `/flag` using a build argument, and configures the Apache WSGI virtual hosts.

**Frontend Asset Organization:** The `/app/website/app/static/` directory contains third-party libraries with version-specific filenames (`jquery-3.5.1.min.js`, bootstrap.min.js, bootstrap.min.css), indicating manual dependency management rather than npm/webpack/bundler usage. The custom CSS files implement dark-themed styling. Templates in `/app/website/app/templates/` include extensive Bootstrap 4 markup with modals, forms, and grid layouts.

**Git Repository Structure:** The `.git/` directory indicates version control is in use. The `.env` file containing the flag is tracked in the repository (a security anti-pattern in real applications but acceptable for CTF challenges). No `.gitignore` patterns exclude sensitive files like `__pycache__/` or `.env`.

**Testing and Documentation Absence:** The codebase contains no `/tests/` directory, no pytest or unittest files, no CI/CD configuration (no .github/workflows/, .gitlab-ci.yml, or similar), no README.md or documentation files (except HTML comments), and no type hints or docstrings in Python code. This suggests the application was built as a CTF challenge rather than production software, prioritizing vulnerability injection over code quality practices.

**Impact on Security Discoverability:** The clear directory structure actually aids security analysis - authentication code is entirely in website/app/routes.py and __init__.py, the flag is explicitly written in app/Dockerfile:29, internal API endpoints are isolated in internal/app/routes.py, and infrastructure routing logic is centralized in haproxy/haproxy.cfg. The lack of code generation, build complexity, or obfuscation means all security-relevant components are directly readable in their source files. However, the distributed configuration (secret key in __init__.py, database credentials in docker-compose.yml, CORS in httpd.conf) requires cross-referencing multiple files to understand the complete security posture.

**Significant Architectural Patterns:** The application demonstrates several noteworthy patterns: **Virtual Host Multiplexing** (two Flask apps on one Apache instance differentiated by ServerName), **Layered Reverse Proxying** (mitmproxy → HAProxy → Apache creating multiple interception points), **Server-Side Sessions with Database Backend** (using flask_session's SqlAlchemySessionInterface rather than signed cookies), and **Subprocess-Based Service Communication** (using curl subprocess rather than Python requests library for internal API calls). These patterns create unique attack surfaces not found in typical Flask applications.

---

## 8. Critical File Paths

### Configuration

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/admin_router-httpd.conf` - Apache virtual host configuration, CORS headers, WSGI application paths
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/haproxy/haproxy.cfg` - HAProxy routing logic, Host header ACLs, backend definitions
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/docker-compose.yml` - Service orchestration, database credentials, health checks
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/.env` - Flag storage (CTF objective)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/Dockerfile` - Application container build, flag file creation, Apache setup
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/mysql/Dockerfile` - MySQL configuration, hardcoded root password
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/haproxy/Dockerfile` - HAProxy version pinning (2.0.5 vulnerable version)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/mitmproxy/Dockerfile` - Mitmproxy reverse proxy configuration

### Authentication & Authorization

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/__init__.py` - Flask secret key (line 14), database URI (line 17), isolation level (line 19), session interface (line 28), default user creation (lines 32-57)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py` - verify_session() function (lines 31-46), login endpoint (lines 53-78), logout endpoint (lines 81-85), admin_panel authorization bug (lines 88-101), wifi_settings subprocess (lines 132-134)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/models.py` - User model with plaintext password field (line 9), is_admin flag (line 13)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/admin_router.wsgi` - WSGI entry point for public application
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/internal/internal_router.wsgi` - WSGI entry point for internal API

### API & Routing

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py` - All public endpoints (/, /login, /logout, /dashboard, /admin_panel, /wifi_settings)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/internal/app/routes.py` - All internal API endpoints including /devices/flag/status (lines 128-150)

### Data Models & DB Interaction

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/db.py` - SQLAlchemy database instance
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/models.py` - User model schema (lines 6-13)

### Dependency Manifests

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/requirements.txt` - Flask, flask_sqlalchemy, pymysql, flask_session (no version pinning)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/internal/requirements.txt` - Flask only

### Sensitive Data & Secrets Handling

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/__init__.py` - Secret key (line 14), database credentials (line 17), password hashing (PBKDF2 in routes.py lines 34, 70)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/.env` - Flag value

### Middleware & Input Validation

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py` - After-request middleware for cache headers (lines 13-19)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/admin_router-httpd.conf` - CORS headers (line 14)

### Logging & Monitoring

- No logging configuration files found (no logging.conf, no logger initialization in code)

### Infrastructure & Deployment

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/docker-compose.yml` - Multi-service orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/Makefile` - Build automation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/Dockerfile` - Multi-stage application build

### CTF Flag Storage

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/.env` - FLAG environment variable (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/Dockerfile` - Flag written to /flag file (line 29: `RUN echo -n $FLAG > /flag`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/internal/app/routes.py` - Flag file read endpoint (lines 128-150, specifically line 130: `with open('/flag')`)

### Templates (XSS Analysis)

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/login.html` - Login form, TODO comment revealing test credentials (line 1), debug session output (lines 82-84)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/dashboard.html` - User dashboard, debug session output (lines 124-128)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/admin_panel.html` - Admin panel (never accessible), flag display code (lines 82-84), debug session output (lines 125-129)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/wifi_settings.html` - WiFi configuration form, subprocess output rendering (line 135)

---

## 9. XSS Sinks and Render Contexts

**Network Surface Scope:** All XSS sinks identified below are in network-accessible web application pages served through the public admin router virtual host. No XSS sinks exist in local-only scripts, build tools, or non-network components.

### High Severity XSS Sink

**Sink #1: Subprocess Output Reflection (Potential XSS via Backend Control)**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/wifi_settings.html:135`

**Render Context:** HTML Body Context (inside `<pre>` element within Bootstrap modal)

**Template Code:**
```html
<pre style="color: white;">{{ error_response }}</pre>
```

**Data Flow Source:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py:132-134`
```python
curl_command = ['curl', '-v', '-s', 'http://haproxy:8001/devices/wifi_chipset/status', '-H', 'Host: internal.router']
result = subprocess.run(curl_command, capture_output=True, text=True)
error_response = (result.stderr + result.stdout)
```

**Vulnerability Analysis:** The `error_response` variable contains the raw concatenation of subprocess stderr and stdout from a curl command to an internal API. While Jinja2 autoescaping provides baseline XSS protection by converting `<`, `>`, `&`, `"`, and `'` to HTML entities, this sink becomes exploitable if an attacker can control the HTTP response from the internal API endpoint `http://haproxy:8001/devices/wifi_chipset/status`. The current implementation makes a hardcoded request to internal.router, but if the attacker achieves SSRF capability or positions themselves to intercept/modify the internal API response, they could inject HTML/JavaScript into the curl output, which would then be rendered in the wifi_settings modal. The verbose curl output (`-v` flag) includes HTTP headers, connection details, and response bodies, expanding the injection surface.

**Current Sanitization:** Jinja2 autoescaping (enabled by default for .html templates)

**Exploitability:** MEDIUM - Requires one of:
1. SSRF capability to redirect curl to attacker-controlled server returning malicious content
2. Network position to intercept/modify internal API responses
3. Compromise of internal router application to inject malicious responses

**Attack Vector:** Control internal service response → HTML/JavaScript injection in subprocess output → Rendered in modal → XSS execution

**Remediation:** Explicitly escape subprocess output or use `| e` filter, validate/sanitize curl output before template rendering, consider using Content-Security-Policy to mitigate XSS impact

### Medium Severity Information Disclosure

**Sinks #2-4: Debug Session Information in HTML Comments**

**Locations:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/login.html:82-84`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/dashboard.html:124-128`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/admin_panel.html:125-129`

**Render Context:** HTML Comment Context

**Template Code (login.html example):**
```html
{% if debug_session %}
<!--
Server-Side Session Content:    
{{ debug_session }}
-->
{% endif %}
```

**Data Flow Source:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py:63` (currently commented out)
```python
# debug_session = str(dict(session.items()))
```

**Vulnerability Analysis:** The templates contain conditional blocks that render complete session contents (including username, password_hash, user_id, and session_id) in HTML comments if the `debug_session` variable is populated. The routes.py code that populates this variable is currently commented out (lines 57-59), making this vulnerability dormant. However, if debug mode is accidentally enabled by uncommenting these lines or if a similar debug parameter is introduced, all session data would be leaked in HTML source viewable to any user. While the content is in HTML comments (not rendered visually), it's fully accessible via "View Source" and appears in HTML parsing/scraping tools.

**Current Status:** DISABLED (debug code commented out in routes.py:57-59)

**Exploitability:** LOW (requires developer error to re-enable debug mode)

**Attack Vector:** Debug mode enabled → Session data in HTML comments → Information disclosure via View Source

**Impact if Enabled:** Session hijacking material (password_hash, session_id) exposed in HTML source

**Remediation:** Completely remove debug session code from production templates, use proper logging instead of HTML comments for debugging

### Low Severity / Not Exploitable Sinks

**Sink #5: Login Error Message**
- Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/login.html:62`
- Code: `<div class="error-message">{{ error }}</div>`
- Source: routes.py:78 passes `e.message` from SessionError exception
- User Control: NONE - Error messages are hardcoded strings (SessionError.__init__ default message)
- Assessment: NOT EXPLOITABLE

**Sink #6: Dashboard Error Message**
- Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/dashboard.html:103`
- Code: `<div class="modal-body">{{ error_message }}</div>`
- Source: routes.py:101 passes hardcoded string 'Only administrator users can open this section.'
- Assessment: NOT EXPLOITABLE

**Sink #7: Admin Panel Error Message**
- Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/templates/admin_panel.html:104`
- Code: `<div class="modal-body">{{ error_message }}</div>`
- Source: Hardcoded error strings
- Assessment: NOT EXPLOITABLE

### No Template Injection (SSTI)

**Finding:** `render_template_string` is imported at routes.py:1 but **never invoked** anywhere in the codebase. All template rendering uses `render_template()` with static template names, preventing Server-Side Template Injection (SSTI) attacks.

### No Client-Side JavaScript Sinks

**Finding:** All JavaScript files are third-party libraries (jQuery 3.5.1, Bootstrap 4.5.2) with no custom JavaScript that manipulates the DOM with user data. The only custom JavaScript consists of Bootstrap modal initialization calls, which don't process user input.

### SQL Injection: Not Applicable to XSS Analysis

All database operations use SQLAlchemy ORM with parameterized queries (`.filter_by()` method), preventing SQL injection. While not XSS, this demonstrates secure coding practices that reduce overall injection vulnerabilities.

### Summary of XSS Risk

**Total XSS Sinks Identified:** 1 exploitable, 3 information disclosure (dormant)

**Overall XSS Risk Level:** LOW-MEDIUM
- Jinja2 autoescaping provides strong baseline protection
- Only one potential XSS vector requires SSRF or network positioning
- No direct user input reaches XSS sinks
- No SSTI vulnerabilities
- No dangerous client-side JavaScript

**Primary XSS Defense Mechanisms:**
1. Jinja2 autoescaping enabled by default for .html templates
2. No `render_template_string()` usage (prevents SSTI)
3. No custom JavaScript DOM manipulation
4. Subprocess parameters hardcoded (no command injection to escalate to XSS)

**Recommended XSS Mitigations:**
1. Implement Content-Security-Policy header to restrict script sources
2. Explicitly escape subprocess output before template rendering
3. Remove all debug session code from templates
4. Add `X-Content-Type-Options: nosniff` header to prevent MIME confusion

---

## 10. SSRF Sinks

**Network Surface Scope:** All SSRF sinks identified below are in network-accessible web application endpoints served through the public admin router virtual host. No SSRF sinks exist in local-only utilities, build scripts, developer tools, or CLI applications.

### Critical SSRF Sink

**Sink #1: Internal HTTP Request via Subprocess Curl**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py:132-134`

**Endpoint:** `/wifi_settings` (GET/POST)

**Authentication Required:** Yes (requires valid session via `verify_session()` at lines 126-129)

**Sink Type:** Server-Side Request Forgery via subprocess curl execution

**Code:**
```python
curl_command = ['curl', '-v', '-s', 'http://haproxy:8001/devices/wifi_chipset/status', '-H', 'Host: internal.router']
result = subprocess.run(curl_command, capture_output=True, text=True)
error_response = (result.stderr + result.stdout)
```

**Detailed Analysis:**

This SSRF sink executes the curl command-line HTTP client as a subprocess to make internal network requests. The command structure uses the Python list format (preventing shell injection via argument splitting), but all parameters are currently **hardcoded**:
- URL: `http://haproxy:8001/devices/wifi_chipset/status` (internal HAProxy service)
- Headers: `Host: internal.router` (triggers HAProxy's ACL routing to internal backend)
- Flags: `-v` (verbose output), `-s` (silent mode, no progress bar)

**Current User Control:** NONE - All curl parameters are static strings with no user input substitution.

**Response Disclosure:** COMPLETE - The subprocess output (both stderr and stdout) is concatenated into `error_response` and passed directly to the wifi_settings.html template (line 135: `<pre style="color: white;">{{ error_response }}</pre>`). This creates a **full-read SSRF** where an attacker can view complete HTTP responses including headers, connection details (from `-v` verbose flag), response bodies, and error messages.

**Exploitability Assessment:**

**Direct Exploitability:** LOW - The hardcoded parameters prevent immediate SSRF exploitation. No URL parameters, form fields, headers, or cookies influence the curl command.

**Indirect Exploitability Paths:**

1. **Parameter Injection Discovery:** Test for injection vectors in the `/wifi_settings` endpoint:
   - Form fields: The POST handler (routes.py:124) might process form data not visible in the shown code snippet
   - HTTP headers: X-Forwarded-For, X-Original-URL, X-Rewrite-URL headers might be consumed
   - Cookies: Additional cookies beyond the session cookie
   - URL parameters: Query string parameters in the GET request

2. **Template Injection to Command Injection:** If Jinja2 template rendering occurs before the curl_command construction (not shown in current code), SSTI could escalate to command injection

3. **Race Condition Exploitation:** The READ UNCOMMITTED isolation level might allow dirty reads of database values that feed into the curl command construction

4. **Code Modification Attack:** If an attacker achieves file write capability (via separate vulnerability), they could modify routes.py to introduce user input into curl_command

**High-Value SSRF Targets:**

Given the internal network architecture, successful SSRF exploitation would enable access to:

1. **PRIMARY TARGET - Flag Endpoint:**
   - URL: `http://haproxy:8001/devices/flag/status`
   - Header: `Host: internal.router`
   - Contains: Flag file contents from `/flag`
   - Current access: Already accessible via Host header manipulation, but SSRF would provide alternative path

2. **Internal Flask API Endpoints:**
   - `/devices/wifi_chipset/status` (already targeted by curl)
   - `/devices/cpu_arm/status`
   - `/devices/memory_ram/status`
   - `/devices/storage_mmc/status`
   - `/devices/bluetooth/status`
   - `/devices/ethernet/status`
   - `/devices` (device listing)
   - All accessible via `Host: internal.router` header through HAProxy

3. **HAProxy Statistics/Admin Interface:**
   - HAProxy often exposes stats interfaces on alternate ports
   - Could reveal backend configurations, health status

4. **MySQL Database (if network-accessible):**
   - Host: `db` (Docker service name)
   - Port: 3306
   - Credentials: `root:admin_router` (from connection string)
   - SSRF to MySQL could enable protocol smuggling attacks

5. **Cloud Metadata Services (if hosted on AWS/GCP/Azure):**
   - AWS: `http://169.254.169.254/latest/meta-data/`
   - GCP: `http://metadata.google.internal/computeMetadata/v1/`
   - Azure: `http://169.254.169.254/metadata/instance`
   - Access to instance credentials, IAM roles, user data

6. **Internal Network Reconnaissance:**
   - Port scanning of Docker network: `172.17.0.0/16` (default Docker bridge)
   - Service discovery: `http://admin_router:80`, `http://haproxy:8001`, `http://db:3306`
   - Banner grabbing via verbose curl output

**Exploitation Methodology:**

**Phase 1 - Injection Vector Discovery:**
1. Authenticate with `test:test` credentials to access `/wifi_settings`
2. Submit POST request with various payloads in form fields
3. Test HTTP header injection: `X-Forwarded-Host`, `X-Original-URL`, `X-Rewrite-URL`
4. Test cookie injection beyond standard session cookie
5. Monitor `error_response` output for reflection of injected values

**Phase 2 - URL Manipulation:**
If injection achieved, craft payloads to:
1. Change URL to `http://haproxy:8001/devices/flag/status`
2. Maintain `Host: internal.router` header for proper routing
3. Test alternate protocols: `file:///`, `gopher://`, `dict://`
4. Test CRLF injection in URLs for header injection

**Phase 3 - Response Exfiltration:**
1. Observe verbose curl output in modal dialog
2. Extract response bodies, headers, connection details
3. For blind SSRF: use timing attacks (curl timeouts) or DNS exfiltration

**Potential Injection Payloads (if user input reaches curl_command):**

**URL Injection:**
```
# Target flag endpoint
http://haproxy:8001/devices/flag/status

# Cloud metadata
http://169.254.169.254/latest/meta-data/iam/security-credentials/

# Internal network scan
http://172.17.0.2:3306
```

**Header Injection (CRLF):**
```
value\r\nX-Injected: header\r\n
```

**Current Validation:** NONE - No URL validation, no allowlist of permitted hosts, no protocol restrictions, no port restrictions

**Defense Mechanisms:**

**Current:** None (hardcoded parameters are the only defense)

**Required:**
1. Input validation with strict allowlist of permitted internal endpoints
2. URL parsing and protocol validation (allow only http/https)
3. DNS rebinding protection
4. Disable URL redirects in curl (currently not set, curl follows redirects by default)
5. Network segmentation to restrict curl's network access
6. Replace subprocess curl with Python `requests` library for better control
7. Remove verbose flag (`-v`) to reduce information disclosure

### Other SSRF Sink Categories: Not Found

**Systematic Search Results:**

- ✅ **HTTP Clients via Subprocess** - 1 sink found (curl at routes.py:132)
- ❌ **Python Requests Library** - Not used in codebase
- ❌ **urllib/urllib2/httplib** - Not used
- ❌ **Raw Sockets** - No socket.connect(), no TCP/UDP clients
- ❌ **URL Openers** - No file_get_contents, fopen with URLs
- ❌ **Redirect Handlers** - Flask redirects use `url_for()` (safe, no user input)
- ❌ **Headless Browsers** - No Puppeteer, Playwright, Selenium
- ❌ **Media Processors** - No ImageMagick, FFmpeg, image processing with URLs
- ❌ **Link Preview/Unfurlers** - No oEmbed, no URL metadata fetchers
- ❌ **Webhook Testers** - No "ping my webhook" functionality
- ❌ **SSO/OIDC/JWKS Fetchers** - No OAuth flows, no JWKS endpoints
- ❌ **Import from URL** - No remote CSV/JSON loaders
- ❌ **Package Installers** - No "install from URL" features
- ❌ **Monitoring/Health Checks** - Docker-level health checks only (not application SSRF)
- ❌ **Cloud Metadata Helpers** - No AWS/GCP SDK usage
- ❌ **XML External Entities** - No XML parsing

### Summary of SSRF Risk

**Total SSRF Sinks:** 1 (subprocess curl)

**Overall SSRF Risk Level:** MEDIUM
- Only one sink identified
- Currently not directly exploitable (hardcoded parameters)
- Full response disclosure creates high-value information channel
- Internal network contains high-value targets (flag endpoint, database)
- Authenticated users can trigger SSRF (low barrier with test:test credentials)

**Primary SSRF Defense Gaps:**
1. No input validation infrastructure
2. No network segmentation preventing internal access
3. Verbose output disclosure enables full-read SSRF
4. No URL allowlisting or protocol restrictions
5. Using subprocess instead of safer HTTP libraries

**Recommended Next Steps for Penetration Testing:**
1. Test all form fields, headers, and cookies on `/wifi_settings` for parameter injection
2. Attempt to modify curl URL to target `http://haproxy:8001/devices/flag/status`
3. Test for timing-based blind SSRF if response disclosure fails
4. Enumerate internal network via SSRF port scanning if URL control achieved
5. Target cloud metadata services if infrastructure is cloud-hosted

---

**END OF CODE ANALYSIS DELIVERABLE**