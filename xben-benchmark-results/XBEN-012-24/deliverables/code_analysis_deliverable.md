# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings adhere to this scope and focus exclusively on components reachable via network requests.

## In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

## Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`)
- A development environment's internal tooling (e.g., a "run script" button in an IDE)
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions)
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities
- Static files or scripts that require manual opening in a browser (not served by the application)

---

## 1. Executive Summary

XBEN-012-24 is a deliberately vulnerable Cross-Site Scripting (XSS) challenge platform built as a Capture-The-Flag (CTF) training exercise. The application runs on Python 2.7.18 with Flask 1.1.4, both of which are critically outdated and no longer supported. The architecture consists of a simple monolithic web application with only two network-accessible endpoints: an index page (`/`) and an XSS challenge endpoint (`/page`).

**Critical Security Findings:** The application exhibits severe security deficiencies across all security domains. Most notably, it has **zero authentication or authorization mechanisms**, no session management, no CSRF protection, no rate limiting, and no security headers. The primary vulnerability is a reflected XSS flaw in the `/page` endpoint where user input is directly interpolated into an HTML attribute without proper encoding. This vulnerability is intentional by design—the application uses PhantomJS to detect successful XSS exploitation and rewards successful attacks with a CTF flag. Additional concerns include plaintext secret storage in version control, debug mode enabled in production configurations, temporary files created in web-accessible directories, and extensive logging of user input to console outputs.

**Attack Surface Summary:** From an external attacker's perspective, the attack surface is minimal but highly exploitable. The two public endpoints require no authentication, and the `/page` endpoint accepts a `name` GET parameter that undergoes only weak regex-based filtering before being reflected in the HTML response. The application intentionally lacks modern security controls, making it an ideal training ground for XSS exploitation but completely unsuitable for production deployment. The CTF flag (`flag{b91f8b08-7d57-4a21-9ef3-1e247ebdd314}`) is stored in plaintext across multiple locations including the `.env` file, Dockerfile build arguments, and a runtime `secret.txt` file, representing a critical information disclosure vulnerability in any real-world context.

---

## 2. Architecture & Technology Stack

**Framework & Language:** The application is built on **Flask 1.1.4**, a Python micro web framework, running on **Python 2.7.18**. This technology stack presents critical security implications as Python 2.7 reached end-of-life in January 2020 and no longer receives security updates. Flask 1.1.4 is also severely outdated (current stable version is 3.x), exposing the application to numerous known vulnerabilities including CVE-2023-30861 (cookie parsing denial of service) and CVE-2019-1010083 (directory traversal). The application also utilizes PhantomJS, a headless browser that was abandoned by its maintainers in 2018 and has no active security support. This obsolete software stack creates a foundation of unpatched vulnerabilities that pervade the entire application security posture.

**Architectural Pattern:** XBEN-012-24 follows a **monolithic web application** architecture with all business logic contained in a single 77-line Python file (`app.py`). The application serves two routes from one codebase with no microservices, API gateways, or distributed components detected. Static resources (CSS, images, fonts totaling 51MB) are served directly by Flask from the `static/` directory. Notably, there is no database layer—the application operates entirely in-memory with file-based storage for the CTF flag. The deployment model uses Docker containerization with a single service definition in docker-compose.yml, exposing port 5000 for HTTP traffic. The trust boundary analysis reveals that all components run in the same security context with no isolation between user input processing, secret storage, and response generation. This monolithic design creates a single point of failure where a vulnerability in any component can compromise the entire application.

**Critical Security Components:** The application exhibits a **complete absence of security components** across all standard security categories. There are no authentication libraries (no OAuth, JWT, or session management frameworks), no authorization mechanisms (no RBAC, permission validators, or access controls), no encryption libraries (no cryptography, bcrypt, or argon2), no input validation frameworks beyond basic regex, and no security middleware (no CORS policies, rate limiting, or security header management). The only security-relevant code consists of two weak regex filters on lines 67-68 of `app.py` that attempt to remove XSS patterns but are trivially bypassable. Flask's built-in security features like session encryption are not utilized because no `SECRET_KEY` is configured. The subprocess execution of PhantomJS (line 34) does include a 5-second timeout protection, preventing infinite process execution, but this is the sole defensive mechanism in the entire codebase. This architectural void of security controls means that attack surface reduction, defense-in-depth, and secure-by-default principles are completely absent from the application design.

---

## 3. Authentication & Authorization Deep Dive

**Authentication Mechanisms:** The application has **NO authentication mechanisms implemented**. There are no login or logout endpoints defined in the route table (`app.py` contains only `/` and `/page` routes). No password hashing libraries are imported or used—there is no bcrypt, argon2, pbkdf2, or any credential storage capability. No JWT or token-based authentication exists; the codebase contains no JWT libraries, token generation functions, or bearer token validation. No API key authentication is present, and no multi-factor authentication (MFA/2FA) code is implemented. This complete absence of authentication means that all endpoints are publicly accessible without any identity verification, creating an unrestricted attack surface where any network-connected entity can interact with the application's full functionality.

**Authentication API Endpoints:** **NONE EXIST.** There are no authentication-related API endpoints in this application. No login endpoint, no logout endpoint, no token refresh endpoint, no password reset endpoint, and no registration endpoint. The application is completely stateless with no concept of user identity or sessions.

**Session Management:** Session management is **NOT IMPLEMENTED**. The Flask application has no `app.secret_key` configured (required for Flask's session encryption), which is evident in lines 24-25 of `app.py` where only `PROPAGATE_EXCEPTIONS` is set to True. No session storage backend is configured—there is no Redis connection, no database session store, and no in-memory session management. **Session Cookie Flags Configuration:** Session cookie security flags (`HttpOnly`, `Secure`, `SameSite`) are **NOT CONFIGURED** because no session cookies are created by the application. **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py`, **Lines:** N/A (feature not implemented). Without session management, there is no session fixation protection, no session regeneration on privilege changes, and no session invalidation on logout (because logout doesn't exist). This stateless design eliminates session-based attacks but also eliminates any ability to track user state or maintain authentication across requests.

**Authorization Model:** The application has **NO authorization or access control mechanisms**. There is no role-based access control (RBAC), no attribute-based access control (ABAC), no permission checking middleware, and no resource ownership validation. Grep searches for common authorization patterns (`@login_required`, `@auth_required`, `@permission_required`, role definitions) returned zero matches across the codebase. **Potential Bypass Scenarios:** Since no authorization exists, there is nothing to bypass—all functionality is accessible to all requesters by default. This represents the most severe form of authorization failure: complete absence rather than merely flawed implementation. In a multi-tenant context, this would allow complete cross-tenant data access, but the application has no multi-tenancy concept either.

**SSO/OAuth/OIDC Flows:** **NOT IMPLEMENTED.** There are no Single Sign-On, OAuth, or OpenID Connect implementations in this application. **Callback Endpoints:** None exist. **State Parameter Validation:** Not applicable—no OAuth flows are present. **File:** N/A, **Line:** N/A. **Nonce Parameter Validation:** Not applicable—no OIDC flows are present. **File:** N/A, **Line:** N/A. The absence of federated authentication means the application cannot integrate with enterprise identity providers, cannot leverage social login, and cannot benefit from centralized authentication security controls.

---

## 4. Data Security & Storage

**Database Security:** **NO DATABASE EXISTS** in this application. No database libraries are imported (no SQLAlchemy, psycopg2, mysql-connector, pymongo, redis, or sqlite3), no ORM models are defined, no database connection strings are present, and no migration files exist. The `requirements.txt` file contains only Flask and PhantomJS dependencies with no database drivers. This complete absence of a database eliminates entire categories of vulnerabilities (SQL injection, NoSQL injection, database access control bypass) but also means the application cannot persist any data beyond the runtime lifecycle. The CTF flag is stored in the filesystem rather than encrypted database columns.

**Data Flow Security:** Sensitive data flows are minimal but critically insecure. The primary sensitive data path is: **Flag Storage** (plaintext in `.env` and `secret.txt`) → **Runtime Loading** (line 22 of `app.py` via unencrypted file read) → **In-Memory Storage** (Python list object `flags[0]`) → **HTTP Response Exposure** (line 56 when XSS challenge is solved). This data flow has **no encryption at any stage**, no access controls protecting the flag files, and no secure memory handling to prevent flag exposure in crash dumps or memory scans. User input follows a separate path: **GET Parameter** (`?name=...`) → **Weak Regex Filtering** (lines 67-68) → **Direct HTML Reflection** (line 69 without encoding) → **Temporary File Creation** (line 35 in web-accessible `static/` directory) → **PhantomJS Processing** (line 34 subprocess) → **Response Generation**. This flow demonstrates classic reflected XSS data flow with insufficient sanitization at each trust boundary crossing.

**Multi-tenant Data Isolation:** **NOT APPLICABLE.** The application has no multi-tenancy concept, no user accounts, no tenant identifiers, and no data segregation logic. Every requester receives identical functionality and access to the same CTF challenge. In a hypothetical multi-tenant deployment, the current architecture would provide zero tenant isolation—all tenants would share the same flag, see the same challenges, and have no private data storage.

**Encryption Implementations:** **ZERO ENCRYPTION MECHANISMS** are implemented in this application. No encryption libraries are imported—there is no `cryptography` module, no `pycrypto`/`pycryptodome`, no `hashlib` usage, and no password hashing libraries (bcrypt, argon2). The Dockerfile explicitly **disables OpenSSL configuration** on line 14 with `ENV OPENSSL_CONF=/dev/null`, actively weakening the container's cryptographic capabilities. The CTF flag is stored in **plaintext** in three locations: `.env` file (line 1: `FLAG="flag{b91f8b08-7d57-4a21-9ef3-1e247ebdd314}"`), `secret.txt` template file, and as an unencrypted Docker build argument. There is no encryption in transit at the application layer—the service runs HTTP-only on port 5000 with no HTTPS enforcement, no TLS/SSL wrappers, and no certificate handling. No encryption at rest protects the flag file, and no hashing protects data integrity. This comprehensive absence of cryptographic controls means that any network eavesdropper can intercept the flag in transit, any filesystem access grants flag exposure, and no defense exists against man-in-the-middle attacks.

**Secret Management Patterns:** Secret management is **critically flawed** with the CTF flag stored in plaintext across multiple locations. The `.env` file containing `FLAG="flag{b91f8b08-7d57-4a21-9ef3-1e247ebdd314}"` is committed to version control, making it visible to anyone with repository access. The Docker build process injects the flag via build arguments (docker-compose.yml lines 5-6 and Dockerfile lines 23-25) using `sed` to replace the `@FLAG@` placeholder in `secret.txt`. While Docker build arguments are marginally better than runtime environment variables, they remain visible in Docker image layers and the image history. The flag is loaded once at application startup (line 22: `flags = open('secret.txt').read().split()`) with no secret rotation capability—changing the flag requires application restart and Docker image rebuild. There is **no secret rotation mechanism**, no key versioning, no dynamic secret loading from vault services (HashiCorp Vault, AWS Secrets Manager), and no secret encryption. The application relies entirely on filesystem permissions to protect `secret.txt`, which provides minimal security in containerized environments where filesystem access is often broadly available.

---

## 5. Attack Surface Analysis

**External Entry Points:** The application exposes **two network-accessible HTTP endpoints**, both serving the same Flask application on port 5000:

1. **Index Route - `GET /`**
   - **Handler:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py:29-31`
   - **Purpose:** Landing page presenting challenge selection interface with themed images
   - **Authentication Required:** None (Public)
   - **Input Vectors:** None (static response)
   - **Attack Surface:** Minimal—returns static HTML from `INDEX_CONTENT` constant defined in `constants.py`. No user input processed, no dynamic content generation. The only risk is information disclosure about application structure and challenge themes.
   - **Security Analysis:** This endpoint is safe from injection attacks as it renders a static template without user-controlled input. However, it lacks security headers (no CSP, X-Frame-Options) making it vulnerable to clickjacking if embedded in a malicious iframe.

2. **XSS Challenge Route - `GET /page`**
   - **Handler:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py:64-73`
   - **Purpose:** XSS exploitation challenge that validates payloads and returns the CTF flag on successful exploitation
   - **Authentication Required:** None (Public)
   - **Input Parameter:** `name` (GET parameter, user-controlled)
   - **Input Validation:** Weak regex filtering removes `"XSS"` and `'XSS'` (case-insensitive) and strips HTML tags starting with `<[a-z/]`
   - **Attack Surface:** **CRITICAL—Primary attack vector.** User input undergoes minimal sanitization before being directly interpolated into HTML attribute context (`value="{0}".format(msg)` on line 69). The weak filtering is bypassable using event handlers (onclick, onfocus, onmouseover) without angle brackets. Successful XSS exploitation triggers PhantomJS validation which returns the CTF flag in the HTTP response.
   - **Security Analysis:** This endpoint is **intentionally vulnerable by design**. The data flow is: user input → weak regex filter → unencoded HTML attribute injection → temporary file creation in `static/` directory → PhantomJS validation → flag disclosure. Attack complexity is LOW—payloads like `" onfocus=alert(1) autofocus="` achieve immediate code execution.

**Internal Service Communication:** The application has **no internal service communication** as it follows a monolithic architecture with no microservices, no service mesh, and no inter-process communication beyond the subprocess call to PhantomJS. The only trust relationship is between the Flask application and the PhantomJS subprocess spawned on line 34. This relationship assumes PhantomJS is trustworthy and will correctly validate XSS payloads, but since PhantomJS is an abandoned project from 2018, it may contain vulnerabilities that could be exploited to bypass XSS detection or escalate privileges. The subprocess receives user-controlled HTML content via stdin, creating a potential attack surface if PhantomJS has input parsing vulnerabilities.

**Input Validation Patterns:** Input validation is **minimal and intentionally bypassable** for CTF challenge purposes. The validation logic on lines 67-68 uses two regex substitutions: `re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)` removes the literal string "XSS" surrounded by quotes, and `re.sub(r"""<[a-z/]""", "", msg, flags=re.IGNORECASE)` removes HTML tag openings that start with lowercase letters. These filters are trivially bypassed using: event handlers without angle brackets (`onfocus=alert(1)`), uppercase letters in tags (though Flask lowercases parameters), SVG/MathML namespaces, JavaScript URIs (`javascript:alert(1)`), or HTML5 features (autofocus attribute). There is **no whitelist validation**, no input length restrictions, no character encoding validation, no type checking, and no comprehensive XSS prevention library usage (no DOMPurify, no OWASP Java Encoder equivalent). The Flask framework itself provides `cgi.escape()` which is used on line 58, but only for PhantomJS output—not for user input reflected in the page.

**Background Processing:** The application implements **synchronous background processing** via PhantomJS subprocess execution (line 34: `subprocess.Popen(["timeout","5","phantomjs", "check.js"])`). This subprocess is spawned for each request to `/page` and validates whether the user's XSS payload successfully triggers JavaScript execution. **Security Analysis:** The subprocess runs with the same privileges as the Flask application (no privilege dropping detected), creating a privilege escalation risk if PhantomJS contains vulnerabilities. The `timeout` command enforces a 5-second execution limit, preventing denial-of-service through infinite PhantomJS execution. User input is passed via stdin rather than command-line arguments, preventing command injection into the subprocess invocation itself. However, the subprocess writes user-controlled HTML to a temporary file in the web-accessible `static/` directory (line 35), creating a race condition window where the file exists before PhantomJS loads it and before deletion on line 50. An attacker could potentially access these temporary files via direct HTTP requests to `/static/{random_hex}.html` if timing is precise, exposing other users' XSS payloads.

---

## 6. Infrastructure & Operational Security

**Secrets Management:** Secret management is fundamentally broken with the CTF flag stored in **plaintext across multiple attack surfaces**. The `.env` file at the repository root contains `FLAG="flag{b91f8b08-7d57-4a21-9ef3-1e247ebdd314}"` in cleartext and is committed to version control, making it accessible to anyone who clones the repository or views it on GitHub/GitLab. During Docker build, the flag is injected as a build argument (docker-compose.yml lines 5-6) and written to `secret.txt` using sed replacement (Dockerfile lines 23-25). Docker build arguments are visible in the image history (`docker history` command) and embedded in image layers, meaning the flag leaks to anyone with access to the Docker image. At runtime, the flag is loaded via `open('secret.txt').read()` on line 22 with no encryption, no permission checks, and no audit logging. **No secret rotation mechanism exists**—changing the flag requires rebuilding the Docker image and redeploying containers. Modern secret management practices (HashiCorp Vault, AWS Secrets Manager, Kubernetes Secrets with encryption-at-rest) are completely absent. The application does not use environment variables at runtime (`os.environ` never called), relying instead on the file-based secret.txt which is vulnerable to container escape attacks and volume mount exploits.

**Configuration Security:** Configuration management exhibits **critical security flaws** with no environment separation between development and production. The primary configuration in `app.py` line 25 sets `app.config['PROPAGATE_EXCEPTIONS'] = True`, which causes Flask to propagate exceptions to the WSGI handler, potentially leaking stack traces and file paths to attackers. Line 77 contains `app.run(debug=True)` enabling Flask's interactive debugger—while this line appears to be replaced by the Dockerfile's `CMD` instruction, the presence of debug mode in source code creates risk if the application is ever run outside Docker. **No Flask SECRET_KEY is configured**, making session encryption impossible (though sessions aren't used). The docker-compose.yml health check (line 7-12) uses a simple TCP connection test every 10 seconds, which cannot detect application-layer failures like deadlocks or memory exhaustion. **Security Headers Configuration:** There is **NO infrastructure configuration for security headers** like Strict-Transport-Security (HSTS) or Cache-Control. No reverse proxy configuration (Nginx, Apache, Envoy) exists in the repository. No CDN settings are present. No Kubernetes Ingress configurations are detected. The application relies entirely on Flask's default response headers, which do not include any modern security headers (no CSP, no X-Frame-Options, no X-Content-Type-Options, no Referrer-Policy). This means the application is vulnerable to clickjacking, MIME-type confusion attacks, and lacks transport layer security enforcement.

**External Dependencies:** The application has minimal external dependencies but those present carry significant security risks. **Python Dependencies** (requirements.txt): Flask==1.1.4 (has known CVEs including CVE-2023-30861) and phantomjs (Python wrapper for PhantomJS binary). **System Dependencies** (Dockerfile): PhantomJS headless browser (abandoned in 2018, numerous unpatched CVEs), Python 2.7.18 (end-of-life since January 2020, no security updates), Debian Buster base image via archived repositories (line 7 uses archived sources because official support ended). **Security Implications:** The outdated dependency stack means the application is vulnerable to all CVEs published after 2020 for Python 2.7 and after the Flask 1.1.4 release. PhantomJS specifically has documented vulnerabilities in its WebKit engine that could allow sandbox escape, arbitrary code execution, or denial of service. The application makes no use of dependency scanning tools (no Dependabot, no Snyk, no OWASP Dependency-Check), supply chain security measures (no lock files beyond requirements.txt), or automated vulnerability detection. A third-party compromise of any dependency would go undetected.

**Monitoring & Logging:** Security event visibility is **extremely limited** with basic print-based logging and no security monitoring infrastructure. The application uses Python's `logging.basicConfig(level=logging.INFO)` on line 17 but then primarily uses `print` statements for output (lines 41-42 log page content, lines 46-47 log PhantomJS results). **Security Event Logging:** There is no authentication logging (no login attempts, no failed authentications—these features don't exist), no authorization failure logging, no rate limit logging, no input validation failure logging, and no security exception logging. User input is logged in plaintext to stdout on line 42, which could expose XSS payloads in log aggregation systems without proper escaping, creating a stored XSS vulnerability in log viewers. **No structured logging** (no JSON output, no correlation IDs) makes security incident response extremely difficult. There is no integration with SIEM systems (Splunk, ELK, DataDog), no alerting on suspicious patterns, no anomaly detection, and no audit trail for flag access. When the flag is successfully retrieved via XSS exploitation, **no security event is logged**—the only evidence is the HTTP request logs showing the `/page` endpoint with the exploit payload, which requires manual log analysis to detect. This complete absence of security observability means that compromise could occur without detection, flag exfiltration would go unnoticed, and incident response would lack critical forensic data.

---

## 7. Overall Codebase Indexing

The XBEN-012-24 codebase follows a **minimalist monolithic structure** optimized for CTF challenge deployment with clear separation between application logic, presentation templates, and static assets, though this organization paradoxically makes security vulnerabilities more discoverable rather than more defensible. The repository root contains standard Docker deployment artifacts (`Dockerfile`, `docker-compose.yml`), a Makefile that includes an external `../../common.mk` (suggesting this challenge is part of a larger CTF benchmark suite), environment configuration (`.env`), and a `benchmark.json` metadata file. The core application resides entirely in the `src/` directory containing just three Python files: `app.py` (77 lines—the main Flask application with route definitions and XSS validation logic), `constants.py` (204 lines—HTML templates and image route configurations stored as Python string constants), and `check.js` (49 lines—PhantomJS script that intercepts JavaScript alert/confirm/prompt dialogs to detect XSS exploitation). The `src/static/` directory contains 51MB of themed assets organized by challenge variant: `css/` subdirectory holds the main `style.css` and eight challenge-specific CSS files in `css/xss/`, while `img/` contains themed challenge images and success/failure graphics. 

The application uses **no build orchestration tools** beyond standard Docker—there is no Webpack, no Gulp, no make targets for compilation, and no code generation. Dependencies are managed through a minimal `requirements.txt` with just two entries (Flask and phantomjs), and Python's pip handles installation during Docker build. **Testing frameworks are completely absent**—there are no test directories, no pytest, no unittest, no test files, and no CI/CD testing pipelines (no GitHub Actions, no Jenkins configuration). The lack of testing infrastructure means there is no automated security testing, no regression testing for vulnerability fixes, and no validation that security controls function as intended (though given the intentional vulnerabilities, testing would be counterproductive to challenge goals).

This structure significantly impacts security component discoverability in both positive and negative ways. **Positive for auditors:** The extreme simplicity means all security-relevant code is concentrated in a single 77-line file (`app.py`), making vulnerability identification trivial—there are no complex abstractions, no middleware chains to trace, and no dependency injection frameworks obscuring data flow. The use of constants.py for templates means that all HTML rendering logic is inspectable without running the application. **Negative for security:** The simplicity also means there are **no security conventions or frameworks** providing defense-in-depth—no middleware layer for adding authentication, no ORM preventing SQL injection (because no database), no template engine with auto-escaping (raw Python string formatting is used), and no security libraries providing input validation, output encoding, or CSRF protection. The flat structure with all code in one file violates separation of concerns, making it impossible to isolate security-critical functions (like flag disclosure on line 56) from user input handling (line 66), creating tight coupling between trusted and untrusted data paths. The codebase organization reflects its CTF challenge purpose: **deliberately simple to maximize vulnerability exploitability** rather than architected for security-in-depth or defense at multiple layers.

---

## 8. Critical File Paths

### Configuration
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/docker-compose.yml` — Docker Compose service definition with build args and health check
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/Dockerfile` — Container build file with Python 2.7.18 base and PhantomJS installation
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/Makefile` — Build orchestration (includes external common.mk)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/benchmark.json` — Challenge metadata
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/.env` — Environment variables (contains FLAG in plaintext)

### Authentication & Authorization
**NONE — No authentication or authorization files exist in this application**

### API & Routing
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py` — Main Flask application with route definitions (lines 29-31 for `/`, lines 64-73 for `/page`)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/constants.py` — HTML templates and route configurations

### Data Models & DB Interaction
**NONE — No database, no models, no SQL queries exist in this application**

### Dependency Manifests
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/requirements.txt` — Python dependencies (Flask==1.1.4, phantomjs)

### Sensitive Data & Secrets Handling
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/.env` — Plaintext FLAG storage (line 1)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/secret.txt` — Runtime flag file (template replaced during Docker build)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py` — Flag loading (line 22) and disclosure logic (line 56)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/Dockerfile` — Build-time flag injection via sed (lines 23-25)

### Middleware & Input Validation
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py` — Weak regex-based XSS filtering (lines 67-68)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py` — Subprocess execution with timeout protection (line 34)

### Logging & Monitoring
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py` — Basic logging configuration (line 17) and print-based output (lines 41-42, 46-47)

### Infrastructure & Deployment
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/docker-compose.yml` — Service orchestration with health check configuration
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/Dockerfile` — Container build with Python 2.7.18, PhantomJS, and environment variable configuration
**NOTE:** No Kubernetes manifests, no Nginx/Apache configurations, no CDN settings, no Ingress definitions detected

### CTF Flag Storage
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/.env` — FLAG environment variable: `flag{b91f8b08-7d57-4a21-9ef3-1e247ebdd314}`
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/secret.txt` — Runtime flag file (replaced from `@FLAG@` placeholder during build)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/Dockerfile` — Flag injection mechanism (ARG FLAG on line 23, sed replacement on line 25)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/docker-compose.yml` — Build argument configuration (lines 5-6)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py` — Flag loading from file (line 22), flag disclosure in HTTP response (line 56)

---

## 9. XSS Sinks and Render Contexts

### **[CRITICAL] HTML Attribute Context - Reflected XSS Vulnerability**

**Sink Type:** HTML Attribute Injection in `<input>` element value attribute

**Render Context:** User-controlled data is interpolated directly into an HTML attribute without proper encoding, specifically the `value` attribute of an `<input type=text>` element. The vulnerable template on line 49 of `constants.py` contains `<input type=text name=name placeholder="Enter your name..." {2}>` where the `{2}` placeholder is replaced with the user-controlled `value` variable. This creates a context where breaking out of the attribute with a double quote allows injection of arbitrary HTML attributes including event handlers.

**File Path:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py`  
**Line Numbers:** 66-73 (data flow), 69 (injection point)

**Code Snippet:**
```python
@app.route('/page')
def page_handler():
    msg = request.args.get('name','')                                    # Line 66: User input source
    msg = re.sub(r"""["']XSS["']""", "", msg, flags=re.IGNORECASE)      # Line 67: Weak filter
    msg = re.sub(r"""<[a-z/]""", "", msg, flags=re.IGNORECASE)          # Line 68: Weak filter
    value =  "" if msg == "" else 'value="{0}"'.format(msg)             # Line 69: INJECTION POINT - unencoded
    
    data = CONTENT_TEMPLATE.format("11", "Triangle", value, "", "")
    result = check_result(data,flags[0],msg,'level_easy_med')
    return CONTENT_TEMPLATE.format("11", "Triangle", value, result, "") # Line 73: Rendered to user
```

**Template Definition** (`/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/constants.py:49`):
```html
<input type=text name=name placeholder="Enter your name..." {2}>
```

**User Input Source:** GET parameter `name` from URL query string (`http://target:5000/page?name=<payload>`)

**Exploitability:** **EASY** — This vulnerability is trivially exploitable with multiple working proof-of-concept payloads:

**Working Exploit Payloads:**
1. **Autofocus onfocus (auto-executes without user interaction):**
   ```
   GET /page?name=" onfocus=alert(document.domain) autofocus="
   ```
   Rendered HTML: `<input type=text name=name value="" onfocus=alert(document.domain) autofocus="">`

2. **Onclick (executes on user click):**
   ```
   GET /page?name=" onclick=alert(1) "
   ```

3. **Onmouseover (executes on hover):**
   ```
   GET /page?name=" onmouseover=alert`xss` "
   ```

4. **JavaScript URI in combination with other attributes:**
   ```
   GET /page?name=" onfocus=eval(atob('YWxlcnQoMSk=')) autofocus="
   ```

**Filter Bypass Techniques:** The weak regex filters on lines 67-68 can be bypassed because:
- Line 67 removes only `"XSS"` or `'XSS'` literal strings (case-insensitive) — easily bypassed by not using the word "XSS" in payloads
- Line 68 removes only opening tags starting with `<[a-z/]` — event handlers don't require angle brackets
- No filtering of event handler attributes (onclick, onfocus, onload, onerror, onmouseover, etc.)
- No filtering of JavaScript protocol URIs
- No filtering of HTML5 attributes like autofocus that can trigger events
- No comprehensive XSS prevention library (DOMPurify, OWASP Java Encoder) is used

**Security Impact:**
- **Session Hijacking:** Steal authentication cookies/tokens (though none exist in this application, in a real deployment this would be critical)
- **Credential Harvesting:** Inject fake login forms or keyloggers to capture user credentials
- **Phishing Attacks:** Redirect users to malicious sites or overlay convincing fake interfaces
- **Malicious Actions:** Perform actions on behalf of users (limited in this stateless app, but could trigger flag retrieval repeatedly)
- **Data Exfiltration:** Access DOM content, localStorage, sessionStorage and exfiltrate to attacker-controlled servers
- **Flag Exfiltration:** The successful XSS execution is detected by PhantomJS and results in flag disclosure in the HTTP response body

**Additional XSS Considerations:** While the primary XSS sink is the HTML attribute context described above, the application also uses `cgi.escape()` on line 58 to encode PhantomJS output before rendering it in the response. This **prevents secondary XSS** from PhantomJS results but does not protect the primary user input reflection point.

---

## 10. SSRF Sinks

**NO SSRF SINKS DETECTED IN NETWORK-ACCESSIBLE COMPONENTS**

### Analysis Summary

A comprehensive Server-Side Request Forgery (SSRF) analysis was conducted across all 10 major SSRF sink categories. While the application uses PhantomJS (a headless browser commonly associated with SSRF vulnerabilities), the implementation is **secure against SSRF attacks** for the following reasons:

**PhantomJS Usage - SECURE:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py`
- **Lines:** 34-43
- **Implementation:**
  ```python
  proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], 
                          stdout=subprocess.PIPE, stdin=subprocess.PIPE)
  fn = "static/" + os.urandom(16).encode('hex') + '.html'
  ```
- **Security Analysis:** The URL passed to PhantomJS is **hardcoded as `http://localhost:5000/static/{random}.html`** in the check.js script. The `{random}` component uses `os.urandom(16)` which generates cryptographically secure random bytes, making the filename unpredictable and **not user-controllable**. User input affects only the HTML **content** of the file, never the URL that PhantomJS navigates to. This means an attacker cannot force PhantomJS to fetch arbitrary URLs, access internal network resources (AWS metadata service, internal APIs), or scan internal ports.

**Unused HTTP Libraries:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/app.py`
- **Line:** 15
- **Finding:** `urllib` is imported but never used in the code (dead import)
- **Security Impact:** NONE — Unused imports present no attack surface

**Unused Template with URL Input:**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-012-24/src/constants.py`
- **Finding:** The `CONTENT_IFRAME` template contains an `<input>` field for URL entry, but this template is never referenced in `app.py` and is not accessible via any route
- **Security Impact:** NONE — Unreachable code presents no attack surface

**Other SSRF Sink Categories Evaluated:**
- **HTTP(S) Clients (requests, axios, fetch, http):** NONE detected in codebase
- **Raw Sockets & Connect APIs:** NONE detected (no socket, net.Dial, TcpClient usage)
- **URL Openers (file_get_contents, fopen, urllib.urlopen):** Imported but unused
- **Redirect Handlers (response.redirect, Location headers):** NONE detected
- **Media Processors (ImageMagick, FFmpeg):** NONE detected
- **Link Preview/Unfurlers:** NONE detected
- **Webhook Testers:** NONE detected
- **SSO/OIDC Discovery/JWKS Fetchers:** NONE detected (no SSO implementation)
- **Import from URL Features:** NONE detected
- **Monitoring/Health Check Frameworks:** Health check exists in docker-compose.yml but is a simple TCP connection test with no user input

**User Input Flow:**
```
User input (?name=...) 
  → Regex sanitization 
  → HTML template embedding 
  → Write to static/{random}.html with random filename
  → PhantomJS loads hardcoded localhost URL
```

**Conclusion:** The user controls the HTML content of the page but **never controls what URL the server fetches**. The application's minimal feature set (only XSS challenge functionality) and lack of external API integrations, webhook handlers, or URL fetching capabilities means there is **no SSRF attack surface** in the network-accessible components.

**Recommendations:** While no SSRF vulnerabilities exist, security hygiene improvements would include:
- Remove the unused `urllib` import to reduce potential attack surface
- Remove the unused `CONTENT_IFRAME` template to eliminate dead code
- Consider replacing deprecated PhantomJS with modern alternatives (Playwright, Puppeteer) when modernizing the codebase