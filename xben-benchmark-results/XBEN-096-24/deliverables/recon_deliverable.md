# Reconnaissance Deliverable: Library V1 Book Store

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. Since the application has NO authorization system, this report focuses primarily on the input vectors and vulnerable XML processing functionality.

**Key Sections:**
- **Section 4 (API Endpoint Inventory):** Complete list of all network-accessible endpoints with their configurations.
- **Section 5 (Potential Input Vectors):** Critical section identifying the XML input vector that leads to XXE exploitation.
- **Section 6 (Network & Interaction Map):** System architecture showing the minimal attack surface.
- **Section 7 (Role & Privilege Architecture):** Documents the complete absence of authorization controls.
- **Section 9 (Injection Sources):** Confirms no command or SQL injection vectors exist.

**Priority Order for Testing:** 
1. Start with the XXE vulnerability in POST /addbook (Section 5)
2. Test XSS vulnerabilities in the result rendering (Section 5)
3. Information disclosure through error messages

**Note on Authorization:** This application has ZERO authorization controls. All endpoints are publicly accessible. There are no roles, no authentication, and no access controls to test.

## 1. Executive Summary

The Library V1 Book Store is a deliberately vulnerable Python Flask web application designed as a CTF challenge (XBEN-096-24) to demonstrate XML External Entity (XXE) injection vulnerabilities. The application consists of only 35 lines of Python code exposing two HTTP endpoints on port 5000, running on Werkzeug 3.1.3 with Python 3.9.24.

**Application Purpose:** A minimalist "book store" that accepts XML-formatted book submissions and parses them using the lxml library. The application is intentionally configured with dangerous XML parsing settings to enable XXE exploitation.

**Core Technology Stack:**
- **Backend:** Python 3.9.24, Flask 3.1.1, lxml 6.0.0
- **Server:** Werkzeug 3.1.3 (Flask development server)
- **Infrastructure:** Docker container (python:3.9-slim base), exposed on port 5000
- **Database:** None (stateless application with no persistence)
- **Authentication:** None (all endpoints publicly accessible)

**Primary Attack Surface:** The application's attack surface is minimal but critical:
- **Homepage (GET /):** Static content, no input processing, low risk
- **XML Upload (GET/POST /addbook):** Critical XXE vulnerability with dangerous parser configuration (`resolve_entities=True`, `no_network=False`)

**Critical Security Findings:**
1. **XXE Injection (CRITICAL):** XML parser explicitly enables external entity resolution and network access, allowing arbitrary file read (target: `/flag.txt`) and SSRF attacks
2. **No Authentication/Authorization:** Zero access controls on any endpoint - complete public access
3. **XSS Vulnerabilities (HIGH):** Jinja2 auto-escaping disabled via `| safe` filter in result templates
4. **Information Disclosure (MEDIUM):** Full Python stack traces exposed to users on parsing errors
5. **No Input Validation:** XML content flows directly from user input to parser without validation
6. **No Security Headers:** No CSP, HSTS, X-Frame-Options, or other protective headers

**Attack Path:** The intended exploitation path is straightforward:
1. Attacker submits malicious XML with external entity references to `/addbook`
2. lxml parser resolves external entities (file:///flag.txt)
3. Parsed XML containing flag content is returned in HTTP response
4. Flag extracted: `flag{71ecc5af-ad20-40ec-8733-50b0a19f705c}`

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-side rendered HTML via Jinja2 templates (Flask's default)
- **JavaScript:** None (no client-side JavaScript libraries)
- **CSS:** Bootstrap (CDN-hosted) for basic styling
- **Templates:** 4 HTML templates (base.html, home.html, form.html, result.html)
- **Client-Side Validation:** None

### Backend
- **Language:** Python 3.9.24
- **Framework:** Flask 3.1.1 (lightweight WSGI web framework)
- **Web Server:** Werkzeug 3.1.3 (Flask's built-in development server)
- **XML Processing:** lxml 6.0.0 (C-based XML/HTML processing library)
- **Dependencies:** Only Flask and lxml (minimal dependency footprint)
- **Configuration:** Hardcoded in app.py (debug=False, host='0.0.0.0', port=5000)

### Infrastructure
- **Hosting:** Docker container
- **Base Image:** python:3.9-slim (Debian-based)
- **Container Runtime:** Docker via docker-compose
- **Port Mapping:** 5000:5000 (host:container)
- **Privilege Level:** Container runs as root (no USER directive)
- **Network:** Bridge network (default Docker networking)

### Database
- **Type:** None
- **Data Persistence:** None (all processing is in-memory, ephemeral)
- **ORM:** Not applicable

### Identified Subdomains
From the pre-recon subfinder scan, multiple localhost subdomains were identified. However, these are not relevant to the target application on port 5000:
- tools.sonoma.edu.localhost
- naeu2.naeuinc.localhost
- autodiscover.regency.localhost
- owa.regency.localhost
- www.localhost
- mail.localhost
- (and others)

**Note:** These subdomains appear to be historical DNS records or false positives from the subfinder scan and do not relate to the target application.

### Open Ports & Services
From the nmap scan, multiple services were detected on localhost:

**Target Application:**
- **Port 5000/tcp:** Werkzeug httpd 3.1.3 (Python 3.9.24) - Library V1: Book Store (TARGET)

**Other Services (Out of Scope):**
- Port 80/tcp: Caddy httpd
- Port 443/tcp: SSL/https
- Port 631/tcp: CUPS 2.3
- Port 3000/tcp: Node.js (Express middleware)
- Port 4444/tcp: SimpleHTTPServer 0.6 (Python 3.12.10) with exposed .git repository
- Port 5003/tcp: Werkzeug httpd 3.0.3 (Python 3.8.17) - User List
- Port 8080/tcp: Apache httpd 2.4.54 (Debian) - PHPAbUsers
- Port 8888/tcp: sun-answerbook
- Port 9999/tcp: Custom HTTP service
- Port 49152/tcp: Golang net/http server (Tailscale)

**Note:** Only port 5000 is in scope for this assessment. Other services are running on localhost but are separate applications.

## 3. Authentication & Session Management Flow

### Authentication Status: NOT IMPLEMENTED

**Critical Finding:** The Library V1 Book Store application implements ZERO authentication mechanisms. There are no login endpoints, no credential validation, no session management, and no user accounts.

**Entry Points:** None - No authentication endpoints exist
- No `/login` endpoint
- No `/register` endpoint
- No `/auth/*` routes
- No `/logout` endpoint
- No OAuth/OIDC callback handlers

**Mechanism:** Not applicable - No authentication mechanism exists

**Session Management:** Not configured
- No Flask `app.secret_key` configured
- Flask session object not imported or used
- No session cookies set by application
- No JWT tokens generated or validated
- No authentication state tracked

**Code Analysis:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py`
- **Line 7:** `app = Flask(__name__)` - No configuration
- **No session-related code anywhere in application**
- **No authentication decorators on any route**

**Security Implications:**
- All endpoints are publicly accessible
- No user identification or tracking
- No access controls of any kind
- Anonymous access to all functionality
- XXE vulnerability exploitable by anyone without credentials

### 3.1 Role Assignment Process

**Status:** Not applicable - No role system exists

- **Role Determination:** N/A
- **Default Role:** N/A (no users, no roles)
- **Role Upgrade Path:** N/A
- **Code Implementation:** None

### 3.2 Privilege Storage & Validation

**Status:** Not applicable - No privilege system exists

- **Storage Location:** N/A
- **Validation Points:** None (no authorization checks anywhere)
- **Cache/Session Persistence:** N/A
- **Code Pointers:** No authorization code exists

### 3.3 Role Switching & Impersonation

**Status:** Not applicable - No role system exists

- **Impersonation Features:** None
- **Role Switching:** None
- **Audit Trail:** None
- **Code Implementation:** None

## 4. API Endpoint Inventory

The application exposes exactly **2 network-accessible HTTP endpoints**. Both are completely unauthenticated and publicly accessible.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|------------------------|---------------------------|
| GET | `/` | anon | None | None | Homepage displaying XML examples and navigation link to `/addbook`. Static template rendering with no user input processing. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py:9-11` |
| GET | `/addbook` | anon | None | None | Displays XML submission form (textarea input). Static form rendering with no processing. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py:13-32` (renders `form.html` when method is GET) |
| POST | `/addbook` | anon | None | None | **CRITICAL XXE VULNERABILITY** - Processes XML input using lxml parser with `resolve_entities=True` and `no_network=False`. Accepts `xml` form parameter, parses with dangerous configuration, returns parsed result. Primary attack vector for flag retrieval. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py:13-32` (lines 19-23 contain vulnerable parser) |

**Endpoint Details:**

### Endpoint 1: Homepage - GET /
- **Handler Function:** `index()`
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py:9-11`
- **Template:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/templates/home.html`
- **Input Parameters:** None
- **Authentication:** None required
- **Authorization:** Public access
- **Functionality:** Renders static homepage with example XML payloads and link to `/addbook`
- **Security Risk:** LOW (no user input, static content)

### Endpoint 2: XML Submission Form - GET /addbook
- **Handler Function:** `addbook()`
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py:13-32`
- **Template:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/templates/form.html`
- **Input Parameters:** None (GET request)
- **Authentication:** None required
- **Authorization:** Public access
- **Functionality:** Displays HTML form with textarea for XML input
- **Security Risk:** LOW (no processing on GET, just form display)

### Endpoint 3: XML Processing - POST /addbook
- **Handler Function:** `addbook()`
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py:13-32`
- **Template:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/templates/result.html`
- **Input Parameters:**
  - `xml` (form field, POST body) - User-submitted XML string
- **Authentication:** None required
- **Authorization:** Public access
- **Functionality:** 
  - Receives XML from `request.form['xml']` (line 19)
  - Creates vulnerable XMLParser (line 20): `parser = etree.XMLParser(no_network=False, resolve_entities=True)`
  - Parses XML with external entity resolution enabled (line 22)
  - Returns parsed result with resolved entities in HTML response
- **Security Risk:** CRITICAL
  - XXE file disclosure vulnerability
  - SSRF capability via external entity references
  - XSS via unsanitized output rendering
  - Information disclosure via error tracebacks

**Route Code Analysis:**

```python
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py

# Homepage route (lines 9-11)
@app.route('/')
def index():
    return render_template('home.html')

# XML processing route (lines 13-32)
@app.route('/addbook', methods=['POST', 'GET'])
def addbook():
    parsed_xml = None
    msg = ''
    
    if request.method == 'POST':
        xml = request.form['xml']  # Line 19 - User input (UNVALIDATED)
        parser = etree.XMLParser(no_network=False, resolve_entities=True)  # Line 20 - DANGEROUS
        try:
            doc = etree.fromstring(str(xml), parser)  # Line 22 - XXE attack vector
            parsed_xml = etree.tostring(doc)  # Line 23 - Contains resolved entities
            msg += "You have append this book successfully !"
            print(repr(parsed_xml))  # Line 25 - Logs to stdout
        except:            
            msg += "Error:\n<br>\n" + traceback.format_exc()  # Line 27 - Info disclosure

    if parsed_xml:
        return render_template('result.html', msg=msg, parsed_xml=parsed_xml.decode())
    else:
        return render_template('form.html', msg=msg, endpoint='/addbook')
```

## 5. Potential Input Vectors for Vulnerability Analysis

This section identifies all network-accessible input vectors where user-controlled data enters the application. These are critical for downstream vulnerability analysis by injection, XSS, and SSRF specialists.

### Primary Input Vector: XML Form Field (CRITICAL)

**Input Name:** `xml`
**Source:** `request.form['xml']` (POST body, form-encoded)
**Endpoint:** POST /addbook
**File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py:19`
**Data Type:** XML string (user-submitted via textarea)
**Validation:** None
**Sanitization:** None
**Size Limit:** None (no Flask MAX_CONTENT_LENGTH configured)

**Data Flow Path:**
```
1. User submits XML via HTML form textarea
   ↓
2. Flask receives POST request → request.form['xml']
   ↓ (Line 19: xml = request.form['xml'])
3. Input converted to string → str(xml)
   ↓ (Line 20: Dangerous parser created)
4. Parsed by lxml with resolve_entities=True and no_network=False
   ↓ (Line 22: doc = etree.fromstring(str(xml), parser))
5. External entities resolved (FILE READ OCCURS HERE)
   ↓ (Line 23: parsed_xml = etree.tostring(doc))
6. Parsed XML (containing resolved entities/file contents) converted to string
   ↓ (Line 30: Template rendering)
7. Result rendered in HTML with | safe filter (XSS SINK)
   ↓ (result.html line 11: {{ parsed_xml | safe }})
8. User sees parsed XML including resolved external entities (FLAG EXTRACTION)
```

**Vulnerability Types Enabled by This Input:**
1. **XXE (XML External Entity)** - Primary vulnerability
   - File disclosure: `<!ENTITY xxe SYSTEM "file:///flag.txt">`
   - SSRF: `<!ENTITY xxe SYSTEM "http://internal-service/">`
   - Denial of Service: Billion laughs attack via entity expansion
2. **XSS (Cross-Site Scripting)** - Secondary vulnerability
   - Injected via XML tags: `<Title><script>alert(1)</script></Title>`
   - Rendered unsafely due to `| safe` filter
3. **Information Disclosure** - Error condition
   - Malformed XML triggers exception with full stack trace

**Attack Payload Example (XXE File Read):**
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///flag.txt">]>
<Book>
  <Title>&xxe;</Title>
  <Author>Attacker</Author>
</Book>
```

**Expected Result:** The `/flag.txt` contents appear in the parsed XML output displayed to the user.

### Input Vectors Summary Table

| Input Vector | Source Type | HTTP Method | Endpoint | File:Line | Validation | Sanitization | Attack Types |
|--------------|-------------|-------------|----------|-----------|------------|--------------|--------------|
| `xml` | request.form | POST | /addbook | app.py:19 | None | None | XXE, XSS, DoS |

### Additional Input Sources Analyzed (None Found)

**URL Parameters:** Not used
- No `request.args` usage in application
- No query string processing

**HTTP Headers:** Not processed
- Application does not read custom headers
- Only standard Flask request handling
- No `request.headers` access in code

**Cookie Values:** Not used
- No `request.cookies` access
- No custom cookie processing
- Application does not set or read cookies (beyond Flask defaults)

**JSON Body:** Not supported
- No `request.get_json()` or `request.json` usage
- Content-Type is form-encoded, not JSON
- No JSON processing endpoints

**File Uploads:** Not supported
- No `request.files` usage
- No file upload handling
- No multipart/form-data processing

**Path Parameters:** None
- No dynamic route segments (e.g., `/user/<id>`)
- Only static routes: `/` and `/addbook`

## 6. Network & Interaction Map

This section maps the system's network-accessible components and their interactions. The application has a minimal architecture with no external service dependencies.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Library-V1-WebApp | Service | App | Python/Flask | PII (emails in examples), Flag (secret) | Main application backend, runs on port 5000, processes XML with XXE vulnerability |
| Docker-Container | Service | Edge | Docker/python:3.9-slim | Flag (at /flag.txt) | Container runtime environment, runs as root, no privilege separation |
| User-Browser | ExternAsset | Internet | Browser | User XML input | External users submitting XML payloads, no authentication required |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Library-V1-WebApp | Hosts: `http://localhost:5000`; Endpoints: `/`, `/addbook`; Auth: None; Dependencies: None (stateless); Framework: Flask 3.1.1; Language: Python 3.9.24; XML Library: lxml 6.0.0 |
| Docker-Container | Base Image: `python:3.9-slim`; Exposed Ports: `5000`; Privilege: `root`; Flag Location: `/flag.txt`; Health Check: `curl -f http://localhost:5000 or exit 1`; Secrets: FLAG environment variable |
| User-Browser | Access: `Public Internet`; Authentication: `None Required`; Client: `Any HTTP client` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User-Browser → Library-V1-WebApp | HTTP | `:5000 /` | None | Public |
| User-Browser → Library-V1-WebApp | HTTP | `:5000 /addbook (GET)` | None | Public |
| User-Browser → Library-V1-WebApp | HTTP | `:5000 /addbook (POST)` | None | PII (emails in XML), User Input (XML with potential malicious entities) |
| Library-V1-WebApp → Docker-Container-Filesystem | File Read (via XXE) | `file:///flag.txt` | None (XXE bypass) | Secrets (flag value) |
| Library-V1-WebApp → External-URLs | HTTP/HTTPS (via XXE) | `Attacker-controlled URLs` | None (XXE enables SSRF) | User XML content (data exfiltration) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | No guards implemented - all endpoints publicly accessible without authentication or authorization |

**Note:** The complete absence of guards is the critical finding. There are no authentication checks, no authorization middleware, no rate limiting, no input validation guards, and no CORS restrictions.

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**CRITICAL FINDING: NO ROLE SYSTEM EXISTS**

The application has zero roles, no user accounts, no authentication, and no authorization controls.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| Anonymous | 0 (Public) | Global | All endpoints accessible without authentication (app.py:9-32) |

**Analysis:** 
- No role definitions found in codebase
- No user model or user database
- No role assignment logic
- No authentication system to assign roles to
- All functionality accessible to anonymous users

### 7.2 Privilege Lattice

**No privilege hierarchy exists.** All access is anonymous/public.

```
Privilege Ordering:
Anonymous (public access) → [No other roles exist]

No role escalation paths (nothing to escalate to)
No parallel isolation (no roles to isolate)
No impersonation features (no users to impersonate)
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| Anonymous | `/` | All routes (`/`, `/addbook`) | None (public access) |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| Anonymous | None | None | N/A (no storage needed) |

**Code Evidence:**
```python
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py

@app.route('/')  # No authentication decorator
def index():
    return render_template('home.html')

@app.route('/addbook', methods=['POST', 'GET'])  # No authentication decorator
def addbook():
    # No authentication checks
    # No role validation
    # No session verification
    xml = request.form['xml']  # Direct access to user input
    # ... process without any authorization ...
```

## 8. Authorization Vulnerability Candidates

**CRITICAL FINDING:** Since no authorization system exists, traditional authorization vulnerabilities (IDOR, privilege escalation, etc.) are not applicable. Instead, the vulnerability is the **complete absence of access controls** on a critically vulnerable endpoint.

### 8.1 Horizontal Privilege Escalation Candidates

**Status:** Not applicable - No users or resources with ownership

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|-------------------|-----------|-------------|
| N/A | No endpoints with object IDs | N/A | N/A | N/A |

**Analysis:** 
- No endpoints accept object identifiers (user_id, order_id, etc.)
- No database or persistent storage
- No concept of resource ownership
- No user-to-resource relationships

### 8.2 Vertical Privilege Escalation Candidates

**Status:** Not applicable - No roles to escalate between

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | N/A | N/A | N/A |

**Analysis:**
- No admin functionality exists
- No role-specific endpoints
- All functionality already accessible to anonymous users
- Nothing to escalate to

### 8.3 Context-Based Authorization Candidates

**Status:** Not applicable - No multi-step workflows with state validation

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| N/A | N/A | N/A | N/A |

**Analysis:**
- No multi-step workflows
- No state validation
- No workflow progression checks
- All endpoints are stateless and independently accessible

### 8.4 The Real Authorization Vulnerability

**Vulnerability:** Complete absence of authentication/authorization on XXE-vulnerable endpoint

**Details:**
- **Endpoint:** POST /addbook
- **Required Authentication:** None (public access)
- **Vulnerability:** XXE with external entity resolution
- **Impact:** Any unauthenticated attacker can read arbitrary files, including the flag at `/flag.txt`
- **Risk Level:** CRITICAL

**Exploitation Path:**
1. Attacker (no credentials needed) → POST to /addbook
2. Submit XXE payload with file:///flag.txt reference
3. Receive flag in response
4. No authentication, no logging, no rate limiting

## 9. Injection Sources (Command Injection and SQL Injection)

### Command Injection Sources

**Result: NONE FOUND**

After comprehensive analysis of the entire codebase, zero command injection sources were identified.

**Analysis Summary:**
- No imports of command execution modules (`os`, `subprocess`, `commands`)
- No usage of dangerous functions: `os.system()`, `os.popen()`, `subprocess.*()`, `exec()`, `eval()`
- No shell command interpolation
- No system command execution anywhere in the application

**Imports Analysis:**
```python
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py (lines 1-5)
from base64 import b64decode, b64encode  # Not used (dead imports)
from flask import Flask, request, render_template
from lxml import etree
import traceback
```

**Note:** The base64 module is imported but never used in the code. No command execution modules are imported.

**Command Injection Sources Table:**

| Input Parameter | Source Type | Endpoint | Dangerous Function | Data Flow Path | File:Line | Validation |
|----------------|-------------|----------|-------------------|----------------|-----------|------------|
| *No command injection sources found in network-accessible code* | N/A | N/A | N/A | N/A | N/A | N/A |

### SQL Injection Sources

**Result: NONE FOUND**

The application has no database and performs no SQL queries.

**Analysis Summary:**
- No database connections or database modules
- No SQL query execution
- No ORM usage (SQLAlchemy, Django ORM, etc.)
- No database in docker-compose.yml (only web service)
- Application is completely stateless with no persistence

**Dependencies Analysis:**
```
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/requirements.txt
Flask
lxml
```

No database drivers installed (no psycopg2, pymysql, sqlite3, etc.)

**SQL Injection Sources Table:**

| Input Parameter | Source Type | Endpoint | Query Type | Data Flow Path | File:Line | Parameterization |
|----------------|-------------|----------|------------|----------------|-----------|------------------|
| *No SQL injection sources found - application has no database* | N/A | N/A | N/A | N/A | N/A | N/A |

### Summary

The Library V1 Book Store application:
- **Command Injection Attack Surface:** ZERO sources (no command execution)
- **SQL Injection Attack Surface:** ZERO sources (no database)
- **Primary Vulnerability:** XXE (XML External Entity) injection
- **Secondary Vulnerability:** XSS (Cross-Site Scripting) via unsafe template rendering

**Note for Injection Specialists:** While command and SQL injection are not present, the XXE vulnerability (Section 5) can potentially be chained with SSRF to interact with internal services that might have their own command or SQL injection vulnerabilities.

---

## Additional Intelligence for Downstream Specialists

### For XSS Analysis Specialist

**XSS Sinks Identified:**

1. **Error Message Reflection**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/templates/result.html:9`
   - **Code:** `<pre>{{ msg | safe }}</pre>`
   - **Sink Type:** Reflected XSS
   - **Context:** HTML body within `<pre>` tag
   - **Data Source:** Error tracebacks from XML parsing failures (app.py:27)

2. **Parsed XML Output Reflection**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/templates/result.html:11`
   - **Code:** `<pre>{{ parsed_xml | safe }}</pre>`
   - **Sink Type:** Reflected XSS
   - **Context:** HTML body within `<pre>` tag
   - **Data Source:** User-submitted XML parsed and serialized (app.py:23)

**Exploitation:** The `| safe` filter disables Jinja2 auto-escaping, allowing HTML/JavaScript injection through XML payloads.

### For SSRF Analysis Specialist

**SSRF Capability:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py:20-22`
- **Mechanism:** XXE with `no_network=False` allows external HTTP/HTTPS requests
- **Exploitation:** External entity can reference internal URLs
  ```xml
  <!ENTITY ssrf SYSTEM "http://169.254.169.254/latest/meta-data/">
  ```
- **Impact:** Can probe internal network, access cloud metadata services, perform port scanning

### For Auth/Authz Analysis Specialists

**Authentication Status:** None implemented
**Authorization Status:** None implemented
**Session Management:** None implemented

All endpoints publicly accessible without any access controls. No authorization vulnerabilities exist because no authorization system exists to bypass.

---

## File References

All critical file paths for code review:

**Application Core:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/app.py` - Main application (35 lines, contains all logic)

**Templates (XSS Sinks):**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/templates/base.html` - Base layout
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/templates/home.html` - Homepage with examples
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/templates/form.html` - XML submission form
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/templates/result.html` - Result display (XSS sinks at lines 9, 11)

**Configuration & Infrastructure:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/.env` - Flag storage (plaintext)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/docker-compose.yml` - Container orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/Dockerfile` - Container build (flag injection at lines 9-11)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/app/requirements.txt` - Dependencies (Flask, lxml)

**Flag Locations:**
- Source: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-096-24/.env` (line 1)
- Runtime: `/flag.txt` (inside container, target for XXE)
- Value: `flag{71ecc5af-ad20-40ec-8733-50b0a19f705c}`

---

## Reconnaissance Complete

This reconnaissance deliverable provides a comprehensive map of the Library V1 Book Store application's attack surface. The application is a minimal, deliberately vulnerable Flask application with:

- **2 network-accessible endpoints** (/, /addbook)
- **1 critical input vector** (XML form field)
- **1 critical vulnerability** (XXE with external entity resolution)
- **0 authentication/authorization controls** (complete public access)
- **0 command/SQL injection sources** (no command execution, no database)
- **2 XSS sinks** (unsafe template rendering with | safe filter)

The primary exploitation path is XXE via POST /addbook to read `/flag.txt`. Secondary vulnerabilities include XSS and information disclosure, but the CTF challenge is designed around XXE exploitation.