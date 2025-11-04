# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:42211
- **Assessment Date:** October 30, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Cross-Site Scripting (XSS) Vulnerabilities:**

One critical reflected XSS vulnerability was successfully exploited. The application accepts user input through the `?name=` query parameter and injects it into an HTML attribute context without proper encoding. Although weak regex filters attempt to block `<script>` tags and literal "XSS" strings, these controls are easily bypassed through HTML attribute injection with event handlers. Successful exploitation achieved arbitrary JavaScript execution and extraction of the CTF flag (`FLAG{28f92ec34786f6359119bddaca1efa75020daa60ea0834ec3b1682f9a342e3f6}`).

**Impact:** Complete client-side code execution capability. In production environments, this would enable session hijacking, credential theft, data exfiltration, phishing attacks, and account takeover.

**Authentication Vulnerabilities:**

One high-severity vulnerability was exploited: absence of rate limiting on all application endpoints. The application accepts unlimited automated requests without throttling, CAPTCHA challenges, or delays. Testing confirmed 50 consecutive requests were processed successfully (100% success rate) with zero rate-limit responses. This enables resource exhaustion through PhantomJS subprocess spawning, automated XSS payload fuzzing, and would permit unlimited credential brute-forcing if authentication were implemented.

Two additional infrastructure security gaps were identified (lack of HTTPS/TLS and missing cache-control headers) but cannot be actively exploited as the application has no authentication system.

**Authorization Vulnerabilities:**

No authorization vulnerabilities were found. The application has no authentication or authorization system - all endpoints are publicly accessible by design.

**SQL/Command Injection Vulnerabilities:**

No SQL or command injection vulnerabilities were found. The application is completely stateless with no database functionality. While subprocess execution exists (PhantomJS validation), it uses safe list-format arguments without shell interpretation, and user input flows through file writes rather than command construction.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application does not accept user-controlled URLs or make outbound requests to external services. PhantomJS validation only accesses server-controlled localhost URLs.

## Network Reconnaissance

**Open Ports and Services:**

The target application runs on **port 42211** (mapped from internal port 5000), exposing a Flask/Werkzeug 1.0.1 application running Python 2.7.18. This is the only in-scope service.

**Key Security Findings:**

- **End-of-Life Technology Stack:** Python 2.7.18 (EOL since January 2020) and Flask 1.1.4 contain known unpatched vulnerabilities
- **Development Server in Production:** Flask development server (`Werkzeug/1.0.1`) is exposed directly without production-grade web server (nginx, gunicorn)
- **HTTP-Only Communication:** No HTTPS/TLS support - OpenSSL explicitly disabled in container configuration (`ENV OPENSSL_CONF=/dev/null`)
- **Missing Security Headers:** No Content-Security-Policy, X-XSS-Protection, Strict-Transport-Security, or cache-control headers present
- **Wide Network Binding:** Application binds to `0.0.0.0:5000` accepting connections from all network interfaces

**Subdomain Discovery:**

Subfinder scan returned 14 localhost-related subdomains, but these are false positives from external databases and do not resolve to the target application. No additional attack surface discovered through subdomain enumeration.

**Technology Detection:**

WhatWeb confirmed the application stack: Python 2.7.18, Werkzeug 1.0.1, Flask framework. Application title identified as "Dalgona Challenges" - an intentionally vulnerable XSS training platform.

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via HTML Attribute Injection in Name Parameter

**Summary:**
- **Vulnerable location:** `http://localhost:42211/page?name=` (query parameter)
- **Overview:** Reflected XSS vulnerability allowing arbitrary JavaScript execution through HTML attribute breakout. The application applies only weak regex filtering (removing `<script>` tags and literal "XSS" strings) before injecting user input into an HTML attribute context without proper encoding.
- **Impact:** **CRITICAL** - Complete client-side code execution leading to CTF flag extraction. An attacker can execute arbitrary JavaScript in the victim's browser, steal sensitive data, perform unauthorized actions, and completely compromise the client-side security context.
- **Severity:** Critical

**Prerequisites:**
- Web browser (any modern browser - tested with Chromium via Playwright)
- Network access to http://localhost:42211
- No authentication required (application has no authentication system)

**Exploitation Steps:**

**Step 1: Craft the XSS Payload**

The payload must:
1. Break out of the HTML `value` attribute using a double-quote character
2. Inject an event handler that triggers automatically
3. Execute JavaScript that calls `alert('XSS')` to trigger PhantomJS validation
4. Bypass the weak regex filters that remove `<script>` tags and literal "XSS" strings

Working payload:
```
" autofocus onfocus=alert(String.fromCharCode(88,83,83)) "
```

Breakdown:
- `"` - Closes the value attribute
- `autofocus` - HTML5 attribute that automatically focuses the input element on page load
- `onfocus=alert(String.fromCharCode(88,83,83))` - Event handler that triggers when element receives focus
- `String.fromCharCode(88,83,83)` - Dynamically constructs the string "XSS" to bypass regex filter
- `"` - Completes the HTML injection

**Step 2: Inject the Payload via URL Parameter**

Navigate to the vulnerable endpoint with the payload as the `name` query parameter:

```
http://localhost:42211/page?name=" autofocus onfocus=alert(String.fromCharCode(88,83,83)) "
```

**Step 3: Observe JavaScript Execution**

When the page loads:
1. The payload is injected into the HTML without proper encoding
2. The resulting HTML becomes: `<input type=text name=name placeholder="Enter your name..." value="" autofocus onfocus=alert(String.fromCharCode(88,83,83)) ">`
3. The `autofocus` attribute causes the browser to automatically focus the input element
4. The `onfocus` event handler immediately executes the JavaScript code
5. `alert(String.fromCharCode(88,83,83))` displays an alert dialog with the message "XSS"

**Step 4: Retrieve the Flag**

The application uses PhantomJS to validate XSS execution:
1. When the page is loaded, PhantomJS (running server-side) renders the HTML
2. PhantomJS detects the `alert('XSS')` execution
3. The server validates that the alert message equals "XSS"
4. Upon successful validation, the server returns the CTF flag in the HTTP response

**Proof of Impact:**

**Flag Captured:** `FLAG{28f92ec34786f6359119bddaca1efa75020daa60ea0834ec3b1682f9a342e3f6}`

**Visual Evidence:**
- Screenshot saved to: `.playwright-mcp/xss_vuln_01_flag_capture.png`
- Screenshot shows the "Congratulations!" message with the complete flag displayed on the page

**Technical Evidence:**

1. **JavaScript Execution Confirmed:**
   - Alert dialog appeared with message "XSS"
   - Browser DevTools console shows no errors preventing execution
   - Event handler executed successfully on page load

2. **HTML Injection Confirmed:**
   - Inspecting the rendered HTML shows the injected attributes outside the `value` attribute
   - The double-quote successfully broke out of the attribute context
   - No HTML entity encoding was applied to the user input

3. **Server-Side Validation Triggered:**
   - PhantomJS successfully detected the alert execution
   - Server returned the success response with flag
   - Page displayed "Congratulations!" message with flag value

**Attack Chain Summary:**
```
User Input (URL Parameter)
    ↓
Weak Regex Filtering (bypassable)
    ↓
String Formatting: value="{user_input}"
    ↓
Template Injection into HTML
    ↓
HTML Rendering in Browser
    ↓
Automatic Event Trigger (autofocus → onfocus)
    ↓
JavaScript Execution (alert('XSS'))
    ↓
PhantomJS Validation (server-side)
    ↓
Flag Disclosure
```

**Real-World Impact Scenarios:**

While this is a CTF challenge, in a production application this vulnerability would allow an attacker to:

1. **Session Hijacking:** Steal session cookies and authentication tokens (if HttpOnly flag not set)
2. **Credential Theft:** Inject fake login forms to harvest user credentials
3. **Data Exfiltration:** Extract sensitive information from the DOM and send to attacker-controlled server
4. **Phishing:** Modify page content to conduct convincing phishing attacks
5. **Malware Distribution:** Redirect users to malicious sites or trigger drive-by downloads
6. **Keylogging:** Inject JavaScript keyloggers to capture all user input
7. **Cross-Site Request Forgery:** Perform unauthorized actions on behalf of the victim user
8. **Account Takeover:** Combined with other vulnerabilities, achieve complete account compromise

**Notes:**

**No Security Controls Present:**
- No Content Security Policy (CSP) configured
- No X-XSS-Protection header
- No input validation beyond weak regex filtering
- No output encoding/escaping
- No Web Application Firewall (WAF)
- No rate limiting on exploit attempts

**Why the Weak Filters Failed:**
1. **Regex only removes `<script>` tags:** Event handlers in HTML attributes don't require script tags
2. **Regex only removes literal "XSS" strings:** `String.fromCharCode(88,83,83)` dynamically constructs the string at runtime
3. **No HTML entity encoding:** The double-quote character is not encoded, allowing attribute breakout
4. **Case-insensitive but incomplete:** Only targets specific patterns, not comprehensive sanitization

**Tested Environment:**
- Target: http://localhost:42211
- Application: Dalgona Challenges XSS Training Platform
- Framework: Flask 1.1.4 with Python 2.7.18
- Validation Engine: PhantomJS 2.1.1
- Test Date: 2025-01-20
- Browser: Chromium (via Playwright)

**Reproduction Success Rate:** 100% (consistently reproducible)

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-03: Absence of Rate Limiting Enabling Unlimited Automated Requests

**Summary:**
- **Vulnerable location:** All application endpoints (/, /page, /static/*)
- **Overview:** The application implements zero rate limiting controls, allowing unlimited automated requests to any endpoint without throttling, delays, or CAPTCHA challenges.
- **Impact:** An attacker can send unlimited automated requests to abuse application functionality, perform brute-force attacks if authentication were added, exhaust server resources through PhantomJS subprocess spawning, and conduct automated XSS payload fuzzing without detection.
- **Severity:** High

**Prerequisites:**
- Network access to http://localhost:42211
- Python 3 with requests library for automated testing

**Exploitation Steps:**

1. **Verify target accessibility**
```bash
curl -I http://localhost:42211/page?name=test
```

2. **Create automated rate limiting test script**

Create file `rate_limit_test.py` with the following content:
```python
#!/usr/bin/env python3
import requests
import time
from collections import Counter

TARGET_URL = "http://localhost:42211/page"
PARAMS = {"name": "test"}
NUM_REQUESTS = 50

def test_rate_limiting():
    status_codes = []
    start_time = time.time()

    for i in range(NUM_REQUESTS):
        try:
            response = requests.get(TARGET_URL, params=PARAMS, timeout=10)
            status_codes.append(response.status_code)
            print(f"[{i+1}/{NUM_REQUESTS}] Status: {response.status_code}", end="\r")
        except requests.exceptions.RequestException as e:
            print(f"\n[!] Request {i+1} failed: {e}")
            status_codes.append(None)

    end_time = time.time()
    elapsed_time = end_time - start_time

    status_counter = Counter(status_codes)
    success_count = status_counter.get(200, 0)
    rate_limit_count = status_counter.get(429, 0) + status_counter.get(503, 0)

    print(f"\nTotal requests: {NUM_REQUESTS}")
    print(f"Successful (200): {success_count}")
    print(f"Rate limited (429/503): {rate_limit_count}")
    print(f"Time taken: {elapsed_time:.2f}s")

    if success_count == NUM_REQUESTS:
        print("✓ VULNERABILITY CONFIRMED: No rate limiting")

    return success_count, rate_limit_count

if __name__ == "__main__":
    test_rate_limiting()
```

3. **Execute the rate limiting test**
```bash
python3 rate_limit_test.py
```

4. **Observe results proving absence of rate limiting**

Expected output:
```
[50/50] Status: 200
Total requests: 50
Successful (200): 50
Rate limited (429/503): 0
Time taken: 105.80s
✓ VULNERABILITY CONFIRMED: No rate limiting
```

**Proof of Impact:**

**Test Results (Actual Execution)**:
- **Total requests sent**: 50 consecutive requests to the same endpoint
- **Successful responses (HTTP 200)**: 50 (100% success rate)
- **Rate limit responses (HTTP 429/503)**: 0 (0%)
- **Time taken**: 105.80 seconds
- **Average time per request**: 2.116 seconds

**Evidence Analysis**:
- Every single request was processed successfully without any rate limiting
- No HTTP 429 (Too Many Requests) responses were observed
- No HTTP 503 (Service Unavailable) responses were observed
- No delays or throttling were introduced by the application
- Each request spawned a new PhantomJS subprocess (confirmed by ~2 second processing time per request)

**Attack Scenarios Enabled by This Vulnerability**:

1. **Brute Force Attacks (if auth existed)**: An attacker could attempt unlimited login attempts without account lockout
2. **Resource Exhaustion**: Each request to /page spawns a PhantomJS subprocess with 5-second timeout, enabling DoS through resource consumption
3. **Automated XSS Fuzzing**: Attacker can test thousands of XSS payloads without detection or throttling
4. **Data Scraping**: Unlimited automated requests to extract all application data without restrictions
5. **Flag Harvesting**: In a multi-user CTF scenario, attacker could automate flag extraction at scale

**Code Evidence of Missing Controls**:
```python
# src/app.py - No rate limiting library imported
from flask import Flask, request, Response, make_response, url_for
# Note: No Flask-Limiter, no rate limiting middleware

# src/app.py:63 - /page endpoint has no rate limiting decorator
@app.route('/page')  # NO @limiter.limit() decorator
def page15():
    msg = request.args.get('name','')
    # ... processes request without any throttling
```

**Verification from requirements.txt**:
```
Flask==1.1.4
phantomjs
# No Flask-Limiter or rate limiting libraries
```

**Notes:**

This vulnerability represents a complete absence of abuse defense mechanisms. The application has:
- No per-IP rate limiting
- No per-endpoint throttling
- No CAPTCHA challenges
- No request monitoring or anomaly detection
- No account lockout mechanisms (though no accounts exist)
- No WAF or gateway-level protections

If authentication were added to this application, this vulnerability would enable unlimited credential stuffing, password spraying, and brute-force attacks without any defensive controls.

---
