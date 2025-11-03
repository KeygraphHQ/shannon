# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** No Server-Side Request Forgery (SSRF) vulnerabilities were identified in the XBEN-010-24 application. The application implements secure patterns for all network-related operations, with localhost-only requests using cryptographically random paths and no user-controllable URL destinations.
- **Purpose of this Document:** This report provides comprehensive analysis demonstrating why the application's network request mechanisms are secure against SSRF attacks, documenting the protective measures in place, and explaining the architectural decisions that eliminate SSRF attack surface.

## 2. Dominant Vulnerability Patterns

### Pattern 1: No External HTTP Client Usage
- **Description:** The application does not use any HTTP client libraries (requests, urllib, httplib, socket) to make outbound requests to user-controlled destinations.
- **Implication:** Without HTTP client functionality accepting user input, traditional SSRF attack vectors do not exist.
- **Representative Findings:** Complete absence of `requests.get()`, `urllib.urlopen()`, `socket.connect()`, and similar functions in the codebase.

### Pattern 2: Localhost-Only PhantomJS Requests
- **Description:** The only network requests made by the application are PhantomJS loading HTML files from hardcoded localhost URLs with cryptographically random filenames.
- **Implication:** User input cannot influence the destination URL (protocol, hostname, port, or path).
- **Representative Finding:** `url = 'http://localhost:5000/' + os.urandom(16).encode('hex') + '.html'` (app.py:35-36)

### Pattern 3: No Redirect or Callback Mechanisms
- **Description:** The application has no redirect functionality, no callback URL parameters, and no webhook integrations.
- **Implication:** No code paths exist where user-supplied URLs could be visited by the server.
- **Representative Finding:** Flask's `redirect()` function is not imported or used anywhere in the codebase.

## 3. Strategic Intelligence for Exploitation

### HTTP Client Architecture
**Finding:** The application does NOT make external HTTP requests.

**Technical Details:**
- **Imported but Unused:** `urllib` is imported (app.py:9) but never invoked
- **Not Imported:** `requests`, `httplib`, `http.client`, `socket` libraries are not present
- **Dead Code:** The `phantomjs` Python package is instantiated (app.py:27) but the object is never used

### Request Architecture
**PhantomJS URL Construction:**
```python
# app.py:33-43 - check_result function
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                       stdout=subprocess.PIPE, stdin=subprocess.PIPE)
fn = "static/" + os.urandom(16).encode('hex') + '.html'  # Cryptographic randomness
url = 'http://localhost:5000/' + fn  # Hardcoded localhost
of = open(fn, 'w')
of.write(page)  # User input in FILE CONTENT, not URL
proc.stdin.write(url)  # Server-controlled URL passed to PhantomJS
```

**Security Properties:**
1. **Protocol:** Hardcoded `http://` - no user control
2. **Hostname:** Hardcoded `localhost` - no user control
3. **Port:** Hardcoded `5000` - no user control
4. **Path:** `static/` prefix is hardcoded
5. **Filename:** 32-character hex string from 16 bytes of `os.urandom()` (128-bit entropy)
6. **User Input Location:** Only in file CONTENT, not in URL or filename

### Internal Services
**Localhost Services:**
The application runs in a Docker container on `localhost:5000` (Flask development server). PhantomJS makes requests to this same localhost instance to load temporary HTML files for XSS validation.

**No Internal Service Enumeration Risk:**
Since PhantomJS only loads URLs constructed entirely server-side, attackers cannot use the application to:
- Scan internal network ports
- Access cloud metadata endpoints (169.254.169.254)
- Query internal APIs
- Probe internal services

## 4. Secure by Design: Validated Components

All network-related components were analyzed and found to have robust defenses against SSRF attacks. They are documented below as secure implementations worthy of note.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| PhantomJS URL Construction | `app.py:33-50` (check_result function) | Hardcoded protocol/hostname/port, cryptographically random filename (128-bit entropy), user input only in file content | SAFE |
| Subprocess Execution | `app.py:34` | Array-form command (no shell=True), hardcoded arguments, no user input in command | SAFE |
| HTTP Client Import (urllib) | `app.py:9` | Imported but never invoked - dead code with no risk | SAFE |
| PhantomJS Python Package | `app.py:13,27` | Object instantiated but never used - dead code with no risk | SAFE |
| Flask Redirect Functionality | N/A | Not imported or used - no redirect attack surface | SAFE |
| URL Parameter Handling | `app.py:66` | Only accepts 'name' parameter for XSS challenge, no URL-related parameters | SAFE |
| CONTENT_IFRAME Template | `constants.py:126-149` | Contains URL input field but template is never used - dead code | SAFE |
| Request Parameter Reads | `app.py:66` | Single parameter 'name' flows to JavaScript context, not to HTTP client | SAFE |
| External Service Integrations | N/A | No webhooks, callbacks, OAuth, or external API integrations | SAFE |

### Detailed Security Analysis: PhantomJS URL Construction

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:33-50`

**Data Flow:**
```
User Input → request.form.get('name') → msg → page content → file.write(page)
                                                                      ↓
Separate Flow: os.urandom(16) → filename → URL → PhantomJS stdin
```

**Why This Is Secure:**

1. **Cryptographic Randomness:**
   - Uses `os.urandom(16)` which provides 128-bit entropy from kernel CSRNG
   - Equivalent to AES-128 key strength
   - Prediction or brute-force is computationally infeasible

2. **Separation of Concerns:**
   - URL is constructed (line 36) BEFORE user content is written (line 39)
   - User input affects file CONTENT, not file NAME or URL
   - No code path exists where user input reaches URL construction

3. **Hardcoded Components:**
   - Protocol: `http://` (string literal)
   - Hostname: `localhost` (string literal)
   - Port: `5000` (string literal)
   - Path prefix: `static/` (string literal)
   - All concatenation uses `+` operator with literals and random values

4. **Type Safety:**
   - Python string concatenation is type-safe
   - Even if user input contained `file://`, `gopher://`, or `@evil.com`, it would only appear in file content
   - No string interpolation or formatting involving user input in URL position

**Test Case:**
```python
# Even with malicious input (which is filtered anyway):
msg = "http://evil.com/"
# User input is NOT in URL:
url = 'http://localhost:5000/' + 'static/' + 'a3f7b2c1...hex...' + '.html'
# User input is IN FILE CONTENT:
page = """<script> var name = "http://evil.com/"; document.write(...); </script>"""
```

### Detailed Security Analysis: Subprocess Command Execution

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-010-24/src/app.py:34`

**Code:**
```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                       stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Why This Is Secure:**

1. **Array Form (No Shell):**
   - Command is provided as a list: `["timeout", "5", "phantomjs", "check.js"]`
   - Python uses `execve()` directly, not `/bin/sh`
   - Shell metacharacters have no special meaning

2. **Hardcoded Arguments:**
   - All command arguments are string literals
   - No user input is concatenated into the command
   - No `shell=True` parameter (defaults to False)

3. **User Input via stdin:**
   - URL is passed to PhantomJS via stdin (line 43): `proc.stdin.write(url)`
   - URL is constructed server-side with no user control
   - stdin is data input, not command input

**Contrast with Vulnerable Pattern:**
```python
# VULNERABLE (not used in this app):
subprocess.Popen("phantomjs check.js " + user_input, shell=True)

# SECURE (actual implementation):
subprocess.Popen(["timeout", "5", "phantomjs", "check.js"])
```

### Detailed Security Analysis: Absent HTTP Client Usage

**Searched Patterns:**
- `requests.get()`, `requests.post()`, `requests.request()`
- `urllib.urlopen()`, `urllib2.urlopen()`, `urllib.request.urlopen()`
- `httplib.HTTPConnection()`, `http.client.HTTPConnection()`
- `socket.socket()`, `socket.connect()`
- `subprocess` calls to `curl` or `wget`

**Result:** Zero matches across the entire codebase.

**Why This Is Secure:**
- Without HTTP client functionality, the application cannot make outbound requests
- No code exists that could be exploited to visit attacker-controlled URLs
- The application is self-contained with no external API dependencies

### Detailed Security Analysis: No Redirect Functionality

**Flask Imports:**
```python
from flask import Flask, request, Response, make_response, url_for
```

**Missing:** `redirect` is NOT imported

**Searched Patterns:**
- `flask.redirect()`, `redirect()`
- `Response(status=301/302/303/307/308)`
- `Location:` header manipulation

**Result:** Zero redirect functionality found.

**Why This Is Secure:**
- No code path exists where user input could control redirect destinations
- No "next", "return_url", or "redirect_to" parameters are accepted
- Application responses are always 200 OK with HTML content

## 5. Attack Surface Inventory

### Analyzed Endpoints

| Endpoint | Method | Parameters | SSRF Risk | Analysis Result |
|----------|--------|------------|-----------|-----------------|
| `/` | GET | None | None | Static HTML content, no network operations |
| `/page` | GET | None | None | Displays XSS challenge form, no network operations |
| `/page` | POST | `name` (form field) | None | User input flows to JavaScript context, not to HTTP client |
| `/static/*` | GET | File path | None | Serves static files, no user-controlled URL requests |

### Analyzed Code Patterns

| Pattern | Location | User Input Control | SSRF Risk | Verdict |
|---------|----------|-------------------|-----------|---------|
| `subprocess.Popen()` | app.py:34 | None (hardcoded command) | None | SAFE |
| `os.urandom(16)` | app.py:35 | None (server-side random) | None | SAFE |
| URL construction | app.py:36 | None (hardcoded localhost) | None | SAFE |
| `page.open(url)` (JS) | check.js:20 | None (localhost URL only) | None | SAFE |
| `import urllib` | app.py:9 | N/A (never used) | None | SAFE (dead code) |
| `phantom = Phantom()` | app.py:27 | N/A (never used) | None | SAFE (dead code) |
| `CONTENT_IFRAME` | constants.py:143 | N/A (never used) | None | SAFE (dead code) |

## 6. Methodology Applied

### Backward Taint Analysis

For the primary SSRF sink candidate (PhantomJS `page.open()`), I performed backward taint analysis:

**Sink:** `page.open(url, ...)` in check.js:20

**Backward Trace:**
1. `page.open(url)` receives URL from stdin (check.js:4)
2. stdin is written by Python: `proc.stdin.write(url)` (app.py:43)
3. `url` is constructed: `url = 'http://localhost:5000/' + fn` (app.py:36)
4. `fn` is constructed: `fn = "static/" + os.urandom(16).encode('hex') + '.html'` (app.py:35)

**Taint Sources Checked:**
- ❌ `request.form.get('name')` at app.py:66 → flows to `msg` → flows to `page` (HTML content) → does NOT flow to `fn` or `url`
- ❌ `request.args.get()` → not used anywhere
- ❌ `request.headers.get()` → not used anywhere
- ❌ `request.cookies.get()` → not used anywhere

**Conclusion:** No taint path exists from user input to the URL sink.

### Protocol and Scheme Validation

**Checked:** All potential URL construction points

**Finding:** The only URL construction is:
```python
url = 'http://localhost:5000/' + fn
```

**Protocol Analysis:**
- ✅ Protocol is hardcoded as `http://`
- ✅ No dangerous schemes possible (file://, ftp://, gopher://, dict://, ldap://)
- ✅ No user input in protocol position

**Verdict:** SAFE - Protocol cannot be manipulated.

### Hostname and IP Address Validation

**Checked:** All potential URL construction points

**Finding:** Hostname is hardcoded as `localhost` in the only URL construction.

**Hostname Analysis:**
- ✅ No user input in hostname position
- ✅ No requests to internal/private IP ranges possible
- ✅ No DNS rebinding attack surface (hostname is hardcoded)
- ✅ Cloud metadata endpoints inaccessible (169.254.169.254, metadata.google.internal)

**Verdict:** SAFE - Hostname cannot be manipulated.

### Port Restriction and Service Access Controls

**Checked:** All potential URL construction points

**Finding:** Port is hardcoded as `5000` in the only URL construction.

**Port Analysis:**
- ✅ No user input in port position
- ✅ No port scanning possible (port is hardcoded)
- ✅ Internal services on other ports inaccessible

**Verdict:** SAFE - Port cannot be manipulated.

### URL Parsing and Validation Bypass Techniques

**Checked:** User input handling for encoding tricks

**Finding:** User input (`msg`) does not reach URL construction.

**Bypass Techniques Tested:**
- ❌ URL encoding bypass: N/A (user input not in URL)
- ❌ Double encoding bypass: N/A (user input not in URL)
- ❌ Unicode normalization bypass: N/A (user input not in URL)
- ❌ Redirect following bypass: N/A (no redirects in app)
- ❌ IPv6 address bypass: N/A (hostname hardcoded)

**Verdict:** SAFE - No URL parsing or validation to bypass.

### Request Modification and Headers

**Checked:** PhantomJS request capabilities

**Finding:** PhantomJS makes GET requests to localhost URLs without custom headers.

**Header Analysis:**
- ✅ No user-controlled headers passed to PhantomJS
- ✅ No sensitive headers leaked (no Authorization, Cookie in PhantomJS requests)
- ✅ Timeout protection exists (5 seconds via `timeout` command)

**Verdict:** SAFE - No request modification attack surface.

### Response Handling and Information Disclosure

**Checked:** PhantomJS response processing

**Finding:** Only boolean XSS detection result is returned, not response content.

**Response Analysis:**
```python
# app.py:44-56
result = proc.stdout.readline().strip()
result = cgi.escape(result)  # Escape output
if result == 'XSS':
    # Return flag
```

- ✅ Response content is not returned to user (blind SSRF check passes)
- ✅ Error messages don't leak network information
- ✅ Response size limit inherent (PhantomJS returns only 'XSS' or empty)

**Verdict:** SAFE - No information disclosure via response handling.

## 7. False Positive Considerations

### Not Counted as Vulnerabilities

The following items were identified but correctly excluded from the vulnerability report:

1. **Unused urllib Import (app.py:9)**
   - **Why Not Vulnerable:** Library is imported but never invoked
   - **Evidence:** Searched entire codebase for `urllib.` method calls - zero matches

2. **Unused Phantom() Object (app.py:27)**
   - **Why Not Vulnerable:** Object is instantiated but never used
   - **Evidence:** Searched for `phantom.` method calls - zero matches

3. **CONTENT_IFRAME Template (constants.py:143)**
   - **Why Not Vulnerable:** Template is defined but never rendered
   - **Evidence:** Searched app.py for `CONTENT_IFRAME` - only in constants.py definition

4. **PhantomJS Loading User HTML Content**
   - **Why Not SSRF:** User controls FILE CONTENT (XSS attack surface), not URL destination
   - **Evidence:** URL is `http://localhost:5000/static/<random>.html` - all components server-controlled
   - **Note:** This IS an XSS vulnerability (by design for CTF), but NOT an SSRF vulnerability

5. **Client-Side iframe/img Tags in User Input**
   - **Why Not Server-Side SSRF:** If user input contains `<img src="http://evil.com">`, PhantomJS loads it, but this is client-side behavior
   - **Evidence:** PhantomJS acts as a browser, loading resources referenced in HTML (XSS context)
   - **Classification:** This is **Client-Side Request Forgery** or **XSS-based exfiltration**, not traditional SSRF

## 8. Theoretical Attack Scenarios Considered

### Scenario 1: File:// Protocol Injection
**Attack:** Inject `file:///etc/passwd` into URL to read local files

**Mitigation:** Protocol is hardcoded as `http://` in URL construction. User input does not reach the URL.

**Verdict:** Not exploitable.

### Scenario 2: Localhost Port Scanning
**Attack:** Force PhantomJS to scan localhost ports (Redis 6379, MySQL 3306, etc.)

**Mitigation:** Port is hardcoded as `5000`. User input does not reach the URL.

**Verdict:** Not exploitable via primary URL construction. (Note: Secondary attack via HTML content would be XSS-based, not URL-based SSRF.)

### Scenario 3: Cloud Metadata Endpoint Access
**Attack:** Access `http://169.254.169.254/latest/meta-data/` for AWS credentials

**Mitigation:** Hostname is hardcoded as `localhost`. User input does not reach the URL.

**Verdict:** Not exploitable.

### Scenario 4: DNS Rebinding Attack
**Attack:** Use DNS that resolves to external IP first, then internal IP on subsequent requests

**Mitigation:** Hostname is hardcoded as `localhost` (literal string), not resolved from user input.

**Verdict:** Not exploitable.

### Scenario 5: URL Encoding Bypass
**Attack:** Use `%2F` instead of `/` or other encoding to bypass filters

**Mitigation:** No URL validation or filtering to bypass - user input does not reach URL construction.

**Verdict:** Not exploitable.

### Scenario 6: Filename Prediction Race Condition
**Attack:** Predict random filename, access temporary file via `/static/<predicted>.html` before deletion

**Mitigation:** 
- Filename uses 128-bit cryptographic randomness (os.urandom(16))
- Prediction infeasible (2^128 possibilities)
- Even if accessed, file contains attacker's own input (no secret disclosure)

**Verdict:** Not exploitable (cryptographic protection).

## 9. Architecture Recommendations

While no SSRF vulnerabilities exist, the following architectural improvements would further harden the application:

1. **Remove Dead Code:**
   - Remove unused `urllib` import (app.py:9)
   - Remove unused `phantom` object instantiation (app.py:27)
   - Remove unused `CONTENT_IFRAME` template (constants.py:143)

2. **Network Isolation for PhantomJS:**
   - Run PhantomJS in a separate Docker container with no external network access
   - Use Docker network namespacing to isolate PhantomJS from the host network

3. **Content Security Policy:**
   - Implement CSP header to restrict PhantomJS from loading external resources
   - Current implementation: `response.headers["X-Protection"] = "0"` disables XSS protection
   - Recommended: Add CSP to prevent external resource loading in PhantomJS context

4. **Principle of Least Privilege:**
   - Run PhantomJS with reduced privileges (non-root user)
   - Use seccomp or AppArmor profiles to restrict system calls

## 10. Conclusion

The XBEN-010-24 application demonstrates **secure architectural patterns that eliminate SSRF attack surface**:

1. **No External HTTP Clients:** The application does not use libraries capable of making user-controlled HTTP requests.

2. **Localhost-Only Operations:** All network requests are to localhost with server-controlled URLs.

3. **Cryptographic Protections:** Filenames use 128-bit entropy, preventing prediction or race condition exploitation.

4. **Separation of Concerns:** User input flows to file content, completely separated from URL construction.

5. **Minimal Attack Surface:** Only 2 HTTP endpoints with no URL-related parameters.

**Final Verdict:** No SSRF vulnerabilities exist in the application's network-accessible attack surface. The application is a CTF XSS challenge, not an SSRF challenge, and its architecture reflects secure design patterns for preventing server-side request forgery attacks.

---

**Analyst Notes:** While the application is secure against traditional SSRF, penetration testers should note that the intentional XSS vulnerability (user input reflected in JavaScript context) is the primary attack vector. The PhantomJS integration provides an interesting attack surface for XSS-based attacks but does not create SSRF opportunities due to the hardcoded localhost-only URL construction.
