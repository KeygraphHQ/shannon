# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported meet the "In-Scope" criteria defined below.

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

This is a deliberately vulnerable Flask web application named "Trading Platform" (XBEN-003-24) that implements a two-step authentication system with critical security flaws by design. The application exposes a **catastrophic authentication bypass vulnerability** through a custom `X-UserId` HTTP header that allows any authenticated user to impersonate others, including accessing a flag stored in the database. The security posture is fundamentally compromised by plaintext password storage, hardcoded secrets, and the complete absence of modern security controls.

The attack surface consists of 4 network-accessible HTTP endpoints deployed via Apache/mod_wsgi on port 80 (HTTP-only, no TLS). The most critical finding is the `X-UserId` header authentication override in the `/dashboard` endpoint (lines 73-78 of routes.py), which bypasses session-based authentication entirely. Combined with exposed user IDs in HTML templates, this creates a direct path to privilege escalation. Additional critical vulnerabilities include plaintext password storage with no hashing mechanism, a hardcoded Flask secret key (`'your_secret_key'`), and wide-open CORS configuration (`Access-Control-Allow-Origin: *`).

From an external attacker perspective, the exploitation path is trivial: authenticate with test credentials (`test:test`), then request `/dashboard` with header `X-UserId: 10052` to access the flag stored in the target user's `last_name` field. The application lacks all fundamental security controls including CSRF protection, rate limiting, input validation middleware, security headers (CSP, X-Frame-Options, HSTS), password hashing, and proper session management. This represents a textbook example of broken authentication and broken access control vulnerabilities.

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **Flask 3.0.3**, a Python micro-framework, with **Flask-SQLAlchemy 3.1.1** as the ORM layer. The Python version is 3.x running on Debian Bullseye Slim base image. This technology stack provides basic web framework capabilities but requires explicit security configuration—none of which has been implemented in this application. Flask's default security features like Jinja2 auto-escaping for XSS protection are present, but critical features like CSRF protection (flask-wtf), secure session configuration, and password hashing utilities (werkzeug.security) are either not installed or not utilized.

The database layer consists of **MySQL 5.7.15** accessed via **PyMySQL 1.1.0** connector. The SQLAlchemy ORM is correctly configured with proper parameterization, effectively preventing SQL injection attacks despite the absence of explicit input validation. However, the database security itself is severely compromised: the application connects as root user with hardcoded credentials (`root:trading_platform_db`), no connection encryption is configured, and no encryption-at-rest is implemented. The frontend utilizes **Bootstrap CSS** and **jQuery 3.5.1** for basic UI functionality, with vanilla JavaScript handling form submissions via Fetch API.

### Architectural Pattern

This is a **monolithic two-tier web application** following the classic MVC pattern: Flask routes handle controller logic, Jinja2 templates render views, and SQLAlchemy models represent data. The architecture establishes two primary trust boundaries: (1) between unauthenticated and authenticated users via session cookies, and (2) between the web tier and database tier. However, both boundaries are critically compromised. The first boundary is bypassed by the `X-UserId` header vulnerability, while the second boundary offers no protection due to root database access and plaintext credential storage.

The deployment architecture uses **Apache 2.4 with mod_wsgi** as the web server, containerized via **Docker Compose** with two services: `app` (Flask application on port 80) and `db` (MySQL 5.7.15 on internal port 3306). The Docker network isolates the database from external access, but this provides minimal security value since the application itself has root database privileges. The Apache configuration enables directory listing on `/static/` (line 15 of trading_platform-httpd.conf), creating an information disclosure vector. No reverse proxy, WAF, or load balancer sits in front of the application, and no TLS termination is configured—all traffic is HTTP-only.

### Critical Security Components

**Authentication System**: The application implements a custom two-step login flow: step 1 validates username existence at `/` (lines 19-32 of routes.py), and step 2 validates password at `/password/<username>` (lines 44-64). This design exposes a username enumeration vulnerability—different error responses reveal whether usernames exist in the database. The password validation performs plaintext comparison (`User.query.filter_by(username=username, password=password).first()` at line 53) with **zero cryptographic hashing**, storing passwords as plain strings in the database. Upon successful authentication, the user's ID is stored in session: `session['user_id'] = user.id` (line 56).

**Session Management**: Flask's default client-side session mechanism is used, with cookies cryptographically signed using the secret key defined at line 11 of `__init__.py`: `app.secret_key = 'your_secret_key'`. This is a **development placeholder value** that should never appear in production code. With this weak secret, attackers can forge session cookies to impersonate any user. No session configuration is present—no `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_HTTPONLY`, or `SESSION_COOKIE_SAMESITE` flags are set. While Flask defaults to `HttpOnly=True`, the missing `Secure` flag allows cookie transmission over unencrypted HTTP, and the missing `SameSite` flag enables CSRF attacks.

**Authorization Model**: The application implements **zero authorization controls** beyond basic authentication. The `/dashboard` endpoint (lines 68-86 of routes.py) contains the critical authentication bypass: it accepts an `X-UserId` header that completely overrides session-based authentication. The vulnerable code at lines 73-78 checks if the header exists and if the specified user_id is valid in the database, then replaces the session user_id with the attacker-controlled value. This broken access control allows any authenticated user to access any other user's dashboard by simply setting `X-UserId: <target_user_id>`. No role-based access control (RBAC), attribute-based access control (ABAC), or permission system exists.

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

The authentication system exposes **four primary endpoints**, three of which are public and one requiring authentication:

1. **Login (Username Entry) - `POST /`** (lines 19-32, routes.py): Accepts username via form data, queries database with `User.query.filter_by(username=username).first()`. If user exists, redirects to password page; otherwise returns error "User not found". This creates a **username enumeration vulnerability**—attackers can discover valid usernames through timing analysis or distinct error responses. The endpoint has no rate limiting, enabling brute-force username discovery. No CSRF protection exists, though CSRF attacks on login pages are typically lower risk.

2. **Password Entry - `POST /password/<username>`** (lines 44-64, routes.py): Accepts password via form data and username from both URL path parameter and hidden form field. Performs authentication with plaintext comparison: `User.query.filter_by(username=username, password=password).first()` (line 53). If successful, creates session with `session['user_id'] = user.id` (line 56) and redirects to dashboard. **Critical exposures**: username in URL path (information disclosure), user_id exposed in hidden form field at line 64 and embedded in JavaScript at line 56 of password.html template. The template includes a TODO comment at line 1 of login.html: `<!-- TODO: Delete the testing account (test:test). -->`, explicitly documenting the presence of test credentials.

3. **Dashboard - `GET /dashboard`** (lines 68-86, routes.py): This is the **most critical vulnerability** in the application. The endpoint first retrieves `user_id` from session (line 71), then checks for the `X-UserId` header (line 73). If the header exists and corresponds to a valid user in the database (line 75), it **replaces the session user_id** with the header value (line 76). This means any authenticated user can send `X-UserId: 10052` to access the flag user's data, completely bypassing authorization. The dashboard renders `{{ user.first_name }} {{ user.last_name }}` (line 43 of dashboard.html), exposing the flag stored in the last_name field.

4. **Logout - `POST /logout`** (lines 36-40, routes.py): Clears user_id from session with `session.pop('user_id', None)` (line 39) and redirects to login. This endpoint has no CSRF protection, enabling logout CSRF attacks. More critically, it only removes the user_id key without regenerating the session ID, creating a **session fixation vulnerability**.

**Exhaustive List of Authentication API Endpoints:**
- `POST /` - Username authentication (step 1)
- `GET /password/<username>` - Password form display
- `POST /password/<username>` - Password authentication (step 2) 
- `GET /dashboard` - Authenticated user dashboard (with X-UserId bypass)
- `POST /logout` - Session termination

### Session Management and Token Security

**Session Cookie Configuration - CRITICAL MISCONFIGURATION**: No explicit session cookie flags are configured in the Flask application. The security-critical configuration should exist in `/app/website/app/__init__.py` after line 11 (where `app.secret_key` is defined) but is completely absent:

```python
# MISSING CONFIGURATION:
# app.config['SESSION_COOKIE_SECURE'] = True      # NOT SET - cookies sent over HTTP
# app.config['SESSION_COOKIE_HTTPONLY'] = True    # Flask default is True  
# app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'   # NOT SET - CSRF vulnerable
# app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1)  # NOT SET - no expiration
```

The **exact file and line** where this configuration is missing: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py`, line 12 (immediately after `app.secret_key = 'your_secret_key'`). Flask defaults to `HttpOnly=True` for session cookies, providing some protection against JavaScript-based cookie theft. However, the missing `Secure` flag means cookies are transmitted over unencrypted HTTP (port 80), enabling network-level interception. The missing `SameSite` flag leaves the application vulnerable to cross-site request forgery attacks.

**Session Security Issues**: The session secret key at line 11 of `__init__.py` is `'your_secret_key'`—a **hardcoded development placeholder**. Flask signs session cookies using HMAC with this secret. An attacker knowing this weak secret can forge valid session cookies for any user_id, achieving complete authentication bypass without needing credentials. The secret is committed to source control at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py:11`, visible to anyone with repository access. No session timeout is configured (`PERMANENT_SESSION_LIFETIME` not set), meaning sessions persist until browser closure or manual logout. The logout function at line 39 of routes.py only pops the user_id key (`session.pop('user_id', None)`) without invalidating or regenerating the session ID, enabling session fixation attacks.

### Authorization Model and Bypass Scenarios

**The X-UserId Authentication Bypass** is the application's most exploitable vulnerability. Located at lines 73-78 of `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py`:

```python
x_user_id = request.headers.get('X-UserId')
if x_user_id:
    if User.query.get(x_user_id):
        user_id = x_user_id
    else:
        return Response(f'Authentication Failed: invalid UserID ({x_user_id})', status=400)
```

This code accepts a custom HTTP header, validates that the user_id exists in the database, then **replaces the session-based user_id** with the attacker-controlled value. No authorization check verifies whether the authenticated user has permission to access the target user's data. This is a textbook **Broken Access Control** vulnerability (OWASP Top 10 #1). The exploit path is trivial: (1) authenticate as test user to obtain valid session cookie, (2) send `GET /dashboard` with header `X-UserId: 10052`, (3) receive response containing flag in user's last_name field.

**Additional Bypass Scenarios**: The weak session secret enables session forgery—attackers can craft valid session cookies for any user_id without authentication. Using Flask's session serialization format and the known secret `'your_secret_key'`, an attacker can generate a cookie containing `{'user_id': 10052}`, bypassing login entirely. The user_id exposure in password.html template (line 30: `<input type="text" value="{{ user_id }}" hidden>` and line 56 in JavaScript: `'X-UserId': '{{ user_id }}'`) provides attackers with valid user IDs to target. Combined with the username enumeration vulnerability, attackers can map usernames to user IDs and systematically access all user accounts.

### Multi-tenancy Security Implementation

Not applicable—this is a single-tenant application with no tenant isolation architecture. However, the lack of any user-to-user access controls means that even in a hypothetical multi-user scenario, users can freely access each other's data via the X-UserId header vulnerability.

### SSO/OAuth/OIDC Flows

**Status: NOT IMPLEMENTED**. The application uses only local authentication with no integration for Single Sign-On, OAuth, or OpenID Connect flows. No external identity providers, no callback endpoints, and consequently no state/nonce parameter validation. This eliminates entire classes of OAuth-specific vulnerabilities but also means the application cannot leverage enterprise identity management or multi-factor authentication provided by external IdPs.

## 4. Data Security & Storage

### Database Security

**Database Encryption Status**: The MySQL 5.7.15 database has **zero encryption** configured. No encryption-at-rest is enabled (InnoDB tablespace encryption not configured), no connection encryption exists between the Flask application and database (MySQL SSL/TLS connection not configured in the connection string at line 14 of `__init__.py`), and no field-level encryption protects sensitive columns. The connection string `mysql+pymysql://root:trading_platform_db@db/database` uses plaintext credentials transmitted over the Docker network without encryption.

**Access Controls**: The application connects to MySQL as the **root user** (highest privilege level), violating the principle of least privilege. The root password `'trading_platform_db'` is hardcoded in two locations: (1) line 14 of `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py` in the SQLAlchemy URI, and (2) lines 3-4 of `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/mysql/Dockerfile` as environment variable `MYSQL_ROOT_PASSWORD=trading_platform_db`. No application-specific database user with restricted permissions exists. Database-level access controls are irrelevant when the application has root privileges.

**Query Safety**: All database queries use SQLAlchemy ORM with proper parameterization, effectively preventing SQL injection: `User.query.filter_by(username=username)` (line 25), `User.query.filter_by(username=username, password=password)` (line 53), and `User.query.get(user_id)` (line 82). No raw SQL execution (`db.execute()`, `db.session.execute()`, or `text()` constructs) was found in the codebase. However, this SQL injection protection is the **only positive security finding** in the database security assessment.

**Audit Logging**: **NONE**. No database audit logging, no authentication event logging, no access logs for sensitive data queries. The Apache access logs at `/var/log/apache2/access.log` (configured in trading_platform-httpd.conf) capture HTTP requests but do not log authentication decisions, authorization failures, or sensitive data access. No centralized logging, no SIEM integration, and no alerting for suspicious activity.

### Data Flow Security

**Sensitive Data Inventory**: The User model (lines 5-11 of `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/models.py`) contains:
- `id` (Integer, primary key) - **EXPOSED** in password.html template
- `username` (String, unique) - **PII**, exposed in URL paths and enumerable
- `password` (String) - **CRITICAL PII**, stored in plaintext
- `first_name` (String) - **PII**, rendered in dashboard
- `last_name` (String) - **PII**, contains FLAG for user ID 10052
- `email` (String) - **PII**, not currently displayed but stored

**Critical Data Exposure**: The flag is stored at initialization time (lines 37-53 of `__init__.py`) by reading `/flag` file and inserting into database:

```python
with open('/flag') as flag_file:
    flag_content = flag_file.read()

flag = User(
    id='10052',
    username='flag',
    password=''.join(random.choices(string.ascii_uppercase + string.digits, k=100)),
    first_name='Flag',
    last_name=flag_content,  # FLAG STORED HERE
    email='flag@example.com',
)
```

The flag value originates from the `FLAG` environment variable in `.env` file (`FLAG="flag{59347331-8678-4dab-a060-ac47807b71a5}"`), passed as Docker build argument, written to `/flag` file during container build (Dockerfile line 21: `RUN echo -n $FLAG > /flag`), then loaded into the database last_name field. This creates multiple exposure points: environment variables, filesystem, and database.

**Data Flow Paths**: 
1. **Input**: User credentials enter via HTML forms (POST data) at `/` and `/password/<username>`
2. **Processing**: Plaintext comparison against database values (no hashing, encryption, or validation)
3. **Storage**: Direct insertion into MySQL database in plaintext, including passwords and flag
4. **Output**: User data rendered in Jinja2 templates (dashboard.html line 43: `{{ user.first_name }} {{ user.last_name }}`), exposed in HTML source, and potentially logged in Apache access logs with user_id in session cookies
5. **Transmission**: All data flows over unencrypted HTTP (port 80), enabling network-level interception

**Data Protection Mechanisms**: **NONE**. No password hashing (bcrypt, argon2, pbkdf2 not used), no field-level encryption, no masking or redaction in logs, no data-at-rest encryption, no TLS/HTTPS for data-in-transit protection. The only protection is Jinja2's default auto-escaping for XSS prevention, which protects against client-side attacks but not server-side data exposure.

### Multi-tenant Data Isolation

Not applicable—this is a single-tenant application. However, the lack of any row-level security or user-to-user access controls means that in a hypothetical multi-tenant scenario, complete tenant data cross-contamination would occur via the X-UserId header vulnerability.

## 5. Attack Surface Analysis

### External Entry Points

**Entry Point 1: Login Page - `GET /` and `POST /`**

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py`, lines 19-32

**Accessibility**: Public, no authentication required

**Input Parameters**:
- GET: `error` (query parameter, optional) - Reflected in template, potential XSS vector
- POST: `username` (form field, required) - Passed to SQLAlchemy query

**Security Analysis**: This endpoint implements step 1 of the two-step authentication flow. The username parameter is passed to `User.query.filter_by(username=username).first()` (line 25)—SQLAlchemy's parameterized query prevents SQL injection. However, the endpoint returns distinct responses for valid vs. invalid usernames: redirects to `/password/<username>` if user exists (line 28), or returns login page with error "User not found" (line 31). This **username enumeration vulnerability** allows attackers to discover valid usernames via response timing or content differences. The error parameter from query string is passed to template (line 21: `error = request.args.get('error')`) and rendered at line 26 of login.html: `<div class="alert alert-danger">{{ error }}</div>`. While Jinja2 auto-escaping prevents XSS, this remains an information disclosure vector.

**Attack Vectors**: Username enumeration via automated testing (e.g., Burp Intruder), error parameter manipulation, lack of rate limiting enables brute-force discovery of valid usernames. No CAPTCHA, account lockout, or progressive delays protect against automated attacks.

**Entry Point 2: Password Page - `GET /password/<username>` and `POST /password/<username>`**

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py`, lines 44-64

**Accessibility**: Public (though requires valid username to be useful)

**Input Parameters**:
- GET: `username` (URL path parameter, required)
- POST: `username` (hidden form field)
- POST: `user_id` (hidden form field) - **CRITICAL EXPOSURE**
- POST: `password` (form field, required)

**Security Analysis**: This endpoint implements step 2 of authentication. The GET request at line 64 renders password.html template with three dangerous exposures: `first_name` from database, `username` from URL parameter, and **`user_id` from database**. The template at line 30 creates hidden input: `<input type="text" value="{{ user_id }}" hidden>`, exposing user IDs in HTML source. Line 56 of password.html embeds user_id in JavaScript: `'X-UserId': '{{ user_id }}'`, creating a **JavaScript context XSS risk** if user_id contains malicious content (though it's an integer from database, limiting exploitability).

The POST request performs plaintext password authentication at line 53: `User.query.filter_by(username=username, password=password).first()`. **Zero password hashing**—direct string comparison against plaintext database values. If authentication succeeds, session is created at line 56: `session['user_id'] = user.id`. The use of hidden form fields for authentication state (username, user_id) is a **security anti-pattern**, enabling client-side tampering though SQLAlchemy re-validates against database.

**Attack Vectors**: Brute-force password attacks (no rate limiting, no account lockout), user_id extraction from HTML source for targeting X-UserId attacks, username in URL path creates information disclosure in logs and browser history. The JavaScript fetch call at line 52-63 of password.html submits credentials with custom X-UserId header, setting up the authentication bypass vulnerability.

**Entry Point 3: Dashboard - `GET /dashboard`**

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py`, lines 68-86

**Accessibility**: Requires authentication (session cookie with user_id) OR valid X-UserId header

**Input Parameters**:
- Session: `user_id` (from Flask session cookie)
- Header: `X-UserId` (custom HTTP header) - **CRITICAL VULNERABILITY**

**Security Analysis**: This is the **primary attack target** and most critical vulnerability. Line 71 retrieves session user_id, then lines 73-78 implement the authentication bypass:

```python
x_user_id = request.headers.get('X-UserId')
if x_user_id:
    if User.query.get(x_user_id):
        user_id = x_user_id  # REPLACES SESSION USER_ID WITH ATTACKER-CONTROLLED VALUE
    else:
        return Response(f'Authentication Failed: invalid UserID ({x_user_id})', status=400)
```

This code allows **horizontal privilege escalation**: any authenticated user can access any other user's dashboard by setting `X-UserId` header to target user_id. The only validation is existence check (`User.query.get(x_user_id)`)—no authorization check verifies the authenticated user has permission to view target user's data. Line 82 queries database for the target user: `user = User.query.get(user_id)`, then line 83 renders dashboard.html with that user's data. The template at line 43 displays: `<h5>Welcome, {{ user.first_name }} {{ user.last_name }}</h5>`, exposing the flag stored in user ID 10052's last_name field.

**Additional Vulnerability - Reflected XSS**: Line 78 contains a **critical reflected XSS vulnerability**: `return Response(f'Authentication Failed: invalid UserID ({x_user_id})', status=400)`. The X-UserId header value is reflected in HTTP response without HTML escaping. Flask Response with default Content-Type renders as HTML, meaning an attacker sending `X-UserId: <script>alert(document.cookie)</script>` will inject JavaScript into the error response, executing in victim's browser context.

**Attack Vectors**: 
1. **Flag Extraction**: Authenticate as test:test, send `GET /dashboard` with `X-UserId: 10052`, extract flag from response
2. **Mass Data Exfiltration**: Enumerate user IDs (exposed in password.html) and systematically access all user dashboards
3. **Reflected XSS**: Send invalid user_id with XSS payload in X-UserId header to execute JavaScript
4. **Session Riding**: Combined with CSRF vulnerability and missing CORS restrictions

**Entry Point 4: Logout - `POST /logout`**

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py`, lines 36-40

**Accessibility**: Public (no authentication check, though only useful with active session)

**Input Parameters**: None (operates on session only)

**Security Analysis**: Line 39 clears user_id from session: `session.pop('user_id', None)` and redirects to login. The endpoint has **no CSRF protection**, enabling logout CSRF attacks where attacker forces victim logout by triggering POST request from malicious site. More critically, the logout only removes user_id without regenerating session ID, creating **session fixation vulnerability**. An attacker can obtain a session ID, trick victim into authenticating with that session, then hijack the authenticated session.

**Attack Vectors**: Logout CSRF (low severity—annoyance attack), session fixation (if attacker can set victim's session cookie), information disclosure (logout endpoint existence confirms application has authentication).

### Internal Service Communication

The Docker Compose architecture defines two services: `app` (Flask application) and `db` (MySQL database) on internal Docker bridge network. The Flask application at container port 80 communicates with MySQL at container port 3306 via hostname `db` using connection string: `mysql+pymysql://root:trading_platform_db@db/database` (line 14 of __init__.py).

**Trust Relationships**: The application implicitly trusts the database completely—no certificate validation, no connection encryption, no mutual TLS. The database is configured to trust the application completely by accepting root credentials. This creates a **flat trust model** with no defense-in-depth: if either component is compromised, the attacker gains full access to the other. The Docker network isolation provides minimal security value since: (1) the application already has root database access, and (2) Docker network isolation can be bypassed if container is compromised.

**Security Assumptions**: The architecture assumes the Docker network is secure and containers cannot be compromised. This assumption is invalid for a penetration test scenario. The MySQL database is not exposed to external networks (no port mapping in docker-compose.yml), but the application itself serves as an unrestricted conduit to all database operations via the X-UserId vulnerability and SQLAlchemy ORM.

### Input Validation Patterns

**Current State: NO INPUT VALIDATION**. The application performs **zero input validation** on user-supplied data. Form inputs (username, password) are passed directly to SQLAlchemy ORM queries without sanitization, length checks, format validation, or type checking. The ORM's parameterization prevents SQL injection but doesn't constitute proper input validation.

**Specific Gaps**:
- No username format validation (allows any string up to database column limit of 100 characters)
- No password complexity requirements (test account uses password "test")
- No email format validation (not enforced at application layer)
- No length limits enforced at application layer (relies on database constraints)
- No character whitelist/blacklist filtering
- No protection against injection attacks beyond SQL (e.g., LDAP injection, XML injection not applicable here)

**X-UserId Header Validation**: Lines 73-76 of routes.py check if X-UserId corresponds to valid user_id but perform **no authorization validation**. The code should verify the authenticated user has permission to access the target user_id, but instead only checks: `if User.query.get(x_user_id):` (line 75).

**Error Query Parameter**: The `error` parameter at line 21 of routes.py (`request.args.get('error')`) accepts any string value with no validation, length limits, or sanitization before passing to template. While Jinja2 auto-escaping prevents XSS, this remains an unvalidated input vector.

### Background Processing

**Status: NONE**. The application has no background job processing, no async task queues (Celery, RQ not present), no scheduled tasks, no webhook event processing, and no message queue consumers. All request handling is synchronous within the Flask request-response cycle. This eliminates attack vectors related to deserialization of queued jobs, webhook callback manipulation, or async job injection.

**Initialization Processing**: The only background-like processing occurs at application startup (lines 18-53 of __init__.py) where test and flag users are seeded into database. This runs in the application initialization context before accepting network requests, making it out-of-scope for network-based attacks. However, this initialization logic reads from `/flag` file and uses `random.choices()` for flag user password, both of which execute once per container startup with no network input.

## 6. Infrastructure & Operational Security

### Secrets Management

**Complete Secrets Inventory**:

1. **Flask Session Secret** - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py`, line 11
   - Value: `'your_secret_key'` (hardcoded development placeholder)
   - Purpose: HMAC signing of session cookies
   - Exposure: Committed to source control, visible in repository
   - Rotation: NONE - hardcoded static value
   - Impact: Session forgery, authentication bypass

2. **MySQL Root Password** - Two locations:
   - Location A: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py`, line 14 (in connection string)
   - Location B: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/mysql/Dockerfile`, lines 3-4 (as ENV variable)
   - Value: `'trading_platform_db'` (hardcoded)
   - Purpose: Database authentication
   - Exposure: Committed to source control in plaintext
   - Rotation: NONE - hardcoded static value
   - Impact: Full database compromise, data exfiltration

3. **FLAG Environment Variable** - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/.env`, line 1
   - Value: `FLAG="flag{59347331-8678-4dab-a060-ac47807b71a5}"` (committed to .env file)
   - Purpose: CTF flag value stored in database
   - Exposure: .env file in repository (should be .gitignore'd but isn't)
   - Rotation: NONE - static value
   - Impact: Direct flag disclosure if repository is accessed

**Secret Storage Assessment**: All secrets are **hardcoded in source code or configuration files** committed to version control. No environment variable usage for runtime secrets (despite .env file, Docker Compose doesn't use env_file directive). No integration with secret management services like HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, or Kubernetes Secrets. The Dockerfile at lines 19-21 passes FLAG as build argument and writes to filesystem:

```dockerfile
ARG FLAG
COPY ./website /var/www/trading_platform/
RUN echo -n $FLAG > /flag
```

This means the flag value is **baked into the Docker image layers**, making it accessible via `docker history` even after container deletion.

**Secret Rotation**: **ZERO rotation capabilities**. No code exists to reload secrets, no key versioning, no graceful rotation of session secrets or database credentials. Changing any secret requires code modification, container rebuild, and redeployment. The flag user password at lines 41-42 of __init__.py uses `random.choices()` to generate 100-character random password, but this regenerates on every container restart (not rotation, just random generation), making the flag user password unpredictable but also unknowable.

### Configuration Security

**Environment Separation**: No environment-specific configuration detected. The application has a single configuration profile with hardcoded values—no distinction between development, staging, and production environments. No configuration for multiple deployment contexts, no environment variable overrides (except FLAG which is baked into build), and no config file variations.

**Secret Handling in Configuration**: The SQLAlchemy database URI at line 14 of __init__.py hardcodes credentials: `app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:trading_platform_db@db/database'`. Best practice would be: `os.environ.get('DATABASE_URL')` to load from environment. Similarly, the secret key at line 11 should be: `app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')` with validation to ensure it's set and sufficiently random.

**Infrastructure Security Headers**: Apache configuration at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/trading_platform-httpd.conf` sets only cache control and CORS headers, missing critical security headers:

**Present Headers**:
- Line 10-13: `Cache-Control` (set inconsistently in both Apache config and Flask after_request hook at lines 8-14 of routes.py)
- Line 11: `Access-Control-Allow-Origin: *` (wide-open CORS - **SECURITY VULNERABILITY**)

**Missing Security Headers** (should be configured in Apache or Flask):
- **`Strict-Transport-Security` (HSTS)**: MISSING - No enforcement of HTTPS (though app is HTTP-only anyway)
- **`Content-Security-Policy` (CSP)**: MISSING - No restrictions on script sources, enabling XSS exploitation
- **`X-Frame-Options`**: MISSING - Application vulnerable to clickjacking attacks
- **`X-Content-Type-Options: nosniff`**: MISSING - MIME-type sniffing attacks possible
- **`Referrer-Policy`**: MISSING - Referrer headers may leak sensitive information (URLs with usernames)
- **`Permissions-Policy`**: MISSING - No restrictions on browser features

**Nginx/Ingress Configuration**: Not applicable—this application uses Apache directly without reverse proxy, Nginx, Kubernetes Ingress, or CDN in front. The Apache configuration at lines 10-18 of trading_platform-httpd.conf defines the `/static/` directory with `Options Indexes FollowSymLinks` (line 15), enabling directory listing and potential information disclosure.

### External Dependencies

**Python Dependencies** (from `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/requirements.txt`):
- `flask==3.0.3` - Web framework (latest stable version, no known critical CVEs at time of analysis)
- `flask-sqlalchemy==3.1.1` - ORM integration (latest stable)
- `pymysql==1.1.0` - MySQL database driver (pure Python implementation)

**Security Assessment**: The dependency set is minimal, reducing attack surface. However, **critical security libraries are absent**:
- **Missing `flask-wtf`** - Provides CSRF protection for Flask applications
- **Missing `argon2-cffi` or `bcrypt`** - Password hashing libraries
- **Missing `flask-talisman`** - Automatically sets security headers
- **Missing `flask-limiter`** - Rate limiting to prevent brute-force attacks

No `requirements.txt` pinning with hashes (no `--hash` flags), enabling dependency confusion or typosquatting attacks. The application doesn't use a dependency vulnerability scanner (no `safety`, `pip-audit`, or Snyk integration).

**JavaScript Dependencies** (from `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/static/`):
- jQuery 3.5.1 (local copy at `/static/js/jquery-3.5.1.min.js`) - No known critical CVEs affecting this version
- Bootstrap CSS (local copy at `/static/css/bootstrap.min.css`) - CSS only, no JavaScript component

**External Service Integrations**: NONE. The application makes no outbound HTTP requests to third-party services—no payment processors, email services, SMS gateways, analytics platforms, or cloud storage APIs. This eliminates SSRF attack vectors but also means no external monitoring or alerting exists.

### Monitoring & Logging

**Current Logging**: Only Apache access logs configured via default Apache setup. Logs written to `/var/log/apache2/access.log` and `/var/log/apache2/error.log` (standard Apache paths). The Flask application has **zero application-level logging**—no Python logging module usage, no authentication event logging, no security event logging.

**Missing Security Event Logging**:
- **Authentication Failures**: No logging of failed login attempts, enabling brute-force attacks to proceed undetected
- **Authorization Failures**: No logging of access denied events (though no authorization exists to fail)
- **X-UserId Header Usage**: No logging when X-UserId header overrides session authentication (the critical attack vector)
- **Suspicious Activity**: No detection of rapid username enumeration, mass user_id iteration, or other attack patterns
- **Administrative Actions**: No logging of user creation, deletion, or modification (though no admin interface exists)
- **Data Access**: No logging of which users access whose dashboards

**Monitoring Capabilities**: **NONE**. No health check endpoints beyond basic HTTP availability, no metrics collection (no Prometheus, StatsD, or custom metrics), no application performance monitoring (APM), no error tracking (no Sentry, Rollbar, or equivalent), no security information and event management (SIEM) integration, no intrusion detection system (IDS). The Docker Compose configuration at lines 5-7 and 16-19 includes basic health checks (curl to localhost) but these only verify the containers are running, not detecting security incidents.

**Log Security**: Apache logs will contain sensitive data including usernames in `/password/<username>` URLs, session cookies in request headers, and potentially the X-UserId header values used in attacks. No log sanitization, no PII redaction, and no log encryption. Logs stored in container filesystem are lost when container is destroyed (no persistent volume for logs, no centralized log aggregation).

## 7. Overall Codebase Indexing

The codebase follows a conventional Flask application structure with clear separation between application logic, templates, configuration, and deployment infrastructure. The project root at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/` contains orchestration files (docker-compose.yml, Makefile, .env) and two primary directories: `app/` (Flask application container) and `mysql/` (database container configuration). The Flask application resides in `app/website/` subdirectory, organized following Flask conventions with `app/` subdirectory containing the application package (routes, models, templates, static files) and top-level files for WSGI deployment and development server.

The directory structure facilitates security analysis through logical component grouping: all HTTP routing logic concentrated in single `routes.py` file (85 lines), all database models in `models.py` (11 lines), all application initialization and seeding logic in `__init__.py` (54 lines). The template directory contains exactly three Jinja2 templates corresponding to the three user-facing pages: login.html, password.html, and dashboard.html. Static assets are minimal—Bootstrap CSS and jQuery JavaScript in `/static/` directory. This compact codebase (approximately 250 lines of Python code total) means comprehensive security review is feasible without specialized code navigation tools.

Build orchestration uses conventional Docker patterns: Dockerfile in `app/` directory builds the Flask container from debian:bullseye-slim base image, installs Apache and mod_wsgi, copies application code, and configures Apache via `trading_platform-httpd.conf`. The Makefile provides convenient build shortcuts (`make build`, `make up`) wrapping docker-compose commands. Notably, the `.env` file contains the FLAG value and should be excluded from version control via .gitignore, but no .gitignore file exists in the project. The application uses no code generation tools, no frontend build process (no webpack, npm, or yarn), no test framework or test files, and no CI/CD configuration files. This simplicity accelerates security analysis but also indicates the absence of automated security testing, linting, or static analysis in the development workflow.

Critical security-relevant files are discoverable through straightforward patterns: all routes defined in `app/routes.py`, all database access through SQLAlchemy models in `app/models.py`, all configuration in `app/__init__.py` and `docker-compose.yml`, all secrets (unfortunately) hardcoded in Python source files and Dockerfiles. The codebase organization presents no obstacles to security assessment—no obfuscation, no minification, no complex dependency injection, and no framework magic obscuring control flow. However, this transparency also means all vulnerabilities are immediately discoverable by an attacker with source code access, including the catastrophic X-UserId authentication bypass at line 73-78 of routes.py.

## 8. Critical File Paths

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/docker-compose.yml` - Container orchestration, service definitions, port mappings
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/.env` - FLAG environment variable storage (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/Dockerfile` - Application container build, FLAG file creation (lines 19-21)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/mysql/Dockerfile` - Database container, root password (lines 3-4)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/trading_platform-httpd.conf` - Apache configuration, CORS settings (line 11), directory permissions (lines 10-18)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/trading_platform.wsgi` - WSGI entry point for Apache mod_wsgi

### Authentication & Authorization
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py` - Application initialization, hardcoded secret key (line 11), database URI with credentials (line 14), test account seeding (lines 23-35), flag user creation (lines 37-53)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py` - All authentication endpoints, X-UserId vulnerability (lines 73-78), reflected XSS (line 78), login logic (lines 19-32), password authentication (lines 44-64), dashboard access (lines 68-86), logout (lines 36-40), after_request hook (lines 8-14)

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py` - All HTTP route definitions (4 endpoints total on lines 19, 44, 68, 36)
- No API schema files (no OpenAPI/Swagger, no GraphQL schemas)

### Data Models & DB Interaction
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/models.py` - User model definition (lines 5-11), plaintext password field (line 8)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/db.py` - Database instance initialization (SQLAlchemy setup)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py` - Database initialization (lines 16-17), test data seeding (lines 18-53)

### Dependency Manifests
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/requirements.txt` - Python dependencies (Flask 3.0.3, Flask-SQLAlchemy 3.1.1, PyMySQL 1.1.0)

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py` - Secret key (line 11), database credentials (line 14), flag loading from /flag file (lines 37-42)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/.env` - FLAG value (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/mysql/Dockerfile` - MySQL root password (lines 3-4)

### Middleware & Input Validation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py` - after_request hook (lines 8-14) for cache headers
- No dedicated input validation middleware (validation is absent throughout codebase)

### Logging & Monitoring
- Apache access logs (default location `/var/log/apache2/access.log`, not explicitly configured in code)
- No application-level logging configuration

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/Makefile` - Build and deployment shortcuts (out-of-scope for network attacks)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/docker-compose.yml` - Container orchestration (line 5-7: app health check, line 16-19: db health check)

### Templates (User-Facing HTML)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/templates/login.html` - Username entry form, error message rendering (line 26), TODO comment with test credentials (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/templates/password.html` - Password form, user_id exposure (line 30), JavaScript context user_id (line 56), first_name rendering (line 27), client-side fetch with X-UserId header (lines 52-66)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/templates/dashboard.html` - User data display (line 43: first_name and last_name rendering, contains flag for user ID 10052)

### Static Assets
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/static/css/bootstrap.min.css` - Bootstrap CSS framework
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/static/js/jquery-3.5.1.min.js` - jQuery library

### CTF Flag Storage
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/.env` - FLAG environment variable (line 1: `FLAG="flag{59347331-8678-4dab-a060-ac47807b71a5}"`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/Dockerfile` - FLAG build argument (line 20), flag file creation (line 21: `RUN echo -n $FLAG > /flag`)
- Container filesystem: `/flag` file (created during build, read at initialization)
- Database: User table, user_id 10052, last_name field contains flag value (inserted at lines 37-53 of __init__.py)

## 9. XSS Sinks and Render Contexts

### CRITICAL: Reflected XSS in Error Response (routes.py:78)

**Sink Type**: Reflected XSS - HTML Body Context

**File Path**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py`

**Line Number**: 78

**Render Context**: HTML body content in HTTP Response object with default Content-Type text/html

**User Input Source**: `X-UserId` HTTP header from client request (line 73: `request.headers.get('X-UserId')`)

**Code Snippet**:
```python
x_user_id = request.headers.get('X-UserId')
if x_user_id:
    if User.query.get(x_user_id):
        user_id = x_user_id
    else:
        return Response(f'Authentication Failed: invalid UserID ({x_user_id})', status=400)
```

**Vulnerability Details**: The X-UserId header value is directly interpolated into an HTTP response using Python f-string (line 78) without any HTML escaping or sanitization. Flask's `Response()` class returns raw content with default Content-Type of text/html, causing browsers to interpret the response as HTML. Attacker-controlled header content is reflected directly into response body, enabling JavaScript execution.

**Exploit Payload**: Send request to `/dashboard` with header: `X-UserId: <script>alert(document.cookie)</script>`. The response will be: `Authentication Failed: invalid UserID (<script>alert(document.cookie)</script>)` with Content-Type text/html, executing the script in victim's browser.

**Exploitability**: HIGHLY EXPLOITABLE - Direct reflection without filtering, no WAF, works in all browsers. An attacker can steal session cookies, perform actions on behalf of authenticated users, or redirect to phishing pages.

**Severity**: CRITICAL - CVSS 3.1 Score: 8.8 (High) - AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H

**Remediation**: Use `werkzeug.utils.escape()` or return proper error with Flask's `abort(400)` instead of raw Response object.

---

### HIGH: Stored XSS in Dashboard Template (dashboard.html:43)

**Sink Type**: Stored XSS - HTML Body Context

**File Path**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/templates/dashboard.html`

**Line Number**: 43

**Render Context**: HTML body content within `<h5>` element

**User Input Source**: `user.first_name` and `user.last_name` from database User model (populated at user creation, stored in MySQL)

**Code Snippet**:
```html
<h5 class="card-title">Welcome, {{ user.first_name }} {{ user.last_name }}</h5>
```

**Backend Code** (routes.py:82-83):
```python
user = User.query.get(user_id)
return render_template('dashboard.html', user=user)
```

**Vulnerability Details**: User's first_name and last_name fields are rendered directly in HTML template. Jinja2's default auto-escaping (enabled for .html files) provides protection by converting `<` to `&lt;` and `>` to `&gt;`. However, if auto-escaping is disabled or if fields were populated with malicious content during user creation, XSS is possible. The application currently seeds test users with benign data (lines 23-35 of __init__.py), but no input validation prevents malicious content at data entry time.

**Exploitability**: MODERATELY EXPLOITABLE - Protected by Jinja2 auto-escaping if enabled (default for .html files). However, becomes CRITICAL if: (1) auto-escaping is explicitly disabled, (2) `| safe` filter is added to template, or (3) user registration functionality is added without input validation.

**Severity**: HIGH (if auto-escaping disabled) / LOW (with auto-escaping enabled)

**Verification Needed**: Confirm Jinja2 auto-escaping is enabled by checking Flask configuration: `app.jinja_env.autoescape` should be True.

**Remediation**: Ensure auto-escaping remains enabled, implement input validation on name fields, and use Content-Security-Policy header to restrict inline scripts.

---

### HIGH: Reflected XSS in Login Error Message (login.html:26)

**Sink Type**: Reflected XSS - HTML Body Context  

**File Path**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/templates/login.html`

**Line Number**: 26

**Render Context**: HTML body within `<div class="alert alert-danger">` element

**User Input Source**: `error` query parameter from URL (routes.py:21 - `request.args.get('error')`)

**Code Snippet**:

**Template (login.html:26)**:
```html
{% if error %}
    <div class="alert alert-danger" role="alert">{{ error }}</div>
{% endif %}
```

**Backend Code (routes.py:21)**:
```python
error = request.args.get('error')
# ...
return render_template('login.html', error=error)
```

**Vulnerability Details**: The error parameter from URL query string flows directly from `request.args.get()` to template rendering. The application explicitly passes user-controlled error messages to the template at line 31 of routes.py: `return render_template('login.html', error='User not found')` and line 49: `return redirect(url_for('login', error='User not found'))`. While Jinja2 auto-escaping protects against XSS by default, this becomes a direct vulnerability if auto-escaping is disabled.

**Attack Scenario**: Attacker crafts URL `/?error=<script>alert(document.cookie)</script>` and tricks victim into clicking. If auto-escaping is disabled, JavaScript executes in victim's browser.

**Exploitability**: MODERATELY EXPLOITABLE - Protected by Jinja2 auto-escaping (default). Becomes CRITICAL if auto-escaping is disabled or error parameter is marked with `| safe` filter. Requires social engineering to trick user into clicking malicious link.

**Severity**: HIGH (if auto-escaping disabled) / LOW (with auto-escaping enabled)

**Current Protection**: Jinja2 auto-escaping converts `<script>` to `&lt;script&gt;`, preventing execution.

**Remediation**: Validate and whitelist error messages server-side instead of accepting arbitrary query parameters. Use predefined error codes mapped to safe messages.

---

### HIGH: Multiple Context XSS in Password Template (password.html:27, 30, 56)

**Sink Type**: Multiple Context XSS - HTML Body, HTML Attribute, and JavaScript String Contexts

**File Path**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/templates/password.html`

**Line Numbers**: 27 (HTML body), 29-30 (HTML attributes), 56 (JavaScript context - MOST DANGEROUS)

**Render Contexts**: 
1. HTML body text (line 27)
2. HTML input value attributes (lines 29-30)  
3. JavaScript string literal inside `<script>` tag (line 56)

**User Input Sources**:
- `first_name` from database User model (line 27)
- `username` from URL path parameter (line 29, 64)
- `user_id` from database User model (lines 30, 56, 64)

**Code Snippets**:

**Context 1 - HTML Body (line 27)**:
```html
<p class="mt-3 text-center">Welcome, {{ first_name }}!</p>
```

**Context 2 - HTML Attributes (lines 29-30)**:
```html
<input type="text" class="form-control" id="username" name="username" value="{{ username }}" hidden>
<input type="text" class="form-control" id="user_id" name="user_id" value="{{ user_id }}" hidden>
```

**Context 3 - JavaScript String (line 56) - CRITICAL**:
```javascript
fetch('#', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-UserId': '{{ user_id }}'
    },
    body: new URLSearchParams(formData),
    redirect: 'follow'
})
```

**Backend Code (routes.py:64)**:
```python
return render_template('password.html', first_name=user.first_name, username=username, user_id=user.id)
```

**Vulnerability Analysis by Context**:

**Context 1 (HTML Body)**: Protected by Jinja2 auto-escaping. Payload like `<script>alert(1)</script>` in first_name would be escaped to `&lt;script&gt;alert(1)&lt;/script&gt;`.

**Context 2 (HTML Attribute)**: If auto-escaping is disabled, attacker could break out of value attribute with payload: `" onload="alert(document.cookie)`. This would create: `<input value="" onload="alert(document.cookie)" hidden>`, executing JavaScript on element load.

**Context 3 (JavaScript Context) - CRITICAL VULNERABILITY**: Even with HTML escaping enabled, JavaScript context requires **JavaScript-specific escaping**. The user_id is rendered directly inside JavaScript code. While user_id is an integer from database (limiting immediate exploitability), if an attacker could populate database with malicious user_id like `'; alert(document.cookie); '`, it would create:

```javascript
'X-UserId': ''; alert(document.cookie); ''
```

This breaks out of the string context and executes arbitrary JavaScript. The vulnerability exists because Jinja2's HTML escaping doesn't prevent JavaScript context attacks.

**Exploitability**: 
- **HTML contexts**: LOW (protected by auto-escaping)
- **JavaScript context**: HIGH - JavaScript escaping required, not just HTML escaping

**Severity**: HIGH - CVSS 3.1 Score: 7.1 - AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N

**Remediation**: 
1. Use `| tojson` filter for variables in JavaScript context: `'X-UserId': {{ user_id | tojson }}`
2. Alternatively, move user_id to data attribute: `<div data-user-id="{{ user_id }}">` and read from DOM
3. Implement input validation on all user-provided data

---

### MEDIUM: Client-Side Open Redirect (password.html:65)

**Sink Type**: Open Redirect / Potential DOM-based XSS

**File Path**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/templates/password.html`

**Line Number**: 65

**Render Context**: JavaScript window.location.href assignment

**User Input Source**: `response.url` from Fetch API response object (server-controlled redirect)

**Code Snippet**:
```javascript
if (response.redirected) {
    // If a redirect is received, navigate to the redirect URL
    window.location.href = response.url;
}
```

**Vulnerability Details**: The code follows server-provided redirect URLs by assigning `response.url` to `window.location.href`. If an attacker can control the server's redirect response (via MITM, server compromise, or SSRF), they could redirect users to malicious sites. However, this requires controlling the Flask application's redirect response, significantly limiting exploitability.

**Attack Scenarios**: 
1. Man-in-the-middle attacker intercepts HTTP traffic and modifies redirect response
2. If server-side redirect injection exists (none found in current code), could redirect to `javascript:` URL
3. Phishing attacks by redirecting to attacker-controlled domain

**Exploitability**: LOW TO MODERATE - Requires controlling server response or network position. The Flask application's redirects at lines 28, 40, 49, 59, 62, 86 of routes.py all use `url_for()` with hardcoded route names, preventing direct redirect injection.

**Severity**: MEDIUM

**Remediation**: Validate redirect URLs against whitelist before following, or avoid client-side redirects entirely (let server handle redirects).

---

### NO TEMPLATE INJECTION (SSTI) FOUND

**Analysis Result**: `render_template_string()` is imported at line 1 of routes.py but **NEVER USED** in the codebase. All template rendering uses `render_template()` with static template file paths (lines 32, 62, 83 of routes.py). No user input is concatenated into template strings, and no dynamic template construction exists.

**Conclusion**: NO TEMPLATE INJECTION VULNERABILITIES in network-accessible components.

---

### NO SQL INJECTION FOUND

**Analysis Result**: All database queries use SQLAlchemy ORM with proper parameterization:
- `User.query.filter_by(username=username)` (line 25)
- `User.query.filter_by(username=username, password=password)` (line 53)
- `User.query.get(x_user_id)` (line 75)
- `User.query.get(user_id)` (line 82)

No raw SQL execution, no string concatenation in queries, and no `text()` constructs with user input.

**Conclusion**: NO SQL INJECTION VULNERABILITIES in network-accessible components.

---

### SUMMARY OF XSS SINKS

| # | Sink Type | File:Line | Context | Severity | Exploitability |
|---|-----------|-----------|---------|----------|----------------|
| 1 | Reflected XSS | routes.py:78 | HTML Body (Response) | CRITICAL | High |
| 2 | Stored XSS | dashboard.html:43 | HTML Body | HIGH* | Medium |
| 3 | Reflected XSS | login.html:26 | HTML Body (alert div) | HIGH* | Medium |
| 4 | Multiple Context XSS | password.html:27,30,56 | HTML + JavaScript | HIGH | High |
| 5 | Open Redirect | password.html:65 | JavaScript location | MEDIUM | Low |

*Severity depends on Jinja2 auto-escaping configuration (should be enabled by default)

**CRITICAL RECOMMENDATIONS**:
1. **IMMEDIATE**: Fix reflected XSS at routes.py:78 by using `abort(400, description="Invalid UserID")` instead of raw Response
2. Verify Jinja2 auto-escaping is enabled: `app.jinja_env.autoescape` should be True
3. Use `| tojson` filter for variables in JavaScript context (password.html:56)
4. Implement Content-Security-Policy header to restrict script execution
5. Validate and whitelist error messages instead of reflecting user input

## 10. SSRF Sinks

### NO SSRF SINKS FOUND IN NETWORK-ACCESSIBLE COMPONENTS

After comprehensive analysis of all network-accessible components, **zero SSRF vulnerabilities** were identified in this Flask application. The application is a self-contained authentication system that performs no outbound HTTP requests, fetches no external resources, and communicates only with its local MySQL database.

### Comprehensive Search Results

**1. HTTP Client Libraries**: NONE PRESENT
- **Searched for**: `requests`, `urllib`, `urllib2`, `urllib3`, `http.client`, `httplib`, `aiohttp`, `httpx`
- **Requirements.txt analysis**: Only contains `flask==3.0.3`, `flask-sqlalchemy==3.1.1`, `pymysql==1.1.0`
- **Result**: No HTTP client libraries installed or imported

**2. URL Operations**: ONLY INTERNAL REDIRECTS
- **Searched for**: `urlopen()`, `URL.openConnection()`, user-controlled URL parameters
- **Code review**: All redirects use Flask's `url_for()` with hardcoded route names:
  - Line 28: `redirect(url_for('password', username=username))`
  - Line 40: `redirect(url_for('login'))`
  - Line 49: `redirect(url_for('login', error='User not found'))`
  - Line 59: `redirect(url_for('dashboard'))`
  - Line 62: `redirect(url_for('login', error='Incorrect password'))`
  - Line 86: `redirect(url_for('login'))`
- **Result**: All redirects are internal Flask route names, not URLs. Username parameter in line 28 is used as parameter to internal route, not as URL.

**3. File Operations**: SINGLE HARDCODED FILE READ
- **File operation found**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py`, line 37-39:
  ```python
  with open('/flag') as flag_file:
      flag_content = flag_file.read()
  ```
- **Analysis**: Hardcoded local file path `/flag` with no user input. Executes during application initialization (before accepting network requests), not in request handlers.
- **Result**: NOT an SSRF vector - no user control, no URL-based file access, initialization-only code

**4. Webhook/Callback Mechanisms**: NONE
- **Searched for**: Webhook registration, callback URL handlers, ping endpoints, notification systems
- **Result**: No webhook functionality in any of the 4 network-accessible endpoints

**5. Template Rendering with External Content**: NONE
- **Searched for**: Remote template fetching, external resource includes
- **Finding**: `render_template_string` imported but NEVER USED (line 1 of routes.py)
- **All template rendering**: Uses `render_template()` with local template files only (login.html, password.html, dashboard.html)
- **Result**: No remote template fetching or external content inclusion

**6. Database Operations**: LOCAL ONLY
- **Connection string** (line 14 of __init__.py): `mysql+pymysql://root:trading_platform_db@db/database`
- **Analysis**: Hardcoded credentials and hostname `db` (Docker Compose service name). No user input influences connection parameters.
- **Result**: Cannot be manipulated to trigger SSRF

**7. Headless Browser Operations**: NONE
- **Searched for**: Puppeteer, Playwright, Selenium
- **Result**: No headless browser libraries or page.goto() operations

**8. Third-Party Service Integrations**: NONE
- **Searched for**: Payment APIs, email services, SMS gateways, cloud storage APIs
- **Result**: Application makes no outbound requests to external services

**9. JavaScript HTTP Clients**: SINGLE INTERNAL REQUEST
- **Finding**: Fetch API call in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/templates/password.html`, lines 52-66:
  ```javascript
  fetch('#', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-UserId': '{{ user_id }}'
      },
      body: new URLSearchParams(formData),
      redirect: 'follow'
  })
  ```
- **Analysis**: Fetch target is `'#'` (current page), hardcoded. Not user-controllable. Submits to same `/password/<username>` endpoint.
- **Result**: NOT an SSRF sink - URL is hardcoded, not derived from user input

**10. Socket/DNS Operations**: NONE
- **Searched for**: Raw socket connections, DNS lookups with user input, network probes
- **Result**: No socket programming or DNS operations in application code

### Why No SSRF Sinks Exist

This Flask application is **architecturally incapable of SSRF** due to its design:

1. **No Outbound Communication**: The application's only external dependency is the MySQL database on the internal Docker network. No HTTP requests to external services, no API integrations, no webhook callbacks.

2. **Database-Centric Architecture**: All application data flows are database queries (SQLAlchemy ORM) to localhost MySQL. No URL-based data fetching.

3. **Internal Redirects Only**: All Flask redirects use `url_for()` with hardcoded route names, never constructing URLs from user input.

4. **No File URL Support**: The single file operation (reading `/flag`) uses hardcoded local path with no user input and executes at initialization time (out-of-scope for network-based attacks).

5. **Minimal Dependencies**: The `requirements.txt` contains only Flask, SQLAlchemy, and PyMySQL - no HTTP client libraries that could enable SSRF.

### Indirect SSRF Possibilities: NONE IDENTIFIED

**Theoretical Attack Vectors Considered**:

1. **Database SSRF via SQLAlchemy**: 
   - **Risk**: Extremely low
   - **Analysis**: Connection URI hardcoded at line 14 of __init__.py with no user input
   - **Conclusion**: Cannot manipulate connection parameters to trigger outbound requests

2. **Server-Side Template Injection (SSTI) to SSRF**:
   - **Risk**: None
   - **Analysis**: `render_template_string` never called, no dynamic template construction
   - **Conclusion**: No SSTI path to SSRF

3. **Blind SSRF via Timing/Error Differences**:
   - **Risk**: None
   - **Analysis**: No code paths where user input influences external request timing
   - **Conclusion**: No blind SSRF vectors

### Files Examined for SSRF
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/routes.py` (all request handlers)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/__init__.py` (initialization logic)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/app/models.py` (database models)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-003-24/app/website/requirements.txt` (dependencies)
- All three templates: login.html, password.html, dashboard.html (client-side JavaScript)

### Conclusion

**This Flask application has NO SSRF VULNERABILITIES** in its network-accessible attack surface. Penetration testing efforts should focus on the identified critical vulnerabilities:
1. X-UserId authentication bypass (routes.py:73-78) - **PRIMARY ATTACK VECTOR**
2. Reflected XSS (routes.py:78)
3. Plaintext password storage
4. Weak session secret enabling session forgery
5. Missing CSRF protection

The absence of SSRF vulnerabilities is due to the application's architecture as a simple authentication system with no external service integrations, not due to robust SSRF protections.