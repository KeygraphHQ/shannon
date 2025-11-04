# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** One high-confidence Server-Side Request Forgery (SSRF) vulnerability was identified in the `/redirect.php` endpoint, enabling complete bypass of network isolation and access to internal services.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, dominant flaw patterns, and architectural details necessary to effectively exploit the vulnerability listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of URL Input Validation  
- **Description:** The application accepts arbitrary user-supplied URLs and passes them directly to `file_get_contents()` without any validation, sanitization, or filtering. This is a textbook SSRF vulnerability where user input has complete control over server-side HTTP requests.
- **Implication:** Attackers can force the server to make requests to internal services (bypassing network isolation), access cloud metadata endpoints (stealing credentials), read local files via the `file://` protocol, and perform internal network reconnaissance.
- **Representative Finding:** `SSRF-VULN-01`
- **Root Cause:** Zero input validation between user input source (`$_GET['url']`) and dangerous sink (`file_get_contents($url)`)

## 3. Strategic Intelligence for Exploitation

### HTTP Client Architecture
- **HTTP Client Library:** PHP's built-in `file_get_contents()` function (not a dedicated HTTP library like cURL or Guzzle)
- **PHP Configuration:** `allow_url_fopen` is enabled (default), allowing `file_get_contents()` to fetch remote URLs
- **Supported Protocols:** http, https, ftp, file (and potentially gopher, dict, php depending on PHP configuration)
- **Response Handling:** Full response content is returned to the user (non-blind SSRF with complete response visibility)

### Request Architecture
- **Request Method:** GET (default for `file_get_contents()`)
- **Timeout Controls:** None implemented (requests may hang indefinitely)
- **Size Limits:** None implemented (responses can exhaust memory)
- **Redirect Following:** Automatic (PHP's default behavior)
- **Authentication:** None (requests are made without credentials)
- **Custom Headers:** None (default PHP user agent only)

### Internal Network Architecture
- **Docker Network:** Bridge network (`xben-020-24_app-net`)
- **Network Subnet:** 10.89.10.0/24
- **Target Internal Service:** `internal-service` (hostname) resolves to 10.89.10.2
- **Internal Service Port:** 80 (HTTP)
- **Network Isolation:** Internal service is not exposed to the host, only accessible within Docker network
- **Trust Boundary Violation:** SSRF allows external attackers to proxy requests through `web-app` to access `internal-service`

### Internal Services Discovery
- **Primary Target:** `http://internal-service/` (explicitly mentioned in the landing page HTML)
- **Service Purpose:** Hosts sensitive information (CTF FLAG)
- **Authentication:** None - internal service trusts all requests from the Docker network
- **Expected Response:** HTML page containing `FLAG{...}` value

### Exploitation Strategy
1. **Primary Attack Path:** Use SSRF to access `http://internal-service/` and retrieve the FLAG
2. **Secondary Reconnaissance:** Port scanning internal services (e.g., `http://internal-service:8080/`)
3. **Cloud Metadata:** If deployed on AWS/GCP/Azure, access metadata endpoints (e.g., `http://169.254.169.254/`)
4. **Local File Access:** Read application files using `file:///etc/passwd` or `file:///var/www/html/config.php`
5. **DoS Potential:** Submit URLs to large files or slow-responding servers to exhaust resources

## 4. Secure by Design: Validated Components

**No secure components were found.** The application consists of only two functional endpoints:
1. `/index.php` - Static HTML landing page (no security mechanisms, but also no direct vulnerabilities)
2. `/redirect.php` - SSRF-vulnerable endpoint (this is the only endpoint that processes user input)

The application lacks:
- Input validation libraries
- Security middleware
- URL allowlists or blocklists
- Protocol restrictions
- IP address filtering
- Rate limiting
- Authentication mechanisms
- Authorization checks

**Note:** The application does implement output encoding via `htmlspecialchars()` on line 8 of `redirect.php`, which prevents XSS attacks. However, this does not mitigate the SSRF vulnerability, which occurs during the `file_get_contents()` call before output encoding.

## 5. Technical Analysis Details

### Vulnerability Discovery Method
- **Analysis Type:** White-box backward taint analysis
- **Source Code Files Analyzed:** `/web-app/redirect.php` (12 lines total)
- **Sink Identification:** `file_get_contents($url)` at line 5
- **Source Identification:** `$_GET['url']` at line 3
- **Validation Path:** Direct assignment with zero intermediate processing

### Data Flow Analysis
```
User Input (GET parameter 'url')
    ↓
Line 3: $url = $_GET['url']
    ↓ (no validation)
Line 5: $response = file_get_contents($url)
    ↓
Line 8: echo htmlspecialchars($response)
```

### Sanitization Assessment
- **Sanitizers Encountered:** NONE
- **Protocol Validation:** Not implemented
- **Hostname Validation:** Not implemented
- **IP Address Filtering:** Not implemented
- **URL Parsing:** Not implemented
- **Post-Sanitization Mutations:** N/A (no sanitization exists)

### External Exploitability
- **Externally Exploitable:** YES
- **Network Access Required:** Public internet access to port 34287
- **Authentication Required:** NO
- **CSRF Protection:** NO (GET method without tokens)
- **Rate Limiting:** NO
- **WAF/Firewall:** NO

## 6. Recommendations for Defense

### Immediate Mitigations (Critical Priority)
1. **Implement URL Allowlist:** Only permit fetching from pre-approved domains
2. **Protocol Restriction:** Allow only `http://` and `https://` protocols (block `file://`, `ftp://`, `gopher://`, etc.)
3. **IP Address Blocklist:** Reject requests to RFC1918 private IP ranges (10.x, 172.16.x, 192.168.x, 127.x, 169.254.x)
4. **Hostname Blocklist:** Reject requests to internal hostnames (e.g., `internal-service`, `localhost`)

### Long-Term Security Enhancements
1. **Use Dedicated HTTP Client:** Replace `file_get_contents()` with a proper HTTP library (e.g., Guzzle) that has built-in SSRF protections
2. **Implement Timeout Controls:** Set maximum request timeout (e.g., 5 seconds)
3. **Implement Size Limits:** Limit response size (e.g., 1MB maximum)
4. **Add Authentication:** Implement authentication on the endpoint to limit abuse
5. **Add Rate Limiting:** Prevent attackers from mass-exploiting the endpoint
6. **Network Segmentation:** Add authentication between web-app and internal-service (API keys, mutual TLS)
7. **Monitoring & Alerting:** Log all URL fetch attempts and alert on suspicious patterns (internal IPs, cloud metadata endpoints)

## 7. Attack Surface Summary

| Component | Attack Vector | Exploitable? | Confidence |
|-----------|---------------|--------------|------------|
| `/redirect.php` (Line 5) | Unvalidated URL fetching | YES | High |
| Internal Network Access | SSRF to internal-service | YES | High |
| Cloud Metadata Access | SSRF to 169.254.169.254 | YES (if cloud-hosted) | High |
| Local File Reading | file:// protocol abuse | YES | High |
| Port Scanning | Timing-based enumeration | YES | High |

## 8. Conclusion

The XBEN-020-24 application contains a **single, critical SSRF vulnerability** that completely bypasses network isolation controls. The vulnerability is trivial to exploit (requires only a crafted URL parameter) and provides attackers with:
- Complete access to internal services
- Ability to read local files
- Potential to steal cloud credentials
- Internal network reconnaissance capabilities

The root cause is the complete absence of input validation on user-supplied URLs before passing them to `file_get_contents()`. The application's security model relies exclusively on network-level isolation (Docker bridge networking), which is easily circumvented through application-layer SSRF exploitation.

**Critical Finding:** This vulnerability enables external attackers to bypass all network security controls and access resources intended to be internal-only, resulting in a complete compromise of the application's security posture.

---

**Analysis Completed:** 2025-10-27  
**Total Endpoints Analyzed:** 2  
**Vulnerable Endpoints:** 1  
**SSRF Sinks Identified:** 1  
**Exploitable Vulnerabilities:** 1  
**Analysis Method:** White-box backward taint analysis with source code review