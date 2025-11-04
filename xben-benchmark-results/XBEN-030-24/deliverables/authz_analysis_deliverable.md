# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** The Backup Migration plugin v1.3.5 contains a **critical systemic authorization failure** affecting all 60+ AJAX endpoints. A total of **17 high-confidence authorization vulnerabilities** have been identified and documented for exploitation. All findings have been passed to the exploitation phase via the machine-readable JSON queue.
- **Purpose of this Document:** This report provides strategic context, dominant vulnerability patterns, and architectural intelligence necessary to effectively exploit the documented authorization flaws. It should be read alongside `deliverables/authz_exploitation_queue.json`.
- **Root Cause:** The plugin uses `is_admin()` instead of `current_user_can('manage_options')` as its primary authorization gate, allowing ANY authenticated user (including Subscribers) to execute administrator-only functions.

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Broken Authorization Gate (Vertical Privilege Escalation)
- **Description:** The plugin's single authorization checkpoint at `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:297` uses `is_admin()` which only verifies the request comes from the `/wp-admin/` area, NOT that the user has administrative privileges.
- **Implication:** All WordPress users with the `read` capability (default for Subscribers) can execute privileged backup operations including creating backups, restoring sites, modifying configurations, and managing staging environments.
- **Representative Vulnerabilities:** AUTHZ-VULN-01 through AUTHZ-VULN-11 (all vertical escalation findings)
- **Code Location:** `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:297`
- **Affected Endpoints:** ALL 60+ backup migration AJAX endpoints

### Pattern 2: Missing Backup Ownership Validation (Horizontal IDOR)
- **Description:** Backup files have no creator/owner tracking mechanism. While backup manifests store the creator's `user_id`, this field is never validated during access, modification, or deletion operations.
- **Implication:** Any user who can access the plugin (all authenticated users due to Pattern 1) can download, delete, or manipulate backups created by other users.
- **Representative Vulnerabilities:** AUTHZ-VULN-12 (backup download), AUTHZ-VULN-13 (backup deletion), AUTHZ-VULN-14 (backup lock manipulation)
- **Root Cause:** No ownership model implementation in `/wordpress/wp-content/plugins/backup-backup/includes/scanner/backups.php`

### Pattern 3: Configuration-Based Authentication Bypass (Context Workflow)
- **Description:** The plugin allows configuration values to bypass authentication entirely. When `STORAGE::DIRECT::URL` is set to `'true'` (the default), backup downloads become accessible without ANY authentication.
- **Implication:** If an attacker can modify plugin configuration (via Pattern 1), they can enable unauthenticated access to all backups, including those containing database credentials and WordPress authentication keys.
- **Representative Vulnerabilities:** AUTHZ-VULN-16 (configuration bypass)
- **Default State:** **ENABLED** in `/wordpress/wp-content/plugins/backup-backup/includes/htaccess/default.json`

### Pattern 4: Predictable Authentication Bypass Tokens (Context Workflow)
- **Description:** The auto-login feature after site restoration uses predictable token format: `{timestamp}_{IP}_4u70L051n` with a 6-second validity window. The timestamp is guessable, IP is spoofable via headers, and the suffix is a static string.
- **Implication:** Attackers who can detect when a restore operation occurs can brute-force administrator login within a 6-second window without knowing any password.
- **Representative Vulnerabilities:** AUTHZ-VULN-15 (auto-login bypass)
- **Code Location:** `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php:1097` (token generation), `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:996-1046` (validation)

### Pattern 5: Time-Based Access Control Bypass (Context Workflow)
- **Description:** Progress logs become publicly accessible (even to unauthenticated users) during a 5-minute window after file modification. This time-based authorization check relies on file timestamps rather than user permissions.
- **Implication:** Attackers can trigger backup operations and immediately access sensitive logs containing database structure, file paths, and error messages without authentication.
- **Representative Vulnerabilities:** AUTHZ-VULN-17 (progress logs time window)
- **Code Location:** `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:1194,1215,1236,1258`

---

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture
- **Session Type:** WordPress cookie-based authentication
- **Cookie Names:** 
  - `wordpress_[hash]` (authentication cookie)
  - `wordpress_logged_in_[hash]` (logged-in indicator)
- **Session Creation:** Standard WordPress `wp_signon()` flow
- **User ID Extraction:** Available via `get_current_user_id()` but **NOT consistently validated**
- **Critical Finding:** The plugin trusts that ANY authenticated user in `/wp-admin/` has authorization to perform backup operations

### Role/Permission Model
- **WordPress Roles Present:**
  - `anonymous` (unauthenticated)
  - `subscriber` (lowest privilege, `read` capability only)
  - `contributor`, `author`, `editor` (intermediate roles)
  - `administrator` (highest privilege)
- **Plugin Permission Model:** 
  - Menu requires `read` capability (accessible to ALL authenticated users)
  - AJAX handler requires `is_admin()` (true for ALL users in `/wp-admin/` area)
  - **No granular capability checks** like `manage_options` or `do_backups`
- **Critical Finding:** The plugin's authorization model is effectively **binary** (logged in vs not logged in), with no distinction between user privilege levels

### Resource Access Patterns
- **Backup Storage:** Shared directory at `/wp-content/backup-migration-eh8dobKJWN/backups/`
- **Backup Listing:** ALL backups visible to ALL authenticated users (no user filtering)
- **Backup Identification:** Filename-based via GET/POST parameters
- **Critical Finding:** No per-user subdirectories, no access control lists, no resource ownership model

### Workflow Implementation
- **Backup Creation:** Async process triggered via AJAX, runs in background via PHP CLI
- **Backup Restoration:** Multi-step process with intermediate state in database
- **Auto-Login Mechanism:** Creates token file after restore completion, valid for 6 seconds
- **Staging Sites:** Database-level duplication with separate table prefix
- **Critical Finding:** Multi-step workflows have weak state validation and predictable token generation

### AJAX Endpoint Architecture
- **Single Entry Point:** `/wp-admin/admin-ajax.php?action=backup_migration`
- **Function Dispatcher:** `f` parameter routes to specific handler functions
- **Common Parameters:**
  - `action=backup_migration` (required)
  - `token=bmi` (static hardcoded value, NOT a nonce)
  - `f=[function_name]` (dispatcher parameter)
  - `nonce=[wp_nonce]` (CSRF protection only)
- **Authorization Flow:**
  1. WordPress validates user is authenticated
  2. Plugin checks: `is_admin()` returns true (user in `/wp-admin/` area)
  3. Plugin checks: `$_POST['token'] == 'bmi'` (static string comparison)
  4. Plugin checks: `check_ajax_referer()` validates nonce (CSRF protection)
  5. **NO capability or role checks**
- **Critical Finding:** CSRF protection via nonces does NOT prevent authenticated low-privilege users from exploiting vertical escalation

### Nonce Acquisition
- **Method 1:** Access any plugin admin page (e.g., `/wp-admin/admin.php?page=backup-migration`)
- **Method 2:** Inspect page source or network requests
- **Method 3:** Use browser DevTools to extract from AJAX requests
- **Nonce Location:** Embedded in page as JavaScript variable or data attribute
- **Nonce Lifetime:** 24 hours (WordPress default: 2 × 12-hour ticks)
- **Critical Finding:** Low-privilege users can easily obtain valid nonces, making exploitation straightforward

---

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have robust, properly-placed guards. They are **low-priority** for further testing.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| WordPress Core `/wp-admin/plugins.php` | `/wordpress/wp-admin/plugins.php:12` | `current_user_can('activate_plugins')` - Administrator only | SAFE |
| WordPress Core `/wp-admin/users.php` | `/wordpress/wp-admin/users.php:10` | `current_user_can('list_users')` - Administrator only | SAFE |
| WordPress Core `/wp-admin/options-general.php` | `/wordpress/wp-admin/options-general.php:10` | `current_user_can('manage_options')` - Administrator only | SAFE |
| WordPress Core `/wp-admin/theme-editor.php` | `/wordpress/wp-admin/theme-editor.php:10` | `current_user_can('edit_themes')` - Administrator only | SAFE |
| WordPress Core REST API `/wp-json/wp/v2/users` | `/wordpress/wp-includes/rest-api/endpoints/class-wp-rest-users-controller.php:94` | `current_user_can('list_users')` + ownership validation | SAFE |
| WordPress Core Post Edit | `/wordpress/wp-admin/post.php` | `current_user_can('edit_post', $post_id)` via `map_meta_cap()` | SAFE |
| Akismet API Key Management `/wp-json/akismet/v1/key` | `/wordpress/wp-content/plugins/akismet/class.akismet-rest-api.php:28` | `current_user_can('manage_options')` | SAFE |

**WordPress Core Authorization:** All analyzed WordPress core endpoints use proper capability checks (`current_user_can()`) and ownership validation (`map_meta_cap()`). The vulnerabilities are isolated to the Backup Migration plugin.

---

## 5. Analysis Constraints and Blind Spots

### Untraced Code Paths
- **Pro Version Features:** The free version has conditional checks for `BMI_BACKUP_PRO` and `BMI_PRO_INC` constants. Pro-only features (external storage, advanced staging) could not be fully analyzed as the pro version source code is not available.
- **Cloud Storage Integration:** External storage handlers (Google Drive, Dropbox, etc.) are loaded dynamically via `bmi_premium_*` action hooks. Authorization for cloud operations could not be verified.

### Dynamic Permission System
- **Custom Capability:** The plugin references a `do_backups` capability at `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php:120`, but this capability is **never registered** in WordPress. This appears to be dead code or an incomplete feature.
- **Runtime Checks:** Some functions may have additional validation via WordPress filters/actions that couldn't be traced through static analysis.

### External Dependencies
- **PHP CLI Operations:** Many backup operations execute via `exec()` calls to PHP CLI. The CLI script (`/wordpress/wp-content/plugins/backup-backup/includes/cli-handler.php`) may have different authorization logic that wasn't fully traced.
- **Database Triggers:** The restoration process modifies the database directly via `$wpdb->query()`. Any database-level triggers or constraints couldn't be analyzed.

### Time-Based Behaviors
- **Auto-Login Race Conditions:** The 6-second time window for auto-login exploitation depends on precise timing. Network latency and server load could affect exploitability.
- **Progress Log Access:** The 5-minute time window for progress log access depends on file modification times, which could vary based on file system caching or NFS behavior.

### Assumed Safe (Not Verified)
- **File System Permissions:** Analysis assumes standard WordPress file permissions (www-data:www-data ownership, 644/755 modes). Misconfigurations could expose additional attack surface.
- **.htaccess Protection:** The backup directory is supposed to be protected by `.htaccess` files, but the plugin actively deletes these when `OTHER:DOWNLOAD:DIRECT` is enabled. The effectiveness of remaining .htaccess rules wasn't tested.

---

## 6. Exploitation Strategy Recommendations

### High-Value Target Prioritization
1. **AUTHZ-VULN-02 (restore-backup):** Highest impact - allows complete site takeover by restoring malicious backup containing new admin user
2. **AUTHZ-VULN-15 (auto-login bypass):** Direct path to admin session without needing backup restoration
3. **AUTHZ-VULN-12 (backup download):** Exfiltrate database credentials and WordPress secret keys
4. **AUTHZ-VULN-01 (create-backup):** Create backups to enumerate site data, then use AUTHZ-VULN-12 to download

### Attack Chain Sequencing
**Scenario 1: Subscriber → Administrator (Immediate)**
1. Authenticate as Subscriber
2. Obtain nonce from `/wp-admin/` page
3. Call `f=create-backup` to create backup (AUTHZ-VULN-01)
4. Call `f=get-current-backups` to enumerate backup filename
5. Download backup via `/?backup-migration=BMI_BACKUP&backup-id=[filename]` (AUTHZ-VULN-12)
6. Extract wp-config.php database credentials from backup
7. **Result:** Database access + all WordPress authentication keys

**Scenario 2: Low-Privilege → Admin Login (Time-Sensitive)**
1. Authenticate as Subscriber  
2. Trigger restore operation to create auto-login token (requires existing backup)
3. Within 6-second window: `GET /?backup-migration=AFTER_RESTORE&backup-id=[timestamp]&progress-id=4u70L051n` (AUTHZ-VULN-15)
4. Spoof IP headers: `X-Forwarded-For: 127.0.0.1`
5. **Result:** Logged in as administrator, full site control

**Scenario 3: Horizontal Privilege Escalation**
1. Authenticate as Admin User A
2. Enumerate all backups via `f=get-current-backups`
3. Download Admin User B's backup (AUTHZ-VULN-12)
4. Extract sensitive data from Admin User B's backup
5. **Result:** Cross-admin data access, credential theft

### Defense Evasion
- **Nonce Rotation:** Nonces are valid for 24 hours. Exploitation can occur any time within this window.
- **Logging:** The plugin logs backup operations but does NOT log failed authorization attempts (because there are no authorization checks to fail).
- **Rate Limiting:** No rate limiting exists on AJAX endpoints. Brute-force attacks (e.g., for auto-login tokens) are unthrottled.

---

## 7. Code Locations Reference

### Primary Authorization Flaw
- **File:** `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php`
- **Line:** 297
- **Flaw:** Uses `is_admin()` instead of `current_user_can('manage_options')`

### Backup Ownership Storage (But Never Validated)
- **File:** `/wordpress/wp-content/plugins/backup-backup/includes/progress/zip.php`
- **Line:** 77
- **Code:** `'uid' => get_current_user_id()`
- **Issue:** UID stored in manifest but never checked during access

### Auto-Login Token Generation
- **File:** `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php`
- **Lines:** 1097, 1153, 1175
- **Format:** `time() . '_' . $ip . '_' . '4u70L051n'`

### Auto-Login Token Validation
- **File:** `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php`
- **Lines:** 996-1046
- **Time Window:** ±6 seconds from timestamp

### Configuration Bypass
- **File:** `/wordpress/wp-content/plugins/backup-backup/includes/htaccess/default.json`
- **Line:** 2
- **Setting:** `"STORAGE::DIRECT::URL": "true"`
- **Impact:** Disables authentication for backup downloads

### Backup Download Handler
- **File:** `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php`
- **Lines:** 1048-1114
- **Authorization:** Config check OR `current_user_can('administrator')`
- **Ownership Validation:** NONE

### Backup Deletion Handler
- **File:** `/wordpress/wp-content/plugins/backup-backup/includes/ajax.php`
- **Lines:** 1640-1719
- **Path Traversal Protection:** Line 1672 (weak regex)
- **Ownership Validation:** NONE

### WordPress Core Authorization (Reference Implementation)
- **Capability Check:** `/wordpress/wp-includes/capabilities.php:293-368` (`has_cap` method)
- **Meta Capability Mapping:** `/wordpress/wp-includes/capabilities.php:44-822` (`map_meta_cap` function)
- **Post Ownership:** Uses `map_meta_cap('edit_post', $post_id)` to check author

---

## 8. Recommended Remediation

### Immediate Fix (Single Line Change)
**File:** `/wordpress/wp-content/plugins/backup-backup/includes/initializer.php`  
**Line:** 297

**Current (Vulnerable):**
```php
if ((isset($_POST['token']) && $_POST['token'] == 'bmi' && isset($_POST['f']) && is_admin()) || $cli) {
```

**Recommended (Secure):**
```php
if ((isset($_POST['token']) && $_POST['token'] == 'bmi' && isset($_POST['f']) && current_user_can('manage_options')) || $cli) {
```

**Impact:** This single change would mitigate ALL 11 vertical privilege escalation vulnerabilities (AUTHZ-VULN-01 through AUTHZ-VULN-11).

### Additional Fixes for Horizontal IDOR

**Add Ownership Validation in Backup Access:**
```php
// In backup download handler (initializer.php:1050)
$manifest = json_decode($zipper->getZipFileContent($file, 'bmi_backup_manifest.json'));
if ($manifest && isset($manifest->uid)) {
    if ($manifest->uid !== get_current_user_id() && !current_user_can('manage_options')) {
        header('HTTP/1.0 403 Forbidden');
        exit;
    }
}
```

**Fix Auto-Login Token Generation:**
```php
// Replace predictable token with cryptographically secure random string
$autoLoginMD = bin2hex(random_bytes(32)) . '_' . get_current_user_id();
```

**Disable Configuration-Based Authentication Bypass:**
```json
// In default.json:
{
  "STORAGE::DIRECT::URL": "false",
  "OTHER:DOWNLOAD:DIRECT": false
}
```

---

## 9. CVSS Scoring Summary

| Vulnerability Pattern | CVSS Base Score | Severity | Justification |
|----------------------|----------------|----------|---------------|
| Vertical Privilege Escalation (Pattern 1) | 9.1 | Critical | AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H - Low-privilege users gain admin access |
| Horizontal IDOR (Pattern 2) | 8.1 | High | AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N - Users access other users' data |
| Auto-Login Bypass (Pattern 4) | 9.1 | Critical | AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H - Time-sensitive admin access without credentials |
| Configuration Bypass (Pattern 3) | 7.5 | High | AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N - Unauthenticated backup download if config modified |

---

## 10. Conclusion

This authorization analysis confirms **systemic authorization failure** in the Backup Migration plugin v1.3.5. The root cause—using `is_admin()` instead of capability checks—affects 100% of analyzed endpoints. The vulnerability is **trivial to exploit** (single POST request with valid nonce) and has **critical impact** (complete site takeover, data exfiltration, horizontal privilege escalation).

All 17 confirmed vulnerabilities are documented in `deliverables/authz_exploitation_queue.json` and are ready for the Exploitation phase.

**Analysis Phase:** COMPLETE  
**Next Phase:** Authorization Exploitation