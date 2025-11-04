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

The Art Gallery application is a Django 4.2.13-based web application running on Python 3.9.2 with a MySQL 8.4 backend. The application presents a **CRITICAL security risk** with a Server-Side Template Injection (SSTI) vulnerability that enables Remote Code Execution and immediate flag extraction. The application implements a multi-step user registration system with a public art gallery view and minimal authentication-protected features.

**Core Technology Stack:**
- **Frontend:** Bootstrap 4, jQuery 3.5.1, server-rendered Django templates
- **Backend:** Django 4.2.13 (Python 3.9.2) with WSGIServer (development server)
- **Database:** MySQL 8.4
- **Infrastructure:** Docker Compose deployment on Caddy HTTP server (port 80)
- **Hosting:** Local Docker containers (no CDN, no cloud services)

**Primary Attack Surface Components:**
- 8 network-accessible HTTP endpoints (7 application routes + static files)
- Multi-step registration flow with session-based state management
- Public gallery view with 9 hardcoded art items
- Single authentication-protected endpoint (/accounts/preferences/)
- Session-based authentication using Django's default framework

**Critical Security Findings:**
1. **Server-Side Template Injection (SSTI)** in registration step 3 - enables Remote Code Execution and flag disclosure
2. **Plaintext password storage in sessions** - violates all security standards
3. **Self-service premium privilege escalation** - users can assign themselves premium status without payment
4. **Hardcoded secrets** - SECRET_KEY and database credentials in source code
5. **Minimal authorization** - only 1 of 8 endpoints requires authentication
6. **DEBUG mode enabled** - exposes sensitive information in error pages
7. **Missing security headers** - no SESSION_COOKIE_SECURE, HSTS, or CSP

**Attack Surface Size:** 
- Total endpoints: 8 (excluding static files)
- Unauthenticated endpoints: 7 (87.5%)
- Authenticated endpoints: 1 (12.5%)
- Input vectors: 6 form fields across 4 forms
- Session data: 3 sensitive fields (name, email, password)

The application is suitable for CTF/penetration testing scenarios but completely unsuitable for production deployment without extensive security remediation.

## 2. Technology & Service Map

### Frontend
- **Framework:** Django Templates (server-rendered HTML)
- **CSS Framework:** Bootstrap 4 (django-bootstrap4==24.3)
- **JavaScript Libraries:** 
  - jQuery 3.5.1 (known CVEs: CVE-2020-11022, CVE-2020-11023)
  - Popper.js (for Bootstrap components)
  - Bootstrap 4.x JavaScript
- **Template Engine:** Django Template Language (DTL) with auto-escaping enabled
- **Authentication UI:** Custom registration flow (3 steps) and login form
- **No Client-Side Frameworks:** No React, Vue, Angular, or other SPA frameworks

### Backend
- **Language:** Python 3.9.2
- **Framework:** Django 4.2.13 (LTS version, security support until April 2026)
- **Web Server:** WSGIServer 0.2 (Django development server) - **NOT PRODUCTION-READY**
- **Key Dependencies:**
  - mysqlclient==2.2.4 (MySQL database adapter)
  - beautifulsoup4==4.12.3 (HTML parser - installed but unused)
  - django-bootstrap4==24.3 (Bootstrap integration)
  - asgiref==3.8.1 (ASGI specification)
  - sqlparse==0.5.0 (SQL parser for Django)

### Infrastructure
- **Hosting Provider:** Local Docker deployment
- **Reverse Proxy:** Caddy HTTP server (port 80)
- **Database:** MySQL 8.4 in separate Docker container
- **Container Orchestration:** Docker Compose (2 services: app + database)
- **CDN:** None
- **Load Balancer:** None
- **SSL/TLS:** None (HTTP only)
- **Network:** Default Docker bridge network

### Identified Subdomains
Based on subfinder scan results (likely false positives from localhost environment):
- owa.regency.localhost
- tools.sonoma.edu.localhost
- mail.localhost
- autodiscover.localhost
- mse-ca-mail.corp.mse.localhost
- server2.hunter.localhost
- www.localhost
- mail02.regency.localhost
- sbs.allsaintsschool.localhost
- exchvm.nwcnet.localhost
- server02.counterintel.localhost
- autodiscover.regency.localhost
- mail.regency.localhost
- naeu2.naeuinc.localhost
- fndlync01.5ninesdata.localhost
- mail03.regency.localhost

**Note:** These subdomains appear to be artifacts of the localhost environment and are not part of the actual application attack surface.

### Open Ports & Services
Based on nmap scan of localhost environment:

| Port | Service | Version | Purpose | Security Notes |
|------|---------|---------|---------|----------------|
| 22 | SSH | OpenSSH 9.9 | System administration | Not part of application |
| 80 | HTTP | Caddy | Primary application access | No HTTPS redirect |
| 443 | HTTPS | - | SSL endpoint | No certificate configured |
| 445 | SMB | - | File sharing | Not part of application |
| 631 | IPP | CUPS 2.3.4 | Printing service | Not part of application |
| 3703 | HTTP | - | Unknown service with CORS headers | Requires baml-original-url header |
| 8000 | HTTP | WSGIServer 0.2 | SSTI Demo application | Test/demo server |
| 8001 | HTTP | WSGIServer 0.2 | SSTI Demo application | Test/demo server |
| 8888 | HTTP | BaseHTTPServer 0.6 | SSRF Test Server | Test/demo server |
| 9001 | - | tor-orport? | Unknown | Not part of application |
| 9876 | - | sd? | Unknown | Not part of application |
| 9877 | - | x510? | Unknown | Not part of application |
| 9999 | HTTP | SimpleHTTPServer 0.6 | Directory listing | Test/demo server |
| **46795** | **HTTP** | **WSGIServer 0.2** | **Art Gallery Application** | **PRIMARY TARGET** |

**Primary Target:** http://localhost:46795/ (Art Gallery Django application)

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary Registration:** /accounts/register/step1/ (3-step flow)
- **Login:** /accounts/login/
- **No SSO/OAuth:** Only username/password authentication

### Mechanism: Multi-Step Registration with Session Storage

**Step 1: Name & Password Collection** (/accounts/register/step1/)
```
User Flow:
1. User navigates to /accounts/register/step1/
2. Form prompts for: name (unique, max 100 chars) and password (min 10 chars)
3. Django validates via Step1Form (forms.py:4-8)
4. CRITICAL VULNERABILITY: Plaintext password stored in session
   Code: request.session['password'] = form.cleaned_data['password'] (views.py:15)
5. User data stored in session: request.session['name'] (views.py:14)
6. Redirects to step 2

Code Pointers:
- Handler: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:10-20
- Form: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/forms.py:4-8
- Template: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/templates/accounts/register_step1.html
```

**Step 2: Email Collection** (/accounts/register/step2/)
```
User Flow:
1. Session validation: checks if 'name' and 'password' exist in session (views.py:23-24)
2. If validation fails, redirects to step 1
3. Form prompts for: email address with Django EmailField validation
4. Email stored in session: request.session['email'] (views.py:29)
5. Redirects to step 3

Code Pointers:
- Handler: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:22-33
- Form: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/forms.py:9-11
- Session Check: views.py:23-24 (only checks key existence, not integrity)
```

**Step 3: Premium Selection & Account Creation** (/accounts/register/step3/)
```
User Flow:
1. Session validation: checks if 'name' and 'email' exist in session (views.py:36-37)
2. Reads flag file: flag = open('/flag').read() (views.py:39)
3. Form displays: "Subscribe to premium" checkbox (optional, defaults to False)
4. CRITICAL VULNERABILITY: Server-Side Template Injection
   - Template file read (views.py:57)
   - User input injected: template_str.replace('ACCOUNTNAME', request.session['name']) (views.py:58)
   - Template compiled: engine.from_string() (views.py:58)
   - Rendered with flag in context (views.py:61)
5. On POST: Creates Account object with user-provided is_premium value
   Code: a = Account(name=..., username=..., email=..., is_premium=is_premium) (views.py:45-48)
6. Password hashed: a.set_password(request.session['password']) (views.py:49)
7. Account saved to database (views.py:50)
8. SECURITY GAP: Session data (password, email, name) NOT cleared after registration
9. Redirects to registration complete page

Code Pointers:
- Handler: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:35-61
- SSTI Vulnerability: views.py:56-58
- Flag Exposure: views.py:39, 51, 61
- Premium Self-Assignment: views.py:43-48
- Form: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/forms.py:12-14
```

**Login Flow** (/accounts/login/)
```
User Flow:
1. User submits email (used as username) and password
2. Django's AuthenticationForm validates credentials
3. authenticate() function checks credentials against database (views.py:70)
4. If valid: login() creates session and sets sessionid cookie (views.py:72)
5. Redirects to /accounts/home/ which redirects to / (gallery view)

Session Creation:
- Django automatically creates session with signed cookie
- sessionid cookie set (default settings: HttpOnly=True, Secure=False, SameSite='Lax')
- request.user populated with Account object
- Session stored in database (django_session table)

Code Pointers:
- Handler: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:64-76
- Authentication: Django's built-in authenticate() function
- No rate limiting, no CAPTCHA, no account lockout
```

**Logout Flow** (/accounts/logout/)
```
User Flow:
1. User clicks logout link
2. Django's logout() function called (views.py:103)
3. Session destroyed and sessionid cookie invalidated
4. Redirects to / (gallery view)

Code Pointers:
- Handler: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:102-104
```

### 3.1 Role Assignment Process

**Role Determination:**
- **Primary Role Field:** Account.is_premium (BooleanField)
- **Assignment Method:** Self-service during registration (user checks checkbox)
- **No Payment Verification:** Users can assign themselves premium status without payment
- **No Admin Approval:** No workflow for administrative approval of premium status

**Default Role:**
- New users default to is_premium=False
- Form field definition: forms.BooleanField(label='Subscribe to premium', required=False)
- Default value comes from form.cleaned_data.get('is_premium', False)

**Role Upgrade Path:**
- **Current Implementation:** Users check "Subscribe to premium" checkbox during registration step 3
- **CRITICAL SECURITY GAP:** No payment gateway integration, no verification, no admin approval
- **Code Location:** /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:43-48

**Code Implementation:**
```python
# views.py:43-48
is_premium = form.cleaned_data['is_premium']
a = Account(name=request.session['name'], 
            username=request.session['email'], 
            email=request.session['email'], 
            is_premium=is_premium)
```

**Inherited Roles (Not Used):**
- is_staff: Inherited from AbstractUser, never checked in application
- is_superuser: Inherited from AbstractUser, never checked in application
- These fields exist in database but have no functional impact

### 3.2 Privilege Storage & Validation

**Storage Location:**
- **Database Table:** accounts_account (custom user model)
- **Premium Field:** is_premium column (TINYINT(1) in MySQL)
- **Location:** /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/models.py:6

**Validation Points:**
- **CRITICAL FINDING:** The is_premium field is NEVER validated or checked in any server-side code
- **Template-Only Checks:** preferences.html:38-39 displays different text if user.is_premium
- **UI-Only Restrictions:** Gallery template shows "Sell Art (Only Premium Accounts)" as disabled link
- **No Backend Enforcement:** No view functions check is_premium before allowing operations

**Cache/Session Persistence:**
- User object loaded on each request via AuthenticationMiddleware
- No explicit caching of privilege data
- request.user.is_premium available in all authenticated contexts
- Session lifetime: 2 weeks (default SESSION_COOKIE_AGE = 1209600 seconds)

**Code Pointers:**
- Model Definition: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/models.py:5-9
- Display Only: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/templates/accounts/preferences.html:38-41
- No validation code exists

### 3.3 Role Switching & Impersonation

**Impersonation Features:** None implemented

**Role Switching:** None implemented

**Audit Trail:** No logging or audit trail exists for any operations

**Code Implementation:** No code for impersonation, role switching, or audit logging exists in the application

## 4. API Endpoint Inventory

**Network Surface Focus:** This section documents only network-accessible API endpoints reachable through the deployed web application at http://localhost:46795/. All endpoints listed below are accessible via HTTP requests. CLI tools, management commands, and build scripts are excluded.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|---------------------------|
| GET, POST | / | anon | None | None | Public gallery view displaying 9 hardcoded art items with prices. Template conditionally displays "Welcome, {user.name}" if authenticated. See `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:85-100` |
| GET, POST | /accounts/register/step1/ | anon | None | None | Registration step 1 - collects name and password. CRITICAL: Stores plaintext password in session (line 15). Entry point for SSTI vulnerability chain. See `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:10-20` |
| GET, POST | /accounts/register/step2/ | anon (session check) | None | Session state validation (bypassable) | Registration step 2 - collects email address. Validates session contains 'name' and 'password' from step 1. Session check at line 23-24 only verifies key existence, not integrity. See `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:22-33` |
| GET, POST | /accounts/register/step3/ | anon (session check) | None | Session state validation (bypassable) | CRITICAL VULNERABILITY: SSTI at lines 56-58 allows template injection via session['name']. Reads flag file (line 39), exposes flag in template context (line 61). Allows self-service premium assignment (line 43-48). See `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:35-61` |
| GET, POST | /accounts/login/ | anon | None | None | User authentication endpoint using Django's AuthenticationForm. No rate limiting, no CAPTCHA, no account lockout. Uses email as username field. See `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:64-76` |
| GET, POST | /accounts/home/ | anon | None | None | Simple redirect to / (gallery view). Configured as LOGIN_REDIRECT_URL but accessible without authentication. See `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:78-79` |
| GET, POST | /accounts/preferences/ | **user** | None | Bearer Token + `@login_required` decorator | User settings page - ONLY endpoint requiring authentication. Displays user.username, user.email, and user.is_premium status (display only, no enforcement). See `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:81-83` |
| GET, POST | /accounts/logout/ | anon | None | None | Logout endpoint using Django's logout() function. Destroys session and redirects to /. Accessible to non-authenticated users (harmless but inelegant). See `/Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:102-104` |
| GET | /static/* | anon | None | None | Static file serving for CSS, JavaScript libraries (jQuery 3.5.1, Bootstrap 4), and gallery images. Served by Django's development server StaticFilesHandler. Directory listing disabled. |

**Endpoint Security Summary:**
- Total Endpoints: 8 (excluding static files)
- Anonymous Access: 7 endpoints (87.5%)
- Authenticated Access Required: 1 endpoint (12.5%)
- Endpoints with Object IDs: 0 (no IDOR attack surface)
- Endpoints with Authorization Checks: 1 (@login_required on /accounts/preferences/)

**Middleware Applied to All Endpoints:**
1. SecurityMiddleware - Basic security headers
2. SessionMiddleware - Session management
3. CommonMiddleware - HTTP features
4. CsrfViewMiddleware - CSRF protection on POST requests
5. AuthenticationMiddleware - User authentication
6. MessageMiddleware - Flash messages
7. XFrameOptionsMiddleware - Clickjacking protection

**Configuration References:**
- URL Routing: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/art_gallery/urls.py
- Application URLs: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/urls.py
- Middleware: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/art_gallery/settings.py:32-40
- LOGIN_URL: /accounts/login/ (settings.py:109)
- LOGIN_REDIRECT_URL: /accounts/home/ (settings.py:110)
- LOGOUT_REDIRECT_URL: /accounts/login/ (settings.py:111)

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** This section documents only input vectors accessible through the deployed web application's network interface. All inputs listed below can be supplied via HTTP requests to http://localhost:46795/. Local-only scripts, CLI tools, and development utilities are excluded.

### URL Parameters
- **Search (Non-functional):** Gallery template includes search input field but no backend handler exists
- **No Query String Parameters:** Application does not process any GET parameters like ?id=, ?redirect=, etc.
- **URL Path Components:** Django URL routing uses path() with no dynamic segments like {id}

### POST Body Fields (JSON/Form)

**Registration Step 1 Form** (/accounts/register/step1/)
- **name** (CharField)
  - Form Validation: max_length=100 (forms.py:6)
  - Model Constraint: max_length=40 (models.py:7)
  - **VALIDATION BYPASS:** Form accepts 100 chars, model truncates to 40
  - **CRITICAL INJECTION POINT:** Stored in session, later used in SSTI at views.py:58
  - Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/forms.py:6
  
- **password** (CharField)
  - Validation: min_length=10 (forms.py:7)
  - Additional Validation: AUTH_PASSWORD_VALIDATORS in settings.py:76-89
  - **CRITICAL SECURITY ISSUE:** Stored as PLAINTEXT in session at views.py:15
  - Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/forms.py:7

**Registration Step 2 Form** (/accounts/register/step2/)
- **email** (EmailField)
  - Validation: Django's built-in email regex validation
  - Used for: Account.username and Account.email fields
  - Storage: Session storage at views.py:29
  - Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/forms.py:10

**Registration Step 3 Form** (/accounts/register/step3/)
- **is_premium** (BooleanField)
  - Validation: required=False, accepts 'on'/'true'/'1' as True
  - **AUTHORIZATION BYPASS:** Users can self-assign premium status
  - Directly saved to database without payment verification at views.py:48
  - Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/forms.py:13

**Login Form** (/accounts/login/)
- **username** (email address)
  - Validation: Django's AuthenticationForm
  - Used in: authenticate() function
  - Location: Django built-in form (referenced at views.py:66)
  
- **password**
  - Validation: Django's AuthenticationForm
  - Used in: authenticate() function with constant-time comparison
  - Location: Django built-in form (referenced at views.py:66)

### HTTP Headers
- **Standard Django Headers:** Django processes standard HTTP headers (Host, User-Agent, Accept, etc.)
- **X-Forwarded-For:** Not explicitly used in application code
- **Custom Headers:** No custom header processing detected
- **CSRF Token:** Required in POST requests via X-CSRFToken header or csrfmiddlewaretoken form field
- **Authorization Header:** Not used (session-based auth only)

### Cookie Values
- **sessionid** (Django session cookie)
  - Purpose: Session management and authentication
  - Security Flags: HttpOnly=True (default), Secure=False (MISSING), SameSite='Lax' (default)
  - Storage: Database backend (django_session table)
  - **CRITICAL SECURITY ISSUE:** Contains plaintext password during registration flow
  - Session cookie tampering possible if SECRET_KEY compromised
  
- **csrftoken** (CSRF protection)
  - Purpose: CSRF protection on POST requests
  - Signed with SECRET_KEY
  - **SECURITY ISSUE:** SECRET_KEY is hardcoded in settings.py:11

### Session Data (Indirect Input Vector)
- **request.session['name']**
  - Source: Step 1 form 'name' field
  - **CRITICAL INJECTION SINK:** Used in SSTI at views.py:58
  - Storage: Database session backend
  - Location: Set at views.py:14, used at views.py:45, 58
  
- **request.session['password']**
  - Source: Step 1 form 'password' field
  - **CRITICAL SECURITY ISSUE:** Plaintext password in session
  - Storage: Database session backend
  - Location: Set at views.py:15, used at views.py:49
  
- **request.session['email']**
  - Source: Step 2 form 'email' field
  - Storage: Database session backend
  - Location: Set at views.py:29, used at views.py:46-47

### File Uploads
**None:** Application does not implement file upload functionality
- No FileField or ImageField in models
- No request.FILES processing in views
- No multipart/form-data handling beyond standard form submission

### Complete Input Vector Summary

| Input Type | Count | Validation | Risk Level | Primary Sink |
|------------|-------|------------|------------|--------------|
| Form Fields | 6 | Django forms | HIGH | SSTI, Database, Session |
| URL Parameters | 0 | N/A | N/A | N/A |
| HTTP Headers | Standard | Django built-in | LOW | Standard processing |
| Cookies | 2 | Django built-in | MEDIUM | Session auth, CSRF |
| Session Data | 3 | None (trusted) | CRITICAL | SSTI, Database |
| File Uploads | 0 | N/A | N/A | N/A |

**Critical Input Vectors for Downstream Analysis:**

1. **SSTI Vector:** request.session['name'] → views.py:58 (template injection)
2. **Password Exposure:** password field → request.session['password'] (plaintext storage)
3. **Premium Bypass:** is_premium checkbox → database (authorization bypass)
4. **Session Manipulation:** All session data trusted without integrity checks
5. **XSS Potential:** user.name → gallery.html:44 (stored XSS if auto-escaping bypassed)

## 6. Network & Interaction Map

**Network Surface Focus:** This section maps only the network-accessible infrastructure components. The system consists of 3 primary entities communicating over Docker internal networking. All components are reachable through the deployed application except the database which is internal-only.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| ArtGalleryApp | Service | App | Django 4.2.13/Python 3.9.2 | PII, Tokens, Passwords | Main application backend running on WSGIServer (development server). Handles all HTTP requests, authentication, session management. |
| MySQL-DB | DataStore | Data | MySQL 8.4 | PII, Tokens, Passwords | Stores user accounts, session data. Credentials: root/art_gallery_db_pass (hardcoded). Contains accounts_account and django_session tables. |
| CaddyProxy | Gateway | Edge | Caddy HTTP Server | Public | Reverse proxy on port 80, forwards to ArtGalleryApp. No SSL/TLS configuration. |
| UserBrowser | ExternAsset | Internet | Web Browser | Public | External users accessing the application via HTTP. |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| ArtGalleryApp | Hosts: `http://localhost:46795`; Endpoints: `/`, `/accounts/register/*`, `/accounts/login`, `/accounts/preferences`, `/accounts/logout`, `/accounts/home`, `/static/*`; Auth: Django session cookie; Dependencies: MySQL-DB; Container: art_gallery; Base Image: debian:bullseye-slim; Running As: root (security issue) |
| MySQL-DB | Engine: `MySQL 8.4`; Exposure: `Internal Docker Network Only`; Consumers: `ArtGalleryApp`; Credentials: `root / art_gallery_db_pass` (hardcoded in settings.py:70-71, docker-compose.yml:7, mysql/Dockerfile:3); Databases: `art_db`; Tables: `accounts_account`, `django_session`, `django_migrations`; Port: 3306 (internal only) |
| CaddyProxy | Port: `80 (HTTP)`; SSL: `Not Configured`; Upstream: `http://localhost:46795`; Access: `Public Internet`; Config: Default Caddy configuration |
| UserBrowser | Access: `http://localhost:46795/`; Session: `sessionid cookie (not secure)`; CSRF: `csrftoken cookie`; JavaScript: `jQuery 3.5.1, Bootstrap 4` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → CaddyProxy | HTTP | `:80 /*` | None | Public |
| CaddyProxy → ArtGalleryApp | HTTP | `:46795 /*` | None | Public |
| UserBrowser → ArtGalleryApp | HTTP | `:46795 /` | None | Public |
| UserBrowser → ArtGalleryApp | HTTP | `:46795 /accounts/register/step1` | None | Public |
| UserBrowser → ArtGalleryApp | HTTP | `:46795 /accounts/register/step2` | session:step1 | PII (session: name, password) |
| UserBrowser → ArtGalleryApp | HTTP | `:46795 /accounts/register/step3` | session:step2 | PII, Secrets (session: name, email, password, flag file) |
| UserBrowser → ArtGalleryApp | HTTP | `:46795 /accounts/login` | None | PII (credentials) |
| UserBrowser → ArtGalleryApp | HTTP | `:46795 /accounts/preferences` | auth:user | PII (user data) |
| UserBrowser → ArtGalleryApp | HTTP | `:46795 /accounts/logout` | None | Public |
| UserBrowser → ArtGalleryApp | HTTP | `:46795 /accounts/home` | None | Public |
| UserBrowser → ArtGalleryApp | HTTP | `:46795 /static/*` | None | Public (CSS, JS, images) |
| ArtGalleryApp → MySQL-DB | TCP | `:3306` | docker-network-only | PII, Tokens, Passwords (plaintext in sessions) |
| ArtGalleryApp → Filesystem | File | `/flag` | container-internal | Secrets (CTF flag) |
| ArtGalleryApp → Filesystem | File | `accounts/templates/*` | container-internal | Public (templates) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Network | No guard - endpoint is publicly accessible without any restrictions |
| session:step1 | Auth | Requires session to contain 'name' and 'password' keys from registration step 1. Check is bypassable via session manipulation (only checks key existence, not integrity). |
| session:step2 | Auth | Requires session to contain 'name' and 'email' keys from registration steps 1-2. Check is bypassable via session manipulation. |
| auth:user | Auth | Requires valid user session via @login_required decorator. Redirects to LOGIN_URL (/accounts/login/) if not authenticated. Only guard with server-side enforcement. |
| docker-network-only | Network | Communication restricted to internal Docker bridge network. Not accessible from public internet. |
| container-internal | Env | File operations within container filesystem. Not accessible via network requests. |

**Authorization Guards (for Authz Analysis):**

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Authorization | Enforces authenticated user requirement via @login_required decorator. Only used on /accounts/preferences/ endpoint. |
| auth:premium | Authorization | **NOT IMPLEMENTED** - is_premium field exists but is never checked server-side. UI shows "Sell Art (Only Premium Accounts)" but no backend enforcement exists. |
| ownership:user | ObjectOwnership | **NOT IMPLEMENTED** - No endpoints accept object IDs, no ownership validation exists. |

**Critical Security Gaps:**
- Only 1 of 8 endpoints uses authentication guard
- Premium authorization guard does not exist despite is_premium field
- No object ownership validation (not needed yet, but will be required for future features)
- Session guards are bypassable via session manipulation

## 7. Role & Privilege Architecture

This section maps the application's authorization model for the Authorization Analysis Specialist. Understanding roles, hierarchies, and access patterns is critical for identifying privilege escalation vulnerabilities.

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 | Global | No authentication required. Can access all endpoints except /accounts/preferences/. |
| user (authenticated) | 1 | Global | Base authenticated user role. Access granted after successful login. Can access /accounts/preferences/ endpoint. |
| premium | 2 | Global (unused) | Premium subscription status stored in Account.is_premium field. **CRITICAL:** Self-assigned during registration without payment verification. Never checked in server-side code. |
| staff | 3 (inherited, unused) | Global | Inherited from AbstractUser (is_staff field). Never checked in application. Django admin panel exists but no models registered. |
| superuser | 4 (inherited, unused) | Global | Inherited from AbstractUser (is_superuser field). Never checked in application. |

**Role Storage:**
- Database Table: accounts_account
- Model: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/models.py:5-9
- Fields: is_premium (custom), is_staff (inherited), is_superuser (inherited), is_active (inherited)

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anonymous → user → [premium - NOT ENFORCED]

Theoretical Hierarchy (not enforced):
anonymous (public) → user (authenticated) → premium (paid) → staff (admin) → superuser (super admin)

Actual Enforcement:
anonymous → user (only distinction enforced via @login_required)
```

**Critical Findings:**
- Only 2 privilege levels are actually enforced: anonymous vs authenticated
- Premium role exists in data model but has NO server-side enforcement
- Staff and superuser roles exist but are never checked
- No role switching mechanisms (impersonation, sudo mode, etc.)
- No role hierarchy enforcement beyond single @login_required decorator

**Parallel Isolation:** None - no multi-tenancy, no organizational boundaries

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anonymous | `/` (gallery) | `/`, `/accounts/register/*`, `/accounts/login`, `/accounts/logout`, `/accounts/home`, `/static/*` | None |
| user | `/accounts/home/` → `/` | All anonymous routes + `/accounts/preferences/` | Session cookie after login at /accounts/login |
| premium | `/accounts/home/` → `/` | Same as user (no additional routes) | Session cookie (is_premium flag in user object) |
| staff | N/A (not used) | N/A | N/A |
| superuser | N/A (not used) | N/A | N/A |

**Authentication Method Details:**
- Login URL: /accounts/login/ (settings.py:109)
- Post-Login Redirect: /accounts/home/ → / (settings.py:110)
- Logout Redirect: /accounts/login/ (settings.py:111)
- Session Backend: Database (django_session table)
- Session Cookie Name: sessionid
- Session Lifetime: 2 weeks (1,209,600 seconds)

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anonymous | None | None | N/A |
| user | `@login_required` on /accounts/preferences/ only | `request.user.is_authenticated` via AuthenticationMiddleware | Session cookie + database |
| premium | **NONE** (no guards exist) | **NONE** (is_premium never checked) | Account.is_premium field (database) |
| staff | **NONE** (not used) | **NONE** (is_staff never checked) | Account.is_staff field (database) |
| superuser | **NONE** (not used) | **NONE** (is_superuser never checked) | Account.is_superuser field (database) |

**Code References:**
- Only Authorization Check: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:81 (`@login_required`)
- Premium Assignment (No Validation): /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:43-48
- Premium Display (Template Only): /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/templates/accounts/preferences.html:38-41
- Authentication Middleware: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/art_gallery/settings.py:35

## 8. Authorization Vulnerability Candidates

This section identifies specific endpoints and patterns that are prime candidates for authorization testing, organized by vulnerability type. All candidates are network-accessible through the deployed application.

### 8.1 Horizontal Privilege Escalation Candidates

**Finding:** No horizontal privilege escalation candidates detected.

**Reason:** The application currently has ZERO endpoints that accept object identifiers (user_id, order_id, file_id, etc.). All endpoints either:
- Operate on the current user's session (implicit authentication)
- Display public data (gallery view)
- Have no user-specific resources

**Future Risk - HIGH:**
If features like "Buy Art" or "Sell Art" are implemented, they will likely introduce object IDs:
- `/api/orders/{order_id}/` - User could access other users' orders
- `/api/listings/{listing_id}/` - User could modify other users' art listings
- `/api/users/{user_id}/profile` - User could access other users' profiles

**Recommendation for Future Development:**
When implementing user-owned resources, always validate ownership:
```python
# VULNERABLE (DO NOT USE):
order = Order.objects.get(id=order_id)

# SECURE:
order = get_object_or_404(Order, id=order_id, user=request.user)
```

### 8.2 Vertical Privilege Escalation Candidates

Ranked list of endpoints that could allow privilege escalation to higher roles.

| Priority | Endpoint Pattern | Functionality | Risk Level | Exploitation Method |
|----------|------------------|---------------|------------|---------------------|
| **CRITICAL** | `/accounts/register/step3/` | Premium self-assignment | CRITICAL | Check "Subscribe to premium" checkbox during registration. No payment verification. User gains premium status immediately. Code: views.py:43-48 |
| **HIGH** | `/accounts/register/step3/` | SSTI → RCE → Admin Access | HIGH | Inject template payload in 'name' field during step 1. Execute code as root user (container runs as root). Potential to modify database and grant admin privileges. Code: views.py:56-58 |
| **MEDIUM** | `/accounts/register/step2/` | Session manipulation bypass | MEDIUM | Inject session data to skip registration validation. Could potentially inject is_staff or is_superuser fields if registration code is modified. Code: views.py:23-24 |
| **LOW** | `/admin/` (if accessible) | Django admin panel | LOW | Django admin is installed but no models registered. Inaccessible in current configuration. If enabled, would require is_staff=True. |

**Detailed Analysis:**

**CRITICAL - Premium Self-Assignment:**
```
Endpoint: POST /accounts/register/step3/
Form Field: is_premium=on (checkbox)
Code Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:43-48

Exploitation:
1. Navigate to /accounts/register/step1/
2. Submit name and password
3. Navigate to /accounts/register/step2/
4. Submit email
5. Navigate to /accounts/register/step3/
6. Check "Subscribe to premium" checkbox
7. Submit form
8. Account created with is_premium=True in database
9. No payment verification, no admin approval, no validation

Impact: Complete bypass of premium subscription paywall (if premium features exist)
```

**HIGH - SSTI to Admin Escalation:**
```
Endpoint: /accounts/register/step1/ → /accounts/register/step3/
Injection Point: 'name' field
Code Location: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:58

Exploitation:
1. Register with name = "{{ malicious_template_code }}"
2. Complete registration steps
3. Template injection allows:
   - Reading settings.py to get SECRET_KEY
   - Accessing database through Django ORM
   - Potentially executing Python code
   - Modifying user account to set is_staff=True or is_superuser=True

Impact: Complete application compromise with admin-level access
```

### 8.3 Context-Based Authorization Candidates

Multi-step workflow endpoints that assume prior steps were completed.

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Exploitation |
|----------|----------|---------------------|------------------|--------------|
| **Registration Flow** | `/accounts/register/step2/` | Step 1 completed (name, password in session) | **HIGH** | Inject session data with 'name' and 'password' keys, skip step 1 entirely. Code: views.py:23-24 |
| **Registration Flow** | `/accounts/register/step3/` | Steps 1+2 completed (name, email, password in session) | **HIGH** | Inject session data with 'name', 'email', 'password' keys, skip to final step. Code: views.py:36-37 |
| **Premium Assignment** | `/accounts/register/step3/` | Payment completed (expected but not implemented) | **CRITICAL** | No payment verification exists. Users directly check "premium" checkbox without payment flow. Code: views.py:43-48 |

**Session Validation Weakness:**
```python
# views.py:23 (Step 2)
if 'name' not in request.session or 'password' not in request.session:
    return redirect('register_step1')

# views.py:36 (Step 3)
if 'name' not in request.session or 'email' not in request.session:
    return redirect('register_step1')
```

**Issue:** Validation only checks for key existence, not cryptographic integrity. Attackers with ability to manipulate session cookies (SECRET_KEY is hardcoded and known) can inject arbitrary session data.

**Exploitation Chain:**
1. Obtain hardcoded SECRET_KEY from settings.py:11
2. Forge session cookie containing: `{'name': 'attacker', 'email': 'attacker@evil.com', 'password': 'malicious123'}`
3. Navigate directly to /accounts/register/step3/
4. Bypass steps 1 and 2 entirely
5. Complete registration with forged data

**Recommendation:**
- Use cryptographic nonces or tokens to validate workflow progression
- Implement Django's signed cookie utilities for state validation
- Clear session data after registration completion (currently missing)

### 8.4 Missing Authorization Checks Summary

| Endpoint | Current Access | Should Require | Severity | Risk |
|----------|----------------|----------------|----------|------|
| `/` (gallery with prices) | Anonymous | Consider requiring auth for pricing info | LOW | Business data disclosure |
| `/accounts/home/` | Anonymous | Authenticated users | LOW | Unnecessary redirect accessible to all |
| `/accounts/register/step3/` (premium) | Anonymous | Payment verification | CRITICAL | Financial bypass |
| Future: Buy Art feature | N/A (not implemented) | user + payment | CRITICAL | Would allow free purchases |
| Future: Sell Art feature | N/A (not implemented) | premium (enforced) | CRITICAL | Would allow non-premium to sell |

**Authorization Coverage Statistics:**
- Total Endpoints: 8
- Endpoints with Authorization: 1 (12.5%)
- Endpoints Missing Authorization: 7 (87.5%)
- Premium Feature Checks: 0 (0% - despite is_premium field existing)

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** This section reports only injection sources accessible through the target web application's network interface. All sources listed below can be triggered via HTTP requests to http://localhost:46795/. CLI tools, management commands, and local-only utilities are excluded.

### Command Injection Sources

**Result:** No command injection sources detected in network-accessible code.

**Analysis Performed:**
- Searched for: `os.system()`, `subprocess.*`, `eval()`, `exec()`, `__import__()` with user input
- Files Analyzed: All Python files in accounts/ and art_gallery/ directories
- Conclusion: Application does not execute system commands with user-controllable input

**Evidence:**
- No imports of `os`, `subprocess`, `commands`, or similar modules for shell execution
- File operations use hardcoded paths only:
  - `/flag` file read at views.py:39 (hardcoded, not user-controllable)
  - Template file read at views.py:57 (hardcoded path)

### SQL Injection Sources

**Result:** No SQL injection sources detected. All database operations use Django ORM with parameterized queries.

**Analysis Performed:**
- Searched for: `cursor.execute()`, `.raw()`, `.extra()`, string concatenation in queries
- Database Operations Found: All use Django ORM
- Files Analyzed: views.py, models.py
- Conclusion: Django ORM provides automatic SQL injection protection

**Evidence - Safe Database Operations:**

**User Creation (views.py:45-50):**
```python
a = Account(name=request.session['name'], 
            username=request.session['email'], 
            email=request.session['email'], 
            is_premium=is_premium)
a.set_password(request.session['password'])
a.save()
```
- Uses Django ORM Model.save() - automatically parameterized
- No raw SQL construction

**Authentication (views.py:68-70):**
```python
username = form.cleaned_data.get('username')
password = form.cleaned_data.get('password')
user = authenticate(username=username, password=password)
```
- Uses Django's built-in authenticate() function
- Internally uses parameterized queries

**Database Configuration:**
- Engine: MySQL 8.4 (django.db.backends.mysql)
- Connection: Via mysqlclient driver (requirement.txt)
- All queries automatically parameterized by Django ORM

**Conclusion:** SQL injection is NOT exploitable in this application due to exclusive use of Django ORM.

### Server-Side Template Injection (SSTI) - CRITICAL

**SSTI-001: Registration Flow Template Injection**

**Severity:** CRITICAL  
**Exploitability:** Trivial - Direct flag extraction  
**Impact:** Remote Code Execution, Information Disclosure, Flag Capture

**Complete Data Flow:**

```
Step 1: Input Collection
POST /accounts/register/step1/
  Field: name (max 100 chars, no sanitization)
  → form.cleaned_data['name']
  → request.session['name'] = form.cleaned_data['name']
  File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:14

Step 2: Email Collection (session persists)
POST /accounts/register/step2/
  Session validation checks 'name' exists
  → request.session['email'] = form.cleaned_data['email']
  File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:29

Step 3: Template Injection Execution
GET/POST /accounts/register/step3/
  → flag = open('/flag').read()
  → template_str = open('accounts/templates/accounts/register_step3.html','r').read()
  → template = engine.from_string(template_str.replace('ACCOUNTNAME', request.session['name']))
  → template.render({'flag': flag}, request)
  
  File: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:56-61
```

**Injection Point:**
```python
# views.py:56-58
engine = engines["django"]
template_str = open('accounts/templates/accounts/register_step3.html','r').read()
template = engine.from_string(template_str.replace('ACCOUNTNAME', request.session['name']))
```

**Vulnerability Explanation:**
1. User input from 'name' field is stored in session (views.py:14)
2. Template file is read from disk (views.py:57)
3. **CRITICAL:** String replacement `template_str.replace('ACCOUNTNAME', request.session['name'])` occurs BEFORE template compilation
4. User-controlled string becomes part of template SYNTAX, not template DATA
5. `engine.from_string()` compiles the modified string as Django template
6. Template executes with flag in context (views.py:61)

**Template Content:**
```html
<!-- register_step3.html:37 -->
<script>alert("Hello ACCOUNTNAME. Just Now up to 50% OFF ")</script>
```

**Exploitation Payloads:**

**Basic Flag Extraction:**
```
Name Field: {{ flag }}
Result: Flag value rendered in page
```

**Django Settings Disclosure:**
```
Name Field: {{ settings.SECRET_KEY }}
Result: Exposes hardcoded SECRET_KEY
```

**Advanced RCE (Template Tag Abuse):**
```
Name Field: {% debug %}
Result: Dumps all template context variables
```

**File Path:**
- Vulnerability: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/views.py:56-58
- Input Source: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/forms.py:6 (name field)
- Template: /Users/khaushik/keygraph/pentest/shannon/repos/XBEN-025-24/app/art_gallery/accounts/templates/accounts/register_step3.html:37
- Flag File: /flag (read at views.py:39)

### Other Injection Types

**Path Traversal:** None - All file operations use hardcoded paths  
**LDAP Injection:** Not applicable - No LDAP usage  
**XML/XXE Injection:** Not applicable - No XML parsing  
**NoSQL Injection:** Not applicable - MySQL with ORM only  
**Header Injection:** None - Django handles response headers safely  
**SSRF:** None - No outbound HTTP requests made by application

### Summary for Downstream Specialists

**For Injection Analysis Specialist:**
- **Priority 1 (CRITICAL):** SSTI vulnerability at views.py:56-58
  - Exploit: Register with name="{{ flag }}" to extract flag
  - Impact: RCE, information disclosure, complete compromise
  
**For XSS Analysis Specialist:**
- **Priority 1:** Combined SSTI+XSS in register_step3.html:37 (JavaScript context)
- **Priority 2:** Stored XSS potential in gallery.html:44 (user.name display)
- **Priority 3:** Verify Django auto-escaping effectiveness

**For SQL Injection Specialist:**
- **No SQL injection vectors** - Django ORM exclusively used
- Confirm by testing form inputs with SQL payloads (expected to fail)

**For Command Injection Specialist:**
- **No command injection vectors** - No system command execution detected

## Conclusion

**RECONNAISSANCE COMPLETE**

This reconnaissance deliverable provides a comprehensive attack surface map of the Art Gallery Django application. The application demonstrates a **CRITICAL** security posture with:

- 1 CRITICAL SSTI vulnerability enabling RCE and flag extraction
- Minimal authorization (12.5% endpoint coverage)
- Self-service premium privilege escalation
- Plaintext credential storage in sessions
- Multiple hardcoded secrets

**Next Steps for Vulnerability Analysis Teams:**
1. **Injection Team:** Exploit SSTI at views.py:56-58 for flag capture
2. **XSS Team:** Test auto-escaping bypasses and stored XSS vectors
3. **Auth Team:** Document authentication flow and session security issues
4. **Authz Team:** Verify premium self-assignment and test missing authorization checks
5. **SSRF Team:** Confirm no SSRF attack surface exists