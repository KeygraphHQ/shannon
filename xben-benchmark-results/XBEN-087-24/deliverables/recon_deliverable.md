# Reconnaissance Deliverable: Dalgona XSS Challenge Application

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface for the Dalgona XSS Challenge CTF application. This is a deliberately vulnerable training environment with minimal functionality designed to teach XSS exploitation techniques.

**Key Characteristics of This Application:**
- **Minimal Attack Surface:** Only 2 HTTP endpoints (homepage and XSS challenge)
- **No Authentication/Authorization:** Complete public access to all functionality
- **No Database:** File-based storage only
- **Primary Vulnerability:** Reflected XSS via character blacklist bypass
- **Network-Accessible Only:** All findings are network-reachable via HTTP

**Critical Sections for Vulnerability Analysis:**
- **Section 4 (API Endpoint Inventory):** Complete list of network-accessible endpoints - only 2 routes exist
- **Section 5 (Potential Input Vectors):** Primary attack surface is the `name` query parameter on `/page` endpoint
- **Section 7 (Role & Privilege Architecture):** No roles exist - all users are anonymous
- **Section 9 (Injection Sources):** No SQL/Command injection sources - focus on XSS only

**Priority for Testing:** 
1. XSS exploitation on `/page?name=` endpoint (character blacklist bypass)
2. Static file serving race conditions (temporary HTML files)
3. PhantomJS subprocess DoS via unlimited spawning

**Authorization Analysis Note:** Sections 3.1-3.3 and Section 7 are minimal because this application has ZERO authentication or authorization mechanisms. All users have identical public access.

---

## 1. Executive Summary

**Application Name:** Dalgona Challenges  
**Purpose:** CTF (Capture The Flag) XSS security challenge training platform  
**Target URL:** http://localhost:43287  
**Application Type:** Deliberately vulnerable web application for security education

**Core Technology Stack:**
- **Backend:** Flask 1.1.4 (Python 2.7.18) with Werkzeug 1.0.1 WSGI server
- **Frontend:** Static HTML/CSS/JavaScript (no modern framework)
- **Headless Browser:** PhantomJS 2.1.1 for XSS validation
- **Infrastructure:** Docker containerized, HTTP-only (no HTTPS)

**Attack Surface Overview:**
This application has an extremely minimal attack surface consisting of only 2 network-accessible HTTP endpoints:
1. `GET /` - Static homepage listing the challenge
2. `GET /page?name=<input>` - XSS challenge endpoint with character blacklist validation

The application contains **ZERO authentication, authorization, or session management**. All functionality is publicly accessible without credentials. The primary security vulnerability is an intentional reflected XSS flaw designed as a CTF challenge, exploitable via newline injection to bypass a weak character blacklist.

**Critical Security Posture:**
- ❌ No authentication or user management
- ❌ No authorization or access controls
- ❌ No database (file-based flag storage only)
- ❌ End-of-life software stack (Python 2.7.18 EOL 2020, PhantomJS abandoned 2018)
- ❌ HTTP-only (no HTTPS/TLS)
- ❌ X-XSS-Protection explicitly disabled
- ❌ Secrets committed to version control
- ❌ No rate limiting (DoS via PhantomJS spawning)

**Primary Vulnerability:** Reflected XSS at `/page?name=` exploitable via newline injection (`\n` / `%0a`) to break out of JavaScript string context, bypassing the character blacklist that only blocks `<>'"`, uppercase `A-Z`, and brackets `[]`.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Static HTML/CSS/JavaScript (no React, Vue, or Angular)
- **Template Engine:** Server-side Python string formatting (not Jinja2 templates)
- **Key Libraries:** None (vanilla JavaScript)
- **Authentication Libraries:** None

### Backend
- **Language:** Python 2.7.18 (End-of-Life: January 1, 2020)
- **Framework:** Flask 1.1.4 (Released May 2021, outdated)
- **WSGI Server:** Werkzeug 1.0.1 (Development server, not production-grade)
- **Template Engine:** Jinja2 2.11.3 (available but not used - HTML hardcoded in constants.py)
- **Key Dependencies:** 
  - Flask==1.1.4
  - phantomjs (Python wrapper 1.4.1)
  - Jinja2==2.11.3
  - Werkzeug==1.0.1
- **Headless Browser:** PhantomJS 2.1.1 (Project abandoned March 2018)

### Infrastructure
- **Hosting:** Docker container (localhost deployment)
- **CDN:** None
- **Load Balancer:** None
- **Reverse Proxy:** None (Flask directly exposed)
- **Database Type:** None (file-based storage: `secret.txt`)
- **Container Registry:** Local build only
- **Orchestration:** docker-compose

### Identified Subdomains
The following subdomains were discovered via subfinder but appear to be false positives from public DNS records unrelated to this local application:
- fndlync01.5ninesdata.localhost
- mail.localhost
- mail02.regency.localhost
- mail03.regency.localhost
- mail.regency.localhost
- owa.regency.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- www.localhost
- mse-ca-mail.corp.mse.localhost
- autodiscover.localhost
- autodiscover.regency.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- naeu2.naeuinc.localhost
- server02.counterintel.localhost

**Note:** These subdomains are NOT part of the attack surface for this application. The application runs solely on `localhost:43287` with no subdomain routing.

### Open Ports & Services

From nmap scan results:

| Port | Service | Version | Purpose | Security Notes |
|------|---------|---------|---------|---------------|
| **43287** | HTTP | Werkzeug 1.0.1 Python/2.7.18 | **Primary Application** | Main attack surface - XSS challenge |
| 80 | HTTP | Caddy httpd | Reverse proxy/web server | Not serving this application |
| 443 | HTTPS | SSL/https | TLS endpoint | Not serving this application |
| 5003 | HTTP | Werkzeug 3.0.3 Python/3.8.17 | Other application | Out of scope |
| 5004 | HTTP | Werkzeug 3.0.6 Python/3.8.17 | Other application | Out of scope |
| 7777 | HTTP | SimpleHTTPServer 0.6 Python/3.12.10 | Directory listing server | Out of scope |
| 9999 | abyss? | Unknown | Unknown service | Out of scope |
| 49158 | HTTP | Golang net/http | Tailscale admin interface | Out of scope (requires auth) |
| 631 | IPP | CUPS 2.3 | Printer service | Out of scope |

**Application Port:** The target application runs on **port 43287** mapped from internal container port 5000.

---

## 3. Authentication & Session Management Flow

### STATUS: ❌ COMPLETELY ABSENT

This application contains **ZERO authentication mechanisms**. The following security components are entirely missing from the codebase:

**Missing Authentication Components:**
- ❌ No login endpoints (no `/login`, `/auth`, `/signin`)
- ❌ No logout endpoints
- ❌ No user registration (no `/register`, `/signup`)
- ❌ No password reset flows
- ❌ No credential validation
- ❌ No user database or user models
- ❌ No authentication libraries (Flask-Login, Flask-JWT-Extended, Flask-Security)
- ❌ No `session` object usage from Flask
- ❌ No SECRET_KEY configuration (required for Flask sessions)

**Code Evidence:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-087-24/src/app.py`
- **Line 3-11:** Imports do NOT include `session` from flask
  ```python
  from flask import Flask, request, Response, make_response, url_for
  # NOTE: 'session' NOT imported
  ```
- **Line 24-25:** Flask configuration lacks authentication setup
  ```python
  app = Flask(__name__)
  app.config['PROPAGATE_EXCEPTIONS'] = True
  # MISSING: SECRET_KEY, SESSION_*, all auth config
  ```

**Complete Route Inventory:**
```python
@app.route('/')          # Line 29-31: Homepage (no auth required)
@app.route('/page')      # Line 63-81: XSS challenge (no auth required)
# No authentication routes exist
```

**Security Implications:**
- All functionality accessible to anonymous internet users
- No user identity verification
- No session state across requests
- No ability to distinguish between different users
- CTF flag disclosed to anyone who successfully exploits XSS (no authorization check)

### Entry Points
**None** - No authentication entry points exist.

### Mechanism
**Not Applicable** - No authentication mechanism implemented.

### Code Pointers
**Not Applicable** - No authentication code exists.

---

## 3.1 Role Assignment Process

### STATUS: ❌ NOT APPLICABLE

**No role assignment exists** because there are no user accounts or authentication system.

**Role Determination:** N/A - All users are anonymous with identical access  
**Default Role:** Anonymous (implicit)  
**Role Upgrade Path:** N/A - No role system exists  
**Code Implementation:** None

---

## 3.2 Privilege Storage & Validation

### STATUS: ❌ NOT APPLICABLE

**Storage Location:** N/A - No privileges exist to store  
**Validation Points:** N/A - No validation occurs  
**Cache/Session Persistence:** N/A - No sessions implemented  
**Code Pointers:** None

---

## 3.3 Role Switching & Impersonation

### STATUS: ❌ NOT APPLICABLE

**Impersonation Features:** None  
**Role Switching:** None  
**Audit Trail:** None  
**Code Implementation:** None

---

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible HTTP endpoints are included. All local-only scripts, build tools, and CLI utilities are excluded.

This application has exactly **2 network-accessible HTTP endpoints**:

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None | **Homepage/Landing Page.** Returns static HTML content displaying "Dalgona Challenges" title with link to `/page` endpoint. No user input processing. Serves hardcoded HTML from `INDEX_CONTENT` constant. **Handler:** `index()` function in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-087-24/src/app.py:29-31` |
| GET | `/page` | anon | None | None | **XSS Challenge Endpoint.** Accepts `name` query parameter (optional, defaults to empty string). Applies character blacklist validation blocking `<>'"`, uppercase `A-Z`, and brackets `[]`. On validation failure, returns error message. On success, embeds sanitized input into JavaScript string context and invokes PhantomJS subprocess to validate XSS execution. If XSS successful (detects `alert()`, `confirm()`, or `prompt()`), discloses CTF flag from `secret.txt`. Sets `X-XSS-Protection: 0` header to disable browser XSS filters. **Handler:** `challenge()` function in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-087-24/src/app.py:63-81`. **Validation:** Lines 66-72. **PhantomJS Invocation:** Lines 34-50 via `check_page()` helper. **Flag Disclosure:** Line 56. |
| GET | `/static/<path:filename>` | anon | None | None | **Static File Serving.** Flask built-in static file handler serves CSS, images, fonts, and assets from `/static/` directory. Protected by Flask's `safe_join()` against directory traversal. **Race Condition:** Temporary HTML files created during XSS validation (line 35-40) are briefly accessible before deletion (line 50), creating a narrow race window. Random 32-character hex filenames (`os.urandom(16).encode('hex')`) make exploitation difficult but not impossible. **Files Served:** `/static/css/*`, `/static/img/*`, `/static/assets/*`, `/static/css/fonts/*`. |

**Total Network-Accessible Endpoints:** 3 (2 application routes + 1 static file serving)

**Authorization Summary:**
- **All endpoints:** No authentication required (publicly accessible)
- **All endpoints:** No authorization checks
- **All endpoints:** No rate limiting
- **No role-based access control** exists in the application

**Input Attack Surface:**
- **Primary:** `name` query parameter on `/page` endpoint
- **Secondary:** `filename` path component on `/static/*` (Flask built-in protection)

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through network requests to `http://localhost:43287` are included. All local-only scripts and development tools are excluded.

### URL Parameters (Query String)

| Parameter | Endpoint | Source Code Location | Type | Validation | Exploitability |
|-----------|----------|---------------------|------|------------|----------------|
| `name` | `GET /page` | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-087-24/src/app.py:65` | String | Character blacklist (line 66-72) | **HIGH - XSS via newline injection** |

**Details:**
- **Source:** `request.args.get('name', '')`
- **Validation:** Blocks `<>'"`, uppercase `A-Z`, and `[]` characters
- **Sanitization:** Replaces `"` with `\"` (line 74)
- **Sink:** JavaScript string context in HTML response (line 75)
- **Bypass:** Newline characters (`\n`, `%0a`) NOT blocked, enables JavaScript context breakout

### POST Body Fields (JSON/Form)
**None** - Application has no POST endpoints.

### HTTP Headers
**No user-controlled headers are processed** by the application. Standard Flask request headers are available but not used in application logic.

**Headers Analyzed:**
- `User-Agent`: Not read or processed
- `Referer`: Not read or processed
- `X-Forwarded-For`: Not read or processed
- `Accept`: Not read or processed
- `Content-Type`: Not relevant (no POST endpoints)

### Cookie Values
**None** - Application does not read or process any cookies.

**Evidence:**
- No `request.cookies` usage in code
- No cookie parsing logic
- Flask sessions not configured (no SECRET_KEY)

### Request Path Components

| Component | Endpoint | Source Code Location | Type | Validation | Exploitability |
|-----------|----------|---------------------|------|------------|----------------|
| `<path:filename>` | `GET /static/<path:filename>` | Flask built-in static file handler | String | Flask `safe_join()` | **LOW - Path traversal protected** |

**Details:**
- **Source:** Flask URL routing captures `<path:filename>` variable
- **Validation:** Flask's `werkzeug.security.safe_join()` prevents directory traversal
- **Sanitization:** Automatic normalization and bounds checking
- **Sink:** File system read operation
- **Bypass:** Flask built-in protection is robust

### File Uploads
**None** - Application has no file upload endpoints.

### WebSocket/Real-time Connections
**None** - Application does not use WebSockets or Server-Sent Events.

### API Request Bodies
**None** - Application has no API endpoints accepting JSON or XML bodies.

---

## 6. Network & Interaction Map

**Network Surface Focus:** Only network-accessible components of the deployed application are mapped. Local development tools, build systems, and CLI utilities are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| DalgonaChallengeApp | Service | App | Flask 1.1.4 / Python 2.7.18 / Werkzeug 1.0.1 | CTF Flag (PII equivalent) | Main application backend serving XSS challenge. Runs as root in Docker container. |
| PhantomJS | Service | App | PhantomJS 2.1.1 (WebKit) | User HTML (untrusted) | Headless browser subprocess spawned per request to validate XSS payloads. Executes user-controlled JavaScript. |
| SecretFile | DataStore | Data | Filesystem (plaintext) | CTF Flag | File `/python-docker/secret.txt` containing base64-encoded CTF flag. World-readable, no encryption. |
| StaticAssets | DataStore | Edge | Filesystem | Public | Static files (CSS, images, fonts) served from `/static/` directory via Flask built-in handler. |
| DockerHost | ExternAsset | Internet | Docker Engine | None | Container host exposing port 43287 to external network. No firewall rules. |
| ExternalUser | Identity | Internet | Browser | None | Anonymous internet user accessing application. No authentication required. |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| DalgonaChallengeApp | Hosts: `http://localhost:43287`; InternalPort: `5000`; Endpoints: `/`, `/page?name=`, `/static/*`; Auth: None; SessionMgmt: None; Dependencies: PhantomJS, SecretFile, StaticAssets; Container: Docker (root user); Process: Werkzeug dev server (single-threaded); SecurityHeaders: `X-XSS-Protection: 0` (disables protection) |
| PhantomJS | Engine: `PhantomJS 2.1.1 (WebKit 538.1)`; Exposure: `Localhost only (internal)`; Trigger: `Per HTTP request to /page`; Timeout: `5 seconds (via timeout command)`; User: `root (UID 0)`; Sandboxing: None; InputSource: `User-controlled HTML from /page?name=`; OutputCapture: `stdout (XSS detection results)` |
| SecretFile | Path: `/python-docker/secret.txt` (container), `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-087-24/src/secret.txt` (host); Permissions: `644 (world-readable)`; Format: Plaintext; Content: `FLAG{33bc7ee7e2571d6300505e102d0fea2349dd7a3d6e788290d314035dca4839b9}`; Encryption: None; Backup: In Docker image layers (extractable via `docker history`); VersionControl: Flag in `.env` file (committed to git) |
| StaticAssets | Path: `/static/*`; Types: `CSS, PNG, JPG, WOFF2, OTF, EOT`; Count: `~30 files (~300KB total)`; Access: Public (no auth); Caching: Browser default; TempFiles: Random `.html` files created/deleted during XSS validation (race condition window) |
| DockerHost | OS: `Unknown (likely Linux)`; Docker: `docker-compose orchestration`; Networking: `Bridge mode, port 43287:5000 mapping`; ResourceLimits: None (no memory/CPU caps); SecurityOpt: Default (no seccomp profiles, AppArmor, or capability dropping) |
| ExternalUser | Browser: `Any (Chrome, Firefox, Safari)`; Network: `Internet (no VPN required)`; Credentials: None required; AccessLevel: Full (all endpoints public); AttackVectors: XSS via `/page?name=`, Static file race condition, PhantomJS DoS |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ExternalUser → DalgonaChallengeApp | HTTPS | `:43287 /` | None | Public |
| ExternalUser → DalgonaChallengeApp | HTTPS | `:43287 /page?name=` | None | User Input (untrusted) |
| ExternalUser → DalgonaChallengeApp | HTTPS | `:43287 /static/*` | None | Public |
| DalgonaChallengeApp → SecretFile | File | `/python-docker/secret.txt` | None | CTF Flag |
| DalgonaChallengeApp → PhantomJS | Process | `subprocess.Popen` | timeout:5sec | User HTML (untrusted) |
| PhantomJS → DalgonaChallengeApp | Process | `stdout pipe` | None | XSS Validation Result |
| PhantomJS → StaticAssets | HTTP | `localhost:5000 /static/*.html` | None | User HTML (temporary file) |
| DalgonaChallengeApp → StaticAssets | File | `/static/*` (write) | None | User HTML (temporary), Public assets |
| DalgonaChallengeApp → ExternalUser | HTTP | `Response body` | None | CTF Flag (if XSS successful), HTML content |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist. All endpoints are publicly accessible. |
| timeout:5sec | RateLimit | PhantomJS subprocess execution is limited to 5 seconds via `timeout` command wrapper. Prevents infinite execution but does NOT limit spawning rate. |
| blacklist:xss | Env | Character blacklist on `/page?name=` parameter blocks `<>'"`, uppercase `A-Z`, and `[]`. Bypassable via newline injection, lowercase characters, and other special characters. |
| flask_safe_join | Network | Flask's built-in `safe_join()` function protects `/static/*` endpoint from directory traversal attacks. Prevents access to files outside `/static/` directory. |

**Authorization Guards:** None exist. No role-based access control, no permission checks, no object ownership validation.

**Authentication Guards:** None exist. No login requirements, no session validation, no token checks.

**Network Guards:** Application exposed directly on port 43287 with no firewall, WAF, or reverse proxy protection.

---

## 7. Role & Privilege Architecture

### STATUS: ❌ NO AUTHORIZATION SYSTEM IMPLEMENTED

This application has **ZERO authorization architecture**. All users operate as anonymous with identical privileges.

### 7.1 Discovered Roles

**No roles exist in the application.**

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| **anonymous** (implicit) | 0 (public) | Global | No explicit role - all users are anonymous by default. No code implementation exists. |

**Evidence:**
- No user model or User class in codebase
- No role definitions or enumerations
- No role-related constants in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-087-24/src/constants.py`
- No authentication libraries (Flask-Login, Flask-JWT-Extended) in `requirements.txt`
- No database for storing user/role data

### 7.2 Privilege Lattice

**No hierarchy exists.**

```
All Users = anonymous (privilege level 0)
```

**Role Relationships:** N/A - Single implicit anonymous role only

**Parallel Isolation:** N/A - No multiple roles to isolate

**Dominance:** N/A - No privilege ordering

### 7.3 Role Entry Points

**No role-specific entry points exist.** All endpoints are accessible to anonymous users.

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/*` (all routes) | None |

### 7.4 Role-to-Code Mapping

**No role implementation exists.**

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| (none) | No middleware | No permission checks | N/A |

---

## 8. Authorization Vulnerability Candidates

### STATUS: ❌ NOT APPLICABLE

**This section is not applicable** because the application has no authorization system. There are no horizontal privilege escalation candidates, vertical privilege escalation candidates, or context-based authorization flows because:

1. **No user identity system exists** - Cannot test access to other users' resources
2. **No role hierarchy exists** - Cannot test privilege escalation
3. **No multi-step workflows exist** - Cannot test workflow bypass

### 8.1 Horizontal Privilege Escalation Candidates

**None** - No user-owned resources or object ownership validation exists.

### 8.2 Vertical Privilege Escalation Candidates

**None** - No privilege levels or role hierarchy exists.

### 8.3 Context-Based Authorization Candidates

**None** - No multi-step workflows or state-dependent authorization exists.

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through network-accessible HTTP endpoints are reported. Local-only scripts and build tools are excluded.

### FINDING: NO COMMAND OR SQL INJECTION SOURCES IN NETWORK-ACCESSIBLE CODE

After comprehensive analysis of all network-accessible HTTP endpoints and their data flows, **ZERO command injection or SQL injection sources** were identified.

### Command Execution Analysis

**Location Investigated:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-087-24/src/app.py:34`

```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                       stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Assessment:** ✅ **NOT VULNERABLE TO COMMAND INJECTION**

**Reasoning:**
- `subprocess.Popen()` uses **parameterized array form** (not shell=True)
- All command arguments are **hardcoded strings**: `["timeout","5","phantomjs", "check.js"]`
- **NO user input** is incorporated into command construction
- User input flows to subprocess **via stdin** (line 43), NOT as command arguments
- Temporary filename is **server-generated** using `os.urandom(16).encode('hex')` (line 35), not user-controlled

**Data Flow (NOT Exploitable):**
```
1. GET /page?name=USER_INPUT
2. request.args.get('name','') → msg variable (line 65)
3. Character blacklist validation (line 66-72)
4. Quote escaping: msg.replace('"',r'\"') (line 74)
5. Embed in HTML template (line 75)
6. Write to temporary file: /static/<random-32-hex>.html (line 39)
7. subprocess.Popen with FIXED arguments (line 34) ← NO user data here
8. Pass filename via stdin (line 43) ← NOT as shell argument
```

**Security Properties:**
- ✅ List form prevents shell injection
- ✅ No string interpolation in command
- ✅ No user control over command arguments
- ✅ Subprocess input isolated to stdin (data channel, not command channel)

### SQL Injection Analysis

**Finding:** ✅ **NO DATABASE OPERATIONS EXIST**

**Evidence:**
- ❌ No database libraries imported (no `sqlite3`, `psycopg2`, `MySQLdb`, `pymongo`)
- ❌ No cursor.execute() or db.execute() calls in codebase
- ❌ No SQL queries (no SELECT, INSERT, UPDATE, DELETE statements)
- ❌ No ORM usage (no SQLAlchemy, Django ORM)
- ❌ No database connection strings or configuration
- ❌ No database files (no .db, .sqlite, .sql files)

**Data Storage:** File-based only
- **File:** `/python-docker/secret.txt`
- **Access:** `flags = open('secret.txt').read().split()` (line 22)
- **Type:** Simple file read operation (not SQL)

### Other Dangerous Functions Analysis

**Searched for but NOT FOUND:**
- ❌ `os.system()` - Not present
- ❌ `os.popen()` - Not present
- ❌ `os.exec*()` - Not present
- ❌ `eval()` - Not present
- ❌ `exec()` - Not present
- ❌ `pickle.loads()` with user data - Not present
- ❌ `compile()` - Not present
- ❌ YAML/XML parsing with user input - Not present

### Secondary Attack Surfaces (Non-Injection)

While no injection vulnerabilities exist, the following attack surfaces are present:

1. **XSS (Reflected):** `/page?name=` parameter (intentional CTF vulnerability)
   - **Source:** Line 65: `request.args.get('name','')`
   - **Sink:** Line 75: JavaScript string context without proper escaping
   - **Exploitability:** HIGH (newline injection bypass)

2. **Denial of Service:** Unlimited PhantomJS subprocess spawning
   - **Source:** Any request to `/page` endpoint
   - **Trigger:** Line 34: `subprocess.Popen(["timeout","5","phantomjs", "check.js"])`
   - **Exploitability:** HIGH (no rate limiting, ~50-100MB per process)

3. **Race Condition:** Temporary HTML file access
   - **Source:** Line 35-40: File creation in `/static/` directory
   - **Window:** 5 seconds (PhantomJS timeout duration)
   - **Exploitability:** LOW (32-char hex filename requires brute-force)

---

## 10. Summary of Attack Surface

### Network-Accessible Endpoints: 3 Total
1. `GET /` - Homepage (static, no user input)
2. `GET /page?name=` - XSS challenge (primary attack surface)
3. `GET /static/*` - Static file serving (Flask built-in protection)

### Input Vectors: 1 Primary
- `name` query parameter on `/page` endpoint

### Authentication/Authorization
- ❌ None (completely absent)

### Injection Vulnerabilities
- ❌ Command Injection: None
- ❌ SQL Injection: None (no database)
- ✅ XSS (Reflected): Present (intentional CTF challenge)

### Key Security Weaknesses
1. **Character blacklist bypass** enabling XSS
2. **No rate limiting** enabling DoS via subprocess spawning
3. **Secrets in version control** (.env file with FLAG)
4. **End-of-life software** (Python 2.7.18, PhantomJS 2.1.1)
5. **HTTP-only** (no HTTPS/TLS)
6. **X-XSS-Protection disabled**
7. **Root container execution** (no privilege dropping)

### Recommended Testing Priority
1. **HIGH:** XSS exploitation via newline injection on `/page?name=%0aalert(1)`
2. **MEDIUM:** DoS attack via concurrent requests spawning PhantomJS processes
3. **LOW:** Static file race condition exploitation
4. **INFORMATIONAL:** Secret extraction from Docker image layers

---

**End of Reconnaissance Deliverable**