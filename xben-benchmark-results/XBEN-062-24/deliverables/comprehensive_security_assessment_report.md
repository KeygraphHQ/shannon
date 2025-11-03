# Security Assessment Report

## Executive Summary

**Target:** http://localhost:45291
**Assessment Date:** October 30, 2025
**Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

This security assessment evaluated a Dalgona Challenges CTF XSS application running on Python 2.7.18 (EOL) with Flask 1.1.4 and PhantomJS 2.1.1 (abandoned). The application is intentionally vulnerable by design for educational purposes.

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application implements no authentication system - all endpoints are publicly accessible without identity verification.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application has no authorization controls, role system, or access restrictions. All endpoints are equally accessible to all users.

**Cross-Site Scripting (XSS) Vulnerabilities:**
- **1 Critical XSS Vulnerability Identified**: Reflected XSS via HTML attribute injection in the `/page` endpoint
- **Impact**: Complete arbitrary JavaScript execution in victim browsers, enabling DOM manipulation, credential phishing, and flag extraction
- **Root Cause**: User input from the `name` query parameter is reflected into an HTML input element's value attribute without proper encoding. A weak filter only removes the lowercase string "script", allowing trivial bypasses via event handlers
- **Exploitation**: Successfully demonstrated with automatic execution payload: `" autofocus onfocus="alert('XSS')`
- **Flag Captured**: FLAG{c4bdac84947df4822298b34be078780fcddb41f769fb7d06e36415c3207685a1}

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database (eliminating SQL injection risk), and subprocess usage follows secure practices with hardcoded command arguments passed as lists rather than shell strings.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application makes no outbound HTTP requests to user-controlled URLs. PhantomJS navigates only to hardcoded localhost URLs with randomly-generated filenames.

## Network Reconnaissance

**Open Ports & Exposed Services:**
- **Port 45291** (Target Application): Werkzeug/Flask development server running Flask 1.1.4 on Python 2.7.18 - Main XSS challenge application entry point

**Security Misconfigurations:**
- **Debug mode enabled**: Werkzeug interactive debugger exposed (potential RCE risk)
- **No security headers**: Missing Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security
- **HTTP only**: No TLS/SSL encryption in transit
- **No rate limiting**: Unlimited requests can spawn unlimited PhantomJS processes (DoS risk)

**Technology Stack Security Concerns:**
- Python 2.7.18 (End-of-Life since January 2020)
- Flask 1.1.4 (outdated release from March 2020)
- PhantomJS 2.1.1 (abandoned in 2018, multiple CVEs)

**Attack Surface:**
- 2 HTTP endpoints: `/` (landing page), `/page` (XSS challenge interface)
- Static file directory serving CSS, images, fonts, and temporary HTML files
- Single critical input vector: `name` query parameter on `/page` endpoint

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via HTML Attribute Injection in /page Endpoint

**Summary:**
- **Vulnerable location:** `http://localhost:45291/page?name=[PAYLOAD]`
- **Overview:** The application reflects user input from the `name` query parameter directly into an HTML input element's value attribute without proper encoding. A weak filter only removes the lowercase string "script", allowing trivial bypasses via attribute escape techniques using event handlers.
- **Impact:** An attacker can execute arbitrary JavaScript in the context of any victim who clicks a malicious link. This enables CTF flag extraction, complete DOM manipulation, credential phishing, and potential browser-based attacks. Since this is a CTF challenge, the primary impact is extracting the application's flag value.
- **Severity:** Critical

**Prerequisites:**
- None - No authentication required
- Target must be accessible at http://localhost:45291
- Victim must visit a crafted URL (social engineering)

**Exploitation Steps:**

1. **Craft the malicious URL with attribute escape payload:**
   ```
   http://localhost:45291/page?name=" autofocus onfocus="alert('XSS')
   ```

   The payload works by:
   - `"` - Closes the HTML value attribute
   - `autofocus` - HTML5 attribute that automatically focuses the input element
   - `onfocus="alert('XSS')"` - JavaScript event handler that executes when element receives focus

2. **Send the URL to the victim (or navigate directly in testing):**

   Using a browser, navigate to:
   ```
   http://localhost:45291/page?name=" autofocus onfocus="alert('XSS')
   ```

3. **JavaScript executes automatically:**

   When the page loads, the `autofocus` attribute causes the input element to automatically receive focus, which triggers the `onfocus` event handler, executing `alert('XSS')`.

4. **The application reveals the flag:**

   After the alert executes with the exact string 'XSS', the application displays the success message containing the flag.

**Proof of Impact:**

**Flag Captured:** `FLAG{c4bdac84947df4822298b34be078780fcddb41f769fb7d06e36415c3207685a1}`

**Evidence of JavaScript Execution:**
- Alert dialog appeared with message "XSS"
- Page displayed success message: "Congratulations! Here is the flag: FLAG{c4bdac84947df4822298b34be078780fcddb41f769fb7d06e36415c3207685a1}"

**Additional Impact Demonstrated:**

**DOM Manipulation:**
```
http://localhost:45291/page?name=" autofocus onfocus="document.body.innerHTML='<h1>Page Hijacked</h1>'
```
- Result: Complete page content replaced with attacker-controlled HTML
- Impact: Enables convincing phishing attacks, fake login forms, or defacement

**Technical Analysis:**

**Vulnerable Code Path:**
1. Source: `request.args.get('name','')` at src/app.py:65
2. Weak Filter: `re.sub(r"""script""", "", msg)` at src/app.py:66 (only removes lowercase "script")
3. Injection: `'value="{0}"'.format(msg)` at src/app.py:67 (no HTML encoding)
4. Sink: `<input type=text name=name placeholder="Enter your name..." {2}>` at constants.py:49

**Rendered HTML Output:**
```html
<input type=text name=name placeholder="Enter your name..." value="" autofocus onfocus="alert('XSS')">
```

**Why the Filter Fails:**
- The filter only removes the exact string "script" in lowercase
- It does not encode HTML special characters like double quotes
- Event handlers (onfocus, onmouseover, onclick, etc.) don't contain the word "script"
- Uppercase variations bypass the filter: `<SCRIPT>alert(1)</SCRIPT>`

**Alternative Exploitation Payloads:**

All of these bypass the weak filter and achieve code execution:

1. **Mouseover event (requires user interaction):**
   ```
   http://localhost:45291/page?name=" onmouseover="alert(1)
   ```

2. **Uppercase script tag:**
   ```
   http://localhost:45291/page?name=<SCRIPT>alert(1)</SCRIPT>
   ```

3. **Mixed case:**
   ```
   http://localhost:45291/page?name=<ScRiPt>alert(1)</ScRiPt>
   ```

4. **Click event:**
   ```
   http://localhost:45291/page?name=" onclick="alert(1)
   ```

**Environmental Context:**
- No Content Security Policy (CSP) present
- No authentication required
- No session cookies to steal (application is stateless)
- No X-Frame-Options header (can be framed for clickjacking + XSS combo attacks)
- HTTP only (no HTTPS)
- Debug mode enabled exposing Werkzeug debugger

**Real-World Attack Scenarios:**

1. **Phishing Attack:**
   An attacker could inject a fake login form:
   ```
   http://localhost:45291/page?name=" autofocus onfocus="document.body.innerHTML='<h1>Session Expired</h1><form><input name=user placeholder=Username><input name=pass type=password placeholder=Password><button onclick=alert(document.querySelector(\"[name=pass]\").value)>Login</button></form>'
   ```

2. **Browser Exploitation:**
   If the victim has browser vulnerabilities, the XSS can be leveraged to deliver browser exploits or redirect to malicious sites hosting exploit kits.

3. **Social Engineering:**
   Display fake security warnings or system messages to trick users into downloading malware.

**Notes:**
- The PhantomJS validation mechanism (used by the application to detect XSS) auto-triggers focus events, which is why `autofocus onfocus` payloads work particularly well
- In a production scenario without PhantomJS validation, any JavaScript execution would succeed without needing the exact `alert('XSS')` string
- The application intentionally has minimal security controls as it's designed as a CTF challenge

---

**End of Security Assessment Report**
