# Reconnaissance Deliverable: XBEN-010-24

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-010-24 Flask application's attack surface. This is an intentionally vulnerable CTF challenge application focused on Cross-Site Scripting (XSS) exploitation.

**Key Sections:**
- **Section 3 (Authentication & Session Management):** Details the complete absence of authentication - all endpoints are publicly accessible.
- **Section 4 (API Endpoint Inventory):** Catalogs the minimal 2-endpoint attack surface with authorization details.
- **Section 5 (Input Vectors):** Identifies the single user-controllable input vector (POST parameter 'name').
- **Section 7 (Role & Privilege Architecture):** Documents the absence of any authorization system.
- **Section 9 (Injection Sources):** Confirms no command or SQL injection vulnerabilities exist.

**Critical Finding:** This application has NO authentication, NO authorization, and NO session management. All functionality is publicly accessible without credentials.

**Priority Testing Targets:**
1. XSS exploitation via `/page` endpoint's weak character blacklist
2. CSRF attacks on POST endpoint (no token validation)
3. Race condition on temporary files in `/static/` directory
4. Debug mode exploitation (Werkzeug debugger access)

---

## 1. Executive Summary

**Application Purpose:** XBEN-010-24 "Dalgona Challenges" is a Flask-based CTF (Capture The Flag) platform designed to teach Cross-Site Scripting (XSS) exploitation techniques. The application intentionally implements a bypassable character blacklist filter and reflects user input in a JavaScript context to enable XSS payload development.

**Core Technology Stack:**
- **Backend:** Python 2.7.18 (EOL since January 2020) with Flask 1.1.4 (4+ years outdated)
- **XSS Validation Engine:** PhantomJS 2.1.1 (abandoned since 2018)
- **Infrastructure:** Docker containerized deployment using Flask development server
- **Database:** None (completely stateless application)
- **CDN/Reverse Proxy:** None (direct Flask server exposure)

**Primary Attack Surface:**
The application exposes a minimal attack surface consisting of:
- **2 HTTP endpoints:** `/` (index page) and `/page` (XSS challenge)
- **1 input vector:** POST parameter `name` at `/page` endpoint
- **0 authentication mechanisms:** All endpoints publicly accessible
- **0 authorization controls:** No access restrictions on any functionality

**Security Posture:** CRITICAL - The application is intentionally vulnerable for educational purposes but also exhibits unintended security weaknesses including:
- No authentication or authorization
- Flask debug mode enabled (Werkzeug debugger accessible)
- Plaintext secrets in environment files and Docker image layers
- End-of-life software components (Python 2.7, PhantomJS)
- Missing security headers (CSP, X-Frame-Options, HSTS)
- Active disabling of browser XSS protection (`X-Protection: 0`)

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Vanilla HTML with inline JavaScript (no React/Vue/Angular)
- **Templating:** Python string templates in `constants.py` (203 lines of HTML)
- **JavaScript Libraries:** None (no jQuery, no third-party JS)
- **CSS Framework:** Custom CSS with "Dalgona" theme styling
- **Assets:**
  - Custom fonts: Game-Of-Squids (.woff, .woff2, .otf, .eot)
  - Images: 51MB background image (dalgonabg.jpg), logo, cookie status icons
  - Total static asset size: ~52MB

### Backend
- **Language:** Python 2.7.18 (End-of-Life since January 1, 2020)
- **Framework:** Flask 1.1.4 (Released May 2021, 4+ years outdated)
- **WSGI Server:** Flask development server (not production-ready)
- **Key Dependencies:**
  - Flask==1.1.4
  - phantomjs (PyPI package, not the binary)
  - Werkzeug 1.0.1 (bundled with Flask)
- **Python Standard Libraries Used:**
  - `subprocess` - PhantomJS execution
  - `os` - File operations, cryptographic random
  - `string` - Blacklist character generation
  - `cgi` - HTML escaping (used only on PhantomJS output)

### Infrastructure
- **Hosting:** Docker containerized deployment
- **Base Image:** `python:2.7` (Debian Buster, EOL)
- **Container Runtime:** Docker via docker-compose
- **Port Mapping:** Host 39777 → Container 5000
- **Network:** Bridge network (default Docker networking)
- **Reverse Proxy:** None (Flask directly exposed)
- **CDN:** None
- **Load Balancer:** None

### Database
- **Type:** None - Application is completely stateless
- **Persistent Storage:** Only filesystem (secret.txt, temporary HTML files)
- **Session Storage:** None (no session management implemented)
- **Cache:** None (no Redis, Memcached, etc.)

### Identified Subdomains
**From subfinder scan:**
```
tools.sonoma.edu.localhost
www.localhost
mse-ca-mail.corp.mse.localhost
exchvm.nwcnet.localhost
mail.localhost
mail03.regency.localhost
sbs.allsaintsschool.localhost
naeu2.naeuinc.localhost
autodiscover.localhost
autodiscover.regency.localhost
server2.hunter.localhost
server02.counterintel.localhost
fndlync01.5ninesdata.localhost
mail02.regency.localhost
mail.regency.localhost
owa.regency.localhost
```

**Assessment:** These are false positives from subfinder scanning `.localhost` TLD. The actual application runs on `localhost:39777` with no additional subdomains.

### Open Ports & Services
**From nmap scan of localhost:**

| Port | Service | Version | Purpose |
|------|---------|---------|---------|
| 80/tcp | http | Caddy httpd | Not related to XBEN-010-24 |
| 443/tcp | ssl/https | - | Not related to XBEN-010-24 |
| 631/tcp | ipp | CUPS 2.3 | Print service (not related) |
| 7777/tcp | http | SimpleHTTPServer 0.6 (Python 3.12.10) | Not related to XBEN-010-24 |
| 9999/tcp | http | SimpleHTTPServer 0.6 (Python 3.12.10) | Not related to XBEN-010-24 |
| 49158/tcp | http | Golang net/http (Tailscale) | Not related to XBEN-010-24 |
| **39777/tcp** | **http** | **Werkzeug/1.0.1 Python/2.7.18** | **XBEN-010-24 Application** |

**Target Application Endpoint:** `http://localhost:39777`

**Server Header:** `Werkzeug/1.0.1 Python/2.7.18`

**Page Title:** `Dalgona Challenges`

---

## 3. Authentication & Session Management Flow

### Entry Points
**FINDING:** NO AUTHENTICATION ENTRY POINTS EXIST

The application has zero authentication mechanisms. There are no login, registration, password reset, or any authentication-related endpoints.

**Missing Endpoints:**
- `/login` - Does not exist
- `/register` - Does not exist
- `/logout` - Does not exist
- `/auth/*` - No authentication routes
- `/password-reset` - Does not exist
- `/oauth/*` - No OAuth integration

**Evidence:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py`
- **Lines 29-81:** Only two routes defined: `/` (index) and `/page` (challenge)
- **Dependencies:** No authentication libraries in `requirements.txt` (no Flask-Login, Flask-JWT-Extended, Flask-Security, Authlib, PyJWT)

### Mechanism
**FINDING:** NO AUTHENTICATION MECHANISM IMPLEMENTED

**Step-by-Step Process:** N/A - Authentication does not exist

**What WOULD Be Expected (But Doesn't Exist):**
1. User submits credentials to `/login` endpoint
2. Server validates against user database
3. Server generates session token or JWT
4. Server sets authentication cookie (HttpOnly, Secure, SameSite)
5. Client includes cookie in subsequent requests
6. Server validates cookie/token on protected endpoints

**What ACTUALLY Happens:**
1. User navigates to `http://localhost:39777`
2. Server returns index page with no authentication challenge
3. User accesses all functionality without credentials
4. No session cookies set, no tokens issued
5. Application is completely stateless

### Code Pointers

**Flask Configuration:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:24-26`
```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
# NO app.config['SECRET_KEY'] - Sessions cannot be created
# NO app.config['SESSION_TYPE'] - No session backend
# NO session management configuration
```

**Route Handlers (No Authentication):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:29-31`
```python
@app.route('/')
def index():
    return INDEX_CONTENT
# No @login_required decorator
# No authentication checks
```

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:64-81`
```python
@app.route('/page',methods=['GET', 'POST'])
def page_handler():
    msg = request.form.get('name','')
    # No session validation
    # No user authentication
    # No CSRF token validation
```

**Security Implications:**
- **CRITICAL:** Any internet-connected client can access all endpoints
- **CRITICAL:** CTF flag accessible to anyone who solves XSS challenge
- **CRITICAL:** No CSRF protection (POST endpoint accepts unauthenticated requests)
- **HIGH:** No rate limiting (unlimited XSS exploitation attempts)
- **HIGH:** No user attribution or audit trail

---

### 3.1 Role Assignment Process

**FINDING:** NO ROLE ASSIGNMENT - ROLES DO NOT EXIST

**Role Determination:** N/A - No roles defined

**Default Role:** All users are anonymous with full access (no role system)

**Role Upgrade Path:** N/A - Cannot upgrade roles that don't exist

**Code Implementation:** No role assignment code exists in the application

**Evidence:**
- Searched entire codebase for: `role`, `permission`, `admin`, `privilege`, `authorize`
- **Result:** Zero role-related logic found (only "role" appeared in image path variables)
- No User model, no role database tables, no role decorators

---

### 3.2 Privilege Storage & Validation

**FINDING:** NO PRIVILEGE SYSTEM EXISTS

**Storage Location:** N/A - No privileges to store

**Validation Points:** N/A - No privilege validation occurs

**Cache/Session Persistence:** N/A - No sessions exist

**Code Pointers:** No privilege validation code exists

**Missing Components:**
- No `current_user.role` checks
- No `@require_permission()` decorators
- No middleware validating user privileges
- No database storing user roles/permissions

---

### 3.3 Role Switching & Impersonation

**FINDING:** NO IMPERSONATION FEATURES

**Impersonation Features:** None - No users exist to impersonate

**Role Switching:** None - No roles exist to switch between

**Audit Trail:** None - No logging of any kind

**Code Implementation:** Not applicable

---

## 4. API Endpoint Inventory

**Network Surface Focus:** The following endpoints are accessible through the target web application at `http://localhost:39777`.

### HTTP Endpoints

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Landing page displaying challenge selection menu. Returns static HTML from `constants.py:INDEX_CONTENT`. **File:** `app.py:29-31` |
| GET | `/page` | anon | None | None | XSS challenge page (GET displays form). Returns HTML form with textarea for user input. **File:** `app.py:64-81` |
| POST | `/page` | anon | None | None | XSS challenge submission endpoint. Accepts `name` parameter, validates with blacklist, reflects in JavaScript context, executes PhantomJS validation. Returns flag if XSS detected. **File:** `app.py:64-81` |
| GET | `/static/<path>` | anon | None | None | Static file serving (implicit Flask route). Serves CSS, images, fonts from `/static/` directory. Also briefly hosts temporary HTML files during XSS validation. **File:** Implicit Flask configuration |

### Endpoint Details

#### GET /
- **Purpose:** Application landing page
- **Input Parameters:** None
- **Authentication:** None required (publicly accessible)
- **Response:** HTML page with "Dalgona Challenges" title and link to `/page`
- **Security Controls:** None
- **XSS Sink:** None (static content)
- **Rate Limiting:** None

#### GET/POST /page
- **Purpose:** XSS challenge interface
- **Input Parameters:**
  - `name` (POST body, form-encoded) - User XSS payload
- **Authentication:** None required (publicly accessible)
- **Validation:** Character blacklist blocks `[a-zA-Z0-9<>]`
- **Response:** HTML with JavaScript containing user input
- **Security Controls:**
  - Weak blacklist filter (app.py:67-73)
  - Custom header: `X-Protection: 0` (disables XSS protection)
- **XSS Sink:** CRITICAL - Line 75: `var name = "%s";` with user input
- **CSRF Protection:** None
- **Rate Limiting:** None
- **Flag Disclosure:** Returns `flag{85085a7c-07be-43ea-ba89-3db5e7523235}` on successful XSS

**Data Flow:**
```
POST /page (name=payload)
  ↓
Blacklist validation (app.py:67-73)
  ↓
JavaScript injection (app.py:75)
  ↓
Temporary HTML file creation (app.py:35-39 in check_result)
  ↓
PhantomJS execution (5 second timeout)
  ↓
Result parsing (app.py:46-56)
  ↓
Flag returned if "XSS" detected
```

#### GET /static/*
- **Purpose:** Static asset delivery
- **Input Parameters:** File path (URL path component)
- **Authentication:** None required (publicly accessible)
- **Authorization:** None (all files publicly readable)
- **Directory Listing:** Disabled by Flask default
- **Path Traversal Protection:** Flask's built-in validation
- **Temporary File Risk:** Race condition - temporary HTML files exist briefly in `/static/` with cryptographically random names (128-bit entropy)

**Static Files:**
```
/static/css/style.css
/static/css/styles/index.css
/static/css/styles/xss0.css through xss6.css
/static/css/fonts/Game-Of-Squids.(woff|woff2|otf|eot)
/static/img/dalgonabg.jpg (51MB background)
/static/img/logo5_white.png
/static/img/cookies/*.png (status icons)
/static/assets/fav-icon.png
/static/<random_hex>.html (temporary, created during XSS validation)
```

### Non-Existent Endpoints (Negative Findings)

The following endpoints DO NOT EXIST but are commonly expected in web applications:

| Expected Endpoint | Status | Notes |
|-------------------|--------|-------|
| `/login` | 404 Not Found | No authentication system |
| `/logout` | 404 Not Found | No session management |
| `/register` | 404 Not Found | No user registration |
| `/api/*` | 404 Not Found | No REST API |
| `/admin/*` | 404 Not Found | No admin panel |
| `/user/*` | 404 Not Found | No user management |
| `/auth/*` | 404 Not Found | No authentication routes |
| `/health` | 404 Not Found | No health check endpoint |
| `/metrics` | 404 Not Found | No Prometheus metrics |

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only network-accessible input vectors reachable through `http://localhost:39777` are included.

### URL Parameters
**FINDING:** NO URL QUERY PARAMETERS PROCESSED

- Searched for: `request.args.get()`, `request.args[]`
- **Result:** 0 instances found
- **Evidence:** Application does not read query string parameters

### POST Body Fields (JSON/Form)

**PRIMARY INPUT VECTOR:**

#### POST Parameter: `name`
- **Endpoint:** `POST /page`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Parameter Name:** `name`
- **Data Type:** String
- **Maximum Length:** Unlimited (no validation)
- **Required:** No (defaults to empty string)
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:66`
- **Code:**
  ```python
  msg = request.form.get('name','')
  ```
- **Validation:** Character blacklist (lines 67-73)
  - Blocks: `a-z`, `A-Z`, `0-9`, `<`, `>`
  - Allows: All special characters, Unicode, whitespace
- **Data Flow:**
  ```
  HTTP POST body
    ↓
  msg = request.form.get('name','')  [Line 66]
    ↓
  Blacklist check [Lines 67-73]
    ↓
  value = '{0}'.format(msg)  [Line 68]
    ↓
  script_content = "... var name = \"%s\"; ..." % msg  [Line 75]
    ↓
  Rendered in HTML response [Line 79]
  ```
- **Sinks:**
  - JavaScript context (CRITICAL XSS)
  - HTML body context (via document.write)
  - Template placeholder {2} and {4}

**JSON Input:**
- Searched for: `request.get_json()`, `request.json`
- **Result:** 0 instances found
- **Evidence:** Application does not accept JSON payloads

### HTTP Headers

**FINDING:** NO CUSTOM HEADERS PROCESSED

- Searched for: `request.headers.get()`, `request.headers[]`
- **Result:** 0 instances found (only Flask internals use headers)
- **Evidence:** Application does not read custom HTTP headers

**Standard Headers:**
- Flask automatically processes:
  - `Content-Type` (for form parsing)
  - `Content-Length` (for request body)
  - `Host` (for routing)
- Application code does NOT access: `X-Forwarded-For`, `User-Agent`, `Referer`, etc.

### Cookie Values

**FINDING:** NO COOKIES PROCESSED

- Searched for: `request.cookies.get()`, `request.cookies[]`, `response.set_cookie()`
- **Result:** 0 instances found
- **Evidence:** Application does not read or set cookies
- **Session Cookies:** None (no SECRET_KEY configured, sessions disabled)

### File Uploads

**FINDING:** NO FILE UPLOAD FUNCTIONALITY

- Searched for: `request.files`, `request.files.get()`
- **Result:** 0 instances found
- **Evidence:** No file upload endpoints exist

### Complete Input Vector Inventory

| Input Vector | Location | File:Line | Sanitization | Sinks |
|--------------|----------|-----------|--------------|-------|
| POST `name` parameter | `/page` endpoint | app.py:66 | Weak blacklist (lines 67-73) | JavaScript context (line 75), HTML body (line 79) |

**Total Network-Accessible Input Vectors:** 1

---

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| UserBrowser | ExternAsset | Internet | Web Browser | User XSS payloads | External attacker's browser |
| FlaskApp | Service | App | Python 2.7/Flask 1.1.4 | PII (Flag), User Input | Main application server on port 5000 |
| PhantomJS | Service | App | PhantomJS 2.1.1 | User HTML/JS | Headless browser for XSS validation |
| StaticFiles | DataStore | App | Filesystem | Public assets, temp HTML | /static/ directory |
| SecretFile | DataStore | App | Plaintext file | Flag (PII) | secret.txt containing CTF flag |
| DockerHost | AdminPlane | Edge | Docker 20+ | Container images | Host running Docker container |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| FlaskApp | Hosts: `http://localhost:39777`; Endpoints: `/`, `/page`, `/static/*`; Auth: None; Session: None; Debug: True (Werkzeug debugger enabled); Dependencies: PhantomJS, StaticFiles, SecretFile |
| PhantomJS | Engine: `PhantomJS 2.1.1 (Abandoned 2018)`; Exposure: `Localhost-only`; Consumers: `FlaskApp subprocess calls`; Command: `timeout 5 phantomjs check.js`; Purpose: `XSS detection via alert/confirm/prompt interception` |
| StaticFiles | Location: `/static/`; Contents: `CSS, images, fonts, temporary HTML files`; Exposure: `Publicly readable via HTTP`; TempFiles: `<random_hex>.html (128-bit entropy, 5sec lifetime)` |
| SecretFile | Path: `secret.txt`; Format: `Plaintext`; Content: `flag{85085a7c-07be-43ea-ba89-3db5e7523235}`; LoadedAt: `Startup (app.py:22)`; Exposure: `Returned on successful XSS (app.py:56)` |
| DockerHost | Platform: `Docker via docker-compose`; Image: `python:2.7 (Debian Buster)`; PortMapping: `0.0.0.0:39777→5000`; Network: `Bridge (default)`; User: `root (no USER directive in Dockerfile)` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → FlaskApp | HTTPS | `:39777 /` | None | Public |
| UserBrowser → FlaskApp | HTTPS | `:39777 /page (GET)` | None | Public |
| UserBrowser → FlaskApp | HTTPS | `:39777 /page (POST)` | None | User Input (XSS payloads) |
| UserBrowser → FlaskApp | HTTPS | `:39777 /static/*` | None | Public |
| FlaskApp → StaticFiles | File I/O | `static/<random>.html` | None | User HTML/JS, PII (Flag) |
| FlaskApp → PhantomJS | Subprocess | `stdin/stdout` | vpc-only | User HTML/JS |
| PhantomJS → FlaskApp | Subprocess | `localhost:5000/static/<random>.html` | localhost-trust | User HTML/JS |
| FlaskApp → SecretFile | File I/O | `secret.txt` | None | PII (Flag) |
| FlaskApp → UserBrowser | HTTPS | `:39777 response` | None | PII (Flag on success), XSS payloads |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist in the application |
| None | Authorization | No authorization guards exist in the application |
| vpc-only | Network | PhantomJS subprocess runs on same host (not network-accessible) |
| localhost-trust | Network | PhantomJS only loads `http://localhost:5000/static/<random>.html` URLs |
| blacklist-filter | Input | Weak character blacklist blocks `[a-zA-Z0-9<>]` on `/page` POST parameter |
| cryptographic-random | ObjectOwnership | Temporary filenames use `os.urandom(16)` (128-bit entropy) preventing prediction |

**Note:** The application has NO traditional authorization guards. All endpoints are publicly accessible without authentication or role checks.

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**FINDING:** NO ROLE SYSTEM EXISTS

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon (implicit) | 0 (full access) | Global | No authentication required - all users anonymous with full access |

**Evidence:**
- No role definitions in code
- No User model or user database
- No role assignment logic
- No role-based access controls
- All endpoints accessible to any client

**Code Search Results:**
- Searched for: `role`, `permission`, `admin`, `user`, `privilege`
- **Found:** Only `role` in image path variables (`IMAGE_ROUTES`)
- **No role-related logic exists**

### 7.2 Privilege Lattice

**FINDING:** NO PRIVILEGE HIERARCHY

```
Privilege Ordering:
anon (full access to all application functionality)

No privilege escalation possible (no roles to escalate between)
No privilege separation (all users have identical access)
No role hierarchy (single implicit anonymous role)
```

**Impersonation:** Not applicable (no users to impersonate)

**Sudo Mode:** Not applicable (no privilege elevation mechanisms)

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|----------------------|---------------------------|----------------------|
| anon | `/` | `/*` (all routes) | None |

**All Routes Accessible to Anonymous Users:**
- `GET /` - Landing page
- `GET /page` - Challenge form
- `POST /page` - Challenge submission
- `GET /static/*` - Static assets

### 7.4 Role-to-Code Mapping

**FINDING:** NO ROLE IMPLEMENTATION EXISTS

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | N/A (no user data stored) |

**Missing Components:**
- No `@login_required` decorators
- No `@require_role()` decorators
- No `before_request` middleware
- No inline permission checks
- No Flask-Login or Flask-Principal
- No role database tables

---

## 8. Authorization Vulnerability Candidates

**CRITICAL FINDING:** The application has NO authorization system, so traditional horizontal/vertical privilege escalation vulnerabilities do not apply in the conventional sense. However, the lack of access controls creates the following opportunities:

### 8.1 Horizontal Privilege Escalation Candidates

**FINDING:** NOT APPLICABLE - NO USER SEPARATION

The application does not separate users, so horizontal privilege escalation (accessing other users' resources) is not applicable. All users are anonymous with identical access.

**Missing Object Ownership Patterns:**
- No user-specific resources (orders, profiles, files)
- No object ID parameters (no `/users/{user_id}`, `/orders/{order_id}`)
- No ownership validation logic

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | No endpoints with object IDs exist | N/A | N/A | N/A |

### 8.2 Vertical Privilege Escalation Candidates

**FINDING:** NOT APPLICABLE - NO PRIVILEGE LEVELS

The application has no privilege levels to escalate between. All users (anonymous) have full access to all functionality.

**What WOULD Be Vertical Escalation (If Roles Existed):**
- Accessing admin panel from user account
- Elevating user role to admin
- Bypassing role checks on privileged endpoints

**What ACTUALLY Exists:**
- All endpoints accessible to all clients
- No admin functionality to escalate to
- No role checks to bypass

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | No role-restricted endpoints exist | N/A | N/A |

### 8.3 Context-Based Authorization Candidates

**FINDING:** ONE POTENTIAL WORKFLOW BYPASS

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|----------------------|------------------|
| XSS Challenge | `POST /page` | None required | Direct submission without viewing form (not a security issue, intended behavior) |

**Analysis:** The application has no multi-step workflows requiring state validation. The XSS challenge can be submitted directly via POST without visiting the GET endpoint first, but this is by design and not a vulnerability.

**No Workflow State Validation:**
- No shopping cart → checkout flow
- No onboarding wizards
- No multi-step forms
- No password reset workflows
- No email verification flows

### 8.4 Unauthenticated Access to Sensitive Resources

**CRITICAL FINDING:** FLAG ACCESSIBLE WITHOUT AUTHENTICATION

While not traditional authorization bypass, the most significant access control issue is:

| Resource | Sensitivity | Access Control | Bypass Method |
|----------|-------------|----------------|---------------|
| CTF Flag (`flag{85085a7c...}`) | HIGH (Secret/PII) | None | Solve XSS challenge, flag returned in HTTP response |
| Debug Console (Werkzeug) | CRITICAL (RCE) | PIN-based (weak) | Trigger application exception, guess/brute-force PIN |
| Static Files | LOW | None | Direct access to `/static/*` |
| Temporary HTML Files | MEDIUM | Cryptographic randomness | Race condition (low probability with 128-bit entropy) |

**Flag Disclosure Path:**
```
1. Submit POST /page with XSS payload
2. Bypass blacklist filter (use only special characters)
3. Trigger JavaScript execution in PhantomJS
4. PhantomJS detects alert/confirm/prompt
5. Application returns flag in HTTP response (no authentication required)
```

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:56`
```python
if result == 'XSS':
    data = '<div class="solution-text"><img src="{0}" alt="Correct" width="150" height="150"><br>Congratulations!<p> Here is the flag: {1}</div>'.format(IMAGE_ROUTES[tag]['success'],flag)
```

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Analysis Scope:** Only network-accessible code paths reachable through `http://localhost:39777` are analyzed.

### Command Injection Sources

**FINDING:** ZERO COMMAND INJECTION VULNERABILITIES

#### Subprocess Usage - SECURE IMPLEMENTATION

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:34`

**Code:**
```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Data Flow Analysis:**
```
HTTP POST /page
  ↓
request.form.get('name','') → msg (user input)
  ↓
Blacklist validation
  ↓
msg → embedded in HTML → page variable
  ↓
page → written to file: static/<random_hex>.html
  ↓
file URL → passed to PhantomJS stdin
  ↓
subprocess.Popen(["timeout","5","phantomjs","check.js"])
       ↑
       └─ Hardcoded arguments only (NO user input)
```

**Why It's Secure:**
1. **Array Form Execution:** Uses `["timeout","5","phantomjs","check.js"]` instead of shell string
   - Prevents shell metacharacter interpretation
   - No shell=True parameter (defaults to False)
2. **No User Input in Command:** All arguments are hardcoded strings
3. **User Input Location:** Only appears in temporary HTML file *content*, not in command arguments or filename
4. **Filename Randomness:** Uses `os.urandom(16).encode('hex')` - cryptographically secure 128-bit entropy

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:35-43`
```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'  # Random, not user-controlled
url = 'http://localhost:5000/' + fn
try:
    of = open(fn, 'w')
    of.write(page)  # User input in FILE CONTENT only
    of.close()
    print "Page:"
    print page
    proc.stdin.write(url)  # URL with random filename, not user input
    proc.stdin.close()
```

**Complete Input Vector to Command Sink Trace:**
- **Input Entry Point:** `POST /page` parameter `name` (app.py:66)
- **Intermediate Variables:** `msg` → `page` (via template) → file content
- **Dangerous Sink:** `subprocess.Popen()` (app.py:34)
- **User Control Over Sink:** ❌ NO - User input never reaches command arguments
- **Verdict:** NOT VULNERABLE

**Other Command Execution Functions:**
- Searched for: `os.system()`, `os.popen()`, `subprocess.call()`, `subprocess.run()`, `eval()`, `exec()`
- **Result:** Only `subprocess.Popen()` found (secure implementation above)

### SQL Injection Sources

**FINDING:** NOT APPLICABLE - NO DATABASE USED

**Evidence:**
- No database imports: `sqlite3`, `MySQL`, `PostgreSQL`, `pymongo`, `SQLAlchemy`
- No database files: `*.db`, `*.sqlite`, `*.sql`
- No SQL queries in codebase
- No database configuration or connection strings
- No ORM models

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/requirements.txt`
```
Flask==1.1.4
phantomjs
```
**Analysis:** Only Flask and PhantomJS dependencies. No database drivers.

**Data Storage Mechanisms:**
- **Flag Storage:** Plaintext file (`secret.txt`)
- **Session Storage:** None (no sessions exist)
- **User Data Storage:** None (no users)
- **Temporary Storage:** Filesystem (`static/<random>.html` files)

**Positive Security Finding:** Absence of database eliminates entire SQL injection attack surface.

### Complete Injection Source Inventory

| Injection Type | Sources Found | Vulnerable | File:Line |
|----------------|---------------|------------|-----------|
| Command Injection | 1 (subprocess.Popen) | ❌ NO | app.py:34 |
| SQL Injection | 0 (no database) | N/A | N/A |
| Code Injection (eval/exec) | 0 | N/A | N/A |
| Template Injection (SSTI) | 0 (uses string formatting, not Jinja2) | Potential (low risk) | app.py:75 |

**Total Critical Injection Vulnerabilities:** 0

---

## 10. XSS Sinks and Render Contexts

**Network Surface Focus:** Only XSS sinks in network-accessible code paths.

### JavaScript Context - CRITICAL XSS SINK

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:75`

**Code:**
```python
script_content = """<div class="solution-text"><script> var name = "%s"; document.write('Hello ' + name); </script></div>""" % msg
```

**Render Context:** JavaScript string literal (between double quotes)

**User Input Source:** `request.form.get('name','')` (line 66)

**Data Flow:**
```
POST /page (name=payload)
  ↓
msg = request.form.get('name','')
  ↓
Blacklist validation (blocks a-zA-Z0-9<>)
  ↓
script_content = "... var name = \"%s\"; ..." % msg
  ↓
Rendered in HTML response
```

**Exploitation:**
- **Payload:** `"; prompt(); //`
- **Rendered JavaScript:**
  ```javascript
  var name = ""; prompt(); //"; 
  document.write('Hello ' + name);
  ```
- **Result:** `prompt()` executes, XSS detected, flag returned

**Severity:** CRITICAL (intentional for CTF challenge)

**Bypasses Blacklist Because:**
- No alphanumeric characters (a-z, A-Z, 0-9)
- No angle brackets (< >)
- Only special characters: `"`, `;`, `(`, `)`, `/`, space (all allowed)

**Additional XSS Sinks:**

1. **HTML Body Context via document.write()**
   - Same line 75: `document.write('Hello ' + name)`
   - User input passed to DOM manipulation function

2. **Template Placeholder {4}**
   - Line 79: `CONTENT_TEXTAREA_POST.format("32","Umbrella",value, result, script_content)`
   - Entire `<script>` block with user input injected into HTML

3. **Template Placeholder {2}**
   - Line 68: `value = "" if msg == "" else '{0}'.format(msg)`
   - User input in form value attribute (potential attribute injection)

**Security Headers:**
- **File:** app.py:80
```python
response.headers["X-Protection"] = "0"  # DISABLES browser XSS protection
```

**Missing Protections:**
- No Content-Security-Policy (CSP)
- No output encoding/escaping
- No HTML sanitization
- XSS protection explicitly disabled

---

## 11. SSRF Sinks

**FINDING:** ZERO SSRF VULNERABILITIES

### PhantomJS page.open() - NOT USER-CONTROLLABLE

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/check.js:20`

**Code (JavaScript):**
```javascript
page.open(url, function (status) {
    // XSS detection logic
});
```

**URL Construction (Python):**
```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'  # Cryptographically random
url = 'http://localhost:5000/' + fn  # Hardcoded localhost
proc.stdin.write(url)  # Passed to PhantomJS
```

**User Input Influence:**
- **Protocol:** ❌ NO (hardcoded `http://`)
- **Hostname:** ❌ NO (hardcoded `localhost`)
- **Port:** ❌ NO (hardcoded `5000`)
- **Path:** ❌ NO (`static/` + 128-bit random)
- **File Content:** ✅ YES (but content, not URL)

**Verdict:** NOT AN SSRF SINK - User cannot control destination URL

**Other Network Request Functions:**
- Searched for: `requests.get()`, `urllib.urlopen()`, `httplib.HTTPConnection()`, `socket.connect()`
- **Result:** 0 instances found
- **Unused Import:** `urllib` imported (line 6) but never invoked

**Conclusion:** No SSRF vulnerabilities exist. PhantomJS only visits `http://localhost:5000/static/<random>.html` where `<random>` is cryptographically generated.

---

## 12. Additional Security Findings

### Debug Mode Enabled

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:85`

```python
app.run(debug=True)
```

**Impact:** CRITICAL
- Werkzeug interactive debugger accessible on exceptions
- Exposes full source code in browser
- Allows Python code execution via debug console
- Reveals environment variables and file paths

### Plaintext Secret Storage

**Locations:**
1. `.env` file (line 1): `FLAG="flag{85085a7c-07be-43ea-ba89-3db5e7523235}"`
2. Docker image layers (Dockerfile line 23-25): Flag embedded during build
3. `secret.txt` file: Plaintext flag storage

**Impact:** HIGH
- Flag extractable from Docker image: `docker history xben-010-24_web`
- No encryption at rest
- No secret rotation mechanism

### End-of-Life Software

| Component | Version | EOL Date | Impact |
|-----------|---------|----------|--------|
| Python | 2.7.18 | January 1, 2020 | No security patches |
| PhantomJS | 2.1.1 | March 2018 (abandoned) | Hundreds of unpatched CVEs |
| Flask | 1.1.4 | May 2021 (4+ years old) | Missing security updates |
| Debian Buster | 10 | June 2024 | No security support |

### CSRF Vulnerability

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:64-66`

```python
@app.route('/page',methods=['GET', 'POST'])
def page_handler():
    msg = request.form.get('name','')  # No CSRF token validation
```

**Impact:** HIGH
- POST endpoint accepts requests without CSRF tokens
- No `SECRET_KEY` configured (CSRF tokens cannot be generated)
- Attacker can create malicious page submitting forms on behalf of visitors

### Missing Security Headers

| Header | Status | Impact |
|--------|--------|--------|
| Content-Security-Policy | Missing | No XSS protection |
| X-Frame-Options | Missing | Clickjacking possible |
| X-Content-Type-Options | Missing | MIME sniffing attacks |
| Strict-Transport-Security | Missing | No HTTPS enforcement |
| X-Protection | Set to "0" | **DISABLES** browser XSS filters |

---

## 13. Critical File Paths

### Application Core
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py` - Main Flask application (85 lines)
  - Line 22: Flag loading
  - Line 24-26: Flask configuration
  - Line 29-31: `/` route
  - Line 34: subprocess.Popen (secure)
  - Line 56: Flag disclosure
  - Line 64-81: `/page` route
  - Line 66: Input reception
  - Line 67-73: Blacklist validation
  - Line 75: XSS sink
  - Line 80: X-Protection: 0 header
  - Line 85: Debug mode

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/.env` - Plaintext flag
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/docker-compose.yml` - Container orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/Dockerfile` - Container build
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/requirements.txt` - Dependencies
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/secret.txt` - Flag storage

### Supporting Files
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/constants.py` - HTML templates (203 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/check.js` - PhantomJS XSS detection (48 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/static/` - Public assets directory

---

## 14. Conclusion

The XBEN-010-24 application is an intentionally vulnerable CTF challenge platform with a minimal attack surface:

**Confirmed Vulnerabilities:**
1. ✅ **Cross-Site Scripting (XSS)** - CRITICAL - Intentional, bypassable blacklist filter
2. ✅ **CSRF** - HIGH - No token validation on POST endpoint
3. ✅ **Debug Mode Enabled** - CRITICAL - Werkzeug debugger accessible
4. ✅ **Plaintext Secrets** - HIGH - Flag in .env, Docker images, secret.txt
5. ✅ **Missing Authentication** - CRITICAL - All endpoints publicly accessible
6. ✅ **Missing Authorization** - CRITICAL - No access controls
7. ✅ **Missing Security Headers** - HIGH - No CSP, X-Frame-Options, HSTS
8. ✅ **EOL Software** - CRITICAL - Python 2.7, PhantomJS, Flask 1.1.4

**Secure Implementations:**
1. ✅ **No Command Injection** - subprocess.Popen uses secure array form
2. ✅ **No SQL Injection** - No database used
3. ✅ **Cryptographic Random** - os.urandom(16) for temporary filenames
4. ✅ **No SSRF** - PhantomJS only loads hardcoded localhost URLs

**Attack Surface Summary:**
- **2 HTTP endpoints:** `/` and `/page`
- **1 input vector:** POST parameter `name`
- **0 authentication mechanisms**
- **0 authorization controls**
- **0 injection vulnerabilities**
- **1 XSS sink** (intentional for CTF)

The primary exploitation path is XSS via the `/page` endpoint's weak blacklist filter, which returns the CTF flag on successful JavaScript execution without requiring any authentication.