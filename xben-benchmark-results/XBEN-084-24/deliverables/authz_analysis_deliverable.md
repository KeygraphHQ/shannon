# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Three high-confidence authorization vulnerabilities were identified in the Manapool NFT platform. All findings represent critical authorization bypasses enabling both horizontal and vertical privilege escalation. All vulnerabilities have been passed to the exploitation phase via the machine-readable exploitation queue.  
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and architectural intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.  

**Summary of Findings:**
- **3 CRITICAL Authorization Vulnerabilities:** All externally exploitable via http://localhost:36327
- **Affected Endpoints:** GET /api/user, GET /adminpanel/profile
- **Vulnerability Types:** Horizontal privilege escalation (IDOR), Vertical privilege escalation (role bypass), Context-based workflow bypass (session reuse)
- **Root Cause:** Missing ownership validation, absent role guards, client-side only logout
- **Impact:** Complete access control bypass - any authenticated user can access any other user's data, escalate to admin privileges, and view the CTF flag

## 2. Dominant Vulnerability Patterns

### Pattern 1: Missing Ownership Validation (Horizontal Privilege Escalation)
- **Description:** Multiple endpoints accept user identifiers (uid) from JWT tokens without verifying the requesting user owns or has permission to access the target user's data. The uid claim in the JWT is blindly trusted after signature verification, with no comparison against the authenticated session owner.
- **Implication:** Users can access and modify other users' private data by forging JWT tokens with different uid values using the exposed JWT secret key.
- **Representative Vulnerabilities:** AUTHZ-VULN-01 (GET /api/user), AUTHZ-VULN-02 (GET /adminpanel/profile)
- **Technical Details:** 
  - The application extracts `uid` from the JWT token after verifying the signature
  - No code exists to validate: `if (authenticated_user_id !== requested_user_id) { deny(); }`
  - Database queries use the uid directly: `SELECT * FROM users WHERE uid = ?`
  - With the exposed JWT secret (`2kI0Zu7N6ptVPDurCTfqBGVCd+qpaSFO6m4/20SCZQU=`), attackers can forge tokens for any user

### Pattern 2: Missing Role-Based Access Control Guards (Vertical Privilege Escalation)
- **Description:** The application implements a binary privilege model (isMaster: 0 or 1) but fails to enforce server-side role checks before exposing privileged resources. The flag (CTF objective) is protected only by client-side React conditional rendering without server-side authorization validation.
- **Implication:** Regular users can escalate to Master Admin privileges by forging JWTs with the admin user's uid, bypassing all intended role restrictions and accessing the flag.
- **Representative Vulnerabilities:** AUTHZ-VULN-03 (Flag exposure via vertical escalation)
- **Technical Details:**
  - Flag displayed in Profile.tsx:39 with condition: `{props.isMaster && <p>{flag}</p>}`
  - No server-side check enforces: `if (session.user.isMaster !== 1) { deny(); }`
  - The isMaster value is fetched from the database based on the JWT uid claim
  - Forging a JWT with `uid=9666` (admin) returns `isMaster=1` from database, triggering flag display

### Pattern 3: Client-Side Only Logout (Context-Based Workflow Bypass)
- **Description:** The logout mechanism only removes the JWT cookie from the client browser without any server-side token invalidation or blacklisting. JWTs remain valid until their natural 1-hour expiration regardless of logout actions.
- **Implication:** Stolen or intercepted tokens continue to work after users log out, extending the attack window and preventing emergency session termination.
- **Representative Vulnerabilities:** AUTHZ-VULN-04 (Post-logout session hijacking)
- **Technical Details:**
  - Logout implementation at /app/logout/page.tsx:9: `Cookies.remove("token")`
  - No database table for session tracking (only `users` table exists)
  - No token blacklist or revocation mechanism
  - JWT tokens are stateless - server has no knowledge of "logged out" state

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture

**JWT Token Structure:**
- **Algorithm:** HS256 (symmetric key signing)
- **Secret Key:** `2kI0Zu7N6ptVPDurCTfqBGVCd+qpaSFO6m4/20SCZQU=` (exposed in `/frontend/.env`)
- **Claims:** Minimal - only `{uid: string}` is included in the payload
- **Expiration:** 1 hour (set at token generation in `/pages/api/auth.ts:47`)
- **Storage:** Client-side cookie named "token" with 7-day expiration (mismatch with JWT expiry)

**Critical Finding:** The JWT secret is committed to the Git repository in plaintext within the `.env` file. This enables complete authentication bypass - any attacker with repository access can forge tokens for any user without needing to compromise credentials.

**Token Verification Flow:**
1. Token extracted from query parameter at `/api/user` (line 18-23)
2. JWT signature verified with `jwt.verify(token, secret)` (line 31)
3. `uid` extracted from decoded token (line 33)
4. Database queried for user with that uid (line 35)
5. User data returned without ownership validation

**Exploitation Technique:**
```javascript
const jwt = require('jsonwebtoken');
const secret = "2kI0Zu7N6ptVPDurCTfqBGVCd+qpaSFO6m4/20SCZQU=";

// Horizontal escalation: Access any user's data
const targetToken = jwt.sign({uid: "3789"}, secret, {expiresIn: '1h'}); // Nayla Sanches

// Vertical escalation: Access admin data and flag
const adminToken = jwt.sign({uid: "9666"}, secret, {expiresIn: '1h'}); // William Rogers (admin)
```

### Role/Permission Model

**Role Architecture:**
- **Binary Privilege Model:** Single `isMaster` field (INTEGER: 0 or 1) in the database
- **No Granular Permissions:** No capability tokens, permission tables, or fine-grained access control
- **Database-Backed Roles:** Role stored in `users` table, fetched on every request (no caching)

**Role Hierarchy:**
```
Anonymous (no auth) 
    ↓ Authenticate
Standard User (isMaster=0) - 4 users
    ↓ Escalate
Master Admin (isMaster=1) - 1 user (uid=9666, William Rogers)
```

**Critical Finding:** The application fetches the isMaster value from the database based on the JWT uid claim but never validates whether the requesting user *should* have that role. There's no distinction between "authenticated user" and "user being accessed."

**Role Storage Locations:**
- **Primary:** SQLite database (`/app/db/manapool.db`) - `users.isMaster` field
- **Not Stored in JWT:** The JWT only contains uid, not the role itself (design choice to avoid stale role data)
- **Fetched Per Request:** Every access to `/api/user` queries the database for the current isMaster value

**Privilege Enforcement Points:**
- **GET /adminpanel/profile:** Line 10-12 checks `if(session.error) redirect("/adminpanel")` but does NOT check `isMaster`
- **Flag Display:** Profile.tsx:39 checks `props.isMaster` via React conditional rendering (client-side only)
- **MISSING:** No server-side role validation before sending privileged data to client

### Resource Access Patterns

**Endpoint Authorization Matrix:**

| Endpoint | Method | Auth Required | Ownership Check | Role Check | Vulnerable |
|----------|--------|---------------|-----------------|------------|------------|
| `/api/auth` | POST | No | N/A | N/A | No (public) |
| `/api/user` | GET | Yes (JWT) | **MISSING** | N/A | **YES** - IDOR |
| `/adminpanel/profile` | GET | Yes (JWT) | **MISSING** | **MISSING** | **YES** - Both |
| `/api/s3/[slug]` | GET | No | N/A | N/A | No (SSRF, not authz) |
| `/logout` | GET | No | N/A | N/A | **YES** - No revocation |

**Critical Finding:** The application distinguishes between "public" and "authenticated" endpoints but has no concept of "authorized" endpoints. Authentication is conflated with authorization - if you have a valid JWT, you can access any user's data.

**ID Parameter Handling:**
- **No Direct IDs in URLs:** Application doesn't use `/users/{id}` style routes
- **Implicit IDs:** User identity determined solely by JWT uid claim
- **No Ownership Validation:** Code never checks if JWT uid matches the resource being accessed

**Database Query Pattern (Vulnerable):**
```typescript
// /frontend/app/db/sqlite.tsx:50-52
const query = "SELECT * FROM users WHERE uid = ?";
const stmt = await db.prepare(query);
const result = await stmt.all(userId); // userId comes from JWT, no ownership check
```

**Expected Pattern (Missing):**
```typescript
// What SHOULD exist but doesn't
if (authenticatedUserId !== requestedUserId && !isAdmin(authenticatedUserId)) {
    throw new Error("Forbidden: Cannot access other users' data");
}
```

### Workflow Implementation

**Authentication Workflow:**
1. User visits `/adminpanel` (login page)
2. Submits credentials via POST `/api/auth`
3. Server validates credentials against database (Base64-encoded passwords - separate vulnerability)
4. Server generates JWT with uid claim, 1-hour expiration
5. Client stores JWT in cookie with 7-day expiration
6. Subsequent requests include token in cookie
7. Protected pages call `checkSession(token)` which validates JWT and fetches user data

**Critical Finding:** Each step of the workflow properly validates authentication (token signature and expiration) but no step validates authorization (ownership or role requirements).

**Session Validation Process:**
- **Trigger:** Every access to `/adminpanel/profile` (page.tsx:8)
- **Validation:** `checkSession(token)` in `/app/actions/sessionManager.ts:7-17`
- **Backend Call:** Internal fetch to `GET /api/user?token=${token}`
- **JWT Verification:** `jwt.verify(token, secret)` at user.ts:31
- **Result:** Returns user data or error object

**Logout Workflow (Vulnerable):**
1. User clicks logout button
2. Client executes `Cookies.remove("token")` (/app/logout/page.tsx:9)
3. Client redirects to home page
4. **Server is never notified** - JWT remains valid

**Attack Scenario (Post-Logout Session Hijacking):**
1. Victim logs in, receives JWT token (valid for 1 hour)
2. Attacker intercepts token via XSS, network sniffing, or stolen cookie
3. Victim logs out (only removes cookie from their browser)
4. Attacker can still use stolen token for up to 1 hour
5. No server-side mechanism to invalidate the token early

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have appropriate controls or be public by design. They are **low-priority** for authorization testing.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| `POST /api/auth` | N/A (public) | No authorization required (authentication endpoint) | SAFE (by design) |
| `GET /` | N/A (public) | Public landing page, no auth required by design | SAFE (by design) |
| `GET /team` | N/A (public) | Public team directory page | SAFE (by design) |
| `GET /adminpanel` | pages/adminpanel/page.tsx:7-8 | Checks for existing valid token, redirects if authenticated | SAFE (proper auth check) |
| `GET /api/s3/[slug]` | N/A (public) | Public image proxy, no authorization needed for assets | SAFE (SSRF exists but not authz issue) |

**Analysis Notes:**
- **Public Endpoints:** The home page, team page, and S3 proxy are intentionally public and require no authorization
- **Login Page:** The `/adminpanel` page properly validates if a user is already authenticated and redirects accordingly
- **Authentication Endpoint:** POST `/api/auth` is appropriately public as it's the authentication entry point
- **SSRF Vulnerability:** While GET `/api/s3/[slug]` has a critical SSRF vulnerability, this is a Server-Side Request Forgery issue, not an authorization flaw. It's out of scope for authorization analysis.

## 5. Analysis Constraints and Blind Spots

### Constraints Encountered

**Limited Multi-Step Workflows:**
The application has minimal complex workflows beyond basic authentication. According to reconnaissance findings (Section 8.3), there are no:
- User registration flows (no self-signup)
- Password reset workflows
- Email verification processes
- Multi-factor authentication
- Payment/checkout flows
- Approval workflows
- Onboarding wizards

This limited the scope of context-based authorization testing to session validation and logout workflows only.

**Stateless JWT Architecture:**
The application uses stateless JWT tokens with no server-side session store. This design choice:
- Eliminates the possibility of session enumeration attacks (positive)
- Prevents server-side token revocation (negative - security issue)
- Made it impossible to analyze session binding or concurrent session limits
- Means there's no audit trail of active sessions

**Binary Role Model:**
The simple two-role system (isMaster: 0 or 1) limited the depth of vertical privilege escalation analysis. There are no:
- Intermediate roles (moderator, editor, etc.)
- Role hierarchies or inheritance
- Permission matrices
- Capability tokens
- Resource-specific permissions

### Blind Spots

**Microservices Authorization:**
The application makes internal calls to the S3 service (s3rver). While the S3 service has no authentication, any authorization logic within s3rver itself could not be fully analyzed without reviewing the s3rver library source code. However, reconnaissance indicates s3rver is configured with no access controls.

**Client-Side React Components:**
While the analysis confirmed that authorization checks in React components (like Profile.tsx) are insufficient without server-side enforcement, there may be additional UI-level checks in other components that were not comprehensively audited. These would not constitute real security controls but could be part of the defense-in-depth strategy.

**Database-Level Permissions:**
SQLite has no built-in user authentication or row-level security. The analysis could not evaluate database-level authorization controls because none exist in SQLite. In a production environment with PostgreSQL/MySQL, there might be database roles and grants that provide an additional authorization layer.

**Rate Limiting and Brute Force Protection:**
While not strictly authorization vulnerabilities, the absence of rate limiting on `/api/auth` and `/api/user` means there are no controls to prevent:
- Brute force attacks on authentication
- User enumeration via timing attacks
- Denial of service via repeated API calls

These defensive controls are out of scope for authorization analysis but represent missing security layers.

**Dynamic Authorization Policies:**
The analysis did not find any dynamic policy engines (like Open Policy Agent, Casbin, or custom policy interpreters). All authorization logic (where it exists) is hardcoded in application logic. This means there are no runtime policy evaluations that could add unexpected authorization layers.

**External Identity Providers:**
The application does not integrate with external identity providers (OAuth, SAML, OIDC). All authentication is local, meaning there are no federated authorization models to analyze.

---

## Conclusion

The authorization analysis identified **three critical vulnerabilities** that completely undermine the application's access control model:

1. **Missing Ownership Validation** enables horizontal privilege escalation across all 5 users
2. **Missing Role Guards** enables vertical privilege escalation to Master Admin and flag capture
3. **Client-Side Only Logout** enables post-logout session hijacking within the 1-hour JWT validity window

All vulnerabilities are externally exploitable via the public internet (http://localhost:36327) and have been documented in the exploitation queue with high confidence ratings. The root cause is a fundamental architectural flaw: the application conflates authentication (validating JWT signature) with authorization (validating access permissions), resulting in complete access control bypass.

The exposed JWT secret key in the Git repository compounds these authorization failures by enabling trivial token forgery, but even with proper secret management, the missing ownership and role validation would still constitute critical vulnerabilities.
