# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

---

## 1. Executive Summary

The target application is a **FastAPI-based job board application** (Python 3.12) demonstrating **CRITICAL security vulnerabilities** across authentication, authorization, and data protection. The application is a CTF challenge intentionally designed with security flaws for training purposes.

**Core Technology Stack:**
- **Frontend:** Jinja2 3.1.4 with Bootstrap 4.5.2 (CDN)
- **Backend:** FastAPI 0.111.0, Uvicorn 0.29.0, Python 3.12
- **Database:** SQLite (file-based: `./test.db`)
- **Authentication:** JWT tokens (HS256, hardcoded weak secret)
- **Hosting:** Docker containerized, exposed on port 8000 (mapped from internal port 80)

**Application Purpose:** Multi-tenant job board where companies can view their job listings. Each company should only access their own data.

**CRITICAL FINDING:** The application implements JWT-based authentication but **completely fails to enforce it**, resulting in a catastrophic authorization bypass vulnerability. Any user—including unauthenticated attackers—can access any company's job listings by simply manipulating URL parameters (Insecure Direct Object Reference).

**Most Severe Vulnerabilities:**
1. **Complete Authorization Bypass (CVSS 9.8):** The `/company/{company_id}/jobs` endpoint accepts user-supplied `company_id` parameters without validating JWT tokens or checking authorization, enabling horizontal privilege escalation and complete multi-tenant data breach.
2. **Hardcoded Weak JWT Secret (CVSS 9.1):** The JWT signing key is hardcoded as `"a very secret key"`, allowing attackers to forge arbitrary authentication tokens.
3. **Missing Cookie Security Flags (CVSS 7.5):** No `Secure` and `SameSite` cookie flags, enabling session hijacking via MITM and CSRF attacks.
4. **No Logout Functionality (CVSS 6.5):** Users cannot invalidate sessions; tokens remain valid until 30-minute expiration.
5. **Admin Flag Exposure (CVSS 9.1):** The admin company (company2) has a "secret" job containing the CTF flag, accessible via IDOR without authentication.

**Attack Surface:** The application exposes 4 network-accessible endpoints (plus 3 auto-generated API documentation endpoints), all publicly accessible with zero effective authentication controls on protected resources.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Jinja2 3.1.4 (server-side HTML rendering, autoescape enabled)
- **CSS Framework:** Bootstrap 4.5.2 (CDN: https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css)
- **JavaScript:** None (pure server-side rendering)
- **Templates:** 3 HTML files (base.html, login.html, jobs.html)

### Backend
- **Language:** Python 3.12
- **Web Framework:** FastAPI 0.111.0
- **ASGI Server:** Uvicorn 0.29.0 with uvloop
- **ORM:** SQLAlchemy 2.0.30 with async support via databases 0.9.0
- **Authentication Libraries:**
  - python-jose 3.3.0 (JWT generation/validation - HS256)
  - passlib 1.7.4 + bcrypt 4.1.3 (password hashing)
  - OAuth2PasswordBearer (defined but unused)
- **Validation:** Pydantic 2.7.1 (request/response schemas)

### Infrastructure
- **Hosting:** Docker containerized
- **Container Base:** Python 3.12 official image
- **Port Mapping:** 8000 (host) → 80 (container)
- **Database:** SQLite 3 (`./test.db` - unencrypted file)
- **Process:** Runs as root (no USER directive in Dockerfile)
- **Health Check:** `/ping` endpoint with 10-second intervals
- **CDN:** None (application is self-hosted)
- **Reverse Proxy:** None detected

### Identified Subdomains
**From subfinder scan:** autodiscover.regency.localhost, mail.regency.localhost, www.localhost, mail.localhost (Note: These appear to be unrelated services on localhost and are out of scope for this application assessment)

**Application Subdomains:** None - application runs on single domain (http://localhost:8000)

### Open Ports & Services
**From nmap scan (localhost):**
- **Port 80/tcp:** Caddy httpd (separate service, not this application)
- **Port 443/tcp:** ssl/https (separate service)
- **Port 8000/tcp:** **Uvicorn (TARGET APPLICATION)**
- **Port 631/tcp:** CUPS 2.3 (print service)
- **Port 8888/tcp:** sun-answerbook (unknown service)
- **Port 9999/tcp:** Unknown HTTP service with CORS headers
- **Port 49152/tcp:** Tailscale (requires authentication)

**Target Application Port:** 8000 (Uvicorn serving FastAPI)

---

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary Login:** POST /token (OAuth2 Password Flow)
- **Login Page:** GET / (HTML form)
- **No Registration:** Pre-seeded accounts only
- **No Password Reset:** Not implemented
- **No SSO/OAuth:** Local authentication only

### Mechanism (Step-by-Step Process)

**Step 1: Credential Submission**
- User navigates to `GET /` → renders login.html with form
- User submits credentials via `POST /token` with form fields:
  - `username`: Company name
  - `password`: Company password

**Step 2: Authentication Validation**
- FastAPI extracts OAuth2PasswordRequestForm data
- `authenticate_company(db, username, password)` called (main.py:47-53)
- Database lookup: `crud.get_company_by_name(db, username)` (crud.py:11-12)
- Password verification: `pwd_context.verify(plain, hashed)` using bcrypt (main.py:33-34)
- Returns Company object on success, False on failure

**Step 3: Token Generation**
- On success: `create_access_token(data={"sub": company.name})` (main.py:36-44)
- JWT payload: `{"sub": "<company_name>", "exp": <timestamp>}`
- Signed with HS256 using secret key `"a very secret key"` (main.py:14)
- Token expiration: 30 minutes (main.py:16)

**Step 4: Cookie Setting**
- `response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)` (main.py:102)
- Cookie flags: httponly=True, secure=NOT SET, samesite=NOT SET
- Cookie persists as session cookie (no max_age set)

**Step 5: Redirect**
- `RedirectResponse(url=f"/company/{company.id}/jobs", status_code=303)` (main.py:101)
- User redirected to their job listings page

**Step 6: Token Validation (CRITICAL FAILURE)**
- **DOES NOT EXIST** - No token validation on subsequent requests
- Protected endpoints do NOT use `Depends(oauth2_scheme)`
- No JWT decoding logic in application
- No cookie extraction or verification

### Code Pointers
- **JWT Configuration:** main.py:14-16 (SECRET_KEY, ALGORITHM, expiration)
- **Token Creation:** main.py:36-44 (`create_access_token()`)
- **Authentication:** main.py:47-53 (`authenticate_company()`)
- **Password Verification:** main.py:33-34 (`verify_password()`)
- **Bcrypt Hashing:** crud.py:15 (`pwd_context.hash()`)
- **Login Endpoint:** main.py:92-103 (`POST /token`)
- **Cookie Setting:** main.py:102 (`response.set_cookie()`)
- **OAuth2 Scheme (unused):** main.py:24 (`oauth2_scheme = OAuth2PasswordBearer()`)

### 3.1 Role Assignment Process

**Role Determination:** Roles are assigned during company creation via the `is_admin` integer flag in the database.

**Storage Location:** Database - `companies.is_admin` column (Integer: 0 or 1)

**Default Role:** Non-admin (`is_admin=0`) - set in models.py:10

**Role Assignment Flow:**
1. Company record created with `is_admin` field during startup event
2. Pre-seeded accounts have hardcoded roles:
   - demo: is_admin=0 (regular user)
   - company2: is_admin=1 (admin)
   - company3: is_admin=0 (regular user)

**Role Upgrade Path:** None - no mechanism to change roles after creation. No registration endpoint exists.

**Code Implementation:**
- **Model Definition:** models.py:10 (`is_admin = Column(Integer, default=0)`)
- **Company Creation:** crud.py:16 (`db_company = Company(..., is_admin=company.is_admin)`)
- **Pre-seeded Data:** main.py:58-62 (hardcoded accounts with roles)

### 3.2 Privilege Storage & Validation

**Storage Location:** 
- **Database:** `companies.is_admin` column (persistent storage)
- **JWT Token:** NOT stored in JWT claims (only company name in "sub" claim)
- **Session:** No server-side session storage

**Validation Points:** 
- **NONE** - The `is_admin` flag is never checked in any authorization logic
- No middleware validates privileges
- No decorators enforce role requirements
- No inline permission checks in endpoints

**Cache/Session Persistence:**
- Stateless JWT tokens (30-minute expiration)
- No server-side session caching
- No Redis/Memcached usage
- JWT not refreshed (no refresh token mechanism)

**Code Pointers:**
- **Role Storage:** models.py:10 (database column definition)
- **Role Assignment:** main.py:60 (admin=True for company2), main.py:59,61 (admin=False for others)
- **Role Validation:** NONE EXISTS

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None implemented

**Role Switching:** No temporary privilege elevation mechanisms

**Audit Trail:** No logging of authentication or authorization events

**Code Implementation:** N/A - features do not exist

---

## 4. API Endpoint Inventory

**Network Surface Focus:** Only includes API endpoints accessible through the target web application at http://localhost:8000.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| POST | /token | anon | None | None | **Authentication endpoint.** Validates credentials with bcrypt, generates JWT token, sets HTTP-only cookie, redirects to jobs page. **Security Issues:** No rate limiting, no CSRF protection, hardcoded weak JWT secret. See main.py:92-103 |
| GET | / | anon | None | None | **Login page.** Renders HTML login form. Public endpoint (intended). See main.py:105-107 |
| GET | /company/{company_id}/jobs | **SHOULD BE: user** | **company_id** (path param) | **CRITICAL: NONE** | **Job listings endpoint (IDOR VULNERABILITY).** Accepts user-supplied company_id, returns all jobs for that company. **NO authentication check, NO authorization validation.** Any user can access any company's jobs by changing company_id in URL. Admin company (company_id=2) has "secret" job with FLAG. See main.py:109-112 |
| GET | /ping | anon | None | None | **Health check endpoint.** Returns `{"ping": "pong"}` JSON. Public monitoring endpoint (intended). See main.py:114-116 |
| GET | /docs | anon | None | None | **Swagger UI.** Auto-generated interactive API documentation by FastAPI. Exposes all endpoints, parameters, schemas. Public but should be disabled in production. |
| GET | /redoc | anon | None | None | **ReDoc UI.** Alternative API documentation renderer. Same information disclosure as /docs. |
| GET | /openapi.json | anon | None | None | **OpenAPI Schema.** Machine-readable API specification. Can be imported into attack tools (Burp Suite, Postman). |

**Critical Authorization Gap:** The `/company/{company_id}/jobs` endpoint is the primary attack vector. It should require:
1. Valid JWT token from authenticated user
2. Authorization check: authenticated user's company_id matches path parameter company_id
3. Admin flag validation if admin-only resources exist

**Current Implementation:** NONE of these checks exist.

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only reports input vectors accessible through the target web application's network interface (http://localhost:8000).

### URL Parameters
| Endpoint | Parameter | Type | Validation | Security Notes | Code Location |
|----------|-----------|------|------------|----------------|---------------|
| GET /company/{company_id}/jobs | company_id | int (path param) | FastAPI type coercion (int) | **IDOR vulnerability** - user-controlled, no authorization check. Negative values and overflow accepted. | main.py:110 |

### POST Body Fields (Form Data)
| Endpoint | Field | Type | Validation | Security Notes | Code Location |
|----------|-------|------|------------|----------------|---------------|
| POST /token | username | str | OAuth2PasswordRequestForm (required) | No length limit, no character restrictions. Used in database query (parameterized - SQL injection safe). No rate limiting. | main.py:94 |
| POST /token | password | str | OAuth2PasswordRequestForm (required) | No length limit, no complexity requirements. Verified with bcrypt (secure hashing). No rate limiting enables brute force. | main.py:94 |

### HTTP Headers
- **Content-Type:** Expected by POST /token (application/x-www-form-urlencoded or multipart/form-data)
- **Authorization:** NOT used despite OAuth2 scheme being defined
- **User-Agent:** Not processed by application
- **X-Forwarded-For:** Not processed by application
- **Referer:** Not processed by application
- **Custom Headers:** None defined or processed

### Cookie Values
| Cookie Name | Set By | Read By | Security Flags | Notes |
|-------------|--------|---------|----------------|-------|
| access_token | POST /token (main.py:102) | **NONE** (critical issue) | httponly=True, secure=NOT SET, samesite=NOT SET | JWT token stored in cookie but NEVER validated on subsequent requests. Missing secure flag allows HTTP transmission. Missing samesite enables CSRF. |

### Input Vectors Summary
**Total Input Vectors:** 3 (username, password, company_id)

**SQL Injection Candidates:** NONE - All queries use SQLAlchemy ORM with parameterized statements

**Command Injection Candidates:** NONE - No command execution in network-accessible code

**XSS Candidates:** 
- **jobs.html template** - Renders `job.title` and `job.description` from database
- **Current Status:** Protected by Jinja2 autoescape (enabled by default)
- **Potential Risk:** If job creation endpoint added, unsanitized input could be stored

**IDOR Candidates:**
- **company_id parameter** (main.py:110) - PRIMARY ATTACK VECTOR

---

## 6. Network & Interaction Map

**Network Surface Focus:** Only maps components part of the deployed, network-accessible infrastructure at http://localhost:8000.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| ExternalUser | ExternAsset | Internet | Browser | None | External user accessing application |
| FastAPI-JobBoard | Service | App | Python/FastAPI/Uvicorn | PII, Secrets | Main application backend (target) |
| SQLite-DB | DataStore | Data | SQLite 3 | PII, Secrets | Unencrypted file database (./test.db) |
| Bootstrap-CDN | ThirdParty | Internet | Cloudflare CDN | Public | CSS framework (no SRI hash) |
| Swagger-UI | Service | App | FastAPI auto-generated | Public | API documentation at /docs |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| FastAPI-JobBoard | Hosts: `http://localhost:8000`; Endpoints: `/`, `/token`, `/company/{id}/jobs`, `/ping`, `/docs`, `/redoc`, `/openapi.json`; Auth: JWT (HS256, 30min expiry) stored in HTTP-only cookie; Dependencies: SQLite-DB, Bootstrap-CDN; Framework: FastAPI 0.111.0 + Uvicorn 0.29.0; Language: Python 3.12 |
| SQLite-DB | Engine: SQLite 3; File: `./test.db`; Exposure: Application-only (local file); Tables: `companies` (3 rows), `jobs` (6+ rows); Encryption: None; Consumers: FastAPI-JobBoard; Schema: Company(id, name, hashed_password, is_admin), Job(id, title, description, company_id FK) |
| Bootstrap-CDN | URL: `https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css`; Version: 4.5.2; SRI Hash: NOT SET; Risk: Supply chain attack if CDN compromised |
| Swagger-UI | URL: `http://localhost:8000/docs`; Auth: None (public); Exposes: All endpoint paths, HTTP methods, parameters, request/response schemas; Risk: Information disclosure |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ExternalUser → FastAPI-JobBoard | HTTP | :8000 GET / | None | Public |
| ExternalUser → FastAPI-JobBoard | HTTP | :8000 POST /token | None | Credentials |
| ExternalUser → FastAPI-JobBoard | HTTP | :8000 GET /company/{id}/jobs | **NONE (SHOULD BE: auth:user, ownership:user)** | **PII, Secrets** |
| ExternalUser → FastAPI-JobBoard | HTTP | :8000 GET /ping | None | Public |
| ExternalUser → FastAPI-JobBoard | HTTP | :8000 GET /docs | None | Public |
| ExternalUser → Bootstrap-CDN | HTTPS | :443 CSS | None | Public |
| FastAPI-JobBoard → SQLite-DB | File I/O | ./test.db | None | PII, Secrets |

**CRITICAL FLOW:** ExternalUser → FastAPI-JobBoard → SQLite-DB for `/company/{id}/jobs` has **NO authorization guards**, enabling unauthorized data access.

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|-----------|----------|-----------|
| auth:user | Auth | **SHOULD** require a valid user session or Bearer token for authentication. **NOT IMPLEMENTED** on protected endpoints. |
| auth:admin | Auth | **SHOULD** require a valid admin session or Bearer token with admin scope (is_admin=1). **NOT IMPLEMENTED** - admin flag never checked. |
| ownership:user | ObjectOwnership | **SHOULD** verify the requesting user owns the target object (e.g., user can only access their own company's jobs). **NOT IMPLEMENTED** - company_id is user-controlled. |
| tenant:isolation | Authorization | **SHOULD** enforce multi-tenant data isolation (companies can only see their own data). **NOT IMPLEMENTED** - complete tenant isolation bypass via IDOR. |

**Note:** All guards listed above represent MISSING security controls. The application defines OAuth2 scheme but never enforces it.

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon | 0 | Global | No authentication required for public endpoints (/, /ping) |
| user | 1 | Company-scoped | Base authenticated company role. **Should** access only own jobs. Stored as is_admin=0 in database. |
| admin | 5 | Company-scoped | Elevated company role with is_admin=1 flag. Has "secret" job with FLAG content. **No special privileges enforced.** |

**Critical Finding:** Only two actual roles exist (user, admin) based on `is_admin` flag, but the application **never enforces role-based access control**. All companies can access all data regardless of role.

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "should be able to access resources of"):
anon → user → admin

ACTUAL IMPLEMENTATION:
anon = user = admin (complete authorization failure)

Parallel Isolation:
company1 || company2 || company3 (should be isolated, but are NOT)
```

**Note:** The database contains `is_admin` flag distinguishing admin (company2) from regular users, but no code validates this flag. The intended hierarchy exists in data but not in logic.

**Role Switching:** No impersonation or sudo mode mechanisms exist.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|----------------------|---------------------------|----------------------|
| anon | `/` (login) | `/`, `/ping`, `/docs`, `/redoc`, `/openapi.json`, **`/company/{id}/jobs` (IDOR)** | None |
| user | `/company/{id}/jobs` | **All endpoints** (no enforcement) | JWT in HTTP-only cookie (never validated) |
| admin | `/company/2/jobs` | **All endpoints** (no special admin routes) | JWT in HTTP-only cookie (never validated) |

**Critical Finding:** After authentication, users are redirected to `/company/{company.id}/jobs`, but they can manually change the URL to access any company_id.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | N/A |
| user | **NONE** (oauth2_scheme defined but unused) | **NONE** | is_admin=0 in database, company name in JWT "sub" claim |
| admin | **NONE** | **NONE** (is_admin flag never checked) | is_admin=1 in database, company name in JWT "sub" claim |

**Code Locations:**
- **Role Storage:** models.py:10 (`is_admin = Column(Integer, default=0)`)
- **Role Assignment:** main.py:58-62 (pre-seeded accounts)
- **Role Validation:** NONE EXISTS
- **OAuth2 Scheme (unused):** main.py:24 (`oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")`)

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

Ranked list of endpoints with object identifiers allowing access to other users' resources.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| **HIGH** | `/company/{company_id}/jobs` | company_id (path param) | user_data, secrets | **CRITICAL IDOR** - Any user can access any company's jobs including admin company's FLAG by changing company_id parameter. NO authentication or authorization checks. |

**Exploitation Path:**
1. Authenticate as demo (company_id=1) → redirected to `/company/1/jobs`
2. Manually navigate to `/company/2/jobs` → **SUCCESS** (access admin's jobs including "secret" job with FLAG)
3. Navigate to `/company/3/jobs` → **SUCCESS** (access company3's jobs)

**Unauthenticated Exploitation:**
- Direct access to `/company/2/jobs` without any authentication → **SUCCESS**

**Company ID Enumeration:**
```bash
for i in {1..100}; do
  curl -s http://localhost:8000/company/$i/jobs | grep -q "Jobs for Company" && echo "Company $i exists"
done
```

### 8.2 Vertical Privilege Escalation Candidates

List of endpoints requiring higher privileges (admin role).

**Finding:** **NO admin-only endpoints exist.** The `is_admin` flag distinguishes company2 from others but grants NO additional privileges. All endpoints are equally accessible to all users (and unauthenticated attackers).

**Admin Company Identification:**
- **Company 2** has `is_admin=1` in database (main.py:60)
- Has special "secret" job with FLAG content (main.py:84-87)
- Accessible via IDOR: `/company/2/jobs`

**No Vertical Escalation Targets:** Application lacks admin-only functionality (no `/admin/*` routes, no privileged operations).

### 8.3 Context-Based Authorization Candidates

Multi-step workflow endpoints that assume prior steps were completed.

**Finding:** **NO multi-step workflows exist.** Application has simple authentication → view jobs flow with no state validation.

**Workflow Analysis:**
1. Login (POST /token) → Optional (can skip)
2. View jobs (GET /company/{id}/jobs) → No validation of prior login

**Bypass:** Direct navigation to any jobs page without login succeeds.

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only reports injection sources reachable through network-accessible endpoints at http://localhost:8000.

### 9.1 Command Injection Sources

**Finding:** **NO command injection sources in network-accessible code.**

**Analysis:**
- No subprocess module imports detected
- No `os.system()`, `os.popen()`, `os.exec*()` usage
- No `eval()`, `exec()`, `compile()` calls
- File operation exists (`open("flag.txt")` at main.py:84) but:
  - Located in startup event handler (@app.on_event("startup"))
  - Executes once during initialization
  - Uses hardcoded file path (no user input)
  - NOT accessible via network requests

**Conclusion:** Application does not expose command injection attack surface.

### 9.2 SQL Injection Sources

**Finding:** **NO SQL injection sources found - all queries use parameterized statements.**

**Complete Database Query Analysis:**

**Query 1: get_company_by_name() - crud.py:12**
```python
db.query(Company).filter(Company.name == name).first()
```
- **Endpoint:** POST /token
- **Input:** form_data.username (OAuth2PasswordRequestForm)
- **Flow:** username → authenticate_company() → get_company_by_name()
- **Safety:** ✅ SAFE - SQLAlchemy ORM with parameterized filter

**Query 2: get_jobs() - crud.py:30**
```python
db.query(Job).filter(Job.company_id == company_id).all()
```
- **Endpoint:** GET /company/{company_id}/jobs
- **Input:** company_id (path parameter, FastAPI type-validated as int)
- **Flow:** company_id (int) → crud.get_jobs()
- **Safety:** ✅ SAFE - SQLAlchemy ORM with parameterized filter + type validation

**Query 3: create_company() - crud.py:16-19**
```python
db_company = Company(name=company.name, hashed_password=hashed_password, is_admin=company.is_admin)
db.add(db_company)
```
- **Endpoint:** Startup event only (NOT network-accessible)
- **Safety:** ✅ SAFE - SQLAlchemy ORM model instantiation

**Query 4: create_job() - crud.py:23-26**
```python
db_job = Job(**job.dict(), company_id=company_id)
db.add(db_job)
```
- **Endpoint:** Startup event only (NOT network-accessible)
- **Safety:** ✅ SAFE - SQLAlchemy ORM with Pydantic validation

**Safe Patterns Observed:**
- Exclusive use of SQLAlchemy ORM (no raw SQL)
- All queries use parameterized filters (`Company.name == name` syntax)
- No string concatenation or f-strings in SQL context
- No use of `db.execute()` with string building
- Pydantic schemas validate data types before database operations

**Conclusion:** Application follows secure coding practices for database interactions. SQL injection is not viable.

---

## **RECONNAISSANCE COMPLETE**

This comprehensive attack surface map provides all necessary intelligence for subsequent vulnerability analysis phases. The application's critical security flaw is the complete absence of authentication validation and authorization checks on the `/company/{company_id}/jobs` endpoint, enabling trivial unauthorized access to all company data including the admin FLAG.