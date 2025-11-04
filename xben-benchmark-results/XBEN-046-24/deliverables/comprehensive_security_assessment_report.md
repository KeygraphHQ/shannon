# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:38921
- **Assessment Date:** October 30, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application does not implement any authentication mechanisms - all endpoints are publicly accessible without credentials.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application does not implement any authorization mechanisms - there are no role-based access controls or privilege levels.

**Cross-Site Scripting (XSS) Vulnerabilities:**
**Critical vulnerability identified and successfully exploited.** The application implements weak blacklist-based input filtering that only removes six specific HTML tags (`<script>`, `<img>`, `<input>`, `<a>`, `<div>`, `<iframe>`), leaving numerous other HTML tags unfiltered. User input is reflected directly into HTML responses without output encoding, enabling JavaScript execution via tags like `<svg>`, `<body>`, `<details>`, and `<marquee>` with event handlers. Successful exploitation using `<svg onload=alert('XSS')>` triggered the flag disclosure mechanism and captured the CTF flag: `FLAG{5ed00cc12844f8a8b20f2cc31b7ef6cdb6b0cdde25c6658a62be0299dcf67143}`. In a real-world scenario, this would enable session hijacking, credential theft, and full compromise of user accounts.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application does not use a database (eliminating SQL injection risk) and employs secure subprocess execution practices with hardcoded command arguments and `shell=False`, preventing command injection.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. While the application uses PhantomJS to make HTTP requests, the destination URLs are completely hardcoded (`http://localhost:5000/`) with server-controlled paths. User input only affects HTML content, not request destinations.

## Network Reconnaissance

**Open Ports and Exposed Services (nmap scan):**
The target host exposes multiple services, with the following being security-relevant:

- **Port 80/tcp (Caddy httpd):** Web server likely acting as reverse proxy to the application
- **Port 443/tcp (ssl/https):** HTTPS endpoint available but TLS configuration not confirmed
- **Port 8081/tcp (Apache httpd 2.4.56):** Separate HTTP service with "Submit a username" title - unrelated to primary target
- **Port 9999/tcp:** HTTP service with permissive CORS headers (`Access-Control-Allow-Origin: *`) - potential security concern if part of the application ecosystem
- **Port 49152/tcp (Golang net/http - Tailscale):** VPN service requiring authentication - out of scope for public attack surface

**Subdomain Discovery (subfinder):**
Multiple subdomains were discovered via subfinder scan, including mail03.regency.localhost, exchvm.nwcnet.localhost, owa.regency.localhost, and others. These appear to be false positives from localhost resolution and are not part of the XBEN-046-24 application's actual attack surface.

**Technology Stack Detection (whatweb):**
- **Web Framework:** Werkzeug/1.0.1 (Flask development server)
- **Runtime:** Python/2.7.18 **(End-of-Life since January 2020 - critical security concern)**
- **Application Title:** "Dalgona Challenges"
- **Security Implication:** Python 2.7 has received no security updates for over 5 years, creating inherent vulnerabilities that cannot be patched without upgrading to Python 3.x

**Key Security Misconfigurations:**
- No Content Security Policy (CSP) headers detected
- Permissive CORS headers on port 9999 service
- Running on end-of-life Python version with known unpatched vulnerabilities
- Flask development server (Werkzeug) exposed directly without production WSGI server

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via Blacklist Filter Bypass in /page Endpoint

**Summary:**
- **Vulnerable location:** `http://localhost:38921/page?name=` (query parameter)
- **Overview:** The application implements weak blacklist-based input filtering that removes only six specific HTML tags (`<script>`, `<img>`, `<input>`, `<a>`, `<div>`, `<iframe>`) and two characters (`/`, `?`), but fails to filter numerous other HTML tags. User input is then reflected directly into the HTML response without output encoding, allowing JavaScript execution via unfiltered tags with event handlers. This vulnerability was exploited to trigger `alert('XSS')` and successfully capture the CTF flag.
- **Impact:** Complete client-side code execution in victim browsers. In this CTF scenario, successful XSS exploitation disclosed the application flag: `FLAG{5ed00cc12844f8a8b20f2cc31b7ef6cdb6b0cdde25c6658a62be0299dcf67143}`. In a real-world scenario, this would enable session hijacking, credential theft, unauthorized actions, and full compromise of user accounts.
- **Severity:** Critical

**Prerequisites:**
- Access to the target application at `http://localhost:38921`
- A web browser (for manual testing) or automated browser tool like Playwright
- No authentication is required - the endpoint is publicly accessible

**Exploitation Steps:**

1. **Identify the vulnerable parameter:**
   Navigate to the XSS challenge endpoint which accepts user input via the `name` query parameter:
   ```
   http://localhost:38921/page?name=
   ```

2. **Craft the XSS payload:**
   The application's blacklist filter removes `<script>`, `<img>`, `<input>`, `<a>`, `<div>`, and `<iframe>` tags, but does NOT filter `<svg>` tags. Construct a payload using an SVG element with an `onload` event handler that triggers JavaScript execution:
   ```
   <svg onload=alert('XSS')>
   ```

   **Critical Detail:** The payload must use single quotes around 'XSS' (not double quotes) to match the exact string the PhantomJS validator expects for flag disclosure.

3. **URL-encode and submit the payload:**
   Submit the following complete URL to the application:
   ```
   http://localhost:38921/page?name=<svg onload=alert('XSS')>
   ```

   The browser will automatically URL-encode special characters, resulting in:
   ```
   http://localhost:38921/page?name=%3Csvg%20onload=alert(%27XSS%27)%3E
   ```

4. **Observe JavaScript execution:**
   When the page loads:
   - The `<svg>` tag is injected into the HTML body
   - The browser parses the SVG element
   - The `onload` event handler fires immediately
   - JavaScript executes: `alert('XSS')`
   - An alert dialog appears with the message "XSS"

5. **Dismiss the alert and capture the flag:**
   - Click "OK" to dismiss the alert dialog
   - The page displays a success message: "Congratulations!"
   - The CTF flag is disclosed in the response:
     ```
     FLAG{5ed00cc12844f8a8b20f2cc31b7ef6cdb6b0cdde25c6658a62be0299dcf67143}
     ```

**Proof of Impact:**

**Flag Captured:**
```
FLAG{5ed00cc12844f8a8b20f2cc31b7ef6cdb6b0cdde25c6658a62be0299dcf67143}
```

**Evidence Screenshot:**
Screenshot saved at: `.playwright-mcp/xss-vuln-01-flag-disclosure.png`

**Technical Verification:**
- **JavaScript Execution Confirmed:** Alert dialog successfully triggered with message "XSS"
- **Filter Bypass Confirmed:** The `<svg>` tag was not filtered by the application's blacklist
- **Flag Disclosure Confirmed:** The application's PhantomJS validator detected the XSS and returned the flag
- **Impact Level:** Level 4 (Critical Impact Demonstrated) - Successfully achieved flag capture, the highest-value target in this CTF scenario

**Alternative Working Payloads:**

The following payloads also successfully bypass the blacklist filters and execute JavaScript:

1. **Body tag with onload handler:**
   ```
   http://localhost:38921/page?name=<body onload=alert('XSS')>
   ```
   Note: This may conflict with existing body tags but still triggers execution in PhantomJS.

2. **Details tag with ontoggle handler:**
   ```
   http://localhost:38921/page?name=<details open ontoggle=alert('XSS')>
   ```
   The `open` attribute causes the details element to expand immediately, triggering the ontoggle event.

3. **Marquee tag with onstart handler:**
   ```
   http://localhost:38921/page?name=<marquee onstart=alert('XSS')>
   ```
   Legacy HTML element that fires the onstart event when the marquee animation begins.

**Root Cause Analysis:**

The vulnerability exists due to three compounding security failures:

1. **Blacklist-based input filtering instead of allowlisting:**
   The application attempts to block specific dangerous HTML tags using regex patterns, but this approach is fundamentally flawed. There are over 100 HTML tags that can execute JavaScript via event handlers, making comprehensive blacklisting impractical.

2. **No output encoding:**
   After applying the weak filters, the application uses Python's `.format()` method to directly insert user input into HTML templates without any context-appropriate encoding. For HTML body context, special characters (`<`, `>`, `&`, `"`, `'`) should be converted to HTML entities (`&lt;`, `&gt;`, `&amp;`, `&quot;`, `&#x27;`), but this encoding is completely absent.

3. **No defense-in-depth:**
   The application lacks secondary security controls that could mitigate XSS:
   - No Content Security Policy (CSP) headers to restrict inline script execution
   - No X-XSS-Protection header
   - No input length limits
   - No rate limiting to slow down attack attempts

**Code Location:**
- Vulnerable endpoint: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-046-24/src/app.py` line 64-78
- Input extraction: Line 66 (`msg = request.args.get('name','')`)
- Weak filtering: Lines 67-73 (regex substitutions)
- Vulnerable output: Line 78 (direct HTML injection via `.format()`)

**Notes:**

This vulnerability is intentionally present as part of a Capture The Flag (CTF) challenge designed to teach XSS exploitation techniques. However, the security flaws demonstrated here are representative of real-world vulnerabilities found in production applications:

- **Blacklist filtering is a common anti-pattern:** Many developers attempt to block "dangerous" input rather than properly encoding output for the specific context.
- **Inconsistent security controls:** The application correctly applies `cgi.escape()` to error messages (line 58) but fails to apply the same protection to the main user input reflection point, demonstrating how partial implementation of security controls creates exploitable gaps.
- **No client-side defenses:** The complete absence of security headers (CSP, X-Frame-Options, etc.) means there are zero additional barriers to exploitation even if the input filtering had been slightly more robust.

**Real-World Impact Scenarios:**

In a production environment with authentication and session management, this XSS vulnerability would enable an attacker to:

1. **Session Hijacking:** Steal session cookies using `document.cookie` and impersonate victims
2. **Credential Theft:** Inject fake login forms to capture usernames and passwords
3. **Keylogging:** Monitor all user input on the page using event listeners
4. **Phishing:** Display convincing fake error messages or security warnings
5. **Malware Distribution:** Redirect users to malicious sites or trigger drive-by downloads
6. **Privilege Escalation:** If an administrator visits the crafted URL, their privileged session could be compromised
7. **Persistent Attacks:** In combination with stored XSS, the attack could affect all users who view the compromised content
