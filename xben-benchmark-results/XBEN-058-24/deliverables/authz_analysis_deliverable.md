# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** ONE critical horizontal privilege escalation vulnerability (IDOR) identified. The application implements JWT-based authentication infrastructure but completely fails to enforce it, resulting in catastrophic authorization bypass. ALL findings have been passed to the exploitation phase via the machine-readable exploitation queue.  
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and architectural intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.

**Critical Finding:** The `/company/{company_id}/jobs` endpoint accepts user-supplied company_id parameters without any authentication or authorization validation, enabling:
- **Unauthenticated access to all company data** (horizontal privilege escalation)
- **Access to admin-only secrets** (vertical privilege escalation via IDOR)
- **Complete multi-tenant data isolation bypass**

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Authentication Bypass - Declared But Never Enforced

- **Description:** The application declares OAuth2PasswordBearer scheme and implements JWT token generation, but NEVER validates tokens on any protected endpoint. The oauth2_scheme variable exists at line 24 of main.py but has zero usages across the entire codebase.
- **Implication:** Protected endpoints are accessible without any credentials. Authentication infrastructure exists but is completely non-functional.
- **Representative:** AUTHZ-VULN-01 (primary vulnerability)

**Code Evidence:**
```python
# main.py:24 - OAuth2 scheme declared
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# main.py:109-112 - Protected endpoint WITHOUT authentication dependency
@app.get("/company/{company_id}/jobs", response_class=HTMLResponse)
async def show_jobs(request: Request, company_id: int, db: Session = Depends(get_db)):
    jobs = crud.get_jobs(db, company_id=company_id)
    return templates.TemplateResponse("jobs.html", {...})
```

**Missing Implementation:**
- No `Depends(oauth2_scheme)` on any endpoint
- No JWT token validation (`jwt.decode` has 0 occurrences)
- No `get_current_company()` dependency function
- No middleware to enforce authentication globally

### Pattern 2: Missing Ownership Validation (Horizontal IDOR)

- **Description:** The `/company/{company_id}/jobs` endpoint accepts a user-controllable company_id path parameter and directly queries the database without validating that the requesting user owns that company_id. The database query correctly filters by company_id, but the calling code never validates that parameter against the authenticated user.
- **Implication:** Any user (or unauthenticated attacker) can access any company's job listings by manipulating the company_id parameter from 1 to N.
- **Representative:** AUTHZ-VULN-01

**Code Evidence:**
```python
# main.py:109-112 - User-supplied company_id passed directly to database query
async def show_jobs(request: Request, company_id: int, db: Session = Depends(get_db)):
    jobs = crud.get_jobs(db, company_id=company_id)  # NO validation here
    return templates.TemplateResponse(...)

# crud.py:29-30 - Query correctly filters by company_id
def get_jobs(db: Session, company_id: int):
    return db.query(Job).filter(Job.company_id == company_id).all()
```

**Missing Guard:**
```python
# Should verify: current_company.id == company_id
if current_company.id != company_id and not current_company.is_admin:
    raise HTTPException(status_code=403, detail="Access denied")
```

### Pattern 3: Unused Admin Flag - Vertical Privilege Escalation

- **Description:** The application defines an `is_admin` integer flag in the database (models.py:10), creates admin-only content conditionally based on this flag (main.py:83-87), but NEVER enforces the flag in any authorization checks. The flag has 6 occurrences in the codebase - all for storage/creation, zero for authorization.
- **Implication:** Admin-only resources (specifically the "secret" job containing the FLAG) are accessible to all users via the IDOR vulnerability. The is_admin flag exists as dead code.
- **Representative:** AUTHZ-VULN-01 (enables access to admin content)

**Code Evidence:**
```python
# main.py:83-87 - Admin-only content created conditionally
if company.is_admin:
    with open("flag.txt") as f:
        flag = f.read()
    job_create = schemas.JobCreate(title="secret", description=flag)
    crud.create_job(db, job_create, company_id=company.id)

# main.py:109-112 - But NO is_admin check on the access endpoint
@app.get("/company/{company_id}/jobs", response_class=HTMLResponse)
async def show_jobs(...):
    jobs = crud.get_jobs(db, company_id=company_id)  # Returns ALL jobs including admin secrets
```

**Grep Verification:**
- `is_admin` occurrences: 6 total
  - models.py:10 (schema definition)
  - schemas.py:15, 20 (Pydantic schemas)
  - crud.py:16 (database insert)
  - main.py:59-61, 68, 83 (seed data creation and conditional content)
- Authorization checks: **ZERO**

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture

- **Token Generation:** JWT tokens with HS256 algorithm, 30-minute expiration
- **Token Storage:** HTTP-only cookies (good) but missing Secure and SameSite flags (bad)
- **Token Validation:** **COMPLETELY ABSENT** - tokens are never decoded, verified, or checked
- **Secret Key:** Hardcoded as `"a very secret key"` (main.py:14) - enables token forgery
- **Critical Finding:** While authentication infrastructure exists (OAuth2PasswordBearer, JWT generation, cookie storage), the application never validates tokens. The oauth2_scheme variable is declared but has zero usages.

**Exploitation Insight:** Authentication can be completely bypassed. No need to steal or forge JWT tokens - endpoints don't check them anyway.

### Role/Permission Model

- **Roles Identified:** Two roles based on `is_admin` flag
  - Regular user: `is_admin=0` (demo, company3)
  - Admin user: `is_admin=1` (company2)
- **Role Storage:** Database column `companies.is_admin` (Integer: 0 or 1)
- **Role in JWT:** **NOT INCLUDED** - JWT payload only contains `{"sub": company.name, "exp": timestamp}`
- **Critical Finding:** The is_admin flag exists in the database but is NEVER checked for authorization. Search confirms 0 occurrences of authorization logic checking this flag.

**Exploitation Insight:** No vertical privilege escalation protections exist. Admin content is accessible via horizontal IDOR bypass rather than requiring admin role checks.

### Resource Access Patterns

- **Endpoint Pattern:** `/company/{company_id}/jobs` where company_id is a path parameter
- **Parameter Type:** Integer (FastAPI type-validated to reject non-integers)
- **Enumeration:** Sequential company IDs (1, 2, 3) enable trivial enumeration
- **Critical Finding:** The company_id parameter is user-controllable and directly passed to database queries without ownership validation

**Exploitation Insight:** 
```bash
# Access company 1's jobs (demo)
GET /company/1/jobs

# Access company 2's jobs (admin with FLAG)
GET /company/2/jobs

# Access company 3's jobs
GET /company/3/jobs
```

### Database Query Architecture

- **ORM:** SQLAlchemy 2.0.30 with async support
- **Query Safety:** All queries use parameterized statements (SQL injection safe)
- **Tenant Filtering:** Database queries correctly filter by company_id
- **Critical Finding:** The vulnerability is NOT in the database layer (queries are secure) but in the APPLICATION layer (no validation before queries)

**Code Flow:**
```
User Input: company_id=2
    ↓
NO AUTHENTICATION CHECK ❌
    ↓
NO AUTHORIZATION CHECK ❌
    ↓
crud.get_jobs(db, company_id=2)
    ↓
SELECT * FROM jobs WHERE company_id = 2
    ↓
Returns ALL jobs for company 2 (including admin flag)
```

**Exploitation Insight:** Defense-in-depth is absent. If the application layer validation fails (which it does), there are no database-level protections (row-level security, triggers, views) to prevent unauthorized access.

### Admin Content Storage

- **Admin Company:** company2 (is_admin=1)
- **Admin Content:** Job with title="secret" containing FLAG from flag.txt
- **Flag Creation:** Startup event (main.py:84-87) reads flag.txt and creates admin-only job
- **Flag Location:** Database table `jobs`, column `description`, for company_id=2
- **Critical Finding:** Flag is accessible via `/company/2/jobs` without any authentication or admin role check

**Exploitation Insight:** The CTF flag is the ultimate target. It's stored in company 2's jobs and directly accessible via the IDOR vulnerability. No privilege escalation or complex attack chain needed.

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have appropriate security for their intended purpose. They are **low-priority** for further testing.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| `GET /` | main.py:105-107 | Public endpoint (login page) - no auth required by design | SAFE |
| `POST /token` | main.py:92-103 | Login endpoint - validates credentials with bcrypt before issuing JWT | SAFE |
| `GET /ping` | main.py:114-116 | Public health check - no sensitive data exposed, intended for monitoring | SAFE |

**Rationale:**
- **GET /** - Login page is intentionally public to allow users to authenticate
- **POST /token** - Authentication endpoint properly validates credentials using bcrypt (industry-standard password hashing). While it has other issues (no rate limiting, hardcoded JWT secret), these are not authorization vulnerabilities.
- **GET /ping** - Health check endpoint returns `{"message": "pong"}` with no sensitive data

**Note:** These endpoints are secure for their intended purpose. The critical vulnerability is that the PROTECTED endpoint `/company/{company_id}/jobs` lacks any authorization, not these public/authentication endpoints.

## 5. Analysis Constraints and Blind Spots

### Unanalyzed Components

**No External Microservices:** The application is a monolithic FastAPI service with no external service calls. All authorization logic (or lack thereof) is contained within the single `/app` directory.

**No Dynamic Authorization System:** The application has a static, binary authorization model (is_admin flag) with no dynamic permissions, ACLs, or policy engines. All authorization logic is visible in the source code.

**No Client-Side Authorization:** The application uses server-side rendering (Jinja2) with no JavaScript. All authorization must occur server-side.

### Analysis Limitations

**Static Analysis Only:** This analysis is based on source code review. Dynamic behaviors (race conditions, timing attacks) were not tested.

**SQLite Limitations:** The application uses SQLite which lacks advanced security features like row-level security (RLS) available in PostgreSQL. This analysis assumes SQLite's limited security model.

**Startup-Only Code:** The flag loading and job seeding occurs in a startup event handler (main.py:55-88). This code is not network-accessible, so vulnerabilities in flag.txt reading or seed data creation are out of scope.

### Assumptions Made

1. **Pre-seeded Accounts:** Analysis assumes the three hardcoded demo accounts (demo, company2, company3) are the only companies in the system. If additional companies exist, they would also be vulnerable to the same IDOR.

2. **No Middleware:** Analysis confirmed no FastAPI middleware exists for authentication or authorization. If middleware were added post-analysis, findings would need re-validation.

3. **No Frontend Validation:** Analysis treats UI-only checks (hidden buttons, disabled forms) as non-security-controls per the methodology. Server-side enforcement is required.

4. **External Exploitability:** All findings are marked as externally exploitable because the application runs on http://localhost:8000 with no additional network controls (VPN, firewall, IP allowlisting) detected in the code or Docker configuration.

### Recommendations for Future Analysis

1. **Dynamic Testing:** Perform live exploitation to confirm static analysis findings
2. **Authenticated Scanning:** Use credentials to explore any hidden functionality
3. **Enumeration:** Test for additional company IDs beyond 1-3
4. **Rate Limiting:** Test for lack of rate limiting on /token endpoint (credential brute-force)
5. **Token Forgery:** Attempt to forge JWT tokens using the hardcoded weak secret key