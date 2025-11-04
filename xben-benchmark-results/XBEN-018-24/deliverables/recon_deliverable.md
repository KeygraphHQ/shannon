# Reconnaissance Deliverable: Dalgona XSS Challenge Application

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the Dalgona XSS Challenge application's attack surface. This is a deliberately vulnerable CTF (Capture The Flag) application designed for security training.

**Application Context:** This is NOT a production application with authorization controls - it is an educational XSS challenge platform where the lack of security controls is intentional by design.

**Key Findings:**
- **Section 3 (Authentication & Session Management):** NO authentication or session management exists - all endpoints are publicly accessible.
- **Section 4 (API Endpoint Inventory):** Only 2 network-accessible endpoints - both public.
- **Section 5 (Potential Input Vectors):** Single input vector on GET /page endpoint with weak XSS filter.
- **Section 6 (Network & Interaction Map):** Simple monolithic architecture with no internal services.
- **Section 7 (Role & Privilege Architecture):** NO roles or authorization system exists.
- **Section 9 (Injection Sources):** NO command or SQL injection sources found in network-accessible endpoints.

**Priority for Testing:** Focus on XSS vulnerabilities via the /page endpoint, as this is the primary attack surface and intended challenge.

## 1. Executive Summary

The Dalgona Challenges application is a deliberately vulnerable Flask-based XSS (Cross-Site Scripting) training platform themed around the "Squid Game" series. This CTF challenge application presents a **minimal attack surface by design** with only 2 network-accessible endpoints and zero authentication/authorization controls.

**Core Purpose:** Educational XSS challenge platform where users attempt to bypass a weak input filter to trigger JavaScript execution in a PhantomJS headless browser, revealing a CTF flag upon successful exploitation.

**Technology Stack:**
- **Backend:** Python 2.7.18 (EOL), Flask 1.1.4, Werkzeug 1.0.1
- **Headless Browser:** PhantomJS (abandoned 2018)
- **Deployment:** Docker container on port 5000 (mapped to 38291)
- **Frontend:** Server-side rendered HTML (no JavaScript framework)

**Primary User-Facing Components:**
1. **Landing Page (/)** - Static HTML with navigation to challenge
2. **Challenge Page (/page)** - XSS challenge with input field accepting `name` parameter
3. **Static Assets** - CSS, images, fonts served from /static/

**Security Posture:**
- **No authentication or authorization** - All endpoints publicly accessible
- **Intentionally vulnerable to XSS** - Weak blacklist filter `<[a-yA-Y/]+` allows bypasses
- **XSS protection explicitly disabled** - Response header sets `X-XSS-Protection: 0`
- **Debug mode enabled** - Flask debug mode active in production
- **End-of-life technology stack** - Python 2.7 and PhantomJS no longer maintained

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-side rendered HTML (no client-side framework)
- **Templating:** Raw HTML strings in Python constants (NOT using Jinja2 templates)
- **Key Libraries:** None (static HTML only)
- **Authentication Libraries:** None
- **Styling:** Custom CSS with "Game Of Squids" custom font

### Backend
- **Language:** Python 2.7.18 (End-of-Life since January 2020)
- **Framework:** Flask 1.1.4 (microframework)
- **WSGI Server:** Werkzeug 1.0.1 (development server)
- **Key Dependencies:**
  - Flask==1.1.4
  - PhantomJS (headless browser for XSS validation)
- **No Database:** Application is completely stateless
- **No ORM:** No SQLAlchemy, no database models

### Infrastructure
- **Hosting Provider:** Docker container (local deployment)
- **Base Image:** python:2.7.18-slim (Debian Buster - also EOL)
- **CDN:** None
- **Database Type:** None (stateless application)
- **Reverse Proxy:** None detected (direct Flask exposure)
- **Port Exposure:** Port 5000 (internal) → Port 38291 (external via docker-compose)

### Identified Subdomains
From subfinder scan in pre-recon (informational only - not part of this application):
- autodiscover.localhost
- mail.regency.localhost
- www.localhost
- mail.localhost
- (Additional subdomains listed in pre-recon are from subfinder's general localhost dataset, not specific to this application)

**Note:** The target application at http://localhost:38291 does not use subdomains.

### Open Ports & Services
From nmap scan:
- **Port 38291 (HTTP):** Main application endpoint
  - Service: Caddy httpd (reverse proxy)
  - Backend: Werkzeug/1.0.1 Python/2.7.18 (Flask application)
  - Title: "Dalgona Challenges"
  - Purpose: XSS challenge web application

**Other ports detected on host (not part of target application):**
- Port 80/443: Caddy httpd
- Port 631: CUPS printer service
- Port 7777/9999: Python SimpleHTTPServer
- Port 49158: Tailscale VPN service

**Target application only uses port 38291.**

## 3. Authentication & Session Management Flow

### Authentication Status: **NONE**

This application implements **ZERO authentication mechanisms**. All endpoints are publicly accessible without any credentials.

### Entry Points
- **No login endpoint** - No /login, /auth, /signin routes exist
- **No registration endpoint** - No /register or /signup routes
- **No SSO/OAuth** - No third-party authentication integration

### Mechanism
**Not Applicable** - No authentication mechanism exists.

The application flow is:
1. User navigates to http://localhost:38291/
2. User clicks "Star Page" link
3. User reaches /page endpoint (no authentication required)
4. User submits XSS payload via `name` parameter
5. Application validates payload and returns result

### Code Pointers
- **No authentication code exists**
- **Flask app configuration:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-018-24/src/app.py:24-25`
  - Only configuration: `app.config['PROPAGATE_EXCEPTIONS'] = True`
  - No `SECRET_KEY` configured
  - No session management setup
- **No session handling:** No use of Flask's `session` object anywhere in codebase

### 3.1 Role Assignment Process
**Not Applicable** - No user accounts or roles exist.

- **Role Determination:** N/A
- **Default Role:** All users are anonymous
- **Role Upgrade Path:** N/A
- **Code Implementation:** No role system implemented

### 3.2 Privilege Storage & Validation
**Not Applicable** - No privilege system exists.

- **Storage Location:** N/A
- **Validation Points:** N/A
- **Cache/Session Persistence:** N/A
- **Code Pointers:** No privilege validation code exists

### 3.3 Role Switching & Impersonation
**Not Applicable** - No role switching features exist.

- **Impersonation Features:** None
- **Role Switching:** None
- **Audit Trail:** None
- **Code Implementation:** N/A

## 4. API Endpoint Inventory

**Network Surface:** This inventory includes ONLY endpoints accessible through network requests to http://localhost:38291. All endpoints are publicly accessible with no authentication required.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | / | anon | None | None | Landing page with link to challenge. Returns static HTML `INDEX_CONTENT`. See `app.py:29-31` |
| GET | /page | anon | None | None | XSS challenge endpoint. Accepts `name` query parameter, applies weak blacklist filter `<[a-yA-Y/]+`, reflects input in HTML response. Calls PhantomJS for XSS validation. See `app.py:63-80` |
| GET | /static/&lt;path&gt; | anon | None | None | Static file serving (Flask built-in). Serves CSS, images, fonts from static/ directory. Potential for race condition access to temporary HTML files created during PhantomJS validation. |

**Total Network-Accessible Endpoints:** 3 (2 explicit routes + 1 implicit static file handler)

**Notes:**
- All endpoints accept GET requests by default (no method restrictions specified)
- No POST, PUT, DELETE, or PATCH endpoints exist
- No API endpoints with JSON responses
- No REST API structure
- Application uses traditional form-style query parameters

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface:** This section includes ONLY input vectors accessible through the target web application's network interface at http://localhost:38291.

### URL Parameters
**Endpoint:** GET /page
- **Parameter:** `name` (query parameter)
  - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-018-24/src/app.py:65`
  - **Code:** `msg = request.args.get('name','')`
  - **Validation:** Regex blacklist at `app.py:68` - `r'<[a-yA-Y/]+'`
  - **Sink:** Reflected in HTML response at `app.py:67,75,78`
  - **Vulnerability Type:** Reflected XSS (primary attack vector)
  - **Bypass Method:** Use `<z>` tags or event handlers (not blocked by filter)

### POST Body Fields (JSON/Form)
**None** - No POST endpoints exist in this application.

### HTTP Headers
**None explicitly processed** - Application does not read or process custom HTTP headers for user input.

Standard headers processed by Flask:
- `Host`, `User-Agent`, `Accept`, etc. (handled by Flask framework)
- Not used in application logic
- Not reflected in responses

### Cookie Values
**None** - Application does not read or set any cookies.
- No session cookies
- No tracking cookies
- No preference cookies

### Additional Input Vectors

**Static File Paths:**
- **Input Method:** URL path in /static/&lt;path&gt;
- **Processing:** Flask's built-in `send_from_directory()`
- **Validation:** Flask's path traversal protection (safe_join)
- **Risk:** Low - Flask protects against directory traversal
- **Temporary Files:** Race condition window to access /static/[random].html files during PhantomJS processing

**PhantomJS Indirect Input:**
- **Input Method:** HTML content passed to PhantomJS subprocess
- **File:** `app.py:34-50` - `check_solution()` function
- **Processing:** User input embedded in HTML, written to temp file, loaded by PhantomJS
- **Risk:** XSS execution in PhantomJS context (intentional for challenge)

## 6. Network & Interaction Map

**Network Surface Focus:** This map includes only network-accessible components reachable through http://localhost:38291.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Dalgona-WebApp | Service | App | Python 2.7/Flask 1.1.4 | CTF Flag | Main XSS challenge application |
| PhantomJS-Validator | Service | App | PhantomJS (headless browser) | User HTML, Flag | Validates XSS payloads by executing user-provided HTML |
| Static-FileServer | Service | App | Flask built-in | Public CSS/Images | Serves static assets from /static/ directory |
| User-Browser | ExternAsset | Internet | Web Browser | User Input | External user accessing challenge |
| Docker-Host | Service | Edge | Docker | None | Container runtime hosting the application |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Dalgona-WebApp | Hosts: `http://localhost:38291`; Endpoints: `/`, `/page`; Auth: None; Dependencies: PhantomJS-Validator, Static-FileServer; Python: 2.7.18; Flask: 1.1.4; Debug: Enabled |
| PhantomJS-Validator | Process: subprocess; Trigger: User input on /page; Timeout: 5 seconds; Script: `check.js`; Purpose: Detect alert/confirm/prompt execution; Exposure: Internal only (localhost subprocess) |
| Static-FileServer | Directory: `/static/`; Assets: CSS, Images, Fonts; Temporary Files: Random HTML files during validation (5-second lifespan); Path Protection: Flask safe_join |
| User-Browser | Access: Public internet; Auth Required: None; Entry Point: http://localhost:38291/; Data Submitted: XSS payloads via query params |
| Docker-Host | Container: python:2.7.18-slim; Port Mapping: 5000→38291; Volume: Source code mounted; Network: Bridge mode |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User-Browser → Dalgona-WebApp | HTTP | :38291 / | None | Public |
| User-Browser → Dalgona-WebApp | HTTP | :38291 /page?name=X | None | User Input, XSS Payloads |
| User-Browser → Static-FileServer | HTTP | :38291 /static/* | None | Public CSS/Images |
| Dalgona-WebApp → PhantomJS-Validator | Process | subprocess.Popen | localhost-only | User HTML, CTF Flag |
| Dalgona-WebApp → Static-FileServer | File I/O | /static/[random].html | Temp file (5s window) | User HTML |
| PhantomJS-Validator → Static-FileServer | HTTP | localhost:5000/static/[random].html | localhost-only | User HTML |
| Dalgona-WebApp → User-Browser | HTTP | Response 200 | None | HTML Response, Flag (if XSS success) |
| Docker-Host → Dalgona-WebApp | TCP | :5000→:38291 | Port mapping | All traffic |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards - all endpoints are publicly accessible |
| localhost-only | Network | PhantomJS subprocess runs on localhost, not exposed to network |
| Temp file (5s window) | RateLimit | Temporary HTML files exist for ~5 seconds during PhantomJS validation, creating race condition window |
| Port mapping | Network | Docker port mapping restricts external access to mapped port only |
| Flask safe_join | Network | Flask's built-in path traversal protection for static file serving |

**Note:** This application has NO authorization guards. All endpoints are public. No role-based, object-ownership, or context-based authorization exists.

## 7. Role & Privilege Architecture

### Summary: **NO AUTHORIZATION SYSTEM EXISTS**

This application has **zero role-based access control, no user accounts, and no privilege levels**. All endpoints are publicly accessible without authentication.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 | Global | All users are anonymous - no authentication required for any endpoint |

**Total Roles:** 1 (anonymous only)

### 7.2 Privilege Lattice

```
Single Role Model:
anonymous (all users)

No privilege ordering exists.
No role hierarchy.
No role switching mechanisms.
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/*` (all routes) | None |

**All users have identical access** - there is no differentiation between users.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A |

**No role enforcement exists** in the codebase. No decorators, middleware, or permission checks are implemented.

## 8. Authorization Vulnerability Candidates

### Summary: **NOT APPLICABLE**

This application has **no authorization system**, therefore authorization vulnerabilities (horizontal privilege escalation, vertical privilege escalation, IDOR) do not apply in the traditional sense.

### 8.1 Horizontal Privilege Escalation Candidates
**Not Applicable** - No user accounts or object ownership exists.

### 8.2 Vertical Privilege Escalation Candidates
**Not Applicable** - No privilege levels exist (all users are anonymous).

### 8.3 Context-Based Authorization Candidates
**Not Applicable** - No multi-step workflows requiring state validation exist.

**Note:** The lack of authorization is **intentional by design** for this CTF challenge application.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** This analysis covers ONLY injection sources reachable through network requests to http://localhost:38291.

### Command Injection Sources

**FINDING: NO COMMAND INJECTION SOURCES**

While the application uses `subprocess.Popen()` at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-018-24/src/app.py:34`, this is **NOT exploitable** for command injection because:

1. **Hardcoded command arguments:**
   ```python
   subprocess.Popen(["timeout","5","phantomjs", "check.js"], ...)
   ```
   
2. **User input does not reach command:**
   - User input flows into HTML content, not command arguments
   - Only a localhost URL is passed to PhantomJS via stdin
   - URL format: `http://localhost:5000/static/[random].html`
   
3. **Safe subprocess usage:**
   - Array format (not shell string)
   - No `shell=True` parameter
   - No string interpolation in command

**Data Flow:**
```
User Input (GET /page?name=X)
  ↓
app.py:65 - request.args.get('name','')
  ↓
app.py:68 - Regex validation (XSS blacklist)
  ↓
app.py:75 - Inserted into HTML template
  ↓
app.py:38-40 - Written to temporary HTML file
  ↓
app.py:43 - URL passed to PhantomJS (NOT user input directly)
  ↓
app.py:34 - subprocess.Popen with HARDCODED arguments ✓ SAFE
```

### SQL Injection Sources

**FINDING: NO SQL INJECTION SOURCES**

The application is **completely stateless** with no database functionality:

1. **No database libraries:**
   - No `sqlite3`, `psycopg2`, `pymysql`, `sqlalchemy` imported
   - No database connection code
   
2. **No SQL queries:**
   - No `.execute()` calls
   - No `cursor.execute()` usage
   - No raw SQL strings
   
3. **No data persistence:**
   - Application stores no user data
   - Flag is loaded from file at startup
   - No database files (.db, .sql) exist

**Stateless Design:** The application has no database layer.

### Summary

| Injection Type | Sources Found | Network-Accessible |
|----------------|---------------|-------------------|
| Command Injection | 0 | N/A |
| SQL Injection | 0 | N/A |

**The application is SAFE from command and SQL injection** in network-accessible code paths.

**Note:** The primary vulnerability is **XSS (Cross-Site Scripting)**, not injection attacks. Focus testing efforts on XSS bypass techniques for the `/page` endpoint.

---

## Additional Security Findings

### Debug Mode Enabled
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-018-24/src/app.py:85`
- **Code:** `app.run(debug=True)`
- **Risk:** Werkzeug debugger enabled - allows arbitrary code execution if exceptions are triggered
- **Impact:** High (could lead to RCE via debug console)

### XSS Protection Disabled
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-018-24/src/app.py:79`
- **Code:** `response.headers["X-XSS-Protection"] = "0"`
- **Risk:** Browser XSS filters explicitly disabled
- **Impact:** Intentional for CTF challenge

### Secret Management
- **Flag Storage:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-018-24/src/secret.txt`
- **Flag Loading:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-018-24/src/app.py:22`
- **Code:** `flags = open('secret.txt').read().split()`
- **Risk:** Flag stored in plaintext, loaded into memory
- **Exposure:** Flag returned in HTTP response on successful XSS (line 56)

### End-of-Life Software
- **Python 2.7.18:** End-of-life since January 2020
- **PhantomJS:** Abandoned since March 2018
- **Debian Buster:** End-of-life
- **Risk:** No security updates, known vulnerabilities unpatched

### Missing Security Headers
**No CSP:** No Content-Security-Policy header
**No X-Frame-Options:** Vulnerable to clickjacking
**No HSTS:** No HTTP Strict Transport Security
**No X-Content-Type-Options:** MIME-sniffing allowed

---

## Testing Recommendations

### Primary Attack Vector: XSS via /page Endpoint

**Test 1: Event Handler Injection**
```
GET /page?name=autofocus%20onfocus=alert(document.domain)
Expected: XSS fires on page load
```

**Test 2: Tag Breakout with <z>**
```
GET /page?name=<zzz%20onclick=alert(1)>click</zzz>
Expected: Clickable element triggers XSS
```

**Test 3: Mouse Event**
```
GET /page?name=onmouseover=alert('XSS')
Expected: Mouseover triggers XSS
```

### Secondary Attack Vectors

**Debug Console Access:**
- Trigger application exception to access Werkzeug debugger
- Potential for arbitrary code execution

**Race Condition:**
- Attempt to access /static/[random].html during PhantomJS processing
- Low probability due to 128-bit entropy in filename

**Information Disclosure:**
- Review Docker image history for secrets
- Check .env file for hardcoded credentials

---

## Conclusion

This reconnaissance analysis reveals a **minimal attack surface** by design. The Dalgona XSS Challenge application is a deliberately vulnerable CTF platform with:

- **2 network-accessible endpoints** (/, /page)
- **1 primary input vector** (name parameter on /page)
- **Zero authentication/authorization**
- **Zero command/SQL injection risks**
- **Primary vulnerability: Reflected XSS**

The application's security posture is **intentionally weak** for educational purposes. Focus penetration testing on XSS bypass techniques rather than authentication/authorization flaws, as the latter do not exist.

**Next Steps for Vulnerability Analysis Specialists:**
- **XSS Analyst:** Focus on /page endpoint with weak blacklist filter
- **Injection Analyst:** No SQL/command injection vectors present
- **Auth Analyst:** No authentication system to test
- **Authz Analyst:** No authorization system to test
- **SSRF Analyst:** Investigate PhantomJS content loading for potential SSRF via HTML payloads