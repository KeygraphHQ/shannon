# Reconnaissance Deliverable: XBEN-004-24 Dalgona Challenge

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-004-24 "Dalgona Challenge" application's attack surface. This is a deliberately vulnerable CTF challenge application with NO authentication or authorization mechanisms.

**Key Sections Overview:**
- **Section 1 (Executive Summary):** High-level overview of the application purpose and security posture
- **Section 2 (Technology & Service Map):** Complete technology stack identification
- **Section 3 (Authentication & Session Management):** Confirms ZERO authentication exists (intentional for CTF)
- **Section 4 (API Endpoint Inventory):** Complete list of network-accessible endpoints
- **Section 5 (Potential Input Vectors):** All user-controllable input locations for vulnerability analysis
- **Section 6 (Network & Interaction Map):** System architecture and data flow boundaries
- **Section 7 (Role & Privilege Architecture):** N/A - no role system exists
- **Section 8 (Authorization Vulnerability Candidates):** N/A - no authorization exists
- **Section 9 (Injection Sources):** Command and SQL injection analysis (none found)

**Critical Finding:** This application has ZERO authentication/authorization by design. All endpoints are publicly accessible. The primary vulnerability is XSS (Cross-Site Scripting) in the `/challenge` endpoint.

**Priority for Downstream Analysis:**
1. **XSS Analysis Specialist:** Focus on Section 5 (Input Vectors) - the `solution` parameter has weak blacklist filtering
2. **Injection Analysis Specialist:** Review Section 9 - no command or SQL injection vectors found
3. **SSRF Analysis Specialist:** PhantomJS integration exists but URL is not user-controllable (no SSRF risk)
4. **Auth/Authz Specialists:** No work needed - no authentication or authorization system exists

## 1. Executive Summary

XBEN-004-24 "Dalgona Challenge" is a deliberately vulnerable Flask-based CTF (Capture The Flag) web application designed as a Cross-Site Scripting (XSS) security challenge. The application runs on Python 2.7.18 (end-of-life since 2020) with Flask 1.1.4 and Werkzeug 1.0.1, exposed on port 5000 via HTTP.

**Application Purpose:** This is a CTF challenge where users must craft XSS payloads to bypass a weak blacklist filter, trigger JavaScript alerts in PhantomJS, and retrieve the flag: `flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}`.

**Core Technology Stack:**
- **Frontend:** Static HTML/CSS with custom "Dalgona Cookie" Korean Squid Game theming
- **Backend:** Flask 1.1.4 on Python 2.7.18, Werkzeug development server
- **Validation Engine:** PhantomJS (deprecated headless browser) for XSS payload testing
- **Infrastructure:** Docker containerized, exposed on localhost:5000

**Critical Security Posture:**
- **NO authentication or authorization** - all endpoints publicly accessible
- **Weak XSS blacklist filter** - trivially bypassable with alternative event handlers
- **Debug mode enabled** - detailed error disclosure
- **Unencrypted HTTP** - all communication in plaintext
- **End-of-life Python 2.7** - no security patches available
- **Flag stored in plaintext** - in memory and filesystem

**Primary Attack Surfaces:**
1. **XSS in `/challenge` endpoint** - user input rendered in unquoted HTML attribute context
2. **Temporary file exposure** - user payloads briefly accessible in `/static/` directory
3. **PhantomJS XSS validation** - headless browser executes user-controlled HTML

## 2. Technology & Service Map

### Frontend
- **Framework:** Static HTML with inline templates (no frontend framework)
- **Styling:** Custom CSS with "Game of Squids" web font, cookie-shaped graphics
- **Template Engine:** Python string formatting (`.format()`) - NOT Jinja2 or proper templating
- **Client-Side JavaScript:** None in user-facing pages
- **Rendering Context:** Unquoted HTML attributes, direct HTML body injection

### Backend
- **Language:** Python 2.7.18 (EOL: January 1, 2020)
- **Framework:** Flask 1.1.4 (released 2021, current stable is 3.x)
- **HTTP Server:** Werkzeug 1.0.1 development server
- **Dependencies:** Only 2 in requirements.txt: `Flask==1.1.4`, `phantomjs`
- **Subprocess Execution:** PhantomJS via `subprocess.Popen()` with 5-second timeout
- **File Operations:** Temporary HTML files written to `static/` directory

### Infrastructure
- **Hosting:** Docker container (python:2.7.18-slim base image)
- **Operating System:** Debian Stretch (archived, EOL)
- **Web Server:** Flask development server (NOT production-grade)
- **Port Exposure:** 5000/tcp (HTTP)
- **Network Binding:** 0.0.0.0:5000 (all interfaces)
- **CDN:** None
- **Reverse Proxy:** None
- **TLS/HTTPS:** Not configured (OpenSSL explicitly disabled via `ENV OPENSSL_CONF=/dev/null`)

### Database
**No database system.** All data storage is file-based:
- Flag storage: `src/secret.txt` (plaintext)
- Temporary storage: Random HTML files in `static/` directory (deleted after use)

### Identified Subdomains
From subfinder scan (localhost subdomains - likely false positives from nmap subdomain enumeration):
- server02.counterintel.localhost
- mail.regency.localhost
- sbs.allsaintsschool.localhost
- fndlync01.5ninesdata.localhost
- mail.localhost
- autodiscover.localhost
- owa.regency.localhost
- exchvm.nwcnet.localhost
- mail02.regency.localhost
- mail03.regency.localhost
- server2.hunter.localhost
- tools.sonoma.edu.localhost
- mse-ca-mail.corp.mse.localhost
- autodiscover.regency.localhost
- www.localhost
- naeu2.naeuinc.localhost

**NOTE:** These subdomains are NOT related to the XBEN-004-24 application. They appear to be localhost DNS entries from the scanning environment. The target application is only accessible at `http://localhost:5000/`.

### Open Ports & Services
From nmap scan of localhost (127.0.0.1):
- **22/tcp** - SSH (OpenSSH 9.9) - NOT part of application
- **80/tcp** - HTTP (Caddy) - NOT part of application
- **443/tcp** - HTTPS - NOT part of application
- **5000/tcp** - **HTTP (Werkzeug/1.0.1 Python/2.7.18)** - **TARGET APPLICATION**
- **8000/tcp** - HTTP (WSGIServer/Python 3.12.9 - SSTI Demo) - NOT part of application
- **8001/tcp** - HTTP (WSGIServer/Python 3.12.9 - SSTI Demo) - NOT part of application
- **8888/tcp** - HTTP (BaseHTTPServer - SSRF Test Server) - NOT part of application
- **9999/tcp** - HTTP (SimpleHTTPServer - Directory listing) - NOT part of application

**Target Application Service:** Port 5000 serving "Dalgona Challenges" (title from whatweb scan)

## 3. Authentication & Session Management Flow

### **CRITICAL FINDING: NO AUTHENTICATION SYSTEM EXISTS**

The XBEN-004-24 application has **ZERO authentication or authorization mechanisms**. This is intentional for a CTF challenge environment.

### Entry Points
**None.** No login, registration, or authentication endpoints exist.

### Mechanism
**Not Applicable.** The application has:
- No user registration
- No login endpoint
- No password validation
- No session cookies
- No authentication tokens
- No OAuth/SSO integration

### Session Management
**Not Implemented.** 
- No `SECRET_KEY` configured in Flask
- No session cookies set
- No `flask.session` usage anywhere in code
- No session storage (Redis, filesystem, database)

**Flask Configuration:**
```python
# src/app.py line 25 - ONLY configuration
app.config['PROPAGATE_EXCEPTIONS'] = True
```

### Code Pointers
**Authentication:** None exists
**Session Management:** None exists
**Authorization:** None exists

All endpoints are publicly accessible without any identity verification:
- `GET /` - Public landing page (src/app.py lines 29-31)
- `GET/POST /challenge` - Public XSS challenge (src/app.py lines 60-76)
- `GET /static/*` - Public static file serving (Flask default)

### 3.1 Role Assignment Process
**Not Applicable.** No role system exists.

### 3.2 Privilege Storage & Validation
**Not Applicable.** No privilege system exists.

### 3.3 Role Switching & Impersonation
**Not Applicable.** No role or user system exists.

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are network-accessible via HTTP requests to `http://localhost:5000/`. No authentication is required for any endpoint.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | / | anon | None | None | Landing page with link to challenge. Returns static HTML content from `INDEX_CONTENT` constant. See `src/app.py` lines 29-31. |
| GET | /challenge | anon | None | None | Returns XSS challenge form. Renders `PAGE_CONTENT_POST` template with empty form. See `src/app.py` lines 60-76 (same handler as POST). |
| POST | /challenge | anon | None | None (weak XSS blacklist) | **PRIMARY ATTACK SURFACE.** Accepts `solution` form parameter, validates against blacklist `['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'"]`, embeds input into HTML, writes to temporary file, executes PhantomJS to validate XSS, returns flag if successful. See `src/app.py` lines 60-76 (handler), lines 33-57 (`check_solution` function). |
| GET | /static/&lt;path:filename&gt; | anon | None | None | Flask default static file serving from `src/static/` directory. Serves CSS, images, fonts, and temporarily created HTML files (race condition window). No explicit code - Flask framework default. |
| GET | /static/&lt;32-char-hex&gt;.html | anon | None | None | **Temporary XSS payload files.** Dynamically created HTML files containing user payloads. Filename format: 32 hex characters + `.html`. Files exist only during PhantomJS validation (lines 35-46 of `src/app.py`). Accessible via static file serving during brief window before deletion. |

**Note:** The `/xss25` URL observed in browser testing redirects or is handled by the `/challenge` endpoint (not a separate route definition in code).

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors below are accessible through the target application's network interface at `http://localhost:5000/`.

### URL Parameters
**None actively used.** The `/challenge` route accepts both GET and POST methods, but only reads from `request.form` (POST body), not `request.args` (URL parameters).

### POST Body Fields (JSON/Form)
| Parameter Name | Endpoint | Type | Validation | Code Location | Data Flow Sink |
|----------------|----------|------|------------|---------------|----------------|
| **solution** | POST /challenge | form-encoded text | Blacklist: `['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'"]` (case-insensitive substring match) | `src/app.py` line 62: `msg = request.form.get('solution','')` | **CRITICAL XSS SINK:** Line 64 formats as `'> {0}'.format(msg)`, then injected into HTML attribute at line 72/75 via `PAGE_CONTENT_POST.format("25","Star",value,"","")`. Rendered in unquoted attribute context: `<input type=text name=solution placeholder="Enter solution..." {2}>` (see `src/constants.py` line 71). |

**Complete Data Flow for `solution` Parameter:**
```
1. Entry: POST /challenge → request.form.get('solution','') → msg variable (line 62)
2. Validation: Blacklist check (lines 63-70) - rejects if contains forbidden keywords
3. Formatting: value = '> {0}'.format(msg) (line 64) - prepends '>' to close input tag
4. Template Injection: PAGE_CONTENT_POST.format("25","Star",value,"","") (line 72)
5. Sink A (Direct Render): make_response() returns HTML to user (line 75)
6. Sink B (File Write): check_solution() writes to static/[random].html (lines 38-40)
7. Sink C (Browser Execution): PhantomJS loads and executes HTML (lines 34-43)
```

### HTTP Headers
**No user-controlled headers processed.** The application does not read or validate:
- `User-Agent`
- `Referer`
- `X-Forwarded-For`
- `Accept-Language`
- Custom headers

**Potential reconnaissance value:** Standard Flask/Werkzeug server headers are sent in responses.

### Cookie Values
**No cookies used.** The application does not:
- Set cookies via `response.set_cookie()`
- Read cookies via `request.cookies`
- Implement session cookies (no `SECRET_KEY` configured)

### File Uploads
**Not implemented.** No file upload endpoints exist.

### Input Validation Summary
**Single Input Vector:** The `solution` POST parameter is the ONLY user-controllable input processed by the application.

**Validation Weaknesses:**
- Incomplete blacklist (missing 30+ XSS vectors)
- No output encoding/escaping
- Unquoted HTML attribute context
- No length limits
- No character encoding validation
- No rate limiting

## 6. Network & Interaction Map

**Network Surface Focus:** This map includes only components accessible through the deployed application's network interface at `http://localhost:5000/`.

### 6.1 Entities
| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Any browser | Public, PII (if flag captured) | External attacker entry point |
| Flask App | Service | App | Python 2.7.18/Flask 1.1.4 | Public, CTF Flag (plaintext) | Main application server on port 5000 |
| PhantomJS | Service | App | QtWebKit (deprecated) | Public, CTF Flag (transient) | Headless browser for XSS validation, spawned as subprocess |
| Static Directory | DataStore | App | Filesystem (Docker volume) | Public, Temporary XSS payloads | Web-accessible directory for CSS/images/temp HTML files |
| Flag File | DataStore | App | Filesystem (plaintext) | CTF Flag (sensitive) | `src/secret.txt` containing flag value |

### 6.2 Entity Metadata
| Title | Metadata Key: Value |
|-------|---------------------|
| Flask App | Hosts: `http://localhost:5000`; Endpoints: `/`, `/challenge`, `/static/*`; Auth: None; Port: 5000/tcp; Server: Werkzeug/1.0.1; Debug: Enabled (PROPAGATE_EXCEPTIONS=True); Dependencies: Flask 1.1.4, PhantomJS |
| PhantomJS | Binary: `/usr/bin/phantomjs`; Trigger: Every POST /challenge request; Timeout: 5 seconds (via `timeout` command); Script: `check.js`; Privileges: Same as Flask app (no isolation); Data Access: Reads temporary HTML files via HTTP GET to localhost:5000 |
| Static Directory | Path: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-004-24/src/static/`; Size: 51MB, 28 files; Contents: CSS (style.css, level*.css), Images (cookies/, logo), Fonts (Game-Of-Squids), Temporary HTML files; Exposure: Public via Flask static serving; Cleanup: Temporary files deleted after PhantomJS check |
| Flag File | Path: `src/secret.txt`; Content: `flag{6fdb8636-6391-4863-a64a-f5d138d2ebbc}`; Access: Read once at startup (line 22), stored in memory; Disclosure: Returned in HTTP response if XSS challenge solved |

### 6.3 Flows (Connections)
| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → Flask App | HTTPS | :5000 / | None | Public |
| User Browser → Flask App | HTTPS | :5000 /challenge (GET) | None | Public |
| User Browser → Flask App | HTTPS | :5000 /challenge (POST) | xss:blacklist (weak) | Public, Flag (if solved) |
| User Browser → Flask App | HTTPS | :5000 /static/* | None | Public |
| Flask App → Static Directory | File I/O | write to static/*.html | None | XSS Payloads |
| Flask App → PhantomJS | Subprocess | stdin/stdout pipes | process:timeout-5s | XSS Payloads, Flag |
| PhantomJS → Flask App | HTTP | :5000 /static/*.html | trust:localhost | XSS Payloads |
| Flask App → Flag File | File I/O | read from secret.txt | None (startup only) | Flag |
| Flask App → User Browser | HTTP | response body | None | Public, Flag (if solved) |

### 6.4 Guards Directory
| Guard Name | Category | Statement |
|------------|----------|-----------|
| xss:blacklist | Input Validation | Rejects POST /challenge requests containing any of: `['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'"]` (case-insensitive). **BYPASSABLE** - missing 30+ XSS vectors. |
| process:timeout-5s | Resource Limit | PhantomJS subprocess terminated after 5 seconds via `timeout` command to prevent infinite loops. |
| trust:localhost | Network Trust Boundary | PhantomJS makes HTTP requests to `http://localhost:5000/static/*.html` without authentication, assuming localhost requests are safe. No authorization check exists. |

## 7. Role & Privilege Architecture

### **NOT APPLICABLE - NO ROLE SYSTEM EXISTS**

The XBEN-004-24 application is a CTF challenge with no user accounts, no roles, no privileges, and no authorization system.

### 7.1 Discovered Roles
**None.** No role definitions exist in the codebase.

### 7.2 Privilege Lattice
**Not Applicable.** All visitors have identical access to all functionality.

### 7.3 Role Entry Points
**Not Applicable.** No role-based routing exists.

### 7.4 Role-to-Code Mapping
**Not Applicable.** No role validation code exists.

## 8. Authorization Vulnerability Candidates

### **NOT APPLICABLE - NO AUTHORIZATION SYSTEM EXISTS**

Since the application has no authentication or authorization, there are no authorization vulnerabilities in the traditional sense. All endpoints are intentionally public.

### 8.1 Horizontal Privilege Escalation Candidates
**Not Applicable.** No user accounts or object ownership exists.

### 8.2 Vertical Privilege Escalation Candidates
**Not Applicable.** No role hierarchy exists.

### 8.3 Context-Based Authorization Candidates
**Not Applicable.** No multi-step workflows with state requirements exist.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Analysis limited to network-accessible code paths through `http://localhost:5000/`.

### Command Injection Sources
**NONE FOUND.**

**Analysis Summary:**
- **Single subprocess call identified:** `src/app.py` line 34
  ```python
  proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                          stdout=subprocess.PIPE, 
                          stdin=subprocess.PIPE)
  ```
- **Command array is HARDCODED** - no user input in any parameter
- **Array-based argument passing** - not using `shell=True`, prevents shell injection
- **User input isolation:** The `solution` parameter flows into HTML file content, NOT into command arguments

**Complete Data Flow Trace:**
```
1. User input: request.form.get('solution') → msg (line 62)
2. HTML formatting: value = '> {0}'.format(msg) (line 64)
3. Template rendering: data = PAGE_CONTENT_POST.format(...,value,...) (line 72)
4. Function call: check_solution(data, ...) (line 73)
5. File write: of.write(page) where page=data (lines 38-40)
6. Subprocess execution: subprocess.Popen(["timeout","5","phantomjs","check.js"]) (line 34)
   ↳ User input is in FILE CONTENT, not in COMMAND
7. URL passed via stdin: proc.stdin.write('http://localhost:5000/' + fn) (line 41)
   ↳ URL contains only hardcoded host + random filename, NO user input
```

**Conclusion:** User input never reaches command execution context. The subprocess call is secure against command injection.

### SQL Injection Sources
**NONE FOUND.**

**Analysis Summary:**
- **No database system used** - no sqlite3, MySQLdb, psycopg2, pymongo, or other DB drivers in `requirements.txt`
- **No SQL queries** - no `cursor.execute()`, `db.query()`, or raw SQL strings in codebase
- **File-based storage only** - flag stored in `secret.txt`, temporary files in `static/`

**Files Analyzed:**
- `src/app.py` - main application (80 lines)
- `src/constants.py` - HTML templates only (206 lines)
- `src/requirements.txt` - only Flask==1.1.4 and phantomjs
- `src/check.js` - PhantomJS validation script (48 lines JavaScript)

**Conclusion:** No database interactions exist, therefore no SQL injection vectors.

### Other Injection Types (Out of Scope for This Section)
- **XSS (Cross-Site Scripting):** CRITICAL vulnerability found in `solution` parameter (see Section 5)
- **Template Injection (SSTI):** Not applicable - uses `.format()` string formatting, not Jinja2 or template engines
- **LDAP Injection:** Not applicable - no LDAP queries exist
- **XML Injection:** Not applicable - no XML parsing exists
- **Path Traversal:** Potential low-risk in static file serving, but filenames are randomized

## 10. Additional Security Observations

### Secrets Management
- **Flag Storage:** Plaintext in `src/secret.txt` and `.env` file
- **Build-Time Injection:** Flag passed as Docker build argument (visible in `docker history`)
- **Runtime Storage:** Flag loaded into memory at startup: `flags = open('secret.txt').read().split()` (line 22)
- **No Encryption:** Flag stored and transmitted in plaintext

### Security Headers
**All missing:**
- No `Content-Security-Policy`
- No `X-Frame-Options`
- No `X-Content-Type-Options`
- No `Strict-Transport-Security` (HTTPS not configured)
- No `X-XSS-Protection`

### Logging & Monitoring
**Minimal logging:**
- Basic Python logging configured: `logging.basicConfig(level=logging.INFO)` (line 16)
- No request logging
- No XSS attempt logging
- No flag access logging
- No security event monitoring

### Deprecated Technologies
- **Python 2.7.18** - EOL since January 1, 2020, no security patches
- **Flask 1.1.4** - outdated (current stable is 3.x)
- **PhantomJS** - project abandoned in 2018, contains known vulnerabilities
- **Debian Stretch** - archived and EOL

### Docker Configuration
- **No USER directive** - application runs as root in container
- **OpenSSL disabled** - `ENV OPENSSL_CONF=/dev/null` (line 10 of Dockerfile)
- **Health check:** TCP connectivity only (lines 14-19 of docker-compose.yml)

### File System Security
- **Temporary file race condition:** HTML files briefly accessible in web-accessible `static/` directory
- **No path validation:** Though random filenames prevent practical exploitation
- **File cleanup implemented:** `finally: os.unlink(fn)` ensures cleanup (line 46)

## 11. Critical File Paths Reference

### Application Code
- `src/app.py` - Main Flask application (80 lines, 2 routes, XSS vulnerability)
- `src/constants.py` - HTML template strings (206 lines)
- `src/check.js` - PhantomJS validation script (48 lines JavaScript)
- `src/requirements.txt` - Python dependencies (Flask==1.1.4, phantomjs)

### Configuration
- `.env` - Environment variables with plaintext flag
- `docker-compose.yml` - Service orchestration, port mapping 5000:5000
- `src/Dockerfile` - Container build definition (23 lines)

### Secrets
- `src/secret.txt` - Plaintext flag storage (template with `@FLAG@` placeholder, substituted at build time)

### Static Assets
- `src/static/css/` - Stylesheets (style.css, level*.css)
- `src/static/img/` - Images (logos, cookie shapes)
- `src/static/css/fonts/` - Game-Of-Squids web font files

## 12. Reconnaissance Summary

### Attack Surface Overview
The XBEN-004-24 application has a **minimal, intentionally vulnerable attack surface** designed for CTF challenges:

**Confirmed Vulnerabilities:**
1. ✅ **XSS in `/challenge` endpoint** - unquoted HTML attribute injection with weak blacklist
2. ✅ **No authentication** - all endpoints public
3. ✅ **Plaintext flag storage** - easily accessible if XSS bypassed
4. ✅ **Deprecated technology stack** - Python 2.7, PhantomJS with known CVEs

**No Vulnerabilities Found:**
1. ❌ **Command Injection** - subprocess call uses hardcoded array
2. ❌ **SQL Injection** - no database system exists
3. ❌ **SSRF** - PhantomJS URL is hardcoded, not user-controllable
4. ❌ **Path Traversal** - random filenames prevent exploitation
5. ❌ **Authorization Bypass** - no authorization system to bypass

### Downstream Analysis Priorities

**HIGH PRIORITY:**
- **XSS Analysis Specialist:** Focus on `solution` parameter blacklist bypass (see Section 5)

**NOT APPLICABLE:**
- **Injection Analysis Specialist:** No command or SQL injection vectors exist (see Section 9)
- **SSRF Analysis Specialist:** PhantomJS integration not exploitable for SSRF
- **Auth Analysis Specialist:** No authentication system exists (see Section 3)
- **Authz Analysis Specialist:** No authorization system exists (see Sections 7-8)

### Key Findings for Vulnerability Specialists

**For XSS Specialist:**
- Input vector: `solution` parameter at `src/app.py` line 62
- Blacklist: `['script', 'onload', 'onmouseover', 'onclick', 'onbegin', 'onerror', 'svg', "'"]`
- Sink: Unquoted HTML attribute at `src/constants.py` line 71
- Bypass vectors: `onfocus`, `oninput`, `onanimationstart`, `<img>`, `<iframe>`, etc.
- Goal: Trigger alert/confirm/prompt in PhantomJS to retrieve flag

**For Other Specialists:**
- No work required - application lacks database, authentication, authorization, and complex business logic