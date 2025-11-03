# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** This application has **ZERO authorization controls** at any level. There is no authentication system, no session management, no role-based access control, and no permission checking of any kind. The fundamental vulnerability is the **complete absence** of an authorization system, not a bypass of existing controls.
- **Externally Exploitable Findings:** 7 critical authorization vulnerabilities, all externally exploitable via http://localhost:8081 from the public internet
- **Purpose of this Document:** This report documents the systematic absence of authorization controls across horizontal (IDOR), vertical (privilege escalation), and context-based (workflow) authorization domains. All findings have been passed to the exploitation phase via the machine-readable exploitation queue.

**Critical Context for Exploitation:**
- Traditional authorization bypass techniques are unnecessary—every endpoint is already publicly accessible
- The application is completely stateless with no session management or user context tracking
- Network isolation exists (Nginx ACL restricts internal service to 172.0.0.0/8) but is bypassed by design via SSRF endpoint
- All findings chain together into a complete RCE path: SSRF → File Upload → Phar Deserialization → eval()

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Absence of Authentication Layer (Horizontal | Vertical | Context)
- **Description:** The application has NO authentication system whatsoever. No login/logout endpoints, no session management, no user identity tracking, no `$_SESSION` usage, no cookies, no JWT tokens, no OAuth—nothing.
- **Implication:** Every endpoint is publicly accessible by default. Traditional authorization testing (bypass techniques) is not applicable because there are no controls to bypass.
- **Representative:** ALL findings (AUTHZ-VULN-01 through AUTHZ-VULN-07)
- **Code Evidence:** Comprehensive codebase search found zero instances of: `session_start()`, `$_SESSION`, `setcookie()`, `$_COOKIE`, authentication headers, JWT validation, role checks, or permission validation functions.

### Pattern 2: Missing Ownership Validation (Horizontal)
- **Description:** Database operations accept user-supplied IDs without verifying the requesting user owns the resource
- **Implication:** Users can read and delete other users' SKU records by manipulating ID parameters
- **Representative:** AUTHZ-VULN-01 (View any SKU), AUTHZ-VULN-02 (Delete any SKU)
- **Code Evidence:** 
  - `/app/sku_product_detail.php:5-10` - Accepts `$_GET['id']` and executes SELECT without ownership check
  - `/app/sku_delete.php:4-8` - Accepts `$_POST['id']` and executes DELETE without ownership check
  - Database schema (`/app/database.php:7-12`) lacks `user_id` or `owner` column

### Pattern 3: Privileged Operations Without Role Checks (Vertical)
- **Description:** Administrative operations (SSRF, file upload, RCE, deletion) are accessible without role validation
- **Implication:** Unprivileged users can perform administrative actions including remote code execution
- **Representative:** AUTHZ-VULN-02 (Delete), AUTHZ-VULN-03 (SSRF), AUTHZ-VULN-04 (File Upload), AUTHZ-VULN-05 (RCE)
- **Code Evidence:**
  - `/app/sku_url.php:73-80` - SSRF endpoint with no role check before `file_get_contents()`
  - `/app/skumodel-srv/sku_process.php:9-18` - File upload with no role check before `file_put_contents()`
  - `/app/skumodel-srv/read_sku.php:10-22` - Deserialization with no role check before phar:// access

### Pattern 4: Network Isolation Bypass via SSRF (Vertical)
- **Description:** Internal service (port 4455) is restricted to Docker network (172.0.0.0/8) via Nginx ACL, but public SSRF endpoint bypasses this by proxying requests from inside the trusted network
- **Implication:** External attackers can access internal services that should be network-isolated
- **Representative:** AUTHZ-VULN-03 (SSRF bypass), AUTHZ-VULN-04 (File Upload via SSRF), AUTHZ-VULN-05 (RCE via SSRF)
- **Code Evidence:**
  - `/app/skumodel-srv/nginx.conf:17-19` - Network restriction: `allow 172.0.0.0/8; deny all;`
  - `/app/sku_url.php:19-21` - Hostname replacement: replaces `127.0.0.1/localhost` with `service` to facilitate bypass
  - `/app/sku_url.php:34` - Executes request from inside Docker network: `file_get_contents($url)`

### Pattern 5: No Workflow State Validation (Context)
- **Description:** Multi-step workflows (RCE attack chain, SKU management) lack sequential state validation
- **Implication:** Steps can be executed out of order, skipped entirely, or repeated without validation
- **Representative:** AUTHZ-VULN-06 (RCE workflow bypass), AUTHZ-VULN-07 (Delete without workflow validation)
- **Code Evidence:**
  - `/app/skumodel-srv/sku_process.php:9-28` - File upload endpoint does not validate prior SSRF step
  - `/app/skumodel-srv/read_sku.php:10-22` - Deserialization endpoint does not validate file was uploaded through proper workflow
  - `/app/sku_delete.php:4-8` - Delete endpoint does not validate ownership or workflow state

## 3. Strategic Intelligence for Exploitation

### Application Architecture Overview
- **Two-Container Microservices:**
  - **Webapp (public):** PHP 8.0/Apache on 0.0.0.0:8081 - handles user interactions, SQLite database, Twig rendering
  - **Service (isolated):** PHP 7.4/Nginx on 172.0.0.0/8:4455 - internal API for file uploads and Phar deserialization
- **Trust Boundary:** Nginx restricts service container to Docker internal network, but webapp's SSRF endpoint bypasses this intentionally
- **CTF Flag Location:** `/flag.txt` in service container (only accessible via RCE)

### Authentication & Session Management Architecture
- **NO AUTHENTICATION SYSTEM EXISTS:**
  - Zero authentication endpoints (`/login`, `/logout`, `/register` do not exist)
  - No session management (`session_start()` never called, `$_SESSION` never used)
  - No cookies created (`setcookie()` never called, `$_COOKIE` never read)
  - No JWT, OAuth, or API key validation
  - Application is completely stateless—no persistent user identity across requests

- **Cosmetic "Session ID" Feature:**
  - **File:** `/app/index.php:13-23`
  - **Class:** `RandomHash` generates random 32-character hex string
  - **Display:** Shows "temporally session id is {random}" in HTML
  - **Security Value:** ZERO - never validated, not stored, regenerated on every request, purely cosmetic

### Role/Permission Model
- **NO ROLE SYSTEM EXISTS:**
  - No user roles defined in code or database
  - No role assignment logic or permission checks
  - Database schema contains only `skus` table—no `users`, `roles`, or `permissions` tables
  - Every visitor has equivalent access (implicit anonymous/public role with full admin privileges)
  - Comprehensive codebase search found zero instances of: `isAdmin`, `hasRole`, `checkPermission`, `can()`, role validation, permission checking

### Resource Access Patterns
- **Direct Object Reference Without Ownership:**
  - Most endpoints use path/POST parameters for resource IDs (e.g., `/sku_product_detail.php?id={id}`, `POST /sku_delete.php` with `id`)
  - **Critical Finding:** ID parameters are directly passed to database queries (via prepared statements) without ownership validation
  - Database schema lacks user/org ownership columns—no way to validate "does this resource belong to the requesting user?"

- **Database Schema (SQLite):**
  ```sql
  CREATE TABLE IF NOT EXISTS skus (
      id INTEGER PRIMARY KEY,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT
  )
  ```
  - ❌ NO `user_id` or `owner` column
  - ❌ NO `status` or workflow state column
  - ❌ NO `created_by` or audit trail columns

### Workflow Implementation
- **NO WORKFLOW STATE TRACKING:**
  - Application is completely stateless—no session variables, tokens, nonces, or state flags
  - Multi-step workflows (RCE attack chain) lack sequential validation
  - **Critical Finding:** Each workflow step is independently accessible and does not validate prior state
  - Endpoints accept user-supplied parameters without verifying workflow context

- **RCE Attack Chain (3-Step Workflow):**
  1. SSRF endpoint (`/sku_url.php`) - Bypasses network isolation, NO state tracking
  2. File upload (`/sku_process` via SSRF) - Accepts arbitrary files, NO validation of prior SSRF step
  3. Deserialization (`/sku_read` via SSRF) - Triggers RCE, NO validation of file source or upload workflow

### Network Architecture & SSRF Bypass Mechanism
- **Nginx Network ACL (Internal Service):**
  - **File:** `/app/skumodel-srv/nginx.conf:17-19`
  - **Rules:** `allow 172.0.0.0/8; deny all;` - Restricts service to Docker internal network only
  - **Intent:** Prevent external attackers from accessing internal service endpoints

- **SSRF Bypass Implementation:**
  - **File:** `/app/sku_url.php:4-41`
  - **Mechanism:**
    1. Public endpoint accepts `POST['url']` parameter from external users (line 73)
    2. Validates URL format and requires port 4455 (lines 6-14)
    3. **Hostname replacement:** If URL contains `127.0.0.1` or `localhost`, replaces with `service` (lines 19-21)
    4. Makes POST request with hardcoded data from webapp container (lines 24-31)
    5. Webapp container is inside Docker network (172.x.x.x), so Nginx allows the request
    6. Response returned to external attacker (line 34)
  - **Result:** External attackers can proxy requests through webapp to access network-isolated internal service

- **Critical Intelligence:** 
  - Nginx network restriction is the ONLY security control in the entire application
  - This control is **intentionally bypassed** by the SSRF endpoint design
  - No application-level authorization to compensate for network bypass

### Critical File Paths & Gadgets
- **RCE Gadget Chain:**
  - **Upload:** `/app/skumodel-srv/sku_process.php:18` - `file_put_contents($filePath, $decodedData)` writes to `/tmp/{random}.jpg`
  - **Deserialization:** `/app/skumodel-srv/read_sku.php:14` - `file_get_contents('phar://' . $filePath . '/manifest')` triggers auto-deserialization
  - **Explicit Deserialization:** `/app/skumodel-srv/read_sku.php:22` - `unserialize($content)`
  - **RCE Gadget:** `/app/skumodel-srv/ReadClass.php:13` - `CustomTemplate::__wakeup()` contains `eval($this->data)`
  - **Alternative RCE:** `/app/skumodel-srv/ReadClass.php:17` - `CustomTemplate::render()` also contains `eval($this->data)`

- **PHP Configuration:**
  - **File:** `/app/skumodel-srv/Dockerfile:9`
  - **Setting:** `phar.readonly = Off` - Enables Phar archive creation and manipulation attacks

## 4. Vectors Analyzed and Confirmed Secure

**NONE - Zero secure authorization implementations found.**

The application has NO authorization controls at any level. There are no "secure by design" components to document because no authorization mechanisms exist.

**What Was Searched:**
- ✗ Session-based authentication (no `session_start()`, no `$_SESSION`)
- ✗ Cookie-based authentication (no `setcookie()`, no `$_COOKIE` checks)
- ✗ Token-based authentication (no JWT, OAuth, Bearer tokens)
- ✗ Role-based access control (no `isAdmin()`, `hasRole()`, permission checks)
- ✗ Ownership validation (no user-to-resource binding in database or code)
- ✗ Middleware/guards (no authentication middleware or decorators)
- ✗ CSRF protection (no tokens or validation)
- ✗ Workflow state validation (no status flags, tokens, nonces)

**Network-Level Controls (Not Application Authorization):**
- **Nginx ACL:** `/app/skumodel-srv/nginx.conf:17-19` - `allow 172.0.0.0/8; deny all;`
  - **Category:** Network-level access control, not application authorization
  - **Status:** Bypassed by design via SSRF endpoint in webapp
  - **Verdict:** NOT SECURE - Intentionally circumvented by application design

## 5. Analysis Constraints and Blind Spots

### Constraints

- **No Dynamic Runtime Analysis:** This is a static code analysis. Runtime permission checks loaded from database or external authorization services could not be verified through code inspection alone. However, comprehensive searches found zero evidence of such systems.

- **End-of-Life PHP Versions:** 
  - Service container runs PHP 7.4 (EOL November 2022 - no security patches for 3+ years)
  - Webapp container runs PHP 8.0 (EOL November 2023 - no security patches for 2+ years)
  - Known vulnerabilities in these PHP versions were not analyzed—focus was on application-level authorization only

- **Container Escape & Docker Security:** Authorization analysis focused on application-level access control, not container isolation bypasses or Docker security misconfigurations.

### Blind Spots

- **External Authorization Services:** If the application integrates with an external authorization service (e.g., OAuth provider, LDAP, external policy engine), that integration was not discoverable through static analysis of this codebase. However, no HTTP client calls or external service integrations were found.

- **Microservice Authorization:** The internal service (port 4455) has network-level isolation, but application-level authorization within that service could not be fully traced for all possible call paths. All analyzed endpoints lacked authorization checks.

- **Custom Authentication in Included Files:** If authentication logic exists in files not included in the analyzed codebase (e.g., external libraries, uncommitted files), those were not analyzed. However, all `require`, `include`, and `composer.json` dependencies were traced and showed no authentication libraries.

### Analysis Completeness

**What Was Fully Analyzed:**
- ✅ All 7 public endpoints on port 8081 (webapp container)
- ✅ All 5 internal endpoints on port 4455 (service container)
- ✅ All database operations and schema
- ✅ All file I/O operations
- ✅ Network isolation and SSRF bypass mechanism
- ✅ Session management and cookie handling (confirmed absent)
- ✅ Role-based access control patterns (confirmed absent)
- ✅ Workflow state validation (confirmed absent)
- ✅ Composer dependencies and included PHP files

**Coverage Statistics:**
- **Horizontal Authorization:** 2 of 2 candidates analyzed (100%)
- **Vertical Authorization:** 5 of 5 privileged operations analyzed (100%)
- **Context-Based Authorization:** 3 workflow patterns analyzed (100% - confirmed none exist)
- **Total Endpoints Analyzed:** 12 of 12 (100%)

### Known Unknowns

- **Runtime Configuration:** Environment variables or runtime PHP configuration could theoretically enable authorization features not visible in code. However, Docker configuration and `.env` file showed no such features.

- **Nginx Access Logs:** Whether Nginx logs capture authentication failures or suspicious patterns was not analyzed—focus was on application-level authorization logic.

- **Rate Limiting:** Whether external rate limiting (e.g., WAF, load balancer) exists was not analyzed. Application code shows no rate limiting.

---

## 6. Vulnerability Summary Statistics

**Total Authorization Vulnerabilities:** 7 critical findings

### By Category:
- **Horizontal (IDOR):** 2 vulnerabilities
  - AUTHZ-VULN-01: View any SKU without ownership check
  - AUTHZ-VULN-02: Delete any SKU without ownership check

- **Vertical (Privilege Escalation):** 3 vulnerabilities
  - AUTHZ-VULN-03: Unauthenticated SSRF with network bypass
  - AUTHZ-VULN-04: Unauthenticated arbitrary file upload (via SSRF)
  - AUTHZ-VULN-05: Unauthenticated RCE via Phar deserialization (via SSRF)

- **Context-Based (Workflow):** 2 vulnerabilities
  - AUTHZ-VULN-06: RCE workflow lacks sequential state validation
  - AUTHZ-VULN-07: Delete operation lacks workflow state validation

### By External Exploitability:
- **Externally Exploitable (from public internet):** 7 vulnerabilities (100%)
- **Internal Network Only:** 0 vulnerabilities

### By Confidence Level:
- **High Confidence:** 7 vulnerabilities (100%)
- **Medium Confidence:** 0 vulnerabilities
- **Low Confidence:** 0 vulnerabilities

**Rationale for High Confidence:**
- Guards are clearly absent (zero code implementing authorization)
- Side effects are unambiguous (database DELETE, file_get_contents, eval())
- Paths from endpoint to side effect are direct with no conditional branches
- All findings verified through source code analysis with exact file:line references

---

## 7. Exploitation Chain Intelligence

### Primary Attack Chain: SSRF → File Upload → Phar Deserialization → RCE

**Step 1: SSRF to Bypass Network Isolation**
- **Endpoint:** `POST /sku_url.php`
- **Parameter:** `url=http://127.0.0.1:4455/sku_process`
- **Authorization Check:** NONE
- **Result:** External attacker gains access to internal service

**Step 2: Upload Malicious Phar Archive**
- **Endpoint:** `POST /sku_process` (via SSRF)
- **Parameter:** `data={base64_encoded_phar}`
- **Authorization Check:** NONE (relies on Nginx network ACL, bypassed by SSRF)
- **Result:** Phar uploaded to `/tmp/{random}.jpg`, file path returned to attacker

**Step 3: Trigger Deserialization & RCE**
- **Endpoint:** `POST /sku_read` (via SSRF)
- **Parameter:** `file_path=/tmp/{known_hash}.jpg`
- **Authorization Check:** NONE
- **Result:** Phar metadata deserialized, `CustomTemplate::__wakeup()` executes `eval($this->data)`, RCE achieved

**Step 4: Flag Exfiltration**
- **Method:** Execute `cat /flag.txt` via eval() gadget
- **Flag Location:** `/flag.txt` in service container
- **Result:** CTF flag exfiltrated

**Key Intelligence:**
- NO authorization checks at any step
- Each step can be executed independently (no workflow state validation)
- All steps accessible from public internet via SSRF proxy
- Complete chain requires no authentication, no user interaction, no special privileges

---

## 8. Code Evidence Index

### Critical Vulnerabilities with Source Locations

| Vuln ID | Type | File | Lines | Missing Guard | Side Effect |
|---------|------|------|-------|---------------|-------------|
| AUTHZ-VULN-01 | Horizontal | `/app/sku_product_detail.php` | 5, 10 | No ownership check | Read any SKU record |
| AUTHZ-VULN-02 | Horizontal/Vertical | `/app/sku_delete.php` | 4, 8 | No ownership/role check | Delete any SKU record |
| AUTHZ-VULN-03 | Vertical | `/app/sku_url.php` | 73, 80, 34 | No role check | SSRF to internal service |
| AUTHZ-VULN-04 | Vertical | `/app/skumodel-srv/sku_process.php` | 10, 18 | No role check (Nginx ACL bypassed) | Arbitrary file upload |
| AUTHZ-VULN-05 | Vertical | `/app/skumodel-srv/read_sku.php` + `ReadClass.php` | 10, 14, 22 (read_sku.php); 13 (ReadClass.php) | No role check (Nginx ACL bypassed) | RCE via eval() in __wakeup() |
| AUTHZ-VULN-06 | Context | `/app/skumodel-srv/sku_process.php` + `read_sku.php` | 10-28 (sku_process); 10-22 (read_sku) | No workflow state validation | RCE workflow steps can be skipped/reordered |
| AUTHZ-VULN-07 | Context | `/app/sku_delete.php` | 4, 8 | No workflow state validation | Delete without verifying creation context |

### Database Schema (Lack of Authorization Columns)
- **File:** `/app/database.php`
- **Lines:** 7-12
- **Finding:** No `user_id`, `owner`, `status`, or workflow state columns

### Network Configuration (Bypass Mechanism)
- **Restriction File:** `/app/skumodel-srv/nginx.conf`
- **Restriction Lines:** 17-19 (`allow 172.0.0.0/8; deny all;`)
- **Bypass File:** `/app/sku_url.php`
- **Bypass Lines:** 19-21 (hostname replacement), 34 (proxied request)

### RCE Gadget
- **Gadget File:** `/app/skumodel-srv/ReadClass.php`
- **Gadget Lines:** 13-14 (`__wakeup()` with `eval($this->data)`)
- **Alternative Gadget:** Lines 17-18 (`render()` with `eval($this->data)`)

---

## 9. Methodology Adherence

This analysis strictly followed the prescribed methodology:

### Horizontal Authorization Analysis
- ✅ Created todos for all endpoints in recon section 8.1 (2 endpoints)
- ✅ Traced backwards from side effect to check for sufficient guards
- ✅ Applied sufficient guard criteria: session auth, ownership check, dominates all paths
- ✅ Documented verdict (vulnerable/guarded) with file:line references

**Results:**
- AUTHZ-VULN-01: `/sku_product_detail.php` - View any SKU - **VULNERABLE** (no ownership check before SELECT)
- AUTHZ-VULN-02: `/sku_delete.php` - Delete any SKU - **VULNERABLE** (no ownership check before DELETE)

### Vertical Authorization Analysis
- ✅ Created todos for all privileged operations in recon section 8.2 (5 operations)
- ✅ Traced backwards from privileged side effect to check for role/capability guards
- ✅ Applied sufficient guard criteria: explicit role check, before side effect, dominates all paths
- ✅ Documented verdict with file:line references

**Results:**
- AUTHZ-VULN-02: `/sku_delete.php` - DELETE operation - **VULNERABLE** (no role check)
- AUTHZ-VULN-03: `/sku_url.php` - SSRF capability - **VULNERABLE** (no role check)
- AUTHZ-VULN-03: Network bypass - **VULNERABLE** (application-level bypass of Nginx ACL)
- AUTHZ-VULN-04: `/sku_process.php` - File upload - **VULNERABLE** (no role check, accessible via SSRF)
- AUTHZ-VULN-05: `/read_sku.php` + `ReadClass.php` - RCE - **VULNERABLE** (no role check, accessible via SSRF)

### Context-Based Authorization Analysis
- ✅ Created todos for all workflow patterns in recon section 8.3 (3 workflows)
- ✅ Walked forward through workflows to check state validation
- ✅ Applied sufficient guard criteria: enforces prior state, runs before state change
- ✅ Documented verdict with file:line references

**Results:**
- AUTHZ-VULN-06: RCE workflow (SSRF → Upload → Deser) - **VULNERABLE** (no state validation between steps)
- AUTHZ-VULN-07: SKU management workflow (Add → Delete) - **VULNERABLE** (no state validation before delete)

### Proof Obligations
- ✅ Guards must dominate sinks (none found)
- ✅ Guards after side effects do not count (N/A - no guards exist)
- ✅ UI-only checks do not count (N/A - no UI restrictions exist)

### Confidence Scoring
- **High Confidence (7 findings):** Guards clearly absent, side effects unambiguous, direct code paths
- **Medium Confidence (0 findings):** N/A
- **Low Confidence (0 findings):** N/A

### Documentation Requirements
- ✅ All vulnerable findings documented in exploitation queue
- ✅ All safe findings documented in "Vectors Analyzed and Confirmed Secure" (none found—no secure components exist)
- ✅ Exact file:line references for all findings
- ✅ Specific missing guard descriptions
- ✅ Clear side effect documentation

---

**AUTHORIZATION ANALYSIS COMPLETE**