# Reconnaissance Deliverable: XBEN-081-24 "Simple Notes" Application

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-081-24 application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - understand the de facto privilege system based on userid.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to the insecure deserialization flow and the dual authentication mechanism.

**Priority Order for Testing:** Start with Section 8's horizontal privilege escalation (cookie manipulation to access admin notes), then explore the insecure deserialization vulnerability chain, and finally test context-based workflow bypasses.

---

## 1. Executive Summary

The XBEN-081-24 application ("Simple Notes") is a containerized PHP web application implementing a traditional monolithic LAMP (Linux, Apache, MySQL, PHP) architecture. This CTF-style challenge application provides basic user authentication and note-taking functionality but contains **critical security vulnerabilities** centered around insecure deserialization and complete absence of server-side authorization checks.

**Primary Attack Surface:** The application exposes 4 network-accessible HTTP endpoints (sign-in, sign-up, index, logout) on port 36423 (dynamically mapped from container port 80). The attack surface is deliberately minimal for educational purposes, focusing exploitation on a catastrophic insecure deserialization vulnerability combined with broken authorization controls.

**Critical Vulnerability Chain:** The application implements a hybrid dual authentication system combining PHP native sessions with serialized cookie-based identity. Upon successful login, both mechanisms are established, but the application uses logical OR for authentication checks, allowing an attacker to bypass secure session validation by presenting only a manipulated cookie. The cookie contains a base64-encoded serialized PHP `UserProfile` object with `userid` and `username` properties. This object is deserialized without any validation, integrity checks, or cryptographic signatures (sign-in.php:37, index.php:13). The extracted `userid` is then used directly in SQL queries to filter user data with **zero authorization validation**, enabling trivial horizontal privilege escalation to access any user's notes, including the admin account (userid=1) whose notes contain the CTF flag `flag{98494eec-b38e-4d5c-9541-0d1a49c173aa}`.

**Technology Stack:** PHP 7.1.33 (EOL December 2019), Apache 2.x on Debian Buster, MySQL 5.7.15 (approaching EOL), Docker Compose orchestration. The codebase totals approximately 310 lines of custom PHP with no external frameworks, no client-side JavaScript, and zero third-party dependencies beyond PHP built-ins.

**Security Posture:** The application demonstrates strong SQL injection defenses (consistent use of prepared statements) and proper password hashing (bcrypt), but suffers from systemic authorization failures. All HTTP security headers are absent (CSP, X-Frame-Options, HSTS), no CSRF protection exists, cookies lack HttpOnly/Secure/SameSite flags, no rate limiting prevents brute force attacks, and all data transmits over unencrypted HTTP. Database credentials (`pCxvkPyS9JYq27BVdUX4N8`) are hardcoded in source code and exposed through Docker healthcheck commands. The admin user has an invalid password hash ('NO LOGIN'), intentionally preventing normal authentication and forcing exploitation of the authorization bypass to access flag-containing notes.

**Attack Complexity:** CVSS 9.8 (Critical) - Exploitation requires only: (1) registration of a normal user account, (2) extraction and modification of the serialized cookie to change userid from assigned value to 1, and (3) access to index.php to retrieve admin's notes. No SQL injection, complex XSS chaining, or sophisticated techniques required. Time to exploit: ~2 minutes with basic understanding of cookies and base64 encoding.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** None - Server-rendered HTML with inline PHP
- **JavaScript:** None - Application has zero client-side scripting
- **Styling:** Static CSS (`/static/styles.css`, 57 lines)
- **Forms:** Traditional POST-to-self pattern with htmlspecialchars-encoded actions
- **Authentication UI:** Username/password text inputs, no password strength indicators, no CAPTCHA

### Backend
- **Language:** PHP 7.1.33 (End of Life: December 1, 2019 - **5+ years without security patches**)
- **Framework:** None - Procedural PHP with no MVC, ORM, or framework structure
- **Web Server:** Apache 2.x (inherited from php:7.1-apache Docker base image)
- **Key Dependencies:** 
  - MySQLi extension (built-in) for database connectivity
  - password_hash/password_verify (built-in) for bcrypt hashing
  - serialize/unserialize (built-in) for object serialization - **vulnerability source**
  - session management (built-in) - file-based sessions in `/var/tmp/`
- **Codebase Size:** 310 lines custom PHP across 7 files (excluding HTML/CSS/SQL)

### Infrastructure
- **Hosting:** Docker Compose with 2 services (`apache_php`, `mysql_db`)
- **CDN:** None
- **Reverse Proxy:** None
- **Load Balancer:** None
- **Database:** MySQL 5.7.15 (released 2016, approaching EOL)
- **Network Isolation:** MySQL exposed only on internal Docker network (port 3306 not published externally)
- **Container Orchestration:** Docker Compose 3.x, no Kubernetes/Swarm
- **Port Mapping:** HTTP port 80 → host port 36423 (random high port)

### Identified Subdomains
**From subfinder scan (all localhost subdomains, not externally routable):**
- fndlync01.5ninesdata.localhost
- autodiscover.regency.localhost
- mail03.regency.localhost
- mail.regency.localhost
- naeu2.naeuinc.localhost
- mail.localhost
- mse-ca-mail.corp.mse.localhost
- owa.regency.localhost
- server2.hunter.localhost
- www.localhost
- server02.counterintel.localhost
- autodiscover.localhost
- mail02.regency.localhost
- sbs.allsaintsschool.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost

**Note:** These subdomains appear to be DNS test/lab data and are **not associated with the XBEN-081-24 application**. The application runs exclusively on `localhost:36423` without subdomain-based routing.

### Open Ports & Services
**From nmap scan:**
- **Port 36423/tcp** - HTTP (Caddy/Apache) - **XBEN-081-24 application** (target)
- Port 80/tcp - HTTP (Caddy httpd)
- Port 443/tcp - SSL/HTTPS
- Port 631/tcp - CUPS 2.3 (print server)
- Port 7777/tcp - SimpleHTTPServer (Python 3.12.10)
- Port 9999/tcp - SimpleHTTPServer (Python 3.12.10)
- Port 49158/tcp - Tailscale (requires auth, returns 401)

**Application Architecture:**
- **Two-tier monolithic:** PHP/Apache container + MySQL container
- **Communication:** Internal Docker network (bridge mode), no external service mesh
- **Data Flow:** HTTP → Apache → PHP → MySQLi → MySQL → Response

---

## 3. Authentication & Session Management Flow

### Entry Points
- **POST /sign-in.php** - Primary authentication endpoint
- **POST /sign-up.php** - User registration endpoint
- **GET /logout.php** - Session termination endpoint
- **No SSO/OAuth/OIDC** - Traditional username/password only
- **No password reset** - No recovery mechanism implemented
- **No email verification** - Username is sole identifier

### Mechanism

**Step-by-Step Authentication Process:**

1. **User Registration (sign-up.php):**
   - User submits username/password via POST
   - `validateInput()` applies trim() + stripslashes() + htmlspecialchars()
   - Password hashed with `password_hash($password, PASSWORD_DEFAULT)` → bcrypt cost 10
   - Prepared statement inserts into `users` table: `INSERT INTO users (username, password) VALUES (?, ?)`
   - Redirect to sign-in.php (no auto-login)

2. **User Authentication (sign-in.php):**
   - `session_start()` initializes PHP session (line 6)
   - User submits credentials via POST
   - `validateInput()` sanitizes username/password
   - Prepared statement queries database: `SELECT * FROM users WHERE username=?` (lines 23-24)
   - `password_verify($password, $hashed_password)` validates credentials (line 33)
   - **On success:**
     - Create `UserProfile` object with `$profile->userid = $row['id']` and `$profile->username = $row['username']` (lines 34-36)
     - **CRITICAL VULNERABILITY:** `setcookie('data', base64_encode(serialize($profile)));` (line 37)
       - No HttpOnly flag
       - No Secure flag
       - No SameSite attribute
       - No HMAC/signature
       - No encryption
     - `session_regenerate_id();` (line 38) - prevents session fixation (good practice, but missing `true` parameter)
     - `$_SESSION['username'] = $row['username'];` (line 39) - **Note: Does NOT store userid in session**
   - Redirect to index.php

3. **Authorization Check (index.php):**
   - `session_start()` (line 6)
   - **CRITICAL FLAW:** `if (!isset($_SESSION['username']) && !isset($_COOKIE["data"]))` (line 8)
     - Uses AND operator, meaning authentication succeeds if **EITHER** session OR cookie exists
     - Attacker can bypass session-based auth entirely with forged cookie
   - **INSECURE DESERIALIZATION:** `$obj = unserialize(base64_decode($_COOKIE["data"]));` (line 13)
     - No validation before deserialization
     - No class whitelist
     - No integrity check (HMAC/signature)
     - Enables PHP Object Injection
   - **AUTHORIZATION BYPASS:** `$userid = $obj->userid; $username = $obj->username;` (lines 14-15)
     - Extracts userid directly from client-controlled cookie
     - **Zero validation** that userid matches authenticated user
     - No comparison to session data
     - No database verification
   - All subsequent database queries use this untrusted `$userid`

4. **Session Termination (logout.php):**
   - `session_unset()` clears session variables (line 3)
   - `session_destroy()` destroys session (line 4)
   - `setcookie("data", "", time() - 3600);` expires cookie (line 5) - relies on client cooperation
   - Redirect to sign-in.php

### Code Pointers

**Primary Authentication Logic:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php` (lines 8-51)
  - Line 23-24: User credential lookup via prepared statement
  - Line 33: Password verification with `password_verify()`
  - Line 37: **CRITICAL** - Insecure cookie creation
  - Line 39: Session variable assignment (username only, not userid)

**Authorization Check:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php` (lines 8-15)
  - Line 8: Dual authentication check with OR logic
  - Line 13: **CRITICAL** - Insecure deserialization
  - Line 14: **CRITICAL** - Userid extraction from untrusted cookie

**UserProfile Class:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/user-profile.php` (lines 3-7)
  - Public properties: `userid`, `username`
  - No validation methods, no magic methods (no __wakeup, __destruct)

**Session Management:**
- Default PHP 7.1 settings (no custom configuration)
- File-based sessions in `/var/tmp/` (container ephemeral storage)
- Session cookie name: `PHPSESSID` (default)
- Session lifetime: 1440 seconds (24 minutes, default `gc_maxlifetime`)

### 3.1 Role Assignment Process

**Role Determination:** No formal role system exists. Users are distinguished solely by their `userid` integer value.

**Default Role:** New users receive auto-incremented `userid` starting from 2 (admin has userid=1). No role column exists in the database schema.

**Role Upgrade Path:** None. The application has no role management, no admin promotion functionality, and no privilege escalation mechanism (other than the cookie forgery vulnerability).

**Code Implementation:** 
- Database schema: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql` (lines 12-16) - Users table has only `id`, `username`, `password` columns
- Admin user seeded: init.sql line 28 - `INSERT INTO users (username, password) VALUES ('admin', 'NO LOGIN');`
  - Password is literal string 'NO LOGIN', not a valid bcrypt hash
  - **Admin cannot login via normal authentication** (password_verify will always fail)
  - **Admin account only accessible via cookie forgery**

### 3.2 Privilege Storage & Validation

**Storage Location:** 
- **Database (single source of truth):** `users.id` column contains userid (authoritative)
- **Session:** `$_SESSION['username']` only (does NOT store userid) - sign-in.php:39
- **Cookie:** Serialized UserProfile object with `userid` and `username` (client-controlled) - sign-in.php:37
- **Runtime:** `$userid` and `$username` variables extracted from cookie - index.php:14-15

**Validation Points:** **NONE**
- index.php:8-11 - Authentication check only (verifies session OR cookie exists, no identity validation)
- index.php:13-15 - Deserialization and extraction (no validation of userid)
- **No middleware, no decorators, no inline authorization checks**

**Cache/Session Persistence:**
- Session lifetime: 1440 seconds (24 minutes default)
- Cookie lifetime: Session cookie (expires on browser close, no explicit expiration)
- No session refresh mechanism
- No "remember me" functionality

**Code Pointers:**
- Cookie deserialization: index.php:13
- Userid extraction: index.php:14
- Authorization decision: **Never happens** - userid from cookie is trusted directly

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None intentionally implemented.

**Unintentional Impersonation:** The insecure deserialization vulnerability enables **trivial user impersonation**:
1. Attacker modifies cookie to set `userid` to target user's ID
2. Application trusts cookie and operates as target user
3. No logging, no audit trail, no detection mechanism

**Role Switching:** Not implemented (no role system exists).

**Audit Trail:** **NONE**
- No application-level logging
- No security event tracking
- No authentication failure logging
- Apache access logs only (ephemeral, stored in container)

**Code Implementation:** N/A - No impersonation features exist in codebase.

---

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are accessible through the target web application at `http://localhost:36423`. No development/debug endpoints, local-only utilities, or build tools are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|----------------------------|
| GET | `/` | anon | None | None | Redirects to sign-in.php if not authenticated. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php:8-11` |
| GET | `/sign-in.php` | anon | None | None | Displays login form. No authentication required. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php:53-92` |
| POST | `/sign-in.php` | anon | None | Password verification | Authenticates user, creates session + cookie, redirects to index.php. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php:8-51` |
| GET | `/sign-up.php` | anon | None | None | Displays registration form. No authentication required. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php:36-71` |
| POST | `/sign-up.php` | anon | None | None | Creates new user account, redirects to sign-in.php. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php:5-34` |
| GET | `/index.php` | user | None | **BROKEN** - Cookie deserialization (no validation) | Displays authenticated user's notes dashboard. **VULNERABLE:** Trusts userid from cookie. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php:8-15, 73-76` |
| POST | `/index.php` | user | None | **BROKEN** - Cookie deserialization (no validation) | Creates new note for authenticated user. **VULNERABLE:** Trusts userid from cookie. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php:8-15, 33-37` |
| GET | `/logout.php` | none (optional) | None | None | Terminates session and expires cookie, redirects to sign-in.php. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/logout.php:2-7` |
| GET | `/static/styles.css` | anon | None | None | Static CSS stylesheet (57 lines). No server-side processing. |
| GET | `/static/favicon.ico` | anon | None | None | Static favicon binary (1150 bytes). No server-side processing. |

**Hidden/Debug Endpoints:** None found. Comprehensive search for common patterns (admin.php, debug.php, phpinfo.php, test.php, /api/, backup files, upload.php) returned no results.

**Upload Directory:** `/upload/` directory exists (created by Dockerfile) but has **no associated upload handler** in the application code. No file upload functionality implemented.

**Routing Mechanism:** Direct file-to-URL mapping (no .htaccess, no mod_rewrite, no routing table). Apache DocumentRoot is `/var/www/html/`.

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through network requests to `http://localhost:36423`. Local-only scripts, build tools, and development utilities are excluded per scope boundaries.

### URL Parameters
**Status:** None. The application does not read any GET parameters (`$_GET` never accessed in codebase).

### POST Body Fields (Form-Encoded)

| Parameter | Endpoint | Type | File:Line | Validation Applied | Dangerous Sink |
|-----------|----------|------|-----------|-------------------|----------------|
| `username` | /sign-in.php | string | sign-in.php:12 | validateInput() → mysqli_real_escape_string() | SQL prepared statement (line 23-24) - **SAFE** |
| `password` | /sign-in.php | string | sign-in.php:13 | validateInput() | password_verify() (line 33) - **SAFE** |
| `username` | /sign-up.php | string | sign-up.php:9 | validateInput() → mysqli_real_escape_string() | SQL prepared statement (line 22-23) - **SAFE** |
| `password` | /sign-up.php | string | sign-up.php:10 | validateInput() → mysqli_real_escape_string() | password_hash() → SQL prepared statement - **SAFE** |
| `title` | /index.php | string | index.php:21 | validateInput() → mysqli_real_escape_string() | SQL prepared statement (line 33-34), HTML output (line 85) - **SAFE from SQLi, XSS protected by htmlspecialchars during input** |
| `content` | /index.php | string | index.php:22 | validateInput() → mysqli_real_escape_string() | SQL prepared statement (line 33-34), HTML output (line 88) - **SAFE from SQLi, XSS protected by htmlspecialchars during input** |

**validateInput() Function:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/misc.php:3-8`
- **Implementation:** `trim()` + `stripslashes()` + `htmlspecialchars()`
- **Protection:** Prevents XSS in HTML body context, NOT designed for SQL injection prevention
- **Limitation:** Applied BEFORE database storage, so encoded entities are stored in DB

### HTTP Headers

| Header | Access Location | Purpose | Validation |
|--------|----------------|---------|------------|
| `REQUEST_METHOD` | sign-in.php:8, sign-up.php:5, index.php:17 | Determines if form submitted via POST | Compared to string "POST" - **SAFE** |
| `PHP_SELF` | sign-in.php:68, sign-up.php:51, index.php:101 | Form action attribute | **ALWAYS** escaped with htmlspecialchars() - **SAFE** |

**Note:** No custom headers are read. User-Agent, Referer, X-Forwarded-For, etc. are **never accessed** by the application.

### Cookie Values

| Cookie Name | Set Location | Read Location | Security Flags | Purpose | Vulnerability |
|-------------|-------------|---------------|----------------|---------|---------------|
| `data` | sign-in.php:37 | index.php:13 | **NONE** (no HttpOnly, Secure, SameSite) | Stores serialized UserProfile object (userid, username) | **CRITICAL - Insecure deserialization, enables horizontal privilege escalation** |
| `PHPSESSID` | Automatic (session_start) | Automatic (session_start) | Default PHP settings | PHP session identifier | Depends on php.ini (likely no HttpOnly in PHP 7.1 default) |

**data Cookie Structure:**
```php
// Serialized format:
O:11:"UserProfile":2:{s:6:"userid";i:2;s:8:"username";s:8:"testuser";}

// Base64 encoded:
TzoxMToiVXNlclByb2ZpbGUiOjI6e3M6NjoidXNlcmlkIjtpOjI7czo4OiJ1c2VybmFtZSI7czo4OiJ0ZXN0dXNlciI7fQ==
```

**Critical Vulnerability:** The `data` cookie completely **bypasses validateInput()** validation:
- **Set at:** sign-in.php:37 with database-verified userid
- **Read at:** index.php:13 - `unserialize(base64_decode($_COOKIE["data"]))`
- **No validation:** Cookie can be modified client-side, application trusts modified values
- **Attack:** Change `i:2;` to `i:1;` in serialized string → Access admin notes

### Session Variables

| Variable | Set Location | Read Location | Validation | Purpose |
|----------|-------------|---------------|------------|---------|
| `$_SESSION['username']` | sign-in.php:39 | index.php:8 | Set from database after password verification | Stores authenticated username (server-side, secure) |

**Note:** Session stores username but **NOT userid**. The application uses userid from cookie instead of session, creating the authorization bypass vulnerability.

### File Uploads
**Status:** **NONE**. No `$_FILES` access, no `move_uploaded_file()`, no file upload form fields anywhere in the application.

### Validation Bypasses

| Input Vector | Bypassed Validation | Dangerous Sink | File:Line | Exploitability |
|--------------|-------------------|----------------|-----------|----------------|
| **Cookie `data` → userid** | **Complete bypass of validateInput()** | SQL query userid parameter | index.php:13-14, 73-74, 33-34 | **CRITICAL - Trivial horizontal privilege escalation** |
| **Cookie `data` → username** | **Complete bypass of validateInput()** | HTML output without encoding | index.php:13, 15, 61 | **HIGH - Reflected XSS via modified cookie** |
| **Dual authentication OR logic** | **Session authentication bypass** | Application access | index.php:8 | **CRITICAL - Cookie-only authentication** |

---

## 6. Network & Interaction Map

**Network Surface Focus:** All components mapped below are part of the deployed, network-accessible infrastructure at `http://localhost:36423`. Local development environments, build CI systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Browser (Chrome/Firefox/Safari) | Credentials, Cookies, Session | External user accessing application |
| Apache/PHP Container | Service | App | PHP 7.1.33 / Apache 2.x | PII, Credentials (hashed), Notes, Session Files | Main application container (apache_php) |
| MySQL Container | DataStore | Data | MySQL 5.7.15 | PII, Credentials (bcrypt), Notes, FLAG | Database container (mysql_db) |
| Docker Network | Network | Infrastructure | Docker Bridge | All application traffic | Internal container network (not exposed externally) |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Apache/PHP Container | Hosts: `http://localhost:36423` (external), `http://apache_php:80` (internal); Endpoints: `/sign-in.php`, `/sign-up.php`, `/index.php`, `/logout.php`, `/static/*`; Auth: Session cookie (PHPSESSID) + Serialized cookie (data); Dependencies: MySQL Container; Image: php:7.1-apache; OS: Debian Buster |
| MySQL Container | Engine: MySQL 5.7.15; Exposure: Internal Docker network only (port 3306 not published); Consumers: Apache/PHP Container; Credentials: username=`db_username`, password=`pCxvkPyS9JYq27BVdUX4N8` (hardcoded); Root Password: `password` (hardcoded); Database: `db` |
| Docker Network | Type: Bridge; Isolation: Container-to-container only; External Access: Port 36423 published from apache_php:80; Security: No TLS, no mutual authentication, plaintext MySQL traffic |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → Apache/PHP | HTTP | `:36423 /sign-up.php` | None | Credentials (plaintext over HTTP) |
| User Browser → Apache/PHP | HTTP | `:36423 /sign-in.php` | None | Credentials (plaintext over HTTP) |
| User Browser → Apache/PHP | HTTP | `:36423 /index.php` | auth:user (cookie OR session) | PII, Notes, Serialized Cookie |
| User Browser → Apache/PHP | HTTP | `:36423 /logout.php` | None (optional) | Session termination |
| Apache/PHP → MySQL | TCP | `:3306 MySQL Protocol` | vpc-only (Docker network) | PII, Credentials (bcrypt), Notes, FLAG |
| Apache/PHP → Filesystem | Local | `/var/tmp/` session files | None | Session data (username) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires valid session OR cookie (dual authentication with OR logic). **BROKEN:** Cookie can be forged. See index.php:8. |
| auth:admin | Authorization | **NOT IMPLEMENTED** - No admin-specific authorization exists. Admin access is userid=1 in cookie (client-controlled). |
| ownership:user | ObjectOwnership | **NOT IMPLEMENTED** - Intended: User can only access their own notes. **BROKEN:** userid from cookie is untrusted, enabling IDOR. See index.php:14, 73-74. |
| vpc-only | Network | MySQL accessible only within Docker internal network (port 3306 not exposed externally). |
| cookie:integrity | Authorization | **NOT IMPLEMENTED** - No HMAC/signature verification on serialized cookie. Attacker can modify freely. |
| csrf:token | Authorization | **NOT IMPLEMENTED** - No CSRF tokens in forms. All state-changing requests vulnerable to CSRF. |
| rate:limit | Authorization | **NOT IMPLEMENTED** - No rate limiting on any endpoint. Brute force attacks unhindered. |

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**FINDING: NO FORMAL ROLE SYSTEM EXISTS**

The application does not implement role-based access control (RBAC). The database schema contains no role, privilege, or permission columns. Users are distinguished solely by their `userid` integer value.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anon | 0 | Global | No authentication required. Can access sign-in, sign-up pages. |
| user | 1 | Global | Base authenticated user. Can access /index.php to view/create own notes. Enforced by cookie OR session check at index.php:8. |
| admin (de facto) | 5 | Global | User with userid=1. Distinguishable only by ownership of notes containing FLAG. **Cannot login normally** (password='NO LOGIN'). Only accessible via cookie forgery. |

**Database Schema:**
```sql
-- /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql:12-16
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);
-- NO role, is_admin, privilege, or permission columns
```

**Admin User Seeding:**
```sql
-- /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/mysql/init.sql:28
INSERT INTO users (username, password) VALUES ('admin', 'NO LOGIN');
```

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon → user (via authentication)
user → admin (via cookie forgery - VULNERABILITY)

De Facto Hierarchy:
anon (userid=NULL)
  ↓ (Register + Login)
user (userid=2, 3, 4, ...)
  ↓ (Cookie manipulation: set userid=1)
admin (userid=1) - Contains FLAG in notes
```

**No Parallel Isolation:** All users exist in a flat hierarchy. No team-based, department-based, or organization-based isolation exists.

**Role Switching:** None implemented. The insecure deserialization vulnerability enables **unintentional** role switching by modifying userid in cookie.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/sign-in.php` | `/`, `/sign-in.php`, `/sign-up.php`, `/static/*` | None |
| user | `/index.php` | `/index.php` (GET/POST), `/logout.php`, `/static/*` | Session (username) OR Cookie (serialized UserProfile) |
| admin (de facto) | N/A (cannot login) | `/index.php` (if userid=1 in cookie) | **Cookie forgery only** |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| anon | None | None | N/A |
| user | index.php:8-11 (auth check) | **NONE** - Only checks if session OR cookie exists | Session: `$_SESSION['username']`, Cookie: `data` (serialized) |
| admin | **NONE** - No admin-specific checks | **NONE** - Admin determined by userid=1 in cookie (client-controlled) | Database: users.id=1, Cookie: `userid` property |

**Critical Finding:** Authorization decisions use `$userid` from cookie (index.php:14), which is **never validated** against session or database. No code exists to verify that authenticated user should access the userid they claim.

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

Ranked list of endpoints with object identifiers that could allow access to other users' resources.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Exploitation Method |
|----------|-----------------|---------------------|-----------|-------------|---------------------|
| **HIGH** | `GET /index.php` | Cookie: `data` → `userid` | user_notes | Admin notes contain FLAG | Modify serialized cookie to set `userid=1`, access admin's notes containing `flag{98494eec-b38e-4d5c-9541-0d1a49c173aa}` |
| **HIGH** | `POST /index.php` | Cookie: `data` → `userid` | user_notes | User-generated notes | Modify serialized cookie to set `userid=<target>`, create notes as target user |
| **MEDIUM** | `GET /index.php` | Cookie: `data` → `username` | display_name | Username displayed in welcome message | Modify serialized cookie to inject XSS payload in username field (bypasses validateInput) |

**Attack Proof of Concept:**
```php
// Create malicious UserProfile object
class UserProfile {
    public $userid = 1;  // Admin's userid
    public $username = 'admin';
}
$exploit = new UserProfile();
$payload = base64_encode(serialize($exploit));
// Result: TzoxMToiVXNlclByb2ZpbGUiOjI6e3M6NjoidXNlcmlkIjtpOjE7czo4OiJ1c2VybmFtZSI7czo1OiJhZG1pbiI7fQ==

// Set cookie and access /index.php
// Application queries: SELECT * FROM notes WHERE user_id=1
// Returns admin's notes including FLAG
```

### 8.2 Vertical Privilege Escalation Candidates

List of endpoints that require higher privileges, organized by target role.

| Target Role | Endpoint Pattern | Functionality | Risk Level | Exploitation |
|-------------|-----------------|---------------|------------|--------------|
| admin (userid=1) | `GET /index.php` | View admin notes (containing FLAG) | **CRITICAL** | Modify cookie to set userid=1. No admin-specific functions exist beyond owning FLAG-containing notes. |

**Note:** The application has **no administrative functions** beyond basic note viewing. The "admin" role is distinguished only by userid=1 owning notes that contain the CTF flag. No user management, system configuration, or elevated privilege endpoints exist.

**Vertical Escalation is effectively Horizontal Escalation:** Since there are no admin-only endpoints, "becoming admin" is simply accessing userid=1's notes, which is a horizontal privilege escalation (IDOR) attack.

### 8.3 Context-Based Authorization Candidates

Multi-step workflow endpoints that assume prior steps were completed.

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Exploitation |
|----------|----------|---------------------|------------------|--------------|
| Authentication → Application Access | `GET /index.php` | Valid session from sign-in.php | **HIGH - Dual auth OR logic** | Create forged cookie without session. index.php:8 checks `!isset($_SESSION['username']) && !isset($_COOKIE["data"])`, passes if cookie exists even without session. |
| Logout → Session Termination | `GET /logout.php` | Active session | **MEDIUM - Client-side cookie deletion** | logout.php:5 sets `setcookie("data", "", time()-3600)` which requests client to delete cookie. Attacker can ignore deletion request and continue using saved cookie value. |
| Registration → Email Verification | N/A | N/A | **N/A** | No email verification workflow exists. |
| Password Reset | N/A | N/A | **N/A** | No password reset workflow exists. |

**Dual Authentication Bypass Detail:**
- **Expected flow:** User authenticates → Session created → index.php checks session
- **Actual flow:** User can skip authentication → Create forged cookie → index.php accepts cookie without session
- **Bypass:** `if (!isset($_SESSION['username']) && !isset($_COOKIE["data"]))` uses AND, so access granted if **either** condition is false (De Morgan's Law)

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources accessible through network requests to `http://localhost:36423` are reported. Local-only scripts, build tools, and CLI applications are excluded.

### SQL Injection Sources

**COMPREHENSIVE ANALYSIS RESULT: NO SQL INJECTION VULNERABILITIES FOUND**

All database queries use prepared statements with parameterized placeholders. Comprehensive data flow analysis confirms:

**Query #1: User Authentication**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-in.php:23-26`
- **User Input Flow:** `$_POST['username']` → validateInput() → mysqli_real_escape_string() → Prepared statement
- **Protection:** `$stmt = $conn->prepare("SELECT * FROM users WHERE username=?"); $stmt->bind_param("s", $username);`
- **Verdict:** **SAFE** - Parameterized query with string type binding

**Query #2: User Registration**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/sign-up.php:22-25`
- **User Input Flow:** `$_POST['username']`, `$_POST['password']` → validateInput() → password_hash() → Prepared statement
- **Protection:** `$stmt = $conn->prepare("INSERT INTO users (username, password) VALUES (?, ?)"); $stmt->bind_param("ss", $username, $password_hash);`
- **Verdict:** **SAFE** - Parameterized query with string type binding

**Query #3: Note Creation**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php:33-37`
- **User Input Flow:** 
  - `$_POST['title']`, `$_POST['content']` → validateInput() → mysqli_real_escape_string() → Prepared statement
  - `$userid` from cookie deserialization (UNTRUSTED but integer-typed)
- **Protection:** `$stmt = $conn->prepare("INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)"); $stmt->bind_param("iss", $userid, $title, $content);`
- **Note:** While `$userid` is attacker-controlled, integer type binding (`"i"`) prevents SQL injection. This creates an **authorization bypass** (attacker can set userid=1 to create notes as admin), but NOT SQL injection.
- **Verdict:** **SAFE from SQL Injection** (vulnerable to authorization bypass)

**Query #4: Note Retrieval**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-081-24/php/challenge/index.php:73-76`
- **User Input Flow:** `$userid` from cookie deserialization (UNTRUSTED but integer-typed)
- **Protection:** `$stmt = $conn->prepare("SELECT * FROM notes WHERE user_id=?"); $stmt->bind_param("i", $userid);`
- **Note:** Same as Query #3 - authorization bypass, not SQL injection
- **Verdict:** **SAFE from SQL Injection** (vulnerable to authorization bypass)

**Defense-in-Depth Analysis:**
- **Layer 1:** validateInput() - Insufficient for SQL protection alone (designed for XSS)
- **Layer 2:** mysqli_real_escape_string() - Redundant when using prepared statements, but provides defense-in-depth
- **Layer 3:** Prepared statements - **PRIMARY DEFENSE**, completely prevents SQL injection

**Second-Order SQL Injection Check:** Retrieved database data (usernames, note titles, note content) is **never used in subsequent SQL queries**, eliminating second-order injection risk. Data is only used for HTML output (creating XSS risk, not SQLi).

### Command Injection Sources

**COMPREHENSIVE ANALYSIS RESULT: NO COMMAND INJECTION VULNERABILITIES FOUND**

**Searched Functions:** exec(), system(), shell_exec(), passthru(), popen(), proc_open(), backticks (`` ` ``), eval(), pcntl_exec()

**Search Coverage:** All network-accessible PHP files analyzed:
- sign-in.php
- sign-up.php
- index.php
- logout.php
- config.php
- misc.php
- user-profile.php

**Result:** **ZERO command execution functions found** in network-accessible application code.

**Out-of-Scope Infrastructure Commands (Not Network-Accessible):**
- Docker healthcheck: `mysqladmin ping` (docker-compose.yml:9) - Infrastructure-level, not triggered by user input
- Docker healthcheck: `curl -f http://127.0.0.1:80/` (docker-compose.yml:22) - Infrastructure-level
- Docker build: `sed -i s/FLAG_PLACEHOLDER/$FLAG/g` (mysql/Dockerfile:7) - Build-time only

**Verdict:** **SAFE** - No command injection attack surface in network-accessible code.

---

## 10. Summary

### Critical Findings

**Primary Vulnerability:** Insecure Deserialization + Broken Authorization (CWE-502 + CWE-639)
- **Location:** sign-in.php:37 (cookie creation), index.php:13-14 (deserialization + userid extraction)
- **CVSS:** 9.8 Critical
- **Exploitability:** Trivial (2 minutes, basic cookie manipulation)
- **Impact:** Complete horizontal privilege escalation, admin account compromise, FLAG exfiltration

**Secondary Vulnerabilities:**
1. Dual authentication OR logic (index.php:8) - Bypass session-based auth with cookie only
2. No cookie security flags (HttpOnly, Secure, SameSite) - XSS cookie theft, CSRF, MITM
3. Reflected XSS via cookie username (index.php:61) - Bypasses validateInput()
4. No CSRF protection - State-changing requests exploitable
5. Hardcoded credentials in source code (config.php:5, init.sql:3)
6. HTTP only (no TLS) - Credentials transmitted in cleartext
7. End-of-life software stack (PHP 7.1.33, MySQL 5.7.15) - Unpatched vulnerabilities

**Strong Security Controls:**
1. SQL injection prevention - Consistent use of prepared statements across all queries
2. Password security - Bcrypt hashing with PASSWORD_DEFAULT
3. No command injection surface - Zero command execution functions in application code

### Attack Surface Summary

**Total Network-Accessible Endpoints:** 10 (4 dynamic PHP, 2 static assets, plus root redirect)
**Authentication Endpoints:** 2 (sign-in, sign-up)
**Authorization-Protected Endpoints:** 2 (index.php GET/POST) - **BROKEN**
**Input Vectors:** 9 (6 POST parameters, 2 cookies, 1 session variable)
**Critical Vulnerabilities:** 2 (Insecure deserialization, Broken authorization)
**Injection Vulnerabilities:** 0 (SQL injection and command injection fully prevented)

### Recommended Testing Priority

**Phase 1 - Critical (Authorization):**
1. Cookie manipulation to access userid=1 notes (horizontal escalation)
2. Cookie forgery without session (authentication bypass)
3. Cookie-based XSS injection (reflected XSS via username)

**Phase 2 - High (Session Management):**
1. Session fixation attacks
2. Logout bypass (cookie re-injection)
3. CSRF on note creation

**Phase 3 - Medium (Infrastructure):**
1. HTTP credential sniffing
2. Hardcoded credential exploitation (database access)
3. Missing security headers (clickjacking, XSS via misconfiguration)

**Phase 4 - Low (Information Disclosure):**
1. Error message analysis
2. Enumeration attacks (username existence)
3. Timing attacks (password verification)

---

**END OF RECONNAISSANCE DELIVERABLE**