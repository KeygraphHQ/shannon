# Reconnaissance Deliverable: XBEN-046-24

## 0) HOW TO READ THIS

This reconnaissance report provides a comprehensive map of the XBEN-046-24 application's attack surface, a deliberately vulnerable XSS challenge CTF application with NO authentication or authorization mechanisms.

**Key Sections for Vulnerability Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains the two network-accessible endpoints - focus on the `/page` endpoint which accepts user input.
- **Section 5 (Input Vectors):** Documents the single user-controllable input vector (`name` query parameter) that is the primary attack surface.
- **Section 7 (Role & Privilege Architecture):** Confirms NO roles exist - all endpoints are publicly accessible.
- **Section 9 (Injection Sources):** Documents that NO command injection or SQL injection sources exist in network-accessible code.

**Application Architecture:** This is a stateless Flask application with no authentication, no database, and no session management. The entire attack surface consists of XSS filter bypass opportunities.

**Priority Order for Testing:** Focus on XSS exploitation via the `/page?name=` parameter using unfiltered HTML tags with event handlers.

---

## 1. Executive Summary

The XBEN-046-24 application is a deliberately vulnerable XSS (Cross-Site Scripting) challenge CTF built on Flask 1.1.4 with Python 2.7.18 - both end-of-life technologies with no security updates. The application exposes exactly **2 network-accessible HTTP endpoints** (`/` and `/page`) with **zero authentication or authorization mechanisms**. The attack surface is intentionally minimal and focused: a single user input parameter (`name`) undergoes weak blacklist-based regex filtering before being reflected in HTML responses.

**Core Technology Stack:**
- **Backend:** Python 2.7.18 (EOL since January 2020), Flask 1.1.4 (2021 release, 3+ major versions outdated)
- **Frontend:** Static HTML with inline CSS, no JavaScript frameworks
- **Validation Engine:** PhantomJS (archived March 2018, no security updates for 6+ years)
- **Infrastructure:** Docker container (Debian Buster archive), Caddy web server on host
- **Database:** None - completely stateless application
- **Session Management:** None - no cookies, no state persistence

**Primary Attack Surface:** The `/page` endpoint accepts a `name` query parameter that is filtered through 7 regex patterns (removing `<script>`, `<img>`, `<input>`, `<a>`, `<div>`, `<iframe>` tags and `/`, `?` characters) before being injected into HTML templates without output encoding. This intentional XSS vulnerability can be exploited using unfiltered HTML tags like `<svg>`, `<body>`, `<style>`, `<marquee>`, or `<details>` with JavaScript event handlers to trigger `alert("XSS")` and receive the CTF flag.

**Security Posture:** The application has **NO security controls** - no authentication, no CSRF protection, no security headers (CSP, X-Frame-Options, HSTS), no rate limiting, no input length limits, and debug mode enabled. All functionality is publicly accessible to any network client without credentials.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** None (static HTML templates embedded in Python constants)
- **UI Libraries:** None - vanilla HTML with custom CSS
- **Rendering:** Server-side HTML generation via Python `.format()` string interpolation
- **Client-Side JavaScript:** None in the application itself
- **CSS Framework:** Custom CSS (`style.css` + 8 challenge-specific stylesheets)
- **Fonts:** Game-Of-Squids custom typeface (eot, otf, woff, woff2)

### Backend
- **Language:** Python 2.7.18 (EOL January 1, 2020 - no security updates for 5+ years)
- **Framework:** Flask 1.1.4 (March 2021 release, current stable is 3.x)
- **Web Server (Dev):** Werkzeug 1.0.1 (Flask development server)
- **Key Dependencies:**
  - Flask==1.1.4 (vulnerable to CVE-2023-30861: HTTP denial of service)
  - phantomjs (archived 2018, zero security maintenance)
- **Subprocess Executor:** PhantomJS headless browser via subprocess.Popen()

### Infrastructure
- **Hosting Provider:** Local Docker container deployment
- **CDN:** None
- **Reverse Proxy:** Caddy httpd (detected on host port 80/443)
- **Container Platform:** Docker with docker-compose orchestration
- **Base Image:** python:2.7.18-slim (Debian Buster archives)
- **Database Type:** None - no database functionality
- **Caching Layer:** None
- **Message Queue:** None

### Identified Subdomains
From subfinder scan (pre-recon deliverable):
- mail03.regency.localhost
- exchvm.nwcnet.localhost
- www.localhost
- mse-ca-mail.corp.mse.localhost
- owa.regency.localhost
- tools.sonoma.edu.localhost
- naeu2.naeuinc.localhost
- server02.counterintel.localhost
- autodiscover.localhost
- autodiscover.regency.localhost
- server2.hunter.localhost
- fndlync01.5ninesdata.localhost
- mail.localhost
- mail02.regency.localhost
- mail.regency.localhost
- sbs.allsaintsschool.localhost

**Note:** These subdomains appear to be false positives from subfinder's localhost resolution and are NOT part of the XBEN-046-24 application attack surface.

### Open Ports & Services
From nmap scan on target host (localhost:38921):

| Port | Service | Version | Purpose | Application Relevance |
|------|---------|---------|---------|---------------------|
| 80/tcp | http | Caddy httpd | Reverse proxy/web server | Likely proxies to XBEN-046-24 |
| 443/tcp | ssl/https | - | HTTPS endpoint | Encrypted access (if configured) |
| 631/tcp | ipp | CUPS 2.3 | Print server | OUT OF SCOPE (host service) |
| 8081/tcp | http | Apache httpd 2.4.56 (Debian) | "Submit a username" service | UNKNOWN - separate application |
| 9999/tcp | http | Unknown (CORS enabled) | Simple HTTP service | OUT OF SCOPE |
| 49152/tcp | http | Golang net/http server | Tailscale (auth required) | OUT OF SCOPE (VPN service) |

**Target Application Port:** The XBEN-046-24 Flask application runs on port 5000 internally (Docker), proxied through Caddy on port 80/443, and accessed via localhost:38921 in the test environment.

---

## 3. Authentication & Session Management Flow

### 3.1 Authentication Status: NOT IMPLEMENTED

**CRITICAL FINDING:** This application has **ZERO authentication mechanisms**.

**Evidence:**
- No login endpoints (`/login`, `/signin`, `/auth`, etc.)
- No registration endpoints (`/register`, `/signup`, etc.)
- No password reset functionality
- No authentication libraries imported (no flask_login, flask_security, werkzeug.security)
- No JWT, OAuth, OIDC, or SAML implementations
- No session management (Flask `session` object never imported or used)
- No API key validation (no `Authorization` header checks)

**Entry Points:** All endpoints are publicly accessible without credentials:
- `/` - Homepage (GET) - No authentication required
- `/page` - XSS challenge (GET) - No authentication required
- `/static/<path>` - Static file serving - No authentication required

**Mechanism:** N/A - No authentication mechanism exists

**Code Pointers:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py` lines 29-31 (`/` route)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py` lines 64-78 (`/page` route)
- No authentication decorators or middleware anywhere in codebase

### 3.2 Role Assignment Process

**Role Determination:** NOT APPLICABLE - No user system exists

**Default Role:** NOT APPLICABLE - No roles defined

**Role Upgrade Path:** NOT APPLICABLE - No privilege levels exist

**Code Implementation:** No role assignment logic exists

### 3.3 Privilege Storage & Validation

**Storage Location:** NOT APPLICABLE - No user or privilege data stored

**Validation Points:** None - All endpoints equally accessible to anonymous users

**Cache/Session Persistence:** NOT APPLICABLE - Application is completely stateless

**Code Pointers:** No privilege validation code exists

### 3.4 Role Switching & Impersonation

**Impersonation Features:** NOT IMPLEMENTED

**Role Switching:** NOT IMPLEMENTED

**Audit Trail:** NOT IMPLEMENTED - No logging of user actions

**Code Implementation:** No impersonation functionality exists

---

## 4. API Endpoint Inventory

All network-accessible endpoints in the XBEN-046-24 application:

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|--------------|---------------|---------------------|------------------------|---------------------------|
| GET | `/` | anon | None | None | Homepage/landing page. Returns static HTML with link to challenge. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:29-31` |
| GET | `/page` | anon | None | None | XSS challenge endpoint. Accepts `name` query parameter, applies weak regex filters, reflects input in HTML, validates XSS via PhantomJS, returns flag on success. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:64-78` |
| GET | `/static/<path>` | anon | None | None | Static file serving (Flask built-in). Serves CSS, images, fonts, and temporary HTML files. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/static/` directory |

**Total Network-Accessible Endpoints:** 3 (2 explicit + 1 implicit static serving)

**Authentication Required:** None on any endpoint

**Authorization Checks:** None implemented

**CSRF Protection:** None implemented

**Rate Limiting:** None implemented

---

## 5. Potential Input Vectors for Vulnerability Analysis

All locations where the network-accessible application accepts user-controlled input:

### URL Parameters

**Endpoint:** `/page`  
**Parameter:** `name`  
**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:66`  
**Code:** `msg = request.args.get('name','')`  
**Type:** String  
**Required:** No (defaults to empty string)  
**Max Length:** Unlimited (no validation)  
**Validation Applied:**
- Line 67: Removes `<script>` tags (regex: `r'<script[^>]*>.*?</script>|<script[^>]*>'`)
- Line 68: Removes `<img>` tags (regex: `r'<img[^>]*>.*?</img>|<img[^>]*>'`)
- Line 69: Removes `<input>` tags (regex: `r'<input[^>]*>.*?</input>|<input[^>]*>'`)
- Line 70: Removes `<a>` tags (regex: `r'<a[^>]*>.*?</a>|<a[^>]*>'`)
- Line 71: Removes `<div>` tags (regex: `r'<div[^>]*>.*?</div>|<div[^>]*>'`)
- Line 72: Removes `<iframe>` tags (regex: `r'<iframe[^>]*>.*?</iframe>|<iframe[^>]*>'`)
- Line 73: Removes `/` and `?` characters (regex: `r'[\/?]'`)
**Sink:** HTML output at line 78 (NO output encoding applied)
**Attack Vector:** XSS via unfiltered HTML tags (`<svg>`, `<body>`, `<style>`, etc.) with event handlers

### POST Body Fields (JSON/Form)

**NONE** - The application does not accept POST requests with body data. Both explicit routes (`/` and `/page`) default to GET method only.

### HTTP Headers

**NONE** - The application does not read or process any custom HTTP headers. Standard Flask headers (Host, User-Agent, etc.) are processed by the framework but not accessed by application code.

**No headers accessed:**
- No `X-Forwarded-For` checks
- No `Authorization` header parsing
- No `X-API-Key` validation
- No custom header reading

### Cookie Values

**NONE** - The application does not read or set cookies.

**Evidence:**
- Flask `session` object never imported
- No `request.cookies` access in code
- No `set_cookie()` calls
- No session cookie configuration

### File Uploads

**NONE** - No file upload functionality exists.

**Evidence:**
- No `request.files` access
- No file upload form fields
- No multipart/form-data handling

### Static File Paths

**Endpoint:** `/static/<path>`  
**Parameter:** `<path>` (file path)  
**Source:** Flask's built-in static file serving  
**Validation:** Flask's secure path normalization (blocks `../ traversal`)  
**Attack Vector:** Potential path traversal (though Flask has built-in protections)  
**Test Recommendations:** Try encoded path traversal: `%2e%2e%2f`, Unicode variations, double encoding

---

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| XBEN-046-24-Flask | Service | App | Python 2.7/Flask 1.1.4 | Secrets (flag) | Main XSS challenge application, stateless |
| PhantomJS-Validator | Service | App | PhantomJS (deprecated) | Public | XSS validation subprocess, spawned per request |
| Caddy-Proxy | Service | Edge | Caddy httpd | Public | Reverse proxy on host (ports 80/443) |
| Docker-Host | Service | Edge | Docker Engine | Public | Container orchestration platform |
| Static-Assets | DataStore | App | Filesystem | Public | CSS, images, fonts, temporary HTML files |
| Flag-Storage | DataStore | Data | Plaintext file | Secrets | `/secret.txt` containing CTF flag |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| XBEN-046-24-Flask | Hosts: `http://localhost:5000` (internal), `http://localhost:38921` (proxied); Endpoints: `/`, `/page`, `/static/*`; Auth: None; Dependencies: PhantomJS-Validator, Static-Assets, Flag-Storage; Port: 5000; Debug Mode: Enabled |
| PhantomJS-Validator | Executable: `/usr/bin/phantomjs`; Script: `check.js`; Timeout: 5 seconds; Purpose: XSS detection via alert() interception; Spawned by: XBEN-046-24-Flask; Trigger: Per request to `/page` |
| Caddy-Proxy | Listen: `:80, :443`; Backend: Unknown (likely proxies to port 38921); TLS: Configured on :443; Version: Unknown |
| Docker-Host | Platform: Docker Compose; Base Image: `python:2.7.18-slim`; Exposed Ports: 5000; Health Check: TCP connection test every 10s; Network Mode: Bridge |
| Static-Assets | Path: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/static/`; Size: ~51MB; Types: CSS (9 files), Images (15 files, 1.7MB dalgonabg.jpg), Fonts (4 formats); Web-Accessible: Yes via `/static/<path>` |
| Flag-Storage | Path: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/secret.txt`; Format: Plaintext; Flag: `flag{ad00f199-e499-4836-b75a-7e2b7842aa59}`; Access: Read at startup (line 22 of app.py), stored in-memory; Encryption: None |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → Caddy-Proxy | HTTPS | `:443` | None | Public |
| Caddy-Proxy → Docker-Host | HTTP | `:38921` | None | Public |
| Docker-Host → XBEN-046-24-Flask | HTTP | `:5000` | None | Public, Secrets (flag in response) |
| XBEN-046-24-Flask → PhantomJS-Validator | Subprocess | stdin/stdout | None | Public (user input in HTML) |
| XBEN-046-24-Flask → Static-Assets | File I/O | `/static/<random>.html` | None | Public (temp files created/deleted) |
| XBEN-046-24-Flask → Flag-Storage | File Read | `secret.txt` | None | Secrets (flag loaded at startup) |
| PhantomJS-Validator → XBEN-046-24-Flask | HTTP | `localhost:5000/static/<file>` | None | Public (loads temp HTML) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|-----------|----------|-----------|
| anon | Auth | No authentication required. All endpoints publicly accessible. |
| None | Authorization | No authorization checks implemented anywhere in the application. |
| regex-filter | Input Validation | Weak blacklist-based regex filtering removes 6 specific HTML tags and 2 characters. Trivially bypassed using unfiltered tags. |
| flask-static-guard | Network | Flask's built-in path normalization prevents basic `../` directory traversal in static file serving. |
| phantomjs-timeout | RateLimit | PhantomJS subprocess has 5-second timeout enforced by `timeout` command. Prevents infinite hangs but allows unlimited concurrent spawns. |

**Authorization Architecture Note:** This application has NO authorization guards. The above guards represent the minimal implicit protections from the framework and subprocess execution, not intentional security controls.

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**CRITICAL FINDING:** NO ROLES EXIST

This application has no user system, no role definitions, no privilege levels, and no access control mechanisms.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|-------------------|
| anon (implicit) | 0 | Global | No authentication system; all users are anonymous with identical access |

**Evidence:**
- No role constants or enums in codebase
- No database tables for users or roles
- No JWT claims with role data
- No session storage with privilege information
- All endpoints equally accessible without credentials

### 7.2 Privilege Lattice

```
Privilege Ordering:
anon (all users) → Full access to all endpoints

No privilege hierarchy exists.
No role inheritance.
No role dominance relationships.
```

**Note:** Since no authentication exists, there are no role switching mechanisms, impersonation features, or privilege escalation paths.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|---------------------|
| anon | `/` | `/`, `/page`, `/static/*` | None (publicly accessible) |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|------------------|------------------|
| anon | None | None | N/A (no user data) |

**No authorization middleware, decorators, or inline permission checks exist anywhere in the codebase.**

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**FINDING: NOT APPLICABLE**

No horizontal privilege escalation opportunities exist because:
- No user system (no users to escalate between)
- No object ownership (no user-specific resources)
- No object ID parameters in any endpoint
- No per-user data isolation

### 8.2 Vertical Privilege Escalation Candidates

**FINDING: NOT APPLICABLE**

No vertical privilege escalation opportunities exist because:
- No privilege levels (no "user" vs "admin" distinction)
- No role hierarchy to escalate through
- All functionality equally accessible to all network clients

### 8.3 Context-Based Authorization Candidates

**FINDING: NOT APPLICABLE**

No context-based authorization exists because:
- No multi-step workflows requiring state validation
- No workflow enforcement (application is stateless)
- No prerequisite checks for endpoint access

**Note:** While the `/page` endpoint has a validation workflow (user input → PhantomJS check → flag disclosure), this is a functional workflow, not an authorization boundary. The flag disclosure is based on XSS success (functional validation), not user privilege level.

---

## 9. Injection Sources (Command Injection and SQL Injection)

### 9.1 Command Injection Sources

**FINDING: ZERO EXPLOITABLE COMMAND INJECTION SOURCES**

**Subprocess Execution Found:**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:34`

```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Data Flow Trace:**
1. **Input Origin:** Query parameter `name` from `/page` endpoint (line 66)
2. **Filtering:** 7 regex filters applied (lines 67-73)
3. **HTML Generation:** User input embedded in HTML template (line 76)
4. **File Creation:** HTML written to `/static/<random>.html` (lines 38-40)
5. **URL Construction:** `url = 'http://localhost:5000/' + fn` (line 36) - HARDCODED host/port
6. **Subprocess Call:** Command array is STATIC - `["timeout","5","phantomjs", "check.js"]`
7. **User Data Transmission:** URL passed via stdin (line 43: `proc.stdin.write(url)`)

**Why NOT Vulnerable:**
- ✅ Command arguments are **completely hardcoded** (no user input interpolation)
- ✅ `shell=False` (default) prevents shell interpretation
- ✅ User input only affects HTML **content** of temporary file, not command execution
- ✅ URL structure is server-controlled with cryptographic random filename
- ✅ No `os.system()`, `os.popen()`, `eval()`, or `exec()` calls with user input

**Exploitability:** **NONE** - No command injection attack surface exists

### 9.2 SQL Injection Sources

**FINDING: ZERO SQL INJECTION SOURCES**

**Evidence:**
- ❌ No database libraries imported (sqlite3, psycopg2, MySQLdb, pymongo, SQLAlchemy)
- ❌ No database connection strings
- ❌ No SQL query construction
- ❌ No `.execute()`, `.executemany()`, or ORM query methods
- ❌ No database configuration files

**Data Storage:** Single plaintext file (`secret.txt`) read at startup, no database functionality

**Exploitability:** **NONE** - No database interaction exists

### 9.3 Additional Code Execution Patterns

**Patterns Searched (None Found):**
- `eval()` - NOT FOUND
- `exec()` - NOT FOUND
- `compile()` - NOT FOUND
- `os.system()` - NOT FOUND
- `os.popen()` - NOT FOUND
- `os.exec*()` - NOT FOUND
- `subprocess.call()` with user input - NOT FOUND
- `shell=True` parameter - NOT FOUND

**Conclusion:** Application uses secure subprocess execution practices. While XSS vulnerabilities exist (intentionally), no command injection or SQL injection attack vectors are present in network-accessible code.

---

## 10. Cross-Site Scripting (XSS) Attack Surface

### 10.1 XSS Sinks

**PRIMARY XSS SINK (CRITICAL VULNERABILITY):**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:78`

**Code:**
```python
value = "" if msg == "" else '{0}'.format(msg)  # Line 74
return XSS_CONTENT_TAG.format("14", "Triangle", value, result, "")  # Line 78
```

**Template Injection Point:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/constants.py:95`

```html
<input type=text name=name placeholder="Enter your name...">
{2}  <!-- USER INPUT INSERTED HERE WITHOUT ENCODING -->
```

**Data Flow:**
1. User submits: `GET /page?name=<svg onload=alert('XSS')>`
2. Input extracted: `msg = request.args.get('name','')` (line 66)
3. Regex filters applied: Lines 67-73 (all bypass - `<svg>` not blocked)
4. String formatting: `value = '<svg onload=alert('XSS')>'` (line 74)
5. Template injection: User input embedded in HTML (line 76, 78)
6. **NO output encoding applied**
7. HTML returned to browser with active XSS payload

**Render Context:** HTML Body (after form input element)

**Sanitization Applied:**
- Blacklist filters: `<script>`, `<img>`, `<input>`, `<a>`, `<div>`, `<iframe>`, `/`, `?`
- **NOT filtered:** `<svg>`, `<body>`, `<style>`, `<marquee>`, `<details>`, `<video>`, `<audio>`, `<object>`, `<embed>`, and 100+ other HTML elements
- **NOT filtered:** Event handlers (`onload`, `onerror`, `onfocus`, `onmouseover`, etc.)

**Exploitability:** **TRIVIAL - INTENTIONAL VULNERABILITY**

**Working Payloads:**
```
<svg onload=alert('XSS')>
<body onload=alert('XSS')>
<marquee onstart=alert('XSS')>
<details open ontoggle=alert('XSS')>
<style onload=alert('XSS')>  (Firefox)
```

**Win Condition:** Payload must trigger `alert("XSS")` (exact string) to receive flag

### 10.2 XSS Validation Workflow

**PhantomJS Check Process:**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:33-61`

1. Create temporary HTML file with user input (line 38-40)
2. Spawn PhantomJS subprocess (line 34)
3. Pass file URL via stdin (line 43)
4. PhantomJS loads HTML in headless WebKit browser
5. JavaScript executes (XSS triggers)
6. PhantomJS intercepts alert() calls (`check.js` lines 8-10)
7. Return alert message to Flask (line 45)
8. If message == "XSS", return flag (line 55-56)

**Flag Disclosure Logic:**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:55-56`

```python
if result == 'XSS':
    data = '<div class="solution-text">...<br>Congratulations!<p> Here is the flag: {1}</div>'.format(IMAGE_ROUTES[tag]['success'],flag)
```

**Flag Value:** `flag{ad00f199-e499-4836-b75a-7e2b7842aa59}` (from `/secret.txt`)

### 10.3 Secondary XSS Sink (Low Risk)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:58`

```python
data = '<div class="solution-text">...<br>Oops! You did an alert with {1} instead of "XSS"</div>'.format(IMAGE_ROUTES[tag]['process'], cgi.escape(result))
```

**Context:** HTML Body (error message display)

**Sanitization:** `cgi.escape(result)` - converts `<`, `>`, `&` to HTML entities

**Exploitability:** **DIFFICULT** - Adequate encoding for body context (though quotes not escaped)

---

## 11. Server-Side Request Forgery (SSRF) Attack Surface

**FINDING: ZERO SSRF ATTACK SURFACE**

**Analysis:**

**PhantomJS URL Loading:**
- Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:36`
- Code: `url = 'http://localhost:5000/' + fn`
- **Host:** Hardcoded `localhost`
- **Port:** Hardcoded `5000`
- **Path:** Random filename (server-controlled)
- **User Input:** Only in HTML **content** of file, not URL structure

**HTTP Client Libraries:**
- `urllib` imported (line 9) but **NEVER USED**
- No `requests` library
- No `http.client` calls
- No outbound HTTP requests based on user input

**Conclusion:** No SSRF vulnerabilities exist. User cannot control request destinations.

---

## 12. Security Misconfigurations

### 12.1 Debug Mode Enabled

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:82`

```python
if __name__ == '__main__':
    app.run(debug=True)
```

**Risk:** Werkzeug debugger exposed (allows code execution if PIN obtained)

### 12.2 Exception Propagation Enabled

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:25`

```python
app.config['PROPAGATE_EXCEPTIONS'] = True
```

**Risk:** Detailed exception information in responses (information disclosure)

### 12.3 Missing Security Headers

**All responses lack:**
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Strict-Transport-Security
- Referrer-Policy

### 12.4 No Rate Limiting

**Risk:** Unlimited PhantomJS subprocess spawning (DoS via resource exhaustion)

### 12.5 Temporary Files in Web-Accessible Directory

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py:38`

```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'
```

**Risk:** Race condition - files exist for 0-5 seconds before deletion (low exploitability due to random names)

---

## 13. Attack Surface Summary

### Primary Attack Vectors

1. **Cross-Site Scripting (XSS)** - `/page?name=` parameter
   - **Severity:** CRITICAL (intentional)
   - **Exploitability:** Trivial
   - **Impact:** Flag disclosure
   - **Method:** Unfiltered HTML tags with event handlers

2. **Information Disclosure** - Debug mode, exception propagation
   - **Severity:** MEDIUM
   - **Exploitability:** Easy
   - **Impact:** Code/config exposure

3. **Denial of Service** - Unlimited subprocess spawning
   - **Severity:** MEDIUM
   - **Exploitability:** Easy
   - **Impact:** Resource exhaustion

### Non-Existent Attack Vectors

- ❌ Authentication bypass (no authentication exists)
- ❌ Authorization bypass (no authorization exists)
- ❌ Session hijacking (no sessions exist)
- ❌ CSRF (no state-changing operations with sessions)
- ❌ SQL injection (no database exists)
- ❌ Command injection (secure subprocess usage)
- ❌ SSRF (no user-controlled outbound requests)
- ❌ Privilege escalation (no privilege levels exist)

---

## 14. Technology Stack Vulnerabilities

### End-of-Life Software

1. **Python 2.7.18** - EOL January 1, 2020 (5+ years without security updates)
2. **PhantomJS** - Archived March 2018 (6+ years without maintenance)
3. **Flask 1.1.4** - Missing 3+ major versions of security updates (current: 3.x)
4. **Werkzeug 1.0.1** - Outdated dependency (vulnerable to CVE-2023-30861)

### Known CVEs

- **Flask/Werkzeug CVE-2023-30861:** HTTP denial of service when parsing multipart form data (though this app doesn't use multipart forms)

---

## 15. Conclusion

The XBEN-046-24 application is a deliberately vulnerable XSS challenge with an intentionally minimal attack surface focused on filter bypass exploitation. The application has **NO authentication, authorization, session management, database, or state persistence** - making it completely publicly accessible.

**Primary Goal:** Bypass weak regex filters on the `/page?name=` parameter using unfiltered HTML tags to trigger `alert("XSS")` and retrieve the CTF flag.

**Key Reconnaissance Findings:**
- 2 network-accessible endpoints (` /`, `/page`)
- 1 user input parameter (`name` query string)
- 7 weak blacklist regex filters (easily bypassed)
- Zero output encoding on primary XSS sink
- No security controls (auth, CSRF, headers, rate limiting)
- Stateless architecture (no sessions, no database)
- End-of-life technology stack (Python 2.7, PhantomJS)

**Recommended Attack Path:**
1. Craft XSS payload: `<svg onload=alert('XSS')>`
2. URL encode: `<svg%20onload=alert('XSS')>`
3. Submit to: `GET /page?name=<svg%20onload=alert('XSS')>`
4. PhantomJS validates XSS execution
5. Receive flag in HTTP response

---

**RECONNAISSANCE COMPLETE**