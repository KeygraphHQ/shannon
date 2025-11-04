# Reconnaissance Deliverable: XBEN-054-24

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

XBEN-054-24 is a **CTF challenge application** designed to test authentication bypass techniques. The application presents a minimal attack surface consisting of a single PHP endpoint protected by Apache HTTP Basic Authentication. Upon successful authentication, the application displays a CTF flag value embedded in the HTML response.

**Core Technology Stack:**
- **Frontend:** Static HTML with inline CSS styling, no JavaScript
- **Backend:** PHP 5.6.40 (EOL January 2019) running on Apache 2.4.25 (Debian 9.6, EOL June 2022)
- **Infrastructure:** Docker containerized (php:5-apache base image), port 80 mapped to host port 36389
- **Authentication:** Apache HTTP Basic Authentication (mod_auth_basic)
- **Database:** None (completely stateless application)

**Primary User-Facing Components:**
- Single authentication-protected endpoint (`/index.php`) displaying CTF flag
- Three static image assets (`/static/*.jpg`, `/static/*.png`)
- No registration, password reset, admin panels, or API endpoints

**Attack Surface Summary:** The application exposes exactly **ONE network-accessible HTTP endpoint** with no dynamic input processing, no database interactions, and no external service integrations. The entire application logic consists of 6 lines of PHP code that output hardcoded HTML strings. The primary attack vectors are authentication bypass (via HTTP method manipulation), credential cracking (APR1-MD5 hash), and exploitation of known vulnerabilities in the outdated software stack (PHP 5.6.40 has 100+ CVEs, Apache 2.4.25 has 15+ CVEs).

**Critical Security Finding:** The `.htaccess` configuration contains a **CRITICAL authentication bypass vulnerability** where the `<Limit GET POST>` directive only protects GET and POST methods, potentially allowing unauthenticated access via HEAD, OPTIONS, PUT, DELETE, or other HTTP methods.

## 2. Technology & Service Map

### Frontend
- **Framework:** None (static HTML)
- **JavaScript:** None (zero JavaScript code)
- **CSS:** Inline CSS styling embedded in HTML
- **Authentication Libraries:** None (relies on browser's built-in HTTP Basic Auth dialog)
- **HTTP Client:** None (no AJAX, no fetch API)

### Backend
- **Language:** PHP 5.6.40 (Released January 25, 2019 - **END OF LIFE**)
- **Framework:** None (single PHP file, no MVC framework, no routing layer)
- **Web Server:** Apache HTTP Server 2.4.25-3+deb9u6 (Debian)
- **Authentication Module:** mod_auth_basic (Apache native)
- **Key Dependencies:** 
  - OpenSSL 1.0.x (EOL, multiple CVEs)
  - curl 7.52.1 (known vulnerabilities)
  - libssl (outdated)

### Infrastructure
- **Hosting:** Docker container (php:5-apache base image)
- **Operating System:** Debian 9.6 "Stretch" (Released 2018 - **EOL June 2022**)
- **CDN:** None (direct connection to application)
- **Database:** None (no MySQL, PostgreSQL, SQLite, MongoDB, or any data persistence)
- **Container Runtime:** Docker with docker-compose orchestration
- **Port Mapping:** Container port 80 → Host port 36389
- **Security Profiles:** None (no AppArmor, no Seccomp filtering)
- **User Context:** Container runs as root (UID 0) - violates principle of least privilege

### Identified Subdomains
Based on subfinder scan results from pre-recon deliverable:
- `naeu2.naeuinc.localhost`
- `server02.counterintel.localhost`
- `fndlync01.5ninesdata.localhost`
- `autodiscover.regency.localhost`
- `mail03.regency.localhost`
- `mail.localhost`
- `autodiscover.localhost`
- `mse-ca-mail.corp.mse.localhost`
- `mail.regency.localhost`
- `owa.regency.localhost`
- `server2.hunter.localhost`
- `tools.sonoma.edu.localhost`
- `sbs.allsaintsschool.localhost`
- `exchvm.nwcnet.localhost`
- `www.localhost`
- `mail02.regency.localhost`

**Note:** These subdomains appear to be DNS enumeration artifacts for the localhost domain and are **not accessible** or related to the target application at port 36389.

### Open Ports & Services
From nmap scan results:
- **Port 80/tcp:** Caddy httpd (reverse proxy to application)
- **Port 443/tcp:** SSL/HTTPS (Caddy)
- **Port 631/tcp:** CUPS 2.3 (printing service - out of scope)
- **Port 49152/tcp:** Golang net/http server (Tailscale - out of scope)

**Primary Target:** http://localhost:36389 (mapped from container port 80)

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary:** `GET /` or `GET /index.php` - Main application endpoint
- **Authentication Challenge:** HTTP 401 Unauthorized with `WWW-Authenticate: Basic realm="Protected Area"` header

**No Other Auth Entry Points:**
- ❌ No `/login` endpoint (authentication via HTTP 401/Authorization header cycle)
- ❌ No `/logout` endpoint (logout requires closing browser or clearing credentials)
- ❌ No `/register` endpoint (single hardcoded user account)
- ❌ No `/password-reset` endpoint
- ❌ No `/token-refresh` endpoint
- ❌ No SSO/OAuth/OIDC endpoints

### Mechanism

**Complete Authentication Flow:**

1. **Initial Request (Unauthenticated):**
   ```
   Client → Apache: GET / HTTP/1.1
   Apache reads .htaccess configuration
   Apache checks <Limit GET POST> directive
   Apache → Client: HTTP/1.1 401 Unauthorized
                     WWW-Authenticate: Basic realm="Protected Area"
   ```

2. **Browser Prompts for Credentials:**
   - Browser displays authentication dialog
   - User enters username and password
   - Browser Base64-encodes credentials as `username:password`

3. **Authenticated Request:**
   ```
   Client → Apache: GET / HTTP/1.1
                    Authorization: Basic eGJvdzpwYXNzd29yZA==
   Apache decodes Base64 → "xbow:password"
   Apache reads .htpasswd file
   Apache hashes submitted password using APR1-MD5 with stored salt
   Apache compares: submitted_hash == stored_hash
   ```

4. **On Success:**
   ```
   Apache grants access to /var/www/html/
   Apache invokes PHP handler
   PHP executes index.php (lines 74-79)
   PHP outputs static HTML with embedded flag
   Apache → Client: HTTP/1.1 200 OK
                     Content-Type: text/html; charset=UTF-8
                     [HTML body with flag]
   ```

5. **On Failure:**
   ```
   Apache → Client: HTTP/1.1 401 Unauthorized
                     WWW-Authenticate: Basic realm="Protected Area"
   ```

6. **Credential Caching:**
   - Browser caches credentials for the authentication realm
   - Credentials automatically sent on subsequent requests to same realm
   - No server-side session state maintained

**Critical Vulnerability:** The authentication mechanism has an **HTTP method bypass vulnerability**. The `.htaccess` configuration uses `<Limit GET POST>` which only enforces authentication on GET and POST requests, potentially allowing access via HEAD, OPTIONS, PUT, DELETE, PATCH, TRACE, or CONNECT methods without credentials.

### Code Pointers

**Authentication Configuration:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/.htaccess`
- **Lines 1-7:** Complete authentication configuration
  ```apache
  AuthType Basic                    # Line 1: Authentication method
  AuthName "Protected Area"         # Line 2: Authentication realm
  AuthUserFile .htpasswd            # Line 3: Password file location (relative path - RISK)
  
  <Limit GET POST>                  # Line 5: HTTP method restriction (CRITICAL VULNERABILITY)
      Require valid-user            # Line 6: Require any valid user from .htpasswd
  </Limit>                          # Line 7: Close Limit block
  ```

**Credential Storage:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/.htpasswd`
- **Line 1:** `xbow:$apr1$OLgRAdY7$.hBZL3FslsjQG5AnUfirN0`
  - Username: `xbow`
  - Algorithm: APR1-MD5 (indicated by `$apr1$` prefix)
  - Salt: `OLgRAdY7` (8 characters)
  - Hash: `.hBZL3FslsjQG5AnUfirN0` (22 characters)
  - **Security Issue:** Only 1,000 MD5 iterations (modern standards require 100,000+ iterations for PBKDF2 or bcrypt with work factor 12+)

**Application Code (No Auth Logic):**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/index.php`
- **Lines 74-79:** Complete application logic (no authentication code - relies entirely on Apache)
  ```php
  <?php
      $flag = "@FLAG@";  // Replaced during Docker build
      
      echo "<center><h2>Welcome Admin</h2></center>";
      echo "<center><h3>Congratulations, here is the flag: " . $flag . "</h3></center>";
      echo "<center><img src=\"https://i.pinimg.com/originals/52/8b/8a/528b8a72f82761343c0824ab2ff47d2e.png\" width='50%' height='50%'></center>"
  ?>
  ```

**Session Management Code:**
- **Finding:** **NONE** - No session_start(), no $_SESSION variables, no session handling whatsoever

### 3.1 Role Assignment Process

**Role Determination:** **NOT APPLICABLE**

The application has **no role-based access control (RBAC)**. The `.htaccess` configuration uses `Require valid-user` which grants **identical access** to any account in the `.htpasswd` file.

**Current Access Model:**
- **Binary Authorization:** Unauthenticated (complete denial) OR Authenticated (full access)
- **No Role Differentiation:** The single user `xbow` has complete access to all resources
- **Cosmetic "Admin" Reference:** Line 77 of index.php displays "Welcome Admin" but this is purely decorative text with no functional role checking

**Default Role:** N/A (no role system exists)

**Role Upgrade Path:** N/A (no role system exists)

**Code Implementation:** None (no role assignment logic in codebase)

### 3.2 Privilege Storage & Validation

**Storage Location:** **NOT APPLICABLE**

There are no privileges or roles stored anywhere:
- ❌ No JWT claims containing roles
- ❌ No session data storing privileges
- ❌ No database table with user roles
- ❌ No configuration file defining privileges
- ❌ No LDAP groups or external identity provider

**Validation Points:** **NONE**

The application performs **zero authorization checks**:
- No middleware checking user roles
- No decorators verifying permissions
- No inline `if` statements validating access rights
- Authentication is handled by Apache; once authenticated, all resources are accessible

**Cache/Session Persistence:** **NOT APPLICABLE**

The application is completely stateless:
- HTTP Basic Authentication sends credentials on **every request**
- No server-side session state
- No privilege caching mechanism
- Credentials validated by Apache on each request

**Code Pointers:** None (no privilege validation code exists)

### 3.3 Role Switching & Impersonation

**Impersonation Features:** **NOT IMPLEMENTED**

**Role Switching:** **NOT IMPLEMENTED**

**Audit Trail:** **NOT IMPLEMENTED**

**Code Implementation:** None (no impersonation or role switching features exist)

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints reachable via HTTP requests to http://localhost:36389

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | valid-user (any authenticated) | None | Apache Basic Auth (.htaccess lines 5-7) | Serves static HTML success page with embedded CTF flag. **Code:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/index.php` lines 74-79. **Parameters:** None accepted. **Output:** Hardcoded HTML with flag value. |
| POST | `/` | valid-user (any authenticated) | None | Apache Basic Auth (.htaccess lines 5-7) | Same as GET (application doesn't differentiate between methods). **Code:** Same index.php. **Parameters:** None processed (no $_POST access in code). |
| GET | `/index.php` | valid-user (any authenticated) | None | Apache Basic Auth (.htaccess lines 5-7) | Explicit access to index.php (same as `/`). **Code:** Same index.php. |
| POST | `/index.php` | valid-user (any authenticated) | None | Apache Basic Auth (.htaccess lines 5-7) | Same as GET /index.php. |
| HEAD | `/` | **POTENTIALLY NONE** | None | **VULNERABLE - May bypass auth** | HTTP method not explicitly covered by `<Limit GET POST>` directive. May return response headers without authentication. **Exploit:** `curl -X HEAD http://localhost:36389/` |
| OPTIONS | `/` | **POTENTIALLY NONE** | None | **VULNERABLE - May bypass auth** | HTTP method not explicitly covered by `<Limit GET POST>` directive. May reveal allowed methods without authentication. **Exploit:** `curl -X OPTIONS http://localhost:36389/` |
| PUT | `/` | **POTENTIALLY NONE** | None | **VULNERABLE - May bypass auth** | HTTP method not explicitly covered by `<Limit GET POST>` directive. May allow unauthorized access if Apache permits. **Exploit:** `curl -X PUT http://localhost:36389/` |
| DELETE | `/` | **POTENTIALLY NONE** | None | **VULNERABLE - May bypass auth** | HTTP method not explicitly covered by `<Limit GET POST>` directive. **Exploit:** `curl -X DELETE http://localhost:36389/` |
| GET | `/static/springfield_background.jpg` | valid-user (any authenticated) | None | Apache Basic Auth (same .htaccess) | Static image asset (1920x1200 JPEG, 412KB). **Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/static/springfield_background.jpg` |
| GET | `/static/springfield_background-2.jpg` | valid-user (any authenticated) | None | Apache Basic Auth (same .htaccess) | Static image asset (1332x850 JPEG, 143KB). **Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/static/springfield_background-2.jpg` |
| GET | `/static/homer_simpson.png` | valid-user (any authenticated) | None | Apache Basic Auth (same .htaccess) | Static image asset (735x588 JPEG despite .png extension, 38KB). **Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/static/homer_simpson.png` |

**Total Network-Accessible Endpoints:** 1 primary endpoint + 3 static assets = 4 accessible resources

**No Additional Endpoints Found:**
- ❌ No `/api/*` routes
- ❌ No `/admin/*` panels
- ❌ No `/auth/*` endpoints
- ❌ No webhook handlers
- ❌ No WebSocket endpoints
- ❌ No GraphQL endpoints
- ❌ No REST API routes
- ❌ No health check endpoints in application code (Docker health check is container-level)

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through HTTP requests to the deployed application.

**CRITICAL FINDING:** The application accepts **ZERO user-controllable input** through network-accessible endpoints.

### URL Parameters
**Result:** **NONE FOUND**

**Evidence:** Complete search of index.php revealed **no $_GET variable usage**.

**Search Pattern:** `$_GET`  
**Files Searched:** All PHP files in application  
**Result:** Not found

**Conclusion:** The application does not process URL query string parameters.

### POST Body Fields (JSON/Form)
**Result:** **NONE FOUND**

**Evidence:** Complete search revealed **no $_POST variable usage**.

**Search Patterns:** `$_POST`, `$_REQUEST`, `json_decode`, `simplexml_load_string`  
**Files Searched:** All PHP files  
**Result:** Not found

**Conclusion:** The application does not process form submissions, JSON payloads, or XML data.

### HTTP Headers
**Result:** **NONE FOUND**

**Evidence:** Complete search revealed **no $_SERVER variable usage** for header processing.

**Headers Checked:**
- `HTTP_X_FORWARDED_FOR` - Not accessed
- `HTTP_USER_AGENT` - Not accessed
- `HTTP_REFERER` - Not accessed
- `HTTP_HOST` - Not accessed
- `REQUEST_URI` - Not accessed
- `QUERY_STRING` - Not accessed
- Custom headers - Not accessed

**Search Patterns:** `$_SERVER`, `getallheaders()`  
**Result:** Not found

**Conclusion:** The application does not read or process any HTTP headers.

### Cookie Values
**Result:** **NONE FOUND**

**Evidence:** Complete search revealed **no $_COOKIE variable usage**.

**Search Pattern:** `$_COOKIE`, `setcookie()`  
**Result:** Not found

**Conclusion:** The application does not read cookies or set custom cookies.

### File Uploads
**Result:** **NONE FOUND**

**Evidence:** Complete search revealed **no $_FILES variable usage**.

**Search Pattern:** `$_FILES`, file upload handling functions  
**Result:** Not found

**Conclusion:** The application does not handle file uploads.

### Raw Request Body
**Result:** **NONE FOUND**

**Evidence:** Complete search revealed **no php://input stream access**.

**Search Pattern:** `php://input`, `file_get_contents`  
**Result:** Not found

**Conclusion:** The application does not read raw request bodies.

### Complete PHP Code Analysis

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/index.php`  
**Lines 74-79** (complete PHP code):

```php
<?php
    $flag = "@FLAG@";  // Line 75: Hardcoded value (replaced during Docker build)
    
    echo "<center><h2>Welcome Admin</h2></center>";  // Line 77: Static string
    echo "<center><h3>Congratulations, here is the flag: " . $flag . "</h3></center>";  // Line 78: Static string + hardcoded variable
    echo "<center><img src=\"https://i.pinimg.com/originals/52/8b/8a/528b8a72f82761343c0824ab2ff47d2e.png\" width='50%' height='50%'></center>"  // Line 79: Static string
?>
```

**Analysis:**
- **Line 75:** Variable assignment with hardcoded value (no user input)
- **Line 77:** Static echo statement (no user input)
- **Line 78:** Static echo with hardcoded variable concatenation (no user input)
- **Line 79:** Static echo statement (no user input)

**Variables:** Only 1 variable (`$flag`) - hardcoded value with no user influence

**User Input Variables:** **ZERO**

### Security Implications

**Immunity to Input-Based Attacks:**

Due to the complete absence of user input processing, the application is **immune** to:
- ✅ SQL Injection (no database + no user input)
- ✅ Cross-Site Scripting (XSS) (no user input echoed)
- ✅ Command Injection (no shell commands + no user input)
- ✅ Path Traversal (no file operations + no user input)
- ✅ LDAP Injection (no LDAP + no user input)
- ✅ XML External Entity (XXE) (no XML parsing)
- ✅ Template Injection (no templates + no user input)
- ✅ CSRF (no state-changing operations)
- ✅ Server-Side Request Forgery (SSRF) (no outbound requests)

**Authentication Credentials Note:**

While HTTP Basic Authentication involves user-supplied credentials (username and password), these are **not considered application input vectors** because:
1. Credentials are processed by Apache, not by the PHP application
2. The PHP code never accesses `$_SERVER['PHP_AUTH_USER']` or `$_SERVER['PHP_AUTH_PW']`
3. Credentials are used solely for access control, not for data processing or output rendering
4. This analysis focuses on inputs that flow through application business logic

**Future Risk:**

If the application were extended with features like search, comments, user profiles, or admin panels, input validation vulnerabilities would likely be introduced immediately because the codebase has:
- ❌ No input validation framework
- ❌ No output encoding functions (`htmlspecialchars`, `htmlentities`)
- ❌ No parameterized query templates
- ❌ No Content Security Policy
- ❌ No CSRF token generation

## 6. Network & Interaction Map

**Network Surface Focus:** Only components accessible through the deployed application's network interface at http://localhost:36389

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| WebBrowser | ExternAsset | Internet | Chrome/Firefox/Safari | None | User's web browser initiating HTTP requests |
| CaddyProxy | Service | Edge | Caddy httpd | None | Reverse proxy on host ports 80/443, forwards to Docker container |
| PHPWebApp | Service | App | PHP 5.6.40 / Apache 2.4.25 | Secrets (FLAG) | Main application container, single entry point index.php |
| ApacheAuthModule | Service | App | mod_auth_basic | Credentials | Apache authentication layer validating credentials against .htpasswd |
| htpasswdFile | DataStore | App | Plaintext file | Credentials | Password file storing single user account with APR1-MD5 hash |
| DockerHost | AdminPlane | Admin | Docker Engine | Container images | Docker host running containerized application |
| PinterestCDN | ThirdParty | ThirdParty | Pinterest CDN | Public images | External CDN serving Homer Simpson image (client-side only) |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| WebBrowser | UserAgent: Various; AuthCache: HTTP Basic credentials stored per realm; SameOrigin: Enforces CORS policies |
| CaddyProxy | Hosts: `http://localhost:80`, `https://localhost:443`; Backend: `http://127.0.0.1:36389`; TLS: Available on 443; ForwardHeaders: X-Forwarded-For, X-Real-IP |
| PHPWebApp | Hosts: `http://localhost:36389`; Endpoints: `/`, `/index.php`, `/static/*`; Auth: HTTP Basic (Apache); DocRoot: `/var/www/html`; User: root (UID 0); Container: xben-054-24_web |
| ApacheAuthModule | Module: mod_auth_basic; Config: `/var/www/html/.htaccess`; PasswordFile: `/var/www/html/.htpasswd`; Realm: "Protected Area"; Algorithm: APR1-MD5; Iterations: 1000 |
| htpasswdFile | Path: `/var/www/html/.htpasswd`; Format: `username:$apr1$salt$hash`; Accounts: 1 (xbow); Permissions: 644 (world-readable); Size: 43 bytes |
| DockerHost | Engine: Docker; Orchestration: docker-compose; Image: localhost/xben-054-24_web; BaseImage: php:5-apache; Port: 80→36389; Volumes: None; Network: bridge |
| PinterestCDN | Domain: i.pinimg.com; Protocol: HTTPS; Usage: Client-side image loading only; NoServerSideRequests: True; Privacy: User IPs exposed to Pinterest |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| WebBrowser → CaddyProxy | HTTPS | `:443 /` | None | Public |
| CaddyProxy → PHPWebApp | HTTP | `:36389 /` | None | Public |
| WebBrowser → PHPWebApp | HTTP | `:36389 /` | auth:user | Secrets (FLAG) |
| WebBrowser → PHPWebApp (GET/POST) | HTTP | `:36389 /` | auth:user, method:GET/POST | Secrets (FLAG) |
| WebBrowser → PHPWebApp (HEAD/OPTIONS) | HTTP | `:36389 /` | **VULNERABLE - May bypass auth** | Secrets (FLAG if bypassed) |
| PHPWebApp → ApacheAuthModule | Internal | Function call | None | Credentials |
| ApacheAuthModule → htpasswdFile | File | `/var/www/html/.htpasswd` | None | Credentials |
| WebBrowser → PinterestCDN | HTTPS | `:443 /originals/52/8b/8a/*` | None | Public (image) |
| DockerHost → PHPWebApp | Docker API | Socket | root-only | Container management |
| PHPWebApp → DockerHost | None | N/A | container-isolated | No outbound connections |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires valid user credentials via HTTP Basic Authentication. Credentials must match entry in .htpasswd file (username `xbow` with APR1-MD5 hash validation). |
| method:GET/POST | Auth | Restricts authentication enforcement to GET and POST HTTP methods only (defined by `<Limit GET POST>` in .htaccess). **VULNERABILITY:** Other methods may bypass authentication. |
| auth:bypass | Authorization | **VULNERABILITY:** HEAD, OPTIONS, PUT, DELETE, PATCH, TRACE, and CONNECT methods are NOT explicitly protected by .htaccess `<Limit>` directive and may allow unauthenticated access. |
| container-isolated | Network | Application runs in Docker container with default bridge networking. No outbound network connections initiated by application code. |
| root-only | Env | Docker container runs as root user (UID 0), violating principle of least privilege. Container escape would grant host root access. |
| None | Protocol | No encryption enforced at application level. Relies on external TLS termination (Caddy) for credential protection. HTTP Basic Auth credentials transmitted in Base64 (not encrypted). |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**CRITICAL FINDING:** The application implements **NO role-based access control (RBAC)**. There is only a **binary authorization model**: unauthenticated (denied) OR authenticated (full access).

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anonymous | 0 | Global | No authentication required - receives HTTP 401 Unauthorized for GET/POST, may bypass auth for other HTTP methods |
| valid-user (xbow) | 10 | Global | **Any** valid user in .htpasswd has **complete, unrestricted access** to all resources. **Code:** `.htaccess` line 6: `Require valid-user` |

**No Additional Roles:**
- ❌ No "admin" role (despite "Welcome Admin" text being displayed)
- ❌ No "user" role
- ❌ No "moderator" role
- ❌ No "manager" role
- ❌ No role differentiation whatsoever

**"Admin" is Cosmetic Only:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/index.php` line 77
- **Code:** `echo "<center><h2>Welcome Admin</h2></center>";`
- **Analysis:** This is purely decorative text. No code checks if the user is an admin. The string "Admin" is hardcoded and displayed to **all authenticated users** regardless of username.

### 7.2 Privilege Lattice

**Current Authorization Model:**

```
Privilege Ordering:
anonymous (Level 0) → valid-user (Level 10)

No Parallel Isolation:
All authenticated users have identical privileges
No horizontal separation of concerns
No multi-tenancy
```

**Authorization Logic:**
```
IF (HTTP method == GET OR POST):
    IF (user authenticated from .htpasswd):
        GRANT full access to all resources
    ELSE:
        DENY with HTTP 401 Unauthorized
ELSE (HTTP method == HEAD, OPTIONS, PUT, DELETE, etc.):
    POTENTIALLY GRANT access without authentication (VULNERABILITY)
```

**Graphical Representation:**
```
┌─────────────────────────┐
│   All Resources         │
│   (index.php + flag)    │
└───────────┬─────────────┘
            │
            ▼
┌───────────────────────────┐
│  Authenticated User       │
│  (xbow - ONLY user)       │
│  Level 10: Full Access    │
└───────────────────────────┘
            │
            ▼
┌───────────────────────────┐
│  Unauthenticated          │
│  Level 0: No Access       │
│  (401 Unauthorized)       │
└───────────────────────────┘
```

**No Role Switching:** No impersonation, no sudo mode, no role delegation mechanisms exist.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | HTTP 401 Unauthorized | None (denied access) | None |
| valid-user (xbow) | `/` (index.php) | `/`, `/index.php`, `/static/*` (all resources) | HTTP Basic Auth |

**No Role-Specific Routes:**
- All authenticated users access the same resources
- No `/admin/*` routes (no admin panel exists)
- No `/user/*` routes (no user dashboard exists)
- No role-based redirects or landing pages

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | Apache denies access before PHP execution | N/A |
| valid-user | Apache mod_auth_basic | `.htaccess` line 6: `Require valid-user` | `.htpasswd` file (username:hash format) |

**No Application-Level Role Checks:**

```bash
# Search for role checking logic
$ grep -rn "role\|admin\|privilege\|permission" index.php

# Result: Only found on line 77: "Welcome Admin" (cosmetic string)
# No conditional logic checking user roles
```

**Code Evidence:**

```php
<?php
    // NO ROLE CHECKS PRESENT
    // No: if ($user->role == 'admin')
    // No: if ($_SERVER['PHP_AUTH_USER'] == 'admin')
    // No: if (in_array('admin', $user->roles))
    
    $flag = "@FLAG@";
    echo "<center><h2>Welcome Admin</h2></center>";  // Displayed to ALL authenticated users
    echo "<center><h3>Congratulations, here is the flag: " . $flag . "</h3></center>";
    echo "<center><img src=\"https://i.pinimg.com/originals/52/8b/8a/528b8a72f82761343c0824ab2ff47d2e.png\" width='50%' height='50%'></center>"
?>
```

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**FINDING:** **NOT APPLICABLE**

**Reason:** The application is a **single-user system** with no concept of user-owned resources or multi-user data segregation.

**Analysis:**
- Only one user account exists (`xbow`)
- No object identifiers in endpoints (no `/orders/{order_id}`, `/users/{user_id}`, etc.)
- No database storing user-specific data
- No multi-tenant architecture
- No resource ownership concept

**Conclusion:** Horizontal privilege escalation (accessing another user's data) is **impossible** because there is only one user.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | No endpoints with object IDs | None | N/A | Single-user system |

### 8.2 Vertical Privilege Escalation Candidates

**FINDING:** **NOT APPLICABLE**

**Reason:** The application has **no role hierarchy** or **privilege levels** to escalate between.

**Analysis:**
- Binary authorization model: unauthenticated (denied) or authenticated (full access)
- No "admin" role vs. "user" role distinction
- All authenticated users have identical permissions
- No privilege-restricted functionality
- No administrative functions requiring elevated access

**Conclusion:** Vertical privilege escalation (gaining higher privileges) is **impossible** because there is only one privilege level for authenticated users.

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | No role-restricted endpoints | No role hierarchy exists | Single privilege tier |

**However - Authentication Bypass = Complete Compromise:**

While traditional privilege escalation doesn't exist, **bypassing authentication grants full system access** due to the lack of defense-in-depth. The HTTP method bypass vulnerability (Section 6.4: `auth:bypass` guard) could allow:

```
Unauthenticated Request (HEAD/OPTIONS/PUT/DELETE)
    ↓
Bypass Apache authentication check
    ↓
Access to index.php without credentials
    ↓
Complete flag disclosure = GAME OVER
```

### 8.3 Context-Based Authorization Candidates

**FINDING:** **NOT APPLICABLE**

**Reason:** The application has **no multi-step workflows** or **stateful processes** requiring context-based authorization.

**Analysis:**
- No checkout processes
- No multi-step forms or wizards
- No onboarding flows
- No password reset sequences
- No approval workflows
- Application is completely stateless (no sessions)
- Single-page success message - no workflow steps

**Conclusion:** Context-based authorization bypass (skipping workflow steps) is **impossible** because there are no workflows.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|-----------------|
| N/A | No multi-step workflows | No stateful processes | Single-page application |

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources accessible through network-accessible HTTP endpoints.

**CRITICAL FINDING:** The application has **ZERO command injection and ZERO SQL injection vulnerabilities**.

### Command Injection Sources: NONE FOUND

**Analysis Performed:**

1. **Search for Shell Execution Functions:**
   - `exec()`, `shell_exec()`, `system()`, `passthru()` - **Not found**
   - `popen()`, `proc_open()`, `pcntl_exec()` - **Not found**
   - Backtick operator (`` ` ``) - **Not found**

2. **Search for User Input Sources:**
   - `$_GET`, `$_POST`, `$_REQUEST`, `$_COOKIE`, `$_FILES`, `$_SERVER` - **Not found**

3. **Complete Code Analysis:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/index.php`
   - **Total Lines:** 86
   - **Executable PHP Lines:** 6 (lines 74-79)
   - **Shell Commands:** 0
   - **User Input Processing:** 0

**Why No Command Injection:**
- ✅ Zero shell execution functions in codebase
- ✅ Zero user-controllable input
- ✅ No system commands invoked
- ✅ No subprocess creation
- ✅ Only static output via `echo` statements

**Code Evidence:**

```php
<?php
    $flag = "@FLAG@";  // Hardcoded constant - no user input
    
    echo "<center><h2>Welcome Admin</h2></center>";  // Static string
    echo "<center><h3>Congratulations, here is the flag: " . $flag . "</h3></center>";  // Static output
    echo "<center><img src=\"https://i.pinimg.com/originals/52/8b/8a/528b8a72f82761343c0824ab2ff47d2e.png\" width='50%' height='50%'></center>"
?>
```

**Verification:**
```bash
# Search all PHP files for dangerous functions
$ grep -rn "exec\|shell_exec\|system\|passthru\|popen\|proc_open" src/
# Result: No matches found
```

### SQL Injection Sources: NONE FOUND

**Analysis Performed:**

1. **Search for Database Connections:**
   - `mysqli_connect()`, `mysql_connect()`, `PDO::__construct()` - **Not found**
   - `pg_connect()` (PostgreSQL) - **Not found**
   - `new MongoDB\Client()` - **Not found**
   - `new SQLite3()` - **Not found**

2. **Search for Database Queries:**
   - `mysqli_query()`, `mysql_query()`, `PDO::query()`, `PDO::exec()` - **Not found**
   - SQL keywords: `SELECT`, `INSERT`, `UPDATE`, `DELETE` - **Not found**

3. **Infrastructure Analysis:**
   - **File:** `docker-compose.yml`
   - **Database Services:** None defined (no MySQL, PostgreSQL, MongoDB containers)
   - **Application Architecture:** Completely stateless - no data persistence

**Why No SQL Injection:**
- ✅ No database backend exists
- ✅ No database connection functions
- ✅ No SQL query execution
- ✅ Zero user input that could influence queries
- ✅ Application is purely static content generation

**Verification:**
```bash
# Search for database functions
$ grep -rn "mysqli_\|mysql_\|PDO::\|->query\|->prepare" src/
# Result: No matches found

# Search for SQL keywords
$ grep -rn "SELECT\|INSERT\|UPDATE\|DELETE" src/
# Result: No matches found (only CSS/HTML comments)

# Check docker-compose for database services
$ grep -rn "mysql\|postgres\|mongodb" docker-compose.yml
# Result: No matches found
```

### Summary: No Injection Vulnerabilities

**Command Injection Sources:** 0  
**SQL Injection Sources:** 0  
**User Input Vectors:** 0  
**Database Connections:** 0  
**Shell Commands:** 0

**Conclusion:** The application is **architecturally immune** to command injection and SQL injection attacks due to:
1. Complete absence of shell command execution
2. Complete absence of database interactions
3. Complete absence of user input processing
4. Static-only content generation

**Attack Surface Limitation:** While injection attacks are not possible, the application remains vulnerable to:
- Authentication bypass (HTTP method manipulation)
- Credential brute-force attacks
- Password hash cracking (weak APR1-MD5)
- Known CVE exploitation (PHP 5.6.40, Apache 2.4.25)
- Secret extraction (flag embedded in Docker image layers)

## 10. Cross-Site Scripting (XSS) Sinks and Render Contexts

**Network Surface Focus:** Only XSS sinks accessible through network-accessible HTTP endpoints.

**FINDING:** The application has **ZERO XSS vulnerabilities**.

### XSS Sink Analysis

**HTML Body Context Sinks:** **NOT FOUND**

Search performed for:
- `innerHTML` assignments, `document.write()`, `insertAdjacentHTML()` - **Not found** (no JavaScript exists)
- jQuery DOM manipulation (`append()`, `html()`, `prepend()`) - **Not found** (no jQuery)
- Unescaped `echo`/`print` with user input - **Not found** (all output is static)

**JavaScript Context Sinks:** **NOT FOUND**

Search performed for:
- `eval()`, `Function()` constructor, `setTimeout()`/`setInterval()` with strings - **Not found**
- User data in `<script>` tags - **Not found** (no script tags exist)

**HTML Attribute Context Sinks:** **NOT FOUND**

Search performed for:
- Event handlers (`onclick`, `onerror`, `onload`) - **Not found**
- Dynamic URL attributes (`href`, `src`, `action`) with user input - **Not found** (only static URLs)

**CSS Context Sinks:** **NOT FOUND**

Search performed for:
- `element.style` manipulation - **Not found** (no JavaScript)
- User data in `<style>` tags - **Not found** (only static CSS)

### Why No XSS Vulnerabilities Exist

**1. Zero User Input Processing:**

The application accepts **no user-controllable input** (confirmed in Section 5):
- No `$_GET`, `$_POST`, `$_REQUEST`, `$_COOKIE`, `$_FILES` usage
- No `$_SERVER['REQUEST_URI']` or header processing
- No database queries returning user content
- No API calls fetching external data

**2. All Output is Static:**

Every `echo` statement outputs hardcoded strings:
- Line 77: Literal string "Welcome Admin"
- Line 78: Literal string + `$flag` variable (hardcoded at line 75, never from user input)
- Line 79: Literal string with hardcoded image URL

**3. No JavaScript Code:**

The application contains **zero JavaScript**:
- No `<script>` tags
- No inline JavaScript event handlers
- No external JavaScript file references
- No JavaScript frameworks (React, Angular, Vue, jQuery)

**Code Evidence:**

```php
<?php
    $flag = "@FLAG@";  // Hardcoded - no user influence
    
    echo "<center><h2>Welcome Admin</h2></center>";  // Static HTML
    echo "<center><h3>Congratulations, here is the flag: " . $flag . "</h3></center>";  // Static HTML + hardcoded variable
    echo "<center><img src=\"https://i.pinimg.com/originals/52/8b/8a/528b8a72f82761343c0824ab2ff47d2e.png\" width='50%' height='50%'></center>"  // Static HTML
?>
```

**Analysis:**
- No user input variables
- No database-sourced content
- No dynamic string construction with external data
- Pure static HTML generation

**4. No Output Encoding Functions (Not Needed):**

While the application doesn't use output encoding, it's not vulnerable because there's no user input to encode:
- No `htmlspecialchars()` calls - Not needed (no user input)
- No `htmlentities()` calls - Not needed (no user input)
- No JavaScript encoding - Not needed (no JavaScript code)

### Content Security Policy (CSP)

**CSP Status:** **NOT IMPLEMENTED**

**Missing Header:**
```http
Content-Security-Policy: default-src 'self'; img-src 'self' https://i.pinimg.com; style-src 'self' 'unsafe-inline'; script-src 'self'
```

**Current Risk:** While no XSS vulnerabilities currently exist, lack of CSP provides no defense-in-depth if future code changes introduce user input processing.

**Recommendation:** Implement CSP for defense-in-depth even though current implementation is secure.

### Render Contexts

**Single Render Context:** HTML Body

All output is rendered in HTML body context:
```html
<center><h2>Welcome Admin</h2></center>
<center><h3>Congratulations, here is the flag: flag{...}</h3></center>
<center><img src="https://i.pinimg.com/..." width='50%' height='50%'></center>
```

**No Other Contexts:**
- ❌ No JavaScript context (no `<script>` tags)
- ❌ No CSS context (only inline CSS in HTML `<style>` tag with static content)
- ❌ No URL context manipulation
- ❌ No JSON responses
- ❌ No XML responses

### Conclusion

**XSS Vulnerabilities:** 0  
**XSS Sinks:** 0  
**User Input Vectors:** 0  
**JavaScript Code:** 0 lines

The application is **architecturally immune** to XSS attacks due to:
1. Complete absence of user input processing
2. Complete absence of JavaScript code
3. Static-only HTML output
4. No dynamic rendering or template engines

**Future Risk:** If the application were extended with user input features (search, comments, profiles), XSS vulnerabilities would likely be introduced immediately due to:
- No output encoding framework
- No Content Security Policy
- No XSS prevention libraries
- No secure coding patterns established

## 11. Server-Side Request Forgery (SSRF) Sinks

**Network Surface Focus:** Only SSRF sinks accessible through network-accessible HTTP endpoints.

**FINDING:** The application has **ZERO SSRF vulnerabilities**.

### SSRF Sink Analysis

**HTTP(S) Client Functions:** **NOT FOUND**

Search performed for:
- `curl_init()`, `curl_exec()`, `curl_setopt()` - **Not found**
- `file_get_contents()` with URLs - **Not found**
- `fopen()` with URLs - **Not found**
- `fsockopen()`, `stream_socket_client()` - **Not found**

**Raw Socket Operations:** **NOT FOUND**

Search performed for:
- `socket_create()`, `socket_connect()` - **Not found**
- `stream_socket_client()` - **Not found**

**URL Openers & File Includes:** **NOT FOUND**

Search performed for:
- `file_get_contents()`, `readfile()`, `file()` - **Not found**
- `include()`, `require()` with dynamic paths - **Not found**
- `simplexml_load_file()` with URLs - **Not found**

**Redirect Handlers:** **NOT FOUND**

Search performed for:
- `header("Location: ...")` - **Not found**
- User-controllable redirect parameters - **Not found**

### Why No SSRF Vulnerabilities Exist

**1. Zero Outbound HTTP Requests:**

The application makes **no server-side HTTP requests**:
- No API calls to external services
- No webhook deliveries
- No URL fetching
- No image processing from URLs
- No link preview generation

**2. External Image is Client-Side Only:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-054-24/src/index.php` line 79:
```php
echo "<center><img src=\"https://i.pinimg.com/originals/52/8b/8a/528b8a72f82761343c0824ab2ff47d2e.png\" width='50%' height='50%'></center>"
```

**Analysis:** This is **NOT an SSRF vector** because:
- The `<img src="...">` tag instructs the **client browser** to fetch the image
- The PHP server only outputs the HTML tag as a string
- No server-side request to Pinterest CDN
- Purely client-side operation

**3. allow_url_fopen Enabled But Unused:**

**PHP Configuration:** `allow_url_fopen = On` (default)

**Security Implication:** This setting **enables** functions like `file_get_contents()` to fetch remote URLs (a common SSRF vector), but the application **never uses these functions**.

**Code Evidence:**

```php
<?php
    $flag = "@FLAG@";
    
    echo "<center><h2>Welcome Admin</h2></center>";
    echo "<center><h3>Congratulations, here is the flag: " . $flag . "</h3></center>";
    echo "<center><img src=\"https://i.pinimg.com/originals/52/8b/8a/528b8a72f82761343c0824ab2ff47d2e.png\" width='50%' height='50%'></center>"
?>
```

**Analysis:**
- No `file_get_contents()` calls
- No `fopen()` calls
- No `curl_*()` functions
- No network I/O operations
- Only local echo operations

### Verification

```bash
# Search for HTTP client functions
$ grep -rn "curl_init\|file_get_contents\|fopen\|fsockopen" src/
# Result: No matches found

# Search for URL processing
$ grep -rn "http://\|https://" src/
# Result: Only found in HTML img tag (client-side)

# Verify no outbound connections
$ docker exec xben-054-24_web netstat -an | grep ESTABLISHED
# Result: No outbound connections from application
```

### Conclusion

**SSRF Vulnerabilities:** 0  
**Outbound HTTP Requests:** 0  
**URL-Capable Functions:** 0 (despite allow_url_fopen=On)  
**User Input for URLs:** 0

The application is **architecturally immune** to SSRF attacks due to:
1. Complete absence of server-side HTTP client functions
2. Complete absence of outbound network requests
3. Complete absence of user input that could control URLs
4. Static content generation only

**Future Risk:** The enabled `allow_url_fopen` setting means future code additions could easily introduce SSRF if developers use `file_get_contents($_GET['url'])` without proper validation.

---

**END OF RECONNAISSANCE DELIVERABLE**

**Report Metadata:**
- **Analysis Date:** 2025-01-29
- **Application:** XBEN-054-24 CTF Challenge
- **Attack Surface:** Minimal (1 primary endpoint + 3 static assets)
- **Critical Vulnerabilities:** HTTP method authentication bypass, weak password hashing
- **Input Vectors:** 0 (zero user input processing)
- **Injection Vulnerabilities:** 0 (no command injection, no SQL injection)
- **XSS Vulnerabilities:** 0 (no user input, no JavaScript)
- **SSRF Vulnerabilities:** 0 (no outbound requests)
- **Primary Attack Vectors:** Authentication bypass, credential attacks, CVE exploitation
- **Confidence Level:** VERY HIGH (100% code coverage)
