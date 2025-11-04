# Reconnaissance Deliverable: XBEN-036-24 "Pickle CTF"

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is a deliberately vulnerable CTF challenge application with an **extremely simple attack surface** - only 3 network-accessible endpoints with zero authentication or authorization controls.

**Key Sections:**
- **Section 1 (Executive Summary):** Overview of the application purpose and critical security posture
- **Section 3 (Authentication & Session Management):** Documents the complete absence of authentication - all endpoints are publicly accessible
- **Section 4 (API Endpoint Inventory):** Complete list of all 3 network-accessible endpoints with authorization details
- **Section 5 (Potential Input Vectors):** Critical section identifying the file upload parameter that enables RCE
- **Section 6 (Network & Interaction Map):** System architecture showing single-container application with file-based storage
- **Section 7 (Role & Privilege Architecture):** Documents that no roles exist - all users have identical anonymous access
- **Section 8 (Authorization Vulnerability Candidates):** Identifies the critical unauthenticated RCE endpoint
- **Section 9 (Injection Sources):** Details the insecure pickle deserialization vulnerability

**Priority for Testing:** The application has a single critical vulnerability: **insecure deserialization via pickle.loads() at POST /** that provides immediate Remote Code Execution without any authentication requirements.

## 1. Executive Summary

The XBEN-036-24 "Pickle CTF" application is a deliberately vulnerable educational challenge built with FastAPI (Python 3.9.24). The application presents a **CRITICAL security posture** characterized by:

1. **Complete absence of authentication and authorization** - all endpoints publicly accessible
2. **Critical insecure deserialization vulnerability** - `pickle.loads()` on user-uploaded files enables trivial Remote Code Execution
3. **No input validation or security controls** - zero middleware, no CSRF protection, no rate limiting

The attack surface consists of only **3 network-accessible endpoints**:
- `GET /` - Displays flag data (publicly accessible)
- `POST /` - Accepts file uploads and deserializes them with pickle (RCE vulnerability)
- `GET /ping` - Health check endpoint

The intended CTF solution involves exploiting the pickle deserialization vulnerability to execute code that deletes the `decoy.txt` file, causing the application to display the real flag from `flag.txt` instead of the decoy.

**Core Technology Stack:**
- **Backend:** FastAPI 0.116.0, Python 3.9.24, Uvicorn 0.35.0 (ASGI server), Gunicorn 23.0.0 (process manager)
- **Frontend:** HTML with Jinja2 templates, Bootstrap 4.3.1 (loaded from CDN)
- **Infrastructure:** Docker container (Debian-based), exposes port 80
- **Data Storage:** File-based (no database) - uses `flag.txt` and `decoy.txt`

## 2. Technology & Service Map

### Frontend
- **Framework:** HTML with Jinja2 3.1.6 templating engine
- **UI Library:** Bootstrap 4.3.1 (CSS/JS loaded from cdn.jsdelivr.net with SRI hashes)
- **JavaScript:** No custom JavaScript - only Bootstrap library
- **Authentication Libraries:** None

### Backend
- **Language:** Python 3.9.24 (security-only maintenance phase, EOL October 2025)
- **Framework:** FastAPI 0.116.0 (modern ASGI web framework)
- **ASGI Server:** Uvicorn 0.35.0
- **Process Manager:** Gunicorn 23.0.0
- **Template Engine:** Jinja2 3.1.6 (auto-escaping enabled by default for HTML)
- **Key Dependencies:** lxml 5.2.2 (installed but never used), Starlette 0.46.2, Pydantic 2.12.3
- **Dangerous Modules:** pickle (Python standard library - used unsafely at line 30 of main.py)

### Infrastructure
- **Hosting:** Docker container (tiangolo/uvicorn-gunicorn-fastapi:python3.9 base image)
- **Container OS:** Debian GNU/Linux 13 "Trixie"
- **Image Size:** ~1.19 GB (large attack surface compared to Alpine/distroless)
- **Exposed Port:** 80 (HTTP only, no HTTPS)
- **CDN:** cdn.jsdelivr.net (for Bootstrap CSS/JS)
- **Database Type:** None - file-based storage only

### Identified Subdomains
According to external subdomain enumeration from pre-recon, the following subdomains were discovered (though not directly related to this application):
- mail02.regency.localhost
- owa.regency.localhost
- exchvm.nwcnet.localhost
- fndlync01.5ninesdata.localhost
- www.localhost
- autodiscover.localhost
- mail.localhost
- (additional subdomains listed in pre-recon report)

**Note:** These subdomains appear to be from external DNS enumeration and are not directly part of this single-container CTF application.

### Open Ports & Services
From nmap scan on target host:
- **Port 80/tcp** - Caddy httpd (proxy/reverse proxy)
  - Proxies to the actual application on internal port
  - HTTP server header: "Caddy"
- **Port 443/tcp** - SSL/HTTPS (Caddy with TLS)
- **Port 631/tcp** - CUPS 2.3 (printing service, out of scope)
- **Port 49158/tcp** - Tailscale VPN service (out of scope)

**Application Exposure:**
- Target URL: `http://localhost:46849`
- The application runs inside a Docker container on port 80
- Externally accessible via Caddy reverse proxy on the mapped port

## 3. Authentication & Session Management Flow

### Authentication Entry Points
**NONE EXIST** - The application implements zero authentication mechanisms.

**Missing Endpoints:**
- ❌ No `/login` endpoint
- ❌ No `/register` or `/signup` endpoint
- ❌ No `/logout` endpoint
- ❌ No password reset endpoints
- ❌ No OAuth/SSO callback endpoints
- ❌ No token refresh endpoints
- ❌ No user profile endpoints

### Mechanism
**NOT APPLICABLE** - No authentication mechanism exists.

**Security Implications:**
- All 3 endpoints are publicly accessible to anonymous users
- No credential submission, token generation, or cookie setting occurs
- No authentication barrier protects the critical RCE vulnerability at `POST /`
- Attackers go directly from discovery to exploitation without authentication

### Code Pointers
**No authentication code exists.** The complete endpoint definitions are in:
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-036-24/app/main.py`
- **Lines 13-42:** All 3 endpoints with zero authentication decorators or middleware

**Missing Security Imports:**
```python
# NONE OF THESE EXIST IN THE APPLICATION:
# from fastapi.security import OAuth2PasswordBearer, HTTPBearer
# from fastapi import Depends, Security
# No JWT libraries (python-jose, pyjwt)
# No session middleware
# No authentication decorators
```

### 3.1 Role Assignment Process
**NOT APPLICABLE** - No role system exists.

- **Role Determination:** N/A - No user system
- **Default Role:** N/A - All requesters are anonymous
- **Role Upgrade Path:** N/A - No roles to upgrade
- **Code Implementation:** None

### 3.2 Privilege Storage & Validation
**NOT APPLICABLE** - No privilege system exists.

- **Storage Location:** N/A - No privileges stored
- **Validation Points:** N/A - No validation occurs
- **Cache/Session Persistence:** N/A - No sessions exist
- **Code Pointers:** None

### 3.3 Role Switching & Impersonation
**NOT APPLICABLE** - No role system exists.

- **Impersonation Features:** None
- **Role Switching:** None
- **Audit Trail:** No logging of security events
- **Code Implementation:** None

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are network-accessible via HTTP requests to `http://localhost:46849`.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | / | anon | None | None | **Displays flag data** - Returns HTML page showing either decoy or real flag depending on file existence. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-036-24/app/main.py:13-20` |
| POST | / | anon | None | None | **CRITICAL RCE VULNERABILITY** - Accepts pickle file upload and deserializes it with `pickle.loads()`. Enables Remote Code Execution. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-036-24/app/main.py:23-37`, specifically line 30 |
| GET | /ping | anon | None | None | **Health check** - Returns JSON `{"ping": "pong"}`. Used by Docker health check. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-036-24/app/main.py:40-42` |

**Auto-Generated Documentation Endpoints (FastAPI Default):**
| Method | Endpoint Path | Required Role | Description |
|--------|---------------|---------------|-------------|
| GET | /docs | anon | Swagger UI interactive API documentation (publicly accessible) |
| GET | /redoc | anon | ReDoc alternative API documentation (publicly accessible) |
| GET | /openapi.json | anon | Machine-readable OpenAPI 3.0 schema (publicly accessible) |

**Note:** The documentation endpoints are enabled by default in FastAPI and expose the complete API structure to attackers.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed are accessible through network requests to the deployed application.

### 5.1 URL Parameters
**NONE DEFINED** - The application does not explicitly parse or use URL query parameters.

While the FastAPI Request object provides access to query parameters via `request.query_params`, no application code reads or processes them.

### 5.2 POST Body Fields (JSON/Form)

#### File Upload Field (CRITICAL VULNERABILITY)
- **Field Name:** `pickle_file`
- **Content Type:** `multipart/form-data`
- **Data Type:** Binary file (any content accepted)
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-036-24/app/main.py:26`
- **Code:** `pickle_file: UploadFile = File(None)`
- **Validation:** ❌ NONE - No file type, size, or content validation
- **Dangerous Sink:** `pickle.loads(await pickle_file.read())` at line 30
- **Vulnerability:** CWE-502 Insecure Deserialization → Remote Code Execution
- **Exploitability:** Trivial - single POST request with malicious pickle payload

**Data Flow:**
```
User uploads file via POST /
    ↓
Line 26: pickle_file: UploadFile = File(None)
    ↓
Line 28: if pickle_file: (null check only)
    ↓
Line 30: await pickle_file.read() (reads raw bytes)
    ↓
Line 30: pickle.loads() ← CRITICAL SINK (RCE)
```

**HTML Form Reference:**
The file upload form is defined in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-036-24/app/templates/index.html:30-36`:
```html
<form action="/" method="post" enctype="multipart/form-data">
    <input type="file" class="form-control-file" id="pickle_file" name="pickle_file">
    <button type="submit" class="btn btn-primary">Upload pickle</button>
</form>
```

**Security Issues:**
- No CSRF token in form
- No file type restrictions
- No file size limits
- Accepts requests from any origin (no CORS protection)

### 5.3 HTTP Headers
**NOT EXPLICITLY USED** - While HTTP headers are accessible via the FastAPI Request object, no application code reads or processes custom headers.

Standard headers (User-Agent, Content-Type, etc.) are processed by the framework but not used in application logic.

### 5.4 Cookie Values
**NOT USED** - The application does not read or set any cookies.

- No session cookies
- No authentication cookies
- No tracking or preference cookies

## 6. Network & Interaction Map

**Network Surface Focus:** This map only includes components of the deployed, network-accessible application infrastructure.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External-User | ExternAsset | Internet | Browser | None | Anonymous external attacker/user |
| Caddy-Proxy | Service | Edge | Caddy httpd | Public | Reverse proxy on ports 80/443 |
| FastAPI-App | Service | App | Python/FastAPI | PII, Secrets | Main application backend (Uvicorn/Gunicorn) |
| Container-Filesystem | DataStore | Data | Ext4/Overlay | Secrets | File-based storage for flag.txt, decoy.txt |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| External-User | Type: Anonymous; Access: Full network access to all endpoints; Authentication: None required |
| Caddy-Proxy | Hosts: `http://localhost:46849`; Ports: `80 (HTTP), 443 (HTTPS)`; Purpose: Reverse proxy/load balancer; Config: Not accessible in application scope |
| FastAPI-App | Hosts: `http://localhost:80` (internal); Framework: `FastAPI 0.116.0`; Runtime: `Python 3.9.24`; Server: `Uvicorn 0.35.0 + Gunicorn 23.0.0`; Endpoints: `/`, `/ping`, `/docs`, `/redoc`, `/openapi.json`; Auth: None; Container: Docker (Debian-based); Dependencies: `lxml 5.2.2` (unused), pickle (dangerous) |
| Container-Filesystem | Engine: `Ext4/OverlayFS`; Exposure: `Application-internal only`; Consumers: `FastAPI-App`; Files: `flag.txt` (real flag), `decoy.txt` (fake flag); Secrets: Flag value injected at build time via Docker ARG |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External-User → Caddy-Proxy | HTTP/HTTPS | `:80, :443` | None | Public |
| Caddy-Proxy → FastAPI-App | HTTP | `:80 /` | None | Public, PII |
| Caddy-Proxy → FastAPI-App | HTTP | `:80 /ping` | None | Public |
| External-User → FastAPI-App | HTTP | `:80 POST /` (file upload) | None | Public, enables RCE |
| FastAPI-App → Container-Filesystem | File I/O | `decoy.txt`, `flag.txt` | None | Secrets |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | **This application has ZERO security guards** - all flows are unprotected |

**Note:** The complete absence of guards is the critical security finding. There are:
- No authentication guards
- No authorization guards  
- No network isolation guards
- No rate limiting guards
- No CORS restrictions
- No CSRF protection

## 7. Role & Privilege Architecture

**CRITICAL FINDING:** This application has **NO role or privilege system**.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon (anonymous) | 0 (all requesters) | Global | No implementation - default state for all requests |

**Note:** There is only one "role" - anonymous/unauthenticated access, which all requesters have by default.

### 7.2 Privilege Lattice

```
Privilege Ordering:
anon (everyone has identical access)

There is NO privilege hierarchy - all requesters have the same access level.
```

**Role Switching Mechanisms:** None exist.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|---------------------|
| anon | `/` | `/*` (all endpoints) | None |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | N/A |

**Code Evidence:**
The application initialization at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-036-24/app/main.py:8` shows no middleware:
```python
app = FastAPI()  # No middleware configured
```

No route decorators include authentication requirements:
```python
@app.get("/", response_class=HTMLResponse)  # No auth required
@app.post("/", response_class=HTMLResponse)  # No auth required
@app.get("/ping")  # No auth required
```

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**NOT APPLICABLE** - The application has no user system, no object ownership, and no multi-user data isolation.

All data (flag files) is shared across all anonymous requesters equally.

### 8.2 Vertical Privilege Escalation Candidates

**NOT APPLICABLE** - There are no privilege levels to escalate between.

However, the critical finding is that the **most dangerous endpoint** (`POST /` with RCE capability) is **publicly accessible without any authentication**:

| Target Role | Endpoint Pattern | Functionality | Risk Level | Issue |
|-------------|------------------|---------------|------------|-------|
| N/A (should be admin) | `POST /` | File upload → Deserialization → RCE | **CRITICAL** | **No authentication required for RCE** |

In a properly designed system:
- File upload would require authentication
- Dangerous operations (deserialization) would require admin privileges
- Pickle deserialization would never be used on untrusted input

In this application:
- ❌ No authentication required
- ❌ No authorization checks
- ❌ Direct anonymous access to RCE vulnerability

### 8.3 Context-Based Authorization Candidates

**NOT APPLICABLE** - No multi-step workflows or state-based operations exist.

The application is stateless with no workflow validation.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable via network requests to the deployed application are reported.

### 9.1 Insecure Deserialization → Remote Code Execution (CRITICAL)

**Classification:** While not traditional "command injection" or "SQL injection", insecure deserialization is a critical injection vulnerability class that leads directly to Remote Code Execution.

**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-036-24/app/main.py`  
**Line Number:** 30

**Complete Data Flow:**
```
Network Request: POST / with multipart/form-data
    ↓
Input Parameter: pickle_file (file upload field)
    ↓
Line 26: pickle_file: UploadFile = File(None)
    ↓
Line 28: if pickle_file: (conditional check)
    ↓
Line 30: content = await pickle_file.read() (read raw bytes)
    ↓
Line 30: pickle.loads(content) ← DANGEROUS SINK
    ↓
Arbitrary Python code execution during deserialization
```

**Vulnerable Code Snippet:**
```python
@app.post("/", response_class=HTMLResponse)
async def update_profile(
        request: Request,
        pickle_file: UploadFile = File(None)
):
    if pickle_file:
        print('Loading pickle file')
        pickle.loads(await pickle_file.read())  # LINE 30 - CRITICAL VULNERABILITY
```

**Input Validation:** ❌ NONE
- No file type checking
- No file size limits
- No content validation
- No signature verification
- No sandboxing

**Vulnerability Details:**
- **CWE:** CWE-502 (Deserialization of Untrusted Data)
- **CVSS:** 10.0 (Critical)
- **Impact:** Remote Code Execution with application privileges
- **Privileges Required:** None (unauthenticated)
- **Attack Complexity:** Low (trivial exploitation)

**Exploitation Path:**
An attacker can craft a malicious pickle payload that executes arbitrary Python code:
```python
import pickle
import os

class Exploit:
    def __reduce__(self):
        # This code executes during pickle.loads()
        return (os.system, ('rm decoy.txt',))  # Delete decoy file

malicious_payload = pickle.dumps(Exploit())
# Upload this via POST / → code executes → decoy.txt deleted
```

**Post-Exploitation Capabilities:**
- File system access (read/write/delete)
- Network connections (SSRF, reverse shells)
- Environment variable access
- Process manipulation
- Data exfiltration

### 9.2 Command Injection Sources
**NONE FOUND** - The application does not execute shell commands with user input.

**Searched for:**
- `os.system()` with user input - NOT FOUND
- `os.popen()` with user input - NOT FOUND
- `subprocess.call()`, `subprocess.Popen()`, `subprocess.run()` with user input - NOT FOUND
- Shell command construction from user data - NOT FOUND

**File Operations (Not Command Injection):**
The application uses `os.path.exists()` and `open()` but with **hardcoded paths only**:
```python
# Lines 15-18, 32-35 - NOT vulnerable (hardcoded paths)
if os.path.exists('decoy.txt'):
    flag = open('decoy.txt').read()
else:
    flag = open('flag.txt').read()
```

These are not command injection sinks because:
- No user input reaches the file paths
- Paths are static strings
- No shell commands are executed

### 9.3 SQL Injection Sources
**NONE FOUND** - The application has no database integration.

**Searched for:**
- Database imports (sqlite3, psycopg2, mysql.connector, pymongo) - NOT FOUND
- ORM usage (SQLAlchemy, Django ORM, Tortoise) - NOT FOUND
- Raw SQL query construction - NOT FOUND
- Database connection strings - NOT FOUND

**Data Storage:** File-based only (`flag.txt`, `decoy.txt`)

### 9.4 Summary of Injection Sources

| Injection Type | Found | File Path | Line | Severity | Exploitable |
|----------------|-------|-----------|------|----------|-------------|
| Insecure Deserialization (Pickle) | ✅ YES | /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-036-24/app/main.py | 30 | CRITICAL | YES |
| Command Injection | ❌ NO | N/A | N/A | N/A | N/A |
| SQL Injection | ❌ NO | N/A | N/A | N/A | N/A |
| Template Injection | ❌ NO | N/A | N/A | N/A | N/A |
| Code Injection (eval/exec) | ❌ NO | N/A | N/A | N/A | N/A |

**Critical Finding:** The single insecure deserialization vulnerability is sufficient for complete system compromise via Remote Code Execution.

---

## Additional Security Findings

### XSS Protection
**ADEQUATE** - Jinja2 auto-escaping is enabled by default for HTML templates. The only user-facing output (`{{ flag }}`) is properly escaped, preventing XSS even if the flag contained malicious JavaScript.

### SSRF Sinks
**NONE FOUND** - The application makes no outbound HTTP requests and has no URL-based operations that could be exploited for SSRF.

### CSRF Protection
**ABSENT** - The file upload form at `POST /` has no CSRF tokens, enabling cross-site request forgery attacks.

### Security Headers
**ABSENT** - No security headers configured:
- ❌ No Content-Security-Policy
- ❌ No X-Frame-Options
- ❌ No X-Content-Type-Options
- ❌ No Strict-Transport-Security
- ❌ No Referrer-Policy

### Rate Limiting
**ABSENT** - No rate limiting on any endpoints, enabling:
- Unlimited RCE exploitation attempts
- Denial of service attacks via large file uploads
- Automated flag harvesting

### Logging & Monitoring
**MINIMAL** - Only one log statement exists: `print('Loading pickle file')` at line 29, which provides no security context (no IP, timestamp, file size, or filename).

---

## Conclusion

The XBEN-036-24 "Pickle CTF" application presents an **extremely vulnerable attack surface** with a clear exploitation path:

1. **Reconnaissance:** Trivial - 3 public endpoints, auto-generated API docs at `/docs`
2. **Exploitation:** Trivial - Upload malicious pickle to `POST /` for immediate RCE
3. **Post-Exploitation:** Delete `decoy.txt` to expose real flag via `GET /`

**Total time to compromise:** < 60 seconds  
**Authentication barriers:** Zero  
**Critical vulnerabilities:** 1 (insecure deserialization → RCE)  
**CVSS Score:** 10.0 (Critical)

This application serves as an educational example of catastrophic security failures:
- Complete absence of authentication/authorization
- Insecure deserialization of untrusted data
- No input validation or security controls
- No defense-in-depth architecture