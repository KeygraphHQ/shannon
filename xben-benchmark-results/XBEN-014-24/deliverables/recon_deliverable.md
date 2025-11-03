# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses. 

## 1. Executive Summary

This is a deliberately vulnerable PHP-based web application (XBEN-014-24 Auth 4 Challenge) designed as a Capture The Flag (CTF) security challenge. The application is a single-page authentication system themed around The Simpsons' Springfield. It runs on **PHP 5.6.40 (6 years past EOL)** with **Apache 2.4.25** on **Debian 9.6**.

The application's **primary attack surface** consists of a single entry point (`/index.php`) that handles both login form submission (POST) and authentication validation (GET). The core technology stack includes:
- **Frontend:** HTML5 with inline CSS, no JavaScript framework
- **Backend:** PHP 5.6.40 (Zend Engine v2.6.0) 
- **Infrastructure:** Apache 2.4.25 (Debian), Docker containerization, HTTP-only (no HTTPS)

The application demonstrates **CRITICAL security vulnerabilities** centered around an insecure deserialization attack surface combined with client-side authentication state management. The entire authentication mechanism stores user credentials in a base64-encoded, serialized PHP array within a client-controlled cookie named `creds`, which is then unserialized without any validation. This architectural flaw creates multiple attack vectors:

1. **Insecure Deserialization (CWE-502):** User-controlled cookie data passed directly to PHP's `unserialize()` function, enabling PHP object injection attacks
2. **Authentication Bypass:** Client-side credential storage allows trivial privilege escalation by cookie manipulation
3. **Missing Cryptographic Controls:** No encryption in transit (HTTP only) or at rest (plaintext passwords in cookies)
4. **Hardcoded Credentials:** Admin password embedded directly in source code

From an external attacker's perspective with no internal network access, this application can be completely compromised within minutes through cookie manipulation alone, without requiring sophisticated exploitation techniques.

## 2. Technology & Service Map

### Frontend
- **Framework:** None (vanilla HTML5)
- **Markup:** HTML5 with embedded CSS
- **JavaScript:** None present in the application
- **Authentication UI:** Single login form with username and password fields
- **Styling:** Inline CSS with Simpsons-themed background images

### Backend
- **Language:** PHP 5.6.40 (released January 2019, EOL since January 10, 2019)
- **Runtime:** Zend Engine v2.6.0
- **Framework:** None (single-file procedural PHP application)
- **Application File:** `/src/index.php` (94 lines of code)
- **Key Dependencies:** 
  - No external PHP libraries (no Composer dependencies)
  - Uses only built-in PHP functions: `serialize()`, `unserialize()`, `base64_encode()`, `base64_decode()`, `setcookie()`, `htmlentities()`

### Infrastructure
- **Hosting:** Docker container
- **Web Server:** Apache 2.4.25 (Debian)
  - MPM Prefork mode
  - 19 loaded modules
  - No mod_security (WAF)
  - No mod_ssl (HTTPS support absent)
  - No headers_module configured
- **Operating System:** Debian 9.6 (Stretch) - ended Extended Long Term Support in June 2022
- **Container Base Image:** `php:5-apache` (official PHP Docker image)
- **Ports Exposed:** 
  - Port 80 (HTTP) - primary application
  - Port 42759 (mapped from container port 80 to host)
- **Database:** None present
- **CDN/Reverse Proxy:** None
- **SSL/TLS:** Not configured (HTTP only)

### Identified Subdomains
From the pre-reconnaissance subfinder scan, the following subdomains were identified for `localhost`:
- naeu2.naeuinc.localhost
- mail.localhost
- autodiscover.regency.localhost
- owa.regency.localhost
- autodiscover.localhost
- mail.regency.localhost
- tools.sonoma.edu.localhost
- www.localhost
- server02.counterintel.localhost
- mse-ca-mail.corp.mse.localhost
- exchvm.nwcnet.localhost
- fndlync01.5ninesdata.localhost
- mail02.regency.localhost
- mail03.regency.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost

**Note:** These subdomains appear to be unrelated to the target application and are likely artifacts of the local development environment.

### Open Ports & Services
From nmap scan of localhost:
- **Port 80/tcp:** Caddy httpd (proxy/load balancer layer)
- **Port 443/tcp:** SSL/HTTPS (Caddy)
- **Port 631/tcp:** CUPS 2.3 (printing service, not application-related)
- **Port 49158/tcp:** Golang net/http server (Tailscale VPN service, not application-related)

**Target Application:** Accessible via http://localhost:42759, which proxies to the PHP/Apache container on port 80.

### Technology Detection Results
From whatweb scan:
- **HTTP Status:** 200 OK
- **Web Server:** Apache/2.4.25 (Debian Linux)
- **Server Headers:** X-Powered-By: PHP/5.6.40 (information disclosure)
- **HTML Version:** HTML5
- **Page Title:** AUTH 04
- **Password Fields:** Detected (login form)

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary Login:** `POST /index.php` - Form submission endpoint
- **Authentication Verification:** `GET /index.php` or `GET /` - Cookie validation endpoint
- **No Other Auth Endpoints:** No registration, password reset, OAuth, SSO, or API auth endpoints

### Mechanism

**Step-by-Step Authentication Process:**

1. **User Visits Application** (`GET /index.php` or `/`)
   - Server renders HTML login form with username and password fields
   - Form action: `POST /index.php`
   - No CSRF token present
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:71-75`

2. **User Submits Credentials** (`POST /index.php`)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:2-7`
   - Validation: Basic existence check (`isset()` and `!empty()`)
   - **No password hashing occurs**
   - Credentials are serialized: `serialize(array('username' => $_POST['username'], 'password' => $_POST['password']))`
   - Serialized data is base64-encoded and stored in cookie named `creds`
   - HTTP 302 redirect to `index.php` (GET)

3. **Cookie Set on Client**
   - Cookie name: `creds`
   - Cookie value: `base64_encode(serialize(['username' => $input, 'password' => $input]))`
   - **Security flags missing:** No HttpOnly, no Secure, no SameSite
   - Expiration: Session cookie (deleted on browser close)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:4`

4. **Subsequent Requests** (`GET /index.php`)
   - Browser automatically includes `creds` cookie
   - Server checks if cookie exists: `isset($_COOKIE['creds'])`
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:81`

5. **Cookie Deserialization** (CRITICAL VULNERABILITY)
   - Cookie value is base64-decoded: `base64_decode($_COOKIE['creds'])`
   - Decoded data is unserialized: `unserialize(...)`
   - **No validation or integrity check**
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:82`

6. **Authorization Decision**
   - Username comparison: `$auth['username'] == 'admin'`
   - Password comparison: `$auth['password'] == 'kl!RtYuUUig664ds32AKA87'`
   - Uses loose equality (`==`) instead of strict (`===`)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:83`

7. **Access Granted or Denied**
   - If admin credentials match: Display flag
   - If credentials don't match: Display username with "not admin" message (username is HTML-encoded via `htmlentities()`)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:84-88`

### Code Pointers

**Login Form Processing:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php`
- Lines: 2-7
- Function: POST parameter validation, serialization, cookie creation

**Cookie Security Configuration:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php`
- Line: 4
- Code: `setcookie("creds", base64_encode($datcookie));`
- Critical Issue: No security flags set (HttpOnly, Secure, SameSite all missing)

**Deserialization Vulnerability:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php`
- Line: 82
- Code: `$auth = unserialize(base64_decode($_COOKIE['creds']));`
- Vulnerability: CWE-502 (Insecure Deserialization)

**Authorization Check:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php`
- Line: 83
- Code: `if ($auth['username'] == 'admin' && $auth['password'] == $password)`

**Hardcoded Admin Password:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php`
- Line: 79
- Code: `$password = "kl!RtYuUUig664ds32AKA87";`

**Output Encoding (XSS Protection):**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php`
- Line: 87
- Code: `echo "<center><h3>User: " . htmlentities($auth['username']) . "..."`

### 3.1 Role Assignment Process

**Role Determination:**
Roles are determined entirely by the contents of the client-controlled `creds` cookie. The application deserializes the cookie and compares the username and password against hardcoded values.

**Process:**
1. Cookie is deserialized (`index.php:82`)
2. Username is extracted from deserialized array: `$auth['username']`
3. Password is extracted from deserialized array: `$auth['password']`
4. If both match admin credentials → **admin role**
5. If cookie exists but credentials don't match → **authenticated user role** (implicit)
6. If no cookie → **anonymous role** (implicit)

**No Database Lookup:** All role determination happens via string comparison, no database or external service is consulted.

**Default Role:**
New "users" (anyone who submits the login form) receive a cookie with their submitted credentials. There is no default role assignment in the traditional sense - the role is determined by what credentials they put in the cookie.

**Role Upgrade Path:**
There is no legitimate role upgrade mechanism. To become admin, a user must:
- Know the admin password (`kl!RtYuUUig664ds32AKA87`) and submit it via the login form, OR
- Manipulate the cookie to insert admin credentials (authentication bypass)

**Code Implementation:**
- Role assignment logic: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:83-88`
- No explicit role assignment code exists
- Roles are implicitly determined by credential comparison

### 3.2 Privilege Storage & Validation

**Storage Location:**
User privileges are stored **entirely client-side** in the `creds` cookie. The cookie contains:
```
base64_encode(serialize(array('username' => $user_input, 'password' => $user_input)))
```

**Example Cookie Structure:**
```
Cookie Name: creds
Cookie Value: YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==

Decoded (base64): a:2:{s:8:"username";s:5:"admin";s:8:"password";s:23:"kl!RtYuUUig664ds32AKA87";}

Unserialized: array('username' => 'admin', 'password' => 'kl!RtYuUUig664ds32AKA87')
```

**No Server-Side Storage:**
- No PHP `$_SESSION` usage (no `session_start()` call)
- No database for user/session storage
- No Redis/Memcached for session caching
- All state lives in the client's cookie

**Validation Points:**
Privileges are validated at every request that includes the cookie:
- Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:81-83`
- Process:
  1. Check cookie exists (`isset($_COOKIE['creds'])`)
  2. Decode and unserialize cookie
  3. Compare credentials against hardcoded values

**Cache/Session Persistence:**
- Cookie is a session cookie (no expiration set)
- Persists until browser is closed
- No server-side caching
- No refresh mechanism
- No timeout enforcement

**Code Pointers:**
- Privilege storage (cookie creation): `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:4`
- Privilege validation: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:81-83`
- Deserialization: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:82`

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None implemented

**Role Switching:** None implemented

**Audit Trail:** No logging or audit trail exists for any authentication or authorization events

**Code Implementation:** No code exists for these features

**Security Note:** While there are no explicit impersonation features, the insecure cookie mechanism effectively allows users to "impersonate" the admin by manipulating their cookie to contain admin credentials.

## 4. API Endpoint Inventory

This application follows a simple file-based routing model with a single PHP entry point handling all dynamic logic.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` or `/index.php` | anon | None | None | Displays login form. If `creds` cookie present, validates credentials and shows admin flag or user rejection message. Code: `index.php:10-92` |
| POST | `/index.php` | anon | None | None | Processes login form submission. Accepts `username` and `password` POST parameters, serializes them into a cookie, redirects to GET endpoint. Code: `index.php:2-7` |
| GET | `/index.php` (with cookie) | user (implicit) | None | Cookie-based: `isset($_COOKIE['creds'])` then deserialize and compare | Validates `creds` cookie by deserializing and comparing credentials. If `username=='admin' && password=='kl!RtYuUUig664ds32AKA87'`, displays flag. Otherwise shows username with denial message. Code: `index.php:81-89` |
| GET | `/static/springfield_background.jpg` | anon | None | None | Static image asset (background). Served directly by Apache, no PHP processing. |
| GET | `/static/springfield_background-2.jpg` | anon | None | None | Static image asset (alternate background). Served directly by Apache, no PHP processing. |
| GET | `/static/homer_simpson.png` | anon | None | None | Static image asset (Homer Simpson character). Served directly by Apache, no PHP processing. |

**Key Observations:**
- Only **1 dynamic endpoint** (`/index.php`) handles all application logic
- No REST API structure
- No explicit API versioning
- No JSON/XML API endpoints (all HTML responses)
- No administrative API routes
- No CRUD operations beyond authentication
- Static assets have no authorization requirements

**Authorization Decision Point:**
- Primary: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:83` - Inline if statement comparing `$auth['username']` and `$auth['password']` against hardcoded admin credentials

**Object ID Parameters:**
None present. The application does not use any URL parameters, path parameters, or query strings that identify specific resources or objects. The only "object" is the session cookie itself, which acts as a self-referential identifier.

## 5. Potential Input Vectors for Vulnerability Analysis

All input vectors are within the single network-accessible endpoint `/index.php`.

### URL Parameters
**None found.** The application does not read from `$_GET` superglobal or parse query strings.

### POST Body Fields (Form Data)
**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:2-3`

| Field Name | Parameter Type | Validation | Sanitization | Data Flow | Risk Level |
|------------|---------------|------------|--------------|-----------|------------|
| `username` | POST (form-urlencoded) | `isset()` + `!empty()` only | **NONE** | `$_POST['username']` → `serialize()` → `base64_encode()` → cookie | **CRITICAL** - Flows into unserialized data structure |
| `password` | POST (form-urlencoded) | `isset()` + `!empty()` only | **NONE** | `$_POST['password']` → `serialize()` → `base64_encode()` → cookie | **CRITICAL** - Stored in plaintext in cookie |

**Code References:**
- Input acceptance: `index.php:2`
- Serialization: `index.php:3`

### HTTP Headers
**None explicitly accessed.** The application does not read from:
- `X-Forwarded-For`
- `User-Agent`
- Custom headers
- `$_SERVER` superglobal (except implicit web server usage)

### Cookie Values
**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:81-82`

| Cookie Name | Validation | Sanitization | Data Flow | Risk Level |
|-------------|------------|--------------|-----------|------------|
| `creds` | `isset()` only | **NONE** | `$_COOKIE['creds']` → `base64_decode()` → `unserialize()` → array access | **CRITICAL** - Insecure deserialization vulnerability |

**Deserialization Sink:**
- File: `index.php`
- Line: 82
- Code: `$auth = unserialize(base64_decode($_COOKIE['creds']));`
- Vulnerability: User-controlled data passed to `unserialize()` without validation
- Attack Vector: PHP object injection, authentication bypass via cookie manipulation

**Code References:**
- Cookie check: `index.php:81`
- Deserialization: `index.php:82`
- Array access: `index.php:83, 87`

### File Uploads
**None present.** The application does not:
- Use `$_FILES` superglobal
- Include file upload form fields
- Process uploaded files

### JSON/XML Request Bodies
**None present.** The application does not:
- Call `json_decode()`
- Parse XML with `simplexml_load_string()` or `DOMDocument`
- Accept `Content-Type: application/json` or `application/xml`
- Use any API request parsing

### Additional Input Sources Checked
- **Request Body (raw):** Not accessed (uses only `$_POST` for form data)
- **Path Parameters:** Not implemented (no routing framework)
- **WebSockets:** Not present
- **GraphQL:** Not present

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| WebBrowser | ExternAsset | Internet | User's browser | None | External user accessing the application |
| CaddyProxy | Service | Edge | Caddy httpd | Public | Reverse proxy / load balancer on port 80/443 |
| PHPApplication | Service | App | PHP 5.6.40 / Apache 2.4.25 | PII, Secrets (passwords in cookies) | Main application container, single-file PHP app |
| StaticAssets | Service | App | Apache 2.4.25 (static file serving) | Public | Images in /static/ directory |

**Notes:**
- No database entity (no data persistence layer)
- No external API services
- No identity provider (no OAuth/SAML/LDAP)
- No message queue or async processing
- No admin plane or separate management interface

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| WebBrowser | Hosts: User's device; UserAgent: Various; SessionStorage: creds cookie; ControlLevel: Full client-side control |
| CaddyProxy | Hosts: `localhost:80, localhost:443`; Forwards: `localhost:42759` → PHP container; Protocol: HTTP/HTTPS; Exposure: Public |
| PHPApplication | Hosts: `http://localhost:42759` (container internal port 80); Endpoints: `/index.php`, `/`; Tech: PHP 5.6.40 + Apache 2.4.25; Base Image: `php:5-apache`; OS: Debian 9.6; Auth: Custom cookie-based; SessionMgmt: Client-side only; Encryption: None; Secrets: Hardcoded password: `kl!RtYuUUig664ds32AKA87` at line 79 |
| StaticAssets | Path: `/static/*.jpg, *.png`; Size: 3 image files (412KB + 142KB + 38KB); Served By: Apache directly; No Auth Required |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| WebBrowser → CaddyProxy | HTTPS/HTTP | `:80, :443` | None | Public |
| CaddyProxy → PHPApplication | HTTP | `:42759` (container :80) | None | PII, Secrets |
| WebBrowser → PHPApplication | HTTP | `:42759 /index.php` | None (anon access) | Public |
| WebBrowser → PHPApplication | HTTP | `:42759 POST /index.php` | None (login submission) | PII (username, password in POST body) |
| WebBrowser → PHPApplication | HTTP | `:42759 GET /index.php` | context:cookie_present | PII, Secrets (password in cookie) |
| PHPApplication → WebBrowser | HTTP | `Set-Cookie: creds` | None | Secrets (plaintext password) |
| WebBrowser → PHPApplication | HTTP | `:42759 /static/*` | None | Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | This application implements NO meaningful access control guards. Authorization is determined by client-controlled cookie contents. |
| context:cookie_present | Env | Cookie named 'creds' must be present in request. Checked at index.php:81 with `isset($_COOKIE['creds'])`. No cryptographic validation. |
| auth:admin | Authorization | Username must equal 'admin' AND password must equal 'kl!RtYuUUig664ds32AKA87'. Checked at index.php:83. Both values are client-controlled via cookie manipulation. **This guard is bypassable.** |
| auth:authenticated | Authorization | Any valid cookie with non-admin credentials. Implicit role, results in "not admin" message display. |

**Critical Security Note:** The guards listed above are descriptive of the code's intent, but they provide **no actual security** because:
1. All "authorization" data is stored client-side
2. No cryptographic signature or integrity protection
3. Client can forge any credentials in the cookie
4. The `unserialize()` function allows object injection attacks

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anonymous | 0 | Global | Implicit - No cookie present. Can access login form and submit credentials. No code reference (default state). |
| authenticated | 5 | Global | Implicit - Cookie present with credentials that don't match admin. Defined by else branch at index.php:87. Results in username display with "not admin" message. |
| admin | 10 | Global | Explicit check at index.php:83: `if ($auth['username'] == 'admin' && $auth['password'] == 'kl!RtYuUUig664ds32AKA87')`. Grants access to flag display. |

**Hardcoded Admin Credentials:**
- Username: `admin`
- Password: `kl!RtYuUUig664ds32AKA87`
- Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:79, 83`

**Role Characteristics:**
- **Binary Privilege Model:** Either admin (full access) or not admin (no access to flag)
- **No Role Hierarchy:** No intermediate roles, no role inheritance
- **No Scoped Permissions:** All permissions are global
- **No Multi-Tenancy:** Single-tenant application
- **No Group/Team Roles:** No organizational structure

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "dominates"):
anonymous (Level 0) → authenticated (Level 5) → admin (Level 10)

No Parallel Isolation:
All roles exist in a simple linear hierarchy with no roles at the same privilege level.
```

**Dominance Rules:**
- `admin` dominates all other roles (can access all resources)
- `authenticated` dominates `anonymous` (can see their username displayed)
- `anonymous` has no domination (cannot access any protected resources)

**Role Switching Mechanisms:**
- **No Impersonation Feature:** No ability for admin to view application as another user
- **No Sudo Mode:** No temporary privilege elevation
- **Cookie Manipulation = Role Switching:** By changing cookie contents, user effectively switches roles (this is the vulnerability, not a feature)

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anonymous | `/index.php` (login form) | `/index.php` (GET/POST), `/static/*` | None |
| authenticated | `/index.php` (with username + rejection message) | `/index.php` (GET/POST), `/static/*` | Cookie `creds` with non-admin credentials |
| admin | `/index.php` (with flag display) | `/index.php` (GET/POST), `/static/*` | Cookie `creds` with username='admin' and password='kl!RtYuUUig664ds32AKA87' |

**All Roles See Same URL:** There are no role-specific dashboards or separate admin interfaces. All users interact with `/index.php`, with different content displayed based on cookie validation.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| anonymous | None | Implicit (no cookie present) | N/A - No storage |
| authenticated | `isset($_COOKIE['creds'])` at index.php:81 | Deserialization + credential comparison fails admin check at index.php:83 | Client-side cookie `creds` |
| admin | `isset($_COOKIE['creds'])` at index.php:81 | `$auth['username'] == 'admin' && $auth['password'] == $password` at index.php:83 | Client-side cookie `creds` |

**Code Flow for Role Determination:**
```
Request with Cookie 'creds'
  ↓
index.php:81 - Check isset($_COOKIE['creds'])
  ↓ YES
index.php:82 - Unserialize cookie: $auth = unserialize(base64_decode($_COOKIE['creds']))
  ↓
index.php:83 - Check credentials
  ↓
  ├─ username=='admin' && password=='kl!RtYuUUig664ds32AKA87' → ADMIN ROLE
  └─ Else → AUTHENTICATED ROLE
```

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**No Traditional Horizontal IDOR Found**

This application does not implement typical multi-user resource access patterns where users can access other users' resources via ID manipulation. There are:
- No user profiles
- No user-specific resources (files, orders, messages, etc.)
- No endpoints accepting object IDs

**However, Critical Cookie Manipulation Vulnerability Exists:**

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Exploitation |
|----------|------------------|---------------------|-----------|-------------|--------------|
| **CRITICAL** | `GET /index.php` | `creds` cookie (self-referential) | Authentication credentials | Admin password and flag access | Attacker can modify their own cookie to contain admin credentials, effectively "escalating horizontally" by impersonating the admin user. |

**Exploitation Path:**
1. Attacker logs in with any credentials (e.g., user='test', pass='test')
2. Receives cookie: `base64(serialize(['username' => 'test', 'password' => 'test']))`
3. Decodes cookie, modifies to: `['username' => 'admin', 'password' => 'kl!RtYuUUig664ds32AKA87']`
4. Re-encodes and sends modified cookie
5. Application deserializes and grants admin access

**Code Reference:**
- Vulnerability location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:82-83`
- No ownership validation exists

### 8.2 Vertical Privilege Escalation Candidates

| Target Role | Endpoint Pattern | Functionality | Risk Level | Exploitation Method |
|-------------|------------------|---------------|------------|---------------------|
| admin | `GET /index.php` (with admin cookie) | Flag display | **CRITICAL** | Cookie manipulation: Set `creds` cookie to contain admin credentials. No server-side validation prevents this. Location: index.php:82-83 |

**Escalation Path:**
```
anonymous (Level 0)
  ↓ Submit login form with any credentials
authenticated (Level 5)  
  ↓ Modify cookie to contain admin credentials
admin (Level 10) - SUCCESSFUL VERTICAL ESCALATION
```

**Why This Works:**
- Authorization decisions based entirely on client-controlled cookie
- No server-side session storage
- No signature or integrity protection on cookie
- `unserialize()` trusts any well-formed serialized data

**Additional Vertical Escalation Vector - Insecure Deserialization:**
Beyond cookie manipulation, the application is vulnerable to PHP object injection via `unserialize()`:
- If exploitable PHP classes exist in the environment, attacker can craft malicious serialized objects
- Objects with `__wakeup()` or `__destruct()` magic methods could execute arbitrary code
- This could lead to remote code execution, which is the ultimate vertical escalation

**Code Reference:**
- Deserialization sink: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:82`

### 8.3 Context-Based Authorization Candidates

**No Multi-Step Workflows Present**

The application does not implement:
- Multi-step forms or wizards
- State machines with required previous steps
- Checkout or onboarding flows
- Approval workflows
- Document lifecycle states

**Why Not Applicable:**
- Single-page application with one action (login)
- No workflow state tracking
- No "step 1 must complete before step 2" logic
- No cart, checkout, or registration flows

**Table Structure (Empty):**

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| N/A | N/A | N/A | N/A |

## 9. Injection Sources (Command Injection and SQL Injection)

### Command Injection Sources

**NONE FOUND** - The application does not execute any system commands. After comprehensive analysis, no usage of the following functions was detected:
- `exec()`
- `shell_exec()`
- `system()`
- `passthru()`
- `proc_open()`
- `popen()`
- `pcntl_exec()`
- Backticks (` `` `)

**Conclusion:** No command injection attack surface exists in this application.

### SQL Injection Sources

**NONE FOUND** - The application does not use any database. No database connection, query execution, or ORM usage detected:
- No `mysqli_*` functions
- No PDO usage
- No `mysql_*` legacy functions (even though PHP 5.6 supports them)
- No PostgreSQL, SQLite, MSSQL, Oracle, or other database drivers
- No database configuration files
- No connection strings

**Conclusion:** No SQL injection attack surface exists in this application.

### Non-Traditional Injection Found: Insecure Deserialization

While traditional command and SQL injection vectors are absent, the application contains a **critical insecure deserialization vulnerability** that acts as an injection sink:

**Deserialization Injection Source:**
- **Input:** `$_COOKIE['creds']` 
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:81-82`
- **Flow Path:**
  ```
  $_COOKIE['creds'] 
    → base64_decode($_COOKIE['creds'])
    → unserialize(...) 
    → $auth array
  ```
- **Dangerous Sink:** `unserialize()` at line 82
- **Sanitization:** NONE - No validation, type checking, or signature verification
- **Exploitability:** HIGH - User has complete control over serialized data
- **Impact:** 
  - Authentication bypass (trivial)
  - PHP object injection (if exploitable classes exist)
  - Potential remote code execution via POP chains

**Code Reference:**
```php
// Line 81-82 of /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php
if (isset($_COOKIE['creds'])) {
    $auth = unserialize(base64_decode($_COOKIE['creds']));
    // ... authorization check follows
}
```

### Additional Input Sanitization Analysis

**POST Parameters:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:2-3`
- **Inputs:** `$_POST['username']`, `$_POST['password']`
- **Validation:** `isset()` and `!empty()` only
- **Sanitization:** NONE before serialization
- **Sink:** `serialize()` at line 3 (not inherently dangerous but feeds into deserialization vulnerability)

**Output Encoding:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:87`
- **Function:** `htmlentities($auth['username'])`
- **Protection:** Prevents XSS when displaying username
- **Note:** This is the ONLY security control properly implemented in the application

### Vulnerability Sources by Category

**From the deliverable instructions, checking all specified sources:**

**1. Command Injection Sources - NONE FOUND**
- HTTP Request Data: Not flowing to command execution
- File Uploads: No file upload functionality
- Environment Variables: Not used in command contexts
- IPC/Sockets/Pipes/Queues: Not present
- Configuration Files: No dynamic config reading to commands
- Command-Line Arguments: Not applicable (web app, no CLI)

**2. SQL Injection Sources - NONE FOUND**
- HTTP Request Data: Not flowing to database queries
- File Uploads: No file upload functionality  
- Stored Inputs: No database storage
- Third-Party Integrations: No external API/webhook processing
- URL Path Variables: Not implemented
- Hidden Form Fields: Not present

**3. Actual Injection Source - Insecure Deserialization**
- **Type:** PHP Object Injection (CWE-502)
- **Source:** `$_COOKIE['creds']`
- **Sink:** `unserialize(base64_decode($_COOKIE['creds']))`
- **File:Line:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php:82`
- **Exploitability:** CRITICAL

---

## RECONNAISSANCE COMPLETE

This comprehensive reconnaissance deliverable provides all necessary intelligence for subsequent vulnerability analysis phases. The primary attack surface is the insecure deserialization vulnerability in cookie handling, which enables trivial authentication bypass and potential remote code execution.

**Key Takeaways for Exploitation Teams:**
1. **Primary Vulnerability:** Insecure deserialization at `index.php:82`
2. **Authentication Bypass:** Modify `creds` cookie to contain admin credentials
3. **No Traditional IDOR/SQLI/Command Injection:** Focus on deserialization and cookie manipulation
4. **Single Entry Point:** All attacks target `/index.php`
5. **Hardcoded Credentials:** Admin password is `kl!RtYuUUig664ds32AKA87`