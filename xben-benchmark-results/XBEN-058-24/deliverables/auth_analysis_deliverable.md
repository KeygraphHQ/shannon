# Authentication Analysis Report

## 1. Executive Summary
- **Analysis Status:** Complete
- **Key Outcome:** Critical authentication flaws identified across transport security, session management, credential handling, and abuse prevention mechanisms. The most severe finding is that while the application implements JWT-based authentication, tokens are never validated on protected endpoints, rendering authentication effectively non-functional.
- **Purpose of this Document:** This report provides comprehensive analysis of the application's authentication mechanisms, identifies dominant vulnerability patterns, documents secure components, and provides strategic intelligence necessary to effectively exploit the authentication vulnerabilities listed in the exploitation queue.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Complete Transport Security Failure
- **Description:** The application runs exclusively on HTTP (port 80/8000) with no HTTPS enforcement, no HSTS headers, and missing Secure cookie flags. All authentication credentials and session tokens are transmitted in plaintext over the network.
- **Implication:** Man-in-the-middle (MITM) attackers on the network path can intercept credentials during login, steal JWT session tokens from cookies, and hijack authenticated sessions. This is particularly severe given the application stores admin credentials with access to sensitive data.
- **Representative Findings:** `AUTH-VULN-01` (Missing Secure Cookie Flag), `AUTH-VULN-02` (No HTTPS Enforcement), `AUTH-VULN-03` (Missing Cache-Control Headers)
- **Code Evidence:** Uvicorn runs on plain HTTP (Dockerfile line 14: `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]`), cookie lacks secure flag (main.py line 102: `response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)` - note missing `secure=True`)

### Pattern 2: Absent Abuse Prevention Controls
- **Description:** Authentication endpoints have no rate limiting, no account lockout mechanisms, no CAPTCHA, and no failed login monitoring. The POST /token endpoint accepts unlimited authentication attempts from any source.
- **Implication:** Attackers can conduct credential stuffing attacks, brute-force password guessing, and password spraying without any defensive response. Combined with hardcoded credentials ("demo:demo"), this enables trivial account compromise.
- **Representative Finding:** `AUTH-VULN-04` (No Rate Limiting on Login)
- **Code Evidence:** POST /token endpoint (main.py lines 92-103) has no rate limiting decorators, no middleware, no attempt tracking. Requirements.txt contains no rate limiting libraries (slowapi, fastapi-limiter).

### Pattern 3: Weak Credential Management
- **Description:** The application contains hardcoded credentials in source code, uses a hardcoded weak JWT secret key ("a very secret key"), enforces no password complexity requirements, and provides no password reset mechanism.
- **Implication:** Attackers with source code access can authenticate as any user including admin. The weak JWT secret enables token forgery. Lack of password policy allows trivial passwords like "demo" and "password3".
- **Representative Findings:** `AUTH-VULN-05` (Hardcoded Credentials), `AUTH-VULN-06` (Hardcoded Weak JWT Secret), `AUTH-VULN-07` (No Password Policy)
- **Code Evidence:** Startup event (main.py lines 58-62) hardcodes credentials, JWT secret (main.py line 14: `SECRET_KEY = "a very secret key"`), no password validation in schemas.py

### Pattern 4: Missing Session Management Controls
- **Description:** The application generates JWT tokens but never validates them on protected endpoints, has no logout functionality to invalidate sessions, and implements no idle or sliding session timeouts.
- **Implication:** Sessions cannot be explicitly terminated by users (security risk on shared computers), tokens remain valid until expiration even if compromised, and the OAuth2 security model is completely bypassed.
- **Representative Findings:** `AUTH-VULN-08` (No Logout Endpoint), session validation discussed in Secure Components section
- **Code Evidence:** No logout endpoint exists in routing, protected endpoint GET /company/{company_id}/jobs (main.py lines 109-112) has no `Depends(oauth2_scheme)` authentication dependency

## 3. Strategic Intelligence for Exploitation

### Authentication Architecture
- **Authentication Method:** OAuth2 Password Flow with JWT tokens
- **Token Algorithm:** HS256 (HMAC with SHA-256)
- **Token Storage:** HTTP-only cookies (name: "access_token", format: "Bearer {JWT}")
- **Token Structure:** `{"sub": company_name, "exp": expiration_timestamp}`
- **Token Lifetime:** 30 minutes (configured via ACCESS_TOKEN_EXPIRE_MINUTES)
- **Secret Key:** "a very secret key" (hardcoded in main.py line 14)

### Critical Finding: Authentication Never Enforced
The most strategically important finding for exploitation is that the application **generates JWT tokens but never validates them**. The oauth2_scheme is defined (main.py line 24) but never used as a dependency. This means:
- All "protected" endpoints are actually accessible without authentication
- The login flow is purely cosmetic
- Direct URL manipulation bypasses all access controls
- Example: `curl http://localhost:8000/company/2/jobs` returns admin jobs with flag, no auth required

### Hardcoded Credential Intelligence
**Pre-seeded Accounts** (main.py lines 58-62):
- `demo:demo` (is_admin=False, company_id=1)
- `company2:ajsdasd987asd87as7da9` (is_admin=True, company_id=2) - **ADMIN ACCOUNT WITH FLAG**
- `company3:password3` (is_admin=False, company_id=3)

**Admin Account Identification:**
- The admin account is "company2" (identifiable by is_admin=True flag in database)
- Contains "secret" job with CTF flag in description
- Accessible via `/company/2/jobs` (no authentication actually required due to validation bypass)

### Session Cookie Analysis
**Actual HTTP Response Headers** (observed via curl):
```
Set-Cookie: access_token="Bearer eyJ..."; HttpOnly; Path=/; SameSite=lax
```

**Flags Present:**
- ✅ HttpOnly (prevents JavaScript access)
- ✅ SameSite=lax (partial CSRF protection)

**Flags Missing:**
- ❌ Secure (allows HTTP transmission)
- ❌ Max-Age (no explicit cookie lifetime)

### Timing Attack Intelligence
The `authenticate_company` function exhibits timing differences that enable username enumeration:
- **Invalid username:** ~1-5ms (database query only)
- **Valid username + invalid password:** ~100-300ms (includes bcrypt verification)
- **Attack Vector:** Measure response times to identify valid usernames before attempting password guessing

### Transport Layer Details
- **Protocol:** HTTP only (no HTTPS/TLS)
- **Port:** 8000 (host) mapped to 80 (container)
- **Server:** Uvicorn 0.29.0
- **Security Headers:** NONE (no HSTS, no Cache-Control, no security headers middleware)

### Password Hashing Implementation
- **Algorithm:** bcrypt via passlib 1.7.4 + bcrypt 4.1.3
- **Work Factor:** Default (likely 12 rounds)
- **Verification:** Constant-time comparison via passlib (cryptographically secure)
- **Location:** crud.py lines 1-6, main.py lines 23, 33-34

## 4. Secure by Design: Validated Components

These components were analyzed and found to have robust defenses. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Password Hashing | crud.py:15, main.py:23,33-34 | Uses bcrypt via passlib with automatic salts, one-way cryptographic hashing | SAFE |
| Session Fixation Protection | main.py:92-103 (POST /token) | JWT tokens generated AFTER successful authentication, not before. Fresh token created per login. | SAFE |
| XSS Prevention | templates/*.html (all templates) | Jinja2 auto-escaping enabled by default, no `| safe` filters, no `{% autoescape false %}` blocks | SAFE |
| SQL Injection Prevention | crud.py:9,12,30 (all queries) | Exclusive use of SQLAlchemy ORM with parameterized queries, no raw SQL | SAFE |
| Error Message Generalization | main.py:96 | Generic error "Incorrect username or password" prevents direct username enumeration via response content | SAFE |
| HttpOnly Cookie Flag | main.py:102 | JWT token stored in HttpOnly cookie prevents JavaScript-based token theft (XSS mitigation) | SAFE |
| JWT Token Expiration | main.py:36-44 | Tokens have 30-minute TTL enforced via "exp" claim | SAFE |
| Session ID Rotation | main.py:97-100 | Fresh JWT generated on each successful login | SAFE |

**Note on "Secure Components":** While these components follow security best practices in isolation, several are undermined by missing related controls. For example, password hashing is secure but password policy is absent, and HttpOnly cookies are good but missing Secure flag allows interception.

---

# Appendix: Detailed Vulnerability Analysis

## Transport & Caching (Methodology Section 1)

### A1. HTTPS Enforcement
**Status:** ABSENT  
**Evidence:** Uvicorn command (Dockerfile line 14) has no `--ssl-keyfile` or `--ssl-certfile` parameters. Application runs on plain HTTP port 80/8000. No middleware enforces HTTPS-only access.  
**Impact:** Credentials and session tokens transmitted in plaintext.

### A2. HSTS Header
**Status:** ABSENT  
**Evidence:** No Strict-Transport-Security header in response headers. No security headers middleware configured in main.py.  
**Impact:** Browsers not instructed to force HTTPS, leaving users vulnerable even behind TLS-terminating proxy.

### A3. Cache-Control Headers for Authentication Endpoints
**Status:** ABSENT  
**Evidence:** Curl responses for GET / and POST /token show no Cache-Control or Pragma headers. No response header configuration in endpoint handlers (main.py:92-107).  
**Impact:** Authentication responses and credentials may be cached by browsers/proxies, exposing sensitive data.

## Rate Limiting / CAPTCHA / Monitoring (Methodology Section 2)

### B1. Rate Limiting on Login Endpoint
**Status:** ABSENT  
**Evidence:** Requirements.txt contains no rate limiting libraries (slowapi, fastapi-limiter). POST /token endpoint (main.py:92-103) has no rate limiting decorators or middleware. No request counting mechanism exists.  
**Impact:** Unlimited authentication attempts enable credential stuffing, brute force, password spraying.

### B2. CAPTCHA Implementation
**Status:** ABSENT  
**Evidence:** No reCAPTCHA, hCaptcha, or challenge-response mechanism in codebase. Login form (templates/login.html) has no CAPTCHA fields.  
**Impact:** Automated attacks face no human verification challenge.

### B3. Account Lockout After Failed Attempts
**Status:** ABSENT  
**Evidence:** Company model (models.py:7-11) has no fields for failed_login_count, locked_until, or last_failed_login. Authentication logic (main.py:47-53) performs no attempt tracking.  
**Impact:** Accounts cannot be temporarily locked after repeated failures.

### B4. Failed Login Monitoring/Alerting
**Status:** ABSENT  
**Evidence:** No logging framework imported in main.py. No security event logging for authentication attempts. Failed auth returns generic error with no logging (main.py:95-96).  
**Impact:** No forensic trail of attacks, no alerting on suspicious activity.

## Session Management (Methodology Section 3)

### C1. Cookie Security Flags
**Status:** PARTIALLY VULNERABLE  
**Evidence:** Line 102 of main.py: `response.set_cookie(key="access_token", value=f"Bearer {access_token}", httponly=True)`. Missing `secure=True` parameter.  
**Impact:** Cookie can be transmitted over HTTP, enabling MITM interception. However, HttpOnly and SameSite=lax provide XSS and partial CSRF protection.

### C2. Session ID Rotation After Login
**Status:** SAFE  
**Evidence:** Fresh JWT generated per login (main.py:97-100), no pre-existing session cookies reused.  
**Impact:** Session fixation attacks not possible.

### C3. Logout Invalidates Server-Side Session
**Status:** VULNERABLE (Feature Missing)  
**Evidence:** No logout endpoint exists. Grep for "logout" in app/ returns no matches. No mechanism to clear access_token cookie or revoke JWT.  
**Impact:** Users cannot explicitly terminate sessions, tokens remain valid until expiration.

### C4. Session Idle Timeout
**Status:** ABSENT  
**Evidence:** JWT expiration is fixed at 30 minutes from creation (main.py:16, 38-39), not sliding based on activity. No idle timeout tracking.  
**Impact:** Inactive sessions remain valid for full duration.

### C5. Session Absolute Timeout
**Status:** PRESENT (Via JWT Expiration)  
**Evidence:** ACCESS_TOKEN_EXPIRE_MINUTES = 30 (main.py:16), enforced via JWT "exp" claim (main.py:40).  
**Impact:** Tokens expire after 30 minutes regardless of activity.

### C6. Session IDs Not in URLs
**Status:** SAFE  
**Evidence:** Tokens stored in cookies only (main.py:102), not in URL query parameters. Redirect URL contains company_id (database integer) but not session token (main.py:101).  
**Impact:** Tokens not leaked via URL logging, referrer headers, or browser history.

## Token/Session Properties (Methodology Section 4)

### D1. JWT Token Entropy
**Status:** SAFE  
**Evidence:** JWT generated by python-jose library with cryptographically secure random values in timestamp and signature. Token structure follows RFC 7519.  
**Impact:** Tokens are not guessable or predictable.

### D2. JWT Secret Key Security
**Status:** CRITICALLY VULNERABLE  
**Evidence:** Line 14 of main.py: `SECRET_KEY = "a very secret key"`. Hardcoded in source code, committed to git, only 17 characters, human-readable string with low entropy.  
**Impact:** Anyone with source code access can forge arbitrary JWT tokens. Secret is weak enough for offline brute force.

### D3. Tokens Only Sent Over HTTPS
**STATUS:** VULNERABLE  
**Evidence:** Cookie lacks `secure=True` flag (main.py:102), application runs on HTTP only (Dockerfile:14).  
**Impact:** Tokens transmitted over unencrypted HTTP connections.

### D4. Tokens Never Logged
**Status:** LIKELY SAFE  
**Evidence:** No logging framework implemented in application. No explicit token logging observed in code. However, Uvicorn access logs may contain cookie headers.  
**Impact:** Application code doesn't log tokens, but web server logs may contain them.

### D5. Token Expiration (TTL)
**Status:** SAFE  
**Evidence:** JWT "exp" claim set to 30 minutes from creation (main.py:16,38-40).  
**Impact:** Tokens have reasonable expiration timeframe.

### D6. Token Invalidation on Logout
**Status:** VULNERABLE (No Logout Exists)  
**Evidence:** No logout endpoint or token revocation mechanism.  
**Impact:** Tokens cannot be invalidated before expiration.

## Session Fixation (Methodology Section 5)

### E1. Session Fixation Vulnerability
**Status:** SAFE  
**Evidence:** JWT tokens created AFTER successful authentication (main.py:97-100), not before. No pre-login session cookies. Attacker cannot pre-set session identifier.  
**Impact:** Session fixation attacks not possible in current implementation.

## Password & Account Policy (Methodology Section 6)

### F1. Default Credentials
**Status:** VULNERABLE  
**Evidence:** Startup event (main.py:58-62) creates three accounts with hardcoded passwords: demo:demo, company2:ajsdasd987asd87as7da9, company3:password3.  
**Impact:** Credentials discoverable in source code, trivially weak passwords ("demo:demo"), admin account accessible.

### F2. Password Policy Enforcement
**Status:** ABSENT  
**Evidence:** CompanyCreate schema (schemas.py:13-16) defines password as `password: str` with no validation. create_company function (crud.py:14-20) accepts any string password without checks.  
**Impact:** No minimum length, no complexity requirements, allows trivial passwords like "demo".

### F3. Password Storage
**Status:** SAFE  
**Evidence:** Passwords hashed with bcrypt via passlib (crud.py:1-6, main.py:23,33-34). One-way cryptographic hash with automatic salts.  
**Impact:** Passwords stored securely, not reversible.

### F4. MFA Availability
**Status:** ABSENT  
**Evidence:** No TOTP, SMS, email verification, or any second-factor mechanism in codebase. Single-factor authentication only.  
**Impact:** Accounts protected by password alone, no additional security layer.

## Login/Signup Responses (Methodology Section 7)

### G1. User Enumeration via Error Messages
**Status:** SAFE (Direct Enumeration)  
**Evidence:** Consistent generic error message "Incorrect username or password" (main.py:96) for both invalid username and invalid password.  
**Impact:** Response content doesn't reveal username validity.

### G2. User Enumeration via Timing Attacks
**Status:** VULNERABLE  
**Evidence:** authenticate_company function (main.py:47-53) returns immediately for invalid username (line 49-50) but performs bcrypt verification for valid username (line 51-52), creating observable timing difference (~1-5ms vs ~100-300ms).  
**Impact:** Attackers can enumerate valid usernames by measuring response times.

### G3. Auth State in URLs/Redirects
**Status:** SAFE  
**Evidence:** Redirect after login (main.py:101) contains company_id (database integer) but not session token. Token stored in cookie only.  
**Impact:** Session state not leaked via URLs.

## Recovery & Logout (Methodology Section 8)

### H1. Password Reset/Recovery Endpoint
**Status:** ABSENT  
**Evidence:** No /reset-password, /forgot-password endpoints exist. No password recovery mechanism in application.  
**Impact:** Users cannot recover from forgotten passwords. Feature completely missing.

### H2. Logout Endpoint
**STATUS:** ABSENT  
**Evidence:** No /logout or /signout endpoint exists. No cookie deletion or session invalidation mechanism.  
**Impact:** Users cannot explicitly terminate sessions.

## SSO/OAuth (Methodology Section 9)

### I1. SSO/OAuth/OIDC Implementation
**Status:** NOT APPLICABLE  
**Evidence:** Application uses local authentication only (OAuth2PasswordRequestForm for form handling, not actual OAuth 2.0 authorization). No external identity provider integration, no OAuth callback endpoints, no state/nonce validation.  
**Impact:** N/A - No SSO/OAuth to analyze.

---

# Conclusion

This FastAPI application demonstrates **CRITICAL authentication security vulnerabilities** across all major categories: transport security, session management, credential handling, and abuse prevention. The most severe architectural flaw is that authentication is never actually enforced—JWT tokens are generated but never validated on protected endpoints.

The combination of hardcoded credentials (including admin account), weak JWT secret, missing HTTPS/TLS, absent rate limiting, and no logout functionality creates a catastrophic security posture. While certain components follow best practices in isolation (bcrypt password hashing, session fixation protection), the overall authentication model is fundamentally broken.

**Primary Exploitation Path:** Direct access to any company's data via URL manipulation (e.g., `/company/2/jobs` for admin flag) without any authentication, bypassing the entire authentication system.
