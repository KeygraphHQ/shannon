# Injection Analysis Report (SQLi & Command Injection)

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** NO externally exploitable SQL injection or Command Injection vulnerabilities were identified. All SQL queries use properly implemented PDO prepared statements with parameter binding. No command execution functions are used in the codebase.
- **Architectural Finding:** While Path Traversal, Arbitrary File Write, and Unsafe Deserialization vulnerabilities exist in the internal service (port 4455), these are NOT externally exploitable from the public internet due to hardcoded POST parameters in the SSRF proxy that prevent forwarding attacker-controlled input to the vulnerable endpoints.
- **Purpose of this Document:** This report provides comprehensive evidence that the application's database layer is properly secured against SQL injection attacks, and that no command injection attack surface exists. It documents the architectural barriers that prevent exploitation of file-based vulnerabilities via the network boundary.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Consistent Use of PDO Prepared Statements

**Description:** Throughout the entire application codebase, all database operations use PDO (PHP Data Objects) prepared statements with positional parameter binding (`?` placeholders passed to the `execute()` method). This pattern is consistently applied across all CRUD operations without exception.

**Implication:** This defensive pattern effectively neutralizes SQL injection attacks by separating SQL code from data values. User input is never concatenated into SQL query strings, eliminating the primary SQL injection attack vector. Even when wildcards are concatenated with user input (as in the search functionality), the entire concatenated string is still passed as a bound parameter, maintaining protection.

**Representative Examples:**
- **INSERT operation** (`/app/sku_add.php:10-11`): Parameters bound via array
- **DELETE operation** (`/app/sku_delete.php:7-8`): Single parameter bound via array
- **SELECT with LIKE** (`/app/sku_search.php:9-10`): Wildcards concatenated before binding, entire string safely bound
- **SELECT by ID** (`/app/sku_product_detail.php:9-10`): Integer parameter safely bound

### Pattern 2: Complete Absence of Command Execution Functions

**Description:** A comprehensive search across all 14 PHP files in the application revealed zero usage of system command execution functions. No instances of `shell_exec()`, `exec()`, `system()`, `passthru()`, `popen()`, `proc_open()`, or backtick operators were found.

**Implication:** Without command execution functions, there is no attack surface for command injection vulnerabilities. The application performs all operations through PHP built-in functions and database interactions, never invoking the underlying operating system shell.

**Representative:** N/A - No command execution attack surface exists

### Pattern 3: Hardcoded POST Parameters in SSRF Proxy

**Description:** The SSRF endpoint at `/app/sku_url.php` (lines 24-31) creates a stream context with hardcoded POST parameters `['param1' => 'value1', 'param2' => 'value2']` that are sent to all proxied requests. This architectural design prevents forwarding of attacker-controlled POST parameters to internal service endpoints.

**Implication:** While vulnerabilities exist in the internal service (Path Traversal in `/sku_read`, File Upload in `/sku_process`, Deserialization in `/sku_read`), the SSRF proxy acts as an unintentional barrier. The internal endpoints expect parameters like `file_path` and `data`, but the SSRF only sends `param1` and `param2`, making these vulnerabilities unreachable from the external network (port 8081).

**Representative:** 
- Path Traversal requires `file_path` POST parameter → SSRF sends `param1`/`param2` → Not exploitable
- File Upload requires `data` POST parameter → SSRF sends `param1`/`param2` → Not exploitable

## 3. Strategic Intelligence for Exploitation

### Database Technology Confirmed
- **Database Engine:** SQLite 3 (file-based)
- **Location:** `/var/db/database.db` in webapp container (port 8081)
- **Access Method:** PDO with DSN `sqlite:/var/db/database.db`
- **Authentication:** None (file-based database)
- **Isolation:** Database file exists only in webapp container, NOT accessible from internal service container (port 4455)

**Implication for Exploitation:** Any SQL injection would need to target SQLite-specific syntax. However, all queries use prepared statements, making syntax-specific payloads irrelevant.

### Defensive Posture Analysis

**SQL Injection Defenses:**
- ✅ **PDO Prepared Statements:** Universally applied across all database operations
- ✅ **Parameter Binding:** All user inputs passed via `execute()` array, never concatenated
- ✅ **Consistent Implementation:** No exceptions or edge cases with direct query construction
- ❌ **Input Validation:** Minimal to none, but compensated by strong parameterization
- ❌ **WAF:** No Web Application Firewall detected (not needed given strong code-level defenses)

**Command Injection Defenses:**
- ✅ **No Attack Surface:** Zero command execution functions used
- ✅ **PHP-Only Operations:** All functionality implemented via PHP native functions
- N/A **Input Sanitization for Shell:** Not applicable - no shell interaction

### Network Isolation Architecture

**Key Architectural Components:**
1. **Public-facing webapp** (port 8081): Contains all SQL operations, no command execution
2. **Internal service** (port 4455): Contains file operations and deserialization, NO database connection
3. **Docker network isolation**: 172.0.0.0/8 subnet, enforced by Nginx ACLs
4. **SSRF proxy**: Bypasses network isolation but hardcodes POST parameters

**Critical Observation:** The architectural separation prevents injection attack chains:
- SQL operations are in the webapp (port 8081) with proper defenses
- Vulnerable file operations are in the internal service (port 4455) but isolated from attacker control
- The SSRF bridge between them does NOT forward attacker parameters

## 4. Vectors Analyzed and Confirmed Secure

### SQL Injection Vectors (All SAFE)

| **Source (Parameter/Key)** | **Endpoint/File Location** | **Defense Mechanism Implemented** | **Verdict** |
|----------------------------|---------------------------|-----------------------------------|-------------|
| `sku` | POST `/sku_add.php:6` | PDO Prepared Statement - Positional binding (`?`) in INSERT | SAFE |
| `name` | POST `/sku_add.php:7` | PDO Prepared Statement - Positional binding (`?`) in INSERT | SAFE |
| `description` | POST `/sku_add.php:8` | PDO Prepared Statement - Positional binding (`?`) in INSERT | SAFE |
| `id` | POST `/sku_delete.php:4` | PDO Prepared Statement - Positional binding (`?`) in DELETE WHERE | SAFE |
| `search` | POST `/sku_search.php:7` | PDO Prepared Statement - Wildcards concatenated BEFORE binding, entire string bound as parameter | SAFE |
| `id` | GET `/sku_product_detail.php:5` | PDO Prepared Statement - Positional binding (`?`) in SELECT WHERE | SAFE |

**Analysis Details:**

**1. INSERT Operations (`/sku_add.php`)**
- **Source:** Lines 6-8 read `$_POST['sku']`, `$_POST['name']`, `$_POST['description']`
- **Flow:** Direct assignment → Prepared statement creation (line 10) → Array binding (line 11)
- **Sink:** `$stmt->execute([$sku, $name, $description])`
- **Slot Types:** All three are SQL-val (value slots in VALUES clause)
- **Concatenation:** None - parameters passed directly to execute array
- **Why Safe:** PDO parameter binding treats all input as literal data values, preventing SQL syntax injection

**2. DELETE Operation (`/sku_delete.php`)**
- **Source:** Line 4 reads `$_POST['id']`
- **Flow:** Direct assignment → Prepared statement creation (line 7) → Array binding (line 8)
- **Sink:** `$stmt->execute([$id])`
- **Slot Type:** SQL-num (numeric value in WHERE clause)
- **Concatenation:** None
- **Why Safe:** Parameter binding prevents injection even if `id` contains SQL syntax characters

**3. LIKE Search (`/sku_search.php`)**
- **Source:** Line 7 reads `$_POST['search']` with default empty string
- **Flow:** Direct assignment → Wildcard concatenation (line 10) → Array binding (line 10)
- **Sink:** `$stmt->execute(['%' . $search . '%', '%' . $search . '%'])`
- **Slot Type:** SQL-like (pattern matching in LIKE clauses)
- **Concatenation:** YES - Wildcards concatenated at line 10: `'%' . $search . '%'`
- **Why Safe Despite Concatenation:** The concatenation occurs BEFORE parameter binding. The entire concatenated string (including wildcards and user input) is passed as a single bound parameter. PDO escapes the complete string, so even if user inputs `'; DROP TABLE skus; --`, the database receives the literal string `%'; DROP TABLE skus; --%` as a LIKE pattern, not executable SQL.

**4. SELECT by ID (`/sku_product_detail.php`)**
- **Source:** Line 5 reads `$_GET['id']`
- **Flow:** Direct assignment → Prepared statement creation (line 9) → Array binding (line 10)
- **Sink:** `$stmt->execute([$id])`
- **Slot Type:** SQL-num (integer primary key in WHERE clause)
- **Concatenation:** None
- **Why Safe:** Standard parameter binding prevents injection

### Command Injection Vectors (No Attack Surface)

| **Function Category** | **Search Results** | **Verdict** |
|----------------------|-------------------|-------------|
| Shell execution | `shell_exec()`, `exec()`, `system()`, `passthru()` | Zero instances found |
| Process control | `popen()`, `proc_open()`, `proc_close()` | Zero instances found |
| Backtick operator | `` `command` `` | Zero instances found |
| Other dangerous functions | `pcntl_exec()`, `mail()` with injection risk | Zero instances found |

**Comprehensive Search Methodology:**
- Searched all 14 PHP files in `/app/` directory
- Searched all 5 PHP files in `/app/skumodel-srv/` directory
- Used pattern matching for common command injection sinks
- Verified no dynamic code generation that could lead to command execution

**Conclusion:** With zero command execution functions present in the codebase, there is no code path from user input to operating system commands. Command injection testing is not applicable.

### Out-of-Scope Vulnerabilities (Not SQLi/Command Injection)

The following vulnerabilities were identified during analysis but are OUT OF SCOPE for SQL Injection and Command Injection analysis:

| **Vulnerability Type** | **Location** | **Status** | **External Exploitability** | **Reason for Exclusion** |
|------------------------|-------------|-----------|---------------------------|-------------------------|
| Server-Side Request Forgery (SSRF) | POST `/sku_url.php` - `url` parameter | VULNERABLE | YES - Directly accessible from port 8081 | SSRF is a separate vulnerability class (not SQLi/CMDi) |
| Path Traversal / LFI | POST `/sku_read` - `file_path` parameter | VULNERABLE | NO - SSRF doesn't forward `file_path` parameter | Not externally exploitable; File operations, not SQL/Command |
| Arbitrary File Write | POST `/sku_process` - `data` parameter | VULNERABLE | NO - SSRF doesn't forward `data` parameter | Not externally exploitable; File operations, not SQL/Command |
| Unsafe Deserialization (RCE) | POST `/sku_read` - `file_path` with phar:// wrapper | VULNERABLE | NO - SSRF doesn't forward `file_path` parameter | RCE via eval() in gadget, not command injection; Not externally exploitable |
| Reflected XSS | POST `/sku_url.php` - SSRF response with `\|raw` filter | VULNERABLE | YES - Via SSRF proxy | XSS, not injection |

**Critical Architectural Note:** The internal service vulnerabilities (Path Traversal, File Write, Deserialization) exist in code but are NOT reachable from the external network (port 8081) because:

1. **Network Isolation:** Internal service (port 4455) only accepts connections from Docker network 172.0.0.0/8
2. **SSRF Limitation:** The SSRF at `/app/sku_url.php` can reach the internal service, BUT it hardcodes POST parameters to `['param1' => 'value1', 'param2' => 'value2']` (line 28)
3. **Parameter Mismatch:** Vulnerable endpoints expect:
   - `/sku_read` needs `file_path` parameter
   - `/sku_process` needs `data` parameter
   - SSRF only sends `param1` and `param2`
4. **Result:** Vulnerabilities cannot be triggered from external attackers via port 8081

**Recommendation for Follow-up:** These vulnerabilities should be analyzed by:
- **SSRF Specialist:** Document the SSRF and its limitations
- **File Security Specialist:** Document file-based vulnerabilities for internal threat scenarios
- **Deserialization Specialist:** Document RCE gadget chain for scenarios where parameter forwarding becomes possible

## 5. Analysis Constraints and Blind Spots

### Constraint 1: SSRF POST Parameter Forwarding Uncertainty

**Description:** The analysis determined that the SSRF endpoint (`/app/sku_url.php`) hardcodes POST parameters and does not forward attacker-controlled parameters to internal service endpoints. This conclusion is based on static code analysis of lines 24-31.

**Blind Spot:** Dynamic analysis (live testing) was not performed to confirm whether alternative exploitation techniques could work:
- **HTTP Request Smuggling:** Could an attacker smuggle additional POST parameters through request splitting?
- **Header Injection:** Could injecting CRLF sequences in the `url` parameter modify the POST body?
- **Multipart Form Data:** Could alternative Content-Type headers bypass the hardcoded parameters?
- **URL-Encoded Attacks:** Could special encoding in the URL parameter influence POST data construction?

**Impact on Findings:** If any of these techniques succeed in forwarding attacker-controlled parameters through the SSRF, then:
- Path Traversal in `/sku_read` becomes externally exploitable
- File Upload in `/sku_process` becomes externally exploitable  
- Deserialization chain becomes externally exploitable
- This would escalate from "no externally exploitable injection vulnerabilities" to "critical RCE chain accessible from internet"

**Recommendation:** The Exploitation phase should test whether the SSRF's parameter forwarding can be manipulated through advanced techniques.

### Constraint 2: Stored Procedure and Trigger Analysis

**Description:** The application uses SQLite with a simple schema (single `skus` table). Static analysis confirmed no stored procedures, triggers, or database-side logic exists.

**Blind Spot:** If the database file (`/var/db/database.db`) was pre-populated with SQLite triggers or virtual tables before the pentest, these would not be visible in the application source code.

**Impact on Findings:** Currently assessed as negligible - SQLite triggers cannot execute system commands or arbitrary code, limiting exploitation potential even if present.

### Constraint 3: Third-Party Library Vulnerabilities

**Description:** The application uses Twig templating engine (version 3.10.3) and various Symfony polyfill libraries loaded via Composer.

**Blind Spot:** This analysis focused on application code, not third-party library vulnerabilities. Known CVEs in these dependencies could provide alternative attack vectors.

**Dependencies Not Analyzed:**
- `twig/twig` ^3.20
- Symfony polyfill packages (polyfill-ctype, polyfill-mbstring, polyfill-php80, polyfill-php81)

**Recommendation:** Separate dependency scanning should be performed with tools like `composer audit` or Snyk.

### Constraint 4: PHP Configuration and Runtime Behavior

**Description:** Analysis identified `phar.readonly = Off` configuration in the service container, which enables Phar manipulation. Other PHP configuration directives that could affect security were not comprehensively reviewed.

**Blind Spot:** Runtime PHP configurations that could create injection opportunities:
- `allow_url_include` / `allow_url_fopen` settings
- `disable_functions` / `disable_classes` restrictions
- `open_basedir` restrictions
- `magic_quotes_gpc` (deprecated but relevant for PHP 7.4)
- SQLite-specific `sqlite.assoc_case` or other settings

**Impact on Findings:** Unlikely to change SQL injection conclusions (prepared statements are effective regardless of configuration), but could affect command injection surface if unsafe functions become available.

### Constraint 5: Docker Container Escape Scenarios

**Description:** The analysis scope was limited to application-level injection vulnerabilities within the Docker containers.

**Blind Spot:** Container escape techniques that could make internal service vulnerabilities directly accessible:
- Docker daemon exploitation
- Kernel vulnerabilities (container host runs Linux kernel)
- Volume mount misconfigurations
- Privileged container escalation

**Impact on Findings:** If container escape is possible, the "not externally exploitable" assessment for internal service vulnerabilities becomes invalid.

### Constraint 6: Race Conditions in File Operations

**Description:** The file upload endpoint (`/sku_process`) generates random filenames using `random_bytes(16)`. The deserialization endpoint (`/sku_read`) accepts file paths.

**Blind Spot:** Potential race condition if:
1. Attacker uploads Phar archive → Receives filename `{hash}.jpg`
2. Attacker immediately attempts to trigger deserialization
3. If there's a delay in parameter forwarding or a secondary SSRF vector, timing could enable exploitation

**Impact on Findings:** Currently assessed as theoretical - no evidence of alternative parameter forwarding mechanisms was found.

### Constraint 7: IPv6 and Alternative Protocol Testing

**Description:** The SSRF validation blocks exact strings `'127.0.0.1'` and `'localhost'` but may have bypass opportunities.

**Blind Spot:** Alternative representations not tested during static analysis:
- IPv6 loopback: `http://[::1]:4455/sku_read`
- IPv4 in IPv6: `http://[::ffff:127.0.0.1]:4455/sku_read`
- Octal notation: `http://0177.0.0.1:4455/sku_read`
- Hex notation: `http://0x7f.0x0.0x0.0x1:4455/sku_read`
- DNS rebinding: Domain resolving to `127.0.0.1`

**Impact on Findings:** If bypasses exist, they would affect SSRF exploitability but not change the SQL/Command injection conclusions (as no such vulnerabilities exist in accessible code).

---

## 6. Conclusion

This comprehensive injection analysis confirms that the application's SQL layer is properly secured through consistent use of PDO prepared statements with parameter binding. No command injection attack surface exists due to the complete absence of system command execution functions. 

While file-based vulnerabilities (Path Traversal, Arbitrary File Write, Unsafe Deserialization) exist in the internal service, these are architecturally isolated from external exploitation due to network segmentation and SSRF parameter limitations. These findings assume no advanced SSRF parameter smuggling techniques succeed - a hypothesis that should be tested during the Exploitation phase.

**Final Assessment:** ZERO externally exploitable SQL Injection or Command Injection vulnerabilities identified.
