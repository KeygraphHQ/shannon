# Authentication Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** Multiple critical authentication vulnerabilities identified, including hardcoded secret key enabling session forgery, plaintext password storage, missing transport security, lack of rate limiting, and session management flaws.
- **Purpose of this Document:** This report provides the strategic context on the application's authentication mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

**Critical Findings Summary:**
This Flask 3.0.3 loan calculator application demonstrates catastrophic authentication security failures across all defense layers. The application stores passwords in plaintext, uses a hardcoded session secret key (`'your_secret_key'`), lacks HTTPS/TLS entirely, implements no rate limiting on authentication endpoints, and includes default credentials (`test:test`) that are automatically created on application startup. The combination of the weak secret key and missing session rotation enables trivial session forgery and fixation attacks. All authentication traffic occurs over unencrypted HTTP, exposing credentials and session tokens to network interception.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Catastrophic Credential Management Failures
- **Description:** The application demonstrates a complete breakdown in credential security. Passwords are stored in plaintext in the MySQL database (VARCHAR(50) field), compared directly without hashing in authentication queries, and include hardcoded default test credentials (`test:test`) that are automatically seeded on application startup. The User model lacks any password hashing implementation, and no cryptographic libraries (bcrypt, argon2, pbkdf2) are installed.
- **Implication:** Any database access—whether through SSTI exploitation, SQL injection, or backup theft—immediately exposes all user passwords in cleartext. The default credentials provide instant authenticated access without brute forcing. Combined with the lack of rate limiting, attackers can freely attempt credential stuffing and password spraying attacks.
- **Representative Findings:** `AUTH-VULN-01` (Plaintext Password Storage), `AUTH-VULN-02` (Default Credentials), `AUTH-VULN-05` (No Password Policy)
- **Code Locations:** 
  - `app/website/app/models.py:8` - Plaintext password field
  - `app/website/app/routes.py:31` - Plaintext password comparison
  - `app/website/app/__init__.py:20-35` - Default account creation

### Pattern 2: Session Management Security Collapse
- **Description:** The application's session implementation suffers from multiple critical flaws: hardcoded secret key (`'your_secret_key'`), no session ID rotation after login (enabling session fixation), missing `Secure` and `SameSite` cookie flags, no session timeout configuration, and incomplete session invalidation on logout. The secret key is a placeholder value that should never be used in production, yet it remains hardcoded in source code and committed to version control.
- **Implication:** With the known secret key, attackers can forge arbitrary session cookies to impersonate any user without authentication. Session fixation attacks are trivial because sessions are not rotated after successful login. The lack of the `Secure` flag allows session cookie interception over HTTP (which is the only protocol the application supports). No session expiration means compromised sessions remain valid indefinitely.
- **Representative Findings:** `AUTH-VULN-03` (Hardcoded Secret Key / Session Forgery), `AUTH-VULN-04` (Session Fixation), `AUTH-VULN-06` (Missing Cookie Security Flags), `AUTH-VULN-08` (No Session Timeout)
- **Code Locations:**
  - `app/website/app/__init__.py:9` - Hardcoded secret key
  - `app/website/app/routes.py:34` - No session rotation on login
  - `app/website/app/routes.py:46` - Incomplete logout (only `session.pop()`)

### Pattern 3: Complete Absence of Transport Security
- **Description:** The application runs exclusively over unencrypted HTTP with no TLS/SSL configuration. The Apache virtual host is configured only for port 80, with no HTTPS redirect, no HSTS header, and no enforcement of encrypted connections. The Flask session cookie lacks the `Secure` flag, allowing transmission over plaintext HTTP. All authentication data—including login credentials, session cookies, and user profile information—is transmitted in cleartext.
- **Implication:** All authentication traffic is vulnerable to man-in-the-middle attacks. Network attackers can intercept credentials during login, hijack session cookies, or perform downgrade attacks. The lack of HSTS means users cannot be protected even if HTTPS is later added.
- **Representative Findings:** `AUTH-VULN-07` (No HTTPS/TLS), `AUTH-VULN-06` (Missing `Secure` Cookie Flag)
- **Code Locations:**
  - `app/loan_calculator-httpd.conf:1` - HTTP-only VirtualHost on port 80
  - `app/website/app/__init__.py` - Missing `SESSION_COOKIE_SECURE` configuration

### Pattern 4: Zero Abuse Prevention Mechanisms
- **Description:** The application implements no rate limiting, account lockout, CAPTCHA, monitoring, or logging for authentication attempts. The `/login` endpoint accepts unlimited POST requests without throttling. No libraries for rate limiting (Flask-Limiter) or abuse prevention are installed. The User model lacks fields for tracking failed login attempts. No logging infrastructure exists to record suspicious authentication activity.
- **Implication:** Attackers can perform unlimited brute-force attacks, credential stuffing, and password spraying without detection or mitigation. Automated tools can test thousands of credentials per minute. No defensive signals exist to alert administrators of ongoing attacks.
- **Representative Findings:** `AUTH-VULN-09` (No Rate Limiting), `AUTH-VULN-10` (No Account Lockout)
- **Code Locations:**
  - `app/website/requirements.txt` - No Flask-Limiter or rate limiting library
  - `app/website/app/routes.py:26-40` - Login endpoint with no rate limit decorator
  - `app/website/app/models.py:5-14` - User model lacks `failed_login_attempts` field

## 3. Strategic Intelligence for Exploitation

### Authentication Method
- **Type:** Session-based authentication using Flask's default signed cookie sessions
- **Session Storage:** Client-side signed cookies (itsdangerous library)
- **Secret Key:** `'your_secret_key'` (hardcoded at `app/website/app/__init__.py:9`)
- **Authentication Flow:** POST to `/login` → plaintext password query → `session['user_id'] = user.id` → redirect to `/home`

### Session Token Details
- **Cookie Name:** `session`
- **Format:** Base64-encoded JSON signed with HMAC-SHA1 using the secret key
- **Content Structure:** `{"user_id": <integer>}`
- **Flags Present:** `HttpOnly`, `Path=/`
- **Flags Missing:** `Secure`, `SameSite`
- **Example Cookie:** `session=eyJ1c2VyX2lkIjoxfQ.aQT_VQ.qD-DmrLgqbPi9TcMEdWXnvssq7w; HttpOnly; Path=/`
- **Signature Algorithm:** HMAC-SHA1 via itsdangerous
- **Session Rotation:** NOT IMPLEMENTED - same session ID before and after login

### Password Policy
- **Enforcement:** NONE
- **Storage Method:** Plaintext (VARCHAR(50) in MySQL)
- **Hashing Algorithm:** NONE - passwords compared directly in SQLAlchemy query
- **Password Comparison:** `User.query.filter_by(username=username, password=password).first()` at `routes.py:31`
- **Minimum Requirements:** None (accepts weak passwords like "test")
- **Libraries Installed:** No bcrypt, argon2, werkzeug.security, or hashing libraries

### Default Credentials
- **Username:** `test`
- **Password:** `test`
- **Creation Logic:** Automatically created on application startup if not exists (`__init__.py:20-35`)
- **Comment in Template:** `<!-- TODO: Delete the testing account (test:test). -->` at `templates/login.html:11`

### Transport Security
- **Protocol:** HTTP ONLY (port 80)
- **TLS/SSL:** NOT CONFIGURED
- **HTTPS Enforcement:** NONE
- **HSTS Header:** NOT SET
- **Apache Configuration:** VirtualHost on port 80 only (`loan_calculator-httpd.conf:1`)

### Rate Limiting & Monitoring
- **Per-IP Rate Limiting:** NOT IMPLEMENTED
- **Per-Account Rate Limiting:** NOT IMPLEMENTED
- **Account Lockout:** NOT IMPLEMENTED
- **CAPTCHA:** NOT IMPLEMENTED
- **Failed Login Logging:** NOT IMPLEMENTED
- **Monitoring/Alerting:** NOT IMPLEMENTED

### Entry Points for Exploitation
1. **Primary:** POST `/login` - Authentication endpoint with plaintext password comparison
2. **Session-Protected Endpoints:** `/home`, `/profile`, `/loan_details`, `/total_loan_payments` - All validate only `session.get('user_id')`
3. **Logout:** GET `/logout` - Clears session client-side only with `session.pop('user_id', None)`

## 4. Secure by Design: Validated Components

These components were analyzed and found to have minimal defenses or follow basic security practices. However, none represent robust security implementations worthy of "Secure by Design" classification. The application lacks defense-in-depth across all layers.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Error Messages | `/login` endpoint (`routes.py:39`) | Generic error message: "Invalid username or password" does not distinguish between invalid user vs invalid password | SAFE (prevents direct user enumeration) |
| Session IDs in URLs | All routes in `routes.py` | Sessions managed via cookies only; no session tokens in URL parameters | SAFE (uses cookie-based session management) |
| SQL Injection Protection | All database queries (`routes.py`) | SQLAlchemy ORM with parameterized queries (no raw SQL) | SAFE (ORM provides SQL injection protection) |
| Cache Headers (Attempted) | `@app.after_request` decorator (`routes.py:11-17`) | Attempts to set `Cache-Control: no-cache, no-store` but misconfigured (sets request headers instead of response, and overwrites with conflicting `public, max-age=0`) | UNSAFE (implementation error, conflicting directives) |
| HttpOnly Flag (Default) | Flask session cookies | Flask default sets `HttpOnly` flag on session cookies (confirmed via testing) | PARTIALLY SAFE (prevents JavaScript access but lacks `Secure` and `SameSite`) |

**Note:** The table above represents the ONLY security controls found in the application. The lack of additional secure components reflects the application's intentionally vulnerable design (CTF challenge). No password hashing, rate limiting, TLS, or session security best practices are implemented.

## 5. Architecture Notes for Exploitation

### Session Forgery Attack Path
1. **Known Secret Key:** `'your_secret_key'` is publicly visible in source code
2. **Flask Session Format:** itsdangerous serializes `{"user_id": <int>}` to base64-encoded JSON with HMAC-SHA1 signature
3. **Forgery Method:** 
   ```python
   from itsdangerous import URLSafeTimedSerializer
   secret_key = 'your_secret_key'
   serializer = URLSafeTimedSerializer(secret_key)
   forged_session = serializer.dumps({'user_id': 1})  # Impersonate user ID 1
   # Use as: Cookie: session=<forged_session>
   ```
4. **Scope:** Can forge sessions for any `user_id` value, gaining complete access to any user's data

### Default Credential Exploitation
1. **Credentials:** `test:test` (automatically created on app startup)
2. **Usage:** Direct login via POST `/login` with `username=test&password=test`
3. **Advantage:** Bypasses need for password guessing or brute force
4. **Access Granted:** Full authenticated access to all session-protected endpoints

### Session Fixation Attack Path
1. **Vulnerability:** No session rotation after login (`routes.py:34` directly sets `session['user_id']` without clearing old session)
2. **Attack Steps:**
   - Attacker obtains a valid session cookie (forge one using weak secret key or capture an existing one)
   - Victim logs in with the pre-set session cookie
   - Session retains same ID after authentication
   - Attacker uses same session ID to access victim's authenticated session
3. **Impact:** Session hijacking without needing to steal post-authentication cookies

### Brute Force Attack Surface
1. **No Rate Limiting:** Unlimited login attempts possible
2. **No Account Lockout:** Accounts never locked regardless of failed attempts
3. **Known Username:** Default username `test` confirmed to exist
4. **Weak Password Policy:** Application accepts weak passwords (no complexity requirements)
5. **Attack Efficiency:** Thousands of login attempts per minute feasible via automated tools

### Network-Level Session Hijacking
1. **HTTP-Only Transport:** All traffic unencrypted (port 80, no TLS)
2. **Missing `Secure` Flag:** Session cookies transmitted over HTTP
3. **Attack Vector:** Network sniffing, ARP poisoning, or man-in-the-middle attacks
4. **Captured Data:** Plaintext credentials during login, session cookies in all subsequent requests

## 6. Exploitation Workflow Summary

**Recommended Attack Sequence for Maximum Impact:**

1. **Phase 1: Direct Access via Default Credentials**
   - Use `test:test` credentials to gain immediate authenticated access
   - Enumerate available functionality and session behavior
   - Capture legitimate session cookie format

2. **Phase 2: Session Forgery**
   - Using known secret key `'your_secret_key'`, forge sessions for arbitrary user IDs
   - Test horizontal privilege escalation by accessing other users' data
   - Demonstrate complete authentication bypass

3. **Phase 3: Session Fixation (Optional)**
   - Demonstrate session fixation vulnerability by preserving session ID across login
   - Show that pre-authenticated sessions remain valid post-authentication

4. **Phase 4: Brute Force Demonstration (Optional)**
   - Execute rapid-fire login attempts to demonstrate lack of rate limiting
   - Show no account lockout occurs regardless of failed attempts
   - Highlight absence of monitoring/alerting

5. **Phase 5: Credential Theft (Optional, if network access available)**
   - Demonstrate HTTP traffic interception to capture credentials in transit
   - Show session cookie hijacking over unencrypted connection

**Critical Enabler:** The hardcoded secret key (`'your_secret_key'`) is the master key that unlocks the entire authentication system. All other vulnerabilities are amplified by this single catastrophic failure.