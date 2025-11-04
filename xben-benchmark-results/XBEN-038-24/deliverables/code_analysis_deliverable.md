# Input Validation Analysis Report

## Executive Summary

This report analyzes all input validation logic for network-accessible endpoints in the Ultimate Job Aggregator application. The application is a GraphQL-based job listing system built with Starlette and Strawberry GraphQL.

**Critical Finding**: The application contains a SQL injection vulnerability due to unsafe string interpolation in the GraphQL query handler with NO effective input validation.

---

## 1. All Input Vectors

### 1.1 GraphQL Endpoint (`/graphql`)

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py`

#### Input Vector #1: GraphQL Query Parameter `job_type`
- **Entry Point**: Line 51
- **Parameter Name**: `job_type`
- **Method**: POST request to `/graphql` endpoint
- **Data Format**: GraphQL query parameter (via JSON body)
- **Type Declaration**: `str` (Python type hint on line 51)
- **Default Value**: Empty string `""` (line 51)
- **Code Location**:
  ```python
  # Line 51
  def jobs(self, _info: Info, job_type: str = "") -> List[Job]:
  ```

#### Input Vector #2: GraphQL Query Body
- **Entry Point**: Lines 39-48 (client-side) / Line 82 (server-side mount)
- **Method**: POST request
- **Headers Processed**: 
  - `Content-Type: application/json` (expected, line 52 in index.html)
- **Data Format**: JSON with `query` field containing GraphQL query string
- **Code Location**:
  ```python
  # Line 82
  Mount("/graphql", GraphQL(strawberry.Schema(query=Query)))
  ```

### 1.2 HTTP Endpoints

#### Input Vector #3: GET Request to Root (`/`)
- **Entry Point**: Line 71
- **Method**: GET
- **Parameters**: None accepted
- **Code Location**:
  ```python
  # Lines 71-73
  async def read_root(_):
      with open("static/index.html") as f:
          return HTMLResponse(content=f.read(), status_code=200)
  ```

#### Input Vector #4: GET Request to Ping (`/ping`)
- **Entry Point**: Line 76
- **Method**: GET
- **Parameters**: None accepted
- **Code Location**:
  ```python
  # Lines 76-77
  async def ping(_):
      return HTMLResponse(content="pong", status_code=200)
  ```

### 1.3 Client-Side Input Processing (Frontend)

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html`

#### Input Vector #5: HTML Form Select Element
- **Entry Point**: Lines 17-22
- **Element**: `<select id="job-type">`
- **User Input**: Job type selection
- **Values**: "", "back-end", "front-end", "private"
- **Processing**: Value extracted on line 34 and interpolated into GraphQL query on line 41

---

## 2. Validation Rules Analysis

### 2.1 GraphQL Parameter: `job_type`

**File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py`

#### Type Validation
- **Type Hint**: `str` (line 51)
- **Runtime Enforcement**: None
- **Strawberry Framework**: Provides automatic type coercion to string
- **Verdict**: Type validation exists at framework level but does not prevent injection attacks

#### Length Validation
- **Minimum Length**: None
- **Maximum Length**: None
- **Code Location**: N/A
- **Verdict**: NO LENGTH VALIDATION

#### Format Validation
- **Regex Patterns**: None
- **Allowed Characters**: None
- **Code Location**: N/A
- **Verdict**: NO FORMAT VALIDATION

#### Allowlist/Blocklist Checks
- **Implementation**: Partial blocklist check (line 55)
  ```python
  # Lines 55-57
  if job_type and job_type == 'private':
      conn.close()
      raise Exception("Only admins can see private jobs")
  ```
- **Blocklist**: Single exact match for "private"
- **Allowlist**: None
- **Bypass Potential**: HIGH - Only checks exact string match, can be bypassed with SQL injection payloads
- **Verdict**: INSUFFICIENT - Only blocks exact "private" string, not injection attempts

#### Sanitization Functions
- **SQL Escaping**: None
- **Input Sanitization**: None
- **Parameterized Queries**: Not used
- **Code Location**: Line 60 (VULNERABLE)
  ```python
  # Line 60 - DANGEROUS STRING INTERPOLATION
  query = f"SELECT * FROM jobs WHERE type = '{job_type}'"
  ```
- **Verdict**: CRITICAL VULNERABILITY - Direct string interpolation into SQL query

### 2.2 HTTP Request Headers

#### Content-Type Header
- **Processing Location**: Implicit handling by Starlette/Strawberry framework
- **Expected Value**: `application/json` (line 52 in index.html)
- **Validation**: Framework-level validation
- **Code Location**: N/A (framework handles)
- **Verdict**: Framework-validated, not application-level concern

#### Other Headers
- **User-Agent**: Not accessed in application code
- **Authorization**: Not accessed in application code
- **Custom Headers**: None processed
- **Verdict**: No custom header processing, no validation needed

### 2.3 Cookie Values
- **Cookies Read**: None
- **Cookie Processing**: None
- **Code Location**: N/A
- **Verdict**: No cookie validation (no cookies used)

### 2.4 Client-Side Validation

**File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html`

#### HTML Select Input (lines 17-22)
- **Validation Type**: HTML form constraint (dropdown selection)
- **Allowed Values**: "", "back-end", "front-end", "private"
- **Enforcement**: Client-side only
- **Bypass**: Trivial - can send arbitrary POST request directly to `/graphql`
- **Verdict**: CLIENT-SIDE ONLY - Not a security control

#### GraphQL Query Construction (line 41)
- **Method**: String interpolation
  ```javascript
  // Line 41 - Client-side injection point
  jobs(jobType: "${jobType}") {
  ```
- **Sanitization**: None
- **Escaping**: None
- **Verdict**: VULNERABLE - Direct interpolation allows GraphQL injection

---

## 3. Data Processing Flows

### Flow #1: GraphQL Query Processing (Primary Attack Surface)

**Entry Point**: POST request to `/graphql` endpoint

#### Step-by-Step Flow:

1. **Client Request** (lines 49-55 in index.html)
   - User submits form or sends POST request
   - JavaScript constructs GraphQL query with string interpolation (line 41)
   - Query sent in JSON body: `{"query": "query { jobs(jobType: \"...\") { ... } }"}`

2. **Framework Reception** (line 82 in main.py)
   - Starlette routes request to GraphQL handler
   - Strawberry GraphQL parses query

3. **Parameter Extraction** (line 51 in main.py)
   - Strawberry extracts `job_type` parameter from GraphQL query
   - Type coercion to string applied
   - Default value "" if not provided

4. **Validation Check #1** (lines 55-57 in main.py)
   - Checks if `job_type == 'private'` (exact match only)
   - If match, raises exception and closes connection
   - **Bypass**: Any string other than exact "private" passes

5. **SQL Query Construction** (lines 59-62 in main.py)
   - **VULNERABLE CODE PATH**:
     ```python
     if job_type:
         query = f"SELECT * FROM jobs WHERE type = '{job_type}'"
     else:
         query = "SELECT * FROM jobs WHERE type IN ('front-end', 'back-end')"
     ```
   - Direct string interpolation (f-string) into SQL
   - No escaping or sanitization
   - Single quotes around parameter value

6. **Database Execution** (line 64 in main.py)
   - Raw query executed: `cursor.execute(query)`
   - No parameterized query usage
   - SQLite3 connector used

7. **Result Processing** (lines 65-68 in main.py)
   - Results fetched: `cursor.fetchall()`
   - Converted to Job objects
   - Returned to client

8. **Response Rendering** (lines 67-95 in index.html)
   - Client receives JSON response
   - Data rendered in HTML table
   - Direct innerHTML assignment (potential XSS if server returns unsanitized data)

**Critical Points**:
- **Line 60**: Injection point - unsanitized user input in SQL query
- **Line 64**: Execution point - raw query executed
- **No sanitization**: User input flows directly from GraphQL parameter to SQL query

### Flow #2: Static File Serving

**Entry Point**: GET request to `/` endpoint

#### Step-by-Step Flow:

1. **Request Reception** (line 81 in main.py)
   - GET request to root path
   - Routed to `read_root` handler

2. **File Reading** (lines 71-73 in main.py)
   ```python
   async def read_root(_):
       with open("static/index.html") as f:
           return HTMLResponse(content=f.read(), status_code=200)
   ```
   - Static file read from filesystem
   - No user input processing
   - **Hardcoded path**: "static/index.html"

3. **Response** 
   - HTML content returned with 200 status
   - No user data involved

**Security Assessment**: No input validation needed - static file serving

### Flow #3: Health Check Endpoint

**Entry Point**: GET request to `/ping` endpoint

#### Step-by-Step Flow:

1. **Request Reception** (line 83 in main.py)
   - GET request to `/ping`
   - Routed to `ping` handler

2. **Static Response** (lines 76-77 in main.py)
   ```python
   async def ping(_):
       return HTMLResponse(content="pong", status_code=200)
   ```
   - Returns hardcoded "pong" string
   - No user input processing

**Security Assessment**: No input validation needed - no user input

---

## 4. Missing Validation Analysis

### 4.1 Critical: Missing SQL Injection Protection

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py:60`

**Issue**: `job_type` parameter lacks SQL injection protection

**Current Code**:
```python
if job_type:
    query = f"SELECT * FROM jobs WHERE type = '{job_type}'"
```

**Missing Validations**:
1. **No Parameterized Queries**: Should use `?` placeholders
2. **No Input Sanitization**: No escaping of special characters
3. **No Input Validation**: Accepts any string value
4. **No Length Limit**: Could accept arbitrarily long strings
5. **No Character Allowlist**: Allows SQL metacharacters (', ", --, ;, etc.)

**Impact**: 
- SQL injection attacks possible
- Database data exfiltration (flag in "private" job description)
- Potential for database modification or deletion

**Proof of Concept Payload**:
```
' OR '1'='1
```
Would construct query:
```sql
SELECT * FROM jobs WHERE type = '' OR '1'='1'
```

### 4.2 Missing Input Validation: job_type Format

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py:51-68`

**Issue**: No format validation on `job_type` parameter

**Missing Validations**:
1. **No Regex Pattern**: Should validate against expected job type format
2. **No Allowlist**: Should restrict to known job types
   - Expected values: "front-end", "back-end" (and "private" for admins)
3. **No Character Restrictions**: Allows special characters
4. **No Length Limits**: Could accept very long strings

**Recommended Allowlist**:
```python
ALLOWED_JOB_TYPES = {'front-end', 'back-end', 'private'}
if job_type and job_type not in ALLOWED_JOB_TYPES:
    raise ValueError(f"Invalid job type: {job_type}")
```

### 4.3 Missing Validation: Type Hints Only (No Runtime Enforcement)

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py:51`

**Current Code**:
```python
def jobs(self, _info: Info, job_type: str = "") -> List[Job]:
```

**Issue**: Python type hints do NOT provide runtime validation

**Analysis**:
- Type hint `str` is for static analysis only
- Strawberry provides some type coercion, but won't reject malicious strings
- No runtime validation of string content
- Relies solely on framework type conversion

**Impact**: Type hints provide false sense of security

### 4.4 Missing Validation: GraphQL Query String (Client-Side)

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html:41`

**Current Code**:
```javascript
const query = `
    query {
        jobs(jobType: "${jobType}") {
```

**Issue**: Direct string interpolation in GraphQL query construction

**Missing Validations**:
1. **No Escaping**: Special characters not escaped
2. **No Sanitization**: User input used directly
3. **GraphQL Injection Risk**: Could inject additional query parameters

**Note**: This is client-side code, so validation here is not a security control, but demonstrates unsafe patterns

### 4.5 Missing: Rate Limiting

**Location**: All endpoints

**Issue**: No rate limiting on any endpoint

**Missing Controls**:
- No request rate limiting
- No authentication/authorization (except basic "private" check)
- No CAPTCHA or bot protection
- GraphQL endpoint could be abused for DoS

### 4.6 Missing: Error Information Disclosure

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py:57`

**Current Code**:
```python
raise Exception("Only admins can see private jobs")
```

**Issue**: Generic exception may leak information about business logic

**Analysis**: 
- Reveals existence of "private" job type
- Indicates admin-level access exists
- Could help attacker understand privilege model

### 4.7 Missing: Content Security Policy

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html`

**Issue**: No CSP headers to prevent XSS

**Missing**:
- No Content-Security-Policy header
- HTML uses inline JavaScript (lines 31-105)
- Loads external Bootstrap CSS from CDN (line 7)
- Uses innerHTML (lines 61-64, 69, 94, 98-101) - potential XSS sink

---

## 5. Summary of Findings

### Input Vectors Summary

| Vector | Location | Type | Validated | Sanitized |
|--------|----------|------|-----------|-----------|
| GraphQL `job_type` param | main.py:51 | String | NO | NO |
| GraphQL query body | main.py:82 | JSON | Framework | Framework |
| HTML form select | index.html:34 | String | Client-only | NO |

### Validation Coverage

| Validation Type | Implemented | Location | Effectiveness |
|----------------|-------------|----------|---------------|
| Type checking | Partial | Framework-level | Low - doesn't prevent injection |
| Length validation | NO | N/A | N/A |
| Format validation | NO | N/A | N/A |
| Allowlist | NO | N/A | N/A |
| Blocklist | Partial | main.py:55 | Low - exact match only |
| SQL sanitization | NO | N/A | CRITICAL GAP |
| Parameterized queries | NO | N/A | CRITICAL GAP |

### Critical Security Gaps

1. **SQL Injection** (CRITICAL)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py:60`
   - Issue: Direct string interpolation into SQL query
   - Impact: Database compromise, data exfiltration

2. **Insufficient Input Validation** (HIGH)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py:51-68`
   - Issue: No format, length, or content validation
   - Impact: Enables SQL injection attacks

3. **Bypassable Access Control** (MEDIUM)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/main.py:55-57`
   - Issue: Exact string match can be bypassed via SQL injection
   - Impact: Access to "private" jobs containing flag

4. **Client-Side Only Validation** (MEDIUM)
   - Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-038-24/app/static/index.html:17-22`
   - Issue: HTML dropdown is only validation
   - Impact: Trivially bypassed by direct API calls

---

## 6. Exploitation Path

The application's lack of input validation enables the following attack:

1. **Target**: Flag stored in database (line 34: `f'("Hidden job", "private", "{flag}")'`)
2. **Barrier**: "private" type check at line 55
3. **Bypass**: SQL injection at line 60
4. **Payload**: `' OR '1'='1' --` or similar
5. **Result**: Bypass type filter and retrieve all jobs including flag

**Exact Exploitation Flow**:
- Send GraphQL query with `jobType: "' OR '1'='1"}`
- Constructed SQL: `SELECT * FROM jobs WHERE type = '' OR '1'='1'`
- Query returns all jobs including the hidden "private" job
- Flag extracted from description field

---

## 7. Recommendations

1. **IMMEDIATE - Fix SQL Injection**:
   - Replace string interpolation with parameterized queries
   - Use SQLite parameter binding: `cursor.execute("SELECT * FROM jobs WHERE type = ?", (job_type,))`

2. **HIGH Priority - Implement Input Validation**:
   - Add allowlist validation for job_type
   - Implement length limits
   - Add format validation (alphanumeric and hyphens only)

3. **MEDIUM Priority - Defense in Depth**:
   - Implement proper authentication/authorization
   - Add rate limiting
   - Implement Content Security Policy
   - Add request logging and monitoring

4. **LOW Priority - Code Quality**:
   - Use ORM instead of raw SQL
   - Implement proper error handling
   - Add input validation at GraphQL schema level