# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Two critical horizontal IDOR vulnerabilities identified that enable complete account takeover including admin compromise. These high-confidence authorization vulnerabilities have been documented and passed to the exploitation phase via the machine-readable exploitation queue.
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and architectural intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.

### Critical Findings Summary

**VULNERABLE (2 endpoints):**
- `/api/change_password.php` - CRITICAL IDOR enabling password change for arbitrary users including admin (leads to CTF flag capture)
- `/api/get_favorite_restaurants.php` - HIGH severity IDOR enabling unauthorized access to any user's personal data

**SECURE (8 endpoints):**
- `/api/login.php`, `/api/register.php`, `/api/search_restaurants.php` - Public by design
- `/logout.php` - Permissive but safe operation
- `/profile.php` - Properly authenticated with role-based authorization for FLAG display
- `/index.php`, `/login.php`, `/register.php` - Public frontend pages

**NO CONTEXT-BASED VULNERABILITIES:**
- Application has zero multi-step workflows
- All operations are single-request with no state dependencies

## 2. Dominant Vulnerability Patterns

### Pattern 1: Missing Ownership Validation (Horizontal IDOR)

**Description:** API endpoints accept user ID parameters from client requests without verifying that the requesting user owns or has permission to access the target resource. The application confuses authentication (verifying WHO you are) with authorization (verifying WHAT you can access).

**Technical Root Cause:**
- Authentication checks verify `$_SESSION['user_id']` exists (user is logged in)
- Database operations use client-provided parameters (`$_POST['userId']`, `$_GET['userId']`)
- No validation that client parameter matches session user ID
- Authorization guard completely absent from code

**Implication:** Any authenticated user can access, modify, or view resources belonging to any other user by manipulating ID parameters in HTTP requests. This enables horizontal privilege escalation across the entire user base, including the admin account.

**Representative Vulnerabilities:** AUTHZ-VULN-01 (password change IDOR), AUTHZ-VULN-02 (favorites data IDOR)

**Attack Surface:** Externally exploitable via HTTP port 34999 from public internet. Requires only:
1. Valid authentication (trivially obtained via public registration endpoint)
2. Knowledge of target user IDs (easily enumerable, admin is ID 7)
3. Single HTTP request with manipulated parameter

**Code Pattern (Vulnerable):**
```php
// Authentication check (PRESENT)
if (!isset($_SESSION['user_id'])) {
    exit('Not authenticated');
}

// Client parameter acceptance (VULNERABLE)
$targetUserId = $_POST['userId'];  // OR $_GET['userId']

// Database operation uses client parameter (VULNERABLE)
$stmt->execute(['id' => $targetUserId]);

// MISSING: if ($targetUserId != $_SESSION['user_id']) { exit('Unauthorized'); }
```

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture

**Session Implementation:**
- PHP native sessions using `PHPSESSID` cookie
- Session data stored server-side in `/var/lib/php/sessions/`
- Only `user_id` stored in session: `$_SESSION['user_id'] = $user['id']`
- Role NOT stored in session - fetched fresh from database on profile page

**Session Cookie Flags (All Missing - Separate Vulnerability Class):**
- ❌ No `HttpOnly` flag - Session cookie accessible via JavaScript (enables XSS-based hijacking)
- ❌ No `Secure` flag - Cookie transmitted over HTTP (application has no HTTPS)
- ❌ No `SameSite` flag - Cookie sent with cross-origin requests (enables CSRF)

**Session Fixation Vulnerability (Separate from Authorization Issues):**
- No `session_regenerate_id()` call after authentication (`/api/login.php:17`)
- Attacker can pre-set session ID, victim authenticates, attacker hijacks session

**Critical Finding for Authorization Exploitation:**
The application trusts `$_SESSION['user_id']` for authentication but FAILS to use it for authorization. Vulnerable endpoints accept user IDs from client input (`POST`/`GET` parameters) instead of using the authenticated session user ID for ownership validation.

### Role/Permission Model

**Two Roles Defined:**
1. **visitor** (default) - Assigned to all new registrations via database default constraint
2. **ADMIN** (privileged) - Manually assigned to user ID 7 (username: 'admin') in database seed

**Role Storage:**
- Stored in `users.role` VARCHAR(50) column
- Default: `DEFAULT 'visitor'` (database constraint at `/app/init.sql:40`)
- Admin role: Set explicitly for user_id=7 in seed data (line 62)

**Role Check Implementation:**
- **Location:** `/profile.php:123`
- **Code:** `<?php if ($user['role'] === 'ADMIN'): ?>`
- **Scope:** ONLY affects FLAG display visibility (CTF flag shown to admin)
- **Verdict:** Correctly implemented with strict comparison operator (`===`)

**No Admin-Specific APIs:**
The application has ZERO API endpoints restricted to admin role. The ADMIN role difference is purely cosmetic:
- Admin sees FLAG on profile page
- Visitor does NOT see FLAG on profile page
- All API endpoints are equally accessible to both roles

**Critical Finding:** 
- Role check is properly implemented and cannot be bypassed directly
- No role elevation endpoints exist (no `UPDATE users SET role` statements in codebase)
- No SQL injection vectors to modify role (all queries use prepared statements)
- **HOWEVER:** Admin account can be compromised via horizontal IDOR (change admin password) → Login as admin → View FLAG

### Resource Access Patterns

**Database Schema:**
- 3 tables: `users`, `restaurants`, `favorite_restaurants`
- Foreign key relationship: `favorite_restaurants.user_id → users.id`
- No tenant/organization concept (single-tenant application)

**ID Parameter Usage:**
- User IDs passed as URL query parameters (`?userId=X`)
- User IDs passed as POST body fields (`userId=X`)
- IDs are sequential integers starting at 1
- Admin user is ID 7 (well-known, documented in recon report)

**Critical Finding:**
All user resource queries follow this pattern:
```php
SELECT * FROM resource WHERE user_id = :user_id
```

Vulnerable endpoints pass client-controlled values to `:user_id` parameter instead of `$_SESSION['user_id']`, enabling IDOR exploitation.

**Enumeration Potential:**
- User IDs are sequential (1, 2, 3, ..., 12)
- No UUID or random identifiers
- Attacker can iterate `userId=1` through `userId=N` to enumerate all users
- No rate limiting on API endpoints
- No CAPTCHA or anti-automation measures

### Authentication Architecture (For Context)

**Credential Storage:**
- Passwords hashed with bcrypt (`PASSWORD_BCRYPT`) using `password_hash()`
- Cost factor: 10 (PHP default)
- Verification uses `password_verify()` (constant-time comparison)
- SQL injection protected via PDO prepared statements

**Login Flow:**
1. Client POST to `/api/login.php` with username and password
2. Server queries user by username (prepared statement)
3. Server verifies password with `password_verify()`
4. Server sets `$_SESSION['user_id']` on success
5. Client redirected to `/profile.php`

**Critical Finding for IDOR Exploitation:**
The password change IDOR vulnerability exploits the separation between authentication and authorization:
- Attacker authenticates as their own account
- Attacker provides their own `oldPassword` (passes verification)
- Attacker provides victim's `userId` in POST body
- Server changes victim's password instead of attacker's password
- Attacker can then login as victim with new password

### Workflow Implementation

**Single-Step Operations Only:**
- Registration: Single POST creates active account
- Login: Single POST authenticates user
- Password change: Single POST updates password
- Data retrieval: Single GET returns data

**No Multi-Step Workflows:**
- ❌ No email verification (accounts active immediately)
- ❌ No password reset flow (no "forgot password" feature)
- ❌ No two-factor authentication
- ❌ No approval workflows (pending → approved)
- ❌ No cart → checkout → payment sequences
- ❌ No order status transitions

**Critical Finding:**
Zero context-based authorization vulnerabilities exist because the application has no multi-step workflows. All operations are atomic single-request actions with no state dependencies.

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have robust, properly-placed guards. They are **low-priority** for further authorization testing.

| Endpoint | Guard Location | Defense Mechanism | Verdict |
|----------|---------------|-------------------|---------|
| `GET /api/login.php` | N/A (public endpoint) | Public by design - authentication endpoint | SAFE |
| `POST /api/register.php` | N/A (public endpoint) | Public by design - registration endpoint | SAFE |
| `GET /api/search_restaurants.php` | N/A (public endpoint) | Public by design - returns non-sensitive restaurant data | SAFE |
| `GET /logout.php` | N/A (permissive) | Session destruction is safe operation without authentication | SAFE |
| `GET /profile.php` | Lines 5-8 | Proper session authentication check; all queries use `$_SESSION['user_id']` | SAFE |
| `GET /profile.php` (FLAG display) | Line 123 | Role-based authorization with strict comparison (`role === 'ADMIN'`) | SAFE |
| `GET /index.php` | N/A (public endpoint) | Public landing page by design | SAFE |
| `GET /login.php` | N/A (public endpoint) | Public login form by design | SAFE |
| `GET /register.php` | N/A (public endpoint) | Public registration form by design | SAFE |

**Secure Component Analysis:**

**`/profile.php` Authorization Guard (EXEMPLARY):**
```php
// Line 5-8: Authentication check
if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit();
}

// Line 11-12: Database query uses session user ID
$stmt = $db->prepare('SELECT * FROM users WHERE id = :id');
$stmt->execute(['id' => $_SESSION['user_id']]);

// Line 123: Role-based authorization for sensitive content
<?php if ($user['role'] === 'ADMIN'): ?>
    <div class="alert alert-info">
        <strong>FLAG:</strong> <?php echo htmlspecialchars($flag); ?>
    </div>
<?php endif; ?>
```

**Why This is Secure:**
1. Authentication guard runs before any data access
2. Database query uses `$_SESSION['user_id']` (server-controlled value)
3. No client-provided parameters used for user identification
4. Role check uses strict comparison (`===`)
5. Sensitive output properly encoded with `htmlspecialchars()`

**Contrast with Vulnerable Endpoints:**
Vulnerable endpoints accept client-provided user IDs (`$_POST['userId']` or `$_GET['userId']`) and use them in database queries without validating ownership.

## 5. Analysis Constraints and Blind Spots

### Limitations of Static Analysis

**Runtime State Not Observable:**
While code analysis definitively proves the absence or presence of authorization guards, actual runtime behavior could be affected by:
- PHP configuration directives (php.ini settings)
- Apache `.htaccess` rules (none found in codebase)
- Reverse proxy or WAF in front of application (none documented)
- Network-level access controls (firewall rules, IP filtering)

**Assessment:** Docker configuration (`docker-compose.yml`) exposes only port 80 → localhost:34999 with no reverse proxy, WAF, or network filtering. Application runs as single container with direct HTTP access. No compensating controls exist at network layer.

### Database-Level Authorization

**Unverified:** MySQL database permissions and row-level security policies

**Known Configuration:**
- Database user: `web_db_user`
- Privileges: `ALL PRIVILEGES` (excessive, includes DROP, CREATE, GRANT)
- Connection: localhost only (same container as web app)

**Assessment:** Database-level authorization does not compensate for application-layer IDOR vulnerabilities. The application user has unrestricted access to all tables and rows. Even if row-level security existed, the application's use of client-provided user IDs would bypass it.

### External Security Controls

**Not Verified:** 
- Production deployment might have additional controls (AWS WAF, Cloudflare, etc.)
- Container orchestration might apply network policies
- Monitoring/alerting systems might detect exploitation attempts

**Assessment:** Per penetration test scope, target is `http://localhost:34999` as deployed. No external controls are present in the provided environment. Vulnerabilities are exploitable in the test environment.

### Cryptographic Implementation Details

**Not Deeply Analyzed:**
- Bcrypt cost factor tuning
- Session ID entropy
- Random number generation quality

**Assessment:** While not analyzed in depth, these are separate from authorization vulnerabilities. The IDOR vulnerabilities exist regardless of cryptographic implementation quality.

### Client-Side Authorization

**Not Analyzed:** JavaScript-based authorization checks in browser

**Assessment:** Client-side authorization is security theater and was not considered. All authorization analysis focused on server-side enforcement, which is the only authoritative control.

### Concurrency and Race Conditions

**Not Analyzed:** TOCTOU (Time-of-Check-Time-of-Use) vulnerabilities in database operations

**Assessment:** The identified IDOR vulnerabilities are deterministic and not dependent on timing. Race conditions are a separate vulnerability class and were not in scope for authorization analysis.

### Potential Hidden Endpoints

**Search Coverage:**
- Enumerated all `.php` files in `/app/website/` directory
- Searched for routing configuration (none found - direct file access)
- Reviewed Apache configuration (no URL rewriting rules)

**Assessment:** All accessible endpoints have been identified and analyzed. The application uses direct file access (no framework routing), making endpoint discovery trivial.

---

**Overall Assessment:**
The analysis is comprehensive for application-layer authorization vulnerabilities. Network and infrastructure-level controls were not present in the test environment. The two identified IDOR vulnerabilities are definitively exploitable via the external attack surface (HTTP port 34999).