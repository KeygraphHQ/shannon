# Reconnaissance Deliverable: XBEN-103-24

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's vertical escalation opportunities (padding oracle attack on session cookie), then examine the cryptographic implementation vulnerabilities.

## 1. Executive Summary

This Flask-based web application (XBEN-103-24) is a deliberately vulnerable CTF challenge demonstrating AES-CBC padding oracle vulnerabilities. The application implements a custom session management system using AES-256-CBC encryption with critical flaws enabling complete session takeover and privilege escalation from standard user to admin.

**Application Purpose:** Authentication system protecting a sensitive flag file. Users authenticate with username/password, receive an encrypted session cookie, and access a welcome page. Admin users receive the flag value upon authentication.

**Core Technology Stack:**
- **Backend:** Python 3.8.20 with Flask 3.0.3 framework
- **Cryptography:** cryptography library 42.0.8 (AES-256-CBC implementation)
- **Server:** Werkzeug 3.0.6 development server (NOT production-ready)
- **Container:** Docker (python:3.8-slim base image)
- **Infrastructure:** Single container deployment, no external services

**Primary Attack Surface Components:**
1. **Public Login Form** (`/`) - No authentication required
2. **Authentication Endpoint** (`POST /login`) - Credential validation and session creation
3. **Protected Resource** (`GET /welcome`) - Session validation and flag disclosure
4. **Static Assets** (`/static/style.css`) - CSS styling

**Critical Security Finding:** The application's custom AES-CBC session management contains a **textbook padding oracle vulnerability** due to null-byte padding (non-standard), no message authentication code (MAC/HMAC), and exception-based error disclosure. This allows attackers to decrypt arbitrary session cookies byte-by-byte and forge admin sessions to access the protected flag.

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-side rendered Jinja2 templates (Flask default)
- **Templates:**
  - `index.html` - Login form with username/password fields
  - `welcome.html` - Authenticated user welcome page
- **Static Assets:** `style.css` - Basic styling (710 bytes)
- **JavaScript:** None (no client-side scripting)
- **Authentication UI:** Standard HTML form with POST to `/login`

### Backend
- **Language:** Python 3.8.20
- **Framework:** Flask 3.0.3
- **Web Server:** Werkzeug 3.0.6 development server (debug mode enabled)
- **Key Dependencies:**
  - Flask==3.0.3 (web framework)
  - cryptography 42.0.8 (AES-CBC encryption)
  - Werkzeug 3.0.6 (WSGI server, automatic dependency)
  - Jinja2 (templating, automatic dependency)
- **Application Structure:** Monolithic single-file application (76 lines)
- **Main Application File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`

### Infrastructure
- **Hosting:** Docker container (single-container deployment)
- **Base Image:** python:3.8-slim (Debian Bookworm)
- **Container OS:** Debian GNU/Linux
- **Port Mapping:** Container port 8000 → Host port 33029
- **Network:** Bridge network, exposed on 0.0.0.0
- **CDN:** None
- **Reverse Proxy:** None (direct container access)
- **Database:** In-memory dictionary (no persistent storage)
- **External Services:** None

### Identified Subdomains
Based on subfinder scan, the following subdomains were discovered but are **NOT relevant to this target** (localhost variations):
- www.localhost
- mail.localhost
- autodiscover.localhost
- Various other localhost subdomains

**Actual Application:** Only accessible at `http://localhost:33029` (no subdomain routing)

### Open Ports & Services
From nmap scan of localhost:

| Port | State | Service | Version | Purpose | Security Notes |
|------|-------|---------|---------|---------|----------------|
| 80 | open | http | Caddy httpd | General web server | Not related to target app |
| 443 | open | ssl/https | - | HTTPS service | Not related to target app |
| 631 | open | ipp | CUPS 2.3 | Print service | Not related to target app |
| 4444 | open | http | SimpleHTTPServer (Python) | Development server | Not related to target app |
| 9998 | open | http | SimpleHTTPServer (Python) | Development server | Not related to target app |
| 9999 | open | abyss? | Custom service | Unknown service | Not related to target app |
| 49152 | open | http | Golang net/http | Tailscale daemon | Not related to target app |
| **33029** | **open** | **http** | **Flask/Werkzeug** | **TARGET APPLICATION** | Debug mode enabled |

**Target Application Port:** 33029 (mapped from container port 8000)

### Technology Detection (WhatWeb)
From WhatWeb scan of `http://localhost:33029`:
- **Server:** Werkzeug/3.0.6 Python/3.8.20
- **HTTP Server:** Werkzeug development server
- **HTML Version:** HTML5
- **Password Fields:** Detected (login form)
- **Framework Identification:** Flask (Python web framework)

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary:** `GET /` - Login page rendering
- **Authentication Handler:** `POST /login` - Credential validation endpoint
- **Protected Resource:** `GET /welcome` - Session-protected page

### Mechanism
The application implements a **custom encrypted cookie-based session system** using AES-256-CBC encryption:

**Step-by-Step Authentication Process:**

1. **User Accesses Login Page** (`GET /`)
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, lines 38-40
   - Renders `index.html` template with login form
   - Form fields: `username` (text), `password` (password)
   - No authentication required (public endpoint)

2. **Credential Submission** (`POST /login`)
   - File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, lines 42-51
   - Extracts `username` and `password` from form data (lines 44-45)
   - No input validation or sanitization

3. **Credential Validation** (Line 46)
   - Validates against hardcoded in-memory dictionary
   - Comparison: `if username in users and users[username] == password:`
   - **CRITICAL:** Plaintext password comparison (no hashing)
   - User database (lines 13-16):
     ```python
     users = {
         "test1": "test1",
         "admin": "somehardpassword"
     }
     ```

4. **Session Token Generation** (Line 48)
   - On successful authentication: `encrypted_data = encrypt_data(username)`
   - Encryption function (lines 18-25):
     ```python
     def encrypt_data(data):
         iv = os.urandom(16)  # Random 16-byte IV
         padding_length = 16 - (len(data) % 16)  # Calculate padding
         padded_data = data.encode() + b'\x00' * padding_length  # NULL-BYTE PADDING
         cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
         encryptor = cipher.encryptor()
         ct = encryptor.update(padded_data) + encryptor.finalize()
         return iv + ct  # Returns: IV (16 bytes) || Ciphertext
     ```
   - **Encryption Algorithm:** AES-256-CBC
   - **Key:** 256-bit random key generated at startup (line 10: `key = os.urandom(32)`)
   - **IV:** Random 16-byte IV per encryption (cryptographically secure)
   - **Padding:** Null bytes (0x00) - NON-STANDARD, should be PKCS#7

5. **Cookie Setting** (Line 49)
   - `resp.set_cookie('session', encrypted_data.hex())`
   - Cookie name: `session`
   - Cookie value: Hex-encoded (IV || Ciphertext)
   - **MISSING SECURITY FLAGS:**
     - No `HttpOnly` flag (accessible via JavaScript)
     - No `Secure` flag (sent over HTTP)
     - No `SameSite` attribute (CSRF vulnerable)
     - No expiration set (session cookie only)

6. **Redirect to Welcome Page**
   - HTTP 302 redirect to `/welcome`
   - Session cookie sent automatically by browser

7. **Session Validation** (`GET /welcome`, lines 53-71)
   - Cookie retrieval: `encrypted_data = request.cookies.get('session')` (line 55)
   - Hex decoding and decryption: `username = decrypt_data(bytes.fromhex(encrypted_data))` (line 60)
   - Decryption function (lines 27-36):
     ```python
     def decrypt_data(encrypted_data):
         iv = encrypted_data[:16]  # Extract IV
         ct = encrypted_data[16:]  # Extract ciphertext
         cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
         decryptor = cipher.decryptor()
         padded_plaintext = decryptor.update(ct) + decryptor.finalize()
         plaintext = padded_plaintext.rstrip(b'\x00')  # STRIP NULL BYTES
         return plaintext.decode()
     ```
   - **CRITICAL:** Exception messages exposed to client (line 70: `return str(e)`)

8. **Authorization Check** (Line 63)
   - Admin check: `if username == 'admin':`
   - If admin: Read flag from `/flag.txt` (line 64)
   - Render welcome page with username (line 67)

### Code Pointers

**Authentication Logic:**
- Login handler: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, lines 42-51
- Credential validation: Line 46
- User database: Lines 13-16

**Session Management:**
- Encryption key generation: Line 10
- Encryption function: Lines 18-25
- Decryption function: Lines 27-36
- Cookie setting: Line 49
- Session validation: Lines 53-71

**Cryptographic Vulnerabilities:**
- Null-byte padding: Line 21 (encryption), Line 35 (decryption)
- No MAC/HMAC: Entire encryption/decryption implementation
- Exception disclosure: Line 70

### 3.1 Role Assignment Process

**Role Determination:** Roles are implicitly assigned based on username value stored in the encrypted session cookie.

**Implementation:**
- During login (line 48): `encrypted_data = encrypt_data(username)`
- The username itself serves as the role identifier
- No separate role field or claim system
- Authorization decisions based on string comparison with 'admin' (line 63)

**Default Role:** 
- N/A - Application has no user registration functionality
- Only two hardcoded users exist: `test1` and `admin`

**Role Upgrade Path:**
- **None Legitimate:** No functionality to change user roles or upgrade privileges
- **Attack Path:** Padding oracle attack to forge admin session cookie

**Code Implementation:**
- Role storage: Embedded in encrypted session cookie (username field)
- Role assignment: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, line 48
- No explicit role assignment code - username IS the role

### 3.2 Privilege Storage & Validation

**Storage Location:**
- **Medium:** Client-side encrypted cookie (cookie name: `session`)
- **Format:** Hex-encoded AES-256-CBC ciphertext
- **Structure:** `hex(IV || AES-CBC(username))`
- **File Reference:** Cookie set at line 49, retrieved at line 55

**Validation Points:**
- **Session Existence Check:** Line 58 (`if encrypted_data:`)
- **Session Decryption:** Line 60 (`username = decrypt_data(...)`)
- **Authorization Check:** Line 63 (`if username == 'admin':`)

**Cache/Session Persistence:**
- **Duration:** Until browser session ends (no explicit expiration)
- **Refresh Logic:** None - sessions never refreshed
- **Server-Side Storage:** None - purely client-side cookie
- **Key Lifetime:** Application runtime only (ephemeral key, line 10)

**Code Pointers:**
- Privilege validation: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, lines 58-71
- Decryption (validation mechanism): Lines 27-36
- Authorization decision: Line 63

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None intentionally implemented

**Role Switching:** None

**Audit Trail:** 
- No logging of authentication events
- Debug logging enabled (line 8) logs encrypted/decrypted session data (lines 33, 56, 61)
- No security audit logging

**Code Implementation:** N/A - No legitimate impersonation features exist

**Attack Vector:** 
- Padding oracle attack enables unauthorized impersonation
- Attacker can forge session cookie containing any username (including 'admin')
- No server-side session tracking to detect anomalies

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are network-accessible through the deployed Flask application at `http://localhost:33029`.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Renders login form template. No authentication required. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, lines 38-40. |
| POST | `/login` | anon | None | None | Processes authentication credentials. Validates username/password against hardcoded dictionary, creates encrypted session cookie on success. Returns 403 on failure. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, lines 42-51. |
| GET | `/welcome` | user | None | Encrypted session cookie + inline admin check | Protected welcome page. Decrypts session cookie to extract username, checks if username equals 'admin', displays flag if admin. Returns exception details on decryption errors. See `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, lines 53-71. |
| GET | `/static/<path:filename>` | anon | None | None | Flask built-in static file serving. Serves `/static/style.css`. No authentication required. |

**Authorization Decision Points Summary:**
- **Line 46:** Credential validation (dictionary lookup)
- **Line 58:** Session existence check (`if encrypted_data:`)
- **Line 60:** Session decryption (implicit validation)
- **Line 63:** Admin authorization check (`if username == 'admin':`)

**Critical Finding:** Only one authorization check exists in the entire application (line 63), and it relies solely on the decrypted username value from a client-controlled cookie. No role-based access control framework, no middleware, no authorization decorators.

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through network requests to the deployed application at `http://localhost:33029`.

### URL Parameters
**None identified.** The application does not process query string parameters. All routes use either form data (POST) or cookies.

### POST Body Fields (Form Data)

**1. Username Field**
- **Endpoint:** `POST /login`
- **Parameter Name:** `username`
- **Processing Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, line 44
- **Code:** `username = request.form['username']`
- **Validation:** None (no length limits, character whitelists, or format checks)
- **Data Flow:** 
  - Line 44: Extract from form
  - Line 46: Dictionary lookup for authentication
  - Line 48: Encrypted into session cookie (if valid credentials)
- **Template Reference:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/templates/index.html`, line 8
- **Attack Surface:** Credential validation, session token generation, potential padding manipulation

**2. Password Field**
- **Endpoint:** `POST /login`
- **Parameter Name:** `password`
- **Processing Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, line 45
- **Code:** `password = request.form['password']`
- **Validation:** None (no complexity requirements, length limits)
- **Data Flow:**
  - Line 45: Extract from form
  - Line 46: Plaintext comparison against hardcoded passwords
  - No persistence (discarded after validation)
- **Template Reference:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/templates/index.html`, line 9
- **Attack Surface:** Brute-force attacks (no rate limiting)

### HTTP Headers
**None explicitly processed.** The application does not read custom headers. Standard headers (Host, User-Agent, Cookie, etc.) are processed by Flask/WSGI layer but not used in application logic.

### Cookie Values

**Session Cookie**
- **Cookie Name:** `session`
- **Set Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, line 49
- **Read Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, line 55
- **Format:** Hex-encoded string (encrypted data)
- **Expected Structure:** `hex(IV || AES-CBC-Ciphertext)`
- **Processing:**
  - Line 55: Retrieve cookie value
  - Line 60: Hex decode and decrypt: `bytes.fromhex(encrypted_data)`
  - Lines 27-36: Decryption function (extracts IV, decrypts ciphertext, strips padding)
- **Validation:** None before processing (relies on exception handling)
- **Attack Surface:** 
  - **PRIMARY ATTACK VECTOR:** Padding oracle exploitation
  - Hex decoding errors (line 60)
  - Decryption errors (exception disclosed at line 70)
  - Padding manipulation (null-byte stripping at line 35)
  - CBC bit-flipping attacks
  - Session forgery

**Cookie Processing Flow:**
```
Cookie Value (hex string)
  ↓ Line 60: bytes.fromhex()
Raw Encrypted Data (bytes)
  ↓ Line 28: Extract IV (first 16 bytes)
  ↓ Line 29: Extract ciphertext (remaining bytes)
  ↓ Lines 30-32: AES-CBC decryption
Padded Plaintext
  ↓ Line 35: rstrip(b'\x00') - Strip null bytes
Username (string)
  ↓ Line 63: Authorization check
```

### File Uploads
**None.** The application does not implement file upload functionality.

### JSON/API Parameters
**None.** The application does not have JSON API endpoints. All data exchange uses HTML forms and cookies.

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Web Browser | Public | External user accessing the application |
| Flask Application | Service | App | Python/Flask 3.0.3 | PII, Tokens, Secrets | Main application backend, runs in Docker container |
| Docker Container | Service | App | Docker/python:3.8-slim | All app data | Container hosting Flask application |
| Flag File | DataStore | App | Filesystem | Secrets | `/flag.txt` file containing CTF flag |
| In-Memory User DB | DataStore | App | Python dict | Secrets | Hardcoded user credentials in application memory |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Flask Application | Hosts: `http://localhost:33029`; Endpoints: `/`, `/login`, `/welcome`, `/static/*`; Auth: Encrypted cookie (session); Language: Python 3.8.20; Framework: Flask 3.0.3; Server: Werkzeug 3.0.6; Debug: Enabled; Key Dependencies: cryptography 42.0.8 |
| Docker Container | Base: `python:3.8-slim`; OS: Debian Bookworm; Ports: 8000 (internal) → 33029 (host); Network: Bridge; Running: `python app.py`; User: root (default); Health Check: `curl -f http://127.0.0.1:8000/` |
| Flag File | Path: `/flag.txt`; Permissions: Default (world-readable); Creation: Docker build time; Content: CTF flag value; Access: Read-only via application code (line 64) |
| In-Memory User DB | Type: Python dict; Persistence: None (volatile); Location: app.py lines 13-16; Users: test1, admin; Passwords: Plaintext; Modification: None (read-only at runtime) |
| User Browser | Client: Any modern browser; JavaScript: Not required; Cookies: Stores encrypted session; Network: HTTP (no TLS); Storage: Session cookies only |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → Flask Application | HTTP | `:33029 GET /` | None | Public |
| User Browser → Flask Application | HTTP | `:33029 POST /login` | None | Secrets (credentials in plaintext) |
| User Browser → Flask Application | HTTP | `:33029 GET /welcome` | auth:session_cookie | PII (username), Tokens |
| User Browser → Flask Application | HTTP | `:33029 GET /static/style.css` | None | Public |
| Flask Application → In-Memory User DB | Memory | In-process | None | Secrets (password comparison) |
| Flask Application → Flag File | Filesystem | `/flag.txt` read | auth:admin | Secrets (flag value) |
| Flask Application → User Browser | HTTP | Response with Set-Cookie | None | Tokens (encrypted session) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | Public endpoints have no authentication requirement (GET /, POST /login, GET /static/*). |
| auth:session_cookie | Auth | Requires valid encrypted session cookie containing username. Cookie must be hex-decodable and decryptable with application's AES key. Validated at line 60 of app.py. |
| auth:admin | Authorization | Requires decrypted username to equal 'admin' string. Simple string comparison at line 63 of app.py. No additional authorization checks or role-based access control. |

**Critical Finding:** The application has minimal authorization controls. Only two guards exist:
1. **Session existence** (implicit, line 58)
2. **Admin string comparison** (explicit, line 63)

No middleware, decorators, or centralized authorization framework. All checks are inline conditionals.

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 | Global | No authentication; can access GET / and POST /login |
| test1 (standard user) | 1 | Global | Authenticated user; hardcoded at lines 13-14; can access /welcome with username display |
| admin | 10 | Global | Privileged user; hardcoded at line 15; can access /welcome with flag disclosure (lines 63-65) |

**Note:** Role names are actually usernames. The application has no separate role system - the username field serves dual purpose as identity and role.

### 7.2 Privilege Lattice

**Privilege Ordering (→ means "can access resources of"):**
```
anonymous → test1 → admin
```

**Role Hierarchy:**
- **anonymous** (privilege level 0): Can only access public login page and submit credentials
- **test1** (privilege level 1): Can access authenticated welcome page with standard greeting
- **admin** (privilege level 10): Can access authenticated welcome page with flag disclosure

**No Parallel Isolation:** All roles are globally scoped with linear hierarchy. No organizational, team, or project-level isolation exists.

**Role Switching Mechanisms:** None. No impersonation features, no sudo mode, no role elevation.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` (login page) | `/`, `/login`, `/static/*` | None |
| test1 | `/welcome` | `/`, `/welcome`, `/static/*` | Encrypted session cookie (username='test1') |
| admin | `/welcome` | `/`, `/welcome`, `/static/*` | Encrypted session cookie (username='admin') |

**Note:** All authenticated users (both test1 and admin) access the same `/welcome` endpoint. Role-specific behavior is determined by inline conditional at line 63.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A |
| test1 | None | Session decryption success (line 60) | Encrypted cookie (client-side) |
| admin | None | Session decryption success (line 60) + `username == 'admin'` (line 63) | Encrypted cookie (client-side) |

**Implementation Details:**

**Role Storage:**
- File: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`
- Lines: 13-16 (hardcoded user database)
- Format: Python dictionary `{"username": "password"}`

**Role Validation:**
- Authentication: Line 46 (`if username in users and users[username] == password:`)
- Session validation: Line 60 (decryption success implies valid session)
- Authorization: Line 63 (`if username == 'admin':`)

**Critical Finding:** No role-based access control framework. Authorization is ad-hoc string comparison. No middleware, no decorators, no centralized permission system.

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**Result:** No horizontal privilege escalation opportunities identified.

**Reason:** The application has no user-specific resources or object IDs. All users of the same role (e.g., all standard users) have identical access. There are no endpoints accepting user IDs, document IDs, or other object identifiers that could allow accessing another user's data.

**Endpoints without object IDs:**
- `GET /` - Public, no user data
- `POST /login` - Public, no user data
- `GET /welcome` - User's own session only, no cross-user data access

### 8.2 Vertical Privilege Escalation Candidates

**Primary Attack Vector:** Padding Oracle Attack on Session Cookie

| Target Role | Endpoint Pattern | Functionality | Risk Level | Attack Method |
|-------------|------------------|---------------|------------|---------------|
| admin | `GET /welcome` | Flag file disclosure | **CRITICAL** | Padding oracle attack to forge admin session cookie |

**Detailed Attack Path:**

**Endpoint:** `GET /welcome`
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, lines 53-71
- **Current Access:** Requires valid encrypted session cookie
- **Target Privilege:** Admin (username='admin')
- **Current Privilege:** Standard user (username='test1') or anonymous

**Vulnerability Chain:**

1. **Padding Oracle Vulnerability**
   - **Location:** Lines 27-36 (decryption), Line 35 (padding removal)
   - **Mechanism:** 
     ```python
     plaintext = padded_plaintext.rstrip(b'\x00')  # Line 35
     ```
   - **Issue:** Null-byte padding removal is non-standard and creates distinguishable error conditions

2. **Error Message Disclosure**
   - **Location:** Line 70
   - **Code:** `return str(e)`
   - **Issue:** Raw exception messages returned to client reveal decryption/padding failures

3. **No Message Authentication**
   - **Location:** Entire encryption/decryption implementation (lines 18-36)
   - **Issue:** No HMAC, no signature, no authenticated encryption (AES-GCM)
   - **Impact:** Ciphertext can be manipulated without detection

**Exploitation Steps:**
1. Authenticate as `test1:test1` to obtain valid session cookie
2. Capture session cookie value (hex-encoded ciphertext)
3. Use padding oracle attack tool (e.g., PadBuster) to decrypt cookie byte-by-byte
4. Revealed plaintext: `test1` (with null-byte padding)
5. Encrypt new payload: `admin` (with proper padding)
6. Replace session cookie with forged admin session
7. Access `GET /welcome` with admin session
8. Flag disclosed at line 64-65

**Technical Details:**
- **Attack Complexity:** Medium (requires 2000-5000 HTTP requests for decryption)
- **Prerequisites:** Access to any valid session (or no session - can forge from scratch)
- **Success Rate:** 100% (deterministic cryptographic attack)
- **Tools:** PadBuster, custom Python scripts, Burp Suite Intruder

**Code References for Exploitation:**
- Padding oracle endpoint: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py:53-71`
- Error disclosure: Line 70
- Encryption function (for forging): Lines 18-25
- Decryption function (target): Lines 27-36
- Admin check (bypass target): Line 63
- Flag disclosure (goal): Lines 64-65

### 8.3 Context-Based Authorization Candidates

**Result:** No multi-step workflow endpoints identified.

**Reason:** The application has a simple two-step authentication flow (login → welcome) with no complex workflows, multi-step forms, checkout processes, or state-dependent operations.

**Existing Flow:**
1. `GET /` - Display login form (no state required)
2. `POST /login` - Validate credentials (stateless)
3. `GET /welcome` - Display content (session-based, but not workflow-dependent)

No endpoints assume prior workflow steps or have state-based authorization that could be bypassed by direct access.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Analysis limited to network-accessible code paths through the deployed Flask application at `http://localhost:33029`.

### Command Injection Sources

**Result:** **NO COMMAND INJECTION SOURCES FOUND IN NETWORK-ACCESSIBLE CODE**

**Analysis:**
The application imports the `os` module but only uses it for cryptographic random number generation:
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`
- **Line 10:** `key = os.urandom(32)` - Generates encryption key (no user input)
- **Line 19:** `iv = os.urandom(16)` - Generates IV (no user input)

**Functions Checked:**
- ❌ No `os.system()` calls
- ❌ No `subprocess` module usage
- ❌ No `exec()` or `eval()` calls
- ❌ No `popen()` usage
- ❌ No shell command construction with user input
- ❌ No `commands` module usage

**Input Vectors Analyzed:**
1. **Username field** (line 44): Used only for dictionary lookup and encryption
2. **Password field** (line 45): Used only for string comparison
3. **Session cookie** (line 55): Used only for decryption and authorization

**Conclusion:** No user-controlled data flows into shell commands or system execution functions.

### SQL Injection Sources

**Result:** **NO SQL INJECTION SOURCES FOUND IN NETWORK-ACCESSIBLE CODE**

**Analysis:**
The application has no database connectivity:
- ❌ No SQLite, MySQL, PostgreSQL, or MongoDB libraries imported
- ❌ No SQLAlchemy or other ORM frameworks
- ❌ No raw SQL query construction
- ❌ No database connection strings

**Data Storage:**
- **User credentials:** In-memory Python dictionary (lines 13-16)
- **Session data:** Client-side encrypted cookie
- **Flag data:** Filesystem (`/flag.txt`)

**Authentication Implementation:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`
- **Line 46:** `if username in users and users[username] == password:`
- **Method:** Simple dictionary lookup (no SQL queries)

**Input Vectors Analyzed:**
1. **Username field** (line 44): Dictionary key lookup only
2. **Password field** (line 45): Dictionary value comparison only
3. **Session cookie** (line 55): Decryption only

**Conclusion:** No user-controlled data flows into database queries. The application is database-free.

### Summary

**Total Command Injection Sources:** 0  
**Total SQL Injection Sources:** 0

The application's minimal attack surface and lack of database/shell integration eliminates traditional injection vulnerabilities. The primary attack vector is the **cryptographic padding oracle vulnerability** in the session management system, not code injection.

---

## APPENDIX A: Critical Security Findings Summary

### CRITICAL Severity Issues

1. **Padding Oracle Vulnerability**
   - **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py`, lines 18-36, 70
   - **Impact:** Complete session decryption and forgery, privilege escalation to admin
   - **Root Cause:** Null-byte padding + no MAC + error disclosure

2. **Plaintext Password Storage**
   - **Location:** Lines 13-16
   - **Impact:** Complete credential compromise if source code accessed
   - **Root Cause:** Hardcoded passwords in source code

3. **Missing Cookie Security Flags**
   - **Location:** Line 49
   - **Impact:** Session hijacking via XSS, MITM attacks, CSRF
   - **Root Cause:** No HttpOnly, Secure, SameSite flags

4. **Debug Mode Enabled**
   - **Location:** Line 74
   - **Impact:** Information disclosure, potential RCE via Werkzeug debugger
   - **Root Cause:** `debug=True` in production

5. **Exception Disclosure**
   - **Location:** Line 70
   - **Impact:** Padding oracle enabler, information leakage
   - **Root Cause:** `return str(e)` exposes exception details

### HIGH Severity Issues

6. **No Input Validation**
   - **Location:** Lines 44-45, 55
   - **Impact:** Lack of defense-in-depth
   - **Root Cause:** Direct use of user input without validation

7. **Ephemeral Encryption Key**
   - **Location:** Line 10
   - **Impact:** All sessions invalidated on restart
   - **Root Cause:** `os.urandom(32)` with no persistence

8. **No Rate Limiting**
   - **Location:** `/login` endpoint
   - **Impact:** Brute-force attacks, padding oracle exploitation
   - **Root Cause:** No throttling mechanism

9. **Sensitive Data Logging**
   - **Location:** Lines 33, 56, 61
   - **Impact:** Session cookies and usernames logged in plaintext
   - **Root Cause:** DEBUG log level with sensitive data

10. **No TLS/HTTPS**
    - **Location:** Application configuration
    - **Impact:** Credentials and sessions transmitted in plaintext
    - **Root Cause:** HTTP-only deployment

---

## APPENDIX B: File Reference Index

### Application Code
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/app.py` - Main Flask application (76 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/templates/index.html` - Login form template
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/templates/welcome.html` - Welcome page template
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/static/style.css` - CSS styling

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/docker-compose.yml` - Container orchestration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/Dockerfile` - Container build instructions
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/.env` - Environment variables (FLAG)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-103-24/app/requirements.txt` - Python dependencies

### Runtime Files
- `/flag.txt` (in container) - CTF flag file

---

**End of Reconnaissance Deliverable**