# Reconnaissance Deliverable

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

## 1. Executive Summary

This Django 3.2 web application is a minimalist greeting service with a **CRITICAL Server-Side Template Injection (SSTI) vulnerability** that exposes sensitive FLAG data. The application presents an exceptionally small attack surface with only three network-accessible endpoints (`/`, `/greet/`, `/admin/`), but suffers from fundamental security misconfigurations including DEBUG mode enabled, hardcoded secrets, lack of HTTPS enforcement, and absence of rate limiting.

The core technology stack consists of:
- **Backend:** Django 3.2 running on Python 3.9-slim via Django's development server (WSGIServer)
- **Database:** SQLite3 (file-based, unencrypted)
- **Frontend:** Server-side rendered HTML templates with no JavaScript
- **Infrastructure:** Docker containerized, HTTP-only (no TLS), no reverse proxy or WAF

**Primary Attack Vector:** The `/greet/` endpoint concatenates unsanitized user input directly into Django template strings before compilation, allowing attackers to inject template syntax and extract the FLAG variable from the template context. This vulnerability is compounded by the flag being loaded from `/flag.txt` and exposed in every request's template context.

**Authorization Architecture:** The application has a minimal two-tier privilege model: anonymous users (access to `/` and `/greet/`) and staff users (access to `/admin/`). Django's built-in session-based authentication is used exclusively for the admin interface, with no custom authentication or authorization logic implemented.

The application would fail any security audit and requires immediate remediation before any production deployment.

## 2. Technology & Service Map

### Frontend
- **Framework:** Server-side rendered HTML templates (Django Template Language)
- **JavaScript:** None - zero client-side code
- **CSS:** None - no styling beyond browser defaults
- **Client-Side Libraries:** None
- **Authentication Libraries:** None (server-side only)

### Backend
- **Language:** Python 3.9.24
- **Framework:** Django 3.2 (LTS version, released April 2021)
- **Web Server:** Django development server (WSGIServer/0.2 CPython/3.9.24)
- **WSGI Server:** None - using Django's built-in development server
- **Key Dependencies:** Only Django 3.2 (`requirements.txt` contains single dependency)
- **Template Engine:** Django Template Language (DTL)
- **Authentication:** Django's built-in ModelBackend with PBKDF2-SHA256 password hashing

### Infrastructure
- **Hosting Provider:** Docker container (local deployment)
- **Container Base Image:** python:3.9-slim
- **CDN:** None
- **Reverse Proxy:** None
- **Load Balancer:** None
- **WAF:** None
- **Database Type:** SQLite3 (file-based at `/app/db.sqlite3`)
- **Port Exposed:** 8000 (mapped to 45121 on host)
- **Protocol:** HTTP only (no TLS/SSL)

### Identified Subdomains
From subfinder scan (not directly relevant to localhost:45121 target):
- www.localhost
- naeu2.naeuinc.localhost
- mail.localhost
- autodiscover.regency.localhost
- mail02.regency.localhost
- mse-ca-mail.corp.mse.localhost
- owa.regency.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- server02.counterintel.localhost
- fndlync01.5ninesdata.localhost
- autodiscover.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- mail03.regency.localhost
- mail.regency.localhost

**Note:** These subdomains appear to be false positives from subfinder's passive enumeration and are not relevant to the target application at localhost:45121.

### Open Ports & Services
From nmap scan of localhost:
- **Port 80/tcp:** Caddy httpd (not the target application)
- **Port 443/tcp:** SSL/HTTPS (not the target application)
- **Port 631/tcp:** CUPS printing service (not the target application)
- **Port 5003/tcp:** Werkzeug/3.0.3 Python/3.8.17 serving "MedGuard" application (not the target application)
- **Port 8888/tcp:** sun-answerbook service (not the target application)
- **Port 45121/tcp:** **TARGET APPLICATION** - Django 3.2 application (WSGIServer)
- **Port 49158/tcp:** Golang net/http server with Tailscale (not the target application)

**Target Application Port:** 45121 (HTTP only, no HTTPS)

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary Authentication Endpoint:** `/admin/login/` (Django built-in admin login)
- **Protected Resource:** `/admin/` (Django admin interface)
- **Public Endpoints:** `/` (index), `/greet/` (greeting service)
- **No Custom Auth Endpoints:** No `/login`, `/register`, `/logout`, `/password-reset` for regular users

### Mechanism

**Step-by-Step Authentication Flow:**

1. **Unauthenticated Access to Protected Resource:**
   - User navigates to `http://localhost:45121/admin/`
   - AuthenticationMiddleware detects no valid session
   - Django admin's `@login_required` decorator triggers redirect
   - **Response:** HTTP 302 redirect to `/admin/login/?next=/admin/`

2. **Login Form Display:**
   - Request arrives at `/admin/login/`
   - SessionMiddleware creates new empty session
   - CsrfViewMiddleware generates 64-character random CSRF token
   - CSRF token stored in cookie: `csrftoken=<token>; Max-Age=31449600; SameSite=Lax`
   - Login form rendered with hidden CSRF field and username/password inputs
   - **Response:** HTTP 200 with login form HTML

3. **Credential Submission:**
   - User submits: `POST /admin/login/` with `username`, `password`, `csrfmiddlewaretoken`, `next=/admin/`
   - CsrfViewMiddleware validates CSRF token (compares POST data with cookie)
   - Credentials passed to `django.contrib.auth.authenticate()`
   - ModelBackend queries database: `SELECT * FROM auth_user WHERE username=?`
   - Password verified using PBKDF2-SHA256 (260,000 iterations)
   - User object returned if valid and `is_active=True`

4. **Session Creation:**
   - `django.contrib.auth.login()` called with authenticated user
   - 32-character random session key generated
   - User ID stored in session: `request.session[SESSION_KEY] = user.pk`
   - Session persisted to database: `INSERT INTO django_session`
   - Session data signed with SECRET_KEY (not encrypted)
   - Session key cycled to prevent session fixation

5. **Session Cookie Set:**
   - SessionMiddleware sets cookie in response
   - Cookie: `sessionid=<32-char-key>; HttpOnly; Max-Age=1209600; Path=/; SameSite=Lax`
   - **Security Flags:**
     - ✅ HttpOnly=True (JavaScript cannot access)
     - ❌ Secure=False (sent over HTTP - CRITICAL vulnerability)
     - ⚠️ SameSite=Lax (moderate CSRF protection)
   - **Response:** HTTP 302 redirect to `/admin/`

6. **Authenticated Request:**
   - User follows redirect with session cookie
   - SessionMiddleware loads session from database using cookie value
   - Session data decoded and signature verified with SECRET_KEY
   - AuthenticationMiddleware loads user object and attaches to request: `request.user`
   - Admin page checks `user.is_staff` and `user.is_active`
   - **Response:** HTTP 200 with admin dashboard

### Code Pointers

**URL Routing:** `/app/webapp/urls.py:6`
```python
path('admin/', admin.site.urls),
```

**Middleware Stack:** `/app/webapp/settings.py:33-41`
```python
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',      # Line 34
    'django.contrib.sessions.middleware.SessionMiddleware', # Line 35 - Session handling
    'django.middleware.common.CommonMiddleware',           # Line 36
    'django.middleware.csrf.CsrfViewMiddleware',          # Line 37 - CSRF protection
    'django.contrib.auth.middleware.AuthenticationMiddleware', # Line 38 - Auth
    'django.contrib.messages.middleware.MessageMiddleware',    # Line 39
    'django.middleware.clickjacking.XFrameOptionsMiddleware',  # Line 40
]
```

**Session Configuration (Defaults):** `/app/webapp/settings.py` (not explicitly configured, using Django 3.2 defaults)
- Session engine: `django.contrib.sessions.backends.db` (database-backed)
- Cookie name: `sessionid`
- Lifetime: 1,209,600 seconds (14 days)
- Storage: SQLite database at `/app/db.sqlite3`

**Database Configuration:** `/app/webapp/settings.py:67-72`
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
```

**Password Hashers (Default):** Uses Django 3.2 default PBKDF2-SHA256 with 260,000 iterations

**Password Validators:** `/app/webapp/settings.py:78-91`
```python
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},  # min 8 chars
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
```

**Authentication Backend (Default):** `django.contrib.auth.backends.ModelBackend` (not explicitly configured)

**SECRET_KEY:** `/app/webapp/settings.py:13`
```python
SECRET_KEY = 'django-insecure-+@i)-n58!b8#v^)-+s!8$#l@7z%b^!52rrn4kl+^9-@riokc5r'
```
**CRITICAL:** Hardcoded in source code, exposed in version control

### 3.1 Role Assignment Process

**Role Determination:** Django's built-in User model with boolean flags
- Roles stored in `auth_user` table columns: `is_staff`, `is_superuser`, `is_active`
- No custom role models or Group-based permissions implemented

**Default Role:** Anonymous (unauthenticated)
- All users start as anonymous with access to public endpoints only
- No self-registration endpoint exists in the application

**Role Upgrade Path:** Manual database modification only
- No user registration flow
- No admin interface for creating users (database uninitialized)
- To create staff user: `python manage.py createsuperuser` (CLI only, not network-accessible)

**Code Implementation:**
- User model: Django built-in `django.contrib.auth.models.User`
- No custom user model defined (no `AUTH_USER_MODEL` in settings)
- Role checks: `user.is_staff`, `user.is_superuser`, `user.is_active`

### 3.2 Privilege Storage & Validation

**Storage Location:**
1. **Database:** `/app/db.sqlite3` - `auth_user` table
   - Columns: `is_staff`, `is_superuser`, `is_active`
   - Persistent storage for user attributes

2. **Session Data:** Database-backed sessions in `django_session` table
   - Session stores user ID (not privilege flags directly)
   - Session data: `{SESSION_KEY: user.pk, BACKEND_SESSION_KEY: 'ModelBackend', HASH_SESSION_KEY: hash}`

3. **Request Object:** Attached by AuthenticationMiddleware
   - `request.user` object loaded from database on each authenticated request
   - Privilege flags accessed in real-time from User model

**Validation Points:**
1. **AuthenticationMiddleware** (`/app/webapp/settings.py:38`)
   - Runs on every request
   - Loads user from session
   - Attaches `request.user` to request object

2. **Admin Site Authorization** (Django built-in)
   - `AdminSite.has_permission()` checks `user.is_active` and `user.is_staff`
   - File: Django core `django/contrib/admin/sites.py`
   - Called on every admin page access

3. **No Custom Authorization Checks:**
   - `/` and `/greet/` endpoints have zero authorization checks
   - No `@login_required`, `@permission_required`, or `@user_passes_test` decorators

**Cache/Session Persistence:**
- Session lifetime: 14 days (1,209,600 seconds)
- Privileges not cached - loaded from database on each request
- Session only stores user ID, not privilege flags
- No explicit session refresh mechanism

**Code Pointers:**
- User model: Django built-in (`django.contrib.auth.models.User`)
- Middleware: `/app/webapp/settings.py:38` (AuthenticationMiddleware)
- Session config: `/app/webapp/settings.py:35` (SessionMiddleware)
- No custom authorization code in `/app/webapp/views.py`

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None
- No "switch user" functionality implemented
- No admin impersonation capabilities
- No "view as" features

**Role Switching:** None
- No temporary privilege elevation (no "sudo mode")
- No role delegation mechanisms
- Privileges are static based on database flags

**Audit Trail:** Minimal
- Django logs authentication events at INFO level
- No custom audit logging implemented
- No logging configuration in `/app/webapp/settings.py`
- Default Django logging to stdout/stderr only

**Code Implementation:** None
- No impersonation code exists in the application
- No custom middleware or decorators for role switching

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints are listed. Management commands, CLI tools, and local-only utilities are excluded.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| ALL | `/` | anon | None | None | Renders static HTML form for name input. No authentication or authorization. **Code:** `/app/webapp/views.py:16-17` - `index()` function renders `index.html` template. |
| ALL | `/greet/` | anon | None | None | **CRITICAL VULNERABILITY:** Accepts GET parameter `name` and concatenates unsanitized input into Django template string before compilation, causing SSTI. FLAG file loaded into template context. No authentication or authorization. **Code:** `/app/webapp/views.py:7-14` - `greet()` function with `engine.from_string()` vulnerability at line 9. |
| GET, POST | `/admin/` | staff | None | Session + `is_staff=True` + `is_active=True` | Django admin dashboard. Requires authenticated session with staff privileges. **Code:** Django built-in admin, registered in `/app/webapp/urls.py:6`. |
| GET, POST | `/admin/login/` | anon | None | None (public login form) | Django admin login page. Accepts username/password POST. CSRF protection enabled. **Code:** Django built-in admin login view. |
| POST | `/admin/logout/` | staff | None | Session + `is_staff=True` | Django admin logout. Destroys session. **Code:** Django built-in admin logout view. |
| GET, POST | `/admin/<app>/<model>/` | staff | None | Session + model permissions | Django admin model list views. Requires staff status and specific model permissions. **Code:** Django built-in admin. |
| GET, POST | `/admin/<app>/<model>/<pk>/` | staff | `<pk>` (object primary key) | Session + model change permission | Django admin model edit views. Requires change permission for specific model. Object-level authorization via Django admin. **Code:** Django built-in admin. |
| POST | `/admin/<app>/<model>/<pk>/delete/` | staff | `<pk>` (object primary key) | Session + model delete permission | Django admin model delete confirmation. Requires delete permission. **Code:** Django built-in admin. |

**Notes:**
- Custom endpoints (`/`, `/greet/`) accept ALL HTTP methods (GET, POST, PUT, DELETE, etc.) with no restrictions
- No `@require_http_methods`, `@require_GET`, or `@require_POST` decorators used
- CSRF protection applies globally to POST/PUT/PATCH/DELETE via middleware, but `/greet/` uses GET and bypasses CSRF
- No rate limiting on any endpoints
- No custom API endpoints (no REST API, GraphQL, or JSON responses)
- Django admin endpoints follow standard Django authorization patterns

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only input vectors accessible through the target web application's network interface are listed. Local-only scripts, build tools, and CLI arguments are excluded.

### URL Parameters

**Endpoint: `/greet/`**
- **Parameter:** `name`
- **Access Method:** `request.GET.get("name")`
- **Location:** `/app/webapp/views.py:9`
- **Validation:** None
- **Sanitization:** None
- **Usage:** Directly concatenated into template string before compilation
- **Vulnerability:** SSTI (Server-Side Template Injection)
- **Example:** `http://localhost:45121/greet/?name={{FLAG}}`

**Endpoint: `/admin/login/`**
- **Parameter:** `next`
- **Access Method:** Query parameter and hidden form field
- **Validation:** Django built-in (validates redirect target)
- **Usage:** Post-login redirect destination
- **Vulnerability:** Potential open redirect if validation bypassed

### POST Body Fields (JSON/Form)

**Endpoint: `/admin/login/` (POST)**
- **Field:** `username`
  - **Type:** Text input
  - **Validation:** Django User model validators (max_length=150, required)
  - **Location:** Django built-in admin login form
  - **HTML:** `<input type="text" name="username" maxlength="150" required>`

- **Field:** `password`
  - **Type:** Password input
  - **Validation:** Password validators (similarity, min length 8, common passwords, numeric)
  - **Location:** Django built-in admin login form
  - **HTML:** `<input type="password" name="password" required>`

- **Field:** `csrfmiddlewaretoken`
  - **Type:** Hidden field
  - **Validation:** CSRF middleware validates against cookie
  - **Location:** Django built-in CSRF protection
  - **HTML:** `<input type="hidden" name="csrfmiddlewaretoken" value="...">`

**Endpoint: `/admin/` (Various POST operations)**
- **Fields:** Model-specific fields for CRUD operations
- **Validation:** Django model field validators and form validation
- **Location:** Django built-in admin forms
- **Note:** Only accessible to authenticated staff users

### HTTP Headers

**Headers Accessed by Django Framework:**
- `Host` - Used for ALLOWED_HOSTS validation
- `Cookie` - Session and CSRF cookies
- `Referer` - CSRF validation fallback
- `User-Agent` - Logged in default Django logging

**Custom Application Access:** None
- No custom views access `request.META` for headers
- No X-Forwarded-For, X-Real-IP, or custom header processing in `/app/webapp/views.py`

**Search Result:** `grep -rn "request.META" /app/webapp/ --include="*.py"` returned no matches

### Cookie Values

**CSRF Token Cookie:**
- **Name:** `csrftoken`
- **Set By:** CsrfViewMiddleware (`/app/webapp/settings.py:37`)
- **Validation:** Compared with `csrfmiddlewaretoken` POST field
- **Max-Age:** 31,449,600 seconds (1 year)
- **Flags:** SameSite=Lax (no Secure, no HttpOnly)

**Session Cookie:**
- **Name:** `sessionid`
- **Set By:** SessionMiddleware (`/app/webapp/settings.py:35`)
- **Validation:** Signature verified with SECRET_KEY, database lookup
- **Max-Age:** 1,209,600 seconds (14 days)
- **Flags:** HttpOnly, SameSite=Lax (no Secure)

**Custom Application Access:** None
- No custom views read cookies directly
- No `request.COOKIES` access in `/app/webapp/views.py`

### File Uploads

**Status:** Not supported
- No file upload endpoints exist
- No `FileField`, `ImageField`, or `request.FILES` usage
- No file upload forms in templates
- Search result: `grep -rn "request.FILES\|FileField\|ImageField" /app/` returned no matches

### Additional Input Vectors

**Path Parameters:** None
- No URL patterns with path converters (e.g., `<int:id>`, `<slug:slug>`)
- Django admin has built-in path parameters for model PKs (e.g., `/admin/auth/user/1/`)

**WebSocket Connections:** None
- No WebSocket support detected
- No Django Channels or ASGI configuration

**GraphQL/REST API:** None
- No REST framework (Django REST Framework not in dependencies)
- No GraphQL (graphene-django not in dependencies)
- No JSON API endpoints

**Form Fields (HTML):**
- **Endpoint: `/` (index.html template)**
  - **Field:** `name` (text input)
  - **Submits to:** `/greet/` via GET method
  - **HTML:** `<input type="text" id="name" name="name">`
  - **Validation:** None (no required, pattern, maxlength attributes)

### Input Vector Summary Table

| Input Type | Endpoint | Parameter/Field | Validation | Sanitization | File:Line | Vulnerability |
|------------|----------|-----------------|------------|--------------|-----------|---------------|
| Query Param | `/greet/` | `name` | None | None | `views.py:9` | **SSTI** |
| POST Field | `/admin/login/` | `username` | Django User model | Django built-in | Django admin | None |
| POST Field | `/admin/login/` | `password` | Password validators | Hashed | Django admin | Brute force (no rate limit) |
| POST Field | `/admin/login/` | `csrfmiddlewaretoken` | CSRF validation | Django built-in | Django admin | None |
| Cookie | All endpoints | `sessionid` | Signature + DB lookup | Django built-in | `settings.py:35` | Session hijacking (no Secure flag) |
| Cookie | All endpoints | `csrftoken` | Token comparison | Django built-in | `settings.py:37` | Token theft (no Secure flag) |
| Header | All endpoints | `Host` | ALLOWED_HOSTS check | Django built-in | `settings.py:18` | None |

## 6. Network & Interaction Map

**Network Surface Focus:** Only network-accessible components are mapped. Local development environments, build CI systems, and local-only tools are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External User | ExternAsset | Internet | Browser | None | Unauthenticated external attacker or legitimate user |
| DjangoApp | Service | App | Django 3.2 / Python 3.9 | PII, Tokens, Secrets | Main application backend running on port 8000 (exposed as 45121) |
| SQLite-DB | DataStore | Data | SQLite 3 | PII, Tokens, Secrets | File-based database at `/app/db.sqlite3`, stores sessions and user data |
| Filesystem | DataStore | Data | Container FS | Secrets | Contains `/flag.txt` with sensitive data, unencrypted |
| AdminUser | Identity | Admin | Django User | PII | Staff/superuser with access to Django admin interface |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| DjangoApp | Hosts: `http://localhost:8000` (container), `http://localhost:45121` (host); Endpoints: `/`, `/greet/`, `/admin/*`; Auth: Session cookies (sessionid); Dependencies: SQLite-DB, Filesystem; Server: WSGIServer/0.2 CPython/3.9.24; Framework: Django 3.2 |
| SQLite-DB | Engine: `SQLite 3`; Location: `/app/db.sqlite3`; Exposure: `Internal Only (container filesystem)`; Consumers: `DjangoApp`; Tables: `django_session`, `auth_user`, `django_content_type`, `django_migrations`; Encryption: `None (plaintext)` |
| Filesystem | Type: `Docker Container Filesystem`; Mount: `/app` working directory; Sensitive Files: `/flag.txt` (contains FLAG), `/app/db.sqlite3` (database); Permissions: `Default container permissions`; Encryption: `None` |
| AdminUser | Authentication: `Session-based with username/password`; Session Lifetime: `14 days`; Password Hash: `PBKDF2-SHA256 (260,000 iterations)`; Privileges: `is_staff=True, is_superuser=True` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| External User → DjangoApp | HTTP | `:45121 /` | None | Public |
| External User → DjangoApp | HTTP | `:45121 /greet/` | None | Public, Secrets (FLAG exposed via SSTI) |
| External User → DjangoApp | HTTP | `:45121 /admin/login/` | None | Public |
| External User → DjangoApp | HTTP | `:45121 /admin/` | auth:staff | PII, Secrets |
| AdminUser → DjangoApp | HTTP | `:45121 /admin/*` | auth:staff, auth:active | PII, Tokens, Secrets |
| DjangoApp → SQLite-DB | File I/O | `db.sqlite3` | container-only | PII, Tokens, Secrets |
| DjangoApp → Filesystem | File I/O | `/flag.txt` | container-only | Secrets (FLAG) |
| DjangoApp → External User | HTTP | Response | None | Public (or Secrets if SSTI exploited) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:staff | Authorization | Requires authenticated user with `is_staff=True` flag in Django User model. Enforced by Django admin's `AdminSite.has_permission()` check. |
| auth:active | Auth | Requires user account to have `is_active=True` flag. Prevents disabled accounts from authenticating. |
| auth:superuser | Authorization | Requires `is_superuser=True` flag. Grants all permissions in Django admin. Only checked for sensitive admin operations. |
| session:valid | Auth | Requires valid session cookie (`sessionid`) with signature verified against SECRET_KEY and session data loaded from database. |
| csrf:valid | Protocol | Requires valid CSRF token for POST/PUT/PATCH/DELETE requests. Token must match between cookie (`csrftoken`) and form field (`csrfmiddlewaretoken`). Enforced by CsrfViewMiddleware. |
| container-only | Network | Access restricted to within Docker container. Not accessible from external network. |

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|----------------|--------------|---------------------|
| anonymous | 0 | Global | No authentication required. Default state for all unauthenticated requests. Implicit in Django - no code check needed. |
| authenticated | 1 | Global | Valid session cookie with `is_active=True`. Check: `request.user.is_authenticated`. Not explicitly used in this application. |
| staff | 5 | Global | Authenticated user with `is_staff=True` flag. Check: `request.user.is_staff` in `AdminSite.has_permission()`. Django built-in. |
| superuser | 10 | Global | Authenticated user with `is_superuser=True` flag. Check: `request.user.is_superuser`. Grants all Django admin permissions. Django built-in. |

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "has all permissions of"):
anonymous → authenticated → staff → superuser

Hierarchy Details:
- anonymous (level 0): Access to /, /greet/, /admin/login/
- authenticated (level 1): Same as anonymous (no authenticated-only endpoints exist)
- staff (level 5): All of above + /admin/* (Django admin access)
- superuser (level 10): All of above + all Django admin permissions without explicit grant

Linear Hierarchy:
- No parallel isolation
- No role-based access control beyond staff/superuser
- No custom roles or groups implemented
- No tenant/organization/team-based isolation
```

**Note:** No role switching, impersonation, or sudo mode mechanisms exist.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| anonymous | `/` | `/`, `/greet/`, `/admin/login/` | None (no authentication) |
| authenticated | N/A | Same as anonymous (no auth-only endpoints) | Session cookie (but no endpoints require just auth) |
| staff | `/admin/` | `/admin/*`, `/`, `/greet/` | Session cookie + `is_staff=True` |
| superuser | `/admin/` | `/admin/*` (all permissions), `/`, `/greet/` | Session cookie + `is_superuser=True` |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None (no middleware blocks anonymous) | No checks (implicit) | N/A (no session) |
| authenticated | SessionMiddleware (`settings.py:35`), AuthenticationMiddleware (`settings.py:38`) | `request.user.is_authenticated` (not used in custom views) | Session: `django_session` table, stores user ID |
| staff | Same as authenticated | `user.is_staff and user.is_active` in `AdminSite.has_permission()` | Database: `auth_user.is_staff` column |
| superuser | Same as authenticated | `user.is_superuser` for permission bypass | Database: `auth_user.is_superuser` column |

**Code Locations:**
- Middleware: `/app/webapp/settings.py:33-41`
- No custom authorization code in `/app/webapp/views.py` (custom endpoints have zero authorization)
- Admin authorization: Django built-in (`django/contrib/admin/sites.py`)

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

**Analysis:** The application has minimal object-level access control. Django admin has built-in object-level authorization, but no custom endpoints implement object ownership checks.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|------------------|---------------------|-----------|-------------|
| N/A | `/admin/auth/user/<id>/` | `<id>` (user PK) | user_data | Django admin has built-in checks (not vulnerable) |
| N/A | `/admin/auth/user/<id>/password/` | `<id>` (user PK) | credentials | Django admin has built-in checks (not vulnerable) |

**Conclusion:** No custom endpoints with object IDs exist. Django admin's built-in authorization prevents horizontal escalation. `/greet/` endpoint has no object parameters.

**Note for Authorization Specialist:** The application is too minimal to have traditional IDOR vulnerabilities. Focus on the vertical escalation vector (anonymous → staff).

### 8.2 Vertical Privilege Escalation Candidates

**High Priority:** The primary authorization boundary is between anonymous users and staff users.

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|------------------|---------------|------------|
| staff | `/admin/` | Django admin dashboard access | High |
| staff | `/admin/auth/user/` | User management (view all users) | High |
| staff | `/admin/auth/user/add/` | Create new users (including staff/superuser) | High |
| staff | `/admin/auth/user/<id>/` | Edit any user account (including privilege escalation) | High |
| staff | `/admin/auth/user/<id>/password/` | Change any user's password | High |
| staff | `/admin/auth/group/` | Manage permission groups | Medium |

**Escalation Path Analysis:**
1. **Anonymous → Staff:** Primary boundary to test
   - No bypass vectors identified in code analysis
   - Django admin requires `is_staff=True` check
   - No endpoints grant staff privileges
   - Database modification required (not network-accessible)

2. **Staff → Superuser:** Secondary boundary (less critical)
   - Staff users can edit other users via Django admin
   - Staff user with access to `/admin/auth/user/<id>/` can set `is_superuser=True` on their own account
   - This is a feature, not a vulnerability (staff users are trusted)

**Testing Recommendations:**
- Attempt direct access to `/admin/` without authentication
- Attempt session fixation/hijacking (session cookies sent over HTTP)
- Test for session token predictability (unlikely with Django's strong randomness)
- Brute force `/admin/login/` credentials (no rate limiting)
- Exploit SSTI at `/greet/` to extract session cookies or SECRET_KEY

### 8.3 Context-Based Authorization Candidates

**Analysis:** The application has no multi-step workflows or state-dependent authorization.

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|----------|----------------------|------------------|
| N/A | N/A | N/A | N/A |

**Conclusion:** No context-based authorization vulnerabilities exist. The application has no wizards, checkout flows, or multi-step processes that could be bypassed.

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources reachable through network-accessible endpoints are listed. Local-only scripts, CLI applications, and build tools are excluded.

### Command Injection Sources

**Status:** NONE FOUND

**Analysis:** Comprehensive search of all Python files for command execution functions:
- `os.system()` - Not found
- `subprocess.call()`, `subprocess.run()`, `subprocess.Popen()` - Not found
- `os.popen()` - Not found
- `commands.getoutput()` - Not found
- `eval()` with shell operations - Not found
- `exec()` with system commands - Not found

**Files Analyzed:**
- `/app/webapp/views.py`
- `/app/webapp/urls.py`
- `/app/webapp/settings.py`
- `/app/webapp/wsgi.py`
- `/app/webapp/__init__.py`
- `/app/manage.py` (CLI only - not network-accessible)

**Conclusion:** Zero command injection vulnerabilities in network-accessible code paths.

### SQL Injection Sources

**Status:** NONE FOUND

**Analysis:** Comprehensive search for raw SQL query patterns:
- `cursor.execute()` with string formatting - Not found
- `Model.objects.raw()` - Not found
- `.extra()` method - Not found
- String interpolation in SQL (%, .format(), f-strings) - Not found
- Direct SQL operations - Not found

**Database Interaction:**
- Framework: Django ORM (uses parameterized queries by default)
- No custom models defined (no `models.py` file exists)
- No raw SQL queries in any view code
- Django admin uses ORM exclusively

**Conclusion:** Zero SQL injection vulnerabilities. The application uses Django's ORM which provides automatic protection via parameterized queries.

### Template Injection Sources (CRITICAL)

**Status:** 1 CRITICAL VULNERABILITY FOUND

**Injection Source 1: Server-Side Template Injection (SSTI)**

**Type:** Template Injection
**Severity:** CRITICAL
**Location:** `/app/webapp/views.py:9`
**Endpoint:** `/greet/`
**HTTP Method:** GET
**Dangerous Function:** `engine.from_string()`
**User Input Source:** `request.GET.get("name")`

**Data Flow:**
```
HTTP Request: GET /greet/?name=<PAYLOAD>
    ↓
request.GET.get("name")  [views.py:9]
    ↓
String concatenation: "<html><body><h1>Hello, "+<PAYLOAD>+"</h1></body></html>"
    ↓
engine.from_string(<concatenated_string>)  [views.py:9]
    ↓
template.render(context={'FLAG': flag}, request)  [views.py:14]
    ↓
HttpResponse returned to user
```

**Vulnerable Code:**
```python
def greet(request):                                    # Line 7
    engine = engines["django"]                         # Line 8
    template = engine.from_string("<html><body><h1>Hello, "+request.GET.get("name")+"</h1></body></html>")  # Line 9 - VULNERABILITY
    flag = open('/flag.txt').read()                    # Line 10
    context = {
        'FLAG': flag                                    # Line 12
    }
    return HttpResponse(template.render(context, request))  # Line 14
```

**Sanitization:** None
- No input validation (length, character whitelist, regex)
- No HTML escaping
- No template syntax filtering
- `mark_safe` imported but never used

**Exploitability:** Fully Exploitable
- Unauthenticated access
- No rate limiting
- FLAG variable in template context
- GET method bypasses CSRF protection

**Proof of Concept:**
```bash
# Extract FLAG variable
curl 'http://localhost:45121/greet/?name={{FLAG}}'

# Template syntax parsing confirmed
curl 'http://localhost:45121/greet/?name={{7*7}}'
# Returns TemplateSyntaxError, confirming Django is parsing {{ }} as template code
```

**Impact:**
- **Confidentiality:** CRITICAL - Direct access to FLAG and potential file system
- **Integrity:** HIGH - Possible code execution via template filter/tag chains
- **Availability:** MEDIUM - Malformed templates cause application crashes
- **CVSS Score:** 9.8 (Critical)

### Additional Injection Vectors Analyzed

**Deserialization:** None found
- No `pickle`, `yaml.load`, unsafe `json.loads` usage

**Dynamic Code Execution:** None found in network-accessible paths
- No `eval()`, `exec()`, `__import__()`, `compile()` usage in custom views

**File Operations:** Safe (no injection)
- `open('/flag.txt').read()` at `views.py:10` uses hardcoded path (no user input)

### Injection Source Summary Table

| Vulnerability Type | Count | Severity | Exploitable | Network-Accessible |
|--------------------|-------|----------|-------------|-------------------|
| **Server-Side Template Injection (SSTI)** | **1** | **CRITICAL** | **YES** | **YES** |
| Command Injection | 0 | N/A | N/A | N/A |
| SQL Injection | 0 | N/A | N/A | N/A |
| Deserialization | 0 | N/A | N/A | N/A |
| Code Injection (eval/exec) | 0 | N/A | N/A | N/A |

**Critical Finding:** The SSTI vulnerability at `/greet/` endpoint is the primary exploitable injection vector. This vulnerability enables:
1. Direct extraction of FLAG variable from template context
2. Potential remote code execution via template filter chains
3. Information disclosure about application internals
4. Server-side file system access

**Recommendation:** This vulnerability must be remediated immediately before any production deployment.

---

## RECONNAISSANCE COMPLETE

**Report Generated:** 2025-10-27  
**Target:** http://localhost:45121  
**Framework:** Django 3.2 on Python 3.9  
**Attack Surface:** 3 network-accessible endpoints (/, /greet/, /admin/*)  
**Critical Findings:** 1 SSTI vulnerability, 0 command injection, 0 SQL injection  
**Authorization Model:** 4 privilege levels (anonymous → authenticated → staff → superuser)  
**Primary Security Gaps:** SSTI, DEBUG mode enabled, hardcoded SECRET_KEY, no HTTPS, no rate limiting