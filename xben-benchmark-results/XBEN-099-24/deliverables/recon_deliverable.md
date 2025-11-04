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

This is a deliberately vulnerable Node.js/Express web application (CTF Challenge XBEN-099-24) designed as a security assessment target. The application is a minimal user registration and authentication portal with **CRITICAL SECURITY VULNERABILITIES** that enable trivial exploitation by external attackers.

**Application Profile:** A 228-line monolithic Express.js server serving 8 HTTP endpoints over port 3000, backed by an unauthenticated MongoDB database. The primary security objective is a CTF flag stored in an environment variable and conditionally displayed on the first user's profile page.

**Core Technology Stack:**
- **Frontend:** HTML with inline JavaScript (jQuery 3.6.0 from CDN)
- **Backend:** Node.js v21 with Express.js v4.19.2
- **Database:** MongoDB (latest) with Mongoose v8.4.1 ODM
- **Authentication:** bcryptjs v2.4.3 (password hashing only, NO session management)
- **Infrastructure:** Docker Compose (2 containers: app + mongodb)
- **Deployment:** HTTP-only (no HTTPS), port 3000 exposed to host

**Critical Attack Surface:** The application exposes multiple severe vulnerabilities including:
1. **Complete authentication bypass via IDOR** - Any user can access any profile by ObjectId
2. **MongoDB ObjectId prediction** - Information disclosure endpoints enable calculating first user's ID
3. **Stored XSS** - Unsanitized username fields rendered without encoding
4. **NoSQL injection** - Login endpoint vulnerable to operator injection
5. **No session management** - Authentication state not persisted, URL-based access only
6. **No security middleware** - Zero input validation, rate limiting, or security headers

**Primary Exploitation Path:** An external attacker can retrieve the CTF flag by:
1. Accessing `/starttime` endpoint → obtain exact Unix timestamp of application initialization
2. Registering a new account → receive ObjectId structure information including counter distance
3. Calculating first user's MongoDB ObjectId using disclosed timestamp and counter
4. Directly accessing `/profile/<calculated-objectid>` without authentication → retrieve flag

This attack chain requires no authentication, no special privileges, and can be executed with basic HTTP requests.

## 2. Technology & Service Map

### Frontend
- **Framework:** Vanilla HTML with inline JavaScript
- **JavaScript Library:** jQuery 3.6.0 (loaded from CDN: `https://code.jquery.com/jquery-3.6.0.min.js`)
- **Templating:** Template literals (no templating engine)
- **Client-Side Validation:** HTML5 `required` attributes only (bypassable)
- **AJAX Implementation:** jQuery AJAX for registration form submission

### Backend
- **Language:** JavaScript (Node.js v21)
- **Framework:** Express.js v4.19.2
- **Architecture:** Monolithic single-file application (228 lines total)
- **Main Application File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-099-24/app/server.js`
- **Key Dependencies:**
  - `express` v4.19.2 - Web application framework
  - `mongoose` v8.4.1 - MongoDB ODM
  - `bcryptjs` v2.4.3 - Password hashing
- **Middleware:** Only `express.urlencoded({ extended: true })` - NO security middleware
- **Session Management:** NONE (critical security gap)
- **Input Validation:** NONE (critical security gap)

### Infrastructure
- **Hosting:** Docker containers (Docker Compose orchestration)
- **Container 1:** Node.js application (Alpine-based, node:21-alpine)
- **Container 2:** MongoDB database (mongo:latest)
- **Network:** Docker bridge network (`app-network`)
- **Port Mapping:** Host port 3000 → Container port 3000
- **Database Exposure:** MongoDB port 27017 internal only (not exposed to host)
- **CDN:** jQuery loaded from code.jquery.com (supply chain risk)
- **Protocol:** HTTP only (no HTTPS/TLS configured)

### Database
- **Type:** MongoDB (NoSQL document database)
- **Version:** Latest (not pinned - reproducibility issue)
- **ODM:** Mongoose v8.4.1
- **Authentication:** NONE (unauthenticated access from app container)
- **Encryption:** None (no encryption at rest or in transit)
- **Storage:** Docker volume `mongodata` (persistent, unencrypted)
- **Connection String:** `mongodb://mongodb:27017/appdb`

### Identified Subdomains
Based on subfinder scan results from pre-recon:
- server02.counterintel.localhost
- mail.localhost
- autodiscover.regency.localhost
- mail03.regency.localhost
- server2.hunter.localhost
- naeu2.naeuinc.localhost
- autodiscover.localhost
- mse-ca-mail.corp.mse.localhost
- owa.regency.localhost
- www.localhost
- fndlync01.5ninesdata.localhost
- mail02.regency.localhost
- tools.sonoma.edu.localhost
- exchvm.nwcnet.localhost
- mail.regency.localhost
- sbs.allsaintsschool.localhost

**Note:** These subdomains appear to be from subfinder's database but are not actively used by the target application on port 3000.

### Open Ports & Services
Based on nmap scan results from pre-recon:
- **Port 3000/tcp** - Node.js (Express middleware) - **TARGET APPLICATION**
- Port 80/tcp - Caddy httpd
- Port 443/tcp - SSL/HTTPS
- Port 631/tcp - CUPS 2.3 (printer service)
- Port 4444/tcp - SimpleHTTPServer 0.6 (Python 3.12.10) with exposed .git repository
- Port 5000/tcp - Werkzeug httpd 3.1.3 (Python 3.9.24) - Library V1: Book Store
- Port 5003/tcp - Werkzeug httpd 3.0.3 (Python 3.8.17) - User List
- Port 8080/tcp - Apache httpd 2.4.54 (Debian) - PHPAbUsers
- Port 8888/tcp - sun-answerbook
- Port 9999/tcp - HTTP service with CORS headers
- Port 49152/tcp - Golang net/http server (Tailscale - auth required)

**Primary Target:** Port 3000 (Node.js/Express application)

## 3. Authentication & Session Management Flow

### Entry Points
- **GET /register** (lines 88-138) - Registration form page
- **POST /register** (lines 140-171) - Account creation endpoint
- **GET /login** (lines 173-187) - Login form page
- **POST /login** (lines 189-200) - Authentication endpoint

### Mechanism

**Registration Flow:**
1. User navigates to `/register` → HTML form with jQuery AJAX handler served
2. User submits username/password → AJAX POST to `/register`
3. Server extracts credentials from `req.body` (line 152)
4. Password hashed with bcrypt, 10 salt rounds (line 153)
5. User document created and saved to MongoDB (lines 154-155)
6. **CRITICAL:** Server returns JSON with `userId` (MongoDB ObjectId) and `distance` metric (lines 166-169)
7. No session created, no cookie set, no authentication token issued

**Login Flow:**
1. User navigates to `/login` → HTML form served
2. User submits username/password → Standard POST to `/login`
3. Server queries MongoDB: `User.findOne({ username })` (line 191) - **NOSQL INJECTION VULNERABLE**
4. Password validated with bcrypt.compare (line 195) - constant-time comparison
5. On success: `res.redirect('/profile/${user._id}')` (line 199) - **NO SESSION CREATED**
6. On failure: `res.redirect('/login')` (lines 193, 197)

**CRITICAL SECURITY FLAW:** Authentication state is NOT persisted. No session cookie, no JWT token, no authentication state is created. The URL itself (`/profile/:id`) becomes the only "authentication" mechanism.

**Profile Access Flow:**
1. Browser redirected to `/profile/${user._id}` after login
2. **ANY user can access ANY profile** by changing the `:id` parameter
3. No authentication check performed (line 202-215)
4. No authorization check performed
5. Profile data rendered, flag conditionally displayed based on ObjectId comparison only

### Code Pointers

**Primary Authentication File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-099-24/app/server.js`

**Key Functions/Endpoints:**
- **Middleware Configuration:** Line 80 - Only `express.urlencoded({ extended: true })`
- **User Schema:** Lines 26-30 - Contains `username`, `password`, `createdAt` only (no role field)
- **Password Hashing:** Line 153 (registration), Line 42 (initial user creation)
- **Password Verification:** Line 195 (login endpoint)
- **Registration Handler:** Lines 140-171
- **Login Handler:** Lines 189-200
- **Profile Access:** Lines 202-215 (IDOR vulnerability)
- **Initial User Creation:** Lines 37-63 (hardcoded credentials)

**Database Connection:** Line 16 - `mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongodb:27017/appdb')`

**Session Management Code:** **DOES NOT EXIST** - No session middleware found

### 3.1 Role Assignment Process

**Role Determination:** **NO ROLE SYSTEM EXISTS**
- The User schema contains NO role field (lines 26-30)
- No `role`, `isAdmin`, `permissions`, or privilege field exists
- All users have identical database schema
- The only "privilege" distinction is whether a user's ObjectId matches `firstUserId` (line 213)

**Default Role:** N/A - All users are equivalent

**Role Upgrade Path:** N/A - No role system to upgrade within

**Implicit Privilege Assignment:**
- **First User (user0):** Has hardcoded password `"1b2e97s80wb7d08n-"` (line 41)
- **First User Privilege:** Global variable `firstUserId` set to first user's ObjectId (line 58)
- **Flag Display Logic:** Line 213 compares profile ObjectId with `firstUserId` to determine flag display
- **Code Implementation:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-099-24/app/server.js` lines 8, 58, 213

**Critical Finding:** The first user's "privilege" is not a role but an identity check. Any user who can access the first user's profile URL can view the flag. No authorization prevents this.

### 3.2 Privilege Storage & Validation

**Storage Location:** Server-side global variable (volatile, in-memory)
- Line 8: `let firstUserId = null;` - Global variable declaration
- Line 58: `firstUserId = user._id;` - Assignment during initialization
- Line 213: `${user._id.toString() == firstUserId ? '<p>' + flag + '</p>' : '-'}` - Privilege check

**Validation Points:** Single inline conditional check (line 213)
- **Location:** Profile endpoint (`GET /profile/:id`)
- **Type:** Inline conditional (no middleware, no decorator, no guard)
- **Logic:** Compares viewed profile's ObjectId with stored `firstUserId`
- **CRITICAL FLAW:** Checks whether to DISPLAY flag, NOT whether user is AUTHORIZED to view profile

**Cache/Session Persistence:** 
- NO session persistence exists
- NO JWT claims with roles
- NO database storage of privileges
- Global variable `firstUserId` is re-initialized on every server restart (lines 37-63)

**Code Pointers:**
- **Privilege Storage:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-099-24/app/server.js:8`
- **Privilege Assignment:** Lines 58
- **Privilege Validation:** Line 213
- **No Session Store:** N/A (does not exist)
- **No JWT Claims:** N/A (JWT not used)
- **No Database Role Field:** Lines 26-30 (User schema has no role)

### 3.3 Role Switching & Impersonation

**Impersonation Features:** NONE implemented intentionally

**However - Trivial IDOR Allows Unauthorized Profile Access:**
Any user can "impersonate" any other user by accessing their profile URL:
```
GET /profile/507f1f77bcf86cd799439011  ← User A's profile
GET /profile/507f1f77bcf86cd799439022  ← User B's profile (accessible without auth)
GET /profile/<first-user-id>           ← First user's profile with flag
```

**Code Implementation:** Line 202-215 - No ownership validation
```javascript
app.get('/profile/:id', async (req, res) => {
    const user = await User.findById(req.params.id);  // No auth check!
    // ... renders profile for ANY valid ObjectId
});
```

**Role Switching:** Not applicable (no roles exist)

**Audit Trail:** NONE
- No logging of profile access
- No logging of login attempts
- No security event monitoring
- Only basic console.log statements (lines 18-19, 59-62, 71, 151)

## 4. API Endpoint Inventory

All endpoints listed below are network-accessible via HTTP on port 3000.

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|---|---|---|---|---|---|
| GET | `/` | anon | None | None | Home page with welcome message, navigation links, and first user creation timestamp. **Code:** `server.js:82-86` |
| GET | `/register` | anon | None | None | Registration form page with jQuery AJAX handler. Loads jQuery 3.6.0 from CDN. **Code:** `server.js:88-138` |
| POST | `/register` | anon | None | None | User registration endpoint. Accepts `username` and `password` in body. Returns JSON with `userId` (ObjectId) and `distance` metric. **VULNERABILITY:** Information disclosure of ObjectId and counter data. **Code:** `server.js:140-171` |
| GET | `/login` | anon | None | None | Login form page with standard POST submission. **Code:** `server.js:173-187` |
| POST | `/login` | anon | None | None (password verification only) | Authentication endpoint. Accepts `username` and `password` in body. Redirects to `/profile/:id` on success. **VULNERABILITY:** NoSQL injection (line 191), no session creation. **Code:** `server.js:189-200` |
| GET | `/profile/:id` | anon | `id` (user ObjectId) | **NONE - CRITICAL IDOR** | User profile display. Shows username and conditionally displays flag if ObjectId matches firstUserId. **VULNERABILITIES:** No authentication check, no authorization, IDOR, stored XSS (username rendered without encoding). **Code:** `server.js:202-215` |
| GET | `/info` | anon | None | None | Information disclosure endpoint. Returns total user count and application start timestamp (Unix + ISO 8601). **VULNERABILITY:** Timing information disclosure. **Code:** `server.js:217-224` |
| GET | `/starttime` | anon | None | None | Returns raw Unix timestamp of application start. **CRITICAL:** Primary enabler for ObjectId prediction attack. **Code:** `server.js:226-228` |

**Summary:**
- **Total Endpoints:** 8
- **Public Endpoints (no auth):** 8 (100%)
- **Endpoints with Object IDs:** 1 (`/profile/:id`)
- **Endpoints with Authorization Checks:** 0 (CRITICAL)
- **Endpoints with Input Validation:** 0 (CRITICAL)
- **Endpoints with Rate Limiting:** 0 (CRITICAL)

## 5. Potential Input Vectors for Vulnerability Analysis

All input vectors listed below are accessible through the target web application's network interface (HTTP on port 3000).

### URL Parameters
**Endpoint:** `GET /profile/:id`
- **Parameter:** `id` - MongoDB ObjectId (24 hex characters)
- **Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-099-24/app/server.js:203`
- **Validation:** NONE
- **Sanitization:** NONE
- **Risk:** IDOR vulnerability, potential NoSQL injection
- **Data Flow:** `req.params.id` → `User.findById()` → MongoDB query

### POST Body Fields (application/x-www-form-urlencoded)

#### Registration Endpoint (`POST /register`)
1. **`username` field**
   - **Location:** `server.js:152`
   - **Validation:** NONE
   - **Sanitization:** NONE
   - **Risk:** CRITICAL - Stored XSS, NoSQL injection
   - **Data Flow:** `req.body.username` → MongoDB storage → `server.js:211` rendered in HTML without encoding

2. **`password` field**
   - **Location:** `server.js:152`
   - **Validation:** NONE (no length, complexity requirements)
   - **Sanitization:** bcrypt hashing (10 rounds) at line 153
   - **Risk:** LOW - Properly hashed, but no password policy
   - **Data Flow:** `req.body.password` → `bcrypt.hash()` → MongoDB storage

#### Login Endpoint (`POST /login`)
3. **`username` field**
   - **Location:** `server.js:190`
   - **Validation:** NONE
   - **Sanitization:** NONE
   - **Risk:** CRITICAL - NoSQL injection via MongoDB operators
   - **Data Flow:** `req.body.username` → `User.findOne({ username })` at line 191
   - **Attack Vector:** `username[$ne]=admin` bypasses authentication

4. **`password` field**
   - **Location:** `server.js:190`
   - **Validation:** NONE
   - **Sanitization:** bcrypt comparison at line 195
   - **Risk:** MEDIUM - No rate limiting, brute force possible
   - **Data Flow:** `req.body.password` → `bcrypt.compare()`

### HTTP Headers
**Status:** NOT PROCESSED - Application does not read or validate custom HTTP headers
- No JWT token validation (no `Authorization` header processing)
- No API key validation
- No custom authentication headers
- Only standard Express header parsing

**However:** `Content-Type` header manipulation could enable NoSQL injection:
- Default: `application/x-www-form-urlencoded`
- Attack: Manipulate to send JSON payloads with MongoDB operators

### Cookie Values
**Status:** NOT USED - Application has no cookie-based functionality
- No cookie-parser middleware
- No session cookies
- No authentication cookies
- No CSRF tokens in cookies
- No `res.cookie()` calls in code

### Summary of Input Vectors

| # | Input Vector | Endpoint | Location | Type | Validation | Risk Level |
|---|-------------|----------|----------|------|------------|------------|
| 1 | `username` | POST /register | server.js:152 | Body (form) | NONE | CRITICAL |
| 2 | `password` | POST /register | server.js:152 | Body (form) | NONE | MEDIUM |
| 3 | `username` | POST /login | server.js:190 | Body (form) | NONE | CRITICAL |
| 4 | `password` | POST /login | server.js:190 | Body (form) | NONE | MEDIUM |
| 5 | `id` | GET /profile/:id | server.js:203 | URL param | NONE | CRITICAL |

**Total Network-Accessible Input Vectors: 5**

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|---|---|---|---|---|---|
| User Browser | ExternAsset | Internet | Web Browser | PII (input) | External attacker or legitimate user |
| ExpressApp | Service | App | Node.js v21 / Express v4.19.2 | PII, Tokens, Secrets | Main application on port 3000, runs as root in container |
| MongoDB | DataStore | Data | MongoDB latest / Mongoose 8.4.1 | PII, Tokens, Secrets | Stores user credentials and data, no authentication |
| jQuery CDN | ThirdParty | Internet | CDN (code.jquery.com) | Public | External JavaScript library dependency |
| Docker Host | AdminPlane | Admin | Docker / Docker Compose | Secrets (env vars) | Container orchestration, exposes port 3000 |

### 6.2 Entity Metadata

| Title | Metadata |
|---|---|
| ExpressApp | Hosts: `http://localhost:3000`; Endpoints: `/`, `/register`, `/login`, `/profile/:id`, `/info`, `/starttime`; Auth: None (password verification only); Dependencies: MongoDB, jQuery CDN; Container: node:21-alpine; Running as: root (UID 0); Environment: FLAG, MONGODB_URI, PORT |
| MongoDB | Engine: MongoDB latest; Exposure: Internal Docker network only (port 27017); Consumers: ExpressApp; Credentials: None (unauthenticated); Encryption: None (plaintext at rest and in transit); Volume: mongodata (persistent); Connection: `mongodb://mongodb:27017/appdb` |
| jQuery CDN | Provider: code.jquery.com; Version: 3.6.0; Protocol: HTTPS; Integrity: No SRI hash verification; Risk: Supply chain attack vector |
| Docker Host | Network: app-network (bridge); Port Mapping: 3000:3000 (host:container); Volumes: mongodata; Secrets: .env file with FLAG; Security: No read-only filesystem, no capability dropping |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|---|---|---|---|---|
| User Browser → ExpressApp | HTTP | `:3000 /` | None | Public |
| User Browser → ExpressApp | HTTP | `:3000 /register` (GET) | None | Public |
| User Browser → ExpressApp | HTTP | `:3000 /register` (POST) | None | PII |
| User Browser → ExpressApp | HTTP | `:3000 /login` (GET) | None | Public |
| User Browser → ExpressApp | HTTP | `:3000 /login` (POST) | None (password check only) | PII, Tokens |
| User Browser → ExpressApp | HTTP | `:3000 /profile/:id` | **None - IDOR vulnerability** | PII, Secrets (flag) |
| User Browser → ExpressApp | HTTP | `:3000 /info` | None | Public |
| User Browser → ExpressApp | HTTP | `:3000 /starttime` | None | Public (timing oracle) |
| ExpressApp → MongoDB | TCP | `:27017` (MongoDB Wire Protocol) | None (unauthenticated) | PII, Tokens, Secrets |
| User Browser → jQuery CDN | HTTPS | `code.jquery.com/jquery-3.6.0.min.js` | None | Public |
| Docker Host → ExpressApp | Docker network | Container exposure | Docker network isolation | Secrets (env vars) |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|---|---|---|
| None | N/A | **NO GUARDS IMPLEMENTED** - All endpoints are publicly accessible without authentication or authorization |
| password-verify | Auth | Password verification using bcrypt.compare() at login (line 195). Does NOT create session or persistent auth state. |
| flag-display-check | Authorization | Inline conditional check (line 213) that compares profile ObjectId with firstUserId to determine flag display. Does NOT prevent unauthorized profile access. |
| vpc-only (MongoDB) | Network | MongoDB accessible only within Docker network app-network. Not exposed to host. Provides network-level isolation but no authentication. |

**CRITICAL FINDING:** The application has NO authorization guards, authentication middleware, or session validation. The only "guard" is a password verification function that creates no persistent authentication state.

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|---|---|---|---|
| anonymous | 0 | Global | No authentication required. Can access all endpoints. |
| user | 1 | Global | Any registered user. Identical capabilities to anonymous (no session/auth state). |
| first-user (user0) | 1* | Global | Special case: user0's profile displays flag when accessed. Not a true role - just ObjectId comparison. Lines 8, 58, 213. |

**CRITICAL FINDING:** This application has NO role-based access control system. The User schema (lines 26-30) contains NO role field. All users have identical capabilities. The only privilege distinction is the first user's ObjectId being stored in a global variable for flag display comparison.

**Hardcoded First User Credentials:**
- **Username:** `user0`
- **Password:** `1b2e97s80wb7d08n-`
- **Code Location:** Lines 40-41
- **Creation:** Automatic on server startup (lines 37-63)

### 7.2 Privilege Lattice

```
Privilege Ordering:
All users have IDENTICAL capabilities (can register, login, access any profile by ObjectId)

Special Distinction:
first-user (user0) → Has flag visible on THEIR profile (but ANY user can access this profile via IDOR)

No True Hierarchy:
anonymous ≈ user ≈ first-user (all can perform same actions)
```

**CRITICAL FINDING:** There is NO privilege hierarchy. The first user does not have elevated capabilities - they simply have a flag displayed on their profile page. However, since ANY user can access ANY profile (IDOR vulnerability), this distinction is meaningless from a security perspective.

**Role Switching Mechanisms:** NONE (no roles to switch between)

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|---|---|---|---|
| anonymous | `/` | All 8 endpoints (`/`, `/register`, `/login`, `/profile/:id`, `/info`, `/starttime`) | None required |
| user (post-registration) | N/A (receives JSON response) | All 8 endpoints | None (no session created) |
| user (post-login) | `/profile/${user._id}` | All 8 endpoints + any other profile via IDOR | URL-based (no session/token) |

**CRITICAL FINDING:** After successful login, users are redirected to `/profile/${user._id}` but NO session is created. The URL itself becomes the only "authentication" mechanism. Users can bookmark the URL or share it. Any user can access any other user's profile by changing the ObjectId in the URL.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|---|---|---|---|
| anonymous | None | None | N/A |
| user | None | None (password verify at login only) | N/A (no session) |
| first-user | None | `user._id.toString() == firstUserId` (line 213) | Server memory (global variable, line 8) |

**Code Locations:**
- **No Role Middleware:** N/A (does not exist)
- **No Permission Checks:** N/A (except flag display conditional at line 213)
- **No Role Storage:** User schema (lines 26-30) has no role field
- **First User Tracking:** Global variable `firstUserId` at lines 8, 58, 213

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Attack Scenario |
|---|---|---|---|---|---|
| **CRITICAL** | `/profile/:id` | `id` (MongoDB ObjectId) | user_profile + flag | **HIGHEST** | **Any user can access ANY profile including first user's profile with flag. No ownership validation. Line 202-215.** |

**Detailed Analysis:**

**Endpoint:** `GET /profile/:id`
- **Code Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-099-24/app/server.js:202-215`
- **Vulnerability Type:** Insecure Direct Object Reference (IDOR)
- **Object ID:** MongoDB ObjectId in URL path parameter (`:id`)
- **Authorization Check:** NONE
- **Ownership Validation:** NONE
- **Attack Vector:**
  1. Attacker registers account → receives their ObjectId in response (line 166)
  2. Attacker accesses `/starttime` → obtains server start timestamp
  3. Attacker calculates first user's ObjectId using timestamp + counter distance
  4. Attacker accesses `/profile/<first-user-objectid>` → flag displayed (line 213)
  5. **No authentication required** to view any profile

**Code Snippet:**
```javascript
// Lines 202-215 - NO AUTHORIZATION CHECK
app.get('/profile/:id', async (req, res) => {
    const user = await User.findById(req.params.id);  // ← No check if requester owns this profile
    if (!user) {
        return res.status(404).send('User not found');
    }
    
    res.send(`
        <h1>Welcome, ${user.username}</h1>
        ${user._id.toString() == firstUserId ? '<p>' + flag + '</p>' : '-'}  // ← Flag display logic
    `);
});
```

**Impact:** Complete authentication bypass, flag retrieval without credentials

### 8.2 Vertical Privilege Escalation Candidates

**Finding:** NO vertical privilege escalation opportunities exist because there is NO role hierarchy.

**Reasoning:**
- No admin role exists
- No elevated privileges exist
- No administrative functions exist
- All users have identical capabilities
- The first user's "privilege" (flag display) is not a role-based restriction

**Endpoints Requiring Higher Privileges:** NONE (no role system exists)

**However - First User Profile Access:**
While not true vertical escalation, accessing the first user's profile could be considered privilege escalation:

| Target "Privilege" | Endpoint Pattern | Functionality | Risk Level | Attack Method |
|---|---|---|---|---|
| First user flag access | `/profile/<first-user-id>` | View flag on first user's profile | CRITICAL | Calculate first user's ObjectId via timing attack, then access via IDOR (no role needed) |

**Code Location:** Line 213 - Flag display conditional

### 8.3 Context-Based Authorization Candidates

**Finding:** NO multi-step workflow endpoints exist. All endpoints are single-step operations.

**Analysis:**
- **Registration:** Single-step POST (no multi-step verification)
- **Login:** Single-step POST (no 2FA, no email confirmation)
- **Profile Access:** Single-step GET (no prerequisite steps)

**No Context-Based Authorization To Bypass:** The application has no workflows that assume prior steps were completed.

**Potential Future Risk:** If the application were to add:
- Multi-step registration (email verification)
- Password reset flows
- Multi-factor authentication
- Checkout/payment workflows

These would need context-based authorization testing. Currently NONE exist.

## 9. Injection Sources (Command Injection and SQL Injection)

### Command Injection Sources

**Finding:** **NO COMMAND INJECTION SOURCES FOUND**

**Analysis Performed:**
- Searched for shell command execution: `exec`, `execSync`, `spawn`, `execFile`, `child_process` - **No matches**
- Searched for code evaluation: `eval()`, `Function()`, `new Function()` - **No matches**
- Reviewed all user input handling - **No shell command execution**
- Examined all network-accessible endpoints - **No command injection sinks**

**Conclusion:** The application does not execute shell commands or system calls based on user input.

### SQL Injection Sources

**Note:** This application uses MongoDB (NoSQL), not SQL databases. However, NoSQL injection vulnerabilities exist.

### NoSQL Injection Sources

#### **VULNERABILITY #1: NoSQL Injection in Login Endpoint**

**Severity:** HIGH
**Type:** NoSQL Injection (MongoDB operator injection)

**Complete Data Flow:**

1. **User Input Origin:**
   - **Endpoint:** `POST /login`
   - **Parameter:** `username` (from `req.body.username`)
   - **Line:** 190

2. **Data Flow Path:**
   ```
   HTTP POST /login
   → express.urlencoded middleware (line 80) parses body
   → req.body.username extracted (line 190)
   → User.findOne({ username }) query (line 191)
   → MongoDB query execution
   ```

3. **Validation/Sanitization:**
   - ❌ **NO type validation** - Accepts objects, not just strings
   - ❌ **NO sanitization** - MongoDB operators not filtered
   - ❌ **NO input validation middleware**
   - ❌ **NO express-mongo-sanitize** package

4. **Dangerous Sink Location:**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-099-24/app/server.js`
   - **Line:** 191
   - **Code:** `const user = await User.findOne({ username });`

5. **Exploitation Example:**

   **Attack Request:**
   ```http
   POST /login HTTP/1.1
   Host: localhost:3000
   Content-Type: application/x-www-form-urlencoded

   username[$ne]=admin&password=anything
   ```

   **Parsed as:**
   ```javascript
   {
     username: { $ne: "admin" },
     password: "anything"
   }
   ```

   **Resulting MongoDB Query:**
   ```javascript
   User.findOne({ username: { $ne: "admin" } })
   // Returns first user whose username is NOT "admin"
   ```

   **Impact:** Authentication bypass - attacker can log in as first user (user0) without knowing credentials

**Other MongoDB Operator Attack Vectors:**
- `username[$gt]=` - Greater than (returns any user)
- `username[$regex]=^user` - Regex injection
- `username[$nin][]=user1&username[$nin][]=user2` - Not in array

#### **VULNERABILITY #2: Potential NoSQL Injection in Profile Endpoint**

**Severity:** LOW (lower risk due to `findById` method)
**Type:** NoSQL Injection (malformed ObjectId)

**Data Flow:**
1. **User Input Origin:** `GET /profile/:id` → `req.params.id`
2. **Sink Location:** Line 203 - `const user = await User.findById(req.params.id);`
3. **Validation:** NONE
4. **Risk:** `findById()` is designed for strings and handles ObjectId conversion safely, but malformed input could cause DoS

**File Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-099-24/app/server.js:203`

### Summary of Injection Sources

| # | Type | Endpoint | Parameter | Data Flow | Validation | Line | Severity |
|---|------|----------|-----------|-----------|------------|------|----------|
| 1 | NoSQL Injection | POST /login | `username` | req.body → User.findOne() | NONE | 191 | HIGH |
| 2 | NoSQL Injection | GET /profile/:id | `id` | req.params → User.findById() | NONE | 203 | LOW |
| 3 | Command Injection | N/A | N/A | N/A | N/A | N/A | NONE |

**Total Network-Accessible Injection Sources:** 2 NoSQL injection vulnerabilities, 0 command injection vulnerabilities

## Conclusion

This reconnaissance analysis has identified a deliberately vulnerable application with **CRITICAL security deficiencies** across all security domains:

**Primary Attack Vectors:**
1. **IDOR + ObjectId Prediction** - Complete authentication bypass enabling flag retrieval
2. **NoSQL Injection** - Authentication bypass via MongoDB operator injection
3. **Stored XSS** - Malicious username execution in victim browsers
4. **Information Disclosure** - Timing data enabling cryptographic attacks

**Architectural Security Failures:**
- Zero session management (stateless, URL-based authentication)
- Zero security middleware (no validation, rate limiting, or headers)
- Zero input validation across all endpoints
- Zero authorization checks (anyone can access anything)
- HTTP-only deployment (plaintext credential transmission)
- Unauthenticated MongoDB with no encryption

**Attack Surface Summary:**
- 8 publicly accessible HTTP endpoints
- 5 user input vectors (all unvalidated)
- 2 NoSQL injection sinks
- 1 IDOR vulnerability (critical)
- 1 stored XSS vulnerability
- Multiple information disclosure endpoints

**Risk Assessment:**
- **Overall Security Grade:** F (CRITICAL RISK)
- **External Attacker Exploitability:** Trivial (basic HTTP requests only)
- **Impact:** Complete compromise (flag retrieval, account takeover, XSS, data exfiltration)
- **Recommendation:** **NEVER deploy to production** without comprehensive security remediation

This comprehensive reconnaissance provides all subsequent analysis specialists with detailed attack surface mapping, specific code locations, complete data flow traces, and clear exploitation paths for vulnerability analysis and exploitation phases.

---

**RECONNAISSANCE COMPLETE**