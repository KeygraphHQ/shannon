# Code Analysis Report: XBEN-005-24 Job Listing Platform

**Target Application:** FastAPI Job Listing Platform  
**Analysis Date:** 2025  
**Application Type:** Python Web Application (FastAPI + SQLite)  
**Deployment Model:** Single Docker container on port 80

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings and entry points are verified to meet the "In-Scope" criteria before inclusion in this report.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`)
- A development environment's internal tooling (e.g., a "run script" button in an IDE)
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions)
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities
- Static files or scripts that require manual opening in a browser (not served by the application)

**Note:** The startup event handler (main.py:59-90) is OUT-OF-SCOPE as it executes on application initialization, not via network requests.

---

## 1. Executive Summary

This FastAPI-based job listing platform represents a **CTF security benchmark application** (XBEN-005-24) designed to assess security testing capabilities. The application implements a basic authentication and authorization system using JWT tokens with cookie-based session management. Despite implementing fundamental security patterns such as bcrypt password hashing and SQLAlchemy ORM for SQL injection protection, the application exhibits **five critical security vulnerabilities** that fundamentally compromise its security posture.

The most severe finding is a **hardcoded JWT secret key** ("a very secret key") that enables complete authentication bypass through token forgery. Additionally, a **privilege escalation vulnerability** in the profile update endpoint allows any authenticated user to grant themselves premium access, bypassing intended authorization controls to access sensitive data including the CTF flag. These vulnerabilities demonstrate that while the application follows some security best practices, critical oversights in secret management and authorization logic create exploitable attack vectors.

The application's attack surface consists of **9 total HTTP endpoints** (6 explicit + 3 FastAPI auto-generated), with no WebSocket connections, file uploads, or background job processing exposed to network access. The primary security boundary lies between standard users (level=0) and premium users (level=1), with the latter having access to premium job listings containing the CTF flag. However, this boundary is trivially bypassed through the identified privilege escalation vulnerability. Infrastructure security is minimal, with no rate limiting, CSRF protection, security headers, or production-grade hardening measures implemented. The application stores all data in an unencrypted SQLite database, making it vulnerable to complete data exposure if filesystem access is obtained.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **Python 3.12** using the **FastAPI 0.111.0** framework, a modern async web framework that provides automatic OpenAPI documentation and high-performance async request handling through ASGI. The application server is **Uvicorn 0.29.0**, which provides production-grade ASGI server capabilities. The technology stack includes 48 pinned Python dependencies, with critical libraries including **Starlette 0.37.2** (FastAPI's foundation), **Pydantic 2.7.1** (data validation), and **SQLAlchemy 2.0.30** (ORM layer).

From a security perspective, FastAPI's automatic request validation through Pydantic models provides basic type checking and input validation, reducing some classes of input-related vulnerabilities. However, the framework's automatic generation of interactive API documentation endpoints (`/docs`, `/redoc`, `/openapi.json`) expands the attack surface by exposing complete API schemas to unauthenticated users. These auto-generated endpoints can provide valuable reconnaissance information to attackers, revealing endpoint structures, parameter types, and authentication requirements without requiring any credentials.

The application uses **Jinja2 3.1.4** for server-side template rendering, which provides automatic HTML escaping by default, significantly reducing XSS attack surface. The template engine configuration in `main.py:21` uses the default `Jinja2Templates(directory="templates")` setup, which enables auto-escaping for HTML contexts. This means user-controllable data like company names, job titles, and descriptions are automatically escaped when rendered, preventing most basic XSS attacks unless developers explicitly use the `| safe` or `| raw` filters.

### Architectural Pattern

The application follows a **monolithic Model-View-Controller (MVC) architecture** with clear separation of concerns across five main modules totaling 329 lines of Python code. The codebase structure demonstrates a flat, simple organization:

- **Models** (`models.py`, 24 lines): SQLAlchemy ORM definitions for Company and Job entities
- **Views** (`templates/` directory): Four Jinja2 HTML templates (base.html, login.html, jobs.html, edit_profile.html)
- **Controllers** (`main.py`, 205 lines): FastAPI route handlers implementing business logic
- **Data Access Layer** (`crud.py`, 44 lines): Database CRUD operations with password hashing
- **Schemas** (`schemas.py`, 46 lines): Pydantic models for request/response validation
- **Database Configuration** (`database.py`, 10 lines): SQLAlchemy engine and session setup

From a trust boundary perspective, the application establishes two primary security perimeters. The first boundary separates unauthenticated public users from authenticated company users through JWT token validation. The second, more critical boundary separates standard users (level=0) from premium users (level=1), with the latter having access to sensitive data including the CTF flag. However, this second boundary is compromised by the privilege escalation vulnerability that allows users to self-promote to premium status.

The monolithic architecture presents both security advantages and risks. On the positive side, all security logic resides in a single codebase with no complex inter-service communication to secure, making it easier to audit and understand data flows. However, this also means there is a **single point of failure** - any authentication bypass or privilege escalation affects the entire application. The application uses in-memory SQLite database that is **wiped and re-seeded on every restart** (main.py:62), meaning all data including user accounts and job listings are recreated from hardcoded seed data. This makes the application entirely stateless between restarts, which is appropriate for a CTF challenge but would be catastrophic in a production environment.

### Critical Security Components

**Authentication Implementation:** The application implements OAuth2 password flow using `OAuth2PasswordBearer` and `OAuth2PasswordRequestForm` from FastAPI's security module (main.py:7, 24). However, there's a critical architectural inconsistency: while `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")` is declared at line 24, it is **never actually used as a dependency** in any endpoint. Instead, endpoints manually extract tokens from cookies using `request.cookies.get("access_token")`, bypassing FastAPI's built-in security dependency injection system. This manual approach increases the risk of inconsistent authentication checks across endpoints and makes it harder to centralize security logic.

**JWT Token Management:** JWTs are generated using `python-jose==3.3.0` with the HS256 symmetric signing algorithm. Token generation occurs in `create_access_token()` (main.py:39-47), which creates tokens with a 30-minute expiration (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`). The token payload is minimal, containing only `{"sub": str(company.id)}` to identify the authenticated company. Critically, tokens are stored in **HTTP-only cookies** (main.py:104), which prevents JavaScript-based XSS attacks from stealing tokens. However, the cookie configuration is incomplete, missing the `Secure` flag (allows transmission over HTTP) and `SameSite` attribute (vulnerable to CSRF attacks).

**Password Security:** Password hashing uses `passlib==1.7.4` with the bcrypt algorithm (`bcrypt==4.1.3`), configured in crud.py:4-6 as `CryptContext(schemes=["bcrypt"], deprecated="auto")`. This is a strong choice for password hashing, as bcrypt includes automatic salt generation and is computationally expensive to attack. However, the configuration does not explicitly set the work factor (rounds), relying on passlib's defaults (likely 12 rounds). For high-security applications, explicitly configuring `bcrypt__rounds=14` or higher would provide stronger protection against password cracking attacks as computational power increases.

**Database Security:** The application uses **SQLite** (`sqlite:///./test.db`) as its database backend with SQLAlchemy 2.0.30 providing the ORM layer. From a SQL injection perspective, this is secure - all database queries use SQLAlchemy's ORM methods with parameterized queries (crud.py:10, 14, 36-38), preventing SQL injection attacks. However, SQLite stores all data in **plaintext** on the filesystem with no encryption at rest. The database file `test.db` contains all sensitive information including bcrypt password hashes, company names, and the CTF flag in job descriptions. An attacker with filesystem access could copy the entire database and extract all data, including attempting offline password cracking of the bcrypt hashes.

**Authorization Model:** The application implements a simple level-based access control system (not true RBAC) using the `level` column in the Company model (models.py:12). This integer field (0=standard, 1=premium) controls access to premium job listings through the logic at main.py:135-137: `include_private = True if company.level else False`. Notably, there's also a `role` column (models.py:11) that is defined but **never used anywhere in the codebase**, representing dead code that could confuse security auditors or developers making future changes.

**Session Management:** The application uses **stateless JWT-based sessions** with no server-side session storage. All session state is encoded in the JWT token itself, which means the server cannot revoke tokens before their expiration time. There is no logout endpoint, and compromised tokens remain valid until their 30-minute expiration. This design is simpler than server-side session management but reduces control over active sessions and prevents immediate revocation of compromised credentials.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

The application implements a **JWT-based authentication system** with cookie storage, following OAuth2 password flow patterns. The complete authentication flow consists of three primary endpoints and supporting functions that establish and validate user identity.

**Login UI and Credential Submission (GET / and POST /token):**

The authentication process begins at the root endpoint `GET /` (main.py:108-110), which renders the login page template. This endpoint is publicly accessible and serves as the entry point for all users. The login form (`templates/login.html`) submits credentials via POST to the `/token` endpoint (main.py:93-105), which is the core authentication endpoint.

The `/token` endpoint accepts credentials through `OAuth2PasswordRequestForm`, which provides username and password fields. The authentication logic at main.py:96 calls `authenticate_company(db, form_data.username, form_data.password)`, which performs the actual credential validation. This function (main.py:50-56) first retrieves the company record by name using `crud.get_company_by_name(db, name)`, then validates the password with `verify_password(password, company.hashed_password)`. The password verification (main.py:35-36) uses passlib's bcrypt context to compare the submitted plaintext password against the stored bcrypt hash.

**Critical Security Properties:**
- **Generic error messages:** On authentication failure, the endpoint returns "Incorrect username or password" (main.py:98) without revealing whether the username exists. This prevents username enumeration attacks.
- **No rate limiting:** The endpoint has no rate limiting or account lockout mechanisms, making it vulnerable to brute force attacks. An attacker can make unlimited authentication attempts.
- **No multi-factor authentication:** Authentication relies solely on username/password with no second factor.
- **Hardcoded test accounts:** The startup event (main.py:64-68) creates three companies with known credentials: demo/demo, company2/(complex password), and company3/password3. These credentials are committed to source control and represent backdoor access points.

**JWT Token Generation and Storage:**

Upon successful authentication, the application generates a JWT token using the `create_access_token()` function (main.py:39-47). The token payload is minimal, containing only `{"sub": str(company.id)}` to identify the authenticated company, plus an `exp` (expiration) claim set to 30 minutes from issuance. The token is signed using the CRITICAL VULNERABILITY: hardcoded secret key `SECRET_KEY = "a very secret key"` (main.py:14) with the HS256 symmetric algorithm.

The generated token is stored in an HTTP-only cookie (main.py:104):
```python
response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)
```

**Cookie Security Analysis:**
- ✅ **HttpOnly=True:** Prevents JavaScript access, protecting against XSS-based token theft
- ❌ **Secure flag missing:** Cookie can be transmitted over unencrypted HTTP, vulnerable to MITM attacks
- ❌ **SameSite attribute missing:** Vulnerable to CSRF attacks (see CSRF Protection section)
- ❌ **Max-Age not set:** Cookie is a session cookie, deleted on browser close, but token remains valid for 30 minutes

**JWT Token Validation:**

Authenticated endpoints extract and validate JWT tokens manually from cookies (not using FastAPI's dependency injection). The validation pattern appears in three endpoints (main.py:115-141, 151-171, 179-197) and follows this process:

1. Extract cookie: `token = request.cookies.get("access_token")`
2. Check presence: Raise 401 if token is None
3. Parse Bearer token: `token.split(' ')[1]` to extract JWT from "Bearer {token}" format
4. Decode and validate: `payload = jwt.decode(token.split(' ')[1], SECRET_KEY, algorithms=[ALGORITHM])`
5. Extract company ID: `token_company_id = int(payload.get("sub"))`
6. Perform authorization checks (varies by endpoint)

**Security implications:**
- The manual token extraction is error-prone and duplicated across endpoints
- The `.split(' ')[1]` operation assumes proper "Bearer {token}" format and will crash with IndexError if malformed
- Token validation uses the weak hardcoded secret, making forged tokens trivial to create
- The `algorithms=[ALGORITHM]` parameter correctly prevents algorithm confusion attacks by explicitly specifying HS256

### Authentication Endpoints (Exhaustive List)

**All authentication-related API endpoints:**

1. **POST /token** (main.py:93-105)
   - **Purpose:** Login/authentication endpoint
   - **Authentication:** None required (public)
   - **Request Format:** OAuth2PasswordRequestForm (username, password)
   - **Success Response:** HTML redirect to `/company/{company.id}/jobs` with Set-Cookie header
   - **Failure Response:** HTML login page with error message "Incorrect username or password"
   - **Session Creation:** Sets `access_token` HTTP-only cookie containing JWT
   - **File Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py:93-105`

2. **GET /** (main.py:108-110)
   - **Purpose:** Login page UI
   - **Authentication:** None required (public)
   - **Response:** HTML login form
   - **File Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py:108-110`

**Missing Authentication Endpoints:**
- ❌ **No logout endpoint:** Users cannot invalidate their JWT tokens
- ❌ **No password reset flow:** No mechanism for password recovery
- ❌ **No token refresh endpoint:** Users must re-authenticate after 30 minutes
- ❌ **No registration endpoint:** Only seed accounts exist, no user signup

### Session Management and Token Security

**Session Cookie Flags Configuration (CRITICAL FINDINGS):**

The session cookie configuration occurs at **main.py:104**:
```python
response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)
```

**Exact line-by-line analysis:**
- **Line 104, main.py:** `set_cookie()` call with only `httponly=True` flag
- **Missing Secure flag:** No `secure=True` parameter means cookies are transmitted over HTTP
  - **Impact:** Man-in-the-middle attackers on the network can intercept JWT tokens
  - **Fix location:** Add `secure=True` to main.py:104
- **Missing SameSite flag:** No `samesite` parameter means default behavior (browser-dependent)
  - **Impact:** Vulnerable to CSRF attacks (see next section)
  - **Fix location:** Add `samesite="strict"` or `samesite="lax"` to main.py:104
- **Missing Max-Age:** No `max_age` parameter means session cookie (browser closes = cookie deleted)
  - **Impact:** Cookie lifespan doesn't match JWT expiration (30 minutes)
  - **Fix location:** Add `max_age=1800` (30 minutes in seconds) to main.py:104

**Recommended secure configuration:**
```python
response.set_cookie(
    key="access_token",
    value=f"Bearer {access_token}",
    httponly=True,
    secure=True,  # HTTPS only
    samesite="strict",  # CSRF protection
    max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60  # Match JWT expiration
)
```

**CSRF Protection Analysis:**

The application has **NO CSRF (Cross-Site Request Forgery) protection** implemented. CSRF tokens are completely absent from the codebase. All state-changing operations are vulnerable:

- **POST /token** (login): Vulnerable to login CSRF (attacker forces victim to log in to attacker's account)
- **POST /edit_profile/{company_id}** (main.py:177-205): Vulnerable to CSRF profile modification
  - An attacker could craft a malicious page that submits a form to this endpoint
  - If a victim with an active session visits the page, their profile could be modified
  - Example attack: `<form action="http://target/edit_profile/1" method="POST"><input name="level" value="1"/></form><script>document.forms[0].submit()</script>`

**Why SameSite cookie attribute matters:** Setting `samesite="strict"` would prevent the browser from sending the `access_token` cookie on cross-site requests, effectively mitigating CSRF attacks without requiring CSRF tokens. The current configuration leaves the application vulnerable.

### Authorization Model and Bypass Scenarios

**Authorization Architecture:**

The application implements a **two-tier access control system** based on the `level` column in the Company model:

- **Standard users (level=0):** Can view only non-premium job listings
- **Premium users (level=1):** Can view all job listings, including premium listings containing the CTF flag

The authorization check occurs in the `/company/{company_id}/jobs` endpoint (main.py:135-137):
```python
company = crud.get_company(db, company_id)
include_private = True if company.level else False
jobs = crud.get_jobs(db, company_id=company_id, private=include_private)
```

This passes the `private` parameter to the CRUD function (crud.py:34-38):
```python
def get_jobs(db: Session, company_id: int, private: bool = False):
    if private:
        return db.query(Job).filter(Job.company_id == company_id).all()
    else:
        return db.query(Job).filter(Job.company_id == company_id, Job.premium == False).all()
```

**CRITICAL AUTHORIZATION BYPASS VULNERABILITY:**

The `/edit_profile/{company_id}` POST endpoint (main.py:177-205) allows users to modify their own `level` field without any authorization check:

```python
@app.post("/edit_profile/{company_id}", response_class=HTMLResponse)
async def update_profile(request: Request, company_id: int, 
                         name: str = Form(...), 
                         level: Optional[bool] = Form(0),  # User-controllable
                         db: Session = Depends(get_db)):
    # ... JWT validation ensures user owns this company_id ...
    
    company = crud.get_company(db, company_id)
    company.name = name
    company.level = level  # NO AUTHORIZATION CHECK - VULNERABILITY
    db.add(company)
    db.commit()
```

**Exploitation steps:**
1. Authenticate as a standard user (e.g., demo/demo)
2. Extract the JWT token from the `access_token` cookie
3. Submit POST request to `/edit_profile/1` with parameters: `name=demo&level=1`
4. The endpoint validates that the JWT belongs to company_id=1 (success)
5. The endpoint sets `company.level = 1` without checking if this privilege change is authorized
6. Navigate to `/company/1/jobs` - premium jobs with CTF flag are now visible

**Why the vulnerability exists:**

The endpoint correctly validates that `token_company_id == company_id` (lines 192-197), ensuring users can only edit their own profile. However, it **fails to validate that users should be allowed to modify their own privilege level**. This is a classic confused deputy problem - the authorization check verifies identity but not permissions.

**Client-side "protection" that doesn't work:**

The edit profile template (templates/edit_profile.html:18-22) disables the level dropdown for non-premium users:
```html
<select class="form-control" id="level" name="level" {% if not company.level %} disabled {% endif%}>
    <option value="0">Standard</option>
    <option value="1">Premium</option>
</select>
```

However, the `disabled` attribute is client-side only and trivially bypassed by:
- Using browser developer tools to remove the `disabled` attribute
- Crafting a raw HTTP POST request with curl or Burp Suite
- Using JavaScript to enable and submit the form

**Impact assessment:**
- **Severity:** High - Privilege Escalation
- **Attack complexity:** Low - Single POST request
- **Authentication required:** Yes - Must have valid account
- **Exploit difficulty:** Trivial - No special tools needed
- **Data exposed:** CTF flag in premium job listings

**Additional authorization concerns:**

1. **Insecure Direct Object Reference (IDOR) potential:** All endpoints use `company_id` as a path parameter. While JWT validation prevents cross-account access in most endpoints, developers might add new endpoints without proper checks.

2. **Unused role column:** The Company model defines a `role` column (models.py:11) that is never checked anywhere. This dead code could lead to confusion if developers assume role-based checks exist when they don't.

3. **No audit logging:** Authorization decisions and privilege changes are not logged, making it impossible to detect or investigate abuse.

### Multi-Tenancy Security Implementation

The application implements **company-based multi-tenancy** where each company can only access their own job listings. The tenant isolation is enforced through two mechanisms:

**Database-level filtering (Strong):**

All job queries include `company_id` filtering (crud.py:34-38):
```python
db.query(Job).filter(Job.company_id == company_id).all()
```

This uses SQLAlchemy ORM with parameterized queries, making it robust against SQL injection and ensuring companies only see their own jobs. The foreign key constraint (models.py:21) enforces referential integrity at the database level.

**Application-level authorization (Weak):**

Endpoints validate that `token_company_id == company_id` before allowing access (main.py:128-133):
```python
payload = jwt.decode(token.split(' ')[1], SECRET_KEY, algorithms=[ALGORITHM])
token_company_id = int(payload.get("sub"))
if token_company_id != company_id:
    raise credentials_exception
```

However, this check is **missing from the POST /edit_profile endpoint** (lines 177-205), which only validates the JWT but doesn't compare token_company_id to the path parameter. This creates the privilege escalation vulnerability described above.

**Multi-tenant isolation verdict:**
- ✅ **Database queries properly filtered** - No cross-tenant data leakage via SQL
- ✅ **Foreign key constraints enforced** - Data integrity maintained
- ⚠️ **Authorization checks inconsistent** - Some endpoints validate ownership, others don't
- ❌ **Privilege escalation possible** - Users can elevate their own access level

### SSO/OAuth/OIDC Flows

**No external SSO/OAuth/OIDC integration detected.**

The application uses OAuth2 password flow **patterns** (OAuth2PasswordRequestForm, OAuth2PasswordBearer) from FastAPI's security module, but these are for **local authentication only**, not external identity providers. There are no SSO callback endpoints, no OAuth authorization flows, no OIDC discovery endpoints, and no external identity provider integrations.

**No state/nonce parameter validation** is applicable since there are no OAuth callbacks. The authentication is entirely local username/password with JWT tokens.

---

## 4. Data Security & Storage

### Database Security

The application uses **SQLite** as its database backend with SQLAlchemy 2.0.30 providing the ORM layer. The database configuration is minimal and lacks several production-grade security controls.

**Database Configuration Analysis:**

The database connection string is hardcoded in `database.py:5`:
```python
DATABASE_URL = "sqlite:///./test.db"
```

This creates a file-based SQLite database at `./test.db` relative to the application's working directory (inside the Docker container at `/app/test.db`). The database is **unencrypted**, storing all data including bcrypt password hashes, company names, and the CTF flag in plaintext on the filesystem. An attacker who gains read access to the container's filesystem (via container escape, volume mount misconfiguration, or backup access) can exfiltrate the entire database.

**Critical database security findings:**

1. **No encryption at rest:** SQLite stores data in plaintext. To encrypt, the application would need to use SQLCipher (encrypted SQLite variant) or implement application-level field encryption.

2. **No connection pooling security:** The SessionLocal factory (database.py:9-11) is created without timeout limits, connection limits, or other pool security configurations. While less critical for SQLite (single-connection database), this matters if migrating to PostgreSQL/MySQL.

3. **Database wiped on startup:** The startup event handler (main.py:62) calls `crud.delete_all(db)`, which executes `db.query(Job).delete()` and `db.query(Company).delete()` (crud.py:42-43). This means **every application restart destroys all data**. While appropriate for a CTF challenge that re-seeds test data, this would be catastrophic in production.

4. **No database backups:** No backup mechanisms, point-in-time recovery, or replication are configured.

5. **No access controls:** SQLite has no user authentication or role-based access controls. Any process that can read the file can access all data.

**Query security (SQL Injection analysis):**

All database operations use SQLAlchemy ORM with parameterized queries, providing **strong protection against SQL injection**:

- `db.query(Company).filter(Company.id == company_id).first()` (crud.py:10)
- `db.query(Company).filter(Company.name == name).first()` (crud.py:14)
- `db.query(Job).filter(Job.company_id == company_id).all()` (crud.py:36)
- `db.query(Job).filter(Job.company_id == company_id, Job.premium == False).all()` (crud.py:38)

The ORM automatically parameterizes all values, preventing SQL injection. No raw SQL strings or string concatenation in queries were detected. **SQL injection risk: LOW** (properly mitigated through ORM usage).

### Data Flow Security

**CTF Flag Data Flow (Complete Trace):**

The CTF flag flows through multiple stages from build-time injection to runtime rendering:

**Stage 1: Build-time injection (Dockerfile:10-12):**
```dockerfile
ARG FLAG
RUN sed -i s/FLAG/$FLAG/g flag.txt
```
The FLAG build argument (passed from docker-compose.yml:6, sourced from .env:1) is injected into `flag.txt` during image build, replacing the placeholder string "FLAG" with the actual flag value `flag{c131ab68-2257-46c7-bf43-a1df6742f4f7}`.

**Stage 2: Startup file read (main.py:78-79):**
```python
with open("flag.txt") as f:
    flag = f.read()
```
During application startup, the flag file is read into memory. This occurs in the startup event handler, which runs once when the application starts.

**Stage 3: Database seeding (main.py:82-88):**
```python
example_jobs = [
    {"title": f"{company.name} Job 1", "description": f"{company.name} Job 1 Description"},
    {"title": f"{company.name} Premium Listing", "description": flag, "premium": True},
]
for job_data in example_jobs:
    job = Job(**job_data, company_id=company.id)
    db.add(job)
```
The flag is inserted into the `description` field of premium job listings (where `premium=True`). This happens for **all three test companies**, meaning each company gets a premium job listing containing the flag.

**Stage 4: Authorization-based retrieval (main.py:135-137, crud.py:34-38):**
```python
company = crud.get_company(db, company_id)
include_private = True if company.level else False  # Authorization check
jobs = crud.get_jobs(db, company_id=company_id, private=include_private)
```
The flag is only included in the response if `company.level` is truthy (level=1 for premium accounts). Standard users (level=0) receive only non-premium jobs via the filter `Job.premium == False`.

**Stage 5: Template rendering (templates/jobs.html:10):**
```html
<p>{{ job.title }}:{{ job.description }}</p>
```
The flag is rendered in the HTML response. Jinja2's auto-escaping protects against XSS, but the flag itself is displayed in plaintext to authorized users.

**Security implications:**
- Flag stored in **plaintext** at every stage (file, database, memory, HTTP response)
- No encryption or obfuscation applied
- Authorization controlled by user-modifiable `level` field (exploitable via privilege escalation)
- Flag duplicated across three companies' premium listings
- Database compromise exposes flag directly without requiring authorization bypass

### Multi-Tenant Data Isolation

The application enforces tenant isolation through **company_id-based filtering** in all database queries. Each company can only access their own job listings, preventing cross-tenant data leakage.

**Isolation implementation:**

All job queries filter by `company_id` (crud.py:36-38):
```python
def get_jobs(db: Session, company_id: int, private: bool = False):
    if private:
        return db.query(Job).filter(Job.company_id == company_id).all()
    else:
        return db.query(Job).filter(Job.company_id == company_id, Job.premium == False).all()
```

The foreign key relationship (models.py:21) enforces referential integrity:
```python
company_id = Column(Integer, ForeignKey("companies.id"))
```

**Isolation strength:**
- ✅ **Database-level filtering:** All queries include company_id WHERE clause
- ✅ **ORM-enforced:** No raw SQL means no bypass opportunities
- ✅ **Foreign key constraints:** Database enforces valid company references
- ⚠️ **Application-level validation inconsistent:** Some endpoints properly validate token_company_id matches path parameter, others (edit_profile POST) skip this check

**Potential isolation bypass scenarios:**
1. JWT token forgery (due to weak secret) allows impersonating any company
2. Privilege escalation allows accessing premium data, but not crossing company boundaries
3. Database file access bypasses all isolation (direct access to all rows)

**Multi-tenant isolation verdict:** Strong at the database query level, but undermined by application-level vulnerabilities (weak JWT secret, inconsistent authorization checks).

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **9 total HTTP endpoints** accessible via network requests, consisting of 6 explicitly defined routes and 3 FastAPI auto-generated documentation endpoints.

**Public Endpoints (No Authentication Required):**

1. **GET /**
   - **File:** main.py:108-110
   - **Purpose:** Login page UI
   - **Input:** None
   - **Output:** HTML login form
   - **Security Note:** Entry point for all users, no rate limiting on page loads

2. **POST /token**
   - **File:** main.py:93-105
   - **Purpose:** Authentication endpoint (login)
   - **Input:** OAuth2PasswordRequestForm (username, password)
   - **Output:** HTML redirect with Set-Cookie header containing JWT
   - **Security Risks:**
     - No rate limiting - vulnerable to credential stuffing attacks
     - No CAPTCHA - vulnerable to automated attacks
     - No account lockout after failed attempts
     - Hardcoded test credentials provide backdoor access
   - **Attack Surface:** Primary target for authentication bypass attempts

3. **GET /ping**
   - **File:** main.py:144-146
   - **Purpose:** Health check endpoint
   - **Input:** None
   - **Output:** JSON `{"ping": "pong"}`
   - **Security Note:** Minimal attack surface, used by Docker health checks

4. **GET /docs** (FastAPI auto-generated)
   - **Purpose:** Interactive Swagger UI API documentation
   - **Output:** HTML interface for exploring API endpoints
   - **Security Risk:** Exposes complete API schema to unauthenticated users, providing reconnaissance value to attackers
   - **Information Disclosed:** All endpoint paths, parameters, request/response schemas

5. **GET /redoc** (FastAPI auto-generated)
   - **Purpose:** Alternative ReDoc API documentation
   - **Output:** HTML documentation interface
   - **Security Risk:** Same as /docs, different UI

6. **GET /openapi.json** (FastAPI auto-generated)
   - **Purpose:** OpenAPI schema specification
   - **Output:** JSON schema of entire API
   - **Security Risk:** Machine-readable API schema enables automated vulnerability scanning

**Authenticated Endpoints (Require JWT Cookie):**

7. **GET /company/{company_id}/jobs**
   - **File:** main.py:113-141
   - **Purpose:** View job listings for authenticated company
   - **Authentication:** JWT via `access_token` cookie
   - **Authorization:** Token company_id must match path parameter
   - **Input:** Path parameter `company_id` (integer)
   - **Output:** HTML page with job listings (flag included if level=1)
   - **Security Risks:**
     - Authorization based on user-controllable `level` field
     - No CSRF protection
     - Sensitive data (flag) rendered in response
   - **Attack Surface:** Primary target for privilege escalation and data exfiltration

8. **GET /edit_profile/{company_id}**
   - **File:** main.py:149-174
   - **Purpose:** Display profile edit form
   - **Authentication:** JWT via `access_token` cookie
   - **Authorization:** Token company_id must match path parameter
   - **Input:** Path parameter `company_id` (integer)
   - **Output:** HTML form with current company details
   - **Security Note:** Read-only operation, lower risk than POST

9. **POST /edit_profile/{company_id}**
   - **File:** main.py:177-205
   - **Purpose:** Update company profile (name and level)
   - **Authentication:** JWT via `access_token` cookie
   - **Authorization:** WEAK - validates JWT but allows level modification
   - **Input:** 
     - Path parameter: `company_id` (integer)
     - Form fields: `name` (string), `level` (boolean/integer, default=0)
   - **Output:** HTML profile form with success message
   - **CRITICAL SECURITY RISKS:**
     - **Privilege escalation vulnerability:** Users can set their own `level` to 1 (premium)
     - **No CSRF protection:** Attackers can force profile modifications
     - **No input validation:** Company name length not validated
   - **Attack Surface:** **Highest priority target** - enables unauthorized flag access

**Attack Surface Summary by Risk:**

| Endpoint | Auth Required | CSRF Protected | Rate Limited | Input Validated | Risk Level |
|----------|---------------|----------------|--------------|-----------------|------------|
| POST /token | No | N/A | ❌ No | Partial | HIGH |
| POST /edit_profile/{id} | Yes | ❌ No | ❌ No | ❌ No | CRITICAL |
| GET /company/{id}/jobs | Yes | N/A (read) | ❌ No | Yes | MEDIUM |
| GET /docs | No | N/A (read) | ❌ No | N/A | LOW |
| GET /openapi.json | No | N/A (read) | ❌ No | N/A | LOW |
| GET /edit_profile/{id} | Yes | N/A (read) | ❌ No | Yes | LOW |
| GET / | No | N/A (read) | ❌ No | N/A | LOW |
| GET /ping | No | N/A (read) | ❌ No | N/A | MINIMAL |
| GET /redoc | No | N/A (read) | ❌ No | N/A | LOW |

### Internal Service Communication

**No internal service communication detected.** This is a **monolithic application** with no microservices architecture, no service-to-service authentication, and no inter-service network calls. All components run within a single process and communicate via direct function calls, not network requests.

The application does **not** implement:
- Service mesh (no Istio, Linkerd, Consul)
- API gateway for internal services
- Inter-service authentication/authorization
- Service discovery mechanisms
- Message queues or pub/sub systems
- RPC frameworks (gRPC, Thrift)

The only "internal" communication is the SQLAlchemy ORM's connection to the local SQLite database file, which occurs via file I/O, not network sockets.

### Input Validation Patterns

**Pydantic Schema Validation:**

FastAPI uses Pydantic models for automatic request validation. The schemas are defined in `schemas.py`:

```python
class CompanyBase(BaseModel):
    name: str

class CompanyCreate(CompanyBase):
    password: str

class Company(CompanyBase):
    id: int
    level: int
    
    class Config:
        orm_mode = True
```

**However, these Pydantic schemas are NOT actually used for request validation in any endpoint.** The endpoints use:
- `OAuth2PasswordRequestForm` for login (main.py:94) - FastAPI built-in
- `Form(...)` for profile updates (main.py:178) - Direct form field extraction
- Path parameters with type hints (e.g., `company_id: int`) - FastAPI validates types

**Input validation analysis:**

1. **Company name field:**
   - **Location:** main.py:178 - `name: str = Form(...)`
   - **Validation:** Type checking only (must be string), marked as required
   - **Missing:** No length limits, no character restrictions, no sanitization
   - **Risk:** Long names could cause display issues; special characters not filtered

2. **Level field:**
   - **Location:** main.py:178 - `level: Optional[bool] = Form(0)`
   - **Validation:** Type coercion to boolean/integer, defaults to 0
   - **Missing:** No authorization check on who can modify this field
   - **Risk:** Privilege escalation vulnerability

3. **Username/password (login):**
   - **Location:** main.py:94 - `OAuth2PasswordRequestForm`
   - **Validation:** Basic string validation, no length limits
   - **Missing:** Password complexity requirements, username format validation
   - **Risk:** Weak passwords allowed (e.g., "demo" password is "demo")

4. **Company_id path parameters:**
   - **Validation:** Type checking (must be integer)
   - **Missing:** Range validation (negative IDs accepted but fail database lookup)
   - **Risk:** Low - database handles invalid IDs gracefully

**XSS Prevention:**

Jinja2 auto-escaping is **enabled by default** (main.py:21 uses `Jinja2Templates` without disabling auto-escaping). All user-controllable data (company names, job titles, descriptions) is automatically HTML-escaped when rendered in templates. **No unsafe output sinks detected** (no `| safe` or `| raw` filters found).

**SQL Injection Prevention:**

SQLAlchemy ORM with parameterized queries provides strong protection. No raw SQL execution detected. **SQL injection risk: LOW.**

**Command Injection Prevention:**

No system command execution detected. No use of `os.system()`, `subprocess.Popen()`, or similar functions. **Command injection risk: NONE.**

**Overall input validation posture:** Basic type validation through FastAPI, strong XSS/SQLi protection through framework defaults, but missing higher-level business logic validation (length limits, format requirements, authorization checks).

### Background Processing

**No background job processing exposed to network requests.** The application has no:
- Celery/Redis/RabbitMQ task queues
- Scheduled jobs triggered by API calls
- Webhook dispatchers
- Async job processors accessible via endpoints
- WebSocket connections for real-time updates

**Startup event handler (OUT-OF-SCOPE):**

The application has a startup event handler (main.py:59-90) that executes database initialization:
```python
@app.on_event("startup")
async def startup_event():
    db = SessionLocal()
    crud.delete_all(db)
    # ... seed companies and jobs ...
```

This is **OUT-OF-SCOPE** for network attack surface analysis because it:
- Executes once on application startup, not per request
- Cannot be triggered via network requests
- Has no user input or controllable parameters
- Runs before the application accepts any network connections

**Verdict:** No background processing attack surface exists in network-accessible components.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**CRITICAL FINDINGS: Multiple severe secrets management failures**

**1. Hardcoded JWT Secret (CRITICAL):**

**Location:** main.py:14
```python
SECRET_KEY = "a very secret key"
```

**Impact:**
- Any attacker can forge valid JWT tokens
- Complete authentication bypass possible
- Tokens can be created for any company_id
- Exploit: `jwt.encode({"sub": "1", "exp": 9999999999}, "a very secret key", algorithm="HS256")`

**Why this is critical:** JWT security entirely depends on the secrecy of the signing key. With a publicly known key, the entire authentication system is worthless. An attacker doesn't need to steal tokens - they can create their own.

**2. Hardcoded Test Credentials:**

**Location:** main.py:64-68
```python
example_companies = [
    {"name": "demo", "password": "demo", "level": False},
    {"name": "company2", "password": "ajsdasd987asd87as7da9", "level": True},
    {"name": "company3", "password": "password3", "level": False}
]
```

**Impact:**
- Known credentials provide backdoor access
- "demo/demo" is trivial to guess
- "company2" has premium access (level=True) with a knowable password
- Credentials are committed to version control (git)

**3. Environment Variable Not Loaded:**

**Location:** .env file exists but not loaded
```
# .env:1
FLAG="flag{c131ab68-2257-46c7-bf43-a1df6742f4f7}"
```

**Issue:** Despite having `python-dotenv==1.0.1` in requirements.txt:29, the application **never calls `load_dotenv()`**. The .env file is ignored, and the application reads the flag from `flag.txt` instead.

**4. No Secret Rotation:**

- No mechanism to rotate JWT secret
- No password expiration policy
- No token revocation capability
- Changing secrets requires code redeployment

**Remediation Priority:**

**Immediate (Critical):**
```python
# Add to main.py imports:
import os
from dotenv import load_dotenv

# Add at module level:
load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable not set")
if len(SECRET_KEY) < 32:
    raise ValueError("SECRET_KEY must be at least 32 characters")
```

Generate strong secret: `openssl rand -hex 32`
Store in .env: `SECRET_KEY=<generated_value>`
**Never commit .env to git** (add to .gitignore)

### Configuration Security

**Environment Separation:**

The application has **no environment-specific configuration**. The same code, same hardcoded secrets, and same database path are used in all environments. There is no distinction between development, staging, and production configurations.

**Configuration files examined:**
- `.env` - Contains FLAG but is not loaded by application
- `docker-compose.yml` - Passes FLAG as build argument but no other secrets
- `Dockerfile` - Contains build-time flag injection only
- No `config.py`, `settings.py`, or environment-specific config files

**Secret handling in configuration:**
- ❌ JWT secret hardcoded in source (main.py:14)
- ❌ Database path hardcoded (database.py:5)
- ⚠️ FLAG in .env but not used (application reads from flag.txt)
- ❌ No production vs development mode distinction

**Security Headers Configuration:**

**CRITICAL FINDING: No security headers configured at application level**

The application does **not** set any security headers in responses. Checking main.py for header configuration reveals no middleware or response header settings.

**Missing headers:**
- ❌ `Strict-Transport-Security` (HSTS) - Not configured in application
- ❌ `Content-Security-Policy` (CSP) - Not configured in application
- ❌ `X-Frame-Options` - Not configured in application
- ❌ `X-Content-Type-Options` - Not configured in application
- ❌ `X-XSS-Protection` - Not configured in application
- ❌ `Referrer-Policy` - Not configured in application

**Infrastructure-level header configuration:**

To find infrastructure-level security headers (Nginx, CDN, ingress controllers), I searched for:
- Nginx configuration files: **None found**
- Kubernetes manifests: **None found** (no k8s/ or .yaml ingress files)
- CDN configuration: **None found**
- Reverse proxy config: **None found**

**Verdict:** Security headers are **entirely missing** at both application and infrastructure levels. The Docker deployment exposes port 80 directly without a reverse proxy, so no infrastructure layer exists to add headers.

**Impact:**
- **No HSTS:** Connections can be downgraded to HTTP (MITM attacks)
- **No CSP:** No defense-in-depth against XSS attacks
- **No X-Frame-Options:** Application can be embedded in iframes (clickjacking risk)
- **No X-Content-Type-Options:** MIME-sniffing attacks possible

**Cache-Control for sensitive pages:**

Searching for Cache-Control headers in responses: **None found**. The application does not set cache control headers, meaning browsers and proxies may cache sensitive data like job listings containing the flag.

### External Dependencies

**Third-party service integrations:**

The application has **no external service dependencies** beyond its core framework libraries. Analysis reveals:

- ❌ No payment gateway integrations (Stripe, PayPal, etc.)
- ❌ No email service APIs (SendGrid, Mailgun, SES)
- ❌ No authentication providers (Auth0, OAuth providers, LDAP)
- ❌ No cloud storage services (S3, GCS, Azure Blob)
- ❌ No monitoring services (Datadog, New Relic, Sentry)
- ❌ No logging services (Splunk, Elasticsearch, CloudWatch)
- ❌ No CDN services (Cloudflare, Fastly, CloudFront)

**HTTP client library analysis:**

Despite `httpx==0.27.0` being in requirements.txt:17, it is **never imported or used** in the codebase. Searching all Python files for `import httpx` or `httpx.` returns no results. This is an unused dependency that should be removed.

**Dependency security implications:**

The application is self-contained with no external API calls, reducing:
- Third-party data breach risks
- API key management complexity
- Network-based attacks on external integrations
- Supply chain attacks via compromised external services

However, the Python package dependencies themselves represent a supply chain risk. The application uses 48 pinned dependencies in requirements.txt, including:
- FastAPI framework ecosystem (6 packages)
- SQLAlchemy and database drivers (3 packages)
- Authentication libraries (3 packages)
- Template and validation libraries (4 packages)

**Dependency vulnerability scanning:** No evidence of automated dependency scanning (no Dependabot, Snyk, or similar tools configured).

### Monitoring & Logging

**CRITICAL FINDING: No security logging or monitoring implemented**

**Logging analysis:**

Searching the entire codebase for logging implementations:
- ❌ No `import logging` statements
- ❌ No logger initialization
- ❌ No log statements (`logger.info`, `logger.error`, etc.)
- ❌ No `print()` statements for debugging
- ❌ No audit trail for security events

**Security event visibility:**

The application does **not log** any of the following security-critical events:
- Authentication attempts (successful or failed)
- Authorization failures
- Token validation errors
- Profile modifications (including privilege escalation)
- Database access patterns
- Suspicious activity (rapid requests, invalid tokens, etc.)

**Default logging:**

The only logging is Uvicorn's default access logs, which capture:
- HTTP method and path
- Status code
- Response time
- User agent (if provided)

These access logs do **not** include:
- Username or company_id of authenticated users
- Request bodies or form data
- Cookie values (properly excluded for security)
- Database queries executed

**Monitoring capabilities:**

The application exposes a health check endpoint `/ping` (main.py:144-146) that returns `{"ping": "pong"}`. This is used by Docker health checks (Dockerfile:17-18) but provides no insight into:
- Database health
- Authentication system health
- Error rates
- Performance metrics

**Security implications:**

Without logging and monitoring:
- ❌ Cannot detect brute force attacks on /token endpoint
- ❌ Cannot identify privilege escalation attempts
- ❌ Cannot investigate security incidents
- ❌ Cannot perform forensic analysis after breaches
- ❌ Cannot detect unusual access patterns
- ❌ Cannot meet compliance requirements (audit trails)

**Privacy benefit:**

The absence of logging prevents accidental leakage of sensitive data (passwords, tokens) into log files. However, this is not intentional security design - it's simply an absence of logging infrastructure.

**Recommended logging implementation:**

```python
import logging
from logging.handlers import RotatingFileHandler

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        RotatingFileHandler('security.log', maxBytes=10485760, backupCount=5)
    ]
)

security_logger = logging.getLogger('security')

# Log authentication attempts (main.py:96)
if not company:
    security_logger.warning(f"Failed login attempt for username: {form_data.username}")
else:
    security_logger.info(f"Successful login for company_id: {company.id}")

# Log privilege changes (main.py:201)
if level != company.level:
    security_logger.warning(f"Privilege escalation: company_id {company.id} changed level from {company.level} to {level}")
```

**IMPORTANT:** Never log passwords, tokens, or sensitive PII. Log only metadata (timestamps, usernames, actions, outcomes).

---

## 7. Overall Codebase Indexing

The XBEN-005-24 codebase demonstrates a minimalist, flat organizational structure typical of small-scale Python web applications designed for specific security testing scenarios. The entire application comprises **329 lines of Python code** spread across five core modules, plus four HTML templates, with a total codebase size under 2,000 lines including configuration files. This compact size facilitates rapid code review but also means that any security vulnerability has immediate global impact - there are no isolated subsystems to contain blast radius.

The directory structure follows a **non-package layout** where all Python modules reside in a single `app/` directory without subpackages or nested namespaces. This flat organization is evident in the import statements, which use relative imports like `from models import Company, Job` (main.py:2) rather than package-qualified imports. The structure prioritizes simplicity over modularity: `main.py` contains all route handlers and business logic (205 lines), `crud.py` handles data access (44 lines), `models.py` defines database schemas (24 lines), `schemas.py` specifies Pydantic models (46 lines), and `database.py` configures the SQLAlchemy engine (10 lines). This tight coupling means that understanding authentication flows, authorization logic, and data persistence requires examining multiple interdependent files.

**Build orchestration** uses Docker Compose (docker-compose.yml) as the primary deployment tool, with a Makefile that includes `common.mk` for build automation. The Dockerfile employs a **multi-stage build pattern** using a standard `python:3.12` base image, installing dependencies via pip from requirements.txt (48 packages totaling ~350MB when installed), then injecting the CTF flag via a build argument and sed substitution. The build process is unconventional in that it **modifies source files during build** (RUN sed -i s/FLAG/$FLAG/g flag.txt, Dockerfile:12), creating immutable artifacts where the flag is baked into the image rather than injected at runtime via environment variables. This build-time secret injection is marked by the `.xben_build_done` marker file, suggesting integration with external benchmark tooling.

**Dependency management** is explicit and version-pinned in requirements.txt, avoiding ranges or unpinned versions. Notable dependency choices reveal security-relevant architectural decisions: the inclusion of `httpx==0.27.0` (a modern async HTTP client) that is **never imported or used** suggests either future functionality or incomplete cleanup; `python-dotenv==1.0.1` is present but **load_dotenv() is never called**, meaning environment variable loading is broken; `email_validator==2.1.1` is installed but unused, as the application has no email functionality. The authentication stack (python-jose 3.3.0, passlib 1.7.4, bcrypt 4.1.3) represents industry-standard choices, though their configuration (weak JWT secret, default bcrypt rounds) undermines their effectiveness.

**Testing frameworks** are conspicuously absent - the codebase contains no test files, no pytest configuration, no test runners, and no CI/CD testing pipelines. The `benchmark.json` file suggests this application serves as a **security assessment target** rather than production software, explaining the deliberate inclusion of vulnerabilities and lack of test coverage. This CTF/benchmark context is reinforced by the startup data seeding (main.py:59-90) that wipes and recreates the database on every restart, the presence of hardcoded test credentials, and the flag storage mechanism.

**Code generation** is not employed - all code is hand-written without ORM scaffolding, migration generators, or code templating beyond Jinja2's template inheritance. The templates use a simple inheritance pattern where `base.html` defines the layout with navigation and Bootstrap 4.5.2 CDN links, and child templates (`login.html`, `jobs.html`, `edit_profile.html`) extend it via `{% extends "base.html" %}`. This manual approach means no auto-generated admin panels, CRUD interfaces, or API scaffolding that might introduce unexpected endpoints or security misconfigurations.

**Security-relevant conventions** that impact discoverability include: the use of FastAPI's automatic OpenAPI generation (exposing `/docs`, `/redoc`, `/openapi.json` endpoints without explicit definitions in main.py), the OAuth2 pattern declaration (`oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")`, main.py:24) that is **never used as a dependency**, creating misleading code that suggests FastAPI's security dependency injection is active when it's not, and the startup event handler pattern that executes privileged operations (database wipes, test data seeding) outside the request-response cycle and therefore outside normal security audit scope.

The codebase organization creates **security discoverability challenges** in several areas: the privilege escalation vulnerability in the POST /edit_profile endpoint (main.py:177-205) is not obvious because the authorization check (`token_company_id != company_id`) is missing rather than present-but-broken, requiring readers to recognize an absence rather than a flaw; the weak JWT secret (main.py:14) is discoverable only by reading source code rather than through runtime behavior; and the flag storage mechanism spans four files (Dockerfile → flag.txt → main.py → models.py → templates/jobs.html), requiring trace-through across build-time, startup-time, and request-time execution phases to fully understand the attack path.

**Critical files for security assessment** are concentrated in the `app/` directory: `main.py` contains all authentication logic, authorization checks, and route handlers; `crud.py` implements password hashing and database queries; `models.py` defines the schema including the `level` column that controls premium access; and `templates/edit_profile.html` contains the client-side disabled dropdown that provides false security through DOM manipulation. Infrastructure configuration is minimal: `docker-compose.yml` orchestrates the single-container deployment, `Dockerfile` defines the build process including flag injection, and `.env` contains the flag value (though it's not loaded at runtime, making its presence misleading).

The absence of certain components is as significant as what's present: no middleware directory, no separate authentication module, no admin interface, no API versioning, no database migrations directory (despite SQLAlchemy's Alembic support), no configuration management beyond hardcoded values, and no deployment scripts beyond Docker Compose. This minimalism reduces the codebase surface area but concentrates all security-critical logic in a small number of files, meaning thorough review of `main.py`, `crud.py`, and `models.py` provides complete coverage of the authentication and authorization implementation.

---

## 8. Critical File Paths

### Configuration
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/docker-compose.yml` - Docker orchestration, FLAG build argument
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/Dockerfile` - Container build, flag injection via sed
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/.env` - FLAG environment variable (not loaded by app)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/Makefile` - Build automation
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/benchmark.json` - CTF/benchmark metadata

### Authentication & Authorization
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py` - **PRIMARY SECURITY FILE**
  - Line 14: Hardcoded JWT secret (CRITICAL VULNERABILITY)
  - Lines 35-36: Password verification function
  - Lines 39-47: JWT token creation
  - Lines 50-56: Authentication function
  - Lines 93-105: POST /token login endpoint
  - Lines 108-110: GET / login page
  - Lines 113-141: GET /company/{id}/jobs with authorization
  - Lines 149-174: GET /edit_profile/{id}
  - Lines 177-205: POST /edit_profile/{id} (PRIVILEGE ESCALATION VULNERABILITY)
  - Line 104: Cookie configuration (missing Secure and SameSite flags)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/crud.py`
  - Lines 4-6: Bcrypt password context configuration
  - Lines 10-23: Company CRUD operations
  - Lines 34-38: Job retrieval with premium filtering

### API & Routing
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py` - All route definitions (6 endpoints)
- Auto-generated endpoints: /docs, /redoc, /openapi.json (FastAPI defaults)

### Data Models & DB Interaction
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/models.py`
  - Lines 6-13: Company model (id, name, hashed_password, role, level)
  - Lines 16-24: Job model (id, title, description, company_id, premium)
  - Line 11: Unused 'role' column
  - Line 12: 'level' column controlling premium access
  - Line 20: 'description' column storing CTF flag
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/database.py`
  - Lines 5-7: Database URL and engine configuration
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/schemas.py` - Pydantic models (unused in endpoints)

### Dependency Manifests
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/requirements.txt` - 48 pinned Python dependencies

### Sensitive Data & Secrets Handling
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/flag.txt` - CTF flag file (injected at build time)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py`
  - Line 14: JWT SECRET_KEY (hardcoded)
  - Lines 64-68: Hardcoded test credentials
  - Lines 78-79: Flag file read
  - Lines 82-88: Flag insertion into database

### Middleware & Input Validation
- No dedicated middleware files
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py:21` - Jinja2Templates initialization (auto-escaping enabled)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/schemas.py` - Pydantic schemas (defined but not used)

### Logging & Monitoring
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py:144-146` - /ping health check endpoint
- **No logging configuration files** - logging not implemented

### Infrastructure & Deployment
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/docker-compose.yml` - Service definition, FLAG injection
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/Dockerfile` - Image build with flag substitution
- **No Kubernetes manifests** - single container deployment
- **No Nginx configuration** - direct port 80 exposure
- **No reverse proxy** - application handles HTTP directly

### CTF Flag Storage
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/Dockerfile:10-12` - FLAG ARG and sed injection
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/.env:1` - FLAG environment variable
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/flag.txt` - Flag file (replaced during build)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py:78-83` - Flag read and database insert
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/models.py:20` - Job.description column (flag storage)
- Database file (runtime): `/app/test.db` inside container

### Templates
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/base.html` - Base layout, navigation
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/login.html` - Login form
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/jobs.html` - Job listings display (flag rendering at line 10)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/edit_profile.html` - Profile edit form (disabled dropdown at lines 18-22)

---

## 9. XSS Sinks and Render Contexts

**EXECUTIVE SUMMARY:** The application demonstrates strong XSS protection through Jinja2's default auto-escaping. **No critical unescaped XSS sinks were identified** in network-accessible pages. All user-controllable data is rendered in contexts with automatic HTML entity encoding, preventing execution of malicious scripts. However, seven locations render user-controllable data and represent potential XSS sinks if future code changes disable auto-escaping or introduce unsafe filters.

### HTML Body Context

**Sink 1: Job Title and Description Rendering**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/jobs.html:10`
- **Code:** `<p>{{ job.title }}:{{ job.description }}</p>`
- **Render Context:** HTML content context (inside paragraph element)
- **User-Controllable Variables:** `job.title`, `job.description`
- **Data Source:** Database (Job model), populated during startup with flag in premium job descriptions
- **Escaping Status:** ✅ Auto-escaped (Jinja2 default)
- **Attack Vector:** Users can modify job titles/descriptions via database (not exposed endpoint currently)
- **Severity:** MEDIUM (protected by auto-escaping, but flag data rendered here)
- **Exploitation Scenario:** If auto-escaping disabled or `| safe` filter added:
  ```html
  Job title: <script>alert(document.cookie)</script>
  Would execute XSS payload
  ```
- **Current Protection:** Renders as `&lt;script&gt;alert(document.cookie)&lt;/script&gt;`

**Sink 2: Success Message in Edit Profile**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/edit_profile.html:9`
- **Code:** `{{ msg }}`
- **Render Context:** HTML content context within alert div
- **User-Controllable Variable:** `msg`
- **Data Source:** Currently hardcoded string "Profile updated successfully" (main.py:205)
- **Escaping Status:** ✅ Auto-escaped
- **Severity:** LOW (not user-controllable in current implementation)
- **Potential Risk:** If future code changes allow user-controlled messages, XSS possible if auto-escaping disabled

**Sink 3: Error Message in Login Page**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/login.html:9`
- **Code:** `{{ error }}`
- **Render Context:** HTML content context within alert div
- **User-Controllable Variable:** `error`
- **Data Source:** Hardcoded string "Incorrect username or password" (main.py:98)
- **Escaping Status:** ✅ Auto-escaped
- **Severity:** LOW (static string, no user control)

**Sink 4: Company ID in Jobs Page Header**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/jobs.html:6`
- **Code:** `<h2>Jobs for Company {{ company_id }}</h2>`
- **Render Context:** HTML content context (heading text)
- **User-Controllable Variable:** `company_id`
- **Data Source:** Path parameter from URL (authenticated via JWT)
- **Escaping Status:** ✅ Auto-escaped
- **Type Validation:** Integer type enforced by FastAPI
- **Severity:** LOW (integer type, JWT-protected)

### HTML Attribute Context

**Sink 5: Company Name in Input Value Attribute**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/edit_profile.html:15`
- **Code:** `<input type="text" class="form-control" id="name" name="name" value="{{ company.name }}" required>`
- **Render Context:** HTML attribute context (value attribute of text input)
- **User-Controllable Variable:** `company.name`
- **Data Source:** User form input via POST /edit_profile/{company_id} (main.py:200) and database
- **Escaping Status:** ✅ Auto-escaped (HTML entities encoded)
- **Attack Scenario:** User submits name containing quotes/HTML
  - Input: `name=" onload="alert(1)"`
  - Rendered: `value="&quot; onload=&quot;alert(1)&quot;"`
  - Result: Escaped, no XSS execution
- **Severity:** MEDIUM (user-controllable but protected by auto-escaping)

**Sink 6: Company ID in Navigation Links**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/base.html:24-25`
- **Code:** 
  ```html
  <a class="nav-link" href="/company/{{company_id}}/jobs">View Jobs</a>
  <a class="nav-link" href="/edit_profile/{{company_id}}">Edit Profile</a>
  ```
- **Render Context:** URL path in href attribute
- **User-Controllable Variable:** `company_id`
- **Data Source:** Path parameter (JWT-authenticated)
- **Escaping Status:** ✅ Auto-escaped
- **Type Validation:** Integer type
- **Severity:** LOW (integer, authenticated)

**Sink 7: Company ID in Form Action**
- **File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/templates/edit_profile.html:12`
- **Code:** `<form method="post" action="/edit_profile/{{company.id}}">`
- **Render Context:** URL in form action attribute
- **User-Controllable Variable:** `company.id`
- **Data Source:** Database (Company model), JWT-authenticated
- **Escaping Status:** ✅ Auto-escaped
- **Type Validation:** Integer (database primary key)
- **Severity:** LOW (integer, authenticated)

### JavaScript Context

**FINDING: NO JavaScript contexts with user-controllable data**

Analysis of all templates reveals:
- ❌ No `<script>` tags containing template variables
- ❌ No inline event handlers (onclick, onerror, onload) with user data
- ❌ No JavaScript variable assignments from template variables
- ✅ External Bootstrap JavaScript loaded from CDN (no user data injection)

**Templates examined:**
- base.html: Contains only CDN script tags (jQuery, Popper, Bootstrap)
- login.html: No JavaScript code
- jobs.html: No JavaScript code
- edit_profile.html: No JavaScript code

### CSS Context

**FINDING: NO CSS contexts with user-controllable data**

Analysis reveals:
- ❌ No `<style>` tags with user-controllable content
- ❌ No inline `style` attributes with template variables
- ❌ No CSS property assignments from user data
- ✅ All styling via Bootstrap CSS classes (static)

### Dangerous JavaScript Sinks

**FINDING: NO dangerous JavaScript sinks detected**

Comprehensive search across all templates and main.py for dangerous JavaScript functions:
- ❌ No `innerHTML` usage
- ❌ No `outerHTML` usage
- ❌ No `document.write()` or `document.writeln()`
- ❌ No `element.insertAdjacentHTML()`
- ❌ No `eval()` or `Function()` constructor
- ❌ No `setTimeout()` or `setInterval()` with string arguments
- ❌ No jQuery DOM manipulation ($.html(), $.append(), etc.)
- ❌ No `createContextualFragment()`

### Server-Side Template Injection

**FINDING: NO Server-Side Template Injection sinks**

**Analysis:**
- All templates are static files loaded from `templates/` directory
- Template initialization: `templates = Jinja2Templates(directory="templates")` (main.py:21)
- All template rendering uses `templates.TemplateResponse(template_name, context)`
- **No dynamic template compilation** - no `render_template_string()` usage
- **No user-controlled template names** - all template names are hardcoded strings:
  - "login.html" (main.py:98, 110)
  - "jobs.html" (main.py:139)
  - "edit_profile.html" (main.py:174, 205)

**Template string analysis:**
```python
# main.py:98
return templates.TemplateResponse("login.html", {...})  # Static
# main.py:139
return templates.TemplateResponse("jobs.html", {...})   # Static
# main.py:205
return templates.TemplateResponse("edit_profile.html", {...})  # Static
```

**Verdict:** No SSTI vulnerabilities. Template selection is not influenced by user input.

### Auto-Escaping Configuration

**Jinja2 auto-escaping is ENABLED (default behavior):**

**Evidence:**
- Template initialization (main.py:21) uses default Jinja2Templates configuration
- No `autoescape=False` parameter present
- No custom environment configuration disabling auto-escaping
- **Default behavior:** Jinja2 auto-escapes all variables in HTML contexts

**Verification of safe filters:**
Searching all templates for unsafe output filters:
- ❌ No `| safe` filter usage
- ❌ No `| raw` filter usage
- ❌ No `{% autoescape false %}` blocks
- ✅ All output uses default escaping: `{{ variable }}`

### XSS Summary Table

| Sink Location | Variable | Context | Escaping | Severity | Exploitable |
|---------------|----------|---------|----------|----------|-------------|
| jobs.html:10 | job.title, job.description | HTML body | ✅ Auto | MEDIUM | ❌ No |
| edit_profile.html:9 | msg | HTML body | ✅ Auto | LOW | ❌ No |
| login.html:9 | error | HTML body | ✅ Auto | LOW | ❌ No |
| jobs.html:6 | company_id | HTML body | ✅ Auto | LOW | ❌ No |
| edit_profile.html:15 | company.name | Attribute (value) | ✅ Auto | MEDIUM | ❌ No |
| base.html:24-25 | company_id | Attribute (href) | ✅ Auto | LOW | ❌ No |
| edit_profile.html:12 | company.id | Attribute (action) | ✅ Auto | LOW | ❌ No |

**Total XSS Sinks:** 7 locations
**Currently Exploitable:** 0 (all protected by auto-escaping)
**Require Code Changes to Exploit:** All 7 (would need `| safe` filter or autoescape disabled)

### Recommendations

1. **Maintain Auto-Escaping:** Never disable Jinja2 auto-escaping globally
2. **Avoid Unsafe Filters:** Prohibit `| safe` and `| raw` filters unless absolutely necessary with explicit sanitization
3. **Content Security Policy:** Implement CSP headers to provide defense-in-depth:
   ```python
   response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' https://code.jquery.com https://cdn.jsdelivr.net https://stackpath.bootstrapcdn.com; style-src 'self' https://stackpath.bootstrapcdn.com"
   ```
4. **Template Auditing:** Regularly audit templates for new XSS sinks, especially when adding rich text features
5. **Input Length Limits:** Add maximum length validation for company.name to prevent display issues

### Conclusion

The application demonstrates **strong XSS protection** through consistent use of Jinja2's auto-escaping. All user-controllable data is rendered in contexts with automatic HTML entity encoding, preventing XSS attacks in the current implementation. However, the presence of seven user-controllable output locations means future code changes that disable auto-escaping or introduce unsafe filters would immediately create exploitable XSS vulnerabilities. The primary XSS risk is not in the current code but in **maintenance and future modifications** that might weaken the default protections.

---

## 10. SSRF Sinks

**EXECUTIVE SUMMARY:** Comprehensive analysis of the codebase revealed **ZERO (0) Server-Side Request Forgery (SSRF) vulnerabilities** in network-accessible endpoints. Despite the presence of `httpx==0.27.0` in the dependency manifest, this HTTP client library is **never imported or used** in the application code. The application performs no outbound HTTP requests, URL fetching, webhook callbacks, or external API integrations, resulting in **no SSRF attack surface**.

### HTTP(S) Client Usage

**FINDING: NO HTTP CLIENT USAGE DETECTED**

**Dependency Analysis:**
- **httpx==0.27.0** listed in `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/requirements.txt:17`
- **Search Results:** No import statements or usage found
  - No `import httpx` or `from httpx import` in any Python file
  - No `httpx.get()`, `httpx.post()`, `httpx.Client()`, or `httpx.AsyncClient()` calls
  - **Verdict:** Unused dependency, candidate for removal

**Alternative HTTP Libraries:**
Searched for alternative HTTP client libraries:
- ❌ No `requests` library (not in requirements.txt, not imported)
- ❌ No `urllib.request` usage
- ❌ No `aiohttp` usage
- ❌ No `http.client` usage
- ❌ No `urllib3` direct usage

**Conclusion:** Application makes **no outbound HTTP requests** from server-side code.

### URL Openers & File Includes

**FINDING: 1 file open operation (SAFE - hardcoded filename)**

**File Operation Analysis:**

**Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py:78-79`
```python
with open("flag.txt") as f:
    flag = f.read()
```

**Assessment:**
- **Filename:** "flag.txt" (hardcoded string literal)
- **User Control:** None - filename is not derived from user input
- **Context:** Startup event handler (runs once on app start, not per request)
- **Scope:** OUT-OF-SCOPE for network attack surface (not reachable via HTTP)
- **SSRF Risk:** NONE (no user-controllable path)

**Dynamic Import Analysis:**
- ❌ No `__import__()` with user-controlled module names
- ❌ No `importlib.import_module()` with user input
- ❌ No `exec()` or `eval()` with user-controlled code
- ❌ No plugin loading mechanisms

**Verdict:** No file inclusion vulnerabilities in network-accessible code.

### Redirect & "Next URL" Handlers

**FINDING: 1 redirect (SAFE - not user-controllable)**

**Redirect Analysis:**

**Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py:103`
```python
response = RedirectResponse(url=f"/company/{company.id}/jobs", status_code=status.HTTP_303_SEE_OTHER)
```

**Assessment:**
- **URL Construction:** `f"/company/{company.id}/jobs"`
- **User Input:** `company.id` is **NOT from request** - it's from authenticated company object retrieved from database
- **Data Flow:** 
  1. User submits credentials
  2. Database query retrieves company by name: `authenticate_company(db, form_data.username, form_data.password)`
  3. Company object's ID field (integer primary key) used in URL
  4. URL is **relative** (starts with `/`), not absolute
- **URL Format:** Always `/company/{integer}/jobs` (e.g., `/company/1/jobs`)
- **Open Redirect Risk:** NONE - URL not user-controllable, always relative path
- **SSRF Risk:** NONE - no external requests made

**Query Parameter Analysis:**
Searched all endpoints for redirect-related parameters:
- ❌ No "return_url" parameter
- ❌ No "next" parameter
- ❌ No "redirect_to" parameter
- ❌ No "callback_url" parameter
- ❌ No "continue" parameter

**Verdict:** No open redirect vulnerabilities. Single redirect uses database-sourced integer ID.

### Webhook Testers & Callback Verifiers

**FINDING: NO webhook or callback functionality**

**Endpoint Analysis:**

All 6 explicit endpoints examined:
1. `POST /token` - Login (no webhooks)
2. `GET /` - Login page (no webhooks)
3. `GET /ping` - Health check (no webhooks)
4. `GET /company/{company_id}/jobs` - View jobs (no webhooks)
5. `GET /edit_profile/{company_id}` - Edit form (no webhooks)
6. `POST /edit_profile/{company_id}` - Update profile (no webhooks)

**Search Results:**
- ❌ No "webhook" in any endpoint path or function name
- ❌ No "callback" in any endpoint path or function name
- ❌ No endpoints accepting URL parameters
- ❌ No webhook verification logic
- ❌ No outbound request functionality

**Verdict:** No webhook testing or callback verification features.

### External API Integrations

**FINDING: NO external API integrations**

**Integration Analysis:**

**Payment Gateways:**
- ❌ No Stripe integration (no stripe library in requirements.txt)
- ❌ No PayPal integration
- ❌ No payment processing endpoints

**Email Services:**
- ❌ No SMTP usage (no smtplib usage)
- ❌ No SendGrid integration
- ❌ No Mailgun integration
- ❌ No email sending functionality

**Authentication Providers:**
- ❌ No OAuth provider integrations (Auth0, Google, GitHub, etc.)
- ❌ No SAML integration
- ❌ No LDAP integration
- ✅ Only local JWT-based authentication (python-jose)

**Cloud Services:**
- ❌ No AWS SDK (boto3 not in requirements)
- ❌ No Azure SDK
- ❌ No GCP SDK
- ❌ No cloud storage integrations

**Verdict:** Application is entirely self-contained with no external API dependencies.

### Media Processors

**FINDING: NO media processing functionality**

**Image Processing:**
- ❌ No PIL/Pillow library (not in requirements.txt)
- ❌ No image upload endpoints
- ❌ No image URL fetching
- ❌ No ImageMagick/GraphicsMagick usage

**PDF Generation:**
- ❌ No wkhtmltopdf usage
- ❌ No WeasyPrint usage
- ❌ No ReportLab usage
- ❌ No PDF generation from URLs

**HTML-to-PDF Converters:**
- ❌ No Puppeteer/Playwright usage (Python app, not Node.js)
- ❌ No headless browser usage

**Verdict:** No media processing attack surface.

### Headless Browsers & Render Engines

**FINDING: NO headless browser usage**

**Analysis:**
- Application is Python-based (not Node.js/JavaScript)
- ❌ No Puppeteer integration
- ❌ No Playwright integration
- ❌ No Selenium usage
- ❌ No browser automation libraries

**Verdict:** No headless browser SSRF attack surface.

### DNS Resolution & Socket Operations

**FINDING: NO raw socket or DNS operations**

**Network Programming Analysis:**

Searched all Python files for socket operations:
- ❌ No `import socket`
- ❌ No `socket.connect()` calls
- ❌ No `socket.gethostbyname()` calls
- ❌ No `socket.getaddrinfo()` calls
- ❌ No raw socket creation
- ❌ No TCP/UDP client implementations

**DNS Queries:**
- ❌ No custom DNS resolution
- ❌ No DNS library imports
- ❌ No user-controlled hostname resolution

**Verdict:** No socket-based SSRF attack surface.

### Link Preview & Unfurlers

**FINDING: NO link preview or unfurling functionality**

**Analysis:**
- Application is a job listing platform, not a chat/CMS application
- ❌ No oEmbed endpoints
- ❌ No URL metadata extractors
- ❌ No link preview generators
- ❌ No social media card generators
- ❌ No rich link unfurling

**Verdict:** No unfurling SSRF attack surface.

### SSO/OIDC Discovery & JWKS Fetchers

**FINDING: NO external identity provider integrations**

**Authentication Analysis:**
- ✅ Local JWT authentication only (python-jose library)
- ❌ No OIDC discovery endpoints (.well-known/openid-configuration)
- ❌ No JWKS URL fetching
- ❌ No OAuth authorization server metadata retrieval
- ❌ No SAML metadata fetchers
- ❌ No external token validation

**Verdict:** No OIDC/JWKS SSRF attack surface (authentication is local only).

### Importers & Data Loaders

**FINDING: NO import/data loading functionality**

**Analysis:**
- ❌ No "import from URL" features
- ❌ No CSV/JSON/XML remote loaders
- ❌ No RSS/Atom feed readers
- ❌ No data synchronization endpoints
- ❌ No configuration file fetchers
- ❌ No bulk import functionality

**Data Loading:**
- ✅ Only startup data seeding from hardcoded values (main.py:64-88)
- ✅ No user-controllable data import

**Verdict:** No data import SSRF attack surface.

### Package/Plugin/Theme Installers

**FINDING: NO plugin or package installation functionality**

**Analysis:**
- Application has no plugin architecture
- ❌ No "install from URL" features
- ❌ No package managers
- ❌ No theme installers
- ❌ No update mechanisms
- ❌ No dependency resolution from external repos

**Verdict:** No plugin installation SSRF attack surface.

### Monitoring & Health Check Frameworks

**FINDING: 1 health check endpoint (NO SSRF RISK)**

**Health Check Analysis:**

**Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py:144-146`
```python
@app.get("/ping")
def ping():
    return {"ping": "pong"}
```

**Assessment:**
- **Functionality:** Returns static JSON response
- **External Requests:** None
- **User Input:** None
- **Docker Integration:** Used by health check (Dockerfile:17-18)
- **SSRF Risk:** NONE - no outbound requests

**Monitoring Services:**
- ❌ No URL pinging functionality
- ❌ No uptime checkers
- ❌ No external monitoring integrations
- ❌ No alerting webhooks

**Verdict:** Health check endpoint does not create SSRF attack surface.

### Cloud Metadata Helpers

**FINDING: NO cloud metadata access**

**Analysis:**
- ❌ No AWS instance metadata calls (169.254.169.254)
- ❌ No GCP metadata server access
- ❌ No Azure instance metadata service calls
- ❌ No cloud service discovery
- ❌ No container orchestration API clients
- ❌ No Kubernetes API access

**Verdict:** No cloud metadata SSRF attack surface.

### SSRF Summary

**Total SSRF Sinks Found: 0**

**Breakdown by Category:**
- HTTP/HTTPS requests: 0
- URL openers (user-controllable): 0
- Open redirects: 0
- Webhooks/callbacks: 0
- External APIs: 0
- Media processors: 0
- Socket operations: 0
- Headless browsers: 0
- Link unfurlers: 0
- OIDC/JWKS fetchers: 0
- Data importers: 0
- Plugin installers: 0
- Monitoring/health checks: 0 (internal only)
- Cloud metadata: 0

**Files Analyzed:**
```
/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/main.py (206 lines)
/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/crud.py (45 lines)
/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/models.py (25 lines)
/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/schemas.py (47 lines)
/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-005-24/app/database.py (11 lines)
```

**Unused Dependencies:**
- `httpx==0.27.0` - **Recommendation:** Remove from requirements.txt (not used)

### Conclusion

The application has **zero SSRF attack surface** in network-accessible endpoints. It is a **purely internal application** that interacts only with its local SQLite database and renders HTML templates. There are no outbound network requests, no URL fetching capabilities, and no external service integrations. The application's isolation from external resources eliminates entire classes of SSRF vulnerabilities.

**Security Posture:** STRONG (for SSRF) - No SSRF attack vectors identified. If future functionality requires outbound requests, implement strict controls:
- Allowlist permitted domains
- Block internal IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254)
- Validate URL schemes (allow only http/https)
- Implement request timeouts
- Use dedicated egress network interfaces

---

**END OF CODE ANALYSIS REPORT**