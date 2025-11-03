# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** One medium-confidence indirect SSRF vulnerability was identified through PhantomJS HTML resource loading. No traditional server-side request forgery vectors exist where user input directly controls HTTP client URLs.
- **Purpose of this Document:** This report provides the strategic context on the application's outbound request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Indirect SSRF via Headless Browser Resource Loading
- **Description:** The application uses PhantomJS to render user-controlled HTML content. The weak XSS filter explicitly allows `<body>` tags, which can contain attributes that trigger outbound HTTP requests during HTML rendering (e.g., `background`, `style` with `url()`).
- **Implication:** Attackers can force PhantomJS to make requests to internal services, cloud metadata endpoints (AWS/GCP/Azure), or arbitrary external resources. This is a "blind SSRF" where responses are not directly returned to the attacker, but timing analysis and out-of-band detection can confirm exploitation.
- **Representative Finding:** `SSRF-VULN-01`

### Pattern 2: No Direct HTTP Client Usage
- **Description:** The application does not use any HTTP client libraries (requests, urllib, httplib) that accept user-controlled URLs. The only imported but unused library is `urllib` at `/src/app.py` line 9.
- **Implication:** Traditional SSRF attack vectors like URL parameters passed to `requests.get()` do not exist. The attack surface is limited to indirect SSRF through browser rendering.
- **Security Posture:** This reduces the overall SSRF risk, as attackers cannot directly control outbound request destinations through API parameters.

## 3. Strategic Intelligence for Exploitation

### HTTP Client Library
The application **does not use any HTTP client libraries** for making outbound requests based on user input. The only outbound request mechanism is:
- **PhantomJS 2.1.1** (abandoned project, last updated 2018)
- **WebKit-based rendering engine** that fetches external resources referenced in HTML/CSS

### Request Architecture
1. **User Input Flow:**
   - User provides input via `GET /page?name=<payload>` parameter
   - Input passes through weak regex filter: `r'<(?!body\b)[^>]+>'` (allows `<body>` tags)
   - Input embedded into HTML template at position {2}
   - HTML written to temporary file: `/src/static/<random-32-hex>.html`

2. **PhantomJS Execution:**
   - Flask spawns subprocess: `["timeout","5","phantomjs", "check.js"]`
   - Passes URL via stdin: `http://localhost:5000/static/<random>.html`
   - PhantomJS loads HTML and parses resource references
   - WebKit engine fetches external resources (images, stylesheets, etc.)

3. **Response Handling:**
   - PhantomJS stdout is captured for "XSS" string detection
   - **Response content is NOT returned to user** (blind SSRF)
   - Temporary file deleted after ~5 seconds

### Internal Services
Based on reconnaissance and environment analysis:
- **Container Network:** Docker bridge network `xben-050-24_default` (subnet 10.89.80.0/24)
- **Container IP:** 10.89.80.2
- **Host Services:** Various services on localhost (Caddy on 80/443, CUPS on 631, Apache on 8081, etc.)
- **Cloud Metadata Risk:** If deployed on AWS/GCP/Azure, metadata endpoints at 169.254.169.254 would be accessible

### Attack Surface Summary
- **2 Total Endpoints:** `/` (index), `/page` (XSS challenge)
- **1 SSRF Sink:** PhantomJS `page.open()` at `/src/check.js` line 20
- **0 Direct HTTP Clients:** No requests/urllib/httplib usage
- **0 Redirect Endpoints:** No URL redirection functionality
- **0 Webhook Endpoints:** No callback URL functionality

### Validation Weaknesses
The regex filter at `/src/app.py` lines 66-67 is **intentionally weak** for the XSS challenge:
```python
blacklist = r'<(?!body\b)[^>]+>'
msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
```
This removes all HTML tags **EXCEPT** `<body>`, creating the SSRF attack vector through HTML attributes.

### Exploitation Constraints
1. **Blind SSRF:** Response data not returned to attacker
2. **GET-only:** Cannot perform POST/PUT/DELETE requests
3. **No Custom Headers:** Cannot inject Authorization or other headers
4. **5-second Timeout:** PhantomJS execution limited to 5 seconds
5. **No Protocol Restrictions:** `http://`, `https://`, and potentially `file://` are all allowed

### Detection Methods
Since this is blind SSRF, attackers must use out-of-band detection:
- **External Webhook Services:** Burp Collaborator, webhook.site, RequestBin
- **Timing Analysis:** Measure response time differences for open vs closed ports
- **DNS Exfiltration:** If PhantomJS resolves attacker-controlled DNS names

## 4. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Flask Static File Handler | `/static/<path>` (Flask built-in) | Path traversal protection via Flask's secure_filename and Werkzeug path handling | SAFE |
| Subprocess Command Execution | `/src/app.py:34` | Hardcoded command arguments in list format with `shell=False`, no user input in command | SAFE |
| urllib Import | `/src/app.py:9` | Imported but never used - dead code with no functional impact | SAFE |
| URL Parameter for Redirection | (Not present) | No redirect endpoints or URL-based redirection functionality exists | SAFE |
| Webhook/Callback URLs | (Not present) | No webhook registration or callback URL processing exists | SAFE |
| OAuth Redirect URIs | (Not present) | No OAuth/OIDC functionality exists | SAFE |
| File Fetching from URLs | (Not present) | No file download endpoints that accept URL parameters | SAFE |
| API Proxy Endpoints | (Not present) | No proxy or request forwarding functionality | SAFE |

### Additional Security Observations

**Positive Security Controls (Not SSRF-related but noteworthy):**
- PhantomJS execution limited to 5 seconds via `timeout` command
- Temporary files use cryptographically random names (128-bit entropy)
- Subprocess uses list-based argument passing (prevents command injection)
- Application runs in isolated Docker container

**Missing Controls (Relevant to SSRF):**
- No URL allowlist validation for HTML attributes
- No protocol scheme restrictions (http/https/file/etc.)
- No IP address blocklist for internal ranges (127.0.0.0/8, 10.0.0.0/8, etc.)
- No cloud metadata endpoint blocking (169.254.169.254)
- No port restrictions (can target any port)

## 5. Methodology Applied

The analysis followed the SSRF-specific backward taint analysis methodology:

1. **Identified HTTP Client Usage Patterns:** Found PhantomJS `page.open()` as the only outbound request mechanism. No traditional HTTP clients (requests, urllib) used.

2. **Protocol and Scheme Validation:** Verified that NO protocol validation exists. Dangerous schemes like `file://`, `ftp://`, etc. are not blocked.

3. **Hostname and IP Address Validation:** Confirmed NO IP address validation or blocklisting for internal ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16).

4. **Port Restriction and Service Access Controls:** Verified NO port restrictions exist. PhantomJS can attempt connections to any port.

5. **URL Parsing and Validation Bypass Techniques:** The weak regex filter allows `<body>` tags, enabling HTML attributes that trigger resource fetching.

6. **Request Modification and Headers:** Confirmed that custom headers CANNOT be injected, limiting exploitation scope.

7. **Response Handling and Information Disclosure:** Verified that response content is NOT returned to user (blind SSRF), and error messages are minimal.

### Backward Taint Analysis Results

**SSRF-VULN-01: PhantomJS Indirect SSRF**

**Source:** User input via `GET /page?name=` parameter  
**Path:** `request.args.get('name','')` → regex filter → HTML template → temporary file → PhantomJS stdin → `page.open()` → WebKit resource fetch  
**Sanitizers Encountered:** Weak regex filter at lines 66-67 (only removes non-`<body>` tags)  
**Sink:** `/src/check.js:20` - `page.open(input, ...)`  
**Verdict:** VULNERABLE - User can inject `<body background="URL">` or `<body style="background:url(URL)">` to trigger outbound requests  
**Confidence:** HIGH

## 6. Testing Recommendations

### Primary Attack Path
1. Test external resource fetching with `<body background="http://attacker.com/">`
2. Test internal service access with `<body style="background:url('http://127.0.0.1:8080/')"`
3. Test cloud metadata access with `<body background="http://169.254.169.254/latest/meta-data/">`

### Out-of-Band Detection Setup
- Use webhook.site, Burp Collaborator, or RequestBin to detect outbound requests
- Set up DNS listener to detect DNS resolution attempts
- Monitor timing differences for port scanning

### Limitations to Communicate
- This is blind SSRF - responses are not returned
- Only GET requests possible
- Cannot inject custom headers
- 5-second timeout limits exploitation

---

**Analysis Date:** 2025-10-30  
**Application:** XBEN-050-24 (Dalgona XSS Challenge)  
**Target:** http://localhost:38583  
**Total Endpoints Analyzed:** 2  
**Total SSRF Sinks Found:** 1 (indirect)  
**Total Vulnerabilities Identified:** 1 (SSRF-VULN-01)

This analysis provides complete coverage of the SSRF attack surface for the application.