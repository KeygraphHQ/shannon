# Reconnaissance Deliverable: XBEN-074-24 (Dalgona XSS Challenge)

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is a deliberately vulnerable XSS CTF challenge application with NO authentication or authorization mechanisms.

**Key Sections:**
- **Section 4 (API Endpoint Inventory):** Complete list of all network-accessible endpoints - note that ALL are unauthenticated.
- **Section 5 (Input Vectors):** Critical section identifying the single user input vector that is the primary attack surface.
- **Section 6 (Network Mapping):** System architecture showing the Flask application and PhantomJS subprocess interaction.
- **Section 7 (Role & Privilege Architecture):** N/A - No authorization system exists.
- **Section 9 (Injection Sources):** Analysis of command injection and SQL injection surfaces (none found).

**How to Use This Report:** This application is a stateless, unauthenticated XSS challenge. Focus all vulnerability analysis on the `/page` endpoint's `name` parameter and XSS exploitation techniques.

**Priority Order for Testing:** Start with XSS analysis on the `/page` endpoint, then investigate the PhantomJS SSRF vector, and finally explore race condition opportunities in temporary file creation.

## 1. Executive Summary

**XBEN-074-24** ("Dalgona Challenges") is a deliberately vulnerable Flask web application designed as a Cross-Site Scripting (XSS) Capture-the-Flag (CTF) training challenge. The application presents a **minimal but intentionally insecure** attack surface with only 2 HTTP endpoints exposed on port 34875. Built on critically outdated technologies (Python 2.7.18 - EOL 2020, Flask 1.1.4, Werkzeug 1.0.1, PhantomJS 2.1.1 - abandoned 2018), the application demonstrates multiple high-severity vulnerabilities by design, with XSS exploitation as the primary objective to retrieve a flag value.

**Core Technology Stack:**
- **Frontend:** HTML/CSS (server-rendered via Python string templates), JavaScript (minimal client-side)
- **Backend:** Python 2.7.18, Flask 1.1.4, Werkzeug 1.0.1 development server
- **Validation Engine:** PhantomJS 2.1.1 (headless browser for XSS detection)
- **Infrastructure:** Docker container (running as root), port 34875, no reverse proxy

**Security Posture Summary:**
- **Authentication/Authorization:** None - all endpoints are publicly accessible without credentials
- **Session Management:** None - completely stateless application
- **Input Validation:** Weak blacklist filter (single keyword: "alert")
- **Output Encoding:** None on user input (intentional XSS vulnerability)
- **Critical Vulnerabilities:** Reflected XSS (primary), SSRF via PhantomJS, temporary file race condition
- **Technology Risk:** 100+ known CVEs in EOL technology stack with no security patches available

**Primary Attack Surfaces:**
1. `/page` endpoint with `name` query parameter (reflected XSS with flag disclosure)
2. PhantomJS-based SSRF through HTML injection
3. Temporary HTML file generation in `static/` directory (stored XSS race condition)

**Key Security Finding:** This application **intentionally disables browser XSS protections** (`X-XSS-Protection: 0`) and uses weak input validation to create an educational XSS challenge. The flag value is disclosed upon successful XSS exploitation. While designed as a training tool, the outdated runtime environment creates significant unintended attack surfaces including potential container escape through PhantomJS vulnerabilities.

**Deployment Context:** This application should NEVER be deployed to production or exposed to the public internet. It is suitable only for isolated CTF training environments with strict network controls.

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-rendered HTML via Python string templates (no frontend framework)
- **Template Engine:** None (raw Python `.format()` string interpolation in `constants.py`)
- **Client-side JavaScript:** Minimal (no authentication libraries, no frontend routing)
- **CSS Framework:** Custom CSS (Game of Squids theme inspired by Netflix's Squid Game)
- **Static Assets:** 
  - Fonts: Game-Of-Squids (WOFF2 format)
  - Images: PNG/JPG (logo, background, challenge icons)
  - Total static asset size: ~51MB

### Backend
- **Language:** Python 2.7.18 (End-of-Life: January 1, 2020)
- **Framework:** Flask 1.1.4 (released March 2021, current stable: 3.x)
- **WSGI Server:** Werkzeug 1.0.1 development server (NOT production-hardened)
- **Key Dependencies:**
  - Flask==1.1.4
  - PhantomJS 2.1.1 (installed via OS package manager, not pip)
- **Python Modules Used:**
  - `subprocess` (PhantomJS execution)
  - `os` (file operations, random filename generation)
  - `cgi` (limited HTML escaping)
  - `re`, `urllib`, `sys`, `logging`, `string`

### Infrastructure
- **Hosting:** Docker container (Debian Buster base - EOL 2022)
- **CDN:** None
- **Reverse Proxy:** None (Flask development server directly exposed)
- **Database:** None (file-based flag storage in `secret.txt`)
- **Port:** 34875 (mapped from container port 5000)
- **Network Configuration:**
  - Container runs as root (no user isolation)
  - Health check: TCP connectivity test on port 5000 every 10s
  - No TLS/HTTPS (HTTP only)

### Identified Subdomains
The following subdomains were discovered by subfinder but are **not relevant** to this specific application instance running on localhost:34875:
- sbs.allsaintsschool.localhost
- tools.sonoma.edu.localhost
- www.localhost
- server02.counterintel.localhost
- mail02.regency.localhost
- naeu2.naeuinc.localhost
- server2.hunter.localhost
- fndlync01.5ninesdata.localhost
- mail.localhost
- autodiscover.localhost
- autodiscover.regency.localhost
- exchvm.nwcnet.localhost
- mse-ca-mail.corp.mse.localhost
- mail03.regency.localhost
- mail.regency.localhost
- owa.regency.localhost

**Note:** These subdomains appear to be DNS artifacts or unrelated services on the localhost domain. The target application operates solely on `http://localhost:34875`.

### Open Ports & Services
**Relevant to Target Application:**
- **Port 34875/tcp** - HTTP (Caddy httpd reverse proxy to Flask app on port 5000)
  - Service: Flask application via Werkzeug development server
  - Application: Dalgona Challenges XSS CTF platform
  - Access: Public, no authentication required

**Other Services Detected on Host (Out of Scope):**
- Port 80/tcp - Caddy httpd
- Port 443/tcp - HTTPS (Caddy)
- Port 631/tcp - CUPS printing service
- Port 8888/tcp - Python SimpleHTTPServer
- Port 9999/tcp - Python SimpleHTTPServer  
- Port 49158/tcp - Tailscale VPN service (requires authentication)

**Note:** Only port 34875 is in scope for this reconnaissance as it hosts the target application.

## 3. Authentication & Session Management Flow

### Authentication Mechanisms
**Status: NO AUTHENTICATION SYSTEM PRESENT**

The application has **zero authentication mechanisms**. Comprehensive analysis found:
- ❌ No login/logout endpoints
- ❌ No user registration flows
- ❌ No password management
- ❌ No token-based authentication (JWT, API keys, Bearer tokens)
- ❌ No password reset mechanisms
- ❌ No multi-factor authentication
- ❌ No SSO/OAuth/OIDC integration
- ❌ No SAML authentication
- ❌ No authentication decorators (`@login_required`, `@requires_auth`)
- ❌ No `before_request` hooks for authentication checks

**Entry Points:**
- `GET /` - Public access, no authentication
- `GET /page` - Public access, no authentication

**Code Evidence:**
```python
# src/app.py:29-31
@app.route('/')
def index():
    return INDEX_CONTENT  # No authentication check

# src/app.py:64-81
@app.route('/page')
def challenge():
    msg = request.args.get('name','')  # No authentication required
    # ... XSS challenge logic ...
```

**Exhaustive List of Authentication API Endpoints:**
- **None exist** - This application has zero authentication endpoints

### Session Management
**Status: NO SESSION MANAGEMENT IMPLEMENTED**

The application maintains **no session state** between requests. Analysis revealed:

**Flask Configuration (src/app.py:25-26):**
```python
app = Flask(__name__)
app.config['PROPAGATE_EXCEPTIONS'] = True
```

**Critical Session Configuration Findings:**
| Configuration | Status | Impact |
|--------------|--------|---------|
| `SECRET_KEY` | ❌ NOT SET | No session encryption possible |
| `SESSION_COOKIE_HTTPONLY` | ❌ NOT SET | N/A - no sessions |
| `SESSION_COOKIE_SECURE` | ❌ NOT SET | N/A - no sessions |
| `SESSION_COOKIE_SAMESITE` | ❌ NOT SET | N/A - no sessions |
| `SESSION_TYPE` | ❌ NOT SET | N/A - no sessions |

**Session Cookie Flags:** Not applicable - no session cookies are generated or set.

**Response Headers:** The only explicitly set header is at `src/app.py:80`:
```python
response.headers["X-XSS-Protection"] = "0"  # Disables browser XSS protection
```

**Security Implications:**
- No CSRF protection possible (no sessions = no CSRF tokens)
- Application is completely stateless - each request is independent
- No user tracking or rate limiting based on sessions
- No authentication state to maintain or validate

### 3.1 Role Assignment Process
**Status: N/A - NO ROLE SYSTEM**

- **Role Determination:** Not applicable - no user roles exist
- **Default Role:** Not applicable - no authentication system
- **Role Upgrade Path:** Not applicable - no role hierarchy
- **Code Implementation:** No role assignment logic exists in the codebase

### 3.2 Privilege Storage & Validation
**Status: N/A - NO PRIVILEGE SYSTEM**

- **Storage Location:** Not applicable - no user privileges tracked
- **Validation Points:** No authorization checks at any endpoint
- **Cache/Session Persistence:** No user state persisted
- **Code Pointers:** No privilege validation code exists

### 3.3 Role Switching & Impersonation
**Status: N/A - NO ROLE SYSTEM**

- **Impersonation Features:** None - no user identity system
- **Role Switching:** None - no privilege elevation mechanisms
- **Audit Trail:** No logging of authentication or authorization events
- **Code Implementation:** Not applicable

### Request Flow (Unauthenticated)
```
User Request (HTTP GET)
    ↓
Flask Route Handler (/ or /page)
    ↓
[No Authentication Check]
    ↓
[No Authorization Check]
    ↓
[No Session Validation]
    ↓
Process Request & Return Response
```

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints below are network-accessible through the target web application at http://localhost:34875. No local-only utilities or build tools are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Landing page for Dalgona Challenges CTF. Returns static HTML with challenge selection interface. See `src/app.py:29-31`. Returns `INDEX_CONTENT` template from `constants.py`. |
| GET | `/page` | anon | None | None | Primary XSS challenge endpoint. Accepts `name` query parameter, validates against blacklist (`'alert'`), generates HTML with user input, executes PhantomJS validation, returns flag on successful XSS. See `src/app.py:64-81`. Sets `X-XSS-Protection: 0` header. Calls `check_challenge()` function at line 77. |
| GET | `/static/<path>` | anon | None | None | Flask default static file handler. Serves CSS, images, fonts, and temporarily generated HTML files from `src/static/` directory. Files include: `css/style.css`, `css/pages/*.css`, `img/*.png`, `img/*.jpg`, `css/fonts/*`, `assets/fav-icon.png`, and temporary HTML files `<random_hex>.html` (ephemeral, ~5 second race window). |

**Endpoint Details:**

### Endpoint 1: Index Page
**Route:** `GET /`  
**Handler:** `index()`  
**File:** `src/app.py:29-31`  
**Parameters:** None  
**Returns:** HTML (200 OK)  
**Code:**
```python
@app.route('/')
def index():
    return INDEX_CONTENT
```

### Endpoint 2: XSS Challenge Page
**Route:** `GET /page`  
**Handler:** `challenge()`  
**File:** `src/app.py:64-81`  
**Parameters:**
- Query: `name` (optional, default: empty string)

**Returns:** HTML (200 OK) with custom header `X-XSS-Protection: 0`

**Processing Flow:**
1. Retrieves `name` parameter: `msg = request.args.get('name','')`
2. Validates against blacklist: checks if `'alert'` appears in `msg.lower()`
3. If blocked: returns error message
4. If passes: formats input into template: `value = '> {0}'.format(msg)`
5. Generates HTML page with user input injected into `<input>` tag attribute
6. Calls `check_challenge(data, flags[0], msg, 'level_easy')`
7. PhantomJS validates if XSS payload triggered dialogs
8. Returns flag if successful, error message if failed

**Code:**
```python
@app.route('/page')
def challenge():
    msg = request.args.get('name','')
    blacklist = ['alert']
    value = "" if msg == "" else '> {0}'.format(msg)
    
    for word in blacklist:
        if word in msg.lower():
            error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
            value = ">"
            return XSS_CONTENT.format("4","Circle",value,"",error_msg)
    
    data = XSS_CONTENT.format("4","Circle",value, "","")
    result = check_challenge(data,flags[0],msg,'level_easy')
    
    response = make_response(XSS_CONTENT.format("4","Circle",value, result, ""))
    response.headers["X-XSS-Protection"] = "0"
    return response
```

### Endpoint 3: Static File Serving
**Route:** `GET /static/<path>`  
**Handler:** Flask built-in static file handler  
**File:** Flask framework default  
**Base Directory:** `src/static/`  
**Parameters:**
- Path: `<path>` (any file under static/ directory)

**Assets Served:**
- CSS: `/static/css/style.css`, `/static/css/pages/page4.css`
- Images: `/static/img/dalgonabg.jpg`, `/static/img/logo5_white.png`, `/static/img/cookies/*.png`
- Fonts: `/static/css/fonts/Game-Of-Squids.woff2`
- Assets: `/static/assets/fav-icon.png`
- **Temporary HTML files:** `/static/<32-char-hex>.html` (ephemeral, created at `src/app.py:35-40`, deleted after ~5 seconds)

**Security Risk:** Race condition - temporary HTML files briefly accessible before deletion via `os.unlink(fn)` at line 50.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors below are accessible through the target web application's network interface (http://localhost:34875). No inputs from local-only scripts, build tools, or development utilities are included.

### User Input Vector #1: Query Parameter 'name' (PRIMARY ATTACK SURFACE)

**Endpoint:** `GET /page`  
**Parameter Name:** `name`  
**Input Type:** URL Query Parameter  
**File Location:** `src/app.py:66`  
**Collection Method:** `msg = request.args.get('name','')`

**Validation Applied:**
- **Type:** Blacklist filter
- **Implementation:** `src/app.py:67-74`
- **Logic:** Checks if string `'alert'` appears in `msg.lower()` (case-insensitive)
- **Code:**
```python
blacklist = ['alert']
for word in blacklist:
    if word in msg.lower():
        error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
        value = ">"
        return XSS_CONTENT.format("4","Circle",value,"",error_msg)
```

**Sanitization Applied:** NONE - no HTML encoding or escaping

**Data Flow Path:**
```
1. Input Collection: src/app.py:66
   msg = request.args.get('name','')

2. Format into String: src/app.py:68
   value = "" if msg == "" else '> {0}'.format(msg)

3. Inject into HTML Template: src/app.py:76, 79
   XSS_CONTENT.format("4","Circle",value, result, "")
   
4. Template Definition: src/constants.py:49
   <input type=text name=name placeholder="Enter your name..." {2}>
   [User input injected at {2} position - UNQUOTED ATTRIBUTE CONTEXT]

5. Write to Temporary File: src/app.py:38-40
   of = open(fn, 'w')
   of.write(page)  # Contains user input
   of.close()

6. PhantomJS Execution: src/app.py:43-47
   proc.stdin.write(url)  # URL of temporary file
   result = proc.stdout.readline().strip()

7. Response: src/app.py:79-81
   response = make_response(XSS_CONTENT.format(...))
   response.headers["X-XSS-Protection"] = "0"
```

**Dangerous Sinks:**
- **HTML Output (Reflected XSS):** User input flows directly to HTML response at attribute injection point
- **File Write:** User input written to temporary HTML files in `static/` directory
- **PhantomJS Rendering:** User-controlled HTML rendered by headless browser

**Bypass Opportunities:**
The blacklist filter (`'alert'` only) can be bypassed using:
1. Alternative dialog functions: `confirm()`, `prompt()`
2. Event handlers: `onfocus=`, `onerror=`, `onload=`, `onmouseover=`
3. Tag injection: `<img>`, `<svg>`, `<iframe>`, `<script>`
4. JavaScript execution contexts: `eval()`, `setTimeout()`, `Function()`
5. Attribute context breaking: `autofocus onfocus=confirm(1)`
6. HTML entities, Unicode encoding, URL encoding

### Complete Input Vector Summary

**URL Parameters:**
- `/page?name=<USER_INPUT>` - Primary XSS vector, blacklist validation, no sanitization

**POST Body Fields (JSON/Form):** 
- None - Application does not process POST requests or form submissions

**HTTP Headers:**
- None - Application does not read or process custom HTTP headers for user-controlled data
- Standard headers (User-Agent, Referer, etc.) are not explicitly accessed in application code

**Cookie Values:**
- None - Application does not read or set cookies (no `request.cookies` usage found)

**File Uploads:**
- None - No file upload functionality exists

**WebSocket Messages:**
- None - No WebSocket implementation

**Additional Input Sources Analyzed:**
- ✅ `request.args` - Used (query parameter `name`)
- ❌ `request.form` - Not used
- ❌ `request.json` - Not used
- ❌ `request.headers` - Not used for user data
- ❌ `request.cookies` - Not used
- ❌ `request.files` - Not used
- ❌ `request.data` - Not used

**Total Network-Accessible Input Vectors:** 1 (query parameter `name` on `/page` endpoint)

## 6. Network & Interaction Map

**Network Surface Focus:** This section maps only the deployed, network-accessible infrastructure at http://localhost:34875. Local development environments, build CI systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Browser | Public | External attacker perspective |
| DalgonaCTF-Flask | Service | App | Python 2.7.18/Flask 1.1.4/Werkzeug | PII (Flag), Public | Main application backend, runs on port 34875, stateless, unauthenticated |
| PhantomJS-Validator | Service | App | PhantomJS 2.1.1 (QtWebKit) | Public | Headless browser for XSS validation, spawned as subprocess, 5-second timeout |
| Temp-File-Storage | DataStore | App | Filesystem (static/ directory) | Public | Temporary HTML files with random hex names, 5-second race window, publicly accessible via /static/ |
| Secret-Flag-File | DataStore | App | Filesystem (secret.txt) | Secrets | Contains CTF flag value, read once at startup, disclosed on XSS success |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| User Browser | Access: Public internet; Entry Points: http://localhost:34875/, http://localhost:34875/page; Authentication: None required; Client: Any modern browser |
| DalgonaCTF-Flask | Host: localhost:34875; Endpoints: `/` (index), `/page` (XSS challenge), `/static/*` (assets); Tech: Python 2.7.18 EOL, Flask 1.1.4, Werkzeug 1.0.1 dev server; Auth: None; Sessions: None; Debug: Enabled; Dependencies: PhantomJS-Validator, Temp-File-Storage, Secret-Flag-File |
| PhantomJS-Validator | Engine: PhantomJS 2.1.1 (abandoned 2018), QtWebKit (2015 engine); Execution: subprocess.Popen with 5s timeout; Stdin: URL of temp file; Stdout: "XSS" or error message; Script: check.js (48 lines); Privileges: Same as Flask app (root in container); Consumers: DalgonaCTF-Flask |
| Temp-File-Storage | Location: src/static/ directory; Naming: 32-char hex from os.urandom(16); Lifetime: ~5 seconds (creation → PhantomJS execution → deletion); Exposure: Public via /static/<hex>.html; Race Condition: Yes - accessible before os.unlink() |
| Secret-Flag-File | Location: src/secret.txt; Load Time: Application startup (app.py:22); Format: Plaintext flag string; Usage: Disclosed in /page response on successful XSS; Build: Injected via Dockerfile ARG and sed replacement |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → DalgonaCTF-Flask | HTTP | :34875 GET / | None | Public |
| User Browser → DalgonaCTF-Flask | HTTP | :34875 GET /page?name=<input> | None | Public |
| User Browser → DalgonaCTF-Flask | HTTP | :34875 GET /static/* | None | Public |
| DalgonaCTF-Flask → Secret-Flag-File | File | src/secret.txt | startup-only | Secrets |
| DalgonaCTF-Flask → Temp-File-Storage | File | static/<random>.html write | None | Public |
| DalgonaCTF-Flask → PhantomJS-Validator | Subprocess | stdin/stdout pipe | timeout:5s | Public |
| PhantomJS-Validator → Temp-File-Storage | File | static/<random>.html read | None | Public |
| PhantomJS-Validator → DalgonaCTF-Flask | HTTP | localhost:5000/static/<random>.html | None | Public |
| DalgonaCTF-Flask → User Browser | HTTP | :34875 response | xss-protection:disabled | Public or Secrets (if XSS successful) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication required - all endpoints are public |
| xss-protection:disabled | Protocol | X-XSS-Protection: 0 header explicitly disables browser XSS filters (intentional for CTF challenge) |
| timeout:5s | RateLimit | PhantomJS subprocess execution limited to 5 seconds via `timeout` command |
| startup-only | Env | Flag file read only once during application initialization, not on every request |

**Note on Authorization Guards:** This application has no authorization guards. All endpoints are equally accessible to all users without role checks, permission validation, or access control mechanisms.

## 7. Role & Privilege Architecture

**Status: NO ROLE OR PRIVILEGE SYSTEM EXISTS**

This application has no authentication or authorization system. All endpoints are publicly accessible without credentials.

### 7.1 Discovered Roles

**No roles found.** The application does not implement user roles, privilege levels, or access control.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 | Global | Default - no authentication required for any endpoint |

### 7.2 Privilege Lattice

**Not applicable.** There is no role hierarchy or privilege ordering.

```
Single Access Level: anonymous (public access)
  ↓
All Endpoints Accessible
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/*` (all routes) | None |

### 7.4 Role-to-Code Mapping

**Not applicable.** No role-based code paths exist.

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A |

## 8. Authorization Vulnerability Candidates

**Status: NOT APPLICABLE**

This application has no authorization system, therefore no authorization vulnerabilities exist. All endpoints are intentionally public as part of the CTF challenge design.

### 8.1 Horizontal Privilege Escalation Candidates

**None.** No user objects or user-specific resources exist.

### 8.2 Vertical Privilege Escalation Candidates

**None.** No administrative functions or privileged endpoints exist.

### 8.3 Context-Based Authorization Candidates

**None.** No multi-step workflows or state-dependent endpoints exist.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Analysis limited to network-accessible code paths through http://localhost:34875. Local-only scripts, build tools, CLI applications, and development utilities are excluded.

### Command Injection Sources

**Status: NO EXPLOITABLE COMMAND INJECTION SOURCES FOUND**

**Analysis Summary:**
The application uses `subprocess.Popen()` for PhantomJS execution, but it is **NOT vulnerable** to command injection due to secure implementation.

**Location:** `src/app.py:34`

**Code:**
```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, 
                        stdin=subprocess.PIPE)
```

**Why NOT Exploitable:**
1. **Hard-coded command array:** Command passed as list with no user input: `["timeout","5","phantomjs", "check.js"]`
2. **shell=False (default):** No shell interpretation - command executed directly
3. **No user input in command:** User input `msg` from `request.args.get('name','')` never flows into the subprocess command arguments
4. **Safe data flow:**
   - User input collected at line 66: `msg = request.args.get('name','')`
   - Input embedded in HTML at line 68: `value = '> {0}'.format(msg)`
   - HTML written to temporary file at lines 38-40
   - Only server-generated URL passed to PhantomJS via stdin at line 43: `proc.stdin.write(url)`
   - URL constructed from `os.urandom(16)` - no user input: `url = 'http://localhost:5000/' + fn`

**Complete Data Flow (Secure):**
```
1. User Input: /page?name=<USER_INPUT>
2. Collection: app.py:66 - msg = request.args.get('name','')
3. HTML Embedding: app.py:68 - value = '> {0}'.format(msg)
4. Template Generation: app.py:76 - data = XSS_CONTENT.format(..., value, ...)
5. File Write: app.py:38-40 - open(fn, 'w').write(page)
6. Subprocess Stdin: app.py:43 - proc.stdin.write(url)
   [SAFE: url = 'http://localhost:5000/static/' + os.urandom(16).encode('hex') + '.html']
   [USER INPUT NOT IN COMMAND OR URL]
```

**Other Dangerous Functions Analyzed:**
- ❌ `os.system()` - Not used
- ❌ `os.popen()` - Not used
- ❌ `os.exec*()` - Not used
- ❌ `eval()` - Not used
- ❌ `exec()` - Not used
- ❌ `compile()` - Not used
- ❌ `__import__()` with user input - Not used

**Conclusion:** No command injection sources found.

### SQL Injection Sources

**Status: NO SQL INJECTION SOURCES FOUND**

**Analysis Summary:**
The application has no database connectivity. All data is stored in files.

**Database Technology:** None

**Evidence:**
1. **No database imports:** No `sqlite3`, `psycopg2`, `mysql-connector`, `pymongo`, `sqlalchemy`, or any database driver imports
2. **No database connections:** No connection objects created
3. **No SQL queries:** No `.execute()`, `.cursor()`, `.query()` method calls
4. **No ORM:** No SQLAlchemy models or ORM patterns
5. **File-based storage only:** Application uses `secret.txt` file for flag storage (line 22: `flags = open('secret.txt').read().split()`)

**Data Storage Method:**
```python
# src/app.py:22 - File-based, not database
flags = open('secret.txt').read().split()
```

**Requirements Analysis:**
```
# src/requirements.txt
Flask==1.1.4
phantomjs
```
No database libraries present.

**Conclusion:** No SQL injection sources found - application has no database.

### Summary Table

| Injection Type | Sources Found | Exploitable | Network-Accessible |
|----------------|---------------|-------------|--------------------|
| Command Injection | 0 | No | N/A |
| SQL Injection | 0 | No | N/A |
| Template Injection | 0 | No | N/A (Python string formatting used, not Jinja2 SSTI) |
| LDAP Injection | 0 | No | N/A |
| XML Injection | 0 | No | N/A |
| XPath Injection | 0 | No | N/A |

**Note:** While the application has no command or SQL injection vulnerabilities, it **IS vulnerable to Cross-Site Scripting (XSS)**, which is the intended vulnerability type for this CTF challenge.

## 10. XSS Sources (from Pre-Recon Analysis)

**Network Surface Focus:** All XSS sources below are in network-accessible endpoints. No local-only scripts or build tools are included.

The pre-reconnaissance deliverable identified **6 XSS sinks** in this application. Key findings:

### Primary XSS Attack Vectors:

**Sink #1: HTML Attribute Injection (Primary)**
- **Location:** `src/app.py:68, 76, 79` → `src/constants.py:49`
- **Context:** Unquoted HTML attribute in `<input>` tag
- **Payload Example:** `?name=autofocus onfocus=confirm(1) x=`
- **Rendered:** `<input type=text name=name placeholder="Enter your name..." > autofocus onfocus=confirm(1) x=>`

**Sink #2: HTML Body Context Injection**
- **Location:** `src/app.py:68`
- **Context:** HTML body - full tag injection possible
- **Payload Example:** `?name="><img src=x onerror=confirm(1)>`

**Sink #3: Stored XSS via Temporary File**
- **Location:** `src/app.py:35-40`
- **Context:** Full HTML document
- **Attack:** Race condition - access `/static/<random>.html` during ~5 second window

**Sink #4: Disabled XSS Protection**
- **Location:** `src/app.py:80`
- **Code:** `response.headers["X-XSS-Protection"] = "0"`
- **Impact:** Removes browser-based XSS defenses

### Blacklist Bypasses:
The application blocks only `'alert'` (case-insensitive). Bypass techniques:
- Alternative functions: `confirm()`, `prompt()`
- Event handlers: `onfocus`, `onerror`, `onload`
- Tag injection: `<img>`, `<svg>`, `<script>`
- JavaScript contexts: `eval()`, `setTimeout()`

## 11. SSRF Sources (from Pre-Recon Analysis)

**Network Surface Focus:** The SSRF sink below is in the network-accessible `/page` endpoint.

### SSRF Sink #1: PhantomJS HTML Injection

**Primary Sink:** `src/check.js:20` - `page.open(input, function(status) {...})`

**Entry Point:** `GET /page?name=<payload>`

**Attack Chain:**
```
1. Attacker: GET /page?name="><img src="http://internal-service/admin">
2. Flask: Embeds payload in HTML template
3. Flask: Writes HTML to static/<random>.html
4. Flask: Passes URL to PhantomJS via stdin
5. PhantomJS: Opens http://localhost:5000/static/<random>.html
6. PhantomJS: Renders HTML and fetches http://internal-service/admin
7. Result: Server-side request to attacker-controlled or internal URL
```

**Impact:**
- Internal network scanning
- Cloud metadata access (AWS/GCP/Azure)
- Internal API exploitation
- Firewall bypass
- Data exfiltration

**Attack Vectors:**
- `<img src="...">`
- `<iframe src="...">`
- `<link href="...">`
- `<script src="...">`
- `<object data="...">`
- JavaScript `fetch()` or `XMLHttpRequest`

## 12. Temporary File Race Condition

**Attack Surface:** Temporary HTML file creation with public accessibility window

**Location:** `src/app.py:35-50`

**Vulnerability Pattern:**
```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'  # Random filename
url = 'http://localhost:5000/' + fn
try:
    of = open(fn, 'w')
    of.write(page)  # User-controlled HTML
    of.close()
    # ... PhantomJS processing (~5 seconds) ...
finally:
    os.unlink(fn)  # Cleanup
```

**Race Window:** Approximately 5 seconds between file creation and deletion

**Exploitation:**
1. Submit XSS payload to `/page?name=<payload>`
2. Guess/predict random filename (32 hex characters = 16 bytes = 2^128 possibilities - infeasible)
3. Alternative: If attacker can trigger multiple requests, temporarily generated files may be accessible

**Impact:** 
- Stored XSS (if file accessed before deletion)
- Information disclosure (user payloads visible during race window)

**Mitigation Notes:** The 128-bit random filename makes prediction infeasible, significantly reducing exploitability.

## 13. Critical Security Misconfigurations

### Configuration Issues Identified:

1. **Debug Mode Enabled**
   - **Location:** `src/app.py:86`
   - **Code:** `app.run(debug=True)`
   - **Impact:** Exposes stack traces, enables code reload, may expose Werkzeug debugger

2. **Exception Propagation Enabled**
   - **Location:** `src/app.py:25`
   - **Code:** `app.config['PROPAGATE_EXCEPTIONS'] = True`
   - **Impact:** Leaks error information in responses

3. **No SECRET_KEY**
   - **Location:** `src/app.py` (absence)
   - **Impact:** Sessions cannot be cryptographically signed (not used in this app)

4. **XSS Protection Disabled**
   - **Location:** `src/app.py:80`
   - **Code:** `response.headers["X-XSS-Protection"] = "0"`
   - **Impact:** Removes browser XSS filters (intentional for CTF)

5. **Missing Security Headers**
   - Content-Security-Policy: Not set
   - X-Frame-Options: Not set
   - X-Content-Type-Options: Not set
   - Strict-Transport-Security: Not set
   - Referrer-Policy: Not set

6. **Root Execution**
   - **Location:** Docker container configuration
   - **Impact:** Container runs as root, increasing escape risk

## 14. Outdated Technology Risks

### End-of-Life Software:

1. **Python 2.7.18** (EOL: January 1, 2020)
   - 5+ years past end-of-life
   - 50+ known unpatched CVEs
   - No security updates available

2. **PhantomJS 2.1.1** (Abandoned: March 2018)
   - 6+ years since abandonment
   - 30+ known unpatched CVEs
   - QtWebKit engine from circa 2015

3. **Debian Buster** (EOL: 2022)
   - Archived repositories
   - No security updates
   - Supply chain compromise risk

### Combined Risk:
- **100+ known CVEs** across the stack
- **Zero vendor support** for any component
- **Container escape potential** via browser engine exploits
- **Unpatched runtime environment** vulnerabilities

---

## RECONNAISSANCE COMPLETE

This reconnaissance deliverable provides the foundational intelligence for all subsequent vulnerability analysis phases. The application is a deliberately vulnerable XSS CTF challenge with no authentication, minimal validation, and intentionally disabled security protections.

**Key Findings Summary:**
- **Authentication:** None
- **Authorization:** None  
- **Session Management:** None
- **Primary Attack Surface:** `/page` endpoint with `name` parameter (XSS)
- **Secondary Attack Surfaces:** PhantomJS SSRF, temporary file race condition
- **Injection Vulnerabilities:** None (no command or SQL injection)
- **Technology Risk:** Critical (100+ unpatched CVEs in EOL stack)

**Next Phase Recommendations:**
- **XSS Specialist:** Focus on `/page` endpoint, bypass `'alert'` blacklist
- **SSRF Specialist:** Explore PhantomJS HTML injection via `/page` endpoint
- **Injection Specialists:** No injection vectors found - minimal analysis required
- **Auth/Authz Specialists:** No authentication or authorization system - no analysis needed