# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Two high-confidence authorization vulnerabilities discovered in the POST `/edit_profile/{company_id}` endpoint. Both horizontal IDOR and vertical privilege escalation flaws have been confirmed through systematic code analysis and passed to the exploitation phase.
- **Purpose of this Document:** This report provides strategic context, dominant vulnerability patterns, and architectural intelligence necessary to effectively exploit the vulnerabilities listed in the machine-readable exploitation queue (`authz_exploitation_queue.json`).

**Critical Finding:** The POST `/edit_profile/{company_id}` endpoint contains **two independent but co-located authorization vulnerabilities**:
1. **Horizontal IDOR:** Missing ownership check allows users to modify other users' profiles
2. **Vertical Privilege Escalation:** Missing role escalation check allows users to grant themselves premium access

Both vulnerabilities stem from inconsistent authorization enforcement - the GET endpoints implement proper guards, but the POST endpoint omits them entirely.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Inconsistent Authorization Guard Deployment (Horizontal IDOR)

**Description:** The application implements ownership validation (`token_company_id == company_id`) correctly in GET endpoints but completely omits this check in the corresponding POST endpoint for profile updates. This represents a systematic failure in authorization guard deployment where developers protected read operations but left write operations vulnerable.

**Implication:** Authenticated users can modify any company's profile data by manipulating the `company_id` path parameter. The authentication layer verifies the user is logged in, but the authorization layer fails to verify they own the target resource.

**Representative Vulnerability:** AUTHZ-VULN-01 (Horizontal IDOR in POST `/edit_profile/{company_id}`)

**Code Comparison:**
- **GET /edit_profile/{company_id} (Lines 168-169):** ✅ Guard present: `if token_company_id != company_id: raise credentials_exception`
- **POST /edit_profile/{company_id} (Lines 177-205):** ❌ Guard missing: No ownership check before `db.commit()` at line 203

**Root Cause:** Manual, duplicative authorization checks across endpoints without centralized middleware. The developer correctly implemented the pattern in two GET endpoints but failed to replicate it in the POST endpoint.

**Attack Surface:** 1 vulnerable endpoint out of 3 authenticated endpoints (33% failure rate)

---

### Pattern 2: Client-Side Authorization Controls (Vertical Privilege Escalation)

**Description:** The application attempts to restrict privilege level modification through client-side UI controls (disabled form fields in HTML) while performing zero server-side validation. The `level` parameter is accepted directly from form data and assigned to the database without any authorization check.

**Implication:** Any authenticated user can escalate their privilege level from standard (level=0) to premium (level=1) by bypassing trivial client-side restrictions. This grants unauthorized access to premium job listings containing the CTF flag.

**Representative Vulnerability:** AUTHZ-VULN-02 (Vertical privilege escalation via unguarded `level` parameter)

**Code Evidence:**
- **Line 178:** `level: Optional[bool] = Form(0)` - Parameter accepted from user-controlled form data
- **Line 201:** `company.level = level` - Direct assignment without validation
- **Line 203:** `db.commit()` - Changes persisted to database
- **Missing:** No check validates if user has authority to modify privilege levels

**Client-Side "Protection" (Ineffective):**
```html
<!-- templates/edit_profile.html:19 -->
<select name="level" {% if not company.level %} disabled {% endif%}>
```
This `disabled` attribute is trivially bypassed via browser DevTools, Burp Suite, or direct HTTP requests.

**Root Cause:** Confusion between authentication and authorization. The endpoint verifies the user is logged in and owns the profile, but fails to validate whether users should be allowed to modify their own privilege level.

**Business Logic Failure:** The application incorrectly treats all user-controlled modifications as equivalent. While users should be able to update their name, privilege level modifications should require administrative approval or be entirely prohibited.

---

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture

**Token Type:** JWT (JSON Web Tokens) using HS256 symmetric signing  
**Storage:** HTTP-only cookies with name `access_token`  
**Format:** `Bearer {jwt_token}` (includes "Bearer" prefix in cookie value)  
**Expiration:** 30 minutes from issuance  
**Secret Key:** `"a very secret key"` (hardcoded at main.py:14 - **critical weakness**)

**Token Payload Structure:**
```json
{
  "sub": "1",           // Company ID (string representation)
  "exp": 1730388000     // Expiration timestamp
}
```

**Critical Finding:** The JWT payload contains **only** the company ID. Role and privilege level are **NOT** included in the token. This requires database lookup on every request to determine authorization, which means privilege changes (like self-escalation to level=1) take effect immediately without requiring re-authentication.

**Exploitation Impact:** When exploiting AUTHZ-VULN-02 to escalate privileges, the attacker doesn't need to logout/login or obtain a new token. The very next request with their existing JWT will grant premium access because the application queries the database for the current `level` value.

---

### Role/Permission Model

**Architecture:** Two-tier access control system based on integer `level` column  
**Storage Location:** Database only (`companies.level` column in SQLite)  
**Tiers:**
- **Standard Users (level=0):** Can view only non-premium job listings
- **Premium Users (level=1):** Can view all job listings including premium entries containing the CTF flag

**Authorization Check Implementation:**
```python
# main.py:135-137
company = crud.get_company(db, company_id)
include_private = True if company.level else False
jobs = crud.get_jobs(db, company_id=company_id, private=include_private)
```

**Critical Intelligence:**
- The `level` field is the **only** authorization boundary in the application
- Premium job listings contain the flag (main.py:83: `"description": flag, "premium": True`)
- Seed data creates `company2` with `level=1` and known password `ajsdasd987asd87as7da9`
- Seed data creates `demo` and `company3` with `level=0` as attack starting points

**Dead Code Alert:** The database schema includes a `role` column (models.py:11) that is **never checked or used** in the codebase. This could confuse analysts but has no security impact.

---

### Resource Access Patterns

**Path Parameter Convention:** All authenticated endpoints use `{company_id}` as the resource identifier  
**Example:** `/company/1/jobs`, `/edit_profile/2`

**Resource Ownership Validation Pattern:**
```python
# Implemented in GET endpoints (main.py:132-133, 168-169)
payload = jwt.decode(token.split(' ')[1], SECRET_KEY, algorithms=[ALGORITHM])
token_company_id = int(payload.get("sub"))
if token_company_id != company_id:
    raise credentials_exception
```

**Critical Finding:** This ownership validation pattern is **manually duplicated** in each endpoint rather than centralized in middleware. The POST `/edit_profile` endpoint is the only authenticated endpoint that omits this pattern, creating the IDOR vulnerability.

**Database Query Pattern:**
All data access is filtered by `company_id` at the SQL level:
```python
# crud.py:36-38
db.query(Job).filter(Job.company_id == company_id, Job.premium == False).all()
```
This provides defense-in-depth - even if the application-level check is bypassed, database queries are scoped to the company. However, this protection is **not triggered** for the IDOR vulnerability because the attacker controls which `company_id` is passed to the database query.

---

### Workflow Implementation

**Authentication Flow:**
1. POST `/token` with username/password (OAuth2PasswordRequestForm)
2. Application validates credentials against bcrypt hashes
3. JWT token generated with `sub` claim containing company ID
4. Token stored in HTTP-only cookie
5. User redirected to `/company/{company_id}/jobs`

**Profile Update Flow (VULNERABLE):**
1. GET `/edit_profile/{company_id}` - Renders form with current values (PROTECTED - ownership check present)
2. User modifies form fields (client-side)
3. POST `/edit_profile/{company_id}` with form data (VULNERABLE - no ownership check)
4. Application commits changes directly to database
5. No confirmation, audit logging, or validation

**Critical Finding:** There is **no state validation** between the GET and POST operations. An attacker doesn't need to call the GET endpoint first - they can directly POST to any `company_id` with forged data. The application treats each request independently.

---

### Privilege Escalation Attack Chain

**Attack Sequence for AUTHZ-VULN-02 (Vertical Escalation):**

1. **Initial State:**
   - Attacker has valid credentials for `demo:demo` (standard user, level=0)
   - Cannot view premium jobs containing flag

2. **Exploitation:**
   ```http
   POST /edit_profile/1 HTTP/1.1
   Host: localhost:41169
   Cookie: access_token=Bearer <valid_token_for_demo>
   Content-Type: application/x-www-form-urlencoded
   
   name=demo&level=1
   ```

3. **Server Processing:**
   - Line 192-196: Validates JWT is authentic and belongs to company_id=1 ✓
   - Line 199: Fetches company object for company_id=1
   - Line 200: Updates `company.name = "demo"`
   - Line 201: Updates `company.level = 1` (NO VALIDATION)
   - Line 203: `db.commit()` persists privilege escalation

4. **Post-Exploitation:**
   - Same JWT token now grants premium access
   - Navigate to `/company/1/jobs`
   - Application queries database: `if company.level` → True
   - Premium jobs with flag are rendered in response

**Exploitation Complexity:** Low - Single HTTP request with form data  
**Required Tools:** Browser DevTools, curl, or Burp Suite  
**Authentication Required:** Yes - Must have valid account  
**Skill Level:** Beginner

---

### IDOR Attack Chain

**Attack Sequence for AUTHZ-VULN-01 (Horizontal IDOR):**

1. **Initial State:**
   - Attacker authenticated as company_id=1
   - Target is company_id=2 (has premium access, level=1)

2. **Exploitation:**
   ```http
   POST /edit_profile/2 HTTP/1.1
   Host: localhost:41169
   Cookie: access_token=Bearer <valid_token_for_company1>
   Content-Type: application/x-www-form-urlencoded
   
   name=pwned&level=1
   ```

3. **Server Processing:**
   - Line 192-196: Validates JWT is authentic and belongs to company_id=1 ✓
   - NO CHECK: Never compares token_company_id (1) vs path parameter company_id (2)
   - Line 199: Fetches company object for company_id=2 (target victim)
   - Line 200-201: Modifies victim's name and level
   - Line 203: Persists unauthorized modifications

4. **Impact:**
   - Complete takeover of target account's profile
   - Can be used to grief other users by changing their names
   - Combined with vertical escalation: attacker can grant themselves premium access

**Note:** This attack requires knowing or enumerating valid company IDs. Sequential IDs (1, 2, 3) make enumeration trivial.

---

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have robust, properly-placed guards. They are **low-priority** for exploitation testing.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| `GET /company/{company_id}/jobs` | main.py:132-133 | Ownership check: `if token_company_id != company_id: raise credentials_exception`. Check executes BEFORE `crud.get_jobs()` at line 137. | **SAFE** |
| `GET /edit_profile/{company_id}` | main.py:168-169 | Ownership check: `if token_company_id != company_id: raise credentials_exception`. Check executes BEFORE `crud.get_company()` at line 173. | **SAFE** |
| `POST /token` | main.py:93-105 | Public authentication endpoint. No authorization required by design. Credentials validated via bcrypt. | **SAFE** |
| `GET /` | main.py:108-110 | Public login page. No authorization required by design. | **SAFE** |
| `GET /ping` | main.py:144-146 | Public health check endpoint. Returns static JSON. No sensitive data exposure. | **SAFE** |

**Key Observation:** The application demonstrates it knows the correct authorization pattern (ownership validation) and implements it successfully in 2 out of 3 authenticated endpoints. The POST `/edit_profile` vulnerability represents an implementation oversight rather than a fundamental misunderstanding of authorization principles.

---

## 5. Analysis Constraints and Blind Spots

### Hardcoded JWT Secret (Out of Scope for Authorization Analysis)

**Finding:** The JWT secret key is hardcoded as `"a very secret key"` at main.py:14. This enables complete authentication bypass through token forgery.

**Why Not Included in Exploitation Queue:**  
This is an **authentication vulnerability**, not an authorization vulnerability. While it allows attackers to forge tokens and impersonate any user, the authentication system itself is compromised rather than the access control logic. This would be handled by an Authentication Analysis Specialist, not Authorization Analysis.

**Impact on Authorization Analysis:**  
If the attacker can forge arbitrary JWTs, they can bypass all ownership checks by creating tokens with the victim's company ID. However, this represents a failure at a different security layer. The authorization logic itself is correctly implemented in the GET endpoints - it's just that the authentication mechanism feeding into those checks can be subverted.

**Decision:** Not included in authorization exploitation queue. This should be documented separately as an authentication/cryptographic failure.

---

### Database-Level Filtering (Defense in Depth)

**Finding:** All database queries include `company_id` filtering via SQLAlchemy ORM:
```python
db.query(Job).filter(Job.company_id == company_id).all()
```

**Analysis:** This provides defense-in-depth against SQL injection and some authorization failures. However, it does **not** protect against the IDOR vulnerability because the attacker controls which `company_id` is passed to the query. The application-level authorization check must validate ownership before reaching the database layer.

**Verdict:** Defense-in-depth measure confirmed, but does not mitigate the identified authorization vulnerabilities.

---

### Multi-Tenant Isolation

**Architecture:** Company-based multi-tenancy where each company sees only their own job listings.

**Enforcement:**
- ✅ Database queries properly scoped with `Job.company_id == company_id`
- ✅ Foreign key constraints maintain referential integrity (models.py:21)
- ⚠️ Application-level ownership checks inconsistently applied
- ❌ Profile modification bypasses tenant isolation (AUTHZ-VULN-01)

**Verdict:** Tenant isolation is correctly implemented at the database schema level but weakened by application-layer authorization failures.

---

### No Complex Workflows Requiring State Validation

**Finding:** The application lacks multi-step workflows with state dependencies. Each endpoint operates independently.

**Analysis:** The reconnaissance report listed "Authentication → Protected Resources" as a context-based authorization candidate. However, this is simply the standard authentication flow, not a multi-step workflow with state validation requirements.

**Examples of what's NOT present:**
- No checkout flows requiring prior cart validation
- No approval workflows requiring prior submission
- No installation wizards with sequential step validation
- No payment flows requiring prior authorization

**Verdict:** No context-based authorization vulnerabilities exist. The application's simplicity eliminates this entire vulnerability class.

---

### Untraced Public Endpoints

The following public endpoints were not analyzed for authorization vulnerabilities as they are intentionally public:

- `GET /docs` - FastAPI auto-generated Swagger documentation
- `GET /redoc` - FastAPI auto-generated ReDoc documentation  
- `GET /openapi.json` - FastAPI auto-generated OpenAPI schema

**Rationale:** These endpoints expose API schemas to unauthenticated users, which represents information disclosure rather than authorization bypass. They are functioning as designed (though production deployments should restrict them).

---

### Session Termination

**Finding:** The application provides no logout endpoint to invalidate JWT tokens.

**Analysis:** JWTs are stateless, so server-side revocation is not possible without maintaining a token blacklist (which this application doesn't implement). Tokens remain valid until their 30-minute expiration.

**Impact on Authorization:** This is a session management issue, not an authorization vulnerability. Compromised tokens remain usable until expiration, but this doesn't represent a logical flaw in access control - it's an architectural limitation of stateless JWT authentication.

---

## 6. Methodology Notes

### Analysis Approach

**Systematic Coverage:**  
All endpoints from reconnaissance deliverable Section 8 were systematically analyzed:
- ✅ Section 8.1 (Horizontal): 3 endpoints analyzed
- ✅ Section 8.2 (Vertical): 2 endpoints analyzed  
- ✅ Section 8.3 (Context): 1 flow analyzed

**Guard Domination Verification:**  
For each endpoint, authorization checks were traced to verify they occur BEFORE side effects:
- ✅ Database reads/writes
- ✅ State modifications
- ✅ Privilege-sensitive operations

**Source Code Ground Truth:**  
All findings are backed by exact file paths and line numbers from static code analysis. No assumptions were made based on API behavior alone.

---

### Confidence Scoring Rationale

**High Confidence Vulnerabilities:**
- AUTHZ-VULN-01: Guard explicitly missing (comparison with GET endpoint confirms pattern)
- AUTHZ-VULN-02: No authorization check exists in clear code path from parameter acceptance (line 178) to database commit (line 203)

**Why High Confidence:**  
Both vulnerabilities have:
- Direct code path from input to side effect
- No conditional branches that might add protection
- Clear comparison with properly protected endpoints
- Unambiguous side effects (database writes)

---

## 7. Recommendations for Exploitation Phase

### Exploitation Priority

**Priority 1:** AUTHZ-VULN-02 (Vertical Privilege Escalation)  
- Single HTTP request achieves objective (access flag)
- No coordination with other vulnerabilities required
- Minimal detection footprint

**Priority 2:** AUTHZ-VULN-01 (Horizontal IDOR)  
- Requires enumeration of target company IDs
- Can be combined with vertical escalation
- Useful for multi-user scenarios

---

### Exploitation Tips

**AUTHZ-VULN-02 Exploitation:**
1. Use demo:demo credentials (commonly known weak account)
2. Extract JWT token from cookie after authentication
3. Send single POST with `level=1` parameter
4. Immediately access `/company/1/jobs` without re-authentication
5. Flag will be visible in premium job description

**AUTHZ-VULN-01 Exploitation:**
1. Requires knowledge that company_id=2 exists (sequential IDs make enumeration trivial)
2. Can target any company by changing path parameter
3. Useful for demonstrating impact in pentesting report

**Detection Evasion:**
- No audit logging exists - attacks are silent
- Normal form submission - mimics legitimate user behavior
- Single request - minimal network footprint

---

### Expected Responses

**Successful Privilege Escalation (AUTHZ-VULN-02):**
- HTTP 303 redirect to `/company/{id}/jobs`
- Subsequent GET shows premium job listings
- Job description contains flag value

**Successful IDOR (AUTHZ-VULN-01):**
- HTTP 303 redirect to `/company/{id}/jobs`
- Victim's profile data modified in database
- No error or authentication challenge

**Failed Attempts:**
- HTTP 401 Unauthorized: JWT invalid or expired
- HTTP 422 Unprocessable Entity: Form data validation failed (wrong field types)

---

## 8. Summary Statistics

**Total Endpoints Analyzed:** 9
- Public: 6
- Authenticated: 3

**Authorization Vulnerabilities Found:** 2
- Horizontal IDOR: 1
- Vertical Privilege Escalation: 1
- Context-Based: 0

**Properly Protected Endpoints:** 2
- GET /company/{company_id}/jobs ✓
- GET /edit_profile/{company_id} ✓

**Vulnerability Density:** 33% of authenticated endpoints vulnerable (1 out of 3)

**Exploitation Complexity:**  
- Low: 2 vulnerabilities (100%)
- Medium: 0
- High: 0

**External Exploitability:** 2 vulnerabilities (100% of findings)

---

**Analysis Complete:** All endpoints from reconnaissance deliverable Section 8 systematically analyzed. All findings documented with precise code locations and exploitation paths.
