# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** Two critical horizontal IDOR vulnerabilities were identified in the GraphQL API endpoint. The application lacks any authentication or authorization controls on its primary data access layer, allowing unauthenticated attackers to read and modify prescription data for any user. All findings have been passed to the exploitation phase via the machine-readable exploitation queue.  
- **Purpose of this Document:** This report provides the strategic context, vulnerability patterns, and technical intelligence necessary to effectively exploit the authorization vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.  

## 2. Dominant Vulnerability Patterns

### Pattern 1: Completely Unauthenticated GraphQL API (Horizontal IDOR)

- **Description:** The GraphQL endpoint `/api` is registered without the `@login_required` decorator (line 65 in `/app/app.py`), making it accessible to unauthenticated users. GraphQL resolvers accept user-controlled `userId` parameters without validating ownership or even requiring authentication.

- **Implication:** Any attacker on the internet can read all prescription data for all users and create malicious prescriptions under any user account by directly calling the GraphQL API with arbitrary `userId` values.

- **Representative Vulnerabilities:** AUTHZ-VULN-01 (getPrescriptions IDOR), AUTHZ-VULN-02 (addPrescription IDOR)

- **Attack Vector:**
  ```bash
  # Read admin's prescriptions (including FLAG in prescription #43)
  curl -X POST http://localhost:5003/api \
    -H "Content-Type: application/json" \
    -d '{"query":"{ getPrescriptions(userId: 1) { id prescriptionDetails flag } }"}'
  
  # Create prescription for admin user
  curl -X POST http://localhost:5003/api \
    -H "Content-Type: application/json" \
    -d '{"query":"mutation { addPrescription(userId: 1, prescriptionDetails: \"Malicious\") { prescription { id } } }"}'
  ```

- **Root Cause Analysis:**
  - **Missing Endpoint Decorator:** Line 65 uses `app.add_url_rule('/api', ...)` without `@login_required`
  - **Missing Resolver Authentication:** Lines 44-45 (getPrescriptions) and 54-58 (addPrescription) have no authentication checks
  - **Missing Ownership Validation:** Resolvers accept `user_id` parameter without verifying it matches `current_user.id`
  - **No Framework Defaults:** Flask-GraphQL does not enforce authentication by default

### Pattern 2: No Role-Based Access Control (No Vertical Escalation Possible)

- **Description:** The application implements only binary authentication (authenticated vs. unauthenticated). Despite having an "admin" account, there are no role fields, no admin-specific endpoints, and no privileged operations.

- **Implication:** There are no vertical privilege escalation opportunities because there are no elevated privileges to escalate to. The "admin" user has the same capabilities as regular users.

- **Evidence:**
  - User model (lines 19-22) has no `role` field
  - No `@admin_required` or `@role_required` decorators in codebase
  - All authenticated endpoints (`/logout`, `/add_prescription`, `/view_prescriptions`) are available to all logged-in users
  - No code performs role checks like `if current_user.role == 'admin'`

### Pattern 3: Authentication Exists Only on Template Endpoints (Not on API)

- **Description:** The application correctly applies `@login_required` to template-rendering routes (`/logout`, `/add_prescription`, `/view_prescriptions`) but completely omits it from the GraphQL API endpoint that actually performs data operations.

- **Implication:** The authentication layer is bypassed by directly calling the API rather than using the web interface. This is a fundamental architectural flaw where the presentation layer (templates) is protected but the data layer (GraphQL API) is not.

- **Attack Pattern:**
  - Web UI: Authentication required → But calls unauthenticated API internally
  - Direct API: No authentication → Full access to all data
  - Attacker chooses the path of least resistance: Direct API access

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture:

- **Session Mechanism:** Flask-Login with session cookies signed by itsdangerous library
- **Secret Key:** Hardcoded at line 9: `@#$%^R&GYUIUBJIU#@*DF&G*H`
- **User Loader:** Line 30-33, queries database by user_id from session
- **Session Storage:** Cookie named `session` contains `{'_user_id': '<user_id>'}`
- **Critical Finding:** Session management is IRRELEVANT for the primary attack vector. The GraphQL API requires no authentication whatsoever.

### Role/Permission Model:

- **Roles Defined:** None (despite having "admin" and "user" accounts)
- **Permission Checks:** None exist in codebase
- **Privilege Levels:** Only two states: anonymous (unauthenticated) and authenticated
- **Critical Finding:** No vertical escalation targets exist. Both admin and regular users have identical privileges. The only distinction is that they own different prescription records.

### Resource Access Patterns:

- **Protected Template Routes:** `/logout`, `/add_prescription`, `/view_prescriptions` all require `@login_required`
- **Unprotected API Route:** `/api` has NO authentication (line 65)
- **GraphQL Query Access:** `getPrescriptions(userId)` accepts ANY userId without validation (lines 44-45)
- **GraphQL Mutation Access:** `addPrescription(userId, prescriptionDetails)` accepts ANY userId without validation (lines 54-58)
- **Critical Finding:** The GraphQL resolvers trust user-supplied `userId` parameters completely. No ownership validation exists anywhere in the code.

### Database Schema:

- **User Table:** id (primary key), username, password (plaintext!)
- **Prescription Table:** id (primary key), user_id (foreign key), prescription_details, flag
- **Sensitive Data:** Prescription #43 for admin (user_id=1) contains the CTF flag (lines 130-131)
- **Critical Finding:** All prescription data is accessible via unauthenticated GraphQL queries by iterating userId values.

### GraphQL Schema Structure:

- **Endpoint:** POST `/api` (also GET for GraphiQL interface)
- **GraphiQL Enabled:** `graphiql=True` on line 65 allows interactive schema exploration
- **Introspection Enabled:** Default GraphQL behavior exposes full schema including `flag` field
- **Query Type:** `getPrescriptions(userId: Int!)` returns PrescriptionType array
- **Mutation Type:** `addPrescription(userId: Int!, prescriptionDetails: String)` creates prescription
- **PrescriptionType Fields:** id, userId, prescriptionDetails, flag
- **Critical Finding:** The `flag` field is discoverable via schema introspection and accessible without authentication.

### Network Accessibility:

- **Host:** localhost bound to 0.0.0.0 (all interfaces)
- **Port:** 5003
- **Protocol:** HTTP (no TLS)
- **Target URL:** http://localhost:5003/api
- **External Accessibility:** Yes, if localhost:5003 is accessible from the internet
- **Critical Finding:** All vulnerabilities are externally exploitable via standard HTTP requests.

## 4. Vectors Analyzed and Confirmed Secure

These authorization mechanisms were traced and confirmed to have robust, properly-placed guards. They are **low-priority** for further testing.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| `GET /logout` | `/app/app.py:86` | `@login_required` decorator properly applied; only terminates current user's session | SAFE |
| `GET /add_prescription` | `/app/app.py:95` | `@login_required` decorator properly applied; renders template with `current_user.id` | SAFE |
| `GET /view_prescriptions` | `/app/app.py:100` | `@login_required` decorator properly applied; renders template with `current_user.id` | SAFE |
| `GET /` | `/app/app.py:67-69` | Redirects to `/login`; no data access or side effects | SAFE |
| `GET/POST /login` | `/app/app.py:71-83` | Public endpoint by design; no authorization needed for login functionality | SAFE |

**Note:** While the template endpoints are properly protected, they render JavaScript that calls the vulnerable GraphQL API. The template endpoints themselves are not vulnerable to authorization bypass, but the API they call is completely unprotected.

## 5. Analysis Constraints and Blind Spots

### No Dynamic Permission System Found

The recon report suggested a potential dynamic permission system, but exhaustive code analysis revealed:
- No permission tables in database schema (only User and Prescription tables)
- No runtime permission loading from database
- No permission decorators or middleware
- The application uses only binary authentication (logged in vs. not logged in)

### Client-Side Code Issues Not Security Vulnerabilities

The templates reference a `${userID}` JavaScript variable that is never properly defined:
- Line 24 in `add_prescription.html`: Uses `${userID}` in GraphQL mutation
- Line 26 in `view_prescriptions.html`: Uses `${userID}` in GraphQL query
- These variables are never declared (no `const userID = ...`)
- This is a CODING ERROR (would throw ReferenceError) not a security vulnerability
- The server passes `userID={{ current_user.id }}` to templates but it's never rendered into JavaScript scope

**Why this doesn't matter:** Even if the client-side code were fixed and `userID` were properly set, attackers can bypass the entire frontend by directly calling the GraphQL API with curl/Postman.

### Session Forgery is Redundant

The hardcoded Flask secret key (`@#$%^R&GYUIUBJIU#@*DF&G*H` at line 9) allows session cookie forgery:
- An attacker can forge session cookies for any user_id using itsdangerous library
- This enables account takeover and impersonation
- **However:** This is completely redundant with the unauthenticated GraphQL API
- Attackers can access all data without forging any sessions
- Session forgery only matters for accessing the authenticated template endpoints, which provide no additional capabilities beyond what the unauthenticated API already exposes

### Session Fixation is Not Exploitable

The recon report noted "no session regeneration on login" (line 849), but practical testing revealed:
- Flask-Login creates new session cookies with authentication data on login
- Old/pre-set session cookies remain unauthenticated
- Session fixation attack fails because only the new session has authentication data
- Even if exploitable, the unauthenticated GraphQL API makes this irrelevant

### No Context/Workflow Vulnerabilities Exist

The application has no multi-step workflows:
- No onboarding processes
- No wizard-style forms
- No state machine implementations
- No prerequisite validation between steps
- All operations are atomic and independent
- Therefore, no workflow bypass vulnerabilities are possible

## 6. Vulnerability Summary

### Confirmed Vulnerabilities (In Queue):

| ID | Type | Endpoint | Impact | Confidence |
|----|------|----------|--------|------------|
| AUTHZ-VULN-01 | Horizontal IDOR | POST /api (getPrescriptions) | Unauthenticated read access to all users' prescription data including FLAG | High |
| AUTHZ-VULN-02 | Horizontal IDOR | POST /api (addPrescription) | Unauthenticated write access to create prescriptions for any user | High |

### Analyzed but Not Vulnerable:

- **Session Forgery:** Possible but redundant with GraphQL IDOR
- **Session Fixation:** Not exploitable in practice
- **Client-Side Variable Manipulation:** Not exploitable; code is broken and API is unauthenticated anyway
- **Vertical Privilege Escalation:** No privileged roles exist to escalate to
- **Context/Workflow Bypass:** No multi-step workflows exist

### Secure Components:

- Template-rendering endpoints properly use `@login_required`
- SQLAlchemy ORM prevents SQL injection through parameterized queries
- Protected routes correctly use `current_user.id` instead of accepting user parameters

## 7. Exploitation Guidance

### Primary Attack Path (Highest Priority):

1. **Target:** POST /api - GraphQL endpoint
2. **Method:** Direct HTTP requests (curl, Postman, custom scripts)
3. **No Prerequisites:** No authentication required
4. **Objective 1:** Extract admin's FLAG from prescription #43
   - Send query: `{ getPrescriptions(userId: 1) { id prescriptionDetails flag } }`
   - Iterate through prescriptions to find the one containing the flag
5. **Objective 2:** Demonstrate data poisoning
   - Send mutation: `mutation { addPrescription(userId: 1, prescriptionDetails: "Attacker-controlled data") { prescription { id } } }`

### Alternative Attack Paths (Lower Priority):

- **Session Forgery:** Use hardcoded secret key to forge admin session cookie
  - Only useful for accessing authenticated template endpoints
  - Does not provide additional data access beyond GraphQL IDOR
- **GraphiQL Interface Abuse:** Browse to http://localhost:5003/api in browser
  - Interactive GraphQL IDE for schema exploration
  - Useful for reconnaissance and manual testing
  - Exposes full schema including `flag` field through introspection

### Recommended Exploitation Workflow:

1. **Reconnaissance:** Access GraphiQL at http://localhost:5003/api to explore schema
2. **Enumerate Users:** Query prescriptions for userId values 1, 2, 3... to map users
3. **Extract FLAG:** Query `getPrescriptions(userId: 1)` and examine all prescriptions for flag
4. **Demonstrate Impact:** Create malicious prescriptions for admin using `addPrescription`
5. **Document Findings:** Show unauthenticated access to PHI and ability to poison data

## 8. Technical Deep-Dive: Critical Vulnerability Code Paths

### AUTHZ-VULN-01: Unauthenticated Read Access (getPrescriptions)

**File:** `/app/app.py`

**Vulnerable Code Path:**

1. **Entry Point (Line 65):**
   ```python
   app.add_url_rule('/api', view_func=GraphQLView.as_view('api', schema=schema, graphiql=True))
   ```
   - No `@login_required` decorator
   - Endpoint accepts unauthenticated requests

2. **Query Definition (Lines 41-42):**
   ```python
   class Query(graphene.ObjectType):
       get_prescriptions = graphene.List(PrescriptionType, user_id=graphene.Int(required=True))
   ```
   - Accepts `user_id` as a required integer parameter
   - No validation that user_id belongs to requester

3. **Resolver (Lines 44-45):**
   ```python
   def resolve_get_prescriptions(self, info, user_id):
       return Prescription.query.filter_by(user_id=user_id).all()
   ```
   - **MISSING:** Authentication check (`current_user.is_authenticated`)
   - **MISSING:** Ownership validation (`user_id == current_user.id`)
   - **SIDE EFFECT:** Database query returns all prescriptions for specified user_id
   - **IMPACT:** Exposes prescription_details and flag field

**Attack Flow:**
```
Unauthenticated HTTP Request
  ↓
POST /api (no auth check - line 65)
  ↓
GraphQL Query: getPrescriptions(userId: 1)
  ↓
resolve_get_prescriptions(info, user_id=1) (no auth check - line 44)
  ↓
Prescription.query.filter_by(user_id=1).all() (line 45)
  ↓
UNAUTHORIZED DATA EXPOSURE
```

### AUTHZ-VULN-02: Unauthenticated Write Access (addPrescription)

**File:** `/app/app.py`

**Vulnerable Code Path:**

1. **Entry Point (Line 65):**
   ```python
   app.add_url_rule('/api', view_func=GraphQLView.as_view('api', schema=schema, graphiql=True))
   ```
   - Same as above - no authentication

2. **Mutation Definition (Lines 47-52):**
   ```python
   class AddPrescription(graphene.Mutation):
       class Arguments:
           user_id = graphene.Int()
           prescription_details = graphene.String()
       prescription = graphene.Field(PrescriptionType)
   ```
   - Accepts `user_id` and `prescription_details` as parameters
   - No validation framework

3. **Mutation Handler (Lines 54-58):**
   ```python
   def mutate(self, info, user_id, prescription_details):
       new_prescription = Prescription(user_id=user_id, prescription_details=prescription_details)
       db.session.add(new_prescription)
       db.session.commit()
       return AddPrescription(prescription=new_prescription)
   ```
   - **MISSING:** Authentication check
   - **MISSING:** Ownership validation
   - **SIDE EFFECT:** Creates database record with attacker-controlled user_id
   - **IMPACT:** Data poisoning, integrity compromise

**Attack Flow:**
```
Unauthenticated HTTP Request
  ↓
POST /api (no auth check - line 65)
  ↓
GraphQL Mutation: addPrescription(userId: 1, prescriptionDetails: "...")
  ↓
mutate(info, user_id=1, prescription_details="...") (no auth check - line 54)
  ↓
Create Prescription(user_id=1, ...) (line 55)
  ↓
db.session.add() + commit() (lines 56-57)
  ↓
UNAUTHORIZED DATA MODIFICATION
```

## 9. Remediation Guidance (For Reference)

**NOTE:** As the Authorization Analysis Specialist, remediation is outside my scope. However, for context:

### Required Fixes:

1. **Add Authentication to GraphQL Endpoint:**
   ```python
   @login_required
   def graphql_view():
       return GraphQLView.as_view('api', schema=schema, graphiql=True)
   
   app.add_url_rule('/api', view_func=graphql_view, methods=['GET', 'POST'])
   ```

2. **Add Authorization to Resolvers:**
   ```python
   def resolve_get_prescriptions(self, info, user_id):
       if not current_user.is_authenticated:
           raise Exception("Authentication required")
       if user_id != current_user.id:
           raise Exception("Unauthorized: Cannot access other users' data")
       return Prescription.query.filter_by(user_id=user_id).all()
   ```

3. **Better Approach - Remove user_id Parameter:**
   ```python
   def resolve_get_prescriptions(self, info):
       if not current_user.is_authenticated:
           raise Exception("Authentication required")
       return Prescription.query.filter_by(user_id=current_user.id).all()
   ```

---

## 10. Conclusion

The MedGuard application has **critical authorization vulnerabilities** stemming from a completely unauthenticated GraphQL API. The two IDOR vulnerabilities identified allow any internet attacker to:

1. Read all prescription data for all users (including PHI and CTF flag)
2. Create malicious prescriptions under any user account

These vulnerabilities exist because:
- The `/api` endpoint lacks the `@login_required` decorator
- GraphQL resolvers accept user-controlled `userId` parameters without validation
- No ownership checks exist anywhere in the data access layer

All findings have been documented in the exploitation queue for the next phase. The vulnerabilities are high-confidence, externally exploitable, and represent complete authorization failure at the application's data layer.

**Analysis Status: COMPLETE**