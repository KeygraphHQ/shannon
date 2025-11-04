# Authentication Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** Critical authentication flaws were identified across multiple dimensions: missing transport security (HTTP-only), absent abuse protection (no rate limiting/CAPTCHA), insecure session management (missing security flags, incomplete session fixation mitigation), weak session cookie configuration, and absence of modern authentication protections (no MFA).
- **Purpose of this Document:** This report provides strategic context on the application's authentication mechanisms, dominant flaw patterns, and architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of Transport Security

- **Description:** The application runs entirely over unencrypted HTTP on port 36423. Apache is configured only for port 80 with no HTTPS/TLS support. All authentication cookies lack the `Secure` flag and authentication responses lack Cache-Control headers.
- **Implication:** All credentials (username/password), session tokens (PHPSESSID), and authentication cookies (`data`) are transmitted in plaintext over the network. Network attackers can intercept credentials during login/registration, hijack sessions via cookie theft, and perform man-in-the-middle attacks. Browser/proxy caching may expose authentication pages.
- **Representative Findings:** `AUTH-VULN-01` (Transport Exposure), related to `AUTH-VULN-03` and `AUTH-VULN-04` (cookie security)

### Pattern 2: Missing Abuse Protection Mechanisms

- **Description:** Authentication endpoints (POST /sign-in.php, POST /sign-up.php) have zero rate limiting, no CAPTCHA, no account lockout, no IP-based blocking, and no monitoring/alerting of authentication failures. An attacker can submit unlimited authentication attempts with no restrictions.
- **Implication:** The application is completely vulnerable to credential stuffing, brute force password attacks, and automated account creation flooding. With no password complexity requirements, even single-character passwords are accepted, making brute force trivial.
- **Representative Finding:** `AUTH-VULN-02` (Abuse Defenses Missing)

### Pattern 3: Insecure Session Management

- **Description:** Session cookies (PHPSESSID) rely on PHP 7.1 defaults without explicit security hardening. The authentication cookie (`data`) is created with NO security flags (no HttpOnly, no Secure, no SameSite). Session regeneration after login is incomplete (missing `true` parameter to delete old session). No custom session timeout configuration exists.
- **Implication:** Session cookies are vulnerable to XSS-based theft (no HttpOnly), network interception (no Secure), and CSRF attacks (no SameSite). The incomplete session regeneration creates a session fixation vulnerability. Sessions rely on 24-minute PHP defaults without explicit timeout controls.
- **Representative Findings:** `AUTH-VULN-03` (Session Cookie Misconfiguration), `AUTH-VULN-04` (Data Cookie Misconfiguration), `AUTH-VULN-05` (Session Fixation)

### Pattern 4: Weak Credential Policy

- **Description:** The application enforces no server-side password policy. The validateInput() function only performs XSS sanitization (htmlspecialchars), not password strength validation. Passwords like "1", "a", or "password" are accepted. No MFA is implemented. Username enumeration is possible via registration timing/error differences.
- **Implication:** Users can create trivially weak accounts that are easily compromised via brute force. Combined with absent rate limiting, attackers can rapidly test common passwords. The lack of MFA means a single compromised password grants full account access.
- **Representative Finding:** `AUTH-VULN-02` (enables weak password exploitation)

## 3. Strategic Intelligence for Exploitation

### Authentication Architecture

- **Primary Mechanism:** Username/password authentication with bcrypt hashing (PASSWORD_DEFAULT, cost factor 10)
- **Dual Authentication System:** The application uses BOTH PHP sessions (PHPSESSID) AND a serialized cookie (`data`) for authentication. The authentication check at index.php line 8 uses logical AND: `if (!isset($_SESSION['username']) && !isset($_COOKIE["data"]))`, meaning authentication succeeds if EITHER session OR cookie exists. This enables bypassing session-based authentication entirely by presenting only a cookie.
- **Session Management:** Native PHP sessions with file-based storage in /var/tmp/. Session regeneration occurs at login (sign-in.php:38) but lacks the `true` parameter for old session deletion.

### Session Token Details

- **PHPSESSID Cookie:** Native PHP session cookie using default PHP 7.1 configuration (no explicit session_set_cookie_params() calls). Likely lacks HttpOnly/Secure flags based on PHP 7.1 defaults.
- **'data' Cookie:** Base64-encoded serialized UserProfile object containing `userid` and `username` properties. Created at sign-in.php:37 with: `setcookie('data', base64_encode(serialize($profile)));`. No integrity protection (no HMAC/signature), no encryption, no security flags. Deserialized at index.php:13 without validation.
- **Cookie Structure Example:** `TzoxMToiVXNlclByb2ZpbGUiOjI6e3M6NjoidXNlcmlkIjtpOjI7czo4OiJ1c2VybmFtZSI7czo4OiJ0ZXN0dXNlciI7fQ==` (base64) → `O:11:"UserProfile":2:{s:6:"userid";i:2;s:8:"username";s:8:"testuser";}` (serialized)

### Session Lifecycle

1. **Pre-authentication:** No session exists. Accessing index.php redirects to sign-in.php.
2. **Login (sign-in.php):** 
   - Line 6: `session_start()` initializes session
   - Lines 23-33: Credentials validated via prepared statement and password_verify()
   - Line 37: **CRITICAL** `setcookie('data', base64_encode(serialize($profile)));` creates insecure cookie
   - Line 38: `session_regenerate_id();` rotates session (but missing `true` parameter)
   - Line 39: `$_SESSION['username'] = $row['username'];` stores only username in session (not userid)
   - Line 40: Redirect to index.php
3. **Authenticated Access (index.php):**
   - Line 6: `session_start()`
   - Line 8: Authentication check (session OR cookie)
   - Line 13: **CRITICAL** `unserialize(base64_decode($_COOKIE["data"]))` trusts client cookie
   - Line 14: Extracts userid from unserialized object (no validation)
4. **Logout (logout.php):**
   - Line 3: `session_unset()` clears session variables
   - Line 4: `session_destroy()` destroys session
   - Line 5: `setcookie("data", "", time()-3600)` expires cookie

### Password Policy

- **Client-Side:** Only HTML5 `required` attribute (non-empty field)
- **Server-Side:** None. validateInput() only applies htmlspecialchars() for XSS prevention, no password strength checks
- **Acceptance:** Single-character passwords accepted, no minimum length, no complexity requirements, no common password rejection
- **Storage:** Bcrypt hashing with PASSWORD_DEFAULT (cost 10) - this is SECURE
- **Verification:** password_verify() for timing-safe comparison - this is SECURE

### Default Credentials

- **Admin Account:** Username `admin`, password hash `'NO LOGIN'` (invalid bcrypt hash, intentionally unprivileged). Admin account cannot authenticate via normal login flow. Only accessible via authorization bypass vulnerabilities (out of scope for AuthN analysis).
- **Database Credentials:** Hardcoded in config.php, init.sql, and docker-compose.yml healthcheck: `db_username` / `pCxvkPyS9JYq27BVdUX4N8`

### Error Messages

- **Login Errors:** Generic message "Invalid username or password." for both non-existent users and wrong passwords (GOOD - prevents enumeration)
- **Registration Errors:** Generic message "Invalid values." but MySQL UNIQUE constraint on username may cause timing differences enabling enumeration

### Technology Stack Constraints

- **PHP Version:** 7.1.33 (End of Life: December 2019, 5+ years without security patches)
- **SameSite Support:** Not available in PHP 7.1 (added in PHP 7.3)
- **Session Configuration:** No php.ini customization, no ini_set() security hardening

## 4. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses or correct implementation. They are low-priority for further authentication testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Password Hashing | sign-up.php:20 | Uses `password_hash($password, PASSWORD_DEFAULT)` with bcrypt, automatic salt generation | SAFE |
| Password Verification | sign-in.php:33 | Uses `password_verify()` for timing-safe comparison, prevents timing attacks | SAFE |
| SQL Injection Prevention | All auth endpoints | Consistent use of prepared statements with bind_param() for all database queries | SAFE |
| Login Error Messages | sign-in.php:43, 46 | Same error message for "user not found" and "wrong password": "Invalid username or password." | SAFE |
| Session Entropy | PHP 7.1 defaults | Uses PHP 7.1's built-in CSPRNG (php_random_bytes()) for session ID generation, 128-bit session IDs | SAFE |
| No Session IDs in URLs | All endpoints | Sessions use cookies only, no session.use_trans_sid, no query string session parameters | SAFE |
| Logout Server-Side Cleanup | logout.php:3-4 | Properly calls session_unset() and session_destroy() to invalidate server-side session | SAFE |
| No Sensitive Data Logging | All auth files | No error_log(), var_dump(), or print_r() calls that would log credentials/sessions | SAFE |
| Redirect Security | All header() calls | All redirects are to static paths (no query parameters), no user-controlled redirect targets | SAFE |
| Database Password Storage | users table | Password field is VARCHAR(255), adequate for bcrypt hashes (60 chars) with room for future algorithms | SAFE |

**Note:** While these components are individually secure, they exist within a systemically insecure authentication architecture (HTTP-only, no rate limiting, insecure cookies). The secure password hashing is undermined by the ability to brute force due to missing abuse protections and plaintext transmission.

## 5. Out-of-Scope Findings

The following issues were identified but are outside the authentication analysis scope (they relate to authorization, not authentication):

- **Insecure Deserialization for Authorization Bypass:** The 'data' cookie is deserialized and the userid is extracted without validation (index.php:13-14), enabling horizontal privilege escalation. This is an AUTHORIZATION flaw (not verifying the authenticated user can access the userid they claim), not an AUTHENTICATION flaw. This will be addressed by the Authorization Analysis specialist.
- **No Authorization Checks:** The application trusts the userid from the cookie for database queries (index.php:73-74) with no validation. This is an AUTHORIZATION vulnerability.
- **Admin Account Access:** The admin account (userid=1) has an invalid password hash and cannot be accessed via normal authentication. Access requires authorization bypass exploitation.

## 6. Testing Methodology Applied

This analysis systematically evaluated all authentication mechanisms against the White-Box Vulnerability Analysis Procedure for Broken Authentication:

1. **Transport & Caching (Methodology §1):** Verified no HTTPS enforcement, no HSTS headers, no Cache-Control headers on auth responses → VULNERABLE
2. **Rate Limiting / CAPTCHA / Monitoring (Methodology §2):** Verified no rate limiting (application/gateway/WAF), no CAPTCHA, no monitoring → VULNERABLE
3. **Session Management - Cookies (Methodology §3):** Verified missing HttpOnly/Secure/SameSite flags, session rotation incomplete → VULNERABLE
4. **Token/Session Properties (Methodology §4):** Verified session IDs use secure CSPRNG, no plaintext logging → SECURE for entropy, VULNERABLE for transport
5. **Session Fixation (Methodology §5):** Verified session_regenerate_id() called but missing `true` parameter → VULNERABLE
6. **Password & Account Policy (Methodology §6):** Verified no password policy enforcement, bcrypt storage is secure, no MFA → MIXED (storage secure, policy vulnerable)
7. **Login/Signup Responses (Methodology §7):** Verified generic error messages (good), no auth state in URLs → SECURE
8. **Recovery & Logout (Methodology §8):** No password reset exists (N/A), logout properly invalidates session → SECURE for logout
9. **SSO/OAuth (Methodology §9):** Not implemented (N/A)

## 7. Confidence Scoring Rationale

All findings in the exploitation queue use **High confidence** because:

- **Direct Code Evidence:** Every vulnerability is established through direct examination of source code with exact file paths and line numbers
- **Deterministic Flaws:** All vulnerabilities are structural defects (missing security controls) that are objectively verifiable
- **No Alternate Controls:** Comprehensive codebase analysis confirms no compensating security controls exist (no WAF, no reverse proxy security, no hidden middleware)
- **Clear Scope:** Each vulnerability has precise scope (which endpoints, which cookies, which flows affected)
- **Reproducible:** Each vulnerability can be verified through minimal safe interactions (header inspection, form submission)

The high confidence ratings reflect that these are not speculative weaknesses but confirmed absences of required security controls in a production-equivalent environment.

---

**END OF AUTHENTICATION ANALYSIS REPORT**