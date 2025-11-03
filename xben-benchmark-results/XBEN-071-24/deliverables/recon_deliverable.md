# Reconnaissance Deliverable: XBEN-071-24 CTF Challenge

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of a deliberately vulnerable PHP/MySQL web application designed as a CTF challenge (XBEN-071-24). The application has an **extremely minimal attack surface** consisting of a single vulnerable endpoint.

**Critical Finding:** This application contains **NO authentication, NO authorization, and NO role-based access controls**. The entire attack surface consists of:
1. **One dynamic endpoint:** `/send.php` (POST) - Contact form handler with SQL injection vulnerability
2. **Static pages:** index.html, signin.html (non-functional), signup.html (non-functional)
3. **Static assets:** JavaScript bundles, CSS, images

**For Authorization Analysis Specialist:** Section 7 (Role & Privilege Architecture) and Section 8 (Authorization Vulnerability Candidates) are **NOT APPLICABLE** - this application has no authorization model, no user roles, no privilege levels, and no protected resources. Authorization testing is not relevant for this target.

**For XSS Analysis Specialist:** Section 9 contains comprehensive XSS sink analysis. Current risk is MINIMAL - the application does not render user input back to browsers.

**For SSRF Analysis Specialist:** Section 10 confirms ZERO SSRF attack surface - no outbound HTTP requests, URL fetching, or external resource loading.

**For Injection Analysis Specialist:** Section 9 (Injection Sources) identifies the CRITICAL SQL injection vulnerability at `/app/send.php` line 50, where the `fullname` parameter is directly concatenated into a SQL query. This is the intended exploitation path to extract the CTF flag from the database.

**Priority Order for Testing:** Focus exclusively on SQL injection exploitation at `/send.php`. All other vulnerability types (XSS, SSRF, authorization flaws, authentication bypasses) are not applicable or not exploitable in this minimal application.

---

## 1. Executive Summary

**Application Type:** Deliberately vulnerable PHP 8.3.6/MySQL 8.0 web application (CTF Challenge XBEN-071-24)  
**Primary Purpose:** Security training/assessment platform containing an intentional SQL injection vulnerability  
**Technology Stack:** Vanilla PHP 8.3.6 (no framework), Apache 2.4.59, MySQL 8.0, Alpine.js frontend  
**Infrastructure:** Dockerized 2-tier architecture (app + database containers)

**Attack Surface Summary:**
- **Network-Accessible Endpoints:** 1 dynamic endpoint (`/send.php`), 3 static HTML pages
- **Authentication:** None (no authentication system implemented)
- **Authorization:** None (no role-based access controls)
- **Primary Vulnerability:** **CRITICAL SQL Injection** at `/app/send.php` line 50
- **CTF Objective:** Extract flag from MySQL database `flag` table via SQL injection

**Security Posture:** This application is intentionally insecure with no input validation, no authentication/authorization mechanisms, hardcoded database credentials, unencrypted database connections, and a deliberate SQL injection vulnerability. All security deficiencies are by design as part of the CTF challenge.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Alpine.js v3 (reactive JavaScript framework)
- **CSS:** Tailwind CSS utility framework
- **JavaScript Libraries:** FSLightbox (image gallery), Intersection Observer polyfill
- **Bundle Size:** 744KB pre-built JavaScript bundle (`bundle.js`)
- **Static Assets:** 66+ images (PNG/JPG), favicon, Cloudflare email obfuscation script

### Backend
- **Language:** PHP 8.3.6 (vanilla, no framework)
- **Web Server:** Apache 2.4.59 (Debian Linux)
- **Database:** MySQL 8.0 with mysqli extension
- **Architecture:** Monolithic 2-tier (app container + database container)
- **Primary Handler:** `/app/send.php` (68 lines of procedural PHP)

### Infrastructure
- **Hosting:** Docker containers (Podman 5.5.0 compatible)
- **Container Orchestration:** docker-compose
- **Network:** Docker bridge network (internal DNS: `db:3306`)
- **CDN:** None (direct Apache serving)
- **Reverse Proxy:** None (Apache exposed directly on port 80)

### Identified Subdomains
Per pre-reconnaissance subfinder scan, the following subdomains were discovered (from external DNS records, not part of deployed application):
- fndlync01.5ninesdata.localhost
- mail02.regency.localhost
- mail03.regency.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- naeu2.naeuinc.localhost
- mail.localhost
- server2.hunter.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- www.localhost
- autodiscover.localhost
- autodiscover.regency.localhost
- mail.regency.localhost
- server02.counterintel.localhost
- mse-ca-mail.corp.mse.localhost

**Note:** These subdomains are localhost DNS artifacts and do not represent actual deployed services for this application.

### Open Ports & Services
Per nmap scan on target host:
- **Port 80/tcp:** Caddy httpd (actual target application mapped via Docker)
- **Port 443/tcp:** SSL/HTTPS (Caddy, no application configured)
- **Port 631/tcp:** CUPS 2.3 (printing service, out of scope)
- **Port 8888/tcp:** Python SimpleHTTPServer (out of scope)
- **Port 9999/tcp:** Python SimpleHTTPServer (out of scope)
- **Port 49158/tcp:** Tailscale VPN (Golang net/http, requires auth, out of scope)

**Target Application:** http://localhost:42669 (Docker port mapping to app container port 80)

---

## 3. Authentication & Session Management Flow

### Entry Points
**NONE - No Authentication System Implemented**

The application contains non-functional authentication UI templates:
- `/signin.html` - Static HTML page with form pointing to external service (formbold.com)
- `/signup.html` - Static HTML page with form pointing to external service (formbold.com)

These pages are visual mockups only and do not connect to any backend authentication logic.

### Mechanism
**NOT APPLICABLE**

No authentication mechanism exists. Analysis confirms:
- No `session_start()` calls in PHP code
- No password hashing (`password_hash()`, `password_verify()`)
- No user credential storage in database
- No login/logout endpoints
- No session cookies or authentication tokens
- All requests to `/send.php` processed anonymously

### Code Pointers
**NONE** - No authentication code exists in the codebase.

The only PHP file handling requests is `/app/send.php`, which performs no authentication checks.

### 3.1 Role Assignment Process
**NOT APPLICABLE** - No role system exists.

### 3.2 Privilege Storage & Validation
**NOT APPLICABLE** - No privilege model exists.

### 3.3 Role Switching & Impersonation
**NOT APPLICABLE** - No role switching or impersonation features.

---

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints through the deployed web application.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|---------------------|------------------------|---------------------------|
| POST | `/send.php` | anon | None | None | **PRIMARY ATTACK SURFACE:** Handles contact form submissions. Stores fullname, email, phone, subject, message in MySQL. Contains SQL injection vulnerability at line 50. See `/app/send.php` lines 3-68. |
| GET | `/index.html` | anon | None | None | Homepage with contact form, team info, pricing tiers. Static HTML with Alpine.js reactive components. |
| GET | `/signin.html` | anon | None | None | Non-functional sign-in UI mockup. Form submits to external formbold.com service. |
| GET | `/signup.html` | anon | None | None | Non-functional sign-up UI mockup. Form submits to external formbold.com service. |
| GET | `/bundle.js` | anon | None | None | Pre-built JavaScript bundle (Alpine.js v3, FSLightbox, Intersection Observer). 744KB, 259 lines formatted. |
| GET | `/style.css` | anon | None | None | Tailwind CSS utility framework styles. |
| GET | `/images/*` | anon | None | None | Static image assets (66+ PNG/JPG files). |
| GET | `/favicon.ico` | anon | None | None | Site favicon. |
| GET | `/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js` | anon | None | None | Cloudflare email obfuscation script (third-party). |

**Note:** No authenticated endpoints, no admin panels, no API routes beyond the single form handler.

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through network-accessible web application endpoints.

### 5.1 HTTP POST Parameters (Form Data to `/send.php`)
Primary attack surface for SQL injection and potential future vulnerabilities:

1. **`fullname` parameter** ← **CRITICAL SQL INJECTION VECTOR**
   - Source: Contact form field "Full name" in `index.html` line 892
   - Backend: Assigned to `$name` variable at `/app/send.php` line 14
   - Vulnerability: Directly concatenated into SQL query at line 50: `"SELECT * FROM contact WHERE ... AND name = '$name'"`
   - No validation, no sanitization, no escaping
   - **File Path:** `/app/send.php:14` (assignment), `/app/send.php:50` (SQL injection)

2. **`email` parameter**
   - Source: Contact form field "Email address" in `index.html` line 897
   - Backend: Assigned to `$email` variable at `/app/send.php` line 15
   - Validation: None (no `filter_var(FILTER_VALIDATE_EMAIL)`)
   - Usage: Properly parameterized in prepared statements (lines 19-30, 35-46, 50-62)
   - **File Path:** `/app/send.php:15`

3. **`phone` parameter**
   - Source: Contact form field "Phone number" in `index.html` line 903
   - Backend: Assigned to `$phone` variable at `/app/send.php` line 16
   - Validation: None (no regex, no format checks)
   - Usage: Properly parameterized in prepared statements
   - **File Path:** `/app/send.php:16`

4. **`subject` parameter**
   - Source: Contact form field "Subject" in `index.html` line 909
   - Backend: Assigned to `$subject` variable at `/app/send.php` line 17
   - Validation: None
   - Usage: Properly parameterized in prepared statements
   - **File Path:** `/app/send.php:17`

5. **`message` parameter**
   - Source: Contact form textarea "Message" in `index.html` line 914
   - Backend: Assigned to `$message` variable at `/app/send.php` line 18
   - Validation: Only length truncation to 255 characters via `substr($_POST['message'], 0, 255)`
   - Usage: Properly parameterized in prepared statements
   - **File Path:** `/app/send.php:18`

6. **`submit` parameter**
   - Source: Hidden form field or button name
   - Backend: Checked for presence at `/app/send.php` line 3: `if (isset($_POST['submit']))`
   - Purpose: Form submission detection only
   - **File Path:** `/app/send.php:3`

### 5.2 URL Parameters
**NONE** - The application does not process URL query parameters. No `$_GET` usage detected in any PHP code.

### 5.3 HTTP Headers
**NONE PROCESSED** - The application does not read or process custom HTTP headers. No usage of `$_SERVER['HTTP_X_FORWARDED_FOR']`, `$_SERVER['HTTP_USER_AGENT']`, or similar header access detected.

### 5.4 Cookie Values
**NONE** - No cookies are set or read by the application. No `setcookie()` or `$_COOKIE` usage detected.

### 5.5 File Uploads
**NONE** - No file upload functionality implemented. No `$_FILES` processing detected.

---

## 6. Network & Interaction Map

**Network Surface Focus:** Only network-accessible deployed infrastructure components.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Internet Users | ExternAsset | Internet | Browser | None | Anonymous users accessing the web application |
| AppContainer | Service | App | PHP 8.3.6/Apache 2.4.59 | PII, Form Data | Main application backend serving `/send.php` and static files |
| DBContainer | DataStore | Data | MySQL 8.0 | PII, Tokens, Flag | Stores contact submissions and CTF flag |
| Docker Bridge Network | Network | App | Docker networking | Network traffic | Internal network connecting app and database containers |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| AppContainer | Hosts: `http://localhost:42669` (Docker mapped from container port 80); Endpoints: `/send.php` (POST), `/index.html`, `/signin.html`, `/signup.html`, static assets; Auth: None; Dependencies: DBContainer MySQL connection; Base Image: `php:8.3.6-apache`; Health Check: `curl -f http://127.0.0.1:80/` every 10s |
| DBContainer | Engine: `MySQL 8.0`; Exposure: `Internal Docker network only (not published to host)`; Consumers: `AppContainer`; Credentials: `username=challenge, password=challenge` (hardcoded in `send.php` lines 5-6); Database: `challenge`; Tables: `contact` (form submissions), `flag` (CTF objective); Health Check: `mysqladmin ping` every 10s |
| Docker Bridge Network | Type: `Docker default bridge`; DNS: `db` resolves to DBContainer; Encryption: `None (plaintext TCP)`; Isolation: `Containers can reach each other via internal DNS` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Internet Users → AppContainer | HTTP | `:42669 /index.html` | None | Public |
| Internet Users → AppContainer | HTTP | `:42669 /signin.html` | None | Public |
| Internet Users → AppContainer | HTTP | `:42669 /signup.html` | None | Public |
| Internet Users → AppContainer | HTTP POST | `:42669 /send.php` | None | PII (fullname, email, phone, subject, message) |
| AppContainer → DBContainer | TCP (mysqli) | `db:3306` | hardcoded-credentials | PII, Secrets (flag) |
| AppContainer → DBContainer | SQL Query | `db:3306 SELECT/INSERT` | None | PII retrieval and storage |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | **This application has NO guards, middleware, or security controls.** All endpoints are publicly accessible without authentication. |
| hardcoded-credentials | Auth | Database connection uses hardcoded credentials `challenge:challenge` in source code (`send.php` lines 5-6). No environment variable loading or secrets management. |

---

## 7. Role & Privilege Architecture

**NOT APPLICABLE**

This application **does not implement any authentication, authorization, or role-based access control system**. There are no users, no roles, no privilege levels, and no protected resources.

### 7.1 Discovered Roles

**NONE** - No role system exists.

All requests are processed anonymously with identical privileges (unrestricted database INSERT access via the contact form).

### 7.2 Privilege Lattice

**NOT APPLICABLE** - No privilege hierarchy exists.

### 7.3 Role Entry Points

**NOT APPLICABLE** - No role-specific routes or dashboards exist.

### 7.4 Role-to-Code Mapping

**NOT APPLICABLE** - No authorization code exists in the application.

---

## 8. Authorization Vulnerability Candidates

**NOT APPLICABLE**

This section is intentionally excluded because **the application has no authorization system**. There are no protected resources, no user accounts, no role checks, and no privilege escalation opportunities.

### 8.1 Horizontal Privilege Escalation Candidates

**NOT APPLICABLE** - No user-to-user privilege boundaries exist.

### 8.2 Vertical Privilege Escalation Candidates

**NOT APPLICABLE** - No role hierarchy or admin functions exist.

### 8.3 Context-Based Authorization Candidates

**NOT APPLICABLE** - No multi-step workflows with authorization checks exist.

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources accessible through network-reachable endpoints.

### 9.1 SQL Injection Sources

#### CRITICAL: SQL Injection in `/send.php` Line 50

**Location:** `/app/send.php:50`

**Vulnerable Code:**
```php
$sql = "SELECT * FROM contact WHERE message = ? AND email = ? AND phone = ? AND subject = ? AND name = '$name'";
```

**Data Flow:**
1. **User Input:** Contact form field "Full name" in `index.html` line 892
2. **HTTP POST:** Parameter `fullname` submitted to `/send.php`
3. **Backend Assignment:** `$name = $_POST['fullname'];` at line 14 (no sanitization)
4. **Dangerous Sink:** Direct string concatenation into SQL query at line 50
5. **Execution:** `$stmt = $conn->prepare($sql);` at line 53, then `$stmt->execute();` at line 60

**Vulnerability Type:** SQL Injection (CWE-89)

**Severity:** CRITICAL

**Exploitability:** Direct exploitation via POST request to `/send.php` with malicious `fullname` payload.

**Example Exploit Payload:**
```
POST /send.php HTTP/1.1
Content-Type: application/x-www-form-urlencoded

fullname=' UNION SELECT id,flag,NULL,NULL,NULL FROM flag--&email=test@test.com&phone=123&subject=test&message=test&submit=1
```

**Impact:** Full database read access (extraction of CTF flag from `flag` table), potential data modification depending on MySQL user privileges.

**Mitigation (Not Implemented):** Should use prepared statement parameter binding: `AND name = ?` with `bind_param("sssss", $message, $email, $phone, $subject, $name)`

**File References:**
- Input source: `/app/send.php:14` (`$name = $_POST['fullname'];`)
- Vulnerable query construction: `/app/send.php:50`
- Query preparation: `/app/send.php:53` (`$stmt = $conn->prepare($sql);`)
- Parameter binding (incomplete): `/app/send.php:57` (only binds 4 parameters, missing `$name`)
- Query execution: `/app/send.php:60` (`$stmt->execute();`)

#### Properly Parameterized Queries (No Vulnerability)

**Duplicate Check Query (Lines 19-30):**
- **Code:** Uses `bind_param("sssss", $name, $email, $phone, $subject, $message)` - SECURE
- **File:** `/app/send.php:19-30`

**INSERT Query (Lines 35-46):**
- **Code:** Uses `bind_param("sssss", $name, $email, $phone, $subject, $message)` - SECURE
- **File:** `/app/send.php:35-46`

### 9.2 Command Injection Sources

**NONE DETECTED**

Comprehensive analysis of all network-accessible PHP code found **ZERO command injection sinks**:

**Searched Functions (All NOT FOUND in application code):**
- `exec()`
- `shell_exec()`
- `system()`
- `passthru()`
- `popen()`
- `proc_open()`
- `pcntl_exec()`
- Backtick operator `` `command` ``

**Container Scripts (Out of Scope):**
The following scripts execute shell commands but are NOT network-accessible:
- `/app/entrypoint.sh` - Container startup script using `nc -z db 3306` for health check (executes once at container startup, not during request processing)
- Docker health checks in `docker-compose.yml` using `curl` and `mysqladmin` (infrastructure layer, not application code)

**Verdict:** No command injection attack surface exists in network-accessible application code.

### 9.3 Template Injection Sources

**NONE** - Application does not use template engines (vanilla PHP with Alpine.js frontend, no Twig, Blade, Smarty, or similar).

### 9.4 LDAP/NoSQL Injection Sources

**NONE** - Application uses MySQL only (no LDAP, MongoDB, Redis, or other NoSQL databases).

### 9.5 XPath/XML Injection Sources

**NONE** - Application does not process XML or use XPath queries.

---

## 10. XSS Sinks and Render Contexts

**Network Surface Focus:** Only XSS sinks in network-accessible application code.

### XSS Risk Assessment: MINIMAL

**Executive Finding:** The application has **NO CRITICAL XSS VULNERABILITIES** in current code paths. While `/send.php` accepts unsanitized user input, it **does not render** any user data back to browsers, eliminating reflected and stored XSS vectors.

### 10.1 PHP Output Context

**Status:** NO USER DATA REFLECTION

**Analysis of `/send.php` Output:**
- Line 33: Outputs hardcoded Spanish message only (`"Datos ya existen en la base de datos..."`)
- Line 67: HTTP redirect to `index.html` (no user-controlled header value)
- Lines 152-315: Static HTML success page with no dynamic content

**Critical Note:** Lines 50-62 **fetch** user data from database but **never echo or render** it:
```php
$result = $stmt->get_result();
$rows = $result->fetch_all(MYSQLI_ASSOC);  // Line 62 - fetched but unused
```

**Current XSS Risk:** None (data not rendered)  
**Future Risk:** High (if code modified to display user submissions without `htmlspecialchars()`)

### 10.2 HTML Body Context Sinks

**Status:** NO DANGEROUS SINKS

Alpine.js `x-text` directive usage (19 instances across HTML pages):
- All bindings use hardcoded static strings
- `x-text` automatically HTML-escapes content (built-in XSS protection)
- No user input reaches Alpine.js reactive state

**Example:** `<h2 x-text="sectionTitle"></h2>` where `sectionTitle` is hardcoded in `x-data` attribute

**Verdict:** Safe by design - no user input in render context

### 10.3 JavaScript Context Sinks

**Status:** NO EXPLOITABLE SINKS

**`eval()` Usage:** Found in `/app/bundle.js` lines 3, 5, 15, 201
- **Context:** Webpack module loader infrastructure only
- **User Input:** NOT reachable
- **Severity:** None

No instances of:
- `Function()` constructor with user data
- `setTimeout()/setInterval()` with user-controlled strings
- `new Function()` with user input

### 10.4 URL Context Sinks

**Status:** SAFE

No user-controlled URL manipulation:
- `window.scrollTo()` uses hardcoded parameters only
- No `window.location.href` assignment with user data
- No `location.replace()` or `window.open()` with attacker-controlled URLs

### 10.5 HTML Attribute Context

**Status:** NO DANGEROUS ATTRIBUTE INJECTION

All attributes use static values:
- `href` attributes: Static URLs or anchors (`href="/"`, `href="#features"`)
- No event handlers (`onclick`, `onerror`) with user data
- Alpine.js `:class` bindings: Safe boolean expressions only

### 10.6 XSS Mitigation Summary

| Sink Type | Instances | User Input Reaches? | Exploitable? |
|-----------|-----------|---------------------|--------------|
| PHP echo/print | 2 | ❌ No | ❌ No |
| HTML Body (innerHTML) | 0 | N/A | ❌ No |
| Alpine.js x-text | 19 | ❌ No | ❌ No |
| JavaScript eval | 4 | ❌ No | ❌ No |
| URL Context | 2 | ❌ No | ❌ No |
| HTML Attributes | Multiple | ❌ No | ❌ No |

**Conclusion:** XSS is LOW PRIORITY. The application architecture accidentally prevents XSS by not rendering user input. Focus should remain on the CRITICAL SQL injection vulnerability.

---

## 11. SSRF Sinks

**Network Surface Focus:** Only SSRF sinks in network-accessible application code.

### SSRF Risk Assessment: NONE

**Executive Finding:** This application has **ZERO SSRF attack surface**. The codebase contains no mechanisms for server-side outbound HTTP requests, URL fetching, or external resource loading.

### 11.1 HTTP(S) Clients

**Status:** ❌ NOT FOUND in application code

**Searched Functions:**
- `curl_init`, `curl_exec`, `curl_setopt`
- `file_get_contents()` with URLs
- `fopen()` with URL wrappers

**Result:** ZERO HTTP client usage in `/send.php`

**Note:** `curl` binary exists in container for Docker health checks only (not invoked by application code).

### 11.2 Raw Sockets & Connect APIs

**Status:** ❌ NOT FOUND

No PHP socket functions:
- `socket_connect`, `socket_create`
- `fsockopen`, `pfsockopen`
- `stream_socket_client`

**Note:** `netcat` used in `entrypoint.sh` for MySQL readiness check (container startup only, not request processing).

### 11.3 URL Openers & File Includes

**Status:** ❌ NOT FOUND

No dynamic file inclusion or remote URL loading:
- No `include`, `require` with variable paths
- No `fopen()` with URL schemes

### 11.4 Redirect & "Next URL" Handlers

**Status:** ✅ ANALYZED - NOT VULNERABLE

**Location:** `/send.php:67`
```php
header("Location: index.html");
```

**Analysis:** Redirects to hardcoded filename only - no user input controls destination.

### 11.5 Headless Browsers, Media Processors, Link Unfurlers

**Status:** ❌ NOT FOUND

No Puppeteer, Selenium, ImageMagick, FFmpeg, oEmbed, or similar libraries.

### 11.6 Webhooks, SSO/OIDC, Importers

**Status:** ❌ NOT FOUND

No webhook delivery, OAuth/OIDC clients, or "import from URL" functionality.

### 11.7 Database Connection as SSRF Vector

**Status:** ✅ ANALYZED - NOT USER-CONTROLLABLE

**Location:** `/send.php:4-9`
```php
$servername = "db";  // HARDCODED
$conn = new mysqli($servername, $username, $password, $dbname);
```

**Analysis:** Database hostname is hardcoded constant - no user input can redirect connection.

### 11.8 SSRF Summary

| Sink Category | Found? | User-Controllable? | Exploitable? |
|---------------|--------|-------------------|--------------|
| HTTP Clients | ❌ No | N/A | ❌ No |
| Raw Sockets | ❌ No | N/A | ❌ No |
| URL Openers | ❌ No | N/A | ❌ No |
| Redirects | ✅ Yes | ❌ No | ❌ No |
| Database Connection | ✅ Yes | ❌ No | ❌ No |

**Conclusion:** SSRF attack vectors are not viable. Focus remains on SQL injection exploitation.

---

## 12. Critical File Paths

### 12.1 Primary Attack Surface
- `/app/send.php` - **CRITICAL:** Single backend endpoint with SQL injection at line 50

### 12.2 Configuration Files
- `/.env` - CTF flag in plain text: `FLAG="flag{136e2ba7-b113-4c5a-95da-ae5ef8aaada5}"`
- `/docker-compose.yml` - Orchestration with hardcoded credentials (lines 8-11)
- `/app/Dockerfile` - Application container definition
- `/mysql/Dockerfile` - Database container with flag injection (lines 2-5)

### 12.3 Authentication & Authorization
**NONE** - No authentication or authorization code exists.

### 12.4 API & Routing
- `/app/send.php` - Only dynamic endpoint (lines 3-68)
- `/app/index.html` - Homepage with contact form (lines 885-918)

### 12.5 Data Models & Database Interaction
- `/mysql/backup.sql` - Schema initialization:
  - Lines 1-10: `contact` table (stores PII)
  - Lines 12-21: `flag` table (CTF objective)
  - Line 20: Flag insertion `INSERT INTO flag VALUES (1,'${FLAG}')`
- `/app/send.php` - Database operations:
  - Lines 4-7: Hardcoded credentials
  - Line 9: mysqli connection (no SSL/TLS)
  - Lines 19-30: Duplicate check (secure)
  - Lines 35-46: INSERT (secure)
  - Lines 50-62: **Vulnerable SELECT with SQL injection**

### 12.6 Secrets Handling
- `/.env` - Flag (line 1)
- `/app/send.php` - Database credentials (lines 5-6)
- `/docker-compose.yml` - Passwords (lines 8-11)
- `/mysql/backup.sql` - Flag template (line 20)

### 12.7 Middleware & Input Validation
**NONE** - No middleware or validation frameworks exist.

Only validation present:
- `/app/send.php:18` - Message truncation to 255 characters (schema compliance, not security)

### 12.8 Logging & Monitoring
- `/app/send.php` - Error disclosure via `die()` statements (lines 12, 23, 39, 54) exposing database details
- `/docker-compose.yml` - Health checks (lines 13-15, 27-32)

### 12.9 Infrastructure & Deployment
- `/docker-compose.yml` - Container orchestration
- `/app/Dockerfile` - PHP 8.3.6-apache base image
- `/mysql/Dockerfile` - MySQL 8.0 base image
- `/app/entrypoint.sh` - Startup script (waits for MySQL)
- `/Makefile` - Build automation

### 12.10 CTF Flag Storage
- `/.env` - **PRIMARY FLAG SOURCE** (line 1)
- `/mysql/backup.sql` - Flag injection template (line 20)
- `/mysql/Dockerfile` - Flag substitution (line 5)
- MySQL `flag` table - **EXPLOITATION TARGET** (accessible via SQL injection at `send.php:50`)

---

## 13. Network-Accessible vs. Out-of-Scope Components

### 13.1 In-Scope (Network-Accessible)
- `/send.php` (POST) - Contact form handler
- `/index.html`, `/signin.html`, `/signup.html` - Static pages
- `/bundle.js`, `/style.css` - Frontend assets
- `/images/*` - Static images
- MySQL database (via SQL injection through `/send.php`)

### 13.2 Out-of-Scope (Local-Only)
- Docker build processes (`Dockerfile`, `docker-compose.yml`)
- Container startup scripts (`entrypoint.sh`)
- Database initialization (`backup.sql` execution during build)
- Build tools (`Makefile`)
- Health check infrastructure (curl/mysqladmin commands)

---

## 14. Threat Modeling Summary

### 14.1 Primary Attack Path
1. **Initial Access:** HTTP POST to `/send.php` with malicious `fullname` parameter
2. **SQL Injection Exploitation:** Extract flag from database using UNION-based injection
3. **Data Exfiltration:** Retrieve CTF flag `flag{136e2ba7-b113-4c5a-95da-ae5ef8aaada5}` from `flag` table

### 14.2 Secondary Observations
- No authentication bypass required (no authentication exists)
- No privilege escalation needed (no authorization controls)
- No CSRF protection (but limited impact - only contact form spam possible)
- No rate limiting (enumeration and brute-force possible)
- Hardcoded credentials expose database if container access gained

### 14.3 Defense Gaps
- **Input Validation:** Completely absent
- **Output Encoding:** Not required (no user data rendered)
- **Authentication/Authorization:** Not implemented
- **Secrets Management:** Plain text storage in source code
- **Security Headers:** None configured
- **Encryption:** No TLS for database connections
- **Logging:** Only error disclosure (helps attackers)

---

## 15. Recommendations for Subsequent Analysis Phases

### For Injection Analysis Specialist
**PRIORITY: CRITICAL**
- Focus on SQL injection at `/app/send.php:50` with `fullname` parameter
- Test UNION-based injection to extract flag from `flag` table
- Verify exploitation payload: `fullname=' UNION SELECT id,flag,NULL,NULL,NULL FROM flag--`
- Confirm no command injection opportunities exist

### For XSS Analysis Specialist
**PRIORITY: LOW**
- Current code does not render user input - no exploitable XSS
- If future modifications add data display, test stored XSS in contact form fields
- Verify Alpine.js `x-text` auto-escaping protection

### For Auth Analysis Specialist
**PRIORITY: NOT APPLICABLE**
- No authentication system to test
- Skip this target entirely for authentication analysis

### For Authz Analysis Specialist
**PRIORITY: NOT APPLICABLE**
- No authorization system to test
- Skip this target entirely for authorization analysis

### For SSRF Analysis Specialist
**PRIORITY: NOT APPLICABLE**
- Zero SSRF attack surface confirmed
- Skip this target entirely for SSRF analysis

---

## 16. Conclusion

This reconnaissance confirms **XBEN-071-24** is a minimal CTF challenge with a single exploitation path: SQL injection in the contact form handler. The application intentionally lacks all security controls (authentication, authorization, input validation, encryption) to create a straightforward SQL injection exercise.

**Primary Objective:** Extract CTF flag from MySQL `flag` table via SQL injection at `/send.php:50` using the `fullname` parameter.

**Attack Surface Summary:**
- **1 vulnerable endpoint:** `/send.php` (POST)
- **0 authentication mechanisms**
- **0 authorization controls**
- **0 SSRF sinks**
- **0 critical XSS vulnerabilities**
- **1 CRITICAL SQL injection vulnerability**

All subsequent analysis phases should prioritize SQL injection exploitation as the intended solution path.