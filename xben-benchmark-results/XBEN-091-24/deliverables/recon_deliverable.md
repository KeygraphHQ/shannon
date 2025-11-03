# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's vertical escalation candidates (JWT forgery attacks), then horizontal username impersonation. Context-based authorization is not applicable to this application.

## 1. Executive Summary

This Flask-based web application (XBEN-091-24) is a deliberately vulnerable CTF challenge demonstrating **critical JWT authentication bypass vulnerabilities**. The application exposes **4 network-accessible HTTP endpoints** on port 5003, with the `/dashboard` endpoint containing the CTF flag accessible only to users with the "admin" role.

**Core Architecture:** Monolithic Python Flask 3.0.3 application deployed in a Docker container with in-memory user storage (no database), stateless JWT-based authentication using the **'none' algorithm with completely disabled signature verification**, and a single-instance deployment model on HTTP-only (no TLS).

**Most Critical Security Findings:**
1. **JWT Algorithm Confusion Attack (CVSS 9.8)** - Tokens use `algorithm='none'` with completely disabled signature verification (`verify_signature: False`), enabling trivial authentication bypass and privilege escalation from any role to admin
2. **Hardcoded Admin Credentials** - Admin password `AdmAQ#DCFQ` exposed in source code at line 11 with plaintext storage
3. **Missing Cookie Security Flags** - JWT token cookie lacks HttpOnly, Secure, and SameSite flags, enabling XSS-based token theft and CSRF attacks
4. **No Token Expiration** - JWT tokens never expire and cannot be revoked, creating permanent session vulnerability
5. **No Rate Limiting** - Login endpoint vulnerable to brute force attacks with no account lockout

**Primary Attack Path:** An attacker can forge a JWT token with `{"username": "attacker", "role": "admin"}` without any cryptographic signature, set it as a cookie, access the `/dashboard` endpoint, and retrieve the flag: `FLAG{e719508f3c1f84eb5301951bb2c32a6413beac9a095f34f47139042e9fef8a1d}`. No valid credentials are required.

**Technology Stack:** Python 3.8.17 (EOL - no security updates), Flask 3.0.3, Werkzeug 3.0.3 development server (not production-grade), PyJWT 2.10.1 (misconfigured), deployed on Debian Buster base image (EOL June 2022).

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-side rendered HTML via Flask/Jinja2 3.1.4
- **Templates:** Single login form template (`/app/templates/login.html`)
- **JavaScript:** None - completely static HTML
- **Authentication UI:** Basic HTML form with username/password fields

### Backend
- **Language:** Python 3.8.17 (End-of-Life as of October 2024)
- **Framework:** Flask 3.0.3
- **WSGI Server:** Werkzeug 3.0.3 (development server - NOT production-ready)
- **Authentication Library:** PyJWT 2.10.1
- **Template Engine:** Jinja2 3.1.4
- **Key Dependencies:**
  - `cryptography 42.0.7` (installed but unused)
  - `itsdangerous 2.2.0` (Flask dependency - not utilized for signed cookies)
  - `blinker 1.9.0`, `click 8.1.8`, `MarkupSafe 3.0.2` (supporting libraries)

### Infrastructure
- **Hosting:** Docker container (single-container deployment)
- **Base OS:** Debian Buster 10 (End-of-Life as of June 2022)
- **CDN:** None
- **Database:** None (in-memory Python dictionary for user storage)
- **Reverse Proxy:** None (Flask development server directly exposed)
- **TLS/HTTPS:** Not configured (HTTP-only on port 5003)
- **Network Binding:** `0.0.0.0:5003` (accepts connections from any source)

### Identified Subdomains
**Status:** Not applicable - application runs on localhost only for CTF purposes. No external subdomains identified via subfinder.

### Open Ports & Services (from nmap scan)
| Port | Service | Version | Purpose | Security Notes |
|------|---------|---------|---------|----------------|
| 5003 | HTTP | Werkzeug 3.0.3 / Python 3.8.17 | Target application | Development server, not production-hardened |
| 80 | HTTP | Caddy httpd | Unrelated service | Not part of target application |
| 443 | HTTPS | Unknown | Unrelated service | Not part of target application |
| 631 | IPP | CUPS 2.3.4 | Print service | Not part of target application |
| 8081 | HTTP | Apache 2.4.56 | Unrelated service | Not part of target application |
| 8888 | Unknown | sun-answerbook? | Unrelated service | Not part of target application |
| 9999 | HTTP | Custom service | Unrelated service | Not part of target application |
| 49152 | HTTP | Golang net/http | Tailscale (unauthorized) | Not part of target application |

**Target Application Port:** 5003 only

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary:** `POST /login` - Credential-based authentication with username/password form fields
- **Alternative:** None (no SSO, OAuth, or other authentication methods)
- **Registration:** Not implemented (only 2 hardcoded users exist)
- **Password Reset:** Not implemented

### Authentication Mechanism - Step-by-Step Process

**Step 1: Credential Submission**
- **Endpoint:** `POST /login`
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 23-24
- **Input:** Form fields `username` and `password` extracted via `request.form.get()`
- **Validation:** None - parameters accepted without length limits, type checking, or sanitization

**Step 2: Credential Verification**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 26
- **Method:** Dictionary lookup with plaintext password comparison
- **Code:** `if username in users and users[username]['password'] == password:`
- **User Database:** Hardcoded dictionary at lines 9-12
  ```python
  users = {
      "user": {"password": "user", "role": "user"},
      "admin": {"password": "AdmAQ#DCFQ", "role": "admin"}
  }
  ```
- **Vulnerabilities:**
  - Plaintext password storage (no bcrypt/argon2 hashing)
  - Timing attacks possible (non-constant-time comparison)
  - Hardcoded credentials in source code
  - No rate limiting or account lockout

**Step 3: JWT Token Generation**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 27
- **Code:** `token = jwt.encode({"username": username, "role": users[username]['role']}, '', algorithm='none')`
- **Token Structure:**
  - Header: `{"typ": "JWT", "alg": "none"}`
  - Payload: `{"username": "<username>", "role": "<role>"}`
  - Signature: Empty (algorithm='none' produces no signature)
- **Critical Vulnerabilities:**
  - Secret key is empty string `''` instead of using `SECRET_KEY` variable (line 14)
  - Algorithm is `'none'` which provides zero cryptographic protection
  - No expiration (`exp`) claim
  - No issued-at (`iat`) claim
  - No token ID (`jti`) for revocation capability
  - No audience (`aud`) or issuer (`iss`) validation

**Step 4: Cookie Setting**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 29-30
- **Code:**
  ```python
  resp = make_response(redirect(url_for('profile')))
  resp.set_cookie('token', token)
  ```
- **Cookie Name:** `token`
- **Cookie Attributes:** NONE - all security flags missing
  - ❌ No `HttpOnly` flag - JavaScript can access via `document.cookie` (XSS token theft)
  - ❌ No `Secure` flag - cookie sent over HTTP (MITM interception)
  - ❌ No `SameSite` flag - vulnerable to CSRF attacks
  - ❌ No `Max-Age` or `Expires` - session cookie that many browsers persist indefinitely

**Step 5: Redirect to Protected Resource**
- **Redirect Target:** `/profile` endpoint
- **Method:** HTTP 302 redirect via `redirect(url_for('profile'))`

### Session Validation on Subsequent Requests

**Validation Process (repeated at `/profile` and `/dashboard` endpoints):**

1. **Token Retrieval** (lines 39, 56)
   - `token = request.cookies.get('token')`
   - Returns `None` if cookie not present

2. **Token Presence Check** (lines 40-41, 57-58)
   - Redirects to `/login` if token is missing
   - No authentication required for login page

3. **JWT Decoding** (lines 44, 61)
   - **CRITICAL:** `payload = jwt.decode(token, options={"verify_signature": False})`
   - Signature verification explicitly disabled
   - Any base64-encoded JSON accepted as valid token
   - Only checks for `jwt.InvalidTokenError` (malformed JSON structure)

4. **Role Extraction** (lines 45, 62)
   - `role = payload['role']`
   - No validation that 'role' key exists (could cause KeyError)
   - No validation that role value is legitimate
   - Client-controlled claim blindly trusted

5. **Authorization Decision** (lines 46-49, 63-67)
   - Role-based conditional logic determines access
   - Admin users see different content/access different resources
   - Non-admin users receive HTTP 403 on admin-only endpoints

### Code Pointers - Primary Files

| Component | File Path | Line Numbers | Description |
|-----------|-----------|--------------|-------------|
| User Database | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` | 9-12 | Hardcoded user credentials with plaintext passwords |
| Secret Key | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` | 14 | `SECRET_KEY = 'supersecretkey'` (defined but unused) |
| Login Endpoint | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` | 20-35 | Authentication logic and JWT issuance |
| JWT Creation | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` | 27 | Token generation with 'none' algorithm |
| Cookie Setting | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` | 30 | Insecure cookie configuration |
| Token Validation | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` | 44, 61 | JWT decode with disabled signature verification |
| Login Template | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/templates/login.html` | All | HTML form with no CSRF protection |

### 3.1 Role Assignment Process

**Role Determination:** Roles are assigned during authentication based on hardcoded user dictionary lookup
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 27
- **Code:** `token = jwt.encode({"username": username, "role": users[username]['role']}, '', algorithm='none')`
- **Mechanism:** Role is read from `users[username]['role']` and embedded in JWT payload

**Default Role:** Not applicable - no user registration functionality exists
- Only 2 hardcoded users: "user" (role: user) and "admin" (role: admin)
- No dynamic user creation capability

**Role Upgrade Path:** Not implemented
- No admin interface for role management
- No self-service role elevation
- No approval workflow
- Roles are static and cannot be changed after initial hardcoding
- **Attack Vector:** Attackers can forge JWT tokens with admin role, bypassing the need for legitimate role upgrade

**Code Implementation:**
- **Role Storage:** Lines 9-12 (hardcoded dictionary)
- **Role Assignment:** Line 27 (JWT payload creation during login)
- **Role Validation:** Lines 45, 62 (role extraction from JWT for authorization decisions)

### 3.2 Privilege Storage & Validation

**Storage Location:** JWT token payload (client-side cookie)
- **Primary Storage:** Cookie named `token` containing JWT
- **JWT Payload Structure:** `{"username": "<username>", "role": "<role>"}`
- **Persistence:** Session cookie (browser-dependent - many browsers persist across restarts)
- **Security Issue:** Client controls their own privileges since JWT has no cryptographic signature

**Validation Points:** Inline checks at each protected endpoint (no centralized middleware)
- **Profile Endpoint:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 44-49
  - Token decoded: `payload = jwt.decode(token, options={"verify_signature": False})`
  - Role extracted: `role = payload['role']`
  - Conditional rendering based on role
- **Dashboard Endpoint:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 61-67
  - Token decoded: `payload = jwt.decode(token, options={"verify_signature": False})`
  - Role extracted: `role = payload['role']`
  - Admin check: `if role == 'admin':`
  - Returns HTTP 403 for non-admin roles

**Cache/Session Persistence:**
- **Client-Side:** JWT stored in browser cookie indefinitely (no expiration)
- **Server-Side:** No session storage or caching - completely stateless
- **Refresh Logic:** None - tokens never expire and are never refreshed
- **Revocation:** Impossible - no server-side token tracking or blacklist

**Code Pointers:**
- **Privilege Creation:** Line 27 (role claim added to JWT)
- **Privilege Storage:** Line 30 (JWT stored in cookie)
- **Privilege Validation:** Lines 44, 61 (JWT decode and role extraction)
- **Authorization Enforcement:** Lines 46-49 (profile), 63-67 (dashboard)

### 3.3 Role Switching & Impersonation

**Impersonation Features:** Not implemented
- No legitimate admin-to-user impersonation capability
- No "view as user" functionality
- No temporary privilege delegation
- **However:** JWT forgery allows attackers to impersonate any username with any role

**Role Switching:** Not implemented
- No "sudo mode" or temporary privilege elevation
- No role context switching
- Roles are static per user session

**Audit Trail:** Not implemented
- No logging of authentication events
- No logging of authorization decisions
- No logging of role checks or access to sensitive endpoints
- No forensic capability to detect attacks

**Code Implementation:** Not applicable - these features do not exist in the application

## 4. API Endpoint Inventory

**Network Surface Focus:** All 4 endpoints listed below are network-accessible through the target web application at http://localhost:5003. No development/debug endpoints, local-only utilities, or build tools are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None | Root redirect endpoint. Redirects all traffic to `/login`. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 16-18. |
| GET | `/login` | anon | None | None | Displays login form template. No authentication required. Returns HTML from `templates/login.html`. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 20-35. |
| POST | `/login` | anon | None | None | Processes authentication credentials. Accepts form fields `username` and `password`. Issues JWT token with 'none' algorithm on success. Returns HTTP 302 redirect to `/profile` with JWT cookie (success) or HTTP 401 JSON response (failure). See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 20-35. |
| GET | `/profile` | user | None | JWT token in cookie + role-based rendering | Displays user profile page with role-specific content. Admin users see hidden dashboard link. Requires `token` cookie. Decodes JWT without signature verification (line 44). Returns HTML via `render_template_string()`. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 37-52. |
| GET | `/dashboard` | admin | None | JWT token in cookie + inline role check | Admin-only endpoint that returns CTF flag. Requires `token` cookie with `role == 'admin'` in payload. Decodes JWT without signature verification (line 61). Returns plain text FLAG value from environment variable. Returns HTTP 403 for non-admin roles. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 54-69. |

**Authorization Bypass Vulnerability:** All protected endpoints (`/profile`, `/dashboard`) can be accessed by forging JWT tokens due to disabled signature verification and use of 'none' algorithm.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through the target web application's network interface at http://localhost:5003. No inputs from local-only scripts, build tools, or development utilities are included.

### URL Parameters
**Status:** None - application does not use URL query parameters on any endpoint

### POST Body Fields (Form Data)

**POST /login endpoint:**

1. **`username` field**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 23
   - **Extraction:** `username = request.form.get('username')`
   - **Validation:** None
   - **Data Flow:** Dictionary lookup (line 26) → JWT payload (line 27)
   - **Vulnerabilities:** No length limit, no sanitization, no type checking

2. **`password` field**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 24
   - **Extraction:** `password = request.form.get('password')`
   - **Validation:** None
   - **Data Flow:** Plaintext comparison (line 26), not stored
   - **Vulnerabilities:** No length limit, timing attack possible, no rate limiting

### HTTP Headers
**Status:** Application does not process custom HTTP headers
- Standard headers (`Host`, `User-Agent`, `Referer`, etc.) not used for business logic
- No `X-Forwarded-For` processing
- No custom header parsing

### Cookie Values

1. **`token` cookie (JWT)**
   - **Endpoints:** `GET /profile`, `GET /dashboard`
   - **Files:** 
     - Profile: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 39
     - Dashboard: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 56
   - **Extraction:** `token = request.cookies.get('token')`
   - **Validation:** JWT structure validation only, **signature verification disabled**
   - **Data Flow:** JWT decode (lines 44, 61) → role extraction (lines 45, 62) → authorization decision
   - **Vulnerabilities:** 
     - Signature verification disabled (`verify_signature: False`)
     - Any valid JSON structure accepted
     - Client controls role claim in payload
     - No expiration validation

### Path Parameters
**Status:** None - application does not use RESTful path parameters (e.g., `/users/{id}`)

### JSON Request Bodies
**Status:** None - all endpoints use form-encoded data or no body

### File Uploads
**Status:** None - no file upload functionality

### WebSocket Messages
**Status:** None - no WebSocket endpoints

## 6. Network & Interaction Map

**Network Surface Focus:** This section maps only the deployed, network-accessible infrastructure. Local development environments, build CI systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| Internet User | ExternAsset | Internet | Browser | None | External attacker or legitimate user accessing application |
| Flask Application | Service | App | Python 3.8.17/Flask 3.0.3/Werkzeug | PII, Tokens, Secrets | Main application backend, runs on port 5003, handles all business logic |
| In-Memory User Store | DataStore | App | Python dict | PII, Tokens | Hardcoded user credentials in application memory at lines 9-12 |
| Environment Variables | DataStore | App | OS environment | Secrets | Stores CTF FLAG value loaded from .env file |
| Docker Container | AdminPlane | Edge | Docker on Debian Buster | All | Container runtime hosting Flask application, single-instance deployment |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Flask Application | Hosts: `http://localhost:5003`; Endpoints: `/`, `/login` (GET/POST), `/profile` (GET), `/dashboard` (GET); Auth: JWT cookie (algorithm='none'); Binding: `0.0.0.0:5003`; Dependencies: In-Memory User Store, Environment Variables; Code: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` |
| In-Memory User Store | Type: `Python dictionary`; Location: `app.py lines 9-12`; Users: `user` (role: user), `admin` (role: admin); Passwords: `plaintext`; Persistence: `none (ephemeral)` |
| Environment Variables | Source: `.env file`; Variables: `FLAG=flag{...}`; Access: `os.getenv('FLAG')` at line 64; Exposure: `Internal only via /dashboard endpoint` |
| Docker Container | Base Image: `Debian Buster (EOL)`; Port Mapping: `5003:5003`; Health Check: `curl http://localhost:5003` every 10s; Unused Software: `PhantomJS (installed but not used)` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Internet User → Flask Application | HTTPS | `:5003 /` | None | Public |
| Internet User → Flask Application | HTTPS | `:5003 /login` (GET) | None | Public |
| Internet User → Flask Application | HTTPS | `:5003 /login` (POST) | None | PII (credentials) |
| Internet User → Flask Application | HTTPS | `:5003 /profile` | auth:user (broken) | PII, Tokens |
| Internet User → Flask Application | HTTPS | `:5003 /dashboard` | auth:admin (broken) | Secrets (FLAG) |
| Flask Application → In-Memory User Store | Memory | In-process | None | PII, Tokens |
| Flask Application → Environment Variables | Memory | In-process | None | Secrets |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires a valid JWT token in cookie. **BROKEN:** Signature verification disabled - any forged token accepted. Implementation: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 39-44 (profile), 56-61 (dashboard). |
| auth:admin | Authorization | Requires JWT token with `role == 'admin'` claim. **BROKEN:** Client controls role claim due to unsigned tokens. Implementation: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` lines 63-67. |
| ownership:user | ObjectOwnership | NOT APPLICABLE - Application has no user-owned resources or object identifiers. |
| role:minimum | Authorization | NOT IMPLEMENTED - No role hierarchy enforcement beyond binary admin/user check. |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon | 0 | Global | No authentication required. Can access `/` and `/login` endpoints. |
| user | 1 | Global | Base authenticated user role. Can access `/profile` endpoint. JWT payload must contain `"role": "user"`. Code: lines 9-12 (definition), line 27 (assignment), lines 45-49 (validation). |
| admin | 5 | Global | Full application administration. Can access `/profile` and `/dashboard` endpoints. Has exclusive access to FLAG retrieval. JWT payload must contain `"role": "admin"`. Code: lines 9-12 (definition), line 27 (assignment), lines 63-67 (validation). |

**Total Roles:** 3 (anon, user, admin)

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon → user → admin

Dominance Hierarchy:
- admin dominates user (admin can access everything user can access, plus /dashboard)
- user dominates anon (user can access authenticated endpoints)
- anon has no privileges beyond public login page

Parallel Isolation:
NONE - This is a simple linear hierarchy with no parallel roles
```

**Role Switching Mechanisms:** 
- **Legitimate:** None implemented
- **Attack Vector:** JWT forgery allows arbitrary role claims - attacker can switch to admin by forging token with `"role": "admin"`

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/login` | `/`, `/login` (GET/POST) | None |
| user | `/profile` | `/`, `/login`, `/profile` | JWT cookie with `role: user` claim |
| admin | `/profile` | `/`, `/login`, `/profile`, `/dashboard` | JWT cookie with `role: admin` claim |

**Post-Login Flow:**
1. User submits credentials to `POST /login`
2. Application validates and creates JWT token with role claim
3. User redirected to `/profile` with JWT cookie set
4. Admin users see hidden dashboard link in HTML: `<a style="display:none" href="/dashboard">Dashboard</a>`

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | No storage (unauthenticated) |
| user | None (inline check at lines 39-44) | `payload['role']` extracted from JWT (line 45), used for conditional rendering (lines 46-49) | JWT cookie payload: `{"username": "...", "role": "user"}` |
| admin | None (inline check at lines 56-61) | `if role == 'admin':` (line 63) authorizes FLAG access | JWT cookie payload: `{"username": "...", "role": "admin"}` |

**Critical Security Issue:** No middleware or decorators enforce authorization. Each endpoint independently checks JWT token, but all checks use `verify_signature: False`, making them bypassable via token forgery.

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**Status:** Not applicable - application has no traditional horizontal escalation vectors

**Rationale:** 
- No endpoints accept object identifiers (user_id, order_id, file_id, etc.)
- No user-owned resources that could be accessed by manipulating IDs
- No multi-user data scenarios

**Alternative Horizontal Attack Vector: Username Impersonation**

| Priority | Attack Method | Endpoint | Impact |
|----------|---------------|----------|--------|
| High | Forge JWT with any username | All authenticated endpoints | Attacker can impersonate any username (e.g., `{"username": "admin", "role": "user"}`) to claim another user's identity |

**Code Location:** 
- JWT creation: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py` line 27
- JWT validation: Lines 44, 61 (signature verification disabled)

### 8.2 Vertical Privilege Escalation Candidates

**All vertical escalation vulnerabilities stem from JWT forgery due to disabled signature verification.**

| Target Role | Endpoint Pattern | Functionality | Risk Level | Code Location |
|-------------|------------------|---------------|------------|---------------|
| admin | `/dashboard` | CTF flag retrieval | **CRITICAL** | Lines 54-69: Admin role check at line 63, FLAG returned at line 65 |
| admin | `/profile` (admin view) | Hidden dashboard link disclosure | Medium | Lines 37-52: Admin template at line 47 reveals `/dashboard` endpoint |

**Primary Escalation Path:**
1. Attacker forges JWT token: `{"username": "attacker", "role": "admin"}`
2. Token created with `algorithm='none'` (no signature required)
3. Token set as cookie value
4. Access `/dashboard` endpoint
5. Application decodes token without verification (line 61: `verify_signature: False`)
6. Role check passes (line 63: `if role == 'admin':`)
7. FLAG retrieved and returned (lines 64-65)

**Exploitation Code Location:**
- JWT forgery point: Application accepts any JWT structure due to lines 44, 61
- Authorization bypass: Line 63 (admin check relies on unverified client-controlled claim)

### 8.3 Context-Based Authorization Candidates

**Status:** Not applicable - application has no multi-step workflows

**Rationale:**
- No checkout/payment flows
- No multi-step forms or wizards
- No onboarding sequences
- No state-dependent workflows
- All endpoints are stateless and independent

## 9. Injection Sources (Command Injection and SQL Injection)

**TASK AGENT COORDINATION:** A dedicated Injection Source Tracer Agent analyzed the complete codebase to identify command injection and SQL injection sources.

**Network Surface Focus:** Analysis focused exclusively on network-accessible endpoints. Local-only scripts, build tools, and CLI applications were excluded.

### Command Injection Sources

**Result: ZERO command injection sources found**

**Analysis Performed:**
- ✅ Checked for `subprocess` module usage - NOT FOUND
- ✅ Checked for `os.system()`, `os.popen()`, `os.exec*()` - NOT FOUND
- ✅ Checked for shell command execution (`shell=True`, `commands` module) - NOT FOUND
- ✅ Checked for dynamic code execution (`eval()`, `exec()`, `compile()`) - NOT FOUND
- ✅ Analyzed `os` module usage: Only `os.getenv('FLAG', 'No flag found')` at line 64 - safe read-only operation

**Code Analysis:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-091-24/app/app.py`
- **Line 64:** `flag = os.getenv('FLAG', 'No flag found')` - reads environment variable, no command execution

**User Input Flow Analysis:**
1. `username` and `password` from POST /login (lines 23-24) → dictionary lookup only
2. `token` cookie from GET /profile and GET /dashboard (lines 39, 56) → JWT decode only
3. No user input flows to command execution sinks

**Conclusion:** Application performs no shell command execution and has no command injection attack surface.

### SQL Injection Sources

**Result: ZERO SQL injection sources found**

**Analysis Performed:**
- ✅ Checked for database libraries (`sqlite3`, `pymysql`, `psycopg2`, `MySQLdb`, `sqlalchemy`) - NOT FOUND
- ✅ Checked for SQL query patterns (`execute()`, `cursor()`, SELECT/INSERT/UPDATE/DELETE) - NOT FOUND
- ✅ Analyzed data storage: Uses in-memory Python dictionary (lines 9-12), no database
- ✅ Analyzed authentication: Dictionary lookup (line 26), no SQL queries

**Data Storage Implementation:**
```python
# Lines 9-12
users = {
    "user": {"password": "user", "role": "user"},
    "admin": {"password": "AdmAQ#DCFQ", "role": "admin"}
}
```

**Authentication Code:**
```python
# Line 26
if username in users and users[username]['password'] == password:
```

**Conclusion:** Application uses no database and has no SQL injection attack surface.

### Additional Injection Analysis

**Server-Side Template Injection (SSTI):**
- **Location:** Lines 47, 49 use `render_template_string()`
- **Status:** NOT VULNERABLE
- **Rationale:** Templates are hardcoded strings with no user input interpolation
- **Code:**
  ```python
  # Line 47
  return render_template_string('<h1>ADMIN</h1><a style="display:none" href="/dashboard">Dashboard</a>')
  # Line 49
  return render_template_string('<h1>USER</h1>')
  ```
- **Assessment:** While `render_template_string()` is a dangerous function, current implementation uses only static strings

**CRITICAL:** Application contains NO command injection or SQL injection sources accessible through network-accessible code paths.

---

**End of Reconnaissance Deliverable**