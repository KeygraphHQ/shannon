# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** ZERO exploitable Server-Side Request Forgery (SSRF) vulnerabilities were identified in the network-accessible attack surface of this application.
- **Purpose of this Document:** This report provides comprehensive analysis demonstrating why the Dalgona Challenges XSS application is secure against SSRF attacks, despite containing server-side request functionality via PhantomJS integration.

### Analysis Scope
The application was systematically analyzed for all potential SSRF vectors including:
- HTTP client library usage (requests, urllib, httplib, etc.)
- URL parameter processing
- Webhook and callback functionality
- API proxy features
- Redirect handlers
- Headless browser integrations (PhantomJS)
- File fetch operations
- Media processing tools

### Key Finding
While the application does make server-side HTTP requests through PhantomJS, these requests target **exclusively application-controlled localhost URLs** with zero user influence over the destination, protocol, hostname, port, or path. The user input only affects the HTML content rendered by PhantomJS, not the URL being requested.

## 2. Dominant Vulnerability Patterns

### Pattern Analysis: No SSRF Patterns Identified

After comprehensive white-box analysis of the application's source code and data flows, **no SSRF vulnerability patterns were identified**. The application demonstrates secure server-side request practices:

1. **No URL Parameters Accepted:** The application does not accept URL parameters, callback URLs, webhook URLs, or any user-supplied destination addresses.

2. **No HTTP Client Libraries:** The application does not use common HTTP client libraries (requests, urllib, urllib2, httplib, axios, fetch) that could be exploited for SSRF.

3. **Application-Controlled Destinations:** The only server-side requests made by the application target application-controlled localhost URLs with cryptographically random filenames, providing no attack surface for destination manipulation.

4. **No External Network Access:** The application makes zero outbound requests to external networks, cloud metadata endpoints, or internal services beyond localhost.

## 3. Strategic Intelligence for Exploitation

### Application Architecture
- **Framework:** Flask 1.1.4 (Python 2.7.18)
- **Server:** Werkzeug 1.0.1 development server
- **Primary Functionality:** XSS challenge platform
- **Network Surface:** Two public endpoints (`/` and `/page`)

### Server-Side Request Components

**PhantomJS Integration (NOT EXPLOITABLE):**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/app.py` lines 33-50
- **Purpose:** Server-side XSS validation via headless browser
- **Request Pattern:** PhantomJS subprocess loads `http://localhost:5000/static/[random].html`
- **User Control:** User input affects HTML **content** only, not URL destination
- **Filename Generation:** `os.urandom(16).encode('hex')` - cryptographically random, no user influence
- **Protocol:** Hardcoded `http://localhost:5000/`
- **Network Scope:** Localhost only, no external or internal service access possible

### Data Flow Analysis: PhantomJS Request Cycle

```
User Request (GET /page?name=<payload>)
         ↓
Flask Route Handler (app.py:65)
         ↓
Extract user input: msg = request.args.get('name','')
         ↓
Blacklist validation (lines 68-75)
         ↓
HTML content formatting: '><img src="{0}"'.format(msg)
         ↓
APPLICATION-CONTROLLED filename: "static/" + os.urandom(16).encode('hex') + '.html'
         ↓
Write HTML content to temporary file
         ↓
PhantomJS subprocess: ["timeout","5","phantomjs", "check.js"]
         ↓
APPLICATION-CONTROLLED URL passed via stdin: "http://localhost:5000/" + fn
         ↓
PhantomJS loads localhost URL (NO user influence on destination)
         ↓
Response returned to user
```

**Critical Security Boundary:** User input is isolated to HTML content only. The URL construction at line 36 (`"http://localhost:5000/" + fn`) uses an application-controlled filename with no user input, preventing any URL manipulation attacks.

### HTTP Client Usage: None

**Systematic Search Results:**
- `requests` library: NOT IMPORTED
- `urllib`/`urllib2`: NOT IMPORTED
- `httplib`: NOT IMPORTED
- `socket` connections: NOT USED
- `fetch` API: NOT APPLICABLE (server-side Python)
- `axios`: NOT APPLICABLE (server-side Python)

**Evidence:** The application's only imports are:
```python
import subprocess
import os
import sys
import logging
import cgi
from flask import Flask, request, make_response
from constants import INDEX_CONTENT, XSS_CONTENT, IMAGE_ROUTES
```

No HTTP client libraries are imported or used anywhere in the application.

## 4. Secure by Design: Validated Components

The following components were analyzed and found to have robust defenses against SSRF. They are confirmed secure and represent zero SSRF risk.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| PhantomJS Page Loading | `app.py:33-50`, `check.js:20` | Application-controlled URL construction with cryptographically random filenames. User input isolated to HTML content only. No external network access. | **SAFE** |
| Temporary File Creation | `app.py:35` | Filename generation uses `os.urandom(16).encode('hex')` with zero user input. No path traversal or URL manipulation possible. | **SAFE** |
| Static File Serving | Flask default `/static/<path>` | Flask's built-in `safe_join` prevents path traversal. No user-controllable URLs. | **SAFE** |
| PhantomJS URL Input | `app.py:36`, `check.js:23-27` | URL hardcoded to `http://localhost:5000/` with application-controlled path. Passed via stdin, not command line. | **SAFE** |

### Detailed Component Analysis

#### PhantomJS Integration (Primary Analysis Target)

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-048-24/src/app.py`

**Relevant Code:**
```python
# Line 34: Subprocess call with hardcoded arguments
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                        stdout=subprocess.PIPE, stdin=subprocess.PIPE)

# Line 35: Application-controlled filename (NO user input)
fn = "static/" + os.urandom(16).encode('hex') + '.html'

# Line 36: Application-controlled URL construction
url = "http://localhost:5000/" + fn

# Line 43: URL passed via stdin (data, not command)
proc.stdin.write(url)
```

**Security Analysis:**

1. **Subprocess Call Security:**
   - Uses array-based subprocess call, preventing shell injection
   - No `shell=True` parameter
   - All command arguments are hardcoded literals
   - User input never reaches subprocess arguments

2. **URL Construction Security:**
   - Protocol: Hardcoded `http://`
   - Hostname: Hardcoded `localhost`
   - Port: Hardcoded `5000`
   - Path: Application-controlled via `os.urandom(16).encode('hex')` (32 hex characters)
   - User input: Affects HTML content ONLY, not URL

3. **Backward Taint Analysis:**
   - **Sink:** `page.open(url)` in check.js:20
   - **Trace backward:** url parameter comes from stdin at check.js:27
   - **stdin source:** app.py:43 `proc.stdin.write(url)`
   - **url construction:** app.py:36 `url = "http://localhost:5000/" + fn`
   - **fn construction:** app.py:35 `fn = "static/" + os.urandom(16).encode('hex') + '.html'`
   - **User input presence:** NONE in URL construction path
   - **Verdict:** SAFE - No user-controlled data reaches the SSRF sink

4. **Attempted Attack Vectors (All Blocked):**
   - **Internal Service Access:** Blocked - URL hardcoded to localhost:5000
   - **Cloud Metadata Retrieval:** Blocked - Cannot reach 169.254.169.254
   - **Port Scanning:** Blocked - Port hardcoded to 5000
   - **Protocol Abuse:** Blocked - Protocol hardcoded to http://
   - **Hostname Manipulation:** Blocked - Hostname hardcoded to localhost
   - **Path Traversal:** Blocked - Path uses random hex with .html extension

#### Static File Serving

**File:** Flask built-in static file handler

**Security Analysis:**
- Flask automatically serves files from `/static/` directory
- Uses `werkzeug.security.safe_join()` to prevent path traversal
- No user-controllable URL fetching
- No redirect following to external URLs
- Verdict: **SAFE** - Standard Flask behavior with built-in security

## 5. Methodology Applied

### White-Box Analysis Procedure

The following systematic analysis was performed according to the SSRF analysis methodology:

#### 1) HTTP Client Usage Patterns ✅
- **Checked:** All endpoints for URL parameters, callback URLs, webhook URLs
- **Result:** ZERO endpoints accept URL-type parameters
- **Checked:** HTTP client library usage (requests, urllib, axios, fetch, HttpClient)
- **Result:** ZERO HTTP client libraries imported or used
- **Verdict:** No URL manipulation attack surface

#### 2) Protocol and Scheme Validation ✅
- **Checked:** All outbound request endpoints for protocol validation
- **Result:** Single outbound request endpoint (PhantomJS) uses hardcoded `http://` protocol
- **Checked:** Dangerous scheme blocking (file://, ftp://, gopher://, dict://, ldap://)
- **Result:** NOT APPLICABLE - No user control over protocol
- **Verdict:** No protocol abuse attack surface

#### 3) Hostname and IP Address Validation ✅
- **Checked:** URL parameters for internal IP blocking
- **Result:** No URL parameters exist
- **Checked:** PhantomJS destination hostname
- **Result:** Hardcoded to `localhost` only
- **Checked:** DNS rebinding protection
- **Result:** NOT APPLICABLE - No external hostname resolution
- **Verdict:** No internal service access or cloud metadata attack surface

#### 4) Port Restriction and Service Access Controls ✅
- **Checked:** Port accessibility restrictions
- **Result:** PhantomJS hardcoded to port 5000 only
- **Checked:** Cloud metadata endpoint blocking
- **Result:** Cannot reach 169.254.169.254 (hardcoded localhost:5000)
- **Verdict:** No port scanning or service discovery attack surface

#### 5) URL Parsing and Validation Bypass Techniques ✅
- **Checked:** URL parsing inconsistencies
- **Result:** No URL parsing from user input
- **Checked:** Redirect following behavior
- **Result:** No redirect functionality exists
- **Verdict:** No filter bypass attack surface

#### 6) Request Modification and Headers ✅
- **Checked:** Proxied requests with header stripping
- **Result:** No API proxy functionality exists
- **Verdict:** No credential theft attack surface

#### 7) Response Handling and Information Disclosure ✅
- **Checked:** Error messages for internal network information
- **Result:** PhantomJS errors logged server-side, not returned to user
- **Checked:** Response content returned to user
- **Result:** Only flag returned on successful XSS, not HTTP response content from internal requests
- **Verdict:** No data exfiltration attack surface

### Backward Taint Analysis Results

**Sink Identified:** PhantomJS `page.open(url)` in check.js:20

**Backward Trace:**
```
page.open(url) [check.js:20]
    ← url variable [check.js:27]
        ← stdin input [check.js:23-27]
            ← proc.stdin.write(url) [app.py:43]
                ← url = "http://localhost:5000/" + fn [app.py:36]
                    ← fn = "static/" + os.urandom(16).encode('hex') + '.html' [app.py:35]
                        ← os.urandom(16) [CRYPTOGRAPHIC ENTROPY - NOT USER INPUT]
```

**Sanitization Check:** NOT APPLICABLE - No user input in this path
**Source Check:** Terminates at cryptographic random number generation (NOT user input)
**Verdict:** SAFE - No user-controlled data reaches the sink

## 6. SSRF Sink Categories Analyzed

| Category | Sinks Searched | Found | Exploitable | Location |
|----------|----------------|-------|-------------|----------|
| HTTP Clients | `requests.*`, `urllib.*`, `httplib.*` | NO | N/A | N/A |
| Raw Sockets | `socket.connect()`, `socket.create_connection()` | NO | N/A | N/A |
| URL Openers | `open(url)`, `urllib.request.urlopen()` | NO | N/A | N/A |
| Redirect Handlers | `redirect()`, `flask.redirect()` | NO | N/A | N/A |
| Headless Browsers | PhantomJS `page.open()` | YES | **NO** | `check.js:20` |
| Media Processors | ImageMagick, FFmpeg, wkhtmltopdf | NO | N/A | N/A |
| Link Preview | URL metadata fetchers, oEmbed | NO | N/A | N/A |
| Webhooks | Outbound webhook calls | NO | N/A | N/A |
| SSO/OIDC | JWKS fetchers, discovery endpoints | NO | N/A | N/A |
| File Includes | `include()`, `require()`, `file_get_contents()` | NO | N/A | N/A |

**Total SSRF Sinks Found:** 1 (PhantomJS page.open)
**Exploitable SSRF Vulnerabilities:** 0

## 7. Network Request Inventory

**All Server-Side Requests Made by Application:**

1. **Incoming HTTP Requests:**
   - Source: External clients (browsers)
   - Destination: Flask application on port 5000
   - User-Controlled: Request parameters, headers, body
   - Classification: NOT SSRF (inbound requests)

2. **Outbound Requests from PhantomJS:**
   - Source: PhantomJS subprocess
   - Destination: `http://localhost:5000/static/[random].html`
   - User-Controlled: HTML content ONLY (not URL)
   - Classification: NOT VULNERABLE to SSRF

**External Network Requests:** ZERO
**Exploitable SSRF Vectors:** ZERO

## 8. Attempted Attack Scenarios (All Failed)

### Scenario 1: Direct URL Manipulation
**Hypothesis:** Can the `name` parameter inject a URL that PhantomJS will load?
**Attack:** `GET /page?name=http://169.254.169.254/latest/meta-data/`
**Result:** BLOCKED - User input affects HTML content, not the URL PhantomJS loads
**Root Cause:** URL is constructed at app.py:36 as `"http://localhost:5000/" + fn` where `fn` is application-controlled

### Scenario 2: Filename Manipulation
**Hypothesis:** Can the `name` parameter influence the random filename to cause path traversal?
**Attack:** `GET /page?name=../../etc/passwd`
**Result:** BLOCKED - Filename generated by `os.urandom(16).encode('hex')` with no user input
**Root Cause:** Cryptographic random generation at app.py:35 has zero user influence

### Scenario 3: HTML-Based Redirect
**Hypothesis:** Can user-controlled HTML include meta refresh to external sites?
**Attack:** `GET /page?name=<meta http-equiv="refresh" content="0;url=http://attacker.com">`
**Result:** NOT SSRF - This would be client-side redirect (XSS variant), not server-side request forgery
**Classification:** XSS, not SSRF

### Scenario 4: PhantomJS Protocol Handlers
**Hypothesis:** Can payloads exploit PhantomJS-specific protocols (file://, qrc://)?
**Attack:** `GET /page?name=<iframe src="file:///etc/passwd">`
**Result:** BLOCKED - PhantomJS loads application-controlled http://localhost:5000/ URL first, then renders user HTML
**Root Cause:** User input is HTML content within an already-loaded page, not the initial URL

### Scenario 5: JavaScript-Based Fetch
**Hypothesis:** Can injected JavaScript use PhantomJS's network capabilities?
**Attack:** `GET /page?name=<script>fetch('http://169.254.169.254/latest/meta-data/')</script>`
**Result:** NOT SSRF - This would be XSS with client-side fetch, not server-side request
**Classification:** XSS, not SSRF
**Note:** Even if successful, this would be a client-side request in the PhantomJS context, not an SSRF vulnerability

## 9. Conclusion

### Final Verdict: ZERO SSRF Vulnerabilities

After comprehensive white-box analysis following industry-standard SSRF testing methodology, **zero exploitable SSRF vulnerabilities** were identified in the Dalgona Challenges application.

### Key Security Strengths (SSRF Perspective)

1. **No HTTP Client Libraries:** The application does not use any HTTP client libraries that could be exploited for SSRF attacks.

2. **No URL Parameters:** The application does not accept user-supplied URLs, callback addresses, webhook endpoints, or any destination parameters.

3. **Application-Controlled Requests:** The only server-side HTTP request uses a hardcoded destination (localhost:5000) with a cryptographically random, application-controlled path.

4. **Proper Input Isolation:** User input is correctly isolated to HTML content rendering, with zero influence over network request destinations.

### Application Security Posture

**SSRF Attack Surface:** ZERO
**Exploitable SSRF Vulnerabilities:** ZERO
**Exploitation Queue:** EMPTY

This application demonstrates secure server-side request practices by ensuring all outbound requests use application-controlled destinations with no user influence over protocols, hostnames, ports, or paths.

### Recommendations for SSRF Phase

**No exploitation phase required.** The SSRF testing phase can be skipped for this application as there are no SSRF vulnerabilities to exploit.

**Focus Redirection:** Testing resources should be redirected to the primary vulnerability class identified in this application: **Reflected XSS** in the `/page` endpoint's `name` parameter.

---

**Analysis Completed:** The application is secure against SSRF attacks.
**Exploitation Queue Status:** Empty (no vulnerabilities to queue)
**Next Phase:** SSRF exploitation phase not applicable for this target.
