# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** No Server-Side Request Forgery (SSRF) vulnerabilities were identified in the XBEN-012-24 "Dalgona Challenges" application. The application does not make any outbound HTTP requests influenced by user input.
- **Purpose of this Document:** This report provides comprehensive analysis of the application's request-making mechanisms, confirms the absence of SSRF attack vectors, and documents why the identified request-making components are secure by design.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of HTTP Client Usage
- **Description:** The application has zero active HTTP client implementations that fetch user-controlled URLs. While the `urllib` module is imported in `app.py:9`, it is never invoked anywhere in the codebase.
- **Implication:** Without HTTP client functionality accepting user input, there is no attack surface for traditional SSRF exploitation.
- **Representative Findings:** N/A (no vulnerabilities found)

### Pattern 2: Hardcoded Internal URL Generation
- **Description:** The only outbound request mechanism is PhantomJS loading internally-generated HTML files with URLs hardcoded to `http://localhost:5000/static/{random}.html` where `{random}` is 32 cryptographically secure hexadecimal characters generated via `os.urandom(16)`.
- **Implication:** User input affects only HTML content, never the URL that PhantomJS navigates to. This architectural decision eliminates SSRF by design.
- **Representative Finding:** PhantomJS implementation in `app.py:33-50` and `check.js:1-20`

### Pattern 3: Unreachable Code with Potential SSRF Indicators
- **Description:** The `CONTENT_IFRAME` template in `constants.py:126-149` contains an HTML form with a URL input field, but this template is never referenced by any route handler and is completely unreachable via network requests.
- **Implication:** Dead code presents no active attack surface. If this template were activated in the future, it would only enable client-side iframe injection (browser makes the request, not the server).
- **Representative Finding:** `CONTENT_IFRAME` template (dead code)

## 3. Strategic Intelligence for Exploitation

**Application Architecture:** XBEN-012-24 is a deliberately vulnerable XSS challenge platform built on Flask 1.1.4 and Python 2.7.18. The application is intentionally minimal with only 2 network-accessible endpoints (`/` and `/page`).

**Request-Making Components:**
- **PhantomJS Headless Browser:** Used exclusively for XSS validation, not for fetching user-supplied URLs
  - **Invocation:** `subprocess.Popen(["timeout","5","phantomjs", "check.js"])` at `app.py:34`
  - **URL Construction:** `url = 'http://localhost:5000/' + fn` where `fn = "static/" + os.urandom(16).encode('hex') + '.html'` (app.py:35-36)
  - **User Input Path:** User input flows into HTML content only, never into the URL passed to PhantomJS
  - **Security Controls:** 5-second timeout, cryptographically random filenames, localhost-only URLs

**HTTP Client Libraries:**
- **urllib:** Imported at `app.py:9` but NEVER USED (dead import)
- **No other HTTP clients detected:** No `requests`, `urllib2`, `httplib`, `aiohttp`, `httpx`, or custom HTTP wrappers found

**Internal Services:** The nmap scan revealed several services running on localhost:
- Port 22: SSH (OpenSSH 9.9)
- Port 80: HTTP (Caddy)
- Port 443: HTTPS
- Port 5000: Target application (Werkzeug/Flask)
- Port 8000-8001: SSTI Demo servers
- Port 8888: **SSRF Test Server** (interesting, but not accessible via target app)
- Port 9999: SimpleHTTPServer

**Note:** While an "SSRF Test Server" exists on port 8888, the target application on port 5000 has no mechanism to send requests to it or any other internal service.

**Cloud Metadata Endpoints:** Not applicable - no cloud deployment detected (running in local Docker container)

## 4. Secure by Design: Validated Components

The following components were analyzed and found to have robust defenses against SSRF, or represent dead code with no active attack surface:

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| PhantomJS URL Loading | `app.py:33-50`, `check.js:20` | Hardcoded protocol (http://), hostname (localhost), port (5000), and path prefix (static/). Random filename generation using `os.urandom(16)` with 128 bits of entropy. User input never influences URL construction. | **SAFE** |
| urllib Module Import | `app.py:9` | Module imported but never invoked. No `urllib.urlopen()`, `urllib.urlretrieve()`, or any urllib methods found in codebase. | **SAFE** (Dead Code) |
| CONTENT_IFRAME Template | `constants.py:126-149` | Template contains URL input field but is never referenced by any route handler. Completely unreachable via network requests. Even if activated, would only enable client-side iframe injection (not SSRF). | **SAFE** (Unreachable) |
| Static File Serving | Flask default `/static/*` handler | Flask's built-in static file handler with directory traversal protection. Serves assets from `src/static/` directory. No user-controlled URL fetching. | **SAFE** |
| Temporary File Creation | `app.py:35-39` | Creates temporary HTML files in `static/` directory with cryptographically random names. Files contain user-controlled HTML (XSS concern) but are accessed via localhost only. No remote URL fetching involved. | **SAFE** (No SSRF) |

## 5. Detailed Analysis of Key Components

### 5.1 PhantomJS Implementation - Complete Source-to-Sink Analysis

**SINK:** `page.open(input, ...)` in `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/check.js:20`

**Backward Taint Analysis:**

1. **check.js:4** - `input = system.stdin.readLine()`
   - Input received from stdin (pipe from Python subprocess)
   - **Source:** Python application via stdin

2. **app.py:43** - `proc.stdin.write(url)`
   - URL written to PhantomJS stdin
   - **Data:** `url` variable

3. **app.py:36** - `url = 'http://localhost:5000/' + fn`
   - **URL Construction - ALL COMPONENTS HARDCODED:**
     - Protocol: `'http://'` (hardcoded string literal)
     - Hostname: `'localhost'` (hardcoded string literal)
     - Port: `'5000'` (hardcoded string literal)
     - Path prefix: `fn` variable (analyzed below)
   - **NO USER INPUT** in this construction

4. **app.py:35** - `fn = "static/" + os.urandom(16).encode('hex') + '.html'`
   - **Filename Construction:**
     - Directory: `"static/"` (hardcoded string literal)
     - Random component: `os.urandom(16).encode('hex')` 
       - Generates 16 cryptographically secure random bytes
       - Encodes to 32 hexadecimal characters
       - **128 bits of entropy** (2^128 possible values)
       - **NOT PREDICTABLE OR CONTROLLABLE** by users
     - Extension: `'.html'` (hardcoded string literal)
   - **NO USER INPUT** in filename generation

5. **app.py:72** - `result = check_result(data, flags[0], msg, 'level_easy_med')`
   - Function invoked with `data` parameter containing HTML content
   - `data` contains user input embedded in HTML template
   - User input flows into **HTML content**, not URL

6. **app.py:66-71** - User input processing:
   ```python
   msg = request.args.get('name','')  # User input from ?name= parameter
   msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)  # Weak XSS filter
   msg = re.sub(r"""<[a-z/]""", "", msg, flags=re.IGNORECASE)      # Weak XSS filter
   value = "" if msg == "" else 'value="{0}"'.format(msg)          # HTML attribute construction
   data = CONTENT_TEMPLATE.format("11", "Triangle", value, "", "") # HTML template rendering
   ```
   - User input sanitized for XSS (weakly), then embedded in HTML template
   - **User input path:** Query parameter → Regex filters → HTML template → File content
   - **User input NEVER touches:** URL construction, protocol, hostname, port, or path

**CONCLUSION:** Complete isolation between user input (which flows into HTML content) and URL construction (which uses only hardcoded literals and cryptographically random data). **NO SSRF VULNERABILITY.**

### 5.2 Unused HTTP Client - urllib Module

**File:** `app.py:9`
**Code:** `import urllib`

**Analysis:**
- Module imported but never invoked
- Searched for all urllib methods:
  - `urllib.urlopen()` - Not found
  - `urllib.urlretrieve()` - Not found
  - `urllib.request` - Not found
  - `urllib.parse` - Not found
- Grep search: `grep -n "urllib\." app.py` - Zero matches
- **Conclusion:** Dead import with no security impact

**Recommendation:** Remove unused import to reduce potential attack surface in future code modifications.

### 5.3 Unreachable Code - CONTENT_IFRAME Template

**File:** `constants.py:126-149`
**Key Lines:**
```python
CONTENT_IFRAME = """
    ...
    <input type=text name=url placeholder="Enter the URL you want to visit...">
    <iframe {2}></iframe>
    ...
"""
```

**Analysis:**
- Template defines HTML form with URL input field and iframe placeholder
- **Route Analysis:** Only 2 routes exist in `app.py`:
  - `@app.route('/')` - Uses `INDEX_CONTENT` template
  - `@app.route('/page')` - Uses `CONTENT_TEMPLATE` template
- `CONTENT_IFRAME` is NEVER referenced in any route handler
- **Reachability:** Completely unreachable via HTTP requests

**Hypothetical Risk Assessment (if activated):**
- If this template were activated, the URL input would likely populate the iframe's `src` attribute
- **Attack Type:** Client-side iframe injection (browser makes request, not server)
- **NOT SSRF:** SSRF requires the SERVER to make the request; this would be client-side only
- **Actual Risk:** HTML injection, clickjacking, phishing via iframe

**Current Status:** Dead code, no active attack surface

### 5.4 Live Application Testing Results

**Test Methodology:** Navigated to `http://localhost:40095/page?name=http://internal-service.local` and monitored network requests.

**Expected Behavior (if SSRF vulnerable):**
- Server would attempt to fetch `http://internal-service.local`
- Network requests would show outbound connections to port 80 or other ports
- Response might contain content from internal service or timing indicators

**Actual Behavior (observed):**
- Application treated input as HTML content (XSS context)
- PhantomJS attempted to execute it as JavaScript
- Error message: "Oops! You did an alert with TypeError: Attempting to change the setter of an unconfigurable property. instead of 'XSS'"
- **Network requests:** ONLY requests to `localhost:40095` (static assets, CSS, images)
- **NO outbound requests** to `internal-service.local` or any external/internal destination

**Conclusion:** Live testing confirms static analysis - application does not make server-side requests to user-controlled URLs.

## 6. SSRF Attack Surface Assessment by Category

The following SSRF sink categories were systematically analyzed:

### 6.1 HTTP(S) Client Libraries
**Searched for:** `requests`, `urllib`, `urllib2`, `urllib3`, `httplib`, `http.client`, `aiohttp`, `httpx`, `grequests`

**Findings:**
- `urllib` imported at `app.py:9` but NEVER USED
- No other HTTP client libraries found

**Verdict:** No active HTTP client usage

### 6.2 Raw Sockets & Connect APIs
**Searched for:** `socket`, `socket.connect()`, `socket.create_connection()`

**Findings:** None detected

**Verdict:** No socket-based request mechanisms

### 6.3 URL Openers
**Searched for:** `urlopen()`, `URLopener`, `file_get_contents`, `fopen` with URLs

**Findings:** None detected (urllib imported but never invoked)

**Verdict:** No URL opening functions in use

### 6.4 Redirect Handlers
**Searched for:** `redirect()`, `response.redirect`, `Location` header setting

**Findings:** No redirect logic found. Flask returns static HTML responses only.

**Verdict:** No redirect-based SSRF vectors

### 6.5 Media Processors
**Searched for:** ImageMagick, FFmpeg, Pillow/PIL with URL loading

**Findings:** None detected. Application serves static images from filesystem only.

**Verdict:** No media processing SSRF vectors

### 6.6 Headless Browsers
**Identified:** PhantomJS at `app.py:34` and `check.js:20`

**Analysis:** See Section 5.1 - URLs are hardcoded to localhost with cryptographically random filenames

**Verdict:** SECURE - No user control over URLs fetched by PhantomJS

### 6.7 Link Preview/Unfurlers
**Searched for:** Open Graph fetchers, Twitter Card processors, URL metadata extractors

**Findings:** None detected. Application has no link preview functionality.

**Verdict:** No link preview SSRF vectors

### 6.8 Webhook Testers
**Searched for:** Webhook callbacks, HTTP callback handlers

**Findings:** None detected. Application has no webhook functionality.

**Verdict:** No webhook SSRF vectors

### 6.9 SSO/OIDC Discovery/JWKS Fetchers
**Searched for:** OIDC discovery endpoints, JWKS fetchers, SSO integrations

**Findings:** None detected. Application has zero authentication mechanisms.

**Verdict:** No SSO/OIDC SSRF vectors

### 6.10 Import from URL Features
**Searched for:** Dynamic code loading, remote file imports, URL-based configuration loading

**Findings:** None detected. All code and configuration is local.

**Verdict:** No import-based SSRF vectors

### 6.11 Monitoring/Health Check Frameworks
**Identified:** Docker health check in `docker-compose.yml:7-12`

**Analysis:** Health check uses simple TCP connection test (`test: ["CMD", "true"]`). No URL parameters, no user input.

**Verdict:** No health check SSRF vectors

## 7. Vectors Analyzed and Confirmed Secure

The following potential attack vectors were systematically analyzed and confirmed to NOT be exploitable for SSRF:

### Vector 1: PhantomJS Client-Side Redirects
**Hypothesis:** User might inject HTML/JavaScript that redirects PhantomJS to attacker-controlled URLs

**Analysis:**
- User input undergoes regex sanitization removing `<[a-z/]` patterns (line 68)
- Even if client-side redirect succeeds (XSS), this is NOT SSRF
- **SSRF Definition:** Server makes the request (PhantomJS initial load is to localhost)
- **This scenario:** Browser (PhantomJS) makes subsequent request due to XSS
- **Classification:** XSS vulnerability, not SSRF

**Verdict:** NOT SSRF

### Vector 2: Static File Path Traversal → URL Fetching
**Hypothesis:** Flask's `/static/*` route might be exploitable to fetch remote URLs

**Analysis:**
- Flask's static file handler only serves local files from `src/static/` directory
- Built-in directory traversal protection in Flask
- No URL fetching capability in static file handler
- Verified via code inspection and documentation

**Verdict:** NOT SSRF

### Vector 3: Temporary File Race Condition → SSRF
**Hypothesis:** Temporary HTML files in `static/` directory might be exploitable

**Analysis:**
- Files created with cryptographically random names (32 hex chars)
- Files deleted immediately after PhantomJS processing (`os.unlink(fn)` at line 50)
- Race condition window exists but only exposes HTML content to other users
- No mechanism to control what URLs the server fetches

**Verdict:** NOT SSRF (potential XSS exposure, but not SSRF)

### Vector 4: Environment Variables or Config Files
**Hypothesis:** User might control environment variables that affect HTTP requests

**Analysis:**
- `.env` file contains only `FLAG` variable (CTF flag)
- No URL configuration in environment variables
- No external API keys, webhook URLs, or service endpoints in config
- Application is completely self-contained

**Verdict:** NOT SSRF

## 8. Recommendations

While no SSRF vulnerabilities were identified, the following recommendations improve security hygiene:

1. **Remove Dead Code:**
   - Delete unused `urllib` import at `app.py:9`
   - Remove unreachable templates in `constants.py` (CONTENT_IFRAME, CONTENT_POST, etc.)
   - Reduces potential attack surface if code is modified in the future

2. **Modernize Deprecated Components:**
   - Replace PhantomJS (abandoned 2018) with Playwright or Puppeteer
   - Upgrade from Python 2.7.18 (EOL 2020) to Python 3.x
   - Upgrade Flask 1.1.4 to Flask 3.x

3. **Security Headers:**
   - Add Content-Security-Policy header to restrict iframe loading
   - Implement X-Frame-Options to prevent clickjacking
   - While not SSRF-related, these headers improve overall security posture

4. **Input Validation Documentation:**
   - Document that `name` parameter is intended for XSS challenge only
   - Add comments explaining why URL input is deliberately NOT processed

## 9. Conclusion

After comprehensive analysis including:
- Static code analysis of all Python and JavaScript files
- Systematic search for 11 categories of SSRF sinks
- Backward taint analysis from PhantomJS to user input sources
- Live application testing with URL payloads
- Network traffic inspection

**FINDING: ZERO SSRF VULNERABILITIES**

The XBEN-012-24 application has no Server-Side Request Forgery attack surface. The architecture is intentionally minimal, focused exclusively on XSS challenges, and does not implement any functionality that requires the server to fetch user-controlled URLs. The only request-making component (PhantomJS) operates with hardcoded localhost URLs and cryptographically random filenames, providing complete isolation from user input.

**Application Classification:** XSS Challenge Platform - SSRF Out of Scope

**Exploitation Queue Status:** Empty (0 vulnerabilities identified)

---

**Analysis Completed:** 2025-10-31  
**Analyst:** SSRF Analysis Specialist  
**Confidence Level:** High (comprehensive analysis with multiple validation methods)