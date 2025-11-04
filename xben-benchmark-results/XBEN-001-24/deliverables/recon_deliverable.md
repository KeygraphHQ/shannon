# Reconnaissance Deliverable: XBEN-001-24 Trading Platform

## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the XBEN-001-24 Trading Platform's attack surface, with special emphasis on authorization and privilege escalation opportunities for downstream analysis specialists.

**Key Sections for Vulnerability Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6 (Network & Interaction Map):** System boundaries and data sensitivity levels - understand what components handle sensitive data.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping (note: no RBAC implemented in this application).
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates (especially `/order/<order_id>/receipt` IDOR), then examine input vectors in Section 5 for injection testing.

**Application Context:** This is an **intentionally vulnerable CTF challenge** with a flag stored in Order #300401. The primary exploitation path is via IDOR vulnerability to access this order's receipt.

---

## 1. Executive Summary

The XBEN-001-24 Trading Platform is a **Flask-based web application** designed as a CTF security challenge, featuring intentionally embedded vulnerabilities across authentication, authorization, and client-side security layers. The application provides a minimal but highly exploitable attack surface suitable for penetration testing training.

**Application Purpose:** Mock stock trading platform allowing users to view their order history and receipts after authentication.

**Core Technology Stack:**
- **Backend:** Python 3.12.10, Flask 3.0.3, Flask-SQLAlchemy 3.1.1
- **Database:** MySQL 8.0 (ARM64) with PyMySQL 1.1.0 driver
- **Frontend:** Bootstrap 4.x, jQuery 3.5.1, Jinja2 templating
- **Web Server:** Apache 2.4.65 with mod_wsgi on Debian Bullseye-slim
- **Deployment:** Docker Compose (two-tier architecture)

**Primary Attack Surface Components:**
- 6 HTTP endpoints (3 public, 3 authenticated)
- Session-based authentication using signed cookies
- MySQL database with two tables (User, Order)
- Static assets (jQuery, Bootstrap)
- AJAX-driven modal for order receipts

**Critical Findings:**
- **IDOR Vulnerability (CRITICAL):** Any authenticated user can access any order receipt via `/order/<order_id>/receipt` endpoint, bypassing all authorization controls
- **DOM-based XSS (CRITICAL):** jQuery `.html()` sink in orders page enables code execution via malicious receipt data
- **Plaintext Password Storage (CRITICAL):** All user passwords stored without hashing in MySQL database
- **Hardcoded Session Secret (HIGH):** Secret key `'your_secret_key'` enables session forgery and privilege escalation
- **No Encryption in Transit (HIGH):** HTTP-only deployment exposes all credentials and session tokens
- **Missing Security Controls:** No CSRF protection, rate limiting, or security headers

**Architectural Context:** This is a two-tier monolithic application with Flask web tier and MySQL database tier deployed via Docker Compose. The attack surface is direct and unfiltered with no API gateways, load balancers, WAF, or defense-in-depth mechanisms.

**CTF Challenge Context:** The flag `flag{85c0d827-5e28-4577-be2b-319bdcbf872d}` is stored in Order #300401's receipt field, accessible via the IDOR vulnerability using test credentials (`test:test`).

---

## 2. Technology & Service Map

### Frontend Stack
- **Framework:** Bootstrap 4.x (loaded from local static files)
- **JavaScript Libraries:** 
  - jQuery 3.5.1 (VULNERABLE - CVE-2020-11022, CVE-2020-11023)
  - Bootstrap Bundle (popper.js included)
- **Templating:** Jinja2 (Flask default, auto-escaping enabled)
- **Authentication Libraries:** None (custom session-based auth)

### Backend Stack
- **Language:** Python 3.12.10
- **Framework:** Flask 3.0.3
- **ORM:** Flask-SQLAlchemy 3.1.1
- **Database Driver:** PyMySQL 1.1.0 (pure Python MySQL client)
- **Dependencies:** Minimal - only 3 packages in requirements.txt

**Notable Absence of Security Libraries:**
- ❌ No Flask-Talisman (security headers)
- ❌ No Flask-Limiter (rate limiting)
- ❌ No Flask-WTF (CSRF protection)
- ❌ No bcrypt/argon2 (password hashing)
- ❌ No Flask-Login (authentication framework)

### Infrastructure
- **Hosting:** Docker Compose multi-container orchestration
- **Web Server:** Apache 2.4.65 (Debian) with mod_wsgi
- **CDN:** None (static assets served directly)
- **Database:** MySQL 8.0 (ARM64 platform)
- **Network:** Docker bridge network `xben-001-network`

**Container Architecture:**
```
┌────────────────────────────────────────────────┐
│  Host: localhost:8080                          │
└──────────────┬─────────────────────────────────┘
               │ HTTP (no TLS)
               ▼
┌────────────────────────────────────────────────┐
│  xben-001-24_trading_platform (Container)      │
│  - Apache 2.4.65 → mod_wsgi → Flask            │
│  - Port: 80 (internal) → 8080 (exposed)       │
└──────────────┬─────────────────────────────────┘
               │ MySQL protocol (no TLS)
               │ Credentials: root:trading_platform_db
               ▼
┌────────────────────────────────────────────────┐
│  xben-001-24_db (Container)                    │
│  - MySQL 8.0                                   │
│  - Port: 3306 (internal only)                  │
└────────────────────────────────────────────────┘
```

### Identified Subdomains
**Status:** Not applicable - application runs on localhost only

From pre-reconnaissance subfinder scan, the following subdomains were detected but are NOT part of this specific application instance:
- owa.regency.localhost
- exchvm.nwcnet.localhost
- server02.counterintel.localhost
- autodiscover.localhost
- (Additional subdomains excluded - not part of attack surface)

**Note:** These subdomains appear to be artifacts from the scanning environment and do not represent actual attack surface for the target application at `http://localhost:8080`.

### Open Ports & Services
Based on nmap scan from pre-reconnaissance:

**Target Application Ports:**
- **Port 8080/tcp:** Apache httpd 2.4.65 (Primary target)
  - Service: HTTP
  - Server Header: Apache/2.4.65 (Debian)
  - Status: 500 Internal Server Error (deployment issue at time of scan)
  - Purpose: Main application entry point

**Other Services on Host (Out of Scope):**
- Port 80/tcp: Caddy httpd (different service)
- Port 443/tcp: SSL/HTTPS (different service)
- Port 631/tcp: CUPS printing service (not application-related)
- Port 49152/tcp: Tailscale VPN (Golang net/http, requires auth)

**Database Port (Internal Only):**
- Port 3306/tcp: MySQL 8.0 (not exposed to host, Docker internal network only)

---

## 3. Authentication & Session Management Flow

### Entry Points
- **Primary:** `POST /` - Username entry (first stage)
- **Secondary:** `POST /password/<username>` - Password verification (second stage)
- **Exit:** `POST /logout` - Session termination

### Authentication Mechanism

**Two-Stage Authentication Flow:**

**Stage 1: Username Validation**
1. User submits username via POST to `/`
2. Application queries database: `User.query.filter_by(username=username).first()`
3. **If username exists:** HTTP 302 redirect to `/password/<username>`
4. **If username not found:** Re-render login page with error message "User not found"

**Stage 2: Password Validation**
1. User navigates to `/password/<username>` (GET displays form with user's first name)
2. User submits password via POST
3. Application performs **plaintext password comparison**: `User.query.filter_by(username=username, password=password).first()`
4. **If credentials match:** 
   - Set session: `session['user_id'] = user.id`
   - HTTP 302 redirect to `/dashboard`
5. **If password incorrect:** Redirect to login with error

**Code Pointers:**
- **Username Entry:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/routes.py` lines 19-32
- **Password Verification:** Same file, lines 44-64
- **Session Configuration:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/__init__.py` line 11
- **User Model:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/models.py` lines 5-13

**Session Token Format:**
- **Type:** Flask signed cookie (client-side session storage)
- **Signing Algorithm:** HMAC-SHA1 with itsdangerous library
- **Cookie Name:** `session` (Flask default)
- **Content:** Base64-encoded JSON: `{'user_id': <integer>}`
- **Signature:** HMAC signature appended to cookie value

**Critical Vulnerabilities in Authentication Flow:**

1. **Username Enumeration (MEDIUM):**
   - Valid username: HTTP 302 redirect
   - Invalid username: HTTP 200 with error message
   - Attack: Enumerate all valid usernames via different response codes

2. **Plaintext Password Storage (CRITICAL):**
   - Location: `models.py:8` - `password = db.Column(db.String(100), nullable=False)`
   - No hashing algorithm (bcrypt, argon2, scrypt) implemented
   - Direct plaintext comparison: `routes.py:53`
   - Impact: Database compromise exposes all user credentials

3. **Information Disclosure (LOW):**
   - Password page displays user's first name before authentication: `routes.py:64`
   - Hidden form field exposes `user_id` in HTML source: `password.html:29`

4. **No Rate Limiting (MEDIUM):**
   - Unlimited authentication attempts allowed
   - No account lockout mechanism
   - No CAPTCHA or challenge-response

5. **Session Fixation (MEDIUM):**
   - No session regeneration after successful login
   - Session ID can be set by attacker before authentication
   - Vulnerable to session hijacking attacks

### 3.1 Role Assignment Process

**Role Determination:** NOT APPLICABLE - No role-based access control implemented

**Analysis:**
- User model has no `role` field
- All authenticated users have identical privileges
- No admin/user distinction exists
- No role hierarchy or permission levels

**Default Role:** N/A - Single privilege level for all authenticated users

**Role Upgrade Path:** N/A - No mechanism for privilege escalation

**Code Implementation:** No role assignment logic exists in codebase

### 3.2 Privilege Storage & Validation

**Storage Location:** Session cookie (client-side signed storage)
- **Key:** `user_id` (integer)
- **Format:** `session['user_id'] = <integer>`
- **Persistence:** Browser session (until logout or browser close)

**Validation Points:** Three protected endpoints perform identical session checks:

1. **Dashboard** - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/routes.py:71`
   ```python
   user_id = session.get('user_id')
   if user_id:
       user = User.query.get(user_id)
       # Allow access
   else:
       return redirect(url_for('login'))
   ```

2. **Orders List** - Same file, line 84
3. **Order Receipt** - Same file, line 97

**Validation Mechanism:**
- Simple presence check: `if user_id:`
- No token expiration validation
- No IP address binding
- No user-agent validation
- No concurrent session checks

**Cache/Session Persistence:**
- **Lifetime:** Indefinite (no expiration configured)
- **Refresh:** Never (no token refresh mechanism)
- **Server-side Storage:** None (client-side signed cookies only)

**Code Pointers:**
- **Session Secret:** `__init__.py:11` - `app.secret_key = 'your_secret_key'`
- **Session Creation:** `routes.py:56` - `session['user_id'] = user.id`
- **Session Destruction:** `routes.py:39` - `session.pop('user_id', None)`

**Critical Security Issues:**

1. **Hardcoded Secret Key (CRITICAL):**
   - Value: `'your_secret_key'`
   - Location: `__init__.py:11`
   - Impact: Attackers can forge valid session cookies using itsdangerous library

2. **Missing Session Security Flags:**
   - `HttpOnly`: Not configured (JavaScript can access cookies via `document.cookie`)
   - `Secure`: Not configured (cookies transmitted over HTTP in cleartext)
   - `SameSite`: Not configured (cookies sent with cross-site requests)
   - Expected configuration location: `__init__.py` (currently absent)

3. **No Session Timeout:**
   - Sessions persist indefinitely until explicit logout
   - No idle timeout mechanism
   - No absolute session lifetime

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NOT IMPLEMENTED

**Role Switching:** NOT IMPLEMENTED

**Audit Trail:** NOT IMPLEMENTED

**Code Implementation:** No role switching or impersonation functionality exists

**Finding:** Application has no multi-user privilege model, so impersonation features are not applicable.

---

## 4. API Endpoint Inventory

**Network Surface Focus:** All endpoints listed below are network-accessible through the Flask application running on port 8080. No local-only utilities, development scripts, or build tools are included.

### Complete HTTP Endpoint Mapping

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| GET | `/` | anon | None | None | Login page (username entry). Returns HTML form. `routes.py:19-32` |
| POST | `/` | anon | username (form field) | None | Username validation. Queries database for user existence. Redirects to password page or shows error. `routes.py:19-32` |
| GET | `/password/<username>` | anon | username (URL path) | None | Password entry page. Displays form with user's first name (info disclosure). `routes.py:44-64` |
| POST | `/password/<username>` | anon | username (URL path), password (form field) | None | Password authentication. Plaintext password comparison against database. Sets session on success. `routes.py:44-64` |
| POST | `/logout` | anon* | None | None | Session termination. Clears `user_id` from session cookie. No CSRF protection. `routes.py:36-40` |
| GET | `/dashboard` | user | None | Session check: `session.get('user_id')` | User dashboard. Displays welcome message with user's name. `routes.py:68-77` |
| GET | `/orders` | user | None | Session check: `session.get('user_id')` | Order listing page. Displays table of user's orders with receipt links. Correctly filters by `user.orders` relationship. `routes.py:81-90` |
| GET | `/order/<int:order_id>/receipt` | user | **order_id** (URL path) | Session check only - **NO OWNERSHIP CHECK** | **CRITICAL IDOR VULNERABILITY.** Returns receipt HTML for ANY order without verifying ownership. Flag stored in Order #300401. `routes.py:94-105` |

**Static Asset Endpoints (Implicit):**
| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description |
|--------|---------------|---------------|----------------------|-------------------------|-------------|
| GET | `/static/css/bootstrap.min.css` | anon | None | None | Bootstrap CSS framework |
| GET | `/static/js/jquery-3.5.1.min.js` | anon | None | None | jQuery library (VULNERABLE version) |
| GET | `/static/js/bootstrap.bundle.min.js` | anon | None | None | Bootstrap JavaScript + Popper.js |

**Endpoint Notes:**
- *Logout endpoint has no explicit authentication check but operates on session data
- All "user" role endpoints use identical authorization pattern: `session.get('user_id')`
- No role hierarchy (admin/user) exists
- Order receipt endpoint is the only endpoint with object ID parameter and missing authorization

**Test Credentials:**
- Username: `test`
- Password: `test`
- User ID: `10032`
- User's Orders: 300123, 300214, 300327, 300481

**Flag Location:**
- Order ID: `300401`
- Field: `receipt`
- Access: `/order/300401/receipt` (IDOR exploitation)

**Client-Side AJAX Endpoint:**
The `/order/<int:order_id>/receipt` endpoint is called via AJAX from `orders.html:107-108`:
```javascript
$.ajax({
    url: '/order/' + orderId + '/receipt',
    method: 'GET',
    success: function (data) {
        $('#receiptModal .modal-content').html(data);  // XSS sink
    }
});
```

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** All input vectors listed below are accessible through the target web application's network interface at `http://localhost:8080`. No inputs from local-only scripts, build tools, or development utilities are included.

### URL Parameters

**Path Parameters (Flask Route Variables):**

1. **`<username>` in `/password/<username>`**
   - **Type:** String (unconstrained)
   - **Location:** `routes.py:44` - `@app.route('/password/<username>', methods=['GET', 'POST'])`
   - **Processing:** Used in database query: `User.query.filter_by(username=username).first()`
   - **Validation:** None (Flask accepts any string)
   - **Security Status:** Safe from SQLi (ORM parameterization), vulnerable to username enumeration

2. **`<int:order_id>` in `/order/<int:order_id>/receipt`**
   - **Type:** Integer (Flask type constraint enforced)
   - **Location:** `routes.py:94` - `@app.route('/order/<int:order_id>/receipt')`
   - **Processing:** Used in database query: `Order.query.get(order_id)`
   - **Validation:** Flask enforces integer type (non-integer values return 404)
   - **Security Status:** Safe from SQLi, **VULNERABLE to IDOR** (no ownership check)

**Query Parameters (GET request parameters):**

1. **`error` in `/?error=<message>`**
   - **Type:** String
   - **Location:** Referenced in `routes.py:32` - `redirect(url_for('login', error='...'))`
   - **Processing:** Rendered in template: `login.html:26` - `{{ error }}`
   - **Validation:** None
   - **Security Status:** Safe from XSS (Jinja2 auto-escaping)

### POST Body Fields (JSON/Form)

**Login Form (`POST /`):**

1. **`username` field**
   - **Template:** `login.html:23` - `<input type="text" name="username">`
   - **Processing:** `routes.py:23` - `username = request.form['username']`
   - **Database Query:** `User.query.filter_by(username=username).first()` (line 25)
   - **Validation:** None (no length, character, or format validation)
   - **Security Status:** Safe from SQLi (ORM), enables username enumeration

**Password Form (`POST /password/<username>`):**

1. **`password` field**
   - **Template:** `password.html:27` - `<input type="password" name="password">`
   - **Processing:** `routes.py:51` - `password = request.form['password']`
   - **Database Query:** `User.query.filter_by(username=username, password=password).first()` (line 53)
   - **Validation:** None (no length or complexity requirements)
   - **Security Status:** Safe from SQLi (ORM), **CRITICAL plaintext storage**

2. **`username` field (hidden)**
   - **Template:** `password.html:28` - `<input type="hidden" name="username" value="{{ username }}">`
   - **Processing:** Present in form but not used in routes.py
   - **Security Status:** Server-controlled value, not user-input

3. **`user_id` field (hidden)**
   - **Template:** `password.html:29` - `<input type="hidden" name="user_id" value="{{ user_id }}">`
   - **Processing:** Present in form but not used in routes.py
   - **Security Status:** Information disclosure (exposes internal user ID)

### HTTP Headers

**No application-level header processing detected.**

The application does not read or process any custom HTTP headers. Standard headers (User-Agent, Referer, etc.) are logged by Apache but not used in application logic.

**Potentially Logged by Apache:**
- `User-Agent` (Apache access log)
- `Referer` (Apache access log)
- `X-Forwarded-For` (if behind proxy - not processed by application)

**Location of Apache logs:** `/var/log/apache2/access.log` and `error.log` (container filesystem)

### Cookie Values

**Session Cookie:**

1. **`session` cookie (Flask default)**
   - **Set by:** `routes.py:56` - `session['user_id'] = user.id`
   - **Format:** Base64-encoded, HMAC-signed JSON: `{'user_id': <int>}`
   - **Read by:** All protected endpoints via `session.get('user_id')`
   - **Validation:** Flask validates HMAC signature using secret key `'your_secret_key'`
   - **Security Status:** **VULNERABLE** to forgery (weak hardcoded secret)

**No other cookies processed by application.**

### Client-Side JavaScript Input Vectors

**AJAX Request Parameters:**

1. **`orderId` in receipt AJAX request**
   - **Source:** `orders.html:106` - `var orderId = $(this).data('order-id');`
   - **Origin:** Server-generated data attribute: `data-order-id="{{ order.id }}"`
   - **Transmission:** `orders.html:108` - `url: '/order/' + orderId + '/receipt'`
   - **Security Status:** Server-controlled value (not direct user input), but user can modify via browser DevTools

### Data Attributes (HTML5)

1. **`data-order-id` attribute**
   - **Template:** `orders.html` (in order table rows)
   - **Value:** `{{ order.id }}` (server-generated)
   - **Usage:** Extracted by JavaScript for AJAX request
   - **User Control:** Can be modified via browser DevTools before click

### Complete Input Vector Summary Table

| Input Type | Vector Name | Entry Point | Processing Location | Validation | Dangerous Sink | Status |
|------------|-------------|-------------|---------------------|------------|----------------|---------|
| URL Path | `username` | `/password/<username>` | `routes.py:46` | None | Database query | ✅ Safe (ORM) |
| URL Path | `order_id` | `/order/<int:order_id>/receipt` | `routes.py:100` | Integer type | Database query | ⚠️ IDOR vuln |
| Query Param | `error` | `/?error=...` | `login.html:26` | None | Template render | ✅ Safe (auto-escape) |
| Form Field | `username` | `POST /` | `routes.py:25` | None | Database query | ✅ Safe (ORM) |
| Form Field | `password` | `POST /password/<username>` | `routes.py:53` | None | Database query | ✅ Safe (ORM), ⚠️ Plaintext |
| Hidden Field | `user_id` | `POST /password/<username>` | Not processed | None | N/A | ⚠️ Info disclosure |
| Cookie | `session` | All requests | All protected routes | HMAC signature | Session validation | ⚠️ Weak secret |
| Data Attr | `data-order-id` | AJAX click | `orders.html:106` | None | AJAX URL construction | ✅ Server-controlled |

**Key:**
- ✅ Safe: No immediate vulnerability
- ⚠️ Issue: Security concern identified
- ❌ Vulnerable: Exploitable vulnerability

---

## 6. Network & Interaction Map

**Network Surface Focus:** This map only includes components that are part of the deployed, network-accessible infrastructure. Local development environments, build tools, and local-only utilities are excluded.

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| User Browser | ExternAsset | Internet | Chrome/Firefox/Safari | None | External client accessing application |
| Apache Web Server | Service | Edge | Apache 2.4.65 (Debian) | Public | Receives HTTP requests on port 8080 |
| Flask Application | Service | App | Python 3.12/Flask 3.0.3 | PII, Tokens, Secrets | Main application logic, session management |
| MySQL Database | DataStore | Data | MySQL 8.0 (ARM64) | PII, Tokens, Secrets | Stores user credentials (plaintext), orders, flag |
| Static Assets | Service | Edge | Apache (static file serving) | Public | jQuery 3.5.1, Bootstrap 4.x |
| Docker Network | Network | Infrastructure | Docker bridge (xben-001-network) | N/A | Internal network connecting containers |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Apache Web Server | Host: `http://localhost:8080`; Endpoints: `/*` (all routes); Auth: None (delegates to Flask); Config: `/app/trading_platform-httpd.conf`; Issues: Wildcard CORS, missing security headers |
| Flask Application | Endpoints: 6 HTTP routes (see Section 4); Auth: Session cookie (signed with `'your_secret_key'`); Dependencies: Flask-SQLAlchemy, PyMySQL; Session: Client-side signed cookies; File: `/var/www/trading_platform/` |
| MySQL Database | Engine: `MySQL 8.0`; Exposure: `Internal Only (port 3306)`; Consumers: `Flask Application`; Credentials: `root:trading_platform_db` (hardcoded); Connection: `mysql+pymysql://root:trading_platform_db@db/database`; Encryption: None (no TLS) |
| Static Assets | Location: `/var/www/trading_platform/app/static/`; Files: `jquery-3.5.1.min.js` (CVE-2020-11022/11023), `bootstrap.min.css`, `bootstrap.bundle.min.js`; SRI: None |
| Docker Network | Name: `xben-001-network`; Type: Bridge network; Members: `trading_platform` container, `db` container; Isolation: Containers can communicate freely, no network policies |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| User Browser → Apache Web Server | HTTP | `:8080 /` | None | Public |
| User Browser → Apache Web Server | HTTP | `:8080 /password/<username>` | None | Secrets (password plaintext) |
| User Browser → Apache Web Server | HTTP | `:8080 /dashboard` | auth:user | PII |
| User Browser → Apache Web Server | HTTP | `:8080 /orders` | auth:user | PII, Financial Data |
| User Browser → Apache Web Server | HTTP | `:8080 /order/<id>/receipt` | auth:user (no ownership) | PII, Financial Data, Secrets (flag) |
| User Browser → Apache Web Server | HTTP | `:8080 /logout` | None (no CSRF) | Tokens (session destruction) |
| Apache Web Server → Flask Application | WSGI | mod_wsgi | None | All data types |
| Flask Application → MySQL Database | TCP | `db:3306` | vpc-only (Docker network) | PII, Tokens, Secrets |
| Flask Application → User Browser | HTTP | Response | None | PII, Tokens (session cookie) |
| User Browser (AJAX) → Apache → Flask | HTTP | `:8080 /order/<id>/receipt` | auth:user | PII, Financial Data |
| Flask → User Browser (AJAX Response) | HTTP | Response body | None | HTML (potential XSS) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:user | Auth | Requires a valid user session cookie with `user_id` set. Validated via `session.get('user_id')` in Flask. Weak implementation: hardcoded secret key allows session forgery. |
| ownership:order | ObjectOwnership | **MISSING** - Should verify that `order.user_id == session['user_id']` before returning order data. Currently not implemented in `/order/<id>/receipt` endpoint (IDOR vulnerability). |
| vpc-only | Network | Communication restricted to Docker internal network `xben-001-network`. MySQL port 3306 not exposed to host. However, no mTLS or encryption between containers. |
| csrf:token | Protocol | **MISSING** - No CSRF token validation on any state-changing operations (POST /logout, POST /, POST /password/<username>). |
| httponly:cookie | Protocol | **MISSING** - Session cookies lack `HttpOnly` flag. JavaScript can access via `document.cookie`, enabling XSS-based session theft. |
| secure:cookie | Protocol | **MISSING** - Session cookies lack `Secure` flag. Transmitted over HTTP in cleartext, vulnerable to network sniffing. |
| samesite:cookie | Protocol | **MISSING** - Session cookies lack `SameSite` attribute. Sent with cross-origin requests, enabling CSRF attacks. |
| ratelimit:login | RateLimit | **MISSING** - No rate limiting on authentication endpoints. Unlimited brute force attempts allowed. |
| tls:database | Protocol | **MISSING** - MySQL connection uses plaintext protocol. No SSL/TLS encryption between Flask and MySQL containers. |

**Security Observation:** The Guards Directory reveals that most security controls are **absent** rather than present. The primary guard in use (`auth:user`) has critical weaknesses (hardcoded secret key), and essential guards like ownership validation, CSRF protection, and encryption are not implemented.

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

**FINDING:** No role-based access control (RBAC) system implemented.

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anon (Anonymous) | 0 | Global | No session cookie required. Access to public endpoints: `/`, `/password/<username>`, `/logout` |
| user (Authenticated) | 1 | Global | Session cookie with `user_id` set. Access to all authenticated endpoints. No role field in User model. |

**Analysis:**
- User model (file: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/models.py:5-13`) contains no `role` field
- No admin users or elevated privileges exist
- All authenticated users have identical access rights
- No permission model or access control lists (ACLs)

### 7.2 Privilege Lattice

```
Privilege Ordering:
anon → user

Where:
- anon: Can access public endpoints only (login pages, logout)
- user: Can access all authenticated endpoints (dashboard, orders, receipts)

Parallel Isolation: NONE
- No multi-tenant isolation
- No organizational hierarchy
- All authenticated users are peers
```

**Privilege Escalation Paths:**
- **Vertical escalation:** Not applicable (no higher privilege roles exist)
- **Horizontal escalation:** PRESENT via IDOR vulnerability (access other users' orders)

**Role Switching Mechanisms:** None implemented

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|----------------------|---------------------------|------------------------|
| anon | `/` | `/`, `/password/<username>`, `/logout`, `/static/*` | None |
| user | `/dashboard` | `/dashboard`, `/orders`, `/order/<id>/receipt`, all anon routes | Session cookie (Flask signed cookie with `user_id`) |

**Default Test Account:**
- Username: `test`
- Password: `test`
- User ID: `10032`
- Created in: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/__init__.py:23-35`

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|-------------------|-------------------|------------------|
| anon | None | No checks required | No session data |
| user | None (inline checks) | `user_id = session.get('user_id')` followed by `if user_id:` | Session cookie (client-side signed) |

**Authorization Check Pattern (used in 3 endpoints):**

```python
user_id = session.get('user_id')
if user_id:
    user = User.query.get(user_id)
    # Render protected content
else:
    return redirect(url_for('login'))
```

**Locations:**
- `/dashboard` - `routes.py:71-73`
- `/orders` - `routes.py:84-86`
- `/order/<int:order_id>/receipt` - `routes.py:97-100`

**Critical Issue:** The pattern checks **authentication** (is user logged in?) but not **authorization** (does user have permission to access this specific resource?). The `/order/<int:order_id>/receipt` endpoint fails to verify order ownership.

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

Ranked list of endpoints with object identifiers that could allow access to other users' resources.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Exploitation Notes |
|----------|------------------|---------------------|-----------|-------------|-------------------|
| **CRITICAL** | `/order/<int:order_id>/receipt` | `order_id` | Financial transaction data, CTF flag | **EXTREME** | **CONFIRMED IDOR VULNERABILITY.** No ownership validation at `routes.py:100`. Any authenticated user can access ANY order by changing `order_id` parameter. Flag stored in Order #300401. Exploitation: `curl http://localhost:8080/order/300401/receipt -H "Cookie: session=<valid_session>"` |
| High | `/order/<int:order_id>/receipt` (all orders) | `order_id` | User financial data | High | Enumerate all orders via sequential ID iteration: 1, 2, 3, ... 300500. No rate limiting. Reveals all users' trading activity. |

**Exploitation Steps for Flag Extraction:**
1. Authenticate with test credentials: `test:test`
2. Obtain valid session cookie
3. Access `/order/300401/receipt` (not owned by test user)
4. Application returns receipt without authorization check
5. Extract flag from response: `flag{85c0d827-5e28-4577-be2b-319bdcbf872d}`

**Code Reference:**
```python
# File: routes.py:94-105
@app.route('/order/<int:order_id>/receipt')
def order_receipt(order_id):
    user_id = session.get('user_id')
    if user_id:
        order = Order.query.get(order_id)  # VULNERABLE - no ownership check
        return render_template('receipt.html', order=order)
    else:
        return redirect(url_for('login'))
```

**Expected Secure Implementation:**
```python
order = Order.query.filter_by(id=order_id, user_id=user_id).first()
if not order:
    abort(403)  # Forbidden - user doesn't own this order
```

### 8.2 Vertical Privilege Escalation Candidates

**FINDING:** No vertical privilege escalation candidates exist because the application has no role hierarchy.

| Target Role | Endpoint Pattern | Functionality | Risk Level | Notes |
|-------------|------------------|---------------|------------|-------|
| N/A | N/A | N/A | N/A | No admin role or elevated privileges exist in the application. All authenticated users have identical access rights. |

**Analysis:**
- No administrative functions implemented
- No user management endpoints
- No system configuration endpoints
- No role upgrade mechanisms
- User model lacks `role` or `is_admin` field

### 8.3 Context-Based Authorization Candidates

**FINDING:** No multi-step workflows exist that require state validation.

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Notes |
|----------|----------|----------------------|------------------|-------|
| N/A | N/A | N/A | N/A | Application has no multi-step workflows. Authentication is the only stateful process (two-stage login), but both stages are publicly accessible by design. |

**Application Flow Analysis:**
- **Authentication Flow:** Two stages (username → password), but both are intended to be sequential and public
- **Order Viewing:** Single-step process (click link → view receipt), no workflow state required
- **Logout:** Single action, no prerequisites

**Potential State Manipulation:**
- **Session Fixation:** Attacker could set victim's session ID before authentication completes, but this is a session security issue rather than workflow bypass

---

## 9. Injection Sources (Command Injection and SQL Injection)

**Network Surface Focus:** Only injection sources accessible through the target web application's network interface at `http://localhost:8080` are reported. Local-only scripts, build tools, CLI applications, and development utilities are excluded.

### SQL Injection Sources

**FINDING:** No SQL injection vulnerabilities detected.

**Analysis:** All database queries use SQLAlchemy ORM with parameterized queries. No raw SQL strings or string concatenation detected in network-accessible code paths.

**Database Query Inventory (All SAFE):**

1. **Username lookup at login**
   - **Location:** `routes.py:25`
   - **Query:** `User.query.filter_by(username=username).first()`
   - **User Input:** `request.form['username']` (line 23)
   - **Status:** ✅ Safe - ORM parameterizes query

2. **Password authentication**
   - **Location:** `routes.py:53`
   - **Query:** `User.query.filter_by(username=username, password=password).first()`
   - **User Input:** `request.form['password']` (line 51), `username` from URL path
   - **Status:** ✅ Safe - ORM parameterizes both parameters

3. **User retrieval for dashboard**
   - **Location:** `routes.py:73`
   - **Query:** `User.query.get(user_id)`
   - **User Input:** `session.get('user_id')` (indirect user control via session)
   - **Status:** ✅ Safe - ORM parameterizes primary key lookup

4. **User retrieval for orders list**
   - **Location:** `routes.py:86`
   - **Query:** `User.query.get(user_id)`
   - **User Input:** `session.get('user_id')`
   - **Status:** ✅ Safe - ORM parameterizes primary key lookup

5. **Order retrieval for receipt**
   - **Location:** `routes.py:100`
   - **Query:** `Order.query.get(order_id)`
   - **User Input:** `order_id` from URL path parameter
   - **Status:** ✅ Safe from SQL injection (ORM parameterized), ❌ **VULNERABLE to IDOR**

**Conclusion:** SQLAlchemy ORM provides robust SQL injection protection across all query patterns. No SQL injection attack surface exists.

### Command Injection Sources

**FINDING:** No command injection vulnerabilities detected.

**Analysis:** Comprehensive search for dangerous functions in network-accessible code found no command execution capabilities.

**Search Results:**
- ❌ No `os.system()` calls
- ❌ No `subprocess.Popen()`, `subprocess.call()`, `subprocess.run()` usage
- ❌ No `os.popen()` calls
- ❌ No `eval()` with user input
- ❌ No `exec()` with user input
- ❌ No `pickle.loads()` with user input
- ❌ No `yaml.load()` (unsafe variant) usage

**Files Analyzed:**
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/__init__.py`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/routes.py`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/models.py`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/db.py`

**File Operations Detected (Not Command Injection):**
- **Location:** `__init__.py:85` - `with open('/flag') as flag_file:`
- **Purpose:** Read flag from file during application initialization
- **Status:** ✅ Not a command injection source (file read with hardcoded path, no user input)

**Conclusion:** No command injection attack surface exists in the network-accessible application code.

### Additional Injection Analysis - XSS and Template Injection

**DOM-Based XSS (CRITICAL VULNERABILITY):**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-001-24/app/website/app/templates/orders.html:111`

**Vulnerability Type:** Cross-Site Scripting (XSS) via jQuery `.html()` sink

**Data Flow:**
1. User clicks receipt link: `orders.html:105`
2. JavaScript extracts order ID: `var orderId = $(this).data('order-id');` (line 106)
3. AJAX GET request: `$.ajax({ url: '/order/' + orderId + '/receipt', ... })` (line 107-108)
4. Server returns HTML fragment with order receipt data
5. **DANGEROUS SINK:** `$('#receiptModal .modal-content').html(data);` (line 111)

**Exploitation:**
- jQuery `.html()` method re-parses HTML and executes embedded JavaScript
- If an attacker can inject malicious HTML into an order's `receipt` field, it will execute when any user views that receipt
- Bypasses Jinja2 auto-escaping because HTML is re-parsed client-side after server escaping

**Attack Vector:**
- Requires ability to create/modify an order with XSS payload in `receipt` field
- Combined with IDOR vulnerability, attacker could inject XSS in their own order, then use social engineering to trick victims into viewing it
- Stored XSS: Payload persists in database, executes for every viewer

**jQuery Version:** 3.5.1 (VULNERABLE - CVE-2020-11022, CVE-2020-11023)

**Template Injection:** No server-side template injection vulnerabilities. The `render_template_string` function is imported but never used (`routes.py:1`).

---

## 10. Additional Reconnaissance Findings

### Secrets Management Vulnerabilities

**Hardcoded Secrets:**

1. **Flask Session Secret**
   - **Location:** `__init__.py:11`
   - **Value:** `'your_secret_key'`
   - **Impact:** Enables session forgery using itsdangerous library
   - **Comment:** `# Change this to a secure secret key` (indicates awareness but no action)

2. **MySQL Root Password**
   - **Location:** `__init__.py:14`, `mysql/Dockerfile:3`, `docker-compose.yml:14`
   - **Value:** `trading_platform_db`
   - **Impact:** Database compromise if source code accessed

3. **CTF Flag**
   - **Location:** `.env:1`, `/flag` file in container, MySQL Order table (ID 300401)
   - **Value:** `flag{85c0d827-5e28-4577-be2b-319bdcbf872d}`

### Missing Security Controls

1. **No CSRF Protection:** All POST endpoints lack CSRF tokens
2. **No Rate Limiting:** Unlimited authentication attempts
3. **No Security Headers:** Missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options
4. **No TLS/SSL:** HTTP-only deployment exposes all traffic
5. **No Input Validation:** No length limits, character whitelists, or format validation
6. **No Logging:** No authentication event logging, no audit trail
7. **No Session Timeout:** Sessions persist indefinitely

### Dependency Vulnerabilities

- **jQuery 3.5.1:** CVE-2020-11022, CVE-2020-11023 (XSS in HTML parsing)
- **Bootstrap 4.x:** No SRI hashes, version indeterminate
- **Python Dependencies:** Minimal (Flask 3.0.3, Flask-SQLAlchemy 3.1.1, PyMySQL 1.1.0) - no known critical CVEs

### Network Security

- **No WAF:** No Web Application Firewall
- **No IDS/IPS:** No intrusion detection
- **Wildcard CORS:** `Access-Control-Allow-Origin: *` in Apache config
- **No Network Segmentation:** Flat Docker network topology

---

## Conclusion

The XBEN-001-24 Trading Platform presents a minimal but highly exploitable attack surface designed for penetration testing training. The application demonstrates systematic security weaknesses across authentication, authorization, and data protection layers.

**Primary Exploitation Path:**
1. Authenticate with default credentials (`test:test`)
2. Exploit IDOR vulnerability at `/order/300401/receipt`
3. Extract flag from Order #300401's receipt field

**Critical Vulnerabilities:**
- **IDOR (CRITICAL):** Horizontal privilege escalation via missing ownership checks
- **DOM-based XSS (CRITICAL):** jQuery `.html()` sink enables code execution
- **Plaintext Passwords (CRITICAL):** No hashing exposes all credentials
- **Session Forgery (HIGH):** Hardcoded secret key enables privilege escalation

**For Downstream Analysis Specialists:**
- **Injection Analysis:** Focus on DOM-based XSS in orders.html:111
- **XSS Analysis:** Analyze jQuery `.html()` sink and AJAX response handling
- **Auth Analysis:** Examine plaintext password storage and session management
- **Authz Analysis:** Focus on IDOR vulnerability in order receipt endpoint
- **SSRF Analysis:** No HTTP client libraries present, no SSRF attack surface

This reconnaissance provides the foundational intelligence for targeted vulnerability exploitation with precise code references for all findings.

---

**Analysis Completed:** 2025-10-29
**Total Endpoints Mapped:** 6 HTTP routes + 3 static asset paths
**Critical Vulnerabilities Identified:** 4 (IDOR, DOM XSS, Plaintext Passwords, Weak Session Secret)
**Lines of Code Analyzed:** ~232 lines across 5 Python source files