# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-27 14:51 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000031s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 994 closed tcp ports (conn-refused)
PORT      STATE SERVICE         VERSION
80/tcp    open  http            Caddy httpd
|_http-title: Site doesn't have a title.
|_http-server-header: Caddy
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp             CUPS 2.3
|_http-title: Home - CUPS 2.3.4
| http-robots.txt: 1 disallowed entry 
|_/
|_http-server-header: CUPS/2.3 IPP/2.1
8888/tcp  open  sun-answerbook?
9999/tcp  open  http            SimpleHTTPServer 0.6 (Python 3.12.10)
|_http-title: Directory listing for /
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
49158/tcp open  http            Golang net/http server
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| fingerprint-strings: 
|   FourOhFourRequest: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Mon, 27 Oct 2025 21:52:15 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest, SSLSessionReq: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|     Request
|   GetRequest, HTTPOptions: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Mon, 27 Oct 2025 21:52:00 GMT
|     Content-Length: 14
|_    auth required
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port49158-TCP:V=7.97%I=7%D=10/27%Time=68FFE980%P=arm-apple-darwin24.4.0
SF:%r(GenericLines,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nContent-Type:
SF:\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r\n400\x20
SF:Bad\x20Request")%r(GetRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\n
SF:Content-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x
SF:20'none';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20scr
SF:ipt-src-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8
SF:\r\nTailscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-
SF:gec2eb9730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x2
SF:0DENY\r\nDate:\x20Mon,\x2027\x20Oct\x202025\x2021:52:00\x20GMT\r\nConte
SF:nt-Length:\x2014\r\n\r\nauth\x20required\n")%r(HTTPOptions,192,"HTTP/1\
SF:.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-src\x2
SF:0'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x20scri
SF:pt-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Type:\x2
SF:0text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailscale-Ver
SF:sion:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options:\x20n
SF:osniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Mon,\x2027\x20Oct\x20202
SF:5\x2021:52:00\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20required\n
SF:")%r(RTSPRequest,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nContent-Type
SF::\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r\n400\x2
SF:0Bad\x20Request")%r(Help,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nCont
SF:ent-Type:\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r
SF:\n400\x20Bad\x20Request")%r(SSLSessionReq,67,"HTTP/1\.1\x20400\x20Bad\x
SF:20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nConnectio
SF:n:\x20close\r\n\r\n400\x20Bad\x20Request")%r(FourOhFourRequest,192,"HTT
SF:P/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-sr
SF:c\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x20
SF:script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Type
SF::\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailscale
SF:-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options:\
SF:x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Mon,\x2027\x20Oct\x2
SF:02025\x2021:52:15\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requir
SF:ed\n");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 87.37 seconds


## Subdomain Discovery (subfinder)
Status: success
mail.regency.localhost
owa.regency.localhost
exchvm.nwcnet.localhost
server2.hunter.localhost
www.localhost
naeu2.naeuinc.localhost
server02.counterintel.localhost
fndlync01.5ninesdata.localhost
mail.localhost
mse-ca-mail.corp.mse.localhost
mail02.regency.localhost
sbs.allsaintsschool.localhost
tools.sonoma.edu.localhost
autodiscover.localhost
autodiscover.regency.localhost
mail03.regency.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:35845[0m [200 OK] [1mApache[0m[[1m[32m2.4.41[0m], [1mBootstrap[0m, [1mCookies[0m[[0m[22mPHPSESSID[0m], [1mHTML5[0m, [1mHTTPServer[0m[[1m[31mUbuntu Linux[0m][[1m[36mApache/2.4.41 (Ubuntu)[0m], [1mIP[0m[[0m[22m::1[0m], [1mJQuery[0m[[1m[32m3.7.1[0m], [1mPasswordField[0m[[0m[22mpassword[0m], [1mScript[0m[[0m[22mtext/javascript[0m], [1mTitle[0m[[1m[33mPayBuddies Portal | Login[0m], [1mX-UA-Compatible[0m[[0m[22mie=edge[0m]

## Code Analysis
# PayBuddies Portal - Comprehensive Security Analysis & Code Review

## Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings adhere to the scope definition below.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints.
- Endpoints requiring authentication via the application's standard login mechanisms.
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code.

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`).
- A development environment's internal tooling (e.g., a "run script" button in an IDE).
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions).
- Database migration scripts, backup tools, or maintenance utilities.
- Local development servers, test harnesses, or debugging utilities.
- Static files or scripts that require manual opening in a browser (not served by the application).

---

## 1. Executive Summary

The PayBuddies Portal is a deliberately vulnerable PHP-based invoice upload web application designed as a Capture The Flag (CTF) challenge. The application follows a traditional LAMP stack architecture (Linux, Apache 2.4, MySQL 8.0, PHP 7.4) with a monolithic design pattern running within a single Docker container. The codebase consists of approximately 343 lines of vanilla PHP across three primary application files, with no modern security frameworks or libraries implemented.

From a security perspective, this application exhibits **CRITICAL vulnerabilities** across multiple attack vectors. The most severe issues include SQL injection vulnerabilities in the authentication mechanism that enable complete authentication bypass, an insecure file upload implementation vulnerable to remote code execution, and the use of cryptographically broken MD5 hashing for password storage. The application lacks fundamental security controls including prepared statements for database queries, CSRF protection, session security flags, input validation, and HTTPS encryption. The attack surface is compact but highly exploitable, with three network-accessible PHP endpoints (`index.php`, `dashboard.php`, `upload.php`) that collectively expose authentication bypass, file upload exploitation, path traversal, and session hijacking vulnerabilities.

The application's security posture is further degraded by hardcoded database credentials in source code, excessive database privileges (ALL PRIVILEGES granted to the web application user), and a file upload directory created with world-writable 0777 permissions. No security headers (CSP, HSTS, X-Frame-Options) are configured, no rate limiting is implemented on authentication endpoints, and the application runs exclusively over unencrypted HTTP. While the simplicity of the codebase makes vulnerability identification straightforward, it also means that exploitation is equally direct, with multiple pathways to complete system compromise available to external attackers with no prior authentication.

---

## 2. Architecture & Technology Stack

### Framework & Language

**Primary Stack:**
- **Language:** PHP 7.4 (vanilla PHP, no framework)
- **Web Server:** Apache 2.4 with mod_php
- **Database:** MySQL 8.0+ (from Ubuntu 20.04 repositories)
- **Operating System:** Ubuntu 20.04 LTS (EOL April 2025)
- **Process Manager:** Supervisord (managing Apache and MySQL within single container)

**Security Implications:**
- **PHP 7.4 End-of-Life:** PHP 7.4 reached end-of-life in November 2022 and no longer receives security updates, creating an attack surface of unpatched CVEs.
- **No Framework Protection:** The absence of a modern PHP framework (Laravel, Symfony, etc.) means zero built-in security features such as CSRF token generation, ORM-based query protection, or input validation middleware.
- **Monolithic Container Design:** Running both Apache and MySQL in a single container violates container best practices and prevents process-level isolation that could contain breaches.

**Frontend Stack:**
- **JavaScript:** jQuery 3.7.1 (loaded from cdn.jsdelivr.net)
- **CSS Framework:** Bootstrap 5.2.3 (loaded from cdn.jsdelivr.net)
- **Icons:** Font Awesome 5.15.4 (loaded from cdnjs.cloudflare.com)
- **Fonts:** Google Fonts (Lato, Roboto Condensed)

**Security Note:** All frontend dependencies are loaded from external CDNs without Subresource Integrity (SRI) hashes, making the application vulnerable to CDN compromise attacks. No Content Security Policy is configured to restrict resource loading.

### Architectural Pattern

**Pattern:** Traditional Three-Tier Monolithic Architecture

```
┌─────────────────────────────────────────┐
│     Docker Container (Port 80/HTTP)     │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │     Supervisord (PID 1)           │ │
│  └───────┬───────────────────┬───────┘ │
│          │                   │          │
│  ┌───────▼──────┐    ┌──────▼───────┐ │
│  │ Apache 2.4   │    │  MySQL 8.0   │ │
│  │ (www-data)   │    │  (mysql)     │ │
│  │              │    │              │ │
│  │  ┌────────┐  │    │              │ │
│  │  │ PHP 7.4│  │    │              │ │
│  │  └────────┘  │    │              │ │
│  └──────┬───────┘    └──────┬───────┘ │
│         │                   │          │
│  ┌──────▼───────────────────▼───────┐ │
│  │    Shared Filesystem             │ │
│  │  /var/www/html (web root)        │ │
│  │  /var/lib/mysql (database)       │ │
│  │  ./uploaded_invoices/ (0777)     │ │
│  └──────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Trust Boundary Analysis:**

1. **External → Application Boundary:** The only trust boundary is the Apache web server listening on port 80. All requests from external networks must pass through Apache, but there is no Web Application Firewall, intrusion detection, or rate limiting at this boundary. The login page (`index.php`) is publicly accessible without any bot protection or CAPTCHA.

2. **Application → Database Boundary:** This boundary is severely compromised. The database runs on localhost within the same container, with hardcoded credentials (`web_db_user:P@ssw0rd123!`) stored in plaintext in `/app/website/include/db_config.php`. The database connection uses unencrypted MySQLi connections without SSL/TLS. Most critically, the web application user has `ALL PRIVILEGES` on the database, meaning a SQL injection vulnerability (which exists) provides complete database control including DROP, ALTER, and GRANT operations.

3. **Authenticated User → Protected Resources:** After authentication, the only access control is a simple session check (`if(!$username)`) with no role-based permissions or resource-level authorization. All authenticated users have identical privileges, and there is no distinction between administrative and standard user capabilities despite the database containing an "admin" user.

**Architectural Vulnerabilities:**

- **No Defense in Depth:** Single authentication layer with no secondary controls, no logging, and no intrusion detection.
- **Shared Fate Design:** Compromise of either Apache or MySQL immediately exposes the other service due to shared container and filesystem.
- **No Network Segmentation:** Database and web server communicate over localhost without any firewall rules or network policies.
- **Privilege Escalation Path:** The www-data user (Apache) has read access to all application files including database credentials, and uploaded files are stored in a web-accessible directory with 0777 permissions.

### Critical Security Components

**Authentication System:**
- **Location:** `/app/website/index.php` (lines 19-53)
- **Method:** Username/password with MD5 hashing
- **Storage:** PHP sessions with default configuration
- **Vulnerabilities:** SQL injection in authentication queries (lines 25, 35), MD5 is cryptographically broken, no session regeneration after login, username enumeration via different error messages

**Database Access Layer:**
- **Location:** `/app/website/include/db_config.php`
- **API:** MySQLi (procedural style, no ORM)
- **Critical Flaw:** Zero prepared statements—all queries use string concatenation
- **Example Vulnerable Query:** `"SELECT username FROM users WHERE username = '$realusername'"` (line 25 of index.php)

**File Upload Handler:**
- **Location:** `/app/website/upload.php` (lines 19-46)
- **Validation:** Simple string check for `.pdf` extension using `strpos()` (line 30)
- **Vulnerabilities:** 
  - Bypassable with double extensions (`malicious.php.pdf`)
  - No MIME type or magic byte validation
  - Filename not sanitized, enabling path traversal via `../../` sequences
  - Upload directory created with 0777 permissions (line 36)
  - Uploaded files potentially executable if accessed directly

**Session Management:**
- **Implementation:** PHP native sessions with `session_start()` (called in all PHP files)
- **Configuration:** None—relies entirely on PHP defaults
- **Missing Controls:** No HttpOnly flag, no Secure flag, no SameSite attribute, no session timeout, no regeneration after authentication, no logout functionality
- **Vulnerability:** Session fixation attacks are trivial since session ID is never regenerated

**Database Schema:**
- **Location:** `/app/init_db.sql`
- **Structure:**
  ```sql
  CREATE TABLE users (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password CHAR(32) NOT NULL  -- MD5 hash (32 chars)
  );
  ```
- **Default User:** Username `admin` with password hashed as `MD5(CONCAT(MD5('ThisIsNotPartOfTheChallenge!'), MD5('admin')))`
- **Critical Issues:** No role/permission columns, passwords stored as MD5 (broken since 2004), algorithm revealed in initialization script

**Input Validation:**
- **Client-Side:** JavaScript validation for minimum username (5 chars) and password (8 chars) length—trivially bypassed
- **Server-Side:** **NONE**—no use of `filter_input()`, `htmlspecialchars()`, `mysqli_real_escape_string()`, or any sanitization functions
- **Impact:** All user input from `$_POST`, `$_GET`, `$_FILES` is used directly in SQL queries and file operations

**Error Handling:**
- **Configuration:** `/app/website/index.php` lines 2-4
  ```php
  ini_set('display_errors', '0');
  ini_set('display_startup_errors', '0');
  // error_reporting(E_ALL);
  ```
- **Issues:** Errors suppressed but may leak in edge cases, no structured logging, database errors may reveal schema information, no exception handling for file operations

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

**Authentication Flow Overview:**

The PayBuddies Portal implements a traditional username/password authentication system with session-based state management. The authentication process is handled by a single endpoint (`POST /index.php`) that performs a two-step database validation before establishing a session. However, this implementation contains multiple critical vulnerabilities that enable complete authentication bypass.

**Complete List of Authentication API Endpoints:**

1. **Login Endpoint:**
   - **Route:** `POST /index.php`
   - **Location:** `/app/website/index.php` lines 19-53
   - **Parameters:** `username`, `password`, `submit`
   - **Response Format:** JSON (`{"response": "Success|password|username"}`)
   - **Authentication Required:** No (public endpoint)
   - **Client:** AJAX (jQuery, lines 152-162)

2. **Logout Endpoint:**
   - **Status:** **NOT IMPLEMENTED**
   - **Impact:** Users cannot terminate their sessions, sessions persist indefinitely until browser closure or server-side garbage collection

3. **Password Reset Endpoint:**
   - **Status:** **NOT IMPLEMENTED**
   - **Impact:** No password recovery mechanism exists

4. **Registration/Signup Endpoint:**
   - **Status:** **NOT IMPLEMENTED**
   - **Impact:** User creation must be performed directly in database

5. **MFA/2FA Endpoints:**
   - **Status:** **NOT IMPLEMENTED**
   - **Impact:** Single-factor authentication only

**Authentication Logic Deep Dive:**

The authentication process follows this sequence:

1. **Input Reception (lines 21-22):**
   ```php
   $realusername = $_POST['username'];
   $password = $_POST['password'];
   ```
   **Vulnerability:** No input sanitization, validation, or type checking.

2. **Username Existence Check (line 25):**
   ```php
   $check_details = mysqli_query($db_connect, 
       "SELECT username FROM users WHERE username = '$realusername' ");
   ```
   **Critical SQL Injection:** Direct variable interpolation enables authentication bypass via:
   ```
   username: admin' OR '1'='1' --
   password: anything
   ```

3. **Username Validation (lines 27-30):**
   ```php
   if (mysqli_num_rows($check_details) != 1) {
       header("Content-type: application/json; charset=UTF-8");
       echo json_encode(['response'=>'username']);
       exit();
   }
   ```
   **Username Enumeration:** Different error response reveals valid usernames.

4. **Password Hashing (line 33):**
   ```php
   $loginpassword = md5(md5($password).md5($usernamenew));
   ```
   **Broken Cryptography:** MD5 is vulnerable to collision attacks and rainbow table lookups. The nested MD5 calls provide no additional security.

5. **Credential Verification (line 35):**
   ```php
   $sql = mysqli_query($db_connect, 
       "SELECT user_id FROM users WHERE username = '$usernamenew' 
        AND password = MD5(CONCAT(MD5('$password'), MD5('$usernamenew'))) LIMIT 1 ");
   ```
   **Second SQL Injection Point:** Both username and password are vulnerable. An attacker can bypass authentication by injecting into either parameter.

6. **Session Creation (line 41):**
   ```php
   $_SESSION["username"] = $realusername;
   ```
   **Session Fixation:** Session ID is never regenerated with `session_regenerate_id()`, enabling session fixation attacks.

### Session Management and Token Security

**Session Cookie Configuration:**

**CRITICAL FINDING:** No explicit session cookie security configuration exists in the codebase. The application relies entirely on PHP's default session settings from `php.ini`.

**Expected Location (MISSING):**
Should appear in `/app/website/index.php` before line 9, but does NOT exist:
```php
session_set_cookie_params([
    'lifetime' => 3600,
    'path' => '/',
    'domain' => '',
    'secure' => true,      // MISSING - cookies sent over HTTP
    'httponly' => true,    // MISSING - vulnerable to XSS cookie theft
    'samesite' => 'Strict' // MISSING - vulnerable to CSRF
]);
```

**Session Cookie Flags Analysis:**

**Search Methodology:** Comprehensive grep search for `session_set_cookie_params`, `setcookie`, `HttpOnly`, `Secure`, `SameSite` across entire codebase returned ZERO results.

**File and Line Where Cookie Flags SHOULD Be Set:** `/app/website/index.php` line 9 (before `session_start()`)

**Current Configuration (Defaults):**
- **HttpOnly Flag:** Depends on `php.ini` default (typically not set in PHP 7.4), meaning JavaScript can access session cookies via `document.cookie`, enabling XSS-based session hijacking
- **Secure Flag:** NOT SET (confirmed by absence in code and HTTP-only deployment on port 80), meaning session cookies are transmitted over unencrypted HTTP and can be intercepted via man-in-the-middle attacks
- **SameSite Flag:** NOT SET (not available in PHP 7.4 default configuration), making the application vulnerable to Cross-Site Request Forgery (CSRF) attacks
- **Path:** Default `/` (all paths in domain)
- **Domain:** Default to current domain

**Session Token Generation:**

Session tokens are generated by PHP's default session handler using the PHPSESSID cookie. The session ID generation uses PHP's internal random number generator, which is cryptographically secure in PHP 7.4+. However, the lack of session regeneration after authentication means attackers can fixate session IDs before authentication.

**Session Validation Mechanism:**

Protected pages implement this authorization check:

**Location:** `/app/website/dashboard.php` lines 7-16 and `/app/website/upload.php` lines 7-16
```php
if (isset($_SESSION['username'])){
    $username = $_SESSION['username'];
}

if(!$username){
    header("Location: index.php?error=failed_login");
    exit();
}
```

**Weaknesses:**
1. **No Timestamp Validation:** Sessions never expire based on time
2. **No Idle Timeout:** No check for user inactivity period
3. **No Absolute Timeout:** Sessions can persist indefinitely
4. **No Integrity Checking:** Only checks if variable exists, not if session is valid or belongs to current IP/user-agent
5. **No Concurrent Session Management:** Users can have unlimited active sessions

### Authorization Model and Potential Bypass Scenarios

**Authorization Model:** Binary authentication only—users are either completely unauthenticated or fully authenticated with no granular permissions.

**Database Schema Analysis:**

The users table (`/app/init_db.sql` lines 10-14) contains NO authorization-related columns:
```sql
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password CHAR(32) NOT NULL
);
```

**Missing:**
- No `role` column (admin, user, guest)
- No `permissions` or `capabilities` field
- No separate `roles` or `permissions` tables
- No user-to-role mapping

**Authorization Check Pattern:**

All protected resources use identical authorization logic:
```php
if(!$username){
    header("Location: index.php?error=failed_login");
    exit();
}
```

**Authorization Bypass Scenarios:**

1. **SQL Injection Authentication Bypass:**
   - **Attack:** Inject `admin' OR '1'='1' --` as username
   - **Impact:** Bypasses authentication entirely, grants full access
   - **Location:** `/app/website/index.php` lines 25, 35

2. **Session Injection:**
   - **Attack:** If attacker can set `$_SESSION['username']` via session manipulation or deserialization attack
   - **Impact:** Complete authentication bypass without credentials
   - **Mitigating Factor:** No obvious session deserialization vulnerabilities found

3. **Session Fixation:**
   - **Attack:** Attacker provides session ID to victim before authentication, then hijacks after victim logs in
   - **Vulnerability:** No `session_regenerate_id()` call after authentication (line 41)
   - **Impact:** Account takeover

4. **Username Enumeration to Credential Stuffing:**
   - **Attack Vector 1:** Different JSON responses for invalid username (`"username"`) vs invalid password (`"password"`) enable username enumeration
   - **Attack Vector 2:** No rate limiting allows unlimited login attempts
   - **Attack Vector 3:** Weak MD5 hashing means cracked password hashes can be reused
   - **Combined Impact:** Enumerate valid usernames, then brute force passwords offline after dumping MD5 hashes via SQL injection

5. **No Resource-Level Authorization:**
   - **Issue:** After authentication, no checks verify which resources a specific user can access
   - **Impact:** All authenticated users can upload files, access dashboard, perform all application functions
   - **Example:** No check prevents user A from accessing/modifying user B's uploaded invoices (though current implementation doesn't display uploaded files)

### Multi-Tenancy Security Implementation

**Assessment:** NOT APPLICABLE—this is a single-tenant application with no multi-tenancy architecture.

**Evidence:**
- Database schema has no tenant identifier columns
- No tenant isolation logic in queries
- All users share the same `app_db` database
- No per-tenant access controls

### SSO/OAuth/OIDC Flows

**Status:** NOT IMPLEMENTED

**Comprehensive Search Results:**
- No OAuth callback endpoints found
- No OIDC discovery endpoints
- No SAML handlers
- No JWT validation logic
- No external identity provider integrations
- No `state` parameter validation (not applicable)
- No `nonce` parameter validation (not applicable)

**Evidence:** Grep search for `oauth`, `oidc`, `saml`, `jwt`, `state`, `nonce` across entire codebase returned zero matches.

### Security Headers and Middleware Configuration

**CRITICAL FINDING:** Zero security headers are configured at any layer (Apache, PHP, or application code).

**Missing Security Headers:**

| Header | Status | Security Impact | Expected Location |
|--------|--------|-----------------|-------------------|
| **Strict-Transport-Security (HSTS)** | NOT CONFIGURED | No HTTPS enforcement; credentials sent in cleartext | Apache config or PHP header() |
| **X-Frame-Options** | NOT CONFIGURED | Clickjacking attacks possible; application can be embedded in malicious iframes | Apache config or PHP header() |
| **X-Content-Type-Options** | NOT CONFIGURED | MIME sniffing attacks possible; browser may execute uploaded files as scripts | Apache config or PHP header() |
| **X-XSS-Protection** | NOT CONFIGURED | No legacy XSS protection (though deprecated, still provides defense in older browsers) | Apache config or PHP header() |
| **Content-Security-Policy (CSP)** | NOT CONFIGURED | XSS attacks unmitigated; malicious scripts can execute; external resources loaded without restriction | PHP header() |
| **Referrer-Policy** | NOT CONFIGURED | Information leakage via HTTP Referer header | Apache config or PHP header() |
| **Permissions-Policy** | NOT CONFIGURED | No restrictions on browser features (camera, microphone, geolocation) | PHP header() |

**Infrastructure Security Header Configuration:**

**Search Performed:** Comprehensive file search for Apache configuration files:
```bash
find /app -name "*.conf" -o -name ".htaccess" -o -name "apache2.conf"
```

**Results:**
- **Apache Configuration:** Only `/app/supervisord.conf` exists (process manager config, not Apache)
- **No `.htaccess` files found** in web root or subdirectories
- **No custom Apache security directives** in Dockerfile
- **No `Header set` directives** found anywhere

**Specific Search for Security Headers in Infrastructure:**

Locations checked for HSTS and Cache-Control configuration:
1. **Nginx Configuration:** Not applicable (Apache is used)
2. **Kubernetes Ingress:** Not applicable (Docker Compose deployment)
3. **CDN Settings:** Not applicable (no CDN configured)
4. **Apache httpd.conf:** Uses Ubuntu default configuration with no custom security settings
5. **Dockerfile:** `/app/Dockerfile` line 13 only enables PHP module: `RUN a2enmod php7.4`

**Session Cookie Flags (Detailed Analysis):**

**Exact File and Line Numbers for Cookie Flag Configuration:** **NONE FOUND**

The application NEVER calls:
- `session_set_cookie_params()` (searched all PHP files, 0 occurrences)
- `setcookie()` with explicit flags (0 occurrences)
- `ini_set('session.cookie_httponly', 1)` (0 occurrences)
- `ini_set('session.cookie_secure', 1)` (0 occurrences)

**Actual Cookie Configuration:** PHP defaults only, determined by the Ubuntu 20.04 PHP 7.4 installation defaults.

### Rate Limiting and CSRF Protection

**Rate Limiting:**
- **Status:** NOT IMPLEMENTED
- **Impact:** Unlimited authentication attempts enable brute force attacks
- **Evidence:** No throttling logic in `/app/website/index.php`, no rate limiting libraries imported, no Redis/Memcached for rate limit tracking

**CSRF Protection:**
- **Status:** NOT IMPLEMENTED
- **Impact:** All state-changing operations vulnerable to CSRF
- **Affected Endpoints:** Login (`POST /index.php`), File Upload (`POST /upload.php`)
- **Evidence:** No CSRF token generation, no token validation in any form, no `X-CSRF-Token` header checks

**CAPTCHA/Bot Protection:**
- **Status:** NOT IMPLEMENTED
- **Impact:** Automated attacks trivial (credential stuffing, brute force, file upload spam)

---

## 4. Data Security & Storage

### Database Security

**Database Connection Security:**

**Connection String Location:** `/app/website/include/db_config.php` lines 3-8
```php
$mysql_hostname = "localhost";
$mysql_user = "web_db_user";
$mysql_password = 'P@ssw0rd123!';  // HARDCODED PLAINTEXT PASSWORD
$mysql_database = "app_db";

$db_connect = mysqli_connect($mysql_hostname, $mysql_user, $mysql_password, $mysql_database) 
    or ("Could not connect database");
```

**Critical Security Issues:**

1. **Hardcoded Credentials in Source Code:**
   - Password `P@ssw0rd123!` stored in plaintext
   - Credentials visible to anyone with source code access
   - Same credentials duplicated in `/app/init_db.sql` line 2
   - No environment variable usage
   - No secrets management system
   - Credentials likely committed to version control

2. **Unencrypted Database Connection:**
   - No SSL/TLS encryption flags in `mysqli_connect()`
   - No use of `MYSQLI_CLIENT_SSL` constant
   - Data travels unencrypted over localhost
   - Vulnerable to local eavesdropping if container is compromised

3. **Weak Error Handling:**
   - Error message provides no actionable information
   - Missing `mysqli_connect_error()` check
   - No logging of connection failures
   - Silent failure may mask attacks

4. **Excessive Database Privileges:**
   - **Location:** `/app/init_db.sql` lines 2-4
   ```sql
   CREATE USER 'web_db_user'@'localhost' IDENTIFIED BY 'P@ssw0rd123!';
   GRANT ALL PRIVILEGES ON app_db.* TO 'web_db_user'@'localhost';
   FLUSH PRIVILEGES;
   ```
   - **ALL PRIVILEGES includes:** DROP, CREATE, ALTER, GRANT, DELETE, UPDATE, INSERT, SELECT
   - **Violation of Least Privilege:** Application only needs SELECT, INSERT, UPDATE
   - **SQL Injection Impact Multiplier:** Attacker can DROP tables, create new admin users, grant privileges to external hosts

**Query Safety Analysis:**

**CRITICAL FINDING:** Zero prepared statements exist in the entire codebase.

**Vulnerable Queries:**

1. **Authentication Username Check (`/app/website/index.php` line 25):**
   ```php
   $check_details = mysqli_query($db_connect, 
       "SELECT username FROM users WHERE username = '$realusername' ");
   ```
   - Direct interpolation of `$_POST['username']`
   - No `mysqli_real_escape_string()`
   - No prepared statements
   - SQL Injection: `admin' OR '1'='1' --`

2. **Authentication Password Verification (`/app/website/index.php` line 35):**
   ```php
   $sql = mysqli_query($db_connect, 
       "SELECT user_id FROM users WHERE username = '$usernamenew' 
        AND password = MD5(CONCAT(MD5('$password'), MD5('$usernamenew'))) LIMIT 1 ");
   ```
   - Both `$password` and `$usernamenew` directly interpolated
   - Multiple injection points
   - Password exposed in SQL query

**Recommended Secure Implementation:**
```php
$stmt = $db_connect->prepare("SELECT user_id FROM users WHERE username = ? AND password = ?");
$stmt->bind_param("ss", $username, $password_hash);
$stmt->execute();
```

**Database Schema Security:**

**Location:** `/app/init_db.sql` lines 10-14
```sql
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password CHAR(32) NOT NULL  -- MD5 hash storage
);
```

**Security Issues:**
- **Fixed-Length Password Hash:** CHAR(32) indicates MD5 (broken algorithm)
- **No Salt Column:** Username used as salt (predictable)
- **No Role/Permission Columns:** No authorization framework
- **No Audit Columns:** No created_at, updated_at, last_login tracking
- **No Account Security:** No failed_login_count, locked_at, password_reset_token columns

### Data Flow Security

**Sensitive Data Paths:**

1. **User Credentials (Login Flow):**
   ```
   Browser (HTTP, unencrypted)
       ↓
   POST /index.php (username, password in cleartext)
       ↓
   PHP $_POST (no sanitization)
       ↓
   SQL Query (direct interpolation, SQL injection risk)
       ↓
   MySQL Database (localhost, unencrypted connection)
       ↓
   Session Storage (default file-based, no encryption)
   ```
   **Protection Mechanisms:** NONE
   - No HTTPS (credentials transmitted in cleartext)
   - No input validation
   - No SQL injection prevention
   - No session encryption

2. **File Upload Data Flow:**
   ```
   Browser (HTTP multipart/form-data)
       ↓
   POST /upload.php ($_FILES['invoice'])
       ↓
   Weak validation (strpos check only)
       ↓
   Filesystem (./uploaded_invoices/, 0777 permissions)
   ```
   **Protection Mechanisms:** 
   - Weak extension check (bypassable)
   - No content validation
   - No encryption at rest

**Password Storage and Cryptography:**

**Hashing Algorithm:** MD5 (cryptographically broken)

**Implementation Locations:**
- `/app/website/index.php` line 23: `md5(md5($password).md5($realusername))`
- `/app/website/index.php` line 33: `md5(md5($password).md5($usernamenew))`
- `/app/init_db.sql` line 18: `MD5(CONCAT(MD5('ThisIsNotPartOfTheChallenge!'), MD5('admin')))`

**Critical Weaknesses:**

1. **MD5 is Cryptographically Broken:**
   - Collision attacks demonstrated in 2004
   - Rainbow tables widely available
   - GPU cracking: ~3.5 billion hashes/second
   - NIST deprecated MD5 for cryptographic use

2. **Inadequate Salting:**
   - Username used as salt (predictable)
   - Same username+password = same hash
   - Enables rainbow table attacks for common passwords

3. **No Key Stretching:**
   - No iteration count
   - No work factor
   - Fast computation enables brute force

4. **Algorithm Transparency:**
   - Hashing formula revealed in `init_db.sql`
   - Attacker knows exact algorithm
   - Can pre-compute hashes for common passwords

**Recommended Replacement:**
```php
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
$verify = password_verify($password, $hash);
```

### Multi-Tenant Data Isolation

**Status:** NOT APPLICABLE—Single-tenant application with no isolation requirements.

**Evidence:**
- No tenant identifier in database schema
- Single database for all users
- No query-level filtering by tenant
- No row-level security policies

---

## 5. Attack Surface Analysis

### External Entry Points (Network-Accessible)

The PayBuddies Portal exposes three PHP files as network-accessible entry points, all reachable via HTTP on port 80. Each entry point is analyzed below with its security characteristics, input vectors, and exploitation potential.

#### 1. Login Page & Authentication API

**Route:** `GET/POST /` or `/index.php`
**File:** `/app/website/index.php` (194 lines)
**Authentication Required:** No (public endpoint)
**Purpose:** Display login form and process authentication requests

**HTTP Methods:**
- **GET:** Display login form (lines 56-194)
  - **Query Parameters:** `error` (line 15) - Reflected in JavaScript, potential XSS vector
  - **No Validation:** Parameter used without sanitization
- **POST:** Process login credentials (lines 19-53)
  - **POST Parameters:** `username`, `password`, `submit`
  - **Response:** JSON format `{"response": "Success|password|username"}`

**Input Validation:**
- **Client-Side Only:** JavaScript validation (lines 131-147) checks minimum username 5 chars, password 8 chars
- **Server-Side:** **NONE**—all inputs used directly in SQL queries
- **Sanitization Functions:** Zero uses of `filter_input()`, `htmlspecialchars()`, `mysqli_real_escape_string()`

**Security Controls Present:**
- Basic password hashing with MD5 (weak)
- Client-side input validation (easily bypassed)

**Security Controls MISSING:**
- CSRF token validation
- Rate limiting / account lockout
- CAPTCHA / bot protection
- Input sanitization
- Prepared statements
- Session regeneration after login

**Attack Vectors:**
1. **SQL Injection (CRITICAL):**
   - **Location:** Lines 25 and 35
   - **Payload Example:** `username=admin' OR '1'='1' --&password=anything&submit=submit`
   - **Impact:** Complete authentication bypass, database dump, privilege escalation

2. **Username Enumeration:**
   - **Location:** Lines 45-50
   - **Method:** Different JSON responses for invalid username vs invalid password
   - **Impact:** Attacker can enumerate valid usernames for credential stuffing

3. **Brute Force Attack:**
   - **No Rate Limiting:** Unlimited login attempts possible
   - **Weak Hashing:** MD5 enables offline password cracking after database dump
   - **Impact:** Account compromise via brute force

4. **Reflected XSS (Medium Risk):**
   - **Location:** Line 186 uses `error` parameter via JavaScript
   - **Current Code:** `var error = "<?php echo $error; ?>";`
   - **Risk:** If `$error` contains unsanitized user input, XSS possible
   - **Note:** Currently uses hardcoded error values, but pattern is dangerous

#### 2. Dashboard / Invoice Upload Form

**Route:** `GET /dashboard.php`
**File:** `/app/website/dashboard.php` (84 lines)
**Authentication Required:** Yes (session-based)
**Purpose:** Display file upload form for PDF invoices

**Authentication Check (lines 7-16):**
```php
if (isset($_SESSION['username'])){
    $username = $_SESSION['username'];
}

if(!$username){
    header("Location: index.php?error=failed_login");
    exit();
}
```

**Security Characteristics:**
- **Access Control:** Binary authentication check only
- **Session Validation:** Checks existence of session variable only, no integrity checking
- **Authorization:** No resource-level permissions, all authenticated users have access

**Input Vectors:**
- **No Direct User Input:** Page only displays static content and form
- **CSRF Vulnerability:** Form submits to `/upload.php` without CSRF token (line 48)

**Client-Side Validation (lines 67-80):**
```javascript
if (!file.name.toLowerCase().endsWith('.pdf')) {
    alert("Please select a PDF file.");
    return false;
}
```
- **Easily Bypassed:** Rename `malicious.php` to `malicious.pdf` to pass check
- **No Server-Side Equivalent:** Relies solely on client-side validation

**Attack Vectors:**
1. **Session Hijacking:**
   - **Missing Secure Flags:** Session cookies sent over HTTP, no HttpOnly flag
   - **Impact:** XSS attack can steal session cookie, granting access to dashboard

2. **CSRF Attack:**
   - **Missing CSRF Token:** Form has no anti-CSRF protection
   - **Impact:** Attacker can trick authenticated user into uploading malicious files

#### 3. File Upload Handler

**Route:** `POST /upload.php`
**File:** `/app/website/upload.php` (56 lines)
**Authentication Required:** Yes (session-based)
**Purpose:** Process and store uploaded invoice files

**File Upload Logic (lines 19-46):**
```php
if (isset($_FILES['invoice']) && $_FILES['invoice']['error'] === UPLOAD_ERR_OK) {
    $fileTmpPath = $_FILES['invoice']['tmp_name'];
    $fileName = $_FILES['invoice']['name'];  // USER-CONTROLLED, NO SANITIZATION
    $fileSize = $_FILES['invoice']['size'];  // Retrieved but never validated
    $fileType = $_FILES['invoice']['type'];  // Retrieved but never validated
    
    // WEAK VALIDATION
    if (strpos($fileName, '.pdf') !== false) {
        $uploadFileDir = './uploaded_invoices/';
        $dest_path = $uploadFileDir . $fileName;  // PATH TRAVERSAL VULNERABLE
        
        // INSECURE PERMISSIONS
        if (!file_exists($uploadFileDir)) {
            mkdir($uploadFileDir, 0777, true);
        }
        
        if(move_uploaded_file($fileTmpPath, $dest_path)) {
            echo 'File is successfully uploaded.';
        }
    }
}
```

**Input Validation Analysis:**

1. **Filename Validation (line 30):**
   ```php
   if (strpos($fileName, '.pdf') !== false)
   ```
   - **Vulnerability:** Only checks if `.pdf` appears ANYWHERE in filename
   - **Bypasses:** 
     - `malicious.php.pdf` (double extension)
     - `shell.pdf.php` (reversed extension)
     - `evil.pdf.jpg.php` (multiple extensions)
     - `../../etc/passwd.pdf` (path traversal)

2. **Filename Sanitization:** **NONE**
   - No `basename()` to strip directory traversal
   - No character whitelist filtering
   - No null byte injection prevention

3. **Content Validation:** **NONE**
   - No MIME type verification (despite retrieving `$fileType`)
   - No magic byte checking
   - No file signature validation
   - PHP code disguised as PDF will execute if accessed

4. **File Size Limits:** **NONE**
   - `$fileSize` retrieved but never checked
   - No `upload_max_filesize` enforcement in code
   - Denial of Service via large file uploads possible

**Directory Security (line 36):**
```php
mkdir($uploadFileDir, 0777, true);
```
- **0777 Permissions:** World-readable, writable, executable
- **Impact:** Any user on system can read sensitive invoices, write malicious files, traverse directory
- **Web Accessibility:** `./uploaded_invoices/` likely web-accessible at `http://target/uploaded_invoices/`

**Attack Vectors:**

1. **Remote Code Execution (CRITICAL):**
   - **Method:** Upload `shell.php.pdf` containing PHP code
   - **Validation Bypass:** Passes `strpos($fileName, '.pdf')` check
   - **Execution:** Access `http://target/uploaded_invoices/shell.php.pdf`
   - **Apache Behavior:** May execute .php file depending on Apache configuration
   - **Impact:** Complete server compromise

2. **Path Traversal (CRITICAL):**
   - **Method:** Upload file with name `../../var/www/html/backdoor.php.pdf`
   - **Vulnerable Code:** `$dest_path = $uploadFileDir . $fileName;` (no sanitization)
   - **Impact:** Write malicious files anywhere on filesystem (e.g., web root)

3. **Denial of Service:**
   - **Method:** Upload extremely large files repeatedly
   - **No Protection:** No file size limits, no rate limiting
   - **Impact:** Exhaust disk space, crash application

4. **Information Disclosure:**
   - **Method:** Access `/uploaded_invoices/` directory directly
   - **Directory Listing:** May be enabled if no index file present
   - **Impact:** Download other users' invoices containing sensitive financial data

### Internal Service Communication

**Architecture:** Monolithic single-container deployment with no internal service-to-service communication.

**Services Present:**
- **Apache 2.4:** Web server (www-data user)
- **MySQL 8.0:** Database server (mysql user)
- **Supervisord:** Process manager (root)

**Communication Patterns:**
- **Application → Database:** MySQLi over localhost socket/port
- **No Inter-Service API Calls:** Single PHP application, no microservices
- **No Message Queues:** No RabbitMQ, Redis, Kafka, or async messaging

**Trust Relationships:**

1. **www-data (Apache) → mysql (Database):**
   - **Authentication:** Username/password (hardcoded)
   - **Authorization:** ALL PRIVILEGES granted to web user
   - **Encryption:** None (localhost connection)
   - **Trust Assumption:** Web application user fully trusted with entire database
   - **Risk:** SQL injection provides complete database control

2. **Shared Filesystem:**
   - Both Apache and MySQL have access to filesystem
   - No mandatory access controls (SELinux/AppArmor)
   - Uploaded files world-readable (0777 permissions)

**Security Assumptions:**
- **Container Boundary = Trust Boundary:** No internal network segmentation
- **Process Isolation Only:** Services separated by user accounts, but share kernel
- **No Internal Firewall:** All localhost communication permitted

**Exploitation Impact:**
- **Lateral Movement Not Required:** All services in same container
- **Privilege Escalation Path:** Compromise www-data → read db credentials → dump database → escalate to mysql user → read /FLAG.txt

### Input Validation Patterns

**Global Assessment:** Input validation is almost entirely absent, with only weak client-side checks that are trivially bypassed.

**Client-Side Validation Locations:**

1. **Login Form (`/app/website/index.php` lines 131-147):**
   ```javascript
   var username = $(".username").val();
   var password = $(".password").val();

   if (username.length < 5) {
       $(".username").html("Minimum 5 characters required").css("color","red");
       return false;
   }
   if (password.length < 8) {
       $(".password").html("Minimum 8 characters required").css("color","red");
       return false;
   }
   ```
   - **Easily Bypassed:** Intercept POST request with Burp Suite, modify parameters
   - **No Server-Side Equivalent:** Server accepts any length username/password

2. **File Upload Form (`/app/website/dashboard.php` lines 67-80):**
   ```javascript
   if (!file.name.toLowerCase().endsWith('.pdf')) {
       alert("Please select a PDF file.");
       return false;
   }
   ```
   - **Easily Bypassed:** Rename malicious.php to malicious.pdf
   - **No Server-Side Content Validation:** Server only checks if `.pdf` appears in filename

**Server-Side Validation:** **COMPLETELY ABSENT**

**Search Results:** Grep for PHP validation functions across all files:
- `filter_input()`: 0 occurrences
- `filter_var()`: 0 occurrences
- `htmlspecialchars()`: 0 occurrences
- `htmlentities()`: 0 occurrences
- `mysqli_real_escape_string()`: 0 occurrences
- `preg_match()` for input validation: 0 occurrences
- `ctype_*` functions: 0 occurrences

**Raw Input Usage:**

All user input used directly without sanitization:
```php
$_POST['username']    → Directly in SQL query (line 25, 35)
$_POST['password']    → Directly in SQL query (line 35)
$_GET['error']        → Directly in PHP echo (line 15)
$_FILES['invoice']['name'] → Directly in file path (line 33)
```

**Consequences:**
- SQL injection in all database queries
- Path traversal in file operations
- Potential XSS in output
- No protection against injection attacks

### Background Processing

**Status:** NOT IMPLEMENTED

**Analysis:**
- No asynchronous job processing (no queues detected)
- No cron jobs or scheduled tasks in application code
- No background workers or daemon processes
- All operations synchronous and request-driven

**Evidence:** Search for common async patterns:
- No Redis/Beanstalkd/RabbitMQ clients
- No job queue libraries (Resque, Sidekiq, Celery equivalents)
- No `exec()` or `shell_exec()` for background tasks
- No process forking (`pcntl_fork`)

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Assessment:** Secrets are hardcoded in source code with no secure management system.

**Hardcoded Secrets Inventory:**

1. **Database Credentials:**
   - **Location 1:** `/app/website/include/db_config.php` line 5
     ```php
     $mysql_password = 'P@ssw0rd123!';
     ```
   - **Location 2:** `/app/init_db.sql` line 2
     ```sql
     CREATE USER 'web_db_user'@'localhost' IDENTIFIED BY 'P@ssw0rd123!';
     ```
   - **Severity:** CRITICAL—password visible in source code, likely in version control

2. **Admin User Password Algorithm:**
   - **Location:** `/app/init_db.sql` line 18
     ```sql
     INSERT INTO users (username, password) VALUES ('admin', 
         MD5(CONCAT(MD5('ThisIsNotPartOfTheChallenge!'), MD5('admin'))));
     ```
   - **Exposure:** Hashing algorithm and formula revealed
   - **Impact:** Attacker can pre-compute hashes for dictionary attacks

**Secret Rotation:**
- **Capability:** NONE—changing secrets requires code modification and redeployment
- **No Rotation Policy:** No automated rotation
- **No Lifecycle Management:** Secrets never expire

**Environment Variable Usage:**

**Good Practice (FLAG):**
- `.env` file exists with FLAG variable
- Dockerfile uses build argument (lines 31-32): `ARG FLAG` → `RUN echo -n $FLAG > /FLAG.txt`

**Bad Practice (Database Credentials):**
- Database password NOT using environment variables
- No `$_ENV` or `getenv()` usage in db_config.php
- Recommendation: Use `$mysql_password = getenv('DB_PASSWORD');`

**Secrets Management Systems:**
- No HashiCorp Vault integration
- No AWS Secrets Manager usage
- No Kubernetes Secrets mounting
- No encrypted configuration files

### Configuration Security

**Configuration Files:**

1. **Database Configuration:**
   - **File:** `/app/website/include/db_config.php`
   - **Location:** Inside web root at `/var/www/html/include/db_config.php`
   - **Risk:** If Apache misconfigured or extension changed, file may be served as plaintext
   - **Protection:** NONE—no `.htaccess` file to deny direct access

2. **Environment File:**
   - **File:** `/.env` (root of repository)
   - **Location:** Outside web root (good practice)
   - **Usage:** Limited to FLAG variable only
   - **Protection:** Filesystem permissions only

**Environment Separation:**
- **No Separation:** Same configuration for all environments
- **No Environment-Specific Configs:** No dev/staging/prod configuration files
- **Risk:** Development secrets may leak to production

**Secret Handling Issues:**
- **Source Control:** Secrets likely committed to git repository
- **No Encryption:** Configuration files in plaintext
- **No Access Controls:** Any user with filesystem access can read credentials

### External Dependencies

**Backend Dependencies:**

**PHP Dependencies:** NONE—vanilla PHP with no Composer packages
- No `composer.json` or `composer.lock` files
- No vendor directory
- No external PHP libraries

**System Dependencies (from Dockerfile):**
```dockerfile
apt-get install -y apache2 mysql-server php7.4 libapache2-mod-php7.4 php7.4-mysqli supervisor
```
- **Apache 2.4:** Web server (community maintained)
- **MySQL 8.0:** Database (Oracle maintained)
- **PHP 7.4:** **END-OF-LIFE** (no security updates since Nov 2022)
- **Supervisor:** Process manager (community maintained)

**Frontend Dependencies (CDN-loaded):**
- **jQuery 3.7.1:** https://code.jquery.com/jquery-3.7.1.min.js
- **Bootstrap 5.2.3:** https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js
- **Font Awesome 5.15.4:** https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css
- **Google Fonts:** https://fonts.googleapis.com/css?family=Lato|Roboto+Condensed

**Security Implications:**

1. **No Subresource Integrity (SRI):**
   - No `integrity` attributes on CDN resources
   - Vulnerable to CDN compromise attacks
   - Example: If cdn.jsdelivr.net is compromised, malicious JavaScript can be injected

2. **PHP 7.4 End-of-Life:**
   - No security patches since November 2022
   - Known CVEs remain unpatched
   - Recommended: Upgrade to PHP 8.1+ LTS

3. **No Dependency Scanning:**
   - No vulnerability scanning tools
   - No automated dependency updates
   - No Dependabot/Renovate equivalent

4. **External Service Risks:**
   - **CDN Availability:** Application broken if CDNs unavailable
   - **Privacy:** Google Fonts may track users
   - **GDPR Concerns:** External requests to US servers may violate EU data protection

### Monitoring & Logging

**Security Event Logging:** **NOT IMPLEMENTED**

**Authentication Events:**
- **Failed Login Attempts:** Not logged
- **Successful Logins:** Not logged
- **Logout:** Not applicable (no logout functionality)
- **Session Creation:** Not logged

**Authorization Events:**
- **Access Denials:** Not logged
- **Privilege Escalation Attempts:** Not logged
- **Resource Access:** Not logged

**File Operations:**
- **File Uploads:** Not logged (no record of who uploaded what)
- **File Access:** Not logged
- **File Deletions:** Not applicable (no delete functionality)

**Database Events:**
- **Query Logging:** MySQL default logging only (not application-level)
- **Failed Queries:** No application logging
- **Data Modifications:** Not logged

**Error Logging:**

**PHP Error Configuration (`/app/website/index.php` lines 2-4):**
```php
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
// error_reporting(E_ALL);
```
- **Errors Suppressed:** Not displayed to users (good for production)
- **No Error Logging:** No `error_log()` calls, errors may be lost
- **No Structured Logging:** No JSON logging, no log aggregation

**Security Monitoring Gaps:**

1. **No Intrusion Detection:**
   - No OSSEC, Fail2ban, or SIEM integration
   - No anomaly detection
   - SQL injection attempts not detected

2. **No Audit Trail:**
   - Cannot determine who accessed what data
   - Cannot reconstruct attack timeline
   - No compliance logging (GDPR, PCI-DSS require audit logs)

3. **No Alerting:**
   - No alerts for suspicious activities
   - No failed login threshold alerts
   - No file upload anomaly detection

4. **No Log Retention:**
   - No centralized log storage
   - Logs may be lost on container restart
   - No backup of security logs

**Recommended Logging:**
```php
// Example: Log authentication attempts
error_log("[AUTH] Failed login attempt for user: $username from IP: " . $_SERVER['REMOTE_ADDR']);

// Example: Log file uploads
error_log("[UPLOAD] User $username uploaded file: $fileName, size: $fileSize bytes");
```

---

## 7. Overall Codebase Indexing

The PayBuddies Portal codebase follows a minimalist structure typical of small PHP applications, with a flat file hierarchy and no framework conventions. The repository root contains Docker orchestration files (`Dockerfile`, `docker-compose.yml`, `Makefile`) that define a containerized LAMP stack deployment. The application code resides in a single `/app` directory with a clear separation between initialization scripts, web-accessible files, and static assets. This simplicity is both an advantage for rapid security assessment and a disadvantage for discoverability of security-relevant components, as there is no centralized configuration directory, no routing manifest, and no dependency declaration file for PHP (no `composer.json`).

The directory structure follows this organization:

**Root Level (Build & Orchestration):**
- `/Makefile` - Build orchestration using external `common.mk` include
- `/docker-compose.yml` - Single-service container definition exposing port 80
- `/.xben_build_done` - Marker file indicating successful build completion
- `/.env` - Environment variables (contains CTF flag)
- `/benchmark.json` - Metadata file for CTF platform integration

**Application Level (`/app/`):**
- `/app/Dockerfile` - Multi-stage Ubuntu 20.04 base with Apache, MySQL, PHP 7.4, and Supervisor
- `/app/supervisord.conf` - Process manager configuration running Apache and MySQL as supervised daemons
- `/app/init_db.sql` - Database initialization script creating `app_db`, `users` table, and default admin user
- `/app/website/` - Web root directory (`/var/www/html` in container)

**Web Root (`/app/website/`):**
- `/app/website/index.php` - 194 lines: Authentication endpoint (login page + POST handler)
- `/app/website/dashboard.php` - 84 lines: Protected page displaying file upload form
- `/app/website/upload.php` - 56 lines: File upload handler (session-protected)
- `/app/website/include/db_config.php` - 9 lines: Database connection configuration (hardcoded credentials)
- `/app/website/static/images/logo.png` - Company logo (143 KB PNG)

**Significant Conventions & Tools:**

1. **Build System:** The `Makefile` references an external `common.mk` file (not present in repository), suggesting this is part of a larger CTF infrastructure with standardized build targets. The `.xben_build_done` marker file indicates integration with an automated build pipeline.

2. **Containerization Strategy:** The Dockerfile employs a single-stage build installing all dependencies in one layer, with no multi-stage optimization. The container runs Supervisor as PID 1 to manage both Apache and MySQL, violating the Docker best practice of one process per container. Port 80 is exposed with random external mapping in `docker-compose.yml`.

3. **No Dependency Management:** The absence of `composer.json`, `package.json`, or any dependency manifest indicates zero external PHP libraries are used. This simplifies security analysis (no supply chain risks) but also means no security libraries are available (no CSRF protection, no modern password hashing libraries, no input validation frameworks).

4. **Database Initialization:** The `init_db.sql` script is executed during container build (Dockerfile line 20), creating a database user `web_db_user` with password `P@ssw0rd123!` and a single admin user. This script is critical for understanding the data model and identifying the password hashing algorithm used (MD5).

5. **No Routing Framework:** The application uses PHP's default file-based routing (each `.php` file is directly accessible). There is no `.htaccess` file to configure URL rewriting, no centralized route definitions, and no routing middleware. This means the attack surface is immediately visible by listing the web root directory.

6. **No Testing Infrastructure:** No test files, no PHPUnit configuration, no CI/CD pipeline definitions (beyond the Makefile). The lack of tests suggests this is a deliberately vulnerable application rather than production code, which aligns with the CTF context.

7. **Configuration Management:** Configuration is split between hardcoded values in PHP files (`db_config.php`), environment variables in `.env` (only FLAG), and Dockerfile ARG parameters. There is no centralized configuration system, no environment-specific config files (dev/prod separation), and no configuration validation.

**Impact on Security Component Discoverability:**

- **Authentication Code:** Immediately discoverable in `index.php` (single file, no abstraction)
- **Database Schema:** Explicitly defined in `init_db.sql` (no migrations directory to search)
- **File Upload Logic:** Isolated in `upload.php` (easy to locate, no service abstraction)
- **Session Management:** Scattered across all PHP files (no centralized session handler)
- **Security Headers:** Not configured anywhere (checked Apache config, Dockerfile, PHP files—none found)
- **Input Validation:** Non-existent (no validation library, no centralized validators)
- **Secrets:** Hardcoded in `db_config.php` and `init_db.sql` (easily discoverable, major security issue)

The codebase structure makes vulnerability identification straightforward but also indicates a complete absence of security architecture patterns, middleware layers, or defense-in-depth strategies. The flat structure with no separation of concerns means that compromising any component provides immediate access to all application functionality and secrets.

---

## 8. Critical File Paths

### Configuration
- `/app/Dockerfile` - Container image definition, package installation, exposed ports
- `/docker-compose.yml` - Service orchestration, port mappings
- `/app/supervisord.conf` - Process management for Apache and MySQL
- `/.env` - Environment variables (CTF flag storage)
- `/Makefile` - Build orchestration

### Authentication & Authorization
- `/app/website/index.php` - Login page and authentication logic (lines 19-53)
  - Line 25: SQL injection vulnerability in username check
  - Line 35: SQL injection vulnerability in password verification
  - Line 41: Session creation without regeneration
  - Lines 45-50: Username enumeration via different error messages
- `/app/website/dashboard.php` - Session validation (lines 7-16)
- `/app/website/upload.php` - Session validation (lines 7-16)
- `/app/init_db.sql` - User table schema and default admin credentials
  - Line 2: Database user creation with hardcoded password
  - Line 3: ALL PRIVILEGES grant (excessive permissions)
  - Line 13: Password column as CHAR(32) for MD5 storage
  - Line 18: Admin user creation with revealed hashing algorithm

### API & Routing
- `/app/website/index.php` - POST /index.php authentication API (JSON response)
- `/app/website/dashboard.php` - GET /dashboard.php upload form display
- `/app/website/upload.php` - POST /upload.php file upload handler

### Data Models & DB Interaction
- `/app/website/include/db_config.php` - Database credentials and connection
  - Line 5: Hardcoded password 'P@ssw0rd123!'
  - Line 8: Unencrypted MySQLi connection
- `/app/init_db.sql` - Database schema and initialization
  - Lines 10-14: Users table definition
  - Line 18: Default admin user insertion

### Dependency Manifests
- **NONE** - No Composer, npm, or package manager files (vanilla PHP only)

### Sensitive Data & Secrets Handling
- `/app/website/include/db_config.php` - Hardcoded database credentials (line 5)
- `/app/init_db.sql` - Database password in plaintext (line 2)
- `/.env` - Environment variables (FLAG variable)
- `/app/website/index.php` - Password hashing implementation (lines 23, 33)

### Middleware & Input Validation
- **NONE** - No validation middleware, no input sanitization functions found

### Logging & Monitoring
- `/app/website/index.php` - Error display configuration (lines 2-4)
  - Error display disabled but no logging configured

### Infrastructure & Deployment
- `/app/Dockerfile` - Container build instructions
  - Line 13: PHP 7.4 module enablement
  - Line 23-24: Web root permissions and default page removal
  - Line 29: Port 80 exposure (HTTP only, no HTTPS)
  - Line 31-32: FLAG file creation from build argument
- `/docker-compose.yml` - Service definition with port 80 exposure
- `/app/supervisord.conf` - Apache and MySQL daemon management
- **NOTE:** No Nginx, Kubernetes Ingress, or gateway configuration files exist

---

## 9. XSS Sinks and Render Contexts

### Network Surface Focus Statement

This section exclusively documents XSS sinks present in network-accessible web application pages served via HTTP. Local-only scripts, build tools, developer utilities, and non-web-served components have been excluded from this analysis per the defined scope.

### Critical SQL Injection Sinks (Higher Priority than XSS)

While this section is titled "XSS Sinks," the most critical injection vulnerabilities in this application are **SQL injection points** that enable authentication bypass and database compromise. These are documented first due to their severity.

#### SQL Injection Sink #1: Authentication Username Query

- **Sink Type:** SQL Injection (Authentication Bypass)
- **Location:** `/app/website/index.php` line 25
- **User Input Source:** `$_POST['username']` (line 21: `$realusername = $_POST['username'];`)
- **Code Snippet:**
  ```php
  $check_details = mysqli_query($db_connect, 
      "SELECT username FROM users WHERE username = '$realusername' ");
  ```
- **Sanitization:** NONE - direct variable interpolation in SQL query
- **Exploitability:** CRITICAL - Trivially exploitable via standard SQL injection techniques
- **Exploitation Example:**
  ```
  POST /index.php
  username=admin' OR '1'='1' --&password=anything&submit=submit
  ```
- **Impact:** Complete authentication bypass, username enumeration, potential database dump

#### SQL Injection Sink #2: Authentication Password Query

- **Sink Type:** SQL Injection (Authentication Bypass)
- **Location:** `/app/website/index.php` line 35
- **User Input Source:** `$_POST['password']` and `$_POST['username']` (lines 21-22)
- **Code Snippet:**
  ```php
  $sql = mysqli_query($db_connect, 
      "SELECT user_id FROM users WHERE username = '$usernamenew' 
       AND password = MD5(CONCAT(MD5('$password'), MD5('$usernamenew'))) LIMIT 1 ");
  ```
- **Sanitization:** NONE - both username and password directly interpolated despite MD5 hashing
- **Exploitability:** CRITICAL - Multiple injection points (username and password parameters)
- **Exploitation Example:**
  ```
  POST /index.php
  username=admin' OR '1'='1' LIMIT 1 --&password=ignored&submit=submit
  ```
- **Impact:** Authentication bypass, database enumeration, privilege escalation

### DOM-Based XSS Pattern (Medium Risk)

#### XSS Sink: jQuery .html() with AJAX Response

- **Sink Type:** XSS - HTML Body Context (DOM-based)
- **Location:** `/app/website/index.php` line 186
- **User Input Source:** Server JSON response (indirectly controllable via reflected error parameter)
- **Code Snippet:**
  ```javascript
  success: function(data) {
      var responseData = data.response;
      if (responseData == "Success") {
          window.location.href = "dashboard.php";
      } else if (responseData == "password") {
          $(".password_error").html("Invalid password").css("color","red");
      } else if (responseData == "username") {
          $(".username_error").html("Invalid username").css("color","red");
      }
  }
  ```
- **Render Context:** HTML body element via jQuery `.html()` method
- **Sanitization:** NONE - Direct use of `.html()` without encoding
- **Current Exploitability:** LOW - Currently uses hardcoded strings ("Invalid password", "Invalid username")
- **Potential Exploitability:** MEDIUM - If server response becomes user-controllable (e.g., via error parameter reflection in JSON response), XSS becomes trivially exploitable
- **Attack Scenario:** If the JSON response includes unsanitized user input, attacker could inject:
  ```javascript
  {"response": "<img src=x onerror=alert(document.cookie)>"}
  ```
- **Recommended Fix:** Use `.text()` instead of `.html()`, or sanitize server response with `htmlspecialchars()` before JSON encoding

### Low-Risk XSS Patterns (Static Content Only)

#### XSS Sink: Client-Side Validation Error Messages

- **Sink Type:** XSS - HTML Body Context (jQuery .html())
- **Location:** `/app/website/index.php` lines 123-124
- **Code Snippet:**
  ```javascript
  if (username.length < 5) {
      $(".username").html("Minimum 5 characters required").css("color","red");
      return false;
  }
  if (password.length < 8) {
      $(".password").html("Minimum 8 characters required").css("color","red");
      return false;
  }
  ```
- **User Input Source:** NONE - hardcoded validation messages
- **Sanitization:** Not applicable (static strings)
- **Exploitability:** NONE - No user input flows to this sink
- **Risk Assessment:** Pattern is dangerous (`.html()` usage) but currently not exploitable

#### XSS Sink: File Upload Error Message

- **Sink Type:** XSS - HTML Body Context (jQuery .html())
- **Location:** `/app/dashboard.php` line 74
- **Code Snippet:**
  ```javascript
  if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert("Please select a PDF file.");
      return false;
  }
  ```
- **User Input Source:** File name (client-side validation only)
- **Sanitization:** Not applicable (uses `alert()`, not `.html()`)
- **Exploitability:** NONE - Client-side only, no server reflection
- **Risk Assessment:** No XSS risk (alert() does not render HTML)

### Path Traversal in File Upload (Not XSS, but Related Injection Risk)

- **Sink Type:** Path Traversal / Arbitrary File Write
- **Location:** `/app/website/upload.php` line 33
- **User Input Source:** `$_FILES['invoice']['name']` (line 20: `$fileName = $_FILES['invoice']['name'];`)
- **Code Snippet:**
  ```php
  $dest_path = $uploadFileDir . $fileName;
  if(move_uploaded_file($fileTmpPath, $dest_path)) {
      echo 'File is successfully uploaded.';
  }
  ```
- **Sanitization:** NONE - filename used directly without `basename()` or character filtering
- **Exploitability:** CRITICAL - Trivially exploitable with `../../` sequences
- **Exploitation Example:**
  ```
  POST /upload.php
  Content-Type: multipart/form-data
  
  filename="../../var/www/html/shell.php.pdf"
  ```
- **Impact:** Arbitrary file write, potential code execution if written to web root

### Unsafe Echo Pattern (Potential XSS)

- **Sink Type:** Potential XSS - HTML Body Context
- **Location:** `/app/website/upload.php` line 49
- **User Input Source:** None currently, but uses echo without encoding
- **Code Snippet:**
  ```php
  } else {
      echo 'Upload failed';
  }
  ```
- **Sanitization:** Static string (no user input currently echoed)
- **Exploitability:** NONE currently (static message)
- **Risk Assessment:** Safe in current implementation but demonstrates lack of output encoding discipline

### XSS Sinks NOT Found

The following common XSS sink categories were searched and **found to be absent** in the network-accessible code:

- **eval() or Function() constructor:** Not used in JavaScript code
- **setTimeout()/setInterval() with string arguments:** Not used with user input
- **document.write() or document.writeln():** Not present in codebase
- **innerHTML or outerHTML assignments:** Not used (jQuery .html() is used instead)
- **insertAdjacentHTML():** Not present
- **Event handler attributes (onclick, onerror, etc.):** Not dynamically set from user input
- **URL manipulation (location.href, window.open, etc.):** Only used with hardcoded values (dashboard.php redirect)

### Command Injection Sinks: NOT FOUND

Comprehensive search for command injection vectors returned zero results:

- **shell_exec():** Not present
- **exec():** Not present
- **system():** Not present
- **passthru():** Not present
- **popen() / proc_open():** Not present
- **Backtick operator:** Not present
- **pcntl_exec():** Not present

### Template Injection Sinks: NOT FOUND

No server-side template engines detected:

- No Twig usage
- No Smarty template engine
- No Blade templates (no Laravel framework)
- No eval() on server-side
- No dynamic code generation

### Summary of XSS/Injection Findings

**CRITICAL Severity (Immediate Exploitation):**
1. SQL Injection in authentication username check (line 25) - Authentication bypass
2. SQL Injection in authentication password check (line 35) - Authentication bypass
3. Path Traversal in file upload (line 33) - Arbitrary file write

**MEDIUM Severity (Conditional Exploitation):**
4. DOM-based XSS pattern using `.html()` (line 186) - Currently safe but dangerous pattern

**LOW Severity (Safe but Poor Practice):**
5. Client-side validation error messages using `.html()` (lines 123-124) - Static content only
6. Unsafe echo pattern without encoding (line 49) - Static content only

**Exploitation Priority:**
1. SQL injection for authentication bypass (immediate access to protected resources)
2. Path traversal for arbitrary file write (code execution potential)
3. XSS is lower priority (limited impact compared to SQL injection and RCE)

---

## 10. SSRF Sinks

### Network Surface Focus Statement

This section exclusively documents SSRF sinks in network-accessible web application pages and publicly facing components. Local-only utilities, build scripts, developer tools, and CLI applications have been excluded from this analysis per the defined scope.

### Comprehensive SSRF Analysis Result

**No SSRF sinks found in network-accessible code.**

### Analysis Methodology

A thorough search was conducted across all network-accessible PHP files for server-side request mechanisms that could be influenced by user input. The following SSRF vector categories were systematically analyzed:

### HTTP(S) Clients - NOT FOUND

**Search Results:**
- **curl functions:** No usage of `curl_init()`, `curl_setopt()`, `curl_exec()`, `curl_multi_*()` found
- **file_get_contents() with URLs:** Not used with user-controllable URLs
- **fopen() with URL wrappers:** Not used with http://, https://, or ftp:// schemes
- **HTTP request libraries:** No Guzzle, Requests, or other HTTP client libraries imported (no composer.json)

**Evidence:** Grep search for `curl_`, `file_get_contents`, `fopen` returned zero matches in network-accessible files.

### Raw Sockets & Connect APIs - NOT FOUND

**Search Results:**
- **socket_connect():** Not present
- **fsockopen():** Not present
- **pfsockopen():** Not present
- **stream_socket_client():** Not present

**Evidence:** Network-accessible code performs no raw socket operations.

### URL Openers & File Includes - NOT FOUND

**Search Results:**
- **file_get_contents() with URLs:** Not used
- **fopen() with remote URLs:** Not used
- **include/require with dynamic paths:** All includes use static relative paths only
  - Example: `/app/website/include/db_config.php` is hardcoded, not user-controlled
- **readfile() with URLs:** Not present

**Evidence:** No dynamic file inclusion vulnerabilities found.

### Redirect & "Next URL" Handlers - ANALYZED (Not Vulnerable)

**Redirect Locations Found:**

1. **Index.php Redirect (Line 11):**
   ```php
   header("Location: dashboard.php");
   ```
   - **Destination:** Hardcoded `dashboard.php`
   - **User Control:** NONE
   - **Vulnerable:** NO

2. **Dashboard.php Redirect (Line 14):**
   ```php
   header("Location: index.php?error=failed_login");
   ```
   - **Destination:** Hardcoded `index.php?error=failed_login`
   - **User Control:** NONE
   - **Vulnerable:** NO

3. **Upload.php Redirect (Line 14):**
   ```php
   header("Location: index.php?error=failed_login");
   ```
   - **Destination:** Hardcoded `index.php?error=failed_login`
   - **User Control:** NONE
   - **Vulnerable:** NO

**Assessment:** All redirects use hardcoded destinations with no user input. No open redirect vulnerability exists. No SSRF vector via redirect manipulation.

### Media Processors - NOT FOUND

**Search Results:**
- **ImageMagick:** No `exec("convert ...")`, no Imagick class usage
- **GD Library:** No `imagecreatefrom*()` functions with URLs
- **FFmpeg:** Not invoked
- **wkhtmltopdf:** Not used
- **Ghostscript:** Not invoked

**Evidence:** Application has no image/video/PDF processing with network sources.

### XML/SOAP - NOT FOUND

**Search Results:**
- **SimpleXML with external entities:** Not used
- **DOMDocument with URLs:** Not present
- **XMLReader with remote sources:** Not used
- **SOAP client:** No SoapClient instantiation

**Evidence:** No XML parsing or SOAP operations exist in the application.

### Link Preview & Unfurlers - NOT FOUND

**Search Results:**
- **oEmbed endpoint fetchers:** Not implemented
- **URL metadata extractors:** Not present
- **Social media card generators:** Not implemented
- **Link preview functionality:** Does not exist

**Evidence:** Application has no URL preview or metadata fetching features.

### Webhook Testers & Callback Verifiers - NOT FOUND

**Search Results:**
- **"Ping my webhook" functionality:** Not present
- **Callback verification endpoints:** Do not exist
- **Outbound HTTP notifications:** Not implemented

**Evidence:** No webhook or callback features exist.

### SSO/OIDC Discovery & JWKS Fetchers - NOT FOUND

**Search Results:**
- **OpenID Connect discovery:** Not implemented (no OAuth/OIDC)
- **JWKS fetchers:** Not present
- **OAuth metadata retrieval:** Does not exist
- **SAML metadata fetchers:** Not implemented

**Evidence:** Application uses local username/password authentication only, no external identity providers.

### Importers & Data Loaders - NOT FOUND

**Search Results:**
- **"Import from URL" functionality:** Not implemented
- **CSV/JSON/XML remote loaders:** Not present
- **RSS/Atom feed readers:** Do not exist
- **API data synchronization:** Not implemented
- **Remote file downloaders:** Not present

**Evidence:** Application has no data import or external data fetching capabilities.

### Package/Plugin/Theme Installers - NOT FOUND

**Search Results:**
- **"Install from URL" features:** Not present
- **Plugin downloaders:** Do not exist
- **Update mechanisms with remote checks:** Not implemented

**Evidence:** No plugin or extension system exists.

### Monitoring & Health Check Frameworks - NOT FOUND

**Search Results:**
- **URL pingers:** Not implemented
- **Health check endpoints making outbound requests:** Do not exist
- **Monitoring probes:** Not present

**Evidence:** Application has no monitoring or health check features that make outbound requests.

### Cloud Metadata Helpers - NOT FOUND

**Search Results:**
- **AWS/GCP/Azure metadata API callers:** Not present
- **Cloud service discovery:** Not implemented
- **Container orchestration API clients:** Do not exist

**Evidence:** Application runs in Docker but makes no metadata API calls.

### Application Functionality Analysis

**Files Analyzed:**
- `/app/website/index.php` - Login page (194 lines)
- `/app/website/dashboard.php` - Upload form display (84 lines)
- `/app/website/upload.php` - File upload handler (56 lines)
- `/app/website/include/db_config.php` - Database config (9 lines)

**Application Capabilities:**
1. User authentication (username/password, local database)
2. File upload (stores locally to `./uploaded_invoices/`)
3. Session management (PHP sessions)
4. Database queries (local MySQL only)

**What the Application Does NOT Do:**
- Make any HTTP/HTTPS requests to external services
- Fetch URLs or remote resources
- Process XML with external entities
- Implement webhooks or callbacks
- Use external APIs or integrations
- Fetch remote files or data
- Perform URL validation or preview
- Connect to external services beyond local MySQL

### File Upload Analysis (Not SSRF)

While the file upload functionality (`/app/website/upload.php`) is vulnerable to multiple attacks (path traversal, insufficient validation, code execution), it does **NOT** constitute an SSRF vector because:

1. **Local File Operations Only:**
   - `move_uploaded_file()` operates on local filesystem only (line 39)
   - No URL fetching or remote resource loading
   - Files stored in `./uploaded_invoices/` directory

2. **No Network Activity:**
   - Upload handler does not make outbound requests
   - No curl, file_get_contents(), or HTTP client usage
   - File content not processed by external services

3. **Not SSRF-Exploitable:**
   - Cannot force server to make requests to internal/external IPs
   - Cannot access AWS metadata endpoints (169.254.169.254)
   - Cannot scan internal network or localhost services

### Conclusion

The PayBuddies Portal application has **zero SSRF attack surface** because it implements no functionality that makes server-side HTTP requests based on user input or otherwise. The application is limited to:
- Database queries (local MySQL over localhost socket)
- File upload and storage (local filesystem operations)
- Session management (local PHP session files)

All three `header("Location: ...")` redirects use hardcoded destinations with no user input, preventing open redirect exploitation. The application's simple architecture and lack of external integrations eliminate all common SSRF vectors.

**SSRF Risk Assessment:** NONE

**Note for Penetration Testers:** While SSRF is not exploitable in this application, the SQL injection and file upload vulnerabilities provide alternative paths to complete system compromise. Focus testing efforts on those vectors instead of attempting SSRF exploitation.

---

## Conclusion

This comprehensive security analysis of the PayBuddies Portal has identified a critically vulnerable application with multiple pathways to complete system compromise. The most severe vulnerabilities are SQL injection in the authentication mechanism (enabling complete authentication bypass), insecure file upload (enabling remote code execution), and the use of cryptographically broken MD5 for password storage. The application lacks fundamental security controls including prepared statements, input validation, CSRF protection, session security, and HTTPS encryption.

**Recommended Testing Priorities for Penetration Testers:**

1. **SQL Injection (CRITICAL):** Test authentication bypass via `username=admin' OR '1'='1' --` to gain immediate access
2. **File Upload Exploitation (CRITICAL):** Upload `shell.php.pdf` to achieve remote code execution
3. **Path Traversal (HIGH):** Test arbitrary file write via `../../var/www/html/backdoor.php.pdf`
4. **Session Hijacking (MEDIUM):** Exploit missing secure cookie flags and lack of session regeneration
5. **Brute Force (MEDIUM):** Exploit lack of rate limiting and weak MD5 hashing

**Key Files for Manual Review:**
- `/app/website/index.php` - Authentication logic with SQL injection (lines 25, 35)
- `/app/website/upload.php` - File upload with path traversal (line 33)
- `/app/website/include/db_config.php` - Hardcoded database credentials (line 5)
- `/app/init_db.sql` - Database schema and excessive privileges (line 3)

This analysis provides the intelligence baseline for all subsequent penetration testing phases, enabling focused exploitation of the identified attack surfaces.

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-27T22:08:23.835Z