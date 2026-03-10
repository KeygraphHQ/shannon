# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is an extremely simple Flask application with only 3 network-accessible endpoints and 27 lines of Python code.

**Critical Finding:** This application has **ZERO authentication and authorization mechanisms**. All endpoints are publicly accessible, and the primary vulnerability is a path traversal issue in the `/resource` endpoint that allows arbitrary file access within the static directory.

**Key Sections:**
- **Section 3:** Non-functional authentication - login endpoint exists but performs no validation
- **Section 4:** Complete API endpoint inventory (3 endpoints total)
- **Section 5:** Input vectors for vulnerability analysis
- **Section 7:** Authorization analysis reveals complete absence of role-based access control
- **Section 9:** Injection source analysis - path traversal vulnerability

**Priority for Testing:** Focus on the `/resource` endpoint path traversal vulnerability and complete lack of authentication/authorization controls.

## 1. Executive Summary

This is a minimal Flask web application deployed in a Docker container running Apache HTTP Server 2.4.x with mod_wsgi on Debian Bullseye. The application consists of only **3 HTTP endpoints** with approximately **27 lines of Python code**, exposing a **critical path traversal vulnerability** that allows unauthorized access to files in the static directory, including a sensitive CTF flag.

**Core Technology Stack:**
- **Frontend:** Bootstrap 5.x (CSS/JS served locally), minimal HTML template
- **Backend:** Python Flask (version unpinned), no database, no authentication framework
- **Infrastructure:** Apache HTTP Server 2.4.x, mod_wsgi, Docker containerization
- **Deployment:** HTTP-only (port 80), no TLS/HTTPS

**Primary Attack Vector:** The `/resource` endpoint accepts an unsanitized `filename` parameter and uses it directly with Flask's `send_from_directory()` function, allowing attackers to bypass Apache's file access restrictions and read arbitrary files from the static directory.

**Security Posture:** **Critically vulnerable** with complete absence of defensive mechanisms:
- No authentication (login is non-functional)
- No authorization (all endpoints public)
- No input validation
- No session management
- No CSRF protection
- No security headers (except misconfigured CORS)
- No rate limiting
- No logging beyond Apache defaults

The application appears to be a CTF challenge or deliberately vulnerable training application rather than production-grade software.

## 2. Technology & Service Map

### Frontend
- **Framework:** Bootstrap 5.x (CSS and JavaScript)
- **Template Engine:** Jinja2 (Flask default)
- **Authentication Libraries:** None
- **Key Libraries:** Bootstrap only (served locally, no CDN usage)

### Backend
- **Language:** Python 3.x (version unspecified)
- **Framework:** Flask (version unpinned in requirements.txt)
- **Key Dependencies:** Flask only (no security extensions)
- **Database:** None (completely stateless application)
- **ORM:** None

### Infrastructure
- **Hosting:** Docker container (Debian Bullseye base image)
- **Web Server:** Apache HTTP Server 2.4.x with mod_wsgi-py3
- **CDN:** None
- **Database Type:** None
- **Container Runtime:** Docker (running as root user)

### Identified Subdomains
- **None discovered** - Application runs on localhost:34549

### Open Ports & Services (from nmap)
- **Port 22/tcp:** SSH (OpenSSH 9.9) - Out of scope for web application testing
- **Port 80/tcp (inferred):** HTTP - Apache serving Flask application
- **Port 34549 (actual):** Target application port

### Network Configuration
- **Protocol:** HTTP only (no HTTPS/TLS)
- **Binding:** 0.0.0.0 (all interfaces, publicly accessible)
- **CORS:** Wildcard `Access-Control-Allow-Origin: *` (Apache config line 9)

## 3. Authentication & Session Management Flow

### Entry Points
- **GET /login** - Renders login form template
- **POST /login** - Non-functional login handler (redirects back to login page)

### Mechanism
**CRITICAL FINDING:** Authentication is **completely non-functional**. The step-by-step process reveals:

1. **User accesses application** → Any URL redirects to `/login`
2. **Login form displayed** → Form collects username and password (routes.py:9, login.html:17-33)
3. **User submits credentials** → Client-side JavaScript **prevents form submission** with `event.preventDefault()` (login.html:55)
4. **If form were submitted** → Server redirects back to `/login` without processing credentials (routes.py:11-12)
5. **No session created** → No authentication state maintained anywhere
6. **All endpoints remain public** → Complete unrestricted access

**Code Evidence:**
```python
# File: /app/website/app/routes.py:9-13
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        return redirect(url_for('login'))  # Ignores all credentials
    return render_template('login.html')
```

**Client-Side JavaScript (login.html:48-66):**
```javascript
document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();  // BLOCKS SUBMISSION
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    // Displays error without server interaction
    document.getElementById('errorMessage').style.display = 'block';
});
```

### Code Pointers
- **Login Handler:** `/app/website/app/routes.py:9-13` - Non-functional POST handler
- **Login Template:** `/app/website/app/templates/login.html:17-33` - Form definition
- **Client-Side Logic:** `/app/website/app/templates/login.html:48-66` - JavaScript prevents submission
- **Flask Initialization:** `/app/website/app/__init__.py:1-7` - No SECRET_KEY, no session config

### 3.1 Role Assignment Process

**Role Determination:** NOT IMPLEMENTED - No role system exists
**Default Role:** N/A - All users are effectively anonymous
**Role Upgrade Path:** NOT IMPLEMENTED - No role management
**Code Implementation:** None - No role-related code exists in the application

### 3.2 Privilege Storage & Validation

**Storage Location:** NOT IMPLEMENTED - No privilege data stored anywhere
**Validation Points:** NONE - No authorization checks on any endpoint
**Cache/Session Persistence:** NOT APPLICABLE - No sessions created
**Code Pointers:** No privilege validation code exists

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NONE
**Role Switching:** NONE
**Audit Trail:** NONE - No logging beyond Apache access logs
**Code Implementation:** Not implemented

## 4. API Endpoint Inventory

**Network Surface Focus:** All 3 endpoints are network-accessible through the target web application.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None | Simple redirect to /login. See routes.py:5-7 |
| GET | `/login` | anon | None | None | Renders login form template. See routes.py:9-13 |
| POST | `/login` | anon | None | None | Non-functional login handler - redirects back to /login without processing credentials. See routes.py:9-13 |
| GET | `/resource` | anon | filename (query param) | None | **CRITICAL VULNERABILITY**: Serves files from static directory without authentication or validation. Allows path traversal to access arbitrary files including CTF flag. See routes.py:16-19 |

### Endpoint Details

#### Endpoint 1: Root Redirect
- **Path:** `/`
- **File:** routes.py:5-7
- **Handler:** `index()`
- **Authentication:** None
- **Parameters:** None
- **Response:** HTTP 302 redirect to `/login`

#### Endpoint 2: Login Page
- **Path:** `/login` (GET, POST)
- **File:** routes.py:9-13
- **Handler:** `login()`
- **Authentication:** None
- **Parameters:** 
  - POST body: `username`, `password` (declared in HTML but never processed by backend)
- **Response:** 
  - GET: Renders login.html template
  - POST: HTTP 302 redirect back to `/login`
- **Security Issues:** No CSRF protection, credentials transmitted over HTTP (if form were functional)

#### Endpoint 3: Static Resource Serving (CRITICAL)
- **Path:** `/resource`
- **File:** routes.py:16-19
- **Handler:** `resource()`
- **Authentication:** None (CRITICAL - allows anonymous file access)
- **Parameters:**
  - Query: `filename` (UNSANITIZED user input)
- **Response:** File content from static directory
- **Vulnerability:** Path traversal, unauthorized file access, information disclosure

**Code:**
```python
@app.route('/resource')
def resource():
    filename = request.args.get('filename')
    return send_from_directory('static', filename)
```

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors below are accessible through the target web application's HTTP interface.

### URL Parameters
- **`filename`** (GET /resource) - **CRITICAL VULNERABILITY**
  - File: routes.py:18
  - Type: Query string parameter
  - Validation: None
  - Used in: `send_from_directory('static', filename)`
  - Risk: Path traversal, arbitrary file access within static directory

### POST Body Fields (JSON/Form)
- **`username`** (POST /login)
  - Declared in: login.html:20
  - Server-side access: **NONE** (not read by backend)
  - Validation: HTML5 `required` attribute only (client-side)
  - Risk: None (input ignored by server)

- **`password`** (POST /login)
  - Declared in: login.html:27
  - Server-side access: **NONE** (not read by backend)
  - Validation: HTML5 `required` attribute only (client-side)
  - Risk: None (input ignored by server)

### HTTP Headers
- **No custom headers** are read or processed by the application
- Standard headers (Host, User-Agent, etc.) handled by Flask/Apache defaults

### Cookie Values
- **No cookies** are read or set by the application
- No session cookies
- No tracking cookies

### File Uploads
- **None** - No file upload functionality exists

## 6. Network & Interaction Map

**Network Surface Focus:** Only network-accessible components of the deployed application are mapped.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| ExternalUser | ExternAsset | Internet | Browser | None | Anonymous attacker/user accessing application |
| FlaskWebApp | Service | App | Python/Flask | Flag, Public | Main application backend (3 endpoints) |
| ApacheServer | Service | Edge | Apache 2.4.x/mod_wsgi | Public | Web server proxying to Flask via WSGI |
| StaticFileStore | DataStore | App | Filesystem | Flag, Public | Static directory containing CSS, JS, and CTF flag |
| LoginTemplate | Service | App | Jinja2 | Public | Non-functional login form |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| FlaskWebApp | Hosts: `http://localhost:34549`; Endpoints: `/`, `/login`, `/resource`; Auth: **NONE**; Sessions: **NONE**; Database: **NONE**; Dependencies: StaticFileStore, ApacheServer |
| ApacheServer | Engine: `Apache 2.4.x`; Modules: `mod_wsgi-py3`; Protocol: `HTTP` (no TLS); CORS: `Access-Control-Allow-Origin: *` (wildcard); FilesMatch: Attempts to block `/static/flag` but bypassable via Flask |
| StaticFileStore | Location: `/var/www/webapp/app/static/`; Contents: `css/bootstrap.min.css`, `css/style.css`, `js/bootstrap.bundle.min.js`, `flag` (CTF target); Permissions: World-readable; Encryption: **NONE** |
| LoginTemplate | File: `templates/login.html`; Function: Displays non-functional login form; Client-Side: JavaScript prevents form submission; Server-Side: No credential validation |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ExternalUser → ApacheServer | HTTP | `:34549 /` | None | Public |
| ExternalUser → ApacheServer | HTTP | `:34549 /login` | None | Public |
| ExternalUser → ApacheServer | HTTP | `:34549 /resource?filename=*` | **None (CRITICAL)** | Flag, Public |
| ApacheServer → FlaskWebApp | WSGI | `application.wsgi` | None | Flag, Public |
| FlaskWebApp → StaticFileStore | Filesystem | `static/*` | None | Flag, Public |
| FlaskWebApp → LoginTemplate | Template | `templates/login.html` | None | Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | **NO GUARDS EXIST** - All endpoints completely unprotected |
| FilesMatch (Apache) | Network | Attempts to block direct access to `/static/flag` but is **BYPASSABLE** via Flask `/resource` endpoint |

**Note:** The complete absence of authorization guards is the primary security failure of this application.

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**CRITICAL FINDING:** **ZERO roles exist** in this application.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (only level) | Global | All users are anonymous - no authentication exists |

**Analysis:** No role system, no user model, no privilege levels, no authentication framework.

### 7.2 Privilege Lattice

```
FLAT PRIVILEGE MODEL (No Hierarchy)

anonymous (all users)
  │
  └─> Access to ALL endpoints (/, /login, /resource)
  
No role transitions possible (no authentication)
No privilege escalation possible (all users already have full access)
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anonymous | `/` → redirects to `/login` | `/*` (all routes) | None |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | Not applicable |

**Conclusion:** No role-based access control exists. All code executes with identical privilege level for all users.

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**Note:** Since there is no authentication, horizontal privilege escalation is not applicable in the traditional sense. However, the `/resource` endpoint allows access to any file in the static directory:

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|-----------------|---------------------|-----------|-------------|
| **CRITICAL** | `/resource?filename=*` | filename | flag, static_files | **CTF flag accessible** |
| High | `/resource?filename=flag` | filename | flag | Sensitive CTF flag value |
| Medium | `/resource?filename=css/*` | filename | static_css | Public CSS files |
| Low | `/resource?filename=js/*` | filename | static_js | Public JavaScript files |

### 8.2 Vertical Privilege Escalation Candidates

**Not Applicable:** No role hierarchy exists. All users have identical access to all endpoints.

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|-----------------|---------------|------------|
| N/A | No privileged roles exist | N/A | N/A |

### 8.3 Context-Based Authorization Candidates

**Not Applicable:** No multi-step workflows exist in this minimal application.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| N/A | No workflows exist | N/A | N/A |

### 8.4 Critical Authorization Gaps

**ALL endpoints lack authorization:**
1. `GET /` - Publicly accessible (low risk - simple redirect)
2. `GET /login` - Publicly accessible (expected for login page)
3. `POST /login` - Publicly accessible, no CSRF protection
4. **`GET /resource` - CRITICAL - Publicly accessible file server with no access control**

## 9. Injection Sources (Command Injection, SQL Injection, LFI/RFI, SSTI, Path Traversal, Deserialization)

**Network Surface Focus:** Only injection sources accessible through network HTTP requests are reported.

### INJECTION SOURCE #1: Path Traversal / Local File Inclusion

**Vulnerability Type:** Path Traversal / Arbitrary File Access  
**Severity:** HIGH  
**CWE:** CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)

**INPUT:**
- **Endpoint:** GET /resource
- **Parameter:** `filename`
- **Source:** Query string (request.args)
- **File:Line:** routes.py:18
- **Code:**
```python
filename = request.args.get('filename')
```

**DATA FLOW:**
```
Step 1: User input received
  → File: routes.py:18
  → Code: filename = request.args.get('filename')
  → Variable: filename (unsanitized)

Step 2: Passed directly to file operation
  → File: routes.py:19
  → Code: return send_from_directory('static', filename)
  → Sink: send_from_directory() with user-controlled path
```

**SINK:**
- **Function:** `send_from_directory('static', filename)`
- **Type:** File system operation
- **File:Line:** routes.py:19
- **Dangerous Pattern:** User input directly controls file path parameter

**VALIDATION:**
- **Present:** NO
- **Type:** None
- **Sanitization:** None
- **Allowlist:** None
- **Path Normalization:** Flask's `send_from_directory()` has built-in protections, but no application-level validation

**EXPLOITATION:**
- **Proof of Concept:** `GET /resource?filename=flag`
- **Impact:** Access to CTF flag and any file in static directory
- **Apache Bypass:** This bypasses Apache's FilesMatch directive (webapp-httpd.conf:24-27) which attempts to block `/static/flag`

**Attack Vectors:**
```
# Baseline - access flag
GET /resource?filename=flag

# Access other static files
GET /resource?filename=css/bootstrap.min.css
GET /resource?filename=js/bootstrap.bundle.min.js

# Potential directory traversal attempts (Flask should block)
GET /resource?filename=../routes.py
GET /resource?filename=../../run.py
GET /resource?filename=..%2f..%2frun.py
```

### INJECTION SOURCE #2-8: NOT PRESENT

**SQL Injection:** NOT VULNERABLE
- **Reason:** No database exists, no SQL queries in code
- **Evidence:** No ORM, no database drivers in requirements.txt

**Command Injection:** NOT VULNERABLE
- **Reason:** No system command execution in code
- **Evidence:** No `os.system()`, `subprocess`, `eval()`, `exec()` usage

**Server-Side Template Injection (SSTI):** NOT VULNERABLE
- **Reason:** No user input rendered in templates, no `render_template_string()`
- **Evidence:** Static template with no dynamic user content

**Deserialization:** NOT VULNERABLE
- **Reason:** No deserialization operations
- **Evidence:** No `pickle`, `yaml.load()`, `marshal` usage

**LDAP Injection:** NOT VULNERABLE
- **Reason:** No LDAP operations

**XPath/XML Injection:** NOT VULNERABLE
- **Reason:** No XML parsing

**Code Injection:** NOT VULNERABLE
- **Reason:** No `eval()`, `exec()`, or dynamic code execution with user input

### Summary of Injection Analysis

**Total Injection Sources:** 1 (Path Traversal via /resource endpoint)

**Critical Findings:**
1. **Path Traversal** - High severity - Allows arbitrary file access within static directory
2. **No Authentication** - All endpoints including vulnerable `/resource` are publicly accessible
3. **No Input Validation** - Complete absence of validation on user input

**Positive Findings:**
- No SQL injection (no database)
- No command injection (no shell execution)
- No SSTI (static templates)
- No dangerous deserialization

---

## 10. Additional Security Observations

### Infrastructure Security

**Secrets Management:**
- **CTF Flag:** Stored in plaintext in `.env` file, baked into Docker image at build time
- **Build Artifact:** Flag visible in `docker history` output
- **Runtime Storage:** Flag stored at `/var/www/webapp/app/static/flag` (web-accessible directory)
- **No Encryption:** Flag stored unencrypted at rest
- **No Rotation:** No mechanism to rotate flag without rebuilding container

**Container Security:**
- **Runs as root:** No USER directive in Dockerfile to drop privileges
- **No health checks:** No HEALTHCHECK directive
- **No resource limits:** No CPU/memory constraints
- **Base image:** Debian Bullseye (potentially outdated packages)

### Configuration Security

**Flask Configuration (app/__init__.py):**
- **SECRET_KEY:** NOT CONFIGURED (required for secure sessions)
- **DEBUG:** Not explicitly set to False (may run in debug mode)
- **SESSION_COOKIE_HTTPONLY:** Not configured
- **SESSION_COOKIE_SECURE:** Not configured (HTTP-only deployment)

**Apache Configuration (webapp-httpd.conf):**
- **Line 9:** `Access-Control-Allow-Origin: *` - Wildcard CORS (overly permissive)
- **Line 13:** Directory indexing enabled
- **Lines 24-27:** FilesMatch attempts to block flag file (ineffective)
- **No HSTS:** No Strict-Transport-Security header
- **No CSP:** No Content-Security-Policy header
- **No X-Frame-Options:** Clickjacking protection missing

### Dependency Security

**Python Dependencies (requirements.txt):**
- `flask` (version UNPINNED - security risk)

**Issues:**
- No version pinning allows installation of potentially vulnerable Flask versions
- No security extensions (Flask-Login, Flask-WTF, Flask-Talisman)
- No dependency vulnerability scanning

### Monitoring & Logging

**Application Logging:** NONE
- No Python logging module usage
- No security event logging
- No authentication attempt logging
- No file access logging

**Web Server Logging:** Apache defaults only
- Access log (default format)
- Error log (default format)
- No centralized logging
- No SIEM integration
- No alerting

### Attack Surface Summary

**Total Network-Accessible Endpoints:** 3
**Authenticated Endpoints:** 0
**Endpoints with Input Validation:** 0
**Endpoints with Authorization:** 0
**Critical Vulnerabilities:** 1 (path traversal in /resource)

**Attack Surface Reduction Opportunities:**
1. Remove or authenticate `/resource` endpoint
2. Implement proper authentication on `/login`
3. Add input validation on all parameters
4. Implement CSRF protection
5. Enable HTTPS/TLS
6. Configure security headers
7. Implement rate limiting
8. Add comprehensive logging

---

## Conclusion

This Flask application represents a **critically vulnerable** minimal web application with a total absence of security controls. The primary exploitable vulnerability is the path traversal issue in the `/resource` endpoint, which allows anonymous users to access arbitrary files within the static directory, including the CTF flag.

**Key Findings:**
- 3 network-accessible HTTP endpoints
- Zero authentication/authorization mechanisms
- 1 critical path traversal vulnerability
- Complete absence of input validation
- No session management
- No security logging
- Misconfigured CORS (wildcard)
- HTTP-only (no TLS)

**Recommendations for Downstream Analysis:**
- **Injection Analysis:** Focus on `/resource?filename=` parameter for path traversal exploitation
- **XSS Analysis:** Low priority - static templates with no user input reflection
- **Auth Analysis:** Document complete absence of authentication as critical finding
- **Authz Analysis:** Document complete absence of authorization as critical finding
- **SSRF Analysis:** Not applicable - no outbound HTTP requests in code

This application should **never be deployed in production** and appears designed as a CTF challenge or security training exercise.