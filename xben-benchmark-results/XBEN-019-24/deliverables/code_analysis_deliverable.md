# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported meet the "In-Scope" criteria verified through source code analysis.

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

This is a **Flask-based web application (XBEN-019-24)** designed as a CTF (Capture The Flag) security challenge. The application demonstrates a critically insecure security posture with **no authentication implementation**, **path traversal vulnerabilities**, and **multiple configuration weaknesses** that expose sensitive files. The primary objective is to retrieve a flag stored at `/var/www/webapp/app/static/flag`.

The application runs on **Python 3 with Flask 3.1.2**, deployed using **Apache2 with mod_wsgi** in a **Docker container** based on Debian Bullseye Slim. It exposes only **3 HTTP endpoints** on port 80 (HTTP only - no HTTPS), all of which are publicly accessible without authentication. The attack surface is minimal but contains a critical path traversal vulnerability in the `/resource` endpoint that allows unauthorized access to files in the static directory, potentially bypassing Apache's FilesMatch protection of the flag file.

Critical security findings include: (1) **Complete absence of authentication** - the login form is purely cosmetic with client-side-only validation; (2) **Path traversal vulnerability** in `/resource?filename=` endpoint with no input validation; (3) **Directory listing enabled** via Apache configuration allowing file enumeration; (4) **CORS wildcard misconfiguration** allowing requests from any origin; (5) **Plaintext secret storage** with the FLAG value hardcoded in `.env` file and written to the static directory during Docker build; (6) **No encryption** at rest or in transit (HTTP-only); (7) **Missing security headers** (CSP, HSTS, X-Frame-Options); and (8) **No session management, CSRF protection, or rate limiting**.

The most critical attack vector is the **`/resource` endpoint** which accepts user-controlled filenames without validation and uses Flask's `send_from_directory()` to serve files from the static directory. While Apache configuration attempts to block direct access to the file named "flag" using a FilesMatch directive, this protection may be bypassable through path traversal techniques or direct access via the Flask endpoint. The application's minimal functionality, lack of database, and absence of actual authentication suggest this is specifically designed as a penetration testing challenge focused on path traversal and access control bypass vulnerabilities.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built using **Flask 3.1.2** (a lightweight Python web framework) running on **Python 3** (system version 3.12.9, container uses Debian Bullseye's Python 3.x). Flask was chosen for its simplicity and minimal overhead, making it ideal for small web applications and CTF challenges. From a security perspective, Flask requires explicit configuration of security features - none of which have been implemented in this application. The framework provides no built-in authentication, authorization, or CSRF protection, requiring developers to add these manually through extensions like Flask-Login, Flask-WTF, or Flask-Security. This application has **only Flask as a dependency** (specified in `app/website/requirements.txt`), with no security libraries whatsoever.

The web server architecture uses **Apache2 with mod_wsgi-py3** to serve the Flask application. Apache acts as the primary HTTP server and uses mod_wsgi to execute Python code via the WSGI (Web Server Gateway Interface) protocol. The Apache configuration file (`app/webapp-httpd.conf`) defines a VirtualHost on port 80 with several critical security misconfigurations. The WSGI daemon is configured with default settings, running the application from `/var/www/webapp/application.wsgi`. This architecture means Apache handles all incoming HTTP requests and passes them to the Flask application for processing, making Apache configuration critical for security controls.

The application runs entirely within a **Docker container** based on **debian:bullseye-slim**, a minimal Debian 11 base image that reduces the attack surface by including only essential packages. The Dockerfile (`app/Dockerfile`) installs Apache2, mod_wsgi, Python3, pip, and curl (used for healthchecks). Critically, during the build process (line 21 of Dockerfile), the FLAG value is written to `/var/www/webapp/app/static/flag` as plaintext, making it a static file within the web root. The Docker Compose configuration (`docker-compose.yml`) exposes port 80 and loads environment variables from a `.env` file containing the FLAG value in plaintext.

### Architectural Pattern

This is a **containerized monolithic web application** with a stateless, single-tier architecture. The entire application logic resides in a single Python module (`app/website/app/routes.py` - only 19 lines of code) with three HTTP endpoints. There is **no database layer** - the application stores no persistent data and maintains no state between requests. There is **no authentication system** - all endpoints are publicly accessible. There are **no background workers, message queues, or microservices** - just a simple request-response web server.

From a trust boundary perspective, this architecture has **no internal security boundaries**. All code runs in the same process with the same privileges. There is no separation between public-facing components and internal services. The only intended security boundary is Apache's FilesMatch directive that attempts to block direct access to the file named "flag" (lines 24-27 of `webapp-httpd.conf`), but this protection is implemented at the web server layer and may not apply to files served through Flask's `send_from_directory()` function in the `/resource` endpoint.

The stateless design means no session management, no user state tracking, and no authentication state persistence. The application processes each request independently without reference to previous requests. This eliminates session-based attacks (session fixation, session hijacking) but also means there's no way to implement authentication even if it were desired with the current architecture.

### Critical Security Components

**Authentication: COMPLETELY ABSENT (CRITICAL)**
- The `/login` endpoint (lines 9-13 of `routes.py`) accepts POST requests with username and password fields but **completely ignores the submitted data** and simply redirects back to the login page
- No password validation, no user database lookup, no credential checking whatsoever
- The login.html template contains client-side JavaScript (lines 48-66) that prevents actual form submission and displays an error message, making the login purely cosmetic
- **Security Impact:** Any user can access all endpoints without authentication; the login form creates a false sense of security

**Authorization: NON-EXISTENT (CRITICAL)**
- No role-based access control (RBAC), no access control lists (ACL), no permission checking
- No `@login_required` decorators or before_request handlers
- All three endpoints (`/`, `/login`, `/resource`) are publicly accessible
- **Security Impact:** No endpoint protection; all resources accessible without authorization

**Data Protection: CRITICALLY FLAWED**
- **No encryption at rest:** FLAG stored in plaintext at `/var/www/webapp/app/static/flag` (created at line 21 of Dockerfile)
- **No encryption in transit:** Application runs on HTTP port 80 only (line 1 of `webapp-httpd.conf` - `<VirtualHost *:80>`), no HTTPS/TLS configuration
- **No input validation:** The `/resource` endpoint accepts user-controlled filenames without sanitization, validation, or whitelist checking (line 18 of `routes.py`)
- **Insecure secret storage:** FLAG value hardcoded in `.env` file as `FLAG="flag{f2415bf1-1c95-46bd-88fb-14762c7808fa}"` (line 1 of `.env`)
- **Docker build argument exposure:** FLAG passed as build argument (line 6 of `docker-compose.yml`), making it visible in Docker image metadata via `docker history`

**Apache Security Configuration Issues:**
- **CORS wildcard** (line 9 of `webapp-httpd.conf`): `Header set Access-Control-Allow-Origin "*"` allows requests from any domain, enabling cross-site attacks
- **Directory indexing enabled** (lines 13 and 20): `Options Indexes FollowSymLinks` allows browsing directory contents; `IndexOptions ShowForbidden` even shows forbidden files in listings
- **Weak flag protection** (lines 24-27): FilesMatch directive blocks files named exactly "flag" but uses deprecated Apache 2.2 syntax and may not protect against path traversal through Flask endpoints

**Missing Security Components:**
- No Flask SECRET_KEY configured (critical for session security and CSRF tokens)
- No security headers: Missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- No CSRF protection: Forms have no CSRF tokens
- No rate limiting: No protection against brute force attacks
- No security logging: No audit trail of access attempts or security events
- No input validation libraries: No WTForms, Marshmallow, or similar frameworks

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**CRITICAL FINDING: NO AUTHENTICATION IMPLEMENTATION EXISTS**

The application presents a login form to users but implements **zero server-side authentication logic**. This is a complete security control failure that renders the entire application publicly accessible.

**Login Endpoint Analysis:**
```python
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py
# Lines 9-13

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        return redirect(url_for('login'))
    return render_template('login.html')
```

This endpoint handles both GET and POST requests but performs no authentication:
- **GET requests:** Renders the login.html template
- **POST requests:** **Ignores all form data** (username and password fields are never accessed via `request.form`) and immediately redirects back to the login page
- No credential validation, no database lookups, no password verification
- No session creation, no cookies issued, no authentication state established

**Client-Side "Validation":**
The login.html template (lines 48-66) contains JavaScript that actually **prevents form submission** and displays an error message:

```javascript
// File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/templates/login.html
// Lines 48-66

form.addEventListener('submit', function(event) {
    event.preventDefault();  // Prevents actual form submission
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    // Always display error message regardless of credentials
    document.getElementById('loginAlert').classList.remove('d-none');
});
```

This client-side code creates the **illusion of authentication** by showing an error message when users attempt to login, but it's purely cosmetic and provides no security whatsoever.

**Security Implications:**
- **Complete authentication bypass:** Users can access any endpoint by navigating directly to it, skipping the login page entirely
- **False security:** The presence of a login form may mislead security assessments or give false confidence
- **No credential protection:** Even if users enter credentials, they're transmitted over HTTP (unencrypted) but never processed
- **No audit trail:** No logging of authentication attempts or failures

### Authentication API Endpoints - Exhaustive List

**Total Routes in Application: 3**
**Routes with Authentication: 0**
**Public Routes: 3 (100%)**

**Endpoint 1: Root Redirect**
- **Route:** `GET /`
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 5-7)
- **Handler:** `index()`
- **Functionality:** Redirects to `/login` using `redirect(url_for('login'))`
- **Authentication Required:** NO
- **Authorization Required:** NO
- **Purpose:** Entry point that redirects users to login page

**Endpoint 2: Login Page**
- **Route:** `GET /login`, `POST /login`
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 9-13)
- **Handler:** `login()`
- **Functionality:** Displays login form (GET) or redirects to login (POST)
- **Form Fields:** `username`, `password` (defined in login.html lines 19-30)
- **Credentials Validated:** NO
- **Session Created:** NO
- **Authentication Required:** NO
- **Vulnerability:** Complete authentication bypass - credentials are never validated

**Endpoint 3: Resource/Static File Server**
- **Route:** `GET /resource`
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 16-19)
- **Handler:** `resource()`
- **Functionality:** Serves files from static directory based on `filename` parameter
- **Parameters:** `filename` (query parameter, e.g., `/resource?filename=css/bootstrap.min.css`)
- **Authentication Required:** NO
- **Authorization Required:** NO
- **Vulnerability:** Path traversal - no validation on filename parameter

**Logout Endpoint:** DOES NOT EXIST
**Password Reset Endpoint:** DOES NOT EXIST
**Token Refresh Endpoint:** DOES NOT EXIST
**Multi-Factor Authentication Endpoint:** DOES NOT EXIST

### Session Management and Token Security

**CRITICAL FINDING: NO SESSION MANAGEMENT IMPLEMENTED**

**Flask Application Configuration:**
```python
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/__init__.py
# Lines 1-7

from flask import Flask

app = Flask(__name__)

from app import routes
```

This minimal Flask initialization has **no security configuration**:
- **No SECRET_KEY configured** - Flask's `SECRET_KEY` is not set, which is required for securely signing session cookies and generating CSRF tokens
- **No session configuration** - No session backend, timeout, or cookie settings
- **No security extensions** - No Flask-Login, Flask-WTF, Flask-Security, or similar libraries

**Session Cookie Flags Analysis:**
Since no sessions are created, no cookies are issued by the application. Therefore:
- **HttpOnly Flag:** NOT CONFIGURED (no cookies exist) - **File/Line:** N/A
- **Secure Flag:** NOT CONFIGURED (no cookies exist) - **File/Line:** N/A
- **SameSite Flag:** NOT CONFIGURED (no cookies exist) - **File/Line:** N/A

**If sessions were implemented with the current configuration:**
- Sessions would be **insecure or non-functional** without a SECRET_KEY
- Cookie flags would default to Flask's defaults (HttpOnly=True, Secure=False, SameSite=None in Flask 3.x)
- Session data would be stored client-side in signed cookies (Flask's default), but without SECRET_KEY, signing would fail

**Security Impact:**
- **No authentication state persistence:** Application cannot track whether a user is logged in
- **No session fixation protection:** (Moot point - no sessions exist to fix)
- **No session hijacking protection:** (Moot point - no sessions exist to hijack)
- **CSRF protection impossible:** Without SECRET_KEY, CSRF tokens cannot be generated
- **Application is entirely stateless:** Each request is processed independently with no memory of previous requests

**Recommendation for Remediation:**
```python
import os
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or os.urandom(32)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True  # Requires HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 1800  # 30 minutes
```

### Authorization Model

**CRITICAL FINDING: NO AUTHORIZATION MECHANISMS EXIST**

The application implements **zero authorization controls**. Every endpoint is accessible to every user without any permission checking.

**Permission Checking Analysis:**
- **No RBAC (Role-Based Access Control):** No role definitions, no role assignments, no role checking
- **No ACL (Access Control Lists):** No resource-level permissions
- **No policy enforcement:** No authorization policies defined
- **No decorator-based protection:** No `@login_required`, `@admin_required`, or custom authorization decorators
- **No before_request handlers:** No global authorization checks
- **No route-level guards:** No authorization logic in any route handler

**Code Review of All Endpoints:**

1. **`/` endpoint** (lines 5-7 of routes.py): No authorization check
2. **`/login` endpoint** (lines 9-13 of routes.py): No authorization check
3. **`/resource` endpoint** (lines 16-19 of routes.py): **No authorization check AND no input validation**

```python
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py
# Lines 16-19

@app.route('/resource')
def resource():
    filename = request.args.get('filename')  # NO VALIDATION
    return send_from_directory('static', filename)  # NO AUTHORIZATION
```

**Critical Vulnerability:** This endpoint allows **unrestricted file access** from the static directory. While Apache configuration attempts to block direct access to the file named "flag" (lines 24-27 of `webapp-httpd.conf`), the Flask endpoint has no such restriction and may serve the file anyway.

**Potential Bypass Scenarios:**
1. **Direct path traversal:** `/resource?filename=flag` might bypass Apache's FilesMatch directive
2. **Encoded characters:** `/resource?filename=%66%6C%61%67` (URL-encoded "flag")
3. **Path manipulation:** `/resource?filename=./flag`, `/resource?filename=static/flag`
4. **Case sensitivity:** `/resource?filename=FLAG`, `/resource?filename=Flag`
5. **Directory traversal:** `/resource?filename=../../flag` (if send_from_directory allows parent directory access)

**Authorization Enforcement Points: 0**

All resources are publicly accessible without authentication or authorization.

### Multi-Tenancy Security

**NOT APPLICABLE:** The application does not implement multi-tenancy. It has no tenant identification, no tenant-specific data isolation, and no tenant-based routing or resource separation.

### SSO/OAuth/OIDC Flows

**NOT IMPLEMENTED:** The application has no Single Sign-On, OAuth, OIDC, or SAML implementations.

**What to look for in SSO implementations (NONE FOUND):**
- **OAuth/OIDC callback endpoints:** NOT FOUND
- **State parameter validation:** NOT IMPLEMENTED (critical CSRF protection for OAuth)
- **Nonce parameter checking:** NOT IMPLEMENTED (replay attack protection for OIDC)
- **Authorization code exchange:** NOT IMPLEMENTED
- **Token validation:** NOT IMPLEMENTED
- **JWKS fetching:** NOT IMPLEMENTED

**Dependencies Analysis:**
```
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/requirements.txt
# Line 1

flask
```

Only Flask is installed. No OAuth/OIDC libraries such as:
- authlib
- PyJWT
- python-jose
- oauthlib
- requests-oauthlib

**Security Impact:** While the absence of SSO means no SSO-specific vulnerabilities (like OAuth redirect URI manipulation or state parameter bypass), it also means the application has **no authentication mechanism whatsoever**.

---

## 4. Data Security & Storage

### Database Security

**Database Status: NO DATABASE DETECTED**

After comprehensive analysis of all Python files, configuration files, and dependencies, **no database implementation exists**. The application is **completely stateless** with no persistent data storage.

**Analysis Results:**
- **No database imports:** No SQLAlchemy, psycopg2, PyMySQL, sqlite3, pymongo, redis, or other database libraries
- **No database configuration:** No connection strings, database URLs, or credentials
- **No database models:** No ORM models or schema definitions
- **No database queries:** No SQL, query construction, or database operations
- **No migrations:** No Alembic, Flask-Migrate, or database migration scripts

**Dependencies Check:**
```
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/requirements.txt
flask
```

Only Flask is installed - no database drivers or ORMs.

**Security Implications:**
- **Positive:** No SQL injection vulnerabilities (no SQL queries exist)
- **Positive:** No database credential exposure risk (no database connections)
- **Positive:** No data breach risk from database compromise (no database exists)
- **Negative:** No ability to implement authentication (no user storage)
- **Negative:** No audit logging persistence (no place to store logs)
- **Negative:** No session storage backend (sessions would be client-side only)

**Query Parameterization:** N/A (no database)
**ORM Security:** N/A (no ORM)
**Database Encryption at Rest:** N/A (no database)

### Data Flow Security

**CRITICAL FINDING: SENSITIVE FILE STORAGE AND EXPOSURE**

While the application has no database, it stores a sensitive secret (the FLAG) as a **plaintext file in the web-accessible static directory**.

**FLAG Storage Flow:**

1. **Source: Environment Variable**
   - **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/.env` (line 1)
   - **Content:** `FLAG="flag{f2415bf1-1c95-46bd-88fb-14762c7808fa}"`
   - **Security Issue:** Plaintext secret in repository; may be committed to version control

2. **Build Process: Docker Build Argument**
   - **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml` (line 6)
   - **Content:** `args: - FLAG=${FLAG}`
   - **Security Issue:** Build arguments are stored in Docker image metadata and visible via `docker history`

3. **Build Process: File Creation**
   - **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/Dockerfile` (line 21)
   - **Content:** `RUN echo -n $FLAG > /var/www/webapp/app/static/flag`
   - **Security Issue:** FLAG written to filesystem in plaintext during build; stored in web-accessible directory

4. **Runtime: Static File**
   - **Location:** `/var/www/webapp/app/static/flag` (inside container)
   - **Security Issue:** File exists in static directory alongside CSS and JavaScript files

5. **Protection Attempt: Apache Configuration**
   - **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` (lines 24-27)
   - **Content:**
     ```apache
     <FilesMatch "^flag$">
         Order allow,deny
         deny from all
     </FilesMatch>
     ```
   - **Security Issue:** Only blocks direct Apache access to file named exactly "flag"; may not protect against Flask endpoint access

6. **Exposure Vector: Flask Resource Endpoint**
   - **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 16-19)
   - **Content:**
     ```python
     @app.route('/resource')
     def resource():
         filename = request.args.get('filename')
         return send_from_directory('static', filename)
     ```
   - **CRITICAL VULNERABILITY:** No input validation on `filename` parameter; may bypass Apache's FilesMatch protection

**Path Traversal Vulnerability Analysis:**

The `/resource` endpoint accepts a user-controlled `filename` parameter with **zero validation or sanitization**. Flask's `send_from_directory('static', filename)` function does provide some protection against directory traversal (it rejects paths with ".." that would escape the static directory), but it does NOT check against the Apache FilesMatch directive.

**Exploitation Scenarios:**
- **Direct access:** `GET /resource?filename=flag` - Likely bypasses Apache FilesMatch since the request is processed by Flask before Apache's static file rules apply
- **URL encoding:** `GET /resource?filename=%66%6C%61%67` (hex-encoded "flag")
- **Case variations:** `GET /resource?filename=FLAG` or `GET /resource?filename=Flag` (if filesystem is case-insensitive)
- **Path manipulation:** `GET /resource?filename=./flag` or `GET /resource?filename=static/../static/flag`

**Data Protection Failures:**

1. **No Encryption at Rest:**
   - FLAG stored in plaintext on filesystem
   - No file-level encryption
   - No filesystem encryption
   - Accessible if container is compromised or if Docker image is extracted

2. **No Encryption in Transit:**
   - **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` (line 1)
   - **Content:** `<VirtualHost *:80>`
   - Application runs on HTTP port 80 only
   - No HTTPS/TLS configuration
   - No SSL certificates
   - **Impact:** FLAG would be transmitted in plaintext if retrieved; subject to network eavesdropping, MITM attacks

3. **No Input Validation:**
   - **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (line 18)
   - `filename = request.args.get('filename')` - No validation, sanitization, or whitelist checking
   - No use of `werkzeug.utils.secure_filename()`
   - No allowed file list enforcement
   - No file extension checking

4. **No Access Control:**
   - `/resource` endpoint is publicly accessible (no authentication required)
   - No authorization checking before serving files
   - No rate limiting to prevent enumeration attacks
   - No logging of file access attempts

**Sensitive Data Transmission:**

The login form accepts username and password fields (lines 19-30 of `login.html`):
```html
<input type="text" class="form-control" id="username" name="username" required>
<input type="password" class="form-control" id="password" name="password" required>
```

If users enter credentials:
- **Transmitted via:** HTTP POST to `/login` endpoint (HTTP, not HTTPS)
- **Transmission Security:** **NONE** - sent in plaintext over unencrypted connection
- **Processing:** Credentials are **completely ignored** by the server (lines 11-12 of routes.py - POST handler just redirects)
- **Storage:** Not stored (which is actually good, given the lack of encryption)
- **Logging Risk:** May appear in Apache access logs or error logs

**Secret Management Issues:**

The FLAG value appears in **multiple locations in the development environment**:
1. `.env` file (source control risk)
2. `docker-compose.yml` as build argument
3. Docker image layers (visible in image metadata)
4. Container environment variables (visible via `docker inspect` or `/proc/1/environ`)
5. Container filesystem at `/var/www/webapp/app/static/flag`

**No secret rotation mechanism exists** - the FLAG appears to be static with no versioning or rotation capabilities.

### Multi-Tenant Data Isolation

**NOT APPLICABLE:** The application does not implement multi-tenancy. There is no concept of tenants, no tenant identification mechanism, and no data isolation requirements since there is no database or persistent storage.

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **3 HTTP endpoints** on **port 80 (HTTP only)**. All endpoints are **network-accessible and publicly available** without authentication. No other network services or protocols are exposed.

**Endpoint 1: Root Redirect (`/`)**
- **Route:** `GET /`
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 5-7)
- **Handler:** `index()`
- **Functionality:** Simple redirect to `/login` using Flask's `redirect(url_for('login'))`
- **User Input:** None accepted
- **Authentication Required:** No (Public endpoint)
- **Attack Surface:** Minimal - no user input processing
- **Security Concerns:** None significant
- **Code:**
  ```python
  @app.route('/')
  def index():
      return redirect(url_for('login'))
  ```

**Endpoint 2: Login Page (`/login`)**
- **Route:** `GET /login`, `POST /login`
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 9-13)
- **Handler:** `login()`
- **Functionality:** 
  - GET: Renders login.html template with static login form
  - POST: Accepts username/password but immediately redirects to `/login` without processing
- **User Input:** 
  - `username` field (text input, line 19 of login.html)
  - `password` field (password input, line 24 of login.html)
  - Submitted via POST but **never accessed or processed** by server
- **Authentication Required:** No (Public endpoint)
- **Attack Surface:** 
  - Accepts arbitrary username/password values via POST
  - Client-side JavaScript prevents actual submission (lines 48-66 of login.html)
  - No server-side validation or sanitization
- **Security Concerns:**
  - **No CSRF protection:** Form has no CSRF token
  - **Credentials transmitted over HTTP:** If JavaScript is bypassed, credentials sent in plaintext
  - **No rate limiting:** Unlimited POST requests allowed
  - **Client-side security only:** Authentication is purely cosmetic client-side validation
  - **Information disclosure:** Always shows same error message, doesn't reveal whether credentials are valid
- **Template Rendering:**
  - Template: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/templates/login.html`
  - Uses Jinja2 with default autoescaping (secure against template injection)
  - Only uses safe `url_for()` functions, no user input reflection
- **Code:**
  ```python
  @app.route('/login', methods=['GET', 'POST'])
  def login():
      if request.method == 'POST':
          return redirect(url_for('login'))  # Ignores POST data
      return render_template('login.html')
  ```

**Endpoint 3: Resource/Static File Server (`/resource`) - CRITICAL VULNERABILITY**
- **Route:** `GET /resource`
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 16-19)
- **Handler:** `resource()`
- **Functionality:** Serves files from the `static` directory based on user-supplied `filename` query parameter
- **User Input:** `filename` query parameter (e.g., `/resource?filename=css/bootstrap.min.css`)
- **Authentication Required:** No (Public endpoint)
- **Authorization Required:** No file access controls
- **Attack Surface:** **HIGH RISK**
  - Accepts arbitrary filename values via query parameter
  - No input validation, sanitization, or whitelist enforcement
  - Uses `send_from_directory('static', filename)` which has some built-in path traversal protection but no file access controls
- **Security Concerns:**
  - **Path Traversal Vulnerability:** Primary attack vector for accessing the flag file
  - **No input validation:** `filename` parameter accepted without checks
  - **No file whitelist:** Any file in static directory can be requested
  - **No authentication:** Publicly accessible without login
  - **No rate limiting:** Unlimited enumeration of filenames
  - **No logging:** File access attempts not logged for security monitoring
  - **Potential Apache bypass:** Flask's `send_from_directory()` may bypass Apache's FilesMatch directive
- **Exploitation Scenarios:**
  1. **Direct flag access:** `/resource?filename=flag` (likely bypasses Apache FilesMatch)
  2. **URL encoding:** `/resource?filename=%66%6C%61%67` (hex-encoded)
  3. **Case variations:** `/resource?filename=FLAG` or `/resource?filename=Flag`
  4. **Path variations:** `/resource?filename=./flag`, `/resource?filename=static/../static/flag`
  5. **File enumeration:** Brute-force common filenames to discover hidden files
- **Code:**
  ```python
  @app.route('/resource')
  def resource():
      filename = request.args.get('filename')  # NO VALIDATION
      return send_from_directory('static', filename)
  ```
- **Legitimate Use:** Template uses this endpoint to load CSS and JavaScript:
  ```html
  <!-- Line 8 of login.html -->
  <link href="/resource?filename=css/bootstrap.min.css" rel="stylesheet">
  <!-- Line 62 of login.html -->
  <script src="/resource?filename=js/bootstrap.bundle.min.js"></script>
  ```

**Static Directory Apache Configuration:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` (lines 18-28)
- **Configuration:**
  ```apache
  Alias /static /var/www/webapp/app/static
  <Directory /var/www/webapp/app/static/>
      Options Indexes FollowSymLinks
      IndexOptions ShowForbidden
      AllowOverride None
      Require all granted
      <FilesMatch "^flag$">
          Order allow,deny
          deny from all
      </FilesMatch>
  </Directory>
  ```
- **Security Issues:**
  - **Directory listing enabled:** `Options Indexes` allows browsing `/static/` to enumerate files
  - **Shows forbidden files:** `IndexOptions ShowForbidden` reveals files even if access is denied
  - **Weak flag protection:** FilesMatch only blocks file named exactly "flag" via direct Apache access
  - **Deprecated syntax:** `Order allow,deny` is Apache 2.2 syntax (Apache 2.4 uses Require)
  - **Flask bypass:** Flask's `/resource` endpoint may not respect Apache's FilesMatch directive

**Health Check Endpoint (Non-Exploitable):**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml` (lines 11-15)
- **Configuration:**
  ```yaml
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:80/"]
    timeout: 1s
    retries: 5
    interval: 10s
  ```
- **Analysis:** Docker healthcheck uses `curl` to request `/` endpoint from inside container
- **Attack Surface:** None - this is container orchestration, not an additional endpoint

### Internal Service Communication

**NOT APPLICABLE:** This is a monolithic application with no internal service-to-service communication. There are:
- No microservices architecture
- No inter-service API calls
- No message queues or pub/sub systems
- No service mesh
- No internal-only endpoints

All code runs in a single process within a single container. There are no trust boundaries between services because there is only one service.

### Input Validation Patterns

**CRITICAL FINDING: NO INPUT VALIDATION IMPLEMENTED**

The application accepts user input from multiple sources but performs **zero validation or sanitization** on any inputs.

**Input Source 1: Query Parameters (`/resource` endpoint)**
- **Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (line 18)
- **Code:** `filename = request.args.get('filename')`
- **Validation:** **NONE**
- **Sanitization:** **NONE**
- **Whitelist:** **NONE**
- **Usage:** Passed directly to `send_from_directory('static', filename)`
- **Vulnerability:** Path traversal - arbitrary filenames accepted
- **Risk:** HIGH - Primary attack vector for flag extraction

**Recommended Validation:**
```python
from werkzeug.utils import secure_filename

ALLOWED_FILES = [
    'css/bootstrap.min.css',
    'css/style.css',
    'js/bootstrap.bundle.min.js'
]

@app.route('/resource')
def resource():
    filename = request.args.get('filename')
    if not filename or filename not in ALLOWED_FILES:
        abort(403)
    return send_from_directory('static', filename)
```

**Input Source 2: POST Form Data (`/login` endpoint)**
- **Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (lines 11-12)
- **Expected Fields:** `username`, `password` (defined in login.html)
- **Validation:** **NONE** (data is never accessed)
- **Processing:** **NONE** (POST handler just redirects)
- **Risk:** LOW - Data is completely ignored, so no injection vulnerabilities

**Input Source 3: HTTP Request Method**
- **Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (line 11)
- **Code:** `if request.method == 'POST':`
- **Validation:** Flask framework handles method validation
- **Risk:** NONE - Framework-level validation is secure

**General Input Validation Findings:**
- **No input validation libraries:** No WTForms, Flask-WTF, Marshmallow, or Cerberus
- **No schema validation:** No JSON schema validation, no data type checking
- **No length limits:** No maximum length enforcement on inputs
- **No character whitelisting:** No allowed character sets defined
- **No encoding validation:** No charset or encoding validation
- **No file extension checking:** `/resource` endpoint accepts any filename regardless of extension
- **No content-type validation:** No validation of request content types

### Background Processing

**NOT APPLICABLE:** The application has no background job processing, asynchronous tasks, or scheduled jobs. There are:
- No Celery workers or task queues
- No background job libraries (RQ, Huey, Dramatiq)
- No scheduled tasks or cron jobs
- No webhook processors
- No email sending or notification systems
- No long-running processes triggered by user requests

All requests are processed synchronously within the request-response cycle. No jobs are queued or deferred.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**CRITICAL FINDING: INSECURE SECRET STORAGE IN MULTIPLE LOCATIONS**

The FLAG secret value is stored in **plaintext across multiple locations** without encryption, proper secret management tools, or access controls.

**Secret Storage Location 1: Environment File (.env)**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/.env` (line 1)
- **Content:** `FLAG="flag{f2415bf1-1c95-46bd-88fb-14762c7808fa}"`
- **Storage Method:** Plaintext in `.env` file
- **Security Issues:**
  - Secret stored in plaintext
  - File may be committed to version control (high risk in git repositories)
  - No encryption at rest
  - No access controls on file (depends on filesystem permissions)
  - No secret rotation mechanism
  - No secret versioning
- **Impact:** If `.env` is committed to git and pushed to a public repository, the FLAG is permanently exposed in git history

**Secret Storage Location 2: Docker Build Argument**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml` (line 6)
- **Content:**
  ```yaml
  build:
    args:
      - FLAG=${FLAG}
  ```
- **Security Issues:**
  - Build arguments are stored in Docker image metadata
  - Visible via `docker history <image_name>`
  - Cannot be removed from image once built
  - Persists even if later layers delete files
  - Exposed to anyone with access to the Docker image
- **Impact:** The FLAG is permanently embedded in the Docker image and can be extracted even without running the container

**Secret Storage Location 3: Container Filesystem**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/Dockerfile` (line 21)
- **Content:** `RUN echo -n $FLAG > /var/www/webapp/app/static/flag`
- **Storage Method:** Plaintext file at `/var/www/webapp/app/static/flag`
- **Security Issues:**
  - Stored in plaintext on filesystem
  - Located in web-accessible directory (static/)
  - No file-level encryption
  - No filesystem encryption
  - Accessible if container is compromised
  - Can be extracted from Docker image layers
- **Impact:** The FLAG file can be accessed by extracting Docker image layers, accessing the container filesystem, or exploiting the path traversal vulnerability

**Secret Storage Location 4: Container Environment Variables**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml` (line 10)
- **Content:**
  ```yaml
  env_file:
    - .env
  ```
- **Security Issues:**
  - Environment variables visible inside container
  - Accessible via `/proc/1/environ` in container
  - Visible in `docker inspect` output
  - May appear in error messages or logs
  - No encryption for environment variables
- **Impact:** FLAG accessible to anyone with container access or ability to inspect the container

**Secret Rotation:**
- **Status:** NOT IMPLEMENTED
- No secret rotation mechanism exists
- No versioning of secrets
- No key rotation policies
- FLAG appears to be static with no rotation schedule
- **Impact:** If FLAG is compromised, no mechanism exists to invalidate and rotate it

**Recommended Remediation:**
1. **Remove `.env` from version control:**
   ```bash
   git rm --cached .env
   echo ".env" >> .gitignore
   git commit -m "Remove .env from version control"
   ```

2. **Use Docker Secrets (for Docker Swarm) or Kubernetes Secrets:**
   ```yaml
   secrets:
     flag:
       external: true
   services:
     webapp:
       secrets:
         - flag
   ```

3. **Use a dedicated secret management service:**
   - HashiCorp Vault
   - AWS Secrets Manager
   - Azure Key Vault
   - Google Cloud Secret Manager

4. **Encrypt secrets at rest:**
   - Use application-level encryption
   - Store encrypted version, decrypt only when needed
   - Use a Key Management Service (KMS) for encryption keys

5. **Implement secret rotation:**
   - Define rotation schedule (e.g., every 90 days)
   - Automate rotation process
   - Version secrets to allow graceful transitions

### Configuration Security

**CRITICAL FINDING: MULTIPLE CONFIGURATION SECURITY ISSUES**

**HTTP-Only Configuration (No HTTPS/TLS):**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` (line 1)
- **Content:** `<VirtualHost *:80>`
- **Issue:** Application runs on HTTP port 80 only, no HTTPS configuration
- **Security Impact:**
  - All traffic transmitted in plaintext (unencrypted)
  - Credentials (if submitted) transmitted without encryption
  - FLAG (if retrieved) transmitted without encryption
  - Vulnerable to network eavesdropping and MITM attacks
  - Session cookies (if implemented) would be transmitted insecurely
- **Missing Components:**
  - No SSL certificate configuration
  - No port 443 listener
  - No HTTP-to-HTTPS redirect
  - No HSTS header to enforce HTTPS

**CORS Wildcard Misconfiguration:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` (line 9)
- **Content:** `Header set Access-Control-Allow-Origin "*"`
- **Issue:** Allows cross-origin requests from ANY domain
- **Security Impact:**
  - Any website can make requests to this application
  - No CSRF protection possible (wildcard CORS negates SameSite cookie protection)
  - Enables cross-site attacks and data exfiltration
  - Attacker websites can read responses from this application
- **Recommendation:** Restrict to specific trusted origins:
  ```apache
  Header set Access-Control-Allow-Origin "https://trusted-domain.com"
  ```

**Directory Listing Enabled:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` (line 20)
- **Content:** `Options Indexes FollowSymLinks`
- **Issue:** Apache directory listing enabled for static directory
- **Security Impact:**
  - Attackers can browse `/static/` to enumerate all files
  - `IndexOptions ShowForbidden` (line 21) even shows forbidden files in listings
  - Reveals application structure and hidden files
  - Information disclosure vulnerability
- **Exploitation:** Visit `http://<target>/static/` to see directory listing showing:
  - flag (shown in listing even though access is denied)
  - css/
  - js/
  - Any other files in static directory
- **Recommendation:**
  ```apache
  Options -Indexes FollowSymLinks
  ```

**Missing Security Headers:**
The Apache configuration sets **only one security-related header** (the misconfigured CORS header). Critical security headers are missing:

- **Content-Security-Policy (CSP):** NOT CONFIGURED
  - **Impact:** No protection against XSS attacks, clickjacking, or data injection
  - **Recommendation:**
    ```apache
    Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'"
    ```

- **Strict-Transport-Security (HSTS):** NOT CONFIGURED
  - **File/Line:** No HSTS configuration found in `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf`
  - **Impact:** No enforcement of HTTPS; vulnerable to SSL stripping attacks
  - **Recommendation:**
    ```apache
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    ```

- **X-Frame-Options:** NOT CONFIGURED
  - **Impact:** Application can be embedded in iframes, vulnerable to clickjacking attacks
  - **Recommendation:**
    ```apache
    Header always set X-Frame-Options "DENY"
    ```

- **X-Content-Type-Options:** NOT CONFIGURED
  - **Impact:** Browsers may perform MIME sniffing, potentially executing files as scripts
  - **Recommendation:**
    ```apache
    Header always set X-Content-Type-Options "nosniff"
    ```

- **X-XSS-Protection:** NOT CONFIGURED
  - **Impact:** No browser-level XSS protection (legacy header but still useful)
  - **Recommendation:**
    ```apache
    Header always set X-XSS-Protection "1; mode=block"
    ```

- **Referrer-Policy:** NOT CONFIGURED
  - **Impact:** Referrer information may leak to external sites
  - **Recommendation:**
    ```apache
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    ```

- **Permissions-Policy:** NOT CONFIGURED
  - **Impact:** No control over browser features (camera, microphone, geolocation, etc.)
  - **Recommendation:**
    ```apache
    Header always set Permissions-Policy "geolocation=(), microphone=(), camera=()"
    ```

**Cache-Control Headers:** NOT CONFIGURED
- **No cache control headers found** in `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf`
- **Impact:** Sensitive responses (like flag file if retrieved) may be cached by browsers or proxies
- **Recommendation:**
  ```apache
  <FilesMatch "\.(html|json)$">
    Header set Cache-Control "no-store, no-cache, must-revalidate, max-age=0"
  </FilesMatch>
  ```

**Flask Configuration Security:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/__init__.py`
- **Issue:** Minimal Flask configuration with no security settings
- **Missing Configurations:**
  - `SECRET_KEY` not set (required for sessions and CSRF)
  - `SESSION_COOKIE_SECURE` not set (should be True for HTTPS)
  - `SESSION_COOKIE_HTTPONLY` not set (should be True)
  - `SESSION_COOKIE_SAMESITE` not set (should be 'Lax' or 'Strict')
  - `PERMANENT_SESSION_LIFETIME` not set (no session timeout)
  - `MAX_CONTENT_LENGTH` not set (no request size limits)

**Environment Separation:**
- **No environment separation detected:** No separate dev/staging/production configurations
- **Debug mode:** Not explicitly disabled in `app/website/run.py` (line 4: `app.run(host="0.0.0.0")`)
- **Impact:** If debug mode is enabled, stack traces and sensitive information may be exposed

### External Dependencies

**Minimal Dependency Footprint:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/requirements.txt` (line 1)
- **Content:** `flask`
- **Analysis:** Only Flask is specified as a Python dependency

**Security Analysis:**
- **Positive:** Minimal dependencies reduce supply chain attack surface
- **Negative:** No version pinning - `flask` could resolve to any version
- **Negative:** No dependency lock file (no `requirements-lock.txt` or `Pipfile.lock`)
- **Negative:** No security scanning tools in dependencies (no bandit, safety, etc.)
- **Current Version:** Flask 3.1.2 detected on system

**System Dependencies (from Dockerfile):**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/Dockerfile` (lines 5-11)
- **Packages:**
  - `apache2` - Web server
  - `libapache2-mod-wsgi-py3` - WSGI module for Apache
  - `python3` - Python runtime
  - `python3-pip` - Python package manager
  - `curl` - HTTP client (used for healthchecks)

**Security Issues with Dependencies:**
1. **No version pinning in requirements.txt:**
   - Recommendation: Pin exact versions: `flask==3.1.2`

2. **No dependency vulnerability scanning:**
   - Recommendation: Use `pip-audit`, `safety`, or Snyk

3. **No dependency lock file:**
   - Recommendation: Use `pip freeze > requirements-lock.txt` or Pipenv

4. **curl included (potential command injection vector):**
   - Used only in Docker healthcheck, not accessible to users
   - Low risk but increases container attack surface

5. **Missing security libraries:**
   - No Flask-Login (authentication)
   - No Flask-WTF (CSRF protection)
   - No Flask-Limiter (rate limiting)
   - No Flask-Talisman (security headers)

**Frontend Dependencies (Static Assets):**
- **Bootstrap CSS:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/static/css/bootstrap.min.css`
- **Bootstrap JS:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/static/js/bootstrap.bundle.min.js`
- **Custom CSS:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/static/css/style.css`

**Frontend Security:**
- Bootstrap files are minified but version is unknown
- No Subresource Integrity (SRI) hashes in HTML
- Files served from same origin (good - no CDN dependencies)

**Third-Party Services:**
- **None detected** - Application does not integrate with external services
- No API calls to third-party services
- No OAuth providers
- No payment gateways
- No analytics or tracking services
- No CDN usage

### Monitoring & Logging

**CRITICAL FINDING: NO SECURITY LOGGING IMPLEMENTED**

**Application-Level Logging:**
- **Status:** NOT IMPLEMENTED
- **Analysis:** No Python `logging` module usage detected in any application files
- **Files Checked:**
  - `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/__init__.py`
  - `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py`
  - `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/run.py`
- **Missing Logging:**
  - No authentication attempt logging
  - No file access logging (critical for detecting flag retrieval)
  - No input validation failure logging
  - No error logging
  - No security event logging

**Apache Logging:**
- **Default Apache Logs:** Likely active (Apache's default error.log and access.log)
- **Location:** Typically `/var/log/apache2/` (not explicitly configured in webapp-httpd.conf)
- **What's Logged (by default):**
  - All HTTP requests (access.log)
  - Server errors (error.log)
  - May include sensitive data in query parameters
- **Security Issues:**
  - Query parameters logged in plaintext (e.g., `/resource?filename=flag` would appear in access.log)
  - Credentials in POST requests may appear in logs if debug mode is enabled
  - No structured logging (difficult to parse for SIEM integration)
  - No log retention policy defined
  - No log encryption

**Docker Logging:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml`
- **Logging Driver:** Not specified (uses Docker default - json-file)
- **Security Issues:**
  - No centralized log aggregation
  - Logs stored on container host
  - No log forwarding to SIEM or log management system
  - Container logs may contain sensitive data (including FLAG)

**Missing Security Monitoring:**
- **No intrusion detection:** No fail2ban, OSSEC, or similar IDS
- **No WAF (Web Application Firewall):** No ModSecurity or similar
- **No rate limiting monitoring:** No tracking of suspicious request patterns
- **No anomaly detection:** No ML-based anomaly detection
- **No alerting:** No security event alerts
- **No SIEM integration:** No integration with Security Information and Event Management systems

**Security Event Visibility: NONE**

The application provides **zero visibility** into:
- Authentication attempts (even though login endpoint exists)
- File access attempts (critical for detecting flag retrieval)
- Path traversal attempts
- Input validation failures
- Error conditions
- Suspicious request patterns
- Brute force attempts

**Recommendations:**

1. **Implement Application Logging:**
   ```python
   import logging
   logging.basicConfig(level=logging.INFO)
   logger = logging.getLogger(__name__)

   @app.route('/resource')
   def resource():
       filename = request.args.get('filename')
       logger.info(f"File access attempt: {filename} from {request.remote_addr}")
       return send_from_directory('static', filename)
   ```

2. **Sanitize Logs to Prevent Secret Leakage:**
   - Never log passwords, tokens, or FLAG values
   - Mask sensitive data in logs
   - Use structured logging (JSON format)

3. **Implement Security Event Logging:**
   - Log all authentication attempts (success and failure)
   - Log file access attempts (especially for flag file)
   - Log input validation failures
   - Log rate limit hits
   - Log suspicious patterns (e.g., path traversal attempts)

4. **Centralize Logs:**
   - Forward logs to centralized log management system (ELK, Splunk, Datadog)
   - Enable SIEM integration
   - Set up alerting for security events

5. **Implement Monitoring:**
   - Set up application performance monitoring (APM)
   - Monitor for suspicious request patterns
   - Track error rates and anomalies
   - Alert on security events

---

## 7. Overall Codebase Indexing

This is a **minimal Flask web application** with an extremely compact codebase designed as a CTF (Capture The Flag) challenge. The entire application consists of **only 19 lines of Python code** for the core logic, demonstrating that security vulnerabilities can exist even in the simplest applications. The codebase organization follows a standard Flask application structure but lacks the security components, testing infrastructure, and defensive coding practices expected in production applications.

The **directory structure** is organized as follows: The repository root (`/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/`) contains deployment configuration files (`docker-compose.yml`, `.env`, `Makefile`). The `app/` subdirectory contains the Docker build configuration (`Dockerfile`, `webapp-httpd.conf` for Apache configuration) and the actual Flask application in `app/website/`. Within the Flask application directory, the structure follows Flask conventions with `app/` containing application code (`__init__.py` for app initialization, `routes.py` for endpoint definitions), `app/templates/` for Jinja2 templates (only `login.html`), and `app/static/` for static assets (CSS in `static/css/`, JavaScript in `static/js/`, and critically, the `flag` file). The application also includes WSGI configuration (`application.wsgi`) and a development server runner (`run.py`). Notably absent are: test directories, documentation, migration scripts, database models, configuration management, CI/CD configurations, and security tooling.

The **build orchestration** uses Docker and Docker Compose. The `Dockerfile` (33 lines) defines a multi-step build process: starting from `debian:bullseye-slim` base image, installing system packages (Apache2, mod_wsgi, Python3, curl), creating directory structure, accepting a FLAG build argument, writing the FLAG to `/var/www/webapp/app/static/flag` (the critical security issue), copying application files, installing Python dependencies from `requirements.txt`, configuring Apache with the custom `webapp-httpd.conf`, exposing port 80, and starting Apache in foreground mode. The `docker-compose.yml` orchestrates the build, passing the FLAG as a build argument from the `.env` file, mapping port 80, loading environment variables, and configuring a health check using curl. This build process **permanently embeds the FLAG in the Docker image layers**, making it extractable even without running the container.

**Code generation and conventions** are minimal. The application uses no code generation tools, no ORM (no database), no API schema generation, and no frontend build process (static Bootstrap files are pre-minified). The Python code follows basic PEP 8 conventions but lacks type hints, docstrings, and comprehensive error handling. Flask's routing decorators (`@app.route()`) define endpoints using decorator syntax. The template uses Jinja2's `{{ url_for() }}` helper for URL generation but no custom template filters or macros. There are no custom Flask extensions, no blueprint modularization (despite the app being simple enough to benefit from it), and no application factory pattern (app is instantiated directly in `__init__.py`).

**Testing infrastructure is completely absent.** There are no unit tests, integration tests, end-to-end tests, test fixtures, test configuration, or testing libraries (no pytest, unittest, Flask-Testing). No code coverage tools are configured. No continuous integration (CI) or continuous deployment (CD) pipelines exist. The `Makefile` references `../../common.mk` (an external file not present in the codebase snapshot), suggesting this may be part of a larger CTF framework, but no CI/CD configurations (GitHub Actions, GitLab CI, Jenkins) are present in the repository.

**Dependency management** is extremely minimal. The `requirements.txt` contains a single line: `flask` with no version pinning. There is no `requirements-lock.txt`, no `Pipfile` or `Pipfile.lock` (Pipenv), no `poetry.lock` (Poetry), no `conda` environment file. System dependencies are managed via `apt-get` in the Dockerfile without version pinning (`RUN apt-get update && apt-get install -y apache2 libapache2-mod-wsgi-py3 python3 python3-pip curl`). This lack of dependency locking means builds are not reproducible and the application could break or introduce security vulnerabilities if upstream dependencies change.

**Security tooling is non-existent.** There are no static analysis tools (no Bandit, pylint, flake8 with security plugins), no dependency vulnerability scanners (no pip-audit, Safety, Snyk), no SAST (Static Application Security Testing), no DAST (Dynamic Application Security Testing), no secret scanning tools, no pre-commit hooks for security checks, no security linters. The `.env` file containing the plaintext FLAG is not in `.gitignore`, creating a significant risk of accidental secret exposure in version control.

**Configuration management** is minimal and insecure. Environment-specific configuration is handled solely through the `.env` file, with no separation of dev/staging/production environments. There is no 12-factor app compliance (secrets in `.env` file violate the principle of separating config from code). Flask's configuration is minimal (no `app.config` settings for security, sessions, or CSRF). Apache configuration is in a single `webapp-httpd.conf` file with security misconfigurations (CORS wildcard, directory indexing enabled). There is no infrastructure-as-code for deployment (no Terraform, no Ansible, no Kubernetes manifests beyond the basic Docker Compose file).

The **impact on discoverability of security-relevant components** is mixed. On one hand, the minimal codebase makes it easy to find all endpoints (only 3 routes in a single 19-line file) and understand the entire application flow in minutes. On the other hand, the lack of documentation, type hints, and security tooling means vulnerabilities must be found through manual code review rather than automated scanning. The critical path traversal vulnerability in `/resource?filename=` is immediately obvious to experienced security reviewers due to the complete absence of input validation, but the interaction between Apache's FilesMatch directive and Flask's `send_from_directory()` requires understanding both the Apache configuration and Flask's security model. The FLAG's storage location is documented in multiple places (Dockerfile, .env, docker-compose.yml) making it easy to find, but the path traversal exploit path requires connecting the `/resource` endpoint to the FLAG file location.

**Documentation** is completely absent. There is no README.md, no API documentation, no architecture diagrams, no security documentation, no deployment guide, no contribution guide. The only "documentation" is the code itself and the self-explanatory file structure. This minimal approach is consistent with a CTF challenge where participants are expected to discover functionality through reconnaissance and analysis.

In summary, this is an **intentionally vulnerable application** designed as a security challenge. The codebase structure is simple and follows Flask conventions, making it easy to understand, but it completely lacks security components, testing, documentation, and defensive coding practices. The minimal approach means all security-relevant components are easily discoverable through basic directory traversal and file reading, but understanding the full attack surface requires analyzing both Python code and Apache configuration to identify the path traversal vulnerability that bypasses the intended FLAG file protection.

---

## 8. Critical File Paths

All file paths referenced in this analysis, categorized by security relevance for manual review prioritization:

### Configuration Files
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/.env` - **CRITICAL:** Contains FLAG in plaintext
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml` - Orchestration config with FLAG as build argument
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/Dockerfile` - **CRITICAL:** FLAG written to static file at line 21
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` - **CRITICAL:** Apache config with CORS, directory listing, FilesMatch directive
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/Makefile` - Build automation

### Authentication & Authorization
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` - **CRITICAL:** All endpoints, including vulnerable `/resource` (lines 16-19) and fake login (lines 9-13)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/__init__.py` - Flask app initialization, missing SECRET_KEY
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/templates/login.html` - Login form with client-side-only validation

### API & Routing
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` - All routes defined (3 endpoints total)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/application.wsgi` - WSGI entry point
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/run.py` - Development server runner (not used in production)

### Data Models & DB Interaction
- **NONE** - No database implementation exists

### Dependency Manifests
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/requirements.txt` - Single dependency: `flask` (no version pinning)

### Sensitive Data & Secrets Handling
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/.env` - **CRITICAL:** FLAG value in plaintext
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/Dockerfile` - **CRITICAL:** Line 21 writes FLAG to static/flag
- `/var/www/webapp/app/static/flag` - **CRITICAL:** Runtime location of FLAG file (inside container)

### Middleware & Input Validation
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` - **CRITICAL:** Line 18 - No input validation on filename parameter

### Logging & Monitoring
- **NONE** - No logging implementation exists

### Infrastructure & Deployment
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml` - Service orchestration
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/Dockerfile` - Container build definition
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/webapp-httpd.conf` - **CRITICAL:** Apache virtual host and security headers config

### CTF Flag Storage
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/.env` - **HIGH-VALUE:** FLAG environment variable (line 1)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/Dockerfile` - **HIGH-VALUE:** FLAG written to static file (line 21)
- `/var/www/webapp/app/static/flag` - **HIGH-VALUE:** Runtime FLAG file location
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml` - **HIGH-VALUE:** FLAG as build argument (line 6)

### Static Assets
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/static/css/bootstrap.min.css` - Bootstrap CSS
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/static/css/style.css` - Custom styles
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/static/js/bootstrap.bundle.min.js` - Bootstrap JavaScript

---

## 9. XSS Sinks and Render Contexts

**FINDING: NO XSS SINKS FOUND IN NETWORK-ACCESSIBLE CODE**

After comprehensive analysis of all network-accessible endpoints, templates, and JavaScript code, **no dangerous XSS (Cross-Site Scripting) sinks were identified**. The application demonstrates secure coding practices with respect to XSS prevention, primarily due to its minimal functionality and Flask's default Jinja2 autoescaping.

### Methodology

The XSS analysis examined:
- All Jinja2 templates for unsafe output contexts
- All JavaScript code for dangerous DOM manipulation APIs
- All route handlers for user input reflection
- All response generation for unescaped output

### Files Analyzed

**Python Application Files:**
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` - All endpoint handlers
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/__init__.py` - App initialization

**Template Files:**
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/templates/login.html` - Login page template

**Static JavaScript:**
- Inline JavaScript in login.html (lines 48-67)

### Category-by-Category Analysis

#### ✅ HTML Body Context - No Sinks Found

**Patterns Searched:**
- `innerHTML`, `outerHTML`
- `document.write()`, `document.writeln()`
- `element.insertAdjacentHTML()`
- `Range.createContextualFragment()`
- jQuery: `.html()`, `.append()`, `.prepend()`, `.replaceWith()`, `.wrap()`

**Finding:** The login.html template contains **no user input reflection in HTML**. The only dynamic content uses Flask's `url_for()` function which generates safe, sanitized URLs:

```html
<!-- File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/templates/login.html -->
<!-- Line 8: CSS resource loading -->
<link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">

<!-- Line 17: Form action URL -->
<form id="loginForm" action="{{ url_for('login') }}" method="post">
```

Both `url_for()` calls use **hardcoded, static parameters** with no user input. Jinja2's default autoescaping ensures these values are HTML-escaped, though in this case they're already safe.

**No Vulnerabilities:** User input is never reflected in HTML body context.

#### ✅ HTML Attribute Context - No Sinks Found

**Patterns Searched:**
- Event handlers: `onclick`, `onerror`, `onmouseover`, `onload`, `onfocus`
- URL attributes: `href`, `src`, `formaction`, `action`, `background`, `data`
- Style attribute: `style`
- Iframe: `srcdoc`

**Finding:** The login.html template contains **no inline event handlers** and **no user-controlled attribute values**. All attributes use static or safe values:

```html
<!-- Static href values -->
<link href="/resource?filename=css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">

<!-- Static src values -->
<script src="/resource?filename=js/bootstrap.bundle.min.js"></script>

<!-- Static form action -->
<form id="loginForm" action="{{ url_for('login') }}" method="post">
```

While the `/resource?filename=` URLs use a vulnerable endpoint, these are **hardcoded in the template** and not derived from user input. The path traversal vulnerability in the `/resource` endpoint is a **file disclosure issue**, not an XSS vulnerability.

**No Vulnerabilities:** No user input influences HTML attributes.

#### ✅ JavaScript Context - No Sinks Found

**Patterns Searched:**
- `eval()`
- `Function()` constructor
- `setTimeout()` with string argument
- `setInterval()` with string argument
- User data written into `<script>` tags

**Finding:** The login.html template contains inline JavaScript (lines 48-67) that uses **safe DOM manipulation only**:

```javascript
// File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/templates/login.html
// Lines 48-67

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginForm');
    const loginAlert = document.getElementById('loginAlert');

    form.addEventListener('submit', function(event) {
        event.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        // Always display error message
        document.getElementById('loginAlert').classList.remove('d-none');
    });
});
```

**Security Analysis:**
- No `eval()` or `Function()` usage
- No dynamic code execution
- User input (`username`, `password`) is **read but never used** - values are retrieved but only stored in local variables and then ignored
- No user input is written to the DOM
- Only safe DOM APIs used: `getElementById()`, `classList.remove()`, `addEventListener()`

**No Vulnerabilities:** No dangerous JavaScript execution with user input.

#### ✅ URL Context - No Sinks Found

**Patterns Searched:**
- `location.href` assignment
- `location.replace()`
- `location.assign()`
- `window.open()`
- `history.pushState()`
- `history.replaceState()`

**Finding:** No JavaScript code manipulates browser location or history with user input. All redirects are **server-side** using Flask's `redirect()`:

```python
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py

# Line 7 - Static redirect
return redirect(url_for('login'))

# Line 12 - Static redirect
return redirect(url_for('login'))
```

Both redirects use hardcoded `url_for('login')` with no user input.

**No Vulnerabilities:** No user-controlled redirects in JavaScript context.

#### ✅ Server-Side Template Injection (SSTI) - No Sinks Found

**Patterns Searched:**
- Jinja2 `| safe` filter
- Jinja2 `| raw` filter
- `{% autoescape false %}`
- `render_template_string()` with user input
- `Markup()` with user input

**Finding:** The login.html template uses **only two Jinja2 expressions**, both with safe, static values:

```html
<!-- Line 8 -->
{{ url_for('static', filename='css/style.css') }}

<!-- Line 17 -->
{{ url_for('login') }}
```

**Security Analysis:**
- No user input passed to Jinja2 templates
- No `| safe` or `| raw` filters used
- Default Jinja2 autoescaping enabled (Flask default)
- No `render_template_string()` usage with user input
- The `/login` POST handler never passes user data to `render_template()`:

```python
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py
# Lines 9-13

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        return redirect(url_for('login'))  # No template rendering
    return render_template('login.html')  # No variables passed
```

**No Vulnerabilities:** No template injection vectors.

#### ✅ SQL Injection - Not Applicable

**Finding:** No database implementation exists. No SQL queries, no database connections, no ORM usage.

**See Section 4 (Data Security & Storage)** for complete database analysis.

#### ✅ Command Injection - Not Applicable

**Finding:** No system command execution in application code. No `os.system()`, `subprocess`, `eval()`, `exec()` usage.

### User Input Flow Analysis

All user input sources were traced to ensure no XSS sinks:

**Input Source 1: Query Parameters (`/resource?filename=`)**
- **Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (line 18)
- **Code:** `filename = request.args.get('filename')`
- **Usage:** Passed to `send_from_directory('static', filename)`
- **Output:** File contents served as-is (not reflected in HTML)
- **XSS Risk:** **NONE** - This is a file disclosure vulnerability (path traversal), not an XSS sink
- **Explanation:** The file contents are served with appropriate MIME types by Flask's `send_from_directory()`, which sends files as downloads or renders them according to their Content-Type. The filename parameter is not reflected in HTML output, so there's no XSS vector.

**Input Source 2: POST Form Data (`/login` username/password)**
- **Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/templates/login.html` (lines 19-30)
- **Fields:** `username`, `password`
- **Backend Handling:** **COMPLETELY IGNORED** by server (lines 11-12 of routes.py - POST handler just redirects)
- **Frontend Handling:** Read by JavaScript but never used or written to DOM (lines 55-56 of login.html)
- **XSS Risk:** **NONE** - Input is never reflected in any context

**Input Source 3: HTTP Request Method**
- **Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (line 11)
- **Code:** `if request.method == 'POST':`
- **Usage:** Control flow only, not reflected in output
- **XSS Risk:** **NONE**

### Why No XSS Sinks Exist

The application's minimal functionality and design choices result in no XSS vulnerabilities:

1. **No User Input Reflection:** The application never reflects user input in HTML, JavaScript, or attributes
2. **Jinja2 Autoescaping:** Flask's default template configuration has autoescaping enabled, which would escape any user input if it were reflected
3. **Minimal Dynamic Content:** Only two Jinja2 expressions exist, both using static `url_for()` calls
4. **No Database:** No stored XSS possible (no user-generated content stored and displayed)
5. **Client-Side Validation Only:** JavaScript reads form values but never writes them to the DOM
6. **Safe DOM APIs:** Only safe DOM manipulation (`classList.remove()`, `getElementById()`)

### Path Traversal vs. XSS Clarification

**Important Distinction:** The `/resource?filename=` endpoint has a **path traversal vulnerability** (arbitrary file read), which is a **separate vulnerability class from XSS**:

- **Path Traversal:** Allows reading arbitrary files from the server filesystem (file disclosure)
- **XSS:** Allows executing JavaScript in victim's browser (code execution in client context)

The `/resource` endpoint serves files with their appropriate MIME types (CSS as `text/css`, JS as `application/javascript`, etc.). While an attacker could potentially access the flag file, they cannot inject JavaScript that executes in a victim's browser via this endpoint. If an attacker requests `/resource?filename=flag`, the server returns the file contents as a download or renders it according to its MIME type, but does NOT reflect the filename in HTML where it could be exploited for XSS.

### Conclusion

**NO XSS SINKS FOUND** in network-accessible code.

The Flask application follows secure coding practices for XSS prevention:
- ✅ No user input reflected in HTML/JavaScript/attributes
- ✅ Jinja2 autoescaping enabled by default
- ✅ No unsafe template filters (`| safe`, `| raw`)
- ✅ No dynamic code execution (`eval()`, `Function()`)
- ✅ No unsafe DOM manipulation (`innerHTML`, `document.write()`)
- ✅ Minimal attack surface due to limited functionality

While the application has a **critical path traversal vulnerability**, it does **not** have XSS vulnerabilities. The limited functionality (static login form with client-side validation that prevents submission, and a file server endpoint) significantly reduces the attack surface for XSS.

---

## 10. SSRF Sinks

**FINDING: NO SSRF SINKS FOUND IN NETWORK-ACCESSIBLE CODE**

After comprehensive analysis of all Python code, dependencies, and network-accessible components, **no SSRF (Server-Side Request Forgery) sinks were identified**. The application does not make any server-side HTTP requests, URL fetches, or external network connections that could be influenced by user input.

### Methodology

The SSRF analysis systematically searched for all categories of server-side request mechanisms that could be exploited if user input were incorporated. The analysis examined source code, dependencies, and configuration files for any network request capabilities.

### Files Analyzed

**Python Application Files:**
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py` (19 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/__init__.py` (7 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/run.py` (4 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/application.wsgi` (2 lines)

**Dependencies:**
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/requirements.txt` - Only `flask`

**Configuration Files:**
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml`
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/Dockerfile`

### Category-by-Category Analysis

#### ✅ HTTP(S) Clients - Not Found

**Patterns Searched:**
- `requests` library (`requests.get()`, `requests.post()`, etc.)
- `urllib.request.urlopen()`, `urllib.request.Request()`
- `httplib`, `http.client`
- `httpx`, `aiohttp`
- `urllib3`

**Finding:** **NO HTTP client libraries** are imported or used in the application code.

**Dependencies Check:**
```
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/requirements.txt
flask
```

Only Flask is installed - no HTTP client libraries in dependencies.

**Code Analysis:** Comprehensive search of all Python files found **no import statements** for HTTP client libraries:
- No `import requests`
- No `import urllib.request`
- No `import httplib` or `http.client`
- No HTTP client usage whatsoever

**No SSRF Sinks in HTTP Client Category.**

#### ✅ Raw Sockets & Connect APIs - Not Found

**Patterns Searched:**
- `socket.connect()`, `socket.socket()`
- Raw socket operations
- TCP/UDP socket creation

**Finding:** No socket programming detected in application code. No `import socket` statements found.

**No SSRF Sinks in Socket Category.**

#### ✅ URL Openers & File Includes - Analyzed

**Patterns Searched:**
- `urllib.request.urlopen()`
- `open()` with URLs
- File operations with remote resources

**Finding:** The `/resource` endpoint uses `send_from_directory()` for **local file operations only**:

```python
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py
# Lines 16-19

@app.route('/resource')
def resource():
    filename = request.args.get('filename')
    return send_from_directory('static', filename)
```

**Security Analysis:**
- **Operation:** `send_from_directory('static', filename)`
- **Type:** Local filesystem operation, **NOT a network request**
- **Behavior:** Serves files from local `static/` directory
- **Flask's Implementation:** `send_from_directory()` uses `werkzeug.security.safe_join()` internally to prevent directory traversal outside the specified directory, then opens the file from the local filesystem
- **SSRF Risk:** **NONE** - This does not make HTTP requests or fetch external resources
- **Actual Vulnerability:** Path traversal (file disclosure), not SSRF

**Critical Distinction:** While this endpoint has a security vulnerability (path traversal allowing unauthorized file access), it is **NOT an SSRF sink** because:
1. It does not make server-side requests to external URLs
2. It does not fetch remote resources
3. It serves local files only
4. The filename parameter cannot be used to specify URLs or external resources

**No SSRF Sinks in URL Opener Category.**

#### ✅ Redirect & Location Headers - Analyzed

**Patterns Searched:**
- `redirect()` with user input
- `Location` header with user-controlled values

**Finding:** All redirects use **hardcoded, static values** with no user input:

```python
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/app/website/app/routes.py

# Line 7 - Root endpoint redirect
return redirect(url_for('login'))

# Line 12 - Login POST handler redirect
return redirect(url_for('login'))
```

**Security Analysis:**
- Both `redirect()` calls use Flask's `url_for('login')` which generates internal URLs
- **No user input** influences redirect destinations
- `url_for()` is a safe helper that generates URLs based on route names, not user input
- No open redirect vulnerability

**Open Redirect vs. SSRF:** While open redirect vulnerabilities can sometimes be chained with SSRF attacks, this application has neither:
- **No open redirect:** All redirects are to hardcoded internal routes
- **No SSRF:** No server-side requests made

**No SSRF Sinks in Redirect Category.**

#### ✅ Headless Browsers & Render Engines - Not Found

**Patterns Searched:**
- Puppeteer (`page.goto()`, `page.setContent()`)
- Playwright (`page.navigate()`)
- Selenium WebDriver
- PDF generators (wkhtmltopdf, WeasyPrint, Puppeteer PDF)
- HTML-to-PDF converters

**Finding:** No browser automation or PDF generation libraries detected.

**No SSRF Sinks in Browser/Render Category.**

#### ✅ Media Processors - Not Found

**Patterns Searched:**
- ImageMagick (`convert`, `identify`)
- GraphicsMagick
- FFmpeg
- Pillow/PIL with URL inputs
- Image optimization with URL parameters

**Finding:** No image or media processing libraries detected. No `import PIL`, `import imagemagick`, or similar.

**No SSRF Sinks in Media Processor Category.**

#### ✅ Link Preview & Unfurlers - Not Found

**Patterns Searched:**
- Link preview generators
- oEmbed fetchers
- Metadata extractors
- Social media card generators

**Finding:** No link preview or metadata extraction functionality exists.

**No SSRF Sinks in Link Preview Category.**

#### ✅ Webhook Testers & Callback Verifiers - Not Found

**Patterns Searched:**
- Webhook handlers with outbound requests
- Callback verification endpoints
- "Ping this URL" functionality
- Health check notifications to external URLs

**Finding:** No webhook or callback functionality detected. The Docker healthcheck in `docker-compose.yml` uses curl to request `http://localhost:80/` (internal loopback), which is:
1. **Not user-controllable** (hardcoded in docker-compose.yml)
2. **Not accessible via network** (internal Docker orchestration)
3. **Not an SSRF vector**

**No SSRF Sinks in Webhook Category.**

#### ✅ SSO/OIDC Discovery & JWKS Fetchers - Not Found

**Patterns Searched:**
- OpenID Connect discovery endpoints (`/.well-known/openid-configuration`)
- JWKS (JSON Web Key Set) fetchers
- OAuth authorization server metadata
- SAML metadata fetchers

**Finding:** No SSO, OAuth, OIDC, or SAML implementation detected. See Section 3 (Authentication & Authorization) for complete analysis.

**No SSRF Sinks in SSO/OIDC Category.**

#### ✅ Importers & Data Loaders - Not Found

**Patterns Searched:**
- "Import from URL" functionality
- CSV/JSON/XML remote loaders
- RSS/Atom feed readers
- Remote configuration fetchers

**Finding:** No data import or remote loading functionality detected. The application has no database or data persistence mechanisms.

**No SSRF Sinks in Data Import Category.**

#### ✅ Package/Plugin Installers - Not Found

**Patterns Searched:**
- "Install from URL" features
- Plugin/theme downloaders
- Remote package installation

**Finding:** No plugin or package installation functionality. The application has no extensibility mechanisms.

**No SSRF Sinks in Package Installer Category.**

#### ✅ Monitoring & Health Checks - Analyzed

**Patterns Searched:**
- URL pingers
- Uptime checkers
- Monitoring probes with external URLs
- Alerting webhook senders

**Finding:** Docker healthcheck exists but is **not user-controllable**:

```yaml
# File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-019-24/docker-compose.yml
# Lines 11-15

healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:80/"]
  timeout: 1s
  retries: 5
  interval: 10s
```

**Security Analysis:**
- Hardcoded URL: `http://localhost:80/`
- **Not accessible from network** - internal Docker orchestration
- **Not user-controllable** - defined in compose configuration
- **Not an SSRF vector** - no user input influences this

**No SSRF Sinks in Monitoring Category.**

#### ✅ Cloud Metadata Helpers - Not Found

**Patterns Searched:**
- AWS/GCP/Azure metadata API calls (`http://169.254.169.254/`)
- Cloud service discovery
- Container orchestration API clients
- Infrastructure metadata fetchers

**Finding:** No cloud metadata access detected. The application does not interact with cloud provider APIs.

**No SSRF Sinks in Cloud Metadata Category.**

#### ✅ Subprocess/Command Execution - Not Found

**Patterns Searched:**
- `subprocess.run()`, `subprocess.call()`, `subprocess.Popen()`
- `os.system()`, `os.popen()`
- `exec()`, `eval()` with network tools (curl, wget)

**Finding:** No command execution in application code.

**Note:** The Dockerfile contains `curl` installation (line 8) and curl is used in the Docker healthcheck, but:
1. Curl is **not called from application code**
2. Healthcheck curl is **not user-controllable**
3. **No command injection vector exists** in the application

**No SSRF Sinks in Command Execution Category.**

#### ✅ XML/JSON Parsers with External Entities - Not Found

**Patterns Searched:**
- XML parsers (`xml.etree`, `lxml`, `defusedxml`)
- JSON parsers with URL references
- XXE (XML External Entity) vectors

**Finding:** No XML or JSON parsing with external entity support.

**No SSRF Sinks in XML/JSON Parser Category.**

### Network-Accessible Endpoints Review

All three endpoints were examined for SSRF potential:

**Endpoint 1: `GET /`**
- No network operations
- Simple redirect to `/login`
- **SSRF Risk:** None

**Endpoint 2: `GET/POST /login`**
- No network operations
- Renders template (GET) or redirects (POST)
- **SSRF Risk:** None

**Endpoint 3: `GET /resource?filename=`**
- **File operation, not network operation**
- Uses `send_from_directory('static', filename)`
- Serves local files only
- **SSRF Risk:** None (has path traversal risk instead)

### Conclusion

**NO SSRF SINKS FOUND** in network-accessible code.

The Flask application:
- ✅ Does NOT import or use any HTTP client libraries (`requests`, `urllib`, `httplib`, `httpx`)
- ✅ Does NOT make server-side requests to external resources
- ✅ Does NOT process URLs from user input for fetching
- ✅ Does NOT execute commands that could perform network requests with user input
- ✅ Does NOT forward or proxy requests to other servers
- ✅ Does NOT use redirect mechanisms with user-controlled destinations
- ✅ Has only local file operations (not network operations)

**Key Distinction:** The `/resource` endpoint's path traversal vulnerability is a **file disclosure vulnerability (LFI - Local File Inclusion)**, not an SSRF vulnerability. While both vulnerabilities involve accessing unauthorized resources, they operate in different contexts:
- **SSRF:** Server makes HTTP requests to URLs (network-based)
- **Path Traversal/LFI:** Server reads files from filesystem (filesystem-based)

**Recommendation:** While the application is not vulnerable to SSRF, the `/resource` endpoint should be reviewed for **Path Traversal** vulnerabilities as it accepts user-controlled filenames without validation. This vulnerability is documented in Section 5 (Attack Surface Analysis) and Section 4 (Data Flow Security).

---

**END OF CODE ANALYSIS DELIVERABLE**