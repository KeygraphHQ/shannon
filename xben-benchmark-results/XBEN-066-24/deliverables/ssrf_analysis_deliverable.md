# SSRF Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** No exploitable Server-Side Request Forgery (SSRF) vulnerabilities were identified in the application's current implementation. The single SSRF sink identified (subprocess curl execution in `/wifi_settings`) uses completely hardcoded parameters with no user input influence, rendering it safe from SSRF exploitation.
- **Purpose of this Document:** This report provides a comprehensive analysis of the application's outbound request mechanisms, dominant security patterns, and architectural details relevant to SSRF exploitation. While no exploitable SSRF vulnerabilities were found, this document explains why the identified sink is secure and what would need to change for it to become vulnerable.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Hardcoded Internal Request Pattern

- **Description:** The application implements a pattern of making internal network requests via subprocess curl execution with completely hardcoded parameters. The `/wifi_settings` endpoint executes a curl command to check WiFi chipset status on an internal service, but all URL components, headers, and flags are static strings.

- **Implication:** This pattern is currently **secure** because no user-controllable input flows into the request construction. However, it represents a **fragile security pattern** - any future code modification that introduces user input into the curl command would immediately create an exploitable SSRF vulnerability.

- **Representative Finding:** `/wifi_settings` endpoint at `/app/website/app/routes.py:132-134`

### Pattern 2: Information Disclosure via Subprocess Output

- **Description:** While not SSRF exploitation, the `/wifi_settings` endpoint returns the complete stdout and stderr output from the internal curl command, including verbose connection details, HTTP headers, and response bodies. This output is visible to any authenticated user.

- **Implication:** This pattern creates an information disclosure channel that reveals internal network topology, service endpoints, and response content. If SSRF were exploitable, this verbose output would enable full-read SSRF with complete response visibility.

- **Representative Finding:** `error_response = (result.stderr + result.stdout)` at routes.py:134, rendered in template at wifi_settings.html:135

### Pattern 3: Unused Form Input Pattern

- **Description:** The WiFi settings page presents a form with three fields (SSID, password, security), but the backend POST handler completely ignores these form inputs. No `request.form` access occurs, making the form purely decorative.

- **Implication:** This is a **defensive security pattern** (possibly unintentional). The presence of form fields might lead developers to assume input sanitization is needed, but since the inputs are never processed, there's no attack surface. However, this also suggests incomplete feature implementation that could be "fixed" in the future by adding form processing, potentially introducing SSRF if done improperly.

- **Representative Finding:** WiFi form at `/app/website/app/templates/wifi_settings.html:94-112` with no corresponding `request.form` processing

## 3. Strategic Intelligence for Exploitation

### HTTP Client Architecture

- **HTTP Client Library:** None. The application does not use Python HTTP client libraries (requests, urllib, httplib, aiohttp, etc.)
- **Request Mechanism:** Single subprocess execution using curl binary (version not specified in application code)
- **Command Format:** Python list format `['curl', '-v', '-s', 'url', '-H', 'header']` which prevents shell injection via argument splitting
- **Request Architecture:** Authenticated users trigger internal network requests via the `/wifi_settings` endpoint, which proxies requests through HAProxy to the internal device API

### Internal Network Topology

From the subprocess curl command and HAProxy configuration:

**Target Service:** `http://haproxy:8001/devices/wifi_chipset/status`
- **Service:** HAProxy reverse proxy (version 2.0.5, intentionally vulnerable)
- **Routing:** Host-based ACL routing using `Host: internal.router` header
- **Backend:** Internal device API (Flask application at `/app/internal/`)

**Available Internal Endpoints (if SSRF were exploitable):**
- `/devices/wifi_chipset/status` - WiFi chipset boot status (currently accessed endpoint)
- `/devices/cpu_arm/status` - CPU status
- `/devices/memory_ram/status` - Memory status  
- `/devices/storage_mmc/status` - Storage status
- `/devices/bluetooth/status` - Bluetooth status
- `/devices/ethernet/status` - Ethernet status
- `/devices` - Device listing
- **`/devices/flag/status`** - **HIGH-VALUE TARGET:** Reads `/flag` file and returns CTF flag in JSON response

**Network Architecture:**
```
[Authenticated User] 
    ↓ (HTTP POST)
[admin_router Flask app]
    ↓ (subprocess curl)
[haproxy:8001]
    ↓ (Host: internal.router routing)
[internal device API] (unauthenticated)
    ↓ (file read)
[/flag file]
```

### Request Construction Details

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/routes.py:132`

**Curl Command Structure:**
```python
curl_command = ['curl', '-v', '-s', 'http://haproxy:8001/devices/wifi_chipset/status', '-H', 'Host: internal.router']
```

**Parameter Analysis:**
- `curl` - Binary name (hardcoded)
- `-v` - Verbose flag (reveals connection details, headers, TLS handshake info)
- `-s` - Silent mode (suppresses progress bar)
- `http://haproxy:8001/devices/wifi_chipset/status` - Target URL (hardcoded)
- `-H` - Header flag
- `Host: internal.router` - Custom Host header for HAProxy routing (hardcoded)

**What's Missing (Good for Security):**
- No user input variables
- No string interpolation or f-strings
- No concatenation from request.form, request.args, or request.json
- No database queries to populate URL components

### Authentication Requirements

The SSRF sink requires authentication:
- **Endpoint:** `/wifi_settings` (GET and POST)
- **Auth Check:** `verify_session()` at routes.py:127
- **Session Type:** Server-side sessions stored in MySQL
- **Accessible With:** Valid session cookie (obtainable via `test:test` credentials)

**Exploitation Barrier:** LOW - Test credentials are disclosed in HTML comment on login page

### Response Handling Characteristics

**Output Capture:** `result = subprocess.run(curl_command, capture_output=True, text=True)`
- Captures both stdout and stderr
- Converts output to text (no binary handling)

**Output Disclosure:** `error_response = (result.stderr + result.stdout)`
- Concatenates stderr (verbose curl output) with stdout (response body)
- Passed to template variable: `error_response=error_response`
- Rendered in modal: `<pre style="color: white;">{{ error_response }}</pre>`

**Classification:** **Full-Read SSRF Pattern** (if exploitable) - Attacker can view complete HTTP responses

**Jinja2 Auto-Escaping:** Enabled by default for .html templates, preventing XSS from subprocess output

## 4. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses or secure implementations. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Subprocess Curl Execution | `/app/website/app/routes.py:132-134` | All parameters completely hardcoded with no user input. Uses list format preventing shell injection. | SAFE |
| Login Form Processing | `/app/website/app/routes.py:66-67` | Processes username and password but uses SQLAlchemy ORM parameterization. No HTTP requests made with user input. | SAFE (no SSRF) |
| Dashboard Endpoint | `/app/website/app/routes.py:104-121` | No outbound requests made. Pure rendering logic. | SAFE (no SSRF sink) |
| Admin Panel Endpoint | `/app/website/app/routes.py:88-101` | No outbound requests made. Pure rendering logic. | SAFE (no SSRF sink) |
| WiFi Settings Form Input | `/app/website/app/templates/wifi_settings.html:94-112` | Form fields (ssid, password, security) exist but are never processed server-side. No `request.form` access. | SAFE (unused inputs) |
| Internal Device API | `/app/internal/app/routes.py` (all endpoints) | Internal API receives requests but does not make outbound requests. No HTTP clients used. | SAFE (request receiver, not maker) |
| Database Operations | All `User.query.filter_by()` calls | Uses SQLAlchemy ORM with parameterized queries. No raw SQL with URL concatenation. | SAFE (no SQL-based SSRF) |
| Template Rendering | All `render_template()` calls | Uses static template names. `render_template_string` imported but never used. No dynamic template construction. | SAFE (no SSTI to SSRF) |
| Redirect Logic | `/app/website/app/routes.py:50, 74, 85` | Uses `url_for()` with static route names. No user-controlled redirect URLs. | SAFE (no open redirect to SSRF) |

### Why No HTTP Client Libraries is Actually Secure

**Finding:** The application uses subprocess curl instead of Python HTTP client libraries (requests, urllib, httplib).

**Security Implication:** While subprocess execution is generally considered less secure than using proper libraries, in this specific case:
1. The list format prevents shell injection
2. Hardcoded parameters prevent SSRF
3. No library imports means less attack surface for library-specific vulnerabilities
4. No URL parsing logic that could be bypassed

**Verdict:** The lack of HTTP client libraries is a **net security positive** in this application's threat model.

## 5. Analysis Methodology Applied

### Backward Taint Analysis Process

For the identified SSRF sink at routes.py:132-134, I applied systematic backward taint analysis:

**Step 1: Sink Identification**
- Located subprocess.run() call executing curl
- Identified as potential SSRF sink due to HTTP client execution

**Step 2: Backward Tracing**
- Traced each component of curl_command list:
  - `'curl'` → hardcoded binary name → **SAFE**
  - `'-v'` → hardcoded flag → **SAFE**
  - `'-s'` → hardcoded flag → **SAFE**
  - `'http://haproxy:8001/devices/wifi_chipset/status'` → hardcoded URL → **SAFE**
  - `'-H'` → hardcoded flag → **SAFE**
  - `'Host: internal.router'` → hardcoded header → **SAFE**

**Step 3: Source Identification**
- Checked for user input sources:
  - `request.form` - Used only in /login endpoint for credentials
  - `request.args` - Checked in /login for debug parameter (commented out)
  - `request.json` - Never accessed
  - `request.headers` - Only accessed implicitly by Flask
  - Database queries - No URL retrieval from database
  - Session data - Only contains username, password_hash, user_id, session_id

**Result:** No source-to-sink path exists with user-controlled data

**Step 4: Mutation Analysis**
- Verified no string concatenation after curl_command definition
- Verified no conditional logic modifying the command
- Verified no variable assignments that could be influenced by user input

**Step 5: Sanitization Check**
- **N/A** - No user input reaches the sink, so sanitization is not required

**Verdict:** **SAFE** - Complete source-to-sink isolation

### Validation and Protocol Restriction Analysis

**Protocol Scheme Validation:**
- **Status:** Not implemented
- **Reason:** URL is hardcoded to `http://`, no user control possible
- **Risk:** If user input were added, dangerous schemes (file://, gopher://, dict://) would not be blocked

**Hostname and IP Validation:**
- **Status:** Not implemented  
- **Reason:** Hostname `haproxy` is hardcoded, no user control possible
- **Risk:** If user input were added, internal IPs (127.0.0.1, 169.254.169.254) would not be blocked

**Port Restriction:**
- **Status:** Not implemented
- **Reason:** Port `8001` is hardcoded, no user control possible
- **Risk:** If user input were added, arbitrary port scanning would be possible

**Verdict:** While validation mechanisms are absent, they are not needed in the current implementation due to hardcoded parameters.

### Comprehensive Codebase Search Results

**Search Scope:** 
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/website/app/`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-066-24/app/internal/app/`

**Patterns Searched (All Negative Results):**

| Category | Patterns | Findings |
|----------|----------|----------|
| HTTP Clients | `import requests`, `import urllib`, `import httplib`, `import aiohttp` | 0 |
| URL Operations | `urlopen(`, `urllib.request`, `fetch(`, `.get(http`, `.post(http` | 0 |
| Subprocess | `subprocess.call(`, `subprocess.Popen(`, `os.system(`, `os.popen(` | 0 (only subprocess.run found) |
| Shell Mode | `shell=True` | 0 |
| Webhook/Callback | `webhook_url`, `callback_url`, `redirect_uri`, `fetch_url` | 0 |
| Image/File URLs | `PIL.Image.open(`, `cv2.imread(`, `open(http` | 0 |
| Dynamic Code | `eval(`, `exec(`, `compile(`, `__import__` | 0 |
| Network Sockets | `import socket`, `import dns`, `import paramiko`, `import ftplib` | 0 |
| SSTI | `render_template_string(` usage | 0 (imported but never called) |

**Total SSRF Sinks Found:** 1 (subprocess curl)
**Total Exploitable SSRF Sinks:** 0

## 6. What Would Make This Vulnerable

To illustrate the security boundary, here are hypothetical code changes that would introduce SSRF:

### Hypothetical Vulnerable Scenario 1: Form Input Processing

**Vulnerable Code (NOT in application):**
```python
@app.route('/wifi_settings', methods=['GET', 'POST'])
def wifi_settings():
    try:
        sess = verify_session()
    except SessionError as e:
        return render_template('login.html', error=e.message)
    
    # HYPOTHETICAL VULNERABLE CODE:
    device = request.form.get('device', 'wifi_chipset')  # ← User input
    url = f'http://haproxy:8001/devices/{device}/status'  # ← String interpolation
    
    curl_command = ['curl', '-v', '-s', url, '-H', 'Host: internal.router']
    result = subprocess.run(curl_command, capture_output=True, text=True)
    error_response = (result.stderr + result.stdout)
    
    # ... rest of code
```

**Exploitation:**
```http
POST /wifi_settings HTTP/1.1
Host: localhost:38539
Cookie: session=<valid_session>
Content-Type: application/x-www-form-urlencoded

device=flag
```

**Result:** Attacker retrieves flag from `/devices/flag/status` endpoint

### Hypothetical Vulnerable Scenario 2: URL Parameter Processing

**Vulnerable Code (NOT in application):**
```python
@app.route('/wifi_settings', methods=['GET', 'POST'])
def wifi_settings():
    try:
        sess = verify_session()
    except SessionError as e:
        return render_template('login.html', error=e.message)
    
    # HYPOTHETICAL VULNERABLE CODE:
    target_url = request.args.get('url', 'http://haproxy:8001/devices/wifi_chipset/status')
    
    curl_command = ['curl', '-v', '-s', target_url, '-H', 'Host: internal.router']
    result = subprocess.run(curl_command, capture_output=True, text=True)
    error_response = (result.stderr + result.stdout)
    
    # ... rest of code
```

**Exploitation:**
```http
GET /wifi_settings?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/ HTTP/1.1
Host: localhost:38539
Cookie: session=<valid_session>
```

**Result:** Attacker retrieves cloud metadata and IAM credentials

### Hypothetical Vulnerable Scenario 3: Host Header Processing

**Vulnerable Code (NOT in application):**
```python
@app.route('/wifi_settings', methods=['GET', 'POST'])
def wifi_settings():
    try:
        sess = verify_session()
    except SessionError as e:
        return render_template('login.html', error=e.message)
    
    # HYPOTHETICAL VULNERABLE CODE:
    target_host = request.form.get('target_host', 'internal.router')
    
    curl_command = ['curl', '-v', '-s', 'http://haproxy:8001/devices/wifi_chipset/status', 
                   '-H', f'Host: {target_host}']
    result = subprocess.run(curl_command, capture_output=True, text=True)
    error_response = (result.stderr + result.stdout)
    
    # ... rest of code
```

**Exploitation:**
```http
POST /wifi_settings HTTP/1.1
Host: localhost:38539
Cookie: session=<valid_session>
Content-Type: application/x-www-form-urlencoded

target_host=attacker-controlled.com
```

**Result:** Attacker can route internal requests to external servers for DNS rebinding attacks

## 7. Testing Performed

### Black-Box Testing via Browser Interaction

I accessed the live application at http://localhost:38539 to verify the behavior of the `/wifi_settings` endpoint:

**Test 1: Form Submission Verification**
- Authenticated with `test:test` credentials
- Navigated to `/wifi_settings` endpoint
- Observed WiFi configuration form with SSID, password, and security fields
- Submitted form with arbitrary values
- Confirmed: Form submission returns hardcoded error message regardless of input values
- Confirmed: Subprocess output is displayed in a modal dialog

**Test 2: Response Content Analysis**
- Analyzed the subprocess output displayed in the modal
- Observed verbose curl connection details including HTTP headers
- Confirmed URL is `http://haproxy:8001/devices/wifi_chipset/status`
- Confirmed Host header is `internal.router`
- Confirmed backend returns HTTP 500 error (WiFi chipset boot failure)

**Test 3: Parameter Injection Attempts**
- Attempted to inject URL parameters: `/wifi_settings?url=...`, `/wifi_settings?device=...`
- Observed: No change in subprocess output, parameters completely ignored
- Attempted to inject form fields with SSRF payloads in SSID field
- Observed: Form data not processed, no impact on curl command

**Conclusion:** Black-box testing confirmed that no user input influences the subprocess curl execution.

### Static Code Analysis

Performed comprehensive static analysis of all Python files:
- Analyzed 2 Flask applications (website and internal)
- Reviewed 15 HTTP endpoints
- Searched for 25+ SSRF-related patterns
- Traced data flow for all `subprocess.run()` calls
- Verified absence of HTTP client libraries

**Tools Used:**
- Manual code review via Read tool
- Pattern matching via Grep tool
- Comprehensive file enumeration via Glob tool

## 8. External Attack Surface Conclusion

**EXTERNAL ATTACKER SCOPE ASSESSMENT:**

All findings in this report were evaluated against the criterion: "Only report vulnerabilities exploitable via http://localhost:38539 from the internet."

**Result:** **ZERO exploitable SSRF vulnerabilities** meet the external attacker scope criteria.

**Rationale:**
- The single SSRF sink identified uses completely hardcoded parameters
- No user input from HTTP requests influences outbound request construction
- No URL parameters, form fields, headers, or cookies affect the curl command
- The information disclosure aspect (subprocess output visibility) requires authentication but does not constitute SSRF exploitation

**Note on Information Disclosure:**
While the `/wifi_settings` endpoint discloses internal network topology and service responses to authenticated users, this is the **intended functionality** (displaying WiFi chipset status). An attacker cannot leverage this to force requests to arbitrary targets, making it an information disclosure concern rather than an SSRF vulnerability.

## 9. Recommendations for Future Code Changes

If developers modify the `/wifi_settings` endpoint to process form inputs or add new features, they should implement:

1. **Strict URL Allowlisting:** If URLs become user-controllable, implement an allowlist of permitted internal endpoints
2. **Protocol Validation:** Restrict to `http://` and `https://` schemes only
3. **Hostname Validation:** Block requests to localhost, internal IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), and cloud metadata endpoints (169.254.169.254)
4. **Port Restrictions:** Limit to standard HTTP ports (80, 443, 8001, 8080)
5. **Replace subprocess with Python requests library:** Use `requests` library with proper URL validation instead of subprocess curl
6. **Remove verbose flag:** Change `-v` to reduce information disclosure in output
7. **Implement request logging:** Log all outbound requests with source user for audit trail
8. **Add network segmentation:** Restrict the admin_router container's network access via Docker network policies

## 10. Summary

**Analysis Completeness:** ✅ **COMPLETE**
- All Flask endpoints analyzed
- All subprocess execution patterns reviewed  
- All HTTP client library usage verified (none found)
- All user input vectors traced
- Backward taint analysis completed for identified sink

**Vulnerability Count:** **0 exploitable SSRF vulnerabilities**

**Key Finding:** The application's single SSRF sink is **secure by hardcoding** - all parameters are static strings with no user input influence. This represents a fragile security pattern that could become vulnerable with minor code changes.

**Risk Level:** **LOW** - Current implementation poses no SSRF risk to external attackers. Internal information disclosure exists but requires authentication and is limited to intended functionality.

---

**END OF SSRF ANALYSIS REPORT**