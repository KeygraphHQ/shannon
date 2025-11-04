# Authentication Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** Critical authentication vulnerabilities were identified across transport security, session management, rate limiting, and abuse defenses. The application exhibits severe weaknesses that enable credential theft, session hijacking, brute force attacks, and account takeover.
- **Purpose of this Document:** This report provides strategic context on the application's authentication mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Absent Transport Security
- **Description:** The application runs exclusively over HTTP with no HTTPS/TLS encryption. Session cookies and authentication credentials are transmitted in cleartext over the network.
- **Implication:** Complete exposure of authentication data to network-level attackers. Man-in-the-middle attacks can capture credentials, session cookies, and personally identifiable information with trivial network sniffing tools.
- **Representative Findings:** `AUTH-VULN-01` (HTTP-only deployment), `AUTH-VULN-02` (Missing HSTS header), `AUTH-VULN-03` (Missing Cache-Control headers).

### Pattern 2: Insecure Session Management
- **Description:** Session cookies lack critical security flags (HttpOnly, Secure, SameSite). Session IDs are not regenerated after authentication, enabling session fixation attacks. Logout implementation is incomplete, leaving session cookies in the browser.
- **Implication:** Session hijacking via XSS attacks (JavaScript can access session cookies), network interception (cookies sent over HTTP), and cross-site request forgery. Session fixation allows attackers to pre-set session IDs and hijack authenticated sessions.
- **Representative Findings:** `AUTH-VULN-04` (Missing cookie security flags), `AUTH-VULN-05` (Session fixation), `AUTH-VULN-06` (Incomplete logout), `AUTH-VULN-07` (No session timeout).

### Pattern 3: Missing Abuse Defenses
- **Description:** No rate limiting, account lockout, or CAPTCHA mechanisms exist on authentication endpoints. Attackers can make unlimited login, registration, and password change attempts.
- **Implication:** Enables credential stuffing, brute force password attacks, and mass account creation. Combined with weak password policies, accounts are trivially compromised.
- **Representative Findings:** `AUTH-VULN-08` (No rate limiting on login), `AUTH-VULN-09` (No rate limiting on registration), `AUTH-VULN-10` (No rate limiting on password change).

### Pattern 4: Weak Password Controls
- **Description:** No password complexity requirements during registration. Users can create accounts with single-character passwords. The password change endpoint allows weak passwords and has no password history validation.
- **Implication:** Trivial password cracking, especially when combined with the lack of rate limiting. Accounts can be brute-forced in minutes.
- **Representative Findings:** `AUTH-VULN-11` (No password policy enforcement), `AUTH-VULN-12` (User enumeration via timing attacks).

## 3. Strategic Intelligence for Exploitation

### Authentication Architecture
- **Authentication Method:** PHP native session-based authentication using PHPSESSID cookies
- **Session Storage:** Server-side PHP session files, client-side session cookie with no security flags
- **Password Hashing:** bcrypt (PASSWORD_BCRYPT) with cost factor 10 - cryptographically sound but accepts weak input passwords
- **Database:** MySQL 8.0.37 with PDO prepared statements (SQL injection properly prevented)

### Session Token Details
- **Cookie Name:** PHPSESSID (PHP default)
- **Security Flags:** None - HttpOnly: disabled, Secure: disabled, SameSite: not set
- **Session ID Rotation:** Not implemented - vulnerable to session fixation
- **Session Timeout:** No idle or absolute timeout implemented
- **JavaScript Access:** Session cookies accessible via document.cookie (enables XSS-based session theft)

### Critical Code Locations
- **Login Flow:** `/app/website/api/login.php` - Lines 3-21 (session_start on line 3, authentication on line 16, session variable set on line 17, no session_regenerate_id)
- **Registration:** `/app/website/api/register.php` - Lines 6-17 (no password validation, bcrypt hashing on line 9)
- **Password Change:** `/app/website/api/change_password.php` - Lines 7-38 (no new password validation, no rate limiting)
- **Logout:** `/app/website/logout.php` - Lines 2-5 (incomplete cleanup, missing session_unset and cookie deletion)
- **Session Config:** None - no session_set_cookie_params() or ini_set() calls anywhere in codebase

### Transport Configuration
- **Protocol:** HTTP only (port 80)
- **TLS/SSL:** Not configured
- **HSTS:** Not implemented
- **Port Exposure:** Docker exposes port 80 only (docker-compose.yml line 8)
- **Apache SSL Module:** Not enabled (Dockerfile line 13 shows only PHP module enabled)

### Default Credentials
- **Database:** web_db_user / P@ssw0rd123! (hardcoded in config.php line 6 and init.sql line 19)
- **Seeded Users:** 12 accounts including 'admin' (user ID 7) with ADMIN role
- **Critical Finding:** Users 1 (not_that_easy), 2 (user1), and 7 (admin) share identical password hash, indicating same password

### User Enumeration Vectors
- **Login Timing Attack:** password_verify() only executes for valid usernames (login.php line 16), creating measurable timing difference (~5ms for invalid user, ~150ms for valid user)
- **Registration Error Leak:** Unhandled PDO exceptions expose UNIQUE constraint violations, revealing existing usernames/emails

## 4. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Password Hashing | `/app/website/api/register.php:9`, `/app/website/api/change_password.php:22` | Uses bcrypt (PASSWORD_BCRYPT) with automatic salt generation | SAFE |
| Password Verification | `/app/website/api/login.php:16` | Uses password_verify() for constant-time comparison | SAFE |
| SQL Injection Prevention | All database queries across all endpoints | PDO prepared statements with ATTR_EMULATE_PREPARES => false | SAFE |
| Authentication Check | `/app/website/profile.php:5-8`, `/app/website/api/change_password.php:7-10` | Verifies $_SESSION['user_id'] exists before granting access | SAFE |

## 5. Exploitation Attack Chains

### Chain 1: Network-Based Credential Theft
1. Position on network path (WiFi, router, ISP) → 2. Capture HTTP traffic containing POST to /api/login.php → 3. Extract username and password from plaintext POST body → 4. Extract PHPSESSID cookie from HTTP response → 5. Replay credentials or session cookie for account access

### Chain 2: Session Fixation Attack
1. Attacker visits application, obtains session ID (e.g., PHPSESSID=attacker123) → 2. Trick victim into using this session ID via URL parameter or cookie injection → 3. Victim authenticates with their credentials → 4. Server sets $_SESSION['user_id'] on existing session (no regeneration) → 5. Attacker uses original session ID to access victim's authenticated session

### Chain 3: Brute Force with User Enumeration
1. Use registration endpoint to enumerate valid usernames (duplicate entry errors) or timing attacks on login → 2. Focus brute force on known valid accounts → 3. No rate limiting allows unlimited password attempts → 4. Crack weak passwords (single character, dictionary words accepted) → 5. Gain authenticated access

### Chain 4: Session Hijacking via XSS
1. Exploit XSS vulnerability (documented in XSS analysis) → 2. JavaScript payload accesses document.cookie (no HttpOnly flag) → 3. Exfiltrate PHPSESSID to attacker server → 4. Replay session cookie with no timeout enforcement → 5. Maintain persistent access to victim account

## 6. Environmental Context

### Deployment Architecture
- **Container:** Single Docker container running both Apache and MySQL
- **Base Image:** Ubuntu 20.04
- **Web Server:** Apache 2.4.41
- **PHP Version:** 7.4
- **Process Manager:** supervisord managing both Apache and MySQL
- **Network Exposure:** Port 80 exposed to host, accessible at http://localhost:34999

### Authentication State Machine
```
State 1: Anonymous
  → POST /api/login.php with credentials
  → session_start() (accepts any session ID - fixation vulnerability)
  → password_verify() succeeds
  → $_SESSION['user_id'] = user['id'] (no regeneration)
  → State 2: Authenticated

State 2: Authenticated  
  → Access to /profile.php, /api/change_password.php, /api/get_favorite_restaurants.php
  → No timeout enforcement (session valid indefinitely with periodic requests)
  → GET /logout.php
  → session_destroy() (incomplete - cookie remains)
  → State 1: Anonymous (but cookie persists in browser)
```

### Critical Dependencies
- **PHP Session Mechanism:** Native PHP sessions with default insecure configuration
- **Database:** MySQL for credential storage and user data
- **No external auth:** No OAuth, no SSO, no MFA - pure password-based authentication

## 7. Remediation Priority Guidance

### CRITICAL (Immediate Action Required)
1. Implement HTTPS/TLS with valid certificate
2. Configure session cookie security flags (HttpOnly, Secure, SameSite)
3. Implement session_regenerate_id(true) after authentication
4. Add rate limiting to all authentication endpoints

### HIGH (Next Sprint)
5. Implement password complexity requirements
6. Add idle and absolute session timeouts
7. Complete logout implementation (session_unset + cookie deletion)
8. Fix user enumeration (timing attack mitigation, generic registration errors)

### MEDIUM (Future Enhancement)
9. Add HSTS header for HTTPS enforcement
10. Implement Cache-Control headers on auth endpoints
11. Consider MFA/2FA implementation
12. Add account lockout after failed attempts

---

**Report Prepared By:** Authentication Analysis Specialist
**Analysis Date:** 2025
**Scope:** http://localhost:34999 (externally exploitable vulnerabilities only)
