# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Two high-confidence authorization vulnerabilities were identified that enable vertical privilege escalation from anonymous user to admin role. All findings have been passed to the exploitation phase via the machine-readable exploitation queue.
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and architectural intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.

**Critical Findings Summary:**
- **AUTHZ-VULN-01:** SQL Injection enabling direct credential extraction and privilege escalation (CRITICAL severity, externally exploitable)
- **AUTHZ-VULN-02:** Session Fixation enabling authorization bypass without valid credentials (HIGH severity, externally exploitable with social engineering)

**Application Architecture:**
- Minimal PHP blog application (2 endpoints: index.php, admin.php)
- Binary role system: anonymous vs. admin
- Session-based authentication with critical weaknesses
- MySQL database with plaintext credential storage

**Authorization Testing Coverage:**
- ✅ Horizontal escalation candidates: N/A (single-admin architecture, no user-to-user resources)
- ✅ Vertical escalation candidates: All 3 endpoints analyzed
- ✅ Context/workflow candidates: N/A (no multi-step workflows exist)
- ✅ Static assets: Validated as appropriately public

## 2. Dominant Vulnerability Patterns

### Pattern 1: Missing Input Validation Before Authorization-Relevant Side Effects (Vertical)

**Description:** The application performs authorization-relevant database queries (credential validation) without sanitizing user input, allowing attackers to extract credentials via SQL injection and subsequently escalate privileges.

**Implication:** Anonymous users can bypass the credential-based authorization system entirely by extracting admin credentials directly from the database, then authenticating to gain full admin privileges including FLAG access.

**Representative Finding:** AUTHZ-VULN-01 (SQL Injection in GET /index.php?category=)

**Technical Details:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php` line 41
- **Root Cause:** User input from `$_GET['category']` is used directly in SQL query BEFORE sanitization occurs at line 52
- **Attack Vector:** UNION-based SQL injection to query `admins` table
- **Authorization Impact:** Enables complete bypass of credential-based authentication by extracting plaintext passwords
- **Exploitation Complexity:** Low (single HTTP GET request with SQL payload)

**Code Evidence:**
```php
// Line 37: Unescaped input capture
$unescaped_category = isset($_GET['category']) ? $_GET['category'] : '';

// Line 41: VULNERABLE - SQL injection before sanitization
$result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");

// Line 52: Sanitization too late - damage already done
$category = mysqli_real_escape_string($conn, $unescaped_category);
```

**Authorization Bypass Chain:**
1. Anonymous user sends: `GET /?category=' UNION SELECT password FROM admins WHERE username='admin'--`
2. Extracts plaintext password: `ONEverySecurePassword_!`
3. Authenticates via POST /admin.php with extracted credentials
4. Gains admin session with `$_SESSION['admin_logged_in'] = true`
5. Accesses protected FLAG at GET /admin.php

---

### Pattern 2: Missing Session Security Controls (Vertical)

**Description:** The authentication endpoint sets privileged session variables without regenerating the session ID, allowing attackers to fix a victim's session and inherit their authorization level without knowing credentials.

**Implication:** Attackers can escalate from anonymous to admin role by manipulating session establishment, bypassing the credential verification process entirely.

**Representative Finding:** AUTHZ-VULN-02 (Session Fixation in POST /admin.php)

**Technical Details:**
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 25
- **Root Cause:** Missing `session_regenerate_id()` call after successful authentication
- **Attack Vector:** Session fixation with social engineering to trick victim into authenticating with attacker-controlled session
- **Authorization Impact:** Allows attacker to inherit admin privileges without valid credentials
- **Exploitation Complexity:** Medium (requires victim interaction)

**Code Evidence:**
```php
// Lines 23-26: Session set without regeneration
if ($result->num_rows == 1) {
    $_SESSION['admin_logged_in'] = true;  // ← Missing session_regenerate_id()!
    echo "@FLAG@";
}
```

**Authorization Bypass Chain:**
1. Attacker creates controlled session: `PHPSESSID=attacker_value`
2. Attacker tricks victim admin to use this session (URL param, cookie injection, MITM)
3. Victim authenticates successfully with valid credentials
4. Server sets `$_SESSION['admin_logged_in'] = true` in attacker's controlled session
5. Attacker accesses GET /admin.php with same session ID
6. Authorization check passes: `if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true)`
7. Attacker receives FLAG without knowing credentials

---

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture

**Session Implementation:**
- **Technology:** Native PHP sessions (`session_start()` at admin.php line 2)
- **Cookie Name:** PHPSESSID (default PHP session identifier)
- **Storage:** Server-side PHP session files (default `/tmp` or `/var/lib/php/sessions`)
- **Authorization Marker:** Boolean flag `$_SESSION['admin_logged_in'] = true`
- **Lifetime:** Indefinite (no explicit timeout configured)

**Critical Finding - Session Security Weaknesses:**
```php
// No session configuration found - using insecure defaults:
// ❌ HttpOnly flag: NOT SET (XSS can steal session)
// ❌ Secure flag: NOT SET (transmitted over HTTP in plaintext)
// ❌ SameSite flag: NOT SET (CSRF possible)
// ❌ Session regeneration: NOT IMPLEMENTED (session fixation possible)
```

**Attack Surface:**
- Session cookies transmitted over unencrypted HTTP (port 51233)
- Session ID visible to network sniffers (MITM attacks)
- Session ID accessible to JavaScript (XSS can steal via `document.cookie`)
- Session persists across privilege escalation without regeneration
- No session validation beyond presence check

**Exploitation Strategy:**
- **Direct Attack:** Exploit session fixation (AUTHZ-VULN-02) by controlling victim's session establishment
- **Indirect Attack:** Steal active admin session via network sniffing (HTTP, no TLS)
- **Chained Attack:** XSS → session theft → admin access (requires XSS vulnerability, see stored XSS in recon)

---

### Role/Permission Model

**Role Architecture:**
- **Binary System:** anonymous vs. admin (no intermediate roles)
- **Role Storage:** PHP session variable `$_SESSION['admin_logged_in']` (boolean)
- **Role Assignment:** Set at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php` line 25 on successful authentication
- **Role Validation:** Checked at admin.php lines 5-8 before FLAG display

**Critical Finding - Single Admin Account:**
```sql
-- From /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/db_init.sql line 58
INSERT INTO admins (username, password) VALUES ('admin', 'ONEverySecurePassword_!');
```

**Authorization Decision Logic:**
```php
// Line 5-8: Only authorization check in entire application
if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    echo "@FLAG@";  // Protected resource
    exit;
}
```

**Implications for Exploitation:**
- Only ONE admin account exists (no multi-admin complexity)
- Credentials stored in plaintext in database (SQL injection retrieves directly usable password)
- No role hierarchy (cannot escalate from "user" to "moderator" to "admin" - only anonymous to admin)
- Authorization check uses strict type checking (`=== true`) but vulnerable to session attacks
- No granular permissions (admin has all-or-nothing access)

---

### Database Access Patterns

**Database Schema:**
```sql
admins table (db_init.sql lines 29-33):
├── id INT AUTO_INCREMENT PRIMARY KEY
├── username VARCHAR(50)
└── password VARCHAR(255)  -- Stored in PLAINTEXT (no hashing)

posts table (db_init.sql lines 9-17):
├── id INT AUTO_INCREMENT PRIMARY KEY
├── title VARCHAR(255)
├── category VARCHAR(100)
├── content TEXT
├── image VARCHAR(255)
├── published TINYINT(1)
└── created_at TIMESTAMP
```

**Database Connection:**
```php
// Hardcoded credentials in both index.php and admin.php:
$conn = new mysqli('db', 'user', 'password', 'blogDB');
```

**Critical Finding - SQL Injection Attack Surface:**

**Vulnerable Query (index.php line 41):**
```php
$result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");
```

**Protected Queries:**
- admin.php line 20: `SELECT id FROM admins WHERE username = '$username' AND password = '$password'`
  - Uses `mysqli_real_escape_string()` BEFORE query (line 17-18)
  - Still vulnerable to plaintext password issues but protected from SQL injection

**Exploitation Strategy:**
- Target: `GET /?category=PAYLOAD`
- Technique: UNION-based SQL injection
- Goal: Extract plaintext password from `admins` table
- Sample Payloads:
  ```
  ' UNION SELECT password FROM admins WHERE username='admin'--
  ' UNION SELECT CONCAT(username,':',password) FROM admins--
  ' OR '1'='1
  ```

---

### Network Architecture

**Application Deployment:**
```
Internet → localhost:51233 (HTTP) → Docker Container (Apache:80) → MySQL Container (db:3306)
```

**Network Characteristics:**
- **Protocol:** HTTP only (no TLS/HTTPS)
- **Port:** 51233 (host) → 80 (container)
- **Encryption:** NONE (plaintext transmission)
- **Authentication:** Session cookies transmitted unencrypted
- **Database:** Internal Docker network (not exposed to host)

**Critical Finding - No Transport Security:**
- All credentials transmitted over unencrypted HTTP
- Session cookies visible to network sniffers
- SQL injection payloads visible in network traffic
- FLAG value transmitted in plaintext

**Exploitation Strategy:**
- No need to bypass TLS certificate validation
- Direct HTTP requests with curl/burp/browser
- Network sniffing viable for session hijacking (if MITM position available)
- No WAF or rate limiting observed

---

### Workflow Implementation

**Authentication Workflow:**
```
1. User navigates to /admin.php (GET)
   ├─ If session exists → Display FLAG (lines 5-8)
   └─ If no session → Display login form (lines 34-59)

2. User submits credentials (POST /admin.php)
   ├─ Read username/password from POST (lines 17-18)
   ├─ Escape with mysqli_real_escape_string()
   ├─ Query admins table (line 20)
   ├─ If match found:
   │  ├─ Set $_SESSION['admin_logged_in'] = true (line 25)
   │  └─ Display FLAG (line 26)
   └─ If no match:
      └─ Display error (line 28)
```

**Critical Finding - No Multi-Step Authorization:**
- Single-step authentication (no 2FA, no email verification, no CAPTCHA)
- No workflow state validation (no CSRF tokens, no nonces)
- No rate limiting (unlimited authentication attempts)
- Immediate FLAG display on success (no separate authorization check)

**Exploitation Strategy:**
- Exploit SQL injection to extract credentials (bypass authentication entirely)
- OR exploit session fixation (bypass credential requirement)
- No need to bypass multi-factor authentication
- No need to defeat rate limiting

---

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have robust, properly-placed guards OR are appropriately public by design. They are **not vulnerable to authorization bypass** and are **low-priority** for exploitation testing.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| `GET /admin.php` | admin.php:5-8 | Session validation with strict type check (`isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true`) before FLAG display. Guard executes BEFORE side effect (line 6) and uses `exit` to prevent fallthrough (line 7). | **SAFE** - Authorization guard present and correctly placed. Exploitable only via session security attacks (fixation, hijacking), not direct authorization bypass. |
| `GET /styles.css` | N/A | Public static CSS asset served by Apache. No authorization required by design. | **SAFE** - Appropriately public resource for frontend styling. No authorization guard expected or needed. |
| `GET /images/*.jpg` | N/A | Public static image assets served by Apache. Referenced in public blog posts (index.php line 71). No authorization required by design. | **SAFE** - Appropriately public resources. Path traversal risk exists but requires SQL injection to inject malicious filenames into database, not an authorization bypass. |
| `GET /` (index.php - public blog) | N/A | Public blog interface displaying published posts. Intentionally accessible to anonymous users. | **SAFE** - Appropriately public endpoint. Contains SQL injection vulnerability (AUTHZ-VULN-01) but public access itself is correct design. |

**Key Distinctions:**

1. **GET /admin.php is NOT vulnerable to authorization bypass:**
   - Authorization guard IS present (lines 5-8)
   - Guard is correctly placed BEFORE side effect (FLAG display)
   - Guard uses proper validation logic (isset + strict type checking)
   - Vulnerability is in SESSION SECURITY (fixation, missing cookie flags), not missing authorization guard
   - Documented as AUTHZ-VULN-02 (session fixation), not as "missing guard"

2. **Static assets (CSS, images) are appropriately public:**
   - No authorization guard is EXPECTED or NEEDED
   - These are frontend resources that must be accessible without authentication
   - Referenced in both public blog and login form (pre-authentication contexts)
   - Path traversal risk exists but is a different vulnerability class (input validation, not authorization)

3. **Public blog (index.php) is appropriately public:**
   - Blog content is intentionally viewable by anonymous users
   - No authorization guard is needed for reading published posts
   - SQL injection vulnerability (AUTHZ-VULN-01) exists but doesn't make public access itself a vulnerability

---

## 5. Analysis Constraints and Blind Spots

### Analyzed Components

**Complete Coverage:**
- ✅ All HTTP endpoints from reconnaissance deliverable section 8
- ✅ Vertical privilege escalation vectors (anonymous → admin)
- ✅ Session-based authorization mechanism
- ✅ Database credential storage and validation
- ✅ Static asset access controls

**Endpoint Analysis Summary:**
- `GET /index.php?category=` - **VULNERABLE** (SQL injection authorization bypass)
- `POST /admin.php` - **VULNERABLE** (session fixation authorization bypass)
- `GET /admin.php` - **SAFE** (authorization guard present, exploitable via session attacks)
- `GET /styles.css` - **SAFE** (appropriately public)
- `GET /images/*` - **SAFE** (appropriately public)

---

### Not Applicable to This Application

**Horizontal Privilege Escalation:**
- **Status:** Not applicable
- **Reason:** Single-admin architecture with no user-to-user resources
- **Details:** Application has only one admin account (hardcoded in db_init.sql). No user registration, no per-user resources (orders, profiles, documents), no object IDs referencing user-owned data. The `posts` table has no `user_id` or `owner_id` column - all posts are global public resources when `published=1`.
- **Assessment:** Even if horizontal escalation vulnerabilities existed in the code logic, the application architecture makes them unexploitable (cannot access "other user's data" when only one admin user exists).

**Context/Workflow Authorization:**
- **Status:** Not applicable
- **Reason:** No multi-step workflows exist
- **Details:** Application has no multi-step processes requiring state validation (no checkout flow, no password reset, no onboarding wizard, no approval workflows). Authentication is a single POST request with immediate result.
- **Assessment:** No step-skipping attacks possible. No state transition validation needed.

---

### Limitations of Static Analysis

**Runtime Behavior:**
While the code was comprehensively analyzed, certain runtime behaviors could not be fully validated without live testing:

1. **Session Fixation Exploitability:**
   - **Known:** `session_regenerate_id()` is missing (code confirmed)
   - **Unknown:** Exact PHP session configuration (whether `session.use_only_cookies=1`, `session.use_strict_mode=1` enabled)
   - **Impact:** May affect ease of session fixation (URL-based vs cookie-based attacks)
   - **Mitigation:** Documented as HIGH confidence (missing regeneration is clear in code)

2. **SQL Injection Impact Scope:**
   - **Known:** SQL injection exists at index.php line 41 (code confirmed)
   - **Unknown:** MySQL user privileges (whether `user` account has FILE, SUPER, or other dangerous privileges)
   - **Impact:** Could enable additional attacks (LOAD_DATA_INFILE for file read, INTO OUTFILE for file write)
   - **Mitigation:** Documented primary impact (credential extraction) which is sufficient for vertical privilege escalation

3. **Apache Path Traversal Behavior:**
   - **Known:** Image filenames output without validation (code confirmed)
   - **Unknown:** Apache `FollowSymLinks` configuration and OS-level filesystem permissions
   - **Impact:** Determines if `images/../../../etc/passwd` successfully traverses filesystem
   - **Mitigation:** This is not an authorization bypass vulnerability (classified as path traversal/input validation)

---

### Out of Scope (Not Externally Exploitable)

**Internal Network Components:**
- MySQL database on internal Docker network (db:3306)
  - **Not exposed to host** (docker-compose.yml shows no port mapping for 3306)
  - **Not accessible from internet** (requires Docker network membership)
  - **Assessment:** Cannot be directly exploited from external attacker position
  - **Note:** Exploitable via SQL injection from web application (AUTHZ-VULN-01)

**Container Infrastructure:**
- Docker host machine
- Docker daemon API
- Inter-container networking
- **Assessment:** All require local/internal access, excluded per external attacker scope

---

### Recommendations for Exploitation Phase

**High Priority Targets:**
1. **AUTHZ-VULN-01** (SQL Injection) - Direct path to credential extraction
2. **AUTHZ-VULN-02** (Session Fixation) - Requires social engineering but well-documented attack

**Testing Approach:**
- **SQL Injection:** Start with simple UNION payloads to extract admin password
- **Session Fixation:** May require victim interaction simulation (coordinate with test plan)

**Expected Outcomes:**
- SQL injection should provide direct admin access (high confidence)
- Session fixation requires victim authentication (medium confidence on exploitability)

---

## 6. Methodology Applied

This analysis followed the Authorization Vulnerability Analysis methodology as specified:

### Vertical Authorization Analysis (Section 8.2 of Recon)

**Candidates Analyzed:**
1. ✅ `GET /index.php?category=` - SQL injection enabling credential extraction
2. ✅ `POST /admin.php` - Authentication endpoint with session fixation
3. ✅ `GET /admin.php` - Admin FLAG display with session validation

**Process Applied:**
- Started at each identified endpoint
- Traced backwards to find authorization guards
- Identified side effects (credential extraction, session setting, FLAG display)
- Determined if sufficient guard exists BEFORE side effect
- **Guard Sufficiency Criteria:** Enforces session authentication + dominates code paths + runs before side effect

**Results:**
- **AUTHZ-VULN-01:** SQL injection reaches credential extraction side effect with NO guard (VULNERABLE)
- **AUTHZ-VULN-02:** Session set without regeneration allows fixation bypass (VULNERABLE)
- **GET /admin.php:** Session validation guard present before FLAG display (SAFE - guard exists)

### Horizontal Authorization Analysis (Section 8.1 of Recon)

**Status:** Not applicable - no horizontal candidates identified in recon section 8.1
**Reason:** Single-admin architecture, no user-to-user resources, no per-user data ownership

### Context/Workflow Authorization Analysis (Section 8.3 of Recon)

**Status:** Not applicable - no context candidates identified in recon section 8.3
**Reason:** No multi-step workflows exist in application

### Confidence Scoring

**AUTHZ-VULN-01 (SQL Injection):**
- **Confidence:** HIGH
- **Justification:** Guard clearly absent (no authorization check before line 41), side effect unambiguous (credential extraction), path from endpoint to side effect is direct with no protective branches

**AUTHZ-VULN-02 (Session Fixation):**
- **Confidence:** HIGH (for vulnerability existence), MEDIUM (for practical exploitability)
- **Justification:** Missing `session_regenerate_id()` clearly evident in code (line 25), exploitation requires victim interaction (social engineering), PHP session configuration may affect attack vectors

---

## 7. Code Evidence Summary

### AUTHZ-VULN-01: SQL Injection Authorization Bypass

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/index.php`

```php
// Line 37: Unescaped input capture
$unescaped_category = isset($_GET['category']) ? $_GET['category'] : '';

// Line 41: SQL INJECTION - NO AUTHORIZATION GUARD BEFORE THIS
$result = $conn->query("SELECT DISTINCT category FROM posts where category = '" . $unescaped_category . "'");

// Line 52: Sanitization TOO LATE
$category = mysqli_real_escape_string($conn, $unescaped_category);
```

**Exploitation Path:**
```
GET /?category=' UNION SELECT password FROM admins WHERE username='admin'--
  ↓
Extracts: ONEverySecurePassword_!
  ↓
POST /admin.php (username=admin&password=ONEverySecurePassword_!)
  ↓
Session set: $_SESSION['admin_logged_in'] = true
  ↓
GET /admin.php → FLAG displayed
```

---

### AUTHZ-VULN-02: Session Fixation

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`

```php
// Lines 23-26: Session set WITHOUT regeneration
if ($result->num_rows == 1) {
    $_SESSION['admin_logged_in'] = true;  // ← Missing session_regenerate_id()!
    echo "@FLAG@";
}
```

**Exploitation Path:**
```
1. Attacker sets victim cookie: PHPSESSID=attacker_controlled_id
2. Victim authenticates successfully
3. Server sets $_SESSION['admin_logged_in'] = true in attacker's session
4. Attacker accesses GET /admin.php with same PHPSESSID
5. Authorization check passes (session exists and is valid)
6. FLAG displayed to attacker
```

---

### Protected Endpoint: GET /admin.php

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-040-24/app/html/admin.php`

```php
// Lines 5-8: Authorization guard BEFORE side effect
if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    echo "@FLAG@";  // Side effect protected by guard
    exit;           // Prevents fallthrough
}
```

**Assessment:** Authorization guard present and correctly placed. Not vulnerable to direct bypass (only exploitable via session security weaknesses documented in AUTHZ-VULN-02).

---

## 8. Final Assessment

**Total Authorization Vulnerabilities Found:** 2 (both vertical privilege escalation)

**Externally Exploitable:** 2
- AUTHZ-VULN-01: SQL Injection (requires only HTTP GET request)
- AUTHZ-VULN-02: Session Fixation (requires victim interaction but exploitable from external position)

**Severity Distribution:**
- CRITICAL: 1 (AUTHZ-VULN-01)
- HIGH: 1 (AUTHZ-VULN-02)
- MEDIUM: 0
- LOW: 0

**Attack Surface Summary:**
- **Minimal Complexity:** AUTHZ-VULN-01 exploitable with single HTTP request
- **Social Engineering Required:** AUTHZ-VULN-02 requires tricking victim to use attacker's session
- **No Authentication Required:** Both vulnerabilities exploitable from anonymous user position
- **Direct Path to Goal:** Both vulnerabilities lead directly to admin FLAG access

**Recommended Exploitation Priority:**
1. AUTHZ-VULN-01 (SQL Injection) - Most direct path
2. AUTHZ-VULN-02 (Session Fixation) - Backup approach if SQL injection unexpectedly blocked