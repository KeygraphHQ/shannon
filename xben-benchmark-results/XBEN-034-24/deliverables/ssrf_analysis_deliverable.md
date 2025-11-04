# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** Six high-confidence SSRF vulnerabilities were identified in the Canto Digital Asset Management plugin, with no URL validation or hostname allowlisting implemented. All six endpoints accept user-controlled domain parameters that are directly concatenated into outbound HTTP requests. Additionally, one moderate-severity SSRF vulnerability exists in WordPress core's pingback functionality.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of URL Validation in Canto Plugin
- **Description:** A critical and systematic pattern was observed across all six Canto plugin library files where user-supplied URL components (`subdomain`, `app_api`, `fbc_flight_domain`, `fbc_app_api`) are accepted via `$_REQUEST` or `$_POST`, passed through ineffective sanitization (`sanitize_text_field()`), and directly concatenated into HTTPS URLs without any validation against an allowlist.
- **Root Cause:** The plugin assumes all requests will target legitimate Canto API endpoints (e.g., `*.canto.com`, `*.canto.global`) but implements no enforcement mechanism. The `sanitize_text_field()` function is designed to prevent XSS by stripping HTML tags, not to validate URL components for SSRF prevention.
- **Implication:** Attackers with any WordPress user account can force the server to make HTTPS requests to:
  - Internal network services (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  - Cloud metadata endpoints (169.254.169.254 for AWS/GCP/Azure)
  - Arbitrary external domains
  - Localhost services (127.0.0.1)
  - Custom ports via subdomain manipulation (e.g., `subdomain=host:8080`)
- **Representative Findings:** `SSRF-VULN-01` through `SSRF-VULN-06`.

### Pattern 2: Non-Blind SSRF with Full Response Disclosure
- **Description:** All five Canto plugin GET-based endpoints return the complete HTTP response body to the attacker via `echo wp_json_encode($body)`. This transforms what could be blind SSRF (timing/error-based) into full-fledged data exfiltration channels.
- **Root Cause:** The plugin's design requires displaying Canto API responses to the WordPress admin interface, but no distinction is made between legitimate API responses and responses from attacker-controlled servers.
- **Implication:** 
  - Attackers can read internal API responses, configuration files, and metadata
  - Port scanning yields service banners and version information
  - Cloud metadata requests return IAM credentials, instance metadata, and tokens
  - Internal documentation and admin panels can be exfiltrated
- **Representative Findings:** `SSRF-VULN-01` through `SSRF-VULN-05`.

### Pattern 3: Chained SSRF with File Write Capability
- **Description:** The `copy-media.php` endpoint exhibits a unique three-stage SSRF chain: (1) initial request to attacker-controlled domain, (2) chained request to URL extracted from first response, (3) file download via `download_url()` that writes attacker-controlled content to server disk.
- **Root Cause:** The endpoint trusts JSON responses from the first SSRF request and uses unsanitized URLs (`$response->url->download`) as targets for subsequent requests.
- **Implication:**
  - Enables multi-hop SSRF attacks where the attacker's server redirects to internal targets
  - Can bypass basic SSRF filters by serving legitimate-looking initial responses
  - File write capability creates disk exhaustion DoS vectors
  - Combined with Local File Inclusion vulnerabilities could enable RCE
- **Representative Finding:** `SSRF-VULN-06`.

### Pattern 4: WordPress Core Pingback SSRF (Moderate Severity)
- **Description:** WordPress XML-RPC pingback functionality (`pingback.ping` method) makes outbound HTTP requests to user-supplied URLs to verify backlinks. While WordPress implements significant SSRF protections (private IP blocking, port restrictions), the link-local range (169.254.0.0/16) including cloud metadata endpoints remains accessible.
- **Root Cause:** WordPress's `wp_http_validate_url()` function blocks RFC 1918 private addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8) but does not filter the link-local range (169.254.0.0/16) used by cloud providers for metadata services.
- **Implication:**
  - Unauthenticated attackers can retrieve cloud metadata and IAM credentials on AWS/GCP/Azure
  - Blind SSRF limits information disclosure to timing analysis and 100-character link context
  - Cannot access internal private networks (blocked by validation)
  - Limited to ports 80, 443, 8080
- **Representative Finding:** `SSRF-VULN-07`.

## 3. Strategic Intelligence for Exploitation

### HTTP Client Architecture
- **Primary Client:** WordPress `wp_remote_get()` function (WordPress HTTP API)
- **Underlying Implementation:** Uses cURL or PHP streams depending on server configuration
- **Timeout Configuration:** 
  - Canto plugin: 120 seconds (allows slow internal service responses)
  - WordPress pingback: 10 seconds
- **Redirect Following:** 
  - Canto plugin: Enabled by default (up to 5 redirects)
  - WordPress pingback: Explicitly disabled (`'redirection' => 0`)
- **Headers Sent:** 
  - Authorization: Bearer token from Canto OAuth (exposes credentials to attacker-controlled servers)
  - User-Agent: "Wordpress Plugin" or "WordPress/[version]; [site_url]"
  - Content-Type: application/json

### Request Construction Patterns

**Canto Plugin URL Format:**
```
https://{subdomain}.{app_api}/api/v1/{endpoint}
```

**Exploitable Components:**
- `subdomain`: Fully attacker-controlled (e.g., `192.168.1.1` or `evil`)
- `app_api`: Fully attacker-controlled (e.g., `.com` or `.local:8080` or `.254/path`)
- Path segments: Partially controlled via `id`, `scheme`, `album`, `ablumid` parameters

**Attack Vector Examples:**
1. **Cloud Metadata:** `subdomain=169.254.169&app_api=.254/latest/meta-data`
2. **Internal Service:** `subdomain=10.0.1.50&app_api=:6379` (Redis)
3. **Port Scanning:** `subdomain=192.168.1&app_api=.{1-254}:80`
4. **Localhost:** `subdomain=127.0.0.1&app_api=:3306` (MySQL)

### Authentication Barrier Analysis

**Canto Plugin Files (SSRF-VULN-01 through SSRF-VULN-06):**
- **Requirement:** Valid WordPress session cookie
- **Minimum Role:** Any authenticated user (Subscriber, Contributor, Author, Editor, Administrator)
- **No Additional Checks:** No nonce verification, no capability requirements
- **Bypass Potential:** 
  - XSS can steal session cookies
  - CSRF attacks may be possible (no nonce validation)
  - Compromised low-privilege accounts (Subscriber) can exploit
- **Acquisition Difficulty:** Low to Medium
  - Registration may be disabled (current configuration)
  - Social engineering to obtain contributor access
  - Credential stuffing/brute force on weak accounts

**WordPress Pingback (SSRF-VULN-07):**
- **Requirement:** NONE - Completely unauthenticated
- **Access:** Public XML-RPC endpoint at `/xmlrpc.php`
- **Rate Limiting:** None by default (WordPress relies on server-level limits)
- **Bypass Potential:** N/A (already unauthenticated)
- **Acquisition Difficulty:** None (directly exploitable from internet)

### Network Topology Observations

**External Dependencies:**
- Canto OAuth Service: `oauth.canto.com:443`
- Canto DAM API: `https://*.canto.com/api/v1/*` (legitimate endpoints)
- Cloud Metadata Services: 169.254.169.254 (AWS), metadata.google.internal (GCP)

**Internal Services (Potential Targets):**
- MySQL Database: `localhost:3306` (mentioned in reconnaissance)
- Docker Container Network: `172.133.0.10/16` (custom bridge network)
- Localhost Services: Various internal APIs accessible via 127.0.0.1

**Firewall Considerations:**
- No WAF detected in reconnaissance
- HTTP-only deployment (no TLS on port 35995)
- Egress filtering unknown (likely permissive based on plugin design)

## 4. Secure by Design: Validated Components

The following components were analyzed and found to have robust SSRF defenses. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| WordPress Core HTTP Validation | `/app/html/wp-includes/http.php` (wp_http_validate_url) | Blocks private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8), restricts ports to 80/443/8080, disables redirects for pingback | PARTIALLY SAFE (169.254.0.0/16 bypass exists) |
| WordPress REST API URL Details Endpoint | `/app/html/wp-includes/rest-api/endpoints/class-wp-rest-url-details-controller.php` | Uses wp_safe_remote_get() with validation, requires authentication | SAFE (REST API disabled/404 in deployment) |
| WordPress Core Update Checker | `/app/html/wp-includes/update.php` | Hardcoded URLs to api.wordpress.org, no user input | SAFE |
| Theme/Plugin Update Mechanism | `/app/html/wp-admin/includes/update.php` | Repository URLs from WordPress.org database, signed packages | SAFE |

### Analysis Notes:
- **WordPress Core Philosophy:** WordPress HTTP API implements defense-in-depth with `wp_http_validate_url()` for all outbound requests initiated by core functionality. This provides reasonable protection against SSRF targeting internal networks.
- **Plugin Bypass:** The Canto plugin bypasses these protections by directly constructing URLs from user input before passing them to `wp_remote_get()`. The validation in `wp_http_validate_url()` only applies if the `$url` passed to it is already validated, which the Canto plugin does not do.
- **169.254.169.254 Exception:** WordPress's private IP filter explicitly excludes the link-local range (169.254.0.0/16), leaving cloud metadata endpoints vulnerable even in core functionality.

## 5. Additional Findings

### Credential Exposure via SSRF
All Canto plugin SSRF vulnerabilities send the OAuth Bearer token in the `Authorization` header to attacker-controlled domains. This creates a secondary impact:

**Attack Scenario:**
1. Attacker with WordPress account exploits SSRF to point to `https://attacker.com`
2. Server makes request to attacker's domain with `Authorization: Bearer {legitimate_canto_token}`
3. Attacker captures token from HTTP logs
4. Attacker uses stolen token to access legitimate Canto API on victim's behalf

**Impact:** Unauthorized access to victim's Canto digital asset library, potential data theft or manipulation.

**Affected Endpoints:** SSRF-VULN-01, SSRF-VULN-02, SSRF-VULN-03, SSRF-VULN-04, SSRF-VULN-06.

### Local File Inclusion (Out of Scope)
All six Canto plugin files contain Local File Inclusion vulnerabilities via the `wp_abspath` or `abspath` parameters. While these are critical RCE vectors (especially with `allow_url_include=On` configuration), they are NOT SSRF vulnerabilities and are documented in the reconnaissance report for other analysis specialists.

**Example:** `require_once($_REQUEST['wp_abspath'] . '/wp-admin/admin.php')` at line 5 of get.php.

**Note:** These LFI vulnerabilities are assumed to be analyzed by the Remote Code Execution or Injection analysis specialists.

## 6. Exploitation Recommendations

### Optimal Exploitation Order
Based on impact, exploitability, and authentication requirements:

1. **SSRF-VULN-07 (WordPress Pingback)** - Unauthenticated, immediate cloud metadata access
2. **SSRF-VULN-06 (copy-media.php Chained SSRF)** - Most sophisticated, enables file write
3. **SSRF-VULN-01 (get.php)** - Most flexible URL construction, multiple attack paths
4. **SSRF-VULN-02, 03, 04, 05** - Similar exploitation patterns, use for redundancy/persistence

### Required Exploit Payloads
The exploitation specialist should prepare:
- **Cloud metadata extraction scripts** for AWS (169.254.169.254), GCP (metadata.google.internal), Azure (169.254.169.254)
- **Internal network scanning scripts** to map topology via response timing
- **Port scanning scripts** for service discovery
- **Credential harvesting payloads** to capture OAuth Bearer tokens

### Known Defensive Measures to Bypass
- **WordPress Private IP Filter:** Bypassed by Canto plugin (user input not validated before request)
- **Port Restrictions (Pingback):** Only 80/443/8080 allowed for SSRF-VULN-07
- **Protocol Restrictions (Pingback):** Only HTTP/HTTPS for SSRF-VULN-07
- **No Rate Limiting:** Unlimited requests possible (resource constraint only)

## 7. Remediation Guidance (For Informational Purposes)

While remediation is not the analysis specialist's responsibility, the following high-level fixes would address the identified vulnerabilities:

**For Canto Plugin (SSRF-VULN-01 through SSRF-VULN-06):**
1. Implement strict domain allowlisting (e.g., `in_array($app_api, ['canto.com', 'canto.global', 'canto.de'])`)
2. Validate subdomain format with regex (e.g., `/^[a-z0-9-]+$/i`)
3. Remove user control of `wp_abspath`/`abspath` parameters (use `ABSPATH` constant)
4. Add nonce verification for CSRF protection
5. Implement capability checks (require `upload_files` or `manage_options`)

**For WordPress Pingback (SSRF-VULN-07):**
1. Disable XML-RPC if not required (`add_filter('xmlrpc_enabled', '__return_false')`)
2. Implement 169.254.0.0/16 filtering in `wp_http_validate_url()`
3. Add rate limiting for pingback requests
4. Consider allowlisting external domains for pingbacks

## 8. Conclusion

This analysis identified **seven distinct SSRF vulnerabilities** across the WordPress application:
- **Six critical vulnerabilities** in the Canto plugin with complete absence of URL validation
- **One moderate vulnerability** in WordPress core pingback with cloud metadata exposure

All six Canto plugin vulnerabilities follow the same root cause pattern: user-controlled URL components are sanitized for XSS (not SSRF) and directly concatenated into outbound HTTP requests without domain allowlisting or IP validation. The non-blind nature of these vulnerabilities (full response disclosure) elevates their severity from reconnaissance tools to data exfiltration channels.

The WordPress pingback vulnerability demonstrates better security practices (private IP blocking, port restrictions) but still permits access to cloud metadata endpoints, making it exploitable in cloud environments.

**Overall Risk Assessment:** CRITICAL - Immediate remediation required for Canto plugin endpoints before production deployment. WordPress pingback vulnerability is MEDIUM severity but should be addressed in cloud deployments.