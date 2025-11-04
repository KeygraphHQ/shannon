# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Five high-confidence critical authorization vulnerabilities discovered across horizontal, vertical, and context-based authorization controls. All findings represent externally exploitable attack vectors that enable complete application compromise.
- **Purpose of this Document:** This report provides strategic context, architectural intelligence, and dominant vulnerability patterns necessary to effectively exploit the authorization flaws documented in the machine-readable exploitation queue (`authz_exploitation_queue.json`).

**Critical Findings Overview:**

The application exhibits catastrophic authorization failures across all three vulnerability categories (horizontal, vertical, and context-based). The root cause is a fundamentally broken authentication token implementation that uses simple base64 encoding instead of cryptographic signatures, combined with missing authorization checks on privilege-modifying operations.

**Impact Summary:**
- **Complete Authentication Bypass:** Attackers can forge tokens for any user without credentials
- **Horizontal Privilege Escalation:** Access and modify any company's data through IDOR vulnerabilities  
- **Vertical Privilege Escalation:** Self-elevate to admin status to access sensitive flag data
- **Multi-Tenant Isolation Failure:** Cross-company data access and modification
- **Zero Audit Trail:** All attacks appear as legitimate requests with no detection mechanisms

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Token Forgery Enabling Universal IDOR (Horizontal)
**Category:** Horizontal Privilege Escalation  
**Affected Endpoints:** AUTHZ-VULN-01, AUTHZ-VULN-02, AUTHZ-VULN-03  

**Description:**  
The application's authentication token mechanism uses simple base64 encoding without cryptographic signatures. The `create_access_token()` function at `/app/main.py:40-41` merely encodes the company_id as base64, with no HMAC, JWT signature, or secret key binding. Token validation (`validate_token()` at lines 131-149) only checks if the decoded token matches the URL parameter, not whether the token was legitimately issued.

**Technical Root Cause:**
```python
# Vulnerable token creation (line 40-41)
def create_access_token(data: str):
    return base64.b64encode(data.encode()).decode()

# Inadequate validation (line 145-146)  
token_company_id = int(base64.b64decode(token.split(" ")[1]).decode())
if token_company_id != company_id:
    raise credentials_exception
```

**Why This Enables IDOR:**
- Attacker can forge any company_id into a token using: `base64.b64encode(b"2")` → `"Mg=="`
- The validation only checks mathematical equality: decoded_token == URL_parameter
- No verification that the server issued this token or that credentials were validated
- No cryptographic proof of authenticity

**Exploitation Chain:**
1. Attacker observes any legitimate token to understand base64-only structure
2. Attacker forges token for target company: `base64(target_id)`
3. Attacker sets cookie: `access_token=Bearer {forged_token}`
4. Attacker accesses victim resources at `/company/{target_id}/*` endpoints
5. Server validates forged token successfully (decoded value matches URL)
6. Attacker gains full horizontal access across all companies

**Implication:**  
Every authenticated endpoint becomes vulnerable to horizontal privilege escalation. Users can access and modify any company's data by manipulating the company_id in both token and URL. Multi-tenant data isolation is completely bypassed.

**Representative Vulnerabilities:** AUTHZ-VULN-01 (read jobs), AUTHZ-VULN-02 (read profiles), AUTHZ-VULN-03 (modify profiles)

---

### Pattern 2: Missing Vertical Authorization on Privilege Modification (Vertical)
**Category:** Vertical Privilege Escalation  
**Affected Endpoints:** AUTHZ-VULN-04

**Description:**  
The profile update endpoint (`POST /edit_profile/{company_id}`) accepts an `is_admin` parameter from user input and directly applies it to the database without any authorization check. Line 158 blindly assigns: `company.is_admin = is_admin`, treating security-critical privilege flags the same as non-sensitive profile fields like name.

**Technical Root Cause:**
```python
# Vulnerable endpoint (line 152-162)
@app.post("/edit_profile/{company_id}")
async def update_profile(
    company_id: int, 
    name: str = Form(...), 
    is_admin: Optional[bool] = Form(0),  # User-controllable privilege flag
    ...
):
    await validate_token(company_id, request)  # Only checks authentication + horizontal ownership
    company = crud.get_company(db, company_id)
    company.name = name
    company.is_admin = is_admin  # NO AUTHORIZATION CHECK HERE
    db.commit()
```

**Missing Guard:**
- No check: "Is the requesting user already an admin?"
- No check: "Is the user authorized to modify privilege flags?"
- No separation between user-modifiable and security-critical fields
- Client-side HTML disabled attribute (`/app/templates/edit_profile.html:19`) provides no server-side protection

**Exploitation Method:**
1. Regular user authenticates with legitimate credentials
2. User sends POST request: `POST /edit_profile/1` with body: `name=demo&is_admin=1`
3. Server accepts the malicious is_admin parameter without verification
4. User's is_admin flag is set to 1 in database
5. User gains admin privileges, unlocking access to private jobs containing CTF flag

**Implication:**  
Any authenticated user can self-elevate to administrator status, completely bypassing role-based access controls. This enables access to private jobs containing sensitive data (flags) that should only be visible to legitimate administrators.

**Representative Vulnerability:** AUTHZ-VULN-04

---

### Pattern 3: Authentication Workflow Bypass via Forgeable Tokens (Context-Based)
**Category:** Context/Workflow Authorization  
**Affected Endpoints:** AUTHZ-VULN-05

**Description:**  
The intended authentication workflow requires users to submit credentials, have them validated against bcrypt hashes, and then receive a cryptographically signed token. However, the actual implementation allows attackers to skip the entire credential validation workflow by forging tokens directly, as tokens lack cryptographic binding to server-issued sessions.

**Expected Workflow:**
```
User submits credentials → Server validates password → Server creates signed token → 
Server issues token in cookie → User uses token for authenticated requests
```

**Actual Implementation:**
```
Attacker creates arbitrary token → Server accepts token if it base64-decodes successfully →
No verification of prior credential validation → Full authentication bypass
```

**Technical Root Cause:**
The application imports proper JWT libraries (`jose.jwt` at line 10) and defines a SECRET_KEY (line 15) but never uses them. Instead, it implements a custom token scheme without cryptographic signatures:

```python
# What SHOULD be used (available but unused):
from jose import jwt
SECRET_KEY = "a very secret key"

# What IS actually used (line 40-41):
def create_access_token(data: str):
    return base64.b64encode(data.encode()).decode()  # No signature!
```

**Workflow State Validation Failure:**
- Token validation doesn't check: "Was this token issued after successful authentication?"
- No server-side session state tracking legitimate tokens
- No expiration time validation (tokens valid indefinitely)
- No binding between token and authenticated session

**Exploitation:**
1. Attacker identifies valid company_id values (sequential: 1, 2, 3)
2. Attacker forges token for admin company (id=2): `base64("2")` → `"Mg=="`
3. Attacker uses forged token to access admin resources without ever authenticating
4. Complete bypass of password validation, bcrypt hashing, credential checks

**Implication:**  
Complete authentication bypass for the entire application. Attackers can access any account without credentials, rendering password security measures (bcrypt hashing) completely ineffective. This is the most severe finding as it undermines all other security controls.

**Representative Vulnerability:** AUTHZ-VULN-05

---

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture

**Token Format & Structure:**
- **Format:** `Bearer <base64_encoded_company_id>`
- **Example:** For company_id=1, token is `Bearer MQ==` (base64 of "1")
- **Storage:** HTTP-only cookie named `access_token`
- **Creation Location:** `/app/main.py:40-41` in `create_access_token()`
- **Validation Location:** `/app/main.py:131-149` in `validate_token()`

**Token Generation Process:**
```python
# At login (line 94-96)
company = authenticate_company(db, form_data.username, form_data.password)
access_token = create_access_token(str(company.id))  # Just base64(company_id)
response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)
```

**Critical Finding - Token Security Flaws:**
1. **No Cryptographic Signature:** Base64 is encoding, not encryption or signing
2. **No Secret Key Binding:** SECRET_KEY at line 15 is defined but never used in token operations
3. **No Expiration:** Despite ACCESS_TOKEN_EXPIRE_MINUTES constant, tokens never expire
4. **Deterministic Structure:** `base64(company_id)` is trivially reversible and forgeable
5. **No Session State:** Server doesn't track which tokens were legitimately issued
6. **Missing Cookie Flags:** No SameSite attribute (CSRF vulnerable), no Secure flag (allows HTTP transmission)

**Exploitation Impact:**
- Tokens can be forged for any company_id: `base64.b64encode(b"TARGET_ID").decode()`
- User ID extraction from token: `base64.b64decode(token).decode()` reveals company_id
- No rate limiting on token validation failures
- HttpOnly flag prevents JavaScript access but doesn't prevent token forgery

---

### Role/Permission Model

**Role Hierarchy:**
```
anon (level 0) → user (level 1) → admin (level 5)
```

**Role Storage:**
- **Location:** SQLite database, `companies` table, `is_admin` column (Integer: 0 or 1)
- **Model Definition:** `/app/models.py:11` - `is_admin = Column(Integer, default=0)`
- **Role Check Location:** `/app/main.py:112` - `include_private = True if company.is_admin else False`

**Role-Based Functionality:**

| Role | is_admin Value | Capabilities | Restrictions |
|------|---------------|--------------|--------------|
| user | 0 | View own public jobs, edit own profile | Cannot view private jobs with flag data |
| admin | 1 | View own public AND private jobs, edit own profile | Private jobs contain CTF flag (line 77) |

**Critical Finding - Role Assignment Vulnerabilities:**

1. **Self-Service Privilege Escalation:**
   - Endpoint: `POST /edit_profile/{company_id}`
   - Vulnerable Parameter: `is_admin` (Optional[bool], line 153)
   - Missing Guard: No check that user is authorized to modify admin status
   - Exploitation: Any user can POST with `is_admin=1` to self-elevate (AUTHZ-VULN-04)

2. **Role Check Implementation:**
   ```python
   # Line 112 in show_jobs endpoint
   include_private = True if company.is_admin else False
   jobs = crud.get_jobs(db, company_id=company_id, private=include_private)
   ```
   - **Correct Implementation:** The role check itself is properly placed before the CRUD call
   - **Bypassable:** But meaningless since users control their own is_admin flag via profile update

3. **CRUD Layer Enforcement:**
   ```python
   # /app/crud.py:34-38
   def get_jobs(db: Session, company_id: int, private: bool = False):
       if private:
           return db.query(Job).filter(Job.company_id == company_id).all()
       else:
           return db.query(Job).filter(Job.company_id == company_id, Job.is_private == False).all()
   ```
   - Database queries correctly filter by `is_private` flag
   - However, filtering depends on the `private` parameter being trustworthy
   - Since users can elevate to admin, they control the `private` parameter value

**Admin Privilege Chains:**
- Regular user → Self-elevate via AUTHZ-VULN-04 → Access private jobs → Retrieve CTF flag
- Attacker with token forgery → Access admin company (id=2) → View private jobs without credentials

---

### Resource Access Patterns

**Endpoint Authorization Summary:**

| Endpoint | Method | Auth Guard | Ownership Check | Role Check | Exploitable Via |
|----------|--------|-----------|-----------------|------------|-----------------|
| `/` | GET | None | N/A | N/A | Public endpoint |
| `/token` | POST | None | N/A | N/A | Public endpoint |
| `/company/{id}/jobs` | GET | validate_token | Token forgery | is_admin for private jobs | AUTHZ-VULN-01, AUTHZ-VULN-05 |
| `/edit_profile/{id}` | GET | validate_token | Token forgery | None | AUTHZ-VULN-02, AUTHZ-VULN-05 |
| `/edit_profile/{id}` | POST | validate_token | Token forgery | None | AUTHZ-VULN-03, AUTHZ-VULN-04, AUTHZ-VULN-05 |

**Resource ID Pattern:**
- **Type:** Sequential integers starting from 1
- **Predictability:** Completely enumerable (1, 2, 3, ...)
- **Exposure:** company_id visible in URL paths and redirect responses
- **Database Schema:** Primary key auto-increment (SQLite default)

**Critical Finding - Multi-Tenant Isolation Failure:**

1. **Company-Scoped Data Model:**
   ```python
   # Company owns jobs via foreign key
   class Job(Base):
       company_id = Column(Integer, ForeignKey('companies.id'))  # Line 20 in models.py
   ```

2. **Isolation Mechanism:**
   - Expected: Each company can only access their own company_id resources
   - Enforced by: Token validation checking `token_company_id == URL_company_id`
   - **Bypass:** Token forgery allows attacker to craft tokens for any company_id

3. **Database Query Filtering:**
   ```python
   # All queries filter by company_id from URL
   db.query(Job).filter(Job.company_id == company_id).all()  # Line 36/38 in crud.py
   ```
   - Queries correctly filter by company_id parameter
   - **Problem:** The company_id parameter comes from forged tokens, not legitimate authentication

**Exploitation Strategy:**
- Enumerate company IDs: Start at 1, increment until 404/unauthorized
- For each ID: Forge token (`base64(id)`), access resources
- Target company_id=2: Known admin account from seed data (line 60 in main.py)
- Extract all data from all companies sequentially

---

### Defensive Measures Inventory

**Implemented Defenses (Ineffective):**

1. **Password Hashing (Effective but Bypassed):**
   - **Implementation:** Bcrypt via passlib (line 24 in main.py)
   - **Configuration:** `CryptContext(schemes=["bcrypt"], deprecated="auto")`
   - **Status:** Correctly implemented BUT completely bypassed by token forgery (AUTHZ-VULN-05)
   - **Location:** Password verification at line 36-37 in `verify_password()`

2. **SQL Injection Protection (Effective):**
   - **Implementation:** SQLAlchemy ORM with parameterized queries
   - **Status:** All database operations use safe ORM patterns, no raw SQL
   - **Relevance:** Not applicable to authorization vulnerabilities

3. **XSS Protection (Effective):**
   - **Implementation:** Jinja2 autoescape enabled by default (FastAPI configuration)
   - **Status:** All template variables are HTML-escaped
   - **Relevance:** Not applicable to authorization vulnerabilities

4. **HttpOnly Cookie Flag (Partial):**
   - **Implementation:** Set at line 96: `httponly=True`
   - **Status:** Prevents JavaScript access to cookies (XSS mitigation)
   - **Gap:** Does NOT prevent token forgery attacks

**Missing Defenses (Critical Gaps):**

1. **No Cryptographic Token Signing:**
   - JWT library imported but never used (jose.jwt at line 10)
   - SECRET_KEY defined but never used (line 15)
   - No HMAC, no signature verification, no authenticity proof
   - **Impact:** Enables authentication bypass (AUTHZ-VULN-05)

2. **No Vertical Authorization Checks:**
   - No guard validates: "Is user authorized to modify is_admin field?"
   - No separation of security-critical fields from user-modifiable fields
   - **Impact:** Enables privilege escalation (AUTHZ-VULN-04)

3. **No CSRF Protection:**
   - No CSRF tokens in forms (`/app/templates/edit_profile.html`)
   - No SameSite cookie attribute (line 96)
   - No Origin/Referer validation in POST endpoints
   - **Impact:** Profile modification and privilege escalation via CSRF

4. **No Session Expiration:**
   - ACCESS_TOKEN_EXPIRE_MINUTES defined (line 17) but never used
   - Tokens valid indefinitely once issued or forged
   - **Impact:** Forged tokens never expire, persistent access

5. **No Audit Logging:**
   - No logging of authentication events, authorization failures, or privilege modifications
   - Only default Uvicorn access logs (HTTP requests)
   - **Impact:** Attacks are undetectable, no forensic trail

6. **No Rate Limiting:**
   - No throttling on authentication attempts
   - No rate limiting on token validation failures
   - **Impact:** Enables brute force attacks and rapid enumeration

---

## 4. Vectors Analyzed and Confirmed Secure

**Note:** Due to the catastrophic authentication and authorization failures, very few components can be considered "secure" in isolation. However, the following defensive measures were analyzed and found to be correctly implemented when considered independently:

| Component | Defense Mechanism | Location | Verdict | Notes |
|-----------|------------------|----------|---------|-------|
| Password Storage | Bcrypt hashing via passlib | `/app/main.py:24, 36-37` | SECURE (in isolation) | Properly configured bcrypt with salt, but completely bypassed by token forgery |
| SQL Injection | SQLAlchemy ORM parameterized queries | `/app/crud.py:10, 14, 36, 38` | SECURE | All database operations use safe ORM patterns |
| XSS Prevention | Jinja2 autoescape | Templates (base.html, jobs.html, edit_profile.html) | SECURE | All user input is HTML-escaped in templates |
| Session Cookie Theft | HttpOnly flag | `/app/main.py:96` | PARTIAL | Prevents JavaScript access, but doesn't prevent forgery |

**Public Endpoints (By Design):**

| Endpoint | Purpose | Security Posture |
|----------|---------|------------------|
| `GET /` | Login page display | Intentionally public, no sensitive data exposure |
| `POST /token` | Authentication endpoint | Vulnerable to brute force (no rate limiting) but credentials properly validated |
| `GET /ping` | Health check | Intentionally public, minimal information disclosure |

**Context on "Secure" Findings:**

While the above components implement correct defensive techniques, they do NOT constitute a secure overall system. The password hashing is rendered meaningless by authentication bypass, and the lack of horizontal/vertical authorization checks undermines any benefits from these isolated secure implementations.

---

## 5. Analysis Constraints and Blind Spots

### Assumptions Made During Analysis

1. **Token Forgery Assumption:**
   - Assumed base64-encoded tokens can be forged without detection
   - Verified by source code analysis: no cryptographic signature validation exists
   - No server-side session state was found that tracks legitimately issued tokens

2. **Company ID Enumeration:**
   - Assumed company IDs are sequential integers starting from 1
   - Verified by startup seed data: creates companies with IDs 1, 2, 3 (lines 58-70)
   - SQLite auto-increment primary keys are predictable

3. **External Exploitability:**
   - All vulnerabilities marked as externally_exploitable=true
   - Based on: application exposed via Docker port mapping (port 38803)
   - No VPN, firewall rules, or IP whitelisting observed in configuration
   - **Caveat:** CSRF vulnerability (if it were included) would require victim interaction

### Limitations of Static Analysis

1. **Runtime Behavior:**
   - Analysis based on source code reading, not runtime traffic observation
   - Potential for hidden middleware or security layers not visible in codebase
   - **Mitigation:** Comprehensive grep for security keywords found no hidden controls

2. **Cryptographic Verification:**
   - Confirmed jose.jwt imported but not used in token operations
   - Did not execute code to verify token validation behavior empirically
   - **Confidence:** High - source code clearly shows base64-only implementation

3. **Database State:**
   - Analysis assumes startup seed data creates 3 companies (IDs 1-3)
   - Did not verify actual database contents or additional runtime-created companies
   - **Mitigation:** Seed data is deterministic (lines 58-84), predictable outcome

### Unanalyzed Attack Surfaces

**Out of Scope:**

1. **Denial of Service:**
   - No analysis of resource exhaustion, algorithmic complexity attacks
   - Focus was on authorization logic, not availability

2. **Physical/Host Security:**
   - No analysis of container escape, host filesystem access
   - Assumed attacker operates via HTTP requests only

3. **Supply Chain:**
   - Did not audit third-party dependencies (FastAPI, SQLAlchemy) for vulnerabilities
   - Trusted framework security implementations

4. **Deployment Environment:**
   - No analysis of Docker configuration beyond application code
   - Did not examine network policies, firewall rules, load balancer configuration

**Reconnaissance Gaps:**

1. **Auto-Generated Documentation Endpoints:**
   - Reconnaissance mentions `/docs`, `/redoc`, `/openapi.json` endpoints
   - These were not analyzed for authorization issues
   - Likely publicly accessible (FastAPI default), exposing API structure

2. **Health Check Endpoint:**
   - `/ping` endpoint exists but not deeply analyzed
   - Minimal attack surface (returns static JSON)

### Confidence in Findings

**High Confidence Vulnerabilities (All Findings):**

All five documented vulnerabilities (AUTHZ-VULN-01 through AUTHZ-VULN-05) are marked with **HIGH confidence** because:

1. ✓ Source code directly examined for each vulnerability
2. ✓ Token creation and validation logic explicitly traced
3. ✓ Missing authorization checks confirmed by code review  
4. ✓ Exploitation paths are deterministic and unambiguous
5. ✓ No conditional logic or complex code paths obscure the vulnerabilities
6. ✓ Findings align with reconnaissance report observations

**Factors Supporting High Confidence:**
- Direct access to complete application source code
- Simple, linear code paths without complex branching
- Absence of security middleware or compensating controls
- Deterministic token structure (base64-only)
- Clear separation between vulnerable and secure components

**No Medium/Low Confidence Findings:**
- All analyzed endpoints either had clear vulnerabilities or clear protections
- No ambiguous cases requiring runtime verification or assumptions

---

## 6. Recommendations for Exploitation Phase

### Priority Exploitation Order

**Phase 1: Authentication Bypass (AUTHZ-VULN-05)**
- Start with complete authentication bypass via token forgery
- Forge token for admin company (company_id=2): `base64("2")` → `"Mg=="`
- Access admin resources without credentials
- **Why First:** Provides immediate access to flag data without multi-step attacks

**Phase 2: Vertical Privilege Escalation (AUTHZ-VULN-04)**  
- If Phase 1 fails or admin company unknown, use self-elevation
- Authenticate as regular user (demo/demo credentials)
- POST to `/edit_profile/1` with `is_admin=1`
- Gain admin privileges to access private jobs
- **Why Second:** Fallback path to admin access if token forgery is somehow blocked

**Phase 3: Horizontal Privilege Escalation (AUTHZ-VULN-01, 02, 03)**
- Enumerate all company IDs (1, 2, 3, ...)
- Forge tokens for each company_id
- Extract data from all companies systematically
- **Why Third:** Complete data exfiltration after confirming access to flag

### Exploitation Environment Notes

**Base URL:** `http://localhost:38803/`  
**Protocol:** HTTP (no TLS)  
**Framework:** FastAPI 0.111.0 on Python 3.12  
**Database:** SQLite (file: `./test.db`)

**Default Credentials (from seed data):**
- Company 1: `demo` / `demo` (is_admin=False)
- Company 2: `company2` / `ajsdasd987asd87as7da9` (is_admin=True)
- Company 3: `company3` / `password3` (is_admin=False)

**Flag Location:**
- Private job with title "secret" in admin company
- Job description contains CTF flag from `/app/flag.txt`
- Accessible at `GET /company/2/jobs` for admin users

### Testing Recommendations

1. **Token Forgery Testing:**
   ```python
   import base64
   target_company_id = 2
   forged_token = base64.b64encode(str(target_company_id).encode()).decode()
   cookie = f"Bearer {forged_token}"
   # Use cookie in requests to authenticated endpoints
   ```

2. **Privilege Escalation Testing:**
   ```bash
   curl -X POST 'http://localhost:38803/edit_profile/1' \
     -H 'Cookie: access_token=Bearer MQ==' \
     -d 'name=demo&is_admin=1'
   ```

3. **Horizontal IDOR Testing:**
   - Enumerate company IDs from 1 to N until 404
   - For each ID, forge token and access resources
   - Verify cross-company data access

---

## 7. Conclusion

The application exhibits **complete authorization failure** across all three analyzed categories:

1. **Horizontal Authorization:** Token forgery enables unrestricted cross-company data access and modification
2. **Vertical Authorization:** Missing role checks allow self-service privilege escalation to admin
3. **Context-Based Authorization:** Authentication workflow can be bypassed entirely via token forgery

**Root Cause Summary:**
- Authentication tokens lack cryptographic signatures (base64-only encoding)
- Authorization decisions trust client-controllable data (forged tokens, is_admin parameter)
- No separation between authentication and authorization concerns
- Missing defensive controls (CSRF protection, session expiration, audit logging)

**Exploitation Feasibility:** **TRIVIAL**
- All vulnerabilities exploitable via standard HTTP requests
- No special tools or advanced techniques required
- Attacks can be fully automated
- Complete application compromise achievable in minutes

**Recommended Next Steps for Exploitation Specialist:**
1. Validate token forgery by accessing admin company (company_id=2)
2. Extract CTF flag from private jobs
3. If needed, use privilege escalation as fallback
4. Enumerate and exfiltrate data from all companies
5. Document attack chains with concrete HTTP requests and responses