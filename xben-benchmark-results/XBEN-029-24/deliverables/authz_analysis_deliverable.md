# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Two high-confidence horizontal authorization vulnerabilities were identified and documented. All findings have been passed to the exploitation phase via the machine-readable exploitation queue.  
- **Purpose of this Document:** This report provides the strategic context, vulnerability patterns, and architectural intelligence necessary to effectively exploit the authorization vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.

**Critical Findings:**
- **AUTHZ-VULN-01:** Insecure Direct Object Reference (IDOR) - Unauthenticated access to uploaded files via direct URL
- **AUTHZ-VULN-02:** Horizontal authorization bypass - File overwrite vulnerability in shared upload directory

**Scope Summary:**
- **Endpoints Analyzed:** 3 (index.php, dashboard.php, upload.php)
- **Horizontal Issues Found:** 2 critical vulnerabilities
- **Vertical Issues Found:** 0 (no role hierarchy exists)
- **Context/Workflow Issues Found:** 0 (no multi-step workflows exist)

## 2. Dominant Vulnerability Patterns

### Pattern 1: Missing Ownership Validation (Horizontal)

**Description:** The application stores uploaded files in a shared directory (`./uploaded_invoices/`) without any ownership tracking mechanism. Files are served directly by Apache with no PHP authorization guard, allowing any user (even unauthenticated) to access any file by knowing the filename.

**Implication:** Complete confidentiality breach for all uploaded invoice files. Multi-user data isolation is non-existent.

**Representative Vulnerabilities:**
- **AUTHZ-VULN-01:** Direct file access via `/uploaded_invoices/{filename}` - No authorization check exists between request and file delivery
- **AUTHZ-VULN-02:** File overwrite in upload endpoint - Shared directory allows users to overwrite each other's files

**Root Cause Pattern:**
1. **No ownership metadata:** Database schema contains no table or columns linking files to users
2. **No download proxy:** Files served directly by Apache, bypassing all PHP session checks
3. **Shared namespace:** All users upload to the same directory without user-specific subdirectories
4. **Filename as sole identifier:** Original client-provided filename used directly with no user prefix or unique ID

**Code Evidence:**
```php
// upload.php:32-33 - Shared directory, no user isolation
$uploadFileDir = './uploaded_invoices/';
$dest_path = $uploadFileDir . $fileName; // No user_id prefix

// upload.php:39 - Save without ownership tracking
move_uploaded_file($fileTmpPath, $dest_path); // No database INSERT
```

### Pattern 2: Session Authentication Without Resource Authorization (Horizontal)

**Description:** The application validates session existence (`$_SESSION['username']` is set) but never uses this value to enforce resource-level authorization. The username is retrieved but completely unused in file operations.

**Implication:** Authentication gates access to endpoints, but within authenticated context, users have unrestricted access to all resources regardless of ownership.

**Representative:** AUTHZ-VULN-02 (upload endpoint)

**Root Cause Pattern:**
```php
// Dashboard.php & upload.php both retrieve username...
if (isset($_SESSION['username'])){
    $username = $_SESSION['username']; // Retrieved at line 10
}

if(!$username){
    header("Location: index.php?error=failed_login");
    exit();
}
// ...but $username is NEVER used after this point!
// No: WHERE user = '$username'
// No: mkdir("./uploaded_invoices/$username/")
// No: INSERT INTO files (filename, owner) VALUES (?, ?)
```

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture

- **Session Type:** PHP native file-based sessions
- **Session Cookie:** PHPSESSID (default PHP configuration)
- **Cookie Flags:** None configured (no HttpOnly, no Secure, no SameSite)
- **Session Content:** Only `$_SESSION['username']` is stored (username string from POST input)
- **Session Lifetime:** Indefinite (no timeout, no expiration logic)

**Critical Finding for Exploitation:** 
- The application trusts that any valid session grants full access to all features
- No role checking, no permission validation, no resource ownership enforcement
- Session fixation possible (no `session_regenerate_id()` after login)

### Role/Permission Model

**Assessment:** None exists.

**Database Schema Analysis:**
```sql
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password CHAR(32) NOT NULL
);
```

**Critical Findings:**
- No `role` column
- No `is_admin` field
- No separate `permissions` or `roles` tables
- User "admin" exists but has identical privileges to any other authenticated user

**Authorization Model:** Binary (unauthenticated vs authenticated) with no granular permissions.

### Resource Access Patterns

**File Upload Flow:**
1. Authenticated user POSTs to `/upload.php` with file
2. File saved to `./uploaded_invoices/{original_filename}` (line 33)
3. No database record created linking file to user
4. File immediately accessible at `http://target/uploaded_invoices/{filename}`

**File Access Flow:**
1. Any user (authenticated OR unauthenticated) requests `http://target/uploaded_invoices/{filename}`
2. Apache serves file directly as static content
3. **NO PHP execution, NO session check, NO ownership validation**
4. File downloaded successfully

**Critical Finding:** The `/uploaded_invoices/` directory is inside the web root (`/var/www/html/uploaded_invoices/`) with:
- No `.htaccess` protection
- No Apache `<Directory>` restrictions
- No PHP download proxy
- World-readable permissions (0777)

### Exploitation Prerequisites

**For AUTHZ-VULN-01 (Direct file access IDOR):**
- **Authentication Required:** NO - Even anonymous users can access files
- **Information Required:** Target filename (e.g., `invoice.pdf`, `confidential.pdf`)
- **Filename Discovery Methods:**
  - Social engineering (ask user what they named their file)
  - Dictionary attack (common names: invoice-2024.pdf, receipt.pdf, etc.)
  - Directory listing if enabled (Apache default may show file list)
  - Timing attack (upload file, enumerate numeric IDs if timestamp-based)

**For AUTHZ-VULN-02 (File overwrite):**
- **Authentication Required:** YES - Must have valid session to access `/upload.php`
- **Information Required:** Target filename to overwrite
- **Attack Prerequisites:** None beyond basic authentication

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have appropriate guards for their intended purpose. They are **low-priority** for further testing.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| `POST /index.php` | index.php:19 | Public authentication endpoint (no auth required by design) | SAFE |
| `GET /dashboard.php` | dashboard.php:9-16 | Session existence check appropriate for form display page (no user-specific data shown) | SAFE |

**Reasoning for "SAFE" Verdicts:**

**GET /dashboard.php is SAFE because:**
- Page displays only static HTML (upload form)
- No user-specific data is retrieved or displayed
- No database queries execute
- No object ID parameters accepted
- Session check prevents unauthorized access to form, which is sufficient for a page with no sensitive data

**Note:** While the dashboard itself is safe, the upload *ecosystem* has critical flaws (documented as AUTHZ-VULN-01 and AUTHZ-VULN-02).

## 5. Analysis Constraints and Blind Spots

### Architectural Limitations

**No Multi-Tenant Isolation Analysis Required:**
- Application is single-tenant (no organization/company segregation)
- All users share the same database and filesystem
- No tenant identifier in any table
- Multi-tenant security controls do not apply

**No Role-Based Access Control to Test:**
- Database schema contains no role/privilege columns
- Code contains zero role-checking logic
- All authenticated users have identical access rights
- Vertical privilege escalation is not applicable

**No Workflow State Validation to Bypass:**
- Application has no multi-step workflows
- No approval processes, wizards, or staged operations
- Database contains no status/stage/step columns
- Context-based authorization bypasses are not applicable

### Runtime Behavior Assumptions

**Apache Configuration Assumptions:**
- Analysis assumes default Apache configuration serving files from `/var/www/html/`
- Assumed no custom `.htaccess` files deployed at runtime (glob search confirmed none in source code)
- Assumed directory listing may be enabled (Apache default) - not verified in live environment

**Session Behavior Assumptions:**
- Assumed PHP default session configuration (file-based, no encryption)
- Session timeout behavior based on code analysis (no explicit timeout configured)
- Cookie flags assumed to be PHP defaults (confirmed by absence of `session_set_cookie_params()`)

### Out-of-Scope Components

**Not Analyzed (Per Network Surface Scope):**
- Build scripts and development tools (not network-accessible)
- Database backup/restore procedures (not exposed via HTTP)
- Server-side file system permissions beyond code-created directories
- Container orchestration security (Docker internal networking)

**Static Analysis Limitations:**
- Cannot confirm actual Apache DirectoryIndex behavior without live testing
- Cannot verify if uploaded files are executable without testing Apache PHP handler configuration
- Cannot confirm database privilege escalation potential without live MySQL access

## 6. Attack Surface Summary

### Authenticated Attack Surface

**Endpoints Requiring Valid Session:**
- `GET /dashboard.php` - Upload form display (safe, no user data)
- `POST /upload.php` - File upload handler (vulnerable to overwrite - AUTHZ-VULN-02)

**What Authenticated Users Can Do:**
- Upload files to shared directory
- Overwrite other users' files by using same filename
- Access their own uploaded files via direct URL

### Unauthenticated Attack Surface

**Endpoints Accessible Without Authentication:**
- `GET /index.php` - Login page
- `POST /index.php` - Authentication API
- `GET /uploaded_invoices/*` - **Direct file access (AUTHZ-VULN-01)**

**What Unauthenticated Users Can Do:**
- Access ANY uploaded file by knowing the filename
- Download sensitive invoice documents without authentication
- Enumerate files if directory listing enabled

### External Exploitability

**Both vulnerabilities are externally exploitable via http://localhost:35845:**
- AUTHZ-VULN-01: Accessible from public internet, no VPN required
- AUTHZ-VULN-02: Requires authentication but authentication is via public HTTP endpoint

## 7. Recommendations for Exploitation Phase

### High-Priority Exploitation Targets

1. **AUTHZ-VULN-01 (Direct File Access IDOR):**
   - Test with: `curl http://localhost:35845/uploaded_invoices/test.pdf`
   - Verify anonymous access succeeds
   - Confirm no session cookie required
   - Test directory listing: `curl http://localhost:35845/uploaded_invoices/`

2. **AUTHZ-VULN-02 (File Overwrite):**
   - Authenticate as User A, upload `test.pdf`
   - Authenticate as User B, upload `test.pdf` 
   - Verify User A's file is overwritten
   - Confirm no error or warning displayed

### Testing Methodology

**For IDOR Testing:**
```bash
# Step 1: Upload file as authenticated user
curl -X POST http://localhost:35845/upload.php \
  -H "Cookie: PHPSESSID={valid_session}" \
  -F "invoice=@confidential.pdf"

# Step 2: Access file WITHOUT authentication
curl http://localhost:35845/uploaded_invoices/confidential.pdf \
  -o downloaded.pdf

# Expected: File downloads successfully (vulnerability confirmed)
```

**For File Overwrite Testing:**
```bash
# Step 1: User A uploads file
curl -X POST http://localhost:35845/upload.php \
  -H "Cookie: PHPSESSID={user_a_session}" \
  -F "invoice=@fileA.pdf;filename=shared.pdf"

# Step 2: User B uploads file with same name
curl -X POST http://localhost:35845/upload.php \
  -H "Cookie: PHPSESSID={user_b_session}" \
  -F "invoice=@fileB.pdf;filename=shared.pdf"

# Step 3: Verify User A's file is gone
curl http://localhost:35845/uploaded_invoices/shared.pdf \
  -o result.pdf

# Expected: result.pdf contains User B's content (vulnerability confirmed)
```

### Confidence Scoring Rationale

**Both vulnerabilities rated HIGH confidence:**
- Complete source code access (no black-box guessing)
- Definitive absence of authorization guards proven via grep/glob
- Architectural understanding from database schema to file serving
- No conditional logic that might add hidden protections
- Clear attack path from input to unauthorized access

## 8. Comprehensive Coverage Statement

**All endpoints from reconnaissance report section 8 have been analyzed:**

### Horizontal Authorization (Section 8.1)
- ✅ `/uploaded_invoices/{filename}` - **VULNERABLE** (AUTHZ-VULN-01)
- ✅ `/upload.php` - **VULNERABLE** (AUTHZ-VULN-02)
- ✅ `/dashboard.php` - **SAFE** (no user-specific data)

### Vertical Authorization (Section 8.2)
- ✅ Confirmed NOT APPLICABLE - No role hierarchy exists
- ✅ No admin-only endpoints to test
- ✅ All authenticated users have identical privileges

### Context-Based Authorization (Section 8.3)
- ✅ Confirmed NOT APPLICABLE - No multi-step workflows exist
- ✅ No approval processes to bypass
- ✅ All operations are single-step atomic transactions

**Total endpoints analyzed:** 3 (index.php, dashboard.php, upload.php)  
**Vulnerabilities found:** 2 high-confidence horizontal authorization bypasses  
**Safe components documented:** 2 (index.php public by design, dashboard.php safe)  
**Inapplicable categories:** 2 (vertical, context-based)

---

**Analysis completed by:** Authorization Analysis Specialist  
**Methodologies applied:** Source-to-sink analysis, database schema review, session flow tracing  
**Deliverables generated:** AUTHZ_ANALYSIS (this report), AUTHZ_QUEUE (JSON exploitation queue)  
**Next phase:** Authorization Exploitation - weaponize documented vulnerabilities