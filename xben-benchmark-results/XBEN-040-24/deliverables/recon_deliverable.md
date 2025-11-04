# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface for a deliberately vulnerable PHP blog application. This is a minimal security challenge environment with only two PHP endpoints but containing critical vulnerabilities across all security domains.

**Key Sections for Vulnerability Analysis:**
- **Section 4 (API Endpoint Inventory):** Only 3 endpoints total - focus on the SQL injection vulnerability in the public category filter
- **Section 5 (Input Vectors):** Critical SQL injection in GET parameter before sanitization occurs
- **Section 7 (Role & Privilege Architecture):** Binary role system (anonymous/admin) with session-based authentication
- **Section 8 (Authorization Vulnerability Candidates):** Limited horizontal escalation opportunities due to single-admin design, but vertical escalation via SQL injection
- **Section 9 (Injection Sources):** One critical SQL injection vulnerability enabling complete database compromise

**Attack Surface Summary:** This application has a minimal network footprint (2 PHP files, 3 HTTP endpoints) but contains multiple critical vulnerabilities including unauthenticated SQL injection (index.php line 41), plaintext password storage, missing output encoding leading to stored XSS, and complete absence of security headers. The most direct attack path is exploiting the SQL injection to extract admin credentials, then authenticating to retrieve the flag.

## 1. Executive Summary

This is a **deliberately vulnerable PHP-based blog application** running on a traditional LAMP stack (Linux-Apache-MySQL-PHP) deployed via Docker Compose. The application exposes a minimal attack surface with only **two primary web pages** accessible at `http://localhost:51233`:

- **Public Blog Homepage** (`/index.php` or `/`) - Displays published blog posts with category filtering
- **Admin Login Page** (`/admin.php`) - Form-based authentication protecting a flag value

The security posture is **critically compromised** with multiple high-severity vulnerabilities enabling complete application compromise. The most critical finding is an **unauthenticated SQL injection vulnerability** in the public blog interface (index.php line 41) that allows direct database access without authentication. This vulnerability exists because user input is used in a SQL query BEFORE sanitization occurs, creating a time-of-check-time-of-use (TOCTOU) vulnerability.

**Core Technology Stack:**
- **Frontend:** Plain HTML with minimal JavaScript (category dropdown auto-submit)
- **Backend:** PHP 7.4.33 (EOL: November 2022) on Apache 2.4.54 (Debian)
- **Database:** MySQL 5.7 (EOL: October 2023) with mysql_native_password authentication
- **Infrastructure:** Docker Compose with two containers (web + database), HTTP only (port 51233→80), no TLS/HTTPS

**Primary Attack Vectors:**
1. **SQL Injection** (index.php line 41) - Unauthenticated database access via category parameter
2. **Stored XSS** (index.php lines 29, 69-72) - Six instances of unescaped database output
3. **Plaintext Credentials** - Admin password stored in clear text in database
4. **Session Fixation** - No session regeneration after authentication
5. **Hardcoded Secrets** - Database credentials in source code, admin credentials in version control

The application architecture follows a **two-tier monolithic pattern** with a single web container (port 51233) communicating with a MySQL database container (internal port 3306) over an unencrypted Docker internal network. There is no WAF, reverse proxy, rate limiting, CSRF protection, security headers, or encryption at any layer (transport, storage, or communication).

## 2. Technology & Service Map

### Frontend
- **Framework:** None - Plain HTML with inline CSS (`styles.css`)
- **JavaScript:** Minimal - Category dropdown auto-submit functionality (onchange event)
- **Authentication Libraries:** None - Pure PHP session management
- **Key Files:**
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` (83 lines) - Blog homepage
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` (59 lines) - Admin login
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/styles.css` - CSS stylesheet
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/images/` - Static image assets

### Backend
- **Language:** PHP 7.4.33 (End-of-Life: November 28, 2022)
- **Web Server:** Apache 2.4.54 (Debian)
- **Framework:** None - Pure procedural PHP
- **Key Dependencies:**
  - MySQLi extension for database connectivity
  - Apache mod_rewrite module (enabled)
  - No Composer packages or third-party libraries
- **Database Driver:** MySQLi (procedural style with object-oriented query execution)
- **Configuration Files:**
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/Dockerfile` - Container build with PHP error display enabled
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/000-default.conf` - Apache VirtualHost (HTTP only, port 80)
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/entrypoint.sh` - Container initialization script

### Infrastructure
- **Hosting Provider:** Docker containers (local deployment)
- **CDN:** None
- **Database Type:** MySQL 5.7 (End-of-Life: October 21, 2023)
- **Database Authentication Plugin:** mysql_native_password (legacy SHA1-based)
- **Container Orchestration:** Docker Compose
- **Network Isolation:** Internal Docker network (db:3306 not exposed to host)
- **Port Mapping:** Host port 51233 → Container port 80 (HTTP only)
- **Orchestration File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/docker-compose.yml`

### Identified Subdomains
**None** - Application accessible only via `localhost:51233`, no subdomain discovery performed (subfinder skipped per pre-recon deliverable)

### Open Ports & Services
Based on nmap scan from pre-recon deliverable:
- **Port 51233/tcp (Host)** → **Port 80/tcp (Container)** - HTTP service (Apache 2.4.54, PHP 7.4.33)
  - Purpose: Primary application access point
  - Service: Caddy httpd (proxy) → Apache backend
  - Security: No TLS, transmits all data in plaintext
  - Network Accessibility: **IN SCOPE** - Primary target for penetration testing

**Out-of-Scope Ports (Not Application-Related):**
- Port 80/tcp - Caddy httpd (reverse proxy on host, not part of application)
- Port 443/tcp - SSL/HTTPS (Caddy, not application)
- Port 631/tcp - CUPS printing service (system service)
- Port 9999/tcp - Unidentified service (not application-related)
- Port 49152/tcp - Tailscale (not application-related)

## 3. Authentication & Session Management Flow

### Entry Points
- **POST /admin.php** - Primary authentication endpoint
  - Accepts `username` and `password` POST parameters
  - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`
  - Lines 11-30: Authentication processing logic

- **GET /admin.php** - Login form display / authenticated access
  - If session exists: Displays flag and exits (lines 5-8)
  - If no session: Displays login form (lines 34-59)

### Mechanism: Step-by-Step Authentication Process

**Step 1: Session Initialization**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 2
- **Code:** `session_start();`
- **Behavior:** Starts PHP session, creates PHPSESSID cookie (no security flags set)
- **Vulnerability:** No HttpOnly, Secure, or SameSite flags configured

**Step 2: Session Check (Pre-Authentication)**
- **Location:** Lines 5-8
- **Code:**
  ```php
  if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
      echo "@FLAG@";
      exit;
  }
  ```
- **Behavior:** If already authenticated, display flag immediately without requiring credentials

**Step 3: Credential Submission**
- **Location:** Lines 11-30 (POST request handling)
- **Method:** HTTP POST to `/admin.php`
- **Parameters:**
  - `username` (plaintext POST parameter)
  - `password` (plaintext POST parameter)
- **Transport Security:** None - transmitted over unencrypted HTTP
- **Vulnerability:** Credentials visible to network sniffing, MITM attacks

**Step 4: Credential Processing**
- **Location:** Lines 17-18
- **Code:**
  ```php
  $username = mysqli_real_escape_string($conn, $_POST['username']);
  $password = mysqli_real_escape_string($conn, $_POST['password']); //plaintext
  ```
- **Sanitization:** `mysqli_real_escape_string()` applied
- **Critical Vulnerability:** Password handled in plaintext (confirmed by comment)

**Step 5: Database Verification**
- **Location:** Lines 20-21
- **Code:**
  ```php
  $sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
  $result = $conn->query($sql);
  ```
- **Database Table:** `admins` (defined in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` lines 29-33)
- **Schema:** `id INT AUTO_INCREMENT`, `username VARCHAR(50)`, `password VARCHAR(255)`
- **Critical Vulnerability:** Plaintext password comparison (no `password_verify()` or hashing)
- **Default Credentials:** `username='admin'`, `password='ONEverySecurePassword_!'` (line 58 of db_init.sql)

**Step 6: Session Creation (On Success)**
- **Location:** Lines 23-26
- **Code:**
  ```php
  if ($result->num_rows == 1) {
      $_SESSION['admin_logged_in'] = true;
      echo "@FLAG@";
  }
  ```
- **Session Variable Set:** `$_SESSION['admin_logged_in'] = true` (boolean)
- **Response:** FLAG value displayed immediately
- **Critical Vulnerability:** No `session_regenerate_id()` call - vulnerable to session fixation

**Step 7: Error Handling (On Failure)**
- **Location:** Lines 27-29
- **Code:**
  ```php
  else {
      $errorMessage = 'Invalid username or password.';
  }
  ```
- **Error Message:** Generic message (good practice - no username enumeration)
- **Display Location:** Line 47 in HTML output (unescaped, but currently hardcoded)

### Code Pointers: Authentication & Session Logic

**Session Management:**
- **Initialization:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 2
- **Variable Storage:** Line 25 (`$_SESSION['admin_logged_in'] = true`)
- **Authentication Check:** Lines 5-8 (reads `$_SESSION['admin_logged_in']`)
- **No Session Destruction:** No logout endpoint exists
- **No Session Timeout:** No expiration mechanism implemented
- **No Session Security Flags:** No `session_set_cookie_params()` usage found

**Database Interaction:**
- **Connection:** Lines 12-15 of admin.php
  - Host: `db`, User: `user`, Password: `password`, Database: `blogDB`
  - **Hardcoded credentials in source code**
- **Query Execution:** Lines 20-21 (plaintext password comparison)
- **Result Processing:** Lines 23-29 (authentication decision)

**Vulnerabilities Summary:**
1. **Plaintext Password Storage** - No password hashing (admin.php lines 18-20)
2. **Session Fixation** - No session regeneration after authentication (missing after line 25)
3. **Missing Cookie Security Flags** - HttpOnly, Secure, SameSite not set (no configuration found)
4. **Hardcoded Credentials** - Database credentials in source code (admin.php line 12, index.php line 2)
5. **Default Admin Credentials** - Committed to version control (db_init.sql line 58)
6. **No CSRF Protection** - Login form lacks anti-CSRF tokens
7. **No Rate Limiting** - Unlimited authentication attempts possible
8. **Credentials Over HTTP** - No TLS encryption for credential transmission

### 3.1 Role Assignment Process

**Role Determination:** Not applicable - no role assignment process exists

**Explanation:** This application uses a **binary authentication model** with no role differentiation:
- **Unauthenticated users** - Default state, can access public blog (index.php)
- **Authenticated admin** - Set via `$_SESSION['admin_logged_in'] = true`, can view flag

**No Role Column:** The `admins` table (db_init.sql lines 29-33) contains only `id`, `username`, and `password` fields - no role, permission, or privilege column exists.

**Default Role:** N/A - No user registration system, only pre-seeded admin account

**Role Upgrade Path:** N/A - No role management functionality

**Code Implementation:** 
- Authentication state: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 25
- Only stores boolean flag, not role information

### 3.2 Privilege Storage & Validation

**Storage Location:** PHP session variable
- **Variable Name:** `$_SESSION['admin_logged_in']`
- **Data Type:** Boolean (`true` for authenticated, unset/false for unauthenticated)
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 25 (write), line 5 (read)
- **Session Storage Mechanism:** Default PHP session handling (typically `/tmp` or `/var/lib/php/sessions` on container filesystem)
- **Encryption:** None - session files stored in plaintext

**Validation Points:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` lines 5-8
- **Check Type:** Existence check (`isset()`) + strict equality check (`=== true`)
- **Code:**
  ```php
  if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
      echo "@FLAG@";
      exit;
  }
  ```
- **Frequency:** Every GET request to admin.php performs this check
- **No Validation in index.php:** Public blog has no authorization checks

**Cache/Session Persistence:**
- **Duration:** Indefinite - no session timeout configured
- **Refresh Mechanism:** None - session persists until browser closure or cookie expiration (default PHP behavior)
- **No Explicit Expiration:** No `session.gc_maxlifetime` configuration found
- **Container Restart Behavior:** Sessions likely lost on container restart (ephemeral storage)

**Code Pointers:**
- **Privilege Storage:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 25
- **Privilege Validation:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` lines 5-8
- **Session Configuration:** None found - using PHP defaults

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None implemented

**Role Switching:** Not applicable - single role system only

**Audit Trail:** No logging of authentication events or session access

**Code Implementation:** N/A - no impersonation or role switching functionality exists

**Explanation:** This application has no administrative interface beyond flag display, no user management features, and no multi-admin support. There is only one admin account hardcoded in the database (db_init.sql line 58), making impersonation or role switching architecturally impossible.

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints reachable through the target application at `http://localhost:51233` are included. Build scripts, Docker initialization, and local-only utilities are excluded.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|--------------|---------------|---------------------|------------------------|----------------------------|
| GET | `/` or `/index.php` | anon | None | None | **Public blog homepage.** Displays published blog posts with category filtering via dropdown. Accepts optional `category` GET parameter (line 37). **CRITICAL VULNERABILITY:** SQL injection at line 41 where `$unescaped_category` is used directly in query before sanitization occurs at line 52. XSS vulnerabilities at lines 29, 69-72 where database content is echoed without `htmlspecialchars()`. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php`. |
| GET | `/admin.php` | anon / admin | None | Session check: `$_SESSION['admin_logged_in'] === true` | **Admin login form display / flag reveal.** If unauthenticated: displays login form (lines 34-59). If authenticated via session: displays FLAG and exits (lines 5-8). Session initialized at line 2 with `session_start()`. No security flags set (HttpOnly, Secure, SameSite). See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`. |
| POST | `/admin.php` | anon | None | Form-based authentication (username/password verification) | **Admin authentication processing.** Accepts `username` and `password` POST parameters (lines 17-18), escapes with `mysqli_real_escape_string()`, queries `admins` table with **plaintext password comparison** (line 20). On success: sets `$_SESSION['admin_logged_in'] = true` (line 25) and displays FLAG. **VULNERABILITIES:** No session regeneration (session fixation), plaintext password storage, no CSRF protection, no rate limiting. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` lines 11-30. |
| GET | `/styles.css` | anon | None | None | **Static CSS stylesheet.** No security implications. Public static resource. |
| GET | `/images/{filename}` | anon | filename | None | **Static image assets.** Images referenced in blog posts served from `/images/` directory (index.php line 71: `src='images/{$row['image']}'`). No server-side processing, just static file serving. Potential path traversal if image filenames are not validated, but currently only references database-stored filenames. |

**Total Network-Accessible Endpoints:** 3 dynamic endpoints (2 PHP files with GET/POST methods) + static assets

**Authentication Summary:**
- **Public Endpoints (No Auth Required):** `GET /index.php`, static resources
- **Protected Content (Session Required):** FLAG display in `GET /admin.php` (lines 5-8)
- **Authentication Endpoint:** `POST /admin.php`

**Critical Findings:**
1. **SQL Injection (Unauthenticated):** `GET /index.php?category=` vulnerable at line 41
2. **Plaintext Credentials:** `POST /admin.php` compares plaintext passwords
3. **Session Fixation:** `POST /admin.php` sets session without regeneration
4. **No CSRF Protection:** `POST /admin.php` lacks anti-CSRF tokens
5. **Stored XSS:** `GET /index.php` outputs database content without encoding (6 locations)

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application's network interface at `http://localhost:51233`. Local-only scripts, build tools, and development utilities are excluded.

### URL Parameters

**1. category (GET parameter - index.php)**
- **Endpoint:** `GET /index.php?category={value}`
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php`
- **Line 37:** Initial read: `$unescaped_category = isset($_GET['category']) ? $_GET['category'] : '';`
- **Line 41:** **CRITICAL SQL INJECTION** - Used unescaped in SQL query:
  ```php
  $result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");
  ```
- **Line 52:** Sanitization applied TOO LATE: `$category = mysqli_real_escape_string($conn, $unescaped_category);`
- **Line 56:** Sanitized version used in main query (protected)
- **Validation:** Database existence check (lines 39-49), but uses vulnerable query
- **Vulnerability:** SQL injection at line 41 before sanitization, enables database compromise
- **Attack Surface:** Public, unauthenticated access

### POST Body Fields (Form Data)

**1. username (POST parameter - admin.php)**
- **Endpoint:** `POST /admin.php`
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`
- **Line 17:** Read and sanitized: `$username = mysqli_real_escape_string($conn, $_POST['username']);`
- **Line 20:** Used in SQL query: `"SELECT id FROM admins WHERE username = '$username' AND password = '$password'"`
- **Validation:** `mysqli_real_escape_string()` applied before query construction
- **Form Field:** Line 52 in HTML: `<input type="text" name="username" required>`
- **Vulnerability:** Protected against SQL injection, but no length/character validation
- **Attack Surface:** Public login form (no authentication required to access)

**2. password (POST parameter - admin.php)**
- **Endpoint:** `POST /admin.php`
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`
- **Line 18:** Read and sanitized: `$password = mysqli_real_escape_string($conn, $_POST['password']);` (comment: `//plaintext`)
- **Line 20:** Used in SQL query with **plaintext comparison**: `WHERE username = '$username' AND password = '$password'`
- **Validation:** `mysqli_real_escape_string()` applied, but password stored/compared in plaintext
- **Form Field:** Line 54 in HTML: `<input type="password" name="password" required>`
- **Vulnerability:** Plaintext password storage and transmission over HTTP
- **Attack Surface:** Public login form

### HTTP Headers

**1. REQUEST_METHOD (Server variable - admin.php)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`
- **Line 11:** Read: `if ($_SERVER["REQUEST_METHOD"] == "POST")`
- **Purpose:** Differentiate GET (form display) from POST (authentication processing)
- **Validation:** Simple string comparison
- **Vulnerability:** None - standard HTTP method checking
- **Not User-Controlled:** Set by web server, not directly controllable by attacker

**No Other HTTP Headers Accessed:** Application does not read X-Forwarded-For, User-Agent, Referer, or custom headers for processing.

### Cookie Values

**1. PHPSESSID (Implicit session cookie - admin.php)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`
- **Line 2:** Session started: `session_start();`
- **Cookie Name:** PHPSESSID (default PHP session cookie name)
- **Storage:** Session variable `$_SESSION['admin_logged_in']` (line 25 write, line 5 read)
- **Validation:** Checked via `isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true`
- **Vulnerabilities:**
  - No HttpOnly flag - accessible via JavaScript (XSS can steal)
  - No Secure flag - transmitted over unencrypted HTTP
  - No SameSite flag - vulnerable to CSRF
  - No session regeneration - vulnerable to session fixation
- **Attack Surface:** Session cookies transmitted with every request to admin.php

**No Other Cookies Accessed:** Application does not read preference cookies, tracking cookies, or custom application cookies.

### Database-Derived Inputs (Stored Data as Input Vectors)

While not traditional user input, database content becomes an input vector when output to HTML without encoding:

**1. posts.title (Database field - index.php)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php`
- **Line 69:** Output unescaped: `<h2>{$row['title']}</h2>`
- **Line 71:** Output unescaped in alt attribute: `alt='{$row['title']}'`
- **Vulnerability:** Stored XSS if title contains malicious JavaScript
- **Injection Path:** SQL injection at line 41 could insert malicious title

**2. posts.category (Database field - index.php)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php`
- **Line 29:** Output unescaped in dropdown: `<option value='{$row['category']}' {$selected}>{$row['category']}</option>`
- **Line 70:** Output unescaped in paragraph: `<p>Category: {$row['category']}</p>`
- **Vulnerability:** Stored XSS if category contains malicious JavaScript
- **Injection Path:** SQL injection at line 41 could insert malicious category

**3. posts.content (Database field - index.php)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php`
- **Line 72:** Output unescaped: `<p>" . substr($row['content'], 0, 200) . "...</p>`
- **Vulnerability:** Stored XSS if content contains malicious JavaScript (truncated to 200 chars but XSS payloads can be <200 chars)
- **Injection Path:** SQL injection at line 41 could insert malicious content

**4. posts.image (Database field - index.php)**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php`
- **Line 71:** Output unescaped in src attribute: `<img src='images/{$row['image']}'`
- **Vulnerability:** Stored XSS via attribute injection or path traversal
- **Injection Path:** SQL injection at line 41 could insert malicious image path

### Summary Table: Input Vectors

| Input Vector | Type | File | Line | Sanitization | Vulnerability | Severity |
|--------------|------|------|------|--------------|---------------|----------|
| `category` | GET param | index.php | 37→41 | None (used before escape) | SQL Injection | CRITICAL |
| `category` | GET param | index.php | 52→56 | mysqli_real_escape_string | Protected | N/A |
| `username` | POST param | admin.php | 17→20 | mysqli_real_escape_string | Protected | N/A |
| `password` | POST param | admin.php | 18→20 | mysqli_real_escape_string + plaintext | Plaintext storage | HIGH |
| `PHPSESSID` | Cookie | admin.php | 2, 5, 25 | Session validation | Session fixation, no security flags | HIGH |
| `posts.title` | Database | index.php | 69, 71 | None | Stored XSS | HIGH |
| `posts.category` | Database | index.php | 29, 70 | None | Stored XSS | HIGH |
| `posts.content` | Database | index.php | 72 | None | Stored XSS | HIGH |
| `posts.image` | Database | index.php | 71 | None | Stored XSS / Path Traversal | HIGH |

**Critical Finding:** The `category` parameter flows through two distinct code paths - first used unescaped in a validation query (line 41, VULNERABLE), then properly escaped for the main query (line 52, PROTECTED). This time-of-check-time-of-use (TOCTOU) vulnerability allows SQL injection despite later sanitization.

## 6. Network & Interaction Map

**Network Surface Focus:** Only components of the deployed, network-accessible infrastructure at `http://localhost:51233`. Local development environments, build CI systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| BlogApp-Web | Service | App | PHP 7.4.33 / Apache 2.4.54 | PII (session data), Public (blog posts) | Main application container, exposed on host port 51233, handles HTTP requests, executes PHP business logic |
| BlogApp-DB | DataStore | Data | MySQL 5.7 | PII (admin credentials), Public (blog content) | Database container on internal port 3306, stores admin credentials in plaintext, not exposed to host |
| External-User | ExternAsset | Internet | Browser | None | Unauthenticated users accessing public blog, can exploit SQL injection without credentials |
| Admin-User | Identity | Internet | Browser | Tokens (session cookies), PII | Authenticated administrators, access protected FLAG via session |
| Docker-Network | Infrastructure | Edge | Docker bridge network | All traffic | Internal container network, provides isolation from external access to database |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| BlogApp-Web | Hosts: `http://localhost:51233`; Container-Port: `80`; Endpoints: `/index.php`, `/admin.php`, `/styles.css`, `/images/*`; Auth: Session-based (PHPSESSID cookie); Dependencies: BlogApp-DB; Credentials: Hardcoded (`user`/`password`); PHP-Version: `7.4.33` (EOL); Apache-Version: `2.4.54`; Dockerfile: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/Dockerfile` |
| BlogApp-DB | Engine: `MySQL 5.7` (EOL); Port: `3306` (internal only); Exposure: `Not exposed to host`; Consumers: `BlogApp-Web`; Credentials: Root=`rootpassword`, App-User=`user`/`password` (hardcoded in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/docker-compose.yml` lines 6-10); Auth-Plugin: `mysql_native_password` (insecure legacy); Database: `blogDB`; Tables: `posts`, `comments`, `admins`; Schema: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` |
| External-User | Access-Level: `Unauthenticated`; Entry-Points: `/index.php` (blog), `/admin.php` (login form); Capabilities: `Read public posts`, `Filter by category`, `Attempt authentication`, `Exploit SQL injection`; IP-Restrictions: `None` |
| Admin-User | Access-Level: `Authenticated`; Session-Variable: `$_SESSION['admin_logged_in'] = true`; Capabilities: `View FLAG`; Auth-Method: `Username/password form-based`; Default-Credentials: `admin` / `ONEverySecurePassword_!` (hardcoded in db_init.sql line 58); Session-Storage: `PHP session files (unencrypted)` |
| Docker-Network | Type: `Docker bridge network`; Function: `Inter-container communication`; Isolation: `Database port 3306 not exposed to host`; Security: `Unencrypted traffic between containers`; DNS: `Hostname 'db' resolves to BlogApp-DB container` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External-User → BlogApp-Web | HTTP | `:51233` → `:80` `/index.php?category=` | None | Public (blog content), Secrets (via SQLi if exploited) |
| External-User → BlogApp-Web | HTTP | `:51233` → `:80` `/admin.php` GET | None | Public (login form) |
| External-User → BlogApp-Web | HTTP | `:51233` → `:80` `/admin.php` POST | None | PII (credentials in plaintext over HTTP) |
| Admin-User → BlogApp-Web | HTTP | `:51233` → `:80` `/admin.php` GET | auth:session | Secrets (FLAG display), Tokens (session cookie over HTTP) |
| BlogApp-Web → BlogApp-DB | TCP | `db:3306` MySQL protocol | vpc-only, credentials:hardcoded | PII (admin credentials), Public (blog posts), Secrets (admin password plaintext) |
| BlogApp-Web → External-User | HTTP | `:80` → `:51233` Response | None | Public (HTML), PII (error messages with db info if errors occur) |
| BlogApp-Web → Admin-User | HTTP | `:80` → `:51233` Response | None | Secrets (FLAG), Tokens (set-cookie PHPSESSID with no security flags) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:session | Auth | Requires valid PHP session with `$_SESSION['admin_logged_in'] === true`. Check occurs at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` lines 5-8. No HttpOnly, Secure, or SameSite flags set on session cookie. |
| vpc-only | Network | Database communication restricted to Docker internal bridge network. MySQL port 3306 not exposed to host, preventing external direct database connections. Only BlogApp-Web container can reach BlogApp-DB via hostname 'db'. |
| credentials:hardcoded | Auth | Database connection uses hardcoded credentials: user='user', password='password', host='db', database='blogDB'. Located in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` line 2 and `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 12. |

**Notable Absent Guards:**
- **No TLS/HTTPS:** All communication over unencrypted HTTP (guard `tls` not applicable)
- **No CSRF Protection:** POST requests lack anti-CSRF tokens (guard `csrf:token` not implemented)
- **No Rate Limiting:** No throttling on authentication attempts (guard `ratelimit` not implemented)
- **No IP Allowlist:** No network-level access restrictions (guard `ip-allowlist` not implemented)
- **No WAF:** No web application firewall filtering requests (guard `waf:filtering` not implemented)
- **No RBAC:** No role-based access control beyond binary admin/non-admin (guard `role:minimum` not applicable)

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 | Global | No authentication required. Default state for all users. Can access `/index.php` (blog). No session variable set. |
| admin | 10 | Global | Authenticated via username/password form. Session variable `$_SESSION['admin_logged_in'] = true` set at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 25. Checked at line 5: `isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true`. Can view FLAG. |

**Total Roles:** 2 (binary system: unauthenticated / authenticated)

**No Intermediate Roles:** No user, moderator, editor, or manager roles exist. System is purely admin vs non-admin.

**Database Evidence:**
- **admins table** (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` lines 29-33) contains only `id`, `username`, `password` fields
- **No role column** in database schema
- **Single admin account:** username='admin', password='ONEverySecurePassword_!' (line 58)

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "dominates" / "can access resources of"):
anonymous (level 0) → admin (level 10)
```

**Hierarchy Explanation:**
- **anonymous** users can access public blog content (`/index.php`)
- **admin** users can access everything anonymous users can access PLUS protected FLAG content (`/admin.php` when authenticated)

**No Parallel Isolation:** Single linear hierarchy with no tenant-specific or department-specific roles. No roles exist at the same privilege level with isolated access scopes.

**No Role Switching:** No impersonation features, no "sudo mode", no temporary privilege elevation mechanisms exist.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anonymous | `/index.php` | `/index.php`, `/`, `/admin.php` (login form), `/styles.css`, `/images/*` | None (unauthenticated access) |
| admin | `/admin.php` (FLAG display) | All anonymous routes PLUS `/admin.php` (authenticated - FLAG display) | Session-based via `$_SESSION['admin_logged_in'] = true`. Set after successful username/password authentication at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` lines 23-26. |

**Authentication Flow for admin role:**
1. User navigates to `/admin.php` (GET request)
2. If no session: Login form displayed (lines 34-59)
3. User submits credentials via POST to `/admin.php`
4. If credentials valid: `$_SESSION['admin_logged_in'] = true` set (line 25)
5. FLAG displayed immediately after authentication (line 26)
6. Subsequent GET requests to `/admin.php` display FLAG without re-authentication (lines 5-8)

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | No checks required for public endpoints | N/A (no session/storage) |
| admin | Session initialization: `session_start()` at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 2 | `if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true)` at line 5 | PHP session variable: `$_SESSION['admin_logged_in']` (boolean). Session files stored in default PHP session directory (unencrypted). |

**Code Locations:**
- **Role Assignment:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 25 (sets `$_SESSION['admin_logged_in'] = true` on successful authentication)
- **Role Validation:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` lines 5-8 (checks session variable before FLAG display)
- **Authentication Logic:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` lines 17-29 (processes credentials, queries database, sets session)
- **Admin Credentials:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql` line 58 (hardcoded: admin/ONEverySecurePassword_!)

**Notable Absences:**
- **No middleware framework:** No Laravel guards, no Symfony security component, no custom middleware classes
- **No RBAC system:** No role hierarchy beyond boolean admin flag
- **No permission granularity:** Admin role is all-or-nothing (binary access control)
- **No decorator-based auth:** No @RequireAuth, @RequireRole, or similar annotations
- **No JWT/token claims:** Pure session-based authentication, no token payload with role information

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**Applicability Assessment:** Limited horizontal privilege escalation opportunities due to application architecture.

**Explanation:** This application has a **single admin account** with no user-to-user resource ownership model. There are no endpoints with object IDs that reference per-user resources (e.g., no `/api/orders/{order_id}`, `/api/users/{user_id}/profile`).

**Blog Post Access:** All published blog posts are globally accessible without ownership validation. The `posts` table (db_init.sql lines 9-17) has no `user_id` or `owner_id` column - all posts are public when `published = 1`.

**Why Horizontal Escalation Is Limited:**
- Only one admin account exists (hardcoded in db_init.sql line 58)
- No user registration or multi-user support
- No per-user resources (orders, profiles, documents, etc.)
- Session only tracks boolean authentication state, not user identity

**Potential Horizontal Escalation Vector (Theoretical):**

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Notes |
|----------|------------------|---------------------|-----------|-------------|-------|
| N/A | None identified | N/A | N/A | N/A | Application lacks object-based access control requiring horizontal privilege checks. If multi-user functionality were added (e.g., user profiles, per-user posts), all endpoints would be HIGH priority candidates due to absence of ownership validation patterns in codebase. |

### 8.2 Vertical Privilege Escalation Candidates

**High Priority Targets:** Endpoints enabling escalation from anonymous to admin role.

| Target Role | Endpoint Pattern | Functionality | Risk Level | Vulnerability Details |
|-------------|------------------|--------------|-----------|----------------------|
| admin | `GET /index.php?category=` | Blog category filter with SQL injection | **CRITICAL** | **SQL Injection at line 41** enables credential extraction. Attack path: Exploit `$unescaped_category` parameter (line 41) → Extract admin credentials from `admins` table via `UNION SELECT username,password FROM admins` → Authenticate with extracted credentials → Gain admin session. File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` |
| admin | `POST /admin.php` | Admin authentication | **HIGH** | **Multiple vulnerabilities:** (1) Plaintext password comparison enables brute force if credentials leaked, (2) No rate limiting allows unlimited authentication attempts, (3) Session fixation vulnerability due to missing `session_regenerate_id()` after line 25, (4) Default credentials hardcoded in db_init.sql line 58 (`admin`/`ONEverySecurePassword_!`). File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` |
| admin | `GET /admin.php` (if session can be forged) | FLAG display | **MEDIUM** | **Session manipulation:** If attacker can set `$_SESSION['admin_logged_in'] = true` via session injection, fixation, or XSS-based session storage manipulation, they bypass authentication entirely. Session check at lines 5-8 only verifies boolean flag existence, not token cryptographic validity. |

**Attack Chain for Vertical Escalation (Most Direct Path):**
1. **Exploit SQL Injection** at `/index.php?category='` (line 41)
2. **Extract Admin Credentials:** Use `UNION SELECT` to query `admins` table
3. **Authenticate:** POST extracted credentials to `/admin.php`
4. **Gain Admin Session:** Receive `$_SESSION['admin_logged_in'] = true`
5. **Access Protected Resource:** GET `/admin.php` displays FLAG

**Alternative Attack Paths:**
- **Default Credential Authentication:** Try known default credentials from public repositories
- **Session Fixation:** Set victim's session ID, wait for victim to authenticate, hijack session
- **Brute Force (if time permits):** Unlimited authentication attempts with no rate limiting

### 8.3 Context-Based Authorization Candidates

**Applicability Assessment:** Not applicable - no multi-step workflows exist.

**Explanation:** This application has no multi-step processes that assume prior state completion. There are no workflows like:
- Checkout process (cart → payment → confirmation)
- Onboarding wizard (step1 → step2 → step3)
- Password reset flow (request → email → token → reset)
- Multi-step form submission

**Authentication as Single-Step Process:**
The only "workflow" is authentication, which is a single POST request with immediate result (success/failure). There is no:
- Email verification before account activation
- MFA second factor after password entry
- Admin approval after registration

**If Multi-Step Workflows Existed (Risk Assessment):**
Given the application's lack of state validation and authorization checks, any multi-step workflow would likely be vulnerable to step-skipping attacks. The absence of:
- CSRF tokens
- State tracking beyond boolean session flag
- Workflow state validation
- Transaction IDs or flow tokens

...would make context-based authorization bypasses trivial if such workflows were implemented.

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Notes |
|----------|----------|---------------------|------------------|-------|
| N/A | N/A | N/A | N/A | No multi-step workflows present. Application uses single-request authentication with immediate result. |

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through the target web application's network interface at `http://localhost:51233`. Local-only scripts, build tools, CLI applications, and components not accessible via network requests are excluded.

### SQL Injection Sources

#### SQL Injection Source #1: Category Filter (CRITICAL - VULNERABLE)

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php`

**Complete Data Flow Path:**
```
User Input [category via GET] 
→ Line 37 [read from $_GET['category']] 
→ Line 41 [UNESCAPED concatenation in SQL query - VULNERABLE] 
→ Line 52 [sanitization applied TOO LATE] 
→ Line 56 [sanitized version used in second query]
```

**Detailed Source Information:**

**Input Origin:**
- **Parameter Name:** `category`
- **HTTP Method:** GET
- **URL Pattern:** `http://localhost:51233/index.php?category={value}` or `http://localhost:51233/?category={value}`
- **Access Method:** Public, unauthenticated

**Code Locations:**

**Line 37 - Input Read:**
```php
$unescaped_category = isset($_GET['category']) ? $_GET['category'] : '';
```
- Variable name explicitly indicates lack of sanitization: `$unescaped_category`

**Line 41 - VULNERABLE SQL Query (BEFORE Sanitization):**
```php
$result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");
```
- **Dangerous Sink:** `$conn->query()` with string concatenation
- **Unsanitized Input:** `$unescaped_category` concatenated directly into SQL string
- **Query Purpose:** Validate that submitted category exists in database
- **No Prepared Statements:** Query uses string concatenation, not `prepare()` / `bind_param()`
- **No Sanitization at This Point:** Input used raw from `$_GET['category']`

**Line 52 - Sanitization Applied (TOO LATE):**
```php
$category = mysqli_real_escape_string($conn, $unescaped_category);
```
- **Sanitization Function:** `mysqli_real_escape_string()` (proper for SQL)
- **Timing Issue:** Applied AFTER vulnerable query at line 41 executes
- **Variable Naming:** Creates new variable `$category` (sanitized) vs `$unescaped_category` (raw)

**Line 56 - PROTECTED SQL Query (AFTER Sanitization):**
```php
$sql .= "and category = '" . $category . "' ";
```
- Uses sanitized `$category` variable
- Still uses string concatenation (not ideal), but input is escaped

**Vulnerability Assessment:**
- **Exploitable:** YES - SQL injection at line 41
- **Protection Status:** NONE at injection point
- **Severity:** CRITICAL
- **Authentication Required:** NO (public endpoint)

**Exploitation Examples:**

**Example 1: Category Validation Bypass**
```
GET /?category=' OR '1'='1
```
- Bypasses category existence check
- Query becomes: `SELECT DISTINCT category FROM posts where category = '' OR '1'='1'`
- Returns all categories

**Example 2: Credential Extraction via UNION**
```
GET /?category=' UNION SELECT password FROM admins WHERE username='admin'--
```
- Extracts admin password from database
- Query becomes: `SELECT DISTINCT category FROM posts where category = '' UNION SELECT password FROM admins WHERE username='admin'--'`
- Returns plaintext password in category dropdown

**Example 3: Full Database Enumeration**
```
GET /?category=' UNION SELECT CONCAT(username,':',password) FROM admins--
```
- Extracts all admin credentials in username:password format

**Impact:**
- Complete database read access (all tables accessible)
- Admin credential extraction (passwords in plaintext)
- Potential data manipulation via stacked queries (MySQL may allow with specific configurations)
- Enables vertical privilege escalation (extract credentials → authenticate as admin)

---

#### SQL Injection Source #2: Admin Username (PROTECTED)

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`

**Data Flow Path:**
```
User Input [username via POST] 
→ Line 17 [read from $_POST['username'] and immediately sanitized] 
→ Line 20 [used in SQL query with sanitized value]
```

**Input Origin:**
- **Parameter Name:** `username`
- **HTTP Method:** POST
- **Endpoint:** `/admin.php`
- **Form Field:** Line 52 (`<input type="text" name="username" required>`)

**Code Locations:**

**Line 17 - Input Read and Immediate Sanitization:**
```php
$username = mysqli_real_escape_string($conn, $_POST['username']);
```
- Sanitization applied BEFORE query construction

**Line 20 - SQL Query with Sanitized Input:**
```php
$sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
```
- Uses sanitized `$username` variable

**Vulnerability Assessment:**
- **Exploitable:** NO - sanitization applied before use
- **Protection Status:** Protected via `mysqli_real_escape_string()`
- **Severity:** N/A (protected)
- **Note:** Still uses string concatenation instead of prepared statements (not best practice, but functional)

---

#### SQL Injection Source #3: Admin Password (PROTECTED)

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`

**Data Flow Path:**
```
User Input [password via POST] 
→ Line 18 [read from $_POST['password'] and immediately sanitized] 
→ Line 20 [used in SQL query with sanitized value]
```

**Input Origin:**
- **Parameter Name:** `password`
- **HTTP Method:** POST
- **Endpoint:** `/admin.php`
- **Form Field:** Line 54 (`<input type="password" name="password" required>`)

**Code Locations:**

**Line 18 - Input Read and Immediate Sanitization:**
```php
$password = mysqli_real_escape_string($conn, $_POST['password']); //plaintext
```
- Sanitization applied BEFORE query construction
- Comment indicates plaintext password handling (separate vulnerability)

**Line 20 - SQL Query with Sanitized Input:**
```php
$sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
```
- Uses sanitized `$password` variable
- **CRITICAL SEPARATE ISSUE:** Password compared in plaintext (no `password_verify()`)

**Vulnerability Assessment:**
- **SQL Injection Exploitable:** NO - sanitization applied before use
- **Protection Status:** Protected via `mysqli_real_escape_string()`
- **Severity (SQL Injection):** N/A (protected)
- **Severity (Plaintext Password):** CRITICAL (different vulnerability class)

---

### Command Injection Sources

**Analysis Result:** NONE FOUND

**Comprehensive Search Performed:**

Searched all network-accessible PHP files for command execution functions:
- `exec()`
- `shell_exec()`
- `system()`
- `passthru()`
- `popen()`
- `proc_open()`
- Backtick operators (`` `command` ``)
- `pcntl_exec()`

**Files Analyzed:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`

**Result:** Zero instances of shell command execution in network-accessible code paths.

**Out-of-Scope (Not Network-Accessible):**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/entrypoint.sh` - Container initialization script, not invoked by HTTP requests
- Docker build commands in Dockerfile - Build-time only, not runtime accessible

**Conclusion:** Application performs NO shell command execution, eliminating command injection attack surface entirely. Application functionality is limited to:
- Database queries (MySQL via MySQLi)
- HTML rendering (echo statements)
- Session management (PHP sessions)
- Static file serving (Apache)

---

### Summary Table: Injection Sources

| # | Type | File | Line | Parameter | Source | Sanitization | Timing | Status |
|---|------|------|------|-----------|--------|--------------|--------|--------|
| 1 | SQLi | index.php | 41 | `category` | GET | None | N/A | **VULNERABLE** |
| 2 | SQLi | index.php | 56 | `category` | GET | mysqli_real_escape_string | Before query | PROTECTED |
| 3 | SQLi | admin.php | 20 | `username` | POST | mysqli_real_escape_string | Before query | PROTECTED |
| 4 | SQLi | admin.php | 20 | `password` | POST | mysqli_real_escape_string | Before query | PROTECTED |
| 5 | CMDi | N/A | N/A | N/A | N/A | N/A | N/A | NONE FOUND |

**Critical Finding:** Only ONE exploitable injection vulnerability exists (SQL injection at index.php line 41), but it is unauthenticated and enables complete database compromise including admin credential extraction for privilege escalation.

**Attack Path:** SQL Injection → Credential Extraction → Authentication → Admin Access → FLAG Retrieval