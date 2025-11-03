# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** TWO high-confidence horizontal authorization vulnerabilities identified across 2 distinct endpoints. Both vulnerabilities enable complete bypass of access controls, allowing any authenticated user to access and modify any other user's private data, including admin's FLAG-containing draft. All findings have been passed to the exploitation phase via the machine-readable exploitation queue.  
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and architectural intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.  

**Vulnerability Summary:**
- **2 Horizontal IDOR Vulnerabilities** (CRITICAL): Missing ownership validation on draft access and modification
- **0 Vertical Escalation Vulnerabilities**: No admin-only endpoints exist; admin role is never enforced
- **0 Context/Workflow Vulnerabilities**: Application has no multi-step workflows

**Critical Finding:** The application completely lacks authorization controls. While authentication is implemented via Flask-Login, NO authorization checks verify that authenticated users can only access their own resources. The admin role exists in the database but is never checked, making admin and regular user accounts functionally identical in terms of permissions.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Missing Ownership Validation (Horizontal IDOR)
- **Description:** Multiple endpoints accept resource identifiers (draft IDs, usernames) as URL parameters without verifying the requesting user owns or has access to those resources. The application trusts that authenticated users will only request their own data, but enforces no server-side validation.
- **Implication:** Any authenticated user can access, view, and modify any other user's private drafts by manipulating URL parameters. This includes the admin user's draft containing the CTF flag.
- **Representative Vulnerabilities:** AUTHZ-VULN-01, AUTHZ-VULN-02
- **Root Cause:** Complete absence of ownership checks (`draft.author_id == current_user.id` or `username == current_user.username`) before database operations
- **Attack Complexity:** TRIVIAL - requires only changing integers or strings in URL paths

### Pattern 2: Authentication ≠ Authorization (Architectural Flaw)
- **Description:** The application confuses authentication (verifying identity) with authorization (verifying permissions). The `@login_required` decorator is applied to all protected endpoints, but this only confirms "someone is logged in," not "this person should access this resource."
- **Implication:** Once past the login screen, all users have equivalent access rights. The security boundary stops at authentication and does not extend to resource-level access control.
- **Representative Context:** ALL authenticated endpoints rely solely on `@login_required` with no additional authorization logic
- **Root Cause:** Architectural decision to implement authentication without implementing authorization
- **Missing Components:**
  - No ownership validation middleware
  - No role-based access control (RBAC) enforcement
  - No attribute-based access control (ABAC)
  - No permission checking framework

### Pattern 3: Role Field Without Enforcement (Decorative Security)
- **Description:** The User model includes a `role` field (values: 'user' or 'admin'), but this field is never checked anywhere in the application code. It exists in the database schema but has zero security impact.
- **Implication:** Admin and regular users have identical permissions despite having different role values. The role field provides a false sense of security without any actual protection.
- **Representative Context:** User model defines role at models.py:11, admin role assigned at app.py:34, but `grep -r "current_user.role" app/` returns zero matches
- **Root Cause:** Role field added to data model but never integrated into authorization logic
- **Missing Components:**
  - No `@admin_required` decorator
  - No `@role_required('admin')` decorator
  - No inline role checks in route handlers
  - No admin-only endpoints that would require role checks

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture
- **Session Implementation:** Flask-Login with client-side signed cookies
- **Session Cookie Format:** Signed JSON containing `_user_id` and `_fresh` flags
- **Secret Key:** `'KJQBYU#*DB&(@#OUIPBN:'` (hardcoded at app.py:11)
- **Cookie Flags:**
  - HttpOnly: True (XSS-protected)
  - Secure: False (transmitted over HTTP)
  - SameSite: None (no CSRF protection)
- **Session Lifetime:** 31 days (Flask default)
- **User Loader:** Queries User table by ID from cookie (app.py:22-25)
- **Critical Finding:** While session forgery is possible due to hardcoded SECRET_KEY, it's unnecessary for exploitation since IDOR vulnerabilities provide direct access without needing admin privileges

### Role/Permission Model
- **Roles Identified:** 
  - `anon` (unauthenticated): Access to /login, /register, /
  - `user` (authenticated): Default role for all registered users
  - `admin` (authenticated): Assigned only to hardcoded admin account
- **Permission Hierarchy:** FLAT - All authenticated users have identical permissions
- **Role Enforcement Points:** NONE - role field is never checked
- **Critical Finding:** The role field exists but is purely decorative. Admin accounts have no additional privileges over regular user accounts. There are no admin-only endpoints, no role-based route restrictions, and no conditional logic based on user role.

### Resource Access Patterns
- **Resource Identification:** 
  - Drafts identified by integer `draft_id` (sequential, predictable)
  - Users identified by string `username` (enumerable)
- **Access Pattern:** Direct object reference via URL parameters
- **Query Pattern:** `Draft.query.get_or_404(draft_id)` and `User.query.filter_by(username=username)`
- **Critical Finding:** All database queries execute unconditionally after authentication, with no authorization filters. Queries do NOT include `filter_by(author_id=current_user.id)` or equivalent ownership constraints. The application retrieves the requested object and returns it without verification.

### Flag Storage & Access
- **Flag Location:** Database table `draft`, column `content`, row with `id=1`
- **Flag Value:** Set from environment variable `FLAG` or default fake flag (app.py:52)
- **Flag Owner:** Admin user (user.id=1, username='admin')
- **Admin Draft Creation:** Occurs on first request via `@app.before_request` hook (app.py:27-43)
- **Admin Draft Metadata:**
  - Title: 'admin_draft'
  - Content: FLAG value
  - Author: admin (user_id=1)
  - Draft ID: 1 (first draft created)
- **Critical Finding:** The flag is directly accessible via `/edit_draft/1` endpoint by any authenticated user. No special permissions required. Flag is also visible via `/admin/drafts` endpoint.

### Attack Surface Topology
```
AUTHENTICATION BOUNDARY (Enforced)
├─ Public Endpoints (No auth required)
│  ├─ GET/POST /register
│  ├─ GET/POST /login
│  └─ GET/POST /
│
└─ Authenticated Endpoints (@login_required)
   ├─ SECURE ENDPOINTS (Operate only on current_user data)
   │  ├─ GET /dashboard → redirects to /<current_user.username>/drafts
   │  ├─ GET/POST /create_draft → author=current_user (hardcoded)
   │  └─ GET /logout → operates on current session only
   │
   └─ VULNERABLE ENDPOINTS (Accept resource IDs without authorization)
      ├─ GET/POST /edit_draft/<draft_id> ← IDOR: Missing ownership check
      └─ GET /<username>/drafts ← IDOR: Missing access control

AUTHORIZATION BOUNDARY (NOT IMPLEMENTED)
└─ ❌ No checks verifying resource ownership
└─ ❌ No checks verifying role-based permissions
└─ ❌ No attribute-based access control
```

### Exploitation Workflow Recommendations
1. **Phase 1 - Reconnaissance:**
   - Register test account (open registration, no email verification)
   - Login to obtain session cookie
   - Access `/admin/drafts` to enumerate admin's draft list and confirm draft ID containing flag
   
2. **Phase 2 - Direct Access (Primary Vector):**
   - Navigate to `/edit_draft/1` (admin's draft)
   - Read flag from content textarea or page source
   - Alternative: Use curl/Burp to GET `/edit_draft/1` and parse response
   
3. **Phase 3 - Verification (Optional):**
   - Confirm draft enumeration works (try `/edit_draft/2`, `/edit_draft/3`)
   - Confirm username enumeration works (try `/user/drafts`, `/admin/drafts`)
   - Test modification capability (POST to `/edit_draft/1` with new content)

4. **Phase 4 - Alternative Vectors (If needed):**
   - Session forgery using hardcoded SECRET_KEY (unnecessary but demonstrates severity)
   - Direct database access (file at `/app/instance/site.db` with 644 permissions)
   - Container compromise (running as root with known credentials)

### Defensive Measures Encountered (What Little Exists)
- **Authentication:** Flask-Login session management provides identity verification
- **SQL Injection Protection:** SQLAlchemy ORM with parameterized queries prevents SQL injection
- **XSS Protection:** Jinja2 auto-escaping prevents stored/reflected XSS
- **Form Validation:** WTForms provides server-side input validation
- **Password Security:** Werkzeug scrypt hashing protects passwords at rest

**What's NOT Present:**
- ❌ No ownership validation on resource access
- ❌ No role-based access control enforcement
- ❌ No CSRF protection (explicitly disabled)
- ❌ No rate limiting
- ❌ No security headers
- ❌ No audit logging
- ❌ No intrusion detection
- ❌ No WAF or request filtering

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have robust, properly-placed guards OR operate exclusively on current_user data making them immune to authorization bypass. They are **low-priority** for exploitation testing.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| `POST /register` | None (public) | Public endpoint by design, no auth/authz needed | SAFE |
| `GET/POST /login` | None (public) | Public endpoint by design, no auth/authz needed | SAFE |
| `GET /dashboard` | app.py:91 @login_required | Redirects using `current_user.username` only - no user-controlled parameters, cannot access other users' data | SAFE |
| `GET/POST /create_draft` | app.py:96 @login_required | Sets `author=current_user` at line 100 - hardcoded ownership assignment, no parameter manipulation possible | SAFE |
| `GET /logout` | app.py:129 @login_required | Operates only on current session via `logout_user()` - no user-controlled parameters, cannot affect other users | SAFE |

**Why These Are Secure:**
- **No User-Controlled Resource Identifiers:** None of these endpoints accept draft IDs or usernames as parameters
- **Hardcoded Ownership:** Operations that create or access resources use `current_user` from Flask-Login session, not user input
- **No Cross-User Operations:** These endpoints cannot be manipulated to access or modify other users' data
- **Proper Scoping:** All database queries implicitly filter by current user through hardcoded session references

**Key Security Pattern:**
The secure endpoints follow this pattern:
```python
@app.route('/secure_endpoint')
@login_required
def secure_function():
    # Operates ONLY on current_user - no parameters
    data = Resource.query.filter_by(owner=current_user)  # Correct
    # OR creates resources with hardcoded ownership
    new_resource = Resource(owner=current_user)  # Correct
```

Contrast with vulnerable pattern:
```python
@app.route('/vulnerable/<resource_id>')
@login_required
def vulnerable_function(resource_id):
    # Accepts user-controlled ID but doesn't verify ownership
    resource = Resource.query.get(resource_id)  # Missing: check ownership
    # Proceeds to expose or modify resource without authorization
```

## 5. Analysis Constraints and Blind Spots

### Analysis Completed Successfully
✅ **All endpoints from reconnaissance deliverable analyzed:**
- Section 8.1 (Horizontal): Both endpoints fully analyzed
- Section 8.2 (Vertical): Confirmed no admin-only endpoints exist
- Section 8.3 (Context): Confirmed no multi-step workflows exist

✅ **Authorization flow traced from entry to side effect for all vulnerable paths**

✅ **Secure endpoints documented with evidence of proper protection**

### No Significant Blind Spots Identified
This is a simple, monolithic Flask application with:
- ✅ Single codebase (app.py) - fully analyzed
- ✅ No microservices or external authorization services
- ✅ No dynamic permission loading from database
- ✅ No plugin architecture or extensibility points
- ✅ No external authentication providers (LDAP, SAML, OAuth)
- ✅ No API gateway or reverse proxy with authorization logic
- ✅ No GraphQL endpoints with field-level authorization

### Assumptions Made (All Validated)
1. **Assumption:** Flask-Login's `@login_required` only validates authentication, not authorization
   - **Validated:** Confirmed by reading Flask-Login source behavior and application usage
   
2. **Assumption:** No middleware or decorators beyond `@login_required` perform authorization
   - **Validated:** No custom decorators defined, no additional middleware registered
   
3. **Assumption:** Database queries execute without additional ORM-level filtering
   - **Validated:** Queries use `get_or_404()` and `filter_by()` without ownership filters
   
4. **Assumption:** Role field is stored but never checked
   - **Validated:** `grep -r "current_user.role"` returns zero results across entire codebase

### Confidence in Findings
**HIGH CONFIDENCE** across all findings because:
- Simple, small codebase (135 lines of route logic)
- No complex permission systems or dynamic authorization
- Clear absence of authorization checks (can prove negative)
- Direct source code access enabled complete static analysis
- All code paths traced from HTTP request to database side effects

### Limitations That Don't Apply
These common pentest limitations do **NOT** apply to this assessment:
- ❌ No runtime-only permission checks (all logic is in source code)
- ❌ No blackbox analysis required (full source access)
- ❌ No compiled binaries without source
- ❌ No obfuscated or minified code
- ❌ No cloud-managed authorization services (AWS IAM, etc.)

---

## 6. Detailed Vulnerability Analysis

### AUTHZ-VULN-01: Missing Ownership Validation on Draft Editing

**Endpoint:** `POST /edit_draft/<int:draft_id>`  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-090-24/app/app.py`  
**Lines:** 106-119

**Vulnerability Type:** Horizontal Privilege Escalation (IDOR)

**Authorization Flow Analysis:**
```
Line 106: @app.route('/edit_draft/<int:draft_id>', methods=['GET', 'POST'])
Line 107: @login_required decorator applied
          ↓ AUTHENTICATION CHECK PASSES ✓
Line 109: draft = Draft.query.get_or_404(draft_id)
          ↓ DATABASE QUERY EXECUTES - retrieves ANY draft by ID
          ↓ ⚠️  NO OWNERSHIP VALIDATION HERE ⚠️
Line 110: form = DraftForm()
Line 111: if form.validate_on_submit():
Line 112:     draft.title = form.title.data
Line 113:     draft.content = form.content.data
              ↓ SIDE EFFECTS OCCUR (data modification)
Line 114:     db.session.commit()
              ↓ SIDE EFFECTS PERSIST (database write)
```

**Missing Guard:**
The code should include this check between lines 109 and 110:
```python
if draft.author_id != current_user.id:
    abort(403)  # Forbidden
```

**Security Impact:**
- Any authenticated user can modify ANY draft by changing the `draft_id` parameter
- Enables access to admin's draft (ID=1) containing FLAG
- Enables data tampering of other users' private content
- Enables reconnaissance via draft enumeration (try IDs 1, 2, 3...)

**Confidence:** HIGH
- Missing guard is clearly absent in source code
- Side effects (database writes) occur unconditionally after authentication
- No conditional logic or alternate code paths provide protection

**Externally Exploitable:** TRUE
- Accessible via HTTP from internet (http://localhost:5004)
- No internal network access required
- No VPN or direct server access needed

---

### AUTHZ-VULN-02: Missing Access Control on User Draft Lists

**Endpoint:** `GET /<username>/drafts`  
**File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-090-24/app/app.py`  
**Lines:** 121-126

**Vulnerability Type:** Horizontal Privilege Escalation (IDOR)

**Authorization Flow Analysis:**
```
Line 121: @app.route('/<username>/drafts')
Line 122: @login_required decorator applied
          ↓ AUTHENTICATION CHECK PASSES ✓
Line 124: user = User.query.filter_by(username=username).first_or_404()
          ↓ DATABASE QUERY EXECUTES - retrieves ANY user by username
          ↓ ⚠️  NO ACCESS CONTROL CHECK HERE ⚠️
Line 125: drafts = Draft.query.filter_by(author=user)
          ↓ SIDE EFFECT OCCURS (reads sensitive draft list)
Line 126: return render_template('view_drafts.html', drafts=drafts, user=user)
          ↓ SENSITIVE DATA EXPOSED to unauthorized user
```

**Missing Guard:**
The code should include this check between lines 123 and 124:
```python
if username != current_user.username and current_user.role != 'admin':
    abort(403)  # Forbidden
```

**Security Impact:**
- Any authenticated user can view ANY user's draft list by changing the `username` parameter
- Enables reconnaissance to discover admin user has draft titled "admin_draft"
- Reveals draft IDs for use in AUTHZ-VULN-01 exploitation
- Exposes draft titles (metadata leakage)

**Confidence:** HIGH
- Missing guard is clearly absent in source code
- Side effects (database reads of sensitive data) occur unconditionally
- No conditional logic provides protection

**Externally Exploitable:** TRUE
- Accessible via HTTP from internet (http://localhost:5004)
- No internal network access required
- No VPN or direct server access needed

---

## 7. Exploitation Priority & Chaining Opportunities

### Primary Exploitation Chain (FLAG Extraction)
1. **AUTHZ-VULN-02** → Reconnaissance: Access `/admin/drafts` to enumerate admin's drafts
2. **AUTHZ-VULN-01** → Exploitation: Access `/edit_draft/1` to read FLAG from admin's draft

### Alternative Direct Access (Faster)
- **AUTHZ-VULN-01 alone:** Directly access `/edit_draft/1` without reconnaissance (known admin draft ID)

### Exploitation Priority Ranking
1. **AUTHZ-VULN-01** (CRITICAL): Direct FLAG access, enables data modification
2. **AUTHZ-VULN-02** (HIGH): Enables reconnaissance, metadata leakage

### Why No Vertical Escalation Testing Needed
The application defines an admin role but never enforces it. Key findings:
- ✅ Admin role exists in database (User.role='admin')
- ✅ Admin account created on first request (app.py:33-35)
- ❌ No admin-only endpoints exist
- ❌ No role checks in any route handler
- ❌ No conditional logic based on `current_user.role`
- ❌ No functionality restricted to admin users

**Result:** Admin and regular users have **identical permissions**. Vertical privilege escalation is impossible because there are no elevated privileges to escalate to. The horizontal IDOR vulnerabilities already provide access to all data, making admin compromise unnecessary.

---

## Conclusion

The Blog Raider application presents a **critical authorization failure** with a security model that stops at authentication without implementing authorization. The two identified IDOR vulnerabilities enable complete bypass of access controls, allowing any authenticated user to access the FLAG and all other users' private data within minutes.

**Key Takeaway:** This application demonstrates the fundamental security principle: **Authentication ≠ Authorization**. Knowing WHO the user is does not answer WHAT they should be allowed to do. The application's complete lack of ownership validation and role enforcement creates a trivially exploitable attack surface.

**Recommended Exploitation Approach:**
1. Register test account
2. Login to obtain session
3. Navigate to `/edit_draft/1` 
4. Extract FLAG from response
5. Total time: < 5 minutes