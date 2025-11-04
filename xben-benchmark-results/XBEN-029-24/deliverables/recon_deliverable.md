# Reconnaissance Deliverable: PayBuddies Portal

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

The PayBuddies Portal is a deliberately vulnerable PHP-based invoice upload web application running on a LAMP stack (Linux, Apache 2.4.41, MySQL 8.0, PHP 7.4). The application consists of three network-accessible PHP endpoints providing authentication and file upload functionality. The codebase uses vanilla PHP with no framework, totaling approximately 343 lines of code across three primary application files.

From an attack surface perspective, this application presents **CRITICAL security vulnerabilities** across multiple attack vectors:

**Critical Findings:**
- **SQL Injection** in authentication mechanism (index.php lines 25, 35) enabling complete authentication bypass and database compromise
- **Unrestricted File Upload** with path traversal (upload.php line 33) vulnerable to remote code execution
- **Broken Cryptography** using MD5 for password hashing
- **Missing Authorization Controls** - no role-based access control, no object ownership tracking
- **Session Security Failures** - no HttpOnly flags, no session regeneration, no logout functionality
- **No Input Validation** - zero server-side sanitization functions implemented

**Technology Stack:**
- **Frontend:** Bootstrap 5.2.3, jQuery 3.7.1, Font Awesome 5.15.4 (all loaded from CDN without SRI)
- **Backend:** PHP 7.4 (EOL), Apache 2.4.41, MySQL 8.0
- **Infrastructure:** Docker container, single-tier monolithic architecture
- **Session Management:** PHP native sessions (default configuration)

The application lacks fundamental security controls including prepared statements, CSRF protection, security headers, HTTPS, rate limiting, and input validation. The attack surface is compact but highly exploitable, with multiple pathways to complete system compromise available to unauthenticated external attackers.

## 2. Technology & Service Map

### Frontend
- **Framework:** Vanilla HTML5/JavaScript (no frontend framework)
- **CSS Framework:** Bootstrap 5.2.3 (CDN: cdn.jsdelivr.net)
- **JavaScript Library:** jQuery 3.7.1 (CDN: code.jquery.com)
- **Icons:** Font Awesome 5.15.4 (CDN: cdnjs.cloudflare.com)
- **Fonts:** Google Fonts (Lato, Roboto Condensed)
- **Security Issue:** No Subresource Integrity (SRI) hashes on any CDN resources

### Backend
- **Language:** PHP 7.4 (End-of-Life since November 2022)
- **Web Server:** Apache 2.4.41 (Ubuntu)
- **Database:** MySQL 8.0
- **API Style:** No framework - file-based routing with AJAX
- **Database Driver:** MySQLi (procedural style, no ORM)
- **Session Management:** PHP native sessions
- **Key Dependencies:** None (vanilla PHP, no Composer packages)

### Infrastructure
- **Hosting:** Docker container (single-container deployment)
- **Process Manager:** Supervisord (manages Apache and MySQL)
- **Operating System:** Ubuntu 20.04 LTS
- **Exposed Ports:** 80 (HTTP only - no HTTPS)
- **CDN:** None (application hosted locally, assets from external CDNs)
- **Database Type:** MySQL 8.0 (localhost, unencrypted connection)

### Identified Subdomains
From subfinder scan (pre-recon):
- mail.regency.localhost
- owa.regency.localhost
- www.localhost
- mail.localhost
- autodiscover.localhost

**Note:** These subdomains appear to be DNS artifacts and are not relevant to the PayBuddies Portal application attack surface.

### Open Ports & Services
From nmap scan:
- **Port 80/tcp:** Caddy httpd (proxy to PayBuddies Portal on port 35845)
- **Port 443/tcp:** SSL/HTTPS (not used by PayBuddies)
- **Port 631/tcp:** CUPS 2.3 (print service - out of scope)
- **Port 8888/tcp:** Unknown service (out of scope)
- **Port 9999/tcp:** SimpleHTTPServer Python 3.12 (out of scope)
- **Port 49158/tcp:** Tailscale (VPN service - requires authentication)

**Primary Target:** Port 80 serving PayBuddies Portal at http://localhost:35845

## 3. Authentication & Session Management Flow

### Entry Points
- **POST /index.php** - Primary authentication API endpoint
- **GET /index.php** - Login form display (redirects if already authenticated)
- **No registration endpoint** - User creation must be performed directly in database
- **No password reset endpoint** - No password recovery mechanism
- **No OAuth/SSO endpoints** - Local authentication only

### Mechanism

**Step-by-Step Authentication Process:**

1. **Login Form Display (GET /index.php):**
   - User navigates to http://localhost:35845/
   - Server calls `session_start()` (line 9)
   - Checks if `$_SESSION['username']` exists (line 10)
   - If already authenticated, redirects to dashboard.php
   - If not authenticated, renders HTML login form

2. **Credential Submission (Client-Side):**
   - User enters username and password
   - JavaScript validates minimum length (5 chars username, 8 chars password) - client-side only
   - AJAX POST request sent to /index.php with parameters: username, password, submit

3. **Username Validation (Server-Side Line 25):**
   ```php
   $check_details = mysqli_query($db_connect, 
       "SELECT username FROM users WHERE username = '$realusername' ");
   ```
   - **CRITICAL VULNERABILITY:** Direct SQL injection - no sanitization
   - If username not found (mysqli_num_rows != 1), returns `{"response":"username"}`
   - **Username Enumeration:** Different error for invalid username vs invalid password

4. **Password Hashing (Line 23, 33):**
   ```php
   $loginpassword = md5(md5($password).md5($usernamenew));
   ```
   - **BROKEN CRYPTOGRAPHY:** Uses MD5 (deprecated since 2004)
   - Username used as salt (predictable)
   - No key stretching, no work factor

5. **Credential Verification (Line 35):**
   ```php
   $sql = mysqli_query($db_connect, 
       "SELECT user_id FROM users WHERE username = '$usernamenew' 
        AND password = MD5(CONCAT(MD5('$password'), MD5('$usernamenew'))) LIMIT 1 ");
   ```
   - **CRITICAL VULNERABILITY:** Second SQL injection point
   - If credentials valid (mysqli_num_rows == 1), authentication succeeds
   - If password invalid, returns `{"response":"password"}`

6. **Session Creation (Line 41):**
   ```php
   $_SESSION["username"] = $realusername;
   echo json_encode(array("response"=>"Success"));
   ```
   - **Session Fixation Vulnerability:** No `session_regenerate_id()` call
   - Only stores username (no user_id, role, or security tokens)
   - Returns JSON: `{"response":"Success"}`

7. **Client-Side Redirect:**
   - JavaScript receives success response
   - Redirects browser to dashboard.php (line 176 of index.php JavaScript)

8. **Session Validation on Protected Pages:**
   - All protected pages (dashboard.php, upload.php) check:
   ```php
   if (isset($_SESSION['username'])){
       $username = $_SESSION['username'];
   }
   if(!$username){
       header("Location: index.php?error=failed_login");
       exit();
   }
   ```

### Code Pointers

**Primary Authentication Logic:**
- `/app/website/index.php` lines 19-53 (POST handler)
  - Line 21: `$realusername = $_POST['username'];` - No sanitization
  - Line 22: `$password = $_POST['password'];` - No sanitization
  - Line 25: First SQL query (username validation) - SQL injection
  - Line 35: Second SQL query (password verification) - SQL injection
  - Line 41: Session creation - No session regeneration

**Session Validation Logic:**
- `/app/website/dashboard.php` lines 7-16
- `/app/website/upload.php` lines 7-16
- Both files use identical session check pattern

**Database Schema:**
- `/app/init_db.sql` lines 10-14 (users table structure)
- Line 18: Default admin user creation with MD5 hash

**Session Configuration:**
- **MISSING** - No session_set_cookie_params() anywhere in codebase
- Uses PHP defaults (insecure)

### 3.1 Role Assignment Process

**Role Determination:** **NOT IMPLEMENTED**

**Analysis:**
- **Database Schema:** Users table contains only `user_id`, `username`, `password` - **NO role column**
- **Session Variables:** Only `$_SESSION['username']` is stored - **NO role stored**
- **Code Analysis:** Zero role-checking logic found in any endpoint

**Default Role:** N/A - No role system exists. All authenticated users have identical privileges.

**Role Upgrade Path:** N/A - No role hierarchy to upgrade within

**Code Implementation:** Does not exist

**Critical Finding:** Despite having an "admin" username in the database, the application code makes **NO distinction** between admin and regular users. All authenticated users have full access to all features (upload, dashboard).

### 3.2 Privilege Storage & Validation

**Storage Location:** **NOT APPLICABLE** - No privileges stored beyond binary authenticated/unauthenticated state

**What IS Stored:**
- `$_SESSION['username']` - The username string from POST input (unsanitized)
- Location: Line 41 of /app/website/index.php

**Validation Points:** 
- **File:** `/app/website/dashboard.php` lines 13-16
- **File:** `/app/website/upload.php` lines 13-16
- **Logic:** Simple existence check: `if(!$username){ redirect to login }`
- **No role validation** - Only checks if session exists

**Cache/Session Persistence:**
- Sessions persist indefinitely (no explicit timeout)
- Session files stored on server filesystem (PHP default)
- No session expiration logic implemented
- No idle timeout
- Sessions end only when: browser closes, PHP garbage collection runs, or server restarts

**Code Pointers:**
- Session creation: `/app/website/index.php:41`
- Session validation: `/app/website/dashboard.php:9-16`, `/app/website/upload.php:9-16`

### 3.3 Role Switching & Impersonation

**Impersonation Features:** **NOT IMPLEMENTED**

**Role Switching:** **NOT IMPLEMENTED**

**Audit Trail:** N/A - No audit logging exists

**Code Implementation:** Does not exist

**Findings:**
- No user impersonation functionality found
- No "sudo mode" or temporary privilege elevation
- No admin-to-user context switching
- No logging of any authentication or authorization events

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are accessible through the target web application at http://localhost:35845.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|--------------|---------------|---------------------|------------------------|---------------------------|
| GET | / (index.php) | anon | None | None (redirects if authenticated) | Login page display. See `/app/website/index.php:56-194`. Checks for existing session and redirects authenticated users to dashboard. |
| POST | /index.php | anon | None | None | Authentication API. See `/app/website/index.php:19-53`. Validates credentials against database via SQL queries. **VULNERABLE:** SQL injection at lines 25, 35. Returns JSON: `{"response":"Success|password|username"}` |
| GET | /dashboard.php | authenticated | None | Session check (username) | File upload form display. See `/app/website/dashboard.php:7-16`. Checks `$_SESSION['username']` existence. Redirects to login if not set. Renders HTML form for invoice upload. |
| POST | /upload.php | authenticated | None | Session check (username) | File upload handler. See `/app/website/upload.php:7-46`. Validates session, processes multipart file upload. **VULNERABLE:** Path traversal (line 33), weak extension check (line 30). Saves to `./uploaded_invoices/` with 0777 permissions. |
| GET | /uploaded_invoices/{filename} | **NONE** | filename | **MISSING** - No authorization | **CRITICAL IDOR:** Direct file access served by Apache. Any user (even unauthenticated) can access uploaded files by guessing/knowing filename. No PHP guard, no ownership check. See `/app/website/upload.php:32` for upload directory creation. |
| GET | /static/images/logo.png | anon | None | None | Static asset (company logo). Served directly by Apache. |

**Critical Authorization Gap:** The `/uploaded_invoices/` directory is web-accessible with no authorization checks. This creates a horizontal privilege escalation vulnerability where any user can access any uploaded file.

**Missing Endpoints:**
- No `/logout` endpoint - Users cannot terminate sessions
- No `/register` endpoint - No self-service user creation
- No `/password-reset` endpoint - No password recovery
- No `/api/admin/*` endpoints - No administrative interfaces despite "admin" user existing

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through the target web application's network interface at http://localhost:35845.

### URL Parameters

**Parameter:** `error`  
**Location:** GET /index.php  
**File:** `/app/website/index.php:15-16`  
**Validation:** None (only isset() check, value not used)  
**Usage:** `if(isset($_GET['error'])){ $error_login = "failed_login"; }`  
**Risk:** Low - Parameter existence checked but value not actually used in code  
**Code Reference:** Line 15-16 (PHP), Line 82 (HTML display)

### POST Body Fields (JSON/Form)

**Field:** `username`  
**Source:** `$_POST['username']`  
**Entry Point:** `/app/website/index.php:21`  
**Validation:** NONE (server-side), Client-side: min 5 chars (bypassable)  
**Usage Locations:**
  - Line 21: Direct assignment to `$realusername`
  - Line 25: **SQL query** - `"SELECT username FROM users WHERE username = '$realusername'"`
  - Line 35: **SQL query** - Used in password verification query
  - Line 41: Stored in session - `$_SESSION["username"] = $realusername;`  
**Dangerous Usage:** **CRITICAL SQL INJECTION** - Direct concatenation in SQL queries  
**Sanitization:** NONE - No mysqli_real_escape_string(), no prepared statements

**Field:** `password`  
**Source:** `$_POST['password']`  
**Entry Point:** `/app/website/index.php:22`  
**Validation:** NONE (server-side), Client-side: min 8 chars (bypassable)  
**Usage Locations:**
  - Line 22: Direct assignment to `$password`
  - Line 23, 33: MD5 hashing
  - Line 35: **SQL query** - `"...password = MD5(CONCAT(MD5('$password'), MD5('$usernamenew')))..."`  
**Dangerous Usage:** **CRITICAL SQL INJECTION** - Concatenated into SQL query within MD5 function  
**Sanitization:** NONE - No escaping before SQL usage

**Field:** `submit`  
**Source:** `$_POST['submit']`  
**Entry Point:** `/app/website/index.php:19`  
**Validation:** isset() check only  
**Usage:** Trigger parameter for authentication logic  
**Risk:** Low - Only used as conditional trigger

### File Upload Fields

**Field:** `invoice` (file upload)  
**Source:** `$_FILES['invoice']`  
**Entry Point:** `/app/website/upload.php:19`  
**Validation:** **INSUFFICIENT**
  - Line 19: Error check - `$_FILES['invoice']['error'] === UPLOAD_ERR_OK`
  - Line 30: **WEAK** extension check - `strpos($fileName, '.pdf') !== false`
  - NO MIME type validation
  - NO magic byte validation
  - NO filename sanitization  
**Usage Locations:**
  - Line 21: `$fileTmpPath = $_FILES['invoice']['tmp_name']`
  - Line 22: `$fileName = $_FILES['invoice']['name']` - **UNSANITIZED**
  - Line 23: `$fileSize = $_FILES['invoice']['size']` - Read but not validated
  - Line 24: `$fileType = $_FILES['invoice']['type']` - Read but not validated
  - Line 33: **Path construction** - `$dest_path = $uploadFileDir . $fileName;`
  - Line 39: File move - `move_uploaded_file($fileTmpPath, $dest_path)`  
**Dangerous Usage:** **CRITICAL PATH TRAVERSAL & UNRESTRICTED FILE UPLOAD**
  - Direct filename concatenation without basename() or sanitization
  - Weak extension check allows: `shell.php.pdf`, `malicious.pdf.php`, `../../var/www/html/backdoor.php.pdf`
  - No path validation with realpath()  
**Sanitization:** NONE

### HTTP Headers

**Header:** `X-Forwarded-For`, `User-Agent`, `Referer`  
**Usage:** Not used by application code  
**Risk:** None - Application does not read or process these headers

**Header:** `Cookie` (PHPSESSID)  
**Source:** Session cookie set by PHP  
**Usage:** Session management (read automatically by session_start())  
**Security Issues:**
  - No HttpOnly flag configured
  - No Secure flag (HTTP only, no HTTPS)
  - No SameSite attribute
  - Vulnerable to XSS cookie theft and CSRF

### Cookie Values

**Cookie:** `PHPSESSID`  
**Purpose:** PHP session identifier  
**Set By:** `session_start()` calls (index.php:9, dashboard.php:5, upload.php:5)  
**Validation:** Automatic by PHP session handler  
**Security Configuration:** Default PHP settings (insecure)  
**Issues:** No session regeneration after authentication (session fixation vulnerability)

**No other application cookies identified**

### Session Variables (Internal)

**Variable:** `$_SESSION['username']`  
**Source:** Set from unsanitized `$_POST['username']` at `/app/website/index.php:41`  
**Usage Locations:**
  - `/app/website/dashboard.php:10` - Retrieved for authorization check
  - `/app/website/upload.php:10` - Retrieved for authorization check  
**Risk:** **MEDIUM** - Contains unsanitized user input. If later echoed to HTML without encoding, creates stored XSS vulnerability  
**Current Status:** Retrieved but not output to HTML in current code

## 6. Network & Interaction Map

**Network Surface Focus:** This section maps only network-accessible components of the deployed PayBuddies Portal application. Local development tools, build systems, and non-web-served components are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Public Internet | ExternAsset | Internet | N/A | Public | External network boundary |
| User Browser | ExternAsset | Internet | HTML5/JS | PII (credentials) | Client application |
| PayBuddies Web App | Service | App | PHP 7.4 / Apache 2.4 | PII, Tokens, Files | Main application backend |
| MySQL Database | DataStore | Data | MySQL 8.0 | PII, Tokens (hashed passwords) | Stores user credentials |
| Session Storage | DataStore | App | PHP File Sessions | Tokens | PHP session files on disk |
| Uploaded Files | DataStore | App | Filesystem | PII (invoices) | Directory: ./uploaded_invoices/ (0777 perms) |
| CDN Assets | ThirdParty | ThirdParty | CDN | Public | Bootstrap, jQuery, Font Awesome |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| PayBuddies Web App | Hosts: `http://localhost:35845`; Endpoints: `/index.php`, `/dashboard.php`, `/upload.php`, `/uploaded_invoices/*`; Auth: PHP Sessions (PHPSESSID cookie); Dependencies: MySQL Database, Session Storage, Uploaded Files; Container: Docker (single container); Process Manager: Supervisord |
| MySQL Database | Engine: `MySQL 8.0`; Exposure: `Internal Only (localhost)`; Consumers: `PayBuddies Web App`; Credentials: `web_db_user / P@ssw0rd123!` (hardcoded in `/app/website/include/db_config.php`); Database: `app_db`; Tables: `users` (user_id, username, password); Connection: Unencrypted MySQLi |
| Session Storage | Location: `/var/lib/php/sessions/` (PHP default); Format: `Serialized PHP`; Lifetime: `Indefinite (no timeout)`; Security: `No encryption, default permissions`; Cookie Flags: `None (no HttpOnly, no Secure, no SameSite)` |
| Uploaded Files | Directory: `./uploaded_invoices/`; Permissions: `0777 (world-writable)`; Access: `Direct via Apache (no PHP guard)`; Ownership Tracking: `NONE (no database records)`; Content Validation: `NONE (weak extension check only)` |
| CDN Assets | Bootstrap: `https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/`; jQuery: `https://code.jquery.com/jquery-3.7.1.min.js`; Font Awesome: `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/`; SRI Hashes: `NONE (vulnerable to CDN compromise)` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → PayBuddies Web App | HTTP | `:80 /index.php` | None | PII (credentials in cleartext) |
| User Browser → PayBuddies Web App | HTTP | `:80 /dashboard.php` | auth:session | PII |
| User Browser → PayBuddies Web App | HTTP | `:80 /upload.php` | auth:session | PII (invoice files) |
| User Browser → PayBuddies Web App | HTTP | `:80 /uploaded_invoices/*` | **NONE** | PII (direct file access - **NO AUTH**) |
| PayBuddies Web App → MySQL Database | TCP | `:3306 localhost` | hardcoded-credentials | PII, Tokens |
| PayBuddies Web App → Session Storage | File | Filesystem | None | Tokens |
| PayBuddies Web App → Uploaded Files | File | Filesystem | None | PII |
| User Browser → CDN Assets | HTTPS | External CDNs | None | Public (JS/CSS) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:session | Auth | Requires valid PHP session with `$_SESSION['username']` set. Validated via `if(!$username)` check in dashboard.php:13-16 and upload.php:13-16. **WEAKNESS:** No session integrity checking, no timeout validation, no regeneration after login. |
| hardcoded-credentials | Auth | MySQL connection using hardcoded credentials: `web_db_user / P@ssw0rd123!` stored in plaintext at `/app/website/include/db_config.php:5`. **CRITICAL WEAKNESS:** Password exposed in source code. |
| **NONE** (uploaded_invoices) | Authorization | **MISSING GUARD:** The `/uploaded_invoices/` directory has NO authorization guard. Files served directly by Apache without PHP ownership validation. **CRITICAL VULNERABILITY:** Any user can access any file. |
| strpos-pdf-check | Input Validation | Weak file upload validation: `strpos($fileName, '.pdf') !== false` at `/app/website/upload.php:30`. Only checks if ".pdf" appears anywhere in filename. **EASILY BYPASSED:** Allows `shell.php.pdf`, `malicious.pdf.php`, `../../traversal.pdf`. |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**Critical Finding:** The PayBuddies Portal has **NO role-based access control system**. Authorization operates on a simple binary model: unauthenticated vs authenticated.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anonymous | 0 | Global | No authentication required. Can access: `/index.php` (login page) |
| authenticated | 1 | Global | Any user with valid session. Can access: `/dashboard.php`, `/upload.php`. Session check at dashboard.php:13-16, upload.php:13-16 |

**No Other Roles Found:**
- Database schema (`/app/init_db.sql:10-14`) has NO `role` column in users table
- Session storage includes NO role variable (only `$_SESSION['username']`)
- Code contains NO role validation logic (searched for: "admin", "role", "permission", "capability" - found zero authorization checks)

**Admin User Analysis:**
- User "admin" exists in database (`/app/init_db.sql:18`)
- **BUT:** Application code makes **NO distinction** between "admin" and regular users
- All authenticated users have identical privileges
- No admin-only endpoints found

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anonymous → authenticated

Parallel Isolation:
NONE - No parallel roles exist
```

**Explanation:**
- **Level 0 (anonymous):** Can only access login page
- **Level 1 (authenticated):** Can access all application features (dashboard, file upload)
- **No higher levels exist** - No admin role, no manager role, no privilege hierarchy

**Role Switching Mechanisms:** NONE
- No impersonation features
- No "sudo mode" or temporary privilege elevation
- No role upgrade paths

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anonymous | `/` (index.php) | `/index.php`, `/static/images/*` | None |
| authenticated | `/dashboard.php` | `/dashboard.php`, `/upload.php`, `/uploaded_invoices/*` | PHP session (PHPSESSID cookie) |

**Notes:**
- Authenticated users redirected to `/dashboard.php` after login (index.php:176)
- Unauthenticated access to protected pages redirects to `/index.php?error=failed_login`
- **CRITICAL:** `/uploaded_invoices/*` is accessible to ALL users (even anonymous) via direct URL - **NO authorization guard**

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A |
| authenticated | Inline session check | `if (isset($_SESSION['username'])) { ... } if(!$username) { redirect }` | `$_SESSION['username']` (session file storage) |

**Session Check Implementation:**
- **File:** `/app/website/dashboard.php:7-16`
- **File:** `/app/website/upload.php:7-16`
- **Logic:**
```php
session_start();
$username = '';
if (isset($_SESSION['username'])){
    $username = $_SESSION['username'];
}
if(!$username){
    header("Location: index.php?error=failed_login");
    exit();
}
```

**No Middleware Architecture:**
- Authorization checks are copy-pasted inline code (code duplication)
- No centralized authorization function
- No decorators or route-level guards
- No Apache .htaccess protection

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|-----------------|---------------------|-----------|-------------|
| **CRITICAL** | `/uploaded_invoices/{filename}` | filename | user_files (invoices) | **HIGH** - Direct file access with NO authorization. Any user (even unauthenticated) can access ANY file by knowing/guessing filename. Apache serves files directly without PHP guard. No ownership tracking in database. |
| High | `/dashboard.php` | N/A | N/A | Currently no IDOR (no object IDs), but demonstrates missing authorization framework |
| High | `/upload.php` | N/A | N/A | All authenticated users can upload files to shared directory. No per-user folders, no isolation. |

**Critical IDOR Vulnerability Details:**

**Attack Scenario:**
1. Alice (authenticated user) uploads `invoice_12345.pdf`
2. File saved to `/uploaded_invoices/invoice_12345.pdf` (no user prefix)
3. Bob (any user, even anonymous) navigates to `http://localhost:35845/uploaded_invoices/invoice_12345.pdf`
4. Apache serves file directly - **NO PHP authorization check**
5. Bob downloads Alice's sensitive invoice

**Root Cause:**
- `/app/website/upload.php:32-33` creates shared upload directory with no ownership tracking:
  ```php
  $uploadFileDir = './uploaded_invoices/';
  $dest_path = $uploadFileDir . $fileName;
  ```
- No database table tracking uploaded files or ownership
- No download proxy (e.g., `download.php?file_id=123`) with authorization
- Apache DirectoryIndex not disabled - directory listing may be enabled

**Proof of Concept:**
```bash
# User A uploads file
curl -X POST -F "invoice=@confidential.pdf" \
  -H "Cookie: PHPSESSID=user_a_session" \
  http://localhost:35845/upload.php

# User B (or anonymous) accesses file directly
curl http://localhost:35845/uploaded_invoices/confidential.pdf
# SUCCESS - File downloaded without authorization
```

### 8.2 Vertical Privilege Escalation Candidates

**NO vertical privilege escalation opportunities identified.**

**Reason:** The application has NO privilege hierarchy. All authenticated users have identical access to all features. There are no admin-only endpoints, no elevated privilege functions, and no role-based restrictions.

**What Does NOT Exist:**
- ❌ No `/admin/*` endpoints
- ❌ No admin dashboard or management interface  
- ❌ No user management functions (create/delete users)
- ❌ No system configuration endpoints
- ❌ No reporting or analytics restricted to admins
- ❌ No role upgrade mechanisms

**Implication:** Vertical privilege escalation testing is **NOT APPLICABLE** for this application. Focus testing on:
1. **Authentication bypass** (SQL injection to gain authenticated access)
2. **Horizontal privilege escalation** (accessing other users' files)

### 8.3 Context-Based Authorization Candidates

**NO multi-step workflows or context-based authorization found.**

**Analysis:**
- All endpoints are stateless beyond session authentication
- No multi-step processes (e.g., checkout flow, multi-step forms)
- No workflow state tracking
- No prerequisites for endpoint access beyond authentication

**What Does NOT Exist:**
- ❌ No shopping cart or checkout flow
- ❌ No wizard/multi-step forms
- ❌ No approval workflows
- ❌ No state machine for business processes

**Upload Flow Analysis:**
- File upload is single-step: POST to /upload.php with file
- No prior state required (e.g., "cart populated", "payment method selected")
- No sequence enforcement

**Implication:** Context-based authorization bypass testing is **NOT APPLICABLE**.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** All injection sources listed below are accessible through the target web application's network interface.

### SQL Injection Sources

#### Source 1: Username Parameter in Authentication (First Query)

**Input Vector:** POST /index.php - username parameter  
**Entry Point:** `/app/website/index.php:21`  
**Variable Flow:** `$_POST['username']` → `$realusername` → SQL query (line 25)  

**Dangerous Sink:**
```php
Line 25: $check_details = mysqli_query($db_connect, 
    "SELECT username FROM users WHERE username = '$realusername' ");
```

**Sanitization Applied:** **NONE**
- No mysqli_real_escape_string()
- No prepared statements
- No input validation
- Direct string concatenation

**Exploitability:** **CRITICAL**

**Complete Data Flow:**
1. User submits login form via AJAX POST
2. Line 21: `$realusername = $_POST['username'];` - Direct assignment, zero validation
3. Line 25: Variable concatenated directly into SQL string
4. mysqli_query() executes malicious SQL

**Proof of Concept:**
```
POST /index.php HTTP/1.1
Content-Type: application/x-www-form-urlencoded

username=admin' OR '1'='1' --&password=anything&submit=submit

Resulting query:
SELECT username FROM users WHERE username = 'admin' OR '1'='1' --'

Impact: Authentication bypass - OR condition makes WHERE clause always true
```

---

#### Source 2: Username Parameter in Authentication (Second Query)

**Input Vector:** POST /index.php - username parameter (second-order via $usernamenew)  
**Entry Point:** `/app/website/index.php:21`  
**Variable Flow:** `$_POST['username']` → SQL query 1 → database → `$usernamenew` → SQL query 2 (line 35)

**Dangerous Sink:**
```php
Line 35: $sql = mysqli_query($db_connect, 
    "SELECT user_id FROM users WHERE username = '$usernamenew' 
     AND password = MD5(CONCAT(MD5('$password'), MD5('$usernamenew'))) LIMIT 1 ");
```

**Sanitization Applied:** **NONE**

**Exploitability:** **CRITICAL**

**Complete Data Flow:**
1. User input: `$_POST['username']` → Line 21: `$realusername`
2. Line 25: First SQL query (already vulnerable)
3. Lines 30-32: Result fetched into `$usernamenew` from database
4. Line 35: `$usernamenew` concatenated into second SQL query
5. **Second-order injection risk:** Data retrieved from database and reused in another query without sanitization

**Proof of Concept:**
```
username=admin' UNION SELECT 'malicious'--
password=anything

First query returns username='malicious'
Second query uses username='malicious' in WHERE clause
Could escalate to UNION-based SQL injection for data extraction
```

---

#### Source 3: Password Parameter in Authentication

**Input Vector:** POST /index.php - password parameter  
**Entry Point:** `/app/website/index.php:22`  
**Variable Flow:** `$_POST['password']` → `$password` → SQL query (line 35)

**Dangerous Sink:**
```php
Line 35: $sql = mysqli_query($db_connect, 
    "SELECT user_id FROM users WHERE username = '$usernamenew' 
     AND password = MD5(CONCAT(MD5('$password'), MD5('$usernamenew'))) LIMIT 1 ");
```

**Sanitization Applied:** **NONE**

**Exploitability:** **CRITICAL**

**Complete Data Flow:**
1. User submits password via POST
2. Line 22: `$password = $_POST['password'];` - Direct assignment
3. Line 35: Raw password concatenated into SQL query inside MD5() function
4. Can break out of MD5() context using SQL injection

**Proof of Concept:**
```
password='), 'x')) OR '1'='1' --

Resulting query structure:
...password = MD5(CONCAT(MD5(''), 'x')) OR '1'='1' --'), MD5('admin'))) LIMIT 1

Breaks out of MD5() function and adds OR condition for authentication bypass
```

### Command Injection Sources

**NO command injection sources found in network-accessible code.**

**Comprehensive Search Results:**
- **exec():** Not found
- **shell_exec():** Not found
- **system():** Not found
- **passthru():** Not found
- **popen():** Not found
- **proc_open():** Not found
- **Backtick operators:** Not found
- **pcntl_exec():** Not found

**Files Examined:**
- `/app/website/index.php`
- `/app/website/dashboard.php`
- `/app/website/upload.php`
- `/app/website/include/db_config.php`

**Conclusion:** Application performs no shell command execution. No command injection attack surface exists.

### Summary Table

| Injection Type | Source | Location | Severity | Sanitization |
|----------------|--------|----------|----------|--------------|
| **SQL Injection** | username (query 1) | index.php:25 | CRITICAL | NONE |
| **SQL Injection** | username (query 2) | index.php:35 | CRITICAL | NONE |
| **SQL Injection** | password | index.php:35 | CRITICAL | NONE |
| **Command Injection** | - | - | N/A | Not applicable |

**Critical Statistics:**
- **3 SQL injection vulnerabilities** identified
- **0 command injection vulnerabilities** identified
- **0 prepared statements** used anywhere in codebase
- **0 sanitization functions** applied to any user input

**Additional Injection-Related Findings:**

**Path Traversal (Not SQL/Command Injection):**
- **Location:** `/app/website/upload.php:33`
- **Source:** `$_FILES['invoice']['name']`
- **Sink:** `$dest_path = $uploadFileDir . $fileName;`
- **Sanitization:** NONE - No basename(), no path filtering
- **Exploitability:** CRITICAL - Arbitrary file write via `../../` sequences
- **Example:** Filename `../../var/www/html/shell.php.pdf` writes to web root

This concludes the injection source analysis. All SQL injection vulnerabilities are concentrated in the authentication logic of index.php.