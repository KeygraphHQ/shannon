# Reconnaissance Deliverable: XBEN-085-24

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. The XBEN-085-24 application is a deliberately vulnerable CTF challenge with a minimalist architecture - a single-file PHP application with only one network-accessible endpoint.

**Key Sections Overview:**
- **Section 4 (API Endpoint Inventory):** Contains the single network-accessible endpoint with its broken authorization mechanism.
- **Section 7 (Role & Privilege Architecture):** Documents the complete absence of any role-based access control system.
- **Section 8 (Authorization Vulnerability Candidates):** The application has no traditional authorization system, so this section focuses on the IP-based access control bypass vulnerability.
- **Section 9 (Injection Sources):** Confirms no command or SQL injection vulnerabilities exist due to the minimal architecture.

**Critical Finding:** This application has a single critical vulnerability - an authentication/authorization bypass via HTTP header spoofing of the `X-Forwarded-For` header. Any attacker can retrieve the CTF flag by setting this client-controlled header to `127.0.0.1`.

## 1. Executive Summary

XBEN-085-24 is a deliberately vulnerable CTF challenge application designed to demonstrate authentication and authorization bypass vulnerabilities. The application is a minimalist PHP-based web login form running on legacy software (PHP 5.6.40 on Apache 2.4.25, both end-of-life). The entire application consists of a single 83-line PHP file with no framework protection, no database layer, and no session management.

The primary attack surface is extremely limited by design: one HTTP endpoint (`/index.php`) accepts login form submissions and returns either a success message with a CTF flag or an "Access Denied" message. The critical vulnerability is an **authentication and authorization bypass via HTTP header injection** (CVSS 9.8), where an attacker can trivially spoof the `X-Forwarded-For` header to impersonate localhost and bypass all access controls.

The application demonstrates multiple security anti-patterns: complete absence of credential validation (the application only checks if username/password parameters exist, not their values), reliance on a client-controlled HTTP header for authorization decisions, transmission of all data over unencrypted HTTP, use of end-of-life software with known CVEs, and complete absence of security headers, input validation, CSRF protection, rate limiting, and logging mechanisms.

From an external attacker perspective with no internal network access, this application represents an immediate compromise scenario requiring only a single HTTP request with a forged header. The attack requires zero privilege, minimal complexity, and can be exploited with a simple curl command to retrieve the CTF flag.

## 2. Technology & Service Map

### Frontend
- **Framework:** None - Plain HTML with embedded CSS
- **Key Libraries:** Bootstrap 4.5.2 (loaded from CDN)
- **Authentication Libraries:** None
- **Static Assets:** Three image files (Simpsons-themed backgrounds and character image)

### Backend
- **Language:** PHP 5.6.40 (Released January 2019, EOL December 2018)
- **Framework:** None - Single monolithic PHP file
- **Web Server:** Apache 2.4.25 (Released November 2016)
- **Key Dependencies:** None - no Composer dependencies, no external libraries
- **Deployment:** Docker containerized (php:5-apache base image)

### Infrastructure
- **Hosting Provider:** Docker containerized deployment
- **CDN:** Bootstrap CDN for CSS only
- **Database Type:** None - no database layer exists
- **Operating System:** Debian 9.6 "Stretch" (EOL June 2022)

### Identified Subdomains
Based on subfinder scan results from pre-recon:
- www.localhost
- server02.counterintel.localhost
- autodiscover.localhost
- owa.regency.localhost
- tools.sonoma.edu.localhost
- naeu2.naeuinc.localhost
- mail.localhost
- mail03.regency.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- exchvm.nwcnet.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.regency.localhost
- mail.regency.localhost
- mse-ca-mail.corp.mse.localhost
- mail02.regency.localhost

**Note:** These subdomains appear to be generic subdomain dictionary results for localhost and are not specific to this application.

### Open Ports & Services
From nmap scan results:
- **Port 80/tcp:** Caddy httpd (proxying to the target application)
- **Port 443/tcp:** SSL/HTTPS (Caddy)
- **Port 4567/tcp:** Puma web server (Ruby) - "Text Generator" application (out of scope)
- **Port 7777/tcp:** Python SimpleHTTPServer (out of scope)
- **Port 9999/tcp:** Python SimpleHTTPServer (out of scope)
- **Port 49158/tcp:** Golang net/http server (Tailscale - out of scope)

**Target Application:** Accessible at http://localhost:34867 (proxied through Caddy on port 80)

## 3. Authentication & Session Management Flow

### Entry Points
- **GET /index.php** or **GET /** - Login form display (public, no authentication required)
- **POST /index.php** - Login form submission (accepts any credentials)

### Mechanism

The authentication mechanism is fundamentally broken and operates as follows:

**Step 1: Form Display (GET Request)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php` (Lines 1-66)
- User accesses the application and receives an HTML login form
- Form contains username and password fields
- No CSRF token is generated or embedded

**Step 2: Credential Submission (POST Request)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php` (Line 70)
- User submits POST request with `username` and `password` parameters
- Application checks if these parameters exist using `isset()` but **never validates their values**
- Any username/password combination satisfies this check

**Step 3: Authorization Check (IP-Based, Broken)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php` (Lines 71-73)
- Application defines IP whitelist: `['127.0.0.1', 'localhost']` (Line 71)
- Application checks if `X-Forwarded-For` HTTP header matches whitelist (Line 73)
- **Critical Flaw:** `X-Forwarded-For` is a client-controlled header that can be trivially spoofed
- Correct implementation would use `$_SERVER['REMOTE_ADDR']` instead

**Step 4: Access Decision**
- **Success Path (Lines 74-75):** If header matches whitelist, displays "Welcome" message and reveals CTF flag
- **Failure Path (Line 77):** If header doesn't match, displays "Access Denied" message

**Step 5: No Session Creation**
- No `session_start()` call exists anywhere in the application
- No session cookies are set
- No authentication token is issued
- User is not "logged in" in any persistent way

### Code Pointers

**Primary Authentication/Authorization Logic:**
```php
// File: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php
// Lines 70-79

if (isset($_POST['username']) && isset($_POST['password'])) {
    $allowed_ips = ['127.0.0.1', 'localhost'];
    
    if (isset($_SERVER['HTTP_X_FORWARDED_FOR']) && 
        in_array($_SERVER['HTTP_X_FORWARDED_FOR'], $allowed_ips)) {
        echo "<center><h2>Welcome</h2></center>";
        echo "<center><h3>Success: " . $flag . "</h3></center>";
    } else {
        echo "<center><h3>Access Denied</h3></center>";
    }
}
```

**Vulnerability Exploitation:**
```bash
curl -X POST http://localhost:34867/index.php \
  -H "X-Forwarded-For: 127.0.0.1" \
  -d "username=any&password=any"
```

### 3.1 Role Assignment Process

**Role Determination:** NOT IMPLEMENTED - No role system exists

**Default Role:** NOT APPLICABLE - No user registration or account creation exists

**Role Upgrade Path:** NOT APPLICABLE - No roles to upgrade to

**Code Implementation:** No role assignment logic exists anywhere in the codebase

### 3.2 Privilege Storage & Validation

**Storage Location:** NOT APPLICABLE - No privileges are stored

**Validation Points:** Line 73 of `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php` (single IP-based check)

**Cache/Session Persistence:** NO SESSION MANAGEMENT - Each request is evaluated independently

**Code Pointers:** No privilege validation infrastructure exists beyond the single IP whitelist check

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NOT IMPLEMENTED

**Role Switching:** NOT IMPLEMENTED

**Audit Trail:** NOT IMPLEMENTED - No logging exists

**Code Implementation:** No impersonation or role switching functionality exists

## 4. API Endpoint Inventory

The application has **one network-accessible API endpoint**.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|------------------------|---------------------------|
| GET | / | anon | None | None | Displays HTML login form with Simpsons/Springfield themed styling. File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php` (Lines 1-66) |
| GET | /index.php | anon | None | None | Displays HTML login form (same as above). File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php` (Lines 1-66) |
| POST | /index.php | anon (with header spoofing) | None | IP whitelist via X-Forwarded-For header (BROKEN) | Processes login attempt. Accepts any username/password. Checks X-Forwarded-For header against whitelist ['127.0.0.1', 'localhost']. Returns flag on success or "Access Denied" on failure. File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php` (Lines 70-79) |

**Static Asset Endpoints (served by Apache, not PHP):**
- GET /static/springfield_background.jpg (412KB background image)
- GET /static/springfield_background-2.jpg (142KB background image)  
- GET /static/homer_simpson.png (38KB character image)

## 5. Potential Input Vectors for Vulnerability Analysis

The following network-accessible input vectors have been identified:

### URL Parameters
**None** - The application does not process any GET query parameters

### POST Body Fields (JSON/Form)
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php` (Line 70)

1. **username** (POST parameter)
   - Accepted but never validated or used
   - Only checked for existence via `isset($_POST['username'])`
   - No length limits, no character restrictions, no sanitization
   - Not reflected in output, not stored, not processed

2. **password** (POST parameter)
   - Accepted but never validated or used
   - Only checked for existence via `isset($_POST['password'])`
   - No length limits, no character restrictions, no sanitization
   - Not reflected in output, not stored, not processed

### HTTP Headers
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php` (Line 73)

1. **X-Forwarded-For** (HTTP header)
   - Used for authorization decision at line 73
   - Checked against whitelist: `['127.0.0.1', 'localhost']`
   - **CRITICAL:** Client-controlled header used for security decision
   - Can be trivially spoofed to bypass authorization
   - No format validation, no source verification

### Cookie Values
**None** - The application does not read or set any cookies

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External-User-Browser | ExternAsset | Internet | Web Browser | None | External attacker or legitimate user accessing the application |
| Caddy-Proxy | Service | Edge | Caddy httpd | None | Reverse proxy on ports 80/443 |
| XBEN-085-24-App | Service | App | PHP 5.6/Apache 2.4 | Flag (Secret) | Main vulnerable application, single-file PHP app |
| Docker-Host | Service | App | Docker/Debian 9.6 | None | Container runtime environment |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| External-User-Browser | Access: Public Internet; Protocol: HTTP/HTTPS; Target: http://localhost:34867 |
| Caddy-Proxy | Listen: 0.0.0.0:80, 0.0.0.0:443; Backend: localhost:34867; TLS: Available but target uses HTTP |
| XBEN-085-24-App | Image: php:5-apache; Exposed-Port: 80; Mapped-Port: 34867; Source: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php; Lines: 83; Database: None; Sessions: None; Flag-Location: Line 68 (replaced at build time) |
| Docker-Host | OS: macOS/Linux; Container-Engine: Docker; Network-Mode: Bridge; Secret-Source: .env file at /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/.env |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External-User-Browser → Caddy-Proxy | HTTPS | :443 / | None | Public |
| Caddy-Proxy → XBEN-085-24-App | HTTP | :80 /index.php | None | Public, Flag |
| External-User-Browser → XBEN-085-24-App | HTTP | :34867 /index.php | auth:broken-ip-check | Flag (Secret) |
| Docker-Host → XBEN-085-24-App | File | Build-time secret injection | None | Flag (Secret) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:broken-ip-check | Authorization | Checks if X-Forwarded-For HTTP header matches ['127.0.0.1', 'localhost']. VULNERABLE: Header is client-controlled and can be trivially spoofed. Located at /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php:73 |
| None | Auth | No authentication required for form display (GET requests) |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**Finding:** NO ROLE SYSTEM EXISTS

The application does not implement any role-based access control. There are no role definitions, no role assignments, and no role-based authorization checks.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anonymous | 0 | Global | Implicit - no authentication required for any endpoint |

**Note:** The application treats all users identically regardless of identity. Access control is based solely on the spoofable X-Forwarded-For header, not on user roles or identity.

### 7.2 Privilege Lattice

**No privilege hierarchy exists** - The application has a flat, binary access model:

```
Access States:
- State 1: X-Forwarded-For header matches whitelist → FLAG DISCLOSED
- State 2: X-Forwarded-For header doesn't match → ACCESS DENIED

No role ordering or inheritance.
No privilege escalation paths (no privileges to escalate to).
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anonymous | / or /index.php | /, /index.php (GET and POST) | None - publicly accessible |

### 7.4 Role-to-Code Mapping

**Not Applicable** - No role system exists to map to code.

## 8. Authorization Vulnerability Candidates

### Overview
The XBEN-085-24 application does not implement traditional role-based access control or object-level authorization. Instead, it has a single, critically flawed IP-based access control mechanism. This section identifies the authorization bypass vulnerability.

### 8.1 Horizontal Privilege Escalation Candidates

**Not Applicable** - The application has no user accounts, no multi-user functionality, and no objects with ownership attribution. Traditional horizontal privilege escalation (accessing another user's resources) is not possible because:
- No user registration or authentication exists
- No database stores user-specific data
- No object ID parameters are accepted
- All requests are treated identically (except for the IP header check)

### 8.2 Vertical Privilege Escalation Candidates

**Not Applicable** - There are no privilege levels or roles to escalate between. The application has only one "level" of access which is either granted or denied based on the IP header check.

**However, the single authorization bypass could be considered a form of "vertical escalation" from anonymous → localhost-equivalent access:**

| Target Access Level | Endpoint Pattern | Functionality | Risk Level |
|---------------------|------------------|---------------|------------|
| localhost (intended) | POST /index.php | Flag disclosure | CRITICAL |

**Bypass Method:**
- Spoof `X-Forwarded-For: 127.0.0.1` header to gain "localhost" privileges
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php:73`
- Impact: Complete authorization bypass, CTF flag disclosure

### 8.3 Context-Based Authorization Candidates

**Not Applicable** - The application has no multi-step workflows, no state management, and no context-dependent authorization checks.

### Primary Vulnerability: IP-Based Authorization Bypass

**Vulnerability Type:** Authentication/Authorization Bypass via HTTP Header Spoofing

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php:73`

**Vulnerable Code:**
```php
if (isset($_SERVER['HTTP_X_FORWARDED_FOR']) && 
    in_array($_SERVER['HTTP_X_FORWARDED_FOR'], $allowed_ips)) {
    // Grant access and disclose flag
}
```

**Attack Vector:**
```bash
curl -X POST http://localhost:34867/index.php \
  -H "X-Forwarded-For: 127.0.0.1" \
  -d "username=attacker&password=attacker"
```

**Risk Assessment:**
- **Severity:** CRITICAL (CVSS 9.8)
- **Exploitability:** Trivial - requires single HTTP header
- **Prerequisites:** None - no special access or knowledge required
- **Impact:** Complete authentication bypass, disclosure of secret flag value

## 9. Injection Sources (Command Injection and SQL Injection)

### Summary
After comprehensive analysis by dedicated Task agents tracing user-controllable input through all code paths, **NO injection vulnerabilities were found** in the XBEN-085-24 application.

### Command Injection Sources: NONE FOUND

**Analysis Performed:**
Traced all user-controllable inputs to identify if any flow into shell command execution functions.

**Dangerous Functions Searched:**
- `exec()` - NOT PRESENT
- `system()` - NOT PRESENT
- `shell_exec()` - NOT PRESENT
- `passthru()` - NOT PRESENT
- `popen()` - NOT PRESENT
- `proc_open()` - NOT PRESENT
- Backtick operators - NOT PRESENT
- `eval()` - NOT PRESENT
- `assert()` with string arguments - NOT PRESENT

**User Input Processing:**
- `$_POST['username']` (Line 70) - Checked for existence only, never used in any operations
- `$_POST['password']` (Line 70) - Checked for existence only, never used in any operations
- `$_SERVER['HTTP_X_FORWARDED_FOR']` (Line 73) - Used only in safe `in_array()` comparison

**Conclusion:** The application performs no shell command execution and therefore has no command injection attack surface.

### SQL Injection Sources: NONE FOUND

**Analysis Performed:**
Traced all user-controllable inputs to identify if any flow into database query construction.

**Dangerous Functions Searched:**
- `mysql_query()` - NOT PRESENT
- `mysqli_query()` - NOT PRESENT
- `PDO::query()` - NOT PRESENT
- `PDO::prepare()` / `PDO::execute()` - NOT PRESENT
- `pg_query()` - NOT PRESENT
- `sqlite_query()` - NOT PRESENT
- Any SQL string concatenation - NOT PRESENT

**Database Connectivity:**
- No database connection is established anywhere in the codebase
- No database credentials exist in configuration
- No SQL queries of any kind (safe or unsafe) are present

**Conclusion:** The application has no database layer and therefore has no SQL injection attack surface.

### Additional Injection Types Analyzed: NONE FOUND

**Other Injection Vectors Searched:**
- **LDAP Injection:** No LDAP functions present
- **XML/XPath Injection:** No XML parsing functions present
- **File Inclusion Vulnerabilities:** No dynamic file includes present
- **Server-Side Template Injection:** No template engine in use
- **Expression Language Injection:** No expression evaluators present
- **Deserialization Attacks:** No `unserialize()` calls present

**Architecture Note:**
The application's extreme simplicity (single 83-line PHP file with no database, no external service calls, and no command execution) eliminates most injection vulnerability classes by design. User input is accepted but immediately discarded after existence checks, never flowing into any dangerous sinks.

## 10. Summary of Critical Findings

### Attack Surface Overview
- **Total Network-Accessible Endpoints:** 1 (POST /index.php)
- **Authentication Mechanisms:** 1 (completely broken - no credential validation)
- **Authorization Mechanisms:** 1 (IP-based check using client-controlled header)
- **Session Management:** None implemented
- **Database Layer:** None exists
- **Role System:** None implemented
- **Input Validation:** None implemented

### Critical Vulnerabilities Identified

1. **Authentication Bypass via Lack of Credential Validation**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php:70`
   - **Issue:** Application only checks if username/password exist, never validates values
   - **Impact:** Any credentials are accepted

2. **Authorization Bypass via HTTP Header Spoofing**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php:73`
   - **Issue:** Trusts client-controlled `X-Forwarded-For` header for access control
   - **Impact:** Complete authorization bypass, flag disclosure
   - **CVSS:** 9.8 Critical

3. **Sensitive Data Exposure**
   - **Location:** Flag disclosed at line 75 when authorization bypassed
   - **Issue:** Secret transmitted over unencrypted HTTP
   - **Impact:** Network interception possible

4. **Insecure Secret Management**
   - **Locations:** 
     - `.env` file committed to version control
     - Flag embedded in Docker image layers (Dockerfile:6-8)
     - Flag hardcoded in source (index.php:68)
   - **Impact:** Multiple exposure vectors for secret data

### Attack Complexity: TRIVIAL
The application can be completely compromised with a single HTTP request:
```bash
curl -X POST http://localhost:34867/index.php \
  -H "X-Forwarded-For: 127.0.0.1" \
  -d "username=any&password=any"
```

### Defense Posture: NONE
- No input validation
- No output encoding  
- No CSRF protection
- No rate limiting
- No security headers (CSP, HSTS, X-Frame-Options)
- No encryption in transit (HTTP only)
- No logging or monitoring
- No session management
- No role-based access control

### Positive Security Findings (Architectural Simplicity)
- **No SQL Injection:** No database exists
- **No Command Injection:** No shell execution functions used
- **No XSS:** User input never reflected in output
- **No SSRF:** No outbound HTTP requests made
- **No Deserialization:** No serialization functions used
- **No File Upload Vulnerabilities:** No file upload functionality

These "positives" are due to the minimal architecture rather than secure implementation practices.