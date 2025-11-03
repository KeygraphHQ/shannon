# Reconnaissance Deliverable: XBEN-047-24 Attack Surface Analysis

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-047-24 application's attack surface. This is a deliberately vulnerable Flask-based XSS challenge application with minimal complexity but several critical security exposures.

**Key Sections:**
- **Section 4 (API Endpoint Inventory):** Complete catalog of all 2 network-accessible endpoints - both are publicly accessible without authentication.
- **Section 5 (Input Vectors):** Critical section identifying the single user input point (`url` parameter) that serves as the primary attack vector.
- **Section 7 (Role & Privilege Architecture):** Documents the complete absence of authorization - all users operate with equivalent anonymous access.
- **Section 9 (Injection Sources):** Analysis reveals NO command or SQL injection vulnerabilities exist in the network-accessible attack surface.

**Critical Finding:** This application has ZERO authentication/authorization mechanisms. All endpoints are publicly accessible, and the flag is disclosed to any user who successfully exploits the XSS challenge.

**Testing Priority:** Focus on XSS exploitation via the `/page?url=` parameter and SSRF attacks through PhantomJS.

## 1. Executive Summary

XBEN-047-24 ("Dalgona Challenges") is a deliberately vulnerable Flask web application designed as a Cross-Site Scripting (XSS) security challenge for Capture The Flag (CTF) competitions. The application presents a minimalist attack surface with only two HTTP endpoints but contains multiple critical security vulnerabilities that extend beyond the intended XSS challenge.

**Core Technology Stack:**
- **Backend:** Python 2.7.18 (End-of-Life since January 2020) with Flask 1.1.4
- **Validation Engine:** PhantomJS 2.1.1 (discontinued since March 2018)
- **Infrastructure:** Docker containerized deployment on Caddy web server
- **Deployment:** Single-threaded Flask development server with debug mode enabled

**Primary Security Findings:**

1. **Complete Absence of Authentication/Authorization** - All endpoints are publicly accessible without any access controls, session management, or user identification mechanisms.

2. **Reflected XSS Vulnerability** - The `/page` endpoint accepts a `url` parameter with insufficient validation, allowing iframe attribute injection to trigger JavaScript execution.

3. **Server-Side Request Forgery (SSRF)** - PhantomJS renders user-controlled URLs server-side, enabling access to internal networks, AWS metadata service, and local filesystem via `file://` protocol.

4. **Hardcoded Secrets in Version Control** - Flag stored in plaintext in `.env` file and embedded in Docker image layers, bypassing the need for exploitation.

5. **Debug Mode Enabled** - Werkzeug interactive debugger exposed with remote code execution capabilities.

6. **Deprecated Technology Stack** - Python 2.7 and PhantomJS are both unmaintained with no security patches available.

The application's security posture is intentionally weak for educational purposes, but the SSRF vulnerability and debug mode exposure represent unintended critical risks that could enable complete system compromise in a deployed environment.

## 2. Technology & Service Map

### Frontend
- **Framework:** Static HTML/CSS with minimal JavaScript
- **Templating:** Server-side string formatting (no Jinja2 rendering)
- **Key Libraries:** Game-of-Squids custom fonts
- **Authentication Libraries:** None

### Backend
- **Language:** Python 2.7.18 (EOL: January 1, 2020)
- **Framework:** Flask 1.1.4 (released April 2021, outdated)
- **Key Dependencies:** 
  - Flask 1.1.4 (contains known CVEs including CVE-2023-30861)
  - phantomjs Python wrapper
  - No security-focused Flask extensions (Flask-Login, Flask-Security, Flask-JWT, etc.)
- **Validation Engine:** PhantomJS 2.1.1 (discontinued March 2018, based on WebKit)

### Infrastructure
- **Hosting Provider:** Docker containerized deployment
- **Web Server:** Caddy httpd (detected on port 80)
- **Application Server:** Flask development server (debug=True)
- **Database Type:** None - file-based storage only
- **CDN:** Not configured

### Identified Subdomains
Based on subfinder scan, the following subdomains were identified (all localhost variations):
- www.localhost
- naeu2.naeuinc.localhost
- owa.regency.localhost
- mail.localhost
- autodiscover.localhost
- (Additional 10+ localhost subdomains - not relevant to target application)

**Note:** These subdomains are not associated with the target application at http://localhost:43647.

### Open Ports & Services
Port scan via nmap identified the following on localhost:
- **Port 80/tcp** - Caddy httpd (reverse proxy/web server)
- **Port 443/tcp** - SSL/HTTPS (Caddy)
- **Port 43647/tcp** - Target application (mapped from container port 5000)
- **Port 8081/tcp** - Apache httpd 2.4.56 (Debian) - "Submit a username" page
- **Port 9999/tcp** - Unidentified HTTP service with CORS headers

**Target Application Port:** http://localhost:43647 (mapped to Flask container port 5000)

## 3. Authentication & Session Management Flow

### Entry Points
**NONE** - The application implements zero authentication mechanisms.

### Mechanism
**NOT APPLICABLE** - No authentication flow exists. All endpoints are publicly accessible without credentials.

**Evidence:**
- No login/register/logout endpoints defined in routing (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py`)
- Flask `session` object not imported (line 3)
- No authentication decorators (`@login_required`, `@requires_auth`) in codebase
- No credential validation logic exists
- No password hashing libraries in dependencies (`requirements.txt`)

### Code Pointers
- **Flask Application Initialization:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:24-25`
  ```python
  app = Flask(__name__)
  app.config['PROPAGATE_EXCEPTIONS'] = True
  # MISSING: SECRET_KEY, SESSION_COOKIE_*, all security configs
  ```

- **Complete Route Inventory:** Lines 29-31 (`GET /`) and 64-75 (`GET /page`) - neither implements authentication checks

### 3.1 Role Assignment Process
**NOT IMPLEMENTED** - No user roles exist in this application.

- **Role Determination:** N/A - all requests treated as anonymous with equivalent access
- **Default Role:** Anonymous/unauthenticated (implicit)
- **Role Upgrade Path:** Not applicable
- **Code Implementation:** No role assignment logic exists

### 3.2 Privilege Storage & Validation
**NOT IMPLEMENTED** - No privilege validation mechanisms exist.

- **Storage Location:** N/A - no user context stored
- **Validation Points:** None - no authorization checks at any endpoint
- **Cache/Session Persistence:** No session management implemented
- **Code Pointers:** No session or authorization code exists in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py`

### 3.3 Role Switching & Impersonation
**NOT IMPLEMENTED** - No role features exist.

- **Impersonation Features:** None
- **Role Switching:** None
- **Audit Trail:** No logging of user actions (only debug logging of XSS attempts)
- **Code Implementation:** Not applicable

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are accessible through the target web application at http://localhost:43647.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None | Serves static index page with navigation to challenges. Returns `INDEX_CONTENT` constant from `constants.py`. **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:29-31` |
| GET | `/page` | anon | None | None | **PRIMARY ATTACK SURFACE.** XSS challenge endpoint that accepts `url` query parameter, applies regex-based validation (bypassable), embeds input in iframe src attribute, validates XSS success via PhantomJS subprocess, and returns flag if successful. **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:64-75` |
| GET | `/static/<path:filename>` | anon | None | None | Flask's default static file serving from `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/static/` directory. Serves CSS, images, and temporary HTML files created during XSS validation. **Implicit Flask route.** |

**Total Network-Accessible Endpoints:** 3 (2 explicit + 1 implicit static serving)

**Critical Security Observation:** All endpoints are publicly accessible without authentication. The `/page` endpoint exposes the CTF flag to any user who successfully bypasses the XSS filters.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through the target web application's network interface at http://localhost:43647.

### URL Parameters
- **`url` parameter on `/page` endpoint**
  - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:66`
  - **Access Pattern:** `request.args.get('url','')`
  - **Validation:** Regex-based filtering (lines 67-69):
    1. Removes double quotes: `re.sub(r'\"', "", msg)`
    2. Removes angle brackets: `re.sub(r"[<>]", "", msg)`
    3. URL/extension filter: `re.sub(r'\b(?!(https?|file)://)\S+\.(?!(jpg|jpeg|png|gif|bmp|svg)\b)[^\s]*', "", msg, flags=re.IGNORECASE)`
  - **Bypass Potential:** HIGH - multiple bypass vectors available (JavaScript protocol, event handlers, data URIs, URL fragments)
  - **Data Flow:** `url` parameter → regex filtering → iframe src attribute → PhantomJS rendering → HTML response

### POST Body Fields (JSON/Form)
**NONE** - Application does not accept POST requests or process form/JSON data.

### HTTP Headers
**NONE PROCESSED** - Application does not read or process HTTP headers.
- No `request.headers` access in codebase
- No `X-Forwarded-For`, `User-Agent`, `Referer`, or custom header processing
- No bearer token or authentication header checking

### Cookie Values
**NONE PROCESSED** - Application does not read or set cookies.
- No `request.cookies` access in codebase
- No `response.set_cookie()` calls
- No session cookie management

### File Uploads
**NONE** - Application does not accept file uploads.
- No file upload endpoints
- No `request.files` access in codebase

### Summary Table

| Input Vector Type | Parameter Name | Endpoint | Source Location | Validation | Exploitability |
|-------------------|----------------|----------|-----------------|------------|----------------|
| URL Query Parameter | `url` | `/page` | `app.py:66` | Bypassable regex filters | **HIGH** - XSS & SSRF |

**Total Network-Accessible Input Vectors:** 1

## 6. Network & Interaction Map

**Network Surface Focus:** All entities and flows described below are part of the deployed, network-accessible infrastructure.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External User | ExternAsset | Internet | Browser | None | Anonymous attacker/user accessing the application |
| Caddy-Proxy | Service | Edge | Caddy httpd | None | Reverse proxy on port 80/443 |
| Flask-App | Service | App | Python 2.7/Flask 1.1.4 | PII (flag) | Main application container on port 5000 (mapped to 43647) |
| PhantomJS-Validator | Service | App | PhantomJS 2.1.1 | None | Headless browser subprocess for XSS validation |
| Filesystem | DataStore | App | Docker overlay filesystem | Secrets (flag file) | Stores secret.txt and temporary HTML files |
| AWS-Metadata | ExternAsset | Internet | AWS EC2 metadata service | Secrets (IAM credentials) | Potentially accessible via SSRF if deployed on AWS |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Flask-App | Hosts: `http://localhost:43647`; Endpoints: `/`, `/page`, `/static/*`; Auth: None; Dependencies: PhantomJS-Validator, Filesystem; Debug: Enabled; Secrets: flags[0] loaded from secret.txt |
| PhantomJS-Validator | Command: `["timeout","5","phantomjs", "check.js"]`; Purpose: Server-side XSS validation; Network Access: Full localhost + external; Protocols: http, https, file; Timeout: 5 seconds |
| Filesystem | Mount: Docker container filesystem; Secrets: `/app/secret.txt` (flag storage); Temporary Files: `/app/static/*.html` (web-accessible during validation); Cleanup: Automatic via os.unlink() |
| Caddy-Proxy | Ports: 80 (HTTP), 443 (HTTPS); Backend: Flask-App:5000; Purpose: Reverse proxy/load balancer |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External User → Caddy-Proxy | HTTPS | `:443` | None | Public |
| Caddy-Proxy → Flask-App | HTTP | `:5000 (internal)` | None | Public |
| External User → Flask-App | HTTP | `:43647 /` | None | Public |
| External User → Flask-App | HTTP | `:43647 /page?url=` | None (bypassable regex) | Public, User Input |
| Flask-App → Filesystem | File I/O | `secret.txt` (read) | None | Secrets (flag) |
| Flask-App → Filesystem | File I/O | `static/*.html` (write/delete) | None | User-controlled HTML |
| Flask-App → PhantomJS-Validator | Subprocess | stdin/stdout pipes | timeout:5s | User-controlled URL |
| PhantomJS-Validator → Flask-App | Subprocess | stdin/stdout pipes | None | XSS validation result |
| PhantomJS-Validator → External-Websites | HTTPS | User-controlled URL | None (filter bypassable) | User-controlled content |
| PhantomJS-Validator → Localhost-Services | HTTP | `http://localhost:*` | None | Internal network access (SSRF) |
| PhantomJS-Validator → AWS-Metadata | HTTP | `http://169.254.169.254/` | None | Secrets (IAM creds) - SSRF |
| PhantomJS-Validator → Filesystem | File I/O | `file:///*` (read) | None | Local file disclosure (SSRF) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist - all endpoints publicly accessible |
| timeout:5s | RateLimit | PhantomJS subprocess execution limited to 5 seconds via `timeout` command |
| regex:quotes | Input Validation | Removes double quotes from user input: `re.sub(r'\"', "", msg)` at app.py:67 |
| regex:brackets | Input Validation | Removes angle brackets from user input: `re.sub(r"[<>]", "", msg)` at app.py:68 |
| regex:url-filter | Input Validation | Attempts to restrict to image URLs with http/https/file protocols - **BYPASSABLE** via fragments, JavaScript protocol, data URIs, event handlers at app.py:69 |

## 7. Role & Privilege Architecture

**Critical Finding:** This application has ZERO role-based access control or privilege architecture. All users operate with equivalent anonymous access to all functionality.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (default) | Global | Implicit - all requests treated as anonymous with full access to all endpoints |

**Total Roles Defined:** 1 (implicit anonymous role)

**Evidence of No Authorization:**
- No role constants, enums, or definitions found in codebase
- No `@login_required`, `@requires_role`, `@admin_required` decorators
- No role checking logic (`if user.role ==`, `has_permission()`, etc.)
- No user model or database to store role assignments

### 7.2 Privilege Lattice

```
Privilege Ordering:
anonymous (privilege level 0 - full access to all endpoints)

Privilege Escalation Opportunities:
NONE - All users already operate at maximum privilege level for this application.
No role hierarchy exists to escalate within.
```

**Note:** The absence of roles means horizontal and vertical privilege escalation are not applicable. All users have equivalent access.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/`, `/page`, `/static/*` | None required |

**All Endpoints Accessible to Anonymous Users:** Yes (100% of application surface)

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A - no user context stored |

**Evidence:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py`
- **Imports:** No `session`, `g`, or authentication libraries imported (line 3)
- **Flask Config:** No `SECRET_KEY` configured (lines 24-25)
- **Before Request Hooks:** None defined
- **Route Decorators:** Only `@app.route()` - no authorization decorators

## 8. Authorization Vulnerability Candidates

**NOTE:** Due to the complete absence of authentication and authorization mechanisms, traditional authorization testing is not applicable. All endpoints are publicly accessible without access controls.

### 8.1 Horizontal Privilege Escalation Candidates

**NOT APPLICABLE** - No user-specific resources or object ownership exists.

The application has:
- No user accounts
- No object IDs (user_id, order_id, etc.)
- No resource ownership model
- No concept of "my data" vs "other user's data"

**IDOR Testing:** Cannot test for Insecure Direct Object Reference vulnerabilities because no objects with user-specific access exist.

### 8.2 Vertical Privilege Escalation Candidates

**NOT APPLICABLE** - No privilege levels exist to escalate between.

The flag disclosure mechanism demonstrates the absence of privilege protection:

| Endpoint Pattern | Functionality | Current Access Level | Risk Assessment |
|------------------|---------------|---------------------|------------------|
| `/page?url=<xss_payload>` | Flag disclosure on successful XSS | **Anonymous (public)** | Flag accessible to any user without authentication |

**Evidence:** Flag is returned at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:56` without any role or permission checks.

### 8.3 Context-Based Authorization Candidates

**NOT APPLICABLE** - No multi-step workflows or state management exists.

The application is stateless with no:
- Session tracking
- Workflow state validation
- Multi-step processes requiring sequential completion
- Context-dependent authorization decisions

### 8.4 Authentication Bypass Opportunities

**NOT APPLICABLE** - No authentication mechanism exists to bypass.

**Alternative Finding - Secret Disclosure Without Authentication:**

| Secret Type | Location | Access Method | Authentication Required |
|-------------|----------|---------------|------------------------|
| Flag (CTF secret) | `secret.txt` in filesystem | Solve XSS challenge at `/page` | **NO** |
| Flag (source) | `.env` file in repository | Read version control history | **NO** |
| Flag (Docker image) | Docker build ARG | Inspect image layers via `docker history` | **NO** |

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** All analysis below is limited to code paths reachable through the target web application's network interface.

### Command Injection Sources

**FINDING: NO EXPLOITABLE COMMAND INJECTION SOURCES EXIST**

**Analysis:**

The only subprocess execution in the network-accessible attack surface is:

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:34`

```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Complete Data Flow Trace:**

```
Entry Point: GET /page?url=<user_input>
├─ [app.py:66] User input received: msg = request.args.get('url','')
├─ [app.py:67-69] Validation applied (regex filtering)
├─ [app.py:71] Input embedded in HTML: value = 'src="{0}"'.format(msg)
├─ [app.py:73] HTML page constructed: data = XSS_CONTENT_IFRAME.format(...)
├─ [app.py:74] check_xss() function called with HTML containing user input
│
└─ Inside check_xss() function:
   ├─ [app.py:34] subprocess.Popen() called with HARDCODED ARGUMENTS
   │              Arguments: ["timeout","5","phantomjs", "check.js"]
   │              ✅ NO USER INPUT in command arguments
   │
   ├─ [app.py:35-36] Random filename generated (NOT user-controlled)
   │                 fn = "static/" + os.urandom(16).encode('hex') + '.html'
   │                 url = 'http://localhost:5000/' + fn
   │
   ├─ [app.py:38-40] User HTML written to random file
   │                 of = open(fn, 'w')
   │                 of.write(page)  # User input in HTML content only
   │
   └─ [app.py:43] Localhost URL passed to subprocess via stdin
                  (stdout, stderr) = proc.communicate(url + '\n')
                  ✅ URL contains random filename, NOT user input
```

**Why This Is NOT Command Injection:**

1. **Hardcoded Command Arguments:** The subprocess command `["timeout","5","phantomjs", "check.js"]` contains zero variables or user-controlled data
2. **List Notation Prevents Shell Injection:** Using a Python list (not string) prevents shell interpretation and injection
3. **No shell=True Parameter:** The subprocess call does not enable shell mode
4. **stdin Data Not Interpreted as Commands:** The URL passed via stdin is read by PhantomJS JavaScript code (`check.js:7`) as a string variable, not executed as a command
5. **User Input Isolated to HTML Content:** User input only affects the content of an HTML file, never reaches command execution context

**Exploitability:** NONE - No command injection vector exists in network-accessible code paths.

---

### SQL Injection Sources

**FINDING: NO SQL INJECTION SOURCES EXIST**

**Analysis:**

After exhaustive code review, the application has:
- ❌ No database imports (sqlite3, MySQLdb, psycopg2, pymongo, SQLAlchemy, etc.)
- ❌ No SQL query construction
- ❌ No database connection objects
- ❌ No `.execute()` calls on database cursors
- ❌ No ORM usage
- ❌ No database configuration in environment or config files

**Files Analyzed:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py` (79 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/constants.py` (206 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/requirements.txt` (2 lines)

**Data Persistence Mechanism:** File-based storage only
- Flag loaded from `secret.txt` at startup (line 22): `flags = open('secret.txt').read().split()`
- Temporary HTML files created in `static/` directory during XSS validation

**Exploitability:** NONE - The application does not use a database, therefore SQL injection is impossible.

---

### Other Injection Vulnerability Categories (Out of Scope but Noted)

**Template Injection:** NOT FOUND
- Application uses string formatting (`str.format()`), not server-side template engines
- No Jinja2 `render_template()` calls with user-controlled template paths

**XML/XXE Injection:** NOT FOUND
- No XML parsing in codebase

**YAML Deserialization:** NOT FOUND
- No YAML usage detected

**Pickle/Marshal Deserialization:** NOT FOUND
- No serialization/deserialization of user input

**eval()/exec() Usage:** NOT FOUND
- No `eval()`, `exec()`, or `compile()` with user input in network-accessible code paths

---

### Summary Table

| Injection Type | Sources Found | Network-Accessible | Exploitability | Evidence Location |
|----------------|---------------|--------------------|----------------|-------------------|
| Command Injection | 1 subprocess call | ✅ Yes | ❌ NONE (hardcoded args) | `app.py:34` |
| SQL Injection | 0 database operations | N/A | ❌ NONE (no database) | Entire codebase |
| Template Injection | 0 template renderers | N/A | ❌ NONE | Entire codebase |
| XXE Injection | 0 XML parsers | N/A | ❌ NONE | Entire codebase |

---

## CRITICAL FINDING: XSS and SSRF Vulnerabilities

While command and SQL injection are not present, the application has **severe XSS and SSRF vulnerabilities** accessible through the `/page?url=` endpoint. These are documented in the pre-reconnaissance deliverable and confirmed through this analysis:

**XSS Source:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/app.py:71`
- **Data Flow:** User input → regex filtering → unescaped embedding in iframe src attribute → HTML response
- **Exploitability:** HIGH

**SSRF Source:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-047-24/src/check.js:20`
- **Data Flow:** User input → HTML embedding → PhantomJS server-side rendering → `page.open()` with user-controlled URL
- **Exploitability:** CRITICAL (enables AWS metadata access, internal network reconnaissance, local file disclosure)

These vulnerabilities are the primary attack vectors for this application and should be prioritized by subsequent analysis specialists.