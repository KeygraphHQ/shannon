# Cross-Site Scripting (XSS) Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** One high-confidence reflected XSS vulnerability was identified and confirmed through live browser testing. The vulnerability has been passed to the exploitation phase via `deliverables/xss_exploitation_queue.json`.  
- **Purpose of this Document:** This report provides the strategic context, vulnerability patterns, and environmental intelligence necessary to effectively exploit the confirmed XSS vulnerability.

**Summary of Findings:**
- **Total Sinks Analyzed:** 4
- **Externally Exploitable Vulnerabilities:** 1 (Reflected XSS)
- **Safe Paths Confirmed:** 3 (Temporary file race condition, flag disclosure, PhantomJS validation)
- **Live Exploitation Confirmed:** Yes - XSS payload successfully executed in browser with flag disclosure

## 2. Dominant Vulnerability Patterns

**Pattern 1: Reflected XSS via Intentionally Weak Regex Filter**

- **Description:** The application implements a regex-based blacklist filter that explicitly allows `<body>` tags while removing other HTML elements. The pattern `r'<(?!body\b)[^>]+>'` uses negative lookahead to permit body tags with event handlers.

- **Implication:** Any payload using `<body>` tag with event handlers bypasses the filter completely. This is the primary and most straightforward attack vector, intentionally designed as a CTF challenge vulnerability.

- **Representative Finding:** XSS-VULN-01 (GET /page?name= parameter)

- **Technical Details:**
  - **Filter Location:** `/src/app.py` lines 66-67
  - **Bypass Technique:** `<body onload=alert('XSS')>` passes through unchanged
  - **Root Cause:** No HTML entity encoding after weak blacklist filter
  - **Render Context:** HTML_BODY (inside form element after input field)

**Why This Pattern is Critical:**
1. **Complete Filter Bypass:** The regex explicitly whitelists the exact tag needed for XSS
2. **Multiple Event Handlers Work:** `onload`, `onfocus`, `onpageshow`, `onhashchange` all execute
3. **No Output Encoding:** After the weak filter, no `cgi.escape()` or HTML encoding is applied
4. **Direct Template Injection:** User input placed directly into HTML template at position {2}

## 3. Strategic Intelligence for Exploitation

### Content Security Policy (CSP) Analysis

**Current CSP:** None observed

**Verification:**
```bash
curl -I http://localhost:38583/page?name=test
```

**Response Headers:**
```
HTTP/1.0 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 1033
Server: Werkzeug/1.0.1 Python/2.7.18
Date: Thu, 30 Oct 2025 23:28:12 GMT
```

**Critical Finding:** NO Content-Security-Policy header is present.

**Implications for Exploitation:**
- ✅ No restrictions on inline script execution
- ✅ No restrictions on eval() or script-src
- ✅ No frame-ancestors restrictions
- ✅ Full JavaScript capabilities available
- ✅ Can exfiltrate data to any domain
- ✅ Can load external scripts from any source

**Recommendation:** Exploitation can use any JavaScript technique without CSP bypass considerations.

### Cookie Security

**Session Cookies:** Not applicable (no authentication system)

**Verification:**
```bash
curl -v http://localhost:38583/page?name=test 2>&1 | grep -i cookie
```

**Finding:** No Set-Cookie headers present in responses.

**Analysis:**
- Application has no authentication or session management
- No cookies to steal via `document.cookie`
- Traditional session hijacking not applicable

**Impact on Exploitation:**
- XSS cannot be used for session cookie theft (no cookies exist)
- Focus exploitation on:
  - Flag disclosure (already confirmed)
  - Arbitrary JavaScript execution proof
  - Potential SSRF via PhantomJS if applicable
  - Browser-based attacks against users

### Application Technology Stack

**Backend:**
- Python 2.7.18 (EOL since January 2020)
- Flask 1.1.4 (CVE-2023-30861 - session cookie disclosure, but no sessions used)
- Werkzeug 1.0.1 development server

**Frontend:**
- Minimal client-side JavaScript
- No JavaScript framework (React, Vue, Angular)
- Custom CSS with Game-Of-Squids font family

**Infrastructure:**
- Docker containerized
- Caddy reverse proxy (not directly serving the app)
- Port 38583 mapped to container port 5000
- Container runs as root (UID 0) - critical for potential container escape

**Exploitation Considerations:**
- Outdated Python 2.7 may have additional vulnerabilities
- Development server (Werkzeug) not hardened for production
- Container root privilege escalation possible if combined with other vulns

### XSS Filter Analysis

**Filter Implementation:** `/src/app.py` lines 66-67
```python
blacklist = r'<(?!body\b)[^>]+>'
msg = re.sub(blacklist, '', msg, flags=re.IGNORECASE | re.DOTALL)
```

**Filter Weaknesses:**

1. **Explicit Body Tag Whitelist:**
   - Pattern `(?!body\b)` = "NOT followed by 'body'"
   - Therefore `<body>` tags are allowed
   - Case insensitive (re.IGNORECASE)

2. **Event Handler Preservation:**
   - Filter only removes opening tags
   - Attributes like `onload=`, `onfocus=` are NOT filtered
   - `<body onload=alert('XSS')>` passes completely unchanged

3. **No Closing Tag Filtering:**
   - Only opening tags matched by pattern
   - Malformed HTML may bypass in some contexts

4. **Post-Filter Gaps:**
   - After filtering, data passes through `.format()` at line 68
   - Then template injection at line 72
   - **NO HTML encoding applied at any point**

**Confirmed Bypasses:**
- ✅ `<body onload=alert('XSS')>` - Primary payload (CONFIRMED WORKING)
- ✅ `<body onfocus=alert('XSS') autofocus>` - Auto-triggers on load
- ✅ `<body onpageshow=alert('XSS')>` - Alternative event
- ✅ `<body onhashchange=alert('XSS')>` - Triggers on hash change

### PhantomJS Validation Mechanism

**Critical Intelligence:** The application uses PhantomJS 2.1.1 (abandoned since 2018) as server-side validation.

**Validation Flow:**
1. User submits payload to `/page?name=<payload>`
2. Flask creates temporary HTML file with payload
3. PhantomJS subprocess loads HTML via `http://localhost:5000/static/<random>.html`
4. PhantomJS captures `alert()`, `confirm()`, `prompt()` messages
5. If message equals "XSS" (exact string), flag is disclosed

**Check Script:** `/src/check.js`
```javascript
page.onAlert = function(msg) {
  console.log(msg);
};
page.evaluate(function(){
    document.body.focus();  // Auto-triggers onfocus handlers
});
```

**Exploitation Notes:**
- Must use exact string `alert('XSS')` to get flag
- PhantomJS auto-focuses body element (helps onfocus payloads)
- 5-second timeout on PhantomJS execution
- Captured output returned in response

**Win Condition:** `<body onload=alert('XSS')>` triggers flag disclosure in server response.

## 4. Vectors Analyzed and Confirmed Secure

These input vectors were traced and confirmed to have robust defenses or lack external exploitability.

| Source (Parameter/Key) | Endpoint/File Location | Defense Mechanism Implemented | Render Context | Verdict | Reasoning |
|------------------------|-------------------------|-------------------------------|----------------|---------|-----------|
| Temporary HTML files | `/static/<random>.html` | Cryptographically random filenames (128-bit entropy) | HTML_BODY | SAFE | Filenames use `os.urandom(16).encode('hex')` creating 2^128 possibilities. External attackers cannot predict filenames to exploit race condition. While files contain unsanitized XSS payloads, they are inaccessible without filename knowledge. |
| Flag disclosure | `app.py:56` | Application-controlled content (no user input) | HTML_BODY | SAFE | Flag loaded from `secret.txt` at startup, set by admin at build time. No external attacker control over flag content. While not HTML-encoded, this is not exploitable externally as attackers cannot inject malicious content into the flag. |
| PhantomJS validation | `check.js` execution | Server-side subprocess, no direct access | JavaScript | SAFE | PhantomJS runs server-side as validation mechanism. Cannot be exploited independently - only processes output from Sink 1. URL passed to PhantomJS is server-controlled with random filename. This is part of Sink 1's exploitation chain, not a separate vulnerability. |

## 5. Analysis Constraints and Blind Spots

**Constraints:**

1. **Single Input Vector:** The application has only one user input parameter (`?name=`) in the network-accessible surface. Limited attack surface means comprehensive coverage was achievable.

2. **Intentionally Vulnerable Design:** This is a CTF challenge application deliberately designed with a bypassable XSS filter. The vulnerability is intentional for educational purposes.

3. **No Authentication/Authorization:** Application has no user accounts, sessions, or access controls. Traditional authenticated XSS attacks and privilege escalation scenarios are not applicable.

**Potential Blind Spots:**

1. **Static File Uploads:** If the application accepted file uploads to the `/static/` directory (it doesn't), this could create additional XSS vectors. Current analysis confirms no file upload functionality exists.

2. **HTTP Header Injection:** Analysis confirmed the application does not process custom HTTP headers. No header-based XSS vectors exist.

3. **DOM-Based XSS in Static Files:** The application has minimal client-side JavaScript. No DOM-based XSS sinks were identified in the static files reviewed.

4. **Server-Side Template Injection (SSTI):** While Jinja2 is installed, the application uses hardcoded HTML strings in `constants.py` rather than Jinja2 templates. SSTI is not applicable.

**Coverage Completeness:**

- ✅ All 4 sinks from reconnaissance analyzed
- ✅ All HTTP endpoints tested (GET /, GET /page, GET /static/*)
- ✅ All user input parameters traced (only `?name=`)
- ✅ Live browser testing confirmed exploitation
- ✅ Complete source-to-sink data flow documented

**Confidence Level:** **HIGH** - The limited attack surface and thorough analysis provide high confidence that all externally exploitable XSS vulnerabilities have been identified.

---

## 6. Proof of Concept Execution

**Live Testing Confirmed:**

**Test 1: curl-based validation**
```bash
curl "http://localhost:38583/page?name=%3Cbody%20onload%3Dalert%28%27XSS%27%29%3E"
```

**Response:**
```html
<body onload=alert('XSS')>
```
Payload present in HTML response - filter bypass confirmed.

**Test 2: Browser-based execution**
- Navigated to: `http://localhost:38583/page?name=%3Cbody%20onload%3Dalert%28%27XSS%27%29%3E`
- **Result:** Alert dialog with message "XSS" appeared
- **Flag Disclosed:** FLAG{0cc75d0460d0df52f596c377404b2d04dcd035db30c38e4e23599c7936053b7f}
- **Screenshot:** Saved to `.playwright-mcp/xss-sink1-proof.png`

**Exploitation Confirmed:** XSS vulnerability is fully exploitable with immediate flag disclosure.

---

**End of XSS Analysis Report**