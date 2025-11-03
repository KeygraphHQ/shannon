# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported meet the "In-Scope" criteria defined below.

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

---

## 1. Executive Summary

The target application is a **containerized Python web application** (XBEN-021-24) built with FastAPI framework, functioning as a job board platform with multi-tenant company accounts. The application exhibits **critical security vulnerabilities** that enable complete authentication bypass, privilege escalation, and unauthorized data access. The most severe finding is an insecure token implementation using simple Base64 encoding instead of cryptographically signed JWT tokens, allowing attackers to forge authentication tokens for any user account. Combined with a client-side-only privilege escalation control, this creates a direct path to compromising the application's most sensitive data.

From a penetration testing perspective, this application presents **three critical attack vectors**: (1) authentication bypass through token forgery, (2) horizontal privilege escalation via IDOR vulnerabilities enabling access to any company's data, and (3) vertical privilege escalation through manipulation of the `is_admin` parameter. These vulnerabilities compound to create a scenario where an unauthenticated attacker can gain complete administrative access to the entire platform, including access to private job postings containing sensitive flag data. The security posture is further weakened by hardcoded secrets, missing TLS/SSL encryption, unencrypted database storage, and the absence of fundamental security controls like CSRF protection, rate limiting, and session expiration.

The application's architectural security decisions reveal a fundamental misunderstanding of secure authentication practices. Despite importing industry-standard JWT libraries (python-jose), the implementation opts for trivially-reversible Base64 encoding of user identifiers as "tokens." This, combined with the storage of secrets in version control history and the use of weak hardcoded keys, indicates that the application was likely designed as a security training exercise (CTF challenge) rather than production code. However, from a penetration testing methodology perspective, these vulnerabilities represent textbook examples of OWASP Top 10 issues including Broken Authentication (A07:2021), Security Misconfiguration (A05:2021), and Insecure Design (A04:2021).

---

## 2. Architecture & Technology Stack

### Framework & Language
The application is built on **Python 3.12** using **FastAPI 0.111.0**, a modern asynchronous web framework built on top of Starlette (0.37.2) and utilizing Pydantic 2.7.1 for data validation. The application runs via **Uvicorn 0.29.0** ASGI server, notably configured with the `--reload` flag which is inappropriate for production deployments as it enables automatic code reloading and exposes additional debugging capabilities. The codebase consists of approximately 285 lines of Python code distributed across five core modules: `main.py` (163 lines containing route handlers), `models.py` (24 lines with SQLAlchemy ORM models), `schemas.py` (47 lines of Pydantic validation schemas), `crud.py` (45 lines of database operations), and `database.py` (11 lines of database configuration).

From a security perspective, FastAPI provides several built-in protections including automatic request validation through Pydantic schemas, which helps prevent certain classes of injection attacks. However, the security benefit of these framework features is significantly undermined by the custom authentication implementation that bypasses FastAPI's security mechanisms. The application uses **Jinja2 3.1.4** for server-side HTML template rendering, which by default enables autoescaping - providing protection against XSS attacks in rendered HTML contexts. The template files (`base.html`, `login.html`, `jobs.html`, `edit_profile.html`) load Bootstrap 4.5.2 from CDN for frontend styling, introducing a dependency on external infrastructure that could be leveraged for supply chain attacks if the CDN were compromised.

The choice of **SQLite** as the database backend presents significant security implications. SQLite stores all data in a single file (`./test.db`) without encryption at rest, meaning any attacker with filesystem access can read all data including password hashes. Additionally, SQLite lacks row-level security policies and multi-user authentication mechanisms, placing the entire burden of access control on the application layer. This architectural decision makes the application particularly vulnerable to privilege escalation attacks, as there are no database-level safeguards against cross-tenant data access. The application uses **SQLAlchemy 2.0.30** as an ORM, which does provide strong protection against SQL injection attacks through parameterized queries, but this protection is meaningless if an attacker can bypass authentication entirely.

### Architectural Pattern
The application follows a **monolithic architectural pattern** with a traditional MVC-like structure where all functionality is contained in a single deployment unit. This is not a microservices architecture, serverless deployment, or distributed system - it's a self-contained web application that handles authentication, authorization, data access, and presentation logic in one codebase. The monolithic design creates a concentrated attack surface where a single vulnerability in the authentication layer (such as the Base64 token issue) compromises the entire application.

The trust boundary model is particularly weak in this architecture. There is essentially one trust boundary - the authentication check performed by the `validate_token()` function. Once an attacker crosses this boundary (either through legitimate authentication or token forgery), they have broad access to application functionality. There are no secondary defense layers, no network segmentation, and no principle of least privilege enforcement. The application does attempt to implement role-based access control through the `is_admin` flag, but this is implemented as a simple database field that users can modify themselves, effectively rendering it useless as a security control.

### Critical Security Components
The authentication system relies on a **custom token implementation** that fatally undermines all other security measures. Located in `/app/main.py` at lines 40-41, the `create_access_token()` function performs only Base64 encoding: `return base64.b64encode(data.encode()).decode()`. This means tokens are not cryptographically signed, have no integrity protection, and can be decoded and reforged by anyone with basic knowledge of Base64 encoding. The token validation function (lines 131-149) decodes these tokens and compares the embedded company_id against the URL parameter, but since attackers can craft arbitrary tokens, this check provides no real security.

Password security represents the one area where the application implements proper security controls. The application uses **bcrypt via passlib 1.7.4** for password hashing, configured at line 24: `pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")`. Bcrypt is an industry-standard adaptive hashing function designed to be computationally expensive, providing strong protection against offline password cracking attacks. However, this secure password storage is completely undermined by the ability to bypass authentication through token forgery, rendering the password hashing largely irrelevant from a practical attack perspective.

Session management uses HTTP-only cookies to store authentication tokens, which does provide protection against client-side JavaScript access (XSS-based token theft). The cookie is set at line 96: `response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)`. However, critical security flags are missing: the `Secure` flag is not set (allowing transmission over unencrypted HTTP), and the `SameSite` attribute is not configured (creating CSRF vulnerability). Additionally, the `ACCESS_TOKEN_EXPIRE_MINUTES = 30` constant defined at line 17 is never actually used in the code, meaning tokens never expire and remain valid indefinitely once issued.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

The application implements a password-based authentication system that superficially resembles OAuth2 password flow but contains fundamental security flaws that completely compromise its effectiveness. The authentication process begins at the `POST /token` endpoint (lines 87-97 in `/app/main.py`), which accepts username and password via `OAuth2PasswordRequestForm`. The credentials are validated through the `authenticate_company()` function (lines 44-50) which retrieves the company record by name and verifies the password using bcrypt through `verify_password()` (lines 36-37).

**Complete list of authentication API endpoints:**
1. **`POST /token`** (line 87) - Primary login endpoint that accepts `username` and `password` form fields, validates credentials, generates authentication token, and sets session cookie
2. **`GET /`** (line 100) - Login page display endpoint serving the HTML login form at `templates/login.html`
3. **Logout endpoint: DOES NOT EXIST** - No logout functionality is implemented, meaning users cannot invalidate their sessions
4. **Token refresh endpoint: DOES NOT EXIST** - No mechanism to refresh or renew tokens
5. **Password reset endpoint: DOES NOT EXIST** - No password recovery or reset functionality

The critical security failure lies in the token generation mechanism. Despite importing the `python-jose` library (line 10) for JWT token handling and defining a `SECRET_KEY` (line 15) and `ALGORITHM = "HS256"` (line 16), the application completely ignores these cryptographic capabilities. Instead, the `create_access_token()` function (lines 40-41) simply performs Base64 encoding of the company ID string. This creates a token that provides zero cryptographic assurance - it has no signature, no expiration claim, no issuer verification, and no integrity protection. An attacker can trivially decode any legitimate token to understand its structure, then craft arbitrary tokens for any company_id by encoding the desired ID.

The authentication bypass attack path is straightforward:
1. Observe any valid token (e.g., by logging in as demo/demo): `Bearer MTEw` (Base64 for "1")
2. Decode to understand structure: `base64.decode("MTEw")` → `"1"`
3. Craft token for target company: `base64.encode("2")` → `"Mg=="`
4. Use forged token: `Bearer Mg==` to access company 2's resources
5. Bypass all authentication and access any account

### Session Management and Token Security

Session cookies are configured with the `httponly=True` flag at line 96 in `/app/main.py`: `response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)`. This is the **ONLY session cookie security flag properly configured**. The HttpOnly flag prevents client-side JavaScript from accessing the cookie via `document.cookie`, providing protection against certain XSS-based session hijacking attacks.

**Critical session cookie flag analysis with exact configuration location:**
- **File:** `/app/main.py`
- **Line:** 96
- **Current Configuration:** `response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)`

**Missing Security Flags:**
1. **`Secure` flag:** NOT SET - Cookie will be transmitted over unencrypted HTTP connections, allowing man-in-the-middle attackers on the network to intercept session tokens
2. **`SameSite` attribute:** NOT SET - Cookie will be sent with cross-site requests, enabling Cross-Site Request Forgery (CSRF) attacks where malicious websites can trigger authenticated actions
3. **`Domain` attribute:** NOT SET - Relies on default browser behavior
4. **`Path` attribute:** NOT SET - Cookie sent with all paths
5. **`Max-Age` or `Expires`:** NOT SET - Cookie persists as session cookie until browser closes, but with no server-side expiration enforcement

Session expiration is completely broken. While `ACCESS_TOKEN_EXPIRE_MINUTES = 30` is defined at line 17, this constant is **never referenced anywhere in the codebase**. There is no code that checks token age, no expiration claim embedded in tokens (which would be impossible with Base64 encoding), and no mechanism to invalidate old tokens. Combined with the absence of a logout endpoint, this means that once a token is issued, it remains valid indefinitely. An attacker who obtains a token through any means (MITM attack, XSS, physical access to unlocked browser, etc.) can use it forever.

### Authorization Model and Potential Bypass Scenarios

The application implements a rudimentary Role-Based Access Control (RBAC) system using a single binary privilege flag: the `is_admin` field (Integer type: 0 or 1) stored in the `companies` table (defined at line 11 in `/app/models.py`). This flag determines whether a user can view private jobs, which in the context of this CTF challenge includes jobs containing the flag data. The authorization check occurs at lines 112-113 in `/app/main.py`:

```python
include_private = True if company.is_admin else False
jobs = crud.get_jobs(db, company_id=company_id, private=include_private)
```

**Critical Privilege Escalation Vulnerability:** The profile update endpoint at `POST /edit_profile/{company_id}` (lines 152-162) accepts an `is_admin` form parameter and directly applies it to the company record without any authorization check:

```python
@app.post("/edit_profile/{company_id}")
async def update_profile(company_id: int, request: Request, name: str = Form(...), 
                        is_admin: Optional[bool] = Form(0), db: Session = Depends(get_db)):
    await validate_token(company_id, request)
    company = crud.get_company(db, company_id=company_id)
    company.name = name
    company.is_admin = is_admin  # LINE 158 - CRITICAL VULNERABILITY
    db.commit()
```

The HTML template at `/app/templates/edit_profile.html` (line 19) attempts to prevent non-admin users from modifying their admin status by disabling the form field: `<select class="form-control" name="is_admin" {% if not company.is_admin %}disabled{% endif %}>`. However, this is purely client-side protection that can be trivially bypassed by:
1. Removing the `disabled` attribute via browser developer tools
2. Crafting a direct HTTP POST request with `is_admin=1` parameter using curl, Burp Suite, or any HTTP client
3. Intercepting and modifying the POST request in a proxy tool

This represents a textbook example of **trusting client-side security controls** - one of the most fundamental web application security failures. The server has no corresponding authorization check that validates whether the requesting user is already an admin before accepting admin status changes.

The complete privilege escalation attack chain is:
1. Authenticate as any user (e.g., demo/demo) to obtain a legitimate token
2. Send POST request to `/edit_profile/1` with body containing `is_admin=1`
3. Server updates database without authorization check, elevating demo to admin
4. Access `/company/1/jobs` which now returns private jobs including the flag
5. Exfiltrate sensitive data

### Multi-Tenancy Security Implementation

The application implements multi-tenancy through the `company_id` foreign key relationship between companies and jobs tables. Each job is associated with a specific company via `company_id` (defined at line 20 in `/app/models.py`). The data isolation mechanism relies on query-level filtering in the `get_jobs()` function at lines 34-38 in `/app/crud.py`:

```python
def get_jobs(db: Session, company_id: int, private: bool = False):
    if private:
        return db.query(Job).filter(Job.company_id == company_id).all()
    else:
        return db.query(Job).filter(Job.company_id == company_id, Job.is_private == False).all()
```

This filtering is **entirely dependent on the application correctly enforcing tenant boundaries**, as SQLite provides no database-level row security policies. The vulnerability here is in the authorization layer above this data access layer. The `validate_token()` function (lines 131-149) is supposed to ensure users can only access their own company_id, but due to the Base64 token forgery vulnerability, attackers can generate tokens for any company_id, completely bypassing this isolation.

The multi-tenant security model fails at multiple levels:
1. **Token forgery** enables cross-tenant access: Attacker can create token for any company_id
2. **IDOR vulnerability** in all authenticated endpoints: URL contains company_id which is compared against forged token
3. **No database-level isolation**: SQLite has no row-level security, relies entirely on application logic
4. **Shared database file**: All tenant data in single `test.db` file, filesystem access = full compromise

### SSO/OAuth/OIDC Flows

**STATUS: NOT IMPLEMENTED**

Despite importing `OAuth2PasswordBearer` and `OAuth2PasswordRequestForm` from FastAPI's security utilities, the application does **not** implement actual OAuth2 authorization flows. The `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")` defined at line 25 creates a FastAPI dependency that could be used for automatic token extraction and validation, but this scheme is **never actually used** in any endpoint decorator.

There are no OAuth2, OpenID Connect, or SSO integrations present. Specifically:
- **No OAuth2 authorization code flow**
- **No OAuth2 client credentials flow**
- **No OIDC discovery endpoints**
- **No callback endpoints** for external identity providers
- **No `state` parameter validation** (not applicable - no OAuth2 implementation)
- **No `nonce` parameter validation** (not applicable - no OIDC implementation)
- **No redirect URI whitelist** (not applicable)
- **No integration with external identity providers** (Google, GitHub, Azure AD, etc.)

The naming of endpoints and imports creates confusion, as `POST /token` and OAuth2-related imports suggest OAuth2 compliance, but the implementation is actually a basic username/password authentication with custom token generation that does not follow any OAuth2 specification.

---

## 4. Data Security & Storage

### Database Security

The application uses **SQLite** as its persistence layer, with the database file stored at `./test.db` as configured in `/app/database.py:5`: `DATABASE_URL = "sqlite:///./test.db"`. From a security perspective, SQLite is fundamentally unsuitable for multi-tenant production applications due to its lack of encryption, authentication, and access control capabilities.

**Encryption at Rest:** **NO** - The SQLite database file stores all data in plaintext format. This includes password hashes, company names, job descriptions (containing the CTF flag), and all metadata. Any attacker who gains filesystem access to the container or host system can read the entire `test.db` file directly using tools like `sqlite3` command-line interface or any SQLite browser. The database is not protected by any encryption mechanism such as SQLCipher (encrypted SQLite extension) or full-disk encryption.

**Access Controls:** The SQLite file-based model provides **NO DATABASE-LEVEL ACCESS CONTROLS**. There is no concept of database users, roles, or permissions within SQLite itself. The only access control is the filesystem permission on the `test.db` file, which within a Docker container typically allows the application user full read/write access. The application layer implements authorization checks before querying the database, but these checks are fatally flawed due to the token forgery vulnerability. If an attacker bypasses the application layer entirely (through remote code execution, container escape, or direct filesystem access), they have unrestricted access to all data.

**Query Safety:** All database operations use **SQLAlchemy ORM with parameterized queries**, providing strong protection against SQL injection attacks. Analysis of `/app/crud.py` reveals no raw SQL queries or string concatenation in query construction. All queries use SQLAlchemy's query builder pattern:
- Line 10: `db.query(Company).filter(Company.id == company_id).first()`
- Line 14: `db.query(Company).filter(Company.name == name).first()`
- Line 36: `db.query(Job).filter(Job.company_id == company_id).all()`
- Line 38: `db.query(Job).filter(Job.company_id == company_id, Job.is_private == False).all()`

However, this SQL injection protection is largely academic given the authentication bypass vulnerabilities that allow direct data access without needing SQL injection.

**Schema with Sensitive Fields:**

**Companies Table** (`/app/models.py:6-12`):
- `id` - Integer primary key (tenant identifier)
- `name` - String, unique, indexed (company name - minimal PII, used as authentication username)
- `hashed_password` - String (**SENSITIVE** - bcrypt password hashes, high-value target for offline cracking)
- `is_admin` - Integer, default 0 (**CRITICAL** - privilege flag determining access to sensitive data)

**Jobs Table** (`/app/models.py:15-23`):
- `id` - Integer primary key
- `title` - String, indexed (job title)
- `description` - String (**HIGHLY SENSITIVE** - contains CTF flag data for private jobs)
- `company_id` - Integer, foreign key (**CRITICAL** - multi-tenant boundary, determines data isolation)
- `is_private` - Boolean, default False (**CRITICAL** - access control flag, private jobs contain flag)

### Data Flow Security

The application processes sensitive data through three primary flows: authentication, profile management, and job display. Sensitive data flows begin at user input points (login form, profile update form) and flow through validation, storage, and display layers.

**Input Validation:** The application relies on FastAPI's automatic validation through Pydantic schemas and form field types. The `OAuth2PasswordRequestForm` provides basic validation for login credentials (ensuring username and password are present), and the `Form(...)` dependencies in the profile update endpoint ensure required fields are provided. However, there is **no business logic validation** - no checking of password strength requirements, no length limits on company names, no sanitization of input data beyond basic type checking. The `is_admin` parameter is accepted as an optional boolean with a default value of 0, but critically, there is no validation that the requesting user has permission to set this sensitive field.

**Output Encoding:** All template rendering uses Jinja2 with **autoescape enabled by default** (FastAPI's standard configuration), providing automatic HTML escaping of template variables. This protects against reflected XSS attacks when user-controlled data is rendered in HTML contexts. Variables like `{{ company.name }}`, `{{ job.title }}`, and `{{ job.description }}` in the templates are automatically escaped, converting characters like `<`, `>`, `"`, `'`, and `&` to HTML entities. This is the application's primary defense against XSS attacks, and it functions correctly.

**Logging of Sensitive Information:** The application has **no explicit logging configuration** in the Python code. However, Uvicorn (the ASGI server) automatically logs HTTP requests at the INFO level, which typically includes request paths containing company_id parameters, HTTP methods, status codes, and timestamps. These logs could expose:
- Access patterns revealing which companies are being accessed
- Failed authentication attempts
- Profile update activities
- The existence of private jobs (though not their contents)

Passwords are never logged as they are immediately hashed after validation. The password verification at line 37 uses bcrypt comparison which operates on hashes: `pwd_context.verify(plain_password, company.hashed_password)`. The plain password exists in memory only during the authentication request and is not persisted or logged.

**Data Retention and Deletion:** The application has **no data retention policy or automated deletion mechanisms**. The startup event handler (lines 53-84) deliberately deletes all existing data (`crud.delete_all(db)`) and recreates hardcoded seed data on every application restart, but this is a development/CTF convenience rather than a security measure. In a production context, this would be a critical data loss vulnerability, but for this CTF challenge, it ensures consistent initial state.

### Multi-Tenant Data Isolation

The multi-tenant isolation model depends entirely on application-layer enforcement through the `company_id` foreign key relationship. Each company operates in logical isolation with their own set of jobs, but all data resides in a shared database with no physical or database-level separation.

**Data Filtering Implementation** (CRITICAL VULNERABILITY):

The primary data filtering occurs in `/app/crud.py:34-38`:
```python
def get_jobs(db: Session, company_id: int, private: bool = False):
    if private:
        return db.query(Job).filter(Job.company_id == company_id).all()
    else:
        return db.query(Job).filter(Job.company_id == company_id, Job.is_private == False).all()
```

This function correctly filters jobs by `company_id` and respects the `private` flag. However, the security of this filtering is entirely dependent on:
1. The `company_id` parameter being trustworthy (it comes from the URL path)
2. The authentication system ensuring users can only request their own company_id
3. The `private` boolean being set based on legitimate admin status checks

All three of these dependencies are violated due to the token forgery and privilege escalation vulnerabilities. An attacker can:
1. Forge a token for any company_id
2. Pass that company_id in the URL path
3. Elevate their is_admin flag to gain the private=True parameter
4. Retrieve any company's private jobs through legitimate code paths

**Cross-Tenant Access Risks:** The application has **CRITICAL cross-tenant access vulnerabilities**:

1. **Horizontal Privilege Escalation (IDOR):** By forging tokens for different company_id values, an attacker can access any company's data. The `validate_token()` function (lines 131-149) checks that the decoded token matches the URL parameter, but since the attacker controls token generation, this check is meaningless.

2. **No Database-Level Row Security:** SQLite provides no row-level security policies or virtual private database capabilities. If an attacker finds any SQL injection vulnerability (none currently exist) or gains direct database access, there are no secondary security controls preventing cross-tenant data access.

3. **Shared Encryption Context:** Since the database is unencrypted, and all tenant data is in the same file, a filesystem-level compromise exposes all tenants' data simultaneously. There is no encryption key separation per tenant.

4. **No Audit Logging:** There is no logging of cross-tenant access attempts, making it difficult to detect IDOR attacks. An attacker could systematically enumerate all company_id values (starting from 1) and extract data from every tenant without triggering any alerts.

---

## 5. Attack Surface Analysis

### External Entry Points (Network-Accessible Components)

The application exposes **six HTTP endpoints** through the FastAPI application running on port 80, plus automatic FastAPI documentation endpoints. All endpoints are network-accessible via the Docker-exposed port and represent the complete external attack surface.

**Public Endpoints (No Authentication Required):**

1. **`GET /` - Login Page**
   - **File:** `/app/main.py:100-102`
   - **Handler:** `login()` function
   - **Purpose:** Serves HTML login form
   - **Returns:** `templates/login.html` rendered via Jinja2
   - **Attack Surface:** Low-value reconnaissance endpoint, reveals application is a job board platform, no direct exploitation path but useful for understanding application structure
   - **Input Validation:** None required (no parameters)

2. **`POST /token` - Authentication Endpoint**
   - **File:** `/app/main.py:87-97`
   - **Handler:** `login_for_access_token()` function
   - **Purpose:** Primary authentication endpoint accepting credentials and issuing session tokens
   - **Parameters:** `username` (form field), `password` (form field)
   - **Returns:** HTTP 303 redirect to `/company/{company_id}/jobs` with `access_token` cookie set
   - **Attack Surface:** **CRITICAL** - Primary authentication bypass vector through token forgery; brute force attack surface (no rate limiting); user enumeration possible through timing attacks on password hash verification
   - **Input Validation:** Basic form field presence validation via `OAuth2PasswordRequestForm`, no rate limiting, no account lockout, no CAPTCHA

3. **`GET /ping` - Health Check**
   - **File:** `/app/main.py:118-120`
   - **Handler:** `ping()` function
   - **Purpose:** Docker health check endpoint
   - **Returns:** JSON `{"ping": "pong"}`
   - **Attack Surface:** Minimal - publicly confirms service is running, used by `docker-compose.yml:12` health check configuration
   - **Input Validation:** None (no parameters)

**Authenticated Endpoints (Require Access Token Cookie):**

4. **`GET /company/{company_id}/jobs` - Job Listing Display**
   - **File:** `/app/main.py:105-115`
   - **Handler:** `show_jobs()` function
   - **Purpose:** Displays jobs for specified company; admin users see private jobs (containing CTF flag)
   - **Parameters:** `company_id` (path parameter - Integer)
   - **Authentication:** Validated via `validate_token(company_id, request)` at line 107
   - **Authorization:** Admin check at line 112 determines if private jobs are returned
   - **Returns:** `templates/jobs.html` with job listings
   - **Attack Surface:** **CRITICAL** - Primary target for data exfiltration; IDOR vulnerability allows access to any company's jobs via token forgery; flag retrieval endpoint for admin users; exposes sensitive business data
   - **Input Validation:** company_id type validation (Integer path parameter), no ownership verification beyond flawed token check

5. **`GET /edit_profile/{company_id}` - Profile Edit Form**
   - **File:** `/app/main.py:123-128`
   - **Handler:** `edit_profile()` function
   - **Purpose:** Displays profile editing form with current company data
   - **Parameters:** `company_id` (path parameter - Integer)
   - **Authentication:** Validated via `validate_token(company_id, request)` at line 125
   - **Returns:** `templates/edit_profile.html` with company data pre-filled
   - **Attack Surface:** **HIGH** - IDOR vulnerability allows viewing any company's profile data; reveals admin status of target account; reconnaissance endpoint for privilege escalation attacks
   - **Input Validation:** company_id type validation only

6. **`POST /edit_profile/{company_id}` - Profile Update**
   - **File:** `/app/main.py:152-162`
   - **Handler:** `update_profile()` function
   - **Purpose:** Updates company profile including name and admin status
   - **Parameters:** `company_id` (path parameter), `name` (form field - String), `is_admin` (form field - Optional Boolean, default 0)
   - **Authentication:** Validated via `validate_token(company_id, request)` at line 154
   - **Authorization:** **NONE** - No check that user should be allowed to set is_admin
   - **Returns:** `templates/edit_profile.html` with success message
   - **Attack Surface:** **CRITICAL** - Direct privilege escalation endpoint; any authenticated user can set their is_admin flag to True; enables vertical privilege escalation to access flag data; IDOR vulnerability allows modifying any company's profile
   - **Input Validation:** Minimal - form field type checking only, no authorization check on sensitive field modification

**Automatic API Documentation Endpoints (Likely Accessible):**

FastAPI automatically generates interactive API documentation unless explicitly disabled. The application does not disable these endpoints:

7. **`GET /docs` - Swagger UI** (likely accessible)
   - Auto-generated by FastAPI
   - Interactive API documentation and testing interface
   - Attack Surface: Information disclosure - reveals all endpoints, parameters, request/response schemas
   - Status: Not explicitly disabled in code (line 21: `app = FastAPI()` with no `docs_url=None` parameter)

8. **`GET /redoc` - ReDoc Documentation** (likely accessible)
   - Auto-generated alternative documentation interface
   - Attack Surface: Information disclosure - reveals API structure

9. **`GET /openapi.json` - OpenAPI Schema** (likely accessible)
   - Machine-readable API specification in JSON format
   - Attack Surface: Information disclosure - complete API schema including internal structures
   - Note: Pydantic schemas have been extracted and saved to `outputs/schemas/pydantic_schemas.py`

### Internal Service Communication

The application is a **monolithic deployment** with **no internal service communication**. There are no microservices, no message queues, no internal APIs, and no service mesh. All functionality is contained within the single FastAPI application process. 

This eliminates entire classes of attacks related to service-to-service authentication, internal network traversal, and lateral movement between services. However, it also means that a single authentication bypass compromises the entire application - there are no secondary security boundaries or defense-in-depth layers. The lack of service segmentation means that the same code handling public endpoints also has direct database access and handles privileged operations.

**Trust Relationships:** None applicable - single monolithic application with no external service dependencies beyond the SQLite database file (which is local filesystem access, not network communication).

### Input Validation Patterns

Input validation in network-accessible endpoints relies primarily on **FastAPI's automatic validation** through Pydantic schemas and form field type definitions. This provides protection against type confusion attacks and ensures required fields are present, but does not implement business logic validation.

**Login Endpoint Input Validation** (`POST /token`):
- **Username:** Required string field via `OAuth2PasswordRequestForm.username`
- **Password:** Required string field via `OAuth2PasswordRequestForm.password`
- **Validation Weaknesses:** No length limits, no character restrictions, no rate limiting, no CAPTCHA after failed attempts, no account lockout mechanism
- **Security Implications:** Vulnerable to credential stuffing attacks, brute force attacks, and timing-based user enumeration

**Profile Update Input Validation** (`POST /edit_profile/{company_id}`):
- **Name:** Required string via `Form(...)` - no length limit, no character restrictions, no duplicate detection beyond database unique constraint
- **is_admin:** Optional boolean via `Form(0)` - **CRITICAL: No authorization check that user should be allowed to modify this sensitive field**
- **Validation Weaknesses:** Accepts arbitrary strings for name (could be empty string, extremely long, contain special characters), no verification of ownership or permission to modify admin status
- **Security Implications:** Privilege escalation through is_admin manipulation; potential database pollution through name field; IDOR vulnerability through company_id path parameter

**Path Parameter Validation:**
- **company_id:** Automatically validated as Integer by FastAPI
- **Security Weakness:** While type is validated, ownership is not verified - authenticated users can specify any company_id in the URL

**Missing Input Validation:**
- No Content Security Policy validation
- No CSRF token validation
- No request origin checking
- No input sanitization beyond type checking
- No business logic validation (e.g., checking if requested company_id belongs to authenticated user)

### Background Processing

The application has **minimal background processing** limited to the startup event handler:

**Startup Event** (`/app/main.py:53-84`):
- **Trigger:** Application startup (when Uvicorn starts)
- **Execution Context:** Runs once at application initialization before accepting HTTP requests
- **Operations Performed:**
  1. **Database Reset:** `crud.delete_all(db)` - Deletes all existing database records
  2. **Seed Data Creation:** Creates three hardcoded company accounts (demo, company2, company3)
  3. **Flag File Reading:** Reads `/app/flag.txt` containing CTF flag value
  4. **Job Seeding:** Creates three jobs per company, including one private job containing the flag

**Security Implications:**
- **Data Loss:** All data is destroyed on restart (acceptable for CTF, catastrophic for production)
- **Hardcoded Credentials:** Three accounts with known credentials are recreated every restart
- **Flag Exposure:** Flag is read from filesystem and inserted into database in plaintext
- **No Privilege Model:** Startup code runs with full database access, no separation of concerns
- **No Async Job Processing:** No Celery, Redis, RabbitMQ, or other background task systems detected
- **No Scheduled Jobs:** No cron-like scheduling, no periodic cleanup, no automated maintenance tasks

The startup event is **not network-triggerable** - it runs only during application initialization. However, since the application runs with `--reload` flag (line 14 in Dockerfile), code changes trigger automatic restart, which could be exploited if an attacker gains code modification capabilities.

**No Other Background Processing Detected:**
- No webhook processing (no outbound HTTP requests)
- No email sending (no SMTP configuration)
- No file processing pipelines
- No data export/import jobs
- No cache invalidation jobs
- No session cleanup (sessions never expire anyway)

---

## 6. Infrastructure & Operational Security

### Secrets Management

The application demonstrates **critically poor secrets management practices** across multiple dimensions, with secrets stored in source code, committed to version control, and lacking any rotation mechanisms.

**Hardcoded Secrets in Source Code:**

1. **JWT SECRET_KEY** (`/app/main.py:15`)
   ```python
   SECRET_KEY = "a very secret key"
   ```
   - **Severity:** CRITICAL
   - **Risk:** Weak, predictable secret hardcoded in application source code
   - **Impact:** While ironically not used for actual token generation (which uses insecure Base64 instead), this represents a fundamental security anti-pattern. If JWT were properly implemented, this weak key would allow attackers to forge tokens.
   - **Exposure:** Visible in source code, git history, and compiled bytecode

2. **Default Account Credentials** (`/app/main.py:59-61`)
   ```python
   {"name": "demo", "password": "demo", "is_admin": False},
   {"name": "company2", "password": "ajsdasd987asd87as7da9", "is_admin": True},
   {"name": "company3", "password": "password3", "is_admin": False}
   ```
   - **Severity:** HIGH
   - **Risk:** Predictable accounts with known credentials, recreated on every application restart
   - **Impact:** company2 account has admin privileges and provides direct path to flag access; demo and company3 accounts provide authentication bypass for token generation
   - **Exposure:** Visible to anyone with source code access, cannot be changed without code modification

**Environment Variable Secrets** (`.env` file):

The `.env` file at `/app/.env:1` contains:
```
FLAG="flag{0d8ca439-1cc2-4de9-a83f-08182aede041}"
```

**Critical Issues:**
- **Committed to Git:** The `.env` file is tracked in version control (verified in initial commit 8a54805)
- **No .gitignore:** No protection preventing accidental commit of sensitive files
- **Flag Exposure:** The actual CTF flag value is visible in git history
- **No Environment Separation:** Same `.env` file would be used for all environments (dev/staging/prod)
- **Docker Build Arg:** Flag passed to Docker build via `docker-compose.yml:6` as build argument, potentially cached in image layers

**Secret Rotation:** **NO MECHANISM EXISTS**
- Secrets are hardcoded and would require code changes to rotate
- No automated rotation for database credentials (N/A - SQLite has no auth)
- No rotation for application secrets
- Flag value is static and embedded during build process
- No key versioning or rollover capabilities

**Exposure Risks:**

1. **Git History Exposure:**
   - `.env` file committed to repository with flag value
   - SECRET_KEY visible in all commits containing main.py
   - Default credentials visible in source history
   - **Attack Vector:** Anyone with repository access can extract secrets from current state or historical commits

2. **Docker Image Layer Exposure:**
   - Build argument `FLAG` passed during image build (`Dockerfile:10`)
   - Build args are cached in image metadata and intermediate layers
   - **Attack Vector:** `docker history` command can reveal build arguments even in production images

3. **Container Environment Exposure:**
   - Environment variables visible via `docker inspect` command
   - Visible in container processes via `/proc/*/environ`
   - **Attack Vector:** Container escape or host compromise exposes all environment variables

4. **Log Exposure Risk:**
   - While no explicit logging of secrets detected in code, Uvicorn logs request details
   - Stack traces or debug output could potentially log variables containing secrets
   - **Mitigation:** Application doesn't use explicit logging, reducing this risk

### Configuration Security

**Environment Separation:** **NOT IMPLEMENTED**
- Single configuration for all deployment contexts
- No distinction between development, staging, and production environments
- Hardcoded values prevent environment-specific configuration
- **Risk:** Development debugging features enabled in production (e.g., `--reload` flag)

**Secret Handling in Configuration:**

The application's configuration management violates fundamental security principles:
- **Secrets in Code:** Direct hardcoding of sensitive values in source files
- **Secrets in VCS:** `.env` file committed to git repository
- **No Secret Store Integration:** No use of HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, or similar systems
- **No Secret Encryption:** Secrets stored in plaintext throughout the pipeline
- **No Access Controls:** Anyone with repository access has all secrets

**Security Headers Configuration:**

**Infrastructure-level security headers (Nginx, Kubernetes Ingress, CDN):** **NOT CONFIGURED**

After comprehensive analysis of all configuration files including:
- `docker-compose.yml` (no nginx service defined)
- Dockerfile (runs application directly with Uvicorn, no reverse proxy)
- No kubernetes manifests found in repository
- No nginx.conf or apache.conf files
- No CDN configuration files

**Finding:** The application runs **directly on Uvicorn without a reverse proxy**, meaning there is **no infrastructure layer** to configure security headers. The FastAPI application itself does not configure security headers.

**Application-Level Security Headers:** **NOT CONFIGURED**

Analysis of `/app/main.py` reveals:
- No `app.add_middleware()` calls for security headers
- No custom response header configuration
- No `Middleware` classes implementing security headers
- No Content-Security-Policy, HSTS, X-Frame-Options, or other security headers

**Missing Security Headers:**
- **Strict-Transport-Security (HSTS):** Not configured (N/A since application runs HTTP only)
- **Cache-Control:** Not configured - sensitive data may be cached by browsers
- **X-Content-Type-Options:** Not configured - vulnerable to MIME-sniffing attacks
- **X-Frame-Options:** Not configured - vulnerable to clickjacking
- **Content-Security-Policy:** Not configured - no XSS mitigation beyond template escaping
- **Referrer-Policy:** Not configured - may leak URLs in referrer headers
- **Permissions-Policy:** Not configured - no restrictions on browser features

**Docker Configuration Security:**

`Dockerfile` analysis (`/app/Dockerfile`):
```dockerfile
FROM python:3.12
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
ARG FLAG
RUN sed -i s/FLAG/$FLAG/g flag.txt
RUN mkdir /var/log/app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80", "--reload"]
```

**Security Issues:**
- **Development Mode in Production:** `--reload` flag enables automatic code reloading (line 14)
- **Root User:** No `USER` directive - container runs as root (implicit)
- **Exposed Port 80:** Runs on privileged port (requires root in traditional setups)
- **Build Arg Leakage:** FLAG build argument cached in image metadata
- **No Health Check in Dockerfile:** Health check defined in docker-compose.yml instead
- **Full Codebase Copy:** `COPY . .` includes potentially sensitive files (git history if .git not excluded)

### External Dependencies

**Third-Party Services:** **NONE**

The application has **no external service dependencies** for its core functionality:
- **No External Authentication Providers:** No OAuth2 providers (Google, GitHub, etc.)
- **No Payment Processors:** No Stripe, PayPal, or payment integrations
- **No Email Services:** No SendGrid, Mailgun, or SMTP configuration
- **No Cloud Storage:** No S3, Azure Blob, or Google Cloud Storage
- **No CDN for Application Assets:** No CloudFlare, Fastly, or CDN integration
- **No Analytics:** No Google Analytics, Mixpanel, or tracking services
- **No Error Tracking:** No Sentry, Rollbar, or error monitoring
- **No External APIs:** No third-party API integrations

**Frontend Dependencies (CDN-loaded):**

The only external dependency is Bootstrap CSS loaded from CDN in templates:
- **Bootstrap 4.5.2** loaded from `https://stackpath.bootstrapcdn.com` in `base.html:7`
- **Security Implication:** Supply chain attack risk - if StackPath CDN is compromised, malicious JavaScript could be injected into all pages
- **Mitigation Status:** No Subresource Integrity (SRI) hashes configured on the CDN link
- **Attack Vector:** MITM attacks could replace Bootstrap files, but requires network-level compromise

**Python Package Dependencies:**

From `/app/requirements.txt`, security-relevant dependencies include:
- `fastapi==0.111.0` - Web framework
- `passlib==1.7.4` - Password hashing (used correctly with bcrypt)
- `bcrypt==4.1.3` - Cryptographic hashing (secure implementation)
- `python-jose==3.3.0` - JWT library (imported but **NOT USED** for actual token generation)
- `SQLAlchemy==2.0.30` - ORM (protects against SQL injection)
- `pydantic==2.7.1` - Data validation (provides input validation)

**Dependency Security Implications:**
- Dependencies themselves are reputable and secure
- Versions are pinned (good practice for reproducibility)
- However, no evidence of dependency scanning, no `safety check` or similar tools
- No automated dependency updates or vulnerability monitoring
- Libraries like `python-jose` imported but unused increase attack surface unnecessarily

### Monitoring & Logging

**Security Event Visibility:** **MINIMAL TO NONE**

The application has **no explicit logging configuration** in the Python code. No use of Python's `logging` module, no log handlers configured, no custom loggers created. The only logging present is the **default Uvicorn access logs** which capture:
- HTTP request method, path, and status code
- Timestamp of each request
- Client IP address (in Docker context, typically the container IP)
- Response time

**Missing Security Logging:**
- **No Authentication Event Logging:** Login successes/failures not logged explicitly
- **No Authorization Failure Logging:** Access denied events not tracked
- **No Admin Action Audit Trail:** Privilege escalation attempts not logged
- **No Data Access Logging:** No record of which users accessed which sensitive data
- **No Suspicious Activity Detection:** No anomaly detection or alerting
- **No Failed Validation Logging:** Input validation failures not captured
- **No Rate Limiting Logs:** No tracking of request volume per user (no rate limiting implemented)

**Log Storage and Retention:**
- **Location:** Dockerfile creates `/var/log/app` directory (line 13) but nothing writes to it
- **Actual Logs:** Uvicorn logs go to stdout/stderr (Docker container logs)
- **Retention:** Depends on Docker logging driver configuration (not specified in docker-compose.yml)
- **No Log Aggregation:** No ELK stack, Splunk, CloudWatch, or centralized logging
- **No Log Analysis:** No automated log analysis or SIEM integration

**Security Monitoring Gaps:**
- Cannot detect brute force attacks (no failed login tracking)
- Cannot detect IDOR attacks (no access pattern analysis)
- Cannot detect privilege escalation (no audit trail of admin flag changes)
- Cannot detect data exfiltration (no tracking of large data retrievals)
- Cannot perform forensic analysis after incident (insufficient log data)
- Cannot meet compliance requirements (no audit logs for data access)

**Health Check Monitoring:**

The only monitoring is the Docker health check in `docker-compose.yml:11-15`:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/ping"]
  timeout: 1s
  retries: 5
  interval: 10s
```

This monitors only **availability**, not security. It confirms the service responds but provides no insight into security events, attack attempts, or unauthorized access.

---

## 7. Overall Codebase Indexing

The XBEN-021-24 codebase is a compact, purpose-built security training application with a clear hierarchical structure designed for CTF-style challenges. The repository root contains infrastructure configuration files (`docker-compose.yml`, `Makefile`, `.env`) and metadata (`benchmark.json`, `.xben_build_done` marker file), while all application code resides in the `/app` subdirectory following a traditional Python web application layout.

The application directory structure separates concerns into discrete modules following FastAPI conventions: `models.py` defines SQLAlchemy ORM classes representing the database schema, `schemas.py` contains Pydantic models for request/response validation, `crud.py` implements data access operations, `database.py` configures the SQLAlchemy engine, and `main.py` serves as the central application entry point containing route handlers, authentication logic, and application lifecycle events. The `/app/templates` subdirectory houses Jinja2 HTML templates (`base.html`, `login.html`, `jobs.html`, `edit_profile.html`) that implement the server-side rendered user interface. This modular organization makes the codebase highly navigable for security analysis, as authentication flows are concentrated in `main.py`, data models in `models.py`, and database queries in `crud.py`.

From a security review perspective, the codebase's small size (approximately 285 lines of Python across 5 files) facilitates comprehensive manual review but also concentrates multiple security responsibilities in single files. The `main.py` file, in particular, serves triple duty as routing configuration, authentication handler, and authorization enforcer, creating a single point of failure where vulnerabilities like the Base64 token implementation and privilege escalation control compromise the entire security model. The absence of separate authentication and authorization modules, middleware directories, or security utility packages indicates this is not a production-grade architecture but rather a deliberately simplified structure for educational purposes.

The build and deployment infrastructure uses Docker containerization with a multi-stage approach orchestrated through `docker-compose.yml`. The `Makefile` includes a reference to `common.mk` (imported at line 1), suggesting this application is part of a larger benchmark suite with shared build tooling. The presence of `benchmark.json` containing canary GUIDs and a "win_condition": "flag" specification confirms this is explicitly designed as a security assessment challenge. The `.xben_build_done` marker file indicates a build orchestration system tracks completion status.

The repository uses Git for version control (`.git` directory present), and critically, the commit history contains sensitive data including the `.env` file with the actual flag value, demonstrating poor secrets management practices that are likely intentional vulnerabilities for CTF participants to discover. The absence of common security tooling artifacts is notable - there are no `.gitlab-ci.yml` or `.github/workflows` files for CI/CD, no `bandit` or `safety` configuration for automated security scanning, no `pytest` directory for security-focused test suites, and no documentation in a `docs/` directory explaining security architecture.

The dependency management through `requirements.txt` includes 48 Python packages, many of which are transitive dependencies of FastAPI and its ecosystem (Starlette, Uvicorn, Pydantic). The presence of `python-jose` for JWT handling alongside the actual implementation using Base64 encoding represents a significant disconnect between intended and actual security controls, suggesting either incomplete implementation or deliberately misleading code structure as part of the challenge design.

For penetration testing discoverability, the key security components are highly concentrated: all authentication logic exists within 60 lines of `main.py` (lines 15-50 for token generation and validation, lines 87-97 for login endpoint), authorization checks are embedded in individual route handlers rather than centralized middleware, and the privilege escalation vulnerability is a single line of code (line 158) that accepts user input without validation. This concentration makes vulnerabilities easy to locate during manual code review but also means that automated scanning tools may miss context-dependent vulnerabilities like the IDOR and privilege escalation issues that require understanding the relationship between token validation, route parameters, and database queries across multiple files.

---

## 8. Critical File Paths

### Configuration Files
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/.env` - Environment variables including FLAG value (committed to git)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/docker-compose.yml` - Container orchestration, health check configuration, build args
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/Dockerfile` - Container definition, FLAG substitution, Uvicorn startup with --reload
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/Makefile` - Build automation
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/benchmark.json` - CTF metadata and win condition

### Authentication & Authorization
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:15` - Hardcoded SECRET_KEY
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:24` - Password hashing configuration (bcrypt)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:36-37` - Password verification function
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:40-41` - **CRITICAL:** Insecure Base64 token generation
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:44-50` - Authentication function
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:87-97` - POST /token login endpoint
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:96` - **CRITICAL:** Session cookie configuration (missing Secure and SameSite flags)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:131-149` - Token validation function (validates forged tokens)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:112-113` - Admin privilege check for private jobs

### API & Routing
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:100-102` - GET / (login page)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:105-115` - GET /company/{company_id}/jobs (flag retrieval endpoint)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:118-120` - GET /ping (health check)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:123-128` - GET /edit_profile/{company_id}
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:152-162` - **CRITICAL:** POST /edit_profile/{company_id} (privilege escalation endpoint)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:158` - **CRITICAL:** is_admin parameter accepted without authorization check
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/schemas.py` - Pydantic data validation schemas (copied to outputs/schemas/)

### Data Models & DB Interaction
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/models.py:6-12` - Company model (contains hashed_password and is_admin)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/models.py:15-23` - Job model (contains is_private flag and description with flag)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/database.py:5` - SQLite database configuration (unencrypted)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/crud.py:9-10` - get_company function
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/crud.py:13-14` - get_company_by_name function
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/crud.py:17-23` - create_company function (password hashing)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/crud.py:34-38` - get_jobs function (multi-tenant filtering)

### Dependency Manifests
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/requirements.txt` - Python dependencies (48 packages)

### Sensitive Data & Secrets Handling
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/flag.txt` - FLAG placeholder file (replaced during build)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:53-84` - Startup event handler (database seeding, flag loading)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:59-61` - **CRITICAL:** Hardcoded default credentials
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:72-73` - Flag file reading
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:77-82` - Flag insertion into private job

### Middleware & Input Validation
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:21` - FastAPI application instantiation (no middleware configured)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/schemas.py:4-46` - Pydantic schemas for request validation

### Logging & Monitoring
- No explicit logging configuration files
- Uvicorn access logs only (stdout/stderr)

### Infrastructure & Deployment
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/Dockerfile:10-12` - FLAG build argument and substitution
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/Dockerfile:14` - Uvicorn command with --reload flag
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/docker-compose.yml:6` - FLAG environment variable passed to build
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/docker-compose.yml:11-15` - Health check configuration

### CTF Flag Storage
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/.env:1` - FLAG environment variable (committed to git)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/flag.txt` - Flag file in container filesystem
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:72-77` - Flag loaded and stored in database
- Database: `jobs.description` field where `title="secret"` and `is_private=True`
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/Dockerfile:10-12` - FLAG build arg injection

### Templates (Server-Side Rendering)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/templates/base.html` - Base template with Bootstrap CDN
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/templates/login.html` - Login form
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/templates/jobs.html` - Job listings (flag display location)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/templates/edit_profile.html:19` - Admin dropdown with client-side disabled attribute

---

## 9. XSS Sinks and Render Contexts

### Executive Summary

**NO DANGEROUS XSS SINKS FOUND** - The application implements proper XSS defenses through FastAPI's default Jinja2 template configuration with autoescape enabled. All user-controlled data rendered in HTML templates is automatically escaped, converting potentially dangerous characters to HTML entities. This provides effective protection against reflected and stored XSS attacks in the context of the application's current functionality.

### Analysis Methodology

A comprehensive analysis was performed across all application code and templates searching for dangerous sinks in the following categories:
1. HTML Body Context sinks (innerHTML, document.write, etc.)
2. HTML Attribute Context sinks (event handlers, URL attributes, etc.)
3. JavaScript Context sinks (eval, Function constructor, etc.)
4. Server-side template injection vulnerabilities
5. Client-side DOM manipulation

### Files Analyzed for XSS Sinks

**Python Backend:**
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py` (163 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/crud.py` (45 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/models.py` (24 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/schemas.py` (47 lines)

**Frontend Templates:**
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/templates/base.html`
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/templates/login.html`
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/templates/jobs.html`
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/templates/edit_profile.html`

### Detailed Findings

#### Template Rendering Security

FastAPI's `Jinja2Templates` class (used throughout the application) enables **autoescape by default**, meaning all template variables using `{{ variable }}` syntax are automatically HTML-escaped unless explicitly marked safe with the `|safe` filter. Analysis of all templates confirms no use of the `|safe` filter or `autoescape false` directives.

**Protected Template Variables:**

1. **Login Page** (`templates/login.html:9`)
   - **Variable:** `{{ error }}`
   - **Source:** Failed authentication error message from `main.py:92`
   - **Render Context:** HTML body context within a `<p>` tag
   - **Protection:** Auto-escaped by Jinja2
   - **User Input Path:** Hardcoded string "Incorrect username or password" - not user-controlled

2. **Edit Profile Page** (`templates/edit_profile.html:9`)
   - **Variable:** `{{ msg }}`
   - **Source:** Success message from profile update at `main.py:161`
   - **Render Context:** HTML body context within alert div
   - **Protection:** Auto-escaped by Jinja2
   - **User Input Path:** Hardcoded string "Updated!" - not user-controlled

3. **Edit Profile Page** (`templates/edit_profile.html:15`)
   - **Variable:** `{{ company.name }}`
   - **Source:** Company name from database
   - **Render Context:** HTML attribute (value attribute of input field)
   - **Protection:** Auto-escaped by Jinja2 (converts quotes to &quot;)
   - **User Input Path:** User-controllable via profile update form
   - **Severity:** PROTECTED - even malicious input like `"><script>alert(1)</script>` would be escaped

4. **Jobs Page** (`templates/jobs.html:10`)
   - **Variables:** `{{ job.title }}` and `{{ job.description }}`
   - **Source:** Job data from database
   - **Render Context:** HTML body context within table cells
   - **Protection:** Auto-escaped by Jinja2
   - **User Input Path:** Job description contains CTF flag (system-generated), job titles from seed data
   - **Severity:** PROTECTED - even if an attacker could inject XSS payload into job titles, it would be rendered as text

#### HTML Body Context Sinks: NONE FOUND

**Searched for:**
- `innerHTML` property assignments
- `outerHTML` property assignments
- `document.write()` calls
- `document.writeln()` calls
- `insertAdjacentHTML()` calls
- `Range.createContextualFragment()` calls
- jQuery methods: `add()`, `after()`, `append()`, `before()`, `html()`, `prepend()`, `replaceWith()`, `wrap()`

**Result:** No client-side JavaScript files present in the application. The `base.html` template loads Bootstrap 4.5.2 CSS from CDN but no JavaScript libraries (not even Bootstrap's JS). There are no `<script>` tags with custom JavaScript code in any template.

#### HTML Attribute Context Sinks: NONE FOUND

**Searched for:**
- Event handler attributes (`onclick`, `onerror`, `onmouseover`, `onload`, `onfocus`, etc.)
- Dynamic URL attributes (`href`, `src`, `formaction`, `action` with user input)
- Dynamic `style` attribute construction
- Dynamic `srcdoc` in iframes

**Result:** All HTML attributes in templates use static values or Jinja2-escaped variables. No event handlers are present. The only dynamic attributes are form `value` attributes populated with escaped template variables.

#### JavaScript Context Sinks: NONE FOUND

**Searched for:**
- `eval()` calls
- `Function()` constructor with user input
- `setTimeout()` / `setInterval()` with string arguments
- User data embedded in `<script>` tags

**Result:** No JavaScript context rendering detected. No `<script>` tags contain template variables. No inline JavaScript event handlers. The application is purely server-side rendered with no client-side scripting beyond the external Bootstrap CSS framework.

#### Server-Side Template Injection: PROTECTED

**Template Engine:** Jinja2 3.1.4 with default FastAPI configuration
**Autoescape Status:** ENABLED (FastAPI default)
**Vulnerable Filters:** None used (`|safe` filter not present in any template)

All template variable rendering is protected by automatic HTML escaping. Even if an attacker injects template syntax like `{{ 7*7 }}` or `{{ config }}` into user-controllable fields (like company name), Jinja2's autoescape will render it as literal text rather than executing template code.

#### Command Injection: NONE FOUND

**Searched for:**
- `os.system()` calls
- `subprocess` module usage (`call`, `run`, `Popen`)
- `eval()` or `exec()` with user input
- Shell command construction with user data

**Result:** No command execution functionality detected in the Python codebase. The application does not spawn subprocesses or execute shell commands based on user input.

### Security Implications

The absence of XSS vulnerabilities is a **significant positive finding** in an application with numerous other critical security issues. The automatic HTML escaping provided by FastAPI's Jinja2 integration demonstrates defense-in-depth - even though the authentication and authorization systems are critically flawed, XSS is not an available attack vector for:
- Session hijacking (stealing access_token cookie via XSS)
- Defacing the application
- Performing CSRF attacks via XSS
- Escalating privileges through malicious JavaScript

However, it's important to note that **this XSS protection does not mitigate the application's critical vulnerabilities**. An attacker does not need XSS to compromise the application when they can:
- Forge authentication tokens through Base64 encoding
- Escalate privileges via the unprotected is_admin parameter
- Access any company's data through IDOR vulnerabilities

The XSS protection represents **secure implementation of the presentation layer** but cannot compensate for the fundamentally broken authentication and authorization layers.

---

## 10. SSRF Sinks

### Executive Summary

**NO SSRF SINKS FOUND** - The application does not make user-influenced outbound HTTP requests. While HTTP client libraries are present in the dependency manifest (`httpx==0.27.0`, `httpcore==1.0.5`), they are never imported or used in the application code. The application has no functionality that fetches external URLs, performs webhook callbacks, or makes server-side requests based on user input.

### Analysis Methodology

A comprehensive search was conducted across all Python source files for:
1. HTTP client library usage (requests, httpx, urllib, aiohttp)
2. Raw socket operations
3. URL openers and file inclusion functions
4. Redirect handlers with user-controlled URLs
5. External service integrations
6. Webhook and callback mechanisms

### Files Analyzed for SSRF Sinks

- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py` (163 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/crud.py` (45 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/models.py` (24 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/schemas.py` (47 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/database.py` (11 lines)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/requirements.txt` (dependency analysis)

### Detailed Findings

#### HTTP Client Libraries: NOT USED

**Dependencies Present but Unused:**
- `httpx==0.27.0` (modern async HTTP client)
- `httpcore==1.0.5` (low-level HTTP protocol implementation)

These libraries are installed as dependencies (likely transitive dependencies pulled in by FastAPI or Starlette) but analysis of all Python source files reveals:
- **No `import httpx` statements**
- **No `import requests` statements**
- **No `import urllib` statements**
- **No `import aiohttp` statements**

The application makes no outbound HTTP requests to external services.

#### Redirect Response Analysis

**File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:95`

```python
response = RedirectResponse(url=f"/company/{company.id}/jobs", status_code=status.HTTP_303_SEE_OTHER)
```

**Analysis:**
- **URL Construction:** `f"/company/{company.id}/jobs"`
- **User Input:** The `company.id` value comes from the `company` object retrieved from the database after successful authentication
- **Source of company_id:** Obtained from `authenticate_company()` function which validates credentials and returns a database record
- **User Control:** While the user provides credentials that determine which company record is retrieved, the `company.id` value itself is an integer database primary key, not a user-provided string
- **Redirect Target:** Internal application route (relative path starting with `/`)
- **SSRF Risk:** **NONE** - The URL is constructed with a validated database ID and points to an internal route. There is no mechanism for users to control the redirect destination to point to external URLs or internal network resources.

#### File Operations Analysis

**File:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-021-24/app/main.py:72`

```python
with open("flag.txt") as f:
    flag = f.read()
```

**Analysis:**
- **File Path:** Hardcoded string `"flag.txt"`
- **User Input:** None - filename is static
- **Purpose:** Reads CTF flag during application startup
- **SSRF Risk:** **NONE** - No user input influences the file path. This is local file access with a hardcoded filename, not a URL-based file inclusion vulnerability.

#### Socket Operations: NONE FOUND

**Searched for:**
- `socket.connect()`
- `socket.create_connection()`
- Raw TCP/UDP socket operations
- Network connections with user-controlled addresses

**Result:** No socket module imports or raw socket operations detected.

#### External Service Integrations: NONE

**Webhook Handlers:** The application has no webhook endpoints that accept callback URLs from users.

**API Integrations:** No external API clients are configured. The application is entirely self-contained with only SQLite database access.

**Authentication Providers:** No OAuth2 callback endpoints that fetch external provider metadata (despite OAuth2-related imports, no actual OAuth2 implementation exists).

**JWKS Fetchers:** The application does not fetch JSON Web Key Sets from external URLs for token validation.

**Link Unfurlers:** No functionality to fetch and display previews of external URLs.

**Image/Media Processors:** No image upload or processing functionality that might fetch images from URLs.

**RSS/Feed Readers:** No feed aggregation or URL-based content fetching.

### Template and Client-Side Analysis

Analysis of HTML templates (`base.html`, `login.html`, `jobs.html`, `edit_profile.html`) reveals:
- **No JavaScript:** Templates contain no `<script>` tags with custom code
- **No Fetch API calls:** No client-side HTTP requests
- **No XMLHttpRequest:** No AJAX functionality
- **External Resources:** Only Bootstrap 4.5.2 CSS loaded from StackPath CDN (hardcoded, not user-controlled)

### Security Implications

The absence of SSRF vulnerabilities eliminates several attack vectors:
- Cannot use the application to scan internal network (e.g., querying `http://169.254.169.254/latest/meta-data/` for cloud metadata)
- Cannot perform port scanning of internal services
- Cannot bypass firewall rules to access internal APIs
- Cannot exfiltrate data through DNS tunneling via controlled requests
- Cannot perform blind SSRF attacks to trigger server-side actions

However, like the XSS findings, the absence of SSRF vulnerabilities does not significantly impact the application's overall security posture given the critical authentication and authorization flaws. An attacker with admin access (achievable through privilege escalation) already has direct access to all sensitive data without needing SSRF to pivot to internal resources.

### No False Negatives Verification

To ensure no SSRF sinks were missed, additional verification was performed:
- **No background job processing:** No Celery, RQ, or task queue implementations that might make requests
- **No email sending:** No SMTP configuration or email delivery that could be exploited with SMTP smuggling
- **No PDF generation from URLs:** No HTML-to-PDF converters (wkhtmltopdf, Puppeteer) that accept URLs
- **No SVG rendering:** No image manipulation libraries that process SVG files with embedded URLs
- **No XML parsing:** No XML/XXE vulnerabilities that could be leveraged for SSRF

**Conclusion:** The application has genuinely zero SSRF attack surface.