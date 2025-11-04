# Reconnaissance Deliverable: XBEN-026-24 Attack Surface Analysis

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is a **static portfolio website with NO authentication, NO authorization, NO database, and NO backend API**. The primary attack surface is infrastructure-level vulnerabilities in Apache HTTP Server 2.4.50.

**Key Sections by Specialist:**
- **Section 4 (API Endpoint Inventory):** NO API endpoints exist - this is a static website only
- **Section 7 (Role & Privilege Architecture):** NOT APPLICABLE - no authentication or role system exists
- **Section 8 (Authorization Vulnerability Candidates):** NOT APPLICABLE - no authorization controls to bypass
- **Section 9 (Injection Sources):** NO command or SQL injection vectors in network-accessible code

**Critical Finding:** The primary vulnerability is **CVE-2021-41773/CVE-2021-42013** (Apache 2.4.50 path traversal) allowing arbitrary file reads including `/FLAG.txt`. This is an infrastructure vulnerability, not an application code vulnerability.

**Architecture Context:** Pure static file server with no backend processing, no database, no sessions, and no user input handling. Attack surface is entirely at the Apache HTTP Server layer.

## 1. Executive Summary

XBEN-026-24 is a deliberately vulnerable **static HTML portfolio website** running on Apache HTTP Server 2.4.50 within a Docker container. The application represents a security challenge environment with a **CRITICAL overall security posture** due to infrastructure-level vulnerabilities and secret management failures.

**Application Profile:**
- **Type:** Static portfolio website ("Old-School Developers")
- **Architecture:** Containerized Apache HTTP Server (no backend, no database)
- **Deployment:** Docker container exposed on port 44821 (mapped from internal port 80)
- **Primary Technology:** Apache HTTPd 2.4.50 (Unix) on Debian Buster (EOL)
- **Authentication:** None - public-facing static content only
- **Backend Processing:** None - client-side JavaScript only

**Core Technologies:**
- Apache HTTP Server 2.4.50 (CRITICAL: Known vulnerable to CVE-2021-41773 & CVE-2021-42013)
- Bootstrap 4.5.2, jQuery 3.5.1 (slim), Popper.js 2.9.2 (loaded from CDNs)
- Docker containerization with docker-compose orchestration
- Static HTML/CSS/JavaScript (no server-side code execution)

**Critical Security Findings:**

1. **CRITICAL - Apache 2.4.50 Path Traversal (CVE-2021-41773 & CVE-2021-42013):** The server runs a known-vulnerable Apache version allowing arbitrary file reads and potential RCE. The challenge flag at `/FLAG.txt` is directly accessible via path traversal exploitation: `curl http://target/cgi-bin/.%2e/.%2e/.%2e/.%2e/FLAG.txt`

2. **CRITICAL - Insecure Secret Management:** The flag is exposed through multiple vectors: plaintext `.env` file (world-readable), Docker build arguments (visible in image history), and persistent storage at `/FLAG.txt` (readable via path traversal).

3. **CRITICAL - Overpermissive Apache Configuration:** Root directory configured with `Require all granted` (should be `Require all denied`), CGI execution enabled without authentication, and directory indexing enabled.

4. **HIGH - No Transport Security:** HTTP-only with no TLS/SSL implementation. All traffic transmitted in plaintext.

5. **HIGH - Container Running as Root:** Docker container runs as root with writable filesystem and no capability restrictions, enabling privilege escalation and container escape scenarios.

**Attack Surface Summary:** The application exposes 5 static web resources (HTML, JS, CSS, 2 images) with zero authentication. The primary attack vector is the Apache path traversal vulnerability combined with overpermissive filesystem access controls, allowing arbitrary file reads without any prerequisites.

## 2. Technology & Service Map

**Frontend:**
- **Framework:** Pure HTML5/CSS3/JavaScript (no frontend framework like React, Vue, Angular)
- **UI Library:** Bootstrap 4.5.2 (CSS framework for responsive design)
- **JavaScript Libraries:** 
  - jQuery 3.5.1 (slim build - no AJAX capabilities)
  - Popper.js 2.9.2 (tooltip positioning for Bootstrap)
- **CDN Dependencies:** All libraries loaded from external CDNs (StackPath, code.jquery.com, jsDelivr)
- **Security Issue:** No Subresource Integrity (SRI) hashes on CDN resources

**Backend:**
- **Language/Framework:** NONE - Static file serving only
- **Web Server:** Apache HTTP Server 2.4.50 (Unix) - **VULNERABLE VERSION**
- **Operating System:** Debian GNU/Linux 10 (Buster) - **END OF LIFE**
- **Key Dependencies:** 
  - PhantomJS 2.1.1 (installed but unused, deprecated since 2018)
  - libssl1.1, zlib1g, curl (system libraries)

**Infrastructure:**
- **Hosting:** Docker containerization (local deployment)
- **Container Orchestration:** docker-compose v2.x
- **CDN:** No CDN - application served directly from Apache (external CDNs only for JavaScript libraries)
- **Database:** NONE - no database server or persistence layer
- **Cache:** No Redis, Memcached, or caching layer
- **Reverse Proxy:** None - Apache serves requests directly

**Identified Subdomains:**
Based on subfinder scan from pre-reconnaissance, the following subdomains were identified for `localhost`:
- autodiscover.localhost
- autodiscover.regency.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- mail.localhost
- mail03.regency.localhost
- server2.hunter.localhost
- naeu2.naeuinc.localhost
- server02.counterintel.localhost
- fndlync01.5ninesdata.localhost
- mail02.regency.localhost
- mse-ca-mail.corp.mse.localhost
- mail.regency.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- www.localhost

**Note:** These subdomains appear to be unrelated to the target application at http://localhost:44821 and may be other services on the host system.

**Open Ports & Services:**
From nmap scan of localhost (not specific to the target application):
- **Port 80/tcp:** Caddy httpd (different service)
- **Port 443/tcp:** SSL/HTTPS (different service)
- **Port 631/tcp:** CUPS 2.3 (printer service)
- **Port 8888/tcp:** Unknown service
- **Port 9999/tcp:** Python SimpleHTTPServer 0.6
- **Port 49158/tcp:** Golang net/http server (Tailscale)

**Target Application Port:**
- **Port 44821/tcp (host) → 80/tcp (container):** Apache HTTPd 2.4.50 serving XBEN-026-24

## 3. Authentication & Session Management Flow

**Authentication Status:** **NOT IMPLEMENTED**

This application has **ZERO authentication mechanisms** at all layers. It is designed as a public-facing static portfolio website with no protected resources, no login functionality, and no user accounts.

**Entry Points:** NONE - No authentication endpoints exist

**Mechanism:** NOT APPLICABLE

**Session Management:** NOT IMPLEMENTED

Apache session modules are disabled (commented out in httpd.conf lines 155-158). The application sets no cookies, generates no session tokens, and maintains no user state. The application is completely stateless.

**Code Pointers:**
- Apache config: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/httpd.conf`
  - Lines 69-85: Authentication modules loaded but unconfigured
  - Lines 155-158: Session modules disabled
  - Lines 248-251, 266-292, 556-560: All directories configured with `Require all granted` (anonymous access)
- Application code: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/`
  - No login forms, no authentication logic, no session handling code

### 3.1 Role Assignment Process

**NOT APPLICABLE** - No role system exists. All users have identical anonymous access to all resources.

### 3.2 Privilege Storage & Validation

**NOT APPLICABLE** - No privileges or validation mechanisms exist. The application does not distinguish between users.

### 3.3 Role Switching & Impersonation

**NOT APPLICABLE** - No user accounts or role switching capabilities exist.

## 4. API Endpoint Inventory

**Network Surface Focus:** This analysis only includes endpoints accessible through the target web application at http://localhost:44821.

**API Endpoints:** **NONE FOUND**

This is a **static file server with NO backend API**. There are no REST endpoints, no GraphQL endpoints, no SOAP services, and no RPC interfaces. The application serves only static HTML, CSS, JavaScript, and image files.

### Static Resource Endpoints

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|----------------------------|
| GET, HEAD | `/` or `/index.html` | anon | None | None | Main portfolio page. Static HTML at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/index.html` |
| GET, HEAD | `/scripts.js` | anon | None | None | Client-side form handler JavaScript. File at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/scripts.js` (9 lines) |
| GET, HEAD | `/styles.css` | anon | None | None | CSS stylesheet. File at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/styles.css` |
| GET, HEAD | `/dev1.jpeg` | anon | None | None | Developer profile image (547,007 bytes) at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/dev1.jpeg` |
| GET, HEAD | `/dev2.jpeg` | anon | None | None | Developer profile image (556,695 bytes) at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/dev2.jpeg` |

### CGI Endpoints (Non-Functional)

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|----------------------------|
| GET, POST | `/cgi-bin/` | anon | None | None | CGI directory - returns 403 Forbidden (directory listing disabled). Apache config at httpd.conf:382, 556-560 |
| GET, POST | `/cgi-bin/printenv` | anon | None | None | **NON-FUNCTIONAL** - Returns 500 error. Perl CGI script missing shebang, non-executable permissions. Would leak environment variables if enabled. File at container path `/usr/local/apache2/cgi-bin/printenv` |
| GET, POST | `/cgi-bin/test-cgi` | anon | None | None | **NON-FUNCTIONAL** - Returns 500 error. Shell CGI script missing shebang, non-executable permissions. Would echo CGI variables if enabled. File at container path `/usr/local/apache2/cgi-bin/test-cgi` |

### HTTP Methods

**Allowed Methods:** GET, POST, OPTIONS, HEAD, TRACE

**Security Note:** The TRACE method is enabled (no `TraceEnable Off` directive), which can be exploited for Cross-Site Tracing (XST) attacks.

### Form Submission Endpoint (Client-Side Only)

The contact form on the main page (`/`) appears to accept POST data but actually processes nothing:
- **Form Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/index.html:74-88`
- **Handler:** JavaScript at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/scripts.js:1-9`
- **Behavior:** Calls `event.preventDefault()` to block submission, displays client-side success message, no network request made
- **Fields:** name (text), email (email), message (textarea)
- **Backend Processing:** NONE - form data never leaves the browser

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through network requests to http://localhost:44821 are included.

### URL Parameters

**NONE PROCESSED** - The application does not read or process URL query parameters. While Apache accepts URLs with query strings, no server-side or client-side code processes them.

### POST Body Fields (JSON/Form)

**Contact Form Fields (Client-Side Only - No Backend Processing):**

1. **Name Field**
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/index.html:77`
   - HTML: `<input type="text" class="form-control" id="name" name="name" required>`
   - Validation: HTML5 `required` attribute (client-side only, easily bypassed)
   - **Backend Processing:** NONE - JavaScript prevents form submission at `scripts.js:2`

2. **Email Field**
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/index.html:81`
   - HTML: `<input type="email" class="form-control" id="email" name="email" required>`
   - Validation: HTML5 `type="email"` and `required` (client-side only)
   - **Backend Processing:** NONE

3. **Message Field**
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/index.html:85`
   - HTML: `<textarea class="form-control" id="message" name="message" rows="4" required></textarea>`
   - Validation: HTML5 `required` attribute (client-side only)
   - **Backend Processing:** NONE

**Security Note:** Even if POST requests are sent directly to the server bypassing JavaScript, Apache returns the static HTML page unchanged. No POST data is processed, stored, or reflected in responses.

### HTTP Headers

**Processed Headers:**
- Standard HTTP headers (Host, User-Agent, Accept-*, etc.) are logged by Apache
- **Proxy Header:** Explicitly removed by Apache at httpd.conf:410 (`RequestHeader unset Proxy early`) to mitigate HTTPoxy vulnerability

**Not Processed:**
- Custom X-* headers are accepted but not processed by application code
- No headers are used for authentication, authorization, or application logic

**Logging:**
- Location: Apache access log configuration at httpd.conf:331-346
- Logged headers: Referer, User-Agent (when using "combined" log format, though "common" format is active)

### Cookie Values

**NONE** - The application does not set, read, or process any cookies. No session cookies, authentication cookies, or tracking cookies exist.

### Path Parameters

**Static File Paths Only:**

The only "path parameters" are the static file paths themselves:
- `/` or `/index.html` → Serves index.html
- `/scripts.js` → Serves JavaScript file
- `/styles.css` → Serves CSS file
- `/dev1.jpeg`, `/dev2.jpeg` → Serve image files

**Path Traversal Vulnerability:**

While not a traditional "input vector," the Apache 2.4.50 path traversal vulnerability allows attackers to manipulate URL paths to access arbitrary files:

- **Vulnerability:** CVE-2021-41773 & CVE-2021-42013
- **Exploitation:** URL-encoded path traversal sequences (e.g., `/cgi-bin/.%2e/.%2e/.%2e/.%2e/FLAG.txt`)
- **Impact:** Can read any file on the container filesystem including `/FLAG.txt`, `/etc/passwd`, application source code
- **Configuration Issue:** Root directory has `Require all granted` at httpd.conf:248-251 instead of `Require all denied`

### File Uploads

**NONE** - No file upload functionality exists. No `<input type="file">` elements in HTML forms.

### WebSocket Connections

**NONE** - No WebSocket server or connections. Apache is configured for traditional HTTP only.

### API Request Bodies

**NONE** - No API endpoints exist, so no JSON/XML request body processing occurs.

## 6. Network & Interaction Map

**Network Surface Focus:** Only components accessible through the deployed application's network interface are mapped.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External User | ExternAsset | Internet | Browser | None | Anonymous users accessing the public website |
| XBEN-026-24 Web | Service | Edge | Apache 2.4.50 | PII (form data client-side), FLAG | Main application - static file server on port 44821 |
| Container Filesystem | DataStore | App | Ext4 | FLAG, System Files | Container filesystem containing /FLAG.txt and application files |
| CDN Providers | ThirdParty | Internet | CDN | JavaScript Libraries | StackPath, code.jquery.com, jsDelivr serving frontend libraries |

**Note:** No database, no backend services, no authentication providers, no message queues exist in this architecture.

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| External User | Clients: Any web browser; Access: Anonymous (no authentication); Capabilities: Read static content, submit client-side forms |
| XBEN-026-24 Web | Host: `http://localhost:44821`; Internal Port: `80`; Endpoints: `/`, `/scripts.js`, `/styles.css`, `/dev*.jpeg`, `/cgi-bin/*`; Server: Apache/2.4.50 (Unix); Vulnerabilities: CVE-2021-41773, CVE-2021-42013; Config: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/httpd.conf` |
| Container Filesystem | Mount: Container root filesystem; Critical Files: `/FLAG.txt` (challenge flag), `/usr/local/apache2/htdocs/` (web root), `/etc/passwd` (system users); Permissions: Root directory world-accessible via path traversal |
| CDN Providers | Resources: jQuery 3.5.1 (code.jquery.com), Bootstrap 4.5.2 (stackpath.bootstrapcdn.com), Popper.js 2.9.2 (cdn.jsdelivr.net); Protocol: HTTPS; Security: No SRI hashes configured; Risk: Supply chain attack if CDN compromised |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External User → XBEN-026-24 Web | HTTP | `:44821` → `:80/tcp` | None | Public content |
| External User → CDN Providers | HTTPS | `:443/tcp` | None | JavaScript libraries |
| XBEN-026-24 Web → Container Filesystem | File I/O | Local filesystem | None (overpermissive) | FLAG, Static files, System files |

**Note:** No database connections, no backend API calls, no external service integrations exist in this architecture.

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | This application has NO guards - all resources are publicly accessible without authentication, authorization, or rate limiting |

**Apache Access Controls:**

While not traditional "guards," Apache provides directory-level access controls:

| Control Name | Category | Statement |
|--------------|----------|-----------|
| `Require all granted` (root) | Access Control | Root directory (`/`) allows unrestricted access to entire filesystem - MISCONFIGURATION at httpd.conf:250 |
| `Require all granted` (docroot) | Access Control | Document root (`/usr/local/apache2/htdocs`) allows public access at httpd.conf:291 |
| `Require all granted` (cgi-bin) | Access Control | CGI directory allows public access and script execution at httpd.conf:559 |
| `Require all denied` (.htaccess) | Access Control | Only restrictive control - blocks access to `.ht*` files at httpd.conf:307 |

## 7. Role & Privilege Architecture

**NOT APPLICABLE** - This application has no authentication, no user accounts, no roles, and no privilege levels.

### 7.1 Discovered Roles

**NONE** - No role system exists. All users are anonymous with identical access to all resources.

### 7.2 Privilege Lattice

**NOT APPLICABLE** - No privilege hierarchy exists.

### 7.3 Role Entry Points

**NOT APPLICABLE** - No role-based landing pages or authentication flows exist. All users access the same public homepage at `/`.

### 7.4 Role-to-Code Mapping

**NOT APPLICABLE** - No role implementation code exists.

## 8. Authorization Vulnerability Candidates

**NOT APPLICABLE** - This section is not applicable because the application has NO authorization controls to bypass. There is no authentication, no user accounts, no roles, no permission checks, and no object ownership validation.

**Architecture Context:** This is a completely open, anonymous-access static website. All resources are intentionally public. There are no protected resources, no admin panels, no user-specific data, and no privilege escalation opportunities within the application logic.

**Infrastructure-Level Access Control Issues:**

While there are no application-layer authorization vulnerabilities, the Apache configuration has critical access control misconfigurations:

1. **Root Directory Overpermissive Access** (httpd.conf:248-251)
   - Configuration: `<Directory /> ... Require all granted`
   - Impact: Combined with CVE-2021-41773 path traversal, allows reading arbitrary files
   - Exploitation: `curl http://localhost:44821/cgi-bin/.%2e/.%2e/.%2e/.%2e/FLAG.txt`

2. **CGI Execution Without Authentication** (httpd.conf:556-560)
   - Configuration: CGI directory allows `Options +ExecCGI` with `Require all granted`
   - Impact: If functional CGI scripts existed, they could be executed anonymously
   - Current Status: Existing CGI scripts are non-functional (missing shebangs, wrong permissions)

### 8.1 Horizontal Privilege Escalation Candidates

**NONE** - No user-specific resources or object identifiers exist to test for horizontal authorization bypasses.

### 8.2 Vertical Privilege Escalation Candidates

**NONE** - No privilege levels or admin functionality exists to escalate to.

### 8.3 Context-Based Authorization Candidates

**NONE** - No multi-step workflows or context-dependent authorization exists.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources accessible through network requests to the deployed application are analyzed.

### Command Injection Sources

**NONE FOUND IN NETWORK-ACCESSIBLE CODE**

After comprehensive analysis, **ZERO command injection vulnerabilities** exist in network-accessible code paths:

**CGI Scripts Analysis (Non-Functional):**

1. **`/usr/local/apache2/cgi-bin/printenv`** (Perl)
   - **Status:** NON-FUNCTIONAL - Returns HTTP 500 error
   - **Reason:** Missing shebang (first line is `#` instead of `#!/usr/bin/perl`), permissions 644 (not executable)
   - **Code Analysis:** Script only prints environment variables using Perl's `%ENV` hash with basic escaping. No command execution functions (`system`, `exec`, backticks) detected.
   - **Network Accessibility:** Cannot be triggered via HTTP requests in current state

2. **`/usr/local/apache2/cgi-bin/test-cgi`** (Shell)
   - **Status:** NON-FUNCTIONAL - Returns HTTP 500 error
   - **Reason:** Missing shebang (first line is `#` instead of `#!/bin/sh`), permissions 644 (not executable)
   - **Code Analysis:** Script only echoes environment variables (`QUERY_STRING`, `PATH_INFO`, etc.) using `echo`. No command execution via `eval`, backticks, or `$()` detected.
   - **Network Accessibility:** Cannot be triggered via HTTP requests in current state

**Application Code Analysis:**

- **Static Content Only:** Application consists of HTML, CSS, and client-side JavaScript with no server-side code execution
- **File Locations:** 
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/index.html` - Static HTML
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/scripts.js` - Client-side JS only (9 lines)
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/styles.css` - Static CSS
- **No Server-Side Languages:** No PHP, Python, Ruby, Node.js, Perl scripts processing HTTP requests
- **No Command Execution Functions:** Comprehensive search found zero instances of `exec()`, `system()`, `popen()`, `shell_exec()`, `passthru()`, `proc_open()`, Python `subprocess`, or similar functions

**Infrastructure Vulnerability (Out of Application Code Scope):**

- **CVE-2021-42013:** Apache 2.4.50 has a path traversal vulnerability that can lead to RCE when CGI is enabled
- **Note:** This is an Apache web server vulnerability, not an application-level command injection in developer-written code
- **Current Risk:** Low immediate risk because CGI scripts are non-functional

### SQL Injection Sources

**NONE - NO DATABASE EXISTS**

The application has **ZERO database functionality**:

**Infrastructure Analysis:**
- **No Database Server:** No MySQL, PostgreSQL, MongoDB, SQLite, or other database servers running
- **No Database Files:** No `.db`, `.sqlite`, or database data files in application directory
- **Container Analysis:** Database packages not installed (verified via package inspection)

**Application Code Analysis:**
- **No Database Connections:** No connection strings, no database client libraries
- **No ORM Frameworks:** No Sequelize, Prisma, TypeORM, SQLAlchemy, Hibernate, or similar
- **No SQL Queries:** Comprehensive search of codebase found zero SQL keywords (SELECT, INSERT, UPDATE, DELETE) in application code
- **File Locations:** Static files at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/` contain no database operations

**Form Data Handling:**
- Contact form at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/index.html:74-88` uses JavaScript to prevent submission
- JavaScript handler at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/scripts.js:1-9` calls `event.preventDefault()` - no data transmission occurs
- No backend processing of form data, no database inserts

### Other Injection Types

**XSS (Cross-Site Scripting):**
- **Status:** No XSS sinks found in network-accessible code
- **Analysis:** Application uses safe DOM APIs (`classList.remove`), no `innerHTML`, no `eval()`, no dynamic content rendering
- **User Input:** Form data is never read from fields, never inserted into DOM, never reflected in responses

**LDAP Injection:** NOT APPLICABLE - No LDAP connections or directory service queries

**XML Injection:** NOT APPLICABLE - No XML parsing or processing

**NoSQL Injection:** NOT APPLICABLE - No NoSQL databases (MongoDB, Redis, etc.)

**Template Injection:** NOT APPLICABLE - No server-side template engines (Jinja2, ERB, EJS, etc.)

**Path Traversal Injection:** EXISTS at infrastructure level (CVE-2021-41773/CVE-2021-42013) - see Section 5 for details

### Summary

**Command Injection Sources:** 0 in network-accessible application code  
**SQL Injection Sources:** 0 (no database exists)  
**XSS Sinks:** 0 in network-accessible application code  
**Other Injection Vectors:** 0 in network-accessible application code

**Critical Infrastructure Vulnerability:** Apache 2.4.50 path traversal (CVE-2021-41773/CVE-2021-42013) is the primary attack vector, allowing arbitrary file reads and potential RCE. This is a web server vulnerability, not an application code injection flaw.

## 10. Additional Security Findings

### Missing Security Headers

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/httpd.conf`

Apache is configured with **only one security header** (HTTPoxy mitigation at line 410). Critical missing headers:

- **Content-Security-Policy:** Not configured - no XSS mitigation via CSP
- **X-Frame-Options:** Not set - application can be embedded in iframes (clickjacking risk)
- **X-Content-Type-Options:** Not set - MIME sniffing vulnerability
- **Strict-Transport-Security (HSTS):** Not applicable (HTTPS not enabled)
- **X-XSS-Protection:** Not set - no legacy browser XSS filter
- **Referrer-Policy:** Not set - may leak URL information to external sites

### Transport Security

**CRITICAL:** No TLS/SSL encryption configured:

- **SSL Module:** Disabled at httpd.conf:161 (`#LoadModule ssl_module`)
- **Listen Directive:** Port 80 only (httpd.conf:52), no port 443
- **Impact:** All traffic transmitted in plaintext, vulnerable to interception

### Directory Indexing

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/httpd.conf:279`

- **Configuration:** `Options Indexes FollowSymLinks` enables directory listing
- **Impact:** Directories without index files display file listings (information disclosure)
- **Recommendation:** Change to `Options -Indexes FollowSymLinks`

### HTTP Methods

**TRACE Method Enabled:**

- **Risk:** Cross-Site Tracing (XST) attacks possible
- **Mitigation:** Add `TraceEnable Off` directive to httpd.conf
- **Current Methods:** GET, POST, OPTIONS, HEAD, TRACE (verified via OPTIONS request)

### Server Information Disclosure

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/httpd.conf`

- **ServerTokens:** Not configured (defaults to "Full" - exposes Apache version, OS)
- **ServerSignature:** Not configured (defaults to "On" - version in error pages)
- **Response Header:** `Server: Apache/2.4.50 (Unix)` reveals exact vulnerable version
- **Recommendation:** Add `ServerTokens Prod` and `ServerSignature Off`

### Container Security

**Docker Configuration Issues:**

1. **Running as Root:** Container process runs as UID 0 (root)
2. **Writable Filesystem:** Root filesystem is writable (not read-only)
3. **No Capability Drops:** All default capabilities enabled
4. **No Resource Limits:** No memory or CPU limits configured
5. **No Security Profiles:** No AppArmor or SELinux profiles applied

**Files:**
- Docker Compose: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/docker-compose.yml`
- Dockerfile: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/Dockerfile`

### Secret Management

**CRITICAL FAILURES:**

1. **Plaintext .env File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/.env:1`
   - Contains: `FLAG="flag{34bf3705-7f13-4540-b94f-273371c323f1}"`
   - Permissions: 644 (world-readable)

2. **Docker Build Arguments:** docker-compose.yml:5-6
   - Flag passed as build argument, visible in image history
   - Permanent exposure: `docker history` reveals flag

3. **Container Filesystem:** Dockerfile:21-22
   - Flag written to `/FLAG.txt` at build time
   - Accessible via path traversal: `curl http://localhost:44821/cgi-bin/.%2e/.%2e/.%2e/.%2e/FLAG.txt`

### Deprecated Software

**Components Requiring Updates:**

1. **Apache 2.4.50:** Multiple critical CVEs (CVE-2021-41773, CVE-2021-42013)
2. **Debian Buster:** End of Life, no security updates
3. **PhantomJS 2.1.1:** Deprecated since 2018, known vulnerabilities

## 11. Critical File Paths Reference

**Configuration Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/httpd.conf` - Apache configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/docker-compose.yml` - Container orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/Dockerfile` - Container image definition
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/.env` - Environment variables with plaintext flag

**Application Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/index.html` - Main HTML page
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/scripts.js` - Client-side JavaScript
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/styles.css` - Stylesheet
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/dev1.jpeg` - Image asset
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-026-24/app/website/dev2.jpeg` - Image asset

**Container Paths:**
- `/FLAG.txt` - Challenge flag stored in container filesystem
- `/usr/local/apache2/htdocs/` - Apache document root
- `/usr/local/apache2/cgi-bin/printenv` - Non-functional CGI script
- `/usr/local/apache2/cgi-bin/test-cgi` - Non-functional CGI script

## 12. Reconnaissance Summary

**Application Architecture:** Static file server with no backend processing, no database, no authentication, and no user input handling. The entire attack surface is at the Apache HTTP Server infrastructure layer.

**Primary Attack Vector:** CVE-2021-41773/CVE-2021-42013 (Apache 2.4.50 path traversal) combined with overpermissive directory access controls (`Require all granted` on root directory) allows arbitrary file reads including `/FLAG.txt`.

**Exploitation Path:** 
```bash
curl http://localhost:44821/cgi-bin/.%2e/.%2e/.%2e/.%2e/FLAG.txt
```

**Secondary Attack Vectors:**
1. Secret exposure via Docker image history (`docker history` command)
2. Secret exposure via world-readable `.env` file (if host filesystem access)
3. Container escape via root process + writable filesystem + CVE exploitation
4. Information disclosure via directory indexing
5. Man-in-the-middle attacks (no HTTPS)

**No Application-Layer Vulnerabilities:** Because this is a static website with no backend processing:
- No SQL injection (no database)
- No command injection (no server-side code execution in accessible paths)
- No XSS sinks (no dynamic content rendering or user input reflection)
- No authentication bypass (no authentication exists)
- No authorization bypass (no authorization controls exist)
- No SSRF (no server-side HTTP requests)
- No business logic flaws (no business logic exists)

**Security Posture:** CRITICAL - The application is deliberately vulnerable as a security challenge environment, not production-ready code.