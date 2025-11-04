# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** No SSRF vulnerabilities were identified. The application makes outbound HTTP requests via PhantomJS, but all destination URLs are constructed from hardcoded values and cryptographically random data, with no user control over protocol, hostname, port, or path components.
- **Purpose of this Document:** This report documents the systematic analysis of all potential SSRF attack vectors in the application, explaining why the application's architecture effectively prevents server-side request forgery attacks despite making outbound HTTP requests.

## 2. Dominant Vulnerability Patterns

### Pattern 1: No URL Construction from User Input
- **Description:** The application does not construct URLs from user-controllable input. The only outbound request (PhantomJS page.open()) uses URLs built entirely from hardcoded components and cryptographically random filenames.
- **Implication:** Without user control over destination URLs, SSRF attacks cannot be executed.
- **Representative Finding:** PhantomJS URL construction at `src/app.py:36` uses `'http://localhost:5000/' + os.urandom(16).encode('hex') + '.html'`

### Pattern 2: User Input Limited to Content, Not Destination
- **Description:** User input from the `name` query parameter affects the HTML content written to files, but does not influence where those files are located or how they are accessed over the network.
- **Implication:** User input creates XSS vulnerabilities (intended for this CTF challenge) but cannot redirect server-side requests to attacker-controlled destinations.
- **Representative Finding:** Data flow at `src/app.py:65-69` shows user input flows into HTML content, not URL construction.

## 3. Strategic Intelligence for Exploitation

### HTTP Client Architecture
- **Primary Client:** PhantomJS 2.1.1 headless browser
- **Invocation Method:** subprocess.Popen() at `src/app.py:34`
- **URL Source:** Hardcoded localhost URLs constructed at runtime
- **HTTP Client Libraries:** urllib imported but never used; no requests, httplib, or other HTTP clients present

### Request Patterns
- **PhantomJS Request Flow:**
  1. Flask app generates random filename: `fn = "static/" + os.urandom(16).encode('hex') + '.html'`
  2. Constructs localhost URL: `url = 'http://localhost:5000/' + fn`
  3. Writes user-controlled HTML content to local file
  4. Passes URL to PhantomJS via stdin
  5. PhantomJS opens the localhost URL
  6. HTML content (including user input) is rendered
  7. XSS detection occurs via alert() capture

### Internal Services
- **Target:** localhost:5000 (self-referential, same Flask application)
- **Network Scope:** All PhantomJS requests are to localhost only
- **No External Requests:** Application makes zero requests to external hosts or internal network services

## 4. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses against SSRF. They are NOT vulnerable and should be excluded from exploitation efforts.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| PhantomJS URL Construction | `src/app.py:36` | Hardcoded protocol (http://), hostname (localhost), and port (5000). Filename generated with os.urandom(16) providing 128 bits of entropy. No user input in URL construction. | SAFE |
| Subprocess Invocation | `src/app.py:34` | Command arguments fully hardcoded as list: `["timeout","5","phantomjs", "check.js"]`. User input only reaches stdin (not command arguments), and stdin receives hardcoded localhost URL. | SAFE |
| urllib Module | `src/app.py:9` | Imported but completely unused throughout codebase. No urlopen() calls, no request construction, no network operations. Dead import with no security impact. | SAFE |
| Static File Serving | Flask default `/static/<path:filename>` | Serves local files only. No remote URL fetching. User input (name parameter) affects file content but not file location or access pattern. | SAFE |
| File Operations | `src/app.py:38-40, 50` | Only local file writes (open/write/close) and deletion (os.unlink). No remote resource loading. Filenames are cryptographically random, not user-controlled. | SAFE |

## 5. Detailed Analysis of Potential SSRF Vectors

### 5.1 PhantomJS page.open() Analysis

**Location:** `src/check.js:20`

**Code:**
```javascript
page.open(input, function(status) {
```

**URL Construction Trace:**
1. **Generation (app.py:35):** `fn = "static/" + os.urandom(16).encode('hex') + '.html'`
2. **URL Assembly (app.py:36):** `url = 'http://localhost:5000/' + fn`
3. **Stdin Delivery (app.py:43):** `proc.stdin.write(url)`
4. **PhantomJS Receipt (check.js:4):** `var input = system.stdin.readLine();`
5. **Page Load (check.js:20):** `page.open(input, function(status) {...`

**User Input Analysis:**
- **Entry Point:** `msg = request.args.get('name','')` at app.py:65
- **Sanitization:** `msg = re.sub(r"""script""", "", msg)` at app.py:66 (removes lowercase "script")
- **Destination:** Formatted into HTML value attribute at app.py:67
- **File Content:** Written to `static/[random].html` at app.py:38-40
- **Network Impact:** User input affects HTML content PhantomJS renders, NOT the URL PhantomJS opens

**Can User Input Influence Network Destination?**

| Component | User Controllable? | Evidence |
|-----------|-------------------|----------|
| Protocol (http://) | **NO** | Hardcoded string literal at app.py:36 |
| Hostname (localhost) | **NO** | Hardcoded string literal at app.py:36 |
| Port (5000) | **NO** | Hardcoded string literal at app.py:36 |
| Path (/static/) | **NO** | Hardcoded string literal at app.py:35 |
| Filename | **NO** | Generated via os.urandom(16) - 128 bits entropy |
| File Content | **YES** | User's `name` parameter written into HTML |

**Verdict:** SAFE - No SSRF vulnerability. User input controls what's IN the HTML file, not WHERE PhantomJS navigates to.

**Confidence:** High - Direct code review confirms URL construction is entirely from trusted sources.

---

### 5.2 HTTP Client Library Usage

**Analysis:** Searched for all Python HTTP client libraries:
- **urllib:** Imported at app.py:9 but never used (no `urllib.` references in codebase)
- **requests:** Not imported, not present in requirements.txt
- **httplib/httplib2:** Not present
- **urllib3:** Not present
- **socket:** Not used for HTTP operations

**Verdict:** SAFE - No HTTP client libraries are actively used to make requests.

**Confidence:** High - Comprehensive search of imports and usage patterns.

---

### 5.3 Subprocess Command Execution

**Location:** `src/app.py:34`

**Code:**
```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Security Analysis:**
- **Argument Format:** List (not string with shell=True) - prevents shell injection
- **Arguments:** All hardcoded: `["timeout","5","phantomjs", "check.js"]`
- **User Input Path:** User input reaches stdin only (line 43), not command arguments
- **Stdin Content:** Hardcoded localhost URL (analyzed above in 5.1)

**Network Utilities Check:**
- No curl invocation
- No wget invocation
- No nc/netcat usage
- No other network tools in subprocess calls

**Verdict:** SAFE - Command arguments are hardcoded and user input cannot influence network destinations via stdin.

**Confidence:** High - List-based subprocess invocation with no user input in arguments.

---

### 5.4 File Operations and Remote Resource Loading

**Analysis:** Searched for patterns that fetch remote resources:
- **requests.get() with URLs:** Not present
- **urllib.urlopen():** Not present
- **PIL/Pillow URL loading:** No PIL/Pillow imports
- **cv2.imread() with URLs:** No cv2/OpenCV imports
- **Image processing:** No image libraries present

**File Operations Found:**
- **Write:** `open(fn, 'w')` at app.py:38 - local file only
- **Delete:** `os.unlink(fn)` at app.py:50 - local file only
- **Read:** `open('secret.txt').read()` at app.py:22 - local file only

**Verdict:** SAFE - Only local file operations. No remote resource fetching.

**Confidence:** High - No URL-based file loading libraries present.

---

### 5.5 URL Parameter Processing

**Endpoint:** `GET /page?name=<input>`

**Data Flow:**
```
1. USER REQUEST
   GET /page?name=<USER_INPUT>

2. EXTRACTION (app.py:65)
   msg = request.args.get('name','')

3. SANITIZATION (app.py:66)
   msg = re.sub(r"""script""", "", msg)  # Weak XSS filter

4. VALUE FORMATTING (app.py:67)
   value = 'value="{0}"'.format(msg)

5. HTML TEMPLATE (app.py:69)
   data = CHALLENGE_CONTENT.format("3", "Circle", value, "", "")

6. FILE CREATION (app.py:38-40)
   fn = "static/" + os.urandom(16).encode('hex') + '.html'  # Random filename
   url = 'http://localhost:5000/' + fn                       # Hardcoded URL
   of.write(page)  # User input written to HTML content

7. PHANTOMJS (app.py:43, check.js:20)
   proc.stdin.write(url)  # Hardcoded localhost URL sent
   page.open(input, ...)   # PhantomJS opens localhost
```

**Network Impact Analysis:**
- User input flows into HTML content (XSS vector)
- User input does NOT flow into URL construction
- User input does NOT flow into hostname/IP resolution
- User input does NOT flow into port selection
- User input does NOT flow into protocol selection

**Verdict:** SAFE for SSRF (vulnerable to XSS by design)

**Confidence:** High - Complete data flow trace shows separation between user input and network destination control.

---

## 6. Methodology Applied

This analysis followed the White-Box SSRF Analysis Procedure:

### 1) Identify HTTP Client Usage Patterns ✓
- Analyzed all imports and HTTP client library usage
- Found urllib imported but unused
- Found PhantomJS as the only network client
- Traced data flow from input to request construction
- **Result:** No user-controlled URL parameters reach HTTP clients

### 2) Protocol and Scheme Validation ✓
- Verified protocol is hardcoded as `http://`
- No user input can inject file://, ftp://, gopher://, etc.
- **Result:** Protocol injection not possible

### 3) Hostname and IP Address Validation ✓
- Verified hostname is hardcoded as `localhost`
- No user input can influence DNS resolution
- No internal IP access possible (already on localhost)
- **Result:** Hostname manipulation not possible

### 4) Port Restriction and Service Access Controls ✓
- Verified port is hardcoded as `5000`
- No user input can access other ports
- **Result:** Port scanning not possible

### 5) URL Parsing and Validation Bypass Techniques ✓
- No URL parsing from user input occurs
- PhantomJS does follow redirects, but initial URL is hardcoded localhost
- **Result:** No URL parsing to bypass

### 6) Request Modification and Headers ✓
- No user control over HTTP headers in PhantomJS request
- PhantomJS makes standard GET request to localhost
- **Result:** No header injection possible

### 7) Response Handling and Information Disclosure ✓
- PhantomJS output (alert content) is returned to user
- Error messages don't leak network information
- **Result:** No network reconnaissance via error messages

### Backward Taint Analysis ✓
- Started at PhantomJS page.open() sink (check.js:20)
- Traced backward to stdin input (check.js:4)
- Traced backward to proc.stdin.write(url) (app.py:43)
- Traced backward to URL construction (app.py:36)
- **Termination:** URL uses only hardcoded strings + os.urandom() - NO user input path
- **Verdict:** SAFE - No user input in source-to-sink path for network destinations

---

## 7. External Exploitability Assessment

### SSRF Vulnerabilities Found: 0
### Externally Exploitable: N/A

**Rationale:** No SSRF vulnerabilities exist in the application. All outbound HTTP requests are to hardcoded localhost URLs with cryptographically random filenames. User input affects HTML content (enabling XSS) but cannot influence network request destinations.

---

## 8. Recommendations

While no SSRF vulnerabilities were found, the following observations are noted for completeness:

### Architecture Strengths
1. **Hardcoded Network Destinations:** All URLs are constructed from literals and secure random data
2. **List-Based Subprocess Calls:** Using list format prevents command injection
3. **No External HTTP Client Usage:** urllib imported but never used eliminates entire attack surface
4. **Self-Referential Requests:** PhantomJS only connects to localhost, limiting blast radius even if vulnerability existed

### Other Vulnerability Classes
This application is intentionally vulnerable to:
- **Cross-Site Scripting (XSS):** Weak filter at app.py:66 only removes lowercase "script"
- This is the intended CTF challenge vulnerability

---

## 9. Conclusion

After systematic analysis of all network-accessible endpoints and request-making functions, **NO SSRF VULNERABILITIES WERE IDENTIFIED**. The application's architecture effectively prevents SSRF by:

1. Constructing all URLs from hardcoded components and cryptographic random data
2. Never using user input in URL, hostname, port, or protocol construction
3. Limiting all outbound requests to localhost:5000 (self-referential)
4. Separating user input flow (HTML content) from network destination control (URL construction)

The application IS vulnerable to XSS (as intended for this CTF challenge), but does NOT suffer from SSRF vulnerabilities.

**Analysis Status:** Complete
**Vulnerabilities Found:** 0
**Externally Exploitable:** 0